"""Compare a game's declared resources with the files in its GDA folder.

A port of docs/rss_sync/gda_sync.py (described in docs/rss_sync/sync.md). It classifies files like the script,
except that only a file inside the game folder (game_path) is reported missing, and an image sequence is one resource:
its frames, often a {N-M} range of files, are compared one by one, and the sequence takes the status of its frames.
A game file that nothing declares is "supplementary" and not compared; numbered images among them are guessed to be
image sequences. An RTF, a project of the RTF Tool, is one resource: its folder, compared file by file with the GDA folder
that holds a .rtf file of the same name. It returns JSON-ready data instead of a Markdown report, lists identical files
too, and reports progress so it can run as a background job. Images are also matched with the GDA's images by their
contents, as egt_gda_sync.image_compare describes: each compared image has the probability that each GDA image is the same
picture, and its possible matches. A view, a .json file in the game's v folder that the game's view elements draw, is
compared like any file, with the facts of what it draws (egt_gda_sync.views); other .json files, such as the *Data.json
descriptors, are not compared.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import struct
import time
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable, Iterator
from contextlib import closing
from dataclasses import asdict, dataclass, fields, is_dataclass
from pathlib import Path, PurePosixPath
from typing import Any, NamedTuple

from .image_cache import CompareCache, FileHashes
from .image_compare import IMAGE_EXTENSIONS, ImageMatcher, Query, Settings, Target, workers
from .rss_schemas import DOCUMENT_TYPES, Frame, ImageSequence, parse_dataclass
from .rtf import describe_rtf
from .views import VIEW_SUFFIX, describe_view, is_view

RANGE_PATTERN = re.compile(r"\{(\d+)-(\d+)\}")
JSON_STRING_PATTERN = re.compile(r'"(?:\\.|[^"\\])*"')
EXTENSION_PATTERN = re.compile(r"\.[A-Za-z0-9]+")
COMMON_DIR = "common"  # folder under resources_dir that holds assets shared between games
DEFAULT_EXTENSIONS = (".csv", ".dds", ".ini", ".json", ".mov", ".png", ".rtf", ".ttf", ".wav")
# DDS header layout: magic, then a 124 byte header (height and width at 12..20, pixel format at 76..108 with the
# fourcc at 84, caps2 at 112) and, for fourcc DX10, a 20 byte extension (dimension 132, misc flags 136, array size 140).
DDS_MAGIC = b"DDS "
DDS_HEADER_END = 128
DDS_DX10_END = 148
PROGRESS_INTERVAL = 0.2
HASH_CHUNK = 256  # files hashed between progress reports
DEFAULT_MATCH_THRESHOLD = 50.0
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
RTF_SUFFIX = ".rtf"
NAME_TOKENS = re.compile(r"[^0-9a-z]+")

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
    # The image matching: whether it runs on several threads, whether it adds the GPU algorithms (CLIP and DINOv2), the
    # probability from which a GDA image is a possible match, and the cache file; without one the cache is in memory.
    multithreading: bool = True
    use_gpu: bool = False
    image_match_threshold: float = DEFAULT_MATCH_THRESHOLD
    cache_path: Path | None = None


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
    for key in ("multithreading", "use_gpu"):
        if not isinstance(settings.get(key, False), bool):
            raise ValueError(f"{key} must be true or false")
    threshold = settings.get("image_match_threshold", DEFAULT_MATCH_THRESHOLD)
    if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not 0 <= threshold <= 100:
        raise ValueError("image_match_threshold must be a percentage from 0.0 to 100.0")
    cache_path = settings.get("cache_path")
    if cache_path is not None and (not isinstance(cache_path, str) or not cache_path):
        raise ValueError("cache_path must be a nonempty path")

    config = Config(
        resources_dir=path_value("resources_dir"),
        gda_dir=path_value("gda_dir"),
        extensions=frozenset(ext.lower() for ext in extensions),
        game=game,
        resource_paths=tuple(resource_paths),
        common_gda_dir=path_value("common_gda_dir") if settings.get("common_gda_dir") is not None else None,
        ignore_dds_mips=ignore_dds_mips,
        multithreading=settings.get("multithreading", True),
        use_gpu=settings.get("use_gpu", False),
        image_match_threshold=float(threshold),
        cache_path=Path(cache_path) if cache_path else None,
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


def compared_file(path: Path, game_dir: Path, extensions: frozenset[str]) -> bool:
    """Whether a file's extension is compared: a .json file is compared only when it is a view of the game."""
    suffix = path.suffix.lower()
    return suffix in extensions and (suffix != VIEW_SUFFIX or is_view(path, game_dir))


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


