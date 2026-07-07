// Heuristic auto-play across every stage — checks TRAVERSABILITY / softlocks.
// Uses god-mode so terrain passability is isolated from combat difficulty.
// Run: node tools/playthrough.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const D = require('../assets/data.js');
const E = require('../assets/engine.js');

const TILE = D.TILE;
function solid(lv, tx, ty) {
  if (tx < 0 || tx >= lv.cols) return true;
  if (ty < 0) return false;
  if (ty >= lv.rows) return false;
  const t = lv.tiles[ty * lv.cols + tx];
  return t === D.T.SOLID || t === D.T.CRATE;
}

function botInput(s, m) {
  const p = s.player, lv = s.level;

  // boss duel: face the boss and hold fire until it falls
  const b = s.boss;
  const isShmup = s.level.type === 'shmup';
  if (b && b.alive && b.awake) {
    const bx = b.x + b.w / 2, px = p.x + p.w / 2;
    const toward = bx > px ? 1 : -1;
    // keep a mid distance so shots connect but contact is minimized
    const dist = Math.abs(bx - px);
    const move = dist > 120 ? toward : dist < 60 ? -toward : 0;
    const dy = (b.y + b.h / 2) - (p.y + p.h / 2);
    const inp = {
      right: move > 0, left: move < 0,
      up: isShmup && dy < -8, down: isShmup && dy > 8,
      fire: true, firePressed: (s.frame % 6) === 0,
      jump: false, jumpPressed: false, jumpReleased: m.pj,
      morph: false, morphPressed: false, switchPressed: false,
      // bomb while the core is guarded: freeze locks it open (dps windfall)
      bombPressed: !b.open && (s.frame % 420) === 0, linePressed: false,
    };
    m.pj = false;
    // face the boss even when holding position
    if (move === 0) { if (toward > 0) inp.right = true; else inp.left = true; }
    return inp;
  }

  // shmup cruise: hug the middle of the tunnel gap ahead, keep firing
  if (isShmup) {
    const col = Math.max(0, Math.min(lv.cols - 1, Math.floor((p.x + 70) / TILE)));
    let topY = 0; while (topY < lv.rows && lv.tiles[topY * lv.cols + col] !== 0) topY++;
    let botY = lv.rows - 1; while (botY >= 0 && lv.tiles[botY * lv.cols + col] !== 0) botY--;
    const midY = topY <= botY ? ((topY + botY) / 2 + 0.5) * TILE : (lv.rows / 2) * TILE;
    const dy = midY - (p.y + p.h / 2);
    m.pj = false;
    return {
      right: true, left: false, up: dy < -8, down: dy > 8,
      fire: true, firePressed: (s.frame % 6) === 0,
      jump: false, jumpPressed: false, jumpReleased: false,
      morph: false, morphPressed: false, switchPressed: false, bombPressed: false, linePressed: false,
    };
  }
  const ft = Math.floor((p.y + p.h + 2) / TILE);
  const px = Math.floor((p.x + p.w / 2) / TILE);
  const midTy = Math.floor((p.y + p.h / 2) / TILE);
  const headTy = Math.floor((p.y + 3) / TILE);

  let wantJump = false;
  // real wall ahead (torso height) — engine auto-steps 1-tile ledges, so only
  // >=2-tile walls need a jump
  if (solid(lv, px + 1, midTy) || solid(lv, px + 2, midTy)) wantJump = true;
  if (solid(lv, px + 1, headTy) || solid(lv, px + 2, headTy)) wantJump = true;
  // pit ahead: jump only at the LIP (no floor at the very next tile) so we
  // launch at full speed and clear it — jumping early lands us inside the pit
  if (p.onGround) {
    const g1 = solid(lv, px + 1, ft) || solid(lv, px + 1, ft + 1);
    if (!g1) wantJump = true;
  }
  if (m.stuck > 40 && p.onGround) wantJump = true;   // stuck-breaker

  // pulsed jump state machine (release between jumps so edge re-triggers)
  let jumpNow = false;
  if (m.hold > 0) { jumpNow = true; m.hold--; }
  else if (p.onGround && wantJump && m.cool <= 0) { jumpNow = true; m.hold = 9; m.cool = 16; }
  if (m.cool > 0) m.cool--;

  const inp = {
    right: true, left: false, up: false, down: false,
    fire: true, firePressed: (s.frame % 6) === 0,
    jump: jumpNow, jumpPressed: jumpNow && !m.pj, jumpReleased: !jumpNow && m.pj,
    morph: false, morphPressed: false, switchPressed: false, bombPressed: false, linePressed: false,
  };
  m.pj = jumpNow;
  return inp;
}

const spw = [2, 2, 3, 2, 2];
const plan = [];
for (let w = 0; w < 5; w++) for (let st = 0; st < spw[w]; st++) plan.push([w, st]);

let totalPass = 0;
const results = [];
for (const [w, st] of plan) {
  const lv = D.buildLevel(w, st);
  const s = E.createGame(lv, { lives: 5, weapons: { spread: 3, beam: 0, bounce: 0 }, weapon: 'spread', bombs: 3, lines: 3 });
  s.godMode = true;
  const m = { hold: 0, cool: 0, pj: false, stuck: 0, lastX: s.player.x };
  let maxX = s.player.x, won = false, frames = 0, respawns = 0;
  // boss stages get more headroom: the dumb bot duels far below player skill
  const maxFrames = 60 * (lv.bossSpawn ? 300 : 180);
  const exitX = lv.exit.x;
  let lastGood = { x: s.player.x, y: s.player.y };
  while (frames < maxFrames) {
    E.step(s, botInput(s, m), D.VIEW_W, D.VIEW_H); frames++;
    const p = s.player;
    if (p.onGround) lastGood = { x: p.x, y: p.y };
    // fell into a bottomless pit -> retry from last safe lip
    if (p.y > (lv.rows + 2) * TILE) {
      p.x = lastGood.x; p.y = lastGood.y - TILE; p.vx = 0; p.vy = 0; respawns++;
      m.stuck = 60; // force a stronger jump next
    }
    if (p.x > m.lastX + 0.4) { m.stuck = 0; m.lastX = p.x; } else m.stuck++;
    maxX = Math.max(maxX, p.x);
    if (s.won) { won = true; break; }
  }
  const pct = Math.min(100, Math.round((maxX / exitX) * 100));
  if (won) totalPass++;
  results.push({ stage: `${w + 1}-${st + 1}`, world: lv.name, won, pct, secs: Math.round(frames / 60), respawns, stuck: m.stuck });
}

console.log('stage  world               pass  progress  time(s)  pit-retries  end');
for (const r of results)
  console.log(`${r.stage.padEnd(6)} ${r.world.padEnd(19)} ${(r.won ? 'YES' : 'no ')}  ${String(r.pct).padStart(3)}%      ${String(r.secs).padStart(4)}      ${String(r.respawns).padStart(3)}        ${r.stuck > 120 ? 'STUCK@' + Math.round(r.pct) + '%' : 'ok'}`);
console.log(`\nTraversable stages: ${totalPass}/${plan.length}`);
process.exit(0);
