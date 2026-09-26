// world.js — builds one area from its level data: terrain, water, vegetation,
// props, night lights, and the collision set that matches them one-to-one.
// A World is built per area and disposed when the next one loads.
import * as THREE from 'three';
import { Terrain, groundMaterial, waterMaterial, X_EXTENT } from './terrain.js';
import * as M from './models.js';
import * as M2 from './models2.js';
import * as TX from './textures.js';
import * as QA from './assets.js';
import { mulberry, fbm, smooth, clamp } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WIND = { uTime: { value: 0 } };

function windify(mat, amp) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float wh = max(0.0, transformed.y);
        vec3 wip = vec3(0.0);
        #ifdef USE_INSTANCING
          wip = instanceMatrix[3].xyz;
        #endif
        float wph = uTime * 1.25 + wip.x * 0.31 + wip.z * 0.23;
        float gust = 0.7 + 0.3 * sin(uTime * 0.37 + wip.z * 0.05);
        transformed.x += sin(wph) * ${amp.toFixed(4)} * wh * wh * gust;
        transformed.z += cos(wph * 0.83) * ${(amp * 0.6).toFixed(4)} * wh * wh * gust;`);
    // two-sided foliage: never let a back face flip its normal underground
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      if (dot(normal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz) < 0.0) normal = -normal;`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp;
  return mat;
}
function foliageMats(map, amp, extra = {}) {
  const mat = windify(new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true, ...extra }), amp);
  const depth = windify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45, side: THREE.DoubleSide }), amp);
  return { mat, depth };
}

// ------------------------------------------------------------------ Quaternius models
// materials for the textured models; built once and shared by every area
const qMats = new Map();
function qMat(map, amp, alpha) {
  const key = map.uuid + '/' + amp + '/' + alpha;
  if (qMats.has(key)) return qMats.get(key);
  const cut = alpha ? { alphaTest: 0.5, side: THREE.DoubleSide } : {};
  let mat = new THREE.MeshStandardMaterial({ map, roughness: 0.88, ...cut });
  let depth = alpha ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, ...cut }) : null;
  if (amp > 0) { mat = windify(mat, amp); if (depth) depth = windify(depth, amp); }
  mat.userData.shared = true; if (depth) depth.userData.shared = true;
  const m = { mat, depth };
  qMats.set(key, m);
  return m;
}
// kind table entries: [geometry, material, shadow-depth material] per part
let QK = null;
// palms: a curved, ringed trunk wrapped in the MegaKit bark, crowned with two
// layers of the MegaKit fern (its long pinnate fronds read as coconut-palm
// fronds from above) and a cluster of coconuts, so palms match the textured
// jungle around them
const PALM_AMP = 0.0016;
function palmParts(seed) {
  const r = mulberry(seed);
  const H = 6.4 + r() * 2.4, lean = 0.5 + r() * 1.4, la = r() * Math.PI * 2;
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, bend = Math.pow(t, 1.7) * lean; pts.push(new THREE.Vector3(Math.cos(la) * bend, t * H, Math.sin(la) * bend)); }
  const curve = new THREE.CatmullRomCurve3(pts), frames = curve.computeFrenetFrames(32, false);
  const seg = 32, rad = 9, pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, P = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i];
    // tapering, with a bulge at the base and a ring every ~22 cm
    const R = 0.23 * (1 - t * 0.4) * (1 + Math.max(0, 0.12 - t) * 3) * (1 + 0.06 * Math.abs(Math.sin(t * H * 14)));
    for (let j = 0; j <= rad; j++) {
      const a = j / rad * Math.PI * 2, cx = Math.cos(a), sx = Math.sin(a);
      pos.push(P.x + (N.x * cx + B.x * sx) * R, P.y + (N.y * cx + B.y * sx) * R, P.z + (N.z * cx + B.z * sx) * R);
      uv.push(j / rad * 1.5, t * H / 1.3);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const tube = new THREE.BufferGeometry();
  tube.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tube.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  tube.setIndex(idx); tube.computeVertexNormals();
  const top = curve.getPointAt(1);
  // coconuts: a few spheres under the crown (the bark texture reads as husk)
  const parts = [tube];
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    parts.push(new THREE.SphereGeometry(0.15, 8, 6).translate(top.x + Math.cos(a) * 0.22, top.y - 0.3 - r() * 0.15, top.z + Math.sin(a) * 0.22));
  }
  const trunk = mergeGeometries(parts, false);
  const fern = QA.texturedParts('nature', 'mk-fern', { w: 1 }).parts[0];
  const layer = (w, rot, dy, tilt) => {
    const g = fern.geo.clone();
    g.scale(w, w * 0.9, w).rotateY(rot);
    if (tilt) g.rotateX(tilt);
    return g.translate(top.x, top.y + dy, top.z);
  };
  const crown = mergeGeometries([layer(5.4 + r() * 1.4, r() * 6.28, -0.45, 0), layer(3.6 + r() * 0.8, r() * 6.28, -0.15, (r() - 0.5) * 0.25)], false);
  trunk.userData.shared = crown.userData.shared = true;
  return { trunk, crown, leaf: fern.map };
}

function qKinds() {
  if (QK) return QK;
  const tex = (n, fit, amp) => QA.texturedParts('nature', n, fit).parts.map((p) => { const m = qMat(p.map, amp, p.alpha); return [p.geo, m.mat, m.depth]; });
  const bark = QA.texturedParts('nature', 'mk-tree-1', { h: 9.5 }).parts.find((p) => !p.alpha).map;
  const palm = (seed) => {
    const P = palmParts(seed), bm = qMat(bark, PALM_AMP, false), lm = qMat(P.leaf, PALM_AMP, true);
    bm.mat.color.setRGB(0.66, 0.66, 0.68);     // greyer than the reddish tree bark
    lm.mat.color.setRGB(0.66, 0.72, 0.54);     // fronds a little older than the fern's lime
    return [[P.trunk, bm.mat, bm.depth], [P.crown, lm.mat, lm.depth]];
  };
  QK = {
    palm0: palm(11), palm1: palm(23), palm2: palm(37), palm3: palm(51),
    tree0: tex('mk-tree-1', { h: 9.5 }, 0.0011), tree1: tex('mk-tree-2', { h: 9.5 }, 0.0011),
    bigleaf: tex('mk-plant-big-2', { h: 2.2 }, 0.02), plant: tex('mk-plant', { h: 1.25 }, 0.03),
    fbush: tex('mk-bush-flowers', { h: 1.45 }, 0.02), rbush: tex('mk-bush', { h: 1.2 }, 0.02),
    qfern: tex('mk-fern', { w: 2.6 }, 0.03), tallgrass: tex('mk-tall-grass', { h: 1.1 }, 0.06), wisp: tex('mk-grass-wispy', { h: 0.75 }, 0.06),
    rock0: tex('mk-rock-1', { w: 1.9 }, 0), rock1: tex('mk-rock-2', { w: 1.9 }, 0),
    snag0: tex('mk-dead-tree-1', { h: 7.5 }, 0.0006), snag1: tex('mk-dead-tree-2', { h: 7.5 }, 0.0006),
  };
  return QK;
}
// a Quaternius kind as one placed object (props that aren't instanced)
function qObject(parts) {
  const g = new THREE.Group();
  for (const [geo, mat, depth] of parts) {
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
    if (depth) m.customDepthMaterial = depth;
    g.add(m);
  }
  return g;
}
// flat-colour props (KolosStudios Military Pack, Toon Shooter kit), drawn with the shared vertex-colour material
const PROP_FIT = {
  crate: { w: 1.0 }, tires: { w: 1.5 }, pallet: { w: 1.5 }, 'debris-pile': { w: 2.4 }, 'sack-trench': { w: 3.2 },
  'sack-trench-small': { w: 2.3 }, 'broken-car': { l: 5.2 }, grenade: { h: 0.3 },
  'kolos-container': { w: 5.2 }, 'kolos-water-tank': { w: 1.25 }, 'kolos-tent': { w: 6.0, ry: Math.PI / 2 }, 'kolos-barrier': { w: 3.0 },
};
const PROP_TINT = { 'debris-pile': { Red: '#6e5236' } };
export const propGeo = (name, tint = PROP_TINT[name]) => QA.flatGeo('props', name, PROP_FIT[name] || {}, tint);

