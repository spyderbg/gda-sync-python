"""Workspace settings show folders as workspace.json writes them, with its global paths, and save a folder inside a
global path with it."""

import json

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend

pytestmark = pytest.mark.e2e


@pytest.fixture
def paths_backend(tmp_path, browser):
    for folder in ("games/a", "games/new", "gda/a"):
        (tmp_path / folder).mkdir(parents=True)
    home = tmp_path / "app"
    home.mkdir()
    (home / "workspace.json").write_text(json.dumps({
        "defaultWorkspace": "a", "games_root_path": str(tmp_path / "games"), "gda_root_path": str(tmp_path / "gda"),
        "workspaces": [{"id": "a", "game_name": "Paths", "game_path": "{games_root_path}/a", "gda_path": "{gda_root_path}/a"}],
    }))
    server = Backend(home)
    yield server, home, tmp_path
    server.stop()


def test_settings_use_and_save_global_paths(new_context, paths_backend):
    backend, home, root = paths_backend
    page = new_context().new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role("list", name="Workspaces").get_by_role("button", name="Paths", exact=True).click()
    page.get_by_role("banner").get_by_role("button", name="Workspace settings", exact=True).click()

    # The folders as workspace.json writes them, what they expand to, and the global paths.
    game, gda = page.locator("#destination-folder"), page.locator("#source-folder")
    expect(game).to_have_value("{games_root_path}/a")
    expect(gda).to_have_value("{gda_root_path}/a")
    expect(page.locator(".settings-path-hint").last).to_have_text(f"Expands to {root / 'games'}/a")
    expect(page.locator(".settings-global-paths dt")).to_have_text(["{games_root_path}", "{gda_root_path}"])

    # A path inside a global path is saved with it; a global path that is not defined is an error.
    game.fill(str(root / "games" / "new"))
    expect(page.locator(".settings-path-hint").last).to_have_text("Saved as {games_root_path}/new")
    gda.fill("{nope_path}/a")
    expect(page.locator(".settings-path-hint.text-danger")).to_contain_text("workspace.json defines no global path {nope_path}")
    gda.fill("{gda_root_path}/a")
    BUILD.mkdir(exist_ok=True)
    page.locator("form.forms-sample").screenshot(path=str(BUILD / "settings-global-paths.png"))
    page.get_by_role("button", name="Save workspace").click()
    expect(page.get_by_role("status").filter(has_text="Workspace connected successfully")).to_be_visible()
    entry = json.loads((home / "workspace.json").read_text())["workspaces"][0]
    assert (entry["game_path"], entry["gda_path"]) == ("{games_root_path}/new", "{gda_root_path}/a")
    assert errors == []
