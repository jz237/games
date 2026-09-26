// models.js — the procedural models (buildings, fortress, trucks, jeep,
// towers, foliage cards…), built from primitives with vertex colour and the
// painted canvas textures. Palms, rocks, props and characters now mostly come
// from the Quaternius models (assets.js); these fill in everything else.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry, noise2, hexColor } from './util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// paint + place a primitive: o = {x,y,z, rx,ry,rz, sx,sy,sz}
export function P(geo, color, o = {}, jitter = 0, seed = 1) {
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
  _q.setFromEuler(_e);
  _s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
  _p.set(o.x || 0, o.y || 0, o.z || 0);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  const r = mulberry(seed);
  for (let i = 0; i < n; i++) {
    const j = jitter ? 1 + (r() - 0.5) * jitter : 1;
    col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return geo;
}
export function merge(list) {
  if (list.some(g => !g.index)) list = list.map(g => (g.index ? g.toNonIndexed() : g));
  const clean = list.map(g => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  return mergeGeometries(clean, false);
}
function displace(geo, amp, freq, seed = 0) {
  // weld the polyhedron's split vertices first so the noise keeps it watertight
  // and the normals come out smooth
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo, 1e-4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise2(x * freq + seed, z * freq + y * freq * 0.7 - seed);
    const l = Math.hypot(x, y, z) || 1;
    pos.setXYZ(i, x + x / l * n * amp, y + y / l * n * amp, z + z / l * n * amp);
  }
  geo.computeVertexNormals();
  return geo;
}
// darken vertices near the base: cheap baked ambient occlusion
function baseAO(geo, y0, y1, k = 0.45) {
  const pos = geo.attributes.position, col = geo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
    const f = 1 - k * (1 - t);
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
  return geo;
}

// thatch runs from the ridge down: u around the roof, v down the slope
function roofUV(geo) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  let top = -1e9; for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const a = Math.atan2(z, x), r = Math.hypot(x, z);
    uv.setXY(i, a * r * 0.9 + a * 1.2, (top - y) * 0.9 + r * 0.6);
  }
  uv.needsUpdate = true;
  return geo;
}

