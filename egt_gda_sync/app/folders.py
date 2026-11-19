"""Where the app finds workspace.json, and where it keeps its data: the history, reports, backups, caches and exports.

The data folder is the one EGT_GDA_SYNC_HOME names, for that run; otherwise the one the config section of
workspace.json names as its working_path; otherwise the platform's application data folder.

    "config": { "port": 3457, "working_path": "/media/data/egt-gda-sync" }

working_path is a global path like the other *_path fields: it can use them, such as "{data_root_path}/egt-gda-sync",
and a workspace's folders can use it. The app reads it when it starts, so a change applies from its next start.
"""

import json
import os
import sys
from collections.abc import Mapping
from pathlib import Path

from egt_gda_sync.app.desktop import application_data_home
from egt_gda_sync.workspace.paths import global_paths

PROJECT_ROOT = Path(__file__).resolve().parents[2]
HOME_VARIABLE = "EGT_GDA_SYNC_HOME"
WORKING_PATH = "working_path"


def workspace_config_path(data_home: str, env: Mapping[str, str] = os.environ) -> str:
    """Use project settings in a checkout, and settings beside the executable for packaged apps."""
    if getattr(sys, "frozen", False):
        return str(Path(sys.executable).resolve().parent / "workspace.json")
    if not env.get(HOME_VARIABLE) and (PROJECT_ROOT / "config" / "workspace.json.template").is_file():
        return str(PROJECT_ROOT / "config" / "workspace.json")
    return os.path.join(data_home, "workspace.json")


def default_data_folder(env: Mapping[str, str] = os.environ) -> str:
    """The platform's application data folder, which EGT_GDA_SYNC_HOME and working_path do not change."""
    return os.path.abspath(application_data_home(env={key: value for key, value in env.items() if key != HOME_VARIABLE}))


def working_folder(config: object) -> str | None:
    """The folder that workspace.json's config.working_path names, with the global paths it uses expanded; None when it
    names none. ValueError when it is not an absolute path, or uses a global path that workspace.json does not define."""
    section = config.get("config") if isinstance(config, dict) else None
    if not isinstance(section, dict) or WORKING_PATH not in section:
        return None
    folder = global_paths(config)[WORKING_PATH]
    if not os.path.isabs(folder):
        raise ValueError(f"config.{WORKING_PATH} must be an absolute folder path")
    return os.path.normpath(folder)


def configured_data_folder(config_path: str, default: str) -> str:
    """The working_path of workspace.json, or of the workspace.json in the default data folder, which the app reads when
    the first does not exist; the default data folder when it names none. A file that cannot be read gives the default
    too: the app reports it when it reads the file."""
    for path in (config_path, os.path.join(default, "workspace.json")):
        try:
            with open(path, encoding="utf-8-sig") as handle:
                config = json.load(handle)
        except FileNotFoundError:
            continue
        except (OSError, ValueError):
            return default
        try:
            return working_folder(config) or default
        except (ValueError, TypeError):
            return default
    return default


def app_folders(env: Mapping[str, str] = os.environ) -> tuple[str, str]:
    """The app's data folder and its workspace.json."""
    home = os.path.abspath(application_data_home(env=env))
    config_path = workspace_config_path(home, env)
    if env.get(HOME_VARIABLE):
        return home, config_path
    return configured_data_folder(config_path, home), config_path
