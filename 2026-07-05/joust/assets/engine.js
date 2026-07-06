// Joust remake — deterministic engine (headless-capable, no DOM/canvas/audio).
// Native Joust units, 60 Hz fixed tick, Y grows DOWNWARD. See SPEC.md §1-11.
// Ported from the original 6809 source (notes/joust-src). Runs identically in Node & browser.
'use strict';
(function () {

const DATA = (typeof require !== 'undefined') ? require('./data.js') : window.JOUST_DATA;
const { WORLD, PHYS, SCORE, ENEMY, SPAWN_PADS, P1_SPAWN, P2_SPAWN, waveInfo, platformsForWave, BAITER } = DATA;

// ─── deterministic RNG (mulberry32) ───
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// body box (px): feet at (x,y); body spans y-BODY_H..y, x±BODY_W/2
const BODY_W = 16, BODY_H = 19;
const RIDER_LANCE = 15;   // lance/rider-top offset above feet (for joust height compare)
const PTE_LANCE = 140;    // pterodactyl's artificially high lance
const MAX_ONSCREEN = 5;   // simultaneous enemies from the pool

// wrap helpers
function wrapX(x) {
  while (x < WORLD.WRAP_MIN) x += WORLD.WRAP_SPAN;
  while (x >= WORLD.WRAP_MAX) x -= WORLD.WRAP_SPAN;
  return x;
}
// shortest signed horizontal delta from a to b on the cylinder (b - a)
function wrapDelta(a, b) {
  let d = b - a;
  while (d > WORLD.WRAP_SPAN / 2) d -= WORLD.WRAP_SPAN;
  while (d < -WORLD.WRAP_SPAN / 2) d += WORLD.WRAP_SPAN;
  return d;
}
function xOverlap(ax, bx, halfSum) { return Math.abs(wrapDelta(ax, bx)) < halfSum; }

let _id = 1;

class JoustEngine {
  constructor(opts = {}) {
    this.mode = opts.mode || '1p';           // '1p' | '2p'
    this.numPlayers = this.mode === '2p' ? 2 : 1;
    this.startLives = opts.lives != null ? opts.lives : 3;
    this.rng = mulberry32(opts.seed != null ? opts.seed : 0x10457);
    this.extraManEvery = opts.extraManEvery || SCORE.EXTRA_MAN_EVERY;
    this.difficulty = opts.difficulty || 'normal'; // 'easy'|'normal'|'hard' — widens ptero window etc.
    this.holdUntilInput = opts.holdUntilInput !== false;

    this.players = [];
    for (let i = 0; i < this.numPlayers; i++) {
      this.players.push({
        kind: 'player', pi: i, x: 0, y: 0, vx: 0, vy: 0, vxi: 0, face: 1,
        wingDown: 0, ptimup: 0, onGround: true, alive: false, materializing: 0,
        lives: this.startLives, score: 0, nextExtra: this.extraManEvery,
        eggStreak: 0, deathsThisWave: 0, out: false, skid: 0, runTier: 0, runStep: 0,
        grabbed: null, gladKilled: false, id: _id++,
      });
    }
    this.enemies = [];
    this.eggs = [];
    this.pteros = [];
    this.trolls = [];
    this.events = [];
    this.score = 0;         // combined display convenience
    this.wave = opts.wave || 1;
    this.started = false;
    this.gameOver = false;
    this.freezeFrames = 0;      // hit-stop: pauses the sim for a few frames on a kill
    this.startWave(this.wave);
  }

  emit(type, data) { const ev = Object.assign({}, data); ev.type = type; this.events.push(ev); }

  // ─── wave setup ───
  startWave(n) {
    this.wave = n;
    const info = waveInfo(n);
    this.info = info;
    this.waveType = info.type;
    this.platforms = platformsForWave(n);
    this.enemies = [];
    this.eggs = [];
    this.pteros = [];
    this.trolls = [];
    this.waveTime = 0;              // frames since wave physics started
    this.baiterCount = 0;
    this.baiterNextIdx = 0;
    this.baiterTimer = 60 * BAITER.firstDelay(n);
    this.started = !this.holdUntilInput;
    this.waveCleared = false;
    this.clearTimer = 0;
    this.hatchBase = Math.max(180, 480 - n * 6); // frames to hatch, shortens with wave

    // build enemy pool
    this.pool = [];
    for (let i = 0; i < info.bounders; i++) this.pool.push('bounder');
    for (let i = 0; i < info.hunters; i++) this.pool.push('hunter');
    for (let i = 0; i < info.shadowLords; i++) this.pool.push('shadow');
    // scheduled pterodactyls (ptero waves): queue them
    this.pteroPool = info.type === 'ptero' ? info.pteros : 0;
    this.speedTier = info.speed;

    this.teamKilled = false; // reset per wave (voids team bonus if a player unseats a player)
    // reset per-wave player state; place players
    for (const p of this.players) {
      if (p.out) continue;
      p.deathsThisWave = 0;
      p.eggStreak = 0;
      p.gladKilled = false;
      p.grabbed = null;
      const sp = p.pi === 0 ? P1_SPAWN : P2_SPAWN;
      this.placeBird(p, sp.x, sp.y, sp.face);
      p.alive = true; p.materializing = 0; p.onGround = true;
    }
    // initial enemy spawns
    this.spawnFromPool();
    this.emit('waveStart', { wave: n, wtype: info.type });
  }

  placeBird(b, x, y, face) {
    b.x = wrapX(x); b.y = y; b.vx = 0; b.vy = 0; b.vxi = 0; b.face = face || 1;
    b.wingDown = 0; b.ptimup = 0; b.onGround = true; b.skid = 0; b.runTier = 0; b.runStep = 0;
  }

  spawnFromPool() {
    while (this.enemies.filter(e => e.alive).length < MAX_ONSCREEN && this.pool.length) {
      const type = this.pool.shift();
      const pad = SPAWN_PADS[(this.rng() * SPAWN_PADS.length) | 0];
      const e = {
        kind: 'enemy', type, x: wrapX(pad.x), y: pad.y, vx: 0, vy: 0, vxi: 0,
        face: this.rng() < 0.5 ? 1 : -1, wingDown: 0, ptimup: 0, onGround: true,
        alive: true, materializing: 60, decision: 0, target: 0, mount: null,
        skid: 0, runTier: 0, runStep: 0, grabbed: null, id: _id++,
      };
      this.enemies.push(e);
      this.emit('spawn', { x: e.x, y: e.y, enemy: true });
    }
    // scheduled pterodactyls for ptero waves — release gradually
    if (this.pteroPool > 0 && this.pteros.length < 3 && this.waveTime > 90) {
      if (this.waveTime % 150 === 0) { this.spawnPtero('scheduled'); this.pteroPool--; }
    }
  }

  spawnPtero(kind) {
    const fromLeft = this.rng() < 0.5;
    const p = {
      kind: 'ptero', ptKind: kind, x: fromLeft ? WORLD.WRAP_MIN : WORLD.WRAP_MAX - 1,
      y: WORLD.CEIL + 20 + this.rng() * 80, vx: 0, vy: 0, face: fromLeft ? 1 : -1,
      attack: 0, attackTimer: 60 + (this.rng() * 90 | 0), alive: true, id: _id++,
    };
    this.pteros.push(p);
    this.emit('ptero', { x: p.x, y: p.y });
  }

  // ─── main tick ───
  tick(inputs) {
    this.events.length = 0;
    inputs = inputs || [];
    if (this.gameOver) return this.snapshot();
    // hit-stop: pause the sim briefly so kills land with impact (render keeps animating)
    if (this.freezeFrames > 0) { this.freezeFrames--; return this.snapshot(); }

    if (!this.started) {
      // hold physics until first input (no instant deaths)
      for (let i = 0; i < this.players.length; i++) {
        const inp = inputs[i] || {};
        if (inp.left || inp.right || inp.flap || inp.flapHeld) { this.started = true; break; }
      }
      if (!this.started) return this.snapshot();
    }

    this.waveTime++;

    // players
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.out) continue;
      this.controlPlayer(p, inputs[i] || {});
    }
    // enemies AI
    for (const e of this.enemies) if (e.alive) this.controlEnemy(e);

    // integrate all birds
    for (const p of this.players) if (!p.out && p.alive) this.integrate(p);
    for (const e of this.enemies) if (e.alive) this.integrate(e);
    // eggs
    for (const egg of this.eggs) this.updateEgg(egg);
    // pteros
    for (const p of this.pteros) if (p.alive) this.updatePtero(p);
    // troll grabs
    if (this.info.trollActive) this.updateTrolls();

    // collisions
    this.resolveCollisions();

    // egg/enemy cleanup + spawn refill
    this.eggs = this.eggs.filter(e => !e.dead);
    this.enemies = this.enemies.filter(e => e.alive || e._keep);
    this.pteros = this.pteros.filter(p => p.alive);
    if (!this.waveCleared) this.spawnFromPool();

    // baiter pterodactyls (dawdling)
    this.updateBaiters();

    // wave clear check
    this.checkWaveClear();

    return this.snapshot();
  }

  // ─── player control ───
  controlPlayer(p, inp) {
    if (p.materializing > 0) { p.materializing--; if (p.materializing === 0) this.emit('materialized', { x: p.x, y: p.y }); return; }
    if (!p.alive) return;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir !== 0) p.face = dir;
    p.flapT = (p.flapT || 0) - 1;
    // flap on press, AND auto-repeat while the key is held (holding = steady climb, tapping = control)
    if (inp.flap) this.doFlap(p, dir);
    else if (inp.flapHeld && !p.onGround && p.flapT <= 0) this.doFlap(p, dir);
    // horizontal: continuous & responsive (fixes the old per-flap "inverted/twitchy" feel)
    if (p.onGround) this.groundMove(p, dir); else this.airMove(p, dir, PHYS.MAX_H);
  }

  doFlap(b, dir) {
    if (b.onGround) { b.onGround = false; b.y -= 1; }      // takeoff pop
    b.vy += PHYS.FLAP_DV;                                   // strong upward impulse
    if (b.vy < -PHYS.MAX_RISE) b.vy = -PHYS.MAX_RISE;
    b.wingDown = 6; b.flapT = PHYS.FLAP_REPEAT;
    this.emit('flap', { x: b.x, y: b.y, player: b.kind === 'player' });
  }

  // continuous horizontal accel/drag (players & enemies) — direction is 1=right,-1=left
  airMove(b, dir, maxH) {
    if (dir !== 0) {
      const a = (dir * (b.vx || 0) < 0) ? PHYS.AIR_ACCEL * 2.6 : PHYS.AIR_ACCEL; // brake hard when reversing → responsive
      b.vx = Math.max(-maxH, Math.min(maxH, (b.vx || 0) + dir * a));
    } else b.vx = (b.vx || 0) * PHYS.AIR_DRAG;
  }

  groundMove(b, dir) {
    if (dir === 0) { b.vx = (b.vx || 0) * PHYS.GROUND_DRAG; if (Math.abs(b.vx) < 0.06) b.vx = 0; b.skid = 0; }
    else {
      if ((b.vx || 0) * dir < -0.15 && (b.skid || 0) <= 0) { b.skid = 8; this.emit('skid', { x: b.x, y: b.y }); }
      b.vx = Math.max(-PHYS.GROUND_MAX, Math.min(PHYS.GROUND_MAX, (b.vx || 0) + dir * PHYS.GROUND_ACCEL));
      if (b.skid > 0) b.skid--;
      b.runFace = dir;
      if (Math.abs(b.vx) > 0.3 && this.rng() < 0.2) this.emit('walk', { x: b.x, y: b.y });
    }
    b.runTier = Math.min(8, Math.abs(b.vx || 0) * 4);
    b.x = wrapX(b.x + (b.vx || 0));
  }

  // ─── enemy AI ───
  controlEnemy(e) {
    if (e.materializing > 0) { e.materializing--; return; }
    const def = ENEMY[e.type];
    const tier = this.speedTier;
    // pick nearest living player as target
    let target = null, best = 1e9;
    for (const p of this.players) {
      if (p.out || !p.alive || p.materializing > 0) continue;
      const d = Math.abs(wrapDelta(e.x, p.x)) + Math.abs(e.y - p.y);
      if (d < best) { best = d; target = p; }
    }
    e.decision--;
    if (e.decision <= 0) {
      // re-decide periodically; higher tiers react faster (imperfect → beatable)
      e.decision = Math.max(8, 26 - tier - (this.rng() * 12 | 0));
      e.aim = target;
      e.wantFace = target ? (wrapDelta(e.x, target.x) >= 0 ? 1 : -1) : (this.rng() < 0.5 ? 1 : -1);
      e.wander = this.rng() < 0.25 ? (this.rng() * 40 - 20) : 0; // altitude jitter
    }
    e.face = e.wantFace || e.face;
    // desired altitude. Bounders mostly cruise (beatable — a player can dive on them);
    // hunters chase moderately; shadow lords aggressively fly above you (hard to out-climb).
    const cruise = e.type === 'bounder' ? 158 : e.type === 'hunter' ? 136 : 122;
    const chase = e.type === 'bounder' ? 0.10 : e.type === 'hunter' ? 0.4 : 0.7;
    const aimOff = e.type === 'bounder' ? -10 : e.type === 'hunter' ? 4 : 16; // + = above player
    let desiredY = e.aim ? (cruise * (1 - chase) + (e.aim.y - aimOff) * chase) : cruise;
    desiredY = Math.max(WORLD.CEIL + 14, Math.min(WORLD.FLOOR - 34, desiredY + (e.wander || 0)));

    if (e.onGround) {
      if (this.rng() < 0.10 + def.aggr * 0.12) this.doFlap(e, e.face);
      else this.groundMove(e, this.rng() < def.aggr ? e.face : 0);
      return;
    }
    const nearLava = e.y > WORLD.FLOOR - 48;
    e.flapClock = (e.flapClock || 0) - 1;
    // steer away from lava columns when low (don't suicide into the lava)
    const overLava = this.overLava(e.x);
    if ((overLava || nearLava) && e.y > 150) { e.face = wrapDelta(e.x, 147) >= 0 ? 1 : -1; }
    // horizontal drift toward facing (continuous, matches the player model)
    this.airMove(e, e.face, PHYS.ENEMY_MAX_H);
    // flap cadence — tuned for the new flap strength: hover ≈ 1 flap / 13f, climb faster.
    const climbP = def.climb >= 0.9 ? 7 : def.climb >= 0.75 ? 8 : 10;
    let period;
    if (nearLava || overLava) period = 5;             // escape lava
    else if (e.y > desiredY + 4) period = climbP;     // below desired → climb
    else if (e.y < desiredY - 12) period = 0;         // too high → glide down
    else period = 13;                                  // hover (holds altitude)
    if (period > 0 && e.flapClock <= 0) { this.doFlap(e, e.face); e.flapClock = period; }
  }

  // ─── integrate one bird (players + enemies) ───
  integrate(b) {
    if (b.materializing > 0) return;
    if (b.onGround) {
      // walking off an edge? (keep horizontal momentum)
      if (!this.platformUnder(b)) { b.onGround = false; b.vy = 0.2; }
      else { b.wingDown = Math.max(0, b.wingDown - 1); return; }
    }
    // gravity (wings-up glide = heavier so idle sinks)
    if (b.grabbed) { b.vy += b.grabbed.pull; b.vx = 0; }   // lava troll pull; X frozen
    else { b.vy += (b.wingDown > 0 ? PHYS.GRAV_DOWN : PHYS.GRAV_UP); if (b.wingDown > 0) b.wingDown--; }
    // clamp vertical
    if (b.vy > PHYS.MAX_FALL) b.vy = PHYS.MAX_FALL;
    if (b.vy < -PHYS.MAX_RISE) b.vy = -PHYS.MAX_RISE;
    // integrate (vx set by airMove/groundMove)
    b.y += b.vy;
    if (!b.grabbed) b.x = wrapX(b.x + (b.vx || 0));

    // ceiling
    if (b.y < WORLD.CEIL) { b.y = WORLD.CEIL; if (b.vy < 0) b.vy = 0; }
    // landing on platforms (only when descending)
    if (b.vy >= 0 && !b.grabbed) {
      const plat = this.landingPlatform(b);
      if (plat) {
        b.runTier = Math.min(8, Math.abs(b.vx || 0) * 4);
        b.runFace = (b.vx || 0) < 0 ? -1 : 1;
        b.y = plat.y; b.vy = 0; b.onGround = true;
        b.vx = (b.vx || 0) * 0.6;   // keep some run momentum on landing
        b.wingDown = 0;
        this.emit('thud', { x: b.x, y: b.y, player: b.kind === 'player' });
      }
    }
    // lava / floor death
    if (b.y >= WORLD.FLOOR) {
      if (this.overLava(b.x)) { this.killBird(b, 'lava'); }
      else { b.y = WORLD.FLOOR; b.vy = 0; b.onGround = true; } // shouldn't happen (platform caught)
    }
  }

  // platform whose top the bird crossed this frame while descending
  landingPlatform(b) {
    const prevY = b.y - b.vy;
    for (const p of this.platforms) {
      if (b.x + BODY_W / 2 < p.x1 || b.x - BODY_W / 2 > p.x2) {
        // handle wrap for edge platforms
        if (!this.xInPlat(b.x, p)) continue;
      }
      if (prevY <= p.y + 2 && b.y >= p.y - 1 && b.y <= p.y + 8) return p;
    }
    return null;
  }
  xInPlat(x, p) {
    if (x >= p.x1 && x <= p.x2) return true;
    // wrap: platform may extend past edges
    if (x + WORLD.WRAP_SPAN >= p.x1 && x + WORLD.WRAP_SPAN <= p.x2) return true;
    if (x - WORLD.WRAP_SPAN >= p.x1 && x - WORLD.WRAP_SPAN <= p.x2) return true;
    return false;
  }
  platformUnder(b) {
    for (const p of this.platforms) {
      if (Math.abs(b.y - p.y) < 2 && this.xInPlat(b.x, p)) return p;
    }
    return null;
  }
  overLava(x) {
    // lava wherever there is no base platform beneath at the bottom
    for (const p of this.platforms) {
      if (p.y >= 200 && this.xInPlat(x, p)) return false;
    }
    return true;
  }

  // ─── eggs ───
  spawnEgg(x, y, vx, vy) {
    this.eggs.push({
      kind: 'egg', x: wrapX(x), y, vx: vx || 0, vy: vy || 0, landed: false, touched: false,
      hatch: this.hatchBase, state: 'egg', anim: 0, dead: false, id: _id++,
    });
    this.emit('eggDrop', { x, y });
  }
  updateEgg(egg) {
    if (egg.dead) return;
    egg.anim++;
    if (egg.state === 'egg' || egg.state === 'shake') {
      // physics: fall + bounce
      egg.vy += PHYS.GRAV_UP;
      if (egg.vy > PHYS.MAX_FALL) egg.vy = PHYS.MAX_FALL;
      egg.y += egg.vy; egg.x = wrapX(egg.x + egg.vx);
      egg.vx *= 0.98;
      // land on platform
      if (egg.vy >= 0) {
        const prevY = egg.y - egg.vy;
        for (const p of this.platforms) {
          if (!this.xInPlat(egg.x, p)) continue;
          if (prevY <= p.y + 2 && egg.y >= p.y - 1 && egg.y <= p.y + 8) {
            egg.y = p.y; egg.vx = 0; egg.touched = true; // PFEET — no more mid-air bonus
            if (egg.vy > 1.5) { egg.vy = -egg.vy * 0.4; } // bounce
            else { egg.vy = 0; if (!egg.landed) { egg.landed = true; this.emit('eggLand', { x: egg.x, y: egg.y }); } }
            break;
          }
        }
      }
      if (egg.y >= WORLD.FLOOR) { if (this.overLava(egg.x)) { egg.dead = true; this.emit('eggBurn', { x: egg.x }); return; } egg.y = WORLD.FLOOR; egg.landed = true; egg.touched = true; egg.vy = 0; }
      // hatch countdown once (starts immediately; shakes near the end)
      egg.hatch--;
      if (egg.hatch < 90) egg.state = 'shake';
      if (egg.hatch <= 0 && egg.landed) { egg.state = 'hatching'; egg.anim = 0; this.emit('eggHatch', { x: egg.x, y: egg.y }); }
    } else if (egg.state === 'hatching') {
      if (egg.anim > 70) { egg.state = 'walking'; egg.anim = 0; egg.walkFace = this.rng() < 0.5 ? 1 : -1; }
    } else if (egg.state === 'walking') {
      // dismounted rider walks; a buzzard swoops → remount
      egg.x = wrapX(egg.x + egg.walkFace * 0.3);
      if (egg.anim > 120) { egg.state = 'mounting'; egg.anim = 0; this.emit('mount', { x: egg.x, y: egg.y }); }
    } else if (egg.state === 'mounting') {
      if (egg.anim > 40) {
        // becomes an active enemy (reanimated); type escalates with wave
        const type = this.wave >= 16 ? 'shadow' : (this.wave >= 4 ? 'hunter' : 'bounder');
        this.enemies.push({
          kind: 'enemy', type, x: egg.x, y: egg.y, vx: 0, vy: 0, vxi: 0,
          face: egg.walkFace || 1, wingDown: 0, ptimup: 0, onGround: true, alive: true,
          materializing: 0, decision: 0, mount: null, skid: 0, runTier: 0, runStep: 0, grabbed: null, id: _id++,
        });
        egg.dead = true;
      }
    }
  }

  collectEgg(egg, player) {
    const idx = Math.min(player.eggStreak, SCORE.EGG_LADDER.length - 1);
    let pts = SCORE.EGG_LADDER[idx];
    const air = !egg.touched && (egg.state === 'egg' || egg.state === 'shake');
    if (air) pts += SCORE.EGG_AIR_BONUS;
    player.eggStreak = Math.min(4, player.eggStreak + 1);
    this.addScore(player, pts);
    egg.dead = true;
    this.emit('eggCollect', { x: egg.x, y: egg.y, points: pts, air });
    if (player.eggStreak >= 2) this.emit('combo', { x: egg.x, y: egg.y, level: player.eggStreak, pi: player.pi });
  }

  // ─── pterodactyl ───
  updatePtero(p) {
    // home on nearest player
    let target = null, best = 1e9;
    for (const pl of this.players) {
      if (pl.out || !pl.alive) continue;
      const d = Math.abs(wrapDelta(p.x, pl.x));
      if (d < best) { best = d; target = pl; }
    }
    if (target) {
      const dx = wrapDelta(p.x, target.x);
      p.face = dx >= 0 ? 1 : -1;
      p.vx = Math.max(-1.2, Math.min(1.2, p.vx + p.face * 0.05));
      const dy = target.y - p.y;
      p.vy = Math.max(PHYS.PTE_UP, Math.min(PHYS.PTE_DN, p.vy + Math.sign(dy) * 0.04));
    } else {
      p.vx = p.face * 1.0;
    }
    p.x = wrapX(p.x + p.vx);
    p.y += p.vy;
    if (p.y < WORLD.CEIL) { p.y = WORLD.CEIL; p.vy = Math.abs(p.vy); }
    if (p.y > WORLD.FLOOR - 12) { p.y = WORLD.FLOOR - 12; p.vy = -Math.abs(p.vy); }
    // attack (open beak) cycle
    p.attackTimer--;
    if (p.attackTimer <= 0) { p.attack = p.attack > 0 ? 0 : 40; p.attackTimer = p.attack > 0 ? 40 : 60 + (this.rng() * 90 | 0); }
    if (p.attack > 0) p.attack--;
  }

  updateBaiters() {
    if (this.waveCleared) return;
    if (this.baiterCount >= BAITER.maxOnScreen) return;
    this.baiterTimer--;
    if (this.baiterTimer <= 0) {
      this.spawnPtero('baiter'); this.baiterCount++;
      const d = BAITER.nextDelays[Math.min(this.baiterNextIdx, BAITER.nextDelays.length - 1)];
      this.baiterNextIdx++;
      this.baiterTimer = 60 * d;
      this.emit('bait', {});
    }
  }

  // ─── lava troll ───
  updateTrolls() {
    const grabZone = WORLD.FLOOR - 25;
    for (const b of [...this.players, ...this.enemies]) {
      if (b.out || !b.alive || b.materializing > 0 || b.onGround) { if (b.grabbed) this.releaseTroll(b); continue; }
      const low = b.y >= grabZone;
      const overLava = this.overLava(b.x);
      if (!b.grabbed) {
        if (low && overLava && b.y < WORLD.FLOOR + 6) {
          b.grabbed = { pull: PHYS.TROLL_PULL_BASE, t: 0, x: b.x };
          this.trolls.push({ kind: 'troll', bird: b, x: b.x, y: WORLD.FLOOR, id: _id++ });
          this.emit('troll', { x: b.x, y: WORLD.FLOOR });
        }
      } else {
        // strengthen pull after warmup
        b.grabbed.t++;
        if (b.grabbed.t > PHYS.TROLL_WARMUP_FR) b.grabbed.pull = Math.min(PHYS.TROLL_PULL_CAP, b.grabbed.pull + PHYS.TROLL_RAMP);
        // escape if rising fast enough
        if (b.vy < PHYS.TROLL_BREAKFREE) { this.releaseTroll(b); if (b.kind === 'player') this.addScore(b, SCORE.LAVA_ESCAPE); continue; }
        // dragged into lava?
        if (b.y >= WORLD.FLOOR + 7) { this.releaseTroll(b); this.killBird(b, 'lava'); }
        else if (!low) this.releaseTroll(b);
      }
    }
    // cleanup troll visuals
    this.trolls = this.trolls.filter(t => t.bird.grabbed);
  }
  releaseTroll(b) { b.grabbed = null; }

  // ─── collisions ───
  resolveCollisions() {
    const players = this.players.filter(p => !p.out && p.alive && p.materializing <= 0);
    const enemies = this.enemies.filter(e => e.alive && e.materializing <= 0);
    // player vs enemy joust
    for (const p of players) {
      for (const e of enemies) {
        if (!e.alive || !p.alive) continue;
        if (this.birdsOverlap(p, e)) this.joust(p, e);
      }
    }
    // player vs player
    if (players.length === 2 && this.birdsOverlap(players[0], players[1])) this.joust(players[0], players[1]);
    // player vs egg (collect); enemy vs egg is ignored (enemies don't collect)
    for (const p of players) {
      for (const egg of this.eggs) {
        if (egg.dead) continue;
        if (this.pointOverlap(p, egg, 14)) {
          // collecting: egg / shake / landed all collectible; walking/mounting rider = kill for points too
          if (egg.state === 'egg' || egg.state === 'shake') this.collectEgg(egg, p);
          else if (egg.state === 'hatching' || egg.state === 'walking' || egg.state === 'mounting') {
            // killing the unmounted rider still gives egg value
            this.collectEgg(egg, p);
          }
        }
      }
    }
    // player vs pterodactyl
    for (const p of players) {
      for (const pt of this.pteros) {
        if (!pt.alive || !p.alive) continue;
        if (this.pteroOverlap(p, pt)) this.pteroHit(p, pt);
      }
    }
  }

  birdsOverlap(a, b) {
    if (!xOverlap(a.x, b.x, BODY_W)) return false;
    return Math.abs(a.y - b.y) < BODY_H;
  }
  pointOverlap(a, o, r) {
    return xOverlap(a.x, o.x, r) && Math.abs(a.y - o.y) < r;
  }
  pteroOverlap(p, pt) {
    return xOverlap(p.x, pt.x, 20) && Math.abs(p.y - pt.y) < 20;
  }

  joust(a, b) {
    // lance heights (smaller y = higher = wins); integer compare (ROM uses pixel Y)
    const la = Math.round(a.y - RIDER_LANCE);
    const lb = Math.round(b.y - RIDER_LANCE);
    if (la === lb) { this.bounce(a, b); return; }
    const winner = la < lb ? a : b;
    const loser = la < lb ? b : a;
    if (winner.kind === 'player' && loser.kind === 'player') {
      // gladiator wave bounty / team penalty
      this.playerKillsPlayer(winner, loser);
    } else if (loser.kind === 'player') {
      this.killBird(loser, 'joust');
    } else {
      // enemy loser → egg + points to winner (if winner is player)
      this.unseatEnemy(loser, winner);
    }
  }

  bounce(a, b) {
    const upper = a.y <= b.y ? a : b;
    const lower = a.y <= b.y ? b : a;
    upper.y -= 2; lower.y += 2;
    if (upper.vy > 0) upper.vy = -upper.vy * 0.5;
    if (lower.vy < 0) lower.vy = -lower.vy * 0.5;
    // separate horizontally, faces away (knock apart along vx)
    const d = wrapDelta(a.x, b.x);
    const af = d >= 0 ? -1 : 1, bf = -af;
    a.vx = af * 1.3; b.vx = bf * 1.3;
    a.face = af; b.face = bf;
    a.x = wrapX(a.x + af * 2); b.x = wrapX(b.x + bf * 2);
    this.emit('bounce', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }

  unseatEnemy(enemy, winner) {
    enemy.alive = false;
    if (winner && winner.kind === 'player') { this.addScore(winner, ENEMY[enemy.type].points); this.freezeFrames = Math.max(this.freezeFrames, 3); }
    this.spawnEgg(enemy.x, enemy.y, enemy.vx * 0.5, -1);
    this.emit('enemyDie', { x: enemy.x, y: enemy.y, etype: enemy.type, points: ENEMY[enemy.type].points });
  }

  playerKillsPlayer(winner, loser) {
    this.teamKilled = true; // any player-vs-player unseat voids the team bonus (SPEC §10)
    if (this.waveType === 'gladiator' && !winner.gladKilled) {
      winner.gladKilled = true;
      this.addScore(winner, SCORE.GLADIATOR_BOUNTY);
      this.emit('bounty', { x: winner.x, y: winner.y, points: SCORE.GLADIATOR_BOUNTY });
    }
    this.killBird(loser, 'joust');
  }

  pteroHit(player, pt) {
    // vulnerable only: opposite facing, player on beak side, lance within window of beak
    const beakY = pt.y - 2;
    const lanceY = player.y - RIDER_LANCE;
    const oppFacing = player.face !== pt.face;
    const onBeakSide = (pt.face === 1 && wrapDelta(pt.x, player.x) > 0) || (pt.face === -1 && wrapDelta(pt.x, player.x) < 0);
    let win = this.difficulty === 'easy' ? 4 : 2;
    if (pt.attack > 0) win += 2; // open-beak attack frame widens
    if (oppFacing && onBeakSide && Math.abs(lanceY - beakY) <= win) {
      pt.alive = false;
      this.addScore(player, SCORE.PTERO);
      this.freezeFrames = 6;   // bigger hit-stop — pterodactyl kills are a big deal
      this.emit('pteroDie', { x: pt.x, y: pt.y, points: SCORE.PTERO });
      if (pt.ptKind === 'baiter') this.baiterCount = Math.max(0, this.baiterCount - 1);
    } else {
      this.killBird(player, 'ptero');
    }
  }

  // ─── death / respawn ───
  killBird(b, cause) {
    if (b.kind === 'enemy') {
      b.alive = false;
      this.spawnEgg(b.x, b.y, 0, -1);
      this.emit('enemyDie', { x: b.x, y: b.y, etype: b.type, points: 0 });
      return;
    }
    // player
    if (!b.alive) return;
    b.alive = false; b.grabbed = null;
    b.deathsThisWave++;
    b.eggStreak = 0;
    b.lives--;
    this.emit('playerDie', { x: b.x, y: b.y, pi: b.pi, cause });
    if (b.lives <= 0) {
      b.out = true;
      if (this.players.every(p => p.out)) { this.gameOver = true; this.emit('gameOver', {}); }
    } else {
      // respawn after a short delay via materialization on a pad
      b.respawn = 60;
    }
  }

  addScore(p, pts) {
    p.score += pts;
    if (p.score >= p.nextExtra) {
      while (p.score >= p.nextExtra) { p.lives++; p.nextExtra += this.extraManEvery; this.emit('extraMan', { pi: p.pi }); }
    }
  }

  // ─── wave clear / bonuses ───
  checkWaveClear() {
    // handle pending player respawns
    for (const p of this.players) {
      if (p.out || p.alive) continue;
      if (p.respawn != null) {
        p.respawn--;
        if (p.respawn <= 0) {
          const pad = SPAWN_PADS[(this.rng() * SPAWN_PADS.length) | 0];
          this.placeBird(p, pad.x, pad.y, 1); p.alive = true; p.materializing = 60; p.respawn = null;
          this.emit('spawn', { x: pad.x, y: pad.y, player: true });
        }
      }
    }
    if (this.waveCleared) {
      this.clearTimer--;
      return;
    }
    const enemiesLeft = this.enemies.some(e => e.alive) || this.pool.length > 0;
    const eggsLeft = this.eggs.some(e => !e.dead);
    const scheduledPteroLeft = (this.waveType === 'ptero') && (this.pteroPool > 0 || this.pteros.some(p => p.ptKind === 'scheduled' && p.alive));
    const anyPlayerAlive = this.players.some(p => !p.out);
    if (!enemiesLeft && !eggsLeft && !scheduledPteroLeft && anyPlayerAlive) {
      this.waveCleared = true;
      this.clearTimer = 120;
      this.awardWaveBonus();
      this.emit('waveClear', { wave: this.wave });
    }
  }

  awardWaveBonus() {
    if (this.waveType === 'survival') {
      if (this.mode === '2p') {
        // team wave: each player 3000 iff neither player unseated the other
        const teamKilled = this.teamKilled;
        for (const p of this.players) if (!p.out && p.deathsThisWave === 0 && !teamKilled) { this.addScore(p, SCORE.TEAM_BONUS); this.emit('bonus', { pi: p.pi, points: SCORE.TEAM_BONUS, kind: 'team' }); }
      } else {
        for (const p of this.players) if (!p.out && p.deathsThisWave === 0) { this.addScore(p, SCORE.SURVIVE_BONUS); this.emit('bonus', { pi: p.pi, points: SCORE.SURVIVE_BONUS, kind: 'survival' }); }
      }
    }
    // gladiator bounty already awarded on kill
  }

  nextWave() { this.startWave(this.wave + 1); }

  // ─── snapshot for renderer/tests ───
  snapshot() {
    return {
      wave: this.wave, waveType: this.waveType, started: this.started, gameOver: this.gameOver,
      waveCleared: this.waveCleared, clearTimer: this.clearTimer, waveTime: this.waveTime,
      players: this.players, enemies: this.enemies, eggs: this.eggs, pteros: this.pteros,
      trolls: this.trolls, platforms: this.platforms, info: this.info, events: this.events,
    };
  }
}

const API = { JoustEngine, mulberry32, wrapX, wrapDelta, BODY_W, BODY_H, RIDER_LANCE };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.JOUST_ENGINE = API;

})();
