"""The dashboard combines configured workspaces while file inspection remains workspace-specific."""

import json

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend

pytestmark = pytest.mark.e2e


@pytest.fixture
def dashboard_backend(tmp_path, browser, request):
    home = tmp_path / 'app'
    home.mkdir()
    entries = []
    for name in ['first', 'second', *(f'workspace-{index}' for index in range(2, getattr(request, 'param', 2)))]:
        source, destination = tmp_path / name / 'gda', tmp_path / name / 'game'
        source.mkdir(parents=True)
        destination.mkdir()
        entries.append({'id': name, 'game_name': name.title(), 'gda_path': str(source), 'game_path': str(destination)})
    (tmp_path / 'first' / 'gda' / 'shared.txt').write_text('same')
    (tmp_path / 'first' / 'game' / 'shared.txt').write_text('same')
    (tmp_path / 'first' / 'gda' / 'waiting.txt').write_text('first')
    (tmp_path / 'second' / 'gda' / 'shared.txt').write_text('longer')
    (tmp_path / 'second' / 'game' / 'shared.txt').write_text('other!')
    (tmp_path / 'second' / 'gda' / 'ready.csv').write_text('1,2\n')
    (tmp_path / 'second' / 'game' / 'ready.csv').write_text('1,2\n')
    (home / 'workspace.json').write_text(json.dumps({'workspaces': entries, 'defaultWorkspace': 'first'}))
    server = Backend(home)
    yield server, home / 'workspace.json'
    server.stop()


def test_dashboard_combines_workspaces_and_inspects_the_owning_workspace(new_context, dashboard_backend):
    backend, config_path = dashboard_backend
    page = new_context().new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(backend.url)
    expect(page.get_by_role('heading', name='Keep game resources in sync with the GDA')).to_be_visible()
    expect(page.get_by_text('Combined statistics for 2 configured workspaces.', exact=True)).to_be_visible()
    expect(page.locator('.dashboard-stats h3')).to_have_text(['4', '2', '2', '19 B'])
    expect(page.get_by_text('2 formats', exact=True)).to_be_visible()
    expect(page.get_by_text('1 new · 1 modified', exact=True)).to_be_visible()
    expect(page.get_by_role('img', name='50% of files in sync')).to_be_visible()
    expect(page.locator('.page-title-header')).to_have_count(0)
    expect(page.get_by_role('button', name='Rescan', exact=True)).to_have_count(0)
    expect(page.get_by_role('button', name='Sync all pending', exact=True)).to_have_count(0)
    assert json.loads(config_path.read_text())['defaultWorkspace'] == 'first'
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / 'dashboard-combined-desktop.png'))

    # Both workspaces have shared.txt; the waiting file belongs to Second and has different contents.
    row = page.get_by_role('row').filter(has=page.get_by_role('cell', name='shared.txt', exact=True))
    expect(row).to_contain_text('Second / Root')
    row.click()
    # The asset library opens with a search for the file; the workspace has no asset report yet.
    expect(page.get_by_role('heading', name='No asset report yet')).to_be_visible()
    assert json.loads(config_path.read_text())['defaultWorkspace'] == 'second'

    # Returning to Dashboard still includes First, regardless of the selected workspace.
    page.reload()
    expect(page.locator('.dashboard-stats h3')).to_have_text(['4', '2', '2', '19 B'])
    page.set_viewport_size({'width': 390, 'height': 844})
    expect(page.locator('.main-panel')).to_have_css('width', '390px')
    expect(page.get_by_role('heading', name='Select a workspace')).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(BUILD / 'dashboard-combined-mobile.png'))
    assert errors == []


def test_workspace_cards_open_current_and_switch_workspace_from_dashboard(new_context, dashboard_backend):
    backend, config_path = dashboard_backend
    page = new_context().new_page()
    switches = []
    page.on('request', lambda request: switches.append(request.post_data_json)
            if request.url.endswith('/api/workspace') and request.method == 'PUT' else None)
    page.goto(backend.url)
    cards = page.get_by_role('list', name='Workspaces', exact=True)
    first = cards.get_by_role('button', name='First', exact=True)
    second = cards.get_by_role('button', name='Second', exact=True)
    expect(cards.locator('.workspace-card')).to_have_count(2)
    expect(first).to_have_attribute('aria-current', 'true')
    expect(first).to_contain_text('GDA folder')
    expect(first).to_contain_text('Game folder')
    expect(first).to_contain_text(str(config_path.parent.parent / 'first' / 'gda'))
    navigation = page.get_by_role('navigation', name='Main navigation')
    expect(navigation.get_by_role('list', name='Workspaces', exact=True)).to_have_count(0)
    expect(navigation.get_by_role('button', name='Dashboard', exact=True)).to_have_count(0)
    expect(page.get_by_role('link', name='EGT GDA Sync', exact=True)).to_have_attribute('aria-current', 'page')
    for section in ('Sync', 'Assets', 'Game'):
        expect(navigation.get_by_role('list', name=section, exact=True)).to_be_visible()

    # Opening the current workspace starts at Asset library without an unnecessary workspace write.
    first.click()
    expect(page.get_by_role('region', name='Workspace summary')).to_contain_text('/first/game')
    expect(navigation.get_by_role('button', name='Asset library', exact=True)).to_have_attribute('aria-current', 'page')
    assert switches == []
    page.get_by_role('link', name='EGT GDA Sync', exact=True).click()
    # Keyboard activation of a different card persists the selection and opens its Asset library.
    second.focus()
    second.press('Enter')
    expect(page.get_by_role('region', name='Workspace summary')).to_contain_text('/second/game')
    expect(navigation.get_by_role('button', name='Asset library', exact=True)).to_have_attribute('aria-current', 'page')
    expect(page.get_by_role('banner')).to_contain_text('Second')
    assert switches == [{'id': 'second'}]
    assert json.loads(config_path.read_text())['defaultWorkspace'] == 'second'
    page.get_by_role('link', name='EGT GDA Sync', exact=True).click()
    expect(second).to_have_attribute('aria-current', 'true')
    expect(first).not_to_have_attribute('aria-current', 'true')
    page.reload()
    expect(second).to_have_attribute('aria-current', 'true')


