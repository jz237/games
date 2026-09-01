#!/usr/bin/env python3
"""Cut one unified atlas cell into a 2D skeletal rig piece set (3.1 pilot).

Dissects `assets/unified/<fighter>.webp` cell N into 13 limb pieces, packs them
into one atlas, and writes the piece rects + local pivots as JSON. The skeleton
(bone hierarchy, rest angles, lengths) lives beside it in the same JSON so the
runtime has exactly one file to fetch.

Three techniques carry the whole thing, and they are the reason a rotated cut-out
does not fall apart:

1. OVERLAP. Every piece polygon reaches PAST its joint into the parent. A thigh
   carries hip coverage, an upper arm carries shoulder coverage. Rotation then
   sweeps opaque pixels through the joint instead of opening a wedge of nothing.

2. FEATHER. The overlap edge — the cut line that is meant to be hidden under the
   parent — gets a linear alpha ramp, so when a big rotation does expose it, it
   dissolves instead of reading as a straight razor cut across the body.

3. BACKING. Cutting the arms off the torso leaves the torso with an arm-shaped
   bite. Each piece may declare a `backing` polygon: the silhouette the piece
   should have once its children are gone. Anything inside that polygon which is
   not kept source pixel is filled by scanning outward along the row for the
   nearest kept pixel, then blurred. deathblow's shirt and shorts are near-flat
   black, so the reconstructed flank is invisible in practice.

   `flesh_repaint` is the same idea for the thighs: the shorts hide the top of
   both thighs in every drawing, so a thigh piece cut wide enough to have a hip
   is mostly trousers. Every non-flesh pixel is repainted from the leg the piece
   does contain, so a swinging hip can only ever show leg.

Usage:
  python3 tools/cut_rig.py                       # writes assets/rig/*
  python3 tools/cut_rig.py --debug-dir /tmp/x    # + per-piece PNGs and overlays
"""

import argparse
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

CELL = 320
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# ---------------------------------------------------------------------------
# THE DISSECTION, in source-cell coordinates (320x320, origin top-left).
#
# Source is deathblow `unified:1` (walk-contact-a). Picked over the idle cell by
# eye: cell 0 folds both gauntlets across the chest and buries the far arm, while
# cell 1 splits the legs wide, hangs both arms clear of the trunk and shows the
# head in clean profile. Every limb is fully drawn in cell 1 — nothing had to be
# cloned from the near side, which is the one piece of luck in this pilot.
# ---------------------------------------------------------------------------

SOURCE_FIGHTER = "deathblow"
SOURCE_CELL = 1
SOLE_ROW = 318.0  # measured: bottom row of the near sneaker at alpha >= 24

# Joints, cell space. These are the rig's pivots; they are read off the drawing
# and then checked by reassembling at rest and diffing against the source.
JOINTS = {
    "pelvis":     (172.0, 196.0),
    "waist":      (174.0, 176.0),
    "neck":       (180.0, 84.0),
    "shoulderF":  (140.0, 94.0),
    "elbowF":     (120.0, 132.0),
    "wristF":     (108.0, 172.0),
    "shoulderN":  (198.0, 108.0),
    "elbowN":     (211.0, 140.0),
    "wristN":     (233.0, 172.0),
    # The leg joints are REGULARISED, not read literally. Taken straight off the
    # drawing the two legs measure 4.7% different in total length and the hips
    # sit 30px apart in x — the artist drew the trailing hip back with the leg.
    # A rig cannot have two different leg lengths without the fighter limping,
    # so the knees and ankles are moved onto a common 56 + 42 segmentation with
    # a 10px hip separation for the 3/4 view. Every knee stays inside its own
    # piece, so nothing had to be re-cut for this.
    "hipF":       (168.0, 199.0),
    "kneeF":      (126.0, 236.0),
    "ankleF":     (101.0, 270.0),
    "hipN":       (178.0, 200.0),
    "kneeN":      (202.0, 250.0),
    "ankleN":     (224.0, 286.0),
}

