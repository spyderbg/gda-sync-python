"""Helpers for building the frontend and the standalone executables."""

import hashlib
import os
import shutil
import struct
import subprocess
import sys
import urllib.request
import zipfile
from importlib import metadata
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from gda_sync.png import encode_png  # noqa: E402

BUILD = ROOT / "build"
DIST = ROOT / "dist"
FRONTEND = ROOT / "frontend"
SPEC = ROOT / "bundle" / "gda-sync.spec"
ICON = BUILD / "gda-sync.ico"
# Wine, its prefix and the Windows Python live outside the project: the prefix links drive Z: to the
# file system root, which tools that walk the project tree would otherwise follow.
WINE_ROOT = Path(
    os.environ.get("GDA_SYNC_BUILD_CACHE") or Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "gda-sync-build"
)

# Windows executables built on Linux use this pinned, checksum-verified CPython from nuget.org under Wine.
WINDOWS_PYTHON_VERSION = "3.12.10"
WINDOWS_PYTHON_URL = f"https://www.nuget.org/api/v2/package/python/{WINDOWS_PYTHON_VERSION}"
WINDOWS_PYTHON_SHA256 = "0eb85c2dfccccf1b17352de4c397f69194035b7d37149eacc16f1147d93de3b8"
BUILD_REQUIREMENTS = ("fastapi", "uvicorn", "numpy", "pyinstaller")
# NumPy needs ucrtbase crealf and Python 3.12 needs CopyFile2, which Wine implements from version 11.
# Without a system Wine 11+, the official WineHQ build for Ubuntu 24.04 is unpacked into build/wine.
# Hashes are from the WineHQ Packages index, verified against its InRelease signature
# (key D43F 6401 4536 9C51 D786 DDEA 76F1 A20F F987 672F).
MINIMUM_WINE = (11, 0)
WINEHQ_POOL = "https://dl.winehq.org/wine-builds/ubuntu/pool/main/w/wine"
WINEHQ_PACKAGES = {
    "wine-stable_11.0.0.0~noble-1_amd64.deb": "04e7b4b995262c734019099d93277d8f219f7d180ebb65b5ccb3df7f97be1078",
    "wine-stable-amd64_11.0.0.0~noble-1_amd64.deb": "6cb835e2171b5572b17f1c06729735c2c7e40178239d7fa6c29ef14bd9b40d16",
}
WINE_RUNTIME = WINE_ROOT / "wine-11.0"
WINE_PREFIX = WINE_ROOT / "prefix"

# The favicon (frontend/public/favicon.svg) in its 64×64 view box: a rounded square and round-capped strokes.
ICON_BACKGROUND = (0x17, 0x2A, 0x25)
ICON_STROKE = (0xD8, 0xEA, 0xB8)
ICON_SEGMENTS = (
    ((18, 23), (41, 23)), ((41, 23), (35, 17)), ((46, 41), (23, 41)), ((23, 41), (29, 47)),
    ((44, 23), (35, 14)), ((20, 41), (29, 50)),
)
ICON_SIZES = (16, 24, 32, 48, 64, 128, 256)


def run(command: list[str], **options) -> None:
    print("$", " ".join(str(part) for part in command), flush=True)
    # Output is relayed through a pipe: Windows Python under Wine cannot use a redirected file as its stdout.
    process = subprocess.Popen([str(part) for part in command], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, **options)
    for line in process.stdout:
        sys.stdout.buffer.write(line)
        sys.stdout.flush()
    if process.wait():
        raise subprocess.CalledProcessError(process.returncode, command)


def package_targets(target: str | None, platform: str = sys.platform) -> list[str]:
    if platform not in ("linux", "win32"):
        raise ValueError("Run packaging on Linux or Windows.")
    if target is None:
        return ["windows" if platform == "win32" else "linux"]
    if target not in ("linux", "windows", "all"):
        raise ValueError("Usage: python scripts/package.py [--target linux|windows|all]")
    targets = ["linux", "windows"] if target == "all" else [target]
    if "linux" in targets and platform != "linux":
        raise ValueError("Build the Linux executable on Linux. Use --target windows on Windows.")
    return targets


