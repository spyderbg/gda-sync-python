"""Main and Tetra controls bind to separate, JSON-positioned elements."""

import shutil
import subprocess
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
RUNNER = FRONTEND / "tests/tetra-panel/run.mjs"


@pytest.mark.skipif(not shutil.which("node") or not (FRONTEND / "node_modules/rolldown").is_dir(),
                    reason="requires Node.js and the frontend's rolldown")
def test_main_and_tetra_panel_layouts():
    result = subprocess.run(["node", str(RUNNER)], cwd=FRONTEND, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "panel layout checks passed" in result.stdout
