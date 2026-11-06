"""The text of a view's Text elements, drawn as the game's TextElement draws it, for previews.

A Text element names a text style (rssStyleId) whose font_id names a font (RssFontsData.json) and whose size is the
size to draw it at. A font is a TrueType or OpenType file, drawn with Pillow, or an image font: an image of glyphs, one
for each character its entry declares (chars, such as "[U+0020][U+0030-U+0039]"), in order, cut as the C++ game's
video_ctrl cuts them (_image_glyphs). An image font is scaled by the style's size over the font's.

The text is laid out on one line, or for a vertical element (orientation Vertical) one character under another, each as
tall as its ink. Its size is what the element is aligned by. A fit box shrinks a larger text uniformly, never grows it,
around the point of the box that the element's alignment names (TextElement::GetTransform). The game fills the texts of
its views in at runtime, so the previews draw a sample text instead; an image font draws only the characters it has.
Unless one is given, the sample suits the font: an amount, 1 234.56, in a font that has a decimal point, such as the
credit and win fonts, and a count, 10, in one of digits alone, such as a counter's.
"""

from __future__ import annotations

import os
import threading
from collections import OrderedDict
from pathlib import Path

import numpy as np

from egt_gda_sync.assets.fonts import declared_characters
from egt_gda_sync.images.image_compare import decode_image

# The sample text that suits each font, unless one is given: an amount, or a count in a font without a decimal point.
DEFAULT_SAMPLE = "\x00default"
AMOUNT_SAMPLE = "1 234.56"
COUNT_SAMPLE = "10"
IMAGE_FONT_SUFFIXES = (".png", ".dds", ".tga", ".bmp", ".jpg", ".jpeg", ".webp")
# The alignment of an element, as the share of its width and height it is moved left and up by.
CACHE = 256

_cache: OrderedDict[tuple, tuple[np.ndarray, tuple[float, float]] | None] = OrderedDict()
_lock = threading.Lock()


def is_image_font(path: str | Path) -> bool:
    return Path(path).suffix.lower() in IMAGE_FONT_SUFFIXES


def _image_glyphs(path: Path, chars: str, size: int | None = None) -> dict[str, np.ndarray]:
    """An image font's glyphs, by character, as RGBA arrays, cut as hat_libs/video_ctrl/png_font.cpp's
    create_font_from_cyan_sep_png cuts them (and the browser game's Fonts.ts): each runs from where the previous one ends
    (the first from the left edge) to the next cyan pixel of its line's first row, so a glyph's first column is the
    column of its cyan pixel, and its width is how far the next one starts; it is the font's size tall (size, or else
    the image's height), below that row. A line without one more cyan pixel goes on to the next line, the font's size
    and the cyan row lower. ValueError when the image runs out, where C++ cannot load the font."""
    rgba = decode_image(path)
    if rgba.shape[0] < 2:
        raise ValueError("the image font is too small")
    cyan = (rgba[..., 0] == 0) & (rgba[..., 1] == 255) & (rgba[..., 2] == 255) & (rgba[..., 3] != 0)
    height = size if size and size > 0 else rgba.shape[0] - 1
    offset = 1  # the cyan row
    glyphs = {}
    x, y = 0, 0
    for point in declared_characters(chars):
        while True:
            found = np.flatnonzero(cyan[y, x + 1:])
            if found.size:
                end = x + 1 + int(found[0])
                break
            x, y = 0, y + height + offset
            if y >= rgba.shape[0]:
                raise ValueError(f"the image font has no cyan pixel that ends the glyph of {chr(point)!r}")
        glyph = rgba[y + offset:y + offset + height, x:end]
        # as tall as the font's size even where the image ends sooner: C++'s glyph quad is
        glyphs[chr(point)] = np.pad(glyph, ((0, height - glyph.shape[0]), (0, 0), (0, 0))) if glyph.shape[0] < height else glyph
        x = end
    return glyphs


def _ink_rows(glyph: np.ndarray) -> tuple[int, int]:
    rows = np.flatnonzero(glyph[..., 3].any(axis=1)) if glyph.size else np.array([], int)
    return (int(rows[0]), int(rows[-1]) + 1) if rows.size else (0, 0)


