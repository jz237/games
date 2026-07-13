#!/usr/bin/env node
// v1.10: split each STAND frame into a legless body + a LEG layer (with the foot), so
// grounded birds can WALK on two scissoring puppet legs instead of hopping on one.
// The leg is found as the thin column under the belly: first row below the body's
// widest section whose ink width collapses; everything alpha-connected below within
// that column (±grow) is the leg. Hip = that row's ink centre.
// In:  modern/assets/tex/bird-<v>-stand.png (footed, from restand.mjs)
// Out: bird-<v>-stand.png (legless, overwritten) + bird-<v>-leg.png +
//      tools/shots/leg-meta.inline.js + notes/art-raw/legcut-debug.png
// Run: NODE_PATH=$(npm root -g) node tools/legcut.mjs
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const sharp = require(join(gRoot, 'sharp'));

const texDir = join(root, 'modern/assets/tex');
const rawDir = join(root, 'notes/art-raw');
const VARIANTS = ['p1', 'p2', 'bounder', 'hunter', 'shadow'];
const META = {};
const dbgTiles = [];

for (const v of VARIANTS) {
  const img = await sharp(join(texDir, `bird-${v}-stand.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = img.info;
  const a = (x, y) => img.data[(y * w + x) * 4 + 3];
  // per-row ink extents
  const rows = [];
  for (let y = 0; y < h; y++) {
    let x0 = -1, x1 = -1, n = 0;
    for (let x = 0; x < w; x++) if (a(x, y) > 60) { if (x0 < 0) x0 = x; x1 = x; n++; }
    rows.push({ x0, x1, n });
  }
  let maxN = 0, cy = 0, inkN = 0;
  for (let y = 0; y < h; y++) { maxN = Math.max(maxN, rows[y].n); if (rows[y].n) { cy += y * rows[y].n; inkN += rows[y].n; } }
  cy /= inkN;
  // hip row: first row below the belly where ink width collapses to a thin column
  // bottom-up: start at the foot (last inked row), follow the leg's ink segment upward
  // until it widens into the belly — row-width tests fail when tail feathers hang beside
  // the leg (p2), segment tracing doesn't
  const segsAt = (y) => {
    const out = [];
    let s = -1, last = -10;
    for (let x = 0; x < w; x++) {
      if (a(x, y) > 60) {
        if (x - last > 6) { if (s >= 0) out.push([s, last]); s = x; }
        last = x;
      }
    }
    if (s >= 0) out.push([s, last]);
    return out;
  };
  let bottomY = h - 1;
  while (bottomY > 0 && rows[bottomY].n === 0) bottomY--;
  let cx = (rows[bottomY].x0 + rows[bottomY].x1) / 2, hipY = -1;
  for (let y = bottomY - 2; y > cy; y--) {
    const segs = segsAt(y);
    if (!segs.length) continue;
    let best = segs[0];
    for (const sg of segs) if (Math.abs((sg[0] + sg[1]) / 2 - cx) < Math.abs((best[0] + best[1]) / 2 - cx)) best = sg;
    const wSeg = best[1] - best[0];
    // the claw foot itself can be wide — only test for the belly once past it
    if (bottomY - y > 16 && wSeg > Math.max(34, maxN * 0.28)) { hipY = y + 2; break; }
    cx = (best[0] + best[1]) / 2;
  }
  if (hipY < 0) throw new Error(`no hip found for ${v}`);
  const hipX = cx;
  // leg mask: flood from the hip row's ink downward through alpha (4-conn), clamped to
  // a widening column around the hip so tail feathers can't join
  const leg = new Uint8Array(w * h);
  const stack = [];
  for (let x = rows[hipY].x0; x <= rows[hipY].x1; x++) if (a(x, hipY) > 30) { leg[hipY * w + x] = 1; stack.push(hipY * w + x); }
  while (stack.length) {
    const p = stack.pop();
    const px = p % w, py = (p / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < hipY || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (leg[q] || a(nx, ny) <= 30) continue;
      if (Math.abs(nx - hipX) > 26 + (ny - hipY) * 0.35) continue;
      leg[q] = 1; stack.push(q);
    }
  }
  // split with a 2px feather at the hip
  const legBuf = Buffer.from(img.data), bodyBuf = Buffer.from(img.data);
  let lx0 = w, ly0 = h, lx1 = 0, ly1 = 0;
  for (let p = 0; p < w * h; p++) {
    const py = (p / w) | 0;
    const inLeg = leg[p] && py >= hipY;
    const fe = py < hipY + 2 ? 0.5 : 1;   // soft hip seam
    legBuf[p * 4 + 3] = inLeg ? Math.round(img.data[p * 4 + 3] * fe) : 0;
    if (inLeg && py >= hipY + 2) bodyBuf[p * 4 + 3] = 0;
    if (legBuf[p * 4 + 3] > 4) { const px = p % w; lx0 = Math.min(lx0, px); ly0 = Math.min(ly0, py); lx1 = Math.max(lx1, px); ly1 = Math.max(ly1, py); }
  }
  const pad = 4;
  lx0 = Math.max(0, lx0 - pad); ly0 = Math.max(0, ly0 - pad);
  lx1 = Math.min(w - 1, lx1 + pad); ly1 = Math.min(h - 1, ly1 + pad);
  const lw = lx1 - lx0 + 1, lh = ly1 - ly0 + 1;
  const legC = Buffer.alloc(lw * lh * 4);
  for (let y = 0; y < lh; y++) legBuf.copy(legC, y * lw * 4, ((y + ly0) * w + lx0) * 4, ((y + ly0) * w + lx1 + 1) * 4);
  await sharp(bodyBuf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(join(texDir, `bird-${v}-stand.png`));
  await sharp(legC, { raw: { width: lw, height: lh, channels: 4 } }).png().toFile(join(texDir, `bird-${v}-leg.png`));
  META[v] = { hipX: +hipX.toFixed(1), hipY, leg: { x: lx0, y: ly0, w: lw, h: lh }, w, h };
  console.log(v, `hip (${hipX.toFixed(0)},${hipY})`, `leg ${lw}x${lh}`);
  // debug tile: body grey + leg tinted green at its place
  const dbg = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const ab = bodyBuf[p * 4 + 3], al = legBuf[p * 4 + 3];
    dbg[p * 3] = Math.min(255, bodyBuf[p * 4] * (ab / 255) + legBuf[p * 4] * (al / 255) * 0.4);
    dbg[p * 3 + 1] = Math.min(255, bodyBuf[p * 4 + 1] * (ab / 255) + 200 * (al / 255));
    dbg[p * 3 + 2] = Math.min(255, bodyBuf[p * 4 + 2] * (ab / 255) + legBuf[p * 4 + 2] * (al / 255) * 0.4);
  }
  dbgTiles.push(await sharp(dbg, { raw: { width: w, height: h, channels: 3 } }).resize(210).png().toBuffer());
}
fs.writeFileSync(join(root, 'tools/shots/leg-meta.inline.js'), 'const STAND_LEG = ' + JSON.stringify(META) + ';\n');
{
  const metas = await Promise.all(dbgTiles.map(t => sharp(t).metadata()));
  const H = Math.max(...metas.map(m => m.height)) + 12;
  const comps = []; let xo = 4;
  dbgTiles.forEach((t, i) => { comps.push({ input: t, left: xo, top: 6 }); xo += metas[i].width + 8; });
  await sharp({ create: { width: xo, height: H, channels: 3, background: 'black' } })
    .composite(comps).png().toFile(join(rawDir, 'legcut-debug.png'));
}
console.log('leg layers cut; meta written');
