"""The Sync page shows an RTF as one resource, its folder, beside the closest GDA folder, and syncs it as a whole."""

import json

import pytest
from playwright.sync_api import expect

from egt_gda_sync.library import Library
from tests.e2e.conftest import BUILD, Backend
from tests.test_rtf_sync import EXTENSIONS, write_rtf_game

pytestmark = pytest.mark.e2e


@pytest.fixture
def rtf_sync_backend(tmp_path):
    game, gda = write_rtf_game(tmp_path)
    home = tmp_path / 'app'
    home.mkdir()
    entry = {'id': 'example', 'game_name': 'Example', 'game_path': str(game), 'gda_path': str(gda), 'extensions': EXTENSIONS}
    (home / 'workspace.json').write_text(json.dumps({'workspaces': [entry], 'defaultWorkspace': 'example'}))
    library = Library(str(home))
    library.init()
    assert library.compare_workspace('example')['state'] == 'succeeded'
    library.close()
    server = Backend(home)
    server.game, server.gda = game, gda
    yield server
    server.stop()


def test_the_sync_page_compares_and_syncs_an_rtf_as_its_folder(new_context, rtf_sync_backend):
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(rtf_sync_backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    card = page.locator('.resource-card.is-different')
    expect(card).to_have_count(1)
    game_card = card.locator('.resource-game')
    expect(game_card.locator('.asset-name')).to_have_text('10_Crown')
    expect(game_card).to_contain_text('3 pages · 8 files')
    expect(game_card.locator('.resource-status')).to_have_text('different')
    expect(game_card.locator('.resource-frames summary')).to_have_text('3 files not in sync')
    expect(game_card.get_by_role('group', name='Pages of 10_Crown').get_by_role('button')).to_have_count(3)
    # The closest GDA folder, whose pages it shows, and the other one that holds a project.rtf.
    gda = card.get_by_role('region', name='GDA folders of 10_Crown')
    expect(gda.locator('.asset-name')).to_have_text(['10_Crown_Tetra_Lottomatica', '20_Other_Game'])
    expect(gda.locator('.resource-status')).to_have_text(['Copied on sync: 1 changed, 1 added, 1 deleted', 'Other match'])
    expect(gda.get_by_role('group', name='Pages of 10_Crown_Tetra_Lottomatica')).to_be_visible()
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / 'rtf-sync-desktop.png'))

    game_card.get_by_role('button', name='Show details for 10_Crown').click()
    details = page.get_by_role('dialog', name='10_Crown')
    expect(details.locator('.rtf-viewer')).to_have_count(2)
    expect(details.get_by_role('row', name='Files 8 8')).to_be_visible()
    expect(details.get_by_role('row', name='GDA folder, copied on sync')).to_be_visible()
    # The files that Sync changes come first.
    files = details.locator('.details-rtf-files tbody tr')
    expect(files).to_have_count(9)
    expect(files.nth(0).locator('td')).to_have_text(['data/background.dds', 'changed'])
    expect(files.nth(1).locator('td')).to_have_text(['data/old_button.dds', 'only in the game'])
    expect(files.nth(2).locator('td')).to_have_text(['data/titles/title_EN.dds', 'only in the GDA'])
    # Both RTFs show the page chosen on either.
    details.get_by_role('group', name='Pages of 10_Crown', exact=True).get_by_role('button', name='Show page wintable').click()
    expect(details.get_by_role('group', name='Pages of 10_Crown_Tetra_Lottomatica from the GDA').get_by_role('button', name='Show page wintable')).to_have_attribute('aria-pressed', 'true')
    expect(details.get_by_role('group', name='Page wintable')).to_have_count(2)
    page.screenshot(path=str(BUILD / 'rtf-sync-details-desktop.png'))

    details.get_by_role('button', name='Sync this resource').click()
    confirm = page.get_by_role('dialog', name='Ready to bring things up to date?')
    expect(confirm).to_contain_text("An RTF's folder becomes a copy of its closest GDA folder")
    expect(confirm.locator('.sync-file-list')).to_contain_text('1 changed, 1 added, 1 deleted')
    confirm.get_by_role('button', name='Sync 1 resource').click()
    # The comparison that follows finds the RTF in sync.
    expect(page.locator('.resource-card')).to_have_count(0, timeout=20000)
    folder, source = rtf_sync_backend.game / 'help' / '10_Crown', rtf_sync_backend.gda / '04.HelpScreen' / '10_Crown_Tetra_Lottomatica'
    listing = lambda root: sorted(path.relative_to(root).as_posix() for path in root.rglob('*') if path.is_file())
    assert listing(folder) == listing(source)
    assert errors == []
