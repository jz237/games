// soldier.js — animated soldiers built from Quaternius' Ultimate Modular Men
// (CC0): one rig shared by every character, with swappable head / body / legs /
// feet. Each kind is baked once into a single skinned mesh with vertex colours
// and its weapon bound rigidly to the right wrist, so a soldier is one draw
// call. The game drives the same parameters it always has (speed, stride
// phase, crouch, throw, death, aim twist); here they pick and blend the rig's
// clips, and two-bone IK adds what the clips don't have: the left hand on the
// rifle's handguard, and crouching.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLB, toFloat, flatGeo } from './assets.js';
import { clamp } from './util.js';

// parts: which character file each body part comes from; tint: material name →
// colour (the weapon keeps its own colours); gun: 'rifle' (two hands) or 'smg'
export const LOOKS = {
  joe: {
    parts: { Head: 'adventurer', Body: 'beach', Legs: 'adventurer', Feet: 'adventurer' }, gun: 'rifle', h: 2.08, rim: [0.22, 0.18, 0.1],
    tint: { LightBrown: '#3d4529', Brown2: '#4c5232', Brown: '#5b6139', Hair: '#1d150f', Black: '#2a241c', Grey: '#3a3a33' },
  },
  rifle: {
    parts: { Head: 'swat', Body: 'swat', Legs: 'swat', Feet: 'swat' }, gun: 'rifle', h: 2.0, rim: [0.34, 0.07, 0.03],
    tint: { Swat: '#566a82', Swat_Black: '#262a31', Visor: '#1a1d22' },
  },
  lobber: {
    parts: { Head: 'swat', Body: 'swat', Legs: 'swat', Feet: 'swat' }, gun: null, h: 2.0, rim: [0.34, 0.07, 0.03],
    tint: { Swat: '#84744f', Swat_Black: '#3a3427', Visor: '#1a1d22' },
  },
  officer: {
    parts: { Head: 'adventurer', Body: 'swat', Legs: 'swat', Feet: 'swat' }, gun: 'smg', h: 2.05, rim: [0.38, 0.08, 0.03],
    tint: { Swat: '#363f4b', Swat_Black: '#1b1e22', Hair: '#2b2b2b' },
  },
  pow: {
    parts: { Head: 'beach', Body: 'beach', Legs: 'beach', Feet: 'beach' }, gun: null, h: 1.95, rim: [0.2, 0.3, 0.15],
    tint: { LightBrown: '#d6cfbc', Red_Dark: '#6c634f', White: '#8a826f' },
  },
};
const GUNS = { rifle: { len: 0.95 }, smg: { len: 0.62 } };

// ------------------------------------------------------------------ templates
const TPL = {};
const PART = /_(Head|Body|Legs|Feet)$/;

function partMeshes(file, part) {
  const out = [];
  GLB[file].scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    let n = o; while (n && !PART.test(n.name)) n = n.parent;
    if (n && n.name.endsWith('_' + part)) out.push(o);
  });
  return out;
}
function paint(g, color) {
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
}

// the weapon in grip space: grip at the origin, barrel along +Z, up +Y. The
// Toon Shooter AK lies along X with the muzzle at -X; points are fractions of
// its size measured from the muzzle end and the bottom of the magazine.
function gunGeometry(kind) {
  const g = flatGeo('props', 'ak47', { w: GUNS[kind].len }).clone();
  g.computeBoundingBox();
  const b = g.boundingBox, L = b.max.x - b.min.x, H = b.max.y - b.min.y;
  const P = (fx, fy) => new THREE.Vector3(b.min.x + fx * L, b.min.y + fy * H, 0);
  const grip = P(0.67, 0.5), hand = P(0.41, 0.74), muzzle = P(0, 0.78);
  const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(-grip.x, -grip.y, 0));
  g.applyMatrix4(m); hand.applyMatrix4(m); muzzle.applyMatrix4(m);
  return { geo: g, hand, muzzle };
}
// every bone's local transform, to put a rig back into its rest pose
const restOf = (root) => { const r = []; root.traverse((o) => { if (o.isBone) r.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); }); return r; };
const toRest = (rest) => { for (const [o, p, q, s] of rest) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); } };
const capture = (rest) => { for (const r of rest) { r[1].copy(r[0].position); r[2].copy(r[0].quaternion); r[3].copy(r[0].scale); } };

