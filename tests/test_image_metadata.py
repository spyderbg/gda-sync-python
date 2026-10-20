"""Local vision requests, editable sidecars, and the single persistent model queue."""
from copy import deepcopy
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
from pathlib import Path
import sys
import threading
import time

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from egt_gda_sync.app.errors import AppError
from egt_gda_sync.app.server import create_app
from egt_gda_sync.images.metadata import service
from egt_gda_sync.images.metadata.config import DEFAULTS
from egt_gda_sync.images.metadata.sequence import sample_indices
from egt_gda_sync.workspace.library import Library
from tests.conftest import session_headers
from tests.fixtures.bc7_dds import create_bc7_dds


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding='utf-8')


def png(path, color=(255, 128, 0, 128)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new('RGBA', (7, 5), color).save(path)
    return path


def metadata(name='frame.png'):
    value = service.blank_metadata(name)
    value['analysis']['description'] = 'A golden bell.'
    return value


def wait_jobs(studio, workspace='game'):
    deadline = time.monotonic() + 8
    while True:
        jobs = studio.status(workspace)['jobs']
        if all(job['state'] in service.TERMINAL for job in jobs):
            return jobs
        assert time.monotonic() < deadline, jobs
        time.sleep(0.01)


@pytest.fixture
def studio(tmp_path, monkeypatch):
    monkeypatch.delenv('IMAGE_ANALYZER_CONFIG', raising=False)
    result = service.MetadataLibrary(str(tmp_path / 'app'), threading.Lock())
    result.start()
    yield result
    result.close()


@pytest.fixture
def studio_client(tmp_path, monkeypatch):
    monkeypatch.delenv('IMAGE_ANALYZER_CONFIG', raising=False)
    game, gda, home = tmp_path / 'resources' / 'game', tmp_path / 'gda', tmp_path / 'app'
    gda.mkdir()
    for index in range(5):
        png(game / 'frames' / f'bell_{index:02}.png')
    write(game / 'RssImagesData.json', {'images': [{'id': 'STILL', 'path': 'frames/bell_00.png'}]})
    write(game / 'RssImagesSeqData.json', {'imagesSeq': [
        {'id': 'NORMAL', 'frameTime': 60, 'loopCount': 0, 'frames': [{'path': 'frames/bell_{00-04}.png'}]},
        {'id': 'FAST', 'frameTime': 30, 'loopCount': 2, 'frames': [{'path': 'frames/bell_{00-04}.png'}]},
    ]})
    write(home / 'workspace.json', {'workspaces': [{'id': 'game', 'game_name': 'Metadata',
        'game_path': str(game), 'gda_path': str(gda)}], 'defaultWorkspace': 'game'})
    library = Library(str(home))
    library.init()
    monkeypatch.setattr(library, 'start_comparison', lambda: None)
    with TestClient(create_app(library, dev=True), base_url='http://127.0.0.1') as api:
        api.headers.update(session_headers(api))
        api.game, api.library = game, library
        assert api.post('/api/asset-report').status_code == 200
        yield api


@pytest.fixture
def vision_server():
    calls = []
    loaded = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            calls.append((self.path, None))
            self.respond({'models': [{'key': 'vision', 'type': 'llm', 'capabilities': {'vision': True},
                                     'loaded_instances': [{'id': instance} for instance in loaded]}]})

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            calls.append((self.path, body))
            if self.path.endswith('/load'):
                loaded.append('vision-instance')
                self.respond({'status': 'loaded', 'instance_id': 'vision-instance'})
            elif self.path.endswith('/unload'):
                loaded.remove(body['instance_id'])
                self.respond({})
            else:
                self.respond({'model': 'vision-instance', 'choices': [{'finish_reason': 'stop', 'message': {
                    'content': json.dumps({'description': 'A golden bell.', 'scene': 'On a transparent background.',
                                           'tags': ['bell', 'gold'], 'objects': ['bell'], 'text': ''})}}]})

        def respond(self, body):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(body).encode())

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f'http://127.0.0.1:{server.server_port}/v1', calls
    server.shutdown()
    server.server_close()
    thread.join()


