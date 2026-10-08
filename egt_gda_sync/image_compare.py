"""Image matching for the GDA sync: how likely a game image and a GDA image show the same picture, from 0.0 to 100.0 %.

It implements docs/image_compare/algorithm.md; docs/image_compare/implementation.md describes each step and its
parameters. For every game image that the sync compares:

1. An exact match ends the search: a same-named GDA file with the same SHA-256 (exact_file), or the same top image of a
   DDS file that differs only in its mip levels (exact_pixels).
2. Candidates: the GDA images of the same file name, of the same SHA-256 or decoded pixels, within PHASH_RADIUS of its
   pHash, and with use_gpu its nearest by CLIP and DINOv2 embeddings.
3. Each candidate is verified: decoded pixels, pHash and dHash distances, SSIM, and SIFT unless SSIM already shows a
   near duplicate, with the cosine similarities of the embeddings.
4. Each algorithm's value becomes the probability that it alone means a match. The structural (pHash, dHash, SSIM),
   geometric (SIFT) and semantic (CLIP, DINOv2) evidence are pooled, and the strongest gives the pair's probability and
   match type.

Features are computed lazily, once per file content, and kept in the compare cache with the SSIM and SIFT results of
each pair, so a rescan decodes only images that changed.
"""

from __future__ import annotations

import hashlib
import math
import os
import struct
import threading
import time
from collections import Counter, OrderedDict, defaultdict
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

import cv2
import numpy as np

from .dds import decode_dds_rgba
from .image_cache import CompareCache, FileHashes, batches
from .image_gpu import MODELS

IMAGE_EXTENSIONS = frozenset({".dds", ".png", ".jpg", ".jpeg", ".webp", ".bmp"})
# The version of decoding, preprocessing and the algorithms: cached features and pair results of another are ignored.
VERSION = 1
MAX_FILE_BYTES = 256 * 1024 * 1024
MAX_PIXELS = 8192 * 8192
# Threads with multithreading: the algorithm's 4 to 8 CPU workers. OpenCV's own threads are turned off to avoid
# running more threads than cores.
WORKERS = max(1, min(8, os.cpu_count() or 1))
CHUNK = 256  # images decoded at a time, then embedded together
DETAIL_CACHE = 1024  # images whose SSIM thumbnail and SIFT features stay in memory during the verification, ~150 MB
# Features of every image: pHash (DCT of a 32 × 32 thumbnail) and dHash (9 × 8) of 8 × 8 = 64 bits.
HASH_SIZE = 8
PHASH_INPUT = 32
# SSIM on 256 × 256 thumbnails, with an 11 × 11 Gaussian window of σ 1.5 (Wang et al.). At SSIM_STOP the pair is a
# near duplicate, and SIFT is not run.
SSIM_SIZE = 256
SSIM_SIGMA = 1.5
SSIM_C1 = (0.01 * 255) ** 2
SSIM_C2 = (0.03 * 255) ** 2
SSIM_STOP = 0.98
# SIFT on the image fitted into 512 × 512: up to 500 keypoints, Lowe's ratio test, then the matches that one RANSAC
# homography explains (its inliers). A homography that scales by more than SIFT_MAX_SCALE or bends the image more than
# SIFT_MAX_PERSPECTIVE fits chance matches, such as the same letters at other places; then a similarity transform
# (rotation, scale and shift) is fitted instead. Images with fewer keypoints have too little structure to judge, and
# inliers that cover less than SIFT_MIN_COVERAGE of either image, such as the same letters or a shared logo, are not a
# geometric match: they count as none.
SIFT_SIZE = 512
SIFT_FEATURES = 500
SIFT_RATIO = 0.75
SIFT_RANSAC_PIXELS = 5.0
SIFT_MIN_KEYPOINTS = 8
SIFT_MAX_SCALE = 4.0
SIFT_MAX_PERSPECTIVE = 0.002
SIFT_MIN_COVERAGE = 0.03
# Candidates: every GDA image within PHASH_RADIUS bits of the pHash, the PHASH_LIMIT nearest when more are (blank
# images share one hash), and with use_gpu the EMBEDDING_TOP_K nearest by each model from its floor.
PHASH_RADIUS = 12
PHASH_LIMIT = 50
EMBEDDING_TOP_K = 20
EMBEDDING_FLOOR = {"clip": 0.88, "dinov2": 0.90}
# Embedding inputs: the image fitted into 224 × 224 over gray, its transparent pixels gray too.
EMBEDDING_SIZE = 224
BACKGROUND = 128
# Each algorithm's evidence: the probability that its value alone means the images match, a logistic curve that is
# 50 % at the midpoint and changes the odds by a factor e every scale; a negative scale for distances. The values are
# fitted on synthetic image sets (docs/image_compare/implementation.md): drawn images in one style, their edited,
# re-encoded, renamed, rotated, scaled, cropped and bent copies, and unrelated drawings.
CALIBRATION = {
    "phash": (16.0, -2.0),  # Hamming distance of 64 bits
    "dhash": (8.0, -2.0),  # Hamming distance of 64 bits
    "ssim": (0.92, 0.025),  # mean SSIM
    "sift": (17.0, 3.0),  # RANSAC inliers that cover enough of the image
    "clip": (0.95, 0.015),  # cosine similarity
    "dinov2": (0.955, 0.01),  # cosine similarity
}
VALUES = {"phash": "hamming", "dhash": "hamming", "ssim": "value", "sift": "inliers", "clip": "cosine", "dinov2": "cosine"}
# The hypotheses that a pair matches, each with the weights of its evidence, whose log-odds are averaged. A hypothesis
# needs its own evidence: the structural one pHash, dHash or SSIM, the geometric one SIFT. The embeddings only support
# the structural one: images in one art style are alike to CLIP and DINOv2 without being the same picture, and a
# rotated or cropped copy is less alike to them than an edited one.
HYPOTHESES = {
    "structural": {"phash": 1.0, "dhash": 1.0, "ssim": 2.0, "clip": 0.5, "dinov2": 0.5},
    "geometric": {"sift": 1.0},
}
SUPPORT = ("clip", "dinov2")
SEMANTIC_SIMILAR = 80.0  # a pair below MATCH whose embeddings alone give this much is semantically or visually similar
NEAR_DUPLICATE = 80.0  # a structural probability from here is a near duplicate, below it visually similar
MATCH = 50.0  # from here the hypothesis names the match type
UNCERTAIN = 20.0  # from here up to MATCH the pair is uncertain, below it different
TOP_PROBABILITY = 99.9  # 100.0 is kept for exact matches
# What can find a candidate, in the order a match lists them.
FOUND_BY = ("name", "sha256", "pixels", "phash", "clip", "dinov2")
# A same-named GDA file's evaluation, as its entry in gdaFiles holds it.
EVALUATION_KEYS = ("probability", "matchType", "algorithms", "stoppedBy", "error")

