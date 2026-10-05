"""The GDA sync comparison (a port of docs/rss_sync/gda_sync.py), its background runs and its API."""

import json
import struct
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.library import Library
import re

from egt_gda_sync.rss_jobs import SyncJobs, report_name
from egt_gda_sync.rss_sync import (
    DDS_HEADER_END, Config, compare, declared_path_lines, load_documents, make_config, mip_chain_only_differs,
)
from egt_gda_sync.server import create_app
from tests.conftest import session_headers


def dds(levels: list[bytes], *, width: int = 8, height: int = 8, format_id: int = 98,
        caps2: int = 0, array_size: int = 1) -> bytes:
    """Build a DX10 DDS file whose pixel data is the given mip levels, largest first."""
    header = bytearray(DDS_HEADER_END)
    header[0:4] = b"DDS "
    struct.pack_into("<I", header, 4, 124)
    struct.pack_into("<II", header, 12, height, width)
    struct.pack_into("<I", header, 28, len(levels))
    struct.pack_into("<I", header, 76, 32)
    header[84:88] = b"DX10"
    struct.pack_into("<I", header, 112, caps2)
    return bytes(header) + struct.pack("<IIIII", format_id, 3, 0, array_size, 0) + b"".join(levels)


def statuses(result: dict) -> list[tuple[str, str]]:
    return [(row["status"], row["resource"]) for row in result["differences"]]


def write_example(root: Path) -> tuple[Path, Path]:
    """The scenario of the script's own test: every status, includes, a frame range and a decoy GDA file."""
    game, gda = root / "resources" / "example", root / "gda"
    game.mkdir(parents=True)
    (gda / "a").mkdir(parents=True)
    (gda / "b").mkdir()
    (game / "same.dds").write_bytes(b"same")
    (game / "changed.dds").write_bytes(b"new")
    (game / "required.dds").write_bytes(b"required")
    (game / "unlisted.dds").write_bytes(b"other")
    (gda / "a" / "same.dds").write_bytes(b"wrong")
    (gda / "b" / "same.dds").write_bytes(b"same")
    (gda / "a" / "changed.dds").write_bytes(b"old")
    (game / "AllRssData.json").write_text(
        '{\n  "include": ["RssRawData.json", "RssImagesSeqData.json"],\n  "rawFiles": [{"path": "required.dds"}]\n}\n')
    (game / "RssRawData.json").write_text(
        '{\n  "rawFiles": [\n    {"path": "same.dds"},\n    {"path": "changed.dds"},\n    {"path": "required.dds"}\n  ]\n}\n')
    (game / "RssImagesSeqData.json").write_text(
        '{\n  "imagesSeq": [\n    {"id": "seq", "frameTime": 60, "loopCount": 0,\n'
        '     "frames": [{"path": "frame_{000-001}.dds"}]}\n  ]\n}\n')
    (game / "frame_000.dds").write_bytes(b"frame")
    (game / "frame_001.dds").write_bytes(b"frame")
    (gda / "a" / "frame_000.dds").write_bytes(b"frame")
    return game, gda


