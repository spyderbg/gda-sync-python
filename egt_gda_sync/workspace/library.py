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
import re
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

from egt_gda_sync.images.dds import SUPPORTED_DDS_FORMATS, decode_dds, read_dds_info
from egt_gda_sync.workspace.demo import seed_demo
from egt_gda_sync.app.errors import AppError, error_message
from egt_gda_sync.workspace.asset_report import AssetReports, inventory
from egt_gda_sync.assets.fonts import FONT_EXTENSIONS, describe_font
from egt_gda_sync.assets.movies import MOVIE_EXTENSIONS, describe_movie, movie_thumbnail
from egt_gda_sync.images.png import PNG_SIGNATURE
from egt_gda_sync.workspace import backups
from egt_gda_sync.sync.rss_declare import KINDS, asset_files, asset_kinds, asset_name, build_entry, descriptor_targets, entry_paths, kind_options, used_values
from egt_gda_sync.sync.rss_edit import add_declaration, declaration_keys, parse as parse_json_source, remove_declarations, set_view_positions, walk
from egt_gda_sync.sync import rss_refactor
from egt_gda_sync.sync.rss_jobs import SyncJobs
from egt_gda_sync.images.image_cache import CACHE_FILE
from egt_gda_sync.images.metadata.service import (EXTENSIONS as METADATA_EXTENSIONS, MetadataLibrary, checked as metadata_path,
                                                image_data as metadata_image_data, target_key, target_paths)
from egt_gda_sync.images.metadata.sequence import storyboard
from egt_gda_sync.workspace.paths import PLACEHOLDER, contract, expand, expand_fields, global_paths
from egt_gda_sync.sync.rss_schemas import DOCUMENT_TYPES, parse_dataclass
from egt_gda_sync.sync.rss_sync import DEFAULT_EXTENSIONS, DEFAULT_MATCH_THRESHOLD, Config, declared_files, declared_paths, expand_path, load_documents
from egt_gda_sync.assets.view_text import DEFAULT_SAMPLE
from egt_gda_sync.assets.views import THUMBNAIL_WIDTH, VIEW_FOLDER, is_view, key_uses, load_resources, read_view, render_text, render_view, view_layout, view_root
from egt_gda_sync.assets.rtf import RTF_EXTENSION, rtf_layout

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
    ("movie", set(MOVIE_EXTENSIONS)),
)
# The text files that the asset details edit, and the largest one they open.
TEXT_EXTENSIONS = frozenset({"csv", "json", "txt", "ini", "xml", "md", "log", "tsv", "yaml", "yml", "cfg"})
MAX_TEXT_BYTES = 1024 * 1024
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
    """A file's size, time and image dimensions, and whether the browser can preview it: an image, a font it draws, or a
    movie, whose thumbnail is a frame."""
    info = os.stat(file)
    facts: dict = {"size": info.st_size, "modifiedAt": iso_time(info.st_mtime_ns),
                   "preview": extension in IMAGE_PREVIEWS or extension in FONT_EXTENSIONS or extension in MOVIE_EXTENSIONS}
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
    """The facts of a file of the asset report: its type, and, when it is a readable file, its size, time and image facts,
    and a movie's frame size, frame rate, frames, duration and codec."""
    extension = path.suffix[1:].lower()
    facts = {"type": type_for(extension)}
    if readable:
        try:
            facts.update(file_facts(str(path), extension))
        except OSError:
            return facts
        if extension in MOVIE_EXTENSIONS:
            facts.update(describe_movie(str(path)))
            facts["preview"] = "movie" in facts
    return facts


def _copy_exclusive(source: str, target: str) -> None:
    """Copy file bytes into a new file; fails if target already exists."""
    with open(source, "rb") as reader, open(target, "xb") as writer:
        shutil.copyfileobj(reader, writer, 1024 * 1024)


def image_candidates(row: dict) -> list[dict]:
    """The GDA images that may show the same picture as a different or missing image of the GDA sync report, or the GDA
    movies that may be the same clip as a movie: its possible matches by content, and its same-named GDA files whatever
    their probability, most likely first, on a tie a same-named one first. Each is syncable unless it has the game file's
    contents, since copying it would change nothing. Sequences, RTFs, other files and reports from before version 6 (8 for
    movies) have none. The same rule as imageCandidates in frontend/src/format.ts."""
    match = row.get("imageMatch") or row.get("movieMatch")
    if not match or "sequence" in row or "directory" in row or row["category"] not in ("different", "missing"):
        return []
    found = {candidate["absolutePath"]: candidate for candidate in match["matches"]}
    for file in row["gdaFiles"]:
        if "match" in file and file["absolutePath"] not in found:
            found[file["absolutePath"]] = {**file, **file["match"], "sameName": True, "foundBy": ["name"]}
    ordered = sorted(found.values(), key=lambda candidate: (-(candidate["probability"] if candidate["probability"] is not None else -1),
                                                             not candidate["sameName"]))
    return [{**candidate, "syncable": candidate["matchType"] != "exact_file"} for candidate in ordered]


def _replace_file(source: str, target_root: str, relative: str, backup: str, create_parents: bool = False, must_create: bool = False, expected_hash: str | None = None) -> None:
    """Copy source over target_root/relative through a verified temporary file; an existing target is saved to backup first."""
    target = safe_path(target_root, relative, create_parents)
    original_hash = file_hash(source)
    if expected_hash is not None and original_hash != expected_hash:
        raise AppError("The source changed; preview again", 409)
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
        if must_create:
            os.link(temporary, target)
            os.unlink(temporary)
        else:
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


def _asset_files(row: dict) -> list[str]:
    """The files of an asset of the asset report, each once: a sequence's frames, an RTF's folder's files, or its file."""
    files = [frame["resourcePath"] for frame in row["sequence"]["frames"]] if "sequence" in row \
        else [file["resourcePath"] for file in row["directory"]["files"]] if "directory" in row else [row["resourcePath"]]
    return list(dict.fromkeys(files))


