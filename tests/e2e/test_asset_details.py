"""The asset library shows the newest asset report, and clicking an asset opens its details in a dialog."""

import json
import re
import shlex
import shutil

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
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
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
    expect(details.locator('.details-declaration')).to_have_text(['RssImagesData.json:5Image'])
    expect(details.get_by_role('region', name='Resource Key', exact=True)).to_contain_text('BANNER')
    expect(details.get_by_role('row').filter(has_text='Resolution')).to_have_text('Resolution8 × 4')
    poll(lambda: details.get_by_role('img', name='banner.dds preview', exact=True).evaluate('image => image.naturalWidth'), 8)
    # The game path is shown relative to the game folder, with the full path as its tooltip.
    expect(details.locator('.details-path .details-code')).to_have_text('banner.dds')
    expect(details.locator('.details-path .details-code')).to_have_attribute('title', str(game / 'banner.dds'))
    page.screenshot(path=str(BUILD / 'asset-details-desktop.png'))
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)

    # A sequence lists its frames in the dialog.
    spin.locator('.asset-hit-target').click()
    details = page.get_by_role('dialog', name='spin_{0-2}.dds')
    expect(details.locator('.details-frames tbody tr')).to_have_count(3)
    expect(details.get_by_role('row', name='Files 3 of 3 found')).to_be_visible()
    page.keyboard.press('Escape')
    assert errors == []