def test_classifies_every_status_with_descriptor_lines_and_lists_identical_files(tmp_path):
    _game, gda = write_example(tmp_path)
    result = compare(Config(tmp_path / "resources", gda, frozenset({".dds"}), "example",
                            resource_paths=("extra-missing.dds", "../../outside.dds")))
    assert result["summary"] == {"compared": 6, "identical": 2, "identicalMipOnly": 0, "missing": 3, "different": 1, "invalid": 2}
    # The script's report order: by status string, then resource.
    assert statuses(result) == [
        ("different SHA-256", "changed.dds"),
        ("invalid: outside resources_dir", "../../outside.dds"),
        ("invalid: source file does not exist", "extra-missing.dds"),
        ("missing", "frame_001.dds"), ("missing", "required.dds"), ("missing", "unlisted.dds"),
    ]
    rows = {row["resource"]: row for row in result["differences"] + result["identical"]}
    assert rows["required.dds"]["requiredBy"] == [{"descriptor": "AllRssData.json", "line": 3}, {"descriptor": "RssRawData.json", "line": 5}]
    assert rows["frame_001.dds"]["requiredBy"] == [{"descriptor": "RssImagesSeqData.json", "line": 4}]
    assert rows["unlisted.dds"]["requiredBy"] == []
    assert [file["path"] for file in rows["changed.dds"]["gdaFiles"]] == ["a/changed.dds"]
    assert rows["changed.dds"]["gdaFiles"][0]["absolutePath"] == str((gda / "a" / "changed.dds").resolve())
    assert rows["../../outside.dds"]["scope"] == "outside" and rows["same.dds"]["scope"] == "game"
    # Identical files are listed with the GDA copy that matched, past the same-named decoy.
    assert [(row["resource"], row["gdaFiles"][0]["path"], row["mipOnly"]) for row in result["identical"]] == [
        ("frame_000.dds", "a/frame_000.dds", False), ("same.dds", "b/same.dds", False),
    ]
    assert len({row["id"] for row in rows.values()}) == len(rows)
    # The parsed descriptors come just before the summary: one per file, with its declarations before and after ranges.
    assert list(result).index("descriptors") == list(result).index("summary") - 1
    assert [(item["name"], item["type"], item["declarations"], item["resources"]) for item in result["descriptors"]] == [
        ("AllRssData.json", "AllRssData", 1, 1), ("RssImagesSeqData.json", "RssImagesSeqData", 1, 2), ("RssRawData.json", "RssRawData", 3, 3),
    ]
    assert result["descriptors"][0]["path"] == str((tmp_path / "resources" / "example" / "AllRssData.json").resolve())


def test_finds_the_line_of_every_audio_sample(tmp_path):
    game = tmp_path / "example"
    game.mkdir()
    descriptor = game / "RssAudioData.json"
    descriptor.write_text('{\n  "audioEvents": [\n    {"id": "beep", "samples": [\n'
                          '      "one\\u0020sample.wav",\n      "two.wav"\n    ]}\n  ]\n}\n')
    document = load_documents(game)[descriptor]
    assert list(declared_path_lines(descriptor, document)) == [("one sample.wav", 4), ("two.wav", 5)]


def test_dds_files_that_differ_only_in_mip_levels_count_as_identical(tmp_path):
    top, middle, small = b"T" * 64, b"m" * 16, b"n" * 4
    one, three = dds([top]), dds([top, middle, small])
    assert mip_chain_only_differs(one, three) and mip_chain_only_differs(three, one)
    assert not mip_chain_only_differs(dds([b"X" * 64]), three)
    assert not mip_chain_only_differs(dds([top], width=16), three)
    assert not mip_chain_only_differs(dds([top], format_id=71), three)
    assert not mip_chain_only_differs(dds([]), three)
    assert not mip_chain_only_differs(b"not a dds file", three)
    assert not mip_chain_only_differs(dds([top], caps2=1), dds([top, middle], caps2=1))
    assert not mip_chain_only_differs(dds([top], array_size=2), dds([top, middle], array_size=2))

    game, gda = tmp_path / "resources" / "example", tmp_path / "gda"
    game.mkdir(parents=True)
    gda.mkdir()
    (game / "RssRawData.json").write_text(json.dumps({"rawFiles": [{"path": "mips.dds"}, {"path": "other.dds"}]}))
    (game / "mips.dds").write_bytes(dds([top, middle]))
    (gda / "mips.dds").write_bytes(dds([top]))
    (game / "other.dds").write_bytes(dds([b"A" * 64, middle]))
    (gda / "other.dds").write_bytes(dds([b"B" * 64]))

    def run(ignore: bool) -> dict:
        return compare(Config(tmp_path / "resources", gda, frozenset({".dds"}), "example", ignore_dds_mips=ignore))

    result = run(True)
    assert (result["summary"]["identical"], result["summary"]["identicalMipOnly"], result["summary"]["compared"]) == (1, 1, 2)
    assert statuses(result) == [("different SHA-256", "other.dds")]
    assert result["identical"][0]["mipOnly"] is True
    assert {row["resource"] for row in run(False)["differences"]} == {"mips.dds", "other.dds"}