export const MAT = {};
export function initMaterials(tex) {
  MAT.vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  MAT.vcMetal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.45 });
  MAT.thatch = new THREE.MeshStandardMaterial({ map: tex.thatch, roughness: 1, color: 0x9a8a68 });
  MAT.planks = new THREE.MeshStandardMaterial({ map: tex.planks, roughness: 0.9, vertexColors: true });
  MAT.stone = new THREE.MeshStandardMaterial({ map: tex.stone, roughness: 0.95, vertexColors: true });
  MAT.concrete = new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.95, vertexColors: true });
  MAT.sandbag = new THREE.MeshStandardMaterial({ map: tex.burlap, roughness: 1, color: 0xffffff });
  MAT.canvas = new THREE.MeshStandardMaterial({ color: 0x5d6038, roughness: 1, side: THREE.DoubleSide });
  MAT.decal = new THREE.MeshStandardMaterial({ map: tex.helipad, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
}

// ------------------------------------------------------------------ vegetation
export function bushGeo(seed, dry = false) {
  const r = mulberry(seed), parts = [];
  const n = 4 + ((r() * 4) | 0);
  const base = dry ? ['#6f6a3a', '#7d7543', '#5f5a30'] : ['#35532a', '#41622f', '#2c4722', '#4d6d33'];
  for (let i = 0; i < n; i++) {
    const s = 0.45 + r() * 0.55, a = r() * Math.PI * 2, d = r() * 0.7;
    const g = displace(new THREE.IcosahedronGeometry(s, 2), s * 0.28, 2.2, seed + i);
    P(g, base[(r() * base.length) | 0], { x: Math.cos(a) * d, y: s * 0.62, z: Math.sin(a) * d, sy: 0.82 }, 0.25, seed + i);
    baseAO(g, 0, 1.2, 0.55);
    parts.push(g);
  }
  return merge(parts);
}

// leafy bush: a dark core wrapped in outward-facing leaf cards, normals taken
// from the enclosing ellipsoid so the whole bush shades as one soft volume
export function leafyBushGeo(seed, dry = false) {
  const r = mulberry(seed), parts = [];
  const R = 0.8 + r() * 0.35, Hh = 0.75 + r() * 0.3;
  const core = displace(new THREE.IcosahedronGeometry(R * 0.6, 1), 0.1, 2, seed);
  P(core, dry ? '#4a4424' : '#2b4420', { y: Hh * 0.5, sy: Hh / R });
  core.attributes.uv.array.fill(0.5);   // sample the opaque middle of the leaf texture
  parts.push(core);
  const n = 30 + ((r() * 12) | 0);
  for (let i = 0; i < n; i++) {
    const u = r(), v = r();
    const th = u * Math.PI * 2, ph = Math.acos(1 - v * 1.15);    // skip the underside
    const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
    const L = 0.6 + r() * 0.35, W = 0.4 + r() * 0.18;
    const g = new THREE.PlaneGeometry(W, L, 1, 2);
    g.translate(0, L / 2, 0);
    // cup the leaf a little
    const pp = g.attributes.position;
    for (let k = 0; k < pp.count; k++) pp.setZ(k, -Math.abs(pp.getX(k)) * 0.4 + pp.getY(k) * pp.getY(k) * 0.25);
    // lay it down pointing outward from the bush centre, tipped up with height
    g.rotateX(-Math.PI / 2 + 0.35 + ny * 0.6 + r() * 0.3);
    g.rotateY(-th - Math.PI / 2 + (r() - 0.5) * 0.7);
    const cx = nx * R * 0.55, cy = Hh * 0.5 + ny * Hh * 0.62, cz = nz * R * 0.55;
    g.translate(cx, cy, cz);
    const nr = g.attributes.normal;
    for (let k = 0; k < nr.count; k++) nr.setXYZ(k, nx * 0.7, ny * 0.9 + 0.35, nz * 0.7);
    const shade = (0.55 + ny * 0.45) * (0.85 + r() * 0.3);
    const c = dry ? new THREE.Color(shade * 1.1, shade * 0.95, shade * 0.55) : new THREE.Color(shade * 0.92, shade, shade * 0.8);
    P(g, '#' + c.getHexString());
    parts.push(g);
  }
  return merge(parts);
}

// broadleaf plants and ferns are cards using a leaf texture
function leafCard(len, wid, arch, yaw, tilt, y0 = 0) {
  const segs = 5, fp = [], fu = [], fi = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, d = t * len, y = y0 + Math.sin(t * Math.PI * 0.8) * arch * len - t * t * arch * len * 0.9;
    for (let k = -1; k <= 1; k += 2) { fp.push(k * wid * 0.5, y, d); fu.push(k < 0 ? 0 : 1, t); }
  }
  for (let i = 0; i < segs; i++) { const a = i * 2, b = a + 2; fi.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
  g.setIndex(fi); g.computeVertexNormals();
  const nrm = g.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setY(i, Math.abs(nrm.getY(i)) * 0.5 + 0.7);
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(-tilt));
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw));
  return g;
}
export function broadleafGeo(seed) {
  const r = mulberry(seed), leaves = [];
  const n = 6 + ((r() * 5) | 0);
  for (let i = 0; i < n; i++) {
    const g = leafCard(1.1 + r() * 0.9, 0.55 + r() * 0.35, 0.45 + r() * 0.3, i / n * Math.PI * 2 + r() * 0.5, 0.2 + r() * 0.3, 0.05);
    const sh = 0.75 + r() * 0.4; P(g, new THREE.Color(sh, sh, sh).getStyle());
    leaves.push(g);
  }
  return merge(leaves);
}
export function fernGeo(seed) {
  const r = mulberry(seed), leaves = [];
  const n = 7 + ((r() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const g = leafCard(0.9 + r() * 0.6, 0.45, 0.35 + r() * 0.2, i / n * Math.PI * 2 + r() * 0.4, 0.1 + r() * 0.2);
    const sh = 0.7 + r() * 0.4; P(g, new THREE.Color(sh, sh * 1.05, sh * 0.9).getStyle());
    leaves.push(g);
  }
  return merge(leaves);
}
export function grassTuftGeo() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(0.9, 0.62);
    g.translate(0, 0.31, 0);
    g.rotateY(i * Math.PI / 3);
    const nrm = g.attributes.normal; for (let k = 0; k < nrm.count; k++) nrm.setXYZ(k, 0, 1, 0);
    P(g, '#ffffff');
    parts.push(g);
  }
  return merge(parts);
}

