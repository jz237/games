export const TRAINING_DUMMY_MODES = Object.freeze([
  "stand", "guard", "guard-after-first", "crouch", "jump",
  "reversal", "wakeup", "record", "playback", "cpu",
]);

export const TRAINING_RECORDING_MAX_FRAMES = 600;
export const TRAINING_TRIAL_GAP_FRAMES = 180;

const trial = (id, name, steps) => Object.freeze({
  id,
  name,
  steps: Object.freeze(steps.map(([action, label]) => Object.freeze({ action, label }))),
});

export const TRAINING_COMBO_TRIALS = Object.freeze({
  deathblow: Object.freeze([
    trial("faultline-confirm", "FAULTLINE CONFIRM", [["light", "HAMMER JAB"], ["heavy", "WRECKING HOOK"], ["commandSpecial", "FAULTLINE FIST"]]),
    trial("quarry-cashout", "QUARRY CASHOUT", [["launcher", "QUARRY BREAKER"], ["super", "EPICENTER EXECUTION"]]),
  ]),
  jez: Object.freeze([
    trial("neon-confirm", "NEON CONFIRM", [["light", "NEON JAB"], ["heavy", "CHANNEL LETTER CHOP"], ["commandSpecial", "SIGNLINE LANCE"]]),
    trial("marquee-cashout", "MARQUEE CASHOUT", [["launcher", "SIGNPOST RISING"], ["super", "SEVEN-PALM NEON GUILLOTINE"]]),
  ]),
  alan: Object.freeze([
    trial("south-street-confirm", "SOUTH STREET CONFIRM", [["light", "UNION JAB"], ["heavy", "HEAVY HAND"], ["commandSpecial", "SOUTH STREET SLAM"]]),
    trial("foreman-cashout", "FOREMAN CASHOUT", [["launcher", "BROAD STREET UPPERCUT"], ["super", "SOUTH STREET SIX"]]),
  ]),
  post: Object.freeze([
    trial("full-coverage-confirm", "FULL COVERAGE CONFIRM", [["light", "CAN TAP"], ["heavy", "ROLLER SWING"], ["commandSpecial", "PAINT THE TOWN"]]),
    trial("tag-cashout", "TAG CASHOUT", [["launcher", "TAG UPDRAFT"], ["super", "FULL COVERAGE"]]),
  ]),
  benny: Object.freeze([
    trial("live-wire-confirm", "LIVE WIRE CONFIRM", [["light", "STATIC JAB"], ["heavy", "BREAKER CROSS"], ["commandSpecial", "BENNY BLITZ"]]),
    trial("circuit-cashout", "CIRCUIT CASHOUT", [["launcher", "CIRCUIT RISER"], ["super", "CIRCUIT BREAKER"]]),
  ]),
  donald: Object.freeze([
    trial("clubhouse-confirm", "CLUBHOUSE CONFIRM", [["light", "CADDY TAP"], ["heavy", "DRIVER SWING"], ["commandSpecial", "GOLDEN SHOCKWAVE"]]),
    trial("back-nine-cashout", "BACK NINE CASHOUT", [["launcher", "EAGLE UPPERCUT"], ["super", "GOLDEN BACK NINE"]]),
  ]),
  cyraxx: Object.freeze([
    trial("feedback-confirm", "FEEDBACK CONFIRM", [["light", "STATIC CHECK"], ["heavy", "SPEAKER CRASH"], ["commandSpecial", "FEEDBACK LOOP"]]),
    trial("gain-cashout", "GAIN CASHOUT", [["launcher", "GAIN SPIKE"], ["super", "FEEDBACK MELTDOWN"]]),
  ]),
  ali: Object.freeze([
    trial("massive-confirm", "MASSIVE CONFIRM", [["light", "MIC ONE"], ["heavy", "CHAIN WHIP"], ["commandSpecial", "MASSIVE STEP"]]),
    trial("bassline-cashout", "BASSLINE CASHOUT", [["launcher", "BASSLINE RISER"], ["super", "WEST STAINES MASSIVE"]]),
  ]),
});

const INPUT_FIELDS = Object.freeze([
  "fourButton", "left", "right", "down", "up", "jump", "guard",
  "lp", "hp", "lk", "hk", "lpHeld", "hpHeld", "lkHeld", "hkHeld",
  "light", "heavy", "special", "enhanced", "throw", "throwBack", "super", "final",
  "commandSpecial", "backSpecial", "launcher", "driveHeavy",
  "enhancedCommandSpecial", "enhancedBackSpecial", "enhancedLauncher", "throwObject",
]);

function emptyInput() {
  return {
    left: false, right: false, down: false, guard: false, jump: false,
    light: false, heavy: false, special: false, enhanced: false, throw: false,
    super: false, final: false,
  };
}

export function sanitizeTrainingInput(input = {}) {
  const sanitized = {};
  for (const field of INPUT_FIELDS) if (input[field]) sanitized[field] = true;
  if (input.limb === "kick") sanitized.limb = "kick";
  return sanitized;
}

export function comboTrialsForFighter(fighterId) {
  return TRAINING_COMBO_TRIALS[fighterId] || Object.freeze([]);
}