def test_lists_the_closest_gda_folder_first(tmp_path):
    game, gda = tmp_path / "resources" / "example", tmp_path / "gda"
    for directory in (game / "art" / "folder", gda / "a_elsewhere", gda / "z" / "folder"):
        directory.mkdir(parents=True)
    (game / "RssRawData.json").write_text(json.dumps({"rawFiles": [{"path": "art/folder/x.dds"}]}))
    (game / "art" / "folder" / "x.dds").write_bytes(b"game")
    (gda / "a_elsewhere" / "x.dds").write_bytes(b"one")
    (gda / "z" / "folder" / "x.dds").write_bytes(b"two")
    result = compare(Config(tmp_path / "resources", gda, frozenset({".dds"}), "example"))
    assert [file["path"] for file in result["differences"][0]["gdaFiles"]] == ["z/folder/x.dds", "a_elsewhere/x.dds"]


def test_looks_up_common_assets_in_the_common_gda_folder(tmp_path):
    game, common = tmp_path / "resources" / "example", tmp_path / "resources" / "common" / "art"
    gda, common_gda = tmp_path / "gda", tmp_path / "common_gda" / "DEV" / "01_MG"
    for directory in (game, common, gda, common_gda):
        directory.mkdir(parents=True)
    (game / "RssRawData.json").write_text(json.dumps({"rawFiles": [{"path": "../common/art/shared.dds"}, {"path": "../common/art/kept.dds"}]}))
    (game / "own.dds").write_bytes(b"own")
    (common / "shared.dds").write_bytes(b"shared")
    (common / "kept.dds").write_bytes(b"kept")
    (gda / "shared.dds").write_bytes(b"decoy")
    (gda / "kept.dds").write_bytes(b"kept")
    (common_gda / "shared.dds").write_bytes(b"shared")
    (common_gda / "own.dds").write_bytes(b"own")  # must not satisfy a game file

    def run(common_gda_dir):
        return compare(Config(tmp_path / "resources", gda, frozenset({".dds"}), "example", common_gda_dir=common_gda_dir))

    result = run(tmp_path / "common_gda")
    assert (result["summary"]["identical"], result["summary"]["compared"]) == (2, 3)
    assert statuses(result) == [("missing", "own.dds")]
    shared = next(row for row in result["identical"] if row["resource"] == "../common/art/shared.dds")
    assert shared["scope"] == "common" and shared["gdaFiles"][0]["tree"] == "common"
    result = run(None)
    assert (result["summary"]["identical"], result["summary"]["compared"]) == (1, 3)
    assert set(statuses(result)) == {("different SHA-256", "../common/art/shared.dds"), ("missing", "own.dds")}


def test_validates_settings_with_the_script_messages(tmp_path):
    (tmp_path / "resources" / "example").mkdir(parents=True)
    (tmp_path / "gda").mkdir()
    base = {"resources_dir": str(tmp_path / "resources"), "gda_dir": str(tmp_path / "gda"), "game": "example", "extensions": [".DDS"]}
    assert make_config(base).extensions == frozenset({".dds"})
    assert make_config(base).ignore_dds_mips is True
    for change, message in (
        ({"game": "../example"}, "game must be one directory name"),
        ({"extensions": ["dds"]}, "extensions must be a nonempty list"),
        ({"ignore_dds_mips": "yes"}, "ignore_dds_mips must be true or false"),
        ({"gda_dir": str(tmp_path / "absent")}, "gda_dir does not exist"),
        ({"common_gda_dir": str(tmp_path / "absent")}, "common_gda_dir does not exist"),
        ({"game": "other"}, "game directory does not exist"),
    ):
        with pytest.raises(ValueError, match=message):
            make_config({**base, **change})


WORKSPACE = {"id": "example", "game_name": "Example"}  # The settings a run stores as given; the library fills them in.
REPORT_FILE = re.compile(r"example-\d{10}\.json")


