"""Workspace scanning, one-way source → GDA sync, settings, activity history and previews."""

import base64
import contextlib
import hashlib
import json
import os
import shutil
import stat
import struct
import sys
import threading
import time
import uuid
from collections import OrderedDict
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import TypeVar

from .dds import SUPPORTED_DDS_FORMATS, decode_dds, read_dds_info
from .demo import seed_demo
from .errors import AppError, error_message
from .png import PNG_SIGNATURE

MAX_ASSETS = 10_000
MAX_PREVIEW_BYTES = 64 * 1024 * 1024
PREVIEW_CACHE_SIZE = 16
HISTORY_LIMIT = 100
IMAGE_PREVIEWS = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "svg": "image/svg+xml", "bmp": "image/bmp",
}
ASSET_TYPES = (
    ("texture", {"png", "jpg", "jpeg", "webp", "svg", "dds", "tga", "bmp", "exr", "tif", "tiff"}),
    ("model", {"obj", "fbx", "glb", "gltf", "blend"}),
    ("material", {"mat", "mtl", "material"}),
    ("audio", {"wav", "ogg", "mp3", "flac"}),
)
_JUNCTION = 0xA0000003  # IO_REPARSE_TAG_MOUNT_POINT: Windows directory junctions behave like links.
_HIDDEN = 0x2  # FILE_ATTRIBUTE_HIDDEN
_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
T = TypeVar("T")


def _portable(relative: str) -> str:
    return relative.replace(os.sep, "/")


def asset_id(relative: str) -> str:
    """A URL-safe ID that is identical for native and portable separators."""
    return base64.urlsafe_b64encode(_portable(relative).encode("utf-8", "surrogateescape")).rstrip(b"=").decode()


def type_for(extension: str) -> str:
    return next((name for name, extensions in ASSET_TYPES if extension in extensions), "other")


def iso_time(nanoseconds: int | None = None) -> str:
    """Millisecond-precision UTC timestamp, like JavaScript's toISOString()."""
    milliseconds = (nanoseconds if nanoseconds is not None else time.time_ns()) // 1_000_000
    moment = _EPOCH + timedelta(milliseconds=milliseconds)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{milliseconds % 1000:03d}Z"


def contained(root: str, file: str) -> bool:
    """Whether file is root or inside it."""
    try:
        relative = os.path.relpath(file, root)
    except ValueError:  # Different Windows drives.
        return False
    return not os.path.isabs(relative) and relative != os.pardir and not relative.startswith(os.pardir + os.sep)


def _is_link(info: os.stat_result) -> bool:
    return stat.S_ISLNK(info.st_mode) or getattr(info, "st_reparse_tag", 0) == _JUNCTION


def _is_hidden(entry: os.DirEntry) -> bool:
    if entry.name.startswith("."):
        return True
    if sys.platform == "win32":
        try:
            return bool(entry.stat(follow_symlinks=False).st_file_attributes & _HIDDEN)
        except OSError:
            return False
    return False


def _valid_name(name: str) -> bool:
    try:
        name.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True


