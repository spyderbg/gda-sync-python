"""Detailed comparison uses native pixels, alpha, tolerance and synchronized mouse pan and zoom."""

from urllib.parse import parse_qs, urlsplit

import numpy as np
import pytest
from playwright.sync_api import expect

from egt_gda_sync.images.png import encode_png
from tests.e2e.conftest import BUILD
from tests.e2e.test_image_choice import image_backend  # noqa: F401 -- shared workspace fixture

pytestmark = pytest.mark.e2e


def open_compare(page, backend, left, right, broken=False):
    """Serve known pixel fixtures through the real preview route, keeping the real report and candidate navigation."""
    def preview(route):
        file = parse_qs(urlsplit(route.request.url).query)["file"][0]
        pixels = left if "/resources/game/" in file else right
        route.fulfill(body=b"broken image" if broken else encode_png(pixels), content_type="image/png")

    page.route("**/api/rss-sync/preview?*", preview)
    page.goto(backend.url)
    page.get_by_role("list", name="Workspaces").get_by_role("button", name="Images", exact=True).click()
    if page.viewport_size["width"] < 992:
        page.get_by_role("link", name="Toggle navigation", exact=True).click()
    page.get_by_role("navigation", name="Main navigation").get_by_role("button", name="Sync", exact=True).click()
    page.get_by_role("button", name="Show details for play.png", exact=True).click()
    page.get_by_role("button", name="Detailed image compare", exact=True).click()
    dialog = page.get_by_role("dialog", name="Detailed image compare", exact=True)
    if broken:
        expect(dialog.get_by_role("alert")).to_contain_text("Cannot load image")
    else:
        expect(dialog.locator(".compare-stats")).to_be_visible()
    return dialog


def test_heatmap_tolerance_mouse_pan_zoom_and_stacked_dialog(new_context, image_backend):
    backend, _ = image_backend
    page = new_context().new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    left = np.full((60, 80, 4), (30, 50, 70, 255), np.uint8)
    right = left.copy()
    right[8:16, 10:20, 0] += 20
    right[30, 40, 3] = 128  # Alpha alone must count.
    left[2, 2], right[2, 2] = (20, 30, 40, 0), (200, 100, 50, 0)  # Invisible RGB does not count.
    dialog = open_compare(page, backend, left, right)
    captions = dialog.locator(".compare-details figcaption")
    for index, label in enumerate(["Game image", "Difference heat map", "GDA image"]):
        expect(captions.nth(index)).to_contain_text(label)
    expect(dialog.get_by_role("spinbutton")).to_have_count(0)
    expect(dialog.locator(".compare-overview")).to_have_count(0)
    expect(dialog.locator(".compare-details canvas")).to_have_count(3)
    expect(dialog.locator(".compare-stats")).to_contain_text("81 of 4,800 pixels differ (1.69%)")
    heatmap = dialog.get_by_label("Difference heat map", exact=True).locator("canvas")
    expect(heatmap).to_have_attribute("width", "80")
    assert heatmap.evaluate("c => Array.from(c.getContext('2d').getImageData(10, 8, 1, 1).data)") != [12, 20, 48, 255]
    assert heatmap.evaluate("c => Array.from(c.getContext('2d').getImageData(2, 2, 1, 1).data)") == [12, 20, 48, 255]

    tolerance = dialog.get_by_role("slider", name="Difference tolerance")
    tolerance.fill("20")
    expect(dialog.locator(".compare-stats")).to_contain_text("1 of 4,800 pixels differ")
    expect(heatmap).to_have_js_property("width", 80)
    page.wait_for_function("() => { const c = document.querySelector('.compare-details figure:nth-child(2) canvas'); return c.getContext('2d').getImageData(10,8,1,1).data[0] === 12; }")
    tolerance.fill("127")
    expect(dialog.locator(".compare-stats")).to_contain_text("0 of 4,800 pixels differ (0.00%)")
    expect(dialog.get_by_role("button", name="Zoom to differences")).to_be_disabled()
    tolerance.fill("0")
    initial_zoom = int(dialog.get_by_role("slider", name="Image zoom").input_value())
    dialog.get_by_role("button", name="Zoom to differences").click()
    expect(dialog.get_by_role("slider", name="Image zoom")).to_have_value("800")
    assert initial_zoom < 800
    expect(heatmap).to_have_attribute("width", "80")  # Zoom never crops away the rest of the image.
    dialog.get_by_role("button", name="Full image", exact=True).click()
    expect(dialog.get_by_role("slider", name="Image zoom")).to_have_value(str(initial_zoom))
    dialog.get_by_role("button", name="1:1", exact=True).click()
    expect(dialog.get_by_role("slider", name="Image zoom")).to_have_value("100")
    dialog.get_by_role("slider", name="Image zoom").fill("800")
    panes = dialog.locator(".compare-viewport")
    # Dragging any pane moves the image itself, keeping every pane at the same position.
    for index in range(3):
        pane = panes.nth(index)
        before = pane.evaluate("el => ({left: el.scrollLeft, top: el.scrollTop})")
        box = pane.bounding_box()
        page.mouse.move(box["x"] + 150, box["y"] + 150)
        page.mouse.down(button="left")
        expect(pane).to_have_css("cursor", "grabbing")
        page.mouse.move(box["x"] + 160, box["y"] + 158, steps=5)
        page.mouse.up(button="left")
        expect(pane).to_have_css("cursor", "grab")
        for synced in range(3):
            expect(panes.nth(synced)).to_have_js_property("scrollLeft", before["left"] - 10)
            expect(panes.nth(synced)).to_have_js_property("scrollTop", before["top"] - 8)

    # Wheel zoom anchors the image pixel under the pointer, rather than jumping to the top left.
    dialog.get_by_role("slider", name="Image zoom").fill("700")
    pane = panes.nth(1)
    box = pane.bounding_box()
    pointer = {"x": box["x"] + 200, "y": box["y"] + 180}
    page.mouse.move(pointer["x"], pointer["y"])
    point_script = "(c, p) => { const b = c.getBoundingClientRect(); return {x: (p.x-b.left)*c.width/b.width, y: (p.y-b.top)*c.height/b.height}; }"
    before = heatmap.evaluate(point_script, pointer)
    page.mouse.wheel(0, -120)
    expect(dialog.get_by_role("slider", name="Image zoom")).to_have_value("800")
    after = heatmap.evaluate(point_script, pointer)
    assert after["x"] == pytest.approx(before["x"], abs=0.2)
    assert after["y"] == pytest.approx(before["y"], abs=0.2)
    for index in [0, 2]:
        expect(panes.nth(index)).to_have_js_property("scrollLeft", pane.evaluate("el => el.scrollLeft"))
        expect(panes.nth(index)).to_have_js_property("scrollTop", pane.evaluate("el => el.scrollTop"))
    page.mouse.wheel(0, 120)
    expect(dialog.get_by_role("slider", name="Image zoom")).not_to_have_value("800")
    # Wheel zoom also works over the source images.
    for index in [0, 2]:
        box = panes.nth(index).bounding_box()
        page.mouse.move(box["x"] + 200, box["y"] + 180)
        page.mouse.wheel(0, -120)
        expect(dialog.get_by_role("slider", name="Image zoom")).to_have_value("800")
        page.mouse.wheel(0, 120)
        expect(dialog.get_by_role("slider", name="Image zoom")).not_to_have_value("800")
    # Arrow keys in compare must not choose another candidate behind it.
    candidate_position = page.locator(".details-candidate-position")
    position = candidate_position.inner_text()
    dialog.get_by_role("button", name="Full image", exact=True).focus()
    page.keyboard.press("ArrowRight")
    expect(candidate_position).to_have_text(position)
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / "detailed-image-compare.png"))
    page.keyboard.press("Escape")
    expect(dialog).to_have_count(0)
    expect(page.get_by_role("dialog")).to_have_count(1)
    expect(page.get_by_role("button", name="Detailed image compare", exact=True)).to_be_focused()
    # Reopening uses the newly selected GDA candidate and closes independently.
    page.keyboard.press("ArrowRight")
    expect(candidate_position).to_contain_text("2 of 2")
    page.get_by_role("button", name="Detailed image compare", exact=True).click()
    expect(dialog.locator(".compare-stats")).to_contain_text("81 of 4,800 pixels differ")
    expect(dialog.locator(".compare-details figure").last).to_contain_text("play.png")
    dialog.get_by_role("button", name="Close compare", exact=True).click()
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog")).to_have_count(0)
    assert errors == []


