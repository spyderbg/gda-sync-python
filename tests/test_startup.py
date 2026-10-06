import errno
import json
import os
import signal
import socket
import subprocess
import sys
import threading
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
    source, destination = tmp_path / "gda", tmp_path / "game"
    source.mkdir()
    destination.mkdir()
    home = tmp_path / "app-data"
    home.mkdir()
    settings = {"name": "Port test", "source": str(source), "destination": str(destination), "port": port}
    if nested:
        settings = {"config": {"port": port}, "defaultWorkspace": "test",
                    "workspaces": [{"id": "test", "game_name": "Port test", "game_path": str(destination), "gda_path": str(source)}]}
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
            assert active["source"] == settings["workspaces"][0]["gda_path"]
            assert active["destination"] == settings["workspaces"][0]["game_path"]
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
    monkeypatch.setattr(dev, "_port_in_use", lambda _port: False)
    waited_ports = []
    monkeypatch.setattr(dev, "wait_for_dev_server", lambda _process, port: waited_ports.append(port))
    processes = []

    class Process:
        def __init__(self, command, **options):
            self.pid = len(processes) + 4321
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
    assert not (home / dev.STATE_FILE).exists()


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
        dev.main([])


def test_development_rejects_an_occupied_port_before_starting_any_process(tmp_path, monkeypatch):
    port = free_port()
    home, _settings = configured_workspace(tmp_path, port)
    monkeypatch.setenv("EGT_GDA_SYNC_HOME", str(home))
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.delenv("VITE_PORT", raising=False)
    monkeypatch.setattr(dev.shutil, "which", lambda name: f"/tools/{name}")

    def unexpected_process(*_args, **_kwargs):
        pytest.fail("An occupied port must be reported before starting a process")

    monkeypatch.setattr(dev.subprocess, "run", unexpected_process)
    monkeypatch.setattr(dev.subprocess, "Popen", unexpected_process)
    with socket.socket() as taken:
        taken.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        taken.bind(("127.0.0.1", port))
        taken.listen(1)
        with pytest.raises(SystemExit, match=f"Port {port} is in use by another application"):
            dev.main([])


def test_development_rejects_an_occupied_ui_port(tmp_path, monkeypatch):
    ui_port = free_port()
    home, settings = configured_workspace(tmp_path, 4567)
    settings["vite_port"] = ui_port
    (home / "workspace.json").write_text(json.dumps(settings), encoding="utf-8")
    monkeypatch.setenv("EGT_GDA_SYNC_HOME", str(home))
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.delenv("VITE_PORT", raising=False)
    monkeypatch.setattr(dev.shutil, "which", lambda name: f"/tools/{name}")
    monkeypatch.setattr(dev.subprocess, "run", lambda *args, **kwargs: pytest.fail("No process may start"))
    monkeypatch.setattr(dev.subprocess, "Popen", lambda *args, **kwargs: pytest.fail("No process may start"))
    with socket.socket() as taken:
        taken.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        taken.bind(("127.0.0.1", ui_port))
        taken.listen(1)
        with pytest.raises(SystemExit, match=f"Port {ui_port} is in use by another application"):
            dev.main([])


def sleeper() -> subprocess.Popen:
    return subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])


def test_development_records_the_processes_a_later_run_can_stop(tmp_path, monkeypatch):
    home, _settings = configured_workspace(tmp_path, 4567)
    monkeypatch.setenv("EGT_GDA_SYNC_HOME", str(home))
    monkeypatch.setattr(sys, "argv", ["scripts/dev.py", "--no-open"])
    monkeypatch.setattr(dev.shutil, "which", lambda name: f"/tools/{name}")
    monkeypatch.setattr(dev.subprocess, "run", lambda *args, **kwargs: None)
    monkeypatch.setattr(dev, "_port_in_use", lambda _port: False)
    monkeypatch.setattr(dev, "wait_for_dev_server", lambda _process, port: None)
    pids = iter((4321, 4322))
    written = []

    class Process:
        def __init__(self, *_command, **_options):
            self.pid = next(pids)

        def wait(self, _timeout=None):
            return 0

        def poll(self):
            return 0

    monkeypatch.setattr(dev.subprocess, "Popen", Process)
    monkeypatch.setattr(dev, "_write_state", lambda path, state: written.append((path, state)))
    assert dev.main() == 0
    assert written == [(os.path.abspath(home), {
        "port": 4567,
        "vite_port": 5173,
        # Vite is started first, the dev script last, because stopping it already stops the others.
        "processes": [
            {"name": "backend", "pid": 4322, "created": dev._creation_stamp(4322)},
            {"name": "vite", "pid": 4321, "created": dev._creation_stamp(4321)},
            {"name": "dev", "pid": os.getpid(), "created": dev._creation_stamp(os.getpid())},
        ],
    })]


