import struct
from pathlib import PurePosixPath

import pytest

from scripts.package_support import ICON_BACKGROUND, ICON_SIZES, ICON_STROKE, icon_file, package_targets, render_icon, windows_path
from tests.fixtures.png_reader import read_png


def test_packaging_builds_the_current_system_and_windows_on_linux_with_wine():
    assert package_targets(None, "linux") == ["linux"]
    assert package_targets(None, "win32") == ["windows"]
    assert package_targets("windows", "linux") == ["windows"]
    assert package_targets("windows", "win32") == ["windows"]
    assert package_targets("all", "linux") == ["linux", "windows"]
    with pytest.raises(ValueError, match="Usage"):
        package_targets("unknown", "linux")
    with pytest.raises(ValueError, match="on Linux"):
        package_targets("linux", "win32")
    with pytest.raises(ValueError, match="Linux or Windows"):
        package_targets(None, "darwin")


def test_the_windows_icon_renders_the_favicon_at_every_size():
    image = render_icon(64)
    assert image[0, 0, 3] == 0, "Rounded corners are transparent"
    assert tuple(image[32, 8]) == (*ICON_BACKGROUND, 255)
    assert tuple(image[23, 30]) == (*ICON_STROKE, 255)
    data = icon_file()
    assert struct.unpack_from("<HHH", data) == (0, 1, len(ICON_SIZES))
    for index, size in enumerate(ICON_SIZES):
        width, height, _colors, _reserved, _planes, bits, length, offset = struct.unpack_from("<BBBBHHII", data, 6 + 16 * index)
        assert (width or 256, height or 256, bits) == (size, size, 32)
        assert read_png(data[offset:offset + length])[:2] == (size, size)


def test_wine_sees_linux_paths_on_drive_z():
    assert windows_path(PurePosixPath("/home/artist/gda sync/dist")) == "Z:\\home\\artist\\gda sync\\dist"
