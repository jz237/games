#!/usr/bin/env node
// Headless engine tests — physics constants, joust resolution, egg lifecycle,
// pterodactyl window, lava troll, wave progression, scoring/extra-life, wrap.
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = require(join(root, 'assets/data.js'));
const { JoustEngine, wrapDelta, wrapX } = require(join(root, 'assets/engine.js'));

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); console.log('  FAIL:', msg); } }
function approx(a, b, eps, msg) { ok(Math.abs(a - b) < (eps || 1e-6), `${msg} (got ${a}, want ~${b})`); }

// helper: fresh engine with physics started
function eng(opts = {}) {
  const e = new JoustEngine(Object.assign({ holdUntilInput: false, seed: 42 }, opts));
  e.started = true;
  return e;
}
const NO = [{}, {}];
function tick(e, inp) { return e.tick(inp || NO); }

// ── DATA: wave-type cycle ──
console.log('wave-type cycle & table');
{
  const types = [];
  for (let n = 1; n <= 20; n++) types.push(DATA.waveInfo(n).type);
  ok(types[0] === 'normal', 'W1 normal');
  ok(types[1] === 'survival', 'W2 survival');
  ok(types[2] === 'normal', 'W3 normal (not ptero)');
  ok(types[3] === 'gladiator', 'W4 gladiator');
  ok(types[4] === 'egg', 'W5 egg');
  ok(types[7] === 'ptero', 'W8 pterodactyl');
  ok(types[9] === 'egg', 'W10 egg');
  ok(types[12] === 'ptero', 'W13 ptero');
  // enemy counts
  const w1 = DATA.waveInfo(1);
  ok(w1.bounders === 3 && w1.hunters === 0 && w1.shadowLords === 0, 'W1 = 3 bounders');
  const w4 = DATA.waveInfo(4);
  ok(w4.bounders === 3 && w4.hunters === 3, 'W4 = 3 bounders + 3 hunters');
  ok(DATA.waveInfo(16).shadowLords === 1, 'W16 first shadow lord');
  ok(DATA.waveInfo(18).pteros === 2, 'W18 = 2 scheduled pteros');
  ok(DATA.waveInfo(43).pteros === 3, 'W43 = 3 pteros');
  // bridge & troll onset
  ok(!DATA.waveInfo(2).bridgeGone && DATA.waveInfo(3).bridgeGone, 'bridge burns wave 3');
  ok(!DATA.waveInfo(3).trollActive && DATA.waveInfo(4).trollActive, 'troll from wave 4');
  // erosion non-monotonic: egg waves restore full board
  const platsW9 = DATA.platformsForWave(9).length;
  const platsW10 = DATA.platformsForWave(10).length;
  ok(platsW10 > platsW9, 'egg wave (10) restores platforms vs eroded wave 9');
  // wave loop past 90
  ok(DATA.waveInfo(91).type === DATA.waveInfo(81).type, 'wave table loops 81..90');
}

console.log('arcade defaults and egg-wave setup');
{
  const d = new JoustEngine({ holdUntilInput: false, seed: 3 });
  ok(d.players[0].lives === 5, 'factory default is five mounts');
  ok(JSON.stringify(DATA.SPAWN_PADS) === JSON.stringify([
    { x: 113, y: 73 }, { x: 231, y: 121 }, { x: 23, y: 130 }, { x: 127, y: 203 },
  ]), 'Rev.4 uses the four transporter spawn pads');
  const e5 = eng({ wave: 5 });
  ok(e5.eggs.length === 12 && e5.pool.length === 0 && e5.enemies.length === 0, 'wave 5 starts with exactly 12 eggs and no mounted riders');
  ok(e5.eggs.every(g => g.landed && g.touched && g.origin === 'bounder'), 'wave 5 seeds settled Bounder eggs');
  ok(e5.eggs.every(g => !!e5.platformUnder(g)), 'all wave-5 eggs are seeded on live ledges');
  ok(e5.eggs.filter(g => g.hatch < e5.hatchBase).length === 2, 'wave 5 has exactly two premature hatch timers');
  const e15 = eng({ wave: 15 });
  ok(e15.eggs.length === 12 && e15.eggs.every(g => g.origin === 'hunter'), 'wave 15 seeds 12 Hunter eggs');
  const e60 = eng({ wave: 60 });
  ok(e60.eggs.length === 12 && e60.eggs.every(g => g.origin === 'shadow'), 'wave 60 seeds 12 Shadow Lord eggs');
}

console.log('sequential transporter spawning');
{
  const e = eng({ wave: 41 }); // 3 Hunters + 7 Shadow Lords
  ok(e.activeSpawnPads().length === 4, 'all four Rev.4 transporter pads are active on wave 41');
  ok(e.enemies.length === 1 && e.pool.length === 9, 'wave 41 starts one transporter before the remaining nine');
  for (let i = 0; i < 60; i++) e.spawnFromPool();
  ok(e.enemies.length === 1, 'next rider does not spawn before the 61-frame transporter interval');
  e.spawnFromPool();
  ok(e.enemies.length === 2, 'second rider spawns on the 61st interval tick');
  let guard = 2000;
  while (e.pool.length && guard-- > 0) e.spawnFromPool();
  ok(guard > 0 && e.enemies.length === 10 && e.pool.length === 0, 'all ten wave-41 riders spawn sequentially without an artificial on-screen cap');
  ok(e.enemies.filter(x => x.type === 'hunter').length === 3 && e.enemies.filter(x => x.type === 'shadow').length === 7,
    'wave 41 fields the complete 3-Hunter/7-Shadow-Lord roster');
  const pads = new Set(DATA.SPAWN_PADS.map(p => `${p.x},${p.y}`));
  ok(e.enemies.every(x => pads.has(`${x.x},${x.y}`)), 'every wave-41 rider uses an authentic transporter pad');
}

