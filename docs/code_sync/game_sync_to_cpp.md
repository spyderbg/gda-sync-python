# Sync the browser game's TypeScript into a game's C++

Instructions for Claude Code. They bring a game's C++ (`games/game/alpha_family/plugins/<plugin>`) up to date with its
TypeScript port (`frontend/src/game/alpha_family/plugins/<plugin>`), after the TypeScript changed in the browser. They
work for any game that is already ported.

The direction is TypeScript → C++, straight into the games repository's working tree. The opposite direction is
[game_sync.md](game_sync.md). Read its "How the port is tracked" section first: this document uses the same manifest
and tools. The browser's **Developer → Export to C++** goes the same way, but writes a whole plugin into an export
folder for a person to copy. This sync edits the plugin's C++ in place, one change at a time.

In Claude Code, `/game-sync-to-cpp <plugin>` (`.claude/commands/game-sync-to-cpp.md`) works out the inputs below and
follows this document.

## Scope: the game's folder only

This sync writes C++ in one folder: **`$GAMES/game/alpha_family/plugins/<plugin>/`**, the game's plugin (its
`src/Egt/<Module>/` sources and CMake files). It writes nothing else, with one exception: once the user has committed
the C++, `port-manifest.mjs --only` records the sync in `frontend/src/game/export/PortManifest.json` (step 7). That file
is bookkeeping, not code.

It reads, and never writes:

| Read only | What it is |
| --- | --- |
| `frontend/src/game/**` | The TypeScript, which is the source of this sync, and the tools. A TypeScript problem goes in the report. |
| `$GAMES/game/alpha_family/libs`, `$GAMES/game/alpha_family/plugins/alpha_family` | The alpha_family libraries and the family's debug tools, which every game shares |
| `$GAMES/game/libs`, `$GAMES/game/plugins` | The engine (Fsm, Game, GameVideoCtrl...) and the shared plugins (CappingSplashView...) |
| `$GAMES/hat_libs`, `$GAMES/integration`, `$GAMES/kernel`, `$GAMES/core`, `$GAMES/game_core` | The shared libraries and the integrations |
| `$GAMES/configs/<game>/modules/*.json` | The modules config, which the export generates |
| `$GAMES/resources/<plugin>/` | The views, IData, math files and images. The browser game edits these directly in the games repository. |
| `$GAMES/build/` | The build folder. The compile check is syntax only and writes nothing. |

A TypeScript change that needs any of these changed is **not ported**. Stop and tell the user what it needs and where
(step 2, "Stop and ask"). Never work around a missing library feature inside the plugin unless the user chooses that.
Other games' plugins are out of scope too, even when their files are copies of this game's: one sync, one game.

## Inputs

| Name | Example | Where it comes from |
| --- | --- | --- |
| `GAMES` | `/media/plamen/data/Egt/games` | `games_root_path` in `config/workspace.json` |
| `<plugin>` | `burning_crown_tetra_spins_10` | The plugin's folder in `frontend/src/game/alpha_family/plugins/` and `$GAMES/game/alpha_family/plugins/` |
| `<Game>` | `BurningCrownTetraSpins10` | The prefix of the plugin's modules (`<Game>Fsm`, `<Game>Math`, `<Game>View`...) |
| `CPP` | `$GAMES/game/alpha_family/plugins/<plugin>/src/Egt` | The plugin's C++ sources: the only folder this sync edits |
| workspace | `burning_crown_tetra_spins_10` | The workspace's `id` in `config/workspace.json` whose `id` is `<plugin>` or starts with it, for an export (step 5) |
| scratch | the session's scratchpad | The translations, the scratch copy of the sources, the diffs. Never the repositories. |

All commands run from this repository's root (`/media/plamen/data/Python/gda-sync`). The shell is zsh. Quote globs,
and keep apostrophes out of single-quoted `node -e` scripts.

## The games repository's rules

The C++ is the games repository's code. Its `AGENTS.md` and `.claude/rules/` apply to every edit in this sync:

