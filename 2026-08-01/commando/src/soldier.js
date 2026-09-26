// soldier.js — animated soldiers built from Quaternius' Ultimate Modular Men
// (CC0): one rig shared by every character, with swappable head / body / legs /
// feet. Each kind is baked once into a single skinned mesh with vertex colours,
// so a soldier is one draw call. The game drives the same parameters it always
// has (speed, stride phase, crouch, throw, death, aim twist); here they pick and
// blend the rig's clips, and procedural layers add what the clips don't have.
//
// Build v10 ("they're too stiff"):
//  - the rifle lives on its own Gun bone, shouldered: stock in the right
//    shoulder pocket, barrel down the aim line, both hands IK'd onto it (grip
//    and handguard), torso bladed like a real rifleman. Recoil kicks the stock
//    back and the muzzle up through the arms and spine; running drops it to a
//    low ready.
//  - secondary motion: lean into the run and into turns, breathing and weight
//    shift at rest, the head tracks threats, the legs step round when turning
//    on the spot, and the feet find the ground on slopes.
//  - hit flinches, an overhand grenade throw, a mortar feed, and — when a
//    soldier dies — a Verlet ragdoll (ragdoll.js) that takes over the bones.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLB, toFloat, flatGeo } from './assets.js';
import { clamp, angDiff } from './util.js';
import { Ragdoll } from './ragdoll.js';

// parts: which character file each body part comes from; tint: material name →
// colour (the weapon keeps its own colours); gun: 'rifle' or 'smg' (both held
// two-handed), or null
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
  // mortar crew: rifleman's uniform, hands free for the shells
  crew: {
    parts: { Head: 'swat', Body: 'swat', Legs: 'swat', Feet: 'swat' }, gun: null, h: 2.0, rim: [0.34, 0.07, 0.03],
    tint: { Swat: '#566a82', Swat_Black: '#262a31', Visor: '#1a1d22' },
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
// the rig's arms are short for its height, so the rifle is carbine-length
const GUNS = { rifle: { len: 0.8 }, smg: { len: 0.6 } };

// procedural tuning (world units / radians); exported so tests can tweak it live
export const RIG = {
  blade: -0.36,            // torso turned so the support shoulder leads
  pocket: [0.06, -0.04, 0.1], // stock vs the right shoulder joint: inward, down, forward
  lowReady: 0.3,           // muzzle drop running without firing
  idleReady: 0.1,          // ...and standing
  kick: 0.07, rise: 0.16,  // recoil: stock back, muzzle up
  spineKick: 0.1,          // recoil rocks the shoulders back
  runLean: 0.26, accelLean: 0.045, turnLean: 0.07,
  breathe: 0.025, sway: 0.028,
  lookMax: 0.9,
};

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

// the weapon in grip space: pistol grip at the origin, barrel along +Z, up +Y.
// The Toon Shooter AK lies along X with the muzzle at -X; points are fractions
// of its size measured from the muzzle end and the bottom of the magazine.
function gunGeometry(kind) {
  const g = flatGeo('props', 'ak47', { w: GUNS[kind].len }).clone();
  g.computeBoundingBox();
  const b = g.boundingBox, L = b.max.x - b.min.x, H = b.max.y - b.min.y, zc = (b.min.z + b.max.z) / 2;
  const P = (fx, fy) => new THREE.Vector3(b.min.x + fx * L, b.min.y + fy * H, zc);
  const grip = P(0.67, 0.5), hand = P(0.35, 0.64), muzzle = P(0, 0.78), butt = P(0.99, 0.66);
  const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z));
  g.applyMatrix4(m); hand.applyMatrix4(m); muzzle.applyMatrix4(m); butt.applyMatrix4(m);
  return { geo: g, hand, muzzle, butt };
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
  const bones = {}; root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  // the weapon gets a bone of its own, a child of the rig root, whose world
  // transform pose() sets every frame (shouldered, carried, or in the hand)
  let gun = null, skel = sk;
  if (L.gun) {
    const G = gunGeometry(L.gun);
    const gb = new THREE.Bone(); gb.name = 'Gun'; root.add(gb);
    const j = sk.bones.length;
    const g = G.geo.clone();
    g.applyMatrix4(BMi);               // boneInverse = identity: vertices live in the Gun bone's space
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? j : 0)), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    geos.push(g);
    gun = { hand: G.hand, muzzle: G.muzzle, butt: G.butt };
    skel = new THREE.Skeleton([...sk.bones, gb], [...sk.boneInverses, new THREE.Matrix4()]);
  }
  // ankle markers on the shins (the rig's own bone tips were pruned in packing):
  // where each shin meets its foot in the rest pose, for the leg IK
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
  mesh.bind(skel, main.bindMatrix);
  return (TPL[kind] = { root, clips: clipSet(), gun, scale: L.h / (box.max.y - box.min.y) });
}

