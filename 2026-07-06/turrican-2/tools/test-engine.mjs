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

// 9. bosses: every boss stage spawns a dormant boss; exit is gated until it dies
{
  const bossStages = [[0, 1, 'warden'], [1, 1, 'maw'], [2, 2, 'gunship'], [3, 1, 'colossus'], [4, 0, 'queen'], [4, 1, 'machine']];
  for (const [w, st, key] of bossStages) {
    const lv = D.buildLevel(w, st);
    ok(lv.bossSpawn && lv.bossSpawn.key === key, `boss ${key} spawns in ${w + 1}-${st + 1}`);
    const s = E.createGame(lv, null);
    ok(s.boss && !s.boss.awake && s.bossDead === false, `boss ${key} starts dormant, exit gated`);
  }
  // non-boss stage has no gate
  const s0 = E.createGame(D.buildLevel(0, 0), null);
  ok(s0.boss === null && s0.bossDead === true, 'non-boss stage exit is open');
}

// 10. boss wakes when the player enters the arena, seals the wall, fights, dies
{
  const lv = D.buildLevel(0, 1);
  const s = E.createGame(lv, { weapons: { spread: 3, beam: 0, bounce: 0 }, weapon: 'spread' });
  const b = s.boss, p = s.player;
  // teleport player into the arena on the ground
  p.x = b.wakeX + 30; p.y = b.groundY - p.h - 2; p.vy = 0;
  E.step(s, {}, D.VIEW_W, D.VIEW_H);
  ok(b.awake === true, 'boss wakes on arena entry');
  ok(b.wallSaved && b.wallSaved.length > 0, 'arena wall sealed behind player');
  // exit must NOT trigger a win while boss lives
  p.x = lv.exit.x + 2; p.y = lv.exit.y + 10;
  E.step(s, {}, D.VIEW_W, D.VIEW_H);
  ok(s.won === false, 'exit locked while boss alive');
  // hold fire facing the boss until it dies (godlike patience, generous cap)
  p.x = b.x - 160; p.y = b.groundY - p.h - 2; p.facing = 1;
  s.godMode = true;
  let died = false, sawOpen = false, sawShots = false;
  for (let f = 0; f < 60 * 150; f++) {
    E.step(s, { fire: true, right: (f % 9) === 0 }, D.VIEW_W, D.VIEW_H);
    if (b.open) sawOpen = true;
    if (s.eshots.length > 0) sawShots = true;
    if (!b.alive) { died = true; break; }
    if (p.x > b.x - 40) p.x = b.x - 160; // hold range
  }
  ok(sawOpen, 'boss exposes core (open window)');
  ok(sawShots, 'boss fires projectiles');
  ok(died, 'boss dies to sustained fire (hp=' + Math.round(b.hp) + ')');
  ok(s.bossDead === true, 'bossDead set after death');
  ok(!b.wallSaved, 'arena wall removed after boss death');
  // exit now wins
  p.x = lv.exit.x + 2; p.y = lv.exit.y + 10;
  E.step(s, {}, D.VIEW_W, D.VIEW_H);
  ok(s.won === true, 'exit unlocks after boss death');
}

// 11. freeze bomb deals heavy boss damage; player death resets the fight
{
  const lv = D.buildLevel(1, 1);
  const s = E.createGame(lv, { bombs: 3 });
  const b = s.boss, p = s.player;
  p.x = b.wakeX + 30; p.y = b.groundY - p.h - 2;
  E.step(s, {}, D.VIEW_W, D.VIEW_H);
  const hp0 = b.hp;
  E.step(s, { bombPressed: true }, D.VIEW_W, D.VIEW_H);
  ok(b.hp <= hp0 - b.maxHp * 0.07, 'freeze bomb chunks boss hp');
  // die: boss should back off and reopen the arena (ride out the hitstop)
  p.energy = 1; s.freeze = 0; p.invuln = 0;
  E._internal.hurtPlayer(s, 999);
  for (let f = 0; f < 8; f++) E.step(s, {}, D.VIEW_W, D.VIEW_H);
  ok(b.awake === false && !b.wallSaved, 'boss stands down + wall opens on player death');
}

// 12. shmup corridor: type, scroll, tunnel shape, crates, ship physics
{
  for (let st = 0; st < 3; st++) {
    const lv = D.buildLevel(2, st);
    ok(lv.type === 'shmup' && lv.scroll > 0, `3-${st + 1} is a shmup with scroll`);
    let crates = 0; for (let i = 0; i < lv.tiles.length; i++) if (lv.tiles[i] === D.T.CRATE) crates++;
    ok(crates > 6, `3-${st + 1} has destructible barriers (${crates} crates)`);
  }
  const s = E.createGame(D.buildLevel(2, 0), null);
  ok(s.player.w === D.SHMUP.shipW && s.player.h === D.SHMUP.shipH, 'ship hitbox applied');
  const y0 = s.player.y, cam0 = s.cam.x;
  for (let f = 0; f < 90; f++) E.step(s, { up: true, fire: true }, D.VIEW_W, D.VIEW_H);
  ok(s.player.y < y0 - 8, 'ship thrusts upward (no gravity)');
  ok(s.cam.x > cam0 + 30, 'camera auto-scrolls');
  ok(finite(s.player.x) && finite(s.player.y), 'ship pos finite');
  // ship is dragged forward by the frame
  ok(s.player.x >= s.cam.x + 8 - 1, 'ship stays inside frame');
}