# poly      : region harvested from the source drawing (intersected with alpha)
# backing   : optional final silhouette; holes inside it are reconstructed
# feather   : list of (x0,y0,x1,y1,width) — alpha ramps to 0 over `width` px on
#             the side the normal (dy,-dx) points, i.e. a LEFT-TO-RIGHT segment
#             fades UPWARD. Used on the hidden overlap edges: every limb tucks
#             its stub under its parent and dissolves rather than ending in a
#             razor line if a big rotation exposes it.
# flesh_repaint : darken factor — repaint every non-flesh pixel as cloned leg
PIECES = [
    {
        "name": "head",
        "poly": [(146, 4), (242, 4), (242, 46), (230, 62), (218, 84),
                 (208, 102), (170, 104), (152, 90), (138, 56), (138, 14)],
        "feather": [(206, 104, 168, 104, 12)],
    },
    {
        "name": "torso",
        "poly": [(150, 64), (204, 64), (213, 84), (209, 112), (205, 144),
                 (203, 178), (201, 206), (196, 216), (144, 216), (134, 198),
                 (130, 160), (132, 116), (118, 100), (116, 78), (130, 64)],
        # conservative trunk core — strictly inside the shirt, so the flank the
        # arms were cut out of is rebuilt without squaring off the silhouette
        "backing": [(154, 74), (208, 74), (210, 102), (205, 136), (203, 170),
                    (201, 200), (192, 210), (154, 210), (150, 190), (148, 150),
                    (152, 110)],
        # Both bare biceps and both gauntlets are removed from the trunk and
        # replaced by shirt: without this the far arm swinging forward drags a
        # painted second forearm across the belly.
        "subtract": ["upperArmFar", "foreArmFar", "upperArmNear", "foreArmNear"],
        # right-to-left: the shirt hem fades DOWNWARD into the shorts
        "feather": [(198, 216, 144, 216, 14)],
    },
    {
        "name": "pelvis",
        "poly": [(112, 162), (206, 162), (208, 198), (202, 230), (192, 240),
                 (158, 242), (150, 248), (140, 240), (132, 248), (110, 248),
                 (100, 238), (100, 200), (104, 176)],
        # The far fist hangs over the shorts' left hem, and — the one that
        # mattered — the shorts polygon reaches BELOW the hem and harvests the
        # top of both thighs. Left in, those thigh stubs are welded to the
        # pelvis and never move: a static angular wedge of leg hanging off the
        # hip on every frame of the walk, which was the single worst artifact in
        # the pilot. Both legs and both gauntlets come out; the backing core
        # below rebuilds the shorts that the bite took with them.
        "subtract": ["foreArmFar", "foreArmNear"],
        # ...and the legs come out BY MATERIAL, not by polygon. The shorts
        # polygon reaches below the hem and harvests the top of both thighs;
        # left in, those stubs are welded to the pelvis and never move, which is
        # a static angular wedge of leg hanging off the hip on every frame — the
        # worst artifact in the pilot. Subtracting the thigh CAPSULES instead
        # replaced it with a straight polygon edge where the ragged hem should
        # be. Dropping every bare-skin pixel keeps the drawn hem exactly.
        "drop_flesh": True,
        "backing": [(112, 196), (196, 178), (200, 200), (196, 226), (188, 234),
                    (160, 236), (150, 242), (140, 234), (132, 238), (112, 240),
                    (106, 224)],
        "feather": [(112, 162, 206, 162, 12)],
    },
    {
        # THE CROTCH PATCH, and it is not optional. The shorts are drawn around
        # the legs that were under them: the left leg opening points down-LEFT
        # because the trailing leg did. Swing that thigh anywhere else and the
        # opening is a hole with the background showing through it — the single
        # ugliest artifact this rig produced before it existed.
        #
        # A flat slab of thigh flesh, parented to the pelvis and drawn behind
        # the shorts, plugs both openings at every hip angle. Standard practice;
        # every 2D rig with a skirt or shorts has one.
        "name": "hipFill",
        # Shaped from the SHORTS' own silhouette dropped 9px, not hand-drawn:
        # the hem is a ragged line and any straight-edged slab behind it shows a
        # pale band below the crotch on every frame.
        "name_follows": "pelvis",
        "drop": 4,
        "poly": [(96, 180), (210, 180), (210, 262), (96, 262)],
        "flesh_fill": True,
    },
    # --- far side (away from camera) -------------------------------------
    {
        "name": "upperArmFar",
        "poly": [(148, 78), (160, 96), (150, 126), (136, 146), (110, 148),
                 (96, 126), (98, 96), (114, 76)],
        "feather": [(114, 76, 148, 78, 14)],
    },
    {
        "name": "foreArmFar",
        "poly": [(138, 118), (146, 140), (144, 172), (136, 196), (112, 202),
                 (84, 192), (78, 160), (86, 128), (108, 114)],
        "feather": [(108, 114, 140, 118, 13)],
    },
    {
        "name": "thighFar",
        # Radii hug the PAINTED leg. An earlier pass used 27/20 "to be safe" and
        # the result was a thigh that was mostly repainted flesh around a small
        # drawn leg — a flat slab that swung out from under the shorts on every
        # frame. A capsule wider than the drawing is not safety, it is filler.
        "capsule": {"a": "hipF", "b": "kneeF", "ra": 20, "rb": 16,
                    "extendA": 6, "extendB": 10},
        "flesh_repaint": 0.86,
        "tint": (0.72, 0.74, 0.80),
    },
    {
        "name": "shinFar",
        "capsule": {"a": "kneeF", "b": "ankleF", "ra": 16, "rb": 11,
                    "extendA": 8, "extendB": 12},
        "tint": (0.72, 0.74, 0.80),
    },
    {
        # THE ONE RECONSTRUCTED PIECE. cell 1 draws the trailing sneaker with its
        # TOE POINTING BACKWARD — the shoe is a complete, well-drawn left-facing
        # sneaker attached to a right-facing man. Rotating it into place would
        # put the sole on top, so the far foot is cloned off the near foot and
        # darkened, which is what you would do by hand and reads fine at
        # gameplay size. It is also the honest fix: the rig points the foot the
        # way the leg is actually travelling, which the drawing never did.
        "name": "footFar",
        "clone_from": "footNear",
        "clone_pivot": "ankleN",
        "clone_tip": (272.0, 300.0),
        # lighter than the leg tint on purpose: the sneaker is already near-black,
        # and 0.66 sank it into the wet-street stage entirely
        "tint": (0.80, 0.82, 0.88),
    },
    # --- near side (camera side) -----------------------------------------
    {
        "name": "upperArmNear",
        # left edge held off the shark decal: an arm that drags a fin across the
        # chest when it swings is the classic paper-doll tell
        "poly": [(193, 94), (210, 92), (224, 112), (224, 142), (206, 156),
                 (192, 148), (190, 122)],
        "feather": [(193, 94, 210, 92, 13)],
    },
    {
        "name": "foreArmNear",
        "poly": [(196, 126), (222, 122), (252, 146), (258, 178), (244, 198),
                 (214, 196), (194, 172), (188, 146)],
        "feather": [(196, 126, 222, 122, 13)],
    },
    {
        "name": "thighNear",
        "capsule": {"a": "hipN", "b": "kneeN", "ra": 20, "rb": 16,
                    "extendA": 6, "extendB": 10},
        "flesh_repaint": 0.86,
    },
    {
        "name": "shinNear",
        "capsule": {"a": "kneeN", "b": "ankleN", "ra": 16, "rb": 11,
                    "extendA": 8, "extendB": 12},
    },
    {
        "name": "footNear",
        "poly": [(200, 272), (232, 266), (280, 282), (284, 306), (268, 318),
                 (214, 318), (198, 302)],
        "feather": [(200, 272, 232, 266, 9)],
    },
]

