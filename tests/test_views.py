"""Views: the .json files of a game's v folder, described, laid out and drawn as the game's view elements draw them
(egt_gda_sync.views), and listed as their own type by the GDA sync and the asset report."""

import json
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.asset_report import inventory
from egt_gda_sync.library import Library, asset_facts
from egt_gda_sync.png import encode_png
from egt_gda_sync.rss_sync import DEFAULT_EXTENSIONS, Config, compare
from egt_gda_sync.server import create_app
from egt_gda_sync.views import describe_view, is_view, render_view, view_layout, view_resolution, view_root
from tests.conftest import session_headers

RED, GREEN, BLUE = (255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255)


def solid(width: int, height: int, color: tuple[int, int, int, int]) -> np.ndarray:
    return np.full((height, width, 4), color, np.uint8)


def write_png(path: Path, image: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encode_png(image))


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


def write_game(root: Path) -> Path:
    """A game with images, an image sequence and a text style, and views that use them, declared in
    RssElementsListData.json; a copy of the descriptor in the v folder is not a view."""
    game = root / "resources" / "game"
    write_png(game / "art" / "red.png", solid(40, 20, RED))
    write_png(game / "art" / "small.png", solid(10, 10, GREEN))
    write_png(game / "art" / "big.png", solid(30, 30, BLUE))
    write_png(game / "art" / "atlas.png", np.hstack([solid(10, 10, RED), solid(10, 10, BLUE)]))
    for number in range(3):
        write_png(game / "art" / f"frame_{number:02d}.png", solid(16, 8, GREEN))
    write_json(game / "RssImagesData.json", {"images": [
        {"id": "IMAGE_RED", "path": "art/red.png"},
        # One id for two resolutions: a view uses the one for its own.
        {"id": "IMAGE_BUTTON", "path": "art/small.png", "resolution": "1920x1080"},
        {"id": "IMAGE_BUTTON", "path": "art/big.png", "resolution": "1920x1200"},
        {"id": "IMAGE_ATLAS_BLUE", "path": "art/atlas.png", "source": {"x": 10, "y": 0, "w": 10, "h": 10}},
        {"id": "IMAGE_GONE", "path": "art/gone.png"},
    ]})
    write_json(game / "RssImagesSeqData.json", {"imagesSeq": [
        {"id": "ANIM_GLOW", "frameTime": 40, "loopCount": 0, "frames": [{"path": "art/frame_{00-02}.png"}]},
    ]})
    write_json(game / "RssTextStylesData.json", {"styles": [{"id": "STYLE_WIN", "font_id": "FONT_WIN", "size": 32}]})
    # An image font of the ten digits: its first row marks where each 5 pixel wide glyph starts, its glyphs are 8 tall.
    font = np.zeros((9, 61, 4), np.uint8)
    font[0, ::6] = (0, 255, 255, 255)
    for digit in range(10):
        font[1:, digit * 6 + 1:digit * 6 + 6] = BLUE
    write_png(game / "art" / "font_win.png", font)
    write_json(game / "RssFontsData.json", {"fonts": [{"id": "FONT_WIN", "path": "art/font_win.png", "chars": "[U+0030-U+0039]", "size": 8}]})
    views = [{"id": "MainView", "path": "v/1920x1080/MainView.json", "resolution": "1920x1080"},
             {"id": "MainView", "path": "v/1920x1200/MainView.json", "resolution": "1920x1200"},
             {"id": "ButtonView", "path": "v/1920x1080/Buttons/ButtonView.json", "resolution": "1920x1080"}]
    write_json(game / "RssElementsListData.json", {"elements": views})
    write_json(game / "v" / "1920x1080" / "RssElementsListData.json", {"elements": views})
    main = {"name": "MainView", "elements": [
        {"id": "image_red", "type": "Image", "rssKey": "IMAGE_RED", "position": {"x": 100, "y": 50}, "alignment": "MiddleCenter"},
        {"id": "image_turned", "type": "Image", "rssKey": "IMAGE_RED", "position": {"x": 300, "y": 300},
         "pivot": {"x": 0, "y": 0}, "rotation": 90, "scale": {"x": 2, "y": 2}},
        {"id": "image_faded", "type": "Image", "rssKey": "IMAGE_ATLAS_BLUE", "position": {"x": 500, "y": 100},
         "color": {"r": 255, "g": 255, "b": 255, "a": 128}},
        {"id": "image_hidden", "type": "Image", "rssKey": "IMAGE_RED", "position": {"x": 700, "y": 700}, "hidden": True},
        {"id": "anim_glow", "type": "Anim", "rssKey": "ANIM_GLOW", "position": {"x": 900, "y": 100}},
        {"id": "text_win", "type": "Text", "rssStyleId": "STYLE_WIN", "position": {"x": 960, "y": 900}, "alignment": "BottomCenter",
         "fitBox": {"w": 200, "h": 40}},
        {"id": "image_runtime", "type": "Image", "position": {"x": 10, "y": 10}},
        {"id": "image_unknown", "type": "Image", "rssKey": "IMAGE_NOT_DECLARED"},
        {"id": "image_gone", "type": "Image", "rssKey": "IMAGE_GONE"},
        {"id": "dummy_point", "type": "Dummy", "position": {"x": 1000, "y": 500}},
    ]}
    write_json(game / "v" / "1920x1080" / "MainView.json", main)
    write_json(game / "v" / "1920x1200" / "MainView.json", {"name": "MainView", "elements": [
        {"id": "button_play", "type": "Button", "rssKeys": ["IMAGE_BUTTON"], "position": {"x": 0, "y": 0}}]})
    write_json(game / "v" / "1920x1080" / "Buttons" / "ButtonView.json", {"name": "ButtonView", "elements": [
        {"id": "button_play", "type": "Button", "rssKeys": ["IMAGE_BUTTON", "IMAGE_RED"], "position": {"x": 1800, "y": 1000}},
        {"id": "button_area", "type": "Button", "rssKeys": ["DUMMY_AREA"], "position": {"x": 1600, "y": 1000},
         "touchArea": {"x": 0, "y": 0, "w": 100, "h": 50}},
    ]})
    # A view that no descriptor declares, and one that is not JSON.
    write_json(game / "v" / "1920x1080" / "LooseView.json", {"name": "LooseView", "elements": []})
    (game / "v" / "1920x1080" / "Broken.json").write_text("{ not json")
    return game


