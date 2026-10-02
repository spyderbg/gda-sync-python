"""Launcher: start the local backend and open GDA Sync in the default browser."""

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
from .runtime import AppServer, bind_local_socket, is_address_in_use
from .server import DEV_UI, create_app

DEFAULT_PORT = 3456
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def workspace_config_path(data_home: str) -> str:
    """Use project settings in a checkout, and per-user settings for installed apps or isolated runs."""
    if (
        not getattr(sys, "frozen", False)
        and not os.environ.get("GDA_SYNC_HOME")
        and (PROJECT_ROOT / "config" / "config.json.template").is_file()
    ):
        return str(PROJECT_ROOT / "config" / "workspace.json")
    return os.path.join(data_home, "workspace.json")


def _port() -> int:
    raw = os.environ.get("PORT") or str(DEFAULT_PORT)
    try:
        port = int(raw)
    except ValueError:
        port = 0
    if not 1 <= port <= 65535:
        raise RuntimeError("PORT must be between 1 and 65535")
    return port


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
    port = _port()
    dev = os.environ.get("GDA_SYNC_DEV") == "1"
    should_open = "--no-open" not in argv and os.environ.get("GDA_SYNC_NO_OPEN") != "1"
    url = DEV_UI if dev else f"http://127.0.0.1:{port}"
    library = Library(data_home, config_path=workspace_config_path(data_home))
    library.init()

    try:
        sock = bind_local_socket(port)
    except OSError as error:
        if not is_address_in_use(error):
            raise
        if (_running_instance(port) or {}).get("app") != APP_ID:
            raise RuntimeError(f"Port {port} is in use by another application. Set PORT to choose another port.") from None
        if should_open:
            open_on_desktop(url)
        print(f"GDA Sync is already running at {url}", flush=True)
        return 0

    server: AppServer | None = None

    def shutdown() -> None:
        if server:
            server.request_shutdown()

    app = create_app(library, dev=dev, on_shutdown=shutdown)
    server = AppServer(app)
    print(f"GDA Sync is ready at {url}\nWorkspace: {data_home}\nConfiguration: {library.config_path}", flush=True)
    if should_open:
        threading.Thread(target=_open_browser, args=(url,), daemon=True).start()
    # uvicorn re-raises the signal that stopped it after its graceful shutdown; by then nothing is left to do.
    for stop_signal in (signal.SIGINT, signal.SIGTERM):
        signal.signal(stop_signal, lambda *_: None)
    server.run(sockets=[sock])
    return 0


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
    try:
        return run(sys.argv[1:] if argv is None else argv)
    except KeyboardInterrupt:
        return 0
    except Exception as error:
        print(f"GDA Sync: {error_message(error)}", file=sys.stderr, flush=True)
        _pause_before_console_closes()
        return 1


if __name__ == "__main__":
    sys.exit(main())
