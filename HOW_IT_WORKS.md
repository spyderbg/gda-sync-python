# How EGT GDA Sync is built and runs

EGT GDA Sync becomes a standalone executable in two stages: **Vite builds the Vue
interface**, then **PyInstaller bundles that interface with the Python backend,
Python runtime, and required libraries**. The user launches one executable and
uses the application in their default browser. Python, Node.js, and npm are only
needed on the build machine.

The executable contains the application. Its editable workspace configuration
is a separate `workspace.json` file shipped beside it.

## Build flow

```text
frontend/ Vue + TypeScript + SCSS + fonts + icons
    |
    | npm ci, then npm run build
    v
egt_gda_sync/static/ HTML + JavaScript + CSS + fonts + icon font + favicon
    |
    | PyInstaller + bundle/launcher.py + egt_gda_sync/ + Python dependencies
    v
dist/egt-gda-sync                 Linux
dist/egt-gda-sync.exe             Windows

config/workspace.json -- copied separately --> dist/workspace.json
```

The main command is:

```bash
python scripts/package.py
```

It builds for the current operating system. The implementation is in
[scripts/package.py](scripts/package.py) and
[scripts/package_support.py](scripts/package_support.py).

### 1. Prepare the build environment

The project requires Python 3.10+ and Node.js 20.19+ with npm. Python 3.12 is the
development/test baseline documented in [README.md](README.md). Use a virtual
environment to keep the build dependencies isolated.

On Linux, from the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp config/workspace.json.template config/workspace.json
```

On Windows, in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
Copy-Item config/workspace.json.template config/workspace.json
```

Edit `config/workspace.json`: the global ports in `config`, the workspace that
opens first in `defaultWorkspace`, and one entry per game in `workspaces`. Each
entry has a unique `id`, the game's name in `game_name`, and absolute paths to
two existing, separate folders: `gda_path`, the GDA folder files are copied
from, and `game_path`, the game folder they are copied to.

```json
{
  "config": {
    "port": 3457,
    "vite_port": 5174
  },
  "defaultWorkspace": "burning_crown_tetra_spins_10",
  "workspaces": [
    {
      "id": "burning_crown_tetra_spins_10",
      "game_name": "Burning Crown Tetra Spins 10",
      "game_path": "/absolute/path/to/resources/burning_crown_tetra_spins_10",
      "gda_path": "/absolute/path/to/gda/burning_crown_tetra_spins_10/DEV"
    }
  ]
}
```

For Windows, paths can use forward slashes, such as `C:/Users/you/assets/gda`.
Neither folder may contain the other. The optional fields of the GDA sync
(`common_gda_path`, `extensions`, `resource_paths`, and `ignore_dds_mips`) are
described in [README.md](README.md). Packaging requires the configuration file to
exist. Its contents are validated when the application starts: invalid JSON or
invalid settings stop startup with an explanation, while a folder that does not
exist only produces a warning in the app.

[pyproject.toml](pyproject.toml) declares the runtime dependencies: FastAPI,
uvicorn, and NumPy. The `dev` extra installs PyInstaller and the testing tools.

### 2. Build the interface

By default, packaging calls `build_frontend()`, which runs these commands inside
`frontend/`:

```bash
npm ci
npm run build
```

`npm ci` installs dependencies from `frontend/package-lock.json`, even if
`node_modules` already exists. The build command runs `vue-tsc --noEmit` to check
the TypeScript/Vue code, then `vite build` to produce the browser files.

[frontend/vite.config.ts](frontend/vite.config.ts) places the result in
`egt_gda_sync/static/` and clears the previous output. The generated files
include `index.html`, JavaScript, CSS, the favicon, the locally bundled Roboto
font, and the Material Design Icons font. Vue, Chart.js, and the Bootstrap 4
styles of the StarAdmin template become part of the built interface.

To build only the interface:

```bash
python scripts/build.py
```

This does not create an executable. To reuse an existing interface build during
packaging, use `python scripts/package.py --skip-frontend`. You must rebuild the
interface after frontend changes; the spec refuses to package without
`egt_gda_sync/static/index.html`.

### 3. Bundle the application

Packaging generates `build/egt-gda-sync.ico`, then invokes PyInstaller using
[bundle/egt-gda-sync.spec](bundle/egt-gda-sync.spec). Native builds use the
active Python interpreter, with `--clean`, `--noconfirm`, output in `dist/`, and
intermediate files in `build/pyinstaller/<target>/`.