def decode(png: bytes) -> np.ndarray:
    return cv2.cvtColor(cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA)


def test_a_view_is_a_json_file_of_the_games_v_folder_but_not_a_descriptor(tmp_path):
    game = write_game(tmp_path)
    main = game / "v" / "1920x1080" / "MainView.json"
    assert view_root(main) == game and is_view(main, game)
    assert is_view(game / "v" / "1920x1080" / "Buttons" / "ButtonView.json", game)
    assert not is_view(game / "v" / "1920x1080" / "RssElementsListData.json", game)
    assert not is_view(game / "RssImagesData.json", game) and not is_view(game / "art" / "red.png", game)
    assert view_resolution(main) == (1920, 1080) and view_resolution(game / "v" / "1920x1200" / "MainView.json") == (1920, 1200)


def test_a_views_facts_list_its_elements_and_the_resources_that_cannot_be_found(tmp_path):
    game = write_game(tmp_path)
    facts = describe_view(game / "v" / "1920x1080" / "MainView.json")["view"]
    assert facts["name"] == "MainView" and facts["resolution"] == {"width": 1920, "height": 1080}
    assert facts["elements"] == 10 and facts["types"] == {"Anim": 1, "Dummy": 1, "Image": 7, "Text": 1}
    # The hidden image and the dummy are hidden; red twice, the atlas, the hidden red and the anim's first frame draw.
    assert facts["hidden"] == 2 and facts["images"] == 5
    # An image the game sets at runtime is not missing; an undeclared id and a file that does not exist are.
    assert [(item["id"], item["reason"]) for item in facts["missing"]] == [
        ("image_unknown", "no image has the id IMAGE_NOT_DECLARED"), ("image_gone", "the image file does not exist")]
    assert describe_view(game / "v" / "1920x1080" / "Broken.json")["viewError"].startswith("not valid JSON")


