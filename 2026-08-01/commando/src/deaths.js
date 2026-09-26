// deaths.js — how enemies die. Build v9 replaced "every soldier plays the one
// Death clip and the same 'enemy-down' sound" with a catalogue of deaths picked
// by what killed him and where he was standing, each with its own motion,
// effects and voice. Purely visual: the soldier is already dead (alive=false)
// the instant he is hit, so no death here can delay the game or block a shot.
//
// Build v10 made the bodies physical: a death is a short scripted opening (or
// none) and then a Verlet ragdoll (ragdoll.js) with a kick shaped by the
// style — thrown back, launched end over end, corkscrewed, rolled, tipped off
// a tower, flung over a motorbike's handlebars — so every fall lands
// differently on whatever ground is there.
import * as THREE from 'three';
import { clamp, TAU } from './util.js';
import { sampleJoints } from './ragdoll.js';

const rnd = Math.random;
const _pv = new THREE.Vector3();
const ease = (u) => u * u * (3 - 2 * u);

// ------------------------------------------------------------------ choosing
const BULLET = { classic: 22, stagger: 16, spin: 16, knees: 14, plank: 12, flyback: 12 };
const BLAST = { launch: 35, corkscrew: 20, tumble: 25, scorched: 20 };
const TRENCH = { classic: 40, stagger: 30, plank: 30 };

function weighted(table, avoid, bonus = {}) {
  let tot = 0;
  const w = {};
  for (const [k, v] of Object.entries(table)) { w[k] = (v + (bonus[k] || 0)) * (k === avoid ? 0.15 : 1); tot += w[k]; }
  let r = rnd() * tot;
  for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; }
  return Object.keys(table)[0];
}

// ctx: { e, fromX, fromP, byBlast, fall, water, chain, last }
export function pickDeath(ctx) {
  const { e } = ctx;
  if (ctx.water) return 'splash';
  if (ctx.fall > 1.5) return 'ledge';
  if (ctx.bike) return 'bike';
  if (e.type === 'officer') return 'officer';
  if (ctx.byBlast) return weighted(BLAST, ctx.last);
  if (e.trench) return weighted(TRENCH, ctx.last);
  const d = Math.hypot(e.x - ctx.fromX, e.p - ctx.fromP);
  const bonus = {};
  if (d < 5) bonus.flyback = 22;                // point blank throws them
  if (ctx.chain >= 4) { bonus.spin = 10; bonus.flyback = (bonus.flyback || 0) + 10; } // a streak gets showier
  return weighted(BULLET, ctx.last, bonus);
}

// ------------------------------------------------------------------ sound
// Vocal deaths are gated so a grenade that drops six men does not play six
// screams on top of each other: at most two voices in any 250ms window. Impact
// sounds (thud, splash, crash) have their own per-name gap in Audio.play.
let MUTE = false;
function voice(game, name, x, gain = 0.55) {
  if (MUTE) return;
  const now = performance.now();
  game._vox = (game._vox || []).filter((t) => now - t < 250);
  if (game._vox.length >= 2) return;
  game._vox.push(now);
  game.audio.play(name, { gain, pan: game.pan(x), variance: 0.08 }, 40);
}
function impact(game, name, x, gain = 0.5, gap = 70) { game.audio.play(name, { gain, pan: game.pan(x) }, gap); }
const grunt = () => (rnd() < 0.5 ? 'die-grunt-a' : 'die-grunt-b');

// ------------------------------------------------------------------ placing
const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const _o = new THREE.Vector3(), _w = new THREE.Vector3(), _r = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const FEET = new THREE.Vector3();

