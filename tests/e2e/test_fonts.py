"""Fonts are drawn with themselves in the asset library and on the Sync page, with the characters their entries declare."""

import json
import shutil
from pathlib import Path

import pytest
from playwright.sync_api import expect

from egt_gda_sync.library import Library
from tests.e2e.conftest import BUILD, Backend, poll

pytestmark = pytest.mark.e2e
DEJAVU = Path('/usr/share/fonts/truetype/dejavu')
# Latin, six Cyrillic letters and the euro sign, which DejaVu Sans has, and three CJK characters, which it has not.
CHARS = '[U+0020-U+007E][U+0410-U+0415][U+20AC][U+4E00-U+4E02]'


@pytest.fixture
def font_backend(tmp_path, browser):
    if not (DEJAVU / 'DejaVuSans.ttf').is_file() or not (DEJAVU / 'DejaVuSansMono.ttf').is_file():
        pytest.skip('The DejaVu fonts are not installed')
    gda, game = tmp_path / 'gda', tmp_path / 'resources' / 'example'
    (gda / 'fonts').mkdir(parents=True)
    (game / 'fonts').mkdir(parents=True)
    shutil.copyfile(DEJAVU / 'DejaVuSans.ttf', game / 'fonts' / 'main.ttf')
    shutil.copyfile(DEJAVU / 'DejaVuSansMono.ttf', gda / 'fonts' / 'main.ttf')
    # A font larger than a card loads by itself.
    (game / 'fonts' / 'big.ttf').write_bytes((DEJAVU / 'DejaVuSans.ttf').read_bytes() + b'\0' * (2 * 1024 * 1024))
    (game / 'RssFontsData.json').write_text(json.dumps({'fonts': [{'id': 'FONT_MAIN', 'path': 'fonts/main.ttf', 'chars': CHARS, 'size': 28}]}, indent=2))
    home = tmp_path / 'app'
    home.mkdir()
    entry = {'id': 'example', 'game_name': 'Example', 'game_path': str(game), 'gda_path': str(gda), 'extensions': ['.ttf']}
    (home / 'workspace.json').write_text(json.dumps({'workspaces': [entry], 'defaultWorkspace': 'example'}))
    library = Library(str(home))
    library.init()
    assert library.compare_workspace('example')['state'] == 'succeeded'
    library.close()
    server = Backend(home)
    yield server
    server.stop()


def loaded_fonts(page):
    return page.evaluate("[...document.fonts].filter(face => face.family.includes('font-preview') && face.status === 'loaded').length")


def test_the_library_draws_a_font_with_its_declared_characters_and_marks_the_missing_ones(new_context, font_backend):
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(font_backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='Fonts', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    expect(page.locator('.asset-card')).to_have_count(2)
    main = page.locator('.asset-card').filter(has_text='main.ttf')
    expect(main.locator('.font-preview-glyphs')).to_have_text('Aa')
    expect(main).to_contain_text('3 declared characters of FONT_MAIN not in the font')
    poll(lambda: loaded_fonts(page), 1)
    # The large font waits to be asked.
    big = page.locator('.asset-card').filter(has_text='big.ttf')
    expect(big).to_contain_text('2.7 MB font')
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / 'font-library-desktop.png'))

    main.get_by_role('button', name='Show details for main.ttf').click()
    details = page.get_by_role('dialog', name='main.ttf')
    expect(details.get_by_role('row', name='Family DejaVu Sans')).to_be_visible()
    expect(details.locator('.details-coverage')).to_have_text('102 of 105 declared characters')
    expect(details.locator('.details-missing .badge')).to_have_text(['U+4E00 一', 'U+4E01 丁', 'U+4E02 丂'])
    # The specimen draws the declared ranges at the declared size, and marks the characters the font has not.
    expect(details.locator('.font-preview-range small')).to_have_text(['U+0020–U+007E', 'U+0410–U+0415', 'U+20AC', 'U+4E00–U+4E02'])
    expect(details.locator('.font-preview-range .is-missing')).to_have_count(3)
    # A specimen: the font's name, its alphabets, a sample of each other writing system it can draw, and a waterfall of
    # sizes with the declared one.
    expect(details.locator('.font-specimen-title')).to_have_text('DejaVu Sans, Book')
    expect(details.locator('.font-specimen-alphabet')).to_have_count(3)
    expect(details.locator('.font-specimen-sample small')).to_have_text(['Latin Extended', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Currencies'])
    declared = details.locator('.font-specimen-waterfall .is-declared')
    expect(declared.locator('small')).to_have_text('28 px, declared')
    expect(declared.locator('span')).to_have_css('font-size', '28px')
    expect(details.locator('.font-specimen-waterfall p')).to_have_count(10)
    details.get_by_role('textbox', name='Text to draw with main.ttf').fill('Цена 10 €')
    expect(declared.locator('span')).to_have_text('Цена 10 €')
    page.screenshot(path=str(BUILD / 'font-details-desktop.png'))
    assert errors == []


def test_the_sync_page_draws_the_game_and_gda_fonts_side_by_side(new_context, font_backend):
    page = new_context().new_page()
    page.goto(font_backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    card = page.locator('.resource-card.is-different')
    expect(card.locator('.font-preview-glyphs')).to_have_count(2)
    card.get_by_role('button', name='Show details for main.ttf').click()
    details = page.get_by_role('dialog', name='main.ttf')
    expect(details.locator('.font-preview-specimen')).to_have_count(2)
    family = details.get_by_role('row').filter(has_text='Family')
    expect(family).to_have_text('FamilyDejaVu SansDejaVu Sans Mono')
    expect(family.locator('td.is-different')).to_have_count(2)
    expect(details.get_by_role('row').filter(has_text='Characters of FONT_MAIN')).to_have_text('Characters of FONT_MAIN102 of 105102 of 105')
    # Text typed for one font is drawn by both.
    details.get_by_role('textbox', name='Text to draw with main.ttf').first.fill('Side by side')
    expect(details.locator('.font-specimen-waterfall .is-declared span')).to_have_text(['Side by side', 'Side by side'])
    expect(details.locator('.font-specimen-title')).to_have_text(['DejaVu Sans, Book', 'DejaVu Sans Mono, Book'])
    page.screenshot(path=str(BUILD / 'font-sync-details-desktop.png'))
