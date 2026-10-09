"""Views, the .json files of a game's v folder, as cards and details in the Asset library and on the Sync page."""

import json
import re
from pathlib import Path

import pytest
from playwright.sync_api import expect

from egt_gda_sync.library import Library
from tests.e2e.conftest import BUILD, Backend, poll
from tests.test_views import write_game, write_json

pytestmark = pytest.mark.e2e


@pytest.fixture
def view_backend(tmp_path, browser):
    game = write_game(tmp_path)
    # The GDA has another ButtonView, without elements: the game's is different.
    write_json(tmp_path / "gda" / "views" / "ButtonView.json", {"name": "ButtonView", "elements": []})
    home = tmp_path / "app"
    home.mkdir()
    entry = {"id": "views", "game_name": "View game", "game_path": str(game), "gda_path": str(tmp_path / "gda")}
    (home / "workspace.json").write_text(json.dumps({"workspaces": [entry], "defaultWorkspace": "views"}))
    library = Library(str(home))
    library.init()
    assert library.compare_workspace("views")["state"] == "succeeded"
    library.close()
    server = Backend(home)
    yield server
    server.stop()


def drawn(image) -> bool:
    """Whether a view is drawn: its image loaded, or for a view with an Anim that plays, every segment of its render."""
    return image.evaluate("""image => image.tagName.toLowerCase() === 'img' ? image.complete && image.naturalWidth > 0
        : Promise.all([...image.querySelectorAll(':scope > image')].map(part => fetch(part.href.baseVal).then(response => response.ok)))
            .then(results => results.length > 0 && results.every(Boolean))""")


def frames_shown(anim, milliseconds: int = 600) -> list[str]:
    """The frames an Anim of a view's details shows in a while."""
    return anim.evaluate("""(element, milliseconds) => new Promise(resolve => {
        const seen = new Set([element.getAttribute('data-frame')]);
        const timer = setInterval(() => seen.add(element.getAttribute('data-frame')), 5);
        setTimeout(() => { clearInterval(timer); resolve([...seen].sort()); }, milliseconds);
    })""", milliseconds)


