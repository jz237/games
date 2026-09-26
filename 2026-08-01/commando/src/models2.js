// models2.js — props and vehicles for Areas 2 and 3: palisades and the log
// fort, beached boat, lily pads, prisoner cages, barracks, lamps, searchlight
// heads, chain-link fence, fuel tanks, the army truck and tank (KolosStudios
// models; the tank split into hull / turret / barrel) and the motorcycle with
// sidecar. Same conventions as models.js.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { P, merge, MAT } from './models.js';
import { tankParts, flatGeo } from './assets.js';
import { mulberry } from './util.js';

const cyl = (r0, r1, h, s = 6) => new THREE.CylinderGeometry(r0, r1, h, s);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const bark = ['#5a4430', '#634b33', '#4f3c2a', '#6b5238'];

// ------------------------------------------------------------------ palisade
// one sharpened log upright at local (0,0,0)
function stake(parts, x, z, h, r, seed, y0 = 0) {
  const rr = mulberry(seed);
  const c = bark[(rr() * bark.length) | 0];
  parts.push(P(cyl(r * 0.95, r, h + 0.3, 7), c, { x, y: y0 + h / 2 - 0.15, z, rz: (rr() - 0.5) * 0.04, rx: (rr() - 0.5) * 0.04 }, 0.12, seed));
  parts.push(P(new THREE.ConeGeometry(r * 0.95, r * 2.4, 7), '#8a7050', { x, y: y0 + h + r * 1.2, z }, 0.08, seed + 1));
}
// a run of logs along [[x, p], ...] in world coordinates (hfn gives the
// ground height under each log), with two binding rails
export function palisadeGeo(pts, H = 3.4, hfn = null) {
  const parts = [];
  let seed = 11;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, p0] = pts[i], [x1, p1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, p1 - p0), n = Math.max(2, Math.round(len / 0.34));
    for (let k = 0; k <= n; k++) {
      const t = k / n, h = H * (0.9 + ((seed * 37) % 11) / 55);
      const x = x0 + (x1 - x0) * t, p = p0 + (p1 - p0) * t;
      stake(parts, x, -p, h, 0.17, seed++, hfn ? hfn(x, p) : 0);
    }
    const ang = Math.atan2(-(p1 - p0), x1 - x0), mx = (x0 + x1) / 2, mz = -(p0 + p1) / 2;
    const ym = hfn ? hfn(mx, -mz) : 0;
    for (const y of [0.9, H - 0.7]) {
      const g = cyl(0.08, 0.08, len, 6); g.rotateZ(Math.PI / 2); g.rotateY(ang);
      parts.push(P(g, '#4a3826', { x: mx, y: ym + y, z: mz + 0.19 }));
    }
  }
  return merge(parts);
}

export function gatePostGeo() {
  const parts = [];
  parts.push(P(cyl(0.26, 0.3, 4.2, 8), '#4d3a28', { y: 2.1 }, 0.1));
  parts.push(P(box(0.9, 0.2, 0.2), '#3f3022', { y: 3.8 }));
  parts.push(P(new THREE.ConeGeometry(0.28, 0.5, 8), '#6a5238', { y: 4.45 }));
  return merge(parts);
}

