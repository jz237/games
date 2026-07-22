// Stunt Car Racer remake — engine v2 (backlog item: track builder v1).
// Builds the REAL Little Ramp from tracks/little-ramp.json (traced from the
// original engine), elevated deck + kerbs + walls + pier previews, drivable.
import * as THREE from './vendor/three.module.min.js';

const qs = new URLSearchParams(location.search);
const canvas = document.getElementById('scene');
const menuEl = document.getElementById('menu');
const hudEl = document.getElementById('hud');
const hintEl = document.getElementById('hint');

// ---------- scale: original world units -> remake meters ----------
// deck width ~600u ≈ 12.5m (3 car widths) -> S = 1/48. Physics constants stay
// in ORIGINAL ratios × S so times (jumps, laps) match the traced engine:
// top speed = 92 display × 181 u/s ÷ 48; gravity ≈ 5000 u/s² × S ≈ 104 m/s².
const S = 1 / 48;
const DISP2MS = 181 * S;             // display-speed unit -> m/s
const VMAX = 92 * DISP2MS;           // ≈ 347 m/s (engine hard cap)
// gravity: A/B-tuned against the original's 2.28s gap-jump flight; ?grav= overrides
const GRAV = parseFloat(qs.get('grav')) || 55;
// slope decel: the original's traced speed curve shows NO uphill slowdown on
// the hill climb (the earlier "climb grind" was the car off-road against the
// ramp structure) — the 1989 engine ignores grade for speed. Kept at 0 until
// a clean uphill measurement says otherwise.
const SLOPE_G = 0;
// accel model fitted to the traced curve: dv/dt = THRUST − CDRAG·v² (display units)
const THRUST_D = 11.07, CDRAG_D = 0.000978;
const CRANE_LAUNCH = 28 * DISP2MS;   // the crane drop exits at display 28
// the crane drops you most of a lap before the line: telemetry shows 275
// slats from launch to the gap jump, and the line sits just past the gap
const CRANE_BACK = 283;

// ---------- deterministic noise ----------
function hash2(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function sstep(e0, e1, t) { return smooth(clamp01((t - e0) / (e1 - e0))); }

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
const FOG_COLOR = 0xcfe0ef;
scene.fog = new THREE.Fog(FOG_COLOR, 900, 5200);
const camera = new THREE.PerspectiveCamera(68, 1, 0.3, 9000);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- lights ----------
const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 800;
sun.shadow.camera.far = 2600;
const SH = 160;
sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
sun.shadow.bias = 0;            // bias scales by (far-near); nonzero erases
sun.shadow.normalBias = 0.5;    // low-body contact shadows (see ledger)
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0xbdd7f2, 0x4a5d38, 0.85);
scene.add(hemi);

// ---------- textures ----------
const texLoader = new THREE.TextureLoader();
function loadTex(url, repX, repY) {
  const t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
const grassTex = loadTex('images/tex-grass.jpg', 300, 300);
const asphaltTex = loadTex('images/tex-asphalt2.jpg', 1, 1);
const wallTex = loadTex('images/tex-wall.jpg', 1, 1);

// ---------- sky dome + mountain ring ----------
(function buildSky() {
  const cnv = document.createElement('canvas');
  cnv.width = 4; cnv.height = 256;
  const g = cnv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#2f6fd0');
  grad.addColorStop(0.45, '#5b93de');
  grad.addColorStop(0.8, '#a9c8ea');
  grad.addColorStop(1.0, '#dbe7f2');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cnv);
  t.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(7200, 32, 18),
    new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  dome.renderOrder = -3;
  scene.add(dome);
  const img = new Image();
  img.onload = () => {
    const mc = document.createElement('canvas');
    mc.width = 1024; mc.height = 256;
    const m = mc.getContext('2d');
    m.drawImage(img, 0, img.height * 0.74, img.width, img.height * 0.26, 0, 0, 1024, 256);
    // blend a horizontally-flipped copy: symmetric strip -> seamless mirrored wrap
    m.save();
    m.globalAlpha = 0.5;
    m.scale(-1, 1);
    m.drawImage(img, 0, img.height * 0.74, img.width, img.height * 0.26, -1024, 0, 1024, 256);
    m.restore();
    m.globalCompositeOperation = 'destination-out';
    const fade = m.createLinearGradient(0, 0, 0, 120);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = fade; m.fillRect(0, 0, 1024, 120);
    const mt = new THREE.CanvasTexture(mc);
    mt.colorSpace = THREE.SRGBColorSpace;
    mt.wrapS = THREE.MirroredRepeatWrapping;
    mt.repeat.set(3, 1);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(6300, 6300, 2400, 72, 1, true),
      new THREE.MeshBasicMaterial({ map: mt, side: THREE.BackSide, transparent: true, fog: false, depthWrite: false })
    );
    ring.position.y = 850;
    ring.renderOrder = -2;
    scene.add(ring);
  };
  img.src = 'images/sky.jpg';
})();

