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
- The stamps of its files (when each last changed), which the browser game polls to reload a view whose file changed,
  as the C++ game's FileWatch module does.

Images, audio and fonts are read through the asset library's preview endpoint, which decodes DDS textures. An export
writes the files the browser game generates (C++ sources and configs) to the app data folder, never into the games
folder: a developer copies them from there into the C++ project. It can also copy files of the C++ game sources (the
game folder beside the resources and configs folders, such as game/alpha_family/plugins/<game>), which the browser
game lists, so that an export is a whole plugin: the C++ files the browser game did not generate come as they are.
"""

from __future__ import annotations

import copy
import io
import json
import os
import re
import shlex
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from egt_gda_sync.app.errors import AppError
from egt_gda_sync.game.layout_trace import AUDIT_ENV, CONTEXT_ENV, changed_files, fingerprint, view_snapshot
from egt_gda_sync.sync.rss_sync import expand_path, load_documents
from egt_gda_sync.workspace.library import Library, contained, safe_path

MAX_DATA_BYTES = 16 * 1024 * 1024
MAX_WATCHED_FILES = 500
MODULES_SUFFIX = "Modules.json"
EXPORTS_FOLDER = "game-exports"
# An export's folder name: the export's name and when it was made, and a number if that folder was taken.
EXPORT_ID = re.compile(r"[A-Za-z0-9_-]{1,64}-\d+(~\d+)?")
# The descriptor lists the game loads entries of, as the C++ resource manager names them.
DESCRIPTOR_LISTS = ("images", "imagesSeq", "fonts", "styles", "audioEvents", "idatas", "elements", "movies", "rtfs")
# An exported file's path: relative, of plain names, without traversal.
EXPORT_PATH = re.compile(r"^(?!.*\.\.)[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$")
MAX_EXPORT_FILES = 500
MAX_EXPORT_BYTES = 8 * 1024 * 1024
# The browser game's screenshots, by workspace: PNG images of its screen, at most this large.
SCREENSHOTS_FOLDER = "screenshots"
MAX_SCREENSHOT_BYTES = 16 * 1024 * 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# The C++ sources an export copies: sources, headers and their build files.
CPP_FILE = re.compile(r"(\.(h|hpp|cpp|inl|txt|json|cmake)|/\.clang-format)$")
MAX_CPP_FILES = 2000
# The browser game's sources, there where the app runs from its sources, and its TypeScript-to-C++ translator, which runs
# on Node.js.
GAME_SOURCES = Path(__file__).resolve().parents[2] / "frontend" / "src" / "game"
TRANSLATOR = GAME_SOURCES / "export" / "translator" / "translate.mjs"
GAME_SOURCE_PATH = re.compile(r"^(?!.*\.\.)[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*\.(ts|vue)$")
TS_PATH = re.compile(r"^(alpha_family|plugins)(/[A-Za-z0-9_.-]+)+\.ts$")
TRANSLATE_TIMEOUT = 300
# The import of the C++ game sources' changes into the TypeScript (frontend/src/game/export/import-cpp.mjs), its report;
# and the Claude Code agents: porting those changes into the TypeScript, or an export's TypeScript changes the
# translator could not translate into its C++ (export-agent.mjs), one at a time, in the background (an agent takes
# minutes per file).
IMPORTER = GAME_SOURCES / "export" / "import-cpp.mjs"
# The ported files, which the import can update: those of alpha_family/ and plugins/, and the others the manifest tracks
# (port-manifest.mjs's PORTS), such as the engine's NumberFormatter.
PORT_MANIFEST = GAME_SOURCES / "export" / "PortManifest.json"
EXPORT_AGENT = GAME_SOURCES / "export" / "export-agent.mjs"
GAME_IMPORTER = GAME_SOURCES / "export" / "import-game.mjs"
PLUGIN_NAME = re.compile(r"^[a-z0-9_]{1,64}$")
IMPORT_REPORT_TIMEOUT = 300
AGENT_LOG_LINES = 400
CLAUDE_MISSING = "Porting with an agent needs Claude Code (the claude command), on the app's PATH or where its installer puts it"
# The /game-sync command (.claude/commands/game-sync.md), which the Play page's Port with Claude Code runs for the
# workspace's game in a headless Claude Code session (claude -p) in the app's sources, as a terminal session would, in
# auto mode. Its scratch folders are in the app data folder's game-syncs.
APP_SOURCES = GAME_SOURCES.parents[2]
GAME_SYNC_COMMAND = APP_SOURCES / ".claude" / "commands" / "game-sync.md"
GAME_SYNCS_FOLDER = "game-syncs"
VIEW_LAYOUT_SKILL = APP_SOURCES / ".claude" / "skills" / "view-layout" / "SKILL.md"
MAX_LAYOUT_IMAGE_BYTES = 16 * 1024 * 1024
GAME_SYNC_HEADLESS = """

