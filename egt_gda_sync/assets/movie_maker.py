"""Make a movie from an image sequence, as the games' movies were made from their sequences by hand (Burning Crown's
m/coin_animations/Big_Win23-rgba.mov from art/1920x1080/coin_animations/Big_Win/Big_Win_{01-75}.dds).

FFmpeg encodes the frames, piped to it as raw pixels, as H.264 (libx264, yuv420p) at the selected CRF and frame rate,
which defaults to 1000 / frameTime, in a QuickTime or MP4 file. The packed formats put grayscale alpha below
(valpha), above (valpha-top), to the right (halpha), or to the left (halpha-left) of the premultiplied picture.
Opaque shows the picture over black.
H.264 in yuv420p needs an even width and height: an odd one gets a transparent column or row on its right or bottom.
"""

from __future__ import annotations

import math
import os
import re
import shutil
import subprocess
from collections.abc import Callable, Iterable
from itertools import chain
from pathlib import Path
from typing import Literal, get_args

import numpy as np

from egt_gda_sync.assets.movies import PACKED_ALPHA_LAYOUTS, PackedAlphaFormat, describe_movie, movie_images
from egt_gda_sync.images.image_compare import decode_image

MovieFormat = Literal[PackedAlphaFormat, "opaque"]
FORMATS = get_args(MovieFormat)
DEFAULT_CRF = 23
MIN_CRF = 0
MAX_CRF = 51
DEFAULT_GOP_SIZE = 250
MAX_GOP_SIZE = 2_147_483_647
# The frames whose alpha suggests the format, at equal steps across the sequence: decoding all of them takes a while.
ALPHA_SAMPLES = 5
# A frame with any pixel more transparent than this has alpha.
OPAQUE = 250
ENCODE_TIMEOUT = 1800
RESOLUTION = re.compile(r"\d{3,5}x\d{3,5}")

Progress = Callable[[int, int], None]


def ffmpeg() -> str:
    """The FFmpeg program, or ValueError when it is not installed."""
    program = shutil.which("ffmpeg")
    if not program:
        raise ValueError("FFmpeg is not installed: making a movie needs the ffmpeg program on the PATH")
    return program


def frame_image(path: Path, source: dict | None = None) -> np.ndarray:
    """A frame's RGBA pixels: its file's, or the part its source rectangle takes of an atlas."""
    image = decode_image(path)
    if source:
        x, y, w, h = (int(source[key]) for key in ("x", "y", "w", "h"))
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > image.shape[1] or y + h > image.shape[0]:
            raise ValueError(f"The source rectangle of {path.name} is outside its image")
        image = image[y:y + h, x:x + w]
    return image


def movie_path(first_frame: Path, game: Path, name: str, movie_format: str) -> str:
    """Where a sequence's movie goes, relative to the game folder: in the m folder, in the frames' folder without art/,
    the resolution, and a last folder named like the sequence, named like the sequence, with -rgba for packed alpha.
    art/1920x1080/coin_animations/Big_Win/Big_Win_{01-75}.dds makes m/coin_animations/Big_Win-rgba.mov."""
    try:
        parts = list(first_frame.parent.resolve().relative_to(game.resolve()).parts)
    except ValueError:
        parts = []
    if parts and parts[0].lower() == "art":
        parts.pop(0)
    if parts and RESOLUTION.fullmatch(parts[0]):
        parts.pop(0)
    if parts and parts[-1].lower() == name.lower():
        parts.pop()
    return "/".join(["m", *parts, f"{name}{'-rgba' if movie_format in PACKED_ALPHA_LAYOUTS else ''}.mov"])