// the log fort at the end of Area 2: palisade wall, two gatehouse towers,
// hinged log doors, a flag (same userData contract as fortressGroup)
export function palisadeFortGroup(area, width = 96) {
  const g = new THREE.Group(), gh = area.gateHalf, H = 4.8;
  const wall = [];
  const left = palisadeGeo([[-width / 2, 0], [-gh - 1.6, 0]], H), right = palisadeGeo([[gh + 1.6, 0], [width / 2, 0]], H);
  const wm = new THREE.Mesh(merge([left, right]), MAT.vc); wm.castShadow = wm.receiveShadow = true; g.add(wm);
  // gatehouse towers: four big corner logs, a deck, a thatch roof
  const tow = [];
  for (const s of [-1, 1]) {
    const cx = s * (gh + 1.6);
    for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) tow.push(P(cyl(0.22, 0.26, 7.2, 8), '#4d3a28', { x: cx + dx, y: 3.6, z: dz }, 0.1, dx * 7 + dz));
    tow.push(P(box(3.2, 0.2, 3.2), '#6a5238', { x: cx, y: 5.6, z: 0 }));
    for (const [dx, dz, w, d] of [[0, -1.55, 3.2, 0.1], [0, 1.55, 3.2, 0.1], [-1.55, 0, 0.1, 3.2], [1.55, 0, 0.1, 3.2]]) tow.push(P(box(w, 0.9, d), '#5a4430', { x: cx + dx, y: 6.15, z: dz }));
  }
  tow.push(P(box(gh * 2 + 3.2, 0.5, 1.2), '#4f3c2a', { y: 5.3, z: 0.1 }));   // walkway over the gate
  const tm = new THREE.Mesh(merge(tow), MAT.vc); tm.castShadow = tm.receiveShadow = true; g.add(tm);
  for (const s of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4, 1, true).rotateY(Math.PI / 4).translate(s * (gh + 1.6), 7.6, 0), MAT.thatch.clone());
    roof.material.side = THREE.DoubleSide; roof.castShadow = true; g.add(roof);
  }
  // doors of vertical logs on hinges at the gate edges
  const doors = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * gh, 0, 0.1);
    const logs = [];
    const n = Math.round(gh / 0.32);
    for (let k = 0; k < n; k++) stake(logs, -s * (k + 0.5) * (gh / n), 0, H - 0.3, 0.16, 400 + k + (s > 0 ? 50 : 0));
    for (const y of [1, 3]) logs.push(P(box(gh, 0.18, 0.12), '#3a2c1e', { x: -s * gh / 2, y, z: 0.18 }));
    const dm = new THREE.Mesh(merge(logs), MAT.vc); dm.castShadow = true; pivot.add(dm);
    g.add(pivot); doors.push(pivot);
  }
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(gh * 2, H).translate(0, H / 2, -1.2), new THREE.MeshBasicMaterial({ color: 0x0c0b09 }));
  g.add(inner);
  const pole = new THREE.Mesh(P(cyl(0.06, 0.06, 5, 6), '#555', { x: gh + 1.6, y: 8.2 + 2.5 }), MAT.vcMetal); g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3, 8, 2), new THREE.MeshStandardMaterial({ color: 0x7a1a14, side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(gh + 1.6 + 1.12, 12.2, 0); flag.castShadow = true; g.add(flag);
  g.userData.doors = doors; g.userData.flag = flag;
  return g;
}

// ------------------------------------------------------------------ shoreline & swamp
export function boatGroup(sunk = false) {
  const g = new THREE.Group();
  const L = 7.2, W = 2.6;
  const sh = new THREE.Shape();
  sh.moveTo(-W / 2, -L / 2); sh.lineTo(W / 2, -L / 2); sh.lineTo(W / 2, L / 2 - 1.4); sh.quadraticCurveTo(W / 2, L / 2, 0, L / 2 + 0.2);
  sh.quadraticCurveTo(-W / 2, L / 2, -W / 2, L / 2 - 1.4); sh.closePath();
  const hole = new THREE.Path();
  const w2 = W / 2 - 0.14;
  hole.moveTo(-w2, -L / 2 + 0.14); hole.lineTo(w2, -L / 2 + 0.14); hole.lineTo(w2, L / 2 - 1.5); hole.quadraticCurveTo(w2, L / 2 - 0.2, 0, L / 2 - 0.1);
  hole.quadraticCurveTo(-w2, L / 2 - 0.2, -w2, L / 2 - 1.5); hole.closePath();
  sh.holes.push(hole);
  const hull = new THREE.ExtrudeGeometry(sh, { depth: 1.1, bevelEnabled: false });
  hull.rotateX(-Math.PI / 2);
  const floor = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(0, 0.12, 0);
  const col = sunk ? '#3d4236' : '#56604a';
  const parts = [P(hull, col, {}, 0.12), P(floor, '#3a3226', {}, 0.1)];
  for (let i = 0; i < 4; i++) parts.push(P(box(W - 0.3, 0.08, 0.3), '#6a5238', { y: 0.55, z: -L / 2 + 1.2 + i * 1.3 }));
  parts.push(P(box(0.5, 0.35, 0.5), '#2a2a26', { y: 0.3, z: -L / 2 + 0.6 }));        // outboard
  const m = new THREE.Mesh(merge(parts), MAT.vc); m.castShadow = m.receiveShadow = true; g.add(m);
  m.rotation.z = sunk ? 0.18 : 0.08; m.rotation.x = sunk ? -0.12 : -0.05;
  return g;
}

export function lilyGeo(seed) {
  const r = mulberry(seed), parts = [];
  const n = 2 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const rad = 0.18 + r() * 0.16, g = new THREE.CircleGeometry(rad, 10, 0.4, Math.PI * 2 - 0.4);
    g.rotateX(-Math.PI / 2);
    parts.push(P(g, ['#3f6a2c', '#4d7a33', '#355c26'][(r() * 3) | 0], { x: (r() - 0.5) * 0.9, z: (r() - 0.5) * 0.9, ry: r() * 6 }, 0.1, i));
  }
  if (r() < 0.4) parts.push(P(new THREE.SphereGeometry(0.06, 6, 4), '#e8a8c0', { y: 0.04, x: (r() - 0.5) * 0.4 }));
  return merge(parts);
}