def test_different_image_sizes_and_mobile_layout(new_context, image_backend):
    backend, _ = image_backend
    page = new_context().new_page()
    page.set_viewport_size({"width": 390, "height": 844})
    left = np.full((60, 80, 4), (30, 50, 70, 255), np.uint8)
    right = np.full((60, 84, 4), (30, 50, 70, 255), np.uint8)
    dialog = open_compare(page, backend, left, right)
    expect(dialog).to_contain_text("Image sizes differ")
    expect(dialog.locator(".compare-stats")).to_contain_text("240 of 5,040 pixels differ (4.76%)")
    dialog.get_by_role("button", name="Zoom to differences").click()
    expect(dialog.get_by_role("spinbutton")).to_have_count(0)
    expect(dialog.locator(".compare-stats")).to_contain_text("240 of 5,040 pixels differ (4.76%)")
    assert dialog.evaluate("el => el.scrollWidth <= el.clientWidth")
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / "detailed-image-compare-mobile.png"))


def test_identical_images_and_preview_failure(new_context, image_backend):
    backend, _ = image_backend
    page = new_context().new_page()
    pixels = np.full((60, 80, 4), (30, 50, 70, 255), np.uint8)
    dialog = open_compare(page, backend, pixels, pixels)
    expect(dialog.locator(".compare-stats")).to_contain_text("0 of 4,800 pixels differ (0.00%)")
    expect(dialog.get_by_role("button", name="Zoom to differences")).to_be_disabled()
    page.close()
    # Use a fresh context so Chromium cannot reuse an already decoded image from its memory cache.
    page = new_context().new_page()
    dialog = open_compare(page, backend, pixels, pixels, broken=True)
    page.keyboard.press("Escape")
    expect(dialog).to_have_count(0)
    expect(page.get_by_role("dialog")).to_have_count(1)