def _image_text(path: Path, chars: str, size: int | None, scale: float, text: str, vertical: bool) -> tuple[np.ndarray, tuple[float, float]] | None:
    glyphs = _image_glyphs(path, chars, size)
    drawn = [glyphs[character] for character in text if character in glyphs]
    if not drawn:
        return None
    if vertical:
        parts = [glyph[top:bottom] for glyph in drawn for top, bottom in [_ink_rows(glyph)] if bottom > top]
        if not parts:
            return None
        width = max(part.shape[1] for part in parts)
        image = np.zeros((sum(part.shape[0] for part in parts), width, 4), np.uint8)
        y = 0
        for part in parts:
            image[y:y + part.shape[0], :part.shape[1]] = part
            y += part.shape[0]
    else:
        image = np.concatenate(drawn, axis=1)
    if scale != 1.0:
        import cv2

        size = (max(1, round(image.shape[1] * scale)), max(1, round(image.shape[0] * scale)))
        image = cv2.resize(image, size, interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
    return image, (float(image.shape[1]), float(image.shape[0]))


def _outline_text(path: Path, size: float, text: str, vertical: bool) -> tuple[np.ndarray, tuple[float, float]] | None:
    from PIL import Image, ImageDraw, ImageFont

    font = ImageFont.truetype(str(path), max(1, round(size)))
    ascent, descent = font.getmetrics()
    if vertical:
        boxes = [(character, font.getbbox(character, anchor="la")) for character in text]
        boxes = [(character, box) for character, box in boxes if box[3] > box[1]]
        if not boxes:
            return None
        width = max(box[2] for _character, box in boxes)
        height = sum(box[3] - box[1] for _character, box in boxes)
        canvas = Image.new("RGBA", (max(1, width), max(1, height)), (0, 0, 0, 0))
        draw = ImageDraw.Draw(canvas)
        y = 0
        for character, box in boxes:
            draw.text((0, y - box[1]), character, font=font, fill=(255, 255, 255, 255), anchor="la")
            y += box[3] - box[1]
    else:
        width = round(font.getlength(text))
        if width <= 0:
            return None
        canvas = Image.new("RGBA", (width, ascent + descent), (0, 0, 0, 0))
        ImageDraw.Draw(canvas).text((0, 0), text, font=font, fill=(255, 255, 255, 255), anchor="la")
    image = np.asarray(canvas)
    return image, (float(image.shape[1]), float(image.shape[0]))


def text_image(font: dict, size: float, text: str, vertical: bool = False) -> tuple[np.ndarray, tuple[float, float]] | None:
    """A text drawn in a font entry (its absolute path, chars and size) at a style's size, as straight RGBA, and its size;
    None when nothing of it can be drawn. Kept for later previews until the font file changes."""
    path = Path(font["path"])
    info = path.stat()
    key = (str(path), info.st_mtime_ns, info.st_size, str(font.get("chars") or ""), font.get("size"), round(size, 3), text, vertical)
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    if is_image_font(path):
        declared = font.get("size")
        scale = size / float(declared) if isinstance(declared, (int, float)) and declared > 0 and size > 0 else 1.0
        result = _image_text(path, str(font.get("chars") or ""), round(declared) if isinstance(declared, (int, float)) else None, scale, text, vertical)
    else:
        result = _outline_text(path, size, text, vertical)
    with _lock:
        _cache[key] = result
        while len(_cache) > CACHE:
            _cache.popitem(last=False)
    return result


def sample_for(font: dict, text: str) -> str:
    """The text a font draws: the given one, or the default sample that suits it."""
    if text != DEFAULT_SAMPLE:
        return text
    declared = font.get("chars")
    if is_image_font(font["path"]) and isinstance(declared, str) and ord(".") not in declared_characters(declared):
        return COUNT_SAMPLE
    return AMOUNT_SAMPLE


def shrink_matrix(size: tuple[float, float], fit: tuple[float, float] | None, share: tuple[float, float]) -> np.ndarray:
    """The 3 × 3 matrix that shrinks a text larger than its fit box into it, around the box's point that the alignment's
    share names; the identity for a text that fits, or without a fit box."""
    if not fit or size[0] <= 0 or size[1] <= 0:
        return np.eye(3)
    shrink = min(fit[0] / size[0], fit[1] / size[1], 1.0)
    if shrink >= 1.0:
        return np.eye(3)
    pivot = (-share[0] * fit[0], -share[1] * fit[1])
    return np.array([[shrink, 0.0, (shrink - 1.0) * pivot[0]], [0.0, shrink, (shrink - 1.0) * pivot[1]], [0.0, 0.0, 1.0]])


def font_problem(font: dict | None, font_id: str) -> str | None:
    """Why a style's font cannot draw: it is not declared, or its file does not exist."""
    if font is None:
        return f"no font has the id {font_id}"
    if not os.path.isfile(font["path"]):
        return "the font file does not exist"
    return None
