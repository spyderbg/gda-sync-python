"""The asset library lists the files of the game path, and clicking one opens its details in a dialog."""

import json

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend, poll
from tests.fixtures.bc7_dds import create_bc7_dds

pytestmark = pytest.mark.e2e


@pytest.fixture
def details_backend(tmp_path, browser):
    source, destination = tmp_path / 'gda', tmp_path / 'game'
    (source / 'art').mkdir(parents=True)
    (destination / 'art').mkdir(parents=True)
    # The game has its own version of the banner and a sound; the GDA has a texture that the game does not.
    (source / 'art' / 'banner.dds').write_bytes(create_bc7_dds(16, 8))
    (source / 'art' / 'gda_only.dds').write_bytes(create_bc7_dds(4, 4))
    (destination / 'art' / 'banner.dds').write_bytes(create_bc7_dds(8, 4))
    (destination / 'RssRawData.json').write_text('{"rawFiles": []}')
    home = tmp_path / 'app'
    home.mkdir()
    entry = {'id': 'example', 'game_name': 'Example', 'gda_path': str(source), 'game_path': str(destination)}
    (home / 'workspace.json').write_text(json.dumps({'workspaces': [entry], 'defaultWorkspace': 'example'}))
    server = Backend(home)
    yield server, destination
    server.stop()


def test_library_lists_the_game_path_and_opens_a_file_in_a_dialog(new_context, details_backend):
    backend, destination = details_backend
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    # Only the game's files, without a status, a check box or a sync action.
    expect(page.locator('.asset-card')).to_have_count(2)
    expect(page.get_by_role('button', name='Inspect gda_only.dds', exact=True)).to_have_count(0)
    expect(page.locator('.asset-card .status-badge')).to_have_count(0)
    expect(page.get_by_role('checkbox')).to_have_count(0)
    expect(page.locator('.workspace-metric').first).to_contain_text('2')
    # No details are open until an asset is clicked.
    expect(page.get_by_role('dialog')).to_have_count(0)

    page.get_by_role('button', name='Inspect banner.dds', exact=True).click()
    details = page.get_by_role('dialog', name='banner.dds')
    expect(details.locator('figcaption')).to_have_text(['Game file'])
    poll(lambda: details.get_by_role('img', name='banner.dds preview', exact=True).evaluate('image => image.naturalWidth'), 8)
    expect(details.get_by_role('row').filter(has_text='Resolution')).to_have_text('Resolution8 × 4')
    expect(details.get_by_text(str(destination / 'art' / 'banner.dds'), exact=True)).to_be_visible()
    expect(details.get_by_role('button', name='Sync this asset')).to_have_count(0)
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / 'asset-details-desktop.png'))
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.screenshot(path=str(BUILD / 'asset-library-desktop.png'))
    assert errors == []
