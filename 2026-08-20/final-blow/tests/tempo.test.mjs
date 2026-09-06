import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ATTACK_REARM_FRAMES,
  INPUT_BUFFER_RULES,
  REVERSAL_BLOCK_DISADVANTAGE_FRAMES,
  WHIFF_RECOVERY_MINIMUM_FRAMES,
  WHIFF_RECOVERY_TAX,
  createAttackInstance,
  whiffRecoveryFrames,
} from "../engine/foundation.mjs";
import { DEFENSE_RULES, MOVEMENT_RULES, THROW_RULES } from "../engine/defense.mjs";
import { STRIDE_CADENCE, createFighterMove, strideClockAdvance } from "../engine/fighter-kits.mjs";
import {
  GRIT_RULES,
  SPECIAL_CANCEL_RULES,
  attackGritGain,
  canCancelAttack,
  isSpecialIntoSpecialCancel,
  projectileGritGain,
} from "../engine/combos.mjs";

const gameSource = readFileSync(new URL("../game.js", import.meta.url), "utf8");

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

// BLOCK ECONOMY (post-5.0) — the 4.4/4.5 intent (mashing gets slower, reads
// keep their frame data) extended to the blocked side of the exchange.

function testVoltageCancelIsOnePerStringOnBlock() {
  const blitz = createFighterMove("benny", "commandSpecial", {});
  assert.equal(blitz.rushCancel, true);
  assert.ok(blitz.cancelRoutes.includes("commandSpecial"));
  // The measurement that motivated the rule: Blitz's third hit lands at
  // startup + 2 × rehit (f21) and holds the blocker until f38, while the
  // earliest special cancel opens at activeEnd − 2 (f27) and a fresh Blitz is
  // active 7 frames later (f34) — inside the blockstun. Looping that was a
  // true blockstring for as long as the buttons lasted.
  const lastHit = blitz.startupFrames + blitz.rehitFrames * (blitz.maxHits - 1);
  const blockstunEnds = lastHit + blitz.blockstunFrames;
  const earliestCancel = Math.max(blitz.activeStartFrame, blitz.activeEndFrame - 2);
  assert.ok(earliestCancel + blitz.startupFrames < blockstunEnds, "Blitz into Blitz on block is airtight — that is exactly why it is budgeted");
  // One blocked voltage cancel per string keeps the pressure identity...
  assert.equal(SPECIAL_CANCEL_RULES.blockedPerString, 1);
  assert.equal(canCancelAttack(blitz, "commandSpecial", earliestCancel, "block"), true);
  assert.equal(canCancelAttack(blitz, "commandSpecial", earliestCancel, "block", { blockedSpecialCancels: 0 }), true);
  // ...the second is refused, so the string ends on Blitz's own recovery and
  // the blocker is free (f38) before Benny is (f45).
  assert.equal(canCancelAttack(blitz, "commandSpecial", earliestCancel, "block", { blockedSpecialCancels: 1 }), false);
  assert.ok(blockstunEnds < blitz.totalFrames, "with the loop refused, the blocker recovers first");
  // On hit the voltage cancel is still unlimited — it is a confirm, not a tax.
  assert.equal(canCancelAttack(blitz, "commandSpecial", earliestCancel, "hit", { blockedSpecialCancels: 4 }), true);
  assert.equal(canCancelAttack(blitz, "enhanced", earliestCancel, "hit", { blockedSpecialCancels: 4 }), true);
  // The budget only counts special-into-special. Ali's flow cancels share it,
  // but a flow cancel into a normal is not a loop and is not counted.
  const beatSkip = createFighterMove("ali", "backSpecial", {});
  assert.equal(beatSkip.rhythmCancel, true);
  assert.equal(isSpecialIntoSpecialCancel(beatSkip, "special"), true);
  assert.equal(isSpecialIntoSpecialCancel(beatSkip, "enhanced"), true);
  assert.equal(isSpecialIntoSpecialCancel(beatSkip, "light"), false);
  const heavy = createFighterMove("benny", "standHeavy", {});
  assert.equal(isSpecialIntoSpecialCancel(heavy, "special"), false, "a blocked heavy into one special is the standard frame trap and stays");
  assert.equal(canCancelAttack(heavy, "special", heavy.activeEndFrame, "block", { blockedSpecialCancels: 1 }), true);
  // game.js keeps the counter on the fighter (rollback-cloned) and resets it
  // on every non-cancel swing.
  assert.match(gameSource, /blockedSpecialCancels: 0,/);
  assert.match(gameSource, /if \(!cancelledFrom\) fighter\.blockedSpecialCancels = 0;/);
  assert.match(gameSource, /connectedBefore === "block" && isSpecialIntoSpecialCancel\(current, actionGroup\)/);
}