- **Provenance before code.** For every foreign type, field, method and include you use, name the `file:line` where you
  read its definition in this session. "A wrong choice would still compile" means you need a source, not a decision.
- **Edit and Write only.** Never patch the C++ from a shell (`sed -i`, a heredoc, a redirect).
- **Comments only where the code cannot speak.** Don't carry over TypeScript comments that retell the code or explain
  the browser.
- **Never change the checkout while a Game Creator run is live** (`tools/GameCreator/AGENTS.md`), not even an
  uncommitted file.
- **Riglane specs** (`.riglane/specs/`). If the Riglane tools (`spec_search`) are available, check the specs of the
  area you touch. Otherwise, say in the report that you did not.

## Only interfaces go in the runtime

The user's rule (2026-11-03): the C++ this sync writes never adds, removes or gets a class that is not an interface
through the runtime. Not `RuntimeAdd<GameBackgroundView>(this)`, `RuntimeRemove<GameBackgroundView>()`,
`RuntimeTryGetConst<GameBackgroundView>()` or `RuntimeGet<CoinsBarView>()`. The runtime holds interfaces only: an `I*`
class with its `RuntimeCategory` (`RuntimeAdd<IGameBackgroundView>(this)`) and its `Events`
(`RuntimeAdd<IGameBackgroundView::Events>(&m_events)`).

In the TypeScript, the same pattern is a class's own runtime token: a `@cppName` constant such as
`export const GameBackgroundViewToken = new RuntimeToken<GameBackgroundView>('GameBackgroundView')`, with
`RuntimeAdd(GameBackgroundViewToken, this)` or `RuntimeTryGetConst(GameBackgroundViewToken)`. Find it with
`grep -rn "new RuntimeToken<" frontend/src/game/alpha_family/plugins/<plugin> --include='*.ts'`. A change that adds or
uses one is not ported as it is: see "Stop and ask". Other games' existing C++ that does it (Burning Hot Coins'
`CoinsBarView`, `CreditsWinBarView`) is not this sync's to change.

Interfaces stay as they are, by the user's rule: never change an interface, and never add a getter to one. A view that
needs another view's state gets that view's interface from the runtime and casts it to the plugin's class:

| C++ | TypeScript |
| --- | --- |
| `dynamic_cast<const GameBackgroundView*>(RuntimeTryGetConst<IGameBackgroundView>())` | `const background = this.RuntimeTryGetConst(IGameBackgroundView);` then `background instanceof GameBackgroundView` |

The cast gives `nullptr` (`false` in TypeScript) when the runtime holds another implementation, such as the
automation's stub views, so handle that case. RTTI is on in the games' build: no compile command has `-fno-rtti`, and
the engine uses `dynamic_cast` (`GameVideoCtrl/ViewElements/AnimElement.cpp`). The interface must be polymorphic (a
virtual destructor), and the class must be the plugin's own, built into the same library as the code that casts.

## Step 0: Preconditions

1. **The game is ported.** `frontend/src/game/alpha_family/plugins/<plugin>` and `$CPP` both exist. A game whose C++
   does not exist yet is a new plugin, not a sync. Stop and tell the user.
2. **The games checkout can be changed.**
   - Run `pgrep -af 'archon|GameCreator|game-creator'`. If anything shows, or the user has a Creator run going, ask
     before the first edit.
   - Run `git -C $GAMES status --short -- game/alpha_family/plugins/<plugin>`. The plugin's folder must be clean, so
     that `git diff` shows only this sync. If it is not, ask the user.
   - Note `git -C $GAMES branch --show-current` for the report.