# bone -> (parent, pivot joint, tip joint, piece, base z)
#
# z layering. BOTH legs sit BEHIND the pelvis (10) so the shorts hide the
# reconstructed hips — that is what the `extend_up` cloning is for and it only
# works if the shorts draw last. The near leg still outranks the far leg, so the
# pair reads correctly. The ARM layers are re-derived from the pose at runtime
# (engine/rig.mjs): an arm that swings behind the body plane drops behind the
# torso, which is the one depth swap on this rig that is physically real.
BONES = [
    ("foreArmFar",   "upperArmFar", "elbowF",    "wristF",    "foreArmFar",    2),
    ("upperArmFar",  "torso",       "shoulderF", "elbowF",    "upperArmFar",   3),
    # shin under foot (the shoe collar hides the ankle cut) and under thigh (the
    # quad hides the knee cut) — both cut lines end up buried by design
    ("shinFar",      "thighFar",    "kneeF",     "ankleF",    "shinFar",       4),
    ("footFar",      "shinFar",     "ankleF",    None,        "footFar",       5),
    ("thighFar",     "pelvis",      "hipF",      "kneeF",     "thighFar",      6),
    ("shinNear",     "thighNear",   "kneeN",     "ankleN",    "shinNear",      7),
    ("footNear",     "shinNear",    "ankleN",    None,        "footNear",      8),
    # the crotch patch sits behind BOTH thighs, so it is invisible until a thigh
    # swings off its opening and something has to be there
    ("hipFill",      "pelvis",      "pelvis",    "waist",     "hipFill",     3.5),
    ("thighNear",    "pelvis",      "hipN",      "kneeN",     "thighNear",     9),
    ("pelvis",       None,          "pelvis",    "waist",     "pelvis",       10),
    ("torso",        "pelvis",      "waist",     "neck",      "torso",        12),
    ("head",         "torso",       "neck",      None,        "head",         14),
    ("upperArmNear", "torso",       "shoulderN", "elbowN",    "upperArmNear", 30),
    ("foreArmNear",  "upperArmNear", "elbowN",   "wristN",    "foreArmNear",  31),
]

# Tip joints for the leaves, so head/foot bones still have a length and a rest
# angle (the foot's "tip" is its toe, the head's is the crown).
LEAF_TIPS = {
    "head": (183.0, 26.0),
    "footFar": (64.0, 304.0),
    "footNear": (272.0, 300.0),
}


SS = 4  # supersample factor for polygon masks


def capsule(spec):
    """Stadium polygon around a bone axis.

    Hand-drawn limb polygons kept ending in square corners at the joint, and a
    thigh that has to rotate 50-70 degrees off its drawn angle swings those
    corners straight out from under the shorts as a pale slab. A capsule cannot:
    every point of the overlap cap is the same distance from the pivot, so
    rotation sweeps it around inside the parent instead of out of it.
    """
    ax, ay = JOINTS[spec["a"]]
    bx, by = JOINTS[spec["b"]]
    axis = math.atan2(by - ay, bx - ax)
    ax -= math.cos(axis) * spec.get("extendA", 0)
    ay -= math.sin(axis) * spec.get("extendA", 0)
    bx += math.cos(axis) * spec.get("extendB", 0)
    by += math.sin(axis) * spec.get("extendB", 0)
    points = []
    steps = 18
    for i in range(steps + 1):
        t = axis - math.pi / 2 + math.pi * i / steps
        points.append((bx + math.cos(t) * spec["rb"], by + math.sin(t) * spec["rb"]))
    for i in range(steps + 1):
        t = axis + math.pi / 2 + math.pi * i / steps
        points.append((ax + math.cos(t) * spec["ra"], ay + math.sin(t) * spec["ra"]))
    return points


