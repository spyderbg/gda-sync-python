"""The view-layout skill's helper (.claude/skills/view-layout/view_layout.py): it finds where a preview shows each view
element's image, and writes the positions that put them there, keeping the rest of the view's text."""

import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import cv2
import numpy as np

from egt_gda_sync.assets.views import render_view
from egt_gda_sync.images.image_compare import decode_image
from tests.fixtures.bc7_dds import create_bc7_dds
from tests.test_views import write_json, write_png

HELPER = Path(__file__).resolve().parents[1] / ".claude" / "skills" / "view-layout" / "view_layout.py"
CONDITIONS = HELPER.with_name("execute_conditions.py")
IMAGE_CACHE_ENV = "GDA_VIEW_LAYOUT_IMAGE_CACHE"


def test_helper_traces_exact_arguments_failures_and_validates_the_uploaded_inputs(tmp_path):
    from egt_gda_sync.game.layout_trace import AUDIT_ENV, CONTEXT_ENV, fingerprint
    preview = tmp_path / "preview with spaces 'and quotes'.png"
    write_png(preview, noise(8, 8, 5))
    audit = tmp_path / "calls.jsonl"
    arguments = [str(preview), "workspace-with-id"]
    env = {**os.environ, AUDIT_ENV: str(audit),
           CONTEXT_ENV: json.dumps({"arguments": arguments, "previewSha256": fingerprint(preview)})}

    def run(*args):
        return subprocess.run([sys.executable, "-I", str(HELPER), *args], env=env, capture_output=True,
                              text=True, check=False, timeout=30)

    result = run("validate-inputs", *arguments)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {"preview": arguments[0], "workspace": arguments[1], "validated": True}
    assert "exit 0" in result.stderr
    assert run("validate-inputs", arguments[1], arguments[0]).returncode == 2
    assert run("validate-inputs", arguments[0], "other-workspace").returncode == 2
    write_png(preview, noise(8, 8, 6))
    changed = run("validate-inputs", *arguments)
    assert changed.returncode == 2 and "uploaded preview changed" in changed.stderr
    assert run("unknown-subcommand", "argument with spaces").returncode == 2
    events = [json.loads(line) for line in audit.read_text().splitlines()]
    starts = [event for event in events if event["event"] == "started"]
    finishes = [event for event in events if event["event"] == "finished"]
    assert len(starts) == len(finishes) == 5
    assert len({event["id"] for event in starts}) == 5
    assert starts[0]["arguments"] == ["validate-inputs", *arguments]
    assert starts[0]["argv"][-5:] == ["-I", str(HELPER), "validate-inputs", *arguments]
    assert starts[-1]["arguments"] == ["unknown-subcommand", "argument with spaces"]
    assert [event["exitCode"] for event in finishes] == [0, 2, 2, 2, 2]
    assert all(event["durationSeconds"] > 0 for event in finishes)
    assert [event["arguments"] for event in events if event["event"] == "validated"] == [arguments]


