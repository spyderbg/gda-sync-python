"""Development mode: the Vite dev server with hot reload, plus the backend in development mode.

The browser opens the configured Vite port, which proxies /api to the configured backend port.
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

from egt_gda_sync.__main__ import _port, workspace_config_path  # noqa: E402
from egt_gda_sync.desktop import application_data_home  # noqa: E402
from egt_gda_sync.library import Library  # noqa: E402
from egt_gda_sync.ports import vite_port  # noqa: E402

FRONTEND = ROOT / "frontend"


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
    port = _port(library.config)
    ui_port = vite_port(library.config)
    if ui_port == port:
        raise SystemExit("vite_port and the backend port must be different. Set vite_port in workspace.json or VITE_PORT to choose another port.")
    env = {**os.environ, "PORT": str(port), "VITE_PORT": str(ui_port), "EGT_GDA_SYNC_DEV": "1"}
    subprocess.run([npm, "ci"], cwd=FRONTEND, check=True)
    # Run Vite directly rather than through npm, so stopping it stops a single process on every platform.
    vite = subprocess.Popen([node, str(FRONTEND / "node_modules" / "vite" / "bin" / "vite.js")], cwd=FRONTEND, env=env)
    backend = None
    try:
        wait_for_dev_server(vite, ui_port)
        backend = subprocess.Popen([sys.executable, "-m", "egt_gda_sync", *sys.argv[1:]], cwd=ROOT, env=env)
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
