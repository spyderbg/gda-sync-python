"""Platform integration: application data location, folder selection and opening folders or URLs."""

import configparser
import ntpath
import os
import posixpath
import re
import shutil
import subprocess
import sys
import uuid
from collections.abc import Mapping

from egt_gda_sync.app.errors import AppError

NO_FILE_MANAGER = "A desktop file manager is not available. You can copy the folder path instead."
OPEN_FAILED = "Could not open the folder in your desktop session. You can copy the path instead."
CHOOSE_FAILED = "Could not open the folder chooser. You can enter the target path manually."


def application_data_home(platform: str = sys.platform, env: Mapping[str, str] = os.environ, home: str | None = None) -> str:
    if env.get("EGT_GDA_SYNC_HOME"):
        return env["EGT_GDA_SYNC_HOME"]
    home = home or os.path.expanduser("~")
    if platform == "win32":
        return ntpath.join(env.get("LOCALAPPDATA") or ntpath.join(home, "AppData", "Local"), "EGT GDA Sync")
    return posixpath.join(env.get("XDG_DATA_HOME") or posixpath.join(home, ".local", "share"), "egt-gda-sync")


def platform_label(platform: str = sys.platform) -> str:
    if platform == "win32":
        return "Windows"
    if platform == "darwin":
        return "macOS"
    try:
        import platform as system

        return system.freedesktop_os_release().get("NAME", "Linux")
    except OSError:
        return "Linux"


def desktop_command(target: str, platform: str = sys.platform) -> list[str] | None:
    """Return the opener command line, or None on Windows where the shell API opens targets directly."""
    if platform == "win32":
        return None
    return ["open" if platform == "darwin" else "xdg-open", target]


def child_environment() -> dict[str, str]:
    """The environment for desktop programs, without the library path of a bundled executable."""
    env = dict(os.environ)
    if getattr(sys, "frozen", False):
        # PyInstaller prepends its extraction folder; browsers must use the system libraries.
        original = env.pop("LD_LIBRARY_PATH_ORIG", None)
        if original is None:
            env.pop("LD_LIBRARY_PATH", None)
        else:
            env["LD_LIBRARY_PATH"] = original
    return env


def open_on_desktop(target: str, wait_seconds: float = 10.0) -> None:
    """Open a folder or URL with the desktop's default application. Targets are never parsed by a shell."""
    command = desktop_command(target)
    if command is None:
        try:
            getattr(os, "startfile")(target)  # Windows only; other platforms have no os.startfile
        except OSError as error:
            raise AppError(OPEN_FAILED, 503) from error
        return
    try:
        process = subprocess.Popen(
            command, env=child_environment(), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, start_new_session=True,
        )
    except OSError as error:
        raise AppError(NO_FILE_MANAGER, 503) from error
    try:
        code = process.wait(wait_seconds)
    except subprocess.TimeoutExpired:
        return  # Some openers stay attached to the program they launched.
    if code != 0:
        raise AppError(OPEN_FAILED, 503)


def choose_folder(start: str) -> str | None:
    """Choose one existing folder, starting at start; cancellation returns None. Paths stay literal data."""
    env = child_environment()
    cancel_codes = ()
    if sys.platform == "win32":
        env["EGT_GDA_SYNC_PICKER_START"] = start
        script = """
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Choose a destination folder inside this game'
$dialog.SelectedPath = $env:EGT_GDA_SYNC_PICKER_START
$dialog.ShowNewFolderButton = $false
try {
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::WriteLine($dialog.SelectedPath)
    }
} finally { $dialog.Dispose() }
"""
        command = ["powershell.exe", "-NoProfile", "-NonInteractive", "-STA", "-Command", script]
    elif sys.platform == "darwin":
        script = """
on run argv
    try
        set selectedFolder to choose folder with prompt "Choose a destination folder inside this game" default location (POSIX file (item 1 of argv))
        return POSIX path of selectedFolder
    on error number -128
        return ""
    end try
end run
"""
        command = ["osascript", "-e", script, start]
    else:
        cancel_codes = (1,)
        zenity, kdialog = shutil.which("zenity"), shutil.which("kdialog")
        if kdialog and (not zenity or "KDE" in env.get("XDG_CURRENT_DESKTOP", "").upper()):
            command = [kdialog, "--getexistingdirectory", start, "--title", "Choose destination folder"]
        elif zenity:
            # GTK4 treats a directory filename as a selection in its parent, even with a trailing slash.
            # A nonexistent child makes the game the displayed folder, with nothing preselected. No file is created.
            initial = os.path.join(start, f".egt-gda-sync-folder-{uuid.uuid4().hex}")
            command = [zenity, "--file-selection", "--directory", "--title=Choose destination folder", f"--filename={initial}"]
        else:
            raise AppError("A folder chooser is not available. Install zenity or kdialog, or enter the target path manually.", 503)
    try:
        # GTK can fall back to the process directory while restoring the chooser's state.
        # Set it for this child only; changing the server's working directory would affect other requests.
        result = subprocess.run(command, cwd=start, env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding="utf-8")
    except OSError as error:
        raise AppError(CHOOSE_FAILED, 503) from error
    if result.returncode in cancel_codes:
        return None
    if result.returncode != 0:
        raise AppError(CHOOSE_FAILED, 503)
    return result.stdout.rstrip("\r\n") or None