3. **The C++ has nothing the TypeScript lacks.** A C++ file that changed since its port has changes the TypeScript does
   not have. Writing the TypeScript's version over it would lose them. List the game's files whose C++ changed:

   ```sh
   node frontend/src/game/export/import-cpp.mjs $GAMES/game --json 2>/dev/null | node -e '
   const plugin = process.argv[1];
   const report = JSON.parse(require("fs").readFileSync(0, "utf8"));
   const mine = report.changed.filter(item => item.ts.startsWith(`alpha_family/plugins/${plugin}/`));
   for (const item of mine) console.log(`${item.ts}  since ${item.from.slice(0, 9)}${item.uncommitted ? "  UNCOMMITTED C++" : ""}\n  ${item.commits.join("\n  ")}`);
   console.log(`${mine.length} files of the game have C++ changes the TypeScript does not port; ${report.changed.length - mine.length} other files do (libraries, other games)`);' <plugin>
   ```

   If a file you are about to sync (step 1) is listed, stop. The user runs `/game-sync <plugin>` first, then this sync.
   Files that are listed but have no TypeScript change can wait. Mention them in the report.
4. **The TypeScript is committed.** Run `git status --short -- frontend/src/game/alpha_family/plugins/<plugin>`. Step 7
   records each file's hash, and the next sync finds the TypeScript as it was by that hash in git history. Ask the user
   whether to include uncommitted TypeScript. If they do, it must be committed as it is, before or with the manifest.

## Step 1: Find what changed in the TypeScript

```sh
node -e '
const plugin = process.argv[1];
const { execFileSync } = require("child_process"), fs = require("fs"), crypto = require("crypto");
const sha = data => crypto.createHash("sha256").update(data).digest("hex");
const git = (...a) => execFileSync("git", a, { maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
const manifest = require("./frontend/src/game/export/PortManifest.json");
const root = `alpha_family/plugins/${plugin}/`;
const dirty = p => git("status", "--porcelain", "--", p).length ? "  (uncommitted)" : "";
for (const [ts, entry] of Object.entries(manifest)) {
  if (!ts.startsWith(root)) continue;
  const path = `frontend/src/game/${ts}`;
  const now = fs.existsSync(path) ? sha(fs.readFileSync(path)) : null;
  if (now === entry.sha256) continue;
  const ported = String(git("log", "--format=%h", "--", path)).split("\n").filter(Boolean)
    .find(c => { try { return sha(git("show", `${c}:${path}`)) === entry.sha256; } catch { return false; } });
  console.log(`${now ? "CHANGED" : "DELETED"} ${ts}\n  ported at ${ported ?? "NOT IN HISTORY"}${dirty(path)}; C++ ${entry.cpp.join(", ")}`);
}
for (const path of String(git("ls-files", "--cached", "--others", "--exclude-standard", `frontend/src/game/${root}`)).split("\n").filter(Boolean)) {
  const ts = path.slice("frontend/src/game/".length);
  if (ts.endsWith(".ts") && !(ts in manifest)) console.log(`${ts.endsWith(".description.ts") ? "GENERATOR INPUT" : "NOT PORTED"} ${ts}${dirty(path)}\n  last changed ${String(git("log", "-1", "--format=%h %ad %s", "--date=short", "--", path)).trim() || "never committed"}`);
}' <plugin>
```

| Listed as | Meaning |
| --- | --- |
| `CHANGED` | Ported TypeScript changed since its port. `ported at` is the commit that has it as it was ported. |
| `DELETED` | Ported TypeScript that no longer exists. Its C++ may have to go. |
| `NOT PORTED` | TypeScript of the game with no C++ of its path: a class made in the browser, or a browser-only helper |
| `GENERATOR INPUT` | `MathRules.description.ts`, from which the export generates `MathRules.cpp`. Check its commits since the oldest `ported at` with `git log`. |

`NOT IN HISTORY` means the TypeScript as it was ported was never committed. Step 3 cannot translate it, so diff the
current translation against the C++ directly (`compare.mjs --ts <ts> --diff <C++ path>`) and read it with care.

For each `CHANGED` file, read the commits and the whole diff. `git diff` includes uncommitted changes:

```sh
git log --format='%h %ad %an%n    %s%n%b' --date=short <ported at>..HEAD -- frontend/src/game/<ts>
git diff <ported at> -- frontend/src/game/<ts>
```