def report_files(folder: Path) -> list[str]:
    return sorted(path.name for path in folder.glob("*.json"))


def test_each_run_saves_a_timestamped_report_and_a_failed_run_keeps_the_last_result(tmp_path):
    write_example(tmp_path)
    jobs = SyncJobs(str(tmp_path / "reports"))
    settings = {"resources_dir": str(tmp_path / "resources"), "gda_dir": str(tmp_path / "gda"), "game": "example", "extensions": [".dds"]}
    jobs.start("example", WORKSPACE, settings)
    assert jobs.status("example")["running"] is True
    jobs.wait("example", 60)
    status = jobs.status("example")
    assert status["running"] is False and status["lastRun"]["state"] == "succeeded"
    assert status["summary"]["missing"] == 3 and status["comparedAt"] == status["lastRun"]["finishedAt"]
    report = json.loads(jobs.report("example"))
    assert report["workspace"] == WORKSPACE
    # The run's state and times lead the summary, the counts follow, and nothing repeats them at the top level.
    assert list(report["summary"])[:4] == ["state", "startedAt", "finishedAt", "compared"]
    assert list(report) == ["version", "workspace", "game", "resourcesDir", "gameDir", "gdaDir", "commonGdaDir", "extensions",
                            "ignoreDdsMips", "descriptors", "summary", "differences", "identical"]
    assert report["summary"]["state"] == "succeeded" and report["summary"]["finishedAt"] == status["comparedAt"]
    assert not {"run", "lastRun", "startedAt", "finishedAt", "history"} & set(report)
    counts = {key: value for key, value in report["summary"].items() if key not in ("state", "startedAt", "finishedAt", "error")}
    assert report["game"] == "example" and len(report["differences"]) == 4 and len(report["identical"]) == 2
    [first] = report_files(tmp_path / "reports")
    assert REPORT_FILE.fullmatch(first) and status["reportPath"] == str(tmp_path / "reports" / first)

    jobs.start("example", WORKSPACE, {**settings, "game": "absent"})
    jobs.wait("example", 60)
    status = jobs.status("example")
    assert status["lastRun"]["state"] == "failed" and "game directory does not exist" in status["lastRun"]["error"]
    assert status["summary"] == counts and status["comparedAt"] == report["summary"]["finishedAt"]
    assert json.loads(jobs.report("example"))["identical"] == report["identical"]
    # The failed run has a file of its own with only the failure, and the newest name sorts last.
    files = report_files(tmp_path / "reports")
    assert len(files) == 2 and files[0] == first and status["reportPath"] == str(tmp_path / "reports" / files[1])
    failed = json.loads((tmp_path / "reports" / files[1]).read_text())
    assert set(failed) == {"version", "workspace", "summary"} and set(failed["summary"]) == {"state", "startedAt", "finishedAt", "error"}
    assert failed["summary"]["state"] == "failed"
    assert jobs.report("other") is None and jobs.status("other")["summary"] is None
    # The history is the list of report files, newest first; only a successful run has counts.
    history = jobs.history("example")
    assert [(run["state"], run["file"]) for run in history] == [("failed", files[1]), ("succeeded", files[0])]
    assert "summary" not in history[0] and history[1]["summary"] == counts
    assert history[1]["finishedAt"] == report["summary"]["finishedAt"] and jobs.history("other") == []


