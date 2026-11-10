"""The browser game's files: the game project (modules config and descriptors), its JSON data and its exports."""

import base64
import io
import json
import re
import shutil
import shlex
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from egt_gda_sync.app.server import create_app
from egt_gda_sync.game.project import GAME_SOURCES
from egt_gda_sync.workspace.library import Library
from tests.conftest import session_headers
from tests.test_asset_report import write_game


@pytest.fixture
def client(tmp_path):
    game = write_game(tmp_path)
    (game / "math").mkdir()
    (game / "math" / "rules.json").write_text(json.dumps({"rowsCount": 3}))
    (game / "math" / "broken.json").write_text("{")
    (game / "RssIData.json").write_text(json.dumps({"idatas": [{"id": "Rules", "dataType": "Game", "path": "math/rules.json"}]}))
    modules = tmp_path / "configs" / "example" / "modules"
    modules.mkdir(parents=True)
    (modules / "ExampleModules.json").write_text(json.dumps({"plugins": [], "modules": [
        {"name": "ExampleMath", "space": "Egt::Game::AlphaFamily", "config": {"setups": [{"id": "a"}]}}]}))
    family = tmp_path / "configs" / "alpha_family" / "modules"
    family.mkdir(parents=True)
    (family / "AlphaGameModules.json").write_text(json.dumps({"modules": [{"name": "CappingSplashView", "config": {}}]}))
    (modules / "ExampleDebugModules.json").write_text(json.dumps({"modules": []}))
    (modules / "ModuleManager_Hat.json").write_text(json.dumps({"modules": []}))
    plugin = tmp_path / "game" / "alpha_family" / "plugins" / "example" / "src" / "Egt" / "ExampleView"
    plugin.mkdir(parents=True)
    (plugin / "ExampleView.cpp").write_text("// view\n")
    (plugin / "CMakeLists.txt").write_text("# cmake\n")
    (plugin / "notes.bin").write_bytes(b"\0")
    (tmp_path / "game" / "secret.key").write_text("x")
    gda = tmp_path / "gda"
    gda.mkdir()
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda)}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    opened = []
    folders = []
    with TestClient(create_app(library, dev=True, opener=folders.append, code_opener=lambda file, line: opened.append((file, line))),
                    base_url="http://127.0.0.1") as client:
        client.opened = opened
        client.folders = folders
        client.game = game
        client.home = Path(library.home)
        client.headers.update(session_headers(client))
        yield client


def test_the_project_has_the_modules_config_and_the_descriptors_entries_with_their_files(client):
    project = client.get("/api/game/project").json()
    assert project["workspace"] == {"id": "example", "name": "Example"}
    # The game's own modules config, not a variant's or an integration's.
    assert project["modules"]["file"].endswith("ExampleModules.json")
    assert project["modules"]["config"]["modules"][0]["name"] == "ExampleMath"
    # The family's modules config, by the namespace of the game's modules: Egt::Game::AlphaFamily is alpha_family.
    assert project["familyModules"]["file"].endswith("alpha_family/modules/AlphaGameModules.json")
    assert project["familyModules"]["config"]["modules"][0]["name"] == "CappingSplashView"
    descriptors = project["descriptors"]
    logo = next(image for image in descriptors["images"] if image["id"] == "LOGO")
    assert logo["file"] == str(client.game / "logo.dds") and logo["descriptor"] == "RssImagesData.json"
    # A sequence's {N-M} frames are expanded, each with its source.
    anim = next(sequence for sequence in descriptors["imagesSeq"] if sequence["id"] == "ANIM")
    assert [Path(frame["file"]).name for frame in anim["frames"]] == ["a_0.dds", "a_1.dds", "a_2.dds"]
    atlas = next(sequence for sequence in descriptors["imagesSeq"] if sequence["id"] == "ATLAS")
    assert atlas["frames"][1]["source"] == {"x": 2, "y": 0, "w": 2, "h": 2}
    assert descriptors["audioEvents"][0]["files"] == [str(client.game / "click.wav")]
    assert descriptors["idatas"][0]["path"] == "math/rules.json"
    # the descriptor files, which the game watches and reads again when they change
    assert {"RssImagesData.json", "RssIData.json"} <= set(project["descriptorFiles"])


def test_json_data_of_the_resources_is_read_and_nothing_else(client):
    assert client.get("/api/game/data", params={"file": "math/rules.json"}).json() == {"rowsCount": 3}
    assert client.get("/api/game/data", params={"file": "math/broken.json"}).status_code == 415
    assert client.get("/api/game/data", params={"file": "math/none.json"}).status_code == 404
    # Only JSON files, by a path relative to the game folder, inside the resources folder.
    assert client.get("/api/game/data", params={"file": "click.wav"}).status_code == 403
    assert client.get("/api/game/data", params={"file": "../../workspace.json"}).status_code == 403
    assert client.get("/api/game/data", params={"file": str(client.game / "math" / "rules.json")}).status_code == 403


