"""Compare a game's declared resources with the files in its GDA folder.

A port of docs/rss_sync/gda_sync.py (described in docs/rss_sync/sync.md). It classifies resources exactly like
the script, but returns JSON-ready data instead of a Markdown report, lists identical files too, and reports
progress so it can run as a background job.
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
from dataclasses import dataclass, fields, is_dataclass
from pathlib import Path, PurePosixPath
from typing import Any

from .rss_schemas import DOCUMENT_TYPES, parse_dataclass

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


def load_documents(game_dir: Path) -> dict[Path, Any]:
    """Load every local *Data.json and any descriptor named by an include."""
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
    if not documents:
        raise ValueError(f"no *Data.json descriptors found in {game_dir}")
    return documents


def declared_paths(value: Any) -> Iterator[str]:
    """Walk typed entries; include is a descriptor reference, not an asset."""
    if not is_dataclass(value):
        return
    for item in fields(value):
        field_value = getattr(value, item.name)
        if item.name == "path":
            yield field_value
        elif item.name == "samples":
            yield from field_value
        elif item.name != "include" and isinstance(field_value, list):
            for child in field_value:
                yield from declared_paths(child)


def declared_path_lines(path: Path, document: Any) -> Iterator[tuple[str, int]]:
    """Find the JSON string token for each typed path or sample declaration."""
    expected = Counter(declared_paths(document))
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
        for declaration_line in found[value]:
            yield value, declaration_line


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


def status_category(status: str) -> str:
    """The leading status word: identical, different, invalid or missing."""
    return status.partition(" ")[0].removesuffix(":")


def compare(config: Config, progress: Progress | None = None) -> dict:
    """Classify every resource of the game; return the parsed descriptors, the summary, the differences and the identical files."""
    report = progress or (lambda _phase, _done, _total: None)
    game_dir = config.resources_dir / config.game
    report("descriptors", 0, 0)
    documents = load_documents(game_dir)
    declared = set(config.resource_paths)
    source_documents: dict[Path, set[tuple[str, int]]] = defaultdict(set)
    descriptors: list[dict] = []
    for document_path, document in documents.items():
        document_name = os.path.relpath(document_path, game_dir)
        declarations = resources = 0
        for template, line in declared_path_lines(document_path, document):
            declared.add(template)
            declarations += 1
            for relative in expand_path(template):
                resources += 1
                source_documents[(game_dir / relative).resolve()].add((document_name, line))
        descriptors.append({"name": document_name, "path": str(document_path), "type": type(document).__name__,
                            "declarations": declarations, "resources": resources})
    descriptors.sort(key=lambda item: item["name"])
    # Compare every physical game asset, including files absent from a descriptor.
    # Descriptor paths additionally bring in shared assets outside the game folder.
    declared.update(path.relative_to(game_dir).as_posix() for path in game_dir.rglob("*") if path.is_file())

    # Shared assets live in their own GDA tree, but some are also kept in the game's tree, so they are searched in
    # both. Without common_gda_dir only gda_dir is used.
    report("index", 0, 0)
    game_gda = ("game", config.gda_dir, index_gda(config.gda_dir, config.extensions))
    common_gda = ("common", config.common_gda_dir, index_gda(config.common_gda_dir, config.extensions)) \
        if config.common_gda_dir is not None else None
    common_dir = config.resources_dir / COMMON_DIR

    def row(status: str, source: Path, display: str, located=(), **extra) -> dict:
        scope = "common" if source.is_relative_to(common_dir) else "game" if source.is_relative_to(game_dir) else "outside"
        return {
            "id": hashlib.sha256(display.encode("utf-8", "surrogateescape")).hexdigest()[:16],
            "category": status_category(status), "status": status, "resource": display,
            "resourcePath": str(source), "scope": scope,
            "gdaFiles": [{"tree": tree, "path": path.relative_to(root).as_posix(), "absolutePath": str(path)}
                         for tree, root, path in located],
            "requiredBy": [{"descriptor": name, "line": line} for name, line in sorted(source_documents.get(source, ()))],
            **extra,
        }

    differences: list[dict] = []
    identical: list[dict] = []
    mip_matched = 0
    selected = 0
    gda_hashes: dict[Path, str] = {}
    seen: set[Path] = set()
    relatives = [relative for template in sorted(declared) for relative in expand_path(template)]
    report("compare", 0, len(relatives))
    for done, relative in enumerate(relatives, 1):
        report("compare", done, len(relatives))
        source = (game_dir / relative).resolve()
        if source in seen:
            continue
        seen.add(source)
        display = os.path.relpath(source, game_dir)
        if not source.is_relative_to(config.resources_dir) or not source.is_file():
            reason = "outside resources_dir" if not source.is_relative_to(config.resources_dir) else "source file does not exist"
            differences.append(row(f"invalid: {reason}", source, display))
            continue
        if source.suffix.lower() not in config.extensions:
            continue
        selected += 1
        trees = (common_gda, game_gda) if common_gda and source.is_relative_to(common_dir) else (game_gda,)
        located = [(tree, root, path) for tree, root, by_name in trees for path in by_name.get(source.name, [])]
        if not located:
            differences.append(row("missing", source, display))
            continue
        # Same-named candidates in other folders are listed after the closest folder match.
        located.sort(key=lambda item: -path_overlap(display, item[2].relative_to(item[1]).as_posix()))
        source_hash = file_hash(source)
        match = None
        for candidate in located:
            path = candidate[2]
            if path not in gda_hashes:
                gda_hashes[path] = file_hash(path)
            if gda_hashes[path] == source_hash:
                match = candidate
                break
        if match is not None:
            identical.append(row("identical", source, display, [match], mipOnly=False))
            continue
        if config.ignore_dds_mips and source.suffix.lower() == ".dds":
            source_data = source.read_bytes()
            match = next((candidate for candidate in located if mip_chain_only_differs(source_data, candidate[2].read_bytes())), None)
            if match is not None:
                mip_matched += 1
                identical.append(row("identical", source, display, [match], mipOnly=True))
                continue
        differences.append(row("different SHA-256", source, display, located))
    differences.sort(key=lambda item: (item["status"], item["resource"]))
    identical.sort(key=lambda item: item["resource"])
    counts = Counter(item["category"] for item in differences)
    return {
        "game": config.game,
        "resourcesDir": str(config.resources_dir),
        "gameDir": str(game_dir),
        "gdaDir": str(config.gda_dir),
        "commonGdaDir": str(config.common_gda_dir) if config.common_gda_dir else None,
        "extensions": sorted(config.extensions),
        "ignoreDdsMips": config.ignore_dds_mips,
        # Every *Data.json parsed, with its declared resource paths before and after {N-M} ranges are expanded.
        "descriptors": descriptors,
        "summary": {
            "compared": selected, "identical": len(identical), "identicalMipOnly": mip_matched,
            "missing": counts["missing"], "different": counts["different"], "invalid": counts["invalid"],
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