**Group the changes by feature.** The commit that made a change usually made it in several files. Port a feature whole
or not at all, never half of one. `git show --stat <commit> -- frontend/src/game` shows what else the commit changed.
A change in `engine/`, `integration/`, `alpha_family/libs/` or `hat_libs/` in the same commit usually means the
feature needs it (see "Stop and ask").

Then check the ported TypeScript outside the game, which this sync does not touch:

```sh
node -e '
const plugin = process.argv[1];
const fs = require("fs"), crypto = require("crypto");
const sha = data => crypto.createHash("sha256").update(data).digest("hex");
const manifest = require("./frontend/src/game/export/PortManifest.json");
const changed = Object.entries(manifest).filter(([ts, entry]) => !ts.startsWith(`alpha_family/plugins/${plugin}/`)
  && (!fs.existsSync(`frontend/src/game/${ts}`) || sha(fs.readFileSync(`frontend/src/game/${ts}`)) !== entry.sha256)).map(([ts]) => ts);
console.log(changed.length ? `Changed since their port, outside the game (not synced here):\n  ${changed.join("\n  ")}` : "No ported TypeScript outside the game changed since its port.");' <plugin>
```

`engine/`, `integration/` and `hat_libs/` are not in the manifest. `git log <oldest ported at>..HEAD -- frontend/src/game/engine frontend/src/game/integration frontend/src/game/hat_libs`
lists their commits. List all of them in the report as not synced. When the game's change uses one of them, see "Stop and ask".

## Step 2: Classify each change

| TypeScript change | C++ |
| --- | --- |
| Inside `BrowserOnly(() => …)`, a member tagged `@browserOnly`, an IData reload (`WatchConfig`, `ReloadConfig`), image or movie preloading, the browser's tools (`GameServer`, `debug/`) | Nothing. The browser needs it, and C++ does not. |
| A refactor whose translation does not change (an empty delta in step 3) | Nothing. The file still counts as synced in step 7. |
| A behaviour change in the plugin's own classes | Port it (step 4). |
| A field added to a `*.data.ts` of the plugin | The same field, order and default in its `.data.h`. A `.data.h` with no `.data.ts` has its structs in another TypeScript file. |
| `<Game>View.ts`: `CreateViews()` (a view added, moved between groups, removed) | `<Game>View.cpp`'s `CreateViews()`, by hand. Check it against an export (step 5). |
| `<Game>Fsm.ts`: `CreateBuilder()` | `<Game>Fsm.cpp`'s `CreateBuilder()`, by hand. Every state it names must exist in the C++ states library. |
| `MathRules.description.ts` | `MathRules.cpp` is generated (`export/MathExporter.ts`). Write what the generator writes for the changed rule, and check it against an export (step 5). |
| A new state, view, visual or software button class (`NOT PORTED`) | A new `.h` and `.cpp` at the mirrored path in `$CPP` (step 4, "New classes"). |
| A new class of another kind, such as a helper or a subclass of an engine class | Port it if the plugin can express it with the C++ libraries as they are. Otherwise, stop and ask. |
| A class's own runtime token, added or used (`RuntimeAdd(XToken, this)`, `RuntimeTryGetConst(XToken)`) | Not ported: only interfaces go in the runtime. Stop and ask. |
| `DELETED` | Delete its `.h` and `.cpp` once nothing in the plugin includes them (`grep -rn '<Name>.h' $CPP`), and remove it from `CreateViews()`. |
| New element ids, images or IData keys | Nothing in the code. Check that the resources have them (`grep -n '<id>' $GAMES/resources/<plugin>/v/1920x1080/<View>.json`). If not, tell the user: the resources are outside this sync. |
| The modules config (a module or its config added) | Outside this sync. Tell the user what the export would write. |

### Stop and ask

Stop, change nothing for that feature, and tell the user what the C++ would need, when the change:

