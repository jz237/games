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
// original longitudinal constants converted to m/s at 60Hz:
// thrust 240 raw ≈ 10.4 display/s; wind −v/256 ≈ −0.0303/s; quadratic drag
// (ReduceWorldAcceleration >>16 >>5) ≈ −0.000663·v_disp²/s; boost = ×2.
const T_MS = 11.0 * (181 / 48);
const WIND_S = 0.0303;
const QDRAG_MS = 0.000663 / (181 / 48);
const THRUST_D = 10.4, CDRAG_D = 0.000663; // rival AI uses display-unit form
// the crane LOWERS the car and drops it STATIONARY (the ritual that opens
// every SCR race); the old rolling-start misread a W-held trace
const CRANE_DROP_H = 13, CRANE_RATE = 6.0, CRANE_REL = 2.4; // m, m/s, release height
// steering feel: player authority + how hard the road re-aligns the car.
// The original lets full lock steer right off the track; a too-strong align
// spring makes the remake understeer/on-rails. ?sa= / ?ak= override for tuning.
const STEER_AUTH = parseFloat(qs.get('sa')) || 0.9;
const ALIGN_K = parseFloat(qs.get('ak')) || 5.0;
// all 8 traced tracks, division order; craneBack = slats before the start
// line where the crane drops you (measured 283 on Little Ramp; others get a
// nominal offset until their race-flow measurement)
const TRACKS = {
  'little-ramp':     { name: 'Little Ramp',     craneBack: 283 },
  'hump-back':       { name: 'Hump Back',       craneBack: 24 },
  'stepping-stones': { name: 'Stepping Stones', craneBack: 24 },
  'big-ramp':        { name: 'Big Ramp',        craneBack: 24 },
  'roller-coaster':  { name: 'Roller Coaster',  craneBack: 24 },
  'high-jump':       { name: 'High Jump',       craneBack: 24 },
  'ski-jump':        { name: 'Ski Jump',        craneBack: 24 },
  'draw-bridge':     { name: 'Draw Bridge',     craneBack: 24 },
};
const trackId = TRACKS[qs.get('track')] ? qs.get('track') : 'little-ramp';
const CRANE_BACK = TRACKS[trackId].craneBack;
// fx=low: no shadows/AA, 1x pixels, lighter world — mobile + headless proxy
const FX = qs.get('fx') || (navigator.hardwareConcurrency <= 4 ? 'low' : 'high');

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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: FX !== 'low' });
renderer.setPixelRatio(FX === 'low' ? 0.7 : Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = FX !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const FOG_COLOR = 0xa4b8c4; // aerial-perspective haze; blends terrain edge into the mountains
scene.fog = new THREE.Fog(FOG_COLOR, 1600, 4600);
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
const sun = new THREE.DirectionalLight(0xfff0d4, 2.5);
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
const hemi = new THREE.HemisphereLight(0xbdd7f2, 0x4a5d38, 0.35); // env IBL provides most sky ambient
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
const grassTex = loadTex('images/tex-grass2.jpg', 260, 260);
const asphaltTex = loadTex('images/tex-asphalt3.jpg', 1, 1);
const wallTex = loadTex('images/tex-wall.jpg', 1, 1);

// ---------- sky dome + mountain ring ----------
// Photoreal 360 alpine environment: the equirectangular panorama becomes both
// the world backdrop AND image-based lighting, the way the title render looks.
// A tinted gradient dome shows immediately so the first frame is never black.
(function buildSky() {
  const cnv = document.createElement('canvas');
  cnv.width = 4; cnv.height = 256;
  const g = cnv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#2f6fd0'); grad.addColorStop(0.5, '#6fa0dc');
  grad.addColorStop(0.82, '#bcd2e6'); grad.addColorStop(1.0, '#8fa39a');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const domeTex = new THREE.CanvasTexture(cnv);
  domeTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = domeTex;

  texLoader.load('images/env-alpine.jpg', (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    scene.background = tex;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose();
    } catch (e) { /* IBL optional — background still shows */ }
  });
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
      if (gapSeg.has(j)) continue; // chasms have no deck to land on
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
        best = { seg: j, t, lat: cross > 0 ? d : -d, halfW: w / 2, y: cy + (bank / w) * (cross > 0 ? d : -d), cy, slope: (b.y - a.y) * il, bank, w, fx: abx * il, fz: abz * il, angle: Math.atan2(abx * il, abz * il) };
      }
    }
  }
  return best;
}

