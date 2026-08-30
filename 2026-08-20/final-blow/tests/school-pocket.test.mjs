import assert from "node:assert/strict";
import {
  CONTROL_STYLES,
  LEGEND_DAMAGE_SCALE,
  SUPER_GRIT_COST,
  applyControlStyle,
  legendScaledAction,
  normalizeControlStyle,
  resolveFourButtonInput,
} from "../engine/controls.mjs";
import {
  NET_INPUT,
  bitsToInput,
  inputToBits,
  parseRollbackState,
  serializeRollbackState,
} from "../engine/rollback.mjs";
import {
  FIGHT_SCHOOL_LESSONS,
  FIGHT_SCHOOL_COACH_LINES,
  TRAINING_COMBO_TRIALS,
  TRAINING_SLOT_COUNT,
  TRIAL_MEDAL_TIERS,
  awardTrialMedal,
  comboTrialsForFighter,
  createFightSchoolState,
  createTrainingState,
  decodeTrainingSlot,
  encodeTrainingSlot,
  fighterMedalCounts,
  fightSchoolObserve,
  fightSchoolSnapshot,
  medalForTrial,
  normalizeTrialMedals,
  recordTrainingTrialHit,
  sanitizeTrainingInput,
  selectTrainingTrial,
  trialDemoScript,
} from "../engine/training.mjs";
import { createFighterMove, listFighterFrameData } from "../engine/fighter-kits.mjs";
import { ATTACK_LEVELS, attackFrameData } from "../engine/defense.mjs";

// ---------------------------------------------------------------------------
// LEGEND one-button style: resolves to the STANDARD action vocabulary and
// round-trips the existing 16-bit net input with no new bits.
// ---------------------------------------------------------------------------
function testLegendResolution() {
  assert.deepEqual([...CONTROL_STYLES], ["classic", "modern", "legend"]);
  assert.equal(normalizeControlStyle("legend"), "legend");

  // HP below full Grit = the special button (punch limb).
  const hp = resolveFourButtonInput(
    { fourButton: true, hp: true, hpHeld: true },
    { style: "legend", facing: 1, meter: 0 },
  );
  assert.equal(hp.special, true);
  assert.equal(hp.heavy, false, "legend HP must not read as a heavy normal");
  assert.equal(hp.limb, "punch");
  const hpBits = inputToBits(hp);
  assert.equal(hpBits & NET_INPUT.SPECIAL, NET_INPUT.SPECIAL);
  assert.equal(hpBits & NET_INPUT.KICK, 0);
  assert.equal(hpBits & ~0xffff, 0, "no bits outside the shipped 16-bit input");
  assert.equal(bitsToInput(hpBits).special, true, "encodes and decodes through the wire unchanged");

  // HP at full Grit = the super (already a wire bit).
  const superOut = resolveFourButtonInput(
    { fourButton: true, hp: true, hpHeld: true },
    { style: "legend", facing: 1, meter: SUPER_GRIT_COST },
  );
  assert.equal(superOut.super, true);
  assert.equal(inputToBits(superOut) & NET_INPUT.SUPER, NET_INPUT.SUPER);

  // HK = the kit's base special: special + the KICK limb bit.
  const hk = resolveFourButtonInput(
    { fourButton: true, hk: true, hkHeld: true },
    { style: "legend", facing: 1, meter: 0 },
  );
  assert.equal(hk.special, true);
  assert.equal(hk.limb, "kick");
  assert.equal(inputToBits(hk) & NET_INPUT.KICK, NET_INPUT.KICK);
  assert.equal(bitsToInput(inputToBits(hk)).limb, "kick");

  // LP/LK stay honest normals.
  const lp = resolveFourButtonInput(
    { fourButton: true, lp: true, lpHeld: true },
    { style: "legend", facing: 1, meter: 0 },
  );
  assert.equal(lp.light, true);
  assert.equal(lp.special, false);

  // The sim-side expansion (applyControlStyle) maps direction deterministically:
  // neutral/forward = command special, back = back special, down = launcher.
  const base = { special: true, limb: "punch", left: false, right: false, down: false };
  const neutral = applyControlStyle({ ...base }, "legend", 1);
  assert.equal(neutral.commandSpecial, true);
  assert.equal(neutral.special, false);
  const back = applyControlStyle({ ...base, left: true }, "legend", 1);
  assert.equal(back.backSpecial, true);
  const down = applyControlStyle({ ...base, down: true }, "legend", 1);
  assert.equal(down.launcher, true);
  // Kick limb keeps the base special; airborne keeps the air special.
  const kick = applyControlStyle({ ...base, limb: "kick" }, "legend", 1);
  assert.equal(kick.special, true);
  const air = applyControlStyle({ ...base }, "legend", 1, { airborne: true });
  assert.equal(air.special, true);
  assert.equal(air.commandSpecial, undefined);

  // The one-button tax covers exactly the five single-button specials.
  assert.equal(LEGEND_DAMAGE_SCALE, 0.9);
  for (const action of ["special", "commandSpecial", "backSpecial", "launcher", "super"]) {
    assert.ok(legendScaledAction(action), `${action} carries the legend scale`);
  }
  for (const action of ["light", "heavy", "enhanced", "enhancedLauncher", "throw", "driveHeavy"]) {
    assert.ok(!legendScaledAction(action), `${action} stays full price`);
  }

  // Modern and classic are untouched by the new branch.
  const classicHp = resolveFourButtonInput(
    { fourButton: true, hp: true, hpHeld: true },
    { style: "classic", facing: 1, meter: 0 },
  );
  assert.equal(classicHp.heavy, true);
  assert.equal(classicHp.special, false);
}

