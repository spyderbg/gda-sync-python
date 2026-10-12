"""The GDA sync's caches, kept between runs in one SQLite file of the app data folder: compare-cache.sqlite3.

docs/image_compare/implementation.md describes the three levels of docs/image_compare/algorithm.md:

- files: each file's SHA-256 by path, reused while its size and times are unchanged, for at most REHASH_AFTER;
- features and embeddings: an image's features by the SHA-256 of its contents, the version of the algorithms, and the
  model of an embedding, so a renamed or copied file reuses them;
- pairs: the SSIM and SIFT results of two images by the SHA-256 of both.

Only the thread that runs the comparison reads and writes the database. A cache that cannot be opened or written is
replaced by one in memory, and the report notes the error: a run never fails because of its cache.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from collections import Counter
from collections.abc import Callable, Iterable
from pathlib import Path

import numpy as np

CACHE_FILE = "compare-cache.sqlite3"
# A cached SHA-256 is trusted while the file's size, modification and change times are unchanged, for at most a week;
# then the file is hashed again, which catches a change that kept all three.
REHASH_AFTER = 7 * 24 * 3600
BATCH = 500  # values per SQL query, below SQLite's limit of host parameters
SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY, size INTEGER NOT NULL, mtime_ns INTEGER NOT NULL, ctime_ns INTEGER NOT NULL,
    sha256 TEXT NOT NULL, hashed_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS features (
    sha256 TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (sha256, version));
CREATE TABLE IF NOT EXISTS embeddings (
    sha256 TEXT NOT NULL, model TEXT NOT NULL, vector BLOB NOT NULL, PRIMARY KEY (sha256, model));
CREATE TABLE IF NOT EXISTS pairs (
    first TEXT NOT NULL, second TEXT NOT NULL, algorithm TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (first, second, algorithm, version));
"""


def batches(values: list, size: int = BATCH) -> Iterable[list]:
    for start in range(0, len(values), size):
        yield values[start:start + size]


