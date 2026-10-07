"""Compare a game's declared resources with the files in its GDA folder.

A port of docs/rss_sync/gda_sync.py (described in docs/rss_sync/sync.md). It classifies files like the script,
except that only a file inside the game folder (game_path) is reported missing, and an image sequence is one resource:
its frames, often a {N-M} range of files, are compared one by one, and the sequence takes the status of its frames.
A game file that nothing declares is "supplementary" and not compared; numbered images among them are guessed to be
image sequences. It returns JSON-ready data instead of a Markdown report, lists identical files too, and reports progress so it can run
as a background job.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import struct
import time
from collections import Counter, defaultdict
from collections.abc import Callable, Iterator
from dataclasses import asdict, dataclass, fields, is_dataclass
from pathlib import Path, PurePosixPath
from typing import Any

from .rss_schemas import DOCUMENT_TYPES, Frame, ImageSequence, parse_dataclass

RANGE_PATTERN = re.compile(r"\{(\d+)-(\d+)\}")
JSON_STRING_PATTERN = re.compile(r'"(?:\\.|[^"\\])*"')
EXTENSION_PATTERN = re.compile(r"\.[A-Za-z0-9]+")
COMMON_DIR = "common"  # folder under resources_dir that holds assets shared between games
DEFAULT_EXTENSIONS = (".csv", ".dds", ".ini", ".mov", ".png", ".rtf", ".ttf", ".wav")
# DDS header layout: magic, then a 124 byte header (height and width at 12..20, pixel format at 76..108 with the
# fourcc at 84, caps2 at 112) and, for fourcc DX10, a 20 byte extension (dimension 132, misc flags 136, array size 140).
DDS_MAGIC = b"DDS "
DDS_HEADER_END = 128
DDS_DX10_END = 148
PROGRESS_INTERVAL = 0.2
# The status a sequence takes from its frames: the first of these that any of its files has.
SEQUENCE_PRECEDENCE = ("different", "invalid", "missing", "identical")
# Supplementary images in one folder named <name><number>.<ext>, with the same name and extension and at least
# GUESSED_SEQUENCE_MIN numbers in a row, are guessed to be an image sequence, which plays with these settings.
NUMBERED_NAME = re.compile(r"^(.*?)(\d+)(\.[A-Za-z0-9]+)$")
SEQUENCE_IMAGE_EXTENSIONS = frozenset({".dds", ".png", ".jpg", ".jpeg", ".webp", ".bmp"})
GUESSED_SEQUENCE_MIN = 5
GUESSED_FRAME_TIME = 50
GUESSED_LOOP_COUNT = 0
SUPPLEMENTARY = {"status": "supplementary", "located": []}  # the result of a file that is listed but not compared

Progress = Callable[[str, int, int], None]


@dataclass(frozen=True, slots=True)
class Config:
    resources_dir: Path
    gda_dir: Path
    extensions: frozenset[str]
    game: str
    resource_paths: tuple[str, ...] = ()
    common_gda_dir: Path | None = None
    ignore_dds_mips: bool = True


def make_config(settings: dict) -> Config:
    """Validate comparison settings with the rules and messages of gda_sync.load_config."""
    def path_value(key: str) -> Path:
        value = settings.get(key)
        if not isinstance(value, str) or not value:
            raise ValueError(f"{key} must be a nonempty path")
        return Path(value).resolve()

    game = settings.get("game")
    if not isinstance(game, str) or not game or Path(game).name != game or game in {".", ".."}:
        raise ValueError("game must be one directory name")
    extensions = settings.get("extensions")
    if not isinstance(extensions, list) or not extensions or any(
        not isinstance(ext, str) or not EXTENSION_PATTERN.fullmatch(ext) for ext in extensions
    ):
        raise ValueError("extensions must be a nonempty list such as ['.dds', '.wav']")
    resource_paths = settings.get("resource_paths", [])
    if not isinstance(resource_paths, list) or any(not isinstance(path, str) or not path for path in resource_paths):
        raise ValueError("resource_paths must be a list of nonempty paths")
    ignore_dds_mips = settings.get("ignore_dds_mips", True)
    if not isinstance(ignore_dds_mips, bool):
        raise ValueError("ignore_dds_mips must be true or false")

    config = Config(
        resources_dir=path_value("resources_dir"),
        gda_dir=path_value("gda_dir"),
        extensions=frozenset(ext.lower() for ext in extensions),
        game=game,
        resource_paths=tuple(resource_paths),
        common_gda_dir=path_value("common_gda_dir") if settings.get("common_gda_dir") is not None else None,
        ignore_dds_mips=ignore_dds_mips,
    )
    if not config.resources_dir.is_dir():
        raise ValueError(f"resources_dir does not exist: {config.resources_dir}")
    if not config.gda_dir.is_dir():
        raise ValueError(f"gda_dir does not exist: {config.gda_dir}")
    if config.common_gda_dir is not None and not config.common_gda_dir.is_dir():
        raise ValueError(f"common_gda_dir does not exist: {config.common_gda_dir}")
    if not (config.resources_dir / config.game).is_dir():
        raise ValueError(f"game directory does not exist: {config.resources_dir / config.game}")
    return config


def load_documents(game_dir: Path, required: bool = True) -> dict[Path, Any]:
    """Load every local *Data.json and any descriptor named by an include; a game without any is an error if required."""
    documents: dict[Path, Any] = {}

    def load(path: Path) -> None:
        path = path.resolve()
        if path in documents:
            return
        if not path.is_file():
            raise ValueError(f"included descriptor does not exist: {path}")
        cls = DOCUMENT_TYPES.get(path.name)
        if cls is None:
            raise ValueError(f"unsupported resource descriptor: {path}")
        document = parse_dataclass(cls, json.loads(path.read_text(encoding="utf-8")), str(path))
        documents[path] = document
        for included in getattr(document, "include", ()):
            load(path.parent / included)

    for descriptor in sorted(game_dir.rglob("*Data.json")):
        load(descriptor)
    if required and not documents:
        raise ValueError(f"no *Data.json descriptors found in {game_dir}")
    return documents


def declared_paths(value: Any, sequence: ImageSequence | None = None) -> Iterator[tuple[str, ImageSequence | None, Any]]:
    """Walk typed entries, with the image sequence a path is a frame of and the entry that declares it: the one with the
    path, or the audio event of a sample. include is a descriptor reference, not an asset."""
    if not is_dataclass(value):
        return
    if isinstance(value, ImageSequence):
        sequence = value
    for item in fields(value):
        field_value = getattr(value, item.name)
        if item.name == "path":
            yield field_value, sequence, value
        elif item.name == "samples":
            for sample in field_value:
                yield sample, sequence, value
        elif item.name != "include" and isinstance(field_value, list):
            for child in field_value:
                yield from declared_paths(child, sequence)


def declared_path_lines(path: Path, document: Any) -> Iterator[tuple[str, int, ImageSequence | None]]:
    """Find the JSON string token for each typed path or sample declaration, in the order of the typed entries, with
    the image sequence it is a frame of. A value declared more than once takes its lines in order."""
    for value, line, sequence, _entry in declared_entries(path, document):
        yield value, line, sequence


def declared_entries(path: Path, document: Any) -> Iterator[tuple[str, int, ImageSequence | None, Any]]:
    """declared_path_lines, with the entry that declares each path."""
    declarations = list(declared_paths(document))
    expected = Counter(value for value, _sequence, _entry in declarations)
    if not expected:
        return
    raw = path.read_text(encoding="utf-8")
    found: dict[str, list[int]] = defaultdict(list)
    line = 1
    previous_end = 0
    for match in JSON_STRING_PATTERN.finditer(raw):
        line += raw.count("\n", previous_end, match.start())
        previous_end = match.end()
        value = json.loads(match.group())
        if value in expected:
            found[value].append(line)
    for value, count in expected.items():
        if len(found[value]) != count:
            raise ValueError(f"{path}: cannot locate the exact JSON line for {value!r}")
    lines = {value: iter(value_lines) for value, value_lines in found.items()}
    for value, sequence, entry in declarations:
        yield value, next(lines[value]), sequence, entry


def expand_path(path: str) -> Iterator[str]:
    """Expand the first {N-M} range, inclusive, up or down, zero-padded to the longer bound."""
    match = RANGE_PATTERN.search(path)
    if match is None:
        yield path
        return
    first, last = match.groups()
    start, end = int(first), int(last)
    step = 1 if start <= end else -1
    width = max(len(first), len(last))
    for number in range(start, end + step, step):
        yield f"{path[:match.start()]}{number:0{width}d}{path[match.end():]}"


def declared_files(game_dir: Path, resource_paths: tuple[str, ...] = ()) -> set[Path]:
    """Every file that the game's descriptors, image sequence frames included, or resource_paths declare, resolved: the
    files that are not supplementary."""
    templates = [*resource_paths, *(value for document in load_documents(game_dir).values() for value, _sequence, _entry in declared_paths(document))]
    return {(game_dir / relative).resolve() for template in templates for relative in expand_path(template)}


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def index_gda(gda_dir: Path, extensions: frozenset[str]) -> dict[str, list[Path]]:
    """Map each file name with a selected extension to every GDA file carrying that name."""
    by_name: dict[str, list[Path]] = defaultdict(list)
    for candidate in gda_dir.rglob("*"):
        if candidate.is_file() and candidate.suffix.lower() in extensions:
            by_name[candidate.name].append(candidate)
    for candidates in by_name.values():
        candidates.sort()
    return by_name


def path_overlap(first: str, second: str) -> int:
    """Count the folder names two relative paths share, ignoring case and leading underscores."""
    def folders(path: str) -> set[str]:
        return {part.lower().lstrip("_") for part in PurePosixPath(path).parts[:-1]}
    return len(folders(first) & folders(second))


def dds_layout(data: bytes) -> tuple[bytes, int] | None:
    """Describe a plain 2D DDS texture: what identifies its image, and where its pixel data starts.

    Cube maps, volumes and array textures interleave their mip levels, so they return None.
    """
    if data[:4] != DDS_MAGIC or len(data) < DDS_HEADER_END:
        return None
    if struct.unpack_from("<I", data, 112)[0] != 0:  # caps2: cube map or volume
        return None
    identity = data[12:20] + data[76:108]
    if data[84:88] != b"DX10":
        return identity, DDS_HEADER_END
    if len(data) < DDS_DX10_END:
        return None
    dimension, misc_flags, array_size = struct.unpack_from("<III", data, 132)
    if (dimension, misc_flags, array_size) != (3, 0, 1):  # 2D texture, not a cube map, one slice
        return None
    return identity + data[128:DDS_DX10_END], DDS_DX10_END


def mip_chain_only_differs(first: bytes, second: bytes) -> bool:
    """True if two DDS files hold the same top image and differ only in their number of mip levels.

    Smaller mip levels follow the top level in the pixel data, so the file with fewer levels has pixel data that is
    a prefix of the other's. Assumes neither file is truncated.
    """
    layouts = (dds_layout(first), dds_layout(second))
    if layouts[0] is None or layouts[1] is None or layouts[0][0] != layouts[1][0]:
        return False
    shorter, longer = sorted((first[layouts[0][1]:], second[layouts[1][1]:]), key=len)
    return bool(shorter) and longer.startswith(shorter)


def guess_sequences(files: list[Path]) -> tuple[list[list[Path]], list[Path]]:
    """Split files into guessed image sequences, each in frame order, and the files that stay on their own. A sequence
    is images in one folder named <name><number>.<ext>, with the same name and extension, whose numbers follow each
    other for at least GUESSED_SEQUENCE_MIN files; a gap or a repeated number ends it."""
    groups: dict[tuple[Path, str, str], list[tuple[int, Path]]] = defaultdict(list)
    single: list[Path] = []
    for path in files:
        match = NUMBERED_NAME.match(path.name)
        if match and path.suffix.lower() in SEQUENCE_IMAGE_EXTENSIONS:
            groups[(path.parent, match[1], match[3].lower())].append((int(match[2]), path))
        else:
            single.append(path)
    sequences: list[list[Path]] = []
    for numbered in groups.values():
        numbered.sort()
        runs = [[numbered[0]]]
        for item in numbered[1:]:
            if item[0] == runs[-1][-1][0] + 1:
                runs[-1].append(item)
            else:
                runs.append([item])
        for run in runs:
            if len(run) >= GUESSED_SEQUENCE_MIN:
                sequences.append([path for _number, path in run])
            else:
                single.extend(path for _number, path in run)
    return sequences, sorted(single)


def row_id(text: str) -> str:
    """A report row's id: a short hash of what identifies it, such as its resource path."""
    return hashlib.sha256(text.encode("utf-8", "surrogateescape")).hexdigest()[:16]


