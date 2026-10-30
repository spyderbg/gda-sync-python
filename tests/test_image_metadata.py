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
    assert not list((api.game / '.asset-metadata' / 'sequences').glob('*.imageseq.json'))


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


@pytest.mark.parametrize('restart', [False, True])
def test_generations_capture_distinct_scales_and_keep_each_result(studio, tmp_path, monkeypatch, restart):
    studio.save_settings(runner_settings(tmp_path))
    wake = studio._wake
    monkeypatch.setattr(studio, '_wake', lambda: None)
    source = png(tmp_path / 'bell.png')
    value = metadata(source.name)
    value['image'].update(width=7, height=5, transparency=True)
    submitted, rendered = [], []
    for width in (32, 64, 128):
        value['generation'].update(width=width, height=width)
        studio.save(source, tmp_path, value, service.revision(service.sidecar(source)))
        response = studio.enqueue('game', tmp_path, tmp_path, [source], 'image')
        submitted.extend(response['submitted'])
    assert len(set(submitted)) == 3
    assert studio.enqueue('game', tmp_path, tmp_path, [source], 'image')['submitted'] == [submitted[-1]]
    assert len(studio.jobs) == 3
    assert [job['renderSize']['width'] for job in studio.status('game')['jobs']] == [32, 64, 128]
    assert all('inputMetadata' not in job for job in studio.status('game')['jobs'])
    saved = service.sidecar(source).read_bytes()
    assert [job['inputMetadata']['generation']['width'] for job in json.loads(studio.queue_path.read_text())] == [32, 64, 128]

    def generate(_self, meta_path, output_path, **_options):
        snapshot = json.loads(Path(meta_path).read_text())
        width = snapshot['generation']['width']
        rendered.append(width)
        Image.new('RGBA', (7, 5), (width, 0, 0, 128)).save(output_path)

    monkeypatch.setattr(service.ImageGenerator, 'generate', generate)
    if restart:
        studio.close()
        active = service.MetadataLibrary(str(studio.home), threading.Lock())
        active.start()
    else:
        active = studio
        monkeypatch.setattr(studio, '_wake', wake)
        with studio.condition:
            studio._wake()
    try:
        jobs = wait_jobs(active)
        assert [job['state'] for job in jobs] == ['succeeded'] * 3, jobs
        assert rendered == [32, 64, 128]
        assert service.sidecar(source).read_bytes() == saved
        assert len({job['result'] for job in jobs}) == 3
        for job, width in zip(jobs, rendered):
            with Image.open(active.generated_result('game', job['id'])) as image:
                assert image.getpixel((0, 0)) == (width, 0, 0, 128)
        with pytest.raises(AppError, match='not found'):
            active.generated_result('another-workspace', jobs[0]['id'])
        assert active.enqueue('game', tmp_path, tmp_path, [source], 'image')['jobs'][-1]['state'] == 'skipped'
        assert active.clean('game')['jobs'] == []
        assert Path(active.generated_result('game', jobs[0]['id'])).is_file()
        # A new scale also remains a separate job after previous runs completed.
        value['generation'].update(width=256, height=256)
        active.save(source, tmp_path, value, service.revision(service.sidecar(source)))
        active.enqueue('game', tmp_path, tmp_path, [source], 'image')
        assert wait_jobs(active)[-1]['state'] == 'succeeded'
        assert rendered[-1] == 256
        assert Path(jobs[0]['result']).is_file()
    finally:
        if restart:
            active.close()


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


def comfy_workflow():
    return {
        '3': {'class_type': 'KSampler', 'inputs': {'seed': 9, 'steps': 20, 'cfg': 8}},
        '5': {'class_type': 'EmptyLatentImage', 'inputs': {'width': 512, 'height': 512, 'batch_size': 1}},
        '6': {'class_type': 'CLIPTextEncode', 'inputs': {'text': 'old prompt'}},
        '9': {'class_type': 'SaveImage', 'inputs': {'images': ['8', 0]}},
    }