Progress = Callable[[str, int, int], None]


# Decoding and features


def decode_image(path: Path) -> np.ndarray:
    """A file's image as a (height, width, 4) uint8 RGBA array: a DDS file's first surface and mip level with the app's
    decoders, any other image with OpenCV. ValueError when it cannot be decoded."""
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError(f"the file is larger than {MAX_FILE_BYTES // 1024 // 1024} MB")
    data = path.read_bytes()
    if path.suffix.lower() == ".dds":
        return decode_dds_rgba(data)
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack_from(">II", data, 16)
        if width * height > MAX_PIXELS:
            raise ValueError(f"the image has more than {MAX_PIXELS // 1024 // 1024} megapixels")
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError("OpenCV cannot decode the image")
    if image.dtype == np.uint16:
        image = (image >> 8).astype(np.uint8)
    elif image.dtype != np.uint8:
        raise ValueError(f"{image.dtype} pixels are not supported")
    if image.shape[0] * image.shape[1] > MAX_PIXELS:
        raise ValueError(f"the image has more than {MAX_PIXELS // 1024 // 1024} megapixels")
    if image.ndim == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2RGBA)
    if image.shape[2] == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2RGBA)
    if image.shape[2] == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2RGBA)
    raise ValueError(f"images with {image.shape[2]} channels are not supported")


def resized(image: np.ndarray, width: int, height: int) -> np.ndarray:
    """An image at a size: averaged over areas when it shrinks, interpolated when it grows."""
    shrinks = width * height <= image.shape[0] * image.shape[1]
    return cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA if shrinks else cv2.INTER_LINEAR)


def fitted(image: np.ndarray, size: int) -> np.ndarray:
    """An image scaled to fit size × size, keeping its aspect ratio; a smaller one stays as it is."""
    height, width = image.shape[:2]
    scale = size / max(width, height)
    if scale >= 1:
        return image
    return resized(image, max(1, round(width * scale)), max(1, round(height * scale)))


def gray_image(rgba: np.ndarray) -> np.ndarray:
    """The image's luma with its alpha premultiplied: transparent pixels are black, whatever color they hold."""
    return cv2.cvtColor(cv2.cvtColor(rgba, cv2.COLOR_RGBA2mRGBA), cv2.COLOR_RGBA2GRAY)


def bits_value(bits: np.ndarray) -> int:
    return int.from_bytes(np.packbits(bits.ravel()).tobytes(), "big")


def perceptual_hash(gray: np.ndarray) -> int:
    """pHash: the 8 × 8 lowest frequencies of the DCT of a 32 × 32 thumbnail, each 1 above their median. They are
    rounded first, so a flat image has a stable hash."""
    low = np.round(cv2.dct(resized(gray, PHASH_INPUT, PHASH_INPUT).astype(np.float32))[:HASH_SIZE, :HASH_SIZE], 3)
    return bits_value(low > np.median(low))


