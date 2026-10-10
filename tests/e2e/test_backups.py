"""The Backups page lists each operation's replaced and deleted files and restores them."""

import json

import pytest
from playwright.sync_api import expect

from egt_gda_sync.library import Library
from tests.e2e.conftest import BUILD, Backend
from tests.test_rss_sync import write_example

pytestmark = pytest.mark.e2e


@pytest.fixture
def backups_backend(tmp_path, browser):
    game, gda = write_example(tmp_path)
    home = tmp_path / "app"
    home.mkdir()
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda), "extensions": [".dds"]}
    (home / "workspace.json").write_text(json.dumps({"workspaces": [entry], "defaultWorkspace": "example"}))
    library = Library(str(home))
    library.init()
    assert library.compare_workspace("example")["state"] == "succeeded"
    rows = {row["resource"]: row for row in json.loads(library.rss_report())["differences"]}
    # Sync the different file and delete the supplementary one, which saves both in the backups.
    library.apply_resources({rows["changed.dds"]["id"]: "different", rows["unlisted.dds"]["id"]: "supplementary"})
    library.reports.wait("example", 60)
    # A backup from another folder, whose workspace is not known.
    (home / "backups" / "unknown" / "elsewhere").mkdir(parents=True)
    (home / "backups" / "unknown" / "elsewhere" / "file.dds").write_bytes(b"x")
    library.close()
    server = Backend(home)
    yield server, game
    server.stop()


def test_backups_are_listed_and_restored(new_context, backups_backend):
    backend, game = backups_backend
    page = new_context().new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role("list", name="Workspaces").get_by_role("button", name="Example", exact=True).click()
    page.get_by_role("navigation", name="Main navigation").get_by_role("button", name="Backups", exact=True).click()

    operations = page.locator("article.backup-operation")
    expect(operations).to_have_count(1)
    sync = page.locator(f'article.backup-operation[data-backup="{operations.first.get_attribute("data-backup")}"]')
    expect(sync).to_contain_text("Synced 1 resource to Game; Deleted 1 supplementary resource from Game")
    expect(sync).to_contain_text("2 files")
    # The files, with what the operation did and how they are now.
    sync.get_by_role("button", name="Files").click()
    rows = sync.locator("tbody tr")
    expect(rows).to_have_count(2)
    expect(rows.filter(has_text="example/changed.dds")).to_contain_text("Replaced it")
    expect(rows.filter(has_text="example/changed.dds")).to_contain_text("Changed since")
    expect(rows.filter(has_text="example/unlisted.dds")).to_contain_text("Deleted it")
    expect(rows.filter(has_text="example/unlisted.dds")).to_contain_text("Not there")
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / "backups.png"), full_page=True)

    # Restoring one file asks first; the file there now is backed up, in a restore of its own.
    sync.get_by_role("button", name="Restore example/changed.dds").click()
    dialog = page.get_by_role("dialog", name="Restore this file?")
    expect(dialog).to_contain_text("example/changed.dds")
    dialog.get_by_role("button", name="Restore", exact=True).click()
    expect(page.get_by_role("status").filter(has_text="Restored 1 file.")).to_be_visible()
    assert (game / "changed.dds").read_bytes() == b"new"
    expect(operations).to_have_count(2)
    expect(operations.first).to_contain_text("Replaced when restoring the backup of")
    expect(sync.locator("tbody tr").filter(has_text="example/changed.dds")).to_contain_text("Same as the backup")
    expect(sync.get_by_role("button", name="Restore example/changed.dds")).to_be_disabled()

    # Restore all brings back the deleted file and skips the one that is the same.
    sync.get_by_role("button", name="Restore all").click()
    page.get_by_role("dialog", name="Restore 2 files?").get_by_role("button", name="Restore", exact=True).click()
    expect(page.get_by_role("status").filter(has_text="Restored 1 file. 1 already the same as the backup.")).to_be_visible()
    assert (game / "unlisted.dds").read_bytes() == b"other"

    # A backup whose workspace is not known is shown with every workspace's, and cannot be restored.
    page.get_by_role("checkbox", name="Show the backups of every workspace").check()
    unknown = page.locator('article.backup-operation[data-backup="unknown"]')
    expect(unknown).to_contain_text("workspace not known")
    expect(unknown).to_contain_text("cannot be restored")
    expect(unknown.get_by_role("button", name="Restore all")).to_be_disabled()
    assert errors == []
