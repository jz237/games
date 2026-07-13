#!/usr/bin/env node
// Puppet pipeline step 2 (v1.8): split each COMMITTED painted flap frame into a BODY layer
// and a rotating WING layer, using the re-staged 3D sheets as per-pixel wing/body labels.
//   wing mask  = diff(staged full, staged wings-hidden)  — occlusion-correct by construction
//   alignment  = per-frame TRANSLATION registration (staged cells drift 1-3px between runs
//                and bottom-row crops were clamped at the sheet edge — box math can't be
//                reproduced exactly; silhouette registration is drift-proof)
//   labelling  = nearest staged label (handles repaints growing ~35% past staged silhouettes)
//   body       = art-phase painting minus wing, holes filled from the opposite phase
//   wing       = art-phase wing pixels + a root disc at the shoulder (seam stays covered)
//   curve      = per-phase apparent wing angle+length around the shoulder pivot (drives playback)
// In:  tools/shots/pup-*.png + pup-cells.json, modern/assets/tex/bird-*-f*.png (committed)
// Out: modern/assets/tex/bird-<v>-body.png / -wing.png (+ ptero -body-atk.png),
//      tools/shots/puppet-meta.inline.js, notes/art-raw/puppet-debug-<v>.png
// Run: NODE_PATH=$(npm root -g) node tools/puppet-slice.mjs
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const sharp = require(join(gRoot, 'sharp'));

const shots = join(root, 'tools/shots');
const texDir = join(root, 'modern/assets/tex');
const rawDir = join(root, 'notes/art-raw');
const { cells, pivots } = JSON.parse(fs.readFileSync(join(shots, 'pup-cells.json'), 'utf8'));
// analytic apparent wing motion (projected bone sweep) — see puppet-bones.mjs
const BONES = JSON.parse(fs.readFileSync(join(shots, 'puppet-bones.json'), 'utf8'));

// EXTRA must cover BOTH cross-run cell drift (1-3px) AND the repaint's own content drift
// inside the sheet — measured up to ~36px vertically on lower rows (the v1.7 sprites were
// position-jittering frame-to-frame because of this; registration absorbs it).
const PAD = 90, EXTRA = 60;
const bigBox = c => {
  const x = Math.max(0, Math.round(c.x - PAD) - EXTRA), y = Math.max(0, Math.round(c.y - PAD) - EXTRA);
  return { x, y, w: Math.min(1280 - x, Math.round(c.w + PAD * 2) + EXTRA * 2), h: Math.min(720 - y, Math.round(c.h + PAD * 2) + EXTRA * 2) };
};
const rawCrop = async (img, r) => img.extract({ left: r.x, top: r.y, width: r.w, height: r.h })
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

// multi-source integer BFS distance over a w*h grid from all seed pixels
function distMap(seedMask, w, h) {
  const d = new Float32Array(w * h).fill(1e9);
  const qx = new Int32Array(w * h), qy = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (let p = 0; p < w * h; p++) if (seedMask[p]) { d[p] = 0; qx[tail] = p % w; qy[tail] = (p / w) | 0; tail++; }
  while (head < tail) {
    const x = qx[head], y = qy[head]; head++;
    const dd = d[y * w + x] + 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const p = ny * w + nx;
      if (d[p] > dd) { d[p] = dd; qx[tail] = nx; qy[tail] = ny; tail++; }
    }
  }
  return d;
}

const VARIANTS = [
  { name: 'p1', n: 8 }, { name: 'p2', n: 8 }, { name: 'bounder', n: 8 },
  { name: 'hunter', n: 8 }, { name: 'shadow', n: 8 }, { name: 'ptero', n: 6, atk: [6, 7] },
];

