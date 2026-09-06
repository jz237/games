import assert from "node:assert/strict";
import {
  AUTHORED_MOVEMENT_BASELINE,
  FIGHTER_KITS,
  KIT_ACTIONS,
  MOTION_CELLS,
  attackAnimationPose,
  createFighterMove,
  fighterActionCost,
  fighterActionGroup,
  getFighterMovement,
  listFighterMoves,
  recognizeFighterCommand,
  selectKitAiIntent,
  selectKitMoveKey,
} from "../engine/fighter-kits.mjs";
import { GRIT_RULES } from "../engine/combos.mjs";
import { MOVEMENT_RULES, attackFrameData } from "../engine/defense.mjs";
import { ARCADE_TUNING, REVERSAL_BLOCK_DISADVANTAGE_FRAMES } from "../engine/foundation.mjs";

function history(tokens) {
  return tokens.map((token, index) => ({ token, frame: index * 4 + 1 }));
}

function testCompleteKits() {
  // Wave 16: the Commissioner's real kit joins the eight mains — every rule
  // in this loop now holds him to the same standard.
  // Wave 17: the Pinelands Devil is the tenth kit under the same contract.
  assert.deepEqual(Object.keys(FIGHTER_KITS), ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "devil", "commissioner"]);
  for (const id of Object.keys(FIGHTER_KITS)) {
    const kit = FIGHTER_KITS[id];
    assert.ok(kit.archetype.length > 8);
    // Nine authored entries plus the two derived forward command kicks, the
    // personal throwable object and its wave-11 EX tier.
    const moves = listFighterMoves(id);
    assert.equal(moves.length, 13);
    const throwable = moves.find((move) => move.command.includes("↓ ← + KICK"));
    assert.ok(throwable, `${id} must list a personal throwable object`);
    assert.match(throwable.command, /per round/);
    for (const key of [
      "standLight", "forwardLight", "crouchLight", "standHeavy", "crouchHeavy", "overhead",
      "special", "commandSpecial", "backSpecial", "launcher", "enhanced",
      "enhancedCommandSpecial", "enhancedBackSpecial", "enhancedLauncher", "throw", "super",
    ]) assert.ok(kit.moves[key], `${id} must define ${key}`);
    assert.equal(kit.moves.enhanced.gritCost, GRIT_RULES.enhancedSpecialCost);
    assert.equal(kit.moves.enhancedCommandSpecial.gritCost, GRIT_RULES.enhancedSpecialCost);
    assert.equal(kit.moves.enhancedBackSpecial.gritCost, GRIT_RULES.enhancedSpecialCost);
    assert.equal(kit.moves.enhancedLauncher.gritCost, GRIT_RULES.enhancedSpecialCost);
    assert.equal(kit.moves.super.gritCost, GRIT_RULES.superCost);
    assert.equal(kit.moves.super.superMove, true);
    assert.equal(kit.moves.super.animation.bank, "specials");
    assert.equal(kit.victory.frame, 15);
  }
}

