"""Synthetic sfnt fonts with only the tables that egt_gda_sync.fonts reads: cmap, name and maxp."""

import struct


def _cmap(characters: list[int]) -> bytes:
    """A format 4 subtable for the BMP characters, one segment each, and a format 12 one for every character."""
    bmp = sorted(character for character in characters if character <= 0xFFFF)
    segments = [(character, (index + 1 - character) & 0xFFFF) for index, character in enumerate(bmp)] + [(0xFFFF, 1)]
    count = len(segments)
    body = b"".join(struct.pack(">H", start) for start, _ in segments)  # end codes, one character a segment
    body += b"\0\0" + body + b"".join(struct.pack(">H", delta) for _, delta in segments) + b"\0\0" * count
    format4 = struct.pack(">7H", 4, 14 + len(body), 0, count * 2, 0, 0, 0) + body
    groups = b"".join(struct.pack(">III", character, character, index + 1) for index, character in enumerate(sorted(characters)))
    format12 = struct.pack(">HHIII", 12, 0, 16 + len(groups), 0, len(characters)) + groups
    header = struct.pack(">HH", 0, 2) + struct.pack(">HHI", 3, 1, 20) + struct.pack(">HHI", 3, 10, 20 + len(format4))
    return header + format4 + format12


def _names(names: dict[int, str]) -> bytes:
    records, strings = b"", b""
    for name_id, text in sorted(names.items()):
        encoded = text.encode("utf-16-be")
        records += struct.pack(">6H", 3, 1, 0x409, name_id, len(encoded), len(strings))
        strings += encoded
    return struct.pack(">3H", 0, len(names), 6 + len(records)) + records + strings


def build_font(characters: list[int], family: str = "Test Sans", style: str = "Regular", version: str = "Version 1.000",
               glyphs: int | None = None, cff: bool = False, collection: bool = False) -> bytes:
    tables = {
        b"cmap": _cmap(characters),
        b"maxp": struct.pack(">IH", 0x00005000, glyphs if glyphs is not None else len(characters) + 1),
        b"name": _names({1: family, 2: style, 4: f"{family} {style}", 5: version}),
    }
    start = 16 if collection else 0  # A collection's header: its tag, version, font count and the offset of its font.
    directory = 12 + 16 * len(tables)
    offset, records, data = start + directory, b"", b""
    for tag, table in sorted(tables.items()):
        records += tag + struct.pack(">III", 0, offset + len(data), len(table))
        data += table + b"\0" * (-len(table) % 4)
    font = (b"OTTO" if cff else b"\x00\x01\x00\x00") + struct.pack(">HHHH", len(tables), 0, 0, 0) + records + data
    return b"ttcf" + struct.pack(">HHII", 1, 0, 1, start) + font if collection else font