function template(kind) {
  if (TPL[kind]) return TPL[kind];
  const L = LOOKS[kind];
  const root = cloneSkinned(GLB.swat.scene);
  root.updateMatrixWorld(true);
  const baseMeshes = []; root.traverse((o) => { if (o.isSkinnedMesh) baseMeshes.push(o); });
  const main = baseMeshes[0], sk = main.skeleton;
  const idx = new Map(sk.bones.map((b, i) => [b.name, i]));
  const BMi = main.bindMatrix.clone().invert();
  const geos = [], box = new THREE.Box3(), tb = new THREE.Box3();
  const tint = (name, c) => (L.tint[name] ? new THREE.Color(L.tint[name]) : c.clone());
  for (const [part, file] of Object.entries(L.parts)) {
    for (const sm of partMeshes(file, part)) {
      const g = toFloat(sm.geometry);
      // bring it into the base rig's bind space (same rig, possibly other file)
      const s2 = sm.skeleton, j0 = s2.bones[0].name;
      const K = sk.boneInverses[idx.get(j0)].clone().invert().multiply(s2.boneInverses[0]).multiply(sm.bindMatrix);
      g.applyMatrix4(BMi.clone().multiply(K));
      const si = g.attributes.skinIndex;
      for (let i = 0; i < si.count; i++) for (let j = 0; j < 4; j++) si.setComponent(i, j, idx.get(s2.bones[si.getComponent(i, j)].name));
      paint(g, tint(sm.material.name, sm.material.color));
      geos.push(g);
      tb.setFromObject(sm); box.union(tb);
    }
  }
  // pose the rig in its aim, then fix the weapon to the right wrist so the
  // barrel points straight ahead and level
  let gun = null;
  const bones = {}; root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  if (L.gun) {
    const G = gunGeometry(L.gun), rest = restOf(root);
    const mixer = new THREE.AnimationMixer(root);
    const aim = GLB.swat.animations.find((a) => a.name === 'Idle_Gun_Pointing');
    mixer.clipAction(aim).play(); mixer.setTime(0);
    root.updateMatrixWorld(true);
    const wr = bones.WristR, fore = bones.LowerArmR;
    const pw = wr.getWorldPosition(new THREE.Vector3()), pf = fore.getWorldPosition(new THREE.Vector3());
    const armDir = pw.clone().sub(pf).normalize();
    const grip = pw.clone().addScaledVector(armDir, 0.07);        // palm, just past the wrist
    const fwd = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(up, fwd);
    const Gm = new THREE.Matrix4().makeBasis(right, up, fwd).setPosition(grip);
    const local = wr.matrixWorld.clone().invert().multiply(Gm);    // grip space → wrist space
    const j = idx.get('WristR');
    const g = G.geo.clone();
    g.applyMatrix4(BMi.clone().multiply(sk.boneInverses[j].clone().invert()).multiply(local));
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? j : 0)), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    geos.push(g);
    gun = { hand: G.hand.clone().applyMatrix4(local), muzzle: G.muzzle.clone().applyMatrix4(local), twoHand: L.gun === 'rifle' };
    mixer.stopAllAction(); mixer.uncacheRoot(root);
    toRest(rest); root.updateMatrixWorld(true);
  }
  // ankle markers on the shins (the rig's own bone tips were pruned in packing):
  // where each shin meets its foot in the rest pose, for the crouch IK
  for (const sd of ['L', 'R']) {
    const shin = bones['LowerLeg' + sd], tip = new THREE.Object3D();
    tip.name = 'Ankle' + sd;
    shin.add(tip);
    tip.position.copy(shin.worldToLocal(bones['Foot' + sd].getWorldPosition(new THREE.Vector3())));
  }
  const geo = mergeGeometries(geos, false);
  const parent = main.parent;
  for (const o of baseMeshes) o.removeFromParent();
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true }));
  mesh.name = 'body';
  mesh.position.copy(main.position); mesh.quaternion.copy(main.quaternion); mesh.scale.copy(main.scale);
  parent.add(mesh);
  mesh.bind(sk, main.bindMatrix);
  return (TPL[kind] = { root, clips: clipSet(), gun, scale: L.h / (box.max.y - box.min.y) });
}

