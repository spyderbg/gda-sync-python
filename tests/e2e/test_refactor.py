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
    # A large folder should scroll inside the review without pushing its actions off screen.
    images = [{'id': 'LOADING', 'path': '../other/loading.png'}]
    for index in range(24):
        name = f'asset-{index}.png'
        (game.parent / 'other' / name).write_bytes(b'placeholder')
        images.append({'id': f'ASSET_{index}', 'path': f'../other/{name}'})
    write(game / 'RssImagesData.json', {'images': images})
    page = new_context().new_page()
    open_library(page, backend)
    page.get_by_role('button', name='Copy all into this game…').click()
    dialog = page.get_by_role('dialog', name='Move assets', exact=True)
    expect(dialog.get_by_role('region', name='Change preview')).to_have_count(0)
    expect(dialog).to_contain_text('From another game')
    assert not (game / 'loading.png').exists()
    dialog.get_by_role('button', name='Review changes', exact=True).click()
    expect(dialog.get_by_role('region', name='Change preview')).to_contain_text('copy')
    expect(dialog.get_by_role('button', name='Apply', exact=True)).to_be_enabled()
    body = dialog.locator('.move-body')
    assert body.evaluate('(el) => el.scrollHeight > el.clientHeight')
    expect(dialog.get_by_role('button', name='Apply', exact=True)).to_be_in_viewport()
    body.evaluate('(el) => el.scrollTop = el.scrollHeight')
    expect(dialog.get_by_role('button', name='Close dialog', exact=True)).to_be_in_viewport()
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


