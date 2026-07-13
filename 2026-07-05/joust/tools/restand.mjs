#!/usr/bin/env node
// v1.9: re-slice the 5 STAND frames from the archived painted sheets. The v1.5 slicer's
// keep-largest-component step ATE THE FEET (thin shin pixels disconnect the foot blob) —
// the paintings have full clawed feet. Fix: morphological close r3 BEFORE labelling, then
// keep the largest component PLUS any component within 8px of it (bridges hairline gaps).
// Crop boxes reproduce the v1.5 math exactly so canvas geometry (and BIRD_SPRITE meta)
// stay untouched — asserted against the committed PNG dims.
// In:  notes/art-raw/birds-painted{1,2}.png + birds-cells.json
// Out: modern/assets/tex/bird-<v>-stand.png (overwrites)
// Run: NODE_PATH=$(npm root -g) node tools/restand.mjs
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const sharp = require(join(gRoot, 'sharp'));

const rawDir = join(root, 'notes/art-raw');
const texDir = join(root, 'modern/assets/tex');
const cellsJson = JSON.parse(fs.readFileSync(join(rawDir, 'birds-cells.json'), 'utf8'));
const cells = cellsJson.cells || cellsJson;
const SHEET_FILE = { 'birds-sheet1': 'birds-painted1.png', 'birds-sheet2': 'birds-painted2.png' };
const PAD = 90;

function distMap(seed, w, h) {
  const d = new Float32Array(w * h).fill(1e9);
  const qx = new Int32Array(w * h), qy = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (let p = 0; p < w * h; p++) if (seed[p]) { d[p] = 0; qx[tail] = p % w; qy[tail] = (p / w) | 0; tail++; }
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

const standKeys = Object.keys(cells).filter(k => k.endsWith('-stand'));
for (const key of standKeys) {
  const c = cells[key];
  const sheet = await sharp(join(rawDir, SHEET_FILE[c.sheet])).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sx = sheet.info.width / 1280, sy = sheet.info.height / 720;
  const x = Math.max(0, Math.round((c.x - PAD) * sx)), y = Math.max(0, Math.round((c.y - PAD) * sy));
  const w = Math.min(sheet.info.width - x, Math.round((c.w + PAD * 2) * sx));
  const h = Math.min(sheet.info.height - y, Math.round((c.h + PAD * 2) * sy));
  const cur = await sharp(join(texDir, `bird-${key}.png`)).metadata();
  if (Math.abs(cur.width - w) > 1 || Math.abs(cur.height - h) > 1)
    throw new Error(`BOX MISMATCH ${key}: recomputed ${w}x${h} vs committed ${cur.width}x${cur.height}`);
  const W = cur.width, H = cur.height, N = W * H;
  // crop (absorb ±1 rounding by using the committed dims)
  const crop = Buffer.alloc(N * 4);
  for (let yy = 0; yy < H; yy++)
    sheet.data.copy(crop, yy * W * 4, ((y + yy) * sheet.info.width + x) * 4, ((y + yy) * sheet.info.width + x + W) * 4);
  // luma key (same bands as v1.6 slicer)
  const alpha = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    const m = Math.max(crop[p * 4], crop[p * 4 + 1], crop[p * 4 + 2]);
    alpha[p] = m <= 5 ? 0 : m >= 22 ? 255 : (m - 5) * (255 / 17);
  }
  // Voronoi vs the other cells on the same sheet (kills neighbour bleed)
  const centers = Object.values(cells).filter(o => o.sheet === c.sheet)
    .map(o => [(o.x + o.w / 2) * sx, (o.y + o.h / 2) * sy]);
  const cc = [(c.x + c.w / 2) * sx, (c.y + c.h / 2) * sy];
  // soft Voronoi: the painted leg dangles BELOW the staged cell into the next row's
  // territory (p1's foot sat 16px past the midline and got zeroed for two releases).
  // Keep pixels unless a foreign cell wins by >25px; true neighbour content wins by far.
  for (let p = 0; p < N; p++) {
    const gx = x + (p % W), gy = y + ((p / W) | 0);
    const dOwn = Math.hypot(gx - cc[0], gy - cc[1]);
    let dBest = 1e18;
    for (const [ax, ay] of centers) {
      if (Math.abs(ax - cc[0]) <= 2 && Math.abs(ay - cc[1]) <= 2) continue;
      dBest = Math.min(dBest, Math.hypot(gx - ax, gy - ay));
    }
    if (dBest + 25 < dOwn) alpha[p] = 0;
  }
  // CLOSE r3 BEFORE labelling — seals the thin shin so the foot stays connected
  const dil = new Float32Array(N), closed = new Float32Array(N);
  const R = 4;
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    let mx = 0;
    for (let dy2 = -R; dy2 <= R; dy2++) for (let dx2 = -R; dx2 <= R; dx2++) {
      const ny2 = Math.min(H - 1, Math.max(0, yy + dy2)), nx2 = Math.min(W - 1, Math.max(0, xx + dx2));
      mx = Math.max(mx, alpha[ny2 * W + nx2]);
    }
    dil[yy * W + xx] = mx;
  }
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    let mn = 255;
    for (let dy2 = -R; dy2 <= R; dy2++) for (let dx2 = -R; dx2 <= R; dx2++) {
      const ny2 = Math.min(H - 1, Math.max(0, yy + dy2)), nx2 = Math.min(W - 1, Math.max(0, xx + dx2));
      mn = Math.min(mn, dil[ny2 * W + nx2]);
    }
    closed[yy * W + xx] = Math.max(alpha[yy * W + xx], mn);
  }
  // label on the CLOSED mask; keep largest + anything within 8px of it
  const lab = new Int32Array(N).fill(-1);
  const sizes = [];
  for (let p = 0; p < N; p++) {
    if (closed[p] <= 28 || lab[p] !== -1) continue;
    const id = sizes.length;
    let cnt = 0;
    const stack = [p]; lab[p] = id;
    while (stack.length) {
      const q = stack.pop(); cnt++;
      const qx = q % W, qy = (q / W) | 0;
      for (const [dx2, dy2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx2 = qx + dx2, ny2 = qy + dy2;
        if (nx2 < 0 || ny2 < 0 || nx2 >= W || ny2 >= H) continue;
        const r2 = ny2 * W + nx2;
        if (lab[r2] === -1 && closed[r2] > 28) { lab[r2] = id; stack.push(r2); }
      }
    }
    sizes.push(cnt);
  }
  let big = 0;
  for (let s2 = 1; s2 < sizes.length; s2++) if (sizes[s2] > sizes[big]) big = s2;
  const keepD = distMap(Uint8Array.from({ length: N }, (_, p) => (lab[p] === big ? 1 : 0)), W, H);
  const kept = new Set([big]);
  for (let p = 0; p < N; p++) if (lab[p] >= 0 && lab[p] !== big && keepD[p] <= 40 && sizes[lab[p]] >= 60) kept.add(lab[p]);
  for (let p = 0; p < N; p++) if (!(lab[p] >= 0 && kept.has(lab[p]))) closed[p] = Math.min(closed[p], 0);
  // write
  const out = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) {
    out[p * 4] = crop[p * 4]; out[p * 4 + 1] = crop[p * 4 + 1]; out[p * 4 + 2] = crop[p * 4 + 2];
    out[p * 4 + 3] = Math.round(Math.min(255, closed[p]));
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(join(texDir, `bird-${key}.png`));
  console.log(key, `${W}x${H}`, 'components kept', kept.size, 'of', sizes.length);
}
console.log('stand frames re-sliced with feet');
