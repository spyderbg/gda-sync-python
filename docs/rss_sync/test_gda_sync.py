"""Focused checks for descriptor paths and content-based matching."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
import re
import struct
from tempfile import TemporaryDirectory
import unittest

from gda_sync import (DDS_HEADER_END, Config, compare, declared_path_lines, load_config,
                      load_documents, main,
                      markdown_report, mip_chain_only_differs, parse_args, print_table)


def dds(levels: list[bytes], *, width: int = 8, height: int = 8, format_id: int = 98,
        caps2: int = 0, array_size: int = 1) -> bytes:
    """Build a DX10 DDS file whose pixel data is the given mip levels, largest first."""
    header = bytearray(DDS_HEADER_END)
    header[0:4] = b"DDS "
    struct.pack_into("<I", header, 4, 124)
    struct.pack_into("<II", header, 12, height, width)
    struct.pack_into("<I", header, 28, len(levels))
    struct.pack_into("<I", header, 76, 32)
    header[84:88] = b"DX10"
    struct.pack_into("<I", header, 112, caps2)
    extension = struct.pack("<IIIII", format_id, 3, 0, array_size, 0)
    return bytes(header) + extension + b"".join(levels)


class GdaSyncTests(unittest.TestCase):
    def test_every_resource_folder_loads(self) -> None:
        resources = Path(__file__).resolve().parents[2] / "resources"
        folders = [folder for folder in sorted(resources.iterdir()) if any(folder.rglob("*Data.json"))]
        self.assertIn(resources / "burning_crown_tetra_spins_10", folders)
        for folder in folders:
            with self.subTest(folder=folder.name):
                documents = load_documents(folder)
                local = {path.resolve() for path in folder.rglob("*Data.json")}
                self.assertLessEqual(local, set(documents))
                for path, document in documents.items():
                    list(declared_path_lines(path, document))
        documents = load_documents(resources / "burning_crown_tetra_spins_10")
        self.assertIn(resources / "burning_crown_tetra_spins_10" / "RssImagesSeqData.json", documents)

    def test_declared_path_lines_for_audio_samples(self) -> None:
        with TemporaryDirectory() as temporary:
            game = Path(temporary) / "example"
            game.mkdir()
            descriptor = game / "RssAudioData.json"
            descriptor.write_text(
                '{\n  "audioEvents": [\n'
                '    {"id": "beep", "samples": [\n'
                '      "one\\u0020sample.wav",\n'
                '      "two.wav"\n'
                '    ]}\n  ]\n}\n',
                encoding="utf-8",
            )
            document = load_documents(game)[descriptor]
            self.assertEqual(list(declared_path_lines(descriptor, document)),
                             [("one sample.wav", 4), ("two.wav", 5)])

    def test_comparison_statuses_and_report(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            game = root / "resources" / "example"
            gda = root / "gda"
            game.mkdir(parents=True)
            (gda / "a").mkdir(parents=True)
            (gda / "b").mkdir()
            (game / "same.dds").write_bytes(b"same")
            (game / "changed.dds").write_bytes(b"new")
            (game / "required.dds").write_bytes(b"required")
            (game / "unlisted.dds").write_bytes(b"other")
            (gda / "a" / "same.dds").write_bytes(b"wrong")
            (gda / "b" / "same.dds").write_bytes(b"same")
            (gda / "a" / "changed.dds").write_bytes(b"old")
            (game / "AllRssData.json").write_text(
                '{\n  "include": ["RssRawData.json", "RssImagesSeqData.json"],\n'
                '  "rawFiles": [{"path": "required.dds"}]\n}\n',
                encoding="utf-8",
            )
            (game / "RssRawData.json").write_text(
                '{\n  "rawFiles": [\n'
                '    {"path": "same.dds"},\n'
                '    {"path": "changed.dds"},\n'
                '    {"path": "required.dds"}\n'
                '  ]\n}\n',
                encoding="utf-8",
            )
            (game / "RssImagesSeqData.json").write_text(
                '{\n  "imagesSeq": [\n'
                '    {"id": "seq", "frameTime": 60, "loopCount": 0,\n'
                '     "frames": [{"path": "frame_{000-001}.dds"}]}\n'
                '  ]\n}\n',
                encoding="utf-8",
            )
            (game / "frame_000.dds").write_bytes(b"frame")
            (game / "frame_001.dds").write_bytes(b"frame")
            (gda / "a" / "frame_000.dds").write_bytes(b"frame")
            report_path = root / "scripts" / "gda-sync" / "sync_report.md"
            config = Config(root / "resources", gda, frozenset({".dds"}), "example",
                            ("extra-missing.dds", "../../outside.dds"),
                            report_path, "always")
            result = compare(config)
            self.assertEqual((result.matched, result.selected), (2, 6))
            self.assertEqual(
                {(row.status, row.resource) for row in result.differences},
                {("different SHA-256", "changed.dds"),
                 ("missing", "required.dds"), ("missing", "unlisted.dds"),
                 ("missing", "frame_001.dds"),
                 ("invalid: source file does not exist", "extra-missing.dds"),
                 ("invalid: outside resources_dir", "../../outside.dds")},
            )
            required = next(row for row in result.differences if row.resource == "required.dds")
            self.assertEqual(required.required_by,
                             (("AllRssData.json", 3), ("RssRawData.json", 5)))
            frame = next(row for row in result.differences if row.resource == "frame_001.dds")
            self.assertEqual(frame.required_by, (("RssImagesSeqData.json", 4),))

            config_file = root / "config.json"
            config_file.write_text(json.dumps({
                "resources_dir": "resources", "gda_dir": "absent-gda", "extensions": [".dds"],
                "game": "example", "resource_paths": ["extra-missing.dds", "../../outside.dds"],
                "report_path": "scripts/gda-sync/sync_report.md", "color": "never",
            }), encoding="utf-8")
            output = StringIO()
            with redirect_stdout(output):
                code = main(["--config", str(config_file), "--gda-dir", str(gda),
                             "--color", "always"])
            self.assertEqual(code, 1)
            self.assertIn("\033[31m", output.getvalue())
            report = config.report_path.read_text(encoding="utf-8")
            self.assertIn("| Status | Resource / GDA file(s) |", report)
            self.assertNotIn("Detail", report)
            self.assertIn(
                "| different SHA-256 | [changed.dds](../../resources/example/changed.dds)"
                "<br><br>[a/changed.dds](../../gda/a/changed.dds) |", report)
            self.assertIn(
                "| missing | [required.dds](../../resources/example/required.dds)"
                "<br>[AllRssData.json:3](../../resources/example/AllRssData.json#L3)"
                "<br>[RssRawData.json:5](../../resources/example/RssRawData.json#L5) |", report)
            self.assertIn(
                "| missing | [unlisted.dds](../../resources/example/unlisted.dds)"
                "<br>No JSON descriptor |", report)
            self.assertIn(
                "| missing | [frame_001.dds](../../resources/example/frame_001.dds)"
                "<br>[RssImagesSeqData.json:4]"
                "(../../resources/example/RssImagesSeqData.json#L4) |",
                report)
            self.assertIn(
                "| invalid: outside resources_dir | [../../outside.dds](../../outside.dds) |",
                report)
            self.assertIn("Missing: 3 | Different: 1 | Invalid: 2", report)
            plain = re.sub(r"\033\[[0-9;]*m", "", output.getvalue()).splitlines()
            first = next(index for index, text in enumerate(plain)
                         if text.startswith("different SHA-256"))
            self.assertTrue(plain[first + 1].lstrip().startswith("| a/changed.dds"))
            required_line = next(index for index, text in enumerate(plain)
                                 if text.startswith("missing") and "required.dds" in text)
            self.assertTrue(plain[required_line + 1].lstrip().startswith("| AllRssData.json:3"))
            self.assertTrue(plain[required_line + 2].lstrip().startswith("| RssRawData.json:5"))
            self.assertIn("invalid: 2", plain[-2])
            self.assertNotIn("\033[", report)

    def test_all_identical_still_prints_and_writes_the_report(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            game = root / "resources" / "example"
            gda = root / "gda"
            game.mkdir(parents=True)
            gda.mkdir()
            (game / "RssRawData.json").write_text(
                json.dumps({"rawFiles": [{"path": "same.dds"}]}), encoding="utf-8")
            (game / "same.dds").write_bytes(b"same")
            (gda / "same.dds").write_bytes(b"same")
            config_file = root / "config.json"
            config_file.write_text(json.dumps({
                "resources_dir": "resources", "gda_dir": "gda", "extensions": [".dds"],
                "game": "example", "report_path": "sync_report.md", "color": "never",
            }), encoding="utf-8")
            output = StringIO()
            with redirect_stdout(output):
                code = main(["--config", str(config_file)])
            self.assertEqual(code, 0)
            self.assertIn("Compared: 1; identical: 1; missing: 0", output.getvalue())
            report = (root / "sync_report.md").read_text(encoding="utf-8")
            self.assertIn("| identical | All selected resources match |", report)

    def test_dds_mip_levels(self) -> None:
        top, middle, small = b"T" * 64, b"m" * 16, b"n" * 4
        one, three = dds([top]), dds([top, middle, small])
        self.assertTrue(mip_chain_only_differs(one, three))
        self.assertTrue(mip_chain_only_differs(three, one))
        self.assertFalse(mip_chain_only_differs(dds([b"X" * 64]), three))  # other image
        self.assertFalse(mip_chain_only_differs(dds([top], width=16), three))  # other size
        self.assertFalse(mip_chain_only_differs(dds([top], format_id=71), three))  # other format
        self.assertFalse(mip_chain_only_differs(dds([]), three))  # no pixel data at all
        self.assertFalse(mip_chain_only_differs(b"not a dds file", three))
        # Cube maps and array textures interleave their mips, so a prefix says nothing.
        self.assertFalse(mip_chain_only_differs(dds([top], caps2=1), dds([top, middle], caps2=1)))
        self.assertFalse(mip_chain_only_differs(dds([top], array_size=2),
                                                dds([top, middle], array_size=2)))

    def test_dds_mip_levels_in_a_comparison(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            game = root / "resources" / "example"
            gda = root / "gda"
            game.mkdir(parents=True)
            gda.mkdir()
            (game / "RssRawData.json").write_text(
                json.dumps({"rawFiles": [{"path": "mips.dds"}, {"path": "other.dds"}]}),
                encoding="utf-8")
            top = b"T" * 64
            (game / "mips.dds").write_bytes(dds([top, b"m" * 16]))
            (gda / "mips.dds").write_bytes(dds([top]))
            (game / "other.dds").write_bytes(dds([b"A" * 64, b"m" * 16]))
            (gda / "other.dds").write_bytes(dds([b"B" * 64]))

            def run(ignore: bool):
                return compare(Config(root / "resources", gda, frozenset({".dds"}), "example", (),
                                      root / "sync_report.md", "never", ignore_dds_mips=ignore))

            result = run(True)
            self.assertEqual((result.matched, result.mip_matched, result.selected), (1, 1, 2))
            self.assertEqual([(row.status, row.resource) for row in result.differences],
                             [("different SHA-256", "other.dds")])
            result = run(False)
            self.assertEqual((result.matched, result.mip_matched), (0, 0))
            self.assertEqual({row.resource for row in result.differences}, {"mips.dds", "other.dds"})

    def test_closest_gda_folder_is_listed_first(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            game = root / "resources" / "example" / "art" / "folder"
            gda = root / "gda"
            for directory in (game, gda / "a_elsewhere", gda / "z" / "folder"):
                directory.mkdir(parents=True)
            (root / "resources" / "example" / "RssRawData.json").write_text(
                json.dumps({"rawFiles": [{"path": "art/folder/x.dds"}]}), encoding="utf-8")
            (game / "x.dds").write_bytes(b"game")
            (gda / "a_elsewhere" / "x.dds").write_bytes(b"one")
            (gda / "z" / "folder" / "x.dds").write_bytes(b"two")
            config = Config(root / "resources", gda, frozenset({".dds"}), "example", (),
                            root / "sync_report.md", "never")
            result = compare(config)
            self.assertEqual(result.differences[0].gda_files,
                             ("z/folder/x.dds", "a_elsewhere/x.dds"))
            report = markdown_report(config, result)
            self.assertIn(
                "[art/folder/x.dds](resources/example/art/folder/x.dds)<br><br>"
                "[z/folder/x.dds](gda/z/folder/x.dds)<br>"
                "[a_elsewhere/x.dds](gda/a_elsewhere/x.dds)", report)
            output = StringIO()
            with redirect_stdout(output):
                print_table(result, "never")
            lines = output.getvalue().splitlines()
            first = next(index for index, line in enumerate(lines)
                         if line.startswith("different SHA-256"))
            self.assertTrue(lines[first + 1].lstrip().startswith("| z/folder/x.dds"))
            self.assertTrue(lines[first + 2].lstrip().startswith("| a_elsewhere/x.dds"))

    def test_common_assets_are_looked_up_in_the_common_gda_dir(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            game = root / "resources" / "example"
            common = root / "resources" / "common" / "art"
            gda = root / "gda"
            common_gda = root / "common_gda" / "DEV" / "01_MG"
            for directory in (game, common, gda, common_gda):
                directory.mkdir(parents=True)
            (game / "RssRawData.json").write_text(
                json.dumps({"rawFiles": [{"path": "../common/art/shared.dds"},
                                         {"path": "../common/art/kept.dds"}]}),
                encoding="utf-8",
            )
            (game / "own.dds").write_bytes(b"own")
            (common / "shared.dds").write_bytes(b"shared")
            (common / "kept.dds").write_bytes(b"kept")
            (gda / "shared.dds").write_bytes(b"decoy")  # same name, other content
            (gda / "kept.dds").write_bytes(b"kept")  # shared file kept only in the game tree
            (common_gda / "shared.dds").write_bytes(b"shared")
            (common_gda / "own.dds").write_bytes(b"own")  # must not satisfy a game file

            def run(common_gda_dir: Path | None):
                config = Config(root / "resources", gda, frozenset({".dds"}), "example", (),
                                root / "sync_report.md", "never", common_gda_dir)
                return compare(config)

            result = run(root / "common_gda")
            self.assertEqual((result.matched, result.selected), (2, 3))
            self.assertEqual([(row.status, row.resource) for row in result.differences],
                             [("missing", "own.dds")])

            # Unset: shared files are judged against gda_dir only, as before.
            result = run(None)
            self.assertEqual((result.matched, result.selected), (1, 3))
            self.assertEqual({(row.status, row.resource, row.gda_files) for row in result.differences},
                             {("different SHA-256", "../common/art/shared.dds", ("shared.dds",)),
                              ("missing", "own.dds", ())})

            # A shared asset with no matching copy links to folders in both GDA trees.
            (common / "shared.dds").write_bytes(b"changed")
            config = Config(root / "resources", gda, frozenset({".dds"}), "example", (),
                            root / "sync_report.md", "never", root / "common_gda")
            report = markdown_report(config, compare(config))
            self.assertIn("[../common/art/shared.dds](resources/common/art/shared.dds)", report)
            self.assertIn("[DEV/01_MG/shared.dds](common_gda/DEV/01_MG/shared.dds)", report)
            self.assertIn("[shared.dds](gda/shared.dds)", report)

    def test_common_gda_dir_from_config_and_cli(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in ("resources/example", "gda", "common_gda"):
                (root / name).mkdir(parents=True)
            base = {"resources_dir": "resources", "gda_dir": "gda",
                    "extensions": [".dds"], "game": "example"}
            plain = root / "plain.json"
            plain.write_text(json.dumps(base), encoding="utf-8")
            configured = root / "configured.json"
            configured.write_text(json.dumps({**base, "common_gda_dir": "common_gda"}),
                                  encoding="utf-8")

            self.assertIsNone(load_config(parse_args(["--config", str(plain)])).common_gda_dir)
            self.assertEqual(
                load_config(parse_args(["--config", str(configured)])).common_gda_dir,
                (root / "common_gda").resolve())
            self.assertEqual(
                load_config(parse_args(["--config", str(plain), "--common-gda-dir",
                                        str(root / "common_gda")])).common_gda_dir,
                (root / "common_gda").resolve())
            with self.assertRaisesRegex(ValueError, "common_gda_dir does not exist"):
                load_config(parse_args(["--config", str(plain), "--common-gda-dir",
                                        str(root / "absent")]))

    def test_ignore_dds_mips_from_config_and_cli(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in ("resources/example", "gda"):
                (root / name).mkdir(parents=True)
            base = {"resources_dir": "resources", "gda_dir": "gda",
                    "extensions": [".dds"], "game": "example"}

            names = iter(range(100))

            def config_with(**extra: object) -> str:
                path = root / f"config{next(names)}.json"
                path.write_text(json.dumps({**base, **extra}), encoding="utf-8")
                return str(path)

            def ignore(*argv: str, **extra: object) -> bool:
                return load_config(parse_args(["--config", config_with(**extra), *argv])).ignore_dds_mips

            self.assertTrue(ignore())
            self.assertFalse(ignore(ignore_dds_mips=False))
            self.assertTrue(ignore("--ignore-dds-mips", ignore_dds_mips=False))
            self.assertFalse(ignore("--no-ignore-dds-mips"))
            with self.assertRaisesRegex(ValueError, "ignore_dds_mips must be true or false"):
                ignore(ignore_dds_mips="yes")


if __name__ == "__main__":
    unittest.main()
