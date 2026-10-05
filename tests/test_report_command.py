"""`egt-gda-sync report`: the GDA sync of workspaces from the command line, without the app."""

import json
from pathlib import Path


from egt_gda_sync.__main__ import main
from egt_gda_sync.library import Library
from tests.test_rss_sync import write_example


def configure(tmp_path: Path, monkeypatch) -> Path:
    """Three workspaces: one with differences, one entirely in sync, and one without descriptors."""
    write_example(tmp_path)
    same, same_gda = tmp_path / "resources" / "same", tmp_path / "same-gda"
    same.mkdir()
    same_gda.mkdir()
    (same / "RssRawData.json").write_text(json.dumps({"rawFiles": [{"path": "same.dds"}]}))
    (same / "same.dds").write_bytes(b"same")
    (same_gda / "same.dds").write_bytes(b"same")
    (tmp_path / "resources" / "empty").mkdir()
    (tmp_path / "empty-gda").mkdir()
    home = tmp_path / "app"
    home.mkdir()

    def workspace(workspace_id: str, gda: str) -> dict:
        return {"id": workspace_id, "game_name": workspace_id.title(), "game_path": str(tmp_path / "resources" / workspace_id), "gda_path": str(tmp_path / gda)}

    (home / "workspace.json").write_text(json.dumps({"defaultWorkspace": "same", "workspaces": [
        workspace("example", "gda"), workspace("same", "same-gda"), workspace("empty", "empty-gda")]}))
    monkeypatch.setenv("EGT_GDA_SYNC_HOME", str(home))
    return home


def newest(home: Path, workspace_id: str) -> Path:
    files = sorted((home / "sync-reports").glob(f"{workspace_id}-*.json"))
    assert files, f"no report for {workspace_id}"
    return files[-1]


def test_reports_the_default_workspace_and_exits_like_the_script(tmp_path, monkeypatch, capsys):
    home = configure(tmp_path, monkeypatch)
    assert main(["report"]) == 0
    output = capsys.readouterr().out
    assert "Same (same)\n  Compared: 1; identical: 1; missing: 0; different: 0; invalid: 0" in output
    assert f"Report: {newest(home, 'same')}" in output
    assert main(["report", "example"]) == 1
    assert "Compared: 6; identical: 2; missing: 3; different: 1; invalid: 0" in capsys.readouterr().out


def test_reports_every_workspace_and_records_a_failed_one(tmp_path, monkeypatch, capsys):
    home = configure(tmp_path, monkeypatch)
    assert main(["report", "example"]) == 1
    assert main(["report", "--all"]) == 2
    output = capsys.readouterr().out
    assert output.index("Example (example)") < output.index("Same (same)") < output.index("Empty (empty)")
    assert "  Failed: no *Data.json descriptors found in" in output
    reports = {name: json.loads(newest(home, name).read_text()) for name in ("example", "same", "empty")}
    assert reports["empty"]["summary"]["state"] == "failed" and "compared" not in reports["empty"]["summary"]
    # Even a failed run records the workspace settings it used.
    assert reports["empty"]["workspace"] == {
        "id": "empty", "game_name": "Empty", "game_path": str((tmp_path / "resources" / "empty").resolve()),
        "gda_path": str((tmp_path / "empty-gda").resolve()), "common_gda_path": None,
        "extensions": [".csv", ".dds", ".ini", ".mov", ".png", ".rtf", ".ttf", ".wav"], "resource_paths": [], "ignore_dds_mips": True,
    }
    # The app reads what the command saved: one report file per run.
    library = Library(str(home), config_path=str(home / "workspace.json"))
    library.init()
    assert library.rss_status()["summary"]["identical"] == 1
    assert [run["state"] for run in library.reports.history("example")] == ["succeeded", "succeeded"]


def test_rejects_unknown_workspaces_before_running_any(tmp_path, monkeypatch, capsys):
    home = configure(tmp_path, monkeypatch)
    assert main(["report", "same", "missing"]) == 2
    assert "unknown workspace missing. Workspaces: example, same, empty" in capsys.readouterr().err
    assert not (home / "sync-reports").exists()
