"""Workflow tests in a real browser. They share one backend and run in order."""

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend, poll
from tests.fixtures.bc7_dds import create_bc7_dds

pytestmark = pytest.mark.e2e


@pytest.fixture(scope="module")
def backend(tmp_path_factory, browser):
    server = Backend(tmp_path_factory.mktemp("gda-e2e") / "app")
    # Keep one app page open between tests so the backend never sees its last page close.
    keeper = browser.new_context()
    keeper.new_page().goto(server.url)
    poll(server.pages, 1)
    yield server
    keeper.close()
    server.stop()


@pytest.fixture
def page(new_context, backend):
    return new_context(base_url=backend.url).new_page()


def natural_size(image):
    return image.evaluate("img => [img.naturalWidth, img.naturalHeight]")


def select_workspace(page):
    page.get_by_role("list", name="Workspaces").get_by_role("button").first.click()


def open_library(page):
    page.goto("/")
    expect(page.get_by_role("heading", name="Keep game resources in sync with the GDA")).to_be_visible()
    select_workspace(page)
    page.get_by_role("button", name="Asset library", exact=True).click()
    expect(page.get_by_role("region", name="Workspace summary")).to_be_visible()


def generate_report(page):
    page.get_by_role("region", name="Workspace summary").get_by_role("button", name="Rescan", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("Asset report generated")


def test_renders_an_offline_asset_library_and_searches_and_filters_actual_files(page, backend):
    errors, requests = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: None if request.url.startswith(backend.url) else requests.append(request.url))
    open_library(page)
    # The library shows the newest asset report, and there is none yet.
    expect(page.get_by_role("heading", name="No asset report yet")).to_be_visible()
    generate_report(page)
    # The demo game has no descriptors: its 4 PNG and 2 DDS files are supplementary.
    expect(page.locator(".asset-card")).to_have_count(6)
    page.evaluate("() => document.fonts.ready")
    expect(page.locator(".asset-card img").first).to_be_visible()
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / "preview-desktop.png"), full_page=True)
    page.get_by_role("textbox", name="Search assets").fill("fern")
    expect(page.locator(".asset-card")).to_have_count(1)
    page.get_by_role("button", name="Clear search").click()
    page.get_by_role("textbox", name="Search assets").fill(".dds")
    expect(page.locator(".asset-card")).to_have_count(2)
    page.get_by_role("button", name="Inspect limestone_normal.dds").click()
    details = page.get_by_role("dialog", name="limestone_normal.dds")
    expect(details.get_by_role("row").filter(has_text="Resolution")).to_have_text("Resolution512 × 512")
    preview = details.get_by_role("img", name="limestone_normal.dds preview", exact=True)
    expect(preview).to_be_visible()
    poll(lambda: natural_size(preview)[0], 512)
    page.keyboard.press("Escape")
    page.get_by_role("button", name="Clear search").click()
    page.get_by_role("group", name="Filter by status").get_by_role("button", name="Available").click()
    expect(page.get_by_role("heading", name="No assets found")).to_be_visible()
    page.get_by_role("button", name="Show all assets").click()
    expect(page.locator(".asset-card")).to_have_count(6)
    assert errors == []
    assert requests == []


def test_dashboard_summarizes_the_workspace_with_the_template_charts(page):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("/")
    expect(page.get_by_role("heading", name="Keep game resources in sync with the GDA")).to_be_visible()
    for title in ("Library Statistics Overview", "Asset Mix", "Storage Overview", "Combined Workspace Metrics", "Waiting for Sync"):
        expect(page.get_by_role("heading", name=title)).to_be_visible()
    expect(page.locator(".dashboard-stats h3").first).to_have_text("18")
    for chart in ("Total assets over time", "GDA changes and synced files over time", "Files per format in sync and waiting for sync",
                  "Library size as files were added", "Storage per folder by sync status", "Files in sync per asset type", "56% of files in sync"):
        expect(page.get_by_role("img", name=chart)).to_be_visible()
    poll(lambda: page.locator("canvas").evaluate_all("canvases => canvases.every(canvas => canvas.width > 0)"), True)
    month = page.get_by_role("tab", name="1M")
    month.click()
    expect(month).to_have_attribute("aria-selected", "true")
    expect(page.get_by_text("GDA changes and files synced to the game, last 30 days")).to_be_visible()
    page.get_by_role("button", name="By size").click()
    page.get_by_role("button", name="By files", exact=True).click()
    expect(page.get_by_text("Files per top-level folder, by sync status.")).to_be_visible()
    page.get_by_role("table").get_by_role("cell", name="wooden_crate.obj").click()
    # The asset library opens with a search for the file.
    expect(page.get_by_role("textbox", name="Search assets")).to_have_value("wooden_crate.obj")
    assert errors == []


def test_supports_list_view_previews_keyboard_shortcuts_and_a_mobile_layout(page):
    open_library(page)
    expect(page.locator(".asset-card")).to_have_count(6)
    page.get_by_role("button", name="List view", exact=True).click()
    expect(page.locator(".asset-list")).to_be_visible()
    page.get_by_role("button", name="Inspect oak_bark_albedo.png").click()
    expect(page.get_by_role("dialog", name="oak_bark_albedo.png")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog")).not_to_be_visible()
    page.keyboard.press("Control+k")
    expect(page.get_by_role("textbox", name="Search assets")).to_be_focused()
    page.get_by_role("button", name="Grid view", exact=True).click()
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path=str(BUILD / "preview-mobile.png"), full_page=True)
    assert page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth")


