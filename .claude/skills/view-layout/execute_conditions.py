"""The view-layout skill's execute conditions: what must hold before the skill starts. The skill runs this first, and
stops, changing nothing, when a condition fails.

  execute_conditions.py [WORKSPACE] [--config FILE]

WORKSPACE is the id of a workspace of the app's workspace.json (its defaultWorkspace when left out). The file is the
one --config names, else the one the View layout page supplied, else the repository's config/workspace.json.

Every condition is checked, so one run reports every failure. The exit status is 0 when all of them hold, 1 when one
fails, and 2 when the workspace or its game folder cannot be found.

Conditions:
  no-uncommitted-changes   the branch of the git repository that holds the game folder (the games repository) has
                           nothing uncommitted: no staged, changed, deleted or untracked file. Git is the only backup of
                           the views, since the skill writes no backups, and its changes would mix with the others.

To add a condition, write a function that takes the Context and returns what fails, or None when the condition holds,
and add it to CONDITIONS with its name. Add what it needs to know to the Context, and describe it above.

Run it with the app's Python, from the repository: .venv/bin/python -I .claude/skills/view-layout/execute_conditions.py
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from egt_gda_sync.game.layout_trace import CONTEXT_ENV, HelperTrace

# Register before the app imports, so their startup and failures are timed too.
_trace = HelperTrace("execute_conditions.py") if __name__ == "__main__" else None

from egt_gda_sync.workspace.paths import expand, global_paths

CONFIG = Path(__file__).resolve().parents[3] / "config" / "workspace.json"
LISTED = 20  # the changes a failure lists; it counts the rest


@dataclass(frozen=True)
class Context:
    """What the conditions check: the workspace, the configuration it comes from, and its game folder."""
    workspace: str
    config: Path
    game: Path


def git(folder: Path, *args: str) -> subprocess.CompletedProcess:
    # No optional locks: checking must not take the index lock from git commands running beside it.
    return subprocess.run(["git", "--no-optional-locks", "-C", str(folder), *args], capture_output=True, text=True,
                          check=False)


def no_uncommitted_changes(context: Context) -> str | None:
    """The games repository's branch has nothing uncommitted, untracked files included."""
    top = git(context.game, "rev-parse", "--show-toplevel")
    if top.returncode != 0:
        return f"the game folder {context.game} is not in a git repository, so nothing backs its views up"
    repository = Path(top.stdout.strip())
    status = git(repository, "status", "--porcelain=v1", "--untracked-files=normal")
    if status.returncode != 0:
        return f"git status failed in {repository}: {status.stderr.strip()}"
    changes = [line for line in status.stdout.splitlines() if line]
    if not changes:
        return None
    branch = git(repository, "branch", "--show-current").stdout.strip()
    listed = changes[:LISTED] + ([f"... and {len(changes) - LISTED} more"] if len(changes) > LISTED else [])
    return "\n".join([f"{repository} has {len(changes)} uncommitted change(s) on "
                      f"{f'branch {branch}' if branch else 'a detached HEAD'}. Commit or stash them, then run the skill "
                      "again:", *listed])


CONDITIONS: list[tuple[str, Callable[[Context], str | None]]] = [
    ("no-uncommitted-changes", no_uncommitted_changes),
]


def fail(message: str) -> None:
    print(f"execute_conditions: {message}", file=sys.stderr)
    sys.exit(2)


def config_file(named: str | None) -> Path:
    """The workspace.json: the one named, else the one the View layout page supplied, else the repository's."""
    if named:
        return Path(named)
    try:
        supplied = json.loads(os.environ.get(CONTEXT_ENV) or "{}").get("config")
    except (ValueError, AttributeError):
        supplied = None
    return Path(supplied) if isinstance(supplied, str) and supplied else CONFIG


def workspace_context(config: Path, workspace: str | None) -> Context:
    """The workspace's Context; ValueError when the configuration has no such workspace or its game folder is missing."""
    try:
        settings = json.loads(config.read_text(encoding="utf-8-sig"))
    except OSError as error:
        raise ValueError(f"the workspace configuration cannot be read: {error}") from error
    except ValueError as error:
        raise ValueError(f"{config} is not JSON: {error}") from error
    entries = settings.get("workspaces") if isinstance(settings, dict) else None
    if not isinstance(entries, list):
        raise ValueError(f"{config} has no workspaces list")
    workspace = workspace or settings.get("defaultWorkspace") or settings.get("activeWorkspace")
    entry = next((item for item in entries if isinstance(item, dict) and item.get("id") == workspace), None)
    if entry is None:
        ids = ", ".join(str(item.get("id")) for item in entries if isinstance(item, dict))
        raise ValueError(f"{config} has no workspace {workspace!r} (its workspaces: {ids or 'none'})")
    path = entry.get("game_path", entry.get("destination"))
    if not isinstance(path, str) or not path.strip():
        raise ValueError(f"the workspace {workspace} has no game_path")
    game = Path(expand(path, global_paths(settings), f"{workspace}: game_path")).expanduser()
    game = game if game.is_absolute() else config.parent / game
    if not game.is_dir():
        raise ValueError(f"the game folder of the workspace {workspace} does not exist: {game}")
    return Context(workspace, config, game)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                     epilog=__doc__)
    parser.add_argument("workspace", nargs="?", help="the workspace id (the configuration's defaultWorkspace when left out)")
    parser.add_argument("--config", metavar="FILE", help="the app's workspace.json")
    args = parser.parse_args()
    try:
        checked = workspace_context(config_file(args.config), args.workspace)
    except ValueError as error:
        fail(str(error))
    print(f"workspace {checked.workspace} ({checked.config}): game folder {checked.game}")
    failed = []
    for name, condition in CONDITIONS:
        problem = condition(checked)
        if problem:
            failed.append(name)
            first, *rest = problem.splitlines()
            print("\n".join([f"FAIL {name}: {first}", *(f"       {line}" for line in rest)]))
        else:
            print(f"ok   {name}")
    if _trace:  # The View layout page's result names the conditions that failed.
        _trace.event("conditions", workspace=checked.workspace, passed=[name for name, _ in CONDITIONS if name not in failed],
                     failed=failed)
    if failed:
        print(f"{len(failed)} of {len(CONDITIONS)} execute conditions failed ({', '.join(failed)}): stop the skill, and "
              "change nothing.")
        sys.exit(1)
    print(f"All {len(CONDITIONS)} execute conditions hold.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as error:
        _trace.exit_code = error.code if isinstance(error.code, int) else 1 if error.code else 0
        raise
    else:
        _trace.exit_code = 0