def difference_hash(gray: np.ndarray) -> int:
    """dHash: a 9 × 8 thumbnail, each bit 1 where a pixel is brighter than the one on its left."""
    small = resized(gray, HASH_SIZE + 1, HASH_SIZE).astype(np.int16)
    return bits_value(small[:, 1:] > small[:, :-1])


def pixel_digest(rgba: np.ndarray) -> str:
    """The SHA-256 of the image's size and decoded RGBA pixels: equal for the same pixels in any file format."""
    height, width = rgba.shape[:2]
    digest = hashlib.sha256(struct.pack("<II", width, height))
    digest.update(np.ascontiguousarray(rgba).data)
    return digest.hexdigest()


def image_features(rgba: np.ndarray) -> dict:
    """The features every image has, which the cache keeps: its size, pixel digest, pHash and dHash."""
    gray = gray_image(rgba)
    return {"width": rgba.shape[1], "height": rgba.shape[0], "pixels": pixel_digest(rgba),
            "phash": f"{perceptual_hash(gray):016x}", "dhash": f"{difference_hash(gray):016x}"}


def embedding_input(rgba: np.ndarray) -> np.ndarray:
    """The image fitted into a 224 × 224 RGB square over gray, for CLIP and DINOv2. Its transparent pixels are gray too,
    so the whole image is seen, whatever its aspect ratio."""
    premultiplied = cv2.cvtColor(rgba, cv2.COLOR_RGBA2mRGBA)
    height, width = rgba.shape[:2]
    scale = EMBEDDING_SIZE / max(width, height)
    small_width, small_height = max(1, round(width * scale)), max(1, round(height * scale))
    small = resized(premultiplied, small_width, small_height).astype(np.uint16)
    rgb = small[..., :3] + (BACKGROUND * (255 - small[..., 3:]) + 127) // 255
    canvas = np.full((EMBEDDING_SIZE, EMBEDDING_SIZE, 3), BACKGROUND, np.uint8)
    top, left = (EMBEDDING_SIZE - small_height) // 2, (EMBEDDING_SIZE - small_width) // 2
    canvas[top:top + small_height, left:left + small_width] = np.minimum(rgb, 255).astype(np.uint8)
    return canvas


def ssim(first: np.ndarray, second: np.ndarray) -> float:
    """The mean structural similarity of two gray images of one size, without the borders of the window."""
    x, y = first.astype(np.float32), second.astype(np.float32)

    def blur(image: np.ndarray) -> np.ndarray:
        return cv2.GaussianBlur(image, (11, 11), SSIM_SIGMA, borderType=cv2.BORDER_REFLECT)

    mean_x, mean_y = blur(x), blur(y)
    variance_x = blur(x * x) - mean_x * mean_x
    variance_y = blur(y * y) - mean_y * mean_y
    covariance = blur(x * y) - mean_x * mean_y
    index = ((2 * mean_x * mean_y + SSIM_C1) * (2 * covariance + SSIM_C2)) / \
        ((mean_x * mean_x + mean_y * mean_y + SSIM_C1) * (variance_x + variance_y + SSIM_C2))
    return float(index[5:-5, 5:-5].mean())


Sift = tuple[np.ndarray, np.ndarray, int]


def sift_features(gray: np.ndarray) -> Sift:
    """SIFT keypoints of a gray image: their positions (n, 2), descriptors (n, 128), and the image's area in pixels.
    OpenCV's descriptors are whole numbers from 0 to 255, so they are kept as bytes."""
    area = gray.shape[0] * gray.shape[1]
    keypoints, descriptors = cv2.SIFT_create(nfeatures=SIFT_FEATURES).detectAndCompute(gray, None)
    if descriptors is None:
        return np.zeros((0, 2), np.float32), np.zeros((0, 128), np.uint8), area
    points = np.array([point.pt for point in keypoints], np.float32).reshape(-1, 2)
    return points, np.clip(np.rint(descriptors), 0, 255).astype(np.uint8), area


def sift_match(first: Sift, second: Sift) -> dict:
    """The keypoints of both images, their matches that pass the ratio test, how many of those one transformation
    explains (RANSAC inliers), a plausible homography or else a similarity transform, and the share of the smaller image
    the inliers cover (the area of their convex hull). Without enough keypoints SIFT does not apply."""
    keypoints = [len(first[0]), len(second[0])]
    if min(keypoints) < SIFT_MIN_KEYPOINTS:
        return {"keypoints": keypoints, "applicable": False}
    pairs = cv2.BFMatcher(cv2.NORM_L2).knnMatch(first[1].astype(np.float32), second[1].astype(np.float32), k=2)
    good = [pair[0] for pair in pairs if len(pair) == 2 and pair[0].distance < SIFT_RATIO * pair[1].distance]
    result: dict = {"keypoints": keypoints, "goodMatches": len(good), "inliers": 0, "coverage": 0.0}
    if len(good) < 4:
        return result
    source = first[0][[match.queryIdx for match in good]]
    target = second[0][[match.trainIdx for match in good]]
    homography, mask = cv2.findHomography(source, target, cv2.RANSAC, SIFT_RANSAC_PIXELS)
    model = "homography"
    if homography is None or not plausible(homography):
        similarity, mask = cv2.estimateAffinePartial2D(source, target, method=cv2.RANSAC, ransacReprojThreshold=SIFT_RANSAC_PIXELS)
        if similarity is None or not 1 / SIFT_MAX_SCALE <= math.hypot(similarity[0, 0], similarity[1, 0]) <= SIFT_MAX_SCALE:
            return result
        model = "similarity"
    inlying = mask.ravel().astype(bool)
    coverage = min(cv2.contourArea(cv2.convexHull(points[inlying])) / area
                   for points, area in ((source, first[2]), (target, second[2]))) if inlying.sum() >= 3 else 0.0
    return {**result, "inliers": int(inlying.sum()), "coverage": round(coverage, 4), "transform": model}


