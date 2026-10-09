"""Workspace scanning, one-way GDA → Game sync, settings, activity history and previews. The asset library lists the
game folder; the dashboard compares the GDA folder with it.

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
from pathlib import Path
from typing import TypeVar

from .dds import SUPPORTED_DDS_FORMATS, decode_dds, read_dds_info
from .demo import seed_demo
from .errors import AppError, error_message
from .asset_report import AssetReports, inventory
from .fonts import FONT_EXTENSIONS, describe_font
from .png import PNG_SIGNATURE
from .rss_edit import parse as parse_json_source, remove_declarations, set_view_positions
from .rss_jobs import SyncJobs
from .image_cache import CACHE_FILE
from .paths import PLACEHOLDER, contract, expand, expand_fields, global_paths
from .rss_sync import DEFAULT_EXTENSIONS, DEFAULT_MATCH_THRESHOLD, Config, declared_files
from .views import THUMBNAIL_WIDTH, read_view, render_view, view_layout, view_root
from .rtf import RTF_EXTENSION, rtf_layout

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
    ("font", set(FONT_EXTENSIONS)),
    ("rtf", {RTF_EXTENSION}),
)
FOLDER_NAMES = {"source": "GDA", "destination": "Game"}
# The selected workspace's fields that the configuration repeats at its top level: its folders expanded, and as written.
WORKSPACE_KEYS = ("name", "source", "destination", "templates", "demo")
# The GDA sync report statuses that have an action: copy the GDA file over a "different" resource, remove the
# declarations of an "invalid" one, and delete the files of a "supplementary" one. A "missing" resource has none.
RESOURCE_ACTIONS = ("different", "invalid", "supplementary")
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


def file_facts(file: str, extension: str) -> dict:
    """A file's size, time and image dimensions, and whether the browser can preview it: an image, or a font it draws."""
    info = os.stat(file)
    facts: dict = {"size": info.st_size, "modifiedAt": iso_time(info.st_mtime_ns),
                   "preview": extension in IMAGE_PREVIEWS or extension in FONT_EXTENSIONS}
    try:
        dimensions = image_dimensions(file, extension)
    except ValueError as error:
        facts["preview"] = False
        facts["previewError"] = str(error)
    else:
        if dimensions:
            facts["dimensions"] = dimensions
        if dimensions and extension == "dds":
            facts["preview"] = dimensions["format"] in SUPPORTED_DDS_FORMATS
            if not facts["preview"]:
                facts["previewError"] = f"Preview unavailable for {dimensions['format']}. The original file is unchanged."
    return facts


def asset_facts(path: Path, readable: bool) -> dict:
    """The facts of a file of the asset report: its type, and, when it is a readable file, its size, time and image facts."""
    extension = path.suffix[1:].lower()
    facts = {"type": type_for(extension)}
    if readable:
        try:
            facts.update(file_facts(str(path), extension))
        except OSError:
            pass
    return facts


def _copy_exclusive(source: str, target: str) -> None:
    """Copy file bytes into a new file; fails if target already exists."""
    with open(source, "rb") as reader, open(target, "xb") as writer:
        shutil.copyfileobj(reader, writer, 1024 * 1024)


def image_candidates(row: dict) -> list[dict]:
    """The GDA images that may show the same picture as a different or missing image of the GDA sync report: its possible
    matches by content, and its same-named GDA files whatever their probability, most likely first, on a tie a same-named
    one first. Each is syncable unless it has the game file's contents, since copying it would change nothing. Sequences,
    RTFs, other files and reports from before version 6 have none. The same rule as imageCandidates in
    frontend/src/format.ts."""
    match = row.get("imageMatch")
    if not match or "sequence" in row or "directory" in row or row["category"] not in ("different", "missing"):
        return []
    found = {candidate["absolutePath"]: candidate for candidate in match["matches"]}
    for file in row["gdaFiles"]:
        if "match" in file and file["absolutePath"] not in found:
            found[file["absolutePath"]] = {**file, **file["match"], "sameName": True, "foundBy": ["name"]}
    ordered = sorted(found.values(), key=lambda candidate: (-(candidate["probability"] if candidate["probability"] is not None else -1),
                                                             not candidate["sameName"]))
    return [{**candidate, "syncable": candidate["matchType"] != "exact_file"} for candidate in ordered]


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


def _delete_with_backup(target: str, backup: str) -> None:
    """Delete a game file after saving it in the backups; it is kept when the backup does not match it."""
    os.makedirs(os.path.dirname(backup), exist_ok=True)
    _copy_exclusive(target, backup)
    if file_hash(backup) != file_hash(target):
        raise AppError("The backup does not match the game file, so it was kept")
    os.unlink(target)


