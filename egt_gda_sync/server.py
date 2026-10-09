"""The local HTTP API and the embedded frontend."""

import asyncio
import hmac
import os
import secrets
import sys
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

import anyio.to_thread
from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from . import APP_ID, __version__
from .desktop import open_in_code, open_on_desktop, platform_label
from .errors import AppError
from .fonts import FONT_EXTENSIONS, facts_header
from .library import Library
from .lifetime import PAGE_CLOSE_GRACE_SECONDS, PageLifetime
from .ports import dev_ui_url

STATIC_DIR = Path(__file__).with_name("static")
BODY_LIMIT = 128 * 1024
LOCAL_HOSTS = {"127.0.0.1", "localhost", "[::1]"}
APP_CSP = (
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'self'"
)
PREVIEW_CSP = "default-src 'none'; sandbox"
INVALID_SESSION = "Invalid session. Reload the application."
SERVER_ERROR = "The operation could not be completed. Check folder permissions and try again."
SECURITY_HEADERS = (
    (b"cache-control", b"no-store"),
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"same-origin"),
    (b"cross-origin-resource-policy", b"same-origin"),
)
MIME_TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
    ".json": "application/json",
}

Text4K = Annotated[str, StringConstraints(max_length=4096)]


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SyncBody(_Body):
    ids: Annotated[list[Text4K], Field(min_length=1, max_length=10_000)]
    # The GDA image to copy over each image, by row id: one of the image's candidates in the report.
    gdaFiles: Annotated[dict[Text4K, Text4K], Field(max_length=10_000)] = {}


class ResourceAction(_Body):
    id: Text4K
    category: Literal["different", "invalid", "supplementary"]
    gdaFile: Text4K | None = None


class ResourceActionsBody(_Body):
    resources: Annotated[list[ResourceAction], Field(min_length=1, max_length=10_000)]


class SettingsBody(_Body):
    name: Annotated[str, StringConstraints(max_length=80)]
    source: Text4K
    destination: Text4K


class WorkspaceBody(_Body):
    id: Text4K


class OpenFolderBody(_Body):
    folder: Literal["source", "destination"]


class ResourceFileBody(_Body):
    file: Text4K


class ViewPosition(_Body):
    index: Annotated[int, Field(ge=0, le=100000)]
    x: Annotated[float, Field(allow_inf_nan=False, ge=-1e6, le=1e6)]
    y: Annotated[float, Field(allow_inf_nan=False, ge=-1e6, le=1e6)]


class ViewPositionsBody(_Body):
    file: Text4K
    # The view's revision in the layout its elements were moved in.
    revision: Annotated[str, Field(min_length=1, max_length=64)]
    positions: Annotated[list[ViewPosition], Field(min_length=1, max_length=10000)]


class ResourceFolderBody(_Body):
    file: Text4K
    # The folder that file names, rather than the one it is in.
    isFolder: bool = False


class OpenDeclarationBody(_Body):
    descriptor: Text4K
    line: Annotated[int, Field(strict=True, ge=1, le=2_147_483_647)]


class OpenViewElementBody(ResourceFileBody):
    index: Annotated[int, Field(strict=True, ge=0, le=2_147_483_647)]


class ResourceFilesBody(_Body):
    files: Annotated[list[Text4K], Field(min_length=1, max_length=1000)]
    # The character lists of the Font entries that declare a font, to check each font file against.
    chars: Annotated[list[Text4K], Field(max_length=20)] = []


def _hostname(host: str) -> str:
    if host.startswith("["):
        return host[:host.find("]") + 1].lower()
    return host.rsplit(":", 1)[0].lower()