// ---------- track data ----------
let path = [];            // [{x,y,z,w,bank,shade}] scaled + recentered
let cum = [];             // cumulative distance
const grid = new Map();   // spatial hash: cell -> [point indices]
const CELL = 40;
function cellKey(x, z) { return Math.floor(x / CELL) + '_' + Math.floor(z / CELL); }
function buildGrid() {
  for (let i = 0; i < path.length; i++) {
    const k = cellKey(path[i].x, path[i].z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
}
function nearPoints(x, z) {
  const out = [];
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const arr = grid.get((cx + dx) + '_' + (cz + dz));
    if (arr) out.push(...arr);
  }
  return out;
}
// distance from (x,z) to nearest path point (coarse, for terrain/trees)
function pathDist(x, z) {
  let best = Infinity;
  for (const i of nearPoints(x, z)) {
    const d = Math.hypot(path[i].x - x, path[i].z - z);
    if (d < best) best = d;
  }
  return best;
}
// precise deck query: nearest segment, lateral offset, deck surface y
function deckAt(x, z) {
  let best = null, bestD = Infinity;
  for (const i of nearPoints(x, z)) {
    for (const j of [i, (i - 1 + path.length) % path.length]) {
      const a = path[j], b = path[(j + 1) % path.length];
      const abx = b.x - a.x, abz = b.z - a.z;
      const L2 = abx * abx + abz * abz;
      if (L2 < 1e-6) continue;
      let t = ((x - a.x) * abx + (z - a.z) * abz) / L2;
      t = clamp01(t);
      const px = a.x + abx * t, pz = a.z + abz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bestD) {
        const cy = a.y + (b.y - a.y) * t;
        const w = a.w + (b.w - a.w) * t;
        const bank = a.bank + (b.bank - a.bank) * t;
        // lateral sign via cross(fwd, rel)
        const il = 1 / Math.sqrt(L2);
        const cross = (abx * il) * (z - pz) - (abz * il) * (x - px);
        bestD = d;
        best = { seg: j, t, lat: cross > 0 ? d : -d, halfW: w / 2, y: cy + (bank / w) * (cross > 0 ? d : -d), cy, slope: (b.y - a.y) * il };
      }
    }
  }
  return best;
}

// terrain: rolling hills, dished + flattened near the track
function terrainH(x, z) {
  const n = vnoise(x / 340 + 7.3, z / 340 + 2.1) * 0.65
          + vnoise(x / 120 + 3.7, z / 120 + 9.4) * 0.35;
  const hills = (n - 0.42) * 55;
  const d = pathDist(x, z);
  const f = sstep(35, 190, d);
  const rim = sstep(1800, 3000, Math.hypot(x, z)) * 160;
  return hills * f - 2 * (1 - f) + rim;
}

