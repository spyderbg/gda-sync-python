import os

import pytest

from egt_gda_sync.errors import AppError
from egt_gda_sync.library import Library, safe_path
from tests.fixtures.bc7_dds import create_bc7_dds
from tests.fixtures.png_reader import read_png


def read(path: str) -> bytes:
    with open(path, "rb") as handle:
        return handle.read()


def test_demo_has_real_assets_and_identifies_new_modified_and_matching_files(library):
    data = library.scan()
    assert len(data["assets"]) == 18
    assert data["warnings"] == []
    statuses = [asset["status"] for asset in data["assets"]]
    assert (statuses.count("new"), statuses.count("modified"), statuses.count("synced")) == (5, 3, 10)
    dds = next(asset for asset in data["assets"] if asset["extension"] == "dds")
    assert dds["dimensions"]["width"] == 512
    preview, mime = library.preview(dds)
    assert mime == "image/png"
    assert read_png(preview)[:2] == (512, 512)


def test_sync_copies_originals_keeps_folder_structure_and_backs_up_replaced_gda_files(library):
    pending = [asset for asset in library.scan()["assets"] if asset["status"] != "synced"]
    changed = next(asset for asset in pending if asset["status"] == "modified")
    destination = os.path.join(library.config["destination"], changed["path"])
    previous = read(destination)
    original = read(os.path.join(library.config["source"], changed["path"]))

    result = library.sync([asset["id"] for asset in pending])
    assert result["failures"] == []
    assert len(result["copied"]) == 8
    assert all(asset["status"] == "synced" for asset in result["library"]["assets"])
    assert read(os.path.join(library.config["source"], changed["path"])) == original
    assert read(destination) == original
    [operation] = os.listdir(library.backup_path)
    assert read(os.path.join(library.backup_path, operation, changed["path"])) == previous
    assert not [name for _root, _dirs, files in os.walk(library.config["destination"]) for name in files if name.endswith(".tmp")]

    assert library.sync([asset["id"] for asset in pending])["copied"] == []
    restored = Library(library.home)
    restored.init()
    assert [entry["action"] for entry in restored.activity].count("sync") == 1
    assert restored.activity[0]["bytes"] == result["bytes"]


def test_equal_sized_files_with_different_contents_are_modified(library):
    with open(os.path.join(library.config["source"], "equal.txt"), "w") as handle:
        handle.write("alpha")
    with open(os.path.join(library.config["destination"], "equal.txt"), "w") as handle:
        handle.write("bravo")
    asset = next(asset for asset in library.scan()["assets"] if asset["name"] == "equal.txt")
    assert asset["status"] == "modified"


def test_hidden_files_are_skipped_and_unknown_types_are_listed(library):
    for name in (".hidden.png", "notes.txt"):
        with open(os.path.join(library.config["source"], name), "w") as handle:
            handle.write("x")
    names = {asset["name"]: asset for asset in library.scan()["assets"]}
    assert ".hidden.png" not in names
    assert (names["notes.txt"]["type"], names["notes.txt"]["folder"]) == ("other", "Root")


def test_path_traversal_and_symbolic_links_cannot_escape_source_or_destination(library, tmp_path):
    with pytest.raises(AppError, match="Invalid asset path"):
        safe_path(library.config["source"], "../outside.txt")
    with pytest.raises(AppError, match="Invalid asset path"):
        safe_path(library.config["source"], str(tmp_path))
    try:
        os.symlink(tmp_path, os.path.join(library.config["source"], "escape"), target_is_directory=True)
        os.symlink(tmp_path, os.path.join(library.config["destination"], "linked-folder"), target_is_directory=True)
    except OSError:
        pytest.skip("Creating symbolic links requires extra privileges on this system")
    with pytest.raises(AppError, match="Symbolic links"):
        safe_path(library.config["source"], "escape/secret")
    assert any("Skipped symbolic link" in warning for warning in library.scan()["warnings"])
    with pytest.raises(AppError, match="Symbolic links"):
        safe_path(library.config["destination"], "linked-folder/surprise.txt", create_parents=True)


def test_invalid_workspace_connections_are_rejected_and_valid_connections_persist(library, tmp_path):
    source = library.config["source"]
    with pytest.raises(AppError, match="absolute"):
        library.update_config("Test", "relative", str(tmp_path))
    with pytest.raises(AppError, match="separate"):
        library.update_config("Test", source, source)
    nested = os.path.join(source, "nested")
    os.mkdir(nested)
    with pytest.raises(AppError, match="nesting"):
        library.update_config("Test", source, nested)
    with pytest.raises(AppError, match="must exist"):
        library.update_config("Test", str(tmp_path / "does-not-exist"), str(tmp_path))
    with pytest.raises(AppError, match="1–80"):
        library.update_config("   ", source, str(tmp_path))

    real_source, real_destination = tmp_path / "real-source", tmp_path / "real-gda"
    real_source.mkdir()
    real_destination.mkdir()
    (real_source / "asset.txt").write_text("hello")
    data = library.update_config("Real project", str(real_source), str(real_destination))
    assert len(data["assets"]) == 1
    assert data["config"]["demo"] is False
    again = Library(library.home)
    again.init()
    assert again.config["name"] == "Real project"
    assert again.activity[0]["message"] == "Connected Real project workspace"


def test_workspace_operations_are_exclusive(library):
    library._operation.acquire()
    try:
        assert library.busy
        with pytest.raises(AppError, match="in progress") as error:
            library.rescan()
        assert error.value.status_code == 409
    finally:
        library._operation.release()
    assert len(library.rescan()["activity"]) == 1


def test_an_unreadable_workspace_configuration_stops_startup(tmp_path):
    (tmp_path / "workspace.json").write_text("{not json")
    with pytest.raises(RuntimeError, match="Could not read workspace.json"):
        Library(str(tmp_path)).init()


def test_unsupported_dds_formats_remain_syncable_with_a_preview_message(library):
    with open(os.path.join(library.config["source"], "bc6.dds"), "wb") as handle:
        handle.write(create_bc7_dds(4, 4, 95))
    asset = next(asset for asset in library.scan()["assets"] if asset["name"] == "bc6.dds")
    assert asset["preview"] is False
    assert asset["previewError"] == "Preview unavailable for DXGI 95. The original file can still be synced."
    with pytest.raises(AppError) as error:
        library.preview(asset)
    assert error.value.status_code == 415
    assert library.sync([asset["id"]])["copied"] == ["bc6.dds"]


def test_activity_keeps_every_copy_and_caps_only_other_entries(library):
    library._record("sync", "Synced 1 asset to GDA", ["a.png"], 10)
    for index in range(120):
        library._record("scan", f"Scanned {index} assets")
    assert len(library.activity) == 101
    assert library.activity[-1]["action"] == "sync"