// Put the body in the world. yaw: facing; pitch: rotation about the body's own
// left-right axis (negative = falls on its back, positive = face down); roll:
// about the model's front-back axis (the long axis once he lies on his back);
// pivot: the obj-local point the rotation happens about (the feet for a
// topple, the hip bone for a somersault) — that point stays where an
// untumbled body would have it, so flips turn about the body, not the boots.
function place(c, x, y, p, pitch, roll, spin, pivot) {
  const s = c.s;
  _qy.setFromAxisAngle(AY, c.yaw + spin);
  _q.copy(_qy);
  _qa.setFromAxisAngle(AZ, roll); _q.multiply(_qa);
  _qb.setFromAxisAngle(AX, pitch); _q.multiply(_qb);
  _w.copy(pivot).applyQuaternion(_qy).add(_r.set(x, y, -p));   // where the pivot belongs
  _o.copy(pivot).applyQuaternion(_q);                          // where the tumble put it
  s.obj.quaternion.copy(_q);
  s.obj.position.copy(_w).sub(_o);
}

// ------------------------------------------------------------------ physics
// Build v10: every death ends in a Verlet ragdoll (ragdoll.js). Some styles
// play a scripted opening first (a stagger, a spin, sinking to the knees, the
// scorched daze, the officer's farewell); the rest hand straight over with a
// kick shaped by what killed him.
export function ragEnv(game) {
  const T = game.T, col = game.col, push = col.constructor.push;
  return {
    ground: (x, z) => T.standY(x, -z),
    water: (x, z) => { const a = T.waterAt(x, -z); return a && a.m > 0.3 ? a.w.level : null; },
    wall: (x, z, r) => {
      const p = -z;
      for (const c of col.near(p, r + 3)) {
        if (!c.alive || c.enemyPass || c.water) continue;
        const v = push(c, x, p, r);
        if (v) return [v[0], -v[1]];
      }
      return null;
    },
  };
}

// v11: bodies lie where they fell this long, then fade into the ground
export const SINK_AT = 24, SINK_LOW = 14, FADE = 1.6;

// scripted opening, in seconds (0: the ragdoll takes him at once)
const PRE = { stagger: 0.5, spin: 0.42, knees: 0.75, scorched: 0.95, officer: 2.2 };

// ------------------------------------------------------------------ setup
export function beginDeath(game, c) {
  const e = c.e, a = c.s.a;
  a.hit = -1; a.dwave = -1; a.dead = 0; a.crouch = 0; a.twist = 0; a.dying = true; a.throwT = -1; a.feedT = -1; a.roll = -1;
  a.hitAlt = rnd() < 0.5;                           // one of the two hit reactions
  c.yaw = Math.PI - e.face;
  c.x0 = e.x; c.p0 = e.p;
  // unit direction the body is thrown (away from what killed it)
  const L = Math.hypot(c.vx, c.vp) || 1;
  c.dx = c.vx / L; c.dp = c.vp / L;
  c.landed = false;
  c.pre = PRE[c.style] || 0;
  c.sinkAt = SINK_AT;
  MUTE = !!c.silent && c.style !== 'bike';
  const x = e.x;
  switch (c.style) {
    case 'classic': voice(game, grunt(), x); break;
    case 'stagger': voice(game, grunt(), x); break;
    case 'spin': voice(game, 'die-yelp', x); c.turns = (0.9 + rnd() * 0.4) * (rnd() < 0.5 ? -1 : 1); break;
    case 'knees': voice(game, 'die-groan', x, 0.5); break;
    case 'plank': voice(game, 'die-groan', x, 0.45); break;
    case 'flyback': voice(game, 'die-yell', x); break;
    case 'launch': voice(game, 'die-scream', x, 0.5); break;
    case 'corkscrew': voice(game, 'die-whoa', x, 0.5); break;
    case 'tumble': voice(game, 'die-oof', x, 0.5); break;
    case 'scorched': c.s.setChar && c.s.setChar(0); break;
    case 'splash': voice(game, grunt(), x); break;
    case 'ledge': voice(game, 'die-scream', x, 0.45); break;
    case 'bike': {
      voice(game, 'die-whoa', x, 0.5);
      const mo = c.bike;
      c.bv = mo ? [mo.vx, mo.vp] : [c.dx * 6, c.dp * 6];
      break;
    }
    case 'officer': voice(game, 'die-nooo', x, 0.6); c.circle = rnd() < 0.5 ? -1 : 1; break;
  }
  MUTE = false;
  if (!c.pre) handOver(game, c);
}

