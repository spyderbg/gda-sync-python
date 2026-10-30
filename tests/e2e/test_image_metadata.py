"""Image metadata is editable, can be created manually, and drives the queued PNG generator."""
import json
import re

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend
from tests.test_image_metadata import comfy_server, comfy_workflow, metadata, png, remote_comfy_settings, runner_settings, vision_server, write

pytestmark = pytest.mark.e2e


@pytest.fixture
def metadata_backend(tmp_path, browser, vision_server):
    game, gda, home = tmp_path / 'resources' / 'game', tmp_path / 'gda', tmp_path / 'app'
    gda.mkdir()
    png(game / 'bell.png')
    write(game / 'RssImagesData.json', {'images': [{'id': 'BELL', 'path': 'bell.png'}]})
    write(home / 'workspace.json', {'workspaces': [{'id': 'game', 'game_name': 'Metadata',
        'game_path': str(game), 'gda_path': str(gda)}], 'defaultWorkspace': 'game'})
    settings = runner_settings(tmp_path)
    settings['analysis'] = {'base_url': vision_server[0], 'model': 'vision'}
    write(home / 'image-analyzer.json', settings)
    backend = Backend(home)
    yield backend, game
    backend.stop()


def open_studio(page, backend):
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Metadata', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.get_by_role('button', name='Image studio', exact=True).click()
    return page.get_by_role('region', name='Image studio', exact=True)


def test_create_metadata_edit_render_size_and_generate_image(new_context, metadata_backend):
    backend, game = metadata_backend
    page = new_context().new_page()
    dialog = open_studio(page, backend)
    dialog.get_by_role('button', name='New image metadata', exact=True).click()
    dialog.get_by_text('Metadata file and provenance', exact=True).click()
    folder_button = dialog.get_by_role('button', name='Open metadata folder', exact=True)
    code_button = dialog.get_by_role('button', name='Open metadata file in VS Code', exact=True)
    expect(folder_button).to_be_disabled()
    expect(code_button).to_be_disabled()
    dialog.get_by_label('Image path', exact=True).fill('art/new-bell.png')
    dialog.get_by_label('Description', exact=True).fill('A golden bell with a red ribbon.')
    dialog.get_by_label('Generation prompt', exact=True).fill('A polished emerald bell, centered.')
    dialog.get_by_label('Width', exact=True).fill('14')
    dialog.get_by_label('Height', exact=True).fill('21')
    dialog.get_by_label('Render width', exact=True).fill('320')
    dialog.get_by_label('Render height', exact=True).fill('320')
    scales = dialog.get_by_role('group', name='Render resolution multiplier', exact=True)
    scales.get_by_role('button', name='4×', exact=True).click()
    expect(dialog.get_by_label('Render width', exact=True)).to_have_value('64')
    expect(dialog.get_by_label('Render height', exact=True)).to_have_value('96')
    scales.get_by_role('button', name='4×', exact=True).click()
    expect(dialog.get_by_label('Render width', exact=True)).to_have_value('64')
    dialog.get_by_label('Transparent background', exact=True).check()
    dialog.get_by_role('button', name='Save metadata', exact=True).click()
    expect(dialog.get_by_role('status')).to_have_text('Metadata saved.')
    opened = []

    def record_open(route):
        opened.append((route.request.url.rsplit('/', 1)[-1], route.request.post_data_json))
        route.fulfill(json={'opened': True})

    page.route('**/api/rss-sync/open-*', record_open)
    folder_button.click()
    code_button.click()
    assert opened == [
        ('open-folder', {'file': str(game / 'art/new-bell.png.json'), 'isFolder': False}),
        ('open-declaration', {'descriptor': str(game / 'art/new-bell.png.json'), 'line': 1}),
    ]
    expect(dialog.locator('.studio-provenance pre')).to_have_css('max-height', '480px')
    value = json.loads((game / 'art/new-bell.png.json').read_text())
    assert value['generation'] == {'width': 64, 'height': 96, 'prompt': 'A polished emerald bell, centered.'}
    assert value['image']['width'] == 14 and value['image']['height'] == 21
    dialog.get_by_role('button', name='Generate image', exact=True).click()
    expect(dialog.get_by_role('tab', name='Metadata', exact=True)).to_have_attribute('aria-selected', 'true')
    dialog.get_by_role('tab', name='Generation queue', exact=True).click()
    expect(dialog.get_by_role('tab', name='Generation queue')).to_have_attribute('aria-selected', 'true')
    expect(dialog.locator('.studio-job').filter(has_text='new-bell.png').get_by_text('succeeded', exact=True)).to_be_visible(timeout=10000)
    dialog.get_by_role('button', name='View', exact=True).click()
    expect(dialog.get_by_role('img', name='Generated image', exact=True)).to_be_visible()
    assert (game / 'art/new-bell.png.json.generated.png').is_file()
    assert not (game / 'art/new-bell.png').exists()
    # Studio is a full page, and the sidebar stays available.
    expect(page.get_by_role('dialog', name='Image studio', exact=True)).to_have_count(0)
    expect(page.get_by_role('navigation', name='Main navigation')).to_be_visible()
    BUILD.mkdir(exist_ok=True)
    dialog.screenshot(path=str(BUILD / 'image-studio-generated.png'))
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('button', name='Image studio', exact=True).click()
    dialog.get_by_role('treeitem', name='Open art/new-bell.png', exact=True).click()
    expect(dialog.get_by_label('Generation prompt', exact=True)).to_have_value('A polished emerald bell, centered.')


