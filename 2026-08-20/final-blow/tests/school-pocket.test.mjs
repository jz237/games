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
  fightSchoolStepLabel,
  medalForTrial,
  normalizeTrialMedals,
  recordTrainingTrialHit,
  sanitizeTrainingInput,
  selectTrainingTrial,
  trialDemoScript,
} from "../engine/training.mjs";
import { createFighterMove, listFighterFrameData, prettyProfileName } from "../engine/fighter-kits.mjs";
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
  // 5.1 (sweep #33): was 8 — the Pinelands Devil and the Commissioner had no
  // ladder at all; every kit now carries one.
  assert.equal(fighters.length, 10);
  assert.ok(fighters.includes("devil") && fighters.includes("commissioner"));
  assert.equal(comboTrialsForFighter("devil").length, 8, "devil: bronze pair + six generated (Wing Flit lands, so the signature route exists)");
  assert.equal(comboTrialsForFighter("commissioner").length, 8);
  assert.deepEqual(comboTrialsForFighter("devil").slice(0, 2).map(({ id }) => id), ["howl-confirm", "barrens-cashout"]);
  assert.deepEqual(comboTrialsForFighter("commissioner").slice(0, 2).map(({ id }) => id), ["gavel-confirm", "authority-cashout"]);
  // EX SPENDER opens with an EX that leaves the dummy standing when the base
  // EX is a launch: the devil swaps to Wing Flit EX (measured in the browser —
  // the scripted Pine Howl whiffed over the screech knockdown every run);
  // DeathBlow and the Commissioner keep their base EX, which lands on time.
  const exOpener = (id) => comboTrialsForFighter(id).find((trial) => trial.id === `${id}-ex-spender`).steps[0];
  assert.equal(exOpener("devil").action, "enhancedBackSpecial");
  assert.equal(exOpener("devil").label, "WING FLIT EX");
  assert.equal(exOpener("commissioner").action, "enhanced");
  assert.equal(exOpener("deathblow").action, "enhanced");
  for (const id of ["jez", "alan", "post", "benny", "donald", "cyraxx", "ali"]) assert.equal(exOpener(id).action, "enhanced", `${id} ladder unchanged`);
  // The hand-authored labels name the kit's real move names, not paraphrases.
  for (const fighterId of ["devil", "commissioner"]) {
    for (const trial of comboTrialsForFighter(fighterId).slice(0, 2)) {
      for (const step of trial.steps) {
        const move = createFighterMove(fighterId, step.action, {});
        const name = move.moveName || prettyProfileName(move.profileId, fighterId);
        assert.equal(step.label, name, `${fighterId}/${trial.id}: ${step.action} label is the kit's move name`);
      }
    }
  }
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
  // 5.1 (sweep #31): was 7 — lessons 8-12 add the throwable, the Grit
  // economy, Perfect Guard + guard reversal, air tech + wake-up options and
  // the stage weapon. The first seven keep their ids so saved progress holds.
  assert.equal(FIGHT_SCHOOL_LESSONS.length, 12);
  assert.deepEqual(FIGHT_SCHOOL_LESSONS.slice(0, 7).map(({ id }) => id),
    ["footwork", "guard-heights", "four-normals", "qcf-special", "throw-tech", "dizzy-punish", "final-blow"]);
  assert.deepEqual(FIGHT_SCHOOL_LESSONS.slice(7).map(({ id }) => id),
    ["throwable", "grit-economy", "split-second", "off-the-floor", "street-furniture"]);
  // Every hit step names an action the sim can actually report: kit actions,
  // the guard reversal, or the two projectile classes the school observes.
  const reportable = new Set(["light", "heavy", "throw", "special", "commandSpecial", "backSpecial", "launcher", "driveHeavy",
    "enhanced", "enhancedCommandSpecial", "enhancedBackSpecial", "enhancedLauncher", "super", "throwObject", "guardReversal", "stageWeapon"]);
  for (const lesson of FIGHT_SCHOOL_LESSONS) {
    for (const step of lesson.steps) {
      if (step.kind !== "hit") continue;
      for (const action of step.actions || (step.action ? [step.action] : [])) assert.ok(reportable.has(action), `${lesson.id}/${step.id}: ${action}`);
    }
  }
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
  // 5.1: lesson 7 no longer graduates — five more pages follow.
  const finisher = fightSchoolObserve(school, { type: "finisher" });
  assert.equal(finisher.lessonComplete, true);
  assert.equal(finisher.graduated, false);
  assert.equal(school.lesson, 7, "THE JAWN is armed after the Final Blow");

  // THE JAWN: only the projectile class advances, then a heavy punch.
  assert.equal(hit("special", "punch", 12), null, "a kick special is not the jawn");
  assert.ok(hit("throwObject", "punch", 13));
  assert.ok(hit("heavy", "punch", 14).lessonComplete);

  // GRIT ECONOMY: any EX flavour counts for the first step, then the super.
  assert.equal(hit("commandSpecial", "punch", 15), null);
  assert.ok(hit("enhancedLauncher", "punch", 16), "an EX launcher is an EX");
  assert.ok(hit("super", "punch", 17).lessonComplete);

  // SPLIT SECOND: a plain block never satisfies a perfect step; two perfects,
  // then the guard reversal must land as its own action.
  assert.equal(fightSchoolObserve(school, { type: "block", level: "overhead", perfect: false }), null);
  assert.ok(fightSchoolObserve(school, { type: "block", level: "overhead", perfect: true }));
  assert.ok(fightSchoolObserve(school, { type: "block", level: "low", perfect: true }), "any level once perfect");
  assert.equal(hit("special", "punch", 18), null, "a special is not the guard reversal");
  assert.ok(hit("guardReversal", "punch", 19).lessonComplete);

  // OFF THE FLOOR: air tech, quick rise, delayed wake — in that order.
  assert.equal(fightSchoolObserve(school, { type: "wake", option: "quick" }), null, "tech first");
  assert.ok(fightSchoolObserve(school, { type: "airTech" }));
  assert.equal(fightSchoolObserve(school, { type: "wake", option: "delay" }), null, "quick rise before the delay");
  assert.ok(fightSchoolObserve(school, { type: "wake", option: "quick" }));
  assert.ok(fightSchoolObserve(school, { type: "wake", option: "delay" }).lessonComplete);

  // STREET FURNITURE: pick-up, then the thrown weapon's own impact = graduation.
  assert.equal(hit("stageWeapon", "punch", 20), null, "must pick it up first");
  assert.ok(fightSchoolObserve(school, { type: "pickup" }));
  const graduation = hit("stageWeapon", "punch", 21);
  assert.equal(graduation.graduated, true);
  const snapshot = fightSchoolSnapshot(school);
  assert.equal(snapshot.graduated, true);
  assert.equal(Object.keys(snapshot.completed).length, FIGHT_SCHOOL_LESSONS.length);

  // Style-aware labels: the same step reads differently per control style,
  // and the snapshot renders through the same helper.
  const qcf = FIGHT_SCHOOL_LESSONS[3].steps[0];
  assert.equal(fightSchoolStepLabel(qcf, "classic"), "LAND ↓ → + PUNCH");
  assert.equal(fightSchoolStepLabel(qcf, "modern"), "LAND LP&LK");
  assert.equal(fightSchoolStepLabel(qcf, "legend"), "LAND HP");
  const fresh = createFightSchoolState({ lesson: 3 });
  assert.equal(fightSchoolSnapshot(fresh, { style: "legend" }).steps[0].label, "LAND HP");
  assert.equal(fightSchoolSnapshot(fresh).steps[0].label, "LAND ↓ → + PUNCH", "classic by default");
  for (const lesson of FIGHT_SCHOOL_LESSONS) {
    for (const step of lesson.steps) {
      assert.ok(!/\{/.test(fightSchoolStepLabel(step, "modern")), `${step.id}: every template token resolves`);
    }
  }

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