// ---------- build world from track JSON ----------
const treeBillboards = [];
const car = new THREE.Group();
car.rotation.order = 'YXZ'; // yaw, then pitch/roll in car-local axes
let startIdx = 0;
// ROAD-RELATIVE physics like the 1989 engine: the car lives in (s, lat, y)
// road coordinates — the road carries you around corners (blind-W drives a
// lap, exactly as the original's telemetry shows); steering moves `lat`.
const state = {
  s: 0, lat: 0, y: 0,
  x: 0, z: 0, heading: 0,       // derived world pose (render + rigs)
  speed: 0, vy: 0, airborne: false, driving: false, chase: false,
  pt: 0,                         // physics time — headless wall-clock lies
  grind: false,
};
// per-index road frame, filled after the track loads
let seg = null; // {fx,fz,angle,slope,k,len}[]
let total = 0;
function buildSegFrames() {
  const N2 = path.length;
  seg = [];
  for (let i = 0; i < N2; i++) {
    const a = path[i], b = path[(i + 1) % N2];
    let fx = b.x - a.x, fz = b.z - a.z;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    seg.push({ fx, fz, angle: Math.atan2(fx, fz), slope: (b.y - a.y) / len, len, k: 0 });
  }
  for (let i = 0; i < N2; i++) {
    const p = seg[(i - 1 + N2) % N2], c = seg[i];
    let da = c.angle - p.angle;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    c.k = da / c.len; // curvature: + = turning left
  }
  total = cum[path.length];
}
// road sample at arc-length s: world pos of centerline, frame, width, bank
function roadAt(s) {
  const N2 = path.length;
  let sm = s % total; if (sm < 0) sm += total;
  let lo = 0, hi = N2;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= sm) lo = mid; else hi = mid; }
  const i = lo, t = (sm - cum[i]) / (cum[i + 1] - cum[i] || 1);
  const a = path[i], b = path[(i + 1) % N2];
  return {
    i, t,
    x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
    w: a.w + (b.w - a.w) * t, bank: a.bank + (b.bank - a.bank) * t,
    fx: seg[i].fx, fz: seg[i].fz, angle: seg[i].angle, slope: seg[i].slope, k: seg[i].k,
  };
}