def workspace_configuration() -> Path:
    config = ROOT / "config" / "workspace.json"
    if not config.is_file():
        raise SystemExit("Copy config/config.json.template to config/workspace.json and configure your workspace before packaging.")
    return config


def copy_workspace_configuration(executable: Path) -> Path:
    """Ship editable settings next to either platform's executable."""
    config = executable.parent / "workspace.json"
    shutil.copy2(workspace_configuration(), config)
    return config


def build_frontend() -> None:
    npm = shutil.which("npm")
    if not npm:
        raise SystemExit("Node.js 20.19+ and npm are required to build the frontend.")
    # An existing node_modules may be stale after dependency changes.
    run([npm, "ci"], cwd=FRONTEND)
    run([npm, "run", "build"], cwd=FRONTEND)


def render_icon(size: int, supersampling: int = 4) -> np.ndarray:
    """Rasterize the application icon as (size, size, 4) RGBA with anti-aliased edges."""
    samples = size * supersampling
    coordinates = (np.arange(samples) + 0.5) * 64 / samples
    y, x = np.meshgrid(coordinates, coordinates, indexing="ij")
    # Signed distance to the 64×64 square with an 18-unit corner radius.
    qx, qy = np.abs(x - 32) - 14, np.abs(y - 32) - 14
    inside = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) <= 18
    stroke = np.zeros_like(inside)
    for (ax, ay), (bx, by) in ICON_SEGMENTS:
        dx, dy = bx - ax, by - ay
        t = np.clip(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        stroke |= np.hypot(x - ax - t * dx, y - ay - t * dy) <= 2.5
    color = np.where(stroke[..., None], ICON_STROKE, ICON_BACKGROUND) * inside[..., None]
    color = color.reshape(size, supersampling, size, supersampling, 3).mean(axis=(1, 3))
    alpha = inside.reshape(size, supersampling, size, supersampling).mean(axis=(1, 3))
    rgb = color / np.maximum(alpha, 1e-9)[..., None]
    return np.dstack([rgb, alpha * 255]).round().astype(np.uint8)


def icon_file(sizes: tuple[int, ...] = ICON_SIZES) -> bytes:
    """A Windows .ico file with one PNG image per size."""
    images = [encode_png(render_icon(size)) for size in sizes]
    offset = 6 + 16 * len(images)
    entries = b""
    for size, image in zip(sizes, images, strict=True):
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(image), offset)
        offset += len(image)
    return struct.pack("<HHH", 0, 1, len(images)) + entries + b"".join(images)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download(url: str, target: Path, expected_sha256: str) -> Path:
    """Download url to target once, verifying its pinned SHA-256."""
    if target.exists() and sha256(target.read_bytes()) == expected_sha256:
        return target
    print(f"Downloading {url}", flush=True)
    with urllib.request.urlopen(url, timeout=600) as response:
        data = response.read()
    if sha256(data) != expected_sha256:
        raise RuntimeError(f"{target.name} does not match its pinned checksum.")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(target)
    return target


def wine_version(wine: str) -> tuple[int, ...]:
    output = subprocess.run([wine, "--version"], capture_output=True, text=True).stdout  # "wine-11.0 (...)"
    numbers = output.strip().removeprefix("wine-").split(" ")[0].split(".")
    return tuple(int(number) for number in numbers if number.isdigit())


def wine_bin() -> Path | None:
    """The directory of a Wine that can build the executable, or None when the system Wine is recent enough."""
    system_wine = shutil.which("wine")
    if system_wine and wine_version(system_wine) >= MINIMUM_WINE:
        return None
    bin_dir = WINE_RUNTIME / "opt" / "wine-stable" / "bin"
    if not (bin_dir / "wine").exists():
        if not shutil.which("dpkg-deb"):
            raise SystemExit("Building the Windows executable on Linux requires Wine 11 or newer.")
        staging = WINE_RUNTIME.with_name(WINE_RUNTIME.name + ".staging")
        shutil.rmtree(staging, ignore_errors=True)
        for name, checksum in WINEHQ_PACKAGES.items():
            package = download(f"{WINEHQ_POOL}/{name}", WINE_ROOT / "downloads" / name, checksum)
            run(["dpkg-deb", "-x", package, staging])
        staging.replace(WINE_RUNTIME)
    return bin_dir