// ------------------------------------------------------------------ prison camp
export function cageGroup() {
  const g = new THREE.Group(), parts = [];
  const W = 2.6, D = 2.6, H = 2.0;
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) parts.push(P(cyl(0.07, 0.08, H + 0.2, 6), '#7a6a40', { x, y: (H + 0.2) / 2, z }, 0.1));
  // bars on the back and sides
  for (let i = 1; i < 10; i++) {
    const t = -W / 2 + i * W / 10;
    parts.push(P(cyl(0.025, 0.025, H, 5), '#a08a55', { x: t, y: H / 2, z: -D / 2 }, 0.15, i));
    parts.push(P(cyl(0.025, 0.025, H, 5), '#a08a55', { x: -W / 2, y: H / 2, z: t }, 0.15, i + 20));
    parts.push(P(cyl(0.025, 0.025, H, 5), '#a08a55', { x: W / 2, y: H / 2, z: t }, 0.15, i + 40));
  }
  for (const y of [0.15, H]) {
    parts.push(P(box(W, 0.06, 0.06), '#7a6a40', { y, z: -D / 2 })); parts.push(P(box(W, 0.06, 0.06), '#7a6a40', { y, z: D / 2 }));
    parts.push(P(box(0.06, 0.06, D), '#7a6a40', { y, x: -W / 2 })); parts.push(P(box(0.06, 0.06, D), '#7a6a40', { y, x: W / 2 }));
  }
  const m = new THREE.Mesh(merge(parts), MAT.vc); m.castShadow = true; m.receiveShadow = true; g.add(m);
  const roof = new THREE.Mesh(box(W + 0.5, 0.12, D + 0.5).translate(0, H + 0.12, 0), MAT.thatch); roof.castShadow = true; g.add(roof);
  // the door: a panel of bars on the south face (+Z), hinged at its left edge
  const door = new THREE.Group(); door.position.set(-W / 2 + 0.05, 0, D / 2);
  const dp = [];
  for (let i = 0; i < 10; i++) dp.push(P(cyl(0.025, 0.025, H - 0.1, 5), '#a08a55', { x: 0.13 + i * (W - 0.2) / 10, y: H / 2 }, 0.15, i + 60));
  dp.push(P(box(W - 0.1, 0.06, 0.06), '#7a6a40', { x: (W - 0.1) / 2, y: 0.25 })); dp.push(P(box(W - 0.1, 0.06, 0.06), '#7a6a40', { x: (W - 0.1) / 2, y: H - 0.15 }));
  dp.push(P(box(0.14, 0.2, 0.1), '#2a2a26', { x: W - 0.35, y: 1.0, z: 0.05 }));   // padlock
  const dm = new THREE.Mesh(merge(dp), MAT.vc); dm.castShadow = true; door.add(dm);
  g.add(door); g.userData.door = door;
  return g;
}