def _remove_empty_folders(folder: str, top: str) -> None:
    """Remove folder, then each of its parents below top, while they are empty; top stays."""
    while contained(top, folder) and os.path.normpath(folder) != os.path.normpath(top):
        try:
            os.rmdir(folder)
        except OSError:
            return
        folder = os.path.dirname(folder)


def _mirror_rtf(row: dict, folders: dict, declared: set[Path], failures: list[dict]) -> tuple[list[str], int]:
    """Make a "different" RTF's game folder a copy of its closest GDA folder, as the report compared them: copy each
    changed file and each one that only the GDA has, and delete each one that only the game has, unless a descriptor
    declares it now; each replaced or deleted file is saved in the backups first. A file that fails is a failure of its
    own. Return the files changed, by their game paths, and the bytes copied."""
    resources, game = folders["resources"], str(folders["game"])
    folder, gda_folder = row["resourcePath"], row["gdaFiles"][0]["absolutePath"]
    root = next((root for root in folders["gda"] if contained(root, gda_folder)), None)
    if root is None or not contained(game, folder) or os.path.normpath(folder) == os.path.normpath(game):
        raise AppError("The folders are outside the workspace folders")
    changed: list[str] = []
    total = 0
    for file in row["directory"]["files"]:
        change = file.get("change")
        if change not in ("changed", "added", "removed"):
            continue
        name = f"{row['resource']}/{file['path']}"
        try:
            target = os.path.normpath(os.path.join(folder, *file["path"].split("/")))
            if not contained(folder, target) or target == os.path.normpath(folder):
                raise AppError("The file is outside the RTF's folder")
            relative = os.path.relpath(target, resources)
            if change == "removed":
                if Path(target) in declared:
                    raise AppError("A descriptor declares it, so it was kept")
                target = safe_path(resources, relative)
                try:
                    info = os.lstat(target)
                except FileNotFoundError:
                    continue
                if not stat.S_ISREG(info.st_mode):
                    raise AppError("The game file is not a regular file")
                _delete_with_backup(target, os.path.join(folders["backups"], relative))
                _remove_empty_folders(os.path.dirname(target), folder)
                changed.append(f"{name} (removed)")
                continue
            source = os.path.normpath(os.path.join(gda_folder, *file["path"].split("/")))
            if not contained(gda_folder, source):
                raise AppError("The file is outside the GDA folder")
            source = safe_path(root, os.path.relpath(source, root))
            if os.path.isfile(target) and file_hash(source) == file_hash(target):
                continue
            size = os.path.getsize(source)
            _replace_file(source, resources, relative, os.path.join(folders["backups"], relative), create_parents=True)
            changed.append(name)
            total += size
        except Exception as error:
            failures.append({"name": name, "message": error_message(error)})
    return changed, total