def test_submit_multiple_render_scales_without_leaving_metadata(new_context, metadata_backend):
    backend, game = metadata_backend
    # Keep the first runner busy while the user submits two more scales.
    release = backend.log.parent / 'release-generation'
    runner = backend.log.parent / 'sd-cli'
    script = runner.read_text()
    shebang, body = script.split('\n', 1)
    runner.write_text(shebang + '\nimport time\nfrom pathlib import Path\n'
                      f'while not Path({str(release)!r}).exists(): time.sleep(0.05)\n' + body)
    page = new_context().new_page()
    studio = open_studio(page, backend)
    studio.get_by_role('button', name='New image metadata', exact=True).click()
    studio.get_by_label('Image path', exact=True).fill('scales.png')
    studio.get_by_label('Description', exact=True).fill('A golden bell.')
    studio.get_by_label('Width', exact=True).fill('64')
    studio.get_by_label('Height', exact=True).fill('96')
    ids = []
    for factor in (1, 2, 4):
        studio.get_by_role('group', name='Render resolution multiplier', exact=True).get_by_role('button', name=f'{factor}×', exact=True).click()
        with page.expect_response(lambda response: response.url.endswith('/api/image-studio/jobs') and response.request.method == 'POST') as submitted:
            studio.get_by_role('button', name='Generate image', exact=True).click()
        assert submitted.value.ok, submitted.value.text()
        ids.extend(submitted.value.json()['submitted'])
        expect(studio.get_by_role('tab', name='Metadata', exact=True)).to_have_attribute('aria-selected', 'true')
    assert len(set(ids)) == 3
    studio.get_by_role('tab', name=re.compile('^Generation queue')).click()
    expect(studio.locator('.studio-job')).to_have_count(3)
    expect(studio.locator('.studio-job .badge').filter(has_text='running')).to_have_count(1)
    expect(studio.locator('.studio-job .badge').filter(has_text='queued')).to_have_count(2)
    for size in ('64 × 96', '128 × 192', '256 × 384'):
        expect(studio.get_by_text(f'Render: {size}', exact=True)).to_be_visible()
    release.write_text('go')
    expect(studio.locator('.studio-job .badge').filter(has_text='succeeded')).to_have_count(3, timeout=15000)
    headers = {'x-gda-token': page.request.get(backend.url + '/api/session').json()['token']}
    jobs = page.request.get(backend.url + '/api/image-studio/jobs', headers=headers).json()['jobs']
    assert len({job['result'] for job in jobs}) == 3
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / 'image-studio-multiple-scales.png'), full_page=True)
    for index, job_id in enumerate(reversed(ids)):
        studio.locator('.studio-job').nth(index).get_by_role('button', name='View', exact=True).click()
        expect(studio.get_by_role('img', name='Generated image', exact=True)).to_have_attribute('src', re.compile(f'/jobs/{job_id}/image'))
        studio.get_by_role('tab', name='Generation queue', exact=True).click()
    assert json.loads((game / 'scales.png.json').read_text())['generation']['width'] == 256


def test_render_multipliers_disable_sizes_beyond_render_limits(new_context, metadata_backend):
    backend, _game = metadata_backend
    page = new_context().new_page()
    studio = open_studio(page, backend)
    studio.get_by_role('button', name='New image metadata', exact=True).click()
    scales = studio.get_by_role('group', name='Render resolution multiplier', exact=True)
    studio.get_by_label('Width', exact=True).fill('8192')
    studio.get_by_label('Height', exact=True).fill('8192')
    expect(scales.get_by_role('button', name='1×', exact=True)).to_be_enabled()
    expect(scales.get_by_role('button', name='2×', exact=True)).to_be_disabled()
    studio.get_by_label('Width', exact=True).fill('16384')
    studio.get_by_label('Height', exact=True).fill('32')
    expect(scales.get_by_role('button', name='2×', exact=True)).to_be_disabled()
    studio.get_by_label('Width', exact=True).fill('0')
    expect(scales.get_by_role('button', name='1×', exact=True)).to_be_disabled()