// ── PHYSICS: gravity wings up/down ──
console.log('gravity');
{
  const e = eng();
  const p = e.players[0];
  // Released button uses FLIPS2 gravity, independently of the visual wing frame.
  p.onGround = false; p.y = 100; p.vy = 0; p.wingDown = 0; p.flapHeld = false; p.vxi = 0;
  const vy0 = p.vy;
  e.integrate(p);
  approx(p.vy - vy0, DATA.PHYS.GRAV_UP, 1e-9, 'released-button gravity = 8/256');
  // Held flap button uses FLAPS2 gravity.
  p.onGround = false; p.y = 100; p.vy = 0; p.wingDown = 0; p.flapHeld = true;
  const vy1 = p.vy;
  e.integrate(p);
  approx(p.vy - vy1, DATA.PHYS.GRAV_DOWN, 1e-9, 'held-button gravity = 4/256');
  // PACCX keeps down-wing art visible after release, but must not alter physics.
  p.onGround = false; p.y = 100; p.vy = 0; p.wingDown = 3; p.flapHeld = false;
  e.integrate(p);
  approx(p.vy, DATA.PHYS.GRAV_UP, 1e-9, 'visual down-wing timer does not suppress released-button gravity');

  // Ceiling collision in ADDGRX fully inverts the post-gravity velocity.
  p.onGround = false; p.y = DATA.WORLD.CEIL + 0.1; p.vy = -1; p.wingDown = 0; p.flapHeld = false;
  e.integrate(p);
  approx(p.y, DATA.WORLD.CEIL, 1e-9, 'ceiling clamps at CEIL');
  approx(p.vy, 1 - DATA.PHYS.GRAV_UP, 1e-9, 'ceiling fully inverts upward velocity');
}

// ── PHYSICS: Rev.4 stroke with browser hold-repeat convenience ──
console.log('flap impulse and hold-repeat semantics');
{
  const e = eng();
  const p = e.players[0];
  p.onGround = true; p.vy = 0; p.vx = 0; p.vxi = 0;
  e.doFlap(p, 1);
  approx(p.vy, -0.5, 1e-9, 'ground takeoff sets vy=-0.5 px/tick');
  ok(p.vxi === 0 && p.vx === 0, 'ground takeoff preserves run momentum and does not apply an airborne horizontal stroke');
  p.onGround = false; p.vy = 0; p.ptimup = 0;
  e.doFlap(p, 0);
  approx(p.vy, -96 / 256, 1e-9, 'rapid airborne stroke adds -96/256');
  p.vy = 0; p.ptimup = 128;
  e.doFlap(p, 0);
  approx(p.vy, -48 / 256, 1e-9, 'stroke impulse decays with released-wing time');
  p.vy = 0; p.ptimup = 255;
  e.doFlap(p, 0);
  approx(p.vy, -1 / 256, 1e-9, 'fully aged PTIMUP=255 stroke still adds exactly -1/256');
  p.x = 146; p.y = 100; p.vy = 0; p.ptimup = 0; p.onGround = false; p.flapRepeat = 0;
  const strokeFrames = [], releaseFrames = [];
  for (let frame = 0; frame <= DATA.PHYS.HOLD_FLAP_REPEAT * 2; frame++) {
    e.events.length = 0;
    e.controlPlayer(p, { flap: frame === 0, flapHeld: true });
    if (e.events.some(ev => ev.type === 'flap')) strokeFrames.push(frame);
    if (!p.flapHeld && p.wingDown === 0) releaseFrames.push(frame);
    e.animFrame++; e.integrate(p);
  }
  ok(JSON.stringify(strokeFrames) === JSON.stringify([0, 6, 12]), 'holding flap strokes immediately and every six active ticks');
  ok(JSON.stringify(releaseFrames) === JSON.stringify([5, 11]), 'hold-repeat includes one visible wings-up/gravity tick before each new stroke');
  e.events.length = 0; e.controlPlayer(p, { flapHeld: false });
  e.controlPlayer(p, { flapHeld: true });
  ok(e.events.filter(ev => ev.type === 'flap').length === 1, 're-holding after release strokes immediately');
}

