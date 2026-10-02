"""BC7 block decoding, vectorized over many blocks with NumPy.

The decoder and partition tables are adapted from bcdec by Sergii Kudlai.
https://github.com/iOrange/bcdec (MIT).

Copyright (c) 2022 Sergii Kudlai

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

import numpy as np

# Two-subset tables followed by three-subset tables. Bit 7 marks fix-up pixels.
PARTITIONS = np.array([
    [128, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 129],
    [128, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 129],
    [128, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 129],
    [128, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 129],
    [128, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 129],
    [128, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 129],
    [128, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 129],
    [128, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 129],
    [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 129],
    [128, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 129],
    [128, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 129],
    [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 129],
    [128, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 129],
    [128, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 129],
    [128, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 129],
    [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 129],
    [128, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 129],
    [128, 1, 129, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    [128, 0, 0, 0, 0, 0, 0, 0, 129, 0, 0, 0, 1, 1, 1, 0],
    [128, 1, 129, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    [128, 0, 129, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    [128, 0, 0, 0, 1, 0, 0, 0, 129, 1, 0, 0, 1, 1, 1, 0],
    [128, 0, 0, 0, 0, 0, 0, 0, 129, 0, 0, 0, 1, 1, 0, 0],
    [128, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 129],
    [128, 0, 129, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    [128, 0, 0, 0, 1, 0, 0, 0, 129, 0, 0, 0, 1, 1, 0, 0],
    [128, 1, 129, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0],
    [128, 0, 129, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0],
    [128, 0, 0, 1, 0, 1, 1, 1, 129, 1, 1, 0, 1, 0, 0, 0],
    [128, 0, 0, 0, 1, 1, 1, 1, 129, 1, 1, 1, 0, 0, 0, 0],
    [128, 1, 129, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0],
    [128, 0, 129, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0],
    [128, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 129],
    [128, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 129],
    [128, 1, 0, 1, 1, 0, 129, 0, 0, 1, 0, 1, 1, 0, 1, 0],
    [128, 0, 1, 1, 0, 0, 1, 1, 129, 1, 0, 0, 1, 1, 0, 0],
    [128, 0, 129, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0],
    [128, 1, 0, 1, 0, 1, 0, 1, 129, 0, 1, 0, 1, 0, 1, 0],
    [128, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 129],
    [128, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 129],
    [128, 1, 129, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 0],
    [128, 0, 0, 1, 0, 0, 1, 1, 129, 1, 0, 0, 1, 0, 0, 0],
    [128, 0, 129, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0],
    [128, 0, 129, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0],
    [128, 1, 129, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0],
    [128, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 129],
    [128, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 129],
    [128, 0, 0, 0, 0, 1, 129, 0, 0, 1, 1, 0, 0, 0, 0, 0],
    [128, 1, 0, 0, 1, 1, 129, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    [128, 0, 129, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0],
    [128, 0, 0, 0, 0, 0, 129, 0, 0, 1, 1, 1, 0, 0, 1, 0],
    [128, 0, 0, 0, 0, 1, 0, 0, 129, 1, 1, 0, 0, 1, 0, 0],
    [128, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 129],
    [128, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 129],
    [128, 1, 129, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0],
    [128, 0, 129, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 0],
    [128, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 129],
    [128, 1, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 129],
    [128, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 129],
    [128, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 129],
    [128, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 129],
    [128, 0, 129, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
    [128, 0, 129, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0],
    [128, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 129],
    [128, 0, 1, 129, 0, 0, 1, 1, 0, 2, 2, 1, 2, 2, 2, 130],
    [128, 0, 0, 129, 0, 0, 1, 1, 130, 2, 1, 1, 2, 2, 2, 1],
    [128, 0, 0, 0, 2, 0, 0, 1, 130, 2, 1, 1, 2, 2, 1, 129],
    [128, 2, 2, 130, 0, 0, 2, 2, 0, 0, 1, 1, 0, 1, 1, 129],
    [128, 0, 0, 0, 0, 0, 0, 0, 129, 1, 2, 2, 1, 1, 2, 130],
    [128, 0, 1, 129, 0, 0, 1, 1, 0, 0, 2, 2, 0, 0, 2, 130],
    [128, 0, 2, 130, 0, 0, 2, 2, 1, 1, 1, 1, 1, 1, 1, 129],
    [128, 0, 1, 1, 0, 0, 1, 1, 130, 2, 1, 1, 2, 2, 1, 129],
    [128, 0, 0, 0, 0, 0, 0, 0, 129, 1, 1, 1, 2, 2, 2, 130],
    [128, 0, 0, 0, 1, 1, 1, 1, 129, 1, 1, 1, 2, 2, 2, 130],
    [128, 0, 0, 0, 1, 1, 129, 1, 2, 2, 2, 2, 2, 2, 2, 130],
    [128, 0, 1, 2, 0, 0, 129, 2, 0, 0, 1, 2, 0, 0, 1, 130],
    [128, 1, 1, 2, 0, 1, 129, 2, 0, 1, 1, 2, 0, 1, 1, 130],
    [128, 1, 2, 2, 0, 129, 2, 2, 0, 1, 2, 2, 0, 1, 2, 130],
    [128, 0, 1, 129, 0, 1, 1, 2, 1, 1, 2, 2, 1, 2, 2, 130],
    [128, 0, 1, 129, 2, 0, 0, 1, 130, 2, 0, 0, 2, 2, 2, 0],
    [128, 0, 0, 129, 0, 0, 1, 1, 0, 1, 1, 2, 1, 1, 2, 130],
    [128, 1, 1, 129, 0, 0, 1, 1, 130, 0, 0, 1, 2, 2, 0, 0],
    [128, 0, 0, 0, 1, 1, 2, 2, 129, 1, 2, 2, 1, 1, 2, 130],
    [128, 0, 2, 130, 0, 0, 2, 2, 0, 0, 2, 2, 1, 1, 1, 129],
    [128, 1, 1, 129, 0, 1, 1, 1, 0, 2, 2, 2, 0, 2, 2, 130],
    [128, 0, 0, 129, 0, 0, 0, 1, 130, 2, 2, 1, 2, 2, 2, 1],
    [128, 0, 0, 0, 0, 0, 129, 1, 0, 1, 2, 2, 0, 1, 2, 130],
    [128, 0, 0, 0, 1, 1, 0, 0, 130, 2, 129, 0, 2, 2, 1, 0],
    [128, 1, 2, 130, 0, 129, 2, 2, 0, 0, 1, 1, 0, 0, 0, 0],
    [128, 0, 1, 2, 0, 0, 1, 2, 129, 1, 2, 2, 2, 2, 2, 130],
    [128, 1, 1, 0, 1, 2, 130, 1, 129, 2, 2, 1, 0, 1, 1, 0],
    [128, 0, 0, 0, 0, 1, 129, 0, 1, 2, 130, 1, 1, 2, 2, 1],
    [128, 0, 2, 2, 1, 1, 0, 2, 129, 1, 0, 2, 0, 0, 2, 130],
    [128, 1, 1, 0, 0, 129, 1, 0, 2, 0, 0, 2, 2, 2, 2, 130],
    [128, 0, 1, 1, 0, 1, 2, 2, 0, 1, 130, 2, 0, 0, 1, 129],
    [128, 0, 0, 0, 2, 0, 0, 0, 130, 2, 1, 1, 2, 2, 2, 129],
    [128, 0, 0, 0, 0, 0, 0, 2, 129, 1, 2, 2, 1, 2, 2, 130],
    [128, 2, 2, 130, 0, 0, 2, 2, 0, 0, 1, 2, 0, 0, 1, 129],
    [128, 0, 1, 129, 0, 0, 1, 2, 0, 0, 2, 2, 0, 2, 2, 130],
    [128, 1, 2, 0, 0, 129, 2, 0, 0, 1, 130, 0, 0, 1, 2, 0],
    [128, 0, 0, 0, 1, 1, 129, 1, 2, 2, 130, 2, 0, 0, 0, 0],
    [128, 1, 2, 0, 1, 2, 0, 1, 130, 0, 129, 2, 0, 1, 2, 0],
    [128, 1, 2, 0, 2, 0, 1, 2, 129, 130, 0, 1, 0, 1, 2, 0],
    [128, 0, 1, 1, 2, 2, 0, 0, 1, 1, 130, 2, 0, 0, 1, 129],
    [128, 0, 1, 1, 1, 1, 130, 2, 2, 2, 0, 0, 0, 0, 1, 129],
    [128, 1, 0, 129, 0, 1, 0, 1, 2, 2, 2, 2, 2, 2, 2, 130],
    [128, 0, 0, 0, 0, 0, 0, 0, 130, 1, 2, 1, 2, 1, 2, 129],
    [128, 0, 2, 2, 1, 129, 2, 2, 0, 0, 2, 2, 1, 1, 2, 130],
    [128, 0, 2, 130, 0, 0, 1, 1, 0, 0, 2, 2, 0, 0, 1, 129],
    [128, 2, 2, 0, 1, 2, 130, 1, 0, 2, 2, 0, 1, 2, 2, 129],
    [128, 1, 0, 1, 2, 2, 130, 2, 2, 2, 2, 2, 0, 1, 0, 129],
    [128, 0, 0, 0, 2, 1, 2, 1, 130, 1, 2, 1, 2, 1, 2, 129],
    [128, 1, 0, 129, 0, 1, 0, 1, 0, 1, 0, 1, 2, 2, 2, 130],
    [128, 2, 2, 130, 0, 1, 1, 1, 0, 2, 2, 2, 0, 1, 1, 129],
    [128, 0, 0, 2, 1, 129, 1, 2, 0, 0, 0, 2, 1, 1, 1, 130],
    [128, 0, 0, 0, 2, 129, 1, 2, 2, 1, 1, 2, 2, 1, 1, 130],
    [128, 2, 2, 2, 0, 129, 1, 1, 0, 1, 1, 1, 0, 2, 2, 130],
    [128, 0, 0, 2, 1, 1, 1, 2, 129, 1, 1, 2, 0, 0, 0, 130],
    [128, 1, 1, 0, 0, 129, 1, 0, 0, 1, 1, 0, 2, 2, 2, 130],
    [128, 0, 0, 0, 0, 0, 0, 0, 2, 1, 129, 2, 2, 1, 1, 130],
    [128, 1, 1, 0, 0, 129, 1, 0, 2, 2, 2, 2, 2, 2, 2, 130],
    [128, 0, 2, 2, 0, 0, 1, 1, 0, 0, 129, 1, 0, 0, 2, 130],
    [128, 0, 2, 2, 1, 1, 2, 2, 129, 1, 2, 2, 0, 0, 2, 130],
    [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 129, 1, 130],
    [128, 0, 0, 130, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 129],
    [128, 2, 2, 2, 1, 2, 2, 2, 0, 2, 2, 2, 129, 2, 2, 130],
    [128, 1, 0, 129, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 130],
    [128, 1, 1, 129, 2, 0, 1, 1, 130, 2, 0, 1, 2, 2, 2, 0],
], dtype=np.int32)

COLOR_BITS = (4, 6, 5, 7, 5, 7, 7, 5)
ALPHA_BITS = (0, 0, 0, 0, 6, 8, 7, 5)
HAS_P_BITS = 0b11001011
WEIGHTS = {
    2: np.array([0, 21, 43, 64], np.int32),
    3: np.array([0, 9, 18, 27, 37, 46, 55, 64], np.int32),
    4: np.array([0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64], np.int32),
}
# The mode is the number of zero bits before the first set bit; 8 marks the reserved mode.
_MODE_OF_FIRST_BYTE = np.array([(byte & -byte).bit_length() - 1 if byte else 8 for byte in range(256)], np.int8)
# Bounds the temporary arrays used for very large textures.
_CHUNK_BLOCKS = 16_384


def _bits(lo: np.ndarray, hi: np.ndarray, offset, width) -> np.ndarray:
    """Read little-endian bit fields from 128-bit blocks stored as two uint64 halves."""
    offset = np.asarray(offset, np.int64)
    width = np.asarray(width, np.int64)
    mask = np.left_shift(np.uint64(1), width.astype(np.uint64)) - np.uint64(1)
    # Shift counts stay below 64; larger counts are undefined for uint64.
    low = np.right_shift(lo, np.minimum(offset, 63).astype(np.uint64))
    carry = np.where(
        (offset > 0) & (offset < 64),
        np.left_shift(hi, np.clip(64 - offset, 0, 63).astype(np.uint64)),
        np.uint64(0),
    )
    high = np.right_shift(hi, np.clip(offset - 64, 0, 63).astype(np.uint64))
    return (np.where(offset >= 64, high, low | carry) & mask).astype(np.int32)


def _decode_mode(mode: int, lo: np.ndarray, hi: np.ndarray) -> np.ndarray:
    count = lo.size
    subsets = 3 if mode in (0, 2) else 2 if mode in (1, 3, 7) else 1
    cursor = mode + 1

    def read(width: int) -> np.ndarray:
        nonlocal cursor
        value = _bits(lo, hi, cursor, width)
        cursor += width
        return value

    none = np.zeros(count, np.int32)
    partition = read(4 if mode == 0 else 6) if subsets > 1 else none
    rotation = read(2) if mode in (4, 5) else none
    index_selection = read(1) if mode == 4 else none

    endpoint_count = subsets * 2
    color_bits, alpha_bits = COLOR_BITS[mode], ALPHA_BITS[mode]
    endpoints = np.zeros((count, endpoint_count, 4), np.int32)
    for channel in range(3):
        for endpoint in range(endpoint_count):
            endpoints[:, endpoint, channel] = read(color_bits)
    if alpha_bits:
        for endpoint in range(endpoint_count):
            endpoints[:, endpoint, 3] = read(alpha_bits)

    p_bits = (HAS_P_BITS >> mode) & 1
    if p_bits:
        endpoints <<= 1
        if mode == 1:
            # Mode 1 shares one P-bit between both endpoints of each subset.
            for subset in range(subsets):
                endpoints[:, 2 * subset:2 * subset + 2, :3] |= read(1)[:, None, None]
        else:
            for endpoint in range(endpoint_count):
                endpoints[:, endpoint, :] |= read(1)[:, None]
    for channel in range(4):
        if channel == 3 and not alpha_bits:
            endpoints[:, :, 3] = 255
            continue
        precision = (alpha_bits if channel == 3 else color_bits) + p_bits
        expanded = endpoints[:, :, channel] << (8 - precision)
        endpoints[:, :, channel] = expanded | (expanded >> precision)

    index_bits = 3 if mode in (0, 1) else 4 if mode == 6 else 2
    secondary_bits = 3 if mode == 4 else 2 if mode == 5 else 0
    if subsets == 1:
        table = np.zeros((count, 16), np.int32)
        table[:, 0] = 128
    else:
        table = PARTITIONS[(subsets - 2) * 64 + partition]
    # Each subset has one fix-up pixel whose index is stored with one bit less.
    widths = index_bits - (table >> 7)
    offsets = cursor + np.cumsum(widths, axis=1) - widths
    primary = _bits(lo[:, None], hi[:, None], offsets, widths)
    cursor += 16 * index_bits - subsets

    if secondary_bits:
        secondary_widths = np.full(16, secondary_bits)
        secondary_widths[0] -= 1
        secondary_offsets = cursor + np.cumsum(secondary_widths) - secondary_widths
        secondary = _bits(lo[:, None], hi[:, None], secondary_offsets, secondary_widths)
        swap = index_selection[:, None].astype(bool)
        primary_weights, secondary_weights = WEIGHTS[index_bits][primary], WEIGHTS[secondary_bits][secondary]
        color_weights = np.where(swap, secondary_weights, primary_weights)
        alpha_weights = np.where(swap, primary_weights, secondary_weights)
    else:
        color_weights = alpha_weights = WEIGHTS[index_bits][primary]
    weights = np.stack([color_weights, color_weights, color_weights, alpha_weights], axis=-1)

    rows = np.arange(count)[:, None]
    subset = table & 3
    start, end = endpoints[rows, subset * 2], endpoints[rows, subset * 2 + 1]
    pixels = ((64 - weights) * start + weights * end + 32) >> 6
    for channel in range(3):
        rotated = rotation == channel + 1
        if rotated.any():
            pixels[rotated, :, channel], pixels[rotated, :, 3] = pixels[rotated, :, 3], pixels[rotated, :, channel]
    return pixels.astype(np.uint8)


def decode_bc7_blocks(blocks: np.ndarray) -> np.ndarray:
    """Decode (n, 16) BC7 blocks into (n, 16, 4) row-major RGBA pixels. All eight modes."""
    blocks = np.ascontiguousarray(blocks, np.uint8).reshape(-1, 16)
    # The reserved mode must decode to transparent black, as specified by Direct3D.
    pixels = np.zeros((len(blocks), 16, 4), np.uint8)
    for start in range(0, len(blocks), _CHUNK_BLOCKS):
        chunk = blocks[start:start + _CHUNK_BLOCKS]
        halves = chunk.view("<u8").astype(np.uint64)
        modes = _MODE_OF_FIRST_BYTE[chunk[:, 0]]
        for mode in range(8):
            selected = np.flatnonzero(modes == mode)
            if selected.size:
                pixels[start + selected] = _decode_mode(mode, halves[selected, 0], halves[selected, 1])
    return pixels


def decode_bc7_block(data: bytes, offset: int = 0) -> bytes:
    """Decode one 128-bit BC7 block into 16 row-major RGBA pixels (64 bytes)."""
    if offset < 0 or offset + 16 > len(data):
        raise ValueError("Truncated BC7 block")
    block = np.frombuffer(data, np.uint8, 16, offset)
    return decode_bc7_blocks(block).tobytes()
