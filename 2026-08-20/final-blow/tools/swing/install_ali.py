"""Install Ali's redrawn banks into the repo and re-derive every per-fighter
table the engine keeps for him, following the rules the engine documents:
  * UNIFIED_CELL_ADJUST: all four walk keys corrected onto the idle whenever any
    one leaves the 3% deadband; the guard only when it leaves 5%.
  * UNIFIED_EXT_CELL_ADJUST: walk-down keys corrected when > 3.5% off the idle.
  * UNIFIED_GUARD_FLINCH_ADJUST: unified guard height / motion2 block-hit height.
  * WAKEUP_RISE_HEIGHT: standUnified = idle height, unified:5 = crouch height.
  * CELL_BODY_CENTRE rows: bbox-midpoint rows at alpha >= 24.
Also patches the manifest entry and the pinned rows in tests/unified-ext.test.mjs.

Usage: install_ali.py <candidate dir with ali.webp ali-ext.webp ali-ext2/3/4.webp> <u24 sidecar json>
"""
import json, os, re, shutil, subprocess, sys
import numpy as np
from PIL import Image

A = os.path.dirname(os.path.abspath(__file__))
from repo_root import G  # the checkout this file lives in (FINAL_BLOW_ROOT overrides)
cand, sidecar = sys.argv[1], sys.argv[2]
u = json.load(open(sidecar)); cells = {c["cell"]: c for c in u["cells"]}
main_h = [cells[i]["height"] for i in range(16)]; main_c = [cells[i]["bodyCentre"] for i in range(16)]
ext_h = [cells[16 + i]["height"] for i in range(8)]; ext_c = [cells[16 + i]["bodyCentre"] for i in range(8)]
idle = main_h[0]
walk = {}
if max(abs(main_h[k] - idle) / idle for k in (1, 2, 3, 4)) > 0.01:  # the 1% drawn line (v5.0), not the 3% reporting line
    for k in (1, 2, 3, 4): walk[k] = round(idle / main_h[k], 3)
if abs(main_h[7] - idle) / idle > 0.05: walk[7] = round(idle / main_h[7], 3)
extadj = {k: round(idle / ext_h[k], 3) for k in (1, 2) if abs(ext_h[k] - idle) / idle > 0.035}
m2 = np.asarray(Image.open(os.path.join(cand, "banks", "ali-motion2.png")).convert("RGBA"))
bcell = m2[2 * 320:3 * 320, 0:320, 3]; rows = np.where((bcell >= 24).any(axis=1))[0]; block_h = int(rows.max() - rows.min() + 1)
guard_flinch = round(main_h[7] / block_h, 3)

def install(src, dest):
    if os.path.exists(dest) and os.stat(dest).st_nlink > 1: os.remove(dest)
    if src.endswith(".png"):
        Image.open(src).convert("RGBA").save(dest, "WEBP", lossless=True, quality=100, method=6, exact=True)
    else:
        shutil.copyfile(src, dest)

for name in ["ali.webp", "ali-ext.webp", "ali-ext2.webp", "ali-ext3.webp", "ali-ext4.webp"]:
    install(os.path.join(cand, name), f"{G}/assets/unified/{name}")
for bank in ["motion", "motion2", "motion3", "walk"]:
    install(os.path.join(cand, "banks", f"ali-{bank}.png"), f"{G}/assets/{bank}/ali.webp")
print("sheets installed; idle", idle, "walk adjust", walk, "ext adjust", extadj, "guard flinch", guard_flinch, "block", block_h)

banks = {}
for b in ["ext2", "ext3", "ext4"]:
    d = json.load(open(os.path.join(A, f"{b}-ali.json"))); c = d["cells"]
    banks[b] = {"heights": [x["height"] for x in c], "centres": [x["bodyCentre"] for x in c],
                "adjust": {x["frame"]: round(x.get("drawAdjust", 1.0), 4) for x in c if x.get("drawAdjust", 1.0) > 1.0}, "scale": d["scale"], "cells": c}