def movie_match(movie: Path, frames: int, ids: set[str], row: dict, game: Path, name: str) -> tuple[int, bool]:
    """How well an image sequence of the asset report fits a movie that may have been made from it, the best highest:
    by the movie's RSS key, the path its movie is made at, or its name (Big_Win for Big_Win23-rgba.mov), 0 for none of
    them; and whether it has as many frames."""
    sequence = row["sequence"]
    key = f"{sequence['id']}_MOVIE".upper()
    paths = {(game / movie_path(Path(sequence["frames"][0]["resourcePath"]), game, name, item)).with_suffix("") for item in FORMATS}

    def plain(value: str) -> str:
        return re.sub(r"[^0-9a-z]+", "", value.lower()).rstrip("0123456789")

    if sequence["id"] and any(item.upper() in (key, f"ANIM_{key}") for item in ids):
        score = 3
    elif movie.with_suffix("") in paths:
        score = 2
    else:
        score = int(bool(plain(name)) and plain(name) == plain(re.sub(r"-rgba$", "", movie.stem, flags=re.IGNORECASE)))
    return score, len(sequence["frames"]) == frames


def sampled(count: int, samples: int = ALPHA_SAMPLES) -> list[int]:
    return sorted({round(index * (count - 1) / max(1, samples - 1)) for index in range(samples)}) if count else []


def inspect_frames(frames: list[tuple[Path, dict | None]]) -> tuple[str, int, int]:
    """Suggest a format from sampled frames and return the first cropped frame's width and height."""
    if not frames:
        raise ValueError("The sequence has no frames")
    first = frame_image(*frames[0])
    height, width = first.shape[:2]
    for index in sampled(len(frames)):
        image = first if index == 0 else frame_image(*frames[index])
        if (image[..., 3] < OPAQUE).any():
            return "valpha", width, height
    return "opaque", width, height


def padded_size(width: int, height: int) -> tuple[int, int]:
    return width + width % 2, height + height % 2


def encoded_frame_size(width: int, height: int, movie_format: str) -> str:
    """FFmpeg's input size after padding and packing the alpha mask."""
    layout = PACKED_ALPHA_LAYOUTS.get(movie_format)
    axis = layout[0] if layout is not None else None
    columns = width * 2 if axis == 1 else width
    rows = height * 2 if axis == 0 else height
    return f"{columns}x{rows}"


def ffmpeg_arguments(size: str, rate: str, container: str, output: str, *, crf: int | str, gop_size: int | str) -> list[list[str]]:
    """Group the arguments into lines for the command preview. The encoder passes them as flat argv."""
    return [
        ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"],
        ["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", size],
        ["-framerate", rate, "-i", "pipe:0"],
        ["-an", "-c:v", "libx264", "-preset", "medium"],
        ["-crf", str(crf), "-pix_fmt", "yuv420p", "-g", str(gop_size)],
        ["-movflags", "+faststart", "-f", container],
        [output],
    ]


