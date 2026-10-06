It wasn't a parse issue. The `{00-70}` range is read correctly, and all 71 frames of `ANIM_TETRA_SPARKLES` (`MG/osnovna_left/osnovna_left_00.dds` to `_70.dds`) were reported in sync.

**Why you saw "Missing":** those 71 rows are a different set of files, in `art/1920x1080/MG/MG_anim_knobs/Osnovna_igra/osnovna_left00.dds` to `…70.dds`. No descriptor references them, and their names lack the underscore (`osnovna_left00` vs `osnovna_left_00`). The GDA only has files named `osnovna_left_NN.dds`, so nothing matches by name. Their content is identical to the frames the descriptor does use, so they look like leftover copies. They will still show as missing; if the game doesn't use them, deleting that folder clears them.

**What changed:**
- **One resource per sequence:** each `imagesSeq` entry is now one row in the report. Its frames are still compared file by file. The sequence shows the worst status among its files, with a count, for example `different SHA-256 (2 of 71 files)`. The order is different, then invalid, then missing, then in sync. Frame files aren't listed again on their own.
- **Sync:** syncing a sequence copies only its differing frames, and the toast and activity log count it as one resource.
- **Sync page:** a sequence is one card that plays its frames every `frameTime` ms.
  - `loopCount` sets how many times it plays; `0` loops forever. When it finishes, it stays on the last frame with a replay icon.
  - Clicking the preview restarts from the first frame.
  - The card lists the files that aren't in sync. A "different" sequence also plays the GDA frames beside it.
  - Frames load only when the card scrolls into view.
- **In sync page and search:** a sequence is one table row with its GDA files grouped by folder. Search also matches the sequence id.

The main logic is in [rss_sync.py](egt_gda_sync/rss_sync.py), the copy in [library.py](egt_gda_sync/library.py), and the player in [SequencePreview.vue](frontend/src/components/SequencePreview.vue). I also updated the README and the tests.

**Choices I made that you may want to change:**
- **`loopTo`:** about a third of your sequences have it (e.g. `loopTo: 16`). I play it as "after the first loop, restart at frame 16". If that's not what it means, tell me and I'll change it.
- **Click on a sequence preview:** it always replays the animation, even mid-play, and doesn't select the card. Selecting still works by clicking the card's text or the checkbox.
- **Frame crops:** frames with a `source` rectangle show only that part of the image, which covers sprite-atlas sequences.
- **Counts:** a sequence now counts as one resource, so Burning Crown goes from 2230 to 1317 compared. Sync history will show that drop once.

**Testing:** all 177 Python tests pass, and the frontend typechecks and builds. I also ran the app in a browser against real frames from your game, in a temporary workspace: the animation plays, the atlas crop is correct, the 2-loop sequence stops, and clicking replays it. 8 of the 12 end-to-end tests fail, but they fail the same way on the last commit, in the Asset library and settings flows, so this change didn't cause them.

**To see it:** restart the app running on port 3457, since it still has the old code, then click Rescan. Nothing is committed yet.