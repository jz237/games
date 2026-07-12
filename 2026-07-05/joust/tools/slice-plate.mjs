#!/usr/bin/env node
// Billboard pipeline step 3: slice platform crops out of the repainted master plate,
// matte them with BiRefNet (fal REST), and emit world-space card mappings.
// Usage: node tools/slice-plate.mjs base [floorL floorR ...]   (platform ids; default: base)
// In:  tools/shots/plate-master.png + plate-rects.json (from plate-shot.mjs)
// Out: modern/assets/tex/plat-<id>.png + tools/shots/plat-cards.json
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
import { homedir } from 'os';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const KEY = JSON.parse(fs.readFileSync(`${homedir()}/.claude.json`, 'utf8')).mcpServers.fal.env.FAL_KEY;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['base'];

const meta = JSON.parse(fs.readFileSync(join(root, 'tools/shots/plate-rects.json'), 'utf8'));
const PAD = { x: 16, top: 10, bot: 36 };   // painted rock bulges + drips overflow the geometry

// crop with canvas (master is same 1280x720 space as the rects)
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const b64 = fs.readFileSync(join(root, 'tools/shots/plate-master.png')).toString('base64');
const crops = await page.evaluate(async (b64, rects, ids, PAD) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
  const sx = img.width / rects.view.w, sy = img.height / rects.view.h;   // master↔rect scale
  const out = {};
  for (const id of ids) {
    const r = rects.rects[id];
    const x = Math.max(0, (r.x - PAD.x) * sx), y = Math.max(0, (r.y - PAD.top) * sy);
    const w = Math.min(img.width - x, (r.w + PAD.x * 2) * sx), h = Math.min(img.height - y, (r.h + PAD.top + PAD.bot) * sy);
    const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h);
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    out[id] = { data: c.toDataURL('image/png'), cropPx: { x, y, w, h }, sx, sy };
  }
  return out;
}, b64, meta, ids, PAD);
await browser.close();

// matte each crop: gpt-image-2/edit produces a binary MASK (BiRefNet failed on
// dark-slab-vs-dark-scene), which we apply to the ORIGINAL crop pixels in canvas —
// the master plate's pixels ship untouched, no repaint drift.
async function maskFor(dataUri) {
  const res = await fetch('https://fal.run/openai/gpt-image-2/edit', {
    method: 'POST',
    headers: { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Produce a precise binary segmentation mask of the floating stone platform in this image, including its hanging molten drips: the platform pure white, everything else (background rock, lava, sky, glow) pure black. Sharp edges, no grey, no text. Output only the mask.',
      image_urls: [dataUri],
      num_images: 1,
    }),
    signal: AbortSignal.timeout(280000),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error('mask HTTP ' + res.status + ' ' + txt.slice(0, 300));
  const url = JSON.parse(txt).images?.[0]?.url;
  const img = await fetch(url, { signal: AbortSignal.timeout(120000) });
  return Buffer.from(await img.arrayBuffer()).toString('base64');
}
const mbrowser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const mpage = await mbrowser.newPage();
const cards = fs.existsSync(join(root, 'tools/shots/plat-cards.json'))
  ? JSON.parse(fs.readFileSync(join(root, 'tools/shots/plat-cards.json'), 'utf8')) : {};
for (const id of ids) {
  const { data, cropPx } = crops[id];
  const maskB64 = await maskFor(data);
  const outB64 = await mpage.evaluate(async (cropUri, maskB64) => {
    const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const crop = await load(cropUri);
    const mask = await load('data:image/png;base64,' + maskB64);
    const c = document.createElement('canvas'); c.width = crop.width; c.height = crop.height;
    const x = c.getContext('2d');
    x.drawImage(mask, 0, 0, crop.width, crop.height);
    const md = x.getImageData(0, 0, crop.width, crop.height);
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(crop, 0, 0);
    const cd = x.getImageData(0, 0, crop.width, crop.height);
    for (let i = 0; i < cd.data.length; i += 4) {
      const m = (md.data[i] + md.data[i + 1] + md.data[i + 2]) / 3;
      cd.data[i + 3] = m < 40 ? 0 : m > 215 ? 255 : Math.round((m - 40) * (255 / 175));  // soft edge band
    }
    x.putImageData(cd, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  }, data, maskB64);
  const outPath = join(root, 'modern/assets/tex', `plat-${id}.png`);
  fs.writeFileSync(outPath, Buffer.from(outB64, 'base64'));
  // world mapping: rect px ↔ platform world width; anchor the card so the painted top
  // surface line lands exactly on the gameplay surface (def.y)
  const r = meta.rects[id];
  const worldPerPxX = null;  // filled by the renderer from PLATFORMS def; we store fractions
  cards[id] = {
    cropPx,
    // fractions of the crop where the geometry rect sits (renderer maps these to world units)
    fx: (r.x - (cropPx.x / crops[id].sx)) / (cropPx.w / crops[id].sx),
    fy: (r.y - (cropPx.y / crops[id].sy)) / (cropPx.h / crops[id].sy),
    fw: r.w / (cropPx.w / crops[id].sx),
    fh: r.h / (cropPx.h / crops[id].sy),
  };
  console.log('sliced', id, '->', outPath, Math.round(fs.statSync(outPath).size / 1024) + 'KB',
    'fx/fy/fw/fh', cards[id].fx.toFixed(3), cards[id].fy.toFixed(3), cards[id].fw.toFixed(3), cards[id].fh.toFixed(3));
}
fs.writeFileSync(join(root, 'tools/shots/plat-cards.json'), JSON.stringify(cards, null, 1));
await mbrowser.close();
