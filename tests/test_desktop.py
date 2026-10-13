import base64
import os
import shutil
import subprocess

import pytest

from egt_gda_sync.app import desktop
from egt_gda_sync.app.desktop import application_data_home, child_environment, desktop_command, open_in_code
from egt_gda_sync.app.errors import AppError
from egt_gda_sync.workspace.library import asset_id


@pytest.mark.parametrize("platform, executable, file", [
    ("linux", "/usr/bin/code", "/studio/Artist's Assets & $(stuff)/RssImagesData.json"),
    ("darwin", "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code", "/studio/My Game/RssImagesData.json"),
    ("win32", r"C:\Program Files\Microsoft VS Code\bin\code.cmd", r"D:\Studio\My Game\RssImagesData.json"),
])
def test_code_opener_passes_file_and_line_as_one_literal_argument(monkeypatch, platform, executable, file):
    commands = []
    class Process:
        def wait(self, timeout):
            return 0
    def launch(command, **kwargs):
        commands.append((command, kwargs))
        return Process()
    lookups = []
    def which(name):
        lookups.append(name)
        return executable
    monkeypatch.setattr("egt_gda_sync.app.desktop.sys.platform", platform)
    monkeypatch.setattr("egt_gda_sync.app.desktop.shutil.which", which)
    monkeypatch.setattr("egt_gda_sync.app.desktop.subprocess.Popen", launch)
    open_in_code(file, 163)
    assert lookups == ["code"]
    assert commands[0][0] == [executable, "--reuse-window", "--goto", f"{file}:163"]
    assert not commands[0][1].get("shell", False)
    monkeypatch.setattr("egt_gda_sync.app.desktop.shutil.which", lambda name: None)
    with pytest.raises(AppError, match="not available on PATH"):
        open_in_code(file, 163)


def test_windows_code_cmd_fallback_is_resolved_from_path(monkeypatch):
    monkeypatch.setattr("egt_gda_sync.app.desktop.sys.platform", "win32")
    lookups, commands = [], []
    executable = r"C:\Tools\VS Code\bin\code.cmd"
    def which(name):
        lookups.append(name)
        return executable if name == "code.cmd" else None
    class Process:
        def wait(self, timeout):
            return 0
    def launch(command, **kwargs):
        commands.append(command)
        return Process()
    monkeypatch.setattr("egt_gda_sync.app.desktop.shutil.which", which)
    monkeypatch.setattr("egt_gda_sync.app.desktop.subprocess.Popen", launch)
    open_in_code(r"D:\Games\Resources\RssImagesData.json", 163)
    assert lookups == ["code", "code.cmd"]
    assert commands == [[executable, "--reuse-window", "--goto", r"D:\Games\Resources\RssImagesData.json:163"]]


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


class _Launched:
    def __init__(self, commands, code=0):
        self.commands, self.code = commands, code

    def __call__(self, command, **kwargs):
        self.commands.append(command)
        return self

    def wait(self, timeout):
        return self.code


@pytest.mark.parametrize("platform, executable, supported", [
    ("linux", "/usr/bin/google-chrome-stable", True),
    ("linux", "/snap/bin/firefox", True),
    ("linux", "/usr/bin/chromium-browser", True),
    ("linux", "/usr/bin/epiphany", False),
    ("win32", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", True),
    ("win32", r"C:\Program Files\Mozilla Firefox\firefox.exe", True),
    ("win32", r"C:\Program Files\Internet Explorer\iexplore.exe", False),
])
def test_only_browsers_that_take_a_new_window_flag_are_used_for_new_windows(monkeypatch, platform, executable, supported):
    monkeypatch.setattr(desktop, "_linux_default_browser", lambda: executable)
    monkeypatch.setattr(desktop, "_windows_default_browser", lambda: executable)
    assert desktop.default_browser(platform) == (executable if supported else None)


def test_macos_falls_back_to_the_default_opener():
    assert desktop.default_browser("darwin") is None


def _launch(monkeypatch, browser="/usr/bin/firefox", code=0, **options):
    commands, opened = [], []
    monkeypatch.setattr(desktop, "default_browser", lambda: browser)
    monkeypatch.setattr(desktop, "open_on_desktop", opened.append)
    monkeypatch.setattr(subprocess, "Popen", _Launched(commands, code=code))
    desktop.open_page("http://127.0.0.1:3456", **options)
    return commands, opened


def test_the_page_opens_in_the_open_browser_by_default(monkeypatch):
    assert _launch(monkeypatch) == ([], ["http://127.0.0.1:3456"])


def test_a_new_window_opens_without_kiosk_mode(monkeypatch):
    assert _launch(monkeypatch, new_window=True) == ([["/usr/bin/firefox", "--new-window", "http://127.0.0.1:3456"]], [])


def test_kiosk_mode_opens_a_new_window_with_the_kiosk_flag_before_the_url(monkeypatch):
    assert _launch(monkeypatch, kiosk=True) == ([["/usr/bin/firefox", "--new-window", "--kiosk", "http://127.0.0.1:3456"]], [])


def test_an_unknown_browser_or_a_failing_launch_falls_back_to_the_default_opener(monkeypatch, capsys):
    assert _launch(monkeypatch, browser=None, kiosk=True)[1] == ["http://127.0.0.1:3456"]
    assert "--kiosk needs" in capsys.readouterr().out
    assert _launch(monkeypatch, code=1, new_window=True)[1] == ["http://127.0.0.1:3456"]
    assert "--new-window needs" in capsys.readouterr().out
    def missing(*args, **kwargs):
        raise OSError
    opened = []
    monkeypatch.setattr(desktop, "open_on_desktop", opened.append)
    monkeypatch.setattr(subprocess, "Popen", missing)
    desktop.open_page("http://127.0.0.1:3456", new_window=True)
    assert opened == ["http://127.0.0.1:3456"]


def test_the_default_browser_is_found_from_its_desktop_entry(monkeypatch, tmp_path):
    (tmp_path / "applications").mkdir()
    (tmp_path / "applications" / "web.desktop").write_text("[Desktop Entry]\nExec=env BAMBOO=1 /bin/sh --private %U\n")
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 0, "web.desktop\n"))
    assert desktop._linux_default_browser({"XDG_DATA_HOME": str(tmp_path)}) == shutil.which("/bin/sh")