def _write_file(target: str, data: bytes) -> None:
    """Replace an existing file's contents through a temporary file beside it, keeping its permissions."""
    temporary = os.path.join(os.path.dirname(target), f".egt-gda-sync-{uuid.uuid4()}.tmp")
    try:
        with open(temporary, "xb") as handle:
            handle.write(data)
        shutil.copymode(target, temporary)
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
        self.reports = SyncJobs(os.path.join(self.home, "sync-reports"))
        self.asset_reports = AssetReports(os.path.join(self.home, "asset-reports"))

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
                # The top-level *_path fields, and those of the config section, are global paths, which a workspace's
                # *_path fields use as {name}.
                paths = global_paths({**config, "config": global_config})
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
                    # Every *_path field must expand; the folders are used expanded, and written back as they are.
                    expand_fields(entry, paths, f"{entry['id']}: ")
                    templates = {"source": source, "destination": destination}
                    # Keep the API's name/source/destination fields while using the new names on disk.
                    workspace = {key: value for key, value in entry.items() if key not in ("game_name", "game_path", "gda_path")}
                    settings = self._validated_settings(name, expand(source, paths, f"{entry['id']}: gda_path"),
                                                        expand(destination, paths, f"{entry['id']}: game_path"))
                    workspaces.append({**workspace, **settings, "templates": templates, "demo": entry.get("demo", False)})
                if len({entry["id"] for entry in workspaces}) != len(workspaces):
                    raise TypeError("Workspace ids must be unique")
                active = config.get("defaultWorkspace", config.get("activeWorkspace", workspaces[0]["id"]))
                selected = next((entry for entry in workspaces if entry["id"] == active), None)
                if selected is None:
                    raise TypeError("defaultWorkspace must identify a configured workspace")
                extras = {key: value for key, value in config.items() if key not in ("port", "vite_port", "activeWorkspace")}
                return {**extras, "config": global_config, **{key: selected[key] for key in WORKSPACE_KEYS},
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
        """Write workspace.json, each workspace's folders as they were read or entered, with their global paths."""
        config = self.config
        if "workspaces" in config:
            config = {
                "config": config["config"],
                **{key: value for key, value in config.items() if key not in ("config", *WORKSPACE_KEYS, "workspaces")},
                "workspaces": [
                    {**{key: value for key, value in entry.items() if key not in ("name", "source", "destination", "templates")},
                     "game_name": entry["name"], "game_path": entry.get("templates", {}).get("destination", entry["destination"]),
                     "gda_path": entry.get("templates", {}).get("source", entry["source"])}
                    for entry in config["workspaces"]
                ],
            }
        else:
            config = {key: value for key, value in config.items() if key != "templates"}
        self._write_json(self.config_path, config)

    def global_paths(self) -> dict[str, str]:
        """The global paths of workspace.json, expanded: what a {name} in a *_path field stands for."""
        return global_paths(self.config) if "workspaces" in self.config else {}

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
        """The selected workspace: its settings and folders, the global paths its folders can use, the activity, and the
        status of its GDA sync and of its asset report, which the asset library shows."""
        config = dict(self.config)
        return {
            "config": config, "globalPaths": self.global_paths(), "activity": self.activity, "scannedAt": iso_time(), "backupPath": self.backup_path,
            "missingFolders": self.missing_folders(), "rssSync": self.rss_status(),
            "assetReport": self.asset_reports.status(self._active_workspace()[0]),
        }

    def _scan_workspace(self, config: dict) -> dict:
        """The GDA folder's files of one workspace, newest first, each with its status against the game file at the
        same relative path, for the dashboard and the copy by relative path. Hidden files and links are skipped, and a
        file that cannot be described is a warning."""
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

    def _comparison(self, workspace_id: str, entry: dict, overrides: dict | None = None) -> tuple[dict, dict]:
        """The workspace settings a run uses, named as in workspace.json with defaults filled in and the run's overrides
        applied, and the GDA sync settings made from them: game_path is <resources_dir>/<game>, and gda_path is gda_dir.
        Every run shares the compare cache in the app data folder."""
        entry = expand_fields({**entry, **(overrides or {})}, self.global_paths())
        common = entry.get("common_gda_path")
        if isinstance(common, str) and common and not os.path.isabs(common):
            common = os.path.join(os.path.dirname(self.config_path), common)
        workspace = {
            "id": workspace_id, "game_name": entry["name"], "game_path": entry["destination"], "gda_path": entry["source"],
            "common_gda_path": common, "extensions": entry.get("extensions", list(DEFAULT_EXTENSIONS)),
            "resource_paths": entry.get("resource_paths", []), "ignore_dds_mips": entry.get("ignore_dds_mips", True),
            "multithreading": entry.get("multithreading", True), "use_gpu": entry.get("use_gpu", False),
            "image_match_threshold": entry.get("image_match_threshold", DEFAULT_MATCH_THRESHOLD),
        }
        settings = {
            "resources_dir": os.path.dirname(workspace["game_path"]), "game": os.path.basename(workspace["game_path"]),
            "gda_dir": workspace["gda_path"], "common_gda_dir": common, "extensions": workspace["extensions"],
            "resource_paths": workspace["resource_paths"], "ignore_dds_mips": workspace["ignore_dds_mips"],
            "multithreading": workspace["multithreading"], "use_gpu": workspace["use_gpu"],
            "image_match_threshold": workspace["image_match_threshold"], "cache_path": os.path.join(self.home, CACHE_FILE),
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

    def compare_workspace(self, workspace_id: str, progress: Callable[[str, int, int], None] | None = None,
                          overrides: dict | None = None) -> dict:
        """Run a workspace's GDA sync in this process and save its report, without the app; return the run. overrides
        replace workspace.json fields, such as use_gpu, for this run."""
        entry = dict(self.workspace_entries()).get(workspace_id)
        if entry is None:
            raise AppError(f"Workspace not found: {workspace_id}", 404)
        return self.reports.run(workspace_id, *self._comparison(workspace_id, entry, overrides), progress)

    def close(self) -> None:
        self.reports.stop_all()

    def _describe(self, config: dict, folder: str, relative: str, name: str) -> dict:
        """A GDA file with its status against the game file at the same relative path: new, modified or synced."""
        file, target = safe_path(config["source"], relative), safe_path(config["destination"], relative)
        extension = os.path.splitext(relative)[1][1:].lower()
        asset = {"id": asset_id(relative), "name": name, "path": _portable(relative), "folder": _portable(folder) or "Root",
                 "extension": extension, "type": type_for(extension), **file_facts(file, extension)}
        status = "new"
        try:
            destination = os.stat(target)
        except FileNotFoundError:
            pass
        else:
            if not stat.S_ISREG(destination.st_mode):
                raise AppError("The destination is not a regular file")
            same = asset["size"] == destination.st_size and file_hash(file) == file_hash(target)
            status = "synced" if same else "modified"
        return {**asset, "status": status}

    def rescan(self) -> dict:
        def operation() -> dict:
            self._record("scan", "Started a GDA sync")
            # The GDA sync compares thousands of files, so it runs in its own process.
            self.start_comparison()
            return self.scan()

        return self._exclusive(operation)

    def generate_asset_report(self) -> dict:
        """Write a new asset report of the selected workspace's game, which the asset library then shows."""
        def operation() -> dict:
            self.require_folders("destination")
            workspace_id, entry = self._active_workspace()
            workspace, settings = self._comparison(workspace_id, entry)
            started = iso_time()
            try:
                config = Config(resources_dir=Path(settings["resources_dir"]).resolve(), gda_dir=Path(settings["gda_dir"]),
                                extensions=frozenset(extension.lower() for extension in settings["extensions"]),
                                game=settings["game"], resource_paths=tuple(settings["resource_paths"]))
                result = inventory(config, asset_facts)
            except (OSError, ValueError, TypeError, AttributeError) as error:
                raise AppError(f"The asset report could not be generated: {error_message(error)}") from error
            self.asset_reports.save(workspace_id, workspace, started, result)
            count = result["summary"]["assets"]
            self._record("report", f"Generated an asset report of {count} asset{'' if count == 1 else 's'}")
            return self.scan()

        return self._exclusive(operation)

    def asset_report(self) -> bytes:
        report = self.asset_reports.report(self._active_workspace()[0])
        if report is None:
            raise AppError("This workspace has no asset report yet. Click Rescan in the Asset library to create one.", 404)
        return report

    def update_config(self, name: str, source: str, destination: str) -> dict:
        """Save the selected workspace's name and folders. A folder can use the global paths as {name}, and one inside a
        global path is written with it."""
        def operation() -> dict:
            paths = self.global_paths()
            try:
                folders = {key: expand(value.strip(), paths, label) for key, value, label in (("source", source, "The GDA path"), ("destination", destination, "The Game path"))}
            except ValueError as error:
                raise AppError(str(error)) from error
            settings = self._validated_settings(name, folders["source"], folders["destination"])
            settings["templates"] = {key: contract(value if PLACEHOLDER.search(value) else os.path.normpath(value), paths)
                                     for key, value in (("source", source.strip()), ("destination", destination.strip()))}
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
            self.config = {**current, **{key: entry[key] for key in WORKSPACE_KEYS}, "defaultWorkspace": workspace_id}
            try:
                self._save_config()
            except BaseException:
                self.config = previous
                raise
            with self._previews_lock:
                self._previews.clear()
            return self.scan()

        return self._exclusive(operation)

    def sync(self, ids: list[str]) -> dict:
        def operation() -> dict:
            self.require_folders("source", "destination")
            # The asset library lists the game folder, so the files to copy come from the GDA folder's comparison.
            assets = self._scan_workspace(dict(self.config))["assets"]
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

    def sync_resources(self, ids: list[str], gda_files: dict[str, str] | None = None) -> dict:
        """Copy a GDA file of each chosen "different" resource of the GDA sync report over the game resource, then compare
        again, since the report lists a copied resource as different until the next run. An image is copied from the GDA
        image chosen for it in gda_files, by row id, which must be one of its candidates (image_candidates) and can sync
        a "missing" image too; without a choice from its most likely candidate. Any other file is copied from its
        closest GDA file, and each different frame of an image sequence from the closest GDA file of the frame."""
        return self._apply_resources(dict.fromkeys(ids, "different"), "Only a resource that differs from its GDA file can be synced",
                                     gda_files or {})

    def apply_resources(self, resources: dict[str, str], gda_files: dict[str, str] | None = None) -> dict:
        """Apply the action of each chosen resource of the GDA sync report, by row id, for the status the caller saw,
        which must still be its status in the report: sync a "different" resource as sync_resources does, from its chosen
        GDA image in gda_files, remove the declarations of an "invalid" one from the descriptors, and delete the files of
        a "supplementary" one. Every changed or deleted file is saved in the backups first. Then compare again."""
        return self._apply_resources(resources, "A resource has another status in the GDA sync report now. Review it and try again.",
                                     gda_files or {})

    def _apply_resources(self, wanted: dict[str, str], other_status: str, gda_files: dict[str, str]) -> dict:
        def operation() -> dict:
            workspace_id, entry = self._active_workspace()
            if self.reports.status(workspace_id)["running"]:
                raise AppError("The GDA sync is still comparing. Wait for it to finish and try again.", 409)
            report = self.reports.report(workspace_id)
            if report is None:
                raise AppError("This workspace has no GDA sync report yet. Click Rescan to create one.", 404)
            rows = {row["id"]: row for row in json.loads(report).get("differences", [])}
            if any(row_id not in rows for row_id in wanted):
                raise AppError("A resource is no longer in the GDA sync report. Rescan and try again.")
            # A missing image is synced only from a GDA image chosen for it.
            if any(category not in RESOURCE_ACTIONS or not (
                    rows[row_id]["category"] == category or (category == "different" and rows[row_id]["category"] == "missing" and row_id in gda_files))
                   or (category == "different" and not rows[row_id]["gdaFiles"] and row_id not in gda_files) for row_id, category in wanted.items()):
                raise AppError(other_status)
            # The GDA file of each synced image: the chosen one, which must still be a candidate that changes the game
            # file, or else the most likely candidate.
            sources: dict[str, str] = {}
            for row_id in (row_id for row_id, category in wanted.items() if category == "different"):
                candidates = [candidate["absolutePath"] for candidate in image_candidates(rows[row_id]) if candidate["syncable"]]
                if row_id in gda_files and gda_files[row_id] not in candidates:
                    raise AppError(f"{rows[row_id]['resource']}: the chosen GDA image is not one it can be synced from in the GDA sync "
                                   "report now. Rescan and try again.")
                if row_id in gda_files or candidates:
                    sources[row_id] = gda_files.get(row_id) or candidates[0]
            if any(row_id not in wanted or wanted[row_id] != "different" for row_id in gda_files):
                raise AppError("A GDA image can only be chosen for a resource that is synced")
            chosen = {category: [rows[row_id] for row_id, wanted_category in wanted.items() if wanted_category == category]
                      for category in RESOURCE_ACTIONS}
            settings = self._comparison(workspace_id, entry)[1]
            # The report is data: change only files inside the workspace's resources folder, and copy only from its GDA
            # folders.
            folders = {
                "resources": os.path.realpath(settings["resources_dir"]),
                "gda": [os.path.realpath(root) for root in (settings["gda_dir"], settings["common_gda_dir"]) if root],
                # The game folder as the GDA sync resolves it, which the report's paths are relative to.
                "game": Path(settings["resources_dir"]).resolve() / settings["game"],
                "backups": os.path.join(self.backup_path, str(uuid.uuid4())),
            }
            failures: list[dict] = []
            synced = self._copy_resources(chosen["different"], folders, settings["resource_paths"], failures, sources)
            removed = self._remove_declarations(chosen["invalid"], folders, failures)
            deleted = self._delete_resources(chosen["supplementary"], folders, settings["resource_paths"], failures)
            if synced["files"]:
                count = synced["resources"]
                self._record("sync", f"Synced {count} resource{'' if count == 1 else 's'} to Game", synced["files"], synced["bytes"])
            if removed["resources"]:
                count = removed["resources"]
                self._record("cleanup", f"Removed the declarations of {count} invalid resource{'' if count == 1 else 's'}", removed["files"])
            if deleted["resources"]:
                count = deleted["resources"]
                self._record("cleanup", f"Deleted {count} supplementary resource{'' if count == 1 else 's'} from Game", deleted["files"])
            # Compare again unless nothing was done: a copy that found the file already in sync still outdates the report.
            if synced["outdated"] or removed["resources"] or deleted["resources"]:
                self.start_comparison()
            # A sequence is one resource however many of its files were copied or deleted.
            return {"copied": synced["files"], "resources": synced["resources"], "removed": removed["resources"],
                    "deleted": deleted["resources"], "failures": failures, "bytes": synced["bytes"], "library": self.scan()}

        return self._exclusive(operation)

    def _copy_resources(self, rows: list[dict], folders: dict, resource_paths: list[str], failures: list[dict],
                        sources: dict[str, str]) -> dict:
        """Copy the GDA file of each row in sources, by row id, or else its closest GDA file, or of each different frame of
        a sequence its closest GDA file, over the game file, and make each different RTF's folder a copy of its closest
        GDA folder."""
        resources = folders["resources"]
        rtfs = [row for row in rows if "directory" in row]
        # The game files to replace, each once with the resource it belongs to and the GDA file to copy: the frames of a
        # sequence can repeat a file.
        files = {
            file["resourcePath"]: (row["id"], file, sources.get(row["id"]) if file is row else None)
            for row in rows if "directory" not in row
            for file in (row["sequence"]["frames"] if "sequence" in row else [row])
            if (file is row and row["id"] in sources) or (file["category"] == "different" and file["gdaFiles"])
        }
        copied: list[str] = []
        synced: set[str] = set()
        total = 0
        failed = 0
        for row_id, file, chosen_source in files.values():
            try:
                source, target = chosen_source or file["gdaFiles"][0]["absolutePath"], file["resourcePath"]
                root = next((root for root in folders["gda"] if contained(root, source)), None)
                if root is None or not contained(resources, target):
                    raise AppError("The files are outside the workspace folders")
                source = safe_path(root, os.path.relpath(source, root))
                relative = os.path.relpath(target, resources)
                target = safe_path(resources, relative)
                if os.path.isfile(target) and file_hash(source) == file_hash(target):
                    continue
                size = os.path.getsize(source)
                _replace_file(source, resources, relative, os.path.join(folders["backups"], relative))
                copied.append(file["resource"])
                synced.add(row_id)
                total += size
            except Exception as error:
                failed += 1
                failures.append({"name": os.path.basename(file["resource"]), "message": error_message(error)})
        try:
            # A file that only the game's RTF has is deleted, unless a descriptor declares it.
            declared = declared_files(folders["game"], tuple(resource_paths)) if rtfs else set()
        except (OSError, ValueError) as error:
            failures.extend({"name": os.path.basename(row["resource"]), "message": f"The descriptors cannot be read: {error_message(error)}"} for row in rtfs)
            return {"files": copied, "resources": len(synced), "bytes": total, "outdated": failed < len(files)}
        for row in rtfs:
            try:
                changed, size = _mirror_rtf(row, folders, declared, failures)
            except Exception as error:
                failed += 1
                failures.append({"name": os.path.basename(row["resource"]), "message": error_message(error)})
                continue
            copied.extend(changed)
            total += size
            if changed:
                synced.add(row["id"])
        return {"files": copied, "resources": len(synced), "bytes": total, "outdated": failed < len(files) + len(rtfs)}

    def _remove_declarations(self, rows: list[dict], folders: dict, failures: list[dict]) -> dict:
        """Remove the entries that declare each "invalid" row from the descriptors that the report says declare it.
        A row whose file exists now is left alone, since the report is out of date."""
        resources, game = folders["resources"], folders["game"]
        by_descriptor: dict[str, list[dict]] = {}
        problems: dict[str, str] = {}
        for row in rows:
            files = [frame["resourcePath"] for frame in row["sequence"]["frames"] if frame["category"] == "invalid"] \
                if "sequence" in row else [row["directory"]["project"]] if "directory" in row else [row["resourcePath"]]
            if not row["requiredBy"]:
                problems[row["id"]] = "No descriptor declares it, only the workspace's resource_paths"
            elif all(contained(resources, file) and os.path.isfile(file) for file in files):
                problems[row["id"]] = "Its file exists now. Rescan to update the report."
            else:
                for descriptor in dict.fromkeys(use["descriptor"] for use in row["requiredBy"]):
                    by_descriptor.setdefault(descriptor, []).append(row)
        changed: list[str] = []
        found: dict[str, int] = {}
        for descriptor, descriptor_rows in by_descriptor.items():
            try:
                relative = os.path.relpath(os.path.normpath(os.path.join(game, descriptor)), resources)
                path = safe_path(resources, relative)
                with open(path, "rb") as handle:
                    text = handle.read().decode("utf-8")
                result, counts = remove_declarations(Path(path), text, descriptor_rows, game)
                for row_id, count in counts.items():
                    found[row_id] = found.get(row_id, 0) + count
                if result == text:
                    continue
                backup = os.path.join(folders["backups"], relative)
                os.makedirs(os.path.dirname(backup), exist_ok=True)
                _copy_exclusive(path, backup)
                _write_file(path, result.encode("utf-8"))
                changed.append(descriptor)
            except Exception as error:
                for row in descriptor_rows:
                    problems.setdefault(row["id"], f"{descriptor}: {error_message(error)}")
        for row in rows:
            if row["id"] not in problems and not found.get(row["id"]):
                problems[row["id"]] = "Its declaration is not in the descriptors any more. Rescan to update the report."
        failures.extend({"name": os.path.basename(row["resource"]), "message": problems[row["id"]]} for row in rows if row["id"] in problems)
        return {"files": changed, "resources": sum(1 for row in rows if row["id"] not in problems)}

    def _delete_resources(self, rows: list[dict], folders: dict, resource_paths: list[str], failures: list[dict]) -> dict:
        """Delete the files of each "supplementary" row, each saved in the backups first: an RTF's are every file of its
        folder, which goes with them when it is left empty. A file that a descriptor declares now is left alone, since the
        report is out of date."""
        resources, game = folders["resources"], folders["game"]
        deleted: list[str] = []
        count = 0
        try:
            declared = declared_files(game, tuple(resource_paths)) if rows else set()
        except (OSError, ValueError) as error:
            failures.extend({"name": os.path.basename(row["resource"]), "message": f"The descriptors cannot be read: {error_message(error)}"} for row in rows)
            return {"files": [], "resources": 0}
        for row in rows:
            files = [frame["resourcePath"] for frame in row["sequence"]["frames"]] if "sequence" in row \
                else [file["resourcePath"] for file in row["directory"]["files"]] if "directory" in row else [row["resourcePath"]]
            try:
                if not all(contained(str(game), file) for file in files):
                    raise AppError("The files are outside the game folder")
                if any(Path(file) in declared for file in files):
                    raise AppError("A descriptor declares it now. Rescan to update the report.")
                targets = [(os.path.relpath(file, resources), safe_path(resources, os.path.relpath(file, resources))) for file in files]
                for _relative, target in targets:
                    try:
                        info = os.lstat(target)
                    except FileNotFoundError:
                        raise AppError("The file does not exist any more. Rescan to update the report.") from None
                    if not stat.S_ISREG(info.st_mode):
                        raise AppError("The game file is not a regular file")
                for relative, target in targets:
                    _delete_with_backup(target, os.path.join(folders["backups"], relative))
                    deleted.append(os.path.relpath(target, game))
                    if "directory" in row:
                        _remove_empty_folders(os.path.dirname(target), os.path.dirname(row["resourcePath"]))
                count += 1
            except Exception as error:
                failures.append({"name": os.path.basename(row["resource"]), "message": error_message(error)})
        return {"files": deleted, "resources": count}

    def _resource_roots(self) -> list[str]:
        """The active workspace's resources, GDA and common GDA folders, which report files must be inside."""
        workspace_id, entry = self._active_workspace()
        settings = self._comparison(workspace_id, entry)[1]
        return [os.path.realpath(root) for root in (settings["resources_dir"], settings["gda_dir"], settings["common_gda_dir"]) if root]

    def _resource_path(self, file: str) -> str:
        """Resolve a report file inside the active workspace's game, GDA or common GDA folders."""
        roots = self._resource_roots()
        root = next((root for root in roots if os.path.isabs(file) and contained(root, file)), None)
        if root is None:
            raise AppError("File not found", 404)
        return safe_path(root, os.path.relpath(file, root))

    def descriptor_path(self, descriptor: str) -> str:
        """Resolve a declaration's JSON descriptor relative to the game, within its resources root."""
        workspace_id, entry = self._active_workspace()
        workspace, settings = self._comparison(workspace_id, entry)
        root = os.path.realpath(settings["resources_dir"])
        file = os.path.normpath(os.path.join(workspace["game_path"], descriptor))
        path = safe_path(root, os.path.relpath(file, root))
        if not path.lower().endswith(".json") or not os.path.isfile(path):
            raise AppError("Descriptor not found", 404)
        return path

    def resource_folder(self, file: str, itself: bool = False) -> str:
        """The existing parent directory of a report file, including a missing file or sequence pattern, or with itself,
        the report folder that file names."""
        path = self._resource_path(file)
        folder = path if itself else os.path.dirname(path)
        if not os.path.isdir(folder):
            raise AppError("Folder does not exist", 404)
        return folder

    def resource_details(self, files: list[str], chars: list[str] = ()) -> dict:
        """The size, modification time and image dimensions of files the GDA sync report names, by path, and a font's
        names and glyph count, with its coverage of each of the given declared character lists. Only files inside the
        active workspace's resources and GDA folders are read; any other path, or a file that does not exist, has only
        an error."""
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
            extension = os.path.splitext(path)[1][1:].lower()
            if extension in FONT_EXTENSIONS:
                entry.update(describe_font(path, chars))
            try:
                dimensions = image_dimensions(path, extension)
            except (OSError, ValueError) as error:
                entry["dimensionsError"] = error_message(error)
            else:
                if dimensions:
                    entry["dimensions"] = dimensions
            details[file] = entry
        return {"files": details}

    def _view(self, file: str) -> tuple[Path, Path, tuple[Path, ...]]:
        """A view file inside the workspace's folders, the game folder whose descriptors its ids are looked up in, and
        the folders its images may come from. A game's own view uses the descriptors beside its v folder; a view
        elsewhere, such as in a GDA folder, those of the selected workspace's game. So does a view of a folder that the
        game includes, such as ../common/features/taxation, whose descriptor names its files from the game folder."""
        path = Path(self._resource_path(file))
        root = view_root(path)
        if root is None:
            raise AppError("Not a view: a view is a .json file in a game's v folder", 415)
        destination = Path(self.config["destination"])
        included = root.is_relative_to(destination.parent) and root.parent != destination.parent
        game = root if any(root.glob("*Data.json")) and not included else destination
        return path, game, tuple(Path(folder) for folder in self._resource_roots())

    def view_preview(self, file: str, width: int | None = None, hidden: bool = False, crop: bool = False, segment: int | None = None,
                     cuts: tuple[int, ...] | None = None) -> bytes:
        """A view composed as a PNG image, as wide as width (a card's width by default), with its hidden elements on
        request, cropped to what it draws on request, or only one segment of it, between the elements that the page
        draws itself (cuts)."""
        path, game, roots = self._view(file)
        try:
            return render_view(path, width or THUMBNAIL_WIDTH, hidden, game, roots, crop, segment, cuts)
        except FileNotFoundError as error:
            raise AppError("File not found", 404) from error
        except (OSError, ValueError, RecursionError) as error:
            raise AppError(error_message(error), 415) from error

    def view_details(self, file: str) -> dict:
        """Every element of a view, with what it draws and the area it covers, for the details to outline."""
        path, game, roots = self._view(file)
        try:
            return view_layout(path, game, roots)
        except FileNotFoundError as error:
            raise AppError("File not found", 404) from error
        except (OSError, ValueError, RecursionError) as error:
            raise AppError(error_message(error), 415) from error

    def save_view_positions(self, file: str, revision: str, positions: dict[int, tuple[float, float]]) -> dict:
        """Write new positions of a game view's elements, by index, into its file, keeping the rest of its text, and save
        the file it replaces in the backups. revision is the file the positions were moved in, from its layout: a view
        changed since is refused. Returns the view's new layout and the library."""
        def operation() -> dict:
            path, game, roots = self._view(file)
            workspace_id, entry = self._active_workspace()
            resources = os.path.realpath(self._comparison(workspace_id, entry)[1]["resources_dir"])
            if not contained(resources, str(path)):
                raise AppError("Only the views of the game's resources can be edited", 403)
            relative = os.path.relpath(path, resources)
            target = safe_path(resources, relative)
            try:
                data = Path(target).read_bytes()
            except FileNotFoundError as error:
                raise AppError("File not found", 404) from error
            if hashlib.sha256(data).hexdigest()[:16] != revision:
                raise AppError("The view changed on disk since it was opened. Open it again to move its elements.", 409)
            bom = data.startswith(b"\xef\xbb\xbf")
            try:
                text = set_view_positions(data[3 if bom else 0:].decode("utf-8"), positions)
            except (UnicodeDecodeError, ValueError) as error:
                raise AppError(error_message(error), 400) from error
            result = (b"\xef\xbb\xbf" if bom else b"") + text.encode("utf-8")
            if result != data:
                backup = os.path.join(self.backup_path, str(uuid.uuid4()), relative)
                os.makedirs(os.path.dirname(backup), exist_ok=True)
                _copy_exclusive(target, backup)
                _write_file(target, result)
                count = len(positions)
                self._record("edit", f"Moved {count} element{'' if count == 1 else 's'} of {path.stem}", [relative.replace(os.sep, "/")])
            try:
                layout = view_layout(path, game, roots)
            except (OSError, ValueError, RecursionError) as error:
                raise AppError(error_message(error), 415) from error
            return {"layout": layout, "library": self.scan()}

        return self._exclusive(operation)

    def view_element_location(self, file: str, index: int) -> tuple[str, int]:
        """The current source line of an element in a workspace view, in the preview's drawing order."""
        path, _game, _roots = self._view(file)
        try:
            read_view(path)  # Validate the view and its size before reading its source locations.
            text = path.read_text(encoding="utf-8-sig")
            root = parse_json_source(text)
            # JSON permits duplicate keys; its last elements list is the one read_view uses.
            members = [node for key, node in root.members if key == "elements"][-1]
            elements = [node for _key, node in members.members if node.kind == "object"]
            if index < 0 or index >= len(elements):
                raise AppError("View element not found", 404)
            return str(path), text.count("\n", 0, elements[index].start) + 1
        except FileNotFoundError as error:
            raise AppError("File not found", 404) from error
        except (OSError, ValueError, RecursionError) as error:
            raise AppError(error_message(error), 415) from error

    def resource_preview(self, file: str) -> tuple[bytes, str]:
        """Preview an image, an audio file to play, a font to draw text with, the pages of an RTF to draw, or a view
        composed as an image, inside the active workspace's resources and GDA folders."""
        if view_root(Path(file)) is not None:
            return self.view_preview(file), "image/png"
        file = self._resource_path(file)
        extension = os.path.splitext(file)[1][1:].lower()
        if extension != "dds" and extension != RTF_EXTENSION and extension not in {**IMAGE_PREVIEWS, **AUDIO_PREVIEWS, **FONT_EXTENSIONS}:
            raise AppError("No preview for this file", 415)
        try:
            return self._media(file, extension)
        except FileNotFoundError as error:
            raise AppError("File not found", 404) from error

    def _media(self, file: str, extension: str) -> tuple[bytes, str]:
        """An image file as the browser can show it, an audio or font file as it is, or an RTF's pages as JSON:
        decoded DDS textures are cached by file, time and size."""
        info = os.stat(file)
        if info.st_size > MAX_PREVIEW_BYTES:
            raise AppError("Preview is limited to files smaller than 64 MB", 413)
        if extension == RTF_EXTENSION:
            try:
                layout = rtf_layout(file)
            except (ValueError, RecursionError) as error:
                raise AppError(error_message(error), 415) from error
            return json.dumps(layout, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), "application/json"
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
            return handle.read(), {**IMAGE_PREVIEWS, **AUDIO_PREVIEWS, **FONT_EXTENSIONS}.get(extension, "application/octet-stream")
