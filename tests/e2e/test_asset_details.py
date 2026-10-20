"""The asset library shows the newest asset report, and clicking an asset opens its details in a dialog."""

import json
import re

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
    spin.locator('.asset-hit-target').click()
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
    # It starts with the digits and the English letters.
    expect(declare.get_by_label('Characters group 1')).to_have_value('[U+0030-U+0039]')
    expect(declare.get_by_label('Characters group 2')).to_have_value('[U+0041-U+005A]')
    expect(declare.get_by_label('Characters group 3')).to_have_value('[U+0061-U+007A]')
    declare.get_by_role('button', name='Remove group 3').click()
    declare.get_by_role('button', name='Remove group 2').click()
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


def test_an_asset_is_removed_after_a_confirmation_with_its_rsskey_and_the_backup_keeps_them(new_context, details_backend):
    backend, game = details_backend
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.get_by_role('button', name='Remove banner.dds', exact=True).click()
    dialog = page.get_by_role('dialog', name='Remove banner.dds?')
    expect(dialog).to_contain_text('Delete this file from the game folder')
    expect(dialog).to_contain_text('Image BANNER · RssImagesData.json')
    # Cancelling changes nothing.
    dialog.get_by_role('button', name='Cancel').click()
    expect(dialog).to_have_count(0)
    assert (game / 'banner.dds').is_file()
    page.get_by_role('button', name='Remove banner.dds', exact=True).click()
    dialog.get_by_role('button', name='Remove', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Removed banner.dds: 1 entry and 1 file.')
    expect(dialog).to_have_count(0)
    assert not (game / 'banner.dds').exists()
    assert [item['id'] for item in json.loads((game / 'RssImagesData.json').read_text())['images']] == ['GONE']
    assert errors == []


def test_an_asset_whose_rsskey_a_view_uses_is_removed_after_a_second_confirmation_that_links_the_view(new_context, details_backend):
    backend, game = details_backend
    (game / 'v' / '1920x1080').mkdir(parents=True)
    (game / 'v' / '1920x1080' / 'Main.json').write_text(json.dumps({'name': 'MainView', 'elements': [{'id': 'banner', 'type': 'Image', 'rssKey': 'BANNER'}]}))
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.get_by_role('button', name='Remove banner.dds', exact=True).click()
    dialog = page.get_by_role('dialog', name='Remove banner.dds?')
    expect(dialog).to_contain_text('1 view uses it.')
    dialog.get_by_role('button', name='Remove', exact=True).click()
    # A second confirmation lists the views, each opening its details.
    used = page.get_by_role('dialog', name='BANNER is in use')
    expect(used).to_contain_text('This view uses the RssKey of banner.dds. Removing banner.dds leaves it without that resource')
    expect(used).to_contain_text('v/1920x1080/Main.json')
    expect(used).to_contain_text('banner (Image)')
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / 'remove-used-asset.png'))
    used.get_by_role('button', name='Back').click()
    expect(dialog).to_be_visible()
    dialog.get_by_role('button', name='Remove', exact=True).click()
    used.get_by_role('button', name='MainView').click()
    expect(page.get_by_role('dialog', name='Main.json')).to_be_visible()
    expect(used).to_have_count(0)
    assert (game / 'banner.dds').is_file()
    page.keyboard.press('Escape')
    # The list layout has the button too.
    page.get_by_role('button', name='List view').click()
    expect(page.locator('tr.asset-row')).to_have_count(5)
    page.locator('tr.asset-row').filter(has_text='banner.dds').get_by_role('button', name='Remove banner.dds', exact=True).click()
    dialog.get_by_role('button', name='Remove', exact=True).click()
    used.get_by_role('button', name='Remove anyway').click()
    expect(page.get_by_role('status')).to_contain_text('Removed banner.dds: 1 entry and 1 file.')
    assert not (game / 'banner.dds').exists()
    # The backup keeps the RssKey with its fields, which restoring it puts back.
    page.get_by_role('navigation', name='Main navigation').get_by_role('button', name='Backups', exact=True).click()
    removal = page.locator('article.backup-operation').first
    expect(removal).to_contain_text('Removed banner.dds: its 1 entry and 1 file')
    removal.get_by_role('button', name='Files').click()
    keys = removal.get_by_role('table', name=re.compile('RssKeys removed'))
    expect(keys).to_contain_text('BANNER')
    expect(keys).to_contain_text('{"path":"banner.dds"}')
    removal.get_by_role('button', name='Restore all').click()
    page.get_by_role('dialog', name=re.compile('Restore')).get_by_role('button', name='Restore', exact=True).click()
    expect(page.get_by_role('status').filter(has_text='Restored')).to_be_visible()
    assert (game / 'banner.dds').is_file()
    assert json.loads((game / 'RssImagesData.json').read_text())['images'][-1] == {'id': 'BANNER', 'path': 'banner.dds'}
    assert errors == []


