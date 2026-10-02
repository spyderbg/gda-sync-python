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


def open_library(page):
    page.goto("/")
    expect(page.get_by_role("heading", name="Dashboard")).to_be_visible()
    page.get_by_role("button", name="Asset library", exact=True).click()
    expect(page.get_by_role("heading", name="Asset library")).to_be_visible()


def test_renders_an_offline_asset_library_and_searches_and_filters_actual_files(page, backend):
    errors, requests = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: None if request.url.startswith(backend.url) else requests.append(request.url))
    open_library(page)
    expect(page.locator(".asset-card")).to_have_count(18)
    page.evaluate("() => document.fonts.ready")
    expect(page.locator(".asset-card img").first).to_be_visible()
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / "preview-desktop.png"), full_page=True)
    page.get_by_role("textbox", name="Search assets").fill("moss")
    expect(page.locator(".asset-card")).to_have_count(2)
    page.get_by_role("button", name="Clear search").click()
    page.get_by_role("combobox", name="Filter by file format").select_option("dds")
    expect(page.locator(".asset-card")).to_have_count(3)
    page.get_by_role("button", name="Inspect moss_ground_normal.dds").click()
    expect(page.get_by_role("heading", name="moss_ground_normal.dds")).to_be_visible()
    expect(page.get_by_text("DDS preview supported")).to_be_visible()
    preview = page.locator(".inspector img")
    expect(preview).to_be_visible()
    poll(lambda: natural_size(preview)[0], 512)
    page.get_by_role("combobox", name="Filter by file format").select_option("all")
    page.get_by_role("combobox", name="Filter by status").select_option("new")
    expect(page.locator(".asset-card")).to_have_count(5)
    assert errors == []
    assert requests == []


def test_dashboard_summarizes_the_workspace_with_the_template_charts(page):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("/")
    expect(page.get_by_role("heading", name="Dashboard")).to_be_visible()
    for title in ("Library Statistics Overview", "Asset Mix", "Storage Overview", "Workspace Metrics", "Waiting for Sync"):
        expect(page.get_by_role("heading", name=title)).to_be_visible()
    expect(page.locator(".card-body h3").first).to_have_text("18")
    for chart in ("Total assets over time", "Source changes and synced files over time", "Files per format in sync and waiting for sync",
                  "Library size as files were added", "Storage per folder by sync status", "Files in sync per asset type", "56% of files in sync"):
        expect(page.get_by_role("img", name=chart)).to_be_visible()
    poll(lambda: page.locator("canvas").evaluate_all("canvases => canvases.every(canvas => canvas.width > 0)"), True)
    month = page.get_by_role("tab", name="1M")
    month.click()
    expect(month).to_have_attribute("aria-selected", "true")
    expect(page.get_by_text("Source changes and files synced to GDA, last 30 days")).to_be_visible()
    page.get_by_role("button", name="By size").click()
    page.get_by_role("button", name="By files", exact=True).click()
    expect(page.get_by_text("Files per top-level folder, by sync status.")).to_be_visible()
    page.get_by_role("table").get_by_role("cell", name="wooden_crate.obj").click()
    expect(page.get_by_role("heading", name="wooden_crate.obj")).to_be_visible()
    assert errors == []


def test_supports_list_view_previews_keyboard_shortcuts_and_a_mobile_layout(page):
    open_library(page)
    expect(page.locator(".asset-card")).to_have_count(18)
    page.get_by_role("button", name="List view", exact=True).click()
    expect(page.locator(".asset-list")).to_be_visible()
    page.get_by_role("button", name="Enlarge moss_ground_albedo.png preview").click()
    expect(page.get_by_role("dialog")).to_be_visible()
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
    page.get_by_role("button", name="Workspace settings", exact=True).click()
    source = page.get_by_label("Source folder", exact=True).input_value()
    destination = page.get_by_label("GDA destination", exact=True).input_value()
    page.get_by_label("GDA destination", exact=True).fill(source)
    page.get_by_role("button", name="Save connection").click()
    expect(page.get_by_role("status")).to_contain_text("must be separate")
    page.get_by_label("GDA destination", exact=True).fill(destination)
    page.get_by_label("Project name", exact=True).fill("Verdant Studio")
    page.get_by_role("button", name="Save connection").click()
    expect(page.get_by_role("heading", name="Asset library")).to_be_visible()
    page.reload()
    expect(page.locator(".sidebar .profile-name")).to_have_text("Verdant Studio")


