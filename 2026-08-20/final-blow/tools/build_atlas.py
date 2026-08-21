"""Composite a magenta-keyed generated sprite sheet into Final Blow's atlas format.

The runtime expects a 1280x1280 RGBA image of 4x4 cells at 320px. Inside a cell the
character occupies ~95.6% of the height with its feet on the cell floor, and every
frame shares ONE scale so the fighter does not pulse between frames.

Pure Pillow, no numpy, so it runs anywhere the repo does.
"""
import sys
from PIL import Image

CELL = 320
GRID = 4
TARGET_FRAC = 0.956          # matches the existing roster atlases
FOOT_GAP = int(CELL * 0.0156)  # matches their bottom gap


# Magenta-ness of a pixel: how far the red and blue channels sit above green.
FULL_KEY = 96    # at or above this the pixel is pure background
EDGE_KEY = 26    # below this the pixel is fully opaque subject


def key_magenta(img):
    """Key out the flat magenta backdrop with a soft edge and a despill pass.

    A hard binary key leaves a magenta halo around the sprite, which shows up as a
    pink fringe once the atlas is drawn over a dark stage. Ramping alpha across the
    edge and pulling the leftover magenta back toward green removes both.
    """
    img = img.convert("RGBA")
    out = []
    for r, g, b, _ in img.getdata():
        magenta = min(r, b) - g
        if magenta >= FULL_KEY:
            out.append((r, g, b, 0))
            continue
        if magenta <= EDGE_KEY:
            out.append((r, g, b, 255))
            continue
        # Partially transparent edge pixel: fade it out and despill the fringe.
        ratio = (magenta - EDGE_KEY) / (FULL_KEY - EDGE_KEY)
        alpha = int(round(255 * (1 - ratio)))
        limit = g + EDGE_KEY
        out.append((min(r, limit), g, min(b, limit), alpha))
    keyed = Image.new("RGBA", img.size)
    keyed.putdata(out)
    return keyed


def row_occupancy(alpha, threshold=140):
    """Per-row pixel counts across the whole sheet."""
    width, height = alpha.size
    pixels = alpha.load()
    counts = [0] * height
    for y in range(height):
        count = 0
        for x in range(width):
            if pixels[x, y] > threshold:
                count += 1
        counts[y] = count
    return counts


def column_occupancy(alpha, y0, y1, threshold=140):
    """Per-column pixel counts inside a horizontal band."""
    width, _ = alpha.size
    band = alpha.crop((0, y0, width, y1))
    pixels = band.load()
    height = y1 - y0
    counts = [0] * width
    for x in range(width):
        count = 0
        for y in range(height):
            if pixels[x, y] > threshold:
                count += 1
        counts[x] = count
    return counts


def segments(counts, min_gap=6, min_width=18):
    """Split a row into figures on runs of empty columns."""
    runs, start, gap = [], None, 0
    for index, count in enumerate(counts):
        if count > 0:
            if start is None:
                start = index
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                if index - gap - start >= min_width:
                    runs.append((start, index - gap))
                start, gap = None, 0
    if start is not None and len(counts) - start >= min_width:
        runs.append((start, len(counts)))
    return runs


def drop_fragments(atlas, keep_ratio=0.08):
    """Erase small detached blobs the generator sometimes leaves beside a figure.

    Each cell should contain exactly one character. Anything under keep_ratio of
    the biggest connected blob in that cell is generator debris, and would show up
    in game as a floating fragment.
    """
    alpha = atlas.getchannel("A")
    pixels = alpha.load()
    removed = 0
    for row in range(GRID):
        for col in range(GRID):
            ox, oy = col * CELL, row * CELL
            seen = [[False] * CELL for _ in range(CELL)]
            blobs = []
            for y in range(CELL):
                for x in range(CELL):
                    if seen[y][x] or pixels[ox + x, oy + y] <= 140:
                        continue
                    stack, blob = [(x, y)], []
                    seen[y][x] = True
                    while stack:
                        cx, cy = stack.pop()
                        blob.append((cx, cy))
                        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                            nx, ny = cx + dx, cy + dy
                            if 0 <= nx < CELL and 0 <= ny < CELL and not seen[ny][nx] \
                                    and pixels[ox + nx, oy + ny] > 140:
                                seen[ny][nx] = True
                                stack.append((nx, ny))
                    blobs.append(blob)
            if len(blobs) < 2:
                continue
            biggest = max(len(blob) for blob in blobs)
            for blob in blobs:
                if len(blob) >= biggest * keep_ratio:
                    continue
                removed += 1
                for bx, by in blob:
                    # Clear the fragment and a one-pixel skirt of soft edge.
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            px, py = ox + bx + dx, oy + by + dy
                            if ox <= px < ox + CELL and oy <= py < oy + CELL:
                                atlas.putpixel((px, py), (0, 0, 0, 0))
    if removed:
        print(f"  removed {removed} stray fragment(s)")


