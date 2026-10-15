"""The asset library shows the newest asset report, and clicking an asset opens its details in a dialog."""

import json

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend, poll
from tests.fixtures.bc7_dds import create_bc7_dds

pytestmark = pytest.mark.e2e


@pytest.fixture
def details_backend(tmp_path, browser):
    gda, game = tmp_path / 'gda', tmp_path / 'resources' / 'example'
    gda.mkdir()
    (game / 'anim').mkdir(parents=True)
    (game / 'banner.dds').write_bytes(create_bc7_dds(8, 4))
    for number in range(3):
        (game / 'anim' / f'spin_{number}.dds').write_bytes(create_bc7_dds(4, 4))
    (game / 'leftover.png').write_bytes(b'not declared')
    (game / 'RssImagesData.json').write_text(json.dumps({'images': [
        {'id': 'BANNER', 'path': 'banner.dds'}, {'id': 'GONE', 'path': 'gone.dds'}]}, indent=2))
    (game / 'RssImagesSeqData.json').write_text(json.dumps({'imagesSeq': [
        {'id': 'SPIN', 'frameTime': 40, 'loopCount': 0, 'frames': [{'path': 'anim/spin_{0-2}.dds'}]}]}, indent=2))
    home = tmp_path / 'app'
    home.mkdir()
    entry = {'id': 'example', 'game_name': 'Example', 'gda_path': str(gda), 'game_path': str(game)}
    (home / 'workspace.json').write_text(json.dumps({'workspaces': [entry], 'defaultWorkspace': 'example'}))
    server = Backend(home)
    yield server, game
    server.stop()


def test_library_shows_the_generated_asset_report_and_opens_an_asset_in_a_dialog(new_context, details_backend):
    backend, game = details_backend
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    expect(page.get_by_role('heading', name='No asset report yet')).to_be_visible()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Asset report generated: 4 assets, 1 missing, 0 invalid, 1 supplementary.')
    # The banner, the missing image, the sequence as one asset, and the file that nothing declares.
    expect(page.locator('.asset-card')).to_have_count(4)
    filters = page.get_by_role('group', name='Filter by status')
    expect(filters.get_by_role('button')).to_have_text(['All 4', 'Available 2', 'Missing 1', 'Invalid 0', 'Supplementary 1'])
    spin = page.locator('.asset-card').filter(has_text='SPIN')
    expect(spin).to_contain_text('3 frames · 40 ms · loops forever')
    expect(spin).to_contain_text('ImageSequence SPIN · RssImagesSeqData.json:9')
    filters.get_by_role('button', name='Missing 1').click()
    expect(page.locator('.asset-card')).to_have_count(1)
    expect(page.locator('.asset-card')).to_contain_text('Image GONE · RssImagesData.json:9')
    filters.get_by_role('button', name='All 4').click()
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / 'asset-library-desktop.png'))

    page.get_by_role('button', name='Inspect banner.dds', exact=True).click()
    details = page.get_by_role('dialog', name='banner.dds')
    expect(details.get_by_text('Loaded by the game.')).to_be_visible()
    expect(details.locator('.details-declaration')).to_have_text(['RssImagesData.json:5ImageBANNER'])
    expect(details.get_by_role('row').filter(has_text='Resolution')).to_have_text('Resolution8 × 4')
    poll(lambda: details.get_by_role('img', name='banner.dds preview', exact=True).evaluate('image => image.naturalWidth'), 8)
    # The game path is shown relative to the game folder, with the full path as its tooltip.
    expect(details.locator('.details-path .details-code')).to_have_text('banner.dds')
    expect(details.locator('.details-path .details-code')).to_have_attribute('title', str(game / 'banner.dds'))
    page.screenshot(path=str(BUILD / 'asset-details-desktop.png'))
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)

    # A sequence lists its frames in the dialog.
    spin.get_by_role('button', name='Show details for spin_{0-2}.dds').click()
    details = page.get_by_role('dialog', name='spin_{0-2}.dds')
    expect(details.locator('.details-frames tbody tr')).to_have_count(3)
    expect(details.get_by_role('row', name='Files 3 of 3 found')).to_be_visible()
    page.keyboard.press('Escape')
    assert errors == []


def test_the_sidebar_lists_images_and_image_sequences_apart(new_context, details_backend):
    backend, _game = details_backend
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    expect(page.locator('.asset-card')).to_have_count(4)
    navigation = page.get_by_role('navigation', name='Main navigation')
    # The banner, the missing image and the file that nothing declares are images; SPIN is an image sequence.
    images, sequences = (navigation.get_by_role('button', name=name, exact=True) for name in ('Images', 'ImagesSeq'))
    expect(images).to_contain_text('3')
    expect(sequences).to_contain_text('1')
    expect(navigation.get_by_role('button', name='Textures', exact=True)).to_have_count(0)
    sequences.click()
    expect(sequences).to_have_attribute('aria-current', 'page')
    expect(page.locator('.asset-card')).to_have_count(1)
    expect(page.locator('.asset-card')).to_contain_text('SPIN')
    images.click()
    expect(page.locator('.asset-card')).to_have_count(3)
    expect(page.locator('.asset-card').filter(has_text='SPIN')).to_have_count(0)
    assert errors == []


