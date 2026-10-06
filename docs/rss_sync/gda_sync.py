#!/usr/bin/env python3.12
"""Compare a game's declared resources with files in a GDA directory."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass, fields, is_dataclass
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import struct
import sys
from typing import Any, Iterator
from urllib.parse import quote

from schemas import DOCUMENT_TYPES, parse_dataclass


RANGE_PATTERN = re.compile(r"\{(\d+)-(\d+)\}")
JSON_STRING_PATTERN = re.compile(r'"(?:\\.|[^"\\])*"')
COMMON_DIR = "common"  # folder under resources_dir that holds assets shared between games
COLORS = {"missing": "\033[33m", "different": "\033[31m", "invalid": "\033[35m"}
RESET = "\033[0m"
# DDS header layout, read off every .dds under resources and the GDA: magic, then a 124 byte
# header (height and width at 12..20, pixel format at 76..108 with the fourcc at 84, caps2 at
# 112) and, for fourcc DX10, a 20 byte extension (dimension 132, misc flags 136, array size 140).
DDS_MAGIC = b"DDS "
DDS_HEADER_END = 128
DDS_DX10_END = 148


@dataclass(frozen=True, slots=True)
class Config:
    resources_dir: Path
    gda_dir: Path
    extensions: frozenset[str]
    game: str
    resource_paths: tuple[str, ...]
    report_path: Path
    color: str
    common_gda_dir: Path | None = None
    ignore_dds_mips: bool = True


@dataclass(frozen=True, slots=True)
class Difference:
    status: str
    resource: str
    gda_files: tuple[str, ...] = ()
    gda_paths: tuple[Path, ...] = ()
    required_by: tuple[tuple[str, int], ...] = ()


@dataclass(frozen=True, slots=True)
class Comparison:
    differences: list[Difference]
    selected: int
    matched: int  # identical files, including those counted in mip_matched
    mip_matched: int = 0  # DDS files whose only difference is the number of mip levels


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("config.json"))
    parser.add_argument("--resources-dir", type=Path)
    parser.add_argument("--gda-dir", type=Path)
    parser.add_argument("--common-gda-dir", type=Path,
                        help="GDA directory for files under resources_dir/common")
    parser.add_argument("--extensions", nargs="+", metavar=".EXT",
                        help="replace the configured extension list")
    parser.add_argument("--game", help="selected directory under resources_dir")
    parser.add_argument("--resource-path", action="append", dest="resource_paths",
                        help="replace configured extra paths; repeat for multiple files")
    parser.add_argument("--ignore-dds-mips", action=argparse.BooleanOptionalAction,
                        help="treat DDS files that differ only in mip levels as identical")
    parser.add_argument("--report-path", type=Path)
    parser.add_argument("--color", choices=("auto", "always", "never"))
    return parser.parse_args(argv)


def load_config(args: argparse.Namespace) -> Config:
    config_path = args.config.resolve()
    raw = json.loads(config_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("configuration must be a JSON object")
    allowed = {"resources_dir", "gda_dir", "common_gda_dir", "extensions", "game",
               "resource_paths", "ignore_dds_mips", "report_path", "color"}
    unknown = raw.keys() - allowed
    if unknown:
        raise ValueError(f"unknown configuration keys: {', '.join(sorted(unknown))}")

    def path_value(key: str) -> Path:
        override = getattr(args, key)
        value = override if override is not None else raw.get(key)
        if not isinstance(value, (str, Path)) or not str(value):
            raise ValueError(f"{key} must be a nonempty path")
        path = Path(value)
        base = Path.cwd() if override is not None else config_path.parent
        return (base / path).resolve()

    game = args.game if args.game is not None else raw.get("game")
    if not isinstance(game, str) or not game or Path(game).name != game or game in {".", ".."}:
        raise ValueError("game must be one directory name")

    extensions = args.extensions if args.extensions is not None else raw.get("extensions")
    if not isinstance(extensions, list) or not extensions or any(
        not isinstance(ext, str) or not re.fullmatch(r"\.[A-Za-z0-9]+", ext)
        for ext in extensions
    ):
        raise ValueError("extensions must be a nonempty list such as ['.dds', '.wav']")

    resource_paths = args.resource_paths if args.resource_paths is not None else raw.get("resource_paths", [])
    if not isinstance(resource_paths, list) or any(not isinstance(p, str) or not p for p in resource_paths):
        raise ValueError("resource_paths must be a list of nonempty paths")

    color = args.color if args.color is not None else raw.get("color", "auto")
    if color not in {"auto", "always", "never"}:
        raise ValueError("color must be auto, always, or never")

    ignore_dds_mips = args.ignore_dds_mips if args.ignore_dds_mips is not None else raw.get("ignore_dds_mips", True)
    if not isinstance(ignore_dds_mips, bool):
        raise ValueError("ignore_dds_mips must be true or false")

    report_override = args.report_path
    report_value = report_override if report_override is not None else raw.get("report_path", "sync_report.md")
    if not isinstance(report_value, (str, Path)) or not str(report_value):
        raise ValueError("report_path must be a nonempty path")
    report_base = Path.cwd() if report_override is not None else config_path.parent

    config = Config(
        resources_dir=path_value("resources_dir"),
        gda_dir=path_value("gda_dir"),
        extensions=frozenset(ext.lower() for ext in extensions),
        game=game,
        resource_paths=tuple(resource_paths),
        report_path=(report_base / report_value).resolve(),
        color=color,
        common_gda_dir=(path_value("common_gda_dir")
                        if args.common_gda_dir is not None or raw.get("common_gda_dir") is not None
                        else None),
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
    """Map each filename with a selected extension to every GDA file carrying that name."""
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

    Smaller mip levels follow the top level in the pixel data, so the file with fewer levels has
    pixel data that is a prefix of the other's. Assumes neither file is truncated.
    """
    layouts = (dds_layout(first), dds_layout(second))
    if layouts[0] is None or layouts[1] is None or layouts[0][0] != layouts[1][0]:
        return False
    shorter, longer = sorted((first[layouts[0][1]:], second[layouts[1][1]:]), key=len)
    return bool(shorter) and longer.startswith(shorter)


