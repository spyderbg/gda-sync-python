# Sync the alpha_family libraries and hat_libs into the browser game

Instructions for Claude Code. They bring the TypeScript ports of the C++ libraries that every alpha_family game shares
up to date with the C++:

- **Part A, the alpha_family libraries.** Math rules, state and view interfaces, the states library, the base views
  and the family's capping splash. The port manifest tracks them.
- **Part B, `hat_libs`.** tweeny, its transform extension, and the `egt_hpp`/`egt_math` pieces it needs. Nothing tracks
  them except the sync record at the end of this document.

It follows the same steps as [game_sync.md](game_sync.md), which explains the tools (`import-cpp.mjs`,
`compare.mjs`, `port-manifest.mjs`, `play_check.py`) and the C++ → TypeScript rules. Read that one first. This
document says what differs for the libraries.

**Order.** When several syncs are due, go from the bottom up: `hat_libs` (Part B), then the alpha_family libraries
(Part A), then each game ([game_sync.md](game_sync.md)). A game's C++ change can depend on a library change made in the
same commit, so check its library diff before deciding that it depends on something unported.

**Inputs.** `GAMES` is the games repository (`/media/plamen/data/Egt/games`). The scratch folder is the session's
scratchpad. Commands run from the repository root.

## Part A: the alpha_family libraries

### Scope

| C++ (`$GAMES/game/...`) | TypeScript (`frontend/src/game/...`) | Files tracked on 2026-10-28 |
| --- | --- | --- |
| `alpha_family/libs/src/Egt/AlphaFamily` (math rules, `States/` and `Views/` interfaces, `*.bridge.h`, `*.data.h`) | `alpha_family/libs/AlphaFamily` | 76 |
| `alpha_family/libs/src/Egt/AlphaFamilyStatesLibrary` (GameManager, ViewManager, BetManager, Idle, Match and the round states) | `alpha_family/libs/AlphaFamilyStatesLibrary` | 32 |
| `alpha_family/libs/src/Egt/AlphaFamilyVideoCtrl` (BaseView, ButtonView, NumericBarView, MenuView) | `alpha_family/libs/AlphaFamilyVideoCtrl` | 5 |
| `plugins/src/Egt/CappingSplashView`, a module of every alpha family game | `plugins/CappingSplashView` | 2 |

Not tracked, and out of scope unless the user asks:

- `engine/`, which ports `game/libs/src/Egt/{Fsm,Game,GameVideoCtrl}`, the `core` and `game_core` submodules and the
  ResourceManager, VideoManager, AudioManager and FileWatch plugins;
- `integration/`, the AlphaFamilyGameflow and the kernel integrations.

Their C++ changes don't show up in `import-cpp.mjs`. Look at them only when a tracked change needs them, which the type
check usually tells you.

### Every ported game uses these files

A library change affects every game ported on the branch (`ls frontend/src/game/alpha_family/plugins`). Play each one
in step 6, not only the game the user named.

### Step 1: Find what changed

`import-cpp.mjs` lists the game and the libraries together. To list only the libraries' entries:

```sh
node frontend/src/game/export/import-cpp.mjs $GAMES/game --json 2>/dev/null | node -e '
const report = JSON.parse(require("fs").readFileSync(0, "utf8"));
for (const item of report.changed) if (/^(alpha_family\/libs|plugins)\//.test(item.ts))
  console.log(`${item.ts}  since ${item.from.slice(0, 9)}${item.uncommitted ? "  UNCOMMITTED C++" : ""}\n  ${item.commits.join("\n  ")}`);'
```

`UNCOMMITTED C++` means the working tree differs from HEAD. The import diffs against the working tree, so ask the user
before you sync such a file.

Untracked library changes worth a look:

```sh
git -C $GAMES diff --stat <oldest since> HEAD -- game/alpha_family/libs/src game/plugins/src/Egt/CappingSplashView
```

- **A new header that a tracked file now includes** (for example a new `I*View.bridge.h`). Port it when the ported
  code uses it. A new interface the TypeScript game doesn't use, such as one of a round no ported game has, can wait.
- **A deleted header.** If its TypeScript port exists, delete it once nothing imports it. If it never had one (for
  example `StatusLineDrawn.h`, deleted on 2026-10-20, which was QA-only), nothing to do.

Then follow game_sync.md steps 2 to 5 (baseline, port, measure, manifest), with these library specifics.

### Library specifics

- **Partial ports on `dev`.** The states of the rounds Burning Crown does not have (free, extra, hold and spin, wheel,
  gamble, coins) are not ported on `dev`, and `ViewManager.ts` there is the compact port (about 600 lines, no
  `IsWheelRoundView`, no `IsTakeCoinsButtonAvailable`). A change inside one of those C++ files has no TypeScript file,
  so it isn't listed. A change in a ported file that touches those paths is ported against the TypeScript's stand-in,
  as game_sync.md says. The full ports are on the `nordic-rush` branch (not merged on 2026-10-28). Check which branch
  you are on before relying on them.