def status_category(status: str) -> str:
    """The leading status word: identical, different, invalid, missing or supplementary."""
    return status.partition(" ")[0].removesuffix(":")


@dataclass
class Declarations:
    """What a game's descriptors declare, as the GDA sync and the asset report read them."""
    game_dir: Path
    # Every *Data.json parsed, with its declarations before and after {N-M} ranges are expanded.
    descriptors: list[dict]
    # The declared paths outside image sequences, and the workspace's resource_paths.
    templates: set[str]
    # Each file that an entry outside an image sequence declares, with the descriptor, the line, the entry's type and
    # its id, if it has one, of each declaration.
    uses: dict[Path, set[tuple[str, int, str, str | None]]]
    # Each image sequence with its descriptor, the lines of its frames, and its frames in order, each frame of a {N-M}
    # range once per file.
    sequences: list[tuple[str, ImageSequence, list[int], list[tuple[Frame, Path]]]]
    # The game files with a compared extension that nothing declares, outside the guessed image sequences.
    supplementary: list[Path]
    # Supplementary numbered images guessed to be image sequences, each in frame order.
    guessed: list[list[Path]]


def gather(config: Config, required: bool = True) -> Declarations:
    """Read what the game's descriptors declare; a game without descriptors is an error if required."""
    game_dir = config.resources_dir / config.game
    documents = load_documents(game_dir, required)
    templates = set(config.resource_paths)
    uses: dict[Path, set[tuple[str, int, str, str | None]]] = defaultdict(set)
    # Each image sequence, by object, with the descriptor and the line of each of its frames.
    sequences: dict[int, tuple[str, ImageSequence, list[int]]] = {}
    descriptors: list[dict] = []
    for document_path, document in documents.items():
        document_name = os.path.relpath(document_path, game_dir)
        declarations = resources = 0
        for template, line, sequence, entry in declared_entries(document_path, document):
            declarations += 1
            relatives = list(expand_path(template))
            resources += len(relatives)
            if sequence is not None:
                sequences.setdefault(id(sequence), (document_name, sequence, []))[2].append(line)
                continue
            templates.add(template)
            for relative in relatives:
                uses[(game_dir / relative).resolve()].add((document_name, line, type(entry).__name__, getattr(entry, "id", None)))
        descriptors.append({"name": document_name, "path": str(document_path), "type": type(document).__name__,
                            "declarations": declarations, "resources": resources})
    descriptors.sort(key=lambda item: item["name"])
    sequence_frames = [(document_name, sequence, lines, [(frame, (game_dir / relative).resolve())
                                                         for frame in sequence.frames for relative in expand_path(frame.path)])
                       for document_name, sequence, lines in sequences.values()]
    frame_files = {source for *_, frames in sequence_frames for _, source in frames}
    # The game files that nothing declares are supplementary: the game does not load them. Files with an extension that
    # is not compared are left out. Descriptor paths additionally bring in shared assets outside the game folder.
    declared_files = frame_files | {(game_dir / relative).resolve() for template in templates for relative in expand_path(template)}
    supplementary = sorted({path.resolve() for path in game_dir.rglob("*") if path.is_file() and path.suffix.lower() in config.extensions}
                           - declared_files)
    guessed, single = guess_sequences(supplementary)
    return Declarations(game_dir, descriptors, templates, uses, sequence_frames, single, guessed)


