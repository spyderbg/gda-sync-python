# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow the project's single-digit major.minor.build scheme.

## [Unreleased]

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

[Unreleased]: https://github.com/spyderbg/gda-sync-python/compare/releases%2Fv1.0.1...HEAD
[1.0.1]: https://github.com/spyderbg/gda-sync-python/commits/releases%2Fv1.0.1