## Headless

The Play page's Port with Claude Code button started you (`claude -p`), and no one can answer a question while you work:

- Where the documents say to stop and ask the user, stop there, change nothing more, and end your report with the
  question.
- Write the games repository's path in full in commands (`{games}`), not as a shell variable: the sync's commands
  are allowed by their text, and the others are decided without asking.
- Your scratch folder is `{scratch}`.
- Do not commit. Your last message is the report the page shows.
"""
_agent_lock = threading.Lock()
_agent_job: dict = {"running": False, "kind": None, "log": [], "result": None, "error": None, "files": []}


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

    def workspace_id(self) -> str:
        """The active workspace's id: whose game the browser game plays."""
        return self.library._active_workspace()[0]  # pylint: disable=protected-access

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
            # the descriptor files, relative to the game folder: the browser game watches them, and reads them again
            "descriptorFiles": sorted(os.path.relpath(path, game.resolve()) for path in documents),
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

    def stamps(self, files: list[str]) -> dict:
        """When each file of the game's resources last changed, by its path relative to the game folder, as the
        descriptors name it: the browser game's FileWatch reloads a view whose file's stamp changes. A missing file has
        none."""
        if len(files) > MAX_WATCHED_FILES or any(len(file) > 4096 for file in files):
            raise AppError(f"At most {MAX_WATCHED_FILES} files, of paths up to 4096 characters, can be watched", 400)
        _workspace_id, _workspace, resources, game = self._folders()
        stamps: dict[str, str | None] = {}
        for file in files:
            target = os.path.normpath(os.path.join(game, file))
            if os.path.isabs(file) or not contained(str(resources), target):
                raise AppError("Only the files of the game's resources can be watched", 403)
            try:
                stat = os.stat(safe_path(str(resources), os.path.relpath(target, resources)))
                stamps[file] = f"{stat.st_mtime_ns}:{stat.st_size}"
            except FileNotFoundError:
                stamps[file] = None
        return {"stamps": stamps}

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

    def _importer(self) -> tuple[str, Path]:
        node = shutil.which("node")
        if not node or not IMPORTER.is_file():
            raise AppError("Importing the C++ changes needs the app's sources and Node.js", 501)
        root = self._cpp_root(self._folders()[2])
        if not root.is_dir():
            raise AppError("The C++ game sources do not exist", 404)
        return node, root

    def import_report(self) -> dict:
        """The ported files whose C++ changed since they were ported: their C++ files, the commits and the diff's size."""
        node, root = self._importer()
        try:
            result = subprocess.run([node, str(IMPORTER), str(root), "--json"], cwd=IMPORTER.parents[3], capture_output=True, text=True,
                                    timeout=IMPORT_REPORT_TIMEOUT, check=False)
        except subprocess.TimeoutExpired as error:
            raise AppError("Comparing the C++ took too long", 504) from error
        if result.returncode:
            raise AppError(f"The import failed: {result.stderr.strip()[-2000:]}", 500)
        return json.loads(result.stdout)

    def start_import(self, files: list[str]) -> dict:
        """Starts a Claude Code agent porting the C++ changes of these ported files (all with C++ changes, when none) into
        their TypeScript, in the background; agent_status follows it."""
        node, root = self._importer()
        if not find_claude():
            raise AppError(CLAUDE_MISSING, 501)
        for file in files:
            if not _ported(file):
                raise AppError(f"Not a ported TypeScript file of the browser game: {file}", 403)
        return _start_agent("import", [node, str(IMPORTER), str(root), "--agent", "--json", *files], files)

    def start_game_sync(self) -> dict:
        """Starts the /game-sync command for the workspace's game (the plugin its id names) in a headless Claude Code
        session in the app's sources, in the background, as a terminal session runs it: it syncs the shared libraries
        and the game, checks and plays them, and reports, without committing; agent_status follows it."""
        _node, root = self._importer()
        claude = find_claude()
        if not claude:
            raise AppError(CLAUDE_MISSING, 501)
        plugin = self.workspace_id()
        if not PLUGIN_NAME.match(plugin) or not (GAME_SOURCES / "alpha_family" / "plugins" / plugin).is_dir():
            raise AppError(f"The browser game has no {plugin}: import the game first", 404)
        if not GAME_SYNC_COMMAND.is_file():
            raise AppError("The game sync needs the app's sources (.claude/commands/game-sync.md)", 501)
        games = root.parent
        scratch = Path(self.library.home) / GAME_SYNCS_FOLDER / f"{plugin}-{int(time.time())}"
        scratch.mkdir(parents=True, exist_ok=True)
        prompt = game_sync_prompt(plugin, games, scratch)
        command = [claude, "-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "auto",
                   "--add-dir", str(scratch), "--allowedTools", *game_sync_tools(games)]
        return _start_agent("game-sync", command, [plugin], run=lambda: _run_claude(command, prompt))

    def start_view_layout(self, workspace: str, image: bytes, instructions: str = "", *, model: str = "opus") -> dict:
        """Run view-layout with an uploaded preview and retain every session response for the layout page."""
        if model not in {"opus", "sonnet", "haiku"}:
            raise AppError("Choose Opus, Sonnet or Haiku for View layout")
        workspace_id, entry, resources, game = self._folders()
        if workspace != workspace_id:
            raise AppError("The workspace changed. Select the preview again for the current workspace.", 409)
        claude = find_claude()
        if not claude:
            raise AppError("View layout needs Claude Code (the claude command) installed on this computer", 501)
        if not VIEW_LAYOUT_SKILL.is_file():
            raise AppError("View layout needs the app's sources (.claude/skills/view-layout/SKILL.md)", 501)
        if not image or len(image) > MAX_LAYOUT_IMAGE_BYTES:
            raise AppError("A layout preview must be between 1 byte and 16 MB", 413)
        try:
            with Image.open(io.BytesIO(image)) as preview:
                suffix = {"PNG": ".png", "JPEG": ".jpg", "DDS": ".dds"}.get(preview.format)
                if not suffix:
                    raise AppError("Choose a PNG, JPEG or DDS preview")
                preview.verify()
        except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as error:
            raise AppError("The layout preview is not a valid PNG, JPEG or DDS image") from error
        if not game.is_dir():
            raise AppError("The game folder of this workspace does not exist", 404)
        # Reject concurrent starts before saving a preview; _start_agent also checks under its lock.
        if agent_status()["running"]:
            raise AppError("An agent is running", 409)
        parent = Path(self.library.home) / "view-layouts"
        parent.mkdir(parents=True, exist_ok=True)
        scratch = Path(tempfile.mkdtemp(prefix="layout-", dir=parent))
        preview_path = scratch / f"preview{suffix}"
        preview_path.write_bytes(image)
        arguments = [str(preview_path), workspace]
        prompt = "/view-layout " + shlex.join(arguments)
        context = (
            f"Follow the view-layout skill at {json.dumps(str(VIEW_LAYOUT_SKILL))}.\n"
            "The application supplied these authoritative inputs; use them instead of another workspace configuration:\n"
            + json.dumps({"workspace": workspace, "name": entry.get("game_name", workspace), "game_path": str(game),
                          "games_root_path": str(resources.parent), "config": self.library.config_path,
                          "preview": str(preview_path), "scratch": str(scratch)}, indent=2)
            + "\n\n## Headless execution\n"
            "The View layout page started this session. No one can answer questions during execution. "
            "If the skill requires confirmation or clarification, stop before that action and put the question in your report. "
            "Keep all the skill's scope restrictions. When its execute conditions fail, such as uncommitted changes in the "
            "games repository, stop before any layout work, change nothing and report what failed. "
            "Only edit the selected game's views within the skill's permitted scope. "
            "Do not commit. Keep drawings in the supplied scratch folder. Report progress and the complete result.\n"
            f"\nUser's layout instructions:\n{instructions or 'Match the preview; infer the visible views and state using the skill.'}\n"
        )
        tools = ["Skill(view-layout)", "Read", "Grep", "Glob", "Edit",
                 "Bash(.venv/bin/python -I .claude/skills/view-layout/view_layout.py:*)",
                 "Bash(.venv/bin/python -I .claude/skills/view-layout/execute_conditions.py:*)",
                 f"Bash(git -C {resources.parent} status:*)", f"Bash(git -C {resources.parent} diff:*)",
                 "Bash(node tests/tetra-panel/run.mjs:*)"]
        command = [claude, "-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "auto",
                   "--model", model, "--append-system-prompt", context,
                   "--add-dir", str(scratch), str(resources.parent), "--allowedTools", *tools]
        execution = {"invocation": {"skill": "view-layout", "arguments": arguments, "validated": False},
                     "startedAt": time.time(), "durationSeconds": None, "calls": [], "changedFiles": None,
                     "conditions": None, "result": None, "warnings": [], "gamePath": str(game),
                     "requestedModel": model, "model": None}
        env = _agent_env()
        env[AUDIT_ENV] = str(scratch / "helper-calls.jsonl")
        env[CONTEXT_ENV] = json.dumps({"arguments": arguments, "previewSha256": fingerprint(preview_path),
                                       "config": self.library.config_path})
        try:
            return _start_agent("view-layout", command, [workspace], execution=execution,
                                run=lambda: _run_layout(command, prompt, env, game, scratch))
        except AppError:
            shutil.rmtree(scratch)
            raise

    def view_layout_preview_path(self, file: str) -> str:
        """A saved layout preview, restricted to the application's layout run folders."""
        root = str(Path(self.library.home) / "view-layouts")
        target = os.path.abspath(file)
        if not os.path.isabs(file) or not contained(root, target):
            raise AppError("Only saved View layout previews can be opened", 403)
        parts = Path(os.path.relpath(target, root)).parts
        if (len(parts) != 2 or not re.fullmatch(r"layout-[A-Za-z0-9_-]+", parts[0])
                or parts[1] not in {"preview.png", "preview.jpg", "preview.dds"}):
            raise AppError("Only saved View layout previews can be opened", 403)
        path = safe_path(root, os.path.join(*parts))
        if not os.path.isfile(path):
            raise AppError("The saved layout preview no longer exists", 404)
        return path

    def game_imports(self) -> dict:
        """The C++ games of the family (games/game/alpha_family/plugins/<plugin>/src/Egt) and how much of each the browser
        game has: its TypeScript files (frontend/src/game/alpha_family/plugins/<plugin>), and the active workspace's."""
        _node, root = self._importer()
        plugins = root / "alpha_family" / "plugins"
        games = []
        for folder in sorted(plugins.iterdir()) if plugins.is_dir() else []:
            source = folder / "src" / "Egt"
            if not source.is_dir() or not PLUGIN_NAME.match(folder.name):
                continue
            ported = GAME_SOURCES / "alpha_family" / "plugins" / folder.name
            games.append({
                "plugin": folder.name,
                "cppFiles": sum(1 for path in source.rglob("*.h") if path.is_file()),
                "tsFiles": sum(1 for path in ported.rglob("*.ts") if path.is_file()) if ported.is_dir() else 0,
            })
        return {"games": games, "workspace": self._folders()[0]}

    def game_import_plan(self, plugin: str) -> dict:
        """How a C++ game of the family imports into the browser game (import-game.mjs): each file copied from a ported
        game, ported by its diff, or ported; and what is imported already."""
        node, root = self._game_importer(plugin)
        try:
            result = subprocess.run([node, str(GAME_IMPORTER), str(root), plugin, "--json"], cwd=GAME_IMPORTER.parents[3], capture_output=True,
                                    text=True, timeout=IMPORT_REPORT_TIMEOUT, check=False)
        except subprocess.TimeoutExpired as error:
            raise AppError("Comparing the C++ took too long", 504) from error
        if result.returncode:
            raise AppError(f"The import failed: {result.stderr.strip()[-2000:]}", 500)
        return json.loads(result.stdout)

    def start_game_import(self, plugin: str, files: list[str], copies_only: bool = False) -> dict:
        """Starts importing a C++ game of the family in the background (import-game.mjs): the copies, and with Claude Code
        the files to port (these, when some are named); agent_status follows it."""
        node, root = self._game_importer(plugin)
        if not copies_only and not find_claude():
            raise AppError(CLAUDE_MISSING, 501)
        for file in files:
            if not TS_PATH.match(file) or ".." in file:
                raise AppError(f"Not a TypeScript file of the browser game: {file}", 403)
        mode = "--copies" if copies_only else "--agent"
        return _start_agent("import-game", [node, str(GAME_IMPORTER), str(root), plugin, mode, "--json", *files], [plugin, *files])

    def _game_importer(self, plugin: str) -> tuple[str, Path]:
        node, root = self._importer()
        if not PLUGIN_NAME.match(plugin) or not (root / "alpha_family" / "plugins" / plugin / "src" / "Egt").is_dir():
            raise AppError(f"No C++ game of the family is named {plugin}", 404)
        if not GAME_IMPORTER.is_file():
            raise AppError("Importing a game needs the app's sources and Node.js", 501)
        return node, root

    def start_export_agent(self, export_id: str) -> dict:
        """Starts a Claude Code agent porting into an export's C++ the TypeScript changes the translator could not
        translate (its export.json's changed), in the background; agent_status follows it."""
        node, root = self._importer()
        if not find_claude():
            raise AppError(CLAUDE_MISSING, 501)
        folder = Path(self.export_path(export_id))
        if not (folder / "export.json").is_file():
            raise AppError("The export has no export.json: export again", 404)
        return _start_agent("export", [node, str(EXPORT_AGENT), str(folder), str(root), "--json"], [export_id])

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
        return {"folder": str(folder), "id": folder.name, "files": sorted([*files, *copies])}

    def export_path(self, export_id: str, file: str | None = None) -> str:
        """The folder of an export of the active workspace, by its id (its folder name), or a file of it."""
        workspace_id = self._folders()[0]
        if not EXPORT_ID.fullmatch(export_id):
            raise AppError("Invalid export")
        folder = Path(self.library.home) / EXPORTS_FOLDER / workspace_id / export_id
        if not folder.is_dir():
            raise AppError("Export not found", 404)
        if file is None:
            return str(folder)
        if not EXPORT_PATH.match(file):
            raise AppError(f"Invalid export path: {file}")
        path = safe_path(str(folder), file)
        if not os.path.isfile(path):
            raise AppError(f"{file} is not in the export", 404)
        return path

    def save_screenshot(self, workspace_id: str, image: bytes) -> dict:
        """Write a screenshot of a workspace's browser game (a PNG image of its screen) to the
        app data folder's screenshots, outside the repository and the games, named as the C++
        ScreenshotsManager names the main viewport's (screenshot_main_ and the time in UTC), and
        return where it is."""
        if len(image) > MAX_SCREENSHOT_BYTES:
            megabytes = MAX_SCREENSHOT_BYTES // (1024 * 1024)
            raise AppError(f"A screenshot is larger than {megabytes} MB", 413)
        if not image.startswith(PNG_SIGNATURE) or image[12:16] != b"IHDR":
            raise AppError("A screenshot is a PNG image")
        folder = Path(self.library.home) / SCREENSHOTS_FOLDER / workspace_id
        folder.mkdir(parents=True, exist_ok=True)
        stem = f"screenshot_main_{time.strftime('%Y-%m-%dT%H%M%SZ', time.gmtime())}"
        for number in range(1, 1000):
            path = folder / (f"{stem}.png" if number == 1 else f"{stem}_{number}.png")
            try:
                with open(path, "xb") as file:
                    file.write(image)
            except FileExistsError:
                continue
            return {"file": str(path), "folder": str(folder)}
        raise AppError("Too many screenshots in one second", 429)


