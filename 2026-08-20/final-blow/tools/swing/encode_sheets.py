"""Ship-encode the unified-family sheets as lossy WebP with EXACT alpha.

Why this exists (5.1 #36): 36 of the 46 sheets in assets/unified shipped as
lossless VP8L (32 of the directory's 34 MB) because every builder in this
directory saves `lossless=True`. Same 320 px cells, same 1280 px grid: the
lossy 4.0-era ext sheets are 136-161 KB, the lossless ext2/3/4 sheets are
712-1131 KB. Every one of those bytes is downloaded on the first fight of a
session, so halving them is the single biggest lever on time-to-first-authored
frame on a phone.

The gate is the project's own colour gate: measure_de.py's weighted per-cluster
dE between the lossless master and the lossy decode must stay under
DE_THRESHOLD (0.7 -- half the 1.3 the shipped generations were accepted at),
and the alpha plane must be BYTE-IDENTICAL (exact=True + alpha_quality=100),
because the manifest's cell metrics, the slicer's foot rows and the 3D bank's
UVs are all read off alpha. A sheet that fails either check keeps its lossless
bytes -- one revert per sheet is the unit of regression.

Masters: the lossless archive directory is read-only (never written here).
A shipped sheet that has no archive master is used as its own master ONLY if
it is itself VP8L (a lossless file IS its pixels); a sheet that already ships
lossy is skipped, because re-encoding lossy from lossy compounds the loss.

Hardlink hazard: assets/unified/*.webp and MANIFEST.json may be hardlinked
(st_nlink > 1) into an archive, so every write is remove-then-write, never in
place.

Usage:
  encode_sheets.py [--src assets/unified] [--masters DIR] [--quality 90]
                   [--method 6] [--threshold 0.7] [--only NAME ...]
                   [--dry-run] [--report out.json]
Run from the game root (the venv with numpy+pillow is documented in
tools/README.md). Writes format.encoding into <src>/MANIFEST.json unless
--dry-run.
"""
import argparse, io, json, os, sys, time
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from measure_de import to_lab, clusters  # noqa: E402

DE_THRESHOLD = 0.7
# q90 first; a sheet that misses the gate gets one more try at q92 before it
# falls back to lossless. Higher than that and the size win is gone.
QUALITY_LADDER = (90, 92)


def is_lossless_webp(path):
    with open(path, "rb") as fh:
        head = fh.read(256)
    return b"VP8L" in head


def load_rgba(path):
    return np.asarray(Image.open(path).convert("RGBA"))


def encode(rgba, quality, method):
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(
        buf, "WEBP", lossless=False, quality=quality, method=method,
        alpha_quality=100, exact=True)
    return buf.getvalue()


def weighted_de(ref_rgba, cand_rgba):
    """EXACTLY measure_de.py's number, so the gate here is the gate the shipped
    generations were accepted at: cluster the master's opaque pixels (k=6,
    seeded), assign the CANDIDATE's opaque pixels to the nearest master
    centroid by their own colour, and take the weight-averaged centroid drift.
    Re-assigning by the candidate's colour is what makes this a COSTUME
    measure rather than an edge-noise measure -- a fringe pixel that the
    encoder's 4:2:0 chroma smears simply lands in the neighbouring cluster.
    The per-pixel mean over the master's opaque pixels is recorded beside it
    so the edge noise is on the record too."""
    ref_rgb = ref_rgba[..., :3].astype(np.float32)
    cand_rgb = cand_rgba[..., :3].astype(np.float32)
    ref_mask = ref_rgba[..., 3] > 128
    cand_mask = cand_rgba[..., 3] > 128
    ref_lab = to_lab(ref_rgb)
    cand_lab = to_lab(cand_rgb)
    cent, w = clusters(ref_lab, ref_mask)
    order = np.argsort(-w)
    cent, w = cent[order], w[order]
    pts = cand_lab[cand_mask]
    d = ((pts[:, None, :] - cent[None]) ** 2).sum(-1)
    ids = d.argmin(1)
    per = []
    for i in range(len(cent)):
        sel = pts[ids == i]
        if len(sel) < 200:
            per.append(None)
            continue
        per.append(float(np.sqrt(((sel.mean(0) - cent[i]) ** 2).sum())))
    used = [i for i in range(len(cent)) if per[i] is not None]
    weighted = sum(w[i] * per[i] for i in used) / sum(w[i] for i in used)
    pixel = float(np.sqrt(((ref_lab[ref_mask] - cand_lab[ref_mask]) ** 2).sum(-1)).mean())
    return float(weighted), [None if v is None else round(v, 3) for v in per], pixel