// ── PHYSICS: horizontal FLYX state changes only on flap strokes ──
console.log('horizontal flap momentum');
{
  const e = eng();
  const p = e.players[0];
  p.onGround = false; p.vx = 0; p.vxi = 0; p.ptimup = 0;
  e.doFlap(p, 1); approx(p.vx, 0.25, 1e-9, 'first right stroke selects +0.25 px/tick');
  e.doFlap(p, 1); approx(p.vx, 0.5, 1e-9, 'second right stroke selects +0.5');
  e.doFlap(p, 1); approx(p.vx, 1, 1e-9, 'third right stroke selects +1');
  e.doFlap(p, 1); approx(p.vx, 2, 1e-9, 'fourth right stroke selects +2');
  for (let i = 0; i < 60; i++) e.airMove(p, 0, DATA.PHYS.MAX_H);
  approx(p.vx, 2, 1e-9, 'air momentum has no passive drag');
  e.doFlap(p, -1); approx(p.vx, 1, 1e-9, 'opposite flap bleeds one velocity state');
}

// ── WRAP ──
console.log('cylinder wrap');
{
  ok(Math.abs(wrapDelta(280, -5)) < 40, 'wrap delta short across seam');
  ok(wrapX(295) < 292 && wrapX(295) >= -10, 'wrapX brings 295 into range');
  ok(wrapX(-12) >= -10, 'wrapX brings -12 into range');
}

// ── JOUST resolution: higher wins, equal bounces ──
console.log('joust resolution');
{
  const e = eng();
  const p = e.players[0];
  // spawn one enemy manually
  function mkEnemy(x, y) { return { kind: 'enemy', type: 'bounder', x, y, vx: 0, vy: 0, vxi: 0, face: -1, wingDown: 0, ptimup: 0, onGround: false, alive: true, materializing: 0, decision: 99, id: 999 }; }
  // player higher than enemy → player wins, enemy dies + egg
  p.x = 100; p.y = 100; p.alive = true; p.materializing = 0; p.onGround = false;
  const en = mkEnemy(100, 120); e.enemies = [en];
  const s0 = p.score;
  e.joust(p, en);
  ok(!en.alive, 'higher player unseats enemy');
  ok(p.score === s0 + DATA.SCORE.BOUNDER, 'player awarded 500 for bounder');
  ok(e.eggs.length === 1, 'egg dropped on unseat');
  // enemy higher than player → player dies
  const e2 = eng();
  const p2 = e2.players[0]; p2.x = 50; p2.y = 130; p2.alive = true; p2.materializing = 0; p2.onGround = false; p2.lives = 3;
  const en2 = mkEnemy(50, 100); e2.enemies = [en2];
  e2.joust(p2, en2);
  ok(!p2.alive && p2.lives === 2, 'lower player dies, loses a life');
  // equal height → bounce, nobody dies
  const e3 = eng();
  const p3 = e3.players[0]; p3.x = 50; p3.y = 110; p3.alive = true; p3.materializing = 0; p3.onGround = false;
  const en3 = mkEnemy(52, 110); e3.enemies = [en3];
  const bounced = e3.events.length;
  e3.joust(p3, en3);
  ok(p3.alive && en3.alive, 'equal lance height → both survive (bounce)');
  ok(e3.events.some(ev => ev.type === 'bounce'), 'bounce event emitted');
}

console.log('equal-height bounce remains non-lethal across ticks');
{
  const e = eng();
  const p = e.players[0];
  Object.assign(p, { x: 100, y: 100, vx: 0, vy: 0, vxi: 0, face: 1, wingDown: 0,
    flapHeld: false, onGround: false, alive: true, materializing: 0, safe: false });
  const q = {
    kind: 'enemy', type: 'bounder', x: 100, y: 100, vx: 0, vy: 0, vxi: 0, face: -1,
    wingDown: 0, ptimup: 0, onGround: false, alive: true, materializing: 0,
    decision: 999, wantFace: 1, flapClock: 999, skid: 0, runTier: 0, runStep: 0,
    grabbed: null, lineage: 0, id: 1001,
  };
  e.enemies = [q]; e.pool = []; e.eggs = []; e.pteros = [];
  e.resolveCollisions();
  ok(p.alive && q.alive && !e.birdsOverlap(p, q), 'tie bounce separates the opaque pixel masks without a kill');
  for (let i = 0; i < 8; i++) e.tick([{}]);
  ok(p.alive && q.alive, 'separated equal-height riders remain alive over subsequent full ticks');
}

console.log('pixel-mask collision narrow phase');
{
  const e = eng(); const p = e.players[0], q = e.enemies[0];
  p.x = 100; p.y = 100; p.face = 1; p.onGround = false; p.materializing = 0;
  q.x = 116; q.y = 100; q.face = -1; q.onGround = false; q.materializing = 0;
  ok(!e.birdsOverlap(p, q), 'discovered dx=16 mask edge misses despite overlapping broad boxes');
  q.x = 115;
  ok(e.birdsOverlap(p, q), 'adjacent discovered dx=15 opaque pixels collide');
  p.x = -8; q.x = 290;
  ok(e.birdsOverlap(p, q), 'opaque bird masks collide correctly across the horizontal wrap seam');
}

console.log('ordinary platform landings are silent');
{
  const e = eng({ wave: 1, seed: 1 });
  for (const b of [e.players[0], e.enemies[0]]) {
    Object.assign(b, { x: 120, y: 73, vx: 0, vy: 0.8, vxi: 0, onGround: false,
      materializing: 0, alive: true, grabbed: null, wingDown: 0, flapHeld: false, ptimup: 0 });
    e.events.length = 0; e.integrate(b);
    ok(b.onGround && b.y === 74, `${b.kind} lands on the platform top`);
    ok(!e.events.some(ev => ev.type === 'thud' || ev.type === 'cthud'), `${b.kind} top-surface landing makes no collision sound`);
  }
}