def test_the_sidebar_lists_images_and_image_sequences_apart(new_context, details_backend):
    backend, _game = details_backend
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    expect(page.locator('.asset-card')).to_have_count(4)
    navigation = page.get_by_role('navigation', name='Main navigation')
    # The banner, the missing image and the file that nothing declares are images; SPIN is an image sequence.
    images, sequences = (navigation.get_by_role('button', name=name, exact=True) for name in ('Images', 'ImagesSeq'))
    expect(images).to_contain_text('3')
    expect(sequences).to_contain_text('1')
    expect(navigation.get_by_role('button', name='Textures', exact=True)).to_have_count(0)
    sequences.click()
    expect(sequences).to_have_attribute('aria-current', 'page')
    expect(page.locator('.asset-card')).to_have_count(1)
    expect(page.locator('.asset-card')).to_contain_text('SPIN')
    images.click()
    expect(page.locator('.asset-card')).to_have_count(3)
    expect(page.locator('.asset-card').filter(has_text='SPIN')).to_have_count(0)
    assert errors == []


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='making a movie needs FFmpeg')
@pytest.mark.parametrize(('alpha_layout', 'encoded_size'), [('valpha-top', (4, 8)), ('halpha-left', (8, 4))])
def test_make_movie_uses_the_entered_frame_rate_and_alpha_layout(new_context, details_backend, alpha_layout, encoded_size):
    backend, game = details_backend
    descriptor = game / 'RssMoviesData.json'
    descriptor.write_text('{"movies": []}')
    context = new_context()
    context.grant_permissions(['clipboard-read', 'clipboard-write'], origin=backend.url)
    page = context.new_page()
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.locator('.asset-card').filter(has_text='SPIN').locator('.asset-hit-target').click()
    expect(page.get_by_role('button', name='Move', exact=True)).to_be_visible()
    page.get_by_role('button', name='Make movie', exact=True).click()
    dialog = page.get_by_role('dialog', name='Make a movie of SPIN')
    facts = dialog.locator('dl[aria-label="Source sequence parameters"]')
    expect(facts.locator('dt')).to_have_text(['frameTime', 'loopCount', 'loopTo'])
    expect(facts.locator('dd')).to_have_text(['40', '0', 'null'])
    assert facts.evaluate('''list => {
        const first = list.firstElementChild.getBoundingClientRect();
        const last = list.lastElementChild.getBoundingClientRect();
        const box = list.getBoundingClientRect();
        return Math.abs(first.left + last.right - box.left - box.right) < 1;
    }''')
    popup = dialog.locator('.movie-dialog')
    expect(popup).to_have_css('width', '650px')
    viewport = page.viewport_size
    page.set_viewport_size({'width': 600, 'height': 800})
    assert popup.evaluate('popup => popup.getBoundingClientRect().right < window.innerWidth')
    page.set_viewport_size(viewport)
    fps = dialog.get_by_label('Frame rate', exact=True)
    crf = dialog.get_by_label('CRF', exact=True)
    gop = dialog.get_by_label('Keyframe interval', exact=True)
    interval = dialog.locator('#movie-gop-hint')
    submit = dialog.get_by_role('button', name='Make movie', exact=True)
    expect(fps).to_have_value('25')
    frame_time = dialog.locator('#movie-output-frame-time')
    expect(frame_time).to_have_text('Output frame time 40 ms · output duration 0.12 s')
    commands = dialog.get_by_role('region', name='FFmpeg Command')
    live = commands.locator('pre')
    expect(commands.locator('pre')).to_have_count(1)
    expect(commands.locator('p')).to_have_count(0)
    expect(live).to_have_css('white-space', 'pre')
    expect(live).to_contain_text('-f rawvideo -pix_fmt rgb24 -s 4x4')
    expect(live).to_contain_text('-framerate 1000/40 -i pipe:0')
    expect(crf).to_have_value('23')
    quality = dialog.locator('#movie-crf-quality')
    expect(quality).to_have_text('Very good quality')
    expect(quality).to_have_css('text-transform', 'lowercase')
    expect(dialog.get_by_text('Quality guide', exact=True)).to_have_count(0)
    expect(live).to_contain_text('-crf 23 -pix_fmt yuv420p')
    expect(gop).to_have_value('250')
    expect(gop).not_to_have_attribute('list', re.compile('.+'))
    expect(live).to_contain_text('-g 250')
    gop.fill('25')
    expect(interval).to_have_text('I-frame every 1 second or sooner')
    fps.fill('50')
    expect(frame_time).to_have_text('Output frame time 20 ms · output duration 0.06 s')
    expect(interval).to_have_text('I-frame every 0.5 seconds or sooner')
    crf.select_option('0')
    expect(quality).to_contain_text('Lossless after YUV 4:2:0 conversion')
    crf.select_option('28')
    expect(quality).to_have_text('Visible compression')
    crf.select_option('31')
    expect(quality).to_have_text('Low quality.')
    crf.select_option('18')
    expect(quality).to_have_text('Nearly indistinguishable from the original')
    expect(live).to_contain_text('-crf 18 -pix_fmt yuv420p')
    fps.fill('0')
    expect(submit).to_be_disabled()
    expect(frame_time).to_have_count(0)
    fps.fill('29.97')
    gop.fill('2.5')
    expect(submit).to_be_disabled()
    gop.fill('0')
    expect(interval).to_have_text('I-frame every frame')
    gop.fill('30')
    expect(interval).to_have_text('I-frame every 1.001 seconds or sooner')
    expect(live).to_contain_text('-g 30')
    format_menu = dialog.get_by_label('Format', exact=True)
    expect(format_menu.locator('option')).to_have_text([
        'valpha (alpha below)', 'valpha-top (alpha above)', 'halpha (alpha on the right)',
        'halpha-left (alpha on the left)', 'Opaque (over black)',
    ])
    format_menu.select_option(alpha_layout)
    format_note = dialog.get_by_text('Native playback requires renderer support', exact=False)
    expect(format_note).to_be_visible()
    expect(format_note).to_have_css('text-transform', 'lowercase')
    gaps = dialog.locator('.movie-field-note').evaluate_all('''notes => notes.map(note =>
        note.getBoundingClientRect().top - note.previousElementSibling.getBoundingClientRect().bottom
    )''')
    assert gaps == pytest.approx([4, 4, 4, 4], abs=0.5)
    path_field = dialog.get_by_label('Path', exact=True)
    expect(path_field).to_have_value(re.compile(r'-rgba\.mov$'))
    expect(live).to_contain_text(f'-s {encoded_size[0]}x{encoded_size[1]}')
    expect(live).to_contain_text('-framerate 29.97 -i pipe:0')
    suggested_path = path_field.input_value()
    long_path = "m/Splash/Completed/it/Long output name for the completed image sequence take one's preview.mp4"
    path_field.fill(long_path)
    expect(live).to_contain_text('-movflags +faststart -f mp4')
    assert live.evaluate('pre => pre.scrollWidth > pre.clientWidth')
    command = live.text_content()
    lines = command.splitlines()
    assert all(line.endswith(' \\') for line in lines[:-1])
    assert shlex.split(lines[-1]) == [long_path]
    entry = dialog.get_by_role('region', name='RssMoviesData.json · movies')
    entry_json = entry.locator('pre').text_content()
    entry.get_by_role('button', name='Copy movie entry JSON').click()
    poll(lambda: page.evaluate('navigator.clipboard.readText()'), entry_json)
    assert json.loads(entry_json) == {'id': 'ANIM_SPIN_MOVIE', 'path': long_path, 'movieFormat': alpha_layout}
    commands.get_by_role('button', name='Copy FFmpeg command').click()
    poll(lambda: page.evaluate('navigator.clipboard.readText()'), command)
    path_field.fill(suggested_path)
    expect(live).to_contain_text('-movflags +faststart -f mov')
    assert live.text_content().splitlines()[-1].strip() == suggested_path
    with page.expect_request(lambda request: request.method == 'POST' and request.url.endswith('/api/asset-report/movie')) as sent:
        submit.click()
    submitted = sent.value.post_data_json
    assert submitted['crf'] == 18 and submitted['gopSize'] == 30
    expect(dialog).to_have_count(0)
    details = page.get_by_role('dialog', name=re.compile(r'-rgba\.mov$'))
    expect(details.get_by_role('row', name='Frame rate 29.97 frames per second')).to_be_visible()
    assert json.loads(descriptor.read_text())['movies'][0]['movieFormat'] == alpha_layout
    if page.evaluate('''document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"')'''):
        canvas = details.get_by_role('img', name=re.compile(r'with its alpha$'))
        details.get_by_role('button', name='As encoded').click()
        video = details.locator('video')
        expect(video).to_have_js_property('videoWidth', encoded_size[0])
        expect(video).to_have_js_property('videoHeight', encoded_size[1])
        expect(canvas).to_be_hidden()
        video.evaluate('video => video.play()')
        details.get_by_role('button', name='With alpha').click()
        expect(canvas).to_have_js_property('height', 4)
        poll(lambda: canvas.evaluate('''canvas => {
            const [r, g, b, a] = canvas.getContext('2d').getImageData(2, 2, 1, 1).data;
            return r > 200 && g < 60 && b < 60 && a > 200;
        }'''), True)


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='making a movie needs FFmpeg')
def test_make_movie_of_a_movie_only_recreates_its_file(new_context, details_backend):
    backend, game = details_backend
    descriptor = game / 'RssMoviesData.json'
    descriptor.write_text('{"movies": []}')
    page = new_context().new_page()
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.locator('.asset-card').filter(has_text='SPIN').locator('.asset-hit-target').click()
    page.get_by_role('button', name='Make movie', exact=True).click()
    page.get_by_role('dialog', name='Make a movie of SPIN').get_by_role('button', name='Make movie', exact=True).click()
    details = page.get_by_role('dialog', name=re.compile(r'\.mov$'))
    expect(details.get_by_role('row', name='Frame rate 25 frames per second')).to_be_visible()
    declared = descriptor.read_text()

    details.get_by_role('button', name='Make movie', exact=True).click()
    dialog = page.get_by_role('dialog', name=re.compile('^Recreate '))
    expect(dialog.get_by_label('Source', exact=True).locator('option:checked')).to_contain_text('SPIN (3 frames)')
    expect(dialog.get_by_label('RSS key')).to_have_count(0)
    expect(dialog.get_by_label('Path', exact=True)).not_to_be_editable()
    expect(dialog.get_by_label('Format', exact=True)).to_be_disabled()
    dialog.get_by_label('Source', exact=True).select_option(label="This movie's own frames")
    expect(dialog.get_by_text('loses some quality')).to_be_visible()
    dialog.locator('#movie-fps').fill('10')
    expect(dialog.locator('#movie-output-frame-time')).to_have_text('Output frame time 100 ms · output duration 0.3 s')
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / 'recreate-movie.png'))
    dialog.get_by_role('button', name='Make movie', exact=True).click()
    expect(dialog).to_have_count(0)
    expect(details.get_by_role('row', name='Frame rate 10 frames per second')).to_be_visible()
    assert descriptor.read_text() == declared


