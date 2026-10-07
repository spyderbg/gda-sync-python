"""RTFs, projects of the RTF Tool: their pages, texts and the files they draw, in the asset report and the preview."""

import json

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.asset_report import inventory
from egt_gda_sync.library import Library, asset_facts
from egt_gda_sync.rss_sync import Config
from egt_gda_sync.rtf import describe_rtf, rtf_layout
from egt_gda_sync.server import create_app
from tests.conftest import session_headers
from tests.fixtures.rtf import write_project


def test_describes_the_pages_languages_and_missing_files_of_a_project(tmp_path):
    project = write_project(tmp_path / "help")
    facts = describe_rtf(str(project))["rtf"]
    data = tmp_path / "help" / "data"
    # The pages in the project's order, with their backgrounds, whether they exist or not.
    assert facts["pages"] == [
        {"id": "keyboard", "width": 1366, "height": 768, "standard": "WXGA", "background": None, "found": False, "sections": 0},
        {"id": "rules", "width": 1920, "height": 1080, "standard": "FHD", "background": str(data / "background.dds"), "found": True, "sections": 3},
        {"id": "wintable", "width": 1920, "height": 1080, "standard": "FHD", "background": str(data / "wintable.dds"), "found": True, "sections": 3},
    ]
    assert (facts["version"], facts["languages"], facts["texts"], facts["styles"]) == ("v1.0.0-664-g235be19", ["English", "Italian"], 6, 3)
    # Each image and video that a page draws once: backgrounds and the ones in texts, also the texts of other tags.
    assert (facts["images"], facts["videos"]) == (5, 1)
    # A background that is not mapped has no path; an image that is mapped but does not exist has its path.
    assert facts["missing"] == [{"kind": "image", "id": "_image_9_", "path": None}, {"kind": "image", "id": "_image_4_", "path": "data/gone.dds"}]
    assert facts["missingCount"] == 2


def test_a_missing_video_folder_is_a_missing_file(tmp_path):
    project = write_project(tmp_path / "help")
    for frame in (tmp_path / "help" / "data" / "videos" / "spin").iterdir():
        frame.unlink()
    facts = describe_rtf(str(project))["rtf"]
    assert facts["missing"][-1] == {"kind": "video", "id": "_video_1_", "path": "data/videos/spin"}
    assert facts["missingCount"] == 3


def test_a_file_that_is_not_a_project_has_an_error(tmp_path):
    (tmp_path / "rich.rtf").write_text(r"{\rtf1\ansi Rich Text}")
    (tmp_path / "other.rtf").write_text(json.dumps({"texts": {}}))
    assert describe_rtf(str(tmp_path / "rich.rtf")) == {"rtfError": "Not an RTF Tool project: the file is not JSON"}
    assert describe_rtf(str(tmp_path / "other.rtf")) == {"rtfError": "Not an RTF Tool project: the file has no pages"}
    assert describe_rtf(str(tmp_path / "absent.rtf"))["rtfError"]
    with pytest.raises(ValueError, match="no pages"):
        rtf_layout(str(tmp_path / "other.rtf"))


