"""Command line: run the GDA sync of workspaces without the app, and save each workspace's report.

Usage: egt-gda-sync report [ID ...] [--all] [--[no-]multithreading] [--[no-]gpu] [--match-threshold PERCENT]
(python -m egt_gda_sync report … in a checkout)
"""

import argparse
import sys

from .library import Library
from .rss_sync import throttled

PHASES = {"descriptors": "Reading descriptors", "index": "Indexing the GDA folder", "hashing": "Hashing files",
          "compare": "Comparing files", "images": "Reading images", "matches": "Matching images"}


def summary_line(summary: dict) -> str:
    """The summary line of gda_sync.py, with the supplementary files the script does not report."""
    mip = summary["identicalMipOnly"]
    identical = f"{summary['identical']} ({mip} differing only in DDS mip levels)" if mip else str(summary["identical"])
    return (f"Compared: {summary['compared']}; identical: {identical}; missing: {summary['missing']}; "
            f"different: {summary['different']}; invalid: {summary['invalid']}; supplementary: {summary['supplementary']}")


def image_line(image_compare: dict) -> str:
    """How the run matched images: how many it searched for, the possible matches, the GPU, and any error."""
    counts, gpu = image_compare.get("counts", {}), image_compare.get("gpu", {})
    line = (f"Images: {counts.get('images', 0)} compared, {counts.get('exact', 0)} exact, {counts.get('searched', 0)} searched; "
            f"possible matches: {counts.get('possibleMatches', 0)}")
    if gpu.get("available"):
        line += f"; GPU: {gpu['device']}"
    elif gpu.get("requested"):
        line += f"; GPU algorithms not used: {gpu.get('reason', 'unavailable')}"
    if "error" in image_compare:
        line += f"; image matching failed: {image_compare['error']}"
    return line


def _progress_line(phase: str, done: int, total: int) -> None:
    counts = f" {done} of {total}" if total else ""
    sys.stderr.write(f"\r\033[K  {PHASES.get(phase, phase)}{counts}")
    sys.stderr.flush()


def percentage(text: str) -> float:
    try:
        value = float(text)
    except ValueError:
        value = -1.0
    if not 0 <= value <= 100:
        raise argparse.ArgumentTypeError(f"not a percentage from 0.0 to 100.0: {text}")
    return value


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="egt-gda-sync report",
        description="Run the GDA sync of workspaces from workspace.json without starting the app, and save each "
                    "workspace's report where the app reads it. Exit status: 0 when every compared resource is in "
                    "sync, 1 when differences exist, 2 when a sync could not run. Supplementary files, which no "
                    "descriptor declares, are not differences.",
    )
    parser.add_argument("workspaces", nargs="*", metavar="ID", help="workspace ids (default: the default workspace)")
    parser.add_argument("--all", action="store_true", help="every workspace in workspace.json, in its order")
    images = parser.add_argument_group("image matching", "These replace the workspace's settings in workspace.json for this run.")
    images.add_argument("--multithreading", action=argparse.BooleanOptionalAction, default=None,
                        help="hash files and match images on several threads (workspace default: multithreading, true)")
    images.add_argument("--gpu", dest="use_gpu", action=argparse.BooleanOptionalAction, default=None,
                        help="also match images with the GPU algorithms, CLIP and DINOv2 (workspace default: use_gpu, false)")
    images.add_argument("--match-threshold", dest="image_match_threshold", type=percentage, metavar="PERCENT",
                        help="the probability from which a GDA image is a possible match (workspace default: "
                             "image_match_threshold, 50.0)")
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
    overrides = {key: value for key in ("multithreading", "use_gpu", "image_match_threshold") if (value := getattr(args, key)) is not None}
    status = 0
    for workspace_id in ids:
        print(f"{entries[workspace_id]['name']} ({workspace_id})", flush=True)
        run = library.compare_workspace(workspace_id, progress, overrides)
        if progress:
            sys.stderr.write("\r\033[K")
        if run["state"] == "failed":
            print(f"  Failed: {run['error']}")
            status = 2
        else:
            summary = run["summary"]
            print(f"  {summary_line(summary)}")
            print(f"  {image_line(run['imageCompare'])}")
            if summary["missing"] or summary["different"] or summary["invalid"]:
                status = max(status, 1)
        print(f"  Report: {library.reports.latest_file(workspace_id)}", flush=True)
    return status
