#!/usr/bin/env node
// Fast art-loop screenshots (title + mid-wave + ptero joust moment) without the full smoke suite.
// Optional: ART_EVAL='js...' runs in-page before shooting (e.g. tweak renderer params to compare).
//           ART_PREFIX=xx names the outputs xx-title.png etc.
// Run: NODE_PATH=$(npm root -g) node tools/art-shot.mjs
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const PORT = 8256;
const PREFIX = process.env.ART_PREFIX || 'art';
const VW = parseInt(process.env.ART_W || '1280', 10), VH = parseInt(process.env.ART_H || '720', 10);

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const shotDir = join(root, 'tools', 'shots');
fs.mkdirSync(shotDir, { recursive: true });
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', `--window-size=${VW},${VH}`],
});
const page = await browser.newPage();
await page.setViewport({ width: VW, height: VH });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto(`http://localhost:${PORT}/modern/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 2600));   // let textures land
if (process.env.ART_EVAL) await page.evaluate(process.env.ART_EVAL);
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: join(shotDir, `${PREFIX}-title.png`) });

// mid-wave action (wave 3, bot flying)
await page.evaluate(() => { window.__joustQA.bot = true; window.__joustQA.start(3, '1p'); window.__joustQA.tick(200); });
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: join(shotDir, `${PREFIX}-wave.png`) });

// ptero wave joust moment
await page.evaluate(() => { window.__joustQA.start(8, '1p'); window.__joustQA.tick(460); });
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: join(shotDir, `${PREFIX}-joust.png`) });

console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close(); srv.kill();
