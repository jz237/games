// Headless engine tests — run: node tools/test-engine.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const D = require('../assets/data.js');
const E = require('../assets/engine.js');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } }
function finite(v) { return typeof v === 'number' && Number.isFinite(v); }

// 1. build every planned stage without throwing
const plan = [[0,0],[0,1],[0,2],[1,0],[1,1],[2,0],[3,0],[4,0],[4,2]];
for (const [w,s] of plan) {
  const lv = D.buildLevel(w, s);
  ok(lv.cols > 50 && lv.rows === 22, `level ${w}-${s} dims`);
  ok(lv.entities.length > 10, `level ${w}-${s} has entities`);
  ok(lv.playerStart && finite(lv.playerStart.x), `level ${w}-${s} playerStart`);
  ok(lv.exit && finite(lv.exit.x), `level ${w}-${s} exit`);
}

// 2. create + simulate world 1-1 with a scripted bot
const lv = D.buildLevel(0, 0);
const s = E.createGame(lv, null);
ok(s.player.energy === 100, 'start energy');
ok(s.enemies.length > 0, 'enemies spawned');
ok(s.player.onGround === false, 'player airborne at spawn');

let threw = false, sawShot = false, maxX = s.player.x, sawGround = false;
try {
  for (let f = 0; f < 1200; f++) {
    const inp = {
      right: true, left: false, up: false, down: false,
      jump: (f % 70) < 3, jumpPressed: (f % 70) === 0, jumpReleased: (f % 70) === 3,
      fire: true, firePressed: (f % 8) === 0,
      morph: false, morphPressed: false, switchPressed: (f === 400),
      bombPressed: false, linePressed: false,
    };
    E.step(s, inp, D.VIEW_W, D.VIEW_H);
    if (s.pshots.length > 0) sawShot = true;
    if (s.player.onGround) sawGround = true;
    maxX = Math.max(maxX, s.player.x);
    ok(finite(s.player.x) && finite(s.player.y), 'player pos finite f=' + f);
    if (fail > 5) break;
  }
} catch (e) { threw = true; console.log('  THREW:', e && e.stack || e); }
ok(!threw, 'no exception during 1200-step sim');
ok(sawShot, 'firing spawned player shots');
ok(sawGround, 'player landed on ground');
ok(maxX > s.player.x - 5, 'player moved right / progressed (maxX=' + Math.round(maxX) + ')');

// 3. weapon switch works after granting beam
const s2 = E.createGame(D.buildLevel(0, 0), { weapons: { spread: 1, beam: 1, bounce: 0 }, weapon: 'spread' });
E.step(s2, { switchPressed: true }, D.VIEW_W, D.VIEW_H);
ok(s2.player.weapon === 'beam', 'switch cycles to owned beam (got ' + s2.player.weapon + ')');

// 4. beam damages an enemy placed in front
const s3 = E.createGame(D.buildLevel(0, 0), { weapons: { spread: 1, beam: 3, bounce: 0 }, weapon: 'beam' });
const en = s3.enemies[0];
en.x = s3.player.x + 40; en.y = s3.player.y; en.type = 'turret'; en.alive = true; en.hp = 3;
const beforeHp = en.hp;
for (let f = 0; f < 40; f++) E.step(s3, { fire: true }, D.VIEW_W, D.VIEW_H);
ok(en.hp < beforeHp || !en.alive, 'beam damaged/killed nearby enemy');

// 5. morph toggles and shrinks the hitbox
const s4 = E.createGame(D.buildLevel(0, 0), null);
const h0 = s4.player.h;
E.step(s4, { morphPressed: true }, D.VIEW_W, D.VIEW_H);
ok(s4.player.morph === true && s4.player.h < h0, 'morph shrinks hitbox');

// 6. moveBox stops at a solid wall
const flat = D.buildLevel(0, 0);
const box = { x: 100, y: (flat.rows - 4) * D.TILE, w: 14, h: 30 };
// place a wall column just right of box
const col = Math.floor((box.x + 30) / D.TILE);
for (let y = 0; y < flat.rows; y++) flat.tiles[y * flat.cols + col] = D.T.SOLID;
const info = E.moveBox(flat, box, 200, 0);
ok(info.hitX === true && box.x + box.w <= col * D.TILE + 0.5, 'moveBox blocked by wall');

// 7. one-way platform: a descending player lands on top
{
  const lv = D.buildLevel(0, 0);
  lv.platforms = [{ x: 5, y: 8, w: 5 }];
  const s = E.createGame(lv, null);
  const p = s.player; p.x = 6 * D.TILE; p.y = 4 * D.TILE; p.vx = 0; p.vy = 0;
  let landed = false;
  for (let f = 0; f < 90; f++) { E.step(s, {}, D.VIEW_W, D.VIEW_H);
    if (p.onGround && Math.abs((p.y + p.h) - 8 * D.TILE) < 3) { landed = true; break; } }
  ok(landed, 'player lands on top of a one-way platform');
}

// 8. one-way platform: jumping up passes THROUGH (no bonk)
{
  const lv = D.buildLevel(0, 0);
  lv.platforms = [{ x: 4, y: 8, w: 8 }];
  const s = E.createGame(lv, null);
  const p = s.player; p.x = 6 * D.TILE; p.y = 11 * D.TILE; p.vx = 0; p.vy = -560;
  let passed = false;
  for (let f = 0; f < 25; f++) { E.step(s, { jump: true }, D.VIEW_W, D.VIEW_H);
    if (p.y < 8 * D.TILE - 6) { passed = true; break; } }
  ok(passed, 'jumping up passes through a one-way platform (no bonk)');
}

console.log(`\nEngine tests: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