The spec defines:

- **Entry point:** `bundle/launcher.py`, which calls
  `multiprocessing.freeze_support()` and then `egt_gda_sync.__main__.main()`.
  The first call lets the executable start the GDA sync's background process
  (see [What happens when the executable starts](#what-happens-when-the-executable-starts)).
- **Import analysis:** `Analysis(...)` discovers the backend's required modules
  and binaries. The repository root is added to the import search path.
- **Interface data:** the entire `egt_gda_sync/static/` directory is explicitly
  included at the same relative location inside the bundle.
- **Dynamic imports:** uvicorn's asyncio loop, h11 HTTP implementation, and
  lifespan implementation are explicitly included as hidden imports.
- **Python archive:** `PYZ(analysis.pure)` holds the collected Python modules.
- **Single executable:** `EXE(...)` receives the scripts, archive, binaries, and
  data directly, producing a one-file bundle. UPX compression is disabled,
  `tkinter` is excluded, and console output is enabled.
- **Windows metadata:** the generated icon and the product name "EGT GDA Sync"
  with the file version from `egt_gda_sync/__init__.py` are embedded in
  `egt-gda-sync.exe`.

PyInstaller packages Python bytecode and an interpreter; the application logic
continues to run as Python. Its import analysis and package hooks select the
dependencies rather than copying the whole virtual environment.
See [PyInstaller's operating-mode documentation](https://pyinstaller.org/en/stable/operating-mode.html).

### 4. Copy the editable configuration

After each target builds, packaging copies `config/workspace.json` to
`dist/workspace.json`, replacing the previous packaged copy. An `--target all`
build produces both executables with one shared configuration file:

```text
dist/
├── egt-gda-sync
├── egt-gda-sync.exe
└── workspace.json
```

Distribute the executable for the recipient's operating system together with
`workspace.json`, and adjust its folder paths for that machine.

## What the executable includes

| Component | Purpose |
| --- | --- |
| PyInstaller bootloader | Starts the packaged runtime. |
| Python interpreter and required standard-library modules | Runs the backend without a separate Python installation. |
| `egt_gda_sync` application modules | Launching, HTTP API, asset scanning, hashing, syncing, backups, settings, activity, page lifetime, desktop integration, and the GDA sync: the `*Data.json` descriptor schemas, the comparison, its background runs and reports, and the `report` command. |
| FastAPI, uvicorn, and their collected dependencies | Serves the local interface and API. This includes dependencies such as Starlette, Pydantic, AnyIO, and h11. |
| NumPy and required native libraries | Supports texture generation and DDS/BC7 decoding. |
| Built Vue interface | HTML, JavaScript, CSS, fonts, favicon, and interface icons, usable offline. |
| Preview and demo code | DDS/BC7 decoders, PNG encoding, and code that generates sample assets and demo model illustrations. |
| Windows icon and version resources | Identifies the application in Explorer and Task Manager. |

The exact collected dependency files and executable size depend on the build
environment and PyInstaller hooks. Native Python dependencies use version ranges
in `pyproject.toml`; frontend dependencies are resolved by the frontend lockfile.

## What stays outside the executable

| Item | Location or requirement |
| --- | --- |
| Workspace settings | Editable `workspace.json` beside the executable. |
| Your GDA and game folders | The folders referenced by the settings; packaging does not copy them into the executable. |
| Activity history, backups, GDA sync reports, and generated demo files | The application data directory. |
| Web browser | The user's installed default browser. |
| Desktop integration | Linux uses the system's `xdg-open`; Windows uses its shell handler. |
| Operating-system libraries | The executable still requires a compatible OS and architecture. |

Node.js, npm, Wine, the Vite development server, and a browser engine are not
bundled. The spec does not add the repository's tests, build scripts, frontend
source directory, or `node_modules` as application data.

The demo's 18 sample assets are generated by `egt_gda_sync/demo.py` when no
workspace configuration or saved settings exist. They are written to the data
directory at runtime; packaging does not embed an existing demo workspace.

## Linux and Windows builds

```bash
python scripts/package.py                   # Current OS
python scripts/package.py --target linux    # Linux host only
python scripts/package.py --target windows  # Native Windows, or Wine on Linux
python scripts/package.py --target all      # Both, on Linux
```

On Linux, the native build uses Linux Python. On Windows, the native build uses
Windows Python. For a Windows target on Linux, the script runs Windows
PyInstaller under Wine with checksum-verified Windows CPython **3.12.10**. It
pins the Windows build requirements and their dependency constraints to versions
installed in the host Python environment.

That path uses system Wine 11+ when available; otherwise it downloads and
unpacks checksum-pinned WineHQ 11.0 packages for Ubuntu 24.04. The Wine runtime,
prefix, Windows Python, and downloads are cached in
`${XDG_CACHE_HOME:-~/.cache}/egt-gda-sync-build`, or `EGT_GDA_SYNC_BUILD_CACHE`
when set. They are build tools; the resulting Windows executable runs without
Wine on Windows.

The documented distribution targets are Linux x64 on Ubuntu 24.04+
(glibc 2.39+) and Windows 10/11 x64. Linux compatibility depends on the build
environment because glibc is supplied by the target OS. Supporting older Linux
systems requires building against an appropriately older baseline.
See [PyInstaller's Linux compatibility guidance](https://pyinstaller.org/en/stable/usage.html#making-gnu-linux-apps-forward-compatible).

## What happens when the executable starts

1. **Prepare the runtime.** PyInstaller's bootloader extracts bundled support
   files to a temporary `_MEI...` directory and starts the embedded interpreter.
   The temporary directory is removed on normal exit. This extraction adds
   startup work to a one-file application.
   See [PyInstaller's one-file runtime explanation](https://pyinstaller.org/en/stable/operating-mode.html#how-the-one-file-program-works).
2. **Load workspace settings.** The launcher reads `workspace.json` beside the
   real executable, regardless of the working directory or a launch symlink.
   If missing, it restores saved settings or generates a demo and writes a new
   configuration there. The executable's directory must be writable to save settings.
3. **Start the local backend.** uvicorn serves FastAPI on `127.0.0.1`, on the
   port in `config.port` of `workspace.json` (`3456` when it is not set), or the
   port set by `PORT`. A second launch on the same port reopens the existing
   EGT GDA Sync instance; a different application occupying the port causes an error.
4. **Open the interface.** The launcher opens the default browser.
   `egt_gda_sync/server.py` reads the bundled static files and serves them
   together with `/api/...` endpoints. Vue runs in the browser and calls this
   local API. Use `--no-open` or `EGT_GDA_SYNC_NO_OPEN=1` to open the page manually.
5. **Run the GDA sync in the background.** **Rescan** compares the active
   workspace's game resources with its GDA folder in a separate process, so the
   app stays responsive. The process is started in spawn mode, which in the
   executable means starting the executable again; `multiprocessing.freeze_support()`
   in the launcher makes that copy run the comparison instead of the app. Each
   run saves a report in the data directory's `sync-reports/`.
6. **Keep running while a page is open.** Each app page holds an event-stream
   connection. Closing the last page schedules shutdown after a two-second
   grace period. Refreshing or another connected app page keeps the backend
   alive. Active file operations finish before shutdown completes.

Write operations require a per-process session token, and the server rejects
foreign hosts and cross-site browser requests. No account or cloud service is
needed for the application to operate.

The executable also runs the GDA sync without the server or a browser:
`egt-gda-sync report` compares the default workspace, `egt-gda-sync report ID ...`
the listed workspaces, and `egt-gda-sync report --all` every workspace. Each
report is saved where the app reads it. The exit status is `0` when everything
compared is in sync, `1` when differences exist, and `2` when a sync could not run.

Persistent data defaults to:

- Linux: `${XDG_DATA_HOME:-~/.local/share}/egt-gda-sync/`
- Windows: `%LOCALAPPDATA%\EGT GDA Sync\`

These directories hold `activity.json`, `backups/`, `sync-reports/`, and any
generated `demo/` files. `EGT_GDA_SYNC_HOME` overrides the data directory. For
packaged executables, it does not move the active configuration away from beside
the executable.

## Verify a built executable

With the development dependencies installed, install the verification browser
once, then run the packaged application checks:

```bash
python -m playwright install chromium
python scripts/verify_package.py
python scripts/verify_package.py windows  # Windows executable under Wine on Linux
```

The verifier copies the executable into an isolated directory, supplies test
settings, and launches it from another working directory. It checks configuration
loading/saving, demo assets, model and BC7 previews, sync, backups, activity
persistence, refresh, and exit after the last page closes. Its browser is a test
dependency, separate from the shipped executable. Windows builds tested under
Wine should also be checked on a real Windows desktop before distribution.
