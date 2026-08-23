import assert from "node:assert/strict";
import {
  AI_DIFFICULTIES,
  AI_DIFFICULTY_ORDER,
  aiBrainSnapshot,
  createAiBrain,
  isPassiveDifficulty,
  decideAiIntent,
  getReactionObservation,
  justDefendHold,
  recordAiObservation,
  stepAiBrain,
  visibleOpponentObservation,
} from "../engine/ai.mjs";

const attack = (overrides = {}) => ({
  level: "mid", kind: "heavy", activeStartFrame: 8, activeEndFrame: 15,
  range: 160, kitAction: "heavy", ...overrides,
});

const fighter = (id, overrides = {}) => ({
  id,
  x: 500,
  y: 600,
  grounded: true,
  crouch: false,
  guarding: false,
  down: false,
  wakeupFrames: 0,
  justWoke: false,
  attacking: null,
  attackFrame: 0,
  attackConnected: "",
  attackHits: 0,
  attackSerial: 0,
  meter: 0,
  health: 100,
  ...overrides,
});

function findRoll(predicate) {
  for (let index = 1; index < 1000; index += 1) {
    const roll = index / 1000;
    if (predicate(roll)) return roll;
  }
  throw new Error("No deterministic roll satisfied the behavior");
}

function testDifficultyFairness() {
  assert.deepEqual(Object.keys(AI_DIFFICULTIES), ["passive", "rookie", "street", "pro", "final"]);
  assert.deepEqual([...AI_DIFFICULTY_ORDER], ["passive", "rookie", "street", "pro", "final"]);
  const fighting = AI_DIFFICULTY_ORDER.filter((id) => id !== "passive").map((id) => AI_DIFFICULTIES[id]);
  assert.ok(fighting.every(({ reactionFrames }) => reactionFrames >= 6), "every level must retain visible human reaction delay");
  assert.ok(fighting.every(({ errorChance }) => errorChance > 0), "even FINAL difficulty must make execution errors");
  assert.ok(AI_DIFFICULTIES.rookie.reactionFrames > AI_DIFFICULTIES.street.reactionFrames);
  assert.ok(AI_DIFFICULTIES.street.reactionFrames > AI_DIFFICULTIES.pro.reactionFrames);
  assert.ok(AI_DIFFICULTIES.pro.reactionFrames > AI_DIFFICULTIES.final.reactionFrames);
  // Grab pressure and tech skill rise with the ladder.
  assert.ok(AI_DIFFICULTIES.final.throwTechChance > AI_DIFFICULTIES.rookie.throwTechChance);
  assert.ok(AI_DIFFICULTIES.pro.grabPressureChance > AI_DIFFICULTIES.rookie.grabPressureChance);
  // Release 1.7: the defensive-depth skills rise with the ladder too, and
  // every fighting level actually uses each one.
  for (const key of ["quickRiseChance", "wakeDelayChance", "airRecoveryChance", "perfectGuardChance"]) {
    assert.ok(fighting.every((settings) => settings[key] > 0), `every fighting level uses ${key}`);
    assert.ok(AI_DIFFICULTIES.final[key] > AI_DIFFICULTIES.rookie[key], `${key} rises with the ladder`);
  }
}

function testPassiveIsInert() {
  assert.equal(isPassiveDifficulty("passive"), true);
  assert.equal(isPassiveDifficulty("rookie"), false);
  const settings = AI_DIFFICULTIES.passive;
  assert.equal(settings.inert, true);
  for (const key of ["defenseChance", "antiAirChance", "comboChance", "throwChance",
    "meterChance", "wakeupReversalChance", "errorChance", "throwTechChance", "grabPressureChance",
    "quickRiseChance", "wakeDelayChance", "airRecoveryChance", "perfectGuardChance"]) {
    assert.equal(settings[key], 0, `passive ${key} must be zero`);
  }

  // Whatever the passive brain is shown, and however the dice fall, it must
  // never produce a single input: no advance, attack, guard, jump, throw,
  // reversal, meter spend or Final Blow.
  const brain = createAiBrain("passive");
  const empty = {
    left: false, right: false, down: false, guard: false, jump: false,
    light: false, heavy: false, special: false, enhanced: false, throw: false,
    super: false, final: false,
  };
  const distances = [10, 60, 140, 300, 620];
  for (let frame = 0; frame < 600; frame += 1) {
    const distance = distances[frame % distances.length];
    const opponent = fighter("jez", {
      x: 500 + distance,
      attacking: frame % 3 === 0 ? attack() : null,
      grounded: frame % 7 !== 0,
    });
    const self = fighter("deathblow", { x: 500, meter: 100, justWoke: frame % 11 === 0, wakeupFrames: frame % 11 === 0 ? 2 : 0 });
    const input = stepAiBrain(brain, { frame, self, opponent, roll: (frame % 97) / 97 });
    assert.deepEqual(input, empty, `passive produced an input on frame ${frame}`);
  }
  assert.equal(aiBrainSnapshot(brain).intent.reason, "passive");
}

