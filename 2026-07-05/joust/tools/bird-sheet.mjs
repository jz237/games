#!/usr/bin/env node
// Bird-sprite pipeline step 1: stage every mount variant in fixed poses on a black stage
// and capture input sheets for the repaint (+ cell rects for slicing).
// Sheets: 1) p1/p2 × (fly-up, fly-down, stand)   2) bounder/hunter/shadow × same
//         3) ptero × (up-closed, down-closed, up-OPEN, down-OPEN)
// Out: tools/shots/birds-sheet<N>.png + birds-cells.json
// Run: NODE_PATH=$(npm root -g) node tools/bird-sheet.mjs
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const PORT = 8266;

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

const SHEETS = [
  { name: 'birds-sheet1', cells: [
    { key: 'p1-up', kind: 'player', variant: 0, pose: 'up' },
    { key: 'p1-down', kind: 'player', variant: 0, pose: 'down' },
    { key: 'p1-stand', kind: 'player', variant: 0, pose: 'stand' },
    { key: 'p2-up', kind: 'player', variant: 1, pose: 'up' },
    { key: 'p2-down', kind: 'player', variant: 1, pose: 'down' },
    { key: 'p2-stand', kind: 'player', variant: 1, pose: 'stand' },
  ] },
  { name: 'birds-sheet2', cells: [
    { key: 'bounder-up', kind: 'enemy', variant: 'bounder', pose: 'up' },
    { key: 'bounder-down', kind: 'enemy', variant: 'bounder', pose: 'down' },
    { key: 'bounder-stand', kind: 'enemy', variant: 'bounder', pose: 'stand' },
    { key: 'hunter-up', kind: 'enemy', variant: 'hunter', pose: 'up' },
    { key: 'hunter-down', kind: 'enemy', variant: 'hunter', pose: 'down' },
    { key: 'hunter-stand', kind: 'enemy', variant: 'hunter', pose: 'stand' },
    { key: 'shadow-up', kind: 'enemy', variant: 'shadow', pose: 'up' },
    { key: 'shadow-down', kind: 'enemy', variant: 'shadow', pose: 'down' },
    { key: 'shadow-stand', kind: 'enemy', variant: 'shadow', pose: 'stand' },
  ] },
  // pteros get a wide 2x2 grid — their wingspans overflow the tight bird cells and
  // neighbouring frames contaminate the crops
  { name: 'birds-sheet3', layout: { cols: 2, dx: 165, dy: 130, hw: 80, hv: 62, scale: 1.55, drop: 26 }, cells: [
    { key: 'ptero-up', kind: 'ptero', pose: 'up', beak: 'closed' },
    { key: 'ptero-down', kind: 'ptero', pose: 'down', beak: 'closed' },
    { key: 'ptero-up-open', kind: 'ptero', pose: 'up', beak: 'open' },
    { key: 'ptero-down-open', kind: 'ptero', pose: 'down', beak: 'open' },
  ] },
];

const allCells = {};
for (const sheet of SHEETS) {
  const rects = await page.evaluate((cells, layout) => {
    const r = window.__joustQA.renderer();
    const T = window.THREE;
    const { birdView, pteroView } = window.JOUST_RENDER3D;
    // black stage: hide the whole scene except our staged birds
    if (!window.__stageHidden) {
      r.scene.traverse(o => { if (o !== r.scene) o.visible = false; });
      window.__stageHidden = true;
      // steady camera, no fx, NO post (bloom turns glowing lances into lightsabers on black,
      // and the grade LUT would double-apply once the repaint is graded in-game)
      r.swayX = 0; r.shake = 0; r.punchT = 0;
      r.post.enabled = false;
      r.gl.toneMapping = T.ACESFilmicToneMapping;
      r.scene.traverse(o => { if (o.material && !o.material.isShaderMaterial) o.material.needsUpdate = true; });
      document.getElementById('hud').style.display = 'none';
      // relight the stage neutrally so the repaint model sees form (scene lights were hidden)
      const amb = new T.AmbientLight(0xffffff, 0.85); amb.visible = true; r.scene.add(amb);
      const key = new T.DirectionalLight(0xfff2e0, 1.1); key.position.set(-80, 120, 200); key.visible = true; r.scene.add(key);
      window.__stageLights = [amb, key];
      window.__stageGroup = new T.Group(); window.__stageGroup.visible = true; r.scene.add(window.__stageGroup);
    }
    const stage = window.__stageGroup;
    while (stage.children.length) stage.remove(stage.children[0]);
    const L = Object.assign({ cols: 3, dx: 95, dy: 78, hw: 44, hv: 38, scale: 1.8, drop: 30 }, layout || {});
    const cols = Math.min(L.cols, cells.length);
    const out = {};
    const SCALE = L.scale;
    cells.forEach((cell, i) => {
      const col = i % cols, row = (i / cols) | 0;
      const cx = -95 + col * L.dx, cy = 70 - row * L.dy;   // world coords
      const v = cell.kind === 'ptero' ? pteroView() : birdView(cell.kind, cell.variant);
      const g = v.group;
      g.traverse(o => { o.visible = true; });
      g.scale.setScalar(SCALE);
      g.position.set(cx, cy - L.drop, 0);   // feet-origin: drop so the scaled body centres in cell
      g.rotation.y = -0.3;              // same yaw the game uses facing right
      // pose
      if (cell.kind === 'ptero') {
        const a = cell.pose === 'up' ? -0.55 : 0.55;
        for (const w of v.wings) { w.sh.rotation.x = w.side * a; w.elbow.rotation.x = w.side * a * 0.8; }
        v.jawG.rotation.z = cell.beak === 'open' ? -0.55 : -0.06;
      } else {
        const wa = cell.pose === 'up' ? -0.38 : cell.pose === 'down' ? 1.05 : 0.12;
        for (const w of v.wings) w.wg.rotation.x = w.side * wa;
        for (const l of v.legs) {
          const tgt = cell.pose === 'stand' ? 0 : 0.85, k = cell.pose === 'stand' ? 0 : 1.15;
          l.hip.rotation.z = tgt; l.knee.rotation.z = k;
        }
      }
      stage.add(g);
      // projected cell rect + world meta for the in-game plane mapping
      const hw = L.hw, hv = L.hv;   // world half-extent of the cell box
      const pr = (wx, wy) => { const p = new T.Vector3(wx, wy, 0).project(r.camera); return [(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight]; };
      const [x0, y0] = pr(cx - hw, cy + hv), [x1, y1] = pr(cx + hw, cy - hv);
      out[cell.key] = {
        x: x0, y: y0, w: x1 - x0, h: y1 - y0,
        planeW: (2 * hw) / SCALE, planeH: (2 * hv) / SCALE, feetFrac: (hv + L.drop) / (2 * hv),
      };
    });
    return out;
  }, sheet.cells, sheet.layout);
  await new Promise(r2 => setTimeout(r2, 400));
  await page.screenshot({ path: join(shotDir, sheet.name + '.png') });
  Object.assign(allCells, Object.fromEntries(Object.entries(rects).map(([k, v]) => [k, { ...v, sheet: sheet.name }])));
  console.log(sheet.name, Object.keys(rects).join(' '));
}
fs.writeFileSync(join(shotDir, 'birds-cells.json'), JSON.stringify({ cells: allCells, view: { w: 1280, h: 720 } }, null, 1));
await browser.close(); srv.kill();
console.log('sheets done');