def poly_mask(poly, size=CELL):
    """Coverage mask, supersampled. Returned soft so cut lines anti-alias; call
    `.point(...)` for the hard version when the mask is used as set logic."""
    big = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(big).polygon([(x * SS, y * SS) for x, y in poly], fill=255)
    return big.resize((size, size), Image.BOX)


def hard(mask):
    return mask.point(lambda v: 255 if v >= 128 else 0)


def feather_alpha(alpha, lines):
    """Ramp alpha to zero on the outward side of each directed segment."""
    if not lines:
        return alpha
    px = alpha.load()
    w, h = alpha.size
    prepared = []
    for x0, y0, x1, y1, width in lines:
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1.0
        # outward normal = segment direction rotated -90 degrees
        nx, ny = dy / length, -dx / length
        prepared.append((x0, y0, nx, ny, float(width)))
    for y in range(h):
        for x in range(w):
            a = px[x, y]
            if not a:
                continue
            scale = 1.0
            for x0, y0, nx, ny, width in prepared:
                d = (x - x0) * nx + (y - y0) * ny
                if d > 0:
                    scale = min(scale, max(0.0, 1.0 - d / width))
            if scale < 1.0:
                px[x, y] = int(a * scale)
    return alpha


CLOTH_MAX = 90  # deathblow's shirt/shorts never brighten past this


def row_fill(rgb, keep, target):
    """Fill `target and not keep` by scanning each row outward for a kept pixel.

    Cloth is preferred over any kept pixel: sampling the literal nearest one
    dragged the shark decal's bright highlight sideways into the flank as a
    white streak. The reconstruction is only ever meant to be shirt.
    """
    out = rgb.copy()
    op = out.load()
    kp = keep.load()
    tp = target.load()
    w, h = rgb.size
    for y in range(h):
        kept = [x for x in range(w) if kp[x, y]]
        if not kept:
            continue
        cloth = [x for x in kept if max(op[x, y]) <= CLOTH_MAX]
        for x in range(w):
            if tp[x, y] and not kp[x, y]:
                pool = cloth or kept
                op[x, y] = op[min(pool, key=lambda k: abs(k - x)), y]
    return out


