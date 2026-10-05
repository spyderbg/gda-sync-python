# GDA sync: how `gda_sync.py` works

This document describes the behaviour of `gda_sync.py` precisely enough to re-implement it in
another language or runtime (the plan is a backend server with a frontend that visualises the
result). Read it next to the Python source: this file explains *what* happens and *why*; the code is
the final authority on every detail. Where the code has a quirk that a port must either keep or
consciously change, it is listed in [section 7](#7-behaviours-and-quirks-to-preserve-or-consciously-change).

Everything in sections 1 to 8 describes the script as it exists today. Section 9 is different: it is
a proposal for the backend port and for the planned file operations (sync, add file, remove file),
none of which exist in the script yet.

## 1. What it does

A game keeps its resources in `resources/<game>/` (plus shared assets in `resources/common/`). A
separate repository, the **GDA**, holds the artists' source copies of the same assets in a different
folder layout. `gda_sync.py` answers one question: **for every resource of the selected game, does
the GDA hold an identical copy?**

It is strictly **read-only**: it never copies, moves, deletes or edits an asset. Its only side effect
is writing `sync_report.md`.

```
config.json + CLI flags
        |
        v
  Config (validated)
        |
        +--> load *Data.json descriptors (follow "include") --> declared paths + JSON line numbers
        |
        +--> walk resources/<game> on disk                  --> every physical file
        |
        v
  set of path templates --expand {N-M}--> resolved source files
        |
        |      index GDA tree(s) by file name
        v                    |
  classify each source file <+
  (identical | missing | different | invalid)
        |
        v
  Comparison --> terminal table
             --> sync_report.md   (read by the frontend)
             --> exit code 0 / 1 / 2
```

## 2. Files in this folder

| File | Role |
| --- | --- |
| `gda_sync.py` | The whole tool: config, descriptor walking, GDA indexing, comparison, report. |
| `schemas.py` | Typed dataclass shapes of every `*Data.json` descriptor and a strict parser. |
| `config.json` | Default configuration (game, directories, extensions). |
| `test_gda_sync.py` | `unittest` suite; its scenarios are summarised in [section 8](#8-acceptance-scenarios). |
| `README.md` | User-facing usage notes. |
| `pyproject.toml` | Python `>=3.12`, standard library only. |
| `sync_report.md` | Generated on every run. Git-ignored because it contains absolute paths of the local machine. |

`gda_sync.py` imports `schemas` as a sibling module, so it must be run with this folder as the
script directory (or on `sys.path`).

## 3. Vocabulary

| Term | Meaning |
| --- | --- |
| `resources_dir` | Root of all game resources, e.g. `<repo>/resources`. |
| game directory | `resources_dir/<game>`. The only tree whose files are compared. |
| `common` | `resources_dir/common` (constant `COMMON_DIR`). Assets shared between games. A game reaches them with paths such as `../common/art/...`. |
| descriptor | A `*Data.json` file listing resources (images, sounds, fonts, ...). |
| path template | A path string as written in a descriptor. It may contain one `{N-M}` range, so one template can stand for many files. |
| source file | A resolved, existing file under `resources_dir` (the thing being checked). |
| GDA / `gda_dir` | Directory holding the artists' copies for this game. |
| `common_gda_dir` | Optional second GDA directory for assets under `resources/common`. In the real setup it is a checkout of a separate branch of the GDA repository. |
| selected | A source file whose extension is in the configured extension list. Only selected files are counted and compared. |
| candidate | A GDA file that has the same file name as a source file. |

## 4. Inputs: configuration

### 4.1 Keys

Loaded from `config.json` (path overridable with `--config`). Any key not in this table is an error.

| Key | CLI flag | Type | Default | Notes |
| --- | --- | --- | --- | --- |
| `resources_dir` | `--resources-dir` | path | required | Must be an existing directory. |
| `gda_dir` | `--gda-dir` | path | required | Must be an existing directory. |
| `common_gda_dir` | `--common-gda-dir` | path | none | Optional. If given, must exist. |
| `game` | `--game` | string | required | A single directory name: `Path(game).name == game`, and not `.` or `..`. `resources_dir/<game>` must exist. |
| `extensions` | `--extensions .a .b` | non-empty list of strings | required | Each must match `^\.[A-Za-z0-9]+$`. Stored lowercased. A CLI value *replaces* the list. |
| `resource_paths` | `--resource-path P` (repeatable) | list of non-empty strings | `[]` | Extra game-relative path templates to check. A CLI value *replaces* the list. |
| `ignore_dds_mips` | `--ignore-dds-mips` / `--no-ignore-dds-mips` | bool (strict JSON bool) | `true` | See [section 5.8](#58-dds-mip-tolerance). |
| `report_path` | `--report-path` | path | `sync_report.md` | Where the Markdown report is written. |
| `color` | `--color` | `auto` / `always` / `never` | `auto` | Terminal only. |

### 4.2 Precedence and path resolution

- A CLI value always wins over the config file value.
- Relative paths from the **config file** are resolved against the **config file's folder**.
  Relative paths from the **CLI** are resolved against the **current working directory**.
- Every path is passed through `resolve()` (absolute, `..` removed, symlinks followed).
- The config must be a JSON object. Unknown keys raise `unknown configuration keys: a, b`
  (sorted). Every other violation raises a `ValueError` with the message shown in the code
  (`game must be one directory name`, `extensions must be a nonempty list such as [...]`,
  `resources_dir does not exist: <path>`, ...).
- Existence is checked in this order: `resources_dir`, `gda_dir`, `common_gda_dir`, game directory.

Any `OSError`, `ValueError` or `JSONDecodeError` anywhere in a run is caught in `main`, printed as
`gda-sync: <message>` on stderr, and the process exits with code `2`. No report is written then.

## 5. The algorithm

Everything below happens inside `compare(config)`, preceded by `load_config`.

### 5.1 Load descriptors (`load_documents`)

1. Find every file matching `*Data.json` anywhere under the game directory (recursive, sorted).
   The glob matches any name that *ends* in `Data.json`.
2. For each one, load it. The file name selects the schema from `DOCUMENT_TYPES` in `schemas.py`
   (`AllRssData.json`, `RssAudioData.json`, `RssImagesData.json`, ..., `RssData.json`). A name that
   matches the glob but is not in that table raises `unsupported resource descriptor: <path>`.
3. Parse with the strict parser (`parse_dataclass`):
   - the JSON value must be an object;
   - unknown fields are rejected (`unknown fields: ...`), so a new field in a descriptor breaks the
     run until `schemas.py` is updated;
   - types are checked with exact type equality (`type(value) is expected`), lists are checked
     element by element, `X | None` fields accept `null`;
   - the error location is `<file>.<field>[<index>]...`.
4. If the document has an `include` list (only `AllRssData` and `RssData` do), load each included
   file too. Includes are resolved **relative to the including file's folder**, may point outside the
   game directory, and are loaded at most once (documents are keyed by resolved path). A missing
   include raises `included descriptor does not exist: <path>`.
5. If no descriptor was found at all: `no *Data.json descriptors found in <dir>`.

### 5.2 Collect declared paths (`declared_paths`)

Walk the typed document. For each dataclass field:

- a field named `path` yields its string;
- a field named `samples` yields every string in the list (audio events);
- a field named `include` is skipped (it references descriptors, not assets);
- any other field holding a **list** is walked recursively, child by child;
- everything else (non-list fields such as `source: Rectangle`, ids, sizes) is ignored.

Fields that therefore produce paths, by descriptor type:

| Dataclass | Path-bearing field |
| --- | --- |
| `IData`, `Element`, `Font`, `Image`, `Movie`, `RawFile`, `Rtf`, `Localization` | `path` |
| `ImageSequence` | `frames[].path` (each `Frame.path`) |
| `AudioEvent` | `samples[]` |
| `TextStyle` | none |

`AllRssData` and `RssData` can carry several of these lists at once; `AllRssData` is either a list of
includes or, in the launcher, the resources themselves.

### 5.3 Find the JSON line of each declaration (`declared_path_lines`)

The report links every missing resource to the descriptor line that declares it, and the typed
objects carry no positions, so lines are recovered from the raw text:

1. `expected = Counter(declared_paths(document))`, the number of times each template is declared.
2. Scan the raw file for every JSON string token with the regex `"(?:\\.|[^"\\])*"`, tracking the
   1-based line number of each token's start (count `\n` between tokens). Decode each token with
   `json.loads` (so ` ` escapes compare correctly).
3. Record the line for every token whose decoded value is in `expected`.
4. For each expected value, the number of tokens found must equal the declared count. If not, raise
   `<file>: cannot locate the exact JSON line for '<value>'`. This is a consistency check: a value
   that also appears as an unrelated string (an id, a key) would otherwise be attributed wrongly.
5. Yield `(template, line)` pairs, one per declaration, in file order per value.

### 5.4 Expand ranges (`expand_path`)

Only the **first** match of `\{(\d+)-(\d+)\}` is expanded; a second range in the same path stays
literal. The expansion is inclusive, counts up or down depending on which bound is larger, and is
zero-padded to `max(len(first), len(last))` digits:

| Template | Expands to |
| --- | --- |
| `frame_{000-002}.dds` | `frame_000.dds`, `frame_001.dds`, `frame_002.dds` |
| `f_{3-1}.png` | `f_3.png`, `f_2.png`, `f_1.png` |
| `f_{1-10}.png` | `f_01.png` ... `f_10.png` (width comes from the longer bound) |
| `plain.png` | `plain.png` |

### 5.5 Build the set of templates to check

```
declared = set(config.resource_paths)                      # explicit extras, no descriptor
source_documents = map: resolved source file -> set of (descriptor name, line)

for each loaded document:
    descriptor_name = relative path of the document from the game directory (posix-ish, may start "../")
    for (template, line) in declared_path_lines(document):
        declared.add(template)
        for relative in expand_path(template):
            source_documents[resolve(game_dir / relative)].add((descriptor_name, line))

declared.update(every physical file under game_dir, as a posix path relative to game_dir)
```

Two consequences a port must keep:

- **Every physical file in the game folder is compared**, even if no descriptor mentions it. Such
  files end up with `No JSON descriptor` when missing from the GDA.
- Descriptor paths additionally bring in files **outside** the game folder (typically
  `../common/...`), which the folder walk would not find.

### 5.6 Index the GDA (`index_gda`)

For each GDA tree (`gda_dir`, and `common_gda_dir` if set), walk it recursively (hidden folders
included, which is harmless because of the extension filter) and build

```
by_name: file name (exact, case-sensitive) -> sorted list of absolute paths
```

keeping only files whose lowercased extension (`Path.suffix`, the last suffix only) is in the
configured set. **Matching is by file name only, never by folder.** The GDA folder layout differs
from the resources layout, so folders are used only to *order* candidates, never to accept or reject
them.

### 5.7 Classify each source file

Iterate `sorted(declared)` (plain string sort), expand each template, and for every expansion:

```
source  = resolve(game_dir / relative)         # symlinks followed, ".." removed
if source in seen: continue                    # different templates may resolve to one file
seen.add(source)
display = relative path of source from game_dir # e.g. "art/x.dds" or "../common/art/y.dds"

1. if source is not inside resources_dir:       -> "invalid: outside resources_dir"
   elif source is not an existing regular file: -> "invalid: source file does not exist"
   (invalid rows are produced BEFORE the extension filter, so they appear for any extension)
2. if lowercase(source extension) not in extensions: skip (not counted at all)
3. selected += 1
4. trees = (common_gda, game_gda) if common_gda_dir is set and source is under resources_dir/common
           else (game_gda,)
5. candidates = every by_name[source.name] entry of every tree in `trees`, in that tree order
6. if no candidates: -> "missing", required_by = sorted descriptor references of this source
                                   (empty list => the report prints "No JSON descriptor")
7. sort candidates by descending path_overlap(display, candidate path relative to its tree root)
   (stable sort: ties keep the order of step 5)
8. source_hash = SHA-256 of source (1 MiB chunks)
   walk candidates in order; hash each lazily (cached per GDA file);
   first candidate with an equal hash -> matched += 1, stop            # identical
9. no hash match:
     if ignore_dds_mips and source extension is .dds:
         if any candidate satisfies mip_chain_only_differs(source, candidate):
             matched += 1; mip_matched += 1; stop                     # identical (mip-only)
     otherwise -> "different SHA-256", gda_files = candidate paths (relative to their tree root),
                                       gda_paths = absolute candidate paths, in sorted order
```

`path_overlap(a, b)` = the number of folder names the two relative paths share. Folder names are
every path part except the file name, lowercased, with **leading underscores stripped**
(`_lines` equals `lines`). It is a set intersection, so repeated folder names count once.

Notes:

- `common_gda_dir` unset: shared files are searched only in `gda_dir` and normally come out as
  missing.
- Files under `common` are searched in **both** trees because some shared assets are also kept in
  the game's own GDA tree. Identical if either tree holds a matching copy.
- A file under the game directory is never matched against `common_gda_dir`.
- A `different` row lists *all* same-named candidates, not just the closest; the closest comes first.
- Candidate names in a row are relative to their own tree root, so a common-tree name and a
  game-tree name can look alike. The absolute paths disambiguate.

### 5.8 DDS mip tolerance

The game's `.dds` textures carry extra mip levels that the GDA's copies lack, which alone makes the
hashes differ. With `ignore_dds_mips` (default on) such a pair counts as identical.
`mip_chain_only_differs(a, b)` is true when both files are plain 2D DDS textures with the same image
description and one file's pixel data is a **byte prefix** of the other's (smaller mips follow the
top level, so the file with fewer levels is a prefix of the other).

`dds_layout(data)` returns `(identity bytes, offset where pixel data starts)` or "not comparable":

| Check | Rule |
| --- | --- |
| Magic | `data[0:4] == b"DDS "` and `len(data) >= 128`, else not comparable. |
| Cube map / volume | `uint32 LE` at offset 112 (caps2) must be `0`, else not comparable. |
| Identity (legacy header) | `data[12:20]` (height, width) + `data[76:108]` (pixel format block). Pixel data starts at `128`. |
| DX10 header | If the fourcc at `data[84:88]` is `b"DX10"`: need `len(data) >= 148`; the three `uint32 LE` at offset 132 (resource dimension, misc flags, array size) must equal `(3, 0, 1)` (2D texture, not a cube map, one slice), else not comparable. Identity additionally includes `data[128:148]`. Pixel data starts at `148`. |

Then: both layouts exist and their identities are equal, order the two pixel-data slices by length,
and the shorter must be non-empty and the longer must start with it. Header fields outside the
identity (mip count at 28, pitch at 20, flags, caps) are deliberately ignored. The check assumes
neither file is truncated. It reads both files fully into memory.

### 5.9 Sort and summarise

- `differences` is sorted by `(status string, resource display string)`. The status strings sort as
  `different SHA-256` < `invalid: outside resources_dir` < `invalid: source file does not exist` <
  `missing`, which is the order of rows in the report.
- `Comparison` carries: `differences`, `selected`, `matched` (all identical files, *including* the
  mip-only ones) and `mip_matched` (only the mip-only ones).
- **`selected == identical + missing + different`.** Invalid rows are *not* part of `selected`
  (they are rejected before the extension filter), and are reported separately.
- The category of a status is its first word without a trailing colon: `different`, `invalid`,
  `missing` (`status_category`).

## 6. Output

### 6.1 Result data model

```
Difference
  status       : "different SHA-256" | "missing" | "invalid: outside resources_dir"
               | "invalid: source file does not exist"
  resource     : display path relative to the game directory (may start with "../common/")
  gda_files    : candidate paths relative to their tree root       (different only)
  gda_paths    : the same candidates as absolute paths             (different only)
  required_by  : (descriptor name, 1-based line) pairs             (missing only; may be empty)

Comparison
  differences  : Difference[]
  selected     : int
  matched      : int          # identical, includes mip_matched
  mip_matched  : int
```

Only non-identical resources are kept as rows. **Identical files are only counted**, not listed.

### 6.2 `sync_report.md`

Written to `report_path` (parent folders are created) after a successful comparison, even when
everything is identical. UTF-8, `\n` line endings, trailing newline.

```
# GDA sync report: <game>

Resources: `<absolute game dir>`␠␠
GDA: `<absolute gda_dir>`␠␠
Common GDA: `<absolute common_gda_dir>`␠␠            <- only when common_gda_dir is set
Extensions: <sorted extensions joined with ", ">

Compared: <selected> | Identical: <identical text> | Missing: <n> | Different: <n> | Invalid: <n>

| Status | Resource / GDA file(s) |
| --- | --- |
<one row per difference>
```

(`␠␠` marks the two trailing spaces that make a Markdown line break.)

`<identical text>` is `N`, or `N (M differing only in DDS mip levels)` when `M > 0`.

When there are no differences the table has the single row
`| identical | All selected resources match |`.

Row shapes (the status cell is the status string, escaped):

```
| different SHA-256 | [<resource>](<link>)<br><br>[<gda file>](<link>)<br>[<gda file>](<link>) |
| missing | [<resource>](<link>)<br>[<descriptor>:<line>](<link>#L<line>)<br>[...] |
| missing | [<resource>](<link>)<br>No JSON descriptor |
| invalid: source file does not exist | [<resource>](<link>) |
| invalid: outside resources_dir | [<resource>](<link>) |
```

- A `different` row puts a **blank gap** (`<br><br>`) between the resource and the GDA files, and a
  single `<br>` between GDA files. The GDA files are in closest-folder-first order.
- A `missing` row lists each declaring descriptor as `name:line`, linked to the descriptor file with
  an `#L<line>` anchor, or `No JSON descriptor` when none declares it.
- The resource link points at `resolve(resources_dir/<game>/<resource>)` even for invalid rows.
- A descriptor link points at `resolve(resources_dir/<game>/<descriptor name>)`.
- A GDA file link points at its absolute path; its label is the path relative to its own tree root.

**Escaping.** Applied to every link label and to the status cell: `\` becomes `\\`, then `|` becomes
`\|`, `[` becomes `\[`, `]` becomes `\]`, and newlines become spaces.

**Link targets.** `relpath(file, directory of the report)` with `/` separators, then percent-encoded
with `urllib.parse.quote(..., safe="/")`, then `#L<line>` appended for descriptor links. Parentheses,
spaces and `+` are therefore always encoded (`18+` is `18%2B`), so a target never contains `)`.
Targets are **relative to the report's folder**: moving the report breaks them.

#### Parsing the report in a frontend

Prefer the structured model in [section 9.1](#91-return-structured-data-not-markdown) over parsing
Markdown. If the Markdown is consumed anyway:

1. Take the line starting with `Compared:` and split on ` | `. Each part is `Label: value`;
   `Identical` may carry the parenthesised mip count.
2. Table rows are the lines starting with `| ` after the `| --- | --- |` line. Split into two cells
   on the first ` | ` that is not preceded by a backslash. The first cell is the status.
3. Split the second cell on `<br><br>` into at most two groups: the resource group and, for
   `different` rows, the GDA group. Split each group on `<br>`.
4. The first piece of the resource group is the resource link. In a `missing` row the remaining
   pieces are descriptor links or the literal text `No JSON descriptor`.
5. Parse a link with `\[((?:\\.|[^\]\\])*)\]\(([^)]*)\)`; unescape the label with `\\(.)` to `\1`;
   `decodeURIComponent` the target; a trailing `#L<n>` is the descriptor line.
6. Classify the row by the first word of the status (`different`, `missing`, `invalid`).

Header paths (`Resources:`, `GDA:`, `Common GDA:`) are absolute paths of the machine that ran the
tool.

### 6.3 Terminal table and exit codes (CLI only)

A port that runs as a server can drop the terminal output, but the exit-code meaning is worth
mapping to HTTP or job statuses.

- Two columns, `Status` and `Resource / GDA file(s)`, padded to the widest value, separated by
  ` | ` and a `-+-` rule. A row is one block of lines: the status and resource first, then one line
  per GDA file, descriptor reference or `No JSON descriptor` with an empty status cell.
- Colors by category when enabled (`always`, or `auto` with a TTY and no `NO_COLOR`): `missing`
  yellow `\033[33m`, `different` red `\033[31m`, `invalid` magenta `\033[35m`; the whole line is
  wrapped and reset with `\033[0m`.
- Final line: `Compared: N; identical: <identical text>; missing: N; different: N; invalid: N`.
- A `Report: <path>` line follows once the report is written.

| Exit code | Meaning |
| --- | --- |
| `0` | Every selected resource is identical (and no invalid rows). |
| `1` | Differences exist (any missing, different or invalid). **Not an error**: the report was written. |
| `2` | Configuration or input error (see section 4.2). No report written. |

## 7. Behaviours and quirks to preserve or consciously change

1. **Name-only matching.** Folders never decide a match. Two different game files with the same name
   in different folders are both satisfied by one GDA file with that name and content.
2. **Case-sensitive names, case-insensitive extensions.** `Foo.DDS` and `foo.dds` are different
   names; the extension filter lowercases only the suffix.
3. **No rename or move detection.** A file present in the GDA under another name is reported missing.
4. **Source-driven only.** Files that exist in the GDA but not in the game are never reported.
5. **Invalid beats the extension filter.** A declared path that does not exist is invalid whatever its
   extension, and a declared directory counts as `source file does not exist`.
6. **`resolve()` follows symlinks.** A symlinked asset that points outside `resources_dir` is
   `invalid: outside resources_dir`.
7. **Strict schemas.** Unknown descriptor fields and wrong types abort the whole run. The type check
   is exact, so a JSON integer for a `float` field (for example `fadeIn: 1`) is rejected, and a
   boolean is never accepted for an integer.
8. **Fragile line lookup.** If a declared path string also occurs as another string token in the same
   descriptor, the counts differ and the run aborts with `cannot locate the exact JSON line`.
9. **Only the first `{N-M}` per path is expanded**, and a very large range is not limited.
10. **Dedup by resolved file.** Two templates that resolve to the same file produce one row.
11. **Identical files are not listed**, only counted, so a view of "everything" cannot be built from
    the report.
12. **Counts.** `Compared` excludes invalid rows; `Identical` includes mip-only matches.
13. **Cost.** Every GDA file with a selected extension is indexed on every run; hashing is lazy and
    cached per GDA file within a run; DDS mip checks read whole files. The run has no cache across
    invocations.
14. **A descriptor name may start with `../`** when an included descriptor lives outside the game
    folder.

## 8. Acceptance scenarios

These come from `test_gda_sync.py` and make good test cases for a port.

- **Statuses.** Game files `same`, `changed`, `required`, `unlisted`, frames expanded from
  `frame_{000-001}.dds`; GDA with a decoy `same` in another folder plus the real one, an old
  `changed`, and one frame. Plus explicit `resource_paths` `extra-missing.dds` and
  `../../outside.dds`. Expected: `matched=2`, `selected=6`; `changed` is `different SHA-256`;
  `required`, `unlisted`, `frame_001` are `missing`; `extra-missing` is
  `invalid: source file does not exist`; `../../outside.dds` is `invalid: outside resources_dir`.
- **Descriptor lines.** `required.dds` is declared in `AllRssData.json` (line 3) and `RssRawData.json`
  (line 5) and lists both, sorted. `frame_001.dds` lists only the sequence descriptor line. `unlisted`
  has no descriptor. Audio `samples` over several lines (including a ` ` escape) report the
  right lines.
- **Includes.** A descriptor reached only through `include` is loaded; every `*Data.json` in every
  resource folder of the repository loads without error.
- **Closest folder first.** For `art/folder/x.dds` with GDA copies in `a_elsewhere/` and
  `z/folder/`, the order is `z/folder/x.dds` then `a_elsewhere/x.dds`, in the table and in the report.
- **Common assets.** With `common_gda_dir`: `../common/art/shared.dds` matches the common tree,
  `kept.dds` matches in the game tree, and a same-named `own.dds` in the common tree does not satisfy
  a game file. Without it, `shared.dds` is `different SHA-256` against the decoy.
- **Config.** `common_gda_dir` comes from the config or the CLI and must exist.
  `ignore_dds_mips` is true by default, can be set in the config or turned off with
  `--no-ignore-dds-mips`, and a non-boolean raises `ignore_dds_mips must be true or false`.
- **Mips.** A DX10 DDS with 1 level versus 3 levels of the same top image matches in both
  directions. Different image bytes, size or format do not. A file with no pixel data, a non-DDS
  file, a cube map (`caps2 != 0`) and an array texture (`array_size != 1`) never match.
  With the option off, mip-only pairs become `different SHA-256`.
- **All identical.** Exit `0`, summary line `Compared: 1; identical: 1; missing: 0 ...`, report
  contains `| identical | All selected resources match |`.
- **Report text.** Links are relative to the report; the report never contains ANSI color codes; the
  summary line reads `Missing: 3 | Different: 1 | Invalid: 2` for the first scenario.

## 9. Notes for the backend port and the planned file operations

This section is a proposal. The script does none of it today.

### 9.1 Return structured data, not Markdown

The report is a rendering of `Comparison`. The server should compute the same `Comparison` and return
it as JSON, rendering Markdown only if someone still wants the file. A shape that carries everything
the report carries plus what a UI needs:

```json
{
  "game": "burning_crown_tetra_spins_10",
  "resourcesDir": "/abs/resources",
  "gdaDir": "/abs/gda",
  "commonGdaDir": null,
  "extensions": [".csv", ".dds"],
  "summary": { "compared": 2403, "identical": 1270, "identicalMipOnly": 1163,
               "missing": 1080, "different": 53, "invalid": 1 },
  "differences": [
    {
      "id": "stable id, e.g. hash of the resource path",
      "category": "different",
      "status": "different SHA-256",
      "resource": "art/1920x1080/R/R_164_142/bell_164_142/DDS/Bell_00000.dds",
      "resourcePath": "/abs/resources/<game>/art/.../Bell_00000.dds",
      "scope": "game",
      "gdaFiles": [{ "tree": "game", "path": "02.ReelSymbols/DDS/.../Bell_00000.dds",
                     "absolutePath": "/abs/gda/02.ReelSymbols/DDS/.../Bell_00000.dds" }],
      "requiredBy": [{ "descriptor": "RssImagesData.json", "line": 480 }]
    }
  ]
}
```

Fields beyond the script's own model: `category`, `scope` (`game` or `common`, from
`source.is_relative_to(resources_dir/common)`), `tree` (which GDA tree a candidate came from) and a
stable `id`. Keep the original status strings so behaviour stays comparable with the Python tool.

Decide up front whether the UI needs **identical** files too (a full tree view). If so, `compare` has
to retain a record per identical file; today it only counts them.

### 9.2 Changes a server needs regardless of the operations

- Separate the pure pieces: scan descriptors, index the GDA, classify, serialise. The Python mixes
  printing and report writing into `main`; nothing in the classification needs the terminal.
- Take the configuration as a request or stored settings object. There is no ambient working
  directory on a server, so the "CLI paths relative to cwd" rule has no equivalent.
- A run over ~2400 resources reads and hashes thousands of files. Run it as a job with progress, and
  cache hashes keyed by `(absolute path, size, mtime)` across runs.
- Treat exit code `1` ("differences exist") as a successful result, not a failure.

### 9.3 Planned operations

The script never writes to the GDA, so these have no reference implementation. What the existing
model gives each of them, and what it lacks:

| Operation | Natural starting point | What is missing |
| --- | --- | --- |
| **Sync** (make the GDA copy match the game file) | A `different` row: `resourcePath` is the source and `gdaFiles` are the candidates, closest folder first. | When several candidates exist the user must choose, or all must be updated. For `.dds`, the GDA copies deliberately lack mip levels, so overwriting a GDA texture with the game's copy changes more than its content. Decide the intended direction and format before copying. |
| **Add file** (put a game file into the GDA) | A `missing` row. | The script has no resources-to-GDA folder mapping (`art/1920x1080/R/R_164_142/.../DDS/` lives under `02.ReelSymbols/DDS/R_164_142/...` in the GDA), and nothing records where a new file should go. The destination folder must come from the user or from a mapping the backend defines. Files under `resources/common` go to `common_gda_dir`. |
| **Remove file** (delete from the GDA) | A candidate path from a `different` row. | Comparison is source-driven, so GDA files that have no counterpart in the game are never reported. Removing orphans needs a reverse pass over the GDA index. |

For all three:

- Resolve and check every path against the configured roots before touching the disk, so a request
  cannot escape `resources_dir`, `gda_dir` or `common_gda_dir`.
- Re-run the classification for the affected resource afterwards (a `compare_one(resource)` built
  from the same steps as section 5.7) instead of trusting that the operation worked, and update the
  returned model.
- The GDA is a version-controlled checkout (one branch per game plus a separate `common_italy`
  branch, with large files in LFS), so a write is a working-tree change that still has to be
  committed there. Decide whether the backend only edits files or also drives git.