console.log('enemy cliff collision recovery');
{
  for (const [idx, type] of ['bounder', 'hunter', 'shadow'].entries()) {
    const e = eng({ wave: 1, seed: 1 });
    const p = e.players[0];
    Object.assign(p, { x: 127, y: 203, vx: 0, vy: 0, vxi: 0, alive: true,
      materializing: 0, out: false, safe: true, onGround: true });
    const foe = {
      kind: 'enemy', type, x: 267, y: 138, vx: -2, vy: -0.5, vxi: -8, face: -1,
      wingDown: 0, ptimup: 0, onGround: false, alive: true, materializing: 0,
      decision: 0, aim: null, wantFace: -1, wander: 0, flapClock: 0,
      skid: 0, runTier: 0, runStep: 0, grabbed: null, lineage: 0, id: 9100 + idx,
    };
    e.enemies = [foe]; e.pool = []; e.eggs = []; e.pteros = []; e.pteroPool = 0;
    let escaped = false, contactRun = 0, maxContactRun = 0, contacts = 0, contactOrigin = null;
    const contactCells = new Map();
    for (let frame = 0; frame < 300; frame++) {
      const s = tick(e);
      const hits = s.events.filter(ev => ev.type === 'cthud' && ev.birdId === foe.id).length;
      contacts += hits;
      contactRun = hits ? contactRun + 1 : 0; maxContactRun = Math.max(maxContactRun, contactRun);
      if (hits) {
        if (!contactOrigin) contactOrigin = { x: foe.x, y: foe.y };
        const key = `${Math.round(foe.x)},${Math.round(foe.y)}`;
        contactCells.set(key, (contactCells.get(key) || 0) + hits);
      }
      if (contactOrigin && foe.alive && (foe.onGround || Math.abs(wrapDelta(contactOrigin.x, foe.x)) > 18 || Math.abs(foe.y - contactOrigin.y) > 18)) escaped = true;
    }
    const sameSpotContacts = Math.max(0, ...contactCells.values());
    ok(contacts > 0, `${type} registers an authentic cliff-thud contact`);
    ok(escaped, `${type} recovers after meeting the upper-right ledge`);
    ok(maxContactRun <= 4, `${type} does not collide on every simulation frame`);
    ok(sameSpotContacts <= 4, `${type} does not spam cliff-thuds from one ledge point`);
  }
}

console.log('player cliff collision recovery');
{
  const e = eng({ wave: 1, seed: 1 });
  const p = e.players[0];
  Object.assign(p, { x: 45.89178861266035, y: 137.1640625, vx: -2, vy: 0.3828125,
    vxi: -8, face: 1, wingDown: 0, flapHeld: false, ptimup: 100, onGround: false,
    alive: true, materializing: 0, safe: false, skid: 0, runTier: 0 });
  const startY = p.y;
  e.animFrame = 2077; e.events.length = 0; e.integrate(p);
  ok(e.events.some(ev => ev.type === 'cthud' && ev.player && ev.birdId === p.id), 'player cliff contact uses the cliff-thud event');
  ok(p.y <= startY - 2 && p.vy < 0, 'descending player separates upward and rebounds from the cliff');
  let run = 1, maxRun = 1;
  for (let i = 0; i < 20; i++) {
    e.events.length = 0; e.animFrame++; e.integrate(p);
    run = e.events.some(ev => ev.type === 'cthud' && ev.birdId === p.id) ? run + 1 : 0;
    maxRun = Math.max(maxRun, run);
  }
  ok(maxRun <= 4, 'player does not enter a repeated cliff-contact loop');
}

console.log('enemy lava emergency is local to exposed lava');
{
  const e = eng({ wave: 3, seed: 2 });
  const foe = e.enemies[0];
  Object.assign(foe, { materializing: 0, onGround: false, x: 127, y: 178, vy: 0,
    vxi: 0, vx: 0, face: 1, decision: 999, aim: e.players[0], wander: 0, flapClock: 0 });
  e.controlEnemy(foe);
  ok(foe.flapClock === 10, 'solid lower playfield uses normal Bounder climb cadence, not lava panic');
  Object.assign(foe, { x: 20, y: DATA.WORLD.FLOOR - 12, vy: 0, vxi: 0, vx: 0,
    face: 1, decision: 999, aim: e.players[0], wander: 0, flapClock: 0 });
  e.controlEnemy(foe);
  ok(foe.flapClock === 5, 'enemy uses emergency flap cadence only low over an exposed lava gap');
}