def test_reports_from_an_earlier_version_are_one_run_each_and_their_stored_history_is_ignored(tmp_path):
    write_example(tmp_path)
    jobs = SyncJobs(str(tmp_path / "reports"))
    (tmp_path / "reports").mkdir()
    last = {"state": "succeeded", "startedAt": "2026-10-01T10:00:00.000Z", "finishedAt": "2026-10-01T10:00:02.000Z"}
    summary = {"compared": 1, "identical": 1, "identicalMipOnly": 0, "missing": 0, "different": 0, "invalid": 0}
    older = {"state": "failed", "startedAt": "2026-09-30T10:00:00.000Z", "finishedAt": "2026-09-30T10:00:01.000Z", "error": "x"}
    (tmp_path / "reports" / "example.json").write_text(json.dumps(
        {"version": 1, "lastRun": last, "summary": summary, "history": [{**last, "summary": summary}, older]}))
    # A later version kept the run in "run", with the times also at the top level.
    (tmp_path / "reports" / "example-1790848801.json").write_text(json.dumps(
        {"version": 1, "run": older, "startedAt": older["startedAt"], "finishedAt": older["finishedAt"]}))
    assert jobs.history("example") == [{**older, "file": "example-1790848801.json"}, {**last, "summary": summary, "file": "example.json"}]
    assert jobs.status("example")["summary"] == summary and jobs.status("example")["comparedAt"] == last["finishedAt"]
    jobs.start("example", WORKSPACE, {"resources_dir": str(tmp_path / "resources"), "gda_dir": str(tmp_path / "gda"),
                                      "game": "example", "extensions": [".dds"]})
    jobs.wait("example", 60)
    assert [run["file"] for run in jobs.history("example")][1:] == ["example-1790848801.json", "example.json"]


def test_report_files_are_named_after_the_workspace_and_the_unix_time_the_run_finished():
    finished = "2026-10-05T10:13:14.567Z"
    assert report_name("joker_reels_coins_10", finished) == "joker_reels_coins_10-1791195194.json"
    assert report_name("../escape", finished).startswith("workspace-") and report_name("a/b", finished) != report_name("a\\b", finished)


def test_the_newest_report_is_found_by_its_timestamp(tmp_path):
    names = ["example.json", "example-1791158399.json", "example-1791195194.json", "example-1791195194_2.json",
             "example-20261006T000000Z.json", "examples-1791244801.json", "other.json"]
    for name in names:
        (tmp_path / name).write_text("{}")
    jobs = SyncJobs(str(tmp_path))
    # Newest first, by time: a date-named report from an earlier version (2026-10-06) sorts among the epoch names,
    # one saved before names had a timestamp is the oldest, and another workspace's reports are left out.
    assert [Path(file).name for file in jobs._files("example")] == [names[4], names[3], names[2], names[1], names[0]]
    # Sorting the epoch names alone gives the same order, for example in a file manager.
    assert sorted(names[1:4]) == names[1:4]


def test_rescan_starts_the_comparison_and_the_api_serves_the_workspace_report(tmp_path):
    _game, gda = write_example(tmp_path)
    (tmp_path / "common").mkdir()
    entry = {"id": "example", "game_name": "Example", "game_path": str(tmp_path / "resources" / "example"),
             "gda_path": str(gda), "common_gda_path": "common", "extensions": [".dds", ".wav"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        assert client.get("/api/rss-sync/report").status_code == 404
        assert client.get("/api/library").json()["rssSync"]["running"] is False
        scanned = client.post("/api/scan", headers=session_headers(client)).json()
        assert scanned["rssSync"]["running"] is True and scanned["rssSync"]["workspaceId"] == "example"
        library.reports.wait("example", 60)
        status = client.get("/api/rss-sync").json()
        assert status["lastRun"]["state"] == "succeeded" and status["summary"]["compared"] == 6
        history = client.get("/api/rss-sync/history").json()
        assert history["workspaceId"] == "example" and history["history"][0]["summary"] == status["summary"]
        assert history["history"][0]["file"] == Path(status["reportPath"]).name
        report = client.get("/api/rss-sync/report").json()
        # The report keeps the workspace settings the run used, with defaults filled in, whatever workspace.json says later.
        assert report["workspace"] == {
            "id": "example", "game_name": "Example", "game_path": str((tmp_path / "resources" / "example").resolve()),
            "gda_path": str(gda.resolve()), "common_gda_path": str(tmp_path / "common"), "extensions": [".dds", ".wav"],
            "resource_paths": [], "ignore_dds_mips": True,
        }
        assert report["commonGdaDir"] == str((tmp_path / "common").resolve())
        assert report["extensions"] == [".dds", ".wav"]
    assert REPORT_FILE.fullmatch(report_files(tmp_path / "app" / "sync-reports")[0])