def plausible(homography: np.ndarray) -> bool:
    """Whether a homography could map an image to an edited copy: it scales the area by at most SIFT_MAX_SCALE² either
    way, without mirroring, and bends it little."""
    area = float(np.linalg.det(homography[:2, :2])) / float(homography[2, 2]) ** 2 if homography[2, 2] else 0.0
    return 1 / SIFT_MAX_SCALE ** 2 <= area <= SIFT_MAX_SCALE ** 2 and \
        max(abs(homography[2, 0]), abs(homography[2, 1])) / abs(homography[2, 2]) <= SIFT_MAX_PERSPECTIVE


# Scoring


def value_of(algorithm: str, result: dict) -> float:
    """The value of an algorithm's result that its evidence is calibrated on: SIFT's inliers count only when they cover
    enough of the image."""
    if algorithm == "sift" and result.get("coverage", 0.0) < SIFT_MIN_COVERAGE:
        return 0.0
    return result[VALUES[algorithm]]


def evidence(algorithm: str, value: float) -> float:
    """The probability, 0 to 1, that the algorithm's value alone means a match."""
    midpoint, scale = CALIBRATION[algorithm]
    return 1 / (1 + math.exp(-max(-50.0, min(50.0, (value - midpoint) / scale))))


def percent(probability: float) -> float:
    return round(100 * probability, 1)


def pooled(probabilities: Iterable[tuple[float, float]]) -> float | None:
    """The weighted mean of the log-odds of (probability, weight) pairs, as a probability; None without any."""
    items = [(min(max(probability, 1e-4), 1 - 1e-4), weight) for probability, weight in probabilities]
    if not items:
        return None
    log_odds = sum(weight * math.log(probability / (1 - probability)) for probability, weight in items) / sum(weight for _, weight in items)
    return 1 / (1 + math.exp(-log_odds))


def judge(algorithms: dict) -> tuple[float | None, str]:
    """A pair's probability of matching, 0.0 to 100.0, and its match type, from the values of its algorithms."""
    if algorithms["sha256"]["equal"]:
        return 100.0, "exact_file"
    if algorithms.get("pixels", {}).get("equal"):
        return 100.0, "exact_pixels"
    def present(name: str) -> bool:
        return name in algorithms and algorithms[name].get(VALUES[name]) is not None and algorithms[name].get("applicable", True)

    found = {
        hypothesis: pooled((evidence(name, value_of(name, algorithms[name])), weight) for name, weight in members.items() if present(name))
        for hypothesis, members in HYPOTHESES.items() if any(present(name) for name in members if name not in SUPPORT)
    }
    if not found:
        return None, "uncertain"
    hypothesis = max(found, key=lambda name: found[name])  # on a tie the first: structural, then geometric
    probability = min(TOP_PROBABILITY, percent(found[hypothesis]))
    if probability >= MATCH:
        if hypothesis == "geometric":
            return probability, "transformed_duplicate"
        return probability, "near_duplicate" if probability >= NEAR_DUPLICATE else "visually_similar"
    semantic = pooled((evidence(name, value_of(name, algorithms[name])), 1.0) for name in SUPPORT if present(name))
    if semantic is not None and percent(semantic) >= SEMANTIC_SIMILAR:
        clip, dinov2 = (evidence(name, value_of(name, algorithms[name])) if present(name) else -1 for name in SUPPORT)
        return probability, "semantically_similar" if clip >= dinov2 else "visually_similar"
    return probability, "uncertain" if probability >= UNCERTAIN else "different"


def measured(algorithm: str, result: dict) -> dict:
    """An algorithm's result with the probability it gives alone."""
    return {**result, "probability": percent(evidence(algorithm, value_of(algorithm, result)))}


def hamming(first: str, second: str) -> int:
    return (int(first, 16) ^ int(second, 16)).bit_count()


