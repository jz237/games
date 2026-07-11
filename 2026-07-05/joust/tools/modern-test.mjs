#!/usr/bin/env node
// Headless smoke test for the MODERN 3D edition: SwiftShader WebGL, console errors,
// title + gameplay screenshots, QA-driven ticks. Run: NODE_PATH=$(npm root -g) node tools/modern-test.mjs
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const PORT = 8247;

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));

let failed = 0;
const shotDir = join(root, 'tools', 'shots');
fs.mkdirSync(shotDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) failed++; };

try {
  await page.goto(`http://localhost:${PORT}/modern/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2500));

  const qa = await page.evaluate(() => !!window.__joustQA && window.__joustQA.modern === true);
  ok('QA hook present (modern)', qa);
  const webgl = await page.evaluate(() => {
    const c = document.getElementById('gl');
    return !!(c && (c.getContext('webgl2') || c.getContext('webgl')));
  });
  ok('WebGL context alive', webgl);
  const ver = await page.evaluate(() => window.__joustQA.version);
  console.log('  version:', ver);

  await page.screenshot({ path: join(shotDir, 'modern-title.png') });

  // start a real game via QA and run 600 frames of bot play
  await page.evaluate(() => { window.__joustQA.bot = true; window.__joustQA.start(1, '1p'); });
  await page.evaluate(() => { for (let i = 0; i < 240; i++) window.__joustQA.tick(1); });
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: join(shotDir, 'modern-wave1.png') });

  const st = await page.evaluate(() => ({
    state: window.__joustQA.state(),
    wave: window.__joustQA.wave(),
    players: window.__joustQA.snapshot().players.map(p => ({ alive: p.alive, score: p.score, lives: p.lives })),
    enemies: window.__joustQA.snapshot().enemies.filter(e => e.alive).length,
  }));
  console.log('  after 240 ticks:', JSON.stringify(st));
  ok('engine ticking (enemies present or scored)', st.enemies > 0 || st.players[0].score > 0);

  // egg wave for visual variety
  await page.evaluate(() => { window.__joustQA.start(5, '1p'); for (let i = 0; i < 150; i++) window.__joustQA.tick(1); });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: join(shotDir, 'modern-wave5-egg.png') });

  // ptero wave
  await page.evaluate(() => { window.__joustQA.start(8, '1p'); for (let i = 0; i < 400; i++) window.__joustQA.tick(1); });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: join(shotDir, 'modern-wave8-ptero.png') });

  // rough render-loop FPS over 3s (rAF-driven)
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const cnt = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(cnt); else res(Math.round(n / 3)); };
    requestAnimationFrame(cnt);
  }));
  console.log('  headless rAF fps ~', fps, '(SwiftShader CPU rendering — real GPUs are far faster)');

  ok('no console/page errors', errors.length === 0);
  if (errors.length) console.log(errors.slice(0, 6).join('\n'));
} catch (e) {
  console.error('FATAL', e.message); failed++;
} finally {
  await browser.close(); srv.kill();
}
console.log(failed === 0 ? '\nMODERN SMOKE: ALL PASS' : `\nMODERN SMOKE: ${failed} FAILED`);
process.exit(failed ? 1 : 0);