def test_execute_conditions_stop_the_skill_while_the_games_branch_has_uncommitted_changes(tmp_path):
    from egt_gda_sync.game.layout_trace import AUDIT_ENV, CONTEXT_ENV
    games = tmp_path / "games"
    game = games / "resources" / "example"
    write_json(game / "v" / "1920x1080" / "LayoutView.json", {"name": "LayoutView", "elements": []})
    (games / "other.txt").write_text("one\n")

    def git(*args):
        subprocess.run(["git", "-C", str(games), "-c", "user.name=Test", "-c", "user.email=test@example.com", *args],
                       check=True, capture_output=True, timeout=30)

    git("init", "-q", "-b", "layout")
    git("add", "-A")
    git("commit", "-q", "-m", "Views")
    config = tmp_path / "config folder" / "workspace.json"
    write_json(config, {"games_root_path": str(games), "defaultWorkspace": "example", "workspaces": [
        {"id": "example", "game_name": "Example", "game_path": "{games_root_path}/resources/example", "gda_path": str(tmp_path)},
        {"id": "gone", "game_name": "Gone", "game_path": "{games_root_path}/resources/gone", "gda_path": str(tmp_path)}]})
    audit = tmp_path / "calls.jsonl"
    # Git looks for the repository no higher than tmp_path, so the test's own surroundings never count.
    env = {key: value for key, value in os.environ.items() if key != CONTEXT_ENV}
    env.update({AUDIT_ENV: str(audit), "GIT_CEILING_DIRECTORIES": str(tmp_path)})

    def run(*args, context=None):
        return subprocess.run([sys.executable, "-I", str(CONDITIONS), *args], capture_output=True, text=True, check=False,
                              timeout=30, env={**env, **({CONTEXT_ENV: json.dumps(context)} if context else {})})

    clean = run("example", "--config", str(config))
    assert clean.returncode == 0, clean.stdout + clean.stderr
    assert f"workspace example ({config}): game folder {game}" in clean.stdout
    assert "ok   no-uncommitted-changes" in clean.stdout and "All 1 execute conditions hold." in clean.stdout
    # The default workspace of the configuration that the View layout page supplied; an empty id is no id.
    supplied = run("", context={"arguments": [], "previewSha256": "", "config": str(config)})
    assert supplied.returncode == 0 and f"workspace example ({config})" in supplied.stdout

    # Anything uncommitted on the branch stops the skill, outside the game folder too, and every change is listed.
    (games / "other.txt").write_text("two\n")
    (game / "v" / "1920x1080" / "NewView.json").write_text("{}")
    changed = run("example", "--config", str(config))
    assert changed.returncode == 1, changed.stdout + changed.stderr
    assert f"FAIL no-uncommitted-changes: {games} has 2 uncommitted change(s) on branch layout." in changed.stdout
    assert " M other.txt" in changed.stdout and "?? resources/example/v/1920x1080/NewView.json" in changed.stdout
    assert "1 of 1 execute conditions failed (no-uncommitted-changes): stop the skill" in changed.stdout
    git("add", "other.txt")
    (game / "v" / "1920x1080" / "NewView.json").unlink()
    staged = run("example", "--config", str(config))
    assert staged.returncode == 1 and "M  other.txt" in staged.stdout

    # Without git, nothing backs the views up.
    shutil.rmtree(games / ".git")
    unversioned = run("example", "--config", str(config))
    assert unversioned.returncode == 1 and "is not in a git repository" in unversioned.stdout

    unknown = run("nope", "--config", str(config))
    assert unknown.returncode == 2 and "has no workspace 'nope' (its workspaces: example, gone)" in unknown.stderr
    gone = run("gone", "--config", str(config))
    assert gone.returncode == 2 and "the game folder of the workspace gone does not exist" in gone.stderr

    events = [json.loads(line) for line in audit.read_text().splitlines()]
    assert {event["helper"] for event in events if event["event"] == "started"} == {"execute_conditions.py"}
    assert [event["exitCode"] for event in events if event["event"] == "finished"] == [0, 0, 1, 1, 1, 2, 2]


def noise(width: int, height: int, seed: int) -> np.ndarray:
    """An opaque image that matches in one place only."""
    rgb = np.random.default_rng(seed).integers(0, 256, (height, width, 3), dtype=np.uint8)
    return np.dstack([rgb, np.full((height, width), 255, np.uint8)])


def helper(*args: str, image_cache: Path | None = None) -> subprocess.CompletedProcess:
    """Runs the helper, without its image cache unless a folder is given: a test never writes the app's data folder."""
    env = {**os.environ, IMAGE_CACHE_ENV: str(image_cache) if image_cache else "off"}
    return subprocess.run([sys.executable, "-I", str(HELPER), *args], capture_output=True, text=True, check=False, timeout=120,
                          env=env)


def helper_module():
    """The helper as a module, to call its functions; its trace starts only when it runs as a script."""
    spec = importlib.util.spec_from_file_location("view_layout_helper", HELPER)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # its dataclasses look their module up
    try:
        spec.loader.exec_module(module)
    finally:
        del sys.modules[spec.name]
    return module


