"""The asset report: an inventory of a game's assets, which the asset library shows.

It lists every file that the game's *Data.json descriptors, the ones they include, (or the workspace's resource_paths)
declare, wherever it is, with the descriptor, the line, the type and the id of the entry that loads it, and the files of
the game folder that no descriptor declares: other folders are not searched for files that nothing declares. Nothing is compared with the GDA folder. A declared file is "available" when it exists, "missing"
when it does not, and "invalid" when its path leads outside the resources folder; a file that nothing declares is
"supplementary". Image sequences follow the GDA sync (rss_sync): a sequence is one asset with its frames, and takes the
status of its frames, the first of invalid, missing and available that any of its files has; supplementary numbered
images are guessed to be sequences. An RTF, a project of the RTF Tool, is one asset with every file of its folder, named
by the folder: it takes the status of its .rtf file, and the files in its folder are not assets of their own unless a
descriptor declares them. A declared .json file in a v folder is a view, in the game folder or any other.

Each asset is in one of the report's folders: the game folder, or another folder of the resources folder, the one that
directly holds it (such as ../common, for the files of a feature the game includes from ../common/features/taxation,
or another game's), and for a path outside the resources folder, its own folder.
Each report is saved like a GDA sync report, as <workspace id>-<Unix time>.json.
"""

from __future__ import annotations

import os
from collections import Counter
from collections.abc import Callable
from dataclasses import asdict
from pathlib import Path

from .fonts import FONT_EXTENSIONS, describe_font
from .rss_jobs import ReportFolder, _now
from .rss_sync import COMMON_DIR, GUESSED_FRAME_TIME, GUESSED_LOOP_COUNT, NUMBERED_NAME, Config, Use, expand_path, gather, required_by, row_id
from .rtf import RTF_EXTENSION, describe_rtf
from .views import describe_view, is_view, view_root

# Version 2 reports fonts as their own type, with their names, the samples they draw and their coverage of each Font
# entry's characters. Version 3 reports RTFs (RTF Tool projects) as their own type: an RTF's folder is one asset with
# all of its files, with its pages, languages and the images and videos its pages draw that do not exist.
# Version 4 reports views (the .json files of the game's v folder) as their own type, with what they draw.
# Version 5 lists the folders the assets are in, with each asset's, and reports the declared views of other folders, such
# as those of the features the game includes, as views.
ASSET_REPORT_VERSION = 5
CATEGORIES = ("available", "missing", "invalid", "supplementary")
# The status a sequence takes from its frames: the first of these that any of its files has.
SEQUENCE_PRECEDENCE = ("invalid", "missing", "available")