def test_dds_is_analyzed_as_png_with_original_provenance_and_pixel_dimensions(studio, tmp_path, vision_server):
    base_url, calls = vision_server
    studio.save_settings({'analysis': {'base_url': base_url, 'model': 'vision'}})
    source = tmp_path / 'bell.dds'
    source.write_bytes(create_bc7_dds(12, 8))
    original = source.read_bytes()
    studio.enqueue('game', tmp_path, tmp_path, [source], 'metadata')
    assert [job['state'] for job in wait_jobs(studio)] == ['succeeded']
    value = studio.document(source, tmp_path)['metadata']
    assert value['image'] == {'filename': source.name, 'width': 12, 'height': 8, 'transparency': False,
                              'mime_type': 'image/vnd-ms.dds', 'size_bytes': len(original),
                              'sha256': hashlib.sha256(original).hexdigest()}
    assert value['generation'] == {'width': 32, 'height': 32}
    assert value['analysis']['description'] == 'A golden bell.'
    assert source.read_bytes() == original
    request = next(body for path, body in calls if path == '/v1/chat/completions')
    assert request['model'] == 'vision-instance'
    assert request['messages'][1]['content'][1]['image_url']['url'].startswith('data:image/png;base64,')
    assert request['response_format']['json_schema']['strict'] is True


def test_batch_describes_each_animation_once_and_keeps_shared_image_separate(studio_client, vision_server):
    api = studio_client
    base_url, calls = vision_server
    assert api.post('/api/image-studio/settings', json={'settings': {'analysis': {'base_url': base_url, 'model': 'vision'}}}).status_code == 200
    rows = api.get('/api/asset-report').json()['assets']
    assert len(rows) == 3
    catalog = api.get('/api/image-studio/catalog', params={'asset': next(row['id'] for row in rows if row.get('sequence'))}).json()
    assert len(catalog['files']) == 1 and catalog['files'][0]['kind'] == 'sequence'
    assert catalog['files'][0]['frameCount'] == 5
    response = api.post('/api/image-studio/jobs', json={'kind': 'metadata', 'assets': [row['id'] for row in rows]})
    assert response.status_code == 200, response.text
    assert len(response.json()['submitted']) == 3
    assert all(job['state'] == 'succeeded' for job in wait_jobs(api.library.image_metadata))
    assert len([path for path, _body in calls if path.endswith('/chat/completions')]) == 3
    assert len([path for path, _body in calls if path.endswith('/load')]) == 1
    assert all(file['metadata'] for file in api.get('/api/image-studio/catalog').json()['files'])
    animations = [item for item in api.get('/api/image-studio/catalog').json()['files'] if item['kind'] == 'sequence']
    paths = []
    for animation in animations:
        document = api.get('/api/image-studio/metadata', params={'file': animation['file']}).json()
        paths.append(document['path'])
        value = document['metadata']
        assert value['sequence']['id'] == animation['name']
        assert len(value['sequence']['frames']) == 5 and value['sequence']['sampledFrames'] == list(range(5))
        assert value['image']['width'] == 7 and value['image']['height'] == 5
        assert value['generation'] == {'width': 32, 'height': 32}
        assert value['sequence']['frameTime'] == (30 if animation['name'] == 'FAST' else 60)
        assert value['sequence']['paths'] == ['frames/bell_{00-04}.png']
        assert value['analysis']['description'] == 'A golden bell.'
    assert len(set(paths)) == 2
    assert not any((api.game / 'frames' / f'bell_{index:02}.png.json').exists() for index in range(1, 5))
    instructions = [body['messages'][1]['content'][0]['text'] for path, body in calls if path.endswith('/chat/completions')]
    assert sum('ONE description of the whole animation' in text for text in instructions) == 2
    before = len(calls)
    api.post('/api/image-studio/jobs', json={'kind': 'metadata', 'assets': [row['id'] for row in rows]})
    jobs = wait_jobs(api.library.image_metadata)
    assert all(job['state'] == 'skipped' for job in jobs[-3:])
    assert len(calls) == before


