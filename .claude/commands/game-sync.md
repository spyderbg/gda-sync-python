---
description: Sync a ported game's C++ changes into the browser game's TypeScript (docs/code_sync/game_sync.md)
argument-hint: <plugin folder, such as burning_crown_tetra_spins_10>
---

Sync the C++ of the game `$ARGUMENTS` into the browser game's TypeScript.

1. Read `docs/code_sync/game_sync.md` in full and follow it step by step: it is the procedure. Read
   `docs/code_sync/library_sync.md` too. `import-cpp.mjs` lists the shared libraries' changes together with the
   game's, and that document's Part B checks the `hat_libs` pin against its sync record.
2. Work out the inputs before step 0:
   - `<plugin>` is `$ARGUMENTS`. If it is empty, or is not a folder of `frontend/src/game/alpha_family/plugins/`, list
     those folders and ask which one to sync. A plugin that exists only in
     `$GAMES/game/alpha_family/plugins/` is not ported on this branch (game_sync.md step 0).
   - `GAMES` is `games_root_path` in `config/workspace.json`.
   - The workspace is the entry of `config/workspace.json` whose `id` is `<plugin>` or starts with it
     (`zodiac_wheel_coins` → `zodiac_wheel_coins_italy`). Ask the user if none or several match.
   - `<Game>` is the prefix of the module folders in `frontend/src/game/alpha_family/plugins/<plugin>/`
     (`<Game>Fsm`, `<Game>View` and so on).
   - The playthrough presets are the `presets` in `frontend/src/game/GameView.vue`. Pick the ones that reach the rounds
     the changes touch.
3. When `import-cpp.mjs` lists the shared libraries too, sync them in the same session with library_sync.md, in its
   order: `hat_libs`, then the alpha_family libraries, then the game. Say so in the report.
4. Stop and ask the user wherever the documents say to: uncommitted C++, a `hat_libs` checkout that differs from the
   pin, a game that is not ported on this branch, or a change that needs an unported part ported first.
5. Commit only when the user asks. Report as game_sync.md step 7 says, and tell the user that the export needs the
   commit.
