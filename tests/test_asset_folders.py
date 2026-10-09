"""The folders of the asset report: the game folder and the folders of the resources folder that hold the other files it
declares, with each asset in one of them; and the views of an included folder, drawn with the game's descriptors."""

import json
from pathlib import Path

import cv2
import numpy as np
from fastapi.testclient import TestClient

from egt_gda_sync.asset_report import inventory
from egt_gda_sync.library import Library, asset_facts
from egt_gda_sync.rss_sync import Config
from egt_gda_sync.server import create_app
from tests.conftest import session_headers

RED = (255, 0, 0, 255)


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def write_png(path: Path, color: tuple[int, int, int, int], size: int = 20) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), cv2.cvtColor(np.full((size, size, 4), color, np.uint8), cv2.COLOR_RGBA2BGRA))


def write_game(root: Path) -> Path:
    """A game that includes a feature of the common folder, whose descriptor declares a view and its image by paths
    from the game folder, and that declares a shared image of the common folder and one of another game. The feature
    and the common folders have files that nothing declares."""
    resources = root / "resources"
    game, feature = resources / "game", resources / "common" / "features" / "bonus"
    write_png(game / "logo.png", RED)
    write_png(game / "unlisted.png", RED)
    write_png(feature / "p" / "badge.png", RED)
    write_png(feature / "p" / "unlisted.png", RED)
    write_png(resources / "common" / "art" / "frame.png", RED)
    write_png(resources / "common" / "art" / "unlisted.png", RED)
    write_png(resources / "other" / "art" / "coin.png", RED)
    write_json(game / "AllRssData.json", {"include": ["../common/features/bonus/RssData.json", "RssImagesData.json"]})
    write_json(game / "RssImagesData.json", {"images": [
        {"id": "LOGO", "path": "logo.png"}, {"id": "FRAME", "path": "../common/art/frame.png"},
        {"id": "COIN", "path": "../other/art/coin.png"},
    ]})
    write_json(feature / "RssData.json", {
        "elements": [{"id": "BonusView", "path": "../common/features/bonus/v/1920x1080/BonusView.json", "resolution": "1920x1080"}],
        "images": [{"id": "BONUS_BADGE", "path": "../common/features/bonus/p/badge.png"}],
    })
    write_json(feature / "v" / "1920x1080" / "BonusView.json", {"name": "BonusView", "elements": [
        {"id": "badge", "type": "Image", "rssKey": "BONUS_BADGE", "position": {"x": 100, "y": 100}}]})
    return game


def config_for(game: Path) -> Config:
    return Config(resources_dir=game.parent.resolve(), gda_dir=game.parent, extensions=frozenset({".png", ".json"}), game=game.name)


def test_each_asset_is_in_the_game_folder_or_a_folder_of_the_resources_folder(tmp_path):
    game = write_game(tmp_path).resolve()
    result = inventory(config_for(game), asset_facts)
    # An included feature's files are in the folder of the resources folder that holds them.
    assert [(folder["kind"], folder["relative"], folder["assets"]) for folder in result["folders"]] == [
        ("game", ".", 2), ("shared", "../common", 3), ("shared", "../other", 1)]
    rows = {row["resource"]: row for row in result["assets"]}
    folders = {row["resource"]: Path(row["folder"]).relative_to(game.parent).as_posix() for row in result["assets"]}
    assert folders == {
        "logo.png": "game", "unlisted.png": "game", "../common/art/frame.png": "common", "../other/art/coin.png": "other",
        "../common/features/bonus/p/badge.png": "common", "../common/features/bonus/v/1920x1080/BonusView.json": "common",
    }
    # Only the game folder is searched for files that nothing declares.
    assert [name for name, row in rows.items() if row["category"] == "supplementary"] == ["unlisted.png"]
    # A view that an included descriptor declares is a view, its images named by the game's descriptors.
    view = rows["../common/features/bonus/v/1920x1080/BonusView.json"]
    assert (view["type"], view["category"], view["view"]["images"], view["view"]["missingCount"]) == ("view", "available", 1, 0)


def test_the_library_draws_an_included_view_with_the_games_descriptors_and_opens_report_folders(tmp_path):
    game = write_game(tmp_path).resolve()
    (tmp_path / "gda").mkdir()
    entry = {"id": "game", "game_name": "Game", "game_path": str(game), "gda_path": str(tmp_path / "gda")}
    (tmp_path / "workspace.json").write_text(json.dumps({"defaultWorkspace": "game", "workspaces": [entry]}))
    library = Library(str(tmp_path / "app"), config_path=str(tmp_path / "workspace.json"))
    library.init()
    opened: list[str] = []
    with TestClient(create_app(library, dev=True, opener=opened.append), base_url="http://127.0.0.1") as api:
        headers = session_headers(api)
        view = str(game.parent / "common" / "features" / "bonus" / "v" / "1920x1080" / "BonusView.json")
        layout = api.get("/api/rss-sync/view", params={"file": view}).json()
        assert [element.get("missing", []) for element in layout["elements"]] == [[]]
        drawn = cv2.imdecode(np.frombuffer(api.get("/api/rss-sync/preview", params={"file": view, "width": 1920}).content, np.uint8),
                             cv2.IMREAD_UNCHANGED)
        assert tuple(cv2.cvtColor(drawn, cv2.COLOR_BGRA2RGBA)[110, 110]) == RED
        # A report folder opens itself; a file opens the folder it is in.
        feature = str(game.parent / "common" / "features" / "bonus")
        assert api.post("/api/rss-sync/open-folder", headers=headers, json={"file": feature, "isFolder": True}).json() == {"opened": True}
        assert api.post("/api/rss-sync/open-folder", headers=headers, json={"file": str(game / "logo.png")}).json() == {"opened": True}
        assert opened == [feature, str(game)]
