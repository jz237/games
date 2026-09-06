"""Slice a 6x4 (24-panel) unified+ext generation into <id>.webp (16 cells,
1280x1280) and <id>-ext.webp (8 cells, 1280x640), following the archived
slice24/fb.py conventions: blob figures read in row-band order, GEN_TO_CELL
permutation, one scale from the tallest upright panels to 306, feet on row 314,
torso band on column 160, colour-matched to a reference sheet (the design's
base atlas), lossless WebP with exact alpha.

Usage: build_unified24.py <fighter> <raw png> --ref <sheet> [--scale S] [--out-dir DIR]
"""
import argparse, json, os, subprocess, sys
import numpy as np
from PIL import Image

A = os.path.dirname(os.path.abspath(__file__))
G = "/home/jez237/.openclaw/agents/gamemaster/workspace/final-blow-roadmap2/2026-08-20/final-blow"
sys.path.insert(0, A)
from build_sheet import key_unmultiply, keep_main_components

CELL = 320
GEN_TO_CELL = [1, 17, 2, 3, 18, 4,
               0, 16, 7, 5, 6, 21,
               10, 22, 11, 8, 19, 9,
               20, 12, 23, 13, 14, 15]
UPRIGHT_GEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12]
MAIN_IDS = ["idle", "walk-contact-a", "walk-passing-a", "walk-contact-b", "walk-passing-b", "crouch", "crouch-trans", "guard",
            "jump-rise", "jump-tuck", "punch-extension", "kick-extension", "light-hit", "big-hit", "stagger", "knockdown"]
EXT_IDS = ["idle-breathe", "walk-down-a", "walk-down-b", "jump-ascent", "jump-descend", "punch-windup", "kick-windup", "mid-reaction"]


def components(mask):
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    comps = []
    stack = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or labels[y, x]:
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
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                            labels[ny, nx] = idx
                            stack.append((ny, nx))
            comps.append({"id": idx, "area": area, "box": [x0, y0, x1 + 1, y1 + 1]})
    return labels, comps