- calls a library API the C++ library does not have, such as a new interface method or event in a `*.bridge.ts`, a
  `BaseView` or `ButtonView` member, or an engine function;
- relies on something TypeScript allows and C++ does not, such as a subclass that overrides a member the C++ declares
  by value, or a non-virtual C++ method (look it up: `file:line`);
- needs the shared TypeScript changes of step 1;
- puts a class that is not an interface in the runtime, or gets one from it ("Only interfaces go in the runtime");
- changes the game's math (`MathRules.description.ts`, the `SimulatorConfig`). Math is certified behaviour: ask the
  user before you port it, even when it lies inside the plugin.

Example, 2026-11-03: Burning Crown's Tetra panel layouts (`7c44392`) added `PanelElementsList`, a TypeScript subclass of
`ElementsList`, which overrides `Get`, `TryGet` and `Draw`. Eight views replace their `m_elementsList` with it. In C++,
`BaseView::m_elementsList` is an `ElementsList` held by value (`alpha_family/libs/src/Egt/AlphaFamilyVideoCtrl/BaseView.h:82`),
and `ElementsList::TryGet` is a non-virtual template (`libs/src/Egt/GameVideoCtrl/ViewElements/ElementsList.h:150`).
The design cannot be ported without changing the libraries, so the whole feature (the eight views and
`GameBackgroundView.IsTetraLayout`) is the user's decision. The user chose to rework the TypeScript first: `PanelLayout`,
a plugin class that each view holds beside its own list. Its first version reached the background through the view's
own runtime token, which "Only interfaces go in the runtime" then forbade. The second gets `IGameBackgroundView` and
casts it to the plugin's `GameBackgroundView`, and that one ports. When a design cannot be ported, reworking the
TypeScript into a form the plugin can express, then syncing again, keeps both sides in step.

## Step 3: Translate both versions

For a compact port, the translation of a view is far from its C++ before any change. On 2026-11-03,
`GameBackgroundView` differed by 66 lines because of 2 changed lines. To see only the change, translate the TypeScript
as it was ported and as it is now, then diff the two translations. Both are aligned with the same C++, so what they
share cancels out, and the diff is the C++ that the change implies.

The translator reads its sources from its own tree, so the TypeScript as it was ported goes in a scratch copy of
`frontend` (never into the sources). It needs only `typescript` and `@vue/tsconfig` from `node_modules`. Copy them;
never link `node_modules`.

```sh
S=<scratch>/ported
rm -rf $S <scratch>/cpp-ported <scratch>/cpp-now && mkdir -p $S/frontend/node_modules/@vue
rsync -a --exclude node_modules frontend/ $S/frontend/
cp -r frontend/node_modules/typescript $S/frontend/node_modules/
cp -r frontend/node_modules/@vue/tsconfig $S/frontend/node_modules/@vue/
# each CHANGED file as it was ported (its "ported at" commit from step 1), into the copy only
git show <ported at>:frontend/src/game/<ts> > $S/frontend/src/game/<ts>
# the same CHANGED files, in both trees
node $S/frontend/src/game/export/translator/compare.mjs $GAMES/game --ts <ts>... --out <scratch>/cpp-ported > <scratch>/count-ported.txt
node frontend/src/game/export/translator/compare.mjs $GAMES/game --ts <ts>... --out <scratch>/cpp-now > <scratch>/count-now.txt
(cd <scratch> && diff -ru cpp-ported cpp-now > delta.diff)
```

This takes a few seconds. To check the copy, translate a file before you put its ported version in: the two
translations must be identical. Make the copy again if the TypeScript changes during the session.

For a `NOT PORTED` class, `node frontend/src/game/export/translator/translate.mjs $GAMES/game <ts>` prints its
translation as JSON (`files`, `errors`). It translates states, views, visuals and software buttons only, and for
anything else it gives the reason.

### Read the delta with care

The delta is a guide, not the C++ to paste. In it:

- **The change itself.** Port these lines (step 4).
- **The translator's defaults.** A new method is declared `virtual` and never `const`. A new member is put in a new
  `protected:` section. Write what the C++ class's own declarations do.
