import pytest
from fastapi.testclient import TestClient

from gda_sync.library import Library
from gda_sync.server import create_app


@pytest.fixture
def library(tmp_path) -> Library:
    library = Library(str(tmp_path / "app"))
    library.init()
    return library


@pytest.fixture
def api(library):
    """An API client for a development-mode app, with folder opening recorded instead of performed."""
    opened: list[str] = []
    app = create_app(library, dev=True, opener=opened.append)
    with TestClient(app, base_url="http://127.0.0.1") as client:
        client.opened = opened
        yield client


def session_headers(client: TestClient) -> dict[str, str]:
    return {"x-gda-token": client.get("/api/session").json()["token"]}