def wine_environment(bin_dir: Path | None, prefix: Path = WINE_PREFIX) -> dict[str, str]:
    path = os.environ.get("PATH", "")
    return {
        **os.environ, "PATH": f"{bin_dir}{os.pathsep}{path}" if bin_dir else path, "WINEPREFIX": str(prefix),
        "WINEARCH": "win64", "WINEDEBUG": "-all", "WINEDLLOVERRIDES": "mscoree,mshtml=",
    }


def windows_path(path: Path) -> str:
    """Wine maps the Linux root directory to drive Z:."""
    return "Z:" + str(path).replace("/", "\\")


def _host_constraints() -> str:
    """Pin the Windows build to the package versions used for the Linux build and the tests."""
    pins = {}
    for distribution in metadata.distributions():
        name = (distribution.metadata["Name"] or "").lower()
        if name and name not in ("gda-sync", "pip", "setuptools"):
            pins[name] = f"{name}=={distribution.version}"
    return "\n".join(sorted(pins.values())) + "\n"


def prepare_windows_python() -> tuple[Path, dict[str, str]]:
    """An isolated Windows Python under Wine with the runtime and PyInstaller installed.

    Returns its python.exe and the Wine environment to run it with.
    """
    env = wine_environment(wine_bin())
    python_dir = WINE_ROOT / f"python-{WINDOWS_PYTHON_VERSION}"
    python = python_dir / "python.exe"
    if not python.exists():
        archive = download(WINDOWS_PYTHON_URL, WINE_ROOT / "downloads" / f"python.{WINDOWS_PYTHON_VERSION}.nupkg", WINDOWS_PYTHON_SHA256)
        staging = python_dir.with_name(python_dir.name + ".staging")
        shutil.rmtree(staging, ignore_errors=True)
        with zipfile.ZipFile(archive) as package:
            members = [member for member in package.namelist() if member.startswith("tools/")]
            package.extractall(staging, members)
        (staging / "tools").replace(python_dir)
        shutil.rmtree(staging)
    if not (python_dir / "Lib" / "site-packages" / "pip").is_dir():
        run(["wine", python, "-m", "ensurepip", "--default-pip"], env=env, cwd=ROOT)

    constraints = _host_constraints()
    requirements = [f"{name}=={metadata.version(name)}" for name in BUILD_REQUIREMENTS]
    stamp = python_dir / "gda-sync-requirements.txt"
    wanted = "\n".join(requirements) + "\n" + constraints
    if not stamp.exists() or stamp.read_text() != wanted:
        constraints_file = WINE_ROOT / "constraints.txt"
        constraints_file.write_text(constraints)
        run(["wine", python, "-m", "pip", "install", "--disable-pip-version-check", "--no-warn-script-location",
             "--constraint", windows_path(constraints_file), *requirements], env=env, cwd=ROOT)
        stamp.write_text(wanted)
    return python, env


def build_native(target: str) -> None:
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        raise SystemExit('PyInstaller is missing. Install the development tools: pip install -e ".[dev]"') from None
    run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--distpath", DIST,
         "--workpath", BUILD / "pyinstaller" / target, SPEC], cwd=ROOT)


def build_windows_with_wine() -> None:
    python, env = prepare_windows_python()
    try:
        run(["wine", python, "-m", "PyInstaller", "--noconfirm", "--clean", "--distpath", windows_path(DIST),
             "--workpath", windows_path(BUILD / "pyinstaller" / "windows"), windows_path(SPEC)], env=env, cwd=ROOT)
    finally:
        subprocess.run(["wineserver", "-k"], env=env, check=False)
