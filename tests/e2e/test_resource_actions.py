"""The Sync page's main button applies the action of each selected resource by its status."""

import json

import pytest
from playwright.sync_api import expect

from egt_gda_sync.library import Library
from tests.e2e.conftest import BUILD, Backend
from tests.test_rss_sync import crlf, RAW_DESCRIPTOR, write_invalid

pytestmark = pytest.mark.e2e


@pytest.fixture
def actions_backend(tmp_path):
    game, gda = write_invalid(tmp_path)
    (game / "left.dds").write_bytes(b"left")
    (game / "absent.dds").write_bytes(b"absent")
    raw = game / "RssRawData.json"
    raw.write_bytes(raw.read_bytes().replace(b'"path": "kept.wav"', b'"path": "kept.wav"\r\n        },\r\n        {\r\n            "path": "absent.dds"'))
    home = tmp_path / 'app'
    home.mkdir()
    entry = {'id': 'example', 'game_name': 'Example', 'game_path': str(game), 'gda_path': str(gda), 'extensions': ['.dds', '.wav']}
    (home / 'workspace.json').write_text(json.dumps({'workspaces': [entry], 'defaultWorkspace': 'example'}))
    library = Library(str(home))
    library.init()
    assert library.compare_workspace('example')['state'] == 'succeeded'
    library.close()
    server = Backend(home)
    yield server, game, home
    server.stop()


def test_main_button_removes_invalid_declarations_and_deletes_supplementary_files(new_context, actions_backend):
    backend, game, home = actions_backend
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    expect(page.locator('.resource-card.is-invalid').first).to_be_visible()
    main = page.locator('.sync-workspace-actions .btn').first

    # Without a selection the button syncs every different resource, and there is none. A missing resource has no action.
    expect(main).to_have_text('Sync all pending')
    expect(main).to_be_disabled()
    expect(page.get_by_role('checkbox', name='Select absent.dds', exact=True)).to_have_count(0)

    page.get_by_role('checkbox', name='Select gone.wav', exact=True).check()
    expect(main).to_have_text('Remove declarations1')
    expect(main).to_have_class('btn btn-danger')
    page.get_by_role('checkbox', name='Select left.dds', exact=True).check()
    expect(main).to_have_text('Apply to selected2')
    main.click()

    dialog = page.get_by_role('dialog')
    expect(dialog).to_contain_text('Apply these changes to the game?')
    expect(dialog.locator('h6')).to_have_text(['Remove the declarations of 1 invalid resource', 'Delete 1 supplementary resource'])
    expect(dialog.locator('.sync-file-list').first).to_contain_text('RssAudioData.json:')
    BUILD.mkdir(exist_ok=True)
    dialog.screenshot(path=str(BUILD / 'resource-actions-dialog.png'))
    dialog.get_by_role('button', name='Apply to 2 resources', exact=True).click()

    expect(page.get_by_role('status')).to_contain_text('1 invalid resource removed from the descriptors, 1 supplementary resource deleted.')
    assert not (game / 'left.dds').exists()
    assert b'gone.wav' not in (game / 'RssRawData.json').read_bytes()
    assert [path.read_bytes() for path in (home / 'backups').rglob('RssRawData.json')][0].startswith(crlf(RAW_DESCRIPTOR)[:40])
    # The new report no longer lists them.
    expect(page.get_by_role('checkbox', name='Select gone.wav', exact=True)).to_have_count(0)
    expect(page.get_by_role('checkbox', name='Select left.dds', exact=True)).to_have_count(0)
    expect(main).to_have_text('Sync all pending')
    assert errors == []