export function barracksGroup() {
  const g = new THREE.Group();
  const W = 8.4, D = 4.4, H = 2.4;
  const base = [];
  for (let i = 0; i < 5; i++) for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) base.push(P(cyl(0.12, 0.14, 0.6, 6), '#4a3a28', { x: -W / 2 + 0.4 + i * (W - 0.8) / 4, y: 0.3, z }));
  base.push(P(box(W, 0.14, D), '#7a5f40', { y: 0.62 }));
  base.push(P(box(1.0, 1.7, 0.1), '#15100b', { y: 0.7 + 0.85, z: D / 2 + 0.01 }));
  for (const x of [-2.6, 2.6]) base.push(P(box(1.2, 0.6, 0.1), '#15100b', { x, y: 0.7 + 1.35, z: D / 2 + 0.01 }));
  const bm = new THREE.Mesh(merge(base), MAT.vc); bm.castShadow = bm.receiveShadow = true; g.add(bm);
  const walls = [];
  const wall = (w, h, x, z, ry) => { const b = box(w, h, 0.1); b.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? h / 1.2 : w / 1.2); }); P(b, '#a58b66', { x, y: 0.7 + h / 2, z, ry }, 0.1); walls.push(b); };
  wall(W, H, 0, -D / 2 + 0.05, 0); wall(W, H, 0, D / 2 - 0.05, 0);
  wall(D, H, -W / 2 + 0.05, 0, Math.PI / 2); wall(D, H, W / 2 - 0.05, 0, Math.PI / 2);
  const wm = new THREE.Mesh(merge(walls), MAT.planks); wm.castShadow = wm.receiveShadow = true; g.add(wm);
  // corrugated tin roof: two ribbed slopes
  const roof = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const rib = box(W / 16 + 0.02, 0.05, D / 2 + 0.7);
      P(rib, i % 2 ? '#7c7a72' : '#6a6862', { x: -W / 2 + (i + 0.5) * W / 16, y: 0.7 + H + 0.55, z: s * (D / 4 + 0.2), rx: s * 0.42 }, 0.05, i);
      roof.push(rib);
    }
  }
  const rm = new THREE.Mesh(merge(roof), MAT.vc); rm.castShadow = rm.receiveShadow = true; g.add(rm);
  return g;
}

export function lampGroup() {
  const g = new THREE.Group(), parts = [];
  parts.push(P(cyl(0.06, 0.08, 3.4, 6), '#3a3a36', { y: 1.7 }));
  parts.push(P(box(0.9, 0.06, 0.06), '#3a3a36', { x: 0.4, y: 3.35 }));
  parts.push(P(new THREE.ConeGeometry(0.28, 0.25, 10, 1, true), '#2e3a30', { x: 0.8, y: 3.25 }));
  const m = new THREE.Mesh(merge(parts), MAT.vcMetal); m.castShadow = true; g.add(m);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.6), toneMapped: false }));
  bulb.position.set(0.8, 3.14, 0); g.add(bulb);
  g.userData.bulbPos = new THREE.Vector3(0.8, 3.05, 0);
  return g;
}

export function searchHeadGeo() {
  return merge([
    P(cyl(0.34, 0.3, 0.6, 12).rotateX(Math.PI / 2), '#2d302b', {}),
    P(box(0.2, 0.5, 0.2), '#2d302b', { y: -0.4 }),
  ]);
}

export function fenceGroup(pts, tex) {
  const g = new THREE.Group(), posts = [], wire = [];
  const H = 2.2;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.6, color: 0x9a9c9e });
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, p0] = pts[i], [x1, p1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, p1 - p0), n = Math.max(1, Math.round(len / 2.6));
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = x0 + (x1 - x0) * t, z = -(p0 + (p1 - p0) * t);
      posts.push(P(cyl(0.05, 0.05, H + 0.3, 6), '#5a5c58', { x, y: (H + 0.3) / 2, z }));
      posts.push(P(box(0.05, 0.5, 0.05), '#5a5c58', { x, y: H + 0.45, z: z - 0.18, rx: 0.6 }));
    }
    const plane = new THREE.PlaneGeometry(len, H);
    plane.attributes.uv.array.forEach((v, j, a) => { a[j] = v * (j % 2 ? H / 1.2 : len / 1.2); });
    plane.translate(0, H / 2 + 0.05, 0);
    plane.rotateY(Math.atan2(-(p1 - p0), x1 - x0));
    plane.translate((x0 + x1) / 2, 0, -(p0 + p1) / 2);
    wire.push(plane);
  }
  const pm = new THREE.Mesh(merge(posts), MAT.vcMetal); pm.castShadow = true; g.add(pm);
  const wm = new THREE.Mesh(merge(wire.map(w => P(w, '#ffffff'))), mat); wm.castShadow = true; g.add(wm);
  wm.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.4, side: THREE.DoubleSide });
  return g;
}