export function rockGeo(seed, mossy = true) {
  const g = displace(new THREE.IcosahedronGeometry(1, 2), 0.28, 1.3, seed);
  g.scale(1, 0.62, 0.9);
  const n = g.attributes.position.count, col = new Float32Array(n * 3), r = mulberry(seed);
  const stone = new THREE.Color('#77705f'), dark = new THREE.Color('#4b463b'), moss = new THREE.Color('#4f6130');
  g.computeVertexNormals();
  const nrm = g.attributes.normal, pos = g.attributes.position;
  for (let i = 0; i < n; i++) {
    const up = nrm.getY(i), y = pos.getY(i);
    const c = stone.clone().lerp(dark, Math.max(0, -y * 0.9) + r() * 0.15);
    if (mossy && up > 0.55) c.lerp(moss, (up - 0.55) * 1.6 * (0.6 + noise2(pos.getX(i) * 2, pos.getZ(i) * 2) * 0.5));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, 0.28, 0);
  return g;
}

// ------------------------------------------------------------------ props
export function sandbagGeo() {
  const g = new RoundedBoxGeometry(0.6, 0.2, 0.32, 3, 0.09);
  // pinch the ends so each bag reads as a stuffed sack
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), t = Math.abs(x) / 0.3;
    const k = 1 - Math.pow(t, 6) * 0.35;
    pos.setY(i, pos.getY(i) * k); pos.setZ(i, pos.getZ(i) * (0.8 + 0.2 * k));
  }
  g.computeVertexNormals();
  return g;
}

export function barrelGeo(red) {
  const body = red ? '#9a2f22' : '#4f5a34';
  const parts = [P(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 14), body, { y: 0.475 }, 0.06)];
  for (const y of [0.18, 0.5, 0.82]) parts.push(P(new THREE.TorusGeometry(0.345, 0.025, 4, 16), '#2f2a22', { y, rx: Math.PI / 2 }));
  parts.push(P(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 14), red ? '#7d261c' : '#3f4a2a', { y: 0.955 }));
  if (red) parts.push(P(new THREE.BoxGeometry(0.25, 0.2, 0.02), '#e8d9a0', { y: 0.6, z: 0.34 }));
  return merge(parts);
}

export function logGeo(len) {
  const g = new THREE.CylinderGeometry(0.28, 0.32, len, 10, 1);
  P(g, '#5a4430', { rz: Math.PI / 2, y: 0.26 }, 0.2);
  const e1 = P(new THREE.CircleGeometry(0.29, 10), '#a58d63', { x: len / 2 + 0.001, y: 0.26, ry: Math.PI / 2 });
  const e2 = P(new THREE.CircleGeometry(0.29, 10), '#a58d63', { x: -len / 2 - 0.001, y: 0.26, ry: -Math.PI / 2 });
  return merge([g, e1, e2]);
}

