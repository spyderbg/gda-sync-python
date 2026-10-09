"""DDS header parsing and first-surface previews for DXT1/3/5, RGB24/32 and DX10 BC7."""

import struct
from typing import TypedDict

import numpy as np

from .bc7 import decode_bc7_blocks
from .png import encode_png

MAX_PIXELS = 16_777_216
SUPPORTED_DDS_FORMATS = frozenset({"DXT1", "DXT3", "DXT5", "RGB24", "RGB32", "BC7_UNORM", "BC7_UNORM_SRGB"})
HEADER_SIZE = 128
DX10_HEADER_SIZE = 148


class DDSInfo(TypedDict):
    width: int
    height: int
    format: str
    mipmaps: int


def _u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def read_dds_info(data: bytes) -> DDSInfo:
    if len(data) < HEADER_SIZE or data[:4] != b"DDS " or _u32(data, 4) != 124 or _u32(data, 76) != 32:
        raise ValueError("Invalid DDS header")
    height, width = _u32(data, 12), _u32(data, 16)
    if not width or not height or width * height > MAX_PIXELS:
        raise ValueError("DDS dimensions are invalid or exceed the 16 MP preview limit")
    if _u32(data, 80) & 4:
        # Match ASCII decoding of the FourCC: drop the high bit and NUL padding.
        format = bytes(byte & 0x7F for byte in data[84:88]).decode("ascii").replace("\0", "")
    else:
        format = f"RGB{_u32(data, 88)}"
    if format == "DX10":
        if len(data) < DX10_HEADER_SIZE:
            raise ValueError("Truncated DDS DX10 header")
        dxgi_format = _u32(data, 128)
        format = {98: "BC7_UNORM", 99: "BC7_UNORM_SRGB"}.get(dxgi_format, f"DXGI {dxgi_format}")
    return {"width": width, "height": height, "format": format, "mipmaps": max(1, _u32(data, 28))}


def _round_ratio(numerator, denominator):
    """Integer equivalent of rounding numerator / denominator half up, for non-negative values."""
    return (2 * numerator + denominator) // (2 * denominator)


