"""An image's card on the Sync page shows the GDA images that may show the same picture on one line, right of the copy
arrow: one is chosen by clicking its card, or with Left and Right, the copy arrow and the details use it, and without a
choice the details and Sync all pending use the most likely one. In the details, Left and Right choose another GDA image
and compare the game image with it, without closing them."""

import json
import re
from urllib.parse import quote

import pytest
from playwright.sync_api import expect

from egt_gda_sync.library import Library
from tests.e2e.conftest import BUILD, Backend
from tests.test_image_compare import drawing, edited, write_game

pytestmark = pytest.mark.e2e


@pytest.fixture
def image_backend(tmp_path, browser):
    play = drawing(120)
    game, gda = write_game(tmp_path, {"ui/play.png": play}, {"ui/play.png": drawing(121), "other/play_v2.png": edited(play)})
    home = tmp_path / "app"
    home.mkdir()
    entry = {"id": "images", "game_name": "Images", "game_path": str(game), "gda_path": str(gda), "extensions": [".png"]}
    (home / "workspace.json").write_text(json.dumps({"workspaces": [entry], "defaultWorkspace": "images"}))
    library = Library(str(home))
    library.init()
    assert library.compare_workspace("images")["state"] == "succeeded"
    library.close()
    server = Backend(home)
    yield server, gda
    server.stop()


