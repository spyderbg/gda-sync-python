import base64
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
import pytest

from egt_gda_sync.images import dds as dds_module
from egt_gda_sync.images.bc7 import decode_bc7_block, decode_bc7_blocks
from egt_gda_sync.images.dds import decode_dds, decode_dds_rgba, read_dds_info
from egt_gda_sync.workspace.demo import to_dds
from tests.fixtures.bc7_dds import create_bc7_dds
from tests.fixtures.png_reader import read_png

CONFORMANCE = json.loads((Path(__file__).parent / "fixtures" / "bc7-conformance.json").read_text())


def block_dds(format: str) -> bytearray:
    data = bytearray(136 if format == "DXT1" else 144)
    data[0:4] = b"DDS "
    data[84:84 + len(format)] = format.encode()
    for offset, value in ((4, 124), (12, 4), (16, 4), (76, 32), (80, 4)):
        struct.pack_into("<I", data, offset, value)
    color_offset = 128 if format == "DXT1" else 136
    struct.pack_into("<HH", data, color_offset, 0xF800, 0x07E0)
    return data


def pixels(dds: bytes) -> bytes:
    return read_png(decode_dds(bytes(dds)))[2]


def test_rgb_dds_preserves_rgba_channels_and_dimensions():
    image = np.array([[[12, 34, 56, 78], [200, 100, 50, 255]]], np.uint8)
    dds = to_dds(image)
    assert read_dds_info(dds) == {"width": 2, "height": 1, "mipmaps": 1, "format": "RGB32"}
    assert pixels(dds) == image.tobytes()


def test_dxt1_color_interpolation_and_transparent_fourth_color():
    dds = block_dds("DXT1")
    struct.pack_into("<I", dds, 132, 0xE4)
    decoded = pixels(dds)
    assert list(decoded[0:4]) == [255, 0, 0, 255]
    assert list(decoded[4:8]) == [0, 255, 0, 255]
    assert list(decoded[8:12]) == [170, 85, 0, 255]
    struct.pack_into("<HHI", dds, 128, 0, 0xFFFF, 3)
    assert pixels(dds)[3] == 0


def test_dxt3_explicit_alpha_and_dxt5_interpolated_alpha_are_decoded():
    dxt3 = block_dds("DXT3")
    dxt3[128:136] = b"\x88" * 8
    assert list(pixels(dxt3)[0:4]) == [255, 0, 0, 136]
    dxt5 = block_dds("DXT5")
    dxt5[128:131] = bytes([255, 0, 2])
    assert pixels(dxt5)[3] == 218
    dxt5[128:131] = bytes([0, 255, 7])
    assert pixels(dxt5)[3] == 255


def test_invalid_truncated_excessive_and_unsupported_dds_fail_with_useful_errors():
    with pytest.raises(ValueError, match="Invalid DDS"):
        read_dds_info(bytes(10))
    with pytest.raises(ValueError, match="Truncated"):
        decode_dds(bytes(block_dds("DXT1")[:132]))
    huge = block_dds("DXT1")
    struct.pack_into("<II", huge, 12, 65535, 65535)
    with pytest.raises(ValueError, match="16 MP"):
        read_dds_info(bytes(huge))
    with pytest.raises(ValueError, match="Truncated DDS DX10 header"):
        decode_dds(bytes(block_dds("DX10")))
    with pytest.raises(ValueError, match="Preview unavailable for DXGI 95"):
        decode_dds(create_bc7_dds(4, 4, 95))


@pytest.mark.parametrize("vector", CONFORMANCE["vectors"], ids=lambda vector: f"mode-{vector['mode']}")
def test_bc7_matches_bcdec_reference_across_partitions_and_channel_rotations(vector):
    data = base64.b64decode(vector["blocks"])
    decoded = b"".join(decode_bc7_block(data, offset) for offset in range(0, len(data), 16))
    assert hashlib.sha256(decoded).hexdigest() == vector["rgbaSha256"]


