"""Generate a 16-cell sheet (ext2 in-betweens, ext3 strikes, ext4 reactions) for
every fighter from its own unified sheet, image-to-image through the fal edit
endpoint, concurrently; each fighter's prompt = the shared 16-cell grammar with
a one-line costume reminder. Raws land as raw-<id>-g<N>.png next to this file.

Usage: gen_all.py [<gen tag> [<ids or all> [<grammar file>]]]
  gen_all.py g1                         ext2 grammar (grammar-ext2.txt), all fighters
  gen_all.py g2 jez,ali grammar-ext3.txt
fal_edit.py reads FAL_KEY from ~/.claude.json inside the process (never printed,
never written into this tree). See ../README.md for the venv and the steps."""
import os, subprocess, sys, threading, json
from PIL import Image
from repo_root import G  # the checkout this file lives in (FINAL_BLOW_ROOT overrides)
A = os.path.dirname(os.path.abspath(__file__))
GEN = sys.argv[1] if len(sys.argv) > 1 else "g1"
GRAMMAR_FILE = sys.argv[3] if len(sys.argv) > 3 else "grammar-ext2.txt"
ONLY = sys.argv[2].split(",") if len(sys.argv) > 2 and sys.argv[2] != "all" else None
LOOK = {
  "deathblow": "a heavyset, heavily muscled man with a dark beard, glasses and a dark cap, in a black t-shirt, black shorts, red fingerless gloves and black sneakers",
  "alan": "a stocky man with a moustache in a white t-shirt, blue denim jeans and dark shoes, with wrapped hands",
  "post": "a long-haired man in orange coveralls and heavy boots",
  "benny": "a wiry man in a dark cap, black t-shirt and khaki cargo trousers with dark shoes",
  "donald": "a heavyset older man with blonde hair in a navy suit, white shirt and long red tie, with gold knee shields and black shoes",
  "cyraxx": "a thin dishevelled man with long hair and a beard in a grey t-shirt and worn grey-brown trousers",
  "ali": "a slim, light-skinned man with a dark goatee, small dark sunglasses, a red beanie, a bright yellow tracksuit with black side stripes, a heavy gold chain, yellow-and-black sneakers and a black-and-gold boombox slung on his back (the boombox stays on his back in EVERY cell)",
  "jez": "a lean man with swept-back white hair in a blue martial-arts gi with a dark belt, blue trousers and brown boots",
  "commissioner": "a stern older man with white hair in a black suit, black tie and black shoes",
  "devil": "a lean winged creature with scaled skin, clawed hands and feet, horns, a long tail and a moss-green cloth wrapped around its shins",
}
GRAMMAR = open(os.path.join(A, GRAMMAR_FILE)).read()

def build_ref(fid):
    im = Image.open(f"{G}/assets/unified/{fid}.webp").convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 0, 255, 255)); bg.alpha_composite(im)
    path = os.path.join(A, f"ref-{fid}-unified.png"); bg.convert("RGB").save(path); return path

def run(fid):
    ref = build_ref(fid)
    prompt = GRAMMAR.replace("{LOOK}", LOOK.get(fid, "the character shown"))
    pf = os.path.join(A, f"prompt-{fid}-{GEN}.txt"); open(pf, "w").write(prompt)
    out = os.path.join(A, f"raw-{fid}-{GEN}.png")
    res = subprocess.run([sys.executable, os.path.join(A, "fal_edit.py"), "--endpoint", "openai/gpt-image-2/edit",
                          "--ref", ref, "--prompt-file", pf, "--out", out, "--size", "square_hd"],
                         capture_output=True, text=True)
    print(fid, "rc", res.returncode, (res.stdout.strip().splitlines() or ["?"])[-1], res.stderr.strip()[-300:], flush=True)

ids = ONLY or [f for f in LOOK]
threads = [threading.Thread(target=run, args=(fid,)) for fid in ids]
for t in threads: t.start()
for t in threads: t.join()
print("done")
