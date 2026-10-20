"""The browser game's port of tweeny (frontend/src/game/hat_libs/tweeny): the C++ library's tests, ported, pass."""

import shutil
import subprocess
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
RUNNER = FRONTEND / "src/game/hat_libs/tweeny/tests/run.mjs"


@pytest.mark.skipif(not shutil.which("node") or not (FRONTEND / "node_modules/rolldown").is_dir(),
                    reason="the tests run on Node.js, bundled by the frontend's rolldown")
def test_the_tweeny_port_passes_the_cpp_library_tests():
    result = subprocess.run(["node", str(RUNNER)], cwd=FRONTEND, capture_output=True, text=True, timeout=300)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "checks passed" in result.stdout
