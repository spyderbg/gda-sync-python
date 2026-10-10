"""The GDA sync comparison (a port of docs/rss_sync/gda_sync.py), its background runs and its API."""

import contextlib
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
from tests.fixtures.bc7_dds import create_bc7_dds
from tests.fixtures.png_reader import read_png


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
    # The image sequence is one resource: one of its two frames is missing. No descriptor declares unlisted.dds.
    assert result["summary"] == {"compared": 4, "identical": 1, "identicalMipOnly": 0, "missing": 2, "different": 1, "invalid": 2,
                                 "supplementary": 1}
    # The script's report order: by status string, then resource.
    assert statuses(result) == [
        ("different SHA-256", "changed.dds"),
        ("invalid: outside resources_dir", "../../outside.dds"),
        ("invalid: source file does not exist", "extra-missing.dds"),
        ("missing (1 of 2 files)", "frame_{000-001}.dds"), ("missing", "required.dds"), ("supplementary", "unlisted.dds"),
    ]
    rows = {row["resource"]: row for row in result["differences"] + result["identical"]}
    # Each entry that declares a resource, with its type and id.
    assert rows["required.dds"]["requiredBy"] == [{"descriptor": "AllRssData.json", "line": 3, "type": "RawFile"},
                                                  {"descriptor": "RssRawData.json", "line": 5, "type": "RawFile"}]
    assert rows["frame_{000-001}.dds"]["requiredBy"] == [{"descriptor": "RssImagesSeqData.json", "line": 4, "type": "ImageSequence", "id": "seq"}]
    assert [(frame["resource"], frame["category"]) for frame in rows["frame_{000-001}.dds"]["sequence"]["frames"]] == [
        ("frame_000.dds", "identical"), ("frame_001.dds", "missing")]
    assert rows["unlisted.dds"]["requiredBy"] == [] and rows["unlisted.dds"]["gdaFiles"] == []
    assert [file["path"] for file in rows["changed.dds"]["gdaFiles"]] == ["a/changed.dds"]
    assert rows["changed.dds"]["gdaFiles"][0]["absolutePath"] == str((gda / "a" / "changed.dds").resolve())
    assert rows["../../outside.dds"]["scope"] == "outside" and rows["same.dds"]["scope"] == "game"
    # Identical files are listed with the GDA copy that matched, past the same-named decoy.
    assert [(row["resource"], row["gdaFiles"][0]["path"], row["mipOnly"]) for row in result["identical"]] == [
        ("same.dds", "b/same.dds", False),
    ]
    assert len({row["id"] for row in rows.values()}) == len(rows)
    # The parsed descriptors come just before the summary: one per file, with its declarations before and after ranges.
    assert list(result).index("descriptors") == list(result).index("summary") - 1
    assert [(item["name"], item["type"], item["declarations"], item["resources"]) for item in result["descriptors"]] == [
        ("AllRssData.json", "AllRssData", 1, 1), ("RssImagesSeqData.json", "RssImagesSeqData", 1, 2), ("RssRawData.json", "RssRawData", 3, 3),
    ]
    assert result["descriptors"][0]["path"] == str((tmp_path / "resources" / "example" / "AllRssData.json").resolve())


def write_sequences(root: Path) -> tuple[Path, Path]:
    """Image sequences: a {N-M} range with two changed frames, an atlas that repeats one file with source rectangles,
    and a sequence whose only compared file is in sync. One frame is also declared as an image."""
    game, gda = root / "resources" / "example", root / "gda"
    (game / "anim").mkdir(parents=True)
    (gda / "DDS" / "anim").mkdir(parents=True)
    for number, (game_data, gda_data) in enumerate([(b"0", b"0"), (b"1", b"one"), (b"2", b"two")]):
        (game / "anim" / f"a_{number:02d}.dds").write_bytes(game_data)
        (gda / "DDS" / "anim" / f"a_{number:02d}.dds").write_bytes(gda_data)
    (game / "atlas.dds").write_bytes(b"atlas")
    (game / "cover.png").write_bytes(b"png")
    (game / "RssImagesSeqData.json").write_text(json.dumps({"imagesSeq": [
        {"id": "ANIM", "frameTime": 42, "loopCount": 0, "loopTo": 1, "frames": [{"path": "anim/a_{00-02}.dds"}]},
        {"id": "ATLAS", "frameTime": 60, "loopCount": 2, "frames": [
            {"path": "atlas.dds", "source": {"x": 0, "y": 0, "w": 4, "h": 4}},
            {"path": "atlas.dds", "source": {"x": 4, "y": 0, "w": 4, "h": 4}},
        ]},
        {"id": "MIXED", "frameTime": 30, "loopCount": 1, "frames": [{"path": "cover.png"}, {"path": "anim/a_00.dds"}]},
    ]}, indent=2))
    (game / "RssImagesData.json").write_text(json.dumps({"images": [{"id": "FIRST", "path": "anim/a_01.dds"}]}, indent=2))
    return game, gda


