import assert from "node:assert/strict";
import { INPUT_BUFFER_RULES, FrameInputBuffer } from "../engine/foundation.mjs";
import { COMMAND_INPUT_RULES, matchCommandSequence, recognizeCombatCommand } from "../engine/combos.mjs";
import { TOURNAMENT_ACTION_PRIORITY, hasFlowSkipInput } from "../engine/controls.mjs";
import { COLLISION_RULES, MOVEMENT_RULES, resolveArenaCollision } from "../engine/defense.mjs";
import {
  TRAINING_COMBO_TRIALS,
  TRAINING_DUMMY_MODES,
  TRAINING_RECORDING_MAX_FRAMES,
  beginTrainingRecording,
  comboTrialsForFighter,
  createTrainingState,
  finishTrainingRecording,
  recordTrainingFrame,
  recordTrainingTrialHit,
  selectTrainingTrial,
  trainingDummyInput,
  trainingSnapshot,
} from "../engine/training.mjs";
import {
  auditTournamentBalance,
  enumerateTournamentMatchups,
} from "../engine/polish.mjs";
import { AI_DIFFICULTIES } from "../engine/ai.mjs";
import { FIGHTER_THROWABLES } from "../engine/throwables.mjs";

const fighterIds = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali"];

function testTournamentInputRules() {
  assert.deepEqual({ ...INPUT_BUFFER_RULES }, { minimumFrames: 4, defaultFrames: 6, maximumFrames: 6 });
  const fourFrameBuffer = new FrameInputBuffer(INPUT_BUFFER_RULES.minimumFrames);
  fourFrameBuffer.push("special", 10);
  assert.equal(fourFrameBuffer.has("special", 14), true);
  assert.equal(fourFrameBuffer.has("special", 15), false);

  assert.deepEqual(TOURNAMENT_ACTION_PRIORITY.slice(0, 5), [
    "super", "enhancedLauncher", "enhancedBackSpecial", "enhancedCommandSpecial", "enhanced",
  ]);
  assert.ok(TOURNAMENT_ACTION_PRIORITY.indexOf("special") < TOURNAMENT_ACTION_PRIORITY.indexOf("throw"));
  assert.ok(TOURNAMENT_ACTION_PRIORITY.indexOf("throw") < TOURNAMENT_ACTION_PRIORITY.indexOf("heavy"));
  assert.ok(TOURNAMENT_ACTION_PRIORITY.indexOf("heavy") < TOURNAMENT_ACTION_PRIORITY.indexOf("light"));
  assert.equal(hasFlowSkipInput({ fourButton: true, lp: true }), true);
  assert.equal(hasFlowSkipInput({ up: true }), true);
  assert.equal(hasFlowSkipInput({ left: true }), false);
}

function testForgivingButBoundedMotions() {
  assert.ok(COMMAND_INPUT_RULES.maxWindowFrames >= 36);
  const noisyQuarterCircle = [
    { token: "down", frame: 10 },
    { token: "back", frame: 13 },
    { token: "forward", frame: 17 },
    { token: "punch", frame: 18 },
  ];
  assert.equal(recognizeCombatCommand(noisyQuarterCircle, 18)?.action, "commandSpecial");
  const tooNoisy = [
    { token: "down", frame: 10 },
    { token: "back", frame: 11 },
    { token: "kick", frame: 12 },
    { token: "back", frame: 13 },
    { token: "kick", frame: 14 },
    { token: "forward", frame: 17 },
    { token: "punch", frame: 18 },
  ];
  assert.equal(matchCommandSequence(tooNoisy, ["down", "forward", "punch"], 18), null);
}

function testArenaCollisionRules() {
  const base = { y: 600, grounded: true, halfWidth: 44 };
  const corner = resolveArenaCollision(
    { ...base, x: MOVEMENT_RULES.stageMinX, side: 0 },
    { ...base, x: MOVEMENT_RULES.stageMinX + 20, side: 1 },
  );
  assert.equal(corner.legalCrossup, false);
  assert.equal(corner.aX, MOVEMENT_RULES.stageMinX);
  assert.ok(corner.bX - corner.aX >= 88 - 0.001, "corner pushboxes may not tunnel or overlap");

  const lowAir = resolveArenaCollision(
    { ...base, x: 500, y: 600 - COLLISION_RULES.crossupClearance + 1, grounded: false, side: 0 },
    { ...base, x: 520, side: 1 },
  );
  assert.equal(lowAir.legalCrossup, false);
  assert.ok(Math.abs(lowAir.bX - lowAir.aX) >= 88 - 0.001);

  const highAir = resolveArenaCollision(
    { ...base, x: 500, y: 600 - COLLISION_RULES.crossupClearance, grounded: false, side: 0 },
    { ...base, x: 520, side: 1 },
  );
  assert.equal(highAir.legalCrossup, true);
  assert.deepEqual([highAir.aX, highAir.bX], [500, 520]);
}

