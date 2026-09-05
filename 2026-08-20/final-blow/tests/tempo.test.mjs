import assert from "node:assert/strict";
import {
  ATTACK_REARM_FRAMES,
  INPUT_BUFFER_RULES,
  WHIFF_RECOVERY_MINIMUM_FRAMES,
  WHIFF_RECOVERY_TAX,
  createAttackInstance,
  whiffRecoveryFrames,
} from "../engine/foundation.mjs";
import { MOVEMENT_RULES } from "../engine/defense.mjs";
import { STRIDE_CADENCE, createFighterMove, strideClockAdvance } from "../engine/fighter-kits.mjs";

// v4.4 TEMPO — a whiffed swing pays extra recovery; confirmed offence does not.

function testWhiffTaxScalesWithRecovery() {
  for (const kind of ["light", "heavy", "special", "throw"]) {
    const move = createAttackInstance(kind);
    const tax = whiffRecoveryFrames(move);
    assert.equal(tax, Math.max(WHIFF_RECOVERY_MINIMUM_FRAMES, Math.round(move.recoveryFrames * WHIFF_RECOVERY_TAX[kind])),
      `${kind} whiff tax must be its recovery scaled by the tax table`);
    assert.ok(tax >= WHIFF_RECOVERY_MINIMUM_FRAMES);
    assert.ok(tax < move.recoveryFrames, `${kind} whiff tax stays smaller than the move's own recovery`);
  }
  // A whiffed jab is a few frames; a whiffed special is a real punish window.
  assert.ok(whiffRecoveryFrames(createAttackInstance("special")) > whiffRecoveryFrames(createAttackInstance("light")));
}

function testWhiffTaxExemptions() {
  const light = createAttackInstance("light");
  assert.equal(whiffRecoveryFrames({ ...light, projectile: { speed: 600 } }), 0, "projectile moves connect later");
  assert.equal(whiffRecoveryFrames({ ...light, trap: { deployFrame: 4 } }), 0, "trap moves connect later");
  assert.equal(whiffRecoveryFrames({ ...light, throwableId: "bottle" }), 0, "hurled objects connect later");
  assert.equal(whiffRecoveryFrames(null), 0);
}

function testKitMovesAreTaxedByBaseKind() {
  const jab = createFighterMove("jez", "light", {});
  assert.ok(whiffRecoveryFrames(jab) >= WHIFF_RECOVERY_MINIMUM_FRAMES);
  const superMove = createFighterMove("deathblow", "super");
  assert.ok(whiffRecoveryFrames(superMove) > 0, "a whiffed super pays too");
  // Instances are per-swing: taxing one never changes the next one's frame data.
  const first = createFighterMove("jez", "light", {});
  first.totalFrames += whiffRecoveryFrames(first);
  const second = createFighterMove("jez", "light", {});
  assert.equal(second.totalFrames, second.startupFrames + second.activeFrames + second.recoveryFrames);
  assert.ok(first.totalFrames > second.totalFrames);
}

function testWalkTempoAndStrideCadence() {
  // Walk speeds are untouched by the tempo pass — the skate fix is cadence only.
  assert.equal(MOVEMENT_RULES.forwardWalkSpeed, Math.round(336 * 1.14));
  assert.equal(MOVEMENT_RULES.backWalkSpeed, Math.round(262 * 1.14));
  // A full-speed forward walk winds the stride clock at STRIDE_CADENCE, so one
  // six-key cycle covers more ground and the planted foot stops sliding.
  const speed = MOVEMENT_RULES.forwardWalkSpeed;
  const dt = 1 / 60;
  assert.ok(STRIDE_CADENCE > 0.5 && STRIDE_CADENCE < 1);
  assert.ok(Math.abs(strideClockAdvance(speed, 1, speed / STRIDE_CADENCE, dt) - dt * STRIDE_CADENCE) < 1e-9);
  // Retreating still winds the cycle backwards at the ground rate.
  assert.ok(strideClockAdvance(-MOVEMENT_RULES.backWalkSpeed, 1, speed / STRIDE_CADENCE, dt) < 0);
}

function testRearmGap() {
  // A whiffed swing re-arms over a short, fixed beat — long enough to stop a
  // buffered mash from firing the instant recovery ends, shorter than the
  // input buffer so a deliberate press made during the beat still comes out.
  assert.ok(Number.isInteger(ATTACK_REARM_FRAMES) && ATTACK_REARM_FRAMES >= 2);
  assert.ok(ATTACK_REARM_FRAMES < INPUT_BUFFER_RULES.defaultFrames);
  // It never rivals a move's own recovery: a whiffed jab is still a jab.
  assert.ok(ATTACK_REARM_FRAMES < createAttackInstance("light").recoveryFrames);
}

testRearmGap();
testWhiffTaxScalesWithRecovery();
testWhiffTaxExemptions();
testKitMovesAreTaxedByBaseKind();
testWalkTempoAndStrideCadence();

console.log("Final Blow tempo tests passed");
