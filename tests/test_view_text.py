"""The text of a view's Text elements, drawn with a sample text in the style's font: an image font or a TrueType one."""

import json
from pathlib import Path

import numpy as np
import pytest

from egt_gda_sync.view_text import DEFAULT_SAMPLE, sample_for
from egt_gda_sync.views import render_view, view_layout
from tests.test_views import BLUE, decode, write_game, write_json

# A TrueType font of the system, for the fonts that Pillow draws.
SYSTEM_FONTS = [Path(path) for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf",
                                       "C:/Windows/Fonts/arial.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf")]
SYSTEM_FONT = next((path for path in SYSTEM_FONTS if path.is_file()), None)


def text_element(view: Path, layout: dict) -> dict:
    return next(element for element in layout["elements"] if element["id"] == "text_win")


def test_a_text_is_drawn_with_the_sample_in_its_image_font_aligned_by_its_size(tmp_path):
    game = write_game(tmp_path)
    main = game / "v" / "1920x1080" / "MainView.json"
    # The font has only digits: the sample's space and point are left out. Its 5 × 8 glyphs are drawn 4 times as large,
    # the style's size over the font's.
    text = text_element(main, view_layout(main, text="1 234.56"))["text"]
    assert (text["width"], text["height"], text["vertical"]) == (120, 32, False)
    # Bottom center at its position (960, 900): it fits its 200 × 40 fit box, so it is not shrunk.
    assert text["matrix"] == [1.0, 0.0, 0.0, 1.0, 900.0, 868.0]
    drawn, without = (decode(render_view(main, 1920, text=sample)) for sample in ("1 234.56", ""))
    assert tuple(drawn[884, 905]) == BLUE and without[884, 905, 3] == 0
    # No sample, no text; the facts of a report have none.
    assert "text" not in text_element(main, view_layout(main, text=""))
    assert "text" not in text_element(main, view_layout(main))


def test_the_default_sample_suits_the_font():
    # An amount in a font with a decimal point, a count in an image font of digits alone; a given sample as it is.
    assert sample_for({"path": "credit.png", "chars": "[U+0020][U+0030-U+0039][U+002E]"}, DEFAULT_SAMPLE) == "1 234.56"
    assert sample_for({"path": "counter.png", "chars": "[U+0030-U+0039]"}, DEFAULT_SAMPLE) == "10"
    assert sample_for({"path": "sans.ttf", "chars": "[U+0030-U+0039]"}, DEFAULT_SAMPLE) == "1 234.56"
    assert sample_for({"path": "counter.png", "chars": "[U+0030-U+0039]"}, "7") == "7"


def test_a_text_larger_than_its_fit_box_shrinks_into_it_and_a_vertical_one_is_a_column(tmp_path):
    game = write_game(tmp_path)
    main = game / "v" / "1920x1080" / "MainView.json"
    view = json.loads(main.read_text())
    view["elements"][5]["fitBox"] = {"w": 60, "h": 40}
    main.write_text(json.dumps(view))
    # 120 × 32 into 60 × 40: half as large, around the bottom center of the fit box (TextElement::GetTransform).
    text = text_element(main, view_layout(main, text="123456"))["text"]
    assert text["matrix"] == [0.5, 0.0, 0.0, 0.5, 915.0, 888.0]
    view["elements"][5].pop("fitBox")
    view["elements"][5]["orientation"] = "Vertical"
    main.write_text(json.dumps(view))
    # One digit under another, each as tall as its ink.
    text = text_element(main, view_layout(main, text="12"))["text"]
    assert (text["width"], text["height"], text["vertical"]) == (20, 64, True)


def test_a_style_whose_font_is_not_declared_is_reported_and_draws_no_text(tmp_path):
    game = write_game(tmp_path)
    write_json(game / "RssTextStylesData.json", {"styles": [{"id": "STYLE_WIN", "font_id": "FONT_GONE", "size": 32}]})
    main = game / "v" / "1920x1080" / "MainView.json"
    element = text_element(main, view_layout(main, text="1"))
    assert element["reason"] == "no font has the id FONT_GONE" and "text" not in element


@pytest.mark.skipif(SYSTEM_FONT is None, reason="no TrueType font on this system")
def test_a_text_in_a_truetype_font_is_drawn_with_it(tmp_path):
    game = write_game(tmp_path)
    (game / "art" / "sans.ttf").write_bytes(SYSTEM_FONT.read_bytes())
    write_json(game / "RssFontsData.json", {"fonts": [{"id": "FONT_WIN", "path": "art/sans.ttf", "chars": "[U+0020-U+007E]", "size": 20}]})
    main = game / "v" / "1920x1080" / "MainView.json"
    text = text_element(main, view_layout(main, text="WIN 88"))["text"]
    # Drawn at the style's size: a line as tall as the font's ascent and descent at 32 pixels.
    assert 30 <= text["height"] <= 45 and text["width"] > 60
    drawn = decode(render_view(main, 1920, text="WIN 88"))
    left, top = int(text["matrix"][4]), int(text["matrix"][5])
    area = drawn[top:top + int(text["height"]), left:left + int(text["width"])]
    # White text: opaque white pixels where the glyphs are.
    assert (area[..., 3] > 200).sum() > 100 and np.all(area[area[..., 3] > 250][:, :3] > 200)
