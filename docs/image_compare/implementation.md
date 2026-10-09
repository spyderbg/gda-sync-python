# Image matching: implementation

The GDA sync compares each game image with the images of its GDA folder **by their contents**, as
[algorithm.md](algorithm.md) proposes. For every image it compares, the sync report gives the probability, from
0.0 to 100.0 %, that a GDA image shows the same picture. It also records the value of every comparison algorithm,
such as pHash's Hamming distance, and lists the GDA images whose probability reaches a threshold as **possible
matches**, whatever their names.

This document describes the exact steps, the parameters and their defaults, what the report records, and where the
implementation differs from the proposal. The code is in:

| Module | Responsibility |
| --- | --- |
| `egt_gda_sync/image_compare.py` | Decoding, features, candidates, verification, scoring (`ImageMatcher`) |
| `egt_gda_sync/image_cache.py` | The SQLite cache of file hashes, features, embeddings and pair results |
| `egt_gda_sync/image_gpu.py` | The GPU algorithms: CLIP and DINOv2 embeddings and their nearest-neighbour search |
| `egt_gda_sync/rss_sync.py` | The GDA sync, which runs the image matching after it classifies every file |

The matching adds information to the report. It does not change any resource's status: a resource is still
**identical**, **different** or **missing** by its file name and SHA-256, as before. What it changes is the GDA file
that Sync copies over an image: the GDA image chosen on the image's card, or else the most likely one (see
[Effect on Sync](#effect-on-sync)).

## Parameters

Each workspace in `workspace.json` can set these optional fields. The `report` command can override them for one run,
without changing `workspace.json`.

| Field | Report option | Default | Meaning |
| --- | --- | --- | --- |
| `multithreading` | `--multithreading` / `--no-multithreading` | `true` | Hash files, decode images and verify candidates on up to 8 threads. With `false` the whole sync runs on one thread. |
| `use_gpu` | `--gpu` / `--no-gpu` | `false` | Also run the GPU algorithms, CLIP and DINOv2, on a CUDA GPU. They find candidates that the perceptual hashes miss and add evidence. Without torch, transformers, a CUDA device or the models, the run goes on with the CPU algorithms, and the report says why. |
| `image_match_threshold` | `--match-threshold PERCENT` | `50.0` | The probability, 0.0 to 100.0, from which a GDA image is listed as a possible match. Each same-named GDA file keeps its evaluation whatever the threshold. |

```json
{ "id": "joker_reels_coins_10", "game_name": "Joker Reels Coins 10", "game_path": "/assets/resources/joker_reels_coins_10",
  "gda_path": "/assets/gda/joker_reels_coins_10", "multithreading": true, "use_gpu": true, "image_match_threshold": 60.0 }
```

```bash
python -m egt_gda_sync report joker_reels_coins_10 --gpu --match-threshold 30   # more, less likely matches
python -m egt_gda_sync report --all --no-multithreading                          # one thread
```

The values must be `true`/`false` and a number from 0 to 100. Any other value fails the run with an explanation. The
report keeps the values a run used in its `workspace`, and again in `imageCompare.settings`.

### The GPU algorithms

CLIP and DINOv2 need the optional `gpu` extra and a CUDA GPU:

```bash
pip install -e ".[gpu]"   # torch and transformers
```

On Windows, install a CUDA build of torch from [pytorch.org](https://pytorch.org/get-started/locally/) first: the
default Windows wheel of torch has no CUDA support. The first run with `use_gpu` downloads the models from the
Hugging Face Hub, about 600 MB for `openai/clip-vit-base-patch32` and 90 MB for `facebook/dinov2-small`, into the
Hugging Face cache (`HF_HOME`, by default `~/.cache/huggingface`). Later runs load them from the cache without the
network. The packaged executables do not include torch, so in them `use_gpu` reports the GPU algorithms as
unavailable.

## Which images are matched

- **Game images:** every file the sync compares (declared files, image-sequence frames and shared files) whose
  extension is in both the workspace's `extensions` and `.dds`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`. With the
  default `extensions`, these are `.dds` and `.png` files. An image is matched when its status is identical, different
  or missing. Invalid and supplementary files are not matched, and neither are the files in an RTF's folder.
- **GDA images:** every file with such an extension in `gda_path`, and in `common_gda_path` when it is set. As with
  file names, a game file is matched with `gda_path` only, and a shared file under `<resources folder>/common` with
  both.

## The steps

The GDA sync first classifies every file by name and SHA-256, as before. It hashes the files it needs on the run's
threads, through the cache. Then the image matching runs:

### 1. Exact matches end the search

An image whose status is **identical** is not searched for. Its same-named GDA file is an `exact_file` match (same
SHA-256), or an `exact_pixels` match when only its DDS mip levels differ (`ignore_dds_mips`). Its probability is
100.0 %.

### 2. Hashing

Every other image (the queries), and every GDA image they may match, is hashed with SHA-256. A cached hash is reused
while the file's size, modification time and change time are unchanged, for at most 7 days.

### 3. Decoding and features

Each distinct file content is decoded once, unless the cache already has its features:

- **Decoding:** a DDS file's first surface and mip level is decoded with the app's DDS decoders (DXT1, DXT3, DXT5,
  RGB24, RGB32 and BC7, up to 16 megapixels). Other images are decoded with OpenCV: 16-bit images become 8-bit, and
  gray or RGB images get an opaque alpha. Files over 256 MB or 64 megapixels are not decoded. An image that cannot be
  decoded keeps the reason, and is matched by SHA-256 only.
- **Pixel digest:** the SHA-256 of the image's width, height and RGBA pixels. Two files with the same digest show the
  same pixels in any file format.
- **Gray image:** the luma (0.299 R + 0.587 G + 0.114 B) with alpha premultiplied, so transparent pixels are black
  whatever color they hold.
- **pHash** (64 bits): the gray image is averaged down to 32 × 32. Its 2D DCT is taken, and the 8 × 8 lowest
  frequencies are rounded to 3 decimals. Each bit is 1 where a frequency is above their median. The rounding gives a
  flat image a stable hash.
- **dHash** (64 bits): the gray image is averaged down to 9 × 8. Each bit is 1 where a pixel is brighter than the one
  on its left.
- **Embeddings**, with `use_gpu`: the image is fitted into a 224 × 224 square over gray (128), with its transparent
  pixels gray too, so the whole image is seen whatever its aspect ratio. It is normalized for each model and run on
  the GPU in half precision, in batches of 32. CLIP gives its projected image embedding (512 values) and DINOv2 its
  class token after the final layer norm (384 values). Both are normalized to unit length.

Images are decoded 256 at a time on the run's threads. Each group's embeddings are made on the GPU before the next
group is decoded, so an image is decoded once for both its features and its embeddings.

### 4. Candidates

Each query collects candidates from independent sources. `foundBy` records which sources found each one:

| Source | Candidates |
| --- | --- |
| `name` | The GDA images with the query's file name: the files Sync would copy |
| `sha256` | The GDA images with the query's SHA-256 |
| `pixels` | The GDA images with the query's pixel digest |
| `phash` | The GDA images within 12 bits of the query's pHash, at most the 50 nearest (blank images share one hash) |
| `clip`, `dinov2` | With `use_gpu`: the 20 GDA images with the highest cosine similarity, from 0.88 (CLIP) or 0.90 (DINOv2) |

The pHash search compares the query's hash with every GDA image's hash, which is fast at tens of thousands of
images. The embedding search is exact: a matrix product of the normalized embeddings on the GPU, as FAISS
`IndexFlatIP` would compute it.

### 5. Verification

Each candidate pair is evaluated once per run, by the contents of both files. The algorithms run in this order, and
the first two can end the evaluation (`stoppedBy`):

1. **SHA-256** equal: `exact_file`, 100.0 %. Stop.
2. **Pixels** equal: `exact_pixels`, 100.0 %. Stop. Otherwise the report keeps both images' sizes.
3. **pHash** and **dHash**: the Hamming distance of the two hashes, 0 to 64.
4. **SSIM** (Wang et al.): the mean structural similarity of the two gray images, each averaged to 256 × 256, with
   an 11 × 11 Gaussian window of σ 1.5, C1 = (0.01 · 255)² and C2 = (0.03 · 255)², without the 5-pixel border.
5. **CLIP** and **DINOv2**, when both images have embeddings: the cosine similarity of their embeddings.
6. **SIFT**, unless SSIM is at least 0.98: then the pair is already a near duplicate, and `stoppedBy` is `ssim`.
   - Each gray image is fitted into 512 × 512, and up to 500 SIFT keypoints are detected in it.
   - The matches of the two images' keypoints must pass Lowe's ratio test (0.75).
   - A RANSAC homography (5-pixel threshold) is fitted to the matches. It counts only if it is plausible for an edited
     copy: it scales the area at most 16 times either way, does not mirror the image, and bends it little (perspective
     terms at most 0.002). Otherwise a similarity transform (rotation, uniform scale and shift, at most 4 times either
     way) is fitted instead.
   - The report keeps the keypoints of both images, the good matches, the transformation's inliers, and the
     **coverage**: the smaller share of either image covered by the convex hull of the inliers.
   - SIFT does not apply when either image has fewer than 8 keypoints. Inliers that cover less than 3 % of the image,
     such as the same lettering or a shared logo, count as none.

### 6. Probability

Each algorithm's value becomes **its evidence**: the probability that this value alone means the images match. It is
a logistic curve, 50 % at the midpoint, that changes the odds by a factor of e every scale. The scale is negative for
distances.

| Algorithm | Value | Midpoint | Scale | Examples |
| --- | --- | --- | --- | --- |
| pHash | Hamming distance | 16 | −2 | 4 → 99.8 %, 14 → 73 %, 22 → 4.7 % |
| dHash | Hamming distance | 8 | −2 | 1 → 97.1 %, 12 → 12 % |
| SSIM | mean SSIM | 0.92 | 0.025 | 0.99 → 94.3 %, 0.95 → 77 %, 0.86 → 8 % |
| SIFT | inliers, if they cover 3 % | 17 | 3 | 42 → 99.98 %, 20 → 73 %, 12 → 16 % |
| CLIP | cosine similarity | 0.95 | 0.015 | 0.98 → 88 %, 0.93 → 21 % |
| DINOv2 | cosine similarity | 0.955 | 0.01 | 0.998 → 98.7 %, 0.93 → 7.6 % |

The evidence is pooled into two **hypotheses** that the images match. Each hypothesis is the weighted mean of its
evidence's log-odds, turned back into a probability:

  P = σ( Σ wᵢ · logit(pᵢ) / Σ wᵢ ), with each pᵢ kept within 0.0001 and 0.9999

| Hypothesis | Evidence and weights | Needs |
| --- | --- | --- |
| structural: the same picture, edited or re-encoded | pHash 1, dHash 1, SSIM 2, CLIP 0.5, DINOv2 0.5 | pHash, dHash or SSIM |
| geometric: the same picture rotated, scaled, cropped or bent | SIFT 1 | SIFT applies |

The pair's probability is the stronger hypothesis, ×100 and rounded to one decimal. Only exact matches are 100.0 %;
every other pair is at most 99.9 %. The embeddings only **support** the structural hypothesis. Images in one art
style, such as all the symbols of a game, are alike to CLIP and DINOv2 without being the same picture. A rotated or
cropped copy is also less alike to them than an edited one, so they do not take part in the geometric hypothesis.

Example: an edited button, with pHash 4 (99.8 %, log-odds 6.0), dHash 1 (97.1 %, 3.5) and SSIM 0.99 (94.3 %, 2.8). Its
structural probability is σ((6.0 + 3.5 + 2 · 2.8) / 4) = σ(3.78) = 97.8 %. With CLIP 0.9816 (89.2 %, 2.11) and
DINOv2 0.9983 (98.7 %, 4.33) it is σ((15.1 + 0.5 · 2.11 + 0.5 · 4.33) / 5) = 97.5 %.

### 7. Match type

| Match type | When |
| --- | --- |
| `exact_file` | The same SHA-256 |
| `exact_pixels` | The same decoded pixels, or a DDS file that differs only in its mip levels |
| `near_duplicate` | The structural hypothesis is the stronger, at 80 % or more |
| `visually_similar` | The structural hypothesis is the stronger, from 50 % to 80 %; or below 50 %, the embeddings alone give 80 % and DINOv2 is the stronger |
| `transformed_duplicate` | The geometric hypothesis is the stronger, at 50 % or more |
| `semantically_similar` | Below 50 %, the embeddings alone give 80 % or more and CLIP is the stronger |
| `uncertain` | From 20 % to 50 %, or a pair without evidence (an image that cannot be decoded) |
| `different` | Below 20 % |

## What the report records

GDA sync reports of version 6 add the following fields (see [README.md](../../README.md#report-versions)).

### Each compared image

A row of an image, and each frame of an image sequence, has an `imageMatch`:

| Field | Meaning |
| --- | --- |
| `probability` | The highest probability among the GDA images verified, 0.0 to 100.0. It is 0.0 when no candidate was found, and `null` when no pair could be judged because the image cannot be decoded. |
| `matchType` | That pair's match type |
| `candidates` | How many GDA images were verified |
| `matches` | The possible matches: the verified GDA images from the threshold, most likely first (a same-named one first on a tie) |
| `error` | Why the image cannot be decoded, when it cannot |

Each entry of `matches` is a GDA file (`tree`, `path`, `absolutePath`) with `sameName`, `foundBy`, and the pair's
evaluation. Each entry of the image's `gdaFiles`, its same-named GDA files, has the same evaluation as its `match`,
whatever the threshold:

| Field | Meaning |
| --- | --- |
| `probability` | The pair's probability of matching, 0.0 to 100.0, or `null` when either image cannot be decoded |
| `matchType` | The pair's match type |
| `algorithms` | Each algorithm that ran: its value, and the probability it gives alone |
| `stoppedBy` | `sha256`, `pixels` or `ssim` when that algorithm's result ended the evaluation early |
| `error` | Which image cannot be decoded, and why |

| Algorithm | Fields |
| --- | --- |
| `sha256` | `equal` |
| `pixels` | `equal`, `size` and `gdaSize` (width and height), or `ddsMipsOnly` |
| `phash`, `dhash` | `hamming` (0 to 64), `probability` |
| `ssim` | `value` (−1 to 1), `probability` |
| `sift` | `keypoints` (of both images), `goodMatches`, `inliers`, `coverage` (0 to 1), `transform` (`homography` or `similarity`), `probability`; or `applicable: false` with the keypoints |
| `clip`, `dinov2` | `cosine` (−1 to 1), `probability` |

```json
"imageMatch": {
  "probability": 97.8, "matchType": "near_duplicate", "candidates": 2,
  "matches": [{
    "tree": "game", "path": "ui/play.png", "absolutePath": "/assets/gda/ui/play.png", "sameName": true, "foundBy": ["name", "phash"],
    "probability": 97.8, "matchType": "near_duplicate", "stoppedBy": "ssim",
    "algorithms": {
      "sha256": {"equal": false}, "pixels": {"equal": false, "size": [320, 200], "gdaSize": [320, 200]},
      "phash": {"hamming": 4, "probability": 99.8}, "dhash": {"hamming": 1, "probability": 97.1},
      "ssim": {"value": 0.99, "probability": 94.3}
    }
  }]
}
```

### The run

The report's `imageCompare`, after its `summary`, describes the run:

| Field | Meaning |
| --- | --- |
| `version` | The version of the algorithms and their preprocessing (`VERSION`) |
| `settings` | `multithreading`, `workers` (threads used), `useGpu`, `matchThreshold` |
| `algorithms` | Each algorithm: whether it was `enabled`, its parameters, and its `calibration` (midpoint, scale, weights) |
| `gpu` | `requested`, and `available` with the `device`, or the `reason` it was not used |
| `counts` | `images` matched, `exact` (in sync), `searched`, `gdaImages`, `decoded` this run, `undecodable` contents, `candidates`, `pairs` evaluated, `possibleMatches` |
| `cache` | The cache file's `path`, the `hits` and `misses` of each level, and any `error` |
| `seconds` | Time per step: `hashing`, `decoding`, `embeddings`, `loadingModels`, `candidates`, `ssim`, `sift`, `verification`. Decoding, SSIM and SIFT are summed over the threads, so they can exceed the run's duration. |
| `error` | Present when the image matching failed. The statuses stand, and the rows have no image matches. |

The `report` command prints a line about it for each workspace, for example
`Images: 1000 compared, 600 exact, 400 searched; possible matches: 300; GPU: NVIDIA GeForce RTX 4080 Laptop GPU`.

## Effect on Sync

Statuses do not change: an image is still different or missing by its file name. When several same-named GDA files
share as many folder names with the game file, they are ordered by their probability.

On the Sync page, the card of a different or missing image shows its **candidates** on one line: its possible matches
and its same-named GDA files, whatever their probability, most likely first (a same-named one first on a tie). Each
shows its probability and match type.

- Clicking a candidate chooses it, and clicking it again clears the choice. A candidate with the game file's contents
  (`exact_file`) cannot be chosen, since copying it changes nothing.
- The copy arrow between the game image and its candidates is disabled until a candidate is chosen. It then copies the
  chosen image over the game file. This also syncs a **missing** image, which has no same-named GDA file to copy.
- The details dialog shows only the game image and one candidate, with the algorithms' values for the pair: the chosen
  one, or else the most likely one that differs from the game file. **Sync this resource** copies it. Left and Right
  choose the previous and next candidate, as on the card, and the dialog stays open and compares the game image with it.
- **Sync all pending** and **Sync selected** copy the chosen candidate of each different image, or else its most likely
  candidate that differs from the game file. They do not sync missing images, which need a choice.

The copy request sends each image's chosen candidate (`gdaFiles` of `POST /api/rss-sync/copy`, `gdaFile` of each
resource of `POST /api/rss-sync/apply`). The backend refuses a candidate that the image does not have in the current
report, or one with the game file's contents. Without a choice, it copies the most likely candidate that differs from
the game file, by the same rule as the page (`image_candidates` in `egt_gda_sync/library.py`). Sequences, RTFs, other
files and reports from before version 6 are copied from their closest same-named GDA file, as before.

## Caching

The cache is one SQLite file, `<app-data>/compare-cache.sqlite3`, shared by every workspace:

| Level | Key | Contents |
| --- | --- | --- |
| files | absolute path | SHA-256, size, modification and change times, time hashed |
| features | SHA-256, `VERSION` | width, height, pixel digest, pHash, dHash, or why the content cannot be decoded |
| embeddings | SHA-256, model name and `VERSION` | the embedding, in half precision |
| pairs | both SHA-256s, algorithm, `VERSION` | the SSIM value, or the SIFT result |

Features are keyed by content, so a renamed, moved or copied file reuses them. A rescan decodes only images whose
contents are new, and evaluates SSIM and SIFT only for new pairs. SIFT descriptors are not stored (about 64 KB an
image); their pair results are. The probabilities are computed again from the stored values each run, so a change of
calibration needs no new cache.

The file uses SQLite's write-ahead log, so the app and the `report` command can use it at once. Only the thread that
coordinates the run reads and writes it. A cache that cannot be opened or written is replaced by one in memory, and
`imageCompare.cache.error` says why. Deleting the file only makes the next run slower. It is never pruned, so delete it
when it grows too large.

## Threads and the GPU

With `multithreading`, a pool of `min(8, CPU cores)` threads hashes files, decodes images and computes their
features, and verifies the candidates of each image. OpenCV's own threads are turned off (`cv2.setNumThreads(1)`) to
avoid running more threads than cores. The GPU runs in the coordinating thread, in batches of 32 images. Without
`multithreading`, everything runs on the coordinating thread. The results are the same either way.

During verification, the SSIM thumbnails and SIFT features of the 1,024 most recently used images stay in memory,
about 150 MB.

## Calibration and measured results

The proposal's thresholds are starting points, and it recommends learning them from known matching and non-matching
pairs. The midpoints and scales above were fitted on synthetic sets of drawn images: shapes and numbers in one style,
like a game's UI art, at 512 × 512. They are adversarial for the embeddings (every image looks alike to CLIP) and for
SIFT (the same font in every image). Measured on a 32-core CPU with an RTX 4080 Laptop GPU:

| Set | Result |
| --- | --- |
| 1,000 game images; GDA: 600 identical, 200 edited (text added), 100 renamed copies, 100 without a counterpart, 300 unrelated | Every renamed copy found (`exact_file`); edited copies 91.4 % to 99.9 % (mean 97.7 %); no unrelated image above 50 %; 4.9 s on one thread, 1.4 s on 8, 0.4 s on a warm cache |
| The same, with `use_gpu` | 18 to 23 s with an empty cache, 5 s warm (2.5 s of it loading the models): about 13,000 candidate pairs, since every image is alike to the embeddings. Edited copies from 90.3 %; no unrelated GDA image above 50 %; 3 pairs of the game's own drawings at 58.3 % |
| 200 images; GDA: copies rotated up to 30°, scaled 0.7 to 1.3 times and cropped up to 15 %, 100 of the same name and 100 renamed | Same name: 70 found, 67 of them as `transformed_duplicate`; renamed: 8 found without the GPU and 56 with it; no wrong match without the GPU, one with it |

To tune the matching for your own images, change the constants at the top of `egt_gda_sync/image_compare.py`.
Increase `VERSION` when you change decoding, preprocessing or how an algorithm computes its value, so cached features
and pair results are computed again.

### Known limitations

- pHash, dHash, SSIM and SIFT compare luma. A recolored copy of a picture, or a picture with the same layout in other
  colors, is a near duplicate to them. The pixel digest and the embeddings see color.
- A transformed copy with another name is only found with `use_gpu`, or when its pHash stays within 12 bits: SIFT
  verifies candidates, it does not find them.
- SIFT needs structure. Flat images with few keypoints, or transformed copies with few inliers, stay below the
  threshold (30 of the 100 same-named transformed copies above).
- The embedding search keeps the 20 nearest of each model. If more than 20 GDA images are alike, a match can be missed.
- The first run of a large GDA folder decodes every GDA image, once any game image needs a search. A 2048 × 2048 DDS
  file takes 0.2 to 0.6 s to decode. Later runs use the cache.

## Differences from the proposal

| Proposal | Implementation |
| --- | --- |
| Every pair above a threshold, or each image's best match (the open question) | Every GDA image from `image_match_threshold` is a possible match. The best one is the image's `probability`. |
| FAISS `IndexFlatIP` for the embeddings | The same exact search, as a matrix product with torch on the GPU, without FAISS |
| SIFT descriptors in the feature cache | SIFT descriptors are kept in memory during a run; their pair results are cached |
| A fixed sequence of algorithms | Independent candidate sources, then verification with early stops at SHA-256, pixels and SSIM ≥ 0.98, as the proposal recommends |
| pHash Hamming ≤ 5 as a near-duplicate candidate | Candidates within 12 bits, for recall; the calibrated evidence decides |
| Match types instead of one 0–100 % scale | Both: each pair has a probability and a match type |
| CLIP and DINOv2 as semantic matches | They find candidates and support the structural evidence. They never make a match alone: images in one art style are alike to them. |
| SIFT inliers as geometric evidence | Only inliers of a plausible homography or similarity transform that cover 3 % of the image count. Repeated letters otherwise fit chance homographies. |
| Learn thresholds from your own images | The calibration was fitted on synthetic sets and can be tuned as above; there is no automatic training |
| ORB | Not used, as proposed |