// ---------------------------------------------------------------------------
// Trial ladders: every step of every trial names a move the fighter's kit can
// actually produce, tiers are valid, ids unique, and demo scripts perform the
// steps in order through sanitized input fields.
// ---------------------------------------------------------------------------
function testTrialLadders() {
  const fighters = Object.keys(TRAINING_COMBO_TRIALS);
  assert.equal(fighters.length, 8);
  for (const fighterId of fighters) {
    const trials = comboTrialsForFighter(fighterId);
    assert.ok(trials.length >= 6 && trials.length <= 8, `${fighterId} has a 6-8 trial ladder`);
    const ids = new Set(trials.map((trial) => trial.id));
    assert.equal(ids.size, trials.length, `${fighterId} trial ids unique`);
    const tiers = new Set(trials.map((trial) => trial.tier));
    for (const tier of TRIAL_MEDAL_TIERS) assert.ok(tiers.has(tier), `${fighterId} ladder includes ${tier}`);
    for (const trial of trials) {
      assert.ok(TRIAL_MEDAL_TIERS.includes(trial.tier), `${trial.id} has a valid tier`);
      assert.ok(trial.steps.length >= 2, `${trial.id} has at least two steps`);
      for (const step of trial.steps) {
        const move = createFighterMove(fighterId, step.action, step.limb ? { limb: step.limb } : {});
        assert.ok(move, `${fighterId}/${trial.id}: ${step.action} exists in the kit`);
        assert.ok(step.label && typeof step.label === "string", `${trial.id} step labelled`);
      }
      // Demo script covers each step action in order through sanitized fields.
      const script = trialDemoScript(trial);
      assert.ok(script.length > trial.steps.length * 100, `${trial.id} demo has settle room`);
      let cursor = 0;
      for (const step of trial.steps) {
        const index = script.findIndex((frame, at) => at >= cursor && sanitizeTrainingInput(frame)[step.action]);
        assert.ok(index >= 0, `${trial.id} demo performs ${step.action}`);
        cursor = index + 1;
      }
    }
  }

  // Step machine: run a generated silver trial to completion, with the limb
  // field flowing through (kick-derived normals carry limb "kick").
  const training = createTrainingState();
  const trial = comboTrialsForFighter("deathblow").find(({ id }) => id === "deathblow-grab-and-go");
  selectTrainingTrial(training, "deathblow", comboTrialsForFighter("deathblow").indexOf(trial));
  let serial = 100;
  let frame = 1000;
  let snapshot = null;
  for (const step of trial.steps) {
    snapshot = recordTrainingTrialHit(training, {
      fighterId: "deathblow",
      action: step.action,
      limb: step.limb || "punch",
      attackSerial: serial += 1,
      frame: frame += 60,
    });
  }
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.status, "COMPLETE");
  assert.equal(snapshot.tier, "silver");

  // Medals: award + persistence round-trip through JSON.
  let medals = normalizeTrialMedals(null);
  awardTrialMedal(medals, "deathblow", trial);
  medals = normalizeTrialMedals(JSON.parse(JSON.stringify(medals)));
  assert.equal(medalForTrial(medals, "deathblow", trial.id), "silver");
  const counts = fighterMedalCounts(medals, "deathblow");
  assert.deepEqual(counts, { bronze: 0, silver: 1, gold: 0, total: 1 });
  assert.equal(medalForTrial(medals, "jez", trial.id), "");
  // Garbage tiers are dropped on normalize.
  const dirty = normalizeTrialMedals({ deathblow: { fake: "platinum", real: "gold" } });
  assert.equal(medalForTrial(dirty, "deathblow", "fake"), "");
  assert.equal(medalForTrial(dirty, "deathblow", "real"), "gold");
}

