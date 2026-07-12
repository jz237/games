#!/usr/bin/env node
// One-shot texture prep for the modern art overhaul (run after regenerating raw AI images):
//   pano-raw.png  -> cavern-pano.jpg (2048x1024, L/R seam blend, bottom fade to black)
//   rock2-raw.png -> rock2.jpg (1024^2, seam blend) + rock2-n.jpg (Sobel normal map)
//   lava-raw.png  -> lava-cracks.jpg (1024^2, seam blend)
//   concept-raw.png -> concept.jpg (reference only)
// Run: NODE_PATH=$(npm root -g) node tools/tex-prep.mjs
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tex = join(root, 'modern', 'assets', 'tex');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const PORT = 8254;

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', tex], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('pageerror:', e.message));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });

const save = (name, dataUrl) => {
  fs.writeFileSync(join(tex, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('  wrote', name, Math.round(fs.statSync(join(tex, name)).size / 1024) + 'KB');
};

const result = await page.evaluate(async () => {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const px = c => c.getContext('2d').getImageData(0, 0, c.width, c.height);

  // offset+crossfade seam blend: near each wrapped edge, fade toward the half-offset copy
  function seamBlend(c, margin, edges) {
    const w = c.width, h = c.height;
    const src = px(c), out = c.getContext('2d').createImageData(w, h);
    const s = src.data, o = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let f = 0;
        if (edges.x) { const dx = Math.min(x, w - 1 - x); if (dx < margin) f = Math.max(f, 1 - dx / margin); }
        if (edges.y) { const dy = Math.min(y, h - 1 - y); if (dy < margin) f = Math.max(f, 1 - dy / margin); }
        if (f > 0) {
          const x2 = (x + (w >> 1)) % w, y2 = (y + (h >> 1)) % h;
          const j = (y2 * w + x2) * 4, k = f * 0.5;   // 50% max blend keeps detail
          o[i] = s[i] * (1 - k) + s[j] * k;
          o[i + 1] = s[i + 1] * (1 - k) + s[j + 1] * k;
          o[i + 2] = s[i + 2] * (1 - k) + s[j + 2] * k;
        } else { o[i] = s[i]; o[i + 1] = s[i + 1]; o[i + 2] = s[i + 2]; }
        o[i + 3] = 255;
      }
    }
    c.getContext('2d').putImageData(out, 0, 0);
  }

  function normalMap(c, strength) {
    const w = c.width, h = c.height;
    const s = px(c).data;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = (s[i * 4] * 0.299 + s[i * 4 + 1] * 0.587 + s[i * 4 + 2] * 0.114) / 255;
    // 1px box blur to calm jpeg-ish noise
    const bl = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        a += lum[((y + dy + h) % h) * w + ((x + dx + w) % w)];
      bl[y * w + x] = a / 9;
    }
    const out = cv(w, h), ctx = out.getContext('2d'), im = ctx.createImageData(w, h), d = im.data;
    const L = (x, y) => bl[((y + h) % h) * w + ((x + w) % w)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = (L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1));
      const gy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1));
      let nx = -gx * strength, ny = gy * strength, nz = 1;      // +Y green (OpenGL/three convention)
      const inv = 1 / Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      d[i] = (nx * inv * 0.5 + 0.5) * 255; d[i + 1] = (ny * inv * 0.5 + 0.5) * 255; d[i + 2] = (nz * inv * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    return out;
  }

  // levels stretch: lift a dark low-contrast texture so it reads as surface modulation
  function contrastLift(c, gain, target) {
    const out2 = cv(c.width, c.height), ctx2 = out2.getContext('2d');
    ctx2.drawImage(c, 0, 0);
    const im = ctx2.getImageData(0, 0, c.width, c.height), d = im.data;
    let mean = 0;
    for (let i = 0; i < d.length; i += 4) mean += (d[i] + d[i + 1] + d[i + 2]) / 3;
    mean /= d.length / 4;
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++)
      d[i + k] = Math.max(0, Math.min(255, (d[i + k] - mean) * gain + target));
    ctx2.putImageData(im, 0, 0);
    return out2;
  }

  const out = {};
  // ── rock albedo + normal ──
  const rock = await load('rock2-raw.png');
  const rc = cv(1024, 1024); rc.getContext('2d').drawImage(rock, 0, 0, 1024, 1024);
  seamBlend(rc, 56, { x: true, y: true });
  out.rock = rc.toDataURL('image/jpeg', 0.86);
  out.rockN = normalMap(rc, 2.4).toDataURL('image/jpeg', 0.92);
  // ── walkway variant: brighter + higher contrast so platform TOPS read under flat light ──
  const rt = contrastLift(rc, 2.1, 118);
  out.rockTop = rt.toDataURL('image/jpeg', 0.86);
  out.rockTopN = normalMap(rt, 3.2).toDataURL('image/jpeg', 0.92);
  // ── lava cracks ──
  const lava = await load('lava-raw.png');
  const lc = cv(1024, 1024); lc.getContext('2d').drawImage(lava, 0, 0, 1024, 1024);
  seamBlend(lc, 56, { x: true, y: true });
  out.lava = lc.toDataURL('image/jpeg', 0.88);
  // ── cavern pano ──
  const pano = await load('pano-raw.png');
  const pc = cv(2048, 1024); const pctx = pc.getContext('2d');
  pctx.drawImage(pano, 0, 0, 2048, 1024);
  seamBlend(pc, 72, { x: true, y: false });
  // fade the bottom into pure black (the lava sea occludes it; avoids a hard dome edge)
  const g = pctx.createLinearGradient(0, 1024 * 0.8, 0, 1024);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  pctx.fillStyle = g; pctx.fillRect(0, 1024 * 0.8, 2048, 1024 * 0.2);
  out.pano = pc.toDataURL('image/jpeg', 0.85);
  // ── concept ──
  const con = await load('concept-raw.png');
  const cc = cv(con.width, con.height); cc.getContext('2d').drawImage(con, 0, 0);
  out.concept = cc.toDataURL('image/jpeg', 0.85);
  return out;
});

save('rock2.jpg', result.rock);
save('rock2-n.jpg', result.rockN);
save('rock-top.jpg', result.rockTop);
save('rock-top-n.jpg', result.rockTopN);
save('lava-cracks.jpg', result.lava);
save('cavern-pano.jpg', result.pano);
save('concept.jpg', result.concept);

await browser.close(); srv.kill();
console.log('tex-prep done');