// terrain: rolling hills, dished + flattened near the track
function terrainH(x, z) {
  const n = vnoise(x / 340 + 7.3, z / 340 + 2.1) * 0.65
          + vnoise(x / 120 + 3.7, z / 120 + 9.4) * 0.35;
  const hills = (n - 0.42) * 70;
  const d = pathDist(x, z);
  const f = sstep(35, 190, d);
  // gentle rise only at the very edge, lifting the meadow to meet the mountains
  const rim = sstep(2500, 3200, Math.hypot(x, z)) * 90;
  return hills * f - 2 * (1 - f) + rim;
}

// ---------- build world from track JSON ----------
const treeBillboards = [];
const car = new THREE.Group();
car.rotation.order = 'YXZ'; // yaw, then pitch/roll in car-local axes
const rivalCar = new THREE.Group();
rivalCar.rotation.order = 'YXZ';
let startIdx = 0;
// ROAD-RELATIVE physics like the 1989 engine: the car lives in (s, lat, y)
// road coordinates — the road carries you around corners (blind-W drives a
// lap, exactly as the original's telemetry shows); steering moves `lat`.
const state = {
  s: 0, lat: 0, y: 0, vx: 0, vz: 0,
  x: 0, z: 0, heading: 0,       // derived world pose (render + rigs)
  speed: 0, vy: 0, airborne: false, driving: false, chase: false,
  pt: 0,                         // physics time — headless wall-clock lies
  grind: false,
  lap: 0, lapT0: 0, lastLap: null, best: null,
  relPrev: 0, lastMoveT: 0, wrecking: false,
  boost: 34, boosting: false,
  craneT: -1, lastImpact: 0,
  pitch: 0, roll: 0, pitchV: 0, rollV: 0,
  yawOff: 0, yawV: 0, accLatch: false, contactF: 0, engAcc: 0,
  wDmg: [0, 0, 0],   // per-wheel damage FL, FR, R (original tracks each)
  wOld: [0, 0, 0], wAmt: [0, 0, 0],   // per-wheel contact memory FL, FR, R
};
// three-wheel contact geometry (car frame: x lateral, z forward-negative)
const WHEELS = [
  { dx: -1.9, dz: -2.3 },  // front left
  { dx: 1.9, dz: -2.3 },   // front right
  { dx: 0.0, dz: 2.4 },    // rear axle
];
// contact model ported from the original's CalculateWheelCollision:
// clamped height difference + INCREASE-extrapolated amount-below-road
const W_INCREASE = 276 / 256, W_CLAMP_UP = 2.0, W_CLAMP_DOWN = -0.3;
const W_K = 90, W_AMT_CAP = 1.3; // spring rate + per-wheel force cap (m, m/s²·m)
const I_PITCH = 11, I_ROLL = 4;
const rival = { s: 0, speed: 0, on: true };
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
// segments longer than ~30m are REAL deck gaps (chasms you must jump);
// one-slat chain hiccups (~21m) stay bridged
const gapSeg = new Set();
function markGaps() {
  gapSeg.clear();
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    const dxz = Math.hypot(b.x - a.x, b.z - a.z);
    const dy = Math.abs(b.y - a.y);
    // long jumps OR near-vertical chain sew-ups across a chasm = void
    if (Math.hypot(dxz, dy) > 30 || dy / Math.max(dxz, 0.1) > 0.8) gapSeg.add(i);
  }
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
    gap: gapSeg.has(i),
  };
}

async function buildWorld() {
  const raw = await (await fetch('tracks/' + trackId + '.json')).json();
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
  markGaps();

  // --- terrain (after grid exists) ---
  {
    const SIZE = 6400, SEG = FX === 'low' ? 100 : 160;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrainH(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, FX === 'low' ? new THREE.MeshLambertMaterial({ map: grassTex }) : new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1.0 }));
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
    const mat = new THREE.MeshStandardMaterial({ map: sheet, alphaTest: 0.5, side: FX === 'low' ? THREE.FrontSide : THREE.DoubleSide, roughness: 1.0 });
    let placed = 0, tries = 0;
    while (placed < (FX === 'low' ? 70 : 160) && tries < 900) {
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
      if (gapSeg.has(i)) continue; // no deck across chasms
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
      if (gapSeg.has(i)) continue; // no deck across chasms
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
      if (gapSeg.has(i)) continue; // no structure across chasms
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
    // rival: same silhouette, red livery
    const rBody = new THREE.MeshStandardMaterial({ color: 0xb03030, roughness: 0.45, metalness: 0.35 });
    const rb = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.15, 6.6), rBody);
    rb.position.y = 1.05; rb.castShadow = true; rivalCar.add(rb);
    const rn = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 2.2), rBody);
    rn.position.set(0, 0.85, -4.2); rn.castShadow = true; rivalCar.add(rn);
    for (const [wx, wz] of [[-2.2, -2.3], [2.2, -2.3], [-2.2, 2.4], [2.2, 2.4]]) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(wx, 1.0, wz); w.castShadow = true; rivalCar.add(w);
    }
    scene.add(rivalCar);
  }
  try { state.best = parseFloat(localStorage.getItem('scr-remake-best-' + trackId)) || null; } catch (e) {}
  respawn();
}