const META = {};
let texTotal = 0;
for (const V of VARIANTS) {
  const full = sharp(join(shots, `pup-${V.name}.png`));
  const now = sharp(join(shots, `pup-${V.name}-norear.png`));
  const nok = sharp(join(shots, `pup-${V.name}-nok.png`));
  const nAll = V.atk ? 8 : V.n;
  const ph = [];
  for (let i = 0; i < nAll; i++) {
    const cell = cells[`${V.name}-f${i}`];
    const mb = bigBox(cell);
    const [sf, sn, sk] = [await rawCrop(full.clone(), mb), await rawCrop(now.clone(), mb), await rawCrop(nok.clone(), mb)];
    const painted = await sharp(join(texDir, `bird-${V.name}-f${i}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pw = painted.info.width, phh = painted.info.height;
    const bw = mb.w, bh = mb.h, NB = bw * bh;
    const Fbig = new Uint8Array(NB), Wbig = new Uint8Array(NB);
    for (let p = 0; p < NB; p++) {
      const lf = Math.max(sf.data[p * 4], sf.data[p * 4 + 1], sf.data[p * 4 + 2]);
      const df = Math.max(Math.abs(sf.data[p * 4] - sn.data[p * 4]),
        Math.abs(sf.data[p * 4 + 1] - sn.data[p * 4 + 1]), Math.abs(sf.data[p * 4 + 2] - sn.data[p * 4 + 2]));
      Fbig[p] = lf > 10 ? 1 : 0;
      Wbig[p] = df > 14 ? 1 : 0;
    }
    // similarity registration (translation + uniform scale): map painted → staged as
    // T(p) = (p − c0)·s + c0 + (tx,ty), maximise silhouette agreement. The repaint grew
    // some figures (ptero ~25%) so translation alone can't align them.
    const pts = [];
    let c0x = 0, c0y = 0;
    for (let y = 0; y < phh; y += 2) for (let x = 0; x < pw; x += 2)
      if (painted.data[(y * pw + x) * 4 + 3] > 60) { pts.push(y * pw + x); c0x += x; c0y += y; }
    c0x /= pts.length; c0y /= pts.length;
    let aF = 0;
    for (let p = 0; p < NB; p++) aF += Fbig[p];
    const maxOx = EXTRA * 2, maxOy = EXTRA * 2;
    const scaled = s => pts.map(p => {
      const x = (p % pw - c0x) * s + c0x, y = (((p / pw) | 0) - c0y) * s + c0y;
      return [Math.round(x), Math.round(y)];
    });
    // IoU, not hit-count: a one-sided score collapses the scale (shrink until every
    // painted point lands inside the bigger staged blob). Each stride-2 point ≈ 4 painted
    // px ≈ 4s² staged px; I = 4s²·hits·step, U = Ap·s² + AF − I.
    const score = (sp, s, tx, ty, step) => {
      let hits = 0;
      for (let k = 0; k < sp.length; k += step) {
        const x = sp[k][0] + tx, y = sp[k][1] + ty;
        if (x >= 0 && y >= 0 && x < bw && y < bh && Fbig[y * bw + x]) hits++;
      }
      const I = 4 * s * s * hits * step;
      return I / (pts.length * 4 * s * s + aF - I);
    };
    let best = -1e18, ox = 0, oy = 0, sc = 1;
    for (const s of [0.64, 0.7, 0.76, 0.82, 0.88, 0.94, 1, 1.06]) {
      const sp = scaled(s);
      for (let ty = -20; ty <= maxOy; ty += 2) for (let tx = -20; tx <= maxOx; tx += 2) {
        const v2 = score(sp, s, tx, ty, 2);
        if (v2 > best) { best = v2; ox = tx; oy = ty; sc = s; }
      }
    }
    {
      let bestF = -1e18, fx = ox, fy = oy, fsc = sc;
      for (const s of [sc - 0.03, sc, sc + 0.03]) {
        const sp = scaled(s);
        for (let ty = oy - 2; ty <= oy + 2; ty++) for (let tx = ox - 2; tx <= ox + 2; tx++) {
          const v2 = score(sp, s, tx, ty, 1);
          if (v2 > bestF) { bestF = v2; fx = tx; fy = ty; fsc = s; }
        }
      }
      ox = fx; oy = fy; sc = fsc;
    }
    // labels in painted-canvas space: sample the staged crops through T
    const N = pw * phh;
    const W = new Uint8Array(N), F = new Uint8Array(N), B = new Uint8Array(N), Fnow = new Uint8Array(N), KZ = new Uint8Array(N);
    let inter = 0, pcnt = 0;
    for (let y = 0; y < phh; y++) for (let x = 0; x < pw; x++) {
      const p = y * pw + x;
      const qx = Math.round((x - c0x) * sc + c0x) + ox, qy = Math.round((y - c0y) * sc + c0y) + oy;
      const ok = qx >= 0 && qy >= 0 && qx < bw && qy < bh;
      const q = qy * bw + qx;
      F[p] = ok ? Fbig[q] : 0;
      const wfull = ok ? Wbig[q] : 0;
      // the rear-less silhouette: where the staged rear mass merely OCCLUDES it, the
      // repaint painted BODY (paintings always show the fan extended clear) — so
      // wing seeds are ONLY the clear part of the staged wing+tail
      Fnow[p] = ok ? (Math.max(sn.data[q * 4], sn.data[q * 4 + 1], sn.data[q * 4 + 2]) > 10 ? 1 : 0) : 0;
      // knight+lance zone: hard veto — these pixels may NEVER join the wing layer
      KZ[p] = ok ? (Math.max(Math.abs(sn.data[q * 4] - sk.data[q * 4]),
        Math.abs(sn.data[q * 4 + 1] - sk.data[q * 4 + 1]),
        Math.abs(sn.data[q * 4 + 2] - sk.data[q * 4 + 2])) > 14 ? 1 : 0) : 0;
      W[p] = wfull && !Fnow[p] && !KZ[p] ? 1 : 0;
      B[p] = (wfull && !KZ[p]) ? 0 : Fnow[p];   // confident body; knight zone always body
      if (painted.data[p * 4 + 3] > 60) { pcnt++; if (F[p]) inter++; }
    }
    // pivot into painted-canvas coords: inverse of T
    const pv = pivots[V.name][i];
    const px = ((pv.px - mb.x - ox) - c0x) / sc + c0x, py = ((pv.py - mb.y - oy) - c0y) / sc + c0y;
    ph.push({
      i, w: pw, h: phh, mb, ox, oy, sc, c0x, c0y, cell, painted, W, F, B, Fnow, KZ, px, py,
      cellCx: cell.x + cell.w / 2, cellCy: cell.y + cell.h / 2,
      wingArea: W.reduce((a2, v2) => a2 + v2, 0),
      reg: inter / pcnt,
    });
  }
  // art phase: the wing that is BIG and CLEAR OF THE BODY. Where the staged wing crosses
  // in front of the torso/knight, the repaint painted BODY there (it always shows the wing
  // extended back) — label transfer in that zone cuts knight/lance chunks into the wing
  // layer. Score = wing pixels outside the wingless silhouette − 4× wing pixels over it.
  const cyc = ph.slice(0, V.n);
  // W is clear-only and knight-vetoed; the biggest clear fan wins
  console.log(V.name, 'clear fan px', cyc.map(P => `f${P.i}:${(P.wingArea / 1000).toFixed(1)}k`).join(' '));
  const A = cyc.reduce((a2, P) => (P.wingArea > a2.wingArea ? P : a2), cyc[0]);
  const Bfill = cyc[(A.i + Math.round(V.n / 2)) % V.n];
  console.log(V.name, 'art f' + A.i, 'fill f' + Bfill.i,
    'reg%', ph.map(p => (p.reg * 100).toFixed(0)).join(','),
    'sc', ph.map(p => p.sc.toFixed(2)).join(','));
  // only the frames we actually cut from need a solid registration; the ptero repaint
  // reshaped the monster (sleeker body, new membrane forms) so ~50% is its honest ceiling —
  // the debug recombine sheet is the real gate there
  const regMin = V.atk ? 0.42 : 0.5;
  for (const P of [A, Bfill, ...(V.atk ? [ph[V.atk[0]]] : [])])
    if (P.reg < regMin) throw new Error(`REGISTER FAIL ${V.name}-f${P.i}: overlap ${(P.reg * 100).toFixed(0)}%`);
  // bone curve samples are 2x the staged phase density: staged f_i ↔ curve[2i]
  const bone = BONES[V.name];
  const artK = 2 * A.i;

  // classify painted pixels by GEODESIC distance through painted content: feather pixels
  // connect to the fan tips through feathers (cost 1), while crossing transparent gaps
  // costs 6 — so the ambiguous fan-over-silhouette band resolves along the artwork's own
  // connectivity instead of straight-line proximity.
  const geo = (P, seeds) => {
    const N = P.w * P.h;
    const dist = new Float32Array(N).fill(1e9);
    const buckets = [];
    const push = (p, d) => { (buckets[d] ||= []).push(p); };
    for (let p = 0; p < N; p++) if (seeds[p] && P.painted.data[p * 4 + 3] > 32) { dist[p] = 0; push(p, 0); }
    for (let d = 0; d < 4000; d++) {
      const bk = buckets[d];
      if (!bk) continue;
      for (const p of bk) {
        if (dist[p] < d) continue;
        const x = p % P.w, y = (p / P.w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= P.w || ny >= P.h) continue;
          const q = ny * P.w + nx;
          const nd = d + (P.painted.data[q * 4 + 3] > 32 ? 1 : 6);
          if (nd < dist[q]) { dist[q] = nd; push(q, nd); }
        }
      }
      buckets[d] = null;
    }
    return dist;
  };
  const split = (P) => {
    const N = P.w * P.h;
    const dW = geo(P, P.W), dB = geo(P, P.B);
    const wf = new Float32Array(N);
    for (let p = 0; p < N; p++) {
      if (P.painted.data[p * 4 + 3] === 0) continue;
      if (P.KZ[p]) continue;   // knight+lance: never wing
      wf[p] = Math.max(0, Math.min(1, (dB[p] - dW[p]) / 10 + 0.5));   // 10px feather band
    }
    return wf;
  };

  const wfA = split(A), wfB = split(Bfill);
  const w = A.w, h = A.h, N = w * h;
  // map a pixel of frame P to the same cell-relative position in frame Bfill,
  // through both frames' similarity transforms (painted→staged sheet→painted)
  const mapToFill = (P, x, y) => {
    const shX = (x - P.c0x) * P.sc + P.c0x + P.ox + P.mb.x - P.cellCx + Bfill.cellCx;
    const shY = (y - P.c0y) * P.sc + P.c0y + P.oy + P.mb.y - P.cellCy + Bfill.cellCy;
    return [Math.round(((shX - Bfill.mb.x - Bfill.ox) - Bfill.c0x) / Bfill.sc + Bfill.c0x),
            Math.round(((shY - Bfill.mb.y - Bfill.oy) - Bfill.c0y) / Bfill.sc + Bfill.c0y)];
  };
  const buildBody = (P, wfP) => {
    const body = Buffer.from(P.painted.data);
    for (let p = 0; p < P.w * P.h; p++) {
      const a0 = body[p * 4 + 3];
      if (!a0) continue;
      const cut = wfP[p];
      if (cut <= 0) continue;
      const [bx, by] = mapToFill(P, p % P.w, (p / P.w) | 0);
      let fr = 0, fg = 0, fb = 0, fa = 0;
      if (bx >= 0 && by >= 0 && bx < Bfill.w && by < Bfill.h) {
        const q = by * Bfill.w + bx;
        fa = Bfill.painted.data[q * 4 + 3] / 255 * (1 - wfB[q]);
        fr = Bfill.painted.data[q * 4]; fg = Bfill.painted.data[q * 4 + 1]; fb = Bfill.painted.data[q * 4 + 2];
      }
      const keep = (a0 / 255) * (1 - cut), add = fa * cut;
      const outA = keep + add * (1 - keep);
      if (outA <= 0.003) { body[p * 4 + 3] = 0; continue; }
      body[p * 4] = Math.round((body[p * 4] * keep + fr * add * (1 - keep)) / outA);
      body[p * 4 + 1] = Math.round((body[p * 4 + 1] * keep + fg * add * (1 - keep)) / outA);
      body[p * 4 + 2] = Math.round((body[p * 4 + 2] * keep + fb * add * (1 - keep)) / outA);
      body[p * 4 + 3] = Math.round(outA * 255);
    }
    // dilation-fill: the fan zone exists in EVERY painting, so cross-phase fill can't
    // recover "rump under the feathers" — smear nearby body colour into the remaining
    // hole, fading out, so wing rotation reveals an organic under-feather shade
    // instead of a hard-edged gap. Only inside the rear-less silhouette (Fnow).
    for (let it = 0; it < 12; it++) {
      const src = Buffer.from(body);
      for (let p = 0; p < P.w * P.h; p++) {
        if (src[p * 4 + 3] > 40 || !P.Fnow[p] || wfP[p] <= 0.4) continue;
        const x = p % P.w, y = (p / P.w) | 0;
        let r = 0, g2 = 0, b2 = 0, a2 = 0, n2 = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= P.w || ny >= P.h) continue;
          const q = (ny * P.w + nx) * 4;
          if (src[q + 3] > 40) { r += src[q]; g2 += src[q + 1]; b2 += src[q + 2]; a2 += src[q + 3]; n2++; }
        }
        if (n2) {
          body[p * 4] = Math.round(r / n2 * 0.93); body[p * 4 + 1] = Math.round(g2 / n2 * 0.93);
          body[p * 4 + 2] = Math.round(b2 / n2 * 0.93); body[p * 4 + 3] = Math.round(a2 / n2 * 0.9);
        }
      }
    }
    return body;
  };
  const body = buildBody(A, wfA);
  // WING: art wing pixels; the hinge is the measured SEAM between wing and body labels
  // (the fan's natural attachment), not the staged shoulder — painted proportions differ
  const wing = Buffer.from(A.painted.data);
  let wx0 = w, wy0 = h, wx1 = 0, wy1 = 0;
  let smx = 0, smy = 0, smn = 0;
  for (let p = 0; p < N; p++) {
    const a = (A.painted.data[p * 4 + 3] / 255) * wfA[p];
    wing[p * 4 + 3] = Math.round(a * 255);
    if (wing[p * 4 + 3] > 4) { wx0 = Math.min(wx0, p % w); wy0 = Math.min(wy0, (p / w) | 0); wx1 = Math.max(wx1, p % w); wy1 = Math.max(wy1, (p / w) | 0); }
    if (wfA[p] > 0.5 && A.painted.data[p * 4 + 3] > 60) {
      const x = p % w, y = (p / w) | 0;
      let seam = false;
      for (let dy = -2; dy <= 2 && !seam; dy++) for (let dx = -2; dx <= 2 && !seam; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (wfA[q] < 0.5 && A.painted.data[q * 4 + 3] > 60) seam = true;
      }
      if (seam) { smx += x; smy += y; smn++; }
    }
  }
  const hingeX = smn > 30 ? smx / smn : A.px, hingeY = smn > 30 ? smy / smn : A.py;
  console.log(V.name, 'hinge', hingeX.toFixed(0) + ',' + hingeY.toFixed(0),
    '(staged shoulder', A.px.toFixed(0) + ',' + A.py.toFixed(0) + `, seam n=${smn})`);
  // keep only the largest connected wing component (plus its soft halo) — faint
  // plume/edge ghosts elsewhere would visibly rotate with the wing
  {
    const lab = new Int32Array(N).fill(-1);
    const sizes = [];
    for (let p = 0; p < N; p++) {
      if (wing[p * 4 + 3] <= 30 || lab[p] !== -1) continue;
      const id2 = sizes.length;
      let cnt = 0;
      const stack = [p]; lab[p] = id2;
      while (stack.length) {
        const q = stack.pop(); cnt++;
        const qx = q % w, qy = (q / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const r2 = ny * w + nx;
          if (lab[r2] === -1 && wing[r2 * 4 + 3] > 30) { lab[r2] = id2; stack.push(r2); }
        }
      }
      sizes.push(cnt);
    }
    let big = 0;
    for (let s2 = 1; s2 < sizes.length; s2++) if (sizes[s2] > sizes[big]) big = s2;
    // halo pass: soft pixels survive only within 3px of the kept component
    const keepD = distMap(Uint8Array.from({ length: N }, (_, p) => (lab[p] === big ? 1 : 0)), w, h);
    for (let p = 0; p < N; p++) if (keepD[p] > 3) wing[p * 4 + 3] = 0;
    // recompute the crop bbox now that the ghosts are gone
    wx0 = w; wy0 = h; wx1 = 0; wy1 = 0;
    for (let p = 0; p < N; p++) if (wing[p * 4 + 3] > 4) {
      wx0 = Math.min(wx0, p % w); wy0 = Math.min(wy0, (p / w) | 0);
      wx1 = Math.max(wx1, p % w); wy1 = Math.max(wy1, (p / w) | 0);
    }
  }
  const wpad = 6;
  wx0 = Math.max(0, wx0 - wpad); wy0 = Math.max(0, wy0 - wpad);
  wx1 = Math.min(w - 1, wx1 + wpad); wy1 = Math.min(h - 1, wy1 + wpad);
  const ww = wx1 - wx0 + 1, wh = wy1 - wy0 + 1;
  const wingC = Buffer.alloc(ww * wh * 4);
  for (let y = 0; y < wh; y++) wing.copy(wingC, y * ww * 4, ((y + wy0) * w + wx0) * 4, ((y + wy0) * w + wx1 + 1) * 4);

  await sharp(body, { raw: { width: w, height: h, channels: 4 } }).png().toFile(join(texDir, `bird-${V.name}-body.png`));
  await sharp(wingC, { raw: { width: ww, height: wh, channels: 4 } }).png().toFile(join(texDir, `bird-${V.name}-wing.png`));

  // ptero attack body: open-beak frame minus wing, filled from the closed opposite phase
  // plane metrics through the similarity transform: painted length L ↔ staged L·sc ↔
  // world L·sc·(planeW_cell/cell.w); feet line mapped painted-space via T⁻¹.
  // K calibrates to the OWNER-APPROVED v1.7 visual size: mean painted content width
  // across the cycle × the legacy plane constants (incl. the ×0.8 player / ×0.7 ptero
  // relative sizes he tuned). Per-frame sc jitter (0.61–0.88!) also means v1.7 birds
  // were size-pulsing frame to frame — K + one art frame kills that too.
  const LEGACY = V.atk ? 148.945 * 0.7 : (V.name === 'p1' || V.name === 'p2') ? 85.45 * 0.8 : 85.45;
  const contentW = (P) => {
    let x0 = P.w, x1 = 0;
    for (let p = 0; p < P.w * P.h; p++) if (P.painted.data[p * 4 + 3] > 60) { const x = p % P.w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    return Math.max(1, x1 - x0);
  };
  const v17meanW = cyc.reduce((s2, P) => s2 + LEGACY * contentW(P) / P.w, 0) / cyc.length;
  const rawPlaneW = A.cell.planeW * A.w * A.sc / A.cell.w;
  const K = v17meanW / (rawPlaneW * contentW(A) / A.w);
  const metrics = (P) => ({
    w: P.w, h: P.h,
    planeW: +(P.cell.planeW * P.w * P.sc / P.cell.w * K).toFixed(3),
    planeH: +(P.cell.planeH * P.h * P.sc / P.cell.h * K).toFixed(3),
    feetFrac: +(((((P.cell.y + P.cell.feetFrac * P.cell.h) - P.mb.y - P.oy) - P.c0y) / P.sc + P.c0y) / P.h).toFixed(4),
  });
  console.log(V.name, 'size calib K', K.toFixed(3), '→ planeW', (rawPlaneW * K).toFixed(1), '(legacy', LEGACY.toFixed(1) + ')');
  if (V.atk) {
    const AT = ph[V.atk[0]];
    const wfT = split(AT);
    const atkBody = buildBody(AT, wfT);
    await sharp(atkBody, { raw: { width: AT.w, height: AT.h, channels: 4 } }).png().toFile(join(texDir, `bird-${V.name}-body-atk.png`));
    META[V.name + 'Atk'] = metrics(AT);
    texTotal += fs.statSync(join(texDir, `bird-${V.name}-body-atk.png`)).size;
  }

  META[V.name] = {
    art: A.i, n: V.n, artK,
    body: metrics(A),
    wing: { x: wx0, y: wy0, w: ww, h: wh },
    pivot: { x: +hingeX.toFixed(1), y: +hingeY.toFixed(1) },
    // analytic bone sweep, normalised to the art phase; runtime samples this cyclically
    curve: bone.curve.map(c => ({ a: c.a, l: +(c.l / bone.curve[artK].l).toFixed(3) })),
  };
  for (const f of [`bird-${V.name}-body.png`, `bird-${V.name}-wing.png`]) texTotal += fs.statSync(join(texDir, f)).size;

  // debug sheet: recombined puppet at each cycle phase (top) vs original painting (bottom)
  const dbg = Buffer.alloc(w * V.n * h * 2 * 4);
  const put = (buf, bw2, bh2, col, row) => {
    for (let y = 0; y < Math.min(bh2, h); y++) for (let x = 0; x < Math.min(bw2, w); x++) {
      const s = (y * bw2 + x) * 4, d = ((row * h + y) * w * V.n + col * w + x) * 4;
      const a = buf[s + 3] / 255;
      dbg[d] = Math.round(buf[s] * a); dbg[d + 1] = Math.round(buf[s + 1] * a); dbg[d + 2] = Math.round(buf[s + 2] * a); dbg[d + 3] = 255;
    }
  };
  for (let i = 0; i < V.n; i++) {
    const P = cyc[i];
    const frame = Buffer.from(body);
    const dth = bone.curve[2 * i].a - bone.curve[artK].a, sc2 = bone.curve[2 * i].l / bone.curve[artK].l;
    // canvas y-down: math rot +dth = canvas rot −dth; inverse sampling = canvas rot +dth
    const cos = Math.cos(dth) / sc2, sin = Math.sin(dth) / sc2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const rx = x - hingeX, ry = y - hingeY;
      const sxp = Math.round(hingeX + rx * cos - ry * sin) - wx0, syp = Math.round(hingeY + rx * sin + ry * cos) - wy0;
      if (sxp < 0 || syp < 0 || sxp >= ww || syp >= wh) continue;
      const s = (syp * ww + sxp) * 4;
      const a = wingC[s + 3] / 255;
      if (a < 0.02) continue;
      const d = (y * w + x) * 4;
      const ba = frame[d + 3] / 255, oa = a + ba * (1 - a);
      frame[d] = Math.round((wingC[s] * a + frame[d] * ba * (1 - a)) / (oa || 1));
      frame[d + 1] = Math.round((wingC[s + 1] * a + frame[d + 1] * ba * (1 - a)) / (oa || 1));
      frame[d + 2] = Math.round((wingC[s + 2] * a + frame[d + 2] * ba * (1 - a)) / (oa || 1));
      frame[d + 3] = Math.round(oa * 255);
    }
    put(frame, w, h, i, 0);
    put(P.painted.data, P.w, P.h, i, 1);
  }
  await sharp(dbg, { raw: { width: w * V.n, height: h * 2, channels: 4 } }).png().toFile(join(rawDir, `puppet-debug-${V.name}.png`));
}

fs.writeFileSync(join(shots, 'puppet-meta.inline.js'), 'const PUPPET = ' + JSON.stringify(META) + ';\n');
console.log('tex payload (body+wing+atk):', Math.round(texTotal / 1024) + 'KB');
console.log('wrote puppet-meta.inline.js + debug sheets in notes/art-raw/');
