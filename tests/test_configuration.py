import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from gda_sync import __main__ as launcher
from gda_sync.library import Library
from gda_sync.server import create_app
from tests.conftest import session_headers


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


def test_a_missing_local_configuration_adopts_saved_settings(library, tmp_path):
    config_path = tmp_path / "app" / "workspace.json"
    restored = Library(library.home, config_path=str(config_path))
    restored.init()
    assert restored.config == library.config
    assert json.loads(config_path.read_text(encoding="utf-8")) == library.config


def test_a_new_user_gets_a_demo_configuration_beside_the_executable(tmp_path):
    home = tmp_path / "app-data"
    config_path = tmp_path / "app" / "workspace.json"
    library = Library(str(home), config_path=str(config_path))
    library.init()
    assert json.loads(config_path.read_text(encoding="utf-8")) == library.config
    assert library.config["demo"] is True
    assert len(library.scan()["assets"]) == 18
    assert not (home / "workspace.json").exists()


@pytest.mark.parametrize("invalid", ["{broken JSON}", "[]", '{"name":"Missing folders"}'])
def test_invalid_local_configuration_stops_startup_without_replacing_it(tmp_path, invalid):
    config_path = tmp_path / "workspace.json"
    config_path.write_text(invalid, encoding="utf-8")
    home = tmp_path / "app-data"
    with pytest.raises(RuntimeError, match="Could not read workspace.json"):
        Library(str(home), config_path=str(config_path)).init()
    assert config_path.read_text(encoding="utf-8") == invalid
    assert not (home / "demo").exists()


@pytest.mark.parametrize("binary_name", ["gda-sync", "gda-sync.exe"])
def test_packaged_settings_are_beside_the_executable_independently_of_cwd_data_home_and_extraction(tmp_path, monkeypatch, binary_name):
    app_dir = tmp_path / "app"
    app_dir.mkdir()
    binary = app_dir / binary_name
    binary.touch()
    data_home = str(tmp_path / "app-data")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(binary))
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path / "extracted"), raising=False)
    monkeypatch.setenv("GDA_SYNC_HOME", data_home)
    monkeypatch.chdir(tmp_path)
    assert launcher.workspace_config_path(data_home) == str(app_dir / "workspace.json")


def test_packaged_settings_follow_the_real_executable_when_launched_through_a_symlink(tmp_path, monkeypatch):
    binary = tmp_path / "app" / "gda-sync"
    binary.parent.mkdir()
    binary.touch()
    link = tmp_path / "gda-sync"
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
    template = Path(__file__).resolve().parents[1] / "config" / "config.json.template"
    (project / "config" / template.name).write_bytes(template.read_bytes())
    monkeypatch.setattr(launcher, "PROJECT_ROOT", project)
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    monkeypatch.delenv("GDA_SYNC_HOME", raising=False)
    monkeypatch.chdir(tmp_path)
    home = str(tmp_path / "app-data")
    assert launcher.workspace_config_path(home) == str(project / "config" / "workspace.json")
    monkeypatch.setenv("GDA_SYNC_HOME", home)
    assert launcher.workspace_config_path(home) == str(Path(home) / "workspace.json")