function respawn() {
  const N2 = path.length;
  const i0 = (startIdx - CRANE_BACK + N2) % N2;
  state.s = cum[i0]; state.lat = 0;
  const r = roadAt(state.s);
  state.x = r.x; state.z = r.z; state.heading = r.angle;
  state.vx = 0; state.vz = 0; state.vy = 0;
  state.speed = 0; state.airborne = false;
  state.yawV = 0; state.accLatch = false;
  state.pitch = 0; state.roll = 0; state.pitchV = 0; state.rollV = 0;
  state.craneT = 0; state.y = r.y + CRANE_DROP_H;
  state.lap = 0; state.lapT0 = state.pt; state.lastLap = null; state.boost = 34;
  state.damage = 0; state.wDmg = [0, 0, 0];
  state.relPrev = ((state.s - cum[startIdx]) % total + total) % total;
  state.lastMoveT = state.pt;
  rival.s = state.s + 32; rival.speed = 0;
}
function syncWorldPose() { /* world pose IS the state now */ }

// ---------- input ----------
const keys = {};
const gp = { w: false, a: false, s: false, d: false };
// mouse driving: cursor X across the window = steering, left-click = accelerate,
// right-click = brake. Only while driving (menu clicks stay normal).
const mouse = { steer: 0, accel: false, brake: false, active: false };
// touch: left/right thirds steer, middle accelerates, bottom-middle brakes
function applyTouches(list) {
  gp.tw = gp.ta = gp.ts = gp.td = false;
  for (const t of list) {
    const fx2 = t.clientX / window.innerWidth, fy = t.clientY / window.innerHeight;
    if (fx2 < 0.33) gp.ta = true;
    else if (fx2 > 0.67) gp.td = true;
    else if (fy > 0.72) gp.ts = true;
    else gp.tw = true;
  }
}
for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
  window.addEventListener(ev, (e) => {
    if (!state.driving) return;
    applyTouches(e.touches);
    e.preventDefault();
  }, { passive: false });
}
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  gp.w = gp.a = gp.s = gp.d = gp.b = false;
  for (const p of pads) {
    if (!p) continue;
    const ax = p.axes[0] || 0;
    if (ax < -0.3) gp.a = true;
    if (ax > 0.3) gp.d = true;
    if ((p.buttons[7] && p.buttons[7].pressed) || (p.buttons[0] && p.buttons[0].pressed)) gp.w = true;
    if ((p.buttons[6] && p.buttons[6].pressed) || (p.buttons[1] && p.buttons[1].pressed)) gp.s = true;
    if ((p.buttons[5] && p.buttons[5].pressed) || (p.buttons[2] && p.buttons[2].pressed)) gp.b = true;
  }
}
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyC' && state.driving) state.chase = !state.chase;
  if (e.code === 'KeyR' && state.driving) respawn();
  if (e.code === 'Escape' && state.driving) showMenu();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ---------- mouse driving ----------
