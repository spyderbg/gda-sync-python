# The browser game

`frontend/src/game` plays the active workspace's game in the browser: **Play**, in the sidebar's **Game** section. It is
a port of the C++ game (`games/game/alpha_family`) that keeps the C++ structure, so that games and features developed
here can be exported back to C++.

It plays **Burning Crown Tetra Spins 10**: the main round, the tetra round (four sub screens, sticky and copied crowns),
the big win movies, the maximum award (capping) splash, autoplay, the bet and language menus, English and Italian, the
cabinet's info screen (the help pages of the game's RTF) and its topper screen.

## What it loads, and from where

Every file operation goes through the backend (`egt_gda_sync/game/project.py`):

| What | Endpoint | C++ counterpart |
| --- | --- | --- |
| The game's modules and their config | `GET /api/game/project` → `modules` (`configs/<workspace id>/modules/<Name>Modules.json`) | ModuleManager config |
| The family's modules (the capping splash...) | `GET /api/game/project` → `familyModules` (`configs/alpha_family/modules/AlphaGameModules.json`) | ModuleManager config |
| The descriptors' entries (images, sequences, movies, fonts, styles, audio, IData, views, RTFs) | `GET /api/game/project` → `descriptors` | ResourceManager |
| The math file, view configs and views | `GET /api/game/data?file=<path in the game folder>` | `IResources::Get<RssIData>`, ElementsList |
| When the watched view and descriptor files last changed | `GET /api/game/file-stamps?file=...&file=...` | FileWatch (inotify) |
| Images (DDS decoded), movies, audio, fonts, an RTF's laid-out pages | `GET /api/rss-sync/preview?file=` (the asset library's preview) | VideoManager, AudioManager, RtfElement |
| The assets the asset library lists | `GET /api/asset-report` | – |
| The C++ plugin's sources, which an export copies | `GET /api/game/cpp?folder=` (the game folder beside the resources: `games/game`) | – |
| An export | `POST /api/game/export` (written to the app data folder's `game-exports`) | – |

The game uses the same resources the asset library lists: a descriptor entry whose file the asset report does not list
as available shows under **Developer → Resources**.

## Structure

The folders mirror the C++ ones, and the classes keep their C++ names and methods (`RuntimeGet`, `Transit`, `ReactOn`,
`SetupViews`, `CalculateRound`...), so a TypeScript class reads like its `.h`/`.cpp`:

| `src/game/...` | C++ |
| --- | --- |
| `engine/Core`, `engine/GameCore` | `Egt::Core` (Event, EventQueue), `Egt::GameCore` (RuntimeAccess, IRng engines, Stopwatch) |
| `hat_libs/tweeny`, `hat_libs/tweeny_extend/tweeny_extend_transform` | `games/hat_libs/tweeny` (all of it: tweens, combinators, manager, scopes, easings, inspector info; `tests/` are the C++ tests) and its transform tweens |
| `hat_libs/egt_hpp`, `hat_libs/egt_math` | what tweeny needs of them: `hpp::event`, `hpp::sentinel`, `math::transformf` (position, rotation, scale) |
| `engine/Fsm` | `games/game/libs/src/Egt/Fsm` (State, Machine, FsmBuilder) |
| `engine/Game` | `Egt/Game` (Currencies, IMathTypes, IResources, RuntimeImport services, GameFsm, CountdownTimer) |
| `engine/GameVideoCtrl` | `Egt/GameVideoCtrl` (ElementsList; Image, Anim (`AnimationClip/` ImageSeqElement and MovieElement), Text, Button and Rtf elements; `TweenyExtend/`; IVideo, IVideoManager) |
| `engine/ResourceManager`, `VideoManager`, `AudioManager`, `ModuleManager`, `FileWatch` | the plugins of the same names |
| `plugins/CappingSplashView` | `games/game/plugins/src/Egt/CappingSplashView`, a module of every alpha family game |
| `alpha_family/libs/AlphaFamily` | `alpha_family/libs/src/Egt/AlphaFamily` (math rules, states and views interfaces) |
| `alpha_family/libs/AlphaFamilyStatesLibrary` | the states library (managers, Idle, Match, MainRound, TetraRound, MatchCappingApplied...) |
| `alpha_family/libs/AlphaFamilyVideoCtrl` | BaseView, ButtonView, NumericBarView, MenuView |
| `alpha_family/plugins/burning_crown_tetra_spins_10/<Module>` | `alpha_family/plugins/burning_crown_tetra_spins_10/src/Egt/<Module>`: Math, Fsm, View, InfoView, TopperView |
| `integration/AlphaFamilyGameflow` | `integration/libs/src/Egt/AlphaFamilyGameflow` |
| `integration/BrowserKernel` | the kernel integrations (playground, hat...): wallet, limits, localization, hardware buttons |
| `app/GameApp.ts`, `app/ModuleRegistry.ts` | the ModuleManager and the plugins it loads |
| `authoring/`, `export/` | no counterpart: the math description and the C++ export (below) |

A few TypeScript necessities:

- Interfaces do not exist at runtime, so each has a token of the same name: `RuntimeGet(IReelsView)` is
  `RuntimeGet<IReelsView>()`, `RuntimeGet(IReelsView.Events)` is `RuntimeGet<IReelsView::Events>()`.
- `std::variant` phases are classes: `std::get_if<SpinReelsPhase>(&phase)` is `phase instanceof SpinReelsPhase`.
- tweeny is C++'s, by its C++ names: `import * as tweeny from '.../hat_libs/tweeny/tweeny'`, then `tweeny.start(action,
  'Scope')`, `tweeny.sequence(...)`, `action.on_end.connect(...)`, `tweeny.ease.back_stop`. Durations are milliseconds
  (C++ `duration_t`). An action is a value: `start` runs a copy, which `stop`/`pause`/`is_running` find by the action's
  id. The video manager updates the started tweens every frame (`tweeny.update`, as `VideoManager::Process`). A
  tweened value C++ takes by reference is `tweeny.ref(object, 'field')`; an element's tweens end once its elements list
  releases it (C++'s `ElementPtr` sentinel).
- Several small C++ headers are one file where they only declare tokens (`IMenuViews.bridge.ts`, `IOverlayViews.bridge.ts`).

Where the browser differs from a cabinet:

- The info and topper screens are canvases under the game (**Info screen**, **Topper**); Info opens the info screen.
  The topper screen takes the size of its picture, which on a cabinet the integration's viewport has.
- An RTF is laid out by the backend and drawn with the app's font, not the RTF Tool's renderer and the project's fonts:
  the help pages are close to the cabinet's, not exact.
- Movies play in the browser's video player, muted (their sounds are audio events), composed with their `valpha` alpha.
  They load once the game's images have loaded, where C++ loads and starts them when the element is made.

Not ported: the rounds this game does not have (free, extra, hold and spin, wheel, gamble, coins), whose states are not
in its machine. Their reel rules are ported (expanding symbols, collectors, the hold and spin trigger) but untested in
play, since Burning Crown does not use them.

## Playing and developing

- Keys: Space/Enter START, A autoplay, ↑/↓ bet, M max bet, I info, C cashout. The panel under the screen has the same
  buttons, Exit (back to the asset library) and the credit insert; the credit is kept in the browser.
- **Developer** shows the state machine's active states and transitions, the match's wallet, the rounds played, and
  forces the next round (like the C++ RNG presets): a main win of 4× the bet or more enters the tetra round. **Maximum
  award** lowers the match's capping to 3.00, so that a main win shows the capping splash.
- A view's file (`v/1920x1080/<View>.json`, its ElementsList entry) can be edited while the game plays: within a
  second the view shows the change, as the C++ game's debug and QA builds do. Each elements list watches its file
  (IFileWatch, the FileWatch module, which polls the files' stamps), the view module passes the change to its views
  (`HandleFileChanged`), and a view loads the list again on its next `Process` (`BaseView.ReloadElementsList`), or when
  it shows if it is hidden. When the file has the same elements (by id, type and keys), such as when they moved, the
  elements change in place, so that what holds them (a view's tweens, the reels' visuals) keeps working; else they are
  made anew. Either way the view's elements-list callback runs again (C++ does not run it), which places what the view
  derives from its elements, such as the credit from its `_min` and `_max` dummies.
- The descriptors (`AllRssData.json`, `RssImagesData.json`...) are watched too (the browser game's: C++ reads them once):
  when one changes, such as when an image's file was moved or renamed and its entry's path follows it, the resource
  manager reads them again, and the elements draw the files their RssKeys now name, from their next frame. Other files
  load when the game starts: the IData (such as the reels' area, which places the reels' symbols) and the images.
- The math was checked by simulation: the main round of `var_10BCTS_8435.json` returns about 84.0–84.5% over 3 million
  rounds (the setup's `simRtp` is 84.35%), the tetra round about 100% over 600,000 rounds.

Fixed in the browser game, with the C++ of the fix in the export:

- Cashout at the tetra round's input went to the presenting of a round that does not exist (the last one has ended,
  or none has started), and the ending then asked the gameflow to end it, which throws (in C++ too). Cashout there now
  ends the tetra rounds like the exit tetra button, and the cashout follows in Idle (`TetraRoundInput.ts`, and its C++
  in `export/cpp/.../TetraRoundInput.cpp`).

Shown as C++ shows it: the wintable's crown and melon figures read `crown::5X1` and `melon::3X1`. The RTF names them
crown and melon, the math file's symbols are WILD and WATERMELON, and the info view looks the figures up by the symbols'
names.

## Adding a game or a feature

1. Math: a `<Game>Math` module whose `MathRules` builds its `ReelRoundRules` from a `MathRulesDescription`
   (`authoring/MathRulesDescription.ts`): for each round type, which rules it has and where in the math file their
   values are, like `BurningCrownTetraSpins10Math/MathRules.description.ts`. A new rule goes to
   `alpha_family/libs/AlphaFamily/Math/Reel/Rules`, to the description, its builder and `export/MathExporter.ts`.
2. States: reuse the states library, or add states there; a `<Game>Fsm` module describes the tree in `CreateBuilder()`.
3. Views: a `<Game>View` module whose `CreateViews()` adds its views in groups; views load their elements from the
   game's `v/<resolution>/*.json` by their ElementsList id.
4. Register the modules in `app/ModuleRegistry.ts` under the names the game's modules config gives them.
5. **Developer → Export to C++** writes the game's whole plugin to
   `~/.local/share/egt-gda-sync/game-exports/<workspace>/`, by its paths in the games folder (`game/...`,
   `configs/...`), with a README of what each file is:
   - generated from the browser game: `<Game>Fsm/` (`CreateBuilder()` from the state machine), `<Game>Math/`
     (`MathRules.cpp` from the math description, `SimulatorConfig/<name>.data.h` from the math file's JSON, the rest of
     the module), `<Game>View/` (the view module, its `CreateViews()` from the views) and the modules config;
   - translated from the TypeScript (below): the states, views, visuals and software buttons changed in the browser
     since they were ported, and new ones; a view comes with the visuals it uses and the other views that use them, so
     that they compile together. **Translate all the game's views from TypeScript** translates the whole view module;
   - copied from the C++ game sources (through the backend): the plugin's other sources (the views not translated, the
     info and topper modules), which the TypeScript of the same names ports;
   - updated: C++ written by hand for a browser change (`export/cpp/<path in games/game>`), such as the cashout fix of
     the states library, in place of the C++ game sources' files, with their headers;
   - skeletons for new views the translator cannot translate (`ViewSkeleton.ts`): they load their elements list and
     compile, and their TypeScript names what to port.

   `export/PortManifest.json` has, for each TypeScript file that ports C++, its C++ files and the hash of the TypeScript
   when it was ported. A ported file changed in the browser since is translated; when it cannot be, and the export
   neither generates nor updates its C++, it is listed in the README (and on the page) as C++ to update by hand, with
   the translator's reason. After a port, refresh the manifest: `node frontend/src/game/export/port-manifest.mjs
   <games/game>`.

   For Burning Crown Tetra Spins 10 the export is the plugin's 120 files (17 generated, 103 copied) and the updated
   `TetraRoundInput`; with all views translated, 34 of its views, visuals and buttons come from the TypeScript instead.
   Every exported `.cpp`, 47 of them, compiles with the games repository's clang flags
   (`build/user-dbg-clang/compile_commands.json`, syntax only), in either case, and with a view made in the browser
   added to the view module. States the exporter does not know yet are added to `export/CppExporter.ts`.

## The TypeScript to C++ translator

`export/translator` translates a class of the browser game into its `.h` and `.cpp`, in the C++ game's own form: a
state (extends `State`), a view (extends `BaseView`, `ButtonView`, `NumericBarView`...) or a view's visual (extends
`BaseVisual`). The export runs it through the backend (`POST /api/game/translate`, which needs the app's sources and
Node.js), in two passes, so that a view translates against its translated visuals' headers.

It reads the TypeScript with its types (the TypeScript compiler) and the C++ game sources' headers (`CppIndex.mjs`,
preferring the translated game's plugin): each name gets its header and C++ qualification, each interface method its
exact C++ signature, each event handler its event's argument types; a class the C++ already has keeps its own
declarations where they say what the TypeScript says. The TypeScript mirrors the C++ API (`this.Parent(IX)` is
`Parent<IX>()`, `list.TryGet(id, TextElement)` is `TryGet<TextElement>(id)`, a name of the `hat_libs` ports is its
C++ name in its namespace and header (`tweeny.delay(ms)` is `tweeny::delay(std::chrono::milliseconds(ms))`,
`tweeny.ref(this, 'm_pos')` is `m_pos`, `transformf` is `math::transformf`)), and what TypeScript says differently is
lowered: object literals to designated
initializers or `video_ctrl` points, optional chaining to pointer or `std::optional` access (or index-checked element
pointers), `instanceof` on a round's phases to `std::get`/`std::get_if`, a union parameter split with `instanceof`,
`typeof` or `IsArrayOf` to C++ overloads, array methods to `<algorithm>`, elements held by pointer and visuals by
`Ptr<T>`, the module's constants, enums and interfaces to the `.cpp`'s anonymous namespace and the class's nested
types. What it cannot express is an error with its line, never a guess: the class is then listed as C++ to update by
hand.

All 29 states of the states library, and all 37 views, visuals and software buttons of Burning Crown Tetra Spins 10
(with the info and topper screens' `InfoView` and `TopperView`), translate, and their C++ compiles. To keep TypeScript translatable, write it as the C++ is written:

- name C++ integer types where C++ needs them (`engine/GameCore/Common/Types.ts`: `uint32_t[]`, `FigureId`); use
  `IsValidIndex`/`Contains`/`RandomDevice`/`IsArrayOf` (`engine/GameCore/Common/ContainerHelpers.ts`) as the C++ uses
  `GameCore::IsValidIndex`...;
- animate with tweeny actions held in fields (`m_action = new tweeny.tween_action()`), started, stopped, paused and
  connected as C++ does (a looping animation is `repeat_precise(sequence_precise([...]))`, not a timer); get the
  elements a tween moves with `ElementsList.Find` or `CreatePtr` (C++'s `Ptr`);
- write a nested C++ struct as a namespace of its owner (`StatusLineVisualConfig.ElementConfig`), and loops where
  C++ loops (`reduce` is not translated);
- read an IData as its C++ struct (`GetIData<InfoViewConfig>`), a `std::map` of it as a `Record` (`key in record` is
  `contains`), its enums with the IData's names as values (`EInfoViewPageType.Main = 'Main'`); look a key up with
  `map.has(k)` then `map.get(k)!`, as C++ does with `contains` and `at`; a TypeScript key that stands for a C++ struct
  key (`FigureKeyString(key)`, a `Map` keys objects by identity) is tagged `@cppKey`, and is the key itself in C++;
- keep the C++'s names: view names are their class names, interface methods are the C++ interface's (all of them), a
  config struct's fields are its `.data.h`'s;
- wrap what only the browser needs (preloading frames) in `BrowserOnly(() => ...)` (`engine/GameCore/Common/BrowserOnly.ts`):
  the translation leaves it out;
- write a function statement for statement as its C++, with its blank lines and comments (the translation keeps them),
  its locals (`const credit = ...;`) and its braces: an `if` without braces of a `return`, `continue` or `break` is
  `Defensive.h`'s macro (`if (x) return v;` is `ReturnIf(x, v);`, `if (Unless(x)) return v;` `ReturnUnless(x, v);`,
  `AssertIf`/`AssertUnless` the `Assert...` ones: `engine/GameCore/Common/Defensive.ts`), one with braces an `if`;
  `assert(x)` is C's; `void x;` is `(void)x;`; a parameter `_x` is `[[maybe_unused]] x`; an empty `case X: //
  [[fallthrough]]` is `case X: [[fallthrough]];`; `const x = this.RuntimeTryGet(I); if (x) {...}` is
  `if (const auto x = ...)`;
- log as the C++ does, with its macros (`EgtATrace`, `EgtADebug`, `EgtAInfo`, `EgtAWarning`, `EgtAError` and a
  class's `EgtALogCategoryClass(Class, 'Name');` after it: `engine/GameCore/Log/LogCategory.ts`);
- say the C++ types TypeScript has not: `ConstPointer<T>` (a `const T*` result), `get_if(T, x)`
  (`std::get_if<T>(&x)`), `static_cast<size_t>(x)`, `AnyData` (`engine/GameCore/Common/Types.ts`); a derived state's
  interfaces with its base's (`[IMainRound, ...ReelRoundState.Interfaces]` is `Fsm::List<IMainRound, ReelRoundState::Interfaces>`).

### Import: the C++'s changes into the TypeScript

The other direction: the C++ game changes too (bug fixes, other games' needs), and the TypeScript follows. Each entry of
`PortManifest.json` records the C++ it ports: the games repository's commit (`cppCommit`) and each file's SHA-256 there
(`cppSha256`). `node export/import-cpp.mjs <games/game>` lists the ported files whose C++ changed since, with the commits;
with `--agent`, a Claude Code agent (`claude -p`) ports each change into the TypeScript, statement for statement. It works
in a git worktree of the app's sources, may only edit `frontend/src/game` and run the type check and `compare.mjs`, and
what it does is checked deterministically: the TypeScript type-checks and its translation is no farther from the new C++
than before. Only what passes is copied into the sources (never over a file changed there meanwhile), and its manifest
entry then ports the new C++; an agent that finds the change ported already says so (`ALREADY PORTED`), and the entry is
moved on. The Developer panel has the same (**Import from C++**: Check the C++, Port with Claude Code; the backend's
`/api/game/import` and `/api/game/agent/status`). Review and commit what it ported: the export finds the TypeScript as it
was ported in the git history.

The whole procedure, step by step, as Claude Code follows it: [`docs/code_sync/game_sync.md`](../../../docs/code_sync/game_sync.md)
for a game's plugin (in Claude Code, `/game-sync <plugin>` runs it), and
[`docs/code_sync/library_sync.md`](../../../docs/code_sync/library_sync.md) for the alpha_family libraries and
`hat_libs` (which the manifest does not track: its sync record is at the end of that document). `docs/code_sync/play_check.py`
plays the round a Developer preset forces, to check a sync.

The export's agent is the other way (`node export/export-agent.mjs <export folder> <games/game>`, or **Port them with
Claude Code** after an export): the TypeScript changes the translator could not translate (the export's `export.json`) are
ported into the export's C++ by an agent, with the TypeScript's diff since it was ported; it stays only if it compiles
(`export/translator/CompileCheck.mjs`, with the games repository's `compile_commands.json`), and the README lists it.

### Fidelity: the translation is the C++ it ports

The translation is formatted by clang-format 17 with the C++ game's `.clang-format` files, then aligned with the C++
file it ports (`export/translator/Align.mjs`), which changes nothing of what the code means: the original's order of
declarations and definitions, its text where a declaration, signature or statement means the same (`ReturnUnless(x, v)`
and `ReturnIf(!x, v)`, `final` and `override`, a header's parameter names), its blank and comment lines between the
statements both have, its includes (the translation's added only where the original's do not include them already).
So a file whose TypeScript mirrors its C++ translates to that C++, and a change in the browser changes only its lines.

`node export/translator/compare.mjs <games/game> [--diff <path>] [--compile <compile_commands.json>] [--errors]`
translates every ported file and counts the lines each differs from its C++ (on 2026-10-21: 45 of 132 files the
same, 7272 lines in all, most in `ViewManager` and the plugin's views, whose TypeScript is not yet re-ported
statement for statement); `--compile` checks that the translation compiles with the games repository's build flags.

Not translated yet: the info and topper modules themselves (`BurningCrownTetraSpins10InfoView.ts`, the C++ of which the
export copies), the capping splash plugin, the math rules, and new interfaces (`*.bridge.ts`): a view that implements an interface the C++ does not declare is listed
as C++ to update by hand.