// The rig's gun clips are pistol-style and Run_Shoot lowers the gun arm, so
// armed soldiers run on the Run clip's legs while their upper body holds the
// aim. Clips are split into leg and upper-body halves; each half blends on
// its own. group: 'full' | 'lower' | 'upper'
const LOWER = new Set(['Root', 'Body', 'Hips', 'UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR', 'FootL', 'FootR', 'PTL', 'PTR']);
let CLIPS = null;
function clipSet() {
  if (CLIPS) return CLIPS;
  const by = Object.fromEntries(GLB.swat.animations.map((c) => [c.name, c]));
  const half = (name, lower) => new THREE.AnimationClip(name + (lower ? ':legs' : ':upper'), by[name].duration,
    by[name].tracks.filter((t) => LOWER.has(t.name.split('.')[0]) === lower));
  CLIPS = {};
  // HitRecieve and Wave drive the build-v9 death catalogue (deaths.js)
  for (const n of ['Death', 'Punch_Right', 'Idle', 'Run', 'Walk', 'HitRecieve', 'Wave']) CLIPS[n] = { clip: by[n], group: 'full' };
  CLIPS.StandLegs = { clip: half('Idle_Gun_Pointing', true), group: 'lower' };
  CLIPS.RunLegs = { clip: half('Run', true), group: 'lower' };
  CLIPS.Aim = { clip: half('Idle_Gun_Pointing', false), group: 'upper' };
  CLIPS.Fire = { clip: half('Idle_Gun_Shoot', false), group: 'upper' };
  return CLIPS;
}