def test_analyze_from_asset_details_then_edit_without_losing_source(new_context, metadata_backend):
    backend, game = metadata_backend
    page = new_context().new_page()
    dialog = open_studio(page, backend)
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('button', name='Inspect bell.png', exact=True).click()
    page.get_by_role('button', name='Image metadata…', exact=True).click()
    dialog = page.get_by_role('dialog', name='Image studio', exact=True)
    dialog.get_by_role('button', name='Analyze image', exact=True).click()
    expect(dialog.locator('.studio-job').get_by_text('succeeded', exact=True)).to_be_visible(timeout=10000)
    dialog.get_by_role('button', name='View', exact=True).click()
    expect(dialog.get_by_label('Description', exact=True)).to_have_value('A golden bell.')
    expect(dialog.get_by_label('Tags', exact=True)).to_have_value('bell, gold')
    dialog.get_by_label('Generation prompt', exact=True).fill('A silver bell.')
    dialog.get_by_role('button', name='Save metadata', exact=True).click()
    expect(dialog.get_by_role('status')).to_have_text('Metadata saved.')
    assert json.loads((game / 'bell.png.json').read_text())['generation']['prompt'] == 'A silver bell.'
    assert (game / 'bell.png').is_file()
    dialog.get_by_role('tab', name='Local models', exact=True).click()
    dialog.get_by_label('Vision model', exact=True).fill('another-vision-model')
    dialog.get_by_role('button', name='Save model settings', exact=True).click()
    expect(dialog.get_by_role('status')).to_contain_text('Model settings saved.')


def test_force_regenerates_skipped_image_without_adding_job(new_context, metadata_backend):
    backend, game = metadata_backend
    page = new_context().new_page()
    studio = open_studio(page, backend)
    headers = {'x-gda-token': page.request.get(backend.url + '/api/session').json()['token']}
    response = page.request.post(backend.url + '/api/image-studio/metadata', headers=headers,
                                 data={'file': 'bell.png', 'metadata': metadata('bell.png')})
    assert response.ok, response.text()
    output = png(game / 'bell.png.json.generated.png')
    original = output.read_bytes()
    response = page.request.post(backend.url + '/api/image-studio/jobs', headers=headers,
                                 data={'kind': 'image', 'files': ['bell.png']})
    assert response.ok, response.text()
    skipped_id, = response.json()['submitted']
    studio.get_by_role('tab', name='Generation queue', exact=True).click()
    expect(studio.locator('.studio-job').get_by_text('skipped', exact=True)).to_be_visible()
    force = studio.get_by_role('button', name='Generate', exact=True)
    expect(force).to_be_enabled()
    expect(studio.get_by_label('Replace existing metadata / generated PNGs after success')).not_to_be_checked()
    with page.expect_request(lambda request: request.url.endswith('/api/image-studio/jobs/retry')) as submitted:
        force.click()
    assert submitted.value.post_data_json == {'id': skipped_id, 'force': True}
    expect(studio.locator('.studio-job')).to_have_count(1)
    expect(studio.locator('.studio-job').get_by_text('succeeded', exact=True)).to_be_visible(timeout=10000)
    expect(force).to_have_count(0)
    assert output.read_bytes() != original
    expect(studio.get_by_label('Replace existing metadata / generated PNGs after success')).not_to_be_checked()


def test_failed_job_can_be_retried_after_fixing_model_settings(new_context, metadata_backend, vision_server):
    backend, game = metadata_backend
    page = new_context().new_page()
    studio = open_studio(page, backend)
    studio.get_by_role('tab', name='Local models', exact=True).click()
    studio.get_by_label('API base URL', exact=True).fill('http://127.0.0.1:1/v1')
    studio.get_by_role('button', name='Save model settings', exact=True).click()
    expect(studio.get_by_role('status')).to_contain_text('Model settings saved.')
    studio.get_by_role('tab', name='Metadata', exact=True).click()
    studio.get_by_role('button', name='Analyze image', exact=True).click()
    failed = studio.locator('.studio-job').filter(has=page.get_by_text('failed', exact=True))
    expect(failed.get_by_role('button', name='Retry', exact=True)).to_be_visible(timeout=10000)
    # Add a newer entry so retrying the older job must move it to the top.
    headers = {'x-gda-token': page.request.get(backend.url + '/api/session').json()['token']}
    png(game / 'second.png')
    response = page.request.post(backend.url + '/api/image-studio/jobs', headers=headers,
                                 data={'kind': 'metadata', 'files': ['second.png']})
    assert response.ok, response.text()
    expect(studio.locator('.studio-job')).to_have_count(2)
    expect(studio.locator('.studio-job').first).to_contain_text('second.png')
    failed = studio.locator('.studio-job').filter(has=page.get_by_text('bell.png', exact=True))
    studio.get_by_role('tab', name='Local models', exact=True).click()
    studio.get_by_label('API base URL', exact=True).fill(vision_server[0])
    studio.get_by_role('button', name='Save model settings', exact=True).click()
    expect(studio.get_by_role('status')).to_contain_text('Model settings saved.')
    studio.get_by_role('tab', name='Generation queue', exact=True).click()
    failed.get_by_role('button', name='Retry', exact=True).click()
    expect(studio.locator('.studio-job')).to_have_count(2)
    expect(studio.locator('.studio-job').first.locator('.studio-job-name')).to_have_text('bell.png')
    expect(failed.get_by_text('succeeded', exact=True)).to_be_visible(timeout=10000)
    expect(failed.get_by_text('failed', exact=True)).to_have_count(0)
    expect(failed.get_by_role('button', name='Retry', exact=True)).to_have_count(0)
    studio.get_by_role('button', name='View', exact=True).click()
    expect(studio.get_by_label('Description', exact=True)).to_have_value('A golden bell.')
    assert (game / 'bell.png.json').is_file()