function testTrainingLab() {
  assert.ok(["guard-after-first", "reversal", "wakeup", "record", "playback"].every((mode) => TRAINING_DUMMY_MODES.includes(mode)));
  // 5.1 (sweep #33): the ladder now covers every kit — the Pinelands Devil
  // and the Commissioner joined the eight this pin was written for.
  assert.equal(Object.keys(TRAINING_COMBO_TRIALS).length, 10);
  // R1.9 SCHOOL & POCKET: trials grew into tiered ladders (6-8 per fighter);
  // the two shipped hand-authored trials stay first with their ids intact.
  assert.ok(fighterIds.every((id) => {
    const trials = comboTrialsForFighter(id);
    return trials.length >= 6 && trials.length <= 8;
  }));
  assert.equal(comboTrialsForFighter("deathblow")[0].id, "faultline-confirm");
  assert.equal(comboTrialsForFighter("deathblow")[1].id, "quarry-cashout");

  const training = createTrainingState();
  beginTrainingRecording(training);
  recordTrainingFrame(training, { left: true, hp: true, secret: true });
  recordTrainingFrame(training, { right: true });
  finishTrainingRecording(training);
  assert.equal(training.recording.length, 2);
  assert.deepEqual(trainingDummyInput(training, 1), { left: true, hp: true });
  assert.deepEqual(trainingDummyInput(training, 2), { right: true });
  assert.deepEqual(trainingDummyInput(training, 3), { left: true, hp: true });
  assert.equal(trainingSnapshot(training).playbackLoops, 1);

  const capped = createTrainingState();
  beginTrainingRecording(capped);
  for (let frame = 0; frame <= TRAINING_RECORDING_MAX_FRAMES; frame += 1) recordTrainingFrame(capped, { light: true });
  assert.equal(capped.recording.length, TRAINING_RECORDING_MAX_FRAMES);
  assert.equal(capped.recordingActive, false);

  const reversal = createTrainingState({ dummyMode: "reversal" });
  assert.equal(Boolean(trainingDummyInput(reversal, 1, { hitstunFrames: 2 }).enhancedLauncher), false);
  assert.equal(trainingDummyInput(reversal, 2, { hitstunFrames: 0 }).enhancedLauncher, true);
  const wakeup = createTrainingState({ dummyMode: "wakeup" });
  trainingDummyInput(wakeup, 1, { down: true });
  assert.equal(trainingDummyInput(wakeup, 2, { justWoke: true }).enhancedLauncher, true);

  selectTrainingTrial(training, "deathblow", 0);
  const steps = comboTrialsForFighter("deathblow")[0].steps;
  let snapshot;
  steps.forEach((step, index) => {
    snapshot = recordTrainingTrialHit(training, {
      fighterId: "deathblow", action: step.action, attackSerial: index + 1, frame: 10 + index * 12,
    });
  });
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.completions, 1);
}

function testFullTournamentAudit() {
  const matchups = enumerateTournamentMatchups(fighterIds);
  assert.equal(matchups.length, 28);
  assert.equal(new Set(matchups.map((pair) => [...pair].sort().join(":"))).size, 28);
  const audit = auditTournamentBalance(fighterIds);
  assert.equal(audit.version, "1.3");
  assert.equal(audit.matchupCount, 28);
  assert.equal(audit.normals.fighters.reduce((total, fighter) => total + Object.keys(fighter.roles).length, 0), 120);
  // Wave 16: the Commissioner's steel cane joins the audited object set.
  // Wave 17: the Devil's hex charm makes ten.
  assert.equal(audit.items.personalObjects, 10);
  assert.equal(audit.items.stageWeapons, 5);
  assert.equal(audit.identities.fighters.length, 8);
  assert.deepEqual(audit.violations, []);
  assert.ok(Object.values(AI_DIFFICULTIES).filter(({ inert }) => !inert).every(({ repeatLimit }) => repeatLimit >= 2));
  assert.equal(FIGHTER_THROWABLES.post.maxActive, 1);
  assert.equal(FIGHTER_THROWABLES.cyraxx.maxActive, 1);
  assert.ok(FIGHTER_THROWABLES.post.hazardArmFrames > 0);
  assert.ok(FIGHTER_THROWABLES.cyraxx.hazardArmFrames > 0);
}

testTournamentInputRules();
testForgivingButBoundedMotions();
testArenaCollisionRules();
testTrainingLab();
testFullTournamentAudit();

console.log("Final Blow 1.3 tournament tests passed");