// ── EGG ladder + reset + mid-air bonus ──
console.log('egg scoring');
{
  const e = eng();
  const p = e.players[0]; p.eggStreak = 0; p.score = 0;
  function egg(landed, state) { return { kind: 'egg', x: p.x, y: p.y, vx: 0, vy: 0, landed, touched: landed, state: state || 'egg', hatch: 100, dead: false, anim: 0, id: 1 }; }
  const g1 = egg(true, 'egg'); e.eggs = [g1]; e.collectEgg(g1, p);
  ok(p.score === 250, 'egg 1 = 250');
  const g2 = egg(true, 'egg'); e.collectEgg(g2, p); ok(p.score === 750, 'egg 2 = +500 (750)');
  const g3 = egg(true, 'egg'); e.collectEgg(g3, p); ok(p.score === 1500, 'egg 3 = +750 (1500)');
  const g4 = egg(true, 'egg'); e.collectEgg(g4, p); ok(p.score === 2500, 'egg 4 = +1000 (2500)');
  const g5 = egg(true, 'egg'); e.collectEgg(g5, p); ok(p.score === 3500, 'egg 5 = +1000 (cap)');
  // mid-air bonus
  const e2 = eng(); const q = e2.players[0]; q.eggStreak = 0; q.score = 0;
  const air = { kind: 'egg', x: q.x, y: q.y, vx: 0, vy: 2, landed: false, state: 'egg', hatch: 100, dead: false, id: 2 };
  e2.collectEgg(air, q);
  ok(q.score === 250 + 500, 'mid-air 1st egg = 250 + 500 bonus = 750');
  // reset on wave start
  q.eggStreak = 3;
  e2.startWave(2);
  ok(e2.players[0].eggStreak === 0, 'egg streak resets on new wave');
  // reset on death
  const e3 = eng(); const r = e3.players[0]; r.eggStreak = 2; r.alive = true; r.lives = 3;
  e3.killBird(r, 'lava');
  ok(r.eggStreak === 0, 'egg streak resets on death');
}

// ── egg mid-air bonus voided after a platform bounce (touched flag) ──
console.log('egg touched flag');
{
  const e = eng();
  const p = e.players[0]; p.eggStreak = 0; p.score = 0;
  // egg that bounced off a platform: touched=true, still airborne (landed=false)
  const bounced = { kind: 'egg', x: p.x, y: p.y, vx: 0, vy: -1, landed: false, touched: true, state: 'egg', hatch: 100, dead: false, id: 9 };
  e.collectEgg(bounced, p);
  ok(p.score === 250, 'bounced egg (touched) gets ladder value only, NO +500 air bonus');
  // truly-in-air egg: touched=false → +500
  const e2 = eng(); const q = e2.players[0]; q.eggStreak = 0; q.score = 0;
  const air = { kind: 'egg', x: q.x, y: q.y, vx: 0, vy: 2, landed: false, touched: false, state: 'egg', hatch: 100, dead: false, id: 10 };
  e2.collectEgg(air, q);
  ok(q.score === 750, 'never-touched egg still gets +500 air bonus');
}

console.log('settled-only hatch clock and lineage cap');
{
  const e = eng();
  const air = { kind: 'egg', x: 146, y: 100, vx: 0, vy: 0, landed: false, touched: false, state: 'egg', hatch: 100, dead: false, anim: 0, origin: 'bounder', lineage: 1, id: 20 };
  e.updateEgg(air);
  ok(air.hatch === 100, 'airborne egg hatch timer does not run');
  const settled = { kind: 'egg', x: 146, y: 204, vx: 0, vy: 0, landed: true, touched: true, state: 'egg', hatch: 100, dead: false, anim: 0, origin: 'bounder', lineage: 1, id: 21 };
  e.updateEgg(settled);
  ok(settled.hatch === 99, 'settled egg hatch timer advances');
  const foe = e.enemies[0]; foe.materializing = 0; foe.alive = true; foe.lineage = 4;
  const before = e.eggs.length; e.unseatEnemy(foe, e.players[0]);
  ok(e.eggs.length === before, 'fourth-generation rider cannot produce another egg');
}

console.log('egg-wave hatch concurrency');
{
  function forceDue(e) {
    for (const g of e.eggs) { g.hatch = 1; g.vy = 0; g.landed = true; }
    for (const g of e.eggs) e.updateEgg(g);
  }
  const e5 = eng({ wave: 5 });
  forceDue(e5);
  ok(e5.enemyCap === 6 && e5.hatchingRiderCount() === 6, 'wave 5 admits at most six hatching/mounted riders');
  ok(e5.eggs.filter(g => g.state === 'hatching').length === 6 && e5.eggs.filter(g => g.state === 'shake').length === 6,
    'wave-5 eggs beyond the six-rider cap wait in the shake state');
  const finished = e5.eggs.find(g => g.state === 'hatching'); finished.dead = true;
  const waiting = e5.eggs.find(g => g.state === 'shake'); e5.updateEgg(waiting);
  ok(waiting.state === 'hatching' && e5.hatchingRiderCount() === 6, 'freeing one wave-5 rider slot admits exactly one waiting egg');

  const e10 = eng({ wave: 10 });
  forceDue(e10);
  ok(e10.enemyCap === 8 && e10.hatchingRiderCount() === 8, 'wave 10 uses its ROM-table eight-rider hatch cap');
  ok(e10.eggs.filter(g => g.state === 'hatching').length === 8 && e10.eggs.filter(g => g.state === 'shake').length === 4,
    'four wave-10 eggs wait when eight riders are already pending');
}

