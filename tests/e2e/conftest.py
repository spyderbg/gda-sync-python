import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from collections.abc import Callable
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build"
LOOPBACK = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def poll(read: Callable[[], object], expected: object, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while (value := read()) != expected:
        assert time.monotonic() < deadline, f"Expected {expected!r}, last value {value!r}"
        time.sleep(0.05)


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class Backend:
    """The application started like a user would, in an isolated app-data directory."""

    def __init__(self, home: Path):
        port = free_port()
        self.url = f"http://127.0.0.1:{port}"
        self.log = home.with_name(f"{home.name}.log")
        env = {**os.environ, "PORT": str(port), "EGT_GDA_SYNC_HOME": str(home)}
        env.pop("EGT_GDA_SYNC_DEV", None)
        with open(self.log, "wb") as output:
            self.process = subprocess.Popen(
                [sys.executable, "-m", "egt_gda_sync", "--no-open"], cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT,
            )
        deadline = time.monotonic() + 20
        while self.get("/api/health") is None:
            if self.process.poll() is not None or time.monotonic() > deadline:
                self.stop()
                raise RuntimeError(f"Backend did not start:\n{self.log.read_text()}")
            time.sleep(0.1)

    def get(self, path: str) -> dict | None:
        try:
            with LOOPBACK.open(self.url + path, timeout=2) as response:
                return json.load(response)
        except OSError:
            return None

    def pages(self) -> int | None:
        health = self.get("/api/health")
        return health["openPages"] if health else None

    def wait_for_exit(self, timeout: float) -> int:
        return self.process.wait(timeout)

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
        self.process.wait(10)


@pytest.fixture(scope="session")
def browser():
    if not (ROOT / "egt_gda_sync" / "static" / "index.html").exists():
        pytest.skip("Build the frontend first: python scripts/build.py")
    playwright_api = pytest.importorskip("playwright.sync_api")
    playwright = playwright_api.sync_playwright().start()
    try:
        browser = playwright.chromium.launch(headless=True)
    except Exception as error:  # Browser binaries missing.
        playwright.stop()
        pytest.skip(f"Chromium is unavailable ({error}). Run: python -m playwright install chromium")
    yield browser
    browser.close()
    playwright.stop()


@pytest.fixture
def new_context(browser):
    contexts = []

    def create(**options):
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, timezone_id="Europe/Sofia", **options)
        contexts.append(context)
        return context

    yield create
    for context in contexts:
        context.close()
