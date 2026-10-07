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

The app opens on the **Dashboard**, with a short guide to selecting a workspace, comparing its resources, and copying updated GDA files to the Game folder. Its totals, trend lines, charts, and file lists combine the GDA folders of every configured workspace, each file compared with the Game folder's file at the same relative path: GDA changes and synced files over time (1D, 1W, 1M, or all), the file-format mix, storage per workspace and folder, sync coverage per asset type, files waiting for sync, the largest assets, recent changes, and sync activity. Inspecting a file opens its owning workspace. Unavailable workspace folders or files are listed beside the statistics.

Launching without an existing workspace configuration creates the **Verdant** workspace with 18 real sample files: textures, DDS maps, OBJ models, materials, and audio. Five assets are new, three are modified, and ten are already in sync.

- Browse the game's resources in the **Asset library**: its **Rescan** writes an asset report of the Game path, and the library shows the newest one. Search paths, ids and sequences, and filter by type or status.
- Switch between grid and list views.
- Click an asset to open its details: a large preview, the descriptor entries that load it, its metadata, and its path.
- Sync on the **Sync** page: select resources of the GDA sync report and choose **Sync selected**, sync an individual resource, or **Sync all pending**, then review and confirm the copy.
- Use **Rescan** on the Sync page after editing a GDA file to compare the game with the GDA again and retry any failed previews.
- Open the GDA or Game folder in your file manager, or copy a file's full path.
- Review the sync history: the workspace's settings, then a card for every GDA sync run with its result, counts and what changed since the previous run, and every copy to the Game folder, including the individual files copied.
- Connect your own source and GDA folders under **Workspace settings**, which warns when a folder does not exist.

`Ctrl+K` (or `⌘K`) focuses search; `Esc` closes dialogs. Fonts, icons, and sample previews are bundled, so the application works offline.

## Workspace configuration

When you start the project with `python -m egt_gda_sync` or `python scripts/dev.py`, it reads **`config/workspace.json`**. Global ports live in the `config` section. The `workspaces` list contains `game_name` (game name), `gda_path` (GDA folder, the origin of a sync), and `game_path` (game folder, where files are copied to) for each workspace. Saving settings in the app updates this same file; manual edits take effect on the next launch. The launcher prints the active configuration path.

For first use, copy the tracked template before launching:

```bash
cp config/workspace.json.template config/workspace.json
```

On Windows, use PowerShell:

```powershell
Copy-Item config/workspace.json.template config/workspace.json
```

Edit each workspace in `config/workspace.json` with your project name and the absolute paths of two separate folders. Configure or remove the template's example entries; until you do, the app still starts, lists no assets for them and warns in **Workspace settings** that the folders do not exist. Windows paths can use forward slashes, for example `C:/Users/you/assets/source`. Invalid JSON or invalid settings (for example a relative path, nested folders, or a path that is a file) stop startup with an explanation. Folders that do not exist, such as an unplugged drive, do not. **`config/workspace.json` is Git ignored** so each user's paths stay local; `config/workspace.json.template` is shared as the starting point.

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

Each workspace needs a unique, non-empty ID and two separate folders. Restart after editing the list. The sidebar Workspace selector loads this list and saves the active selection; Workspace settings edits only the selected entry. Older files using `name`, `source`, `destination`, `activeWorkspace`, and top-level ports still load. In those files `source` is the folder files are copied from and `destination` the folder they are copied to, so they keep their direction. Saving a workspace list writes the new field names and nested `config` section.

The optional `config.port` field sets the backend's listening port, for example `"config": { "port": 4567 }`. The template uses `3457`; files without this field use `3456`. The `PORT` environment variable supplied when launching the app overrides the value in `workspace.json`, for example `PORT=5678 ./dist/egt-gda-sync`. Ports must be integers between `1` and `65535`. Launch overrides apply for that run and leave the configured port intact; saving Workspace settings also preserves it. Restart the app after changing its configured port.

