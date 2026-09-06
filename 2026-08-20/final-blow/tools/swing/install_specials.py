"""v5.3 — install the unified-generation SPECIALS sheets into assets/moves/.

The kit bank (assets/moves/<id>-specials.webp) is the last bank that still
draws the base generation: every special, EX, super and throw release addresses
it (engine/fighter-kits.mjs `anim(row)`), so a fighter changed generation twice
per special. The 5.3 sheets are regenerated image-to-image from the fighter's
UNIFIED sheet (identity) over his shipped specials sheet (poses) and sliced by
build_sheet.py --bank specials at the unified scale, so the bank joins the
unified family: 320 px cells, feet on row 314, torso column on 160.

What this script does, in order:

  1. Copies the SHIPPED sheets to assets/moves/legacy/<id>-specials.webp,
     byte-for-byte, once. That copy is the per-cell fallback: a cell whose
     ACTION drifted in the regeneration is marked accept:false and the engine
     draws the shipped cell for that frame instead, so a rejected cell can
     never break a move (game.js `specialsCellDrawable` / SPECIALS_LEGACY_BANK).
  2. Installs the new sheets (remove-then-write: assets may be hardlinked).
  3. Writes assets/moves/MANIFEST.json — the source of truth for the bank:
     per-cell accept flags, drawn heights, body centres, the fit-restore
     drawAdjust, and the measured dE against the unified sheet.
  4. Prints the two engine tables to paste, both DERIVED BY MEASUREMENT:
       MOVE_SHEET_ADJUST   (game.js)            per-fighter sheet scale
       SPECIALS_CELL_ADJUST (fighter-kits.mjs)  per-cell fit restore

The per-fighter scale is the one number that cannot be taken from the sidecar.
A specials sheet has ONE standing cell (the victory pose), so it has no
standing reference to normalise against the way the unified sheets do. It is
measured instead against the sheet it replaces: the regeneration draws the SAME
16 actions, so the ratio of shipped drawn height to new drawn height is that
sheet's scale relative to the shipped one, and the MEDIAN over the 16 matched
actions is robust to the few poses that genuinely changed height. Multiply by
the shipped MOVE_SHEET_ADJUST and every special keeps the world size it ships
at today, on the new drawing.

Usage:
  install_specials.py --src DIR [--dry-run]
    DIR holds <id>-specials.webp (lossless, from build_sheet.py --bank specials)
    and specials-<id>.json sidecars.
Then ship-encode:
  encode_sheets.py --src assets/moves
"""
import argparse, json, os, shutil, statistics, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from repo_root import G  # noqa: E402
from measure_de import load, to_lab, clusters  # noqa: E402

# A pixel further than this from EVERY unified costume cluster is an effect
# (lightning, paint, a blade arc, fire), not costume. The unified sheets carry
# no effects at all, so those pixels have nothing to match against and they are
# what the whole-sheet dE is measuring when it looks bad.
EFFECT_GATE = 25.0

# The nine fighters with their own specials sheet. The Commissioner has none —
# his kit poses address his combat atlas — so he is not regenerated and his
# MOVE_SHEET_ADJUST entry (1.02, fitted to that atlas) must not be touched.
IDS = ["deathblow", "jez", "alan", "post", "donald", "devil", "ali", "benny", "cyraxx"]

# What each fighter's MOVE_SHEET_ADJUST is TODAY, i.e. the correction the
# shipped sheet needs. The new value is derived from it (see the docstring).
SHIPPED_ADJUST = {
    "deathblow": 1.14, "jez": 1.03, "alan": 1.06, "post": 1.02, "benny": 1.02,
    "donald": 1.04, "cyraxx": 1.05, "ali": 1.04, "devil": 1.04,
}

# Cells whose ACTION drifted, from the side-by-side review of every one of the
# 144 cells against the shipped sheet. A rejected cell keeps the shipped
# drawing through the legacy bank; the rest of that fighter's sheet is used.
REJECTS = {
    "devil": {
        8: "shipped 8 is the four-legged crouched gather (content height 178); "
           "the regeneration reared him upright onto one leg (313) — a different "
           "action AND a foot off the street on a grounded wind-up",
    },
}

