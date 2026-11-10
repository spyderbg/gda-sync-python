---
name: view-layout
description: Lay a game's views out by a preview the user sends, a picture of how the screen should look (such as a designer's PNG from the GDA's DESIGN/09.Preview), placing and scaling the elements it shows, showing the hidden ones it shows and hiding the ones it leaves out, changing nothing but the elements lists of the game's v/<resolution>/*View.json files. Use when the user sends or names a preview and asks to place, move, scale, show or hide view elements to match it.
argument-hint: <preview image> [workspace id] [view names...]
allowed-tools: Bash(.venv/bin/python -I .claude/skills/view-layout/view_layout.py:*), Bash(.venv/bin/python -I .claude/skills/view-layout/execute_conditions.py:*)
---

Lay the views out by the preview: `$ARGUMENTS`.

The first positional argument is the preview image (`$ARGUMENTS[0]`), and the second is the workspace id
(`$ARGUMENTS[1]`). When both are supplied, **before any layout work**, run:

```
.venv/bin/python -I .claude/skills/view-layout/view_layout.py validate-inputs "$ARGUMENTS[0]" "$ARGUMENTS[1]"
```

Stop if validation fails. In a View layout page session this also checks the arguments and image bytes against
the application's selected workspace and uploaded preview. All helper calls are logged automatically with their
complete argument lists, exit codes and durations; keep using the helper directly so the page can show that trace.

Then, always, **before any layout work**, check the execute conditions, with the workspace id when one is supplied:

```
.venv/bin/python -I .claude/skills/view-layout/execute_conditions.py "$ARGUMENTS[1]"
```

**Stop if a condition fails** (its exit status is not 0): change nothing, do no layout work, and write the report
below. Do not ask whether to go on, and do not work around a failure, such as by stashing or committing the changes
yourself: the user decides. Today the one condition is that the games repository, the git repository that holds the
game folder, has no uncommitted changes, untracked files included, on its branch. Git is the only backup of the views,
since `move` writes no backups, and your changes would mix with the others. The script lists the conditions in its
`--help`; a condition added there applies without changing this file.

The report of a failed condition follows this example. Fill it in from what the script printed, in your own words:
name each change in words (`M` modified, `A` added, `D` deleted, `R` renamed, `??` untracked) rather than pasting the
output, and give each failed condition its own **What failed** paragraph. Write each paragraph on one line: the View
layout page draws the report as Markdown, and shows a line break within a paragraph as one.

```markdown
**Result:** I stopped before any layout work and changed nothing, because the execute condition `no-uncommitted-changes` failed.

**What failed**

The games repository `/media/plamen/data/Egt/games` has 1 uncommitted change on branch `preview-fixes`:

- `resources/burning_crown_tetra_spins_10/v/1920x1080/KnobsView.json`, modified

Git is the only backup of the views, and the skill writes no backups, so a new layout would mix with this change.

**What to do**

Commit, stash or discard the change in `/media/plamen/data/Egt/games`, then run the layout again with the same preview. I did not stash or commit it, since that is your decision.

**Inputs**

- Workspace: `burning_crown_tetra_spins_10` (Burning Crown Tetra Spins 10)
- Game folder: `/media/plamen/data/Egt/games/resources/burning_crown_tetra_spins_10`
- Preview: `/home/plamen/.local/share/egt-gda-sync/view-layouts/layout-pc_fxuqm/preview.png`
```

A view is a `*.json` file of the game's `v` folder, such as `v/1920x1080/BetBarView.json` or
`v/1920x1080/SwButtons/InfoSwButtonView.json`: its ElementsList, the elements the game draws in order (README.md,
"Views"). The C++ game and the browser game both read them. The helper `view_layout.py`, beside this file, reads,
places and draws them as the Asset library does (`egt_gda_sync/assets/views.py`). It finds each element's image in the
preview and gives the position that puts it there, and writes positions as the library's Save does, keeping the rest
of the file's text. Run it from this repository, with the app's Python:

```
H=".venv/bin/python -I .claude/skills/view-layout/view_layout.py"
$H elements VIEW...                       # every element: index, id, type, position, alignment, scale, box, keys
$H draw OUT.png VIEW... --over PREVIEW --outline [--ids] [--crop X,Y,W,H]   # the views over the preview, numbered
$H locate PREVIEW VIEW...                 # where each element's image is in the preview, and its new position
$H move VIEW ID=X,Y '#INDEX=X,Y' ...      # writes positions
```

`draw` and `locate` take `--skip PATTERNS` (ids to leave out, such as `*_tetra`), `--origin X,Y|auto` and `--scale S`
(where the preview is on the screen) and `--part X,Y,W,H` (a part of the preview). `locate` also takes `--only IDS`,
`--search PX` (300 by default, 0 for the whole preview), `--scales F,...` and `--json`. Use `--help` for the rest.

## Scope

- **Write only the views of the workspace's game folder:** its `v/<resolution>/**/*.json` files, but not its
  `*Data.json` descriptors. A view that the game includes from elsewhere, such as
  `../common/features/responsible_gaming/v/...`, is shared with other games, so report what it needs instead.
- **Change only where elements are, and whether they show:** `position`, always through `move`; `scale` where the
  preview's image is larger or smaller (the Edit tool, laid out like the file's other members); and `hidden`, so that
  the view shows what the preview shows: `"hidden": true` on an element the preview leaves out, and none on a hidden
  element the preview shows (step 3, "Left out of the preview" and "Hidden, but in the preview"). A `Text` element's
  `fitBox` changes only where the preview's text area clearly differs.
- **Ask first** before changing anything else of an element, or adding, removing or reordering elements. The code
  finds elements by id, the order is the drawing order, and the code shows and hides elements. A user's request, such
  as creating the elements the views lack or deleting the ones the preview leaves out, is the asking: do what it says
  instead of the default. Never change ids, types, `rssKey`, `rssKeys`, `rssKeySound`, `rssStyleId`, `color` or
  `loopCount`.
- **Never edit anything else:**
  - the descriptors (`*Data.json`), images, text styles (a font's size is in `RssTextStylesData.json`) or IData
    (`idata/`);
  - the TypeScript, the C++, this repository's code, or other games.

  When the preview needs any of these, such as an image that differs, an element the views lack or another font size,
  report it.
- Do not commit, in either repository, unless the user asks.

## Inputs

- **The preview** is an image file named in the arguments or the message: a PNG, JPEG or DDS. If the user only pasted
  the picture, ask for its file, for example by dragging it into the terminal, which writes its path. The helper
  measures the file, and a pasted picture can only be judged by eye. Work by eye only if the user says so.
- **The workspace** is the entry of `config/workspace.json` whose `id` is given, or else its `defaultWorkspace`. Say
  which one in the report.
  - **The game folder** is its `game_path`, with `{games_root_path}` replaced by `games_root_path`.
  - **GAMES** is `games_root_path`, the games repository.
- **The resolution:** a preview is for one resolution folder (`v/1920x1080`), the one of its size or aspect ratio.
  Leave the other folders unchanged, and say so.
- **The views** are named in the arguments (such as `BetBarView`). Otherwise they are the views that draw on the part
  of the screen the preview shows: list them all with `elements`, and draw them over the preview to see.
- **The state** is the round and theme the preview shows (main game, a bonus round, gamble, a panel layout). Lay out
  only the elements that show in it, and leave the others out with `--skip`. Ask when it is unclear.
  - Burning Crown's panel (`docs/tetra_panel_layout.md`): an element `x` can have an alternate `x_tetra`, or several
    `x_01_tetra`, `x_02_tetra`, which the Tetra theme shows in `x`'s place (`ThemeLayout.ts` in the game's
    `BurningCrownTetraSpins10View`).
  - A main-game preview takes `--skip '*_tetra'`.
  - A Tetra preview leaves out each `x` that has an alternate, for example `--skip text_amount,image_label,...`.

## Steps

0. **Check the execute conditions** (above), before anything else: stop if `execute_conditions.py` fails.
1. **Look at the preview** (Read it). Note what it shows:
   - its state;
   - its size against the resolution: the whole screen, a part of it (`--origin auto` finds where), or several screens
     in one picture (`--part`);
   - whether it is smaller than the screen. A downscaled preview places elements only within about 1/scale pixels, so
     ask for the full-size file when the moves are small.
2. **Draw the views over it:**
   `$H draw <scratch>/before.png <views> --over <preview> --outline --skip ... [--origin auto]`. Read the image, and
   draw zoomed parts with `--crop` where elements are small or close together. The views show at half opacity over
   the preview: an element in the right place looks sharp, and one in the wrong place looks doubled. Keep the
   drawings in your scratch folder, never in either repository.
3. **Find the elements:** `$H locate <preview> <views> --skip ...`. A move is reliable when its `found` score is at
   least 0.9 (0.85 for a preview smaller than the screen) and it has no `[note]`. A note in parentheses is for
   information only. Otherwise:
   - **`no good match`:** the image is scaled, in another state (such as a pressed or disabled button), or covered.
     Try `--only <id> --scales 0.8,0.9,0.95,1.05,1.1,1.2`. The new `scale` and the position it prints go together.
     Otherwise place it by eye.
   - **`lands where X is, which draws the same image`:** the preview shows one of the two. Decide which element shows
     in the preview's state, and skip the other.
   - **`as good a match with a move of ...`:** the image repeats, or it is a pattern. Narrow `--search`, or decide by
     eye.
   - **`outside the preview`:** the element is not in the part of the screen the preview shows, so leave it unchanged.
     Use `--search 0` only if it should be there.
   - **The same move for most elements:** the preview is placed wrongly, not the layout. Use `--origin auto` or the
     origin it suggests.
   - **Texts:** their digits are drawn at runtime, so place a `Text` by eye. Its `position` is the point its
     `alignment` names: the middle of the text for `MiddleCenter`, its bottom middle for `BottomCenter`. Find that
     point in a zoomed `draw --crop` of the preview.
   - **Anims** are too transparent to match. Move one by the same amount as the element it decorates when they share
     a position, such as a knob's sparkles. Otherwise place it by eye.
   - **Dummies and companions** move with their element by the same amount. These are points the code places things
     by, such as the credit's `text_amount_min` and `text_amount_max`, where its animation settles.
   - **Left out of the preview:** an element that the preview's state shows, but whose image is nowhere in the
     preview, such as knobs a designer took away, is hidden by default. The view then draws what the preview shows.
     Hide it only when all of these hold:
     - `locate` finds `no good match` with `--search 0` and `--scales` too, and a zoomed `draw --crop` shows the
       background or other art where it would be, not an element that covers it. Judge a `Text` by eye: hide it only
       when the preview has no text where it would be;
     - it draws in the preview's state. An element of another theme or round, left out with `--skip`, is not left out
       of the preview;
     - the code does not show or hide it by id (step 4). The code picks one of the status line's messages, a volume
       level or a button state, and the preview shows only the one it picked. A `hidden` in the JSON would hide the
       element where the code needs it, or not stick;
     - its view is in the game's folder. Report what an included view needs (Scope).

     An Anim that decorates the element, at its position, such as a knob's sparkles, is hidden with it. When the user
     asks for something else for these elements, such as deleting them, do that instead (Scope). Before deleting one,
     grep its id in the code, as in step 4: when the code finds it by id, say so and ask, since the game can fail
     without it.
   - **Hidden, but in the preview:** a hidden element whose image the preview shows, such as knobs that a commit
     hid, is shown by default: its `"hidden": true` is removed, and it is moved if the preview has it elsewhere.
     `locate` and `draw` leave hidden elements out, so run `$H locate <preview> <views> --skip ... --hidden` too, and
     draw with `--hidden` to see them. `elements` marks which are `hidden`. Show one only when all of these hold:
     - `locate --hidden` finds it reliably, as for a move;
     - no shown element draws the same image at the same place: `elements` lists another with the same keys and box.
       The preview shows that one, and the hidden one is its companion;
     - it draws in the preview's state, as for hiding;
     - the code does not use its id (step 4). A hidden element the code finds by id is a companion, such as the
       credit's `image_label_min` and `image_label_max`, where the label's animation settles, or one the code shows
       when it needs it;
     - its view is in the game's folder.

     A hidden Anim that decorates the element, at its position, such as a knob's sparkles, is shown with it.
   - **In the preview, but in no view:** report it (Scope). When the user asks to create it, add an element of the
     type its neighbours have, drawing an image the descriptors already have (`rssKey`), with an id the code does not
     use; say where in the drawing order you put it. When no image of the descriptors is the preview's, report that
     instead.
4. **Check the code:** grep each element you move, hide or show for its id in the game's TypeScript
   (`frontend/src/game/alpha_family/plugins/<plugin>/`) and in `frontend/src/game/alpha_family/libs/`.
   - Report an element whose position the code sets or tweens: its JSON position is only where it starts.
   - Leave an element whose visibility the code sets by id (`SetHidden`, `SetVisible` on the element) as it is, and
     report it. The code showing or hiding the whole view, such as `IKnobsView`'s `SetVisible(true)` in the main game,
     does not count: a hidden element stays hidden in a shown view, and Burning Crown's `ThemeLayout` keeps it hidden
     in every theme. Removing its `hidden` is what shows it.
5. **Apply:**
   - Use `$H move <view> <id>=<x>,<y> ...` for each view (`#<index>` for an id that repeats), and Edit a `scale` that
     changes. Keep whole numbers unless the element's other numbers have fractions.
   - Hide an element with the Edit tool: add `"hidden": true,` on the line after its `"type"`, as the views' other
     hidden elements have it.
   - Show an element with the Edit tool: remove its `"hidden": true` line, and the comma before it when it was the
     element's last member.