def test_a_text_file_is_edited_in_its_details_and_saved_into_the_backups(new_context, details_backend):
    backend, game = details_backend
    (game / 'notes.csv').write_text('a,b\r\n1,2\r\n')
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.get_by_role('button', name='Inspect notes.csv', exact=True).click()
    details = page.get_by_role('dialog', name='notes.csv')
    editor = details.get_by_label('Text of notes.csv')
    expect(editor).to_have_value('a,b\n1,2\n')
    expect(details.get_by_role('button', name='Save', exact=True)).to_be_disabled()
    editor.fill('a,b\n1,2\n3,4\n')
    expect(details.get_by_role('status')).to_contain_text('Unsaved changes')
    details.get_by_role('button', name='Revert').click()
    expect(editor).to_have_value('a,b\n1,2\n')
    editor.fill('a,b\n1,2\n3,4\n')
    details.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('status').filter(has_text='Saved notes.csv.')).to_be_visible()
    assert (game / 'notes.csv').read_bytes() == b'a,b\r\n1,2\r\n3,4\r\n'
    expect(details.get_by_role('status')).to_contain_text('Saved')
    assert errors == []


@pytest.mark.parametrize(('content', 'line'), [
    ('{\n  "count": 1,\n}\n', 3),
    ('{\n  "count": nope\n}', 2),
    ('{\n  "count": 1\n', 3),
    ('', 1),
    ('{\n' + '\n' * 60 + '  "count": nope\n}', 62),
])
def test_invalid_json_highlights_its_line_and_updates_when_edited(new_context, details_backend, content, line):
    backend, game = details_backend
    (game / 'idata').mkdir()
    (game / 'idata' / 'broken.json').write_bytes(content.replace('\n', '\r\n').encode())
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.get_by_role('button', name='Inspect broken.json', exact=True).click()
    details = page.get_by_role('dialog', name='broken.json')
    editor = details.get_by_label('Text of broken.json')
    highlight = details.locator('.text-editor-error-line')
    expect(details.get_by_role('status')).to_contain_text('Not valid JSON:')
    expect(editor).to_have_attribute('aria-invalid', 'true')
    expect(highlight).to_have_attribute('data-line', str(line))
    details.get_by_role('button', name=f'Go to error on line {line}', exact=True).click()
    expect(editor).to_be_focused()
    assert editor.evaluate('el => el.selectionStart') == sum(len(part) + 1 for part in content.split('\n')[:line - 1])
    # The highlight tracks the actual line even after jumping and scrolling a long file.
    geometry = editor.evaluate('''el => {
      const style = getComputedStyle(el);
      const mark = el.parentElement.querySelector('.text-editor-error-line').getBoundingClientRect();
      return {actual: mark.top, expected: el.getBoundingClientRect().top + parseFloat(style.borderTopWidth)
        + parseFloat(style.paddingTop) + (Number(el.parentElement.querySelector('.text-editor-error-line').dataset.line) - 1)
        * parseFloat(style.lineHeight) - el.scrollTop, visible: mark.bottom > el.getBoundingClientRect().top
        && mark.top < el.getBoundingClientRect().bottom};
    }''')
    assert abs(geometry['actual'] - geometry['expected']) < 1
    assert geometry['visible']
    if line > 60:
        editor.evaluate('el => { el.scrollTop += 36; }')
        poll(lambda: highlight.evaluate('el => parseFloat(el.style.top)'),
             8 + (line - 1) * 18 - editor.evaluate('el => el.scrollTop'))
        BUILD.mkdir(exist_ok=True)
        page.screenshot(path=str(BUILD / 'text-editor-error-line.png'))

    editor.fill('{\n\n  "count": nope\n}')
    expect(highlight).to_have_attribute('data-line', '3')
    expect(details.get_by_role('button', name='Save', exact=True)).to_be_disabled()
    editor.fill('{\n  "count": 1\n}')
    expect(highlight).to_have_count(0)
    expect(editor).not_to_have_attribute('aria-invalid', 'true')
    expect(details.get_by_role('button', name='Save', exact=True)).to_be_enabled()
    details.get_by_role('button', name='Revert', exact=True).click()
    expect(editor).to_have_value(content)
    expect(highlight).to_have_attribute('data-line', str(line))
    assert errors == []
