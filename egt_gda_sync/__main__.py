"""Launcher: start the local backend and open EGT GDA Sync in the default browser."""

import json
import os
import signal
import sys
import threading
import urllib.request
from pathlib import Path

from . import APP_ID
from .desktop import application_data_home, open_on_desktop
from .errors import error_message
from .library import Library
from .ports import backend_port as _port, dev_ui_url
from .report import main as report_main, parse_args as parse_report_args
from .runtime import AppServer, bind_local_socket, is_address_in_use
from .server import create_app

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def workspace_config_path(data_home: str) -> str:
    """Use project settings in a checkout, and settings beside the executable for packaged apps."""
    if getattr(sys, "frozen", False):
        return str(Path(sys.executable).resolve().parent / "workspace.json")
    if not os.environ.get("EGT_GDA_SYNC_HOME") and (PROJECT_ROOT / "config" / "workspace.json.template").is_file():
        return str(PROJECT_ROOT / "config" / "workspace.json")
    return os.path.join(data_home, "workspace.json")


def _running_instance(port: int) -> dict | None:
    # Talk to loopback directly, even when an HTTP proxy is configured.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(f"http://127.0.0.1:{port}/api/health", timeout=2) as response:
            return json.load(response)
    except (OSError, ValueError):
        return None


def _open_browser(url: str) -> None:
    try:
        open_on_desktop(url)
    except Exception as error:
        print(f"{error_message(error)}\nOpen {url} in your browser.", flush=True)


def run(argv: list[str]) -> int:
    data_home = os.path.abspath(application_data_home())
    dev = os.environ.get("EGT_GDA_SYNC_DEV") == "1"
    # The packaged application opens the browser itself. Development mode only starts
    # Vite and the backend; the developer opens the development UI (the Vite port) manually.
    should_open = not dev and "--no-open" not in argv and os.environ.get("EGT_GDA_SYNC_NO_OPEN") != "1"
    library = Library(data_home, config_path=workspace_config_path(data_home))
    library.init()
    port = _port(library.config)
    url = dev_ui_url(library.config) if dev else f"http://127.0.0.1:{port}"

    try:
        sock = bind_local_socket(port)
    except OSError as error:
        if not is_address_in_use(error):
            raise
        if (_running_instance(port) or {}).get("app") != APP_ID:
            raise RuntimeError(f"Port {port} is in use by another application. Set PORT to choose another port.") from None
        if should_open:
            open_on_desktop(url)
        print(f"EGT GDA Sync is already running at {url}", flush=True)
        return 0

    server: AppServer | None = None

    def shutdown() -> None:
        if server:
            server.request_shutdown()

    # Automatic shutdown on page close is a production-only behaviour. In development mode
    # (scripts/dev.py) the backend keeps running after the last tab closes so it does not
    # take the Vite dev server down with it; it is stopped with Ctrl+C or `dev.py stop`.
    app = create_app(library, dev=dev, on_shutdown=None if dev else shutdown)
    server = AppServer(app)
    print(f"EGT GDA Sync is ready at {url}\nWorkspace: {data_home}\nConfiguration: {library.config_path}", flush=True)
    if should_open:
        threading.Thread(target=_open_browser, args=(url,), daemon=True).start()
    # uvicorn re-raises the signal that stopped it after its graceful shutdown; by then nothing is left to do.
    for stop_signal in (signal.SIGINT, signal.SIGTERM):
        signal.signal(stop_signal, lambda *_: None)
    server.run(sockets=[sock])
    return 0


def report(argv: list[str]) -> int:
    """Run the GDA sync of workspaces from the command line, without the server or the browser."""
    args = parse_report_args(argv)
    data_home = os.path.abspath(application_data_home())
    library = Library(data_home, config_path=workspace_config_path(data_home))
    try:
        library.init()
    except Exception as error:
        print(f"EGT GDA Sync: {error_message(error)}", file=sys.stderr, flush=True)
        return 2
    print(f"Configuration: {library.config_path}", flush=True)
    return report_main(args, library)


def _pause_before_console_closes() -> None:
    # A double-clicked Windows executable closes its console on exit; keep the error readable.
    if getattr(sys, "frozen", False) and sys.platform == "win32" and sys.stdin and sys.stdin.isatty():
        try:
            input("Press Enter to close this window...")
        except (EOFError, KeyboardInterrupt):
            pass


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if stream and hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    args = sys.argv[1:] if argv is None else argv
    try:
        if args[:1] == ["report"]:
            return report(args[1:])
        return run(args)
    except KeyboardInterrupt:
        return 0
    except Exception as error:
        print(f"EGT GDA Sync: {error_message(error)}", file=sys.stderr, flush=True)
        _pause_before_console_closes()
        return 1


if __name__ == "__main__":
    sys.exit(main())