def test_the_stamps_of_resource_files_change_when_they_are_written(client):
    def stamps(*files):
        response = client.get("/api/game/file-stamps", params={"file": list(files)})
        return response.json()["stamps"] if response.status_code == 200 else response.status_code

    before = stamps("math/rules.json", "math/none.json")
    assert before["math/rules.json"] and before["math/none.json"] is None
    assert stamps("math/rules.json") == {"math/rules.json": before["math/rules.json"]}
    (client.game / "math" / "rules.json").write_text(json.dumps({"rowsCount": 4, "reels": 5}))
    assert stamps("math/rules.json")["math/rules.json"] != before["math/rules.json"]
    # Only the files of the resources, by a path relative to the game folder.
    assert stamps("../../workspace.json") == 403
    assert stamps(str(client.game / "math" / "rules.json")) == 403
    assert stamps(*[f"f{index}.json" for index in range(501)]) == 400


def test_an_export_is_written_to_the_app_data_folder(client):
    files = {"plugins/example/src/Egt/ExampleFsm/ExampleFsm.cpp": "// fsm\n", "README.md": "# Example\n"}
    result = client.post("/api/game/export", json={"name": "Example", "files": files}).json()
    folder = Path(result["folder"])
    assert folder.is_relative_to(client.home / "game-exports" / "example")
    assert (folder / "plugins/example/src/Egt/ExampleFsm/ExampleFsm.cpp").read_text() == "// fsm\n"
    assert result["files"] == sorted(files)
    # A path that leaves the export's folder is refused, and so is an export without the session's token.
    assert client.post("/api/game/export", json={"name": "Example", "files": {"../escape.txt": "x"}}).status_code == 400
    assert client.post("/api/game/export", json={"name": "Example", "files": {"/etc/escape.txt": "x"}}).status_code == 400
    assert client.post("/api/game/export", json={"name": "Example", "files": files}, headers={"x-gda-token": "wrong"}).status_code == 403


def test_a_screenshot_is_saved_to_the_app_data_folder_by_the_time_it_was_taken(client):
    output = io.BytesIO()
    Image.new("RGB", (1920, 1080), (200, 100, 20)).save(output, "PNG")
    png = output.getvalue()
    image = base64.b64encode(png).decode()
    first = client.post("/api/game/screenshot", json={"image": image}).json()
    second = client.post("/api/game/screenshot", params={"workspace": "example"}, json={"image": image}).json()
    folder = client.home / "screenshots" / "example"
    assert first["folder"] == str(folder)
    # Named as the C++ ScreenshotsManager names the main viewport's: the time in UTC, a number for one of the same second.
    assert re.fullmatch(r"screenshot_main_\d{4}-\d\d-\d\dT\d{6}Z\.png", Path(first["file"]).name)
    assert Path(second["file"]).parent == folder and second["file"] != first["file"]
    assert Path(first["file"]).read_bytes() == png and Path(second["file"]).read_bytes() == png
    # Only a PNG image, in base64, of a workspace's game, with the session's token.
    assert client.post("/api/game/screenshot", json={"image": base64.b64encode(b"GIF89a").decode()}).status_code == 400
    assert client.post("/api/game/screenshot", json={"image": "not base64!"}).status_code == 400
    assert client.post("/api/game/screenshot", params={"workspace": "../escape"}, json={"image": image}).status_code == 404
    assert client.post("/api/game/screenshot", json={"image": image}, headers={"x-gda-token": "wrong"}).status_code == 403
    assert sorted(path.name for path in folder.iterdir()) == sorted([Path(first["file"]).name, Path(second["file"]).name])


def test_an_exports_folder_and_its_readme_open(client):
    result = client.post("/api/game/export", json={"name": "Example", "files": {"README.md": "# Example\n"}}).json()
    assert result["id"] == Path(result["folder"]).name
    assert client.post("/api/game/open-export", json={"id": result["id"]}).json() == {"opened": True}
    assert client.folders == [result["folder"]]
    assert client.post("/api/game/open-export", json={"id": result["id"], "file": "README.md"}).json() == {"opened": True}
    assert client.opened == [(str(Path(result["folder"]) / "README.md"), 1)]
    # Only the exports of the active workspace, and the files in them.
    for body in [{"id": "../example"}, {"id": "Example-1"}, {"id": ".."}, {"id": result["id"], "file": "../README.md"},
                 {"id": result["id"], "file": "/etc/passwd"}, {"id": result["id"], "file": "missing.md"}]:
        assert client.post("/api/game/open-export", json=body).status_code in (400, 404), body
    assert len(client.folders) == 1 and len(client.opened) == 1


