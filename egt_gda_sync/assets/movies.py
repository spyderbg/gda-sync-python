"""Movies: the video files that RssMoviesData.json declares, such as m/coin_animations/Big_Win23-rgba.mov.

OpenCV, with its FFmpeg backend, reads them: their facts (frame size, frame rate, frames, duration and codec), one frame
as a thumbnail, and a fingerprint that the GDA sync matches with the GDA's movies (MovieMatcher). A movie of the
"valpha" format stacks its alpha under its picture: the top half of each frame is the picture and the bottom half its
alpha as gray, which a thumbnail composes into a transparent image.

The matching follows the image matching (egt_gda_sync.images.image_compare), on up to FRAMES frames taken at equal steps
across each movie, each as a small gray thumbnail with its pHash and dHash (its fingerprint):

1. A same-named GDA file with the same SHA-256 is an exact match (exact_file).
2. Every other GDA movie of the trees the movie is searched in is a candidate: a game has few movies.
3. Each candidate is verified: the decoded pixels of the frames (equal ones are exact_pixels, the same frames in another
   file); then the two movies are aligned in time, at the offset where their thumbnails differ least, so a clip that
   starts or ends a little earlier or later still matches; at that offset the frames that overlap are compared by their
   mean pixel difference, SSIM, and pHash and dHash distances, and the durations by how much they differ.
4. Each value becomes the probability that it alone means a match, and their weighted log-odds are pooled into the
   pair's probability, as for images. The pixel difference and SSIM tell apart clips that share most of their picture,
   such as the same coin shower under "BIG WIN" and "MEGA WIN", which the hashes alone find alike.

A fingerprint is made once per file content and kept in the compare cache, so a rescan decodes only changed movies.
"""

from __future__ import annotations

import base64
import hashlib
import math
import threading
import time
from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from egt_gda_sync.images.image_cache import CompareCache, FileHashes
from egt_gda_sync.images.image_compare import (EVALUATION_KEYS, Query, Target, difference_hash, hamming, perceptual_hash, percent,
                                               pooled, resized, ssim)

# The movies the library lists, with the type the browser plays each as: a QuickTime file is an ISO media file like an
# MP4 one, and browsers play its H.264 video as MP4.
MOVIE_EXTENSIONS = {"mov": "video/mp4", "mp4": "video/mp4", "m4v": "video/mp4", "webm": "video/webm"}
# The movie format whose frames stack the picture over its alpha.
STACKED_ALPHA = "valpha"
# The version of the fingerprint: cached fingerprints of another are made again.
VERSION = 1
# The frames of a fingerprint, at most, and the size of their gray thumbnails. A movie of up to FRAMES frames keeps every
# frame, so two clips align to the frame; a longer one keeps every so many, and aligns to within half a step.
FRAMES = 256
SIGNATURE_SIZE = 32
# The square each frame is shrunk to before its hashes and thumbnail are made.
HASH_INPUT = 128
# Up to this many frames, a movie is read from start to end and the fingerprint's frames kept, which is faster than
# seeking to each.
SEQUENTIAL_FRAMES = 1500
# Two movies are aligned only at offsets where they overlap for at least this part of the shorter one.
MIN_OVERLAP = 0.5
THUMBNAIL_WIDTH = 480
# Each value's evidence, as CALIBRATION in image_compare: the probability that it alone means a match, a logistic curve
# that is 50 % at the midpoint and changes the odds by a factor e every scale. The pixel difference is the mean absolute
# difference of the aligned thumbnails' gray levels (0 to 255), SSIM their mean SSIM, the hashes mean Hamming distances
# of 64 bits, and the duration the difference relative to the longer movie. Re-encoded and resized copies of a clip
# differ by less than 1 gray level and have an SSIM above 0.999; clips with the same animation under another title,
# by 8 to 12 gray levels and an SSIM of 0.88 to 0.92.
CALIBRATION = {"mad": (4.0, -1.0), "ssim": (0.95, 0.015), "phash": (16.0, -2.0), "dhash": (8.0, -2.0), "duration": (0.2, -0.05)}
VALUES = {"mad": "value", "ssim": "value", "phash": "hamming", "dhash": "hamming", "duration": "difference"}
WEIGHTS = {"mad": 2.0, "ssim": 2.0, "phash": 1.0, "dhash": 1.0, "duration": 0.5}
NEAR_DUPLICATE = 80.0
MATCH = 50.0
UNCERTAIN = 20.0
TOP_PROBABILITY = 99.9