async function buildWorld() {
  const raw = await (await fetch('tracks/little-ramp.json')).json();
  const pts = raw.points;
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p.x; cz += p.z; }
  cx /= pts.length; cz /= pts.length;
  path = pts.map(p => ({
    x: (p.x - cx) * S, y: p.y * S, z: (p.z - cz) * S,
    w: Math.max(p.w * S, 8), bank: p.bank * S, shade: p.shade,
  }));
  buildGrid();
  cum = [0];
  for (let i = 1; i <= path.length; i++) {
    const a = path[i - 1], b = path[i % path.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  startIdx = Math.max(0, path.findIndex(p => p.shade === 'start'));
  buildSegFrames();

  // --- terrain (after grid exists) ---
  {
    const SIZE = 6400, SEG = 160;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrainH(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1.0 }));
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // --- trees (kept off the track) ---
  {
    const sheet = texLoader.load('images/tex-trees.png');
    sheet.colorSpace = THREE.SRGBColorSpace;
    function speciesGeo(u0, u1) {
      const g = new THREE.PlaneGeometry(1, 1);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
      return g;
    }
    const geos = [speciesGeo(0, 0.5), speciesGeo(0.5, 1)];
    const mat = new THREE.MeshStandardMaterial({ map: sheet, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1.0 });
    let placed = 0, tries = 0;
    while (placed < 160 && tries < 900) {
      const i = tries++;
      const x = (hash2(i, 17) - 0.5) * 3000;
      const z = (hash2(i, 53) - 0.5) * 3000;
      if (pathDist(x, z) < 45) continue;
      const h = 17 + hash2(i, 133) * 16;
      const m = new THREE.Mesh(geos[i % 2], mat);
      m.scale.set(h * 0.78, h, 1);
      m.position.set(x, terrainH(x, z) + h * 0.5 - 0.4, z);
      scene.add(m);
      treeBillboards.push(m);
      placed++;
    }
  }

  // --- deck ribbons ---
  const N = path.length;
  const L = [], R = [], LK = [], RK = []; // outer edges and kerb inner edges
  const KERB = 1.1;
  for (let i = 0; i < N; i++) {
    const p = path[i];
    const a = path[(i - 1 + N) % N], b = path[(i + 1) % N];
    let fx = b.x - a.x, fz = b.z - a.z;
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const lx = -fz, lz = fx; // left normal
    const hw = p.w / 2;
    const bankY = p.bank / 2;
    L.push([p.x + lx * hw, p.y + bankY, p.z + lz * hw]);
    R.push([p.x - lx * hw, p.y - bankY, p.z - lz * hw]);
    const kw = hw - KERB;
    LK.push([p.x + lx * kw, p.y + bankY * (kw / hw), p.z + lz * kw]);
    RK.push([p.x - lx * kw, p.y - bankY * (kw / hw), p.z - lz * kw]);
  }
  // flat-shaded ribbon: per-segment duplicated verts -> hard color block edges
  function ribbonFlat(A, B, mat, vScale, segColFn) {
    const pos = [], uv = [], col = [], idx = [];
    for (let i = 0; i < N; i++) {
      const k = i, k2 = (i + 1) % N;
      const c = segColFn(i);
      const v0 = cum[i] * vScale, v1 = cum[i + 1] * vScale;
      pos.push(...A[k], ...B[k], ...A[k2], ...B[k2]);
      uv.push(0, v0, 1, v0, 0, v1, 1, v1);
      col.push(...c, ...c, ...c, ...c);
      const b4 = i * 4;
      idx.push(b4, b4 + 1, b4 + 2, b4 + 1, b4 + 3, b4 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  }
  function ribbon(A, B, mat, vScale, colFn) {
    const pos = [], uv = [], col = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      pos.push(...A[k], ...B[k]);
      const v = cum[i] * vScale;
      uv.push(0, v, 1, v);
      if (colFn) { const c = colFn(k); col.push(...c, ...c); }
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (colFn) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  }
  const asMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95 });
  asMat.map = asphaltTex;
  ribbon(LK, RK, asMat, 1 / 14, (k) => path[k].shade === 'start' ? [0.22, 0.22, 0.24] : [1, 1, 1]);
  const kerbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const kerbCol = (k) => (Math.floor(k / 2) % 2) ? [0.78, 0.12, 0.10] : [0.92, 0.90, 0.86];
  ribbonFlat(L, LK, kerbMat, 1 / 14, kerbCol);
  ribbonFlat(RK, R, kerbMat, 1 / 14, kerbCol);
  // deck sides + underside
  const depth = 1.1;
  const Ld = L.map(p => [p[0], p[1] - depth, p[2]]);
  const Rd = R.map(p => [p[0], p[1] - depth, p[2]]);
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide });
  ribbon(Ld, L, sideMat, 1 / 14);
  ribbon(R, Rd, sideMat, 1 / 14);
  ribbon(Rd, Ld, sideMat, 1 / 14); // underside

  // --- side walls, alternating red/white blocks like the original/reference ---
  const wallH = 2.7, wallT = 0.5;
  function wallStrip(edge, sideSign) {
    const inner = edge.map((p, i) => p);
    const outer = edge.map((p, i) => {
      const k = i;
      const a = path[(k - 1 + N) % N], b = path[(k + 1) % N];
      let fx = b.x - a.x, fz = b.z - a.z;
      const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      return [p[0] + (-fz) * wallT * sideSign, p[1], p[2] + fx * wallT * sideSign];
    });
    const innerTop = inner.map(p => [p[0], p[1] + wallH, p[2]]);
    const outerTop = outer.map(p => [p[0], p[1] + wallH, p[2]]);
    const wMat = new THREE.MeshStandardMaterial({ map: wallTex, vertexColors: true, roughness: 0.9 });
    const blockCol = (k) => (Math.floor(k / 3) % 2) ? [0.80, 0.16, 0.13] : [1, 1, 1];
    ribbonFlat(inner, innerTop, wMat, 1 / 6, blockCol);
    ribbonFlat(outerTop, outer, wMat, 1 / 6, blockCol);
    ribbonFlat(innerTop, outerTop, wMat, 1 / 6, blockCol);
  }
  wallStrip(L, 1);
  wallStrip(R, -1);

  // --- A-frame steel pylons + underside framing (instanced beams) ---
  {
    const beamGeo = new THREE.BoxGeometry(1, 1, 1);
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x7d848d, roughness: 0.5, metalness: 0.55 });
    const MAXB = N * 3 + Math.ceil(N / 2) * 5 + 16;
    const inst = new THREE.InstancedMesh(beamGeo, steelMat, MAXB);
    const helper = new THREE.Object3D();
    const UP = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    let n = 0;
    function beam(p1, p2, w) {
      if (n >= MAXB) return;
      dir.set(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
      const len = dir.length();
      if (len < 0.05) return;
      dir.normalize();
      helper.position.set((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2);
      helper.quaternion.setFromUnitVectors(UP, dir);
      helper.scale.set(w, len, w);
      helper.updateMatrix();
      inst.setMatrixAt(n++, helper.matrix);
    }
    const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const patches = [];
    for (let i = 0; i < N; i++) {
      const p = path[i];
      const a = path[(i - 1 + N) % N], b = path[(i + 1) % N];
      let fx = b.x - a.x, fz = b.z - a.z;
      const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const lx = -fz, lz = fx;
      const topY = p.y - depth + 0.25;
      const edge = (s2) => [p.x + lx * (p.w / 2 - 0.8) * s2, topY, p.z + lz * (p.w / 2 - 0.8) * s2];
      // underside: cross rib every slat + edge rails to the next slat
      beam(edge(-1), edge(1), 0.35);
      const pn = path[(i + 1) % N];
      const topYn = pn.y - depth + 0.25;
      let fxn = path[(i + 2) % N].x - p.x, fzn = path[(i + 2) % N].z - p.z;
      const fln = Math.hypot(fxn, fzn) || 1; fxn /= fln; fzn /= fln;
      const edgeN = (s2) => [pn.x + (-fzn) * (pn.w / 2 - 0.8) * s2, topYn, pn.z + fxn * (pn.w / 2 - 0.8) * s2];
      beam(edge(-1), edgeN(-1), 0.4);
      beam(edge(1), edgeN(1), 0.4);
      // A-frame pylon every 2 slats (~2 track-widths)
      if (i % 2 === 0) {
        const legs = [];
        for (const s2 of [-1, 1]) {
          const bx = p.x + lx * (p.w / 2 + 2.6) * s2, bz = p.z + lz * (p.w / 2 + 2.6) * s2;
          const gy = terrainH(bx, bz);
          const base = [bx, gy - 0.4, bz];
          const top = edge(s2);
          if (top[1] - gy < 1.2) { legs.push(null); continue; }
          const h = top[1] - gy;
          beam(base, top, 0.8 + h * 0.012);
          legs.push([base, top]);
          patches.push([bx, gy, bz, 1.6 + h * 0.02]);
        }
        if (legs[0] && legs[1]) {
          beam(lerp3(...legs[0], 0.42), lerp3(...legs[1], 0.42), 0.5);
          beam(lerp3(...legs[0], 0.78), lerp3(...legs[1], 0.78), 0.45);
          // diagonal brace for truss look
          beam(lerp3(...legs[0], 0.42), lerp3(...legs[1], 0.78), 0.3);
        }
      }
    }
    inst.count = n;
    inst.castShadow = true;
    inst.receiveShadow = true;
    scene.add(inst);
    // dark contact patches where legs meet the grass
    if (patches.length) {
      const cGeo = new THREE.CircleGeometry(1, 20);
      cGeo.rotateX(-Math.PI / 2);
      const cMat = new THREE.MeshBasicMaterial({ color: 0x25301e, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const ci = new THREE.InstancedMesh(cGeo, cMat, patches.length);
      const M2 = new THREE.Matrix4();
      patches.forEach((pt, i2) => {
        M2.makeScale(pt[3], 1, pt[3]);
        M2.setPosition(pt[0], pt[1] + 0.12, pt[2]);
        ci.setMatrixAt(i2, M2);
      });
      ci.renderOrder = 1;
      scene.add(ci);
    }
  }

  // --- start gantry ---
  {
    const p = path[startIdx];
    const b = path[(startIdx + 1) % N];
    let fx = b.x - p.x, fz = b.z - p.z;
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const lx = -fz, lz = fx;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 0.6, metalness: 0.5 });
    for (const s2 of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8, 0.7), postMat);
      post.position.set(p.x + lx * (p.w / 2 + 1.6) * s2, p.y + 4, p.z + lz * (p.w / 2 + 1.6) * s2);
      post.castShadow = true;
      scene.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, p.w + 4.5), postMat);
    beam.position.set(p.x, p.y + 8, p.z);
    beam.rotation.y = Math.atan2(lx, lz);
    beam.castShadow = true;
    scene.add(beam);
  }

  // --- car ---
  {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x9fb6c8, roughness: 0.45, metalness: 0.35 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.8, metalness: 0.1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.15, 6.6), bodyMat);
    body.position.y = 1.05; body.castShadow = true; car.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 2.2), bodyMat);
    nose.position.set(0, 0.85, -4.2); nose.castShadow = true; car.add(nose);
    const wheelGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.85, 18);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-2.2, -2.3], [2.2, -2.3], [-2.2, 2.4], [2.2, 2.4]]) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(wx, 1.0, wz); w.castShadow = true; car.add(w);
    }
    scene.add(car);
  }
  respawn();
}

