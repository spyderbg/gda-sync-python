"""Read TrueType and OpenType fonts, enough to describe them and to check which characters they have.

A font's names and version come from its name table, its glyph count from maxp, and its characters from the Unicode
subtables of cmap. A font collection (.ttc) is read by its first font. A Font entry of a descriptor declares the
characters the game draws with it as ranges, such as "[U+0020-U+00FF][U+20AC]"; control characters and unassigned code
points in them are not drawn, so they are not checked. The samples a font can draw, from SAMPLES, are the ones whose
every character, but the spaces, it has.
"""

from __future__ import annotations

import json
import re
import struct
import unicodedata
from urllib.parse import quote

FONT_EXTENSIONS = {"ttf": "font/ttf", "otf": "font/otf"}
CHARS_PATTERN = re.compile(r"\[U\+([0-9A-Fa-f]{1,6})(?:-U\+([0-9A-Fa-f]{1,6}))?\]")
# How many of the characters a font misses a coverage lists; the count is always complete.
MISSING_LIMIT = 64
# A font maps at most this many characters; a larger cmap is malformed.
MAX_CHARACTERS = 0x110000
NAME_IDS = {"family": (16, 1), "style": (17, 2), "fullName": (4,), "version": (5,)}
# A sample text for each writing system, in the order a specimen shows them, a pangram where there is a short one, and
# the two characters a card shows large.
SAMPLES = (
    ("Latin", "Aa", "The quick brown fox jumps over the lazy dog."),
    ("Latin Extended", "Řř", "Příliš žluťoučký kůň úpěl ďábelské ódy. Zażółć gęślą jaźń."),
    ("Cyrillic", "Жж", "Жълтата дюля беше щастлива, че пухът, който цъфна, замръзна като гьон."),
    ("Greek", "Ωω", "Ξεσκεπάζω την ψυχοφθόρα βδελυγμία."),
    ("Arabic", "عب", "نص حكيم له سر قاطع وذو شأن عظيم مكتوب على ثوب أخضر ومغلف بجلد أزرق"),
    ("Hebrew", "אב", "דג סקרן שט בים מאוכזב ולפתע מצא חברה"),
    ("Thai", "กข", "เป็นมนุษย์สุดประเสริฐเลิศคุณค่า"),
    ("Japanese", "あア", "いろはにほへと ちりぬるを わかよたれそ つねならむ"),
    ("Chinese", "永字", "我能吞下玻璃而不伤身体。"),
    ("Korean", "가나", "키스의 고유조건은 입술끼리 만나야 하고 특별한 기술은 필요치 않다."),
)
# The currency signs a specimen shows, those the font has.
CURRENCIES = "€£$¥₽₺₹₩₪¢"


def _u16(data: bytes, offset: int) -> int:
    return struct.unpack_from(">H", data, offset)[0]


def _u32(data: bytes, offset: int) -> int:
    return struct.unpack_from(">I", data, offset)[0]


def _tables(data: bytes) -> tuple[str, dict[str, tuple[int, int]]]:
    """The font's format and its tables by tag, as offsets and lengths into the file."""
    start = 0
    if data[:4] == b"ttcf":
        start = _u32(data, 12)  # The first font of the collection.
    tag = data[start:start + 4]
    if tag not in (b"\x00\x01\x00\x00", b"true", b"OTTO"):
        raise ValueError("Not a TrueType or OpenType font")
    tables = {}
    for index in range(_u16(data, start + 4)):
        record = start + 12 + 16 * index
        name = data[record:record + 4].decode("latin-1")
        offset, length = struct.unpack_from(">II", data, record + 8)
        if offset + length > len(data):
            raise ValueError(f"The font's {name.strip()} table is cut off")
        tables[name] = (offset, length)
    return "OpenType (CFF)" if tag == b"OTTO" else "TrueType", tables


def _names(data: bytes, offset: int) -> dict[str, str]:
    """The family, style, full name and version, preferring the Windows English names, then other Unicode ones, then the
    Macintosh Roman ones."""
    count, strings = _u16(data, offset + 2), offset + _u16(data, offset + 4)
    found: dict[int, tuple[int, str]] = {}
    for index in range(count):
        platform, encoding, language, name_id, length, start = struct.unpack_from(">6H", data, offset + 6 + 12 * index)
        raw = data[strings + start:strings + start + length]
        if platform == 3 and encoding in (1, 10) or platform == 0:
            rank, text = (0 if platform == 3 and language == 0x409 else 1), raw.decode("utf-16-be", "replace")
        elif platform == 1 and encoding == 0:
            rank, text = 2, raw.decode("mac_roman", "replace")
        else:
            continue
        if text.strip() and (name_id not in found or rank < found[name_id][0]):
            found[name_id] = (rank, text.strip())
    return {key: next(found[name_id][1] for name_id in ids if name_id in found)
            for key, ids in NAME_IDS.items() if any(name_id in found for name_id in ids)}


