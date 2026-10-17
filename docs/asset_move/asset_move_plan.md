# Move resources and rename RssKeys on one engine

## Context

Games use files from other games' folders. In the real data, `burning_crown_tetra_spins_10` declares 2 files from `../joker_reels_coins_10` (`Loading_screen_JR.dds`, `Topper_JR.dds`) in 5 entries: 3 `Image` entries in `RssImagesData.json` and 2 `RawFile` entries. That happened because it was cloned from joker. If joker's folder ever changes, burning_crown breaks. The common folder is fine to use. The app has no way to fix this today.

The user also wants to rename an RssKey everywhere it is used. The real data shows keys are named in far more places than views:
- views: `rssKey`, `rssKeys`, `rssStyleId`
- idata files: `rssId`, `imageId`, `soundId`, `resId`, `*RssKey`, `*SoundId` (135 references in `idata/`)
- text styles: `font_id`
- common feature views, which use keys the game declares (for example `STYLE_NOTO_BOLD`)
- game code, which the app cannot see (for example `IMAGE_LOADING_SCREEN_MAIN`, which no file in the game names)

**What both have in common:** each one changes the identity of a resource (a file path or a key) and must update every reference to it, consistently, with checks, a preview and an undo. So the recommendation is one engine with two operations on top:

1. **Reference index:** every place a path or a key is named, with its exact span in the file's text.
2. **Change plan:** file operations plus text edits, checks (blockers and warnings), and a fingerprint of the files it read. It is computed as a dry run and shown as a preview.
3. **Apply:** recompute the plan, check the fingerprint, then copy, edit and delete in a safe order, with one backup that can be restored.

Decisions taken:
- **Common folder files are never edited.** Any change that would need one is blocked, and the preview explains why and lists the games that include the file.
- **Order:** Phase 1 is the engine plus move. Phase 2 is RssKey rename.

## Phase 1: engine and move

### 1. Report: tell another game's folder apart from common
`egt_gda_sync/workspace/asset_report.py`:
- **Asset scope** (the `scope()` function in `inventory`): add `"other-game"` for a file inside the resources folder that is in neither the game folder nor `common`. Today these files get `"outside"`, which wrongly reads as outside the resources folder.
- **Folder kind** (`asset_folders`): split `"shared"` into `"common"` and `"other-game"`.
- **Version:** bump `ASSET_REPORT_VERSION` to 8, and add `otherGame` to the summary counts.
- **Docs:** add the version 8 row to the README report-versions table.

### 2. New module `egt_gda_sync/sync/rss_refactor.py`
This is the engine.

- **`references(game_dir, resources_dir) -> Index`:**
  - Load the descriptors with `rss_sync.load_documents`, including the included common descriptors.
  - Parse each descriptor's text with `rss_edit.parse` and `walk`.
  - Record every path reference: `path`, `frames[].path` and `samples[]`, with the descriptor, the node span, the template and its resolved files (via `expand_path`). Entry paths are relative to the game folder, as `gather()` resolves them.
  - Phase 2 adds key declarations and key references here.
