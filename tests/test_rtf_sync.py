"""RTFs in the GDA sync: an RTF's folder is one resource, compared with the closest GDA folder that holds its .rtf file,
and synced as a whole."""

import json
import shutil
from pathlib import Path

from egt_gda_sync.rss_sync import compare, make_config
from egt_gda_sync.rtf import describe_rtf
from tests.conftest import session_headers
from tests.fixtures.bc7_dds import create_bc7_dds
from tests.fixtures.rtf import write_project
from tests.test_rss_sync import compared

EXTENSIONS = [".rtf", ".dds", ".png"]


def write_rtf_game(root: Path) -> tuple[Path, Path]:
    """A game whose RTF, help/10_Crown, the GDA keeps under another name, 10_Crown_Tetra_Lottomatica, with a changed
    background, a title the game has not, and without the game's old button; and another GDA RTF, of another game."""
    game, gda = root / "resources" / "example", root / "gda"
    write_project(game / "help" / "10_Crown")
    (game / "help" / "10_Crown" / "data" / "old_button.dds").write_bytes(b"old")
    source = gda / "04.HelpScreen" / "10_Crown_Tetra_Lottomatica"
    write_project(source)
    (source / "data" / "background.dds").write_bytes(create_bc7_dds(32, 18))
    (source / "data" / "titles").mkdir()
    (source / "data" / "titles" / "title_EN.dds").write_bytes(create_bc7_dds(8, 4))
    other = gda / "04.HelpScreen" / "20_Other_Game"
    write_project(other)
    (other / "data" / "other.dds").write_bytes(b"other")
    (game / "RssRtfsData.json").write_text(json.dumps({"rtfs": [{"id": "rtf_common_default", "path": "help/10_Crown/project.rtf"}]}, indent=2))
    return game, gda


def run(game: Path, gda: Path) -> dict:
    result = compare(make_config({"resources_dir": str(game.parent), "gda_dir": str(gda), "game": game.name, "extensions": EXTENSIONS}))
    return {row["resource"]: row for row in [*result["differences"], *result["identical"]]}


def test_an_rtf_is_compared_with_the_closest_gda_folder_file_by_file(tmp_path):
    game, gda = write_rtf_game(tmp_path)
    rows = run(game, gda)
    # The RTF's files are not resources of their own.
    assert list(rows) == ["help/10_Crown"]
    row = rows["help/10_Crown"]
    folder, source = game / "help" / "10_Crown", gda / "04.HelpScreen" / "10_Crown_Tetra_Lottomatica"
    assert (row["category"], row["status"]) == ("different", "different SHA-256 (1 changed, 1 only in the GDA, 1 only in the game)")
    assert row["resourcePath"] == str(folder) and [(use["type"], use["id"]) for use in row["requiredBy"]] == [("Rtf", "rtf_common_default")]
    # Each GDA folder with a project.rtf, the one whose name shares the most words with the game's first.
    assert [(file["tree"], file["path"], file["absolutePath"]) for file in row["gdaFiles"]] == [
        ("game", "04.HelpScreen/10_Crown_Tetra_Lottomatica", str(source)), ("game", "04.HelpScreen/20_Other_Game", str(gda / "04.HelpScreen" / "20_Other_Game"))]
    assert (row["directory"]["project"], row["directory"]["gdaProject"]) == (str(folder / "project.rtf"), str(source / "project.rtf"))
    files = {file["path"]: file for file in row["directory"]["files"]}
    assert {path: file["change"] for path, file in files.items()} == {
        "data/background.dds": "changed", "data/logo.png": "identical", "data/old_button.dds": "removed",
        "data/titles/title_EN.dds": "added", **{f"data/videos/spin/spin_{number:05d}.png": "identical" for number in range(3)},
        "data/wintable.dds": "identical", "project.rtf": "identical"}
    assert files["data/old_button.dds"] == {"path": "data/old_button.dds", "resourcePath": str(folder / "data" / "old_button.dds"), "gdaPath": None, "change": "removed"}
    assert files["data/titles/title_EN.dds"]["resourcePath"] is None
    # The pages of both, for the Sync page to show side by side.
    assert row["rtf"] == describe_rtf(str(folder / "project.rtf"))["rtf"] and row["gdaRtf"] == describe_rtf(str(source / "project.rtf"))["rtf"]


def test_an_rtf_is_in_sync_missing_invalid_or_supplementary(tmp_path):
    game, gda = write_rtf_game(tmp_path)
    folder, source = game / "help" / "10_Crown", gda / "04.HelpScreen" / "10_Crown_Tetra_Lottomatica"
    shutil.rmtree(folder)
    shutil.copytree(source, folder)
    write_project(game / "spare")
    rtfs = json.loads((game / "RssRtfsData.json").read_text())["rtfs"]
    (game / "RssRtfsData.json").write_text(json.dumps({"rtfs": [*rtfs, {"id": "rtf_gone", "path": "gone/project.rtf"}]}, indent=2))
    rows = run(game, gda)
    # Identical to the second GDA folder that holds a project.rtf, which is then its only one.
    assert (rows["help/10_Crown"]["status"], rows["help/10_Crown"]["mipOnly"], [file["path"] for file in rows["help/10_Crown"]["gdaFiles"]]) == (
        "identical", False, ["04.HelpScreen/10_Crown_Tetra_Lottomatica"])
    assert {file["change"] for file in rows["help/10_Crown"]["directory"]["files"]} == {"identical"}
    assert (rows["spare"]["status"], rows["spare"]["gdaFiles"], rows["spare"]["requiredBy"]) == ("supplementary", [], [])
    assert rows["spare"]["directory"]["files"][0] == {"path": "data/background.dds", "resourcePath": str(game / "spare" / "data" / "background.dds")}
    assert (rows["gone"]["status"], rows["gone"]["directory"]["files"]) == ("invalid: source file does not exist", [])
    for other in (gda / "04.HelpScreen").iterdir():
        (other / "project.rtf").rename(other / "renamed.rtf")
    assert run(game, gda)["help/10_Crown"]["status"] == "missing"