window.addEventListener('mousemove', (e) => {
  if (!state.driving) return;
  mouse.active = true;
  const nx = (e.clientX / window.innerWidth - 0.5) * 2;   // -1 (left) .. +1 (right)
  mouse.steer = Math.max(-1, Math.min(1, nx * 1.8));      // ~55% travel = full lock
});
window.addEventListener('mousedown', (e) => {
  if (!state.driving) return;
  if (e.button === 0) mouse.accel = true;
  else if (e.button === 2) mouse.brake = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.accel = false;
  else if (e.button === 2) mouse.brake = false;
});
window.addEventListener('contextmenu', (e) => { if (state.driving) e.preventDefault(); });

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
  // ---- crane: lowered on chains above the drop point, released stationary ----
  if (state.craneT >= 0) {
    state.craneT += dt;
    const d0 = deckAt(state.x, state.z);
    const baseY = d0 ? d0.y : terrainH(state.x, state.z);
    state.y = baseY + Math.max(CRANE_REL, CRANE_DROP_H - CRANE_RATE * state.craneT);
    state.vx = 0; state.vz = 0; state.vy = 0; state.speed = 0;
    const craneEl2 = document.getElementById('crane');
    if (craneEl2) craneEl2.style.display = 'block';
    if (CRANE_DROP_H - CRANE_RATE * state.craneT <= CRANE_REL) {
      state.craneT = -1;
      if (craneEl2) craneEl2.style.display = 'none';
      state.lastMoveT = state.pt;
    }
    state.pt += dt;
    return;
  }
  // ---- autopilot (headless audits): aim at the centreline ahead, brake for turns ----
  if (window.__autopilot && state.driving) {
    const A = window.__autopilot;
    gp.ta = gp.td = gp.ts = false;
    if (A.dSign === undefined) { // calibrate: which way does "right" turn heading?
      if (A.calT === undefined) { A.calT = 0; A.h0 = state.heading; }
      A.calT += dt;
      gp.td = true;
      if (A.calT > 0.35) {
        let dh = state.heading - A.h0;
        while (dh > Math.PI) dh -= 2 * Math.PI;
        while (dh < -Math.PI) dh += 2 * Math.PI;
        A.dSign = dh >= 0 ? 1 : -1;
        gp.td = false;
      }
    } else {
      const spdA = Math.hypot(state.vx, state.vz);
      const onDeck = !!deckAt(state.x, state.z);
      const ahead = onDeck ? Math.max(45, spdA * 0.9) : 0; // off-road: return to the road
      const rA = roadAt(state.s + ahead);
      if (!onDeck && spdA > 60) gp.ts = true;
      let want = Math.atan2(rA.x - state.x, rA.z - state.z) - state.heading;
      while (want > Math.PI) want -= 2 * Math.PI;
      while (want < -Math.PI) want += 2 * Math.PI;
      if (Math.abs(want) > 2.6) { gp.td = true; gp.ta = false; } // target behind: commit to one side
      else if (want * A.dSign > 0.05) gp.td = true;
      else if (want * A.dSign < -0.05) gp.ta = true;
      // anticipatory braking: corner-speed rule shared with the rival AI
      let kmax = 1e-4;
      const ri2 = roadAt(state.s).i;
      for (let j = 0; j < 14; j++) kmax = Math.max(kmax, Math.abs(seg[(ri2 + j) % path.length].k));
      const vT = Math.sqrt(1400 / kmax);
      if (spdA > vT || (Math.abs(want) > 1 && spdA > 40)) gp.ts = true;
    }
  }
  const fwd = keys['KeyW'] || keys['ArrowUp'] || gp.w || gp.tw || mouse.accel;
  const brk = keys['KeyS'] || keys['ArrowDown'] || gp.s || gp.ts || mouse.brake;
  const left = keys['KeyA'] || keys['ArrowLeft'] || gp.a || gp.ta;
  const right = keys['KeyD'] || keys['ArrowRight'] || gp.d || gp.td;
  state.grind = false;
  if (fwd) state.accLatch = true;
  if (brk) state.accLatch = false;

  const Fx = Math.sin(state.heading), Fz = Math.cos(state.heading); // forward
  const Lx = Math.cos(state.heading), Lz = -Math.sin(state.heading); // left

  // ---- three-wheel WORLD contacts (the original's trike, in world space) ----
  let totalF = 0, pitchT = 0, rollT = 0, contacts = 0, maxComp = 0;
  let pushX = 0, pushZ = 0, grass = false;
  const wheelBelow = [0, 0, 0];
  let refDeck = null;
  for (let w = 0; w < 3; w++) {
    const ww = WHEELS[w];
    const wx = state.x + Fx * -ww.dz + Lx * ww.dx;
    const wz = state.z + Fz * -ww.dz + Lz * ww.dx;
    const d = deckAt(wx, wz);
    let roadY, slope = 0, sfx = 0, sfz = 0, bankLat = 0, latDirX = 0, latDirZ = 0;
    if (d && Math.abs(d.lat) <= d.halfW + 0.4) {
      roadY = d.y; slope = d.slope; sfx = d.fx; sfz = d.fz;
      bankLat = d.bank / d.w; latDirX = -d.fz; latDirZ = d.fx;
      if (!refDeck || w === 2) refDeck = d;
    } else {
      roadY = terrainH(wx, wz); // grass is drivable, punishingly
      grass = true;
    }
    const hW = state.y + ww.dz * state.pitch + ww.dx * state.roll;
    let diff = roadY - hW;
    if (diff > W_CLAMP_UP) diff = W_CLAMP_UP;
    if (diff < W_CLAMP_DOWN) diff = W_CLAMP_DOWN;
    let amt = (diff - state.wOld[w]) * W_INCREASE + diff;
    if (amt < 0) amt = 0;
    state.wOld[w] = diff;
    state.wAmt[w] = amt;
    wheelBelow[w] = amt;
    if (amt > 0) {
      contacts++;
      const F = Math.min(amt, W_AMT_CAP) * W_K;
      totalF += F;
      pitchT += F * ww.dz;
      rollT += F * ww.dx;
      // surface-normal tilt: climbing decelerates, banking pushes sideways
      pushX += F * (-slope * sfx - bankLat * latDirX) * 0.9;
      pushZ += F * (-slope * sfz - bankLat * latDirZ) * 0.9;
      if (amt > maxComp) maxComp = amt;
    }
  }
  const wasAirborne = state.airborne;
  state.airborne = contacts === 0;
  // low-pass for the grip rule (the original's ~8Hz step ignores brief hops)
  state.contactF = (state.contactF || 0) + (totalF - (state.contactF || 0)) * Math.min(1, 6 * dt);

  // ---- vertical + attitude ----
  state.vy += (-GRAV + totalF) * dt;
  if (contacts > 0) state.vy *= Math.max(0, 1 - 6 * dt);
  state.y += state.vy * dt;
  if (wasAirborne && contacts > 0) {
    state.lastImpact = Math.max(state.lastImpact, Math.abs(state.vy) + maxComp * 8);
    for (let w = 0; w < 3; w++) {
      if (wheelBelow[w] > 1.2) state.wDmg[w] = Math.min(40, state.wDmg[w] + (wheelBelow[w] - 1.2) * 9);
    }
    state.damage = (state.wDmg[0] + state.wDmg[1] + state.wDmg[2]) / 3;
  }
  // Attitude: a STABLE critically-damped lean toward the road grade, NOT raw
  // wheel-torque integration — that feedback loop was underdamped and tipped
  // the car onto its side (~30 deg roll) on flat straights. Vertical bounce
  // still comes from the wheel forces above; this only orients the body.
  if (contacts > 0 && refDeck) {
    const vLatNow = state.vx * Lx + state.vz * Lz;      // sideways speed (car frame)
    const tPitch = -Math.atan(Math.max(-0.35, Math.min(0.35, refDeck.slope)))
                   - Math.max(-0.10, Math.min(0.10, (state.engAcc || 0) * 0.0016)); // squat/wheelie
    const tRoll = -0.7 * Math.atan2(refDeck.bank, refDeck.w)            // road bank (damped; trace can be noisy)
                  - Math.max(-0.13, Math.min(0.13, vLatNow * 0.009));   // gentle cornering lean
    const kA = Math.min(1, 9 * dt);
    state.pitch += (tPitch - state.pitch) * kA;
    state.roll += (tRoll - state.roll) * kA;
    state.pitchV = 0; state.rollV = 0;
  } else {
    // airborne: hold, drift slowly toward level
    const kL = Math.min(1, 0.8 * dt);
    state.pitch += (0 - state.pitch) * kL;
    state.roll += (0 - state.roll) * kL;
  }
  state.pitch = Math.max(-0.45, Math.min(0.45, state.pitch));
  state.roll = Math.max(-0.26, Math.min(0.26, state.roll)); // ~15deg: real banking, never keels onto a wall
  // never sink through a deck under the car
  const dUnder = deckAt(state.x, state.z);
  if (dUnder && Math.abs(dUnder.lat) <= dUnder.halfW && state.y < dUnder.y - 0.6) {
    state.y = dUnder.y - 0.6;
    if (state.vy < 0) state.vy = 0;
  }

  // ---- longitudinal: thrust along the CAR's heading; drags on the velocity ----
  const spd = Math.hypot(state.vx, state.vz);
  const vFwd = state.vx * Fx + state.vz * Fz;
  const vd = vFwd / DISP2MS;
  let engine = 0;
  if (brk) engine = -T_MS;               // brake overrides throttle
  else if ((fwd || state.accLatch) && vd < 171.6) engine = T_MS;
  const boostKey = keys['ShiftLeft'] || keys['ShiftRight'] || gp.b;
  state.boosting = !!(boostKey && (state.accLatch || fwd || brk) && state.boost > 0);
  if (state.boosting) { engine *= 2; state.boost = Math.max(0, state.boost - 0.52 * dt); }
  const gripCap = 2 * (state.contactF || 0);
  if (Math.abs(engine) > gripCap) engine = Math.sign(engine) * gripCap;
  state.engAcc = engine;
  state.vx += Fx * engine * dt;
  state.vz += Fz * engine * dt;
  // drags (wind + quadratic + grass) act against the velocity vector
  const dragA = WIND_S * spd + QDRAG_MS * spd * spd + (grass && contacts > 0 ? 28 : 0);
  if (spd > 0.05) {
    const k = Math.min(1, dragA * dt / spd);
    state.vx -= state.vx * k;
    state.vz -= state.vz * k;
  }
  // surface-normal push (slopes and banking)
  state.vx += pushX * dt;
  state.vz += pushZ * dt;
  // lateral tyre grip (CalculateXAcceleration): kill sideways velocity fully
  // per original step, CAPPED at 2x contact force — sliding emerges beyond it
  const vLat = state.vx * Lx + state.vz * Lz;
  if (contacts > 0) {
    const want = Math.abs(vLat) * Math.min(1, 8.3 * dt);
    const cap = gripCap * dt;
    const kill = Math.sign(vLat) * Math.min(want, cap);
    state.vx -= Lx * kill;
    state.vz -= Lz * kill;
  }

  // ---- steering (CalculateSteering + AlignCarWithRoad + per-piece
  // steeringAmount): grounded, THE ROAD TURNS THE CAR — feed-forward its
  // curvature rate plus an error spring; the player's stick adjusts on top.
  // Airborne: nothing steers you. Sliding happens via the grip cap.
  // steer input, then REVERSED per user request. A held steer key/touch/pad
  // takes priority; otherwise the mouse cursor position steers (analog). Same
  // sign for both so keyboard and mouse always agree.
  let rightInput;
  if (left || right) rightInput = (right ? 1 : 0) - (left ? 1 : 0);
  else rightInput = mouse.active ? mouse.steer : 0;
  const steer = -Math.max(-1, Math.min(1, rightInput));
  const grounded2 = contacts > 0;
  state.yawV += steer * (STEER_AUTH * Math.max(0.25, Math.abs(vd) / 92)) * dt;
  if (grounded2 && refDeck) {
    const sg2 = seg[refDeck.seg];
    state.heading += sg2.k * vFwd * dt;           // the road's own turn rate
    let da = refDeck.angle - state.heading;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) < Math.PI / 2) state.heading += da * Math.min(1, ALIGN_K * dt);
  }
  state.yawV *= Math.max(0, 1 - (grounded2 ? 3 : 0.4) * dt);
  state.heading += state.yawV * dt;

  // ---- integrate world position ----
  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // ---- walls: impassable at deck height ----
  const dNow = deckAt(state.x, state.z);
  if (dNow && state.y > dNow.cy - 2.5 && state.y < dNow.cy + 4.5) {
    const lim = dNow.halfW - 1.6;
    if (Math.abs(dNow.lat) > lim && Math.abs(dNow.lat) < dNow.halfW + 1.5) {
      const sgn = dNow.lat > 0 ? 1 : -1;
      const latDirX = -dNow.fz * sgn, latDirZ = dNow.fx * sgn; // outward
      const overshoot = Math.abs(dNow.lat) - lim;
      state.x -= latDirX * overshoot;
      state.z -= latDirZ * overshoot;
      const vOut = state.vx * latDirX + state.vz * latDirZ;
      if (vOut > 0) {
        state.vx -= latDirX * vOut * 1.25; // slight rebound off the blocks
        state.vz -= latDirZ * vOut * 1.25;
        if (vOut > 12) {
          const side = sgn > 0 ? 0 : 1;
          state.wDmg[side] = Math.min(40, state.wDmg[side] + vOut * 0.12);
          state.damage = (state.wDmg[0] + state.wDmg[1] + state.wDmg[2]) / 3;
        }
      }
      state.grind = true;
    }
  }

  // ---- derived road coordinate (laps, HUD, camera, rival) ----
  if (dNow) {
    state.s = cum[dNow.seg] + dNow.t * (cum[dNow.seg + 1] - cum[dNow.seg]);
    state.lat = dNow.lat;
  }
  state.speed = spd;
  state.pt += dt;
  // lap line crossing (start line at cum[startIdx])
  const lineS = cum[startIdx];
  const rel = ((state.s - lineS) % total + total) % total;
  if (state.relPrev > total * 0.9 && rel < total * 0.1) {
    if (state.lap > 0) {
      const lapTime = state.pt - state.lapT0;
      state.lastLap = lapTime;
      if (!state.best || lapTime < state.best) {
        state.best = lapTime;
        try { localStorage.setItem('scr-remake-best-' + trackId, String(lapTime)); } catch (e) {}
      }
    }
    state.lap++;
    state.lapT0 = state.pt;
  }
  state.relPrev = rel;
  // off-track: grounded with no deck under the car (the original re-drops
  // after OFF_TRACK_LIMIT steps off the road)
  if (!dNow && contacts > 0) state.offT = (state.offT || 0) + dt;
  else state.offT = 0;
  if (state.offT > 3.5 && !state.wrecking && state.driving) craneRecover();
  // wreck watch: stuck under throttle or damage limit -> crane
  if (state.speed > 5 * DISP2MS || !fwd) state.lastMoveT = state.pt;
  if (!state.wrecking && state.driving &&
      ((state.pt - state.lastMoveT > 3 && state.pt > 4) || (state.damage || 0) >= 32)) {
    craneRecover();
  }
  // rival AI: road-relative follower (unchanged)
  if (rival.on) {
    const rv = rival.speed / DISP2MS;
    let kmax = 1e-4;
    const ri = roadAt(rival.s).i;
    for (let j = 0; j < 8; j++) kmax = Math.max(kmax, Math.abs(seg[(ri + j) % path.length].k));
    const vT = Math.min(VMAX * 0.93, Math.sqrt(1400 / kmax));
    if (rival.speed < vT) rival.speed += (THRUST_D * 0.93 - CDRAG_D * rv * rv) * DISP2MS * dt;
    else rival.speed -= 200 * dt;
    if (rival.speed < 0) rival.speed = 0;
    rival.s += rival.speed * dt;
  }
}

