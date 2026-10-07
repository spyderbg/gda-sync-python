"""Run the GDA sync comparison in a background process, and save each run of a workspace as a timestamped JSON report.

Every run writes <workspace id>-<Unix time>.json, the epoch seconds when it finished. A file describes only the run
that wrote it: its "workspace" (the settings it used) and its "summary" (the run's state, times and any error, then the
counts of a successful run). A successful run's report also holds its full result around the summary. The workspace's
history is the list of these files.
"""

import hashlib
import json
import multiprocessing
import os
import re
import sys
import threading
import uuid
from datetime import datetime, timezone

from .rss_sync import Progress, compare_settings, run_in_process

# Version 3 reports an image sequence as one row with its frames, where version 2 had a row per frame file. Version 2
# keeps the run's settings only in "workspace"; version 1 also repeated them at the top level.
REPORT_VERSION = 3
SAFE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}")
# Reports saved by an earlier version are named with this UTC date and time instead of epoch seconds.
DATE_STAMP = "%Y%m%dT%H%M%SZ"
# The rows are large, and the history kept inside reports by an earlier version is not used.
SKIPPED = ("differences", "identical", "history")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


RUN_FIELDS = ("state", "startedAt", "finishedAt", "error")


def _summary(report: dict | None) -> dict:
    summary = (report or {}).get("summary")
    return summary if isinstance(summary, dict) else {}


def _run(report: dict | None) -> dict | None:
    """The run that wrote a report, from its summary; reports from earlier versions keep it in run or lastRun."""
    summary = _summary(report)
    if "state" in summary:
        return {key: summary[key] for key in RUN_FIELDS if key in summary}
    run = (report or {}).get("run") or (report or {}).get("lastRun")
    return run if isinstance(run, dict) else None


def _counts(report: dict | None) -> dict | None:
    """The comparison counts of a successful run's report."""
    if (_run(report) or {}).get("state") != "succeeded":
        return None
    counts = {key: value for key, value in _summary(report).items() if key not in RUN_FIELDS}
    return counts or None


def report_stem(workspace_id: str) -> str:
    """The start of the workspace's report file names; ids that are not plain file names are hashed."""
    if SAFE_ID.fullmatch(workspace_id):
        return workspace_id
    return f"workspace-{hashlib.sha256(workspace_id.encode()).hexdigest()[:16]}"


def report_name(workspace_id: str, finished_at: str) -> str:
    """The file name of a run's report: the workspace and the Unix epoch second the run finished."""
    moment = datetime.fromisoformat(finished_at.replace("Z", "+00:00"))
    return f"{report_stem(workspace_id)}-{int(moment.timestamp())}.json"


def _epoch(date_stamp: str) -> int:
    return int(datetime.strptime(date_stamp, DATE_STAMP).replace(tzinfo=timezone.utc).timestamp())


class ReportFolder:
    """A folder of timestamped JSON reports, one file per run: <workspace id>-<Unix time>.json."""

    # The report fields that hold its rows, which reading a report's header leaves out.
    rows: tuple[str, ...] = SKIPPED

    def __init__(self, folder: str):
        self.folder = folder
        self._headers: dict[str, tuple[tuple[int, int], dict | None]] = {}

    def _files(self, workspace_id: str) -> list[str]:
        """The workspace's report files, newest first. A file saved before names had a timestamp is the oldest."""
        pattern = re.compile(rf"{re.escape(report_stem(workspace_id))}(?:-(?:(\d{{8}}T\d{{6}}Z)|(\d+))(?:_(\d+))?)?\.json")
        try:
            names = os.listdir(self.folder)
        except OSError:
            return []
        found = []
        for name in names:
            if match := pattern.fullmatch(name):
                seconds = int(match[2]) if match[2] else _epoch(match[1]) if match[1] else -1
                found.append(((seconds, int(match[3] or 0)), name))
        return [os.path.join(self.folder, name) for _, name in sorted(found, reverse=True)]

    def latest_file(self, workspace_id: str) -> str | None:
        """The report of the workspace's last run, successful or not."""
        return next(iter(self._files(workspace_id)), None)

    def result_file(self, workspace_id: str) -> str | None:
        """The report of the workspace's last successful run."""
        return next((file for file in self._files(workspace_id) if _counts(self._header(file))), None)

    def _new_file(self, workspace_id: str, finished_at: str) -> str:
        file = os.path.join(self.folder, report_name(workspace_id, finished_at))
        stem, number = file[:-len(".json")], 2
        # Runs that finish within the same second get _2, _3…, which sort after the first by name too.
        while os.path.exists(file):
            file, number = f"{stem}_{number}.json", number + 1
        return file

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

    def _read(self, file: str) -> dict | None:
        try:
            with open(file, encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError):
            return None
        return data if isinstance(data, dict) else None

    def _header(self, file: str) -> dict | None:
        """The report without its rows, cached until the file changes."""
        try:
            info = os.stat(file)
        except OSError:
            return None
        key = (info.st_mtime_ns, info.st_size)
        cached = self._headers.get(file)
        if cached and cached[0] == key:
            return cached[1]
        data = self._read(file)
        header = {name: value for name, value in data.items() if name not in self.rows} if data else None
        self._headers[file] = (key, header)
        return header

    def report(self, workspace_id: str) -> bytes | None:
        """The report of the last successful run as stored, or None before the first one."""
        file = self.result_file(workspace_id)
        if file is None:
            return None
        with open(file, "rb") as handle:
            return handle.read()