function testDistinctArchetypesAndFrameData() {
  const deathblow = FIGHTER_KITS.deathblow;
  const jez = FIGHTER_KITS.jez;
  const alan = FIGHTER_KITS.alan;
  const post = FIGHTER_KITS.post;
  const benny = FIGHTER_KITS.benny;
  const donald = FIGHTER_KITS.donald;
  const cyraxx = FIGHTER_KITS.cyraxx;
  const ali = FIGHTER_KITS.ali;
  // Movement is authored as ratios of the shared rules, so assert the resolved
  // values the game actually uses rather than the raw literals.
  const movementFor = (id) => getFighterMovement(id, MOVEMENT_RULES);
  const deathblowMovement = movementFor("deathblow");
  const jezMovement = movementFor("jez");
  assert.ok(deathblowMovement.forwardWalkSpeed < MOVEMENT_RULES.forwardWalkSpeed);
  assert.ok(jezMovement.forwardWalkSpeed > MOVEMENT_RULES.forwardWalkSpeed);
  assert.ok(deathblowMovement.standingPushboxHalfWidth > jezMovement.standingPushboxHalfWidth);
  // Shared tempo and fighter scale must reach every fighter, not just the ones
  // without overrides.
  for (const id of ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali"]) {
    const movement = movementFor(id);
    assert.ok(
      movement.forwardWalkSpeed > AUTHORED_MOVEMENT_BASELINE.forwardWalkSpeed,
      `${id} must inherit the faster arcade walk`,
    );
    assert.ok(
      Math.abs(movement.jumpVelocityY) > Math.abs(AUTHORED_MOVEMENT_BASELINE.jumpVelocityY),
      `${id} must inherit the scaled jump`,
    );
  }
  assert.ok(deathblow.moves.standHeavy.startupFrames > jez.moves.standHeavy.startupFrames);
  assert.ok(deathblow.moves.standHeavy.damage > jez.moves.standHeavy.damage);
  assert.equal(deathblow.moves.backSpecial.level, "throw");
  assert.equal(jez.moves.backSpecial.ignorePushbox, true);
  assert.equal(deathblow.moves.special.armorFrames, 9);
  assert.equal(jez.moves.super.maxHits, 7);
  assert.equal(jez.moves.super.juggleLimit, 8);
  assert.equal(deathblow.moves.super.maxHits, 4);
  assert.equal(alan.moves.backSpecial.counterDamage, 23);
  assert.equal(alan.moves.enhancedBackSpecial.counterSuper, true);
  assert.equal(alan.moves.super.maxHits, 6);
  assert.equal(post.moves.backSpecial.trap.offsets.length, 1);
  assert.equal(post.moves.enhancedBackSpecial.trap.offsets.length, 2);
  assert.equal(post.moves.super.maxHits, 7);
  assert.ok(post.movement.backDashSpeed > post.movement.forwardDashSpeed);
  assert.ok(alan.movement.standingPushboxHalfWidth > post.movement.standingPushboxHalfWidth);
  assert.equal(benny.moves.commandSpecial.maxHits, 3);
  assert.equal(benny.moves.commandSpecial.rushCancel, true);
  assert.ok(benny.movement.forwardDashSpeed > jez.movement.forwardDashSpeed);
  assert.deepEqual(donald.moves.commandSpecial.projectile.spawnFrames, [12]);
  assert.deepEqual(donald.moves.enhancedCommandSpecial.projectile.spawnFrames, [9, 15]);
  assert.equal(donald.moves.backSpecial.retreatSpeed, 470);
  assert.equal(donald.moves.super.maxHits, 9);
  assert.ok(donald.movement.backWalkSpeed > donald.movement.forwardWalkSpeed);
  assert.equal(cyraxx.moves.commandSpecial.projectile.style, "feedback");
  assert.equal(cyraxx.moves.commandSpecial.projectile.armFrames, 22);
  assert.deepEqual(cyraxx.moves.enhancedCommandSpecial.projectile.armFramesByIndex, [15, 31]);
  assert.equal(cyraxx.moves.backSpecial.ignorePushbox, true);
  assert.equal(cyraxx.moves.super.maxHits, 7);
  assert.equal(ali.moves.special.rhythmCancel, true);
  assert.equal(ali.moves.special.rhythmCancelStacks, 2);
  assert.equal(ali.moves.enhanced.rhythmCancelStacks, 1);
  assert.equal(ali.moves.commandSpecial.maxHits, 3);
  assert.equal(ali.moves.super.maxHits, 8);
  assert.ok(ali.movement.forwardDashSpeed > cyraxx.movement.forwardDashSpeed);
  // Wave 16 — the Commissioner: longest pokes in the game, slowest feet, a
  // true command grab and the armored FINAL AUTHORITY. Not a DeathBlow reskin.
  const commissioner = FIGHTER_KITS.commissioner;
  assert.notEqual(commissioner.moves.commandSpecial.id, deathblow.moves.commandSpecial.id);
  assert.ok(commissioner.moves.standLight.range > deathblow.moves.standLight.range, "cane jab outranges every brawler jab");
  assert.ok(commissioner.moves.standHeavy.range > alan.moves.standHeavy.range);
  assert.ok(commissioner.moves.commandSpecial.range >= 260, "Ledger Lance is a full-screen-third poke");
  assert.equal(commissioner.moves.backSpecial.level, "throw", "Binding Clause is an unblockable contract grab");
  assert.equal(commissioner.moves.enhancedBackSpecial.level, "throw");
  assert.equal(commissioner.moves.super.moveName, "FINAL AUTHORITY");
  assert.ok(commissioner.moves.super.armorFrames >= 10, "the super armors through the exchange");
  assert.ok(commissioner.moves.special.armorFrames > 0, "Cane Check trades on armor");
  assert.ok(commissioner.movement.forwardWalkSpeed < alan.movement.forwardWalkSpeed
    || commissioner.movement.forwardWalkSpeed < deathblow.movement.forwardWalkSpeed, "slow feet balance the reach");
  assert.ok(commissioner.moves.standLight.startupFrames >= jez.moves.standLight.startupFrames + 2, "reach is paid for in startup");
  assert.notEqual(deathblow.moves.commandSpecial.id, jez.moves.commandSpecial.id);
  assert.equal(selectKitMoveKey("light", { forwardHeld: true }), "forwardLight");
  assert.equal(selectKitMoveKey("heavy", { forwardHeld: true }), "overhead");
  // Jez keeps his authored dash ratio against the shared rules.
  assert.equal(
    getFighterMovement("jez", MOVEMENT_RULES).forwardDashSpeed,
    Math.round((670 / AUTHORED_MOVEMENT_BASELINE.forwardDashSpeed) * MOVEMENT_RULES.forwardDashSpeed),
  );
  assert.ok(getFighterMovement("jez", MOVEMENT_RULES).forwardDashSpeed > 670, "the scaled world dashes further");
}

