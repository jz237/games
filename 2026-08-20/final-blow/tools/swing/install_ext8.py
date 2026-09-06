"""v5.2 "Locomotion" — give deathblow, post, donald and the devil the ext sheet
(`<id>-ext.webp`, bank `unified-ext`, grammar cells 16-23) the other six
fighters have carried since 4.0 / 4.1.

The art is a TWO-TAKE generation (`grammar-ext8.txt`, bank `ext8` in
build_sheet.py): a 4x4 sheet whose rows 0-1 are take A of the eight ext poses
and rows 2-3 are take B of the same eight, image-to-image from the fighter's
own unified sheet, colour-matched onto it, despilled and sliced at the
fighter's unified scale. This installer picks ONE take per cell, sets the
sheet's scale off the breathing idle, composes the 8-cell 1280x640 sheet the
runtime expects, measures it the way build_sheet does, and prints the engine
rows (the engine tables are patched by hand from the printout, and pinned in
tests/unified-ext.test.mjs). `--apply` writes the sheet into assets/unified
(remove-then-write: the sheets may be hardlinked) and patches the manifest.

THE PICK RULE, per cell, on the slicer sidecar's alpha>=24 heights:
  16 idle-breathe, 17/18 walk-down    the take nearest the fighter's unified
                                     idle height (UNIFIED_CELL_HEIGHT[id][0]);
  21/22 wind-ups                      nearest the idle;
  23 mid-reaction                     nearest the unified light-hit (cell 12);
  19 ascent / 20 descent              any UPRIGHT take, read at 1:1 for an
                                     inversion (JUMP_PICKS below records the
                                     read); tie -> take A.

THE SHEET SCALE. The 4.0 contract (tests/unified-ext.test.mjs X-H) is that
the ext sheet is the same generation at the same global scale, so the breathe
IS the idle and the two sheets draw at ONE size. That premise is false for a
second generation: post's ext8 drew him 8.6% taller than his own idle and the
devil's 4.6% shorter, and the idle alternates 0 <-> 16 every eight ticks, so
either would pulse the stance. The sheet is therefore resampled ONCE, here,
by idle / breathe (premultiplied Lanczos, feet re-registered on row 314 and
the torso band on column 160 exactly as the slicer does), which is the ext2
precedent of one scale per sheet -- and every table, adjust, renderer and
test downstream stays on the 4.0 contract. `extScale` in the manifest is the
sheet's resulting scale (sidecar scale x factor).

Usage: install_ext8.py [--archive DIR] [--only id ...] [--out DIR] [--apply]
"""
import argparse, json, os, re, sys
import numpy as np
from PIL import Image

A = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, A)
from repo_root import G  # the checkout this file lives in (FINAL_BLOW_ROOT overrides)

CELL = 320
FLOOR_ROW = 315          # exclusive bottom edge; the last drawn row is 314
TORSO_COL = CELL * 0.5
IDS = ["idle-breathe", "walk-down-a", "walk-down-b", "jump-ascent",
       "jump-descend", "punch-windup", "kick-windup", "mid-reaction"]
FIGHTERS = ["deathblow", "post", "donald", "devil"]
# The art archive sits beside the canonical checkout's workspace; a worktree
# elsewhere passes --archive (or FINAL_BLOW_ART_ARCHIVE). Never written to.
DEFAULT_ARCHIVE = os.environ.get("FINAL_BLOW_ART_ARCHIVE") or os.path.normpath(
    os.path.join(G, "..", "..", "final-blow-art-archive", "swing-v50"))
# 19 ascent / 20 descent, read at 1:1 on the lossless masters (see MOTION-ATLAS
# v5.2 "ext8"): every take on all four sheets is upright -- head level, torso
# vertical, feet below the hips -- so the pick is the taller, more open
# drawing of the two: the descent whose legs reach down rather than fold.
JUMP_PICKS = {
    "deathblow": ("a", "a"),
    "post": ("a", "b"),
    "donald": ("a", "b"),
    "devil": ("a", "b"),
}
# Walk-down keys are corrected onto the idle when they leave it by more than
# this (the cyraxx precedent: +3.0% corrected, +0.3% not; the contract test
# asserts 3.5% drawn).
WALK_DEADBAND = 0.03


def engine_row(table, fighter):
    src = open(os.path.join(G, "engine", "fighter-kits.mjs")).read()
    start = src.index(f"const {table} = Object.freeze({{")
    block = src[start:src.index("\n});", start)]
    m = re.search(rf"^  {fighter}: Object\.freeze\((\[.*?\])\),", block, re.M)
    return json.loads(m.group(1))


