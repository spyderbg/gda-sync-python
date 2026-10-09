"""Global paths in workspace.json (egt_gda_sync.paths): {name} in a *_path field stands for a top-level or config
*_path field, and a folder entered in the settings is written with the global path it is inside."""

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.library import Library
from egt_gda_sync.paths import contract, expand, expand_fields, global_paths
from egt_gda_sync.server import create_app
from tests.conftest import session_headers


def test_global_paths_are_the_top_level_and_config_path_fields_and_can_use_each_other():
    settings = {"games_root_path": "/assets/games", "defaultWorkspace": "a", "workspaces": [],
                "config": {"port": 3457, "resources_root_path": "{games_root_path}/resources"}}
    assert global_paths(settings) == {"games_root_path": "/assets/games", "resources_root_path": "/assets/games/resources"}
    with pytest.raises(ValueError, match=r"a_path uses itself through \{b_path\} → \{a_path\}"):
        global_paths({"a_path": "{b_path}/x", "b_path": "{a_path}/y"})
    with pytest.raises(ValueError, match="defined both at the top of workspace.json and in its config section"):
        global_paths({"games_root_path": "/a", "config": {"games_root_path": "/b"}})
    with pytest.raises(ValueError, match="config.gda_root_path must be a nonempty path"):
        global_paths({"config": {"gda_root_path": 7}})
    with pytest.raises(ValueError, match=r"uses \{nope_path\}, which workspace.json does not define as a global path"):
        global_paths({"a_path": "{nope_path}/x"})


def test_only_path_fields_are_expanded():
    paths = {"games_root_path": "/assets/games"}
    entry = {"id": "a", "game_name": "{games_root_path}", "game_path": "{games_root_path}/a", "common_gda_path": "../common"}
    assert expand_fields(entry, paths) == {**entry, "game_path": "/assets/games/a"}
    with pytest.raises(ValueError, match=r"a: gda_path uses \{gda_root_path\}"):
        expand_fields({"gda_path": "{gda_root_path}/a"}, paths, "a: ")
    assert expand("/plain/path", paths, "game_path") == "/plain/path"


def test_a_path_inside_a_global_path_is_written_with_it():
    paths = {"games_root_path": "/assets/games", "resources_root_path": "/assets/games/resources", "gda_root_path": "/assets/gda"}
    # The longest global path that holds the path is used.
    assert contract("/assets/games/resources/joker", paths) == "{resources_root_path}/joker"
    assert contract("/assets/games/tools/x", paths) == "{games_root_path}/tools/x"
    assert contract("/assets/gda", paths) == "{gda_root_path}"
    # A folder that only starts with the same letters is not inside it; a path with placeholders is kept.
    assert contract("/assets/gdaX/a", paths) == "/assets/gdaX/a"
    assert contract("{gda_root_path}/a", paths) == "{gda_root_path}/a"
    assert contract("C:\\Assets\\Games\\joker", {"games_root_path": "c:/assets/games"}) == "{games_root_path}/joker"


def write_config(root: Path) -> Path:
    for folder in ("games/a", "games/b", "gda/a", "gda/b", "gda/common"):
        (root / folder).mkdir(parents=True)
    config = root / "workspace.json"
    config.write_text(json.dumps({
        "config": {"port": 3457},
        "defaultWorkspace": "a",
        "games_root_path": str(root / "games"),
        "gda_root_path": str(root / "gda"),
        "workspaces": [
            {"id": "a", "game_name": "A", "game_path": "{games_root_path}/a", "gda_path": "{gda_root_path}/a",
             "common_gda_path": "{gda_root_path}/common"},
            {"id": "b", "game_name": "B", "game_path": str(root / "games" / "b"), "gda_path": "{gda_root_path}/b"},
        ],
    }, indent=2))
    return config


def test_workspaces_use_global_paths_and_keep_them_when_saved(tmp_path):
    config = write_config(tmp_path)
    original = json.loads(config.read_text())
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    assert library.config["destination"] == os.path.realpath(tmp_path / "games" / "a")
    assert library.config["source"] == os.path.realpath(tmp_path / "gda" / "a")
    assert library.config["templates"] == {"source": "{gda_root_path}/a", "destination": "{games_root_path}/a"}
    # The run's settings are expanded.
    workspace, settings = library._comparison("a", library.config["workspaces"][0])
    assert settings["common_gda_dir"] == str(tmp_path / "gda" / "common")
    # Selecting a workspace saves the file: every path stays as it was written.
    library.select_workspace("b")
    saved = json.loads(config.read_text())
    # Saving adds each workspace's demo flag, as it always has.
    assert saved["workspaces"] == [{**entry, "demo": False} for entry in original["workspaces"]]
    assert saved["games_root_path"] == original["games_root_path"]
    assert saved["defaultWorkspace"] == "b"


def test_a_global_path_that_is_not_defined_stops_startup(tmp_path):
    config = write_config(tmp_path)
    data = json.loads(config.read_text())
    data["workspaces"][1]["game_path"] = "{elsewhere_path}/b"
    config.write_text(json.dumps(data))
    with pytest.raises(RuntimeError, match=r"b: game_path uses \{elsewhere_path\}, which workspace.json does not define"):
        Library(str(tmp_path / "app"), config_path=str(config)).init()


def test_folders_entered_in_the_settings_are_saved_with_the_global_paths_they_are_inside(tmp_path):
    config = write_config(tmp_path)
    (tmp_path / "games" / "new").mkdir()
    (tmp_path / "outside").mkdir()
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        headers = session_headers(client)
        scanned = client.get("/api/library").json()
        assert scanned["globalPaths"] == {"games_root_path": str(tmp_path / "games"), "gda_root_path": str(tmp_path / "gda")}
        assert scanned["config"]["templates"]["destination"] == "{games_root_path}/a"

        def save(source: str, destination: str):
            return client.put("/api/settings", headers=headers, json={"name": "A", "source": source, "destination": destination})

        # An absolute path inside a global path is written with it; a path that uses one is written as entered.
        assert save("{gda_root_path}/a", str(tmp_path / "games" / "new")).status_code == 200
        entry = json.loads(config.read_text())["workspaces"][0]
        assert (entry["game_path"], entry["gda_path"]) == ("{games_root_path}/new", "{gda_root_path}/a")
        assert library.config["destination"] == os.path.realpath(tmp_path / "games" / "new")
        # One outside the global paths is written as it is.
        assert save(str(tmp_path / "outside"), "{games_root_path}/a").status_code == 200
        assert json.loads(config.read_text())["workspaces"][0]["gda_path"] == str(tmp_path / "outside")
        # A global path that is not defined is refused.
        refused = save("{nope_path}/a", "{games_root_path}/a")
        assert refused.status_code == 400 and "The GDA path uses {nope_path}" in refused.json()["error"]