- **Calls the translator could not resolve,** rendered literally, such as `m_elementsList.TryGet(std::string(Id),
  TextElement)` where the C++ writes `TryGet<TextElement>(Id)`. They appear when the TypeScript now goes through a type
  with no C++ counterpart (on 2026-11-03, `PanelElementsList`). They are a dependency on unported code, not a change to
  port: see "Stop and ask".
- **A member redeclared in a derived class,** such as `ElementsList m_elementsList = PanelElementsList{};`. In C++ this
  slices the object and hides the base's member. It is never right.
- **No C++ type for a new class.** A view that uses a new plugin class is not translated (`no C++ type for PanelLayout`)
  until that class's header exists in `$CPP`. Write the new class's `.h` first, then translate both versions again.

## Step 4: Write the C++

Open the whole C++ file and the TypeScript file next to it. Make each change of the delta at the same place in the C++
(the method of the same name), written the way the C++ around it is written:

| TypeScript | C++ |
| --- | --- |
| `this.m_elementsList.TryGet(id)?.SetHidden(x)` (compact views) | What the C++ file uses for that element: `m_elementsList[id].SetHidden(x)` or `m_elementsList.Get<T>(id)` |
| `if (c) return;`, `if (Unless(c)) return v;`, `if (AssertIf(c)) return v;` | `ReturnIf(c);`, `ReturnUnless(c, v);`, `AssertReturnIf(c, v);` |
| `const x: boolean = …`, `const x = …`, `let x = …` | `const bool x = …`, `const auto x = …`, `auto x = …` |
| `this.RuntimeGet(IX)`, `this.Parent(IX)`, `this.Static(T)` | `RuntimeGet<IX>()`, `Parent<IX>()`, `Static<T>()` |
| `{ enabled: x, light: HwButtonLight.On }` | `{.enabled = x, .light = HwButtonLight::On}` |
| `Copy(x)` | `x` (a copy already) |
| `void x;`, a parameter `_x` | `(void)x;`, `[[maybe_unused]] x` |
| `const XId = 'x';` at the top of the module | `constexpr std::string_view XId = "x";` in the `.cpp`'s anonymous namespace, where the C++ keeps its ids |
| `super.Draw(drawList)` | `<Base>::Draw(drawList)`, the base the `.h` names |
| A new method | Declared in the `.h` in the section the TypeScript's `private`/`protected` says, `const` where it changes nothing, `override` where it overrides, defined in the `.cpp` in the TypeScript's order |
| `throw new Error(…)` | What the C++ around it does for that case: `assert`, `AssertReturnIf`, `EgtAError`. Never invent an exception. |
| `EgtAInfo(…)`, `EgtALogCategoryClass(Class, 'Name')` | The same macros |

`frontend/src/game/README.md` ("The TypeScript to C++ translator") has the full correspondence. The translator's
output for a line is a good first draft. Then check every name it uses against the C++ headers (provenance).

Add the `#include` of every new name where the C++ file keeps its includes. Read the header first.

### What not to port

- A TypeScript comment that explains how the browser differs, such as `// (C++ draws once into a dummy list to activate
  the lazy load: the browser's elements list loads in Init)`. Leave the C++ that the comment describes as it is.
- `TryGet(…)?.` where the C++ file uses `[]` or `Get`. The TypeScript keeps it for the browser's sake (game_sync.md,
  "Match the file's form"). Keep the C++'s form.
- A change to a part the C++ never had. Say so in the report.

### New classes

1. Create the `.h` and `.cpp` at the mirrored path in `$CPP`. Model them on a neighbour of the same kind: the
   namespace, includes, `#pragma once`, and how it declares its ids and members.
2. Register it: a view in `<Game>View.cpp`'s `CreateViews()`, in the group the TypeScript puts it in, named by its
   class name. A state goes in the Fsm's `CreateBuilder()`.
