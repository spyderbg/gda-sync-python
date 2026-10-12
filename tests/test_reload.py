import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

from egt_gda_sync import __main__ as launcher, __version__
from egt_gda_sync.app import runtime
from tests.test_startup import LOOPBACK, configured_workspace, free_port


@pytest.mark.parametrize("dev, frozen, reloads", [(True, False, True), (False, False, False), (True, True, False)])
def test_reloader_is_only_used_for_checkout_development(tmp_path, monkeypatch, dev, frozen, reloads):
    home, _ = configured_workspace(tmp_path, 4567)
    monkeypatch.setenv("EGT_GDA_SYNC_HOME", str(home))
    monkeypatch.setenv("EGT_GDA_SYNC_DEV", "1" if dev else "0")
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.setattr(sys, "frozen", frozen, raising=False)
    monkeypatch.setattr(launcher, "workspace_config_path", lambda _: str(home / "workspace.json"))
    sock = object()
    monkeypatch.setattr(launcher, "bind_local_socket", lambda _: sock)
    calls = []
    monkeypatch.setattr(runtime, "run_reloading_server", lambda *args: calls.append("reload"))
    monkeypatch.setattr(launcher.AppServer, "run", lambda *args, **kwargs: calls.append("serve"))
    monkeypatch.setattr(launcher.signal, "signal", lambda *args: None)
    assert launcher.run(["--no-open"]) == 0
    assert calls == ["reload" if reloads else "serve"]


def test_development_reloads_changed_python_and_releases_the_port_on_stop(tmp_path):
    # Change an isolated copy so this test never edits the developer's working tree.
    project = tmp_path / "checkout"
    package = project / "egt_gda_sync"
    shutil.copytree(Path(launcher.__file__).parent, package, ignore=shutil.ignore_patterns("__pycache__", "static"))
    port = free_port()
    home, _ = configured_workspace(tmp_path, port)
    env = {**os.environ, "EGT_GDA_SYNC_HOME": str(home), "EGT_GDA_SYNC_DEV": "1", "PORT": str(port)}
    env.pop("PYTHONPATH", None)
    log_path = tmp_path / "reload.log"
    with log_path.open("wb") as output:
        process = subprocess.Popen([sys.executable, "-m", "egt_gda_sync"], cwd=project, env=env,
                                   stdout=output, stderr=subprocess.STDOUT)
    url = f"http://127.0.0.1:{port}"

    def wait_for_version(version):
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            try:
                with LOOPBACK.open(url + "/api/health", timeout=1) as response:
                    if json.load(response)["version"] == version:
                        return
            except OSError:
                pass
            assert process.poll() is None, log_path.read_text(errors="replace")
            time.sleep(0.1)
        pytest.fail(log_path.read_text(errors="replace"))

    try:
        wait_for_version(__version__)
        with LOOPBACK.open(url + "/api/session", timeout=2) as response:
            assert json.load(response)["autoShutdownOnClose"] is False
        # Let the polling watcher establish its initial file timestamps.
        time.sleep(1)
        version_file = package / "__init__.py"
        version_file.write_text(version_file.read_text() + '\n__version__ = "reload-test"\n')
        wait_for_version("reload-test")
        assert process.poll() is None
        process.terminate()
        assert process.wait(15) == 0
        with socket.socket() as probe:
            assert probe.connect_ex(("127.0.0.1", port)) != 0
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(5)