def test_an_asset_that_no_descriptor_declares_is_declared_from_its_details(new_context, details_backend):
    backend, game = details_backend
    # Half of the images have a resolution, so a new one starts with it; a language is only suggested.
    (game / 'RssImagesData.json').write_text(json.dumps({'images': [
        {'id': 'BANNER', 'path': 'banner.dds', 'resolution': '1920x1080'}, {'id': 'GONE', 'path': 'gone.dds', 'language': 'en-GB'}]}, indent=2))
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.get_by_role('button', name='Inspect leftover.png', exact=True).click()
    details = page.get_by_role('dialog', name='leftover.png')
    expect(details.locator('.details-type')).to_have_text('Image · PNG')
    expect(details.get_by_text('No JSON descriptor')).to_be_visible()
    details.get_by_role('button', name='Create', exact=True).click()

    declare = page.get_by_role('dialog', name='Create RssKey leftover.png')
    preview = declare.locator('.declare-preview')
    expect(declare.get_by_label('Declare as')).to_have_value('Image')
    expect(declare.locator('.declare-heading')).to_contain_text('RssImagesData.json')
    key = declare.get_by_label('RSS key')
    expect(key).to_have_value('LEFTOVER')
    expect(key).to_be_focused()
    # The part of the entry that the field being edited writes is highlighted.
    expect(preview.locator('.is-focused')).to_have_text(['    "id": "LEFTOVER",'])
    key.fill('BANNER')
    expect(declare.get_by_text('Another Image entry has this key')).to_be_visible()
    key.fill('IMAGE_LEFTOVER')
    resolution = declare.get_by_label('Resolution', exact=True)
    expect(resolution).to_have_value('1920x1080')
    resolution.focus()
    expect(preview.locator('.is-focused')).to_have_text(['    "resolution": "1920x1080"'])
    resolution.select_option(label='Other…')
    declare.get_by_label('Other resolution').fill('1440x900')
    expect(preview).to_contain_text('"resolution": "1440x900"')
    resolution.select_option('1920x1080')
    # The form has every field of the kind; a dropdown's Not specified leaves it out, and another optional one can be removed and added again from the list.
    expect(declare.get_by_label('Add field')).to_have_count(0)
    language = declare.get_by_label('Language', exact=True)
    language.select_option('en-GB')
    language.focus()
    expect(preview.locator('.is-focused')).to_have_text(['    "language": "en-GB"'])
    language.select_option(label='Not specified')
    expect(preview).not_to_contain_text('language')
    declare.get_by_label('Source x').fill('4')
    # Without the image's size there is no default width and height; the empty y is 0.
    expect(declare.get_by_role('button', name='Create', exact=True)).to_be_disabled()
    declare.get_by_label('Source w').fill('10')
    declare.get_by_label('Source h').fill('8')
    expect(declare.get_by_role('button', name='Create', exact=True)).to_be_enabled()
    expect(preview).to_contain_text('"x": 4')
    expect(preview).to_contain_text('"y": 0')
    declare.get_by_role('button', name='Reset Source').click()
    expect(declare.get_by_label('Source x')).to_have_value('')
    expect(declare.get_by_role('button', name='Create', exact=True)).to_be_enabled()
    # A font's characters are groups, each from the list or typed as plain text, and the help shows the characters.
    declare.get_by_label('Declare as').select_option('Font')
    declare.get_by_label('Characters group 1').select_option('[U+0030-U+0039]')
    declare.get_by_role('button', name='Add group').click()
    # A group that another has is not offered again.
    expect(declare.get_by_label('Characters group 2').locator('option[value="[U+0030-U+0039]"]')).to_have_count(0)
    declare.get_by_label('Characters group 2').select_option(label='Other…')
    declare.get_by_label('Other characters, group 2').fill('€$')
    expect(preview).to_contain_text('[U+0030-U+0039][U+0024][U+20AC]')
    expect(declare.locator('.declare-glyphs')).to_have_text('0123456789$€')
    # Escape closes only the dialog on top.
    page.keyboard.press('Escape')
    expect(declare).to_have_count(0)
    expect(details).to_be_visible()
    details.get_by_role('button', name='Create', exact=True).click()
    declare.get_by_label('RSS key').fill('IMAGE_LEFTOVER')
    declare.get_by_role('button', name='Create', exact=True).click()

    expect(page.get_by_role('status')).to_contain_text('Declared IMAGE_LEFTOVER in RssImagesData.json:15.')
    expect(declare).to_have_count(0)
    expect(details.get_by_text('Loaded by the game.')).to_be_visible()
    expect(details.locator('.details-declaration')).to_have_text(['RssImagesData.json:15ImageIMAGE_LEFTOVER'])
    assert json.loads((game / 'RssImagesData.json').read_text())['images'][-1] == {
        'id': 'IMAGE_LEFTOVER', 'path': 'leftover.png', 'resolution': '1920x1080'}
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert errors == []