def test_the_cpp_sources_of_a_plugin_are_listed_and_copied_into_an_export(client):
    listing = client.get("/api/game/cpp", params={"folder": "alpha_family/plugins/example"}).json()
    # Only sources, headers and build files, by their paths in the C++ game sources.
    assert listing["files"] == ["alpha_family/plugins/example/src/Egt/ExampleView/CMakeLists.txt",
                                "alpha_family/plugins/example/src/Egt/ExampleView/ExampleView.cpp"]
    assert client.get("/api/game/cpp", params={"folder": "alpha_family/plugins/none"}).json()["exists"] is False
    assert client.get("/api/game/cpp", params={"folder": "../resources"}).status_code == 403
    # A generated file replaces the copy of the same path.
    copies = {"src/Egt/ExampleView/ExampleView.cpp": "alpha_family/plugins/example/src/Egt/ExampleView/ExampleView.cpp",
              "src/Egt/ExampleView/CMakeLists.txt": "alpha_family/plugins/example/src/Egt/ExampleView/CMakeLists.txt"}
    result = client.post("/api/game/export", json={"name": "Example", "files": {"src/Egt/ExampleView/ExampleView.cpp": "// generated\n"},
                                                   "copies": copies}).json()
    folder = Path(result["folder"])
    assert (folder / "src/Egt/ExampleView/ExampleView.cpp").read_text() == "// generated\n"
    assert (folder / "src/Egt/ExampleView/CMakeLists.txt").read_text() == "# cmake\n"
    # Nothing but the C++ sources can be copied.
    for source in ["secret.key", "alpha_family/plugins/example/src/Egt/ExampleView/notes.bin", "../workspace.json", "/etc/passwd"]:
        response = client.post("/api/game/export", json={"name": "Example", "files": {"README.md": "x"}, "copies": {"x.cpp": source}})
        assert response.status_code == 403, source


def test_a_line_of_the_browser_games_sources_opens_in_vs_code(client):
    # The developer panel's transitions open where the states asked for them.
    body = {"file": "engine/Fsm/Fsm.ts", "line": 12}
    assert client.post("/api/game/open-source", json=body).json() == {"opened": True}
    assert client.opened == [(str(GAME_SOURCES / "engine" / "Fsm" / "Fsm.ts"), 12)]
    # Only the game's TypeScript and Vue files that exist.
    for file in ["../../../egt_gda_sync/app/server.py", "/etc/passwd", "engine/Fsm/Missing.ts", "README.md", "engine/../GameView.vue"]:
        assert client.post("/api/game/open-source", json={**body, "file": file}).status_code in (400, 403, 404), file
    for line in (0, -1, True, "12"):
        assert client.post("/api/game/open-source", json={**body, "line": line}).status_code == 400
    assert len(client.opened) == 1


@pytest.mark.skipif(not shutil.which("node"), reason="the translator runs on Node.js")
def test_typescript_states_are_translated_against_the_cpp_game_sources(client):
    # Only TypeScript of the browser game's alpha_family/ and plugins/ folders.
    assert client.post("/api/game/translate", json={"files": ["../../../etc/passwd.ts"]}).status_code == 403
    assert client.post("/api/game/translate", json={"files": ["engine/Fsm/Fsm.ts"]}).status_code == 403
    # The example's C++ sources have none of the states library's headers: the state is not translated, and says why.
    state = "alpha_family/libs/AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundInput.ts"
    result = client.post("/api/game/translate", json={"files": [state]}).json()
    assert result["files"] == {} and state in result["errors"]


FAKE_IMPORTER = """
const agent = process.argv.includes('--agent');
const files = process.argv.slice(3).filter(arg => !arg.startsWith('--'));
if (agent) console.error('porting ' + (files[0] ?? 'all') + ' with Claude Code...');
process.stdout.write(JSON.stringify({ head: 'abc', changed: [{ ts: 'alpha_family/x.ts', cpp: ['alpha_family/x.h'] }],
  ported: agent ? [{ ts: 'alpha_family/x.ts' }] : [], failed: [] }));
"""


@pytest.mark.skipif(not shutil.which("node"), reason="the importer runs on Node.js")
def test_the_cpp_changes_are_reported_and_ported_in_the_background(client, tmp_path, monkeypatch):
    from egt_gda_sync.game import project
    importer = tmp_path / "import-cpp.mjs"
    importer.write_text(FAKE_IMPORTER)
    monkeypatch.setattr(project, "IMPORTER", importer)
    (client.game.parent / "game").mkdir(exist_ok=True)
    report = client.get("/api/game/import").json()
    assert report["changed"][0]["ts"] == "alpha_family/x.ts" and report["ported"] == []

    real_which = shutil.which
    monkeypatch.setattr(project.shutil, "which", lambda name: "/usr/bin/claude" if name == "claude" else real_which(name))
    assert client.post("/api/game/import", json={"files": ["../../etc/passwd.ts"]}).status_code == 403
    started = client.post("/api/game/import", json={"files": ["alpha_family/libs/AlphaFamilyVideoCtrl/Components/NumericBarView.ts"]}).json()
    assert started["running"] or started["result"]
    for _ in range(100):
        status = client.get("/api/game/agent/status").json()
        if not status["running"]:
            break
        time.sleep(0.05)
    assert status["result"]["ported"] == [{"ts": "alpha_family/x.ts"}]
    assert status["log"] == ["porting alpha_family/libs/AlphaFamilyVideoCtrl/Components/NumericBarView.ts with Claude Code..."]
    # A port outside alpha_family/ and plugins/ is ported when the manifest tracks it, such as the engine's NumberFormatter.
    assert client.post("/api/game/import", json={"files": ["engine/Game/Utils/Clock.ts"]}).status_code == 403
    assert client.post("/api/game/import", json={"files": ["engine/Game/Utils/NumberFormatter.ts"]}).status_code == 200
    for _ in range(100):
        if not client.get("/api/game/agent/status").json()["running"]:
            break
        time.sleep(0.05)


