"""v5.2 — rebuild every shipped ext2/ext3/ext4 sheet from its archived raw with
the despilled slicer, at the scale the manifest records, and diff the measured
heights / body centres / draw adjusts against the engine's tables so the
rebuild is pixels-only (a registration change would need the tables patched).

Usage: rebuild_ext_banks.py [--apply]   (without --apply: build into out-fix/ and report)
"""
import json, os, subprocess, sys
A = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, A)
from repo_root import G  # the checkout this file lives in (FINAL_BLOW_ROOT overrides)
V = sys.executable
IDS = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "commissioner", "devil"]
man = json.load(open(f"{G}/assets/unified/MANIFEST.json"))["fighters"]
tables = json.load(open(os.path.join(A, "engine-tables.json")))
apply = "--apply" in sys.argv
os.makedirs(os.path.join(A, "out-fix"), exist_ok=True)

def raw_for(fid, bank):
    if fid == "ali":
        return os.path.join(A, f"raw-ali-{bank}-g5.png")
    if bank == "ext2":
        return os.path.join(A, "..", "inbetweens-v49", f"raw-{fid}-g1.png")
    return os.path.join(A, f"raw-{fid}-{bank}.png")

report = []
for fid in IDS:
    for bank in ["ext2", "ext3", "ext4"]:
        raw = raw_for(fid, bank)
        if not os.path.exists(raw):
            report.append((fid, bank, "NO RAW")); continue
        scale = man[fid][f"{bank}Scale"]
        out = os.path.join(A, "out-fix", f"{fid}-{bank}.webp")
        res = subprocess.run([V, os.path.join(A, "build_sheet.py"), fid, raw, "--bank", bank, "--scale", str(scale), "--out", out],
                             capture_output=True, text=True)
        if res.returncode != 0:
            report.append((fid, bank, "BUILD FAILED " + res.stderr[-300:])); continue
        despilled = [l for l in res.stdout.splitlines() if l.startswith("despilled")]
        side = json.load(open(os.path.join(A, f"{bank}-{fid}.json")))
        cells = side["cells"]
        heights = [c.get("height", 0) for c in cells]
        centres = [c.get("bodyCentre", 160) for c in cells]
        adjust = {str(c["frame"]): round(c.get("drawAdjust", 1.0), 4) for c in cells if c.get("drawAdjust", 1.0) > 1.0}
        t = tables[bank][fid]
        dh = [(i, a, b) for i, (a, b) in enumerate(zip(heights, t["heights"])) if abs(a - b) > 1]
        dc = [(i, a, b) for i, (a, b) in enumerate(zip(centres, t["centres"])) if abs(a - b) > 1]
        ta = {k: round(v, 4) for k, v in t["adjust"].items()}
        da = {k: (adjust.get(k), ta.get(k)) for k in set(adjust) | set(ta) if abs((adjust.get(k) or 1) - (ta.get(k) or 1)) > 0.002}
        de = subprocess.run([V, os.path.join(A, "measure_de.py"), f"{G}/assets/unified/{fid}.webp", out], capture_output=True, text=True).stdout.strip().splitlines()[-1]
        report.append((fid, bank, f"{despilled[0] if despilled else '?'} | dH {dh} | dC {dc} | dA {da} | {de.split('weighted:')[-1].strip()} dE"))
        if apply and not dh and not dc and not da:
            dest = f"{G}/assets/unified/{fid}-{bank}.webp"
            if os.path.exists(dest) and os.stat(dest).st_nlink > 1: os.remove(dest)
            os.replace(out, dest) if False else subprocess.run(["cp", out, dest], check=True)
for r in report:
    print(r[0].ljust(13), r[1], r[2])