@pytest.mark.parametrize('dashboard_backend', [10], indirect=True)
def test_workspace_card_filter_and_mobile_selection(new_context, dashboard_backend):
    backend, config_path = dashboard_backend
    page = new_context().new_page()
    page.goto(backend.url)
    cards = page.get_by_role('list', name='Workspaces', exact=True)
    expect(cards.locator('.workspace-card')).to_have_count(10)
    query = page.get_by_role('searchbox', name='Filter workspaces', exact=True)
    query.fill('SECOND')
    expect(cards.get_by_role('button')).to_have_count(1)
    expect(cards.get_by_role('button', name='Second', exact=True)).to_be_visible()
    query.fill('workspace-9')
    expect(cards.get_by_role('button')).to_have_count(1)
    expect(cards.get_by_role('button', name='Workspace-9', exact=True)).to_be_visible()
    query.fill('no-such-workspace')
    expect(cards.get_by_role('button')).to_have_count(0)
    expect(page.get_by_role('status').filter(has_text='No matching workspace')).to_be_visible()
    query.fill('second')
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    BUILD.mkdir(exist_ok=True)
    page.screenshot(path=str(BUILD / 'dashboard-workspace-cards-mobile.png'))
    # Cards stay reachable on mobile without opening the off-canvas sidebar.
    cards.get_by_role('button', name='Second', exact=True).click()
    expect(page.get_by_role('region', name='Workspace summary')).to_contain_text('/second/game')
    assert json.loads(config_path.read_text())['defaultWorkspace'] == 'second'
    page.get_by_role('link', name='Toggle navigation', exact=True).click()
    page.get_by_role('link', name='EGT GDA Sync', exact=True).click()
    expect(cards.get_by_role('button')).to_have_count(10)
    expect(page.get_by_role('link', name='Toggle navigation', exact=True)).to_have_attribute('aria-expanded', 'false')


def test_workspace_selection_survives_statistics_and_switch_failures(new_context, dashboard_backend):
    backend, config_path = dashboard_backend
    page = new_context().new_page()
    page.route('**/api/dashboard', lambda route: route.fulfill(status=503, json={'error': 'Statistics temporarily unavailable'}))
    page.route('**/api/workspace', lambda route: route.fulfill(status=503, json={'error': 'Workspace temporarily unavailable'}))
    page.goto(backend.url)
    expect(page.get_by_role('alert')).to_contain_text('Statistics temporarily unavailable')
    cards = page.get_by_role('list', name='Workspaces', exact=True)
    first = cards.get_by_role('button', name='First', exact=True)
    second = cards.get_by_role('button', name='Second', exact=True)
    second.click()
    expect(page.get_by_role('status').filter(has_text='Workspace temporarily unavailable')).to_be_visible()
    expect(first).to_have_attribute('aria-current', 'true')
    expect(second).to_be_enabled()
    assert json.loads(config_path.read_text())['defaultWorkspace'] == 'first'
    page.unroute('**/api/workspace')
    second.click()
    expect(page.get_by_role('region', name='Workspace summary')).to_contain_text('/second/game')
    assert json.loads(config_path.read_text())['defaultWorkspace'] == 'second'


def test_dashboard_retries_failed_combined_statistics_without_showing_zero_totals(new_context, dashboard_backend):
    backend, _ = dashboard_backend
    page = new_context().new_page()
    page.route('**/api/dashboard', lambda route: route.fulfill(status=503, json={'error': 'Statistics temporarily unavailable'}))
    page.goto(backend.url)
    expect(page.get_by_role('heading', name='Keep game resources in sync with the GDA')).to_be_visible()
    expect(page.get_by_role('alert')).to_contain_text('Statistics temporarily unavailable')
    expect(page.locator('.dashboard-stats')).to_have_count(0)
    page.unroute('**/api/dashboard')
    page.get_by_role('button', name='Retry', exact=True).click()
    expect(page.locator('.dashboard-stats h3')).to_have_text(['4', '2', '2', '19 B'])
    expect(page.get_by_role('alert')).to_have_count(0)