export function hutGroup() {
  const g = new THREE.Group();
  const W = 4.2, D = 3.4, H = 2.1;
  const floor = [];
  for (const [x, z] of [[-W / 2 + 0.2, -D / 2 + 0.2], [W / 2 - 0.2, -D / 2 + 0.2], [-W / 2 + 0.2, D / 2 - 0.2], [W / 2 - 0.2, D / 2 - 0.2]]) floor.push(P(new THREE.CylinderGeometry(0.12, 0.14, 0.7, 6), '#4a3a28', { x, y: 0.35, z }));
  floor.push(P(new THREE.BoxGeometry(W, 0.12, D), '#8a6c47', { y: 0.7 }));
  const walls = [];
  const wall = (w, h, x, z, ry) => { const b = new THREE.BoxGeometry(w, h, 0.1); b.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? h / 1.2 : w / 1.2); }); P(b, '#c9b089', { x, y: 0.76 + h / 2, z, ry }, 0.1); walls.push(b); };
  wall(W - 0.1, H, 0, -D / 2 + 0.05, 0);
  wall(W - 0.1, H, 0, D / 2 - 0.05, 0);
  wall(D - 0.1, H, -W / 2 + 0.05, 0, Math.PI / 2);
  wall(D - 0.1, H, W / 2 - 0.05, 0, Math.PI / 2);
  const door = P(new THREE.BoxGeometry(0.9, 1.5, 0.12), '#1c140c', { x: 0.6, y: 0.76 + 0.75, z: D / 2 - 0.02 });
  const win = P(new THREE.BoxGeometry(0.8, 0.5, 0.12), '#1c140c', { x: -1.1, y: 0.76 + 1.2, z: D / 2 - 0.02 });
  const meshA = new THREE.Mesh(merge(floor.concat([door, win])), MAT.vc);
  const meshW = new THREE.Mesh(merge(walls), MAT.planks);
  // thatched hip roof with a deep overhang
  const roof = new THREE.ConeGeometry(Math.hypot(W, D) / 2 + 0.9, 1.9, 4, 3, true);
  roof.rotateY(Math.PI / 4); roof.scale(W / D * 0.95, 1, 1);
  const pos = roof.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + noise2(pos.getX(i) * 3, pos.getZ(i) * 3) * 0.05);
  roof.computeVertexNormals();
  roofUV(roof);
  roof.translate(0, 0.76 + H + 0.85, 0);
  const meshR = new THREE.Mesh(roof, MAT.thatch);
  meshR.material = MAT.thatch.clone(); meshR.material.side = THREE.DoubleSide;
  for (const m of [meshA, meshW, meshR]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

export function tentGroup() {
  const g = new THREE.Group();
  const L = 3.4, W = 2.6, H = 1.7;
  const shape = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, H)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false });
  geo.translate(0, 0, -L / 2);
  const m = new THREE.Mesh(geo, MAT.canvas); m.castShadow = m.receiveShadow = true; g.add(m);
  const flap = new THREE.Mesh(P(new THREE.PlaneGeometry(0.8, 1.1), '#1a1a10', { y: 0.55, z: L / 2 + 0.01 }), MAT.vc); g.add(flap);
  return g;
}

export function towerGroup() {
  const g = new THREE.Group(), parts = [];
  const H = 4.2, S = 1.2;
  for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]]) parts.push(P(new THREE.CylinderGeometry(0.1, 0.13, H + 1.2, 6), '#5b4631', { x: x * 0.95, y: (H + 1.2) / 2, z: z * 0.95 }, 0.1));
  for (const y of [1.3, 2.9]) for (const [x, z, ry] of [[0, -S, 0], [0, S, 0], [-S, 0, Math.PI / 2], [S, 0, Math.PI / 2]]) {
    parts.push(P(new THREE.BoxGeometry(S * 2.5, 0.08, 0.08), '#5b4631', { x, y, z, ry, rz: 0.55 }));
  }
  parts.push(P(new THREE.BoxGeometry(S * 2.6, 0.14, S * 2.6), '#7c6143', { y: H }));
  for (const [x, z, ry] of [[0, -S * 1.25, 0], [0, S * 1.25, 0], [-S * 1.25, 0, Math.PI / 2], [S * 1.25, 0, Math.PI / 2]]) parts.push(P(new THREE.BoxGeometry(S * 2.5, 0.7, 0.06), '#8a6c47', { x, y: H + 0.4, z, ry }, 0.1));
  const m = new THREE.Mesh(merge(parts), MAT.vc); m.castShadow = m.receiveShadow = true; g.add(m);
  const roof = new THREE.Mesh(roofUV(new THREE.ConeGeometry(S * 2.1, 1.0, 4, 2, true).rotateY(Math.PI / 4)).translate(0, H + 2.0, 0), MAT.thatch.clone());
  roof.material.side = THREE.DoubleSide; roof.castShadow = true; g.add(roof);
  g.userData.deckY = H + 0.07;
  return g;
}

