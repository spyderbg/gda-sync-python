"""The browser game's ports of the C++ that writes amounts and cuts image fonts (frontend/tests/cpp-ports): they write and
cut as the C++ game does."""

import shutil
import subprocess
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
RUNNER = FRONTEND / "tests/cpp-ports/run.mjs"


@pytest.mark.skipif(not shutil.which("node") or not (FRONTEND / "node_modules/rolldown").is_dir(),
                    reason="requires Node.js and the frontend's rolldown")
def test_amounts_and_image_font_glyphs_as_the_cpp_game_has_them():
    result = subprocess.run(["node", str(RUNNER)], cwd=FRONTEND, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "C++ port checks passed" in result.stdout
