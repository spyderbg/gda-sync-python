"""Development mode: the Vite dev server with hot reload, plus the backend in development mode.

The browser opens the configured Vite port, which proxies /api to the configured backend port.
Unlike the packaged application, closing the page does not stop the backend: in development
the backend keeps running so it does not take the Vite dev server down with it. End a session
with `python scripts/dev.py stop` (or Ctrl+C in its terminal).

The action is start, to run a session, or stop, to end a session started by an earlier run.
"""

import argparse
import ctypes
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from egt_gda_sync.__main__ import _port, workspace_config_path  # noqa: E402
from egt_gda_sync.desktop import application_data_home  # noqa: E402
from egt_gda_sync.library import Library  # noqa: E402
from egt_gda_sync.ports import vite_port  # noqa: E402
from egt_gda_sync.runtime import bind_local_socket, is_address_in_use  # noqa: E402

FRONTEND = ROOT / "frontend"
STATE_FILE = "dev.json"
STOP_TIMEOUT = 10.0
_WINDOWS_QUERY_INFORMATION = 0x1000
_WINDOWS_SYNCHRONIZE = 0x100000
_WINDOWS_STILL_RUNNING = 0x102


def wait_for_dev_server(vite: subprocess.Popen, port: int, timeout: float = 60) -> None:
    """Wait until our Vite process serves the EGT GDA Sync page; another program may hold the port."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + timeout
    while True:
        if vite.poll() is not None:
            raise SystemExit(f"The Vite dev server stopped. Is port {port} used by another program? Set vite_port in workspace.json or VITE_PORT to choose another port.")
        try:
            with opener.open(f"http://127.0.0.1:{port}", timeout=1) as response:
                if b"<title>EGT GDA Sync" in response.read():
                    # Another program can serve the same page on this port, so confirm that our Vite is the one.
                    time.sleep(0.3)
                    if vite.poll() is None:
                        return
        except OSError:
            pass
        if time.monotonic() > deadline:
            raise SystemExit("The Vite dev server did not start.")
        time.sleep(0.2)


def _state_path(data_home: str) -> str:
    return os.path.join(data_home, STATE_FILE)


def _write_state(data_home: str, state: dict) -> None:
    with open(_state_path(data_home), "w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2)


def _read_state(data_home: str) -> dict:
    try:
        with open(_state_path(data_home), encoding="utf-8") as handle:
            state = json.load(handle)
    except (OSError, ValueError):
        return {}
    return state if isinstance(state, dict) else {}


def _clear_state(data_home: str) -> None:
    Path(_state_path(data_home)).unlink(missing_ok=True)


def _windows_handle(pid: int, access: int) -> ctypes.c_void_p | None:
    """Open a process handle. os.kill(pid, 0) ends a process on Windows, so the kernel is asked instead."""
    kernel32 = ctypes.windll.kernel32
    kernel32.OpenProcess.restype = ctypes.c_void_p  # the default c_int would truncate a 64-bit handle
    handle = kernel32.OpenProcess(access, False, pid)
    return ctypes.c_void_p(handle) if handle else None


def _process_alive(pid: int) -> bool:
    """Report whether a process is still running."""
    if os.name == "nt":
        handle = _windows_handle(pid, _WINDOWS_SYNCHRONIZE)
        if not handle:
            return False
        try:
            return ctypes.windll.kernel32.WaitForSingleObject(handle, 0) == _WINDOWS_STILL_RUNNING
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _creation_stamp(pid: int) -> int | None:
    """Return when a process was created, or None when the platform cannot tell, to recognise a recycled process id."""
    if os.name == "nt":
        handle = _windows_handle(pid, _WINDOWS_QUERY_INFORMATION)
        if not handle:
            return None
        try:
            started = ctypes.c_ulonglong()
            times = ctypes.windll.kernel32.GetProcessTimes(handle, ctypes.byref(started), None, None, None)
            return started.value if times else None
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    try:
        # The command name may contain spaces and parentheses, while the fields after it are fixed.
        with open(f"/proc/{pid}/stat", encoding="utf-8") as handle:
            return int(handle.read().rsplit(") ", 1)[-1].split()[19])
    except (OSError, IndexError, ValueError):
        return None


def _is_recorded(entry: dict) -> bool:
    """Recognise a process this script started, so a recycled process id is never stopped."""
    pid = entry.get("pid")
    if not isinstance(pid, int) or pid < 1 or not _process_alive(pid):
        return False
    recorded = entry.get("created")
    return recorded is None or _creation_stamp(pid) in (None, recorded)


def _recorded(state: dict) -> list[dict]:
    processes = state.get("processes")
    entries = processes if isinstance(processes, list) else []
    return [entry for entry in entries if isinstance(entry, dict) and _is_recorded(entry)]


def _send(pid: int, number: int) -> None:
    """Ask a process to end. Windows has no signals, so there every signal ends the process."""
    try:
        os.kill(pid, number)
    except OSError:
        pass


def _record(name: str, pid: int) -> dict:
    return {"name": name, "pid": pid, "created": _creation_stamp(pid)}


def _wait_for_exit(entries: list[dict], timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline and any(_is_recorded(entry) for entry in entries):
        time.sleep(0.2)


def _port_in_use(port: object) -> bool:
    """Report whether a port is still taken, the same way the launcher finds an occupied port."""
    if not isinstance(port, int) or not 1 <= port <= 65535:
        return False
    try:
        bind_local_socket(port).close()
    except OSError as error:
        return is_address_in_use(error)
    return False


def _configured_port(data_home: str, key: str) -> int | None:
    """Resolve a port the way a start would, so a stop without a record still knows which port to check."""
    resolve = _port if key == "port" else vite_port
    config: dict = {}
    for path in (workspace_config_path(data_home), os.path.join(data_home, "workspace.json")):
        try:
            with open(path, encoding="utf-8-sig") as handle:
                loaded = json.load(handle)
        except (OSError, ValueError):
            continue
        if isinstance(loaded, dict):
            config = loaded
            break
    try:
        return resolve(config)
    except RuntimeError:
        return None


def _warn_about_ports(data_home: str, state: dict) -> None:
    """Warn about a port that stays in use after stopping, so the next start is not held up by it."""
    for label, key in (("backend", "port"), ("development UI", "vite_port")):
        port = state.get(key)
        if not isinstance(port, int):
            port = _configured_port(data_home, key)
        if not isinstance(port, int) or not _port_in_use(port):
            continue
        variable = "PORT" if label == "backend" else "vite_port in workspace.json or VITE_PORT"
        print(f"Warning: port {port} is still in use. Another program may have taken the {label} port. Set {variable} to choose another port.", flush=True)


def start(data_home: str, arguments: list[str]) -> int:
    """Run a session until it ends, recording the processes so a later run can stop them."""
    node, npm = shutil.which("node"), shutil.which("npm")
    if not node or not npm:
        raise SystemExit("Node.js 20.19+ and npm are required for development mode.")
    if _recorded(_read_state(data_home)):
        raise SystemExit("Development mode is already running. End it first with python scripts/dev.py stop.")
    library = Library(data_home, config_path=workspace_config_path(data_home))
    library.init()
    port = _port(library.config)
    ui_port = vite_port(library.config)
    if ui_port == port:
        raise SystemExit("vite_port and the backend port must be different. Set vite_port in workspace.json or VITE_PORT to choose another port.")
    if _port_in_use(port):
        raise SystemExit(f"Port {port} is in use by another application. Set port in workspace.json or PORT to choose another port.")
    if _port_in_use(ui_port):
        raise SystemExit(f"Port {ui_port} is in use by another application. Set vite_port in workspace.json or VITE_PORT to choose another port.")
    env = {**os.environ, "PORT": str(port), "VITE_PORT": str(ui_port), "EGT_GDA_SYNC_DEV": "1"}
    subprocess.run([npm, "ci"], cwd=FRONTEND, check=True)
    # Run Vite directly rather than through npm, so stopping it stops a single process on every platform.
    vite = subprocess.Popen([node, str(FRONTEND / "node_modules" / "vite" / "bin" / "vite.js")], cwd=FRONTEND, env=env)
    backend = None
    recorded = False
    try:
        wait_for_dev_server(vite, ui_port)
        backend = subprocess.Popen([sys.executable, "-m", "egt_gda_sync", *arguments], cwd=ROOT, env=env)
        # The dev script comes last, because ending it already ends the two processes below it.
        _write_state(data_home, {
            "port": port,
            "vite_port": ui_port,
            "processes": [_record("backend", backend.pid), _record("vite", vite.pid), _record("dev", os.getpid())],
        })
        recorded = True
        return backend.wait()
    except KeyboardInterrupt:
        return 0
    finally:
        for process in (backend, vite):
            if process and process.poll() is None:
                process.terminate()
        for process in (backend, vite):
            if process:
                try:
                    process.wait(10)
                except subprocess.TimeoutExpired:
                    process.kill()
        if recorded:
            _clear_state(data_home)


def stop(data_home: str) -> int:
    """End a session started by this script, leaving every other program alone."""
    state = _read_state(data_home)
    _clear_state(data_home)
    entries = _recorded(state)
    if entries:
        for entry in entries:
            _send(entry["pid"], signal.SIGTERM)
        _wait_for_exit(entries, STOP_TIMEOUT)
        for entry in entries:
            if _is_recorded(entry):
                _send(entry["pid"], signal.SIGKILL)
        _wait_for_exit(entries, STOP_TIMEOUT)
        url = f" at http://127.0.0.1:{state['vite_port']}" if state.get("vite_port") else ""
        print(f"Stopped EGT GDA Sync development mode{url}.", flush=True)
    else:
        print("EGT GDA Sync development mode is not running.", flush=True)
    _warn_about_ports(data_home, state)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0], epilog="Other options are passed to the backend, for example --no-open.")
    parser.add_argument("action", nargs="?", default="start", choices=["start", "stop"], help="start or stop development mode; start is the default")
    args, arguments = parser.parse_known_args(sys.argv[1:] if argv is None else argv)
    data_home = os.path.abspath(application_data_home())
    return stop(data_home) if args.action == "stop" else start(data_home, arguments)


if __name__ == "__main__":
    sys.exit(main())