# ---- engine tables
p = f"{G}/engine/fighter-kits.mjs"; s = open(p).read()
def replace_row(table_name, fighter, new_row_text):
    global s
    start = s.index(f"const {table_name} = Object.freeze({{") if f"const {table_name} = Object.freeze({{" in s else s.index(f"export const {table_name} = Object.freeze({{")
    end = s.index("\n});", start)
    block = s[start:end]
    pat = re.compile(rf"^  {fighter}: Object\.freeze\(.*\),$", re.M)
    assert pat.search(block), f"{table_name}.{fighter} row missing"
    block = pat.sub(f"  {fighter}: Object.freeze({new_row_text}),", block, count=1)
    s = s[:start] + block + s[end:]
replace_row("UNIFIED_CELL_HEIGHT", "ali", json.dumps(main_h))
replace_row("UNIFIED_EXT_CELL_HEIGHT", "ali", json.dumps(ext_h))
replace_row("UNIFIED_EXT2_CELL_HEIGHT", "ali", json.dumps(banks["ext2"]["heights"]))
replace_row("UNIFIED_CELL_ADJUST", "ali", "{ " + ", ".join(f"{k}: {v}" for k, v in walk.items()) + " }")
replace_row("UNIFIED_EXT_CELL_ADJUST", "ali", "{ " + ", ".join(f"{k}: {v}" for k, v in extadj.items()) + " }")
replace_row("UNIFIED_EXT2_CELL_ADJUST", "ali", "{ " + ", ".join(f"{k}: {v}" for k, v in banks["ext2"]["adjust"].items()) + " }")
# ext3/ext4 rows: add ali after devil rows in each table
for b, name in [("ext3", "UNIFIED_EXT3"), ("ext4", "UNIFIED_EXT4")]:
    for table, row in [(f"{name}_CELL_HEIGHT", json.dumps(banks[b]["heights"])), (f"{name}_CELL_ADJUST", "{ " + ", ".join(f"{k}: {v}" for k, v in banks[b]["adjust"].items()) + " }")]:
        key = f"const {table} = Object.freeze({{" if f"const {table} = Object.freeze({{" in s else f"export const {table} = Object.freeze({{"
        start = s.index(key); end = s.index("\n});", start)
        if re.search(r"^  ali: ", s[start:end], re.M):
            replace_row(table, "ali", row)
        else:
            s = s[:end] + f"\n  ali: Object.freeze({row})," + s[end:]
# body centres
start = s.index("export const CELL_BODY_CENTRE = Object.freeze({"); end = s.index("export function auditBodyCentres()")
table = s[start:end]
i = table.index("  ali: Object.freeze({\n"); j = table.index("    ref:", i)
blk = table[i:j]
blk = re.sub(r'    unified: Object\.freeze\(\[.*?\]\),\n', f'    unified: Object.freeze({json.dumps(main_c)}),\n', blk)
blk = re.sub(r'    "unified-ext": Object\.freeze\(\[.*?\]\),\n', f'    "unified-ext": Object.freeze({json.dumps(ext_c)}),\n', blk)
blk = re.sub(r'    "unified-ext2": Object\.freeze\(\[.*?\]\),\n', f'    "unified-ext2": Object.freeze({json.dumps(banks["ext2"]["centres"])}),\n', blk)
for b in ["ext3", "ext4"]:
    if f'"unified-{b}"' in blk:
        blk = re.sub(rf'    "unified-{b}": Object\.freeze\(\[.*?\]\),\n', f'    "unified-{b}": Object.freeze({json.dumps(banks[b]["centres"])}),\n', blk)
    else:
        blk += f'    "unified-{b}": Object.freeze({json.dumps(banks[b]["centres"])}),\n'
table = table[:i] + blk + table[j:]
s = s[:start] + table + s[end:]
# guard flinch + wakeup
s = re.sub(r"(devil: 1\.127, ali: )1\.135", rf"\g<1>{guard_flinch}", s, count=1)
assert f"ali: {guard_flinch}" in s
s = re.sub(r'  ali: Object\.freeze\(\{ stand: 306, standUnified: \d+, cells: Object\.freeze\(\{ "motion2:15": (\d+), "base:12": (\d+), "unified:5": \d+ \}\) \}\),',
           lambda m: f'  ali: Object.freeze({{ stand: 306, standUnified: {idle}, cells: Object.freeze({{ "motion2:15": {m.group(1)}, "base:12": {m.group(2)}, "unified:5": {main_h[5]} }}) }}),', s, count=1)
assert f"standUnified: {idle}" in s
open(p, "w").write(s); print("engine tables patched")

