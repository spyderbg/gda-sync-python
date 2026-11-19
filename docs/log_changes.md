# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow the project's single-digit major.minor.build scheme.

## [Unreleased]

### Added

- Add a working folder, `config.working_path` in workspace.json, where the app keeps its data from its next start, and a Global settings page, the gear on the Dashboard, that edits it

### Fixed

- Fill Burning Crown's info screen paytable: name its melon and crown figures as the RTF does, and show a tetra sub screen's wins in the tetra round

## [2.1.4] - 2026-11-19

### Added

- Make a movie of an image sequence in the Asset library, declared under its own RSS key

### Changed

- Let the view-layout skill change the layout values of a game's IData, and list changed IData files with the views
- Draw valpha movies' premultiplied colors as the C++ game does, in the Play page and the movie preview
- Let the game server deal random numbers up to a kernel's maxValue, and reply with the maxValue it dealt them to
- Performance optimizations ┌────────────────────────────────────────────────┬────────┬───────┬──────────┐   │                    command                     │ before │ after │ speed-up │   ├────────────────────────────────────────────────┼────────┼───────┼──────────┤   │ locate                                         │ 2.63s  │ 1.45s │ 1.8×     │   ├────────────────────────────────────────────────┼────────┼───────┼──────────┤   │ locate --search 0                              │ 7.90s  │ 1.89s │ 4.2×     │   ├────────────────────────────────────────────────┼────────┼───────┼──────────┤   │ locate --scales (6 extra scales)               │ 11.64s │ 2.54s │ 4.6×     │   ├────────────────────────────────────────────────┼────────┼───────┼──────────┤   │ locate, half-size preview, --search 0 --scales │ 6.09s  │ 1.58s │ 3.9×     │   ├────────────────────────────────────────────────┼────────┼───────┼──────────┤   │ locate --origin auto                           │ 3.46s  │ 2.11s │ 1.6×     │   ├────────────────────────────────────────────────┼────────┼───────┼──────────┤   │ draw --over --outline                          │ 2.93s  │ 1.61s │ 1.8×     │   ├────────────────────────────────────────────────┼────────┼───────┼──────────┤   │ draw --origin auto                             │ 5.10s  │ 2.56s │ 2.0×     │   └────────────────────────────────────────────────┴────────┴───────┴──────────┘
- Cache decoded view-layout DDS images and default to Haiku
- Compose view layers as pixels for the view-layout skill
- Make the GDA folder optional for workspaces
- Speed up DDS previews with Pillow and entity tags
- Document why the browser Play page shows "not ported yet"
- Sync modules configs into the browser game
- Show workspace icons and rename Nordic Rush to Nordic Tale
- Rename Nordic Rush to Nordic Tale
- Sync hold and spin reel setup and Nordic Tale shields from C++
- Let view-layout change IData layout values
- Make movies from image sequences and time the game on the Clock
- Port the C++ kernel random bits, game pause and input timing to the browser game
- Port the C++ numeric bars, sounds and expanding wilds to the browser game
- Port the C++ replay numbers and button touch areas to the browser game
- Match C++ tetra win values and Automation round counts import

### Fixed

- Draw the browser game's rounds from the kernel's numbers as the C++ game does: bit queue, hat distribution, 32 a request
- Cap a browser game round before its outcome, as the C++ integrations do
- Hold the browser game still on pause: its state machine, its player input and its sounds, as the C++ PauseMonitor does
- Keep a pressed button for 210 ms of game time, ignoring taps meanwhile, as the C++ ButtonElement does
- Drop a state's queued events once the states that react on them are gone, as the C++ state machine does
- Round bets per line and per sub screen down, as the C++ integer division does
- Expand the wilds of Burning Hot Coins and Zodiac Wheel Coins with their animation and sound
- Play the scatter and expanding wild reel stop sounds in Burning Hot Coins, Zodiac Wheel Coins and Burning Crown
- Count the win, credit and coins bars as the C++ numeric bars do, posting the same done events
- Play the change bet, autoplay and take win sounds of the browser game's bars
- Mix the browser game's sounds by the audio design's polyphony groups and the configured volume presets
- Place elements from dummies with only what the dummy sets, including its pivot, alignment and color
- Play image sequences and movies frame for frame as the C++ game does: rewind, loop frame, repeats and auto start
- Write coins as coins in the bet bar and the status line
- Bind Zodiac Wheel Coins' responsible gaming button, and post the status line's events
- List the browser game's languages in the C++ integrations' order, with English as the default
- Take a button's touches in its touch area from its position, or where its image was drawn, with circle and ellipse areas
- Save a round's replay as the values it drew, and recover it unchecked, so that changed math calculates it again
- Keep Burning Crown's tetra sub screen wins when the tetra view hides, hiding them at the next spin, as the C++ does
- Import an Automation CSV's empty RoundRngCounts as no counts, and read the counts as the C++ from_chars does