class Use(NamedTuple):
    """A descriptor entry that declares a file: where it is, its type and id, and a Font's characters and size."""
    descriptor: str
    line: int
    type: str
    id: str | None = None
    chars: str | None = None
    size: int | None = None


def required_by(uses: Iterable[Use]) -> list[dict]:
    """The entries that declare a file as a report lists them, by descriptor and line."""
    return [{"descriptor": use.descriptor, "line": use.line, "type": use.type,
             **{key: value for key, value in (("id", use.id), ("chars", use.chars), ("size", use.size)) if value is not None}}
            for use in sorted(set(uses))]


@dataclass
class Declarations:
    """What a game's descriptors declare, as the GDA sync and the asset report read them."""
    game_dir: Path
    # Every *Data.json parsed, with its declarations before and after {N-M} ranges are expanded.
    descriptors: list[dict]
    # The declared paths outside image sequences, and the workspace's resource_paths.
    templates: set[str]
    # Each file that an entry outside an image sequence declares, with each entry that declares it.
    uses: dict[Path, set[Use]]
    # Each image sequence with its descriptor, the lines of its frames, and its frames in order, each frame of a {N-M}
    # range once per file.
    sequences: list[tuple[str, ImageSequence, list[int], list[tuple[Frame, Path]]]]
    # The game files with a compared extension that nothing declares, outside the guessed image sequences.
    supplementary: list[Path]
    # Supplementary numbered images guessed to be image sequences, each in frame order.
    guessed: list[list[Path]]
    # Every file that the descriptors or resource_paths declare, image sequence frames included.
    declared: set[Path]
    # The folder of each RTF, with its .rtf file and every file in it. The files in an RTF's folder are neither
    # supplementary nor guessed image sequences.
    rtfs: dict[Path, tuple[Path, list[Path]]]


def rtf_folders(resources_dir: Path, game_dir: Path, projects: Iterable[Path], declared: set[Path]) -> dict[Path, Path]:
    """The folder of each RTF, with its .rtf file: of the .rtf files in one folder, a declared one, then project.rtf,
    then the first. A folder outside the resources folder, or one that holds the game folder, is not an RTF's."""
    found: dict[Path, list[Path]] = defaultdict(list)
    for project in projects:
        folder = project.parent
        if folder.is_relative_to(resources_dir) and not game_dir.is_relative_to(folder):
            found[folder].append(project)
    return {folder: min(files, key=lambda file: (file not in declared, file.name.lower() != "project.rtf", file.name))
            for folder, files in found.items()}


def folder_files(folders: Iterable[Path]) -> dict[Path, list[Path]]:
    """Every file in each folder and its subfolders, sorted; a file in folders inside each other is the innermost one's."""
    files: dict[Path, list[Path]] = {folder: [] for folder in folders}
    for folder, owned in files.items():
        if folder.is_dir():
            owned.extend(path for path in sorted(folder.rglob("*"))
                         if path.is_file() and next(parent for parent in path.parents if parent in files) == folder)
    return files


def rtf_match(game_project: str, gda_project: str) -> tuple[int, int]:
    """How closely a GDA .rtf file's folder matches a game RTF's: the folder names their paths share, then the words
    that the names of the RTFs' own folders share, such as "burning" and "crown" of 10_Burning_Crown."""
    def words(path: str) -> set[str]:
        return set(NAME_TOKENS.split(PurePosixPath(path).parent.name.lower())) - {""}
    return path_overlap(game_project, gda_project), len(words(game_project) & words(gda_project))


