"""The dashboard combines configured workspaces while file inspection remains workspace-specific."""

import json

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import BUILD, Backend

pytestmark = pytest.mark.e2e


@pytest.fixture
def dashboard_backend(tmp_path, browser):
    home = tmp_path / 'app'
    home.mkdir()
    entries = []
    for name in ('first', 'second'):
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
    expect(page.get_by_role('heading', name='shared.txt', exact=True)).to_be_visible()
    expect(page.locator('.inspector')).to_contain_text('Modified')
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
