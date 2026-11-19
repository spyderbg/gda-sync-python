"""The working folder: workspace.json's config.working_path, where the app keeps its data from its next start, and the
global settings that save it."""

import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.app import folders
from egt_gda_sync.app.server import create_app
from egt_gda_sync.workspace.library import Library
from tests.conftest import session_headers


def workspaces_config(tmp_path, **config):
    """A workspace.json of one workspace, whose game folder is inside {games_root_path}."""
    for folder in ("games/a", "gda/a"):
        (tmp_path / folder).mkdir(parents=True, exist_ok=True)
    return {"config": {"port": 4567, **config}, "defaultWorkspace": "a", "games_root_path": str(tmp_path / "games"),
            "workspaces": [{"id": "a", "game_name": "A", "game_path": "{games_root_path}/a", "gda_path": str(tmp_path / "gda" / "a")}]}


def write(path, config):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config), encoding="utf-8")
    return path


@pytest.fixture
def checkout(tmp_path, monkeypatch):
    """A checkout's project configuration, config/workspace.json, with the platform's data folder in tmp_path."""
    project = tmp_path / "project"
    (project / "config").mkdir(parents=True)
    (project / "config" / "workspace.json.template").write_text("{}", encoding="utf-8")
    monkeypatch.setattr(folders, "PROJECT_ROOT", project)
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    env = {"XDG_DATA_HOME": str(tmp_path / "xdg"), "LOCALAPPDATA": str(tmp_path / "xdg")}
    default = folders.default_data_folder(env)
    return project / "config" / "workspace.json", env, default


def test_the_data_folder_is_the_working_path_unless_egt_gda_sync_home_names_one(tmp_path, checkout):
    config_path, env, default = checkout
    assert folders.app_folders(env) == (default, str(config_path))

    write(config_path, workspaces_config(tmp_path, working_path="{games_root_path}/../egt-data"))
    assert folders.app_folders(env) == (str(tmp_path / "egt-data"), str(config_path))

    # EGT_GDA_SYNC_HOME chooses the data folder of a run, with its own workspace.json.
    home = str(tmp_path / "isolated")
    assert folders.app_folders({**env, "EGT_GDA_SYNC_HOME": home}) == (home, os.path.join(home, "workspace.json"))

    # A file the app cannot use starts it in the default folder, where reading workspace.json reports the problem.
    for broken in ("{not json", json.dumps(workspaces_config(tmp_path, working_path="relative/data")),
                   json.dumps(workspaces_config(tmp_path, working_path="{nope_path}/data"))):
        config_path.write_text(broken, encoding="utf-8")
        assert folders.app_folders(env) == (default, str(config_path))


def test_without_a_project_configuration_the_one_in_the_default_folder_names_the_working_folder(tmp_path, checkout):
    config_path, env, default = checkout
    write(Path(default) / "workspace.json", workspaces_config(tmp_path, working_path=str(tmp_path / "moved")))
    assert not config_path.exists()
    assert folders.app_folders(env)[0] == str(tmp_path / "moved")


@pytest.mark.parametrize("working_path, message", [
    ("relative/data", "config.working_path must be an absolute folder path"),
    ("{nope_path}/data", "config.working_path uses {nope_path}"),
    ("", "config.working_path must be a nonempty path"),
])
def test_workspace_json_with_an_unusable_working_path_does_not_start(tmp_path, working_path, message):
    config_path = write(tmp_path / "workspace.json", workspaces_config(tmp_path, working_path=working_path))
    library = Library(str(tmp_path / "home"), config_path=str(config_path))
    with pytest.raises(RuntimeError, match="Could not read workspace.json") as error:
        library.init()
    assert message in str(error.value)


def test_a_data_folder_that_cannot_be_created_names_the_setting(tmp_path):
    blocker = tmp_path / "file"
    blocker.write_text("not a folder", encoding="utf-8")
    config_path = write(tmp_path / "workspace.json", workspaces_config(tmp_path, working_path=str(blocker / "data")))
    library = Library(str(blocker / "data"), config_path=str(config_path))
    with pytest.raises(RuntimeError, match="Could not create the data folder .*working_path"):
        library.init()


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.delenv("EGT_GDA_SYNC_HOME", raising=False)
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "xdg"))
    config_path = write(tmp_path / "project" / "workspace.json", workspaces_config(tmp_path))
    home = folders.default_data_folder()
    library = Library(home, config_path=str(config_path))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        yield client, library, config_path