def test_an_image_sequence_is_one_resource_with_its_frames(tmp_path):
    game, gda = write_sequences(tmp_path)
    result = compare(Config(tmp_path / "resources", gda, frozenset({".dds"}), "example"))
    rows = {row.get("sequence", {}).get("id", row["resource"]): row for row in result["differences"] + result["identical"]}
    # The frame files are not rows of their own, except a_01.dds, which is also declared as an image.
    assert set(rows) == {"ANIM", "ATLAS", "MIXED", "anim/a_01.dds"}
    assert result["summary"] == {"compared": 4, "identical": 1, "identicalMipOnly": 0, "missing": 1, "different": 2, "invalid": 0,
                                 "supplementary": 0}

    anim = rows["ANIM"]
    assert (anim["category"], anim["status"], anim["resource"]) == ("different", "different SHA-256 (2 of 3 files)", "anim/a_{00-02}.dds")
    assert anim["resourcePath"] == str((game / "anim" / "a_{00-02}.dds").resolve())
    assert anim["requiredBy"] == [{"descriptor": "RssImagesSeqData.json", "line": 10, "type": "ImageSequence", "id": "ANIM"}]
    assert anim["scope"] == "game"
    sequence = anim["sequence"]
    assert (sequence["frameTime"], sequence["loopCount"], sequence["loopTo"], sequence["paths"]) == (42, 0, 1, ["anim/a_{00-02}.dds"])
    assert [(frame["resource"], frame["category"]) for frame in sequence["frames"]] == [
        ("anim/a_00.dds", "identical"), ("anim/a_01.dds", "different"), ("anim/a_02.dds", "different")]
    assert sequence["frames"][1]["gdaFiles"][0]["absolutePath"] == str((gda / "DDS" / "anim" / "a_01.dds").resolve())
    # The sequence lists the GDA file of each frame, the one that matched or the closest.
    assert [file["path"] for file in anim["gdaFiles"]] == ["DDS/anim/a_00.dds", "DDS/anim/a_01.dds", "DDS/anim/a_02.dds"]

    # An atlas repeats one file, so its status counts the file once; each frame keeps its source rectangle.
    atlas = rows["ATLAS"]
    assert (atlas["category"], atlas["status"]) == ("missing", "missing")
    assert [frame["source"] for frame in atlas["sequence"]["frames"]] == [{"x": 0, "y": 0, "w": 4, "h": 4}, {"x": 4, "y": 0, "w": 4, "h": 4}]
    assert atlas["sequence"]["loopTo"] is None

    # A frame whose extension is not compared stays in the sequence, so it still plays.
    mixed = rows["MIXED"]
    assert (mixed["category"], mixed["status"], mixed["mipOnly"]) == ("identical", "identical", False)
    assert [(frame["category"], frame["status"]) for frame in mixed["sequence"]["frames"]] == [("skipped", "not compared"), ("identical", "identical")]
    assert mixed["sequence"]["paths"] == ["cover.png", "anim/a_00.dds"] and mixed["resource"] == "cover.png"
    assert rows["anim/a_01.dds"]["requiredBy"] == [{"descriptor": "RssImagesData.json", "line": 5, "type": "Image", "id": "FIRST"}]
    assert len({row["id"] for row in rows.values()}) == len(rows)