export function createTrainingState(overrides = {}) {
  const recording = Array.isArray(overrides.recording)
    ? overrides.recording.slice(0, TRAINING_RECORDING_MAX_FRAMES).map(sanitizeTrainingInput)
    : [];
  return {
    dummyMode: TRAINING_DUMMY_MODES.includes(overrides.dummyMode) ? overrides.dummyMode : "stand",
    autoRecover: overrides.autoRecover !== false,
    infiniteGrit: overrides.infiniteGrit !== false,
    showHitboxes: Boolean(overrides.showHitboxes),
    resets: Number.isInteger(overrides.resets) ? Math.max(0, overrides.resets) : 0,
    lastDamage: Number.isFinite(overrides.lastDamage) ? Math.max(0, overrides.lastDamage) : 0,
    lastResult: typeof overrides.lastResult === "string" ? overrides.lastResult : "",
    lastMove: overrides.lastMove && typeof overrides.lastMove === "object" ? { ...overrides.lastMove } : null,
    lastAdvantage: Number.isFinite(overrides.lastAdvantage) ? overrides.lastAdvantage : null,
    inputHistory: Array.isArray(overrides.inputHistory) ? overrides.inputHistory.slice(-12) : [],
    lastInputLabel: typeof overrides.lastInputLabel === "string" ? overrides.lastInputLabel : "",
    lastInputFrame: Number.isInteger(overrides.lastInputFrame) ? overrides.lastInputFrame : -Infinity,
    guardAfterTriggered: Boolean(overrides.guardAfterTriggered),
    reversalArmed: Boolean(overrides.reversalArmed),
    wakeupCycleFrame: Number.isInteger(overrides.wakeupCycleFrame) ? overrides.wakeupCycleFrame : -180,
    recording,
    recordingActive: Boolean(overrides.recordingActive),
    playbackFrame: Number.isInteger(overrides.playbackFrame) ? Math.max(0, overrides.playbackFrame) : 0,
    playbackLoops: Number.isInteger(overrides.playbackLoops) ? Math.max(0, overrides.playbackLoops) : 0,
    trialFighterId: typeof overrides.trialFighterId === "string" ? overrides.trialFighterId : "",
    trialIndex: Number.isInteger(overrides.trialIndex) ? Math.max(0, overrides.trialIndex) : 0,
    trialStep: Number.isInteger(overrides.trialStep) ? Math.max(0, overrides.trialStep) : 0,
    trialStatus: typeof overrides.trialStatus === "string" ? overrides.trialStatus : "READY",
    trialLastFrame: Number.isInteger(overrides.trialLastFrame) ? overrides.trialLastFrame : -Infinity,
    trialLastAttackSerial: Number.isInteger(overrides.trialLastAttackSerial) ? overrides.trialLastAttackSerial : -1,
    trialCompletions: Number.isInteger(overrides.trialCompletions) ? Math.max(0, overrides.trialCompletions) : 0,
    // Release 1.7: player Perfect Guards landed this training session.
    perfectGuards: Number.isInteger(overrides.perfectGuards) ? Math.max(0, overrides.perfectGuards) : 0,
  };
}

export function resetTrainingScenario(training) {
  training.guardAfterTriggered = false;
  training.reversalArmed = false;
  training.wakeupCycleFrame = -180;
  training.playbackFrame = 0;
  training.trialStep = 0;
  training.trialStatus = "READY";
  training.trialLastFrame = -Infinity;
  training.trialLastAttackSerial = -1;
  return training;
}

export function beginTrainingRecording(training) {
  training.recording = [];
  training.recordingActive = true;
  training.playbackFrame = 0;
  training.playbackLoops = 0;
  training.dummyMode = "record";
  training.lastResult = "RECORDING P2 · 10 SECOND MAX";
  return training;
}

export function finishTrainingRecording(training, { play = true } = {}) {
  training.recordingActive = false;
  training.playbackFrame = 0;
  training.dummyMode = play && training.recording.length ? "playback" : "stand";
  training.lastResult = training.recording.length
    ? `${training.recording.length}F DUMMY LOOP SAVED`
    : "NO DUMMY INPUT RECORDED";
  return training;
}

export function recordTrainingFrame(training, input = {}) {
  const sanitized = sanitizeTrainingInput(input);
  if (!training.recordingActive) return sanitized;
  if (training.recording.length < TRAINING_RECORDING_MAX_FRAMES) training.recording.push(sanitized);
  if (training.recording.length >= TRAINING_RECORDING_MAX_FRAMES) finishTrainingRecording(training);
  return sanitized;
}

export function selectTrainingTrial(training, fighterId, index = 0) {
  const trials = comboTrialsForFighter(fighterId);
  training.trialFighterId = fighterId;
  training.trialIndex = trials.length ? Math.max(0, Math.min(trials.length - 1, Math.floor(index))) : 0;
  training.trialStep = 0;
  training.trialStatus = trials.length ? "READY" : "NO TRIAL";
  training.trialLastFrame = -Infinity;
  training.trialLastAttackSerial = -1;
  return trials[training.trialIndex] || null;
}