// every canvas texture is painted once and shared by all areas
let SHARED = null;
export function sharedTextures() {
  if (SHARED) return SHARED;
  SHARED = {
    ground: TX.groundDetail(), grass: TX.grassCard(), frond: TX.frondTexture(), leaf: TX.leafTexture(),
    thatch: TX.thatchTexture(), planks: TX.planksTexture(), stone: TX.stoneTexture(), concrete: TX.concreteTexture(),
    burlap: TX.burlapTexture(), helipad: TX.helipadTexture(), fence: TX.fenceTexture(), beam: TX.beamTexture(),
  };
  M.initMaterials(SHARED);
  return SHARED;
}

// ------------------------------------------------------------------ collision
const NONE = [];
const MASK = { k: 'mask', alive: true, water: true };
export class Colliders {
  constructor() { this.list = []; this.grid = new Map(); this.CELL = 6; this._stamp = 0; this.mask = null; }
  _cells(p0, p1) { const a = Math.floor(p0 / this.CELL), b = Math.floor(p1 / this.CELL); const out = []; for (let i = a; i <= b; i++) out.push(i); return out; }
  add(c) {
    c.alive = true;
    let pMin, pMax;
    if (c.k === 'c') { pMin = c.p - c.r; pMax = c.p + c.r; }
    else if (c.k === 'b') { const e = Math.hypot(c.hw, c.hp); pMin = c.p - e; pMax = c.p + e; c.cos = Math.cos(c.rot || 0); c.sin = Math.sin(c.rot || 0); }
    else { pMin = Math.min(c.p0, c.p1) - c.r; pMax = Math.max(c.p0, c.p1) + c.r; }
    for (const i of this._cells(pMin, pMax)) { if (!this.grid.has(i)) this.grid.set(i, []); this.grid.get(i).push(c); }
    this.list.push(c);
    return c;
  }
  // every collider in the cells spanning [p - pad, p + pad], each once
  near(p, pad = 0) {
    const a = Math.floor((p - pad) / this.CELL), b = Math.floor((p + pad) / this.CELL);
    if (a === b) return this.grid.get(a) || NONE;
    const out = [], stamp = ++this._stamp;
    for (let i = a; i <= b; i++) for (const c of this.grid.get(i) || NONE) if (c._s !== stamp) { c._s = stamp; out.push(c); }
    return out;
  }
  // signed-ish penetration test: returns push vector for a circle at (x,p,r)
  static push(c, x, p, r) {
    if (c.k === 'c') {
      const dx = x - c.x, dp = p - c.p, d = Math.hypot(dx, dp), m = c.r + r;
      if (d >= m) return null;
      if (d < 1e-5) return [m, 0];
      return [dx / d * (m - d), dp / d * (m - d)];
    }
    if (c.k === 'b') {
      const dx = x - c.x, dp = p - c.p;
      const lx = dx * c.cos + dp * c.sin, lp = -dx * c.sin + dp * c.cos;
      const cx = clamp(lx, -c.hw, c.hw), cp = clamp(lp, -c.hp, c.hp);
      let ox = lx - cx, op = lp - cp, d = Math.hypot(ox, op);
      let px, pp;
      if (d > 1e-5) { if (d >= r) return null; px = ox / d * (r - d); pp = op / d * (r - d); }
      else {
        const ex = c.hw - Math.abs(lx), ep = c.hp - Math.abs(lp);
        if (ex < ep) { px = Math.sign(lx || 1) * (ex + r); pp = 0; } else { px = 0; pp = Math.sign(lp || 1) * (ep + r); }
      }
      return [px * c.cos - pp * c.sin, px * c.sin + pp * c.cos];
    }
    // capsule segment
    const vx = c.x1 - c.x0, vp = c.p1 - c.p0, L2 = vx * vx + vp * vp;
    const t = clamp(((x - c.x0) * vx + (p - c.p0) * vp) / (L2 || 1), 0, 1);
    const qx = c.x0 + vx * t, qp = c.p0 + vp * t;
    const dx = x - qx, dp = p - qp, d = Math.hypot(dx, dp), m = c.r + r;
    if (d >= m) return null;
    if (d < 1e-5) return [0, -m];
    return [dx / d * (m - d), dp / d * (m - d)];
  }
  resolve(x, p, r, who = 'joe') {
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const c of this.near(p, r + 3)) {
        if (!c.alive) continue;
        if (who === 'enemy' && c.enemyPass) continue;
        const v = Colliders.push(c, x, p, r);
        if (v) { x += v[0]; p += v[1]; moved = true; }
      }
      if (!moved) break;
    }
    return [x, p];
  }
  // move from (x0,p0) toward (x1,p1): push out of colliders, then slide along
  // water the mover can't enter
  move(x0, p0, x1, p1, r, who = 'joe') {
    let [x, p] = this.resolve(x1, p1, r, who);
    if (!this.mask || !this.mask(x, p, r)) return [x, p];
    [x, p] = this.resolve(x1, p0, r, who); if (!this.mask(x, p, r)) return [x, p];
    [x, p] = this.resolve(x0, p1, r, who); if (!this.mask(x, p, r)) return [x, p];
    return [x0, p0];
  }
  blocked(x, p, r, who = 'joe') {
    for (const c of this.near(p, r + 3)) {
      if (!c.alive || (who === 'enemy' && c.enemyPass)) continue;
      if (Colliders.push(c, x, p, r)) return c;
    }
    if (this.mask && who !== 'veg' && this.mask(x, p, r)) return MASK;
    return null;
  }
  // first bullet-stopping collider along a segment (sampled)
  bulletHit(x0, p0, x1, p1, skip = 0) {
    const L = Math.hypot(x1 - x0, p1 - p0), n = Math.max(1, Math.ceil(L / 0.18));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (t * L < skip) continue;
      const x = x0 + (x1 - x0) * t, p = p0 + (p1 - p0) * t;
      for (const c of this.near(p, 3)) {
        if (!c.alive || !c.bul) continue;
        if (Colliders.push(c, x, p, 0.02)) return { c, x, p, t };
      }
    }
    return null;
  }
  // line of sight; `skip` ignores cover right at the shooter's feet
  los(x0, p0, x1, p1, skip = 0) { return !this.bulletHit(x0, p0, x1, p1, skip); }
}