def hamming_distances(value: int, values: np.ndarray) -> np.ndarray:
    """The Hamming distance from one 64-bit hash to each of an array of them."""
    differing = values ^ np.uint64(value)
    if hasattr(np, "bitwise_count"):
        return np.bitwise_count(differing).astype(np.int64)
    return np.unpackbits(differing.view(np.uint8).reshape(-1, 8), axis=1).sum(axis=1)


# The matching


@dataclass
class Query:
    """A game image to match: its file, the GDA trees it may match ("game", and "common" for a shared file), its
    same-named GDA files, and the one with its contents that ends the search, when it has one, with whether only its DDS
    mip levels differ."""
    path: Path
    trees: tuple[str, ...]
    named: list[Path] = field(default_factory=list)
    identical: Path | None = None
    mip_only: bool = False


@dataclass(frozen=True)
class Target:
    """A GDA image: its file, its tree and the tree's folder."""
    path: Path
    tree: str
    root: Path


@dataclass(frozen=True)
class Settings:
    multithreading: bool = True
    use_gpu: bool = False
    threshold: float = 50.0


@contextmanager
def workers(multithreading: bool) -> Iterator[Callable]:
    """A map function: over WORKERS threads with multithreading, otherwise the built-in map."""
    if not multithreading or WORKERS < 2:
        yield map
        return
    with ThreadPoolExecutor(WORKERS, thread_name_prefix="image-compare") as pool:
        yield pool.map


class Details:
    """The SSIM thumbnail and the SIFT image and features of images, made when a pair needs them; the most recently used
    stay in memory. Threads may use it at once."""

    def __init__(self, files: dict[str, Path], seconds: Counter):
        self.files = files
        self.seconds = seconds
        self._items: OrderedDict[str, dict] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, digest: str) -> dict:
        with self._lock:
            item = self._items.get(digest)
            if item is not None:
                self._items.move_to_end(digest)
                return item
        started = time.perf_counter()
        gray = gray_image(decode_image(self.files[digest]))
        item = {"ssim": resized(gray, SSIM_SIZE, SSIM_SIZE), "gray": fitted(gray, SIFT_SIZE)}
        with self._lock:
            self.seconds["decoding"] += time.perf_counter() - started
            self._items[digest] = item
            while len(self._items) > DETAIL_CACHE:
                self._items.popitem(last=False)
        return item

    def sift(self, digest: str) -> Sift:
        item = self.get(digest)
        features = item.get("sift")
        if features is None:
            # Another thread may have made them since, and let the image go.
            gray = item.get("gray")
            features = sift_features(gray) if gray is not None else item["sift"]
            item["sift"] = features
            item.pop("gray", None)
        return features