def numpy_bc7(width: int, height: int, blocks: bytes) -> np.ndarray:
    """The reference: the app's NumPy BC7 decoder, its blocks arranged into a cropped image."""
    pixels = decode_bc7_blocks(np.frombuffer(blocks, np.uint8))
    columns, rows = -(-width // 4), -(-height // 4)
    return pixels.reshape(rows, columns, 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(rows * 4, columns * 4, 4)[:height, :width]


def random_bc7_blocks(count: int, seed: int) -> bytes:
    """Random blocks, which cover every mode, partition and rotation, with every seventh block of the reserved mode."""
    blocks = np.random.default_rng(seed).integers(0, 256, (count, 16), dtype=np.uint8)
    blocks[::7, 0] = 0
    return blocks.tobytes()


@pytest.mark.parametrize("vector", CONFORMANCE["vectors"], ids=lambda vector: f"mode-{vector['mode']}")
def test_dds_bc7_previews_match_bcdec_reference(vector):
    # The DDS path decodes with Pillow's C decoder: a row of 4 × 4 blocks, compared block by block with the reference.
    blocks = base64.b64decode(vector["blocks"])
    count = len(blocks) // 16
    image = decode_dds_rgba(create_bc7_dds(4 * count, 4, blocks=blocks))
    by_block = image.reshape(4, count, 4, 4).transpose(1, 0, 2, 3)
    assert hashlib.sha256(by_block.tobytes()).hexdigest() == vector["rgbaSha256"]


@pytest.mark.parametrize("width, height", [(132, 68), (130, 66), (1, 1), (7, 13)])
def test_dds_bc7_previews_match_the_numpy_decoder_and_clear_reserved_blocks(width, height):
    count = -(-width // 4) * -(-height // 4)
    blocks = random_bc7_blocks(count, seed=width * height)
    image = decode_dds_rgba(create_bc7_dds(width, height, blocks=blocks))
    assert image.shape == (height, width, 4) and image.flags.writeable
    assert np.array_equal(image, numpy_bc7(width, height, blocks))
    # Direct3D decodes the reserved mode as transparent black; Pillow's decoder alone gives opaque black.
    assert not image[:4, :4].any()


def test_dds_bc7_previews_use_the_numpy_decoder_when_pillow_cannot_decode(monkeypatch):
    def unavailable(*_args):
        raise OSError("decoder bcn not available")

    monkeypatch.setattr(dds_module.Image, "frombytes", unavailable)
    blocks = random_bc7_blocks(6, seed=1)
    assert np.array_equal(decode_dds_rgba(create_bc7_dds(10, 6, blocks=blocks)), numpy_bc7(10, 6, blocks))


@pytest.mark.parametrize("dxgi_format, name", [(98, "BC7_UNORM"), (99, "BC7_UNORM_SRGB")])
def test_dx10_bc7_previews_use_the_extended_header_preserve_color_and_crop_edge_blocks(dxgi_format, name):
    data = create_bc7_dds(136, 134, dxgi_format)
    assert read_dds_info(data) == {"width": 136, "height": 134, "format": name, "mipmaps": 1}
    width, height, decoded = read_png(decode_dds(data))
    assert (width, height) == (136, 134)
    assert decoded == bytes([255, 0, 0, 255]) * (136 * 134)


def test_bc7_rejects_truncated_headers_truncated_blocks_and_invalid_2d_resource_metadata():
    data = bytearray(create_bc7_dds())
    with pytest.raises(ValueError, match="Truncated DDS DX10 header"):
        read_dds_info(bytes(data[:147]))
    with pytest.raises(ValueError, match="Truncated DDS pixel data"):
        decode_dds(bytes(data[:-1]))
    with pytest.raises(ValueError, match="Truncated BC7 block"):
        decode_bc7_block(bytes(15))
    struct.pack_into("<I", data, 132, 4)
    with pytest.raises(ValueError, match="valid 2D DDS"):
        decode_dds(bytes(data))
    assert decode_bc7_block(bytes(16)) == bytes(64)
