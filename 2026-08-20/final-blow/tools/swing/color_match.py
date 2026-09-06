"""Pull a candidate sheet's costume colours onto the reference sheet's.
Soft per-cluster LAB mean shift: each opaque candidate pixel is assigned
membership over the reference's dominant colour clusters (inverse-distance,
two nearest), and the per-cluster mean offsets (reference mean - candidate mean)
are applied weighted by membership. Small, smooth, edge-free: fringes and
antialiasing keep their gradients because the shift is a low-order colour
correction, not a re-quantisation. Usage:
  color_match.py <ref sheet> <cand rgba png> <out rgba png> [max_shift_dE]"""
import sys, numpy as np
from PIL import Image
from measure_de import load, to_lab, clusters

def from_lab(lab):
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    fy = (L + 16) / 116; fx = fy + a / 500; fz = fy - b / 200
    def finv(f): return np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787)
    xyz = np.stack([finv(fx) * 0.95047, finv(fy), finv(fz) * 1.08883], -1)
    M = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
    rgb = xyz @ M.T
    rgb = np.where(rgb <= 0.0031308, 12.92 * rgb, 1.055 * np.power(np.clip(rgb, 0, None), 1 / 2.4) - 0.055)
    return np.clip(rgb * 255, 0, 255)

if __name__ == "__main__":
    ref, cand, out = sys.argv[1], sys.argv[2], sys.argv[3]
    max_shift = float(sys.argv[4]) if len(sys.argv) > 4 else 12.0
    ref_rgb, ref_mask = load(ref); cent, w = clusters(to_lab(ref_rgb), ref_mask, k=6)
    im = Image.open(cand).convert("RGBA"); arr = np.asarray(im).astype(np.float32)
    rgb, alpha = arr[..., :3], arr[..., 3]
    lab = to_lab(rgb)
    mask = alpha > 8
    pts = lab[mask]
    d = np.sqrt(((pts[:, None, :] - cent[None]) ** 2).sum(-1))
    ids = d.argmin(1)
    # per-cluster offsets from hard assignment
    offsets = np.zeros_like(cent)
    for i in range(len(cent)):
        sel = pts[ids == i]
        if len(sel) >= 200:
            off = cent[i] - sel.mean(0)
            n = np.sqrt((off ** 2).sum())
            if n > max_shift: off = off * (max_shift / n)
            offsets[i] = off
    # soft membership over the two nearest clusters
    order = np.argsort(d, axis=1)[:, :2]
    d0 = np.take_along_axis(d, order[:, :1], 1)[:, 0]; d1 = np.take_along_axis(d, order[:, 1:2], 1)[:, 0]
    w0 = (d1 + 1e-3) / (d0 + d1 + 2e-3); w1 = 1 - w0
    shift = offsets[order[:, 0]] * w0[:, None] + offsets[order[:, 1]] * w1[:, None]
    lab[mask] = pts + shift
    rgb_out = from_lab(lab)
    res = np.dstack([rgb_out, alpha]).astype(np.uint8)
    res[alpha == 0] = 0
    Image.fromarray(res, "RGBA").save(out)
    print("offsets (L,a,b) per cluster:", np.round(offsets, 1).tolist())