## [2.1.3] - 2026-11-10

### Added

- Add model selection to View layout runs

### Changed

- Stop view-layout runs when execute conditions fail, and draw its report as Markdown
- Replace view-layout follow toggle with logs switch
- Show the model Claude Code reports for view-layout runs

## [2.1.2] - 2026-11-10

### Changed

- Trace view-layout helper calls and show hidden elements

## [2.1.1] - 2026-11-10

### Changed

- Let view-layout hide elements the preview leaves out

## [2.1.0] - 2026-11-10

### Added

- Add an Open file in VS Code action beside file paths in the Asset library and Sync details.
- Give declaration entries Copy path, Open folder and Open file actions, and use the same order for file paths.
- Move resource keys and their rename actions into a Resource Key section above Loaded by in asset details.
- Add View layout after Tools: upload a preview, run Claude Code's view-layout skill for the selected workspace, and follow its complete execution output and final report.
- Show a spinner beside View layout while it runs, including when another page is open.
- Add rescan action to workspace cards
- Add view-layout skill for placing game views from a preview
- Add multi-select to the image studio asset list
- Add screenshots of the browser game's screen
- Add View layout page and declaration file actions

### Changed

- Split game stats from the developer panel
- Run /game-sync headlessly from the Play page's Port with Claude Code
- Sync hold and spin outro, free round rewards, and Burning Crown tetra theme
- Write amounts and cut image fonts as the C++ game does
- Sync Burning Crown's theme element suffixes from ThemeType
- Rework image studio layout with folder picker and animation player
- Rework image studio layout, navigation, and folder picker
- Move image metadata to the app-data store and rename analysis to Describe
- Put render scale label on its own row in image studio
- Show the game clock's speed on the Play page panel
- Use OffscreenCanvas for movie frame WebGL

### Fixed

- Preserve the expired-session response for large screenshot uploads so the browser can renew its session and save the image after a backend restart.

## [2.0.1] - 2026-11-05

### Changed

- Port Zodiac Wheel Coins and make views override SetTheme

## [2.0.0] - 2026-11-04

### Added

- Added .idea ocnfigurations
- Add full-page Image studio with remote models and metadata browser
- Add retry and regeneration actions to Image studio queue
- Add element visibility toggles and multi-select to view preview
- Add browser game server, Game tools page and Tetra panel layouts

### Changed

- Retain each image generation result and add render scale shortcuts
- Persist image job configurations and add queue cleanup
- Port Burning Crown tetra views into the main background and knobs views
- Port the RNG Presets, RNG Picker and Automation debug tools to the browser game
- Move selected view elements with arrow keys
- Keep the browser game playing while other pages show
- Move game tools into a Tools page and port Tetra panel layouts
- Sync rule: only interfaces go in the runtime
- Drive view looks from a shared theme

### Fixed

- Fixed build issues

## [1.0.1] - 2026-10-29

### Added

- Add docs for the upcomming features
- Add the report command and guard development mode against occupied ports
- Added image comparision algorithm spec
- Add views as an asset type compared with the GDA
- Add global workspace paths and asset report folders
- Add a Backups page that lists and restores replaced and deleted files
- Add feature ideas for the next work
- Add copy button for expanded workspace folder paths
- Add game file stamps API and browser view file watch
- Add image metadata studio with analysis and generation queue
- Add a detailed pixel compare of the game and GDA images - the resource details dialog's "Detailed image compare" button opens a stacked   dialog with the game image, a difference heat map and the GDA image, for the   resources whose game and GDA files are both previewable images - imageDifference.ts compares the images' pixels at their native size, aligned   at the top left: the RGB channels scaled by alpha, the alpha itself, and the   pixels outside the smaller image count as differences; invisible RGB does not - the tolerance slider ignores the differences up to its value; the heat map   shows the rest from dark blue through cyan, yellow and red, and the dialog   reports the changed pixels, their percentage and the maximum difference, and   can zoom to the differences' bounds - the three views zoom and scroll together: drag with the left mouse button to   move them and scroll the wheel to zoom at the pointer, keeping the pixel   under the pointer in place - only the top dialog handles Escape and traps the focus, so the compare   dialog closes on its own and the details dialog stays behind it; the details   dialog's arrow keys do not choose another candidate while comparing - tests for the heat map, the tolerance, the alpha and invisible pixels, the   different image sizes, the mobile layout, the mouse pan and zoom and the   failed preview
- Add game sync docs and Claude command, update README
- Added increment\_version.py script
- Add version release script and documentation

### Changed

