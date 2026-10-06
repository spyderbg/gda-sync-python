"""Platform integration: application data location and opening folders or URLs."""

import ntpath
import os
import posixpath
import subprocess
import sys
from collections.abc import Mapping

from .errors import AppError

NO_FILE_MANAGER = "A desktop file manager is not available. You can copy the folder path instead."
OPEN_FAILED = "Could not open the folder in your desktop session. You can copy the path instead."


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
            os.startfile(target)  # type: ignore[attr-defined]  # Windows only
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