def test_decoded_dds_images_are_kept_between_calls_and_decoded_again_when_they_change(tmp_path):
    game = tmp_path / "resources" / "game"
    image = game / "art" / "red.dds"
    image.parent.mkdir(parents=True)
    image.write_bytes(create_bc7_dds(8, 8))
    write_png(game / "art" / "label.png", noise(8, 8, 2))
    write_json(game / "RssImagesData.json", {"images": [{"id": "IMAGE_RED", "path": "art/red.dds"},
                                                        {"id": "IMAGE_LABEL", "path": "art/label.png"}]})
    view = game / "v" / "1920x1080" / "PanelView.json"
    write_json(view, {"name": "PanelView", "elements": [
        {"id": "image_red", "type": "Image", "rssKey": "IMAGE_RED", "position": {"x": 100, "y": 100}},
        {"id": "image_label", "type": "Image", "rssKey": "IMAGE_LABEL", "position": {"x": 200, "y": 100}}]})
    cache = tmp_path / "data" / "image cache"
    pixels = decode_image(image)
    red = tuple(int(value) for value in pixels[0, 0, 2::-1])  # the fixture's color, in OpenCV's blue, green, red
    assert (pixels == pixels[0, 0]).all() and red != (255, 0, 0)

    def drawn(name: str, image_cache: Path | None = cache) -> np.ndarray:
        result = helper("draw", str(tmp_path / name), str(view), "--crop", "96,96,16,16", "--zoom", "1", image_cache=image_cache)
        assert result.returncode == 0, result.stderr
        return cv2.imread(str(tmp_path / name))

    # Without the cache nothing is written; with it, only the DDS image is kept, as its RGBA pixels.
    uncached = drawn("off.png", None)
    assert not cache.exists()
    assert (uncached[4:12, 4:12] == red).all()
    assert np.array_equal(drawn("first.png"), uncached)
    entries = list(cache.iterdir())
    assert len(entries) == 1 and entries[0].suffix == ".npy"
    kept = np.load(entries[0])
    assert kept.dtype == np.uint8 and np.array_equal(kept, pixels)

    # The next call draws the entry's pixels, not the file's: shown by an entry changed to blue.
    np.save(entries[0], np.full((8, 8, 4), (0, 0, 255, 255), np.uint8))
    assert (drawn("second.png")[4:12, 4:12] == (255, 0, 0)).all()
    assert list(cache.iterdir()) == entries

    # An entry that cannot be read, or holds something else than pixels, is decoded again and replaced.
    for broken in (b"not an array", b""):
        entries[0].write_bytes(broken)
        assert np.array_equal(drawn("repaired.png"), uncached)
        assert np.array_equal(np.load(entries[0]), kept)
    np.save(entries[0], np.zeros((8, 8), np.float32))
    assert np.array_equal(drawn("repaired.png"), uncached)
    assert np.array_equal(np.load(entries[0]), kept)

    # A changed image is another entry: the old one is never drawn for it.
    np.save(entries[0], np.full((8, 8, 4), (0, 0, 255, 255), np.uint8))
    image.write_bytes(create_bc7_dds(12, 8))
    assert (drawn("changed.png")[4:12, 4:12] == red).all()
    assert len(list(cache.iterdir())) == 2

    # A folder that cannot be made costs only the decoding.
    blocked = tmp_path / "file"
    blocked.write_text("")
    assert (drawn("blocked.png", blocked / "cache")[4:12, 4:12] == red).all()


def test_image_cache_is_pruned_to_its_size_by_last_use_and_keeps_other_files(tmp_path, monkeypatch):
    module = helper_module()
    cache = tmp_path / "cache"
    cache.mkdir()
    monkeypatch.setenv(IMAGE_CACHE_ENV, str(cache))
    assert module.image_cache_folder() == cache
    now = time.time()

    def entry(name: str, size: int, age: float) -> Path:
        file = cache / name
        file.write_bytes(b"x" * size)
        os.utime(file, (now - age, now - age))
        return file

    oldest, older, newest = entry("a" * 40 + ".npy", 400, 300), entry("b" * 40 + ".npy", 400, 200), entry("c" * 40 + ".npy", 400, 100)
    stopped = entry("d" * 40 + ".npy.12.34.tmp", 10, module.STALE_SECONDS + 60)
    writing = entry("e" * 40 + ".npy.56.78.tmp", 10, 5)
    others = [entry("notes.npy", 5000, 900), entry("f" * 40 + ".txt", 5000, 900)]
    monkeypatch.setattr(module, "IMAGE_CACHE_BYTES", 900)
    module.prune_image_cache()
    assert not oldest.exists() and older.exists() and newest.exists()
    assert not stopped.exists() and writing.exists()
    assert all(file.exists() for file in others)

    # Reading an entry is using it: the one read is kept, and the other goes.
    np.save(older, np.zeros((2, 2, 4), np.uint8))  # numpy keeps the name, which ends in .npy
    os.utime(older, (now - 200, now - 200))
    source = tmp_path / "image.dds"
    source.write_bytes(create_bc7_dds(4, 4))
    key = hashlib.sha256(f"{module.IMAGE_CACHE_VERSION}\0{source.resolve()}\0{source.stat().st_mtime_ns}\0{source.stat().st_size}".encode())
    older = older.rename(cache / f"{key.hexdigest()[:40]}.npy")
    assert module.cached_decode(source).shape == (2, 2, 4)
    assert older.stat().st_mtime > now - 100
    monkeypatch.setattr(module, "IMAGE_CACHE_BYTES", older.stat().st_size)
    module.prune_image_cache()
    assert older.exists() and not newest.exists()

    monkeypatch.setenv(IMAGE_CACHE_ENV, "off")
    assert module.image_cache_folder() is None
    assert module.cached_decode(source).shape == (4, 4, 4)
    module.prune_image_cache()
    assert older.exists()
    monkeypatch.delenv(IMAGE_CACHE_ENV)
    monkeypatch.setenv("EGT_GDA_SYNC_HOME", str(tmp_path / "home"))
    assert module.image_cache_folder() == tmp_path / "home" / "view-layout-image-cache"