def test_claude_is_found_where_its_installers_put_it_when_the_path_lacks_it(tmp_path, monkeypatch):
    from egt_gda_sync.game import project
    real_which = shutil.which
    monkeypatch.setattr(project.shutil, "which", lambda name: None if name == "claude" else real_which(name))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("PATH", "/usr/bin")
    assert project.find_claude() is None
    # nvm's newest Node.js that has it (an app started from an IDE lacks the shell's nvm folder)
    for version in ("v9.11.2", "v24.14.0", "v22.12.0"):
        claude = tmp_path / ".nvm" / "versions" / "node" / version / "bin" / "claude"
        claude.parent.mkdir(parents=True)
        claude.write_text("#!/bin/sh\n")
        claude.chmod(0o755)
    newest = str(tmp_path / ".nvm" / "versions" / "node" / "v24.14.0" / "bin" / "claude")
    assert project.find_claude() == newest
    # the agents' scripts run it by name
    assert project._agent_env()["PATH"].split(":") == [str(Path(newest).parent), "/usr/bin"]  # pylint: disable=protected-access


FAKE_CLAUDE = """#!{python}
import json, sys
prompt = sys.stdin.read()
open({record!r}, "w").write(json.dumps({{"argv": sys.argv[1:], "prompt": prompt}}))
for event in [
    {{"type": "system", "subtype": "init", "model": "test-model"}},
    {{"type": "assistant", "message": {{"content": [{{"type": "text", "text": "Reading the procedure.\\nMore."}},
        {{"type": "tool_use", "name": "Bash", "input": {{"command": "node x", "description": "List the C++ changes"}}}}]}}}},
    {{"type": "user", "message": {{"content": [{{"type": "tool_result", "is_error": True, "content": "Permission denied"}}]}}}},
    {{"type": "result", "subtype": "success", "is_error": False, "result": "Synced example.", "total_cost_usd": 0.25, "num_turns": 3}},
]:
    print(json.dumps(event), flush=True)
"""


def test_the_game_sync_runs_the_game_sync_command_for_the_workspaces_game_headless(client, tmp_path, monkeypatch):
    import sys
    from egt_gda_sync.game import project
    real_which = shutil.which
    monkeypatch.setattr(project.shutil, "which", lambda name: None if name == "claude" else real_which(name))
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    assert client.post("/api/game/sync").status_code == 501
    record = tmp_path / "claude.json"
    claude = tmp_path / "bin" / "claude"
    claude.parent.mkdir()
    claude.write_text(FAKE_CLAUDE.format(python=sys.executable, record=str(record)))
    claude.chmod(0o755)
    monkeypatch.setattr(project.shutil, "which", lambda name: str(claude) if name == "claude" else real_which(name))
    # the workspace's game must be ported: its plugin, by the workspace's id
    sources = tmp_path / "sources"
    monkeypatch.setattr(project, "GAME_SOURCES", sources)
    assert client.post("/api/game/sync").status_code == 404
    (sources / "alpha_family" / "plugins" / "example").mkdir(parents=True)

    started = client.post("/api/game/sync").json()
    assert started["kind"] == "game-sync" and started["files"] == ["example"]
    for _ in range(200):
        status = client.get("/api/game/agent/status").json()
        if not status["running"]:
            break
        time.sleep(0.05)
    assert status["error"] is None
    assert status["result"] == {"report": "Synced example.", "cost": 0.25, "turns": 3}
    assert status["log"] == ["Claude Code started (test-model)", "Reading the procedure.", "Bash: List the C++ changes",
                             "  refused or failed: Permission denied"]
    run = json.loads(record.read_text())
    # the command's prompt for the game, without its front matter, and what a headless session does differently
    assert run["prompt"].startswith("Sync the C++ of the game `example`") and "$ARGUMENTS" not in run["prompt"]
    scratch = next((client.home / "game-syncs").iterdir())
    assert scratch.name.startswith("example-") and f"`{scratch}`" in run["prompt"] and "## Headless" in run["prompt"]
    games = tmp_path  # the C++ game sources are its game folder
    assert run["argv"][:6] == ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "auto"]
    assert run["argv"][run["argv"].index("--add-dir") + 1] == str(scratch)
    tools = run["argv"][run["argv"].index("--allowedTools") + 1:]
    assert f"Bash(git -C {games} log:*)" in tools and "Bash(.venv/bin/python -I docs/code_sync/play_check.py:*)" in tools
    assert not any("commit" in tool or "push" in tool for tool in tools)