def test_global_settings_save_the_working_folder_for_the_next_start(tmp_path, app):
    client, library, config_path = app
    settings = client.get("/api/app-settings").json()
    assert settings == {
        "workingPath": "", "workingFolder": "", "dataFolder": library.home, "defaultFolder": library.home,
        "nextFolder": library.home, "environmentFolder": "", "restartNeeded": False, "configPath": str(config_path),
        "globalPaths": {"games_root_path": str(tmp_path / "games")},
    }

    # A folder that does not exist yet is created when the app starts; it can use the global paths.
    response = client.put("/api/app-settings", headers=session_headers(client), json={"workingPath": " {games_root_path}/../data "})
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["workingPath"] == "{games_root_path}/../data"
    assert saved["workingFolder"] == saved["nextFolder"] == str(tmp_path / "data")
    assert saved["dataFolder"] == library.home and saved["restartNeeded"] is True
    written = json.loads(config_path.read_text(encoding="utf-8"))
    assert written["config"] == {"port": 4567, "working_path": "{games_root_path}/../data"}
    assert written["workspaces"][0]["game_path"] == "{games_root_path}/a"
    assert not (tmp_path / "data").exists()
    assert library.activity[0]["message"] == "Set the working folder to {games_root_path}/../data"
    # The next start uses it.
    assert folders.configured_data_folder(str(config_path), library.home) == str(tmp_path / "data")
    restarted = Library(str(tmp_path / "data"), config_path=str(config_path))
    restarted.init()
    assert restarted.app_settings()["restartNeeded"] is False
    assert (tmp_path / "data").is_dir()

    # Empty is the default folder again.
    response = client.put("/api/app-settings", headers=session_headers(client), json={"workingPath": ""})
    assert response.json()["restartNeeded"] is False
    assert json.loads(config_path.read_text(encoding="utf-8"))["config"] == {"port": 4567}


@pytest.mark.parametrize("working_path, message", [
    ("relative/data", "Enter an absolute path for the working folder"),
    ("{nope_path}/data", "The working folder uses {nope_path}"),
    ("{games_root_path}/a/data", "this one is inside the Game folder of A"),
    ("{games_root_path}/a", "this one is inside the Game folder of A"),
])
def test_global_settings_refuse_a_working_folder_the_app_cannot_use(app, working_path, message):
    client, _library, config_path = app
    before = config_path.read_text(encoding="utf-8")
    response = client.put("/api/app-settings", headers=session_headers(client), json={"workingPath": working_path})
    assert response.status_code == 400
    assert message in response.json()["error"]
    assert config_path.read_text(encoding="utf-8") == before


def test_global_settings_refuse_a_file_and_need_the_session_token(tmp_path, app):
    client = app[0]
    (tmp_path / "file").write_text("", encoding="utf-8")
    response = client.put("/api/app-settings", headers=session_headers(client), json={"workingPath": str(tmp_path / "file")})
    assert response.json()["error"] == "The working folder must be a folder"
    assert client.put("/api/app-settings", json={"workingPath": str(tmp_path / "data")}).status_code == 403


def test_the_single_workspace_format_keeps_its_working_folder(tmp_path, monkeypatch):
    monkeypatch.delenv("EGT_GDA_SYNC_HOME", raising=False)
    for folder in ("gda", "game"):
        (tmp_path / folder).mkdir()
    config_path = write(tmp_path / "workspace.json", {"name": "Legacy", "source": str(tmp_path / "gda"), "destination": str(tmp_path / "game")})
    library = Library(str(tmp_path / "home"), config_path=str(config_path))
    library.init()
    library.update_app_settings(str(tmp_path / "data"))
    written = json.loads(config_path.read_text(encoding="utf-8"))
    assert written["config"] == {"working_path": str(tmp_path / "data")} and written["name"] == "Legacy"
    reread = Library(str(tmp_path / "data"), config_path=str(config_path))
    reread.init()
    assert reread.app_settings()["workingFolder"] == str(tmp_path / "data")
    reread.update_app_settings("")
    assert "config" not in json.loads(config_path.read_text(encoding="utf-8"))