def agent_status(*, summary: bool = False) -> dict:
    """The running or last agent: what it does (import, export), whether it runs, its progress log, and its report
    (ported, failed) when it ended."""
    with _agent_lock:
        keys = ("running", "kind", "files") if summary else _agent_job.keys()
        return {key: copy.deepcopy(_agent_job[key]) for key in keys}


def _ported(file: str) -> bool:
    """Whether a TypeScript file of the browser game ports C++ that the import can port it again from: one of
    alpha_family/ or plugins/, or another that the port manifest tracks."""
    if ".." in file:
        return False
    if TS_PATH.match(file):
        return True
    try:
        return file in json.loads(PORT_MANIFEST.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False


def find_claude() -> str | None:
    """The claude command: on the PATH, else where Claude Code's installers put it. An app started from an IDE or a
    desktop launcher may lack the shell's PATH, such as the nvm folder a shell's profile adds."""
    found = shutil.which("claude")
    if found:
        return found
    home = Path.home()
    nvm = sorted(home.glob(".nvm/versions/node/*/bin/claude"), key=lambda path: _version(path.parents[1].name), reverse=True)
    for path in (home / ".local" / "bin" / "claude", home / ".claude" / "local" / "claude", *nvm, home / ".npm-global" / "bin" / "claude"):
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)
    return None