def test_views_are_drawn_in_the_asset_library_and_on_the_sync_page(new_context, view_backend):
    page = new_context().new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(view_backend.url)
    page.get_by_role("list", name="Workspaces").get_by_role("button", name="View game", exact=True).click()
    navigation = page.get_by_role("navigation", name="Main navigation")

    # The Asset library's Views section lists every view, drawn, with its name and elements.
    navigation.get_by_role("button", name="Asset library", exact=True).click()
    page.get_by_role("button", name="Rescan").first.click()
    navigation.get_by_role("button", name="ElementsList", exact=True).click()
    cards = page.locator(".report-asset")
    expect(cards).to_have_count(5)
    main = cards.filter(has_text="1920 × 1080 · 10 elements")
    expect(main).to_contain_text("2 elements without their resources")
    poll(lambda: drawn(main.locator(".view-preview img")), True)
    BUILD.mkdir(exist_ok=True)
    main.screenshot(path=str(BUILD / "view-card.png"))

    # The details draw the view at its size, outline its text areas, and outline every element on request.
    main.locator(".asset-hit-target").click()
    dialog = page.get_by_role("dialog")
    poll(lambda: drawn(dialog.locator(".view-stage-image")), True)
    # The Anim plays its three frames, repeating forever, between the still elements drawn before and after it.
    stage = dialog.locator(".view-stage-image")
    expect(stage).to_have_attribute("data-anims", "1")
    expect(stage.locator(":scope > image")).to_have_count(2)
    anim = stage.locator('.view-anim[data-element="anim_glow"]')
    poll(lambda: frames_shown(anim), ["0", "1", "2"])
    expect(dialog.locator(".view-elements tbody tr").filter(has_text="anim_glow")).to_contain_text("3 frames every 40 ms, repeats forever")
    animations = dialog.get_by_role("group", name="Animations")
    animations.get_by_role("button", name="Pause").click()
    assert len(frames_shown(anim, 300)) == 1
    animations.get_by_role("button", name="Replay").click()
    expect(animations.get_by_role("button", name="Pause")).to_be_visible()
    poll(lambda: frames_shown(anim), ["0", "1", "2"])
    expect(dialog.locator(".view-element.is-text")).to_have_count(1)
    expect(dialog.locator(".view-element.is-text text")).to_have_text("text_win")
    # Hide text names keeps a text's area outlined, without its name; picking it in the list shows its name.
    dialog.get_by_role("checkbox", name="Hide the names of text elements").check()
    expect(dialog.locator(".view-element.is-text polygon")).to_be_visible()
    expect(dialog.locator(".view-element.is-text text")).to_have_count(0)
    dialog.get_by_text("10 elements, drawn in this order").click()
    # Every element opens its own source entry, without selecting the row or launching a real editor in the test.
    opened = []
    def open_element(route):
        opened.append(route.request.post_data_json)
        route.fulfill(json={"opened": True})
    page.route("**/api/rss-sync/open-view-element", open_element)
    element_buttons = dialog.locator(".view-elements").get_by_role("button", name="in VS Code")
    expect(element_buttons).to_have_count(10)
    dialog.get_by_role("button", name="Open text_win in VS Code", exact=True).click()
    game_path = view_backend.get("/api/library")["config"]["destination"]
    assert opened == [{"file": f"{game_path}/v/1920x1080/MainView.json", "index": 5}]
    expect(dialog.locator(".view-elements tr.is-picked")).to_have_count(0)
    dialog.locator(".view-elements tbody tr").filter(has_text="text_win").click()
    expect(dialog.locator(".view-element.is-text text")).to_have_text("text_win")
    dialog.locator(".view-elements tbody tr").filter(has_text="text_win").click()
    expect(dialog.locator(".view-element.is-text text")).to_have_count(0)
    dialog.get_by_role("checkbox", name="Hide the names of text elements").uncheck()
    # In the Asset library every drawn element stays under the pointer, to be dragged, but only outlined ones are drawn.
    expect(dialog.locator(".view-element.is-drawn").first).to_have_class(re.compile(r"\bis-quiet\b"))
    dialog.get_by_role("checkbox", name="Outline every element").check()
    expect(dialog.locator(".view-element.is-missing")).to_have_count(2)
    expect(dialog.locator(".view-element.is-drawn").first).not_to_have_class(re.compile(r"\bis-quiet\b"))
    segment = dialog.locator(".view-stage-image > image").first
    hidden_source = segment.get_attribute("href")
    dialog.get_by_role("checkbox", name="Draw the hidden elements").check()
    expect(segment).not_to_have_attribute("href", hidden_source)
    expect(dialog.locator(".details-table")).to_contain_text("Missing resources")
    dialog.screenshot(path=str(BUILD / "view-details.png"))
    page.keyboard.press("Escape")

    # On the Sync page, a different view shows its GDA file's view beside it, and both in its details.
    navigation.get_by_role("button", name="Sync", exact=True).click()
    page.get_by_role("searchbox", name="Search resources not in sync").fill("ButtonView")
    card = page.locator(".resource-card.is-different")
    expect(card).to_have_count(1)
    expect(card.locator(".view-preview")).to_have_count(2)
    poll(lambda: drawn(card.locator(".view-preview img").first), True)
    card.locator(".asset-hit-target").first.click()
    expect(dialog.locator(".view-viewer")).to_have_count(2)
    expect(dialog.locator(".details-table")).to_contain_text("ButtonView")
    assert errors == []