@pytest.fixture
def comfy_server():
    calls = []
    control = {'pending': False, 'failure': False, 'invalid_image': False, 'opaque': False}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            calls.append((self.path, body, self.headers.get('Authorization')))
            self.respond({'prompt_id': 'our-prompt'} if self.path == '/prompt' else {})

        def do_GET(self):
            calls.append((self.path, None, self.headers.get('Authorization')))
            if self.path.startswith('/view?'):
                data = BytesIO()
                Image.new('RGBA', (64, 96), (50, 100, 200, 255 if control['opaque'] else 128)).save(data, 'PNG')
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'not an image' if control['invalid_image'] else data.getvalue())
                return
            if control['pending']:
                self.respond({})
            elif control['failure']:
                self.respond({'our-prompt': {'status': {'status_str': 'error', 'messages': ['test node failed']}}})
            else:
                self.respond({'our-prompt': {'status': {'status_str': 'success', 'completed': True}, 'outputs': {
                    '1': {'images': [{'filename': 'wrong.png'}]},
                    '9': {'images': [{'filename': 'result image.png', 'subfolder': 'studio', 'type': 'output'}]},
                }}})

        def respond(self, body):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(body).encode())

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f'http://127.0.0.1:{server.server_port}', calls, control
    server.shutdown()
    server.server_close()
    thread.join()


def remote_comfy_settings(url, **overrides):
    return {'remote': {'generation': {'enabled': True, 'base_url': url,
            'workflow': json.dumps(comfy_workflow()), **overrides}}}


def test_remote_lm_studio_uses_its_own_model_authentication_and_load_policy(studio_client, vision_server, monkeypatch):
    api = studio_client
    monkeypatch.setenv('TEST_REMOTE_LM_KEY', 'test-remote-token')
    observed = []
    original = service.ImageAnalyzer._request

    def record(analyzer, *args, **kwargs):
        observed.append((analyzer.base_url, analyzer.api_key))
        return original(analyzer, *args, **kwargs)

    monkeypatch.setattr(service.ImageAnalyzer, '_request', record)
    response = api.post('/api/image-studio/settings', json={'settings': {
        'analysis': {'base_url': 'http://127.0.0.1:1/v1', 'model': 'unused-local'},
        'remote': {'analysis': {'enabled': True, 'base_url': vision_server[0], 'model': 'vision',
                               'api_key_env': 'TEST_REMOTE_LM_KEY', 'unload_others': False}},
    }})
    assert response.status_code == 200, response.text
    assert 'test-remote-token' not in response.text
    response = api.post('/api/image-studio/jobs', json={'kind': 'metadata', 'files': ['frames/bell_00.png']})
    assert response.status_code == 200, response.text
    assert wait_jobs(api.library.image_metadata)[0]['state'] == 'succeeded'
    assert observed and all(item == (vision_server[0], 'test-remote-token') for item in observed)
    assert any(path == '/api/v1/models/load' for path, _ in vision_server[1])
    assert not any(path.endswith('/unload') for path, _ in vision_server[1])
    value = json.loads((api.game / 'frames/bell_00.png.json').read_text())
    assert value['analysis']['description'] == 'A golden bell.'
    queue = (api.library.image_metadata.queue_path).read_text()
    assert 'test-remote-token' not in queue


def test_remote_comfy_workflow_generates_and_resizes_without_local_models(studio_client, comfy_server, monkeypatch):
    api = studio_client
    url, calls, _control = comfy_server
    monkeypatch.setenv('COMFYUI_API_KEY', 'test-comfy-token')
    response = api.post('/api/image-studio/settings', json={'settings': remote_comfy_settings(url, keep_original=True, steps=12, seed=7, cfg_scale=5.5)})
    assert response.status_code == 200, response.text
    value = metadata('new.png')
    value['image'].update(width=14, height=21, transparency=True)
    value['generation'].update(width=64, height=96, prompt='A remote green bell.')
    saved = api.post('/api/image-studio/metadata', json={'file': 'new.png', 'metadata': value}).json()
    api.post('/api/image-studio/jobs', json={'kind': 'image', 'files': [saved['file']]})
    jobs = wait_jobs(api.library.image_metadata)
    assert jobs[-1]['state'] == 'succeeded', jobs
    workflow = next(body['prompt'] for path, body, _auth in calls if path == '/prompt')
    assert workflow['5']['inputs']['width'] == 64 and workflow['5']['inputs']['height'] == 96
    assert 'A remote green bell.' in workflow['6']['inputs']['text']
    assert workflow['3']['inputs'] == {'seed': 7, 'steps': 12, 'cfg': 5.5}
    assert 'result+image.png' in next(path for path, _body, _auth in calls if path.startswith('/view?'))
    assert all(auth == 'Bearer test-comfy-token' for _path, _body, auth in calls)
    output = Path(saved['path'] + '.generated.png')
    with Image.open(output) as image:
        assert image.size == (14, 21) and image.getchannel('A').getextrema() == (128, 128)
    with Image.open(output.with_name(output.stem + '.original.png')) as image:
        assert image.size == (64, 96)
    assert not (api.game / 'new.png').exists()
    assert json.loads(Path(saved['path']).read_text()) == value
    assert 'test-comfy-token' not in api.library.image_metadata.queue_path.read_text()


