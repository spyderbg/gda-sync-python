"""Moves and key renames are previewed, preserve references and can be undone as one operation."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.app.server import create_app
from egt_gda_sync.sync.rss_refactor import apply_edits, plan_move, references, plan_key_rename
from egt_gda_sync.workspace.library import Library
from tests.conftest import session_headers


def write(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2), encoding='utf-8')


@pytest.fixture
def client(tmp_path, monkeypatch):
    root = tmp_path / 'resources'
    game, other = root / 'game', root / 'other'
    for name in ('Loading.dds', 'Topper.dds'):
        file = other / 'art' / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(name.encode())
    write(game / 'RssImagesData.json', {'images': [
        {'id': 'LOAD', 'path': '../other/art/Loading.dds'},
        {'id': 'LOAD_HD', 'path': '../other/art/Loading.dds', 'resolution': '1920x1080'},
        {'id': 'TOP', 'path': '../other/art/Topper.dds'}]})
    write(game / 'RssRawData.json', {'rawFiles': [{'path': '../other/art/Loading.dds'}, {'path': '../other/art/Topper.dds'}]})
    write(other / 'RssImagesData.json', {'images': [{'id': 'TOP', 'path': 'art/Topper.dds'}]})
    gda = tmp_path / 'gda'
    gda.mkdir()
    config = tmp_path / 'workspace.json'
    write(config, {'workspaces': [{'id': 'game', 'game_name': 'Game', 'game_path': str(game), 'gda_path': str(gda)}], 'defaultWorkspace': 'game'})
    library = Library(str(tmp_path / 'app'), config_path=str(config))
    library.init()
    monkeypatch.setattr(library, 'start_comparison', lambda: None)
    with TestClient(create_app(library, dev=True), base_url='http://127.0.0.1') as api:
        api.headers.update(session_headers(api))
        api.game, api.root, api.library = game, root, library
        assert api.post('/api/asset-report').status_code == 200
        yield api


def preview(client, **body):
    response = client.post('/api/asset-report/move/preview', json=body)
    assert response.status_code == 200, response.text
    return response.json()


def asset(client, resource):
    return next(row for row in client.get('/api/asset-report').json()['assets'] if row['resource'] == resource)


def codes(plan):
    return {item['code'] for item in plan['blockers']}


def test_copy_in_updates_five_entries_preserves_other_game_and_restore_undoes(client):
    original = {file: file.read_bytes() for file in client.root.rglob('*') if file.is_file()}
    report = client.get('/api/asset-report').json()
    assert report['version'] == 9 and report['summary']['otherGame'] == 2
    assert [f['kind'] for f in report['folders']] == ['game', 'other-game']
    assert {row['scope'] for row in report['assets']} == {'other-game'}
    body = {'folder': str(client.root / 'other'), 'target': ''}
    plan = preview(client, **body)
    assert not plan['blockers']
    assert [item['mode'] for item in plan['files']] == ['copy', 'copy']
    assert sum(map(len, plan['edits'].values())) == 5
    response = client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']})
    assert response.status_code == 200, response.text
    assert len(response.json()['assets']) == 2
    assert (client.game / 'art' / 'Loading.dds').read_bytes() == b'Loading.dds'
    assert not client.get('/api/asset-report').json()['summary']['otherGame']
    operation = client.get('/api/backups').json()['backups'][0]
    assert operation['action'] == 'move'
    files = client.get('/api/backups/' + operation['id']).json()['files']
    assert len([f for f in files if f['change'] == 'created']) == 2
    restored = client.post('/api/backups/restore', json={'id': operation['id']}).json()
    assert not restored['failures']
    assert not (client.game / 'art' / 'Loading.dds').exists()
    for file, data in original.items():
        assert file.read_bytes() == data


def test_changed_created_file_is_never_deleted_by_restore(client):
    body = {'assets': [asset(client, '../other/art/Loading.dds')['id']], 'target': 'art'}
    plan = preview(client, **body)
    assert client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']}).status_code == 200
    created = client.game / 'art' / 'Loading.dds'
    created.write_bytes(b'edited later')
    operation = client.get('/api/backups').json()['backups'][0]
    result = client.post('/api/backups/restore', json={'id': operation['id']}).json()
    assert len(result['failures']) == 1 and 'changed' in result['failures'][0]['message']
    assert created.read_bytes() == b'edited later'


def test_stale_preview_and_blocked_plan_are_refused(client):
    body = {'assets': [asset(client, '../other/art/Loading.dds')['id']], 'target': 'art'}
    plan = preview(client, **body)
    (client.root / 'other' / 'art' / 'Loading.dds').write_bytes(b'changed')
    assert client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']}).status_code == 409
    target = client.game / 'art' / 'Loading.dds'
    target.parent.mkdir()
    target.write_bytes(b'collision')
    blocked = preview(client, **body)
    assert 'target-exists' in codes(blocked)
    assert client.post('/api/asset-report/move', json={**body, 'fingerprint': blocked['fingerprint']}).status_code == 409


def test_reuses_identical_target_and_blocks_collision_or_escape(client):
    source = client.root / 'other' / 'art' / 'Loading.dds'
    target = client.game / 'art' / 'Loading.dds'
    target.parent.mkdir()
    target.write_bytes(source.read_bytes())
    body = {'assets': [asset(client, '../other/art/Loading.dds')['id']], 'target': 'art'}
    plan = preview(client, **body)
    assert plan['files'][0]['mode'] == 'reuse'
    assert client.post('/api/asset-report/move/preview', json={**body, 'target': '../escape'}).status_code == 400
    assert client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']}).status_code == 200
    assert source.exists()


def test_engine_blocks_two_sources_to_one_target_and_case_collision(client):
    sources = [client.root / 'other' / 'art' / name for name in ('Loading.dds', 'Topper.dds')]
    index = references(client.game, client.root)
    for targets in ([client.game / 'x.dds'] * 2, [client.game / 'x.dds', client.game / 'X.dds']):
        assert 'target-collision' in codes(plan_move(index, dict(zip(sources, targets)), client.game, client.root).json())
    (client.game / 'ART').mkdir()
    assert 'case-collision' in codes(plan_move(index, {sources[0]: client.game / 'art' / 'x.dds'}, client.game, client.root).json())


def test_sequence_template_and_audio_samples_move_together(client):
    for i in range(3):
        (client.game / f'a_{i:02}.dds').write_bytes(bytes([i]))
    write(client.game / 'RssImagesSeqData.json', {'imagesSeq': [{'id': 'ANIM', 'frameTime': 25, 'loopCount': 0, 'frames': [{'path': 'a_{00-02}.dds'}]}]})
    write(client.game / 'RssAudioData.json', {'audioEvents': [{'id': 'SOUND', 'samples': ['a_00.dds']}]})
    client.post('/api/asset-report')
    row = next(row for row in client.get('/api/asset-report').json()['assets'] if row.get('sequence'))
    body = {'assets': [row['id']], 'target': 'anim'}
    plan = preview(client, **body)
    assert not plan['blockers']
    edits = [e['new'] for group in plan['edits'].values() for e in group]
    assert 'anim/a_{00-02}.dds' in edits and 'anim/a_00.dds' in edits
    assert client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']}).status_code == 200
    assert not (client.game / 'a_00.dds').exists()
    index = references(client.game, client.root)
    split = plan_move(index, {client.game / 'anim' / 'a_00.dds': client.game / 'elsewhere' / 'a_00.dds'}, client.game, client.root)
    assert 'split-sequence' in codes(split.json())


@pytest.mark.parametrize('declared_sequence', [True, False])
def test_move_bell_animation_updates_images_using_first_middle_and_last_frame(client, declared_sequence):
    source = client.game / 'bell' / 'DDS'
    source.mkdir(parents=True)
    contents = {f'Bell_330x284px_{index:05}.dds': bytes([index]) for index in range(50)}
    for name, value in contents.items():
        (source / name).write_bytes(value)
    images = {'images': [{'id': f'IMAGE_REEL_BCTS_{index}', 'path': f'bell/DDS/Bell_330x284px_{index:05}.dds'}
                         for index in (0, 25, 49)]}
    write(client.game / 'RssImagesData.json', images)
    sequence = {'id': 'ANIM_REEL_BELL_ANIM', 'frameTime': 60, 'loopCount': 0, 'loopTo': 16,
                'frames': [{'path': 'bell/DDS/Bell_330x284px_{00000-00049}.dds'}]}
    if declared_sequence:
        write(client.game / 'RssImagesSeqData.json', {'imagesSeq': [sequence]})
    assert client.post('/api/asset-report').status_code == 200
    row = asset(client, 'bell/DDS/Bell_330x284px_{00000-00049}.dds')
    assert len(row['sequence']['frames']) == 50
    body = {'assets': [row['id']], 'target': 'moved/bell'}
    plan = preview(client, **body)
    assert not plan['blockers'] and len(plan['files']) == 50
    updates = [edit['new'] for edits in plan['edits'].values() for edit in edits]
    for index in (0, 25, 49):
        assert f'moved/bell/Bell_330x284px_{index:05}.dds' in updates
    if declared_sequence:
        assert 'moved/bell/Bell_330x284px_{00000-00049}.dds' in updates
    response = client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']})
    assert response.status_code == 200, response.text
    moved_images = json.loads((client.game / 'RssImagesData.json').read_text())
    assert moved_images == {'images': [{**entry, 'path': entry['path'].replace('bell/DDS/', 'moved/bell/')} for entry in images['images']]}
    if declared_sequence:
        assert json.loads((client.game / 'RssImagesSeqData.json').read_text()) == {'imagesSeq': [
            {**sequence, 'frames': [{'path': 'moved/bell/Bell_330x284px_{00000-00049}.dds'}]}]}
    for name, value in contents.items():
        assert not (source / name).exists()
        assert (client.game / 'moved' / 'bell' / name).read_bytes() == value
    moved = asset(client, 'moved/bell/Bell_330x284px_{00000-00049}.dds')
    assert len(moved['sequence']['frames']) == 50
    assert response.json()['assets'][row['id']] == moved['id']
    assert asset(client, 'moved/bell/Bell_330x284px_00000.dds')['category'] == 'available'
    operation = client.get('/api/backups').json()['backups'][0]
    assert not client.post('/api/backups/restore', json={'id': operation['id']}).json()['failures']
    assert json.loads((client.game / 'RssImagesData.json').read_text()) == images
    for name, value in contents.items():
        assert (source / name).read_bytes() == value
        assert not (client.game / 'moved' / 'bell' / name).exists()


def test_move_shared_frames_updates_all_sequences_and_keeps_their_identity(client):
    source = client.game / 'shared'
    source.mkdir()
    for index in range(3):
        (source / f'a_{index:02}.dds').write_bytes(bytes([index]))
    (client.game / 'cover.dds').write_bytes(b'cover')
    sequences = {'imagesSeq': [
        {'id': 'NORMAL', 'frameTime': 60, 'loopCount': 0, 'loopTo': 1, 'frames': [{'path': 'shared/a_{00-02}.dds'}]},
        {'id': 'FAST', 'frameTime': 30, 'loopCount': 2, 'frames': [{'path': 'shared/a_{00-02}.dds'}]},
        {'id': 'MIXED', 'frameTime': 40, 'loopCount': 1, 'frames': [
            {'path': 'shared/a_00.dds', 'source': {'x': 0, 'y': 0, 'w': 4, 'h': 4}},
            {'path': 'cover.dds'},
            {'path': 'shared/a_00.dds', 'source': {'x': 4, 'y': 0, 'w': 4, 'h': 4}},
        ]},
    ]}
    images = {'images': [{'id': 'FIRST', 'path': 'shared/a_00.dds'}]}
    descriptor = client.game / 'RssImagesSeqData.json'
    write(descriptor, sequences)
    write(client.game / 'RssImagesData.json', images)
    assert client.post('/api/asset-report').status_code == 200
    rows = {row['sequence']['id']: row for row in client.get('/api/asset-report').json()['assets'] if row.get('sequence')}
    assert set(rows) == {'NORMAL', 'FAST', 'MIXED'}
    assert all(len(row['sequence']['frames']) == 3 for row in rows.values())
    body = {'assets': [rows['FAST']['id']], 'target': 'moved'}
    plan = preview(client, **body)
    assert not plan['blockers']
    assert len(plan['files']) == len({item['source'] for item in plan['files']}) == 3
    assert all(item['mode'] == 'move' for item in plan['files'])
    response = client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']})
    assert response.status_code == 200, response.text
    # All ranges, repeated atlas frames and standalone images follow the shared files. Playback settings stay intact.
    assert json.loads(descriptor.read_text()) == json.loads(json.dumps(sequences).replace('shared/', 'moved/'))
    assert json.loads((client.game / 'RssImagesData.json').read_text()) == {
        'images': [{'id': 'FIRST', 'path': 'moved/a_00.dds'}]}
    moved = {row['sequence']['id']: row for row in client.get('/api/asset-report').json()['assets'] if row.get('sequence')}
    assert set(moved) == set(rows) and len({row['id'] for row in moved.values()}) == 3
    assert response.json()['assets'][rows['FAST']['id']] == moved['FAST']['id']
    assert all(row['category'] == 'available' and len(row['sequence']['frames']) == 3 for row in moved.values())
    for index in range(3):
        assert not (source / f'a_{index:02}.dds').exists()
        assert (client.game / 'moved' / f'a_{index:02}.dds').read_bytes() == bytes([index])
    assert (client.game / 'cover.dds').read_bytes() == b'cover'
    operation = client.get('/api/backups').json()['backups'][0]
    assert not client.post('/api/backups/restore', json={'id': operation['id']}).json()['failures']
    assert json.loads(descriptor.read_text()) == sequences
    assert json.loads((client.game / 'RssImagesData.json').read_text()) == images
    for index in range(3):
        assert (source / f'a_{index:02}.dds').read_bytes() == bytes([index])
        assert not (client.game / 'moved' / f'a_{index:02}.dds').exists()


def test_overlapping_ranges_block_a_partial_move_and_move_together_once(client):
    source = client.game / 'shared'
    source.mkdir()
    for index in range(8):
        (source / f'a_{index:02}.dds').write_bytes(bytes([index]))
    sequences = {'imagesSeq': [
        {'id': 'FIRST', 'frameTime': 60, 'loopCount': 0, 'frames': [{'path': 'shared/a_{00-04}.dds'}]},
        {'id': 'SECOND', 'frameTime': 30, 'loopCount': 2, 'loopTo': 1, 'frames': [{'path': 'shared/a_{03-07}.dds'}]},
    ]}
    descriptor = client.game / 'RssImagesSeqData.json'
    write(descriptor, sequences)
    original = descriptor.read_bytes()
    assert client.post('/api/asset-report').status_code == 200
    rows = {row['sequence']['id']: row for row in client.get('/api/asset-report').json()['assets'] if row.get('sequence')}
    assert set(rows) == {'FIRST', 'SECOND'}
    assert all(len(row['sequence']['frames']) == 5 for row in rows.values())
    body = {'assets': [rows['FIRST']['id']], 'target': 'moved'}
    blocked = preview(client, **body)
    assert 'split-sequence' in codes(blocked)
    assert client.post('/api/asset-report/move', json={**body, 'fingerprint': blocked['fingerprint']}).status_code == 409
    assert descriptor.read_bytes() == original
    assert not (client.game / 'moved').exists()
    for index in range(8):
        assert (source / f'a_{index:02}.dds').read_bytes() == bytes([index])
    body['assets'] = [row['id'] for row in rows.values()]
    plan = preview(client, **body)
    assert not plan['blockers']
    assert len(plan['files']) == len({item['source'] for item in plan['files']}) == 8
    response = client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']})
    assert response.status_code == 200, response.text
    assert json.loads(descriptor.read_text()) == json.loads(json.dumps(sequences).replace('shared/', 'moved/'))
    moved = {row['sequence']['id']: row for row in client.get('/api/asset-report').json()['assets'] if row.get('sequence')}
    assert set(moved) == set(rows)
    for key, row in rows.items():
        assert response.json()['assets'][row['id']] == moved[key]['id']
        assert moved[key]['category'] == 'available' and len(moved[key]['sequence']['frames']) == 5
    for index in range(8):
        assert not (source / f'a_{index:02}.dds').exists()
        assert (client.game / 'moved' / f'a_{index:02}.dds').read_bytes() == bytes([index])


def test_rtf_moves_whole_folder(client):
    write(client.game / 'help' / 'project.rtf', {'pages': []})
    (client.game / 'help' / 'extra.bin').write_bytes(b'rtf sibling')
    write(client.game / 'RssRtfsData.json', {'rtfs': [{'id': 'HELP', 'path': 'help/project.rtf'}]})
    client.post('/api/asset-report')
    row = asset(client, 'help')
    body = {'assets': [row['id']], 'target': 'screens', 'name': 'rules'}
    plan = preview(client, **body)
    assert len(plan['files']) == 2
    assert client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']}).status_code == 200
    assert not (client.game / 'help').exists()
    assert (client.game / 'screens' / 'rules' / 'extra.bin').read_bytes() == b'rtf sibling'


def test_game_file_used_by_sibling_is_copied(client):
    source = client.game / 'shared.dds'
    source.write_bytes(b'shared')
    write(client.root / 'other' / 'RssRawData.json', {'rawFiles': [{'path': '../game/shared.dds'}]})
    client.post('/api/asset-report')
    plan = preview(client, assets=[asset(client, 'shared.dds')['id']], target='new')
    assert plan['files'][0]['mode'] == 'copy'
    assert 'other-users' in {item['code'] for item in plan['warnings']}


def test_common_descriptors_are_never_edited_and_list_including_games(client):
    write(client.root / 'common' / 'feature' / 'RssData.json', {'images': [{'id': 'COMMON', 'path': '../other/art/Loading.dds'}]})
    write(client.game / 'AllRssData.json', {'include': ['../common/feature/RssData.json']})
    write(client.root / 'other' / 'AllRssData.json', {'include': ['../common/feature/RssData.json']})
    plan = preview(client, assets=[asset(client, '../other/art/Loading.dds')['id']], target='art')
    assert 'common-reference' in codes(plan)
    assert 'other' in next(item['message'] for item in plan['blockers'] if item['code'] == 'common-reference')


def rename_preview(client, **body):
    response = client.post('/api/asset-report/rename-key/preview', json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_rename_variants_views_idata_styles_and_preserves_format(client):
    descriptor = client.game / 'RssImagesData.json'
    write(descriptor, {'images': [{'id': 'LOAD', 'path': '../other/art/Loading.dds'}, {'id': 'LOAD', 'path': '../other/art/Loading.dds', 'resolution': '1920x1080'}]})
    original = b'\xef\xbb\xbf' + descriptor.read_bytes().replace(b'\n', b'\r\n') + b'\r\n'
    descriptor.write_bytes(original)
    write(client.game / 'v' / '1920x1080' / 'Main.json', {'elements': [{'type': 'Image', 'rssKey': 'LOAD'}, {'type': 'Button', 'rssKeys': ['LOAD']}]})
    write(client.game / 'idata' / 'Spin.json', {'rssId': 'LOAD', 'label': 'LOAD', 'substring': 'LOAD_HD'})
    body = {'kind': 'Image', 'key': 'LOAD', 'newKey': 'NEW_LOAD'}
    plan = rename_preview(client, **body)
    assert not plan['blockers']
    optional = next(e for group in plan['edits'].values() for e in group if e['field'] == 'label')
    body['excluded'] = [optional['id']]
    plan = rename_preview(client, **body)
    assert client.post('/api/asset-report/rename-key', json={**body, 'fingerprint': plan['fingerprint']}).status_code == 200
    assert descriptor.read_bytes() == original.replace(b'"LOAD"', b'"NEW_LOAD"')
    assert json.loads((client.game / 'idata' / 'Spin.json').read_text()) == {'rssId': 'NEW_LOAD', 'label': 'LOAD', 'substring': 'LOAD_HD'}
    assert 'NEW_LOAD' in (client.game / 'v' / '1920x1080' / 'Main.json').read_text()
    operation = next(item for item in client.get('/api/backups').json()['backups'] if item['action'] == 'rename')
    assert not client.post('/api/backups/restore', json={'id': operation['id']}).json()['failures']
    assert descriptor.read_bytes() == original


def test_font_and_text_style_structural_references(client):
    write(client.game / 'RssFontsData.json', {'fonts': [{'id': 'FONT', 'path': 'font.ttf', 'chars': 'abc', 'size': 20}]})
    write(client.game / 'RssTextStylesData.json', {'styles': [{'id': 'STYLE', 'font_id': 'FONT', 'size': 20}]})
    write(client.game / 'v' / 'Main.json', {'elements': [{'type': 'Text', 'rssStyleId': 'STYLE'}]})
    for kind, key, field in [('Font', 'FONT', 'styles.0.font_id'), ('TextStyle', 'STYLE', 'elements.0.rssStyleId')]:
        plan = rename_preview(client, kind=kind, key=key, newKey='NEW_' + key)
        assert not plan['blockers']
        assert any(e['field'] == field for group in plan['edits'].values() for e in group)


def test_rename_collisions_common_references_and_code_warning(client):
    assert 'key-collision' in codes(rename_preview(client, kind='Image', key='LOAD', newKey='TOP'))
    assert 'invalid-key' in codes(rename_preview(client, kind='Image', key='LOAD', newKey='bad key'))
    plan = rename_preview(client, kind='Image', key='LOAD', newKey='NEW')
    assert {'game-code', 'no-references'} <= {item['code'] for item in plan['warnings']}
    write(client.root / 'common' / 'feature' / 'RssData.json', {'images': []})
    write(client.game / 'AllRssData.json', {'include': ['../common/feature/RssData.json']})
    write(client.root / 'common' / 'feature' / 'v' / 'Main.json', {'elements': [{'type': 'Image', 'rssKey': 'LOAD'}]})
    assert 'common-reference' in codes(rename_preview(client, kind='Image', key='LOAD', newKey='NEW'))
    write(client.root / 'common' / 'feature' / 'RssData.json', {'images': [{'id': 'COMMON', 'path': '../other/art/Topper.dds'}]})
    assert 'common-reference' in codes(rename_preview(client, kind='Image', key='COMMON', newKey='NEW'))


def test_failed_write_rolls_back_every_changed_file(client, monkeypatch):
    import egt_gda_sync.workspace.library as module
    body = {'folder': str(client.root / 'other'), 'target': ''}
    plan = preview(client, **body)
    before = {p: p.read_bytes() for p in client.root.rglob('*') if p.is_file()}
    original = module._write_file
    calls = 0
    def fail_second(path, data):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError('injected failure')
        original(path, data)
    monkeypatch.setattr(module, '_write_file', fail_second)
    response = client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']})
    assert response.status_code == 409
    assert {p: p.read_bytes() for p in client.root.rglob('*') if p.is_file()} == before


def test_resource_paths_and_symlinks_block_moves(client):
    source = client.root / 'other' / 'art' / 'Loading.dds'
    client.library.config['workspaces'][0]['resource_paths'] = ['../other/art/Loading.dds']
    body = {'assets': [asset(client, '../other/art/Loading.dds')['id']], 'target': 'art'}
    assert 'resource-paths' in codes(preview(client, **body))
    outside = client.root.parent / 'escape'
    outside.mkdir()
    (client.game / 'link').symlink_to(outside, target_is_directory=True)
    assert client.post('/api/asset-report/move/preview', json={**body, 'target': 'link'}).status_code == 400
    assert source.exists()


def test_move_keeps_bom_crlf_and_unicode_path(client):
    file = client.game / 'RssImagesData.json'
    original = b'\xef\xbb\xbf' + file.read_bytes().replace(b'\n', b'\r\n') + b'\r\n'
    file.write_bytes(original)
    body = {'assets': [asset(client, '../other/art/Loading.dds')['id']], 'target': 'art', 'name': 'ново.dds'}
    plan = preview(client, **body)
    result = client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']})
    assert result.status_code == 200, result.text
    assert file.read_bytes() == original.replace(b'../other/art/Loading.dds', 'art/ново.dds'.encode())


def test_text_matches_are_reported_and_left_unchanged(client):
    text = client.game / 'config.ini'
    text.write_text('key=LOAD\nnot=PRELOAD\n')
    plan = rename_preview(client, kind='Image', key='LOAD', newKey='RENAMED')
    assert 'text-reference' in {item['code'] for item in plan['warnings']}
    assert str(text) not in plan['edits']


def test_overlapping_moves_cannot_delete_a_reused_target(client):
    first, second = client.game / 'a.dds', client.game / 'b.dds'
    first.write_bytes(b'same')
    second.write_bytes(b'same')
    plan = plan_move(references(client.game, client.root), {first: second, second: client.game / 'c.dds'}, client.game, client.root)
    assert 'overlapping-move' in codes(plan.json())


def test_failed_source_delete_rolls_back_a_previously_deleted_source(client, monkeypatch):
    import egt_gda_sync.workspace.library as module
    for name in ('one.dds', 'two.dds'):
        (client.game / name).write_bytes(name.encode())
    client.post('/api/asset-report')
    body = {'assets': [asset(client, name)['id'] for name in ('one.dds', 'two.dds')], 'target': 'moved'}
    plan = preview(client, **body)
    original = module._delete_with_backup
    calls = 0
    def fail_second(path, backup):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError('cannot delete')
        return original(path, backup)
    monkeypatch.setattr(module, '_delete_with_backup', fail_second)
    response = client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']})
    assert response.status_code == 409
    for name in ('one.dds', 'two.dds'):
        assert (client.game / name).read_bytes() == name.encode()
    assert not (client.game / 'moved').exists()


def test_changed_rtf_directory_invalidates_the_preview(client):
    write(client.game / 'help' / 'project.rtf', {'pages': []})
    write(client.game / 'RssRtfsData.json', {'rtfs': [{'id': 'HELP', 'path': 'help/project.rtf'}]})
    client.post('/api/asset-report')
    body = {'assets': [asset(client, 'help')['id']], 'target': 'new'}
    plan = preview(client, **body)
    (client.game / 'help' / 'new-page.bin').write_bytes(b'new')
    response = client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']})
    assert response.status_code == 409
    assert (client.game / 'help' / 'project.rtf').is_file()


def test_single_frame_template_is_preserved(client):
    source = client.game / 'one_00.dds'
    source.write_bytes(b'frame')
    write(client.game / 'RssImagesSeqData.json', {'imagesSeq': [{'id': 'SINGLE', 'frameTime': 25, 'loopCount': 0, 'frames': [{'path': 'one_{00-00}.dds'}]}]})
    index = references(client.game, client.root)
    plan = plan_move(index, {source: client.game / 'anim' / source.name}, client.game, client.root)
    assert not plan.blockers
    assert next(iter(plan.edits.values()))[0]['new'] == 'anim/one_{00-00}.dds'


def test_engine_rejects_invalid_target_names(client):
    source = client.root / 'other' / 'art' / 'Loading.dds'
    for name in ('bad?.dds', 'CON.dds', 'bad. '):
        plan = plan_move(references(client.game, client.root), {source: client.game / name}, client.game, client.root)
        assert 'invalid-target' in codes(plan.json())


def test_apply_edits_checks_spans_and_validates_descriptor():
    text = '{\r\n  "rawFiles": [{"path": "old"}]\r\n}\r\n'
    start = text.index('"old"')
    edit = {'start': start, 'end': start + 5, 'old': 'old', 'new': 'ново'}
    result = apply_edits('\ufeff' + text, [edit], Path('RssRawData.json'))
    assert result == '\ufeff' + text.replace('"old"', '"ново"')
    with pytest.raises(ValueError):
        apply_edits(text, [{**edit, 'old': 'wrong'}])


def test_rename_failure_rolls_back_all_texts(client, monkeypatch):
    import egt_gda_sync.workspace.library as module
    write(client.game / 'idata' / 'Main.json', {'rssId': 'LOAD'})
    body = {'kind': 'Image', 'key': 'LOAD', 'newKey': 'NEW'}
    plan = rename_preview(client, **body)
    before = {p: p.read_bytes() for p in client.game.rglob('*') if p.is_file()}
    original = module._write_file
    calls = 0
    def fail_second(path, data):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError('injected rename failure')
        original(path, data)
    monkeypatch.setattr(module, '_write_file', fail_second)
    assert client.post('/api/asset-report/rename-key', json={**body, 'fingerprint': plan['fingerprint']}).status_code == 409
    assert {p: p.read_bytes() for p in client.game.rglob('*') if p.is_file()} == before


def test_declared_common_view_blocks_rename_without_a_common_descriptor(client):
    write(client.game / 'RssElementsListData.json', {'elements': [{'id': 'CommonView', 'path': '../common/v/Main.json'}]})
    write(client.root / 'common' / 'v' / 'Main.json', {'elements': [{'type': 'Image', 'rssKey': 'LOAD'}]})
    assert 'common-reference' in codes(rename_preview(client, kind='Image', key='LOAD', newKey='NEW'))


def test_copy_source_changed_after_revalidation_is_refused(client, monkeypatch):
    import egt_gda_sync.workspace.library as module
    body = {'assets': [asset(client, '../other/art/Loading.dds')['id']], 'target': 'art'}
    plan = preview(client, **body)
    original = module._replace_file
    def change_before_copy(source, *args, **kwargs):
        Path(source).write_bytes(b'changed just before copy')
        return original(source, *args, **kwargs)
    monkeypatch.setattr(module, '_replace_file', change_before_copy)
    assert client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']}).status_code == 409
    assert not (client.game / 'art' / 'Loading.dds').exists()
    assert '../other/art/Loading.dds' in (client.game / 'RssImagesData.json').read_text()


def test_restore_keeps_changed_copy_and_removes_other_unchanged_copies(client):
    body = {'folder': str(client.root / 'other'), 'target': ''}
    plan = preview(client, **body)
    assert client.post('/api/asset-report/move', json={**body, 'fingerprint': plan['fingerprint']}).status_code == 200
    (client.game / 'art' / 'Loading.dds').write_bytes(b'edited')
    operation = client.get('/api/backups').json()['backups'][0]
    result = client.post('/api/backups/restore', json={'id': operation['id']}).json()
    assert len(result['failures']) == 1
    assert (client.game / 'art' / 'Loading.dds').read_bytes() == b'edited'
    assert not (client.game / 'art' / 'Topper.dds').exists()


def test_move_folder_browser_lists_real_directories_including_empty_ones(client):
    (client.game / 'art' / '1920x1080' / 'Empty').mkdir(parents=True)
    (client.game / 'Audio').mkdir()
    (client.game / 'not-a-folder.txt').write_text('file')
    endpoint = '/api/asset-report/move/folders'
    root = client.get(endpoint).json()
    assert root == {'path': '.', 'exists': True, 'folders': [
        {'name': 'art', 'path': 'art'}, {'name': 'Audio', 'path': 'Audio'}]}
    assert client.get(endpoint, params={'path': 'art/1920x1080'}).json() == {
        'path': 'art/1920x1080', 'exists': True, 'folders': [{'name': 'Empty', 'path': 'art/1920x1080/Empty'}]}
    assert client.get(endpoint, params={'path': 'new/subfolder'}).json() == {
        'path': 'new/subfolder', 'exists': False, 'folders': []}
    assert not (client.game / 'new').exists()
    assert client.get(endpoint, params={'path': 'not-a-folder.txt'}).status_code == 400


def test_move_folder_browser_stays_inside_the_game_and_skips_links(client):
    endpoint = '/api/asset-report/move/folders'
    (client.game / 'outside-link').symlink_to(client.root / 'other', target_is_directory=True)
    assert client.get(endpoint).json()['folders'] == []
    for path in ('../other', str(client.root / 'other'), 'outside-link', 'outside-link/art'):
        assert client.get(endpoint, params={'path': path}).status_code == 400
    assert client.get(endpoint, headers={'host': 'attacker.example'}).status_code == 403
