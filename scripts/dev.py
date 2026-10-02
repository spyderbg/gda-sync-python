"""Development mode: the Vite dev server with hot reload, plus the backend in development mode.

The browser opens http://127.0.0.1:5173, which proxies /api to the configured backend port.
Closing the page stops the backend, which then stops the dev server.
"""

import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from gda_sync.__main__ import _port, workspace_config_path  # noqa: E402
from gda_sync.desktop import application_data_home  # noqa: E402
from gda_sync.library import Library  # noqa: E402

FRONTEND = ROOT / "frontend"
DEV_UI = "http://127.0.0.1:5173"


def wait_for_dev_server(vite: subprocess.Popen, timeout: float = 60) -> None:
    """Wait until our Vite process serves the GDA Sync page; another program may hold the port."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + timeout
    while True:
        if vite.poll() is not None:
            raise SystemExit("The Vite dev server stopped. Is port 5173 used by another program?")
        try:
            with opener.open(DEV_UI, timeout=1) as response:
                if b"<title>GDA Sync" in response.read():
                    return
        except OSError:
            pass
        if time.monotonic() > deadline:
            raise SystemExit("The Vite dev server did not start.")
        time.sleep(0.2)


def main() -> int:
    node, npm = shutil.which("node"), shutil.which("npm")
    if not node or not npm:
        raise SystemExit("Node.js 20.19+ and npm are required for development mode.")
    data_home = os.path.abspath(application_data_home())
    library = Library(data_home, config_path=workspace_config_path(data_home))
    library.init()
    env = {**os.environ, "PORT": str(_port(library.config)), "GDA_SYNC_DEV": "1"}
    subprocess.run([npm, "ci"], cwd=FRONTEND, check=True)
    # Run Vite directly rather than through npm, so stopping it stops a single process on every platform.
    vite = subprocess.Popen([node, str(FRONTEND / "node_modules" / "vite" / "bin" / "vite.js")], cwd=FRONTEND, env=env)
    backend = None
    try:
        wait_for_dev_server(vite)
        backend = subprocess.Popen([sys.executable, "-m", "gda_sync", *sys.argv[1:]], cwd=ROOT, env=env)
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


if __name__ == "__main__":
    sys.exit(main())
