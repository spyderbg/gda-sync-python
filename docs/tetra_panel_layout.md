# Burning Crown main and Tetra panel layouts

Panel positions are authored in the workspace's `v/1920x1080/*View.json` files,
including `SwButtons/*View.json`. Each main element can have a real alternate
element with the same ID followed by `_tetra`. For example, `text_bet_amount`
and `text_bet_amount_tetra` each declare their own position, scale, alignment,
and resource keys. No layout offsets are calculated in the view code.

The Burning Crown plugin's `PanelElementsList` selects the binding and draws
only the matching pair for the background mode. Existing balance updates,
credit privacy, win labels, and button events use that binding. A mode change
reloads the bindings and credit animations. Unpaired elements stay shared for
compatibility with existing workspace views.

The affected views are Default/Truserv credit, bet, win, Home, Info, bet arrows,
sound, and language. The sound and language Tetra copies have `hidden: true`
to match the Tetra reference; they neither draw nor receive pointer input.
Home remains visible in Tetra but disabled while the Tetra match is open.
The former sound/language position dummies have been replaced by real buttons.

Run the mode-switch regression with `pytest tests/test_tetra_panel_layout.py`.
To check a workspace's actual JSON instead of the bundled test fixtures, run
`node tests/tetra-panel/run.mjs /absolute/path/to/workspace/v/1920x1080`
from the frontend directory. Both credit integrations are exercised.