# Browsers that open a URL in a new window when given --new-window.
NEW_WINDOW_BROWSERS = ("chrome", "chromium", "msedge", "microsoft-edge", "brave", "vivaldi", "opera", "firefox")
NEW_WINDOW_WAIT_SECONDS = 3.0


def _linux_default_browser(env: Mapping[str, str] = os.environ) -> str | None:
    """Find the executable of the default web browser from its desktop entry."""
    try:
        entry = subprocess.run(
            ["xdg-settings", "get", "default-web-browser"], capture_output=True, text=True, timeout=5, env=child_environment(),
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    if not entry:
        return None
    data_home = env.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    data_dirs = (env.get("XDG_DATA_DIRS") or "/usr/local/share:/usr/share").split(":")
    for directory in (data_home, *data_dirs, "/var/lib/snapd/desktop"):
        parser = configparser.RawConfigParser(strict=False, interpolation=None)
        try:
            if not parser.read(os.path.join(directory, "applications", entry), encoding="utf-8"):
                continue
            command = parser.get("Desktop Entry", "Exec")
        except (configparser.Error, OSError, UnicodeDecodeError):
            continue
        # Skip the env prefix some entries have, and the %U style field codes.
        words = [word.strip('"') for word in command.split() if not word.startswith("%")]
        if words and os.path.basename(words[0]) == "env":
            words = [word for word in words[1:] if "=" not in word]
        return shutil.which(words[0]) if words else None
    return None


def _windows_default_browser() -> str | None:
    """Find the executable of the default web browser from the registry."""
    import winreg  # pylint: disable=import-error  # Only available on Windows.

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice") as key:
            program = winreg.QueryValueEx(key, "ProgId")[0]
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, rf"{program}\shell\open\command") as key:
            command = winreg.QueryValueEx(key, "")[0]
    except OSError:
        return None
    match = re.match(r'\s*"([^"]+)"', command) or re.match(r"\s*(\S+)", command)
    return match.group(1) if match else None


def default_browser(platform: str = sys.platform) -> str | None:
    """Return the default browser's executable if it supports --new-window, else None."""
    if platform == "win32":
        executable = _windows_default_browser()
    elif platform == "darwin":
        return None
    else:
        executable = _linux_default_browser()
    if not executable:
        return None
    name = ntpath.basename(executable) if platform == "win32" else os.path.basename(executable)
    name = re.sub(r"\.exe$", "", name.lower())
    return executable if any(browser in name for browser in NEW_WINDOW_BROWSERS) else None


def open_page(url: str, new_window: bool = False, kiosk: bool = False) -> None:
    """Open a URL with the desktop's default opener, in the browser that is already open.

    A new window of the default browser is opened instead with new_window, or full screen without
    browser controls with kiosk. Both fall back to the default opener when the default browser is
    unknown, which cannot open a new window or show kiosk mode.
    """
    if new_window or kiosk:
        browser = default_browser()
        if browser:
            try:
                process = subprocess.Popen(
                    [browser, "--new-window", *(["--kiosk"] if kiosk else []), url], env=child_environment(), stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=os.name != "nt",
                )
                try:
                    if process.wait(NEW_WINDOW_WAIT_SECONDS) == 0:
                        return
                except subprocess.TimeoutExpired:
                    return  # A browser that was not running stays attached to its first window.
            except OSError:
                pass
        flag = "--kiosk" if kiosk else "--new-window"
        print(f"{flag} needs a Chromium-based browser or Firefox as the default browser; opening the page normally.", flush=True)
    open_on_desktop(url)


def open_in_code(file: str, line: int) -> None:
    """Find the VS Code CLI on PATH and open an absolute file path at its declaration line.

    On Windows, shutil.which uses PATHEXT to find code.cmd. The explicit fallback also
    handles environments where PATHEXT does not include .CMD.
    """
    command = shutil.which("code")
    if not command and sys.platform == "win32":
        command = shutil.which("code.cmd")
    if not command:
        raise AppError("VS Code's code command is not available on PATH.", 503)
    try:
        process = subprocess.Popen(
            [command, "--reuse-window", "--goto", f"{file}:{line}"], env=child_environment(),
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
        )
        if process.wait(10) != 0:
            raise AppError("Could not open the declaration in VS Code.", 503)
    except subprocess.TimeoutExpired:
        return
    except OSError as error:
        raise AppError("Could not open the declaration in VS Code.", 503) from error
