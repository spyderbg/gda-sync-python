"""Workspace scanning, one-way GDA → Game sync, settings, activity history and previews.

The "source" of a workspace is the folder files are copied from (the GDA folder, gda_path in workspace.json) and its
"destination" is the folder they are copied to (the game folder, game_path).
"""

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
from .rss_jobs import SyncJobs
from .rss_sync import DEFAULT_EXTENSIONS

MAX_ASSETS = 10_000
MAX_PREVIEW_BYTES = 64 * 1024 * 1024
PREVIEW_CACHE_SIZE = 16
HISTORY_LIMIT = 100
IMAGE_PREVIEWS = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "svg": "image/svg+xml", "bmp": "image/bmp",
}
# The audio files of the GDA sync report that the browser plays as they are.
AUDIO_PREVIEWS = {"wav": "audio/wav", "ogg": "audio/ogg", "mp3": "audio/mpeg", "flac": "audio/flac"}
ASSET_TYPES = (
    ("texture", {"png", "jpg", "jpeg", "webp", "svg", "dds", "tga", "bmp", "exr", "tif", "tiff"}),
    ("model", {"obj", "fbx", "glb", "gltf", "blend"}),
    ("material", {"mat", "mtl", "material"}),
    ("audio", {"wav", "ogg", "mp3", "flac"}),
)
FOLDER_NAMES = {"source": "GDA", "destination": "Game"}
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


def image_dimensions(file: str, extension: str) -> dict | None:
    """The width, height and pixel format of a DDS or PNG file, read from its header, with a DDS file's mip levels; None
    for any other file. A DDS header that cannot be read raises ValueError."""
    if extension not in ("dds", "png"):
        return None
    with open(file, "rb") as handle:
        header = handle.read(148)
    if extension == "dds":
        return read_dds_info(header)
    if header.startswith(PNG_SIGNATURE):
        width, height = struct.unpack_from(">II", header.ljust(24, b"\0"), 16)
        return {"width": width, "height": height, "format": "RGBA"}
    return None


def _copy_exclusive(source: str, target: str) -> None:
    """Copy file bytes into a new file; fails if target already exists."""
    with open(source, "rb") as reader, open(target, "xb") as writer:
        shutil.copyfileobj(reader, writer, 1024 * 1024)