function testMoveInstancesAndArt() {
  const faultline = createFighterMove("deathblow", "commandSpecial");
  assert.equal(faultline.profileId, "deathblow-faultline-fist");
  assert.equal(faultline.moveName, "FAULTLINE FIST");
  assert.equal(faultline.totalFrames, faultline.startupFrames + faultline.activeFrames + faultline.recoveryFrames);
  assert.ok(faultline.recoveryFrames >= 20, "a whiffed command special is punishable");
  assert.deepEqual(attackAnimationPose(faultline, 0), { bank: "specials", frame: 0 });
  assert.deepEqual(attackAnimationPose(faultline, faultline.activeStartFrame), { bank: "specials", frame: 1 });
  // v2.6 BODY-FIRST: heavies/specials three-beat the active window — the
  // mid-active frame is the second strike cell, and the FOLLOW-THROUGH
  // (recovery cell) arrives a third early so no active window freezes.
  const midActive = faultline.activeStartFrame + Math.floor(faultline.activeFrames * 0.5);
  assert.deepEqual(attackAnimationPose(faultline, midActive), { bank: "specials", frame: 2 });
  // v2.7 FRAMES: the late-active beat is the authored follow-through motion
  // cell, carrying the exact recovery cell it replaced as its fallback.
  assert.deepEqual(attackAnimationPose(faultline, faultline.activeEndFrame - 1),
    { bank: "motion", frame: MOTION_CELLS.follow, fallback: { bank: "specials", frame: 3 } });
  assert.deepEqual(attackAnimationPose(faultline, faultline.activeEndFrame), { bank: "specials", frame: 3 });

  const vinyl = createFighterMove("jez", "backSpecial");
  assert.equal(vinyl.moveName, "VINYL STEP");
  assert.equal(vinyl.animation.frames[0], 4);
  assert.equal(vinyl.ignorePushbox, true);
  assert.equal(fighterActionCost("jez", "enhancedBackSpecial"), 25);
  assert.equal(fighterActionGroup("enhancedLauncher"), "enhanced");
  assert.ok(KIT_ACTIONS.includes("backSpecial"));

  const southpaw = createFighterMove("alan", "backSpecial");
  assert.equal(southpaw.moveName, "SOUTHPAW COUNTER");
  assert.equal(southpaw.hitboxes.length, 0);
  assert.equal(southpaw.counterWindowTo, 16);
  assert.deepEqual(southpaw.animation.frames, [4, 5, 6, 7]);

  const wetPaint = createFighterMove("post", "enhancedBackSpecial");
  assert.equal(wetPaint.moveName, "WET PAINT EX");
  assert.deepEqual(wetPaint.trap.offsets, [88, 205]);
  assert.equal(wetPaint.gritCost, 25);

  const blitz = createFighterMove("benny", "commandSpecial");
  assert.equal(blitz.moveName, "BENNY BLITZ");
  assert.equal(blitz.maxHits, 3);
  assert.ok(blitz.cancelRoutes.includes("commandSpecial"));
  const shockwave = createFighterMove("donald", "enhancedCommandSpecial");
  assert.equal(shockwave.moveName, "GOLDEN SHOCKWAVE EX");
  assert.equal(shockwave.hitboxes.length, 0);
  assert.equal(shockwave.projectile.yOffsets.length, 2);
  const feedbackLoop = createFighterMove("cyraxx", "enhancedCommandSpecial");
  assert.equal(feedbackLoop.moveName, "FEEDBACK LOOP EX");
  assert.equal(feedbackLoop.hitboxes.length, 0);
  assert.deepEqual(feedbackLoop.projectile.xOffsets, [139, 284]);
  const massiveStep = createFighterMove("ali", "commandSpecial");
  assert.equal(massiveStep.moveName, "MASSIVE STEP");
  assert.equal(massiveStep.rhythmCancel, true);
  assert.ok(massiveStep.cancelRoutes.includes("special"));
}

