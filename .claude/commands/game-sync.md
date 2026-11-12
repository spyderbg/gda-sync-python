---
description: Sync a ported game's C++ changes into the browser game's TypeScript, and its modules configs into frontend/src/game/configs (docs/code_sync/game_sync.md)
argument-hint: <plugin folder, such as burning_crown_tetra_spins_10>
---

Sync the C++ of the game `$ARGUMENTS` into the browser game's TypeScript, and its modules configs into
`frontend/src/game/configs`.

1. Read `docs/code_sync/game_sync.md` in full and follow it step by step: it is the procedure. Read
   `docs/code_sync/library_sync.md` too. `import-cpp.mjs` lists the shared libraries' changes together with the
   game's, and that document's Part B checks the `hat_libs` pin against its sync record.
2. Work out the inputs before step 0:
   - `<plugin>` is `$ARGUMENTS`. If it is empty, or is not a folder of `frontend/src/game/alpha_family/plugins/`, list
     those folders and ask which one to sync. A plugin that exists only in
     `$GAMES/game/alpha_family/plugins/` is not ported on this branch (game_sync.md step 0).
   - `GAMES` is `games_root_path` in `config/workspace.json`.
   - The workspace is the entry of `config/workspace.json` whose `id` is `<plugin>` or starts with it. Ask the user if
     none or several match. The Play page needs the id to be the plugin's name (game_sync.md, "A workspace whose id is
     not its game's folder").
   - `<Game>` is the prefix of the module folders in `frontend/src/game/alpha_family/plugins/<plugin>/`
     (`<Game>Fsm`, `<Game>View` and so on).
   - The playthrough presets are the `presets` in `frontend/src/game/GameView.vue`. Pick the ones that reach the rounds
     the changes touch.
3. When `import-cpp.mjs` lists the shared libraries too, sync them in the same session with library_sync.md, in its
   order: `hat_libs`, then the alpha_family libraries, then the game. Say so in the report.
4. Sync the game's modules configs too, as game_sync.md says: list their changes with
   `node frontend/src/game/export/sync-configs.mjs $GAMES --check <plugin>` (step 1), port what the TypeScript must
   follow, then copy them with the same command without `--check` (step 5). Do this even when `import-cpp.mjs` lists
   no C++ change: the configs can change alone. `$GAMES` here is the games repository itself, not its `game` folder.
5. Stop and ask the user wherever the documents say to: uncommitted C++, a `hat_libs` checkout that differs from the
   pin, a game that is not ported on this branch, a change that needs an unported part ported first, or a config that
   was edited here and changed in the games repository too (a `CONFLICT`).
6. Commit only when the user asks. Report as game_sync.md step 7 says, and tell the user that the export needs the
   commit.