def test_selected_views_are_shown_together_in_one_dialog(new_context, view_backend):
    page = new_context().new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(view_backend.url)
    page.get_by_role("list", name="Workspaces").get_by_role("button", name="View game", exact=True).click()
    navigation = page.get_by_role("navigation", name="Main navigation")
    navigation.get_by_role("button", name="Asset library", exact=True).click()
    page.get_by_role("button", name="Rescan").first.click()

    # Only views can be selected; other assets open one at a time.
    expect(page.locator(".report-asset").first).to_be_visible()
    images = page.locator(".report-asset").filter(has_text="red.png")
    expect(images.get_by_role("checkbox")).to_have_count(0)
    navigation.get_by_role("button", name="ElementsList", exact=True).click()
    main = page.locator(".report-asset").filter(has_text="1920 × 1080 · 10 elements")
    buttons = page.locator(".report-asset").filter(has_text="ButtonView.json")
    # A view that cannot be read cannot be drawn with others.
    expect(page.locator(".report-asset").filter(has_text="Broken.json").get_by_role("checkbox")).to_have_count(0)
    main.get_by_role("checkbox").check()
    show = page.get_by_role("button", name="Show together")
    expect(show).to_be_disabled()
    buttons.get_by_role("checkbox").check()
    expect(page.get_by_role("group", name="Selected views")).to_contain_text("2 views selected")
    expect(buttons.locator(".report-asset-layer")).to_have_text("2")

    # The dialog draws both on one screen, the first selected at the bottom, with their elements.
    show.click()
    dialog = page.get_by_role("dialog", name="2 views")
    stage = dialog.locator(".view-stage-image")
    expect(stage).to_have_count(2)
    expect(stage.nth(0)).to_have_attribute("data-view", "MainView")
    expect(stage.nth(1)).to_have_attribute("data-view", "ButtonView")
    poll(lambda: all(drawn(image) for image in stage.all()), True)
    expect(dialog.locator(".view-stage-overlay > g")).to_have_count(2)
    expect(dialog.locator(".view-elements summary")).to_have_text(["MainView: 10 elements, drawn in this order", "ButtonView: 2 elements, drawn in this order"])
    # A view can be drawn lower, or hidden.
    dialog.get_by_role("button", name="Draw ButtonView lower").click()
    expect(stage.nth(0)).to_have_attribute("data-view", "ButtonView")
    dialog.get_by_role("checkbox", name="Show MainView").uncheck()
    expect(stage).to_have_count(1)
    dialog.get_by_role("checkbox", name="Show MainView").check()
    expect(dialog.locator(".views-details-table tbody tr")).to_have_count(2)
    BUILD.mkdir(exist_ok=True)
    dialog.screenshot(path=str(BUILD / "views-together.png"))
    page.keyboard.press("Escape")

    # A card still opens its own view, and Clear ends the selection.
    main.locator(".asset-hit-target").click()
    expect(page.get_by_role("dialog", name="MainView.json")).to_be_visible()
    page.keyboard.press("Escape")
    page.get_by_role("button", name="Clear").click()
    expect(page.get_by_role("group", name="Selected views")).to_have_count(0)
    assert errors == []


