"""The arrow between a Game resource and its GDA version copies only that resource."""

import json

import pytest
from playwright.sync_api import expect

from egt_gda_sync.library import Library
from tests.e2e.conftest import BUILD, Backend, poll
from tests.test_rss_sync import write_example, write_sequences

pytestmark = pytest.mark.e2e


@pytest.fixture
def resource_backend(tmp_path, browser, request):
    game, gda = (write_sequences if request.param == 'sequence' else write_example)(tmp_path)
    if request.param == 'file':
        (game / 'other.dds').write_bytes(b'keep game')
        (gda / 'a' / 'other.dds').write_bytes(b'other GDA')
        descriptor = game / 'RssRawData.json'
        body = json.loads(descriptor.read_text())
        body['rawFiles'].append({'path': 'other.dds'})
        descriptor.write_text(json.dumps(body))
    home = tmp_path / 'app'
    home.mkdir()
    entry = {'id': 'example', 'game_name': 'Example', 'game_path': str(game), 'gda_path': str(gda), 'extensions': ['.dds']}
    (home / 'workspace.json').write_text(json.dumps({'workspaces': [entry], 'defaultWorkspace': 'example'}))
    library = Library(str(home))
    library.init()
    assert library.compare_workspace('example')['state'] == 'succeeded'
    library.close()
    server = Backend(home)
    yield server, game, gda, home
    server.stop()


def open_sync(page, backend):
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    expect(page.locator('.resource-card.is-different').first).to_be_visible()


@pytest.mark.parametrize('resource_backend', ['file'], indirect=True)
def test_copy_arrow_targets_its_card_and_replaces_only_its_game_file(new_context, resource_backend):
    backend, game, gda, home = resource_backend
    page = new_context().new_page()
    errors, copies = [], []
    held = {'status': None}
    page.on('pageerror', lambda error: errors.append(str(error)))

    def copy_resource(route):
        copies.append(route.request.post_data_json)
        response = route.fetch()
        body = response.json()
        held['status'] = body['library']['rssSync']
        route.fulfill(response=response, json=body)

    # Keep the comparison visible long enough to verify that the other copy button is disabled.
    page.route('**/api/rss-sync', lambda route: route.fulfill(json=held['status']) if held['status'] else route.continue_())
    page.route('**/api/rss-sync/copy', copy_resource)
    open_sync(page, backend)
    button = page.get_by_role('button', name='Copy GDA file over game file for changed.dds', exact=True)
    other = page.get_by_role('button', name='Copy GDA file over game file for other.dds', exact=True)
    expect(button).to_be_enabled()
    poll(lambda: button.locator('img').evaluate('image => image.complete && image.naturalWidth > 0'), True)
    # An existing selection does not turn a card's copy action into a bulk copy.
    page.get_by_role('checkbox', name='Select other.dds', exact=True).check()
    button.focus()
    page.keyboard.press('Enter')
    dialog = page.get_by_role('dialog')
    expect(dialog).to_be_visible()
    expect(dialog.locator('.sync-file-list')).to_contain_text('changed.dds')
    expect(dialog.locator('.sync-file-list')).not_to_contain_text('other.dds')
    expect(dialog.get_by_role('button', name='Sync 1 resource', exact=True)).to_be_visible()
    dialog.get_by_role('button', name='Cancel', exact=True).click()
    assert (game / 'changed.dds').read_bytes() == b'new' and copies == []
    BUILD.mkdir(exist_ok=True)
    page.locator('.resource-card').filter(has=button).screenshot(path=str(BUILD / 'resource-copy-arrow-desktop.png'))

    button.click()
    page.get_by_role('dialog').get_by_role('button', name='Sync 1 resource', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(other).to_be_disabled()
    assert len(copies) == 1 and len(copies[0]['ids']) == 1
    assert (game / 'changed.dds').read_bytes() == (gda / 'a' / 'changed.dds').read_bytes() == b'old'
    assert (game / 'other.dds').read_bytes() == b'keep game'
    assert [file.read_bytes() for file in (home / 'backups').rglob('changed.dds')] == [b'new']
    expect(page.get_by_role('button', name='Comparing…', exact=True)).to_be_visible()
    held['status'] = None
    expect(button).to_have_count(0)
    expect(other).to_be_enabled()
    assert errors == []


@pytest.mark.parametrize('resource_backend', ['sequence'], indirect=True)
def test_copy_arrow_syncs_different_sequence_frames_and_points_toward_game_on_mobile(new_context, resource_backend):
    backend, game, gda, _home = resource_backend
    page = new_context().new_page()
    open_sync(page, backend)
    row = next(row for row in backend.get('/api/rss-sync/report')['differences'] if row.get('sequence', {}).get('id') == 'ANIM')
    button = page.get_by_role('button', name=f"Copy different GDA frames over game files for {row['resource']}", exact=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    expect(page.locator('.main-panel')).to_have_css('width', '390px')
    button.scroll_into_view_if_needed()
    expect(button).to_be_enabled()
    poll(lambda: button.locator('img').evaluate('image => image.complete && image.naturalWidth > 0'), True)
    expect(button.locator('img')).to_have_css('transform', 'matrix(0, 1, -1, 0, 0, 0)')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    BUILD.mkdir(exist_ok=True)
    page.locator('.resource-card').filter(has=button).screenshot(path=str(BUILD / 'resource-copy-arrow-mobile.png'))
    button.click()
    dialog = page.get_by_role('dialog')
    expect(dialog.locator('.sync-file-list')).to_contain_text('ANIM')
    expect(dialog.locator('.sync-file-list > li')).to_have_count(1)
    dialog.get_by_role('button', name='Sync 1 resource', exact=True).click()
    poll(lambda: [(game / 'anim' / f'a_{number:02d}.dds').read_bytes() for number in range(3)], [b'0', b'one', b'two'])
    assert [(gda / 'DDS' / 'anim' / f'a_{number:02d}.dds').read_bytes() for number in range(3)] == [b'0', b'one', b'two']
    expect(button).to_have_count(0)