function craneRecover() {
  state.wrecking = true;
  const craneEl = document.getElementById('crane');
  if (craneEl) craneEl.style.display = 'block';
  setTimeout(() => {
    // re-drop at the last on-track position (the original re-drops at the
    // current piece), never inside a chasm
    let sBack = state.s - 30;
    for (let tries = 0; tries < 12; tries++) {
      const probe = roadAt(sBack);
      if (!gapSeg.has(probe.i)) break;
      sBack -= 15;
    }
    state.s = ((sBack % total) + total) % total;
    const rr2 = roadAt(state.s);
    state.x = rr2.x; state.z = rr2.z; state.heading = rr2.angle;
    state.lat = 0; state.offT = 0;
    state.vx = 0; state.vz = 0; state.vy = 0; state.speed = 0;
    state.airborne = false; state.yawV = 0; state.accLatch = false;
    state.pitch = 0; state.roll = 0; state.pitchV = 0; state.rollV = 0;
    state.craneT = 0; state.y = rr2.y + CRANE_DROP_H;
    state.lastMoveT = state.pt;
    state.damage = 0; state.wDmg = [0, 0, 0];
    state.wrecking = false;
    if (craneEl) craneEl.style.display = 'none';
  }, 1400);
}

// ---------- camera + visuals ----------
const camTarget = new THREE.Vector3();
function updateVisuals() {
  // visual suspension: spring-damper offset kicked by landings
  const V = updateVisuals;
  if (V.air === undefined) { V.air = false; V.sy = 0; V.syV = 0; }
  if (V.air && !state.airborne) { V.syV -= Math.min(40, state.lastImpact) * 0.035; state.lastImpact = 0; }
  V.air = state.airborne;
  V.syV += (-V.sy * 110 - V.syV * 9) * (1 / 40);
  V.sy = Math.max(-0.9, Math.min(0.9, V.sy + V.syV * (1 / 40)));
  car.position.set(state.x, state.y + V.sy, state.z);
  camera.userData.sy = V.sy; // cockpit cam inherits the bounce below
  // cockpit view never renders your own car (the dash overlay is the cockpit)
  car.visible = state.chase || !state.driving;
  const cockpitOn = state.driving && !state.chase;
  const cockpitEl = document.getElementById('cockpit');
  const dashEl = document.getElementById('dash');
  cockpitEl.style.display = cockpitOn ? 'block' : 'none';
  dashEl.style.display = cockpitOn ? 'block' : 'none';
  hudEl.style.display = state.driving && state.chase ? 'block' : 'none';
  if (cockpitOn) drawDash(dashEl);
  const r = roadAt(state.s);
  // attitude now comes straight from the wheel-contact physics
  car.rotation.set(state.pitch, state.heading + Math.PI, state.roll);
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
      camera.position.set(state.x - sin * 1.2, state.y + 2.7 + (camera.userData.sy || 0) * 0.8, state.z - cos * 1.2);
      camTarget.set(ax, aheadY + 1.6, az);
    }
    camera.lookAt(camTarget);
  }

  sun.position.set(state.x + 1250, 820, state.z - 700);
  sun.target.position.set(state.x, 0, state.z);

  if (rival.on && path.length) {
    const rr = roadAt(rival.s);
    const lx = -rr.fz, lz = rr.fx;
    rivalCar.position.set(rr.x + lx * 2.8, rr.y + (rr.bank / rr.w) * 2.8, rr.z + lz * 2.8);
    rivalCar.rotation.set(-Math.atan(rr.slope), rr.angle + Math.PI, 0);
  }

  for (const t of treeBillboards) {
    t.rotation.y = Math.atan2(camera.position.x - t.position.x, camera.position.z - t.position.z);
  }
  hudEl.textContent = Math.round(state.speed / DISP2MS) + ' mph';
}