def test_the_gda_image_to_sync_is_chosen_on_the_card(new_context, image_backend):
    backend, gda = image_backend
    page = new_context().new_page()
    errors, requests = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("**/api/rss-sync/copy", lambda route: (requests.append(route.request.post_data_json), route.abort()))
    described = []
    page.route("**/api/rss-sync/details", lambda route: (described.append(route.request.post_data_json["files"]), route.continue_()))
    page.goto(backend.url)
    page.get_by_role("list", name="Workspaces").get_by_role("button", name="Images", exact=True).click()

    # Both GDA images are on one line, the most likely first; nothing is chosen, so the copy arrow waits.
    candidates = page.locator(".resource-candidate")
    expect(candidates).to_have_count(2)
    expect(candidates.nth(0)).to_contain_text("play_v2.png")
    expect(candidates.nth(1)).to_contain_text("Same name")
    # The GDA images' cards are the size of the game image's card, side by side.
    game_card = page.locator(".resource-card.is-matching .resource-game").bounding_box()
    first, second = (candidates.nth(index).bounding_box() for index in range(2))
    assert {(box["y"], box["width"], box["height"]) for box in (game_card, first, second)} == {(game_card["y"], game_card["width"], game_card["height"])}
    assert game_card["x"] < first["x"] < second["x"]
    # Only the GDA images scroll, right of the copy arrow.
    arrow = page.locator(".resource-card.is-matching .resource-operation").bounding_box()
    assert page.locator(".resource-candidates").bounding_box()["x"] >= arrow["x"] + arrow["width"]
    expect(page.get_by_role("button", name="Select a GDA image to copy over ui/play.png", exact=True)).to_be_disabled()

    # Without a choice, the details compare the game image with the most likely GDA image only.
    page.get_by_role("button", name="Show details for play.png", exact=True).click()
    dialog = page.get_by_role("dialog")
    expect(dialog.locator(".details-match")).to_have_count(1)
    expect(dialog.locator(".details-match")).to_contain_text("other/play_v2.png")
    expect(dialog).to_contain_text("GDA image, copied on sync")
    expect(dialog).not_to_contain_text(str((gda / "ui" / "play.png").resolve()))
    expect(dialog.locator(".details-candidate-position")).to_have_text("1 of 2 · Left and Right change it")

    # Right chooses the next GDA image: the details stay open, and compare the game image with it. Only the new image's
    # facts are read.
    same_name, renamed = (str((gda / name).resolve()) for name in ("ui/play.png", "other/play_v2.png"))
    gda_preview = dialog.locator(".details-preview").nth(1).locator("img")
    page.keyboard.press("ArrowRight")
    expect(dialog).to_be_visible()
    expect(dialog.locator(".details-candidate-position")).to_have_text("2 of 2 · Left and Right change it")
    expect(dialog.locator(".details-match")).to_have_count(1)
    expect(dialog.locator(".details-match")).to_contain_text("ui/play.png")
    expect(dialog.locator(".details-match")).not_to_contain_text("play_v2.png")
    # The GDA image's path is shown relative to its folder, with the full path as its tooltip.
    expect(dialog.get_by_title(same_name, exact=True).first).to_be_visible()
    expect(gda_preview).to_have_attribute("src", re.compile(re.escape(f"/api/rss-sync/preview?file={quote(same_name, safe='')}&")))
    expect(candidates.nth(1)).to_contain_text("Copied on sync")
    assert described[-1] == [same_name] and renamed in described[0]
    page.keyboard.press("ArrowRight")  # The last image stays.
    expect(dialog.locator(".details-candidate-position")).to_have_text("2 of 2 · Left and Right change it")
    page.keyboard.press("ArrowLeft")
    expect(dialog).to_be_visible()
    expect(dialog.locator(".details-match")).to_contain_text("other/play_v2.png")
    expect(gda_preview).to_have_attribute("src", re.compile(re.escape(f"/api/rss-sync/preview?file={quote(renamed, safe='')}&")))
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog")).to_have_count(0)
    expect(candidates.nth(0)).to_contain_text("Copied on sync")

    # Sync all pending copies the most likely image.
    page.get_by_role("button", name="Sync all pending").click()
    expect(dialog.locator(".sync-file-list")).to_contain_text("from other/play_v2.png")
    dialog.get_by_role("button", name="Cancel", exact=True).click()

    # Choosing the same-named image makes the arrow, the details and Sync all pending use it.
    page.get_by_role("button", name="Choose GDA image ui/play.png for ui/play.png", exact=True).click()
    arrow = page.get_by_role("button", name="Copy GDA image ui/play.png over game file ui/play.png", exact=True)
    expect(arrow).to_be_enabled()
    expect(candidates.nth(1)).to_contain_text("Copied on sync")
    BUILD.mkdir(exist_ok=True)
    page.wait_for_timeout(500)  # The choice's highlight fades in.
    page.locator(".resource-card").first.screenshot(path=str(BUILD / "resource-image-choice-desktop.png"))
    page.get_by_role("button", name="Show details for play.png", exact=True).click()
    expect(dialog.locator(".details-match")).to_have_count(1)
    expect(dialog.locator(".details-match")).to_contain_text("ui/play.png")
    expect(dialog.locator(".details-match")).not_to_contain_text("play_v2.png")
    page.keyboard.press("Escape")
    page.get_by_role("button", name="Sync all pending").click()
    expect(dialog.locator(".sync-file-list")).to_contain_text("from ui/play.png")
    dialog.get_by_role("button", name="Sync 1 resource", exact=True).click()
    expect(page.get_by_role("dialog")).to_have_count(0)
    assert [list(request["gdaFiles"].values()) for request in requests] == [[str((gda / "ui" / "play.png").resolve())]]

    # Clicking the chosen image again clears the choice.
    page.get_by_role("button", name="Clear the choice of GDA image ui/play.png for ui/play.png", exact=True).click()
    expect(page.get_by_role("button", name="Select a GDA image to copy over ui/play.png", exact=True)).to_be_disabled()

    # The whole card chooses its image, not only its preview: here a click by its status badge.
    box = candidates.nth(0).bounding_box()
    candidates.nth(0).click(position={"x": box["width"] - 20, "y": box["height"] - 15})
    expect(page.get_by_role("button", name="Copy GDA image other/play_v2.png over game file ui/play.png", exact=True)).to_be_enabled()
    # Right and Left choose the next and previous image, and the focus follows the choice.
    page.keyboard.press("ArrowRight")
    expect(page.get_by_role("button", name="Copy GDA image ui/play.png over game file ui/play.png", exact=True)).to_be_enabled()
    expect(page.get_by_role("button", name="Clear the choice of GDA image ui/play.png for ui/play.png", exact=True)).to_be_focused()
    page.keyboard.press("ArrowRight")  # The last image stays chosen.
    expect(page.get_by_role("button", name="Copy GDA image ui/play.png over game file ui/play.png", exact=True)).to_be_enabled()
    page.keyboard.press("ArrowLeft")
    expect(page.get_by_role("button", name="Copy GDA image other/play_v2.png over game file ui/play.png", exact=True)).to_be_enabled()
    assert errors == []
