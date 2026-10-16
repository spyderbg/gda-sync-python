"""The text files of the game, edited in the asset details: read with a revision, saved into a backup, and checked."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.app.server import TEXT_BODY_LIMIT, create_app
from egt_gda_sync.workspace.library import MAX_TEXT_BYTES, Library
from tests.conftest import session_headers
from tests.test_asset_report import write_game


@pytest.fixture
def client(tmp_path):
    game = write_game(tmp_path)
    (game / "notes.txt").write_bytes(b"\xef\xbb\xbfone\r\ntwo\r\n")
    (game / "data.bin.txt").write_bytes(b"\xff\xfe\x00")
    gda = tmp_path / "gda"
    gda.mkdir()
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda), "extensions": [".dds", ".png", ".wav", ".txt"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        client.game = game
        client.headers.update(session_headers(client))
        client.post("/api/asset-report")
        yield client


def read(client, name: str) -> dict:
    return client.get("/api/asset-report/text", params={"file": str(client.game / name)}).json()


def test_a_text_file_is_saved_with_its_byte_order_mark_and_its_previous_version_in_the_backups(client):
    opened = read(client, "notes.txt")
    assert opened["text"] == "one\r\ntwo\r\n"
    saved = client.post("/api/asset-report/text", json={"file": str(client.game / "notes.txt"), "text": "one\r\n2\r\n", "revision": opened["revision"]}).json()
    assert (client.game / "notes.txt").read_bytes() == b"\xef\xbb\xbfone\r\n2\r\n"
    assert saved["revision"] != opened["revision"] and saved["library"]["activity"][0]["message"] == "Edited notes.txt"
    assert next(Path(saved["library"]["backupPath"]).rglob("notes.txt")).read_bytes() == b"\xef\xbb\xbfone\r\ntwo\r\n"
    # The text was edited from a revision that is not the file's now.
    stale = client.post("/api/asset-report/text", json={"file": str(client.game / "notes.txt"), "text": "x", "revision": opened["revision"]})
    assert stale.status_code == 409


def test_a_json_file_must_stay_json_and_a_descriptor_a_descriptor(client):
    opened = read(client, "RssAudioData.json")
    post = lambda text: client.post("/api/asset-report/text", json={"file": str(client.game / "RssAudioData.json"), "text": text, "revision": opened["revision"]})
    assert post('{"audioEvents": [').status_code == 400
    refused = post('{"audioEvents": [{"id": 1}]}')
    assert refused.status_code == 400 and refused.json()["error"].startswith("Not saved")
    assert post('{"audioEvents": [{"id": "CLICK", "samples": ["click.wav"], "loop": true}]}').status_code == 200
    assert json.loads((client.game / "RssAudioData.json").read_text())["audioEvents"][0]["loop"] is True


def test_a_text_of_up_to_the_largest_size_is_saved_whatever_its_json_body_escapes(client):
    (client.game / "large.txt").write_text("x", encoding="utf-8")
    opened = read(client, "large.txt")
    post = lambda text: client.post("/api/asset-report/text", json={"file": str(client.game / "large.txt"), "text": text, "revision": opened["revision"]})
    # Two UTF-8 bytes each: past the largest text, though within the characters a text can have.
    refused = post("é" * (MAX_TEXT_BYTES // 2 + 1))
    assert refused.status_code == 413 and refused.json()["error"] == f"The text is larger than {MAX_TEXT_BYTES // 1024} KB"
    # Each control character takes six bytes of the JSON body, which is far larger than other request bodies.
    assert post("\x01" * MAX_TEXT_BYTES).status_code == 200
    assert (client.game / "large.txt").read_bytes() == b"\x01" * MAX_TEXT_BYTES
    oversized = client.post("/api/asset-report/text", content=b" " * (TEXT_BODY_LIMIT + 1), headers={"Content-Type": "application/json"})
    assert oversized.status_code == 413 and oversized.json() == {"error": "Request body is too large"}


def test_only_text_files_of_the_resources_that_are_utf_8_open(client):
    assert client.get("/api/asset-report/text", params={"file": str(client.game / "logo.dds")}).status_code == 415
    assert client.get("/api/asset-report/text", params={"file": str(client.game / "data.bin.txt")}).json()["error"] == "The file is not UTF-8 text"
    assert client.get("/api/asset-report/text", params={"file": "/etc/hostname"}).status_code == 404
    assert client.get("/api/asset-report/text", params={"file": str(client.game / "nothing.txt")}).status_code == 404