The optional `config.vite_port` field sets the development UI port used by `python scripts/dev.py`, for example `"config": { "vite_port": 5174 }`. The template uses `5174`; files without this field use `5173`. `VITE_PORT` overrides it for one launch, for example `VITE_PORT=5175 python scripts/dev.py`. It follows the same port validation and is preserved when saving Workspace settings. The Vite and backend ports must be different.

If no project configuration exists, the first launch creates it from your previously saved workspace, or starts the Verdant demo for a new user. Generated demo settings also include an internal `demo` flag; omit it when configuring your own folders.

### GDA sync

**Rescan** also starts the GDA sync for the selected workspace in a background process. It answers one question: for every resource of the game, does the GDA folder hold an identical copy? It never changes a file. The rules are those of `docs/rss_sync/gda_sync.py`, described in `docs/rss_sync/sync.md`. It reads the `*Data.json` descriptors in `game_path` and compares every file there, plus the shared files the descriptors name. A GDA file matches by file name, in any folder, and by SHA-256. A DDS file that differs only in its mip levels also counts as in sync. Only a file inside `game_path` is reported missing: a shared file outside it (for example in `../common`) without a GDA file of the same name is left out of the report and not counted as compared.

An image sequence (an entry of `imagesSeq`) is one resource. Its frames, usually a `{N-M}` range such as `osnovna_left_{00-70}.dds` for the files `osnovna_left_00.dds` to `osnovna_left_70.dds`, are compared file by file, and the sequence takes the status of its files: **different** if any file differs, otherwise **invalid**, **missing** or **in sync**, in that order, with a count such as `different SHA-256 (2 of 71 files)`. Its frame files are not reported again on their own, unless another descriptor entry declares them too.

A file in `game_path` that no descriptor (and no `resource_paths` entry) declares is **supplementary**: the game does not load it, so it is listed but not compared with the GDA, and it does not count as compared or as not in sync. Only files with a compared extension are listed. Supplementary images in one folder named `<name><number>.<ext>`, with the same name and extension and at least five numbers in a row, are guessed to be an image sequence, for example `osnovna_left00.dds` to `osnovna_left70.dds` as `osnovna_left{00-70}.dds`. A guessed sequence has no id and plays with `frameTime` 50 and `loopCount` 0; a gap in the numbers starts another sequence, and numbered files that are not images, such as sounds, stay on their own. Open **Sync → In sync** to see the result: resources in sync, missing from the GDA, different, declared but invalid, or supplementary.

On the **Sync** page, each resource of the report that has an action can be selected, and the main button applies the action of each selected resource by its status: a **different** resource is synced (its closest GDA file is copied over the game file), an **invalid** one has its declarations removed from the `*Data.json` descriptors that declare it (each entry, image sequence, or audio sample that names it; an audio event left without samples goes as a whole), and a **supplementary** one is deleted from `game_path`, a guessed sequence with all its files. A **missing** resource has no action, nor does an invalid one that only `resource_paths` declares. Without a selection the button syncs every different resource. A descriptor is edited as text, so its indentation, line endings, and key order stay as they are, and the result must still be a valid descriptor. Every replaced game file, changed descriptor, and deleted file is saved in `backups/` first, and the GDA sync then compares again. The report can be out of date, so an invalid resource whose file exists now, or a supplementary file that a descriptor declares now, is left alone.

The sync treats `game_path` as `<resources folder>/<game>` and `gda_path` as the game's GDA folder. Each workspace can also set these optional fields:

| Field | Default | Meaning |
| --- | --- | --- |
| `common_gda_path` | none | GDA folder for the shared files under `<resources folder>/common`. A relative path is resolved against the folder of `workspace.json`. |
| `extensions` | `[".csv", ".dds", ".ini", ".mov", ".png", ".rtf", ".ttf", ".wav"]` | File extensions to compare. |
| `resource_paths` | `[]` | Extra paths to check, relative to `game_path`. |
| `ignore_dds_mips` | `true` | Count DDS files that differ only in mip levels as in sync. |