// ── team-wave bonus voided when a player unseats their partner ──
console.log('team bonus void');
{
  const e = new JoustEngine({ mode: '2p', wave: 2, lives: 3, seed: 8, holdUntilInput: false }); // survival→team in 2p
  e.started = true;
  ok(e.waveType === 'survival' && e.mode === '2p', 'wave 2 is the team wave in 2P');
  const [a, b] = e.players; a.score = 0; b.score = 0; a.alive = true; b.alive = true; a.deathsThisWave = 0;
  a.x = 100; a.y = 100; a.onGround = false; b.x = 100; b.y = 120; b.onGround = false; // a higher → a unseats b
  e.joust(a, b);
  e.awardWaveBonus();
  ok(a.score === 0, 'aggressor gets NO team bonus after unseating partner');
  // clean team wave → both get 3000
  const e2 = new JoustEngine({ mode: '2p', wave: 2, lives: 3, seed: 9, holdUntilInput: false }); e2.started = true;
  const [c, d] = e2.players; c.score = 0; d.score = 0; c.deathsThisWave = 0; d.deathsThisWave = 0;
  e2.awardWaveBonus();
  ok(c.score === 3000 && d.score === 3000, 'clean team wave: each player +3000');
}

// ── PTERODACTYL window ──
console.log('pterodactyl');
{
  const e = eng();
  const p = e.players[0]; p.x = 100; p.y = 100; p.alive = true; p.materializing = 0; p.lives = 3;
  function pt(face, y, attack) { return { kind: 'ptero', ptKind: 'baiter', x: 100, y, vx: 0, vy: 0, face, attack: attack || 0, attackTimer: 50, alive: true, id: 5 }; }
  // wrong: same facing → player dies
  p.face = 1;
  const a = pt(1, 100, 0); e.pteros = [a]; e.baiterCount = 1;
  e.pteroHit(p, a);
  ok(!p.alive && a.alive, 'same-facing ptero kills player');
  // correct: opposite facing, on beak side, lance aligned → ptero dies
  const e2 = eng(); const q = e2.players[0];
  q.x = 100; q.face = -1; q.alive = true; q.materializing = 0; q.score = 0;
  // beak side: ptero faces 1 (right), player must be to the right (dx>0)
  q.x = 108; const b = pt(1, q.y + 15 - 2, 0); // beakY = y-2; lanceY = q.y-15; align y so lanceY≈beakY
  b.y = (q.y - 15) + 2; // beakY = b.y-2 = q.y-15 = lanceY
  e2.pteros = [b];
  e2.pteroHit(q, b);
  ok(!b.alive && q.alive && q.score === DATA.SCORE.PTERO, 'beak hit kills ptero for 1000');

  function boundary(delta, attack, beakSide = true) {
    const sim = eng(); const rider = sim.players[0];
    Object.assign(rider, { x: beakSide ? 108 : 92, y: 100, face: -1, alive: true, materializing: 0, score: 0 });
    const bird = pt(1, (rider.y - 15) + 2 + delta, attack);
    sim.pteroHit(rider, bird);
    return { rider, bird };
  }
  const closedInside = boundary(2, 0);
  ok(!closedInside.bird.alive && closedInside.rider.alive, 'closed-beak Rev.4 window includes exactly ±2 px');
  const closedOutside = boundary(3, 0);
  ok(closedOutside.bird.alive && !closedOutside.rider.alive, 'closed-beak Rev.4 window excludes ±3 px');
  const attackInside = boundary(3, 1);
  ok(!attackInside.bird.alive && attackInside.rider.alive, 'attack-frame Rev.4 window includes exactly ±3 px');
  const attackOutside = boundary(4, 1);
  ok(attackOutside.bird.alive && !attackOutside.rider.alive, 'attack-frame Rev.4 window excludes ±4 px');
  const wrongSide = boundary(0, 1, false);
  ok(wrongSide.bird.alive && !wrongSide.rider.alive, 'opposite facing still loses from the pterodactyl tail side');
}

console.log('pterodactyls do not gate wave completion');
{
  const e = eng({ wave: 8 });
  e.enemies = []; e.pool = []; e.eggs = [];
  e.pteros = [{ kind: 'ptero', ptKind: 'scheduled', x: 20, y: 80, vx: 1, vy: 0, face: 1, attack: 0, alive: true, id: 70 }];
  e.pteroPool = 2;
  e.checkWaveClear();
  ok(e.waveCleared, 'clearing all riders/eggs ends a pterodactyl wave');
  ok(e.pteros.length === 0 && e.pteroPool === 0, 'scheduled pterodactyls leave on wave clear');
}

console.log('outer-floor burn exposes side lava');
{
  const e2 = eng({ wave: 2 });
  ok(!e2.overLava(20) && !e2.overLava(270), 'wave 2 outer floor covers both side pits');
  const e3 = eng({ wave: 3 });
  ok(e3.overLava(20) && e3.overLava(270), 'wave 3 exposes lava on both sides');
  ok(e3.overLava(47.99) && !e3.overLava(48), 'left lava/base boundary is exactly x=48');
  ok(!e3.overLava(146), 'central CLIF5 island remains solid after the burn');
  ok(!e3.overLava(234) && e3.overLava(234.01), 'right base/lava boundary is exactly x=234');
}

