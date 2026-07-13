#!/usr/bin/env node
// Puppet pipeline step 1b (v1.8): record the ANALYTIC apparent wing motion — project the
// near wing's bone (shoulder → visual tip) through the staging camera across a densely
// sampled flap cycle. Mask-derived angles are too noisy (foreshortened phases have no
// stable direction); the projected bone is exact and smooth by construction.
// Out: tools/shots/puppet-bones.json  { <variant>: { pivot:{px,py}, curve:[{a,l}x16] } }
// Run: NODE_PATH=$(npm root -g) node tools/puppet-bones.mjs
import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gRoot = execSync('npm root -g').toString().trim();
const puppeteer = require(join(gRoot, 'puppeteer'));
const PORT = 8273;

const rPath = join(root, 'modern/assets/render3d.js');
const current = fs.readFileSync(rPath);
let presprite = execSync('git show 89cf140:2026-07-05/joust/modern/assets/render3d.js',
  { cwd: root, maxBuffer: 8 * 1024 * 1024 }).toString();
presprite = presprite.replace('const API = { Renderer3D, X3, Y3 };', 'const API = { Renderer3D, X3, Y3, birdView, pteroView };');
fs.writeFileSync(rPath, presprite);

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', e => console.error('pageerror:', e.message));
await page.goto(`http://localhost:${PORT}/modern/index.html`, { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 3000));

const bones = await page.evaluate(() => {
  const r = window.__joustQA.renderer();
  const T = window.THREE;
  const { birdView, pteroView } = window.JOUST_RENDER3D;
  r.swayX = 0; r.shake = 0; r.punchT = 0;
  const stage = new T.Group(); r.scene.add(stage);
  const VARIANTS = [
    { name: 'p1', kind: 'player', variant: 0 },
    { name: 'p2', kind: 'player', variant: 1 },
    { name: 'bounder', kind: 'enemy', variant: 'bounder' },
    { name: 'hunter', kind: 'enemy', variant: 'hunter' },
    { name: 'shadow', kind: 'enemy', variant: 'shadow' },
    { name: 'ptero', kind: 'ptero' },
  ];
  const out = {};
  const pr = (v3) => { const p = v3.clone().project(r.camera); return [(p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight]; };
  for (const V of VARIANTS) {
    const isPtero = V.kind === 'ptero';
    const SCALE = isPtero ? 1.25 : 1.8;
    const v = isPtero ? pteroView() : birdView(V.kind, V.variant);
    const g = v.group;
    g.traverse(o => { o.visible = true; });
    g.scale.setScalar(SCALE);
    // use the f0 stage slot so the bone curve matches the sheet perspective closely
    g.position.set(-95, 82 - 30, 0);
    g.rotation.y = -0.3;
    if (!isPtero) for (const l of v.legs) { l.hip.rotation.z = 0.85; l.knee.rotation.z = 1.15; }
    stage.add(g);
    const near = v.wings.find(w => w.side > 0) || v.wings[0];
    // visual tip = mean of the 3 farthest GEOMETRY CORNERS in the rotating wing subtree
    // (mesh centres sit halfway down the feathers and miss the fan's real reach),
    // expressed LOCAL to the rotating group so it sweeps with the bone
    const rotG = isPtero ? near.sh : near.wg;
    g.updateMatrixWorld(true);
    const shW = new T.Vector3();
    near.sh.getWorldPosition(shW);
    const locals = [];
    rotG.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      for (const cx of [bb.min.x, bb.max.x]) for (const cy of [bb.min.y, bb.max.y]) for (const cz of [bb.min.z, bb.max.z]) {
        const wp = o.localToWorld(new T.Vector3(cx, cy, cz));
        locals.push({ d: wp.distanceTo(shW), lp: rotG.worldToLocal(wp.clone()) });
      }
    });
    locals.sort((a, b) => b.d - a.d);
    const tipL = new T.Vector3();
    for (let k = 0; k < Math.min(3, locals.length); k++) tipL.add(locals[k].lp);
    tipL.multiplyScalar(1 / Math.min(3, locals.length));
    const NS = isPtero ? 12 : 16;
    const curve = [];
    for (let k = 0; k < NS; k++) {
      if (isPtero) {
        const a = Math.sin((k / NS) * Math.PI * 2) * 0.55;
        for (const w of v.wings) { w.sh.rotation.x = w.side * a; w.elbow.rotation.x = w.side * a * 0.8; }
      } else {
        const wa = -0.38 + (1.05 + 0.38) * (0.5 - 0.5 * Math.cos((k / NS) * Math.PI * 2));
        for (const w of v.wings) w.wg.rotation.x = w.side * wa;
      }
      g.updateMatrixWorld(true);
      const s0 = pr(near.sh.getWorldPosition(new T.Vector3()));
      const t0 = pr(rotG.localToWorld(tipL.clone()));
      const dx = t0[0] - s0[0], dy = t0[1] - s0[1];
      curve.push({ a: Math.atan2(-dy, dx), l: Math.hypot(dx, dy) });
    }
    // unwrap so interpolation never jumps across ±π
    for (let k = 1; k < NS; k++) {
      while (curve[k].a - curve[k - 1].a > Math.PI) curve[k].a -= 2 * Math.PI;
      while (curve[k].a - curve[k - 1].a < -Math.PI) curve[k].a += 2 * Math.PI;
    }
    const sp = pr(near.sh.getWorldPosition(new T.Vector3()));
    out[V.name] = { pivot: { px: sp[0], py: sp[1] }, curve: curve.map(c => ({ a: +c.a.toFixed(4), l: +c.l.toFixed(2) })) };
    stage.remove(g);
  }
  return out;
});
fs.writeFileSync(join(root, 'tools/shots/puppet-bones.json'), JSON.stringify(bones, null, 1));
for (const [k, v] of Object.entries(bones))
  console.log(k, 'θ°', v.curve.map(c => (c.a * 180 / Math.PI).toFixed(0)).join(','), '| len', v.curve.map(c => c.l.toFixed(0)).join(','));
await browser.close(); srv.kill();
fs.writeFileSync(rPath, current);
console.log('done — sprite renderer restored');