def test_sequence_storyboard_crops_atlas_frames_in_order_and_saves_one_document(studio_client, vision_server):
    api = studio_client
    api.post('/api/image-studio/settings', json={'settings': {'analysis': {'base_url': vision_server[0], 'model': 'vision'}}})
    atlas = Image.new('RGB', (4, 2), 'red')
    atlas.paste('green', (2, 0, 4, 2))
    atlas.save(api.game / 'atlas.png')
    write(api.game / 'RssImagesSeqData.json', {'imagesSeq': [{'id': 'ATLAS', 'frameTime': 60, 'loopCount': 0, 'loopTo': 1,
        'frames': [{'path': 'atlas.png', 'source': {'x': x, 'y': 0, 'w': 2, 'h': 2}} for x in (0, 2, 0)]}]})
    api.post('/api/asset-report')
    row = next(row for row in api.get('/api/asset-report').json()['assets'] if row.get('sequence', {}).get('id') == 'ATLAS')
    target = api.get('/api/image-studio/catalog', params={'asset': row['id']}).json()['files'][0]['file']
    draft = api.get('/api/image-studio/metadata', params={'file': target}).json()
    assert draft['metadata']['image']['width'] == draft['metadata']['image']['height'] == 2
    api.post('/api/image-studio/jobs', json={'kind': 'metadata', 'assets': [row['id']]})
    assert wait_jobs(api.library.image_metadata)[0]['state'] == 'succeeded'
    body = next(body for path, body in vision_server[1] if path.endswith('/chat/completions'))
    encoded = body['messages'][1]['content'][1]['image_url']['url'].split(',', 1)[1]
    with Image.open(BytesIO(base64.b64decode(encoded))) as sheet:
        assert sheet.getpixel((144, 132)) == (255, 0, 0)
        assert sheet.getpixel((432, 132)) == (0, 128, 0)
        assert sheet.getpixel((720, 132)) == (255, 0, 0)
    value = api.get('/api/image-studio/metadata', params={'file': target}).json()['metadata']
    assert [frame['source']['x'] for frame in value['sequence']['frames']] == [0, 2, 0]
    assert value['sequence']['loopTo'] == 1 and value['sequence']['sampledFrames'] == [0, 1, 2]
    assert not (api.game / 'atlas.png.json').exists()
    assert api.get('/api/image-studio/sequence-preview', params={'file': target}).status_code == 200


def test_animation_generation_uses_the_shared_prompt_once(studio_client, tmp_path):
    api = studio_client
    api.post('/api/image-studio/settings', json={'settings': runner_settings(tmp_path)})
    animation = next(item for item in api.get('/api/image-studio/catalog').json()['files'] if item['kind'] == 'sequence')
    document = api.get('/api/image-studio/metadata', params={'file': animation['file']}).json()
    value = document['metadata']
    value['generation']['prompt'] = 'A golden bell swinging from left to right.'
    value['analysis']['description'] = 'The bell swings back and forth.'
    assert api.post('/api/image-studio/metadata', json={'file': animation['file'], 'metadata': value}).status_code == 200
    response = api.post('/api/image-studio/jobs', json={'kind': 'image', 'files': [animation['file']]})
    assert response.status_code == 200, response.text
    assert len(response.json()['submitted']) == 1
    assert wait_jobs(api.library.image_metadata)[0]['state'] == 'succeeded'
    generated = api.get('/api/image-studio/generated', params={'file': animation['file']})
    assert generated.status_code == 200
    with Image.open(BytesIO(generated.content)) as image:
        assert image.size == (7, 5)
    args = json.loads((tmp_path / 'runner-args.json').read_text())
    assert value['generation']['prompt'] in args[args.index('-p') + 1]
    assert len(list(api.game.rglob('*.generated.png'))) == 1


def test_long_animation_covers_first_and_last_and_rejects_changes_to_unsampled_frames(studio_client, monkeypatch):
    api = studio_client
    for index in range(5, 50):
        png(api.game / 'frames' / f'bell_{index:02}.png')
    write(api.game / 'RssImagesSeqData.json', {'imagesSeq': [{'id': 'BELL', 'frameTime': 60, 'loopCount': 0,
                                                          'frames': [{'path': 'frames/bell_{00-49}.png'}]}]})
    api.post('/api/asset-report')
    api.post('/api/image-studio/settings', json={'settings': {'analysis': {'load_model': False}}})
    entered, release = threading.Event(), threading.Event()
    requests = []

    def analyze(_self, source, *, data, instruction=None):
        requests.append(instruction)
        entered.set()
        assert release.wait(5)
        return metadata(source.name)

    monkeypatch.setattr(service.ImageAnalyzer, 'analyze', analyze)
    api.post('/api/image-studio/jobs', json={'kind': 'metadata', 'files': [str(api.game / 'frames/bell_00.png')]})
    assert entered.wait(3)
    animation = next(item for item in api.get('/api/image-studio/catalog').json()['files'] if item['kind'] == 'sequence')
    api.post('/api/image-studio/jobs', json={'kind': 'metadata', 'files': [animation['file']]})
    indices = sample_indices(50)
    assert len(indices) == len(set(indices)) == 12 and indices[0] == 0 and indices[-1] == 49
    untouched_by_sampling = next(index for index in range(50) if index not in indices)
    png(api.game / 'frames' / f'bell_{untouched_by_sampling:02}.png', (0, 255, 0, 255))
    release.set()
    assert [job['state'] for job in wait_jobs(api.library.image_metadata)] == ['succeeded', 'failed']
    assert len(requests) == 1
    assert not list((api.game / '.asset-metadata').rglob('*.json'))


