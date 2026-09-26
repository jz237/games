// deaths.js — how enemies die. Build v9 replaced "every soldier plays the one
// Death clip and the same 'enemy-down' sound" with a catalogue of deaths picked
// by what killed him and where he was standing, each with its own motion,
// effects and voice. Purely visual: the soldier is already dead (alive=false)
// the instant he is hit, so no death here can delay the game or block a shot.
//
// A death is driven by a corpse record {t, e, s, style, ...}. Each frame the
// style sets the rig's pose parameters (Death / HitRecieve / Wave clip times,
// crouch), the soldier poses, and then the style places the whole body: ground
// position, height in the air, and a rotation about a pivot (feet for topples,
// hips for somersaults) — so the model can fly, tumble, roll and topple.
import * as THREE from 'three';
import { clamp, TAU } from './util.js';

const rnd = Math.random;
const G = 14;                                   // gamey gravity: arcs read snappy
const ease = (u) => u * u * (3 - 2 * u);
const easeIn = (u) => u * u * u;

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
// the hip bone's position in the body's own (upright) frame, after posing
function hipsOf(s) {
  const b = s.bones.Body || s.bones.Hips;
  if (!b) return _o.set(0, 1, 0);
  return s.obj.worldToLocal(b.getWorldPosition(_o));
}

// ------------------------------------------------------------------ setup
export function beginDeath(game, c) {
  const e = c.e, a = c.s.a;
  a.hit = -1; a.dwave = -1; a.dead = 0; a.crouch = 0; a.twist = 0;
  c.yaw = Math.PI - e.face;
  c.x0 = e.x; c.p0 = e.p;
  // unit direction the body is thrown (away from what killed it)
  const L = Math.hypot(c.vx, c.vp) || 1;
  c.dx = c.vx / L; c.dp = c.vp / L;
  c.landed = false;
  MUTE = !!c.silent && c.style !== 'bike';
  const x = e.x;
  switch (c.style) {
    case 'classic': voice(game, grunt(), x); break;
    case 'stagger': voice(game, grunt(), x); break;
    case 'spin': voice(game, 'die-yelp', x); c.turns = (1.2 + rnd() * 0.6) * (rnd() < 0.5 ? -1 : 1); break;
    // topples get a sideways twist: straight away from this camera, a fallen
    // body looks just like a standing one
    case 'knees': voice(game, 'die-groan', x, 0.5); c.yaw += (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.5); break;
    case 'plank': voice(game, 'die-groan', x, 0.45); c.yaw += (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.5); break;
    case 'flyback': c.yaw = Math.atan2(-c.dx, c.dp); voice(game, 'die-yell', x); c.dist = 2.8 + rnd() * 1.2; c.h = 0.9 + rnd() * 0.5; c.dur = 0.62; break;
    case 'launch': {
      c.yaw = Math.atan2(-c.dx, c.dp);          // back to the blast
      voice(game, 'die-scream', x, 0.5);
      c.h = 2.8 + rnd() * 1.4; c.dur = 2 * Math.sqrt(2 * c.h / G); c.dist = 2.5 + rnd() * 1.5;
      c.turns = 2 + Math.floor(rnd() * 2);
      break;
    }
    case 'corkscrew': {
      voice(game, 'die-whoa', x, 0.5);
      c.h = 3.5 + rnd() * 1.5; c.dur = 2 * Math.sqrt(2 * c.h / G); c.dist = 0.8;
      c.turns = (3.5 + rnd() * 1.5) * (rnd() < 0.5 ? -1 : 1);
      break;
    }
    case 'tumble': {
      voice(game, 'die-oof', x, 0.5);
      c.dist = 4 + rnd() * 1.5; c.dur = 1.15; c.turns = 2 + Math.floor(rnd() * 2);
      // lie so the long axis crosses the direction of travel, then log-roll
      c.rollYaw = Math.atan2(c.dp, c.dx);      // model +X along travel (world z = -p)
      break;
    }
    case 'scorched': c.s.setChar && c.s.setChar(0); break;
    case 'splash': voice(game, grunt(), x); c.yaw += (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.5); break;
    case 'ledge': voice(game, 'die-scream', x, 0.45); break;
    case 'bike': {
      voice(game, 'die-whoa', x, 0.5);
      const mo = c.bike;
      const bl = mo ? Math.hypot(mo.vx, mo.vp) : 0;
      if (bl > 0.5) { c.dx = mo.vx / bl; c.dp = mo.vp / bl; }
      c.yaw = Math.atan2(c.dx, -c.dp);          // face the way he flies
      c.h = 1.8 + rnd() * 0.6; c.dur = 2 * Math.sqrt(2 * c.h / G); c.dist = 3 + rnd();
      break;
    }
    case 'officer': voice(game, 'die-nooo', x, 0.6); c.circle = rnd() < 0.5 ? -1 : 1; break;
  }
  MUTE = false;
}