- **`other_users(resources_dir, game_dir, files)`:** list the entries in sibling game folders that declare any of `files`. A sibling game folder is a folder directly in `resources_dir` with `*Data.json` files; parse its descriptors and their includes.
- **`plan_move(index, mapping, game_dir, resources_dir) -> Plan`:** `mapping` maps old file paths to new ones.
  - **New path text.** A plain path becomes the new file's path relative to the game folder, in POSIX form. A `{N-M}` template keeps its file name and changes only its folder. All of its frames must map with the same folder change; otherwise it is blocked ("the sequence's frames would be split").
  - **Copy or move.** A source outside the game folder (another game, or common) is always copied. A game file is moved, unless `other_users` finds another game that uses it: then it is copied and the preview warns.
  - **Target checks:** the target must be inside the game folder (`safe_path`) and have valid names (`_valid_name`). If the target exists:
    - with the same SHA-256, it is reused (no copy, only the paths are changed);
    - with different contents, the move is blocked;
    - if two sources map to one target, or two targets differ only in case, the move is blocked.
  - **Warnings:** a view moved to another resolution folder; a view moved out of `v/`.
  - **Blockers:** a file named by `resource_paths` in `workspace.json`; a reference held in a common descriptor (never edited).
  - **Asset types:**
    - an RTF moves as its whole folder (its pages' `app:/` paths are relative to that folder);
    - a sequence moves all its frames;
    - an audio event's matching `samples` are updated.
- **`Plan` dataclass:**
  - `files`: each with source, target, mode (copy, move or reuse), size and SHA-256;
  - `edits`: by file, each with span, line, field path and old → new text;
  - `blockers` and `warnings`: each with code, message and files;
  - `revisions`: SHA-256 of every file read;
  - `fingerprint`: a hash of all of the above.
- **`apply_edits(text, edits)`:** replace the string spans from the end of the text backwards, writing each new value with `json.dumps(..., ensure_ascii=False)`. Then check that the result is still valid JSON, and a valid descriptor (`parse_dataclass` with `DOCUMENT_TYPES`). Indentation, line endings and the byte order mark stay as they are, like the existing editors in `rss_edit`.

### 3. Library operations
`egt_gda_sync/workspace/library.py`, following the pattern of `remove_asset` and `declare_asset`:
- **`move_preview(assets | folder, target_folder, name=None)`:**
  - Find the rows with `_report_asset`; their files come from the library's `_asset_files`.
  - **Default target:** for an asset from another game, the same relative path inside this game. For example `../joker_reels_coins_10/art/1920x1080/08.Topper/Topper_JR.dds` becomes `art/1920x1080/08.Topper/Topper_JR.dds`.
  - Build the mapping, then call `references` and `plan_move`.
  - Return the plan as JSON.
- **`move_assets(..., fingerprint)`** runs under `_exclusive`:
  1. Recompute the plan. If its fingerprint differs, refuse with 409 ("the files changed; preview again"). If it has blockers, refuse with 409.
  2. Copy the new files with `_replace_file(..., create_parents=True)`, after checking that each target still does not exist.
  3. Back up each edited descriptor and write it with `_write_file`, keeping its BOM.
  4. Delete the moved sources with `_delete_with_backup`, then `_remove_empty_folders` up to the game folder.

  This order keeps every intermediate state consistent: the new files exist before any descriptor points to them, and the old ones go only after every descriptor has been edited.

  5. Write the manifest with `created` files, record the activity, run `_write_asset_report()` and `start_comparison()`.
  6. Return `{library, assets: {oldId: newId}}` so the UI can reopen the details, as `declare_asset` does.

### 4. Backups: files an operation created
`egt_gda_sync/workspace/backups.py`:
- `write_manifest(..., created=[{path, sha256}])`.
- `_record` and `operation` list each created file with `change: "created"` (no backup bytes) and `now`: same, changed or missing.
- New actions: `move`, and `rename` for Phase 2.

`Library.restore_backup` deletes a created file whose contents still match. A changed one is skipped and reported as a failure, never deleted silently. Restoring a move therefore puts the descriptors and the source files back, and removes the copies.

### 5. API
`egt_gda_sync/app/server.py`, with the same body and guard rules as the other edit endpoints:
- `POST /api/asset-report/move/preview` with `{assets?: [id], folder?: str, target: str, name?: str}` returns the plan.
- `POST /api/asset-report/move` with the same fields plus `fingerprint` returns the library and the new asset ids.

Then re-run `scripts/export_openapi.py` (its `SECTIONS` table already covers `/api/asset-report`).

### 6. Frontend
- **`frontend/src/components/ChangePreview.vue` (new, shared with Phase 2):**
  - file operations (copy, move or reuse, with old → new paths);
  - edits grouped by file, each with line, field and old → new;
  - warnings and blockers, which disable Apply.
- **`frontend/src/components/MoveAssets.vue` (new):** the target folder input, filled with the default target and suggesting the game's folders from the report. A single file can also get a new name. The preview refreshes as the input changes (debounced), and Apply is enabled only when there are no blockers.
- **`components/AssetDetails.vue`:**
  - a **Move…** button;
  - for `scope === 'other-game'`, a warning line ("From another game's folder: it breaks when that game changes") with **Copy into this game…**;
  - add the new scope to the scope text map.
- **`components/WorkspaceHeader.vue` and `views/AssetsLibraryView.vue`:** an `other-game` folder line gets a warning mark and **Copy all into this game…**. That one action fixes the joker case: 2 files, 5 entries.
- **`workspace.ts` and `types.ts`:** the API calls, and the `Plan`, scope and folder-kind types.
- **`views/BackupsView.vue`:** show created files ("restoring deletes it").

### 7. Docs
- **README:** the move operation and the `other-game` scope.
- **`docs/feature_ideas.md`:** the cross-game usage check partly covers idea 2.

## Phase 2: rename an RssKey (same engine)

- **Index, extended:**
  - key declarations: the entry `id` nodes, with the kind from the list name via `rss_declare.KINDS`;
  - structural references: `rssKey`, `rssKeys[]` and `rssStyleId` (kinds from `views.ELEMENT_KINDS`, and `TextStyle` for `rssStyleId`), and `font_id` for `Font`;
  - value references: any JSON string value exactly equal to the key, in every non-descriptor `.json` file of the game folder (views, idata) and of the folders of included descriptors;
  - text references: the whole key as a word in `.ini`, `.csv`, `.xml`, `.lua` and `.txt` files. These are reported only, never edited.
- **`plan_key_rename(index, kind, old, new, excluded)`:**
  - renames every variant entry of the key (each resolution, language and integration);
  - edits the structural references and the selected value references;
  - value matches are shown with their field path and can be left out.
- **Blockers:**
  - the new key has a bad format (`^[A-Za-z0-9_]+$`, at most 200 characters);
  - another entry of the same kind already has the new key;
  - the key is declared in a common descriptor;
  - any reference is in a common file (the `STYLE_NOTO_BOLD` case).
- **Warnings:**
  - the new key exists in another kind;
  - text references found;
  - no reference outside the descriptors ("the game's code may use it").

  The preview always notes that the game's code is not checked.
- **Apply:**
  - compute every new text first and check it;
  - write each file atomically;
  - if a write fails, restore the files already written from the operation's backup;
  - record the operation as `rename`.
- **API:** `POST /api/asset-report/rename-key/preview` and `POST /api/asset-report/rename-key`, with `{kind, key, newKey, excluded?, fingerprint?}`.
- **UI:** `components/RenameKey.vue`, opened from a rename button on each **Loaded by** entry in `AssetDetails.vue`, reusing `ChangePreview.vue`.
- **Optional:** `Library._key_uses` (the views that `remove_asset` warns about) can then use the index, so removing an asset also warns about idata references.

## Existing code to reuse

| Need | Function |
| --- | --- |
| Parse and edit text with exact spans | `rss_edit.parse`, `walk`, `Node` |
| Validate descriptors | `rss_schemas.parse_dataclass`, `DOCUMENT_TYPES` |
| Read descriptors | `rss_sync.load_documents`, `declared_entries`, `expand_path`, `COMMON_DIR` |
| Asset files and paths | `rss_declare.KINDS`, `asset_files`, `entry_paths`; `library._asset_files` |
| Views | `views.is_view`, `view_root`, `element_keys`, `ELEMENT_KINDS` |
| Safe file operations | `library.safe_path`, `contained`, `_valid_name`, `_replace_file`, `_write_file`, `_delete_with_backup`, `_remove_empty_folders`, `_copy_exclusive` |
| Report lookup and refresh | `Library._report_asset`, `_write_asset_report`, `_record`, `start_comparison` |
| Backups and restore | `backups.new_operation`, `write_manifest`, `Library.restore_backup` |

## Verification

- **Phase 1 tests, `tests/test_refactor.py`:** build the fixtures like `write_game` in `tests/test_asset_report.py`: a game, `common`, and another game whose files the game declares.
  - Copy-in repoints all 5 entries (3 Image, 2 RawFile) to the copied files and leaves the other game unchanged. Restoring the backup deletes the copies and restores the descriptors.
  - Moving inside the game with a `{N-M}` sequence keeps the template. A split sequence is blocked.
  - An RTF folder moves as a whole.
  - Target collisions: a same-SHA target is reused; a different one, two-to-one, or a case-only clash is blocked.
  - A file that another game uses is copied, not moved.
  - A reference in a common descriptor is blocked.
  - A stale fingerprint gets 409.
  - Indentation, CRLF line endings and the BOM are kept.
- **API tests** in `tests/test_api.py` style, plus the report version 8 scope and folder kinds.
- **Run:** `.venv/bin/python -m pytest -q -m "not e2e"`, and `cd frontend && npm run build` (vue-tsc).
- **Manual run on a copy of the real data:**
  1. Copy `/home/spyder/nextcloud/_Projects/gda-sync/rss` into the scratchpad and point a workspace at the copied burning_crown.
  2. Rescan the Asset library.
  3. The `../joker_reels_coins_10` line shows **Copy all into this game…**, and its preview shows 2 copies and 5 path edits.
  4. Apply. Rescan shows no other-game folder, `TopperView` still draws, and the restore from Backups undoes everything.
- **Phase 2 tests:**
  - renaming covers every variant, view `rssKey`/`rssKeys`/`rssStyleId`, style `font_id` and idata `rssId`;
  - a left-out value match stays;
  - a collision is blocked;
  - a key that a common view uses (`STYLE_NOTO_BOLD`) is blocked;
  - a key declared in common is blocked;
  - a key with no references gets the "code" warning.
