"""Command line: run the GDA sync of workspaces without the app, and save each workspace's report.

Usage: egt-gda-sync report [ID ...] [--all]   (python -m egt_gda_sync report … in a checkout)
"""

import argparse
import sys

from .library import Library
from .rss_sync import throttled

PHASES = {"descriptors": "Reading descriptors", "index": "Indexing the GDA folder", "compare": "Comparing files"}


def summary_line(summary: dict) -> str:
    """The summary line of gda_sync.py."""
    mip = summary["identicalMipOnly"]
    identical = f"{summary['identical']} ({mip} differing only in DDS mip levels)" if mip else str(summary["identical"])
    return (f"Compared: {summary['compared']}; identical: {identical}; missing: {summary['missing']}; "
            f"different: {summary['different']}; invalid: {summary['invalid']}")


def _progress_line(phase: str, done: int, total: int) -> None:
    counts = f" {done} of {total}" if total else ""
    sys.stderr.write(f"\r\033[K  {PHASES.get(phase, phase)}{counts}")
    sys.stderr.flush()


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="egt-gda-sync report",
        description="Run the GDA sync of workspaces from workspace.json without starting the app, and save each "
                    "workspace's report where the app reads it. Exit status: 0 when every compared resource is in "
                    "sync, 1 when differences exist, 2 when a sync could not run.",
    )
    parser.add_argument("workspaces", nargs="*", metavar="ID", help="workspace ids (default: the default workspace)")
    parser.add_argument("--all", action="store_true", help="every workspace in workspace.json, in its order")
    args = parser.parse_args(argv)
    if args.all and args.workspaces:
        parser.error("give workspace ids or --all, not both")
    return args


def main(args: argparse.Namespace, library: Library) -> int:
    entries = dict(library.workspace_entries())
    ids = list(entries) if args.all else list(dict.fromkeys(args.workspaces)) or [library.config.get("defaultWorkspace") or "current"]
    unknown = [workspace_id for workspace_id in ids if workspace_id not in entries]
    if unknown:
        print(f"egt-gda-sync report: unknown workspace {', '.join(unknown)}. Workspaces: {', '.join(entries)}", file=sys.stderr)
        return 2
    progress = throttled(_progress_line, 0.1) if sys.stderr.isatty() else None
    status = 0
    for workspace_id in ids:
        print(f"{entries[workspace_id]['name']} ({workspace_id})", flush=True)
        run = library.compare_workspace(workspace_id, progress)
        if progress:
            sys.stderr.write("\r\033[K")
        if run["state"] == "failed":
            print(f"  Failed: {run['error']}")
            status = 2
        else:
            summary = run["summary"]
            print(f"  {summary_line(summary)}")
            if summary["missing"] or summary["different"] or summary["invalid"]:
                status = max(status, 1)
        print(f"  Report: {library.reports.latest_file(workspace_id)}", flush=True)
    return status