export function bunkerGroup() {
  const g = new THREE.Group(), parts = [];
  const W = 5.2, D = 3.6, H = 1.7;
  const body = new RoundedBoxGeometry(W, H, D, 2, 0.25);
  body.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 2; });
  parts.push(P(body, '#a39d8c', { y: H / 2 }, 0.04));
  parts.push(P(new RoundedBoxGeometry(W + 0.5, 0.35, D + 0.5, 2, 0.12), '#8e897a', { y: H + 0.1 }, 0.04));
  const m = new THREE.Mesh(merge(parts), MAT.concrete); m.castShadow = m.receiveShadow = true; g.add(m);
  const slit = new THREE.Mesh(P(new THREE.BoxGeometry(2.6, 0.28, 0.2), '#0d0b08', { y: 1.15, z: D / 2 + 0.02 }), MAT.vc); g.add(slit);
  g.userData.slitZ = D / 2;
  return g;
}

export function hedgehogGeo() {
  const parts = [];
  const beam = (rx, ry, rz) => {
    const a = P(new THREE.BoxGeometry(0.12, 1.8, 0.04), '#3b3834', { rx, ry, rz, y: 0.55 });
    const b = P(new THREE.BoxGeometry(0.04, 1.8, 0.12), '#3b3834', { rx, ry, rz, y: 0.55 });
    parts.push(a, b);
  };
  beam(0, 0, 0.95); beam(0, Math.PI / 2, 0.95); beam(0.95, 0, 0);
  return merge(parts);
}

export function wireGeo(pts) {
  const parts = [];
  for (let i = 0; i < pts.length; i++) parts.push(P(new THREE.CylinderGeometry(0.04, 0.05, 1.0, 5), '#4e3d2b', { x: pts[i][0], y: 0.5, z: -pts[i][1] }));
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, p0] = pts[i], [x1, p1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, p1 - p0), n = Math.max(6, Math.round(len * 5));
    const path = [];
    for (let k = 0; k <= n * 6; k++) {
      const t = k / (n * 6), a = t * n * Math.PI * 2;
      path.push(new THREE.Vector3(x0 + (x1 - x0) * t, 0.42 + Math.sin(a) * 0.32, -(p0 + (p1 - p0) * t) + Math.cos(a) * 0.32));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), n * 12, 0.012, 3, false);
    parts.push(P(tube, '#6a6a66'));
  }
  return merge(parts);
}

