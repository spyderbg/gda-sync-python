"""Make a movie from an image sequence, as the games' movies were made from their sequences by hand (Burning Crown's
m/coin_animations/Big_Win23-rgba.mov from art/1920x1080/coin_animations/Big_Win/Big_Win_{01-75}.dds).

FFmpeg encodes the frames, piped to it as raw pixels, as H.264 (libx264, yuv420p, CRF 23) at the sequence's frame rate,
1000 / frameTime frames a second, in a QuickTime or MP4 file. A "valpha" movie stacks its alpha under its picture: each
frame is twice as high, the picture on top premultiplied by its alpha, which the game's shader (fs_valphamix in
hat_libs/video_ctrl) divides back out, and the alpha below it as gray. An "opaque" movie is the picture alone, over black.
H.264 in yuv420p needs an even width and height: an odd one gets a transparent column or row on its right or bottom.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path

import numpy as np

from egt_gda_sync.images.image_compare import decode_image

FORMATS = ("valpha", "opaque")
CRF = 23
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
    the resolution, and a last folder named like the sequence, named like the sequence, with -rgba for valpha, as .mov.
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
    return "/".join(["m", *parts, f"{name}{'-rgba' if movie_format == 'valpha' else ''}.mov"])


def sampled(count: int, samples: int = ALPHA_SAMPLES) -> list[int]:
    return sorted({round(index * (count - 1) / max(1, samples - 1)) for index in range(samples)}) if count else []


def suggested_format(frames: list[tuple[Path, dict | None]]) -> str:
    """valpha when a sampled frame has transparent pixels, else opaque."""
    for index in sampled(len(frames)):
        if (frame_image(*frames[index])[..., 3] < OPAQUE).any():
            return "valpha"
    return "opaque"


def movie_frame(image: np.ndarray, movie_format: str, width: int, height: int) -> bytes:
    """A frame as the movie's raw RGB pixels: padded to the even size, then the premultiplied picture over the alpha for
    valpha, or the picture over black for opaque."""
    if image.shape[:2] != (height, width):
        padded = np.zeros((height, width, 4), np.uint8)
        padded[:image.shape[0], :image.shape[1]] = image
        image = padded
    alpha = image[..., 3:4].astype(np.uint16)
    picture = ((image[..., :3].astype(np.uint16) * alpha + 127) // 255).astype(np.uint8)
    if movie_format == "valpha":
        picture = np.concatenate((picture, np.repeat(image[..., 3:4], 3, axis=2)), axis=0)
    return np.ascontiguousarray(picture).tobytes()


def encode_movie(frames: list[tuple[Path, dict | None]], frame_time: int, movie_format: str, target: Path,
                 progress: Progress | None = None) -> dict:
    """Encode a sequence's frames, (file, source rectangle) pairs, into target, which must not exist, and return the
    movie's width, height, frames, frame rate and format. The movie is written next to target first and moved there
    once complete. ValueError for frames of different sizes, a format it does not make, or a failed encoding."""
    if movie_format not in FORMATS:
        raise ValueError(f"A movie is made as {' or '.join(FORMATS)}, not {movie_format}")
    if not frames:
        raise ValueError("The sequence has no frames")
    if frame_time <= 0:
        raise ValueError("The sequence's frameTime must be positive")
    container = {".mov": "mov", ".mp4": "mp4"}.get(target.suffix.lower())
    if container is None:
        raise ValueError("A movie is made as a .mov or .mp4 file")
    program = ffmpeg()
    first = frame_image(*frames[0])
    size = first.shape[:2]
    height, width = (size[0] + 1) // 2 * 2, (size[1] + 1) // 2 * 2
    rows = height * 2 if movie_format == "valpha" else height
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.{os.getpid()}.part")
    command = [program, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{rows}", "-framerate", f"1000/{frame_time}", "-i",
               "pipe:0",
               "-an", "-c:v", "libx264", "-preset", "medium", "-crf", str(CRF), "-pix_fmt", "yuv420p",
               "-movflags", "+faststart", "-f", container, str(temporary)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        try:
            for index, frame in enumerate(frames):
                image = first if index == 0 else frame_image(*frame)
                if image.shape[:2] != size:
                    raise ValueError(f"Frame {index + 1} ({frame[0].name}) is {image.shape[1]}×{image.shape[0]}, "
                                     f"the first {size[1]}×{size[0]}: a movie's frames have one size")
                process.stdin.write(movie_frame(image, movie_format, width, height))
                if progress:
                    progress(index + 1, len(frames))
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
    return {"width": width, "height": height, "frames": len(frames), "fps": round(1000 / frame_time, 3),
            "movieFormat": movie_format,
            "padded": (height, width) != size}
