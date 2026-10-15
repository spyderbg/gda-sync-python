"""Declare an asset that no descriptor declares: an entry for it in a *Data.json resource descriptor of the game.

Each kind of entry is the list of a descriptor type, such as the images of RssImagesData.json, with the fields that the
games' descriptors give it, in the order they write them. An asset is declared by the kinds that load its type of file,
the usual one first: an image as an Image, or as the bitmap of a Font, an image sequence as an ImageSequence, an audio
file as an AudioEvent, a font as a Font, an RTF as an Rtf, a view as an Element, a movie as a Movie, and any single file
as a RawFile, which the game reads as it is. The game's own descriptors suggest how: for each field, the values its
entries of the kind have, the most common first, which is the default when most of them have the field; an id named like
theirs; and the descriptors of the game folder that hold the kind's list, the dedicated one first.
"""

from __future__ import annotations

import os
import re
from collections import Counter
from dataclasses import dataclass, fields as dataclass_fields, is_dataclass
from pathlib import Path
from typing import Any

from egt_gda_sync.sync.rss_sync import NUMBERED_NAME, expand_path


@dataclass(frozen=True, slots=True)
class Kind:
    """A kind of descriptor entry: the list that holds it, the descriptor dedicated to that list, the fields of an
    entry in the order the descriptors write them, and those an entry needs."""
    list: str
    descriptor: str
    fields: tuple[str, ...]
    required: frozenset[str]


KINDS: dict[str, Kind] = {
    "Image": Kind("images", "RssImagesData.json", ("id", "path", "resolution", "language", "integration", "source"), frozenset({"id"})),
    "ImageSequence": Kind("imagesSeq", "RssImagesSeqData.json", ("id", "frameTime", "loopCount", "loopTo", "frames", "resolution", "language"),
                          frozenset({"id", "frameTime", "loopCount"})),
    "AudioEvent": Kind("audioEvents", "RssAudioData.json", ("id", "polyphonyGroup", "samples", "loop", "fadeIn", "fadeOut"), frozenset({"id"})),
    "Font": Kind("fonts", "RssFontsData.json", ("id", "path", "chars", "size", "resolution"), frozenset({"id", "chars", "size"})),
    "Rtf": Kind("rtfs", "RssRtfsData.json", ("id", "path", "integration"), frozenset({"id"})),
    "Element": Kind("elements", "RssElementsListData.json", ("id", "path", "resolution", "integration"), frozenset({"id"})),
    "Movie": Kind("movies", "RssMoviesData.json", ("id", "path", "movieFormat"), frozenset({"id", "movieFormat"})),
    "RawFile": Kind("rawFiles", "RssRawData.json", ("path",), frozenset()),
}
# The fields that the asset's files fill in: a single path, the frames of a sequence, or the samples of an audio event.
FILE_FIELDS = frozenset({"path", "frames", "samples"})
# The fields whose values are not suggested: an image's area is its own.
UNSUGGESTED = frozenset({"id", "source"})
# The fields whose values are suggested but not a default: an integration or a language picks a variant of an entry,
# which a new entry is not unless asked, and the frame a sequence loops to is its own.
UNDEFAULTED = frozenset({"integration", "language", "loopTo"})
MOVIE_EXTENSIONS = frozenset({".mov"})
# How the games name the ids of a kind, for a game that has none of its entries yet: a prefix, and the case of the rest.
ID_STYLES = {"Image": ("IMAGE_", "upper"), "ImageSequence": ("ANIM_", "upper"), "AudioEvent": ("SOUND_", "upper"),
             "Font": ("FONT_", "upper"), "Rtf": ("rtf_", "lower"), "Element": ("", "keep"), "Movie": ("ANIM_", "upper")}
ID_PREFIX = re.compile(r"^[A-Za-z]+_")
RESOLUTION = re.compile(r"(?<!\d)\d{3,5}x\d{3,5}(?!\d)")
SUGGESTED_VALUES = 20


def asset_kinds(row: dict) -> list[str]:
    """The kinds of entries that can declare an asset of the asset report, the usual one first."""
    if row.get("sequence"):
        return ["ImageSequence"]
    if row["type"] in ("rtf", "view"):
        return ["Rtf" if row["type"] == "rtf" else "Element"]
    kinds = {"texture": ["Image", "Font"], "audio": ["AudioEvent"], "font": ["Font"]}.get(row["type"])
    if kinds is None:
        kinds = ["Movie"] if Path(row["resourcePath"]).suffix.lower() in MOVIE_EXTENSIONS else []
    return [*kinds, "RawFile"]


def asset_files(row: dict) -> list[Path]:
    """The files of an asset that its entry declares: an RTF's .rtf file, a sequence's frames, or its file."""
    if row.get("sequence"):
        return [Path(frame["resourcePath"]) for frame in row["sequence"]["frames"]]
    return [Path(row["directory"]["project"] if "directory" in row else row["resourcePath"])]


def entry_paths(row: dict, game_dir: Path) -> list[str]:
    """The paths that declare an asset's files, relative to the game folder as the descriptors write them: a sequence's
    frames as its one {N-M} range when that names them all, in order, or else each of them."""
    def relative(file: Path | str) -> str:
        return Path(os.path.relpath(file, game_dir)).as_posix()

    files = asset_files(row)
    if row.get("sequence"):
        template = relative(row["resourcePath"])
        if [(game_dir / path).resolve() for path in expand_path(template)] == files:
            return [template]
    return [relative(file) for file in files]