def test_selection_sync_changes_file_status_and_appears_in_activity_history(page):
    open_library(page)
    page.get_by_role("checkbox", name="Select moss_ground_albedo.png", exact=True).check()
    page.get_by_role("button", name="Sync selected").click()
    expect(page.get_by_role("dialog")).to_be_visible()
    page.get_by_role("button", name="Sync 1 asset", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("1 asset synced")
    card = page.locator(".asset-card").filter(has=page.get_by_role("button", name="Inspect moss_ground_albedo.png", exact=True))
    expect(card).to_contain_text("In sync")
    page.get_by_role("button", name="Sync activity", exact=True).click()
    expect(page.get_by_text("Synced 1 asset to GDA")).to_be_visible()
    page.get_by_text("View 1 files", exact=True).click()
    expect(page.get_by_text("textures/forest/moss_ground_albedo.png", exact=True)).to_be_visible()


def test_syncing_all_pending_makes_the_workspace_current_including_after_reload(page):
    page.goto("/")
    page.get_by_role("button", name="Sync all pending").click()
    page.get_by_role("button", name="Sync 7 assets", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("7 assets synced")
    page.get_by_role("button", name="Needs sync").click()
    expect(page.get_by_role("heading", name="All caught up.")).to_be_visible()
    page.reload()
    page.get_by_role("button", name="Needs sync").click()
    expect(page.get_by_role("heading", name="All caught up.")).to_be_visible()
    page.get_by_role("button", name="Rescan", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("18 assets found")


def test_loads_a_dx10_bc7_asset_in_the_catalog_inspector_and_enlarged_preview(page, backend):
    source = backend.get("/api/library")["config"]["source"]
    assert "gda-e2e" in source
    with open(f"{source}/textures/forest/k_active_en.dds", "wb") as handle:
        handle.write(create_bc7_dds(136, 134))
    page.goto("/")
    page.get_by_role("textbox", name="Search assets").fill("k_active_en.dds")
    expect(page.locator(".asset-card")).to_have_count(1)
    page.get_by_role("button", name="Inspect k_active_en.dds").click()
    expect(page.get_by_text("BC7_UNORM", exact=True)).to_be_visible()
    expect(page.get_by_text("DDS preview supported")).to_be_visible()
    image = page.locator(".inspector img")
    poll(lambda: natural_size(image), [136, 134])
    expect(image).to_have_css("object-fit", "contain")
    expect(image).to_have_css("filter", "none")
    expect(page.locator(".asset-card img")).to_have_css("object-fit", "contain")
    page.get_by_role("button", name="Enlarge k_active_en.dds preview").click()
    expect(page.get_by_role("dialog").get_by_role("img", name="k_active_en.dds preview", exact=True)).to_be_visible()
    page.keyboard.press("Escape")


def test_rescan_recovers_a_failed_dds_thumbnail_without_changing_the_source_file(page, backend):
    asset = next(asset for asset in backend.get("/api/library")["assets"] if asset["name"] == "k_active_en.dds")
    failing = {"active": True}

    def handle(route):
        if failing["active"]:
            route.fulfill(status=503, content_type="application/json", body='{"error":"Temporary preview failure"}')
        else:
            route.continue_()

    page.route(f"**/api/assets/{asset['id']}/preview?*", handle)
    page.goto("/")
    page.get_by_role("textbox", name="Search assets").fill("k_active_en.dds")
    page.get_by_role("button", name="Inspect k_active_en.dds", exact=True).click()
    expect(page.get_by_text("No image preview available", exact=True)).to_be_visible()
    expect(page.locator(".asset-card img")).to_have_count(0)
    failing["active"] = False
    page.get_by_role("button", name="Rescan", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("19 assets found")
    poll(lambda: natural_size(page.locator(".inspector img"))[0], 136)
    poll(lambda: natural_size(page.locator(".asset-card img"))[0], 136)
    expect(page.get_by_text("No image preview available", exact=True)).not_to_be_visible()
    rescanned = next(item for item in backend.get("/api/library")["assets"] if item["name"] == "k_active_en.dds")
    assert rescanned["modifiedAt"] == asset["modifiedAt"]


def test_renews_an_expired_server_session_and_retries_the_rejected_rescan_once(page):
    calls = {"scans": 0, "sessions": 0}

    def count_session(route):
        calls["sessions"] += 1
        route.continue_()

    def reject_first_scan(route):
        calls["scans"] += 1
        if calls["scans"] == 1:
            route.fulfill(status=403, content_type="application/json", body='{"error":"Invalid session. Reload the application."}')
        else:
            route.continue_()

    page.route("**/api/session", count_session)
    page.route("**/api/scan", reject_first_scan)
    open_library(page)
    expect(page.locator(".asset-card")).to_have_count(19)
    page.get_by_role("button", name="Rescan", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("19 assets found")
    assert calls["scans"] == 2
    assert calls["sessions"] > 1


def test_stops_the_local_application_and_leaves_a_clear_closed_workspace_screen(page, backend):
    page.goto("/")
    page.get_by_role("button", name="Workspace settings", exact=True).click()
    page.get_by_role("button", name="Stop application", exact=True).click()
    page.get_by_role("dialog").get_by_role("button", name="Stop application", exact=True).click()
    expect(page.get_by_role("heading", name="Workspace closed.")).to_be_visible()
    assert backend.wait_for_exit(10) == 0