def write_game(root: Path) -> Path:
    """A game whose view has a background, a label, and a twin of the label for another theme."""
    game = root / "resources" / "game"
    write_png(game / "art" / "back.png", noise(400, 200, 1))
    write_png(game / "art" / "label.png", noise(40, 24, 2))
    write_png(game / "art" / "knob.png", noise(30, 30, 3))
    write_png(game / "art" / "white.png", np.full((12, 20, 4), 255, np.uint8))
    write_json(game / "RssImagesData.json", {"images": [{"id": "IMAGE_BACK", "path": "art/back.png"},
                                                        {"id": "IMAGE_LABEL", "path": "art/label.png"},
                                                        {"id": "IMAGE_KNOB", "path": "art/knob.png"},
                                                        {"id": "IMAGE_WHITE", "path": "art/white.png"}]})
    view = game / "v" / "1920x1080" / "PanelView.json"
    view.parent.mkdir(parents=True)
    view.write_text('{\r\n  "name": "PanelView",\r\n  "elements": [\r\n'
                    '    {"id": "image_back", "type": "Image", "rssKey": "IMAGE_BACK", "position": {"x": 100, "y": 800}},\r\n'
                    '    {"id": "image_label", "type": "Image", "rssKey": "IMAGE_LABEL", "alignment": "TopCenter",'
                    ' "position": {"x": 200, "y": 900}},\r\n'
                    '    {"id": "image_label_tetra", "type": "Image", "rssKey": "IMAGE_LABEL", "alignment": "TopCenter",'
                    ' "position": {"x": 300, "y": 900}},\r\n'
                    '    {"id": "image_knob", "type": "Image", "rssKey": "IMAGE_KNOB", "alignment": "MiddleCenter",'
                    ' "position": {"x": 450, "y": 850}},\r\n'
                    '    {"id": "image_eye", "type": "Image", "rssKey": "IMAGE_WHITE", "position": {"x": 120, "y": 820}}\r\n  ]\r\n}\r\n')
    return view


def preview_of(view: Path, out: Path, moves: dict[str, tuple[int, int]], skip: tuple[str, ...] = (),
               scales: dict[str, float] | None = None) -> np.ndarray:
    """The screen drawn with some elements moved or scaled and others left out, as a designer's preview draws it."""
    data = json.loads(view.read_text())
    original = view.read_bytes()
    data["elements"] = [{**element, "position": {"x": element["position"]["x"] + moves.get(element["id"], (0, 0))[0],
                                                 "y": element["position"]["y"] + moves.get(element["id"], (0, 0))[1]},
                         **({"scale": {"x": scales[element["id"]], "y": scales[element["id"]]}} if element["id"] in (scales or {}) else {})}
                        for element in data["elements"] if element["id"] not in skip]
    view.write_text(json.dumps(data))
    try:
        rgba = cv2.imdecode(np.frombuffer(render_view(view), np.uint8), cv2.IMREAD_UNCHANGED)
    finally:
        view.write_bytes(original)
    screen = rgba[..., :3].astype(np.float32) * (rgba[..., 3:4] / 255.0)
    cv2.imwrite(str(out), screen.astype(np.uint8))
    return screen


def rows(result: subprocess.CompletedProcess) -> dict[str, dict]:
    assert result.returncode == 0, result.stderr
    return {row["id"]: row for view in json.loads(result.stdout)["views"] for row in view["elements"]}