def layout_preview(format="PNG"):
    image = io.BytesIO()
    Image.new("RGB", (32, 24), "red").save(image, format=format)
    return {"workspace": "example", "image": base64.b64encode(image.getvalue()).decode("ascii")}


def test_view_layout_opens_only_saved_preview_images(client, tmp_path):
    import sys
    preview = client.home / "view-layouts" / "layout-example" / "preview.png"
    preview.parent.mkdir(parents=True)
    preview.write_bytes(base64.b64decode(layout_preview()["image"]))
    endpoint = "/api/game/view-layout/open-preview"
    response = client.post(endpoint, json={"file": str(preview)})
    assert response.status_code == 200 and response.json() == {"opened": True}
    assert client.folders == [str(preview)] and client.opened == []
    outside = tmp_path / "preview.png"
    outside.write_bytes(preview.read_bytes())
    assert client.post(endpoint, json={"file": str(outside)}).status_code == 403
    assert client.post(endpoint, json={"file": str(preview.with_name("execution.json"))}).status_code == 403
    assert client.post(endpoint, json={"file": "view-layouts/layout-example/preview.png"}).status_code == 403
    preview.unlink()
    assert client.post(endpoint, json={"file": str(preview)}).status_code == 404
    if sys.platform != "win32":
        preview.symlink_to(outside)
        assert client.post(endpoint, json={"file": str(preview)}).status_code == 400
    assert client.folders == [str(preview)]


def test_view_layout_validates_the_preview_workspace_and_installation(client, tmp_path, monkeypatch):
    from egt_gda_sync.game import project
    body = layout_preview()
    monkeypatch.setattr(project, "find_claude", lambda: None)
    assert client.post("/api/game/view-layout", json=body).status_code == 501
    monkeypatch.setattr(project, "find_claude", lambda: "/unused/claude")
    assert client.post("/api/game/view-layout", json={**body, "workspace": "another"}).status_code == 409
    for invalid in ("not base64!", base64.b64encode(b"not an image").decode("ascii")):
        response = client.post("/api/game/view-layout", json={**body, "image": invalid})
        assert response.status_code == 400
    assert client.post("/api/game/view-layout", json=layout_preview("GIF")).status_code == 400
    monkeypatch.setattr(project, "MAX_LAYOUT_IMAGE_BYTES", 10)
    assert client.post("/api/game/view-layout", json=body).status_code == 413
    monkeypatch.setattr(project, "MAX_LAYOUT_IMAGE_BYTES", 16 * 1024 * 1024)
    monkeypatch.setattr(project, "VIEW_LAYOUT_SKILL", tmp_path / "missing-skill.md")
    assert client.post("/api/game/view-layout", json=body).status_code == 501
    assert not (client.home / "view-layouts").exists()