// ── LAVA troll grab/escape/death ──
console.log('lava troll');
{
  const e = eng({ wave: 4 });
  e.started = true;
  const p = e.players[0];
  p.x = 20; p.y = DATA.WORLD.FLOOR - 5; p.onGround = false; p.alive = true; p.materializing = 0; p.vy = 0;
  // Wave 3 burns the outer floor, exposing side pits; the central island remains solid.
  ok(e.overLava(20) && !e.overLava(146), 'wave 4 has side lava around a solid central island');
  e.updateTrolls();
  ok(p.grabbed, 'troll grabs low bird over lava');
  // escape by rising fast
  p.vy = DATA.PHYS.TROLL_BREAKFREE - 0.1;
  e.updateTrolls();
  ok(!p.grabbed, 'rising faster than break-free escapes');
  // dragged to lava dies
  p.grabbed = { pull: 0.1, t: 0 }; p.y = DATA.WORLD.FLOOR + 8; p.vy = 1; p.alive = true; p.lives = 3;
  e.updateTrolls();
  ok(!p.alive, 'reaching lava depth kills grabbed bird');
}

console.log('only one lava troll hand');
{
  const e = new JoustEngine({ mode: '2p', wave: 4, holdUntilInput: false, seed: 11 });
  e.started = true; e.enemies = []; e.pool = [];
  const [a, b] = e.players;
  Object.assign(a, { x: 20, y: DATA.WORLD.FLOOR - 5, onGround: false, alive: true, materializing: 0, vy: 0, safe: false });
  Object.assign(b, { x: 270, y: DATA.WORLD.FLOOR - 5, onGround: false, alive: true, materializing: 0, vy: 0, safe: false });
  e.updateTrolls();
  ok([a, b].filter(p => !!p.grabbed).length === 1 && e.trolls.length === 1,
    'LAVNBR permits exactly one hand when two birds enter opposite pits together');
}

// ── EXTRA MAN every 20000 ──
console.log('extra man');
{
  const e = eng();
  const p = e.players[0]; p.lives = 3; p.score = 0; p.nextExtra = 20000;
  e.addScore(p, 19999); ok(p.lives === 3, 'no extra man before 20000');
  e.addScore(p, 1); ok(p.lives === 4, 'extra man at 20000');
  e.addScore(p, 40000); ok(p.lives === 6, 'two more extra men crossing 60000');
}

// ── SURVIVAL bonus ──
console.log('survival bonus');
{
  const e = eng({ wave: 2 }); // survival wave (1p)
  e.started = true;
  ok(e.waveType === 'survival', 'wave 2 is survival');
  const p = e.players[0]; p.deathsThisWave = 0; p.score = 0; p.out = false;
  e.awardWaveBonus();
  ok(p.score === DATA.SCORE.SURVIVE_BONUS, 'survival bonus 3000 when no deaths');
  // with a death: no bonus
  const e2 = eng({ wave: 2 }); const q = e2.players[0]; q.deathsThisWave = 1; q.score = 0;
  e2.awardWaveBonus();
  ok(q.score === 0, 'no survival bonus after a death');
}

// ── HOLD until first input ──
console.log('hold until first input');
{
  const e = new JoustEngine({ holdUntilInput: true, seed: 1 });
  const p = e.players[0]; const y0 = p.y;
  e.tick([{}]); // no input
  ok(!e.started && p.y === y0, 'physics frozen until first input');
  e.tick([{ flap: true }]);
  ok(e.started, 'started after flap input');
}

console.log('respawn input safety');
{
  const e = eng(); const p = e.players[0];
  p.alive = false; p.out = false; p.respawn = 1;
  e.checkWaveClear();
  ok(p.alive && p.materializing === 60 && p.safe, 'respawn materializes with collision safety');
  for (let i = 0; i < 60; i++) e.controlPlayer(p, {});
  for (let i = 0; i < 601; i++) e.controlPlayer(p, {});
  ok(p.safe, 'respawn protection remains indefinitely beyond 600 idle frames');
  const foe = e.enemies[0];
  Object.assign(foe, { x: p.x, y: p.y, face: -p.face, onGround: false, alive: true, materializing: 0, wingDown: 0, skid: 0, runTier: 0 });
  ok(e.birdsOverlap(p, foe), 'respawn safety collision check has a real opaque-mask overlap');
  const lives = p.lives; e.resolveCollisions();
  ok(p.alive && p.lives === lives && foe.alive, 'idle-safe respawn ignores an overlapping enemy');
  e.controlPlayer(p, { flap: true });
  ok(!p.safe && !p.onGround, 'fresh flap releases respawn safety and takes off');
}

console.log('two-player start safety is independent');
{
  const e = new JoustEngine({ mode: '2p', holdUntilInput: true, seed: 12 });
  const [p1, p2] = e.players;
  e.tick([{ flap: true, flapHeld: true }, {}]);
  ok(e.started && !p1.safe && p2.safe, 'P1 input starts play without releasing P2 safety');
  for (let i = 0; i < 601; i++) e.controlPlayer(p2, {});
  ok(p2.safe && p2.onGround, 'P2 remains safely parked beyond 600 frames without P2 input');
  e.controlPlayer(p2, { flap: true });
  ok(!p2.safe && !p2.onGround, 'P2 safety releases only on P2 input');
}