def test_lays_out_each_section_with_its_default_text_as_runs(tmp_path):
    project = write_project(tmp_path / "help")
    data = tmp_path / "help" / "data"
    layout = rtf_layout(str(project))
    assert layout["languages"] == ["English", "Italian"]
    pages = {page["id"]: page for page in layout["pages"]}
    rules = pages["rules"]
    # The editor's color of the page, for the outlines of its sections.
    assert (rules["color"], rules["background"], "color" in pages["wintable"]) == ("#0061ff", str(data / "background.dds"), False)
    sections = {section["id"]: section for section in rules["sections"]}
    title = sections["title"]
    assert {key: title[key] for key in ("x", "y", "w", "h", "horizontal", "vertical", "wrap", "style", "variants")} == {
        "x": 160, "y": 80, "w": 1600, "h": 120, "horizontal": "center", "vertical": "middle", "wrap": False, "style": "_style_title_", "variants": 1}
    assert title["texts"]["Italian"] == {"case": "uppercase", "runs": [{"text": "Come giocare"}]}
    # An inline image, a style that follows other characters, a variable the game fills in and one that the dynamics name.
    text = sections["text"]
    assert (text["horizontal"], text["vertical"], text["wrap"]) == ("center", "middle", True)
    assert text["texts"]["English"]["runs"] == [
        {"text": "Wins pay "}, {"image": str(data / "logo.png"), "id": "_image_3_", "found": True, "scale": 1.0},
        {"text": " left to right on the 2"}, {"text": "nd", "style": "_superscript_"}, {"text": " reel.\nSerial "},
        {"variable": "_serial_number_", "style": "_style_text_"}, {"text": " · code "},
        {"variable": "_certification_code_", "style": "_style_text_", "value": "ABC-123"},
    ]
    footer = sections["footer"]
    assert (footer["horizontal"], footer["vertical"]) == ("left", "bottom")
    assert footer["texts"]["English"]["runs"][:2] == [{"image": str(data / "gone.dds"), "id": "_image_4_", "found": False, "scale": 1.0}, {"text": " ALL PRIZES IN "}]
    assert footer["texts"]["English"]["runs"][2] == {"text": "CREDITS", "style": "_style_title_"}

    wintable = {section["id"]: section for section in pages["wintable"]["sections"]}
    # A paytable figure is the same in every language; the game computes its win.
    assert wintable["bell_x3"]["texts"] == {"English": {"runs": [{"figure": "3× bell"}]}, "Italian": {"runs": [{"figure": "3× bell"}]}}
    # A video draws its first frame, from the frames in its folder.
    assert wintable["spin"]["texts"]["English"]["runs"] == [{"video": str(data / "videos" / "spin" / "spin_00000.png"), "id": "_video_1_", "found": True,
                                                             "frames": 3, "fps": 25.0, "scale": 5.0}]
    # Of a section's texts for different tags, the one without tags.
    prizes = wintable["prizes"]
    assert (prizes["variants"], prizes["texts"]["English"]["runs"], prizes["horizontal"], prizes["vertical"]) == (
        2, [{"text": "ALL PRIZES SHOWN IN CREDITS"}], "left", "top")


def test_lays_out_the_styles_that_the_sections_use(tmp_path):
    styles = rtf_layout(str(write_project(tmp_path / "help")))["styles"]
    assert list(styles) == ["_style_text_", "_style_title_", "_superscript_"]
    assert styles["_style_text_"] == {"face": "Regular", "weight": 400, "size": 40.0, "fill": ["#ffffff"], "letterSpacing": 0.0, "lineSpacing": 0.0}
    # A gradient from top to bottom, an outline and a shadow; the advances, the outline and the shadow offsets are drawn
    # at the point size, 160, so at the size of 80 they are half as large.
    assert styles["_style_title_"] == {
        "face": "Black", "weight": 900, "size": 80.0, "fill": ["#fff63e", "#ff8c00"], "letterSpacing": 1.0, "lineSpacing": -0.5,
        "outline": {"color": "#281400", "width": 1.5}, "shadow": {"color": "#000000a0", "x": 0.75, "y": 1.0, "blur": 0.5}}