def file_hash(file: str) -> str:
    digest = hashlib.sha256()
    with open(file, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _copy_exclusive(source: str, target: str) -> None:
    """Copy file bytes into a new file; fails if target already exists."""
    with open(source, "rb") as reader, open(target, "xb") as writer:
        shutil.copyfileobj(reader, writer, 1024 * 1024)


def safe_path(root: str, relative: str, create_parents: bool = False) -> str:
    """Resolve relative inside root, rejecting traversal and symbolic links along the way."""
    if not relative or os.path.isabs(relative):
        raise AppError("Invalid asset path")
    target = os.path.normpath(os.path.join(root, relative))
    if not contained(root, target) or target == os.path.normpath(root):
        raise AppError("Invalid asset path")
    parts = os.path.relpath(target, root).split(os.sep)
    current = root
    for index, part in enumerate(parts):
        current = os.path.join(current, part)
        last = index == len(parts) - 1
        try:
            info = os.lstat(current)
        except FileNotFoundError:
            if create_parents and not last:
                os.mkdir(current)
            continue
        if _is_link(info):
            raise AppError("Symbolic links are not supported")
        if not last and not stat.S_ISDIR(info.st_mode):
            raise AppError("An asset parent is not a folder")
    return target


class Library:
    def __init__(self, home: str, *, config_path: str | None = None):
        self.home = os.path.abspath(home)
        self.config_path = os.path.abspath(config_path or os.path.join(self.home, "workspace.json"))
        self.config: dict = {}
        self.activity: list[dict] = []
        self._operation = threading.Lock()
        self._previews: OrderedDict[str, bytes] = OrderedDict()
        self._previews_lock = threading.Lock()
        self._scanned_assets: list[dict] | None = None

    @property
    def busy(self) -> bool:
        return self._operation.locked()

    def init(self) -> None:
        os.makedirs(self.home, exist_ok=True)
        try:
            self.config = self._read_config(self.config_path)
        except FileNotFoundError:
            # Keep an existing user's connection when first adopting a project-local or packaged configuration.
            persisted = os.path.join(self.home, "workspace.json")
            try:
                self.config = self._read_config(persisted)
            except FileNotFoundError:
                self.config = seed_demo(self.home)
            self._save_config()
        try:
            with open(os.path.join(self.home, "activity.json"), encoding="utf-8") as handle:
                self.activity = json.load(handle)
        except FileNotFoundError:
            pass

    def _read_config(self, file: str) -> dict:
        try:
            with open(file, encoding="utf-8-sig") as handle:
                config = json.load(handle)
            if not isinstance(config, dict) or not all(isinstance(config.get(key), str) for key in ("name", "source", "destination")):
                raise TypeError("Expected name, source and destination text fields")
            if not isinstance(config.get("demo", False), bool):
                raise TypeError("demo must be true or false")
            settings = self._validated_settings(config["name"], config["source"], config["destination"])
            result = {**settings, "demo": config.get("demo", False)}
            if "port" in config:
                result["port"] = config["port"]
            return result
        except FileNotFoundError:
            raise
        except (OSError, ValueError, TypeError, AppError) as error:
            raise RuntimeError(
                f"Could not read workspace.json ({file}). Fix the configuration before starting: {error_message(error)}"
            ) from error

    def _validated_settings(self, name: str, source: str, destination: str) -> dict[str, str]:
        if not name.strip() or len(name) > 80:
            raise AppError("Enter a project name of 1–80 characters")
        if not os.path.isabs(source) or not os.path.isabs(destination):
            raise AppError("Use absolute folder paths")
        try:
            real_source = os.path.realpath(source, strict=True)
            real_destination = os.path.realpath(destination, strict=True)
        except OSError as error:
            raise AppError("Both folders must exist before you connect them") from error
        if not os.path.isdir(real_source) or not os.path.isdir(real_destination):
            raise AppError("Both paths must be folders")
        if contained(real_source, real_destination) or contained(real_destination, real_source):
            raise AppError("Source and GDA folders must be separate, without nesting")
        if contained(real_source, self.home) or contained(real_destination, self.home):
            raise AppError("Choose folders outside the application data directory’s parents")
        if not os.access(real_source, os.R_OK) or not os.access(real_destination, os.W_OK):
            raise AppError("The source must be readable and the GDA folder must be writable")
        return {"name": name.strip(), "source": real_source, "destination": real_destination}

    @property
    def backup_path(self) -> str:
        return os.path.join(self.home, "backups")

    def _write_json(self, file: str, data: object) -> None:
        folder = os.path.dirname(file)
        os.makedirs(folder, exist_ok=True)
        temporary = os.path.join(folder, f".{os.path.basename(file)}-{uuid.uuid4()}")
        try:
            with open(temporary, "w", encoding="utf-8") as handle:
                json.dump(data, handle, indent=2, ensure_ascii=False)
            os.replace(temporary, file)
        except BaseException:
            if os.path.exists(temporary):
                os.unlink(temporary)
            raise

    def _save_config(self) -> None:
        self._write_json(self.config_path, self.config)

    def _record(self, action: str, message: str, files: list[str] | None = None, size: int | None = None) -> None:
        entry: dict = {"id": str(uuid.uuid4()), "date": iso_time(), "action": action, "message": message, "files": files or []}
        if size is not None:
            entry["bytes"] = size
        self.activity = [entry, *self.activity][:HISTORY_LIMIT]
        self._write_json(os.path.join(self.home, "activity.json"), self.activity)

    def _exclusive(self, operation: Callable[[], T]) -> T:
        if not self._operation.acquire(blocking=False):
            raise AppError("Another workspace operation is in progress. Try again shortly.", 409)
        try:
            return operation()
        finally:
            self._operation.release()

    def wait_for_idle(self) -> None:
        """Block until a running workspace operation finishes, even if its HTTP request disconnected."""
        with self._operation:
            pass

    def scan(self) -> dict:
        config = dict(self.config)
        assets: list[dict] = []
        warnings: list[str] = []

        def walk(folder: str) -> None:
            with os.scandir(os.path.join(config["source"], folder)) as iterator:
                entries = sorted(iterator, key=lambda entry: entry.name)
            for entry in entries:
                if _is_hidden(entry):
                    continue
                relative = os.path.join(folder, entry.name) if folder else entry.name
                if not _valid_name(entry.name):
                    warnings.append(f"Skipped a file with an unreadable name in {_portable(folder) or 'Root'}")
                    continue
                if entry.is_symlink() or (sys.platform == "win32" and _is_link(entry.stat(follow_symlinks=False))):
                    warnings.append(f"Skipped symbolic link: {relative}")
                    continue
                if entry.is_dir(follow_symlinks=False):
                    walk(relative)
                    continue
                if not entry.is_file(follow_symlinks=False):
                    continue
                if len(assets) >= MAX_ASSETS:
                    raise AppError("This demo supports up to 10,000 files per workspace")
                try:
                    assets.append(self._describe(config, folder, relative, entry.name))
                except Exception as error:
                    warnings.append(f"{relative}: {error_message(error)}")

        walk("")
        # Give the demo an intentional order; real workspaces are sorted by recent changes.
        assets.sort(key=lambda asset: asset["modifiedAt"], reverse=True)
        self._scanned_assets = assets
        return {
            "assets": assets, "config": config, "activity": self.activity, "scannedAt": iso_time(),
            "warnings": warnings, "backupPath": self.backup_path,
        }

    def _describe(self, config: dict, folder: str, relative: str, name: str) -> dict:
        file = safe_path(config["source"], relative)
        info = os.stat(file)
        extension = os.path.splitext(relative)[1][1:].lower()
        target = safe_path(config["destination"], relative)
        status = "new"
        try:
            destination = os.stat(target)
        except FileNotFoundError:
            pass
        else:
            if not stat.S_ISREG(destination.st_mode):
                raise AppError("The destination is not a regular file")
            same = info.st_size == destination.st_size and file_hash(file) == file_hash(target)
            status = "synced" if same else "modified"
        asset: dict = {
            "id": asset_id(relative), "name": name, "path": _portable(relative), "folder": _portable(folder) or "Root",
            "extension": extension, "type": type_for(extension), "status": status, "size": info.st_size,
            "modifiedAt": iso_time(info.st_mtime_ns), "preview": extension in IMAGE_PREVIEWS,
        }
        if extension in ("dds", "png"):
            with open(file, "rb") as handle:
                header = handle.read(148)
            try:
                if extension == "dds":
                    dimensions = read_dds_info(header)
                    asset["dimensions"] = dimensions
                    asset["preview"] = dimensions["format"] in SUPPORTED_DDS_FORMATS
                    if not asset["preview"]:
                        asset["previewError"] = f"Preview unavailable for {dimensions['format']}. The original file can still be synced."
                elif header.startswith(PNG_SIGNATURE):
                    width, height = struct.unpack_from(">II", header.ljust(24, b"\0"), 16)
                    asset["dimensions"] = {"width": width, "height": height, "format": "RGBA"}
            except ValueError as error:
                asset["preview"] = False
                asset["previewError"] = str(error)
        model_preview = os.path.join(config["source"], ".previews", asset["id"] + ".svg")
        if config["demo"] and asset["type"] == "model" and os.path.isfile(model_preview):
            asset["preview"] = True
        return asset

    def rescan(self) -> dict:
        def operation() -> dict:
            result = self.scan()
            self._record("scan", f"Scanned {len(result['assets'])} assets")
            return {**result, "activity": self.activity}

        return self._exclusive(operation)

    def update_config(self, name: str, source: str, destination: str) -> dict:
        def operation() -> dict:
            settings = self._validated_settings(name, source, destination)
            previous = self.config
            demo = settings["source"] == previous["source"] and settings["destination"] == previous["destination"] and previous["demo"]
            self.config = {**previous, **settings, "demo": demo}
            try:
                self._save_config()
            except BaseException:
                self.config = previous
                raise
            with self._previews_lock:
                self._previews.clear()
            self._scanned_assets = None
            self._record("settings", f"Connected {self.config['name']} workspace")
            return self.scan()

        return self._exclusive(operation)

    def sync(self, ids: list[str]) -> dict:
        def operation() -> dict:
            assets = self.scan()["assets"]
            wanted = list(dict.fromkeys(ids))
            lookup = {asset["id"]: asset for asset in assets}
            if any(asset_id not in lookup for asset_id in wanted):
                raise AppError("An asset no longer exists. Rescan your library and try again.")
            config, operation_id = self.config, str(uuid.uuid4())
            copied: list[str] = []
            failures: list[dict] = []
            total = 0
            for asset in (lookup[asset_id] for asset_id in wanted):
                if asset["status"] == "synced":
                    continue
                temporary = None
                try:
                    source = safe_path(config["source"], asset["path"])
                    target = safe_path(config["destination"], asset["path"], create_parents=True)
                    original_hash = file_hash(source)
                    temporary = os.path.join(os.path.dirname(target), f".gda-sync-{uuid.uuid4()}.tmp")
                    _copy_exclusive(source, temporary)
                    if file_hash(temporary) != original_hash or file_hash(source) != original_hash:
                        raise AppError("Source changed while copying. Please retry.")
                    # Check again immediately before replacing. Existing GDA files have a recoverable backup.
                    safe_path(config["destination"], asset["path"])
                    try:
                        existing = os.lstat(target)
                    except FileNotFoundError:
                        pass
                    else:
                        if not stat.S_ISREG(existing.st_mode):
                            raise AppError("The destination is not a regular file")
                        backup = os.path.join(self.backup_path, operation_id, *asset["path"].split("/"))
                        os.makedirs(os.path.dirname(backup), exist_ok=True)
                        _copy_exclusive(target, backup)
                    os.replace(temporary, target)
                    temporary = None
                    copied.append(asset["path"])
                    total += asset["size"]
                except Exception as error:
                    failures.append({"name": asset["name"], "message": error_message(error)})
                finally:
                    if temporary:
                        with contextlib.suppress(OSError):
                            os.unlink(temporary)
            if copied:
                self._record("sync", f"Synced {len(copied)} asset{'' if len(copied) == 1 else 's'} to GDA", copied, total)
            return {"copied": copied, "failures": failures, "bytes": total, "library": self.scan()}

        return self._exclusive(operation)

    def get_asset(self, asset_id: str) -> dict:
        assets = self._scanned_assets if self._scanned_assets is not None else self.scan()["assets"]
        for asset in assets:
            if asset["id"] == asset_id:
                return asset
        raise AppError("Asset not found", 404)

    def preview(self, asset: dict) -> tuple[bytes, str]:
        if not asset["preview"]:
            raise AppError(asset.get("previewError") or "No image preview for this asset", 415)
        config = self.config
        if asset["type"] == "model" and config["demo"]:
            with open(os.path.join(config["source"], ".previews", asset["id"] + ".svg"), "rb") as handle:
                return handle.read(), "image/svg+xml"
        file = safe_path(config["source"], asset["path"])
        if os.stat(file).st_size > MAX_PREVIEW_BYTES:
            raise AppError("Preview is limited to files smaller than 64 MB", 413)
        if asset["extension"] == "dds":
            key = f"{file}:{asset['modifiedAt']}:{asset['size']}"
            with self._previews_lock:
                data = self._previews.get(key)
            if data is None:
                try:
                    with open(file, "rb") as handle:
                        data = decode_dds(handle.read())
                except Exception as error:
                    raise AppError(error_message(error), 415) from error
                with self._previews_lock:
                    while len(self._previews) >= PREVIEW_CACHE_SIZE:
                        self._previews.popitem(last=False)
                    self._previews[key] = data
            return data, "image/png"
        with open(file, "rb") as handle:
            return handle.read(), IMAGE_PREVIEWS.get(asset["extension"], "application/octet-stream")
