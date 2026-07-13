#!/usr/bin/env node
// Puppet pipeline step 1 (v1.8): re-stage the 6 flap sheets from the pre-sprite 3D rig
// with EXACTLY the v1.7 layout (so crop boxes match the committed painted frames), plus
// a wings-hidden pass per variant (wing mask = pixel diff) and the near-shoulder pivot.
// The pre-sprite renderer comes from git 89cf140 (byte-identical to the v1.7 staging copy).
// Out: tools/shots/pup-<variant>.png + pup-<variant>-nowing.png + pup-cells.json
// Run: NODE_PATH=$(npm root -g) node tools/puppet-stage.mjs
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const PORT = 8272;

// stage with the PRE-SPRITE renderer (has the 3D builders); restore afterwards
const rPath = join(root, 'modern/assets/render3d.js');
const current = fs.readFileSync(rPath);
let presprite = execSync('git show 89cf140:2026-07-05/joust/modern/assets/render3d.js',
  { cwd: root, maxBuffer: 8 * 1024 * 1024 }).toString();
presprite = presprite.replace('const API = { Renderer3D, X3, Y3 };', 'const API = { Renderer3D, X3, Y3, birdView, pteroView };');
fs.writeFileSync(rPath, presprite);

const VARIANTS = [
  { name: 'p1', kind: 'player', variant: 0 },
  { name: 'p2', kind: 'player', variant: 1 },
  { name: 'bounder', kind: 'enemy', variant: 'bounder' },
  { name: 'hunter', kind: 'enemy', variant: 'hunter' },
  { name: 'shadow', kind: 'enemy', variant: 'shadow' },
  { name: 'ptero', kind: 'ptero' },
];

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
page.on('pageerror', e => console.error('pageerror:', e.message));
await page.goto(`http://localhost:${PORT}/modern/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 3000));

const allCells = {};
const pivots = {};
for (const V of VARIANTS) {
  const rects = await page.evaluate((V) => {
    const r = window.__joustQA.renderer();
    const T = window.THREE;
    const { birdView, pteroView } = window.JOUST_RENDER3D;
    if (!window.__stageHidden) {
      window.__stageHidden = true;
      r.swayX = 0; r.shake = 0; r.punchT = 0;
      r.post.enabled = false;
      r.gl.toneMapping = T.ACESFilmicToneMapping;
      document.getElementById('hud').style.display = 'none';
      const amb = new T.AmbientLight(0xffffff, 0.85); r.scene.add(amb);
      const key = new T.DirectionalLight(0xfff2e0, 1.1); key.position.set(-80, 120, 200); r.scene.add(key);
      window.__stageGroup = new T.Group(); r.scene.add(window.__stageGroup);
      // EVICT the live game from the render graph — hiding is not enough (the attract
      // demo re-shows its entity views every frame via poseBird) and getView() keeps
      // ADDING new views; divert everything that isn't ours into a detached group.
      window.__limbo = new T.Group();
      const keep = new Set([window.__stageGroup, amb, key]);
      for (const ch of [...r.scene.children]) if (!keep.has(ch)) window.__limbo.add(ch);
      r.scene.add = (...o) => window.__limbo.add(...o);
      r.scene.traverse(o => { if (o.material && !o.material.isShaderMaterial) o.material.needsUpdate = true; });
    }
    const stage = window.__stageGroup;
    while (stage.children.length) stage.remove(stage.children[0]);
    const isPtero = V.kind === 'ptero';
    const SCALE = isPtero ? 1.25 : 1.8;
    const N = 8;
    const out = {};
    // per-phase part groups for the extra passes: the REAR MASS (wings + tail — the
    // painted fan fuses them) and the RIDER (knight + lance — must never cut into the wing)
    window.__stageRear = [];
    window.__stageRider = [];
    const pivot = [];           // per phase — the camera tilt distorts cell-relative offsets slightly
    for (let i = 0; i < N; i++) {
      const col = i % 3, row = (i / 3) | 0;
      const cx = -95 + col * 95, cy = 82 - row * 82;
      const v = isPtero ? pteroView() : birdView(V.kind, V.variant);
      const g = v.group;
      g.traverse(o => { o.visible = true; });
      g.scale.setScalar(SCALE);
      g.position.set(cx, cy - 30, 0);
      g.rotation.y = -0.3;
      if (isPtero) {
        const open = i >= 6;
        const ph = open ? (i === 6 ? 0.25 : 0.75) : i / 6;
        const a = Math.sin(ph * Math.PI * 2) * 0.55;
        for (const w of v.wings) { w.sh.rotation.x = w.side * a; w.elbow.rotation.x = w.side * a * 0.8; }
        v.jawG.rotation.z = open ? -0.55 : -0.06;
      } else {
        const wa = -0.38 + (1.05 + 0.38) * (0.5 - 0.5 * Math.cos((i / 8) * Math.PI * 2));
        for (const w of v.wings) w.wg.rotation.x = w.side * wa;
        for (const l of v.legs) { l.hip.rotation.z = 0.85; l.knee.rotation.z = 1.15; }
        if (v.neckG) v.neckG.rotation.z = -0.12 + Math.sin((i / 8) * Math.PI * 2) * 0.05;
      }
      stage.add(g);
      for (const w of v.wings) window.__stageRear.push(w.sh);
      if (v.tail) window.__stageRear.push(v.tail);
      if (v.rider) window.__stageRider.push(v.rider);
      const hw = isPtero ? 60 : 44, hv = isPtero ? 50 : 38;
      const pr = (wx, wy) => { const p = new T.Vector3(wx, wy, 0).project(r.camera); return [(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight]; };
      const [x0, y0] = pr(cx - hw, cy + hv), [x1, y1] = pr(cx + hw, cy - hv);
      out[V.name + '-f' + i] = {
        x: x0, y: y0, w: x1 - x0, h: y1 - y0,
        planeW: (2 * hw) / SCALE, planeH: (2 * hv) / SCALE, feetFrac: (hv + 30) / (2 * hv),
      };
      // shoulder pivot of the NEAR wing (side>0 faces the camera at z+);
      // project the actual 3D point — the pivot sits off the z=0 plane
      g.updateMatrixWorld(true);
      const near = v.wings.find(w => w.side > 0) || v.wings[0];
      const wp = new T.Vector3();
      near.sh.getWorldPosition(wp);
      const p = wp.clone().project(r.camera);
      pivot.push({ px: (p.x * 0.5 + 0.5) * innerWidth, py: (-p.y * 0.5 + 0.5) * innerHeight });
    }
    return { out, pivot };
  }, V);
  await new Promise(r2 => setTimeout(r2, 400));
  await page.screenshot({ path: join(shotDir, `pup-${V.name}.png`) });
  // rear-mass-hidden pass — the pixel diff vs full is the wing+tail mask
  await page.evaluate(() => { for (const o of window.__stageRear) o.visible = false; });
  await new Promise(r2 => setTimeout(r2, 400));
  await page.screenshot({ path: join(shotDir, `pup-${V.name}-norear.png`) });
  // rider-hidden pass — diff vs norear marks the knight+lance zone (hard wing veto)
  await page.evaluate(() => { for (const o of window.__stageRider) o.visible = false; });
  await new Promise(r2 => setTimeout(r2, 400));
  await page.screenshot({ path: join(shotDir, `pup-${V.name}-nok.png`) });
  Object.assign(allCells, Object.fromEntries(Object.entries(rects.out).map(([k, v]) => [k, { ...v, sheet: `pup-${V.name}` }])));
  pivots[V.name] = rects.pivot;
  console.log('staged', V.name, 'pivot f0', rects.pivot[0].px.toFixed(1), rects.pivot[0].py.toFixed(1));
}
fs.writeFileSync(join(shotDir, 'pup-cells.json'), JSON.stringify({ cells: allCells, pivots, view: { w: 1280, h: 720 } }, null, 1));
await browser.close(); srv.kill();
fs.writeFileSync(rPath, current);   // restore the sprite renderer
console.log('done — sprite renderer restored');