def gather(config: Config, required: bool = True) -> Declarations:
    """Read what the game's descriptors declare; a game without descriptors is an error if required."""
    game_dir = config.resources_dir / config.game
    documents = load_documents(game_dir, required)
    templates = set(config.resource_paths)
    uses: dict[Path, set[Use]] = defaultdict(set)
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
                uses[(game_dir / relative).resolve()].add(Use(document_name, line, type(entry).__name__, getattr(entry, "id", None),
                                                              getattr(entry, "chars", None), getattr(entry, "size", None)))
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
    unlisted = {path.resolve() for path in game_dir.rglob("*") if path.is_file() and compared_file(path.resolve(), game_dir, config.extensions)} - declared_files
    # An RTF is its whole folder, when .rtf files are compared: the folder of a declared .rtf file, or of one that nothing
    # declares.
    projects = [path for path in declared_files | unlisted if path.suffix.lower() == RTF_SUFFIX] if RTF_SUFFIX in config.extensions else []
    folders = rtf_folders(config.resources_dir, game_dir, projects, declared_files)
    contents = folder_files(folders)
    in_folders = {path for files in contents.values() for path in files}
    guessed, single = guess_sequences(sorted(unlisted - in_folders))
    rtfs = {folder: (project, contents[folder]) for folder, project in sorted(folders.items())}
    return Declarations(game_dir, descriptors, templates, uses, sequence_frames, single, guessed, declared_files, rtfs)


def compare(config: Config, progress: Progress | None = None) -> dict:
    """Classify every resource of the game; return the parsed descriptors, the summary, the image matching, the
    differences and the identical files."""
    with closing(CompareCache(config.cache_path)) as cache, workers(config.multithreading) as map_function:
        return classify_resources(config, progress, FileHashes(cache, file_hash, map_function), map_function)