// ---------------------------------------------------------------------------
// Situation slots: encode/decode round-trip over the serialized rollback
// contract, including NaN/Infinity-safe serialization and input sanitizing.
// ---------------------------------------------------------------------------
function testSituationSlots() {
  assert.equal(TRAINING_SLOT_COUNT, 3);
  const snapshot = {
    version: 1,
    simulationTick: 4321,
    timer: Infinity,
    carry: Number.NaN,
    fighters: [{ id: "deathblow", values: { x: 500.25, meter: 62 } }],
  };
  const serialized = serializeRollbackState(snapshot);
  const encoded = encodeTrainingSlot({
    state: serialized,
    stage: "vet",
    dummyMode: "guard-after-first",
    recording: [{ down: true, heavy: true, junk: true }, { left: true }],
    savedAt: 1234567,
  });
  assert.ok(encoded, "encode accepts a serialized snapshot");
  const decoded = decodeTrainingSlot(encoded);
  assert.equal(decoded.stage, "vet");
  assert.equal(decoded.dummyMode, "guard-after-first");
  assert.equal(decoded.savedAt, 1234567);
  assert.deepEqual(decoded.recording, [{ down: true, heavy: true }, { left: true }]);
  const restored = parseRollbackState(decoded.state);
  assert.equal(restored.simulationTick, 4321);
  assert.equal(restored.timer, Infinity, "Infinity survives the round-trip");
  assert.ok(Number.isNaN(restored.carry), "NaN survives the round-trip");
  assert.equal(restored.fighters[0].values.x, 500.25);

  // Invalid payloads are rejected, never half-decoded.
  assert.equal(decodeTrainingSlot("not json"), null);
  assert.equal(decodeTrainingSlot(JSON.stringify({ version: 99, state: "x" })), null);
  assert.equal(decodeTrainingSlot(JSON.stringify({ version: 1, state: "" })), null);
  assert.equal(encodeTrainingSlot({ state: "" }), null);
  // Unknown dummy modes fall back to stand.
  const odd = decodeTrainingSlot(JSON.stringify({ version: 1, state: "x", dummyMode: "chaos" }));
  assert.equal(odd.dummyMode, "stand");
}

// ---------------------------------------------------------------------------
// Frame data extraction: assert the rule, not the number, for three sample
// moves built through the real instance pipeline (post-ARCADE_TUNING).
// ---------------------------------------------------------------------------
function testFrameDataExtraction() {
  const samples = [
    ["jez", "light", {}],
    ["deathblow", "commandSpecial", {}],
    ["alan", "super", {}],
  ];
  for (const [fighterId, action, context] of samples) {
    const move = createFighterMove(fighterId, action, context);
    const data = attackFrameData(move);
    assert.equal(data.startup, move.startupFrames, `${fighterId} ${action} startup mirrors the instance`);
    assert.equal(data.startup, move.activeStartFrame, "startup is the tick the active window opens");
    assert.equal(data.active, move.activeFrames);
    assert.equal(data.recovery, move.recoveryFrames, "recovery is the tuned instance value");
    assert.equal(data.onHit, move.hitstunFrames - data.recovery, "advantage = stun minus recovery");
    assert.equal(data.onBlock, move.blockstunFrames - data.recovery);
    assert.equal(data.level, move.level);
  }
  assert.equal(attackFrameData(null), null);

  // The move-list table exposes the level chips the dialog renders.
  const rows = listFighterFrameData("deathblow");
  assert.ok(rows.length >= 16, "a full frame-data table");
  assert.ok(rows.some((row) => row.level === ATTACK_LEVELS.LOW), "low rows tagged");
  assert.ok(rows.some((row) => row.level === ATTACK_LEVELS.OVERHEAD), "overhead rows tagged");
  assert.ok(rows.some((row) => row.level === ATTACK_LEVELS.THROW), "throw rows tagged");
  for (const row of rows) {
    assert.ok(row.name && row.command !== undefined, "every row named with a command");
    assert.ok(Number.isFinite(row.startup) && row.startup >= 0);
  }
}

