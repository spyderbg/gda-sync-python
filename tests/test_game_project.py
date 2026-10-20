"""The browser game's files: the game project (modules config and descriptors), its JSON data and its exports."""

import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.app.server import create_app
from egt_gda_sync.workspace.library import Library
from tests.conftest import session_headers
from tests.test_asset_report import write_game


@pytest.fixture
def client(tmp_path):
    game = write_game(tmp_path)
    (game / "math").mkdir()
    (game / "math" / "rules.json").write_text(json.dumps({"rowsCount": 3}))
    (game / "math" / "broken.json").write_text("{")
    (game / "RssIData.json").write_text(json.dumps({"idatas": [{"id": "Rules", "dataType": "Game", "path": "math/rules.json"}]}))
    modules = tmp_path / "configs" / "example" / "modules"
    modules.mkdir(parents=True)
    (modules / "ExampleModules.json").write_text(json.dumps({"plugins": [], "modules": [
        {"name": "ExampleMath", "space": "Egt::Game::AlphaFamily", "config": {"setups": [{"id": "a"}]}}]}))
    family = tmp_path / "configs" / "alpha_family" / "modules"
    family.mkdir(parents=True)
    (family / "AlphaGameModules.json").write_text(json.dumps({"modules": [{"name": "CappingSplashView", "config": {}}]}))
    (modules / "ExampleDebugModules.json").write_text(json.dumps({"modules": []}))
    (modules / "ModuleManager_Hat.json").write_text(json.dumps({"modules": []}))
    plugin = tmp_path / "game" / "alpha_family" / "plugins" / "example" / "src" / "Egt" / "ExampleView"
    plugin.mkdir(parents=True)
    (plugin / "ExampleView.cpp").write_text("// view\n")
    (plugin / "CMakeLists.txt").write_text("# cmake\n")
    (plugin / "notes.bin").write_bytes(b"\0")
    (tmp_path / "game" / "secret.key").write_text("x")
    gda = tmp_path / "gda"
    gda.mkdir()
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda)}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        client.game = game
        client.home = Path(library.home)
        client.headers.update(session_headers(client))
        yield client


def test_the_project_has_the_modules_config_and_the_descriptors_entries_with_their_files(client):
    project = client.get("/api/game/project").json()
    assert project["workspace"] == {"id": "example", "name": "Example"}
    # The game's own modules config, not a variant's or an integration's.
    assert project["modules"]["file"].endswith("ExampleModules.json")
    assert project["modules"]["config"]["modules"][0]["name"] == "ExampleMath"
    # The family's modules config, by the namespace of the game's modules: Egt::Game::AlphaFamily is alpha_family.
    assert project["familyModules"]["file"].endswith("alpha_family/modules/AlphaGameModules.json")
    assert project["familyModules"]["config"]["modules"][0]["name"] == "CappingSplashView"
    descriptors = project["descriptors"]
    logo = next(image for image in descriptors["images"] if image["id"] == "LOGO")
    assert logo["file"] == str(client.game / "logo.dds") and logo["descriptor"] == "RssImagesData.json"
    # A sequence's {N-M} frames are expanded, each with its source.
    anim = next(sequence for sequence in descriptors["imagesSeq"] if sequence["id"] == "ANIM")
    assert [Path(frame["file"]).name for frame in anim["frames"]] == ["a_0.dds", "a_1.dds", "a_2.dds"]
    atlas = next(sequence for sequence in descriptors["imagesSeq"] if sequence["id"] == "ATLAS")
    assert atlas["frames"][1]["source"] == {"x": 2, "y": 0, "w": 2, "h": 2}
    assert descriptors["audioEvents"][0]["files"] == [str(client.game / "click.wav")]
    assert descriptors["idatas"][0]["path"] == "math/rules.json"
    # the descriptor files, which the game watches and reads again when they change
    assert {"RssImagesData.json", "RssIData.json"} <= set(project["descriptorFiles"])


def test_json_data_of_the_resources_is_read_and_nothing_else(client):
    assert client.get("/api/game/data", params={"file": "math/rules.json"}).json() == {"rowsCount": 3}
    assert client.get("/api/game/data", params={"file": "math/broken.json"}).status_code == 415
    assert client.get("/api/game/data", params={"file": "math/none.json"}).status_code == 404
    # Only JSON files, by a path relative to the game folder, inside the resources folder.
    assert client.get("/api/game/data", params={"file": "click.wav"}).status_code == 403
    assert client.get("/api/game/data", params={"file": "../../workspace.json"}).status_code == 403
    assert client.get("/api/game/data", params={"file": str(client.game / "math" / "rules.json")}).status_code == 403


