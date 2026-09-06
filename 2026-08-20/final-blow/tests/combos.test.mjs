import assert from "node:assert/strict";
import { createCombatMove } from "../engine/defense.mjs";
import {
  ADVANCED_MOVE_PROFILES,
  COMBO_RULES,
  GRIT_RULES,
  ComboTracker,
  canCancelAttack,
  createAdvancedMove,
  damageScaleForHit,
  gritCostForAction,
  matchCommandSequence,
  recognizeCombatCommand,
} from "../engine/combos.mjs";

function testGritMoves() {
  assert.equal(GRIT_RULES.maximum, 100);
  assert.equal(gritCostForAction("enhanced"), 25);
  assert.equal(gritCostForAction("guardReversal"), 30);
  assert.equal(gritCostForAction("super"), 100);
  assert.equal(gritCostForAction("light"), 0);
  assert.equal(Object.keys(ADVANCED_MOVE_PROFILES).length, 6);

  const enhanced = createAdvancedMove("enhanced");
  assert.equal(enhanced.profileId, "enhanced-special");
  assert.equal(enhanced.maxHits, 2);
  assert.equal(enhanced.totalFrames, enhanced.startupFrames + enhanced.activeFrames + enhanced.recoveryFrames);
  assert.ok(enhanced.recoveryFrames > ADVANCED_MOVE_PROFILES.enhanced.recoveryFrames, "EX specials recover slower than authored");
  const superMove = createAdvancedMove("super");
  assert.equal(superMove.maxHits, 4);
  assert.equal(superMove.superMove, true);
  assert.equal(superMove.totalFrames, superMove.startupFrames + superMove.activeFrames + superMove.recoveryFrames);
  assert.throws(() => createAdvancedMove("missing"), /Unknown advanced move/);
}

function testScalingAndTracking() {
  assert.equal(damageScaleForHit(1), 1);
  assert.equal(damageScaleForHit(2), COMBO_RULES.hitScales[1]);
  assert.equal(damageScaleForHit(4), COMBO_RULES.hitScales[3]);
  assert.ok(damageScaleForHit(20) >= COMBO_RULES.minimumScale);
  assert.ok(damageScaleForHit(3, 3) < damageScaleForHit(3, 0));
  // Short combos: by the fourth hit the payoff has already fallen below half.
  assert.ok(damageScaleForHit(4) < 0.5, "extended strings must not stay worth it");
  assert.ok(damageScaleForHit(2) > 0.6, "a two-hit confirm is still worth having");

  const combo = new ComboTracker();
  const first = combo.registerHit(10);
  combo.addDamage(10);
  const second = combo.registerHit(18);
  combo.addDamage(9);
  assert.equal(first.hitNumber, 1);
  assert.equal(second.hitNumber, 2);
  assert.equal(second.damageScale, COMBO_RULES.hitScales[1]);
  assert.deepEqual(combo.snapshot(20), {
    hits: 2,
    damage: 19,
    startedFrame: 10,
    lastHitFrame: 18,
    visible: true,
    active: true,
    peakHits: 2,
  });
  combo.tick(21, false);
  assert.equal(combo.snapshot(21).active, false, "combo ends as soon as the defender is actionable");
  assert.equal(combo.snapshot(21).visible, true, "completed combo remains readable");
  combo.registerHit(30);
  assert.equal(combo.snapshot(30).hits, 1, "a new hit after recovery starts a new combo");
}

function testCommands() {
  const launcherHistory = [
    { token: "forward", frame: 2 },
    { token: "down", frame: 7 },
    { token: "forward", frame: 11 },
    { token: "punch", frame: 12 },
  ];
  assert.equal(recognizeCombatCommand(launcherHistory, 12)?.action, "launcher");
  const driveHistory = [
    { token: "back", frame: 20 },
    { token: "forward", frame: 26 },
    { token: "kick", frame: 27 },
  ];
  assert.equal(recognizeCombatCommand(driveHistory, 27)?.action, "driveHeavy");
  const specialHistory = [
    { token: "down", frame: 30 },
    { token: "forward", frame: 35 },
    { token: "punch", frame: 36 },
  ];
  assert.equal(recognizeCombatCommand(specialHistory, 36)?.action, "commandSpecial");
  const kickSpecialHistory = [
    { token: "down", frame: 40 },
    { token: "forward", frame: 45 },
    { token: "kick", frame: 46 },
  ];
  assert.equal(recognizeCombatCommand(kickSpecialHistory, 46)?.action, "special");
  const superHistory = [
    { token: "down", frame: 50 },
    { token: "forward", frame: 54 },
    { token: "down", frame: 58 },
    { token: "forward", frame: 62 },
    { token: "punch", frame: 63 },
  ];
  assert.equal(recognizeCombatCommand(superHistory, 63)?.action, "super", "double quarter-circle plus punch is the super");
  assert.ok(matchCommandSequence(specialHistory, ["down", "forward", "punch"], 36));
  assert.equal(matchCommandSequence([
    { token: "down", frame: 1 },
    { token: "forward", frame: 30 },
    { token: "punch", frame: 31 },
  ], ["down", "forward", "punch"], 31), null, "slow inputs must not be accepted");
}

function testCancelRoutes() {
  const light = createCombatMove("light");
  assert.equal(canCancelAttack(light, "heavy", light.activeEndFrame - 1, "hit"), true);
  assert.equal(canCancelAttack(light, "commandSpecial", light.activeEndFrame, "block"), true);
  assert.equal(canCancelAttack(light, "heavy", 2, "hit"), false);
  assert.equal(canCancelAttack(light, "heavy", light.activeEndFrame, ""), false);
  assert.equal(canCancelAttack(light, "super", light.activeEndFrame, "block"), false);
  assert.equal(canCancelAttack(light, "super", light.activeEndFrame, "hit"), true);
  const special = createCombatMove("special");
  assert.equal(canCancelAttack(special, "heavy", special.activeEndFrame, "hit"), false);
  const rushSpecial = { ...special, cancelRoutes: ["special", "commandSpecial", "enhanced", "super"] };
  assert.equal(canCancelAttack(rushSpecial, "commandSpecial", rushSpecial.activeEndFrame, "hit"), true);
  // A route-only special (no rushCancel/rhythmCancel flag) is not a voltage
  // or flow cancel, so the block-economy budget never applies to it.
  assert.equal(canCancelAttack(rushSpecial, "commandSpecial", rushSpecial.activeEndFrame, "block"), true);
  assert.equal(canCancelAttack(rushSpecial, "heavy", rushSpecial.activeEndFrame, "hit"), false);
  // BLOCK ECONOMY: a flagged voltage cancel keeps its first blocked cancel
  // (pin changed from 'always true' — the old rule was an unlimited true
  // blockstring, see tempo.test.mjs for the Blitz measurement) and refuses
  // the second in the same string; on hit it stays unlimited.
  const voltage = { ...rushSpecial, rushCancel: true };
  assert.equal(canCancelAttack(voltage, "commandSpecial", voltage.activeEndFrame, "block"), true);
  assert.equal(canCancelAttack(voltage, "commandSpecial", voltage.activeEndFrame, "block", { blockedSpecialCancels: 1 }), false);
  assert.equal(canCancelAttack(voltage, "commandSpecial", voltage.activeEndFrame, "hit", { blockedSpecialCancels: 3 }), true);
}

testGritMoves();
testScalingAndTracking();
testCommands();
testCancelRoutes();

console.log("Final Blow combo and Grit tests passed");
