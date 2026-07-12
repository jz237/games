#!/usr/bin/env node
// Billboard pipeline step 6: bake a per-channel color-grade curve (histogram match)
// from a current game render toward the repainted master plate, as a 256x1 RGB texture
// sampled at the end of the composite shader (display space, post-gamma).
// Usage: node tools/grade-lut.mjs [strength=0.75]
// In:  tools/shots/art-wave.png (source) + tools/shots/plate-master2.png (target)
// Out: modern/assets/tex/grade.png
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const STRENGTH = parseFloat(process.argv[2] || '0.75');

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const srcB64 = fs.readFileSync(join(root, 'tools/shots/art-wave.png')).toString('base64');
const tgtB64 = fs.readFileSync(join(root, 'tools/shots/plate-master2.png')).toString('base64');

const out = await page.evaluate(async (srcB64, tgtB64, STRENGTH) => {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + src; });
  const pixels = async (b64) => {
    const img = await load(b64);
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;   // downsample = smoother histograms
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 320, 180);
    return x.getImageData(0, 0, 320, 180).data;
  };
  const s = await pixels(srcB64), t = await pixels(tgtB64);
  const curveFor = ch => {
    const hs = new Float64Array(256), ht = new Float64Array(256);
    for (let i = ch; i < s.length; i += 4) hs[s[i]]++;
    for (let i = ch; i < t.length; i += 4) ht[t[i]]++;
    const cdf = h => { const c2 = new Float64Array(256); let a = 0, tot = h.reduce((x2, y2) => x2 + y2, 0); for (let v = 0; v < 256; v++) { a += h[v]; c2[v] = a / tot; } return c2; };
    const cs = cdf(hs), ct = cdf(ht);
    const m = new Uint8Array(256);
    let j = 0;
    for (let v = 0; v < 256; v++) {
      while (j < 255 && ct[j] < cs[v]) j++;
      const matched = j;
      m[v] = Math.round(v + (matched - v) * STRENGTH);
    }
    // enforce monotonicity (histogram matching can plateau; never let it reverse)
    for (let v = 1; v < 256; v++) if (m[v] < m[v - 1]) m[v] = m[v - 1];
    return m;
  };
  const R = curveFor(0), G = curveFor(1), B = curveFor(2);
  const c = document.createElement('canvas'); c.width = 256; c.height = 1;
  const x = c.getContext('2d');
  const im = x.createImageData(256, 1);
  for (let v = 0; v < 256; v++) { im.data[v * 4] = R[v]; im.data[v * 4 + 1] = G[v]; im.data[v * 4 + 2] = B[v]; im.data[v * 4 + 3] = 255; }
  x.putImageData(im, 0, 0);
  return c.toDataURL('image/png').split(',')[1];
}, srcB64, tgtB64, STRENGTH);
await browser.close();

const p = join(root, 'modern/assets/tex/grade.png');
fs.writeFileSync(p, Buffer.from(out, 'base64'));
console.log('wrote grade.png (strength', STRENGTH + ')', fs.statSync(p).size + 'B');
