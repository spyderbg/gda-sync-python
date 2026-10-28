# Sync a game's C++ into the browser game

Instructions for Claude Code. They bring a game's TypeScript port (`frontend/src/game/alpha_family/plugins/<plugin>`)
up to date with the game's C++ (`games/game/alpha_family/plugins/<plugin>/src/Egt`), after the C++ changed. They work for
any game that is already ported. The alpha_family libraries and `hat_libs`, which every game shares, have their own
document, [library_sync.md](library_sync.md). Use it together with this one when the libraries changed too.

The direction is C++ → TypeScript. The opposite direction, the export, is in `frontend/src/game/README.md` ("Adding a
game or a feature", step 5).

In Claude Code, `/game-sync <plugin>` (`.claude/commands/game-sync.md`) works out the inputs below and follows this
document.

## Inputs

| Name | Example | Where it comes from |
| --- | --- | --- |
| `GAMES` | `/media/plamen/data/Egt/games` | The games repository (`games_root_path` in `config/workspace.json`) |
| `<plugin>` | `burning_crown_tetra_spins_10` | The plugin's folder in `$GAMES/game/alpha_family/plugins/` and `frontend/src/game/alpha_family/plugins/` |
| `<Game>` | `BurningCrownTetraSpins10` | The prefix of the plugin's modules (`<Game>Fsm`, `<Game>Math`, `<Game>View`, `<Game>InfoView`, `<Game>TopperView`) |
| workspace | `burning_crown_tetra_spins_10` | The workspace's `id` in `config/workspace.json`, for the playthrough |
| scratch | the session's scratchpad | Where the comparison outputs and screenshots go: never the repository |

All commands run from the repository root (`/media/plamen/data/Python/gda-sync`). The shell is zsh: quote globs
(`--include='*.ts'`).

## How the port is tracked

- `frontend/src/game/export/PortManifest.json` has one entry per TypeScript file that ports C++. Each entry has the
  C++ files it ports, the SHA-256 of the TypeScript as it was ported (`sha256`), the games repository's commit that C++
  was taken from (`cppCommit`), and each C++ file's SHA-256 at that commit (`cppSha256`).
- A TypeScript file ports the C++ at the same path: `alpha_family/plugins/<plugin>/<Module>/X.ts` ports
  `alpha_family/plugins/<plugin>/src/Egt/<Module>/X.h` and `X.cpp` (`port-manifest.mjs`, `cppOf`). `X.bridge.ts` ports
  `X.bridge.h` and `X.data.ts` ports `X.data.h`. A C++ file without a TypeScript file of the same name is not tracked,
  for example the `.data.h` files whose structs a view's `.ts` declares.
- `node frontend/src/game/export/import-cpp.mjs $GAMES/game` lists every tracked file whose C++ changed since it was
  ported, with the commits. It covers the game and the shared libraries.
- `node frontend/src/game/export/port-manifest.mjs $GAMES/game --only <ts paths>` records that those files now port the
  games repository's HEAD.
- The export finds the TypeScript as it was ported by its hash in this repository's git history, so a sync must be
  committed before the next export.

## Step 0: Preconditions

1. **The game is ported on this branch.** Run `ls frontend/src/game/alpha_family/plugins`. As of 2026-10-28, `dev` has
   only `burning_crown_tetra_spins_10`. `nordic_rush` and the tools to import a new game (`export/import-game.mjs`,
   the module registry that finds a game's modules by glob) are on the `nordic-rush` branch, which is not merged. A game
   that is not ported is an import, not a sync: stop and tell the user.
2. **The C++ is committed.** Run `git -C $GAMES status --short -- game`. The manifest records commits, so sync only
   committed C++. If files under `game/` are modified, ask the user whether to wait for their commit.
3. **The `hat_libs` checkout matches the pin.** Run `git -C $GAMES submodule status hat_libs`. A leading `+` means
   the checkout differs from the commit the games repository pins: mention it.
4. **This repository's state is known.** Run `git status --short` and `git branch --show-current`. Don't mix the sync
   with unrelated changes.

## Step 1: Find what changed

```sh
node frontend/src/game/export/import-cpp.mjs $GAMES/game
```

The output lists each changed TypeScript file, its C++ files, the commit it was ported from (`since <commit>`) and the
commits since then. Entries under `alpha_family/libs/` and `plugins/` are the shared libraries: sync them in the same
session with [library_sync.md](library_sync.md), because the game runs on them. Say in the report that you did.

For each listed file, read the commits' messages and the whole diff:

```sh
git -C $GAMES log --format='%h %ad %an%n    %s%n%b' --date=short <since>..HEAD -- game/<cpp path>
git -C $GAMES diff <since> HEAD -- game/<cpp path>
```

The messages tell you the intent: a bug fix with a ticket (VLT-…), a platform fix, or a QA-only build feature
(`EGT_DISTRIBUTION_TARGET_QA`, QaBridge), which the browser game does not port.

Then look for the C++ changes the manifest does not track:

```sh
# Everything that changed in the plugin since the oldest "since" commit of its entries
git -C $GAMES diff --stat <oldest since> HEAD -- game/alpha_family/plugins/<plugin>/src

# The plugin's C++ files that no TypeScript file ports
node -e '
const m = require("./frontend/src/game/export/PortManifest.json");
const ported = new Set(Object.values(m).flatMap(e => e.cpp));
const files = require("child_process").execSync("git -C '$GAMES'/game ls-files alpha_family/plugins/<plugin>/src", { encoding: "utf8" }).trim().split("\n");
console.log(files.filter(f => !ported.has(f)).join("\n"));'
```

Classify each untracked change:

| C++ change | What to do |
| --- | --- |
| `CMakeLists.txt`, `.clang-format` | Nothing. |
| A `*.data.h` with no `.data.ts` | Its structs (a view's IData config, for example) are declared in another TypeScript file. Find it with `grep -rn '<StructName>' --include='*.ts' frontend/src/game` and port the change there. |
| A new `.h`/`.cpp` class | A new port. See "New C++ classes" below. |
| A deleted `.h`/`.cpp` | Delete its TypeScript file if nothing else imports it. Its manifest entry goes away in step 5. |
| `resources/<plugin>/...` (view JSON, `Rss*Data.json`, images) | Usually nothing. The browser game reads the workspace's game folder directly. But when the C++ starts using new element ids, check that the view JSON has them: `grep -n '<element id>' $GAMES/resources/<plugin>/v/1920x1080/<View>.json`. |

## Step 2: Record the translation baseline, before editing

```sh
node frontend/src/game/export/translator/compare.mjs $GAMES/game > <scratch>/compare-before.txt
```

This takes about 15 seconds. It translates every tracked TypeScript file it can into C++ and counts the lines that differ
from the games repository's C++. Step 4 compares against this baseline, so record it before the first edit. If you
forget, save `git diff` to the scratchpad, `git stash`, run it, then `git stash pop`.

## Step 3: Port each change

Open the whole C++ file at HEAD, not only the diff, and the TypeScript file next to it. For each change, find the same
place in the TypeScript (the method of the same name) and make the same change there.

### Write it as the C++ is written

`frontend/src/game/README.md` ("The TypeScript to C++ translator") has the full rules. The common ones:

| C++ | TypeScript |
| --- | --- |
| `RuntimeGet<IX>()`, `RuntimeGetConst<IX>()`, `RuntimeTryGet<IX::Events>()` | `this.RuntimeGet(IX)`, `this.RuntimeGetConst(IX)`, `this.RuntimeTryGet(IX.Events)` |
| `Parent<IX>()`, `ConstParent<IX>()` | `this.Parent(IX)`, `this.ConstParent(IX)` |
| `Static<T>()`, `ConstStatic<T>()`, `Nvram<T>()`, `ConstNvram<T>()` | `this.Static(T)`, `this.ConstStatic(T)`, `this.Nvram(T)`, `this.ConstNvram(T)` |
| `{.enabled = x, .light = HwButtonLight::On}` | `{ enabled: x, light: HwButtonLight.On }` |
| `RoundType::Main` | `RoundType.Main` |
| `const bool x = …;` / `const auto x = …;` / `auto x = …;` (assigned again later) | `const x: boolean = …;` / `const x = …;` / `let x = …;` |
| `ReturnIf(c);`, `ReturnIf(c, v);` | `if (c) return;`, `if (c) return v;` |
| `ReturnUnless(c, Skip());` | `if (Unless(c)) return this.Skip();` |
| `AssertReturnIf(c, v);` | `if (AssertIf(c)) return v;` |
| `if (auto e = RuntimeTryGet<IX::Events>()) { … }` | `const e = this.RuntimeTryGet(IX.Events);` then `if (e) { … }` |
| `ReactOn(e->onX, &Class::OnX);` | `this.ReactOn(e.onX, this.OnX);` |
| `return Consume();` / `Skip()` / `Forward()` / `Reject()` | `return this.Consume();` and so on |
| `std::get_if<T>(&x)` | `get_if(T, x)` |
| `(void)x;`, a `[[maybe_unused]] x` parameter | `void x;`, a parameter named `_x` |
| `constexpr std::string_view XId = "x";` in the `.cpp`'s anonymous namespace | `const XId = 'x';` at the top of the module |
| A method declared in the `.h` | A method of the class, `private` or `protected` as the `.h` declares it. Keep the C++'s order. |

Keep the C++'s comments and blank lines: the translator keeps them, and the comparison counts them.

### Match the file's form

Most of the states library is a statement-for-statement port. Some files are older, more compact ports:

- the plugin's views, which use `this.m_elementsList.TryGet(id)?.SetHidden(…)` where C++ has
  `m_elementsList[id].SetHidden(…)`;
- `ViewManager.ts` on `dev`, about 600 lines against the C++'s 1450, with no wheel or coins paths.

In such a file, port the change's behaviour in the file's own idiom, and don't re-port the rest of the file unless the
user asks. In particular, keep `TryGet(…)?.` in views: `Get` throws on every frame when a view file lacks the element,
for example with an older resources copy or while the user edits the view and it hot-reloads.

### What the TypeScript does not have

- **A change to something the TypeScript never ported** (a QA-only event such as `statusDrawn`, a round this game does
  not have): don't port it. The file still counts as synced, so step 5 moves its manifest entry, and the report says
  why nothing changed.
- **A change that calls into an unported part** (for example `IsTakeCoinsButtonAvailable`, which needs the coins
  round): port the branch against the stand-in the TypeScript already uses, with a one-line comment naming the C++
  function. On 2026-10-28, `ViewManager.SetupHwButtons` has `const canCollect = false;`, commented, used by both
  Collect and Cashout. Never invent behaviour the C++ doesn't have.

### Changes that need more than one file

| C++ change | TypeScript |
| --- | --- |
| An interface method added (`I*.h`, `*.bridge.h`) | Add it to the interface, then implement it in every class that `implements` it: views, `integration/AlphaFamilyGameflow`, `integration/BrowserKernel`. The type check lists what is missing. |
| An event added to an `Events` struct | Add it to the TypeScript `Events` class of the interface's token. |
| A field added to a `*.data.h` struct, with a default | The same field and default in the `.data.ts` class. For `SetupViewsOptions`, also `WithDefaults` in `ViewManager.ts`. |
| `<Game>Math`: `MathRules.cpp`, `SimulatorConfig/*.data.h` | `MathRules.cpp` is generated from `MathRules.description.ts` on export. Change the description, its builder (`authoring/MathRulesDescription.ts`) and `export/MathExporter.ts` together. |
| `<Game>Fsm`: `CreateBuilder()` | The TypeScript Fsm module's `CreateBuilder()`. A new state class also needs an entry in `STATE_CLASSES` in `export/CppExporter.ts`. |
| A new view or visual | See "New C++ classes". |

### New C++ classes

1. Create the TypeScript at the mirrored path, with the class and file header comment of its neighbours: the C++
   name and files, then one line on what it is. Port it statement for statement.
2. Register it: a view goes in `<Game>View`'s `CreateViews()`, in the group the C++ puts it in, and its view name is
   its class name. A state goes in the Fsm builder and `STATE_CLASSES`.
3. Step 5 adds its manifest entry. `port-manifest.mjs` finds every `.ts` file whose mirrored `.h` or `.cpp` exists.

### Type check

```sh
(cd frontend && npm run typecheck)
```

## Step 4: Measure the translation

```sh
node frontend/src/game/export/translator/compare.mjs $GAMES/game > <scratch>/compare-after.txt
diff <(sort -k4 <scratch>/compare-before.txt) <(sort -k4 <scratch>/compare-after.txt)
```

Each line reads `<lines changed> / <lines> <C++ path>`. For every C++ file you touched, the count should go down or stay
the same, and the totals line (`N files, N identical, N lines changed; N TypeScript files not translated`) should not
show more files not translated. Inspect anything that went up:

```sh
node frontend/src/game/export/translator/compare.mjs $GAMES/game --diff <C++ path substring>
node frontend/src/game/export/translator/compare.mjs $GAMES/game --errors   # why a file is not translated
```

These increases are known and acceptable:

- clang-format wraps a line the C++ author left longer than the column limit (`MatchEnding.cpp`, 2026-10-28);
- an older view's `TryGet(…)?.` calls translate to `if (auto&& p_ = …TryGet…)` blocks, so a few more elements add a few
  more lines (`GameBackgroundView.cpp`, 2026-10-28).

For anything else, rewrite the TypeScript closer to the C++.

Then check that the translation compiles. This takes about 30 seconds, and never writes into the build folder:

```sh
node frontend/src/game/export/translator/compare.mjs $GAMES/game --compile $GAMES/build/user-dbg-clang/compile_commands.json | tail -1
```

Expect `0 of N translated .cpp files do not compile`. It was 66 files on 2026-10-28.

## Step 5: Move the manifest

Name every file `import-cpp.mjs` listed, including the ones that needed no change:

```sh
node frontend/src/game/export/port-manifest.mjs $GAMES/game --only <ts path> <ts path> …
node frontend/src/game/export/import-cpp.mjs $GAMES/game
```

The second command must say `The TypeScript ports the C++ as it is now: nothing to import.`

Always pass `--only`. Without it, port-manifest also refreshes every entry whose TypeScript changed, and that marks the
browser-made changes nobody has exported yet as ported, so the next export would not translate them.

## Step 6: Test and play

```sh
.venv/bin/python -m pytest tests/test_game_project.py tests/test_tweeny_port.py -q
.venv/bin/python scripts/build.py          # the app serves egt_gda_sync/static (git-ignored)
.venv/bin/python -I docs/code_sync/play_check.py --workspace <workspace> \
    --preset "<a Developer → Next round button>" --until <state text> --out <scratch>/play
```

`play_check.py` starts the app in an isolated data folder, with the workspace's newest asset report. It forces the round
the preset names, presses START wherever the game waits for the player, and prints each change of the game's states with
the panel's buttons, then the rounds played and the page's errors. It exits with 1 if the game never reaches `--until`,
never comes back to Idle, or throws. The presets are the game's buttons in `GameView.vue` (`presets`). For Burning Crown,
`--preset "Main: win ≥ 4× bet (enters the tetra round)" --until Tetra` covers the main round, the tetra round and the
match end.

Read the output against the C++ changes. For example:

- a button the C++ now disables in a state shows `off` in that state;
- after a bet change, the round's bets in "rounds" are what the C++ computes now;
- the game comes back to Idle.

Known noise:

- a `404` for `/api/rss-sync/report`: the isolated data folder has no sync report;
- the tetra screen's screenshot is black in headless Chromium, before and after a sync.

When a screenshot or a state looks wrong, run the same check on the code before the sync before you blame the change:
save `git diff`, `git stash`, build, play, `git stash pop`, build. Visual changes, such as new images or element ids,
need the user's eyes: ask them to look at the Play page.

## Step 7: Report, and commit when asked

Report to the user:

- each synced file: what changed, with the C++ commit and its subject;
- what you did not port, and why (QA-only, an unported round, an unported dependency and its stand-in);
- the comparison before and after for the touched files, and the compile check;
- the tests and the playthrough, and what you could not verify, such as visuals.

Commit only when the user asks, but tell them the export needs the commit. Follow the repository's style: a subject
line, then a bulleted body with one item per change and the C++ commit it follows. End it with the attribution lines
from the session's system reminder. Example subject: `Import the C++ game sources' changes into the TypeScript`.

## The automated route

`node frontend/src/game/export/import-cpp.mjs $GAMES/game --agent` (or **Developer → Import from C++ → Port with
Claude Code** on the Play page) runs `claude -p` for each changed file in a git worktree. It keeps only what
type-checks and translates no farther from the C++. Use it when many files changed. Review its result with steps 4, 6
and 7 all the same: it does not play the game or judge an idiom.

## Pitfalls seen in syncs

- **Notes about other branches.** A note can describe work that is on another branch. Check the file on the current
  branch before relying on it. For example, `ViewManager.ts` is fully re-ported only on `nordic-rush`.
- **TypeScript arrays have holes.** C++ `resize` default-constructs elements, but a TypeScript array whose `length` was
  raised has holes. When the C++ starts reading another slot (for example `SetupViews` using the tetra rules' last
  result slot), check that the TypeScript always has a value there. Burning Crown's tetra rules use the main slot.
- **A bet setup that moves.** When bets are set up by another object (the tetra round's bets moved into
  `ViewManager.SetupBets` on 2026-10-27), play a round of every type to see that each round's bets are right.
- **Synced files with no TypeScript change.** Files that needed no change still need `--only` in step 5, or
  `import-cpp.mjs` keeps listing them.