def test_an_asset_that_no_descriptor_declares_is_declared_from_its_details(new_context, details_backend):
    backend, game = details_backend
    # Half of the images have a resolution, so a new one starts with it; a language is only suggested.
    (game / 'RssImagesData.json').write_text(json.dumps({'images': [
        {'id': 'BANNER', 'path': 'banner.dds', 'resolution': '1920x1080'}, {'id': 'GONE', 'path': 'gone.dds', 'language': 'en-GB'}]}, indent=2))
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.get_by_role('button', name='Inspect leftover.png', exact=True).click()
    details = page.get_by_role('dialog', name='leftover.png')
    expect(details.locator('.details-type')).to_have_text('Image · PNG')
    expect(details.get_by_text('No JSON descriptor')).to_be_visible()
    details.get_by_role('button', name='Create', exact=True).click()

    declare = page.get_by_role('dialog', name='Create RssKey leftover.png')
    preview = declare.locator('.declare-preview')
    expect(declare.get_by_label('Declare as')).to_have_value('Image')
    expect(declare.locator('.declare-heading')).to_contain_text('RssImagesData.json')
    key = declare.get_by_label('RSS key')
    expect(key).to_have_value('LEFTOVER')
    expect(key).to_be_focused()
    # The part of the entry that the field being edited writes is highlighted.
    expect(preview.locator('.is-focused')).to_have_text(['    "id": "LEFTOVER",'])
    key.fill('BANNER')
    expect(declare.get_by_text('Another Image entry has this key')).to_be_visible()
    key.fill('IMAGE_LEFTOVER')
    resolution = declare.get_by_label('Resolution', exact=True)
    expect(resolution).to_have_value('1920x1080')
    resolution.focus()
    expect(preview.locator('.is-focused')).to_have_text(['    "resolution": "1920x1080"'])
    resolution.select_option(label='Other…')
    declare.get_by_label('Other resolution').fill('1440x900')
    expect(preview).to_contain_text('"resolution": "1440x900"')
    resolution.select_option('1920x1080')
    # The form has every field of the kind; a dropdown's Not specified leaves it out, and another optional one can be removed and added again from the list.
    expect(declare.get_by_label('Add field')).to_have_count(0)
    language = declare.get_by_label('Language', exact=True)
    language.select_option('en-GB')
    language.focus()
    expect(preview.locator('.is-focused')).to_have_text(['    "language": "en-GB"'])
    language.select_option(label='Not specified')
    expect(preview).not_to_contain_text('language')
    declare.get_by_label('Source x').fill('4')
    # Without the image's size there is no default width and height; the empty y is 0.
    expect(declare.get_by_role('button', name='Create', exact=True)).to_be_disabled()
    declare.get_by_label('Source w').fill('10')
    declare.get_by_label('Source h').fill('8')
    expect(declare.get_by_role('button', name='Create', exact=True)).to_be_enabled()
    expect(preview).to_contain_text('"x": 4')
    expect(preview).to_contain_text('"y": 0')
    declare.get_by_role('button', name='Reset Source').click()
    expect(declare.get_by_label('Source x')).to_have_value('')
    expect(declare.get_by_role('button', name='Create', exact=True)).to_be_enabled()
    # A font's characters are groups, each from the list or typed as plain text, and the help shows the characters.
    declare.get_by_label('Declare as').select_option('Font')
    # It starts with the digits and the English letters.
    expect(declare.get_by_label('Characters group 1')).to_have_value('[U+0030-U+0039]')
    expect(declare.get_by_label('Characters group 2')).to_have_value('[U+0041-U+005A]')
    expect(declare.get_by_label('Characters group 3')).to_have_value('[U+0061-U+007A]')
    declare.get_by_role('button', name='Remove group 3').click()
    declare.get_by_role('button', name='Remove group 2').click()
    declare.get_by_role('button', name='Add group').click()
    # A group that another has is not offered again.
    expect(declare.get_by_label('Characters group 2').locator('option[value="[U+0030-U+0039]"]')).to_have_count(0)
    declare.get_by_label('Characters group 2').select_option(label='Other…')
    declare.get_by_label('Other characters, group 2').fill('€$')
    expect(preview).to_contain_text('[U+0030-U+0039][U+0024][U+20AC]')
    expect(declare.locator('.declare-glyphs')).to_have_text('0123456789$€')
    # Escape closes only the dialog on top.
    page.keyboard.press('Escape')
    expect(declare).to_have_count(0)
    expect(details).to_be_visible()
    details.get_by_role('button', name='Create', exact=True).click()
    declare.get_by_label('RSS key').fill('IMAGE_LEFTOVER')
    declare.get_by_role('button', name='Create', exact=True).click()

    expect(page.get_by_role('status')).to_contain_text('Declared IMAGE_LEFTOVER in RssImagesData.json:15.')
    expect(declare).to_have_count(0)
    expect(details.get_by_text('Loaded by the game.')).to_be_visible()
    expect(details.locator('.details-declaration')).to_have_text(['RssImagesData.json:15Image'])
    expect(details.get_by_role('region', name='Resource Key', exact=True)).to_contain_text('IMAGE_LEFTOVER')
    assert json.loads((game / 'RssImagesData.json').read_text())['images'][-1] == {
        'id': 'IMAGE_LEFTOVER', 'path': 'leftover.png', 'resolution': '1920x1080'}
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert errors == []