3. The module's `CMakeLists.txt` finds its sources by itself (`egt_create_static_library` without a source list), so
   it needs no change. The build sees a new file after CMake configures again.

### Format

```sh
git -C $GAMES clang-format-17 --binary clang-format-17 --diff -- game/alpha_family/plugins/<plugin>
```

This shows clang-format 17's changes to the lines that differ from HEAD, with the repository's `.clang-format` files
(`game/.clang-format` inherits from the root one). Apply them with Edit. Never let it write the files.

## Step 5: Check the generated files against an export (when they changed)

Skip this step unless `<Game>View.ts`, `<Game>Fsm.ts` or `MathRules.description.ts` changed. The export generates their
C++ from the browser game's running definition. Only the Play page can run it. Ask the user to press **Developer →
Export to C++** on the Play page, then compare its generated files with your edits:

```sh
E=$(ls -td ~/.local/share/egt-gda-sync/game-exports/<workspace>/*/ | head -1)
grep -A40 '^## Generated' $E/README.md        # the generated files
diff -u $GAMES/game/alpha_family/plugins/<plugin>/src/Egt/<Game>View/<Game>View.cpp $E/game/alpha_family/plugins/<plugin>/src/Egt/<Game>View/<Game>View.cpp
```

The generated file may differ in form from the hand-written C++. Use it to check what is registered, in what order and
with what values, not to replace the file. Never copy the export over the plugin.

## Step 6: Check

1. **The translation moved closer.** Translate the TypeScript as it is now against the edited C++:

   ```sh
   node frontend/src/game/export/translator/compare.mjs $GAMES/game --ts <ts>... > <scratch>/count-after.txt
   node frontend/src/game/export/translator/compare.mjs $GAMES/game --ts <ts> --diff <C++ path substring>
   ```

   Each file's count should come down from `count-now.txt` to about its `count-ported.txt`. None of `delta.diff`'s
   lines should remain in the `--diff` output, except where you wrote the C++ better on purpose (`const`, no
   `virtual`). List those in the report.
2. **It compiles.** Syntax-check every `.cpp` of the plugin, because a header change can break any file that includes
   it. This takes about 11 seconds and writes nothing:

   ```sh
   node frontend/src/game/export/translator/CompileCheck.mjs $GAMES/game $GAMES/game $(git -C $GAMES/game ls-files 'alpha_family/plugins/<plugin>/src/*.cpp')
   ```

   Expect `0 of N .cpp files do not compile`. A new `.cpp` has no entry in `compile_commands.json` until CMake
   configures again, so check it with the command of a `.cpp` beside it:

   ```sh
   node -e '
   const [db, neighbour, file] = process.argv.slice(1);
   const entry = JSON.parse(require("fs").readFileSync(db, "utf8")).find(e => e.file === neighbour);
   const command = entry.command.replace(/\s-o\s+\S+/, "").replace(/\s-c\s+\S+$/, "").replace(entry.file, "");
   const dir = require("path").dirname(neighbour);
   try { require("child_process").execSync(`${command} -iquote${dir} -fsyntax-only -fno-color-diagnostics -c ${file}`, { cwd: entry.directory, stdio: ["ignore", "ignore", "pipe"] }); console.log("compiles:", file); }
   catch (e) { console.log("DOES NOT COMPILE", file); console.log(String(e.stderr).split("\n").filter(l => /error:/.test(l)).slice(0, 3).join("\n")); process.exitCode = 1; }' \
     $GAMES/build/user-dbg-clang/compile_commands.json $CPP/<Module>/<neighbour>.cpp $CPP/<Module>/<new>.cpp
   ```