def test_the_stamps_of_resource_files_change_when_they_are_written(client):
    def stamps(*files):
        response = client.get("/api/game/file-stamps", params={"file": list(files)})
        return response.json()["stamps"] if response.status_code == 200 else response.status_code

    before = stamps("math/rules.json", "math/none.json")
    assert before["math/rules.json"] and before["math/none.json"] is None
    assert stamps("math/rules.json") == {"math/rules.json": before["math/rules.json"]}
    (client.game / "math" / "rules.json").write_text(json.dumps({"rowsCount": 4, "reels": 5}))
    assert stamps("math/rules.json")["math/rules.json"] != before["math/rules.json"]
    # Only the files of the resources, by a path relative to the game folder.
    assert stamps("../../workspace.json") == 403
    assert stamps(str(client.game / "math" / "rules.json")) == 403
    assert stamps(*[f"f{index}.json" for index in range(501)]) == 400


def test_an_export_is_written_to_the_app_data_folder(client):
    files = {"plugins/example/src/Egt/ExampleFsm/ExampleFsm.cpp": "// fsm\n", "README.md": "# Example\n"}
    result = client.post("/api/game/export", json={"name": "Example", "files": files}).json()
    folder = Path(result["folder"])
    assert folder.is_relative_to(client.home / "game-exports" / "example")
    assert (folder / "plugins/example/src/Egt/ExampleFsm/ExampleFsm.cpp").read_text() == "// fsm\n"
    assert result["files"] == sorted(files)
    # A path that leaves the export's folder is refused, and so is an export without the session's token.
    assert client.post("/api/game/export", json={"name": "Example", "files": {"../escape.txt": "x"}}).status_code == 400
    assert client.post("/api/game/export", json={"name": "Example", "files": {"/etc/escape.txt": "x"}}).status_code == 400
    assert client.post("/api/game/export", json={"name": "Example", "files": files}, headers={"x-gda-token": "wrong"}).status_code == 403


def test_the_cpp_sources_of_a_plugin_are_listed_and_copied_into_an_export(client):
    listing = client.get("/api/game/cpp", params={"folder": "alpha_family/plugins/example"}).json()
    # Only sources, headers and build files, by their paths in the C++ game sources.
    assert listing["files"] == ["alpha_family/plugins/example/src/Egt/ExampleView/CMakeLists.txt",
                                "alpha_family/plugins/example/src/Egt/ExampleView/ExampleView.cpp"]
    assert client.get("/api/game/cpp", params={"folder": "alpha_family/plugins/none"}).json()["exists"] is False
    assert client.get("/api/game/cpp", params={"folder": "../resources"}).status_code == 403
    # A generated file replaces the copy of the same path.
    copies = {"src/Egt/ExampleView/ExampleView.cpp": "alpha_family/plugins/example/src/Egt/ExampleView/ExampleView.cpp",
              "src/Egt/ExampleView/CMakeLists.txt": "alpha_family/plugins/example/src/Egt/ExampleView/CMakeLists.txt"}
    result = client.post("/api/game/export", json={"name": "Example", "files": {"src/Egt/ExampleView/ExampleView.cpp": "// generated\n"},
                                                   "copies": copies}).json()
    folder = Path(result["folder"])
    assert (folder / "src/Egt/ExampleView/ExampleView.cpp").read_text() == "// generated\n"
    assert (folder / "src/Egt/ExampleView/CMakeLists.txt").read_text() == "# cmake\n"
    # Nothing but the C++ sources can be copied.
    for source in ["secret.key", "alpha_family/plugins/example/src/Egt/ExampleView/notes.bin", "../workspace.json", "/etc/passwd"]:
        response = client.post("/api/game/export", json={"name": "Example", "files": {"README.md": "x"}, "copies": {"x.cpp": source}})
        assert response.status_code == 403, source


@pytest.mark.skipif(not shutil.which("node"), reason="the translator runs on Node.js")
def test_typescript_states_are_translated_against_the_cpp_game_sources(client):
    # Only TypeScript of the browser game's alpha_family/ and plugins/ folders.
    assert client.post("/api/game/translate", json={"files": ["../../../etc/passwd.ts"]}).status_code == 403
    assert client.post("/api/game/translate", json={"files": ["engine/Fsm/Fsm.ts"]}).status_code == 403
    # The example's C++ sources have none of the states library's headers: the state is not translated, and says why.
    state = "alpha_family/libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundInput.ts"
    result = client.post("/api/game/translate", json={"files": [state]}).json()
    assert result["files"] == {} and state in result["errors"]
