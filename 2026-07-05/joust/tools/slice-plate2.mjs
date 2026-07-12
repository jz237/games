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
    cx2.clearRect(0, 0, w, h);
    cx2.drawImage(master, x, y, w, h, 0, 0, w, h);
    const cd = cx2.getImageData(0, 0, w, h);
    for (let i = 0; i < cd.data.length; i += 4) {
      const m = (md.data[i] + md.data[i + 1] + md.data[i + 2]) / 3;
      cd.data[i + 3] = m < 40 ? 0 : m > 215 ? 255 : Math.round((m - 40) * (255 / 175));
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
