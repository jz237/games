import assert from "node:assert/strict";
import {
  FIGHTER_KITS,
  KIT_ACTIONS,
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
import { MOVEMENT_RULES } from "../engine/defense.mjs";

function history(tokens) {
  return tokens.map((token, index) => ({ token, frame: index * 4 + 1 }));
}

function testCompleteKits() {
  assert.deepEqual(Object.keys(FIGHTER_KITS), ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali"]);
  for (const id of Object.keys(FIGHTER_KITS)) {
    const kit = FIGHTER_KITS[id];
    assert.ok(kit.archetype.length > 8);
    assert.equal(listFighterMoves(id).length, 9);
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
  assert.ok(deathblow.movement.forwardWalkSpeed < MOVEMENT_RULES.forwardWalkSpeed);
  assert.ok(jez.movement.forwardWalkSpeed > MOVEMENT_RULES.forwardWalkSpeed);
  assert.ok(deathblow.movement.standingPushboxHalfWidth > jez.movement.standingPushboxHalfWidth);
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
  assert.notEqual(deathblow.moves.commandSpecial.id, jez.moves.commandSpecial.id);
  assert.equal(selectKitMoveKey("light", { forwardHeld: true }), "forwardLight");
  assert.equal(selectKitMoveKey("heavy", { forwardHeld: true }), "overhead");
  assert.equal(getFighterMovement("jez", MOVEMENT_RULES).forwardDashSpeed, 670);
}

function testMoveInstancesAndArt() {
  const faultline = createFighterMove("deathblow", "commandSpecial");
  assert.equal(faultline.profileId, "deathblow-faultline-fist");
  assert.equal(faultline.moveName, "FAULTLINE FIST");
  assert.equal(faultline.totalFrames, 45);
  assert.deepEqual(attackAnimationPose(faultline, 0), { bank: "specials", frame: 0 });
  assert.deepEqual(attackAnimationPose(faultline, faultline.activeStartFrame), { bank: "specials", frame: 1 });
  assert.deepEqual(attackAnimationPose(faultline, faultline.activeEndFrame - 1), { bank: "specials", frame: 2 });
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

testCompleteKits();
testDistinctArchetypesAndFrameData();
testMoveInstancesAndArt();
testCommandsAndAi();

console.log("Final Blow eight-fighter kit tests passed");
