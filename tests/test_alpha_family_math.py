"""The browser game's ports of the alpha family's math (frontend/src/game/alpha_family/libs/AlphaFamily/Math): the wheel's
and hold and spin's rules compute what their C++ does."""

import shutil
import subprocess
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
RUNNER = FRONTEND / "src/game/alpha_family/libs/AlphaFamily/Math/tests/run.mjs"


@pytest.mark.skipif(not shutil.which("node") or not (FRONTEND / "node_modules/rolldown").is_dir(),
                    reason="the checks run on Node.js, bundled by the frontend's rolldown")
def test_the_wheel_and_hold_and_spin_rules_compute_as_their_cpp():
    result = subprocess.run(["node", str(RUNNER)], cwd=FRONTEND, capture_output=True, text=True, timeout=300)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "checks passed" in result.stdout