def test_development_reports_a_running_session_instead_of_clashing_ports(tmp_path, monkeypatch):
    home, _settings = configured_workspace(tmp_path, 4567)
    monkeypatch.setenv("EGT_GDA_SYNC_HOME", str(home))
    monkeypatch.setattr(dev.shutil, "which", lambda name: f"/tools/{name}")
    monkeypatch.setattr(dev, "_process_alive", lambda pid: True)
    dev._write_state(home, {"processes": [{"name": "dev", "pid": 4321, "created": None}]})

    def unexpected_process(*_args, **_kwargs):
        pytest.fail("A running session must be reported before starting a process")

    monkeypatch.setattr(dev.subprocess, "run", unexpected_process)
    monkeypatch.setattr(dev.subprocess, "Popen", unexpected_process)
    with pytest.raises(SystemExit, match="already running"):
        dev.main([])


def test_stop_asks_every_recorded_process_to_end(tmp_path, monkeypatch, capsys):
    home = str(tmp_path)
    stamps = {4321: 111, 4322: 222, 4323: 333}
    dev._write_state(home, {
        "port": 4567,
        "vite_port": 5173,
        "processes": [{"name": name, "pid": pid, "created": stamps[pid]} for name, pid in
                      (("backend", 4321), ("vite", 4322), ("dev", 4323))],
    })
    alive, signals = set(stamps), []
    monkeypatch.setattr(dev, "_process_alive", lambda pid: pid in alive)
    monkeypatch.setattr(dev, "_creation_stamp", lambda pid: stamps[pid])
    monkeypatch.setattr(dev, "_send", lambda pid, number: (signals.append((pid, number)), alive.discard(pid)))
    monkeypatch.setattr(dev, "bind_local_socket", lambda port: socket.socket())
    assert dev.stop(home) == 0
    assert signals == [(4321, signal.SIGTERM), (4322, signal.SIGTERM), (4323, signal.SIGTERM)]
    assert capsys.readouterr().out == "Stopped EGT GDA Sync development mode at http://127.0.0.1:5173.\n"
    assert not (tmp_path / dev.STATE_FILE).exists()


def test_stop_warns_about_a_port_that_stays_in_use(tmp_path, monkeypatch, capsys):
    home = str(tmp_path)
    dev._write_state(home, {"port": 3456, "vite_port": 5173, "processes": []})

    def occupied(port):
        if port == 5173:
            raise OSError(errno.EADDRINUSE, "Address already in use")
        return socket.socket()

    monkeypatch.setattr(dev, "bind_local_socket", occupied)
    assert dev.stop(home) == 0
    output = capsys.readouterr().out
    assert "is not running" in output
    assert "Warning: port 5173 is still in use. Another program may have taken the development UI port." in output
    assert "3456" not in output


def test_stop_warns_about_a_configured_port_without_a_record(tmp_path, monkeypatch, capsys):
    port, ui_port = free_port(), free_port()
    home, settings = configured_workspace(tmp_path, port)
    settings["vite_port"] = ui_port
    (home / "workspace.json").write_text(json.dumps(settings), encoding="utf-8")
    monkeypatch.setenv("EGT_GDA_SYNC_HOME", str(home))
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.delenv("VITE_PORT", raising=False)
    with socket.socket() as taken:
        taken.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        taken.bind(("127.0.0.1", port))
        taken.listen(1)
        assert dev.stop(str(home)) == 0
    output = capsys.readouterr().out
    assert "is not running" in output
    assert f"Warning: port {port} is still in use. Another program may have taken the backend port. Set PORT to choose another port." in output
    assert str(ui_port) not in output


