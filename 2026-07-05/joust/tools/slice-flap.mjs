#!/usr/bin/env node
// Bird-sprite pipeline step 3 (local): slice each painted bird cell, matte with its mask
// (1px erode + connected-component), save sprite PNGs + inline meta for render3d.js.
// In:  tools/shots/birds-painted<N>.png + birds-mask<N>.png + birds-cells.json
// Out: modern/assets/tex/bird-<key>.png + tools/shots/bird-sprites.inline.js
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));

const meta = JSON.parse(fs.readFileSync(join(root, 'tools/shots/flap-cells.json'), 'utf8'));
const sheets = {};
for (const [key, c] of Object.entries(meta.cells)) (sheets[c.sheet] ||= []).push([key, c]);

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const out = {};
for (const [sheetName, cells] of Object.entries(sheets)) {
  const paintedB64 = fs.readFileSync(join(root, `tools/shots/${sheetName.replace('flap-', 'flap-painted-')}.png`)).toString('base64');
  const res = await page.evaluate(async (paintedB64, cells) => {
    const load = src2 => new Promise((res2, rej) => { const i = new Image(); i.onload = () => res2(i); i.onerror = rej; i.src = 'data:image/png;base64,' + src2; });
    const painted = await load(paintedB64);
    const sx = painted.width / 1280, sy = painted.height / 720;
    const allCenters = cells.map(([, cl]) => [(cl.x + cl.w / 2) * sx, (cl.y + cl.h / 2) * sy]);
    const result = {};
    for (const [key, cell] of cells) {
      const pad = 90;   // repaints grow figures ~35% — cover the full Voronoi region
      const x = Math.max(0, Math.round((cell.x - pad) * sx)), y = Math.max(0, Math.round((cell.y - pad) * sy));
      const w = Math.min(painted.width - x, Math.round((cell.w + pad * 2) * sx));
      const h = Math.min(painted.height - y, Math.round((cell.h + pad * 2) * sy));
      const cc = [(cell.x + cell.w / 2) * sx, (cell.y + cell.h / 2) * sy];
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx2 = c.getContext('2d');
      cx2.drawImage(painted, x, y, w, h, 0, 0, w, h);
      const pd = cx2.getImageData(0, 0, w, h);
      // luma key: measured background ≤8 max-channel; figures ≥ ~15 except a thin band
      const alpha = new Uint8Array(w * h);
      for (let p2 = 0; p2 < w * h; p2++) {
        const m = Math.max(pd.data[p2 * 4], pd.data[p2 * 4 + 1], pd.data[p2 * 4 + 2]);
        alpha[p2] = m <= 8 ? 0 : m >= 26 ? 255 : Math.round((m - 8) * (255 / 18));
      }
      // Voronoi: zero pixels nearer another cell centre (kills neighbour bleed)
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const gx = x + px, gy = y + py;
        let best = 1e18, bx = 0, by = 0;
        for (const [ax, ay] of allCenters) {
          const d = (gx - ax) ** 2 + (gy - ay) ** 2;
          if (d < best) { best = d; bx = ax; by = ay; }
        }
        if (Math.abs(bx - cc[0]) > 2 || Math.abs(by - cc[1]) > 2) alpha[py * w + px] = 0;
      }
      // connected components ≥150px survive (keeps lance tips, drops crumbs)
      const label = new Int32Array(w * h).fill(-1);
      const sizes = [];
      for (let p2 = 0; p2 < w * h; p2++) {
        if (alpha[p2] <= 40 || label[p2] !== -1) continue;
        const id2 = sizes.length; let count = 0;
        const stack = [p2]; label[p2] = id2;
        while (stack.length) {
          const q = stack.pop(); count++;
          const qy = (q / w) | 0, qx = q % w;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx2 = qx + dx, ny2 = qy + dy;
            if (nx2 < 0 || ny2 < 0 || nx2 >= w || ny2 >= h) continue;
            const p3 = ny2 * w + nx2;
            if (label[p3] === -1 && alpha[p3] > 40) { label[p3] = id2; stack.push(p3); }
          }
        }
        sizes.push(count);
      }
      // luma-keyed figures are one solid blob — keep ONLY the largest component
      // (anything else is a neighbour's lance tip that crossed the Voronoi midline)
      let big = -1;
      for (let s2 = 0; s2 < sizes.length; s2++) if (big < 0 || sizes[s2] > sizes[big]) big = s2;
      for (let p2 = 0; p2 < w * h; p2++)
        if (label[p2] !== big) alpha[p2] = 0;
      // morphological close (r=2) — seals armor pinholes without engulfing real gaps
      const dil = new Uint8Array(w * h);
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        let mx = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const yy = Math.min(h - 1, Math.max(0, py + dy)), xx = Math.min(w - 1, Math.max(0, px + dx));
          mx = Math.max(mx, alpha[yy * w + xx]);
        }
        dil[py * w + px] = mx;
      }
      const closed = new Uint8Array(w * h);
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        let mn = 255;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const yy = Math.min(h - 1, Math.max(0, py + dy)), xx = Math.min(w - 1, Math.max(0, px + dx));
          mn = Math.min(mn, dil[yy * w + xx]);
        }
        closed[py * w + px] = Math.max(alpha[py * w + px], mn);
      }
      const outIm = cx2.createImageData(w, h);
      for (let p2 = 0; p2 < w * h; p2++) {
        outIm.data[p2 * 4] = pd.data[p2 * 4]; outIm.data[p2 * 4 + 1] = pd.data[p2 * 4 + 1];
        outIm.data[p2 * 4 + 2] = pd.data[p2 * 4 + 2]; outIm.data[p2 * 4 + 3] = closed[p2];
      }
      cx2.putImageData(outIm, 0, 0);
      result[key] = c.toDataURL('image/png').split(',')[1];
    }
    return result;
  }, paintedB64, cells);
  Object.assign(out, res);
}
await browser.close();

let total = 0;
const keys = Object.keys(out).sort();
for (const key of keys) {
  const p = join(root, 'modern/assets/tex', `bird-${key}.png`);
  fs.writeFileSync(p, Buffer.from(out[key], 'base64'));
  total += fs.statSync(p).size;
  console.log(key.padEnd(16), Math.round(fs.statSync(p).size / 1024) + 'KB');
}
// meta per class, corrected for the 90px crop padding
const adj = c => ({
  planeW: c.planeW * (c.w + 180) / c.w,
  planeH: c.planeH * (c.h + 180) / c.h,
  feetFrac: (90 + c.feetFrac * c.h) / (c.h + 180),
});
const bm = adj(meta.cells['p1-f0']), pm = adj(meta.cells['ptero-f0']);
fs.writeFileSync(join(root, 'tools/shots/flap-meta.inline.js'),
  `const BIRD_FLAP = { planeW: ${bm.planeW.toFixed(3)}, planeH: ${bm.planeH.toFixed(3)}, feetFrac: ${bm.feetFrac.toFixed(4)} };\n` +
  `const PTERO_FLAP = { planeW: ${pm.planeW.toFixed(3)}, planeH: ${pm.planeH.toFixed(3)}, feetFrac: ${pm.feetFrac.toFixed(4)} };\n`);
console.log('total', Math.round(total / 1024) + 'KB');
