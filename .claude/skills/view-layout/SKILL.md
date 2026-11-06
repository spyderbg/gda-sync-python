---
name: view-layout
description: Lay a game's views out by a preview the user sends, a picture of how the screen should look (such as a designer's PNG from the GDA's DESIGN/09.Preview), changing nothing but the elements lists of the game's v/<resolution>/*View.json files. Use when the user sends or names a preview and asks to place, move or scale view elements to match it.
argument-hint: <preview image> [workspace id] [view names...]
allowed-tools: Bash(.venv/bin/python -I .claude/skills/view-layout/view_layout.py:*)
---

Lay the views out by the preview: `$ARGUMENTS`.

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
- **Change only where elements are:** `position`, always through `move`, and `scale` where the preview's image is
  larger or smaller (the Edit tool, laid out like the file's other members). A `Text` element's `fitBox` changes only
  where the preview's text area clearly differs.
- **Ask first** before changing anything else of an element, adding, removing or reordering elements, or changing
  `hidden`. The code finds elements by id, the order is the drawing order, and the code shows and hides elements.
  Never change ids, types, `rssKey`, `rssKeys`, `rssKeySound`, `rssStyleId`, `color` or `loopCount`.
- **Never edit anything else:**
  - the descriptors (`*Data.json`), images, text styles (a font's size is in `RssTextStylesData.json`) or IData
    (`idata/`);
  - the TypeScript, the C++, this repository's code, or other games.

  When the preview needs any of these, such as an image that differs, a missing element or another font size, report
  it.
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

0. **Check the views are clean:** run `git -C $GAMES status --porcelain -- <game folder>/v`. If a view has uncommitted
   changes, ask before editing: yours would mix with them, and git is the only backup, since `move` does not write the
   app's backups.
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
4. **Check the code:** grep each element you move for its id in the game's TypeScript
   (`frontend/src/game/alpha_family/plugins/<plugin>/`) and in `frontend/src/game/alpha_family/libs/`. Report an
   element whose position the code sets or tweens: its JSON position is only where it starts.
5. **Apply:** use `$H move <view> <id>=<x>,<y> ...` for each view (`#<index>` for an id that repeats), and Edit a
   `scale` that changes. Keep whole numbers unless the element's other numbers have fractions.
6. **Verify:**
   - Run `locate` again: each moved element should now stay, with `here` at its best score.
   - Draw `after.png` the same way as `before.png`, and Read it.
   - For Burning Crown's panel views, also run `node tests/tetra-panel/run.mjs <game folder>/v/1920x1080` from
     `frontend`.
7. **Report:**
   - the workspace, the preview, the state you laid out, and its origin and scale;
   - for each view, each element changed (old → new position and scale), and which were placed by eye;
   - the elements left unchanged, and why: a match you did not trust, an element outside the preview, or one the code
     places;
   - what the preview needs beyond the views: images, text styles, elements, hidden states, included views;
   - `git -C $GAMES diff --stat -- <game folder>/v`.

   Tell the user how to see the result: the Play page shows changed views within a second, and the Asset library's
   ElementsList section draws them. The changes are in the games repository and are not committed. No export is
   needed, since the views are not TypeScript.