function respawn() {
  const N2 = path.length;
  const i0 = (startIdx - CRANE_BACK + N2) % N2;
  state.s = cum[i0]; state.lat = 0;
  const r = roadAt(state.s);
  state.y = r.y;
  state.speed = CRANE_LAUNCH; state.vy = 0; state.airborne = false;
  syncWorldPose();
}
function syncWorldPose() {
  const r = roadAt(state.s);
  state.x = r.x + (-r.fz) * state.lat;
  state.z = r.z + r.fx * state.lat;
  state.heading = r.angle;
}

// ---------- input ----------
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyC' && state.driving) state.chase = !state.chase;
  if (e.code === 'KeyR' && state.driving) respawn();
  if (e.code === 'Escape' && state.driving) showMenu();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ---------- physics (fixed-step 60 Hz, original-ratio constants) ----------
function groundInfo(x, z, y) {
  const d = deckAt(x, z);
  if (d && Math.abs(d.lat) <= d.halfW + 0.2 && y > d.y - 3.0) {
    return { y: d.y, deck: d };
  }
  return { y: terrainH(x, z), deck: null };
}
const BRAKE = 300;
const KC = 0.004;      // centrifugal outward drift factor (A/B-tunable)
const STEER_BASE = 3, STEER_V = 0.045; // lateral m/s per unit speed
function step(dt) {
  const fwd = keys['KeyW'] || keys['ArrowUp'];
  const brk = keys['KeyS'] || keys['ArrowDown'];
  const left = keys['KeyA'] || keys['ArrowLeft'];
  const right = keys['KeyD'] || keys['ArrowRight'];
  state.grind = false;
  if (!state.airborne) {
    const vd = state.speed / DISP2MS; // display units for the fitted model
    if (fwd) state.speed += (THRUST_D - CDRAG_D * vd * vd) * DISP2MS * dt;
    else state.speed -= (CDRAG_D * vd * vd + 0.5) * DISP2MS * dt;
    // uphill slows, downhill feeds — clamped: steeper than ±0.3 is a jump
    // feature you fly over, not a drivable grade
    const sl = Math.max(-0.3, Math.min(0.3, roadAt(state.s).slope));
    state.speed -= SLOPE_G * sl * dt;
    if (brk) state.speed -= BRAKE * dt;
    if (state.speed > VMAX) state.speed = VMAX;
    if (state.speed < 0) state.speed = 0;
  }
  const r0 = roadAt(state.s);
  // advance along the road; lateral: steering + centrifugal push in corners
  state.s += state.speed * dt;
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  if (!state.airborne) {
    state.lat += steer * (STEER_BASE + STEER_V * state.speed) * dt;
    state.lat -= r0.k * state.speed * state.speed * KC * dt;
  } else {
    state.lat += steer * (STEER_BASE * 0.4) * dt; // minimal air control
  }
  const r = roadAt(state.s);
  // 2.7m walls are impassable at deck height: clamp + grind
  const lim = r.w / 2 - 2.1;
  if (!state.airborne || state.y < r.y + 3) {
    if (state.lat > lim) { state.lat = lim; state.grind = true; }
    if (state.lat < -lim) { state.lat = -lim; state.grind = true; }
    if (state.grind && !state.airborne) state.speed *= (1 - 0.55 * dt);
  }
  const deckY = r.y + (r.bank / r.w) * state.lat;
  if (state.airborne) {
    state.vy -= GRAV * dt;
    state.y += state.vy * dt;
    if (state.y <= deckY) { state.y = deckY; state.vy = 0; state.airborne = false; }
  } else {
    // 1989-style: the car is GLUED to the road over ordinary crests (the
    // original's telemetry never lifts on the hill at 85+). Airborne only
    // when the road truly falls away (gap lip / cliff): drop > 2.2m in a
    // tick. Takeoff vy inherits the approach slope (the ramp-up before the
    // chasm is what kicks you across), clamped ±0.3.
    if (state.y - deckY > 2.2) {
      state.airborne = true;
      state.vy = Math.max(-0.3, Math.min(0.3, r0.slope)) * state.speed;
    } else {
      state.y = deckY;
    }
  }
  state.pt += dt;
  syncWorldPose();
}

