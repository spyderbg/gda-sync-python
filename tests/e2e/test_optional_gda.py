"""Game-only workspaces hide sync navigation and can acquire a GDA connection later."""
import json

import pytest
from playwright.sync_api import expect

from tests.e2e.conftest import Backend
from tests.test_image_metadata import png

pytestmark = pytest.mark.e2e


def test_optional_gda_hides_sync_and_keeps_game_assets_usable(tmp_path, new_context, browser):
    game, gda, home = tmp_path / 'resources/burning_crown_tetra_spins_10', tmp_path / 'gda', tmp_path / 'app'
    png(game / 'symbol.png')
    (game / 'RssImagesData.json').write_text(json.dumps({'images': [{'id': 'SYMBOL', 'path': 'symbol.png'}]}))
    gda.mkdir()
    home.mkdir()
    (home / 'workspace.json').write_text(json.dumps({'defaultWorkspace': 'burning_crown_tetra_spins_10_no_gda',
        'workspaces': [{'id': 'burning_crown_tetra_spins_10_no_gda', 'game_name': 'Burning Crown Tetra Spins 10 (No GDA)',
                        'game_path': str(game)}]}))
    backend = Backend(home)
    try:
        page = new_context().new_page()
        page.goto(backend.url)
        page.get_by_role('list', name='Workspaces').get_by_role('button', name='Burning Crown Tetra Spins 10 (No GDA)', exact=True).click()
        navigation = page.get_by_role('navigation', name='Main navigation')
        expect(navigation.get_by_role('heading', name='Sync', exact=True)).to_have_count(0)
        expect(navigation.get_by_role('list', name='Sync', exact=True)).to_have_count(0)
        expect(navigation.get_by_role('button', name='Asset library', exact=True)).to_be_visible()
        expect(navigation.get_by_role('button', name='Play', exact=True)).to_be_visible()
        expect(navigation.get_by_role('button', name='Image studio', exact=True)).to_be_visible()
        page.get_by_role('region', name='Workspace summary').get_by_role('button', name='Rescan', exact=True).click()
        expect(page.locator('.asset-card')).to_have_count(1)
        expect(page.get_by_role('status')).to_contain_text('Asset report generated')
        page.get_by_role('banner').get_by_role('button', name='Workspace settings', exact=True).click()
        source = page.get_by_label('GDA path', exact=True)
        expect(source).to_have_value('')
        assert not source.evaluate('(element) => element.required')
        # A name-only edit saves a game-only workspace with no synthetic GDA path.
        page.get_by_label('Project name', exact=True).fill('Burning Crown initial tests')
        page.get_by_role('button', name='Save workspace', exact=True).click()
        expect(navigation.get_by_role('list', name='Sync', exact=True)).to_have_count(0)
        expect(page.get_by_role('region', name='Workspace summary')).to_be_visible()
        # Visibility reacts immediately when the optional connection is added or removed.
        for path in (str(gda), '', str(tmp_path / 'unavailable-gda')):
            page.get_by_role('banner').get_by_role('button', name='Workspace settings', exact=True).click()
            source.fill(path)
            page.get_by_role('button', name='Save workspace', exact=True).click()
            expect(page.get_by_role('region', name='Workspace summary')).to_be_visible()
            expect(navigation.get_by_role('list', name='Sync', exact=True)).to_have_count(1 if path else 0)
    finally:
        backend.stop()