Progress = Callable[[str, int, int], None]


def is_movie(path: Path | str) -> bool:
    return Path(path).suffix[1:].lower() in MOVIE_EXTENSIONS


class _Capture:
    """An opened movie, released on exit."""

    def __init__(self, path: Path | str):
        self.capture = cv2.VideoCapture(str(path))
        if not self.capture.isOpened():
            self.capture.release()
            raise ValueError("OpenCV cannot read the movie")

    def __enter__(self) -> cv2.VideoCapture:
        return self.capture

    def __exit__(self, *_exc) -> None:
        self.capture.release()


def _facts(capture: cv2.VideoCapture) -> dict:
    """A movie's frame size, frame rate, frames, duration in seconds and codec, as its container declares them."""
    fps = capture.get(cv2.CAP_PROP_FPS) or 0.0
    frames = max(0, int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0))
    fourcc = int(capture.get(cv2.CAP_PROP_FOURCC) or 0)
    codec = "".join(chr((fourcc >> shift) & 0xFF) for shift in (0, 8, 16, 24)).strip("\0 ") if fourcc else ""
    return {"width": int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), "height": int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            "fps": round(fps, 3), "frames": frames, "duration": round(frames / fps, 3) if fps > 0 else 0.0,
            **({"codec": codec} if codec.isprintable() and codec else {})}


def describe_movie(path: str) -> dict:
    """The facts of a movie, with its frame size as its dimensions, or the reason it cannot be read."""
    try:
        with _Capture(path) as capture:
            facts = _facts(capture)
    except (ValueError, cv2.error) as error:
        return {"movieError": str(error)}
    return {"movie": facts, "dimensions": {"width": facts["width"], "height": facts["height"], "format": facts.get("codec", "video")}}


def _frame_at(capture: cv2.VideoCapture, index: int) -> np.ndarray | None:
    capture.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, frame = capture.read()
    return frame if ok else None


def unstacked(frame: np.ndarray) -> np.ndarray:
    """A valpha frame's picture with its alpha, as BGRA: the top half, transparent where the bottom half is black."""
    half = frame.shape[0] // 2
    alpha = cv2.cvtColor(frame[half:half * 2], cv2.COLOR_BGR2GRAY)
    return np.dstack((frame[:half], alpha))


