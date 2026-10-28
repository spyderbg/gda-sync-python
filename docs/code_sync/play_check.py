"""Plays the browser game after a C++ sync: the round a Developer preset forces, through the state it should reach, and
back to Idle, printing each change of the game's states with the panel's buttons, the rounds played and the page's
errors. See game_sync.md and library_sync.md.

    .venv/bin/python -I docs/code_sync/play_check.py --workspace burning_crown_tetra_spins_10 \\
        --preset "Main: win ≥ 4× bet (enters the tetra round)" --until Tetra

The app runs from egt_gda_sync/static (build it first: .venv/bin/python scripts/build.py), in an isolated app data
folder made in --out: the project's config/workspace.json, with the workspace as the default one, and its newest asset
report from the app's own data folder, so that the game finds its resources without a rescan. Nothing is written to
the app's own data folder or to the games repository. The exit code is 1 when the game never reached --until, never
came back to Idle, or the page threw.
"""

import argparse
import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from playwright.sync_api import sync_playwright  # noqa: E402

from egt_gda_sync.app.desktop import application_data_home  # noqa: E402
from tests.e2e.conftest import Backend  # noqa: E402

PANEL = ("Start", "Bet +", "Bet −", "Max bet", "Collect", "Info", "Autoplay")


def isolated_home(out: Path, workspace: str) -> tuple[Path, str]:
    """An app data folder for the run: workspace.json with the workspace as the default, and its newest asset report.
    Returns it and the workspace's name, which the workspaces list shows."""
    config = json.loads((ROOT / "config" / "workspace.json").read_text())
    entry = next((item for item in config["workspaces"] if workspace in (item["id"], item.get("game_name"))), None)
    if entry is None:
        sys.exit(f"No workspace {workspace!r} in config/workspace.json: {[item['id'] for item in config['workspaces']]}")
    config["defaultWorkspace"] = entry["id"]
    home = out / "play-home"
    shutil.rmtree(home, ignore_errors=True)
    (home / "asset-reports").mkdir(parents=True)
    (home / "workspace.json").write_text(json.dumps(config, indent=2))
    env = {key: value for key, value in os.environ.items() if key != "EGT_GDA_SYNC_HOME"}
    reports = sorted((Path(application_data_home(env=env)) / "asset-reports").glob(f"{entry['id']}-*.json"), key=lambda path: path.stat().st_mtime)
    if reports:
        shutil.copy2(reports[-1], home / "asset-reports" / reports[-1].name)
    else:
        print(f"No asset report of {entry['id']} in the app's data folder: the game may miss its resources. Rescan it in the app first.")
    return home, entry.get("game_name") or entry["id"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--workspace", required=True, help="the workspace's id or game name (config/workspace.json)")
    parser.add_argument("--preset", help="the Developer panel's Next round button to press before the first START")
    parser.add_argument("--until", required=True, help="text of the game's states to reach, such as Tetra or FreeRound")
    parser.add_argument("--timeout", type=float, default=240, help="seconds the play may take (default 240)")
    parser.add_argument("--out", type=Path, help="folder for the app data folder and the screenshots (default: a new temporary one)")
    args = parser.parse_args()
    if not (ROOT / "egt_gda_sync" / "static" / "index.html").is_file():
        sys.exit("Build the frontend first: .venv/bin/python scripts/build.py")
    out = args.out or Path(tempfile.mkdtemp(prefix="play-check-"))
    out.mkdir(parents=True, exist_ok=True)
    home, name = isolated_home(out, args.workspace)

    errors: list[str] = []
    seen: list[str] = []
    reached = back = False
    backend = Backend(home)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1600, "height": 1300})
            page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
            page.on("console", lambda message: message.type == "error" and errors.append(f"console: {message.text}"))
            page.on("response", lambda response: response.status >= 400 and errors.append(f"{response.status}: {response.url}"))
            page.goto(backend.url)
            page.get_by_role("list", name="Workspaces").get_by_role("button", name=name, exact=True).click()
            page.get_by_role("button", name="Play", exact=True).click()
            screen = page.get_by_label("Game screen")
            screen.wait_for(timeout=60_000)
            page.get_by_role("button", name="Developer").click()
            page.get_by_role("button", name="+100.00").click()
            states = page.locator(".game-dev-states dd").nth(1)
            panel = {label: page.get_by_role("button", name=label, exact=True) for label in PANEL}

            def buttons() -> str:
                return " ".join(f"{label}={'on' if button.is_enabled() else 'off'}" for label, button in panel.items() if button.count())

            deadline = time.monotonic() + 60
            while "Idle" not in states.inner_text():
                if time.monotonic() > deadline:
                    raise TimeoutError(f"the game did not reach Idle: {states.inner_text()}")
                time.sleep(0.2)
            print(f"{states.inner_text()} | {buttons()}")
            if args.preset:
                page.get_by_role("button", name=args.preset, exact=True).click()
            page.keyboard.press("Space")
            start, last = time.monotonic(), ""
            while time.monotonic() - start < args.timeout:
                current = states.inner_text()
                if current != last:
                    last = current
                    seen.append(current)
                    print(f"{time.monotonic() - start:6.1f}s  {current} | {buttons()}")
                if args.until in current and not reached:
                    reached = True
                    time.sleep(2.5)
                    screen.screenshot(path=str(out / "until.png"))
                if reached and "Idle" in current and args.until not in current:
                    back = True
                    break
                # START moves the game on wherever it waits for the player, and fast-forwards what it presents.
                if panel["Start"].is_enabled():
                    page.keyboard.press("Space")
                time.sleep(0.4)
            screen.screenshot(path=str(out / "end.png"))
            print("rounds (newest first):", " ; ".join(page.locator(".game-dev-list li").all_inner_texts()) or "none")
            browser.close()
    finally:
        backend.stop()
    print(f"reached {args.until}: {reached} | back in Idle: {back}")
    print(f"screenshots: {out / 'until.png'}, {out / 'end.png'}")
    print("errors:", "\n  ".join(["", *errors]) if errors else "none")
    return 0 if reached and back and not any(error.startswith("pageerror") for error in errors) else 1


if __name__ == "__main__":
    sys.exit(main())
