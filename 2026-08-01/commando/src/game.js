// game.js — the simulation. Runs at a fixed 60 Hz in area coordinates
// (x = metres right of centre, p = metres north), and syncs the 3D scene.
// One Game lives for the whole session; the World under it is swapped per area.
import * as THREE from 'three';
import { Soldier } from './soldier.js';
import * as M2 from './models2.js';
import { flatGeo } from './assets.js';
import { clamp, lerp, angDiff, approach, TAU } from './util.js';
import { pickDeath, beginDeath, stepDeath, ragEnv, ragSounds, blastCorpse, twitchCorpse, FADE, SINK_LOW } from './deaths.js';

export const TUNE = {
  joeSpeed: 5.6, joeAccel: 55, joeRadius: 0.42, wadeSpeed: 0.55,
  fireCd: 0.13, bulletSpeed: 36, bulletLife: 0.4, spread: 0.022,
  grenStart: 6, grenMax: 9, grenRange: 11, grenRadius: 3.5,
  joeHp: 3, lives: 3, invulnHit: 1.1, invulnSpawn: 2.6,
  eBullet: 14.5, eBulletSniper: 27,
  runSpeed: 4.1, walkSpeed: 1.8,
  maxAimers: 4,
};
const SCORE = { rifle: 100, lobber: 150, trench: 150, sniper: 300, mortar: 400, officer: 2000, bunker: 1000, truck: 800, pow: 500, moto: 500, tank: 3000, search: 300 };
const HITBOX = 0.5;
const DIVE_T = 1.15;          // v10: a dive-roll away from an incoming grenade
const KICK_T = 0.8;           // v11: an enemy's kick when Joe is too close for a rifle
const KICKERS = new Set(['fight', 'approach', 'cover', 'charge', 'enter', 'aim']);
// v11: metres of travel per run cycle — measured so a planted foot stays put
// (at 2.3 the feet skated backwards at ~1.2 m/s)
const STRIDE = TAU / 2.7, STRIDE_E = TAU / 2.6;

const dirOf = (a) => [Math.sin(a), Math.cos(a)];      // angle 0 = north (+p), +π/2 = east (+x)
const angOf = (dx, dp) => Math.atan2(dx, dp);
const rnd = Math.random;
const rr = (a, b) => a + rnd() * (b - a);

