#!/usr/bin/env node
// Billboard pipeline step 1: capture a clean EMPTY-ARENA plate (no birds/HUD/particles)
// plus each platform's exact screen rect (projected from the live scene graph).
// Outputs: tools/shots/plate-input.png + tools/shots/plate-rects.json
// Run: NODE_PATH=$(npm root -g) node tools/plate-shot.mjs
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const PORT = 8261;

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const shotDir = join(root, 'tools', 'shots');
fs.mkdirSync(shotDir, { recursive: true });
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto(`http://localhost:${PORT}/modern/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 3200));   // textures + font

const rects = await page.evaluate(() => {
  const r = window.__joustQA.renderer();
  const T = window.THREE;
  // empty the arena: null-snap render hides every entity view; kill particles + HUD
  const orig = r.render.bind(r);
  r.render = (snap, dt) => orig(null, dt);
  r.particles.pts.visible = false;
  document.getElementById('hud').style.display = 'none';
  // steady the camera for a clean plate
  r.swayX = 0; r.shake = 0; r.punchT = 0;
  // project each platform's center wrap-copy bounds to CSS pixels
  const cw = innerWidth, ch = innerHeight;
  const out = {};
  const box = new T.Box3(); const v = new T.Vector3();
  for (const id in r.platGroups) {
    const center = r.platGroups[id].children[1];   // wrap copies are [-SPAN, 0, +SPAN]
    box.setFromObject(center);
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
      v.set(cx, cy, cz).project(r.camera);
      const sx = (v.x * 0.5 + 0.5) * cw, sy = (-v.y * 0.5 + 0.5) * ch;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
    out[id] = {
      x: minX, y: minY, w: maxX - minX, h: maxY - minY,
      // world-space bounds too — the renderer maps crop fractions onto these
      world: { minX: box.min.x, minY: box.min.y, maxX: box.max.x, maxY: box.max.y },
    };
  }
  return { rects: out, view: { w: cw, h: ch } };
});
await new Promise(r => setTimeout(r, 500));   // a few frames with entities hidden
await page.screenshot({ path: join(shotDir, 'plate-input.png') });
fs.writeFileSync(join(shotDir, 'plate-rects.json'), JSON.stringify(rects, null, 1));
console.log('platforms:', Object.keys(rects.rects).length, 'errors:', errors.length ? errors : 'none');
await browser.close(); srv.kill();
