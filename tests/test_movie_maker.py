"""Making a movie from an image sequence at the chosen frame rate and declaring it under a new RSS key."""

import json
import shutil
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.app.errors import AppError
from egt_gda_sync.app.server import create_app
from egt_gda_sync.assets import movie_maker
from egt_gda_sync.assets.movie_maker import encode_movie, movie_frame, movie_path
from egt_gda_sync.workspace import library as library_module
from egt_gda_sync.workspace.library import Library
from tests.conftest import session_headers

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="making a movie needs FFmpeg")


def frame(index: int, size=(6, 4)) -> bytes:
    """A BGRA PNG: a red square that moves, opaque, on a transparent background."""
    image = np.zeros((size[1], size[0], 4), np.uint8)
    image[:, index % size[0], :] = (0, 0, 255, 255)
    return cv2.imencode(".png", image)[1].tobytes()


def write_game(root: Path) -> Path:
    game = root / "resources" / "example"
    folder = game / "art" / "1920x1080" / "fx" / "Spark"
    folder.mkdir(parents=True)
    for index in range(6):
        (folder / f"Spark_{index}.png").write_bytes(frame(index))
    (game / "art" / "odd").mkdir()
    (game / "art" / "odd" / "odd_0.png").write_bytes(frame(0))
    (game / "art" / "odd" / "odd_1.png").write_bytes(frame(1, (8, 8)))
    (game / "RssImagesSeqData.json").write_text(json.dumps({"imagesSeq": [
        {"id": "ANIM_SPARK", "frameTime": 40, "loopCount": 0, "loopTo": 2, "frames": [{"path": "art/1920x1080/fx/Spark/Spark_{0-5}.png"}]},
        {"id": "ANIM_ODD", "frameTime": 40, "loopCount": 1, "frames": [{"path": "art/odd/odd_{0-1}.png"}]},
    ]}, indent=4))
    (game / "RssMoviesData.json").write_text('{\n    "movies": [\n    ]\n}\n')
    return game