// Clips are split by bone group so each group blends on its own: legs,
// upper body (spine, arms, head) and fingers. Armed soldiers take their legs
// and spine from the clips, their fingers from a fixed grip, and their arms
// from IK onto the rifle. group: 'full' | 'lower' | 'upper' | 'hands'
const LOWER = new Set(['Root', 'Body', 'Hips', 'UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR', 'FootL', 'FootR', 'PTL', 'PTR']);
const FINGER = /^(Index|Middle|Ring|Pinky|Thumb)\d[LR]$/;
let CLIPS = null, STANCE = {};
function stancePhase(clip) {
  const root = cloneSkinned(GLB.swat.scene), mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  let foot = null; root.traverse((o) => { if (o.name === 'FootL') foot = o; });
  const N = 48, ys = [], v = new THREE.Vector3();
  for (let i = 0; i < N; i++) { mixer.setTime(clip.duration * i / N); root.updateMatrixWorld(true); ys.push(foot.getWorldPosition(v).y); }
  const lo = Math.min(...ys), hi = Math.max(...ys);
  // circular mean of the phases where the foot is down
  let cx = 0, cy = 0;
  ys.forEach((y, i) => { if (y < lo + (hi - lo) * 0.12) { cx += Math.cos(i / N * Math.PI * 2); cy += Math.sin(i / N * Math.PI * 2); } });
  mixer.uncacheRoot(root);
  return ((Math.atan2(cy, cx) / (Math.PI * 2)) % 1 + 1) % 1;
}
function clipSet() {
  if (CLIPS) return CLIPS;
  const by = Object.fromEntries(GLB.swat.animations.map((c) => [c.name, c]));
  const bone = (t) => t.name.split('.')[0];
  const part = (name, tag, pick) => new THREE.AnimationClip(name + ':' + tag, by[name].duration, by[name].tracks.filter((t) => pick(bone(t))));
  const legs = (b) => LOWER.has(b), upper = (b) => !LOWER.has(b) && !FINGER.test(b);
  CLIPS = {};
  // HitRecieve and Wave drive the scripted parts of some deaths (deaths.js)
  for (const n of ['Death', 'Idle', 'Run', 'Walk', 'HitRecieve', 'Wave']) CLIPS[n] = { clip: by[n], group: 'full' };
  CLIPS.StandLegs = { clip: part('Idle_Gun_Pointing', 'legs', legs), group: 'lower' };
  CLIPS.RunLegs = { clip: part('Run', 'legs', legs), group: 'lower' };
  CLIPS.WalkLegs = { clip: part('Walk', 'legs', legs), group: 'lower' };
  CLIPS.IdleUp = { clip: part('Idle', 'upper', upper), group: 'upper' };
  CLIPS.RunUp = { clip: part('Run', 'upper', upper), group: 'upper' };
  // v10 extra clips (assets/anims/swat-extra.json): strafing and back-pedalling
  // runs, a relaxed rifle stance, a second hit reaction, a dive roll
  for (const n of ['HitRecieve_2', 'Roll']) if (by[n]) CLIPS[n] = { clip: by[n], group: 'full' };
  if (by.Idle_Gun) CLIPS.RestLegs = { clip: part('Idle_Gun', 'legs', legs), group: 'lower' };
  for (const k of ['Back', 'Left', 'Right']) if (by['Run_' + k]) {
    CLIPS[`Run${k}Legs`] = { clip: part('Run_' + k, 'legs', legs), group: 'lower' };
    CLIPS[`Run${k}Up`] = { clip: part('Run_' + k, 'upper', upper), group: 'upper' };
  }
  // where each run's left foot is mid-stance, so the directions blend in step
  STANCE = {};
  for (const n of ['Run', 'Run_Back', 'Run_Left', 'Run_Right']) if (by[n]) STANCE[n] = stancePhase(by[n]);
  // closed hands: the pistol grip for the right, a fist for the left
  const grip = [...by.Idle_Gun_Pointing.tracks.filter((t) => FINGER.test(bone(t)) && bone(t).endsWith('R')),
    ...by.Punch_Right.tracks.filter((t) => FINGER.test(bone(t)) && bone(t).endsWith('L'))];
  CLIPS.Grip = { clip: new THREE.AnimationClip('Grip', 0.01, grip), group: 'hands' };
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
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qi = new THREE.Quaternion();
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
  swing(upper, _v1.subVectors(_b, _a), _v2.subVectors(_k, _a));
  lower.getWorldPosition(_b); end.getWorldPosition(_c);
  _g.copy(_a).addScaledVector(_d, d);
  swing(lower, _v1.subVectors(_c, _b), _v2.subVectors(_g, _b));
}
// premultiply a world-space rotation onto a bone's local rotation
function rotWorld(bone, q) {
  bone.parent.getWorldQuaternion(_qp);
  _qi.copy(_qp).invert().multiply(q).multiply(_qp);
  bone.quaternion.premultiply(_qi);
  bone.updateMatrixWorld(true);
}
// give a bone an absolute world rotation
function setWorldQ(bone, q) {
  bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(q));
  bone.updateMatrixWorld(true);
}
// smooth curve through [t, Vector3] keys (Catmull-Rom, clamped ends)
function spline(keys, u, out) {
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [t0, p1] = keys[i], [t1, p2] = keys[i + 1];
  const p0 = (keys[i - 1] || keys[i])[1], p3 = (keys[i + 2] || keys[i + 1])[1];
  const s = clamp((u - t0) / (t1 - t0 || 1), 0, 1), s2 = s * s, s3 = s2 * s;
  for (const k of ['x', 'y', 'z']) {
    out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * s + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * s2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * s3);
  }
  return out;
}
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ soldier
const UP = new THREE.Vector3(0, 1, 0);
const _fw = new THREE.Vector3(), _lf = new THREE.Vector3(), _pole = new THREE.Vector3(), _tg = new THREE.Vector3();
const _shL = new THREE.Vector3(), _shR = new THREE.Vector3(), _lat = new THREE.Vector3(), _cf = new THREE.Vector3();
const _A = new THREE.Vector3(), _gp = new THREE.Vector3(), _gq = new THREE.Quaternion(), _gq2 = new THREE.Quaternion(), _gp2 = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _tR = new THREE.Vector3(), _tL = new THREE.Vector3(), _hand = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const _kp = [0, 1, 2, 3, 4].map(() => new THREE.Vector3());
const AX = new THREE.Vector3(1, 0, 0);