def test_view_layout_streams_all_responses_and_runs_the_skill_for_the_selected_workspace(client, tmp_path, monkeypatch):
    import sys
    from egt_gda_sync.game import project
    view = client.game / "v" / "1920x1080" / "LayoutView.json"
    view.parent.mkdir(parents=True, exist_ok=True)
    view.write_text('{"elements": [{"id": "label", "type": "Dummy", "position": {"x": 1, "y": 2}}]}')
    untouched = view.with_name("ExistingEditView.json")
    untouched.write_text('{"name": "Already edited before this run"}')
    deleted = view.with_name("DeletedView.json")
    deleted.write_text('{}')
    record, release = tmp_path / "run.json", tmp_path / "release"
    claude = tmp_path / "claude"
    claude.write_text(f'''#!{sys.executable}
import json, shlex, subprocess, sys, time
from pathlib import Path
prompt = sys.stdin.read()
Path({str(record)!r}).write_text(json.dumps({{"argv": sys.argv[1:], "prompt": prompt, "cwd": str(Path.cwd())}}))
def emit(event):
    print(json.dumps(event), flush=True)
emit({{"type": "assistant", "message": {{"content": [{{"type": "text", "text": "First response.\\n" + "x" * 1000 + "\\nLast line."}}]}}}})
deadline = time.monotonic() + 10
while not Path({str(release)!r}).exists() and time.monotonic() < deadline:
    time.sleep(0.01)
helper = [sys.executable, "-I", ".claude/skills/view-layout/view_layout.py"]
arguments = shlex.split(prompt)[1:]
subprocess.run([*helper, "validate-inputs", *arguments], check=True)
subprocess.run([*helper, "move", {str(view)!r}, "label=31,42"], check=True)
Path({str(deleted)!r}).unlink()
Path({str(view.with_name('AddedView.json'))!r}).write_text('{{}}')
emit({{"type": "user", "message": {{"content": [{{"type": "tool_result", "content": "Successful tool output.\\nSecond line.", "is_error": False}}]}}}})
for number in range(450):
    emit({{"type": "assistant", "message": {{"content": [{{"type": "text", "text": "Step " + str(number)}}]}}}})
print("Diagnostic from stderr", file=sys.stderr, flush=True)
emit({{"type": "system", "subtype": "status", "status": "complete"}})
emit({{"type": "result", "is_error": False, "result": "Layout updated. Full report.", "num_turns": 4, "total_cost_usd": 0.12}})
''')
    claude.chmod(0o755)
    monkeypatch.setattr(project, "find_claude", lambda: str(claude))
    body = {**layout_preview(), "instructions": "Main game: BetBarView."}
    try:
        started = client.post("/api/game/view-layout", json=body)
        assert started.status_code == 200
        assert started.json()["kind"] == "view-layout" and started.json()["files"] == ["example"]
        for _ in range(2000):
            status = client.get("/api/game/agent/status").json()
            if status["log"]:
                break
            time.sleep(0.01)
        assert status["running"] and "First response.\n" + "x" * 1000 + "\nLast line." in status["log"][0]
        assert client.get("/api/game/agent/status", params={"summary": True}).json() == {
            "running": True, "kind": "view-layout", "files": ["example"]}
        # No second run or discarded preview while this session is still working.
        assert client.post("/api/game/view-layout", json=body).status_code == 409
        assert len(list((client.home / "view-layouts").iterdir())) == 1
    finally:
        release.touch()
        for _ in range(2000):
            status = client.get("/api/game/agent/status").json()
            if not status["running"]:
                break
            time.sleep(0.01)
    assert status["error"] is None and not status["running"]
    assert status["result"] == {"report": "Layout updated. Full report.", "turns": 4, "cost": 0.12}
    transcript = "\n".join(status["log"])
    assert len(status["log"]) > 450 and "First response." in transcript and "Step 449" in transcript
    assert "Successful tool output." in transcript and "Second line." in transcript
    assert "Diagnostic from stderr" in transcript and '"status": "complete"' in transcript
    assert "Layout updated. Full report." in transcript
    run = json.loads(record.read_text())
    assert run["cwd"] == str(project.APP_SOURCES)
    context = run["argv"][run["argv"].index("--append-system-prompt") + 1]
    assert str(project.VIEW_LAYOUT_SKILL) in context
    assert str(client.game) in context and str(tmp_path / "workspace.json") in context
    assert "Main game: BetBarView." in context and "stop before that action" in context
    scratch = next((client.home / "view-layouts").iterdir())
    assert (scratch / "preview.png").read_bytes() == base64.b64decode(body["image"])
    assert str(scratch / "preview.png") in run["prompt"]
    assert shlex.split(run["prompt"]) == ["/view-layout", str(scratch / "preview.png"), "example"]
    assert run["argv"][:6] == ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "auto"]
    assert "Skill(view-layout)" in run["argv"]
    assert "Bash(.venv/bin/python -I .claude/skills/view-layout/view_layout.py:*)" in run["argv"]
    assert "Bash(.venv/bin/python -I .claude/skills/view-layout/execute_conditions.py:*)" in run["argv"]
    execution = status["execution"]
    assert execution["invocation"] == {"skill": "view-layout", "arguments": [str(scratch / "preview.png"), "example"], "validated": True}
    assert len(execution["calls"]) == 2
    assert execution["calls"][0]["arguments"] == ["validate-inputs", str(scratch / "preview.png"), "example"]
    assert execution["calls"][1]["arguments"] == ["move", str(view), "label=31,42"]
    assert all(call["durationSeconds"] > 0 and call["exitCode"] == 0 for call in execution["calls"])
    assert execution["durationSeconds"] >= sum(call["durationSeconds"] for call in execution["calls"])
    assert execution["changedFiles"] == [{"path": "v/1920x1080/AddedView.json", "change": "added"},
                                         {"path": "v/1920x1080/DeletedView.json", "change": "deleted"},
                                         {"path": "v/1920x1080/LayoutView.json", "change": "modified"}]
    assert execution["warnings"] == []
    assert execution["conditions"] is None and execution["result"] == "Finished: 3 view files changed."
    assert json.loads((scratch / "execution.json").read_text()) == execution
    assert "view_layout.py finished" in transcript and "View layout total time" in transcript