def _version(name: str) -> tuple[int, ...]:
    return tuple(int(part) for part in re.findall(r"\d+", name))


def _agent_env() -> dict[str, str]:
    """An agent's environment: the app's, with the claude command's folder on the PATH, as the import scripts run it by
    name."""
    env = dict(os.environ)
    claude = find_claude()
    path = env.get("PATH", "")
    if claude and str(Path(claude).parent) not in path.split(os.pathsep):
        env["PATH"] = os.pathsep.join(item for item in (str(Path(claude).parent), path) if item)
    return env


def game_sync_prompt(plugin: str, games: Path, scratch: Path) -> str:
    """The /game-sync command's prompt for a game, as Claude Code expands it (without its front matter), and what a
    headless session does differently."""
    text = re.sub(r"\A---\n.*?\n---\n", "", GAME_SYNC_COMMAND.read_text(encoding="utf-8"), flags=re.S)
    return text.replace("$ARGUMENTS", plugin).strip() + GAME_SYNC_HEADLESS.format(games=games, scratch=scratch)


def game_sync_tools(games: Path) -> list[str]:
    """The commands of a game sync (game_sync.md, library_sync.md), allowed by their text: git's reading commands in the
    app's sources, the games repository and hat_libs, the export's tools, the type check, the tests, the build and the
    playthrough."""
    reads = ("status", "log", "diff", "show", "ls-tree", "ls-files", "rev-parse", "merge-base", "branch --show-current", "submodule status")
    commands = [f"{git} {read}" for git in ("git", f"git -C {games}", f"git -C {games}/hat_libs") for read in reads]
    commands += ["node frontend/src/game/export/import-cpp.mjs", "node frontend/src/game/export/port-manifest.mjs",
                 "node frontend/src/game/export/translator/compare.mjs", "cd frontend && npm run typecheck", "npm run typecheck",
                 "cd frontend && node src/game/hat_libs/tweeny/tests/run.mjs", ".venv/bin/python -m pytest",
                 ".venv/bin/python scripts/build.py", ".venv/bin/python -I docs/code_sync/play_check.py",
                 "ls", "grep", "head", "tail", "wc", "sort", "diff"]
    return ["Read", "Grep", "Glob", *(f"Bash({command}:*)" for command in commands)]