- Initial commit: GDA Sync 2.0.0
- Rebuild the interface on StarAdmin with a dashboard, and read settings from config/workspace.json
- Always install frontend dependencies from the lockfile
- Initial version of the project
- Load and save workspace settings beside the executable
- Rename the configuration template to workspace.json.template
- Read the backend port from workspace.json
- Document how the application is built and runs
- Rename the project to EGT GDA Sync and support multiple workspaces
- Simplify the navigation: title bar, workspace list, and left off-canvas sidebar
- Rename the app to EGT GDA Sync and rework the navigation
- Compare the game resources with the GDA folder and stop development sessions
- Document the Vue views in the README
- Latest GDA change
- Show workspace settings in sync history and include them in reports
- Sync report resources to the Game folder from a new Sync page
- Merge the sync actions into the workspace header and keep report order
- Compare image sequences as one resource and list supplementary files
- Show the details of a sync report resource in a dialog
- Update HOW\_IT\_WORKS.md to the egt\_gda\_sync names and the GDA sync
- Update implementation and add workspace/RSS tests
- Apply remove and delete actions to report resources and browse the game folder in the library
- Generate an asset report of the game and show it in the asset library
- Describe fonts in reports and draw them with their names, samples and coverage
- Read RTF projects as folders: compare and sync them with the GDA and draw their pages
- VS Code launcher
- Match images by their contents and report their probabilities and possible matches
- Open declarations in VS Code and choose GDA images in the details dialog
- Hide models and materials from sidebar asset categories
- Show selected views together drawn on one screen
- Changed workspace tempalte
- Update default workspace and GDA root path in template
- Split textures into images and image sequences in the library
- Rename Views section to ElementsList in the library
- Play image sequence Anims in view details
- Move view elements in the Asset library details and save them
- Wait for the file details before choosing another GDA image in a test
- Draw a sample text in the Text elements of view previews
- Organize the backend into subpackages and add build validation
- Reload the development backend on Python changes
- Open the app in a new window of the default browser
- Open the app in the open browser by default
- Declare an undeclared asset from its details
- Edit text files and remove assets in the asset library
- Match and preview movies in the asset library and GDA sync
- Show the status note in the details dialog header
- Confirm removal of assets that views use
- Export the backend OpenAPI spec to docs/openapi.yaml
- Save full-size text files in the asset library
- Move assets and rename RssKeys with a preview and undo
- Move operation in progress
- Build every target the host can package by default
- Play the game in the browser and export it to C++
- Watch descriptor files and read them again when they change
- Move .venv exclusion to egt-gda-sync module
- Move assets issue
- Move ImageSeq asset test
- Import game sources through a @game alias
- Open a transition's TypeScript and an export's files in VS Code
- Port alpha family states statement for statement from C++
- Import the C++ game sources' changes into the TypeScript
- NordicRush game integration in progress
- Refactor alpha family match/reel/tetra flow and view/bet handling
- Arrange image compare controls in a responsive grid
- Import Burning Hot Coins and its coins, wheel and gamble rounds
- Split tetra background and knobs into their own views, made with the main views
- Import Nordic Rush's rounds and views from C++
- Import Joker Reels Coins 10 from C++
- Reload views' configs when their IData files change
- Select workspaces from Dashboard cards instead of the sidebar
- Open workspaces on the Asset library and move Sync after Assets and Game
- Navigation bar separate scroll

### Removed

- Delete GDA sync reports from the Sync history
- Delete the folders that removing an asset leaves empty

### Fixed

- Fixed UI to ease the selection for multiple GDA image options
- allow library-use text to wrap

[1.0.1]: https://github.com/spyderbg/gda-sync-python/commits/releases%2Fv1.0.1

[2.0.0]: https://github.com/spyderbg/gda-sync-python/compare/bcc8e72fbea42ef9f2734ac4f19449a58a181f26...releases%2Fv2.0.0

[2.0.1]: https://github.com/spyderbg/gda-sync-python/compare/37fde72c2901ec00705046600289159176ef672a...releases%2Fv2.0.1

[2.1.0]: https://github.com/spyderbg/gda-sync-python/compare/dad723a9d3be93ab740d559bc4e65994b9634ece...releases%2Fv2.1.0

[2.1.1]: https://github.com/spyderbg/gda-sync-python/compare/1756283f6b40e3f9ffee3d0064a871284e0845ab...releases%2Fv2.1.1

[2.1.2]: https://github.com/spyderbg/gda-sync-python/compare/cbd2d0ea24898107ff7b0c73bfcca7980a56718f...releases%2Fv2.1.2

[2.1.3]: https://github.com/spyderbg/gda-sync-python/compare/1eb00518a15d1689470da5aa7f30b123de52d0d2...releases%2Fv2.1.3

[Unreleased]: https://github.com/spyderbg/gda-sync-python/compare/releases%2Fv2.1.4...HEAD
[2.1.4]: https://github.com/spyderbg/gda-sync-python/compare/7fe352b445ec13fc3250fe7ab4bcf2c1bccce665...releases%2Fv2.1.4