def test_validates_workspace_folders_and_saves_a_project_configuration(page):
    page.goto("/")
    select_workspace(page)
    page.get_by_role("banner").get_by_role("button", name="Workspace settings", exact=True).click()
    source = page.get_by_label("GDA path", exact=True).input_value()
    destination = page.get_by_label("Game path", exact=True).input_value()
    page.get_by_label("Game path", exact=True).fill(source)
    page.get_by_role("button", name="Save workspace").click()
    expect(page.get_by_role("status")).to_contain_text("must be separate")
    page.get_by_label("Game path", exact=True).fill(destination)
    page.get_by_label("Project name", exact=True).fill("Verdant Studio")
    page.get_by_role("button", name="Save workspace").click()
    # Saving opens the Asset library, and the new name stays after a reload.
    navigation = page.get_by_role("navigation", name="Main navigation")
    expect(navigation.get_by_role("button", name="Asset library", exact=True)).to_have_attribute("aria-current", "page")
    expect(page.get_by_role("banner")).to_contain_text("Verdant Studio")
    page.reload()
    expect(page.get_by_role("list", name="Workspaces").get_by_role("button", name="Verdant Studio", exact=True)).to_be_visible()


def test_loads_a_dx10_bc7_asset_in_the_catalog_inspector_and_enlarged_preview(page, backend):
    game = backend.get("/api/library")["config"]["destination"]
    assert "gda-e2e" in game
    with open(f"{game}/textures/forest/k_active_en.dds", "wb") as handle:
        handle.write(create_bc7_dds(136, 134))
    open_library(page)
    generate_report(page)
    page.get_by_role("textbox", name="Search assets").fill("k_active_en.dds")
    expect(page.locator(".asset-card")).to_have_count(1)
    page.get_by_role("button", name="Inspect k_active_en.dds").click()
    details = page.get_by_role("dialog", name="k_active_en.dds")
    expect(details.get_by_text("BC7_UNORM", exact=True)).to_be_visible()
    image = details.get_by_role("img", name="k_active_en.dds preview", exact=True)
    poll(lambda: natural_size(image), [136, 134])
    expect(image).to_have_css("object-fit", "contain")
    expect(image).to_have_css("filter", "none")
    page.keyboard.press("Escape")
    expect(page.locator(".asset-card img")).to_have_css("object-fit", "contain")


def test_a_new_report_recovers_a_failed_dds_thumbnail_without_changing_the_file(page, backend):
    game = backend.get("/api/library")["config"]["destination"]
    with open(f"{game}/textures/forest/k_active_en.dds", "rb") as handle:
        original = handle.read()
    failing = {"active": True}

    def handle(route):
        if failing["active"]:
            route.fulfill(status=503, content_type="application/json", body='{"error":"Temporary preview failure"}')
        else:
            route.continue_()

    page.route("**/api/rss-sync/preview?file=*k_active_en.dds*", handle)
    open_library(page)
    page.get_by_role("textbox", name="Search assets").fill("k_active_en.dds")
    card = page.locator(".asset-card")
    expect(card).to_have_count(1)
    expect(card.locator(".generic-preview")).to_be_visible()
    failing["active"] = False
    # A new report is a new revision of the previews, so the failed one loads again.
    generate_report(page)
    poll(lambda: natural_size(card.locator("img"))[0], 136)
    with open(f"{game}/textures/forest/k_active_en.dds", "rb") as handle:
        assert handle.read() == original


def test_renews_an_expired_server_session_and_retries_the_rejected_request_once(page):
    calls = {"reports": 0, "sessions": 0}

    def count_session(route):
        calls["sessions"] += 1
        route.continue_()

    def reject_first_report(route):
        if route.request.method != "POST":
            return route.continue_()
        calls["reports"] += 1
        if calls["reports"] == 1:
            route.fulfill(status=403, content_type="application/json", body='{"error":"Invalid session. Reload the application."}')
        else:
            route.continue_()

    page.route("**/api/session", count_session)
    page.route("**/api/asset-report", reject_first_report)
    open_library(page)
    expect(page.locator(".asset-card")).to_have_count(7)
    generate_report(page)
    expect(page.get_by_role("status")).to_contain_text("Asset report generated: 7 assets")
    assert calls["reports"] == 2
    assert calls["sessions"] > 1


def test_stops_the_local_application_and_leaves_a_clear_closed_workspace_screen(page, backend):
    page.goto("/")
    select_workspace(page)
    page.get_by_role("banner").get_by_role("button", name="Workspace settings", exact=True).click()
    page.get_by_role("button", name="Stop application", exact=True).click()
    page.get_by_role("dialog").get_by_role("button", name="Stop application", exact=True).click()
    expect(page.get_by_role("heading", name="Workspace closed.")).to_be_visible()
    assert backend.wait_for_exit(10) == 0
