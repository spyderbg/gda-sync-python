"""Global settings: the gear on the Dashboard edits the working folder, workspace.json's config.working_path."""

import json

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend

pytestmark = pytest.mark.e2e


@pytest.fixture
def global_backend(tmp_path, browser):
    for folder in ("games/a", "gda/a"):
        (tmp_path / folder).mkdir(parents=True)
    home = tmp_path / "app"
    home.mkdir()
    (home / "workspace.json").write_text(json.dumps({
        "config": {"port": 3457}, "defaultWorkspace": "a", "games_root_path": str(tmp_path / "games"),
        "workspaces": [{"id": "a", "game_name": "Paths", "game_path": "{games_root_path}/a", "gda_path": str(tmp_path / "gda" / "a")}],
    }))
    server = Backend(home)
    yield server, home, tmp_path
    server.stop()


def test_the_dashboard_gear_opens_global_settings_that_save_the_working_folder(new_context, global_backend):
    backend, home, root = global_backend
    page = new_context().new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(backend.url)
    banner = page.get_by_role("banner")
    expect(banner.get_by_role("button", name="Workspace settings")).to_have_count(0)
    banner.get_by_role("button", name="Global settings", exact=True).click()
    expect(banner.get_by_role("button", name="Global settings", exact=True)).to_have_attribute("aria-current", "page")
    expect(page.locator(".navbar-game-title")).to_have_text("Global settings")

    # No working folder yet: the default one. EGT_GDA_SYNC_HOME, which the tests start the app with, chooses this run's.
    folder = page.get_by_label("Working folder", exact=True)
    expect(folder).to_have_value("")
    expect(page.locator(".settings-path-hint")).to_contain_text("Empty: the default folder")
    expect(page.locator("code.backup-path").first).to_have_text(str(home))
    expect(page.get_by_text("EGT_GDA_SYNC_HOME chooses the data folder of this run")).to_be_visible()
    expect(page.locator(".settings-global-paths dt")).to_have_text(["{games_root_path}"])
    save = page.get_by_role("button", name="Save global settings")
    expect(save).to_be_disabled()

    folder.fill("{nope_path}/data")
    expect(page.locator(".settings-path-hint.text-danger")).to_contain_text("workspace.json defines no global path {nope_path}")
    folder.fill("{games_root_path}/a/data")
    save.click()
    expect(page.get_by_role("status").filter(has_text="inside the Game folder of Paths")).to_be_visible()
    folder.fill("{games_root_path}/../data")
    expect(page.locator(".settings-path-hint")).to_have_text(f"Expands to {root / 'games'}/../data")
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / "global-settings.png"), full_page=True)
    save.click()
    expect(page.get_by_role("status").filter(has_text="Global settings saved.")).to_be_visible()
    expect(save).to_be_disabled()
    written = json.loads((home / "workspace.json").read_text())
    assert written["config"] == {"port": 3457, "working_path": "{games_root_path}/../data"}
    assert written["workspaces"][0]["game_path"] == "{games_root_path}/a"

    # A workspace's pages keep the workspace's gear.
    page.get_by_role("link", name="EGT GDA Sync").first.click()
    page.get_by_role("list", name="Workspaces").get_by_role("button", name="Paths", exact=True).click()
    expect(banner.get_by_role("button", name="Workspace settings", exact=True)).to_be_visible()
    expect(banner.get_by_role("button", name="Global settings")).to_have_count(0)
    assert errors == []
