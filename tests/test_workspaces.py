import json

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.library import Library
from egt_gda_sync.server import create_app
from tests.conftest import session_headers


def configured_library(tmp_path, legacy=False):
    entries = []
    for name in ('first', 'second'):
        source, destination = tmp_path / name / 'gda', tmp_path / name / 'game'
        source.mkdir(parents=True)
        destination.mkdir()
        (source / f'{name}.txt').write_text(name)
        entry = {'id': name, ('name' if legacy else 'game_name'): name.title()}
        # Files are copied from the GDA folder (the source) to the game folder (the destination).
        entry.update({('source' if legacy else 'gda_path'): str(source), ('destination' if legacy else 'game_path'): str(destination)})
        entries.append(entry)
    path = tmp_path / 'workspace.json'
    ports = dict(port=3457, vite_port=5174)
    settings = {'workspaces': entries, ('activeWorkspace' if legacy else 'defaultWorkspace'): 'first'}
    settings.update(ports if legacy else {'config': ports})
    path.write_text(json.dumps(settings))
    library = Library(str(tmp_path / 'app'), config_path=str(path))
    library.init()
    return library, path


@pytest.mark.parametrize('legacy', [False, True])
def test_switch_persists_and_settings_update_only_selected_workspace(tmp_path, legacy):
    library, path = configured_library(tmp_path, legacy=legacy)
    with TestClient(create_app(library, dev=True), base_url='http://127.0.0.1') as client:
        headers = session_headers(client)
        first = client.get('/api/library').json()
        assert first['assets'][0]['name'] == 'first.txt'
        # No report file exists before a workspace's first GDA sync run.
        assert first['rssSync']['workspaceId'] == 'first' and first['rssSync']['reportPath'] is None
        assert client.put('/api/workspace', json={'id': 'second'}).status_code == 403
        result = client.put('/api/workspace', headers=headers, json={'id': 'second'})
        assert result.status_code == 200
        assert result.json()['assets'][0]['name'] == 'second.txt'
        assert result.json()['config']['defaultWorkspace'] == 'second'
        assert result.json()['rssSync']['workspaceId'] == 'second' and result.json()['rssSync']['reportPath'] is None
        config = result.json()['config']
        settings = {key: config[key] for key in ('name', 'source', 'destination')}
        settings['name'] = 'Renamed'
        assert client.put('/api/settings', headers=headers, json=settings).status_code == 200
        assert client.put('/api/workspace', headers=headers, json={'id': 'missing'}).status_code == 404
        assert library.config['defaultWorkspace'] == 'second'
    saved = json.loads(path.read_text())
    assert saved['workspaces'][0]['game_name'] == 'First'
    assert saved['workspaces'][1]['game_name'] == 'Renamed'
    assert saved['defaultWorkspace'] == 'second' and 'activeWorkspace' not in saved
    assert saved['config'] == {'port': 3457, 'vite_port': 5174}
    assert next(iter(saved)) == 'config'
    assert 'source' not in saved and 'port' not in saved and 'vite_port' not in saved
    for entry in saved['workspaces']:
        assert 'game_path' in entry and 'gda_path' in entry
        assert 'name' not in entry and 'source' not in entry and 'destination' not in entry
    restored = Library(library.home, config_path=str(path))
    restored.init()
    assert restored.config['name'] == 'Renamed'
    assert restored.scan()['assets'][0]['name'] == 'second.txt'


@pytest.mark.parametrize('change', ['empty', 'duplicate', 'unknown', 'invalid_path', 'invalid_config', 'missing_path'])
def test_rejects_invalid_workspace_lists(tmp_path, change):
    library, path = configured_library(tmp_path)
    config = json.loads(path.read_text())
    if change == 'empty':
        config['workspaces'] = []
    elif change == 'duplicate':
        config['workspaces'][1]['id'] = 'first'
    elif change == 'unknown':
        config['defaultWorkspace'] = 'missing'
    elif change == 'invalid_path':
        config['workspaces'][1]['game_path'] = 'relative/workspace-source'
    elif change == 'invalid_config':
        config['config'] = []
    else:
        del config['workspaces'][1]['gda_path']
    path.write_text(json.dumps(config))
    with pytest.raises(RuntimeError, match='Could not read workspace.json'):
        library.init()


def test_sync_copies_from_the_gda_folder_to_the_game_folder(tmp_path):
    library, path = configured_library(tmp_path)
    gda, game = tmp_path / 'first' / 'gda', tmp_path / 'first' / 'game'
    assert library.config['source'] == str(gda) and library.config['destination'] == str(game)
    asset = library.scan()['assets'][0]
    assert asset['status'] == 'new'
    assert library.sync([asset['id']])['copied'] == ['first.txt']
    assert (game / 'first.txt').read_text() == 'first' and (gda / 'first.txt').read_text() == 'first'
    assert library.scan()['assets'][0]['status'] == 'synced'

    # Saving settings writes the GDA folder back as gda_path and the game folder as game_path.
    library.update_config('Renamed', str(gda), str(game))
    saved = json.loads(path.read_text())['workspaces'][0]
    assert saved['gda_path'] == str(gda) and saved['game_path'] == str(game)
    # The GDA sync compares the game's resources with the GDA folder.
    workspace, settings = library._comparison('first', library.workspace_entries()[0][1])
    assert workspace['gda_path'] == str(gda) and workspace['game_path'] == str(game)
    assert settings['gda_dir'] == str(gda) and settings['resources_dir'] == str(tmp_path / 'first') and settings['game'] == 'game'


def test_a_workspace_with_missing_folders_loads_and_can_be_selected(tmp_path):
    library, path = configured_library(tmp_path)
    config = json.loads(path.read_text())
    config['workspaces'][1].update(game_path=str(tmp_path / 'absent' / 'game'), gda_path=str(tmp_path / 'absent' / 'gda'))
    path.write_text(json.dumps(config))
    library.init()
    assert library.missing_folders() == []
    with TestClient(create_app(library, dev=True), base_url='http://127.0.0.1') as client:
        result = client.put('/api/workspace', headers=session_headers(client), json={'id': 'second'}).json()
        assert result['assets'] == [] and result['missingFolders'] == ['source', 'destination']
        assert client.put('/api/workspace', headers=session_headers(client), json={'id': 'first'}).json()['missingFolders'] == []


def test_switch_refuses_while_operation_in_progress(tmp_path):
    library, path = configured_library(tmp_path)
    before = path.read_text()
    with TestClient(create_app(library, dev=True), base_url='http://127.0.0.1') as client:
        with library._operation:
            response = client.put('/api/workspace', headers=session_headers(client), json={'id': 'second'})
            assert response.status_code == 409
    assert path.read_text() == before