def test_elements_are_placed_as_the_game_places_them(tmp_path):
    game = write_game(tmp_path)
    elements = {element["id"]: element for element in view_layout(game / "v" / "1920x1080" / "MainView.json")["elements"]}
    # Aligned by its middle: a 40 × 20 image at (100, 50) covers 80..120 × 40..60.
    assert elements["image_red"]["corners"] == [[80, 40], [120, 40], [120, 60], [80, 60]]
    # Scaled twice and turned a quarter around its position.
    assert elements["image_turned"]["corners"] == [[300, 300], [300, 380], [260, 380], [260, 300]]
    # An atlas image is the part its source rectangle cuts; an image sequence draws its first frame, of a {N-M} range.
    assert elements["image_faded"]["size"] == [10, 10] and elements["image_faded"]["source"] == [10, 0, 10, 10]
    assert elements["anim_glow"]["frames"] == 3 and elements["anim_glow"]["file"].endswith("frame_00.png")
    # A text's area is its fit box, aligned; its style's size is known.
    assert elements["text_win"]["corners"] == [[860, 860], [1060, 860], [1060, 900], [860, 900]]
    assert elements["text_win"]["fontSize"] == 32 and not elements["text_win"]["drawn"]
    assert elements["image_runtime"]["runtime"] and "reason" not in elements["image_runtime"]
    assert elements["dummy_point"]["hidden"] and elements["image_hidden"]["hidden"]
    # A view uses the entry of an id for its resolution, and a touch area of a button is placed like the button.
    buttons = {element["id"]: element for element in view_layout(game / "v" / "1920x1080" / "Buttons" / "ButtonView.json")["elements"]}
    assert buttons["button_play"]["file"].endswith("small.png")
    assert view_layout(game / "v" / "1920x1200" / "MainView.json")["elements"][0]["file"].endswith("big.png")
    assert buttons["button_area"]["touchOnly"] and not buttons["button_area"]["drawn"] and "reason" not in buttons["button_area"]
    assert buttons["button_area"]["touchArea"] == [[1600, 1000], [1700, 1000], [1700, 1050], [1600, 1050]]