def measure(tile_alpha):
    """build_sheet's cell metrics: alpha>=24 rows for height and the bbox
    midpoint (CELL_BODY_CENTRE is the bbox midpoint, not a mass centroid --
    MOTION-ATLAS v4.0), torso band 20%..57.5% of the figure at alpha>128."""
    rows = np.where((tile_alpha >= 24).any(axis=1))[0]
    if not len(rows):
        return 0, 160, 160.0, 0
    height = int(rows.max() - rows.min() + 1)
    centre = int(round((rows.min() + rows.max()) / 2))
    ys, xs = np.where(tile_alpha > 128)
    band = (ys >= rows.min() + int(height * 0.2)) & (ys <= rows.min() + int(height * 0.575))
    cols = np.where((tile_alpha >= 24).any(axis=0))[0]
    return height, centre, round(float(xs[band].mean()), 1), int(cols.max() - cols.min() + 1)


def resample(cell, factor):
    """Premultiplied Lanczos resample of a 320x320 float RGBA cell (a straight
    RGBA resize would drag the black under alpha 0 into every edge)."""
    if abs(factor - 1.0) < 1e-6:
        return cell
    a = cell[..., 3:4] / 255.0
    pre = np.dstack([cell[..., :3] * a, a[..., 0]])
    size = (max(1, int(round(CELL * factor))),) * 2
    planes = [np.asarray(Image.fromarray(pre[..., i].astype(np.float32), "F").resize(size, Image.LANCZOS)) for i in range(4)]
    alpha = np.clip(planes[3], 0.0, 1.0)
    rgb = np.dstack(planes[:3]) / np.maximum(alpha, 1e-4)[..., None]
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255.0])
    out[alpha <= 0.002] = 0
    return out


def register(cell, scale):
    """Scale a cell about its figure and place it feet-on-314, torso column on
    160; a figure that would leave the cell is fit-scaled and the engine draws
    it back up through drawAdjust (build_sheet's rule)."""
    a = cell[..., 3] / 255.0
    ys, xs = np.where(a > 0.5)
    y0 = int(ys.min()); rh = int(ys.max()) - y0 + 1
    lo, hi = y0 + int(rh * 0.20), y0 + int(rh * 0.575)
    band = (ys >= lo) & (ys <= hi)
    tc = float(xs[band].mean()) if band.any() else CELL * 0.5
    half = max(tc - float(xs.min()), float(xs.max()) + 1 - tc)
    cell_scale = min(scale, (CELL * 0.5 - 2) / max(1.0, half), (FLOOR_ROW - 2) / max(1.0, rh))
    draw_adjust = round(scale / cell_scale, 4)
    scaled = resample(cell, cell_scale)
    sa = scaled[..., 3] / 255.0
    sys_, sxs = np.where(sa > 0.5)
    s_y0 = int(sys_.min()); s_h = int(sys_.max()) - s_y0 + 1
    s_band = (sys_ >= s_y0 + int(s_h * 0.20)) & (sys_ <= s_y0 + int(s_h * 0.575))
    s_tc = float(sxs[s_band].mean()) if s_band.any() else scaled.shape[1] * 0.5
    ox = int(round(TORSO_COL - s_tc))
    oy = (FLOOR_ROW - 1) - int(sys_.max())
    tile = np.zeros((CELL, CELL, 4), dtype=np.float32)
    h, w = scaled.shape[:2]
    # Paste with clipping (fit-scaling above should make clipping impossible).
    x0, y0_ = max(0, ox), max(0, oy)
    x1, y1 = min(CELL, ox + w), min(CELL, oy + h)
    tile[y0_:y1, x0:x1] = scaled[y0_ - oy:y1 - oy, x0 - ox:x1 - ox]
    return tile, draw_adjust


