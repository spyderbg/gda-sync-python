"""Declaring an asset that no descriptor declares: a new entry in a descriptor of the game, with the values the game's
other entries suggest."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.app.server import create_app
from egt_gda_sync.assets.views import Resources, key_uses
from egt_gda_sync.sync.rss_declare import build_entry, suggested_id
from egt_gda_sync.sync.rss_edit import add_declaration
from egt_gda_sync.workspace.library import Library
from tests.conftest import session_headers
from tests.test_asset_report import write_game


def test_an_entry_is_added_after_the_last_member_laid_out_like_the_others():
    text = '{\r\n    "images": [\r\n        {\r\n            "id": "A",\r\n            "path": "a.dds"\r\n        }\r\n    ],\r\n    "x": 1\r\n}\r\n'
    result, line = add_declaration(text, "images", {"id": "B", "path": "b.dds", "source": {"x": 0, "y": 0, "w": 2, "h": 2}})
    assert result == ('{\r\n    "images": [\r\n        {\r\n            "id": "A",\r\n            "path": "a.dds"\r\n        },\r\n'
                      '        {\r\n            "id": "B",\r\n            "path": "b.dds",\r\n            "source": {\r\n'
                      '                "x": 0,\r\n                "y": 0,\r\n                "w": 2,\r\n                "h": 2\r\n'
                      '            }\r\n        }\r\n    ],\r\n    "x": 1\r\n}\r\n')
    assert line == 7


def test_an_entry_joins_a_list_on_one_line_and_fills_an_empty_list():
    assert add_declaration('{"rawFiles": [{"path": "a"}]}', "rawFiles", {"path": "b"}) == ('{"rawFiles": [{"path": "a"}, {"path": "b"}]}', 1)
    assert add_declaration('{\n  "rawFiles": []\n}\n', "rawFiles", {"path": "b"}) == ('{\n  "rawFiles": [\n    {\n      "path": "b"\n    }\n  ]\n}\n', 3)
    with pytest.raises(ValueError, match="the descriptor has no images list"):
        add_declaration('{"rawFiles": []}', "images", {"path": "b"})


def test_an_entry_has_the_fields_of_its_kind_in_the_descriptors_order():
    assert build_entry("ImageSequence", ["anim/a_{0-4}.dds"], {"loopTo": 2, "id": "ANIM_A", "frameTime": 42, "loopCount": 0, "resolution": "1920x1080"}) == {
        "id": "ANIM_A", "frameTime": 42, "loopCount": 0, "loopTo": 2, "frames": [{"path": "anim/a_{0-4}.dds"}], "resolution": "1920x1080"}
    assert build_entry("AudioEvent", ["s/a.ogg"], {"id": "SOUND_A", "loop": False, "polyphonyGroup": "music"}) == {
        "id": "SOUND_A", "polyphonyGroup": "music", "samples": ["s/a.ogg"]}
    with pytest.raises(ValueError, match="Font entries need chars, size"):
        build_entry("Font", ["f.ttf"], {"id": "FONT_F"})
    with pytest.raises(ValueError, match="RawFile entries have no id"):
        build_entry("RawFile", ["f.ttf"], {"id": "F"})
    with pytest.raises(ValueError, match="cannot loop to frame 5"):
        build_entry("ImageSequence", ["anim/a_{0-4}.dds"], {"id": "A", "frameTime": 42, "loopCount": 0, "loopTo": 5})


def test_a_suggested_id_follows_the_prefix_and_case_of_the_kinds_ids():
    assert suggested_id("Image", ["IMAGE_LOGO", "IMAGE_REEL", "BG"], "k_active-en") == "IMAGE_K_ACTIVE_EN"
    assert suggested_id("Image", ["IMAGE_LOGO", "IMAGE_K_ACTIVE"], "k active") == "IMAGE_K_ACTIVE_2"
    assert suggested_id("Rtf", [], "10_Burning_Crown") == "rtf_10_burning_crown"
    assert suggested_id("Element", ["InfoView"], "HatInfoView") == "HatInfoView"
    assert suggested_id("RawFile", [], "a") is None


@pytest.fixture
def client(tmp_path):
    game = write_game(tmp_path)
    (game / "song.wav").write_bytes(b"RIFF")
    gda = tmp_path / "gda"
    gda.mkdir()
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda), "extensions": [".dds", ".png", ".wav", ".json"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        client.game = game
        client.headers.update(session_headers(client))
        client.post("/api/asset-report")
        yield client


def asset(client, resource: str) -> dict:
    return next(row for row in client.get("/api/asset-report").json()["assets"] if row["resource"] == resource)


def test_the_options_of_an_image_suggest_an_id_and_the_values_of_the_games_images(client):
    row = asset(client, "unlisted.dds")
    options = client.get("/api/asset-report/declaration", params={"asset": row["id"]}).json()
    assert options["paths"] == ["unlisted.dds"]
    # The resolutions and languages of every kind of entry, for the dropdowns.
    assert options["choices"] == {"resolution": [["1920x1080", 1]], "language": [], "integration": []}
    assert [kind["kind"] for kind in options["kinds"]] == ["Image", "Font", "RawFile"]
    image = options["kinds"][0]
    assert image["descriptors"] == ["RssImagesData.json"] and image["entries"] == 4 and image["id"] == "UNLISTED"
    assert image["fields"] == ["id", "path", "resolution", "language", "integration", "source"]
    # One image in four has a resolution: it is suggested, not the default.
    assert image["values"]["resolution"] == {"default": None, "used": 1, "values": [["1920x1080", 1]]}
    # The game has no Font entries, nor a descriptor for them.
    assert options["kinds"][1]["descriptors"] == [] and options["kinds"][1]["id"] == "FONT_UNLISTED"


def test_declaring_an_image_adds_its_entry_backs_up_the_descriptor_and_updates_the_report(client):
    row = asset(client, "unlisted.dds")
    before = (client.game / "RssImagesData.json").read_text()
    result = client.post("/api/asset-report/declaration", json={
        "asset": row["id"], "kind": "Image", "descriptor": "RssImagesData.json", "id": " IMAGE_UNLISTED ", "resolution": "1920x1080",
        "source": {"x": 0, "y": 0, "w": 4, "h": 4}}).json()
    images = json.loads((client.game / "RssImagesData.json").read_text())["images"]
    assert images[-1] == {"id": "IMAGE_UNLISTED", "path": "unlisted.dds", "resolution": "1920x1080", "source": {"x": 0, "y": 0, "w": 4, "h": 4}}
    assert result["asset"] == row["id"] and result["descriptor"] == "RssImagesData.json"
    # The line of the entry's path, as the report gives each declaration.
    assert (client.game / "RssImagesData.json").read_text().splitlines()[result["line"] - 1].strip() == '"path": "unlisted.dds",'
    declared = asset(client, "unlisted.dds")
    assert declared["category"] == "available" and declared["requiredBy"][0]["id"] == "IMAGE_UNLISTED"
    assert result["library"]["activity"][0]["message"] == "Declared IMAGE_UNLISTED in RssImagesData.json, as Image"
    backup = next(Path(result["library"]["backupPath"]).rglob("RssImagesData.json"))
    assert backup.read_text() == before
    again = client.post("/api/asset-report/declaration", json={"asset": row["id"], "kind": "Image", "descriptor": "RssImagesData.json", "id": "X"})
    assert again.status_code == 409 and again.json()["error"] == "A descriptor declares this asset already"


def test_declaring_a_guessed_sequence_writes_its_frames_as_a_range_and_follows_the_new_asset(client):
    row = asset(client, "loop{00-04}.png")
    options = client.get("/api/asset-report/declaration", params={"asset": row["id"]}).json()
    assert options["paths"] == ["loop{00-04}.png"] and [kind["kind"] for kind in options["kinds"]] == ["ImageSequence"]
    sequence = options["kinds"][0]
    assert sequence["id"] == "LOOP" and sequence["values"]["frameTime"]["values"] == [[40, 1], [60, 1]]
    result = client.post("/api/asset-report/declaration", json={
        "asset": row["id"], "kind": "ImageSequence", "descriptor": "RssImagesSeqData.json", "id": "LOOP", "frameTime": 50, "loopCount": 0}).json()
    assert json.loads((client.game / "RssImagesSeqData.json").read_text())["imagesSeq"][-1] == {
        "id": "LOOP", "frameTime": 50, "loopCount": 0, "frames": [{"path": "loop{00-04}.png"}]}
    declared = next(item for item in client.get("/api/asset-report").json()["assets"] if item["id"] == result["asset"])
    assert declared["sequence"]["id"] == "LOOP" and declared["category"] == "available"


def test_declaring_an_inferred_animation_keeps_standalone_frame_images(client):
    descriptor = client.game / 'RssImagesData.json'
    images = json.loads(descriptor.read_text())
    images['images'].append({'id': 'LOOP_FIRST', 'path': 'loop00.png'})
    descriptor.write_text(json.dumps(images))
    assert client.post('/api/asset-report').status_code == 200
    row = asset(client, 'loop{00-04}.png')
    result = client.post('/api/asset-report/declaration', json={
        'asset': row['id'], 'kind': 'ImageSequence', 'descriptor': 'RssImagesSeqData.json',
        'id': 'LOOP', 'frameTime': 60, 'loopCount': 0, 'loopTo': 1})
    assert result.status_code == 200, result.text
    assert json.loads(descriptor.read_text()) == images
    declared = next(item for item in client.get('/api/asset-report').json()['assets'] if item['id'] == result.json()['asset'])
    assert len(declared['sequence']['frames']) == 5 and declared['sequence']['loopTo'] == 1
    assert asset(client, 'loop00.png')['requiredBy'][0]['id'] == 'LOOP_FIRST'


def test_declaring_an_inferred_animation_refuses_a_sequence_added_since_the_report(client):
    row = asset(client, 'loop{00-04}.png')
    descriptor = client.game / 'RssImagesSeqData.json'
    sequences = json.loads(descriptor.read_text())
    sequences['imagesSeq'].append({'id': 'ADDED_LATER', 'frameTime': 60, 'loopCount': 0,
                                 'frames': [{'path': 'loop{00-04}.png'}]})
    descriptor.write_text(json.dumps(sequences))
    response = client.post('/api/asset-report/declaration', json={
        'asset': row['id'], 'kind': 'ImageSequence', 'descriptor': descriptor.name,
        'id': 'LOOP', 'frameTime': 60, 'loopCount': 0})
    assert response.status_code == 409
    assert json.loads(descriptor.read_text()) == sequences


def test_removing_an_inferred_animation_keeps_its_declared_still_frame(client):
    descriptor = client.game / 'RssImagesData.json'
    images = json.loads(descriptor.read_text())
    images['images'].append({'id': 'LOOP_FIRST', 'path': 'loop00.png'})
    descriptor.write_text(json.dumps(images))
    client.post('/api/asset-report')
    row = asset(client, 'loop{00-04}.png')
    response = client.post('/api/asset-report/remove', json={'asset': row['id']})
    assert response.status_code == 200, response.text
    assert response.json()['kept'] == ['loop00.png'] and response.json()['files'] == 4
    assert (client.game / 'loop00.png').is_file()
    assert all(not (client.game / f'loop{index:02}.png').exists() for index in range(1, 5))
    assert json.loads(descriptor.read_text()) == images


def test_a_declaration_is_refused_for_another_kind_or_descriptor_or_a_missing_value(client):
    row = asset(client, "song.wav")
    post = lambda **body: client.post("/api/asset-report/declaration", json={"asset": row["id"], **body})
    assert post(kind="Rtf", descriptor="RssAudioData.json", id="A").json()["error"] == "Rtf entries cannot declare this asset"
    assert post(kind="AudioEvent", descriptor="RssImagesData.json", id="A").json()["error"] == \
        "RssImagesData.json is not a descriptor of the game that holds audioEvents"
    assert post(kind="AudioEvent", descriptor="RssAudioData.json").json()["error"] == "AudioEvent entries need id"
    assert post(kind="AudioEvent", descriptor="RssAudioData.json", id="A", size=3).json()["error"] == "AudioEvent entries have no size"
    assert post(kind="AudioEvent", descriptor="RssAudioData.json", id="SOUND_SONG", loop=True, fadeOut=0.8).status_code == 200
    assert json.loads((client.game / "RssAudioData.json").read_text())["audioEvents"][-1] == {
        "id": "SOUND_SONG", "samples": ["song.wav"], "loop": True, "fadeOut": 0.8}


def test_removing_a_declared_asset_removes_its_entries_and_file_into_one_backup_that_restores_them(client):
    row = asset(client, "logo.dds")
    result = client.post("/api/asset-report/remove", json={"asset": row["id"]}).json()
    assert result["name"] == "logo.dds" and result["entries"] == 2 and result["files"] == 1 and result["kept"] == []
    assert not (client.game / "logo.dds").exists()
    assert [item["id"] for item in json.loads((client.game / "RssImagesData.json").read_text())["images"]] == ["GONE", "SHARED"]
    assert not any(item["resource"] == "logo.dds" and item["category"] == "available" for item in client.get("/api/asset-report").json()["assets"])
    # Both entries are stored in the backup, with the descriptor and the file.
    operation = result["library"]["activity"][0]
    assert operation["message"] == "Removed logo.dds: its 2 entries and 1 file"
    backups = client.get("/api/backups").json()["backups"]
    detail = client.get(f"/api/backups/{backups[0]['id']}").json()
    assert sorted(item["path"] for item in detail["files"]) == ["example/RssImagesData.json", "example/logo.dds"]
    assert [item["entry"] for item in detail["declarations"]] == [{"id": "LOGO", "path": "logo.dds"}, {"id": "LOGO_HD", "path": "logo.dds", "resolution": "1920x1080"}]
    # Restoring puts the same entries back into the descriptor as it is now, which keeps what changed in it since.
    other = asset(client, "unlisted.dds")
    client.post("/api/asset-report/declaration", json={"asset": other["id"], "kind": "Image", "descriptor": "RssImagesData.json", "id": "IMAGE_UNLISTED"})
    restored = client.post("/api/backups/restore", json={"id": backups[0]["id"]}).json()
    assert sorted(restored["restored"]) == ["example/RssImagesData.json", "example/logo.dds"] and restored["failures"] == []
    images = json.loads((client.game / "RssImagesData.json").read_text())["images"]
    assert [item["id"] for item in images] == ["GONE", "SHARED", "IMAGE_UNLISTED", "LOGO", "LOGO_HD"]
    assert images[-1] == {"id": "LOGO_HD", "path": "logo.dds", "resolution": "1920x1080"}
    assert (client.game / "logo.dds").is_file()


def test_removing_an_undeclared_asset_deletes_only_its_files_into_a_backup_of_its_path(client):
    row = asset(client, "unlisted.dds")
    result = client.post("/api/asset-report/remove", json={"asset": row["id"]}).json()
    assert result["entries"] == 0 and result["files"] == 1 and not (client.game / "unlisted.dds").exists()
    detail = client.get(f"/api/backups/{client.get('/api/backups').json()['backups'][0]['id']}").json()
    assert detail["files"] == [{**detail["files"][0], "path": "example/unlisted.dds", "change": "deleted"}] and detail["declarations"] == []
    client.post("/api/backups/restore", json={"id": detail["id"]})
    assert (client.game / "unlisted.dds").read_bytes() == b"x"
    assert client.post("/api/asset-report/remove", json={"asset": "nothing"}).status_code == 404


def test_removing_a_shared_asset_removes_its_rsskey_and_keeps_the_file_that_other_games_share(client):
    shared = asset(client, "../common/shared.png")
    result = client.post("/api/asset-report/remove", json={"asset": shared["id"]}).json()
    assert (result["entries"], result["files"], result["shared"]) == (1, 0, ["../common/shared.png"])
    assert (client.game.parent / "common" / "shared.png").is_file()
    assert [item["id"] for item in json.loads((client.game / "RssImagesData.json").read_text())["images"]] == ["LOGO", "LOGO_HD", "GONE"]


def write_views(game: Path) -> None:
    (game / "v" / "1920x1080").mkdir(parents=True)
    (game / "v" / "1920x1080" / "Main.json").write_text(json.dumps({"name": "MainView", "elements": [
        {"id": "logo", "type": "Image", "rssKey": "LOGO"}, {"id": "play", "type": "Button", "rssKeys": ["PLAY", "LOGO_HD"]},
        {"id": "anim", "type": "Anim", "rssKey": "LOGO"}, {"id": "win", "type": "Text", "rssStyleId": "WIN"}]}))
    (game / "v" / "1920x1080" / "Other.json").write_text(json.dumps({"name": "OtherView", "elements": [{"id": "click", "type": "Image", "rssKey": "CLICK"}]}))


def test_the_views_that_use_an_assets_rsskeys_are_listed_and_its_removal_waits_for_a_confirmation(client):
    write_views(client.game)
    client.post("/api/asset-report")
    row, view = asset(client, "logo.dds"), asset(client, "v/1920x1080/Main.json")
    uses = client.get("/api/asset-report/uses", params={"asset": row["id"]}).json()["views"]
    # An Anim names a sequence or a movie, not an image, and CLICK is an audio event.
    assert uses == [{"asset": view["id"], "path": view["resourcePath"], "resource": "v/1920x1080/Main.json", "name": "MainView", "elements": [
        {"index": 0, "id": "logo", "type": "Image", "keys": ["LOGO"]}, {"index": 1, "id": "play", "type": "Button", "keys": ["LOGO_HD"]}]}]
    assert client.get("/api/asset-report/uses", params={"asset": asset(client, "click.wav")["id"]}).json()["views"] == []
    assert client.get("/api/asset-report/uses", params={"asset": asset(client, "unlisted.dds")["id"]}).json()["views"] == []
    refused = client.post("/api/asset-report/remove", json={"asset": row["id"]})
    assert refused.status_code == 409 and refused.json()["error"] == "1 view uses its RssKey; confirm to remove it anyway"
    assert (client.game / "logo.dds").is_file()
    result = client.post("/api/asset-report/remove", json={"asset": row["id"], "confirmUsed": True}).json()
    assert result["entries"] == 2 and not (client.game / "logo.dds").exists()


def test_a_text_element_uses_the_font_of_its_style(tmp_path):
    write_views(tmp_path)
    resources = Resources(tmp_path)
    resources.styles["WIN"].append({"id": "WIN", "font_id": "FONT_WIN", "size": 40})
    assert key_uses(tmp_path / "v" / "1920x1080" / "Main.json", {("Font", "FONT_WIN"), ("ImageSequence", "LOGO")}, resources) == [
        {"index": 2, "id": "anim", "type": "Anim", "keys": ["LOGO"]}, {"index": 3, "id": "win", "type": "Text", "keys": ["FONT_WIN"]}]


def test_a_json_file_of_the_idata_folder_is_declared_as_idata_with_the_games_data_types(client):
    (client.game / "idata" / "1920x1080").mkdir(parents=True)
    for name in ("DeclaredView.json", "AresInfoView.json"):
        (client.game / "idata" / "1920x1080" / name).write_text("{}")
    (client.game / "RssIData.json").write_text(json.dumps({"idatas": [
        {"id": "InfoViewConfig", "dataType": "Egt::Game::AlphaFamily::InfoViewConfig", "path": "idata/1920x1080/DeclaredView.json", "resolution": "1920x1080"}]}, indent=2))
    client.post("/api/asset-report")
    row = asset(client, "idata/1920x1080/AresInfoView.json")
    options = client.get("/api/asset-report/declaration", params={"asset": row["id"]}).json()
    assert options["paths"] == ["idata/1920x1080/AresInfoView.json"] and [kind["kind"] for kind in options["kinds"]] == ["IData", "RawFile"]
    idata = options["kinds"][0]
    assert idata["fields"] == ["id", "dataType", "path", "resolution", "integration"] and idata["required"] == ["dataType", "id"]
    assert idata["descriptors"] == ["RssIData.json"] and idata["id"] == "AresInfoView"
    assert idata["values"]["dataType"]["default"] is None and idata["values"]["dataType"]["values"] == [["Egt::Game::AlphaFamily::InfoViewConfig", 1]]
    assert idata["values"]["resolution"]["default"] == "1920x1080"
    missing = client.post("/api/asset-report/declaration", json={"asset": row["id"], "kind": "IData", "descriptor": "RssIData.json", "id": "InfoViewConfig"})
    assert missing.json()["error"] == "IData entries need dataType"
    result = client.post("/api/asset-report/declaration", json={
        "asset": row["id"], "kind": "IData", "descriptor": "RssIData.json", "id": "InfoViewConfig", "dataType": "Egt::Game::AlphaFamily::InfoViewConfig",
        "resolution": "1920x1080", "integration": "ares"}).json()
    assert json.loads((client.game / "RssIData.json").read_text())["idatas"][-1] == {
        "id": "InfoViewConfig", "dataType": "Egt::Game::AlphaFamily::InfoViewConfig", "path": "idata/1920x1080/AresInfoView.json",
        "resolution": "1920x1080", "integration": "ares"}
    declared = asset(client, "idata/1920x1080/AresInfoView.json")
    assert declared["category"] == "available" and declared["requiredBy"][0]["type"] == "IData" and result["asset"] == declared["id"]