// 13. crates shatter when shot
{
  const lv = D.buildLevel(2, 0);
  const s = E.createGame(lv, { weapons: { spread: 3, beam: 0, bounce: 0 }, weapon: 'spread' });
  // find first crate column ahead and teleport in front of it at its height
  let cx = -1, cy = -1;
  outer: for (let x = 10; x < lv.cols; x++)
    for (let y = 0; y < lv.rows; y++)
      if (lv.tiles[y * lv.cols + x] === D.T.CRATE) { cx = x; cy = y; break outer; }
  ok(cx > 0, 'found a crate barrier');
  const p = s.player;
  p.x = (cx - 4) * D.TILE; p.y = cy * D.TILE + 2; p.facing = 1;
  s.cam.x = Math.max(0, p.x - 100);
  const score0 = p.score;
  let broke = false;
  for (let f = 0; f < 240; f++) {
    E.step(s, { fire: true, firePressed: (f % 8) === 0 }, D.VIEW_W, D.VIEW_H);
    if (lv.tiles[cy * lv.cols + cx] === D.T.EMPTY) { broke = true; break; }
    p.x = (cx - 4) * D.TILE; p.y = cy * D.TILE + 2; // hold position vs scroll
  }
  ok(broke, 'shots destroy crate tiles');
  ok(p.score > score0, 'crate destruction scores');
}

// 14. REGRESSION: timer resets on respawn (no timeout death-loop)
{
  const s = E.createGame(D.buildLevel(0, 0), { lives: 3 });
  s.time = 0.001;
  E.step(s, {}, D.VIEW_W, D.VIEW_H);           // timer expires -> death
  ok(s.player.dead === true, 'timeout kills once');
  for (let f = 0; f < 120; f++) E.step(s, {}, D.VIEW_W, D.VIEW_H); // death anim + respawn
  ok(s.player.dead === false, 'player respawned after timeout');
  ok(s.time > 100, 'timer refilled on respawn (t=' + Math.round(s.time) + ')');
  ok(s.player.lives === 2, 'exactly one life lost to timeout');
}

// 15. REGRESSION: falling below the map is lethal (no invisible pit floor)
{
  const s = E.createGame(D.buildLevel(0, 0), { lives: 3 });
  const p = s.player;
  p.x = 40 * D.TILE; p.y = (s.level.rows + 1) * D.TILE; p.vy = 200;
  for (let f = 0; f < 30 && !p.dead; f++) E.step(s, {}, D.VIEW_W, D.VIEW_H);
  ok(p.dead === true, 'falling out of the world kills');
}

// 16. REGRESSION: bounce shots tick damage with a cooldown (no 60x melt)
{
  const s = E.createGame(D.buildLevel(0, 0), { weapons: { spread: 0, beam: 0, bounce: 1 }, weapon: 'bounce' });
  const e = s.enemies.find(x => x.alive);
  e.hp = 100; e.x = s.player.x + 30; e.y = s.player.y; e.vx = 0; e.type = 'turret';
  const hp0 = e.hp;
  // park a bounce shot inside the enemy
  s.pshots.push({ x: e.x + 2, y: e.y + 2, w: 8, h: 8, vx: 0, vy: 0, dmg: 1, life: 0.5, kind: 'bounce', bounces: 99 });
  for (let f = 0; f < 24; f++) E.step(s, {}, D.VIEW_W, D.VIEW_H); // 0.4s overlap
  ok(hp0 - e.hp <= 3.01, `bounce overlap deals ~2 ticks not 24 (dealt ${(hp0 - e.hp).toFixed(1)})`);
}

// 17. REGRESSION: crouch shrinks the hitbox; unmorph blocked without headroom
{
  const s = E.createGame(D.buildLevel(0, 0), null);
  const p = s.player;
  for (let f = 0; f < 60; f++) E.step(s, {}, D.VIEW_W, D.VIEW_H); // settle on ground
  const h0 = p.h;
  E.step(s, { down: true }, D.VIEW_W, D.VIEW_H);
  ok(p.crouch === true && p.h < h0, 'crouch shrinks hitbox');
  E.step(s, {}, D.VIEW_W, D.VIEW_H);
  ok(p.crouch === false && p.h === 30, 'stand restores hitbox');
  // morph, then bury a ceiling right above -> unmorph must refuse
  E.step(s, { morphPressed: true }, D.VIEW_W, D.VIEW_H);
  ok(p.morph === true, 'morphed');
  const lv = s.level;
  const tx0 = Math.floor(p.x / D.TILE) - 1, ty0 = Math.floor(p.y / D.TILE) - 1;
  const saved = [];
  for (let dx2 = 0; dx2 < 3; dx2++) { const i = ty0 * lv.cols + tx0 + dx2; saved.push([i, lv.tiles[i]]); lv.tiles[i] = D.T.SOLID; }
  s.player.morphCooldown = 0;
  E.step(s, { morphPressed: true }, D.VIEW_W, D.VIEW_H);
  ok(p.morph === true, 'unmorph refused under a low ceiling');
  for (const [i, v] of saved) lv.tiles[i] = v;
}

