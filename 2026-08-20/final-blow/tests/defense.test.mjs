import assert from "node:assert/strict";
import {
  ATTACK_LEVELS,
  COMBAT_MOVE_PROFILES,
  DirectionTapTracker,
  FIGHTER_SCALE,
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
  // 16 pre-wave-11 profiles + the generic forwardLight source + the two
  // derived forward command kicks.
  assert.equal(Object.keys(COMBAT_MOVE_PROFILES).length, 19);

  // Four-button layout: the kick buttons select their own derived normals.
  assert.equal(selectMoveProfile("light", { limb: "kick" }).id, "stand-light-lk");
  assert.equal(selectMoveProfile("light", { limb: "kick" }).moveName, "LIGHT KICK");
  assert.equal(selectMoveProfile("heavy", { limb: "kick" }).id, "stand-heavy-hk");
  assert.equal(selectMoveProfile("heavy", { limb: "kick" }).moveName, "ROUNDHOUSE");
  assert.equal(selectMoveProfile("heavy", { limb: "kick", crouching: true }).id, "crouch-heavy-sweep");
  assert.equal(selectMoveProfile("light", { limb: "kick", crouching: true }).id, "crouch-light-lk");
  assert.equal(selectMoveProfile("heavy", { limb: "kick", airborne: true }).id, "air-heavy-hk");
  assert.equal(selectMoveProfile("light", { limb: "kick", airborne: true }).id, "air-light-lk");
  // Release 1.7 wave 11: the dead forward+kick directions are live. Forward
  // +LK is the advancing step knee, forward+HK the axe-kick overhead (the
  // generic table's flavour), both derived, both distinct from the punches.
  assert.equal(selectMoveProfile("light", { limb: "kick", forwardHeld: true }).id, "forward-light-step-knee");
  assert.equal(selectMoveProfile("light", { limb: "kick", forwardHeld: true }).moveName, "STEP KNEE");
  assert.equal(selectMoveProfile("heavy", { limb: "kick", forwardHeld: true }).id, "overhead-axe-kick");
  assert.equal(selectMoveProfile("heavy", { limb: "kick", forwardHeld: true }).moveName, "AXE KICK");
  assert.equal(selectMoveProfile("heavy", { limb: "kick", forwardHeld: true }).level, ATTACK_LEVELS.OVERHEAD);

  // The generic profiles inherit unset fields from BASE_MOVES, so compare the
  // resolved values a real attack instance would use.
  const roundhouse = createCombatMove("heavy", { limb: "kick" });
  const heavyPunch = createCombatMove("heavy");
  assert.ok(roundhouse.range > heavyPunch.range, "kicks reach further than the matching punch");
  assert.ok(roundhouse.startupFrames > heavyPunch.startupFrames, "kicks start slower");
  assert.ok(roundhouse.recoveryFrames > heavyPunch.recoveryFrames, "kicks recover slower");
  assert.ok(roundhouse.push > heavyPunch.push, "kicks push further");
  const sweepProfile = selectMoveProfile("heavy", { limb: "kick", crouching: true });
  assert.equal(sweepProfile.level, ATTACK_LEVELS.LOW);
  assert.equal(sweepProfile.knockdown, true);
  assert.equal(sweepProfile.moveName, "SWEEP");

  const sweep = createCombatMove("heavy", { crouching: true });
  assert.equal(sweep.profileId, "crouch-heavy");
  assert.equal(sweep.level, ATTACK_LEVELS.LOW);
  assert.equal(sweep.knockdown, true);
  const sweepProfileFrames = COMBAT_MOVE_PROFILES.crouchHeavy;
  assert.equal(
    sweep.totalFrames,
    sweepProfileFrames.startupFrames + sweepProfileFrames.activeFrames + sweep.recoveryFrames,
  );
  assert.ok(sweep.recoveryFrames > sweepProfileFrames.recoveryFrames, "a whiffed sweep is punishable");
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

  // Boxes are authored unscaled and scaled into the world with the fighters.
  const mirrored = localBoxToWorld({ x: 500, y: 600, facing: -1 }, { x: 20, y: -100, width: 50, height: 40 });
  assert.deepEqual(mirrored, {
    x: 500 - 20 * FIGHTER_SCALE - 50 * FIGHTER_SCALE,
    y: 600 - 100 * FIGHTER_SCALE,
    width: 50 * FIGHTER_SCALE,
    height: 40 * FIGHTER_SCALE,
  });
  const facingRight = localBoxToWorld({ x: 500, y: 600, facing: 1 }, { x: 20, y: -100, width: 50, height: 40 });
  assert.equal(facingRight.x, 500 + 20 * FIGHTER_SCALE);
  assert.ok(FIGHTER_SCALE > 1.1 && FIGHTER_SCALE < 1.2, "fighter scale should stay in the MK/SF2 framing band");
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
