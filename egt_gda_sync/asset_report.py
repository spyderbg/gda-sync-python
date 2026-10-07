"""The asset report: an inventory of a game's assets, which the asset library shows.

It lists every file that the game's *Data.json descriptors (or the workspace's resource_paths) declare, with the
descriptor, the line, the type and the id of the entry that loads it, and the files of the game folder that no
descriptor declares. Nothing is compared with the GDA folder. A declared file is "available" when it exists, "missing"
when it does not, and "invalid" when its path leads outside the resources folder; a file that nothing declares is
"supplementary". Image sequences follow the GDA sync (rss_sync): a sequence is one asset with its frames, and takes the
status of its frames, the first of invalid, missing and available that any of its files has; supplementary numbered
images are guessed to be sequences. Each report is saved like a GDA sync report, as <workspace id>-<Unix time>.json.
"""

from __future__ import annotations

import os
from collections import Counter
from collections.abc import Callable
from dataclasses import asdict
from pathlib import Path

from .rss_jobs import ReportFolder, _now
from .rss_sync import COMMON_DIR, GUESSED_FRAME_TIME, GUESSED_LOOP_COUNT, NUMBERED_NAME, Config, expand_path, gather, row_id

ASSET_REPORT_VERSION = 1
CATEGORIES = ("available", "missing", "invalid", "supplementary")
# The status a sequence takes from its frames: the first of these that any of its files has.
SEQUENCE_PRECEDENCE = ("invalid", "missing", "available")

# The facts of a file: always its "type", and for an available file its size, time and image facts.
Facts = Callable[[Path, bool], dict]


