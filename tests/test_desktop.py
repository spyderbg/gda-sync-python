import base64
import os

from egt_gda_sync.desktop import application_data_home, child_environment, desktop_command
from egt_gda_sync.library import asset_id


def test_windows_stores_app_data_in_local_app_data_and_honors_an_explicit_workspace_override():
    local = "C:\\Users\\Artist\\AppData\\Local"
    assert application_data_home("win32", {"LOCALAPPDATA": local, "XDG_DATA_HOME": "/linux/data"}, "C:\\Users\\Artist") == local + "\\EGT GDA Sync"
    assert application_data_home("win32", {}, "C:\\Users\\Artist") == local + "\\EGT GDA Sync"
    override = {"EGT_GDA_SYNC_HOME": "D:\\Studio Assets\\GDA", "LOCALAPPDATA": "C:\\unused"}
    assert application_data_home("win32", override) == "D:\\Studio Assets\\GDA"
    assert application_data_home("linux", {}, "/home/artist") == "/home/artist/.local/share/egt-gda-sync"
    assert application_data_home("linux", {"XDG_DATA_HOME": "/data/apps"}) == "/data/apps/egt-gda-sync"


def test_targets_are_passed_to_the_opener_literally_and_never_through_a_shell():
    for target in ("/studio/Artist's Assets & $(stuff)", "http://127.0.0.1:3456/?a=1&b=2"):
        assert desktop_command(target, "linux") == ["xdg-open", target]
        assert desktop_command(target, "darwin") == ["open", target]
    # Windows opens targets with the shell API (os.startfile), which takes the path as a single argument.
    assert desktop_command("C:\\Studio & Game\\$() ` % ! #", "win32") is None


def test_bundled_executables_restore_the_system_library_path_for_desktop_programs(monkeypatch):
    monkeypatch.setattr("sys.frozen", True, raising=False)
    monkeypatch.setenv("LD_LIBRARY_PATH", "/tmp/_MEI123")
    monkeypatch.setenv("LD_LIBRARY_PATH_ORIG", "/usr/local/lib")
    assert child_environment()["LD_LIBRARY_PATH"] == "/usr/local/lib"
    monkeypatch.delenv("LD_LIBRARY_PATH_ORIG")
    assert "LD_LIBRARY_PATH" not in child_environment()


def test_native_folder_separators_produce_the_same_asset_id_as_the_portable_demo_preview_filename():
    portable = "models/props/wooden_crate.obj"
    expected = base64.urlsafe_b64encode(portable.encode()).rstrip(b"=").decode()
    assert asset_id(os.path.join("models", "props", "wooden_crate.obj")) == expected