class LocalGuard:
    """Accepts only local, same-site requests and authenticated writes, and adds security headers."""

    def __init__(self, app: ASGIApp, token: str):
        self.app = app
        self.token = token.encode()

    def _rejection(self, scope: Scope) -> tuple[int, str] | None:
        headers = Headers(scope=scope)
        if _hostname(headers.get("host", "")) not in LOCAL_HOSTS:
            return 403, "Invalid local host"
        if scope["path"].startswith("/api/"):
            if headers.get("sec-fetch-site") == "cross-site":
                return 403, "Cross-site requests are not allowed"
            token = headers.get("x-gda-token", "").encode()
            if scope["method"] not in ("GET", "HEAD") and not hmac.compare_digest(token, self.token):
                return 403, INVALID_SESSION
        length = headers.get("content-length", "")
        if length.isdigit() and int(length) > BODY_LIMIT:
            return 413, "Request body is too large"
        return None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_secured(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {name.lower() for name, _ in headers}
                headers += [(name, value) for name, value in SECURITY_HEADERS if name not in present]
                message = {**message, "headers": headers}
            await send(message)

        rejection = self._rejection(scope)
        if rejection:
            status, text = rejection
            await JSONResponse({"error": text}, status)(scope, receive, send_secured)
        else:
            await self.app(scope, receive, send_secured)


def load_frontend(directory: Path = STATIC_DIR) -> dict[str, tuple[bytes, str]]:
    """Read the built frontend into memory, keyed by URL path."""
    if not directory.is_dir():
        return {}
    return {
        "/" + file.relative_to(directory).as_posix(): (file.read_bytes(), MIME_TYPES.get(file.suffix, "application/octet-stream"))
        for file in directory.rglob("*") if file.is_file()
    }


def create_app(
    library: Library,
    *,
    dev: bool = False,
    opener: Callable[[str], None] = open_on_desktop,
    code_opener: Callable[[str, int], None] = open_in_code,
    on_shutdown: Callable[[], None] | None = None,
    page_close_grace: float = PAGE_CLOSE_GRACE_SECONDS,
    frontend: dict[str, tuple[bytes, str]] | None = None,
) -> FastAPI:
    ui_url = dev_ui_url(library.config) if dev else None
    token = secrets.token_hex(32)
    files = load_frontend() if frontend is None else frontend
    platform = platform_label()
    lifetime = PageLifetime(lambda: on_shutdown and on_shutdown(), page_close_grace)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        lifetime.dispose()
        # An HTTP request can disconnect while its file operation is still running.
        await anyio.to_thread.run_sync(library.wait_for_idle)
        await anyio.to_thread.run_sync(library.close)

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.lifetime = lifetime
    app.add_middleware(LocalGuard, token=token)

    @app.exception_handler(AppError)
    async def app_error(_request: Request, error: AppError) -> JSONResponse:
        return JSONResponse({"error": error.message}, error.status_code)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, error: RequestValidationError) -> JSONResponse:
        first = error.errors()[0] if error.errors() else {"loc": (), "msg": "Invalid request"}
        location = "/".join(str(part) for part in first["loc"])
        return JSONResponse({"error": f"{location}: {first['msg']}" if location else first["msg"]}, 400)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        if request.url.path.startswith("/api/") and error.status_code in (404, 405):
            return JSONResponse({"error": "Endpoint not found"}, 404)
        return JSONResponse({"error": str(error.detail)}, error.status_code, headers=error.headers)

    @app.exception_handler(OSError)
    async def filesystem_error(_request: Request, error: OSError) -> JSONResponse:
        print(f"EGT GDA Sync: {error}", file=sys.stderr, flush=True)
        return JSONResponse({"error": SERVER_ERROR}, 500)

    @app.exception_handler(Exception)
    async def unexpected_error(_request: Request, _error: Exception) -> JSONResponse:
        return JSONResponse({"error": SERVER_ERROR}, 500)

    @app.get("/api/session")
    async def session() -> JSONResponse:
        cookie = f"gda-session={token}; HttpOnly; SameSite=Strict; Path=/api/lifecycle"
        body = {"token": token, "version": __version__, "autoShutdownOnClose": on_shutdown is not None, "platform": platform}
        return JSONResponse(body, headers={"Set-Cookie": cookie})

    @app.get("/api/lifecycle")
    async def lifecycle(request: Request) -> Response:
        if on_shutdown is None:
            raise AppError("Automatic shutdown is unavailable in this session", 503)
        expected = f"gda-session={token}".encode()
        cookies = request.headers.get("cookie", "").split(";")
        if not any(hmac.compare_digest(cookie.strip().encode(), expected) for cookie in cookies):
            raise AppError("Invalid lifecycle session", 403)
        return lifetime.stream()

    @app.post("/api/shutdown")
    async def shutdown() -> dict:
        if on_shutdown is None:
            raise AppError("Shutdown is unavailable in this session", 503)
        asyncio.get_running_loop().call_later(0.15, on_shutdown)
        return {"stopping": True}

    @app.get("/api/health")
    async def health() -> dict:
        return {"app": APP_ID, "ready": True, "version": __version__, "openPages": lifetime.count}

    # File operations block, so these handlers run in the worker thread pool.
    @app.get("/api/library")
    def library_view() -> dict:
        return library.scan()

    @app.get("/api/dashboard")
    def dashboard_view() -> dict:
        return library.dashboard()

    @app.post("/api/scan")
    def rescan() -> dict:
        return library.rescan()

    @app.get("/api/rss-sync")
    def rss_sync_status() -> dict:
        return library.rss_status()

    @app.get("/api/rss-sync/history")
    def rss_sync_history() -> dict:
        return library.rss_history()

    @app.get("/api/rss-sync/report")
    def rss_sync_report() -> Response:
        return Response(library.rss_report(), media_type="application/json")

    @app.post("/api/sync")
    def sync(body: SyncBody) -> dict:
        return library.sync(body.ids)

    @app.get("/api/rss-sync/preview")
    def rss_sync_preview(file: Annotated[str, Query(max_length=4096)], width: Annotated[int | None, Query(ge=16, le=8192)] = None,
                         hidden: bool = False, crop: bool = False, segment: Annotated[int | None, Query(ge=0, le=100000)] = None,
                         cuts: Annotated[str | None, Query(max_length=8192, pattern=r"^(\d{1,6}(,\d{1,6})*)?$")] = None) -> Response:
        # A view is composed as an image as wide as width, with its hidden elements, cropped to what it draws, or only the
        # segment of its elements between two that the page draws itself (cuts, by index; by default the Anims that play),
        # on request.
        if width is not None or hidden or crop or segment is not None:
            split = tuple(int(index) for index in cuts.split(",") if index) if cuts is not None else None
            return Response(library.view_preview(file, width, hidden, crop, segment, split), media_type="image/png",
                            headers={"Content-Security-Policy": PREVIEW_CSP})
        data, mime = library.resource_preview(file)
        headers = {"Content-Security-Policy": PREVIEW_CSP}
        # A font comes with its names and the samples it can draw, for the page that draws text with it.
        if mime in FONT_EXTENSIONS.values() and (facts := facts_header(data)):
            headers["X-Font-Facts"] = facts
        return Response(data, media_type=mime, headers=headers)

    @app.get("/api/rss-sync/view")
    def rss_sync_view(file: Annotated[str, Query(max_length=4096)]) -> dict:
        return library.view_details(file)

    @app.post("/api/rss-sync/copy")
    def rss_sync_copy(body: SyncBody) -> dict:
        return library.sync_resources(body.ids, body.gdaFiles)

    @app.post("/api/rss-sync/apply")
    def rss_sync_apply(body: ResourceActionsBody) -> dict:
        return library.apply_resources({resource.id: resource.category for resource in body.resources},
                                       {resource.id: resource.gdaFile for resource in body.resources if resource.gdaFile})

    @app.post("/api/rss-sync/details")
    def rss_sync_details(body: ResourceFilesBody) -> dict:
        return library.resource_details(body.files, body.chars)

    @app.post("/api/rss-sync/open-folder")
    def open_resource_folder(body: ResourceFolderBody) -> dict:
        opener(library.resource_folder(body.file, body.isFolder))
        return {"opened": True}

    @app.post("/api/rss-sync/open-declaration")
    def open_declaration(body: OpenDeclarationBody) -> dict:
        code_opener(library.descriptor_path(body.descriptor), body.line)
        return {"opened": True}

    @app.post("/api/rss-sync/view-positions")
    def save_view_positions(body: ViewPositionsBody) -> dict:
        return library.save_view_positions(body.file, body.revision, {item.index: (item.x, item.y) for item in body.positions})

    @app.post("/api/rss-sync/open-view-element")
    def open_view_element(body: OpenViewElementBody) -> dict:
        code_opener(*library.view_element_location(body.file, body.index))
        return {"opened": True}

    @app.put("/api/settings")
    def settings(body: SettingsBody) -> dict:
        return library.update_config(body.name, body.source, body.destination)

    @app.put("/api/workspace")
    def select_workspace(body: WorkspaceBody) -> dict:
        return library.select_workspace(body.id)

    @app.post("/api/open-folder")
    def open_folder(body: OpenFolderBody) -> dict:
        library.require_folders(body.folder)
        opener(library.config["source"] if body.folder == "source" else library.config["destination"])
        return {"opened": True}

    @app.get("/api/asset-report")
    def asset_report() -> Response:
        return Response(library.asset_report(), media_type="application/json")

    @app.post("/api/asset-report")
    def generate_asset_report() -> dict:
        return library.generate_asset_report()

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend_file(path: str) -> Response:
        if path.startswith("api/"):
            return JSONResponse({"error": "Endpoint not found"}, 404)
        if dev:
            if not path:
                return RedirectResponse(ui_url)
            return HTMLResponse(f'<p>Development UI: <a href="{ui_url}">Open EGT GDA Sync</a></p>')
        file = files.get("/" + path) if path else None
        if file is None and not os.path.splitext(path)[1]:
            file = files.get("/index.html")
        if file is None:
            if not path:
                raise AppError("Frontend is not built. Run python scripts/build.py.", 503)
            return JSONResponse({"error": "File not found"}, 404)
        content, mime = file
        return Response(content, media_type=mime, headers={"Content-Security-Policy": APP_CSP})

    return app