// which plants grow where: weights per biome
const VEG = {
  lz: { palm: 0.22, edge: 0.85, dry: 0, litter: 0.7, grass: 1.0 },
  jungle: { palm: 0.26, edge: 1.0, dry: 0, litter: 1.0, grass: 1.0 },
  scrub: { palm: 0.12, edge: 0.45, dry: 0.2, litter: 0.3, grass: 0.8 },
  river: { palm: 0.18, edge: 0.7, dry: 0, litter: 0.5, grass: 0.9 },
  desert: { palm: 0.03, edge: 0.12, dry: 0.35, litter: 0, grass: 0.4 },
  fort: { palm: 0.02, edge: 0.08, dry: 0.2, litter: 0, grass: 0.3 },
  beach: { palm: 0.2, edge: 0.45, dry: 0.05, litter: 0.2, grass: 0.5 },
  camp: { palm: 0.16, edge: 0.75, dry: 0, litter: 0.6, grass: 0.6 },
  ravine: { palm: 0.05, edge: 0.25, dry: 0.35, litter: 0.1, grass: 0.4, boulder: 1.0 },
  swamp: { palm: 0.05, edge: 0.55, dry: 0, litter: 0.15, grass: 0.4, dead: 0.35, reed: 1.6, lily: 1 },
  motor: { palm: 0.03, edge: 0.12, dry: 0.2, litter: 0, grass: 0.3 },
};

// ------------------------------------------------------------------ world
export class World {
  constructor(area, scene, quality, amb = {}) {
    this.area = area; this.scene = scene; this.quality = quality; this.amb = amb;
    this.terrain = new Terrain(area);
    this.terrain.wet = amb.wet || 0;
    this.col = new Colliders();
    const T = this.terrain;
    this.col.mask = (x, p, r) => T.waterBlocks(x, p) || T.waterBlocks(x + r * 0.7, p) || T.waterBlocks(x - r * 0.7, p) || T.waterBlocks(x, p + r * 0.7) || T.waterBlocks(x, p - r * 0.7);
    this.root = new THREE.Group(); scene.add(this.root);
    this.dyn = { barrels: [], crates: [], pits: [], towers: [], bunkers: [], fires: [], cages: [], searchlights: [], barracks: [], lamps: [], doors: null, flag: null };
    this.tex = sharedTextures();
    this.night = !!amb.night;
    this.buildGround();
    this.buildProps();
    this.buildVegetation();
    this.boundHalf = (p) => this.terrain.halfWidth(p) - 0.45;
  }

  h(x, p) { return this.terrain.height(x, p); }

  place(obj, x, p, rot = 0, yOff = 0) {
    obj.position.set(x, this.h(x, p) + yOff, -p);
    obj.rotation.y = rot;
    this.root.add(obj);
    return obj;
  }
  mesh(geo, mat, x, p, rot = 0, s = 1, yOff = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(s);
    m.castShadow = true; m.receiveShadow = true;
    return this.place(m, x, p, rot, yOff);
  }