function testDelayedVisibleObservations() {
  const brain = createAiBrain("rookie");
  recordAiObservation(brain, 0, fighter("jez", { x: 650 }));
  for (let frame = 1; frame <= 20; frame += 1) {
    recordAiObservation(brain, frame, fighter("jez", { x: 650, attacking: attack() }));
  }
  assert.equal(getReactionObservation(brain, 19), null);
  assert.equal(getReactionObservation(brain, 20).attacking, false, "frame 20 may only see the frame-0 idle pose");
  assert.equal(getReactionObservation(brain, 21).attacking, true, "the visible attack arrives exactly after the reaction delay");
  const observation = visibleOpponentObservation({ ...fighter("jez"), secretInput: { heavy: true } }, 5);
  assert.equal("secretInput" in observation, false, "AI observations must exclude player input state");
}

function testDefenseAntiAirWakeupAndCombos() {
  const brain = createAiBrain("final");
  const self = fighter("alan");
  const low = visibleOpponentObservation(fighter("jez", { x: 570, attacking: attack({ level: "low" }) }), 0);
  const blockRoll = findRoll((roll) => decideAiIntent(brain, { frame: 10, self, observation: low, roll }).reason === "low-block");
  const lowBlock = decideAiIntent(brain, { frame: 10, self, observation: low, roll: blockRoll });
  assert.equal(lowBlock.guard, true);
  assert.equal(lowBlock.down, true);

  const airborne = visibleOpponentObservation(fighter("jez", { x: 620, y: 430, grounded: false }), 0);
  const antiAirRoll = findRoll((roll) => decideAiIntent(brain, { frame: 20, self, observation: airborne, roll }).reason === "anti-air");
  assert.equal(decideAiIntent(brain, { frame: 20, self, observation: airborne, roll: antiAirRoll }).action, "launcher");

  const waking = fighter("deathblow", { wakeupFrames: 3, meter: 50 });
  const wakeRoll = findRoll((roll) => decideAiIntent(brain, { frame: 30, self: waking, observation: low, roll }).reason === "wakeup-reversal");
  assert.equal(decideAiIntent(brain, { frame: 30, self: waking, observation: low, roll: wakeRoll }).action, "enhancedLauncher");

  const confirming = fighter("benny", {
    meter: 100,
    attackConnected: "hit",
    attackHits: 1,
    attackSerial: 7,
    attacking: attack({ kitAction: "special" }),
  });
  const comboRoll = findRoll((roll) => decideAiIntent(brain, { frame: 40, self: confirming, observation: low, roll }).reason === "hit-confirm");
  const followup = decideAiIntent(brain, { frame: 40, self: confirming, observation: low, roll: comboRoll });
  assert.equal(followup.reason, "hit-confirm");
  assert.ok(followup.action, "a confirmed hit should route into a legal follow-up action");
}

function testArchetypesAndDeterminism() {
  const brain = createAiBrain("pro");
  const far = visibleOpponentObservation(fighter("jez", { x: 960 }), 0);
  const cyraxx = fighter("cyraxx", { x: 350 });
  const echoRoll = findRoll((roll) => decideAiIntent(brain, { frame: 30, self: cyraxx, observation: far, roll }).action === "commandSpecial");
  assert.equal(decideAiIntent(brain, { frame: 30, self: cyraxx, observation: far, roll: echoRoll }).action, "commandSpecial");

  const close = visibleOpponentObservation(fighter("jez", { x: 555 }), 0);
  const donald = fighter("donald", { x: 500 });
  const retreatRoll = findRoll((roll) => decideAiIntent(brain, { frame: 40, self: donald, observation: close, roll }).movement === "retreat");
  assert.equal(decideAiIntent(brain, { frame: 40, self: donald, observation: close, roll: retreatRoll }).movement, "retreat");

  const first = createAiBrain("street");
  const second = createAiBrain("street");
  const outputsA = [];
  const outputsB = [];
  for (let frame = 0; frame < 90; frame += 1) {
    const opponent = fighter("jez", { x: 700 - frame, attacking: frame >= 24 && frame < 38 ? attack() : null });
    outputsA.push(stepAiBrain(first, { frame, self: fighter("post"), opponent, roll: 0.314159 }));
    outputsB.push(stepAiBrain(second, { frame, self: fighter("post"), opponent, roll: 0.314159 }));
  }
  assert.deepEqual(outputsA, outputsB);
  assert.deepEqual(aiBrainSnapshot(first), aiBrainSnapshot(second));
  assert.ok(aiBrainSnapshot(first).lastObservedFrame <= 89 - AI_DIFFICULTIES.street.reactionFrames);
}