def test_the_asset_report_lists_an_rtf_as_its_folder_with_every_file(tmp_path):
    game = tmp_path / "resources" / "example"
    project = write_project(game / "help")
    folder = game / "help"
    (folder / "translations.xlsx").write_bytes(b"xlsx")
    for number in range(3, 6):
        (folder / "data" / "videos" / "spin" / f"spin_{number:05d}.png").write_bytes(b"frame")
    (game / "loose.dds").write_bytes(b"dds")
    (game / "notes.rtf").write_text(r"{\rtf1 not a project}")
    write_project(game / "spare")
    (game / "old" / "data").mkdir(parents=True)
    (game / "old" / "data" / "page.dds").write_bytes(b"dds")
    (game / "RssRtfsData.json").write_text(json.dumps({"rtfs": [
        {"id": "rtf_common_default", "path": "help/project.rtf"},
        {"id": "rtf_common_ares", "path": "help/project.rtf", "integration": "ares"},
        {"id": "rtf_old", "path": "old/project.rtf"},
        {"id": "rtf_gone", "path": "gone/project.rtf"},
    ]}, indent=2))
    (game / "RssImagesData.json").write_text(json.dumps({"images": [{"id": "LOGO", "path": "help/data/logo.png"}]}, indent=2))
    config = Config(resources_dir=game.parent.resolve(), gda_dir=game.parent, extensions=frozenset({".rtf", ".dds", ".png"}), game=game.name)
    result = inventory(config, asset_facts)
    rows = {row["resource"]: row for row in result["assets"]}
    # The files in an RTF's folder, numbered images too, are not assets of their own, but a declared one is. A .rtf file
    # in the game folder itself is a file: its folder would hold the whole game.
    assert [(name, row["type"], row["category"]) for name, row in rows.items()] == [
        ("gone", "rtf", "missing"), ("help", "rtf", "available"), ("help/data/logo.png", "texture", "available"),
        ("loose.dds", "texture", "supplementary"), ("notes.rtf", "rtf", "supplementary"), ("old", "rtf", "missing"),
        ("spare", "rtf", "supplementary")]
    assert rows["notes.rtf"]["rtfError"] == "Not an RTF Tool project: the file is not JSON"

    # An RTF is named by its folder, with every file in it, the entries that declare its .rtf file and its pages.
    row = rows["help"]
    files = sorted(path for path in folder.rglob("*") if path.is_file())
    assert (row["resourcePath"], row["directory"]["project"], row["size"]) == (str(folder), str(project), sum(path.stat().st_size for path in files))
    assert [file["path"] for file in row["directory"]["files"]] == [
        "data/background.dds", "data/logo.png", *(f"data/videos/spin/spin_{number:05d}.png" for number in range(6)), "data/wintable.dds",
        "project.rtf", "translations.xlsx"]
    background = row["directory"]["files"][0]
    assert background["resourcePath"] == str(folder / "data" / "background.dds") and background["type"] == "texture"
    assert background["dimensions"]["width"] == 64 and background["modifiedAt"].endswith("Z")
    assert row["directory"]["files"][-1].keys() == {"path", "resourcePath", "type", "size", "modifiedAt"}
    assert [(use["type"], use["id"]) for use in row["requiredBy"]] == [("Rtf", "rtf_common_default"), ("Rtf", "rtf_common_ares")]
    assert row["rtf"] == describe_rtf(str(project))["rtf"]
    assert (rows["spare"]["requiredBy"], rows["spare"]["rtf"]["pages"][1]["id"]) == ([], "rules")
    # A declared .rtf file that does not exist: its folder's files, if it has any, and no pages.
    assert [file["path"] for file in rows["old"]["directory"]["files"]] == ["data/page.dds"] and "rtf" not in rows["old"]
    assert (rows["gone"]["directory"]["files"], "size" in rows["gone"]) == ([], False)
    assert result["summary"]["types"] == {"rtf": 5, "texture": 2}
    # Each file once, though logo.png is an asset of its own and a file of an RTF.
    every = [path for path in game.rglob("*") if path.is_file() and not path.name.endswith(".json")]
    assert result["summary"]["size"] == sum(path.stat().st_size for path in every)


@pytest.fixture
def client(tmp_path):
    game = tmp_path / "resources" / "example"
    write_project(game / "help")
    (game / "broken.rtf").write_text("not json")
    gda = tmp_path / "gda"
    gda.mkdir()
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda), "extensions": [".rtf"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        client.game = game
        yield client


def test_the_preview_of_an_rtf_is_the_layout_of_its_pages(client):
    session_headers(client)
    project = client.game / "help" / "project.rtf"
    response = client.get("/api/rss-sync/preview", params={"file": str(project)})
    assert response.status_code == 200 and response.headers["content-type"] == "application/json"
    assert response.json() == rtf_layout(str(project))
    broken = client.get("/api/rss-sync/preview", params={"file": str(client.game / "broken.rtf")})
    assert (broken.status_code, broken.json()["error"]) == (415, "Not an RTF Tool project: the file is not JSON")
    # A page's images are previewed like any other image of the game.
    background = client.get("/api/rss-sync/preview", params={"file": str(client.game / "help" / "data" / "background.dds")})
    assert (background.status_code, background.headers["content-type"]) == (200, "image/png")
