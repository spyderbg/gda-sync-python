"""Serving the app on a loopback socket with uvicorn."""

import errno
import os
import socket

import uvicorn
from fastapi import FastAPI

# Windows reports ports held by another process as WSAEADDRINUSE or WSAEACCES.
_ADDRESS_IN_USE = {errno.EADDRINUSE, errno.EACCES, 10048, 10013}


def bind_local_socket(port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        if os.name == "nt":
            # SO_REUSEADDR on Windows would let us bind a port another program is listening on.
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
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
