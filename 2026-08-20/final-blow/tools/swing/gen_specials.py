"""v5.3 — regenerate every fighter's SPECIALS sheet image-to-image: IMAGE 1 is
his unified sheet (identity), IMAGE 2 his shipped specials sheet (poses). Raws
land as raw-<id>-specials-g1.png next to this file; sliced sheets in
out-specials/ with a specials-<id>.json sidecar, ready for install_specials.py.

The Commissioner is absent by construction: he has no specials sheet, so there
is no pose reference to regenerate from.

fal_edit.py reads FAL_KEY from ~/.claude.json inside the process (never
printed, never written into this tree). See ../README.md for the venv.

Usage: gen_specials.py [<ids or all>]
Then:  build_sheet.py runs from here; post needs the pink-safe key (see below).
"""
import json, os, subprocess, sys, threading
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from repo_root import G  # noqa: E402

A = os.path.dirname(os.path.abspath(__file__))
# gen_all.py reads its grammar at import time; lift its costume table from the
# source rather than importing it.
_src = open(os.path.join(A, "gen_all.py")).read()
LOOK = eval(_src.split("LOOK = ", 1)[1].split("\n}\n", 1)[0] + "\n}")
IDS = ["deathblow", "jez", "alan", "post", "donald", "devil", "ali", "benny", "cyraxx"]
# Post's paint IS magenta: the default key band reads his spray as half
# background and the despill refills what survives. See MOTION-ATLAS.md v5.3.
SLICE_ARGS = {"post": ["--keyLow", "25", "--keySpan", "55", "--hueSafe", "60", "--matchShift", "5"]}
GRAMMAR = open(os.path.join(A, "grammar-specials.txt")).read()
MANIFEST = json.load(open(f"{G}/assets/unified/MANIFEST.json"))["fighters"]


def ref(fid, name, path):
    """The edit endpoint takes flat images: composite onto the key."""
    im = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 0, 255, 255))
    bg.alpha_composite(im)
    out = os.path.join(A, f"ref-{fid}-{name}.png")
    bg.convert("RGB").save(out)
    return out


def run(fid):
    r1 = ref(fid, "unified", f"{G}/assets/unified/{fid}.webp")
    r2 = ref(fid, "specials", f"{G}/assets/moves/{fid}-specials.webp")
    prompt = os.path.join(A, f"prompt-{fid}-specials.txt")
    open(prompt, "w").write(GRAMMAR.replace("{LOOK}", LOOK.get(fid, "the character shown")))
    raw = os.path.join(A, f"raw-{fid}-specials-g1.png")
    res = subprocess.run([sys.executable, os.path.join(A, "fal_edit.py"),
                          "--endpoint", "openai/gpt-image-2/edit", "--ref", r1, "--ref", r2,
                          "--prompt-file", prompt, "--out", raw, "--size", "square_hd"],
                         capture_output=True, text=True)
    print(fid, "gen rc", res.returncode, (res.stdout.strip().splitlines() or ["?"])[-1][:80], flush=True)
    if res.returncode != 0 or not os.path.exists(raw):
        return
    # A specials sheet's only STANDING cell is the victory pose, so the scale is
    # taken from the fighter's unified sheet rather than derived from this one
    # (a 6x4 generation carries its own and is left to the slicer).
    scale = [] if MANIFEST[fid].get("generationGrid") == "6x4" else ["--scale", str(MANIFEST[fid]["scale"])]
    sheet = os.path.join(A, "out-specials", f"{fid}-specials.webp")
    res = subprocess.run([sys.executable, os.path.join(A, "build_sheet.py"), fid, raw,
                          "--bank", "specials", *scale, *SLICE_ARGS.get(fid, []), "--out", sheet],
                         capture_output=True, text=True)
    tail = [line for line in res.stdout.splitlines() if line.startswith(fid) or line.startswith("despilled")]
    de = subprocess.run([sys.executable, os.path.join(A, "measure_de.py"),
                         f"{G}/assets/unified/{fid}.webp", sheet], capture_output=True, text=True)
    last = de.stdout.strip().splitlines()[-1:] or ["?"]
    print(fid, "slice rc", res.returncode, " | ".join(tail)[:160], "|",
          last[0].split("weighted:")[-1].strip(), "dE", flush=True)


if __name__ == "__main__":
    ids = IDS if len(sys.argv) < 2 or sys.argv[1] == "all" else sys.argv[1].split(",")
    os.makedirs(os.path.join(A, "out-specials"), exist_ok=True)
    threads = [threading.Thread(target=run, args=(fid,)) for fid in ids]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    print("done")