def movie_frame(image: np.ndarray, movie_format: str, width: int, height: int) -> bytes:
    """Even-sized RGB pixels with the premultiplied picture and the mask in the requested layout."""
    if image.shape[:2] != (height, width):
        padded = np.zeros((height, width, 4), np.uint8)
        padded[:image.shape[0], :image.shape[1]] = image
        image = padded
    alpha = image[..., 3:4].astype(np.uint16)
    picture = ((image[..., :3].astype(np.uint16) * alpha + 127) // 255).astype(np.uint8)
    if (layout := PACKED_ALPHA_LAYOUTS.get(movie_format)) is not None:
        axis, alpha_first = layout
        mask = np.repeat(image[..., 3:4], 3, axis=2)
        tiles = (mask, picture) if alpha_first else (picture, mask)
        picture = np.concatenate(tiles, axis=axis)
    return np.ascontiguousarray(picture).tobytes()


def encode_movie(frames: list[tuple[Path, dict | None]], frame_time: int, movie_format: str, target: Path,
                 progress: Progress | None = None, *, fps: float | None = None, crf: int = DEFAULT_CRF,
                 gop_size: int = DEFAULT_GOP_SIZE) -> dict:
    """Encode a sequence's frames, (file, source rectangle) pairs, into target, which must not exist, and return the
    movie's width, height, frames, frame rate and format. The movie is written next to target first and moved there
    once complete. ValueError for frames of different sizes, a format it does not make, or a failed encoding."""
    if movie_format not in FORMATS:
        raise ValueError(f"A movie is made as {' or '.join(FORMATS)}, not {movie_format}")
    if not frames:
        raise ValueError("The sequence has no frames")
    if fps is None and frame_time <= 0:
        raise ValueError("The sequence's frameTime must be positive")
    facts = _encode((frame_image(*frame) for frame in frames), [frame[0].name for frame in frames], movie_format, target,
                    progress, fps=fps, rate=f"1000/{frame_time}" if fps is None else str(fps), crf=crf, gop_size=gop_size)
    return {**facts, "fps": round(1000 / frame_time if fps is None else fps, 3), "movieFormat": movie_format}


def reencode_movie(source: Path, movie_format: str, target: Path, progress: Progress | None = None, *,
                   fps: float | None = None, crf: int = DEFAULT_CRF, gop_size: int = DEFAULT_GOP_SIZE,
                   picture_layout: PackedAlphaFormat | None = None) -> dict:
    """Encode a movie's own frames, taking only the picture when removing a packed alpha layout."""
    described = describe_movie(str(source))
    if "movie" not in described:
        raise ValueError(described["movieError"])
    movie = described["movie"]
    fps = movie["fps"] if fps is None else fps
    names = [source.name] * movie["frames"]
    facts = _encode(movie_images(source, picture_layout), names, "opaque", target, progress,
                    fps=fps, rate=str(fps), crf=crf, gop_size=gop_size)
    return {**facts, "fps": round(fps, 3), "movieFormat": movie_format}


def _encode(images: Iterable[np.ndarray], names: list[str], movie_format: str, target: Path, progress: Progress | None, *,
            fps: float | None, rate: str, crf: int, gop_size: int) -> dict:
    """Pipe RGBA images, which are named for the errors, through FFmpeg into target."""
    if type(crf) is not int or not MIN_CRF <= crf <= MAX_CRF:
        raise ValueError(f"CRF must be an integer from {MIN_CRF} to {MAX_CRF}")
    if type(gop_size) is not int or not 0 <= gop_size <= MAX_GOP_SIZE:
        raise ValueError(f"GOP size must be an integer from 0 to {MAX_GOP_SIZE}")
    if fps is not None and (not math.isfinite(fps) or fps <= 0):
        raise ValueError("The frame rate must be a positive number")
    container = {".mov": "mov", ".mp4": "mp4"}.get(target.suffix.lower())
    if container is None:
        raise ValueError("A movie is made as a .mov or .mp4 file")
    program = ffmpeg()
    remaining = iter(images)
    first = next(remaining)
    size = first.shape[:2]
    width, height = padded_size(size[1], size[0])
    count = 0
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.{os.getpid()}.part")
    arguments = ffmpeg_arguments(encoded_frame_size(width, height, movie_format), rate, container, str(temporary),
                                crf=crf, gop_size=gop_size)
    command = [program, *(argument for group in arguments for argument in group)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        try:
            for index, image in enumerate(chain([first], remaining)):
                if image.shape[:2] != size:
                    raise ValueError(f"Frame {index + 1} ({names[index]}) is {image.shape[1]}×{image.shape[0]}, "
                                     f"the first {size[1]}×{size[0]}: a movie's frames have one size")
                process.stdin.write(movie_frame(image, movie_format, width, height))
                count = index + 1
                if progress:
                    progress(count, len(names))
        except BrokenPipeError:
            pass
        finally:
            process.stdin.close()
        errors = process.stderr.read().decode("utf-8", "replace").strip()
        if process.wait(ENCODE_TIMEOUT) != 0:
            raise ValueError(f"FFmpeg could not encode the movie: {errors or f'exit {process.returncode}'}")
        if target.exists():
            raise ValueError(f"{target.name} exists already")
        os.replace(temporary, target)
    except BaseException:
        if process.poll() is None:
            process.kill()
            process.wait()
        temporary.unlink(missing_ok=True)
        raise
    finally:
        process.stderr.close()
    return {"width": width, "height": height, "frames": count, "padded": (height, width) != size}