export function jeepGroup(wrecked = true) {
  const g = new THREE.Group(), parts = [];
  const body = wrecked ? '#4d4a2f' : '#55603a';
  parts.push(P(new RoundedBoxGeometry(1.7, 0.55, 3.4, 2, 0.08), body, { y: 0.75 }, 0.15));
  parts.push(P(new RoundedBoxGeometry(1.6, 0.45, 1.3, 2, 0.08), body, { y: 1.1, z: 0.95 }, 0.15));
  parts.push(P(new THREE.BoxGeometry(1.5, 0.5, 0.05), '#2a2a26', { y: 1.4, z: 0.3, rx: -0.3 }));
  for (const [x, z] of [[-0.85, 1.1], [0.85, 1.1], [-0.85, -1.1], [0.85, -1.1]]) {
    parts.push(P(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12), '#1d1c1a', { x, y: 0.38, z, rz: Math.PI / 2 }));
  }
  if (wrecked) for (let i = 0; i < 6; i++) parts.push(P(new THREE.BoxGeometry(0.3, 0.05, 0.3), '#2a1d12', { x: (i - 3) * 0.25, y: 1.03, z: -0.8 + (i % 3) * 0.4, ry: i }));
  const m = new THREE.Mesh(merge(parts), MAT.vc); m.castShadow = m.receiveShadow = true; g.add(m);
  return g;
}

export function truckGroup() {
  const g = new THREE.Group(), parts = [];
  const olive = '#56603a';
  parts.push(P(new RoundedBoxGeometry(2.2, 0.35, 6.2, 2, 0.06), '#2f2f28', { y: 0.75 }));
  parts.push(P(new RoundedBoxGeometry(2.1, 1.25, 1.7, 2, 0.12), olive, { y: 1.5, z: 2.1 }, 0.08));
  parts.push(P(new RoundedBoxGeometry(2.05, 0.7, 1.0, 2, 0.1), olive, { y: 1.2, z: 3.1 }, 0.08));
  parts.push(P(new THREE.BoxGeometry(1.8, 0.45, 0.05), '#223038', { y: 1.8, z: 2.97 }));
  parts.push(P(new THREE.BoxGeometry(2.2, 0.5, 3.8), '#4d5733', { y: 1.15, z: -0.9 }, 0.08));
  for (const [x, z] of [[-1.05, 2.4], [1.05, 2.4], [-1.05, -0.4], [1.05, -0.4], [-1.05, -1.9], [1.05, -1.9]]) {
    parts.push(P(new THREE.CylinderGeometry(0.48, 0.48, 0.34, 14), '#181816', { x, y: 0.48, z, rz: Math.PI / 2 }));
  }
  const m = new THREE.Mesh(merge(parts), MAT.vc); m.castShadow = m.receiveShadow = true; g.add(m);
  // canvas cover over the cargo bed
  const cov = new THREE.CylinderGeometry(1.15, 1.15, 3.8, 14, 1, true, -Math.PI / 2, Math.PI);
  cov.rotateX(Math.PI / 2); cov.rotateY(Math.PI / 2); cov.rotateY(Math.PI / 2);
  const cover = new THREE.Mesh(P(cov, '#6b6a45', { y: 1.4, z: -0.9, sy: 0.9 }, 0.06), MAT.vc);
  cover.material = MAT.vc.clone(); cover.material.side = THREE.DoubleSide;
  cover.castShadow = true; g.add(cover);
  return g;
}

export function campfireGroup() {
  const g = new THREE.Group(), parts = [];
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; parts.push(P(new THREE.DodecahedronGeometry(0.16, 0), '#6d6659', { x: Math.cos(a) * 0.55, y: 0.08, z: Math.sin(a) * 0.55, s: 1 + (i % 3) * 0.2 })); }
  for (let i = 0; i < 4; i++) parts.push(P(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 6), '#3a2a1a', { y: 0.15, ry: i * 0.8, rz: Math.PI / 2 - 0.3 }));
  const m = new THREE.Mesh(merge(parts), MAT.vc); m.castShadow = m.receiveShadow = true; g.add(m);
  const ember = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12).rotateX(-Math.PI / 2).translate(0, 0.04, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.7, 0.15) }));
  g.add(ember);
  return g;
}

