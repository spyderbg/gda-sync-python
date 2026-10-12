#!/usr/bin/env python3
"""Compile and lint EGT GDA Sync's Python application and build scripts.

Uses the project's .venv and installs development dependencies from pyproject.toml.
Use --skip-install to validate an environment that is already prepared.
Standalone executable checks are available in scripts/verify_package.py.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import TypeAlias


RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
GREEN  = "\033[92m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"

# Pylint severity letter -> (label, color)
_PYLINT_SEV: dict[str, tuple[str, str]] = {
    "F": ("Fatal",      RED),
    "E": ("Error",      RED),
    "W": ("Warning",    YELLOW),
    "R": ("Refactor",   CYAN),
    "C": ("Convention", DIM),
}

_SEVERITY_ORDER = ["Compile Error", "Fatal", "Error", "Warning", "Refactor", "Convention"]

# Pylint exit codes are a bitmask; 32 means a usage/config error.
_PYLINT_USAGE_ERROR = 32

Issue: TypeAlias = tuple[str, int, str, str]


def _resolve_paths() -> tuple[Path, Path]:
    repo_root = Path(__file__).resolve().parent.parent
    return repo_root, repo_root / ".venv"


def _find_python_for_venv() -> list[str]:
    candidates: list[list[str]] = []

    if sys.version_info >= (3, 10):
        candidates.append([sys.executable])

    for command in (["python3.10"], ["python3"], ["py", "-3.10"], ["py", "-3"]):
        executable = shutil.which(command[0])
        if executable:
            candidates.append([executable, *command[1:]])

    seen: set[tuple[str, ...]] = set()
    for candidate in candidates:
        key = tuple(candidate)
        if key in seen:
            continue
        seen.add(key)
        try:
            subprocess.run(
                [*candidate, "-c", "import sys; sys.exit(sys.version_info < (3, 10))"],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return candidate
        except (subprocess.CalledProcessError, OSError):
            continue

    raise RuntimeError("Error: python3.10, python3, or py launcher with Python 3.10+ is required.")


def _venv_python(venv_dir: Path) -> Path:
    if os.name == "nt":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def _run(command: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    subprocess.run(command, cwd=str(cwd) if cwd else None, env=env, check=True)


def _run_capture(
    command: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> tuple[str, str, int]:
    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        env=env,
        capture_output=True,
        text=True,
    )
    return result.stdout, result.stderr, result.returncode


def _parse_compile_errors(stdout: str, stderr: str) -> list[Issue]:
    """Parse compileall output into Issue tuples."""
    issues: list[Issue] = []
    combined = stdout + "\n" + stderr
    current_file = ""
    current_line = 0
    for line in combined.splitlines():
        file_match = re.match(r'\s*File "([^"]+)", line (\d+)', line)
        if file_match:
            current_file = file_match.group(1)
            current_line = int(file_match.group(2))
        err_match = re.match(r"\s*(SyntaxError|IndentationError|TabError|NameError):\s*(.*)", line)
        if err_match and current_file:
            issues.append((current_file, current_line, f"{err_match.group(1)}: {err_match.group(2)}", ""))
            current_file = ""
            current_line = 0
    return issues


def _parse_pylint_issues(stdout: str) -> dict[str, list[Issue]]:
    """Parse pylint output into a severity-keyed dict of Issue lists."""
    issues: dict[str, list[Issue]] = defaultdict(list)
    pattern = re.compile(r"^(.+?):(\d+):\d+:\s+([FEWRC])(\d+):\s+(.+?)(?:\s+\([\w-]+\))?$")
    for line in stdout.splitlines():
        m = pattern.match(line.rstrip())
        if not m:
            continue
        filepath, lineno, sev_code, msg_num, message = m.groups()
        label, _ = _PYLINT_SEV.get(sev_code, ("Unknown", RESET))
        issues[label].append((filepath, int(lineno), message.strip(), f"{sev_code}{msg_num}"))
    return dict(issues)


# ── display helpers ────────────────────────────────────────────────────────────

def _sev_color(sev: str) -> str:
    if sev in ("Compile Error", "Fatal", "Error"):
        return RED
    if sev == "Warning":
        return YELLOW
    if sev == "Refactor":
        return CYAN
    return DIM


def _box_row(cells: list[str], widths: list[int], color: str = "") -> str:
    parts = [f" {color}{cell.ljust(w)}{RESET} " for cell, w in zip(cells, widths)]
    return "│" + "│".join(parts) + "│"


def _box_sep(widths: list[int], left: str, mid: str, right: str) -> str:
    return left + mid.join("─" * (w + 2) for w in widths) + right


def _print_summary(
    compile_issues: list[Issue],
    pylint_issues: dict[str, list[Issue]],
) -> None:
    counts = {
        sev: len(compile_issues) if sev == "Compile Error" else len(pylint_issues.get(sev, []))
        for sev in _SEVERITY_ORDER
    }
    total = sum(counts.values())

    rows = [
        [sev, str(cnt), "compile" if sev == "Compile Error" else "pylint"]
        for sev, cnt in counts.items()
        if cnt > 0
    ]

    print()
    if not rows:
        print(f"{GREEN}{BOLD}  No issues found.{RESET}\n")
        return

    headers = ["Severity", "Count", "Stage"]
    widths = [
        max(len(headers[i]), max(len(r[i]) for r in rows))
        for i in range(3)
    ]
    title = "Validation Summary"
    full_w = sum(widths) + len(widths) * 3 - 1  # padding + separators

    print(BOLD + "┌" + "─" * full_w + "┐" + RESET)
    print(BOLD + "│" + title.center(full_w) + "│" + RESET)
    print(_box_sep(widths, "├", "┬", "┤"))
    print(_box_row(headers, widths))
    print(_box_sep(widths, "├", "┼", "┤"))
    for row in rows:
        print(_box_row(row, widths, _sev_color(row[0])))
    print(_box_sep(widths, "└", "┴", "┘"))
    print(f"\n  Total issues: {BOLD}{total}{RESET}\n")


def _print_issues(
    compile_issues: list[Issue],
    pylint_issues: dict[str, list[Issue]],
) -> None:
    for sev in reversed(_SEVERITY_ORDER):
        items: list[Issue] = (
            compile_issues if sev == "Compile Error" else pylint_issues.get(sev, [])
        )
        if not items:
            continue

        color = _sev_color(sev)
        stage = "compile" if sev == "Compile Error" else "pylint"
        print(f"{color}{BOLD}── {sev} ({stage}) ──{RESET}")
        for filepath, lineno, message, code in items:
            code_str = f"[{code}] " if code else ""
            print(f"  {color}{filepath}:{lineno}{RESET}  {code_str}{message}")
        print()


# ── main ───────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--json", type=Path, default=None,
        help="also write pylint's raw JSON report here; "
             "runs pylint a second time with --output-format=json; the human table is unaffected",
    )
    parser.add_argument(
        "--skip-install", action="store_true",
        help="use the existing project .venv without installing dependencies",
    )
    args = parser.parse_args(argv)

    repo_root, venv_dir = _resolve_paths()
    sources = ["egt_gda_sync", "scripts", "bundle/launcher.py"]

    compile_issues: list[Issue] = []
    pylint_issues: dict[str, list[Issue]] = {}
    exit_code = 0

    try:
        if not venv_dir.is_dir():
            if args.skip_install:
                raise RuntimeError('Project .venv is missing. Run without --skip-install to create it.')
            python_cmd = _find_python_for_venv()
            print(f"Creating project virtual environment at {venv_dir}")
            _run([*python_cmd, "-m", "venv", str(venv_dir)])

        venv_python = _venv_python(venv_dir)
        if not venv_python.is_file():
            raise RuntimeError(f"Error: virtual environment python not found at {venv_python}")

        if not args.skip_install:
            print("Installing project development dependencies...")
            _run([str(venv_python), "-m", "pip", "install", "-e", ".[dev]"], cwd=repo_root)
        stdout, stderr, rc = _run_capture([str(venv_python), "-m", "pylint", "--version"], cwd=repo_root)
        if rc != 0:
            raise RuntimeError('Pylint is unavailable. Install the development tools: pip install -e ".[dev]"')

        print("Compiling project Python sources...")
        stdout, stderr, rc = _run_capture(
            [str(venv_python), "-m", "compileall", "-q", *sources, "tests"], cwd=repo_root
        )
        if rc != 0:
            exit_code = rc
            compile_issues = _parse_compile_errors(stdout, stderr)
            if not compile_issues:
                raw = (stdout + stderr).strip()
                compile_issues = [("unknown", 0, raw[:300] or "unknown compile error", "")]

        print("Linting project Python sources...")
        env = os.environ.copy()
        env["PYTHONPATH"] = os.pathsep.join(filter(None, (str(repo_root), env.get("PYTHONPATH"))))
        stdout, stderr, rc = _run_capture(
            [str(venv_python), "-m", "pylint", "--output-format=text", "--msg-template={path}:{line}:{column}: {msg_id}: {msg} ({symbol})", *sources], cwd=repo_root, env=env
        )
        if rc & _PYLINT_USAGE_ERROR:
            raise RuntimeError(f"pylint usage error (rc={rc}): {(stdout + stderr).strip()}")
        pylint_issues = _parse_pylint_issues(stdout)
        if rc != 0:
            exit_code = exit_code or rc

        if args.json is not None:
            json_stdout, json_stderr, json_rc = _run_capture(
                [str(venv_python), "-m", "pylint", "--output-format=json", *sources], cwd=repo_root, env=env,
            )
            if json_rc & _PYLINT_USAGE_ERROR:
                raise RuntimeError(f"pylint JSON report failed: {(json_stdout + json_stderr).strip()}")
            args.json.parent.mkdir(parents=True, exist_ok=True)
            args.json.write_text(json_stdout, encoding="utf-8")

        _print_issues(compile_issues, pylint_issues)
        _print_summary(compile_issues, pylint_issues)

        if exit_code == 0:
            print(f"{GREEN}Validation completed successfully.{RESET}")
        else:
            print(f"{RED}Validation completed with issues.{RESET}", file=sys.stderr)

        return exit_code

    except (RuntimeError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as exc:
        return exc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
