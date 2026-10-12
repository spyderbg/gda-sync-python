#!/usr/bin/env python3

"""Development mode with the React interface: the Vite dev server of frontend_react.

It starts only the interface, on its own port (5175 by default), so it can run beside the Vue
interface (scripts/dev.py, or Vite in frontend/) and both can be compared against one backend.
Start that backend separately, for example with the "Development: backend" launch configuration;
the interface proxies /api to its port, resolved as the backend does (workspace.json or PORT).
Before starting, it checks that frontend_react does not use any file of frontend.
End the session with Ctrl+C.

The action is start, to run the interface, or check, to verify that frontend_react is
independent of frontend.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

import dev
from egt_gda_sync.__main__ import _port, workspace_config_path
from egt_gda_sync.app.desktop import application_data_home
from egt_gda_sync.workspace.library import Library

ROOT = dev.ROOT
FRONTEND = ROOT / "frontend"
FRONTEND_REACT = ROOT / "frontend_react"
REACT_PORT = 5175

SKIPPED_DIRECTORIES = {"node_modules", "dist", ".vite"}
TEXT_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html", ".css", ".scss", ".sass", ".svg", ".vue", ".md"}
# Module specifiers, in code (import/export/require/new URL/import.meta.glob) and in styles (@import/@use/@forward/url()).
SPECIFIER = re.compile(
    r"""(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bnew\s+URL\s*\(\s*|\bglob(?:Eager)?\s*(?:<[^>]*>)?\s*\(\s*\[?\s*
        |@(?:import|use|forward)\s+|\burl\(\s*|\b(?:src|href)\s*=\s*)
        (["']?)([^"'\s)]+)\1""",
    re.VERBOSE,
)
# A path that climbs into the Vue frontend directory, wherever it is written.
FRONTEND_PATH = re.compile(r"""["'`]\.\./(?:\.\./)*frontend(?!_)""")
LINKED_DEPENDENCY = re.compile(r"^(?:file|link|portal|workspace):")


def _is_inside(path: Path, directory: Path) -> bool:
    return path == directory or directory in path.parents


def _files(directory: Path):
    for current, directories, names in os.walk(directory):
        directories[:] = [name for name in directories if name not in SKIPPED_DIRECTORIES]
        for name in names:
            yield Path(current, name)


def _specifier_problem(path: Path, specifier: str, frontend: Path, frontend_react: Path) -> str | None:
    """Describe a relative path that leaves frontend_react, which is how frontend files would be used."""
    # A root-relative path is served by Vite from frontend_react itself or from its public directory.
    if not specifier.startswith(".") or specifier.startswith("//"):
        return None
    resolved = Path(os.path.normpath(path.parent / specifier))
    if _is_inside(resolved, frontend):
        return f"uses a frontend file: {specifier}"
    if not _is_inside(resolved, frontend_react):
        return f"reaches outside frontend_react: {specifier}"
    return None


def find_dependencies(frontend_react: Path = FRONTEND_REACT, frontend: Path = FRONTEND) -> list[str]:
    """List every way frontend_react depends on a file of frontend; an empty list means it is independent."""
    frontend, frontend_react = frontend.resolve(), frontend_react.resolve()
    problems: list[str] = []

    def report(path: Path, message: str) -> None:
        problems.append(f"{path.relative_to(frontend_react.parent)}: {message}")

    for path in _files(frontend_react):
        if path.is_symlink() and not _is_inside(path.resolve(), frontend_react):
            report(path, f"is a link to {path.resolve()}")
            continue
        if path.suffix not in TEXT_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for match in SPECIFIER.finditer(text):
            message = _specifier_problem(path, match.group(2), frontend, frontend_react)
            if message:
                report(path, message)
        if path.suffix != ".md" and FRONTEND_PATH.search(text):
            report(path, "names the frontend directory")
    # The installed packages must be frontend_react's own, not links to the other frontend's.
    modules = frontend_react / "node_modules"
    if modules.is_symlink() and not _is_inside(modules.resolve(), frontend_react):
        report(modules, f"is a link to {modules.resolve()}")
    elif modules.is_dir():
        for entry in modules.iterdir():
            if entry.is_symlink() and _is_inside(entry.resolve(), frontend):
                report(entry, f"is a link to {entry.resolve()}")
    package = frontend_react / "package.json"
    if package.is_file():
        manifest = json.loads(package.read_text(encoding="utf-8"))
        for section in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
            for name, version in (manifest.get(section) or {}).items():
                if LINKED_DEPENDENCY.match(str(version)):
                    report(package, f"{name} is installed from a local path: {version}")
    return problems



def check() -> int:
    if not FRONTEND_REACT.is_dir():
        raise SystemExit(f"{FRONTEND_REACT} does not exist.")
    problems = find_dependencies()
    if problems:
        print("frontend_react depends on files outside itself:", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        return 1
    print("frontend_react does not use any frontend file.", flush=True)
    return 0


def _backend_running(port: int) -> bool:
    # Talk to loopback directly, even when an HTTP proxy is configured.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(f"http://127.0.0.1:{port}/api/health", timeout=2):
            return True
    except OSError:
        return False


def start(ui_port: int) -> int:
    """Run the Vite dev server of frontend_react until it ends."""
    node, npm = shutil.which("node"), shutil.which("npm")
    if not node or not npm:
        raise SystemExit("Node.js 20.19+ and npm are required for development mode.")
    data_home = os.path.abspath(application_data_home())
    library = Library(data_home, config_path=workspace_config_path(data_home))
    library.init()
    port = _port(library.config)
    if ui_port == port:
        raise SystemExit(f"The React interface port and the backend port must be different, both are {port}. Use --port to choose another port.")
    if dev._port_in_use(ui_port):
        raise SystemExit(f"Port {ui_port} is in use by another application. Use --port to choose another port.")
    if not _backend_running(port):
        print(f"Warning: no backend answers on port {port}. Start it, for example with the \"Development: backend\" launch configuration.", flush=True)
    env = {**os.environ, "PORT": str(port), "VITE_PORT": str(ui_port), "EGT_GDA_SYNC_DEV": "1"}
    subprocess.run([npm, "ci"], cwd=FRONTEND_REACT, check=True)
    print(f"React interface: http://127.0.0.1:{ui_port} (backend on port {port})", flush=True)
    # Run Vite directly rather than through npm, so stopping it stops a single process on every platform.
    vite = subprocess.Popen([node, str(FRONTEND_REACT / "node_modules" / "vite" / "bin" / "vite.js")], cwd=FRONTEND_REACT, env=env)
    try:
        return vite.wait()
    except KeyboardInterrupt:
        return 0
    finally:
        if vite.poll() is None:
            vite.terminate()
            try:
                vite.wait(10)
            except subprocess.TimeoutExpired:
                vite.kill()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("action", nargs="?", default="start", choices=["start", "check"], help="start the interface, or check the independence of frontend_react; start is the default")
    parser.add_argument("--port", type=int, default=REACT_PORT, help=f"port of the React interface; {REACT_PORT} is the default")
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if args.action == "check":
        return check()
    if check():
        raise SystemExit("Fix these before starting the React interface.")
    return start(args.port)


if __name__ == "__main__":
    sys.exit(main())
