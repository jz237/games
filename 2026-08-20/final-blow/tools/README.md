# Asset pipeline

Small scripts that turn a generated character sheet into the exact formats the
runtime expects. The top-level `build_*.py` scripts are Pillow-only; the
`tools/swing/` sheet pipeline (4.9 in-betweens, 5.0 strikes and reactions, the
Ali redraw) also needs numpy — see "Generating an ext2/ext3/ext4 sheet" below.
`tools/requirements.txt` lists both.

## Generating a fighter's art

1. Generate a **4x4 sprite sheet** with GPT Image 2 on a flat pure magenta
   (`#FF00FF`) background: 16 cells, one full-body figure each, all at the same
   scale, all facing right, all standing on the same ground line.
2. Composite it into the runtime atlas:

   ```sh
   python3 tools/build_atlas.py sheet.png out.png
   ```

   The builder keys the magenta with a soft edge and a despill pass, finds the
   four row bands (splitting at the emptiest scanline when figures touch), finds
   the four figures in each band, derives **one global scale** from the tallest
   standing frame so the character never pulses between frames, drops stray
   generator fragments, and writes a 1280x1280 RGBA atlas of 320px cells with the
   feet on each cell floor.

3. Cut the select portrait from a single-figure generation:

   ```sh
   python3 tools/build_portrait.py figure.png portrait.png
   ```

4. Save as WebP at quality 92 into `assets/atlases/`, `assets/moves/` and
   `assets/fighters/`.

## Frame roles

`assets/atlases/<id>.webp` — combat atlas:

| Frames | Role |
| --- | --- |
| 0-3 | idle stance |
| 4-7 | walk cycle (5-7 double as the dash) |
| 8-11 | attack: wind-up, extending, extended, recovering |
| 12 | crouch / block / throw-tech / late wake-up |
| 13 | jump and heavy overhead |
| 14 | special release |
| 15 | knockdown, hit reaction, early wake-up |

`assets/moves/<id>-specials.webp` — specials atlas, four rows of four, addressed
by `anim(row)` in the kit. **Frame 15 is the victory pose**, not a recovery frame.

## Generating an ext2/ext3/ext4 sheet (`tools/swing/`)

The fourth-generation banks — `<id>-ext2.webp` (attack in-betweens, 4.9),
`<id>-ext3.webp` (strikes) and `<id>-ext4.webp` (reactions, both 5.0) — are
generated **image-to-image from the fighter's own unified sheet** and
colour-matched back onto it (the one-generation law: a strike and the stance
around it come from the same drawing). One directory owns the whole pipeline;
the 4.9 copy that lived in `tools/inbetweens` is folded in (its grammar is
`grammar-ext2.txt`, `build_ext2.py` is `build_sheet.py --bank ext2`).

The box's system `python3` has Pillow but **no numpy**, and every script here
imports it. Use a venv:

```sh
python3 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt
PY=.venv/bin/python3     # the art-archive venv on the box already has both
```

Every script writes into **the checkout it lives in** (`repo_root.py`, two
levels up from `tools/swing/`); set `FINAL_BLOW_ROOT=/path/to/checkout` to aim
a run at another clone. A root without a `game.js` is refused.

1. **Generate.** `fal_edit.py` reads `FAL_KEY` from `~/.claude.json`
   (`mcpServers.fal.env.FAL_KEY`) inside the process and sends it as a header;
   it is never printed and never lands in this tree. The reference is the
   fighter's unified sheet composited onto flat magenta; the prompt is the
   bank's 16-cell grammar plus a one-line costume reminder from `LOOK`.

   ```sh
   $PY tools/swing/gen_all.py g1                          # ext2 grammar, whole roster
   $PY tools/swing/gen_all.py g1 jez,ali grammar-ext3.txt # one bank, two fighters
   $PY tools/swing/gen_all.py g2 all grammar-ext4.txt
   ```

   Raws land as `tools/swing/raw-<id>-g<N>.png`. Generate several candidates
   (`g1`, `g2`, ...) — the 5.0 log records which were rejected and why.

2. **Gate the colour.** `measure_de.py <ref> <cand ...>` prints the per-cluster
   CIELAB means and the dE against the reference; a candidate over ~3 dE
   after matching is a different costume, not a match.

3. **Build the sheet.** Keys the magenta with exact alpha, keeps the main
   components per cell, scales the tallest STANDING figure to 306 px with feet
   on row 315, colour-matches onto the reference (`color_match.py`, per-cluster
   LAB offsets, `--ref` for another sheet), purges the impact-streak purple on
   the ext4 splat/bounce cells, and writes a lossless WebP + a JSON sidecar
   with per-cell boxes and heights + a preview:

   ```sh
   $PY tools/swing/build_sheet.py jez raw-jez-g1.png --bank ext2
   $PY tools/swing/build_sheet.py jez raw-jez-g1.png --bank ext3
   $PY tools/swing/build_sheet.py jez raw-jez-g2.png --bank ext4 --ref assets/unified/jez.webp
   ```

   `assets/unified/*.webp` and `MANIFEST.json` may be hardlinked: the builder
   removes then writes, never writes in place.

4. **Accept per cell** in `assets/unified/MANIFEST.json` (`ext3Cells` /
   `ext4Cells`, `accept: true|false` per frame) and re-derive the measured
   tables in `engine/fighter-kits.mjs` (`UNIFIED_EXT3_CELL_HEIGHT` and
   friends) from the sidecar. `skin_match.py` is the skin-only transfer used
   for the Ali redraw; `build_unified24.py` slices a 6x4 unified+ext
   generation; `install_ali.py` is that one-off install, kept as the worked
   example of re-deriving every table.

5. **Ship-encode.** The builders write lossless WebP; the shipped file is
   lossy with exact alpha, gated by the costume measure (v5.1 #36):

   ```sh
   $PY tools/swing/encode_sheets.py --masters <lossless archive dir> [--only jez-ext4.webp] [--dry-run]
   ```

   Quality 90 then 92, method 6, `alpha_quality` 100, `exact=True`; an encode
   is kept only if the alpha plane is byte-identical to the master and
   `measure_de.py`'s weighted dE against the master is under 0.7 — otherwise
   the sheet keeps its lossless bytes. A shipped VP8L file with no archive
   master is its own master; an already-lossy sheet is skipped. Settings and
   per-sheet numbers land in `MANIFEST.json` `format.encoding`; writes are
   remove-then-write. Re-run after any rebuild of a unified-family sheet.

6. `node --test tests/*.test.mjs` — the manifest shape, the per-cell gate and
   the measured tables are pinned.
## Audio manifest

```sh
node tools/audio/build_manifest.mjs           # write assets/audio/MANIFEST.json
node tools/audio/build_manifest.mjs --check   # exit 1 if it no longer matches the files
```

Needs `ffprobe` on PATH (node only otherwise). Measures every mp3 under
`assets/audio/` — announcer takes, fighter voice takes, shared samples, music —
and records `{ ms, bytes }` per file plus contiguous take counts per cue. The
runtime reads it instead of HEAD-probing variant slots and instead of guessing
announcer speech length, so **re-run it whenever a take is added, removed or
renamed**; `tests/audio-manifest.test.mjs` fails on a stale manifest (byte sizes
are compared against disk). It never reads or rewrites audio samples — the
reviewed takes are measured, not touched. Writes remove-then-write because the
asset tree may be hardlinked.