3. **Only interfaces in the runtime.** In the files this sync changed or added, no runtime call names a class that is
   not an interface. This must print nothing:

   ```sh
   cd $GAMES && { git diff --name-only -- game/alpha_family/plugins/<plugin>; git ls-files --others --exclude-standard -- game/alpha_family/plugins/<plugin>; } \
     | xargs grep -nP 'Runtime(Add|Remove|Get|TryGet|GetConst|TryGetConst)<(?!(\w+::)*I[A-Z])'
   ```

   The pattern takes an interface to be a name of `I` and a capital letter, qualified or not (`IVideo`,
   `Game::ILocalization`, `IGameBackgroundView::Events`). It flags `InfoSwButtonView` and `GameBackgroundView`.
4. **A real build, only if the user agrees.** It writes into their build folder. Each module is a target
   `Egt<Module>Static`, such as `ninja -C $GAMES/build/user-dbg-clang EgtBurningCrownTetraSpins10ViewStatic`. Build the
   modules you touched. After a new file, run `cmake --preset user-dbg-clang` first, from `$GAMES`.
5. **Behaviour.** This sync cannot play the C++ game, and the browser game plays the TypeScript, which did not change.
   Say what the user should look at in the C++ game, such as the round, the screen or the button the change touches.
   In the games repository, `/egt-qa-play` drives a built game.

## Step 7: Report, then commit and record when asked

Report to the user:

- each synced feature: its TypeScript commit and subject, and the C++ files it changed;
- what you did not port, and why: browser-only, nothing changed in the translation, or blocked (what it needs, with
  `file:line`);
- the shared TypeScript changes that this sync does not cover (step 1);
- the counts before and after (step 6), the compile check, and what you could not verify;
- the games repository's branch and `git -C $GAMES diff --stat`.

**Commit only when the user asks.** The games repository is shared: never push, and ask before committing on its
default branch (`master`). Follow its style: `<Game name>: <what>` (`Burning Crown Tetra Spins 10: remove unused Tetra
view entries`), then a body that names the browser game's commit it follows. End it with the attribution lines from
the session's system reminder.

**Record the sync after the C++ commit,** so that neither direction lists these files again:

```sh
node frontend/src/game/export/port-manifest.mjs $GAMES/game --only <ts path> <ts path> …
```

Name every file that is synced: the ported ones, the `NOT PORTED` ones that now have C++, and the ones that needed
nothing. Don't name a file whose change is blocked or only partly ported: it must stay listed for the next sync. Always
pass `--only`. Without it, every other changed entry is marked as ported. Then check that step 1 lists none of the
recorded files, and that `import-cpp.mjs` (step 0) does not list them either.

The manifest records the TypeScript's hash. Commit `PortManifest.json` together with the TypeScript as it is, in this
repository, when the user asks.

## Pitfalls

- **A two-sided change.** If the C++ of a file changed since its port as well (step 0), this sync would overwrite it.
  Sync the C++ into the TypeScript first.
- **Copies across games.** Burning Hot Coins, Nordic Tale and Joker Reels Coins 10 share copied views. A change in one
  game's TypeScript is not a change in the others' C++. Tell the user if the same TypeScript change looks needed
  elsewhere.
- **TypeScript arrays have holes, `Map`s key objects by identity.** C++ `resize` default-constructs elements, and a
  `std::map` compares its keys' values (`@cppKey` in the TypeScript). Port the meaning, not the container calls.
- **Hot reload code.** View files reload in C++ debug and QA builds too (`BaseView::ReloadElementsList`), but IData
  files do not. A TypeScript change for IData reload is browser-only. A change for view reload needs the C++
  `ReloadElementsList` path checked. The TypeScript's `UpdateFromResource()` (an in-place reload) has no C++
  counterpart.
- **Lazy loading.** TypeScript's `InitElementsList` loads the list at once. C++'s only sets it up, and the list loads on
  its first `Draw`. A C++ reload of a view that does not draw, such as a hidden one, calls
  `m_elementsList.LoadFromResource()` itself, as `BaseView::ReloadElementsList` does.
- **Bind only a loaded list.** C++ `ButtonView::SetButtonId` asserts when the element is missing (`ButtonView.h:191`).
  Code that rebinds outside the loaded callback, such as in `Process`, waits for `m_elementsList.IsLoaded()`.
