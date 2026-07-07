// Browser smoke test + screenshots.
// Run: NODE_PATH=$(npm root -g) node tools/browser-test.mjs [port]
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const PORT = process.argv[2] || '8199';
const DIR = new URL('..', import.meta.url).pathname;
mkdirSync(DIR + 'tools/shots', { recursive: true });

const server = spawn('python3', ['-m', 'http.server', PORT], { cwd: DIR, stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(700);
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=980,560'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 980, height: 560 });
  const errors = [], logs = [];
  page.on('console', m => { logs.push(m.type() + ': ' + m.text()); if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + (e && e.message)));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
  await sleep(600);
  const hasApi = await page.evaluate(() => !!(window.__turrican && window.TData));
  await page.screenshot({ path: DIR + 'tools/shots/01-title.png' });

  // start a run
  await page.evaluate(() => window.__turrican.start());
  await sleep(300);
  // drive: run right + jump + fire for ~2.5s
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('KeyJ');
  for (let i = 0; i < 5; i++) { await page.keyboard.down('Space'); await sleep(120); await page.keyboard.up('Space'); await sleep(380); }
  await page.screenshot({ path: DIR + 'tools/shots/02-play.png' });
  // switch to beam + aim
  await page.keyboard.up('KeyJ');
  await page.keyboard.press('KeyQ'); // may switch if owned
  await sleep(200);
  const snap = await page.evaluate(() => window.__turrican.snapshot());
  await page.keyboard.up('ArrowRight');
  // morph
  await page.keyboard.press('ShiftLeft');
  await sleep(200);
  await page.screenshot({ path: DIR + 'tools/shots/03-morph.png' });
  const snap2 = await page.evaluate(() => window.__turrican.snapshot());

  await browser.close();
  server.kill();
  console.log('API present:', hasApi);
  console.log('console errors:', errors.length ? errors : 'none');
  console.log('snapshot after play:', JSON.stringify(snap));
  console.log('snapshot after morph:', JSON.stringify(snap2));
  console.log('screenshots -> tools/shots/{01-title,02-play,03-morph}.png');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); server.kill(); process.exit(2); });
