"""Keep the backend alive while a browser page holds an event-stream connection to it."""

import asyncio
from collections.abc import Callable

from starlette.responses import Response
from starlette.types import Receive, Scope, Send

PAGE_CLOSE_GRACE_SECONDS = 2.0
KEEPALIVE_SECONDS = 15.0


class PageLifetime:
    """Counts open app pages and calls on_last_page_close once the last one has been gone for the grace period.

    Shutdown is only scheduled after a page disconnects, so the backend waits for its first page.
    All methods run on the server's event loop.
    """

    def __init__(self, on_last_page_close: Callable[[], None], grace_seconds: float = PAGE_CLOSE_GRACE_SECONDS,
                 keepalive_seconds: float = KEEPALIVE_SECONDS):
        self._on_last_page_close = on_last_page_close
        self._grace_seconds = grace_seconds
        self._keepalive_seconds = keepalive_seconds
        self._streams: set[_PageStream] = set()
        self._timer: asyncio.TimerHandle | None = None
        self.disposed = False

    @property
    def count(self) -> int:
        return len(self._streams)

    def stream(self) -> Response:
        return _PageStream(self)

    def _connect(self, stream: "_PageStream") -> None:
        if self._timer:
            self._timer.cancel()
            self._timer = None
        self._streams.add(stream)

    def _disconnect(self, stream: "_PageStream") -> None:
        self._streams.discard(stream)
        if not self.disposed and not self._streams:
            if self._timer:
                self._timer.cancel()
            self._timer = asyncio.get_running_loop().call_later(self._grace_seconds, self._expire)

    def _expire(self) -> None:
        self._timer = None
        if not self.disposed and not self._streams:
            self._on_last_page_close()

    def dispose(self) -> None:
        """Stop scheduling shutdowns and finish open streams so the server can drain its connections."""
        self.disposed = True
        if self._timer:
            self._timer.cancel()
            self._timer = None
        for stream in list(self._streams):
            stream.finish()
        self._streams.clear()


class _PageStream(Response):
    media_type = "text/event-stream"

    def __init__(self, lifetime: PageLifetime):
        # Like StreamingResponse: no body attribute, so no Content-Length header.
        self.status_code = 200
        self.background = None
        self.init_headers({"Cache-Control": "no-store", "Connection": "keep-alive", "X-Accel-Buffering": "no"})
        self._lifetime = lifetime
        self._finished = asyncio.Event()

    def finish(self) -> None:
        self._finished.set()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": self.raw_headers})
        if self._lifetime.disposed:
            await send({"type": "http.response.body", "body": b""})
            return
        await send({"type": "http.response.body", "body": b"event: connected\ndata: {}\n\n", "more_body": True})
        self._lifetime._connect(self)
        disconnected = asyncio.ensure_future(_wait_for_disconnect(receive))
        finished = asyncio.ensure_future(self._finished.wait())
        try:
            while True:
                # Browser timers are throttled in background tabs; keepalive is server-side.
                await asyncio.wait({disconnected, finished}, timeout=self._lifetime._keepalive_seconds,
                                   return_when=asyncio.FIRST_COMPLETED)
                if disconnected.done():
                    return
                if finished.done():
                    await send({"type": "http.response.body", "body": b""})
                    return
                await send({"type": "http.response.body", "body": b": keepalive\n\n", "more_body": True})
        finally:
            disconnected.cancel()
            finished.cancel()
            self._lifetime._disconnect(self)


async def _wait_for_disconnect(receive: Receive) -> None:
    while (await receive())["type"] != "http.disconnect":
        pass