6. **Verify:**
   - Run `locate` again: each moved element should now stay, with `here` at its best score. Each shown element should
     now be listed without `--hidden`, and stay.
   - Run `elements` on the views you hid or showed elements in: each hidden one should be listed as `hidden`, and each
     shown one not.
   - Draw `after.png` the same way as `before.png`, and Read it. A hidden element is no longer drawn, and a shown one
     is drawn sharp over the preview.
   - For Burning Crown's panel views, also run `node tests/tetra-panel/run.mjs <game folder>/v/1920x1080` from
     `frontend`.
7. **Report**, in Markdown, as the View layout page draws it: open with a one-sentence **Result:** paragraph, then
   short paragraphs, each with a bold title line, lists for elements and files, and `code` for ids, paths and
   positions. Write each paragraph on one line, since a line break within a paragraph shows as one. Report:
   - the workspace, the preview, the state you laid out, and its origin and scale;
   - for each view, each element changed (old → new position and scale), which were placed by eye, each element
     hidden because the preview leaves it out, and each one shown because the preview shows it;
   - the elements left unchanged, and why: a match you did not trust, an element outside the preview, a companion, or
     one the code places, shows or hides;
   - what the preview needs beyond the views: images, text styles, elements the views lack, included views, and
     elements whose visibility the code sets by id that the preview shows otherwise;
   - `git -C $GAMES diff --stat -- <game folder>/v`.

   Tell the user how to see the result: the Play page shows changed views within a second, and the Asset library's
   ElementsList section draws them. The changes are in the games repository and are not committed. No export is
   needed, since the views are not TypeScript.