// the kick each style gives the ragdoll. World axes: x, y up, z = -p; (bx, bz)
// is the unit direction away from the killer.
function handOver(game, c, prev) {
  const s = c.s, e = c.e;
  const r = s.startRagdoll(ragEnv(game), { prev, rigid: c.style === 'plank' });
  // off-centre hits: the push swings up to ~50° to one side (a fall straight
  // away from this camera reads as a man sitting down)
  const sw = (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.5), cs = Math.cos(sw), sn = Math.sin(sw);
  const bx = c.dx * cs - c.dp * sn, bz = -(c.dx * sn + c.dp * cs);
  const j = (a) => a * (0.85 + rnd() * 0.3);        // a little variety
  // a running man keeps some of his momentum
  if (!prev && c.style !== 'bike' && e.px !== undefined) {
    const mx = clamp((e.x - e.px) * 60, -8, 8), mp = clamp((e.p - e.pp) * 60, -8, 8);
    if (mx || mp) r.push(mx * 0.8, 0, -mp * 0.8);
  }
  switch (c.style) {
    case 'classic':
      r.push(bx * j(2.6), 0.6, bz * j(2.6), ['mid', 'neck', 'head', 'shL', 'shR']);
      r.push(bx * 1.2, 0, bz * 1.2, ['pelvis', 'hipL', 'hipR']);
      r.push(-bx * 1.4, 0, -bz * 1.4, ['knL', 'knR']);               // the knees buckle
      break;
    case 'stagger': r.push(bx * j(2.2), 0.4, bz * j(2.2), ['mid', 'neck', 'head', 'shL', 'shR']); r.push(-bx, 0, -bz, ['knL', 'knR']); break;
    case 'spin': r.push(bx * 1.2, 0.5, bz * 1.2); break;               // the spin itself carries over from the opening
    case 'knees': r.push(-bx * j(1.8), 0, -bz * j(1.8), ['mid', 'neck', 'head', 'shL', 'shR']); break;
    case 'plank': r.push(bx * j(2.4), 0, bz * j(2.4), ['head', 'neck', 'shL', 'shR']); r.push(-bx * 0.4, 0, -bz * 0.4, ['anL', 'anR']); break;
    case 'flyback':
      r.push(bx * j(5.2), j(3.4), bz * j(5.2));
      r.push(bx * 1.6, 0.4, bz * 1.6, ['mid', 'neck', 'head', 'shL', 'shR']);  // chest leads, legs trail
      break;
    case 'launch': {
      r.push(bx * j(3.4), j(9.6), bz * j(3.4));
      const dir = rnd() < 0.5 ? 1 : -1;                             // back- or front-flip
      r.spin(-bz * dir, 0, bx * dir, j(7));
      break;
    }
    case 'corkscrew':
      r.push(bx * 1.0, j(8.6), bz * 1.0);
      r.spin(0.15, 1, 0.1, j(13) * (rnd() < 0.5 ? -1 : 1));
      break;
    case 'tumble':
      r.push(bx * j(6.2), j(3.2), bz * j(6.2));
      r.spin(bx, 0, bz, j(9) * (rnd() < 0.5 ? -1 : 1));               // rolled along the ground
      break;
    case 'scorched': r.push(-bx * 0.6, 0, -bz * 0.6, ['knL', 'knR']); r.push(rnd() - 0.5, 0, rnd() - 0.5, ['head', 'neck']); break;
    case 'splash': r.push(bx * j(2.2), 0.8, bz * j(2.2), ['mid', 'neck', 'head', 'shL', 'shR']); break;
    case 'ledge': r.push(bx * 0.8, j(2.2), 2.4 + bz * 0.8); break;          // off the front, toward the camera
    case 'bike': {
      const [vx, vp] = c.bv;
      r.push(vx * 0.9, j(4.6), -vp * 0.9);
      const L = Math.hypot(vx, vp) || 1;
      r.spin(-vp / L, 0, -vx / L, j(6));                               // over the handlebars
      break;
    }
    case 'officer': r.push(bx * 0.8, 0.2, bz * 0.8, ['head', 'neck', 'mid']); r.push(-bx * 0.8, 0, -bz * 0.8, ['knL', 'knR']); break;
  }
  r.onLand = (v) => land(game, c, v > 6);
  ragSounds(game, r, () => c.e.x);
}

