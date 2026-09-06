"""Build assets/unified/<id>-<bank>.webp (ext2 in-betweens, ext3 strikes or ext4
reactions) from a raw 1024px magenta-keyed generation, normalised to the
unified bank's convention: 320px cells, the tallest STANDING figure scaled to
targetH (306) with its feet on floorRow (315), figure centred on its
silhouette, colours pulled onto the fighter's own unified sheet (color_match;
--ref for another reference), lossless WebP with exact alpha.

Usage: build_sheet.py <fighter> <raw png> [--bank ext2|ext3|ext4] [--ref sheet]
                      [--targetH 306] [--floorRow 315] [--scale S] [--out path]
Writes the sheet, a JSON sidecar with per-cell boxes/heights, and a preview.
"""
import argparse, json, os, subprocess, sys
import numpy as np
from PIL import Image
from measure_de import load, to_lab, clusters

A = os.path.dirname(os.path.abspath(__file__))
from repo_root import G  # the checkout this file lives in (FINAL_BLOW_ROOT overrides)
KEY = np.array([255.0, 0.0, 255.0])
CELL_OUT = 320
CELL_IN = 256
BANKS = {
    "ext2": ([
        "punch-windup", "punch-recover", "kick-windup", "kick-recover",
        "heavy-punch-windup", "heavy-punch-recover", "heavy-kick-windup", "heavy-kick-recover",
        "crouch-punch-windup", "crouch-punch-recover", "crouch-kick-windup", "crouch-kick-recover",
        "throw-windup", "throw-recover", "special-windup", "special-recover",
    ], {0, 1, 4, 5, 12, 13, 14, 15}),
    "ext3": ([
        "punch-extension", "kick-extension", "follow-through", "punch-smear",
        "crouch-punch-extension", "sweep", "air-punch", "air-kick",
        "air-chamber", "rising-smear", "landing", "kick-follow-through",
        "crouch-guard", "heavy-punch-extension", "heavy-kick-extension", "sweep-follow-through",
    ], {0, 2, 3, 13}),
    "ext4": ([
        "guard-flinch", "head-snap", "body-blow", "big-hit",
        "stagger", "dizzy", "launched", "air-hit",
        "wall-splat", "crumple", "falling", "floor-bounce",
        "getup-a", "getup-b", "thrown", "ko",
    ], {0, 1, 4}),
    # v5.2 locomotion / air / bookend sheet.
    "ext5": ([
        "dash-launch", "dash-stretch", "dash-brake", "turnaround",
        "apex-tuck", "descent", "air-recover", "air-hit-upright",
        "power-charge", "entrance-a", "entrance-b", "victory",
        "taunt", "crouch-guard-flinch", "throw-grab", "dizzy-sway",
    ], {0, 2, 3, 8, 9, 10, 11, 12, 14}),
    # v5.2 ext (8-cell in-between grammar) for the four fighters that never had
    # one, generated as two takes of the eight poses; the slicer keeps all 16
    # and the installer picks per cell.
    "ext8": ([
        "idle-breathe", "walk-down-a", "walk-down-b", "jump-ascent",
        "jump-descend", "punch-windup", "kick-windup", "mid-reaction",
        "idle-breathe-b", "walk-down-a-b", "walk-down-b-b", "jump-ascent-b",
        "jump-descend-b", "punch-windup-b", "kick-windup-b", "mid-reaction-b",
    ], {0, 1, 2, 5, 6, 7, 8, 9, 10, 13, 14, 15}),
}
IDS = None
STANDING = None
PURGE_PURPLE = {"ext4": (8, 11, 6, 7), "ext5": (7, 13)}


def key_unmultiply(rgb):
    """Alpha from key distance, then solve fg = (obs - (1-a)*key) / a on the
    soft edge so the magenta spill leaves the fringe instead of being clamped."""
    d = np.sqrt(((rgb - KEY) ** 2).sum(-1))
    alpha = np.clip((d - 60.0) / 110.0, 0.0, 1.0)
    a = alpha[..., None]
    fg = np.where(a > 0.02, (rgb - (1 - a) * KEY) / np.maximum(a, 0.02), rgb)
    fg = np.clip(fg, 0, 255)
    # Hard interior keeps the raw colour exactly.
    fg = np.where(a >= 0.98, rgb, fg)
    return fg, alpha