function makeMaterial(look) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02 });
  const u = m.userData;
  u.uRim = { value: new THREE.Color(...look.rim) };
  u.uFlash = { value: 0 };
  u.uChar = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = u.uRim; sh.uniforms.uFlash = u.uFlash; sh.uniforms.uChar = u.uChar;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uFlash; uniform float uChar;')
      .replace('#include <opaque_fragment>', `
        float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.2);
        outgoingLight += uRim * fres;
        // scorched by a blast: soot-black with a faint ember glow at the edges
        outgoingLight = mix(outgoingLight, vec3(0.045, 0.04, 0.035) + vec3(0.55, 0.16, 0.03) * fres, uChar);
        outgoingLight = mix(outgoingLight, vec3(1.0, 0.95, 0.85), uFlash);
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'soldier-rim';
  return m;
}

// ------------------------------------------------------------------ IK
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3();
const _d = new THREE.Vector3(), _bend = new THREE.Vector3(), _k = new THREE.Vector3(), _g = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qw = new THREE.Quaternion();
// rotate a bone (in world space) so its child direction `from` turns to `to`
function swing(bone, from, to) {
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  bone.parent.getWorldQuaternion(_qp);
  bone.getWorldQuaternion(_qw);
  _qw.premultiply(_q);
  bone.quaternion.copy(_qp.invert().multiply(_qw));
  bone.updateMatrixWorld(true);
}
// two-bone IK: upper → lower → end reaches `target`, bending toward `pole`
function solveIK(upper, lower, end, target, pole) {
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); end.getWorldPosition(_c);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  _t.copy(target).sub(_a);
  const d = Math.min(Math.max(_t.length(), Math.abs(l1 - l2) + 1e-4), (l1 + l2) * 0.999);
  _d.copy(_t).normalize();
  _bend.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  _k.copy(_a).addScaledVector(_d, cosA * l1).addScaledVector(_bend, sinA * l1);
  swing(upper, _b.clone().sub(_a), _k.clone().sub(_a));
  lower.getWorldPosition(_b); end.getWorldPosition(_c);
  _g.copy(_a).addScaledVector(_d, d);
  swing(lower, _c.clone().sub(_b), _g.clone().sub(_b));
}

// ------------------------------------------------------------------ soldier
const UP = new THREE.Vector3(0, 1, 0);
const _fw = new THREE.Vector3(), _lf = new THREE.Vector3(), _pole = new THREE.Vector3(), _tg = new THREE.Vector3();

export class Soldier {
  constructor(kind) {
    this.kind = kind;
    const look = this.look = LOOKS[kind];
    const T = this.T = template(kind);
    this.rig = cloneSkinned(T.root);
    this.mesh = this.rig.getObjectByName('body');
    this.mesh.material = makeMaterial(look);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.obj = new THREE.Group();
    this.inner = new THREE.Group();
    this.inner.scale.setScalar(T.scale);
    this.inner.add(this.rig);
    this.obj.add(this.inner);
    this.bones = {};
    // joints, plus the ankle markers the crouch IK measures to
    this.rig.traverse((o) => { if (o.isBone || o.name.startsWith('Ankle')) this.bones[o.name] = o; });
    this.rest = restOf(this.rig);
    // one action per clip; times and weights are set by hand every frame
    this.mixer = new THREE.AnimationMixer(this.rig);
    this.act = {};
    for (const [name, { clip }] of Object.entries(T.clips)) {
      const a = this.mixer.clipAction(clip);
      a.play(); a.setEffectiveWeight(0); a.paused = true;
      this.act[name] = { a, w: 0, dur: clip.duration };
    }
    this.fresh = true;
    this.a = { phase: 0, speed: 0, twist: 0, crouch: 0, aim: 1, recoil: 0, throwT: -1, dead: 0, deadDir: 1, deadSpin: 0, t: Math.random() * 10, wave: 0, hit: -1, dwave: -1 };
  }

  get material() { return this.mesh.material; }
  // free the per-soldier GPU objects (bone texture, material); the geometry is shared
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.obj.removeFromParent();
    this.mixer.stopAllAction();
    this.mesh.skeleton.dispose();
    this.mesh.material.dispose();
  }
  setFlash(v) { this.mesh.material.userData.uFlash.value = v; }
  setChar(v) { this.mesh.material.userData.uChar.value = v; }

  // world-space muzzle point (call after pose())
  muzzle(out) {
    const w = this.bones.WristR;
    return this.T.gun ? out.copy(this.T.gun.muzzle).applyMatrix4(w.matrixWorld) : w.getWorldPosition(out);
  }

  pose(dt) {
    const a = this.a, B = this.bones, gun = this.T.gun;
    a.t += dt;
    const s = clamp(a.speed, 0, 1);
    const c = a.dead > 0 ? 0 : a.sit ? 0.8 : clamp(a.crouch, 0, 1);
    const want = {}, time = {};
    const add = (k, w) => { if (w > 0 && this.act[k]) want[k] = (want[k] || 0) + w; };
    const throwing = a.throwT >= 0 && a.dead <= 0;
    // targets per bone set sum to 1: a 'full' clip, or legs + upper halves
    const f = ((a.phase / (Math.PI * 2)) % 1 + 1) % 1;
    if (a.dead > 0) {
      add('Death', 1); time.Death = Math.min(1, a.dead) * this.act.Death.dur * 0.98;
    } else if (a.hit >= 0) {
      add('HitRecieve', 1); time.HitRecieve = clamp(a.hit, 0, 1) * this.act.HitRecieve.dur * 0.98;
    } else if (a.dwave >= 0) {
      add('Wave', 1); time.Wave = clamp(a.dwave, 0, 1) * this.act.Wave.dur * 0.98;
    } else if (throwing) {
      add('Punch_Right', 1); time.Punch_Right = clamp(a.throwT / 0.8, 0, 1) * this.act.Punch_Right.dur * 0.9;
    } else {
      // stand / run by speed (crouched soldiers hold still); stride locked to distance
      const run = a.sit ? 0 : clamp(s / 0.4, 0, 1) * (1 - c);
      if (gun) {
        add('RunLegs', run); add('StandLegs', 1 - run);
        add(a.recoil > 0.05 ? 'Fire' : 'Aim', 1);
        time.RunLegs = f * this.act.RunLegs.dur;
      } else {
        add('Run', run); add('Idle', 1 - run);
        time.Run = f * this.act.Run.dur;
      }
    }
    // weights ease toward their targets (instant for death so it can't blend,
    // and on a soldier's first frame so it never shows the rest pose)
    const k = a.dead > 0 || this.fresh ? 1 : Math.min(1, dt * 14);
    this.fresh = false;
    for (const [name, st] of Object.entries(this.act)) {
      st.w += ((want[name] || 0) - st.w) * k;
      if (st.w < 0.002) st.w = 0;
      st.a.setEffectiveWeight(st.w);
      if (st.w <= 0) continue;
      st.a.time = time[name] !== undefined ? time[name] : (st.a.time + dt) % st.dur;
    }
    // IK, twist and crouch edit the pose after the clips; undo last frame's
    // edits first. (Restore the clips' own output, not the rest pose: the
    // mixer only rewrites a bone when its value changes, so a held pose such
    // as a finished death would otherwise snap back to rest.)
    toRest(this.rest);
    this.mixer.update(0);
    capture(this.rest);
    this.inner.rotation.set(0, a.dead > 0 ? a.deadSpin * 0.5 : 0, 0);
    this.inner.position.y = a.sit ? -0.3 : 0;
    this.obj.updateMatrixWorld(true);
    // character axes in the world (the model faces +Z, its left is +X)
    _fw.set(0, 0, 1).transformDirection(this.obj.matrixWorld);
    _lf.set(1, 0, 0).transformDirection(this.obj.matrixWorld);
    // crouch: drop the hips and bend the knees back down to the feet
    if (c > 0.01) {
      const body = B.Body;
      body.getWorldPosition(_tg); _tg.y -= c * 0.5;
      body.position.copy(body.parent.worldToLocal(_tg));
      body.updateMatrixWorld(true);
      for (const sd of ['L', 'R']) {
        _pole.copy(_fw).addScaledVector(_lf, sd === 'L' ? 0.25 : -0.25);
        B['Foot' + sd].getWorldPosition(_tg);
        solveIK(B['UpperLeg' + sd], B['LowerLeg' + sd], B['Ankle' + sd], _tg, _pole);
      }
    }
    // twist the torso toward the aim, on top of the clip
    if (a.dead <= 0 && Math.abs(a.twist) > 0.01) {
      for (const bn of ['Abdomen', 'Torso']) {
        const b = B[bn];
        b.parent.getWorldQuaternion(_qp);
        _q.setFromAxisAngle(UP, a.twist * 0.5);
        b.quaternion.premultiply(_qp.clone().invert().multiply(_q).multiply(_qp));
        b.updateMatrixWorld(true);
      }
    }
    // support hand on the rifle's handguard
    if (gun && gun.twoHand && a.dead <= 0 && !throwing) {
      _tg.copy(gun.hand).applyMatrix4(B.WristR.matrixWorld);
      _pole.copy(_lf).multiplyScalar(0.7).addScaledVector(UP, -1).addScaledVector(_fw, -0.3);
      solveIK(B.UpperArmL, B.LowerArmL, B.WristL, _tg, _pole);
    }
  }
}