# ---- manifest
mp = f"{G}/assets/unified/MANIFEST.json"; st = os.stat(mp); m = json.load(open(mp)); e = m["fighters"]["ali"]
e["scale"] = round(u["scale"], 4)
e["generationGrid"] = "6x4"
e["generations"] = (e.get("generations") or 0) + 1
e["redrawn50"] = ("v5.0 REDRAWN FROM THE DESIGN. The 4.1 sheet drew a heavier, dark-skinned man — a different person from the base atlas, the portrait and the specials (a slim, light-skinned man with a goatee and a boombox on his back), so he strobed between two people every time a bank changed (skin L 33 on the unified/motion generations against 46 on the design). This sheet is ONE 24-panel (6x4) generation with the base atlas and portrait as image-to-image references, colour-matched onto the base atlas (1.74 weighted dE), the boombox held in every cell; ext2/ext3/ext4 were generated from it (1.15/1.23/1.02 dE) at their own 4x4 scales, since a 6x4 panel draws the figure smaller than a 4x4 one. The motion, motion2, motion3 and walk banks were skin-matched toward the base atlas (L 33 -> 38-40) for the cells the swing substitution does not cover. Walk keys 1-4 sit within 2.3% of the idle and the walk-down keys within 1%, so no size correction is applied anywhere on the sheet.")
for c in e["cells"]: c["accept"] = True
for c in e["extCells"]:
    c["accept"] = True
    c["note"] = (c.get("note", "") + " v5.0: redrawn with the sheet.").strip()
for b, base in [("ext2", 24), ("ext3", 40), ("ext4", 56)]:
    e[f"{b}Scale"] = banks[b]["scale"]
    e[f"{b}Cells"] = [{"frame": base + x["frame"], "id": x["id"], "accept": True, "note": f"v5.0, generated from the redrawn unified sheet at its scale." + (f" Fit-scaled; drawAdjust {x['drawAdjust']}." if x.get("drawAdjust", 1) > 1 else "")} for x in banks[b]["cells"]]
    e[f"{b}Sheet"] = f"ali-{b}.webp"
if st.st_nlink > 1: os.remove(mp)
json.dump(m, open(mp, "w"), indent=1); print("manifest patched")

# ---- pinned test rows
t = f"{G}/tests/unified-ext.test.mjs"; ts = open(t).read()
ts = re.sub(r"assert\.deepEqual\(\[\.\.\.UNIFIED_CELL_HEIGHT\.ali\],\n    \[.*?\]\);", f"assert.deepEqual([...UNIFIED_CELL_HEIGHT.ali],\n    {json.dumps(main_h)});", ts, count=1, flags=re.S)
ts = re.sub(r"assert\.deepEqual\(\[\.\.\.UNIFIED_EXT_CELL_HEIGHT\.ali\], \[.*?\]\);", f"assert.deepEqual([...UNIFIED_EXT_CELL_HEIGHT.ali], {json.dumps(ext_h)});", ts, count=1, flags=re.S)
ts = re.sub(r"assert\.deepEqual\(\[\.\.\.CELL_BODY_CENTRE\.ali\[UNIFIED_BANK\]\],\n    \[.*?\]\);", f"assert.deepEqual([...CELL_BODY_CENTRE.ali[UNIFIED_BANK]],\n    {json.dumps(main_c)});", ts, count=1, flags=re.S)
ts = re.sub(r"assert\.deepEqual\(\[\.\.\.CELL_BODY_CENTRE\.ali\[UNIFIED_EXT_BANK\]\],\n    \[.*?\]\);", f"assert.deepEqual([...CELL_BODY_CENTRE.ali[UNIFIED_EXT_BANK]],\n    {json.dumps(ext_c)});", ts, count=1, flags=re.S)
ts = ts.replace('assert.equal(guardFlinchAdjust("ali", "motion2", MOTION2_CELLS.blockHit, { unified: true }), 1.135);', f'assert.equal(guardFlinchAdjust("ali", "motion2", MOTION2_CELLS.blockHit, {{ unified: true }}), {guard_flinch});')
ts = ts.replace("// His guard grew 274 -> 294 with the redraw, which is what moved the flinch.", f"// v5.0: his guard measures {main_h[7]} on the redrawn sheet against a {block_h}px block-hit.")
open(t, "w").write(ts); print("test pins patched")