def inventory(config: Config, facts: Facts) -> dict:
    """The parsed descriptors, the summary and the assets of the game, sorted by resource path."""
    found = gather(config, required=False)
    game_dir = found.game_dir
    common_dir = config.resources_dir / COMMON_DIR
    checked: dict[Path, dict] = {}

    def file_entry(source: Path, supplementary: bool = False) -> dict:
        """A file as a row or a sequence frame shows it, checked once: a file can be a frame of several sequences."""
        if source not in checked:
            if supplementary:
                category, status = "supplementary", "supplementary"
            elif not source.is_relative_to(config.resources_dir):
                category, status = "invalid", "invalid: outside resources_dir"
            elif not source.is_file():
                category, status = "missing", "missing: source file does not exist"
            else:
                category, status = "available", "available"
            checked[source] = {"category": category, "status": status, "resource": os.path.relpath(source, game_dir),
                               "resourcePath": str(source), **facts(source, category in ("available", "supplementary"))}
        return checked[source]

    def scope(source: Path) -> str:
        return "common" if source.is_relative_to(common_dir) else "game" if source.is_relative_to(game_dir) else "outside"

    def frame(entry: dict) -> dict:
        # The type is the sequence's.
        return {key: value for key, value in entry.items() if key != "type"}

    def sequence_facts(entries: list[dict]) -> dict:
        """A sequence's type, the total size of its files, and the time and image facts of the newest and first ones."""
        files = list({entry["resourcePath"]: entry for entry in entries}.values())
        existing = [entry for entry in files if "size" in entry]
        result = {"type": files[0]["type"], "size": sum(entry["size"] for entry in existing)} if files else {"type": "texture"}
        if existing:
            result["modifiedAt"] = max(entry["modifiedAt"] for entry in existing)
            result["preview"] = any(entry.get("preview") for entry in existing)
            if dimensions := next((entry["dimensions"] for entry in existing if "dimensions" in entry), None):
                result["dimensions"] = dimensions
        return result

    def file_row(source: Path, supplementary: bool = False) -> dict:
        entry = file_entry(source, supplementary)
        uses = sorted(found.uses.get(source, ()), key=lambda use: (use[0], use[1]))
        return {"id": row_id(entry["resource"]), **entry, "scope": scope(source),
                "requiredBy": [{"descriptor": name, "line": line, "type": kind, **({"id": entry_id} if entry_id else {})}
                               for name, line, kind, entry_id in uses]}

    def sequence_row(document_name: str, sequence, lines: list[int], frames: list) -> dict:
        entries = [file_entry(source) for _frame, source in frames]
        files = {entry["resourcePath"]: entry for entry in entries}
        counts = Counter(entry["category"] for entry in files.values())
        category = next((name for name in SEQUENCE_PRECEDENCE if counts[name]), "missing")
        first = next((entry for entry in files.values() if entry["category"] == category), None)
        status = first["status"] if first else "missing: the sequence has no frames"
        if len(files) > 1 and category != "available":
            status += f" ({counts[category]} of {len(files)} files)" if counts[category] < len(files) else f" (all {len(files)} files)"
        paths = list(dict.fromkeys(os.path.relpath((game_dir / item.path).resolve(), game_dir) for item in sequence.frames))
        first_path = (game_dir / sequence.frames[0].path).resolve() if sequence.frames else game_dir
        return {
            "id": row_id(f"{paths[0] if paths else ''}\0{document_name}\0{sequence.id}"), "category": category, "status": status,
            "resource": paths[0] if paths else "", "resourcePath": str(first_path), **sequence_facts(entries),
            "scope": scope(frames[0][1] if frames else first_path),
            "requiredBy": [{"descriptor": document_name, "line": min(lines), "type": "ImageSequence", "id": sequence.id}],
            "sequence": {"id": sequence.id, "frameTime": sequence.frameTime, "loopCount": sequence.loopCount, "loopTo": sequence.loopTo,
                         "paths": paths, "frames": [{**frame(entry), **({"source": asdict(item.source)} if item.source else {})}
                                                    for (item, _source), entry in zip(frames, entries)]},
        }

    def guessed_sequence_row(files: list[Path]) -> dict:
        """Supplementary numbered images guessed to be a sequence; it has no id and plays with the guessed settings."""
        first, last = NUMBERED_NAME.match(files[0].name), NUMBERED_NAME.match(files[-1].name)
        template = files[0].parent / f"{first[1]}{{{first[2]}-{last[2]}}}{first[3]}"
        display = os.path.relpath(template, game_dir)
        entries = [file_entry(source, supplementary=True) for source in files]
        return {
            "id": row_id(f"{display}\0supplementary"), "category": "supplementary", "status": "supplementary",
            "resource": display, "resourcePath": str(template), **sequence_facts(entries), "scope": scope(files[0]), "requiredBy": [],
            "sequence": {"id": None, "guessed": True, "frameTime": GUESSED_FRAME_TIME, "loopCount": GUESSED_LOOP_COUNT,
                         "loopTo": None, "paths": [display], "frames": [frame(entry) for entry in entries]},
        }

    rows = [file_row(source, supplementary=True) for source in found.supplementary]
    rows.extend(guessed_sequence_row(files) for files in found.guessed)
    seen: set[Path] = set()
    for template in sorted(found.templates):
        for relative in expand_path(template):
            source = (game_dir / relative).resolve()
            if source not in seen:
                seen.add(source)
                rows.append(file_row(source))
    rows.extend(sequence_row(*sequence) for sequence in found.sequences)
    rows.sort(key=lambda row: (row["resource"], row["id"]))
    counts = Counter(row["category"] for row in rows)
    return {
        "descriptors": found.descriptors,
        "summary": {
            "assets": len(rows), **{category: counts[category] for category in CATEGORIES},
            # Each file once, though a file can be an asset of its own and a frame of sequences.
            "size": sum(entry.get("size", 0) for entry in checked.values()),
            "types": dict(sorted(Counter(row["type"] for row in rows).items())),
        },
        "assets": rows,
    }


class AssetReports(ReportFolder):
    """The asset reports of each workspace, written whenever one is generated; the library shows the newest."""

    rows = ("assets",)

    def save(self, workspace_id: str, workspace: dict, started_at: str, result: dict) -> str:
        """Save a generated report with the workspace settings it used, and return its file."""
        run = {"state": "succeeded", "startedAt": started_at, "finishedAt": _now()}
        report = {"version": ASSET_REPORT_VERSION, "workspace": workspace, "descriptors": result["descriptors"],
                  "summary": {**run, **result["summary"]}, "assets": result["assets"]}
        file = self._new_file(workspace_id, run["finishedAt"])
        self._write(file, report)
        return file

    def status(self, workspace_id: str) -> dict:
        """The newest report of the workspace and its summary, or None for both before the first one."""
        file = self.result_file(workspace_id)
        header = self._header(file) if file else None
        return {"reportPath": file, "summary": (header or {}).get("summary")}