def compare(config: Config, progress: Progress | None = None) -> dict:
    """Classify every resource of the game; return the parsed descriptors, the summary, the differences and the identical files."""
    report = progress or (lambda _phase, _done, _total: None)
    report("descriptors", 0, 0)
    found = gather(config)
    game_dir = found.game_dir

    # Shared assets live in their own GDA tree, but some are also kept in the game's tree, so they are searched in
    # both. Without common_gda_dir only gda_dir is used.
    report("index", 0, 0)
    game_gda = ("game", config.gda_dir, index_gda(config.gda_dir, config.extensions))
    common_gda = ("common", config.common_gda_dir, index_gda(config.common_gda_dir, config.extensions)) \
        if config.common_gda_dir is not None else None
    common_dir = config.resources_dir / COMMON_DIR
    gda_hashes: dict[Path, str] = {}
    checked: dict[Path, dict | None] = {}

    def classify(source: Path) -> dict | None:
        """A game file's status, the GDA files that go with it and whether only DDS mip levels differ, or None when
        the file is not compared."""
        if not source.is_relative_to(config.resources_dir) or not source.is_file():
            reason = "outside resources_dir" if not source.is_relative_to(config.resources_dir) else "source file does not exist"
            return {"status": f"invalid: {reason}", "located": []}
        if source.suffix.lower() not in config.extensions:
            return None
        trees = (common_gda, game_gda) if common_gda and source.is_relative_to(common_dir) else (game_gda,)
        located = [(tree, root, path) for tree, root, by_name in trees for path in by_name.get(source.name, [])]
        # Only the game's own files are reported missing. A shared file outside game_path without a GDA copy is left
        # out, and not compared, since its GDA files can be kept elsewhere.
        if not located and not source.is_relative_to(game_dir):
            return None
        if not located:
            return {"status": "missing", "located": []}
        # Same-named candidates in other folders are listed after the closest folder match.
        display = os.path.relpath(source, game_dir)
        located.sort(key=lambda item: -path_overlap(display, item[2].relative_to(item[1]).as_posix()))
        source_hash = file_hash(source)
        for candidate in located:
            path = candidate[2]
            if path not in gda_hashes:
                gda_hashes[path] = file_hash(path)
            if gda_hashes[path] == source_hash:
                return {"status": "identical", "located": [candidate], "mipOnly": False}
        if config.ignore_dds_mips and source.suffix.lower() == ".dds":
            source_data = source.read_bytes()
            match = next((candidate for candidate in located if mip_chain_only_differs(source_data, candidate[2].read_bytes())), None)
            if match is not None:
                return {"status": "identical", "located": [match], "mipOnly": True}
        return {"status": "different SHA-256", "located": located}

    def check(source: Path) -> dict | None:
        """classify, once per file: a file can be a frame of several sequences."""
        if source not in checked:
            checked[source] = classify(source)
        return checked[source]

    def file_entry(source: Path, result: dict | None) -> dict:
        """A game file as a row or a sequence frame shows it; a frame that is not compared is "skipped"."""
        status = result["status"] if result else "not compared"
        return {
            "category": status_category(status) if result else "skipped", "status": status,
            "resource": os.path.relpath(source, game_dir), "resourcePath": str(source),
            "gdaFiles": [{"tree": tree, "path": path.relative_to(root).as_posix(), "absolutePath": str(path)}
                         for tree, root, path in (result["located"] if result else ())],
            **({"mipOnly": result["mipOnly"]} if result and "mipOnly" in result else {}),
        }

    def scope(source: Path) -> str:
        return "common" if source.is_relative_to(common_dir) else "game" if source.is_relative_to(game_dir) else "outside"

    def file_row(source: Path, result: dict) -> dict:
        entry = file_entry(source, result)
        uses = sorted({(name, line) for name, line, _type, _id in found.uses.get(source, ())})
        return {"id": row_id(entry["resource"]), **entry, "scope": scope(source),
                "requiredBy": [{"descriptor": name, "line": line} for name, line in uses]}

    def sequence_row(document_name: str, sequence: ImageSequence, lines: list[int], frames: list[tuple[Any, Path]]) -> dict | None:
        """One row for a sequence, with each of its frames; None when none of its files is compared."""
        entries = [{**file_entry(source, check(source)), **({"source": asdict(frame.source)} if frame.source else {})}
                   for frame, source in frames]
        # An atlas shows one file in many frames, so the counts are of files.
        files = {entry["resourcePath"]: entry for entry in entries if entry["category"] != "skipped"}
        if not files:
            return None
        counts = Counter(entry["category"] for entry in files.values())
        category = next(name for name in SEQUENCE_PRECEDENCE if counts[name])
        first = next(entry for entry in files.values() if entry["category"] == category)
        status = first["status"]
        if len(files) > 1 and category != "identical":
            status += f" ({counts[category]} of {len(files)} files)" if counts[category] < len(files) else f" (all {len(files)} files)"
        paths = list(dict.fromkeys(os.path.relpath((game_dir / frame.path).resolve(), game_dir) for frame in sequence.frames))
        gda_files = list({entry["gdaFiles"][0]["absolutePath"]: entry["gdaFiles"][0] for entry in entries if entry["gdaFiles"]}.values())
        return {
            "id": row_id(f"{paths[0]}\0{document_name}\0{sequence.id}"), "category": category, "status": status,
            "resource": paths[0], "resourcePath": str((game_dir / sequence.frames[0].path).resolve()), "gdaFiles": gda_files,
            **({"mipOnly": any(entry.get("mipOnly") for entry in files.values())} if category == "identical" else {}),
            "scope": scope(frames[0][1]),
            "requiredBy": [{"descriptor": document_name, "line": min(lines)}],
            "sequence": {"id": sequence.id, "frameTime": sequence.frameTime, "loopCount": sequence.loopCount,
                         "loopTo": sequence.loopTo, "paths": paths, "frames": entries},
        }

    def guessed_sequence_row(files: list[Path]) -> dict:
        """A guessed sequence of supplementary images; it has no id and plays with the guessed settings."""
        first, last = NUMBERED_NAME.match(files[0].name), NUMBERED_NAME.match(files[-1].name)
        template = files[0].parent / f"{first[1]}{{{first[2]}-{last[2]}}}{first[3]}"
        display = os.path.relpath(template, game_dir)
        return {
            "id": row_id(f"{display}\0supplementary"), "category": "supplementary", "status": "supplementary",
            "resource": display, "resourcePath": str(template), "gdaFiles": [], "scope": scope(files[0]), "requiredBy": [],
            "sequence": {"id": None, "guessed": True, "frameTime": GUESSED_FRAME_TIME, "loopCount": GUESSED_LOOP_COUNT,
                         "loopTo": None, "paths": [display], "frames": [file_entry(source, SUPPLEMENTARY) for source in files]},
        }

    rows: list[dict] = [file_row(source, SUPPLEMENTARY) for source in found.supplementary]
    rows.extend(guessed_sequence_row(files) for files in found.guessed)
    seen: set[Path] = set()
    relatives = [relative for template in sorted(found.templates) for relative in expand_path(template)]
    total = len(relatives) + sum(len(frames) for *_, frames in found.sequences)
    report("compare", 0, total)
    for done, relative in enumerate(relatives, 1):
        report("compare", done, total)
        source = (game_dir / relative).resolve()
        if source in seen:
            continue
        seen.add(source)
        result = check(source)
        if result is not None:
            rows.append(file_row(source, result))
    done = len(relatives)
    for document_name, sequence, lines, frames in found.sequences:
        for _frame, source in frames:
            check(source)
            done += 1
            report("compare", done, total)
        if (row := sequence_row(document_name, sequence, lines, frames)) is not None:
            rows.append(row)
    # The script's order, by status and then resource; a sequence's file counts do not take part.
    differences = sorted((row for row in rows if row["category"] != "identical"),
                         key=lambda item: (item["status"].partition(" (")[0], item["resource"]))
    identical = sorted((row for row in rows if row["category"] == "identical"), key=lambda item: item["resource"])
    counts = Counter(item["category"] for item in differences)
    # The settings are not repeated here: a saved report keeps them once, in its "workspace".
    return {
        # Every *Data.json parsed, with its declared resource paths before and after {N-M} ranges are expanded.
        "descriptors": found.descriptors,
        "summary": {
            "compared": len(identical) + counts["missing"] + counts["different"], "identical": len(identical),
            "identicalMipOnly": sum(1 for row in identical if row["mipOnly"]),
            "missing": counts["missing"], "different": counts["different"], "invalid": counts["invalid"],
            "supplementary": counts["supplementary"],
        },
        "differences": differences,
        "identical": identical,
    }


def throttled(progress: Progress, interval: float = PROGRESS_INTERVAL) -> Progress:
    """Pass on the start and end of each phase, and at most one update per interval in between."""
    last = 0.0

    def report(phase: str, done: int, total: int) -> None:
        nonlocal last
        now = time.monotonic()
        if done in (0, total) or now - last >= interval:
            last = now
            progress(phase, done, total)
    return report


def compare_settings(settings: dict, progress: Progress | None = None) -> tuple[dict | None, str | None]:
    """Validate the settings and compare; return (result, None), or (None, error) when the run cannot complete."""
    try:
        return compare(make_config(settings), progress), None
    except (OSError, ValueError) as error:  # The errors that make gda_sync.py exit with code 2.
        return None, str(error)
    except Exception as error:
        return None, f"{type(error).__name__}: {error}"


def run_in_process(settings: dict, connection: Any) -> None:
    """Background process entry point: send ("progress", …) messages, then ("result", report) or ("error", text)."""
    try:
        result, error = compare_settings(settings, throttled(
            lambda phase, done, total: connection.send(("progress", {"phase": phase, "done": done, "total": total}))))
        connection.send(("error", error) if error else ("result", result))
    finally:
        connection.close()