def pick(cells, frame, target, forced=None):
    """Take A (cell `frame`) or take B (cell `frame + 8`), by nearest height."""
    if forced:
        return frame if forced == "a" else frame + 8
    da, db = abs(cells[frame]["height"] - target), abs(cells[frame + 8]["height"] - target)
    return frame + 8 if db < da else frame


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive", default=DEFAULT_ARCHIVE)
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--out", default=os.path.join(A, "out-ext8"))
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    report = {}
    for fid in (args.only or FIGHTERS):
        side = json.load(open(os.path.join(args.archive, f"ext8-{fid}.json")))
        cells = {c["frame"]: c for c in side["cells"]}
        master = np.asarray(Image.open(os.path.join(args.archive, "lossless-51", f"{fid}-ext8.webp")).convert("RGBA")).astype(np.float32)
        main_h = engine_row("UNIFIED_CELL_HEIGHT", fid)
        idle, light_hit = main_h[0], main_h[12]
        jump = JUMP_PICKS[fid]
        chosen = [
            pick(cells, 0, idle), pick(cells, 1, idle), pick(cells, 2, idle),
            pick(cells, 3, None, jump[0]), pick(cells, 4, None, jump[1]),
            pick(cells, 5, idle), pick(cells, 6, idle), pick(cells, 7, light_hit),
        ]
        factor = idle / cells[chosen[0]]["height"]
        sheet = np.zeros((CELL * 2, CELL * 4, 4), dtype=np.float32)
        out_cells = []
        for frame, src in enumerate(chosen):
            cx, cy = (src % 4) * CELL, (src // 4) * CELL
            tile, draw_adjust = register(master[cy:cy + CELL, cx:cx + CELL], factor)
            sheet[(frame // 4) * CELL:(frame // 4 + 1) * CELL, (frame % 4) * CELL:(frame % 4 + 1) * CELL] = tile
            height, centre, torso_col, width = measure(tile[..., 3])
            out_cells.append({"frame": 16 + frame, "id": IDS[frame], "take": "b" if src >= 8 else "a", "source": src,
                              "sourceHeight": cells[src]["height"], "height": height, "bodyCentre": centre,
                              "torsoCol": torso_col, "w": width, "drawAdjust": draw_adjust})
        # Engine rows.
        heights = [c["height"] for c in out_cells]
        centres = [c["bodyCentre"] for c in out_cells]
        adjust = {}
        for frame, c in enumerate(out_cells):
            if frame in (1, 2) and abs(c["height"] / idle - 1) > WALK_DEADBAND:
                adjust[frame] = round(idle / c["height"], 3)
            elif c["drawAdjust"] > 1.0:
                adjust[frame] = c["drawAdjust"]
        ext_scale = round(side["scale"] * factor, 4)
        rgba = np.clip(sheet, 0, 255).astype(np.uint8)
        rgba[rgba[..., 3] == 0] = 0
        img = Image.fromarray(rgba, "RGBA")
        dest = os.path.join(args.out, f"{fid}-ext.webp")
        img.save(dest, "WEBP", lossless=True, quality=100, method=6, exact=True)
        pv = Image.new("RGBA", img.size, (40, 40, 40, 255)); pv.alpha_composite(img)
        pv.convert("RGB").save(os.path.join(args.out, f"preview-{fid}-ext.png"))
        entry = {"fighter": fid, "idle": idle, "lightHit": light_hit, "factor": round(factor, 4), "extScale": ext_scale,
                 "sidecarScale": side["scale"], "cells": out_cells, "heights": heights, "centres": centres, "adjust": adjust,
                 "bytes": os.path.getsize(dest)}
        report[fid] = entry
        json.dump(entry, open(os.path.join(args.out, f"ext-{fid}.json"), "w"), indent=1)
        print(f"{fid}: idle {idle} light-hit {light_hit} factor {factor:.4f} extScale {ext_scale} bytes {entry['bytes']}")
        print("  picks", "".join(c["take"] for c in out_cells), [c["source"] for c in out_cells])
        print(f"  UNIFIED_EXT_CELL_HEIGHT {fid}: {json.dumps(heights)}")
        print(f"  CELL_BODY_CENTRE unified-ext {fid}: {json.dumps(centres)}")
        print(f"  UNIFIED_EXT_CELL_ADJUST {fid}: {{ " + ", ".join(f"{k}: {v}" for k, v in adjust.items()) + " }")
        print("  walk-down raw", [f"{(c['height'] / idle - 1) * 100:+.1f}%" for c in out_cells[1:3]],
              "breathe", f"{(heights[0] / idle - 1) * 100:+.1f}%", "fit", {c['frame']: c['drawAdjust'] for c in out_cells if c['drawAdjust'] > 1})
        if args.apply:
            target = os.path.join(G, "assets", "unified", f"{fid}-ext.webp")
            if os.path.exists(target) and os.stat(target).st_nlink > 1:
                os.remove(target)
            with open(dest, "rb") as src_fh, open(target, "wb") as dst_fh:
                dst_fh.write(src_fh.read())
    if args.apply:
        patch_manifest(report)
    json.dump(report, open(os.path.join(args.out, "report.json"), "w"), indent=1)


NOTES = {
    "idle-breathe": "Idle one breath later -- the second idle key the breathing idle alternates with cell 0 every 8 ticks.",
    "walk-down-a": "Walk DOWN A -- the weight-sinking beat between contact A (1) and passing A (2).",
    "walk-down-b": "Walk DOWN B -- the leg exchange of 17; the six-key cycle 1 -> 17 -> 2 -> 3 -> 18 -> 4.",
    "jump-ascent": "Jump ascent -- airborne and still rising, between jump-rise (8) and the apex tuck (9). Upright at 1:1.",
    "jump-descend": "jump-descend, AND IT IS A REAL DESCENT: torso upright, head level, legs reaching down, arms out for balance -- read at 1:1 against this fighter's own cells 12/13, it is not their sibling. accept:true and ROUTED (v5.2): the jump arc owns his whole airborne chain 8 -> 19 -> 9 -> 20, as it does for ali.",
    "punch-windup": "Punch wind-up -- rear fist chambered at the ribs, the kit-less heavy punch's COCK band.",
    "kick-windup": "Kick chamber -- knee snapped up, foot cocked, the kit-less heavy kick's COCK band.",
    "mid-reaction": "Mid reaction -- the flinch between light-hit (12) and big-hit (13), band 1 of the heavy ladder and band 2 of the light.",
}


def patch_manifest(report):
    mp = os.path.join(G, "assets", "unified", "MANIFEST.json")
    st = os.stat(mp)
    m = json.load(open(mp))
    for fid, entry in report.items():
        e = m["fighters"][fid]
        e["extSheet"] = f"{fid}-ext.webp"
        e["extScale"] = entry["extScale"]
        e["extCells"] = [{
            "frame": c["frame"], "id": c["id"], "accept": True,
            "note": f"v5.2 ext8 take {c['take'].upper()} (slicer cell {c['source']}, {c['sourceHeight']}px raw -> {c['height']}px composed). " + NOTES[c["id"]]
                    + (f" Fit-scaled about the torso column; drawAdjust {c['drawAdjust']}." if c["drawAdjust"] > 1 else ""),
        } for c in entry["cells"]]
        e["ext8"] = (
            f"v5.2: the ext sheet is a SECOND generation -- two takes of the eight ext poses on one 4x4 sheet "
            f"(final-blow-art-archive/swing-v50/lossless-51/{fid}-ext8.webp, sidecar ext8-{fid}.json, grammar-ext8.txt), "
            f"image-to-image from this fighter's unified sheet, colour-matched, despilled, sliced at the unified scale {entry['sidecarScale']}. "
            f"tools/swing/install_ext8.py picked one take per cell by height (breathe, walk-downs and wind-ups nearest the idle {entry['idle']}, "
            f"mid-reaction nearest the light-hit {entry['lightHit']}, jump cells the upright take read at 1:1) and set the sheet's scale off the breathe: "
            f"factor {entry['factor']} so the breathing idle lands ON the idle (the 4.0 contract that the two sheets draw at one size), extScale {entry['extScale']}. "
            f"Composed cells measured (alpha>=24): heights {entry['heights']}, body centres {entry['centres']}, ext adjust {entry['adjust']}."
        )
    fmt = m["format"]
    fmt["extStatus"] = (
        "WIRED AND SHIPPING (v5.2). ALL TEN fighters carry an ext sheet: jez, alan, benny, commissioner and cyraxx from the 4.0 24-cell generations, "
        "ali from his 4.1/5.0 redraw, and deathblow, post, donald and the devil from the v5.2 two-take ext8 generation (see each fighter's `ext8` note). "
        "Seven of the eight ext cells are routed on the beat they were drawn for on every one of them: 16 into the breathing idle, 17 and 18 into the six-key walk, "
        "19 into the jump ascent, 21 and 22 into the attack chambers, 23 into both reaction ladders. THE EIGHTH, 20 (jump-descend), IS ROUTED PER FIGHTER off its own accept flag, "
        "because on this cell the routing is a property of the ART and not of the chain: it drew as a hit reaction on the five 4.0 sheets (accept:false, retired, see each fighter's extCells[4] note) "
        "and as a real feet-first descent on ali's 4.1 sheet and on all four v5.2 sheets (accept:true, ROUTED). A fighter whose flag is false has the cell forced undrawable in his mask. "
        "The gate does NOT count cell 20 -- 'whole' means every cell that CAN draw is accepted -- so a bad descent costs no fighter his sheet. "
        "The ext sheet is otherwise gated ALL SEVEN OR NONE and additionally requires the main sheet to be whole, because the beats interleave the two sheets cell by cell."
    )
    fmt["ext8"] = (
        "v5.2: the four 4.0 holdouts' ext sheets are a second generation (tools/swing/build_sheet.py --bank ext8: two takes of the eight ext poses per 4x4 sheet, image-to-image from the "
        "fighter's unified sheet) composed by tools/swing/install_ext8.py. A second generation does not carry the unified scale exactly, so each sheet is resampled once so that its "
        "breathing idle lands on the fighter's unified idle (`extScale` records the result); every downstream table and both renderers then read it as the 4.0 sheets are read."
    )
    if st.st_nlink > 1:
        os.remove(mp)
    with open(mp, "w") as fh:
        fh.write(json.dumps(m, indent=1))
    print("manifest patched")


if __name__ == "__main__":
    main()