def test_an_asset_is_removed_after_a_confirmation_with_its_rsskey_and_the_backup_keeps_them(new_context, details_backend):
    backend, game = details_backend
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.get_by_role('button', name='Remove banner.dds', exact=True).click()
    dialog = page.get_by_role('dialog', name='Remove banner.dds?')
    expect(dialog).to_contain_text('Delete this file from the game folder')
    expect(dialog).to_contain_text('Image BANNER · RssImagesData.json')
    # Cancelling changes nothing.
    dialog.get_by_role('button', name='Cancel').click()
    expect(dialog).to_have_count(0)
    assert (game / 'banner.dds').is_file()
    page.get_by_role('button', name='Remove banner.dds', exact=True).click()
    dialog.get_by_role('button', name='Remove', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Removed banner.dds: 1 entry and 1 file.')
    expect(dialog).to_have_count(0)
    assert not (game / 'banner.dds').exists()
    assert [item['id'] for item in json.loads((game / 'RssImagesData.json').read_text())['images']] == ['GONE']
    assert errors == []


def test_removing_an_asset_deletes_the_folder_that_it_leaves_empty(new_context, details_backend):
    backend, game = details_backend
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.get_by_role('button', name='Remove spin_{0-2}.dds', exact=True).click()
    dialog = page.get_by_role('dialog', name='Remove spin_{0-2}.dds?')
    expect(dialog).to_contain_text('Delete these 3 files from the game folder')
    expect(dialog).to_contain_text('A folder that this leaves empty is deleted too.')
    dialog.get_by_role('button', name='Remove', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Removed spin_{0-2}.dds: 1 entry, 3 files and 1 empty folder.')
    assert not (game / 'anim').exists() and (game / 'banner.dds').is_file()
    assert errors == []


def test_an_asset_whose_rsskey_a_view_uses_is_removed_after_a_second_confirmation_that_links_the_view(new_context, details_backend):
    backend, game = details_backend
    (game / 'v' / '1920x1080').mkdir(parents=True)
    (game / 'v' / '1920x1080' / 'Main.json').write_text(json.dumps({'name': 'MainView', 'elements': [{'id': 'banner', 'type': 'Image', 'rssKey': 'BANNER'}]}))
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.get_by_role('button', name='Remove banner.dds', exact=True).click()
    dialog = page.get_by_role('dialog', name='Remove banner.dds?')
    expect(dialog).to_contain_text('1 view uses it.')
    dialog.get_by_role('button', name='Remove', exact=True).click()
    # A second confirmation lists the views, each opening its details.
    used = page.get_by_role('dialog', name='BANNER is in use')
    expect(used).to_contain_text('This view uses the RssKey of banner.dds. Removing banner.dds leaves it without that resource')
    expect(used).to_contain_text('v/1920x1080/Main.json')
    expect(used).to_contain_text('banner (Image)')
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / 'remove-used-asset.png'))
    used.get_by_role('button', name='Back').click()
    expect(dialog).to_be_visible()
    dialog.get_by_role('button', name='Remove', exact=True).click()
    used.get_by_role('button', name='MainView').click()
    expect(page.get_by_role('dialog', name='Main.json')).to_be_visible()
    expect(used).to_have_count(0)
    assert (game / 'banner.dds').is_file()
    page.keyboard.press('Escape')
    # The list layout has the button too.
    page.get_by_role('button', name='List view').click()
    expect(page.locator('tr.asset-row')).to_have_count(5)
    page.locator('tr.asset-row').filter(has_text='banner.dds').get_by_role('button', name='Remove banner.dds', exact=True).click()
    dialog.get_by_role('button', name='Remove', exact=True).click()
    used.get_by_role('button', name='Remove anyway').click()
    expect(page.get_by_role('status')).to_contain_text('Removed banner.dds: 1 entry and 1 file.')
    assert not (game / 'banner.dds').exists()
    # The backup keeps the RssKey with its fields, which restoring it puts back.
    page.get_by_role('navigation', name='Main navigation').get_by_role('button', name='Backups', exact=True).click()
    removal = page.locator('article.backup-operation').first
    expect(removal).to_contain_text('Removed banner.dds: its 1 entry and 1 file')
    removal.get_by_role('button', name='Files').click()
    keys = removal.get_by_role('table', name=re.compile('RssKeys removed'))
    expect(keys).to_contain_text('BANNER')
    expect(keys).to_contain_text('{"path":"banner.dds"}')
    removal.get_by_role('button', name='Restore all').click()
    page.get_by_role('dialog', name=re.compile('Restore')).get_by_role('button', name='Restore', exact=True).click()
    expect(page.get_by_role('status').filter(has_text='Restored')).to_be_visible()
    assert (game / 'banner.dds').is_file()
    assert json.loads((game / 'RssImagesData.json').read_text())['images'][-1] == {'id': 'BANNER', 'path': 'banner.dds'}
    assert errors == []


