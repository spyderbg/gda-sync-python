# EGT GDA Sync

A local-first studio asset sync application for Ubuntu and Windows: a **Python** backend (**FastAPI** + uvicorn), a **Vue 3** interface styled with the [StarAdmin](https://github.com/BootstrapDash/StarAdmin-Free-Bootstrap-Admin-Template) Bootstrap admin template, and a standalone executable that starts the backend, opens your browser, and stops when you close the page.

## Launch the finished application

| Platform | Executable | Launch |
| --- | --- | --- |
| Linux x64 (Ubuntu 24.04+, glibc 2.39+) | `dist/egt-gda-sync` | `./dist/egt-gda-sync` |
| Windows 10/11 x64 | `dist/egt-gda-sync.exe` | Double-click, or `.\dist\egt-gda-sync.exe` in PowerShell |

Both start the backend on the configured port (default **http://127.0.0.1:3456**) and open your default browser. Each executable is a single file containing the Python runtime, the backend and its libraries, the Vue interface, and its fonts. Python, Node.js, and npm are not required on the user's machine. Linux opens the browser and folders with `xdg-open`; Windows uses the shell's default handler. The Windows executable is unsigned, so SmartScreen may ask for confirmation on first launch; it uses a console window that closes when the backend exits.

To add **EGT GDA Sync** to your Ubuntu application menu and `~/.local/bin`:

```bash
./scripts/install-desktop.sh
```

The Linux installer works entirely in your user account, with no `sudo`, and copies `workspace.json` alongside the installed executable on first installation. Reinstalling preserves the installed configuration. The Windows executable runs from any folder without installation; keep its `workspace.json` next to it.

**The backend stops when you close the page.** The page keeps an event-stream connection to the backend; closing or navigating away from the last EGT GDA Sync page stops the backend after a two-second grace period. Refreshing reconnects during that grace period, and another open EGT GDA Sync tab keeps the app running. Switching tabs or minimizing the browser keeps it running. Active file copies finish before shutdown. You can also use Workspace settings → Stop application to quit immediately.

## Try the demo

The app opens on the **Dashboard**, which follows the StarAdmin dashboard layout: totals with trend lines, source changes and synced files over time (1D, 1W, 1M, or all), the file-format mix, storage per folder and status, sync coverage per asset type, the share of the library in sync, the assets waiting for sync, the largest assets, recent changes, sync activity, and folders.

Launching without an existing workspace configuration creates the **Verdant** workspace with 18 real sample files: textures, DDS maps, OBJ models, materials, and audio. Five assets are new, three are modified, and ten are already in sync.

- Search names and folder paths; filter by type, format, or status.
- Switch between grid and list views; sort by name, size, or modification time.
- Click an asset to inspect its metadata and enlarge its preview.
- Select assets and choose **Sync selected**, sync an individual asset, or **Sync all pending**.
- Review the files and destination in the sync dialog, then confirm the copy.
- Use **Rescan** after editing a source file to recompute its sync status and retry any failed previews.
- Open the source or GDA folder in your file manager, or copy its full path.
- Review the sync history: every GDA sync run with its result and what changed since the previous run, and every copy to the GDA folder, including the individual files copied.
- Connect your own existing source and GDA folders under **Workspace settings**.

`Ctrl+K` (or `⌘K`) focuses search; `Esc` closes dialogs. Fonts, icons, and sample previews are bundled, so the application works offline.

## Workspace configuration

When you start the project with `python -m egt_gda_sync` or `python scripts/dev.py`, it reads **`config/workspace.json`**. Global ports live in the `config` section. The `workspaces` list contains `game_name` (game name), `game_path` (game assets folder), and `gda_path` (GDA folder) for each workspace. Saving settings in the app updates this same file; manual edits take effect on the next launch. The launcher prints the active configuration path.

For first use, copy the tracked template before launching:

```bash
cp config/workspace.json.template config/workspace.json
```

On Windows, use PowerShell:

```powershell
Copy-Item config/workspace.json.template config/workspace.json
```

Edit each workspace in `config/workspace.json` with your project name and the absolute paths of two existing, separate folders. Configure or remove the template's example entries before launching. Windows paths can use forward slashes, for example `C:/Users/you/assets/source`. Invalid JSON or invalid settings stop startup with an explanation. **`config/workspace.json` is Git ignored** so each user's paths stay local; `config/workspace.json.template` is shared as the starting point.

The template includes multiple workspaces and a `defaultWorkspace` ID:

```json
{
  "config": {
    "port": 3457,
    "vite_port": 5174
  },
  "defaultWorkspace": "egt",
  "workspaces": [
    { "id": "egt", "game_name": "EGT GDA Sync", "game_path": "/assets/egt/source", "gda_path": "/assets/egt/gda" },
    { "id": "another", "game_name": "Another project", "game_path": "/assets/another/source", "gda_path": "/assets/another/gda" }
  ]
}
```

Each workspace needs a unique, non-empty ID and two existing, separate folders. Restart after editing the list. The sidebar Workspace selector loads this list and saves the active selection; Workspace settings edits only the selected entry. Older files using `name`, `source`, `destination`, `activeWorkspace`, and top-level ports still load. Saving a workspace list writes the new field names and nested `config` section.

The optional `config.port` field sets the backend's listening port, for example `"config": { "port": 4567 }`. The template uses `3457`; files without this field use `3456`. The `PORT` environment variable supplied when launching the app overrides the value in `workspace.json`, for example `PORT=5678 ./dist/egt-gda-sync`. Ports must be integers between `1` and `65535`. Launch overrides apply for that run and leave the configured port intact; saving Workspace settings also preserves it. Restart the app after changing its configured port.

The optional `config.vite_port` field sets the development UI port used by `python scripts/dev.py`, for example `"config": { "vite_port": 5174 }`. The template uses `5174`; files without this field use `5173`. `VITE_PORT` overrides it for one launch, for example `VITE_PORT=5175 python scripts/dev.py`. It follows the same port validation and is preserved when saving Workspace settings. The Vite and backend ports must be different.

If no project configuration exists, the first launch creates it from your previously saved workspace, or starts the Verdant demo for a new user. Generated demo settings also include an internal `demo` flag; omit it when configuring your own folders.

### GDA sync

**Rescan** also starts the GDA sync for the selected workspace in a background process. It answers one question: for every resource of the game, does the GDA folder hold an identical copy? It never changes a file. The rules are those of `docs/rss_sync/gda_sync.py`, described in `docs/rss_sync/sync.md`. It reads the `*Data.json` descriptors in `game_path` and compares every file there, plus the shared files the descriptors name. A GDA file matches by file name, in any folder, and by SHA-256. A DDS file that differs only in its mip levels also counts as in sync. Open **Sync → In sync** to see the result: resources in sync, missing from the GDA, different, or declared but invalid.

The sync treats `game_path` as `<resources folder>/<game>` and `gda_path` as the game's GDA folder. Each workspace can also set these optional fields:

| Field | Default | Meaning |
| --- | --- | --- |
| `common_gda_path` | none | GDA folder for the shared files under `<resources folder>/common`. A relative path is resolved against the folder of `workspace.json`. |
| `extensions` | `[".csv", ".dds", ".ini", ".mov", ".png", ".rtf", ".ttf", ".wav"]` | File extensions to compare. |
| `resource_paths` | `[]` | Extra paths to check, relative to `game_path`. |
| `ignore_dds_mips` | `true` | Count DDS files that differ only in mip levels as in sync. |

The latest result of each workspace is saved as `<app-data>/sync-reports/<workspace id>.json`. It is the JSON form of the script's `sync_report.md`, plus the files in sync, how the last run ended, and a `history` of every run, newest first, with the counts of each successful one. A failed run keeps the previous result and records its error. **Sync → Sync history** shows these runs.

### Packaged applications

**Packaging copies `config/workspace.json` to `dist/workspace.json`**, beside `egt-gda-sync` or `egt-gda-sync.exe`. Configure the source file before running `python scripts/package.py`. Each packaging run refreshes the copy. Distribute or move the executable and this configuration together, and adjust folder paths for the destination machine. Both targets share `dist/workspace.json` when building with `--target all`.

The packaged application always loads `workspace.json` beside the actual executable, even when launched from another folder or through a symlink. Saving Workspace settings updates that same file; manual edits take effect on the next launch. The launcher prints the active configuration path. Invalid JSON or invalid folders stop startup with an explanation.

`EGT_GDA_SYNC_HOME` controls the data directory. For project launches it also selects `<EGT_GDA_SYNC_HOME>/workspace.json`; packaged executables continue to use the configuration beside them. If a packaged configuration is missing, the app recreates it from saved settings or a new demo. The executable directory must be writable to save settings.

## File behavior

Sync is one-way: source → GDA. Relative subfolders and original file bytes are preserved. File size and SHA-256 contents determine whether a destination matches. Copies use temporary files in the destination folder and an atomic rename. Source changes during copying are rejected. Existing destination files are backed up before replacement. Source files and extra GDA files are never deleted.

History, demo files, and backups use these default data directories:

- Linux: `${XDG_DATA_HOME:-~/.local/share}/egt-gda-sync/`
- Windows: `%LOCALAPPDATA%\EGT GDA Sync\` (normally `C:\Users\<user>\AppData\Local\EGT GDA Sync\`)

Both use this layout:

```text
<app-data>/
├── workspace.json          # Legacy settings / project EGT_GDA_SYNC_HOME overrides
├── activity.json
├── dev.json                # Processes of a running scripts/dev.py session
├── sync-reports/<workspace-id>.json
├── demo/source/
├── demo/gda/
└── backups/<sync-id>/<relative-file-path>
```

The exact backup directory is displayed in settings. To restore a previous GDA version, copy the corresponding backup file back into the same relative location in your GDA folder. Set `EGT_GDA_SYNC_HOME` to use a different app data directory; `config/workspace.json.template` shows the configuration format. Source and destination must be existing, separate folders; nested roots are rejected, and symbolic links (and Windows junctions) are skipped. Hidden files and folders are skipped: names starting with `.`, and on Windows also items with the Hidden attribute. The demo supports up to 10,000 files per workspace.

DDS previews decode the first surface and mip of **DXT1, DXT3, DXT5, RGB24, RGB32, and DX10 BC7 (UNORM / sRGB)**. Other DDS formats remain available for syncing, with a clear preview-unavailable message. DDS previews are limited to 16 megapixels, and all previews to 64 MB. Demo model thumbnails are illustrations; arbitrary 3D files are copied but not rendered. Material/audio files use type thumbnails.

The server binds only to loopback. Write operations require a per-process session token; foreign hosts, cross-site browser requests, and request bodies over 128 KB are rejected. This is an app for a trusted local desktop, with no account or cloud service.

## Development

Requires Python 3.10+ (developed and tested with 3.12) and Node.js 20.19+ with npm (Node is only needed to build the interface).

Create a Python virtual environment:

```bash
python3 -m venv .venv
```

Activate the virtual environment on Linux or macOS:

```bash
source .venv/bin/activate
```

On Windows, activate it in Command Prompt:

```bat
.venv\Scripts\activate
```

Install the project and its development dependencies:

```bash
pip install -e ".[dev]"
```

Build the Vue interface into `egt_gda_sync/static`:

```bash
python scripts/build.py
```

Start the backend and open the app in your browser:

```bash
python -m egt_gda_sync
```

Start the Vite dev server with hot reload and the backend. The browser opens automatically:

```bash
python scripts/dev.py
```

`start` is the default action. End a running session from another terminal with:

```bash
python scripts/dev.py stop
```

`stop` waits for the backend and Vite to exit and warns when a port is still in use.

Type-check the Vue code:

```bash
npm --prefix frontend run typecheck
```

Run the filesystem, sync, API, lifecycle, DDS/BC7, packaging, and browser tests:

```bash
pytest
```

Build the executable for the current operating system into `dist/`:

```bash
python scripts/package.py
```

The build and development scripts run `npm ci` to install the frontend dependencies from the lockfile, including when `node_modules` already exists.

Browser tests need Playwright's Chromium once: `python -m playwright install chromium`. They run against the built interface in isolated temporary workspaces and verify offline rendering, search/filtering, DDS and BC7 previews, mobile layout, configuration, selected sync, full sync, persistence, session renewal, and application shutdown on page close. Screenshots are written to `build/preview-desktop.png` and `build/preview-mobile.png`. Run `pytest -m "not e2e"` to skip them.

### Standalone executables

```bash
python scripts/package.py                   # Linux: dist/egt-gda-sync; Windows: dist\egt-gda-sync.exe
python scripts/package.py --target windows  # On Linux: build dist/egt-gda-sync.exe with Wine
python scripts/package.py --target all      # On Linux: both executables
python scripts/verify_package.py            # Test the executable for the current OS
python scripts/verify_package.py windows    # On Linux: test dist/egt-gda-sync.exe under Wine
```

Executables are built with PyInstaller from `bundle/egt-gda-sync.spec`, as one file with the built interface embedded. Add `--skip-frontend` to reuse an existing interface build. PyInstaller cannot cross-compile, so on Windows the executable is built natively with the active Python environment, and on Linux the Windows build runs a Windows Python under Wine:

- The Windows CPython (3.12.10, from nuget.org) is pinned by SHA-256, and its packages are pinned to the versions in your Linux environment.
- NumPy and Python 3.12 need Windows APIs that Wine implements from version 11. If the system Wine is older, the build downloads the official WineHQ 11.0 packages for Ubuntu 24.04 (pinned by SHA-256 from WineHQ's signed package index) and unpacks them without installing anything system-wide.
- These downloads, the Wine prefix, and the Windows Python are cached outside the project in `${XDG_CACHE_HOME:-~/.cache}/egt-gda-sync-build` (override with `EGT_GDA_SYNC_BUILD_CACHE`). Later builds reuse them offline.

`verify_package.py` copies the executable to an isolated directory with a test `workspace.json`, launches from a different folder, and checks that the packaged settings load and save beside the executable. It also checks demo assets, model and BC7 previews, sync and backups, persistence, refresh, and automatic process exit on page close, using isolated app-data directories (and an isolated Wine prefix). Windows verification on Linux uses Wine; a check on a real Windows desktop is still recommended before distribution.

### Launch options

```bash
./dist/egt-gda-sync --no-open
EGT_GDA_SYNC_HOME=/path/to/app-data ./dist/egt-gda-sync
PORT=4567 ./dist/egt-gda-sync
EGT_GDA_SYNC_NO_OPEN=1 python scripts/dev.py
```

Launching a second instance reopens the running app on the same port. If another application occupies the port, EGT GDA Sync exits with an explanation. With `--no-open`, the backend waits for its first page before the page-close shutdown applies. The configured port and `PORT` override apply to both production and development; `scripts/dev.py` passes the resolved backend port to Vite's API proxy. The development UI, browser URL, and backend redirect use `vite_port` (or the `VITE_PORT` override).

On Windows, set environment overrides in PowerShell:

```powershell
$env:EGT_GDA_SYNC_HOME = 'D:\EGT GDA Sync Data'
$env:PORT = '4567'
.\dist\egt-gda-sync.exe --no-open
```

## Structure

```text
egt_gda_sync/    Python backend: FastAPI app, workspace sync, page lifetime, DDS/BC7 decoders, demo generator
  static/        Built Vue interface (generated by scripts/build.py; embedded in executables)
frontend/        Vue 3 + TypeScript interface (Vite), Chart.js charts, and app styles
  src/theme/     StarAdmin template SCSS (Bootstrap 4), compiled with the interface
bundle/          PyInstaller specification and executable entry point
scripts/         Build, development, packaging, package verification, Ubuntu desktop installation
config/          Git-ignored workspace.json and the shared workspace.json.template
tests/           Backend, API and lifecycle tests; tests/e2e has the browser workflow tests
build/           Generated screenshots and PyInstaller work files
dist/            Generated standalone Linux and Windows executables with workspace.json
```

| Module | Responsibility |
| --- | --- |
| `egt_gda_sync/__main__.py` | Launcher: app-data location, port checks, single instance, opening the browser |
| `egt_gda_sync/server.py` | HTTP API, local-only request guard, session token, embedded interface |
| `egt_gda_sync/runtime.py` | uvicorn server that ends page streams before its graceful shutdown |
| `egt_gda_sync/lifetime.py` | Page-lifetime event stream and the two-second close grace period |
| `egt_gda_sync/library.py` | Scanning, hashing, safe paths, sync with backups, settings, activity, previews |
| `egt_gda_sync/dds.py`, `bc7.py` | DDS parsing and NumPy-vectorized DXT/RGB/BC7 decoding |
| `egt_gda_sync/demo.py` | Deterministic demo textures, DDS maps, models, materials, and audio |

DDS decoding follows Microsoft's [DDS header](https://learn.microsoft.com/en-us/windows/win32/direct3ddds/dds-header) and [block-compression](https://learn.microsoft.com/en-us/windows/win32/direct3d10/d3d10-graphics-programming-guide-resources-block-compression) documentation. The BC7 decoder and partition tables are adapted from [bcdec](https://github.com/iOrange/bcdec) under the MIT license; its copyright and license are retained in `egt_gda_sync/bc7.py` and the bundled application. Regression vectors cover all eight BC7 modes, all partition patterns, channel rotations, and index selectors.

The interface uses the SCSS of the [StarAdmin Free Bootstrap Admin Template](https://github.com/BootstrapDash/StarAdmin-Free-Bootstrap-Admin-Template) by BootstrapDash (MIT), compiled against Bootstrap 4.6 with Material Design Icons and Roboto; `frontend/src/theme/staradmin/README.md` lists its few changes.