// ---------------------------------------------------------------------------
// FIGHT SCHOOL: curriculum shape + the lesson step machine.
// ---------------------------------------------------------------------------
function testFightSchool() {
  assert.equal(FIGHT_SCHOOL_LESSONS.length, 7);
  const ids = new Set(FIGHT_SCHOOL_LESSONS.map((lesson) => lesson.id));
  assert.equal(ids.size, FIGHT_SCHOOL_LESSONS.length, "lesson ids unique");
  for (const lesson of FIGHT_SCHOOL_LESSONS) {
    assert.ok(lesson.steps.length >= 1);
    for (const step of lesson.steps) assert.ok(step.label && step.kind);
  }
  // Coach pools all have enough lines for the no-back-to-back-repeat draw.
  for (const pool of Object.values(FIGHT_SCHOOL_COACH_LINES)) {
    assert.ok(pool.length >= 2);
  }

  const school = createFightSchoolState();
  // Walk lesson: forward then back, each held for the step's frame quota.
  for (let index = 0; index < 40; index += 1) fightSchoolObserve(school, { type: "walk", direction: "forward" });
  assert.equal(school.step, 1, "forward walk step banked");
  // Wrong direction never advances.
  for (let index = 0; index < 60; index += 1) fightSchoolObserve(school, { type: "walk", direction: "forward" });
  assert.equal(school.step, 1);
  let progress = null;
  for (let index = 0; index < 40; index += 1) progress = fightSchoolObserve(school, { type: "walk", direction: "back" }) || progress;
  assert.equal(progress.lessonComplete, true);
  assert.equal(school.lesson, 1, "footwork complete, guard lesson armed");

  // Guard lesson: only the matching level advances each step.
  assert.equal(fightSchoolObserve(school, { type: "block", level: "low" }), null);
  assert.ok(fightSchoolObserve(school, { type: "block", level: "overhead" }));
  assert.ok(fightSchoolObserve(school, { type: "block", level: "low" }).lessonComplete);

  // Normals lesson: attackSerial dedupe + limb matching.
  const hit = (action, limb, attackSerial, extra = {}) => fightSchoolObserve(school, {
    type: "hit", action, limb, attackSerial, ...extra,
  });
  assert.ok(hit("light", "punch", 1));
  assert.equal(hit("heavy", "punch", 1), null, "same attackSerial cannot double-advance");
  assert.equal(hit("heavy", "kick", 2), null, "wrong limb rejected");
  assert.ok(hit("heavy", "punch", 3));
  assert.ok(hit("light", "kick", 4));
  assert.ok(hit("heavy", "kick", 5).lessonComplete);

  // QCF, throws (forward then back), dizzy punish, finisher = graduation.
  assert.ok(hit("commandSpecial", "punch", 6).lessonComplete);
  assert.equal(hit("throw", "punch", 7, { back: true }), null, "forward throw required first");
  assert.ok(hit("throw", "punch", 8, { back: false }));
  assert.ok(hit("throw", "punch", 9, { back: true }).lessonComplete);
  assert.equal(hit("heavy", "punch", 10, { dizzy: false }), null, "dizzy punish needs the dizzy");
  assert.ok(hit("heavy", "punch", 11, { dizzy: true }).lessonComplete);
  const graduation = fightSchoolObserve(school, { type: "finisher" });
  assert.equal(graduation.graduated, true);
  const snapshot = fightSchoolSnapshot(school);
  assert.equal(snapshot.graduated, true);
  assert.equal(Object.keys(snapshot.completed).length, FIGHT_SCHOOL_LESSONS.length);

  // Resume: completed lessons re-seed the machine past themselves.
  const resumed = createFightSchoolState({ lesson: 2, completed: { footwork: true, "guard-heights": true } });
  assert.equal(resumed.lesson, 2);
  assert.equal(resumed.graduated, false);
}

testLegendResolution();
testTrialLadders();
testSituationSlots();
testFrameDataExtraction();
testFightSchool();

console.log("Final Blow R1.9 SCHOOL & POCKET tests passed");