def movie_thumbnail(path: str, stacked: bool = False, width: int = THUMBNAIL_WIDTH) -> tuple[bytes, str]:
    """The frame in the middle of a movie, as wide as width at most: a PNG with the alpha of a stacked one, otherwise a
    JPEG. ValueError when it cannot be read."""
    try:
        with _Capture(path) as capture:
            frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            frame = _frame_at(capture, frames // 2) if frames > 1 else None
            if frame is None:
                frame = _frame_at(capture, 0)
    except cv2.error as error:
        raise ValueError(str(error)) from error
    if frame is None:
        raise ValueError("the movie has no frame that OpenCV can decode")
    if stacked and frame.shape[0] >= 2:
        frame = unstacked(frame)
    height, current = frame.shape[:2]
    if current > width:
        frame = resized(frame, width, max(1, round(height * width / current)))
    alpha = frame.shape[2] == 4
    ok, data = cv2.imencode(".png", frame) if alpha else cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        raise ValueError("the frame cannot be encoded")
    return data.tobytes(), "image/png" if alpha else "image/jpeg"


def movie_fingerprint(path: Path) -> dict:
    """A movie's facts, the step in seconds between the frames of its fingerprint, the SHA-256 of those frames' decoded
    pixels, the pHash and dHash of each, and their gray thumbnails, SIGNATURE_SIZE square, one after the other as base64.
    A movie that cannot be read has only an error."""
    try:
        with _Capture(path) as capture:
            facts = _facts(capture)
            stride = max(1, -(-facts["frames"] // FRAMES))
            frames: list[np.ndarray] = []
            if facts["frames"] <= SEQUENTIAL_FRAMES:
                # Grabbing decodes without converting; only the fingerprint's frames are retrieved.
                index = 0
                while len(frames) < FRAMES and capture.grab():
                    if index % stride == 0:
                        ok, frame = capture.retrieve()
                        if not ok:
                            break
                        frames.append(frame)
                    index += 1
            else:
                for index in range(0, facts["frames"], stride):
                    if (frame := _frame_at(capture, index)) is None:
                        break
                    frames.append(frame)
    except (ValueError, cv2.error) as error:
        return {"error": str(error)}
    if not frames:
        return {"error": "the movie has no frame that OpenCV can decode"}
    pixels = hashlib.sha256(f"{facts['width']}x{facts['height']}:{facts['frames']}".encode())
    hashes, thumbnails = [], []
    for frame in frames:
        pixels.update(np.ascontiguousarray(frame).data)
        # The hashes and the thumbnail are all square and small: the frame is shrunk once for them.
        gray = cv2.cvtColor(resized(frame, HASH_INPUT, HASH_INPUT), cv2.COLOR_BGR2GRAY)
        hashes.append({"phash": f"{perceptual_hash(gray):016x}", "dhash": f"{difference_hash(gray):016x}"})
        thumbnails.append(resized(gray, SIGNATURE_SIZE, SIGNATURE_SIZE))
    step = stride / facts["fps"] if facts["fps"] > 0 else 0.0
    return {**facts, "step": round(step, 6), "pixels": pixels.hexdigest(), "hashes": hashes,
            "thumbnails": base64.b64encode(np.stack(thumbnails).tobytes()).decode("ascii")}


def thumbnails_of(fingerprint: dict) -> np.ndarray:
    """A fingerprint's thumbnails, as a (frames, SIGNATURE_SIZE, SIGNATURE_SIZE) array."""
    return np.frombuffer(base64.b64decode(fingerprint["thumbnails"]), np.uint8).reshape(-1, SIGNATURE_SIZE, SIGNATURE_SIZE)


def evidence(name: str, value: float) -> float:
    midpoint, scale = CALIBRATION[name]
    return 1 / (1 + math.exp(-max(-50.0, min(50.0, (value - midpoint) / scale))))


def measured(name: str, result: dict) -> dict:
    return {**result, "probability": percent(evidence(name, result[VALUES[name]]))}


def align(first: dict, second: dict, mine: np.ndarray, theirs: np.ndarray) -> tuple[float, list[tuple[int, int]], np.ndarray]:
    """The offset in seconds to add to the first movie's times for the second's frame at the same moment, at which their
    overlapping thumbnails differ least; the pairs of frames that overlap there, and the mean absolute difference of
    every pair of thumbnails. An offset where they overlap for less than MIN_OVERLAP of the shorter movie is taken only
    when there is no other."""
    differences = np.stack([np.abs(theirs.astype(np.int16) - frame.astype(np.int16)).mean(axis=(1, 2)) for frame in mine])
    step_first, step_second = first["step"] or 1.0, second["step"] or 1.0
    times = np.arange(len(mine)) * step_first
    shortest = min(len(mine) * step_first, len(theirs) * step_second)
    best: tuple[bool, float, float, np.ndarray, np.ndarray] | None = None
    for offset in np.arange(-times[-1], len(theirs) * step_second, step_second):
        indexes = np.round((times + offset) / step_second).astype(int)
        inside = (indexes >= 0) & (indexes < len(theirs))
        if not inside.any():
            continue
        rows = np.nonzero(inside)[0]
        enough = len(rows) * step_first >= MIN_OVERLAP * shortest
        score = float(differences[rows, indexes[rows]].mean())
        if best is None or (enough, -score) > (best[0], -best[1]):
            best = (enough, score, float(offset), rows, indexes[rows])
    assert best is not None  # The offset 0 overlaps the first frames.
    return best[2], list(zip(best[3].tolist(), best[4].tolist())), differences


def compare_fingerprints(first: dict, second: dict) -> dict:
    """The evaluation of two movies that differ in their files, by their fingerprints."""
    algorithms: dict[str, dict] = {"sha256": {"equal": False}}
    if "error" in first or "error" in second:
        return {"probability": None, "matchType": "uncertain", "algorithms": algorithms,
                "error": f"{'the game movie' if 'error' in first else 'the GDA movie'}: {first.get('error') or second.get('error')}"}
    equal = first["pixels"] == second["pixels"]
    algorithms["pixels"] = {"equal": equal, "size": [first["width"], first["height"]], "gdaSize": [second["width"], second["height"]]}
    if equal:
        return {"probability": 100.0, "matchType": "exact_pixels", "algorithms": algorithms, "stoppedBy": "pixels"}
    mine, theirs = thumbnails_of(first), thumbnails_of(second)
    offset, pairs, differences = align(first, second, mine, theirs)
    algorithms["alignment"] = {"offset": round(offset, 3), "frames": len(pairs), "gdaFrames": len(theirs)}
    algorithms["mad"] = measured("mad", {"value": round(float(np.mean([differences[i, j] for i, j in pairs])), 2)})
    algorithms["ssim"] = measured("ssim", {"value": round(float(np.mean([ssim(mine[i], theirs[j]) for i, j in pairs])), 4)})
    for name in ("phash", "dhash"):
        distance = np.mean([hamming(first["hashes"][i][name], second["hashes"][j][name]) for i, j in pairs])
        algorithms[name] = measured(name, {"hamming": round(float(distance), 2)})
    longer = max(first["duration"], second["duration"])
    difference = abs(first["duration"] - second["duration"]) / longer if longer > 0 else 0.0
    algorithms["duration"] = measured("duration", {"difference": round(difference, 4), "seconds": first["duration"], "gdaSeconds": second["duration"]})
    probability = min(TOP_PROBABILITY, percent(pooled((evidence(name, algorithms[name][VALUES[name]]), weight) for name, weight in WEIGHTS.items())))
    match_type = ("near_duplicate" if probability >= NEAR_DUPLICATE else "visually_similar" if probability >= MATCH
                  else "uncertain" if probability >= UNCERTAIN else "different")
    return {"probability": probability, "matchType": match_type, "algorithms": algorithms}


class MovieMatcher:
    """Matches game movies with GDA movies, as the module describes; its results have the shape of the image matching's,
    as movieMatch."""

    def __init__(self, threshold: float, cache: CompareCache, hashes: FileHashes, map_function: Callable = map,
                 progress: Progress | None = None):
        self.threshold = threshold
        self.cache = cache
        self.hashes = hashes
        self.map = map_function
        self.progress = progress or (lambda _phase, _done, _total: None)
        self.seconds: Counter[str] = Counter()
        self.counts: Counter[str] = Counter()
        self.fingerprints: dict[str, dict] = {}
        self._lock = threading.Lock()

    def run(self, queries: list[Query], targets: list[Target]) -> dict[Path, dict]:
        """Each query's movieMatch, and the evaluation of each of its same-named GDA files ("named")."""
        by_path = {target.path: target for target in targets}
        results: dict[Path, dict] = {}
        searching = []
        for query in queries:
            if query.identical is not None:
                evaluation = {"probability": 100.0, "matchType": "exact_file", "algorithms": {"sha256": {"equal": True}}, "stoppedBy": "sha256"}
                results[query.path] = {"movieMatch": {"probability": 100.0, "matchType": "exact_file", "candidates": 1,
                                                      "matches": [self._entry(by_path[query.identical], ["name"], True, evaluation)]},
                                       "named": {query.identical: evaluation}}
            else:
                searching.append(query)
        self.counts.update(movies=len(queries), exact=len(results), searched=len(searching))
        if not searching:
            return results
        trees = {tree for query in searching for tree in query.trees}
        targets = [target for target in targets if target.tree in trees]
        self.counts["gdaMovies"] = len(targets)
        digest = {path: self.hashes(path) for path in dict.fromkeys([query.path for query in searching] + [target.path for target in targets])}
        self._prepare(digest)
        for done, query in enumerate(searching, 1):
            results[query.path] = self._verify(query, targets, digest)
            self.progress("movieMatches", done, len(searching))
        self.counts["possibleMatches"] = sum(len(results[query.path]["movieMatch"]["matches"]) for query in searching)
        return results

    def report(self) -> dict:
        """The settings, algorithms, counts and times of the run, as the report's movieCompare."""
        return {
            "version": VERSION, "settings": {"matchThreshold": self.threshold, "frames": FRAMES, "size": SIGNATURE_SIZE, "minOverlap": MIN_OVERLAP},
            "algorithms": {"sha256": {}, "pixels": {}, "alignment": {},
                           **{name: {"calibration": {"midpoint": midpoint, "scale": scale}, "weight": WEIGHTS[name]}
                              for name, (midpoint, scale) in CALIBRATION.items()}},
            "counts": dict(self.counts),
            "seconds": {name: round(value, 3) for name, value in sorted(self.seconds.items())},
        }

    @staticmethod
    def _entry(target: Target, found_by: list[str], same_name: bool, evaluation: dict) -> dict:
        return {"tree": target.tree, "path": target.path.relative_to(target.root).as_posix(), "absolutePath": str(target.path),
                "sameName": same_name, "foundBy": found_by, **evaluation}

    def _prepare(self, digest: dict[Path, str]) -> None:
        """The fingerprint of every movie, from the cache or decoded on the threads of the map function."""
        files: dict[str, Path] = {}
        for path, value in digest.items():
            files.setdefault(value, path)
        self.fingerprints = self.cache.movies(list(files), VERSION)
        missing = [value for value in files if value not in self.fingerprints]
        started = time.perf_counter()
        self.progress("movies", 0, len(missing))
        made: dict[str, dict] = {}
        for done, (value, fingerprint) in enumerate(zip(missing, self.map(lambda item: movie_fingerprint(files[item]), missing)), 1):
            made[value] = fingerprint
            self.progress("movies", done, len(missing))
        self.seconds["decoding"] += time.perf_counter() - started
        self.fingerprints.update(made)
        # A movie that cannot be read now may be readable later, with another OpenCV.
        self.cache.store_movies({value: fingerprint for value, fingerprint in made.items() if "error" not in fingerprint}, VERSION)

    def _verify(self, query: Query, targets: list[Target], digest: dict[Path, str]) -> dict:
        mine = digest[query.path]
        named = set(query.named)
        evaluated = []
        started = time.perf_counter()
        for target in targets:
            theirs = digest[target.path]
            if theirs == mine:
                evaluation = {"probability": 100.0, "matchType": "exact_file", "algorithms": {"sha256": {"equal": True}}, "stoppedBy": "sha256"}
            else:
                evaluation = compare_fingerprints(self.fingerprints[mine], self.fingerprints[theirs])
            same_name = target.path in named
            evaluated.append(self._entry(target, ["name"] if same_name else ["sha256"] if theirs == mine else ["frames"], same_name, evaluation))
        self.seconds["verification"] += time.perf_counter() - started
        known = [entry for entry in evaluated if entry["probability"] is not None]
        best = max(known, key=lambda entry: entry["probability"], default=None)
        matches = sorted((entry for entry in known if entry["probability"] >= self.threshold),
                         key=lambda entry: (-entry["probability"], not entry["sameName"], entry["absolutePath"]))
        movie_match: dict[str, Any] = {
            "probability": best["probability"] if best else None if evaluated else 0.0,
            "matchType": best["matchType"] if best else "uncertain" if evaluated else "different",
            "candidates": len(evaluated), "matches": matches,
        }
        if error := self.fingerprints[mine].get("error"):
            movie_match["error"] = error
        return {"movieMatch": movie_match,
                "named": {Path(entry["absolutePath"]): {key: entry[key] for key in EVALUATION_KEYS if key in entry}
                          for entry in evaluated if entry["sameName"]}}