def test_generation_queue_shows_previews_models_times_and_responsive_actions(new_context, metadata_backend):
    backend, game = metadata_backend
    states = ['failed', 'skipped', 'succeeded', 'running', 'queued']
    jobs = []
    for index, state in enumerate(states):
        name = f'{state}.png'
        png(game / name)
        write(game / f'{name}.json', metadata(name))
        png(game / f'{name}.json.generated.png')
        job = {'id': f'{index:032x}', 'kind': 'metadata' if state == 'failed' else 'image',
               'state': state, 'source': str(game / name), 'target': str(game / name),
               'createdAt': '2026-10-30T10:20:00Z', 'model': 'vision' if state == 'failed' else 'captured-model.gguf'}
        if state not in ('queued', 'skipped'):
            job['startedAt'] = '2026-10-30T10:22:00Z'
        if state in ('failed', 'skipped', 'succeeded'):
            job['finishedAt'] = '2026-10-30T10:24:14Z'
        if state == 'failed':
            job['error'] = 'The model server could not be reached.'
        jobs.append(job)
    page = new_context().new_page()
    page.route('**/api/image-studio/jobs', lambda route: route.fulfill(json={'jobs': jobs, 'queued': 1, 'running': True}))
    studio = open_studio(page, backend)
    studio.get_by_role('tab', name='Generation queue', exact=True).click()
    expect(studio.get_by_role('heading', name='Generation queue', exact=True)).to_be_visible()
    expect(studio.locator('.studio-job')).to_have_count(5)
    done = studio.locator('.studio-job').filter(has=page.get_by_text('succeeded.png', exact=True))
    expect(done.locator('.studio-job-model')).to_have_text('Generate · captured-model.gguf')
    expect(done.locator('.studio-job-date')).to_have_attribute('datetime', '2026-10-30T10:20:00Z')
    expect(done.locator('.studio-job-duration')).to_have_text('2m 14s')
    expect(done.locator('.studio-job-preview img')).to_have_js_property('naturalWidth', 7)
    skipped = studio.locator('.studio-job').filter(has=page.get_by_text('skipped.png', exact=True))
    expect(skipped.get_by_role('button', name='Generate', exact=True)).to_be_visible()
    expect(skipped.locator('.studio-job-duration')).to_have_text('—')
    failed = studio.locator('.studio-job').filter(has=page.get_by_text('failed.png', exact=True))
    expect(failed.locator('.studio-job-preview .mdi-file-document-outline')).to_be_visible()
    expect(failed.get_by_text('The model server could not be reached.', exact=True)).to_be_visible()
    expect(studio.get_by_role('progressbar', name='Job in progress')).to_have_count(1)
    assert studio.get_by_role('progressbar', name='Job in progress').get_attribute('aria-valuenow') is None
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / 'image-studio-queue-desktop.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    expect(page.locator('.main-panel')).to_have_css('width', '390px')
    expect(page.locator('.main-panel')).to_have_css('margin-left', '0px')
    expect(done.get_by_role('button', name='View', exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(BUILD / 'image-studio-queue-mobile.png'), full_page=True)
    studio.get_by_role('button', name='Generate images', exact=True).click()
    expect(studio.get_by_role('tab', name='Metadata', exact=True)).to_have_attribute('aria-selected', 'true')


def test_sequence_has_one_shared_description_and_prompt(new_context, metadata_backend):
    backend, game = metadata_backend
    for index in range(5):
        png(game / 'frames' / f'frame_{index:02}.png')
    descriptor = game / 'RssImagesSeqData.json'
    write(descriptor, {'imagesSeq': [{'id': 'ANIM', 'frameTime': 60, 'loopCount': 0,
                                     'frames': [{'path': 'frames/frame_{00-04}.png'}]}]})
    original = descriptor.read_bytes()
    page = new_context().new_page()
    dialog = open_studio(page, backend)
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('article').filter(has_text='ANIM').locator('.asset-name').click()
    page.get_by_role('button', name='Image metadata…', exact=True).click()
    dialog = page.get_by_role('dialog', name='Image studio', exact=True)
    expect(dialog.locator('.studio-file')).to_have_count(1)
    expect(dialog.get_by_role('img', name='Representative animation frames', exact=True)).to_be_visible()
    dialog.get_by_role('button', name='Analyze animation', exact=True).click()
    expect(dialog.locator('.studio-job').get_by_text('succeeded', exact=True)).to_have_count(1, timeout=10000)
    dialog.get_by_role('button', name='View', exact=True).click()
    expect(dialog.get_by_label('Description', exact=True)).to_have_value('A golden bell.')
    dialog.get_by_label('Description', exact=True).fill('A bell swings back and forth throughout the animation.')
    dialog.get_by_label('Generation prompt', exact=True).fill('A silver bell swinging from left to right.')
    dialog.get_by_role('button', name='Save metadata', exact=True).click()
    expect(dialog.get_by_role('status')).to_have_text('Metadata saved.')
    sidecars = list((game / '.asset-metadata' / 'sequences').glob('*.imageseq.json'))
    assert len(sidecars) == 1
    value = json.loads(sidecars[0].read_text())
    assert value['analysis']['description'] == 'A bell swings back and forth throughout the animation.'
    assert value['generation']['prompt'] == 'A silver bell swinging from left to right.'
    assert len(value['sequence']['frames']) == 5 and value['sequence']['sampledFrames'] == list(range(5))
    assert not list((game / 'frames').glob('*.json'))
    assert descriptor.read_bytes() == original
    BUILD.mkdir(exist_ok=True)
    dialog.screenshot(path=str(BUILD / 'image-studio-animation.png'))


def test_studio_navigation_and_unsaved_changes(new_context, metadata_backend):
    backend, _game = metadata_backend
    page = new_context().new_page()
    studio = open_studio(page, backend)
    navigation = page.get_by_role('navigation', name='Main navigation')
    game_links = navigation.get_by_role('list', name='Game').get_by_role('button')
    expect(game_links).to_have_text(['Play', 'Image studio'])
    expect(navigation.get_by_role('button', name='Image studio', exact=True)).to_have_attribute('aria-current', 'page')
    studio.get_by_label('Description', exact=True).fill('Unsaved description')
    page.once('dialog', lambda dialog: dialog.dismiss())
    navigation.get_by_role('button', name='Asset library', exact=True).click()
    expect(studio).to_be_visible()
    expect(studio.get_by_label('Description', exact=True)).to_have_value('Unsaved description')
    page.once('dialog', lambda dialog: dialog.accept())
    navigation.get_by_role('button', name='Asset library', exact=True).click()
    expect(studio).to_have_count(0)
    expect(page.locator('.studio-launch')).to_have_count(0)


def test_remote_models_save_and_reopen(new_context, metadata_backend, comfy_server):
    backend, _game = metadata_backend
    page = new_context().new_page()
    studio = open_studio(page, backend)
    studio.get_by_role('tab', name='Remote models', exact=True).click()
    studio.get_by_label('Use remote LM Studio for analysis', exact=True).check()
    studio.get_by_label('Remote LM Studio API base URL', exact=True).fill('http://lm-host:1234/v1')
    studio.get_by_label('Remote vision model', exact=True).fill('remote-vision')
    studio.get_by_label('Use remote ComfyUI for image generation', exact=True).check()
    studio.get_by_label('ComfyUI server URL', exact=True).fill(comfy_server[0])
    studio.get_by_label('ComfyUI API workflow', exact=True).fill(json.dumps(comfy_workflow()))
    studio.get_by_role('button', name='Save model settings', exact=True).click()
    expect(studio.get_by_role('status')).to_contain_text('Model settings saved.')
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('button', name='Image studio', exact=True).click()
    studio.get_by_role('tab', name='Remote models', exact=True).click()
    expect(studio.get_by_label('Remote vision model', exact=True)).to_have_value('remote-vision')
    expect(studio.get_by_label('Use remote ComfyUI for image generation', exact=True)).to_be_checked()
    expect(studio.get_by_label('ComfyUI API workflow', exact=True)).to_have_value(json.dumps(comfy_workflow()))
    BUILD.mkdir(exist_ok=True)
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(BUILD / 'image-studio-remote.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    expect(page.locator('.main-panel')).to_have_css('width', '390px')
    expect(page.locator('.main-panel')).to_have_css('margin-left', '0px')
    expect(studio.get_by_label('ComfyUI server URL', exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(BUILD / 'image-studio-remote-mobile.png'), full_page=True)


def test_cancel_all_stops_running_and_queued_jobs(new_context, metadata_backend, comfy_server):
    backend, game = metadata_backend
    page = new_context().new_page()
    studio = open_studio(page, backend)
    studio.get_by_role('tab', name='Generation queue', exact=True).click()
    cancel_all = studio.get_by_role('button', name='Cancel All', exact=True)
    expect(cancel_all).to_be_disabled()
    url, _calls, control = comfy_server
    control['pending'] = True
    headers = {'x-gda-token': page.request.get(backend.url + '/api/session').json()['token']}
    settings = page.request.post(backend.url + '/api/image-studio/settings', headers=headers,
                                 data={'settings': remote_comfy_settings(url)})
    assert settings.ok, settings.text()
    for name in ('first.png', 'second.png'):
        response = page.request.post(backend.url + '/api/image-studio/metadata', headers=headers,
                                     data={'file': name, 'metadata': metadata(name)})
        assert response.ok, response.text()
    response = page.request.post(backend.url + '/api/image-studio/jobs', headers=headers,
                                 data={'kind': 'image', 'files': ['first.png', 'second.png']})
    assert response.ok, response.text()
    expect(studio.locator('.studio-job .badge').filter(has_text='running')).to_have_count(1)
    expect(studio.locator('.studio-job .badge').filter(has_text='queued')).to_have_count(1)
    expect(cancel_all).to_be_enabled()
    cancel_all.click()
    expect(studio.locator('.studio-job .badge').filter(has_text='cancelled')).to_have_count(2)
    expect(cancel_all).to_be_disabled()
    assert not list(game.glob('*.generated.png'))


def seed_metadata_browser(game):
    for name in ('art/icons/gold.png', 'art/icons/silver.png', 'backgrounds/sky.png',
                 'animations/spin_00.png', 'animations/spin_01.png'):
        png(game / name)
    write(game / 'RssImagesData.json', {'images': [
        {'id': 'BELL', 'path': 'bell.png'}, {'id': 'GOLD', 'path': 'art/icons/gold.png'},
        {'id': 'SILVER', 'path': 'art/icons/silver.png'}, {'id': 'SKY', 'path': 'backgrounds/sky.png'},
        {'id': 'MISSING', 'path': 'art/missing.png'},
    ]})
    write(game / 'RssImagesSeqData.json', {'imagesSeq': [{'id': 'SPIN', 'frameTime': 60, 'loopCount': 0,
        'frames': [{'path': 'animations/spin_{00-01}.png'}]}]})
    write(game / 'art/icons/gold.png.json', metadata('gold.png'))
    write(game / 'drafts/new.png.json', metadata('new.png'))


def test_metadata_filters_folder_tree_and_unsaved_editor(new_context, metadata_backend):
    backend, game = metadata_backend
    seed_metadata_browser(game)
    page = new_context().new_page()
    studio = open_studio(page, backend)
    expect(studio.locator('.studio-file')).to_have_count(7)
    expect(studio.get_by_role('button', name='With metadata', exact=True)).to_have_text('With metadata 2')
    expect(studio.get_by_role('button', name='Without metadata', exact=True)).to_have_text('Without metadata 5')
    studio.get_by_role('button', name='With metadata', exact=True).click()
    expect(studio.locator('.studio-file')).to_have_count(2)
    studio.get_by_label('Filter by folder', exact=True).select_option('art/icons')
    expect(studio.locator('.studio-file')).to_have_count(1)
    expect(studio.get_by_role('treeitem', name='Open art/icons/gold.png', exact=True)).to_be_visible()
    studio.get_by_role('button', name='Clear filters', exact=True).click()
    # Tree disclosure works with the keyboard; searching opens matching branches again.
    art = studio.get_by_role('treeitem', name='art, 3 assets', exact=True)
    art.focus()
    art.press('ArrowLeft')
    expect(art).to_have_attribute('aria-expanded', 'false')
    expect(studio.get_by_role('treeitem', name='Open art/icons/silver.png', exact=True)).to_have_count(0)
    studio.get_by_label('Find image', exact=True).fill('silver')
    expect(studio.locator('.studio-file')).to_have_count(1)
    expect(studio.get_by_role('treeitem', name='Open art/icons/silver.png', exact=True)).to_be_visible()
    studio.get_by_role('button', name='Clear filters', exact=True).click()
    studio.get_by_label('Filter by image type', exact=True).select_option('sequence')
    expect(studio.locator('.studio-file')).to_have_count(1)
    expect(studio.get_by_role('treeitem', name='Open SPIN', exact=True)).to_be_visible()
    studio.get_by_role('button', name='Clear filters', exact=True).click()
    studio.get_by_label('Filter by asset status', exact=True).select_option('missing')
    expect(studio.locator('.studio-file')).to_have_count(1)
    studio.get_by_role('treeitem', name='Open art/missing.png', exact=True).click()
    expect(studio.get_by_role('button', name='Analyze batch 0', exact=True)).to_be_disabled()
    studio.get_by_role('button', name='Clear filters', exact=True).click()
    studio.get_by_role('button', name='List view', exact=True).click()
    expect(studio.get_by_role('tree', name='Image folders')).to_have_count(0)
    expect(studio.get_by_role('button', name='Open art/icons/gold.png', exact=True)).to_be_visible()
    studio.get_by_role('button', name='Tree view', exact=True).click()
    studio.get_by_role('treeitem', name='Open art/icons/gold.png', exact=True).click()
    studio.get_by_label('Description', exact=True).fill('Keep this unsaved gold description.')
    studio.get_by_role('button', name='Without metadata', exact=True).click()
    expect(studio.get_by_label('Description', exact=True)).to_have_value('Keep this unsaved gold description.')
    expect(studio.get_by_text('The open image is outside the current filters. Its edits are kept in the editor.', exact=True)).to_be_visible()
    BUILD.mkdir(exist_ok=True)
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(BUILD / 'image-studio-metadata-tree.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    expect(page.locator('.main-panel')).to_have_css('width', '390px')
    assert studio.locator('.studio-filter-toolbar').evaluate('(element) => element.scrollWidth <= element.clientWidth')
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(BUILD / 'image-studio-metadata-mobile.png'), full_page=True)


def test_metadata_batch_uses_filtered_images_and_refreshes_metadata_counts(new_context, metadata_backend):
    backend, game = metadata_backend
    seed_metadata_browser(game)
    page = new_context().new_page()
    studio = open_studio(page, backend)
    studio.get_by_role('button', name='Without metadata', exact=True).click()
    studio.get_by_label('Find image', exact=True).fill('art/icons')
    expect(studio.locator('.studio-file')).to_have_count(1)
    studio.get_by_role('button', name='Select folder art/icons', exact=True).click()
    expect(studio.get_by_role('button', name='Generate batch 0', exact=True)).to_be_disabled()
    with page.expect_request(lambda request: request.method == 'POST' and request.url.endswith('/api/image-studio/jobs')) as submitted:
        studio.get_by_role('button', name='Analyze batch 1', exact=True).click()
    body = submitted.value.post_data_json
    assert body['kind'] == 'metadata' and len(body['files']) == 1
    assert body['files'][0].endswith('/art/icons/silver.png')
    expect(studio.locator('.studio-job .badge').filter(has_text='succeeded')).to_have_count(1, timeout=10000)
    studio.get_by_role('tab', name='Metadata', exact=True).click()
    expect(studio.get_by_label('Find image', exact=True)).to_have_value('art/icons')
    expect(studio.get_by_role('button', name='Without metadata', exact=True)).to_have_text('Without metadata 0')
    expect(studio.get_by_role('button', name='With metadata', exact=True)).to_have_text('With metadata 2')
    expect(studio.get_by_text('No images match the filters.', exact=True)).to_be_visible()
    assert (game / 'art/icons/silver.png.json').is_file()
    assert not (game / 'backgrounds/sky.png.json').exists()
    studio.get_by_role('button', name='With metadata', exact=True).click()
    expect(studio.locator('.studio-file')).to_have_count(2)
    expect(studio.get_by_role('button', name='Generate batch 2', exact=True)).to_be_enabled()


def test_metadata_tree_selects_one_item_without_checkboxes(new_context, metadata_backend):
    backend, game = metadata_backend
    seed_metadata_browser(game)
    page = new_context().new_page()
    studio = open_studio(page, backend)
    tree = studio.get_by_role('tree', name='Image folders')
    selected = tree.locator('[role="treeitem"][aria-selected="true"]')
    expect(tree.get_by_role('checkbox')).to_have_count(0)
    expect(studio.get_by_role('complementary', name='Image files').get_by_role('checkbox')).to_have_count(0)
    expect(tree).to_have_attribute('aria-multiselectable', 'false')
    studio.get_by_role('button', name='Select folder art', exact=True).click()
    expect(selected).to_have_count(1)
    expect(selected).to_have_attribute('aria-label', 'art, 3 assets')
    expect(studio.get_by_role('button', name='Analyze batch 2', exact=True)).to_be_enabled()
    # Clicking a second folder replaces the scope instead of adding to it.
    studio.get_by_role('button', name='Select folder backgrounds', exact=True).click()
    expect(selected).to_have_count(1)
    expect(selected).to_have_attribute('aria-label', 'backgrounds, 1 assets')
    expect(studio.get_by_role('button', name='Analyze batch 1', exact=True)).to_be_enabled()
    gold = studio.get_by_role('treeitem', name='Open art/icons/gold.png', exact=True)
    silver = studio.get_by_role('treeitem', name='Open art/icons/silver.png', exact=True)
    gold.click()
    expect(selected).to_have_count(1)
    expect(gold).to_have_attribute('aria-selected', 'true')
    expect(studio.get_by_role('button', name='Generate batch 1', exact=True)).to_be_enabled()
    # Declining an editor discard keeps the existing single selection.
    studio.get_by_label('Description', exact=True).fill('Keep this unsaved gold description.')
    page.once('dialog', lambda dialog: dialog.dismiss())
    silver.click()
    expect(gold).to_have_attribute('aria-selected', 'true')
    expect(silver).to_have_attribute('aria-selected', 'false')
    expect(studio.get_by_label('Description', exact=True)).to_have_value('Keep this unsaved gold description.')
    page.once('dialog', lambda dialog: dialog.accept())
    silver.click()
    expect(silver).to_have_attribute('aria-selected', 'true')
    expect(gold).to_have_attribute('aria-selected', 'false')
    studio.get_by_role('button', name='List view', exact=True).click()
    expect(studio.get_by_role('button', name='Open art/icons/silver.png', exact=True)).to_have_attribute('aria-pressed', 'true')
    studio.get_by_role('button', name='Tree view', exact=True).click()
    expect(silver).to_have_attribute('aria-selected', 'true')
    art = studio.get_by_role('treeitem', name='art, 3 assets', exact=True)
    art.focus()
    art.press('Space')
    art.press('Space')
    expect(art).to_have_attribute('aria-selected', 'true')
    expect(selected).to_have_count(1)
    studio.get_by_role('button', name='Collapse all', exact=True).click()
    studio.get_by_role('button', name='Expand all', exact=True).click()
    expect(art).to_have_attribute('aria-selected', 'true')
    expect(silver).to_have_attribute('aria-selected', 'false')


def test_metadata_batch_uses_only_selected_images_even_when_hidden_by_filter(new_context, metadata_backend):
    backend, game = metadata_backend
    seed_metadata_browser(game)
    page = new_context().new_page()
    studio = open_studio(page, backend)
    studio.get_by_role('treeitem', name='Open art/icons/silver.png', exact=True).click()
    studio.get_by_label('Find image', exact=True).fill('sky')
    expect(studio.get_by_role('treeitem', name='Open backgrounds/sky.png', exact=True)).to_be_visible()
    expect(studio.locator('.studio-current-selection')).to_have_text('Selected image: art/icons/silver.png')
    with page.expect_request(lambda request: request.method == 'POST' and request.url.endswith('/api/image-studio/jobs')) as submitted:
        studio.get_by_role('button', name='Analyze batch 1', exact=True).click()
    body = submitted.value.post_data_json
    assert len(body['files']) == 1 and body['files'][0].endswith('/art/icons/silver.png')
    expect(studio.locator('.studio-job .badge').filter(has_text='succeeded')).to_have_count(1, timeout=10000)
    assert (game / 'art/icons/silver.png.json').is_file()
    assert not (game / 'backgrounds/sky.png.json').exists()
    studio.get_by_role('tab', name='Metadata', exact=True).click()
    expect(studio.get_by_role('button', name='Generate batch 1', exact=True)).to_be_enabled()
    studio.get_by_role('button', name='Clear filters', exact=True).click()
    expect(studio.get_by_role('treeitem', name='Open art/icons/silver.png', exact=True)).to_have_attribute('aria-selected', 'true')
    BUILD.mkdir(exist_ok=True)
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(BUILD / 'image-studio-tree-selection.png'), full_page=True)


def test_folder_name_selects_subfolders_for_batch_analysis_when_collapsed(new_context, metadata_backend):
    backend, game = metadata_backend
    seed_metadata_browser(game)
    page = new_context().new_page()
    studio = open_studio(page, backend)
    art = studio.get_by_role('treeitem', name='art, 3 assets', exact=True)
    studio.get_by_role('button', name='Collapse folder art', exact=True).click()
    expect(art).to_have_attribute('aria-expanded', 'false')
    expect(studio.get_by_role('treeitem', name='Open art/icons/silver.png', exact=True)).to_have_count(0)
    studio.get_by_role('button', name='Select folder art', exact=True).click()
    expect(art).to_have_attribute('aria-expanded', 'false')
    expect(art).to_have_attribute('aria-selected', 'true')
    expect(studio.get_by_role('button', name='Analyze batch 2', exact=True)).to_be_enabled()
    # Expanding is independent of selection, including from the keyboard.
    expand = studio.get_by_role('button', name='Expand folder art', exact=True)
    expand.focus()
    expand.press('Enter')
    expect(art).to_have_attribute('aria-expanded', 'true')
    expect(studio.get_by_role('treeitem', name='Open art/icons/gold.png', exact=True)).to_have_attribute('aria-selected', 'false')
    expect(studio.get_by_role('treeitem', name='Open art/icons/silver.png', exact=True)).to_have_attribute('aria-selected', 'false')
    with page.expect_request(lambda request: request.method == 'POST' and request.url.endswith('/api/image-studio/jobs')) as submitted:
        studio.get_by_role('button', name='Analyze batch 2', exact=True).click()
    body = submitted.value.post_data_json
    assert body['kind'] == 'metadata'
    assert set(body['files']) == {str(game / 'art/icons/gold.png'), str(game / 'art/icons/silver.png')}
    expect(studio.locator('.studio-job .badge').filter(has_text='succeeded')).to_have_count(1, timeout=10000)
    expect(studio.locator('.studio-job .badge').filter(has_text='skipped')).to_have_count(1)
    assert (game / 'art/icons/silver.png.json').is_file()
    assert not (game / 'backgrounds/sky.png.json').exists()
