"""Verify a built executable end to end: first launch, previews, sync and backups, refresh, and exit on page close.

Usage: python scripts/verify_package.py [linux|windows]   (Windows executables run under Wine on Linux)
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from gda_sync import __version__  # noqa: E402
from gda_sync.demo import seed_demo  # noqa: E402
from scripts.package_support import (  # noqa: E402
    windows_path,
    wine_bin,
    wine_environment,
)
from tests.fixtures.bc7_dds import create_bc7_dds  # noqa: E402
from tests.fixtures.png_reader import read_png  # noqa: E402

LOOPBACK = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def request(url: str, body: dict | None = None, headers: dict[str, str] | None = None, *, method: str | None = None) -> tuple[int, bytes]:
    data = json.dumps(body).encode() if body is not None else None
    message = urllib.request.Request(url, data, {"Content-Type": "application/json", **(headers or {})}, method=method)
    with LOOPBACK.open(message, timeout=30) as response:
        return response.status, response.read()


def get_json(url: str):
    return json.loads(request(url)[1])


def poll(read, expected, timeout: float = 10.0):
    deadline = time.monotonic() + timeout
    while (value := read()) != expected:
        assert time.monotonic() < deadline, f"Expected {expected!r}, last value {value!r}"
        time.sleep(0.1)


def main() -> None:
    target = sys.argv[1] if len(sys.argv) > 1 else ("windows" if sys.platform == "win32" else "linux")
    if target not in ("linux", "windows"):
        raise SystemExit(__doc__)
    if target == "linux" and sys.platform != "linux":
        raise SystemExit("Verify the Linux executable on Linux.")
    use_wine = target == "windows" and sys.platform != "win32"
    from playwright.sync_api import expect, sync_playwright

    packaged_binary = ROOT / "dist" / ("gda-sync.exe" if target == "windows" else "gda-sync")
    root = Path(tempfile.mkdtemp(prefix="gda-package-"))
    app_dir = root / "app"
    app_dir.mkdir()
    binary = app_dir / packaged_binary.name
    shutil.copy2(packaged_binary, binary)
    asset_home = root / "assets"
    config = seed_demo(str(asset_home))
    config["name"] = "Packaged workspace verification"
    if use_wine:
        for key in ("source", "destination"):
            config[key] = windows_path(Path(config[key]))
    config_path = app_dir / "workspace.json"
    config_path.write_text(json.dumps(config), encoding="utf-8")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    # An isolated Wine prefix, so the app's default LocalAppData location starts empty.
    wine_env = wine_environment(wine_bin(), root / "wine") if use_wine else dict(os.environ)
    local_app_data, xdg_data = root / "AppData" / "Local", root / "data"
    env = {**wine_env, "PORT": str(port), "GDA_SYNC_HOME": "", "LOCALAPPDATA": str(local_app_data), "XDG_DATA_HOME": str(xdg_data)}
    data_home = local_app_data / "GDA Sync" if target == "windows" else xdg_data / "gda-sync"
    log_path = root / "backend.log"
    command = ["wine", str(binary), "--no-open"] if use_wine else [str(binary), "--no-open"]
    # Output is relayed through a pipe: Windows programs under Wine cannot use a redirected file as stdout.
    child = subprocess.Popen(command, cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)

    def relay_output() -> None:
        with open(log_path, "wb") as log:
            for line in child.stdout:
                log.write(line)
                log.flush()

    threading.Thread(target=relay_output, daemon=True).start()
    browser = None
    playwright = None
    try:
        deadline = time.monotonic() + 120
        while True:
            try:
                health = get_json(f"{url}/api/health")
                break
            except OSError:
                if child.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError(f"The packaged app did not start:\n{log_path.read_text(errors='replace')}") from None
                time.sleep(0.2)
        assert health["version"] == __version__, health
        assert health["ready"] is True

        initial = get_json(f"{url}/api/library")
        assert initial["config"] == config, "The executable must load the configuration beside it"
        assert len(initial["assets"]) == 18 and initial["warnings"] == [], initial["warnings"]
        assert len([asset for asset in initial["assets"] if asset["type"] == "model" and asset["preview"]]) == 5
        if use_wine:
            # Wine supplies its own LocalAppData inside the isolated C: drive.
            windows_home = initial["backupPath"].rsplit("\\", 1)[0]
            assert windows_home.lower().endswith("\\appdata\\local\\gda sync"), windows_home
            data_home = Path(subprocess.run(["winepath", "-u", windows_home], env=wine_env,
                                            capture_output=True, text=True, check=True).stdout.strip())
            assert data_home.is_relative_to(root), "Wine data stays inside the test directory"
        saved = json.loads(config_path.read_text(encoding="utf-8"))
        assert saved == initial["config"]
        assert not (data_home / "workspace.json").exists(), "Settings are saved beside the executable"
        changed = next(asset for asset in initial["assets"] if asset["status"] == "modified")
        previous = (asset_home / "demo" / "gda" / changed["path"]).read_bytes()

        bc7 = create_bc7_dds(136, 134)
        relative = "textures/forest/k_active_en.dds"
        (asset_home / "demo" / "source" / relative).write_bytes(bc7)
        library = get_json(f"{url}/api/library")
        asset = next(asset for asset in library["assets"] if asset["name"] == "k_active_en.dds")
        assert asset["preview"] and asset["dimensions"]["format"] == "BC7_UNORM"
        status, preview = request(f"{url}/api/assets/{asset['id']}/preview")
        width, height, pixels = read_png(preview)
        assert (status, width, height, list(pixels[:4])) == (200, 136, 134, [255, 0, 0, 255])
        model = next(asset for asset in library["assets"] if asset["type"] == "model")
        assert request(f"{url}/api/assets/{model['id']}/preview")[0] == 200

        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url)
        expect(page.locator(".asset-card")).to_have_count(19)
        poll(lambda: get_json(f"{url}/api/health")["openPages"], 1)
        page.get_by_role("textbox", name="Search assets").fill("k_active_en.dds")
        page.get_by_role("button", name="Inspect k_active_en.dds", exact=True).click()
        poll(lambda: page.locator(".inspector img").evaluate("img => img.naturalWidth"), 136)

        token = get_json(f"{url}/api/session")["token"]
        settings = {key: initial["config"][key] for key in ("name", "source", "destination")}
        settings["name"] = "Saved packaged workspace"
        status, body = request(f"{url}/api/settings", settings, {"x-gda-token": token}, method="PUT")
        assert status == 200, body
        assert json.loads(config_path.read_text(encoding="utf-8"))["name"] == settings["name"]
        pending = [asset["id"] for asset in library["assets"] if asset["status"] != "synced"]
        status, body = request(f"{url}/api/sync", {"ids": pending}, {"x-gda-token": token})
        result = json.loads(body)
        assert status == 200 and len(result["copied"]) == 9 and result["failures"] == [], result
        assert all(asset["status"] == "synced" for asset in result["library"]["assets"])
        assert (asset_home / "demo" / "source" / relative).read_bytes() == bc7
        assert (asset_home / "demo" / "gda" / relative).read_bytes() == bc7
        [operation] = os.listdir(data_home / "backups")
        assert (data_home / "backups" / operation / changed["path"]).read_bytes() == previous
        assert json.loads((data_home / "activity.json").read_text(encoding="utf-8"))[0]["action"] == "sync"

        page.reload()
        expect(page.locator(".asset-card")).to_have_count(19)
        time.sleep(2.2)
        assert get_json(f"{url}/api/health")["openPages"] == 1
        start = time.monotonic()
        page.close()
        exit_code = child.wait(10)
        assert exit_code == 0, f"Exit code {exit_code}:\n{log_path.read_text(errors='replace')}"
        print(json.dumps({
            "target": target, "runtime": "Wine" if use_wine else "native", "version": __version__, "assets": 19,
            "synced": 9, "modelPreviews": True, "bc7Preview": True, "savedSettings": True, "backups": True,
            "loadedPackagedConfig": True,
            "survivedRefresh": True, "exitCode": exit_code, "shutdownAfterPageCloseMs": round((time.monotonic() - start) * 1000),
        }))
    finally:
        if browser:
            browser.close()
        if playwright:
            playwright.stop()
        if child.poll() is None:
            child.terminate()
        if use_wine:
            subprocess.run(["wineserver", "-k"], env=wine_env, check=False)
        try:
            child.wait(10)
        except subprocess.TimeoutExpired:
            child.kill()
        shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    main()