@pytest.fixture
def client(tmp_path):
    game = write_game(tmp_path)
    gda = tmp_path / "gda"
    gda.mkdir()
    entry = {"id": "example", "game_name": "Example", "game_path": str(game), "gda_path": str(gda), "extensions": [".png", ".mov", ".json"]}
    config = tmp_path / "workspace.json"
    config.write_text(json.dumps({"config": {"port": 3457}, "defaultWorkspace": "example", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(config))
    library.init()
    with TestClient(create_app(library, dev=True), base_url="http://127.0.0.1") as client:
        client.game = game
        client.headers.update(session_headers(client))
        client.post("/api/asset-report")
        yield client


def sequence(client, sequence_id: str) -> dict:
    return next(row for row in client.get("/api/asset-report").json()["assets"] if (row.get("sequence") or {}).get("id") == sequence_id)


def test_a_movie_goes_to_the_m_folder_named_like_its_sequence():
    game = Path("/r/game")
    frames = game / "art" / "1920x1080" / "coin_animations" / "Big_Win" / "Big_Win_01.dds"
    assert movie_path(frames, game, "Big_Win", "valpha") == "m/coin_animations/Big_Win-rgba.mov"
    assert movie_path(game / "anim" / "a_0.dds", game, "a", "opaque") == "m/anim/a.mov"
    assert movie_path(Path("/r/common/x/x_0.dds"), game, "x", "valpha") == "m/x-rgba.mov"


@pytest.mark.parametrize(("movie_format", "shape", "picture", "mask"), [
    ("valpha", (4, 4, 3), (slice(0, 2), slice(None)), (slice(2, 4), slice(None))),
    ("valpha-top", (4, 4, 3), (slice(2, 4), slice(None)), (slice(0, 2), slice(None))),
    ("halpha", (2, 8, 3), (slice(None), slice(0, 4)), (slice(None), slice(4, 8))),
    ("halpha-left", (2, 8, 3), (slice(None), slice(4, 8)), (slice(None), slice(0, 4))),
])
def test_packed_frames_store_the_premultiplied_picture_and_alpha_at_the_expected_positions(movie_format, shape, picture, mask):
    image = np.array([[[200, 100, 50, 128], [10, 20, 30, 255], [1, 2, 3, 0]]], np.uint8)
    pixels = np.frombuffer(movie_frame(image, movie_format, 4, 2), np.uint8).reshape(shape)
    assert pixels[picture].tolist() == [[[100, 50, 25], [10, 20, 30], [0, 0, 0], [0, 0, 0]], [[0, 0, 0]] * 4]
    assert pixels[mask].tolist() == [[[128] * 3, [255] * 3, [0] * 3, [0] * 3], [[0, 0, 0]] * 4]


def test_the_options_suggest_an_id_a_path_and_valpha_for_frames_with_alpha(client):
    options = client.get("/api/asset-report/movie", params={"asset": sequence(client, "ANIM_SPARK")["id"]}).json()
    assert options["id"] == "ANIM_SPARK_MOVIE" and options["path"] == "m/fx/Spark-rgba.mov"
    assert options["descriptors"] == ["RssMoviesData.json"] and options["movieFormat"] == "valpha"
    assert options["formats"] == ["valpha", "valpha-top", "halpha", "halpha-left", "opaque"]
    assert (options["frameTime"], options["fps"], options["loopCount"], options["frames"]) == (40, 25.0, 0, 6)
    assert options["loopTo"] == 2
    assert options["crf"] == 23 and options["crfValues"] == list(range(52))
    assert options["gopSize"] == 250 and options["maxGopSize"] == 2_147_483_647
    assert options["ffmpeg"]["sizes"] == {
        "valpha": "6x8", "valpha-top": "6x8", "halpha": "12x4", "halpha-left": "12x4", "opaque": "6x4",
    }


def test_the_command_preview_uses_padded_crop_dimensions(client):
    descriptor = client.game / "RssImagesSeqData.json"
    data = json.loads(descriptor.read_text())
    data["imagesSeq"][0]["frames"][0]["source"] = {"x": 0, "y": 1, "w": 3, "h": 3}
    descriptor.write_text(json.dumps(data))
    assert client.post("/api/asset-report").status_code == 200

    response = client.get("/api/asset-report/movie", params={"asset": sequence(client, "ANIM_SPARK")["id"]})
    assert response.status_code == 200, response.text
    sizes = response.json()["ffmpeg"]["sizes"]
    assert (sizes["opaque"], sizes["valpha"], sizes["halpha-left"]) == ("4x4", "4x8", "8x4")


def test_making_a_movie_encodes_the_frames_and_declares_it_under_a_new_id(client):
    row = sequence(client, "ANIM_SPARK")
    sequences = (client.game / "RssImagesSeqData.json").read_text()
    result = client.post("/api/asset-report/movie", json={
        "asset": row["id"], "id": "ANIM_SPARK_MOVIE", "path": "m/fx/Spark-rgba.mov", "descriptor": "RssMoviesData.json", "movieFormat": "valpha"})
    assert result.status_code == 200, result.text
    result = result.json()
    movie = client.game / "m" / "fx" / "Spark-rgba.mov"
    capture = cv2.VideoCapture(str(movie))
    assert (capture.get(cv2.CAP_PROP_FRAME_WIDTH), capture.get(cv2.CAP_PROP_FRAME_HEIGHT)) == (6, 8)
    assert capture.get(cv2.CAP_PROP_FRAME_COUNT) == 6 and round(capture.get(cv2.CAP_PROP_FPS)) == 25
    capture.release()
    assert json.loads((client.game / "RssMoviesData.json").read_text())["movies"] == [
        {"id": "ANIM_SPARK_MOVIE", "path": "m/fx/Spark-rgba.mov", "movieFormat": "valpha"}]
    # The sequence stays, for the views that still name it.
    assert (client.game / "RssImagesSeqData.json").read_text() == sequences
    declared = next(item for item in client.get("/api/asset-report").json()["assets"] if item["id"] == result["asset"])
    assert declared["type"] == "movie" and declared["category"] == "available" and declared["requiredBy"][0]["id"] == "ANIM_SPARK_MOVIE"
    assert result["movie"] == {"width": 6, "height": 4, "frames": 6, "fps": 25.0, "movieFormat": "valpha", "padded": False}
    legacy_preview = client.get("/api/rss-sync/movie-frame", params={"file": str(movie), "stacked": "true"})
    assert legacy_preview.status_code == 200 and legacy_preview.headers["content-type"] == "image/png"
    assert result["library"]["activity"][0]["message"] == "Made movie ANIM_SPARK_MOVIE (m/fx/Spark-rgba.mov) from ANIM_SPARK, declared in RssMoviesData.json"
    manifest = json.loads(next(Path(result["library"]["backupPath"]).glob("*.json")).read_text())
    assert {item["path"]: item["change"] for item in manifest["files"]} == {
        "example/RssMoviesData.json": "replaced", "example/m/fx/Spark-rgba.mov": "created"}

    again = {"asset": row["id"], "id": "ANIM_SPARK_MOVIE", "path": "m/fx/other.mov", "descriptor": "RssMoviesData.json", "movieFormat": "valpha"}
    assert client.post("/api/asset-report/movie", json=again).status_code == 409
    taken = {**again, "id": "ANIM_SPARK", "path": "m/fx/other.mov"}
    assert client.post("/api/asset-report/movie", json=taken).json()["error"] == "ANIM_SPARK is the id of another resource of the game with the same resolution and language"
    existing = {**again, "id": "ANIM_SPARK_2", "path": "m/fx/Spark-rgba.mov"}
    assert client.post("/api/asset-report/movie", json=existing).json()["error"] == "m/fx/Spark-rgba.mov exists already"
    outside = {**again, "id": "ANIM_SPARK_2", "path": "../elsewhere.mov"}
    assert client.post("/api/asset-report/movie", json=outside).status_code == 400


@pytest.mark.parametrize(("movie_format", "encoded_size"), [
    ("valpha-top", (6, 8)),
    ("halpha", (12, 4)),
    ("halpha-left", (12, 4)),
])
def test_a_custom_fractional_rate_and_packed_layout_reach_the_file_and_preview(client, movie_format, encoded_size):
    relative = f"m/fx/Spark-{movie_format}.mov"
    response = client.post("/api/asset-report/movie", json={
        "asset": sequence(client, "ANIM_SPARK")["id"], "id": "ANIM_SPARK_MOVIE", "path": relative,
        "descriptor": "RssMoviesData.json", "movieFormat": movie_format, "fps": 29.97,
    })
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["entry"]["movieFormat"] == movie_format
    assert result["movie"]["fps"] == 29.97 and result["movie"]["frames"] == 6
    movie = client.game / relative
    capture = cv2.VideoCapture(str(movie))
    try:
        assert (capture.get(cv2.CAP_PROP_FRAME_WIDTH), capture.get(cv2.CAP_PROP_FRAME_HEIGHT)) == encoded_size
        assert capture.get(cv2.CAP_PROP_FPS) == pytest.approx(29.97)
        assert capture.get(cv2.CAP_PROP_FRAME_COUNT) == 6
    finally:
        capture.release()
    preview = client.get("/api/rss-sync/movie-frame", params={"file": str(movie), "alphaFormat": movie_format})
    assert preview.status_code == 200 and preview.headers["content-type"] == "image/png"
    pixels = cv2.imdecode(np.frombuffer(preview.content, np.uint8), cv2.IMREAD_UNCHANGED)
    assert pixels.shape == (4, 6, 4)
    assert pixels[:, 3, 3].min() > 200 and pixels[:, 0, 3].max() < 50


@pytest.mark.parametrize(("crf", "gop_size"), [(None, None), (0, 0), (18, 3), (51, 2_147_483_647)])
def test_the_selected_crf_and_gop_size_reach_ffmpeg(client, monkeypatch, crf, gop_size):
    actual = movie_maker.ffmpeg_arguments
    command = []

    def record(*args, **kwargs):
        groups = actual(*args, **kwargs)
        command.extend(argument for group in groups for argument in group)
        return groups

    monkeypatch.setattr(movie_maker, "ffmpeg_arguments", record)
    request = {
        "asset": sequence(client, "ANIM_SPARK")["id"], "id": "ANIM_SPARK_MOVIE", "path": "m/spark.mov",
        "descriptor": "RssMoviesData.json", "movieFormat": "opaque",
    }
    if crf is not None:
        request["crf"] = crf
    if gop_size is not None:
        request["gopSize"] = gop_size
    response = client.post("/api/asset-report/movie", json=request)
    assert response.status_code == 200, response.text
    assert command[command.index("-crf") + 1] == str(23 if crf is None else crf)
    assert command[command.index("-g") + 1] == str(250 if gop_size is None else gop_size)
    assert (client.game / "m/spark.mov").is_file()


@pytest.mark.parametrize(("field", "value"), [
    ("crf", -1), ("crf", 52), ("crf", 18.5), ("crf", "18"), ("crf", True),
    ("gopSize", -1), ("gopSize", 2_147_483_648), ("gopSize", 18.5), ("gopSize", "18"), ("gopSize", True),
])
def test_invalid_encoder_parameters_are_rejected_before_creating_a_movie(client, field, value):
    response = client.post("/api/asset-report/movie", json={
        "asset": sequence(client, "ANIM_SPARK")["id"], "id": "ANIM_SPARK_MOVIE", "path": "m/spark.mov",
        "descriptor": "RssMoviesData.json", "movieFormat": "valpha", field: value,
    })
    assert response.status_code == 400 and response.json()["error"].startswith(f"body/{field}:"), response.text
    assert not (client.game / "m").exists()


@pytest.mark.parametrize("fps", [0, -12, "29.97", True])
def test_an_invalid_frame_rate_is_rejected_before_creating_a_movie(client, fps):
    response = client.post("/api/asset-report/movie", json={
        "asset": sequence(client, "ANIM_SPARK")["id"], "id": "ANIM_SPARK_MOVIE", "path": "m/spark.mov",
        "descriptor": "RssMoviesData.json", "movieFormat": "valpha", "fps": fps,
    })
    assert response.status_code == 400 and response.json()["error"].startswith("body/fps:"), response.text
    assert not (client.game / "m").exists()


def test_frames_of_different_sizes_make_no_movie_and_leave_no_folder(client):
    before = (client.game / "RssMoviesData.json").read_text()
    response = client.post("/api/asset-report/movie", json={
        "asset": sequence(client, "ANIM_ODD")["id"], "id": "ANIM_ODD_MOVIE", "path": "m/odd/odd.mov", "descriptor": "RssMoviesData.json",
        "movieFormat": "opaque"})
    assert response.status_code == 400 and "a movie's frames have one size" in response.json()["error"]
    assert not (client.game / "m").exists() and (client.game / "RssMoviesData.json").read_text() == before


def test_an_odd_size_is_padded_with_transparent_pixels(tmp_path):
    path = tmp_path / "f.png"
    path.write_bytes(cv2.imencode(".png", np.full((3, 5, 4), 255, np.uint8))[1].tobytes())
    facts = encode_movie([(path, None), (path, None)], 100, "opaque", tmp_path / "out.mp4")
    assert facts == {"width": 6, "height": 4, "frames": 2, "fps": 10.0, "movieFormat": "opaque", "padded": True}
    # The partial file was moved into place.
    assert {item.name for item in tmp_path.iterdir()} == {"f.png", "out.mp4"}


def made_movie(client, movie_format="valpha") -> tuple[str, Path]:
    response = client.post("/api/asset-report/movie", json={
        "asset": sequence(client, "ANIM_SPARK")["id"], "id": "ANIM_SPARK_MOVIE", "path": "m/fx/Spark-rgba.mov",
        "descriptor": "RssMoviesData.json", "movieFormat": movie_format})
    assert response.status_code == 200, response.text
    return response.json()["asset"], client.game / "m" / "fx" / "Spark-rgba.mov"


@pytest.mark.parametrize("own_frames", [False, True])
def test_recreating_a_movie_replaces_only_its_file(client, own_frames):
    asset, movie = made_movie(client)
    before, descriptor = movie.read_bytes(), (client.game / "RssMoviesData.json").read_bytes()
    spark = sequence(client, "ANIM_SPARK")["id"]
    options = client.get("/api/asset-report/movie-file", params={"asset": asset}).json()
    assert options["source"] == spark and options["sources"][0]["asset"] == spark
    assert options["formats"] == ["valpha", "opaque"] and options["fps"] == 25 and options["ffmpeg"]["sizes"]["valpha"] == "6x8"
    source = asset if own_frames else spark
    options = client.get("/api/asset-report/movie-file", params={"asset": asset, "source": source}).json()
    assert options["ffmpeg"]["sizes"]["valpha"] == "6x8"

    body = {"asset": asset, "source": source, "movieFormat": "valpha", "fps": 12.5, "crf": 5}
    response = client.post("/api/asset-report/movie-file", json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert movie.read_bytes() != before and (client.game / "RssMoviesData.json").read_bytes() == descriptor
    capture = cv2.VideoCapture(str(movie))
    assert (capture.get(cv2.CAP_PROP_FRAME_WIDTH), capture.get(cv2.CAP_PROP_FRAME_HEIGHT)) == (6, 8)
    assert capture.get(cv2.CAP_PROP_FRAME_COUNT) == 6 and capture.get(cv2.CAP_PROP_FPS) == 12.5
    capture.release()
    assert {item.name for item in movie.parent.iterdir()} == {movie.name}
    assert result["movie"]["frames"] == 6 and result["movie"]["movieFormat"] == "valpha"
    row = next(item for item in client.get("/api/asset-report").json()["assets"] if item["id"] == asset)
    assert row["movie"]["fps"] == 12.5 and row["requiredBy"][0]["id"] == "ANIM_SPARK_MOVIE"
    backup = Path(result["library"]["backupPath"])
    saved = [path for path in backup.rglob("Spark-rgba.mov") if path.read_bytes() == before]
    assert len(saved) == 1
    manifests = [json.loads(path.read_text()) for path in backup.glob("*.json")]
    assert [{"path": "example/m/fx/Spark-rgba.mov", "change": "replaced"}] in [item["files"] for item in manifests]


def test_a_movie_cannot_rearrange_its_packed_alpha_or_use_frames_that_do_not_fit(client):
    asset, movie = made_movie(client)
    before = movie.read_bytes()
    spark = sequence(client, "ANIM_SPARK")["id"]
    body = {"asset": asset, "source": spark, "movieFormat": "halpha", "fps": 25}
    assert "declared as valpha" in client.post("/api/asset-report/movie-file", json=body).json()["error"]
    odd = {**body, "source": sequence(client, "ANIM_ODD")["id"], "movieFormat": "valpha"}
    assert "one size" in client.post("/api/asset-report/movie-file", json=odd).json()["error"]
    assert client.post("/api/asset-report/movie-file", json={**body, "asset": spark}).status_code == 400
    assert movie.read_bytes() == before and {item.name for item in movie.parent.iterdir()} == {movie.name}


@pytest.mark.parametrize(("movie_format", "own_frames"), [
    ("valpha", False), ("valpha", True), ("valpha-top", True), ("halpha", True), ("halpha-left", True),
])
def test_recreating_can_remove_alpha_and_restore_the_original_movie_and_descriptors(client, movie_format, own_frames):
    asset, movie = made_movie(client, movie_format)
    relative = movie.relative_to(client.game).as_posix()
    primary = client.game / "RssMoviesData.json"
    secondary = client.game / "RssData.json"
    secondary_text = ('{\r\n "movies": [\r\n'
                      '  {"movieFormat": "' + movie_format + '", "id": "SPARK_EN", "path": "' + relative + '", "language": "en"},\r\n'
                      '  {"id": "SPARK_IT", "path": "' + relative + '", "resolution": "1920x1200", "movieFormat": "' + movie_format + '"},\r\n'
                      '  {"id": "OTHER", "path": "other.mov", "movieFormat": "valpha"}\r\n ]\r\n}\r\n')
    secondary.write_bytes(b"\xef\xbb\xbf" + secondary_text.encode())
    originals = {path: path.read_bytes() for path in (movie, primary, secondary)}
    source = asset if own_frames else sequence(client, "ANIM_SPARK")["id"]
    options = client.get("/api/asset-report/movie-file", params={"asset": asset, "source": source}).json()
    assert options["currentFormat"] == movie_format and options["formats"] == [movie_format, "opaque"]
    assert options["ffmpeg"]["sizes"]["opaque"] == "6x4"
    response = client.post("/api/asset-report/movie-file", json={"asset": asset, "source": source, "movieFormat": "opaque", "fps": 25, "crf": 0})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["asset"] == asset and result["movie"]["movieFormat"] == "opaque"
    capture = cv2.VideoCapture(str(movie))
    ok, picture = capture.read()
    capture.release()
    assert ok and picture.shape == (4, 6, 3)
    assert picture[:, 0, 2].mean() > 80 and picture[:, -1, :].max() < 20
    assert json.loads(primary.read_bytes())["movies"] == [{"id": "ANIM_SPARK_MOVIE", "path": relative}]
    assert secondary.read_bytes() == b"\xef\xbb\xbf" + secondary_text.replace(f'"movieFormat": "{movie_format}", ', '', 1).replace(
        f', "movieFormat": "{movie_format}"' + '},\r\n', '},\r\n', 1).encode()
    row = next(item for item in client.get("/api/asset-report").json()["assets"] if item["id"] == asset)
    assert all("movieFormat" not in use for use in row["requiredBy"])
    backup = Path(result["library"]["backupPath"])
    operation = next(path for path in backup.glob("*.json") if "without alpha" in json.loads(path.read_text())["message"])
    restore = client.post("/api/backups/restore", json={"id": operation.stem})
    assert restore.status_code == 200, restore.text
    assert all(path.read_bytes() == data for path, data in originals.items())


def test_removing_alpha_rolls_back_if_a_descriptor_cannot_be_updated(client, monkeypatch):
    asset, movie = made_movie(client)
    first = client.game / "RssData.json"
    second = client.game / "RssMoviesData.json"
    first.write_text(json.dumps({"movies": [
        {"id": "SPARK_ALT", "path": movie.relative_to(client.game).as_posix(), "movieFormat": "valpha"}]}))
    originals = {path: path.read_bytes() for path in (movie, first, second)}
    write = library_module._write_file

    def fail_second(path, data):
        if Path(path) == second:
            assert first.read_bytes() != originals[first]
            raise AppError("Descriptor cannot be updated", 409)
        write(path, data)

    monkeypatch.setattr(library_module, "_write_file", fail_second)
    response = client.post("/api/asset-report/movie-file", json={"asset": asset, "source": asset, "movieFormat": "opaque", "fps": 25})
    assert response.status_code == 409, response.text
    assert all(path.read_bytes() == data for path, data in originals.items())
    assert list(movie.parent.iterdir()) == [movie]



def test_a_movie_gets_an_entry_for_each_resolution_and_language_of_its_sequence_frames(client):
    game = client.game
    for language in ("en", "it"):
        folder = game / "art" / "1920x1080" / "Completed" / language
        folder.mkdir(parents=True)
        for index in range(3):
            (folder / f"Done_{language}_{index}.png").write_bytes(frame(index))
    data = json.loads((game / "RssImagesSeqData.json").read_text())
    data["imagesSeq"] += [{"id": "ANIM_DONE", "language": language, "resolution": resolution, "frameTime": 40, "loopCount": 1,
                           "frames": [{"path": f"art/1920x1080/Completed/{language[:2]}/Done_{language[:2]}_{{0-2}}.png"}]}
                          for language, resolution in (("en-GB", "1920x1080"), ("en-GB", "1920x1200"), ("it-IT", "1920x1080"))]
    (game / "RssImagesSeqData.json").write_text(json.dumps(data, indent=4))
    assert client.post("/api/asset-report").status_code == 200
    english = next(row for row in client.get("/api/asset-report").json()["assets"]
                   if (row.get("sequence") or {}).get("id") == "ANIM_DONE" and "/en/" in row["resource"])

    options = client.get("/api/asset-report/movie", params={"asset": english["id"]}).json()
    assert options["path"] == "m/Completed/en/Done_en-rgba.mov"
    assert options["variants"] == [{"resolution": "1920x1080", "language": "en-GB"}, {"resolution": "1920x1200", "language": "en-GB"}]
    response = client.post("/api/asset-report/movie", json={
        "asset": english["id"], "id": "ANIM_DONE_MOVIE", "path": options["path"], "descriptor": "RssMoviesData.json", "movieFormat": "valpha"})
    assert response.status_code == 200, response.text
    # Only the English frames are made into a movie, declared for the English entries' resolutions.
    assert json.loads((game / "RssMoviesData.json").read_text())["movies"] == [
        {"id": "ANIM_DONE_MOVIE", "path": "m/Completed/en/Done_en-rgba.mov", "movieFormat": "valpha", "resolution": "1920x1080", "language": "en-GB"},
        {"id": "ANIM_DONE_MOVIE", "path": "m/Completed/en/Done_en-rgba.mov", "movieFormat": "valpha", "resolution": "1920x1200", "language": "en-GB"},
    ]
    assert [path.relative_to(game).as_posix() for path in (game / "m").rglob("*.mov")] == ["m/Completed/en/Done_en-rgba.mov"]

    # The Italian frames' movie can have the same key: its entries differ from the English ones by language.
    italian = next(row for row in client.get("/api/asset-report").json()["assets"]
                   if (row.get("sequence") or {}).get("id") == "ANIM_DONE" and "/it/" in row["resource"])
    options = client.get("/api/asset-report/movie", params={"asset": italian["id"]}).json()
    assert options["id"] == "ANIM_DONE_MOVIE" and ["ANIM_DONE_MOVIE", "1920x1080", "en-GB"] in options["keys"]
    response = client.post("/api/asset-report/movie", json={
        "asset": italian["id"], "id": "ANIM_DONE_MOVIE", "path": options["path"], "descriptor": "RssMoviesData.json", "movieFormat": "valpha"})
    assert response.status_code == 200, response.text
    assert [(item["language"], item["resolution"]) for item in json.loads((game / "RssMoviesData.json").read_text())["movies"]] == [
        ("en-GB", "1920x1080"), ("en-GB", "1920x1200"), ("it-IT", "1920x1080")]
    # Now one with its id, resolution and language exists, so a second one is refused.
    english = next(row for row in client.get("/api/asset-report").json()["assets"]
                   if (row.get("sequence") or {}).get("id") == "ANIM_DONE" and "/en/" in row["resource"])
    assert client.get("/api/asset-report/movie", params={"asset": english["id"]}).json()["id"] == "ANIM_DONE_MOVIE_2"
    again = client.post("/api/asset-report/movie", json={
        "asset": english["id"], "id": "ANIM_DONE_MOVIE", "path": "m/Completed/en/Other.mov", "descriptor": "RssMoviesData.json", "movieFormat": "valpha"})
    assert again.status_code == 409
