"""The view-layout skill's helper: lays a game's views (v/<resolution>/*View.json, their ElementsList) out by a preview,
a picture of how the screen should look, such as a designer's PNG in the GDA's DESIGN/09.Preview.

It reads, places and draws the views as the app's Asset library does (egt_gda_sync.assets.views), and writes nothing
but the positions of a view's elements, as the library's Save does (rss_edit.set_view_positions).

  elements VIEW...              every element: index, id, type, position, alignment, scale, size, box, what it draws
  draw OUT VIEW...              the views drawn together (the first at the bottom), over the preview with --over,
                                with every element outlined and numbered with --outline, a part of the screen with --crop
  locate PREVIEW VIEW...        where each element's image is in the preview, and the position that puts it there
  move VIEW REF=X,Y...          writes positions; REF is an element's id, or #index

Run it with the app's Python, from the repository: .venv/bin/python -I .claude/skills/view-layout/view_layout.py ...

The preview is laid on the screen of the views' resolution. A preview of the views' aspect ratio covers the screen;
another is laid at --origin X,Y (the screen point its top-left shows; 0,0 by default) at --scale S (preview pixels per
screen pixel; 1 by default). --part X,Y,W,H takes a part of the preview first, such as one screen of a picture of two.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import math
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from egt_gda_sync.assets.view_text import DEFAULT_SAMPLE
from egt_gda_sync.assets.views import _color, _point, _scaled_image, read_view, render_view, transform, view_layout, view_resolution, view_root
from egt_gda_sync.images.image_compare import decode_image
from egt_gda_sync.sync.rss_edit import number_text, set_view_positions

GOOD = 0.9  # a match at least this good is the element's image
GOOD_SMALLER = 0.85  # in a preview smaller than the screen, whose pixels mix the image's
AMBIGUOUS = 0.005  # a second place this close to the best is as good a match
SEPARATION = 8  # pixels: the second place is at least this far from the best
OPAQUE = 0.95  # the alpha of the pixels an element's image is matched by
MIN_PIXELS = 64  # an image with fewer pixels than this to match by is not matched
BACKGROUND = 48.0  # the gray of the screen where the preview does not cover it
FLAT = 8.0  # an image whose pixels' colors vary less than this (standard deviation, 0..255) is one flat color
COLORS = [(255, 64, 64), (64, 200, 255), (255, 200, 0), (120, 255, 120), (255, 120, 255), (255, 255, 255)]


def patterns(text: str | None) -> list[str]:
    return [pattern for pattern in (text or "").split(",") if pattern]


def fail(message: str) -> None:
    print(f"view_layout: {message}", file=sys.stderr)
    sys.exit(2)


def numbers(text: str, count: int, name: str) -> list[float]:
    try:
        values = [float(value) for value in text.split(",")]
    except ValueError:
        values = []
    if len(values) != count:
        fail(f"{name} takes {count} numbers separated by commas, such as {','.join(['0'] * count)}")
    return values


def views(paths: list[str]) -> tuple[list[Path], tuple[int, int]]:
    """The view files, which must be views (in a game's v folder, not a *Data.json descriptor) of one resolution."""
    files = [Path(path).resolve() for path in paths]
    for file in files:
        if not file.is_file():
            fail(f"{file} does not exist")
        if view_root(file) is None:
            fail(f"{file} is not a view: a view is a .json file in a game's v folder, not a *Data.json descriptor")
    resolutions = {view_resolution(file) for file in files}
    if len(resolutions) > 1:
        fail(f"the views are of different resolutions: {sorted(resolutions)}")
    return files, resolutions.pop()


# The preview on the screen


@dataclass
class Preview:
    rgb: np.ndarray  # the screen, float32 RGB 0..255, the preview where it covers it
    rect: tuple[int, int, int, int]  # the part of the screen the preview covers: left, top, right, bottom
    scale: float  # preview pixels per screen pixel
    origin: tuple[float, float]  # the screen point the preview's top-left shows
    native: np.ndarray  # the preview (its part) at its own size, float32 RGB, which a smaller one is matched in


def load_preview(path: str, resolution: tuple[int, int], part: str | None, origin: str | None, scale: str | None,
                 files: list[Path], skip: list[str]) -> Preview:
    try:
        image = decode_image(Path(path))
    except (OSError, ValueError) as error:
        fail(f"the preview cannot be read: {error}")
    if part:
        x, y, w, h = (int(value) for value in numbers(part, 4, "--part"))
        image = image[max(0, y):max(0, y + h), max(0, x):max(0, x + w)]
        if not image.size:
            fail("--part is outside the preview")
    height, width = image.shape[:2]
    screen_width, screen_height = resolution
    if scale:
        factor = numbers(scale, 1, "--scale")[0]
    elif abs(width / height - screen_width / screen_height) < 0.01:
        factor = width / screen_width
    else:
        factor = 1.0
    if factor <= 0:
        fail("--scale is more than 0")
    # A transparent preview is seen over the gray the screen is outside it.
    straight = image.astype(np.float32)
    alpha = straight[..., 3:4] / 255.0
    native = straight[..., :3] * alpha + BACKGROUND * (1 - alpha)
    if factor != 1.0:
        size = (max(1, round(width / factor)), max(1, round(height / factor)))
        native_on_screen = cv2.resize(native, size, interpolation=cv2.INTER_AREA if factor > 1 else cv2.INTER_LINEAR)
    else:
        native_on_screen = native
    if origin == "auto":
        ox, oy = find_origin(native_on_screen, files, resolution, skip)
    else:
        ox, oy = numbers(origin, 2, "--origin") if origin else (0.0, 0.0)
    left, top = round(ox), round(oy)
    rgb = np.full((screen_height, screen_width, 3), BACKGROUND, np.float32)
    x0, y0 = max(0, left), max(0, top)
    x1, y1 = min(screen_width, left + native_on_screen.shape[1]), min(screen_height, top + native_on_screen.shape[0])
    if x1 <= x0 or y1 <= y0:
        fail("the preview does not cover the screen: check --origin and --scale")
    rgb[y0:y1, x0:x1] = native_on_screen[y0 - top:y1 - top, x0 - left:x1 - left]
    return Preview(rgb, (x0, y0, x1, y1), factor, (ox, oy), native)


def skipped(element_id: str, skip: list[str]) -> bool:
    """Whether an element is left out: its id matches one of the patterns, such as *_tetra."""
    return any(fnmatch.fnmatchcase(element_id, pattern) for pattern in skip)


def rendered(file: Path, hidden: bool, text: str, skip: list[str]) -> list[bytes]:
    """A view drawn as the app draws it, as PNG images to lay one over another: the whole view, or without the elements
    left out, the segments of the view between them."""
    cuts = tuple(index for index, element in enumerate(read_view(file)["elements"]) if skipped(str(element.get("id") or ""), skip))
    if not cuts:
        return [render_view(file, None, hidden, text=text)]
    segments = []
    while True:
        try:
            segments.append(render_view(file, None, hidden, segment=len(segments), cuts=cuts, text=text))
        except ValueError:
            return segments


def composed(files: list[Path], resolution: tuple[int, int], skip: list[str]) -> np.ndarray:
    """The views drawn together on the gray screen, without their texts, as float32 RGB."""
    screen = np.full((resolution[1], resolution[0], 3), BACKGROUND, np.float32)
    for file in files:
        for png in rendered(file, False, "", skip):
            blend(screen, png, 1.0)
    return screen


def find_origin(preview: np.ndarray, files: list[Path], resolution: tuple[int, int], skip: list[str]) -> tuple[float, float]:
    """Where on the screen a preview of a part of it is: where it looks most like the views drawn together."""
    if preview.shape[0] > resolution[1] or preview.shape[1] > resolution[0]:
        fail("--origin auto finds a preview smaller than the screen: give --origin, or --part to take a part of it")
    if preview.shape[:2] == (resolution[1], resolution[0]):
        return 0.0, 0.0
    result = cv2.matchTemplate(composed(files, resolution, skip), np.ascontiguousarray(preview), cv2.TM_CCOEFF_NORMED)
    _low, score, _where, (x, y) = cv2.minMaxLoc(result)
    print(f"--origin auto: the preview is at {x},{y} on the screen (it looks {score:.3f} like the views there)"
          + ("; that is not much: check it with draw --over" if score < 0.8 else ""), file=sys.stderr)
    return float(x), float(y)


# Elements


def placed(data: dict, item: dict, factor: float = 1.0) -> tuple[np.ndarray, int, int] | None:
    """An element's image as the screen shows it, as straight float32 RGBA cut to the box it covers, and the box's
    top-left; scaled by factor more than the element's own scale. None when it draws no image."""
    if not item["drawn"] or "file" not in item:
        return None
    image = _scaled_image(Path(item["file"]), tuple(item["source"]) if "source" in item else None, 1.0)
    if not image.size:
        return None
    red, green, blue, alpha = _color(data.get("color"))
    if (red, green, blue, alpha) != (255, 255, 255, 255):
        image = image * np.array([red / 255, green / 255, blue / 255, 1.0], np.float32) * (alpha / 255)
    size = (item["size"][0], item["size"][1])
    if factor != 1.0:
        sx, sy = _point(data.get("scale"), (1.0, 1.0))
        data = {**data, "scale": {"x": sx * factor, "y": sy * factor}}
    matrix = transform(data, size)
    to_image = np.diag([image.shape[1] / size[0] if size[0] else 1.0, image.shape[0] / size[1] if size[1] else 1.0])
    linear = matrix[:, :2] @ np.linalg.inv(to_image)
    points = np.array([[0, 0], [image.shape[1], 0], [image.shape[1], image.shape[0]], [0, image.shape[0]]], float) @ linear.T + matrix[:, 2]
    x0, y0 = math.floor(points[:, 0].min()), math.floor(points[:, 1].min())
    x1, y1 = math.ceil(points[:, 0].max()), math.ceil(points[:, 1].max())
    if x1 <= x0 or y1 <= y0:
        return None
    layer = cv2.warpAffine(image, np.hstack([linear, (matrix[:, 2] - [x0, y0])[:, None]]), (x1 - x0, y1 - y0),
                           flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    straight = layer.copy()
    straight[..., :3] = np.divide(layer[..., :3], layer[..., 3:4], out=np.zeros_like(layer[..., :3]), where=layer[..., 3:4] > 1e-6)
    return straight, x0, y0


@dataclass
class Match:
    score: float  # 1 for the same pixels, less by their root mean square difference over 255
    dx: int  # how far the element moves to where it matches, in screen pixels
    dy: int
    here: float | None  # the score where the element is now, when that is on the preview
    other: tuple[float, int, int] | None  # a place as good, at least SEPARATION pixels from that one: its score and move


def match(preview: Preview, template: np.ndarray, x0: int, y0: int, search: int) -> Match | str:
    """Where an element's image, its box's top-left at x0, y0 on the screen, is in the preview, within search screen
    pixels of there (anywhere when search is 0). A preview smaller than the screen is matched at its own size, the image
    made as small. Only the part of the image on the preview where the element is now is matched, or with search 0, the
    whole image when none of it is."""
    factor = min(1.0, preview.scale)
    if factor < 1.0:
        image = preview.native
        left, top, right, bottom = 0, 0, image.shape[1], image.shape[0]
        # Made smaller premultiplied, so that its edges do not take the color of its transparent pixels.
        size = (max(1, round(template.shape[1] * factor)), max(1, round(template.shape[0] * factor)))
        small = cv2.resize(np.dstack([template[..., :3] * template[..., 3:4], template[..., 3:4]]), size, interpolation=cv2.INTER_AREA)
        rgb = np.divide(small[..., :3], small[..., 3:4], out=np.zeros_like(small[..., :3]), where=small[..., 3:4] > 1e-6)
        template = np.dstack([rgb, small[..., 3:4]])
        exact = ((x0 - preview.origin[0]) * factor, (y0 - preview.origin[1]) * factor)
    else:
        image = preview.rgb
        left, top, right, bottom = preview.rect
        exact = (float(x0), float(y0))
    x, y = round(exact[0]), round(exact[1])
    cx0, cy0 = max(x, left), max(y, top)
    cx1, cy1 = min(x + template.shape[1], right), min(y + template.shape[0], bottom)
    if cx1 <= cx0 or cy1 <= cy0:
        if search:
            return "outside the preview (--search 0 looks for it anywhere in it)"
        if template.shape[1] > right - left or template.shape[0] > bottom - top:
            return "outside the preview, and larger than it"
        cx0, cy0 = x, y
    else:
        template = template[cy0 - y:cy1 - y, cx0 - x:cx1 - x]
    height, width = template.shape[:2]
    mask = template[..., 3] >= OPAQUE
    if mask.sum() < MIN_PIXELS:
        mask = template[..., 3] >= 0.5
    if mask.sum() < MIN_PIXELS:
        return "too transparent to match"
    if search or not (left <= cx0 and top <= cy0):
        reach = max(1, round(search * factor)) if search else max(image.shape)
        left, top = max(left, cx0 - reach), max(top, cy0 - reach)
        right, bottom = min(right, cx0 + width + reach), min(bottom, cy0 + height + reach)
    window = np.ascontiguousarray(image[top:bottom, left:right])
    weights = np.repeat(mask[..., None], 3, axis=2).astype(np.float32)
    result = cv2.matchTemplate(window, np.ascontiguousarray(template[..., :3] * 255.0), cv2.TM_SQDIFF, mask=weights)
    scores = 1.0 - np.sqrt(np.maximum(np.nan_to_num(result, nan=np.inf, posinf=np.inf), 0) / (mask.sum() * 3)) / 255.0
    best = float(scores.max())
    hx, hy = cx0 - left, cy0 - top

    def moved(px: int, py: int) -> tuple[int, int]:
        # The move in screen pixels, from where the element is exactly (a smaller preview's pixel is not the screen's).
        return round((px - hx - (exact[0] - x)) / factor), round((py - hy - (exact[1] - y)) / factor)

    # Of the places as good as the best, the one nearest to the element: one with a twin of the same image stays.
    ys, xs = np.nonzero(scores >= best - AMBIGUOUS)
    nearest = int(np.argmin((xs - hx) ** 2 + (ys - hy) ** 2))
    bx, by = int(xs[nearest]), int(ys[nearest])
    others = scores.copy()
    others[max(0, by - SEPARATION):by + SEPARATION + 1, max(0, bx - SEPARATION):bx + SEPARATION + 1] = -np.inf
    oy, ox = np.unravel_index(int(np.argmax(others)), others.shape)
    other = (float(others[oy, ox]), *moved(int(ox), int(oy))) if np.isfinite(others[oy, ox]) and others[oy, ox] >= best - AMBIGUOUS else None
    here = float(scores[hy, hx]) if 0 <= hy < scores.shape[0] and 0 <= hx < scores.shape[1] else None
    return Match(float(scores[by, bx]), *moved(bx, by), here, other)


def locate(args: argparse.Namespace) -> None:
    files, resolution = views(args.views)
    skip = patterns(args.skip)
    preview = load_preview(args.preview, resolution, args.part, args.origin, args.scale, files, skip)
    factors = [1.0] + [factor for factor in (numbers(args.scales, len(args.scales.split(",")), "--scales") if args.scales else []) if factor != 1.0]
    only = {name for name in (args.only or "").split(",") if name}
    good = GOOD_SMALLER if preview.scale < 1 else GOOD
    report = {"preview": {"file": str(Path(args.preview).resolve()), "rect": list(preview.rect), "scale": preview.scale,
                          "origin": list(preview.origin)}, "views": []}
    layouts = {file: (view_layout(file), read_view(file)["elements"]) for file in files}
    # Where each element's image is, now and where it is found: a match can be where another element draws the same image.
    boxes: dict[tuple[Path, int], tuple] = {}
    found_at: dict[tuple[Path, int], tuple[int, int]] = {}

    def twin(file: Path, index: int, dx: int, dy: int) -> str | None:
        """The element, other than this one, that draws the same image where this one's moves to, now or where it is found."""
        mine = boxes[(file, index)]
        for (view, other), box in boxes.items():
            if (view, other) == (file, index) or box[:3] != mine[:3]:
                continue
            for mx, my in {(0, 0), found_at.get((view, other), (0, 0))}:
                if abs(box[3] + mx - mine[3] - dx) <= 1 and abs(box[4] + my - mine[4] - dy) <= 1:
                    name = layouts[view][0]["elements"][other]["id"]
                    return (name if view == file else f"{layouts[view][0]['name']}:{name}") + (" is found" if (mx, my) != (0, 0) else " is")
        return None

    results: dict[tuple[Path, int], tuple[Match, float] | str] = {}
    flat: set[tuple[Path, int]] = set()
    for file, (layout, data) in layouts.items():
        for item in layout["elements"]:
            if item["type"] == "Dummy" or skipped(item["id"], skip) or (drawn := placed(data[item["index"]], item)) is None:
                continue
            boxes[(file, item["index"])] = (item.get("file"), tuple(item.get("source", ())), drawn[0].shape[:2], drawn[1], drawn[2])
            if (only and item["id"] not in only and f"#{item['index']}" not in only) or (item["hidden"] and not args.hidden and not only):
                continue
            best: tuple[Match, float] | str = "draws nothing"
            for factor in factors:
                scaled = drawn if factor == 1.0 else placed(data[item["index"]], item, factor)
                if scaled is None:
                    continue
                found = match(preview, scaled[0], scaled[1], scaled[2], args.search)
                if isinstance(found, str):
                    best = found if isinstance(best, str) and best == "draws nothing" else best
                elif isinstance(best, str) or found.score > best[0].score:
                    best = (found, factor)
            results[(file, item["index"])] = best
            # A flat image, such as a white icon, matches any patch of its color: its shape is not compared.
            opaque = drawn[0][..., 3] >= 0.5
            if opaque.any() and float((drawn[0][..., :3][opaque] * 255).std(axis=0).max()) < FLAT:
                flat.add((file, item["index"]))
            if not isinstance(best, str) and best[1] == 1.0 and best[0].score >= good:
                found_at[(file, item["index"])] = (best[0].dx, best[0].dy)

    for file, (layout, data) in layouts.items():
        rows = []
        for item in layout["elements"]:
            if only and item["id"] not in only and f"#{item['index']}" not in only:
                continue
            if item["type"] == "Dummy" or skipped(item["id"], skip) or (item["hidden"] and not args.hidden and not only):
                continue
            row = {"index": item["index"], "id": item["id"], "type": item["type"], "position": item["position"]}
            result = results.get((file, item["index"]))
            if item["type"] == "Text":
                row["note"] = "a text: its digits are drawn at runtime, so place it by eye (draw --outline --crop)"
            elif not item["drawn"] or result is None:
                row["note"] = item.get("reason") or ("a touch area" if item.get("touchOnly") else "gets its image at runtime")
            elif isinstance(result, str):
                row["note"] = result
            else:
                found, factor = result
                row.update({"score": round(found.score, 4), "here": None if found.here is None else round(found.here, 4), "move": [found.dx, found.dy],
                            "new": [item["position"][0] + found.dx, item["position"][1] + found.dy]})
                if factor != 1.0:
                    sx, sy = _point(data[item["index"]].get("scale"), (1.0, 1.0))
                    row["scale"] = [round(sx * factor, 4), round(sy * factor, 4)]
                lands = twin(file, item["index"], found.dx, found.dy) if factor == 1.0 and (found.dx, found.dy) != (0, 0) else None
                also = twin(file, item["index"], found.other[1], found.other[2]) if found.other and factor == 1.0 else None
                if (file, item["index"]) in flat:
                    row["note"] = "one flat color, so the match follows its color, not its shape: measure it by eye"
                elif found.score < good:
                    row["note"] = "no good match: another image, scale or state, or covered in the preview"
                elif lands and lands.endswith(" is found"):
                    row["note"] = (f"lands where {lands[:-9]} is found too, which draws the same image: the preview shows only "
                                   "one of them")
                elif lands:
                    row["note"] = (f"lands where {lands[:-3]} is, which draws the same image: the preview may show that one "
                                   f"(this one scores {found.here or 0:.3f} where it is)")
                elif found.other and not also:
                    row["note"] = (f"as good a match with a move of {found.other[1]},{found.other[2]}: a pattern, or an "
                                   "element with this image that is not listed (narrow --search)")
                elif also:
                    row["also"] = f"matches where {also} too, which draws the same image"
            rows.append(row)
        report["views"].append({"file": str(file), "name": layout["name"], "elements": rows})
    if args.json:
        print(json.dumps(report, indent=1))
        return
    print(f"preview {report['preview']['file']}: screen {resolution[0]}x{resolution[1]}, covers {preview.rect}, "
          f"scale {preview.scale:g}, origin {preview.origin[0]:g},{preview.origin[1]:g}"
          + (f"; smaller than the screen, so a move is right within {1 / preview.scale:.1f} pixels" if preview.scale < 1 else ""))
    moves = []
    for view in report["views"]:
        print(f"\n{view['name']} ({view['file']})")
        print(f"  {'#':>3} {'id':<34} {'type':<12} {'here':>6} {'found':>6} {'move':>11}  position -> new")
        for row in view["elements"]:
            position = f"{number_text(row['position'][0])},{number_text(row['position'][1])}"
            if "score" in row:
                moved = row["move"] != [0, 0]
                here = "" if row["here"] is None else f"{row['here']:.3f}"
                new = f"{number_text(row['new'][0])},{number_text(row['new'][1])}" if moved else "(stays)"
                scale = f" scale {row['scale'][0]:g},{row['scale'][1]:g}" if "scale" in row else ""
                print(f"  {row['index']:>3} {row['id'][:34]:<34} {row['type']:<12} {here:>6} {row['score']:>6.3f} "
                      f"{row['move'][0]:>5},{row['move'][1]:<5}  {position} -> {new}{scale}"
                      + (f"  [{row['note']}]" if "note" in row else "") + (f"  ({row['also']})" if "also" in row else ""))
                if row["score"] >= good and "note" not in row and moved:
                    moves.append(tuple(row["move"]))
            else:
                print(f"  {row['index']:>3} {row['id'][:34]:<34} {row['type']:<12} {'':>6} {'':>6} {'':>11}  {position}  [{row['note']}]")
    matched = sum(1 for view in report["views"] for row in view["elements"] if row.get("score", 0) >= good)
    print(f"\n{matched} elements match well; {len(moves)} of them would move without a note.")
    common = Counter(moves).most_common(1)
    if common and common[0][1] >= 3 and common[0][1] * 2 > len(moves):
        (dx, dy), count = common[0]
        print(f"{count} of the {len(moves)} that move move by {dx},{dy}: the preview may be laid at the wrong place, rather than "
              f"the layout be off. Try --origin {preview.origin[0] + dx:g},{preview.origin[1] + dy:g}, or auto.")


# Drawing


def blend(base: np.ndarray, png: bytes, opacity: float) -> None:
    layer = cv2.cvtColor(cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA).astype(np.float32)
    alpha = layer[..., 3:4] / 255.0 * opacity
    base[:] = layer[..., :3] * alpha + base * (1 - alpha)


def draw(args: argparse.Namespace) -> None:
    files, resolution = views(args.views)
    width, height = resolution
    sample = DEFAULT_SAMPLE if args.text is None else args.text
    skip = patterns(args.skip)
    if args.over:
        base = load_preview(args.over, resolution, args.part, args.origin, args.scale, files, skip).rgb
    else:
        tiles = (np.indices((height, width)) // 16).sum(axis=0) % 2
        base = np.where(tiles[..., None] == 1, 96.0, 64.0).astype(np.float32).repeat(3, axis=2)
    opacity = args.opacity if args.opacity is not None else (0.5 if args.over else 1.0)
    for file in files:
        for png in rendered(file, args.hidden, sample, skip) if opacity > 0 else []:
            blend(base, png, opacity)
    left, top, crop_width, crop_height = (int(value) for value in numbers(args.crop, 4, "--crop")) if args.crop else (0, 0, width, height)
    left, top = max(0, left), max(0, top)
    right, bottom = min(width, left + crop_width), min(height, top + crop_height)
    if right <= left or bottom <= top:
        fail("--crop is outside the screen")
    zoom = args.zoom or (min(4.0, 1600 / max(right - left, bottom - top)) if args.crop else 1.0)
    image = np.clip(base[top:bottom, left:right], 0, 255).astype(np.uint8)
    if zoom != 1.0:
        image = cv2.resize(image, (round((right - left) * zoom), round((bottom - top) * zoom)),
                           interpolation=cv2.INTER_NEAREST if zoom > 1 else cv2.INTER_AREA)
    image = np.ascontiguousarray(image)
    if args.outline:
        for number, file in enumerate(files):
            color = COLORS[number % len(COLORS)]
            prefix = "" if len(files) == 1 else chr(ord("A") + number)
            if len(files) > 1:
                print(f"{prefix}: {file}")
            for item in view_layout(file, text=sample)["elements"]:
                if (item["hidden"] and not args.hidden and item["type"] != "Dummy") or skipped(item["id"], skip):
                    continue
                corners = item["text"]["corners"] if "text" in item else item["corners"]
                points = (np.array(corners, float) - [left, top]) * zoom
                if item["type"] == "Dummy" or not np.ptp(points, axis=0).any():
                    x, y = (np.array(item["position"], float) - [left, top]) * zoom
                    cv2.drawMarker(image, (round(x), round(y)), color, cv2.MARKER_CROSS, 12, 1)
                    anchor = (round(x) + 4, round(y) - 4)
                else:
                    cv2.polylines(image, [np.round(points).astype(np.int32)], True, color, 1, cv2.LINE_AA)
                    anchor = (round(points[:, 0].min()) + 2, round(points[:, 1].min()) + 12)
                label = f"{prefix}{item['index']}" + (f" {item['id']}" if args.ids else "")
                cv2.putText(image, label, anchor, cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 3, cv2.LINE_AA)
                cv2.putText(image, label, anchor, cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1, cv2.LINE_AA)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(out), cv2.cvtColor(image, cv2.COLOR_RGB2BGR)):
        fail(f"{out} cannot be written")
    print(f"{out}: {right - left}x{bottom - top} of the screen from {left},{top}, at {zoom:g}x")


# Elements and positions


def elements(args: argparse.Namespace) -> None:
    files, _resolution = views(args.views)
    for file in files:
        layout = view_layout(file, text=DEFAULT_SAMPLE)
        data = read_view(file)["elements"]
        print(f"{layout['name']} ({file}), {layout['resolution']['width']}x{layout['resolution']['height']}")
        for item in layout["elements"]:
            member = data[item["index"]]
            corners = np.array(item["text"]["corners"] if "text" in item else item["corners"])
            box = f"{corners[:, 0].min():g},{corners[:, 1].min():g}..{corners[:, 0].max():g},{corners[:, 1].max():g}"
            facts = [f"at {number_text(item['position'][0])},{number_text(item['position'][1])}"
                     + ("" if "position" in member else " (no position)"),
                     f"box {box}"]
            if member.get("alignment"):
                facts.append(str(member["alignment"]))
            for name in ("scale", "pivot", "fitBox", "touchArea"):
                if isinstance(member.get(name), dict):
                    facts.append(f"{name} " + ",".join(number_text(value) for value in member[name].values() if isinstance(value, (int, float))))
            if member.get("rotation"):
                facts.append(f"rotation {member['rotation']}")
            if item["hidden"] and item["type"] != "Dummy":
                facts.append("hidden")
            if item["keys"] or member.get("rssStyleId"):
                facts.append(" ".join(item["keys"]) or str(member["rssStyleId"]))
            if item.get("reason"):
                facts.append(f"[{item['reason']}]")
            print(f"  {item['index']:>3} {item['id']:<34} {item['type']:<12} " + "; ".join(facts))
        if "resourcesError" in layout:
            print(f"  [the descriptors: {layout['resourcesError']}]")


def move(args: argparse.Namespace) -> None:
    files, _resolution = views([args.view])
    file = files[0]
    data = read_view(file)["elements"]
    positions: dict[int, tuple[float, float]] = {}
    for change in args.changes:
        reference, _, value = change.partition("=")
        x, y = numbers(value, 2, change)
        if reference.startswith("#") and reference[1:].isdigit():
            indexes = [int(reference[1:])] if int(reference[1:]) < len(data) else []
        else:
            indexes = [index for index, element in enumerate(data) if element.get("id") == reference]
        if len(indexes) != 1:
            fail(f"{reference}: {'no element' if not indexes else 'several elements'} of {file.name}" + (" (use #index)" if indexes else ""))
        positions[indexes[0]] = (x, y)
    raw = file.read_bytes()
    bom = raw.startswith(b"\xef\xbb\xbf")
    try:
        text = set_view_positions(raw[3 if bom else 0:].decode("utf-8"), positions)
    except (UnicodeDecodeError, ValueError) as error:
        fail(f"{file.name}: {error}")
    result = (b"\xef\xbb\xbf" if bom else b"") + text.encode("utf-8")
    if result != raw:
        file.write_bytes(result)
    for index, (x, y) in sorted(positions.items()):
        old = _point(data[index].get("position"), (0.0, 0.0))
        print(f"{file.name} #{index} {data[index].get('id', '')}: {number_text(old[0])},{number_text(old[1])} -> {number_text(x)},{number_text(y)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    def preview_options(command: argparse.ArgumentParser) -> None:
        command.add_argument("--skip", metavar="ID,...", help="leave out the elements whose ids match these patterns, such as "
                                                             "*_tetra (the elements of another theme or state than the preview's)")
        command.add_argument("--part", metavar="X,Y,W,H", help="the part of the preview to use, in its pixels")
        command.add_argument("--origin", metavar="X,Y", help="the screen point the preview's top-left shows (0,0; auto: where "
                                                           "it looks most like the views)")
        command.add_argument("--scale", metavar="S", help="preview pixels per screen pixel (its width over the screen's "
                                                          "when it has the screen's aspect ratio, else 1)")

    command = commands.add_parser("elements", help="list the views' elements")
    command.add_argument("views", nargs="+")
    command.set_defaults(run=elements)

    command = commands.add_parser("draw", help="draw the views, over the preview, outlined")
    command.add_argument("out")
    command.add_argument("views", nargs="+")
    command.add_argument("--over", metavar="PREVIEW", help="draw them over the preview")
    preview_options(command)
    command.add_argument("--opacity", type=float, help="of the views over the preview (0.5; 0 draws only outlines)")
    command.add_argument("--outline", action="store_true", help="outline and number every element")
    command.add_argument("--ids", action="store_true", help="label the outlines with the elements' ids too")
    command.add_argument("--hidden", action="store_true", help="draw the hidden elements too")
    command.add_argument("--text", help="the sample text of Text elements (one that suits each font; empty for none)")
    command.add_argument("--crop", metavar="X,Y,W,H", help="the part of the screen to draw, zoomed")
    command.add_argument("--zoom", type=float, help="how much larger to draw it (a crop fits 1600 pixels)")
    command.set_defaults(run=draw)

    command = commands.add_parser("locate", help="find each element's image in the preview")
    command.add_argument("preview")
    command.add_argument("views", nargs="+")
    preview_options(command)
    command.add_argument("--search", type=int, default=300, help="pixels around the element to look in (300; 0 for the whole preview)")
    command.add_argument("--only", metavar="REF,...", help="only these elements (ids, or #index)")
    command.add_argument("--scales", metavar="F,...", help="also try the images this much larger, such as 0.9,0.95,1.05,1.1")
    command.add_argument("--hidden", action="store_true", help="the hidden elements too")
    command.add_argument("--json", action="store_true")
    command.set_defaults(run=locate)

    command = commands.add_parser("move", help="write elements' positions into a view")
    command.add_argument("view")
    command.add_argument("changes", nargs="+", metavar="REF=X,Y")
    command.set_defaults(run=move)

    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
