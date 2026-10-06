import struct
import zlib

from egt_gda_sync.png import PNG_SIGNATURE


def read_png(data: bytes) -> tuple[int, int, bytes]:
    """Read the RGBA PNGs that egt_gda_sync.png writes: returns (width, height, pixels)."""
    assert data[:8] == PNG_SIGNATURE, "Not a PNG file"
    position, width, height, compressed = 8, 0, 0, b""
    while position < len(data):
        length, tag = struct.unpack_from(">I4s", data, position)
        body = data[position + 8:position + 8 + length]
        position += 12 + length
        if tag == b"IHDR":
            width, height, depth, color = struct.unpack_from(">IIBB", body)
            assert (depth, color) == (8, 6), "Expected 8-bit RGBA"
        elif tag == b"IDAT":
            compressed += body
        elif tag == b"IEND":
            break
    raw = zlib.decompress(compressed)
    stride = width * 4 + 1
    rows = [raw[y * stride:(y + 1) * stride] for y in range(height)]
    assert all(row[0] == 0 for row in rows), "Only unfiltered scanlines are supported"
    return width, height, b"".join(row[1:] for row in rows)