// ------------------------------------------------------------------ per frame
// returns nothing; moves c.e.x/p, poses and places c.s. Called instead of the
// old generic corpse slide.
export function stepDeath(game, c, dt) {
  const e = c.e, s = c.s, a = s.a, t = c.t;
  const T = game.T;
  const gy = (x, p) => T.standY(x, p) + (e.trench ? e.yCur : 0);
  let air = 0, pitch = 0, roll = 0, spin = 0, hips = false;
  a.hit = -1; a.dwave = -1;

  const land = (x, p, big = false) => {
    if (c.landed) return;
    c.landed = true;
    const y = gy(x, p);
    if (T.waterFrac(x, p) > 0.35) {
      splashFx(game, x, y, p);
      impact(game, 'body-splash', x, 0.55);
    } else {
      game.fx.dust(x, y, -p, big ? 7 : 4, [0.62, 0.52, 0.4], big ? 2.2 : 1.4, big ? 0.7 : 0.5);
      impact(game, 'body-thud', x, big ? 0.6 : 0.45);
    }
  };
  // move along the throw direction, stopping at walls (the body is visual
  // only, but flying through a bunker looks wrong)
  const travel = (d) => {
    const nx = c.x0 + c.dx * d, np = c.p0 + c.dp * d;
    if (!game.col.blocked(nx, np, 0.3, 'enemy')) { e.x = nx; e.p = np; }
    else { c.x0 = e.x - c.dx * d; c.p0 = e.p - c.dp * d; }   // pin in place from here on
  };

  switch (c.style) {
    case 'classic': default: {
      if (t < 0.5) travel(2.2 * (t - t * t));
      a.dead = Math.min(1, t * 2.8);
      if (t > 0.55) land(e.x, e.p);
      break;
    }
    case 'stagger': {
      // two jolts backwards, then the drop
      if (t < 0.5) { a.hit = ((t % 0.25) / 0.25) * 0.85; travel(1.4 * ease(t / 0.5)); }
      else a.dead = Math.min(1, (t - 0.5) * 2.6);
      if (t > 0.2 && t < 0.27 && !c.g2) { c.g2 = true; voice(game, grunt(), e.x, 0.4); }
      if (t > 0.95) land(e.x, e.p);
      break;
    }
    case 'spin': {
      const u = clamp(t / 0.6, 0, 1);
      spin = c.turns * TAU * (1 - (1 - u) * (1 - u));
      if (t < 0.6) { a.hit = u; air = 0.18 * Math.sin(Math.PI * u); }
      else a.dead = Math.min(1, (t - 0.6) * 3);
      if (t > 0.95) land(e.x, e.p);
      break;
    }
    case 'knees': {
      a.hit = 0.55;
      a.crouch = clamp(t / 0.3, 0, 1);                  // sink onto the knees
      if (t > 0.3 && t < 0.85) spin = Math.sin((t - 0.3) * 9) * 0.08;   // sways
      if (t > 0.85) pitch = 1.4 * easeIn(clamp((t - 0.85) / 0.35, 0, 1)); // face-plant
      if (t > 1.2) land(e.x, e.p);
      break;
    }
    case 'plank': {
      // stiff as a board and toppling like a felled tree
      a.hit = 0.35;
      const u = clamp((t - 0.12) / 0.7, 0, 1);
      pitch = -Math.PI / 2 * easeIn(u);
      if (u >= 1) { land(e.x, e.p); pitch += Math.max(0, 0.12 - (t - 0.82)) * Math.sin((t - 0.82) * 40) * 0.6; }
      break;
    }
    case 'flyback': {
      const u = clamp(t / c.dur, 0, 1);
      travel(c.dist * (1 - (1 - u) * (1 - u)));
      air = 4 * c.h * u * (1 - u);
      pitch = -0.4 * Math.sin(Math.PI * u);                // leans back in flight;
      a.dead = Math.min(1, t * 1.6);                       // the clip lays him down
      if (u >= 1) { land(e.x, e.p); if (t < c.dur + 0.3) travel(c.dist + 0.4 * ease((t - c.dur) / 0.3)); }
      break;
    }
    case 'launch': {
      const u = clamp(t / c.dur, 0, 1);
      travel(c.dist * u);
      air = 4 * c.h * u * (1 - u);
      // end over end about the hips — whole turns, because the Death clip's
      // own pose already lies him on his back
      pitch = -c.turns * TAU * u;
      hips = u < 1;
      a.dead = Math.min(1, t * 3);
      if (u >= 1) {
        land(e.x, e.p, true);
        const b = t - c.dur;                               // a little bounce
        if (b < 0.3) air = 0.35 * Math.sin(Math.PI * b / 0.3);
      }
      break;
    }
    case 'corkscrew': {
      const u = clamp(t / c.dur, 0, 1);
      travel(c.dist * u);
      air = 4 * c.h * u * (1 - u);
      spin = c.turns * TAU * (1 - (1 - u) * (1 - u));
      a.hit = 0.45;                                        // arms flung wide…
      if (u > 0.7) { a.hit = -1; a.dead = (u - 0.7) / 0.3; } // …and limp for the landing
      if (u >= 1) land(e.x, e.p, true);
      break;
    }
    case 'tumble': {
      const u = clamp(t / c.dur, 0, 1);
      travel(c.dist * (1 - (1 - u) * (1 - u)));
      c.yaw = c.rollYaw;
      a.dead = Math.min(1, t * 4);                         // knocked flat by the clip…
      roll = -c.turns * TAU * (1 - (1 - u) * (1 - u));      // …then rolled like a log
      hips = true;
      air = Math.abs(Math.sin(u * c.turns * Math.PI)) * 0.3 * (1 - u);
      if (u >= 1) land(e.x, e.p);
      break;
    }
    case 'scorched': {
      const k = clamp(t / 0.25, 0, 1);
      if (s.setChar) s.setChar(0.88 * k);
      if (t < 0.95) {
        // dazed and smoking, swaying on the spot
        spin = Math.sin(t * 8) * 0.22;
        pitch = Math.sin(t * 6) * 0.06;
        c.puff = (c.puff || 0) - dt;
        if (c.puff <= 0) { c.puff = 0.07; smokePuff(game, e.x, gy(e.x, e.p) + 1.9, e.p); }
        if (t > 0.18 && !c.coughed) { c.coughed = true; voice(game, 'die-cough', e.x, 0.5); }
      } else a.dead = Math.min(1, (t - 0.95) * 2.4);
      if (t > 1.35) land(e.x, e.p);
      break;
    }
    case 'splash': {
      const u = clamp(t / 0.45, 0, 1);
      a.hit = 0.3;
      pitch = -Math.PI / 2 * easeIn(u);
      if (u >= 1) {
        if (!c.landed) { c.landed = true; splashFx(game, e.x, gy(e.x, e.p), e.p); impact(game, 'body-splash', e.x, 0.6); }
        air = -Math.min(0.9, (t - 0.45) * 0.35);          // and sinks
      }
      break;
    }
    case 'ledge': {
      const fallT = Math.sqrt(2 * c.fall / 9.8);
      const u = clamp(t / fallT, 0, 1);
      air = Math.max(0, c.fall - 9.8 * t * t * 0.5);
      if (u < 0.6) { a.hit = (t * 3.2) % 1; pitch = -0.5 * u / 0.6; }   // flailing on the way down
      else { a.dead = Math.min(1, (u - 0.6) / 0.4); pitch = -0.5 * (1 - a.dead); }
      if (u >= 1) land(e.x, e.p, true);
      break;
    }
    case 'bike': {
      const u = clamp(t / c.dur, 0, 1);
      travel(c.dist * u);
      air = 4 * c.h * u * (1 - u) + 0.6 * (1 - u);          // starts from the saddle
      pitch = TAU * u;                                       // one front flip over the handlebars
      hips = u < 1;
      a.dead = Math.min(1, t * 2.5);                         // lands on his back, courtesy of the clip
      if (u >= 1) land(e.x, e.p, true);
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
      } else if (t < 2.2) { a.dwave = (t - 1.3) / 0.9; spin = TAU * c.circle; }
      else { a.dead = Math.min(1, (t - 2.2) * 2.2); spin = TAU * c.circle; }
      if (t > 2.65) land(e.x, e.p);
      break;
    }
  }

  s.setFlash(Math.max(0, 0.9 - t * 8));
  s.a.speed = 0; s.a.recoil = 0;
  // corpses melt into the ground at the end (as before)
  let y = gy(e.x, e.p) + air;
  if (t > 7) y -= (t - 7) * 0.4;
  // Pose the rig UPRIGHT, then tilt the whole body. The kneeling IK works in
  // world space; posing while still tipped from last frame drove the knees
  // (and the body with them) into the ground.
  s.obj.quaternion.setFromAxisAngle(AY, c.yaw + spin);
  s.obj.position.set(e.x, y, -e.p);
  s.pose(dt);
  place(c, e.x, y, e.p, pitch, roll, spin, hips ? hipsOf(s) : FEET);
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
