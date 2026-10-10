"""Views: the *.json files in a game's v folder, which the game's view elements (GameVideoCtrl/ViewElements) draw.

A view is a list of elements, drawn in order on a screen of the resolution its folder names (v/1920x1080/...):

- Image: an image (rssKey, or the first of rssKeys);
- Button and ToggleButton: an image for each state (rssKeys), the first the idle one, and the area that takes touches
  (touchArea); a button without images, or with only DUMMY_AREA, is a touch area alone;
- Anim: an image sequence, which render_view draws with its first frame, or a movie, which is not drawn; its layout
  lists the frames and how they play, a frame every frameTime milliseconds, loopCount times (the element's own, or else
  the sequence's; 0 repeats from frame loopTo), each frame placed by its own size, for the details to play them over
  render_view's segments: the still elements drawn before and after each Anim that plays;
- Text: a text filled in at runtime, in a text style (rssStyleId) and within a fit box (fitBox), which the previews
  draw with a sample text in the style's font and size (view_text);
- Rtf: a page of an RTF project, drawn here with the background of its first page that has one;
- Dummy: a hidden point that other elements are placed by.

An element names its resources by id, which the game's *Data.json descriptors declare; of several entries with one id,
the one for the view's resolution is used. An Image or Anim without an id gets its image at runtime, so it draws nothing
here without missing anything. Each element is placed as BaseElement::GetTransform places it: moved by its
alignment and its size, scaled and rotated around its pivot, at its position; and tinted by its color. A hidden element
is drawn only on request. *Data.json files in the v folder are descriptors, not views.

describe_view gives the facts a report keeps, view_layout the place of every element, and render_view the view composed
as a PNG image, or one segment of it: the elements between two that the page draws itself, such as the Anims that
play and the elements being moved.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import struct
import threading
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .dds import read_dds_info
from .image_compare import decode_image
from .rtf import describe_rtf
from .view_text import font_problem, sample_for, shrink_matrix, text_image

VIEW_FOLDER = "v"
VIEW_SUFFIX = ".json"
DESCRIPTOR_SUFFIX = "Data.json"
MAX_VIEW_BYTES = 4 * 1024 * 1024
RESOLUTION = re.compile(r"(\d{2,5})x(\d{2,5})")
DEFAULT_RESOLUTION = (1920, 1080)
MISSING_LIMIT = 64
# Element types that draw an image, and the types a view can have (ElementType in ElementsList.data.h).
IMAGE_TYPES = ("Image", "Button", "ToggleButton")
TYPES = ("Image", "Anim", "Button", "ToggleButton", "Text", "Rtf", "Dummy", "Tweeny")
# Alignment: the share of an element's width and height it is moved left and up by (BaseElement::GetAlignmentOffset).
ALIGNMENT = {
    "None": (0.0, 0.0), "TopLeft": (0.0, 0.0), "TopCenter": (0.5, 0.0), "TopRight": (1.0, 0.0),
    "MiddleLeft": (0.0, 0.5), "MiddleCenter": (0.5, 0.5), "MiddleRight": (1.0, 0.5),
    "BottomLeft": (0.0, 1.0), "BottomCenter": (0.5, 1.0), "BottomRight": (1.0, 1.0),
}
# An id of a button that names no image: the button is only an area that takes touches.
TOUCH_AREA_KEYS = ("DUMMY_AREA",)
THUMBNAIL_WIDTH = 640  # a card's render; the details ask for the view's own width
CROP_MARGIN = 0.04  # a cropped render's margin around what the view draws, as a share of its larger side
CROP_ZOOM = 2.0  # how much larger than the view's own size a cropped render may be
RENDER_CACHE = 64  # rendered PNGs kept, by view, width, hidden elements and the files they draw
IMAGE_CACHE_BYTES = 256 * 1024 * 1024  # decoded, scaled images kept for the next render


def view_root(path: Path) -> Path | None:
    """The game folder of a view: the folder that holds the v folder the file is in; None when the file is not a view."""
    if path.suffix.lower() != VIEW_SUFFIX or path.name.endswith(DESCRIPTOR_SUFFIX):
        return None
    return next((parent.parent for parent in path.parents if parent.name == VIEW_FOLDER), None)


def is_view(path: Path, game_dir: Path) -> bool:
    """Whether a file is a view of the game: a .json file in its v folder that is not a *Data.json descriptor."""
    return view_root(path) is not None and path.is_relative_to(game_dir / VIEW_FOLDER)


def view_resolution(path: Path) -> tuple[int, int]:
    """The screen a view is drawn on: the resolution its folder names, such as v/1920x1080, or else 1920 × 1080."""
    for parent in path.parents:
        if parent.name == VIEW_FOLDER:
            break
        if match := RESOLUTION.fullmatch(parent.name):
            return int(match[1]), int(match[2])
    return DEFAULT_RESOLUTION


def read_view(path: Path) -> dict:
    """A view's name and elements; ValueError when the file is not a view."""
    if path.stat().st_size > MAX_VIEW_BYTES:
        raise ValueError(f"the view is larger than {MAX_VIEW_BYTES // 1024 // 1024} MB")
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as error:
        raise ValueError(f"not valid JSON: {error}") from None
    if not isinstance(data, dict) or not isinstance(data.get("elements"), list):
        raise ValueError("a view is an object with an elements list")
    elements = [element for element in data["elements"] if isinstance(element, dict)]
    return {"name": str(data.get("name") or path.stem), "elements": elements}