def asset_name(row: dict) -> str:
    """What an asset's id is named after: its file's name, a sequence's without the frame number, or an RTF's folder."""
    if "directory" in row:
        return Path(row["resourcePath"]).name
    file = Path(row["sequence"]["frames"][0]["resourcePath"] if row.get("sequence") and row["sequence"]["frames"] else row["resourcePath"])
    match = NUMBERED_NAME.match(file.name) if row.get("sequence") else None
    return (match[1].strip("_-. ") if match else "") or file.stem.split("{")[0].strip("_-. ") or file.stem


def descriptor_targets(documents: dict[Path, Any], kind: Kind, game_dir: Path) -> list[Path]:
    """The game folder's descriptors that can hold a kind's entries: its dedicated descriptors, and others whose list of
    the kind has entries, the dedicated first, then the least deep."""
    found = [path for path, document in documents.items()
             if path.is_relative_to(game_dir) and (path.name == kind.descriptor or getattr(document, kind.list, None))]
    return sorted(found, key=lambda path: (path.name != kind.descriptor, len(path.relative_to(game_dir).parts), str(path)))


def suggested_id(kind_name: str, ids: list[str], name: str) -> str | None:
    """An id for a new entry, named like the kind's other ids: their usual prefix and case, then the asset's name, and
    a number when another entry has it already. None for a kind without ids."""
    if kind_name not in ID_STYLES:
        return None
    if ids:
        prefixes = Counter(match[0] for item in ids if (match := ID_PREFIX.match(item)))
        prefix, count = prefixes.most_common(1)[0] if prefixes else ("", 0)
        prefix = prefix if count * 2 >= len(ids) else ""
        case = "upper" if sum(item == item.upper() for item in ids) * 2 > len(ids) \
            else "lower" if sum(item == item.lower() for item in ids) * 2 > len(ids) else "keep"
    else:
        prefix, case = ID_STYLES[kind_name]
    word = re.sub(r"[^0-9A-Za-z]+", "_", name).strip("_") or "ASSET"
    word = word.upper() if case == "upper" else word.lower() if case == "lower" else word
    base = word if prefix and word.lower().startswith(prefix.lower()) else prefix + word
    existing, candidate, number = set(ids), base, 2
    while candidate in existing:
        candidate, number = f"{base}_{number}", number + 1
    return candidate


def kind_options(kind_name: str, documents: dict[Path, Any], game_dir: Path, paths: list[str], name: str) -> dict:
    """How the game declares a kind of entries: the descriptors that can hold a new one, relative to the game folder, the
    ids its entries have, an id for the new one, and for each field, the values its entries have, the most common first,
    and the default: the most common value when most of its entries have the field (UNDEFAULTED has none), and a
    resolution in the asset's path that its entries use."""
    kind = KINDS[kind_name]
    entries = [entry for document in documents.values() for entry in getattr(document, kind.list, ())]
    ids = [entry.id for entry in entries if isinstance(getattr(entry, "id", None), str)]
    fields: dict[str, dict] = {}
    for field in kind.fields:
        if field in FILE_FIELDS or field in UNSUGGESTED:
            continue
        counts = Counter(value for entry in entries if (value := getattr(entry, field, None)) is not None)
        used = sum(counts.values())
        default = counts.most_common(1)[0][0] if counts and used * 2 >= len(entries) and field not in UNDEFAULTED else None
        if field == "resolution" and default is not None:
            default = next((token for path in paths for token in RESOLUTION.findall(path) if token in counts), default)
        fields[field] = {"default": default, "used": used, "values": [[value, count] for value, count in counts.most_common(SUGGESTED_VALUES)]}
    return {
        "kind": kind_name, "list": kind.list, "fields": list(kind.fields), "required": sorted(kind.required), "entries": len(entries),
        "descriptors": [path.relative_to(game_dir).as_posix() for path in descriptor_targets(documents, kind, game_dir)],
        "ids": sorted(set(ids)), "id": suggested_id(kind_name, ids, name), "values": fields,
    }


def used_values(documents: dict[Path, Any], field: str) -> list[list]:
    """The values that the entries of every kind give a field, such as each resolution or language the game uses, with
    how many entries have each, the most common first."""
    counts: Counter = Counter()
    for document in documents.values():
        for item in dataclass_fields(document):
            for entry in getattr(document, item.name):
                if is_dataclass(entry) and (value := getattr(entry, field, None)) is not None:
                    counts[value] += 1
    return [[value, count] for value, count in counts.most_common()]


def build_entry(kind_name: str, paths: list[str], values: dict[str, Any]) -> dict:
    """A new entry of a kind for the given paths, with the given values of its other fields, in the order the
    descriptors write them; a loop that is not set is left out. ValueError for a field the kind does not have, a
    required one without a value, or a sequence that loops to a frame it does not have."""
    kind = KINDS[kind_name]
    unknown = sorted((set(values) - set(kind.fields)) | (set(values) & FILE_FIELDS))
    if unknown:
        raise ValueError(f"{kind_name} entries have no {', '.join(unknown)}")
    missing = sorted(field for field in kind.required if values.get(field) is None)
    if missing:
        raise ValueError(f"{kind_name} entries need {', '.join(missing)}")
    if "path" in kind.fields and len(paths) != 1:
        raise ValueError(f"{kind_name} entries declare one file")
    frames = sum(len(list(expand_path(path))) for path in paths)
    if kind_name == "ImageSequence" and values.get("loopTo") is not None and values["loopTo"] >= frames:
        raise ValueError(f"The sequence has {frames} frames, so it cannot loop to frame {values['loopTo']}")
    entry: dict[str, Any] = {}
    for field in kind.fields:
        if field == "path":
            entry["path"] = paths[0]
        elif field == "frames":
            entry["frames"] = [{"path": path} for path in paths]
        elif field == "samples":
            entry["samples"] = list(paths)
        elif values.get(field) is not None and not (field == "loop" and values[field] is False):
            entry[field] = values[field]
    return entry