def inpaint_magenta(fg, alpha, iterations=6):
    """v5.2 DESPILL. The model paints a magenta RIM on dark figures against the
    magenta key (a real glow it invents, not a blend), and the key solve keeps
    it: 2-4% of every shipped ext2/ext3/ext4 sheet's opaque pixels were magenta
    while the main sheets had none — a pink outline on every in-between, strike
    and reaction cell on a dark stage. No costume on the roster is magenta, so
    a magenta-hued pixel anywhere on a figure is spill: refill it from the
    nearest non-magenta neighbours (iterative dilation) and keep its alpha."""
    r, g, b = fg[..., 0], fg[..., 1], fg[..., 2]
    spill = (alpha > 0.02) & (r > g + 40) & (b > g + 40) & (np.minimum(r, b) > 80)
    if not spill.any():
        return fg, 0
    out = fg.copy()
    valid = (alpha > 0.02) & ~spill
    filled = spill.copy()
    count = int(spill.sum())
    for _ in range(iterations):
        if not filled.any():
            break
        acc = np.zeros_like(out); n = np.zeros(out.shape[:2], dtype=np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                sv = np.roll(np.roll(valid, dy, axis=0), dx, axis=1)
                so = np.roll(np.roll(out, dy, axis=0), dx, axis=1)
                acc += so * sv[..., None]; n += sv
        can = filled & (n > 0)
        out[can] = acc[can] / n[can][:, None]
        valid = valid | can
        filled = filled & ~can
    # Whatever could not be refilled (an isolated fleck) loses its alpha.
    alpha = np.where(filled, 0.0, alpha)
    return out, count


def keep_main_components(alpha, min_ratio=0.006, reach=28):
    """Zero out stray blobs: keep the largest 8-connected component of the
    alpha>0.5 mask plus any component that is both non-trivial and within
    `reach` px of the main one (a fist drawn just off the arm survives, a
    floating fleck across the cell does not)."""
    h, w = alpha.shape
    solid = alpha > 0.5
    labels = np.zeros((h, w), dtype=np.int32)
    comps = []
    stack = []
    for y in range(h):
        for x in range(w):
            if not solid[y, x] or labels[y, x]:
                continue
            idx = len(comps) + 1
            labels[y, x] = idx
            stack.append((y, x))
            area = 0; x0 = y0 = 10 ** 6; x1 = y1 = -1
            while stack:
                cy, cx = stack.pop()
                area += 1
                x0 = min(x0, cx); x1 = max(x1, cx); y0 = min(y0, cy); y1 = max(y1, cy)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not labels[ny, nx]:
                            labels[ny, nx] = idx
                            stack.append((ny, nx))
            comps.append({"id": idx, "area": area, "box": (x0, y0, x1, y1)})
    if not comps:
        return alpha, 0
    main = max(comps, key=lambda c: c["area"])
    mx0, my0, mx1, my1 = main["box"]
    keep = {main["id"]}
    for c in comps:
        if c is main:
            continue
        x0, y0, x1, y1 = c["box"]
        # A blob touching the cell's bottom edge is the next row's head bleeding
        # over the grid line, never part of this figure.
        if y1 >= h - 2:
            continue
        near = x1 >= mx0 - reach and x0 <= mx1 + reach and y1 >= my0 - reach and y0 <= my1 + reach
        if near and c["area"] >= main["area"] * min_ratio:
            keep.add(c["id"])
    dropped = len(comps) - len(keep)
    # Soft alpha near a kept component stays; everything else goes.
    keepmask = np.isin(labels, list(keep))
    from PIL import ImageFilter
    grown = np.asarray(Image.fromarray((keepmask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    cleaned = np.where(grown, alpha, 0.0)
    return cleaned, dropped


def cell_bbox(alpha):
    ys, xs = np.where(alpha > 0.5)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fighter")
    ap.add_argument("raw")
    ap.add_argument("--targetH", type=int, default=306)
    ap.add_argument("--floorRow", type=int, default=315)
    ap.add_argument("--scale", type=float, default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--bank", default="ext2")
    ap.add_argument("--ref", default=None, help="reference sheet for the colour match (default: the fighter's unified sheet)")
    args = ap.parse_args()
    global IDS, STANDING
    IDS, STANDING = BANKS[args.bank]

    raw = np.asarray(Image.open(args.raw).convert("RGB")).astype(np.float32)
    assert raw.shape[:2] == (1024, 1024), raw.shape
    fg, alpha = key_unmultiply(raw)
    # Impact streaks the model paints around a wall splat / floor bounce come
    # out as dark magenta-purple strokes the key leaves alone; purge purple in
    # those cells (no costume on the roster is purple-magenta).
    for index in PURGE_PURPLE.get(args.bank, ()):
        cx, cy = (index % 4) * CELL_IN, (index // 4) * CELL_IN
        cell = fg[cy:cy + CELL_IN, cx:cx + CELL_IN]
        r, g, b = cell[..., 0], cell[..., 1], cell[..., 2]
        purple = (r > g + 45) & (b > g + 45) & (np.minimum(r, b) > 70)
        alpha[cy:cy + CELL_IN, cx:cx + CELL_IN][purple] = 0
    fg, spilled = inpaint_magenta(fg, alpha)
    print("despilled magenta px", spilled)
    rgba = np.dstack([fg, alpha * 255]).astype(np.uint8)
    rgba[alpha == 0] = 0
    keyed = Image.fromarray(rgba, "RGBA")
    keyed_path = os.path.join(A, f"keyed-{args.fighter}-{args.bank}.png")
    keyed.save(keyed_path)

    # Colour transfer onto the fighter's own unified sheet.
    matched_path = os.path.join(A, f"matched-{args.fighter}-{args.bank}.png")
    subprocess.run([sys.executable, os.path.join(A, "color_match.py"),
                    args.ref or f"{G}/assets/unified/{args.fighter}.webp", keyed_path, matched_path], check=True)
    sheet = Image.open(matched_path).convert("RGBA")
    arr = np.asarray(sheet)

    # Per-cell cleanup + boxes on the raw grid.
    arr = np.array(arr)
    boxes = []
    dropped_total = {}
    for index in range(16):
        cx, cy = (index % 4) * CELL_IN, (index // 4) * CELL_IN
        a = arr[cy:cy + CELL_IN, cx:cx + CELL_IN, 3].astype(np.float32) / 255
        a, dropped = keep_main_components(a)
        if dropped:
            dropped_total[index] = dropped
            arr[cy:cy + CELL_IN, cx:cx + CELL_IN, 3] = (a * 255).astype(np.uint8)
            arr[cy:cy + CELL_IN, cx:cx + CELL_IN][a == 0] = 0
        bb = cell_bbox(a)
        boxes.append(bb)
    sheet = Image.fromarray(arr, "RGBA")
    standing_heights = [boxes[i][3] - boxes[i][1] for i in STANDING if boxes[i]]
    tallest = max(standing_heights)
    scale = args.scale or (args.targetH / tallest)

    out = Image.new("RGBA", (CELL_OUT * 4, CELL_OUT * 4), (0, 0, 0, 0))
    cells = []
    for index in range(16):
        bb = boxes[index]
        cx, cy = (index % 4) * CELL_IN, (index // 4) * CELL_IN
        cell = sheet.crop((cx, cy, cx + CELL_IN, cy + CELL_IN))
        if not bb:
            cells.append({"frame": index, "id": IDS[index], "accept": False, "note": "empty cell"})
            continue
        fig = cell.crop(bb)
        # Registration follows the unified slicer: last drawn row on floorRow-1
        # (315 is the exclusive edge), torso-band centroid (rows 20%..57.5% of
        # the figure) on column 160 — NOT the bounding-box centre, so a fist
        # thrown far back never shifts the body. A wide wind-up whose limbs would
        # then leave the cell is fit-scaled about that torso column and the
        # engine draws it back up through drawAdjust.
        ra = np.asarray(fig)[..., 3].astype(np.float32) / 255
        rys, rxs = np.where(ra > 0.5)
        rh = int(rys.max()) + 1
        lo, hi = int(rh * 0.20), int(rh * 0.575)
        band = (rys >= lo) & (rys <= hi)
        tc_raw = float(rxs[band].mean()) if band.any() else fig.width * 0.5
        half_raw = max(tc_raw - float(rxs.min()), float(rxs.max()) + 1 - tc_raw)
        cell_scale = min(scale, (CELL_OUT * 0.5 - 2) / max(1.0, half_raw), (args.floorRow - 2) / max(1.0, rh))
        draw_adjust = round(scale / cell_scale, 4)
        w = max(1, round(fig.width * cell_scale)); h = max(1, round(fig.height * cell_scale))
        fig = fig.resize((w, h), Image.LANCZOS)
        fa = np.asarray(fig)[..., 3].astype(np.float32) / 255
        ys, xs = np.where(fa > 0.5)
        ox = int(round(CELL_OUT * 0.5 - tc_raw * cell_scale))
        oy = (args.floorRow - 1) - int(ys.max())
        ox = max(-int(xs.min()), min(CELL_OUT - 1 - int(xs.max()), ox))
        tile = Image.new("RGBA", (CELL_OUT, CELL_OUT), (0, 0, 0, 0))
        tile.alpha_composite(fig, (max(0, ox), max(0, oy)))
        out.alpha_composite(tile, ((index % 4) * CELL_OUT, (index // 4) * CELL_OUT))
        ta = np.asarray(tile)[..., 3]
        rows = np.where((ta >= 24).any(axis=1))[0]
        height = int(rows.max() - rows.min() + 1) if len(rows) else 0
        centre = int(round((rows.min() + rows.max()) / 2)) if len(rows) else 160
        torso_col = float(np.where((ta > 128))[1][((np.where(ta > 128)[0] >= rows.min() + int(height * 0.2)) & (np.where(ta > 128)[0] <= rows.min() + int(height * 0.575)))].mean())
        cells.append({"frame": index, "id": IDS[index], "accept": True, "w": w, "h": h,
                      "standing": index in STANDING, "drawAdjust": draw_adjust,
                      "dropped": dropped_total.get(index, 0), "height": height, "bodyCentre": centre,
                      "torsoCol": round(torso_col, 1)})

    dest = args.out or f"{G}/assets/unified/{args.fighter}-{args.bank}.webp"
    if os.path.exists(dest) and os.stat(dest).st_nlink > 1:
        os.remove(dest)  # never write through a hardlinked snapshot
    out.save(dest, "WEBP", lossless=True, quality=100, method=6, exact=True)
    side = {"fighter": args.fighter, "raw": os.path.basename(args.raw), "scale": round(scale, 4),
            "targetH": args.targetH, "floorRow": args.floorRow, "tallestStandingRaw": int(tallest), "cells": cells}
    with open(os.path.join(A, f"{args.bank}-{args.fighter}.json"), "w") as fh:
        json.dump(side, fh, indent=1)
    pv = Image.new("RGBA", out.size, (40, 40, 40, 255)); pv.alpha_composite(out)
    pv.convert("RGB").resize((640, 640)).save(os.path.join(A, f"preview-{args.fighter}-{args.bank}.png"))
    print(args.fighter, "scale", round(scale, 4), "tallest", tallest,
          "fitted", {c["frame"]: c["drawAdjust"] for c in cells if c.get("drawAdjust", 1) > 1.0},
          "dropped", dropped_total, "size", os.path.getsize(dest))


if __name__ == "__main__":
    main()