@pytest.mark.parametrize('failure', ['failure', 'invalid_image', 'opaque', 'pending'])
def test_remote_comfy_failures_keep_existing_generated_files(studio, tmp_path, comfy_server, failure):
    url, calls, control = comfy_server
    control[failure] = True
    studio.save_settings(remote_comfy_settings(url, timeout=1, keep_original=True))
    root = tmp_path / 'resources'
    root.mkdir()
    source = root / 'new.png'
    value = metadata('new.png')
    value['image']['transparency'] = True
    studio.save(source, root, value, '')
    output = Path(str(source) + '.json.generated.png')
    original = output.with_name(output.stem + '.original.png')
    output.write_bytes(b'previous output')
    original.write_bytes(b'previous original')
    studio.enqueue('game', root, root, [source], 'image', overwrite=True)
    jobs = wait_jobs(studio)
    assert jobs[-1]['state'] == 'failed', jobs
    assert output.read_bytes() == b'previous output' and original.read_bytes() == b'previous original'
    if failure == 'pending':
        assert 'timed out' in jobs[-1]['error']
        assert any(path == '/queue' and body == {'delete': ['our-prompt']} for path, body, _ in calls)


def test_remote_comfy_cancellation_removes_only_its_pending_prompt(studio, tmp_path, comfy_server):
    url, calls, control = comfy_server
    control['pending'] = True
    studio.save_settings(remote_comfy_settings(url))
    root = tmp_path / 'resources'
    root.mkdir()
    source = root / 'draft.png'
    studio.save(source, root, metadata('draft.png'), '')
    submitted = studio.enqueue('game', root, root, [source], 'image')['submitted'][0]
    deadline = time.monotonic() + 5
    while not any(path.startswith('/history/') for path, _body, _auth in calls):
        assert time.monotonic() < deadline
        time.sleep(0.01)
    studio.cancel('game', submitted)
    assert wait_jobs(studio)[-1]['state'] == 'cancelled'
    assert any(path == '/queue' and body == {'delete': ['our-prompt']} for path, body, _ in calls)
    assert not any(path == '/interrupt' for path, _body, _auth in calls)
    assert not Path(str(source) + '.json.generated.png').exists()


@pytest.mark.parametrize('change', [
    {'base_url': 'file:///tmp/comfy'}, {'workflow': '{}'}, {'workflow': '{invalid'},
    {'workflow': json.dumps({'nodes': []})}, {'prompt_node': 'absent'}, {'output_node': 'absent'},
])
def test_remote_settings_validation_keeps_previous_configuration(studio, change):
    before = studio.settings()
    with pytest.raises(AppError):
        studio.save_settings(remote_comfy_settings('http://comfy:8188', **change))
    assert studio.settings() == before


def test_comfy_workflow_larger_than_default_request_limit_is_saved(studio_client):
    workflow = comfy_workflow()
    workflow['6']['_meta'] = {'title': 'x' * (140 * 1024)}
    settings = remote_comfy_settings('http://comfy:8188', workflow=json.dumps(workflow))
    response = studio_client.post('/api/image-studio/settings', json={'settings': settings})
    assert response.status_code == 200, response.text[:200]
    assert json.loads(response.json()['settings']['remote']['generation']['workflow']) == workflow