export class Game {
  constructor({ R, fx, hud, audio }) {
    this.R = R; this.fx = fx; this.hud = hud; this.audio = audio;
    this.scene = R.scene;
    this.loop = 1; this.areaNum = 1;
    this.hi = this.loadHi();
    this.state = 'idle';
    this.events = [];
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._mz = new THREE.Vector3();
    this.shellGeo = new THREE.SphereGeometry(0.11, 8, 6);
    this.shellMat = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.5, metalness: 0.4 });
  }
  // grenades and pickups use the loaded models, which arrive after construction
  initModels() {
    if (this.modelsReady) return;
    this.modelsReady = true;
    this.nadeGeo = flatGeo('props', 'grenade', { h: 0.34, cy: true });
    this.nadeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
    // grenade resupply: an olive ammo crate; medkit: a white one
    this.pickupGeo = { gren: flatGeo('props', 'crate', { w: 0.6 }, { Wood: '#4d5830', Wood_Light: '#6a7543' }), med: flatGeo('props', 'crate', { w: 0.55 }, { Wood: '#d8d2c2', Wood_Light: '#eee8d8' }) };
    this.pickupMat = {
      gren: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x2a3a08, roughness: 0.55 }),
      med: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x401010, roughness: 0.6 }),
    };
  }

  setWorld(world) {
    this.initModels();
    this.clearEntities();
    this.world = world; this.area = world.area;
    this.T = world.terrain; this.col = world.col;
  }

  // ------------------------------------------------------------------ lifecycle
  newGame(opts = {}) {
    this.loop = 1;
    this.score = 0; this.lives = TUNE.lives; this.nextLife = 20000;
    this.carryGren = TUNE.grenStart;       // grenades carry over from area to area
    this.demo = !!opts.demo;
    // WATCH DEMO (build v9): the autopilot plays a full, scored campaign that
    // must never overwrite the player's hi-score
    this.showcase = !!opts.showcase;
    this.continues = 0;
    this.startArea();
  }
  continueGame() {
    this.lives = TUNE.lives; this.continues++;
    this.carryGren = Math.max(this.carryGren, TUNE.grenStart);
    this.startArea();
  }

  startArea() {
    this.clearEntities();
    const A = this.area, W = this.world;
    this.t = 0; this.tick = 0;
    this.joe = this.makeJoe(A.spawn.x, A.spawn.p);
    this.camP = A.spawn.p + this.R.offJoe; this.camX = 0; this.prevCamP = this.camP;
    this.encDone = new Set();
    this.patrolT = 4; this.chain = 0; this.chainT = 0;
    this.tokens = 0;
    this.rescued = 0; this.kills = 0;
    this.finale = null;
    this.hitStop = 0; this.overSent = false; this.doneSent = false;
    this.stats = { eshots: 0, hits: 0, deaths: 0 };
    W.gateCol.alive = true;
    for (const d of W.dyn.doors) d.rotation.y = 0;
    for (const b of W.dyn.barrels) { b.alive = true; b.hp = b.big ? 6 : b.red ? 2 : 6; b.mesh.visible = true; b.c.alive = true; }
    for (const c of W.dyn.crates) { c.hp = 3; c.mesh.visible = true; if (c.c) c.c.alive = true; }
    for (const pit of W.dyn.pits) { pit.alive = true; pit.tube.visible = true; }
    for (const b of W.dyn.bunkers) { b.alive = true; b.hp = 2; b.active = false; b.group.scale.set(1, 1, 1); b.group.traverse(o => { if (o.material && o.userData.baseCol) o.material.color.copy(o.userData.baseCol); }); }
    for (const s of W.dyn.searchlights) { s.on = false; s.lock = 0; s.alarmed = false; s.t = rnd() * 6; }
    this.pows = A.pows.map((w, i) => this.makePow(w.x, w.p, i));
    for (const cage of W.dyn.cages) {
      cage.open = false; cage.openT = 0; cage.door.rotation.y = 0; cage.doorCol.alive = true;
      for (let k = 0; k < cage.n; k++) {
        const pw = this.makePow(cage.x - 0.7 + (k % 2) * 1.2, cage.p + 0.5 - Math.floor(k / 2) * 0.9, 100 + k);
        pw.cage = cage; pw.state = 'caged'; pw.face = Math.PI + (k - 1) * 0.5;
        this.pows.push(pw);
      }
    }
    this.state = 'intro'; this.stateT = 0;
    this.emit('intro');
  }

  clearEntities() {
    for (const e of this.enemies || []) e.s.dispose();
    for (const c of this.corpses || []) c.s.dispose();
    for (const w of this.pows || []) w.s.dispose();
    for (const n of this.nades || []) this.scene.remove(n.mesh);
    for (const k of this.pickups || []) this.scene.remove(k.mesh);
    for (const v of [...(this.trucks || []), ...(this.tanks || []), ...(this.motos || [])]) disposeObj(v.mesh);
    if (this.joe) this.joe.s.dispose();
    this.bunkers = []; this.enemies = []; this.corpses = []; this.bullets = []; this.ebullets = []; this.nades = []; this.pickups = [];
    this.trucks = []; this.tanks = []; this.motos = []; this.pows = [];
    this.fx.clear();
  }

  makeJoe(x, p) {
    const s = new Soldier('joe');
    s.ground = this.groundFn();
    this.scene.add(s.obj);
    return { s, x, p, px: x, pp: p, vx: 0, vp: 0, leg: 0, aim: 0, hp: TUNE.joeHp, alive: true, invuln: TUNE.invulnSpawn, fireCd: 0, get grenades() { return this._g; }, _g: this.carryGren ?? TUNE.grenStart, deadT: 0, throwT: -1, recoil: 0, moveDist: 0, stepAcc: 0 };
  }
  makePow(x, p, i) {
    const s = new Soldier('pow');
    s.ground = this.groundFn();
    s.a.crouch = 1;
    this.scene.add(s.obj);
    return { s, x, p, i, state: 'tied', t: 0, face: Math.PI };
  }

  emit(type, data) { this.events.push({ type, ...data }); }
  // world (x, z) → the height a soldier stands at, for the rig's foot IK
  groundFn() { const T = this.T; return (x, z) => T.standY(x, -z); }

  // ------------------------------------------------------------------ view helpers
  viewTop() { return this.camP - this.R.offTop; }
  viewBottom() { return this.camP - this.R.offBottom; }
  onScreen(x, p, pad = 0) { return p < this.viewTop() + pad && p > this.viewBottom() - pad && Math.abs(x - this.camX) < this.R.halfWidthTop + pad; }
  pan(x) { return clamp((x - this.camX) / 14, -0.9, 0.9); }
  // the surface things stand, drive and land on: terrain, or a bridge deck
  h(x, p) { const h = this.world.h(x, p), d = this.T.deckY(x, p); return d !== null ? Math.max(h, d) : h; }
  hw(p) { return this.T.halfWidth(p); }
  // difficulty: each loop is harder, and so is each area within a loop
  diff() { return this.loop + (this.area ? (this.area.id - 1) * 0.4 : 0); }
  loopK() { return 0.85 + this.diff() * 0.15; }

  // ------------------------------------------------------------------ main step
  update(dt, I) {
    this.t += dt; this.tick++;
    this.stateT += dt;
    if (this.hitStop > 0) { this.hitStop -= dt; this.syncJoeVisual(dt); return; }
    switch (this.state) {
      case 'intro':
        if (this.stateT > 2.2) { this.state = 'play'; this.stateT = 0; }
        this.updateJoe(dt, I, true);
        break;
      case 'play':
      case 'dead':
        this.updateJoe(dt, I, false);
        break;
      case 'clear':
        this.updateJoe(dt, null, true);
        if (this.stateT > 6 && !this.doneSent) { this.doneSent = true; this.emit('area-done'); }
        break;
      case 'over':
        if (this.stateT > 1.2 && !this.overSent) { this.overSent = true; this.emit('gameover-done'); }
        break;
    }
    this.updateCamera(dt);
    if (this.state === 'play' || this.state === 'dead') { this.updateSpawns(dt); this.updateFinale(dt); }
    this.updateEnemies(dt);
    this.updateVehicles(dt);
    this.updateSearchlights(dt);
    this.updateBullets(dt);
    this.updateNades(dt);
    this.updatePickups(dt);
    this.updatePows(dt);
    this.updateCorpses(dt);
    if (this.chainT > 0) { this.chainT -= dt; if (this.chainT <= 0) this.chain = 0; }
  }

  // ------------------------------------------------------------------ Joe
  updateJoe(dt, I, locked) {
    const J = this.joe;
    J.px = J.x; J.pp = J.p;
    if (J.invuln > 0) J.invuln -= dt;
    if (!J.alive) {
      J.deadT += dt;
      if (J.deadT > 2.4) this.respawnJoe();
      this.syncJoeVisual(dt); return;
    }
    let mx = 0, mp = 0, fire = false, gren = false, aimSet = false;
    if (I && !locked) {
      mx = I.mx; mp = I.mp; fire = I.fire; gren = I.gren;
      J.fireHeld = fire;
      // aim: mouse ground point > stick vector > facing
      if (I.aimGround) {
        const g = this.R.groundAtNdc((I.aimGround.sx / innerWidth) * 2 - 1, -(I.aimGround.sy / innerHeight) * 2 + 1, this.h(J.x, J.p) + 1.0);
        const dx = g.x - J.x, dp = -g.z - J.p;
        if (Math.hypot(dx, dp) > 0.4) { J.aim = angOf(dx, dp); aimSet = true; J.aimDist = Math.hypot(dx, dp); }
      } else if (I.aimX || I.aimP) { J.aim = angOf(I.aimX, I.aimP); aimSet = true; J.aimDist = I.aimDist ?? null; }
    }
    if (this.state === 'clear' && !I) {
      // walk in through the gate and vanish into the fortress
      mp = 1; mx = clamp(-J.x * 0.8, -1, 1);
      if (J.p > this.area.wallP + 2.2) { J.s.obj.visible = false; J.inside = true; }
    }
    // movement with snappy acceleration; wading the swamp slows you down
    const wade = this.T.wading(J.x, J.p);
    const top = TUNE.joeSpeed * (wade ? TUNE.wadeSpeed : 1);
    J.vx = approach(J.vx, mx * top, TUNE.joeAccel * dt); J.vp = approach(J.vp, mp * top, TUNE.joeAccel * dt);
    let nx = J.x + J.vx * dt, np = J.p + J.vp * dt;
    if (J.shoveT > 0) { const k = J.shoveT / 0.22; nx += J.shoveX * k * dt; np += J.shoveP * k * dt; J.shoveT -= dt; }
    // keep inside the corridor and the camera window
    const hw = this.world.boundHalf(np);
    nx = clamp(nx, -hw, hw);
    if (this.state !== 'clear') np = clamp(np, this.viewBottom() + 1.2, this.viewTop() - 2.5);
    [nx, np] = this.col.move(J.x, J.p, nx, np, TUNE.joeRadius, 'joe');
    [nx, np] = this.resolveVehicles(nx, np, TUNE.joeRadius);
    const moved = Math.hypot(nx - J.x, np - J.p);
    J.x = nx; J.p = np;
    const spd = moved / dt;
    J.moveDist += moved;
    J.speedN = clamp(spd / TUNE.joeSpeed, 0, 1);
    // legs face travel; aim follows travel unless strafing/aiming
    if (spd > 0.5) {
      const mvAng = angOf(J.x - J.px, J.p - J.pp);
      if (!aimSet && !(I && I.strafe)) J.aim = mvAng;
      // v10: he faces his aim and the run follows his feet — strafing and
      // back-pedalling clips instead of a twisted torso over sliding legs
      J.leg = J.aim; J.mvAng = mvAng;
    } else { J.mvAng = null; if (aimSet) J.leg = J.aim; }
    // aim assist for stick/keys: nudge onto an enemy close to the line of fire
    if (I && !I.aimGround && fire) {
      let best = null, bestD = 0.26;
      for (const e of this.enemies) {
        if (!e.alive || !this.hittable(e)) continue;
        const dx = e.x - J.x, dp = e.p - J.p, dist = Math.hypot(dx, dp);
        if (dist > 20) continue;
        const d = Math.abs(angDiff(J.aim, angOf(dx, dp)));
        if (d < bestD) { bestD = d; best = e; }
      }
      J.aimFire = best ? angOf(best.x - J.x, best.p - J.p) : J.aim;
    } else J.aimFire = J.aim;
    // fire
    J.fireCd -= dt;
    if (fire && J.fireCd <= 0 && J.throwT < 0) {
      J.fireCd = TUNE.fireCd;
      const a = J.aimFire + (rnd() - 0.5) * 2 * TUNE.spread;
      const [dx, dp] = dirOf(a);
      // v11: the round leaves the muzzle (where last frame's pose put it) and
      // settles to the old chest-high flight line over its first 4 m
      const gy = this.T.standY(J.x, J.p) + 1.12, m = J.s.muzzle(this._mz);
      const atGun = Math.hypot(m.x - J.x, -m.z - J.p) < 1.6 && Math.abs(m.y - gy) < 1;
      const sx = atGun ? m.x : J.x + dx * 0.75 + dp * -0.12, sp = atGun ? -m.z : J.p + dp * 0.75 - dx * -0.12;
      this.bullets.push({ x: sx, p: sp, vx: dx * TUNE.bulletSpeed, vp: dp * TUNE.bulletSpeed, life: TUNE.bulletLife, y: atGun ? m.y : gy, y0: atGun ? m.y : gy, y1: gy, d: 0 });
      J.recoil = 1; J.fired = true;
      this.audio.play('shot', { gain: 0.42, pan: this.pan(J.x), variance: 0.08 }, 45);
      J.brass = (J.brass || 0) + 1;
    }
    // grenade
    if (gren && J._g > 0 && J.throwT < 0) {
      J.throwT = 0; J._g--;
      J.throwAim = J.aim; J.throwDist = J.aimDist ? clamp(J.aimDist, 3.5, 13) : TUNE.grenRange;
      J.thrown = false;
    }
    if (J.throwT >= 0) {
      J.throwT += dt / 0.42;
      if (!J.thrown && J.throwT >= 0.55) {
        J.thrown = true;
        const [dx, dp] = dirOf(J.throwAim);
        const d = J.throwDist;
        const h = this.handPos(J.s);
        this.launchNade(h ? h.x : J.x + dx * 0.4, h ? -h.z : J.p + dp * 0.4, h ? h.y : this.T.standY(J.x, J.p) + 1.7, J.x + dx * d, J.p + dp * d, 0.5 + d * 0.035, 'joe');
        this.audio.thunk(this.pan(J.x));
      }
      if (J.throwT >= 1) J.throwT = -1;
    }
    J.recoil = Math.max(0, J.recoil - dt * 10);
    // footsteps: v11 plays them when a foot actually lands (the rig reports it)
    this.syncJoeVisual(dt);
  }

  footfall(J, foot) {
    const wade = this.T.wading(J.x, J.p), deck = this.T.deckY(J.x, J.p) !== null;
    this.audio.step(this.pan(J.x), deck ? 'wood' : 'dirt', deck ? 0.42 : 0.35);
    const f = J.s.bones[foot === 'R' ? 'FootR' : 'FootL'].getWorldPosition(this._fp || (this._fp = new THREE.Vector3()));
    if (wade) this.splash(f.x, -f.z, wade.w.level);
    else if (!deck && this.dusty(J.x, J.p)) this.fx.dust(f.x, this.h(J.x, J.p), f.z, 1, [0.7, 0.6, 0.45], 0.6, 0.3);
  }

  splash(x, p, level) {
    for (let i = 0; i < 4; i++) this.fx.smoke.add({ x: x + (rnd() - 0.5) * 0.5, y: level + 0.05, z: -p + (rnd() - 0.5) * 0.5, vx: (rnd() - 0.5) * 1.5, vy: 1 + rnd() * 1.5, vz: (rnd() - 0.5) * 1.5, life: 0.4, size: 0.12, size1: 0.3, r: 0.75, g: 0.82, b: 0.85, a: 0.6, a1: 0, grav: 7 });
  }
  dusty(x, p) { const w = this.T.biomeWeights(p); return (w.desert || 0) + (w.scrub || 0) + (w.fort || 0) + (w.motor || 0) + (w.ravine || 0) + (w.beach || 0) > 0.4 && !this.world.amb.rain; }

  syncJoeVisual(dt) {
    const J = this.joe, s = J.s;
    s.obj.position.set(J.x, this.T.standY(J.x, J.p), -J.p);
    s.obj.rotation.y = Math.PI - J.leg;
    const tw = -angDiff(J.leg, J.aim);
    if (Math.abs(tw) > 1.2) { J.leg = J.aim + Math.sign(angDiff(J.aim, J.leg)) * 1.2; }
    s.a.twist = clamp(-angDiff(J.leg, J.aim), -1.2, 1.2);
    s.a.speed = J.speedN || 0;
    s.a.moveYaw = J.mvAng != null ? Math.PI - J.mvAng : null;
    s.a.phase += (J.alive ? Math.hypot(J.x - J.px, J.p - J.pp) : 0) * STRIDE;
    s.a.recoil = J.recoil;
    s.a.throwT = J.throwT;
    s.a.dead = J.alive ? 0 : Math.min(1, J.deadT * 2.6);
    s.a.aiming = !!J.fireHeld;
    // v10: his eyes find the nearest threat in front of him
    let look = null, ld = 13;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - J.x, e.p - J.p);
      if (d < ld && Math.abs(angDiff(J.aim, angOf(e.x - J.x, e.p - J.p))) < 1.7) { ld = d; look = e; }
    }
    if (look) { s.a.lookX = look.x; s.a.lookZ = -look.p; } else s.a.lookX = null;
    // invulnerability blink
    s.obj.visible = !J.inside && !(J.alive && J.invuln > 0 && this.state !== 'intro' && Math.floor(this.t * 14) % 2 === 0);
    s.setFlash(J.hurtFlash > 0 ? J.hurtFlash : 0);
    if (J.hurtFlash > 0) J.hurtFlash -= dt * 4;
    s.pose(dt);
    if (s.stepEvt && J.alive && !J.inside) this.footfall(J, s.stepEvt);
    if (J.fired) {
      J.fired = false;
      const m = s.muzzle(this._v);
      const [dx, dp] = dirOf(J.aimFire);
      this.fx.muzzle(m.x, m.y, m.z, dx, -dp);
      if (J.brass % 2 === 0) this.fx.brass(m.x - dx * 0.4, m.y - 0.1, m.z + dp * 0.4, dp, dx);
    }
  }

  damageJoe(n, fromX, fromP) {
    const J = this.joe;
    if (!J.alive || J.invuln > 0 || this.state !== 'play') return;
    if (this.godMode) return;
    J.hp -= n; J.invuln = TUNE.invulnHit; J.hurtFlash = 1; this.stats.hits++;
    const dx = J.x - fromX, dp = J.p - fromP, L = Math.hypot(dx, dp) || 1;
    J.s.flinch(dx, -dp, 1);
    this.R.addShake(0.5, dx / L * 0.25, -dp / L * 0.25);
    this.emit('hurt');
    if (J.hp <= 0) this.killJoe(fromX, fromP);
  }
  killJoe(fx, fp) {
    const J = this.joe;
    J.alive = false; J.deadT = 0; J.hp = 0;
    J.s.a.deadDir = (fp > J.p) ? 1 : -1; J.s.a.deadSpin = rnd() - 0.5;
    // v10: he goes down as a ragdoll, knocked away from whatever got him
    const dx = J.x - fx, dp = J.p - fp, L = Math.hypot(dx, dp) || 1;
    const r = J.s.startRagdoll(ragEnv(this));
    ragSounds(this, r, () => J.x);
    r.push(dx / L * 2.4, 1.2, -dp / L * 2.4, ['mid', 'neck', 'head', 'shL', 'shR']);
    r.push(-dx / L, 0, dp / L, ['knL', 'knR']);
    this.audio.play('player-death', { gain: 0.9 }, 200);
    this.R.addShake(0.8);
    this.state = 'dead'; this.stateT = 0;
    this.chain = 0; this.stats.deaths++;
    this.emit('joe-dead');
  }
  respawnJoe() {
    const J = this.joe;
    this.lives--;
    if (this.lives <= 0) { this.state = 'over'; this.stateT = 0; this.saveHi(); this.carryGren = J._g; this.emit('gameover'); J.deadT = -1e9; return; }
    // clear the air around the respawn point
    this.ebullets = this.ebullets.filter(b => Math.hypot(b.x - J.x, b.p - J.p) > 9);
    for (const n of this.nades) if (n.owner !== 'joe' && Math.hypot(n.tx - J.x, n.tp - J.p) < 6) n.dud = true;
    J.alive = true; J.hp = TUNE.joeHp; J.invuln = TUNE.invulnSpawn; J.deadT = 0; J.throwT = -1;
    J.s.a.dead = 0; J.s.stopRagdoll();
    // stand back up somewhere walkable near where he fell
    const [x, p] = this.col.resolve(J.x, J.p, TUNE.joeRadius + 0.3, 'joe');
    J.x = x; J.p = p; J.px = x; J.pp = p;
    this.state = 'play'; this.stateT = 0;
    this.emit('respawn');
  }

  // ------------------------------------------------------------------ camera
  updateCamera(dt) {
    const J = this.joe, A = this.area;
    if (!Number.isFinite(this.camP)) this.camP = J.p + (Number.isFinite(this.R.offJoe) ? this.R.offJoe : 6);
    if (!Number.isFinite(this.camX)) this.camX = 0;
    this.prevCamP = this.camP;
    // the world ends at the fortress wall; during the gate fight frame the wall
    const cap = A.wallP + 9 + this.R.offTop;
    const target = this.finale ? Math.max(J.p + this.R.offJoe, cap) : J.p + this.R.offJoe;
    if (target > this.camP) this.camP = Math.min(target, this.camP + Math.max(0.5, (target - this.camP) * (this.finale ? 1.5 : 7)) * dt);
    this.camP = Math.min(this.camP, cap);
    // sideways: follow Joe when the corridor is wider than the view
    const hwJ = this.hw(J.p) + 3.5;
    const slack = Math.max(0, hwJ - this.R.halfWidthBottom * 0.92);
    const tx = clamp(J.x * 0.85, -slack, slack);
    this.camX += (tx - this.camX) * Math.min(1, dt * 4);
  }

  // ------------------------------------------------------------------ spawning
  updateSpawns(dt) {
    const A = this.area, top = this.viewTop();
    for (let i = 0; i < A.encounters.length; i++) {
      if (this.encDone.has(i)) continue;
      const e = A.encounters[i];
      const positional = ['place', 'trench', 'sniper', 'mortar', 'bunker', 'ledge', 'searchlight'].includes(e.type) || e.from === 'place';
      const trig = positional ? e.at - 6 : e.at;
      if (top >= trig) { this.encDone.add(i); this.runEncounter(e); }
    }
    // background pressure
    const P = A.patrol;
    if (!this.finale && top > P.from && top < P.to) {
      this.patrolT -= dt * (0.8 + this.diff() * 0.25);
      const alive = this.enemies.filter(e => e.alive && !e.static).length;
      if (this.patrolT <= 0) {
        this.patrolT = P.every * rr(0.8, 1.25);
        if (alive < P.cap + this.loop) {
          const n = 1 + ((rnd() * (2.2 + this.diff() * 0.4)) | 0);
          const type = rnd() < P.types[1][1] ? 'lobber' : 'rifle';
          const side = rnd();
          for (let k = 0; k < n; k++) {
            if (side < 0.7) this.spawnFromNorth(type, clamp(this.T.roadX(top) + rr(-7, 7), -this.hw(top) + 1, this.hw(top) - 1), k * 1.4);
            else this.spawnFromSide(type, side < 0.85 ? -1 : 1, top - rr(3, 9), k * 1.2);
          }
        }
      }
    }
  }

  runEncounter(e) {
    const top = this.viewTop(), W = this.world;
    switch (e.type) {
      case 'rifle': case 'lobber':
        if (e.from === 'north') e.xs.forEach((x, k) => this.spawnFromNorth(e.type, x, k * 0.9, e.ambush));
        else if (e.from === 'east' || e.from === 'west') (e.ps || [top - 5]).forEach((p, k) => this.spawnFromSide(e.type, e.from === 'east' ? 1 : -1, p, k * 0.8));
        else if (e.from === 'place') e.pts.forEach(([x, p]) => {
          const en = this.spawnEnemy(e.type, x, p, { state: e.cover ? 'cover' : 'fight', face: Math.PI });
          if (e.cover) { en.cover = true; en.coverP = p; en.coverX = x; }
          if (e.hut) { en.state = 'enter'; en.tx = x + rr(-2, 2); en.tp = p - 3; }
          if (e.guard) en.guard = true;
          if (e.hold) { en.hold = true; en.static = true; }
        });
        break;
      case 'ledge': e.pts.forEach(([x, p]) => { const en = this.spawnEnemy('lobber', x, p, { state: 'fight', face: Math.PI }); en.hold = true; en.static = true; en.ledge = true; en.fireCd = rr(0.6, 1.4); }); break;
      case 'trench': e.pts.forEach(([x, p]) => { const en = this.spawnEnemy('rifle', x, p, { state: 'trench', face: Math.PI }); en.trench = true; en.static = true; en.t = rr(0.5, 2); en.yOff = 0; en.points = SCORE.trench; }); break;
      case 'sniper': {
        const tw = W.dyn.towers[e.tower]; if (!tw) break;
        const en = this.spawnEnemy('rifle', tw.x, tw.p, { state: 'sniper', face: Math.PI });
        en.sniper = true; en.static = true; en.tower = tw; en.t = rr(1, 2); en.baseY = tw.deckY; en.points = SCORE.sniper;
        break;
      }
      case 'searchlight': {
        const sl = W.dyn.searchlights[e.idx]; if (!sl) break;
        sl.on = true;
        const en = this.spawnEnemy('rifle', sl.x + 0.5, sl.p + 0.4, { state: 'search', face: Math.PI });
        en.static = true; en.elevated = true; en.search = sl; en.baseY = sl.deckY; en.points = SCORE.search; en.fireCd = 1;
        sl.gunner = en;
        break;
      }
      case 'mortar': {
        const pit = W.dyn.pits[e.pit]; if (!pit || !pit.alive) break;
        const en = this.spawnEnemy('mortar', pit.x + 0.7, pit.p + 0.5, { state: 'mortar', face: Math.PI });
        en.type = 'rifle';
        en.mortar = true; en.static = true; en.pit = pit; en.t = 2.2; en.points = SCORE.mortar; en.noBullets = true;
        en.s.a.crouch = 1;
        break;
      }
      case 'bunker': {
        const b = W.dyn.bunkers[e.bunker]; if (!b) break;
        b.active = true; b.t = 2.0; b.burst = 0;
        if (!this.bunkers.includes(b)) this.bunkers.push(b);
        break;
      }
      case 'truck': this.spawnTruck(e.x, e.stopP); break;
      case 'moto': this.spawnMoto(e); break;
      case 'tank': this.spawnTank(e); break;
    }
  }

  spawnFromNorth(type, x, delay = 0, ambush = false) {
    const top = this.viewTop(), wall = this.area.wallP - 1.2;
    let p = top + 3 + delay * 2.5;
    // near the fortress everyone comes out of the gate
    if (p > wall) { p = wall; x = clamp(x, -this.area.gateHalf + 1, this.area.gateHalf - 1); }
    const en = this.spawnEnemy(type, x, p, { state: 'enter', face: Math.PI });
    en.tx = clamp(x + rr(-2.5, 2.5), -this.hw(p) + 1, this.hw(p) - 1);
    en.tp = top - rr(4, ambush ? 6 : 9);
    return en;
  }
  spawnFromSide(type, side, p, delay = 0) {
    const hw = this.hw(p);
    const en = this.spawnEnemy(type, side * (hw + 5 + delay * 2), p, { state: 'enter', face: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
    en.tx = side * (hw - rr(2, 5)); en.tp = p + rr(-2, 2);
    return en;
  }
  // an alarm brings a squad out of the nearest barracks (or down the road)
  raiseAlarm(x, p) {
    let best = null, bd = 30;
    for (const b of this.world.dyn.barracks) { const d = Math.hypot(b.x - x, b.p - p); if (d < bd) { bd = d; best = b; } }
    for (let k = 0; k < 3; k++) {
      if (best) { const en = this.spawnEnemy('rifle', best.x + (k - 1) * 0.8, best.p, { state: 'enter', face: Math.PI }); en.tx = best.x + rr(-5, 5); en.tp = best.p - rr(3, 6); }
      else this.spawnFromNorth('rifle', x + (k - 1) * 2, k * 0.8);
    }
    this.emit('alarm');
  }

  spawnEnemy(type, x, p, o = {}) {
    const s = new Soldier(type === 'lobber' ? 'lobber' : type === 'officer' ? 'officer' : type === 'mortar' ? 'crew' : 'rifle');
    s.ground = this.groundFn();
    this.scene.add(s.obj);
    const e = {
      type, s, x, p, px: x, pp: p, face: o.face ?? Math.PI, state: o.state || 'enter', t: 0,
      hp: 1, alive: true, fireCd: rr(0.35, 0.8) / this.loopK(), tx: x, tp: p, yOff: 0, yCur: 0,
      points: SCORE[type] || 100, stuck: 0,
    };
    this.enemies.push(e);
    return e;
  }

  // ------------------------------------------------------------------ enemies
  hittable(e) {
    if (!e.alive || e.noBullets) return false;
    if (e.trench) return e.yCur > 0.35;
    return true;
  }
  baseY(e) {
    if (e.baseY !== undefined) return e.baseY;
    if (e.bike) return this.h(e.x, e.p) + (e.seatY || 0);
    return this.T.standY(e.x, e.p) + (e.trench ? e.yCur : 0);
  }

  updateEnemies(dt) {
    const J = this.joe;
    this.tokens = this.enemies.filter(e => e.alive && e.token).length;
    for (const e of this.enemies) {
      e.px = e.x; e.pp = e.p;
      if (!e.alive) continue;
      e.t -= dt;
      const dx = J.x - e.x, dp = J.p - e.p, dist = Math.hypot(dx, dp);
      const toJoe = angOf(dx, dp);
      let mvx = 0, mvp = 0, speed = 0;
      const visible = this.onScreen(e.x, e.p, 1);
      // despawn stragglers left far below the screen
      if (e.p < this.viewBottom() - (e.static ? 10 : 6) && e.state !== 'flee' && !e.finale && !e.bike) { this.removeEnemy(e); continue; }
      // v11: too close for a rifle — he kicks
      if (e.state !== 'kick' && KICKERS.has(e.state) && J.alive && this.state === 'play' && dist < 1.35 && (e.kickCd || 0) <= this.t
        && !e.static && !e.bike && !e.trench && !e.mortar && e.baseY === undefined) {
        e.kickFrom = e.state === 'aim' ? 'fight' : e.state; e.token = false;
        e.state = 'kick'; e.t = KICK_T; e.kicked = false; e.kickCd = this.t + 2.6;
      }
      switch (e.state) {
        case 'kick': {
          e.face = toJoe;
          if (!e.kicked && 1 - e.t / KICK_T > 0.42) {
            e.kicked = true;
            if (J.alive && dist < 1.75) {
              this.audio.play('kick-hit', { gain: 0.45, pan: this.pan(J.x), variance: 0.08 }, 100);
              this.damageJoe(1, e.x, e.p);
              const L = dist || 1;
              J.shoveX = dx / L * 6; J.shoveP = dp / L * 6; J.shoveT = 0.22;
              J.s.flinch(dx / L, -dp / L, 1.2);
            }
          }
          if (e.t <= 0) { e.state = e.kickFrom || 'fight'; e.t = rr(0.3, 0.7); }
          break;
        }
        case 'enter': {
          const tdx = e.tx - e.x, tdp = e.tp - e.p, td = Math.hypot(tdx, tdp);
          if (td < 0.5 || e.t < -4) { e.state = e.type === 'lobber' ? 'approach' : 'fight'; e.t = rr(0.3, 1.0); break; }
          mvx = tdx / td; mvp = tdp / td; speed = TUNE.runSpeed; e.face = angOf(mvx, mvp);
          // run-and-gun: a snap shot on the way in once he's been on screen a moment
          if (visible) e.seen = (e.seen || 0) + dt;
          e.fireCd -= dt;
          if (e.type === 'rifle' && e.seen > 0.45 && e.fireCd <= 0 && dist < 17 && J.alive && this.state === 'play' && this.col.los(e.x, e.p, J.x, J.p, 1.4)) {
            e.fireCd = rr(1.4, 2.2); this.enemyFire(e, J, 0.08);
          }
          break;
        }
        case 'fight': case 'approach': case 'cover': {
          e.face = toJoe;
          const want = e.type === 'lobber' ? 8.5 : 11;
          e.fireCd -= dt;
          const los = dist < 24 && this.col.los(e.x, e.p, J.x, J.p, 1.4);
          if (e.state === 'cover') {
            // v11: a quick peek over the top now and then (still covered: a
            // crouch above 0.5 keeps him behind the bags for bullets)
            if (!e.peekAt) e.peekAt = this.t + rr(1.2, 3);
            if (this.t > e.peekAt) { e.peekUntil = this.t + rr(0.35, 0.6); e.peekAt = this.t + rr(2, 4); }
            e.s.a.crouch = approach(e.s.a.crouch, this.t < (e.peekUntil || 0) ? 0.58 : 1, dt * 4);
          } else if (e.t <= 0 && !e.hold) {
            // reposition: close in if far or blind, otherwise sidestep
            e.t = rr(1.6, 3.2);
            let tx, tp;
            if (dist > 17 || !los) { tx = J.x + rr(-5, 5); tp = J.p + rr(want - 2, want + 3); }
            else { tx = e.x + rr(-4, 4); tp = e.p + rr(-1.5, 1.5); }
            if (rnd() < 0.12 * this.loop && e.type === 'rifle' && dist < 16) { e.state = 'charge'; e.t = 2.5; break; }
            const hwp = this.hw(tp) - 1;
            e.tx = clamp(tx, -hwp, hwp); e.tp = Math.max(tp, this.viewBottom() + 5);
            e.moving = true;
          }
          if (e.moving && e.state !== 'cover' && !e.hold) {
            const tdx = e.tx - e.x, tdp = e.tp - e.p, td = Math.hypot(tdx, tdp);
            if (td < 0.4) e.moving = false; else { mvx = tdx / td; mvp = tdp / td; speed = TUNE.walkSpeed * 1.4; }
          }
          if (e.guard && dist > 14) { mvx = 0; mvp = 0; speed = 0; }
          const range = e.ledge ? 15 : 13;
          if (e.fireCd <= 0 && los && visible && dist < 22 && J.alive && this.state === 'play') {
            if (e.type === 'lobber') {
              if (dist < range) { e.state = 'throw'; e.t = 0.75; e.throwAt = { x: J.x + J.vx * 0.5 + rr(-1.2, 1.2), p: J.p + J.vp * 0.5 + rr(-1.2, 1.2) }; e.s.a.throwT = 0; }
            } else if (this.tokens < TUNE.maxAimers + (this.loop > 1 ? 1 : 0)) {
              e.prevState = e.state; e.state = 'aim'; e.t = 0.3; e.token = true; this.tokens++;
              e.burst = rnd() < 0.5 ? 3 : 1;
            }
          }
          break;
        }
        case 'aim': {
          e.face = toJoe; e.s.a.crouch = approach(e.s.a.crouch, 0, dt * 6);
          if (e.t <= 0) { this.enemyFire(e, J); e.burst--; e.t = 0.13; if (e.burst <= 0) { e.state = e.prevState === 'cover' ? 'cover' : 'fight'; e.token = false; e.fireCd = rr(1.1, 2.0) / this.loopK(); e.t = rr(0.2, 0.8); } }
          break;
        }
        case 'charge': {
          e.face = toJoe; mvx = dx / (dist || 1); mvp = dp / (dist || 1); speed = TUNE.runSpeed * 0.9;
          e.fireCd -= dt;
          if (e.fireCd <= 0 && dist < 16 && visible) { e.fireCd = 0.9; this.enemyFire(e, J, 0.12); }
          // v11: a charge carries on into kicking range (the kick check takes it from there)
          if (dist < 1.2 || e.t <= 0) { e.state = 'fight'; e.t = 0.5; }
          break;
        }
        case 'throw': {
          e.face = angOf(e.throwAt.x - e.x, e.throwAt.p - e.p);
          e.s.a.throwT = clamp(1 - e.t / 0.75, 0, 1);
          if (!e.thrown && e.t < 0.3) {
            e.thrown = true;
            const [fx, fp] = dirOf(e.face);
            const d = Math.hypot(e.throwAt.x - e.x, e.throwAt.p - e.p);
            const h = this.handPos(e.s);
            this.launchNade(h ? h.x : e.x + fx * 0.4, h ? -h.z : e.p + fp * 0.4, h ? h.y : this.baseY(e) + 1.7, e.throwAt.x, e.throwAt.p, 0.8 + d * 0.03, 'enemy');
          }
          if (e.t <= 0) { e.state = 'fight'; e.thrown = false; e.s.a.throwT = -1; e.fireCd = rr(2.8, 4.2) / this.loopK(); e.t = rr(0.5, 1.2); }
          break;
        }
        case 'trench': {
          // duck, pop up, aim, fire, duck again
          e.face = toJoe;
          if (e.phase === undefined) e.phase = 'down';
          // yOff: 0 = crouched on the trench floor, 0.6 = up on the firing step
          if (e.phase === 'down') { e.yOff = approach(e.yOff, 0, dt * 4); e.s.a.crouch = approach(e.s.a.crouch, 1, dt * 6); if (e.t <= 0 && visible && dist < 22 && this.state === 'play') { e.phase = 'up'; e.t = 0.35; } }
          else if (e.phase === 'up') { e.yOff = approach(e.yOff, 0.6, dt * 3); e.s.a.crouch = approach(e.s.a.crouch, 0, dt * 5); if (e.t <= 0) { e.phase = 'aim'; e.t = 0.45; } }
          else if (e.phase === 'aim') { if (e.t <= 0) { if (J.alive) this.enemyFire(e, J); e.phase = 'hold'; e.t = rr(0.3, 0.8); } }
          else if (e.phase === 'hold') { if (e.t <= 0) { e.phase = 'down'; e.t = rr(1.2, 2.6) / this.loopK(); } }
          break;
        }
        case 'sniper': this.updateSniper(e, dt, dist); break;
        case 'search': {
          // searchlight gunner: holds fire until the beam finds Joe
          e.face = toJoe; e.fireCd -= dt;
          const sl = e.search;
          if (sl.lock > 0 && e.fireCd <= 0 && dist < 30 && J.alive && this.state === 'play') {
            e.fireCd = 1.25 / this.loopK(); e.burst = 3; e.bt = 0;
          }
          if (e.burst > 0) { e.bt -= dt; if (e.bt <= 0) { e.bt = 0.1; e.burst--; this.enemyFire(e, J, 0.04); } }
          break;
        }
        case 'ride': break;   // positioned by its motorcycle
        case 'dive': {
          const k = 1 - e.t / DIVE_T;
          mvx = e.diveX; mvp = e.diveP; e.face = angOf(e.diveX, e.diveP);
          speed = k < 0.12 ? 1.5 : k < 0.75 ? 4.4 : 1.2;
          if (e.t <= 0) { e.state = e.diveFrom || 'fight'; e.t = rr(0.25, 0.6); }
          break;
        }
        case 'mortar': this.updateMortar(e, dt, dist); break;
        case 'flee': {
          const tdx = e.tx - e.x, tdp = e.tp - e.p, td = Math.hypot(tdx, tdp);
          if (td < 0.8) { this.removeEnemy(e); this.emit('officer-escaped'); continue; }
          mvx = tdx / td; mvp = tdp / td; speed = 5.2; e.face = angOf(mvx, mvp);
          e.fireCd -= dt;
          if (e.fireCd <= 0 && dist < 14) { e.fireCd = 1.3; e.aimOverride = toJoe; this.enemyFire(e, J, 0.15); }
          break;
        }
      }
      // knocked about by a nearby blast
      if (e.shoveT > 0) {
        e.shoveT -= dt;
        const k = Math.max(0, e.shoveT / 0.28);
        const [nx, np] = this.col.move(e.x, e.p, e.x + e.shoveX * k * dt, e.p + e.shoveP * k * dt, 0.38, 'enemy');
        e.x = nx; e.p = np; speed *= 0.3;
      }
      // integrate movement with collision (soldiers wade through the swamp)
      if (speed > 0) {
        if (this.T.wading(e.x, e.p)) speed *= 0.6;
        let nx = e.x + mvx * speed * dt, np = e.p + mvp * speed * dt;
        const lim = this.hw(np) + (e.state === 'enter' || e.state === 'flee' ? 8 : 0.5);
        nx = clamp(nx, -lim, lim);
        [nx, np] = this.col.move(e.x, e.p, nx, np, 0.38, 'enemy');
        [nx, np] = this.resolveVehicles(nx, np, 0.38);
        // soft separation from other soldiers
        for (const o of this.enemies) {
          if (o === e || !o.alive || o.static || o.bike) continue;
          const sx = nx - o.x, sp = np - o.p, d = Math.hypot(sx, sp);
          if (d < 0.8 && d > 1e-4) { nx += sx / d * (0.8 - d) * 0.5; np += sp / d * (0.8 - d) * 0.5; }
        }
        const moved = Math.hypot(nx - e.x, np - e.p);
        if (moved < speed * dt * 0.25) { e.stuck += dt; if (e.stuck > 0.8) { e.t = 0; e.stuck = 0; e.moving = false; if (e.state === 'enter') e.state = 'fight'; } } else e.stuck = 0;
        e.x = nx; e.p = np;
        e.speedN = clamp(moved / dt / TUNE.runSpeed, 0, 1);
      } else if (!e.bike) e.speedN = 0;
    }
    this.enemies = this.enemies.filter(e => e.alive);
  }

  // shooter: anything with x, p (soldier, bunker slit, sidecar gunner)
  enemyFire(e, J, extraErr = 0) {
    const s = e.sniper ? TUNE.eBulletSniper : TUNE.eBullet;
    const dx = J.x - e.x, dp = J.p - e.p, dist = Math.hypot(dx, dp);
    const lead = e.sniper ? 0 : (e.leadK ?? (e.leadK = rr(0.35, 1.0))) * dist / s;
    let a = e.aimOverride ?? angOf(dx + J.vx * lead, dp + J.vp * lead);
    e.aimOverride = null;
    const err = e.sniper ? 0.01 : 0.03 + dist * 0.0025 + extraErr;
    a += (rnd() - 0.5) * 2 * err;
    const [fx, fp] = dirOf(a);
    const y0 = (e.baseY !== undefined ? e.baseY + 1.3 : Math.max(0.9, this.baseY(e) + 1.1));
    this.stats.eshots++;
    // v11: from his muzzle when he has one where we'd expect it
    const m = e.s && e.s.T.gun ? e.s.muzzle(this._mz) : null;
    const atGun = m && Math.hypot(m.x - e.x, -m.z - e.p) < 1.6 && Math.abs(m.y - y0) < 1;
    this.ebullets.push({ x: atGun ? m.x : e.x + fx * 0.7, p: atGun ? -m.z : e.p + fp * 0.7, vx: fx * s, vp: fp * s, life: 2.2, y: atGun ? m.y : y0, y0: atGun ? m.y : y0, y1: y0, d: 0, enemy: true, sniper: !!e.sniper, fromX: e.x, fromP: e.p });
    e.fired = true; if (e.s) e.face = a;
    this.audio.play('shot', { gain: 0.28, rate: e.sniper ? 0.8 : 1.15, pan: this.pan(e.x), variance: 0.1 }, 40);
  }

  updateSniper(e, dt, dist) {
    const J = this.joe;
    e.face = angOf(J.x - e.x, J.p - e.p);
    if (!e.phase) e.phase = 'idle';
    const active = this.onScreen(e.x, e.p, -1) && dist < 26 && J.alive && this.state === 'play';
    if (e.phase === 'idle') { e.laser = 0; if (e.t <= 0 && active) { e.phase = 'track'; e.t = 1.05; } }
    else if (e.phase === 'track') { e.laser = 0.35 + (1.05 - e.t) * 0.3; e.lockX = J.x; e.lockP = J.p; if (!active) e.phase = 'idle'; if (e.t <= 0) { e.phase = 'lock'; e.t = 0.32; } }
    else if (e.phase === 'lock') { e.laser = 0.95; if (e.t <= 0) { e.aimOverride = angOf(e.lockX - e.x, e.lockP - e.p); this.enemyFire(e, { x: e.lockX, p: e.lockP, vx: 0, vp: 0 }); e.phase = 'idle'; e.t = rr(1.8, 2.8); e.laser = 0; } }
  }

  updateMortar(e, dt, dist) {
    const J = this.joe, pit = e.pit;
    if (!pit.alive) { this.killEnemy(e, 0, 0, true); return; }
    // faces the tube while feeding it, Joe otherwise
    e.face = e.drop > 0 ? angOf(pit.x - e.x, pit.p - e.p) : angOf(J.x - e.x, J.p - e.p);
    const active = dist < 30 && dist > 5 && this.onScreen(pit.x, pit.p, 6) && J.alive && this.state === 'play';
    if (e.t <= 0 && active) {
      e.t = rr(3.8, 4.8) / this.loopK();
      const tx = J.x + J.vx * 1.2 + rr(-1.2, 1.2), tp = J.p + J.vp * 1.2 + rr(-1.2, 1.2);
      this.launchNade(pit.x, pit.p, this.h(pit.x, pit.p) + 1.0, tx, tp, 1.9, 'mortar');
      e.s.a.feedT = 0; e.s.a.feedX = pit.x; e.s.a.feedZ = -pit.p; e.drop = 0.5;
      pit.tube.userData.kick = 1;
      const y = this.h(pit.x, pit.p);
      this.fx.muzzle(pit.x, y + 1.0, -pit.p, 0, -1, true);
      this.fx.dust(pit.x, y + 0.9, -pit.p, 4, [0.55, 0.52, 0.48], 1.2, 0.5);
      this.audio.thunk(this.pan(pit.x));
    }
    if (e.drop > 0) e.drop -= dt;
  }

  // where the grenade in a soldier's hand is right now (null if not showing)
  handPos(s) { return s.nade && s.nade.visible ? s.nade.getWorldPosition(this._hv || (this._hv = this._v.clone())) : null; }

  removeEnemy(e) { e.alive = false; e.s.dispose(); if (e.token) this.tokens--; }

  killEnemy(e, fromX, fromP, silent = false, byBlast = false) {
    if (!e.alive) return;
    e.alive = false; e.token = false;
    const a = e.s.a;
    a.deadDir = (fromP > e.p) ? 1 : -1; a.deadSpin = rnd() - 0.5;
    a.throwT = -1; a.crouch = 0; a.sit = 0;
    const by = this.baseY(e), gy = this.T.standY(e.x, e.p);
    const bike = e.bike;
    const corpse = { obj: e.s.obj, s: e.s, t: 0, e, fall: Math.max(0, by - gy), byBlast: byBlast || !!bike, vx: (e.x - fromX) || rnd() - 0.5, vp: (e.p - fromP) || rnd() - 0.5, silent, bike };
    this.corpses.push(corpse);
    delete e.baseY; e.bike = null; a.sit = 0;
    this.kills++;
    this.chain++; this.chainT = 1.8;
    // build v9: pick how he dies — by what hit him and where he stood
    corpse.style = this.forceDeath || pickDeath({ e, fromX, fromP, byBlast: corpse.byBlast, bike: !!bike,
      fall: corpse.fall, water: !e.trench && this.T.openWater(e.x, e.p) > 0.35, chain: this.chain, last: this._lastDeath });
    this._lastDeath = corpse.style;
    this.deathTally = this.deathTally || {};
    this.deathTally[corpse.style] = (this.deathTally[corpse.style] || 0) + 1;
    beginDeath(this, corpse);
    const mult = 1 + Math.min(4, Math.floor(this.chain / 3));
    const pts = e.points * mult;
    this.addScore(pts);
    this.fx.text(e.x, by + 2, -e.p, mult > 1 ? `${pts}  x${mult}` : String(pts), pts >= 1000 ? 'big' : '');
    // occasional supply drop
    const dropP = e.type === 'lobber' && !e.ledge ? 0.45 : e.sniper || e.elevated ? 0 : 0.07;
    if (rnd() < dropP && !e.trench && !e.mortar && this.T.openWater(e.x, e.p) < 0.3) this.dropPickup(e.x, e.p, 'gren');
    if (e.type === 'officer') this.emit('officer-down');
    if (e.search) { e.search.on = false; e.search.lock = 0; }
    // tiny hit-stop sells the kill
    this.hitStop = Math.max(this.hitStop, byBlast ? 0.05 : 0.035);
  }

  updateCorpses(dt) {
    // each corpse runs its own death (deaths.js): stagger, spin, topple, fly,
    // tumble, roll, scorch, splash, fall — then settles and melts away at 7-9s
    for (const c of this.corpses) {
      c.t += dt;
      stepDeath(this, c, dt);
      if (c.t > c.sinkAt + FADE) c.dead = true;
    }
    this.corpses = this.corpses.filter(c => { if (c.dead) c.s.dispose(); return !c.dead; });
    // v11: bodies stay ~24 s (a settled ragdoll is frozen: no CPU cost, no
    // shadow); past 32 the oldest starts fading early rather than vanishing
    // (on an integrated GPU forty bodies on screen start to cost frames)
    // LOW quality (chosen automatically on slow machines) keeps fewer, for less time
    const low = this.R.quality === 'low', cap = low ? 16 : 32;
    const lying = this.corpses.filter(c => c.t < c.sinkAt);
    if (lying.length > cap) lying[0].sinkAt = lying[0].t;
    if (low) for (const c of lying) if (c.sinkAt > SINK_LOW) c.sinkAt = Math.max(SINK_LOW, c.t);
    if (this.corpses.length > cap + 12) this.corpses.shift().s.dispose();
  }

  // ------------------------------------------------------------------ bullets
  updateBullets(dt) {
    const J = this.joe;
    // Joe's rounds
    for (const b of this.bullets) {
      const x0 = b.x, p0 = b.p;
      b.x += b.vx * dt; b.p += b.vp * dt; b.life -= dt;
      if (b.y1 !== undefined) { b.d += Math.hypot(b.vx, b.vp) * dt; b.y = b.y1 + (b.y0 - b.y1) * Math.max(0, 1 - b.d / 4); }
      if (b.life <= 0) { b.dead = true; continue; }
      // v11: rounds passing over bodies make them twitch (a body never stops a round)
      for (const c of this.corpses) {
        if (!c.s.rag || (c.twT || 0) > this.t) continue;
        if (segCircle(x0, p0, b.x, b.p, c.e.x, c.e.p, 0.55) !== null) { c.twT = this.t + 0.15; twitchCorpse(this, c, b.vx, b.vp); }
      }
      // soldiers and vehicles: closest along the segment
      let hitE = null, hitT = 2;
      for (const e of this.enemies) {
        if (!this.hittable(e)) continue;
        const t = segCircle(x0, p0, b.x, b.p, e.x, e.p, e.baseY !== undefined ? 0.7 : HITBOX);
        if (t !== null && t < hitT) { hitT = t; hitE = e; }
        else if (t === null && (e.nearT || 0) < this.t) {
          // a round cracking past makes him flinch away from it
          const sx = b.x - x0, sp = b.p - p0, L2 = sx * sx + sp * sp || 1;
          const u = clamp(((e.x - x0) * sx + (e.p - p0) * sp) / L2, 0, 1);
          const ox = e.x - (x0 + sx * u), op = e.p - (p0 + sp * u), od = Math.hypot(ox, op);
          if (od < 1.0) {
            e.nearT = this.t + 0.7; e.s.flinch(ox / (od || 1), -op / (od || 1), 0.5);
            // v11: pinned — a man up from cover to shoot may duck back down
            if (e.state === 'aim' && e.prevState === 'cover' && rnd() < 0.45) { e.state = 'cover'; e.token = false; e.fireCd = rr(0.8, 1.6) / this.loopK(); e.t = rr(0.4, 1.0); }
          }
        }
      }
      for (const v of this.trucks) { if (v.dead) continue; const t = segBox(x0, p0, b.x, b.p, v); if (t !== null && t < hitT) { hitT = t; hitE = v; } }
      for (const v of this.tanks) { if (v.dead) continue; const t = segBox(x0, p0, b.x, b.p, v); if (t !== null && t < hitT) { hitT = t; hitE = v; } }
      for (const v of this.motos) { if (v.dead) continue; const t = segCircle(x0, p0, b.x, b.p, v.x, v.p, 0.75); if (t !== null && t < hitT) { hitT = t; hitE = v; } }
      let wall = this.col.bulletHit(x0, p0, b.x, b.p);
      // a soldier standing up behind sandbags to shoot is exposed above them
      if (wall && wall.c.cover) {
        for (const e of this.enemies) {
          if (!this.hittable(e) || e.s.a.crouch > 0.5) continue;
          if (Math.hypot(e.x - wall.x, e.p - wall.p) < 1.8 && (e.x - wall.x) * b.vx + (e.p - wall.p) * b.vp > 0) { wall = null; break; }
        }
      }
      if (wall && wall.t < hitT) {
        b.dead = true;
        const c = wall.c;
        this.fx.impact(wall.x, b.y - 0.3, -wall.p, c.water ? 'water' : c.cover ? 'sand' : c.k === 'b' ? 'wood' : 'stone');
        if (c.ref) this.damageProp(c.ref, 1, wall.x, wall.p);
        continue;
      }
      if (hitE) {
        b.dead = true;
        const hx = x0 + (b.x - x0) * hitT, hp = p0 + (b.p - p0) * hitT;
        if (hitE.truck) { this.damageTruck(hitE, 1, hx, hp); continue; }
        if (hitE.tank) { this.fx.impact(hx, this.h(hx, hp) + 1.2, -hp, 'stone'); this.audio.tink(this.pan(hx)); continue; }
        if (hitE.moto) { this.damageMoto(hitE, 1, x0, p0); continue; }
        const L = Math.hypot(b.vx, b.vp);
        this.fx.hit(hx, this.baseY(hitE) + 1.1, -hp, b.vx / L, -b.vp / L);
        hitE.hp--;
        if (hitE.hp <= 0) this.killEnemy(hitE, x0, p0);
        else hitE.flashT = 1;
        continue;
      }
    }
    // rounds that run out of range kick up dirt (or water) where they land
    for (const b of this.bullets) if (b.dead && b.life <= 0) {
      const wf = this.T.openWater(b.x, b.p);
      if (wf > 0.4) this.fx.impact(b.x, this.T.waterAt(b.x, b.p).w.level, -b.p, 'water');
      else this.fx.impact(b.x, this.h(b.x, b.p), -b.p, this.dusty(b.x, b.p) ? 'sand' : 'dirt');
    }
    this.bullets = this.bullets.filter(b => !b.dead);
    // enemy rounds
    for (const b of this.ebullets) {
      const x0 = b.x, p0 = b.p;
      b.x += b.vx * dt; b.p += b.vp * dt; b.life -= dt; b.age = (b.age || 0) + dt;
      if (b.y1 !== undefined) { b.d += Math.hypot(b.vx, b.vp) * dt; b.y = b.y1 + (b.y0 - b.y1) * Math.max(0, 1 - b.d / 4); }
      if (b.life <= 0 || b.p < this.viewBottom() - 4 || b.p > this.viewTop() + 8) { b.dead = true; continue; }
      if (J.alive && segCircle(x0, p0, b.x, b.p, J.x, J.p, 0.42) !== null && J.invuln <= 0 && this.state === 'play') {
        b.dead = true;
        this.fx.hit(J.x, this.T.standY(J.x, J.p) + 1.1, -J.p, b.vx / 14, -b.vp / 14);
        this.damageJoe(1, b.fromX, b.fromP);
        continue;
      }
      // ignore cover right beside the shooter (they fire over their own sandbags)
      const wall = this.col.bulletHit(x0, p0, b.x, b.p);
      if (wall && Math.hypot(wall.x - b.fromX, wall.p - b.fromP) > 1.4) {
        b.dead = true; this.fx.impact(wall.x, b.y - 0.3, -wall.p, wall.c.cover ? 'sand' : 'stone');
      }
    }
    this.ebullets = this.ebullets.filter(b => !b.dead);
  }

  // ------------------------------------------------------------------ grenades & shells
  launchNade(x, p, y, tx, tp, T, owner) {
    const shell = owner === 'mortar' || owner === 'tank';
    const mesh = new THREE.Mesh(shell ? this.shellGeo : this.nadeGeo, shell ? this.shellMat : this.nadeMat);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const ty = this.T.standY(tx, tp);
    const apex = owner === 'mortar' ? 14 : owner === 'tank' ? 1.2 : 2.2 + Math.hypot(tx - x, tp - p) * 0.12;
    const n = { x, p, y, sx: x, sp: p, sy: y, tx, tp, ty, t: 0, T, owner, mesh, apex };
    if (owner !== 'joe') n.ring = this.fx.ring(tx, -tp, ty, owner === 'mortar' ? 2.8 : owner === 'tank' ? 3.0 : 2.4, 0, [1.3, 0.16, 0.08], 'tele');
    n.blob = this.fx.blob(x, -p, this.h(x, p), 0.3);
    this.nades.push(n);
  }

  updateNades(dt) {
    for (const n of this.nades) {
      n.t += dt;
      // v10: men just outside the blast see it coming and dive-roll clear
      // (only ones the blast would miss anyway — it's a reaction, not a dodge)
      if (n.owner === 'joe' && !n.warned && n.T - n.t < 0.5) {
        n.warned = true;
        const r = TUNE.grenRadius;
        for (const e of this.enemies) {
          if (!e.alive || e.static || e.trench || e.mortar || e.bike || e.baseY !== undefined || e.state === 'dive' || e.state === 'flee') continue;
          const dx = e.x - n.tx, dp = e.p - n.tp, d = Math.hypot(dx, dp);
          if (d < r + 0.4 || d > r + 3.6 || rnd() > 0.55) continue;
          e.diveFrom = e.state === 'aim' ? 'fight' : e.state; e.state = 'dive'; e.t = DIVE_T; e.token = false;
          e.diveX = dx / (d || 1); e.diveP = dp / (d || 1); e.face = angOf(e.diveX, e.diveP);
        }
      }
      const k = Math.min(1, n.t / n.T);
      n.x = lerp(n.sx, n.tx, k); n.p = lerp(n.sp, n.tp, k);
      n.y = lerp(n.sy, n.ty + 0.1, k) + Math.sin(k * Math.PI) * n.apex;
      n.mesh.position.set(n.x, n.y, -n.p);
      n.mesh.rotation.x += dt * 12;
      const gh = this.T.standY(n.x, n.p);
      n.blob.position.set(n.x, gh + 0.04, -n.p);
      const bs = 0.25 + 0.2 * (1 - Math.min(1, (n.y - gh) / 6));
      n.blob.scale.set(bs * 2, 1, bs * 2);
      if (k >= 1) {
        n.dead = true;
        this.scene.remove(n.mesh); n.blob.visible = false; if (n.ring) n.ring.visible = false;
        if (!n.dud) this.explode(n.tx, n.tp, n.owner === 'joe' ? TUNE.grenRadius : n.owner === 'mortar' ? 2.8 : n.owner === 'tank' ? 3.0 : 2.5, n.owner);
      }
    }
    this.nades = this.nades.filter(n => !n.dead);
  }

  explode(x, p, r, owner) {
    const y = this.h(x, p);
    const wa = this.T.waterAt(x, p), inWater = wa && wa.m > 0.4 && this.T.deckY(x, p) === null;
    this.fx.explosion(x, inWater ? wa.w.level : y, -p, r, { debris: inWater ? [0.8, 0.9, 1] : this.dusty(x, p) ? [0.55, 0.45, 0.32] : [0.35, 0.28, 0.2] });
    const J = this.joe;
    const dj = Math.hypot(J.x - x, J.p - p);
    this.R.addShake(clamp(1.1 - dj / 22, 0.15, 0.9) * (r > 3 ? 1 : 0.8));
    this.audio.play('explosion', { gain: clamp(1.2 - dj / 30, 0.3, 1), pan: this.pan(x) }, 40);
    this.emit('boom', { x, p });
    const byJoe = owner === 'joe' || owner === 'barrel' || owner === 'truck' || owner === 'bunker' || owner === 'tankwreck';
    // soldiers (elevated ones only from a close blast)
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.p - p);
      if (e.mortar && e.pit && Math.hypot(e.pit.x - x, e.pit.p - p) < r + 0.8 && owner !== 'mortar') { e.pit.alive = false; e.pit.tube.visible = false; this.killEnemy(e, x, p, false, true); continue; }
      if (e.baseY !== undefined && !e.bike) { if (d < r * 0.8 && owner !== 'mortar' && owner !== 'tank') this.killEnemy(e, x, p, false, true); continue; }
      if (d < r + 0.2) this.killEnemy(e, x, p, false, true);
      else if (d < r + 3.4 && !e.bike) {
        // v10: rocked by the blast — flinch, a shove, and a moment before he fires again
        const k = 1 - (d - r - 0.2) / 3.2, ux = (e.x - x) / (d || 1), up = (e.p - p) / (d || 1);
        e.s.flinch(ux, -up, 0.6 + k * 0.6);
        if (!e.static && !e.trench && e.baseY === undefined) { e.shoveX = ux * (2 + k * 4); e.shoveP = up * (2 + k * 4); e.shoveT = 0.28; }
        e.fireCd = Math.max(e.fireCd || 0, 0.45 + k * 0.4);
      }
    }
    for (const c of this.corpses) blastCorpse(this, c, x, p, r);
    if (J.alive && dj < r + 4 && dj > 0.3) J.s.flinch((J.x - x) / dj, -(J.p - p) / dj, clamp(1.2 - (dj - r) / 4, 0.3, 1));
    if (!byJoe || owner === 'barrel' || owner === 'tankwreck') {
      if (dj < r * 0.85 && J.alive) this.damageJoe(owner === 'barrel' ? 2 : 1, x, p);
    }
    // vehicles, bunkers, barrels, crates
    for (const v of this.trucks) if (!v.dead && Math.hypot(v.x - x, v.p - p) < r + 2.2) this.damageTruck(v, 99, x, p);
    for (const v of this.motos) if (!v.dead && Math.hypot(v.x - x, v.p - p) < r + 0.8) this.damageMoto(v, 99, x, p);
    if (byJoe) for (const v of this.tanks) if (!v.dead && Math.hypot(v.x - x, v.p - p) < r + 2.6) this.damageTank(v, x, p);
    for (const b of this.bunkers) {
      if (!b.alive || !byJoe) continue;
      if (Math.hypot(b.x - x, b.p - p) < r + 2.2) { b.hp--; this.fx.dust(b.x, this.h(b.x, b.p) + 1, -b.p, 6, [0.6, 0.58, 0.54], 2, 0.8); if (b.hp <= 0) this.destroyBunker(b); }
    }
    for (const b of this.world.dyn.barrels) if (b.alive && Math.hypot(b.x - x, b.p - p) < r + (b.big ? 2 : 0.3)) this.damageProp({ barrel: b }, 99, x, p, 0.12);
    for (const c of this.world.dyn.crates) if (c.mesh.visible && Math.hypot(c.x - x, c.p - p) < r) this.damageProp({ crate: c }, 99, x, p);
  }

  damageProp(ref, n, x, p, delay = 0) {
    if (ref.barrel) {
      const b = ref.barrel; if (!b.alive) return;
      b.hp -= n;
      if (b.hp <= 0) {
        b.alive = false; b.c.alive = false; b.mesh.visible = false;
        if (b.red) setTimeout(() => {
          if (!this.world.dyn.barrels.includes(b)) return;
          this.explode(b.x, b.p, b.r || 3.1, 'barrel');
          if (b.big) this.fx.burn(b.x, this.h(b.x, b.p) + 0.4, -b.p, 11, 1.5);      // fuel tanks keep burning
        }, delay * 1000 + 60);
        else this.fx.dust(b.x, this.h(b.x, b.p), -b.p, 4);
      }
    } else if (ref.crate) {
      const c = ref.crate; if (!c.mesh.visible) return;
      c.hp -= n;
      if (c.hp <= 0) {
        c.mesh.visible = false; if (c.c) c.c.alive = false;
        const y = this.h(c.x, c.p);
        for (let i = 0; i < 10; i++) this.fx.debris.push({ x: c.x, y: y + 0.5, z: -c.p, vx: (rnd() - 0.5) * 5, vy: 2 + rnd() * 4, vz: (rnd() - 0.5) * 5, s: [0.4, 0.04, 0.1], rx: rnd() * 6, ry: rnd() * 6, spin: 9, life: 2, col: [0.55, 0.42, 0.28], bounce: 0.3 });
        this.fx.dust(c.x, y, -c.p, 4);
        if (!c.stacked && rnd() < 0.65) this.dropPickup(c.x, c.p, rnd() < 0.7 ? 'gren' : 'med');
      }
    }
  }

  destroyBunker(b) {
    b.alive = false; b.active = false;
    this.explode(b.x, b.p + 0.5, 4.2, 'bunker');
    b.group.scale.set(1, 0.45, 1);
    b.group.traverse(o => { if (o.material && o.material.color) { o.userData.baseCol = o.userData.baseCol || o.material.color.clone(); o.material = o.material.clone(); o.material.color.multiplyScalar(0.35); } });
    this.addScore(SCORE.bunker);
    this.fx.text(b.x, this.h(b.x, b.p) + 3, -b.p, String(SCORE.bunker), 'big');
  }

  updateBunkers(dt) {
    const J = this.joe;
    for (const b of this.bunkers) {
      if (!b.alive || !b.active) continue;
      b.t -= dt;
      const dist = Math.hypot(J.x - b.x, J.p - b.p);
      const inFront = J.p < b.p + 1;
      if (b.burst > 0) {
        b.bt -= dt;
        if (b.bt <= 0) {
          b.bt = 0.085; b.burst--;
          const base = angOf(J.x - b.x, J.p - b.p);
          const a = base + (b.burst - 2) * 0.11 + (rnd() - 0.5) * 0.05;
          const [fx, fp] = dirOf(a);
          const sx = b.x + fx * 2.2, sp = b.p + fp * 2.2;
          this.ebullets.push({ x: sx, p: sp, vx: fx * 15, vp: fp * 15, life: 2, y: this.h(b.x, b.p) + 1.15, enemy: true, fromX: sx, fromP: sp });
          this.fx.muzzle(sx, this.h(b.x, b.p) + 1.15, -sp, fx, -fp);
          this.audio.play('shot', { gain: 0.3, rate: 0.9, pan: this.pan(b.x) }, 40);
        }
      } else if (b.t <= 0 && dist < 21 && inFront && J.alive && this.state === 'play' && this.onScreen(b.x, b.p, 0)) {
        b.t = rr(2.3, 3.0); b.burst = 5; b.bt = 0.45;
        // warning glint at the slit
        this.fx.light(b.x, this.h(b.x, b.p) + 1.2, -(b.p - 1.9), 8, 0.4, 0xff5030);
      }
    }
  }

  // ------------------------------------------------------------------ vehicles
  updateVehicles(dt) {
    this.updateTrucks(dt);
    this.updateTanks(dt);
    this.updateMotos(dt);
    this.updateBunkers(dt);
    // mortar tube kick animation
    for (const pit of this.world.dyn.pits) { const k = pit.tube.userData.kick || 0; if (k > 0) { pit.tube.userData.kick = Math.max(0, k - dt * 5); pit.tube.position.y = this.h(pit.x, pit.p) - k * 0.12; } }
  }
  resolveVehicles(x, p, r) {
    for (const v of this.trucks) { if (v.static) continue; const d = boxPush(v, x, p, r); if (d) { x += d[0]; p += d[1]; } }
    for (const v of this.tanks) { if (v.static) continue; const d = boxPush(v, x, p, r); if (d) { x += d[0]; p += d[1]; } }
    return [x, p];
  }

  spawnTruck(x, stopP) {
    const mesh = M2.militaryTruckGroup();
    const top = this.viewTop();
    const tr = { truck: true, x, p: top + 14, stopP: Math.min(stopP, top - 3), state: 'drive', t: 0, hp: 12, mesh, cargo: 4, hw: 1.15, hl: 3.2, speed: 8, dead: false };
    this.scene.add(mesh);
    this.trucks.push(tr);
  }
  updateTrucks(dt) {
    for (const tr of this.trucks) {
      if (tr.dead) { tr.mesh.position.set(tr.x, this.h(tr.x, tr.p), -tr.p); continue; }
      tr.t += dt;
      if (tr.state === 'drive') {
        const rem = tr.p - tr.stopP;
        tr.speed = Math.min(8, Math.max(0.6, rem * 1.2));
        tr.p -= tr.speed * dt;
        tr.x = lerp(tr.x, this.T.roadX(tr.p), dt * 2);
        if (rem < 0.05) { tr.state = 'unload'; tr.t = 0; }
      } else if (tr.state === 'unload') {
        if (tr.cargo > 0 && tr.t > 0.5) {
          tr.t = 0.15; tr.cargo--;
          const side = tr.cargo % 2 ? 1 : -1;
          const en = this.spawnEnemy('rifle', tr.x + side * 0.6, tr.p + tr.hl + 0.4, { state: 'enter' });
          en.tx = tr.x + side * rr(3, 7); en.tp = tr.p + rr(-2, 3);
        } else if (tr.cargo <= 0 && tr.t > 2.5) { tr.state = 'leave'; tr.t = 0; }
      } else if (tr.state === 'leave') {
        // back out fast: it must never trail along the road in front of Joe
        tr.p += Math.min(11, 2 + tr.t * 5) * dt;
        tr.x = lerp(tr.x, this.T.roadX(tr.p), dt * 2);
        if (tr.p > this.viewTop() + 10 || tr.t > 9) { tr.gone = true; disposeObj(tr.mesh); }
      }
      tr.mesh.position.set(tr.x, this.h(tr.x, tr.p) + Math.sin(tr.t * 30) * 0.015 * (tr.state === 'unload' ? 0.3 : 1), -tr.p);
    }
    this.trucks = this.trucks.filter(t => !t.gone);
  }
  damageTruck(tr, n, x, p) {
    if (tr.dead) return;
    tr.hp -= n;
    this.fx.impact(x, this.h(x, p) + 1, -p, 'stone');
    if (tr.hp <= 0) {
      tr.dead = true;
      this.explode(tr.x, tr.p, 4.2, 'truck');
      this.fx.burn(tr.x, this.h(tr.x, tr.p) + 1.3, -tr.p, 10, 1.1);
      darken(tr.mesh, 0.25);
      tr.mesh.rotation.z = 0.08;
      this.addScore(SCORE.truck + tr.cargo * 100);
      this.fx.text(tr.x, this.h(tr.x, tr.p) + 3, -tr.p, String(SCORE.truck + tr.cargo * 100), 'big');
      this.col.add({ k: 'b', x: tr.x, p: tr.p, hw: tr.hw, hp: tr.hl, bul: true });
      tr.static = true;
    }
  }

  // --- tank: rolls in, turret tracks Joe, lobs telegraphed shells; grenades only
  spawnTank(e) {
    const g = M2.tankGroup();
    // own materials: the hit flash must not light up every prop sharing MAT.vc
    g.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.userData.own = true; } });
    const top = this.viewTop();
    const path = e.path.map(([x, p], i) => [x, i === 0 && p === 0 ? top + 14 : p]);
    const tk = { tank: true, x: path[0][0], p: path[0][1], path, pi: 1, face: Math.PI, turret: Math.PI, hp: 3, fireCd: 2.4, recoil: 0, mesh: g, hw: 1.75, hl: 2.9, dead: false, t: 0, flash: 0 };
    this.scene.add(g);
    this.tanks.push(tk);
    this.emit('tank');
  }
  updateTanks(dt) {
    const J = this.joe;
    for (const tk of this.tanks) {
      const U = tk.mesh.userData;
      if (tk.dead) { tk.mesh.position.set(tk.x, this.h(tk.x, tk.p), -tk.p); continue; }
      tk.t += dt;
      const tgt = tk.path[tk.pi];
      if (tgt) {
        const dx = tgt[0] - tk.x, dp = tgt[1] - tk.p, d = Math.hypot(dx, dp);
        if (d < 0.3) tk.pi++;
        else {
          const want = angOf(dx, dp);
          tk.face += clamp(angDiff(tk.face, want), -0.8 * dt, 0.8 * dt);
          const sp = Math.min(3.2, d * 0.8);
          tk.x += Math.sin(tk.face) * sp * dt; tk.p += Math.cos(tk.face) * sp * dt;
          tk.moving = true;
        }
      } else tk.moving = false;
      // crush anyone in the way
      if (J.alive && tk.moving && Math.hypot(J.x - tk.x, J.p - tk.p) < 2.2) this.damageJoe(1, tk.x, tk.p);
      // turret
      const toJ = angOf(J.x - tk.x, J.p - tk.p), dist = Math.hypot(J.x - tk.x, J.p - tk.p);
      tk.turret += clamp(angDiff(tk.turret, toJ), -0.95 * dt, 0.95 * dt);
      tk.fireCd -= dt;
      // only fires once the whole tank is in view
      if (tk.fireCd <= 0 && Math.abs(angDiff(tk.turret, toJ)) < 0.1 && dist < 26 && dist > 4 && J.alive && this.state === 'play' && tk.p < this.viewTop() - 2 && tk.p > this.viewBottom()) {
        tk.fireCd = rr(2.6, 3.4) / this.loopK(); tk.recoil = 1;
        const [fx, fp] = dirOf(tk.turret);
        const mx = tk.x + fx * 3.4, mp = tk.p + fp * 3.4, my = this.h(tk.x, tk.p) + 2.1;
        this.launchNade(mx, mp, my, J.x + J.vx * 0.8 + rr(-0.8, 0.8), J.p + J.vp * 0.8 + rr(-0.8, 0.8), 1.1, 'tank');
        this.fx.muzzle(mx, my, -mp, fx, -fp, true);
        this.fx.light(mx, my, -mp, 30, 0.2, 0xffa050);
        this.fx.dust(mx, my - 1.5, -mp, 6, [0.5, 0.47, 0.42], 2.5, 0.8);
        this.R.addShake(0.3);
        this.audio.boom(this.pan(tk.x));
      }
      tk.recoil = Math.max(0, tk.recoil - dt * 3);
      if (tk.flash > 0) tk.flash -= dt * 3;
      // treads kick up dirt
      if (tk.moving && rnd() < 0.3) this.fx.dust(tk.x + (rnd() - 0.5) * 3, this.h(tk.x, tk.p), -(tk.p + 2.5), 1, [0.55, 0.48, 0.38], 0.8, 0.6);
      tk.mesh.position.set(tk.x, this.h(tk.x, tk.p) + (tk.moving ? Math.sin(tk.t * 22) * 0.015 : 0), -tk.p);
      tk.mesh.rotation.y = Math.PI - tk.face;
      U.turret.rotation.y = tk.face - tk.turret;
      U.barrel.position.z = 1.0 - tk.recoil * 0.45;
    }
  }
  damageTank(tk, x, p) {
    if (tk.dead) return;
    tk.hp--; tk.flash = 1;
    this.fx.dust(tk.x, this.h(tk.x, tk.p) + 1.5, -tk.p, 6, [0.3, 0.3, 0.3], 2, 0.9);
    this.fx.text(tk.x, this.h(tk.x, tk.p) + 3.4, -tk.p, tk.hp > 0 ? `ARMOUR ${'■'.repeat(tk.hp)}` : '');
    if (tk.hp <= 0) {
      tk.dead = true;
      this.explode(tk.x, tk.p, 4.8, 'tankwreck');
      this.fx.burn(tk.x, this.h(tk.x, tk.p) + 1.7, -tk.p, 14, 1.2);
      darken(tk.mesh, 0.22);
      tk.mesh.userData.turret.rotation.z = 0.25; tk.mesh.userData.turret.position.y += 0.3;
      this.addScore(SCORE.tank);
      this.fx.text(tk.x, this.h(tk.x, tk.p) + 3.6, -tk.p, String(SCORE.tank), 'big');
      this.col.add({ k: 'c', x: tk.x, p: tk.p, r: 2.4, bul: true });
      tk.static = true;
      this.emit('tank-down');
    }
  }

  // --- motorcycle with sidecar: charges through, the gunner sprays, and a
  // rider hit or a grenade puts it down
  spawnMoto(e) {
    const top = this.viewTop();
    let x, p, vx = 0, vp = 0;
    if (e.from === 'north') { p = top + 12; x = e.x ?? this.T.roadX(p); vp = -10.5; }
    else { p = e.p; const hw = this.hw(p); x = e.from === 'east' ? hw + 12 : -(hw + 12); vx = e.from === 'east' ? -11 : 11; }
    const mesh = M2.motoGroup();
    this.scene.add(mesh);
    const mo = { moto: true, x, p, vx, vp, hp: 3, mesh, dead: false, t: 0, fireCd: 0.9, lane: vx ? p : x };
    for (const seat of ['rider', 'gunner']) {
      const en = this.spawnEnemy('rifle', x, p, { state: 'ride' });
      en.bike = mo; en.seat = seat; en.s.a.sit = 1; en.points = 150;
      mo[seat] = en;
    }
    this.motos.push(mo);
    this.emit('moto');
  }
  updateMotos(dt) {
    const J = this.joe;
    for (const mo of this.motos) {
      mo.t += dt;
      if (mo.dead) {
        mo.vx *= Math.pow(0.1, dt); mo.vp *= Math.pow(0.1, dt);
        mo.x += mo.vx * dt; mo.p += mo.vp * dt;
        mo.mesh.position.set(mo.x, this.h(mo.x, mo.p), -mo.p);
        if (mo.t > 12 || mo.p < this.viewBottom() - 8) mo.gone = true;
        continue;
      }
      // steer around anything in the lane
      const sp = Math.hypot(mo.vx, mo.vp), fx = mo.vx / sp, fp = mo.vp / sp;
      const ahead = (ox) => !this.col.blocked(mo.x + fx * 3 + (fp ? ox : 0), mo.p + fp * 3 + (fx ? ox : 0), 0.8, 'enemy');
      if (!ahead(0)) {
        for (const o of [1.4, -1.4, 2.8, -2.8]) if (ahead(o)) { if (fp) mo.x += Math.sign(o) * 4 * dt; else mo.p += Math.sign(o) * 4 * dt; break; }
      }
      mo.x += mo.vx * dt; mo.p += mo.vp * dt;
      if (this.col.blocked(mo.x, mo.p, 0.6, 'enemy')) { this.damageMoto(mo, 99, mo.x - fx, mo.p - fp); continue; }
      // run Joe down
      if (J.alive && Math.hypot(J.x - mo.x, J.p - mo.p) < 1.1) this.damageJoe(1, mo.x - fx * 2, mo.p - fp * 2);
      // the sidecar gunner
      const g = mo.gunner;
      mo.fireCd -= dt;
      if (g && g.alive && mo.fireCd <= 0 && this.onScreen(mo.x, mo.p, 0) && Math.hypot(J.x - mo.x, J.p - mo.p) < 18 && J.alive && this.state === 'play') {
        mo.fireCd = 0.55 / this.loopK(); this.enemyFire(g, J, 0.1);
      }
      // off the far side
      const hw = this.hw(mo.p);
      if ((mo.vp < 0 && mo.p < this.viewBottom() - 10) || (mo.vx < 0 && mo.x < -(hw + 16)) || (mo.vx > 0 && mo.x > hw + 16)) {
        mo.gone = true;
        for (const s of ['rider', 'gunner']) if (mo[s] && mo[s].alive) this.removeEnemy(mo[s]);
        continue;
      }
      // engine rumble
      if (rnd() < 0.2) this.fx.dust(mo.x - fx * 1, this.h(mo.x, mo.p) + 0.2, -(mo.p - fp * 1), 1, [0.5, 0.45, 0.38], 0.5, 0.4);
    }
    // place the bikes and their riders
    for (const mo of this.motos) {
      if (mo.dead || mo.gone) continue;
      const head = angOf(mo.vx, mo.vp), y = this.h(mo.x, mo.p);
      mo.mesh.position.set(mo.x, y, -mo.p);
      mo.mesh.rotation.y = Math.PI - head;
      mo.mesh.rotation.z = Math.sin(mo.t * 7) * 0.03;
      mo.mesh.updateMatrixWorld();
      for (const seat of ['rider', 'gunner']) {
        const en = mo[seat]; if (!en || !en.alive) continue;
        this._v.copy(mo.mesh.userData[seat]).applyMatrix4(mo.mesh.matrixWorld);
        en.x = this._v.x; en.p = -this._v.z; en.seatY = this._v.y - y;
        if (seat === 'rider') en.face = head;
        else en.face = angOf(J.x - en.x, J.p - en.p);
      }
    }
    this.motos = this.motos.filter(m => { if (m.gone) disposeObj(m.mesh); return !m.gone; });
  }
  damageMoto(mo, n, fx, fp) {
    if (mo.dead) return;
    mo.hp -= n;
    if (mo.hp > 0 && mo.rider && mo.rider.alive && n < 99) { mo.rider.flashT = 1; return; }
    mo.dead = true; mo.t = 0;
    this.audio.play('bike-crash', { gain: 0.55, pan: this.pan(mo.x) }, 120);
    this.explode(mo.x, mo.p, 2.2, 'moto');
    this.fx.burn(mo.x, this.h(mo.x, mo.p) + 0.5, -mo.p, 5, 0.6);
    for (const s of ['rider', 'gunner']) if (mo[s] && mo[s].alive) this.killEnemy(mo[s], fx, fp, true, true);
    darken(mo.mesh, 0.3); mo.mesh.rotation.z = 1.2;
    this.addScore(SCORE.moto);
    this.fx.text(mo.x, this.h(mo.x, mo.p) + 2.6, -mo.p, String(SCORE.moto), 'big');
  }

  // ------------------------------------------------------------------ searchlights
  updateSearchlights(dt) {
    const J = this.joe;
    for (const sl of this.world.dyn.searchlights) {
      if (!sl.on) { sl.lock = 0; continue; }
      sl.t += dt;
      if (sl.lock > 0) {
        sl.lock -= dt;
        sl.tx = lerp(sl.tx, J.x, Math.min(1, dt * 3)); sl.tp = lerp(sl.tp, J.p, Math.min(1, dt * 3));
      } else {
        sl.tx = lerp(sl.tx, sl.sx + Math.sin(sl.t * 0.6) * sl.half, Math.min(1, dt * 2));
        sl.tp = lerp(sl.tp, sl.sp + Math.cos(sl.t * 0.41) * 3.5, Math.min(1, dt * 2));
      }
      // caught in the beam: the tower opens up, and the first time the alarm goes
      if (J.alive && this.state === 'play' && Math.hypot(J.x - sl.tx, J.p - sl.tp) < 2.6) {
        sl.lock = 1.6;
        if (!sl.alarmed) { sl.alarmed = true; this.raiseAlarm(sl.x, sl.p); }
      }
    }
  }

  // ------------------------------------------------------------------ POWs & pickups
  updatePows(dt) {
    const J = this.joe;
    for (const w of this.pows) {
      const s = w.s;
      w.t += dt;
      if (w.state === 'tied') {
        s.a.crouch = 1; s.a.speed = 0;
        if (J.alive && Math.hypot(J.x - w.x, J.p - w.p) < 1.3) {
          w.state = 'free'; w.t = 0; w.cheer = 0;
          this.reachFor(w.x, this.T.standY(w.x, w.p) + 0.7, w.p);
          this.audio.play('pow-cheer', { gain: 0.5, pan: this.pan(w.x), variance: 0.08 }, 300);
          this.rescued++;
          this.addScore(SCORE.pow);
          J._g = Math.min(TUNE.grenMax, J._g + 2);
          this.fx.text(w.x, this.h(w.x, w.p) + 2.4, -w.p, 'RESCUED +500', 'big');
          this.audio.play('ready', { gain: 0.6 }, 100);
          this.emit('pow');
        }
      } else if (w.state === 'caged') {
        s.a.crouch = 1; s.a.speed = 0;
        const c = w.cage;
        if (!c.open && J.alive && Math.hypot(J.x - c.x, J.p - (c.p - 1.7)) < 1.6) this.openCage(c);
        if (c.open) { w.state = 'leaving'; w.t = -0.3 * (w.i - 100); }
      } else if (w.state === 'leaving') {
        // file out through the cage door, then run for it
        s.a.crouch = approach(s.a.crouch, 0, dt * 3);
        if (w.t > 0.4) {
          const c = w.cage, dx = c.x - w.x, dp = (c.p - 2.2) - w.p, d = Math.hypot(dx, dp);
          if (d < 0.3) { w.state = 'free'; w.t = 1; w.cheer = -0.25 * (w.i % 4); }
          else { w.face = angOf(dx, dp); s.a.speed = 0.8; w.x += dx / d * 3 * dt; w.p += dp / d * 3 * dt; s.a.phase += 3 * dt * STRIDE; }
        }
      } else if (w.state === 'free') {
        s.a.crouch = approach(s.a.crouch, 0, dt * 3);
        // v11: a wave to Joe before running for it
        if (w.cheer !== undefined && w.cheer < 1.3) {
          w.cheer += dt; s.a.speed = 0;
          if (w.cheer > 0) { w.face = angOf(J.x - w.x, J.p - w.p); s.a.dwave = clamp(w.cheer / 1.3, 0, 1); }
          if (w.cheer >= 1.3) { s.a.dwave = -1; w.t = Math.max(w.t, 0.6); }
        } else if (w.t > 0.6) {
          s.a.speed = 1; w.face = Math.PI;
          w.p -= 5 * dt; s.a.phase += 5 * dt * STRIDE;
          if (w.p < this.viewBottom() - 3) { w.state = 'gone'; s.dispose(); }
        }
      }
      if (w.state !== 'gone') {
        s.obj.position.set(w.x, this.T.standY(w.x, w.p), -w.p);
        s.obj.rotation.y = Math.PI - w.face;
        s.pose(dt);
      }
    }
    for (const c of this.world.dyn.cages) if (c.open && c.openT < 1) { c.openT = Math.min(1, c.openT + dt * 2); c.door.rotation.y = -c.openT * 1.9; }
  }
  // v11: Joe's right hand goes out to a latch or a prisoner's ropes
  reachFor(x, y, p) { const a = this.joe.s.a; if (a.throwT >= 0) return; a.reachT = 0; a.reachX = x; a.reachY = y; a.reachZ = -p; }
  openCage(c) {
    c.open = true; c.openT = 0; c.doorCol.alive = false;
    this.reachFor(c.x, this.T.standY(c.x, c.p - 1.7) + 1.0, c.p - 1.6);
    this.audio.play('pow-cheer', { gain: 0.55, pan: this.pan(c.x), variance: 0.05 }, 300);
    const n = c.n;
    this.rescued += n;
    this.addScore(SCORE.pow * n);
    this.joe._g = Math.min(TUNE.grenMax, this.joe._g + 2);
    this.fx.text(c.x, this.h(c.x, c.p) + 2.8, -c.p, `PRISONERS FREED x${n}  +${SCORE.pow * n}`, 'big');
    this.audio.play('ready', { gain: 0.6 }, 100);
    this.emit('pow');
  }

  dropPickup(x, p, kind) {
    const mesh = new THREE.Mesh(this.pickupGeo[kind], this.pickupMat[kind]);
    mesh.scale.setScalar(0.42); mesh.castShadow = true;
    this.scene.add(mesh);
    this.pickups.push({ x, p, kind, t: 0, mesh });
  }
  updatePickups(dt) {
    const J = this.joe;
    for (const k of this.pickups) {
      k.t += dt;
      const y = this.T.standY(k.x, k.p);
      k.mesh.position.set(k.x, y + 0.08 + Math.sin(k.t * 4) * 0.08, -k.p);
      k.mesh.rotation.y += dt * 1.6;
      k.mesh.visible = k.t < 11 || Math.floor(k.t * 8) % 2 === 0;
      if (J.alive && Math.hypot(J.x - k.x, J.p - k.p) < 1.1) {
        k.dead = true;
        if (k.kind === 'gren') { J._g = Math.min(TUNE.grenMax, J._g + 3); this.fx.text(k.x, y + 1.6, -k.p, '+3 GRENADES'); }
        else { J.hp = Math.min(TUNE.joeHp, J.hp + 1); this.fx.text(k.x, y + 1.6, -k.p, '+1 HEALTH'); }
        this.audio.tink(this.pan(k.x));
      }
      if (k.t > 14 || k.p < this.viewBottom() - 4) k.dead = true;
    }
    this.pickups = this.pickups.filter(k => { if (k.dead) this.scene.remove(k.mesh); return !k.dead; });
  }

  // ------------------------------------------------------------------ finale
  updateFinale(dt) {
    const A = this.area, J = this.joe, F = A.finale;
    if (!this.finale) {
      if (J.p >= F.triggerP) {
        this.finale = { phase: 'open', t: 0, wave: 0, alive: 0, spawnQ: 0, spawnT: 0, officer: null };
        this.emit('finale');
      }
      return;
    }
    const f = this.finale;
    f.t += dt;
    const doors = this.world.dyn.doors;
    if (f.phase === 'open') {
      const k = Math.min(1, f.t / 1.4);
      doors[0].rotation.y = -k * 1.7; doors[1].rotation.y = k * 1.7;
      if (f.t > 1.4) { f.phase = 'waves'; f.t = 0; }
    } else if (f.phase === 'waves') {
      if (f.spawnQ > 0) {
        f.spawnT -= dt;
        if (f.spawnT <= 0) {
          f.spawnT = 0.38; f.spawnQ--;
          const e = this.spawnEnemy(rnd() < 0.2 ? 'lobber' : 'rifle', rr(-2.6, 2.6), A.wallP - 0.6, { state: 'enter' });
          e.finale = true; e.tx = rr(-12, 12); e.tp = A.wallP - rr(4, 11);
        }
      } else if ((f.alive = this.enemies.filter(e => e.alive && e.finale).length) <= 1 || f.t > 14) {
        if (f.wave < F.waves.length) { f.spawnQ = F.waves[f.wave] + (this.loop - 1); f.wave++; f.t = 0; }
        else if (F.officer && !f.officerDone) {
          f.officerDone = true;
          const side = rnd() < 0.5 ? -1 : 1;
          const o = this.spawnEnemy('officer', 0, A.wallP - 0.6, { state: 'flee' });
          o.tx = side * (this.hw(A.wallP - 6) + 7); o.tp = A.wallP - 7; o.finale = true; o.fireCd = 1;
          f.officer = o;
          this.emit('officer');
        } else if (f.alive <= 0 || f.t > 25) { f.phase = 'done'; this.world.gateCol.alive = false; this.emit('gate-open'); }
      }
    } else if (f.phase === 'done') {
      if (J.p > A.wallP + 0.8 && this.state === 'play') {
        this.state = 'clear'; this.stateT = 0;
        const bonus = 3000 + this.rescued * 1000 + (A.last ? 10000 : 0);
        this.addScore(bonus);
        this.saveHi();
        this.carryGren = J._g;
        this.emit('clear', { bonus, last: !!A.last });
      }
    }
  }

  // ------------------------------------------------------------------ scoring
  addScore(n) {
    if (this.demo) return;
    this.score += n;
    if (this.score >= this.nextLife) { this.lives++; this.nextLife += 40000; this.emit('extra-life'); }
    if (this.score > this.hi && !this.showcase) this.hi = this.score;
  }
  loadHi() { try { return +(localStorage.getItem('commandoHD3d.hi') || 50000); } catch (e) { return 50000; } }
  saveHi() { if (this.demo || this.showcase) return; try { localStorage.setItem('commandoHD3d.hi', String(this.hi)); } catch (e) {} }

  // ------------------------------------------------------------------ per-frame visual sync
  syncVisuals(dt) {
    // tracers are drawn from the live rounds each frame
    const tl = this.fx.trList; tl.length = 0;
    for (const b of this.bullets) tl.push(b);
    for (const b of this.ebullets) tl.push(b);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const s = e.s;
      if (e.trench) e.yCur = e.yOff;
      s.obj.position.set(e.x, this.baseY(e), -e.p);
      s.obj.rotation.y = Math.PI - e.face;
      s.a.speed = e.bike ? 0 : e.speedN || 0;
      const mv = Math.hypot(e.x - e.px, e.p - e.pp);
      s.a.moveYaw = mv > 0.004 && !e.bike ? Math.PI - angOf(e.x - e.px, e.p - e.pp) : null;
      s.a.roll = e.state === 'dive' ? clamp(1 - e.t / DIVE_T, 0, 1) : -1;
      s.a.phase += mv * STRIDE_E;
      s.a.kick = e.state === 'kick' ? clamp(1 - e.t / KICK_T, 0, 1) : -1;
      if (e.state === 'cover') s.a.crouch = approach(s.a.crouch, this.t < (e.peekUntil || 0) ? 0.58 : 1, dt * 4);
      else if (!e.trench && !e.mortar) s.a.crouch = approach(s.a.crouch, 0, dt * 5);
      s.a.recoil = Math.max(0, (s.a.recoil || 0) - dt * 8);
      // v10: feet on the slope only when standing on the ground; rifle up
      // when engaging; eyes on Joe
      s.a.foot = e.baseY === undefined && !e.trench && !e.bike;
      s.a.aiming = e.state === 'aim' || e.state === 'cover' || e.state === 'search' || e.state === 'trench' || e.state === 'sniper' || !!e.static;
      if (this.joe.alive) { s.a.lookX = this.joe.x; s.a.lookZ = -this.joe.p; } else s.a.lookX = null;
      if (e.flashT > 0) e.flashT -= dt * 6;
      s.setFlash(Math.max(0, e.flashT || 0));
      s.pose(dt);
      if (e.fired) {
        e.fired = false; s.a.recoil = 1;
        const m = s.muzzle(this._v); const [dx, dp] = dirOf(e.face);
        this.fx.muzzle(m.x, m.y, m.z, dx, -dp);
      }
    }
    // sniper lasers
    let li = 0;
    for (const e of this.enemies) {
      if (!e.sniper || !e.alive) continue;
      if (e.laser > 0) {
        const tx = e.phase === 'lock' ? e.lockX : this.joe.x, tp = e.phase === 'lock' ? e.lockP : this.joe.p;
        this.fx.laser(li, e.x, e.baseY + 1.35, -e.p, tx, this.h(tx, tp) + 1.0, -tp, e.laser);
      } else this.fx.laser(li, 0, 0, 0, 0, 0, 0, 0);
      li++;
    }
    for (; li < this.fx.lasers.length; li++) this.fx.laser(li, 0, 0, 0, 0, 0, 0, 0);
    // searchlights: spot, beam and head follow the sweep
    for (const sl of this.world.dyn.searchlights) {
      const gy = this.h(sl.tx, sl.tp);
      sl.target.position.set(sl.tx, gy, -sl.tp);
      sl.head.lookAt(sl.target.position);
      const on = sl.on;
      sl.spot.intensity = on ? (sl.lock > 0 ? 140 : 90) : 0;
      sl.spot.color.setRGB(1, sl.lock > 0 ? 0.62 : 0.95, sl.lock > 0 ? 0.5 : 0.82);
      sl.beam.visible = on;
      if (on) {
        const L = sl.head.position.distanceTo(sl.target.position);
        sl.beam.position.copy(sl.head.position);
        sl.beam.lookAt(sl.target.position);
        sl.beam.scale.set(2.3, 2.3, L);
        sl.beam.material.opacity = this.world.night ? (sl.lock > 0 ? 0.2 : 0.12) : 0.05;
      }
    }
    // the tank flashes when a grenade connects
    for (const tk of this.tanks) if (tk.flash > 0) tk.mesh.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.setScalar(Math.max(0, tk.flash) * 0.6); });
    // night: Joe carries a little light of his own
    if (this.world.night) {
      const J = this.joe;
      this.R.joeLight.position.set(J.x, this.T.standY(J.x, J.p) + 4.2, -J.p + 1.2);
      this.R.joeLight.intensity = 5;
    }
  }

  // current snapshot for tests & the HUD
  snapshot() {
    const J = this.joe;
    return {
      area: this.area.id, state: this.state, t: +this.t.toFixed(2), score: this.score, hi: this.hi, lives: this.lives, loop: this.loop, continues: this.continues,
      joe: { x: +J.x.toFixed(2), p: +J.p.toFixed(2), hp: J.hp, alive: J.alive, grenades: J._g, invuln: +J.invuln.toFixed(2) },
      camP: +this.camP.toFixed(2), top: +this.viewTop().toFixed(1), bottom: +this.viewBottom().toFixed(1),
      enemies: this.enemies.filter(e => e.alive).length, ebullets: this.ebullets.length, bullets: this.bullets.length,
      nades: this.nades.length, trucks: this.trucks.length, tanks: this.tanks.length, motos: this.motos.length, rescued: this.rescued, kills: this.kills,
      finale: this.finale ? { phase: this.finale.phase, wave: this.finale.wave, alive: this.finale.alive } : null, stats: this.stats,
    };
  }
}