def test_files_no_descriptor_declares_are_supplementary_and_numbered_images_are_guessed_sequences(tmp_path):
    resources, gda = tmp_path / "resources", tmp_path / "gda"
    game = resources / "example"
    for directory in (game / "glow", game / "spark", game / "sizes", game / "s", gda):
        directory.mkdir(parents=True)
    (game / "RssRawData.json").write_text(json.dumps({"rawFiles": [{"path": "used.dds"}]}))
    (game / "used.dds").write_bytes(b"used")
    (gda / "used.dds").write_bytes(b"used")
    # Five frames in a row, one after a gap and a lone PNG; only four in a row; sizes that do not follow each other;
    # numbered sounds; and a file whose extension is not compared.
    for name in ("glow/glow01.dds", "glow/glow02.dds", "glow/glow03.dds", "glow/glow04.dds", "glow/glow05.dds", "glow/glow07.dds",
                 "glow/glow02.png", "spark/spark1.dds", "spark/spark2.dds", "spark/spark3.dds", "spark/spark4.dds",
                 "sizes/button_237.dds", "sizes/button_711.dds", "s/stop_1.wav", "s/stop_2.wav", "s/stop_3.wav", "readme.txt"):
        (game / name).write_bytes(name.encode())
    (gda / "glow01.dds").write_bytes(b"a supplementary file is not compared")
    result = compare(Config(resources, gda, frozenset({".dds", ".png", ".wav"}), "example"))

    assert result["summary"] == {"compared": 1, "identical": 1, "identicalMipOnly": 0, "missing": 0, "different": 0, "invalid": 0,
                                 "supplementary": 12}
    assert statuses(result) == [("supplementary", resource) for resource in (
        "glow/glow02.png", "glow/glow07.dds", "glow/glow{01-05}.dds", "s/stop_1.wav", "s/stop_2.wav", "s/stop_3.wav",
        "sizes/button_237.dds", "sizes/button_711.dds", "spark/spark1.dds", "spark/spark2.dds", "spark/spark3.dds", "spark/spark4.dds")]
    rows = {row["resource"]: row for row in result["differences"]}
    assert all(row["gdaFiles"] == [] and row["requiredBy"] == [] and row["scope"] == "game" for row in rows.values())
    assert "sequence" not in rows["glow/glow07.dds"] and "sequence" not in rows["spark/spark4.dds"]
    guessed = rows["glow/glow{01-05}.dds"]
    assert guessed["resourcePath"] == str((game / "glow" / "glow{01-05}.dds").resolve())
    sequence = guessed["sequence"]
    assert (sequence["id"], sequence["guessed"], sequence["frameTime"], sequence["loopCount"], sequence["loopTo"]) == (None, True, 50, 0, None)
    assert sequence["paths"] == ["glow/glow{01-05}.dds"]
    assert [(frame["resource"], frame["category"]) for frame in sequence["frames"]] == [
        (f"glow/glow0{number}.dds", "supplementary") for number in range(1, 6)]
    assert len({row["id"] for row in rows.values()}) == len(rows)


def test_finds_the_line_of_every_audio_sample(tmp_path):
    game = tmp_path / "example"
    game.mkdir()
    descriptor = game / "RssAudioData.json"
    descriptor.write_text('{\n  "audioEvents": [\n    {"id": "beep", "samples": [\n'
                          '      "one\\u0020sample.wav",\n      "two.wav"\n    ]}\n  ]\n}\n')
    document = load_documents(game)[descriptor]
    assert list(declared_path_lines(descriptor, document)) == [("one sample.wav", 4, None), ("two.wav", 5, None)]


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
    (game / "RssRawData.json").write_text(json.dumps({"rawFiles": [{"path": "../common/art/shared.dds"}, {"path": "../common/art/kept.dds"},
                                                                  {"path": "own.dds"}]}))
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