def flesh_slab(rgb, solid, mask):
    """Repaint `mask` as thigh flesh sampled from the legs below it.

    Returns (image, keep) where keep is the mask — every pixel is authored, so
    the alpha pass treats the whole slab as harvested and it picks up the soft
    polygon edge like any other piece.
    """
    out = rgb.copy()
    op = out.load()
    sp = solid.load()
    mp = mask.load()
    w, h = rgb.size
    columns = {}
    for x in range(w):
        rows = [y for y in range(h) if mp[x, y]]
        if not rows:
            continue
        bottom = max(rows)
        for y in range(bottom, min(h, bottom + 46)):
            if not sp[x, y]:
                continue
            r, g, b = op[x, y]
            if r > 108 and r > g + 16 and g > b + 6:      # bare leg, not cloth
                columns[x] = (y, (r, g, b))
                break
    if not columns:
        return out, mask
    keys = sorted(columns)
    for x in range(w):
        rows = [y for y in range(h) if mp[x, y]]
        if not rows:
            continue
        source_x = min(keys, key=lambda k: abs(k - x))
        top_y, tone = columns[source_x]
        for y in rows:
            # a soft vertical gradient so the slab is not a flat sticker if a
            # sliver of it ever shows past the hem
            k = 0.80 + 0.20 * (y - min(rows)) / max(1, (max(rows) - min(rows)))
            src = op[source_x, min(h - 1, top_y + (y - min(rows)) // 3)]
            base = src if max(src) > 100 else tone
            op[x, y] = (int(base[0] * k), int(base[1] * k), int(base[2] * k))
    return out, mask


def is_flesh(pixel):
    """Bare skin, and specifically NOT the gauntlets.

    The first version (`r > g + 16 and g > b + 6`) also matched the red plaid
    forearms, which cross both thigh capsules in the source. The inpaint below
    then seeded itself on gauntlet pixels and grew a maroon hip. Skin sits in a
    narrow band: warm but not saturated, with green comfortably above blue.
    """
    r, g, b = pixel
    return r > 105 and 20 < r - g < 85 and 12 < g - b < 62


def mirror_along_axis(rgb, mask, axis_deg):
    """Repeat the painted limb along its own bone axis, mirrored.

    The flood fill below produces a smooth, correctly-coloured hip with no
    muscle in it, and against painted calves that reads as a bald sausage. This
    runs first: rotate the piece so the bone points straight down, ping-pong the
    band of real flesh upward to fill the rest of the column, rotate back. The
    result is invented, but it is invented out of this fighter's own quadriceps
    rather than out of a gradient.
    """
    pad = max(rgb.size)
    canvas = Image.new("RGB", (pad * 2, pad * 2), (0, 0, 0))
    canvas.paste(rgb, (pad // 2, pad // 2))
    holder = Image.new("L", (pad * 2, pad * 2), 0)
    holder.paste(mask, (pad // 2, pad // 2))
    # PIL rotates content counter-clockwise, which maps a screen angle t to
    # t - turn; the bone has to land on 90 (straight down), so turn = axis - 90.
    turn = axis_deg - 90
    up = canvas.rotate(turn, resample=Image.BICUBIC, center=(pad, pad))
    up_mask = holder.rotate(turn, resample=Image.NEAREST, center=(pad, pad))
    cp, mp = up.load(), up_mask.load()
    for x in range(pad * 2):
        rows = [y for y in range(pad * 2) if mp[x, y]]
        if not rows:
            continue
        flesh = [y for y in rows if is_flesh(cp[x, y])]
        if len(flesh) < 6:
            continue
        top, bottom = min(flesh), max(flesh)
        span = bottom - top
        for y in range(min(rows), top):
            step = (top - y) % (span * 2)
            source = top + step if step <= span else top + (span * 2 - step)
            cp[x, y] = cp[x, source]
    back = up.rotate(-turn, resample=Image.BICUBIC, center=(pad, pad))
    return back.crop((pad // 2, pad // 2, pad // 2 + rgb.width, pad // 2 + rgb.height))


def flesh_repaint(rgb, mask, darken):
    """Make the whole piece flesh, by growing the leg it already contains.

    THE THIGH PROBLEM. The shorts hide the top half of both thighs in every
    drawing, so a thigh piece cut wide enough to have a hip is part trousers —
    and once the hip swings 40-70 degrees off its drawn angle, that slab of
    trousers rotates out from under the real shorts and hangs in the air.

    So the drawn leg is INPAINTED outward over everything else: a breadth-first
    flood from the flesh pixels, each new pixel taking the mean of its already
    known neighbours and darkening with depth, which reads as a hip receding
    into the shadow under the shorts. A per-column version of this came first
    and failed exactly where it mattered — the columns right on the pivot
    contain no leg at all, so they sampled one dark edge pixel and filled the
    entire cap with a flat maroon slab.
    """
    op = rgb.load()
    mp = mask.load()
    w, h = rgb.size
    known = [[None] * h for _ in range(w)]
    frontier = []
    for x in range(w):
        for y in range(h):
            if mp[x, y] and is_flesh(op[x, y]):
                known[x][y] = (op[x, y], 0)
                frontier.append((x, y))
    if not frontier:
        return rgb
    neighbours = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
    head = 0
    while head < len(frontier):
        x, y = frontier[head]
        head += 1
        base, depth = known[x][y]
        for dx, dy in neighbours:
            nx, ny = x + dx, y + dy
            if nx < 0 or ny < 0 or nx >= w or ny >= h:
                continue
            if not mp[nx, ny] or known[nx][ny] is not None:
                continue
            # mean of the known neighbours already assigned, so the fill keeps
            # the leg's shading gradient instead of smearing one colour
            total = [0, 0, 0]
            count = 0
            for ax, ay in neighbours:
                sx, sy = nx + ax, ny + ay
                if 0 <= sx < w and 0 <= sy < h and known[sx][sy] is not None:
                    sample = known[sx][sy][0]
                    total[0] += sample[0]
                    total[1] += sample[1]
                    total[2] += sample[2]
                    count += 1
            mean = tuple(v // count for v in total) if count else base
            known[nx][ny] = (mean, depth + 1)
            frontier.append((nx, ny))
    # Rim. A flood fill has no contour, so a reconstructed hip arrives as a
    # smooth sausage of skin with a hard alpha edge and no drawn outline — at
    # gameplay size the two thighs merge into one mass and you cannot tell which
    # leg is which. Darkening the last few pixels of the fill gives the rebuilt
    # part the same painted rim every limb on the sheet already has.
    rim = [[0] * h for _ in range(w)]
    edge = []
    for x in range(w):
        for y in range(h):
            if not mp[x, y]:
                continue
            if (x == 0 or y == 0 or x == w - 1 or y == h - 1
                    or not (mp[x - 1, y] and mp[x + 1, y] and mp[x, y - 1] and mp[x, y + 1])):
                rim[x][y] = 1
                edge.append((x, y))
    head = 0
    while head < len(edge):
        x, y = edge[head]
        head += 1
        if rim[x][y] >= 6:
            continue
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and mp[nx, ny] and rim[nx][ny] == 0:
                rim[nx][ny] = rim[x][y] + 1
                edge.append((nx, ny))
    for x in range(w):
        for y in range(h):
            entry = known[x][y]
            if entry is None or entry[1] == 0:
                continue
            colour, depth = entry
            shade = max(darken, 1.0 - depth * 0.006)
            if rim[x][y]:
                shade *= 0.60 + 0.075 * (rim[x][y] - 1)
            op[x, y] = (int(colour[0] * shade), int(colour[1] * shade), int(colour[2] * shade))
    return rgb


def angle_of(a, b):
    return math.atan2(b[1] - a[1], b[0] - a[0])


def build(fighter, cell_index, debug_dir=None):
    sheet = Image.open(os.path.join(ROOT, "assets", "unified", f"{fighter}.webp")).convert("RGBA")
    cx, cy = (cell_index % 4) * CELL, (cell_index // 4) * CELL
    cell = sheet.crop((cx, cy, cx + CELL, cy + CELL))
    src_rgb = cell.convert("RGB")
    src_alpha = cell.split()[3]
    solid = src_alpha.point(lambda v: 255 if v >= 24 else 0)

    poly_masks = {}
    for spec in PIECES:
        if "capsule" in spec:
            poly_masks[spec["name"]] = poly_mask(capsule(spec["capsule"]))
        elif "poly" in spec:
            poly_masks[spec["name"]] = poly_mask(spec["poly"])

    cut = {}
    for spec in PIECES:
        name = spec["name"]
        if "clone_from" in spec or "name_follows" in spec:
            continue
        region_hard = hard(poly_masks[name]).load()
        # `keep` = pixels genuinely harvested from the drawing for this piece.
        keep = Image.new("L", (CELL, CELL), 0)
        kp, sp = keep.load(), solid.load()
        subs = [hard(poly_masks[s]).load() for s in spec.get("subtract", [])]
        drop_flesh = bool(spec.get("drop_flesh"))
        src_px = src_rgb.load()
        for y in range(CELL):
            for x in range(CELL):
                if not region_hard[x, y] or not sp[x, y]:
                    continue
                if any(s[x, y] for s in subs):
                    continue
                if drop_flesh and is_flesh(src_px[x, y]):
                    continue
                kp[x, y] = 255

        # `backing` is a CONSERVATIVE inner core, not an outline: the region that
        # must stay opaque even though its pixels were handed to a child. Outside
        # it the piece keeps the drawing's own silhouette, so nothing squares off.
        core = poly_mask(spec["backing"]) if "backing" in spec else None
        rgb = src_rgb.copy()
        if core is not None:
            # Reconstruct ONLY where the drawing had ink. Without this clamp the
            # core polygon's own straight edges become opaque slabs hanging off
            # the silhouette wherever the polygon overshoots the body.
            core = Image.eval(Image.composite(core, Image.new("L", (CELL, CELL), 0),
                                              solid), lambda v: v)
            core_hard = hard(core)
            rgb = row_fill(src_rgb, keep, core_hard)
            # soften the reconstructed flank so the fill boundary is not a line
            blurred = rgb.filter(ImageFilter.GaussianBlur(1.6))
            hole = Image.new("L", (CELL, CELL), 0)
            hp, kp2, thp = hole.load(), keep.load(), core_hard.load()
            for y in range(CELL):
                for x in range(CELL):
                    if thp[x, y] and not kp2[x, y]:
                        hp[x, y] = 255
            hole = hole.filter(ImageFilter.GaussianBlur(1.0))
            rgb = Image.composite(blurred, rgb, hole)

        if "flesh_repaint" in spec:
            piece_mask = hard(poly_masks[name])
            if "capsule" in spec:
                joint_a, joint_b = JOINTS[spec["capsule"]["a"]], JOINTS[spec["capsule"]["b"]]
                rgb = mirror_along_axis(rgb, piece_mask, math.degrees(angle_of(joint_a, joint_b)))
            rgb = flesh_repaint(rgb, piece_mask, spec["flesh_repaint"])

        if spec.get("flesh_fill"):
            # Every pixel becomes thigh: for each column take the first flesh
            # tone found BELOW the region (the leg emerging from the shorts) and
            # run it all the way up. Columns with no leg under them borrow from
            # the nearest column that has one.
            rgb, keep = flesh_slab(src_rgb, solid, hard(poly_masks[name]))

        # Harvested pixels keep the drawing's own soft rim (clipped by the
        # anti-aliased harvest polygon, so every cut line the rig introduces is
        # a smooth edge); reconstructed core pixels are solid.
        alpha = Image.new("L", (CELL, CELL), 0)
        ap, kp3 = alpha.load(), keep.load()
        regp = poly_masks[name].load()
        corep = core.load() if core is not None else None
        srcp = src_alpha.load()
        # A flesh_fill or flesh_repaint piece is PAINTED, not harvested, so its
        # coverage comes from the mask alone.
        #
        # For the thighs this is the fix for the pilot's worst artifact. Bounded
        # by the source silhouette instead, a thigh inherits the SHORTS' straight
        # left hem as its own outline — and a straight cut rotating out from
        # under the shorts is exactly the hard-edged wedge that made the far hip
        # unwatchable. Bounded by its own capsule the piece is a smooth stadium
        # that can only ever present a rounded edge, whatever the hip does.
        authored = bool(spec.get("flesh_fill") or spec.get("flesh_repaint"))
        for y in range(CELL):
            for x in range(CELL):
                if authored:
                    ap[x, y] = regp[x, y]
                    continue
                value = (srcp[x, y] * regp[x, y] // 255) if kp3[x, y] else 0
                if corep is not None and corep[x, y] > value:
                    value = corep[x, y]
                ap[x, y] = value

        alpha = feather_alpha(alpha, spec.get("feather"))
        if "tint" in spec:
            # Depth cue. Both legs are cut from their own painted leg, so
            # without this they arrive at the same brightness, the hips are only
            # 10px apart, and the pair reads as one mass of skin. The drawing
            # already darkens its far limbs; the rig has to do it explicitly.
            bands = list(rgb.split())
            for index in range(3):
                bands[index] = bands[index].point(
                    lambda v, k=spec["tint"][index]: min(255, int(v * k)))
            rgb = Image.merge("RGB", bands)
        piece = Image.merge("RGBA", (*rgb.split(), alpha))
        bbox = alpha.point(lambda v: 255 if v > 2 else 0).getbbox()
        if bbox is None:
            raise SystemExit(f"piece {name} is empty — check its polygon")
        cut[name] = {"image": piece.crop(bbox), "bbox": bbox, "alpha": alpha}

    # ---- followers -------------------------------------------------------
    # A `name_follows` piece takes its shape from another piece's FINISHED
    # silhouette, dropped a few rows. The crotch patch reads the shorts this way
    # rather than from a hand-drawn polygon: the hem is a ragged line, and the
    # raw pelvis REGION still contains the far fist, so anything cruder either
    # left a pale band under the hem or a brown slab where the hand was.
    for spec in PIECES:
        if "name_follows" not in spec:
            continue
        base = cut[spec["name_follows"]]["alpha"].point(lambda v: 255 if v >= 128 else 0).load()
        grown = Image.new("L", (CELL, CELL), 0)
        gp = grown.load()
        for x in range(CELL):
            rows = [y for y in range(CELL) if base[x, y]]
            if not rows:
                continue
            for y in range(min(rows), min(CELL, max(rows) + spec["drop"] + 1)):
                gp[x, y] = 255
        mask = Image.composite(grown, Image.new("L", (CELL, CELL), 0),
                               hard(poly_masks[spec["name"]]))
        # Fade the dropped rows out. Left hard, the patch's bottom edge is the
        # SHORTS' reconstructed hem offset downward — a straight-cut tan wedge
        # that swings out below the hip on every frame. Faded, the few pixels
        # that ever show past the hem dissolve into the leg behind them.
        fade = mask.load()
        for x in range(CELL):
            rows = [y for y in range(CELL) if fade[x, y]]
            if not rows:
                continue
            bottom = max(rows)
            for step in range(spec["drop"] + 1):
                y = bottom - step
                if y < 0 or not fade[x, y]:
                    continue
                fade[x, y] = int(fade[x, y] * (step / max(1, spec["drop"])) ** 0.9)
        mask = mask.filter(ImageFilter.GaussianBlur(0.9))
        rgb, _ = flesh_slab(src_rgb, solid, hard(mask))
        piece = Image.merge("RGBA", (*rgb.split(), mask))
        bbox = mask.point(lambda v: 255 if v > 2 else 0).getbbox()
        cut[spec["name"]] = {"image": piece.crop(bbox), "bbox": bbox, "alpha": mask}

    # ---- cloned pieces ---------------------------------------------------
    geom_override = {}
    for spec in PIECES:
        if "clone_from" not in spec:
            continue
        donor = cut[spec["clone_from"]]
        src = donor["image"]
        tint = spec.get("tint", (0.7, 0.7, 0.75))
        bands = list(src.split())
        for i in range(3):
            bands[i] = bands[i].point(lambda v, k=tint[i]: min(255, int(v * k)))
        cut[spec["name"]] = {"image": Image.merge("RGBA", bands), "bbox": donor["bbox"]}
        geom_override[spec["name"]] = (spec["clone_pivot"], spec["clone_tip"])

    # ---- pack ------------------------------------------------------------
    order = sorted(cut, key=lambda n: -cut[n]["image"].height)
    pad = 2
    atlas_w = 512
    shelf_x, shelf_y, shelf_h = pad, pad, 0
    placed = {}
    for name in order:
        img = cut[name]["image"]
        if shelf_x + img.width + pad > atlas_w:
            shelf_x = pad
            shelf_y += shelf_h + pad
            shelf_h = 0
        placed[name] = (shelf_x, shelf_y)
        shelf_x += img.width + pad
        shelf_h = max(shelf_h, img.height)
    atlas_h = shelf_y + shelf_h + pad
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    for name, (x, y) in placed.items():
        atlas.alpha_composite(cut[name]["image"], (x, y))

    pieces_json = {}
    for name, (x, y) in placed.items():
        bx0, by0, _, _ = cut[name]["bbox"]
        img = cut[name]["image"]
        pieces_json[name] = {
            "x": x, "y": y, "w": img.width, "h": img.height,
            # where the piece sat in the source cell — the runtime never needs
            # this, but every pivot below is derived from it and a human
            # re-cutting the sheet does
            "cellX": bx0, "cellY": by0,
        }

    bones_json = []
    for name, parent, pivot_name, tip_name, piece, base_z in BONES:
        pivot = JOINTS[pivot_name]
        tip = JOINTS[tip_name] if tip_name else LEAF_TIPS[name]
        parent_pivot = JOINTS[dict((b[0], b[2]) for b in BONES)[parent]] if parent else (0.0, 0.0)
        rect = pieces_json[piece]
        # A cloned piece carries the DONOR's geometry: its own drawing never sat
        # at this joint, so both the local anchor and the rest angle are read off
        # where the donor sat instead.
        art_pivot, art_tip = geom_override.get(piece, (None, None))
        art_pivot = JOINTS[art_pivot] if art_pivot else pivot
        art_tip = art_tip or tip
        bones_json.append({
            "name": name,
            "parent": parent,
            "piece": piece,
            # pivot expressed in the PARENT's pivot space (rest orientation)
            "pivot": [round(pivot[0] - parent_pivot[0], 2), round(pivot[1] - parent_pivot[1], 2)],
            # pivot in piece-local pixels — the drawImage anchor
            "piecePivot": [round(art_pivot[0] - rect["cellX"], 2),
                           round(art_pivot[1] - rect["cellY"], 2)],
            "restAngle": round(angle_of(art_pivot, art_tip), 5),
            "length": round(math.dist(pivot, tip), 2),
            "z": base_z,
        })

    rig = {
        "format": "final-blow-rig-1",
        "fighter": fighter,
        "source": {"sheet": f"assets/unified/{fighter}.webp", "cell": cell_index,
                   "cellSize": CELL, "floorRow": 315},
        # Where the ground is in cell space, and how high the ankle pivot rides
        # above a flat sole. drawAtlasFrame maps cell row 320 onto the fighter's
        # world origin, so `soleRow` is measured, not chosen: it is the row the
        # shipped sprite's sneakers actually bottom out on.
        "ground": {
            "soleRow": SOLE_ROW,
            "ankleHeight": round(SOLE_ROW - JOINTS["ankleN"][1], 2),
            "restHipRow": JOINTS["hipN"][1],
        },
        "atlas": {"file": f"{fighter}-pieces.webp", "w": atlas_w, "h": atlas_h},
        "pieces": pieces_json,
        "bones": bones_json,
        "joints": {k: [round(v[0], 2), round(v[1], 2)] for k, v in JOINTS.items()},
    }

    out_dir = os.path.join(ROOT, "assets", "rig")
    os.makedirs(out_dir, exist_ok=True)
    atlas.save(os.path.join(out_dir, f"{fighter}-pieces.webp"), lossless=True, quality=100)
    with open(os.path.join(out_dir, f"{fighter}-rig.json"), "w") as handle:
        json.dump(rig, handle, indent=1, sort_keys=False)
        handle.write("\n")

    if debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        for name in cut:
            cut[name]["image"].save(os.path.join(debug_dir, f"piece-{name}.png"))
        # rest reassembly: every bone at its rest angle should rebuild the cell
        rest = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        for bone in sorted(bones_json, key=lambda b: b["z"]):
            rect = pieces_json[bone["piece"]]
            img = cut[bone["piece"]]["image"]
            rest.alpha_composite(img, (int(rect["cellX"]), int(rect["cellY"])))
        rest.save(os.path.join(debug_dir, "rest-reassembly.png"))
        base = Image.new("RGBA", (CELL, CELL), (255, 255, 255, 255))
        base.alpha_composite(cell)
        cmp_img = Image.new("RGB", (CELL * 3, CELL), (255, 255, 255))
        cmp_img.paste(base.convert("RGB"), (0, 0))
        white = Image.new("RGBA", (CELL, CELL), (255, 255, 255, 255))
        white.alpha_composite(rest)
        cmp_img.paste(white.convert("RGB"), (CELL, 0))
        diff = Image.new("RGB", (CELL, CELL), (0, 0, 0))
        dp, ap_, bp = diff.load(), base.convert("RGB").load(), white.convert("RGB").load()
        worst = 0
        for y in range(CELL):
            for x in range(CELL):
                d = max(abs(ap_[x, y][i] - bp[x, y][i]) for i in range(3))
                worst = max(worst, d)
                dp[x, y] = (d, d, d)
        cmp_img.paste(diff, (CELL * 2, 0))
        cmp_img.resize((CELL * 6, CELL * 2), Image.LANCZOS).save(
            os.path.join(debug_dir, "rest-vs-source.png"))
        print(f"rest reassembly worst channel delta: {worst}")

    print(f"atlas {atlas_w}x{atlas_h}, {len(pieces_json)} pieces, {len(bones_json)} bones")
    for bone in bones_json:
        print(f"  {bone['name']:<13} parent={str(bone['parent']):<13} "
              f"len={bone['length']:<6} rest={math.degrees(bone['restAngle']):7.2f}deg z={bone['z']}")
    return rig


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fighter", default=SOURCE_FIGHTER)
    parser.add_argument("--cell", type=int, default=SOURCE_CELL)
    parser.add_argument("--debug-dir", default=None)
    args = parser.parse_args()
    build(args.fighter, args.cell, args.debug_dir)


if __name__ == "__main__":
    sys.exit(main())
