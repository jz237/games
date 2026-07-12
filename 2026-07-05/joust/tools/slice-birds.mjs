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

const meta = JSON.parse(fs.readFileSync(join(root, 'tools/shots/birds-cells.json'), 'utf8'));
const sheets = {};
for (const [key, c] of Object.entries(meta.cells)) (sheets[c.sheet] ||= []).push([key, c]);

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const out = {};
for (const [sheetName, cells] of Object.entries(sheets)) {
  const n = sheetName.replace('birds-sheet', '');
  const paintedB64 = fs.readFileSync(join(root, `tools/shots/birds-painted${n}.png`)).toString('base64');
  const maskB64 = fs.readFileSync(join(root, `tools/shots/birds-mask${n}.png`)).toString('base64');
  const res = await page.evaluate(async (paintedB64, maskB64, cells, lumaKey) => {
    const load = src => new Promise((res2, rej) => { const i = new Image(); i.onload = () => res2(i); i.onerror = rej; i.src = 'data:image/png;base64,' + src; });
    const painted = await load(paintedB64), mask = await load(maskB64);
    const sx = painted.width / 1280, sy = painted.height / 720;
    const result = {};
    for (const [key, cell] of cells) {
      const x = Math.max(0, Math.round(cell.x * sx)), y = Math.max(0, Math.round(cell.y * sy));
      const w = Math.min(painted.width - x, Math.round(cell.w * sx)), h = Math.min(painted.height - y, Math.round(cell.h * sy));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx2 = c.getContext('2d');
      // luma-key mode: matte straight off the painted pixels (subject is bright on pure
      // black — used for pteros, where the mask model hallucinated knight shapes)
      cx2.drawImage(lumaKey ? painted : mask, x, y, w, h, 0, 0, w, h);
      const md = cx2.getImageData(0, 0, w, h);
      const lum = new Float32Array(w * h);
      for (let p = 0; p < w * h; p++) {
        const r2 = md.data[p * 4], g2 = md.data[p * 4 + 1], b2 = md.data[p * 4 + 2];
        lum[p] = lumaKey ? Math.min(255, Math.max(r2, g2, b2) * 3.4) : (r2 + g2 + b2) / 3;
      }
      const er = new Float32Array(w * h);
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        let mn = 255;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = Math.min(h - 1, Math.max(0, py + dy)), xx = Math.min(w - 1, Math.max(0, px + dx));
          mn = Math.min(mn, lum[yy * w + xx]);
        }
        er[py * w + px] = mn;
      }
      // connected components seeded from the strong interior (whole cell is ours)
      const keep = new Uint8Array(w * h); const stack = [];
      for (let p = 0; p < w * h; p++) if (er[p] > 128) { keep[p] = 1; stack.push(p); }
      while (stack.length) {
        const q = stack.pop(); const qy = (q / w) | 0, qx = q % w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const p2 = ny * w + nx;
          if (!keep[p2] && er[p2] > 40) { keep[p2] = 1; stack.push(p2); }
        }
      }
      cx2.clearRect(0, 0, w, h);
      cx2.drawImage(painted, x, y, w, h, 0, 0, w, h);
      const cd = cx2.getImageData(0, 0, w, h);
      const hi = lumaKey ? 90 : 215;   // luma mode: anything not-near-black is fully solid
      for (let p = 0; p < w * h; p++) {
        const m = keep[p] ? er[p] : 0;
        cd.data[p * 4 + 3] = m < 40 ? 0 : m > hi ? 255 : Math.round((m - 40) * (255 / (hi - 40)));
      }
      cx2.putImageData(cd, 0, 0);
      result[key] = c.toDataURL('image/png').split(',')[1];
    }
    return result;
  }, paintedB64, maskB64, cells, sheetName === 'birds-sheet3');
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
// meta is uniform: same cell geometry everywhere
const any = Object.values(meta.cells)[0];
fs.writeFileSync(join(root, 'tools/shots/bird-sprites.inline.js'),
  `const BIRD_SPRITE = { planeW: ${any.planeW.toFixed(3)}, planeH: ${any.planeH.toFixed(3)}, feetFrac: ${any.feetFrac.toFixed(4)} };\n` +
  `const BIRD_KEYS = ${JSON.stringify(keys)};\n`);
console.log('total', Math.round(total / 1024) + 'KB');
