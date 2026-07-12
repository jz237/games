#!/usr/bin/env node
// Billboard pipeline step 3 (v2, LOCAL-ONLY): slice every platform out of the repainted
// master plate using the one full-plate mask — no per-platform API calls.
// In:  tools/shots/plate-master2.png + plate-mask.png + plate-rects.json
// Out: modern/assets/tex/plat-<id>.png + tools/shots/plat-cards.json (+ inline JS snippet)
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));

const meta = JSON.parse(fs.readFileSync(join(root, 'tools/shots/plate-rects.json'), 'utf8'));
const ids = Object.keys(meta.rects);
const PAD = { x: 16, top: 10, bot: 40 };

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const masterB64 = fs.readFileSync(join(root, 'tools/shots/plate-master2.png')).toString('base64');
const maskB64 = fs.readFileSync(join(root, 'tools/shots/plate-mask.png')).toString('base64');

const out = await page.evaluate(async (masterB64, maskB64, meta, ids, PAD) => {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const master = await load('data:image/png;base64,' + masterB64);
  const mask = await load('data:image/png;base64,' + maskB64);
  const sx = master.width / meta.view.w, sy = master.height / meta.view.h;
  const result = {};
  for (const id of ids) {
    const r = meta.rects[id];
    const x = Math.max(0, Math.round((r.x - PAD.x) * sx)), y = Math.max(0, Math.round((r.y - PAD.top) * sy));
    const w = Math.min(master.width - x, Math.round((r.w + PAD.x * 2) * sx));
    const h = Math.min(master.height - y, Math.round((r.h + PAD.top + PAD.bot) * sy));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx2 = c.getContext('2d');
    cx2.drawImage(mask, x, y, w, h, 0, 0, w, h);
    const md = cx2.getImageData(0, 0, w, h);
    // mask luminance grid, then a 1px ERODE (kills pale halo fringes on the caps)
    const lum = new Float32Array(w * h);
    for (let py = 0; py < h; py++) for (let px2 = 0; px2 < w; px2++) {
      const i = (py * w + px2) * 4;
      lum[py * w + px2] = (md.data[i] + md.data[i + 1] + md.data[i + 2]) / 3;
    }
    const er = new Float32Array(w * h);
    for (let py = 0; py < h; py++) for (let px2 = 0; px2 < w; px2++) {
      let mn = 255;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = Math.min(h - 1, Math.max(0, py + dy)), xx = Math.min(w - 1, Math.max(0, px2 + dx));
        mn = Math.min(mn, lum[yy * w + xx]);
      }
      er[py * w + px2] = mn;
    }
    cx2.clearRect(0, 0, w, h);
    cx2.drawImage(master, x, y, w, h, 0, 0, w, h);
    const cd = cx2.getImageData(0, 0, w, h);
    // connected-component filter: the padding can contain OTHER platforms' mask pixels
    // and stray white smears (lava bands) — keep only pixels flood-connected to the
    // platform blob inside this platform's own collision rect
    const keep = new Uint8Array(w * h);
    const stack = [];
    const ox0 = Math.max(0, Math.round(r.x * sx - x)), oy0 = Math.max(0, Math.round(r.y * sy - y));
    const ox1 = Math.min(w - 1, Math.round((r.x + r.w) * sx - x)), oy1 = Math.min(h - 1, Math.round((r.y + r.h) * sy - y));
    for (let py = oy0; py <= oy1; py++) for (let px2 = ox0; px2 <= ox1; px2++) {
      if (er[py * w + px2] > 128 && !keep[py * w + px2]) { keep[py * w + px2] = 1; stack.push(py * w + px2); }
    }
    while (stack.length) {
      const q = stack.pop(); const qy = (q / w) | 0, qx = q % w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx2 = qx + dx, ny2 = qy + dy;
        if (nx2 < 0 || ny2 < 0 || nx2 >= w || ny2 >= h) continue;
        const n = ny2 * w + nx2;
        if (!keep[n] && er[n] > 40) { keep[n] = 1; stack.push(n); }
      }
    }
    for (let i2 = 0; i2 < w * h; i2++) {
      const m = keep[i2] ? er[i2] : 0;
      cd.data[i2 * 4 + 3] = m < 40 ? 0 : m > 215 ? 255 : Math.round((m - 40) * (255 / 175));
    }
    cx2.putImageData(cd, 0, 0);
    // crop fractions of where the GEOMETRY rect sits inside this padded crop
    result[id] = {
      png: c.toDataURL('image/png').split(',')[1],
      fx: (r.x * sx - x) / w, fy: (r.y * sy - y) / h,
      fw: (r.w * sx) / w, fh: (r.h * sy) / h,
      world: r.world,
    };
  }
  return result;
}, masterB64, maskB64, meta, ids, PAD);
await browser.close();

const cards = {};
let total = 0;
for (const id of ids) {
  const p = join(root, 'modern/assets/tex', `plat-${id}.png`);
  fs.writeFileSync(p, Buffer.from(out[id].png, 'base64'));
  total += fs.statSync(p).size;
  cards[id] = { fx: out[id].fx, fy: out[id].fy, fw: out[id].fw, fh: out[id].fh, world: out[id].world };
  console.log(id.padEnd(10), Math.round(fs.statSync(p).size / 1024) + 'KB');
}
fs.writeFileSync(join(root, 'tools/shots/plat-cards.json'), JSON.stringify(cards, null, 1));
// inline snippet for render3d.js
const rows = ids.map(id => {
  const c = cards[id];
  const f = n => Number(n.toFixed(4));
  const wl = c.world;
  return `  ${id}: { fx: ${f(c.fx)}, fy: ${f(c.fy)}, fw: ${f(c.fw)}, fh: ${f(c.fh)}, w: [${f(wl.minX)}, ${f(wl.minY)}, ${f(wl.maxX)}, ${f(wl.maxY)}] },`;
});
fs.writeFileSync(join(root, 'tools/shots/plat-cards.inline.js'), `const PLAT_CARDS = {\n${rows.join('\n')}\n};\n`);
console.log('total', Math.round(total / 1024) + 'KB — inline snippet at tools/shots/plat-cards.inline.js');