def test_only_a_file_inside_the_game_folder_is_reported_missing(tmp_path):
    resources, gda = tmp_path / "resources", tmp_path / "gda"
    game = resources / "example"
    for directory in (game / "art", resources / "common", resources / "other", gda):
        directory.mkdir(parents=True)
    (game / "RssRawData.json").write_text(json.dumps({"rawFiles": [{"path": "../common/shared.dds"}, {"path": "../other/x.dds"},
                                                                  {"path": "art/own.dds"}]}))
    (game / "art" / "own.dds").write_bytes(b"own")
    (resources / "common" / "shared.dds").write_bytes(b"shared")
    (resources / "other" / "x.dds").write_bytes(b"x")
    result = compare(Config(resources, gda, frozenset({".dds"}), "example"))
    assert statuses(result) == [("missing", "art/own.dds")]
    assert (result["summary"]["compared"], result["summary"]["missing"]) == (1, 1)
    # A file outside the game folder is still compared when the GDA has a file with its name.
    (gda / "shared.dds").write_bytes(b"other")
    result = compare(Config(resources, gda, frozenset({".dds"}), "example"))
    assert statuses(result) == [("different SHA-256", "../common/shared.dds"), ("missing", "art/own.dds")]
    assert result["summary"]["compared"] == 2


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
    assert status["summary"]["missing"] == 2 and status["comparedAt"] == status["lastRun"]["finishedAt"]
    report = json.loads(jobs.report("example"))
    assert report["workspace"] == WORKSPACE
    # The run's state and times lead the summary, the counts follow, and nothing repeats them at the top level.
    assert list(report["summary"])[:4] == ["state", "startedAt", "finishedAt", "compared"]
    assert list(report) == ["version", "workspace", "descriptors", "summary", "imageCompare", "differences", "identical"]
    assert report["summary"]["state"] == "succeeded" and report["summary"]["finishedAt"] == status["comparedAt"]
    assert not {"run", "lastRun", "startedAt", "finishedAt", "history"} & set(report)
    counts = {key: value for key, value in report["summary"].items() if key not in ("state", "startedAt", "finishedAt", "error")}
    assert report["version"] == 7 and len(report["differences"]) == 4 and len(report["identical"]) == 1
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
    # A successful run says how many descriptors it parsed. Settings in the shape of an earlier version are left out.
    assert "workspace" not in history[0] and "workspace" not in history[1]
    assert "descriptors" not in history[0] and history[1]["descriptors"] == len(report["descriptors"])
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
        assert status["lastRun"]["state"] == "succeeded" and status["summary"]["compared"] == 4
        history = client.get("/api/rss-sync/history").json()
        assert history["workspaceId"] == "example" and history["history"][0]["summary"] == status["summary"]
        assert history["workspace"]["game_name"] == "Example" and history["workspace"] == history["history"][0]["workspace"]
        assert history["history"][0]["file"] == Path(status["reportPath"]).name
        report = client.get("/api/rss-sync/report").json()
        # The report keeps the workspace settings the run used, with defaults filled in, whatever workspace.json says later.
        assert report["workspace"] == {
            "id": "example", "game_name": "Example", "game_path": str((tmp_path / "resources" / "example").resolve()),
            "gda_path": str(gda.resolve()), "common_gda_path": str(tmp_path / "common"), "extensions": [".dds", ".wav"],
            "resource_paths": [], "ignore_dds_mips": True, "multithreading": True, "use_gpu": False, "image_match_threshold": 50.0,
        }
        # The settings are kept only there.
        assert not {"game", "resourcesDir", "gameDir", "gdaDir", "commonGdaDir", "extensions", "ignoreDdsMips"} & set(report)
    assert REPORT_FILE.fullmatch(report_files(tmp_path / "app" / "sync-reports")[0])