// ------------------------------------------------------------------ helpers
function darken(obj, k) {
  obj.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.userData.own = true; if (o.material.color) o.material.color.multiplyScalar(k); } });
}
// vehicles are built per spawn: free their geometry (and any materials they own)
function disposeObj(obj) {
  obj.removeFromParent();
  obj.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material && o.material.userData.own) o.material.dispose(); });
}
function segCircle(x0, p0, x1, p1, cx, cp, r) {
  const dx = x1 - x0, dp = p1 - p0, fx = x0 - cx, fp = p0 - cp;
  const a = dx * dx + dp * dp, b = 2 * (fx * dx + fp * dp), c = fx * fx + fp * fp - r * r;
  if (c <= 0) return 0;
  if (a < 1e-9) return null;
  const disc = b * b - 4 * a * c; if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
function segBox(x0, p0, x1, p1, v) {
  // vehicle: axis-aligned box centred on (x,p), half sizes hw (x) and hl (p)
  let t0 = 0, t1 = 1;
  const d = [x1 - x0, p1 - p0], o = [x0 - v.x, p0 - v.p], h = [v.hw, v.hl];
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (Math.abs(o[i]) > h[i]) return null; continue; }
    let a = (-h[i] - o[i]) / d[i], b = (h[i] - o[i]) / d[i];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}
function boxPush(v, x, p, r) {
  const lx = x - v.x, lp = p - v.p;
  const cx = clamp(lx, -v.hw, v.hw), cp = clamp(lp, -v.hl, v.hl);
  const ox = lx - cx, op = lp - cp, d = Math.hypot(ox, op);
  if (d > 1e-5) { if (d >= r) return null; return [ox / d * (r - d), op / d * (r - d)]; }
  const ex = v.hw - Math.abs(lx), ep = v.hl - Math.abs(lp);
  return ex < ep ? [Math.sign(lx || 1) * (ex + r), 0] : [0, Math.sign(lp || 1) * (ep + r)];
}