- **Interfaces and bridges** (`AlphaFamily/States/I*.h`, `AlphaFamily/Views/*.bridge.h`,
  `AlphaFamily/RuntimeImport/*.bridge.h`). A new method must be implemented by every TypeScript class that implements
  the interface: the views of every ported game, `integration/AlphaFamilyGameflow` for `IGameflow`, and
  `integration/BrowserKernel` for the kernel's services. A new event goes in the TypeScript `Events` class. The type
  check finds the gaps.
- **Data structs** (`*.data.h` ↔ `*.data.ts`). Keep the field names, the order and the defaults identical. Enums keep
  their C++ values. For an IData enum, the values are the IData's names (README: `EInfoViewPageType.Main = 'Main'`).
  `SetupViewsOptions` (`IViewManager.data.h` ↔ `AlphaFamily/States/IViewManager.ts`) has its defaults in `WithDefaults`
  in `ViewManager.ts`, so a new default goes there too.
- **Statics and nvrams** (`*.data.h` of a state, such as `ReelRoundStatics`, `TetraRoundStorage`). A field added in C++
  goes in the TypeScript class with the same default. Code that reads it from another state (for example
  `ConstStatic<ReelRoundStatics>().showFastLines` in `ReelRoundPresenting`) needs that class imported.
- **QA-only C++** (`EGT_DISTRIBUTION_TARGET_QA`, QaBridge, the drawn-elements observer) is not ported. Say so in the
  report.
- **Moves between states and managers.** When a responsibility moves from a state to a manager (the tetra round's bet
  setup moved into `ViewManager.SetupBets`, games commit `a1b96f199`), delete the TypeScript where the C++ deleted it,
  and add it where the C++ added it, in the same change. Then play the rounds on both sides of the move.
- **Fidelity measures.** `compare.mjs` translates the states and the views, so the states library's changes show
  directly in its counts. Interfaces, bridges and data files show indirectly, through the classes that use them.

### Step 6: Test and play every game

```sh
.venv/bin/python -m pytest tests/test_game_project.py tests/test_tweeny_port.py -q
.venv/bin/python scripts/build.py
# for each ported game, with a preset that reaches the rounds the change touches:
.venv/bin/python -I docs/code_sync/play_check.py --workspace <workspace> --preset "<preset>" --until <state text> --out <scratch>/play-<game>
```

To check a hardware button rule (`SetupHwButtons`, `RefreshHWButtons`), read the panel's on and off states in each
state in `play_check.py`'s output. To check a bets rule, read the bets in "rounds". Report and commit as in game_sync.md
step 7.

## Part B: hat_libs

### What it is

`$GAMES/hat_libs` is the `common/libs` repository, a git submodule of the games repository. The games build against
the commit the games repository pins, so sync to the pin, not to `hat_libs`' own branch:

```sh
git -C $GAMES ls-tree HEAD hat_libs            # the pinned commit
git -C $GAMES log --format='%h %ad %s' --date=short -5 -- hat_libs   # when the pin moved
git -C $GAMES submodule status hat_libs        # a leading + means the checkout is not the pin: ask the user
```

### What the browser game ports

Each TypeScript file starts with a comment naming the C++ it ports. On 2026-10-28:

| TypeScript (`frontend/src/game/hat_libs/...`) | C++ (`$GAMES/hat_libs/...`) |
| --- | --- |
| `tweeny/tweeny.ts` | `tweeny/tweeny.h`, `.cpp` |
| `tweeny/tween_action.ts` | `tweeny/tween_action.h`, `.cpp` |
| `tweeny/tween_common.ts` | `tweeny/tween_common.h` (to_str and type_to_str are in `tween_inspector.ts`) |
| `tweeny/tween_core.ts` | `tweeny/tween_core.h`, `.hpp`, `.cpp` |
| `tweeny/tween_ease.ts` | `tweeny/tween_ease.h`, `.cpp` |
| `tweeny/tween_ex.ts` | `tweeny/tween_ex.h`, `.hpp` |
| `tweeny/tween_inspector.ts` | `tweeny/tween_inspector.h`, `.cpp` |
| `tweeny/tween_manager.ts` | `tweeny/tween_manager.h`, `.cpp` |
| `tweeny/tween_math.ts` | `tweeny/tween_math.h`, `.hpp`, `.cpp` |
| `tweeny/tween_private.ts` | `tweeny/tween_private.h` |
| `tweeny/tween_updater.ts` | `tweeny/tween_updater.h` |
| `tweeny/detail/tweeny_internal.ts` | `tweeny/detail/tweeny_internal.h`, `.cpp` |
| `tweeny/tests/tests.ts` (run by `tests/run.mjs`) | `tweeny/tests/tests.cpp` |
| `tweeny_extend/tweeny_extend_transform/tweeny_extend_transform.ts` | `tweeny_extend/tweeny_extend_transform/tweeny_extend_transform.h`, `.cpp` |
| `egt_hpp/event.ts` | `egt_hpp/event.hpp` |
| `egt_hpp/sentinel.ts` | `egt_hpp/sentinel.hpp` |
| `egt_math/transform.ts` | `egt_math/transform.hpp`, `.cpp` (`transform_t<float>`) |