function testCommandsAndAi() {
  assert.equal(recognizeFighterCommand("deathblow", history(["down", "back", "punch"]), 9)?.action, "backSpecial");
  assert.equal(recognizeFighterCommand("jez", history(["down", "forward", "enhanced"]), 9)?.action, "enhancedCommandSpecial");
  assert.equal(recognizeFighterCommand("jez", history(["forward", "down", "forward", "enhanced"]), 13)?.action, "enhancedLauncher");
  assert.equal(recognizeFighterCommand("post", history(["down", "back", "punch"]), 9)?.action, "backSpecial");
  assert.equal(recognizeFighterCommand("alan", history(["down", "back", "enhanced"]), 9)?.action, "enhancedBackSpecial");
  assert.equal(recognizeFighterCommand("benny", history(["down", "forward", "punch"]), 9)?.action, "commandSpecial");
  assert.equal(recognizeFighterCommand("donald", history(["down", "back", "punch"]), 9)?.action, "backSpecial");
  assert.equal(recognizeFighterCommand("cyraxx", history(["down", "forward", "punch"]), 9)?.action, "commandSpecial");
  assert.equal(recognizeFighterCommand("ali", history(["down", "back", "enhanced"]), 9)?.action, "enhancedBackSpecial");

  assert.equal(selectKitAiIntent("deathblow", { distance: 40, roll: 0.1 }).action, "backSpecial");
  assert.equal(selectKitAiIntent("jez", { distance: 220, roll: 0.2 }).action, "special");
  assert.equal(selectKitAiIntent("jez", { distance: 130, opponentAirborne: true }).action, "launcher");
  assert.equal(selectKitAiIntent("jez", { distance: 180, meter: 100, roll: 0.1 }).action, "super");
  const allanCounter = selectKitAiIntent("alan", { distance: 120, opponentAttacking: true, roll: 0.2 });
  assert.deepEqual(allanCounter, { movement: "hold", action: "backSpecial", response: "counter" });
  assert.equal(selectKitAiIntent("post", { distance: 80, roll: 0.2 }).movement, "retreat");
  assert.equal(selectKitAiIntent("post", { distance: 420, roll: 0.2 }).action, "backSpecial");
  assert.equal(selectKitAiIntent("benny", { distance: 140, roll: 0.2 }).movement, "advance");
  assert.equal(selectKitAiIntent("donald", { distance: 80, roll: 0.2 }).movement, "retreat");
  assert.equal(selectKitAiIntent("donald", { distance: 440, roll: 0.2 }).action, "commandSpecial");
  assert.equal(selectKitAiIntent("cyraxx", { distance: 390, roll: 0.2 }).action, "commandSpecial");
  assert.equal(selectKitAiIntent("cyraxx", { distance: 70, roll: 0.2 }).movement, "retreat");
  assert.equal(selectKitAiIntent("ali", { distance: 180, roll: 0.2 }).action, "commandSpecial");
}