def write_file(path, data):
    # remove-then-write: a hardlinked file must not be rewritten in place.
    if os.path.exists(path):
        os.remove(path)
    tmp = f"{path}.tmp-{os.getpid()}"
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default="assets/unified")
    ap.add_argument("--masters", default="")
    ap.add_argument("--quality", type=int, default=QUALITY_LADDER[0])
    ap.add_argument("--method", type=int, default=6)
    ap.add_argument("--threshold", type=float, default=DE_THRESHOLD)
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--report", default="")
    args = ap.parse_args()

    ladder = [args.quality] + [q for q in QUALITY_LADDER if q > args.quality]
    names = sorted(n for n in os.listdir(args.src) if n.endswith(".webp"))
    if args.only:
        names = [n for n in names if n in set(args.only)]
    results = {}
    before = after = 0
    for name in names:
        path = os.path.join(args.src, name)
        shipped = os.path.getsize(path)
        before += shipped
        master_path = os.path.join(args.masters, name) if args.masters else ""
        if not (master_path and os.path.exists(master_path)):
            if not is_lossless_webp(path):
                results[name] = {"codec": "VP8", "action": "kept-lossy", "bytes": shipped}
                after += shipped
                print(f"{name:26s} already lossy ({shipped} B) -- skipped")
                continue
            master_path = path
            master_kind = "self (shipped VP8L)"
        else:
            master_kind = "archive"
        master = load_rgba(master_path)
        entry = {"master": master_kind, "losslessBytes": shipped if is_lossless_webp(path) else None}
        chosen = None
        for q in ladder:
            t0 = time.time()
            data = encode(master, q, args.method)
            cand = load_rgba_bytes(data)
            alpha_exact = bool((cand[..., 3] == master[..., 3]).all())
            wde, per, pix = weighted_de(master, cand)
            trial = {"quality": q, "bytes": len(data), "weightedDe": round(wde, 3),
                     "perCluster": per, "pixelDe": round(pix, 3), "alphaExact": alpha_exact,
                     "seconds": round(time.time() - t0, 1)}
            entry.setdefault("trials", []).append(trial)
            print(f"{name:26s} q{q} {len(data):8d} B  wdE {wde:.3f}  pixdE {pix:.2f}  alpha {'exact' if alpha_exact else 'CHANGED'}  {trial['seconds']}s")
            if alpha_exact and wde < args.threshold:
                chosen = (q, data, trial)
                break
        if chosen is None:
            entry.update({"codec": "VP8L", "action": "kept-lossless", "bytes": shipped})
            after += shipped
            print(f"{name:26s} FAILED the gate at every quality -- kept lossless")
        else:
            q, data, trial = chosen
            entry.update({"codec": "VP8", "action": "encoded" if not args.dry_run else "would-encode",
                          "quality": q, "method": args.method, "bytes": len(data),
                          "weightedDe": trial["weightedDe"], "perCluster": trial["perCluster"],
                          "pixelDe": trial["pixelDe"]})
            after += len(data)
            if not args.dry_run:
                write_file(path, data)
        results[name] = entry

    print(f"\n{'dry run: ' if args.dry_run else ''}{before} B -> {after} B "
          f"({after / max(before, 1) * 100:.1f}%) over {len(names)} sheets")
    if args.report:
        with open(args.report, "w") as fh:
            json.dump({"before": before, "after": after, "sheets": results}, fh, indent=1)
    if not args.dry_run:
        stamp_manifest(os.path.join(args.src, "MANIFEST.json"), results, args)
    return 0


def load_rgba_bytes(data):
    return np.asarray(Image.open(io.BytesIO(data)).convert("RGBA"))


def stamp_manifest(path, results, args):
    """format.encoding records the settings and the per-sheet numbers, so the
    next wave can see what each file was accepted at without re-measuring."""
    with open(path, "r", encoding="utf-8") as fh:
        manifest = json.load(fh)
    sheets = {}
    for name, entry in results.items():
        sheets[name] = {k: entry[k] for k in ("codec", "action", "bytes", "quality", "weightedDe", "perCluster", "pixelDe", "losslessBytes") if k in entry}
    manifest["format"]["encoding"] = {
        "tool": "tools/swing/encode_sheets.py",
        "settings": f"PIL {Image.__version__} WebP lossy, method {args.method}, alpha_quality 100, exact=True; quality ladder {list(ladder_for(args))}; gate: measure_de weighted dE < {args.threshold} against the lossless master AND byte-identical alpha, else the sheet keeps its lossless bytes",
        "why": "5.1 #36 -- lossless VP8L sheets were 5-7x the bytes of the lossy 4.0 ext sheets at the same cell size; every byte is on the wire for the first fight of a session on a phone. Alpha is exact so the cell metrics, foot rows and 3D UVs are unchanged.",
        "sheets": sheets,
    }
    # indent=1, ASCII-escaped, no trailing newline: byte-for-byte the shape the
    # shipped manifest already has, so the diff is the encoding block alone.
    data = json.dumps(manifest, indent=1)
    write_file(path, data.encode("utf-8"))


def ladder_for(args):
    return [args.quality] + [q for q in QUALITY_LADDER if q > args.quality]


if __name__ == "__main__":
    sys.exit(main())