def test_queued_generation_captures_remote_connection_and_workflow(studio, tmp_path, monkeypatch):
    # Keep jobs pending so changes made after submission cannot be hidden by fast completion.
    monkeypatch.setattr(studio, '_wake', lambda: None)
    studio.save_settings(remote_comfy_settings('http://first-comfy:8188', seed=7))
    root = tmp_path / 'resources'
    root.mkdir()
    source = root / 'draft.png'
    studio.save(source, root, metadata('draft.png'), '')
    studio.enqueue('game', root, root, [source], 'image')
    old = deepcopy(studio.jobs[0])
    studio.save_settings(remote_comfy_settings('http://second-comfy:8188', seed=99))
    assert studio.jobs[0] == old
    captured = studio.jobs[0]['settings']['remote']['generation']
    assert captured['base_url'] == 'http://first-comfy:8188' and captured['seed'] == 7
    assert json.loads(studio.jobs[0]['group'])[1] == 'remote'


@pytest.mark.parametrize('kind', ['metadata', 'image'])
@pytest.mark.parametrize('file', ['frames/bell_00.png', 'sequence:imageseq:NORMAL'])
def test_retry_uses_current_models_preserving_saved_generation_inputs_target_and_overwrite(studio_client, tmp_path, vision_server, kind, file):
    api = studio_client
    # Use the catalog's actual sequence key, including its descriptor identity.
    if file.startswith('sequence:'):
        file = next(item['file'] for item in api.get('/api/image-studio/catalog').json()['files']
                    if item['kind'] == 'sequence' and item['name'] == 'NORMAL')
    response = api.post('/api/image-studio/metadata', json={'file': file, 'metadata': metadata()})
    assert response.status_code == 200, response.text
    document = response.json()
    output = Path(f"{document['path']}.generated.png")
    png(output)
    original_output = output.read_bytes()
    settings = runner_settings(tmp_path, fail=True)
    settings['analysis'] = {'base_url': 'http://127.0.0.1:1/v1', 'model': 'vision'}
    assert api.post('/api/image-studio/settings', json={'settings': settings}).status_code == 200
    submitted = api.post('/api/image-studio/jobs', json={'kind': kind, 'files': [file], 'overwrite': True})
    assert submitted.status_code == 200, submitted.text
    studio = api.library.image_metadata
    failed = wait_jobs(studio)[0]
    assert failed['state'] == 'failed'
    # Retry accepts corrected model settings while preserving generation inputs.
    value = document['metadata']
    value['analysis']['description'] = 'An updated bell.'
    response = api.post('/api/image-studio/metadata', json={
        'file': file, 'metadata': value, 'revision': document['revision'],
    })
    assert response.status_code == 200, response.text
    settings = runner_settings(tmp_path)
    settings['analysis'] = {'base_url': vision_server[0], 'model': 'vision'}
    assert api.post('/api/image-studio/settings', json={'settings': settings}).status_code == 200
    response = api.post('/api/image-studio/jobs/retry', json={'id': failed['id']})
    assert response.status_code == 200, response.text
    retried, = wait_jobs(studio)
    assert retried['id'] == failed['id'] and retried['state'] == 'succeeded'
    assert 'error' not in retried
    assert response.json()['submitted'] == [retried['id']]
    for key in ('kind', 'target', 'source', 'metadata', 'output', 'overwrite', 'label'):
        assert retried.get(key) == failed.get(key)
    if kind == 'metadata':
        assert json.loads(Path(document['path']).read_text())['analysis']['description'] == 'A golden bell.'
    else:
        assert output.read_bytes() != original_output
        args = json.loads((tmp_path / 'runner-args.json').read_text())
        assert 'A golden bell.' in args[args.index('-p') + 1]
        assert 'An updated bell.' not in args[args.index('-p') + 1]