def merge_figures(comps, min_area=300, cols=6, rows=4, width=1024, height=1024):
    """Group blobs into figures by the GRID CELL their centroid falls in (the
    model keeps each figure inside its own panel), so two figures that nearly
    touch never merge. Small blobs (hands, hair) join the nearest figure."""
    cw, ch = width / cols, height / rows
    figures = {}
    small = []
    for c in comps:
        x0, y0, x1, y1 = c["box"]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        key = (min(rows - 1, int(cy // ch)), min(cols - 1, int(cx // cw)))
        if c["area"] >= min_area:
            fig = figures.setdefault(key, {"ids": [], "area": 0, "box": [x0, y0, x1, y1]})
            fig["ids"].append(c["id"]); fig["area"] += c["area"]
            fig["box"] = [min(fig["box"][0], x0), min(fig["box"][1], y0), max(fig["box"][2], x1), max(fig["box"][3], y1)]
        else:
            small.append(c)
    for c in small:
        x0, y0, x1, y1 = c["box"]
        best = None; best_d = 1e9
        for fig in figures.values():
            fx0, fy0, fx1, fy1 = fig["box"]
            dx = max(fx0 - x1, x0 - fx1, 0); dy = max(fy0 - y1, y0 - fy1, 0)
            d = (dx * dx + dy * dy) ** 0.5
            if d < best_d: best, best_d = fig, d
        if best is not None and best_d <= 16:
            best["ids"].append(c["id"]); best["area"] += c["area"]
            best["box"] = [min(best["box"][0], x0), min(best["box"][1], y0), max(best["box"][2], x1), max(best["box"][3], y1)]
    return list(figures.values())


def read_order(figures, rows=4, cols=6, height=1024):
    band = height / rows
    for fig in figures:
        x0, y0, x1, y1 = fig["box"]
        fig["cy"] = (y0 + y1) / 2; fig["cx"] = (x0 + x1) / 2
    banded = [[] for _ in range(rows)]
    for fig in figures:
        r = min(rows - 1, max(0, int(fig["cy"] // band)))
        banded[r].append(fig)
    return [sorted(banded[r], key=lambda f: f["cx"]) for r in range(rows)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fighter"); ap.add_argument("raw")
    ap.add_argument("--ref", required=True)
    ap.add_argument("--scale", type=float, default=None)
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--floorRow", type=int, default=315)
    ap.add_argument("--targetH", type=int, default=306)
    args = ap.parse_args()
    raw = np.asarray(Image.open(args.raw).convert("RGB")).astype(np.float32)
    fg, alpha = key_unmultiply(raw)
    rgba = np.dstack([fg, alpha * 255]).astype(np.uint8); rgba[alpha == 0] = 0
    keyed = os.path.join(A, f"keyed-{args.fighter}-u24.png"); Image.fromarray(rgba, "RGBA").save(keyed)
    matched = os.path.join(A, f"matched-{args.fighter}-u24.png")
    subprocess.run([sys.executable, os.path.join(A, "color_match.py"), args.ref, keyed, matched], check=True)
    sheet = np.array(np.asarray(Image.open(matched).convert("RGBA")))
    a = sheet[..., 3].astype(np.float32) / 255
    labels, comps = components(a > 0.5)
    figures = merge_figures(comps)
    rows = read_order(figures)
    counts = [len(r) for r in rows]
    print("figures per row", counts)
    if counts != [6, 6, 6, 6]:
        print("FIGURE COUNT != 24 -- inspect / reroll"); sys.exit(2)
    panels = [fig for row in rows for fig in row]
    # Per-figure crops masked by their own blobs.
    crops = []
    for fig in panels:
        x0, y0, x1, y1 = fig["box"]
        mask = np.isin(labels[y0:y1, x0:x1], fig["ids"])
        crop = sheet[y0:y1, x0:x1].copy()
        crop[..., 3] = np.where(mask, crop[..., 3], 0)
        crop[crop[..., 3] == 0] = 0
        crops.append(Image.fromarray(crop, "RGBA"))
    heights = [crops[i].height for i in UPRIGHT_GEN]
    scale = args.scale or (args.targetH / max(heights))
    out_main = Image.new("RGBA", (CELL * 4, CELL * 4), (0, 0, 0, 0))
    out_ext = Image.new("RGBA", (CELL * 4, CELL * 2), (0, 0, 0, 0))
    cells = {}
    for gen_index, crop in enumerate(crops):
        cell_index = GEN_TO_CELL[gen_index]
        fa = np.asarray(crop)[..., 3].astype(np.float32) / 255
        ys, xs = np.where(fa > 0.5)
        rh = int(ys.max()) + 1
        lo, hi = int(rh * 0.20), int(rh * 0.575)
        band = (ys >= lo) & (ys <= hi)
        tc = float(xs[band].mean()) if band.any() else crop.width * 0.5
        half = max(tc - float(xs.min()), float(xs.max()) + 1 - tc)
        cell_scale = min(scale, (CELL * 0.5 - 2) / max(1.0, half), (args.floorRow - 2) / max(1.0, rh))
        w = max(1, round(crop.width * cell_scale)); h = max(1, round(crop.height * cell_scale))
        fig = crop.resize((w, h), Image.LANCZOS)
        fa2 = np.asarray(fig)[..., 3].astype(np.float32) / 255
        ys2, xs2 = np.where(fa2 > 0.5)
        ox = int(round(CELL * 0.5 - tc * cell_scale)); oy = (args.floorRow - 1) - int(ys2.max())
        ox = max(-int(xs2.min()), min(CELL - 1 - int(xs2.max()), ox))
        tile = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0)); tile.alpha_composite(fig, (max(0, ox), max(0, oy)))
        ta = np.asarray(tile)[..., 3]
        rws = np.where((ta >= 24).any(axis=1))[0]
        info = {"cell": cell_index, "height": int(rws.max() - rws.min() + 1), "bodyCentre": int(round((rws.min() + rws.max()) / 2)),
                "drawAdjust": round(scale / cell_scale, 4)}
        if cell_index < 16:
            out_main.alpha_composite(tile, ((cell_index % 4) * CELL, (cell_index // 4) * CELL))
        else:
            e = cell_index - 16
            out_ext.alpha_composite(tile, ((e % 4) * CELL, (e // 4) * CELL))
        cells[cell_index] = info
    out_dir = args.out_dir or f"{G}/assets/unified"
    for name, img in [(f"{args.fighter}.webp", out_main), (f"{args.fighter}-ext.webp", out_ext)]:
        dest = os.path.join(out_dir, name)
        if os.path.exists(dest) and os.stat(dest).st_nlink > 1:
            os.remove(dest)
        img.save(dest, "WEBP", lossless=True, quality=100, method=6, exact=True)
    side = {"fighter": args.fighter, "raw": os.path.basename(args.raw), "scale": round(scale, 4), "cells": [cells[i] for i in range(24)]}
    json.dump(side, open(os.path.join(A, f"u24-{args.fighter}.json"), "w"), indent=1)
    pv = Image.new("RGBA", (CELL * 4, CELL * 6), (40, 40, 40, 255)); pv.alpha_composite(out_main); pv.alpha_composite(out_ext, (0, CELL * 4))
    pv.convert("RGB").resize((640, 960)).save(os.path.join(A, f"preview-{args.fighter}-u24.png"))
    print(args.fighter, "scale", round(scale, 4), "heights", [cells[i]["height"] for i in range(24)],
          "fitted", {i: cells[i]["drawAdjust"] for i in range(24) if cells[i]["drawAdjust"] > 1.0})


if __name__ == "__main__":
    main()
