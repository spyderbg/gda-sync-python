"""The asset report: an inventory of the game's assets, with the descriptor entries that load them."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.asset_report import inventory
from egt_gda_sync.library import Library, asset_facts
from egt_gda_sync.rss_sync import Config
from egt_gda_sync.server import create_app
from tests.conftest import session_headers
from tests.fixtures.bc7_dds import create_bc7_dds


def write_game(root: Path) -> Path:
    """A game with an image, an audio event, a raw file outside the resources folder, an image sequence with a missing
    frame, an atlas, a missing image, a file that nothing declares and five numbered images that nothing declares."""
    game = root / "resources" / "example"
    (game / "anim").mkdir(parents=True)
    (root / "resources" / "common").mkdir()
    (game / "logo.dds").write_bytes(create_bc7_dds(8, 4))
    (game / "click.wav").write_bytes(b"RIFF")
    (game / "atlas.png").write_bytes(b"png")
    (root / "resources" / "common" / "shared.png").write_bytes(b"shared")
    for number in range(2):
        (game / "anim" / f"a_{number}.dds").write_bytes(create_bc7_dds(4, 4))
    (game / "unlisted.dds").write_bytes(b"x")
    for number in range(5):
        (game / f"loop{number:02d}.png").write_bytes(b"loop")
    (game / "RssImagesData.json").write_text(json.dumps({"images": [
        {"id": "LOGO", "path": "logo.dds"}, {"id": "LOGO_HD", "path": "logo.dds", "resolution": "1920x1080"},
        {"id": "GONE", "path": "gone.dds"}, {"id": "SHARED", "path": "../common/shared.png"},
    ]}, indent=2))
    (game / "RssAudioData.json").write_text(json.dumps({"audioEvents": [{"id": "CLICK", "samples": ["click.wav"]}]}, indent=2))
    (game / "RssRawData.json").write_text(json.dumps({"rawFiles": [{"path": "../../outside.ttf"}]}, indent=2))
    (game / "RssImagesSeqData.json").write_text(json.dumps({"imagesSeq": [
        {"id": "ANIM", "frameTime": 40, "loopCount": 0, "frames": [{"path": "anim/a_{0-2}.dds"}]},
        {"id": "ATLAS", "frameTime": 60, "loopCount": 1, "frames": [
            {"path": "atlas.png", "source": {"x": 0, "y": 0, "w": 2, "h": 2}}, {"path": "atlas.png", "source": {"x": 2, "y": 0, "w": 2, "h": 2}}]},
    ]}, indent=2))
    return game


def config_for(game: Path, **settings) -> Config:
    return Config(resources_dir=game.parent.resolve(), gda_dir=game.parent, extensions=frozenset({".dds", ".png", ".wav"}), game=game.name, **settings)


def test_lists_each_asset_with_the_descriptor_entries_that_load_it(tmp_path):
    game = write_game(tmp_path)
    result = inventory(config_for(game), asset_facts)
    rows = {row["sequence"]["id"] if row.get("sequence", {}).get("id") else row["resource"]: row for row in result["assets"]}
    assert [(name, row["category"], row["status"]) for name, row in rows.items()] == [
        ("../../outside.ttf", "invalid", "invalid: outside resources_dir"),
        ("../common/shared.png", "available", "available"),
        ("ANIM", "missing", "missing: source file does not exist (1 of 3 files)"),
        ("ATLAS", "available", "available"),
        ("click.wav", "available", "available"),
        ("gone.dds", "missing", "missing: source file does not exist"),
        ("logo.dds", "available", "available"),
        ("loop{00-04}.png", "supplementary", "supplementary"),
        ("unlisted.dds", "supplementary", "supplementary"),
    ]
    # Each declaration with its descriptor, line, entry type and id.
    assert rows["logo.dds"]["requiredBy"] == [
        {"descriptor": "RssImagesData.json", "line": 5, "type": "Image", "id": "LOGO"},
        {"descriptor": "RssImagesData.json", "line": 9, "type": "Image", "id": "LOGO_HD"},
    ]
    assert rows["click.wav"]["requiredBy"] == [{"descriptor": "RssAudioData.json", "line": 6, "type": "AudioEvent", "id": "CLICK"}]
    assert rows["../../outside.ttf"]["requiredBy"] == [{"descriptor": "RssRawData.json", "line": 4, "type": "RawFile"}]
    assert rows["unlisted.dds"]["requiredBy"] == []
    # The facts of the files: type, size, time and image dimensions; a missing or invalid file has only its type.
    logo = rows["logo.dds"]
    assert (logo["type"], logo["size"], logo["dimensions"]["format"], logo["preview"]) == ("texture", len(create_bc7_dds(8, 4)), "BC7_UNORM", True)
    assert logo["modifiedAt"].endswith("Z") and logo["scope"] == "game"
    assert rows["gone.dds"].keys() >= {"type"} and "size" not in rows["gone.dds"]
    assert (rows["../common/shared.png"]["scope"], rows["../../outside.ttf"]["scope"]) == ("common", "outside")
    # An image sequence is one asset, its frames as the GDA sync lists them; a frame of a {N-M} range per file.
    anim = rows["ANIM"]
    assert [(frame["resource"], frame["category"]) for frame in anim["sequence"]["frames"]] == [
        ("anim/a_0.dds", "available"), ("anim/a_1.dds", "available"), ("anim/a_2.dds", "missing")]
    assert anim["requiredBy"] == [{"descriptor": "RssImagesSeqData.json", "line": 9, "type": "ImageSequence", "id": "ANIM"}]
    assert anim["size"] == 2 * len(create_bc7_dds(4, 4)) and anim["dimensions"]["width"] == 4
    assert [frame["source"] for frame in rows["ATLAS"]["sequence"]["frames"]] == [{"x": 0, "y": 0, "w": 2, "h": 2}, {"x": 2, "y": 0, "w": 2, "h": 2}]
    # The frame files are not assets of their own, and numbered images that nothing declares are a guessed sequence.
    assert "anim/a_0.dds" not in rows and "atlas.png" not in rows
    loop = rows["loop{00-04}.png"]["sequence"]
    assert (loop["id"], loop["guessed"], len(loop["frames"])) == (None, True, 5)
    files = sum(path.stat().st_size for path in [game / "logo.dds", game / "click.wav", game / "atlas.png", game / "unlisted.dds",
                                                  tmp_path / "resources" / "common" / "shared.png",
                                                  *(game / "anim").iterdir(), *game.glob("loop*.png")])
    assert result["summary"] == {"assets": 9, "available": 4, "missing": 2, "invalid": 1, "supplementary": 2, "size": files,
                                 "types": {"audio": 1, "other": 1, "texture": 7}}
    assert [descriptor["name"] for descriptor in result["descriptors"]] == [
        "RssAudioData.json", "RssImagesData.json", "RssImagesSeqData.json", "RssRawData.json"]


def test_a_game_without_descriptors_has_only_supplementary_assets(tmp_path):
    game = tmp_path / "resources" / "example"
    game.mkdir(parents=True)
    (game / "art.png").write_bytes(b"png")
    (game / "notes.txt").write_text("not a compared extension")
    result = inventory(config_for(game, resource_paths=("declared.png",)), asset_facts)
    assert result["descriptors"] == []
    # resource_paths declares files too, without a descriptor entry.
    assert [(row["resource"], row["category"], row["requiredBy"]) for row in result["assets"]] == [
        ("art.png", "supplementary", []), ("declared.png", "missing", [])]


@pytest.fixture
def client(tmp_path):
    game = write_game(tmp_path)
    gda = tmp_path / "gda"
    gda.mkdir()
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda), "extensions": [".dds", ".png", ".wav"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        client.game = game
        client.home = tmp_path / "app"
        yield client


def test_generating_a_report_saves_it_and_the_library_shows_the_newest(client):
    headers = session_headers(client)
    assert client.get("/api/library").json()["assetReport"] == {"reportPath": None, "summary": None}
    assert client.get("/api/asset-report").json()["error"] == "This workspace has no asset report yet. Click Generate report to create one."
    first = client.post("/api/asset-report", headers=headers).json()
    status = first["assetReport"]
    assert status["summary"]["state"] == "succeeded" and status["summary"]["assets"] == 9
    assert Path(status["reportPath"]).parent == client.home / "asset-reports"
    assert Path(status["reportPath"]).name.startswith("example-")
    report = client.get("/api/asset-report").json()
    # Like a GDA sync report: the settings it used, the parsed descriptors, the summary with the run, then the rows.
    assert list(report) == ["version", "workspace", "descriptors", "summary", "assets"]
    assert report["workspace"]["game_path"] == str(client.game) and report["summary"] == status["summary"]
    assert first["activity"][0]["action"] == "report" and first["activity"][0]["message"] == "Generated an asset report of 9 assets"

    (client.game / "gone.dds").write_bytes(b"back")
    second = client.post("/api/asset-report", headers=headers).json()["assetReport"]
    assert second["reportPath"] != status["reportPath"] and second["summary"]["missing"] == 1
    assert len(list((client.home / "asset-reports").iterdir())) == 2
    assert client.get("/api/library").json()["assetReport"] == second
    assert client.get("/api/asset-report").json()["summary"]["missing"] == 1


def test_a_report_that_cannot_be_generated_is_an_error_and_keeps_the_newest_report(client):
    headers = session_headers(client)
    client.post("/api/asset-report", headers=headers)
    (client.game / "RssImagesData.json").write_text("{not json")
    refused = client.post("/api/asset-report", headers=headers)
    assert refused.status_code == 400 and refused.json()["error"].startswith("The asset report could not be generated:")
    assert len(list((client.home / "asset-reports").iterdir())) == 1
    assert client.get("/api/asset-report").json()["summary"]["assets"] == 9
