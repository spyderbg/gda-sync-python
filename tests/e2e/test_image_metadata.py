"""Image metadata is editable, can be created manually, and drives the queued PNG generator."""
import json

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend
from tests.test_image_metadata import png, runner_settings, vision_server, write

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
    return page.get_by_role('dialog', name='Image studio', exact=True)


def test_create_metadata_edit_render_size_and_generate_image(new_context, metadata_backend):
    backend, game = metadata_backend
    page = new_context().new_page()
    dialog = open_studio(page, backend)
    dialog.get_by_role('button', name='New image metadata', exact=True).click()
    dialog.get_by_label('Image path', exact=True).fill('art/new-bell.png')
    dialog.get_by_label('Description', exact=True).fill('A golden bell with a red ribbon.')
    dialog.get_by_label('Generation prompt', exact=True).fill('A polished emerald bell, centered.')
    dialog.get_by_label('Width', exact=True).fill('14')
    dialog.get_by_label('Height', exact=True).fill('21')
    dialog.get_by_label('Render width', exact=True).fill('64')
    dialog.get_by_label('Render height', exact=True).fill('96')
    dialog.get_by_label('Transparent background', exact=True).check()
    dialog.get_by_role('button', name='Save metadata', exact=True).click()
    expect(dialog.get_by_role('status')).to_have_text('Metadata saved.')
    value = json.loads((game / 'art/new-bell.png.json').read_text())
    assert value['generation'] == {'width': 64, 'height': 96, 'prompt': 'A polished emerald bell, centered.'}
    assert value['image']['width'] == 14 and value['image']['height'] == 21
    dialog.get_by_role('button', name='Save & generate image', exact=True).click()
    expect(dialog.get_by_role('tab', name='Generation queue')).to_have_attribute('aria-selected', 'true')
    expect(dialog.locator('.studio-job').filter(has_text='new-bell.png').get_by_text('succeeded', exact=True)).to_be_visible(timeout=10000)
    dialog.get_by_role('button', name='View', exact=True).click()
    expect(dialog.get_by_role('img', name='Generated image', exact=True)).to_be_visible()
    assert (game / 'art/new-bell.png.json.generated.png').is_file()
    assert not (game / 'art/new-bell.png').exists()
    # Dialog size stays fixed and content scrolls independently of its footer.
    body = dialog.locator('.studio-body')
    assert body.evaluate('(element) => element.scrollHeight > element.clientHeight')
    expect(dialog.get_by_role('button', name='Close', exact=True)).to_be_in_viewport()
    BUILD.mkdir(exist_ok=True)
    dialog.screenshot(path=str(BUILD / 'image-studio-generated.png'))
    dialog.get_by_role('button', name='Close', exact=True).click()
    page.get_by_role('button', name='Image studio', exact=True).click()
    dialog.get_by_role('button').filter(has_text='art/new-bell.png').click()
    expect(dialog.get_by_label('Generation prompt', exact=True)).to_have_value('A polished emerald bell, centered.')


def test_analyze_from_asset_details_then_edit_without_losing_source(new_context, metadata_backend):
    backend, game = metadata_backend
    page = new_context().new_page()
    dialog = open_studio(page, backend)
    dialog.get_by_role('button', name='Close', exact=True).click()
    page.get_by_role('button', name='Inspect bell.png', exact=True).click()
    page.get_by_role('button', name='Image metadata…', exact=True).click()
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
    dialog.get_by_role('button', name='Close', exact=True).click()
    page.get_by_role('article').filter(has_text='ANIM').locator('.asset-name').click()
    page.get_by_role('button', name='Image metadata…', exact=True).click()
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