def _subtable(data: bytes, offset: int, characters: set[int]) -> None:
    """Add the characters that a cmap subtable maps to a glyph other than .notdef."""
    kind = _u16(data, offset)
    if kind == 4:
        segments = _u16(data, offset + 6) // 2
        ends, starts = offset + 14, offset + 16 + 2 * segments
        deltas, range_offsets = starts + 2 * segments, starts + 4 * segments
        for index in range(segments):
            end, start = _u16(data, ends + 2 * index), _u16(data, starts + 2 * index)
            delta, range_offset = _u16(data, deltas + 2 * index), _u16(data, range_offsets + 2 * index)
            if start > end or start == 0xFFFF:
                continue
            if range_offset == 0:
                # Every character maps to itself plus delta, so only one can map to glyph 0.
                notdef = (0x10000 - delta) & 0xFFFF
                characters.update(character for character in range(start, end + 1) if character != notdef)
                continue
            for character in range(start, end + 1):
                address = range_offsets + 2 * index + range_offset + 2 * (character - start)
                if address + 2 <= len(data) and _u16(data, address):
                    characters.add(character)
    elif kind in (12, 13):
        for index in range(_u32(data, offset + 12)):
            start, end, glyph = struct.unpack_from(">III", data, offset + 16 + 12 * index)
            end = min(end, MAX_CHARACTERS - 1)
            if start > end or len(characters) + end - start > MAX_CHARACTERS:
                continue
            if kind == 12:
                # The group's characters map to consecutive glyphs from glyph, so only its first can be .notdef.
                characters.update(range(start + (glyph == 0), end + 1))
            elif glyph:
                # Format 13 maps the whole group to one glyph.
                characters.update(range(start, end + 1))
    elif kind == 6:
        first, count = _u16(data, offset + 6), _u16(data, offset + 8)
        characters.update(first + index for index in range(count) if _u16(data, offset + 10 + 2 * index))
    elif kind == 0:
        characters.update(index for index in range(256) if data[offset + 6 + index])


def _characters(data: bytes, offset: int) -> set[int]:
    """Every character of the font's Unicode cmap subtables; a symbol font's U+F0xx characters also count as U+00xx."""
    characters: set[int] = set()
    for index in range(_u16(data, offset + 2)):
        platform, encoding, start = struct.unpack_from(">HHI", data, offset + 4 + 8 * index)
        if platform == 0 or platform == 3 and encoding in (0, 1, 10):
            found: set[int] = set()
            _subtable(data, offset + start, found)
            if platform == 3 and encoding == 0:
                found |= {character - 0xF000 for character in found if 0xF000 <= character <= 0xF0FF}
            characters |= found
    return characters


def samples(characters: set[int]) -> list[dict]:
    """The samples a font can draw, and a line of the currency signs it has."""
    found = [{"script": script, "pair": pair, "text": text} for script, pair, text in SAMPLES
             if all(ord(character) in characters for character in text if not character.isspace())]
    currencies = [character for character in CURRENCIES if ord(character) in characters]
    if currencies:
        found.append({"script": "Currencies", "pair": "".join(currencies[:2]), "text": " ".join(currencies)})
    return found


def read_font(data: bytes) -> tuple[dict, set[int]]:
    """A font's facts, its format, names, version, glyph count and the samples it can draw, and its characters."""
    try:
        kind, tables = _tables(data)
        facts: dict = {"format": kind}
        if "name" in tables:
            facts.update(_names(data, tables["name"][0]))
        if "maxp" in tables:
            facts["glyphs"] = _u16(data, tables["maxp"][0] + 4)
        characters = _characters(data, tables["cmap"][0]) if "cmap" in tables else set()
    except (struct.error, IndexError) as error:
        raise ValueError("The font file is damaged or cut off") from error
    facts["samples"] = samples(characters)
    return facts, characters


def facts_header(data: bytes) -> str | None:
    """A font's facts as an HTTP header value, percent-encoded JSON, or None for a file that is not a font that can be read."""
    try:
        facts, _characters = read_font(data)
    except ValueError:
        return None
    return quote(json.dumps(facts, ensure_ascii=False, separators=(",", ":")), safe="")


def declared_characters(chars: str) -> list[int]:
    """The characters that a Font entry declares, in order and each once, without the ones that are never drawn. Text
    without [U+…] ranges is the characters themselves."""
    ranges = CHARS_PATTERN.findall(chars)
    points: list[int] = []
    if ranges:
        for start, end in ranges:
            first, last = int(start, 16), int(end or start, 16)
            points.extend(range(min(first, last), min(max(first, last), MAX_CHARACTERS - 1) + 1))
    else:
        points = [ord(character) for character in chars]
    return [point for point in dict.fromkeys(points) if drawn(point)]


def drawn(point: int) -> bool:
    """Whether a character is drawn: not a control character, a surrogate or an unassigned code point."""
    return unicodedata.category(chr(point)) not in ("Cc", "Cs", "Cn")


def coverage(characters: set[int], chars: str) -> dict:
    """How many of a Font entry's declared characters a font has, and the first of the ones it misses."""
    declared = declared_characters(chars)
    missing = [point for point in declared if point not in characters]
    return {"declared": len(declared), "covered": len(declared) - len(missing), "missing": missing[:MISSING_LIMIT], "missingCount": len(missing)}


def describe_font(path: str, declared: list[str] = ()) -> dict:
    """A font file's facts and, for each declared character list, its coverage; a file that is not a font that can be
    read has only fontError."""
    try:
        with open(path, "rb") as handle:
            facts, characters = read_font(handle.read())
    except (OSError, ValueError) as error:
        return {"fontError": str(error) or type(error).__name__}
    return {"font": facts, **({"coverage": [coverage(characters, chars) for chars in declared]} if declared else {})}
