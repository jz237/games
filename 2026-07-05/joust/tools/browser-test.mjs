#!/usr/bin/env node
// Headless-Chrome smoke test: load the game, catch console/page errors, drive input,
// screenshot title + each wave type, and confirm no softlock.  NODE_PATH=$(npm root -g).
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const PORT = 8099;

const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));

let failed = 0;
const shotDir = join(root, 'tools', 'shots');
import fs from 'fs';
fs.mkdirSync(shotDir, { recursive: true });

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--window-size=880,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 880, height: 720 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

try {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1200));

  // boot hidden?
  const bootHidden = await page.evaluate(() => { const b = document.getElementById('boot'); return !b || b.style.display === 'none'; });
  console.log(bootHidden ? 'OK  boot overlay hidden' : 'FAIL boot overlay still visible'); if (!bootHidden) failed++;

  const hasQA = await page.evaluate(() => !!window.__joustQA);
  console.log(hasQA ? 'OK  QA hook present, VERSION=' + await page.evaluate(() => window.__joustQA.version) : 'FAIL no QA hook'); if (!hasQA) failed++;

  await page.screenshot({ path: join(shotDir, '01-title.png') });

  // drive each wave type, tick 500 frames, ensure no crash and entities render
  const waveByType = { normal: 1, survival: 2, gladiator: 4, egg: 5, ptero: 8 };
  for (const [type, wv] of Object.entries(waveByType)) {
    const res = await page.evaluate((wv) => {
      window.__joustQA.start(wv, '1p');
      const inputs = [{ left: false, right: false, flap: true, flapHeld: true }];
      let ok = true, snap;
      try {
        for (let i = 0; i < 600; i++) {
          const inp = [{ flap: i % 6 === 0, right: (i >> 5) % 2 === 0, left: (i >> 5) % 2 === 1, flapHeld: true }];
          snap = window.__joustQA.tick(1, inp);
        }
      } catch (e) { ok = false; return { err: e.message }; }
      return { ok, wave: snap.wave, type: snap.waveType, players: snap.players.length, enemies: snap.enemies.length, eggs: snap.eggs.length };
    }, wv);
    if (res.err) { console.log(`FAIL wave ${wv} (${type}) crashed: ${res.err}`); failed++; }
    else console.log(`OK  wave ${wv} type=${res.type} ran 600 ticks (enemies=${res.enemies} eggs=${res.eggs})`);
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: join(shotDir, `wave-${wv}-${type}.png`) });
  }

  // live play (real rAF loop → particles/floats age & render): drive keyboard for a lively frame
  await page.evaluate(() => window.__joustQA.start(4, '1p'));
  for (let i = 0; i < 150; i++) {
    if (i % 6 === 0) await page.keyboard.down('ArrowUp'); else if (i % 6 === 1) await page.keyboard.up('ArrowUp');
    if (i === 0) await page.keyboard.down('ArrowRight');
    if (i === 70) { await page.keyboard.up('ArrowRight'); await page.keyboard.down('ArrowLeft'); }
    await new Promise(r => setTimeout(r, 16));
  }
  await page.keyboard.up('ArrowLeft').catch(() => {});
  await page.screenshot({ path: join(shotDir, '04-liveplay.png') });

  // options + help screens
  await page.evaluate(() => { window.__joustQA.setState('options'); });
  await new Promise(r => setTimeout(r, 200)); await page.screenshot({ path: join(shotDir, '02-options.png') });
  await page.evaluate(() => { window.__joustQA.setState('help'); });
  await new Promise(r => setTimeout(r, 200)); await page.screenshot({ path: join(shotDir, '03-help.png') });

  if (errors.length) { console.log('CONSOLE/PAGE ERRORS:'); errors.slice(0, 20).forEach(e => console.log('  ' + e)); failed += errors.length; }
  else console.log('OK  no console/page errors');
} catch (e) {
  console.log('FATAL', e.message); failed++;
} finally {
  await browser.close(); srv.kill('SIGKILL');
}
console.log(failed ? `\n${failed} problem(s)` : '\nALL BROWSER CHECKS PASSED');
process.exit(failed ? 1 : 0);