def test_retry_rejects_other_workspaces_and_live_jobs_and_deduplicates_attempts(studio_client, monkeypatch):
    api = studio_client
    studio = api.library.image_metadata
    monkeypatch.setattr(studio, '_wake', lambda: None)
    submitted = api.post('/api/image-studio/jobs', json={'kind': 'metadata', 'files': ['frames/bell_00.png']}).json()
    job = studio.jobs[0]
    assert api.post('/api/image-studio/jobs/retry', json={'id': submitted['submitted'][0]}).status_code == 409
    assert api.post('/api/image-studio/jobs/retry', json={'id': '0' * 32}).status_code == 404
    job.update(state='failed', error='Connection refused', finishedAt=service.now())
    job['workspace'] = 'another-workspace'
    assert api.post('/api/image-studio/jobs/retry', json={'id': job['id']}).status_code == 404
    job['workspace'] = 'game'
    first = api.post('/api/image-studio/jobs/retry', json={'id': job['id']})
    second = api.post('/api/image-studio/jobs/retry', json={'id': job['id']})
    assert first.status_code == 200 and second.status_code == 409
    assert first.json()['submitted'] == [job['id']]
    assert len(studio.jobs) == 1 and studio.jobs[0]['overwrite'] is False
    assert not {'error', 'finishedAt', 'startedAt'} & job.keys()
    assert api.post('/api/image-studio/jobs/cancel', json={'id': job['id']}).status_code == 200
    response = api.post('/api/image-studio/jobs/retry', json={'id': job['id']})
    assert response.status_code == 200 and response.json()['queued'] == 1
    assert len(studio.jobs) == 1


@pytest.mark.parametrize('fail', [False, True])
def test_force_regenerates_skipped_image_in_place_and_keeps_existing_output_on_failure(studio_client, tmp_path, fail):
    api = studio_client
    studio = api.library.image_metadata
    settings = runner_settings(tmp_path, fail=fail)
    assert api.post('/api/image-studio/settings', json={'settings': settings}).status_code == 200
    file = 'frames/bell_00.png'
    response = api.post('/api/image-studio/metadata', json={'file': file, 'metadata': metadata()})
    assert response.status_code == 200, response.text
    path = Path(response.json()['path'])
    output = png(Path(f'{path}.generated.png'))
    original = output.read_bytes()
    source = (api.game / file).read_bytes()
    saved_metadata = path.read_bytes()
    response = api.post('/api/image-studio/jobs', json={'kind': 'image', 'files': [file]})
    skipped, = response.json()['jobs']
    assert skipped['state'] == 'skipped' and skipped['overwrite'] is False
    assert api.post('/api/image-studio/jobs/retry', json={'id': skipped['id']}).status_code == 409
    response = api.post('/api/image-studio/jobs/retry', json={'id': skipped['id'], 'force': True})
    assert response.status_code == 200, response.text
    regenerated, = wait_jobs(studio)
    assert regenerated['id'] == skipped['id'] and regenerated['overwrite'] is True
    assert regenerated['state'] == ('failed' if fail else 'succeeded')
    assert 'message' not in regenerated
    assert (output.read_bytes() == original) is fail
    assert (api.game / file).read_bytes() == source and path.read_bytes() == saved_metadata