def classify_resources(config: Config, progress: Progress | None, hashes: FileHashes, map_function: Callable) -> dict:
    """compare, with the run's hashes and the map function of its threads."""
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
    checked: dict[Path, dict | None] = {}
    # The image matching of each compared image: its imageMatch, and the evaluation of each same-named GDA file.
    images: dict[Path, dict] = {}

    def trees_of(source: Path) -> tuple:
        return (common_gda, game_gda) if common_gda and source.is_relative_to(common_dir) else (game_gda,)

    def compared(source: Path) -> bool:
        return source.is_relative_to(config.resources_dir) and compared_file(source, game_dir, config.extensions) and source.is_file()

    def locate(source: Path) -> list[tuple[str, Path, Path]]:
        """The GDA files named like a game file, in the trees it is searched in."""
        return [(tree, root, path) for tree, root, by_name in trees_of(source) for path in by_name.get(source.name, [])]

    def classify(source: Path) -> dict | None:
        """A game file's status, the GDA files that go with it and whether only DDS mip levels differ, or None when
        the file is not compared."""
        if not source.is_relative_to(config.resources_dir) or not source.is_file():
            reason = "outside resources_dir" if not source.is_relative_to(config.resources_dir) else "source file does not exist"
            return {"status": f"invalid: {reason}", "located": []}
        if not compared_file(source, game_dir, config.extensions):
            return None
        located = locate(source)
        # Only the game's own files are reported missing. A shared file outside game_path without a GDA copy is left
        # out, and not compared, since its GDA files can be kept elsewhere.
        if not located and not source.is_relative_to(game_dir):
            return None
        if not located:
            return {"status": "missing", "located": []}
        # Same-named candidates in other folders are listed after the closest folder match.
        display = os.path.relpath(source, game_dir)
        located.sort(key=lambda item: -path_overlap(display, item[2].relative_to(item[1]).as_posix()))
        source_hash = hashes(source)
        for candidate in located:
            if hashes(candidate[2]) == source_hash:
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
        """A game file as a row or a sequence frame shows it; a frame that is not compared is "skipped". A compared image
        has its imageMatch, and the evaluation of each same-named GDA file as its match."""
        status = result["status"] if result else "not compared"
        matched = images.get(source) if result else None
        named = matched["named"] if matched else {}
        return {
            "category": status_category(status) if result else "skipped", "status": status,
            "resource": os.path.relpath(source, game_dir), "resourcePath": str(source),
            "gdaFiles": [{"tree": tree, "path": path.relative_to(root).as_posix(), "absolutePath": str(path),
                          **({"match": named[path]} if path in named else {})}
                         for tree, root, path in (result["located"] if result else ())],
            **({"mipOnly": result["mipOnly"]} if result and "mipOnly" in result else {}),
            **({"imageMatch": matched["imageMatch"]} if matched else {}),
        }

    def scope(source: Path) -> str:
        return "common" if source.is_relative_to(common_dir) else "game" if source.is_relative_to(game_dir) else "outside"

    def file_row(source: Path, result: dict) -> dict:
        entry = file_entry(source, result)
        row = {"id": row_id(entry["resource"]), **entry, "scope": scope(source), "requiredBy": required_by(found.uses.get(source, ()))}
        if is_view(source, game_dir):
            # What the view and its closest GDA file draw, with the game's resources.
            if source.is_file():
                row.update(describe_view(source, game_dir))
            if result["located"]:
                row.update({f"gda{key[0].upper()}{key[1:]}": value for key, value in describe_view(result["located"][0][2], game_dir).items()})
        return row

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
            "requiredBy": required_by([Use(document_name, min(lines), "ImageSequence", sequence.id)]),
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

    def rtf_files(folder: Path, files: list[Path], gda_folder: Path) -> list[dict]:
        """An RTF's files and a GDA folder's, by their paths in the folders, with what syncing the GDA folder does to
        each: nothing to an identical one, copy a changed one or one that only the GDA has ("added"), and remove one that
        only the game has ("removed")."""
        game = {path.relative_to(folder).as_posix(): path for path in files}
        gda = {path.relative_to(gda_folder).as_posix(): path for path in sorted(gda_folder.rglob("*")) if path.is_file()}
        entries = []
        for name in sorted(game.keys() | gda.keys()):
            mine, theirs = game.get(name), gda.get(name)
            entry: dict = {"path": name, "resourcePath": str(mine) if mine else None, "gdaPath": str(theirs) if theirs else None}
            if mine is None or theirs is None:
                entry["change"] = "added" if mine is None else "removed"
            elif hashes(mine) == hashes(theirs):
                entry["change"] = "identical"
            elif config.ignore_dds_mips and mine.suffix.lower() == ".dds" and mip_chain_only_differs(mine.read_bytes(), theirs.read_bytes()):
                entry.update(change="identical", mipOnly=True)
            else:
                entry["change"] = "changed"
            entries.append(entry)
        return entries

    def rtf_row(folder: Path, project: Path, files: list[Path]) -> dict | None:
        """An RTF: its folder, with every file in it, compared with each GDA folder that holds a .rtf file named like its
        own, closest first. It is identical when one of them has the same files with the same contents, and different
        otherwise; syncing makes it a copy of the closest. A .rtf file that nothing declares makes it supplementary, and
        one that does not exist invalid; a shared RTF outside the game folder without a GDA folder is left out, like a
        file."""
        resource = os.path.relpath(folder, game_dir)
        uses = [use for source in {project, *(path for path in files if path.suffix.lower() == RTF_SUFFIX)} for use in found.uses.get(source, ())]
        listed = [{"path": path.relative_to(folder).as_posix(), "resourcePath": str(path)} for path in files]
        located: list[tuple[str, Path, Path]] = []
        mip_only = False
        if project not in found.declared:
            status = "supplementary"
        elif not project.is_file():
            status = "invalid: source file does not exist"
        else:
            trees = (common_gda, game_gda) if common_gda and project.is_relative_to(common_dir) else (game_gda,)
            # A .rtf file at the top of a GDA folder would make the whole GDA folder an RTF's.
            located = [(tree, root, path) for tree, root, by_name in trees for path in by_name.get(project.name, []) if path.parent != root]
            if not located and not project.is_relative_to(game_dir):
                return None
            display = os.path.relpath(project, game_dir)
            located.sort(key=lambda item: tuple(-value for value in rtf_match(display, item[2].relative_to(item[1]).as_posix())))
            status = "missing"
            for index, candidate in enumerate(located):
                entries = rtf_files(folder, files, candidate[2].parent)
                if index == 0:
                    listed = entries
                if all(entry["change"] == "identical" for entry in entries):
                    located, listed, status = [candidate], entries, "identical"
                    mip_only = any(entry.get("mipOnly") for entry in entries)
                    break
            else:
                if located:
                    changes = Counter(entry["change"] for entry in listed)
                    counts = [f"{changes[key]} {label}" for key, label in (("changed", "changed"), ("added", "only in the GDA"), ("removed", "only in the game")) if changes[key]]
                    status = f"different SHA-256 ({', '.join(counts)})"
        row = {
            "id": row_id(f"{resource}\0rtf"), "category": status_category(status), "status": status, "resource": resource,
            "resourcePath": str(folder),
            "gdaFiles": [{"tree": tree, "path": path.parent.relative_to(root).as_posix(), "absolutePath": str(path.parent)} for tree, root, path in located],
            **({"mipOnly": mip_only} if status == "identical" else {}), "scope": scope(project), "requiredBy": required_by(uses),
            "directory": {"project": str(project), "gdaProject": str(located[0][2]) if located else None, "files": listed},
        }
        # The pages of the game's RTF and of the GDA's closest one.
        if project.is_file():
            row.update(describe_rtf(str(project)))
        if located:
            row.update({f"gda{key[0].upper()}{key[1:]}": value for key, value in describe_rtf(str(located[0][2])).items()})
        return row

    def match_images() -> dict:
        """Match every compared game image with the GDA images, and order the same-named GDA files of a different one by
        folder and then by probability, so Sync copies the closest and most similar. Return the run's imageCompare; an
        error leaves the rows without image matches."""
        queries = []
        for source, result in checked.items():
            if result is None or source.suffix.lower() not in IMAGE_EXTENSIONS or status_category(result["status"]) not in ("identical", "different", "missing"):
                continue
            named = [path for _tree, _root, path in result["located"]]
            trees = tuple(tree for tree, _root, _index in trees_of(source))
            identical = result["status"] == "identical"
            queries.append(Query(source, trees, named, named[0] if identical else None, identical and result["mipOnly"]))
        targets = [Target(path, tree, root) for tree, root, by_name in filter(None, (game_gda, common_gda))
                   for paths in by_name.values() for path in paths if path.suffix.lower() in IMAGE_EXTENSIONS]
        matcher = ImageMatcher(Settings(config.multithreading, config.use_gpu, config.image_match_threshold), hashes.cache, hashes,
                               map_function, report)
        try:
            images.update(matcher.run(queries, targets))
        except Exception as error:  # The status of every resource stands without the image matching.
            images.clear()
            return {**matcher.report(), "error": f"{type(error).__name__}: {error}"}
        for source, matched in images.items():
            result = checked[source]
            if status_category(result["status"]) == "different":
                display = os.path.relpath(source, game_dir)
                result["located"].sort(key=lambda item: (-path_overlap(display, item[2].relative_to(item[1]).as_posix()),
                                                         -((matched["named"].get(item[2]) or {}).get("probability") or -1)))
        return matcher.report()

    rows: list[dict] = [file_row(source, SUPPLEMENTARY) for source in found.supplementary]
    rows.extend(guessed_sequence_row(files) for files in found.guessed)
    seen: set[Path] = set()
    # An RTF's .rtf files are its folder's.
    relatives = [relative for template in sorted(found.templates) for relative in expand_path(template)
                 if not ((path := (game_dir / relative).resolve()).parent in found.rtfs and path.suffix.lower() == RTF_SUFFIX)]
    sources = list(dict.fromkeys([(game_dir / relative).resolve() for relative in relatives]
                                 + [source for *_, frames in found.sequences for _frame, source in frames]))
    # The files that classify hashes, hashed together on the run's threads: each compared file with GDA files of its
    # name, and those GDA files.
    hashed = list(dict.fromkeys(path for source in sources if compared(source) and (located := locate(source))
                                for path in (source, *(path for _tree, _root, path in located))))
    for start in range(0, len(hashed), HASH_CHUNK):
        report("hashing", start, len(hashed))
        hashes.prefetch(hashed[start:start + HASH_CHUNK])
    report("hashing", len(hashed), len(hashed))
    # Every file is classified first, and the RTFs compared, so the image matching sees every image's status before the
    # rows are made.
    total = len(sources) + sum(len(files) for _project, files in found.rtfs.values())
    report("compare", 0, total)
    for done, source in enumerate(sources, 1):
        check(source)
        report("compare", done, total)
    done = len(sources)
    rtf_rows = []
    for folder, (project, files) in found.rtfs.items():
        if (row := rtf_row(folder, project, files)) is not None:
            rtf_rows.append(row)
        done += len(files)
        report("compare", done, total)
    image_compare = match_images()
    for relative in relatives:
        source = (game_dir / relative).resolve()
        if source in seen:
            continue
        seen.add(source)
        result = check(source)
        if result is not None:
            rows.append(file_row(source, result))
    for document_name, sequence, lines, frames in found.sequences:
        if (row := sequence_row(document_name, sequence, lines, frames)) is not None:
            rows.append(row)
    rows.extend(rtf_rows)
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
        # The image matching's settings, algorithms, counts, cache and times.
        "imageCompare": image_compare,
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
