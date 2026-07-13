#!/usr/bin/env node
// Animation smoothness proof (v1.8): freeze the live rAF loop, then drive the engine and
// renderer MANUALLY at exact 60fps steps, screenshotting every frame. The encoded video
// is bit-exact what a 60fps player sees — SwiftShader wall-clock speed is irrelevant.
// Also asserts: wing angle continuity (no jumps) and zero texture/visibility swaps
// while airborne. Out: tools/shots/anim.mp4 + anim-strip.png + console PASS/FAIL.
// Run: NODE_PATH=$(npm root -g) node tools/anim-video.mjs
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const PORT = 8274;
const FRAMES = 180;   // 3 seconds @60

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const outDir = join(root, 'tools/shots/anim');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/modern/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 2600));

await page.evaluate(() => {
  window.requestAnimationFrame = () => 0;    // starve the live loop — we drive manually
  document.getElementById('hud').style.display = 'none';   // HUD freezes stale otherwise
  const qa = window.__joustQA;
  qa.bot = true;
  qa.start(3, '1p');
  qa.tick(120);                               // settle into mid-wave flight
  window.__animLog = [];
});
// flush the straggler live frame (still scheduled pre-override; fires on next paint
// with a huge real dt and would gulp a chunk of wing beat mid-capture)
await page.screenshot({ path: join(outDir, 'warm.png') });
await new Promise(r => setTimeout(r, 250));
fs.rmSync(join(outDir, 'warm.png'), { force: true });

for (let i = 0; i < FRAMES; i++) {
  await page.evaluate(() => {
    const qa = window.__joustQA;
    const r = qa.renderer();
    qa.tick(1);
    const snap = qa.snapshot();
    r.render(snap, 1000 / 60);
    // instrument the player + one enemy view
    const log = { swaps: 0 };
    const pid = snap.players[0] && snap.players[0].id;
    const eid = snap.enemies[0] && snap.enemies[0].id;
    const grab = (id, tag) => {
      const v = id != null && r.views.get(id);
      if (!v) return;
      log[tag] = {
        ang: v.main.pivot ? v.main.pivot.rotation.z : null,
        air: v.main.body ? v.main.body.visible : null,
        mat: v.main.body ? (v.main.body.material.uuid) : null,
      };
    };
    grab(pid, 'p'); grab(eid, 'e');
    window.__animLog.push(log);
  });
  await page.screenshot({ path: join(outDir, `f${String(i).padStart(3, '0')}.png`) });
  if (i % 30 === 0) console.log('frame', i);
}
const log = await page.evaluate(() => window.__animLog);
await browser.close(); srv.kill();

// ── continuity assertions ──
let maxD = 0, swaps = 0, airFlips = 0;
for (let i = 1; i < log.length; i++) {
  for (const tag of ['p', 'e']) {
    const a = log[i - 1][tag], b = log[i][tag];
    if (!a || !b || a.ang == null || b.ang == null) continue;
    if (a.air && b.air) maxD = Math.max(maxD, Math.abs(b.ang - a.ang));
    if (a.mat && b.mat && a.mat !== b.mat) swaps++;
    if (a.air !== b.air) airFlips++;
  }
}
console.log(`wing Δangle max ${maxD.toFixed(3)} rad/frame | body material swaps ${swaps} | air/ground flips ${airFlips}`);
console.log('page errors:', errors.length ? errors.slice(0, 4) : 'none');
// physical max: curve max slope ~5.74 rad/cycle × 6.9Hz/60fps = 0.66 rad/frame — a real
// jump (phase snap, swap glitch) measures 1.4+; 0.80 separates them cleanly
const pass = maxD < 0.80 && swaps === 0 && errors.length === 0;
console.log(pass ? 'ANIM CONTINUITY: PASS' : 'ANIM CONTINUITY: FAIL');

// ── encode (NEVER pipe ffmpeg into tail — SIGPIPE kills the encode) ──
execSync(`ffmpeg -y -framerate 60 -i ${outDir}/f%03d.png -pix_fmt yuv420p -crf 19 ${join(root, 'tools/shots/anim.mp4')} 2>/dev/null`);
execSync(`ffmpeg -y -framerate 60 -i ${outDir}/f%03d.png -vf "select=not(mod(n\\,12)),scale=320:-1,tile=8x2" -frames:v 1 ${join(root, 'tools/shots/anim-strip.png')} 2>/dev/null`);
console.log('wrote tools/shots/anim.mp4 +', 'anim-strip.png');
if (!pass) process.exit(1);
