import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync import __main__ as launcher
from egt_gda_sync.library import Library
from egt_gda_sync.server import create_app
from tests.conftest import session_headers

TEMPLATE = Path(__file__).resolve().parents[1] / "config" / "workspace.json.template"


def workspace_settings(tmp_path):
    source, destination = tmp_path / "source", tmp_path / "gda"
    source.mkdir()
    destination.mkdir()
    (source / "asset.txt").write_text("Project asset", encoding="utf-8")
    # Exercise legacy single-workspace files alongside the new template format.
    return {"name": "Studio project", "source": str(source), "destination": str(destination),
            **json.loads(TEMPLATE.read_text(encoding="utf-8"))["config"]}


def test_template_settings_load_at_startup_and_ui_changes_persist_in_the_project_config(tmp_path):
    settings = json.loads(TEMPLATE.read_text(encoding="utf-8"))
    for index, entry in enumerate(settings["workspaces"]):
        source, destination = tmp_path / f"game-{index}", tmp_path / f"gda-{index}"
        source.mkdir()
        destination.mkdir()
        (source / "asset.txt").write_text("Project asset", encoding="utf-8")
        entry.update(game_path=str(source), gda_path=str(destination))
    config_path = tmp_path / "project" / "config" / "workspace.json"
    config_path.parent.mkdir(parents=True)
    # PowerShell can save JSON as UTF-8 with a BOM.
    config_path.write_text(json.dumps(settings), encoding="utf-8-sig")
    home = tmp_path / "app-data"
    home.mkdir()
    legacy = home / "workspace.json"
    legacy.write_text("{unused legacy config}", encoding="utf-8")
    library = Library(str(home), config_path=str(config_path))
    library.init()
    assert library.config["source"] == settings["workspaces"][0]["game_path"]
    assert library.config["destination"] == settings["workspaces"][0]["gda_path"]
    assert library.config["config"] == settings["config"]
    assert not (home / "demo").exists()

    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        assert client.get("/api/library").json()["assets"][0]["path"] == "asset.txt"
        payload = {key: library.config[key] for key in ("name", "source", "destination")}
        payload["name"] = "Renamed project"
        response = client.put("/api/settings", headers=session_headers(client), json=payload)
        assert response.status_code == 200
    settings["workspaces"][0]["game_name"] = "Renamed project"
    for entry in settings["workspaces"]:
        entry["demo"] = False
    saved = json.loads(config_path.read_text(encoding="utf-8"))
    assert saved == settings
    assert next(iter(saved)) == "config"
    assert legacy.read_text(encoding="utf-8") == "{unused legacy config}"
    assert (home / "activity.json").is_file()

    # An edit made outside the app becomes active on the next launch.
    settings["workspaces"][0]["game_name"] = "Edited in JSON"
    config_path.write_text(json.dumps(settings), encoding="utf-8")
    restored = Library(str(home), config_path=str(config_path))
    restored.init()
    assert restored.config["name"] == "Edited in JSON"
    assert restored.config["workspaces"][1]["name"] == settings["workspaces"][1]["game_name"]


def test_local_configuration_takes_precedence_and_settings_save_to_the_same_file(tmp_path):
    source, destination = tmp_path / "source", tmp_path / "gda"
    source.mkdir()
    destination.mkdir()
    (source / "asset.txt").write_text("Workspace asset", encoding="utf-8")
    settings = {"name": "Packaged workspace", "source": str(source), "destination": str(destination)}
    config_path = tmp_path / "app" / "workspace.json"
    config_path.parent.mkdir()
    config_path.write_text(json.dumps(settings), encoding="utf-8-sig")
    home = tmp_path / "app-data"
    home.mkdir()
    legacy = home / "workspace.json"
    legacy.write_text("{unused legacy config}", encoding="utf-8")

    library = Library(str(home), config_path=str(config_path))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        initial = client.get("/api/library").json()
        assert initial["config"] == {**settings, "demo": False}
        assert [asset["path"] for asset in initial["assets"]] == ["asset.txt"]
        settings["name"] = "Updated workspace"
        response = client.put("/api/settings", headers=session_headers(client), json=settings)
        assert response.status_code == 200

    assert json.loads(config_path.read_text(encoding="utf-8")) == {**settings, "demo": False}
    assert legacy.read_text(encoding="utf-8") == "{unused legacy config}"
    assert (home / "activity.json").is_file()
    assert not (home / "demo").exists()
    restored = Library(str(home), config_path=str(config_path))
    restored.init()
    assert restored.config["name"] == settings["name"]


def test_first_project_launch_adopts_the_saved_workspace_and_keeps_its_history(tmp_path):
    settings = workspace_settings(tmp_path)
    home = tmp_path / "app-data"
    home.mkdir()
    legacy = home / "workspace.json"
    legacy.write_text(json.dumps(settings), encoding="utf-8")
    history = [{"action": "settings", "message": "Previously connected"}]
    (home / "activity.json").write_text(json.dumps(history), encoding="utf-8")
    config_path = tmp_path / "project" / "config" / "workspace.json"
    library = Library(str(home), config_path=str(config_path))
    library.init()
    assert json.loads(config_path.read_text(encoding="utf-8")) == {**settings, "demo": False}
    assert json.loads(legacy.read_text(encoding="utf-8")) == settings
    assert library.activity == history
    assert not (home / "demo").exists()


def test_a_missing_local_configuration_adopts_saved_settings(library, tmp_path):
    config_path = tmp_path / "app" / "workspace.json"
    restored = Library(library.home, config_path=str(config_path))
    restored.init()
    assert restored.config == library.config
    assert json.loads(config_path.read_text(encoding="utf-8")) == library.config