# How each fighter's raw was sliced, for the record (build_sheet.py arguments).
SLICE_NOTE = {
    "post": "--keyLow 25 --keySpan 55 --hueSafe 60 --matchShift 5: his paint IS "
            "magenta, so the 4.9 key band (60..170 dE) read his spray as half "
            "background and the 5.2 despill refilled what survived — the default "
            "slice came out with his whole pink vocabulary washed to dust",
}


def cell_metrics(path):
    """Opaque bbox height, content bottom row and body-centre row per cell."""
    arr = np.asarray(Image.open(path).convert("RGBA"))
    n = arr.shape[0] // 4
    out = []
    for index in range(16):
        cy, cx = (index // 4) * n, (index % 4) * n
        alpha = arr[cy:cy + n, cx:cx + n, 3]
        ys, xs = np.where(alpha >= 24)
        if not len(ys):
            out.append(None)
            continue
        out.append({"height": int(ys.max() - ys.min() + 1), "bottom": int(ys.max()),
                    "bodyCentre": int(round((int(ys.min()) + int(ys.max())) / 2))})
    return out


def sheet_de(unified_path, sheet_path):
    """measure_de.py's weighted per-cluster dE against the fighter's unified
    sheet, plus the same number with effect pixels excluded and the share of
    the sheet those effect pixels are."""
    rgb, mask = load(unified_path)
    cent, weight = clusters(to_lab(rgb), mask)
    order = np.argsort(-weight)
    cent, weight = cent[order], weight[order]
    crgb, cmask = load(sheet_path)
    pts = to_lab(crgb)[cmask]
    d = np.sqrt(((pts[:, None, :] - cent[None]) ** 2).sum(-1))
    ids, near = d.argmin(1), d.min(1)
    keep = near <= EFFECT_GATE

    def weighted(selector):
        out, used = [], []
        for i in range(len(cent)):
            sel = pts[selector & (ids == i)]
            if len(sel) < 200:
                continue
            out.append(float(np.sqrt(((sel.mean(0) - cent[i]) ** 2).sum())))
            used.append(float(weight[i]))
        return round(sum(o * w for o, w in zip(out, used)) / sum(used), 2)

    return {
        "vsUnified": weighted(np.ones(len(pts), dtype=bool)),
        "vsUnifiedCostumeOnly": weighted(keep),
        "effectPixelShare": round(float(1 - keep.mean()), 3),
    }


def cell_entry(index, side, new, adjust, rejects):
    metrics = new[index]
    entry = {
        "frame": index,
        "id": side["cells"][index].get("id", f"special-r{index // 4}-f{index % 4}"),
        "accept": index not in rejects,
        "height": metrics["height"] if metrics else 0,
        "bodyCentre": metrics["bodyCentre"] if metrics else -1,
        "bottom": metrics["bottom"] if metrics else -1,
        "drawAdjust": adjust.get(index, 1.0),
    }
    if index in rejects:
        entry["reject"] = rejects[index]
    return entry


def write_file(path, data):
    if os.path.exists(path):
        os.remove(path)  # never write through a hardlinked snapshot
    with open(path, "wb") as fh:
        fh.write(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    moves = os.path.join(G, "assets", "moves")
    legacy = os.path.join(moves, "legacy")
    if not args.dry_run:
        os.makedirs(legacy, exist_ok=True)

    fighters = {}
    tables = {}
    for fid in IDS:
        shipped = os.path.join(moves, f"{fid}-specials.webp")
        kept = os.path.join(legacy, f"{fid}-specials.webp")
        if not os.path.exists(kept) and not args.dry_run:
            shutil.copyfile(shipped, kept)  # the fallback generation, byte-for-byte
        old = cell_metrics(kept if os.path.exists(kept) else shipped)
        new_path = os.path.join(args.src, f"{fid}-specials.webp")
        new = cell_metrics(new_path)
        side = json.load(open(os.path.join(args.src, f"specials-{fid}.json")))
        adjust = {c["frame"]: round(float(c.get("drawAdjust", 1.0)), 4) for c in side["cells"]}
        rejects = REJECTS.get(fid, {})

        ratios = [old[i]["height"] / (new[i]["height"] * adjust.get(i, 1.0))
                  for i in range(16) if old[i] and new[i] and i not in rejects]
        median = statistics.median(ratios)
        sheet_adjust = round(SHIPPED_ADJUST[fid] * median, 3)
        tables[fid] = {
            "sheetAdjust": sheet_adjust,
            "cellAdjust": {i: adjust[i] for i in sorted(adjust) if adjust[i] > 1.0},
        }

        fighters[fid] = {
            "sheet": f"assets/moves/{fid}-specials.webp",
            "fallbackSheet": f"assets/moves/legacy/{fid}-specials.webp",
            "scale": side["scale"],
            "floorRow": side["floorRow"],
            "sheetAdjust": sheet_adjust,
            "sheetAdjustFrom": (f"shipped {SHIPPED_ADJUST[fid]} x median(shipped drawn height / "
                                f"new drawn height) {round(median, 4)} over "
                                f"{len(ratios)} matched actions"),
            "slice": SLICE_NOTE.get(fid, "build_sheet.py defaults"),
            "de": sheet_de(os.path.join(G, "assets", "unified", f"{fid}.webp"), new_path),
            "deShipped": sheet_de(os.path.join(G, "assets", "unified", f"{fid}.webp"),
                                  kept if os.path.exists(kept) else shipped),
            "cells": [cell_entry(i, side, new, adjust, rejects) for i in range(16)],
        }
        if not args.dry_run:
            with open(new_path, "rb") as fh:
                write_file(shipped, fh.read())
        print(f"{fid:11s} adjust {SHIPPED_ADJUST[fid]} -> {sheet_adjust}  "
              f"median {median:.4f}  rejects {sorted(rejects) or '-'}")

    manifest = {
        "format": {
            "sheet": "1280x1280 RGBA WebP, 4x4 grid, 320px cells, right-facing. The KIT bank: "
                     "engine/fighter-kits.mjs addresses it as four rows of four "
                     "(wind-up / strike / second strike / recover) — row 0 the main special and "
                     "its EX, row 1 the throw release and the back special, row 2 the launcher, "
                     "row 3 the super — with cell 15 the victory pose.",
            "generation": "v5.3. Regenerated image-to-image (openai/gpt-image-2 edit via fal, "
                          "tools/swing/gen_specials.py) with IMAGE 1 the fighter's unified sheet "
                          "(identity) and IMAGE 2 his shipped specials sheet (poses), then sliced by "
                          "tools/swing/build_sheet.py --bank specials at the unified sheet's own "
                          "scale: feet on row 314, torso column on 160, colours pulled onto the "
                          "unified sheet by color_match.py. The bank is now the same generation as "
                          "unified/ext/ext2/ext3/ext4/ext5, so a special no longer crosses "
                          "generations twice.",
            "acceptGate": "accept:false is a cell whose ACTION drifted from the shipped sheet in the "
                          "regeneration. game.js draws assets/moves/legacy/<id>-specials.webp for "
                          "that frame instead (bank 'specials-legacy'), so a rejected cell keeps the "
                          "shipped drawing and can never break a move.",
            "commissioner": "has no specials sheet — his kit poses address his combat atlas — so he "
                            "is absent here and keeps MOVE_SHEET_ADJUST 1.02.",
        },
        "fighters": fighters,
    }
    if not args.dry_run:
        write_file(os.path.join(moves, "MANIFEST.json"),
                   json.dumps(manifest, indent=1).encode("utf-8"))

    print("\nMOVE_SHEET_ADJUST (game.js):")
    print("  " + " ".join(f"{fid}: {tables[fid]['sheetAdjust']}," for fid in IDS))
    print("\nSPECIALS_CELL_ADJUST (engine/fighter-kits.mjs):")
    for fid in IDS:
        cells = tables[fid]["cellAdjust"]
        body = ", ".join(f"{k}: {v}" for k, v in cells.items())
        print(f"  {fid}: Object.freeze({{ {body} }}),")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
