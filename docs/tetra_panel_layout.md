# Burning Crown main and Tetra panel layouts

Panel positions are authored in the workspace's `v/1920x1080/*View.json` files,
including `SwButtons/*View.json`. Each main element can have a real alternate
element with the same ID followed by `_tetra`. For example, `text_bet_amount`
and `text_bet_amount_tetra` each declare their own position, scale, alignment,
and resource keys. No layout offsets are calculated in the view code. Since games
commit `0317b4fa7` (2026-11-06) the suffix is any theme's, `_` and its name in
snake case (`ThemeSuffix` in `IThemeView`: `_tetra`, `_hold_and_spin`), so other
themes can have their own variants the same way. An id that ends in a theme's
suffix is therefore a variant, and is shown only in its theme.

The layout follows the view theme, which the shared libraries have since games
commit `76c08fbd9` (2026-11-04). `IThemeView` (`ThemeType`: `Main`, `Tetra` and
the other rounds) is a base of the background, knobs, button and bar
interfaces. The Tetra round's states set it on all of them with
`IViewManager::SetTheme` (Tetra on entry, Main at the outro's midway).
`BaseView` stores it in `m_theme` and calls `OnThemeChanged` when it changes
and each time the view's elements list has loaded.

Each affected view keeps a `ThemeLayout` (the Burning Crown plugin's
`ThemeLayout.h/.cpp`, ported as `ThemeLayout.ts`) of its elements list and its
theme. Its `OnThemeChanged` calls `Apply`, which hides the variants of the
other themes, and an element whose current theme has a variant of it, then binds
what it shows. It asks `ElementId` for each element: the current theme's variant
(`_tetra` in Tetra), where the JSON has one. Balance updates, credit
privacy, win labels and button events use that binding. The credit bar
rebuilds its animations there. The background and the knobs swap their own
main and Tetra elements in their `OnThemeChanged`. Unpaired elements stay
shared, so existing workspace views keep working.

The affected views are Default/Truserv credit, bet, win, Home, Info, bet arrows,
sound, and language. The sound and language Tetra copies have `hidden: true`
to match the Tetra reference; they neither draw nor receive pointer input.
Home remains visible in Tetra but disabled while the Tetra match is open.
The former sound/language position dummies have been replaced by real buttons.

Run the theme-switch regression with `pytest tests/test_tetra_panel_layout.py`.
It sets the theme on the views as `IViewManager::SetTheme` does.
To check a workspace's actual JSON instead of the bundled test fixtures, run
`node tests/tetra-panel/run.mjs /absolute/path/to/workspace/v/1920x1080`
from the frontend directory. Both credit integrations are exercised.