Every run saves its own report as `<app-data>/sync-reports/<workspace id>-<Unix timestamp>.json`, named with the epoch seconds when the run finished, for example `joker_reels_coins_10-1791195194.json`. Earlier reports are kept, and their names sort by time; runs that finish within the same second add `_2`, `_3`, and so on. A report describes only the run that wrote it. Its `workspace` holds the exact workspace settings the run used, so it stays accurate after `workspace.json` changes, and its `run` holds the state, start and finish times, and any error. A successful run's report adds the JSON form of the script's `sync_report.md`: the folders and extensions used, then `descriptors`, the `*Data.json` files it parsed with how many resource paths each declares (and how many files those name once `{N-M}` ranges are expanded), then the summary and the resources that differ, plus the files in sync. An image sequence's row has a `sequence` with its `id`, `frameTime`, `loopCount`, `loopTo`, its frame paths and every frame with its status, GDA files and `source` rectangle; its `resource` is the first frame path. Each resource's `requiredBy` lists every entry that declares it with its `descriptor`, `line`, entry `type` and `id`, and a `Font` entry's `chars` and `size`. [Report versions](#report-versions) lists which version of the format added what. A failed run's report holds only that, and the app keeps showing the last successful result. **Sync → Sync history** shows the workspace's settings and a card for every report file of the workspace, newest first, one run each. Reports are never deleted automatically, so remove old ones when the folder grows too large. Reports named with a UTC date (`…-20261005T101314Z.json`) by an earlier version are read in time order with the others, and a report saved before names had a timestamp is read as the oldest.

To create reports without starting the app, use the `report` command. It reads the same `workspace.json` as the app, runs the GDA sync in the terminal, and saves each report where the app reads it, so the next launch shows the result and the run in Sync history:

```bash
python -m egt_gda_sync report                       # the default workspace
python -m egt_gda_sync report joker_reels_coins_10  # the listed workspaces
python -m egt_gda_sync report --all                 # every workspace
./dist/egt-gda-sync report --all                    # the same with the packaged executable
```

It prints one summary line per workspace and the path of its report. The exit status follows `gda_sync.py`: `0` when every compared resource is in sync, `1` when differences exist (supplementary files are not differences), and `2` when a sync could not run, for example because of an unknown workspace id or a missing `*Data.json` descriptor. Avoid running it for a workspace while the app is syncing the same workspace: whichever finishes last overwrites the other's report.

### Asset reports

The **Asset library** shows the newest asset report of the selected workspace, which its **Rescan** writes as `<app-data>/asset-reports/<workspace id>-<Unix timestamp>.json`, named like a GDA sync report. It is an inventory of the game without a comparison with the GDA folder, and takes about a second, since it only reads the descriptors and the files' sizes and image headers. It lists every file that the `*Data.json` descriptors (or `resource_paths`) declare, with the descriptor, line, entry type (`Image`, `ImageSequence`, `Font`, `AudioEvent`, `RawFile`…) and id of each entry that loads it, and the files of `game_path` with a compared extension that nothing declares. Each asset is **available** (declared, and the file exists), **missing** (declared, but the file does not exist), **invalid** (the declared path leads outside the resources folder), or **supplementary** (not declared). Image sequences follow the GDA sync: a sequence is one asset with its frames, it takes the first of invalid, missing and available that any of its files has, with a count such as `missing: source file does not exist (1 of 3 files)`, and supplementary numbered images are guessed to be sequences. A report holds `version`, the `workspace` settings it used, the parsed `descriptors`, a `summary` with the run's state and times and the counts of assets by status and type and their total size, and the `assets`.