console.log('hit-stop input buffering');
{
  const e = eng(); const p = e.players[0]; p.onGround = true; p.safe = false;
  e.freezeFrames = 1;
  e.tick([{ flap: true }]);
  ok(e.inputBuffer[0].flap && p.onGround, 'flap edge is retained during hit-stop');
  e.tick([{}]);
  ok(!p.onGround && !e.inputBuffer[0].flap, 'buffered flap executes on the first active tick');
}

console.log('materialization input buffering');
{
  const e = eng(); const p = e.players[0];
  p.onGround = true; p.safe = true; p.materializing = 2; e.inputBuffer[0].flap = false;
  e.tick([{ flap: true }]);
  ok(p.materializing === 1 && p.onGround && e.inputBuffer[0].flap, 'flap edge is retained while materialization has two frames left');
  e.tick([{}]);
  ok(p.materializing === 0 && p.onGround && e.inputBuffer[0].flap, 'buffer survives the final materialization frame');
  e.tick([{}]);
  ok(!p.safe && !p.onGround && !e.inputBuffer[0].flap, 'buffered materialization flap executes exactly once when control returns');
}

// ── determinism ──
console.log('determinism');
{
  function run() {
    const e = new JoustEngine({ holdUntilInput: false, seed: 777, wave: 1 });
    let acc = 0;
    for (let i = 0; i < 600; i++) {
      const inp = [{ flap: i % 12 === 0, right: i % 3 === 0, left: i % 5 === 0 }];
      e.tick(inp);
      acc += e.players[0].x + e.players[0].y + e.enemies.length + e.eggs.length;
    }
    return Math.round(acc);
  }
  ok(run() === run(), 'engine is deterministic across identical runs');
}

// ── full wave playthrough smoke test (no crash / no softlock over 1p auto-play) ──
console.log('smoke: auto-play waves');
{
  for (const wv of [1, 2, 4, 5, 8]) {
    const e = new JoustEngine({ holdUntilInput: false, seed: 5, wave: wv });
    let crashed = false;
    try {
      for (let i = 0; i < 4000 && !e.waveCleared; i++) {
        e.tick([{ flap: i % 7 === 0, right: (i >> 5) % 2 === 0, left: (i >> 5) % 2 === 1 }]);
      }
    } catch (err) { crashed = true; console.log('   crash wave', wv, err.message); }
    ok(!crashed, `wave ${wv} auto-play does not crash`);
  }
}

// ── INTEGRATION: ptero beak-kill via full resolveCollisions path ──
console.log('integration: ptero beak kill in-sim');
{
  const e = eng({ wave: 8 });
  e.started = true;
  const p = e.players[0]; p.x = 108; p.y = 100; p.face = -1; p.alive = true; p.materializing = 0; p.onGround = false; p.score = 0; p.lives = 3;
  // ptero faces right (1), player to its right (dx>0), lance aligned to beak
  const beakY = 100; // want beakY == lanceY(=p.y-15) → set ptero.y so ptero.y-2 = p.y-15
  const pt = { kind: 'ptero', ptKind: 'scheduled', x: 100, y: (p.y - 15) + 2, vx: 0, vy: 0, face: 1, attack: 20, attackTimer: 40, alive: true, id: 77 };
  e.pteros = [pt];
  e.resolveCollisions();
  ok(!pt.alive && p.alive && p.score === DATA.SCORE.PTERO, 'ptero killed via beak in resolveCollisions (1000 pts)');
}

// ── INTEGRATION: troll grab + escape across full ticks ──
console.log('integration: troll over full ticks');
{
  const e = new JoustEngine({ wave: 4, lives: 3, seed: 3, holdUntilInput: false });
  e.started = true;
  const p = e.players[0];
  // hover low over the left-side lava pit, not flapping → should get grabbed within a few ticks
  let grabbed = false;
  for (let i = 0; i < 40; i++) {
    p.x = 20; p.y = DATA.WORLD.FLOOR - 6; p.onGround = false; p.alive = true; p.vy = 0.2;
    e.updateTrolls();
    if (p.grabbed) { grabbed = true; break; }
  }
  ok(grabbed, 'troll grabs a low bird over the pit within a few ticks');
  // now rapid-flap to escape
  p.vy = DATA.PHYS.TROLL_BREAKFREE - 0.2;
  e.updateTrolls();
  ok(!p.grabbed, 'break-free velocity releases the grab');
}

// ── INTEGRATION: wave advance & type change ──
console.log('integration: nextWave');
{
  const e = eng({ wave: 1 });
  ok(e.waveType === 'normal', 'start normal');
  e.nextWave();
  ok(e.wave === 2 && e.waveType === 'survival', 'nextWave → wave 2 survival');
  e.nextWave(); e.nextWave();
  ok(e.wave === 4 && e.waveType === 'gladiator', 'advance to gladiator wave 4');
  ok(e.info.trollActive, 'troll active by wave 4');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
