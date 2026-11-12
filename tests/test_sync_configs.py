"""The game sync's configs tool (frontend/src/game/export/sync-configs.mjs): it copies the modules configs of the browser
game's games from the games repository's commits into the app's sources, and never over what was edited here."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

TOOL = Path(__file__).resolve().parents[1] / "frontend" / "src" / "game" / "export" / "sync-configs.mjs"
pytestmark = pytest.mark.skipif(not shutil.which("node") or not shutil.which("git"), reason="the tool runs on Node.js, and reads git")


class Games:
    """A games repository with a game's configs, its family's, another game's, and what is not a modules config."""

    def __init__(self, root: Path):
        self.root = root / "games"
        self.out = root / "sources" / "configs"
        self.manifest = root / "sources" / "ConfigsManifest.json"
        self.write("configs/example/modules/ExampleModules.json", {"plugins": [], "modules": [{"name": "ExampleMath"}]})
        self.write("configs/example/modules/ModuleManager_Hat.json",
                   {"include": ["../../family/modules/FamilyHatModules.json", "ExampleModules.json", "../../../outside/Other.json"]})
        self.write("configs/family/modules/FamilyHatModules.json", {"include": ["FamilyGameModules.json"]})
        self.write("configs/family/modules/FamilyGameModules.json", {"modules": [{"name": "VideoManager"}]})
        self.write("configs/other_game/modules/OtherModules.json", {"modules": []})
        self.write("configs/launcher/Launcher.json", {})
        self.write("game/family/plugins/example/CMakeLists.txt", "")
        self.git("init", "-q", "-b", "main")
        self.commit("Configs")

    def write(self, path: str, data: dict | str) -> None:
        file = self.root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(data if isinstance(data, str) else json.dumps(data, indent=2) + "\n")

    def git(self, *args: str) -> str:
        return subprocess.run(["git", "-C", str(self.root), "-c", "user.name=Test", "-c", "user.email=test@example.com", *args],
                              check=True, capture_output=True, text=True, timeout=30).stdout.strip()

    def commit(self, subject: str) -> str:
        self.git("add", "-A")
        self.git("commit", "-q", "-m", subject)
        return self.git("rev-parse", "HEAD")

    def sync(self, *args: str, games: Path | None = None) -> subprocess.CompletedProcess:
        return subprocess.run(["node", str(TOOL), str(games or self.root), "--out", str(self.out), "--manifest", str(self.manifest), *args],
                              capture_output=True, text=True, check=False, timeout=60)

    def copies(self) -> dict[str, str]:
        return {file.relative_to(self.out).as_posix(): file.read_text() for file in sorted(self.out.rglob("*")) if file.is_file()}

    def recorded(self) -> dict:
        return json.loads(self.manifest.read_text())


def test_a_games_modules_configs_and_the_ones_they_include_are_copied_from_the_games_commit(tmp_path):
    games = Games(tmp_path)
    first = games.git("rev-parse", "HEAD")
    # What is not committed is not synced, and is listed.
    games.write("configs/example/modules/ExampleModules.json", {"plugins": [], "modules": [], "uncommitted": True})

    # A check lists what a sync would do, and writes nothing.
    check = games.sync("example", "--check")
    assert check.returncode == 0 and "4 of 4 configs differ" in check.stdout and not games.out.exists() and not games.manifest.exists()

    result = games.sync("example")
    assert result.returncode == 0, result.stderr
    # The game's folder whole, and the family's, which its module manager includes; no other game's, and nothing else.
    assert sorted(games.copies()) == ["example/modules/ExampleModules.json", "example/modules/ModuleManager_Hat.json",
                                      "family/modules/FamilyGameModules.json", "family/modules/FamilyHatModules.json"]
    assert json.loads(games.copies()["example/modules/ExampleModules.json"]) == {"plugins": [], "modules": [{"name": "ExampleMath"}]}
    assert (games.out / "family/modules/FamilyGameModules.json").read_bytes() == \
        subprocess.run(["git", "-C", str(games.root), "show", "HEAD:configs/family/modules/FamilyGameModules.json"], check=True, capture_output=True).stdout
    assert "4 configs synced" in result.stdout and "configs/example/modules/ExampleModules.json  new" in result.stdout
    assert "Not committed in the games repository, so not synced: configs/example/modules/ExampleModules.json" in result.stdout
    assert set(games.recorded()) == set(games.copies()) and all(entry["commit"] == first for entry in games.recorded().values())

    # Synced: nothing more to do, by the games repository's game folder too, as the other tools take it.
    again = games.sync("example", "--check", games=games.root / "game")
    assert again.returncode == 0 and "Nothing to sync" in again.stdout and "4 files of example/modules, family/modules" in again.stdout
    report = json.loads(games.sync("example", "--json").stdout)
    assert report["changes"] == [] and report["files"] == 4 and report["folders"] == ["example/modules", "family/modules"]