Fonts (`.ttf`, `.otf`) are an asset type of their own. The report reads a font's format, family, style, version, and glyph count from the file, and for each `Font` entry that declares it, checks the entry's `chars` (ranges such as `[U+0020-U+00FF][U+20AC]`) against the font's character map: its `coverage` holds how many of the declared characters the font has and the first ones it misses. Control characters and unassigned code points are not drawn, so they are not checked. A `Font` entry of a bitmap font (a PNG atlas) keeps its `chars` and `size` without a check. GDA sync reports also list each declaring entry's type and id, and a `Font` entry's `chars` and `size`, so the Sync page can check both versions of a font. A game without descriptors has only supplementary assets. A report that cannot be generated, for example because of a malformed descriptor, is an error, and the library keeps showing the newest one.

### Report versions

Each report file holds the `version` of the format that wrote it. The app reads every earlier version, but a feature appears only once a **Rescan** writes a report of the version that added it. After updating the app, rescan each workspace once on both pages.

#### Sync report

GDA sync reports are at version 4. The Sync page's **Rescan** writes a new one.

| Feature | Added in version | With an older report |
| --- | --- | --- |
| Each declaring entry's `type` and `id` in `requiredBy`, shown in **Declared in** | 4 | Only the descriptor and line. |
| A `Font` entry's `chars` and `size` in `requiredBy`: the Sync page checks the game and GDA fonts against the declared characters | 4 | No character check; a font's details say to Rescan. |
| An image sequence as one row with its frames: sequence cards and their playback on the Sync page | 3 | Each frame file is a row of its own, so counts in **Sync history** drop once at the first version 3 run. |
| The run's settings kept only in `workspace` | 2 | Version 1 also repeats them at the top level. |

#### Assets report

Asset reports are at version 2. The Asset library's **Rescan** writes a new one.

| Feature | Added in version | With an older report |
| --- | --- | --- |
| Fonts as their own type, in the **Fonts** section | 2 | `.ttf` and `.otf` files are other files; the library notes that the report is out of date. |
| A font's format, family, style, version, glyph count and the samples it draws | 2 | No font facts in the details. |
| Each `Font` entry's `coverage` of its declared characters: missing-character warnings and marks | 2 | No character check. |
| The game's asset inventory, shown in the **Asset library** | 1 | — |

Drawing a font with itself, in cards and specimens, needs no particular report version: the font file brings its names and samples when it is drawn.

### Packaged applications

**Packaging copies `config/workspace.json` to `dist/workspace.json`**, beside `egt-gda-sync` or `egt-gda-sync.exe`. Configure the source file before running `python scripts/package.py`. Each packaging run refreshes the copy. Distribute or move the executable and this configuration together, and adjust folder paths for the destination machine. Both targets share `dist/workspace.json` when building with `--target all`.

The packaged application always loads `workspace.json` beside the actual executable, even when launched from another folder or through a symlink. Saving Workspace settings updates that same file; manual edits take effect on the next launch. The launcher prints the active configuration path. Invalid JSON or invalid folders stop startup with an explanation.

`EGT_GDA_SYNC_HOME` controls the data directory. For project launches it also selects `<EGT_GDA_SYNC_HOME>/workspace.json`; packaged executables continue to use the configuration beside them. If a packaged configuration is missing, the app recreates it from saved settings or a new demo. The executable directory must be writable to save settings.

## File behavior

Sync is one-way: GDA → Game (`gda_path` → `game_path`). Relative subfolders and original file bytes are preserved. File size and SHA-256 contents determine whether a Game file matches. Copies use temporary files in the Game folder and an atomic rename. GDA changes during copying are rejected. Existing Game files are backed up before replacement. GDA files and extra Game files are never deleted. Earlier versions copied the other way, from `game_path` to `gda_path`: check the direction before syncing with a configuration written by one of them.

History, demo files, and backups use these default data directories:

- Linux: `${XDG_DATA_HOME:-~/.local/share}/egt-gda-sync/`
- Windows: `%LOCALAPPDATA%\EGT GDA Sync\` (normally `C:\Users\<user>\AppData\Local\EGT GDA Sync\`)

Both use this layout:

```text
<app-data>/
├── workspace.json          # Legacy settings / project EGT_GDA_SYNC_HOME overrides
├── activity.json
├── dev.json                # Processes of a running scripts/dev.py session
├── sync-reports/<workspace-id>-<unix-timestamp>.json
├── asset-reports/<workspace-id>-<unix-timestamp>.json
├── demo/gda/               # The demo's GDA folder: where its files are copied from
├── demo/game/              # The demo's game folder: where they are copied to
└── backups/<sync-id>/<relative-file-path>
```

The exact backup directory is displayed in settings. To restore a previous Game version, copy the corresponding backup file back into the same relative location in your Game folder. Set `EGT_GDA_SYNC_HOME` to use a different app data directory; `config/workspace.json.template` shows the configuration format. The GDA and Game folders must be separate; nested roots are rejected. A folder that does not exist does not stop the app: Workspace settings warns about it, no assets are listed for a missing GDA folder, and syncing or opening a missing folder is refused until it exists (the app never creates a folder itself). Symbolic links (and Windows junctions) are skipped. Hidden files and folders are skipped: names starting with `.`, and on Windows also items with the Hidden attribute. The demo supports up to 10,000 files per workspace.

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

Start the Vite dev server with hot reload and the backend. The browser is **not** opened automatically; open the development UI (the Vite port, e.g. **http://127.0.0.1:5174**) in your browser:

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

## Vue views

The interface has five page views in `frontend/src/views`:

| Vue file | Purpose |
| --- | --- |
| [DashboardView.vue](frontend/src/views/DashboardView.vue) | Project usage guide and combined statistics, charts, and file lists for all configured workspaces. Inspecting a file selects its owning workspace. |
| [AssetsLibraryView.vue](frontend/src/views/AssetsLibraryView.vue) | The sidebar's **Asset library** (`library`). Shows the newest asset report of the workspace (`GET /api/asset-report`), which its **Rescan** writes (`POST /api/asset-report`): the report file, its counts by status (which filter the assets when clicked), and the Game path, then the assets in grid or list form as [AssetCard.vue](frontend/src/components/AssetCard.vue) cards, with status filters, search by path, entry id or sequence, and the sidebar's type filters. A card shows the asset's preview, name, folder, size, status and the entries that load it; an image sequence plays its frames. Clicking an asset opens [AssetDetails.vue](frontend/src/components/AssetDetails.vue), a dialog like the Sync page's resource details: a large preview, what the status means, the descriptor entries that load the asset, its game path with buttons to copy it or open its folder, and its format, size, resolution, pixel format, mip levels and modification time; a sequence also shows how it plays and each frame. A font is drawn with itself, with each Font entry's declared characters, the ones it misses marked, its names and glyph count, and a card warns when a font misses declared characters. Escape closes the dialog. Inspecting a file on the Dashboard opens the library with a search for its name. |
| [SyncView.vue](frontend/src/views/SyncView.vue) | The sidebar's **Sync** page (`pending`). Shows only the workspace's latest successful GDA sync report, never the library scan. Opens with the workspace section (name, the report file, the report's compared, not-in-sync, in-sync and supplementary counts, and the GDA and Game folders), then lists the report's **Different**, **Missing**, **Invalid** and **Supplementary** resources in report order as [ResourceCard.vue](frontend/src/components/ResourceCard.vue) cards, in the look of the Asset library's cards: the game file's preview, name, folder and the report's status, with status filters, search, and buttons to copy the game path or GDA path. A **Different** resource spans the row and shows each GDA file with its name as a card beside it, closest folder first; the first is the one Sync copies. An image sequence is one card that plays its frames with [SequencePreview.vue](frontend/src/components/SequencePreview.vue): a frame every `frameTime` milliseconds, `loopCount` times (`0` repeats forever), each loop after the first starting at frame `loopTo`, showing only the `source` rectangle of a frame that has one. Its frames load when the card comes into view, and it plays only while in view; clicking the preview plays it again from the first frame. The card lists the sequence's files that are not in sync, and a **Different** sequence plays its GDA frames beside it. Clicking a card, or its details button, opens [ResourceDetails.vue](frontend/src/components/ResourceDetails.vue), a dialog like the Asset library's asset details: a large preview, beside the GDA file's when the GDA has one, what the status means, where the resource is declared, its game and GDA paths with buttons to copy them or open their folders, and the format, size, resolution, pixel format, mip levels and modification time of the game and GDA files side by side, with values that differ in red. An image sequence plays in the dialog, with its frame time, loops, the duration of one loop, the totals of its files and the status of each frame. **Sync this resource** asks to sync it, and Escape closes the dialog. The file details come from `POST /api/rss-sync/details`, which reads only files inside the workspace's resources and GDA folders. The check box of a card with an action selects it; a **Missing** card has none. Previews come from `GET /api/rss-sync/preview`, which serves only image, audio, and font files inside the workspace's resources and GDA folders. A font is drawn with itself by [FontPreview.vue](frontend/src/components/FontPreview.vue): a card shows "Aa" and a line of text once it scrolls into view, and offers to load a font larger than 2 MB instead of loading it; the details dialog is a specimen: the font's family and style, its alphabets and digits, a sample of each writing system it can draw (Latin Extended, Cyrillic, Greek, Arabic, Hebrew, Thai, Japanese, Chinese, Korean) and its currency signs, a waterfall of text to type from 12 to 72 px with the declared size marked, and each declared range, with the characters the font misses marked. The preview response's `X-Font-Facts` header names the samples the font can draw, so a card shows the font's own writing system. A different font shows the game and GDA versions side by side with the same text, and the table compares their names, glyph counts, and how many of each `Font` entry's characters they have, from `POST /api/rss-sync/details` with the entries' `chars`. **Sync all pending**, and **Sync selected** for a selection of **Different** resources, copy the closest GDA file of each, or of each different frame of a sequence, over the game resource (`POST /api/rss-sync/copy`), back up the replaced file, and start a new comparison. For other selections the button reads **Remove declarations** (**Invalid**), **Delete selected** (**Supplementary**), or **Apply to selected** (several statuses), and a confirmation lists the resources by action before `POST /api/rss-sync/apply` applies them. Each resource is sent with the status it was selected with, and one that a newer report gives another status is refused. The sidebar's Sync badge counts the report summary's resources that are not in sync. Without a report it shows only a notice and Rescan. |
| [SyncInProgressView.vue](frontend/src/views/SyncInProgressView.vue) | The sidebar's **In sync** page (`rssSync`). Displays the resource comparison report with **In sync**, **Missing**, **Different**, **Invalid**, and **Supplementary** categories, scan progress, matching GDA paths, descriptor references, and DDS mip-level differences. An image sequence is one row with its id and how it plays, and its GDA files are summed up by folder. |
| [SyncHistoryView.vue](frontend/src/views/SyncHistoryView.vue) | Shows the workspace's settings and one card per saved report: its success or failure, duration, counts, and count changes between runs. Also lists file-copy operations, the files copied, and bytes transferred. |
| [SettingsView.vue](frontend/src/views/SettingsView.vue) | Configures the workspace name, GDA folder, and Game folder. Shows backup information and provides the stop-application action. |

[App.vue](frontend/src/App.vue) switches pages using `ui.view` from [workspace.ts](frontend/src/workspace.ts), without Vue Router. **AssetsLibraryView** browses the game's files; **SyncView** lists the report's resources that are not in sync and copies them; **SyncInProgressView** displays comparison results without changing files.
