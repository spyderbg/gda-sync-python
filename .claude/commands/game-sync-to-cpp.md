---
description: Sync a ported game's TypeScript changes into its C++ plugin, and nothing outside it (docs/code_sync/game_sync_to_cpp.md)
argument-hint: <plugin folder, such as burning_crown_tetra_spins_10>
---

Sync the browser game's TypeScript of the game `$ARGUMENTS` into the game's C++, in the games repository.

1. Read `docs/code_sync/game_sync_to_cpp.md` in full and follow it step by step: it is the procedure. Read the "How the
   port is tracked" section of `docs/code_sync/game_sync.md` and the section "The TypeScript to C++ translator" of
   `frontend/src/game/README.md` too.
2. Work out the inputs before step 0:
   - `<plugin>` is `$ARGUMENTS`. If it is empty, or is not a folder of both `frontend/src/game/alpha_family/plugins/`
     and `$GAMES/game/alpha_family/plugins/`, list the folders they share and ask which one to sync.
   - `GAMES` is `games_root_path` in `config/workspace.json`.
   - `<Game>` is the prefix of the module folders in `frontend/src/game/alpha_family/plugins/<plugin>/`
     (`<Game>Fsm`, `<Game>View` and so on).
   - The workspace is the entry of `config/workspace.json` whose `id` is `<plugin>` or starts with it. It is needed only
     for an export (step 5).
3. **Scope.** Edit C++ only under `$GAMES/game/alpha_family/plugins/<plugin>/`. Never edit the TypeScript, this
   repository's code, the alpha_family libraries, the engine, `hat_libs`, `integration`, `configs`, `resources`, other
   games' plugins or the build folder. The one other write is `frontend/src/game/export/PortManifest.json`, through
   `port-manifest.mjs --only`, after the user has committed the C++ (step 7). A change that needs anything outside the
   plugin is not ported: report what it needs.
4. Follow the games repository's rules (`$GAMES/AGENTS.md`, `$GAMES/.claude/rules/`): provenance (`file:line`) for
   every foreign name, Edit and Write only for C++ sources, comments only where the code cannot speak.
5. **Only interfaces go in the runtime.** Never write `RuntimeAdd`, `RuntimeRemove`, `RuntimeGet`, `RuntimeTryGet`,
   `RuntimeGetConst` or `RuntimeTryGetConst` of a class that is not an interface, such as
   `RuntimeRemove<GameBackgroundView>()` or `RuntimeTryGetConst<GameBackgroundView>()`. A TypeScript change that does it
   (a class's own `RuntimeToken`) is not ported as it is. Step 6's check must print nothing. Never change an interface
   or add a getter to one. To reach another view's own class, get its interface from the runtime and `dynamic_cast` it
   (`instanceof` in TypeScript), as the document's section says.
6. Stop and ask the user wherever the document says to: a live Game Creator run, a dirty plugin folder in the games
   repository, C++ that changed since its port (run `/game-sync <plugin>` first), uncommitted TypeScript, a change that
   needs the libraries or the engine, a class that is not an interface in the runtime, a change to the math, or a real
   build.
7. Commit only when the user asks, in either repository, and never push. Report as step 7 says. Tell the user that the
   manifest is recorded after the C++ commit, and is committed with the TypeScript as it is.
