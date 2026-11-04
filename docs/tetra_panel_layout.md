# Burning Crown main and Tetra panel layouts

Panel positions are authored in the workspace's `v/1920x1080/*View.json` files,
including `SwButtons/*View.json`. Each main element can have a real alternate
element with the same ID followed by `_tetra`. For example, `text_bet_amount`
and `text_bet_amount_tetra` each declare their own position, scale, alignment,
and resource keys. No layout offsets are calculated in the view code.

Each affected view keeps a `PanelLayout` (the Burning Crown plugin's
`PanelLayout.ts`, ported to C++ as `PanelLayout.h/.cpp`) beside its ordinary
elements list. It follows `GameBackgroundView`'s layout: the view gets
`IGameBackgroundView` from the runtime, and `PanelLayout` casts it to the
plugin's `GameBackgroundView` (`dynamic_cast` in C++; the runtime holds
interfaces only, and the interface has no getter). The view asks it for the element to bind
(`ElementId`: the `_tetra` alternate in Tetra, where the JSON has one), and
`Apply` hides the other layout's element of each pair. Existing balance
updates, credit privacy, win labels, and button events use that binding. When
the layout changes, each view applies it again in `Process`: it rebinds its
buttons and rebuilds its credit animations. Unpaired elements stay shared for
compatibility with existing workspace views. Nothing here needs the shared
libraries changed: `ElementsList` and `BaseView` are used as they are.

The affected views are Default/Truserv credit, bet, win, Home, Info, bet arrows,
sound, and language. The sound and language Tetra copies have `hidden: true`
to match the Tetra reference; they neither draw nor receive pointer input.
Home remains visible in Tetra but disabled while the Tetra match is open.
The former sound/language position dummies have been replaced by real buttons.

Run the mode-switch regression with `pytest tests/test_tetra_panel_layout.py`.
To check a workspace's actual JSON instead of the bundled test fixtures, run
`node tests/tetra-panel/run.mjs /absolute/path/to/workspace/v/1920x1080`
from the frontend directory. Both credit integrations are exercised.