export function fuelTankGroup() {
  const g = new THREE.Group(), parts = [];
  const tank = cyl(1.1, 1.1, 4.2, 16); tank.rotateZ(Math.PI / 2);
  parts.push(P(tank, '#5a6040', { y: 1.35 }, 0.06));
  for (const x of [-2.1, 2.1]) { const cap = new THREE.SphereGeometry(1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); cap.rotateZ(-Math.sign(x) * Math.PI / 2); parts.push(P(cap, '#5a6040', { x, y: 1.35 })); }
  for (const x of [-1.2, 1.2]) parts.push(P(box(0.3, 0.5, 1.9), '#3a3a34', { x, y: 0.25 }));
  parts.push(P(cyl(1.12, 1.12, 0.4, 16).rotateZ(Math.PI / 2), '#b8902a', { y: 1.35, x: 0.6 }));   // hazard band
  parts.push(P(cyl(0.18, 0.18, 0.25, 8), '#2a2a26', { y: 2.55 }));
  const m = new THREE.Mesh(merge(parts), MAT.vcMetal); m.castShadow = m.receiveShadow = true; g.add(m);
  return g;
}

// ------------------------------------------------------------------ vehicles
// army truck (KolosStudios Military Pack), cab facing +Z like the other vehicles
export function militaryTruckGroup(fuel = false) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(flatGeo('props', fuel ? 'kolos-fuel-truck' : 'kolos-truck', { w: 6.3, ry: Math.PI / 2 }), MAT.vc);
  m.castShadow = m.receiveShadow = true; g.add(m);
  return g;
}

// tank (KolosStudios Military Pack): hull, a turret that yaws and a barrel
// that recoils (the barrel group rests at z = 1.0). Faces +Z like the other vehicles.
export function tankGroup() {
  const T = tankParts(), g = new THREE.Group();
  const hm = new THREE.Mesh(T.hull, MAT.vc); hm.castShadow = hm.receiveShadow = true; g.add(hm);
  const turret = new THREE.Group(); turret.position.set(0, T.deck, T.pivotZ); g.add(turret);
  const tm = new THREE.Mesh(T.turret, MAT.vc); tm.castShadow = tm.receiveShadow = true; turret.add(tm);
  const barrel = new THREE.Group(); barrel.position.set(0, 0, 1.0); turret.add(barrel);
  if (T.barrel) { const bm = new THREE.Mesh(T.barrel, MAT.vc); bm.castShadow = true; barrel.add(bm); }
  g.userData = { turret, barrel, muzzle: new THREE.Vector3(0, 0, 3.0) };
  return g;
}

// motorcycle with sidecar; riders are separate soldiers placed at userData seats
export function motoGroup() {
  const g = new THREE.Group(), parts = [];
  const olive = '#4a5234', dark = '#1f1f1c';
  for (const z of [-0.75, 0.75]) parts.push(P(cyl(0.34, 0.34, 0.14, 14).rotateZ(Math.PI / 2), dark, { y: 0.34, z }));
  parts.push(P(box(0.22, 0.3, 1.3), olive, { y: 0.62 }));
  parts.push(P(new RoundedBoxGeometry(0.34, 0.26, 0.55, 2, 0.1), olive, { y: 0.86, z: 0.25 }));   // fuel tank
  parts.push(P(box(0.3, 0.1, 0.5), '#2a241c', { y: 0.86, z: -0.28 }));                             // saddle
  parts.push(P(box(0.7, 0.05, 0.05), dark, { y: 1.08, z: 0.62 }));                                   // handlebars
  parts.push(P(cyl(0.03, 0.03, 0.6, 5), dark, { y: 0.8, z: 0.7, rx: 0.4 }));                       // forks
  // sidecar on the right (-X)
  parts.push(P(new RoundedBoxGeometry(0.75, 0.55, 1.5, 2, 0.2), olive, { x: -0.8, y: 0.55, z: 0.05 }, 0.05));
  parts.push(P(cyl(0.3, 0.3, 0.12, 12).rotateZ(Math.PI / 2), dark, { x: -1.22, y: 0.3, z: 0 }));
  parts.push(P(box(0.08, 0.08, 0.7), dark, { x: -0.8, y: 1.0, z: 0.55 }));                         // sidecar MG
  const m = new THREE.Mesh(merge(parts), MAT.vc); m.castShadow = true; m.receiveShadow = true; g.add(m);
  g.userData = { rider: new THREE.Vector3(0, 0.42, -0.25), gunner: new THREE.Vector3(-0.8, 0.32, -0.15) };
  return g;
}