// ---------- dash (320x200 space, HD-dash coordinates) ----------
function drawDash(cnv) {
  const g = cnv.getContext('2d');
  g.clearRect(0, 0, 320, 200);
  const vd = Math.min(92, state.speed / DISP2MS);
  // speedo bar: x101-245 y164 (green -> amber -> red)
  const w = Math.round(vd * 144 / 92);
  const grad = g.createLinearGradient(101, 0, 245, 0);
  grad.addColorStop(0, '#37d658'); grad.addColorStop(0.65, '#e8c33a'); grad.addColorStop(1, '#e84a3a');
  g.fillStyle = grad;
  g.fillRect(101, 164, w, 3);
  // left LCD: lap / boost placeholder
  g.font = 'bold 8px monospace';
  g.fillStyle = '#8fe6a0';
  g.fillText('L' + Math.max(0, state.lap), 10, 179);
  g.fillText('B' + Math.round(state.boost), 10, 189);
  // damage squiggle: red jagged line grows with damage
  const dmg = state.damage || 0;
  if (dmg > 0.5) {
    g.strokeStyle = '#e84a3a';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(52, 180);
    for (let i = 0; i < Math.min(40, dmg); i++) g.lineTo(54 + i, 180 + ((i % 2) ? 3 : -3));
    g.stroke();
  }
  const fmt = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0') + '.' + Math.floor((t % 1) * 10);
  // right LCD: current lap time + best
  g.fillStyle = '#e8d089';
  g.fillText(fmt(state.lap > 0 ? state.pt - state.lapT0 : 0), 262, 179);
  if (state.best) { g.fillStyle = '#9fd3e8'; g.fillText(fmt(state.best), 262, 189); }
  // speed digits above the bar
  g.fillStyle = '#dfe8f5';
  g.fillText(String(Math.round(vd)).padStart(2, ' '), 230, 161);
}

// ---------- loop ----------
let last = performance.now(), acc = 0, frames = 0, fpsT = 0, fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  pollGamepad();
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
{ const b = document.getElementById('btn-drive'); if (b) b.addEventListener('click', startDrive); }

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
      const rt = roadAt(state.s);
      state.x = rt.x; state.z = rt.z; state.heading = rt.angle;
      state.lat = 0; state.speed = 0; state.vx = 0; state.vz = 0; state.vy = 0;
      state.airborne = false; state.y = rt.y;
      if (chase != null) state.chase = chase;
    },
    startIdx: () => startIdx,
    fps: () => fps,
    version: 19,
    __t: { renderer, scene, sun, hemi, camera, THREE },
  };
});