export function trainingTrialSnapshot(training) {
  const trials = comboTrialsForFighter(training.trialFighterId);
  const current = trials[training.trialIndex] || null;
  return {
    fighterId: training.trialFighterId,
    index: training.trialIndex,
    count: trials.length,
    id: current?.id || null,
    name: current?.name || "NO TRIAL",
    steps: current ? current.steps.map((step, index) => ({ ...step, complete: index < training.trialStep })) : [],
    step: training.trialStep,
    status: training.trialStatus,
    complete: Boolean(current && training.trialStep >= current.steps.length),
    completions: training.trialCompletions,
  };
}

export function recordTrainingTrialHit(training, {
  fighterId,
  action,
  attackSerial,
  frame,
} = {}) {
  if (!Number.isInteger(attackSerial) || attackSerial === training.trialLastAttackSerial) return trainingTrialSnapshot(training);
  training.trialLastAttackSerial = attackSerial;
  if (training.trialFighterId !== fighterId) selectTrainingTrial(training, fighterId, 0);
  const trials = comboTrialsForFighter(fighterId);
  const current = trials[training.trialIndex];
  if (!current) return trainingTrialSnapshot(training);
  if (frame - training.trialLastFrame > TRAINING_TRIAL_GAP_FRAMES) training.trialStep = 0;
  if (training.trialStep >= current.steps.length) training.trialStep = 0;
  const expected = current.steps[training.trialStep];
  if (action === expected.action) {
    training.trialStep += 1;
    training.trialLastFrame = frame;
    if (training.trialStep >= current.steps.length) {
      training.trialStatus = "COMPLETE";
      training.trialCompletions += 1;
    } else {
      training.trialStatus = `NEXT · ${current.steps[training.trialStep].label}`;
    }
  } else {
    training.trialStep = action === current.steps[0].action ? 1 : 0;
    training.trialLastFrame = frame;
    training.trialStatus = training.trialStep ? `NEXT · ${current.steps[1]?.label || "COMPLETE"}` : `RESET · START WITH ${current.steps[0].label}`;
  }
  return trainingTrialSnapshot(training);
}

function guardInput(empty, observation) {
  empty.guard = true;
  empty.down = observation.attackLevel === "low";
  return empty;
}

export function trainingDummyInput(training, frame, observation = {}) {
  const empty = emptyInput();
  if (training.dummyMode === "cpu") return null;
  if (training.dummyMode === "record") return recordTrainingFrame(training, observation.manualInput || {});
  if (training.dummyMode === "playback") {
    if (!training.recording.length) return empty;
    const index = training.playbackFrame % training.recording.length;
    const played = { ...training.recording[index] };
    training.playbackFrame += 1;
    if (training.playbackFrame % training.recording.length === 0) training.playbackLoops += 1;
    return played;
  }
  if (training.dummyMode === "crouch") empty.down = true;
  if (training.dummyMode === "guard") guardInput(empty, observation);
  if (training.dummyMode === "guard-after-first") {
    if (observation.comboHits > 0 || observation.attackConnected === "hit") training.guardAfterTriggered = true;
    if (training.guardAfterTriggered) guardInput(empty, observation);
  }
  if (training.dummyMode === "jump" && frame % 90 === 0) empty.jump = true;
  if (training.dummyMode === "reversal") {
    if ((observation.hitstunFrames || 0) > 0 || (observation.blockstunFrames || 0) > 0) training.reversalArmed = true;
    else if (training.reversalArmed) {
      training.reversalArmed = false;
      empty.enhancedLauncher = true;
    }
  }
  if (training.dummyMode === "wakeup") {
    if (observation.down || (observation.wakeupFrames || 0) > 0) training.reversalArmed = true;
    if (observation.justWoke && training.reversalArmed) {
      training.reversalArmed = false;
      empty.enhancedLauncher = true;
    } else if (!observation.down && !(observation.wakeupFrames > 0)
      && !(observation.hitstunFrames > 0) && !(observation.blockstunFrames > 0)
      && frame - training.wakeupCycleFrame >= 180) {
      training.wakeupCycleFrame = frame;
      empty.trainingKnockdown = true;
    }
  }
  return empty;
}

export function trainingSnapshot(training) {
  return {
    dummyMode: training.dummyMode,
    autoRecover: training.autoRecover,
    infiniteGrit: training.infiniteGrit,
    showHitboxes: training.showHitboxes,
    resets: training.resets,
    lastDamage: training.lastDamage,
    lastResult: training.lastResult,
    lastMove: training.lastMove ? { ...training.lastMove } : null,
    lastAdvantage: training.lastAdvantage,
    inputHistory: [...training.inputHistory],
    guardAfterTriggered: training.guardAfterTriggered,
    reversalArmed: training.reversalArmed,
    recordingFrames: training.recording.length,
    recordingActive: training.recordingActive,
    playbackFrame: training.playbackFrame,
    playbackLoops: training.playbackLoops,
    perfectGuards: training.perfectGuards,
    trial: trainingTrialSnapshot(training),
  };
}