def _remove_empty_folders(folder: str, top: str) -> list[str]:
    """Remove folder, then each of its parents below top, while they are empty; top stays. Returns the removed folders."""
    removed = []
    while contained(top, folder) and os.path.normpath(folder) != os.path.normpath(top):
        try:
            os.rmdir(folder)
        except OSError:
            break
        removed.append(folder)
        folder = os.path.dirname(folder)
    return removed


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
        # Decoded DDS textures, and movie thumbnails with their type.
        self._previews: OrderedDict[str, bytes | tuple[bytes, str]] = OrderedDict()
        self._previews_lock = threading.Lock()
        self.reports = SyncJobs(os.path.join(self.home, "sync-reports"))
        self.asset_reports = AssetReports(os.path.join(self.home, "asset-reports"))
        self.image_metadata = MetadataLibrary(self.home, self._operation)

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

    def _backup_owner(self, paths: list[str]) -> tuple[dict, str] | None:
        """The workspace and root of a backup without a record: the workspace whose game folder all its paths start with,
        relative to its resources folder."""
        tops = {path.split("/", 1)[0] for path in paths}
        if len(tops) != 1:
            return None
        for workspace_id, entry in self.workspace_entries():
            destination = entry.get("destination")
            if isinstance(destination, str) and os.path.basename(os.path.normpath(destination)) in tops:
                return {"id": workspace_id, "name": entry.get("name", workspace_id)}, os.path.realpath(os.path.dirname(destination))
        return None

    def _backup_roots(self) -> set[str]:
        """The folders a backup can be restored into: each workspace's game folder and resources folder."""
        roots = set()
        for _workspace_id, entry in self.workspace_entries():
            destination = entry.get("destination")
            if isinstance(destination, str):
                roots |= {os.path.realpath(destination), os.path.realpath(os.path.dirname(destination))}
        return roots

    def list_backups(self) -> dict:
        """Every operation's backups, newest first, and the selected workspace's id."""
        return {"backups": backups.list_operations(self.backup_path, self._backup_owner), "backupPath": self.backup_path,
                "workspaceId": self._active_workspace()[0]}

    def backup_files(self, operation_id: str) -> dict:
        """An operation's backups, with each file and how it is now."""
        record = backups.operation(self.backup_path, operation_id, self._backup_owner)
        if record is None:
            raise AppError("Backup not found", 404)
        return record

    def restore_backup(self, operation_id: str, files: list[str] | None = None) -> dict:
        """Copy an operation's backups, all of them or the given files, back where they were. Each file that is there
        now and differs is saved in a backup of its own first, so a restore can be restored too; a file that is the
        same as its backup is skipped. The selected workspace is compared again when its files changed."""
        def operation() -> dict:
            record = backups.operation(self.backup_path, operation_id, self._backup_owner)
            if record is None:
                raise AppError("Backup not found", 404)
            root = record["root"]
            if root is None:
                raise AppError("Where this backup's files belong is not known, so it cannot be restored", 409)
            if os.path.realpath(root) not in self._backup_roots():
                raise AppError("This backup belongs to a folder that no workspace uses now", 409)
            by_path = {item["path"]: item for item in record["files"]}
            chosen = list(dict.fromkeys(files)) if files else list(by_path)
            if any(path not in by_path for path in chosen):
                raise AppError("A file is not in this backup", 404)
            source_root = os.path.join(self.backup_path, operation_id)
            folder = backups.new_operation(self.backup_path)
            restored, skipped, failures = [], [], []
            entries: dict[str, list[dict]] = {}
            for item in record.get("declarations", []):
                entries.setdefault(item["path"], []).append(item)
            for path in chosen:
                try:
                    if by_path[path]["change"] == "created":
                        if any(by_path[failed["name"]]["change"] != "created" for failed in failures):
                            raise AppError("Created file was kept because other files could not be restored", 409)
                        target = safe_path(root, path)
                        if not os.path.exists(target):
                            skipped.append(path)
                        elif not os.path.isfile(target) or file_hash(target) != by_path[path]["sha256"]:
                            raise AppError("Created file has changed since the operation; it was kept", 409)
                        else:
                            _delete_with_backup(target, os.path.join(folder, *path.split("/")))
                            restored.append(path)
                        continue
                    source = safe_path(source_root, path)
                    if by_path[path]["now"] == "same":
                        skipped.append(path)
                        continue
                    if by_path[path]["now"] == "changed" and path in entries:
                        # A descriptor that entries were removed from gets them back, as they were, in its text as it is
                        # now, which keeps what was changed in it since.
                        if self._restore_entries(root, path, entries[path], folder):
                            restored.append(path)
                            continue
                    _replace_file(source, root, path, os.path.join(folder, *path.split("/")), create_parents=True)
                    restored.append(path)
                except Exception as error:
                    failures.append({"name": path, "message": error_message(error)})
            when = record["date"][:16].replace("T", " ")
            if restored:
                message = f"Restored {len(restored)} file{'' if len(restored) == 1 else 's'} from the backup of {when}"
                self._record("restore", message, restored)
                workspace = record["workspace"] or {"id": "", "name": ""}
                backups.write_manifest(folder, action="restore", message=f"Replaced when restoring the backup of {when}",
                                       workspace=workspace, root=root)
                if workspace.get("id") == self._active_workspace()[0] and not self.reports.status(workspace["id"])["running"]:
                    if record["action"] in ("move", "rename"):
                        self._write_asset_report()
                    self.start_comparison()
            return {"restored": restored, "skipped": skipped, "failures": failures, "library": self.scan()}

        return self._exclusive(operation)

    def _restore_entries(self, root: str, relative: str, declarations: list[dict], folder: str) -> bool:
        """Add the entries that a backup removed from a descriptor back to it, each at the end of its list as it was and
        unless the list has it already; the descriptor as it was is saved in folder first. False when that cannot be done
        (the descriptor has no such list, or is not valid), and the caller restores the whole file."""
        target = safe_path(root, relative)
        try:
            data = Path(target).read_bytes()
            bom = data.startswith(b"\xef\xbb\xbf")
            text = data[3 if bom else 0:].decode("utf-8")
            for item in declarations:
                if item["entry"] not in (json.loads(text).get(item["list"]) or []):
                    text, _line = add_declaration(text, item["list"], item["entry"])
            parse_dataclass(DOCUMENT_TYPES[Path(target).name], json.loads(text), relative)
        except (OSError, UnicodeDecodeError, ValueError, TypeError, KeyError, AttributeError):
            return False
        if text.encode("utf-8") != data[3 if bom else 0:]:
            backup = os.path.join(folder, *relative.split("/"))
            os.makedirs(os.path.dirname(backup), exist_ok=True)
            _copy_exclusive(target, backup)
            _write_file(target, (b"\xef\xbb\xbf" if bom else b"") + text.encode("utf-8"))
        return True

    def delete_rss_report(self, name: str) -> dict:
        """Delete one GDA sync report of the active workspace, by its file name. The Sync page then shows the newest
        successful report left. Returns the history and the library."""
        def operation() -> dict:
            if not self.reports.delete(self._active_workspace()[0], name):
                raise AppError("The workspace has no such GDA sync report", 404)
            return {**self.rss_history(), "library": self.scan()}

        return self._exclusive(operation)

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
        self.image_metadata.close()
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
            count = self._write_asset_report()["summary"]["assets"]
            self._record("report", f"Generated an asset report of {count} asset{'' if count == 1 else 's'}")
            return self.scan()

        return self._exclusive(operation)

    @staticmethod
    def _asset_game(settings: dict) -> Path:
        """The game folder as the asset report resolves it, which the report's paths are relative to."""
        return Path(settings["resources_dir"]).resolve() / settings["game"]

    def _write_asset_report(self) -> dict:
        """Generate and save an asset report of the selected workspace's game, and return it."""
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
        return result

    def _undeclared_asset(self, asset: str) -> tuple[dict, Path, dict[Path, object]]:
        """An asset of the newest asset report that no descriptor declares and whose files exist, the game folder, and
        the game's descriptors as they are now."""
        workspace_id, entry = self._active_workspace()
        settings = self._comparison(workspace_id, entry)[1]
        report = self.asset_reports.report(workspace_id)
        if report is None:
            raise AppError("This workspace has no asset report yet. Click Rescan in the Asset library to create one.", 404)
        row = next((row for row in json.loads(report).get("assets", []) if row["id"] == asset), None)
        if row is None:
            raise AppError("The asset is no longer in the asset report. Rescan and try again.", 404)
        if row["requiredBy"]:
            raise AppError("A descriptor declares this asset already", 409)
        if row["category"] not in ("available", "supplementary"):
            raise AppError("Only an asset whose files exist can be declared", 409)
        game = self._asset_game(settings)
        try:
            documents = load_documents(game, required=False)
        except (OSError, ValueError, TypeError) as error:
            raise AppError(f"The descriptors cannot be read: {error_message(error)}") from error
        return row, game, documents

    def declaration_options(self, asset: str) -> dict:
        """How an asset that no descriptor declares can be declared: the paths its entry names, for each kind of entry
        that can declare it, the descriptors that can hold it and the ids and values the game's entries use, and the
        resolutions and languages that the game's entries of every kind use."""
        row, game, documents = self._undeclared_asset(asset)
        paths = entry_paths(row, game)
        name = asset_name(row)
        return {"paths": paths, "kinds": [kind_options(kind, documents, game, paths, name) for kind in asset_kinds(row)],
                "choices": {field: used_values(documents, field) for field in ("resolution", "language", "integration")}}

    def declare_asset(self, asset: str, kind: str, descriptor: str, values: dict) -> dict:
        """Add an entry of the given kind that declares an asset of the newest asset report, which no descriptor declares,
        to one of the game folder's descriptors that hold that kind (relative to the game folder), keeping the rest of its
        text; the descriptor it replaces is saved in the backups. Then generate the asset report again. Returns the
        library, the asset's id in the new report, and where the entry is."""
        def operation() -> dict:
            self.require_folders("destination")
            workspace_id, entry = self._active_workspace()
            row, game, documents = self._undeclared_asset(asset)
            if kind not in asset_kinds(row):
                raise AppError(f"{kind} entries cannot declare this asset")
            files = asset_files(row)
            if not all(file.is_file() for file in files):
                raise AppError("Its file does not exist any more. Rescan to update the report.", 409)
            try:
                declared = declared_files(game) if documents else set()
            except (OSError, ValueError, TypeError) as error:
                raise AppError(f"The descriptors cannot be read: {error_message(error)}") from error
            # A standalone Image may also be a sequence frame. Still refuse a stale inferred sequence whose frames
            # have since acquired an explicit ImageSequence declaration.
            if kind == 'ImageSequence' and row.get('sequence', {}).get('guessed'):
                declared = {(game / path).resolve() for document in documents.values()
                            for template, sequence, _entry in declared_paths(document) if sequence is not None
                            for path in expand_path(template)}
            if any(file in declared for file in files):
                raise AppError("A descriptor declares it now. Rescan to update the report.", 409)
            targets = {path.relative_to(game).as_posix(): path for path in descriptor_targets(documents, KINDS[kind], game)}
            if descriptor not in targets:
                raise AppError(f"{descriptor} is not a descriptor of the game that holds {KINDS[kind].list}", 400)
            resources = os.path.realpath(self._comparison(workspace_id, entry)[1]["resources_dir"])
            relative = os.path.relpath(targets[descriptor], resources)
            target = safe_path(resources, relative)
            try:
                new_entry = build_entry(kind, entry_paths(row, game), values)
                data = Path(target).read_bytes()
                bom = data.startswith(b"\xef\xbb\xbf")
                text, line = add_declaration(data[3 if bom else 0:].decode("utf-8"), KINDS[kind].list, new_entry)
                parse_dataclass(DOCUMENT_TYPES[Path(target).name], json.loads(text), descriptor)
            except (UnicodeDecodeError, ValueError) as error:
                raise AppError(error_message(error), 400) from error
            folder = backups.new_operation(self.backup_path)
            backup = os.path.join(folder, relative)
            os.makedirs(os.path.dirname(backup), exist_ok=True)
            _copy_exclusive(target, backup)
            _write_file(target, (b"\xef\xbb\xbf" if bom else b"") + text.encode("utf-8"))
            label = new_entry.get("id") or os.path.basename(row["resource"])
            message = f"Declared {label} in {descriptor}, as {kind}"
            self._record("edit", message, [_portable(relative)])
            backups.write_manifest(folder, action="edit", message=message,
                                   workspace={"id": workspace_id, "name": entry.get("name", workspace_id)}, root=resources)
            # The asset keeps its id, except a guessed sequence, which becomes the sequence that the entry declares. The
            # report gives the entry the line of its path, as it does every declaration.
            rows = self._write_asset_report()["assets"]
            found = next(((item, use) for item in rows for use in item["requiredBy"]
                          if _portable(use["descriptor"]) == descriptor and use["type"] == kind and use.get("id") == new_entry.get("id")
                          and (item["id"] == row["id"] or item.get("sequence") or item["resourcePath"] == row["resourcePath"])), None)
            return {"library": self.scan(), "asset": found[0]["id"] if found else None, "descriptor": descriptor,
                    "line": found[1]["line"] if found else line}

        return self._exclusive(operation)

    def _report_asset(self, workspace_id: str, asset: str) -> tuple[dict, list[dict]]:
        """An asset of the workspace's newest asset report, and every asset of the report."""
        report = self.asset_reports.report(workspace_id)
        if report is None:
            raise AppError("This workspace has no asset report yet. Click Rescan in the Asset library to create one.", 404)
        rows = json.loads(report).get("assets", [])
        row = next((row for row in rows if row["id"] == asset), None)
        if row is None:
            raise AppError("The asset is no longer in the asset report. Rescan and try again.", 404)
        return row, rows

    def _metadata_context(self) -> tuple[str, Path, Path]:
        workspace, entry = self._active_workspace()
        settings = self._comparison(workspace, entry)[1]
        game = self._asset_game(settings).resolve()
        return workspace, Path(settings['resources_dir']).resolve(), game

    def _metadata_sources(self, workspace: str, root: Path, assets: list[str], *, rows: list[dict] | None = None) -> list[Path | dict]:
        sources = []
        game = self._metadata_context()[2]
        if rows is None:
            report = self.asset_reports.report(workspace)
            rows = json.loads(report).get('assets', []) if report else []
        by_id = {row['id']: row for row in rows}
        for asset in assets:
            row = by_id.get(asset)
            if row is None:
                raise AppError('The asset is no longer in the asset report. Rescan and try again.', 404)
            if row['type'] != 'texture' or row.get('directory') or row.get('view'):
                raise AppError('Image metadata is available for Images and ImageSeq assets')
            for file in _asset_files(row):
                source = metadata_path(file, root)
                if source.suffix.lower() not in METADATA_EXTENSIONS:
                    raise AppError(f'Image analysis does not support {source.suffix} files')
                if not row.get('sequence'):
                    sources.append(source)
            if sequence := row.get('sequence'):
                if not sequence['frames']:
                    raise AppError('The animation has no frames')
                frames = [{'path': os.path.relpath(frame['resourcePath'], game).replace(os.sep, '/'),
                           **({'source': frame['source']} if frame.get('source') else {})} for frame in sequence['frames']]
                files = {frame['path']: str(metadata_path(original['resourcePath'], root))
                         for frame, original in zip(frames, sequence['frames'])}
                sources.append({'file': f'sequence:{row["id"]}', 'source': next(iter(files.values())),
                                'path': str(game / '.asset-metadata' / 'sequences' / f'{row["id"]}.imageseq.json'),
                                'sequence': {'id': sequence['id'], 'frameTime': sequence['frameTime'],
                                             'loopCount': sequence['loopCount'], 'loopTo': sequence['loopTo'],
                                             'paths': sequence['paths'], 'frames': frames, 'files': files,
                                             'descriptors': [str(metadata_path(game / use['descriptor'], root)) for use in row['requiredBy']]}})
        return list({target_key(target): target for target in sources}.values())

    def metadata_catalog(self, asset: str | None = None) -> dict:
        workspace, root, game = self._metadata_context()
        if asset:
            sources = self._metadata_sources(workspace, root, [asset])
        else:
            report = self.asset_reports.report(workspace)
            rows = json.loads(report).get('assets', []) if report else []
            eligible = [row['id'] for row in rows if row['type'] == 'texture' and row.get('scope') != 'outside' and all(
                        Path(file).suffix.lower() in METADATA_EXTENSIONS for file in _asset_files(row))]
            sources = self._metadata_sources(workspace, root, eligible, rows=rows)
            # Include manually created image drafts even before their image exists.
            sources.extend(Path(str(path)[:-5]) for path in game.rglob('*.json')
                           if Path(str(path)[:-5]).suffix.lower() in METADATA_EXTENSIONS and not path.is_symlink())
        sources = list({target_key(target): target for target in sources}.values())
        entries = []
        for target in sources:
            source, path, output, sequence = target_paths(target, root)
            entries.append({'file': target_key(target), 'kind': 'sequence' if sequence else 'image',
                            'name': (sequence['id'] or sequence['paths'][0]) if sequence else os.path.relpath(source, game).replace(os.sep, '/'),
                            'frameCount': len(sequence['frames']) if sequence else None,
                            'exists': all(Path(file).is_file() for file in sequence['files'].values()) if sequence else source.is_file(),
                            'metadata': path.is_file(), 'generated': output.is_file()})
        return {'workspace': workspace, 'game': str(game), 'files': entries}

    def _metadata_source(self, file: str, root: Path, game: Path) -> Path | dict:
        if file.startswith('sequence:'):
            target = self._metadata_sources(self._active_workspace()[0], root, [file.removeprefix('sequence:')])[0]
            if not isinstance(target, dict):
                raise AppError('Choose an ImageSeq asset')
            return target
        source = metadata_path(Path(file) if os.path.isabs(file) else game / file, root)
        if source.suffix.lower() not in METADATA_EXTENSIONS:
            raise AppError('Choose a supported image file')
        if not source.is_relative_to(game):
            # Other games' or common frames must belong to an asset in this report.
            catalog = self.metadata_catalog()
            if str(source) not in {item['file'] for item in catalog['files']}:
                raise AppError('This image does not belong to the active workspace', 404)
        return source

    def metadata_document(self, file: str) -> dict:
        _workspace, root, game = self._metadata_context()
        source = self._metadata_source(file, root, game)
        return self.image_metadata.document(source, root)

    def save_metadata(self, file: str, metadata: dict, revision: str) -> dict:
        _workspace, root, game = self._metadata_context()
        source = self._metadata_source(file, root, game)
        return self.image_metadata.save(source, root, metadata, revision)

    def queue_image_jobs(self, kind: str, assets: list[str], files: list[str], overwrite: bool = False) -> dict:
        workspace, root, game = self._metadata_context()
        sources = [*self._metadata_sources(workspace, root, assets),
                   *(self._metadata_source(file, root, game) for file in files)]
        if not sources:
            raise AppError('Choose at least one image or ImageSeq asset')
        return self.image_metadata.enqueue(workspace, root, game, sources, kind, overwrite=overwrite)

    def generated_image(self, file: str) -> str:
        _workspace, root, game = self._metadata_context()
        source = self._metadata_source(file, root, game)
        path = target_paths(source, root)[2]
        if not path.is_file():
            raise AppError('No generated image exists yet', 404)
        return str(path)

    def metadata_sequence_preview(self, file: str) -> bytes:
        _workspace, root, game = self._metadata_context()
        target = self._metadata_source(file, root, game)
        if not isinstance(target, dict):
            raise AppError('Choose an ImageSeq asset')
        return storyboard(target['sequence'], lambda path: metadata_image_data(metadata_path(path, root)))[0]

    @staticmethod
    def _key_uses(row: dict, rows: list[dict], game: Path) -> list[dict]:
        """The views that use the RssKeys of an asset of the asset report, the ids of the entries that declare it: the
        views of the game's v folder and the views the report lists, each with its asset id in the report (None when the
        report does not list it), path, name and the elements that use them."""
        keys = {(use["type"], use["id"]) for use in row["requiredBy"] if use.get("id")}
        if not keys:
            return []
        listed = {os.path.normpath(item["resourcePath"]): item for item in rows if item["type"] == "view"}
        views = dict.fromkeys([*sorted(os.path.normpath(path) for path in (game / VIEW_FOLDER).rglob("*.json") if is_view(path, game)), *sorted(listed)])
        resources = load_resources(game)
        found = []
        for path in views:
            try:
                elements = key_uses(Path(path), keys, resources)
                name = read_view(Path(path))["name"]
            except (OSError, ValueError, RecursionError):
                continue
            if elements:
                item = listed.get(path)
                found.append({"asset": item["id"] if item else None, "path": path, "resource": item["resource"] if item else os.path.relpath(path, game),
                              "name": name, "elements": elements})
        return found

    def asset_uses(self, asset: str) -> dict:
        """The views that use the RssKeys of an asset of the newest asset report, which removing it would leave without
        their resources."""
        workspace_id, entry = self._active_workspace()
        settings = self._comparison(workspace_id, entry)[1]
        row, rows = self._report_asset(workspace_id, asset)
        return {"views": self._key_uses(row, rows, self._asset_game(settings))}

    def remove_asset(self, asset: str, confirm_used: bool = False) -> dict:
        """Remove an asset of the newest asset report: the entries that declare it, from the descriptors that the report
        says declare it, and its files in the game folder, with each folder, below the game folder, that this leaves empty.
        A file that a descriptor still declares stays, and so does one outside the game folder, such as in the common
        folder, which other games share. An asset whose RssKeys views use is removed only when confirm_used says so. Each
        descriptor and file it changes is saved in one backup, which also records each removed entry, so that restoring it
        puts the same entry back, and the folders its files need. Then generate the asset report again. Returns the library
        and what was removed."""
        def operation() -> dict:
            self.require_folders("destination")
            workspace_id, entry = self._active_workspace()
            settings = self._comparison(workspace_id, entry)[1]
            row, rows = self._report_asset(workspace_id, asset)
            resources, game = os.path.realpath(settings["resources_dir"]), self._asset_game(settings)
            if not confirm_used and (views := self._key_uses(row, rows, game)):
                raise AppError(f"{len(views)} {'view uses' if len(views) == 1 else 'views use'} its RssKey; confirm to remove it anyway", 409)
            existing = [file for file in _asset_files(row) if os.path.lexists(file)]
            # Only the files of the game folder are deleted: the others are shared with other games.
            files = [file for file in existing if contained(str(game), file)]
            shared = [os.path.relpath(file, game) for file in existing if file not in files]
            for file in files:
                if not stat.S_ISREG(os.lstat(file).st_mode):
                    raise AppError("The game file is not a regular file")
            # The descriptors' text without the entries, before anything is written.
            edits: list[tuple[str, str, bool, str]] = []
            declarations: list[dict] = []
            for descriptor in dict.fromkeys(use["descriptor"] for use in row["requiredBy"]):
                relative = os.path.relpath(os.path.normpath(os.path.join(game, descriptor)), resources)
                path = safe_path(resources, relative)
                try:
                    data = Path(path).read_bytes()
                    bom = data.startswith(b"\xef\xbb\xbf")
                    text = data[3 if bom else 0:].decode("utf-8")
                    root = parse_json_source(text)
                    nodes = dict(walk(root))
                    keys = declaration_keys(root, row, game)
                    result, _counts = remove_declarations(Path(path), text, [row], game)
                except (OSError, UnicodeDecodeError, ValueError, TypeError) as error:
                    raise AppError(f"{descriptor}: {error_message(error)}", 400) from error
                if result == text:
                    continue
                declarations.extend({"path": _portable(relative), "list": key[-2], "entry": json.loads(text[nodes[key].start:nodes[key].end])}
                                    for key in keys if nodes[key].kind == "object" and len(key) >= 2 and isinstance(key[-2], str))
                edits.append((relative, path, bom, result))
            if row["requiredBy"] and not edits:
                raise AppError("Its declaration is not in the descriptors any more. Rescan to update the report.", 409)
            if not edits and not files:
                raise AppError("It has nothing to remove: no descriptor declares it and its files do not exist in the game folder. Rescan to update the report.", 409)
            folder = backups.new_operation(self.backup_path)
            for relative, path, bom, result in edits:
                backup = os.path.join(folder, relative)
                os.makedirs(os.path.dirname(backup), exist_ok=True)
                _copy_exclusive(path, backup)
                _write_file(path, (b"\xef\xbb\xbf" if bom else b"") + result.encode("utf-8"))
            try:
                declared = declared_files(game, tuple(settings["resource_paths"])) if files else set()
            except (OSError, ValueError) as error:
                raise AppError(f"The descriptors cannot be read: {error_message(error)}") from error
            deleted, kept, folders = [], [], []
            for file in files:
                if Path(file) in declared:
                    kept.append(os.path.relpath(file, game))
                    continue
                _delete_with_backup(file, os.path.join(folder, os.path.relpath(file, resources)))
                deleted.append(os.path.relpath(file, resources))
                folders.extend(_portable(os.path.relpath(item, game)) for item in _remove_empty_folders(os.path.dirname(file), str(game)))
            name = os.path.basename(row["resource"])
            parts = []
            if declarations:
                parts.append(f"its {len(declarations)} entr{'y' if len(declarations) == 1 else 'ies'}")
            if deleted:
                parts.append(f"{len(deleted)} file{'' if len(deleted) == 1 else 's'}")
            if folders:
                parts.append(f"{len(folders)} empty folder{'' if len(folders) == 1 else 's'}")
            message = f"Removed {name}: {', '.join(parts[:-1]) + ' and ' if len(parts) > 1 else ''}{parts[-1] if parts else 'nothing'}"
            self._record("cleanup", message, [_portable(item) for item in [*(item[0] for item in edits), *deleted]])
            backups.write_manifest(folder, action="cleanup", message=message, workspace={"id": workspace_id, "name": entry.get("name", workspace_id)},
                                   root=resources, declarations=declarations)
            self._write_asset_report()
            if not self.reports.status(workspace_id)["running"]:
                self.start_comparison()
            return {"library": self.scan(), "name": name, "entries": len(declarations), "files": len(deleted), "folders": folders,
                    "kept": kept, "shared": shared}

        return self._exclusive(operation)

    def browse_move_folder(self, chooser: Callable[[str], str | None]) -> dict:
        """Choose a destination on the desktop and convert it to a validated game-relative path."""
        self.require_folders('destination')
        workspace_id, entry = self._active_workspace()
        game = self._asset_game(self._comparison(workspace_id, entry)[1]).resolve()
        selected = chooser(str(game))
        if selected is None:
            return {'path': None}
        current_id, current_entry = self._active_workspace()
        current_game = self._asset_game(self._comparison(current_id, current_entry)[1]).resolve()
        if current_id != workspace_id or current_game != game:
            raise AppError('The workspace changed. Browse for a folder again.', 409)
        if not os.path.isabs(selected) or not contained(str(game), selected):
            raise AppError('Choose a folder inside this game.')
        chosen = self.move_folders(os.path.relpath(selected, game))
        if not chosen['exists']:
            raise AppError('The selected folder no longer exists.', 404)
        return {'path': chosen['path']}

    def move_folders(self, path: str = '') -> dict:
        """Browse immediate destination folders, including empty ones, inside the active game."""
        self.require_folders('destination')
        workspace_id, entry = self._active_workspace()
        game = self._asset_game(self._comparison(workspace_id, entry)[1]).resolve()
        relative = os.path.normpath(path.replace('\\', '/') or '.')
        folder = str(game) if relative == '.' else safe_path(str(game), relative)
        if not os.path.exists(folder):
            return {'path': _portable(os.path.relpath(folder, game)), 'exists': False, 'folders': []}
        if not os.path.isdir(folder):
            raise AppError('The selected path is not a folder')
        children = []
        with os.scandir(folder) as entries:
            for child in entries:
                if not _valid_name(child.name) or _is_link(child.stat(follow_symlinks=False)):
                    continue
                if child.is_dir(follow_symlinks=False):
                    children.append({'name': child.name, 'path': _portable(os.path.relpath(child.path, game))})
        return {'path': _portable(os.path.relpath(folder, game)), 'exists': True,
                'folders': sorted(children, key=lambda child: (child['name'].casefold(), child['name']))}

    def _move_plan(self, assets: list[str] | None, folder: str | None, target: str, name: str | None):
        """Resolve report selections and build a validated, read-only plan."""
        workspace_id, entry = self._active_workspace()
        workspace, settings = self._comparison(workspace_id, entry)
        game = self._asset_game(settings).resolve()
        resources = Path(settings["resources_dir"]).resolve()
        report = json.loads(self.asset_report())
        if bool(assets) == bool(folder):
            raise AppError("Choose assets or one report folder")
        if folder:
            if folder not in {item["path"] for item in report.get("folders", [])}:
                raise AppError("The folder is no longer in the report", 404)
            rows = [row for row in report["assets"] if row.get("folder") == folder]
        else:
            rows = [self._report_asset(workspace_id, asset)[0] for asset in dict.fromkeys(assets or [])]
        if not rows:
            raise AppError("Choose at least one asset")
        if name and (len(rows) != 1 or rows[0].get("sequence")):
            raise AppError("Only a single file or RTF folder can be renamed")
        def checked(relative: str) -> Path:
            relative = relative.replace('\\', '/')
            if os.path.isabs(relative):
                relative = os.path.relpath(relative, game)
            parts = Path(relative.replace('\\', '/')).parts
            if any(not _valid_name(part) or part.endswith((' ', '.')) or re.search(r'[<>:"|?*\x00-\x1f]', part)
                   or re.fullmatch(r'(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', part)
                   for part in parts if part not in ('.', '..', os.sep)):
                raise AppError("The target contains an invalid file or folder name")
            if os.path.normpath(relative) == '.':
                return game
            return Path(safe_path(str(game), relative))
        if name and (name in ('.', '..') or '/' in name or '\\' in name):
            raise AppError("Use a file name without folders")
        destination = checked(target or '.')
        mapping: dict[Path, Path] = {}
        for row in rows:
            source_files = list(map(Path, _asset_files(row)))
            if row.get('directory'):
                source_files = sorted(set(source_files) | {file for file in Path(row['resourcePath']).rglob('*') if file.is_file()})
            if folder:
                base = Path(folder)
            elif row.get('directory'):
                base = Path(row['resourcePath'])
            else:
                base = source_files[0].parent if source_files else game
            if not target and not folder and source_files:
                origin = Path(row.get('folder') or str(game))
                parent = Path(row['resourcePath']).parent if row.get('directory') else source_files[0].parent
                destination = checked(str(parent.relative_to(origin)))
            for source in source_files:
                if folder:
                    relative = source.relative_to(base)
                elif row.get('directory'):
                    relative = Path(name or base.name) / source.relative_to(base)
                else:
                    relative = Path(name or source.name)
                mapped = checked(str(destination / relative))
                if source in mapping and mapping[source] != mapped:
                    raise AppError('The selection gives one source multiple targets')
                mapping[source] = mapped
        index = rss_refactor.references(game, resources)
        plan = rss_refactor.plan_move(index, mapping, game, resources)
        configured = {(game / file).resolve() for template in settings['resource_paths'] for file in expand_path(template)}
        if configured & mapping.keys():
            plan.issue('resource-paths', 'A selected file is named by resource_paths in workspace.json. Update that setting first.', configured & mapping.keys())
        if not plan.files:
            plan.issue('no-changes', 'Choose a different target folder or file name.')
        plan.revisions['@workspace'] = hashlib.sha256(json.dumps(workspace, sort_keys=True).encode()).hexdigest()
        return plan.finish(), index, rows, mapping

    def move_preview(self, assets: list[str] | None = None, folder: str | None = None, target: str = '', name: str | None = None) -> dict:
        try:
            return self._move_plan(assets, folder, target, name)[0].json()
        except (ValueError, OSError, UnicodeError) as error:
            raise AppError(f"Cannot preview the move: {error_message(error)}") from error

    def _apply_refactor(self, plan, index, fingerprint: str, action: str) -> dict:
        """Prevalidate every edit, apply in dependency order and roll back failures from one backup."""
        if plan.fingerprint != fingerprint:
            raise AppError("The files changed; preview again", 409)
        if plan.blockers:
            raise AppError("The change is blocked; resolve the preview's blockers first", 409)
        workspace_id, entry = self._active_workspace()
        root = str(index.resources)
        folder = backups.new_operation(self.backup_path)
        changes = {}
        for file, edits in plan.edits.items():
            if not any(edit.get('selected', True) for edit in edits):
                continue
            path = safe_path(root, os.path.relpath(file, root))
            original = Path(path).read_bytes()
            text = rss_refactor.apply_edits(original.decode('utf-8-sig'), edits, Path(file))
            changes[file] = (b'\xef\xbb\xbf' if original.startswith(b'\xef\xbb\xbf') else b'') + text.encode('utf-8')
        # Recheck all bytes after computing new texts, before the first mutation.
        for file, revision in plan.revisions.items():
            if not file.startswith('@') and rss_refactor.sha256(Path(file)) != revision:
                raise AppError("The files changed; preview again", 409)
        created, saved = [], []
        try:
            for item in plan.files:
                if item['mode'] == 'reuse':
                    continue
                relative = os.path.relpath(item['target'], root)
                if os.path.lexists(item['target']):
                    raise AppError("The target appeared; preview again", 409)
                _replace_file(item['source'], root, relative, os.path.join(folder, relative), create_parents=True, must_create=True,
                              expected_hash=item['sha256'])
                created.append({'path': _portable(relative), 'sha256': item['sha256']})
            for file, data in changes.items():
                path = safe_path(root, os.path.relpath(file, root))
                if file_hash(path) != plan.revisions[file]:
                    raise AppError("The files changed; preview again", 409)
                relative = os.path.relpath(file, root)
                backup = os.path.join(folder, relative)
                os.makedirs(os.path.dirname(backup), exist_ok=True)
                _copy_exclusive(path, backup)
                saved.append((path, backup))
                _write_file(path, data)
            for item in plan.files:
                if item['mode'] != 'move':
                    continue
                source = safe_path(root, os.path.relpath(item['source'], root))
                if file_hash(source) != item['sha256']:
                    raise AppError("The source changed; preview again", 409)
                backup = os.path.join(folder, os.path.relpath(source, root))
                _delete_with_backup(source, backup)
                saved.append((source, backup))
                _remove_empty_folders(os.path.dirname(source), str(index.game))
            message = (f"Moved or copied {len(plan.files)} files into the game" if action == 'move'
                       else 'Renamed an RssKey and its references')
            backups.write_manifest(folder, action=action, message=message, workspace={'id': workspace_id, 'name': entry['name']},
                                   root=root, created=created)
        except Exception:
            # Restore old files before deleting the new copies; references always have their files.
            for path, backup in reversed(saved):
                path = safe_path(root, os.path.relpath(path, root), create_parents=True)
                temporary = path + f'.rollback-{uuid.uuid4()}'
                try:
                    shutil.copy2(backup, temporary)
                    os.replace(temporary, path)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
            for item in created:
                path = safe_path(root, item['path'])
                if os.path.isfile(path) and file_hash(path) == item['sha256']:
                    os.unlink(path)
                    _remove_empty_folders(os.path.dirname(path), str(index.game))
            shutil.rmtree(folder, ignore_errors=True)
            Path(f'{folder}.json').unlink(missing_ok=True)
            raise
        self._record(action, message)
        result = self._write_asset_report()
        self.start_comparison()
        return result

    def move_assets(self, *, fingerprint: str, assets: list[str] | None = None, folder: str | None = None,
                    target: str = '', name: str | None = None) -> dict:
        def operation() -> dict:
            try:
                plan, index, rows, mapping = self._move_plan(assets, folder, target, name)
                result = self._apply_refactor(plan, index, fingerprint, 'move')
            except (ValueError, OSError, UnicodeError) as error:
                raise AppError(f"Could not move the assets: {error_message(error)}", 409) from error
            ids = {}
            new_files = [(new, set(_asset_files(new))) for new in result['assets']]
            for row in rows:
                mapped = {str(mapping[Path(file)]) for file in _asset_files(row)}
                candidates = [(new, files) for new, files in new_files if mapped & files]
                # A still Image and a sequence can share a frame. Follow the same asset and complete file set,
                # rather than whichever row happens to list that frame first. A loose file can also join a guessed group.
                match = next((new for new, files in candidates if files == mapped and new['requiredBy'] == row['requiredBy']
                              and bool(new.get('sequence')) == bool(row.get('sequence'))
                              and bool(new.get('directory')) == bool(row.get('directory'))),
                             candidates[0][0] if candidates else None)
                if match:
                    ids[row['id']] = match['id']
            return {'library': self.scan(), 'assets': ids}
        return self._exclusive(operation)

    def _rename_plan(self, kind: str, key: str, new_key: str, excluded: list[str] | None):
        workspace_id, entry = self._active_workspace()
        workspace, settings = self._comparison(workspace_id, entry)
        game, resources = self._asset_game(settings), Path(settings['resources_dir']).resolve()
        index = rss_refactor.references(game, resources)
        plan = rss_refactor.plan_key_rename(index, kind, key, new_key, excluded or [])
        plan.revisions['@workspace'] = hashlib.sha256(json.dumps(workspace, sort_keys=True).encode()).hexdigest()
        return plan.finish(), index

    def rename_key_preview(self, kind: str, key: str, new_key: str, excluded: list[str] | None = None) -> dict:
        try:
            return self._rename_plan(kind, key, new_key, excluded)[0].json()
        except (ValueError, OSError, UnicodeError) as error:
            raise AppError(f"Cannot preview the rename: {error_message(error)}") from error

    def rename_key(self, kind: str, key: str, new_key: str, fingerprint: str, excluded: list[str] | None = None) -> dict:
        def operation() -> dict:
            try:
                plan, index = self._rename_plan(kind, key, new_key, excluded)
                self._apply_refactor(plan, index, fingerprint, 'rename')
                return {'library': self.scan()}
            except (ValueError, OSError, UnicodeError) as error:
                raise AppError(f"Could not rename the RssKey: {error_message(error)}", 409) from error
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
            workspace_id, _entry = self._active_workspace()
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
                message = f"Synced {len(copied)} asset{'' if len(copied) == 1 else 's'} to Game"
                self._record("sync", message, copied, total)
                backups.write_manifest(os.path.join(self.backup_path, operation_id), action="sync", message=message,
                                       workspace={"id": workspace_id, "name": config["name"]}, root=os.path.realpath(config["destination"]))
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
                "backups": backups.new_operation(self.backup_path),
            }
            failures: list[dict] = []
            synced = self._copy_resources(chosen["different"], folders, settings["resource_paths"], failures, sources)
            removed = self._remove_declarations(chosen["invalid"], folders, failures)
            deleted = self._delete_resources(chosen["supplementary"], folders, settings["resource_paths"], failures)
            messages: list[str] = []
            if synced["files"]:
                count = synced["resources"]
                messages.append(f"Synced {count} resource{'' if count == 1 else 's'} to Game")
                self._record("sync", messages[-1], synced["files"], synced["bytes"])
            if removed["resources"]:
                count = removed["resources"]
                messages.append(f"Removed the declarations of {count} invalid resource{'' if count == 1 else 's'}")
                self._record("cleanup", messages[-1], removed["files"])
            if deleted["resources"]:
                count = deleted["resources"]
                messages.append(f"Deleted {count} supplementary resource{'' if count == 1 else 's'} from Game")
                self._record("cleanup", messages[-1], deleted["files"])
            # The files replaced and deleted are kept in one backup of the whole operation.
            backups.write_manifest(folders["backups"], action="sync" if synced["files"] else "cleanup",
                                   message="; ".join(messages) or "Applied resources of the GDA sync report",
                                   workspace={"id": workspace_id, "name": entry.get("name", workspace_id)}, root=folders["resources"])
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
            if extension in MOVIE_EXTENSIONS:
                entry.update(describe_movie(path))
                details[file] = entry
                continue
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
                     cuts: tuple[int, ...] | None = None, text: str | None = None) -> bytes:
        """A view composed as a PNG image, as wide as width (a card's width by default), with its hidden elements on
        request, cropped to what it draws on request, or only one segment of it, between the elements that the page
        draws itself (cuts). Its Text elements draw the sample text (DEFAULT_SAMPLE unless one is given; none when it is
        empty)."""
        path, game, roots = self._view(file)
        try:
            return render_view(path, width or THUMBNAIL_WIDTH, hidden, game, roots, crop, segment, cuts, DEFAULT_SAMPLE if text is None else text)
        except FileNotFoundError as error:
            raise AppError("File not found", 404) from error
        except (OSError, ValueError, RecursionError) as error:
            raise AppError(error_message(error), 415) from error

    def view_details(self, file: str, text: str | None = None) -> dict:
        """Every element of a view, with what it draws and the area it covers, for the details to outline, and each Text
        element's sample text as it is drawn (DEFAULT_SAMPLE unless one is given)."""
        path, game, roots = self._view(file)
        try:
            return view_layout(path, game, roots, DEFAULT_SAMPLE if text is None else text)
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
                folder = backups.new_operation(self.backup_path)
                backup = os.path.join(folder, relative)
                os.makedirs(os.path.dirname(backup), exist_ok=True)
                _copy_exclusive(target, backup)
                _write_file(target, result)
                count = len(positions)
                message = f"Moved {count} element{'' if count == 1 else 's'} of {path.stem}"
                self._record("edit", message, [relative.replace(os.sep, "/")])
                backups.write_manifest(folder, action="edit", message=message,
                                       workspace={"id": workspace_id, "name": entry.get("name", workspace_id)}, root=resources)
            try:
                layout = view_layout(path, game, roots)
            except (OSError, ValueError, RecursionError) as error:
                raise AppError(error_message(error), 415) from error
            return {"layout": layout, "library": self.scan()}

        return self._exclusive(operation)

    @staticmethod
    def _text_data(path: str) -> bytes:
        """The bytes of a text file that the asset details edit: of a kind of text file, not too large, and UTF-8."""
        if os.path.splitext(path)[1][1:].lower() not in TEXT_EXTENSIONS:
            raise AppError("This is not a kind of text file that can be edited", 415)
        try:
            if os.path.getsize(path) > MAX_TEXT_BYTES:
                raise AppError(f"The file is larger than {MAX_TEXT_BYTES // 1024} KB, too large to edit here", 413)
            data = Path(path).read_bytes()
        except FileNotFoundError as error:
            raise AppError("File not found", 404) from error
        try:
            data[3 if data.startswith(b"\xef\xbb\xbf") else 0:].decode("utf-8")
        except UnicodeDecodeError as error:
            raise AppError("The file is not UTF-8 text", 415) from error
        return data

    def text_file(self, file: str) -> dict:
        """A text file of the active workspace's resources, game or GDA, as the asset details edit it: its text, and its
        revision, which saving it must give back."""
        data = self._text_data(self._resource_path(file))
        bom = data.startswith(b"\xef\xbb\xbf")
        return {"text": data[3 if bom else 0:].decode("utf-8"), "revision": hashlib.sha256(data).hexdigest()[:16]}

    def save_text_file(self, file: str, text: str, revision: str) -> dict:
        """Replace the text of a text file of the game's resources, keeping its byte order mark, and save the file it replaces
        in the backups. revision is the file the text was edited from: a file changed since is refused. A .json file must
        stay valid JSON, and a descriptor a valid descriptor. Then generate the asset report again. Returns the new
        revision and the library."""
        def operation() -> dict:
            self.require_folders("destination")
            path = self._resource_path(file)
            workspace_id, entry = self._active_workspace()
            resources = os.path.realpath(self._comparison(workspace_id, entry)[1]["resources_dir"])
            if not contained(resources, path):
                raise AppError("Only the files of the game's resources can be edited", 403)
            data = self._text_data(path)
            if hashlib.sha256(data).hexdigest()[:16] != revision:
                raise AppError("The file changed on disk since it was opened. Open it again to edit it.", 409)
            relative = os.path.relpath(path, resources)
            if path.lower().endswith(".json"):
                try:
                    document = json.loads(text)
                    if (cls := DOCUMENT_TYPES.get(os.path.basename(path))) is not None:
                        parse_dataclass(cls, document, relative)
                except (ValueError, TypeError, RecursionError) as error:
                    raise AppError(f"Not saved: {error_message(error)}", 400) from error
            result = (b"\xef\xbb\xbf" if data.startswith(b"\xef\xbb\xbf") else b"") + text.encode("utf-8")
            if len(result) > MAX_TEXT_BYTES:
                raise AppError(f"The text is larger than {MAX_TEXT_BYTES // 1024} KB", 413)
            if result != data:
                folder = backups.new_operation(self.backup_path)
                backup = os.path.join(folder, relative)
                os.makedirs(os.path.dirname(backup), exist_ok=True)
                _copy_exclusive(path, backup)
                _write_file(path, result)
                message = f"Edited {os.path.basename(path)}"
                self._record("edit", message, [_portable(relative)])
                backups.write_manifest(folder, action="edit", message=message,
                                       workspace={"id": workspace_id, "name": entry.get("name", workspace_id)}, root=resources)
                self._write_asset_report()
            return {"revision": hashlib.sha256(result).hexdigest()[:16], "library": self.scan()}

        return self._exclusive(operation)

    def view_text(self, file: str, index: int, text: str | None = None) -> bytes:
        """A Text element's sample text as a PNG image at its own size, for the page to draw a moved one."""
        path, game, roots = self._view(file)
        try:
            return render_text(path, index, DEFAULT_SAMPLE if text is None else text, game, roots)[0]
        except FileNotFoundError as error:
            raise AppError("File not found", 404) from error
        except (OSError, ValueError, ImportError, RecursionError) as error:
            raise AppError(error_message(error), 415) from error

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

    def movie_file(self, file: str) -> tuple[str, str]:
        """A movie inside the active workspace's resources and GDA folders, to stream as it is, and the type the browser
        plays it as."""
        path = self._resource_path(file)
        extension = os.path.splitext(path)[1][1:].lower()
        if extension not in MOVIE_EXTENSIONS:
            raise AppError("No preview for this file", 415)
        if not os.path.isfile(path):
            raise AppError("File not found", 404)
        return path, MOVIE_EXTENSIONS[extension]

    def movie_thumbnail(self, file: str, stacked: bool = False) -> tuple[bytes, str]:
        """The frame in the middle of a movie, with the alpha of a valpha one when stacked, cached by file, time and
        size like decoded DDS textures."""
        path, _mime = self.movie_file(file)
        info = os.stat(path)
        key = f"{path}:{info.st_mtime_ns}:{info.st_size}:{'stacked' if stacked else 'frame'}"
        with self._previews_lock:
            cached = self._previews.get(key)
        if cached is not None:
            return cached
        try:
            result = movie_thumbnail(path, stacked)
        except ValueError as error:
            raise AppError(error_message(error), 415) from error
        with self._previews_lock:
            while len(self._previews) >= PREVIEW_CACHE_SIZE:
                self._previews.popitem(last=False)
            self._previews[key] = result
        return result

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