def test_a_sync_report_is_deleted_from_the_history_and_the_sync_page_shows_the_one_before(tmp_path):
    _game, gda = write_example(tmp_path)
    entry = {"id": "example", "game_name": "Example", "game_path": str(tmp_path / "resources" / "example"), "gda_path": str(gda),
             "extensions": [".dds", ".wav"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    for _run in range(2):
        assert library.compare_workspace("example")["state"] == "succeeded"
    # A third, from another workspace, is not this workspace's.
    other = tmp_path / "app" / "sync-reports" / "other-1791195194.json"
    other.write_text("{}")
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        headers = session_headers(client)
        newest, older = (run["file"] for run in client.get("/api/rss-sync/history").json()["history"])
        assert client.post("/api/rss-sync/delete-report", json={"file": newest}).status_code == 403
        deleted = client.post("/api/rss-sync/delete-report", headers=headers, json={"file": newest}).json()
        assert [run["file"] for run in deleted["history"]] == [older]
        # The Sync page shows the newest successful report left.
        assert Path(deleted["library"]["rssSync"]["reportPath"]).name == older
        assert not (tmp_path / "app" / "sync-reports" / newest).exists()
        for name in (newest, other.name, "../workspace.json", "a/b.json"):
            refused = client.post("/api/rss-sync/delete-report", headers=headers, json={"file": name})
            assert refused.status_code in (400, 404), name
        assert other.exists()


def test_syncing_report_rows_copies_the_closest_gda_file_over_the_game_resource_and_compares_again(tmp_path):
    game, gda = write_example(tmp_path)
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda), "extensions": [".dds"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        headers = session_headers(client)
        copy = lambda *ids: client.post("/api/rss-sync/copy", headers=headers, json={"ids": list(ids)})
        assert copy("unknown").status_code == 404
        client.post("/api/scan", headers=headers)
        library.reports.wait("example", 60)
        rows = {row["resource"]: row for row in client.get("/api/rss-sync/report").json()["differences"]}
        assert copy("unknown").json()["error"] == "A resource is no longer in the GDA sync report. Rescan and try again."
        assert copy(rows["required.dds"]["id"]).json()["error"] == "Only a resource that differs from its GDA file can be synced"

        # The report is only data: a path outside the workspace folders is never copied.
        report = Path(client.get("/api/rss-sync").json()["reportPath"])
        original = report.read_text()
        (tmp_path / "elsewhere.dds").write_bytes(b"elsewhere")
        report.write_text(original.replace(str((gda / "a" / "changed.dds").resolve()), str(tmp_path / "elsewhere.dds")))
        refused = copy(rows["changed.dds"]["id"]).json()
        assert refused["copied"] == [] and refused["failures"] == [{"name": "changed.dds", "message": "The files are outside the workspace folders"}]
        assert (game / "changed.dds").read_bytes() == b"new" and refused["library"]["rssSync"]["running"] is False
        report.write_text(original)

        result = copy(rows["changed.dds"]["id"], rows["changed.dds"]["id"]).json()
        assert result["copied"] == ["changed.dds"] and result["failures"] == [] and result["bytes"] == 3
        assert (game / "changed.dds").read_bytes() == b"old"
        assert [path.read_bytes() for path in Path(library.backup_path).rglob("changed.dds")] == [b"new"]
        assert result["library"]["activity"][0]["message"] == "Synced 1 resource to Game"
        assert result["library"]["rssSync"]["running"] is True
        library.reports.wait("example", 60)
        assert client.get("/api/rss-sync").json()["summary"]["different"] == 0


def test_syncing_an_image_sequence_copies_its_different_frames_as_one_resource(tmp_path):
    game, gda = write_sequences(tmp_path)
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda), "extensions": [".dds"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        headers = session_headers(client)
        client.post("/api/scan", headers=headers)
        library.reports.wait("example", 60)
        rows = {row.get("sequence", {}).get("id"): row for row in client.get("/api/rss-sync/report").json()["differences"]}
        result = client.post("/api/rss-sync/copy", headers=headers, json={"ids": [rows["ANIM"]["id"]]}).json()
        assert result["copied"] == ["anim/a_01.dds", "anim/a_02.dds"] and result["resources"] == 1 and result["failures"] == []
        assert [(game / "anim" / f"a_{number:02d}.dds").read_bytes() for number in range(3)] == [b"0", b"one", b"two"]
        assert result["library"]["activity"][0]["message"] == "Synced 1 resource to Game"
        assert result["library"]["activity"][0]["files"] == ["anim/a_01.dds", "anim/a_02.dds"]
        library.reports.wait("example", 60)
        # a_01.dds, also declared as an image, was copied with the sequence.
        assert client.get("/api/rss-sync").json()["summary"]["different"] == 0


def crlf(text: str) -> bytes:
    return text.replace("\n", "\r\n").encode()


RAW_DESCRIPTOR = """{
    "rawFiles": [
        {
            "path": "same.dds"
        },
        {
            "path": "gone.wav"
        },
        {
            "path": "kept.wav"
        }
    ]
}
"""
AUDIO_DESCRIPTOR = """{
    "audioEvents": [
        {
            "id": "BOTH",
            "samples": [
                "gone.wav",
                "kept.wav"
            ]
        },
        {
            "id": "GONE",
            "samples": [
                "gone.wav"
            ]
        }
    ]
}
"""
SEQUENCE_DESCRIPTOR = """{
    "imagesSeq": [
        {
            "id": "BROKEN",
            "frameTime": 40,
            "loopCount": 0,
            "frames": [
                {
                    "path": "broken_{0-1}.dds"
                }
            ]
        },
        {
            "id": "KEPT",
            "frameTime": 40,
            "loopCount": 0,
            "frames": [
                {
                    "path": "same.dds"
                }
            ]
        }
    ]
}
"""


def write_invalid(root: Path) -> tuple[Path, Path]:
    """Descriptors, with CRLF line endings, that declare a file that does not exist as a raw file and as audio samples,
    and an image sequence with a frame that does not exist."""
    game, gda = root / "resources" / "example", root / "gda"
    game.mkdir(parents=True)
    gda.mkdir()
    for name in ("same.dds", "kept.wav", "broken_0.dds"):
        (game / name).write_bytes(name.encode())
        (gda / name).write_bytes(name.encode())
    (game / "RssRawData.json").write_bytes(crlf(RAW_DESCRIPTOR))
    (game / "RssAudioData.json").write_bytes(crlf(AUDIO_DESCRIPTOR))
    (game / "RssImagesSeqData.json").write_bytes(crlf(SEQUENCE_DESCRIPTOR))
    return game, gda


@contextlib.contextmanager
def compared(tmp_path: Path, game: Path, gda: Path, **settings):
    """A client of the app for the workspace, after its first GDA sync, with the report's rows by resource or sequence id."""
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda), "extensions": [".dds", ".wav"], **settings}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        headers = session_headers(client)
        client.post("/api/scan", headers=headers)
        library.reports.wait("example", 60)
        differences = client.get("/api/rss-sync/report").json()["differences"]
        rows = {(row["sequence"]["id"] or row["resource"]) if "sequence" in row else row["resource"]: row for row in differences}
        apply = lambda *rows: client.post("/api/rss-sync/apply", headers=headers, json={
            "resources": [{"id": row["id"], "category": row["category"]} for row in rows]})
        yield client, library, rows, apply


