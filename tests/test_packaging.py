import runpy
import struct
import sys
from pathlib import Path, PurePosixPath

import pytest

from scripts import package_support
from scripts.package_support import (
    ICON_BACKGROUND,
    ICON_SIZES,
    ICON_STROKE,
    icon_file,
    package_targets,
    render_icon,
    windows_path,
)
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


@pytest.mark.parametrize("binary_name", ["gda-sync", "gda-sync.exe"])
def test_packaging_copies_the_current_configuration_beside_either_executable(tmp_path, monkeypatch, binary_name):
    config = tmp_path / "config" / "workspace.json"
    config.parent.mkdir()
    config.write_text('{"name": "My studio", "source": "/assets/source", "destination": "/assets/gda"}', encoding="utf-8")
    binary = tmp_path / "dist" / binary_name
    binary.parent.mkdir()
    binary.touch()
    copied = binary.parent / "workspace.json"
    copied.write_text("Old packaged settings", encoding="utf-8")
    monkeypatch.setattr(package_support, "ROOT", tmp_path)
    assert package_support.copy_workspace_configuration(binary) == copied
    assert copied.read_bytes() == config.read_bytes()


def test_the_package_entrypoint_ships_the_config_after_building_the_executable(tmp_path, monkeypatch):
    script = Path(__file__).resolve().parents[1] / "scripts" / "package.py"
    config = tmp_path / "config" / "workspace.json"
    config.parent.mkdir()
    config.write_text('{"name": "Packaged project"}', encoding="utf-8")
    dist = tmp_path / "dist"
    dist.mkdir()
    monkeypatch.setattr(package_support, "ROOT", tmp_path)
    monkeypatch.setattr(package_support, "DIST", dist)
    monkeypatch.setattr(package_support, "ICON", tmp_path / "build" / "icon.ico")
    monkeypatch.setitem(sys.modules, "package_support", package_support)

    def build_native(target):
        (dist / ("gda-sync.exe" if target == "windows" else "gda-sync")).write_bytes(b"test executable")

    monkeypatch.setattr(package_support, "build_native", build_native)
    entrypoint = runpy.run_path(str(script))
    entrypoint["main"](["--skip-frontend"])
    assert (dist / "workspace.json").read_bytes() == config.read_bytes()


def test_missing_configuration_fails_packaging_before_a_build_starts(tmp_path, monkeypatch):
    script = Path(__file__).resolve().parents[1] / "scripts" / "package.py"
    monkeypatch.setattr(package_support, "ROOT", tmp_path)
    monkeypatch.setitem(sys.modules, "package_support", package_support)

    def unexpected_build():
        pytest.fail("Do not start an expensive build without a workspace configuration")

    monkeypatch.setattr(package_support, "build_frontend", unexpected_build)
    entrypoint = runpy.run_path(str(script))
    with pytest.raises(SystemExit, match="config/config.json.template"):
        entrypoint["main"]([])
