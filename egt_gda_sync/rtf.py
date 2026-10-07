"""Read RTFs, projects of the RTF Tool such as a game's help screens (project.rtf), enough to describe and draw them.

Despite the extension, a project is JSON, not Rich Text Format. It has pages, each with a resolution, a background image
and text sections: rectangles of the page, each with a text style and texts in the project's languages. A section can
have several texts, for game settings named by tags; the one without tags is the default. A text can hold markup:
image[<image id>] and video[<video id>] draw an image, or a video's first frame, in the line, and <style id>[<text>]
draws a text in another style; a text such as _serial_number_ is a variable that the game fills in, or the project's
dynamics name a value for. A paytable section draws a figure, the win of a number of symbols, which the game computes.
Images and videos are mapped from paths such as app:/data/rules.dds, which are relative to the project's folder; a
video is a folder of numbered frames. A section's text that does not fit its rectangle is drawn smaller, so a style's
size is the largest its text is drawn at.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Iterable, Iterator
from pathlib import Path

RTF_EXTENSION = "rtf"
APP_PREFIX = "app:/"
# A project is a few hundred kilobytes; a larger .rtf file is not read.
MAX_PROJECT_BYTES = 16 * 1024 * 1024
# How many of the files that a project misses its facts list; the count is always complete.
MISSING_LIMIT = 64
FRAME_EXTENSIONS = (".png", ".dds", ".jpg", ".jpeg", ".webp")
VARIABLE = re.compile(r"_[A-Za-z0-9_]+_")
WEIGHTS = (("thin", 100), ("extralight", 200), ("light", 300), ("medium", 500), ("semibold", 600), ("extrabold", 800),
           ("black", 900), ("heavy", 900), ("bold", 700))
DEFAULT_SIZE = 40.0


def read_project(path: str) -> dict:
    """A project's JSON, which must have pages; anything else raises ValueError."""
    if os.path.getsize(path) > MAX_PROJECT_BYTES:
        raise ValueError("The file is too large to be an RTF Tool project")
    with open(path, "rb") as handle:
        data = handle.read()
    try:
        project = json.loads(data.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("Not an RTF Tool project: the file is not JSON") from error
    if not isinstance(project, dict) or not isinstance(project.get("pages"), dict):
        raise ValueError("Not an RTF Tool project: the file has no pages")
    return project


def _dict(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _list(value: object) -> list:
    return value if isinstance(value, list) else []


def _number(value: object, default: float = 0.0) -> float:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else default


def _resolve(folder: Path, value: str) -> Path:
    return (folder / value.removeprefix(APP_PREFIX)).resolve()


class _Project:
    """A project's pages, texts and styles, with its images and videos by id, resolved against its folder."""

    def __init__(self, path: str):
        self.data = read_project(path)
        folder = Path(path).resolve().parent
        self.folder = folder
        self.pages = {str(name): _dict(page) for name, page in self.data["pages"].items()}
        self.texts = _dict(self.data.get("texts"))
        self.styles = _dict(self.data.get("styles"))
        self.languages = [str(language) for language in _list(self.data.get("languages"))]
        self.images = {str(image_id): _resolve(folder, file) for file, image_id in _dict(self.data.get("mapping")).items() if isinstance(file, str)}
        self.videos = {str(_dict(video).get("id")): (_resolve(folder, file), _number(_dict(video).get("fps"), 25.0))
                       for file, video in _dict(self.data.get("video_mapping")).items() if isinstance(file, str) and _dict(video).get("id")}
        self.dynamics = {str(item[0]): str(item[1]) for item in _list(self.data.get("dynamics")) if isinstance(item, list) and len(item) == 2}
        names = sorted({"image", "video", *(str(name) for name in self.styles)}, key=len, reverse=True)
        self.markup = re.compile("(" + "|".join(map(re.escape, names)) + r")\[([^\[\]]*)\]")

    def translations(self, text_id: object) -> dict[str, dict]:
        """A text's translation and options in each language."""
        return {str(language): _dict(entry) for language, entry in _dict(_dict(self.texts.get(text_id)).get("texts")).items()}

    def references(self) -> Iterator[tuple[str, str]]:
        """Each image and video that the pages draw, as ("image" or "video", id): backgrounds, and the ones in the texts
        of every section, in every language and for every tag."""
        for page in self.pages.values():
            if page.get("background_id"):
                yield "image", str(page["background_id"])
            for section in _dict(page.get("sections")).values():
                for text in _list(_dict(section).get("texts")):
                    for entry in self.translations(_dict(_dict(text).get("text_info")).get("id")).values():
                        for match in self.markup.finditer(str(entry.get("translation", ""))):
                            if match[1] in ("image", "video"):
                                yield match[1], match[2]

    def frames(self, video_id: str) -> list[Path]:
        """A video's frames in order: the images in its folder."""
        folder = self.videos[video_id][0] if video_id in self.videos else None
        if folder is None or not folder.is_dir():
            return []
        return sorted(entry for entry in folder.iterdir() if entry.suffix.lower() in FRAME_EXTENSIONS and entry.is_file())

    def found(self, kind: str, item_id: str) -> bool:
        if kind == "video":
            return bool(self.frames(item_id))
        return item_id in self.images and self.images[item_id].is_file()

    def relative(self, path: Path) -> str:
        return os.path.relpath(path, self.folder).replace(os.sep, "/")


def _resolution(page: dict) -> dict:
    resolution = _dict(page.get("resolution"))
    return {"width": int(_number(resolution.get("width"), 1920)), "height": int(_number(resolution.get("height"), 1080)),
            **({"standard": str(resolution["standard"])} if resolution.get("standard") else {})}


def _page(project: _Project, name: str, page: dict) -> dict:
    """A page's name, resolution and background image, whether it exists or not."""
    background_id = str(page.get("background_id") or "")
    background = project.images.get(background_id)
    return {"id": name, **_resolution(page), "background": str(background) if background else None,
            "found": bool(background and background.is_file())}


def describe_rtf(path: str) -> dict:
    """A project's facts: its tool version, languages and pages, how many images, videos, texts and styles it has, and
    the images and videos its pages draw that do not exist, by id and path; a file that is not a project has only
    rtfError."""
    try:
        project = _Project(path)
        references = list(dict.fromkeys(project.references()))
        missing = []
        for kind, item_id in references:
            if not project.found(kind, item_id):
                file = project.videos[item_id][0] if kind == "video" and item_id in project.videos else project.images.get(item_id) if kind == "image" else None
                missing.append({"kind": kind, "id": item_id, "path": project.relative(file) if file else None})
        pages = [{**_page(project, name, page), "sections": len(_dict(page.get("sections")))} for name, page in project.pages.items()]
    except (OSError, ValueError, RecursionError) as error:
        return {"rtfError": str(error) or type(error).__name__}
    version = project.data.get("version")
    return {"rtf": {
        **({"version": str(version)} if version else {}), "languages": project.languages, "pages": pages,
        "images": sum(1 for kind, _id in references if kind == "image"), "videos": sum(1 for kind, _id in references if kind == "video"),
        "texts": len(project.texts), "styles": len(project.styles), "missing": missing[:MISSING_LIMIT], "missingCount": len(missing),
    }}


def _color(value: object) -> str | None:
    """A color of the project, such as {"r": 255, "g": 246, "b": 62, "a": 255}, as CSS hex."""
    color = _dict(value)
    if not color:
        return None
    channels = [max(0, min(255, int(_number(color.get(key), 255 if key == "a" else 0)))) for key in "rgba"]
    return "#" + "".join(f"{channel:02x}" for channel in (channels if channels[3] < 255 else channels[:3]))


def _weight(face: str) -> int:
    name = face.lower().replace(" ", "").replace("-", "")
    return next((weight for key, weight in WEIGHTS if key in name), 400)


def style_facts(style: dict) -> dict:
    """What a browser needs to draw text in a style: its font face and weight, its size in page pixels, its fill (one
    color, or a gradient from top to bottom), its outline and shadow, and the advance between letters and lines. The
    tool draws a style's text at its point_size and scales it to its scaled_size, so the advances, the outline width and
    the shadow offsets, which are in pixels of the point size, are scaled with it."""
    face = str(style.get("font_face") or "Regular")
    size = _number(style.get("scaled_size"), DEFAULT_SIZE)
    point_size = _number(style.get("point_size"))
    ratio = size / point_size if point_size > 0 else 1.0
    fill = [color for key in ("color_top", "color_mid", "color_bot") if (color := _color(style.get(key)))]
    advance = _dict(style.get("advance"))
    facts: dict = {"face": face, "weight": _weight(face), "size": size, "fill": fill[:1] if len(set(fill)) <= 1 else fill,
                   "letterSpacing": round(_number(advance.get("x")) * ratio, 3), "lineSpacing": round(_number(advance.get("y")) * ratio, 3)}
    if not facts["fill"]:
        facts["fill"] = ["#ffffff"]
    width = _number(style.get("outline_width"))
    if width > 0 and (color := _color(style.get("outline_color_top"))):
        facts["outline"] = {"color": color, "width": round(width * ratio, 3)}
    offsets = _dict(style.get("shadow_offsets"))
    shadow = _color(style.get("shadow_color_top"))
    x, y, softness = _number(offsets.get("x")), _number(offsets.get("y")), _number(style.get("shadow_softness"))
    if shadow and _number(_dict(style.get("shadow_color_top")).get("a"), 255) > 0 and (x or y or softness):
        facts["shadow"] = {"color": shadow, "x": round(x * ratio, 3), "y": round(y * ratio, 3), "blur": softness}
    return facts


def _alignment(value: object) -> tuple[str, str]:
    """A section's alignment, such as "median", "left" or "bottom_right", as horizontal and vertical alignment."""
    parts = set(str(value or "").split("_"))
    horizontal = "left" if "left" in parts else "right" if "right" in parts else "center"
    vertical = "top" if "top" in parts else "bottom" if "bottom" in parts else "middle"
    return horizontal, vertical


def _image_run(project: _Project, image_id: str, scale: float) -> dict:
    path = project.images.get(image_id)
    return {"image": str(path) if path else None, "id": image_id, "found": bool(path and path.is_file()), "scale": scale}


def _video_run(project: _Project, video_id: str, scale: float) -> dict:
    frames = project.frames(video_id)
    return {"video": str(frames[0]) if frames else None, "id": video_id, "found": bool(frames), "frames": len(frames),
            "fps": project.videos[video_id][1] if video_id in project.videos else 0, "scale": scale}


def runs(project: _Project, translation: str, scale: float) -> list[dict]:
    """A translation as the runs that draw it: text, an image, a video's first frame, or a variable, each in the
    section's style unless it names another."""
    result: list[dict] = []
    position = 0
    for match in project.markup.finditer(translation):
        if match.start() > position:
            result.append({"text": translation[position:match.start()]})
        name, content = match[1], match[2]
        if name == "image":
            result.append(_image_run(project, content, scale))
        elif name == "video":
            result.append(_video_run(project, content, scale))
        elif VARIABLE.fullmatch(content):
            result.append({"variable": content, "style": name, **({"value": project.dynamics[content]} if content in project.dynamics else {})})
        else:
            result.append({"text": content, "style": name})
        position = match.end()
    if position < len(translation):
        result.append({"text": translation[position:]})
    return result


def figure_label(figure: dict) -> str:
    """A paytable figure, such as "3× bell": the number of symbols whose win the game draws."""
    ids = "/".join(str(item) for item in _list(figure.get("ids"))) or str(figure.get("group") or "symbol")
    multiplier = _number(figure.get("multiplier"), 1)
    return f"{int(_number(figure.get('count')))}× {ids}" + (f" ×{multiplier:g}" if multiplier != 1 else "")


def _section(project: _Project, name: str, section: dict) -> dict:
    """A section's rectangle, alignment, wrapping, style and its default text in each language."""
    area = _dict(section.get("area"))
    horizontal, vertical = _alignment(section.get("alignment"))
    variants = [_dict(text) for text in _list(section.get("texts"))]
    chosen = next((text for text in variants if not _list(text.get("tags"))), variants[0] if variants else {})
    texts: dict[str, dict] = {}
    if "figure_info" in chosen:
        label = figure_label(_dict(chosen["figure_info"]))
        texts = {language: {"runs": [{"figure": label}]} for language in project.languages}
    elif "text_info" in chosen:
        for language, entry in project.translations(_dict(chosen["text_info"]).get("id")).items():
            options = _dict(entry.get("options"))
            case = str(options.get("case_type") or "none")
            texts[language] = {**({"case": case} if case != "none" else {}),
                               "runs": runs(project, str(entry.get("translation", "")), _number(options.get("image_scale"), 1.0))}
    effect = str(_dict(section.get("effect")).get("id") or "")
    return {
        "id": name, "x": _number(area.get("x")), "y": _number(area.get("y")), "w": _number(area.get("w")), "h": _number(area.get("h")),
        "horizontal": horizontal, "vertical": vertical, "wrap": section.get("overflow") == "word", "style": str(section.get("style_id") or ""),
        **({"effect": effect} if effect else {}), "variants": len(variants), "texts": texts,
    }


def _used_styles(sections: Iterable[dict]) -> set[str]:
    return {name for section in sections for name in (section["style"], *(run.get("style") for text in section["texts"].values() for run in text["runs"])) if name}


def rtf_layout(path: str) -> dict:
    """Everything a browser needs to draw a project's pages: for each page, its background and sections, each with its
    default text in each language as runs, and the styles they use. A file that is not a project raises ValueError."""
    project = _Project(path)
    edit = _dict(_dict(project.data.get("edit")).get("page_data"))
    pages = []
    for name, page in project.pages.items():
        sections = [_section(project, section_name, _dict(section)) for section_name, section in _dict(page.get("sections")).items()]
        color = _color(_dict(edit.get(name)).get("color"))
        pages.append({**_page(project, name, page), **({"color": color} if color else {}), "sections": sections})
    used = _used_styles(section for page in pages for section in page["sections"])
    return {"languages": project.languages, "pages": pages,
            "styles": {name: style_facts(_dict(project.styles.get(name))) for name in sorted(used)}}
