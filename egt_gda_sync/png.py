"""Minimal PNG encoding for RGBA previews and demo textures."""

import struct
import zlib

import numpy as np

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))


def encode_png(rgba: np.ndarray, level: int = 6) -> bytes:
    """Encode a (height, width, 4) uint8 array as an 8-bit RGBA PNG."""
    height, width, channels = rgba.shape
    if channels != 4:
        raise ValueError("Expected RGBA pixels")
    # Every scanline starts with filter type 0 (none).
    rows = np.zeros((height, width * 4 + 1), np.uint8)
    rows[:, 1:] = rgba.reshape(height, width * 4)
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        PNG_SIGNATURE
        + _chunk(b"IHDR", header)
        + _chunk(b"IDAT", zlib.compress(rows.tobytes(), level))
        + _chunk(b"IEND", b"")
    )
