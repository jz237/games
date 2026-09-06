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
  meatyTiming,
  recordAiObservation,
  stepAiBrain,
  visibleOpponentObservation,
  whiffedThrowPunish,
} from "../engine/ai.mjs";
import { DEFENSE_RULES, THROW_RULES } from "../engine/defense.mjs";

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

// 5.3 CLOSE RANGE: the CPU plays the two new reads through the same inputs a
// human uses — a timed light/grab on the vulnerable rising frames, an
// answering grab inside the clinch, and a punish on a throw that has already
// missed. Every branch is reached from the VISIBLE observation only; the wake
// option (quick / delayed) is deliberately not observable, because guessing it
// is the read.
function testCloseRangeReads() {
  const brain = createAiBrain("final");
  const settings = AI_DIFFICULTIES.final;

  // Ladder shape: the new chances rise with difficulty and Passive has none.
  for (const key of ["meatyChance", "clinchTechChance", "throwWhiffPunishChance"]) {
    assert.equal(AI_DIFFICULTIES.passive[key], 0, `passive must never ${key}`);
    assert.ok(AI_DIFFICULTIES.final[key] > AI_DIFFICULTIES.pro[key]);
    assert.ok(AI_DIFFICULTIES.pro[key] > AI_DIFFICULTIES.street[key]);
    assert.ok(AI_DIFFICULTIES.street[key] > AI_DIFFICULTIES.rookie[key]);
    assert.ok(AI_DIFFICULTIES.rookie[key] > 0, `rookie must sometimes ${key}, or the read is invisible below PRO`);
  }

  // --- meaty timing, the same frame arithmetic justDefendHold uses ---------
  const rising = (wakeupFrames, frame = 0) => visibleOpponentObservation(fighter("jez", { x: 600, wakeupFrames }), frame);
  const startup = 5;
  // Too early: the strike would meet the hurtbox-less half of the rise.
  assert.equal(meatyTiming(rising(DEFENSE_RULES.wakeupFrames), 0, startup), false);
  // In the pocket: startup frames before the window opens.
  const openAt = DEFENSE_RULES.wakeupVulnerableFrames + startup;
  assert.equal(meatyTiming(rising(openAt), 0, startup), true);
  assert.equal(meatyTiming(rising(openAt + 1), 0, startup), false, "one frame too early is a whiff");
  // Still true through the window, so a late decision tick still swings.
  assert.equal(meatyTiming(rising(1), 0, startup), true);
  // Past the rise: nothing to meaty.
  assert.equal(meatyTiming(rising(0), 0, startup), false);
  assert.equal(meatyTiming(null, 0, startup), false);
  // The reaction delay is compensated exactly like the just-defend hold: a
  // stale observation of the same rise still resolves to the same press tick.
  assert.equal(meatyTiming(rising(openAt + 6, 0), 6, startup), true, "a 6-frame-stale observation still times the press");

  // --- the intent itself ---------------------------------------------------
  const self = fighter("alan", { x: 500 });
  const observation = rising(openAt);
  const meatyRoll = findRoll((roll) => {
    const fresh = createAiBrain("final");
    return ["meaty", "meaty-throw"].includes(decideAiIntent(fresh, { frame: 0, self, observation, roll }).reason);
  });
  const meatyBrain = createAiBrain("final");
  const meaty = decideAiIntent(meatyBrain, { frame: 0, self, observation, roll: meatyRoll });
  assert.ok(["light", "throw"].includes(meaty.action), "a meaty is a fast button or a command grab, never a slow one");
  assert.equal(meaty.movement, "hold", "the walk-in is over by the time the press happens");
  // The take is LATCHED for the whole knockdown: the roll is a fresh RNG draw
  // every tick in game.js, so re-deciding every frame (which the brain does,
  // to time the press) must not re-roll the decision into existence.
  assert.ok(meatyBrain.okiWindowEnd > 0);
  // Plain finite data only: the aiBrain rides the rollback fighter snapshot
  // (it is not in rollbackFighterReferences), so every latch field has to
  // survive structuredClone and the wire format.
  for (const key of ["okiWindowEnd", "okiTake", "clinchTick", "clinchTake"]) {
    const value = createAiBrain("final")[key];
    assert.ok(["number", "boolean"].includes(typeof value) && (typeof value === "boolean" || Number.isFinite(value)),
      `${key} must be plain finite data for the rollback snapshot`);
  }
  const declining = createAiBrain("final");
  decideAiIntent(declining, { frame: 0, self, observation: rising(DEFENSE_RULES.wakeupFrames), roll: 0.999 });
  assert.equal(declining.okiTake, false, "a declined knockdown stays declined");
  for (let frame = 1; frame < 40; frame += 1) {
    const reason = decideAiIntent(declining, { frame, self, observation: rising(Math.max(1, 16 - frame), frame), roll: 0.001 }).reason;
    assert.notEqual(reason, "meaty", "a declined knockdown must not re-roll into a meaty on a later frame");
  }

  // --- clinch tech ---------------------------------------------------------
  const clinched = (frame) => fighter("alan", { grabbed: { attacker: 1, frame, total: 14, startTick: 100 } });
  const techRoll = findRoll((roll) => {
    const fresh = createAiBrain("final");
    return decideAiIntent(fresh, { frame: 101, self: clinched(1), observation, roll }).reason === "clinch-tech";
  });
  const clinchBrain = createAiBrain("final");
  const tech = decideAiIntent(clinchBrain, { frame: 101, self: clinched(1), observation, roll: techRoll });
  assert.equal(tech.action, "throw", "the tech is an answering grab, the same input a human presses");
  // Latched per clinch, and the window is respected on both edges.
  assert.equal(
    decideAiIntent(clinchBrain, { frame: 120, self: clinched(DEFENSE_RULES.clinchTechWindowFrames + 1), observation, roll: techRoll }).reason,
    "clinched",
    "past the window the CPU is stuck in the hold like anyone else",
  );
  const refusing = createAiBrain("rookie");
  decideAiIntent(refusing, { frame: 101, self: clinched(1), observation, roll: 0.999 });
  for (let frame = 102; frame <= 108; frame += 1) {
    assert.notEqual(
      decideAiIntent(refusing, { frame, self: clinched(frame - 100), observation, roll: 0.001 }).reason,
      "clinch-tech",
      "one clinch is one decision — re-deciding every frame must not inflate the tech rate",
    );
  }

  // --- punishing a throw that already missed -------------------------------
  const whiffedGrab = visibleOpponentObservation(fighter("jez", {
    x: 600,
    attacking: attack({ level: "throw", kind: "throw", activeStartFrame: 5, activeEndFrame: 8 }),
    attackFrame: 12,
  }), 0);
  assert.equal(whiffedThrowPunish(whiffedGrab, 0), true);
  const liveGrab = visibleOpponentObservation(fighter("jez", {
    x: 600,
    attacking: attack({ level: "throw", kind: "throw", activeStartFrame: 5, activeEndFrame: 8 }),
    attackFrame: 2,
  }), 0);
  assert.equal(whiffedThrowPunish(liveGrab, 0), false, "a grab still in startup is a threat, not a punish");
  assert.equal(whiffedThrowPunish(liveGrab, 12), true, "the stale observation ages into the recovery");
  const landedGrab = visibleOpponentObservation(fighter("jez", {
    x: 600, grabbing: true,
    attacking: attack({ level: "throw", kind: "throw", activeStartFrame: 5, activeEndFrame: 8 }),
    attackFrame: 12,
  }), 0);
  assert.equal(whiffedThrowPunish(landedGrab, 0), false, "a grab that CONNECTED is not a punish, it is a clinch");
  const punishRoll = findRoll((roll) => {
    const fresh = createAiBrain("final");
    return decideAiIntent(fresh, { frame: 0, self, observation: whiffedGrab, roll }).reason === "throw-whiff-punish";
  });
  const punish = decideAiIntent(createAiBrain("final"), { frame: 0, self, observation: whiffedGrab, roll: punishRoll });
  assert.ok(["heavy", "super"].includes(punish.action), "the punish is the biggest thing that reaches, not a jab");

  // --- the CPU never mashes grabs into the commit band ---------------------
  // Its own throws stay strictly inside the reach; pressing in the band is a
  // whiffed grab with a 39-52-frame tail and a CPU that fed it would be free.
  for (let distance = THROW_RULES.grabRange - 10; distance <= THROW_RULES.attemptRange + 20; distance += 2) {
    const far = visibleOpponentObservation(fighter("jez", { x: 500 + distance }), 0);
    for (let step = 1; step < 120; step += 1) {
      const intent = decideAiIntent(createAiBrain("final"), { frame: 0, self, observation: far, roll: step / 120 });
      if (intent.reason === "throw" || intent.reason === "back-throw") {
        assert.ok(distance < THROW_RULES.grabRange,
          `the CPU grabbed at ${distance}, outside its ${THROW_RULES.grabRange} reach`);
      }
    }
  }
  assert.ok(settings.meatyChance > 0);
}

testDifficultyFairness();
testPassiveIsInert();
testDelayedVisibleObservations();
testDefenseAntiAirWakeupAndCombos();
testArchetypesAndDeterminism();
testDepthDefensiveOptions();
testCloseRangeReads();

console.log("Final Blow fair AI tests passed");