// BLOCK ECONOMY invariant: any move that carries reversal invulnerability is
// negative on block, across every kit, on its own authored numbers. Before
// this pass the three rushdown EX back specials were invulnerable from frame
// 0 AND +9/+10 on block (last-active-frame convention), which has no
// counter-read at all. The foundation clamp is a backstop only: the second
// assertion proves it never fires on shipped data, so a kit edit that leans
// on it fails here instead of shipping a silently stretched move.
function testReversalInvulnerabilityIsNegativeOnBlock() {
  let audited = 0;
  for (const id of Object.keys(FIGHTER_KITS)) {
    for (const [key, raw] of Object.entries(FIGHTER_KITS[id].moves)) {
      const move = createFighterMove(id, key, {});
      if (!move || !(move.reversalInvulnerableFrames > 0)) continue;
      audited += 1;
      const data = attackFrameData(move);
      assert.ok(
        data.onBlock <= -REVERSAL_BLOCK_DISADVANTAGE_FRAMES,
        `${id} ${move.profileId} is invulnerable (${move.reversalInvulnerableFrames}f) so it must be at least −${REVERSAL_BLOCK_DISADVANTAGE_FRAMES} on block, got ${data.onBlock}`,
      );
      const authoredRecovery = Math.max(4, Math.round(raw.recoveryFrames * (ARCADE_TUNING.recovery[raw.baseKind] ?? 1)));
      assert.equal(
        move.recoveryFrames,
        authoredRecovery,
        `${id} ${move.profileId}: the on-block floor must come from the authored recovery, not the createAttackInstance clamp`,
      );
    }
  }
  assert.ok(audited >= 30, `the audit must actually cover the roster's reversals (saw ${audited})`);

  // The three EX cross-throughs keep their payoff (2-3f startup, the side
  // switch, the invulnerability) and pay for it in recovery: the documented
  // numbers, pinned so a retune is a deliberate edit here too.
  const expected = {
    "ali-ex-beat-skip": { startup: 2, onBlock: -6 },
    "benny-ex-live-wire": { startup: 2, onBlock: -6 },
    "cyraxx-ex-buffer-skip": { startup: 3, onBlock: -6 },
  };
  for (const [id, action] of [["ali", "enhancedBackSpecial"], ["benny", "enhancedBackSpecial"], ["cyraxx", "enhancedBackSpecial"]]) {
    const move = createFighterMove(id, action, {});
    const data = attackFrameData(move);
    assert.equal(data.startup, expected[move.profileId].startup, `${move.profileId} keeps its startup`);
    assert.equal(data.onBlock, expected[move.profileId].onBlock, `${move.profileId} on-block`);
    assert.equal(move.ignorePushbox, true, `${move.profileId} still crosses through`);
    assert.ok(move.reversalInvulnerableFrames >= 8, `${move.profileId} keeps its invulnerability`);
  }
  // Their free versions were plus too (+3/+3/+4) and are now ordinary
  // minus-on-block specials like every other fighter's.
  for (const id of ["ali", "benny", "cyraxx"]) {
    const data = attackFrameData(createFighterMove(id, "backSpecial", {}));
    assert.ok(data.onBlock <= -3 && data.onBlock >= -5, `${id} back special lands −3..−5 on block, got ${data.onBlock}`);
  }
}

testCompleteKits();
testDistinctArchetypesAndFrameData();
testMoveInstancesAndArt();
testCommandsAndAi();
testReversalInvulnerabilityIsNegativeOnBlock();

console.log("Final Blow eight-fighter kit tests passed");
