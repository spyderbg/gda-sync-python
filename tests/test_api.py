import os

from fastapi.testclient import TestClient

from egt_gda_sync import __version__
from egt_gda_sync.server import APP_CSP, create_app
from tests.conftest import session_headers
from tests.fixtures.bc7_dds import create_bc7_dds
from tests.fixtures.png_reader import read_png


def test_api_validates_payloads_rejects_foreign_requests_and_requires_a_session_token_for_writes(api, library):
    health = api.get("/api/health")
    assert health.status_code == 200
    assert health.json()["version"] == __version__
    assert api.get("/", follow_redirects=False).headers["cache-control"] == "no-store"
    assert api.get("/api/library", headers={"host": "attacker.example"}).status_code == 403
    assert api.get("/api/session", headers={"sec-fetch-site": "cross-site"}).status_code == 403
    assert api.post("/api/scan").status_code == 403
    assert api.post("/api/scan", headers={"x-gda-token": "wrong"}).json() == {"error": "Invalid session. Reload the application."}

    headers = session_headers(api)
    assert api.post("/api/sync", headers=headers, json={"ids": []}).status_code == 400
    assert api.post("/api/sync", headers=headers, json={"ids": ["a"], "extra": 1}).status_code == 400
    assert api.post("/api/open-folder", headers=headers, json={"folder": "elsewhere"}).status_code == 400
    assert api.post("/api/open-folder", headers=headers, json={"folder": "source"}).status_code == 200
    assert api.opened == [library.config["source"]]

    assert api.post("/api/scan", headers=headers).json()["activity"][0]["message"] == "Started a GDA sync"
    # The asset library shows the newest asset report; only a session can generate one.
    assert api.get("/api/asset-report").status_code == 404
    assert api.post("/api/asset-report").status_code == 403
    data = api.post("/api/asset-report", headers=headers).json()
    # The demo game has no descriptors: its 4 PNG and 2 DDS files are supplementary.
    assert data["assetReport"]["summary"]["assets"] == 6
    assert data["activity"][0]["message"] == "Generated an asset report of 6 assets"
    report = api.get("/api/asset-report").json()
    assert report["version"] == 3 and report["workspace"]["game_path"] == library.config["destination"]
    assert data["assetReport"]["reportPath"].endswith(".json")
    dds = next(row for row in report["assets"] if row["resource"].endswith(".dds") and row["preview"])
    preview = api.get("/api/rss-sync/preview", params={"file": dds["resourcePath"]})
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"
    assert preview.headers["content-security-policy"] == "default-src 'none'; sandbox"
    assert api.post("/api/sync", headers=headers, json={"ids": ["missing"]}).status_code == 400
    assert api.post("/api/open-folder", headers=headers, json={"folder": "destination"}).status_code == 200
    assert api.opened[-1] == library.config["destination"]


def test_a_missing_folder_is_reported_and_cannot_be_opened(api, library, tmp_path):
    headers = session_headers(api)
    assert api.get("/api/library").json()["missingFolders"] == []
    absent = tmp_path / "absent"
    settings = {"name": "Absent", "source": library.config["source"], "destination": str(absent)}
    assert api.put("/api/settings", headers=headers, json=settings).json()["missingFolders"] == ["destination"]
    assert api.get("/api/library").json()["missingFolders"] == ["destination"]
    refused = api.post("/api/open-folder", headers=headers, json={"folder": "destination"})
    assert refused.status_code == 404 and "Game folder does not exist" in refused.json()["error"]
    assert api.post("/api/open-folder", headers=headers, json={"folder": "source"}).status_code == 200
    assert api.opened == [library.config["source"]]


def test_unknown_endpoints_oversized_bodies_and_unavailable_shutdown(api):
    headers = session_headers(api)
    assert api.get("/api/unknown").json() == {"error": "Endpoint not found"}
    assert api.get("/api/sync").status_code == 404
    assert api.post("/api/unknown", headers=headers).status_code == 404
    oversized = {"ids": ["x" * 4000] * 40}
    assert api.post("/api/sync", headers=headers, json=oversized).status_code == 413
    assert api.post("/api/shutdown", headers=headers).status_code == 503
    assert api.get("/api/lifecycle").status_code == 503
    assert api.get("/api/session").json()["autoShutdownOnClose"] is False


def test_sync_endpoint_copies_selected_assets_and_records_activity(api, library):
    headers = session_headers(api)
    # The copy by relative path takes its assets from the dashboard's comparison of the GDA folder with the game.
    asset = next(asset for asset in library.dashboard()["assets"] if asset["status"] == "new")
    result = api.post("/api/sync", headers=headers, json={"ids": [asset["id"], asset["id"]]}).json()
    assert result["copied"] == [asset["path"]]
    assert result["bytes"] == asset["size"]
    assert result["library"]["activity"][0]["message"] == "Synced 1 asset to Game"
    assert next(item for item in library.dashboard()["assets"] if item["id"] == asset["id"])["status"] == "synced"


def test_settings_endpoint_reports_validation_errors(api, library):
    headers = session_headers(api)
    source = library.config["source"]
    response = api.put("/api/settings", headers=headers, json={"name": "Test", "source": source, "destination": source})
    assert response.status_code == 400
    assert "must be separate" in response.json()["error"]
    too_long = api.put("/api/settings", headers=headers, json={"name": "x" * 81, "source": source, "destination": "/"})
    assert too_long.status_code == 400


def test_scanner_reads_the_dx10_extension_and_the_api_serves_bc7_previews_without_modifying_the_dds(api, library):
    data = create_bc7_dds(136, 134)
    file = os.path.join(library.config["destination"], "textures", "forest", "k_active_en.dds")
    with open(file, "wb") as handle:
        handle.write(data)
    api.post("/api/asset-report", headers=session_headers(api))
    asset = next(row for row in api.get("/api/asset-report").json()["assets"] if row["resource"] == "textures/forest/k_active_en.dds")
    assert asset["preview"] is True
    assert asset["dimensions"]["format"] == "BC7_UNORM"
    preview = api.get("/api/rss-sync/preview", params={"file": asset["resourcePath"]})
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"
    width, height, pixels = read_png(preview.content)
    assert (width, height) == (136, 134)
    assert list(pixels[:4]) == [255, 0, 0, 255]
    with open(file, "rb") as handle:
        assert handle.read() == data


def test_production_mode_serves_the_embedded_frontend_with_a_strict_content_policy(library):
    frontend = {
        "/index.html": (b"<!doctype html><title>GDA Sync</title>", "text/html; charset=utf-8"),
        "/assets/app.js": (b"console.log(1)", "text/javascript; charset=utf-8"),
    }
    with TestClient(create_app(library, frontend=frontend), base_url="http://localhost:3456") as client:
        index = client.get("/")
        assert index.text.startswith("<!doctype html>")
        assert index.headers["content-security-policy"] == APP_CSP
        assert client.get("/assets/app.js?v=1").headers["content-type"] == "text/javascript; charset=utf-8"
        assert client.get("/settings").text == index.text
        assert client.get("/missing.js").json() == {"error": "File not found"}
    with TestClient(create_app(library, frontend={}), base_url="http://127.0.0.1") as client:
        assert client.get("/").status_code == 503