export function bridgeGroup(len, half) {
  const g = new THREE.Group(), deck = [], frame = [];
  const nPlanks = Math.round(len / 0.36);
  for (let i = 0; i < nPlanks; i++) {
    const b = new THREE.BoxGeometry(half * 2 + 0.3, 0.1, 0.33);
    P(b, ['#a88b62', '#9a7d56', '#b39670'][i % 3], { z: -i * (len / nPlanks) - 0.18, y: 0.08 + Math.sin(i * 1.7) * 0.012, ry: Math.sin(i * 2.3) * 0.015 }, 0.08, i);
    deck.push(b);
  }
  for (const x of [-half + 0.1, half - 0.1]) frame.push(P(new THREE.BoxGeometry(0.25, 0.3, len), '#4f3d29', { x, y: -0.12, z: -len / 2 }));
  for (let i = 0; i <= 6; i++) for (const x of [-half - 0.05, half + 0.05]) {
    const z = -i * len / 6;
    frame.push(P(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 6), '#4a3826', { x, y: -0.4, z }));
    frame.push(P(new THREE.BoxGeometry(0.12, 0.12, 0.12), '#4a3826', { x, y: 0.95, z }));
  }
  for (const x of [-half - 0.05, half + 0.05]) {
    frame.push(P(new THREE.BoxGeometry(0.1, 0.1, len), '#5d4731', { x, y: 0.95, z: -len / 2 }));
    frame.push(P(new THREE.BoxGeometry(0.06, 0.06, len), '#5d4731', { x, y: 0.55, z: -len / 2 }));
  }
  const d = new THREE.Mesh(merge(deck), MAT.planks); d.castShadow = d.receiveShadow = true; g.add(d);
  const f = new THREE.Mesh(merge(frame), MAT.vc); f.castShadow = f.receiveShadow = true; g.add(f);
  return g;
}

export function mortarGeo() {
  const parts = [];
  parts.push(P(new THREE.CylinderGeometry(0.09, 0.1, 1.1, 10), '#2e3328', { y: 0.55, rx: -0.75 }));
  parts.push(P(new THREE.CylinderGeometry(0.26, 0.3, 0.06, 10), '#2a2d25', { y: 0.05 }));
  parts.push(P(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), '#2a2d25', { y: 0.3, z: 0.3, rx: 0.5 }));
  return merge(parts);
}

