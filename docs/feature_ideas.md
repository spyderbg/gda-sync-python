# Feature ideas

Features that EGT GDA Sync could add next, found while building the recent ones: the view editor, image sequence
playback, the asset folders and the sync history. The three most useful come first. The first is done; the others are
not planned or started.

## Recommended first

### 1. Restore from backups (done)

Implemented as the **Backups** page; see [Backups](../README.md#backups) in the README.

Every sync, delete and view edit saves the replaced file in the backups folder, but the app has no way to bring one
back. A **Backups** page would list each operation (when, what, which workspace) with its files, and restore one file or
the whole operation. It makes every destructive action safe to undo, so it is the one to start with.

### 2. Which games use a shared asset

Before syncing or editing something in `../common`, show every workspace whose descriptors use it, so that a change meant
for one game does not quietly change the others. Today the app says that an asset is "common", but not who uses it.

### 3. Text in views

Text elements are only outlined. Their text styles (`RssTextStylesData.json`) name a font and a size, and the app already
reads fonts, so a view could draw a sample text at the right size and alignment. View previews would then look much
closer to the game.

## View editor

- Arrow keys move the picked element on the screen by 1 pixel, or 10 with Shift.
- Edit more than the position: scale, rotation, alignment, hidden and color, with the same number controls (click to type,
  Up and Down to step, drag to change).
- Select several elements and move them together, with snapping to other elements' edges and centres.
- Animate view cards while they are in view, not only in the details.

## Sync and history

- Compare two runs: which resources became in sync, newly different or missing between them.
- Keep only the last N reports of a workspace, or delete several reports at once.
- Watch the GDA folder and suggest a Rescan when its files change.

## Asset library

- Find unused ids: images and sequences that descriptors declare but no view or other entry references, to help clean
  up.
- Notice when the asset report is out of date, because files changed after the last Rescan.

## Settings

- Edit the global paths (`games_root_path`, `gda_root_path`) in Workspace settings, not only in `workspace.json`.