def compare(config: Config) -> Comparison:
    game_dir = config.resources_dir / config.game
    documents = load_documents(game_dir)
    declared = set(config.resource_paths)
    source_documents: dict[Path, set[tuple[str, int]]] = defaultdict(set)
    for document_path, document in documents.items():
        document_name = os.path.relpath(document_path, game_dir)
        for template, line in declared_path_lines(document_path, document):
            declared.add(template)
            for relative in expand_path(template):
                source_documents[(game_dir / relative).resolve()].add((document_name, line))
    # Compare every physical game asset, including files absent from a descriptor.
    # Descriptor paths additionally bring in shared assets outside the game folder.
    declared.update(path.relative_to(game_dir).as_posix()
                    for path in game_dir.rglob("*") if path.is_file())

    # Shared assets live in their own GDA tree, but some are also kept in the game's
    # tree, so they are searched in both. Without common_gda_dir only gda_dir is used.
    game_gda = (config.gda_dir, index_gda(config.gda_dir, config.extensions))
    common_gda = (config.common_gda_dir, index_gda(config.common_gda_dir, config.extensions)) \
        if config.common_gda_dir is not None else None
    common_dir = config.resources_dir / COMMON_DIR

    differences: list[Difference] = []
    matched = 0
    mip_matched = 0
    selected = 0
    gda_hashes: dict[Path, str] = {}
    seen: set[Path] = set()
    for template in sorted(declared):
        for relative in expand_path(template):
            source = (game_dir / relative).resolve()
            if source in seen:
                continue
            seen.add(source)
            display = os.path.relpath(source, game_dir)
            if not source.is_relative_to(config.resources_dir) or not source.is_file():
                reason = "outside resources_dir" if not source.is_relative_to(config.resources_dir) else "source file does not exist"
                differences.append(Difference(f"invalid: {reason}", display))
                continue
            if source.suffix.lower() not in config.extensions:
                continue
            selected += 1
            trees = (common_gda, game_gda) if common_gda and source.is_relative_to(common_dir) else (game_gda,)
            located = [(root, path) for root, by_name in trees for path in by_name.get(source.name, [])]
            if not located:
                differences.append(Difference("missing", display,
                                              required_by=tuple(sorted(source_documents[source]))))
                continue
            # Same-named candidates in other folders are listed after the closest folder match.
            located.sort(key=lambda item: -path_overlap(display, item[1].relative_to(item[0]).as_posix()))
            source_hash = file_hash(source)
            candidate_names = tuple(path.relative_to(root).as_posix() for root, path in located)
            candidate_paths = tuple(path for _, path in located)
            for _, candidate in located:
                if candidate not in gda_hashes:
                    gda_hashes[candidate] = file_hash(candidate)
                if gda_hashes[candidate] == source_hash:
                    matched += 1
                    break
            else:
                if config.ignore_dds_mips and source.suffix.lower() == ".dds":
                    source_data = source.read_bytes()
                    if any(mip_chain_only_differs(source_data, candidate.read_bytes())
                           for _, candidate in located):
                        matched += 1
                        mip_matched += 1
                        continue
                differences.append(Difference("different SHA-256", display,
                                              candidate_names, candidate_paths))
    differences.sort(key=lambda row: (row.status, row.resource))
    return Comparison(differences, selected, matched, mip_matched)