# The facts of a file: always its "type", and for an available file its size, time and image facts.
Facts = Callable[[Path, bool], dict]
# The facts that an RTF lists of each file in its folder.
RTF_FILE_FACTS = ("resourcePath", "type", "size", "modifiedAt", "dimensions")


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
        row = {"id": row_id(entry["resource"]), **entry, "scope": scope(source), "requiredBy": required_by(found.uses.get(source, ()))}
        if source.suffix[1:].lower() in FONT_EXTENSIONS and entry["category"] in ("available", "supplementary"):
            # A font's names and glyphs, and for each Font entry, which of its declared characters the font has.
            fonts = [use for use in row["requiredBy"] if use.get("chars")]
            described = describe_font(str(source), [use["chars"] for use in fonts])
            for use, coverage in zip(fonts, described.pop("coverage", [])):
                use["coverage"] = coverage
            row.update(described)
        elif source.suffix[1:].lower() == RTF_EXTENSION and entry["category"] in ("available", "supplementary"):
            # An RTF's pages, with their backgrounds, and the files that its pages draw but that do not exist.
            row.update(describe_rtf(str(source)))
        elif is_view(source, game_dir) or (not supplementary and view_root(source) is not None):
            # A view is its own type: what its elements draw, and the resources they name that cannot be found. The
            # game's descriptors name the resources of a view it declares in another folder too.
            row["type"] = "view"
            if entry["category"] in ("available", "supplementary"):
                row.update(describe_view(source, game_dir))
        return row

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
            "requiredBy": required_by([Use(document_name, min(lines), "ImageSequence", sequence.id)]),
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

    def rtf_row(folder: Path, project: Path, files: list[Path]) -> dict:
        """An RTF: its folder, with every file in it, named by the folder. It takes the status of its .rtf file, the
        entries that declare the .rtf files in the folder, and the facts of its pages."""
        entry = file_entry(project, project not in declared)
        entries = {source: file_entry(source, source not in declared) for source in files}
        existing = [item for item in entries.values() if "size" in item]
        resource = os.path.relpath(folder, game_dir)
        uses = [use for source in {project, *(source for source in files if source.suffix[1:].lower() == RTF_EXTENSION)}
                for use in found.uses.get(source, ())]
        row = {
            "id": row_id(f"{resource}\0rtf"), "category": entry["category"], "status": entry["status"], "resource": resource,
            "resourcePath": str(folder), "type": "rtf",
            **({"size": sum(item["size"] for item in existing), "modifiedAt": max(item["modifiedAt"] for item in existing)} if existing else {}),
            "scope": scope(project), "requiredBy": required_by(uses),
            "directory": {"project": str(project), "files": [
                {"path": source.relative_to(folder).as_posix(), **{key: item[key] for key in RTF_FILE_FACTS if key in item}}
                for source, item in entries.items()]},
        }
        if entry["category"] in ("available", "supplementary"):
            row.update(describe_rtf(str(project)))
        return row

    # The files that a descriptor declares, as frames or not, are assets whatever folder they are in.
    declared = found.declared
    rows = [file_row(source, supplementary=True) for source in found.supplementary]
    rows.extend(guessed_sequence_row(files) for files in found.guessed)
    rows.extend(rtf_row(folder, project, files) for folder, (project, files) in found.rtfs.items())
    seen: set[Path] = set()
    for template in sorted(found.templates):
        for relative in expand_path(template):
            source = (game_dir / relative).resolve()
            # An RTF's .rtf files are its folder's.
            if source not in seen and not (source.parent in found.rtfs and source.suffix[1:].lower() == RTF_EXTENSION):
                seen.add(source)
                rows.append(file_row(source))
    rows.extend(sequence_row(*sequence) for sequence in found.sequences)
    rows.sort(key=lambda row: (row["resource"], row["id"]))
    folders = asset_folders(rows, config.resources_dir, game_dir)
    counts = Counter(row["category"] for row in rows)
    return {
        "descriptors": found.descriptors,
        "folders": folders,
        "summary": {
            "assets": len(rows), **{category: counts[category] for category in CATEGORIES},
            # Each file once, though a file can be an asset of its own and a frame of sequences.
            "size": sum(entry.get("size", 0) for entry in checked.values()),
            "types": dict(sorted(Counter(row["type"] for row in rows).items())),
        },
        "assets": rows,
    }


def location(row: dict) -> Path:
    """Where an asset is: its file, a sequence's first frame, or an RTF's folder."""
    frames = (row.get("sequence") or {}).get("frames") or []
    return Path(frames[0]["resourcePath"] if frames else row["resourcePath"])


def asset_folders(rows: list[dict], resources_dir: Path, game_dir: Path) -> list[dict]:
    """The folders the assets are in, the game folder first, each with its kind and its number of assets; each row gets
    its folder: the game folder, the folder of the resources folder that holds it, or its own folder outside it."""
    roots: dict[Path, str] = {game_dir: "game"}

    def folder_of(path: Path) -> Path:
        if path.is_relative_to(game_dir):
            return game_dir
        inside = path.is_relative_to(resources_dir)
        parts = path.relative_to(resources_dir).parts if inside else ()
        # A shared folder is the one directly in the resources folder; a path elsewhere is in its own folder.
        folder = resources_dir / parts[0] if len(parts) > 1 else path.parent
        roots.setdefault(folder, "shared" if inside else "outside")
        return folder

    counts: Counter[Path] = Counter()
    for row in rows:
        folder = folder_of(location(row))
        row["folder"] = str(folder)
        counts[folder] += 1
    order = {"game": 0, "shared": 1, "outside": 2}
    return [{"path": str(folder), "relative": os.path.relpath(folder, game_dir), "kind": kind, "assets": counts[folder]}
            for folder, kind in sorted(roots.items(), key=lambda item: (order[item[1]], str(item[0])))]


class AssetReports(ReportFolder):
    """The asset reports of each workspace, written whenever one is generated; the library shows the newest."""

    rows = ("assets",)

    def save(self, workspace_id: str, workspace: dict, started_at: str, result: dict) -> str:
        """Save a generated report with the workspace settings it used, and return its file."""
        run = {"state": "succeeded", "startedAt": started_at, "finishedAt": _now()}
        report = {"version": ASSET_REPORT_VERSION, "workspace": workspace, "descriptors": result["descriptors"],
                  "folders": result["folders"], "summary": {**run, **result["summary"]}, "assets": result["assets"]}
        file = self._new_file(workspace_id, run["finishedAt"])
        self._write(file, report)
        return file

    def status(self, workspace_id: str) -> dict:
        """The newest report of the workspace, its version and its summary, or None for all before the first one."""
        file = self.result_file(workspace_id)
        header = self._header(file) if file else None
        return {"reportPath": file, "version": (header or {}).get("version"), "summary": (header or {}).get("summary")}