def test_a_view_is_drawn_as_an_image_of_its_screen(tmp_path):
    game = write_game(tmp_path)
    main = game / "v" / "1920x1080" / "MainView.json"
    pixels = decode(render_view(main))
    assert pixels.shape == (1080, 1920, 4)
    assert tuple(pixels[50, 100]) == RED and pixels[5, 5, 3] == 0
    # The turned image covers 260..300 × 300..380.
    assert tuple(pixels[340, 280]) == RED and pixels[340, 310, 3] == 0
    # Half transparent, and the blue part of the atlas.
    assert tuple(pixels[105, 505][:3]) == (0, 0, 255) and abs(int(pixels[105, 505, 3]) - 128) <= 1
    assert tuple(pixels[104, 904]) == GREEN
    # A hidden element is drawn only on request.
    assert pixels[705, 705, 3] == 0 and tuple(decode(render_view(main, hidden=True))[705, 705]) == RED
    # Smaller, and cropped to what it draws: a small view fills its render.
    assert decode(render_view(main, 480)).shape == (270, 480, 4)
    cropped = decode(render_view(game / "v" / "1920x1080" / "Buttons" / "ButtonView.json", 640, crop=True))
    assert cropped.shape[1] < 100 and tuple(cropped[cropped.shape[0] // 2, cropped.shape[1] // 2]) == GREEN
    # Images outside the allowed folders are not drawn.
    outside = view_layout(main, roots=(tmp_path / "elsewhere",))["elements"][0]
    assert not outside["drawn"] and outside["reason"] == "the image is outside the workspace folders"


def test_an_anim_lists_how_its_frames_play_and_its_view_is_drawn_in_segments_around_it(tmp_path):
    game = write_game(tmp_path)
    main = game / "v" / "1920x1080" / "MainView.json"
    anim = next(element for element in view_layout(main)["elements"] if element["id"] == "anim_glow")
    # Every frame, how they play, and the matrix that places them (SVG's matrix(a b c d e f)).
    assert [Path(frame["file"]).name for frame in anim["sequence"]] == ["frame_00.png", "frame_01.png", "frame_02.png"]
    assert (anim["frameTime"], anim["loopCount"], anim["loopTo"]) == (40, 0, None)
    assert anim["placement"] == {"matrix": [1.0, 0.0, 0.0, 1.0, 900.0, 100.0], "alignment": [0.0, 0.0]}
    # The element's own loopCount replaces the sequence's.
    data = json.loads(main.read_text())
    data["elements"][4]["loopCount"] = 2
    main.write_text(json.dumps(data))
    assert next(element for element in view_layout(main)["elements"] if element["id"] == "anim_glow")["loopCount"] == 2
    # The whole view draws the Anim's first frame; segment 0 draws the elements before it, segment 1 those after it.
    whole, before, after = (decode(render_view(main, 1920, segment=segment)) for segment in (None, 0, 1))
    assert tuple(whole[104, 904]) == GREEN and before[104, 904, 3] == 0 and after[104, 904, 3] == 0
    assert tuple(whole[50, 100]) == RED and tuple(before[50, 100]) == RED and after[50, 100, 3] == 0
    with pytest.raises(ValueError, match="the view has 2 segments"):
        render_view(main, 1920, segment=2)


def test_the_gda_sync_compares_views_and_the_asset_report_lists_them_as_their_own_type(tmp_path):
    game = write_game(tmp_path)
    gda = tmp_path / "gda"
    write_json(gda / "views" / "MainView.json", json.loads((game / "v" / "1920x1080" / "MainView.json").read_text()))
    write_json(gda / "views" / "ButtonView.json", {"name": "ButtonView", "elements": []})
    config = Config(tmp_path / "resources", gda, frozenset(DEFAULT_EXTENSIONS), "game")
    result = compare(config)
    rows = {row["resource"]: row for row in result["differences"] + result["identical"] if row["resource"].endswith(".json")}
    # Only views are compared among JSON files: not the descriptors, in the v folder or not.
    assert set(rows) == {"v/1920x1080/MainView.json", "v/1920x1200/MainView.json", "v/1920x1080/Buttons/ButtonView.json",
                         "v/1920x1080/LooseView.json", "v/1920x1080/Broken.json"}
    assert rows["v/1920x1080/MainView.json"]["category"] == "identical" and rows["v/1920x1080/MainView.json"]["view"]["elements"] == 10
    different = rows["v/1920x1080/Buttons/ButtonView.json"]
    assert different["category"] == "different" and different["view"]["elements"] == 2 and different["gdaView"]["elements"] == 0
    assert rows["v/1920x1080/LooseView.json"]["category"] == "supplementary" and "view" in rows["v/1920x1080/LooseView.json"]
    assert rows["v/1920x1080/Broken.json"]["viewError"].startswith("not valid JSON")
    # Both copies of the descriptor declare it.
    assert rows["v/1920x1200/MainView.json"]["requiredBy"] == [
        {"descriptor": name, "line": 10, "type": "Element", "id": "MainView"} for name in ("RssElementsListData.json", "v/1920x1080/RssElementsListData.json")]

    assets = {row["resource"]: row for row in inventory(config, asset_facts)["assets"] if row["type"] == "view"}
    assert set(assets) == set(rows)
    assert assets["v/1920x1080/MainView.json"]["view"]["missingCount"] == 2
    assert assets["v/1920x1080/LooseView.json"]["category"] == "supplementary"


@pytest.fixture
def client(tmp_path):
    game = write_game(tmp_path)
    (tmp_path / "gda").mkdir()
    (tmp_path / "elsewhere").mkdir()
    write_json(tmp_path / "elsewhere" / "v" / "OtherView.json", {"name": "OtherView", "elements": []})
    entry = {"id": "game", "game_name": "Game", "game_path": str(game), "gda_path": str(tmp_path / "gda")}
    (tmp_path / "workspace.json").write_text(json.dumps({"defaultWorkspace": "game", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(tmp_path / "workspace.json"))
    library.init()
    opened = []
    with TestClient(create_app(library, dev=True, code_opener=lambda file, line: opened.append((file, line))), base_url="http://127.0.0.1") as api:
        api.opened = opened
        session_headers(api)
        yield api, game, tmp_path


def test_the_api_draws_a_view_and_lists_its_elements(client):
    api, game, root = client
    main = str((game / "v" / "1920x1080" / "MainView.json").resolve())
    card = api.get("/api/rss-sync/preview", params={"file": main})
    assert card.status_code == 200 and card.headers["content-type"] == "image/png" and decode(card.content).shape == (360, 640, 4)
    large = api.get("/api/rss-sync/preview", params={"file": main, "width": 1920, "hidden": "true"})
    assert decode(large.content).shape == (1080, 1920, 4) and tuple(decode(large.content)[705, 705]) == RED
    # A segment of the still elements, around the Anim that plays, and only the segments the view has.
    assert api.get("/api/rss-sync/preview", params={"file": main, "width": 1920, "segment": 1}).status_code == 200
    assert api.get("/api/rss-sync/preview", params={"file": main, "width": 1920, "segment": 2}).status_code == 415
    layout = api.get("/api/rss-sync/view", params={"file": main}).json()
    assert layout["name"] == "MainView" and len(layout["elements"]) == 10
    # Only views, and only inside the workspace's folders.
    assert api.get("/api/rss-sync/view", params={"file": str(game / "RssImagesData.json")}).status_code == 415
    assert api.get("/api/rss-sync/view", params={"file": str(root / "elsewhere" / "v" / "OtherView.json")}).status_code == 404


def test_the_api_saves_moved_elements_into_the_view_file_and_backs_it_up(client):
    api, game, root = client
    headers = session_headers(api)
    main = game / "v" / "1920x1080" / "MainView.json"
    main.write_text(json.dumps(json.loads(main.read_text()), indent=2) + "\n")
    before = main.read_text()
    layout = api.get("/api/rss-sync/view", params={"file": str(main)}).json()
    # Every element has its placement; a moved element is cut out of the segments, for the page to draw it.
    assert all("placement" in element for element in layout["elements"])
    whole = decode(api.get("/api/rss-sync/preview", params={"file": str(main), "width": 1920}).content)
    cut = decode(api.get("/api/rss-sync/preview", params={"file": str(main), "width": 1920, "segment": 0, "cuts": "0"}).content)
    assert tuple(whole[50, 100]) == RED and cut[50, 100, 3] == 0
    assert api.get("/api/rss-sync/preview", params={"file": str(main), "width": 1920, "segment": 0, "cuts": "a"}).status_code == 400

    endpoint = "/api/rss-sync/view-positions"
    body = {"file": str(main), "revision": layout["revision"], "positions": [{"index": 0, "x": 120, "y": 64.5}, {"index": 9, "x": 3, "y": 4}]}
    assert api.post(endpoint, json=body).status_code == 403
    saved = api.post(endpoint, headers=headers, json=body).json()
    data = json.loads(main.read_text())
    # image_red's numbers change and dummy_point, which had no position, gets one; the rest of the text stays.
    assert data["elements"][0]["position"] == {"x": 120, "y": 64.5} and data["elements"][9]["position"] == {"x": 3, "y": 4}
    assert main.read_text().replace('"x": 120', '"x": 100').replace('"y": 64.5', '"y": 50').splitlines()[:40] == before.splitlines()[:40]
    assert saved["layout"]["elements"][0]["position"] == [120, 64.5] and saved["layout"]["revision"] != layout["revision"]
    assert saved["library"]["activity"][0]["action"] == "edit" and saved["library"]["activity"][0]["message"] == "Moved 2 elements of MainView"
    backups = list(Path(saved["library"]["backupPath"]).rglob("MainView.json"))
    assert len(backups) == 1 and backups[0].read_text() == before
    # A view changed since its layout was read, an element that does not exist, and a GDA view are refused.
    stale = api.post(endpoint, headers=headers, json=body)
    assert stale.status_code == 409 and "changed on disk" in stale.json()["error"]
    missing = api.post(endpoint, headers=headers, json={**body, "revision": saved["layout"]["revision"], "positions": [{"index": 99, "x": 0, "y": 0}]})
    assert missing.status_code == 400 and "no element 100" in missing.json()["error"]
    gda_view = root / "gda" / "v" / "1920x1080" / "GdaView.json"
    gda_view.parent.mkdir(parents=True)
    gda_view.write_text('{"name": "GdaView", "elements": [{"id": "a", "type": "Dummy"}]}')
    gda_layout = api.get("/api/rss-sync/view", params={"file": str(gda_view)}).json()
    refused = api.post(endpoint, headers=headers, json={"file": str(gda_view), "revision": gda_layout["revision"], "positions": [{"index": 0, "x": 1, "y": 1}]})
    assert refused.status_code == 403


def test_open_view_element_uses_current_source_and_rejects_invalid_targets(client):
    api, game, root = client
    file = game / "v" / "1920x1080" / "MainView.json"
    # Repeated and escaped ids, nested elements and non-object entries must not confuse drawing order.
    file.write_text('\ufeff{\n "name": "Test",\n "nested": {"elements": [{"id": "wrong"}]},\n'
                    ' "elements": [null,\n  {"id": "same", "type": "Dummy"},\n'
                    '  {"id": "same", "type": "Text", "text": "braces { and \\"quotes\\""},\n'
                    '  {"id": "escaped\\u005fid", "type": "Image"}\n ]\n}', encoding="utf-8")
    endpoint = "/api/rss-sync/open-view-element"
    body = {"file": str(file), "index": 1}
    assert api.post(endpoint, json=body).status_code == 403
    headers = session_headers(api)
    for index, line in enumerate((5, 6, 7)):
        assert api.post(endpoint, headers=headers, json={**body, "index": index}).json() == {"opened": True}
        assert api.opened[-1] == (str(file), line)
    # A changed file uses its current lines, and a GDA preview opens the GDA copy.
    gda_file = root / "gda" / "v" / "1920x1080" / "MainView.json"
    gda_file.parent.mkdir(parents=True)
    gda_file.write_text('{\n\n "elements": [\n {"id":"gda", "type":"Dummy"}\n ]\n}')
    assert api.post(endpoint, headers=headers, json={"file": str(gda_file), "index": 0}).json() == {"opened": True}
    assert api.opened[-1] == (str(gda_file), 4)
    file.write_text('\n\n' + file.read_text(encoding="utf-8-sig"))
    assert api.post(endpoint, headers=headers, json=body).status_code == 200
    assert api.opened[-1] == (str(file), 8)
    count = len(api.opened)
    for target, index, status in [(file, -1, 400), (file, 3, 404), (game / "RssImagesData.json", 0, 415),
                                  (root / "elsewhere" / "v" / "OtherView.json", 0, 404)]:
        assert api.post(endpoint, headers=headers, json={"file": str(target), "index": index}).status_code == status
    assert len(api.opened) == count
