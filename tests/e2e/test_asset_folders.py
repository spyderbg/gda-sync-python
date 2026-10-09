"""The asset library lists the folders its assets are in, each on its own line, and shows the assets of one when it is
clicked."""

import json

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend
from tests.test_asset_folders import write_game

pytestmark = pytest.mark.e2e


@pytest.fixture
def folders_backend(tmp_path, browser):
    game = write_game(tmp_path)
    (tmp_path / 'gda').mkdir()
    home = tmp_path / 'app'
    home.mkdir()
    entry = {'id': 'folders', 'game_name': 'Folders', 'gda_path': str(tmp_path / 'gda'), 'game_path': str(game)}
    (home / 'workspace.json').write_text(json.dumps({'workspaces': [entry], 'defaultWorkspace': 'folders'}))
    server = Backend(home)
    yield server, game
    server.stop()


def test_library_lists_the_asset_folders_and_filters_by_one(new_context, folders_backend):
    backend, game = folders_backend
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Folders', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    summary = page.get_by_role('region', name='Workspace summary')
    # Before a report, only the game path.
    expect(summary.locator('.workspace-folder-line')).to_have_count(1)
    summary.get_by_role('button', name='Rescan', exact=True).click()
    expect(page.locator('.asset-card')).to_have_count(6)

    folders = summary.get_by_role('group', name='Asset folders: show the assets of one')
    expect(folders.locator('.workspace-folder-line')).to_have_text([f'Game path{game.resolve()}2 assets', 'Shared../common3 assets', 'Shared../other1 asset'])
    BUILD.mkdir(exist_ok=True)
    summary.locator('.workspace-folder-strip').screenshot(path=str(BUILD / 'asset-folders.png'))

    # A folder shows only its assets, and the status filters count them; clicking it again shows every folder.
    common = folders.get_by_role('button', name='Show the assets in ../common')
    common.click()
    expect(common).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('.asset-card')).to_have_count(3)
    expect(page.locator('.results-heading')).to_contain_text('3 of 3 assets in ../common')
    expect(page.get_by_role('group', name='Filter by status').get_by_role('button')).to_have_text(
        ['All 3', 'Available 3', 'Missing 0', 'Invalid 0', 'Supplementary 0'])
    # The included folder's view is a view, drawn with the game's descriptors.
    expect(page.locator('.asset-card').filter(has_text='BonusView.json')).to_contain_text('View')
    folders.get_by_role('button', name=f'Show the assets in {game.resolve()}').click()
    expect(page.locator('.asset-card')).to_have_count(2)
    expect(page.locator('.asset-card').filter(has_text='unlisted.png')).to_have_count(1)
    folders.get_by_role('button', name=f'Show the assets in {game.resolve()}').click()
    expect(page.locator('.asset-card')).to_have_count(6)
    expect(folders.get_by_role('button', name='Open ../common folder')).to_be_visible()
    assert errors == []