def test_applying_invalid_rows_removes_their_declarations_and_keeps_the_rest_of_the_descriptors(tmp_path):
    game, gda = write_invalid(tmp_path)
    with compared(tmp_path, game, gda) as (client, library, rows, apply):
        assert {name: row["category"] for name, row in rows.items()} == {"gone.wav": "invalid", "BROKEN": "invalid"}
        result = apply(rows["gone.wav"], rows["BROKEN"]).json()
        assert result["removed"] == 2 and result["failures"] == [] and result["copied"] == []
        # The raw file entry goes, and the audio event that would have no samples left; the other keeps its other sample.
        assert (game / "RssRawData.json").read_bytes() == crlf(RAW_DESCRIPTOR.replace(
            '        {\n            "path": "gone.wav"\n        },\n', ""))
        assert (game / "RssAudioData.json").read_bytes() == crlf(
            '{\n    "audioEvents": [\n        {\n            "id": "BOTH",\n            "samples": [\n'
            '                "kept.wav"\n            ]\n        }\n    ]\n}\n')
        assert json.loads((game / "RssImagesSeqData.json").read_bytes())["imagesSeq"] == [
            {"id": "KEPT", "frameTime": 40, "loopCount": 0, "frames": [{"path": "same.dds"}]}]
        # Each changed descriptor is in the backups as it was.
        # The operation's records are beside its folder, not in it.
        backups = {path.name: path.read_bytes() for path in Path(library.backup_path).glob("*/**/*.json")}
        assert backups == {"RssRawData.json": crlf(RAW_DESCRIPTOR), "RssAudioData.json": crlf(AUDIO_DESCRIPTOR),
                           "RssImagesSeqData.json": crlf(SEQUENCE_DESCRIPTOR)}
        activity = result["library"]["activity"][0]
        assert activity["action"] == "cleanup" and activity["message"] == "Removed the declarations of 2 invalid resources"
        assert sorted(activity["files"]) == ["RssAudioData.json", "RssImagesSeqData.json", "RssRawData.json"]
        assert result["library"]["rssSync"]["running"] is True
        library.reports.wait("example", 60)
        summary = client.get("/api/rss-sync").json()["summary"]
        # The frame of the removed sequence that exists is now declared by nothing.
        assert summary["invalid"] == 0 and summary["supplementary"] == 1


