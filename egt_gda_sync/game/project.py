"""The game project that the browser game (frontend/src/game) plays: the active workspace's game, read as the C++ game
reads it.

- Its modules config: the <Name>Modules.json of configs/<workspace id>/modules in the games folder, the folder above the
  resources folder, which names the game's modules and their config (such as the math setups and their math file); and
  its family's, such as configs/alpha_family/modules/AlphaGameModules.json for a game of Egt::Game::AlphaFamily
  modules, which names the modules every game of the family has (the capping splash...).
- Its descriptors: every *Data.json of the game folder and the descriptors they include, with each entry's paths
  resolved to files: the images, image sequences (their {N-M} frames expanded), fonts, text styles, audio events,
  IData (math, view configs) and ElementsList entries (views) the game loads by id.
- Its JSON data: an IData or view file, by its path relative to the game folder, inside the resources folder.

Images, audio and fonts are read through the asset library's preview endpoint, which decodes DDS textures. An export
writes the files the browser game generates (C++ sources and configs) to the app data folder, never into the games
folder: a developer copies them from there into the C++ project. It can also copy files of the C++ game sources (the
game folder beside the resources and configs folders, such as game/alpha_family/plugins/<game>), which the browser
game lists, so that an export is a whole plugin: the C++ files the browser game did not generate come as they are.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

from egt_gda_sync.app.errors import AppError
from egt_gda_sync.sync.rss_sync import expand_path, load_documents
from egt_gda_sync.workspace.library import Library, contained, safe_path

MAX_DATA_BYTES = 16 * 1024 * 1024
MODULES_SUFFIX = "Modules.json"
EXPORTS_FOLDER = "game-exports"
# The descriptor lists the game loads entries of, as the C++ resource manager names them.
DESCRIPTOR_LISTS = ("images", "imagesSeq", "fonts", "styles", "audioEvents", "idatas", "elements", "movies", "rtfs")
# An exported file's path: relative, of plain names, without traversal.
EXPORT_PATH = re.compile(r"^(?!.*\.\.)[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$")
MAX_EXPORT_FILES = 500
MAX_EXPORT_BYTES = 8 * 1024 * 1024
# The C++ sources an export copies: sources, headers and their build files.
CPP_FILE = re.compile(r"(\.(h|hpp|cpp|inl|txt|json|cmake)|/\.clang-format)$")
MAX_CPP_FILES = 2000
# The browser game's TypeScript-to-C++ translator (frontend/src/game/export/translator), which runs on Node.js where the
# app runs from its sources.
TRANSLATOR = Path(__file__).resolve().parents[2] / "frontend" / "src" / "game" / "export" / "translator" / "translate.mjs"
TS_PATH = re.compile(r"^(alpha_family|plugins)(/[A-Za-z0-9_.-]+)+\.ts$")
TRANSLATE_TIMEOUT = 300


class GameProject:
    """The game files of a library's active workspace."""

    def __init__(self, library: Library):
        self.library = library

    def _folders(self) -> tuple[str, dict, Path, Path]:
        """The active workspace's id and entry, its resources folder and its game folder."""
        workspace_id, entry = self.library._active_workspace()  # pylint: disable=protected-access
        workspace, settings = self.library._comparison(workspace_id, entry)  # pylint: disable=protected-access
        resources = Path(os.path.realpath(settings["resources_dir"]))
        return workspace_id, workspace, resources, resources / settings["game"]

    def project(self) -> dict:
        """The workspace, its modules config and the entries of its descriptors."""
        workspace_id, workspace, resources, game = self._folders()
        if not game.is_dir():
            raise AppError("The game folder of this workspace does not exist", 404)
        errors: list[str] = []
        try:
            documents = load_documents(game, required=False)
        except (OSError, ValueError) as error:
            documents = {}
            errors.append(str(error))
        descriptors: dict[str, list[dict]] = {name: [] for name in DESCRIPTOR_LISTS}
        for path, document in documents.items():
            name = os.path.relpath(path, game)
            for listed in DESCRIPTOR_LISTS:
                for entry in getattr(document, listed, None) or ():
                    descriptors[listed].append(_entry(entry, game, name))
        return {
            "workspace": {"id": workspace_id, "name": workspace["game_name"]},
            "gamePath": str(game),
            "resourcesPath": str(resources),
            "cppPath": str(self._cpp_root(resources)),
            "modules": (modules := self._modules(workspace_id, resources)),
            "familyModules": self._family_modules(modules, resources),
            "descriptors": descriptors,
            "errors": errors,
        }

    @staticmethod
    def _modules(workspace_id: str, resources: Path) -> dict | None:
        """The game's modules config, <Name>Modules.json in the games folder's configs/<id>/modules: the one that is not a
        variant (debug, QA, partner) or an integration's module manager."""
        folder = resources.parent / "configs" / workspace_id / "modules"
        if not folder.is_dir():
            return None
        names = sorted(name for name in os.listdir(folder)
                       if name.endswith(MODULES_SUFFIX) and "_" not in name and "Debug" not in name and not name.startswith("ModuleManager"))
        if not names:
            return None
        path = folder / names[0]
        try:
            return {"file": str(path), "config": json.loads(path.read_text(encoding="utf-8-sig"))}
        except (OSError, ValueError) as error:
            raise AppError(f"{path.name} cannot be read: {error}", 415) from error

    @staticmethod
    def _family_modules(modules: dict | None, resources: Path) -> dict | None:
        """The modules config of the game's family: configs/<family>/modules/*GameModules.json, where the family is the
        last part of its modules' namespace, as Egt::Game::AlphaFamily is alpha_family."""
        spaces = {module.get("space", "") for module in (modules or {}).get("config", {}).get("modules", []) if isinstance(module, dict)}
        families = sorted({re.sub(r"(?<!^)(?=[A-Z])", "_", space.split("::")[-1]).lower() for space in spaces if space.count("::") >= 2})
        for family in families:
            folder = resources.parent / "configs" / family / "modules"
            names = sorted(name for name in os.listdir(folder) if name.endswith("GameModules.json")) if folder.is_dir() else []
            if names:
                path = folder / names[0]
                try:
                    return {"file": str(path), "config": json.loads(path.read_text(encoding="utf-8-sig"))}
                except (OSError, ValueError) as error:
                    raise AppError(f"{path.name} cannot be read: {error}", 415) from error
        return None

    def data(self, file: str) -> bytes:
        """A JSON file of the game's resources, by its path relative to the game folder, as the descriptors name it."""
        _workspace_id, _workspace, resources, game = self._folders()
        target = os.path.normpath(os.path.join(game, file))
        if os.path.isabs(file) or not file.lower().endswith(".json") or not contained(str(resources), target):
            raise AppError("Only the JSON files of the game's resources can be read", 403)
        path = safe_path(str(resources), os.path.relpath(target, resources))
        try:
            if os.path.getsize(path) > MAX_DATA_BYTES:
                raise AppError(f"{os.path.basename(path)} is larger than {MAX_DATA_BYTES // (1024 * 1024)} MB", 413)
            data = Path(path).read_bytes()
        except FileNotFoundError as error:
            raise AppError("File not found", 404) from error
        try:
            json.loads(data.decode("utf-8-sig"))
        except (UnicodeDecodeError, ValueError) as error:
            raise AppError(f"{os.path.basename(path)} is not valid JSON: {error}", 415) from error
        return data.removeprefix(b"\xef\xbb\xbf")

    @staticmethod
    def _cpp_root(resources: Path) -> Path:
        """The C++ game sources: the game folder beside the resources folder (games/game beside games/resources)."""
        return resources.parent / "game"

    def _cpp_source(self, relative: str) -> Path:
        """A C++ source file by its path relative to the C++ game sources, which must be inside them."""
        root = self._cpp_root(self._folders()[2])
        target = Path(os.path.normpath(root / relative))
        if not EXPORT_PATH.match(relative) or not CPP_FILE.search("/" + relative) or not contained(str(root), str(target)):
            raise AppError(f"Only the C++ sources of the game can be copied: {relative}", 403)
        if not target.is_file():
            raise AppError(f"{relative} is not in the C++ game sources", 404)
        return target

    def cpp_files(self, folder: str) -> dict:
        """The C++ sources in a folder of the C++ game sources, by their paths relative to them."""
        root = self._cpp_root(self._folders()[2])
        target = Path(os.path.normpath(root / folder))
        if not EXPORT_PATH.match(folder) or not contained(str(root), str(target)):
            raise AppError("Only folders of the C++ game sources can be listed", 403)
        files: list[str] = []
        if target.is_dir():
            for directory, _dirs, names in os.walk(target):
                for name in names:
                    relative = Path(directory, name).relative_to(root).as_posix()
                    if CPP_FILE.search("/" + relative):
                        files.append(relative)
                        if len(files) > MAX_CPP_FILES:
                            raise AppError(f"{folder} has more than {MAX_CPP_FILES} sources", 413)
        return {"root": str(root), "folder": folder, "exists": target.is_dir(), "files": sorted(files)}

    def translate(self, files: list[str]) -> dict:
        """The C++ of TypeScript states of the browser game, by the translator, against the C++ game sources' headers:
        {"files": {C++ path in games/game: text}, "errors": {TypeScript path: why it was not translated}}."""
        node = shutil.which("node")
        if not node or not TRANSLATOR.is_file():
            raise AppError("Translating to C++ needs the app's sources and Node.js", 501)
        for file in files:
            if not TS_PATH.match(file) or ".." in file:
                raise AppError(f"Not a TypeScript file of the browser game: {file}", 403)
        root = self._cpp_root(self._folders()[2])
        if not root.is_dir():
            raise AppError("The C++ game sources do not exist", 404)
        try:
            result = subprocess.run([node, str(TRANSLATOR), str(root), *files], cwd=TRANSLATOR.parents[2], capture_output=True, text=True,
                                    timeout=TRANSLATE_TIMEOUT, check=False)
        except subprocess.TimeoutExpired as error:
            raise AppError("The translation took too long", 504) from error
        if result.returncode:
            raise AppError(f"The translator failed: {result.stderr.strip()[-2000:]}", 500)
        return json.loads(result.stdout)

    def export(self, name: str, files: dict[str, str], copies: dict[str, str] | None = None) -> dict:
        """Write the files of an export, by their relative paths, to a new folder of the app data folder's game exports,
        with copies of C++ sources (an export path to its path in the C++ game sources), and return where they are."""
        workspace_id = self._folders()[0]
        copies = {path: source for path, source in (copies or {}).items() if path not in files}
        if not files or len(files) + len(copies) > MAX_EXPORT_FILES:
            raise AppError(f"An export has 1 to {MAX_EXPORT_FILES} files")
        sources = {path: self._cpp_source(source) for path, source in copies.items()}
        size = sum(len(text.encode("utf-8")) for text in files.values()) + sum(source.stat().st_size for source in sources.values())
        if size > MAX_EXPORT_BYTES:
            raise AppError(f"An export is larger than {MAX_EXPORT_BYTES // (1024 * 1024)} MB", 413)
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", name):
            raise AppError("Invalid export name")
        for relative in [*files, *copies]:
            if not EXPORT_PATH.match(relative):
                raise AppError(f"Invalid export path: {relative}")
        folder = Path(self.library.home) / EXPORTS_FOLDER / workspace_id / f"{name}-{int(time.time())}"
        suffix = 1
        while folder.exists():
            folder = folder.with_name(f"{folder.name.rsplit('~', 1)[0]}~{suffix}")
            suffix += 1
        for relative, text in sorted(files.items()):
            target = folder / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8", newline="\n")
        for relative, source in sorted(sources.items()):
            target = folder / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read_bytes())
        return {"folder": str(folder), "files": sorted([*files, *copies])}


def _entry(entry, game: Path, descriptor: str) -> dict:
    """A descriptor entry as plain data, with the descriptor that declares it and its paths resolved: file for a path,
    files for an audio event's samples, and each frame of an image sequence expanded to a file with its source."""
    item = _plain(entry)
    item["descriptor"] = descriptor
    if isinstance(item.get("path"), str):
        item["file"] = str((game / item["path"]).resolve())
    if "frames" in item:
        item["frames"] = [{"file": str((game / path).resolve()), **({"source": frame["source"]} if frame.get("source") else {})}
                          for frame in item["frames"] for path in expand_path(frame["path"])]
    if "samples" in item:
        item["files"] = [str((game / sample).resolve()) for sample in item["samples"]]
    return item


def _plain(value):
    """A descriptor dataclass as plain data, without its unset fields."""
    if hasattr(value, "__dataclass_fields__"):
        return {name: _plain(getattr(value, name)) for name in value.__dataclass_fields__ if getattr(value, name) is not None}
    if isinstance(value, list):
        return [_plain(item) for item in value]
    return value