def build(src_path, out_path, rows=GRID):
    keyed = key_magenta(Image.open(src_path))
    alpha = keyed.getchannel("A")
    width, height = keyed.size

    # Find the real row bands rather than assuming even division: figures often
    # overflow a nominal cell, and slicing on a fixed grid clips them, which would
    # corrupt the single global scale.
    occupancy = row_occupancy(alpha)
    bands = segments(occupancy, min_gap=4, min_width=40)
    if len(bands) != rows:
        # Figures in adjacent rows often touch, so there is no clean empty gap.
        # Cut at the emptiest scanline near each expected boundary instead, which
        # keeps every figure whole and therefore keeps the global scale honest.
        row_height = height / rows
        cuts = [0]
        for boundary in range(1, rows):
            centre = int(boundary * row_height)
            window = max(6, int(row_height * 0.18))
            lo, hi = max(1, centre - window), min(height - 1, centre + window)
            cuts.append(min(range(lo, hi), key=lambda y: occupancy[y]))
        cuts.append(height)
        bands = [(cuts[i], cuts[i + 1]) for i in range(rows)]
        print(f"note: split rows at emptiest scanlines {cuts[1:-1]}")

    boxes = []
    for row, (y0, y1) in enumerate(bands):
        found = segments(column_occupancy(alpha, y0, y1))
        if len(found) != GRID:
            found = sorted(sorted(found, key=lambda s: s[1] - s[0], reverse=True)[:GRID])
        if len(found) != GRID:
            raise SystemExit(f"row {row}: found {len(found)} figures, expected {GRID}")
        for x0, x1 in found:
            solid = alpha.crop((x0, y0, x1, y1)).point(lambda v: 255 if v > 140 else 0)
            box = solid.getbbox()
            if not box:
                raise SystemExit(f"row {row}: empty figure at {x0}-{x1}")
            boxes.append((x0 + box[0], y0 + box[1], x0 + box[2], y0 + box[3]))

    # One global scale from the tallest standing frame, so the crouch, jump and
    # knockdown frames cannot distort the character's size.
    tallest = max(box[3] - box[1] for box in boxes[:GRID * 3])
    scale = (CELL * TARGET_FRAC) / tallest

    atlas = Image.new("RGBA", (CELL * GRID, CELL * GRID), (0, 0, 0, 0))
    for index, box in enumerate(boxes):
        cut = keyed.crop(box)
        target_w = max(1, round(cut.width * scale))
        target_h = max(1, round(cut.height * scale))
        if target_w > CELL:
            target_h = max(1, round(target_h * CELL / target_w))
            target_w = CELL
        if target_h > CELL:
            target_w = max(1, round(target_w * CELL / target_h))
            target_h = CELL
        cut = cut.resize((target_w, target_h), Image.LANCZOS)
        col, row = index % GRID, index // GRID
        x = col * CELL + (CELL - target_w) // 2
        y = row * CELL + CELL - target_h - FOOT_GAP
        atlas.alpha_composite(cut, (max(col * CELL, x), max(row * CELL, y)))

    drop_fragments(atlas)
    atlas.save(out_path)
    print(f"wrote {out_path}  scale={scale:.3f}  tallest_source={tallest}px")
    for index, box in enumerate(boxes):
        print(f"  frame {index:2d} src={box} h={box[3] - box[1]}")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