def _start_agent(kind: str, command: list[str], files: list[str], run=None, execution=None) -> dict:
    with _agent_lock:
        if _agent_job["running"]:
            raise AppError("An agent is running", 409)
        _agent_job.update(running=True, kind=kind, log=[], result=None, error=None, files=list(files), execution=execution)
    threading.Thread(target=run or (lambda: _run_agent(command)), daemon=True).start()
    return agent_status()


def _run_claude(command: list[str], prompt: str, *, full_output: bool = False, env=None, finish_job: bool = True) -> None:
    """A headless Claude Code session (claude -p, stream-json): each of its steps in the log as it comes, and its last
    message, the report, as the result."""
    final = None
    try:
        with subprocess.Popen(command, cwd=APP_SOURCES, env=env if env is not None else _agent_env(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, text=True) as process:
            process.stdin.write(prompt)
            process.stdin.close()
            for line in process.stdout:
                try:
                    event = json.loads(line)
                except ValueError:
                    event = None
                if isinstance(event, dict) and event.get("type") == "result":
                    final = event
                    if not full_output:
                        continue
                entries = (_session_output(event) if full_output else _session_log(event)) if isinstance(event, dict) else [line.rstrip("\n")]
                reported_model = _session_model(event) if isinstance(event, dict) else None
                with _agent_lock:
                    if full_output and _agent_job["kind"] == "view-layout" and reported_model:
                        execution = _agent_job["execution"]
                        # Result usage may include helper models; only use it when the main session never reported one.
                        if event.get("type") != "result" or not execution["model"]:
                            execution["model"] = reported_model
                    _agent_job["log"].extend(entry for entry in entries if entry)
                    if not full_output:
                        del _agent_job["log"][:-AGENT_LOG_LINES]
        with _agent_lock:
            if final and not final.get("is_error") and not process.returncode:
                _agent_job["result"] = {"report": final.get("result") or "", "cost": final.get("total_cost_usd"),
                                        "turns": final.get("num_turns")}
            else:
                reason = (final or {}).get("result") or " ".join(_agent_job["log"][-3:])
                _agent_job["error"] = f"Claude Code failed ({process.returncode}): {reason}"
    except OSError as error:
        with _agent_lock:
            _agent_job["error"] = f"Claude Code did not run: {error}"
    finally:
        if finish_job:
            with _agent_lock:
                _agent_job["running"] = False


def _session_model(event: dict) -> str | None:
    """The model Claude reports for the main session, excluding nested agents' models."""
    if event.get("parent_tool_use_id"):
        return None
    model = None
    if event.get("type") == "system" and event.get("subtype") == "init":
        model = event.get("model")
    elif event.get("type") == "assistant" and isinstance(event.get("message"), dict):
        model = event["message"].get("model")
    elif event.get("type") == "result":
        usage = event.get("modelUsage")
        if isinstance(usage, dict) and len(usage) == 1:
            model = next(iter(usage))
    return model.strip() if isinstance(model, str) and model.strip() and not model.startswith("<") else None


def _layout_event(event: dict) -> None:
    """Publish actual helper activity without truncating Claude's own responses."""
    with _agent_lock:
        execution = _agent_job["execution"]
        call = next((item for item in execution["calls"] if item["id"] == event["id"]), None)
        if event["event"] == "started":
            execution["calls"].append({**event, "durationSeconds": None, "exitCode": None})
            _agent_job["log"].append(f"{event.get('helper', 'view_layout.py')} started:\n" + shlex.join(event["argv"]))
        elif event["event"] == "finished" and call:
            call.update({key: value for key, value in event.items() if key != "event"})
            _agent_job["log"].append(f"{call.get('helper', 'view_layout.py')} finished ({event['durationSeconds']:.3f}s, "
                                     f"exit {event['exitCode']}):\n"
                                     + shlex.join(call["argv"]))
        elif event["event"] == "conditions":
            execution["conditions"] = {"passed": event["passed"], "failed": event["failed"]}
            _agent_job["log"].append(f"Execute conditions failed: {', '.join(event['failed'])}" if event["failed"]
                                     else "Execute conditions hold: " + ", ".join(event["passed"]))
        elif event["event"] == "validated" and event["arguments"] == execution["invocation"]["arguments"]:
            execution["invocation"]["validated"] = True
            _agent_job["log"].append("view-layout skill arguments validated (preview image, workspace id):\n"
                                     + json.dumps(event["arguments"], ensure_ascii=False))


def _layout_result(execution: dict, error: str | None) -> str:
    """How a View layout run ended, in one sentence, for the page's execution summary."""
    changes = execution["changedFiles"]
    count = None if changes is None else len(changes)
    files = f"{count} view file{'' if count == 1 else 's'}"
    failed = (execution.get("conditions") or {}).get("failed") or []
    if failed:
        condition = f"the execute condition{'s' if len(failed) > 1 else ''} {', '.join(failed)} failed"
        return (f"Stopped before any layout work: {condition}, so nothing changed." if count == 0
                else f"Stopped: {condition}, but {files} changed." if count
                else f"Stopped: {condition}; the changed view files could not be determined.")
    if error:
        return ("Failed with an error, and no view file changed." if count == 0
                else f"Failed with an error after {files} changed." if count
                else "Failed with an error; the changed view files could not be determined.")
    return ("Finished without changing any view file." if count == 0
            else f"Finished: {files} changed." if count
            else "Finished, but the changed view files could not be determined.")


def _run_layout(command: list[str], prompt: str, env: dict, game: Path, scratch: Path) -> None:
    """Trace the helper while Claude runs, then compare view contents before marking the job finished."""
    started = time.perf_counter()
    stop = threading.Event()
    audit = Path(env[AUDIT_ENV])

    def warning(message):
        with _agent_lock:
            _agent_job["execution"]["warnings"].append(message)
            _agent_job["log"].append(message)

    def collect():
        offset = 0
        while True:
            try:
                if audit.exists():
                    with audit.open(encoding="utf-8") as stream:
                        stream.seek(offset)
                        while line := stream.readline():
                            if not line.endswith("\n"):
                                break  # A helper may still be writing this record.
                            offset = stream.tell()
                            _layout_event(json.loads(line))
            except (OSError, ValueError, KeyError, TypeError) as error:
                warning(f"Helper trace could not be read: {error}")
                return
            if stop.is_set():
                return
            stop.wait(0.1)

    monitor = threading.Thread(target=collect, daemon=True)
    before = None
    try:
        before = view_snapshot(game)
        monitor.start()
        _run_claude(command, prompt, full_output=True, env=env, finish_job=False)
    except Exception as error:  # Keep failed sessions inspectable, including failures before Claude starts.
        with _agent_lock:
            _agent_job["error"] = f"View layout failed: {error}"
    finally:
        stop.set()
        if monitor.ident is not None:
            monitor.join()
        try:
            changes = changed_files(before, view_snapshot(game)) if before is not None else None
        except OSError as error:
            changes = None
            warning(f"Changed files could not be compared: {error}")
        with _agent_lock:
            execution = _agent_job["execution"]
            execution.update(durationSeconds=time.perf_counter() - started, changedFiles=changes)
            if not execution["invocation"]["validated"] and not _agent_job["error"]:
                _agent_job["error"] = "Claude Code ended without validating the view-layout skill's preview and workspace arguments."
            execution["result"] = _layout_result(execution, _agent_job["error"])
            incomplete = sum(call["durationSeconds"] is None for call in execution["calls"])
            if incomplete:
                execution["warnings"].append(f"{incomplete} helper call(s) did not report completion; their duration is unknown.")
            _agent_job["log"].append(f"View layout total time: {execution['durationSeconds']:.3f}s\nChanged view files:\n"
                                     + ("\n".join(f"{item['change']}: {item['path']}" for item in changes) or "None"
                                        if changes is not None else "Could not determine changes"))
            try:
                (scratch / "execution.json").write_text(json.dumps(execution, indent=2), encoding="utf-8")
            except OSError as error:
                execution["warnings"].append(f"Execution summary could not be saved: {error}")
            _agent_job["running"] = False


def _session_output(event: dict) -> list[str]:
    """Readable complete output, including successful tools and unfamiliar response types, without truncation."""
    message = event.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, list):
        lines = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                lines.append(f"{event.get('type', 'message')}:\n{block.get('text', '')}")
            else:
                lines.append(json.dumps(block, ensure_ascii=False, indent=2))
        return lines or [json.dumps(event, ensure_ascii=False, indent=2)]
    return [json.dumps(event, ensure_ascii=False, indent=2)]