class ImageMatcher:
    """Matches game images with GDA images, as the module describes."""

    def __init__(self, settings: Settings, cache: CompareCache, hashes: FileHashes, map_function: Callable = map,
                 progress: Progress | None = None):
        self.settings = settings
        self.searched: list[Target] = []
        self.cache = cache
        self.hashes = hashes
        self.map = map_function
        self.progress = progress or (lambda _phase, _done, _total: None)
        self.seconds: Counter[str] = Counter()
        self.counts: Counter[str] = Counter()
        self.gpu: dict = {"requested": settings.use_gpu}
        self.features: dict[str, dict] = {}
        self.vectors: dict[str, dict[str, np.ndarray]] = {}
        self._pairs: dict[tuple[str, str], dict] = {}
        self._new_pairs: dict[tuple[str, str, str], dict] = {}
        self._cached_pairs: dict[tuple[str, str, str], dict] = {}
        self._lock = threading.Lock()

    def run(self, queries: list[Query], targets: list[Target]) -> dict[Path, dict]:
        """Each query's imageMatch, its best probability and type with its possible matches, and the evaluation of each
        of its same-named GDA files ("named")."""
        cv2.setNumThreads(1)
        by_path = {target.path: target for target in targets}
        results = {query.path: self._exact(query, by_path) for query in queries if query.identical is not None}
        searching = [query for query in queries if query.identical is None]
        self.counts.update(images=len(queries), exact=len(results), searched=len(searching))
        if not searching:
            if self.settings.use_gpu:
                self.gpu["reason"] = "not needed: no image had to be searched for"
            return results
        trees = {tree for query in searching for tree in query.trees}
        self.searched = targets = [target for target in targets if target.tree in trees]
        self.counts["gdaImages"] = len(targets)

        started = time.perf_counter()
        paths = list(dict.fromkeys([query.path for query in searching] + [target.path for target in targets]))
        for done, chunk in enumerate(batches(paths, CHUNK), 1):
            self.hashes.prefetch(chunk)
            self.progress("hashing", min(done * CHUNK, len(paths)), len(paths))
        self.seconds["hashing"] += time.perf_counter() - started
        digest = {path: self.hashes(path) for path in paths}
        files = {}
        for path in paths:
            files.setdefault(digest[path], path)

        embedder = self._embedder() if self.settings.use_gpu else None
        try:
            self._prepare(files, embedder)
            candidates = self._candidates(searching, targets, digest, embedder)
        finally:
            if embedder is not None:
                embedder.close()
        self._verify(searching, candidates, digest, files, results)
        return results

    def report(self) -> dict:
        """The settings, algorithms, GPU, counts, cache and times of the run, as the report's imageCompare."""
        algorithms = {
            "sha256": {}, "pixels": {},
            "phash": {"bits": HASH_SIZE * HASH_SIZE, "candidateRadius": PHASH_RADIUS, "candidateLimit": PHASH_LIMIT},
            "dhash": {"bits": HASH_SIZE * HASH_SIZE},
            "ssim": {"size": SSIM_SIZE, "sigma": SSIM_SIGMA, "stop": SSIM_STOP},
            "sift": {"size": SIFT_SIZE, "features": SIFT_FEATURES, "ratio": SIFT_RATIO, "ransacPixels": SIFT_RANSAC_PIXELS,
                     "minKeypoints": SIFT_MIN_KEYPOINTS, "maxScale": SIFT_MAX_SCALE, "maxPerspective": SIFT_MAX_PERSPECTIVE,
                     "minCoverage": SIFT_MIN_COVERAGE},
            **{model: {"model": MODELS[model]["name"], "topK": EMBEDDING_TOP_K, "floor": EMBEDDING_FLOOR[model]} for model in MODELS},
        }
        gpu_ready = self.gpu.get("available", False)
        for name, parameters in algorithms.items():
            enabled = gpu_ready if name in ("clip", "dinov2") else True
            parameters["enabled"] = enabled
            if name in CALIBRATION:
                midpoint, scale = CALIBRATION[name]
                weights = {hypothesis: members[name] for hypothesis, members in HYPOTHESES.items() if name in members}
                parameters["calibration"] = {"midpoint": midpoint, "scale": scale, "weights": weights}
        return {
            "version": VERSION,
            "settings": {"multithreading": self.settings.multithreading, "workers": WORKERS if self.settings.multithreading else 1,
                         "useGpu": self.settings.use_gpu, "matchThreshold": self.settings.threshold},
            "algorithms": algorithms,
            "gpu": self.gpu,
            "counts": dict(self.counts),
            "cache": self.cache.report(),
            "seconds": {name: round(value, 3) for name, value in sorted(self.seconds.items())},
        }

    def _embedder(self):
        from .image_gpu import load_embedder
        started = time.perf_counter()
        embedder, reason = load_embedder()
        self.seconds["loadingModels"] += time.perf_counter() - started
        self.gpu.update({"available": True, "device": embedder.device_name} if embedder else {"available": False, "reason": reason})
        return embedder

    def _exact(self, query: Query, by_path: dict[Path, Target]) -> dict:
        """The result of a query that a same-named file with its contents, or its DDS top image, matches exactly."""
        if query.mip_only:
            evaluation = {"probability": 100.0, "matchType": "exact_pixels",
                          "algorithms": {"sha256": {"equal": False}, "pixels": {"equal": True, "ddsMipsOnly": True}}, "stoppedBy": "pixels"}
        else:
            evaluation = {"probability": 100.0, "matchType": "exact_file", "algorithms": {"sha256": {"equal": True}}, "stoppedBy": "sha256"}
        target = by_path[query.identical]
        return {"imageMatch": {"probability": 100.0, "matchType": evaluation["matchType"], "candidates": 1,
                               "matches": [self._entry(target, ["name"], True, evaluation)]},
                "named": {query.identical: evaluation}}

    @staticmethod
    def _entry(target: Target, found_by: list[str], same_name: bool, evaluation: dict) -> dict:
        return {"tree": target.tree, "path": target.path.relative_to(target.root).as_posix(), "absolutePath": str(target.path),
                "sameName": same_name, "foundBy": found_by, **evaluation}

    def _prepare(self, files: dict[str, Path], embedder) -> None:
        """The features of every image, from the cache or decoded, and with the embedder its embeddings: images are
        decoded once for both, CHUNK at a time."""
        digests = list(files)
        self.features = self.cache.features(digests, VERSION)
        models = list(embedder.models) if embedder else []
        # An embedding depends on the model and on the image's preprocessing, which VERSION covers.
        model_keys = {model: f"{MODELS[model]['name']}@{VERSION}" for model in models}
        self.vectors = {model: self.cache.embeddings(digests, model_keys[model]) for model in models}
        missing = [digest for digest in digests if digest not in self.features or (
            "error" not in self.features[digest] and any(digest not in self.vectors[model] for model in models))]
        self.counts["decoded"] = len(missing)

        def prepare(digest: str) -> tuple[dict, np.ndarray | None]:
            started = time.perf_counter()
            try:
                rgba = decode_image(files[digest])
                features = self.features.get(digest) or image_features(rgba)
                vector_input = embedding_input(rgba) if models else None
            except (OSError, ValueError, cv2.error) as error:
                features, vector_input = {"error": str(error)}, None
            with self._lock:
                self.seconds["decoding"] += time.perf_counter() - started
            return features, vector_input

        self.progress("images", 0, len(missing))
        for done, chunk in enumerate(batches(missing, CHUNK)):
            prepared = list(self.map(prepare, chunk))
            new_features = {digest: features for digest, (features, _input) in zip(chunk, prepared) if digest not in self.features}
            self.features.update(new_features)
            self.cache.store_features(new_features, VERSION)
            inputs = [(digest, vector_input) for digest, (_features, vector_input) in zip(chunk, prepared) if vector_input is not None]
            if embedder and inputs:
                started = time.perf_counter()
                try:
                    embedded = embedder.embed(np.stack([vector_input for _digest, vector_input in inputs]))
                except Exception as error:  # Such as the device's memory: the run goes on with the CPU algorithms.
                    self.gpu.update(available=False, reason=f"the embeddings failed: {type(error).__name__}: {error}")
                    embedder, models, self.vectors = None, [], {}
                else:
                    for model, vectors in embedded.items():
                        made = {digest: vector for (digest, _input), vector in zip(inputs, vectors)}
                        self.vectors[model].update(made)
                        self.cache.store_embeddings(made, model_keys[model])
                self.seconds["embeddings"] += time.perf_counter() - started
            self.progress("images", min((done + 1) * CHUNK, len(missing)), len(missing))
        self.counts["undecodable"] = sum(1 for digest in digests if "error" in self.features[digest])

    def _candidates(self, searching: list[Query], targets: list[Target], digest: dict[Path, str], embedder) -> dict[Path, dict[int, set[str]]]:
        """The GDA images to verify for each query, by index in targets, with what found each: its name, the same SHA-256
        or pixels, its pHash, or an embedding."""
        started = time.perf_counter()
        index = {target.path: position for position, target in enumerate(targets)}
        target_digests = [digest[target.path] for target in targets]
        features = [self.features[value] for value in target_digests]
        hashes = np.array([int(item["phash"], 16) if "phash" in item else 0 for item in features], np.uint64)
        decodable = np.array(["phash" in item for item in features], bool)
        tree_masks = {trees: np.array([target.tree in trees for target in targets], bool) for trees in {query.trees for query in searching}}
        by_digest: dict[str, list[int]] = defaultdict(list)
        by_pixels: dict[str, list[int]] = defaultdict(list)
        for position, (value, item) in enumerate(zip(target_digests, features)):
            by_digest[value].append(position)
            if "pixels" in item:
                by_pixels[item["pixels"]].append(position)

        candidates: dict[Path, dict[int, set[str]]] = {}
        for query in searching:
            found: dict[int, set[str]] = defaultdict(set)
            allowed = tree_masks[query.trees]
            for path in query.named:
                if path in index:
                    found[index[path]].add("name")
            mine = self.features[digest[query.path]]
            for position in by_digest.get(digest[query.path], ()):
                if allowed[position]:
                    found[position].add("sha256")
            if "pixels" in mine:
                for position in by_pixels.get(mine["pixels"], ()):
                    if allowed[position]:
                        found[position].add("pixels")
                distances = hamming_distances(int(mine["phash"], 16), hashes)
                near = np.flatnonzero(allowed & decodable & (distances <= PHASH_RADIUS))
                for position in near[np.argsort(distances[near], kind="stable")][:PHASH_LIMIT]:
                    found[int(position)].add("phash")
            candidates[query.path] = found

        if embedder is not None and self.vectors:
            for trees, allowed in tree_masks.items():
                group = [query for query in searching if query.trees == trees and "error" not in self.features[digest[query.path]]]
                for model, vectors in self.vectors.items():
                    pool = [position for position in np.flatnonzero(allowed) if target_digests[position] in vectors]
                    if not group or not pool:
                        continue
                    try:
                        nearest, similarity = embedder.nearest(np.stack([vectors[digest[query.path]] for query in group]),
                                                               np.stack([vectors[target_digests[position]] for position in pool]), EMBEDDING_TOP_K)
                    except Exception as error:
                        self.gpu.update(available=False, reason=f"the embedding search failed: {type(error).__name__}: {error}")
                        break
                    for query, positions, values in zip(group, nearest, similarity):
                        for position, value in zip(positions, values):
                            if value >= EMBEDDING_FLOOR[model]:
                                candidates[query.path][pool[position]].add(model)
        self.counts["candidates"] = sum(len(found) for found in candidates.values())
        self.seconds["candidates"] += time.perf_counter() - started
        return candidates

    def _verify(self, searching: list[Query], candidates: dict[Path, dict[int, set[str]]], digest: dict[Path, str],
                files: dict[str, Path], results: dict[Path, dict]) -> None:
        """Evaluate every candidate of each query, on the threads of the map function."""
        started = time.perf_counter()
        self._cached_pairs = self.cache.pairs(list({digest[query.path] for query in searching}), VERSION)
        self.details = Details(files, self.seconds)
        threshold = self.settings.threshold

        def verify(query: Query) -> dict:
            mine = digest[query.path]
            named = set(query.named)
            evaluated = []
            for position, found_by in candidates[query.path].items():
                target = self.searched[position]
                evaluation = self._evaluate(mine, digest[target.path])
                evaluated.append(self._entry(target, sorted(found_by, key=FOUND_BY.index), target.path in named, evaluation))
            known = [entry for entry in evaluated if entry["probability"] is not None]
            best = max(known, key=lambda entry: entry["probability"], default=None)
            matches = sorted((entry for entry in known if entry["probability"] >= threshold),
                             key=lambda entry: (-entry["probability"], not entry["sameName"], entry["absolutePath"]))
            image_match: dict[str, Any] = {
                "probability": best["probability"] if best else None if evaluated else 0.0,
                "matchType": best["matchType"] if best else "uncertain" if evaluated else "different",
                "candidates": len(evaluated), "matches": matches,
            }
            if error := self.features[mine].get("error"):
                image_match["error"] = error
            return {"imageMatch": image_match,
                    "named": {Path(entry["absolutePath"]): {key: entry[key] for key in EVALUATION_KEYS if key in entry}
                              for entry in evaluated if entry["sameName"]}}

        self.progress("matches", 0, len(searching))
        for done, (query, result) in enumerate(zip(searching, self.map(verify, searching)), 1):
            results[query.path] = result
            self.progress("matches", done, len(searching))
        self.cache.store_pairs(self._new_pairs, VERSION)
        self.counts["pairs"] = len(self._pairs)
        self.counts["possibleMatches"] = sum(len(results[query.path]["imageMatch"]["matches"]) for query in searching)
        self.seconds["verification"] += time.perf_counter() - started

    def _evaluate(self, mine: str, theirs: str) -> dict:
        """The evaluation of a game image and a GDA image by their contents, once a run for each pair."""
        key = (mine, theirs)
        with self._lock:
            if key in self._pairs:
                return self._pairs[key]
        evaluation = self._evaluation(mine, theirs)
        with self._lock:
            self._pairs[key] = evaluation
        return evaluation

    def _pair_value(self, mine: str, theirs: str, algorithm: str, compute: Callable[[], dict]) -> dict:
        """A pair result from the cache, or computed, timed and kept for the cache."""
        key = (mine, theirs, algorithm)
        if key in self._cached_pairs:
            with self._lock:
                self.cache.hits["pairs"] += 1
            return self._cached_pairs[key]
        started = time.perf_counter()
        value = compute()
        with self._lock:
            self.cache.misses["pairs"] += 1
            self.seconds[algorithm] += time.perf_counter() - started
            self._new_pairs[key] = value
        return value

    def _evaluation(self, mine: str, theirs: str) -> dict:
        algorithms: dict[str, dict] = {"sha256": {"equal": mine == theirs}}
        if mine == theirs:
            return {"probability": 100.0, "matchType": "exact_file", "algorithms": algorithms, "stoppedBy": "sha256"}
        first, second = self.features[mine], self.features[theirs]
        if "error" in first or "error" in second:
            return {"probability": None, "matchType": "uncertain", "algorithms": algorithms,
                    "error": f"{'the game image' if 'error' in first else 'the GDA image'}: {first.get('error') or second.get('error')}"}
        equal = first["pixels"] == second["pixels"]
        algorithms["pixels"] = {"equal": equal, "size": [first["width"], first["height"]], "gdaSize": [second["width"], second["height"]]}
        if equal:
            return {"probability": 100.0, "matchType": "exact_pixels", "algorithms": algorithms, "stoppedBy": "pixels"}
        for name in ("phash", "dhash"):
            algorithms[name] = measured(name, {"hamming": hamming(first[name], second[name])})
        try:
            value = self._pair_value(mine, theirs, "ssim", lambda: {"value": round(ssim(self.details.get(mine)["ssim"], self.details.get(theirs)["ssim"]), 4)})
            algorithms["ssim"] = measured("ssim", value)
            for model, vectors in self.vectors.items():
                if mine in vectors and theirs in vectors:
                    algorithms[model] = measured(model, {"cosine": round(float(vectors[mine] @ vectors[theirs]), 4)})
            stopped = "ssim" if value["value"] >= SSIM_STOP else None
            if stopped is None:
                matched = self._pair_value(mine, theirs, "sift", lambda: sift_match(self.details.sift(mine), self.details.sift(theirs)))
                algorithms["sift"] = measured("sift", matched) if matched.get("applicable", True) else dict(matched)
        except (OSError, ValueError, cv2.error) as error:  # The file changed since its features were made.
            return {"probability": None, "matchType": "uncertain", "algorithms": algorithms, "error": str(error)}
        probability, match_type = judge(algorithms)
        return {"probability": probability, "matchType": match_type, "algorithms": algorithms, **({"stoppedBy": stopped} if stopped else {})}

