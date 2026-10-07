"""Font files: their names, glyphs and characters, the characters that Font entries declare, and font previews."""

import json
from urllib.parse import unquote

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.asset_report import inventory
from egt_gda_sync.fonts import coverage, declared_characters, describe_font, read_font
from egt_gda_sync.library import Library, asset_facts
from egt_gda_sync.rss_sync import Config
from egt_gda_sync.server import create_app
from tests.conftest import session_headers
from tests.fixtures.font import build_font

LATIN = list(range(0x20, 0x7F))


@pytest.mark.parametrize("cff, collection, kind", [(False, False, "TrueType"), (True, False, "OpenType (CFF)"), (False, True, "TrueType")])
def test_reads_the_names_glyph_count_and_characters_of_a_font(cff, collection, kind):
    facts, characters = read_font(build_font([*LATIN, 0x20AC, 0x1F600], glyphs=120, cff=cff, collection=collection))
    # The samples it can draw: the Latin one, and the currency signs it has.
    assert facts == {"format": kind, "family": "Test Sans", "style": "Regular", "fullName": "Test Sans Regular",
                     "version": "Version 1.000", "glyphs": 120, "samples": [
                         {"script": "Latin", "pair": "Aa", "text": "The quick brown fox jumps over the lazy dog."},
                         {"script": "Currencies", "pair": "€$", "text": "€ $"}]}
    # The BMP characters from format 4, and the others from format 12.
    assert characters == {*LATIN, 0x20AC, 0x1F600}


def test_a_file_that_is_not_a_font_or_is_cut_off_has_an_error(tmp_path):
    (tmp_path / "fake.ttf").write_bytes(b"not a font at all")
    (tmp_path / "cut.ttf").write_bytes(build_font(LATIN)[:40])
    assert describe_font(str(tmp_path / "fake.ttf")) == {"fontError": "Not a TrueType or OpenType font"}
    assert "fontError" in describe_font(str(tmp_path / "cut.ttf"))
    assert describe_font(str(tmp_path / "absent.ttf"))["fontError"]


def test_declared_characters_are_ranges_without_the_ones_that_are_never_drawn():
    # U+0080-U+009F are control characters, and U+0378 is unassigned.
    assert declared_characters("[U+0041-U+0043][U+0080-U+0081][U+20AC][U+0378][U+0041]") == [0x41, 0x42, 0x43, 0x20AC]
    assert declared_characters("[U+0043-U+0041]") == [0x41, 0x42, 0x43]
    assert declared_characters("AB€") == [0x41, 0x42, 0x20AC]
    result = coverage({0x41, 0x42}, "[U+0041-U+0044][U+20AC]")
    assert result == {"declared": 5, "covered": 2, "missing": [0x43, 0x44, 0x20AC], "missingCount": 3}


def write_game(root):
    game = root / "resources" / "example"
    game.mkdir(parents=True)
    (game / "sans.ttf").write_bytes(build_font([*LATIN, 0x20AC]))
    (game / "spare.otf").write_bytes(build_font(LATIN, family="Spare", cff=True))
    (game / "digits.png").write_bytes(b"png")
    (game / "RssFontsData.json").write_text(json.dumps({"fonts": [
        {"id": "FONT_SANS", "path": "sans.ttf", "chars": "[U+0020-U+007E][U+20AC]", "size": 25},
        {"id": "FONT_SANS_CYRILLIC", "path": "sans.ttf", "chars": "[U+0410-U+0412]", "size": 40},
        {"id": "FONT_DIGITS", "path": "digits.png", "chars": "[U+0030-U+0039]", "size": 32},
    ]}, indent=2))
    return game


def test_the_asset_report_describes_fonts_and_checks_each_font_entry(tmp_path):
    game = write_game(tmp_path)
    config = Config(resources_dir=game.parent.resolve(), gda_dir=tmp_path, extensions=frozenset({".ttf", ".otf", ".png"}), game="example")
    rows = {row["resource"]: row for row in inventory(config, asset_facts)["assets"]}
    sans = rows["sans.ttf"]
    assert (sans["type"], sans["category"], sans["font"]["family"], sans["font"]["glyphs"]) == ("font", "available", "Test Sans", 97)
    # Each Font entry with its characters, its size and how many of them the font has.
    assert sans["requiredBy"] == [
        {"descriptor": "RssFontsData.json", "line": 5, "type": "Font", "id": "FONT_SANS", "chars": "[U+0020-U+007E][U+20AC]", "size": 25,
         "coverage": {"declared": 96, "covered": 96, "missing": [], "missingCount": 0}},
        {"descriptor": "RssFontsData.json", "line": 11, "type": "Font", "id": "FONT_SANS_CYRILLIC", "chars": "[U+0410-U+0412]", "size": 40,
         "coverage": {"declared": 3, "covered": 0, "missing": [0x410, 0x411, 0x412], "missingCount": 3}},
    ]
    # A font that nothing declares is described too; a bitmap font has no characters to check.
    assert (rows["spare.otf"]["category"], rows["spare.otf"]["font"]["format"]) == ("supplementary", "OpenType (CFF)")
    digits = rows["digits.png"]
    assert digits["type"] == "texture" and "coverage" not in digits["requiredBy"][0] and digits["requiredBy"][0]["size"] == 32


def test_the_api_serves_fonts_and_describes_them_with_the_declared_characters(tmp_path):
    game = write_game(tmp_path)
    gda = tmp_path / "gda"
    gda.mkdir()
    (gda / "sans.ttf").write_bytes(build_font(LATIN, version="Version 2.000"))
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda)}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        served = client.get("/api/rss-sync/preview", params={"file": str((game / "sans.ttf").resolve())})
        assert served.status_code == 200 and served.headers["content-type"] == "font/ttf"
        assert served.content == (game / "sans.ttf").read_bytes()
        # With the font's names and the samples it can draw, for the page that draws text with it.
        facts = json.loads(unquote(served.headers["x-font-facts"]))
        assert facts["family"] == "Test Sans" and [sample["script"] for sample in facts["samples"]] == ["Latin", "Currencies"]
        digits = client.get("/api/rss-sync/preview", params={"file": str((game / "digits.png").resolve())})
        assert "x-font-facts" not in digits.headers
        assert client.get("/api/rss-sync/preview", params={"file": str((game / "spare.otf").resolve())}).headers["content-type"] == "font/otf"
        files = [str((game / "sans.ttf").resolve()), str((gda / "sans.ttf").resolve())]
        details = client.post("/api/rss-sync/details", headers=session_headers(client), json={"files": files, "chars": ["[U+0020-U+007E][U+20AC]"]}).json()["files"]
        game_font, gda_font = (details[file] for file in files)
        assert (game_font["font"]["version"], gda_font["font"]["version"]) == ("Version 1.000", "Version 2.000")
        # The GDA font lacks the euro sign that the Font entry declares.
        assert game_font["coverage"] == [{"declared": 96, "covered": 96, "missing": [], "missingCount": 0}]
        assert gda_font["coverage"] == [{"declared": 96, "covered": 95, "missing": [0x20AC], "missingCount": 1}]
