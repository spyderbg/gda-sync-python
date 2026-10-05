"""Run the GDA sync comparison in a background process; keep each workspace's latest report and run history as JSON."""

import hashlib
import json
import multiprocessing
import os
import re
import sys
import threading
import uuid
from datetime import datetime, timezone

from .rss_sync import run_in_process

REPORT_VERSION = 1
SAFE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}")
# The report rows are large; status requests only need the rest.
ROWS = ("differences", "identical")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _history(report: dict) -> list[dict]:
    """The runs recorded in a report; a report saved before runs were kept yields its last run."""
    if isinstance(report.get("history"), list):
        return report["history"]
    last = report.get("lastRun")
    if not isinstance(last, dict):
        return []
    return [{**last, "summary": report["summary"]} if last.get("state") == "succeeded" and report.get("summary") else last]


def report_name(workspace_id: str) -> str:
    """A file name for the workspace's report; ids that are not plain file names are hashed."""
    if SAFE_ID.fullmatch(workspace_id):
        return f"{workspace_id}.json"
    return f"workspace-{hashlib.sha256(workspace_id.encode()).hexdigest()[:16]}.json"


class SyncJobs:
    """At most one comparison per workspace runs at a time, each in its own process."""

    def __init__(self, folder: str):
        self.folder = folder
        self._lock = threading.Lock()
        self._running: dict[str, dict] = {}
        self._headers: dict[str, tuple[tuple[int, int], dict | None]] = {}

    def report_file(self, workspace_id: str) -> str:
        return os.path.join(self.folder, report_name(workspace_id))

    def start(self, workspace_id: str, workspace_name: str, settings: dict) -> None:
        # Spawn, not fork: the server runs threads, and a frozen executable can only spawn.
        context = multiprocessing.get_context("spawn")
        with self._lock:
            if workspace_id in self._running:
                return
            receiver, sender = context.Pipe(duplex=False)
            process = context.Process(target=run_in_process, args=(settings, sender), name=f"gda-sync-{workspace_id}", daemon=True)
            job = {"startedAt": _now(), "progress": None, "process": process, "done": threading.Event(), "stopped": False}
            self._running[workspace_id] = job
        try:
            process.start()
        except Exception as error:
            receiver.close()
            self._finish(workspace_id, workspace_name, job, None, f"Could not start the sync process: {error}")
            return
        finally:
            sender.close()
        threading.Thread(target=self._watch, args=(workspace_id, workspace_name, job, receiver), daemon=True).start()

    def _watch(self, workspace_id: str, workspace_name: str, job: dict, receiver) -> None:
        result = error = None
        try:
            while True:
                try:
                    kind, payload = receiver.recv()
                except (EOFError, OSError):
                    break
                if kind == "progress":
                    with self._lock:
                        job["progress"] = payload
                elif kind == "result":
                    result = payload
                elif kind == "error":
                    error = payload
        finally:
            receiver.close()
        job["process"].join()
        if result is None and error is None:
            error = "The sync was stopped when the application closed." if job["stopped"] else \
                f"The sync process stopped unexpectedly (exit code {job['process'].exitcode})."
        self._finish(workspace_id, workspace_name, job, result, error)

    def _finish(self, workspace_id: str, workspace_name: str, job: dict, result: dict | None, error: str | None) -> None:
        run = {"state": "failed" if error else "succeeded", "startedAt": job["startedAt"], "finishedAt": _now()}
        if error:
            run["error"] = error
        # A failed run keeps the previous result, so the report always holds the latest successful comparison.
        previous = self._read(workspace_id) or {}
        base = {"version": REPORT_VERSION, "workspace": {"id": workspace_id, "name": workspace_name}}
        if result is not None:
            report = {**base, "startedAt": run["startedAt"], "finishedAt": run["finishedAt"], **result}
        else:
            report = {**base, **{key: value for key, value in previous.items() if key not in base}}
        report["lastRun"] = run
        # Every run is kept, newest first, with the counts of a successful one.
        report["history"] = [{**run, **({"summary": result["summary"]} if result else {})}, *_history(previous)]
        try:
            self._write(self.report_file(workspace_id), report)
        except OSError as write_error:
            print(f"EGT GDA Sync: could not save the sync report: {write_error}", file=sys.stderr, flush=True)
        finally:
            with self._lock:
                self._running.pop(workspace_id, None)
            job["done"].set()

    def _write(self, file: str, data: dict) -> None:
        os.makedirs(self.folder, exist_ok=True)
        temporary = os.path.join(self.folder, f".{os.path.basename(file)}-{uuid.uuid4()}")
        try:
            with open(temporary, "w", encoding="utf-8") as handle:
                json.dump(data, handle, indent=2, ensure_ascii=False)
            os.replace(temporary, file)
        except BaseException:
            if os.path.exists(temporary):
                os.unlink(temporary)
            raise

    def _read(self, workspace_id: str) -> dict | None:
        try:
            with open(self.report_file(workspace_id), encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError):
            return None
        return data if isinstance(data, dict) else None

    def _header(self, workspace_id: str) -> dict | None:
        """The report without its rows, cached until the file changes."""
        try:
            info = os.stat(self.report_file(workspace_id))
        except OSError:
            return None
        key = (info.st_mtime_ns, info.st_size)
        cached = self._headers.get(workspace_id)
        if cached and cached[0] == key:
            return cached[1]
        data = self._read(workspace_id)
        header = {name: value for name, value in data.items() if name not in ROWS} if data else None
        self._headers[workspace_id] = (key, header)
        return header

    def report(self, workspace_id: str) -> bytes | None:
        """The latest report file as stored, or None before the first run."""
        try:
            with open(self.report_file(workspace_id), "rb") as handle:
                return handle.read()
        except FileNotFoundError:
            return None

    def history(self, workspace_id: str) -> list[dict]:
        """Every finished run of the workspace, newest first."""
        return _history(self._header(workspace_id) or {})

    def status(self, workspace_id: str) -> dict:
        with self._lock:
            job = self._running.get(workspace_id)
            running = {"startedAt": job["startedAt"], "progress": job["progress"]} if job else None
        header = self._header(workspace_id) or {}
        return {
            "workspaceId": workspace_id,
            "running": running is not None,
            "startedAt": running["startedAt"] if running else None,
            "progress": running["progress"] if running else None,
            "lastRun": header.get("lastRun"),
            "comparedAt": header.get("finishedAt"),
            "summary": header.get("summary"),
        }

    def wait(self, workspace_id: str, timeout: float | None = None) -> None:
        """Block until the workspace's running comparison has finished and saved its report."""
        with self._lock:
            job = self._running.get(workspace_id)
        if job:
            job["done"].wait(timeout)

    def stop_all(self) -> None:
        """Stop running comparisons, for example when the application shuts down."""
        with self._lock:
            jobs = list(self._running.values())
        for job in jobs:
            job["stopped"] = True
            if job["process"].is_alive():
                job["process"].terminate()
        for job in jobs:
            job["done"].wait(5)
