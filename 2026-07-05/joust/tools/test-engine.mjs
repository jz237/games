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

// ── PHYSICS: gravity wings up/down ──
console.log('gravity');
{
  const e = eng();
  const p = e.players[0];
  // put player airborne, wings up (glide)
  p.onGround = false; p.y = 100; p.vy = 0; p.wingDown = 0; p.vxi = 0;
  const vy0 = p.vy;
  e.integrate(p);
  approx(p.vy - vy0, DATA.PHYS.GRAV_UP, 1e-9, 'wings-up gravity = 8/256');
  // wings down
  p.onGround = false; p.y = 100; p.vy = 0; p.wingDown = 3;
  const vy1 = p.vy;
  e.integrate(p);
  approx(p.vy - vy1, DATA.PHYS.GRAV_DOWN, 1e-9, 'wings-down gravity = 4/256');
}

// ── PHYSICS: flap impulse decay ──
console.log('flap impulse');
{
  const e = eng();
  const p = e.players[0];
  p.onGround = false; p.vy = 0;
  e.doFlap(p, 0);
  approx(p.vy, DATA.PHYS.FLAP_DV, 1e-9, 'one flap adds FLAP_DV upward (strong lift)');
  ok(DATA.PHYS.FLAP_DV < -0.6, 'flap is a satisfying lift (not the old weak -0.36)');
  // repeated flaps clamp at MAX_RISE
  for (let i = 0; i < 12; i++) e.doFlap(p, 0);
  approx(p.vy, -DATA.PHYS.MAX_RISE, 1e-6, 'rapid flaps clamp upward speed at MAX_RISE');
}

// ── PHYSICS: horizontal FLYX table ──
console.log('horizontal control (continuous, correct direction)');
{
  const e = eng();
  const p = e.players[0];
  const MH = DATA.PHYS.MAX_H;
  // hold RIGHT → +vx, capped at MAX_H
  p.vx = 0; for (let i = 0; i < 80; i++) e.airMove(p, 1, MH);
  ok(p.vx > 0 && Math.abs(p.vx - MH) < 1e-6, 'hold right → +vx (not inverted), capped at MAX_H');
  // hold LEFT → -vx
  p.vx = 0; for (let i = 0; i < 80; i++) e.airMove(p, -1, MH);
  ok(p.vx < 0 && Math.abs(p.vx + MH) < 1e-6, 'hold left → -vx (not inverted)');
  // release → drag toward 0
  p.vx = 1.5; for (let i = 0; i < 50; i++) e.airMove(p, 0, MH);
  ok(Math.abs(p.vx) < 0.25, 'release → drag decays speed');
  // reversing brakes harder than plain accel (responsive turns)
  p.vx = 1.4; e.airMove(p, -1, MH); const brakeStep = 1.4 - p.vx;
  p.vx = 0; e.airMove(p, 1, MH); const accelStep = p.vx;
  ok(brakeStep > accelStep * 1.5, 'reversing brakes harder than accelerating');
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
}

// ── LAVA troll grab/escape/death ──
console.log('lava troll');
{
  const e = eng({ wave: 4 });
  e.started = true;
  const p = e.players[0];
  p.x = 146; p.y = DATA.WORLD.FLOOR - 5; p.onGround = false; p.alive = true; p.materializing = 0; p.vy = 0;
  // ensure over lava (central pit): bridge gone at wave 4
  ok(e.overLava(146), 'central pit is lava at wave 4');
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
  // hover low over the central lava pit, not flapping → should get grabbed within a few ticks
  let grabbed = false;
  for (let i = 0; i < 40; i++) {
    p.x = 146; p.y = DATA.WORLD.FLOOR - 6; p.onGround = false; p.alive = true; p.vy = 0.2;
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
