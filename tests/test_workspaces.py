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
        assert first['config']['destination'] == str(tmp_path / 'first' / 'game')
        assert first['assetReport'] == {'reportPath': None, 'summary': None}
        # No report file exists before a workspace's first GDA sync run.
        assert first['rssSync']['workspaceId'] == 'first' and first['rssSync']['reportPath'] is None
        assert client.put('/api/workspace', json={'id': 'second'}).status_code == 403
        result = client.put('/api/workspace', headers=headers, json={'id': 'second'})
        assert result.status_code == 200
        assert result.json()['config']['destination'] == str(tmp_path / 'second' / 'game')
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
    assert restored.scan()['config']['destination'] == str(tmp_path / 'second' / 'game')


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
    status = lambda: next(asset for asset in library.dashboard()['assets'] if asset['workspaceId'] == 'first')
    asset = status()
    assert asset['status'] == 'new'
    assert library.sync([asset['id']])['copied'] == ['first.txt']
    assert (game / 'first.txt').read_text() == 'first' and (gda / 'first.txt').read_text() == 'first'
    assert status()['status'] == 'synced'

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
        assert result['missingFolders'] == ['source', 'destination']
        assert client.put('/api/workspace', headers=session_headers(client), json={'id': 'first'}).json()['missingFolders'] == []


def test_switch_refuses_while_operation_in_progress(tmp_path):
    library, path = configured_library(tmp_path)
    before = path.read_text()
    with TestClient(create_app(library, dev=True), base_url='http://127.0.0.1') as client:
        with library._operation:
            response = client.put('/api/workspace', headers=session_headers(client), json={'id': 'second'})
            assert response.status_code == 409
    assert path.read_text() == before


def test_dashboard_combines_workspaces_without_changing_the_selection(tmp_path):
    library, path = configured_library(tmp_path)
    for name in ('first', 'second'):
        (tmp_path / name / 'gda' / 'shared.txt').write_text('same')
    (tmp_path / 'first' / 'game' / 'shared.txt').write_text('same')
    (tmp_path / 'second' / 'game' / 'shared.txt').write_text('else')
    config = dict(library.config)
    persisted = path.read_text()
    with TestClient(create_app(library, dev=True), base_url='http://127.0.0.1') as client:
        response = client.get('/api/dashboard')
        assert response.status_code == 200
        dashboard = response.json()
    assert len(dashboard['assets']) == 4
    assert [workspace['id'] for workspace in dashboard['workspaces']] == ['first', 'second']
    assert dashboard['warnings'] == []
    shared = [asset for asset in dashboard['assets'] if asset['name'] == 'shared.txt']
    assert {asset['workspaceId']: asset['status'] for asset in shared} == {'first': 'synced', 'second': 'modified'}
    assert {asset['workspaceName'] for asset in shared} == {'First', 'Second'}
    assert shared[0]['id'] == shared[1]['id']  # Workspace ownership distinguishes matching relative paths.
    assert sum(asset['size'] for asset in dashboard['assets']) == len('firstsecondsamesame')
    assert library.config == config and path.read_text() == persisted
    assert library.activity == dashboard['activity'] == []
    assert not any(library.reports.status(name)['running'] for name in ('first', 'second'))


def test_dashboard_supports_a_single_workspace_configuration(library):
    dashboard = library.dashboard()
    assert len(dashboard['workspaces']) == 1 and dashboard['workspaces'][0]['id'] == 'current'
    assert len(dashboard['assets']) == 18
    assert all(asset['workspaceId'] == 'current' and asset['workspaceName'] == library.config['name'] for asset in dashboard['assets'])
    assert dashboard['warnings'] == []


@pytest.mark.parametrize('missing', ['source', 'destination'])
def test_dashboard_reports_missing_workspace_folders_without_creating_them(tmp_path, missing):
    library, path = configured_library(tmp_path)
    config = json.loads(path.read_text())
    absent = tmp_path / 'absent'
    config['workspaces'][1]['gda_path' if missing == 'source' else 'game_path'] = str(absent)
    path.write_text(json.dumps(config))
    library.init()
    dashboard = library.dashboard()
    assert dashboard['workspaces'][1]['missingFolders'] == [missing]
    assert any(warning.startswith('Second:') and 'folder does not exist' in warning for warning in dashboard['warnings'])
    assert len(dashboard['assets']) == (1 if missing == 'source' else 2)
    assert library.config['defaultWorkspace'] == 'first' and not absent.exists()


def test_dashboard_keeps_other_workspaces_when_one_cannot_be_read(tmp_path, monkeypatch):
    library, _ = configured_library(tmp_path)
    scan = library._scan_workspace

    def unreadable(config):
        if config['name'] == 'Second':
            raise PermissionError('Folder access denied')
        return scan(config)

    monkeypatch.setattr(library, '_scan_workspace', unreadable)
    dashboard = library.dashboard()
    assert len(dashboard['assets']) == 1 and dashboard['assets'][0]['workspaceId'] == 'first'
    assert dashboard['workspaces'][1]['error'] == 'Folder access denied'
    assert dashboard['warnings'] == ['Second: Folder access denied']


def test_dashboard_refreshes_file_status_after_a_workspace_copy(tmp_path):
    library, _ = configured_library(tmp_path)
    with TestClient(create_app(library, dev=True), base_url='http://127.0.0.1') as client:
        initial = client.get('/api/dashboard').json()
        assert all(asset['status'] == 'new' for asset in initial['assets'])
        headers = session_headers(client)
        client.put('/api/workspace', headers=headers, json={'id': 'second'})
        second = next(asset for asset in initial['assets'] if asset['workspaceId'] == 'second')
        result = client.post('/api/sync', headers=headers, json={'ids': [second['id']]})
        assert result.status_code == 200
        dashboard = client.get('/api/dashboard').json()
    assert {asset['workspaceId']: asset['status'] for asset in dashboard['assets']} == {'first': 'new', 'second': 'synced'}
    assert len(dashboard['activity']) == 1 and dashboard['activity'][0]['files'] == ['second.txt']
    assert library.config['defaultWorkspace'] == 'second'