// how each hand sits on the weapon, in the weapon's own frame (barrel +Z, up
// +Y, its left +X). The rig's hands: +Y runs along the fingers, the palm faces
// -Z, the thumb is -X on the right hand and +X on the left.
function handQ(fingers, palmNormal) {
  const y = fingers.clone().normalize(), z = palmNormal.clone().negate().normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  z.crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
// right hand: fingers down the pistol grip, palm against its right side
const HAND_R = { q: handQ(new THREE.Vector3(0, -0.85, 0.3), new THREE.Vector3(1, 0, 0)), back: -0.06, out: 0.035 };
// left hand: under the handguard, palm up, fingers wrapping round to the right
const HAND_L = { q: handQ(new THREE.Vector3(-0.8, 0, 0.45), new THREE.Vector3(0, 1, 0)), back: -0.06, out: 0.035 };
const NADE_GEO = new THREE.SphereGeometry(0.075, 8, 6).scale(1, 1.25, 1);
const NADE_MAT = new THREE.MeshStandardMaterial({ color: 0x3b4a2a, roughness: 0.6 });

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
    // joints, the ankle markers the leg IK measures to, and the Gun bone
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
    this.seed = Math.random() * 100;
    this.a = {
      phase: 0, speed: 0, twist: 0, crouch: 0, aim: 1, recoil: 0, throwT: -1, dead: 0, deadDir: 1, deadSpin: 0, t: Math.random() * 10, wave: 0, hit: -1, dwave: -1,
      // v10: flinch (seconds since hit, strength, world push direction), look target, mortar feed, readiness
      flinchT: 9, flinchAmp: 0, flinchX: 0, flinchZ: 1, lookX: null, lookZ: 0, feedT: -1, feedX: 0, feedZ: 0, aiming: false, foot: true, dying: false, release: 0.57,
      moveYaw: null, roll: -1, hitAlt: false,
    };
    // procedural state
    this.legYaw = null; this.turning = false; this.turnW = 0; this.turnPhase = 0;
    this.roll = 0; this.lean = 0; this.prevS = 0; this.accel = 0; this.headYaw = 0; this.ready = 1; this.readyT = 0;
    this.ground = null;             // (x, z) → ground y; set by the game for foot IK
    this.rag = null;
    if (kind !== 'pow') this.addNade();
  }

  addNade() {
    this.nade = new THREE.Mesh(NADE_GEO, NADE_MAT);
    this.nade.visible = false; this.nade.castShadow = true;
    this.obj.add(this.nade);
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
    const g = this.bones.Gun;
    return this.T.gun ? out.copy(this.T.gun.muzzle).applyMatrix4(g.matrixWorld) : this.bones.WristR.getWorldPosition(out);
  }
  // hit reaction: dir is the world XZ direction the blow pushes him
  flinch(dx, dz, amp = 1) {
    const L = Math.hypot(dx, dz) || 1;
    const a = this.a;
    a.flinchAmp = Math.max(amp, a.flinchT < 0.3 ? a.flinchAmp : 0); a.flinchT = 0; a.flinchX = dx / L; a.flinchZ = dz / L;
  }

  // ---------------------------------------------------------------- ragdoll
  startRagdoll(env, o = {}) {
    if (this.rag) return this.rag;
    if (this.nade) this.nade.visible = false;
    this.rag = new Ragdoll(this, env, o);
    return this.rag;
  }
  stopRagdoll() {
    if (!this.rag) return;
    this.rag = null;
    this.fresh = true; this.legYaw = null;
  }

  // ---------------------------------------------------------------- per frame
  pose(dt) {
    if (this.rag) { this.rag.step(dt); this.rag.apply(); return; }
    const a = this.a, B = this.bones, gun = this.T.gun;
    a.t += dt;
    const s = clamp(a.speed, 0, 1);
    const dying = a.dead > 0 || a.hit >= 0 || a.dwave >= 0 || a.dying;
    const acting = dying || a.roll >= 0;          // a full-body clip has him
    const c = a.dead > 0 ? 0 : a.sit ? 0.8 : clamp(a.crouch, 0, 1);
    const throwing = a.throwT >= 0 && !acting;
    if (a.feedT >= 0) { a.feedT += dt / 0.75; if (a.feedT >= 1) a.feedT = -1; }
    const feeding = a.feedT >= 0 && !acting;
    const f = ((a.phase / (Math.PI * 2)) % 1 + 1) % 1;
    const run = acting || a.sit ? 0 : clamp(s / 0.4, 0, 1) * (1 - c);

    // --- where the legs point: they lag the body and step round on the spot
    const yaw = this.obj.rotation.y;
    let legOff = 0;
    if (acting || a.sit || this.legYaw === null || this.fresh) { this.legYaw = yaw; this.turning = false; }
    else {
      const d = angDiff(this.legYaw, yaw);
      if (s > 0.15) { this.legYaw += d * Math.min(1, dt * 12); this.turning = false; }
      else {
        if (!this.turning && Math.abs(d) > 0.75) this.turning = true;
        if (this.turning) {
          const st = 6.5 * dt;
          this.legYaw += clamp(d, -st, st);
          this.turnPhase += Math.min(Math.abs(d), st) * 0.55;
          if (Math.abs(angDiff(this.legYaw, yaw)) < 0.04) this.turning = false;
        }
      }
      legOff = angDiff(yaw, this.legYaw);
    }
    this.turnW += ((this.turning ? 1 : 0) - this.turnW) * Math.min(1, dt * 10);
    // turn-lean and run-lean from the legs' own motion
    const omega = acting ? 0 : angDiff(this.prevLeg ?? this.legYaw, this.legYaw) / Math.max(dt, 1e-3);
    this.prevLeg = this.legYaw;
    // which way he's running relative to where his legs face (+ = his left)
    const strafe = a.moveYaw !== null && run > 0.01 ? angDiff(this.legYaw, a.moveYaw) : 0;
    this.roll += (clamp(-omega * s * RIG.turnLean - Math.sin(strafe) * 0.09 * run, -0.28, 0.28) - this.roll) * Math.min(1, dt * 8);
    this.accel += (clamp((s - this.prevS) / Math.max(dt, 1e-3), -6, 6) - this.accel) * Math.min(1, dt * 6);
    this.prevS = s;

    // --- clips
    const want = {}, time = {};
    const add = (k, w) => { if (w > 0 && this.act[k]) want[k] = (want[k] || 0) + w; };
    if (a.dead > 0) {
      add('Death', 1); time.Death = Math.min(1, a.dead) * this.act.Death.dur * 0.98;
    } else if (a.hit >= 0) {
      const h = a.hitAlt && this.act.HitRecieve_2 ? 'HitRecieve_2' : 'HitRecieve';
      add(h, 1); time[h] = clamp(a.hit, 0, 1) * this.act[h].dur * 0.98;
    } else if (a.roll >= 0 && this.act.Roll) {
      add('Roll', 1); time.Roll = clamp(a.roll, 0, 1) * this.act.Roll.dur * 0.98;
    } else if (a.dwave >= 0) {
      add('Wave', 1); time.Wave = clamp(a.dwave, 0, 1) * this.act.Wave.dur * 0.98;
    } else {
      // stand / run by speed (crouched soldiers hold still); stride locked to distance
      const step = this.turnW * (1 - run) * (1 - c);
      const wf = (this.turnPhase % 1 + 1) % 1;
      if (gun) {
        // running in any direction while facing the aim: forward, back-pedal
        // and side-step clips, blended by the angle and kept in step
        let wF = 1, wB = 0, wL = 0, wR = 0;
        if (this.act.RunBackLegs && strafe) {
          const cf = Math.cos(strafe), sn = Math.sin(strafe);
          wF = Math.max(0, cf); wB = Math.max(0, -cf); wL = Math.max(0, sn); wR = Math.max(0, -sn);
          const sum = wF + wB + wL + wR; wF /= sum; wB /= sum; wL /= sum; wR /= sum;
        }
        for (const [k, w, n] of [['', wF, 'Run'], ['Back', wB, 'Run_Back'], ['Left', wL, 'Run_Left'], ['Right', wR, 'Run_Right']]) {
          if (w <= 0) continue;
          add(`Run${k}Legs`, run * w); add(`Run${k}Up`, run * w * 0.5);
          const ph = (f + (STANCE[n] || 0)) % 1;
          time[`Run${k}Legs`] = ph * this.act[`Run${k}Legs`].dur; time[`Run${k}Up`] = ph * this.act[`Run${k}Up`].dur;
        }
        add('WalkLegs', step);
        // at rest: the braced pistol stance when ready, the easy one when not
        const stand = Math.max(0, 1 - run - step), rl = this.act.RestLegs ? 1 - this.ready : 0;
        add('StandLegs', stand * (1 - rl)); add('RestLegs', stand * rl);
        add('IdleUp', 1 - run);
        add('Grip', 1);
        time.WalkLegs = wf * this.act.WalkLegs.dur; time.Grip = 0;
      } else {
        add('Run', run); add('Walk', step); add('Idle', Math.max(0, 1 - run - step));
        time.Run = f * this.act.Run.dur; time.Walk = wf * this.act.Walk.dur;
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
    // the procedural layers edit the pose after the clips; undo last frame's
    // edits first. (Restore the clips' own output, not the rest pose: the
    // mixer only rewrites a bone when its value changes, so a held pose such
    // as a finished death would otherwise snap back to rest.)
    toRest(this.rest);
    this.mixer.update(0);
    capture(this.rest);
    this.inner.rotation.set(0, a.dead > 0 ? a.deadSpin * 0.5 : 0, acting ? 0 : this.roll);
    this.inner.position.y = a.sit ? -0.3 : 0;
    this.obj.updateMatrixWorld(true);
    // character axes in the world (the model faces +Z, its left is +X)
    _fw.set(0, 0, 1).transformDirection(this.obj.matrixWorld);
    _lf.set(1, 0, 0).transformDirection(this.obj.matrixWorld);

    // --- legs turned to where they're really pointing
    if (Math.abs(legOff) > 1e-3) rotWorld(B.Root, _qa.setFromAxisAngle(UP, legOff));

    // --- flinch curve: a sharp jolt, then easing off
    a.flinchT += dt;
    const fl = acting ? 0 : a.flinchAmp * (a.flinchT < 0.05 ? a.flinchT / 0.05 : Math.exp(-(a.flinchT - 0.05) * 6.5)) * (a.flinchT < 1 ? 1 : 0);
    const idleW = acting ? 0 : (1 - run) * (1 - c) * (1 - this.turnW);

    // --- hips: crouch, flinch dip, weight shift, and feet on the slope
    let drop = c * 0.5 + fl * 0.13, side = Math.sin(a.t * 0.5 + this.seed) * RIG.sway * idleW;
    const footIK = !acting && a.foot && this.ground && !a.sit;
    const dy = [0, 0];
    if (footIK) {
      const y0 = this.obj.position.y;
      ['L', 'R'].forEach((sd, i) => {
        B['Foot' + sd].getWorldPosition(_tg);
        dy[i] = clamp(this.ground(_tg.x, _tg.z) - y0, -0.35, 0.35);
      });
      drop += Math.max(0, -Math.min(dy[0], dy[1])) * 0.9;
    }
    if (drop > 0.002 || Math.abs(side) > 0.002 || dy[0] || dy[1]) {
      const body = B.Body;
      body.getWorldPosition(_tg); _tg.y -= drop; _tg.addScaledVector(_lf, side);
      body.position.copy(body.parent.worldToLocal(_tg));
      body.updateMatrixWorld(true);
      ['L', 'R'].forEach((sd, i) => {
        const foot = B['Foot' + sd];
        if (dy[i]) { foot.getWorldPosition(_tg); _tg.y += dy[i]; foot.position.copy(foot.parent.worldToLocal(_tg)); foot.updateMatrixWorld(true); }
        // keep the knee bending the way the clip bent it
        B['LowerLeg' + sd].getWorldPosition(_pole); B['UpperLeg' + sd].getWorldPosition(_a);
        _pole.sub(_a).addScaledVector(_fw, 0.05);
        foot.getWorldPosition(_tg);
        solveIK(B['UpperLeg' + sd], B['LowerLeg' + sd], B['Ankle' + sd], _tg, _pole);
      });
    }

    // --- spine: aim twist, rifleman's blade, lean, breathing, recoil, flinch
    const holding = gun && !acting;
    let tu = 0, tl = 0;                                   // throw yaw / pitch
    if (throwing) {
      const u = a.throwT;
      tu = u < 0.35 ? -0.5 * sstep(0, 0.35, u) : u < 0.6 ? -0.5 + 0.95 * sstep(0.35, 0.6, u) : 0.45 * (1 - sstep(0.6, 1, u));
      tl = u < 0.35 ? -0.12 * sstep(0, 0.35, u) : u < 0.62 ? -0.12 + 0.4 * sstep(0.35, 0.62, u) : 0.28 * (1 - sstep(0.62, 1, u));
    }
    if (!acting) {
      const thw = throwing ? 1 - sstep(0.05, 0.2, a.throwT) * (1 - sstep(0.8, 1, a.throwT)) : 1;
      let sYaw = a.twist - legOff + (holding ? RIG.blade * thw : 0) + tu;
      if (holding) {
        // armed men keep the chest square to the aim whatever the legs' clip
        // does (the side-step runs turn the hips 90° and the torso back)
        this.shoulders();
        const chest = Math.atan2(_cf.x, _cf.z);
        sYaw = angDiff(chest, yaw + a.twist + RIG.blade * thw + tu);
      }
      const breath = Math.sin(a.t * 1.7 + this.seed) * RIG.breathe * (0.4 + 0.6 * idleW);
      const sPitch = RIG.runLean * run * Math.max(-0.35, Math.cos(strafe)) + clamp(this.accel * RIG.accelLean, -0.14, 0.14) + breath
        - a.recoil * RIG.spineKick + tl + (feeding ? 0.35 * this.feedW(a.feedT) : 0);
      const lat = _v1.copy(_lf).applyAxisAngle(UP, legOff);
      const W = [['Abdomen', 0.3], ['Torso', 0.35], ['Chest', 0.35]];
      // flinch: bend away along the push
      const fAxis = _v2.set(a.flinchZ, 0, -a.flinchX);   // UP × push
      for (const [bn, w] of W) {
        _qa.setFromAxisAngle(UP, sYaw * w);
        _qb.setFromAxisAngle(lat, sPitch * w);
        _qa.multiply(_qb);
        if (fl > 0.01) _qa.premultiply(_qc.setFromAxisAngle(fAxis, fl * 0.6 * w));
        rotWorld(B[bn], _qa);
      }
      // --- the head: toward a threat, or back down the aim line
      const aimYaw = yaw + a.twist;
      let rel = 0;
      B.Head.getWorldPosition(_tg);
      if (a.lookX !== null) rel = clamp(angDiff(aimYaw, Math.atan2(a.lookX - _tg.x, a.lookZ - _tg.z)), -RIG.lookMax, RIG.lookMax);
      const upYaw = aimYaw + (holding ? RIG.blade * thw : 0) + tu;
      rel += angDiff(upYaw, aimYaw) * 0.8;               // eyes down the barrel, not the blade
      this.headYaw += (rel - this.headYaw) * Math.min(1, dt * 7);
      rotWorld(B.Neck, _qa.setFromAxisAngle(UP, this.headYaw * 0.4));
      _qa.setFromAxisAngle(UP, this.headYaw * 0.6);
      if (fl > 0.01) _qa.premultiply(_qc.setFromAxisAngle(fAxis, fl * 0.4));
      rotWorld(B.Head, _qa);
    }

    // --- arms
    if (this.nade) this.nade.visible = false;
    if (holding) this.poseRifle(dt, run, throwing, feeding, yaw);
    else if (gun) this.gunInHand();
    if (!gun && !acting && (throwing || feeding)) this.poseEmptyHands(throwing, feeding);
  }

  feedW(u) { return u < 0 ? 0 : u < 0.35 ? 1 : 1 - sstep(0.35, 1, u); }

  // right-shoulder frame after the spine is posed
  shoulders() {
    const B = this.bones;
    B.UpperArmR.getWorldPosition(_shR); B.UpperArmL.getWorldPosition(_shL);
    _lat.subVectors(_shL, _shR).normalize();
    _cf.crossVectors(_lat, UP).normalize();
    if (!this.reach) {
      const len = (sd) => B['UpperArm' + sd].getWorldPosition(_a).distanceTo(B['LowerArm' + sd].getWorldPosition(_b)) + _b.distanceTo(B['Wrist' + sd].getWorldPosition(_c));
      this.reach = { L: len('L'), R: len('R') };
    }
  }
  // world target for a wrist holding the weapon at gun transform (gp, gq)
  handTarget(H, anchor, gp, gq, out) {
    const sc = this.T.scale;
    out.copy(anchor).multiplyScalar(sc).applyQuaternion(gq).add(gp);
    // off the anchor: back along the fingers, out along the back of the hand
    _hand.set(0, H.back, 0).applyQuaternion(H.q).applyQuaternion(gq);
    out.add(_hand);
    _hand.set(0, 0, H.out).applyQuaternion(H.q).applyQuaternion(gq);
    return out.add(_hand);
  }
  setGun(gp, gq) {
    const g = this.bones.Gun, r = this.rig;
    r.updateWorldMatrix(true, false);
    g.position.copy(r.worldToLocal(_gp2.copy(gp)));
    r.getWorldQuaternion(_qp);
    g.quaternion.copy(_qp.invert().multiply(gq));
    g.scale.set(1, 1, 1);
    g.updateMatrixWorld(true);
  }

  poseRifle(dt, run, throwing, feeding, yaw) {
    const a = this.a, B = this.bones, G = this.T.gun, sc = this.T.scale;
    this.shoulders();
    // readiness: up and level while firing or aiming, a low ready on the move
    if (a.recoil > 0.05) this.readyT = 0.9; else this.readyT -= dt;
    this.ready += (((this.readyT > 0 || a.aiming) ? 1 : 0) - this.ready) * Math.min(1, dt * 7);
    const drop = (1 - this.ready) * (RIG.idleReady + (RIG.lowReady - RIG.idleReady) * run);
    const pitch = -drop + a.recoil * RIG.rise;           // + muzzle up
    const aimYaw = yaw + a.twist;
    _qa.setFromAxisAngle(UP, aimYaw); _qb.setFromAxisAngle(AX, -pitch);
    _gq.copy(_qa).multiply(_qb);
    _A.set(0, 0, 1).applyQuaternion(_gq);
    // stock in the shoulder pocket
    _tg.copy(_shR).addScaledVector(_lat, RIG.pocket[0]).addScaledVector(UP, RIG.pocket[1]).addScaledVector(_cf, RIG.pocket[2]);
    _gp.copy(G.butt).multiplyScalar(sc).applyQuaternion(_gq);
    _gp.subVectors(_tg, _gp).addScaledVector(_A, -RIG.kick * a.recoil);
    // short arms: slide the weapon back until both hands can reach it
    for (let it = 0; it < 3; it++) {
      const dl = this.handTarget(HAND_L, G.hand, _gp, _gq, _tL).distanceTo(_shL) - this.reach.L * 0.96;
      const dr = this.handTarget(HAND_R, _c.set(0, 0, 0), _gp, _gq, _tR).distanceTo(_shR) - this.reach.R * 0.96;
      const over = Math.max(dl, dr);
      if (over <= 0) break;
      _gp.addScaledVector(_A, -over * 1.1);
    }
    // carrying it in the support hand while the right arm throws or feeds
    const u = throwing ? a.throwT : feeding ? a.feedT : -1;
    const cw = throwing ? sstep(0, 0.14, u) * (1 - sstep(0.84, 1, u)) : feeding ? this.feedW(u) : 0;
    if (cw > 0) {
      _qa.setFromAxisAngle(UP, aimYaw - 0.3); _qb.setFromAxisAngle(AX, 0.8);
      _gq2.copy(_qa).multiply(_qb);
      _tg.copy(_shL).addScaledVector(_cf, 0.2).addScaledVector(UP, -0.36).addScaledVector(_lat, -0.02);
      this.handTarget(HAND_L, G.hand, _gp2.set(0, 0, 0), _gq2, _v1);
      _gp2.subVectors(_tg, _v1);
      _gp.lerp(_gp2, cw); _gq.slerp(_gq2, cw);
    }
    this.setGun(_gp, _gq);
    // support hand on the handguard
    this.handTarget(HAND_L, G.hand, _gp, _gq, _tL);
    _pole.copy(UP).multiplyScalar(-1).addScaledVector(_lat, 0.55).addScaledVector(_cf, -0.15);
    solveIK(B.UpperArmL, B.LowerArmL, B.WristL, _tL, _pole);
    setWorldQ(B.WristL, _qc.copy(_gq).multiply(HAND_L.q));
    // firing hand on the grip — or throwing
    this.handTarget(HAND_R, _c.set(0, 0, 0), _gp, _gq, _tR);
    if (throwing || feeding) this.throwArm(u, throwing, _tR);
    else {
      _pole.copy(UP).multiplyScalar(-1).addScaledVector(_lat, -0.8).addScaledVector(_cf, -0.2);
      solveIK(B.UpperArmR, B.LowerArmR, B.WristR, _tR, _pole);
      setWorldQ(B.WristR, _qc.copy(_gq).multiply(HAND_R.q));
    }
  }

  // the throwing arm: wind up behind the head, whip over the shoulder, follow
  // through across the body. home: where the hand starts and ends.
  throwArm(u, throwing, home) {
    const B = this.bones, a = this.a;
    const K = _kp;
    if (throwing) {
      K[0].copy(home);
      K[1].copy(_shR).addScaledVector(UP, 0.34).addScaledVector(_cf, -0.22).addScaledVector(_lat, -0.1);
      K[2].copy(_shR).addScaledVector(UP, 0.36).addScaledVector(_cf, 0.28).addScaledVector(_lat, 0.03);
      K[3].copy(_shR).addScaledVector(UP, -0.2).addScaledVector(_cf, 0.3).addScaledVector(_lat, 0.24);
      K[4].copy(home);
      spline([[0, K[0]], [0.32, K[1]], [0.55, K[2]], [0.74, K[3]], [1, K[4]]], u, _tg);
      const up = u < 0.6 ? 0.35 : -0.9;
      _pole.copy(_lat).multiplyScalar(-1).addScaledVector(UP, up).addScaledVector(_cf, u < 0.45 ? -0.35 : 0.1);
    } else {
      // mortar feed: both hands down to the tube mouth
      const w = this.feedW(u);
      _tg.set(a.feedX, this.obj.position.y + 0.95, a.feedZ).addScaledVector(_lat, -0.07);
      _tg.lerp(home, 1 - w);
      _pole.copy(_lat).multiplyScalar(-0.8).addScaledVector(UP, -0.6);
    }
    solveIK(B.UpperArmR, B.LowerArmR, B.WristR, _tg, _pole);
    // the grenade rides in the palm until it's released
    if (throwing && this.nade && u < a.release) {
      B.WristR.getWorldPosition(_v1);
      B.WristR.getWorldQuaternion(_qa);
      _v1.addScaledVector(_v2.set(0, 1, 0).applyQuaternion(_qa), 0.08);
      this.nade.position.copy(this.obj.worldToLocal(_v1));
      this.nade.visible = true;
    }
  }

  // lobbers and the mortar crew: nothing in the hands but what they throw
  poseEmptyHands(throwing, feeding) {
    const a = this.a, B = this.bones;
    this.shoulders();
    const u = throwing ? a.throwT : a.feedT;
    B.WristR.getWorldPosition(_tR);
    if (throwing) this.throwArm(u, true, _tR);
    else this.throwArm(u, false, _tR);
    // the free arm: points at the target while winding up, then tucks in
    B.WristL.getWorldPosition(_tL);
    if (throwing) {
      _kp[0].copy(_tL);
      _kp[1].copy(_shL).addScaledVector(_cf, 0.4).addScaledVector(UP, 0.02).addScaledVector(_lat, 0.02);
      _kp[2].copy(_shL).addScaledVector(_cf, 0.22).addScaledVector(UP, -0.18).addScaledVector(_lat, 0.1);
      _kp[3].copy(_shL).addScaledVector(_cf, 0.02).addScaledVector(UP, -0.38).addScaledVector(_lat, 0.12);
      _kp[4].copy(_tL);
      spline([[0, _kp[0]], [0.3, _kp[1]], [0.55, _kp[2]], [0.8, _kp[3]], [1, _kp[4]]], u, _tg);
    } else {
      _tg.set(a.feedX, this.obj.position.y + 0.95, a.feedZ).addScaledVector(_lat, 0.07).lerp(_tL, 1 - this.feedW(u));
    }
    _pole.copy(UP).multiplyScalar(-1).addScaledVector(_lat, 0.7);
    solveIK(B.UpperArmL, B.LowerArmL, B.WristL, _tg, _pole);
  }

  // scripted deaths: the weapon stays in the right hand, wherever it goes
  gunInHand() {
    const B = this.bones, sc = this.T.scale;
    B.WristR.getWorldQuaternion(_qa);
    _gq.copy(_qa).multiply(_qb.copy(HAND_R.q).invert());
    // the wrist sits at handTarget(HAND_R, grip=0); invert that offset
    this.handTarget(HAND_R, _c.set(0, 0, 0), _gp2.set(0, 0, 0), _gq, _v1);
    B.WristR.getWorldPosition(_gp).sub(_v1);
    this.setGun(_gp, _gq);
  }
}