// ---------- camera + visuals ----------
const camTarget = new THREE.Vector3();
function updateVisuals() {
  car.position.set(state.x, state.y, state.z);
  // cockpit view never renders your own car (the dash overlay is the cockpit)
  car.visible = state.chase || !state.driving;
  const r = roadAt(state.s);
  const pitch = !state.airborne ? Math.atan(r.slope) : clamp01(-state.vy / 60) * 0.3;
  car.rotation.set(-pitch, state.heading + Math.PI, -Math.atan2(r.bank, r.w));
  const steerRoll = ((keys['KeyA'] || keys['ArrowLeft']) ? 1 : 0) - ((keys['KeyD'] || keys['ArrowRight']) ? 1 : 0);
  car.rotation.z += steerRoll * 0.05 * Math.min(1, state.speed / 60);

  const sin = Math.sin(state.heading), cos = Math.cos(state.heading);
  if (!window.__freezeCam) {
    const aheadDist = state.chase ? 40 : 60;
    const ax = state.x + sin * aheadDist, az = state.z + cos * aheadDist;
    const ag = groundInfo(ax, az, state.y);
    const aheadY = Math.abs(ag.y - state.y) < 25 ? ag.y : state.y;
    if (state.chase) {
      camera.position.set(state.x - sin * 22, state.y + 8.5, state.z - cos * 22);
      camTarget.set(ax, aheadY + 2, az);
    } else {
      camera.position.set(state.x - sin * 1.2, state.y + 2.7, state.z - cos * 1.2);
      camTarget.set(ax, aheadY + 1.6, az);
    }
    camera.lookAt(camTarget);
  }

  sun.position.set(state.x + 1250, 820, state.z - 700);
  sun.target.position.set(state.x, 0, state.z);

  for (const t of treeBillboards) {
    t.rotation.y = Math.atan2(camera.position.x - t.position.x, camera.position.z - t.position.z);
  }
  hudEl.textContent = Math.round(state.speed / DISP2MS) + ' mph';
}

