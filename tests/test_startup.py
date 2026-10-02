import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

from gda_sync import __main__ as launcher
from scripts import dev

ROOT = Path(__file__).resolve().parents[1]
LOOPBACK = urllib.request.build_opener(urllib.request.ProxyHandler({}))


@pytest.mark.parametrize("config, override, expected", [
    ({}, None, 3456),
    ({"port": 4567}, None, 4567),
    ({"port": "4567"}, None, 4567),
    ({"port": 4567}, "5678", 5678),
    ({"port": 4567}, "", 4567),
    ({"port": 0}, "5678", 5678),
    ({"port": 1}, None, 1),
    ({"port": 65535}, None, 65535),
])
def test_port_precedence_and_defaults(config, override, expected, monkeypatch):
    monkeypatch.delenv("PORT", raising=False)
    if override is not None:
        monkeypatch.setenv("PORT", override)
    assert launcher._port(config) == expected


@pytest.mark.parametrize("value", [0, -1, 65536, True, 3456.5, None, "invalid"])
def test_invalid_configured_ports_fail_with_a_configuration_error(value, monkeypatch):
    monkeypatch.delenv("PORT", raising=False)
    with pytest.raises(RuntimeError, match="port in workspace.json must be an integer between 1 and 65535"):
        launcher._port({"port": value})


@pytest.mark.parametrize("override", ["0", "65536", "invalid"])
def test_invalid_port_override_does_not_fall_back_to_a_valid_configuration(override, monkeypatch):
    monkeypatch.setenv("PORT", override)
    with pytest.raises(RuntimeError, match="PORT must be an integer between 1 and 65535"):
        launcher._port({"port": 4567})


def configured_workspace(tmp_path, port):
    source, destination = tmp_path / "source", tmp_path / "gda"
    source.mkdir()
    destination.mkdir()
    home = tmp_path / "app-data"
    home.mkdir()
    settings = {"name": "Port test", "source": str(source), "destination": str(destination), "port": port}
    (home / "workspace.json").write_text(json.dumps(settings), encoding="utf-8")
    return home, settings


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@pytest.mark.parametrize("use_override", [False, True])
def test_launcher_listens_on_the_resolved_port_and_keeps_the_configured_value(tmp_path, use_override):
    configured_port = free_port()
    active_port = configured_port
    if use_override:
        while active_port == configured_port:
            active_port = free_port()
    home, settings = configured_workspace(tmp_path, configured_port)
    env = {**os.environ, "GDA_SYNC_HOME": str(home)}
    env.pop("GDA_SYNC_DEV", None)
    env.pop("PORT", None)
    if use_override:
        env["PORT"] = str(active_port)
    log_path = tmp_path / "backend.log"
    with log_path.open("wb") as output:
        child = subprocess.Popen(
            [sys.executable, "-m", "gda_sync", "--no-open"], cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT,
        )

    url = f"http://127.0.0.1:{active_port}"

    def get_json(path):
        with LOOPBACK.open(url + path, timeout=2) as response:
            return json.load(response)

    try:
        deadline = time.monotonic() + 10
        while True:
            try:
                assert get_json("/api/health")["ready"] is True
                break
            except OSError:
                assert child.poll() is None and time.monotonic() < deadline, log_path.read_text(encoding="utf-8")
                time.sleep(0.05)
        assert get_json("/api/library")["config"] == {**settings, "demo": False}
        assert json.loads((home / "workspace.json").read_text(encoding="utf-8")) == settings
        token = get_json("/api/session")["token"]
        request = urllib.request.Request(url + "/api/shutdown", method="POST", headers={"x-gda-token": token})
        with LOOPBACK.open(request, timeout=5) as response:
            assert response.status == 200
        assert child.wait(10) == 0
    finally:
        if child.poll() is None:
            child.terminate()
            child.wait(10)


@pytest.mark.parametrize("override, expected", [(None, 4567), ("5678", 5678)])
def test_development_passes_the_same_resolved_port_to_vite_and_the_backend(tmp_path, monkeypatch, override, expected):
    home, settings = configured_workspace(tmp_path, 4567)
    monkeypatch.setenv("GDA_SYNC_HOME", str(home))
    monkeypatch.delenv("PORT", raising=False)
    if override is not None:
        monkeypatch.setenv("PORT", override)
    monkeypatch.setattr(sys, "argv", ["scripts/dev.py", "--no-open"])
    monkeypatch.setattr(dev.shutil, "which", lambda name: f"/tools/{name}")
    monkeypatch.setattr(dev.subprocess, "run", lambda *args, **kwargs: None)
    monkeypatch.setattr(dev, "wait_for_dev_server", lambda _process: None)
    processes = []

    class Process:
        def __init__(self, command, **options):
            processes.append((command, options))

        def wait(self, _timeout=None):
            return 0

        def poll(self):
            return 0

    monkeypatch.setattr(dev.subprocess, "Popen", Process)
    assert dev.main() == 0
    assert len(processes) == 2
    for _command, options in processes:
        assert options["env"]["PORT"] == str(expected)
        assert options["env"]["GDA_SYNC_DEV"] == "1"
    assert json.loads((home / "workspace.json").read_text(encoding="utf-8")) == settings