def _replace_file(source: str, target_root: str, relative: str, backup: str, create_parents: bool = False) -> None:
    """Copy source over target_root/relative through a verified temporary file; an existing target is saved to backup first."""
    target = safe_path(target_root, relative, create_parents)
    original_hash = file_hash(source)
    temporary = os.path.join(os.path.dirname(target), f".egt-gda-sync-{uuid.uuid4()}.tmp")
    try:
        _copy_exclusive(source, temporary)
        if file_hash(temporary) != original_hash or file_hash(source) != original_hash:
            raise AppError("Source changed while copying. Please retry.")
        # Check again immediately before replacing. Existing game files have a recoverable backup.
        safe_path(target_root, relative)
        try:
            existing = os.lstat(target)
        except FileNotFoundError:
            pass
        else:
            if not stat.S_ISREG(existing.st_mode):
                raise AppError("The destination is not a regular file")
            os.makedirs(os.path.dirname(backup), exist_ok=True)
            _copy_exclusive(target, backup)
        os.replace(temporary, target)
        temporary = None
    finally:
        if temporary:
            with contextlib.suppress(OSError):
                os.unlink(temporary)


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
        self.reports = SyncJobs(os.path.join(self.home, "sync-reports"))

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
            if isinstance(config, dict) and "workspaces" in config:
                global_config = config.get("config", {})
                if not isinstance(global_config, dict):
                    raise TypeError("config must be an object")
                # Accept older files with global ports at the top level.
                global_config = {**{key: config[key] for key in ("port", "vite_port") if key in config}, **global_config}
                entries = config["workspaces"]
                if not isinstance(entries, list) or not entries:
                    raise TypeError("workspaces must be a non-empty list")
                workspaces = []
                for entry in entries:
                    if not isinstance(entry, dict) or not isinstance(entry.get("id"), str) or not entry["id"].strip():
                        raise TypeError("Each workspace needs a non-empty text id")
                    source = entry.get("gda_path", entry.get("source"))
                    destination = entry.get("game_path", entry.get("destination"))
                    name = entry.get("game_name", entry.get("name"))
                    if not all(isinstance(value, str) for value in (name, source, destination)):
                        raise TypeError("Each workspace needs game_name, game_path and gda_path text fields")
                    if not isinstance(entry.get("demo", False), bool):
                        raise TypeError("demo must be true or false")
                    # Keep the API's name/source/destination fields while using the new names on disk.
                    workspace = {key: value for key, value in entry.items() if key not in ("game_name", "game_path", "gda_path")}
                    workspaces.append({**workspace, **self._validated_settings(name, source, destination), "demo": entry.get("demo", False)})
                if len({entry["id"] for entry in workspaces}) != len(workspaces):
                    raise TypeError("Workspace ids must be unique")
                active = config.get("defaultWorkspace", config.get("activeWorkspace", workspaces[0]["id"]))
                selected = next((entry for entry in workspaces if entry["id"] == active), None)
                if selected is None:
                    raise TypeError("defaultWorkspace must identify a configured workspace")
                extras = {key: value for key, value in config.items() if key not in ("port", "vite_port", "activeWorkspace")}
                return {**extras, "config": global_config, **{key: selected[key] for key in ("name", "source", "destination", "demo")},
                        "workspaces": workspaces, "defaultWorkspace": active}
            if not isinstance(config, dict) or not all(isinstance(config.get(key), str) for key in ("name", "source", "destination")):
                raise TypeError("Expected name, source and destination text fields")
            if not isinstance(config.get("demo", False), bool):
                raise TypeError("demo must be true or false")
            settings = self._validated_settings(config["name"], config["source"], config["destination"])
            result = {**settings, "demo": config.get("demo", False)}
            for key in ("port", "vite_port"):
                if key in config:
                    result[key] = config[key]
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
        # A folder may not exist yet, or its drive may be unplugged: the app starts anyway and warns about it.
        real_source = os.path.realpath(source)
        real_destination = os.path.realpath(destination)
        if any(os.path.exists(path) and not os.path.isdir(path) for path in (real_source, real_destination)):
            raise AppError("Both paths must be folders")
        if contained(real_source, real_destination) or contained(real_destination, real_source):
            raise AppError("GDA and Game folders must be separate, without nesting")
        if contained(real_source, self.home) or contained(real_destination, self.home):
            raise AppError("Choose folders outside the application data directory’s parents")
        if (os.path.isdir(real_source) and not os.access(real_source, os.R_OK)) or \
                (os.path.isdir(real_destination) and not os.access(real_destination, os.W_OK)):
            raise AppError("The GDA folder must be readable and the Game folder must be writable")
        return {"name": name.strip(), "source": real_source, "destination": real_destination}

    def missing_folders(self) -> list[str]:
        """The active workspace's folders ("source", "destination") that are not folders on disk right now."""
        return [key for key in FOLDER_NAMES if not os.path.isdir(self.config[key])]

    def require_folders(self, *keys: str) -> None:
        missing = [key for key in self.missing_folders() if key in keys]
        if missing:
            names = " and ".join(FOLDER_NAMES[key] for key in missing)
            raise AppError(f"The {names} folder{'s do' if len(missing) > 1 else ' does'} not exist. Fix the path in Workspace settings.", 404)

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
        config = self.config
        if "workspaces" in config:
            config = {
                "config": config["config"],
                **{key: value for key, value in config.items() if key not in ("config", "name", "source", "destination", "demo", "workspaces")},
                "workspaces": [
                    {**{key: value for key, value in entry.items() if key not in ("name", "source", "destination")},
                     "game_name": entry["name"], "game_path": entry["destination"], "gda_path": entry["source"]}
                    for entry in config["workspaces"]
                ],
            }
        self._write_json(self.config_path, config)

    def _record(self, action: str, message: str, files: list[str] | None = None, size: int | None = None) -> None:
        entry: dict = {"id": str(uuid.uuid4()), "date": iso_time(), "action": action, "message": message, "files": files or []}
        if size is not None:
            entry["bytes"] = size
        # Sync history shows every copy, so only rescans and settings changes are capped.
        others = 0
        kept = []
        for item in (entry, *self.activity):
            if item["action"] != "sync":
                others += 1
                if others > HISTORY_LIMIT:
                    continue
            kept.append(item)
        self.activity = kept
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
        scanned = self._scan_workspace(config)
        self._scanned_assets = scanned["assets"]
        return {
            **scanned, "config": config, "activity": self.activity, "scannedAt": iso_time(),
            "backupPath": self.backup_path, "rssSync": self.rss_status(),
        }

    def _scan_workspace(self, config: dict) -> dict:
        """Describe one workspace without changing the selected workspace or its preview cache."""
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

        missing = [key for key in FOLDER_NAMES if not os.path.isdir(config[key])]
        if "source" not in missing:
            walk("")
        # Give the demo an intentional order; real workspaces are sorted by recent changes.
        assets.sort(key=lambda asset: asset["modifiedAt"], reverse=True)
        return {"assets": assets, "warnings": warnings, "missingFolders": missing}

    def dashboard(self) -> dict:
        """Read all configured workspaces together, leaving workspace selection and file operations untouched."""
        config = dict(self.config)
        entries = config.get("workspaces") or [{**config, "id": "current"}]
        assets, workspaces, warnings = [], [], []
        for entry in entries:
            workspace = {key: entry[key] for key in ("id", "name", "source", "destination", "demo")}
            workspace["missingFolders"] = [key for key in FOLDER_NAMES if not os.path.isdir(entry[key])]
            try:
                scanned = self._scan_workspace(entry)
            except (AppError, OSError) as error:
                workspace["error"] = error_message(error)
                warnings.append(f"{entry['name']}: {workspace['error']}")
            else:
                assets.extend({**asset, "workspaceId": entry["id"], "workspaceName": entry["name"]} for asset in scanned["assets"])
                warnings.extend(f"{entry['name']}: {warning}" for warning in scanned["warnings"])
            for key in workspace["missingFolders"]:
                warnings.append(f"{entry['name']}: {FOLDER_NAMES[key]} folder does not exist")
            workspaces.append(workspace)
        assets.sort(key=lambda asset: asset["modifiedAt"], reverse=True)
        return {"assets": assets, "workspaces": workspaces, "activity": list(self.activity), "scannedAt": iso_time(), "warnings": warnings}

    def _active_workspace(self) -> tuple[str, dict]:
        """The selected workspace's id and entry; a single-workspace configuration is the entry itself."""
        workspace_id = self.config.get("defaultWorkspace") or "current"
        entry = next((entry for entry in self.config.get("workspaces", []) if entry["id"] == workspace_id), self.config)
        return workspace_id, entry

    def _comparison(self, workspace_id: str, entry: dict) -> tuple[dict, dict]:
        """The workspace settings a run uses, named as in workspace.json with defaults filled in, and the GDA sync
        settings made from them: game_path is <resources_dir>/<game>, and gda_path is gda_dir."""
        common = entry.get("common_gda_path")
        if isinstance(common, str) and common and not os.path.isabs(common):
            common = os.path.join(os.path.dirname(self.config_path), common)
        workspace = {
            "id": workspace_id, "game_name": entry["name"], "game_path": entry["destination"], "gda_path": entry["source"],
            "common_gda_path": common, "extensions": entry.get("extensions", list(DEFAULT_EXTENSIONS)),
            "resource_paths": entry.get("resource_paths", []), "ignore_dds_mips": entry.get("ignore_dds_mips", True),
        }
        settings = {
            "resources_dir": os.path.dirname(workspace["game_path"]), "game": os.path.basename(workspace["game_path"]),
            "gda_dir": workspace["gda_path"], "common_gda_dir": common, "extensions": workspace["extensions"],
            "resource_paths": workspace["resource_paths"], "ignore_dds_mips": workspace["ignore_dds_mips"],
        }
        return workspace, settings

    def rss_status(self) -> dict:
        return self.reports.status(self._active_workspace()[0])

    def rss_history(self) -> dict:
        workspace_id, entry = self._active_workspace()
        return {"workspaceId": workspace_id, "workspace": self._comparison(workspace_id, entry)[0], "history": self.reports.history(workspace_id)}

    def rss_report(self) -> bytes:
        report = self.reports.report(self._active_workspace()[0])
        if report is None:
            raise AppError("This workspace has no GDA sync report yet. Click Rescan to create one.", 404)
        return report

    def start_comparison(self) -> None:
        workspace_id, entry = self._active_workspace()
        self.reports.start(workspace_id, *self._comparison(workspace_id, entry))

    def workspace_entries(self) -> list[tuple[str, dict]]:
        """Every workspace's id and entry, in the order of workspace.json."""
        workspaces = self.config.get("workspaces")
        return [(entry["id"], entry) for entry in workspaces] if workspaces else [("current", self.config)]

    def compare_workspace(self, workspace_id: str, progress: Callable[[str, int, int], None] | None = None) -> dict:
        """Run a workspace's GDA sync in this process and save its report, without the app; return the run."""
        entry = dict(self.workspace_entries()).get(workspace_id)
        if entry is None:
            raise AppError(f"Workspace not found: {workspace_id}", 404)
        return self.reports.run(workspace_id, *self._comparison(workspace_id, entry), progress)

    def close(self) -> None:
        self.reports.stop_all()

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
        try:
            dimensions = image_dimensions(file, extension)
        except ValueError as error:
            asset["preview"] = False
            asset["previewError"] = str(error)
        else:
            if dimensions:
                asset["dimensions"] = dimensions
            if dimensions and extension == "dds":
                asset["preview"] = dimensions["format"] in SUPPORTED_DDS_FORMATS
                if not asset["preview"]:
                    asset["previewError"] = f"Preview unavailable for {dimensions['format']}. The original file can still be synced."
        model_preview = os.path.join(config["source"], ".previews", asset["id"] + ".svg")
        if config["demo"] and asset["type"] == "model" and os.path.isfile(model_preview):
            asset["preview"] = True
        return asset

    def rescan(self) -> dict:
        def operation() -> dict:
            result = self.scan()
            self._record("scan", f"Scanned {len(result['assets'])} assets")
            # The GDA sync compares thousands of files, so it runs in its own process after the scan.
            self.start_comparison()
            return {**result, "activity": self.activity, "rssSync": self.rss_status()}

        return self._exclusive(operation)

    def update_config(self, name: str, source: str, destination: str) -> dict:
        def operation() -> dict:
            settings = self._validated_settings(name, source, destination)
            previous = self.config
            demo = settings["source"] == previous["source"] and settings["destination"] == previous["destination"] and previous["demo"]
            self.config = {**previous, **settings, "demo": demo}
            if "workspaces" in previous:
                self.config["workspaces"] = [
                    {**entry, **settings, "demo": demo} if entry["id"] == previous["defaultWorkspace"] else entry
                    for entry in previous["workspaces"]
                ]
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

    def select_workspace(self, workspace_id: str) -> dict:
        def operation() -> dict:
            # Preserve the latest configuration when saving a selection.
            previous = self.config
            current = self._read_config(self.config_path)
            entry = next((entry for entry in current.get("workspaces", []) if entry["id"] == workspace_id), None)
            if entry is None:
                raise AppError("Workspace not found", 404)
            self.config = {**current, **{key: entry[key] for key in ("name", "source", "destination", "demo")}, "defaultWorkspace": workspace_id}
            try:
                self._save_config()
            except BaseException:
                self.config = previous
                raise
            with self._previews_lock:
                self._previews.clear()
            self._scanned_assets = None
            return self.scan()

        return self._exclusive(operation)

    def sync(self, ids: list[str]) -> dict:
        def operation() -> dict:
            self.require_folders("source", "destination")
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
                try:
                    backup = os.path.join(self.backup_path, operation_id, *asset["path"].split("/"))
                    _replace_file(safe_path(config["source"], asset["path"]), config["destination"], asset["path"], backup, create_parents=True)
                    copied.append(asset["path"])
                    total += asset["size"]
                except Exception as error:
                    failures.append({"name": asset["name"], "message": error_message(error)})
            if copied:
                self._record("sync", f"Synced {len(copied)} asset{'' if len(copied) == 1 else 's'} to Game", copied, total)
            return {"copied": copied, "failures": failures, "bytes": total, "library": self.scan()}

        return self._exclusive(operation)

    def sync_resources(self, ids: list[str]) -> dict:
        """Copy the closest GDA file of each chosen "different" resource of the GDA sync report over the game resource,
        or of each different frame of an image sequence, then compare again, since the report lists a copied resource
        as different until the next run."""
        def operation() -> dict:
            workspace_id, entry = self._active_workspace()
            if self.reports.status(workspace_id)["running"]:
                raise AppError("The GDA sync is still comparing. Wait for it to finish and try again.", 409)
            report = self.reports.report(workspace_id)
            if report is None:
                raise AppError("This workspace has no GDA sync report yet. Click Rescan to create one.", 404)
            rows = {row["id"]: row for row in json.loads(report).get("differences", [])}
            wanted = list(dict.fromkeys(ids))
            if any(row_id not in rows for row_id in wanted):
                raise AppError("A resource is no longer in the GDA sync report. Rescan and try again.")
            if any(rows[row_id]["category"] != "different" or not rows[row_id]["gdaFiles"] for row_id in wanted):
                raise AppError("Only a resource that differs from its GDA file can be synced")
            settings = self._comparison(workspace_id, entry)[1]
            # The report is data: copy only from the workspace's GDA folders into its resources folder.
            resources = os.path.realpath(settings["resources_dir"])
            gda_roots = [os.path.realpath(root) for root in (settings["gda_dir"], settings["common_gda_dir"]) if root]
            # The game files to replace, each once with the resource it belongs to: the frames of a sequence can
            # repeat a file.
            files = {
                file["resourcePath"]: (row["id"], file)
                for row in (rows[row_id] for row_id in wanted)
                for file in (row["sequence"]["frames"] if "sequence" in row else [row])
                if file["category"] == "different" and file["gdaFiles"]
            }
            operation_id = str(uuid.uuid4())
            copied: list[str] = []
            synced: set[str] = set()
            failures: list[dict] = []
            total = 0
            for row_id, file in files.values():
                try:
                    source, target = file["gdaFiles"][0]["absolutePath"], file["resourcePath"]
                    root = next((root for root in gda_roots if contained(root, source)), None)
                    if root is None or not contained(resources, target):
                        raise AppError("The files are outside the workspace folders")
                    source = safe_path(root, os.path.relpath(source, root))
                    relative = os.path.relpath(target, resources)
                    target = safe_path(resources, relative)
                    if os.path.isfile(target) and file_hash(source) == file_hash(target):
                        continue
                    size = os.path.getsize(source)
                    _replace_file(source, resources, relative, os.path.join(self.backup_path, operation_id, relative))
                    copied.append(file["resource"])
                    synced.add(row_id)
                    total += size
                except Exception as error:
                    failures.append({"name": os.path.basename(file["resource"]), "message": error_message(error)})
            if copied:
                self._record("sync", f"Synced {len(synced)} resource{'' if len(synced) == 1 else 's'} to Game", copied, total)
            if len(failures) < len(files):
                self.start_comparison()
            # A sequence is one resource however many of its files were copied.
            return {"copied": copied, "resources": len(synced), "failures": failures, "bytes": total, "library": self.scan()}

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
        return self._media(safe_path(config["source"], asset["path"]), asset["extension"])

    def _resource_path(self, file: str) -> str:
        """Resolve a report file inside the active workspace's game, GDA or common GDA folders."""
        workspace_id, entry = self._active_workspace()
        settings = self._comparison(workspace_id, entry)[1]
        roots = [os.path.realpath(root) for root in (settings["resources_dir"], settings["gda_dir"], settings["common_gda_dir"]) if root]
        root = next((root for root in roots if os.path.isabs(file) and contained(root, file)), None)
        if root is None:
            raise AppError("File not found", 404)
        return safe_path(root, os.path.relpath(file, root))

    def resource_folder(self, file: str) -> str:
        """The existing parent directory of a report file, including a missing file or sequence pattern."""
        folder = os.path.dirname(self._resource_path(file))
        if not os.path.isdir(folder):
            raise AppError("Folder does not exist", 404)
        return folder

    def resource_details(self, files: list[str]) -> dict:
        """The size, modification time and image dimensions of files the GDA sync report names, by path. Only files
        inside the active workspace's resources and GDA folders are read; any other path, or a file that does not
        exist, has only an error."""
        details: dict[str, dict] = {}
        for file in dict.fromkeys(files):
            try:
                path = self._resource_path(file)
                info = os.stat(path)
            except (AppError, OSError):
                details[file] = {"error": "File not found"}
                continue
            if not stat.S_ISREG(info.st_mode):
                details[file] = {"error": "Not a file"}
                continue
            entry: dict = {"size": info.st_size, "modifiedAt": iso_time(info.st_mtime_ns)}
            try:
                dimensions = image_dimensions(path, os.path.splitext(path)[1][1:].lower())
            except (OSError, ValueError) as error:
                entry["dimensionsError"] = error_message(error)
            else:
                if dimensions:
                    entry["dimensions"] = dimensions
            details[file] = entry
        return {"files": details}

    def resource_preview(self, file: str) -> tuple[bytes, str]:
        """Preview an image, or an audio file to play, inside the active workspace's resources and GDA folders."""
        file = self._resource_path(file)
        extension = os.path.splitext(file)[1][1:].lower()
        if extension != "dds" and extension not in IMAGE_PREVIEWS and extension not in AUDIO_PREVIEWS:
            raise AppError("No preview for this file", 415)
        try:
            return self._media(file, extension)
        except FileNotFoundError as error:
            raise AppError("File not found", 404) from error

    def _media(self, file: str, extension: str) -> tuple[bytes, str]:
        """An image file as the browser can show it, or an audio file as it plays it: decoded DDS textures are cached
        by file, time and size."""
        info = os.stat(file)
        if info.st_size > MAX_PREVIEW_BYTES:
            raise AppError("Preview is limited to files smaller than 64 MB", 413)
        if extension == "dds":
            key = f"{file}:{info.st_mtime_ns}:{info.st_size}"
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
            return handle.read(), {**IMAGE_PREVIEWS, **AUDIO_PREVIEWS}.get(extension, "application/octet-stream")
