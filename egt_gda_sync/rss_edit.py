"""Remove declarations from the *Data.json resource descriptors, keeping the rest of each file's text as it is: its
indentation, line endings and key order. A declaration is a member of a list: the entry that holds a path, the image
sequence that holds a frame, or one sample of an audio event, and removing it keeps the separators of the others."""

from __future__ import annotations

import json
import os
import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from json.decoder import scanstring
from pathlib import Path
from typing import Any

from .rss_schemas import DOCUMENT_TYPES, parse_dataclass
from .rss_sync import expand_path

WHITESPACE = re.compile(r"[ \t\n\r]*")
NUMBER = re.compile(r"-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?")
LITERALS = {"true": True, "false": False, "null": None}

Key = tuple[str | int, ...]  # where a value is: the object keys and list indexes from the top of the file


@dataclass
class Node:
    """A value of a JSON text: where it starts and ends, and its value, or the members of an object or a list."""
    start: int
    end: int
    value: Any = None
    members: list[tuple[str | int, Node]] = field(default_factory=list)
    kind: str = ""  # "object" or "list" for a container

    def member(self, name: str) -> Node | None:
        return next((node for key, node in self.members if key == name), None)


def parse(text: str) -> Node:
    """The values of a JSON text with their places in it."""
    json.loads(text)  # Rejects malformed text, so the scan below can trust its structure.

    def skip(index: int) -> int:
        return WHITESPACE.match(text, index).end()

    def value(index: int) -> Node:
        start = skip(index)
        char = text[start]
        if char == '"':
            string, end = scanstring(text, start + 1)
            return Node(start, end, string)
        if char in "{[":
            node = Node(start, start, kind="object" if char == "{" else "list")
            index = skip(start + 1)
            while text[index] not in "}]":
                if node.kind == "object":
                    key = value(index)
                    member = value(skip(key.end) + 1)  # past the colon
                    node.members.append((key.value, member))
                else:
                    member = value(index)
                    node.members.append((len(node.members), member))
                index = skip(member.end)
                if text[index] == ",":
                    index = skip(index + 1)
            node.end = index + 1
            return node
        literal = next((name for name in LITERALS if text.startswith(name, start)), None)
        if literal is not None:
            return Node(start, start + len(literal), LITERALS[literal])
        number = NUMBER.match(text, start)
        if number is None:
            raise ValueError(f"unsupported JSON value at character {start}")
        return Node(start, number.end(), json.loads(number.group()))

    return value(0)


def walk(node: Node, key: Key = ()) -> Iterator[tuple[Key, Node]]:
    yield key, node
    for name, member in node.members:
        yield from walk(member, (*key, name))


def resolved(game_dir: Path, template: str) -> set[Path]:
    """The files a declared path names, resolved like the GDA sync resolves them."""
    return {(game_dir / relative).resolve() for relative in expand_path(template)}


def declaration_keys(root: Node, row: dict, game_dir: Path) -> list[Key]:
    """The keys of the list members that declare a row of the GDA sync report in a descriptor. An image sequence row is
    its sequence: the one with its id and, like the report lists them, its frame paths. A file row is every entry outside
    an image sequence that declares its file, and every sample of an audio event that does; an event goes as a whole
    when it would have no samples left. An RTF row is every entry that declares its .rtf file. game_dir is the game
    folder as the GDA sync resolved it."""
    keys: list[Key] = []
    sequence = row.get("sequence")
    file = Path(row["directory"]["project"] if "directory" in row else row["resourcePath"])
    for key, node in walk(root):
        if sequence is not None:
            if node.kind != "object" or len(key) < 2 or key[-2] != "imagesSeq" or getattr(node.member("id"), "value", None) != sequence["id"]:
                continue
            frames = node.member("frames")
            paths = [path.value for _index, frame in (frames.members if frames else []) if (path := frame.member("path")) is not None]
            if list(dict.fromkeys(os.path.relpath((game_dir / path).resolve(), game_dir) for path in paths)) == sequence["paths"]:
                keys.append(key)
        elif "frames" in key or "include" in key:
            continue
        elif node.kind == "object" and key and isinstance(key[-1], int):
            path = node.member("path")
            if path is not None and isinstance(path.value, str) and file in resolved(game_dir, path.value):
                keys.append(key)
        elif node.kind == "list" and key and key[-1] == "samples":
            matches = [(*key, index) for index, sample in node.members
                       if isinstance(sample.value, str) and file in resolved(game_dir, sample.value)]
            if matches:
                keys.extend([key[:-1]] if len(matches) == len(node.members) else matches)
    return keys


def without(text: str, root: Node, removed: set[Key]) -> str:
    """The text without the list members at the given keys. The members that stay keep the separator that followed
    them, and the last one the text that closed the list after the last member, so the indentation stays."""
    inside = {key[:length] for key in removed for length in range(len(key) + 1)}

    def render(node: Node, key: Key) -> str:
        if key not in inside:
            return text[node.start:node.end]
        kept = [(name, member) for name, member in node.members if (*key, name) not in removed]
        if node.kind == "list" and len(kept) < len(node.members):
            if not kept:
                return "[]"
            parts = [text[node.start:node.members[0][1].start]]
            for position, (name, member) in enumerate(kept):
                parts.append(render(member, (*key, name)))
                following = node.members[name + 1][1].start if position + 1 < len(kept) else None
                parts.append(text[member.end:following] if following is not None else text[node.members[-1][1].end:node.end])
            return "".join(parts)
        parts, position = [], node.start
        for name, member in node.members:
            parts += [text[position:member.start], render(member, (*key, name))]
            position = member.end
        return "".join([*parts, text[position:node.end]])

    return text[:root.start] + render(root, ()) + text[root.end:]


def remove_declarations(descriptor: Path, text: str, rows: list[dict], game_dir: Path) -> tuple[str, dict[str, int]]:
    """A descriptor's text without the declarations of the given rows of the GDA sync report, and how many members
    each row lost. The result must still be a descriptor of its type."""
    cls = DOCUMENT_TYPES.get(descriptor.name)
    if cls is None:
        raise ValueError(f"unsupported resource descriptor: {descriptor.name}")
    root = parse(text)
    keys = {row["id"]: declaration_keys(root, row, game_dir) for row in rows}
    removed = {key for row_keys in keys.values() for key in row_keys}
    # The samples of several rows can together leave an audio event without samples; it then goes as a whole.
    for key, node in walk(root):
        if node.kind == "list" and key and key[-1] == "samples" and node.members and all((*key, index) in removed for index, _ in node.members):
            removed = {item for item in removed if item[:len(key)] != key} | {key[:-1]}
    result = without(text, root, removed)
    parse_dataclass(cls, json.loads(result), str(descriptor))
    return result, {row_id: len(row_keys) for row_id, row_keys in keys.items()}