  buildGround() {
    const A = this.area;
    const geo = this.terrain.buildMesh(-40, A.length + 45);
    this.groundMat = groundMaterial(this.amb.wet || 0, this.quality);
    const ground = this.ground = new THREE.Mesh(geo, this.groundMat);
    ground.receiveShadow = true;
    this.root.add(ground);
    // water: one animated sheet per body of water, carrying the depth to the
    // bed at every vertex (shallows clear and pale, foam along the shore)
    this.waterMat = waterMaterial(this.tex.ground.normal, this.amb.water, this.terrain.waters.some(w => w.murky));
    const step = this.quality === 'high' ? 0.6 : 1.0;
    for (const w of this.terrain.waters) {
      const band = w.t === 'band';
      const wd = band ? X_EXTENT * 2 : w.rx * 2 + 6, ht = band ? w.p1 - w.p0 + 8 : w.rp * 2 + 6;
      const cx = band ? 0 : w.x, cp = band ? (w.p0 + w.p1) / 2 : w.p;
      const g = new THREE.PlaneGeometry(wd, ht, Math.ceil(wd / step), Math.ceil(ht / step)).rotateX(-Math.PI / 2);
      const pos = g.attributes.position, dep = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) dep[i] = w.level - this.terrain.height(cx + pos.getX(i), cp - pos.getZ(i));
      g.setAttribute('depth', new THREE.BufferAttribute(dep, 1));
      const m = new THREE.Mesh(g, this.waterMat);
      m.position.set(cx, w.level, -cp);
      m.receiveShadow = true; m.renderOrder = 1;
      this.root.add(m);
    }
  }

  buildProps() {
    const A = this.area, col = this.col, tx = this.tex;
    const sandbags = [];   // [x, y, z, rotY, scale, shade]
    const bagRow = (pts, rows = 3) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, p0] = pts[i], [x1, p1] = pts[i + 1];
        const len = Math.hypot(x1 - x0, p1 - p0), ang = Math.atan2(-(p1 - p0), x1 - x0);
        const n = Math.max(1, Math.round(len / 0.56));
        for (let row = 0; row < rows; row++) {
          for (let k = 0; k < n - (row % 2); k++) {
            const t = (k + 0.5 + (row % 2) * 0.5) / n;
            const x = x0 + (x1 - x0) * t, p = p0 + (p1 - p0) * t;
            sandbags.push([x, this.h(x, p) + 0.1 + row * 0.185, -p, -ang + (Math.sin(k * 7.1 + row) * 0.08), 1 - row * 0.03, 0.85 + Math.abs(Math.sin(k * 3.7 + row * 1.3)) * 0.3]);
          }
        }
        col.add({ k: 's', x0, p0, x1, p1, r: 0.3, bul: true, cover: true });
      }
    };
    const ringBags = (x, p, R) => {
      const n = Math.round(Math.PI * 2 * R / 0.56);
      for (let row = 0; row < 2; row++) for (let k = 0; k < n; k++) {
        const a = (k + row * 0.5) / n * Math.PI * 2;
        const bx = x + Math.cos(a) * R, bp = p + Math.sin(a) * R;
        sandbags.push([bx, this.h(bx, bp) + 0.12 + row * 0.185, -bp, -a + Math.PI / 2, 1, 0.85 + Math.abs(Math.sin(k * 2.1)) * 0.3]);
      }
    };
    const geoCache = {};
    const G = (key, fn) => geoCache[key] || (geoCache[key] = fn());
    let rockSeed = 1;
    for (const pr of A.props) {
      switch (pr.t) {
        case 'sandbags': bagRow(pr.pts, pr.rows || 3); break;
        case 'crate': {
          const s = pr.s || 1;
          const m = this.mesh(propGeo('crate'), M.MAT.vc, pr.x, pr.p, pr.rot || 0, s, pr.y || 0);
          const c = pr.y ? null : col.add({ k: 'b', x: pr.x, p: pr.p, hw: 0.5 * s, hp: 0.5 * s, rot: -(pr.rot || 0), bul: true });
          const rec = { mesh: m, c, x: pr.x, p: pr.p, hp: 3, stacked: !!pr.y };
          if (c) c.ref = { crate: rec };
          this.dyn.crates.push(rec);
          break;
        }
        case 'barrel': {
          const m = this.mesh(G('barrel' + !!pr.red, () => M.barrelGeo(pr.red)), M.MAT.vc, pr.x, pr.p, Math.random() * 3);
          const c = col.add({ k: 'c', x: pr.x, p: pr.p, r: 0.36, bul: true });
          const rec = { mesh: m, c, x: pr.x, p: pr.p, red: !!pr.red, hp: pr.red ? 2 : 6, alive: true, r: 3.1 };
          c.ref = { barrel: rec };
          this.dyn.barrels.push(rec);
          break;
        }
        case 'fueltank': {
          const g = M2.fuelTankGroup(); this.place(g, pr.x, pr.p, pr.rot || 0);
          const c = col.add({ k: 'b', x: pr.x, p: pr.p, hw: 2.7, hp: 1.15, rot: -(pr.rot || 0), bul: true });
          const rec = { mesh: g, c, x: pr.x, p: pr.p, red: true, hp: 6, alive: true, r: 5, big: true };
          c.ref = { barrel: rec };
          this.dyn.barrels.push(rec);
          break;
        }
        case 'jeep': {
          const g = M.jeepGroup(true); this.place(g, pr.x, pr.p, pr.rot || 0);
          g.rotation.z = 0.05;
          col.add({ k: 'b', x: pr.x, p: pr.p, hw: 0.9, hp: 1.75, rot: -(pr.rot || 0), bul: true });
          break;
        }
        case 'parkedtruck': {
          const g = M2.militaryTruckGroup(pr.fuel ?? pr.x > 0); this.place(g, pr.x, pr.p, pr.rot || 0);
          col.add({ k: 'b', x: pr.x, p: pr.p, hw: 1.2, hp: 3.1, rot: -(pr.rot || 0), bul: true });
          break;
        }
        case 'tent': {
          const m = this.mesh(propGeo('kolos-tent'), M.MAT.vc, pr.x, pr.p, pr.rot || 0);
          m.geometry.computeBoundingBox();
          const bb = m.geometry.boundingBox;
          col.add({ k: 'b', x: pr.x, p: pr.p, hw: (bb.max.x - bb.min.x) / 2 * 0.9, hp: (bb.max.z - bb.min.z) / 2 * 0.9, rot: -(pr.rot || 0), bul: true });
          break;
        }
        case 'hut': {
          const g = M.hutGroup(); this.place(g, pr.x, pr.p, pr.rot || 0);
          col.add({ k: 'b', x: pr.x, p: pr.p, hw: 2.2, hp: 1.8, rot: -(pr.rot || 0), bul: true });
          break;
        }
        case 'barracks': {
          const g = M2.barracksGroup(); this.place(g, pr.x, pr.p, pr.rot || 0);
          col.add({ k: 'b', x: pr.x, p: pr.p, hw: 4.3, hp: 2.3, rot: -(pr.rot || 0), bul: true });
          this.dyn.barracks.push({ x: pr.x, p: pr.p - 2.6 });
          break;
        }
        case 'rock': {
          const s = pr.s || 1;
          const g = this.place(qObject(qKinds()['rock' + (rockSeed % 2)]), pr.x, pr.p, rockSeed * 1.3, -0.15);
          g.scale.setScalar(s);
          rockSeed++;
          col.add({ k: 'c', x: pr.x, p: pr.p, r: 0.85 * s, bul: true });
          break;
        }
        case 'palm': {
          const g = this.place(qObject(qKinds()['palm' + (Math.abs(Math.round(pr.x * 3 + pr.p)) % 4)]), pr.x, pr.p, pr.p * 1.7);
          g.scale.setScalar(pr.s || 1);
          col.add({ k: 'c', x: pr.x, p: pr.p, r: 0.38, bul: true });
          break;
        }
        case 'bush': {
          const g = this.place(qObject(qKinds()[pr.dry ? 'rbush' : 'fbush']), pr.x, pr.p, pr.p * 2.3);
          g.scale.setScalar((pr.s || 1) * 1.15);
          col.add({ k: 'c', x: pr.x, p: pr.p, r: 0.9 * (pr.s || 1), bul: false });
          break;
        }
        case 'deadtree': {
          const g = this.place(qObject(qKinds()['snag' + (rockSeed % 2)]), pr.x, pr.p, pr.x, -0.1);
          g.scale.setScalar(pr.s || 1);
          rockSeed++;
          col.add({ k: 'c', x: pr.x, p: pr.p, r: 0.35, bul: true });
          break;
        }
        // clutter from the Toon Shooter kit
        case 'tires': {
          const s = pr.s || 1;
          this.mesh(propGeo('tires'), M.MAT.vc, pr.x, pr.p, pr.rot ?? pr.p, s);
          col.add({ k: 'c', x: pr.x, p: pr.p, r: 0.7 * s, bul: true });
          break;
        }
        case 'pallet': case 'debris': {
          this.mesh(propGeo(pr.t === 'pallet' ? 'pallet' : 'debris-pile'), M.MAT.vc, pr.x, pr.p, pr.rot ?? pr.p, pr.s || 1, -0.02);
          break;
        }
        case 'container': case 'watertank': case 'barrier': case 'sacks': case 'wreck': {
          const name = { container: 'kolos-container', watertank: 'kolos-water-tank', barrier: 'sack-trench-small', sacks: pr.small ? 'sack-trench-small' : 'sack-trench', wreck: 'broken-car' }[pr.t];
          const m = this.mesh(propGeo(name), M.MAT.vc, pr.x, pr.p, pr.rot || 0, pr.s || 1);
          m.geometry.computeBoundingBox();
          const bb = m.geometry.boundingBox, s = pr.s || 1;
          col.add({ k: 'b', x: pr.x, p: pr.p, hw: (bb.max.x - bb.min.x) / 2 * s * 0.92, hp: (bb.max.z - bb.min.z) / 2 * s * 0.92, rot: -(pr.rot || 0), bul: true, cover: pr.t === 'sacks' || pr.t === 'barrier' });
          break;
        }
        case 'log': {
          this.mesh(M.logGeo(pr.len || 2), M.MAT.vc, pr.x, pr.p, pr.rot || 0, 1, -0.05);
          const dx = Math.cos(pr.rot || 0) * (pr.len || 2) / 2, dp = Math.sin(pr.rot || 0) * (pr.len || 2) / 2;
          col.add({ k: 's', x0: pr.x - dx, p0: pr.p - dp, x1: pr.x + dx, p1: pr.p + dp, r: 0.3, bul: true, cover: true });
          break;
        }
        case 'campfire': {
          const g = M.campfireGroup(); this.place(g, pr.x, pr.p);
          col.add({ k: 'c', x: pr.x, p: pr.p, r: 0.6, bul: false });
          this.dyn.fires.push({ x: pr.x, p: pr.p, y: this.h(pr.x, pr.p) });
          if (this.night) this.addLamp(pr.x, this.h(pr.x, pr.p) + 0.9, -pr.p, 0xff8a3a, 7, 9);
          break;
        }
        case 'lamp': {
          const g = M2.lampGroup(); this.place(g, pr.x, pr.p, pr.x < 0 ? 0 : Math.PI);
          col.add({ k: 'c', x: pr.x, p: pr.p, r: 0.18, bul: false });
          const bp = g.userData.bulbPos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
          if (this.night) this.addLamp(bp.x, bp.y, bp.z, 0xffc070, 9, 11);
          break;
        }
        case 'gatepost': {
          this.mesh(G('gatepost', M2.gatePostGeo), M.MAT.vc, pr.x, pr.p, 0, 1, -0.05);
          col.add({ k: 'c', x: pr.x, p: pr.p, r: 0.32, bul: true });
          break;
        }
        case 'helipad': {
          // painted on the ground: the decal mesh follows the terrain
          const s = pr.r * 2.2, geo = new THREE.PlaneGeometry(s, s, 24, 24).rotateX(-Math.PI / 2).rotateY(0.2);
          const pos = geo.attributes.position;
          for (let i = 0; i < pos.count; i++) pos.setY(i, this.h(pr.x + pos.getX(i), pr.p - pos.getZ(i)) + 0.035);
          geo.computeVertexNormals();
          const d = new THREE.Mesh(geo, M.MAT.decal);
          d.receiveShadow = true;
          d.position.set(pr.x, 0, -pr.p); this.root.add(d);
          break;
        }
        case 'bridge': {
          const g = M.bridgeGroup(pr.p1 - pr.p0, pr.half);
          g.position.set(pr.x, 0.0, -pr.p0); this.root.add(g);
          // rails keep you on the deck; the deck spans the river gap
          col.add({ k: 'b', x: pr.x - pr.half - 0.2, p: (pr.p0 + pr.p1) / 2, hw: 0.12, hp: (pr.p1 - pr.p0) / 2 - 1.2, bul: false });
          col.add({ k: 'b', x: pr.x + pr.half + 0.2, p: (pr.p0 + pr.p1) / 2, hw: 0.12, hp: (pr.p1 - pr.p0) / 2 - 1.2, bul: false });
          this.bridge = pr;
          break;
        }
        case 'boat': {
          const g = M2.boatGroup(pr.sunk); this.place(g, pr.x, pr.p, pr.rot || 0, pr.sunk ? -0.5 : -0.25);
          col.add({ k: 'b', x: pr.x, p: pr.p, hw: 1.3, hp: 3.6, rot: -(pr.rot || 0), bul: true });
          break;
        }
        case 'palisade': {
          const m = new THREE.Mesh(M2.palisadeGeo(pr.pts, pr.h || 3.4, (x, p) => this.h(x, p)), M.MAT.vc);
          m.castShadow = true; m.receiveShadow = true; this.root.add(m);
          for (let i = 0; i < pr.pts.length - 1; i++) col.add({ k: 's', x0: pr.pts[i][0], p0: pr.pts[i][1], x1: pr.pts[i + 1][0], p1: pr.pts[i + 1][1], r: 0.3, bul: true });
          break;
        }
        case 'fence': {
          this.root.add(M2.fenceGroup(pr.pts.map(([x, p]) => [x, p]), tx.fence));
          for (let i = 0; i < pr.pts.length - 1; i++) col.add({ k: 's', x0: pr.pts[i][0], p0: pr.pts[i][1], x1: pr.pts[i + 1][0], p1: pr.pts[i + 1][1], r: 0.18, bul: false });
          break;
        }
        case 'cage': {
          const g = M2.cageGroup(); this.place(g, pr.x, pr.p, 0);
          for (const [dx, dp] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) col.add({ k: 'c', x: pr.x + dx, p: pr.p + dp, r: 0.12, bul: false });
          col.add({ k: 'b', x: pr.x, p: pr.p + 1.3, hw: 1.3, hp: 0.06, bul: false });     // back bars
          col.add({ k: 'b', x: pr.x - 1.3, p: pr.p, hw: 0.06, hp: 1.3, bul: false });
          col.add({ k: 'b', x: pr.x + 1.3, p: pr.p, hw: 0.06, hp: 1.3, bul: false });
          const doorCol = col.add({ k: 'b', x: pr.x, p: pr.p - 1.3, hw: 1.3, hp: 0.06, bul: false });
          this.dyn.cages.push({ x: pr.x, p: pr.p, n: pr.n || 2, door: g.userData.door, doorCol, open: false });
          break;
        }
        case 'trench': {
          // revetment planks along both walls + sandbag parapet on the north lip
          const len = pr.x1 - pr.x0, xm = (pr.x0 + pr.x1) / 2;
          const wallGeo = new THREE.BoxGeometry(len, 1.1, 0.08);
          wallGeo.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? 0.5 : len / 2); });
          M.P(wallGeo, '#b89c74');
          for (const side of [-1, 1]) {
            const w = new THREE.Mesh(wallGeo, M.MAT.planks); w.receiveShadow = true;
            w.position.set(xm, -0.68, -(pr.p + side * 0.66)); this.root.add(w);
          }
          // timber posts holding the revetment and duckboards along the floor
          // (nothing on the south lip: it faces the camera and would hide the
          // soldiers inside)
          const tp = [], wr = mulberry(Math.round(pr.p * 13));
          for (let x = pr.x0 + 0.4; x < pr.x1 - 0.2; x += 1.5) for (const side of [-1, 1]) {
            tp.push(M.P(new THREE.BoxGeometry(0.13, 1.5, 0.13), wr() < 0.5 ? '#6b5236' : '#5e4630', { x, y: -0.55 + wr() * 0.06, z: -(pr.p + side * 0.6), ry: (wr() - 0.5) * 0.2 }, 0.1));
          }
          for (let x = pr.x0 + 0.25; x < pr.x1 - 0.15; x += 0.24) {
            tp.push(M.P(new THREE.BoxGeometry(0.15, 0.04, 0.84), wr() < 0.3 ? '#7a6143' : '#8c7250', { x: x + (wr() - 0.5) * 0.03, y: -1.17, z: -pr.p, ry: (wr() - 0.5) * 0.05 }, 0.12));
          }
          for (const dz of [-0.28, 0.28]) tp.push(M.P(new THREE.BoxGeometry(len - 0.3, 0.06, 0.07), '#4a3826', { x: xm, y: -1.21, z: -pr.p + dz }));
          const tm = new THREE.Mesh(M.merge(tp), M.MAT.vc); tm.castShadow = true; tm.receiveShadow = true;
          this.root.add(tm);
          bagRow([[pr.x0 + 0.2, pr.p + 1.05], [pr.x1 - 0.2, pr.p + 1.05]], 2);
          col.list[col.list.length - 1].bul = false;  // low parapet: fire passes over
          col.list[col.list.length - 1].enemyPass = true;
          col.add({ k: 'b', x: xm, p: pr.p, hw: len / 2, hp: 0.72, bul: false, trench: true, enemyPass: true });
          break;
        }
        case 'mortarpit': {
          ringBags(pr.x, pr.p, 1.9);
          const tube = this.mesh(G('mortar', M.mortarGeo), M.MAT.vc, pr.x, pr.p, 0, 1, 0);
          col.add({ k: 'c', x: pr.x, p: pr.p, r: 2.25, bul: true, pit: true });
          this.dyn.pits.push({ x: pr.x, p: pr.p, tube, alive: true });
          break;
        }
        case 'tower': case 'searchtower': {
          const g = M.towerGroup(); this.place(g, pr.x, pr.p, 0);
          for (const [dx, dp] of [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]]) col.add({ k: 'c', x: pr.x + dx, p: pr.p + dp, r: 0.2, bul: false });
          const deckY = this.h(pr.x, pr.p) + g.userData.deckY;
          if (pr.t === 'tower') { this.dyn.towers.push({ x: pr.x, p: pr.p, deckY, group: g }); break; }
          this.addSearchlight(pr, deckY);
          break;
        }
        case 'bunker': {
          const g = M.bunkerGroup(); this.place(g, pr.x, pr.p, Math.PI + (pr.rot || 0));
          const c = col.add({ k: 'b', x: pr.x, p: pr.p, hw: 2.7, hp: 1.9, bul: true });
          this.dyn.bunkers.push({ x: pr.x, p: pr.p, group: g, c, hp: 2, alive: true });
          break;
        }
        case 'hedgehog': {
          this.mesh(G('hedgehog', M.hedgehogGeo), M.MAT.vcMetal, pr.x, pr.p, pr.x * 0.7, 1);
          col.add({ k: 'c', x: pr.x, p: pr.p, r: 0.75, bul: false });
          break;
        }
        case 'wire': {
          const m = new THREE.Mesh(M.wireGeo(pr.pts.map(([x, p]) => [x, p])), M.MAT.vcMetal);
          m.castShadow = true; this.root.add(m);
          for (let i = 0; i < pr.pts.length - 1; i++) col.add({ k: 's', x0: pr.pts[i][0], p0: pr.pts[i][1], x1: pr.pts[i + 1][0], p1: pr.pts[i + 1][1], r: 0.35, bul: false });
          break;
        }
        case 'fortress': {
          const g = A.gate === 'palisade' ? M2.palisadeFortGroup(A)
            : M.fortressGroup(A, 96, A.gate === 'rampart' ? { H: 6.4, T: 3.6, flag: 0x5a1010 } : {});
          g.position.set(0, 0, -pr.p); this.root.add(g);
          this.fortress = g; this.dyn.doors = g.userData.doors; this.dyn.flag = g.userData.flag;
          const gh = A.gateHalf;
          col.add({ k: 'b', x: -(gh + 30), p: pr.p + 1.5, hw: 30 - 0.1, hp: 1.6, bul: true });
          col.add({ k: 'b', x: gh + 30, p: pr.p + 1.5, hw: 30 - 0.1, hp: 1.6, bul: true });
          this.gateCol = col.add({ k: 'b', x: 0, p: pr.p + 0.2, hw: gh, hp: 0.3, bul: true });
          break;
        }
      }
    }
    // POW stakes
    for (const w of A.pows) this.mesh(G('stake', M.stakeGeo), M.MAT.vc, w.x - 0.25, w.p + 0.3, 0);

    // all sandbags in one instanced draw
    if (sandbags.length) {
      const sg = M.sandbagGeo();
      const bags = new THREE.InstancedMesh(sg, M.MAT.sandbag, sandbags.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
      sandbags.forEach(([x, y, z, ry, s, sh], i) => {
        e.set(0, ry, 0); q.setFromEuler(e);
        m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
        bags.setMatrixAt(i, m4);
        c.setRGB(0.78 * sh, 0.7 * sh, 0.52 * sh); bags.setColorAt(i, c);
      });
      bags.castShadow = true; bags.receiveShadow = true;
      this.root.add(bags);
    }
  }

  // night lighting: lamps and fires carry real point lights (high quality only)
  addLamp(x, y, z, color, intensity, dist) {
    this.dyn.lamps.push({ x, y, z });
    if (this.quality !== 'high' || this.dyn.lamps.length > 5) return;
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z); this.root.add(l);
  }
  addSearchlight(pr, deckY) {
    const head = new THREE.Mesh(M2.searchHeadGeo(), M.MAT.vcMetal);
    head.position.set(pr.x, deckY + 1.1, -pr.p); head.castShadow = true; this.root.add(head);
    const [sx, sp, half] = pr.sweep;
    const spot = new THREE.SpotLight(0xfff2d0, 0, 46, 0.2, 0.45, 1.1);
    spot.position.set(pr.x, deckY + 1.2, -pr.p); spot.castShadow = false;
    const target = new THREE.Object3D(); target.position.set(sx, 0, -sp);
    spot.target = target; this.root.add(spot, target);
    const beamMat = new THREE.MeshBasicMaterial({ map: this.tex.beam, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0.9, 0.85, 0.7), opacity: 0, side: THREE.DoubleSide, toneMapped: false });
    // unit cone with its apex at the origin and its base at +Z, so lookAt()
    // aims it and scale (r, r, length) sizes it
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2), beamMat);
    beam.renderOrder = 6; this.root.add(beam);
    this.dyn.searchlights.push({ x: pr.x, p: pr.p, deckY, head, spot, target, beam, sx, sp, half, on: false, tx: sx, tp: sp, lock: 0 });
  }

  // jungle walls + scattered interior foliage, chunked for culling
  buildVegetation() {
    const A = this.area, T = this.terrain, r = mulberry(2026 + A.id * 101);
    const CH = 24, chunks = new Map();
    const push = (kind, x, p, s, rot, y) => {
      const k = Math.floor(p / CH);
      if (!chunks.has(k)) chunks.set(k, {});
      const ch = chunks.get(k); (ch[kind] || (ch[kind] = [])).push([x, y ?? this.h(x, p), -p, rot ?? r() * 6.28, s]);
    };
    const busy = (x, p, pad) => this.col.blocked(x, p, pad, 'veg');
    const nearRoad = (x, p) => A.road && Math.abs(x - T.roadX(p)) < 2.6;
    const wf = (x, p) => T.waterFrac(x, p);
    const wallP = A.wallP || 1e9;
    const hi = this.quality === 'high';
    const V = (w) => {
      const o = { palm: 0, edge: 0, dry: 0, litter: 0, grass: 0, boulder: 0, dead: 0, reed: 0, lily: 0 };
      for (const k in w) { const v = VEG[k]; if (!v) continue; for (const q in o) o[q] += (v[q] || 0) * w[k]; }
      return o;
    };
    for (let p = -38; p < Math.min(A.length + 42, wallP - 1); p += 1.0) {
      const w = T.biomeWeights(p), hw = T.halfWidth(p), v = V(w);
      for (const side of [-1, 1]) {
        // palms: rows receding into the jungle
        if (r() < v.palm + 0.02) {
          const e = 1.2 + Math.pow(r(), 0.8) * 26, x = side * (hw + e);
          if (Math.abs(x) < X_EXTENT - 1 && wf(x, p) < 0.05) push('palm' + ((r() * 4) | 0), x, p + r(), 0.85 + r() * 0.35);
        }
        // broadleaf & bushes pile up right at the corridor edge
        const nEdge = Math.round((hi ? 3 : 2) * v.edge + r() * 0.8);
        for (let i = 0; i < nEdge; i++) {
          const e = -0.8 + Math.pow(r(), 1.6) * 22, x = side * (hw + e), pp = p + r();
          if (wf(x, pp) > 0.3 || Math.abs(x) > X_EXTENT - 0.5) continue;
          const roll = r(), q = r();
          if (roll < 0.34) push(q < 0.3 ? 'bigleaf' : q < 0.55 ? 'plant' : 'leaf' + ((r() * 3) | 0), x, pp, 0.8 + r() * 0.8);
          else if (roll < 0.62) push(q < 0.17 ? 'fbush' : 'bush' + ((r() * 3) | 0), x, pp, 0.7 + r() * 0.9);
          else push(q < 0.4 ? 'qfern' : 'fern' + ((r() * 2) | 0), x, pp, 0.8 + r() * 0.6);
        }
        // broadleaf canopy trees further back in the jungle
        if (r() < v.edge * (hi ? 0.09 : 0)) {
          const e = 5 + Math.pow(r(), 0.7) * 22, x = side * (hw + e), pp = p + r();
          if (Math.abs(x) < X_EXTENT - 1 && wf(x, pp) < 0.05) push('tree' + ((r() * 2) | 0), x, pp, 0.8 + r() * 0.4);
        }
        // dry scrub where it's sandy or rocky
        if (r() < v.dry * 0.35) {
          const x = side * (hw + r() * 16);
          if (wf(x, p) < 0.05) push(r() < 0.5 ? 'rbush' : 'dry', x, p + r(), 0.5 + r() * 0.6);
        }
        // boulders heaped on cliff tops and against the cliff foot
        if (r() < v.boulder * 0.7) {
          const e = r() < 0.4 ? r() * 1.5 : 2 + r() * 14, x = side * (hw + e);
          const bq = (r() * 4) | 0;
          push(bq < 2 ? 'rock' + bq : 'boulder' + (bq - 2), x, p + r(), e < 1.5 ? 0.5 + r() * 0.6 : 0.8 + r() * 1.6);
        }
        // dead trees standing in the swamp
        if (r() < v.dead * 0.3) {
          const x = (r() * 2 - 1) * (hw + 14), pp = p + r();
          if (!nearRoad(x, pp) && !busy(x, pp, 1.5)) push('snag' + ((r() * 2) | 0), x, pp, (0.8 + r() * 0.5) * 0.72, undefined, T.height(x, pp) - 0.1);
        }
      }
      // reeds along every waterline; lily pads on still water
      if (v.reed > 0 || T.waters.length) for (let i = 0; i < (hi ? 4 : 2) * Math.max(0.5, v.reed); i++) {
        const x = (r() * 2 - 1) * (X_EXTENT - 2), pp = p + r(), a = T.waterAt(x, pp);
        if (!a) continue;
        if (a.raw > 0.08 && a.m < 0.6 && !T.onBridge(x, pp) && !nearRoad(x, pp)) push('reed', x, pp, 0.8 + r() * 0.6, undefined, Math.max(T.height(x, pp), a.w.level - 0.3));
        else if (v.lily > 0 && a.m > 0.7 && r() < 0.25 * v.lily) push('lily' + ((r() * 2) | 0), x, pp, 0.8 + r() * 0.8, undefined, a.w.level + 0.02);
      }
      // grass tufts & small stones inside the corridor
      const nG = Math.round((hi ? 4 : 2) * (0.3 + v.grass) * (0.5 + 0.5 * smooth(-0.3, 0.3, fbm(p * 0.07, 3, 2))));
      for (let i = 0; i < nG; i++) {
        const x = (r() * 2 - 1) * (hw + 2), pp = p + r();
        if (nearRoad(x, pp) || wf(x, pp) > 0.1 || busy(x, pp, 0.5) || T.trenchDepth(x, pp) > 0.05) continue;
        const grassy = fbm(x * 0.11 + 7, pp * 0.11, 3);
        if (grassy > -0.15 || r() < 0.2) push(r() < 0.1 ? (r() < 0.5 ? 'tallgrass' : 'wisp') : 'grass', x, pp, 0.7 + r() * 0.7);
      }
      if (r() < 0.35) {
        const x = (r() * 2 - 1) * (hw + 4), pp = p + r();
        if (wf(x, pp) < 0.1 && !busy(x, pp, 0.4)) push('pebble' + ((r() * 3) | 0), x, pp, 0.12 + r() * 0.2);
      }
      // stones, and junk (pallets, debris) around camps and the fortress approach
      if (r() < (hi ? 0.4 : 0.2)) {
        const x = (r() * 2 - 1) * (hw + 1), pp = p + r();
        if (!nearRoad(x, pp) && wf(x, pp) < 0.05 && !busy(x, pp, 0.6)) push('rock' + ((r() * 2) | 0), x, pp, 0.12 + r() * 0.2);
      }
      const junk = (w.camp || 0) + (w.motor || 0) + (w.fort || 0) * 0.6 + (w.desert || 0) * 0.5 + (w.lz || 0) * 0.4 + (w.beach || 0) * 0.4;
      if (r() < junk * 0.05) {
        const x = (r() * 2 - 1) * (hw - 1.5), pp = p + r();
        if (!nearRoad(x, pp) && wf(x, pp) < 0.02 && !busy(x, pp, 1.4) && T.trenchDepth(x, pp) < 0.02) push(r() < 0.5 ? 'pallet' : 'debris', x, pp, 0.8 + r() * 0.3);
      }
      // low plants spilling out of the jungle onto the corridor edge
      for (const side of [-1, 1]) {
        if (r() >= v.edge * (hi ? 0.4 : 0.2)) continue;
        const x = side * (hw - 0.3 - r() * 2), pp = p + r(), q = r();
        if (!nearRoad(x, pp) && wf(x, pp) < 0.1 && !busy(x, pp, 0.8)) push(q < 0.4 ? 'plant' : q < 0.47 ? 'fbush' : q < 0.77 ? 'tallgrass' : 'wisp', x, pp, 0.6 + r() * 0.5);
      }
      // fallen leaves: thick under the jungle edge, scattered across the path
      const nL = Math.round((hi ? 9 : 4) * v.litter);
      for (let i = 0; i < nL; i++) {
        const side = r() < 0.5 ? -1 : 1, e = r() < 0.6 ? -3 + r() * 6 : -hw + r() * hw;
        const x = side * (hw + e), pp = p + r();
        if (wf(x, pp) > 0.05 || T.trenchDepth(x, pp) > 0.05) continue;
        push('litter', x, pp, 0.5 + r() * 0.5);
      }
    }
    // geometry & material per kind
    const tx = this.tex;
    const leafM = foliageMats(tx.leaf, 0.02), fernM = foliageMats(tx.frond, 0.03, { color: 0xb8c890 }), grassM = foliageMats(tx.grass, 0.06);
    const kinds = { ...qKinds() };
    for (let i = 0; i < 3; i++) kinds['leaf' + i] = [[M.broadleafGeo(300 + i), leafM.mat, leafM.depth]];
    const bushM = foliageMats(tx.leaf, 0.025);
    for (let i = 0; i < 3; i++) kinds['bush' + i] = [[M.leafyBushGeo(400 + i), bushM.mat, bushM.depth]];
    for (let i = 0; i < 2; i++) kinds['fern' + i] = [[M.fernGeo(500 + i), fernM.mat, fernM.depth]];
    kinds.dry = [[M.leafyBushGeo(600, true), bushM.mat, bushM.depth]];
    kinds.grass = [[M.grassTuftGeo(), grassM.mat, grassM.depth]];
    kinds.reed = [[M.grassTuftGeo().scale(0.7, 2.3, 0.7), grassM.mat, grassM.depth]];
    const litterGeo = new THREE.PlaneGeometry(0.28, 0.5).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
    M.P(litterGeo, '#ffffff');
    const litterMat = new THREE.MeshStandardMaterial({ map: tx.leaf, alphaTest: 0.5, roughness: 0.95, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1 });
    kinds.litter = [[litterGeo, litterMat, null]];
    kinds.pallet = [[propGeo('pallet'), M.MAT.vc, null]];
    kinds.debris = [[propGeo('debris-pile'), M.MAT.vc, null]];
    for (let i = 0; i < 3; i++) kinds['pebble' + i] = [[M.rockGeo(700 + i, false), M.MAT.vc, null]];
    for (let i = 0; i < 3; i++) kinds['boulder' + i] = [[M.rockGeo(820 + i, true), M.MAT.vc, null]];
    for (let i = 0; i < 2; i++) kinds['lily' + i] = [[M2.lilyGeo(980 + i), M.MAT.vc, null]];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const ch of chunks.values()) {
      for (const [kind, items] of Object.entries(ch)) {
        for (const [geo, mat, depth] of kinds[kind]) {
          const im = new THREE.InstancedMesh(geo, mat, items.length);
          im.name = kind;
          items.forEach(([x, y, z, rot, s], i) => {
            q.setFromAxisAngle(up, rot); v.set(x, y - (kind.startsWith('pebble') || kind.startsWith('boulder') ? 0.1 : kind.startsWith('rock') ? 0.15 : 0.02), z); sc.set(s, s, s);
            m4.compose(v, q, sc); im.setMatrixAt(i, m4);
          });
          im.computeBoundingSphere();
          const small = kind === 'grass' || kind === 'reed' || kind === 'litter' || kind === 'wisp' || kind === 'tallgrass' || kind.startsWith('pebble') || kind.startsWith('fern') || kind.startsWith('lily');
          if (kind === 'litter') {
            const c = new THREE.Color(), rr = mulberry(items.length);
            items.forEach((_, i) => { const k = rr(); c.setRGB(0.75 + k * 0.5, 0.55 + k * 0.25, 0.25 + k * 0.1, THREE.SRGBColorSpace); im.setColorAt(i, c); });
          }
          im.castShadow = !small; im.receiveShadow = true;
          if (kind === 'grass' || kind === 'reed') {
            const c = new THREE.Color();
            items.forEach(([x, y, z], i) => {
              const w = this.terrain.biomeWeights(-z), dry = (w.desert || 0) + (w.fort || 0) * 0.8 + (w.scrub || 0) * 0.5 + (w.motor || 0) * 0.7 + (w.ravine || 0) * 0.4 + (w.beach || 0) * 0.5;
              c.setRGB(1 + dry * 0.35, 1 + dry * 0.05, 0.85 - dry * 0.25); im.setColorAt(i, c);
            });
          }
          if (depth) im.customDepthMaterial = depth;
          this.root.add(im);
        }
      }
    }
  }

  update(t) {
    WIND.uTime.value = t;
    this.waterMat.userData.tick(t);
    if (this.dyn.flag) {
      const f = this.dyn.flag, pos = f.geometry.attributes.position;
      if (!f.userData.base) f.userData.base = pos.array.slice();
      const b = f.userData.base;
      for (let i = 0; i < pos.count; i++) {
        const x = b[i * 3] + 1.1;
        pos.setZ(i, Math.sin(t * 5 + x * 2.5) * 0.12 * x);
      }
      pos.needsUpdate = true; f.geometry.computeVertexNormals();
    }
  }

  // free the GPU memory of everything this area built (shared materials and
  // textures stay alive for the next area)
  dispose() {
    this.scene.remove(this.root);
    const shared = new Set(Object.values(M.MAT));
    this.root.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) if (!shared.has(m) && !m.userData.shared) m.dispose();
      if ((o.isLight || o.isInstancedMesh) && o.dispose) o.dispose();
    });
    if (this.waterMat.normalMap) this.waterMat.normalMap.dispose();
  }
}