def test_move_picker_browses_empty_nested_folders_and_prefills_file_name(new_context, refactor_backend):
    backend, game = refactor_backend
    (game / 'art' / '1920x1080' / 'UI').mkdir(parents=True)
    page = new_context().new_page()
    open_library(page, backend)
    page.get_by_role('button', name='Move loading.png', exact=True).click()
    dialog = page.get_by_role('dialog', name='Move asset', exact=True)
    expect(page.get_by_role('dialog')).to_have_count(1)
    frame = dialog.locator('.modal-content')
    bounds = frame.bounding_box()
    name = dialog.get_by_label('File name', exact=True)
    expect(name).to_have_value('loading.png')
    folders = dialog.get_by_label('Open subfolder', exact=True)
    folders.select_option('art')
    folders.select_option('art/1920x1080')
    folders.select_option('art/1920x1080/UI')
    expect(dialog.get_by_label('Target folder', exact=True)).to_have_value('art/1920x1080/UI')
    dialog.get_by_role('navigation', name='Folder breadcrumbs').get_by_role('button', name='1920x1080', exact=True).click()
    expect(dialog.get_by_label('Target folder', exact=True)).to_have_value('art/1920x1080')
    dialog.get_by_role('navigation', name='Folder breadcrumbs').get_by_role('button', name='art', exact=True).click()
    expect(dialog.get_by_label('Target folder', exact=True)).to_have_value('art')
    folders.select_option('art/1920x1080')
    folders.select_option('art/1920x1080/UI')
    name.fill('new_loading.png')
    expect(dialog.get_by_role('button', name='Review changes', exact=True)).to_be_enabled()
    assert frame.bounding_box() == bounds
    BUILD.mkdir(exist_ok=True)
    dialog.screenshot(path=str(BUILD / 'move-folder-picker.png'))
    dialog.get_by_role('button', name='Review changes', exact=True).click()
    expect(dialog.get_by_role('region', name='Change preview')).to_contain_text('art/1920x1080/UI/new_loading.png')
    expect(dialog.get_by_role('region', name='Change preview')).not_to_contain_text(str(game))
    assert frame.bounding_box() == bounds
    assert not (game / 'art' / '1920x1080' / 'UI' / 'new_loading.png').exists()
    dialog.screenshot(path=str(BUILD / 'move-review.png'))
    dialog.get_by_role('button', name='Back', exact=True).click()
    expect(name).to_have_value('new_loading.png')
    expect(dialog.get_by_label('Target folder', exact=True)).to_have_value('art/1920x1080/UI')
    # Editing after review invalidates the old plan before Apply can be reached again.
    name.fill('final_loading.png')
    expect(dialog.get_by_role('button', name='Apply', exact=True)).to_have_count(0)
    expect(dialog.get_by_role('button', name='Review changes', exact=True)).to_be_enabled()
    page.set_viewport_size({'width': 390, 'height': 844})
    mobile_bounds = frame.bounding_box()
    dialog.screenshot(path=str(BUILD / 'move-folder-picker-mobile.png'))
    dialog.get_by_role('button', name='Review changes', exact=True).click()
    expect(dialog.get_by_role('region', name='Change preview')).to_contain_text('final_loading.png')
    assert frame.bounding_box() == mobile_bounds
    assert dialog.locator('.move-body').evaluate('(el) => el.scrollWidth <= el.clientWidth')
    dialog.screenshot(path=str(BUILD / 'move-review-mobile.png'))
    dialog.get_by_role('button', name='Apply', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert (game / 'art' / '1920x1080' / 'UI' / 'final_loading.png').is_file()
    assert (game.parent / 'other' / 'loading.png').is_file()


def test_move_prefills_rtf_folder_name_and_rejects_blank_name(new_context, refactor_backend):
    backend, game = refactor_backend
    write(game / 'help' / 'project.rtf', {'pages': []})
    write(game / 'RssRtfsData.json', {'rtfs': [{'id': 'HELP', 'path': 'help/project.rtf'}]})
    page = new_context().new_page()
    open_library(page, backend)
    page.get_by_role('button', name='Move help', exact=True).click()
    dialog = page.get_by_role('dialog', name='Move asset', exact=True)
    name = dialog.get_by_label('Folder name', exact=True)
    expect(name).to_have_value('help')
    name.fill('')
    expect(dialog.get_by_role('button', name='Review changes', exact=True)).to_be_disabled()
    expect(dialog).to_contain_text('Enter a folder name.')
    name.fill('help_updated')
    dialog.get_by_role('button', name='Review changes', exact=True).click()
    dialog.get_by_role('button', name='Apply', exact=True).click()
    expect(dialog).to_have_count(0)
    assert (game / 'help_updated' / 'project.rtf').is_file()
    assert not (game / 'help').exists()


def test_move_manual_destination_blocks_collisions_and_creates_new_folder(new_context, refactor_backend):
    backend, game = refactor_backend
    (game / 'loading.png').write_bytes(b'different contents')
    page = new_context().new_page()
    open_library(page, backend)
    page.get_by_role('article').filter(has_text='../other').get_by_role('button', name='Move loading.png', exact=True).click()
    dialog = page.get_by_role('dialog', name='Move asset', exact=True)
    expect(dialog.get_by_role('alert')).to_contain_text('different contents')
    expect(dialog.get_by_role('button', name='Review changes', exact=True)).to_be_disabled()
    expect(dialog.get_by_label('Target folder', exact=True)).to_be_visible()
    dialog.get_by_label('Target folder', exact=True).fill('new/folder')
    expect(dialog).to_contain_text('This folder will be created')
    dialog.get_by_role('button', name='Review changes', exact=True).click()
    expect(dialog.get_by_role('region', name='Change preview')).to_contain_text('new/folder/loading.png')
    dialog.get_by_role('button', name='Apply', exact=True).click()
    expect(dialog).to_have_count(0)
    assert (game / 'new' / 'folder' / 'loading.png').is_file()
    assert (game / 'loading.png').read_bytes() == b'different contents'


def test_changed_file_requires_a_fresh_review(new_context, refactor_backend):
    backend, game = refactor_backend
    page = new_context().new_page()
    open_library(page, backend)
    page.get_by_role('button', name='Move loading.png', exact=True).click()
    dialog = page.get_by_role('dialog', name='Move asset', exact=True)
    dialog.get_by_role('button', name='Review changes', exact=True).click()
    source = game.parent / 'other' / 'loading.png'
    source.write_bytes(b'changed after the review')
    dialog.get_by_role('button', name='Apply', exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('preview')
    expect(dialog.get_by_role('button', name='Apply', exact=True)).to_have_count(0)
    expect(dialog.get_by_role('button', name='Review changes', exact=True)).to_be_disabled()
    assert not (game / 'loading.png').exists()
    dialog.get_by_role('button', name='Check again', exact=True).click()
    dialog.get_by_role('button', name='Review changes', exact=True).click()
    dialog.get_by_role('button', name='Apply', exact=True).click()
    expect(dialog).to_have_count(0)
    assert (game / 'loading.png').read_bytes() == b'changed after the review'


def test_move_browse_uses_selected_folder_and_cancel_preserves_target(new_context, refactor_backend):
    backend, game = refactor_backend
    (game / 'art' / 'UI').mkdir(parents=True)
    page = new_context().new_page()
    choices = iter([{'path': None}, {'path': 'art/UI'}])
    requests = []
    def choose_folder(route):
        requests.append(route.request.method)
        route.fulfill(status=200, content_type='application/json', body=json.dumps(next(choices)))
    page.route('**/api/asset-report/move/browse', choose_folder)
    open_library(page, backend)
    page.get_by_role('button', name='Move loading.png', exact=True).click()
    dialog = page.get_by_role('dialog', name='Move asset', exact=True)
    path = dialog.get_by_label('Target folder', exact=True)
    path.fill('art')
    browse = dialog.get_by_role('button', name='Browse destination folder', exact=True)
    browse.click()
    expect(browse).to_be_enabled()
    expect(path).to_have_value('art')
    browse.click()
    expect(path).to_have_value('art/UI')
    expect(dialog.get_by_role('button', name='UI', exact=True)).to_be_visible()
    dialog.get_by_role('button', name='Review changes', exact=True).click()
    expect(dialog.get_by_role('region', name='Change preview')).to_contain_text('art/UI/loading.png')
    assert requests == ['POST', 'POST']