def test_view_layout_records_failed_execute_conditions_and_the_result(client, tmp_path, monkeypatch):
    import sys
    from egt_gda_sync.game import project
    claude = tmp_path / "claude"
    # The game folder is in no git repository, so the conditions fail and the skill stops after validating its inputs.
    claude.write_text(f'''#!{sys.executable}
import json, os, shlex, subprocess, sys
arguments = shlex.split(sys.stdin.read())[1:]
env = {{**os.environ, "GIT_CEILING_DIRECTORIES": {str(tmp_path)!r}}}
subprocess.run([sys.executable, "-I", ".claude/skills/view-layout/view_layout.py", "validate-inputs", *arguments], check=True)
checked = subprocess.run([sys.executable, "-I", ".claude/skills/view-layout/execute_conditions.py", arguments[1]], env=env)
assert checked.returncode == 1
print(json.dumps({{"type": "result", "is_error": False, "result": "**Result:** I stopped before any layout work.", "num_turns": 2}}))
''')
    claude.chmod(0o755)
    monkeypatch.setattr(project, "find_claude", lambda: str(claude))
    assert client.post("/api/game/view-layout", json=layout_preview()).status_code == 200
    for _ in range(2000):
        status = client.get("/api/game/agent/status").json()
        if not status["running"]:
            break
        time.sleep(0.01)
    assert status["error"] is None and status["result"]["report"] == "**Result:** I stopped before any layout work."
    execution = status["execution"]
    assert execution["invocation"]["validated"] is True
    assert execution["conditions"] == {"passed": [], "failed": ["no-uncommitted-changes"]}
    assert execution["result"] == ("Stopped before any layout work: the execute condition no-uncommitted-changes failed, "
                                   "so nothing changed.")
    assert [(call["helper"], call["exitCode"]) for call in execution["calls"]] == [("view_layout.py", 0),
                                                                                 ("execute_conditions.py", 1)]
    transcript = "\n".join(status["log"])
    assert "execute_conditions.py finished" in transcript and "exit 1" in transcript
    assert "Execute conditions failed: no-uncommitted-changes" in transcript


def test_view_layout_result_says_how_the_run_ended_in_one_sentence():
    from egt_gda_sync.game.project import _layout_result

    def result(changed, error=None, failed=None):
        files = None if changed is None else [{"path": f"v/{number}.json", "change": "modified"} for number in range(changed)]
        return _layout_result({"changedFiles": files, "conditions": failed and {"passed": [], "failed": failed}}, error)

    assert result(0) == "Finished without changing any view file."
    assert result(1) == "Finished: 1 view file changed."
    assert result(2) == "Finished: 2 view files changed."
    assert result(None) == "Finished, but the changed view files could not be determined."
    assert result(0, "Claude Code failed") == "Failed with an error, and no view file changed."
    assert result(2, "Claude Code failed") == "Failed with an error after 2 view files changed."
    assert result(None, "Claude Code failed") == "Failed with an error; the changed view files could not be determined."
    assert result(0, failed=["a", "b"]) == "Stopped before any layout work: the execute conditions a, b failed, so nothing changed."
    assert result(1, failed=["a"]) == "Stopped: the execute condition a failed, but 1 view file changed."


def test_view_layout_keeps_failure_responses_and_the_final_error(client, tmp_path, monkeypatch):
    import sys
    from egt_gda_sync.game import project
    claude = tmp_path / "claude"
    claude.write_text(f'''#!{sys.executable}
import json, sys
sys.stdin.read()
print(json.dumps({{"type": "user", "message": {{"content": [{{"type": "tool_result", "is_error": True, "content": "Could not read the view.\\nDetails remain visible."}}]}}}}))
print(json.dumps({{"type": "result", "is_error": True, "errors": ["Authentication failed"], "result": "Please sign in to Claude Code."}}))
sys.exit(1)
''')
    claude.chmod(0o755)
    monkeypatch.setattr(project, "find_claude", lambda: str(claude))
    assert client.post("/api/game/view-layout", json=layout_preview("JPEG")).status_code == 200
    for _ in range(200):
        status = client.get("/api/game/agent/status").json()
        if not status["running"]:
            break
        time.sleep(0.01)
    assert status["result"] is None and "Please sign in" in status["error"]
    transcript = "\n".join(status["log"])
    assert "Details remain visible." in transcript and "Authentication failed" in transcript
    assert next((client.home / "view-layouts").iterdir()).joinpath("preview.jpg").is_file()
    assert status["execution"]["durationSeconds"] > 0
    assert status["execution"]["changedFiles"] == []
    assert status["execution"]["invocation"]["validated"] is False


def test_view_layout_cannot_report_success_without_the_skill_validating_its_arguments(client, tmp_path, monkeypatch):
    import sys
    from egt_gda_sync.game import project
    claude = tmp_path / "claude"
    claude.write_text(f'''#!{sys.executable}
import json, sys
sys.stdin.read()
print(json.dumps({{"type": "result", "is_error": False, "result": "Skipped the skill."}}))
''')
    claude.chmod(0o755)
    monkeypatch.setattr(project, "find_claude", lambda: str(claude))
    assert client.post("/api/game/view-layout", json=layout_preview()).status_code == 200
    for _ in range(200):
        status = client.get("/api/game/agent/status").json()
        if not status["running"]:
            break
        time.sleep(0.01)
    assert not status["running"]
    assert "without validating" in status["error"]
    assert status["result"]["report"] == "Skipped the skill."
    assert status["execution"]["changedFiles"] == []


