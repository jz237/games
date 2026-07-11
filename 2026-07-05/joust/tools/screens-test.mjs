#!/usr/bin/env node
// Screenshot pass: hub page + modern menu screens + mobile portrait hint.
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const PORT = 8249;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const shotDir = join(root, 'tools', 'shots');
fs.mkdirSync(shotDir, { recursive: true });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

// hub
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 15000 });
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: join(shotDir, 'hub.png') });

// modern screens
await page.setViewport({ width: 1280, height: 720 });
await page.goto(`http://localhost:${PORT}/modern/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 2200));
for (const [st, name] of [['options', 'modern-options'], ['help', 'modern-help'], ['feats', 'modern-feats'], ['waveselect', 'modern-waveselect']]) {
  await page.evaluate(s => window.__joustQA.setState(s), st);
  await new Promise(r => setTimeout(r, 350));
  await page.screenshot({ path: join(shotDir, name + '.png') });
}

// mobile portrait (rotate hint + hub stacking)
const m = await browser.newPage();
await m.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' });
await m.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 15000 });
await new Promise(r => setTimeout(r, 700));
await m.screenshot({ path: join(shotDir, 'hub-mobile.png') });
await m.goto(`http://localhost:${PORT}/modern/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 2000));
await m.screenshot({ path: join(shotDir, 'modern-mobile-portrait.png') });

console.log('errors:', errors.length ? errors.slice(0, 8) : 'none');
await browser.close(); srv.kill();
console.log('done');
