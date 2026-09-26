// ragdoll.js — a Verlet ragdoll for the soldiers (build v10).
//
// Sixteen particles sit on the rig's joints (pelvis, mid-spine, neck, skull,
// shoulders, elbows, wrists, hips, knees, ankles), tied by rigid sticks and by
// softer range limits that keep the torso a torso, stop limbs folding through
// the body and make knees and elbows bend the right way. Gravity, the terrain
// (with friction), water (drag and a little buoyancy) and walls act on the
// particles; every frame the bones are turned to follow them. The rifle drops
// out of the hand as its own two-particle body. When everything is still the
// ragdoll sleeps and costs nothing.
//
// env: { ground(x, z) → y, water(x, z) → level | null, wall(x, z, r) → [dx, dz] | null }
// World coordinates throughout (x, y up, z).
import * as THREE from 'three';

const N = ['pelvis', 'mid', 'neck', 'head', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR', 'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR'];
export const J = Object.fromEntries(N.map((n, i) => [n, i]));
const SRC = { pelvis: 'Body', mid: 'Torso', neck: 'Neck', head: 'Head', shL: 'UpperArmL', elL: 'LowerArmL', wrL: 'WristL', shR: 'UpperArmR', elR: 'LowerArmR', wrR: 'WristR', hipL: 'UpperLegL', knL: 'LowerLegL', anL: 'AnkleL', hipR: 'UpperLegR', knR: 'LowerLegR', anR: 'AnkleR' };
const MASS = [14, 10, 5, 5, 3, 2, 1, 3, 2, 1, 5, 4, 2, 5, 4, 2];
const RAD = [0.13, 0.14, 0.1, 0.13, 0.08, 0.06, 0.05, 0.08, 0.06, 0.05, 0.1, 0.075, 0.06, 0.1, 0.075, 0.06];
const BUOY = [1.2, 1.35, 1.1, 1.0, 1.0, 0.8, 0.7, 1.0, 0.8, 0.7, 1.0, 0.85, 0.7, 1.0, 0.85, 0.7];
const pair = (s) => s.split(' ').map((p) => p.split('-').map((n) => J[n]));
// rigid: the pelvis and the chest are each a braced tetrahedron joined at the
// mid-spine; limbs are chains
const STICKS = pair('pelvis-mid pelvis-hipL pelvis-hipR hipL-hipR mid-hipL mid-hipR mid-neck neck-shL neck-shR shL-shR mid-shL mid-shR neck-head shL-elL elL-wrL shR-elR elR-wrR hipL-knL knL-anL hipR-knR knR-anR');
// soft: [a, b, min, max] as fractions of the length at hand-over
const RANGES = [['shL-hipL', 0.82, 1.04], ['shR-hipR', 0.82, 1.04], ['shL-hipR', 0.86, 1.07], ['shR-hipL', 0.86, 1.07],
  ['pelvis-neck', 0.84, 1.01], ['head-shL', 0.8, 1.2], ['head-shR', 0.8, 1.2], ['head-mid', 0.9, 1.03]].map(([p, a, b]) => [...pair(p)[0], a, b]);
// plank: stiff as a board until he hits the ground
const RIGID = pair('head-anL head-anR mid-anL mid-anR pelvis-anL pelvis-anR hipL-anR hipR-anL shL-knL shR-knR anL-anR knL-knR wrL-hipL wrR-hipR elL-hipL elR-hipR wrL-shL wrR-shR head-pelvis');
const ITER = 8;

const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3(), _Qi = new THREE.Quaternion(), _dq = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

// the joint positions the ragdoll is built on, from a posed soldier
export function sampleJoints(s, out = new Float32Array(48)) {
  const B = s.bones;
  for (let i = 0; i < 16; i++) {
    B[SRC[N[i]]].getWorldPosition(_v);
    if (i === J.head) { B.Neck.getWorldPosition(_u); _v.addScaledVector(_u.sub(_v).negate().normalize(), 0.13); }   // centre of the skull
    out[i * 3] = _v.x; out[i * 3 + 1] = _v.y; out[i * 3 + 2] = _v.z;
  }
  return out;
}

// bone placement against the parent's current world matrix
function place(bone, pos, quat) {
  const par = bone.parent;
  par.matrixWorld.decompose(_P, _Q, _S);
  _Qi.copy(_Q).invert();
  if (quat) bone.quaternion.copy(_Qi).multiply(quat);
  if (pos) bone.position.copy(pos).sub(_P).applyQuaternion(_Qi).divide(_S);
  bone.updateMatrix();
  bone.matrixWorld.multiplyMatrices(par.matrixWorld, bone.matrix);
}
const keep = (bone) => place(bone, null, null);
// turn a bone the least amount that points its child at `target`
function swingTo(bone, childLocal, target) {
  keep(bone);
  bone.matrixWorld.decompose(_P, _Q, _S);
  _u.copy(childLocal).multiply(_S).applyQuaternion(_Q).normalize();
  _w.copy(target).sub(_P);
  if (_w.lengthSq() < 1e-8) return;
  _w.normalize();
  _dq.setFromUnitVectors(_u, _w);
  _q1.copy(_dq).multiply(_Q);
  place(bone, null, _q1);
}

export class Ragdoll {
  constructor(s, env, o = {}) {
    this.s = s; this.env = env;
    const B = s.bones;
    s.obj.updateMatrixWorld(true);
    const gun = s.T.gun;
    this.n = gun ? 18 : 16;
    const n = this.n;
    this.x = new Float32Array(n * 3); this.p = new Float32Array(n * 3);
    this.floor = new Float32Array(n);
    this.w = new Float32Array(n); this.rad = new Float32Array(n);
    sampleJoints(s, this.x);
    for (let i = 0; i < 16; i++) { this.w[i] = 1 / MASS[i]; this.rad[i] = RAD[i]; }
    // the weapon: butt and muzzle
    this.gun = null;
    if (gun) {
      const G = B.Gun, sc = s.T.scale;
      G.updateMatrixWorld(true);
      _v.copy(gun.butt).applyMatrix4(G.matrixWorld); this.x.set([_v.x, _v.y, _v.z], 48);
      _v.copy(gun.muzzle).applyMatrix4(G.matrixWorld); this.x.set([_v.x, _v.y, _v.z], 51);
      this.w[16] = this.w[17] = 1 / 1.5; this.rad[16] = this.rad[17] = 0.04;
      this.gun = { q: G.getWorldQuaternion(new THREE.Quaternion()), butt: gun.butt.clone().multiplyScalar(sc), len: gun.butt.distanceTo(gun.muzzle) * sc };
    }
    this.p.set(this.x);
    // carry the motion the body already had
    if (o.prev) {
      for (let i = 0; i < 48; i++) this.p[i] = this.x[i] - (this.x[i] - o.prev[i]) * (o.prevScale || 1);
      if (gun) for (let k = 48; k < 54; k++) this.p[k] = this.x[k] - (this.x[J.wrR * 3 + (k % 3)] - o.prev[J.wrR * 3 + (k % 3)]);
    }
    const L = (a, b) => Math.hypot(this.x[a * 3] - this.x[b * 3], this.x[a * 3 + 1] - this.x[b * 3 + 1], this.x[a * 3 + 2] - this.x[b * 3 + 2]);
    this.sticks = STICKS.map(([a, b]) => [a, b, L(a, b)]);
    if (gun) this.sticks.push([16, 17, this.gun.len]);
    this.ranges = RANGES.map(([a, b, lo, hi]) => { const l = L(a, b); return [a, b, l * lo, l * hi]; });
    // limits that don't depend on the pose he died in
    const arm = (sd) => L(J['sh' + sd], J['el' + sd]) + L(J['el' + sd], J['wr' + sd]);
    const leg = (sd) => L(J['hip' + sd], J['kn' + sd]) + L(J['kn' + sd], J['an' + sd]);
    const hipW = L(J.hipL, J.hipR), thigh = L(J.hipL, J.knL);
    for (const sd of ['L', 'R']) {
      this.ranges.push([J['sh' + sd], J['wr' + sd], arm(sd) * 0.32, 1e9]);            // arms don't fold flat
      this.ranges.push([J['hip' + sd], J['an' + sd], leg(sd) * 0.42, 1e9]);           // nor legs
      this.ranges.push([J['wr' + sd], J.mid, 0.16, 1e9], [J['el' + sd], J.mid, 0.15, 1e9], [J['wr' + sd], J.pelvis, 0.14, 1e9]);
      this.ranges.push([J['kn' + sd], J['sh' + sd], thigh * 0.55, 1e9], [J['kn' + sd], J.mid, thigh * 0.45, 1e9]);
    }
    // legs neither cross nor do the splits
    this.ranges.push([J.knL, J.knR, hipW * 0.65, hipW + thigh * 1.3], [J.anL, J.anR, hipW * 0.45, hipW + (leg('L') + leg('R')) * 0.62]);
    this.rigid = o.rigid ? RIGID.map(([a, b]) => [a, b, L(a, b)]) : null;
    this.G = o.gravity || 17;
    this.t = 0; this.still = 0; this.asleep = false; this.dtPrev = 1 / 60;
    this.landed = false; this.landSpeed = 0; this.float = 1.3;
    this.contact = new Uint8Array(n);
    // v11 events for sound: onGunLand(speed), onBump(speed, x, y, z), onSplash(x, y, z)
    this.wet = new Uint8Array(n); this.vy = new Float32Array(n); this.gunDown = false;
    this.splashed = new Uint8Array(n); this.bumps = 0; this.lastBump = -1; this.splashes = 0;
    // bone frames at hand-over: the pelvis and chest follow particle frames,
    // the feet ride on the shins
    this.q0 = { body: B.Body.getWorldQuaternion(new THREE.Quaternion()), chest: B.Chest.getWorldQuaternion(new THREE.Quaternion()) };
    this.f0 = { body: this.frame(J.hipL, J.hipR, J.mid, J.pelvis, new THREE.Quaternion()).invert(), chest: this.frame(J.shL, J.shR, J.neck, J.mid, new THREE.Quaternion()).invert() };
    this.foot = {};
    for (const sd of ['L', 'R']) {
      const shin = B['LowerLeg' + sd].getWorldQuaternion(new THREE.Quaternion());
      this.foot[sd] = shin.invert().multiply(B['Foot' + sd].getWorldQuaternion(new THREE.Quaternion()));
    }
  }

  // orthonormal frame: lateral a→… from b to a, up from d to c
  frame(a, b, c, d, out) {
    const X = this.x;
    _x.set(X[a * 3] - X[b * 3], X[a * 3 + 1] - X[b * 3 + 1], X[a * 3 + 2] - X[b * 3 + 2]).normalize();
    _y.set(X[c * 3] - X[d * 3], X[c * 3 + 1] - X[d * 3 + 1], X[c * 3 + 2] - X[d * 3 + 2]);
    _y.addScaledVector(_x, -_y.dot(_x)).normalize();
    _z.crossVectors(_x, _y);
    return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  }

  // ---------------------------------------------------------------- kicks
  // add a velocity (m/s) to every particle, or to the named ones
  push(vx, vy, vz, names = null, k = 1) {
    const d = this.dtPrev;
    const list = names ? names.map((nm) => J[nm] ?? nm) : [...Array(this.n).keys()];
    for (const i of list) { this.p[i * 3] -= vx * d * k; this.p[i * 3 + 1] -= vy * d * k; this.p[i * 3 + 2] -= vz * d * k; }
    this.wake();
  }
  // spin the whole body (rad/s) about an axis through its centre of mass
  spin(ax, ay, az, w) {
    const X = this.x, d = this.dtPrev;
    let cx = 0, cy = 0, cz = 0, m = 0;
    for (let i = 0; i < 16; i++) { const mi = 1 / this.w[i]; cx += X[i * 3] * mi; cy += X[i * 3 + 1] * mi; cz += X[i * 3 + 2] * mi; m += mi; }
    cx /= m; cy /= m; cz /= m;
    _w.set(ax, ay, az).normalize().multiplyScalar(w);
    for (let i = 0; i < this.n; i++) {
      _u.set(X[i * 3] - cx, X[i * 3 + 1] - cy, X[i * 3 + 2] - cz);
      _v.crossVectors(_w, _u);
      this.p[i * 3] -= _v.x * d; this.p[i * 3 + 1] -= _v.y * d; this.p[i * 3 + 2] -= _v.z * d;
    }
    this.wake();
  }
  wake() { this.asleep = false; this.still = 0; }
  unrigid() { this.rigid = null; }
  pos(name, out = new THREE.Vector3()) { const i = J[name] ?? name; return out.set(this.x[i * 3], this.x[i * 3 + 1], this.x[i * 3 + 2]); }
  // how hard a particle is moving (m/s)
  speed(name) { const i = (J[name] ?? name) * 3; return Math.hypot(this.x[i] - this.p[i], this.x[i + 1] - this.p[i + 1], this.x[i + 2] - this.p[i + 2]) / this.dtPrev; }

  // ---------------------------------------------------------------- physics
  step(dt) {
    if (this.asleep) return;
    dt = Math.min(Math.max(dt, 1e-4), 1 / 30);
    this.t += dt;
    const X = this.x, P = this.p, n = this.n, env = this.env;
    const r = dt / this.dtPrev; this.dtPrev = dt;
    const g = this.G * dt * dt;
    const wl = env.water ? env.water(X[0], X[2]) : null;
    if (wl !== null) this.float = Math.max(0.55, this.float - dt * 0.18);
    let fallV = 0;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      let damp = 0.999, ay = -g;
      const vy0 = (X[k + 1] - P[k + 1]) / dt;
      this.vy[i] = vy0;
      if (i <= J.head && vy0 < fallV) fallV = vy0;
      if (wl !== null && X[k + 1] < wl) { damp = 0.9; ay += g * (BUOY[i] || 0.7) * this.float; }
      const vx = (X[k] - P[k]) * r * damp, vy = (X[k + 1] - P[k + 1]) * r * damp, vz = (X[k + 2] - P[k + 2]) * r * damp;
      P[k] = X[k]; P[k + 1] = X[k + 1]; P[k + 2] = X[k + 2];
      X[k] += vx; X[k + 1] += vy + ay; X[k + 2] += vz;
      this.floor[i] = env.ground(X[k], X[k + 2]) + this.rad[i];
    }
    for (let it = 0; it < ITER; it++) {
      for (const [a, b, l] of this.sticks) this.dist(a, b, l, l);
      if (this.rigid) for (const [a, b, l] of this.rigid) this.dist(a, b, l, l);
      for (const [a, b, lo, hi] of this.ranges) this.dist(a, b, lo, hi);
      if (it & 1) {
        this.hinge(J.hipL, J.hipR, J.hipL, J.knL, J.anL, 1); this.hinge(J.hipL, J.hipR, J.hipR, J.knR, J.anR, 1);
        this.hinge(J.shL, J.shR, J.shL, J.elL, J.wrL, -1); this.hinge(J.shL, J.shR, J.shR, J.elR, J.wrR, -1);
        this.hipLimit(J.hipL, J.knL); this.hipLimit(J.hipR, J.knR);
      }
      for (let i = 0; i < n; i++) if (X[i * 3 + 1] < this.floor[i]) X[i * 3 + 1] = this.floor[i];
    }
    // walls (only near the ground: a body flying high clears the sandbags)
    if (env.wall) {
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        if (X[k + 1] > this.floor[i] + 1.3) continue;
        const pu = env.wall(X[k], X[k + 2], this.rad[i]);
        if (pu) { X[k] += pu[0]; X[k + 2] += pu[1]; P[k] += pu[0]; P[k + 2] += pu[1]; }
      }
    }
    // friction where he touches the ground
    let move = 0, touch = false;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      const on = X[k + 1] <= this.floor[i] + 0.004;
      // sounds: the rifle hitting the ground, the body bouncing after the
      // first landing, a hand, foot or head slapping into water
      if (on && !this.contact[i]) {
        if (i >= 16 && !this.gunDown) { this.gunDown = true; if (this.onGunLand) this.onGunLand(Math.hypot(X[k] - P[k], X[k + 1] - P[k + 1], X[k + 2] - P[k + 2]) / dt); }
        else if (this.landed && (i === J.pelvis || i === J.mid || i === J.head) && this.vy[i] < -3.2 && this.bumps < 1 && this.t - this.lastBump > 0.35 && this.onBump) {
          this.bumps++; this.lastBump = this.t; this.onBump(-this.vy[i], X[k], X[k + 1], X[k + 2]);
        }
      }
      // (a floating body bobs across the surface: only a limb's first entry splashes)
      const wet = wl !== null && X[k + 1] < wl;
      if (wet && !this.wet[i] && !this.splashed[i] && this.vy[i] < -1.5 && this.splashes < 3 && this.onSplash && i < 16) { this.splashed[i] = 1; this.splashes++; this.onSplash(X[k], wl, X[k + 2]); }
      this.wet[i] = wet ? 1 : 0;
      this.contact[i] = on ? 1 : 0;
      if (on) {
        const mu = 0.32;
        P[k] = X[k] - (X[k] - P[k]) * (1 - mu); P[k + 2] = X[k + 2] - (X[k + 2] - P[k + 2]) * (1 - mu);
        if (i <= J.head || i === J.shL || i === J.shR) touch = true;
      }
      move = Math.max(move, Math.abs(X[k] - P[k]) + Math.abs(X[k + 1] - P[k + 1]) + Math.abs(X[k + 2] - P[k + 2]));
    }
    if (touch && !this.landed) { this.landed = true; this.landSpeed = -fallV; this.landT = this.t; if (this.onLand) this.onLand(this.landSpeed); }
    if (this.rigid && touch && this.t > 0.15) this.rigid = null;
    this.still = move < 0.003 ? this.still + dt : 0;
    if ((this.still > 0.4 && this.t > 0.6) || this.t > 6) this.asleep = true;
  }

  dist(a, b, lo, hi) {
    const X = this.x, i = a * 3, j = b * 3;
    const dx = X[j] - X[i], dy = X[j + 1] - X[i + 1], dz = X[j + 2] - X[i + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    const tgt = d < lo ? lo : d > hi ? hi : d;
    if (tgt === d) return;
    const wa = this.w[a], wb = this.w[b], k = (d - tgt) / (d * (wa + wb));
    X[i] += dx * k * wa; X[i + 1] += dy * k * wa; X[i + 2] += dz * k * wa;
    X[j] -= dx * k * wb; X[j + 1] -= dy * k * wb; X[j + 2] -= dz * k * wb;
  }
  // knees bend forwards (sign 1), elbows backwards (sign -1): the middle joint
  // must sit on its side of the root→end line, measured against the body's
  // lateral axis (from lat1 to lat0)
  hinge(lat0, lat1, root, mid, end, sign) {
    const X = this.x;
    _x.set(X[lat0 * 3] - X[lat1 * 3], X[lat0 * 3 + 1] - X[lat1 * 3 + 1], X[lat0 * 3 + 2] - X[lat1 * 3 + 2]).normalize();
    _y.set(X[root * 3] - X[end * 3], X[root * 3 + 1] - X[end * 3 + 1], X[root * 3 + 2] - X[end * 3 + 2]);
    const len = _y.length(); if (len < 1e-4) return;
    _y.divideScalar(len);
    _z.crossVectors(_x, _y);
    if (_z.lengthSq() < 0.09) return;                 // limb along the lateral axis: no preferred side
    _z.normalize();
    _u.set(X[mid * 3] - X[end * 3], X[mid * 3 + 1] - X[end * 3 + 1], X[mid * 3 + 2] - X[end * 3 + 2]);
    _u.addScaledVector(_y, -_u.dot(_y));             // the joint's offset from the line
    const off = _u.dot(_z) * sign, min = 0.02 * len;
    if (off >= min) return;
    const k = (min - off) * sign;
    X[mid * 3] += _z.x * k; X[mid * 3 + 1] += _z.y * k; X[mid * 3 + 2] += _z.z * k;
  }

  // a thigh can't swing far behind the body (about 20° past straight)
  hipLimit(hip, knee) {
    const X = this.x;
    _x.set(X[J.hipL * 3] - X[J.hipR * 3], X[J.hipL * 3 + 1] - X[J.hipR * 3 + 1], X[J.hipL * 3 + 2] - X[J.hipR * 3 + 2]).normalize();
    _y.set(X[J.mid * 3] - X[J.pelvis * 3], X[J.mid * 3 + 1] - X[J.pelvis * 3 + 1], X[J.mid * 3 + 2] - X[J.pelvis * 3 + 2]).normalize();
    _z.crossVectors(_x, _y).normalize();               // the body's forward
    _u.set(X[knee * 3] - X[hip * 3], X[knee * 3 + 1] - X[hip * 3 + 1], X[knee * 3 + 2] - X[hip * 3 + 2]);
    const len = _u.length(), f = _u.dot(_z), lim = -0.34 * len;
    if (f >= lim) return;
    const k = lim - f;
    X[knee * 3] += _z.x * k; X[knee * 3 + 1] += _z.y * k; X[knee * 3 + 2] += _z.z * k;
  }

  // ---------------------------------------------------------------- bones
  apply() {
    const s = this.s, B = s.bones, X = this.x;
    if (this.asleep && this.applied) return;
    this.applied = true;
    B.Root.updateWorldMatrix(true, false);
    const at = (i, out) => out.set(X[i * 3], X[i * 3 + 1], X[i * 3 + 2]);
    // pelvis and chest: full frames from the particles
    this.frame(J.hipL, J.hipR, J.mid, J.pelvis, _q2).multiply(this.f0.body).multiply(this.q0.body);
    place(B.Body, at(J.pelvis, _v), _q2);
    keep(B.Hips); keep(B.Abdomen); keep(B.Torso);
    this.frame(J.shL, J.shR, J.neck, J.mid, _q2).multiply(this.f0.chest).multiply(this.q0.chest);
    place(B.Chest, null, _q2);
    swingTo(B.Neck, B.Head.position, at(J.head, _v)); keep(B.Head);
    for (const sd of ['L', 'R']) {
      keep(B['Shoulder' + sd]);
      swingTo(B['UpperArm' + sd], B['LowerArm' + sd].position, at(J['el' + sd], _v));
      swingTo(B['LowerArm' + sd], B['Wrist' + sd].position, at(J['wr' + sd], _v));
      keep(B['Wrist' + sd]);
      swingTo(B['UpperLeg' + sd], B['LowerLeg' + sd].position, at(J['kn' + sd], _v));
      const shin = B['LowerLeg' + sd];
      swingTo(shin, B['Ankle' + sd].position, at(J['an' + sd], _v));
      keep(B['Ankle' + sd]);
      B['Ankle' + sd].matrixWorld.decompose(_v, _Q, _S);
      shin.matrixWorld.decompose(_P, _q1, _S);
      place(B['Foot' + sd], _v, _q1.multiply(this.foot[sd]));
    }
    if (this.gun) {
      // swing the weapon's frame round to its particles, then roll it flat as it settles
      at(17, _w).sub(at(16, _u)).normalize();
      _v.set(0, 0, 1).applyQuaternion(this.gun.q);
      _dq.setFromUnitVectors(_v, _w);
      this.gun.q.premultiply(_dq);
      if (this.contact[16] || this.contact[17]) {
        // resting on the ground it rolls onto its side: turn about the barrel
        // until its up axis lies flat
        _v.set(0, 1, 0).applyQuaternion(this.gun.q);
        if (Math.abs(_v.y) > 0.05) {
          _u.crossVectors(_w, _v);                      // how 'up' moves for a turn about the barrel
          const th = -Math.sign(_v.y * (_u.y || 1)) * Math.min(0.15, Math.abs(_v.y));
          _dq.setFromAxisAngle(_w, th); this.gun.q.premultiply(_dq);
        }
      }
      _v.copy(this.gun.butt).applyQuaternion(this.gun.q);
      place(B.Gun, at(16, _u).sub(_v), this.gun.q);
    }
  }
}
