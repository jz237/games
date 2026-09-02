import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  UNIFIED_WALK_KEYS,
  WALK_CELL_COUNT,
  WALK_POSE_MIN_SPEED,
  baseCellRoles,
  getFighterMovement,
  groundedStanceBeat,
  isBaseAttackCell,
  isBaseUnusableCell,
  resolveMotionPose,
  strideClockAdvance,
  walkCycleFrame,
  walkCyclePose,
} from "../engine/fighter-kits.mjs";
import { MOVEMENT_RULES } from "../engine/defense.mjs";

// ---------------------------------------------------------------------------
// v3.5 BACK-WALK — "neither of the models walk backwards, they just slide. all
// the characters do that."
//
// THE DEFECT, as measured before the fix with a scripted retreat on all ten
// fighters (qa.pose() sampled every tick for 30 ticks): back-walk resolved to
// exactly ONE distinct cell for the whole retreat -- `unified:7`, the standing
// guard -- while the sim slid the body at the kit's own `backWalkSpeed`. A
// forward walk of the same fighter over the same span drew the four-key cycle
// `unified:1/2/3/4`. The cause is a routing precedence, not the art: this game
// guards the SF2 way (there is no guard button, you hold away), so
// `updateFighter` sets `block` on EVERY retreating tick, and
// fighterPoseDescriptor asked "is he blocking?" before "is he moving?".
//
// The contract this file pins down, on the WHOLE ROSTER because the bug was
// universal:
//   * a retreat routes to the walk CYCLE, never to a static guard cell;
//   * the cycle runs in REVERSE, so the legs un-step;
//   * its cadence is driven by the fighter's actual backward speed;
//   * the standing guard still owns every beat where guarding is what the body
//     is doing (blockstun, crouch-guard, a stationary hold);
//   * all of it is a pure function of snapshotted sim state.
//
// The companion contract for the walk BANK itself lives in walk-cells.test.mjs.
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME_SOURCE = readFileSync(join(HERE, "..", "game.js"), "utf8");
const KITS_SOURCE = readFileSync(join(HERE, "..", "engine", "fighter-kits.mjs"), "utf8");
const ROSTER = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "commissioner", "devil"];

/**
 * One held walk, stepped exactly as updateFighter steps it: `direction.absolute`
 * is -facing while holding away and +facing while holding in, vx is that times
 * the kit's own walk speed for that direction, and the stride clock takes one
 * `strideClockAdvance` per tick.
 */
function walkTicks(fighterId, { away, ticks = 60, facing = 1, dt = 1 / 60 }) {
  const movement = getFighterMovement(fighterId, MOVEMENT_RULES);
  const speed = away ? movement.backWalkSpeed : movement.forwardWalkSpeed;
  const vx = (away ? -facing : facing) * speed;
  const roles = baseCellRoles(fighterId);
  const rows = [];
  let strideTime = 0.317;   // whatever visualRandom() seeded walkTime with
  for (let tick = 0; tick < ticks; tick += 1) {
    strideTime += strideClockAdvance(vx, facing, movement.forwardWalkSpeed, dt);
    const stance = groundedStanceBeat({
      // Holding away sets BOTH of these every tick. That is the whole bug.
      block: away, blockstunFrames: 0, crouch: false, grounded: true, vx,
    });
    rows.push({ tick, stance, strideTime, vx, pose: walkCyclePose(strideTime, roles) });
  }
  return { movement, roles, vx, rows };
}

/** The DISTINCT walk keys a run visits, in the order it visits them. */
function keySteps(rows) {
  const seen = [];
  for (const row of rows) {
    const key = walkCycleFrame(row.strideTime);
    if (seen.at(-1) !== key) seen.push(key);
  }
  return seen;
}

test("a retreat is a WALK, not a stance — on every fighter", () => {
  for (const id of ROSTER) {
    const { roles, rows, movement } = walkTicks(id, { away: true });
    for (const row of rows) {
      assert.equal(row.stance, "walk",
        `${id}: holding away at ${movement.backWalkSpeed}px/s must route to the walk `
        + `cycle, not the standing guard (got "${row.stance}")`);
    }
    // The literal regression: the shipped bug drew ONE cell for the whole
    // retreat, so "visits every key in a second" is the assertion that fails
    // if the guard branch ever outranks locomotion again.
    const keys = new Set(rows.map((row) => row.pose.fallback.frame));
    assert.equal(keys.size, WALK_CELL_COUNT,
      `${id}: a one-second retreat must visit all ${WALK_CELL_COUNT} walk keys, saw ${[...keys]}`);
  }
});

