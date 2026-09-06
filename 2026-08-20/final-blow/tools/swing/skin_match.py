"""Skin-targeted colour transfer: pull a sheet's SKIN pixels (LAB gate) onto a
reference sheet's skin mean, softly by distance to the sheet's own skin mean,
leaving costume, hair and props alone. Usage: skin_match.py <ref> <cand> <out>"""
import sys, numpy as np
from PIL import Image
from measure_de import to_lab
from color_match import from_lab

def skin_gate(lab):
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    return (A > 6) & (A < 28) & (B > 8) & (B < 38) & (L > 20) & (L < 80) & (B < A * 2.6 + 4)

if __name__ == "__main__":
    ref, cand, out = sys.argv[1:4]
    r = np.asarray(Image.open(ref).convert("RGBA")).astype(np.float32); rl = to_lab(r[..., :3]); rm = (r[..., 3] > 200) & skin_gate(rl)
    ref_mean = rl[rm].mean(0)
    c = np.asarray(Image.open(cand).convert("RGBA")).astype(np.float32); cl = to_lab(c[..., :3]); cm = (c[..., 3] > 8) & skin_gate(cl)
    cand_mean = cl[cm].mean(0)
    offset = ref_mean - cand_mean
    d = np.sqrt(((cl - cand_mean) ** 2).sum(-1))
    weight = np.clip(1 - (d - 8) / 22, 0, 1) * (c[..., 3] > 8)
    # Only warm, skin-plausible pixels may move at all (never the yellow suit, red beanie, gold chain).
    plaus = (cl[..., 1] > 2) & (cl[..., 1] < 34) & (cl[..., 2] > 4) & (cl[..., 2] < 44) & (cl[..., 0] > 15) & (cl[..., 0] < 85)
    weight = weight * plaus
    lab_out = cl + offset[None, None, :] * weight[..., None]
    rgb = from_lab(lab_out)
    res = np.dstack([rgb, c[..., 3]]).astype(np.uint8); res[c[..., 3] == 0] = 0
    Image.fromarray(res, "RGBA").save(out)
    print("ref skin", np.round(ref_mean, 1).tolist(), "cand skin", np.round(cand_mean, 1).tolist(), "offset", np.round(offset, 1).tolist(), "moved px", int((weight > 0.3).sum()))