def test_a_sync_follows_the_games_changes_and_keeps_what_was_edited_here(tmp_path):
    games = Games(tmp_path)
    first = games.git("rev-parse", "HEAD")
    assert games.sync("example").returncode == 0
    synced = games.copies()

    # The games repository changes a config, adds one and deletes one.
    games.write("configs/example/modules/ExampleModules.json", {"plugins": [], "modules": [{"name": "ExampleMath"}, {"name": "ExampleView"}]})
    games.write("configs/example/modules/ExampleModules_QA.json", {"include": ["ExampleModules.json"]})
    (games.root / "configs/family/modules/FamilyHatModules.json").unlink()
    games.write("configs/example/modules/ModuleManager_Hat.json", {"include": ["../../family/modules/FamilyGameModules.json", "ExampleModules.json"]})
    second = games.commit("Add the example's view module")
    check = games.sync("example", "--check")
    assert check.returncode == 0 and games.copies() == synced
    assert "configs/example/modules/ExampleModules.json  changed" in check.stdout and "Add the example's view module" in check.stdout
    assert "configs/example/modules/ExampleModules_QA.json  new" in check.stdout
    assert "configs/family/modules/FamilyHatModules.json  deleted in the games repository" in check.stdout

    # Edited here: one that the games repository changed too, and one it did not; and a file that is only here.
    (games.out / "example/modules/ExampleModules.json").write_text('{"edited": "here"}\n')
    (games.out / "family/modules/FamilyGameModules.json").write_text('{"modules": [], "edited": "here"}\n')
    (games.out / "example/modules/Local.json").write_text("{}\n")
    result = games.sync("example")
    assert result.returncode == 1
    assert "configs/example/modules/ExampleModules.json  CONFLICT" in result.stdout and "1 conflicts were not synced" in result.stdout
    assert "Edited here, and kept" in result.stdout and "configs/family/modules/FamilyGameModules.json" in result.stdout
    assert "Only this repository has, and keeps: configs/example/modules/Local.json" in result.stdout
    copies = games.copies()
    assert copies["example/modules/ExampleModules.json"] == '{"edited": "here"}\n'
    assert copies["family/modules/FamilyGameModules.json"] == '{"modules": [], "edited": "here"}\n' and "example/modules/Local.json" in copies
    # The rest is synced: the new config, the changed module manager, and the deleted one is gone, with its record.
    assert json.loads(copies["example/modules/ExampleModules_QA.json"]) == {"include": ["ExampleModules.json"]}
    assert "FamilyGameModules.json" in copies["example/modules/ModuleManager_Hat.json"] and "family/modules/FamilyHatModules.json" not in copies
    recorded = games.recorded()
    assert "family/modules/FamilyHatModules.json" not in recorded and "example/modules/Local.json" not in recorded
    assert recorded["example/modules/ExampleModules.json"]["commit"] == first  # the conflict's record waits for its sync
    assert recorded["example/modules/ExampleModules_QA.json"]["commit"] == second
    assert recorded["family/modules/FamilyGameModules.json"]["commit"] == first

    # --force takes the games repository's for a conflict, and still keeps what only this repository changed.
    forced = games.sync("example", "--force")
    assert forced.returncode == 0 and "the games repository's taken (--force)" in forced.stdout
    copies = games.copies()
    assert json.loads(copies["example/modules/ExampleModules.json"])["modules"][1] == {"name": "ExampleView"}
    assert copies["family/modules/FamilyGameModules.json"] == '{"modules": [], "edited": "here"}\n' and "example/modules/Local.json" in copies
    assert games.recorded()["example/modules/ExampleModules.json"]["commit"] == second
    assert "Nothing to sync" in games.sync("example", "--check").stdout


def test_a_game_without_configs_in_the_games_repository_keeps_its_copies(tmp_path):
    games = Games(tmp_path)
    assert games.sync("example", "other_game").returncode == 0
    assert "other_game/modules/OtherModules.json" in games.copies()
    # Renamed in the games repository: the folder is not there any more, and nothing here is deleted for it.
    games.git("mv", "configs/other_game", "configs/renamed_game")
    games.commit("Rename the other game")
    result = games.sync("example", "other_game", "missing_game")
    assert result.returncode == 0
    assert "The games repository has no configs/other_game/modules" in result.stdout and "no configs/missing_game/modules" in result.stdout
    assert "other_game/modules/OtherModules.json" in games.copies() and "renamed_game/modules/OtherModules.json" not in games.copies()
    assert json.loads(games.sync("example", "other_game", "--json").stdout)["missing"] == ["other_game"]

    # Only a plugin's folder name, and only a git repository: the configs come from its commits.
    assert games.sync("../example").returncode == 2
    plain = tmp_path / "plain"
    plain.mkdir()
    refused = games.sync("example", games=plain)
    assert refused.returncode == 2 and "is not in a git repository" in refused.stderr