test("a retreat never resolves to a guard, attack or defect cell on any link", () => {
  for (const id of ROSTER) {
    const { roles, rows } = walkTicks(id, { away: true });
    for (const row of rows) {
      assert.ok(UNIFIED_WALK_KEYS.includes(row.pose.frame),
        `${id}: the unified link must be a walk key, got ${row.pose.frame}`);
      const walkLink = row.pose.fallback;
      assert.equal(walkLink.bank, "walk");
      const baseFrame = walkLink.fallback.frame;
      // BASE_CELL_ROLES is per fighter and the base bank is NOT uniform — the
      // walk cells must come off this fighter's own map, never a literal.
      assert.ok(roles.walk.includes(baseFrame),
        `${id}: the base link must be one of this fighter's OWN walk cells `
        + `${roles.walk}, got ${baseFrame}`);
      assert.notEqual(baseFrame, roles.guard, `${id}: a retreat must not draw the guard cell`);
      assert.equal(isBaseAttackCell(id, baseFrame), false, `${id}: ${baseFrame} is an attack cell`);
      assert.equal(isBaseUnusableCell(id, baseFrame), false, `${id}: ${baseFrame} is an art-defect cell`);
      // Sheet-absent resolution is what cyraxx actually ships; assert it too.
      const flat = resolveMotionPose(row.pose, () => false, id);
      assert.equal(flat.bank, "base");
      assert.notEqual(flat.frame, roles.guard);
    }
  }
});

test("the cycle runs BACKWARDS on a retreat and forwards on an approach", () => {
  for (const id of ROSTER) {
    const back = walkTicks(id, { away: true, ticks: 90 });
    const fwd = walkTicks(id, { away: false, ticks: 90 });
    assert.ok(back.rows.at(-1).strideTime < back.rows[0].strideTime,
      `${id}: retreating must wind the stride clock down`);
    assert.ok(fwd.rows.at(-1).strideTime > fwd.rows[0].strideTime,
      `${id}: advancing must wind the stride clock up`);

    const backSteps = keySteps(back.rows);
    const fwdSteps = keySteps(fwd.rows);
    assert.ok(backSteps.length >= 3, `${id}: the retreat cycle must advance, saw ${backSteps}`);
    assert.ok(fwdSteps.length >= 3, `${id}: the approach cycle must advance, saw ${fwdSteps}`);
    for (let i = 1; i < backSteps.length; i += 1) {
      assert.equal((backSteps[i] + 1) % WALK_CELL_COUNT, backSteps[i - 1],
        `${id}: a retreat must step the identical four keys in REVERSE, saw ${backSteps}`);
    }
    for (let i = 1; i < fwdSteps.length; i += 1) {
      assert.equal((fwdSteps[i - 1] + 1) % WALK_CELL_COUNT, fwdSteps[i],
        `${id}: an approach must step the cycle forwards, saw ${fwdSteps}`);
    }
  }
});

test("the standing guard still owns every beat where guarding is the body's job", () => {
  // The judgement call, pinned. Only a MOVING guard hands over to the walk;
  // `block` itself is untouched sim state, so the defence is unchanged.
  const held = { block: true, blockstunFrames: 0, crouch: false, grounded: true };
  assert.equal(groundedStanceBeat({ ...held, vx: 0 }), "guard",
    "standing his ground on guard keeps the stance");
  assert.equal(groundedStanceBeat({ ...held, vx: WALK_POSE_MIN_SPEED }), "guard",
    "the gate is the same threshold the locomotion branch uses");
  assert.equal(groundedStanceBeat({ ...held, vx: -(WALK_POSE_MIN_SPEED + 1) }), "walk");
  // Blockstun is pinned and absorbing — and it is what makes the guard read
  // appear exactly when the guard is doing work, which is the tell a player
  // needs off a backing-up opponent.
  assert.equal(groundedStanceBeat({ ...held, vx: -400, blockstunFrames: 3 }), "guard");
  assert.equal(groundedStanceBeat({ block: false, blockstunFrames: 5, vx: -400 }), "guard");
  // Crouch-guard has vx forced to 0 upstream; the low stance owns it regardless.
  assert.equal(groundedStanceBeat({ ...held, crouch: true, vx: -400 }), "crouch");
  assert.equal(groundedStanceBeat({ block: false, crouch: true, vx: 0 }), "crouch");
  // The dash-brake window owns its own authored key.
  assert.equal(groundedStanceBeat({ ...held, vx: -600, dashExiting: true }), "guard");
  // Airborne blockstun never becomes a ground walk.
  assert.equal(groundedStanceBeat({ ...held, vx: -400, grounded: false }), "guard");
  // Not guarding at all: the branch declines and the chain carries on.
  assert.equal(groundedStanceBeat({ block: false, vx: -400 }), null);
  assert.equal(groundedStanceBeat(), null);
});