def test_syncing_an_rtf_makes_its_folder_a_copy_of_the_gda_folder(tmp_path):
    game, gda = write_rtf_game(tmp_path)
    folder, source = game / "help" / "10_Crown", gda / "04.HelpScreen" / "10_Crown_Tetra_Lottomatica"
    (folder / "data" / "old").mkdir()
    (folder / "data" / "old" / "unused.dds").write_bytes(b"unused")
    with compared(tmp_path, game, gda, extensions=EXTENSIONS) as (client, library, rows, _apply):
        assert rows["help/10_Crown"]["status"] == "different SHA-256 (1 changed, 1 only in the GDA, 2 only in the game)"
        result = client.post("/api/rss-sync/copy", headers=session_headers(client), json={"ids": [rows["help/10_Crown"]["id"]]}).json()
        assert result["failures"] == [] and result["resources"] == 1
        assert sorted(result["copied"]) == ["help/10_Crown/data/background.dds", "help/10_Crown/data/old/unused.dds (removed)",
                                            "help/10_Crown/data/old_button.dds (removed)", "help/10_Crown/data/titles/title_EN.dds"]
        assert result["bytes"] == (source / "data" / "background.dds").stat().st_size + (source / "data" / "titles" / "title_EN.dds").stat().st_size
        # The game's folder is now a copy of the GDA's, without the folder that only held removed files.
        files = lambda root: {path.relative_to(root).as_posix(): path.read_bytes() for path in root.rglob("*") if path.is_file()}
        assert files(folder) == files(source) and not (folder / "data" / "old").exists()
        # Every replaced or removed game file is in the backups.
        backups = {path.name: path.read_bytes() for path in Path(library.backup_path).rglob("*") if path.is_file()}
        assert backups == {"background.dds": create_bc7_dds(64, 36), "old_button.dds": b"old", "unused.dds": b"unused"}
        library.reports.wait("example", 60)
        report = client.get("/api/rss-sync/report").json()
        assert [row["resource"] for row in report["identical"]] == ["help/10_Crown"]
        activity = client.get("/api/library").json()["activity"][0]
        assert (activity["action"], activity["message"]) == ("sync", "Synced 1 resource to Game")


def test_syncing_an_rtf_keeps_a_file_that_a_descriptor_declares(tmp_path):
    game, gda = write_rtf_game(tmp_path)
    (game / "RssImagesData.json").write_text(json.dumps({"images": [{"id": "OLD", "path": "help/10_Crown/data/old_button.dds"}]}, indent=2))
    with compared(tmp_path, game, gda, extensions=EXTENSIONS) as (client, _library, rows, _apply):
        result = client.post("/api/rss-sync/copy", headers=session_headers(client), json={"ids": [rows["help/10_Crown"]["id"]]}).json()
        assert result["failures"] == [{"name": "help/10_Crown/data/old_button.dds", "message": "A descriptor declares it, so it was kept"}]
        assert sorted(result["copied"]) == ["help/10_Crown/data/background.dds", "help/10_Crown/data/titles/title_EN.dds"]
        assert (game / "help" / "10_Crown" / "data" / "old_button.dds").read_bytes() == b"old"


def test_deleting_a_supplementary_rtf_deletes_its_folder_and_removing_an_invalid_one_its_declaration(tmp_path):
    game, gda = write_rtf_game(tmp_path)
    write_project(game / "extras" / "spare")
    (game / "extras" / "keep.dds").write_bytes(b"keep")
    rtfs = json.loads((game / "RssRtfsData.json").read_text())["rtfs"]
    (game / "RssRtfsData.json").write_text(json.dumps({"rtfs": [*rtfs, {"id": "rtf_gone", "path": "gone/project.rtf"}]}, indent=2))
    with compared(tmp_path, game, gda, extensions=EXTENSIONS) as (_client, library, rows, apply):
        result = apply(rows["extras/spare"], rows["gone"]).json()
        assert result["failures"] == [] and (result["deleted"], result["removed"]) == (1, 1)
        # Every file of the folder, and the folder, but not the folder that holds it.
        assert not (game / "extras" / "spare").exists() and (game / "extras" / "keep.dds").exists()
        assert len([path for path in Path(library.backup_path).rglob("*") if path.is_file() and "spare" in path.parts]) == 7
        assert [rtf["id"] for rtf in json.loads((game / "RssRtfsData.json").read_text())["rtfs"]] == ["rtf_common_default"]