def test_a_text_file_is_edited_in_its_details_and_saved_into_the_backups(new_context, details_backend):
    backend, game = details_backend
    (game / 'notes.csv').write_text('a,b\r\n1,2\r\n')
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.get_by_role('button', name='Inspect notes.csv', exact=True).click()
    details = page.get_by_role('dialog', name='notes.csv')
    editor = details.get_by_label('Text of notes.csv')
    expect(editor).to_have_value('a,b\n1,2\n')
    expect(details.get_by_role('button', name='Save', exact=True)).to_be_disabled()
    editor.fill('a,b\n1,2\n3,4\n')
    expect(details.get_by_role('status')).to_contain_text('Unsaved changes')
    details.get_by_role('button', name='Revert').click()
    expect(editor).to_have_value('a,b\n1,2\n')
    editor.fill('a,b\n1,2\n3,4\n')
    details.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_role('status').filter(has_text='Saved notes.csv.')).to_be_visible()
    assert (game / 'notes.csv').read_bytes() == b'a,b\r\n1,2\r\n3,4\r\n'
    expect(details.get_by_role('status')).to_contain_text('Saved')
    assert errors == []


@pytest.mark.parametrize(('content', 'line'), [
    ('{\n  "count": 1,\n}\n', 3),
    ('{\n  "count": nope\n}', 2),
    ('{\n  "count": 1\n', 3),
    ('', 1),
    ('{\n' + '\n' * 60 + '  "count": nope\n}', 62),
])
def test_invalid_json_highlights_its_line_and_updates_when_edited(new_context, details_backend, content, line):
    backend, game = details_backend
    (game / 'idata').mkdir()
    (game / 'idata' / 'broken.json').write_bytes(content.replace('\n', '\r\n').encode())
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Asset library', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    page.get_by_role('button', name='Inspect broken.json', exact=True).click()
    details = page.get_by_role('dialog', name='broken.json')
    editor = details.get_by_label('Text of broken.json')
    highlight = details.locator('.text-editor-error-line')
    expect(details.get_by_role('status')).to_contain_text('Not valid JSON:')
    expect(editor).to_have_attribute('aria-invalid', 'true')
    expect(highlight).to_have_attribute('data-line', str(line))
    details.get_by_role('button', name=f'Go to error on line {line}', exact=True).click()
    expect(editor).to_be_focused()
    assert editor.evaluate('el => el.selectionStart') == sum(len(part) + 1 for part in content.split('\n')[:line - 1])
    # The highlight tracks the actual line even after jumping and scrolling a long file.
    geometry = editor.evaluate('''el => {
      const style = getComputedStyle(el);
      const mark = el.parentElement.querySelector('.text-editor-error-line').getBoundingClientRect();
      return {actual: mark.top, expected: el.getBoundingClientRect().top + parseFloat(style.borderTopWidth)
        + parseFloat(style.paddingTop) + (Number(el.parentElement.querySelector('.text-editor-error-line').dataset.line) - 1)
        * parseFloat(style.lineHeight) - el.scrollTop, visible: mark.bottom > el.getBoundingClientRect().top
        && mark.top < el.getBoundingClientRect().bottom};
    }''')
    assert abs(geometry['actual'] - geometry['expected']) < 1
    assert geometry['visible']
    if line > 60:
        editor.evaluate('el => { el.scrollTop += 36; }')
        poll(lambda: highlight.evaluate('el => parseFloat(el.style.top)'),
             8 + (line - 1) * 18 - editor.evaluate('el => el.scrollTop'))
        BUILD.mkdir(exist_ok=True)
        page.screenshot(path=str(BUILD / 'text-editor-error-line.png'))

    editor.fill('{\n\n  "count": nope\n}')
    expect(highlight).to_have_attribute('data-line', '3')
    expect(details.get_by_role('button', name='Save', exact=True)).to_be_disabled()
    editor.fill('{\n  "count": 1\n}')
    expect(highlight).to_have_count(0)
    expect(editor).not_to_have_attribute('aria-invalid', 'true')
    expect(details.get_by_role('button', name='Save', exact=True)).to_be_enabled()
    details.get_by_role('button', name='Revert', exact=True).click()
    expect(editor).to_have_value(content)
    expect(highlight).to_have_attribute('data-line', str(line))
    assert errors == []