def test_manual_create_edit_conflict_validation_and_draft_discovery(studio_client):
    api = studio_client
    value = metadata('new.png')
    value['image'].update(width=164, height=142, transparency=True)
    value['generation'].update(width=1024, height=896, prompt='A polished gold bell with a red bow.')
    response = api.post('/api/image-studio/metadata', json={'file': 'new/art/new.png', 'metadata': value})
    assert response.status_code == 200, response.text
    document = response.json()
    assert not (api.game / 'new/art/new.png').exists()
    assert json.loads((api.game / 'new/art/new.png.json').read_text()) == value
    assert any(item['name'] == 'new/art/new.png' and item['metadata'] and not item['exists']
               for item in api.get('/api/image-studio/catalog').json()['files'])
    edited = deepcopy(value)
    edited['generation']['prompt'] = 'An emerald bell.'
    assert api.post('/api/image-studio/metadata', json={'file': document['file'], 'metadata': edited, 'revision': document['revision']}).status_code == 200
    assert api.post('/api/image-studio/metadata', json={'file': document['file'], 'metadata': value, 'revision': document['revision']}).status_code == 409
    edited['generation']['width'] = 1023
    assert api.post('/api/image-studio/metadata', json={'file': 'bad.png', 'metadata': edited}).status_code == 400
    assert not (api.game / 'bad.png.json').exists()
    for file in ('../../outside.png', 'RssImagesData.json', '../other/unlisted.png'):
        assert api.post('/api/image-studio/metadata', json={'file': file, 'metadata': value}).status_code in (400, 404)
    (api.game / 'linked').symlink_to(api.game / 'frames', target_is_directory=True)
    assert api.post('/api/image-studio/metadata', json={'file': 'linked/frame.png', 'metadata': value}).status_code == 400


def test_queue_is_serial_groups_model_types_and_deduplicates_active_jobs(studio, tmp_path, monkeypatch):
    sources = [png(tmp_path / f'image{index}.png') for index in range(4)]
    write(service.sidecar(sources[1]), metadata())
    entered, release = threading.Event(), threading.Event()
    trace = []
    active = 0
    maximum = 0

    def run(job, _cancel):
        nonlocal active, maximum
        active += 1
        maximum = max(active, maximum)
        trace.append((job['kind'], Path(job['source']).name))
        if len(trace) == 1:
            entered.set()
            assert release.wait(5)
        active -= 1

    monkeypatch.setattr(studio, '_run', run)
    first = studio.enqueue('game', tmp_path, tmp_path, sources[:1], 'metadata')
    assert entered.wait(3)
    duplicate = studio.enqueue('game', tmp_path, tmp_path, sources[:1], 'metadata')
    assert duplicate['submitted'] == first['submitted']
    studio.enqueue('game', tmp_path, tmp_path, sources[1:2], 'image')
    studio.enqueue('game', tmp_path, tmp_path, sources[2:], 'metadata')
    release.set()
    assert all(job['state'] == 'succeeded' for job in wait_jobs(studio))
    assert maximum == 1
    assert trace == [('metadata', 'image0.png'), ('metadata', 'image2.png'), ('metadata', 'image3.png'), ('image', 'image1.png')]


def test_cancel_running_analysis_discards_result_and_keeps_next_job_running(studio, tmp_path, monkeypatch):
    settings = deepcopy(DEFAULTS)
    settings['analysis']['load_model'] = False
    studio.save_settings(settings)
    first, second = png(tmp_path / 'first.png'), png(tmp_path / 'second.png')
    entered, release = threading.Event(), threading.Event()

    def analyze(_self, source, *, data):
        assert data.startswith(b'\x89PNG')
        if source == first:
            entered.set()
            assert release.wait(5)
        return metadata(source.name)

    monkeypatch.setattr(service.ImageAnalyzer, 'analyze', analyze)
    jobs = studio.enqueue('game', tmp_path, tmp_path, [first, second], 'metadata')
    assert entered.wait(3)
    studio.cancel('game', jobs['submitted'][0])
    release.set()
    assert [job['state'] for job in wait_jobs(studio)] == ['cancelled', 'succeeded']
    assert not service.sidecar(first).exists()
    assert service.sidecar(second).is_file()