function testBlockedHitsPayHalfGrit() {
  const blitz = createFighterMove("benny", "commandSpecial", {});
  assert.equal(GRIT_RULES.blockGainMultiplier, 0.5);
  assert.equal(attackGritGain(blitz, { blocked: false }), blitz.meter * GRIT_RULES.hitGainMultiplier);
  assert.equal(attackGritGain(blitz, { blocked: true }), blitz.meter * 0.5);
  // A blocked hit is close to Grit-neutral: the attacker still edges the
  // defender's 0.45x share, but no longer doubles it.
  assert.ok(GRIT_RULES.blockGainMultiplier >= GRIT_RULES.damageTakenGainMultiplier);
  assert.ok(GRIT_RULES.blockGainMultiplier <= 0.5);
  // Seven blocked Blitzes (3 hits × 8 meter) used to bank 168 — a super by the
  // fifth. Halved, the same wall is 84, still short of the bar.
  assert.ok(7 * 3 * attackGritGain(blitz, { blocked: true }) < GRIT_RULES.superCost);
  assert.equal(attackGritGain(null, { blocked: true }), 0);
  assert.match(gameSource, /attacker\.meter = clamp\(attacker\.meter \+ attackGritGain\(attack, \{ blocked \}\)/);
}

function testProjectileGritIsCappedPerProjectile() {
  assert.deepEqual(GRIT_RULES.projectileGain, { hit: 15, block: 6 });
  assert.equal(projectileGritGain({ blocked: false }), 15);
  assert.equal(projectileGritGain({ blocked: true }), 6);
  // The measurement: GOLDEN SHOCKWAVE is 45 frames total, so seven blocked
  // shots fit in 315 frames (5.25 s). At the old flat 15 that was 105 Grit —
  // GOLDEN BACK NINE funded by zero-risk zoning. At 6 it is 42, and the same
  // wall needs seventeen blocked orbs.
  const shockwave = createFighterMove("donald", "commandSpecial", {});
  assert.ok(shockwave.projectile, "Shockwave is the projectile this was measured on");
  assert.ok(7 * shockwave.totalFrames <= 320);
  assert.ok(7 * 15 >= GRIT_RULES.superCost, "the old rate really did fund a super in seven");
  assert.ok(7 * projectileGritGain({ blocked: true }) < GRIT_RULES.superCost);
  assert.equal(Math.ceil(GRIT_RULES.superCost / projectileGritGain({ blocked: true })), 17);
  // The hit rate is unchanged, and each projectile pays exactly once.
  assert.equal(projectileGritGain({ blocked: false }), 15);
  assert.match(gameSource, /if \(!projectile\.gritPaid\) \{\s*projectile\.gritPaid = true;\s*owner\.meter = clamp\(owner\.meter \+ projectileGritGain\(\{ blocked \}\)/);
}

function testReversalInvulnerabilityClampAndNeutralGate() {
  // The foundation backstop: an invulnerable move cannot be built plus on
  // block, whatever a kit authors.
  assert.equal(REVERSAL_BLOCK_DISADVANTAGE_FRAMES, 3);
  const plus = createAttackInstance("special", { reversalInvulnerableFrames: 5, blockstunFrames: 30, recoveryFrames: 4 });
  assert.ok(plus.recoveryFrames >= plus.blockstunFrames + REVERSAL_BLOCK_DISADVANTAGE_FRAMES);
  assert.equal(plus.totalFrames, plus.startupFrames + plus.activeFrames + plus.recoveryFrames);
  const plain = createAttackInstance("special", { blockstunFrames: 30, recoveryFrames: 4 });
  assert.ok(plain.recoveryFrames < plus.recoveryFrames, "a move without invulnerability is not clamped");
  // Neutral gate: game.js grants the invulnerability only to a real reversal
  // (wake-up window, guard reversal) or a paid move (EX/super, gritCost > 0).
  // Free back specials keep the field for wake-up use but are no longer
  // hurtbox-less from frame 0 when pressed in neutral.
  assert.match(gameSource, /const invulnerableStart = reversal \|\| \(fighter\.attacking\.reversalInvulnerableFrames > 0 && gritCost > 0\);/);
  assert.doesNotMatch(gameSource, /if \(reversal \|\| fighter\.attacking\.reversalInvulnerableFrames\) \{/);
}

// 5.3 CLOSE RANGE — the whiffed throw. 4.4's tax table already covered
// baseKind "throw" at 0.25, but nothing ever whiffed a throw: applyProximityGrab
// refused to convert the press outside the grab range, so →+LP at range came
// out as a safe advancing light instead. With the commit band the tax finally
// has a swing to charge, and these are the numbers it charges.
function testWhiffedThrowIsARealPunishWindow() {
  // Every kit, so a future kit edit cannot ship a throw that whiffs for free.
  for (const id of ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "devil", "commissioner"]) {
    const grab = createFighterMove(id, "throw", {});
    const tax = whiffRecoveryFrames(grab);
    assert.equal(tax, Math.max(WHIFF_RECOVERY_MINIMUM_FRAMES, Math.round(grab.recoveryFrames * WHIFF_RECOVERY_TAX.throw)),
      `${id}: a whiffed grab pays the throw row of the tax table`);
    assert.ok(tax >= 5 && tax <= 8, `${id}: the throw tax measures 5-8 frames, got ${tax}`);
    // The whole commitment a mistimed grab now costs: the move, the tax and
    // the re-arm gap the 4.5 rule adds on top. Measured in the browser on
    // deathblow: 38 + 8 + 4 = 50 frames, 833 ms of standing still.
    const commitment = grab.totalFrames + tax + ATTACK_REARM_FRAMES;
    assert.ok(commitment >= 39 && commitment <= 52,
      `${id}: a whiffed grab commits 39-52 frames, got ${commitment}`);
    // It must out-commit the fighter's own fastest button by a clear margin,
    // or "I whiffed a grab" would not be a punishable mistake.
    const jab = createFighterMove(id, "light", {});
    assert.ok(commitment > jab.totalFrames + whiffRecoveryFrames(jab) + ATTACK_REARM_FRAMES + 12,
      `${id}: a whiffed grab must cost far more than a whiffed jab`);
  }
  // And the tax is still the SMALLEST multiplier in the table — the length of
  // the punish comes from the throw's own long recovery, not from a new
  // penalty invented for this pass.
  assert.equal(WHIFF_RECOVERY_TAX.throw, 0.25);
  assert.ok(Object.values(WHIFF_RECOVERY_TAX).every((scale) => scale >= WHIFF_RECOVERY_TAX.throw));
}

// The commit band and the clinch tech, wired through game.js. The band is the
// mechanism that makes the tax above reachable; the clinch tech is the answer
// that keeps the read two-sided.
function testThrowCommitBandAndClinchTechWiring() {
  // Reach unchanged (104px × the 1.14 scale), commit band beyond it.
  assert.equal(THROW_RULES.grabRange, Math.round(104 * 1.14));
  assert.ok(THROW_RULES.attemptRange > THROW_RULES.grabRange);
  // A back-walk covers backWalkSpeed / 60 units a frame, and the universal
  // throws start in 4-5 frames: 5 × 4.98 = 25 units. The band has to be at
  // least that wide or walking back would never turn a press into a whiff.
  const backWalkPerFrame = MOVEMENT_RULES.backWalkSpeed / 60;
  assert.ok(THROW_RULES.attemptRange - THROW_RULES.grabRange > backWalkPerFrame * 5,
    "the commit band must exceed the ground a back-walk covers during throw startup");
  // The two sim sites the band needs: the press converts on the wide range…
  assert.match(gameSource, /if \(!fighter\.grabbed\s*\n\s*&& !inProximityGrabAttemptRange\(/);
  // …and the grab only LANDS inside the reach, re-checked at contact.
  assert.match(gameSource, /if \(attack\.kind === "throw" && Math\.abs\(victim\.x - attacker\.x\) > PROXIMITY_GRAB_RANGE\) return;/);
  // The WHIFF tell is the 5.1 one, reached through the same noteWhiff site —
  // no second tell system, and a throw whiff is counted apart from the rest.
  assert.match(gameSource, /if \(!rollbackResimulating && attack\.kind === "throw"\) mechFxDebug\.throwWhiffs \+= 1;/);
  // The clinch tech runs inside updateGrabHolds on the fighter field the
  // rollback snapshot already carries.
  assert.match(gameSource, /grab\.frame <= DEFENSE_RULES\.clinchTechWindowFrames/);
  assert.match(gameSource, /startTick: state\.simulationTick,/);
  assert.ok(DEFENSE_RULES.clinchTechWindowFrames > DEFENSE_RULES.throwTechWindowFrames,
    "the reaction half is the longer half — it is the one a human actually uses");
}

testRearmGap();
testWhiffTaxScalesWithRecovery();
testWhiffTaxExemptions();
testKitMovesAreTaxedByBaseKind();
testWalkTempoAndStrideCadence();
testVoltageCancelIsOnePerStringOnBlock();
testBlockedHitsPayHalfGrit();
testProjectileGritIsCappedPerProjectile();
testReversalInvulnerabilityClampAndNeutralGate();
testWhiffedThrowIsARealPunishWindow();
testThrowCommitBandAndClinchTechWiring();

console.log("Final Blow tempo tests passed");
