> Since 2026-11-12 the Play page takes a ported game's modules config from the browser game's own copies
> (`frontend/src/game/configs`, which `/game-sync` copies from the games repository), so the workspace below plays
> without a `configs` folder beside `rss`. The notes that follow describe the problem as it was before that.

The game itself is fine. On this machine, the Play page can't find the game's modules config. When
  that's missing, it shows its "not ported yet" screen, which offers to import from C++. That's why it
  looks as if the C++ code is needed. It isn't needed for playing.

  I checked this machine with the current default workspace, burning_crown_tetra_spins_10_no_gda. If you
  saw a different message, for example "The game stopped: …", send it to me.

  Why it won't start
  - Before starting, the Play page looks for the game's modules config. That file lists the modules the
    game runs, such as its state machine, math and views, and the browser game creates its TypeScript
    versions of the same modules by name.
  - The file is configs/<workspace id>/modules/<Name>Modules.json in the games repository, beside the
    resources folder. If no folder matches the workspace id, the app tries the game folder's name.
  - This workspace's game folder is
    /home/spyder/nextcloud/_Projects/gda-sync/rss/burning_crown_tetra_spins_10. So the app looks in
    /home/spyder/nextcloud/_Projects/gda-sync/configs/, but that folder holds only ai.md, dist, dst and
    rss.
  - I searched the whole disk and there is no games repository with configs on this machine.
  - With no config the module list is empty, so the start check fails and the page shows "This game cannot
    be played in the browser yet".
  - The browser version of Burning Crown is present
    (frontend/src/game/alpha_family/plugins/burning_crown_tetra_spins_10). Only the config is missing.

  Why it seems to need the C++ code
  - Starting the game reads only JSON and images: the modules configs, the descriptors, the math and idata
    files, and the asset library's images. It reads no C++.
  - The C++ sources (games/game beside resources) are used for three things only:
    - Import from C++, to port a game that isn't ported yet;
    - Export to C++, which copies the plugin files the browser didn't change;
    - /game-sync, which brings C++ changes into the TypeScript.
  - The "not ported yet" screen is meant for games that have no browser port, so it offers Import from
    C++. A missing config lands on the same screen, which shows an empty module list and an import offer
    that won't help here.

  The modules config does belong to the C++ game, which reads it to load its plugins. That's why it's in
  the games repository and not in the resources folder. But it's a JSON file, not source code.

  Ways to get it playing
  1. Point the workspace's game_path at a full games repository checkout
     (…/games/resources/burning_crown_tetra_spins_10), so configs/ and game/ sit beside resources/.
  2. Or copy just the two config folders next to rss:
     - configs/burning_crown_tetra_spins_10/modules/, which is what the start check needs;
     - configs/alpha_family/modules/, the family's modules, such as the capping splash.

  As you asked, I haven't changed anything. When you want, the app fix is small: say "no modules config
  found", name the folder it looked in, and offer the import only when a config exists but names modules
  the browser doesn't have.