def test_elements_of_a_view_are_moved_in_its_details_and_saved_into_its_file(new_context, view_backend):
    game_path = view_backend.get("/api/library")["config"]["destination"]
    main = Path(game_path) / "v" / "1920x1080" / "MainView.json"
    # The faded image is tinted too: without green.
    view = json.loads(main.read_text())
    view["elements"][2]["color"] = {"r": 255, "g": 0, "b": 255, "a": 128}
    main.write_text(json.dumps(view))
    page = new_context().new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(view_backend.url)
    page.get_by_role("list", name="Workspaces").get_by_role("button", name="View game", exact=True).click()
    navigation = page.get_by_role("navigation", name="Main navigation")
    navigation.get_by_role("button", name="Asset library", exact=True).click()
    page.get_by_role("button", name="Rescan").first.click()
    navigation.get_by_role("button", name="ElementsList", exact=True).click()
    page.locator(".report-asset").filter(has_text="1920 × 1080 · 10 elements").locator(".asset-hit-target").click()
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_role("group", name="Moved elements")).to_contain_text("Drag an element")
    dialog.get_by_text("10 elements, drawn in this order").click()
    x, y = (dialog.get_by_role("button", name=f"{axis} of image_red:") for axis in ("x", "y"))
    expect(x).to_have_text("100")

    # A click types the exact number.
    x.click()
    field = dialog.get_by_role("textbox", name="x of image_red")
    field.fill("130")
    field.press("Enter")
    expect(x).to_have_text("130")
    moved = dialog.get_by_role("group", name="Moved elements")
    expect(moved).to_contain_text("1 element moved")
    # Up and Down step the number, by 10 with Shift; Escape in the field does not close the dialog.
    y.click()
    field = dialog.get_by_role("textbox", name="y of image_red")
    field.press("ArrowUp")
    field.press("Shift+ArrowUp")
    field.press("ArrowDown")
    expect(field).to_have_value("60")
    field.press("Escape")
    expect(y).to_have_text("50")
    expect(dialog).to_be_visible()
    y.click()
    dialog.get_by_role("textbox", name="y of image_red").press("Shift+ArrowDown")
    dialog.get_by_role("textbox", name="y of image_red").press("Enter")
    expect(y).to_have_text("40")
    # Dragging the number changes it a pixel per pixel: left and right for x.
    box = x.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] / 2 + 10, box["y"] + box["height"] / 2, steps=5)
    page.mouse.move(box["x"] + box["width"] / 2 + 25, box["y"] + box["height"] / 2, steps=5)
    page.mouse.up()
    expect(x).to_have_text("155")
    # The moved image is drawn where it is moved to, between the segments of the other elements.
    stage = dialog.locator(".view-stage-image")
    expect(stage.locator('.view-live[data-element="image_red"]')).to_have_count(1)
    expect(stage.locator('.view-live[data-element="image_red"]')).to_have_attribute("transform", "matrix(1 0 0 1 135 30)")
    # A moved element is faded and tinted by its color, like the backend draws it.
    faded_x = dialog.get_by_role("button", name="x of image_faded:")
    faded_x.click()
    dialog.get_by_role("textbox", name="x of image_faded").press("ArrowUp")
    dialog.get_by_role("textbox", name="x of image_faded").press("Enter")
    faded = stage.locator('.view-live[data-element="image_faded"]')
    expect(faded).to_have_attribute("opacity", str(128 / 255))
    tint = stage.locator("filter#" + faded.get_attribute("filter")[5:-1] + " feColorMatrix")
    expect(tint).to_have_attribute("values", "1 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0")
    faded_x.focus()
    page.keyboard.press("Control+z")
    expect(faded_x).to_have_text("500")

    # Dragging an element on the screen moves it by as much of the view's screen as the pointer moves.
    turned = dialog.locator('.view-stage-overlay .view-element[data-element="image_turned"] polygon').first
    turned.scroll_into_view_if_needed()
    area = turned.bounding_box()
    scale = 1920 / dialog.locator(".view-stage").bounding_box()["width"]
    page.mouse.move(area["x"] + area["width"] / 2, area["y"] + area["height"] / 2)
    page.mouse.down()
    page.mouse.move(area["x"] + area["width"] / 2 + 20, area["y"] + area["height"] / 2 + 10, steps=8)
    page.mouse.up()
    turned_x = dialog.get_by_role("button", name="x of image_turned:")
    assert abs(int(turned_x.inner_text()) - (300 + round(20 * scale))) <= 1
    expect(moved).to_contain_text("2 elements moved")
    # Undo takes back the last change, and closing asks before the moves are lost.
    page.keyboard.press("Control+z")
    expect(turned_x).to_have_text("300")
    expect(moved).to_contain_text("1 element moved")
    page.once("dialog", lambda confirm: confirm.dismiss())
    page.keyboard.press("Escape")
    expect(dialog).to_be_visible()
    BUILD.mkdir(exist_ok=True)
    dialog.screenshot(path=str(BUILD / "view-move.png"))

    # Save writes the new position into the view's file.
    moved.get_by_role("button", name="Save").click()
    expect(page.get_by_role("status").filter(has_text="Saved the position of 1 element in MainView")).to_be_visible()
    expect(moved).to_contain_text("Drag an element")
    expect(x).to_have_text("155")
    assert json.loads(main.read_text())["elements"][0]["position"] == {"x": 155, "y": 40}
    expect(stage.locator('.view-live[data-element="image_red"]')).to_have_count(0)
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog")).to_have_count(0)
    assert errors == []
