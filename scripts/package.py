"""Build standalone executables: dist/gda-sync (Linux) and dist/gda-sync.exe (Windows).

Each executable contains the Python runtime, the backend, its dependencies and the built Vue interface.
On Linux, `--target windows` builds the Windows executable with a pinned Windows Python under Wine.
"""

import argparse
import sys

from package_support import (
    DIST,
    ICON,
    build_frontend,
    build_native,
    build_windows_with_wine,
    copy_workspace_configuration,
    icon_file,
    package_targets,
    workspace_configuration,
)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--target", choices=["linux", "windows", "all"], help="defaults to the current operating system")
    parser.add_argument("--skip-frontend", action="store_true", help="reuse the existing build in gda_sync/static")
    args = parser.parse_args(argv)
    try:
        targets = package_targets(args.target)
    except ValueError as error:
        parser.error(str(error))

    workspace_configuration()
    if not args.skip_frontend:
        build_frontend()
    ICON.parent.mkdir(parents=True, exist_ok=True)
    ICON.write_bytes(icon_file())
    for target in targets:
        if target == "windows" and sys.platform != "win32":
            build_windows_with_wine()
        else:
            build_native(target)
        output = DIST / ("gda-sync.exe" if target == "windows" else "gda-sync")
        config = copy_workspace_configuration(output)
        print(f"Standalone {target} application → {output} ({output.stat().st_size / 1048576:.1f} MB)", flush=True)
        print(f"Workspace configuration → {config}", flush=True)


if __name__ == "__main__":
    main()