// Release 1.7: the CPU interacts with every DEPTH mechanic through the same
// inputs a human uses — Up/Down while downed, an attack button while juggled,
// and a timed guard hold for the just-defend.
function testDepthDefensiveOptions() {
  const brain = createAiBrain("final");
  const observation = visibleOpponentObservation(fighter("jez", { x: 640 }), 0);

  const downed = fighter("deathblow", { down: true, knockdownFrames: 30 });
  const quickRoll = findRoll((roll) => decideAiIntent(brain, { frame: 10, self: downed, observation, roll }).reason === "quick-rise");
  const quickRise = decideAiIntent(brain, { frame: 10, self: downed, observation, roll: quickRoll });
  assert.equal(quickRise.jump, true, "quick rise arrives as the Up input");
  assert.equal(quickRise.action, null);
  const delayRoll = findRoll((roll) => decideAiIntent(brain, { frame: 10, self: downed, observation, roll }).reason === "delay-wakeup");
  const delayed = decideAiIntent(brain, { frame: 10, self: downed, observation, roll: delayRoll });
  assert.equal(delayed.down, true, "delayed wake-up arrives as the Down input");

  const juggled = fighter("deathblow", { grounded: false, y: 420, pendingKnockdown: true, airTechArmed: true });
  const techRoll = findRoll((roll) => decideAiIntent(brain, { frame: 20, self: juggled, observation, roll }).reason === "air-tech");
  assert.equal(decideAiIntent(brain, { frame: 20, self: juggled, observation, roll: techRoll }).action, "light");
  const unarmed = fighter("deathblow", { grounded: false, y: 420, pendingKnockdown: true, airTechArmed: false });
  for (let step = 1; step < 400; step += 1) {
    assert.notEqual(decideAiIntent(brain, { frame: 20, self: unarmed, observation, roll: step / 400 }).reason, "air-tech",
      "an unarmed juggle can never be teched");
  }

  const incoming = visibleOpponentObservation(fighter("jez", { x: 600, attacking: attack({ activeStartFrame: 20 }) }), 0);
  const self = fighter("deathblow", { x: 500 });
  const justDefendRoll = findRoll((roll) => {
    const intent = decideAiIntent(brain, { frame: 5, self, observation: incoming, roll });
    return intent.guard === true && intent.justDefend === true;
  });
  assert.ok(justDefendRoll > 0, "FINAL sometimes times its blocks as just-defends");

  // The hold gate: guard is withheld until the observed attack is within the
  // Perfect Guard window of going active, then held through impact.
  const observed = { ...incoming, attackFrame: 2, attackStartupFrame: 20 };
  assert.equal(justDefendHold(observed, observed.frame + 4), false, "far from active: keep baiting");
  assert.equal(justDefendHold(observed, observed.frame + 14), true, "inside the window: guard goes down");
  assert.equal(justDefendHold(observed, observed.frame + 30), true, "already active: still holds the late block");
  assert.equal(justDefendHold(visibleOpponentObservation(fighter("jez"), 0), 10), false, "no attack: nothing to just-defend");

  // Passive stays inert through every one of the new options.
  const passive = createAiBrain("passive");
  for (let frame = 0; frame < 200; frame += 1) {
    const input = stepAiBrain(passive, {
      frame,
      self: fighter("deathblow", { down: frame % 2 === 0, knockdownFrames: 20, pendingKnockdown: frame % 2 === 1, grounded: frame % 2 === 0, airTechArmed: true }),
      opponent: fighter("jez", { x: 600, attacking: attack() }),
      roll: (frame % 89) / 89,
    });
    assert.equal(input.jump || input.light || input.heavy || input.special || input.guard || input.down, false,
      `passive produced a defensive-option input on frame ${frame}`);
  }
}

testDifficultyFairness();
testPassiveIsInert();
testDelayedVisibleObservations();
testDefenseAntiAirWakeupAndCombos();
testArchetypesAndDeterminism();
testDepthDefensiveOptions();

console.log("Final Blow fair AI tests passed");
