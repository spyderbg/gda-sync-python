# GDA Sync

A local-first studio asset sync application for Ubuntu and Windows: a **Python** backend (**FastAPI** + uvicorn), a **Vue 3** interface styled with the [StarAdmin](https://github.com/BootstrapDash/StarAdmin-Free-Bootstrap-Admin-Template) Bootstrap admin template, and a standalone executable that starts the backend, opens your browser, and stops when you close the page.

This is a Python reimplementation of the TypeScript/React/Fastify GDA Sync 1.1.0, with the same features, API, and on-disk data format, and a dashboard interface built on StarAdmin's layout, components, colors, and Chart.js charts.

## Launch the finished application

| Platform | Executable | Launch |
| --- | --- | --- |
| Linux x64 (Ubuntu 24.04+, glibc 2.39+) | `dist/gda-sync` | `./dist/gda-sync` |
| Windows 10/11 x64 | `dist/gda-sync.exe` | Double-click, or `.\dist\gda-sync.exe` in PowerShell |

Both start the backend on **http://127.0.0.1:3456** and open your default browser. Each executable is a single file containing the Python runtime, the backend and its libraries, the Vue interface, and its fonts. Python, Node.js, and npm are not required on the user's machine. Linux opens the browser and folders with `xdg-open`; Windows uses the shell's default handler. The Windows executable is unsigned, so SmartScreen may ask for confirmation on first launch; it uses a console window that closes when the backend exits.

To add **GDA Sync** to your Ubuntu application menu and `~/.local/bin`:

```bash
./scripts/install-desktop.sh
```

The Linux installer works entirely in your user account, with no `sudo`. The Windows executable runs from any folder without installation.

**The backend stops when you close the page.** The page keeps an event-stream connection to the backend; closing or navigating away from the last GDA Sync page stops the backend after a two-second grace period. Refreshing reconnects during that grace period, and another open GDA Sync tab keeps the app running. Switching tabs or minimizing the browser keeps it running. Active file copies finish before shutdown. You can also use Workspace settings → Stop application to quit immediately.

## Try the demo

The app opens on the **Dashboard**, which follows the StarAdmin dashboard layout: totals with trend lines, source changes and synced files over time (1D, 1W, 1M, or all), the file-format mix, storage per folder and status, sync coverage per asset type, the share of the library in sync, the assets waiting for sync, the largest assets, recent changes, sync activity, and folders.

The first launch creates the **Verdant** workspace with 18 real sample files: textures, DDS maps, OBJ models, materials, and audio. Five assets are new, three are modified, and ten are already in sync.

- Search names and folder paths; filter by type, format, or status.
- Switch between grid and list views; sort by name, size, or modification time.
- Click an asset to inspect its metadata and enlarge its preview.
- Select assets and choose **Sync selected**, sync an individual asset, or **Sync all pending**.
- Review the files and destination in the sync dialog, then confirm the copy.
- Use **Rescan** after editing a source file to recompute its sync status and retry any failed previews.
- Open the source or GDA folder in your file manager, or copy its full path.
- Review persisted sync activity, including the individual files copied.
- Connect your own existing source and GDA folders under **Workspace settings**.

`Ctrl+K` (or `⌘K`) focuses search; `Esc` closes dialogs. Fonts, icons, and sample previews are bundled, so the application works offline.

## Workspace configuration

When you start the project with `python -m gda_sync` or `python scripts/dev.py`, it reads **`config/workspace.json`**. This contains the editable **Workspace settings** fields: `name` (project name), `source` (source folder), and `destination` (GDA destination). Saving settings in the app updates this same file; manual edits take effect on the next launch. The launcher prints the active configuration path.

For first use, copy the tracked template before launching:

```bash
cp config/config.json.template config/workspace.json
```

On Windows, use PowerShell:

```powershell
Copy-Item config/config.json.template config/workspace.json
```

Edit `config/workspace.json` with your project name and the absolute paths of two existing, separate folders. Windows paths can use forward slashes, for example `C:/Users/you/assets/source`. Invalid JSON or invalid settings stop startup with an explanation. **`config/workspace.json` is Git ignored** so each user's paths stay local; `config/config.json.template` is shared as the starting point.

If no project configuration exists, the first launch creates it from your previously saved workspace, or starts the Verdant demo for a new user. Generated demo settings also include an internal `demo` flag; omit it when configuring your own folders.

Standalone executables keep using `<app-data>/workspace.json` in the data directory below. Setting `GDA_SYNC_HOME` also uses `<GDA_SYNC_HOME>/workspace.json`, including when running from the project. For those launches, copy the same template to that location and edit it before starting.

## File behavior

Sync is one-way: source → GDA. Relative subfolders and original file bytes are preserved. File size and SHA-256 contents determine whether a destination matches. Copies use temporary files in the destination folder and an atomic rename. Source changes during copying are rejected. Existing destination files are backed up before replacement. Source files and extra GDA files are never deleted.

History, demo files, backups, and the configuration for standalone executables use these default data directories:

- Linux: `${XDG_DATA_HOME:-~/.local/share}/gda-sync/`
- Windows: `%LOCALAPPDATA%\GDA Sync\` (normally `C:\Users\<user>\AppData\Local\GDA Sync\`)

Both use this layout:

```text
<app-data>/
├── workspace.json          # Standalone executables / GDA_SYNC_HOME overrides
├── activity.json
├── demo/source/
├── demo/gda/
└── backups/<sync-id>/<relative-file-path>
```

The exact backup directory is displayed in settings. To restore a previous GDA version, copy the corresponding backup file back into the same relative location in your GDA folder. Set `GDA_SYNC_HOME` to use a different app data directory; `config/config.json.template` shows the configuration format. Source and destination must be existing, separate folders; nested roots are rejected, and symbolic links (and Windows junctions) are skipped. Hidden files and folders are skipped: names starting with `.`, and on Windows also items with the Hidden attribute. The demo supports up to 10,000 files per workspace.

DDS previews decode the first surface and mip of **DXT1, DXT3, DXT5, RGB24, RGB32, and DX10 BC7 (UNORM / sRGB)**. Other DDS formats remain available for syncing, with a clear preview-unavailable message. DDS previews are limited to 16 megapixels, and all previews to 64 MB. Demo model thumbnails are illustrations; arbitrary 3D files are copied but not rendered. Material/audio files use type thumbnails.

The server binds only to loopback. Write operations require a per-process session token; foreign hosts, cross-site browser requests, and request bodies over 128 KB are rejected. This is an app for a trusted local desktop, with no account or cloud service.

## Development

Requires Python 3.10+ (developed and tested with 3.12) and Node.js 20.19+ with npm (Node is only needed to build the interface).

```bash
python3 -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python scripts/build.py             # Build the Vue interface into gda_sync/static
python -m gda_sync                  # Start the backend and open the browser
python scripts/dev.py               # Vite dev server with hot reload + backend; the browser opens automatically
npm --prefix frontend run typecheck # Type-check the Vue code
pytest                              # Filesystem, sync, API, lifecycle, DDS/BC7, packaging and browser tests
python scripts/package.py           # Build the executable for the current OS into dist/
```

The build and development scripts run `npm ci` to install the frontend dependencies from the lockfile, including when `node_modules` already exists.

Browser tests need Playwright's Chromium once: `python -m playwright install chromium`. They run against the built interface in isolated temporary workspaces and verify offline rendering, search/filtering, DDS and BC7 previews, mobile layout, configuration, selected sync, full sync, persistence, session renewal, and application shutdown on page close. Screenshots are written to `build/preview-desktop.png` and `build/preview-mobile.png`. Run `pytest -m "not e2e"` to skip them.

### Standalone executables

```bash
python scripts/package.py                   # Linux: dist/gda-sync; Windows: dist\gda-sync.exe
python scripts/package.py --target windows  # On Linux: build dist/gda-sync.exe with Wine
python scripts/package.py --target all      # On Linux: both executables
python scripts/verify_package.py            # Test the executable for the current OS
python scripts/verify_package.py windows    # On Linux: test dist/gda-sync.exe under Wine
```

Executables are built with PyInstaller from `bundle/gda-sync.spec`, as one file with the built interface embedded. Add `--skip-frontend` to reuse an existing interface build. PyInstaller cannot cross-compile, so on Windows the executable is built natively with the active Python environment, and on Linux the Windows build runs a Windows Python under Wine:

- The Windows CPython (3.12.10, from nuget.org) is pinned by SHA-256, and its packages are pinned to the versions in your Linux environment.
- NumPy and Python 3.12 need Windows APIs that Wine implements from version 11. If the system Wine is older, the build downloads the official WineHQ 11.0 packages for Ubuntu 24.04 (pinned by SHA-256 from WineHQ's signed package index) and unpacks them without installing anything system-wide.
- These downloads, the Wine prefix, and the Windows Python are cached outside the project in `${XDG_CACHE_HOME:-~/.cache}/gda-sync-build` (override with `GDA_SYNC_BUILD_CACHE`). Later builds reuse them offline.

`verify_package.py` uses isolated app-data directories (and an isolated Wine prefix) and checks the first launch, demo, model and BC7 previews, sync and backups, persistence, refresh, and automatic process exit on page close. Windows verification on Linux uses Wine; a check on a real Windows desktop is still recommended before distribution.

### Launch options

```bash
./dist/gda-sync --no-open
GDA_SYNC_HOME=/path/to/app-data ./dist/gda-sync
PORT=4567 ./dist/gda-sync
GDA_SYNC_NO_OPEN=1 python scripts/dev.py
```

Launching a second instance reopens the running app on the same port. If another application occupies the port, GDA Sync exits with an explanation. With `--no-open`, the backend waits for its first page before the page-close shutdown applies. `PORT` applies to production; the development proxy expects the backend on 3456 and the Vite dev server on 5173.

On Windows, set environment overrides in PowerShell:

```powershell
$env:GDA_SYNC_HOME = 'D:\GDA Sync Data'
$env:PORT = '4567'
.\dist\gda-sync.exe --no-open
```

## Structure

```text
gda_sync/        Python backend: FastAPI app, workspace sync, page lifetime, DDS/BC7 decoders, demo generator
  static/        Built Vue interface (generated by scripts/build.py; embedded in executables)
frontend/        Vue 3 + TypeScript interface (Vite), Chart.js charts, and app styles
  src/theme/     StarAdmin template SCSS (Bootstrap 4), compiled with the interface
bundle/          PyInstaller specification and executable entry point
scripts/         Build, development, packaging, package verification, Ubuntu desktop installation
config/          Local startup workspace.json (Git ignored) and copyable config.json.template
tests/           Backend, API and lifecycle tests; tests/e2e has the browser workflow tests
build/           Generated screenshots and PyInstaller work files
dist/            Generated standalone Linux and Windows executables
```

| Module | Responsibility |
| --- | --- |
| `gda_sync/__main__.py` | Launcher: app-data location, port checks, single instance, opening the browser |
| `gda_sync/server.py` | HTTP API, local-only request guard, session token, embedded interface |
| `gda_sync/runtime.py` | uvicorn server that ends page streams before its graceful shutdown |
| `gda_sync/lifetime.py` | Page-lifetime event stream and the two-second close grace period |
| `gda_sync/library.py` | Scanning, hashing, safe paths, sync with backups, settings, activity, previews |
| `gda_sync/dds.py`, `bc7.py` | DDS parsing and NumPy-vectorized DXT/RGB/BC7 decoding |
| `gda_sync/demo.py` | Deterministic demo textures, DDS maps, models, materials, and audio |

DDS decoding follows Microsoft's [DDS header](https://learn.microsoft.com/en-us/windows/win32/direct3ddds/dds-header) and [block-compression](https://learn.microsoft.com/en-us/windows/win32/direct3d10/d3d10-graphics-programming-guide-resources-block-compression) documentation. The BC7 decoder and partition tables are adapted from [bcdec](https://github.com/iOrange/bcdec) under the MIT license; its copyright and license are retained in `gda_sync/bc7.py` and the bundled application. Regression vectors cover all eight BC7 modes, all partition patterns, channel rotations, and index selectors.

The interface uses the SCSS of the [StarAdmin Free Bootstrap Admin Template](https://github.com/BootstrapDash/StarAdmin-Free-Bootstrap-Admin-Template) by BootstrapDash (MIT), compiled against Bootstrap 4.6 with Material Design Icons and Roboto; `frontend/src/theme/staradmin/README.md` lists its few changes.

## Version history

Version 2.0.0 reimplements GDA Sync 1.1.0 in Python and Vue 3: FastAPI replaces Fastify, Vue replaces React, and PyInstaller replaces Node single-executable packaging. Features, HTTP API, and data files are unchanged; the interface is rebuilt on the StarAdmin Bootstrap template with a Chart.js dashboard. Small platform improvements: Windows opens folders through the shell API, skips Hidden-attribute files, and shows Windows paths in settings examples and copied file paths; the sidebar shows the actual operating system; Windows executables carry an icon and version information.
