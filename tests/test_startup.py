import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync import __main__ as launcher
from egt_gda_sync.ports import vite_port
from egt_gda_sync.server import create_app
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
    ({"config": {"port": 4567}}, None, 4567),
    ({"config": {"port": 4567}}, "5678", 5678),
    ({"port": 0, "config": {"port": 4567}}, None, 4567),
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


@pytest.mark.parametrize("config, override, expected", [
    ({}, None, 5173),
    ({"vite_port": 5174}, None, 5174),
    ({"vite_port": "5174"}, None, 5174),
    ({"vite_port": 5174}, "5175", 5175),
    ({"vite_port": 5174}, "", 5174),
    ({"vite_port": 0}, "5175", 5175),
    ({"vite_port": 1}, None, 1),
    ({"vite_port": 65535}, None, 65535),
    ({"config": {"vite_port": 5174}}, None, 5174),
    ({"config": {"vite_port": 5174}}, "5175", 5175),
    ({"vite_port": 0, "config": {"vite_port": 5174}}, None, 5174),
])
def test_vite_port_precedence_and_defaults(config, override, expected, monkeypatch):
    monkeypatch.delenv("VITE_PORT", raising=False)
    if override is not None:
        monkeypatch.setenv("VITE_PORT", override)
    assert vite_port(config) == expected


@pytest.mark.parametrize("value", [0, -1, 65536, True, 5174.5, None, "invalid"])
def test_invalid_configured_vite_ports_fail_with_a_configuration_error(value, monkeypatch):
    monkeypatch.delenv("VITE_PORT", raising=False)
    with pytest.raises(RuntimeError, match="vite_port in workspace.json must be an integer between 1 and 65535"):
        vite_port({"vite_port": value})


@pytest.mark.parametrize("override", ["0", "65536", "invalid"])
def test_invalid_vite_port_override_does_not_fall_back_to_a_valid_configuration(override, monkeypatch):
    monkeypatch.setenv("VITE_PORT", override)
    with pytest.raises(RuntimeError, match="VITE_PORT must be an integer between 1 and 65535"):
        vite_port({"vite_port": 5174})


def configured_workspace(tmp_path, port, nested=False):
    source, destination = tmp_path / "source", tmp_path / "gda"
    source.mkdir()
    destination.mkdir()
    home = tmp_path / "app-data"
    home.mkdir()
    settings = {"name": "Port test", "source": str(source), "destination": str(destination), "port": port}
    if nested:
        settings = {"config": {"port": port}, "defaultWorkspace": "test",
                    "workspaces": [{"id": "test", "game_name": "Port test", "game_path": str(source), "gda_path": str(destination)}]}
    (home / "workspace.json").write_text(json.dumps(settings), encoding="utf-8")
    return home, settings


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@pytest.mark.parametrize("use_override", [False, True])
@pytest.mark.parametrize("nested", [False, True])
def test_launcher_listens_on_the_resolved_port_and_keeps_the_configured_value(tmp_path, use_override, nested):
    configured_port = free_port()
    active_port = configured_port
    if use_override:
        while active_port == configured_port:
            active_port = free_port()
    home, settings = configured_workspace(tmp_path, configured_port, nested=nested)
    env = {**os.environ, "EGT_GDA_SYNC_HOME": str(home)}
    env.pop("EGT_GDA_SYNC_DEV", None)
    env.pop("PORT", None)
    if use_override:
        env["PORT"] = str(active_port)
    log_path = tmp_path / "backend.log"
    with log_path.open("wb") as output:
        child = subprocess.Popen(
            [sys.executable, "-m", "egt_gda_sync", "--no-open"], cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT,
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
        active = get_json("/api/library")["config"]
        if nested:
            assert active["config"] == settings["config"]
            assert active["source"] == settings["workspaces"][0]["game_path"]
            assert active["destination"] == settings["workspaces"][0]["gda_path"]
        else:
            assert active == {**settings, "demo": False}
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
@pytest.mark.parametrize("configured_ui_port, ui_override, expected_ui_port", [(None, None, 5173), (5174, None, 5174), (5174, "5175", 5175)])
@pytest.mark.parametrize("nested", [False, True])
def test_development_passes_the_resolved_ports_to_vite_and_the_backend(tmp_path, monkeypatch, override, expected, configured_ui_port, ui_override, expected_ui_port, nested):
    home, settings = configured_workspace(tmp_path, 4567, nested=nested)
    if configured_ui_port is not None:
        ports = settings["config"] if nested else settings
        ports["vite_port"] = configured_ui_port
        (home / "workspace.json").write_text(json.dumps(settings), encoding="utf-8")
    monkeypatch.setenv("EGT_GDA_SYNC_HOME", str(home))
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.delenv("VITE_PORT", raising=False)
    if override is not None:
        monkeypatch.setenv("PORT", override)
    if ui_override is not None:
        monkeypatch.setenv("VITE_PORT", ui_override)
    monkeypatch.setattr(sys, "argv", ["scripts/dev.py", "--no-open"])
    monkeypatch.setattr(dev.shutil, "which", lambda name: f"/tools/{name}")
    monkeypatch.setattr(dev.subprocess, "run", lambda *args, **kwargs: None)
    waited_ports = []
    monkeypatch.setattr(dev, "wait_for_dev_server", lambda _process, port: waited_ports.append(port))
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
        assert options["env"]["VITE_PORT"] == str(expected_ui_port)
        assert options["env"]["EGT_GDA_SYNC_DEV"] == "1"
    assert waited_ports == [expected_ui_port]
    assert json.loads((home / "workspace.json").read_text(encoding="utf-8")) == settings


def test_development_rejects_matching_ports_before_starting_any_process(tmp_path, monkeypatch):
    home, _settings = configured_workspace(tmp_path, 4567)
    monkeypatch.setenv("EGT_GDA_SYNC_HOME", str(home))
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.setenv("VITE_PORT", "4567")
    monkeypatch.setattr(dev.shutil, "which", lambda name: f"/tools/{name}")

    def unexpected_process(*_args, **_kwargs):
        pytest.fail("Port collisions must be rejected before starting a process")

    monkeypatch.setattr(dev.subprocess, "run", unexpected_process)
    monkeypatch.setattr(dev.subprocess, "Popen", unexpected_process)
    with pytest.raises(SystemExit, match="vite_port and the backend port must be different"):
        dev.main()


@pytest.mark.parametrize("override, expected", [(None, 5174), ("5175", 5175)])
def test_backend_development_redirect_uses_the_resolved_vite_port(library, monkeypatch, override, expected):
    library.config["vite_port"] = 5174
    monkeypatch.delenv("VITE_PORT", raising=False)
    if override is not None:
        monkeypatch.setenv("VITE_PORT", override)
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        response = client.get("/", follow_redirects=False)
    assert response.headers["location"] == f"http://127.0.0.1:{expected}"


def test_dev_server_failure_mentions_the_selected_port():
    class StoppedProcess:
        def poll(self):
            return 1

    with pytest.raises(SystemExit, match="Is port 5174 used by another program"):
        dev.wait_for_dev_server(StoppedProcess(), 5174)
