"""Sync history lists the GDA sync runs of the workspace, each of which can be deleted."""

import json

import pytest
from playwright.sync_api import expect

from egt_gda_sync.library import Library
from tests.e2e.conftest import BUILD, Backend
from tests.test_rss_sync import write_example

pytestmark = pytest.mark.e2e


@pytest.fixture
def history_backend(tmp_path, browser):
    _game, gda = write_example(tmp_path)
    home = tmp_path / "app"
    home.mkdir()
    entry = {"id": "example", "game_name": "Example", "game_path": str(tmp_path / "resources" / "example"), "gda_path": str(gda),
             "extensions": [".dds", ".wav"]}
    (home / "workspace.json").write_text(json.dumps({"workspaces": [entry], "defaultWorkspace": "example"}))
    library = Library(str(home))
    library.init()
    for _run in range(2):
        assert library.compare_workspace("example")["state"] == "succeeded"
    library.close()
    server = Backend(home)
    yield server, home
    server.stop()


def test_a_report_is_deleted_from_the_sync_history(new_context, history_backend):
    backend, home = history_backend
    page = new_context().new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role("list", name="Workspaces").get_by_role("button", name="Example", exact=True).click()
    page.get_by_role("navigation", name="Main navigation").get_by_role("button", name="Sync history", exact=True).click()
    runs = page.locator("article.history-run")
    expect(runs).to_have_count(2)
    newest = runs.first.locator(".history-file").inner_text()

    # Cancel keeps the report; the newest successful one is the Sync page's, which the dialog says.
    runs.first.get_by_role("button", name="Delete the report of the run of").click()
    dialog = page.get_by_role("dialog", name="Delete this GDA sync report?")
    expect(dialog).to_contain_text(newest)
    expect(dialog).to_contain_text("It is the latest successful run: the Sync page will show the one before it.")
    BUILD.mkdir(exist_ok=True)
    dialog.screenshot(path=str(BUILD / "sync-history-delete.png"))
    dialog.get_by_role("button", name="Cancel").click()
    expect(runs).to_have_count(2)

    runs.first.get_by_role("button", name="Delete the report of the run of").click()
    dialog.get_by_role("button", name="Delete report").click()
    expect(page.get_by_role("status").filter(has_text=f"Deleted the GDA sync report {newest}")).to_be_visible()
    expect(runs).to_have_count(1)
    expect(runs.first.locator(".history-file")).not_to_have_text(newest)
    assert not (home / "sync-reports" / newest).exists()
    assert errors == []