# The game's resources


@dataclass
class Resources:
    """The resources a game's descriptors declare, by id: images, image sequences, movies, RTFs, text styles and fonts,
    each id with every entry that declares it. Paths are absolute."""
    game_dir: Path
    images: dict[str, list[dict]] = field(default_factory=lambda: defaultdict(list))
    sequences: dict[str, list[dict]] = field(default_factory=lambda: defaultdict(list))
    movies: dict[str, list[dict]] = field(default_factory=lambda: defaultdict(list))
    rtfs: dict[str, list[dict]] = field(default_factory=lambda: defaultdict(list))
    styles: dict[str, list[dict]] = field(default_factory=lambda: defaultdict(list))
    fonts: dict[str, list[dict]] = field(default_factory=lambda: defaultdict(list))
    error: str | None = None

    def choose(self, kind: str, key: str, resolution: tuple[int, int]) -> dict | None:
        """The entry of an id for a view: the one for its resolution, else one for any resolution, without a language or
        integration first."""
        entries = getattr(self, kind).get(key) or []
        wanted = f"{resolution[0]}x{resolution[1]}"
        return min(entries, default=None, key=lambda entry: (
            entry.get("resolution") not in (wanted, None), entry.get("resolution") is None,
            entry.get("language") not in (None, "en"), entry.get("language") is not None, entry.get("integration") is not None))


_resources_cache: dict[Path, tuple[tuple, Resources]] = {}
_resources_lock = threading.Lock()


def _descriptor_files(game_dir: Path) -> list[Path]:
    return sorted(path for path in game_dir.rglob(f"*{DESCRIPTOR_SUFFIX}") if path.is_file())


def load_resources(game_dir: Path) -> Resources:
    """The resources of a game folder's descriptors, kept until a descriptor changes. A descriptor that cannot be read
    leaves the resources of the others, and its error."""
    from .rss_sync import load_documents  # rss_sync lists views, so it is imported here

    game_dir = game_dir.resolve()
    with _resources_lock:
        cached = _resources_cache.get(game_dir)
    if cached is not None:
        try:
            if cached[0] == tuple((path, path.stat().st_mtime_ns, path.stat().st_size) for path, _mtime, _size in cached[0]):
                return cached[1]
        except OSError:
            pass
    resources = Resources(game_dir)
    files = _descriptor_files(game_dir)
    try:
        documents = load_documents(game_dir, required=False)
    except (OSError, ValueError) as error:
        resources.error = str(error)
        documents = {}
    for document in documents.values():
        for kind, attribute in (("images", "images"), ("sequences", "imagesSeq"), ("movies", "movies"), ("rtfs", "rtfs"),
                                ("styles", "styles"), ("fonts", "fonts")):
            for entry in getattr(document, attribute, None) or ():
                item = _plain(entry)
                if "path" in item:
                    item["path"] = str((game_dir / item["path"]).resolve())
                for frame in item.get("frames", ()):
                    frame["path"] = str((game_dir / frame["path"]).resolve())
                getattr(resources, kind)[item["id"]].append(item)
    signature = tuple((path, path.stat().st_mtime_ns, path.stat().st_size) for path in files)
    with _resources_lock:
        _resources_cache[game_dir] = (signature, resources)
    return resources


