import struct


def create_bc7_dds(width: int = 4, height: int = 4, dxgi_format: int = 98) -> bytes:
    """Synthetic solid-red mode-5 BC7 DDS; no user assets are bundled into tests."""
    block, cursor = 0, 0

    def write(value: int, count: int) -> None:
        nonlocal block, cursor
        block |= (value & ((1 << count) - 1)) << cursor
        cursor += count

    write(1 << 5, 6)  # Mode 5.
    write(0, 2)  # No channel rotation.
    for channel in (127, 0, 0):
        write(channel, 7)
        write(channel, 7)
    write(255, 8)  # Opaque alpha at both endpoints.
    write(255, 8)
    # Both index planes are zero. Each first-pixel fix-up uses one fewer bit.
    for _plane in range(2):
        for pixel in range(16):
            write(0, 1 if pixel == 0 else 2)
    if cursor != 128:
        raise AssertionError("Invalid synthetic BC7 fixture")

    count = -(-width // 4) * -(-height // 4)
    header = bytearray(148)
    header[0:4] = b"DDS "
    header[84:88] = b"DX10"
    for offset, value in (
        (4, 124), (8, 0x81007), (12, height), (16, width), (20, count * 16), (28, 1), (76, 32), (80, 4),
        (108, 0x1000), (128, dxgi_format), (132, 3), (140, 1),
    ):
        struct.pack_into("<I", header, offset, value)
    return bytes(header) + block.to_bytes(16, "little") * count
