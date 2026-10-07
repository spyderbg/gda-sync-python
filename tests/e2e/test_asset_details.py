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
    page.get_by_role('button', name='Generate report', exact=True).click()
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
    expect(details.get_by_text(str(game / 'banner.dds'), exact=True)).to_be_visible()
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
