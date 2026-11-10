"""Actual helper executions and content changes for a View layout session."""

from __future__ import annotations

import atexit
import hashlib
import json
import os
import shlex
import sys
import time
import uuid
from pathlib import Path

AUDIT_ENV = "GDA_VIEW_LAYOUT_AUDIT"
CONTEXT_ENV = "GDA_VIEW_LAYOUT_CONTEXT"


def fingerprint(path: Path) -> str:
    """Compare bytes, including formatting, rather than git's pre-existing changes."""
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def view_snapshot(game: Path) -> dict[str, str]:
    """The workspace's view files, including descriptors so unexpected edits are visible."""
    root = game / "v"
    if root.is_symlink():
        raise OSError(f"Cannot track a linked views folder: {root}")
    try:
        root.stat()
    except FileNotFoundError:
        return {}
    result = {}

    def unreadable(error):
        raise error

    for folder, directories, files in os.walk(root, onerror=unreadable):
        if any((Path(folder) / name).is_symlink() for name in directories):
            raise OSError(f"Cannot track linked view folders in {folder}")
        for name in files:
            path = Path(folder) / name
            if path.is_symlink():
                raise OSError(f"Cannot track a linked view file: {path}")
            result[path.relative_to(game).as_posix()] = fingerprint(path)
    return result


def changed_files(before: dict[str, str], after: dict[str, str]) -> list[dict]:
    return [{"path": path, "change": "added" if path not in before else "deleted" if path not in after else "modified"}
            for path in sorted(before.keys() | after.keys()) if before.get(path) != after.get(path)]


class HelperTrace:
    """Start before heavy imports; finish even when parsing, imports or the command fail.

    JSONL records are appended in a single write so concurrent helper processes keep separate calls.
    The helper's stdout remains available for machine-readable results.
    """

    def __init__(self):
        self.started = time.perf_counter()
        self.id = uuid.uuid4().hex
        self.exit_code = 1
        self.argv = list(getattr(sys, "orig_argv", [sys.executable, *sys.argv]))
        self.event("started", argv=self.argv, arguments=sys.argv[1:], cwd=os.getcwd(), startedAt=time.time())
        atexit.register(self.finish)

    def event(self, event: str, **fields) -> None:
        path = os.environ.get(AUDIT_ENV)
        if path:
            data = (json.dumps({"id": self.id, "event": event, **fields}, ensure_ascii=False) + "\n").encode()
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            try:
                if os.write(descriptor, data) != len(data):
                    raise OSError("Could not write the complete view-layout trace")
            finally:
                os.close(descriptor)

    def validate(self, preview: str, workspace: str) -> dict:
        """Confirm the skill received the uploaded image and workspace in their positional order."""
        context = json.loads(os.environ.get(CONTEXT_ENV, "{}"))
        if context and [preview, workspace] != context["arguments"]:
            raise ValueError("Skill arguments do not match the uploaded preview and selected workspace (in that order)")
        path = Path(preview)
        if not workspace.strip() or not path.is_file():
            raise ValueError("A preview image file and workspace id are required")
        from PIL import Image  # Keep trace startup independent of imaging imports.
        with Image.open(path) as image:
            image.verify()
        if context and fingerprint(path) != context["previewSha256"]:
            raise ValueError("The uploaded preview changed before the skill started")
        self.event("validated", arguments=[preview, workspace])
        return {"preview": preview, "workspace": workspace, "validated": True}

    def finish(self) -> None:
        duration = time.perf_counter() - self.started
        self.event("finished", durationSeconds=duration, finishedAt=time.time(), exitCode=self.exit_code)
        print(f"view_layout.py: {shlex.join(self.argv)}\n"
              f"view_layout.py: {duration:.3f}s · exit {self.exit_code}", file=sys.stderr)
