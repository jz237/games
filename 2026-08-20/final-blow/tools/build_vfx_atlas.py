"""Composite magenta-keyed generated VFX flipbook sheets into alpha atlases.

Companion to build_atlas.py (same soft magenta key + despill), specialised for
the v2.6 elemental special-attack flipbooks: 1024x1024 inputs holding a 4x4
grid of 256px effect frames. Unlike the fighter pipeline there is no row-band
rescaling — frames must stay on their authored cell grid so the runtime can
index them — but generated sheets bring three problems of their own that this
tool owns:

  1. Some generations draw visible cell separator lines and tint the cell
     backgrounds off-magenta. A feathered clear band at every cell boundary
     removes the separators, and per-sheet key thresholds absorb the tinted
     backgrounds (the spark sheet's rose backdrop keys at a much lower
     magenta-ness than pure #FF00FF).
  2. Dark purple separator remnants survive a plain magenta key as
     half-transparent sludge. An optional purpleFloor kill removes any dark
     magenta-family pixel outright (safe on sheets whose content is bright).
  3. Scatter sheets occasionally leave a cell empty. Empty cells are backfilled
     from the sheet's densest cell so a runtime pick never draws nothing.

Output: RGBA WebP (quality 92) plus a per-frame entry (content box, centroid,
coverage) merged into assets/vfx/MANIFEST.json.

Pure Pillow, no numpy, matching the repo's tooling baseline.
"""
import json
import os
import sys
from PIL import Image

CELL = 256
GRID = 4
SIZE = CELL * GRID
ALPHA_TRIM = 24          # alpha above this counts as content for trim boxes
EMPTY_COVERAGE = 0.005   # cells under 0.5% coverage count as empty
BAND_CLEAR = 5           # fully cleared half-width at each cell boundary
BAND_FEATHER = 14        # alpha ramp reaches 1.0 this far from the boundary

# Per-sheet key parameters. full/edge follow build_atlas.py's key_magenta
# semantics; purpleFloor kills dark magenta-family pixels outright; mode is
# recorded for the runtime (anim sheets play 0..15 over a particle's life,
# scatter sheets pick one cell per particle, flicker hashes a cell per tick).
SHEETS = {
    "flame":    {"mode": "anim",    "full": 96, "edge": 26},
    "smoke":    {"mode": "anim",    "full": 96, "edge": 26},
    "electric": {"mode": "flicker", "full": 70, "edge": 20, "purpleFloor": True, "cornerFade": 44},
    "debris":   {"mode": "scatter", "full": 96, "edge": 26},
    "spark":    {"mode": "scatter", "full": 52, "edge": 16, "purpleFloor": True},
    "glyph":    {"mode": "scatter", "full": 96, "edge": 26},
    "paper":    {"mode": "scatter", "full": 96, "edge": 26},
    "curse":    {"mode": "anim",    "full": 96, "edge": 26},
    "feather":  {"mode": "scatter", "full": 96, "edge": 26},
    "paint":    {"mode": "anim",    "full": 80, "edge": 24},
    "vinyl":    {"mode": "scatter", "full": 90, "edge": 26},
    "cash":     {"mode": "scatter", "full": 96, "edge": 26},
}


def key_magenta(img, full, edge, purple_floor=False):
    """build_atlas.py's soft key + despill, with the optional dark-purple kill."""
    img = img.convert("RGBA")
    out = []
    for r, g, b, _ in img.getdata():
        magenta = min(r, b) - g
        if magenta >= full:
            out.append((r, g, b, 0))
            continue
        if purple_floor and magenta > 10 and max(r, g, b) < 132 and g < 96:
            # Dark magenta-family separator sludge: kill, never feather.
            out.append((r, g, b, 0))
            continue
        if magenta <= edge:
            out.append((r, g, b, 255))
            continue
        ratio = (magenta - edge) / (full - edge)
        alpha = int(round(255 * (1 - ratio)))
        limit = g + edge
        out.append((min(r, limit), g, min(b, limit), alpha))
    keyed = Image.new("RGBA", img.size)
    keyed.putdata(out)
    return keyed


def boundary_factor(offset):
    """Alpha multiplier by distance (px) from the nearest cell boundary."""
    if offset <= BAND_CLEAR:
        return 0.0
    if offset >= BAND_FEATHER:
        return 1.0
    return (offset - BAND_CLEAR) / (BAND_FEATHER - BAND_CLEAR)


