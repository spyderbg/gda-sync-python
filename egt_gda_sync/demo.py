"""Deterministic, original demo artwork. No downloaded assets or remote services."""

import base64
import json
import os
import shutil
import struct
import time

import numpy as np

from .png import encode_png


def _noise(x, y, seed: float):
    value = np.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
    return value - np.floor(value)


def _to_uint8(values: np.ndarray) -> np.ndarray:
    # Byte-array semantics: truncate toward zero, then wrap modulo 256.
    return (np.trunc(values).astype(np.int64) % 256).astype(np.uint8)


def texture(kind: str, size: int = 512) -> np.ndarray:
    """Return a (size, size, 4) RGBA texture of the given material kind."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float64)
    nx, ny = x / size, y / size
    n = _noise(x, y, 4)
    broad = np.sin(nx * 22 + np.sin(ny * 15) * 3) * np.cos(ny * 19 + nx * 4)
    if kind == "moss":
        v = broad * 30 + n * 36
        rgb = (45 + v * 0.6, 61 + v, 31 + v * 0.35)
    elif kind == "bark":
        stripe = np.abs(np.sin(nx * 110 + np.sin(ny * 14) * 2 + n * 0.6)) ** 4
        rgb = (72 + stripe * 53 + n * 25, 49 + stripe * 34 + n * 22, 31 + stripe * 22 + n * 15)
    elif kind in ("stone", "concrete"):
        v = (93 if kind == "stone" else 137) + broad * 23 + n * 36
        rgb = (v * 1.05, v, v * 0.89)
    elif kind == "sand":
        v = np.sin(ny * 55 + np.sin(nx * 8) * 2) * 12 + n * 20
        rgb = (191 + v, 168 + v, 122 + v)
    elif kind == "leaf":
        stripe = np.abs(np.sin((nx + ny) * 65)) * 25
        rgb = (34 + broad * 10 + n * 12, 79 + stripe + n * 17, 40 + broad * 6 + n * 9)
    elif kind == "normal":
        rgb = (128 + np.sin(nx * 35 + ny * 11) * 50, 128 + np.cos(ny * 40 + nx * 6) * 45, 230 + n * 25)
    else:
        v = broad * 22 + n * 25
        rgb = (70 + v, 66 + v * 0.9, 49 + v * 0.7)
    image = np.empty((size, size, 4), np.uint8)
    for channel, values in enumerate(rgb):
        image[:, :, channel] = _to_uint8(values)
    image[:, :, 3] = 255
    return image


def to_dds(rgba: np.ndarray) -> bytes:
    """Wrap RGBA pixels in an uncompressed 32-bit DDS file."""
    height, width = rgba.shape[:2]
    header = bytearray(128)
    header[0:4] = b"DDS "
    for offset, value in (
        (4, 124), (8, 0x100F), (12, height), (16, width), (20, width * 4), (28, 1), (76, 32), (80, 0x41),
        (88, 32), (92, 0xFF), (96, 0xFF00), (100, 0xFF0000), (104, 0xFF000000), (108, 0x1000),
    ):
        struct.pack_into("<I", header, offset, value)
    return bytes(header) + np.ascontiguousarray(rgba, np.uint8).tobytes()


def model_art(kind: str) -> str:
    start = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><defs><radialGradient id="bg"><stop stop-color="#ebeee7"/><stop offset="1" stop-color="#d8ded4"/></radialGradient><filter id="blur"><feGaussianBlur stdDeviation="8"/></filter></defs><rect width="480" height="360" fill="url(#bg)"/><ellipse cx="240" cy="279" rx="115" ry="18" fill="#364635" opacity=".18" filter="url(#blur)"/>'
    if kind == "crate":
        shape = '<path d="M139 119 239 66 347 119 244 174Z" fill="#b0a283"/><path d="M139 119 244 174 244 282 139 224Z" fill="#817357"/><path d="M244 174 347 119 347 225 244 282Z" fill="#625b49"/><g fill="none" stroke="#4c4537" stroke-width="3" opacity=".6"><path d="M160 131v104m27-89v104m28-89v103m48-101v105m28-119v104m27-117v104M143 149l100 54 100-54M142 199l102 54 99-54"/></g><path d="m144 124 99 53v20l-99-53Zm0 80 99 54v19l-99-54Z" fill="#b8a281"/><path d="m249 177 94-50v18l-94 50Zm0 82 94-51v18l-94 50Z" fill="#8e8064"/><path d="m156 153 71 78v26l-71-78Z" fill="#a79372"/>'
    elif kind == "rock":
        shape = '<path d="m125 212 24-84 79-42 73 15 62 70-13 77-122 34Z" fill="#777e71"/><path d="m149 128 79-42 30 95-60 32Z" fill="#aab09f"/><path d="m228 86 73 15 15 67-58 13Z" fill="#919988"/><path d="m301 101 62 70-47-3Z" fill="#808a79"/><path d="m125 212 24-84 49 85 30 69Z" fill="#89927f"/><path d="m198 213 60-32 58-13-18 77-70 37Z" fill="#737d6a"/><path d="m316 168 47 3-13 77-52-3Z" fill="#606c5a"/><path d="m149 128 49 85 30-127m-30 127 60-32 58-13m-88 114 70-37" stroke="#c3c9b5" stroke-width="1" opacity=".35" fill="none"/>'
    elif kind == "fern":
        shape = '<path d="M236 276q7-111-4-190m7 173q-31-97-85-118m86 122q31-94 90-115" fill="none" stroke="#50613d" stroke-width="4"/>'
        for i in range(9):
            y, w = 109 + i * 16, 13 + i * 4
            fill = "#627e47" if i % 2 else "#7d9659"
            shape += (
                f'<path d="M235 {y + 14}q-{w + 20}-{w + 3}-{w + 15}-{w + 17}q{w + 5}-1 {w + 15} {w + 17}'
                f'm0 0q{w + 22}-{w + 10} {w + 17}-{w + 22}q-{w + 10} 3-{w + 17} {w + 22}" fill="{fill}"/>'
            )
        shape += '<path d="M236 276q-54-33-77-89 44 15 77 89m0 0q56-43 79-89-53 23-79 89" fill="#728a50"/>'
    else:
        shape = '<path d="m161 247 25-110 122-19 22 106-71 55Z" fill="#a4ad97"/><path d="m161 247 98 32-21-104-52-38Z" fill="#88947c"/><path d="m186 137 52 38 70-57Z" fill="#c2c8b7"/><path d="m238 175 21 104 71-55-22-106Z" fill="#6b795f"/>'
    return start + shape + "</svg>"


ENTRIES = (
    ("textures/forest/moss_ground_albedo.png", "moss", "new"),
    ("textures/forest/moss_ground_normal.dds", "normal", "new"),
    ("models/props/wooden_crate.obj", "crate", "modified"),
    ("textures/forest/oak_bark_albedo.png", "bark", "synced"),
    ("models/rocks/forest_rock_01.obj", "rock", "synced"),
    ("textures/rocks/limestone_albedo.png", "stone", "new"),
    ("models/foliage/fern_cluster.obj", "fern", "synced"),
    ("textures/forest/fern_leaf_albedo.png", "leaf", "synced"),
    ("textures/terrain/river_sand_albedo.png", "sand", "modified"),
    ("textures/rocks/limestone_normal.dds", "normal", "synced"),
    ("materials/forest_floor.mat", "moss", "new"),
    ("models/rocks/forest_rock_02.obj", "rock", "synced"),
    ("textures/props/weathered_concrete.png", "concrete", "synced"),
    ("materials/oak_bark.mat", "bark", "synced"),
    ("textures/terrain/forest_soil_albedo.dds", "soil", "modified"),
    ("models/props/stone_marker.obj", "marker", "synced"),
    ("materials/river_sand.mat", "sand", "synced"),
    ("audio/forest_ambience.wav", "audio", "new"),
)

# Hours since each entry last changed: an irregular, two-week history that keeps the listing order above.
AGES_HOURS = (1, 2.5, 4, 7, 11, 16, 22, 30, 41, 55, 72, 96, 125, 160, 200, 250, 310, 380)

OBJ_BODY = "v -1 0 -1\nv 1 0 -1\nv 1 0 1\nv -1 0 1\nv -1 2 -1\nv 1 2 -1\nv 1 2 1\nv -1 2 1\nf 1 2 3 4\nf 5 8 7 6\nf 1 5 6 2\nf 2 6 7 3\nf 3 7 8 4\nf 4 8 5 1\n"


def _ambience() -> bytes:
    rate, samples = 22050, 22050 * 3
    i = np.arange(samples, dtype=np.float64)
    wave = np.floor((_noise(i, 0, 7) - 0.5) * 1300 * np.sin(np.pi * i / samples) + 0.5)
    header = struct.pack(
        "<4sI8sIHHIIHH4sI", b"RIFF", 36 + samples * 2, b"WAVEfmt ", 16, 1, 1, rate, rate * 2, 2, 16, b"data", samples * 2,
    )
    return header + wave.astype("<i2").tobytes()


def _preview_name(relative: str) -> str:
    return base64.urlsafe_b64encode(relative.encode()).rstrip(b"=").decode() + ".svg"


def seed_demo(home: str) -> dict:
    """Create the Verdant demo workspace in home and return its configuration."""
    # The demo copies from its GDA folder to its game folder.
    source, destination = os.path.join(home, "demo", "gda"), os.path.join(home, "demo", "game")
    os.makedirs(os.path.join(source, ".previews"), exist_ok=True)
    os.makedirs(destination, exist_ok=True)
    now = time.time()
    for index, (relative, kind, status) in enumerate(ENTRIES):
        file = os.path.join(source, *relative.split("/"))
        os.makedirs(os.path.dirname(file), exist_ok=True)
        if relative.endswith(".png"):
            data = encode_png(texture(kind))
        elif relative.endswith(".dds"):
            data = to_dds(texture(kind))
        elif relative.endswith(".obj"):
            data = f"# GDA Sync demo {kind}\no {kind}\n{OBJ_BODY}".encode()
            with open(os.path.join(source, ".previews", _preview_name(relative)), "w", encoding="utf-8") as svg:
                svg.write(model_art(kind))
        elif kind == "audio":
            data = _ambience()
        else:
            name = os.path.basename(relative).removesuffix(".mat")
            material = {"name": name, "shader": "standard", "roughness": 0.85, "metallic": 0, "texture": kind}
            data = json.dumps(material, indent=2).encode()
        with open(file, "wb") as output:
            output.write(data)
        when = now - AGES_HOURS[index] * 3600
        os.utime(file, (when, when))
        if status != "new":
            target = os.path.join(destination, *relative.split("/"))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            if status == "synced":
                shutil.copyfile(file, target)
            else:
                with open(target, "wb") as output:
                    output.write(b"Previous demo version\n")
    return {"name": "Verdant", "source": source, "destination": destination, "demo": True}