def _session_log(event: dict) -> list[str]:
    """A session's event as log lines: its start, what it says, the tools it calls (a command by its description), and
    the calls refused or failed."""
    if event.get("type") == "system" and event.get("subtype") == "init":
        return [f"Claude Code started ({event.get('model') or 'its default model'})"]
    lines = []
    message = event.get("message") if isinstance(event.get("message"), dict) else {}
    for block in message.get("content") or []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text" and event.get("type") == "assistant" and str(block.get("text", "")).strip():
            lines.append(str(block["text"]).strip().splitlines()[0][:300])
        elif block.get("type") == "tool_use":
            given = block.get("input") if isinstance(block.get("input"), dict) else {}
            detail = str(given.get("description") or given.get("command") or given.get("file_path") or given.get("pattern") or "").strip()
            lines.append(f"{block.get('name')}: {detail.splitlines()[0][:200]}" if detail else str(block.get("name")))
        elif block.get("type") == "tool_result" and block.get("is_error"):
            content = block.get("content")
            text = content if isinstance(content, str) else " ".join(
                str(item.get("text", "")) for item in content or [] if isinstance(item, dict))
            lines.append(f"  refused or failed: {text.strip().splitlines()[0][:200]}" if text.strip() else "  failed")
    return lines


def _run_agent(command: list[str]) -> None:
    try:
        process = subprocess.Popen(command, cwd=IMPORTER.parents[3], env=_agent_env(), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   text=True)
        for line in process.stderr:
            with _agent_lock:
                _agent_job["log"].append(line.rstrip("\n"))
                del _agent_job["log"][:-AGENT_LOG_LINES]
        output = process.stdout.read()
        process.wait()
        with _agent_lock:
            if process.returncode:
                _agent_job["error"] = f"The agent failed ({process.returncode}): {' '.join(_agent_job['log'][-3:])}"
            else:
                _agent_job["result"] = json.loads(output)
    except (OSError, ValueError) as error:
        with _agent_lock:
            _agent_job["error"] = f"The agent failed: {error}"
    finally:
        with _agent_lock:
            _agent_job["running"] = False


def game_source_path(file: str) -> str:
    """A TypeScript or Vue file of the browser game, by its path in frontend/src/game."""
    if not GAME_SOURCE_PATH.match(file):
        raise AppError("Invalid game source path")
    path = safe_path(str(GAME_SOURCES), file)
    if not os.path.isfile(path):
        raise AppError("The game's sources are not here: the app does not run from its sources" if not GAME_SOURCES.is_dir()
                       else "Game source not found", 404)
    return path


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