def test_locate_finds_where_the_preview_moved_and_scaled_elements(tmp_path):
    view = write_game(tmp_path)
    preview = tmp_path / "preview.png"
    preview_of(view, preview, {"image_label": (37, -12)}, skip=("image_label_tetra",))

    found = rows(helper("locate", str(preview), str(view), "--skip", "*_tetra", "--json"))
    assert found["image_label"]["move"] == [37, -12] and found["image_label"]["new"] == [237, 888]
    assert found["image_label"]["score"] > 0.99 and "note" not in found["image_label"]
    assert found["image_back"]["move"] == [0, 0] and found["image_knob"]["move"] == [0, 0]
    assert "image_label_tetra" not in found
    assert "flat color" in found["image_eye"]["note"]

    # Without --skip, the twin is found where the label is: both are marked, since the preview shows only one of them.
    found = rows(helper("locate", str(preview), str(view), "--json"))
    assert found["image_label"]["move"] == [37, -12] and found["image_label_tetra"]["move"] == [-63, -12]
    assert "image_label_tetra is found too" in found["image_label"]["note"]
    assert "image_label is found too" in found["image_label_tetra"]["note"]

    # A part of the screen is found where it looks like the views, and an element larger in it gets its scale.
    part = tmp_path / "part.png"
    screen = preview_of(view, tmp_path / "whole.png", {"image_label": (37, -12), "image_knob": (-20, 10)},
                        skip=("image_label_tetra",), scales={"image_knob": 1.2})
    cv2.imwrite(str(part), screen[780:1020, 80:520].astype(np.uint8))
    result = helper("locate", str(part), str(view), "--skip", "*_tetra", "--origin", "auto", "--scales", "0.9,1.1,1.2", "--json")
    assert "the preview is at 80,780" in result.stderr
    found = rows(result)
    assert found["image_label"]["move"] == [37, -12] and "scale" not in found["image_label"]
    assert found["image_knob"]["scale"] == [1.2, 1.2] and found["image_knob"]["new"] == [430, 860]


def test_draw_lays_the_views_over_the_preview_without_the_elements_left_out(tmp_path):
    view = write_game(tmp_path)
    preview = tmp_path / "preview.png"
    screen = preview_of(view, preview, {}, skip=("image_label_tetra",))

    def drawn(*args: str) -> np.ndarray:
        result = helper("draw", str(tmp_path / "out.png"), str(view), *args)
        assert result.returncode == 0, result.stderr
        return cv2.imread(str(tmp_path / "out.png")).astype(int)

    # Over a preview that the views themselves drew, at full opacity, the picture is the preview.
    assert np.abs(drawn("--over", str(preview), "--skip", "*_tetra", "--opacity", "1") - screen).max() <= 1
    # An element left out is not drawn: what is under it shows, here the background, and the elements around it stay.
    back, label, knob = (noise(width, height, seed)[..., 2::-1].astype(int) for width, height, seed in ((400, 200, 1), (40, 24, 2), (30, 30, 3)))
    twin = (slice(900, 924), slice(280, 320))  # where image_label_tetra draws the label, on the background from 100,800
    whole, without = drawn(), drawn("--skip", "*_tetra")
    assert np.array_equal(whole[twin], label) and np.array_equal(without[twin], back[100:124, 180:220])
    assert np.array_equal(without[900:924, 180:220], label) and np.array_equal(without[835:865, 435:465], knob)
    assert np.array_equal(whole[:800], without[:800]) and set(np.unique(whole[:800])) == {64, 96}  # the screen without a preview
    # Over a preview the views are half transparent by default, so a doubled element shows that it is off its place.
    black = tmp_path / "black.png"
    cv2.imwrite(str(black), np.zeros((1080, 1920, 3), np.uint8))
    half = drawn("--over", str(black))
    assert np.abs(half[835:865, 435:465] - knob / 2).max() <= 1 and not half[:800].any()
    # A part of the screen, zoomed.
    crop = drawn("--skip", "*_tetra", "--crop", "435,835,30,30", "--zoom", "2")
    assert crop.shape == (60, 60, 3) and np.array_equal(crop[::2, ::2], knob)


def test_move_writes_only_the_positions_and_keeps_the_files_layout(tmp_path):
    view = write_game(tmp_path)
    before = view.read_bytes().decode()
    result = helper("move", str(view), "image_label=237,888", "#3=451.5,850")
    assert result.returncode == 0, result.stderr
    after = view.read_bytes().decode()
    assert after == before.replace('"x": 200, "y": 900', '"x": 237, "y": 888').replace('"x": 450, "y": 850', '"x": 451.5, "y": 850')
    assert "\r\n" in after

    assert helper("move", str(view), "image_missing=1,1").returncode == 2
    assert helper("move", str(view.parent.parent.parent / "RssImagesData.json"), "x=1,1").returncode == 2
    assert view.read_bytes().decode() == after