def _plain(value: Any) -> Any:
    """A descriptor dataclass as plain data."""
    if hasattr(value, "__dataclass_fields__"):
        return {name: _plain(getattr(value, name)) for name in value.__dataclass_fields__ if getattr(value, name) is not None}
    if isinstance(value, list):
        return [_plain(item) for item in value]
    return value


# Elements


def _point(value: Any, default: tuple[float, float]) -> tuple[float, float]:
    if not isinstance(value, dict):
        return default
    try:
        return float(value.get("x", default[0])), float(value.get("y", default[1]))
    except (TypeError, ValueError):
        return default


def _size(value: Any) -> tuple[float, float] | None:
    if not isinstance(value, dict):
        return None
    try:
        return float(value.get("w", 0)), float(value.get("h", 0))
    except (TypeError, ValueError):
        return None


def _color(value: Any) -> tuple[int, int, int, int]:
    if not isinstance(value, dict):
        return 255, 255, 255, 255
    try:
        return tuple(max(0, min(255, int(value.get(channel, 255)))) for channel in "rgba")  # type: ignore[return-value]
    except (TypeError, ValueError):
        return 255, 255, 255, 255


def _rectangle(value: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(value, dict):
        return None
    try:
        return float(value.get("x", 0)), float(value.get("y", 0)), float(value.get("w", 0)), float(value.get("h", 0))
    except (TypeError, ValueError):
        return None


def element_keys(element: dict) -> list[str]:
    """The resource ids an element names: rssKeys, or rssKey."""
    keys = element.get("rssKeys")
    if isinstance(keys, list) and keys:
        return [str(key) for key in keys]
    return [str(element["rssKey"])] if element.get("rssKey") else []


def image_size(path: Path) -> tuple[int, int]:
    """An image file's width and height, from its header when it has one."""
    with path.open("rb") as handle:
        header = handle.read(148)
    if header[:4] == b"DDS ":
        info = read_dds_info(header)
        return info["width"], info["height"]
    if header.startswith(b"\x89PNG\r\n\x1a\n") and len(header) >= 24:
        return struct.unpack_from(">II", header, 16)
    rgba = decode_image(path)
    return rgba.shape[1], rgba.shape[0]


@dataclass
class Drawing:
    """What an element draws: an image file and the part of it, or nothing and why."""
    file: Path | None = None
    source: tuple[int, int, int, int] | None = None
    size: tuple[float, float] = (0.0, 0.0)
    reason: str | None = None
    detail: dict = field(default_factory=dict)


def resolve(element: dict, resources: Resources, resolution: tuple[int, int]) -> Drawing:
    """What an element draws, with its size, or why it draws nothing."""
    from .rss_sync import expand_path  # rss_sync lists views, so it is imported here

    kind = element.get("type")
    keys = element_keys(element)
    if kind in IMAGE_TYPES:
        if kind != "Image" and all(key in TOUCH_AREA_KEYS for key in keys):
            return Drawing(detail={"touchOnly": True})
        if not keys:
            return Drawing(detail={"runtime": True})
        entry = resources.choose("images", keys[0], resolution)
        if entry is None:
            return Drawing(reason=f"no image has the id {keys[0]}")
        return _image(Path(entry["path"]), entry.get("source"))
    if kind == "Anim":
        if not keys:
            return Drawing(detail={"runtime": True})
        sequence = resources.choose("sequences", keys[0], resolution)
        if sequence is not None:
            if not sequence.get("frames"):
                return Drawing(reason=f"the image sequence {keys[0]} has no frames")
            # A frame can be a {N-M} range of files.
            frames = [(path, frame.get("source")) for frame in sequence["frames"] for path in expand_path(frame["path"])]
            drawing = _image(Path(frames[0][0]), frames[0][1])
            # The element's loopCount, when it has one, replaces the sequence's (AnimElement::SetElementData).
            loops = element.get("loopCount")
            loops = loops if isinstance(loops, int) and not isinstance(loops, bool) else sequence.get("loopCount")
            drawing.detail = {"frames": len(frames), "frameTime": sequence.get("frameTime"), "loopCount": loops, "loopTo": sequence.get("loopTo"),
                              "sequence": [{"file": str(path), **({"source": [int(source[key]) for key in ("x", "y", "w", "h")]} if source else {})}
                                           for path, source in frames]}
            return drawing
        if resources.choose("movies", keys[0], resolution) is not None:
            return Drawing(reason="a movie, which is not drawn", detail={"movie": True})
        return Drawing(reason=f"no image sequence or movie has the id {keys[0]}")
    if kind == "Text":
        fit = _size(element.get("fitBox"))
        style = resources.choose("styles", str(element.get("rssStyleId") or ""), resolution)
        height = float(style["size"]) if style else 0.0
        detail = {"style": element.get("rssStyleId")} if element.get("rssStyleId") else {}
        if element.get("rssStyleId") and style is None:
            return Drawing(size=fit or (0.0, height), reason=f"no text style has the id {element['rssStyleId']}", detail=detail)
        if style is None:
            return Drawing(size=fit or (0.0, height), detail=detail)
        font_id = str(style.get("font_id") or "")
        font = resources.choose("fonts", font_id, resolution)
        detail = {**detail, "fontSize": style["size"], **({"font": font["path"], "fontId": font_id} if font else {})}
        return Drawing(size=fit or (0.0, height), reason=font_problem(font, font_id), detail=detail)
    if kind == "Rtf":
        rtf = resources.choose("rtfs", keys[0], resolution) if keys else None
        if rtf is None:
            return Drawing(reason=f"no RTF has the id {keys[0]}" if keys else "names no RTF")
        facts = describe_rtf(rtf["path"]).get("rtf")
        page = next((page for page in (facts or {}).get("pages", []) if page.get("found")), None)
        if page is None:
            return Drawing(size=(0.0, 0.0), reason="the RTF has no page with a background")
        drawing = _image(Path(page["background"]), None)
        drawing.detail = {"page": page["id"]}
        return drawing
    return Drawing()


def _image(path: Path, source: dict | None) -> Drawing:
    if not path.is_file():
        return Drawing(file=path, reason="the image file does not exist")
    if source:
        rect = (int(source["x"]), int(source["y"]), int(source["w"]), int(source["h"]))
        return Drawing(file=path, source=rect, size=(float(rect[2]), float(rect[3])))
    try:
        width, height = image_size(path)
    except (OSError, ValueError, cv2.error) as error:
        return Drawing(file=path, reason=f"the image cannot be read: {error}")
    return Drawing(file=path, size=(float(width), float(height)))


def transform(element: dict, size: tuple[float, float]) -> np.ndarray:
    """The 2 × 3 matrix that places an element's pixels on the screen, as BaseElement::GetTransform does: move it by its
    alignment and pivot, scale and rotate it, then move it to its position plus its pivot."""
    position = _point(element.get("position"), (0.0, 0.0))
    pivot = _point(element.get("pivot"), (0.0, 0.0))
    scale = _point(element.get("scale"), (1.0, 1.0))
    share = ALIGNMENT.get(str(element.get("alignment") or "None"), (0.0, 0.0))
    try:
        rotation = math.radians(float(element.get("rotation") or 0.0))
    except (TypeError, ValueError):
        rotation = 0.0
    cos, sin = math.cos(rotation), math.sin(rotation)
    linear = np.array([[cos, -sin], [sin, cos]]) @ np.diag(scale)
    offset = np.array([-share[0] * size[0] - pivot[0], -share[1] * size[1] - pivot[1]])
    translation = linear @ offset + np.array([position[0] + pivot[0], position[1] + pivot[1]])
    return np.hstack([linear, translation[:, None]])


def animated(element: dict) -> bool:
    """Whether a laid out element plays: an Anim that draws an image sequence of more than one frame."""
    return element["type"] == "Anim" and element["drawn"] and element.get("frames", 0) > 1


def placement(element: dict, size: tuple[float, float]) -> dict:
    """An element's matrix for a frame of the given size, as SVG's matrix(a b c d e f), and its alignment: the share of a
    frame's size it is moved by, so a frame of another size is placed by moving it by that share of the difference."""
    matrix = transform(element, size)
    share = ALIGNMENT.get(str(element.get("alignment") or "None"), (0.0, 0.0))
    return {"matrix": [round(float(value), 6) for value in (matrix[0, 0], matrix[1, 0], matrix[0, 1], matrix[1, 1], matrix[0, 2], matrix[1, 2])],
            "alignment": [share[0], share[1]]}


def corners(matrix: np.ndarray, size: tuple[float, float]) -> list[list[float]]:
    points = np.array([[0, 0], [size[0], 0], [size[0], size[1]], [0, size[1]]], float)
    return [[round(float(x), 2), round(float(y), 2)] for x, y in points @ matrix[:, :2].T + matrix[:, 2]]


# Facts and layout


def _resources_for(path: Path, game_dir: Path | None) -> Resources:
    return load_resources(game_dir or view_root(path) or path.parent)


def _text_parts(element: dict, resources: Resources, resolution: tuple[int, int], sample: str) -> tuple[np.ndarray, tuple[float, float], np.ndarray, dict] | None:
    """A Text element's sample text drawn in its style's font, as straight RGBA, its size, its 3 × 3 matrix with the fit
    box's shrink, and its font entry; None when there is no font, or it draws none of the text."""
    style = resources.choose("styles", str(element.get("rssStyleId") or ""), resolution)
    font = resources.choose("fonts", str(style.get("font_id") or ""), resolution) if style else None
    if font is None or not sample:
        return None
    drawn = text_image(font, float(style["size"]), sample_for(font, sample), str(element.get("orientation") or "") == "Vertical")
    if drawn is None:
        return None
    image, size = drawn
    share = ALIGNMENT.get(str(element.get("alignment") or "None"), (0.0, 0.0))
    matrix = np.vstack([transform(element, size), [0, 0, 1]]) @ shrink_matrix(size, _size(element.get("fitBox")), share)
    return image, size, matrix, font


def _text(element: dict, resources: Resources, resolution: tuple[int, int], drawing: Drawing, sample: str) -> dict | None:
    """A Text element's sample text as it is drawn: its size, its matrix with the fit box's shrink (SVG's matrix(a b c d
    e f)), the corners it covers, and its font; None when its font cannot draw any of it."""
    if not sample or drawing.reason or "font" not in drawing.detail:
        return None
    try:
        parts = _text_parts(element, resources, resolution, sample)
    except (OSError, ValueError, ImportError) as error:
        drawing.reason = f"the font cannot be read: {error}"
        return None
    if parts is None:
        return None
    _image, size, matrix, font = parts
    vertical = str(element.get("orientation") or "") == "Vertical"
    return {"sample": sample_for(font, sample), "width": size[0], "height": size[1], "font": font["path"], "vertical": vertical,
            "matrix": [round(float(value), 6) for value in (matrix[0, 0], matrix[1, 0], matrix[0, 1], matrix[1, 1], matrix[0, 2], matrix[1, 2])],
            "corners": corners(matrix[:2], size)}


def view_layout(path: Path, game_dir: Path | None = None, roots: tuple[Path, ...] = (), text: str | None = None) -> dict:
    """A view's name, resolution and every element: its id, type, resource ids, whether it is hidden or drawn, what it
    draws, the corners of the area it covers, and why it draws nothing. With roots, only images and fonts inside them are
    drawn. With a sample text, each Text element whose style's font can draw it has it as its text."""
    view = read_view(path)
    resources = _resources_for(path, game_dir)
    resolution = view_resolution(path)
    elements = []
    for index, element in enumerate(view["elements"]):
        kind = str(element.get("type") or "None")
        drawing = resolve(element, resources, resolution)
        if drawing.file and drawing.reason is None and roots and not any(drawing.file.is_relative_to(root) for root in roots):
            drawing.reason = "the image is outside the workspace folders"
        font = drawing.detail.get("font")
        if font and drawing.reason is None and roots and not any(Path(font).is_relative_to(root) for root in roots):
            drawing.reason = "the font is outside the workspace folders"
        written = _text(element, resources, resolution, drawing, text) if kind == "Text" and text else None
        matrix = transform(element, drawing.size)
        position = _point(element.get("position"), (0.0, 0.0))
        area = element.get("touchArea") if kind in ("Button", "ToggleButton", "Dummy") else None
        touch = _rectangle(area)
        elements.append({
            "index": index, "id": str(element.get("id") or ""), "type": kind, "keys": element_keys(element),
            "hidden": bool(element.get("hidden")) or kind == "Dummy",
            "drawn": drawing.file is not None and drawing.reason is None,
            "position": [position[0], position[1]], "size": [drawing.size[0], drawing.size[1]],
            "corners": corners(matrix, drawing.size),
            **({"file": str(drawing.file)} if drawing.file else {}), **({"source": list(drawing.source)} if drawing.source else {}),
            **({"reason": drawing.reason} if drawing.reason else {}), **drawing.detail,
            **({"alpha": _color(element.get("color"))[3], "color": list(_color(element.get("color")))} if "color" in element else {}),
            "placement": placement(element, drawing.size),
            **({"text": written} if written else {}),
            **({"touchArea": corners(matrix @ np.vstack([np.hstack([np.eye(2), [[touch[0]], [touch[1]]]]), [0, 0, 1]]), touch[2:])}
               if touch else {}),
        })
    # The file's contents, which an edit of the positions must start from.
    revision = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    return {"name": view["name"], "resolution": {"width": resolution[0], "height": resolution[1]}, "elements": elements,
            "revision": revision, **({"resourcesError": resources.error} if resources.error else {})}


def describe_view(path: Path, game_dir: Path | None = None) -> dict:
    """A view's facts for a report: its name, resolution, how many elements of each type it has and how many are
    hidden, how many images it draws, and the elements whose resources cannot be found or drawn. A file that is not a
    view has only viewError."""
    try:
        layout = view_layout(path, game_dir)
    except (OSError, ValueError, RecursionError) as error:
        return {"viewError": str(error) or type(error).__name__}
    elements = layout["elements"]
    types: dict[str, int] = defaultdict(int)
    for element in elements:
        types[element["type"]] += 1
    # A movie is not drawn here, but is not missing either.
    missing = [{key: element[key] for key in ("id", "type", "keys", "reason") if key in element}
               for element in elements if element.get("reason") and not element.get("movie")]
    return {"view": {
        "name": layout["name"], "resolution": layout["resolution"], "elements": len(elements), "types": dict(sorted(types.items())),
        "hidden": sum(1 for element in elements if element["hidden"]), "images": sum(1 for element in elements if element["drawn"]),
        "missing": missing[:MISSING_LIMIT], "missingCount": len(missing),
        **({"resourcesError": layout["resourcesError"]} if "resourcesError" in layout else {}),
    }}


# Rendering


_images: OrderedDict[tuple, np.ndarray] = OrderedDict()
_images_bytes = 0
_renders: OrderedDict[tuple, bytes] = OrderedDict()
_render_lock = threading.Lock()


def _scaled_image(file: Path, source: tuple[int, int, int, int] | None, scale: float) -> np.ndarray:
    """An element's image as premultiplied float32 RGBA, cut to its source rectangle and scaled; kept for later renders."""
    global _images_bytes
    info = file.stat()
    key = (str(file), info.st_mtime_ns, info.st_size, source, round(scale, 6))
    with _render_lock:
        if key in _images:
            _images.move_to_end(key)
            return _images[key]
    rgba = decode_image(file)
    if source:
        x, y, w, h = source
        rgba = rgba[max(0, y):max(0, y + h), max(0, x):max(0, x + w)]
    if scale != 1.0 and rgba.size:
        width, height = max(1, round(rgba.shape[1] * scale)), max(1, round(rgba.shape[0] * scale))
        rgba = cv2.resize(rgba, (width, height), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
    image = rgba.astype(np.float32) / 255.0
    image[..., :3] *= image[..., 3:4]
    with _render_lock:
        _images[key] = image
        _images_bytes += image.nbytes
        while _images_bytes > IMAGE_CACHE_BYTES and len(_images) > 1:
            _key, old = _images.popitem(last=False)
            _images_bytes -= old.nbytes
    return image


def render_text(path: Path, index: int, text: str, game_dir: Path | None = None, roots: tuple[Path, ...] = ()) -> tuple[bytes, dict]:
    """A Text element's sample text as a PNG image at its own size, as the page draws a moved one, and its layout."""
    layout = view_layout(path, game_dir, roots, text)
    element = next((item for item in layout["elements"] if item["index"] == index), None)
    if element is None or "text" not in element:
        raise ValueError("the element draws no text")
    parts = _text_parts(read_view(path)["elements"][index], _resources_for(path, game_dir),
                        (layout["resolution"]["width"], layout["resolution"]["height"]), text)
    if parts is None:
        raise ValueError("the element draws no text")
    ok, encoded = cv2.imencode(".png", cv2.cvtColor(parts[0], cv2.COLOR_RGBA2BGRA))
    if not ok:
        raise ValueError("the text cannot be encoded as PNG")
    return encoded.tobytes(), element["text"]


def _premultiplied(rgba: np.ndarray, scale: float) -> np.ndarray:
    """A straight RGBA image scaled, as premultiplied float32."""
    if scale != 1.0 and rgba.size:
        size = (max(1, round(rgba.shape[1] * scale)), max(1, round(rgba.shape[0] * scale)))
        rgba = cv2.resize(rgba, size, interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
    image = rgba.astype(np.float32) / 255.0
    image[..., :3] *= image[..., 3:4]
    return image


def render_view(path: Path, width: int | None = None, hidden: bool = False, game_dir: Path | None = None,
                roots: tuple[Path, ...] = (), crop: bool = False, segment: int | None = None,
                cuts: tuple[int, ...] | None = None, text: str | None = None) -> bytes:
    """The view composed as a PNG image with a transparent background, as wide as width (at most the view's own width):
    every element that draws an image, in order, hidden ones too on request, an Anim with its first frame. Cropped, it
    shows only the part of the screen that the view draws on, with a margin, so a small view fills a card. A segment
    draws only the elements between two that the page draws itself (cuts, by element index; by default the Anims that
    play): segment 0 the ones before the first, segment n the ones after the nth, so that each can be drawn between them.
    With a sample text, each Text element draws it in its style's font. Renders are kept until the view, an image or a font
    it draws changes."""
    layout = view_layout(path, game_dir, roots, text)
    resolution = layout["resolution"]
    elements = [element for element in layout["elements"]
                if (element["drawn"] or "text" in element) and (hidden or not element["hidden"]) and element["type"] != "Dummy"]
    shown = elements
    if segment is not None:
        split = [position for position, element in enumerate(elements)
                 if (element["index"] in cuts if cuts is not None else animated(element))]
        if segment > len(split):
            raise ValueError(f"the view has {len(split) + 1} segments")
        shown = elements[split[segment - 1] + 1 if segment else 0:split[segment] if segment < len(split) else len(elements)]
    # The part of the screen drawn: all of it, or what the elements cover, with a margin.
    left, top, right, bottom = 0.0, 0.0, float(resolution["width"]), float(resolution["height"])
    if crop and elements:
        points = np.array([point for element in elements for point in (element["text"]["corners"] if "text" in element else element["corners"])])
        margin = CROP_MARGIN * max(np.ptp(points[:, 0]), np.ptp(points[:, 1]))
        left, top = max(left, points[:, 0].min() - margin), max(top, points[:, 1].min() - margin)
        right, bottom = min(right, points[:, 0].max() + margin), min(bottom, points[:, 1].max() + margin)
        if right <= left or bottom <= top:
            left, top, right, bottom = 0.0, 0.0, float(resolution["width"]), float(resolution["height"])
    # A cropped render may be drawn up to twice as large, so a small view stays sharp in a card.
    scale = min(CROP_ZOOM if crop else 1.0, (width or resolution["width"]) / (right - left))
    view = path.stat()
    signature = (str(path), view.st_mtime_ns, view.st_size, round(scale, 6), hidden, (left, top, right, bottom), segment, cuts, text,
                 tuple((file, os.stat(file).st_mtime_ns) for element in shown for file in [element["text"]["font"] if "text" in element else element["file"]]))
    with _render_lock:
        if signature in _renders:
            _renders.move_to_end(signature)
            return _renders[signature]
    canvas_width, canvas_height = max(1, round((right - left) * scale)), max(1, round((bottom - top) * scale))
    canvas = np.zeros((canvas_height, canvas_width, 4), np.float32)
    source_elements = read_view(path)["elements"]
    resources = _resources_for(path, game_dir)
    for element in shown:
        data = source_elements[element["index"]]
        try:
            if "text" in element:
                # A text is drawn at its own size, then shrunk into its fit box by its matrix.
                parts = _text_parts(data, resources, (resolution["width"], resolution["height"]), text or "")
                if parts is None:
                    continue
                image = _premultiplied(parts[0], scale)
            else:
                image = _scaled_image(Path(element["file"]), tuple(element["source"]) if "source" in element else None, scale)
        except (OSError, ValueError, ImportError, cv2.error):
            continue
        if not image.size:
            continue
        red, green, blue, alpha = _color(data.get("color"))
        if (red, green, blue, alpha) != (255, 255, 255, 255):
            image = image * np.array([red / 255, green / 255, blue / 255, 1.0], np.float32) * (alpha / 255)
        # The element's matrix in the scaled image's pixels and on the scaled screen.
        if "text" in element:
            size = (element["text"]["width"], element["text"]["height"])
            a, b, c, d, e, f = element["text"]["matrix"]
            matrix = np.array([[a, c, e], [b, d, f]])
        else:
            size = (element["size"][0], element["size"][1])
            matrix = transform(data, size)
        to_image = np.diag([image.shape[1] / size[0] if size[0] else 1.0, image.shape[0] / size[1] if size[1] else 1.0])
        linear = scale * matrix[:, :2] @ np.linalg.inv(to_image)
        translation = scale * (matrix[:, 2] - [left, top])
        box = np.array(corners(np.hstack([linear, translation[:, None]]), (image.shape[1], image.shape[0])))
        x0, y0 = max(0, math.floor(box[:, 0].min())), max(0, math.floor(box[:, 1].min()))
        x1, y1 = min(canvas_width, math.ceil(box[:, 0].max())), min(canvas_height, math.ceil(box[:, 1].max()))
        if x1 <= x0 or y1 <= y0:
            continue
        placed = np.hstack([linear, (translation - [x0, y0])[:, None]])
        layer = cv2.warpAffine(image, placed, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
        area = canvas[y0:y1, x0:x1]
        area[:] = layer + area * (1.0 - layer[..., 3:4])
    alpha = canvas[..., 3:4]
    rgb = np.divide(canvas[..., :3], alpha, out=np.zeros_like(canvas[..., :3]), where=alpha > 1e-6)
    pixels = np.clip(np.dstack([rgb, alpha]) * 255 + 0.5, 0, 255).astype(np.uint8)
    ok, encoded = cv2.imencode(".png", cv2.cvtColor(pixels, cv2.COLOR_RGBA2BGRA), [cv2.IMWRITE_PNG_COMPRESSION, 3])
    if not ok:
        raise ValueError("the view cannot be encoded as PNG")
    data = encoded.tobytes()
    with _render_lock:
        _renders[signature] = data
        while len(_renders) > RENDER_CACHE:
            _renders.popitem(last=False)
    return data
