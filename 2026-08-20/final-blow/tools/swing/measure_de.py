"""Costume-consistency gate: mean CIELAB colour of the big costume regions
(dominant hue clusters) per sheet, and dE2000-ish (dE76) between sheets.
Usage: measure_de.py <ref rgba/webp or png-on-magenta> <cand ...>"""
import sys, numpy as np
from PIL import Image

def load(path):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    if alpha.min() > 250:  # flat-keyed png: key magenta
        d = np.sqrt((rgb[..., 0] - 255) ** 2 + rgb[..., 1] ** 2 + (rgb[..., 2] - 255) ** 2)
        alpha = np.where(d > 120, 255.0, 0.0)
    return rgb, alpha > 128

def to_lab(rgb):
    rgb = rgb / 255.0
    m = rgb <= 0.04045
    rgb = np.where(m, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = rgb @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    L = 116 * f[..., 1] - 16; a = 500 * (f[..., 0] - f[..., 1]); b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], -1)

def clusters(lab, mask, k=6, seed=1):
    pts = lab[mask]
    rng = np.random.default_rng(seed)
    sample = pts[rng.choice(len(pts), min(40000, len(pts)), replace=False)]
    cent = sample[rng.choice(len(sample), k, replace=False)]
    for _ in range(25):
        d = ((sample[:, None, :] - cent[None]) ** 2).sum(-1)
        lab_id = d.argmin(1)
        cent = np.stack([sample[lab_id == i].mean(0) if (lab_id == i).any() else cent[i] for i in range(k)])
    d = ((sample[:, None, :] - cent[None]) ** 2).sum(-1); lab_id = d.argmin(1)
    weights = np.bincount(lab_id, minlength=k) / len(sample)
    return cent, weights

if __name__ == "__main__":
    ref_rgb, ref_mask = load(sys.argv[1]); ref_lab = to_lab(ref_rgb)
    cent, w = clusters(ref_lab, ref_mask)
    order = np.argsort(-w); cent, w = cent[order], w[order]
    print("reference clusters (L,a,b,weight):"); 
    for c, ww in zip(cent, w): print("  ", np.round(c, 1), round(float(ww), 3))
    for path in sys.argv[2:]:
        rgb, mask = load(path); lab = to_lab(rgb)
        pts = lab[mask]
        d = ((pts[:, None, :] - cent[None]) ** 2).sum(-1); ids = d.argmin(1)
        out = []
        for i in range(len(cent)):
            sel = pts[ids == i]
            if len(sel) < 200: out.append(None); continue
            out.append(float(np.sqrt(((sel.mean(0) - cent[i]) ** 2).sum())))
        weighted = sum(w[i] * out[i] for i in range(len(cent)) if out[i] is not None) / sum(w[i] for i in range(len(cent)) if out[i] is not None)
        print(path.split('/')[-1], "per-cluster dE:", [None if v is None else round(v, 2) for v in out], "weighted:", round(weighted, 2))
