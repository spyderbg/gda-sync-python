# PyInstaller specification: one self-contained executable with the Python runtime, the backend and the
# built Vue interface. Build it with `python scripts/package.py`, which runs this for each target.
import re
import sys
from pathlib import Path

ROOT = Path(SPECPATH).parent
STATIC = ROOT / "egt_gda_sync" / "static"
ICON = ROOT / "build" / "egt-gda-sync.ico"
if not (STATIC / "index.html").exists():
    raise SystemExit("Build the frontend first: python scripts/build.py")
VERSION = re.search(r'__version__ = "([^"]+)"', (ROOT / "egt_gda_sync" / "__init__.py").read_text()).group(1)
NUMBERS = tuple(int(part) for part in VERSION.split(".")) + (0,)

analysis = Analysis(
    [str(ROOT / "bundle" / "launcher.py")],
    pathex=[str(ROOT)],
    datas=[(str(STATIC), "egt_gda_sync/static")],
    # uvicorn imports the implementations chosen in egt_gda_sync.runtime by name.
    hiddenimports=["uvicorn.loops.asyncio", "uvicorn.protocols.http.h11_impl", "uvicorn.lifespan.on"],
    excludes=["tkinter"],
)
pyz = PYZ(analysis.pure)
windows = sys.platform == "win32"
version_info = None
if windows:
    # Shown as the program name and version in Windows Explorer and Task Manager.
    from PyInstaller.utils.win32.versioninfo import (
        FixedFileInfo, StringFileInfo, StringStruct, StringTable, VarFileInfo, VarStruct, VSVersionInfo,
    )

    version_info = VSVersionInfo(
        ffi=FixedFileInfo(filevers=NUMBERS, prodvers=NUMBERS),
        kids=[
            StringFileInfo([StringTable("040904B0", [
                StringStruct("ProductName", "EGT GDA Sync"),
                StringStruct("FileDescription", "EGT GDA Sync"),
                StringStruct("FileVersion", VERSION),
                StringStruct("ProductVersion", VERSION),
                StringStruct("OriginalFilename", "egt-gda-sync.exe"),
            ])]),
            VarFileInfo([VarStruct("Translation", [0x0409, 1200])]),
        ],
    )
exe = EXE(
    pyz,
    analysis.scripts,
    analysis.binaries,
    analysis.datas,
    [],
    name="egt-gda-sync",
    console=True,
    upx=False,
    icon=str(ICON) if windows and ICON.exists() else None,
    version=version_info,
)