// v11: what a ragdoll sounds like after the first landing — the rifle
// clattering down, softer bumps as the body settles, limbs slapping water
export function ragSounds(game, r, xOf) {
  r.onGunLand = (v) => { if (v > 2) game.audio.play('gun-clatter', { gain: clamp(0.16 + v * 0.05, 0.18, 0.45), pan: game.pan(xOf()), variance: 0.1 }, 90); };
  r.onBump = (v) => game.audio.play('body-thud', { gain: clamp(v * 0.045, 0.1, 0.3), rate: 1.15, pan: game.pan(xOf()), variance: 0.12 }, 120);
  r.onSplash = (x, y, z) => { game.fx.impact(x, y, z, 'water'); game.audio.play('limb-splash', { gain: 0.32, pan: game.pan(xOf()), variance: 0.12 }, 90); };
}

// v11: a blast near bodies already down throws them again (cutting a
// scripted opening short if it's still playing)
export function blastCorpse(game, c, x, p, r) {
  if (c.dead || c.t > c.sinkAt) return;
  const e = c.e, d = Math.hypot(e.x - x, e.p - p), reach = r + 2.5;
  if (d > reach) return;
  if (!c.s.rag) handOver(game, c, c.hadPrev ? c.prevJ : null);
  const R = c.s.rag, k = 1 - d / reach, ux = (e.x - x) / (d || 1), up = (e.p - p) / (d || 1);
  R.push(ux * 6.5 * k, 2.2 + 7.5 * k, -up * 6.5 * k);
  R.spin(rnd() - 0.5, rnd() * 0.3, rnd() - 0.5, (2 + 6 * rnd()) * k);
  R.landed = false; c.landed = false; c.retossed = true;     // it thuds again where it comes down (if it comes down hard)
  if (d < r * 0.7 && c.s.setChar) c.s.setChar(Math.max(c.s.material.userData.uChar.value, 0.7));
  c.sinkAt = Math.max(c.sinkAt, c.t + 6);
}

// v11: a round passing over a body makes it twitch
const PARTS = ['mid', 'pelvis', 'shL', 'shR', 'knL', 'knR', 'head', 'elL', 'elR'];
export function twitchCorpse(game, c, vx, vp) {
  const R = c.s.rag;
  if (!R || c.dead || c.t > c.sinkAt) return;
  const L = Math.hypot(vx, vp) || 1, nm = PARTS[(rnd() * PARTS.length) | 0];
  R.push(vx / L * 2.6, 1.1, -vp / L * 2.6, [nm]);
  R.pos(nm, _pv);
  game.fx.dust(_pv.x, _pv.y, _pv.z, 2, [0.55, 0.45, 0.35], 0.8, 0.25);
}

function land(game, c, big) {
  if (c.landed) return;
  c.landed = true;
  if (c.retossed && !big) return;                   // a light re-toss lands quietly
  const e = c.e, T = game.T, y = T.standY(e.x, e.p);
  if (T.openWater(e.x, e.p) > 0.35) {
    splashFx(game, e.x, y, e.p);
    impact(game, 'body-splash', e.x, 0.55);
  } else {
    game.fx.dust(e.x, y, -e.p, big ? 7 : 4, [0.62, 0.52, 0.4], big ? 2.2 : 1.4, big ? 0.7 : 0.5);
    impact(game, 'body-thud', e.x, big ? 0.6 : 0.45);
  }
}

