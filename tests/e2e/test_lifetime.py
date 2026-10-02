"""The backend process follows the lifetime of its browser pages."""

import time

import pytest

from tests.e2e.conftest import Backend, poll

pytestmark = pytest.mark.e2e


@pytest.fixture
def backend(tmp_path, browser):
    server = Backend(tmp_path / "app")
    yield server
    server.stop()


def test_refresh_and_another_open_tab_keep_the_backend_alive_and_closing_the_last_tab_exits(new_context, backend):
    context = new_context()
    page = context.new_page()
    # A --no-open launch waits for its first page rather than immediately quitting.
    time.sleep(2.2)
    assert backend.pages() == 0
    page.goto(backend.url)
    poll(backend.pages, 1)
    page.reload()
    poll(backend.pages, 1)
    time.sleep(2.2)
    assert backend.pages() == 1

    other = context.new_page()
    other.goto(backend.url)
    poll(backend.pages, 2)
    other.close()
    poll(backend.pages, 1)
    unrelated = context.new_page()
    unrelated.goto("about:blank")
    unrelated.bring_to_front()
    time.sleep(2.2)
    assert backend.pages() == 1
    page.close()
    assert backend.wait_for_exit(5) == 0


def test_restoring_a_page_reconnects_and_navigating_away_from_the_last_app_page_exits(new_context, backend):
    page = new_context().new_page()
    page.goto(backend.url)
    poll(backend.pages, 1)
    # Exercise the pagehide/pageshow lifecycle used when restoring a cached page.
    page.evaluate("() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))")
    poll(backend.pages, 0)
    page.evaluate("() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))")
    poll(backend.pages, 1)
    time.sleep(2.2)
    assert backend.pages() == 1
    page.goto("about:blank")
    assert backend.wait_for_exit(5) == 0