def test_applying_supplementary_rows_deletes_their_files_into_the_backups_and_syncs_different_rows(tmp_path):
    game, gda = write_example(tmp_path)
    for number in range(5):
        (game / f"loop{number:02d}.dds").write_bytes(b"loop")
    (game / "late.dds").write_bytes(b"late")
    with compared(tmp_path, game, gda) as (client, library, rows, apply):
        assert [name for name, row in rows.items() if row["category"] == "supplementary"] == ["late.dds", "loop{00-04}.dds", "unlisted.dds"]
        # A file that a descriptor declares since the report was made is kept.
        raw = game / "RssRawData.json"
        raw.write_text(raw.read_text().replace('{"path": "same.dds"}', '{"path": "same.dds"}, {"path": "late.dds"}'))
        result = apply(rows["unlisted.dds"], rows["loop{00-04}.dds"], rows["late.dds"], rows["changed.dds"]).json()
        assert result["deleted"] == 2 and result["resources"] == 1 and result["copied"] == ["changed.dds"]
        assert result["failures"] == [{"name": "late.dds", "message": "A descriptor declares it now. Rescan to update the report."}]
        assert (game / "late.dds").exists() and (game / "changed.dds").read_bytes() == b"old"
        assert not any((game / name).exists() for name in ["unlisted.dds", *(f"loop{number:02d}.dds" for number in range(5))])
        backups = {path.name: path.read_bytes() for path in Path(library.backup_path).rglob("*.dds")}
        assert backups == {"changed.dds": b"new", "unlisted.dds": b"other", **{f"loop{number:02d}.dds": b"loop" for number in range(5)}}
        assert [(entry["action"], entry["message"]) for entry in result["library"]["activity"][:2]] == [
            ("cleanup", "Deleted 2 supplementary resources from Game"), ("sync", "Synced 1 resource to Game")]
        assert sorted(result["library"]["activity"][0]["files"]) == ["loop00.dds", "loop01.dds", "loop02.dds", "loop03.dds", "loop04.dds", "unlisted.dds"]
        library.reports.wait("example", 60)
        summary = client.get("/api/rss-sync").json()["summary"]
        assert summary["supplementary"] == 0 and summary["different"] == 0


def test_applying_report_rows_checks_the_status_the_caller_saw_and_that_the_report_is_still_true(tmp_path):
    game, gda = write_invalid(tmp_path)
    with compared(tmp_path, game, gda, resource_paths=["nowhere.dds"]) as (client, library, rows, apply):
        headers = session_headers(client)
        post = lambda resources: client.post("/api/rss-sync/apply", headers=headers, json={"resources": resources})
        gone = rows["gone.wav"]
        assert post([{"id": gone["id"], "category": "supplementary"}]).json()["error"] == \
            "A resource has another status in the GDA sync report now. Review it and try again."
        # A missing resource has no action.
        assert post([{"id": gone["id"], "category": "missing"}]).status_code == 400
        assert post([{"id": "unknown", "category": "invalid"}]).json()["error"] == "A resource is no longer in the GDA sync report. Rescan and try again."
        # Only the workspace's resource_paths declare nowhere.dds, and gone.wav exists now: nothing changes.
        (game / "gone.wav").write_bytes(b"gone")
        result = apply(rows["nowhere.dds"], gone).json()
        assert result["removed"] == 0 and result["library"]["rssSync"]["running"] is False
        assert result["failures"] == [
            {"name": "nowhere.dds", "message": "No descriptor declares it, only the workspace's resource_paths"},
            {"name": "gone.wav", "message": "Its file exists now. Rescan to update the report."},
        ]
        assert (game / "RssRawData.json").read_bytes() == crlf(RAW_DESCRIPTOR)
        assert not Path(library.backup_path).exists() or not any(Path(library.backup_path).rglob("*.json"))