@pytest.mark.parametrize('restart,legacy', [(False, False), (True, False), (True, True)])
def test_skipped_generation_reuses_saved_configuration_after_editor_and_model_changes(studio, tmp_path, restart, legacy):
    settings = runner_settings(tmp_path)
    settings['generation']['seed'] = 7
    studio.save_settings(settings)
    source = png(tmp_path / 'bell.png')
    value = metadata(source.name)
    value['image'].update(width=14, height=21, transparency=True)
    value['generation'].update(width=64, height=96, prompt='The original golden bell.')
    studio.save(source, tmp_path, value, '')
    png(Path(f'{source}.json.generated.png'))
    skipped = studio.enqueue('game', tmp_path, tmp_path, [source], 'image')['jobs'][0]
    assert skipped['state'] == 'skipped'
    config_path = Path(skipped['configuration'])
    saved_config = json.loads(config_path.read_text())
    assert saved_config['workspace'] == 'game'
    assert saved_config['inputMetadata']['generation']['width'] == 64
    if legacy:
        studio.jobs[0].pop('configuration')
        config_path.unlink()
        with studio.condition:
            studio._persist()
    value['generation'].update(width=256, height=384, prompt='A newer silver bell.')
    studio.save(source, tmp_path, value, service.revision(service.sidecar(source)))
    studio.save_settings({'generation': {'diffusion_model': '/missing/new-model.gguf', 'seed': 99}})
    if restart:
        studio.close()
        active = service.MetadataLibrary(str(studio.home), threading.Lock())
        active.start()
    else:
        active = studio
    try:
        response = active.retry('game', skipped['id'], force=True)
        assert response['submitted'] == [skipped['id']]
        regenerated, = wait_jobs(active)
        assert regenerated['state'] == 'succeeded', regenerated
        assert regenerated['renderSize'] == {'width': 64, 'height': 96}
        assert regenerated['result'] == skipped['result']
        args = json.loads((tmp_path / 'runner-args.json').read_text())
        assert args[args.index('-W') + 1] == '64' and args[args.index('-H') + 1] == '96'
        assert args[args.index('--seed') + 1] == '7'
        assert 'original golden bell' in args[args.index('-p') + 1]
        config = json.loads(config_path.read_text())
        assert config['inputMetadata'] == saved_config['inputMetadata']
        assert config['settings'] == saved_config['settings']
        assert active.document(source, tmp_path)['metadata'] == value
        assert active.settings()['settings']['generation']['seed'] == 99
    finally:
        if restart:
            active.close()


def test_legacy_skipped_generation_does_not_guess_missing_original_render_size(studio, tmp_path):
    source = png(tmp_path / 'bell.png')
    value = metadata(source.name)
    studio.save(source, tmp_path, value, '')
    png(Path(f'{source}.json.generated.png'))
    skipped = studio.enqueue('game', tmp_path, tmp_path, [source], 'image')['jobs'][0]
    Path(skipped['configuration']).unlink()
    studio.jobs[0].pop('configuration')
    studio.jobs[0].pop('inputMetadata')
    value['generation'].update(width=64, height=96)
    studio.save(source, tmp_path, value, service.revision(service.sidecar(source)))
    with pytest.raises(AppError, match='original generation configuration is unavailable'):
        studio.retry('game', skipped['id'], force=True)
    assert studio.status('game')['jobs'][0]['state'] == 'skipped'


def test_analysis_configurations_are_workspace_specific_and_used_for_execution(studio, tmp_path, monkeypatch):
    monkeypatch.setattr(studio, '_wake', lambda: None)
    source = png(tmp_path / 'bell.png')
    studio.save_settings({'analysis': {'model': 'first-model', 'load_model': False}})
    first = studio.enqueue('first-workspace', tmp_path, tmp_path, [source], 'metadata')['jobs'][0]
    studio.save_settings({'analysis': {'model': 'second-model', 'load_model': False}})
    second = studio.enqueue('second-workspace', tmp_path, tmp_path, [source], 'metadata')['jobs'][0]
    assert first['id'] != second['id']
    first_path, second_path = Path(first['configuration']), Path(second['configuration'])
    assert first_path.parent.parent != second_path.parent.parent
    assert json.loads(first_path.read_text())['settings']['analysis']['model'] == 'first-model'
    assert json.loads(second_path.read_text())['settings']['analysis']['model'] == 'second-model'
    # Execution must read the saved file rather than a mutable cached copy.
    studio.jobs[0]['settings']['analysis']['model'] = 'incorrect-cached-model'
    observed = []

    def analyze(analyzer, _source, *, data):
        observed.append(analyzer.model)
        return metadata(source.name)

    monkeypatch.setattr(service.ImageAnalyzer, 'analyze', analyze)
    studio._run(studio.jobs[0], threading.Event())
    assert observed == ['first-model']


@pytest.mark.parametrize('missing', [False, True])
def test_skipped_generation_does_not_fall_back_when_saved_configuration_is_unreadable(studio, tmp_path, missing):
    source = png(tmp_path / 'bell.png')
    studio.save(source, tmp_path, metadata(source.name), '')
    png(Path(f'{source}.json.generated.png'))
    job = studio.enqueue('game', tmp_path, tmp_path, [source], 'image')['jobs'][0]
    config_path = Path(job['configuration'])
    if missing:
        config_path.unlink()
    else:
        config_path.write_text('invalid JSON')
    with pytest.raises(AppError, match='Cannot read the saved image job configuration'):
        studio.retry('game', job['id'], force=True)
    assert studio.status('game')['jobs'][0]['state'] == 'skipped'


