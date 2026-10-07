"""RTFs are a section of the asset library, whose cards and details show their pages."""

import json

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend
from tests.fixtures.rtf import write_project

pytestmark = pytest.mark.e2e


@pytest.fixture
def rtf_backend(tmp_path):
    gda, game = tmp_path / 'gda', tmp_path / 'resources' / 'example'
    gda.mkdir()
    write_project(game / 'help')
    (game / 'RssRtfsData.json').write_text(json.dumps({'rtfs': [{'id': 'rtf_common_default', 'path': 'help/project.rtf'}]}, indent=2))
    home = tmp_path / 'app'
    home.mkdir()
    entry = {'id': 'example', 'game_name': 'Example', 'game_path': str(game), 'gda_path': str(gda), 'extensions': ['.rtf']}
    (home / 'workspace.json').write_text(json.dumps({'workspaces': [entry], 'defaultWorkspace': 'example'}))
    server = Backend(home)
    yield server
    server.stop()


def test_the_library_shows_an_rtf_with_its_pages(new_context, rtf_backend):
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(rtf_backend.url)
    page.get_by_role('list', name='Workspaces').get_by_role('button', name='Example', exact=True).click()
    page.get_by_role('button', name='RTFs', exact=True).click()
    page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
    expect(page.get_by_role('button', name='RTFs', exact=True)).to_contain_text('1')
    card = page.locator('.asset-card')
    expect(card).to_have_count(1)
    # An RTF is its folder, named by it, with every file in it.
    expect(card.locator('.asset-name')).to_have_text('help')
    expect(card).to_contain_text('3 pages · English, Italian · 7 files')
    expect(card).to_contain_text('2 files that its pages draw are missing')
    # The card starts at the first page with a background, and its strip shows each page without opening the details.
    expect(card.locator('.rtf-preview-caption')).to_have_text('rules · 1920 × 1080')
    expect(card.get_by_role('img', name='rules page of help')).to_have_js_property('naturalWidth', 64)
    pages = card.get_by_role('group', name='Pages of help')
    expect(pages.get_by_role('button')).to_have_count(3)
    pages.get_by_role('button', name='Show page wintable').click()
    expect(card.locator('.rtf-preview-caption')).to_have_text('wintable · 1920 × 1080')
    pages.get_by_role('button', name='Show page keyboard').click()
    expect(card.locator('.rtf-preview-page')).to_contain_text('No background')
    expect(page.get_by_role('dialog')).to_have_count(0)
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / 'rtf-library-desktop.png'))
    # The list shows the background of the first page that has one.
    page.get_by_role('button', name='List view').click()
    expect(page.locator('.asset-row img')).to_have_attribute('alt', 'background.dds preview')
    page.get_by_role('button', name='Grid view').click()

    card.get_by_role('button', name='Show details for help').click()
    details = page.get_by_role('dialog', name='help')
    expect(details.get_by_role('row', name='Pages 3, 1366 × 768, 1920 × 1080')).to_be_visible()
    expect(details.get_by_role('row', name='Missing files 2')).to_be_visible()
    expect(details.get_by_role('row', name='Project file project.rtf, RTF Tool project (JSON)')).to_be_visible()
    files = details.locator('.details-rtf-files tbody tr')
    expect(files).to_have_count(7)
    expect(files.first.locator('td')).to_have_text(['data/background.dds', '64 × 36', '2.4 KB'])
    expect(details.locator('.details-rtf-missing li')).to_have_text(['image_image_9_not mapped to a file', 'image_image_4_data/gone.dds'])
    # The page is drawn with each section's default text in the first language.
    rules = details.get_by_role('group', name='Page rules')
    expect(rules.locator('.rtf-page-background')).to_have_js_property('naturalWidth', 64)
    title = rules.locator('[data-section="title"]')
    expect(title).to_have_text('How to play')
    expect(title).to_have_css('text-transform', 'uppercase')
    expect(title.locator('span')).to_have_css('font-weight', '900')
    text = rules.locator('[data-section="text"]')
    expect(text).to_contain_text('Serial _serial_number_ · code ABC-123')
    expect(text.locator('img.rtf-inline')).to_have_js_property('naturalWidth', 24)
    expect(rules.locator('[data-section="footer"] .rtf-placeholder.is-missing')).to_have_text('_image_4_')
    details.get_by_role('group', name='Language').get_by_role('button', name='Italian').click()
    expect(title).to_have_text('Come giocare')
    details.get_by_role('checkbox', name='Show text areas').check()
    expect(rules.locator('.rtf-section-name')).to_have_text(['footer', 'text', 'title'])
    page.screenshot(path=str(BUILD / 'rtf-details-desktop.png'))

    # The pages table shows a page on the preview; the language stays.
    details.locator('.details-page-button', has_text='wintable').click()
    wintable = details.get_by_role('group', name='Page wintable')
    expect(wintable.locator('[data-section="bell_x3"] .rtf-section-text')).to_have_text('3× bell')
    expect(wintable.locator('[data-section="spin"] img.is-video')).to_have_js_property('naturalWidth', 16)
    expect(wintable.locator('[data-section="prizes"] .rtf-section-text')).to_have_text('TUTTE LE VINCITE SONO MOSTRATE IN CREDITI')
    expect(details.get_by_role('group', name='Pages of help').get_by_role('button', name='Show page wintable')).to_have_attribute('aria-pressed', 'true')
    details.locator('.details-page-button', has_text='keyboard').click()
    expect(details.get_by_role('group', name='Page keyboard')).to_contain_text('The background is not mapped')
    assert errors == []