class SyncJobs(ReportFolder):
    """At most one comparison per workspace runs at a time: in its own process for the app, in-process for the CLI."""

    def __init__(self, folder: str):
        super().__init__(folder)
        self._lock = threading.Lock()
        self._running: dict[str, dict] = {}

    def start(self, workspace_id: str, workspace: dict, settings: dict) -> None:
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
            self._finish_in_background(workspace_id, workspace, job, None, f"Could not start the sync process: {error}")
            return
        finally:
            sender.close()
        threading.Thread(target=self._watch, args=(workspace_id, workspace, job, receiver), daemon=True).start()

    def run(self, workspace_id: str, workspace: dict, settings: dict, progress: Progress | None = None) -> dict:
        """Compare in this process, for the command line; save the report like a background run and return the run."""
        with self._lock:
            if workspace_id in self._running:
                raise RuntimeError(f"The GDA sync of {workspace_id} is already running")
            job = {"startedAt": _now(), "progress": None, "process": None, "done": threading.Event(), "stopped": False}
            self._running[workspace_id] = job
        result, error = compare_settings(settings, progress)
        return self._finish(workspace_id, workspace, job, result, error)

    def _watch(self, workspace_id: str, workspace: dict, job: dict, receiver) -> None:
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
        self._finish_in_background(workspace_id, workspace, job, result, error)

    def _finish_in_background(self, *args) -> None:
        try:
            self._finish(*args)
        except OSError as error:
            print(f"EGT GDA Sync: could not save the sync report: {error}", file=sys.stderr, flush=True)

    def _finish(self, workspace_id: str, workspace: dict, job: dict, result: dict | None, error: str | None) -> dict:
        """Save the run as a new report file, and return it as the history shows it."""
        run = {"state": "failed" if error else "succeeded", "startedAt": job["startedAt"], "finishedAt": _now()}
        if error:
            run["error"] = error
        # The settings as the run used them, since workspace.json can change later.
        # The run's state and times lead its summary; a successful run's counts follow them, in the result's place.
        report = {"version": REPORT_VERSION, "workspace": workspace}
        report.update({**result, "summary": {**run, **result["summary"]}} if result is not None else {"summary": run})
        entry = {**run, **({"summary": result["summary"]} if result else {})}
        try:
            self._write(self._new_file(workspace_id, run["finishedAt"]), report)
        finally:
            with self._lock:
                self._running.pop(workspace_id, None)
            job["done"].set()
        return entry

    def history(self, workspace_id: str) -> list[dict]:
        """Every finished run of the workspace, newest first: one per report file, with the settings the run used and,
        for a successful one, its counts and how many descriptors it parsed. Reports from earlier versions hold other
        workspace fields, which are left out."""
        runs = []
        for file in self._files(workspace_id):
            header = self._header(file)
            if run := _run(header):
                counts = _counts(header)
                workspace = header.get("workspace")
                descriptors = header.get("descriptors")
                runs.append({
                    **run, **({"summary": counts} if counts else {}),
                    **({"workspace": workspace} if isinstance(workspace, dict) and "game_path" in workspace else {}),
                    **({"descriptors": len(descriptors)} if counts and isinstance(descriptors, list) else {}),
                    "file": os.path.basename(file),
                })
        return runs

    def status(self, workspace_id: str) -> dict:
        with self._lock:
            job = self._running.get(workspace_id)
            running = {"startedAt": job["startedAt"], "progress": job["progress"]} if job else None
        latest, result = self.latest_file(workspace_id), self.result_file(workspace_id)
        last_run = _run(self._header(latest)) if latest else None
        header = self._header(result) or {} if result else {}
        return {
            "workspaceId": workspace_id,
            "running": running is not None,
            "startedAt": running["startedAt"] if running else None,
            "progress": running["progress"] if running else None,
            "lastRun": last_run,
            "comparedAt": (_run(header) or {}).get("finishedAt") or header.get("finishedAt"),
            "summary": _counts(header),
            "reportPath": latest,
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
            if job["process"] and job["process"].is_alive():
                job["process"].terminate()
        for job in jobs:
            job["done"].wait(5)