class CompareCache:
    """The cache file, or a cache in memory without a path. hits and misses count the lookups of each level."""

    def __init__(self, path: Path | None = None):
        self.path = path
        self.error: str | None = None
        self.hits: Counter[str] = Counter()
        self.misses: Counter[str] = Counter()
        try:
            if path is not None:
                path.parent.mkdir(parents=True, exist_ok=True)
            self._db = self._open(str(path) if path is not None else ":memory:")
        except (OSError, sqlite3.Error) as error:
            self._fail(error)

    @staticmethod
    def _open(location: str) -> sqlite3.Connection:
        db = sqlite3.connect(location, timeout=30)
        try:
            if location != ":memory:":
                # Another process can read while one writes: the app and the report command may run at once.
                db.execute("PRAGMA journal_mode=WAL")
                db.execute("PRAGMA synchronous=NORMAL")
            db.executescript(SCHEMA)
        except BaseException:
            db.close()
            raise
        return db

    def _fail(self, error: Exception) -> None:
        """Go on with a cache in memory, and keep the first error for the report."""
        self.error = self.error or f"{type(error).__name__}: {error}"
        old = getattr(self, "_db", None)
        if old is not None:
            try:
                old.close()
            except sqlite3.Error:
                pass
        self._db = self._open(":memory:")

    def _select(self, sql: str, keys: list, *extra) -> list[tuple]:
        rows: list[tuple] = []
        try:
            for chunk in batches(keys):
                marks = ",".join("?" * len(chunk))
                rows.extend(self._db.execute(sql.format(marks=marks), (*extra, *chunk)).fetchall())
        except sqlite3.Error as error:
            self._fail(error)
            return []
        return rows

    def _write(self, sql: str, rows: list[tuple]) -> None:
        if not rows:
            return
        try:
            with self._db:
                self._db.executemany(sql, rows)
        except sqlite3.Error as error:
            self._fail(error)

    def file_hashes(self, paths: Iterable[Path], hash_file: Callable[[Path], str],
                    map_function: Callable = map) -> dict[Path, str]:
        """The SHA-256 of each file: from the cache while the file is unchanged, otherwise hashed with map_function, which
        can run hash_file on several threads. A file that cannot be read raises OSError, as hashing it would."""
        wanted = list(dict.fromkeys(paths))
        if not wanted:
            return {}
        stats = {path: os.stat(path) for path in wanted}
        cached = {Path(row[0]): row[1:] for row in self._select(
            "SELECT path, size, mtime_ns, ctime_ns, sha256, hashed_at FROM files WHERE path IN ({marks})", [str(path) for path in wanted])}
        now = time.time()
        result: dict[Path, str] = {}
        stale: list[Path] = []
        for path in wanted:
            info, row = stats[path], cached.get(path)
            if row and row[:3] == (info.st_size, info.st_mtime_ns, info.st_ctime_ns) and now - row[4] < REHASH_AFTER:
                result[path] = row[3]
            else:
                stale.append(path)
        self.hits["files"] += len(result)
        self.misses["files"] += len(stale)
        for path, digest in zip(stale, map_function(hash_file, stale)):
            result[path] = digest
        self._write("INSERT OR REPLACE INTO files VALUES (?, ?, ?, ?, ?, ?)",
                    [(str(path), stats[path].st_size, stats[path].st_mtime_ns, stats[path].st_ctime_ns, result[path], now) for path in stale])
        return result

    def features(self, digests: list[str], version: int) -> dict[str, dict]:
        rows = self._select("SELECT sha256, data FROM features WHERE version = ? AND sha256 IN ({marks})", digests, version)
        found = {digest: json.loads(data) for digest, data in rows}
        self.hits["features"] += len(found)
        self.misses["features"] += len(set(digests) - found.keys())
        return found

    def store_features(self, items: dict[str, dict], version: int) -> None:
        self._write("INSERT OR REPLACE INTO features VALUES (?, ?, ?)",
                    [(digest, version, json.dumps(data, separators=(",", ":"))) for digest, data in items.items()])

    def embeddings(self, digests: list[str], model: str) -> dict[str, np.ndarray]:
        rows = self._select("SELECT sha256, vector FROM embeddings WHERE model = ? AND sha256 IN ({marks})", digests, model)
        found = {digest: np.frombuffer(vector, np.float16).astype(np.float32) for digest, vector in rows}
        self.hits["embeddings"] += len(found)
        self.misses["embeddings"] += len(set(digests) - found.keys())
        return found

    def store_embeddings(self, items: dict[str, np.ndarray], model: str) -> None:
        self._write("INSERT OR REPLACE INTO embeddings VALUES (?, ?, ?)",
                    [(digest, model, vector.astype(np.float16).tobytes()) for digest, vector in items.items()])

    def pairs(self, firsts: list[str], version: int) -> dict[tuple[str, str, str], dict]:
        """Every cached pair result of these first images: by (first, second, algorithm)."""
        rows = self._select("SELECT first, second, algorithm, data FROM pairs WHERE version = ? AND first IN ({marks})", firsts, version)
        return {(first, second, algorithm): json.loads(data) for first, second, algorithm, data in rows}

    def store_pairs(self, items: dict[tuple[str, str, str], dict], version: int) -> None:
        self._write("INSERT OR REPLACE INTO pairs VALUES (?, ?, ?, ?, ?)",
                    [(first, second, algorithm, version, json.dumps(data, separators=(",", ":")))
                     for (first, second, algorithm), data in items.items()])

    def report(self) -> dict:
        """The cache's file, and the hits and misses of each level, as the report lists them."""
        levels = sorted(self.hits.keys() | self.misses.keys())
        return {"path": str(self.path) if self.path else None,
                **{level: {"hits": self.hits[level], "misses": self.misses[level]} for level in levels},
                **({"error": self.error} if self.error else {})}

    def close(self) -> None:
        try:
            self._db.close()
        except sqlite3.Error:
            pass


class FileHashes:
    """The SHA-256 of files during a run: each file is hashed at most once, through the cache. prefetch hashes many at
    once, with the map function's threads."""

    def __init__(self, cache: CompareCache, hash_file: Callable[[Path], str], map_function: Callable = map):
        self.cache = cache
        self.hash_file = hash_file
        self.map = map_function
        self.known: dict[Path, str] = {}

    def prefetch(self, paths: Iterable[Path]) -> None:
        self.known.update(self.cache.file_hashes([path for path in paths if path not in self.known], self.hash_file, self.map))

    def __call__(self, path: Path) -> str:
        if path not in self.known:
            self.prefetch([path])
        return self.known[path]