def clear_grid_bands(img, corner_fade=0):
    """Feather alpha to zero across every cell boundary (kills drawn grids).

    corner_fade > 0 additionally fades alpha radially within that many pixels
    of every cell corner — for sheets whose generations leave bright wedges
    where content ran into a corner and was clipped by the grid.
    """
    alpha = img.getchannel("A")
    pixels = alpha.load()
    boundaries = [i * CELL for i in range(GRID + 1)]
    for y in range(SIZE):
        row_offset = min(abs(y - boundary) for boundary in boundaries)
        row_factor = boundary_factor(row_offset)
        for x in range(SIZE):
            col_offset = min(abs(x - boundary) for boundary in boundaries)
            factor = min(row_factor, boundary_factor(col_offset))
            if corner_fade:
                corner = (row_offset * row_offset + col_offset * col_offset) ** 0.5
                if corner < corner_fade:
                    factor = min(factor, corner / corner_fade)
            if factor < 1.0:
                pixels[x, y] = int(pixels[x, y] * factor)
    img.putalpha(alpha)
    return img


def cell_stats(img, column, row):
    """Trim box, centroid and coverage of one cell's content."""
    x0, y0 = column * CELL, row * CELL
    cell = img.crop((x0, y0, x0 + CELL, y0 + CELL))
    pixels = cell.getchannel("A").load()
    min_x, min_y, max_x, max_y = CELL, CELL, -1, -1
    total = 0
    sum_x = 0
    sum_y = 0
    for y in range(CELL):
        for x in range(CELL):
            if pixels[x, y] > ALPHA_TRIM:
                total += 1
                sum_x += x
                sum_y += y
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y
    if max_x < 0:
        return {"x": x0, "y": y0, "w": 0, "h": 0, "cx": x0 + CELL // 2, "cy": y0 + CELL // 2, "coverage": 0.0}
    return {
        "x": x0 + min_x, "y": y0 + min_y,
        "w": max_x - min_x + 1, "h": max_y - min_y + 1,
        "cx": x0 + sum_x // total, "cy": y0 + sum_y // total,
        "coverage": round(total / (CELL * CELL), 4),
    }


def build(name, source_path, out_dir):
    params = SHEETS[name]
    img = Image.open(source_path).convert("RGBA")
    if img.size != (SIZE, SIZE):
        img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img = key_magenta(img, params["full"], params["edge"], params.get("purpleFloor", False))
    img = clear_grid_bands(img, params.get("cornerFade", 0))

    frames = [cell_stats(img, i % GRID, i // GRID) for i in range(GRID * GRID)]

    filled = []
    if params["mode"] in ("scatter", "flicker"):
        donor_index = max(range(len(frames)), key=lambda i: frames[i]["coverage"])
        donor_cell = img.crop((
            (donor_index % GRID) * CELL, (donor_index // GRID) * CELL,
            (donor_index % GRID) * CELL + CELL, (donor_index // GRID) * CELL + CELL,
        ))
        for index, frame in enumerate(frames):
            if frame["coverage"] >= EMPTY_COVERAGE:
                continue
            img.paste(donor_cell, ((index % GRID) * CELL, (index // GRID) * CELL))
            frames[index] = cell_stats(img, index % GRID, index // GRID)
            filled.append(index)

    out_path = os.path.join(out_dir, f"{name}.webp")
    img.save(out_path, "WEBP", quality=92, method=6)
    return {
        "sheet": f"{name}.webp",
        "mode": params["mode"],
        "cell": CELL,
        "grid": GRID,
        "frames": frames,
        "backfilled": filled,
    }, out_path


def main():
    if len(sys.argv) < 3:
        print("usage: build_vfx_atlas.py <raw_dir> <out_dir> [names...]")
        sys.exit(1)
    raw_dir, out_dir = sys.argv[1], sys.argv[2]
    names = sys.argv[3:] or list(SHEETS)
    os.makedirs(out_dir, exist_ok=True)
    manifest_path = os.path.join(out_dir, "MANIFEST.json")
    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path) as fh:
            manifest = json.load(fh)
    for name in names:
        source = os.path.join(raw_dir, f"{name}-raw.png")
        entry, out_path = build(name, source, out_dir)
        manifest[name] = entry
        size_kb = os.path.getsize(out_path) // 1024
        live = sum(1 for frame in entry["frames"] if frame["coverage"] >= EMPTY_COVERAGE)
        print(f"{name}: {size_kb} KB, {live}/16 live cells, backfilled {entry['backfilled']}")
    with open(manifest_path, "w") as fh:
        json.dump(manifest, fh, indent=1)
    print("manifest:", manifest_path)


if __name__ == "__main__":
    main()