def _blocks(data: bytes, offset: int, width: int, height: int, block_size: int) -> np.ndarray:
    count = -(-width // 4) * -(-height // 4)
    if len(data) < offset + count * block_size:
        raise ValueError("Truncated DDS pixel data")
    return np.frombuffer(data, np.uint8, count * block_size, offset).reshape(count, block_size)


def _assemble(pixels: np.ndarray, width: int, height: int) -> np.ndarray:
    """Arrange (blocks, 16, 4) row-major block pixels into a cropped (height, width, 4) image."""
    blocks_x, blocks_y = -(-width // 4), -(-height // 4)
    image = pixels.reshape(blocks_y, blocks_x, 4, 4, 4).transpose(0, 2, 1, 3, 4)
    return image.reshape(blocks_y * 4, blocks_x * 4, 4)[:height, :width]


def _rgb565(color: np.ndarray) -> np.ndarray:
    return np.stack([
        _round_ratio(((color >> 11) & 31) * 255, 31),
        _round_ratio(((color >> 5) & 63) * 255, 63),
        _round_ratio((color & 31) * 255, 31),
    ], axis=-1)


def _decode_dxt(data: bytes, format: str, width: int, height: int) -> np.ndarray:
    block_size = 8 if format == "DXT1" else 16
    blocks = _blocks(data, HEADER_SIZE, width, height, block_size).astype(np.int64)
    colors = blocks[:, block_size - 8:]
    c0 = colors[:, 0] | colors[:, 1] << 8
    c1 = colors[:, 2] | colors[:, 3] << 8
    first, second = _rgb565(c0), _rgb565(c1)

    palette = np.zeros((len(blocks), 4, 4), np.int64)
    palette[:, 0, :3], palette[:, 1, :3] = first, second
    palette[:, :3, 3] = 255
    four_colors = ((c0 > c1) | (format != "DXT1"))[:, None]
    palette[:, 2, :3] = np.where(four_colors, _round_ratio(2 * first + second, 3), _round_ratio(first + second, 2))
    palette[:, 3, :3] = np.where(four_colors, _round_ratio(first + 2 * second, 3), 0)
    palette[:, 3, 3] = np.where(four_colors[:, 0], 255, 0)

    shifts = np.arange(16)
    indices = colors[:, 4] | colors[:, 5] << 8 | colors[:, 6] << 16 | colors[:, 7] << 24
    pixels = palette[np.arange(len(blocks))[:, None], (indices[:, None] >> (2 * shifts)) & 3]

    if format == "DXT3":
        pixels[:, :, 3] = ((blocks[:, shifts // 2] >> ((shifts % 2) * 4)) & 15) * 17
    elif format == "DXT5":
        a0, a1 = blocks[:, 0:1], blocks[:, 1:2]
        steps = np.arange(1, 7)
        eight = (7 - steps) * a0 + steps * a1
        six = (5 - steps[:4]) * a0 + steps[:4] * a1
        alphas = np.where(
            a0 > a1,
            np.concatenate([a0, a1, eight // 7], axis=1),
            np.concatenate([a0, a1, six // 5, np.zeros_like(a0), np.full_like(a0, 255)], axis=1),
        )
        alpha_bits = sum(blocks[:, 2 + byte] << (8 * byte) for byte in range(6))
        pixels[:, :, 3] = np.take_along_axis(alphas, (alpha_bits[:, None] >> (3 * shifts)) & 7, axis=1)
    return _assemble(pixels.astype(np.uint8), width, height)


def _decode_rgb(data: bytes, width: int, height: int) -> np.ndarray:
    bytes_per_pixel = _u32(data, 88) // 8
    masks = [_u32(data, offset) for offset in (92, 96, 100, 104)]
    pitch = _u32(data, 20) if _u32(data, 8) & 8 else width * bytes_per_pixel
    if pitch < width * bytes_per_pixel or len(data) < HEADER_SIZE + pitch * height:
        raise ValueError("Truncated DDS pixel data")
    rows = np.frombuffer(data, np.uint8, pitch * height, HEADER_SIZE).reshape(height, pitch)
    raw = rows[:, :width * bytes_per_pixel].reshape(height, width, bytes_per_pixel).astype(np.int64)
    pixel = sum(raw[:, :, byte] << (8 * byte) for byte in range(bytes_per_pixel))
    image = np.empty((height, width, 4), np.uint8)
    for channel, mask in enumerate(masks):
        if not mask:
            image[:, :, channel] = 255 if channel == 3 else 0
            continue
        shift = (mask & -mask).bit_length() - 1
        maximum = mask >> shift
        image[:, :, channel] = _round_ratio(((pixel & mask) >> shift) * 255, maximum) & 0xFF
    return image


def decode_dds(data: bytes) -> bytes:
    """Decode the first surface/mip of a DXT1/3/5, RGB or DX10 BC7 DDS file as a PNG."""
    return encode_png(decode_dds_rgba(data))


def decode_dds_rgba(data: bytes) -> np.ndarray:
    """Decode the first surface/mip of a DXT1/3/5, RGB or DX10 BC7 DDS file as a (height, width, 4) uint8 RGBA array."""
    info = read_dds_info(data)
    width, height, format = info["width"], info["height"], info["format"]
    if format in ("BC7_UNORM", "BC7_UNORM_SRGB"):
        if _u32(data, 132) != 3 or _u32(data, 140) == 0:
            raise ValueError("BC7 previews require a valid 2D DDS texture")
        blocks = _blocks(data, DX10_HEADER_SIZE, width, height, 16)
        image = _assemble(decode_bc7_blocks(blocks), width, height)
    elif format in ("DXT1", "DXT3", "DXT5"):
        image = _decode_dxt(data, format, width, height)
    elif format in ("RGB24", "RGB32"):
        image = _decode_rgb(data, width, height)
    else:
        raise ValueError(f"Preview unavailable for {format}. DXT1, DXT3, DXT5, RGB and BC7 DDS are supported.")
    return np.ascontiguousarray(image)
