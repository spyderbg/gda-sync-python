"""Serving the app on a loopback socket with uvicorn."""

import errno
import os
import signal
import socket
from pathlib import Path

import uvicorn
from fastapi import FastAPI

# Windows reports ports held by another process as WSAEADDRINUSE or WSAEACCES.
_ADDRESS_IN_USE = {errno.EADDRINUSE, errno.EACCES, 10048, 10013}


def bind_local_socket(port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        if os.name == "nt":
            # SO_REUSEADDR on Windows would let us bind a port another program is listening on.
            # Windows only. Other platforms have no SO_EXCLUSIVEADDRUSE.
            sock.setsockopt(socket.SOL_SOCKET, getattr(socket, "SO_EXCLUSIVEADDRUSE"), 1)
        else:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("127.0.0.1", port))
        sock.listen(128)
    except BaseException:
        sock.close()
        raise
    return sock


def is_address_in_use(error: OSError) -> bool:
    return error.errno in _ADDRESS_IN_USE or getattr(error, "winerror", None) in _ADDRESS_IN_USE


class AppServer(uvicorn.Server):
    """A uvicorn server that ends page event streams before graceful shutdown waits for open connections."""

    def __init__(self, app: FastAPI):
        super().__init__(uvicorn.Config(
            app, loop="asyncio", http="h11", ws="none", lifespan="on", log_level="warning", access_log=False,
        ))
        self.lifetime = app.state.lifetime

    def request_shutdown(self) -> None:
        self.should_exit = True

    async def shutdown(self, sockets: list[socket.socket] | None = None) -> None:
        self.lifetime.dispose()
        await super().shutdown(sockets=sockets)


def create_development_app() -> FastAPI:
    """Construct fresh workspace and application state in each reload worker."""
    from egt_gda_sync.__main__ import workspace_config_path
    from egt_gda_sync.app.desktop import application_data_home
    from egt_gda_sync.app.server import create_app
    from egt_gda_sync.workspace.library import Library

    data_home = os.path.abspath(application_data_home())
    library = Library(data_home, config_path=workspace_config_path(data_home))
    library.init()
    return create_app(library, dev=True)


def _run_development_worker(sockets: list[socket.socket]) -> None:
    # Keep the same graceful cleanup as production, including open page event streams.
    server = AppServer(create_development_app())
    for stop_signal in (signal.SIGINT, signal.SIGTERM):
        signal.signal(stop_signal, lambda *_: None)
    server.run(sockets=sockets)


def run_reloading_server(sock: socket.socket, source_dir: Path) -> None:
    """Watch backend Python files while keeping the launcher's bound port across restarts."""
    # Imported only by checkout development mode; packaged applications use AppServer directly.
    from uvicorn.supervisors import ChangeReload

    config = uvicorn.Config(
        "egt_gda_sync.app.runtime:create_development_app", factory=True,
        reload=True, reload_dirs=[str(source_dir)], log_level="info",
    )
    sock.set_inheritable(True)
    try:
        ChangeReload(config, target=_run_development_worker, sockets=[sock]).run()
    finally:
        sock.close()