def test_analysis_refuses_to_replace_metadata_edited_during_inference(studio, tmp_path, monkeypatch):
    studio.save_settings({'analysis': {'load_model': False}})
    source = png(tmp_path / 'source.png')
    entered, release = threading.Event(), threading.Event()

    def analyze(_self, _source, *, data):
        entered.set()
        assert release.wait(5)
        return metadata()

    monkeypatch.setattr(service.ImageAnalyzer, 'analyze', analyze)
    studio.enqueue('game', tmp_path, tmp_path, [source], 'metadata')
    assert entered.wait(3)
    saved = metadata()
    saved['generation']['prompt'] = 'My newer edit'
    studio.save(source, tmp_path, saved, '')
    release.set()
    job = wait_jobs(studio)[0]
    assert job['state'] == 'failed' and 'changed' in job['error']
    assert studio.document(source, tmp_path)['metadata'] == saved


def runner_settings(folder, *, fail=False):
    runner = folder / 'sd-cli'
    runner.write_text(f'#!{sys.executable}\n' + (
        'raise SystemExit(2)\n' if fail else
        'import sys,json\nfrom PIL import Image\na=sys.argv\n'
        'w,h=int(a[a.index("-W")+1]),int(a[a.index("-H")+1])\n'
        'image=Image.new("RGBA",(w,h),(255,0,0,128))\n'
        'image.save(a[a.index("-o")+1])\n'
        f'open({str(folder / "runner-args.json")!r},"w").write(json.dumps(a))\n'
    ))
    runner.chmod(0o755)
    for name in ('diffusion', 'encoder', 'vae'):
        (folder / name).write_bytes(b'test weights')
    return {'generation': {'diffusion_model': str(folder / 'diffusion'), 'text_encoder': str(folder / 'encoder'),
                           'vae': str(folder / 'vae'), 'sd_cli': str(runner), 'unload_lm_studio': False}}


def test_generation_uses_edited_prompt_render_and_output_size_keeps_sources(studio_client, tmp_path):
    api = studio_client
    assert api.post('/api/image-studio/settings', json={'settings': runner_settings(tmp_path)}).status_code == 200
    value = metadata()
    value['generation'].update(width=64, height=96, prompt='A green bell.')
    value['image'].update(width=14, height=21, transparency=True)
    saved = api.post('/api/image-studio/metadata', json={'file': 'new.png', 'metadata': value}).json()
    response = api.post('/api/image-studio/jobs', json={'kind': 'image', 'files': [saved['file']]})
    assert response.status_code == 200, response.text
    assert wait_jobs(api.library.image_metadata)[0]['state'] == 'succeeded'
    args = json.loads((tmp_path / 'runner-args.json').read_text())
    assert args[args.index('-W') + 1] == '64' and args[args.index('-H') + 1] == '96'
    assert 'A green bell.' in args[args.index('-p') + 1]
    generated = api.get('/api/image-studio/generated', params={'file': saved['file']})
    assert generated.status_code == 200 and generated.headers['content-type'] == 'image/png'
    with Image.open(BytesIO(generated.content)) as image:
        assert image.size == (14, 21) and image.mode == 'RGBA'
        assert image.getchannel('A').getextrema() == (128, 128)
    assert not (api.game / 'new.png').exists()
    assert json.loads(Path(saved['path']).read_text()) == value
    # Failed regeneration must preserve a previous successful image and the saved metadata.
    before = generated.content
    api.post('/api/image-studio/settings', json={'settings': runner_settings(tmp_path, fail=True)})
    api.post('/api/image-studio/jobs', json={'kind': 'image', 'files': [saved['file']], 'overwrite': True})
    assert wait_jobs(api.library.image_metadata)[-1]['state'] == 'failed'
    assert api.get('/api/image-studio/generated', params={'file': saved['file']}).content == before


