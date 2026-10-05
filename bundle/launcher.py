"""Entry point of the standalone executable."""

import multiprocessing
import sys

# The GDA sync runs in a spawned process; in the executable that process starts here and must not run the app.
multiprocessing.freeze_support()

from egt_gda_sync.__main__ import main  # noqa: E402

sys.exit(main())
