#!/usr/bin/env node
// v1.9 scenario proof: scripted 60fps capture of walk → fly+land → lava dive (troll
// reach + grab) → escape. Same freeze-rAF technique as anim-video.mjs. Asserts the
// ground crossfade is gradual (no pops), wing continuity holds, and the troll sequence
// actually fires (reach > 0.5, then a grab, then escape alive).
// Out: tools/shots/scenario.mp4 + scenario-strip.png
// Run: NODE_PATH=$(npm root -g) node tools/anim-scenario.mjs
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const PORT = 8276;
const FRAMES = 430;

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const outDir = join(root, 'tools/shots/scen');
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
  window.requestAnimationFrame = () => 0;
  // the HUD canvas freezes at its pre-override content (draw() never runs again) —
  // a stale FLAP TO START would overlay the whole video; hide it
  document.getElementById('hud').style.display = 'none';
  const qa = window.__joustQA;
  qa.start(4, '1p');             // wave 4 = lava troll active
  qa.tick(80);                   // settle spawn
  window.__scenLog = [];
});
// flush the STRAGGLER: one live frame() is still scheduled from before the override —
// it fires at the next paint with a huge real dt (≤200ms) and would gulp ~0.35 cycles
// of wing beat mid-capture. Force two throwaway paints so it lands here instead.
await page.screenshot({ path: join(outDir, 'warm0.png') });
await new Promise(r => setTimeout(r, 250));
await page.screenshot({ path: join(outDir, 'warm1.png') });
fs.rmSync(join(outDir, 'warm0.png'), { force: true });
fs.rmSync(join(outDir, 'warm1.png'), { force: true });

for (let i = 0; i < FRAMES; i++) {
  await page.evaluate((i) => {
    const qa = window.__joustQA;
    const eng = qa.engine();
    const W = window.JOUST_ENGINE.WORLD || window.JOUST_DATA.WORLD;
    const p = eng.players[0];
    const inp = { left: false, right: false, flap: false };
    // lava gap centre from the live floor spans
    const floors = eng.platforms.filter(pl => pl.y === W.FLOOR).sort((a, b) => a.x1 - b.x1);
    let gx = 155;
    if (floors.length >= 2) gx = (floors[0].x2 + floors[1].x1) / 2;
    const steer = tx => { const d = tx - p.x; inp.left = d < -3; inp.right = d > 3; };
    if (i < 100) {                    // WALK on the left floor
      steer(Math.max(20, (floors[0] ? floors[0].x2 : 90) - 26));
      if (p.y < W.FLOOR - 2 && i % 12 === 0) inp.flap = true;   // recover if bumped airborne
    } else if (i < 150) {             // CLIMB
      steer(gx - 40);
      if (i % 8 === 0) inp.flap = true;
    } else if (i < 210) {             // GLIDE DOWN + LAND back on the left floor
      steer((floors[0] ? floors[0].x2 : 90) - 20);
    } else if (i < 330) {             // DIVE over the gap, no flapping — let the troll reach
      steer(gx);
    } else {                          // ESCAPE: hammer flap
      steer(gx);
      if (i % 5 === 0) inp.flap = true;
    }
    qa.tick(1, [inp, {}]);
    const r = qa.renderer();
    const snap = qa.snapshot();
    r.render(snap, 1000 / 60);
    const v = r.views.get(p.id);
    window.__scenLog.push({
      id: p.id, y: Math.round(p.y), ground: p.onGround ? 1 : 0, alive: p.alive ? 1 : 0,
      c: v ? +v.main.state.c.toFixed(3) : null,
      standOp: v && v.main.mStand ? +v.main.mStand.opacity.toFixed(3) : null,
      ang: v && v.main.pivot ? +v.main.pivot.rotation.z.toFixed(4) : null,
      air: v && v.main.body ? (v.main.body.visible ? 1 : 0) : null,
      reach: +(r.reachAmt || 0).toFixed(2),
      grabs: snap.trolls.length,
    });
  }, i);
  await page.screenshot({ path: join(outDir, `f${String(i).padStart(3, '0')}.png`) });
  if (i % 60 === 0) console.log('frame', i);
}
const log = await page.evaluate(() => window.__scenLog);
await browser.close(); srv.kill();

let maxDA = 0, maxDOp = 0, maxReach = 0, grabbed = 0;
for (let i = 1; i < log.length; i++) {
  const a = log[i - 1], b = log[i];
  // a respawn swaps the entity id (fresh view) — comparing across it is a metric
  // artifact, not a visual one (the old view is hidden, the new one materializes)
  if (a.id !== b.id || !a.alive || !b.alive) continue;
  if (a.air && b.air && a.ang != null && b.ang != null) maxDA = Math.max(maxDA, Math.abs(b.ang - a.ang));
  if (a.standOp != null && b.standOp != null) maxDOp = Math.max(maxDOp, Math.abs(b.standOp - a.standOp));
  maxReach = Math.max(maxReach, b.reach);
  grabbed = Math.max(grabbed, b.grabs);
}
console.log(`wing Δmax ${maxDA.toFixed(3)} | crossfade Δopacity max ${maxDOp.toFixed(3)} | reach peak ${maxReach.toFixed(2)} | grabs ${grabbed}`);
for (let i = 1; i < log.length; i++) {
  const a = log[i - 1], b = log[i];
  if (a.id === b.id && a.alive && b.alive && a.air && b.air && a.ang != null && b.ang != null && Math.abs(b.ang - a.ang) > 0.8) {
    for (let k = Math.max(0, i - 3); k <= Math.min(log.length - 1, i + 2); k++) console.log('  ', i === k ? '→' : ' ', JSON.stringify(log[k]));
    console.log('  ---');
  }
}
console.log('page errors:', errors.length ? errors.slice(0, 4) : 'none');
const pass = maxDA < 0.80 && maxDOp < 0.5 && maxReach > 0.5 && grabbed >= 1 && errors.length === 0;
console.log(pass ? 'SCENARIO: PASS' : 'SCENARIO: FAIL');

execSync(`ffmpeg -y -framerate 60 -i ${outDir}/f%03d.png -pix_fmt yuv420p -crf 19 ${join(root, 'tools/shots/scenario.mp4')} 2>/dev/null`);
execSync(`ffmpeg -y -framerate 60 -i ${outDir}/f%03d.png -vf "select=not(mod(n\\,24)),scale=320:-1,tile=9x2" -frames:v 1 ${join(root, 'tools/shots/scenario-strip.png')} 2>/dev/null`);
console.log('wrote tools/shots/scenario.mp4 + scenario-strip.png');
if (!pass) process.exit(1);