def test_stop_forces_a_process_that_does_not_end_on_request(tmp_path, monkeypatch):
    home = str(tmp_path)
    dev._write_state(home, {"processes": [{"name": "vite", "pid": 4321, "created": 111}]})
    signals = []
    monkeypatch.setattr(dev, "STOP_TIMEOUT", 0.0)
    monkeypatch.setattr(dev, "_process_alive", lambda pid: True)
    monkeypatch.setattr(dev, "_creation_stamp", lambda pid: 111)
    monkeypatch.setattr(dev, "_port_in_use", lambda _port: False)
    monkeypatch.setattr(dev, "_send", lambda pid, number: signals.append((pid, number)))
    assert dev.stop(home) == 0
    assert signals == [(4321, signal.SIGTERM), (4321, signal.SIGKILL)]


def test_stop_leaves_a_process_id_that_now_belongs_to_another_program(tmp_path, monkeypatch):
    home = str(tmp_path)
    dev._write_state(home, {"processes": [{"name": "vite", "pid": 4321, "created": 111}]})
    signals = []
    monkeypatch.setattr(dev, "_process_alive", lambda pid: True)
    monkeypatch.setattr(dev, "_creation_stamp", lambda pid: 222)
    monkeypatch.setattr(dev, "_port_in_use", lambda _port: False)
    monkeypatch.setattr(dev, "_send", lambda pid, number: signals.append((pid, number)))
    assert dev.stop(home) == 0
    assert signals == []
    assert not (tmp_path / dev.STATE_FILE).exists()


def test_stop_without_a_recorded_session_changes_nothing(tmp_path, monkeypatch, capsys):
    def unexpected(pid, number):
        pytest.fail("A process without a record must not be stopped")

    monkeypatch.setattr(dev, "_send", unexpected)
    monkeypatch.setattr(dev, "_port_in_use", lambda _port: False)
    assert dev.stop(str(tmp_path)) == 0
    assert "is not running" in capsys.readouterr().out


def test_stop_ignores_an_unreadable_record(tmp_path, monkeypatch, capsys):
    (tmp_path / dev.STATE_FILE).write_text("{ not json", encoding="utf-8")
    monkeypatch.setattr(dev, "_send", lambda pid, number: pytest.fail("An unreadable record holds no process"))
    monkeypatch.setattr(dev, "_port_in_use", lambda _port: False)
    assert dev.stop(str(tmp_path)) == 0
    assert "is not running" in capsys.readouterr().out
    assert not (tmp_path / dev.STATE_FILE).exists()


def test_stop_ends_real_processes(tmp_path, monkeypatch):
    home, children = str(tmp_path), [sleeper(), sleeper()]
    dev._write_state(home, {
        "port": 4567,
        "vite_port": 5173,
        "processes": [{"name": name, "pid": child.pid, "created": dev._creation_stamp(child.pid)}
                      for name, child in (("backend", children[0]), ("vite", children[1]))],
    })
    monkeypatch.setattr(dev, "_port_in_use", lambda _port: False)
    # The children end while this process is still their parent, so they are reaped as they go.
    reaper = threading.Thread(target=lambda: [child.wait() for child in children], daemon=True)
    reaper.start()
    try:
        assert dev.stop(home) == 0
        assert all(child.poll() is not None for child in children)
        assert not (tmp_path / dev.STATE_FILE).exists()
    finally:
        reaper.join(10)
        for child in children:
            if child.poll() is None:
                child.kill()
                child.wait(10)


def test_the_default_action_starts_and_the_remaining_options_reach_the_backend(monkeypatch):
    calls = []
    monkeypatch.setattr(dev, "start", lambda _home, arguments: calls.append(("start", arguments)) or 0)
    monkeypatch.setattr(dev, "stop", lambda _home: calls.append(("stop", [])) or 0)
    for arguments in ([], ["--no-open"], ["stop"]):
        monkeypatch.setattr(sys, "argv", ["scripts/dev.py", *arguments])
        assert dev.main() == 0
    assert calls == [("start", []), ("start", ["--no-open"]), ("stop", [])]


@pytest.mark.parametrize("action", ["stpo", "restart"])
def test_an_unknown_action_is_rejected(action, capsys):
    with pytest.raises(SystemExit):
        dev.main([action])
    assert "invalid choice" in capsys.readouterr().err


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
