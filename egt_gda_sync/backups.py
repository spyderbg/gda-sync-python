"""The backups: the files that the app's operations replaced or deleted, kept to be restored.

Each operation that changes game files saves the files it replaces or deletes in a folder of its own,
<backups>/<operation id>/, at their paths relative to the folder it changed (root): the resources folder of the
workspace, or for the asset library's older sync its game folder. Beside the folder, <operation id>.json records the
operation: when, its action and message, the workspace, root, and each file with whether it was replaced or deleted.
Backups from before these records are listed too: when their files' paths all start with the game folder of a
workspace, they are that workspace's, relative to its resources folder; otherwise where they belong is not known, and
they cannot be restored.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from collections.abc import Callable
from datetime import datetime, timezone

MANIFEST_VERSION = 1
# An operation's id: the name of its folder.
OPERATION_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")

# Where an operation without a record belongs: its workspace ({"id", "name"}) and root, from its files' paths, or None.
Resolver = Callable[[list[str]], tuple[dict, str] | None]


def _hash(file: str) -> str:
    digest = hashlib.sha256()
    with open(file, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _time(seconds: float) -> str:
    moment = datetime.fromtimestamp(seconds, timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def new_operation(backup_path: str) -> str:
    """The folder for a new operation's backups; it is created when a file is saved in it."""
    return os.path.join(backup_path, str(uuid.uuid4()))


def _files(folder: str) -> list[str]:
    """The files of an operation's folder, by their paths relative to it with forward slashes, sorted."""
    found = []
    for directory, _folders, names in os.walk(folder):
        for name in names:
            found.append(os.path.relpath(os.path.join(directory, name), folder).replace(os.sep, "/"))
    return sorted(found)


def write_manifest(folder: str, *, action: str, message: str, workspace: dict, root: str, date: str | None = None) -> None:
    """Record an operation whose backups are in folder, if it saved any: each file was replaced when root still has it,
    deleted when it does not."""
    if not os.path.isdir(folder):
        return
    files = [{"path": path, "change": "replaced" if os.path.isfile(os.path.join(root, *path.split("/"))) else "deleted"}
             for path in _files(folder)]
    record = {"version": MANIFEST_VERSION, "id": os.path.basename(folder), "date": date or _time(datetime.now(timezone.utc).timestamp()),
              "action": action, "message": message, "workspace": workspace, "root": root, "files": files}
    temporary = f"{folder}.json.{uuid.uuid4()}.tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(record, handle, indent=2, ensure_ascii=False)
    os.replace(temporary, f"{folder}.json")


def _record(backup_path: str, operation_id: str, resolve: Resolver) -> dict | None:
    """An operation as its record says, or for one without a record, as its files tell; None when it has no folder."""
    folder = os.path.join(backup_path, operation_id)
    if not OPERATION_ID.fullmatch(operation_id) or not os.path.isdir(folder):
        return None
    paths = _files(folder)
    try:
        with open(f"{folder}.json", encoding="utf-8") as handle:
            record = json.load(handle)
        if not isinstance(record, dict) or not isinstance(record.get("files"), list) or not isinstance(record.get("root"), str):
            raise ValueError("not a backup record")
    except (OSError, ValueError):
        found = resolve(paths)
        newest = max((os.path.getmtime(os.path.join(folder, *path.split("/"))) for path in paths), default=os.path.getmtime(folder))
        return {"id": operation_id, "date": _time(newest), "action": "backup", "message": "", "legacy": True,
                "workspace": found[0] if found else None, "root": found[1] if found else None,
                "files": [{"path": path, "change": "replaced"} for path in paths]}
    changes = {item.get("path"): item.get("change") for item in record["files"] if isinstance(item, dict)}
    # The folder's files are the backups, whatever the record lists.
    return {"id": operation_id, "date": str(record.get("date") or ""), "action": str(record.get("action") or "backup"),
            "message": str(record.get("message") or ""), "legacy": False,
            "workspace": record.get("workspace") if isinstance(record.get("workspace"), dict) else None, "root": record["root"],
            "files": [{"path": path, "change": changes.get(path) if changes.get(path) in ("replaced", "deleted") else "replaced"} for path in paths]}


def list_operations(backup_path: str, resolve: Resolver) -> list[dict]:
    """Every operation's backups, newest first, with how many files they hold and their size."""
    try:
        names = [name for name in os.listdir(backup_path) if os.path.isdir(os.path.join(backup_path, name))]
    except OSError:
        return []
    operations = []
    for name in names:
        record = _record(backup_path, name, resolve)
        if record is None or not record["files"]:
            continue
        folder = os.path.join(backup_path, name)
        size = sum(os.path.getsize(os.path.join(folder, *item["path"].split("/"))) for item in record["files"])
        operations.append({**{key: value for key, value in record.items() if key != "files"}, "fileCount": len(record["files"]),
                           "size": size, "restorable": record["root"] is not None})
    return sorted(operations, key=lambda item: item["date"], reverse=True)


def operation(backup_path: str, operation_id: str, resolve: Resolver) -> dict | None:
    """An operation's backups with each file's size and how the file is now: the same as its backup, changed since, or
    missing (deleted, or not restored yet)."""
    record = _record(backup_path, operation_id, resolve)
    if record is None:
        return None
    folder = os.path.join(backup_path, operation_id)
    for item in record["files"]:
        backup = os.path.join(folder, *item["path"].split("/"))
        item["size"] = os.path.getsize(backup)
        current = os.path.join(record["root"], *item["path"].split("/")) if record["root"] else None
        if current is None:
            item["now"] = "unknown"
        elif not os.path.isfile(current):
            item["now"] = "missing"
        else:
            item["currentPath"] = current
            same = os.path.getsize(current) == item["size"] and _hash(current) == _hash(backup)
            item["now"] = "same" if same else "changed"
    return record