def test_previews_files_of_the_workspace_folders_that_the_report_names(tmp_path):
    game, gda = write_example(tmp_path)
    (game / "art.dds").write_bytes(create_bc7_dds(8, 4))
    (gda / "b" / "art.png").write_bytes(b"\x89PNG fake")
    (game / "click.wav").write_bytes(b"RIFF fake")
    (gda / "b" / "theme.ogg").write_bytes(b"OggS fake")
    (tmp_path / "secret.png").write_bytes(b"secret")
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda), "extensions": [".dds"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        preview = lambda file: client.get("/api/rss-sync/preview", params={"file": str(file)})
        decoded = preview((game / "art.dds").resolve())
        assert decoded.status_code == 200 and decoded.headers["content-type"] == "image/png"
        assert read_png(decoded.content)[:2] == (8, 4)
        served = preview((gda / "b" / "art.png").resolve())
        assert served.content == b"\x89PNG fake" and "sandbox" in served.headers["content-security-policy"]
        # Audio files play as they are.
        wav = preview((game / "click.wav").resolve())
        assert wav.content == b"RIFF fake" and wav.headers["content-type"] == "audio/wav"
        assert preview((gda / "b" / "theme.ogg").resolve()).headers["content-type"] == "audio/ogg"
        # Only image and audio files inside the workspace's resources and GDA folders.
        assert preview(tmp_path / "secret.png").status_code == 404
        assert preview(f"{gda.resolve()}/../secret.png").status_code == 404
        assert preview((game / "AllRssData.json").resolve()).status_code == 415
        assert preview((game / "absent.png").resolve()).status_code == 404
        assert preview((game / "changed.dds").resolve()).status_code == 415


def test_details_describe_report_files_of_the_workspace_folders(tmp_path):
    game, gda = write_example(tmp_path)
    (game / "art.dds").write_bytes(create_bc7_dds(8, 4))
    png = b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", 16, 2)
    (gda / "b" / "art.png").write_bytes(png)
    (tmp_path / "secret.png").write_bytes(png)
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda), "extensions": [".dds"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        files = [str((game / "art.dds").resolve()), str((gda / "b" / "art.png").resolve()), str((game / "changed.dds").resolve()),
                 str((game / "absent.dds").resolve()), str(tmp_path / "secret.png"), str(game.resolve())]
        details = client.post("/api/rss-sync/details", headers=session_headers(client), json={"files": files}).json()["files"]
        dds_file, png_file, invalid, absent, outside, folder = (details[file] for file in files)
        assert dds_file["size"] == (game / "art.dds").stat().st_size and dds_file["modifiedAt"].endswith("Z")
        assert dds_file["dimensions"] == {"width": 8, "height": 4, "format": "BC7_UNORM", "mipmaps": 1}
        assert png_file["dimensions"] == {"width": 16, "height": 2, "format": "RGBA"}
        # A file that is not a DDS texture keeps its size, and only the dimensions are missing.
        assert invalid["size"] == 3 and "dimensions" not in invalid and invalid["dimensionsError"]
        # Only existing files inside the workspace's resources and GDA folders.
        assert absent == outside == {"error": "File not found"} and folder == {"error": "Not a file"}
        assert client.post("/api/rss-sync/details", headers=session_headers(client), json={"files": []}).status_code == 400


def test_opens_report_file_directories_without_opening_files_or_leaving_the_workspace(tmp_path):
    game, gda = write_example(tmp_path)
    common = tmp_path / "common"
    common.mkdir()
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda),
             "common_gda_path": str(common), "extensions": [".dds"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    opened = []
    with TestClient(create_app(library, dev=True, opener=opened.append), base_url="http://127.0.0.1") as client:
        endpoint = "/api/rss-sync/open-folder"
        assert client.post(endpoint, json={"file": str(game / "changed.dds")}).status_code == 403
        headers = session_headers(client)
        for file, folder in [(game / "changed.dds", game), (gda / "a" / "changed.dds", gda / "a"),
                             (game / "missing.dds", game), (game / "anim{00-70}.dds", game), (common / "image.dds", common)]:
            result = client.post(endpoint, headers=headers, json={"file": str(file.resolve())})
            assert result.status_code == 200 and result.json() == {"opened": True}
            assert opened[-1] == str(folder.resolve())
        for file in [tmp_path / "secret.png", gda / ".." / "secret.png", game / "absent" / "image.png"]:
            assert client.post(endpoint, headers=headers, json={"file": str(file)}).status_code == 404
        (game / "linked").symlink_to(tmp_path, target_is_directory=True)
        assert client.post(endpoint, headers=headers, json={"file": str(game / "linked" / "secret.png")}).status_code == 400
        assert len(opened) == 5
