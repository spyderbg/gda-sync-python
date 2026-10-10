"""The backups: each operation's replaced and deleted files, listed with a record of the operation, and restored."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from egt_gda_sync.library import Library
from egt_gda_sync.server import create_app
from tests.conftest import session_headers
from tests.test_rss_sync import write_example


def library_for(tmp_path: Path) -> tuple[Library, Path]:
    game, gda = write_example(tmp_path)
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda), "extensions": [".dds"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    assert library.compare_workspace("example")["state"] == "succeeded"
    return library, game


def test_an_operations_backups_are_listed_with_its_record_and_restored(tmp_path):
    library, game = library_for(tmp_path)
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        headers = session_headers(client)
        report = client.get("/api/rss-sync/report").json()
        rows = {row["resource"]: row for row in report["differences"]}
        # Sync the different file and delete the supplementary one, in one operation.
        applied = client.post("/api/rss-sync/apply", headers=headers, json={"resources": [
            {"id": rows["changed.dds"]["id"], "category": "different"}, {"id": rows["unlisted.dds"]["id"], "category": "supplementary"}]}).json()
        assert applied["copied"] == ["changed.dds"] and applied["deleted"] == 1
        library.reports.wait("example", 60)

        listed = client.get("/api/backups").json()
        assert listed["workspaceId"] == "example" and len(listed["backups"]) == 1
        backup = listed["backups"][0]
        assert (backup["action"], backup["message"], backup["workspace"], backup["fileCount"], backup["size"], backup["restorable"]) == (
            "sync", "Synced 1 resource to Game; Deleted 1 supplementary resource from Game", {"id": "example", "name": "Example"}, 2, 8, True)
        assert backup["root"] == str(game.parent.resolve()) and not backup["legacy"]
        # Each file with what the operation did to it and how it is now.
        files = {item["path"]: item for item in client.get(f"/api/backups/{backup['id']}").json()["files"]}
        assert {path: (item["change"], item["now"]) for path, item in files.items()} == {
            "example/changed.dds": ("replaced", "changed"), "example/unlisted.dds": ("deleted", "missing")}

        # Restore one file: the version it replaces is backed up first, in a restore operation of its own.
        restore = lambda **body: client.post("/api/backups/restore", headers=headers, json={"id": backup["id"], **body})
        assert client.post("/api/backups/restore", json={"id": backup["id"]}).status_code == 403
        assert restore(files=["example/other.dds"]).status_code == 404
        one = restore(files=["example/changed.dds"]).json()
        assert one["restored"] == ["example/changed.dds"] and one["failures"] == []
        assert (game / "changed.dds").read_bytes() == b"new"
        assert one["library"]["activity"][0]["action"] == "restore" and one["library"]["rssSync"]["running"] is True
        library.reports.wait("example", 60)
        restores = [item for item in client.get("/api/backups").json()["backups"] if item["action"] == "restore"]
        assert len(restores) == 1 and restores[0]["fileCount"] == 1
        assert [path.read_bytes() for path in (Path(library.backup_path) / restores[0]["id"]).rglob("changed.dds")] == [b"old"]

        # Restoring everything brings back the deleted file and skips the one that is already the same.
        everything = restore().json()
        assert everything["restored"] == ["example/unlisted.dds"] and everything["skipped"] == ["example/changed.dds"]
        assert (game / "unlisted.dds").read_bytes() == b"other"
        library.reports.wait("example", 60)


def test_backups_without_a_record_belong_to_the_workspace_whose_game_folder_they_hold(tmp_path):
    library, game = library_for(tmp_path)
    backups = Path(library.backup_path)
    (backups / "older" / "example").mkdir(parents=True)
    (backups / "older" / "example" / "same.dds").write_bytes(b"before")
    (backups / "unknown" / "elsewhere").mkdir(parents=True)
    (backups / "unknown" / "elsewhere" / "file.dds").write_bytes(b"x")
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        headers = session_headers(client)
        listed = {item["id"]: item for item in client.get("/api/backups").json()["backups"]}
        assert listed["older"]["legacy"] and listed["older"]["workspace"] == {"id": "example", "name": "Example"} and listed["older"]["restorable"]
        assert listed["unknown"]["workspace"] is None and not listed["unknown"]["restorable"]
        refused = client.post("/api/backups/restore", headers=headers, json={"id": "unknown"})
        assert refused.status_code == 409 and "not known" in refused.json()["error"]
        assert client.post("/api/backups/restore", headers=headers, json={"id": "older"}).json()["restored"] == ["example/same.dds"]
        assert (game / "same.dds").read_bytes() == b"before"
        library.reports.wait("example", 60)
        # Only a backup's own folder can be read; other names are not backups.
        assert client.get("/api/backups/..%2Fsync-reports").status_code in (400, 404)
        assert client.get("/api/backups/missing").status_code == 404


def test_a_view_edit_is_recorded_in_its_backup(tmp_path):
    library, game = library_for(tmp_path)
    view = game / "v" / "1920x1080" / "MainView.json"
    view.parent.mkdir(parents=True)
    view.write_text('{"name": "MainView", "elements": [{"id": "a", "type": "Dummy"}]}')
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        headers = session_headers(client)
        layout = client.get("/api/rss-sync/view", params={"file": str(view)}).json()
        client.post("/api/rss-sync/view-positions", headers=headers, json={"file": str(view), "revision": layout["revision"],
                                                                          "positions": [{"index": 0, "x": 5, "y": 6}]})
        (backup,) = client.get("/api/backups").json()["backups"]
        assert (backup["action"], backup["message"]) == ("edit", "Moved 1 element of MainView")
        files = client.get(f"/api/backups/{backup['id']}").json()["files"]
        assert [(item["path"], item["change"], item["now"]) for item in files] == [("example/v/1920x1080/MainView.json", "replaced", "changed")]
