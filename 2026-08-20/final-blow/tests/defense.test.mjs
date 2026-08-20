import assert from "node:assert/strict";
import {
  ATTACK_LEVELS,
  COMBAT_MOVE_PROFILES,
  DirectionTapTracker,
  boxesOverlap,
  canGuardAttack,
  createCombatMove,
  findBoxCollision,
  getActiveHitboxes,
  getHurtboxes,
  isCounterHit,
  localBoxToWorld,
  resolvePushboxPositions,
  selectMoveProfile,
} from "../engine/defense.mjs";

function testMoveSelection() {
  assert.equal(selectMoveProfile("light").id, "stand-light");
  assert.equal(selectMoveProfile("light", { crouching: true }).id, "crouch-light");
  assert.equal(selectMoveProfile("heavy", { crouching: true }).id, "crouch-heavy");
  assert.equal(selectMoveProfile("heavy", { forwardHeld: true }).id, "overhead");
  assert.equal(selectMoveProfile("heavy", { airborne: true }).id, "air-heavy");
  assert.equal(selectMoveProfile("special", { airborne: true }).id, "air-special");
  assert.equal(selectMoveProfile("throw").level, ATTACK_LEVELS.THROW);
  assert.equal(Object.keys(COMBAT_MOVE_PROFILES).length, 10);

  const sweep = createCombatMove("heavy", { crouching: true });
  assert.equal(sweep.profileId, "crouch-heavy");
  assert.equal(sweep.level, ATTACK_LEVELS.LOW);
  assert.equal(sweep.knockdown, true);
  assert.equal(sweep.totalFrames, 36);
}

function testGuardMatrix() {
  const guard = (level, guardHeight, guarding = true, grounded = true) => canGuardAttack({
    level, guardHeight, guarding, grounded,
  });
  assert.equal(guard(ATTACK_LEVELS.MID, "high"), true);
  assert.equal(guard(ATTACK_LEVELS.MID, "low"), true);
  assert.equal(guard(ATTACK_LEVELS.LOW, "low"), true);
  assert.equal(guard(ATTACK_LEVELS.LOW, "high"), false);
  assert.equal(guard(ATTACK_LEVELS.OVERHEAD, "high"), true);
  assert.equal(guard(ATTACK_LEVELS.OVERHEAD, "low"), false);
  assert.equal(guard(ATTACK_LEVELS.AIR, "high"), true);
  assert.equal(guard(ATTACK_LEVELS.AIR, "low"), false);
  assert.equal(guard(ATTACK_LEVELS.THROW, "high"), false);
  assert.equal(guard(ATTACK_LEVELS.MID, "high", false), false);
  assert.equal(guard(ATTACK_LEVELS.MID, "high", true, false), false);
}

function testDirectionalDashes() {
  const tracker = new DirectionTapTracker(12);
  assert.equal(tracker.press("right", 10), false);
  assert.equal(tracker.press("right", 22), true, "window is inclusive");
  assert.equal(tracker.press("left", 30), false);
  assert.equal(tracker.press("left", 43), false);
  const snapshot = tracker.snapshot();
  const restored = new DirectionTapTracker();
  restored.restore(snapshot);
  assert.equal(restored.press("right", 30), true);
  assert.throws(() => tracker.press("up", 50), /Unknown direction/);
}

function testBoxesAndCollision() {
  const attacker = {
    x: 500,
    y: 600,
    facing: 1,
    grounded: true,
    crouch: false,
    down: false,
    knockdownFrames: 0,
    wakeupFrames: 0,
    invulnerableFrames: 0,
    attacking: createCombatMove("light"),
    attackFrame: 6,
  };
  const defender = {
    x: 585,
    y: 600,
    facing: -1,
    grounded: true,
    crouch: false,
    down: false,
    knockdownFrames: 0,
    wakeupFrames: 0,
    invulnerableFrames: 0,
    attacking: null,
  };
  const active = getActiveHitboxes(attacker);
  assert.equal(active.length, 1);
  assert.ok(getHurtboxes(defender).length >= 3);
  assert.ok(findBoxCollision(attacker, defender));
  attacker.attackFrame = 2;
  assert.equal(getActiveHitboxes(attacker).length, 0, "startup has no hitbox");
  attacker.attackFrame = 7;
  const frameSeven = getActiveHitboxes(attacker)[0];
  attacker.attackFrame = 10;
  const frameTen = getActiveHitboxes(attacker)[0];
  assert.notDeepEqual(frameSeven, frameTen, "active hitboxes change by frame");
  defender.invulnerableFrames = 1;
  assert.equal(findBoxCollision(attacker, defender), null);

  const mirrored = localBoxToWorld({ x: 500, y: 600, facing: -1 }, { x: 20, y: -100, width: 50, height: 40 });
  assert.deepEqual(mirrored, { x: 430, y: 500, width: 50, height: 40 });
  assert.equal(boxesOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 4, height: 4 }), true);
  assert.equal(boxesOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 4, height: 4 }), false);
}

function testPushboxesAndCounters() {
  const center = resolvePushboxPositions(
    { x: 500, side: 0, halfWidth: 40 },
    { x: 550, side: 1, halfWidth: 40 },
  );
  assert.equal(Math.round(center.bX - center.aX), 80);
  const corner = resolvePushboxPositions(
    { x: 76, side: 0, halfWidth: 40 },
    { x: 125, side: 1, halfWidth: 40 },
  );
  assert.equal(corner.aX, 76);
  assert.equal(Math.round(corner.bX - corner.aX), 80);
  assert.equal(isCounterHit({ attacking: createCombatMove("heavy"), attackFrame: 2, dashFrames: 0 }), true);
  assert.equal(isCounterHit({ attacking: createCombatMove("heavy"), attackFrame: 14, dashFrames: 0 }), false);
  assert.equal(isCounterHit({ attacking: null, dashFrames: 3 }), true);
}

testMoveSelection();
testGuardMatrix();
testDirectionalDashes();
testBoxesAndCollision();
testPushboxesAndCounters();

console.log("Final Blow movement and defense tests passed");