@pytest.mark.parametrize("location", ["project", "executable"])
def test_a_new_user_gets_a_demo_configuration_in_the_active_location(tmp_path, location):
    home = tmp_path / "app-data"
    config_path = tmp_path / "project" / "config" / "workspace.json" if location == "project" else tmp_path / "app" / "workspace.json"
    library = Library(str(home), config_path=str(config_path))
    library.init()
    assert json.loads(config_path.read_text(encoding="utf-8")) == library.config
    assert library.config["demo"] is True
    assert len(library.scan()["assets"]) == 18
    assert not (home / "workspace.json").exists()


@pytest.mark.parametrize("invalid, message", [
    ("{broken JSON}", "Could not read workspace.json"),
    ("[]", "Expected name, source and destination"),
    ('{"name": "Missing folders"}', "Expected name, source and destination"),
])
def test_invalid_local_configuration_stops_startup_without_replacing_it(tmp_path, invalid, message):
    config_path = tmp_path / "workspace.json"
    config_path.write_text(invalid, encoding="utf-8")
    home = tmp_path / "app-data"
    with pytest.raises(RuntimeError, match=message):
        Library(str(home), config_path=str(config_path)).init()
    assert config_path.read_text(encoding="utf-8") == invalid
    assert not (home / "demo").exists()


@pytest.mark.parametrize("change, message", [
    ({"name": " "}, "1–80 characters"),
    ({"source": "relative/path"}, "absolute folder paths"),
    ({"demo": "false"}, "demo must be true or false"),
])
def test_hand_edited_settings_use_the_same_validation_as_workspace_settings(tmp_path, change, message):
    settings = {**workspace_settings(tmp_path), **change}
    config_path = tmp_path / "workspace.json"
    config_path.write_text(json.dumps(settings), encoding="utf-8")
    with pytest.raises(RuntimeError, match=message):
        Library(str(tmp_path / "app-data"), config_path=str(config_path)).init()


@pytest.mark.parametrize("destination", ["same", "nested", "missing", "file"])
def test_startup_rejects_invalid_workspace_folders(tmp_path, destination):
    settings = workspace_settings(tmp_path)
    source = Path(settings["source"])
    target = {
        "same": source, "nested": source / "nested", "missing": tmp_path / "missing", "file": source / "asset.txt",
    }[destination]
    if destination == "nested":
        target.mkdir()
    settings["destination"] = str(target)
    config_path = tmp_path / "workspace.json"
    config_path.write_text(json.dumps(settings), encoding="utf-8")
    with pytest.raises(RuntimeError, match="Could not read workspace.json"):
        Library(str(tmp_path / "app-data"), config_path=str(config_path)).init()


def test_a_failed_settings_save_keeps_the_previous_config_and_removes_temporary_files(tmp_path, monkeypatch):
    settings = workspace_settings(tmp_path)
    config_path = tmp_path / "config" / "workspace.json"
    config_path.parent.mkdir()
    config_path.write_text(json.dumps(settings), encoding="utf-8")
    library = Library(str(tmp_path / "app-data"), config_path=str(config_path))
    library.init()
    previous = dict(library.config)

    def fail_replace(*_args):
        raise PermissionError("Cannot replace config")

    monkeypatch.setattr(os, "replace", fail_replace)
    with pytest.raises(PermissionError):
        library.update_config("New name", settings["source"], settings["destination"])
    assert library.config == previous
    assert json.loads(config_path.read_text(encoding="utf-8")) == settings
    assert list(config_path.parent.iterdir()) == [config_path]


@pytest.mark.parametrize("binary_name", ["egt-gda-sync", "egt-gda-sync.exe"])
def test_packaged_settings_are_beside_the_executable_independently_of_cwd_data_home_and_extraction(tmp_path, monkeypatch, binary_name):
    app_dir = tmp_path / "app"
    app_dir.mkdir()
    binary = app_dir / binary_name
    binary.touch()
    data_home = str(tmp_path / "app-data")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(binary))
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path / "extracted"), raising=False)
    monkeypatch.setenv("EGT_GDA_SYNC_HOME", data_home)
    monkeypatch.chdir(tmp_path)
    assert launcher.workspace_config_path(data_home) == str(app_dir / "workspace.json")


def test_packaged_settings_follow_the_real_executable_when_launched_through_a_symlink(tmp_path, monkeypatch):
    binary = tmp_path / "app" / "egt-gda-sync"
    binary.parent.mkdir()
    binary.touch()
    link = tmp_path / "egt-gda-sync"
    try:
        link.symlink_to(binary)
    except OSError:
        pytest.skip("Executable symlinks are unavailable on this system")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(link))
    assert launcher.workspace_config_path(str(tmp_path / "data")) == str(binary.parent / "workspace.json")


def test_source_launches_use_the_project_configuration_and_keep_explicit_data_home_isolation(tmp_path, monkeypatch):
    project = tmp_path / "project"
    (project / "config").mkdir(parents=True)
    (project / "config" / TEMPLATE.name).write_bytes(TEMPLATE.read_bytes())
    monkeypatch.setattr(launcher, "PROJECT_ROOT", project)
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    monkeypatch.delenv("EGT_GDA_SYNC_HOME", raising=False)
    monkeypatch.chdir(tmp_path)
    home = str(tmp_path / "app-data")
    assert launcher.workspace_config_path(home) == str(project / "config" / "workspace.json")
    monkeypatch.setenv("EGT_GDA_SYNC_HOME", home)
    assert launcher.workspace_config_path(home) == str(Path(home) / "workspace.json")
    monkeypatch.delenv("EGT_GDA_SYNC_HOME")
    (project / "config" / TEMPLATE.name).unlink()
    assert launcher.workspace_config_path(home) == str(Path(home) / "workspace.json")