@pytest.mark.skipif(not shutil.which("node"), reason="the export agent runs on Node.js")
def test_an_exports_changes_the_translator_left_are_ported_by_an_agent_in_the_background(client, tmp_path, monkeypatch):
    from egt_gda_sync.game import project
    agent = tmp_path / "export-agent.mjs"
    agent.write_text("""
console.error('porting into ' + process.argv[2].split('/').pop());
process.stdout.write(JSON.stringify({ ported: [{ ts: 'alpha_family/x.ts', cpp: ['alpha_family/x.cpp'] }], failed: [] }));
""")
    monkeypatch.setattr(project, "EXPORT_AGENT", agent)
    (client.game.parent / "game").mkdir(exist_ok=True)
    real_which = shutil.which
    monkeypatch.setattr(project.shutil, "which", lambda name: "/usr/bin/claude" if name == "claude" else real_which(name))
    exported = client.post("/api/game/export", json={"name": "Example", "files": {"README.md": "# Example\n"}}).json()
    # an export without export.json (made before the agent) cannot be ported
    assert client.post("/api/game/export-agent", json={"id": exported["id"]}).status_code == 404
    exported = client.post("/api/game/export", json={"name": "Example", "files": {"README.md": "# Example\n", "export.json": "{}"}}).json()
    assert client.post("/api/game/export-agent", json={"id": "../x"}).status_code in (400, 404)
    client.post("/api/game/export-agent", json={"id": exported["id"]})
    for _ in range(100):
        status = client.get("/api/game/agent/status").json()
        if not status["running"]:
            break
        time.sleep(0.05)
    assert status["kind"] == "export" and status["result"]["ported"][0]["ts"] == "alpha_family/x.ts"
    assert status["log"] == [f"porting into {exported['id']}"]



FAKE_GAME_IMPORTER = """
const [root, plugin, ...rest] = process.argv.slice(2);
const agent = rest.includes('--agent');
const copies = rest.includes('--copies');
if (agent || copies) console.error('copying 1 files of Other...');
process.stdout.write(JSON.stringify({ plugin, gameName: 'Example', units: [{ ts: 'alpha_family/plugins/' + plugin + '/ExampleView/ExampleView.ts', mode: 'copy' }],
  copied: agent || copies ? [{ ts: 'alpha_family/plugins/' + plugin + '/ExampleView/ExampleView.ts' }] : [], ported: [], failed: [], skipped: [],
  args: rest }));
"""


@pytest.mark.skipif(not shutil.which("node"), reason="the importer runs on Node.js")
def test_a_cpp_game_of_the_family_is_planned_and_imported_in_the_background(client, tmp_path, monkeypatch):
    from egt_gda_sync.game import project
    importer = tmp_path / "import-game.mjs"
    importer.write_text(FAKE_GAME_IMPORTER)
    monkeypatch.setattr(project, "GAME_IMPORTER", importer)
    games = client.get("/api/game/import-game").json()
    assert games["workspace"] == "example"
    assert [game["plugin"] for game in games["games"]] == ["example"]
    plan = client.get("/api/game/import-game", params={"plugin": "example"}).json()
    assert plan["units"][0]["mode"] == "copy" and plan["copied"] == []
    # only a C++ game of the family, by its folder's name
    assert client.get("/api/game/import-game", params={"plugin": "../game"}).status_code == 404
    assert client.get("/api/game/import-game", params={"plugin": "missing"}).status_code == 404

    # the copies need no agent
    client.post("/api/game/import-game", json={"plugin": "example", "copiesOnly": True})
    for _ in range(100):
        status = client.get("/api/game/agent/status").json()
        if not status["running"]:
            break
        time.sleep(0.05)
    assert status["kind"] == "import-game" and status["result"]["args"] == ["--copies", "--json"]
    assert status["log"] == ["copying 1 files of Other..."]

    real_which = shutil.which
    monkeypatch.setattr(project.shutil, "which", lambda name: "/usr/bin/claude" if name == "claude" else real_which(name))
    assert client.post("/api/game/import-game", json={"plugin": "example", "files": ["../x.ts"]}).status_code == 403
    client.post("/api/game/import-game", json={"plugin": "example", "files": ["alpha_family/plugins/example/ExampleView/ExampleView.ts"]})
    for _ in range(100):
        status = client.get("/api/game/agent/status").json()
        if not status["running"]:
            break
        time.sleep(0.05)
    assert status["result"]["args"] == ["--agent", "--json", "alpha_family/plugins/example/ExampleView/ExampleView.ts"]