// ------------------------------------------------------------------ per frame
// moves c.e.x/p, poses and places c.s
export function stepDeath(game, c, dt) {
  const e = c.e, s = c.s, a = s.a, t = c.t;
  const T = game.T;
  s.setFlash(Math.max(0, 0.9 - t * 8));
  s.a.speed = 0; s.a.recoil = 0;
  if (s.rag) {
    const r = s.rag;
    // what happens while physics has him
    if (c.style === 'scorched') {
      if (s.setChar) s.setChar(0.88);
      c.puff = (c.puff || 0) - dt;
      if (c.puff <= 0 && t < 3) { c.puff = 0.12; r.pos('mid', _pv); smokePuff(game, _pv.x, _pv.y + 0.3, -_pv.z); }
    }
    if (c.style === 'ledge' && !r.landed && t < 1.5) {
      c.flail = (c.flail || 0) - dt;
      if (c.flail <= 0) { c.flail = 0.09; const k = () => (rnd() - 0.5) * 7; r.push(k(), k() * 0.5, k(), [rnd() < 0.5 ? 'wrL' : 'wrR', rnd() < 0.5 ? 'anL' : 'anR']); }
    }
    if (c.style === 'splash' && r.landed === false && r.t > 0.05 && T.openWater(e.x, e.p) > 0.35) {
      r.pos('mid', _pv);
      const lv = T.waterAt(e.x, e.p);
      if (lv && _pv.y < lv.w.level + 0.15) land(game, c, false);
    }
    r.pos('pelvis', _pv); e.x = _pv.x; e.p = -_pv.z;
    // at the end the body sinks a little and fades out
    if (t > c.sinkAt) {
      r.asleep = true;
      const m = s.material;
      if (!m.transparent) { m.transparent = true; m.depthWrite = false; m.needsUpdate = true; s.unfreeze(); s.noFreeze = true; s.mesh.castShadow = false; }
      m.opacity = clamp(1 - (t - c.sinkAt) / FADE, 0, 1);
      s.obj.position.y -= dt * 0.12;
    }
    s.pose(dt);
    return;
  }
  // ---- the scripted opening
  const gy = (x, p) => T.standY(x, p) + (e.trench ? e.yCur : 0);
  let air = 0, pitch = 0, spin = 0;
  a.hit = -1; a.dwave = -1;
  const travel = (d) => {
    const nx = c.x0 + c.dx * d, np = c.p0 + c.dp * d;
    if (!game.col.blocked(nx, np, 0.3, 'enemy')) { e.x = nx; e.p = np; }
    else { c.x0 = e.x - c.dx * d; c.p0 = e.p - c.dp * d; }
  };
  switch (c.style) {
    case 'stagger': {
      // two jolts backwards, then the ragdoll
      a.hit = ((t % 0.25) / 0.25) * 0.85; travel(1.4 * ease(clamp(t / 0.5, 0, 1)));
      if (t > 0.2 && t < 0.27 && !c.g2) { c.g2 = true; voice(game, grunt(), e.x, 0.4); }
      break;
    }
    case 'spin': {
      const u = clamp(t / 0.6, 0, 1);
      spin = c.turns * TAU * (1 - (1 - u) * (1 - u));
      a.hit = u; air = 0.18 * Math.sin(Math.PI * u);
      break;
    }
    case 'knees': {
      a.hit = 0.55;
      a.crouch = clamp(t / 0.3, 0, 1);                  // sink onto the knees
      if (t > 0.3) spin = Math.sin((t - 0.3) * 9) * 0.08;   // sways
      break;
    }
    case 'scorched': {
      const k = clamp(t / 0.25, 0, 1);
      if (s.setChar) s.setChar(0.88 * k);
      // dazed and smoking, swaying on the spot
      spin = Math.sin(t * 8) * 0.22;
      pitch = Math.sin(t * 6) * 0.06;
      c.puff = (c.puff || 0) - dt;
      if (c.puff <= 0) { c.puff = 0.07; smokePuff(game, e.x, gy(e.x, e.p) + 1.9, e.p); }
      if (t > 0.18 && !c.coughed) { c.coughed = true; voice(game, 'die-cough', e.x, 0.5); }
      break;
    }
    case 'officer': {
      // the theatrical exit: clutches, reels round in a little circle, waves
      // the player goodbye, and only then goes down
      if (t < 0.35) a.hit = t / 0.35 * 0.6;
      else if (t < 1.3) {
        const u = (t - 0.35) / 0.95;
        a.hit = 0.35 + Math.sin(u * TAU * 1.5) * 0.2;
        const ang = u * TAU * c.circle;
        e.x = c.x0 + Math.sin(ang) * 0.6; e.p = c.p0 + (1 - Math.cos(ang)) * 0.6;
        spin = ang;
      } else { a.dwave = clamp((t - 1.3) / 0.9, 0, 1); spin = TAU * c.circle; }
      break;
    }
  }
  const y = gy(e.x, e.p) + air;
  // Pose the rig UPRIGHT, then tilt the whole body. The kneeling IK works in
  // world space; posing while still tipped from last frame drove the knees
  // (and the body with them) into the ground.
  s.obj.quaternion.setFromAxisAngle(AY, c.yaw + spin);
  s.obj.position.set(e.x, y, -e.p);
  s.pose(dt);
  place(c, e.x, y, e.p, pitch, 0, spin, FEET);
  // remember where the joints were, so the ragdoll inherits the motion
  s.obj.updateMatrixWorld(true);
  c.joints = sampleJoints(s, c.joints || new Float32Array(48));
  c.prevJ = c.prevJ || new Float32Array(48);
  if (t + dt >= c.pre) {
    // hand over with last frame's joints as the "previous" positions
    handOver(game, c, c.hadPrev ? c.prevJ : null);
  } else { c.prevJ.set(c.joints); c.hadPrev = true; }
}

