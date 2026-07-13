#!/usr/bin/env node
// Flap-cycle staging (v1.7): ONE sheet per mount variant with 8 wing phases sampled on a
// cosine cycle (staged from the pre-sprite 3D rig), so the repaint yields a smooth
// multi-frame flap animation. Ptero: 6 closed phases + 2 open-beak.
// Swaps in the pre-sprite renderer for staging, restores the current one afterwards.
// Out: tools/shots/flap-<variant>.png + flap-cells.json
// Run: NODE_PATH=$(npm root -g) node tools/bird-flap-sheet.mjs
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const PORT = 8271;

// stage with the PRE-SPRITE renderer (has the 3D builders)
const rPath = join(root, 'modern/assets/render3d.js');
const current = fs.readFileSync(rPath);
let presprite = fs.readFileSync('/tmp/claude-1000/-home-jez237-projects/6e0dc933-654e-410b-8980-57bcc5c1bbd3/scratchpad/render3d-presprite.js', 'utf8');
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
for (const V of VARIANTS) {
  const rects = await page.evaluate((V) => {
    const r = window.__joustQA.renderer();
    const T = window.THREE;
    const { birdView, pteroView } = window.JOUST_RENDER3D;
    if (!window.__stageHidden) {
      r.scene.traverse(o => { if (o !== r.scene) o.visible = false; });
      window.__stageHidden = true;
      r.swayX = 0; r.shake = 0; r.punchT = 0;
      r.post.enabled = false;
      r.gl.toneMapping = T.ACESFilmicToneMapping;
      r.scene.traverse(o => { if (o.material && !o.material.isShaderMaterial) o.material.needsUpdate = true; });
      document.getElementById('hud').style.display = 'none';
      const amb = new T.AmbientLight(0xffffff, 0.85); amb.visible = true; r.scene.add(amb);
      const key = new T.DirectionalLight(0xfff2e0, 1.1); key.position.set(-80, 120, 200); key.visible = true; r.scene.add(key);
      window.__stageGroup = new T.Group(); window.__stageGroup.visible = true; r.scene.add(window.__stageGroup);
    }
    const stage = window.__stageGroup;
    while (stage.children.length) stage.remove(stage.children[0]);
    const isPtero = V.kind === 'ptero';
    const SCALE = isPtero ? 1.25 : 1.8;
    const N = 8;
    const out = {};
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
        // 6 closed phases (i 0..5 over the cycle) + 2 open-beak extremes (i 6,7)
        const open = i >= 6;
        const ph = open ? (i === 6 ? 0.25 : 0.75) : i / 6;
        const a = Math.sin(ph * Math.PI * 2) * 0.55;
        for (const w of v.wings) { w.sh.rotation.x = w.side * a; w.elbow.rotation.x = w.side * a * 0.8; }
        v.jawG.rotation.z = open ? -0.55 : -0.06;
      } else {
        // cosine flap cycle: up (−0.38) → down (1.05) → up across 8 phases
        const wa = -0.38 + (1.05 + 0.38) * (0.5 - 0.5 * Math.cos((i / 8) * Math.PI * 2));
        for (const w of v.wings) w.wg.rotation.x = w.side * wa;
        for (const l of v.legs) { l.hip.rotation.z = 0.85; l.knee.rotation.z = 1.15; }
        if (v.neckG) v.neckG.rotation.z = -0.12 + Math.sin((i / 8) * Math.PI * 2) * 0.05;
      }
      stage.add(g);
      const hw = isPtero ? 60 : 44, hv = isPtero ? 50 : 38;
      const pr = (wx, wy) => { const p = new T.Vector3(wx, wy, 0).project(r.camera); return [(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight]; };
      const [x0, y0] = pr(cx - hw, cy + hv), [x1, y1] = pr(cx + hw, cy - hv);
      out[V.name + '-f' + i] = {
        x: x0, y: y0, w: x1 - x0, h: y1 - y0,
        planeW: (2 * hw) / SCALE, planeH: (2 * hv) / SCALE, feetFrac: (hv + 30) / (2 * hv),
      };
    }
    return out;
  }, V);
  await new Promise(r2 => setTimeout(r2, 400));
  await page.screenshot({ path: join(shotDir, `flap-${V.name}.png`) });
  Object.assign(allCells, Object.fromEntries(Object.entries(rects).map(([k, v]) => [k, { ...v, sheet: `flap-${V.name}` }])));
  console.log('staged', V.name);
}
fs.writeFileSync(join(shotDir, 'flap-cells.json'), JSON.stringify({ cells: allCells, view: { w: 1280, h: 720 } }, null, 1));
await browser.close(); srv.kill();
fs.writeFileSync(rPath, current);   // restore the sprite renderer
console.log('done — sprite renderer restored');
