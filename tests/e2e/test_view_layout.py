"""The layout upload and live transcript, without invoking a live Claude session or editing game files."""

import base64

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend, poll

pytestmark = pytest.mark.e2e


@pytest.fixture
def layout_page(tmp_path, new_context):
    backend = Backend(tmp_path / "app")
    context = new_context(base_url=backend.url)
    page = context.new_page()
    yield page
    # Stop explicitly before the page lifetime shuts the backend down.
    backend.stop()


def test_layout_upload_shows_live_complete_output_and_recovers_it_after_reload(layout_page):
    page = layout_page
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    state = {"running": False, "kind": None, "files": [], "log": [], "result": None, "error": None}
    requests = []
    page.route("**/api/game/agent/status*", lambda route: route.fulfill(json=state))

    def start(route):
        body = route.request.post_data_json
        requests.append(body)
        state.update(running=True, kind="view-layout", files=[body["workspace"]],
                     log=["assistant:\nFirst response.\n" + "x" * 1000 + "\nLast line."])
        route.fulfill(json=state)

    page.route("**/api/game/view-layout", start)
    page.goto("/")
    navigation = page.get_by_role("navigation", name="Main navigation")
    layout_entry = navigation.get_by_role("button", name="View layout", exact=True)
    spinner = layout_entry.locator('.sidebar-running')
    expect(spinner).to_have_count(0)
    names = navigation.get_by_role("button").all_text_contents()
    assert names.index("View layout") == names.index("Tools") + 1
    navigation.get_by_role("button", name="View layout", exact=True).click()
    expect(page.get_by_role("heading", name="View layout", exact=True)).to_be_visible()
    run = page.get_by_role("button", name="Run view-layout", exact=True)
    expect(run).to_be_disabled()
    image = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ1sAAAAASUVORK5CYII=")
    page.get_by_label("Upload preview").set_input_files({"name": "preview.png", "mimeType": "image/png", "buffer": image})
    preview = page.get_by_role("img", name="Selected layout preview")
    expect(preview).to_be_visible()
    assert preview.evaluate("image => image.complete && image.naturalWidth > 0")
    page.get_by_label("Layout instructions (optional)").fill("Main game, BetBarView.")
    expect(run).to_be_enabled()
    run.click()
    output = page.get_by_label("Complete Claude Code output")
    expect(output).to_contain_text("First response.\n" + "x" * 1000 + "\nLast line.")
    expect(page.get_by_role("button", name="Claude Code is running…", exact=True)).to_be_disabled()
    expect(spinner).to_be_visible()
    expect(layout_entry).to_have_attribute('aria-busy', 'true')
    BUILD.mkdir(exist_ok=True)
    navigation.screenshot(path=str(BUILD / 'view-layout-running.png'))
    assert requests[0]["instructions"] == "Main game, BetBarView."
    assert base64.b64decode(requests[0]["image"]) == image

    state["log"].append("Successful tool output.\nFull second line.")
    expect(output).to_contain_text("Full second line.")
    # Leave the page while the task works; returning resumes its output.
    navigation.get_by_role("button", name="Image studio", exact=True).click()
    expect(spinner).to_be_visible()
    state.update(running=False, result={"report": "Moved the bet bar.\nReview the layout in Play.", "turns": 3, "cost": 0.2})
    state["log"].append("Final response: moved the bet bar.")
    expect(spinner).to_have_count(0)
    expect(layout_entry).not_to_have_attribute('aria-busy', 'true')
    navigation.get_by_role("button", name="View layout", exact=True).click()
    expect(output).to_contain_text("First response.")
    expect(preview).to_be_visible()
    expect(page.get_by_text("Execution finished.", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name="Final report")).to_be_visible()
    expect(output).to_contain_text("Final response: moved the bet bar.")
    expect(page.get_by_text("Moved the bet bar.\nReview the layout in Play.", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Run view-layout", exact=True)).to_be_enabled()
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / "view-layout-desktop.png"), full_page=True)

    page.reload()
    navigation.get_by_role("button", name="View layout", exact=True).click()
    expect(output).to_contain_text("First response.")
    expect(output).to_contain_text("Final response: moved the bet bar.")
    page.set_viewport_size({"width": 375, "height": 900})
    # The theme animates the main panel's width and margin when crossing its mobile breakpoint.
    poll(lambda: page.locator('.main-panel').evaluate("panel => panel.getBoundingClientRect().width >= 374"), True)
    expect(output).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.screenshot(path=str(BUILD / "view-layout-mobile.png"), full_page=True)
    assert errors == []


def test_layout_rejects_bad_uploads_and_displays_start_and_execution_errors(layout_page):
    page = layout_page
    state = {"running": False, "kind": None, "files": [], "log": [], "result": None, "error": None}
    requests = []
    page.route("**/api/game/agent/status*", lambda route: route.fulfill(json=state))
    def missing_claude(route):
        requests.append(route.request.post_data_json)
        route.fulfill(status=501, json={"error": "Claude Code is not installed"})

    page.route("**/api/game/view-layout", missing_claude)
    page.goto("/")
    page.get_by_role("button", name="View layout", exact=True).click()
    upload = page.get_by_label("Upload preview")
    upload.set_input_files({"name": "notes.txt", "mimeType": "text/plain", "buffer": b"not an image"})
    expect(page.get_by_role("alert")).to_have_text("Choose a PNG, JPEG or DDS image up to 16 MB.")
    upload.set_input_files({"name": "preview.dds", "mimeType": "image/vnd-ms.dds", "buffer": b"test preview"})
    run = page.get_by_role("button", name="Run view-layout", exact=True)
    expect(run).to_be_enabled()
    run.click()
    expect(page.get_by_role("alert")).to_have_text("Claude Code is not installed")
    state.update(kind="view-layout", files=[requests[0]["workspace"]], log=["Full diagnostic output"], error="Claude Code failed: please sign in")
    page.route("**/api/game/view-layout", lambda route: route.fulfill(json=state))
    run.click()
    expect(page.get_by_text("Execution failed.", exact=True)).to_be_visible()
    expect(page.get_by_label("Complete Claude Code output")).to_contain_text("Full diagnostic output")
    expect(page.get_by_text("Claude Code failed: please sign in", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="View layout", exact=True).locator('.sidebar-running')).to_have_count(0)


def test_layout_spinner_recovers_on_reload_and_only_tracks_the_current_workspaces_layout_task(layout_page):
    page = layout_page
    workspace = page.request.get('/api/library').json()['config'].get('defaultWorkspace') or 'current'
    state = {"running": True, "kind": "view-layout", "files": [workspace]}
    page.route("**/api/game/agent/status*", lambda route: route.fulfill(json=state))
    page.goto('/')
    entry = page.get_by_role('button', name='View layout', exact=True)
    spinner = entry.locator('.sidebar-running')
    expect(spinner).to_be_visible()
    # The activity monitor works without ever opening the View layout page.
    page.reload()
    expect(spinner).to_be_visible()
    state['files'] = ['another-workspace']
    expect(spinner).to_have_count(0)
    state.update(kind='import', files=[workspace])
    expect(spinner).to_have_count(0)
    state['kind'] = 'view-layout'
    expect(spinner).to_be_visible()
    state['running'] = False
    expect(spinner).to_have_count(0)
