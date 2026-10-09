"""Global paths in workspace.json: its top-level *_path fields, and those of its config section, which the *_path
fields of its workspaces use as {name}.

    "games_root_path": "/assets/games",
    "gda_root_path": "/assets/gda",
    "workspaces": [ { "game_path": "{games_root_path}/resources/joker_reels_coins_10", "gda_path": "{gda_root_path}/joker/DEV" } ]

A placeholder is replaced only in a field whose name ends with _path, and it names a global path; a global path can use
another, but not itself. contract does the reverse for a path entered in the settings: a path inside a global path is
written with its placeholder, the longest global path first.
"""

from __future__ import annotations

import ntpath
import os
import re

SUFFIX = "_path"
PLACEHOLDER = re.compile(r"\{([A-Za-z0-9_]+)\}")


def path_fields(fields: dict) -> dict[str, str]:
    """The fields of an object that are paths, which can use placeholders: text fields named *_path."""
    return {key: value for key, value in fields.items() if key.endswith(SUFFIX) and isinstance(value, str)}


def global_paths(settings: dict) -> dict[str, str]:
    """The global paths of workspace.json, its top-level *_path fields and those of its config section, each with the
    placeholders it uses replaced; ValueError when one is not text, is defined twice, or uses a path that is not defined
    or itself."""
    section = settings.get("config") if isinstance(settings.get("config"), dict) else {}
    top = {key: value for key, value in settings.items() if key.endswith(SUFFIX)}
    inner = {key: value for key, value in section.items() if key.endswith(SUFFIX)}
    if twice := sorted(top.keys() & inner.keys()):
        raise ValueError(f"{twice[0]} is defined both at the top of workspace.json and in its config section")
    labels = {**{key: key for key in top}, **{key: f"config.{key}" for key in inner}}
    defined = {**top, **inner}
    for key, value in defined.items():
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{labels[key]} must be a nonempty path")
    expanded: dict[str, str] = {}

    def resolve(name: str, using: tuple[str, ...]) -> str:
        if name in expanded:
            return expanded[name]
        if name in using:
            raise ValueError(f"{labels[using[0]]} uses itself through {' → '.join(f'{{{item}}}' for item in (*using[1:], name))}")
        expanded[name] = _replace(defined[name], labels[name], lambda used: resolve(used, (*using, name)) if used in defined else None,
                                  defined)
        return expanded[name]

    for name in defined:
        resolve(name, ())
    return expanded


def _replace(value: str, field: str, lookup, defined: dict) -> str:
    def replacement(match: re.Match) -> str:
        found = lookup(match[1])
        if found is None:
            names = ", ".join(f"{{{name}}}" for name in defined) or "none"
            raise ValueError(f"{field} uses {{{match[1]}}}, which workspace.json does not define as a global path "
                             f"(global paths: {names})")
        return found
    return PLACEHOLDER.sub(replacement, value)


def expand(value: str, paths: dict[str, str], field: str) -> str:
    """A path with each placeholder replaced by its global path; ValueError for a placeholder that is not defined."""
    return _replace(value, field, paths.get, paths)


def expand_fields(fields: dict, paths: dict[str, str], where: str = "") -> dict:
    """An object with its *_path fields expanded."""
    return {**fields, **{key: expand(value, paths, f"{where}{key}") for key, value in path_fields(fields).items()}}


def contract(path: str, paths: dict[str, str]) -> str:
    """A path to write in workspace.json: one that uses placeholders as it is, otherwise one inside a global path written
    with its placeholder, the longest global path first, and the rest with forward slashes."""
    if PLACEHOLDER.search(path):
        return path
    flavor = ntpath if re.match(r"^[A-Za-z]:[\\/]|^\\\\", path) else os.path

    def key(value: str) -> str:
        return flavor.normcase(flavor.normpath(value))

    normalized = flavor.normpath(path)
    for name, root in sorted(paths.items(), key=lambda item: -len(item[1])):
        if not flavor.isabs(root):
            continue
        root_key = key(root)
        if key(normalized) == root_key:
            return f"{{{name}}}"
        prefix = root_key.rstrip("\\/") + flavor.sep
        if key(normalized).startswith(prefix):
            rest = normalized[len(flavor.normpath(root).rstrip("\\/")) + 1:]
            return f"{{{name}}}/{rest.replace(flavor.sep, '/')}"
    return path
