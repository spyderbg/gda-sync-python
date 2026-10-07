import json
import os
import re
import socket
import threading
import time
import urllib.request

import pytest

from egt_gda_sync.library import Library
from egt_gda_sync.runtime import AppServer, bind_local_socket
from egt_gda_sync.server import create_app

LOOPBACK = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def wait_for(check, timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while not check():
        assert time.monotonic() < deadline, "Expected the lifecycle state in time"
        time.sleep(0.01)


class Connection:
    """A raw HTTP/1.1 request, so a test decides exactly when the browser side disconnects."""

    def __init__(self, port: int, method: str, path: str, headers: dict[str, str] | None = None, body: bytes = b""):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=5)
        lines = [f"{method} {path} HTTP/1.1", f"Host: 127.0.0.1:{port}", f"Content-Length: {len(body)}"]
        lines += [f"{name}: {value}" for name, value in (headers or {}).items()]
        self.sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode() + body)
        self.received = b""

    def read_until(self, marker: bytes) -> bytes:
        while marker not in self.received:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise AssertionError(f"Connection closed before {marker!r}: {self.received!r}")
            self.received += chunk
        return self.received

    def read_to_end(self) -> bytes:
        while chunk := self.sock.recv(65536):
            self.received += chunk
        return self.received

    @property
    def status(self) -> int:
        return int(self.read_until(b"\r\n").split(b" ", 2)[1])

    def close(self) -> None:
        self.sock.close()


class LiveServer:
    def __init__(self, library: Library, grace: float):
        self.library = library
        self.shutdowns = 0
        self.server = AppServer(create_app(library, dev=True, on_shutdown=self._on_shutdown, page_close_grace=grace))
        sock = bind_local_socket(0)
        self.port = sock.getsockname()[1]
        self.thread = threading.Thread(target=self.server.run, kwargs={"sockets": [sock]}, daemon=True)
        self.thread.start()
        wait_for(lambda: self.server.started, 5)
        with LOOPBACK.open(f"http://127.0.0.1:{self.port}/api/session") as response:
            set_cookie = response.headers["Set-Cookie"]
            session = json.load(response)
        assert re.search(r"HttpOnly; SameSite=Strict; Path=/api/lifecycle", set_cookie)
        assert session["autoShutdownOnClose"] is True
        self.cookie, self.token = set_cookie.split(";")[0], session["token"]

    def _on_shutdown(self) -> None:
        self.shutdowns += 1
        self.server.request_shutdown()

    @property
    def closed(self) -> bool:
        return not self.thread.is_alive()

    def pages(self) -> int:
        with LOOPBACK.open(f"http://127.0.0.1:{self.port}/api/health") as response:
            return json.load(response)["openPages"]

    def connect(self) -> Connection:
        page = Connection(self.port, "GET", "/api/lifecycle", {"Cookie": self.cookie})
        head = page.read_until(b"event: connected")
        assert page.status == 200
        assert b"content-type: text/event-stream" in head.lower()
        assert b"content-length" not in head.lower()
        return page

    def stop(self) -> None:
        self.server.request_shutdown()
        self.thread.join(5)


@pytest.fixture
def live(tmp_path):
    servers: list[LiveServer] = []

    def start(grace: float = 0.1) -> LiveServer:
        library = Library(str(tmp_path / f"app-{len(servers)}"))
        library.init()
        servers.append(LiveServer(library, grace))
        return servers[-1]

    yield start
    for server in servers:
        server.stop()


def test_lifecycle_is_authenticated_and_waits_for_the_first_page_before_scheduling_shutdown(live):
    server = live()
    for headers in ({}, {"Cookie": "gda-session=wrong"}, {"Cookie": server.cookie, "Sec-Fetch-Site": "cross-site"}):
        request = Connection(server.port, "GET", "/api/lifecycle", headers)
        assert request.status == 403
        request.close()
    time.sleep(0.15)
    assert server.pages() == 0
    assert server.shutdowns == 0


def test_closing_one_page_keeps_the_backend_alive_and_closing_the_last_page_shuts_it_down_once(live):
    server = live()
    first, second = server.connect(), server.connect()
    assert server.pages() == 2
    first.close()
    wait_for(lambda: server.pages() == 1)
    time.sleep(0.15)
    assert server.shutdowns == 0
    second.close()
    wait_for(lambda: server.closed)
    assert server.shutdowns == 1


def test_a_page_reconnecting_during_the_refresh_grace_period_cancels_shutdown(live):
    server = live(grace=0.4)
    server.connect().close()
    wait_for(lambda: server.pages() == 0)
    refreshed = server.connect()
    time.sleep(0.45)
    assert server.shutdowns == 0
    assert server.pages() == 1
    refreshed.close()
    wait_for(lambda: server.closed)
    assert server.shutdowns == 1


def test_manual_server_shutdown_finishes_open_event_streams_without_hanging(live):
    server = live()
    page = server.connect()
    server.server.request_shutdown()
    assert page.read_to_end().endswith(b"0\r\n\r\n")
    wait_for(lambda: server.closed)
    time.sleep(0.15)
    assert server.shutdowns == 0


def test_shutdown_waits_for_an_active_file_copy_even_when_its_browser_request_disconnects(live, monkeypatch):
    server = live()
    library = server.library
    asset = next(asset for asset in library.dashboard()["assets"] if asset["status"] == "new")
    with open(os.path.join(library.config["source"], asset["path"]), "rb") as handle:
        original = handle.read()
    page = server.connect()
    release = threading.Event()
    scan = library.scan

    def blocked_scan():
        release.wait(10)
        return scan()

    monkeypatch.setattr(library, "scan", blocked_scan)
    body = json.dumps({"ids": [asset["id"]]}).encode()
    request = Connection(server.port, "POST", "/api/sync", {"Content-Type": "application/json", "x-gda-token": server.token}, body)
    try:
        wait_for(lambda: library.busy)
        request.close()
        page.close()
        wait_for(lambda: server.shutdowns == 1)
        time.sleep(0.05)
        assert not server.closed, "An aborted request must not interrupt the copy"
    finally:
        release.set()
    wait_for(lambda: server.closed, 5)
    with open(os.path.join(library.config["destination"], asset["path"]), "rb") as handle:
        assert handle.read() == original
