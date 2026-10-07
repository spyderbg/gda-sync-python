"""Synthetic RTFs, projects of the RTF Tool, with pages, styles, texts in two languages, images and a video."""

import json
from pathlib import Path

import numpy as np

from egt_gda_sync.png import encode_png
from tests.fixtures.bc7_dds import create_bc7_dds


def _png(width: int, height: int, color: tuple[int, int, int]) -> bytes:
    return encode_png(np.full((height, width, 4), (*color, 255), np.uint8))


def _text(english: str, italian: str, image_scale: float = 1.0, case: str = "none") -> dict:
    return {"texts": {language: {"options": {"case_type": case, "image_scale": image_scale}, "translation": translation}
                      for language, translation in (("English", english), ("Italian", italian))}}


def _section(x: int, y: int, w: int, h: int, style: str, texts: list[dict], alignment: str = "median", overflow: str = "none") -> dict:
    return {"alignment": alignment, "area": {"x": x, "y": y, "w": w, "h": h}, "effect": {"id": ""}, "group_id": "", "image_alignment": 0.5,
            "image_scale": 1.0, "line_height_behaviour": 0, "overflow": overflow, "style_id": style, "texts": texts}


def _color(r: int, g: int, b: int, a: int = 255) -> dict:
    return {"a": a, "b": b, "g": g, "r": r}


def write_project(folder: Path) -> Path:
    """An RTF of three pages in English and Italian. "rules" has a background, a title, a text with an inline
    image, a variable the game fills in and one the project's dynamics name, and a text with an image that does not
    exist; "wintable" has a paytable figure, a video and a section with a text for jackpot games; "keyboard" has a
    background that is not mapped."""
    data = folder / "data"
    (data / "videos" / "spin").mkdir(parents=True)
    (data / "background.dds").write_bytes(create_bc7_dds(64, 36))
    (data / "wintable.dds").write_bytes(create_bc7_dds(32, 18))
    (data / "logo.png").write_bytes(_png(24, 12, (40, 120, 220)))
    for number in range(3):
        (data / "videos" / "spin" / f"spin_{number:05d}.png").write_bytes(_png(16, 16, (220, 40 * number, 40)))
    plain = {"advance": {"x": 0.0, "y": 0.0}, "font_face": "Regular", "scaled_size": 40.0, "color_top": _color(255, 255, 255),
             "color_bot": _color(255, 255, 255), "outline_width": 0.0, "shadow_color_top": _color(0, 0, 0), "shadow_offsets": {"x": 0.0, "y": 0.0},
             "shadow_softness": 0.0}
    title = {**plain, "advance": {"x": 2.0, "y": -1.0}, "font_face": "Black", "point_size": 160.0, "scaled_size": 80.0, "color_top": _color(255, 246, 62),
             "color_bot": _color(255, 140, 0), "outline_width": 3.0, "outline_color_top": _color(40, 20, 0),
             "shadow_color_top": _color(0, 0, 0, 160), "shadow_offsets": {"x": 1.5, "y": 2.0}, "shadow_softness": 0.5}
    project = {
        "dynamics": [["_certification_code_", "ABC-123"]],
        "edit": {"guides": [], "page_data": {"rules": {"color": _color(0, 97, 255), "section_data": {}}}},
        "exported_by": "EGT",
        "languages": ["English", "Italian"],
        "mapping": {"app:/data/background.dds": "_image_1_", "app:/data/wintable.dds": "_image_2_", "app:/data/logo.png": "_image_3_",
                    "app:/data/gone.dds": "_image_4_"},
        "pages": {
            "rules": {"background_id": "_image_1_", "resolution": {"aspect": "16:9", "full": "1920x1080,16:9(FHD)", "height": 1080, "standard": "FHD", "width": 1920},
                      "sections": {
                          "title": _section(160, 80, 1600, 120, "_style_title_", [{"tags": [], "text_info": {"id": "_text_title_"}}]),
                          "text": _section(160, 300, 1600, 400, "_style_text_", [{"tags": [], "text_info": {"id": "_text_rules_"}}], "center", "word"),
                          "footer": _section(20, 1040, 900, 30, "_style_text_", [{"tags": [], "text_info": {"id": "_text_footer_"}}], "bottom_left"),
                      }},
            "wintable": {"background_id": "_image_2_", "resolution": {"height": 1080, "standard": "FHD", "width": 1920},
                         "sections": {
                             "bell_x3": _section(1300, 600, 240, 40, "_style_text_", [{"figure_info": {"count": 3, "group": "default", "ids": ["bell"], "multiplier": 1}, "tags": []}]),
                             "spin": _section(700, 400, 520, 300, "_style_text_", [{"tags": [], "text_info": {"id": "_text_spin_"}}]),
                             "prizes": _section(20, 20, 900, 30, "_style_text_", [{"tags": ["jackpot"], "text_info": {"id": "_text_jackpot_"}},
                                                                                   {"tags": [], "text_info": {"id": "_text_prizes_"}}], "top_left"),
                         }},
            "keyboard": {"background_id": "_image_9_", "resolution": {"height": 768, "standard": "WXGA", "width": 1366}, "sections": {}},
        },
        "styles": {"_style_text_": plain, "_style_title_": title, "_superscript_": {**plain, "scaled_size": 20.0}},
        "tags": [],
        "texts": {
            "_text_title_": _text("How to play", "Come giocare", case="uppercase"),
            "_text_rules_": _text("Wins pay image[_image_3_] left to right on the 2_superscript_[nd] reel.\nSerial _style_text_[_serial_number_] · code _style_text_[_certification_code_]",
                                  "Le vincite pagano image[_image_3_] da sinistra a destra.\nSeriale _style_text_[_serial_number_] · codice _style_text_[_certification_code_]"),
            "_text_footer_": _text("image[_image_4_] ALL PRIZES IN _style_title_[CREDITS]", "image[_image_4_] TUTTE LE VINCITE IN _style_title_[CREDITI]"),
            "_text_spin_": _text("video[_video_1_]", "video[_video_1_]", image_scale=5.0),
            "_text_prizes_": _text("ALL PRIZES SHOWN IN CREDITS", "TUTTE LE VINCITE SONO MOSTRATE IN CREDITI"),
            "_text_jackpot_": _text("EXCEPT JACKPOTS", "ECCETTO I JACKPOT"),
        },
        "version": "v1.0.0-664-g235be19",
        "video_mapping": {"app:/data/videos/spin": {"fps": 25.0, "id": "_video_1_", "movie_format": "opaque"}},
    }
    path = folder / "project.rtf"
    path.write_text(json.dumps(project, indent=2, sort_keys=True))
    return path
