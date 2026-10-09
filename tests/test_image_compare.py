"""Image matching for the GDA sync (egt_gda_sync.image_compare), as docs/image_compare/implementation.md describes it."""

import json
import os
import time
from pathlib import Path

import cv2
import numpy as np
import pytest

from egt_gda_sync import image_cache, image_compare, image_gpu
from egt_gda_sync.demo import to_dds
from egt_gda_sync.image_cache import CompareCache
from egt_gda_sync.image_compare import (
    SIFT_MIN_COVERAGE, decode_image, difference_hash, fitted, gray_image, hamming, judge, perceptual_hash, sift_features,
    sift_match, ssim,
)
from egt_gda_sync.png import encode_png
from egt_gda_sync.rss_sync import Config, compare, make_config


def drawing(seed: int, size: int = 320) -> np.ndarray:
    """A deterministic RGBA picture of shapes and numbers, like a game's UI art."""
    rng = np.random.default_rng(seed)
    image = np.zeros((size, size, 4), np.uint8)
    image[..., :3] = rng.integers(0, 255, 3)
    image[..., 3] = 255
    for _ in range(8):
        color = (*(int(value) for value in rng.integers(0, 255, 3)), 255)
        x, y = (int(value) for value in rng.integers(0, size, 2))
        cv2.circle(image, (x, y), int(rng.integers(10, size // 4)), color, -1)
        cv2.rectangle(image, (x, y), tuple(int(value) for value in rng.integers(0, size, 2)), color, 3)
    cv2.putText(image, str(seed), (20, size // 2), cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255, 255), 5)
    return image


def edited(image: np.ndarray) -> np.ndarray:
    copy = image.copy()
    cv2.putText(copy, "v2", (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0, 255), 3)
    return copy


def rotated(image: np.ndarray, angle: float = 20, scale: float = 0.85) -> np.ndarray:
    height, width = image.shape[:2]
    border = tuple(int(value) for value in image[0, 0])
    return cv2.warpAffine(image, cv2.getRotationMatrix2D((width / 2, height / 2), angle, scale), (width, height), borderValue=border)


def png(path: Path, image: np.ndarray, level: int = 6) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encode_png(image, level))


def write_game(root: Path, images: dict[str, np.ndarray], gda: dict[str, np.ndarray | bytes]) -> tuple[Path, Path]:
    """A game whose RssImagesData.json declares each image, and a GDA folder of images or raw bytes."""
    game, gda_dir = root / "resources" / "game", root / "gda"
    game.mkdir(parents=True)
    gda_dir.mkdir()
    for name, image in images.items():
        png(game / name, image)
    for name, value in gda.items():
        (gda_dir / name).parent.mkdir(parents=True, exist_ok=True)
        (gda_dir / name).write_bytes(value if isinstance(value, bytes) else encode_png(value))
    (game / "RssImagesData.json").write_text(json.dumps({"images": [{"id": f"I{index}", "path": name} for index, name in enumerate(images)]}))
    return game, gda_dir


def run(root: Path, **options) -> dict:
    return compare(Config(root / "resources", root / "gda", frozenset({".png", ".dds"}), "game", **options))


def rows(result: dict) -> dict[str, dict]:
    return {row["resource"]: row for row in result["differences"] + result["identical"]}


def matched(result: dict) -> dict:
    """What a run found: its summary and rows, without the run's own settings, times and cache statistics."""
    return {key: result[key] for key in ("summary", "differences", "identical")}


@pytest.fixture(autouse=True)
def no_gpu(monkeypatch):
    """The GPU algorithms only run where a test provides an embedder."""
    monkeypatch.setattr(image_gpu, "load_embedder", lambda: (None, "no GPU in the tests"))


# The algorithms


def test_decodes_png_jpeg_and_dds_images_as_rgba(tmp_path):
    image = drawing(1)
    image[:20, :20, 3] = 0
    png(tmp_path / "a.png", image)
    assert np.array_equal(decode_image(tmp_path / "a.png"), image)
    (tmp_path / "a.dds").write_bytes(to_dds(image))
    assert np.array_equal(decode_image(tmp_path / "a.dds"), image)
    # Gray and 16-bit images become 8-bit RGBA.
    gray = cv2.cvtColor(image, cv2.COLOR_RGBA2GRAY)
    (tmp_path / "gray.png").write_bytes(cv2.imencode(".png", gray.astype(np.uint16) * 257)[1].tobytes())
    decoded = decode_image(tmp_path / "gray.png")
    assert decoded.shape == (320, 320, 4) and np.array_equal(decoded[..., 0], gray) and (decoded[..., 3] == 255).all()
    (tmp_path / "a.jpg").write_bytes(cv2.imencode(".jpg", cv2.cvtColor(image, cv2.COLOR_RGBA2BGR))[1].tobytes())
    assert decode_image(tmp_path / "a.jpg").shape == (320, 320, 4)
    (tmp_path / "bad.png").write_bytes(b"not an image")
    with pytest.raises(ValueError, match="cannot decode"):
        decode_image(tmp_path / "bad.png")


def test_perceptual_hashes_are_close_for_an_edited_copy_and_far_for_another_picture():
    picture, copy, other = (gray_image(image) for image in (drawing(2), edited(drawing(2)), drawing(3)))
    for hash_function in (perceptual_hash, difference_hash):
        near = hamming(f"{hash_function(picture):016x}", f"{hash_function(copy):016x}")
        far = hamming(f"{hash_function(picture):016x}", f"{hash_function(other):016x}")
        assert near <= 8 and far >= 16, (hash_function.__name__, near, far)
    # Flat images have a stable hash, whatever their size; transparent pixels are black, whatever color they hold.
    flat = np.full((64, 64, 4), (40, 90, 200, 255), np.uint8)
    assert perceptual_hash(gray_image(flat)) == perceptual_hash(gray_image(np.full((200, 120, 4), (40, 90, 200, 255), np.uint8)))
    clear = np.zeros((64, 64, 4), np.uint8)
    painted = clear.copy()
    painted[..., :3] = 255
    assert np.array_equal(gray_image(clear), gray_image(painted))


def test_ssim_and_sift_verify_copies():
    picture = gray_image(drawing(4))
    assert ssim(picture, picture) == pytest.approx(1.0)
    assert ssim(picture, gray_image(drawing(5))) < 0.8
    features = sift_features(fitted(picture, 512))
    turned = sift_match(features, sift_features(fitted(gray_image(rotated(drawing(4))), 512)))
    assert turned["inliers"] >= 20 and turned["coverage"] >= SIFT_MIN_COVERAGE and turned["transform"] in ("homography", "similarity")
    other = sift_match(features, sift_features(fitted(gray_image(drawing(6)), 512)))
    assert other["inliers"] < 12 or other["coverage"] < SIFT_MIN_COVERAGE
    # A flat image has too little structure for SIFT.
    flat = sift_features(np.full((128, 128), 90, np.uint8))
    assert sift_match(features, flat) == {"keypoints": [len(features[0]), 0], "applicable": False}


def test_the_algorithms_evidence_is_combined_into_a_probability_and_a_match_type():
    def algorithms(**values) -> dict:
        found = {"sha256": {"equal": False}, "pixels": {"equal": False}}
        keys = {"phash": "hamming", "dhash": "hamming", "ssim": "value", "clip": "cosine", "dinov2": "cosine"}
        for name, value in values.items():
            found[name] = value if isinstance(value, dict) else {keys[name]: value}
        return found

    assert judge({"sha256": {"equal": True}}) == (100.0, "exact_file")
    assert judge(algorithms(pixels={"equal": True})) == (100.0, "exact_pixels")
    probability, kind = judge(algorithms(phash=2, dhash=1, ssim=0.99))
    assert kind == "near_duplicate" and 90 < probability <= 99.9
    # Only exact matches are 100 %.
    assert judge(algorithms(phash=0, dhash=0, ssim=1.0, sift={"inliers": 300, "coverage": 0.9}))[0] == 99.9
    # A pHash collision is outvoted by SSIM and dHash.
    assert judge(algorithms(phash=0, dhash=30, ssim=0.3)) [1] == "different"
    # A rotated copy: the structural algorithms disagree, SIFT finds the transformation.
    probability, kind = judge(algorithms(phash=18, dhash=11, ssim=0.65, sift={"inliers": 42, "coverage": 0.3}))
    assert kind == "transformed_duplicate" and probability > 99
    # Inliers that cover little of the image, such as the same letters, are no geometric match.
    assert judge(algorithms(phash=30, dhash=24, ssim=0.7, sift={"inliers": 42, "coverage": 0.004}))[1] == "different"
    # The embeddings alone never make a match, but name pictures that are alike.
    probability, kind = judge(algorithms(phash=28, dhash=20, ssim=0.6, clip=0.99, dinov2=0.97))
    assert kind == "semantically_similar" and probability < 50
    assert judge({"sha256": {"equal": False}}) == (None, "uncertain")


# The matching, through the GDA sync


def test_images_are_matched_by_their_contents_whatever_their_names(tmp_path):
    play, logo, coins, other = drawing(10), drawing(11), drawing(12), drawing(13)
    write_game(tmp_path, {"ui/play.png": play, "ui/logo.png": logo, "ui/coins.png": coins, "ui/lost.png": drawing(14),
                          "ui/same.png": other},
               {"ui/play.png": edited(play), "art/logo_final.png": logo, "ui/coins.png": other, "ui/same.png": other})
    (tmp_path / "gda" / "art" / "coins.dds").write_bytes(to_dds(coins))
    result = run(tmp_path)
    found = rows(result)
    # Statuses still come from names and SHA-256.
    assert {name: row["status"] for name, row in found.items()} == {
        "ui/play.png": "different SHA-256", "ui/logo.png": "missing", "ui/coins.png": "different SHA-256",
        "ui/lost.png": "missing", "ui/same.png": "identical"}

    # An edited copy of the same name: a near duplicate, its evaluation kept on the GDA file and in the matches.
    play_match = found["ui/play.png"]["imageMatch"]
    assert play_match["matchType"] == "near_duplicate" and play_match["probability"] >= 90
    [named] = found["ui/play.png"]["gdaFiles"]
    assert named["match"]["probability"] == play_match["probability"]
    assert set(named["match"]["algorithms"]) >= {"sha256", "pixels", "phash", "dhash", "ssim"}
    assert named["match"]["algorithms"]["phash"]["hamming"] <= 8 and named["match"]["algorithms"]["ssim"]["value"] > 0.95
    assert play_match["matches"][0]["path"] == "ui/play.png" and play_match["matches"][0]["sameName"] is True
    assert play_match["matches"][0]["foundBy"][0] == "name"

    # A renamed copy is found by its SHA-256, and a DDS file with the same pixels by its decoded pixels.
    logo_match = found["ui/logo.png"]["imageMatch"]
    assert [(match["path"], match["matchType"], match["probability"], match["sameName"]) for match in logo_match["matches"]] == [
        ("art/logo_final.png", "exact_file", 100.0, False)]
    assert "sha256" in logo_match["matches"][0]["foundBy"]
    coins_match = found["ui/coins.png"]["imageMatch"]
    assert coins_match["matches"][0]["path"] == "art/coins.dds" and coins_match["matches"][0]["matchType"] == "exact_pixels"
    # The same-named GDA file shows another picture.
    assert found["ui/coins.png"]["gdaFiles"][0]["match"]["matchType"] == "different"
    assert all(match["path"] != "ui/coins.png" for match in coins_match["matches"])

    # An image without a counterpart has no possible match; one in sync stops at its SHA-256.
    assert found["ui/lost.png"]["imageMatch"]["matches"] == []
    assert found["ui/same.png"]["imageMatch"] == {"probability": 100.0, "matchType": "exact_file", "candidates": 1, "matches": [{
        "tree": "game", "path": "ui/same.png", "absolutePath": str((tmp_path / "gda" / "ui" / "same.png").resolve()), "sameName": True,
        "foundBy": ["name"], "probability": 100.0, "matchType": "exact_file", "algorithms": {"sha256": {"equal": True}}, "stoppedBy": "sha256"}]}
    assert found["ui/same.png"]["gdaFiles"][0]["match"]["matchType"] == "exact_file"

    image_compare_report = result["imageCompare"]
    assert image_compare_report["counts"]["images"] == 5 and image_compare_report["counts"]["exact"] == 1
    assert image_compare_report["settings"] == {"multithreading": True, "workers": image_compare.WORKERS, "useGpu": False, "matchThreshold": 50.0}
    assert image_compare_report["algorithms"]["clip"]["enabled"] is False and image_compare_report["algorithms"]["sift"]["enabled"] is True
    assert "error" not in image_compare_report


def test_the_threshold_decides_the_possible_matches(tmp_path):
    play = drawing(20)
    write_game(tmp_path, {"ui/play.png": play}, {"ui/play.png": drawing(21), "old/play.png": edited(play)})
    every = rows(run(tmp_path, image_match_threshold=0.0))["ui/play.png"]
    probabilities = [match["probability"] for match in every["imageMatch"]["matches"]]
    assert len(probabilities) == 2 and probabilities == sorted(probabilities, reverse=True)
    strict = rows(run(tmp_path, image_match_threshold=probabilities[0] + 0.1))["ui/play.png"]
    assert strict["imageMatch"]["matches"] == [] and strict["imageMatch"]["probability"] == probabilities[0]
    # Every same-named GDA file keeps its evaluation, whatever the threshold.
    assert all("match" in file for file in strict["gdaFiles"])


def test_same_named_gda_files_in_equally_close_folders_are_ordered_by_probability(tmp_path):
    """Sync copies the first GDA file: the closest folder, then the most similar picture."""
    play = drawing(30)
    write_game(tmp_path, {"ui/play.png": play}, {"a/play.png": drawing(31), "b/play.png": edited(play)})
    row = rows(run(tmp_path))["ui/play.png"]
    assert [file["path"] for file in row["gdaFiles"]] == ["b/play.png", "a/play.png"]
    assert row["gdaFiles"][0]["match"]["probability"] > row["gdaFiles"][1]["match"]["probability"]
    # A closer folder still comes first.
    (tmp_path / "gda" / "ui").mkdir()
    (tmp_path / "gda" / "a" / "play.png").rename(tmp_path / "gda" / "ui" / "play.png")
    assert [file["path"] for file in rows(run(tmp_path))["ui/play.png"]["gdaFiles"]] == ["ui/play.png", "b/play.png"]


def test_threads_do_not_change_the_result_and_the_cache_spares_the_work_of_a_rescan(tmp_path):
    pictures = {f"ui/p{index}.png": drawing(40 + index) for index in range(6)}
    gda = {f"ui/p{index}.png": edited(image) for index, image in enumerate(pictures.values())}
    gda.update({f"renamed/r{index}.png": image for index, image in enumerate(pictures.values()) if index % 2})
    write_game(tmp_path, pictures, gda)
    cache = tmp_path / "cache.sqlite3"
    serial = run(tmp_path, multithreading=False)
    first = run(tmp_path, cache_path=cache)
    again = run(tmp_path, cache_path=cache)
    assert matched(serial) == matched(first) == matched(again)
    assert serial["imageCompare"]["settings"]["workers"] == 1
    assert first["imageCompare"]["counts"]["decoded"] == 12 and again["imageCompare"]["counts"]["decoded"] == 0
    stats = again["imageCompare"]["cache"]
    assert stats["path"] == str(cache) and stats["files"]["misses"] == 0 and stats["features"]["misses"] == 0
    assert stats["pairs"]["hits"] > 0 and stats["pairs"]["misses"] == 0
    assert "decoding" not in again["imageCompare"]["seconds"]


def test_file_hashes_are_reused_until_the_file_changes(tmp_path, monkeypatch):
    path = tmp_path / "a.bin"
    path.write_bytes(b"first")
    hashed = []

    def hash_file(file: Path) -> str:
        hashed.append(file)
        return file.read_bytes().decode()

    cache = CompareCache(tmp_path / "cache.sqlite3")
    assert cache.file_hashes([path], hash_file) == {path: "first"}
    assert cache.file_hashes([path], hash_file) == {path: "first"} and len(hashed) == 1
    path.write_bytes(b"other")
    os.utime(path, ns=(time.time_ns(), time.time_ns() + 10_000_000))
    assert cache.file_hashes([path], hash_file) == {path: "other"} and len(hashed) == 2
    # After REHASH_AFTER, an unchanged file is hashed again.
    later = time.time() + image_cache.REHASH_AFTER + 1
    monkeypatch.setattr(image_cache.time, "time", lambda: later)
    cache.file_hashes([path], hash_file)
    assert len(hashed) == 3
    cache.close()


def test_a_cache_that_cannot_be_opened_is_kept_in_memory(tmp_path):
    play = drawing(50)
    write_game(tmp_path, {"ui/play.png": play}, {"ui/play.png": edited(play)})
    (tmp_path / "cache-folder").mkdir()
    result = run(tmp_path, cache_path=tmp_path / "cache-folder")
    assert "error" in result["imageCompare"]["cache"] and "error" not in result["imageCompare"]
    assert rows(result)["ui/play.png"]["imageMatch"]["matchType"] == "near_duplicate"


def test_an_image_that_cannot_be_decoded_is_matched_by_its_sha256_only(tmp_path):
    write_game(tmp_path, {"ui/ok.png": drawing(60)}, {"ui/broken.png": b"broken", "other/copy.png": b"broken"})
    (tmp_path / "resources" / "game" / "ui" / "broken.png").write_bytes(b"broken!")
    (tmp_path / "resources" / "game" / "ui" / "copy.png").write_bytes(b"broken")
    (tmp_path / "resources" / "game" / "RssImagesData.json").write_text(json.dumps({"images": [
        {"id": "A", "path": "ui/ok.png"}, {"id": "B", "path": "ui/broken.png"}, {"id": "C", "path": "ui/copy.png"}]}))
    result = run(tmp_path)
    broken = rows(result)["ui/broken.png"]
    assert broken["imageMatch"]["probability"] is None and broken["imageMatch"]["matchType"] == "uncertain"
    assert "cannot decode" in broken["imageMatch"]["error"]
    assert broken["gdaFiles"][0]["match"]["algorithms"] == {"sha256": {"equal": False}}
    # A copy is still an exact file, though neither can be decoded.
    copy = rows(result)["ui/copy.png"]["imageMatch"]
    assert copy["matches"][0]["matchType"] == "exact_file" and copy["matches"][0]["path"] == "other/copy.png"
    # Counted by contents: the GDA's two files hold the same bytes.
    assert result["imageCompare"]["counts"]["undecodable"] == 2


class FakeEmbedder:
    """The embedder's interface without torch: each model's embedding is the image's colors in an 8 × 8 thumbnail."""
    device_name = "Test GPU"

    def __init__(self):
        self.models = {"clip": None, "dinov2": None}
        self.closed = False

    def embed(self, images: np.ndarray) -> dict[str, np.ndarray]:
        small = np.stack([cv2.resize(image, (8, 8), interpolation=cv2.INTER_AREA).ravel().astype(np.float32) for image in images])
        small -= small.mean(axis=1, keepdims=True)
        vectors = small / np.linalg.norm(small, axis=1, keepdims=True)
        return {"clip": vectors, "dinov2": vectors}

    def nearest(self, queries: np.ndarray, targets: np.ndarray, k: int):
        similarity = queries @ targets.T
        order = np.argsort(-similarity, axis=1, kind="stable")[:, :k]
        return order, np.take_along_axis(similarity, order, axis=1)

    def close(self):
        self.closed = True


def test_the_gpu_algorithms_add_candidates_and_evidence(tmp_path, monkeypatch):
    logo = drawing(70)
    write_game(tmp_path, {"ui/logo.png": logo}, {"art/turned.png": rotated(logo, 4, 1.0), "art/other.png": drawing(71)})
    embedder = FakeEmbedder()
    monkeypatch.setattr(image_gpu, "load_embedder", lambda: (embedder, None))
    monkeypatch.setattr(image_compare, "EMBEDDING_FLOOR", {"clip": 0.5, "dinov2": 0.5})
    result = run(tmp_path, use_gpu=True, image_match_threshold=0.0)
    assert result["imageCompare"]["gpu"] == {"requested": True, "available": True, "device": "Test GPU"}
    assert result["imageCompare"]["algorithms"]["clip"]["enabled"] is True and embedder.closed
    matches = {match["path"]: match for match in rows(result)["ui/logo.png"]["imageMatch"]["matches"]}
    assert {"clip", "dinov2"} <= set(matches["art/turned.png"]["foundBy"])
    assert matches["art/turned.png"]["algorithms"]["clip"]["cosine"] > 0.9
    assert matches["art/turned.png"]["probability"] > matches.get("art/other.png", {"probability": 0})["probability"]
    # The embeddings are cached like the features.
    again = run(tmp_path, use_gpu=True, image_match_threshold=0.0, cache_path=tmp_path / "cache.sqlite3")
    rerun = run(tmp_path, use_gpu=True, image_match_threshold=0.0, cache_path=tmp_path / "cache.sqlite3")
    # Three images, each with an embedding of both models.
    assert rerun["imageCompare"]["cache"]["embeddings"] == {"hits": 6, "misses": 0}
    assert matched(again) == matched(rerun)


def test_without_a_gpu_the_report_says_why_and_matching_goes_on(tmp_path):
    play = drawing(80)
    write_game(tmp_path, {"ui/play.png": play}, {"ui/play.png": edited(play)})
    result = run(tmp_path, use_gpu=True)
    assert result["imageCompare"]["gpu"] == {"requested": True, "available": False, "reason": "no GPU in the tests"}
    assert result["imageCompare"]["algorithms"]["dinov2"]["enabled"] is False
    assert rows(result)["ui/play.png"]["imageMatch"]["matchType"] == "near_duplicate"


def test_the_packaged_executable_says_it_has_no_gpu_algorithms(monkeypatch):
    monkeypatch.undo()
    monkeypatch.setattr(image_gpu.sys, "frozen", True, raising=False)
    assert image_gpu.load_embedder() == (None, "the packaged executable has no GPU algorithms; run the app from a Python "
                                               "environment with the gpu extra")


@pytest.mark.parametrize(("key", "value", "message"), [
    ("multithreading", "yes", "multithreading must be true or false"),
    ("use_gpu", 1, "use_gpu must be true or false"),
    ("image_match_threshold", 100.5, "image_match_threshold must be a percentage"),
    ("image_match_threshold", True, "image_match_threshold must be a percentage"),
    ("cache_path", "", "cache_path must be a nonempty path"),
])
def test_image_settings_are_validated(tmp_path, key, value, message):
    write_game(tmp_path, {"a.png": drawing(90)}, {})
    settings = {"resources_dir": str(tmp_path / "resources"), "gda_dir": str(tmp_path / "gda"), "game": "game", "extensions": [".png"]}
    assert make_config(settings).image_match_threshold == 50.0
    with pytest.raises(ValueError, match=message):
        make_config({**settings, key: value})


@pytest.mark.skipif(os.environ.get("EGT_GDA_SYNC_GPU_TESTS") != "1",
                    reason="set EGT_GDA_SYNC_GPU_TESTS=1 with torch, transformers and a CUDA GPU to run the real models")
def test_the_real_gpu_algorithms(tmp_path, monkeypatch):
    monkeypatch.undo()
    logo = drawing(100)
    write_game(tmp_path, {"ui/logo.png": logo}, {"art/turned.png": rotated(logo)})
    result = run(tmp_path, use_gpu=True)
    assert result["imageCompare"]["gpu"]["available"] is True, result["imageCompare"]["gpu"]
    [match] = rows(result)["ui/logo.png"]["imageMatch"]["matches"]
    assert match["matchType"] == "transformed_duplicate" and {"clip", "dinov2"} <= set(match["algorithms"])


# Syncing an image from a chosen GDA image


def sync_api(tmp_path: Path):
    """A library of one workspace with images to sync, compared, and a client of its API."""
    from fastapi.testclient import TestClient
    from egt_gda_sync.library import Library
    from egt_gda_sync.server import create_app
    from tests.conftest import session_headers

    play, logo, coins = drawing(110), drawing(111), drawing(112)
    game, gda = write_game(tmp_path, {"ui/play.png": play, "ui/logo.png": logo, "ui/coins.png": coins}, {
        # play.png: the same-named file is redrawn, an edited copy of another name is the most likely.
        "ui/play.png": drawing(113), "other/play_v2.png": edited(play),
        # logo.png is missing by name; the GDA has an edited copy of another name.
        "art/logo_new.png": edited(logo),
        # coins.png: an identical copy of another name changes nothing, so the same-named file is synced.
        "ui/coins.png": edited(coins), "backup/coins_copy.png": coins,
    })
    entry = {"id": "images", "game_name": "Images", "game_path": str(game), "gda_path": str(gda), "extensions": [".png"]}
    (tmp_path / "workspace.json").write_text(json.dumps({"defaultWorkspace": "images", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(tmp_path / "workspace.json"))
    library.init()
    client = TestClient(create_app(library, dev=True), base_url="http://127.0.0.1")
    client.__enter__()
    headers = session_headers(client)
    client.post("/api/scan", headers=headers)
    library.reports.wait("images", 120)

    def rows() -> dict[str, dict]:
        return {row["resource"]: row for row in client.get("/api/rss-sync/report").json()["differences"]}

    def copy(ids: list[str], gda_files: dict | None = None) -> dict:
        result = client.post("/api/rss-sync/copy", headers=headers, json={"ids": ids, **({"gdaFiles": gda_files} if gda_files else {})}).json()
        library.reports.wait("images", 120)
        return result

    def apply(resources: list[dict]) -> dict:
        result = client.post("/api/rss-sync/apply", headers=headers, json={"resources": resources}).json()
        library.reports.wait("images", 120)
        return result

    client.apply = apply
    return game, gda, client, rows, copy


def test_an_image_is_synced_from_its_most_likely_gda_image_without_a_choice(tmp_path):
    game, gda, client, rows, copy = sync_api(tmp_path)
    try:
        found = rows()
        assert [row["category"] for row in (found["ui/play.png"], found["ui/logo.png"], found["ui/coins.png"])] == ["different", "missing", "different"]
        result = copy([found["ui/play.png"]["id"], found["ui/coins.png"]["id"]])
        assert result["failures"] == [] and sorted(result["copied"]) == ["ui/coins.png", "ui/play.png"]
        assert (game / "ui" / "play.png").read_bytes() == (gda / "other" / "play_v2.png").read_bytes()
        # The identical copy would change nothing, so the most likely image that changes the game file is copied.
        assert (game / "ui" / "coins.png").read_bytes() == (gda / "ui" / "coins.png").read_bytes()
        # A missing image is only synced from a GDA image chosen for it.
        assert copy([found["ui/logo.png"]["id"]])["error"] == "Only a resource that differs from its GDA file can be synced"
    finally:
        client.__exit__(None, None, None)


def test_an_image_is_synced_from_the_gda_image_chosen_for_it(tmp_path):
    game, gda, client, rows, copy = sync_api(tmp_path)
    try:
        found = rows()
        play, logo, coins = found["ui/play.png"], found["ui/logo.png"], found["ui/coins.png"]
        same_name = str((gda / "ui" / "play.png").resolve())
        result = copy([play["id"]], {play["id"]: same_name})
        assert result["copied"] == ["ui/play.png"] and (game / "ui" / "play.png").read_bytes() == (gda / "ui" / "play.png").read_bytes()
        # A missing image is synced from the GDA image chosen for it.
        renamed = str((gda / "art" / "logo_new.png").resolve())
        result = copy([logo["id"]], {logo["id"]: renamed})
        assert result["copied"] == ["ui/logo.png"] and (game / "ui" / "logo.png").read_bytes() == (gda / "art" / "logo_new.png").read_bytes()

        def refused(ids: list[str], gda_files: dict) -> str:
            return copy(ids, gda_files)["error"]

        # An image with the game file's contents, a file that is not a candidate, and a resource that is not synced
        # cannot be chosen.
        assert "the chosen GDA image is not one it can be synced from" in refused([coins["id"]], {coins["id"]: str((gda / "backup" / "coins_copy.png").resolve())})
        assert "the chosen GDA image is not one it can be synced from" in refused([coins["id"]], {coins["id"]: str(tmp_path / "elsewhere.png")})
        assert refused([coins["id"]], {logo["id"]: renamed}) == "A GDA image can only be chosen for a resource that is synced"
        assert (game / "ui" / "coins.png").read_bytes() != (gda / "ui" / "coins.png").read_bytes()
        # Applying several actions passes each image's chosen GDA image too.
        chosen = str((gda / "ui" / "coins.png").resolve())
        result = client.apply([{"id": rows()["ui/coins.png"]["id"], "category": "different", "gdaFile": chosen}])
        assert result["copied"] == ["ui/coins.png"] and (game / "ui" / "coins.png").read_bytes() == (gda / "ui" / "coins.png").read_bytes()
    finally:
        client.__exit__(None, None, None)