def identical_text(result: Comparison) -> str:
    if not result.mip_matched:
        return str(result.matched)
    return f"{result.matched} ({result.mip_matched} differing only in DDS mip levels)"


def status_category(status: str) -> str:
    """Use the leading status word for summary counts and terminal colors."""
    return status.partition(" ")[0].removesuffix(":")


def markdown_report(config: Config, result: Comparison) -> str:
    differences = result.differences
    counts = Counter(status_category(row.status) for row in differences)
    common_line = [f"Common GDA: `{config.common_gda_dir}`  "] if config.common_gda_dir else []
    lines = [
        f"# GDA sync report: {config.game}", "",
        f"Resources: `{config.resources_dir / config.game}`  ",
        f"GDA: `{config.gda_dir}`  ",
        *common_line,
        f"Extensions: {', '.join(sorted(config.extensions))}", "",
        f"Compared: {result.selected} | Identical: {identical_text(result)} | "
        f"Missing: {counts['missing']} | "
        f"Different: {counts['different']} | Invalid: {counts['invalid']}", "",
        "| Status | Resource / GDA file(s) |",
        "| --- | --- |",
    ]

    def escape(text: str) -> str:
        return (text.replace("\\", "\\\\").replace("|", "\\|")
                .replace("[", "\\[").replace("]", "\\]").replace("\n", " "))

    def file_link(label: str, file_path: Path, line: int | None = None) -> str:
        relative = os.path.relpath(file_path, config.report_path.parent).replace(os.sep, "/")
        fragment = f"#L{line}" if line is not None else ""
        return f"[{escape(label)}]({quote(relative, safe='/')}{fragment})"

    if not differences:
        lines.append("| identical | All selected resources match |")
    for row in differences:
        source = (config.resources_dir / config.game / row.resource).resolve()
        resource_cell = file_link(row.resource, source)
        if row.status == "missing":
            if row.required_by:
                document_links = (
                    file_link(f"{name}:{line}", (config.resources_dir / config.game / name).resolve(), line)
                    for name, line in row.required_by
                )
                resource_cell += "<br>" + "<br>".join(document_links)
            else:
                resource_cell += "<br>No JSON descriptor"
        elif row.gda_files:
            gda_links = (file_link(name, path) for name, path in
                         zip(row.gda_files, row.gda_paths, strict=True))
            resource_cell += "<br><br>" + "<br>".join(gda_links)
        lines.append(f"| {escape(row.status)} | {resource_cell} |")
    return "\n".join(lines) + "\n"


def print_table(result: Comparison, color: str) -> None:
    headings = ("Status", "Resource / GDA file(s)")
    # One block per difference: the resource line, then the GDA files under it when there are any.
    blocks: list[tuple[str, list[tuple[str, str]]]] = []
    for row in result.differences:
        physical = [(row.status, row.resource)]
        if row.status == "missing":
            if row.required_by:
                physical.extend(("", f"{name}:{line}") for name, line in row.required_by)
            else:
                physical.append(("", "No JSON descriptor"))
        else:
            physical.extend(("", name) for name in row.gda_files)
        blocks.append((status_category(row.status), physical))
    widths = [max([len(heading), *(len(values[index]) for _, physical in blocks for values in physical)])
              for index, heading in enumerate(headings)]

    def line(values: tuple[str, ...]) -> str:
        return " | ".join(value.ljust(width) for value, width in zip(values, widths))

    print(line(headings))
    print("-+-".join("-" * width for width in widths))
    use_color = color == "always" or (color == "auto" and sys.stdout.isatty() and not os.getenv("NO_COLOR"))
    for status, physical in blocks:
        for values in physical:
            rendered = line(values)
            if use_color:
                rendered = f"{COLORS[status]}{rendered}{RESET}"
            print(rendered)
    counts = Counter(status_category(row.status) for row in result.differences)
    print(f"Compared: {result.selected}; identical: {identical_text(result)}; "
          f"missing: {counts['missing']}; different: {counts['different']}; "
          f"invalid: {counts['invalid']}")


def main(argv: list[str] | None = None) -> int:
    try:
        config = load_config(parse_args(argv))
        result = compare(config)
        print_table(result, config.color)
        config.report_path.parent.mkdir(parents=True, exist_ok=True)
        config.report_path.write_text(markdown_report(config, result), encoding="utf-8")
        print(f"Report: {config.report_path}")
        return 1 if result.differences else 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"gda-sync: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