def test_restart_marks_interrupted_job_failed_and_resumes_queued_with_captured_workspace(tmp_path, monkeypatch):
    root = tmp_path / 'resources'
    root.mkdir()
    source = png(root / 'image.png')
    home = tmp_path / 'app'
    job = {'id': 'a' * 32, 'workspace': 'original', 'root': str(root), 'game': str(root), 'source': str(source),
           'metadata': str(service.sidecar(source)), 'output': f'{source}.json.generated.png', 'kind': 'metadata',
           'state': 'running', 'settings': deepcopy(DEFAULTS), 'group': 'metadata', 'expected': {}, 'createdAt': service.now()}
    pending = {**job, 'id': 'b' * 32, 'state': 'queued'}
    write(home / 'image-jobs.json', [job, pending])
    observed = []
    monkeypatch.setattr(service.MetadataLibrary, '_run', lambda _self, item, _cancel: observed.append(item['workspace']))
    studio = service.MetadataLibrary(str(home), threading.Lock())
    studio.start()
    try:
        assert [item['state'] for item in wait_jobs(studio, 'original')] == ['failed', 'succeeded']
        assert observed == ['original']
        assert studio.status('different')['jobs'] == []
    finally:
        studio.close()


def test_only_one_backend_can_own_a_persisted_queue_and_cli_init_does_not_start_it(studio, tmp_path):
    second = service.MetadataLibrary(str(studio.home), threading.Lock())
    with pytest.raises(AppError, match='already owns'):
        second.start()
    studio.close()
    second.start()
    second.close()
    # Startup code and the report CLI initialize a Library before a server owns
    # its socket. That must not load, modify or execute pending model jobs.
    home = tmp_path / 'cli'
    write(home / 'image-jobs.json', [{'state': 'queued'}])
    library = Library(str(home))
    library.init()
    assert library.image_metadata.thread is None and library.image_metadata.lease is None
    assert json.loads((home / 'image-jobs.json').read_text()) == [{'state': 'queued'}]
    library.close()


def test_keep_original_output_follows_overwrite_policy_and_preserves_render_size(studio, tmp_path):
    settings = runner_settings(tmp_path)
    settings['generation']['keep_original'] = True
    studio.save_settings(settings)
    source = tmp_path / 'new.png'
    value = metadata(source.name)
    value['image'].update(width=14, height=21)
    value['generation'].update(width=64, height=96)
    studio.save(source, tmp_path, value, '')
    output = Path(f'{source}.json.generated.png')
    original = output.with_name(f'{output.stem}.original.png')
    original.write_bytes(b'existing render')
    studio.enqueue('game', tmp_path, tmp_path, [source], 'image')
    assert wait_jobs(studio)[0]['state'] == 'skipped'
    assert original.read_bytes() == b'existing render'
    studio.enqueue('game', tmp_path, tmp_path, [source], 'image', overwrite=True)
    assert wait_jobs(studio)[-1]['state'] == 'succeeded'
    with Image.open(output) as image:
        assert image.size == (14, 21) and image.mode == 'RGB'
    with Image.open(original) as image:
        assert image.size == (64, 96) and image.mode == 'RGBA'


def test_failed_publication_rolls_back_both_image_outputs(tmp_path, monkeypatch):
    target, original = tmp_path / 'output.png', tmp_path / 'original.png'
    target.write_bytes(b'old output')
    original.write_bytes(b'old original')
    staged = [png(tmp_path / f'new-{index}.png') for index in range(2)]
    replace = service.os.replace

    def failing_replace(source, destination):
        if destination == original:
            raise OSError('Cannot publish original')
        replace(source, destination)

    monkeypatch.setattr(service.os, 'replace', failing_replace)
    with pytest.raises(OSError):
        service.MetadataLibrary._publish_images([(target, staged[0]), (original, staged[1])])
    assert target.read_bytes() == b'old output' and original.read_bytes() == b'old original'
    assert not list(tmp_path.glob('*.tmp'))


def test_unreadable_source_still_allows_manual_metadata_creation(studio, tmp_path):
    source = tmp_path / 'broken.dds'
    source.write_bytes(b'not an image')
    draft = studio.document(source, tmp_path)
    assert not draft['exists'] and 'manually' in draft['sourceError']
    value = draft['metadata']
    value['analysis']['description'] = 'A gold bell.'
    studio.save(source, tmp_path, value, '')
    assert studio.document(source, tmp_path)['metadata'] == value


@pytest.mark.parametrize('change', [lambda value: value.update(schema_version=True),
    lambda value: value['image'].update(width=True), lambda value: value['image'].update(transparency='true'),
    lambda value: value['analysis'].update(tags='bell'), lambda value: value['generation'].update(prompt='')])
def test_metadata_rejects_invalid_field_types(change):
    value = metadata()
    change(value)
    with pytest.raises(AppError):
        service.validate_metadata(value)
