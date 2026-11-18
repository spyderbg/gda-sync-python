"""Making a movie from an image sequence: its frames encoded by FFmpeg, valpha (the picture over its alpha) or opaque, and
a Movie entry with a new id that a view's Anim element can name instead of the sequence."""

import json
import shutil
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from egt_gda_sync.app.server import create_app
from egt_gda_sync.assets.movie_maker import encode_movie, movie_frame, movie_path
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
        {"id": "ANIM_SPARK", "frameTime": 40, "loopCount": 0, "frames": [{"path": "art/1920x1080/fx/Spark/Spark_{0-5}.png"}]},
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


def test_a_valpha_frame_is_the_premultiplied_picture_over_its_alpha_padded_to_an_even_size():
    image = np.array([[[200, 100, 50, 128], [10, 20, 30, 255], [1, 2, 3, 0]]], np.uint8)
    pixels = np.frombuffer(movie_frame(image, "valpha", 4, 2), np.uint8).reshape(4, 4, 3)
    assert pixels[0, 0].tolist() == [100, 50, 25] and pixels[0, 1].tolist() == [10, 20, 30] and pixels[0, 2].tolist() == [0, 0, 0]
    assert pixels[2, :, 0].tolist() == [128, 255, 0, 0] and not pixels[1].any() and not pixels[3].any()
    assert np.frombuffer(movie_frame(image, "opaque", 4, 2), np.uint8).size == 4 * 2 * 3


def test_the_options_suggest_an_id_a_path_and_valpha_for_frames_with_alpha(client):
    options = client.get("/api/asset-report/movie", params={"asset": sequence(client, "ANIM_SPARK")["id"]}).json()
    assert options["id"] == "ANIM_SPARK_MOVIE" and options["path"] == "m/fx/Spark-rgba.mov"
    assert options["descriptors"] == ["RssMoviesData.json"] and options["movieFormat"] == "valpha"
    assert (options["frameTime"], options["fps"], options["loopCount"], options["frames"]) == (40, 25.0, 0, 6)


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
    assert result["library"]["activity"][0]["message"] == "Made movie ANIM_SPARK_MOVIE (m/fx/Spark-rgba.mov) from ANIM_SPARK, declared in RssMoviesData.json"
    manifest = json.loads(next(Path(result["library"]["backupPath"]).glob("*.json")).read_text())
    assert {item["path"]: item["change"] for item in manifest["files"]} == {
        "example/RssMoviesData.json": "replaced", "example/m/fx/Spark-rgba.mov": "created"}

    again = {"asset": row["id"], "id": "ANIM_SPARK_MOVIE", "path": "m/fx/other.mov", "descriptor": "RssMoviesData.json", "movieFormat": "valpha"}
    assert client.post("/api/asset-report/movie", json=again).status_code == 409
    taken = {**again, "id": "ANIM_SPARK", "path": "m/fx/other.mov"}
    assert client.post("/api/asset-report/movie", json=taken).json()["error"] == "ANIM_SPARK is the id of another resource of the game"
    existing = {**again, "id": "ANIM_SPARK_2", "path": "m/fx/Spark-rgba.mov"}
    assert client.post("/api/asset-report/movie", json=existing).json()["error"] == "m/fx/Spark-rgba.mov exists already"
    outside = {**again, "id": "ANIM_SPARK_2", "path": "../elsewhere.mov"}
    assert client.post("/api/asset-report/movie", json=outside).status_code == 400


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