test("the stride clock is signed and scaled by the speed actually being made", () => {
  const dt = 1 / 60;
  for (const id of ROSTER) {
    const move = getFighterMovement(id, MOVEMENT_RULES);
    // Full-speed forward walk returns EXACTLY dt — the shipped cadence, byte
    // for byte, which is why a forward walk is unchanged by this wave.
    assert.equal(strideClockAdvance(move.forwardWalkSpeed, 1, move.forwardWalkSpeed, dt), dt,
      `${id}: a full-speed approach must keep the shipped cadence exactly`);
    assert.equal(strideClockAdvance(-move.forwardWalkSpeed, -1, move.forwardWalkSpeed, dt), dt,
      `${id}: facing left mirrors it`);
    // Retreating is negative and scaled by this fighter's OWN back/forward
    // ratio, so the plant rate tracks the ground he actually covers instead of
    // taking the forward walk's ten steps a second over 26% less distance.
    const back = strideClockAdvance(-move.backWalkSpeed, 1, move.forwardWalkSpeed, dt);
    assert.ok(back < 0, `${id}: a retreat must wind the clock down`);
    assert.ok(Math.abs(back + dt * (move.backWalkSpeed / move.forwardWalkSpeed)) < 1e-12,
      `${id}: retreat cadence must be backWalkSpeed/forwardWalkSpeed of the forward one`);
    if (move.backWalkSpeed > move.forwardWalkSpeed) {
      // donald is the roster's counter-example: he retreats faster than he
      // advances, so his back cadence has to be the QUICKER one.
      assert.ok(Math.abs(back) > dt, `${id}: backWalkSpeed > forwardWalkSpeed must step quicker`);
    }
  }
  // Standing still never advances it, so a stopped fighter holds his key.
  assert.equal(strideClockAdvance(0, 1, 300, dt), 0);
  assert.equal(strideClockAdvance(WALK_POSE_MIN_SPEED, 1, 300, dt), 0);
  // Defensive: no NaN, no Infinity and no unbounded spin can reach the cycle.
  for (const bad of [NaN, undefined, Infinity, -Infinity]) {
    assert.equal(Number.isFinite(strideClockAdvance(bad, 1, 300, dt)), true, `vx ${bad}`);
    assert.equal(Number.isFinite(strideClockAdvance(300, 1, bad, dt)), true, `reference ${bad}`);
    assert.equal(Number.isFinite(strideClockAdvance(300, 1, 300, bad)), true, `dt ${bad}`);
  }
  assert.ok(Math.abs(strideClockAdvance(9000, 1, 300, dt)) <= dt * 1.6,
    "an overspeed must be capped rather than strobing the cycle");
});

test("back-walk pose selection is deterministic — rollback and both peers agree", () => {
  for (const id of ROSTER) {
    const first = walkTicks(id, { away: true, ticks: 45 });
    const second = walkTicks(id, { away: true, ticks: 45 });
    const cells = (run) => run.rows.map((row) => `${row.stance}:${row.pose.frame}:${row.pose.fallback.frame}`);
    assert.deepEqual(cells(first), cells(second),
      `${id}: a replayed retreat must draw the identical cells`);
    // Facing is the only thing that flips the sign of the same held input, so
    // a mirrored retreat must produce the mirror-identical cycle.
    const mirrored = walkTicks(id, { away: true, ticks: 45, facing: -1 });
    assert.deepEqual(first.rows.map((row) => row.pose.frame), mirrored.rows.map((row) => row.pose.frame),
      `${id}: retreating left and retreating right must draw the same keys`);
  }
  // And the decision itself carries no hidden state.
  const args = { block: true, blockstunFrames: 0, crouch: false, grounded: true, vx: -240 };
  for (let i = 0; i < 8; i += 1) assert.equal(groundedStanceBeat(args), "walk");
  // No Math.random anywhere in the new path.
  for (const fn of ["groundedStanceBeat", "strideClockAdvance"]) {
    const body = KITS_SOURCE.slice(KITS_SOURCE.indexOf(`export function ${fn}(`));
    assert.ok(!body.slice(0, body.indexOf("\n}")).includes("Math.random"),
      `${fn} must stay a pure function of sim state`);
  }
});

test("the renderer actually routes through the stance map", () => {
  // The regression lived in game.js, not in this module, so the routing edit is
  // asserted at the source as well as measured live.
  assert.ok(/groundedStanceBeat\(\{/.test(GAME_SOURCE),
    "fighterPoseDescriptor must ask groundedStanceBeat for the stance");
  assert.ok(!/if \(fighter\.block \|\| fighter\.blockstunFrames > 0 \|\| fighter\.crouch\) \{/.test(GAME_SOURCE),
    "the unconditional guard branch that outranked the walk cycle must stay gone");
  assert.ok(/return walkCyclePose\(fighter\.strideTime, roles\);/.test(GAME_SOURCE),
    "the locomotion branch must ride the signed, speed-scaled stride clock");
  assert.ok(/fighter\.strideTime \+= strideClockAdvance\(/.test(GAME_SOURCE),
    "the stride clock must be advanced from the sim tick");
  assert.ok(/"animTime", "walkTime", "strideTime",/.test(GAME_SOURCE),
    "strideTime must be classed with walkTime as a presentation clock, so it is "
    + "snapshotted with the fighter but stays out of the combat checksum");
});