def test_force_only_accepts_skipped_generation_in_active_workspace(studio_client, monkeypatch):
    api = studio_client
    studio = api.library.image_metadata
    monkeypatch.setattr(studio, '_wake', lambda: None)
    api.post('/api/image-studio/jobs', json={'kind': 'metadata', 'files': ['frames/bell_00.png']})
    job = studio.jobs[0]
    body = {'id': job['id'], 'force': True}
    for state in ('queued', 'running', 'cancelling', 'succeeded', 'failed', 'cancelled', 'skipped'):
        job['state'] = state
        assert api.post('/api/image-studio/jobs/retry', json=body).status_code == 409
    job.update(kind='image', workspace='another-workspace')
    assert api.post('/api/image-studio/jobs/retry', json=body).status_code == 404
    assert len(studio.jobs) == 1


def test_queue_status_exposes_captured_model_names_without_model_settings(studio, tmp_path, monkeypatch):
    monkeypatch.setattr(studio, '_wake', lambda: None)
    source = png(tmp_path / 'bell.png')
    write(service.sidecar(source), metadata())
    settings = runner_settings(tmp_path)
    settings['analysis'] = {'model': 'original-vision'}
    studio.save_settings(settings)
    studio.enqueue('game', tmp_path, tmp_path, [source], 'metadata', overwrite=True)
    studio.enqueue('game', tmp_path, tmp_path, [source], 'image')
    settings['analysis']['model'] = 'new-vision'
    settings['generation']['diffusion_model'] = '/models/new-diffusion.gguf'
    studio.save_settings(settings)
    jobs = studio.status('game')['jobs']
    assert [job['model'] for job in jobs] == ['original-vision', 'diffusion']
    assert all('settings' not in job and 'expected' not in job for job in jobs)
    # Older saved jobs have their model label derived from the captured configuration too.
    studio.jobs[0]['settings']['remote']['analysis'].update(enabled=True, model='remote-vision')
    studio.jobs[1]['settings']['remote']['generation']['enabled'] = True
    assert [job['model'] for job in studio.status('game')['jobs']] == ['remote-vision', 'ComfyUI']


def test_retry_moves_existing_job_to_top_and_persists_order(studio_client, monkeypatch):
    api = studio_client
    studio = api.library.image_metadata
    monkeypatch.setattr(studio, '_wake', lambda: None)
    response = api.post('/api/image-studio/jobs', json={
        'kind': 'metadata', 'files': ['frames/bell_00.png', 'frames/bell_01.png'],
    })
    first_id, second_id = response.json()['submitted']
    studio.jobs[0].update(state='failed', error='Connection refused', startedAt=service.now(), finishedAt=service.now())
    response = api.post('/api/image-studio/jobs/retry', json={'id': first_id})
    assert response.status_code == 200, response.text
    assert [job['id'] for job in response.json()['jobs']] == [second_id, first_id]
    assert response.json()['jobs'][-1]['state'] == 'queued'
    assert [job['id'] for job in json.loads(studio.queue_path.read_text())] == [second_id, first_id]


