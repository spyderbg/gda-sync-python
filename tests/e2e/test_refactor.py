"""The move and rename dialogs preview changes, apply them and expose recoverable backups."""
import json

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend
from tests.test_refactor import write

pytestmark = pytest.mark.e2e


@pytest.fixture
def refactor_backend(tmp_path, browser):
    game, other = tmp_path / 'resources' / 'game', tmp_path / 'resources' / 'other'
    other.mkdir(parents=True)
    (other / 'loading.png').write_bytes(b'placeholder')
    write(game / 'RssImagesData.json', {'images': [{'id': 'LOADING', 'path': '../other/loading.png'}]})
    write(game / 'idata' / 'Spin.json', {'rssId': 'LOADING', 'label': 'LOADING'})
    gda = tmp_path / 'gda'
    gda.mkdir()
    home = tmp_path / 'app'
    write(home / 'workspace.json', {'workspaces': [{'id': 'game', 'game_name': 'Refactor', 'game_path': str(game), 'gda_path': str(gda)}], 'defaultWorkspace': 'game'})
    backend = Backend(home)
    yield backend, game
    backend.stop()


def open_library(page, backend):
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Refactor', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()


def test_copy_folder_preview_apply_and_restore(new_context, refactor_backend):
    backend, game = refactor_backend
    page = new_context().new_page()
    open_library(page, backend)
    page.get_by_role('button', name='Copy all into this game…').click()
    dialog = page.get_by_role('dialog', name='Copy into this game', exact=True)
    expect(dialog.get_by_role('region', name='Change preview')).to_contain_text('copy')
    expect(dialog.get_by_role('button', name='Apply', exact=True)).to_be_enabled()
    BUILD.mkdir(exist_ok=True)
    dialog.screenshot(path=str(BUILD / 'refactor-preview.png'))
    dialog.get_by_role('button', name='Apply', exact=True).click()
    expect(dialog).to_have_count(0)
    expect(page.get_by_role('button', name='Copy all into this game…')).to_have_count(0)
    assert (game / 'loading.png').is_file()
    page.get_by_role('button', name='Backups', exact=True).click()
    page.get_by_role('button', name='Restore all', exact=True).first.click()
    page.get_by_role('dialog').get_by_role('button', name='Restore', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert not (game / 'loading.png').exists()
    assert '../other/loading.png' in (game / 'RssImagesData.json').read_text()


def test_rename_dialog_allows_excluding_value_matches(new_context, refactor_backend):
    backend, game = refactor_backend
    page = new_context().new_page()
    open_library(page, backend)
    page.get_by_role('button', name='Inspect loading.png', exact=True).click()
    page.get_by_role('button', name='Rename RssKey LOADING', exact=True).click()
    dialog = page.get_by_role('dialog', name='Rename LOADING', exact=True)
    dialog.get_by_label('New RssKey').fill('NEW_LOADING')
    expect(dialog.get_by_role('button', name='Apply', exact=True)).to_be_enabled()
    dialog.screenshot(path=str(BUILD / 'rename-key-preview.png'))
    dialog.get_by_role('checkbox').last.uncheck()
    expect(dialog.get_by_role('button', name='Apply', exact=True)).to_be_enabled()
    dialog.get_by_role('button', name='Apply', exact=True).click()
    expect(dialog).to_have_count(0)
    assert 'NEW_LOADING' in (game / 'RssImagesData.json').read_text()
    assert json.loads((game / 'idata' / 'Spin.json').read_text()) == {'rssId': 'NEW_LOADING', 'label': 'LOADING'}