// fortress wall across the whole area width with a gate in the middle
export function fortressGroup(area, width = 96, opt = {})  {
  const g = new THREE.Group(), stone = [], dark = [], wood = [];
  const gh = area.gateHalf, H = opt.H || 4.6, T = opt.T || 3.0;
  const segs = [[-width / 2, -gh - 2.2], [gh + 2.2, width / 2]];
  for (const [a, b] of segs) {
    const w = b - a, geo = new THREE.BoxGeometry(w, H, T);
    geo.attributes.uv.array.forEach((v, i, arr) => { arr[i] = v * (i % 2 ? H / 3 : w / 3); });
    stone.push(P(geo, '#bdb3a0', { x: (a + b) / 2, y: H / 2, z: -T / 2 }, 0.06));
    for (let x = a + 0.6; x < b - 0.4; x += 1.4) {
      const m = new THREE.BoxGeometry(0.8, 0.7, T * 0.9); m.attributes.uv.array.forEach((v, i, arr) => { arr[i] = v * 0.3; });
      stone.push(P(m, '#b4aa97', { x, y: H + 0.35, z: -T / 2 }, 0.08));
    }
  }
  // gate towers
  for (const s of [-1, 1]) {
    const tw = new THREE.BoxGeometry(4.4, H + 2.2, T + 1.6); tw.attributes.uv.array.forEach((v, i, arr) => { arr[i] = v * (i % 2 ? 2.2 : 1.5); });
    stone.push(P(tw, '#aaa08d', { x: s * (gh + 2.2), y: (H + 2.2) / 2, z: -T / 2 + 0.2 }, 0.06));
    for (const dx of [-1.5, 0, 1.5]) { const m = new THREE.BoxGeometry(0.9, 0.8, 0.9); m.attributes.uv.array.forEach((v, i, arr) => { arr[i] = v * 0.3; }); stone.push(P(m, '#a39985', { x: s * (gh + 2.2) + dx, y: H + 2.6, z: 1.0 }, 0.08)); }
    dark.push(P(new THREE.BoxGeometry(0.3, 1.1, 0.1), '#0e0c09', { x: s * (gh + 2.2), y: H - 0.2, z: 1.05 }));
  }
  // lintel over the gate
  const lin = new THREE.BoxGeometry(gh * 2 + 0.2, 1.3, T); lin.attributes.uv.array.forEach((v, i, arr) => { arr[i] = v * (i % 2 ? 0.4 : 3); });
  stone.push(P(lin, '#a39985', { y: H + 0.3, z: -T / 2 }, 0.05));
  const s1 = new THREE.Mesh(merge(stone), MAT.stone); s1.castShadow = s1.receiveShadow = true; g.add(s1);
  const s2 = new THREE.Mesh(merge(dark), MAT.vc); g.add(s2);
  // the gate doors (hinged, animated open during the finale)
  const doors = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * gh, 0, 0.05);
    const planks = [];
    const dg = new THREE.BoxGeometry(gh, H - 0.4, 0.28); dg.attributes.uv.array.forEach((v, i, arr) => { arr[i] = v * (i % 2 ? 3 : 1.6); });
    planks.push(P(dg, '#7a5a3a', { x: -s * gh / 2, y: (H - 0.4) / 2 }, 0.08));
    const bands = [];
    for (const y of [0.8, 2.2, 3.6]) bands.push(P(new THREE.BoxGeometry(gh * 0.96, 0.18, 0.34), '#2b2a27', { x: -s * gh / 2, y }));
    const pm = new THREE.Mesh(merge(planks), MAT.planks); pm.castShadow = pm.receiveShadow = true;
    const bm = new THREE.Mesh(merge(bands), MAT.vcMetal); bm.castShadow = true;
    pivot.add(pm, bm); g.add(pivot); doors.push(pivot);
  }
  // dark interior visible through the open gate
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(gh * 2, H).translate(0, H / 2, -T - 0.2), new THREE.MeshBasicMaterial({ color: 0x0c0b09 }));
  g.add(inner);
  g.userData.doors = doors;
  // a few buildings & a flag behind the wall so the fortress has depth
  const bld = [];
  for (const [x, z, w, h, d] of [[-14, -9, 7, 5.5, 6], [12, -10, 8, 6.5, 7], [-2, -14, 9, 7.5, 6], [24, -7, 6, 4.5, 5], [-26, -8, 7, 5, 6]]) {
    const b = new THREE.BoxGeometry(w, h, d); b.attributes.uv.array.forEach((v, i, arr) => { arr[i] = v * (i % 2 ? h / 3 : w / 3); });
    bld.push(P(b, '#b7ad99', { x, y: h / 2, z }, 0.06));
    bld.push(P(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4), '#8c8373', { x, y: h + 0.15, z }));
  }
  const bm = new THREE.Mesh(merge(bld), MAT.stone); bm.castShadow = bm.receiveShadow = true; g.add(bm);
  const pole = new THREE.Mesh(P(new THREE.CylinderGeometry(0.06, 0.06, 6, 6), '#555', { x: gh + 2.2, y: H + 2.2 + 3, z: -0.4 }), MAT.vcMetal); g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3, 8, 2), new THREE.MeshStandardMaterial({ color: opt.flag || 0x8e1d17, side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(gh + 2.2 + 1.12, H + 2.2 + 5.2, -0.4); flag.castShadow = true;
  g.add(flag); g.userData.flag = flag;
  return g;
}

export function stakeGeo() {
  return merge([
    P(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6), '#5a452e', { y: 0.85 }),
    P(new THREE.TorusGeometry(0.12, 0.025, 4, 10), '#c9b37e', { y: 1.0, rx: Math.PI / 2 }),
  ]);
}