// ------------------------------------------------------------------ effects
function splashFx(game, x, y, p) {
  const fx = game.fx;
  for (let i = 0; i < 3; i++) fx.impact(x + (rnd() - 0.5) * 0.8, y, -p + (rnd() - 0.5) * 0.8, 'water');
  for (let i = 0; i < 10; i++) fx.smoke.add({ x, y: y + 0.2, z: -p, vx: (rnd() - 0.5) * 3.2, vy: 3 + rnd() * 3, vz: (rnd() - 0.5) * 3.2, life: 0.7, size: 0.22, size1: 0.45, r: 0.9, g: 0.95, b: 1, a: 0.8, a1: 0, grav: 12 });
  fx.ring(x, -p, y, 1.8, 0.6, [0.85, 0.92, 1], 'shock');
}
function smokePuff(game, x, y, p) {
  game.fx.smoke.add({ x: x + (rnd() - 0.5) * 0.3, y, z: -p + (rnd() - 0.5) * 0.3, vx: (rnd() - 0.5) * 0.3, vy: 0.9 + rnd() * 0.5, vz: (rnd() - 0.5) * 0.3,
    life: 0.9 + rnd() * 0.4, size: 0.18, size1: 0.7, r: 0.22, g: 0.21, b: 0.2, a: 0.6, a1: 0, drag: 0.05 });
}

// the names of every death, for the test hooks
export const DEATHS = ['classic', 'stagger', 'spin', 'knees', 'plank', 'flyback', 'launch', 'corkscrew', 'tumble', 'scorched', 'splash', 'ledge', 'bike', 'officer'];