def test_cancel_all_atomically_cancels_active_workspace_and_keeps_other_jobs(studio_client, monkeypatch):
    api = studio_client
    studio = api.library.image_metadata
    entered = threading.Event()
    trace = []

    def run(job, cancel):
        trace.append((job['workspace'], Path(job['source']).name))
        if job['workspace'] == 'game':
            entered.set()
            assert cancel.wait(5)

    monkeypatch.setattr(studio, '_run', run)
    submitted = api.post('/api/image-studio/jobs', json={
        'kind': 'metadata', 'files': ['frames/bell_00.png', 'frames/bell_01.png'],
    })
    assert submitted.status_code == 200, submitted.text
    assert entered.wait(3)
    studio.enqueue('another-workspace', api.game.parent, api.game, [api.game / 'frames/bell_02.png'], 'metadata')
    response = api.post('/api/image-studio/jobs/cancel-all')
    assert response.status_code == 200, response.text
    assert response.json()['queued'] == 0
    assert [job['state'] for job in wait_jobs(studio)] == ['cancelled', 'cancelled']
    other = wait_jobs(studio, 'another-workspace')
    assert [job['state'] for job in other] == ['succeeded']
    assert trace == [('game', 'bell_00.png'), ('another-workspace', 'bell_02.png')]
    # Repeating the action when idle leaves all completed history intact.
    history = studio.status('game')['jobs']
    assert api.post('/api/image-studio/jobs/cancel-all').json()['jobs'] == history
    assert studio.status('another-workspace')['jobs'] == other


def test_clean_queue_keeps_active_jobs_other_workspaces_and_saved_configurations(studio_client, monkeypatch):
    api = studio_client
    studio = api.library.image_metadata
    monkeypatch.setattr(service.MetadataLibrary, '_wake', lambda self: None)
    states = ['succeeded', 'skipped', 'failed', 'cancelled', 'queued', 'running', 'cancelling']
    sources = [png(api.game / f'clean-{index}.png') for index in range(len(states))]
    studio.enqueue('game', api.game.parent, api.game, sources, 'metadata')
    studio.enqueue('other-workspace', api.game.parent, api.game, [sources[0]], 'metadata')
    for job, state in zip(studio.jobs, states):
        job['state'] = state
    studio.jobs[-1]['state'] = 'succeeded'
    active = studio.status('game')['jobs'][4:]
    other = studio.status('other-workspace')
    configurations = {job['configuration']: Path(job['configuration']).read_bytes() for job in studio.jobs}

    response = api.post('/api/image-studio/jobs/clean')
    assert response.status_code == 200, response.text
    assert response.json() == {'jobs': active, 'queued': 1, 'running': True}
    assert api.get('/api/image-studio/jobs').json() == response.json()
    assert studio.status('other-workspace') == other
    assert api.post('/api/image-studio/jobs/clean').json() == response.json()
    assert {path: Path(path).read_bytes() for path in configurations} == configurations

    # Reload the persisted history without starting any model work. Interrupted
    # active jobs may fail on startup, but cleared rows must not reappear.
    studio.close()
    studio.start()
    assert [job['id'] for job in studio.status('game')['jobs']] == [job['id'] for job in active]
    assert studio.status('other-workspace') == other


def test_metadata_catalog_includes_folder_and_asset_status_for_images_sequences_and_drafts(studio_client):
    api = studio_client
    png(api.game / 'art/icons/extra.png')
    write(api.game / 'RssImagesData.json', {'images': [
        {'id': 'STILL', 'path': 'frames/bell_00.png'},
        {'id': 'ABSENT', 'path': 'art/missing.png'},
    ]})
    assert api.post('/api/asset-report').status_code == 200
    draft = api.post('/api/image-studio/metadata', json={'file': 'drafts/new.png', 'metadata': metadata('new.png')})
    assert draft.status_code == 200, draft.text
    files = api.get('/api/image-studio/catalog').json()['files']
    by_path = {item['path']: item for item in files if item['kind'] == 'image'}
    assert (by_path['frames/bell_00.png']['folder'], by_path['frames/bell_00.png']['category']) == ('frames', 'available')
    assert (by_path['art/missing.png']['folder'], by_path['art/missing.png']['category']) == ('art', 'missing')
    assert not by_path['art/missing.png']['metadata'] and not by_path['art/missing.png']['exists']
    assert by_path['art/icons/extra.png']['category'] == 'supplementary'
    assert (by_path['drafts/new.png']['folder'], by_path['drafts/new.png']['category']) == ('drafts', 'draft')
    assert by_path['drafts/new.png']['metadata'] and not by_path['drafts/new.png']['exists']
    animations = [item for item in files if item['kind'] == 'sequence']
    assert len(animations) == 2
    assert all(item['folder'] == 'frames' and item['path'] == 'frames/bell_00.png' and item['category'] == 'available' for item in animations)