Left out on purpose: `egt_math`'s matrices and skew, `tweeny_extend_node`, `tweeny_extend_text`, and the rest of
`egt_hpp`. Some things differ on purpose, as the files' header comments say:

- durations are milliseconds, where C++ uses `std::chrono::nanoseconds`;
- a sentinel is made from a predicate, not a `shared_ptr`;
- the inspector is always filled, where C++ fills it only in debug builds;
- tweened values are numbers or objects of numbers.

### Step 1: Find what changed

Take the baseline, the last synced commit, from the sync record below. The target is the pinned commit.

```sh
cd $GAMES/hat_libs
git log --format='%h %ad %an%n    %s' --date=short <baseline>..<pinned> -- \
  tweeny tweeny_extend/tweeny_extend_transform egt_hpp/event.hpp egt_hpp/sentinel.hpp egt_math/transform.hpp egt_math/transform.cpp
git diff <baseline> <pinned> -- <the same paths>
```

If nothing changed, update the sync record's "checked" date and stop.

A change to something left out on purpose needs no port, unless a ported game's C++ now uses it. Find out with
`grep -rn '<new name>' $GAMES/game/alpha_family`. A game that uses `tweeny_extend_text` needs that extension ported
first, and that is its own task: ask the user.

### Step 2: Baseline

Record `compare.mjs`'s output, as in game_sync.md step 2. The views translate their tweeny calls against `hat_libs`'
headers, so an API change shows up there.

### Step 3: Port

- Keep the C++ names exactly, including the snake_case (`tween_action`, `sequence_precise`, `on_end.connect`). The
  C++ namespaces are TypeScript namespaces or modules: `tweeny.ease.back_stop` is `tweeny::ease::back_stop`.
- Keep C++'s value semantics. A `tween_action` is a value: `start` runs a copy, and a combinator copies its tweens, so a
  new member must also be copied by `copy()` where the C++ copy constructor copies it.
- **The translator's map.** `HAT_LIBS` near the top of `frontend/src/game/export/translator/Translator.mjs` maps a
  `hat_libs` TypeScript file to its C++ namespace and header. A new name in an existing file needs nothing. A new
  ported file needs a rule there, unless an existing pattern matches it, such as `tweeny/tween_*.ts`.
- **Duration parameters.** A new C++ parameter of type `duration_t`, `duration` or `milliseconds` takes milliseconds in
  TypeScript. The translator writes `std::chrono::milliseconds(…)` for it (`DURATION_TYPE` in `Translator.mjs`).
- **Ported tests.** Port the new or changed cases of `tweeny/tests/tests.cpp` into `tweeny/tests/tests.ts`, the way
  its existing cases are ported.

### Step 4: Check

```sh
(cd frontend && npm run typecheck)
(cd frontend && node src/game/hat_libs/tweeny/tests/run.mjs)       # "N checks passed"
.venv/bin/python -m pytest tests/test_tweeny_port.py -q
node frontend/src/game/export/translator/compare.mjs $GAMES/game > <scratch>/compare-after.txt
node frontend/src/game/export/translator/compare.mjs $GAMES/game --compile $GAMES/build/user-dbg-clang/compile_commands.json | tail -1
```

The views that use tweeny must not move farther from their C++, and every translated `.cpp` must still compile against
the new headers. `compile_commands.json` compiles against the checked-out `hat_libs`.

### Step 5: Play

Tweens move the reels, the lines, the win figures, the big win and the tetra overlay. Rebuild, play each ported game
with `play_check.py`, then ask the user to watch the animations on the Play page. The headless run proves the states
move on; it doesn't show that an animation looks right.

### Step 6: Record

Add a row to the sync record below: the commit you synced to, the games commit that pins it, and the date. Commit only
when the user asks. A `hat_libs` sync has no manifest entry, so this record is the only trace of it.

### Sync record

| hat_libs commit | Its date | Pinned by games commit | Synced or checked | Notes |
| --- | --- | --- | --- | --- |
| `bb41b0f82` | 2026-09-17 | `a5437d3bb` (2026-10-14) | ported 2026-10-20 | The first port, from the pin of that day |
| `bb41b0f82` | 2026-09-17 | `9d7930a1c` (2026-10-27) | checked 2026-10-28 | The pin has not moved: nothing to sync |