// ---------- loop ----------
let last = performance.now(), acc = 0, frames = 0, fpsT = 0, fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  if (state.driving && path.length) {
    acc += dt;
    while (acc >= 1 / 60) { step(1 / 60); acc -= 1 / 60; }
  }
  if (path.length) updateVisuals();
  renderer.render(scene, camera);
  frames++; fpsT += (now - (frame.pt || now)) / 1000; frame.pt = now;
  if (fpsT >= 1) { fps = frames / fpsT; frames = 0; fpsT = 0; }
}

// ---------- menu flow ----------
function startDrive() {
  menuEl.style.display = 'none';
  hudEl.style.display = 'block';
  hintEl.style.display = 'block';
  state.driving = true;
}
function showMenu() {
  menuEl.style.display = 'flex';
  hudEl.style.display = 'none';
  hintEl.style.display = 'none';
  state.driving = false;
  state.speed = 0;
}
document.getElementById('btn-drive').addEventListener('click', startDrive);

buildWorld().then(() => {
  requestAnimationFrame(frame);
  if (qs.get('drive') === '1') startDrive();
  window.__remake = {
    ready: true,
    state,
    path: () => path,
    deckAt, terrainH, respawn, roadAt,
    teleport: (idx, chase) => {
      state.s = cum[((idx % path.length) + path.length) % path.length];
      state.lat = 0; state.speed = 0; state.vy = 0; state.airborne = false;
      state.y = roadAt(state.s).y;
      if (chase != null) state.chase = chase;
      syncWorldPose();
    },
    startIdx: () => startIdx,
    fps: () => fps,
    version: 5,
    __t: { renderer, scene, sun, hemi, camera, THREE },
  };
});