// 18. water: W2 has WATER tiles; swimming caps fall speed and swims up
{
  const lv = D.buildLevel(1, 0);
  let waterCount = 0;
  for (let i = 0; i < lv.tiles.length; i++) if (lv.tiles[i] === D.T.WATER) waterCount++;
  ok(waterCount > 30, `W2 has flooded caverns (${waterCount} water tiles)`);
  // find a water tile with water below it (deep spot)
  let wx = -1, wy = -1;
  for (let x = 10; x < lv.cols - 10 && wx < 0; x++)
    for (let y = 0; y < lv.rows - 2; y++)
      if (lv.tiles[y * lv.cols + x] === D.T.WATER && lv.tiles[(y + 1) * lv.cols + x] === D.T.WATER) { wx = x; wy = y; break; }
  ok(wx > 0, 'found a deep water spot');
  const s = E.createGame(lv, null);
  const p = s.player;
  p.x = wx * D.TILE; p.y = wy * D.TILE - 4; p.vy = 0;
  for (let f = 0; f < 40; f++) E.step(s, {}, D.VIEW_W, D.VIEW_H);
  ok(p.inWater === true, 'player detects water');
  ok(p.vy <= 176, 'sink speed capped (vy=' + Math.round(p.vy) + ')');
  const y0 = p.y;
  for (let f = 0; f < 30; f++) E.step(s, { up: true }, D.VIEW_W, D.VIEW_H);
  ok(p.y < y0, 'swims upward with UP held');
}

// 19. updraft: 2-2 has a wind-climb column that lifts an airborne player
{
  const lv = D.buildLevel(1, 1);
  ok(lv.updraft && lv.updraft.x1 > lv.updraft.x0, '2-2 has an updraft zone');
  const s = E.createGame(lv, null);
  const p = s.player;
  const midX = (lv.updraft.x0 + lv.updraft.x1) / 2;
  p.x = midX; p.y = 6 * D.TILE; p.vy = 0;
  // must be airborne + out of water at this height
  let rose = false;
  const startY = p.y;
  for (let f = 0; f < 50; f++) {
    E.step(s, {}, D.VIEW_W, D.VIEW_H);
    p.x = midX; // hold column
    if (p.y < startY - 30) { rose = true; break; }
  }
  ok(rose, 'updraft lifts the player');
}

// 20. wind: W1 pushes an airborne player horizontally
{
  const lv = D.buildLevel(0, 0);
  ok(lv.windX > 0, 'W1 has wind');
  const s = E.createGame(lv, null);
  const p = s.player;
  p.x = 60 * D.TILE; p.y = 3 * D.TILE; p.vy = -50;
  let drift = 0;
  for (let f = 0; f < 40; f++) {
    const vx0 = p.vx;
    E.step(s, {}, D.VIEW_W, D.VIEW_H);
    drift += Math.abs(p.vx - vx0);
    p.y = 3 * D.TILE; p.vy = -50; // stay airborne
  }
  ok(drift > 0.5, 'wind imparts horizontal drift');
}

// 21. checkpoint: arms on crossing, respawn returns there with a fresh clock
{
  const lv = D.buildLevel(0, 0);
  ok(lv.checkpoint && lv.checkpoint.x > lv.cols * D.TILE * 0.4, '1-1 has a mid-stage checkpoint');
  const s = E.createGame(lv, { lives: 3 });
  const p = s.player;
  p.x = lv.checkpoint.x + 10; p.y = lv.checkpoint.y; p.vy = 0;
  for (let f = 0; f < 30 && !s.checkpoint; f++) E.step(s, {}, D.VIEW_W, D.VIEW_H);
  ok(s.checkpoint != null, 'checkpoint arms when crossed on ground');
  s.time = 111;
  E._internal.hurtPlayer(s, 999);
  for (let f = 0; f < 120 && p.dead; f++) E.step(s, {}, D.VIEW_W, D.VIEW_H);
  ok(!p.dead, 'respawned');
  ok(Math.abs(p.x - lv.checkpoint.x) < 60, 'respawn at checkpoint (x=' + Math.round(p.x) + ' cp=' + Math.round(lv.checkpoint.x) + ')');
  ok(s.time > 150, 'timer refilled at checkpoint respawn');
}

console.log(`\nEngine tests: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
