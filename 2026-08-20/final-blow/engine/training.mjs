import { FIGHTER_KITS, getKitMoveProfile, prettyProfileName } from "./fighter-kits.mjs";
import { styleCopy } from "./controls.mjs";

export const TRAINING_DUMMY_MODES = Object.freeze([
  "stand", "guard", "guard-after-first", "crouch", "jump",
  "reversal", "wakeup", "record", "playback", "cpu",
]);

export const TRAINING_RECORDING_MAX_FRAMES = 600;
export const TRAINING_TRIAL_GAP_FRAMES = 180;

const trial = (id, name, steps, tier = "bronze") => Object.freeze({
  id,
  name,
  tier,
  steps: Object.freeze(steps.map(([action, label, limb]) => Object.freeze(limb ? { action, label, limb } : { action, label }))),
});

// R1.9 SCHOOL & POCKET: trials are tiered ladders now — bronze teaches the
// confirm, silver the movement/grab/juggle vocabulary, gold the Grit economy.
export const TRIAL_MEDAL_TIERS = Object.freeze(["bronze", "silver", "gold"]);

const BASE_COMBO_TRIALS = {
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
  // 5.1 (sweep #33): the ninth and tenth kits had no ladder at all — the lab
  // built an empty <select> and read "TRIAL: —" for a base-roster fighter.
  // Same bronze pair as the eight above, named from their own kit tables.
  devil: Object.freeze([
    trial("howl-confirm", "HOWL CONFIRM", [["light", "TALON JAB"], ["heavy", "HORN HOOK"], ["commandSpecial", "PINE HOWL"]]),
    trial("barrens-cashout", "BARRENS CASHOUT", [["launcher", "UPDRAFT TALON"], ["super", "BARRENS CURSE"]]),
  ]),
  commissioner: Object.freeze([
    trial("gavel-confirm", "GAVEL CONFIRM", [["light", "CANE JAB"], ["heavy", "GAVEL CRACK"], ["commandSpecial", "LEDGER LANCE"]]),
    trial("authority-cashout", "AUTHORITY CASHOUT", [["launcher", "OVERRULE"], ["super", "FINAL AUTHORITY"]]),
  ]),
};

/**
 * The expanded ladder is GENERATED from each fighter's real kit so every step
 * is guaranteed to name a move that fighter actually has (the unit tests
 * assert this for every trial). The two shipped hand-authored trials stay
 * first with their ids untouched, tagged bronze.
 */
function kitMoveLabel(fighterId, action, context = {}) {
  const profile = getKitMoveProfile(fighterId, action, context);
  if (!profile) return null;
  return profile.moveName || prettyProfileName(profile.id, fighterId);
}

function generatedTrialsForFighter(fighterId) {
  const label = (action, context) => kitMoveLabel(fighterId, action, context);
  // 5.1 (sweep #33): EX SPENDER chains an EX into the command special, so the
  // EX has to leave the dummy STANDING inside the demo's 148-frame gap. The
  // devil's EX Piney Screech launches (airborne for 25 hitstun, wall-carried
  // to the corner, down until ~165 frames after impact) and the scripted Pine
  // Howl at +148 whiffed over the body every run; the Commissioner's Cane
  // Check EX is a short ground knockdown and lands on time. So the first EX
  // flavour that does not knock down is preferred when the kit has one with
  // real hitboxes and damage (only the devil is affected: Wing Flit EX), and
  // everyone else keeps the base EX their ladder shipped with.
  const exStanding = ["enhanced", "enhancedCommandSpecial", "enhancedBackSpecial"].find((action) => {
    const profile = getKitMoveProfile(fighterId, action);
    return profile?.hitboxes?.length && (profile.damage || 0) > 0 && !profile.knockdown;
  });
  const exAction = getKitMoveProfile(fighterId, "enhanced")?.knockdown && exStanding ? exStanding : "enhanced";
  const trials = [
    trial(`${fighterId}-road-work`, "ROAD WORK", [
      ["driveHeavy", label("driveHeavy")],
      ["special", label("special")],
    ], "bronze"),
    trial(`${fighterId}-grab-and-go`, "GRAB AND GO", [
      ["throw", label("throw")],
      ["light", label("light")],
      ["heavy", label("heavy")],
    ], "silver"),
    trial(`${fighterId}-rise-and-run`, "RISE AND RUN", [
      ["launcher", label("launcher")],
      ["driveHeavy", label("driveHeavy")],
    ], "silver"),
    trial(`${fighterId}-ex-spender`, "EX SPENDER", [
      [exAction, label(exAction)],
      ["commandSpecial", label("commandSpecial")],
    ], "gold"),
    trial(`${fighterId}-full-grit-finale`, "FULL GRIT FINALE", [
      ["light", label("light")],
      ["heavy", label("heavy")],
      ["commandSpecial", label("commandSpecial")],
      ["super", label("super")],
    ], "gold"),
  ];
  // Signature route only where the back special can actually land on the
  // standing dummy (counters, traps and pure projectiles are excluded).
  const backSpecial = getKitMoveProfile(fighterId, "backSpecial");
  if (backSpecial?.hitboxes?.length && (backSpecial.damage || 0) > 0) {
    trials.push(trial(`${fighterId}-signature-route`, "SIGNATURE ROUTE", [
      ["backSpecial", label("backSpecial")],
      ["launcher", label("launcher")],
    ], "gold"));
  }
  return trials;
}

// 5.1: the ladder is generated for EVERY kit, not just the ids with an
// authored bronze pair — a kit added without one still gets its six
// generated trials instead of vanishing from the mode.
export const TRAINING_COMBO_TRIALS = Object.freeze(Object.fromEntries(
  [...new Set([...Object.keys(BASE_COMBO_TRIALS), ...Object.keys(FIGHTER_KITS)])].map((fighterId) => [
    fighterId,
    Object.freeze([...(BASE_COMBO_TRIALS[fighterId] || []), ...generatedTrialsForFighter(fighterId)]),
  ]),
));

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
    // R1.9: SFV-style frame meter strip toggle (render-only feature flag).
    showFrameMeter: Boolean(overrides.showFrameMeter),
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
    tier: current?.tier || "bronze",
    steps: current ? current.steps.map((step, index) => ({ ...step, complete: index < training.trialStep })) : [],
    step: training.trialStep,
    status: training.trialStatus,
    complete: Boolean(current && training.trialStep >= current.steps.length),
    completions: training.trialCompletions,
  };
}

function trialStepMatches(step, action, limb) {
  if (!step || action !== step.action) return false;
  if (step.limb && step.limb !== (limb || "punch")) return false;
  return true;
}

export function recordTrainingTrialHit(training, {
  fighterId,
  action,
  limb,
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
  if (trialStepMatches(expected, action, limb)) {
    training.trialStep += 1;
    training.trialLastFrame = frame;
    if (training.trialStep >= current.steps.length) {
      training.trialStatus = "COMPLETE";
      training.trialCompletions += 1;
    } else {
      training.trialStatus = `NEXT · ${current.steps[training.trialStep].label}`;
    }
  } else {
    training.trialStep = trialStepMatches(current.steps[0], action, limb) ? 1 : 0;
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
    showFrameMeter: training.showFrameMeter,
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

// ===========================================================================
// R1.9 SCHOOL & POCKET — trial medals, authored trial demos, situation slots
// and the FIGHT SCHOOL lesson machine. All pure data + pure functions; the
// game wires them to guarded hook points.
// ===========================================================================

const MEDAL_RANK = Object.freeze({ bronze: 1, silver: 2, gold: 3 });

export function normalizeTrialMedals(raw) {
  const medals = {};
  if (!raw || typeof raw !== "object") return medals;
  for (const [fighterId, entries] of Object.entries(raw)) {
    if (!entries || typeof entries !== "object") continue;
    const clean = {};
    for (const [trialId, tier] of Object.entries(entries)) {
      if (TRIAL_MEDAL_TIERS.includes(tier)) clean[String(trialId)] = tier;
    }
    if (Object.keys(clean).length) medals[String(fighterId)] = clean;
  }
  return medals;
}

export function awardTrialMedal(medals, fighterId, trial) {
  if (!trial || !TRIAL_MEDAL_TIERS.includes(trial.tier)) return medals;
  if (!medals[fighterId]) medals[fighterId] = {};
  medals[fighterId][trial.id] = trial.tier;
  return medals;
}

export function medalForTrial(medals, fighterId, trialId) {
  return medals?.[fighterId]?.[trialId] || "";
}

export function fighterMedalCounts(medals, fighterId) {
  const counts = { bronze: 0, silver: 0, gold: 0, total: 0 };
  for (const tier of Object.values(medals?.[fighterId] || {})) {
    if (!(tier in MEDAL_RANK)) continue;
    counts[tier] += 1;
    counts.total += 1;
  }
  return counts;
}

/**
 * Authored trial demo: a scripted input stream for the PLAYER seat that walks
 * to contact, performs each step through the same direct action fields the QA
 * input machinery uses, and re-approaches between steps so pushback can never
 * whiff a later step. `forward` is a pseudo-direction the feeder maps onto
 * left/right against the fighter's live facing (cross-through specials flip
 * sides mid-demo).
 */
export const TRIAL_DEMO_SETTLE_FRAMES = 104;
export const TRIAL_DEMO_APPROACH_FRAMES = 44;

export function trialDemoScript(trial) {
  if (!trial) return [];
  const frames = [];
  const approach = (count) => {
    for (let index = 0; index < count; index += 1) frames.push({ forward: true });
  };
  approach(120);
  for (const step of trial.steps) {
    const press = { [step.action]: true };
    if (step.limb === "kick") press.limb = "kick";
    frames.push(press);
    for (let index = 0; index < TRIAL_DEMO_SETTLE_FRAMES; index += 1) frames.push({});
    approach(TRIAL_DEMO_APPROACH_FRAMES);
  }
  return frames;
}

// --- Situation slots -------------------------------------------------------

export const TRAINING_SLOT_COUNT = 3;
export const TRAINING_SLOT_VERSION = 1;

/**
 * Slot payloads carry the serialized rollback snapshot (the exact contract
 * saveRollbackState/serializeRollbackState already ship for online resume) plus
 * the dummy behaviour so one tap restores the whole situation.
 */
export function encodeTrainingSlot(slot = {}) {
  if (typeof slot.state !== "string" || !slot.state.length) return null;
  return JSON.stringify({
    version: TRAINING_SLOT_VERSION,
    savedAt: Number.isFinite(slot.savedAt) ? slot.savedAt : Date.now(),
    label: typeof slot.label === "string" ? slot.label.slice(0, 48) : "",
    stage: typeof slot.stage === "string" ? slot.stage : "",
    dummyMode: TRAINING_DUMMY_MODES.includes(slot.dummyMode) ? slot.dummyMode : "stand",
    recording: Array.isArray(slot.recording)
      ? slot.recording.slice(0, TRAINING_RECORDING_MAX_FRAMES).map(sanitizeTrainingInput)
      : [],
    state: slot.state,
  });
}

export function decodeTrainingSlot(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || parsed.version !== TRAINING_SLOT_VERSION) return null;
  if (typeof parsed.state !== "string" || !parsed.state.length) return null;
  return {
    version: TRAINING_SLOT_VERSION,
    savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0,
    label: typeof parsed.label === "string" ? parsed.label.slice(0, 48) : "",
    stage: typeof parsed.stage === "string" ? parsed.stage : "",
    dummyMode: TRAINING_DUMMY_MODES.includes(parsed.dummyMode) ? parsed.dummyMode : "stand",
    recording: Array.isArray(parsed.recording)
      ? parsed.recording.slice(0, TRAINING_RECORDING_MAX_FRAMES).map(sanitizeTrainingInput)
      : [],
    state: parsed.state,
  };
}

// --- FIGHT SCHOOL ----------------------------------------------------------

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freezeDeep);
  return value;
}

/**
 * The scripted curriculum. Step kinds:
 *   walk     — hold the direction for `frames` sim ticks
 *   block    — block a dummy attack of the given level (dummyScript arms the
 *              scripted playback attack for the step); `level` omitted means
 *              any level, `perfect: true` needs a Perfect Guard (5.1)
 *   hit      — land an attack matching action (or any of `actions`) / limb /
 *              back / requireDizzy
 *   finisher — execute the Final Blow after the KO
 *   pickup   — pick the stage weapon up off the floor (5.1)
 *   airTech  — tech out of a juggle (5.1)
 *   wake     — choose the wake-up `option` ("quick" | "delay") (5.1)
 * Setup hooks (`setup`) are handled by the game: "dizzy" stuns the dummy,
 * "lowHealth" drops it to a KO-able sliver with auto-life off, "weapon" keeps
 * the stage weapon on the floor (5.1).
 *
 * 5.1 (sweep #31): labels are TEMPLATES — `{commandSpecial}` and friends are
 * filled by fightSchoolStepLabel() with the live control style's command, so
 * a MODERN player reads LP&LK where CLASSIC reads ↓ → + PUNCH. The seven
 * original lessons keep their ids; lessons 8-12 add the Grit economy, the
 * personal throwable, the stage weapon and the DEPTH defensive tools that
 * the Black Book already scores but the school never introduced.
 */
export const FIGHT_SCHOOL_LESSONS = freezeDeep([
  {
    id: "footwork",
    name: "FOOTWORK & GUARD",
    intro: "Walk with the stick. Holding away IS your block button.",
    steps: [
      { id: "walk-forward", kind: "walk", direction: "forward", frames: 40, label: "WALK IN ON THE DUMMY" },
      { id: "walk-back", kind: "walk", direction: "back", frames: 40, label: "WALK OUT · GUARD UP" },
    ],
  },
  {
    id: "guard-heights",
    name: "HIGH & LOW GUARD",
    intro: "Overheads hit standing blockers high. Sweeps go under. Match the guard.",
    steps: [
      { id: "block-high", kind: "block", level: "overhead", dummyScript: "overhead", label: "STAND-BLOCK THE OVERHEAD" },
      { id: "block-low", kind: "block", level: "low", dummyScript: "low", label: "CROUCH-BLOCK THE SWEEP" },
    ],
  },
  {
    id: "four-normals",
    name: "THE FOUR BUTTONS",
    intro: "LP jab, HP hook, LK kick, HK roundhouse. Land all four.",
    steps: [
      { id: "land-lp", kind: "hit", action: "light", limb: "punch", label: "LAND THE LP JAB" },
      { id: "land-hp", kind: "hit", action: "heavy", limb: "punch", label: "LAND THE HP HOOK" },
      { id: "land-lk", kind: "hit", action: "light", limb: "kick", label: "LAND THE LK" },
      { id: "land-hk", kind: "hit", action: "heavy", limb: "kick", label: "LAND THE HK ROUNDHOUSE" },
    ],
  },
  {
    id: "qcf-special",
    name: "THE QUARTER CIRCLE",
    intro: "Roll down to forward, then punch. Smooth, not fast.",
    steps: [
      { id: "land-qcf", kind: "hit", action: "commandSpecial", label: "LAND {commandSpecial}" },
    ],
  },
  {
    id: "throw-tech",
    name: "THE PROXIMITY GRAB",
    intro: "Step chest to chest. Toward or away plus LP or LK throws \u2014 no whiff animation.",
    steps: [
      { id: "throw-forward", kind: "hit", action: "throw", back: false, label: "CLOSE + TOWARD + LP" },
      { id: "throw-back", kind: "hit", action: "throw", back: true, label: "CLOSE + AWAY + LP \u00b7 SIDE SWAP" },
    ],
  },
  {
    id: "dizzy-punish",
    name: "THE DIZZY PUNISH",
    intro: "Stars mean free damage. Take the biggest thing you have.",
    setup: "dizzy",
    steps: [
      { id: "punish-dizzy", kind: "hit", requireDizzy: true, label: "HIT THE DIZZIED DUMMY" },
    ],
  },
  {
    id: "final-blow",
    name: "THE FINAL BLOW",
    intro: "After the KO the street waits. LP is Finisher A, LK is B \u2014 any distance.",
    setup: "lowHealth",
    steps: [
      { id: "execute-finisher", kind: "finisher", label: "KO \u00b7 THEN LP OR LK" },
    ],
  },
  {
    id: "throwable",
    name: "THE JAWN",
    intro: "Every fighter carries something. Two throws a round \u2014 the pips under your Grit bar count them.",
    steps: [
      { id: "land-jawn", kind: "hit", action: "throwObject", label: "LAND {throwObject}" },
      { id: "jawn-confirm", kind: "hit", action: "heavy", limb: "punch", label: "WALK IN BEHIND IT \u00b7 LAND HP" },
    ],
  },
  {
    id: "grit-economy",
    name: "GRIT ECONOMY",
    intro: "Grit pays for the big stuff. 25 buys an EX version of any special, 100 buys the super.",
    steps: [
      { id: "land-ex", kind: "hit", actions: ["enhanced", "enhancedCommandSpecial", "enhancedBackSpecial", "enhancedLauncher"], label: "LAND AN EX \u00b7 {enhanced}" },
      { id: "land-super", kind: "hit", action: "super", label: "CASH OUT \u00b7 {super}" },
    ],
  },
  {
    id: "split-second",
    name: "SPLIT SECOND",
    intro: "Block late on purpose. Away inside four frames of the hit is a Perfect Guard \u2014 no chip, +3 Grit. Then buy your way out of blockstun.",
    steps: [
      { id: "perfect-one", kind: "block", perfect: true, dummyScript: "overhead", label: "PERFECT GUARD \u00b7 {perfectGuard}" },
      { id: "perfect-two", kind: "block", perfect: true, dummyScript: "overhead", label: "AGAIN \u00b7 WATCH THE CYAN RING" },
      { id: "guard-reversal", kind: "hit", action: "guardReversal", dummyScript: "overhead", label: "GUARD REVERSAL \u00b7 {guardReversal} \u00b7 30 GRIT" },
    ],
  },
  {
    id: "off-the-floor",
    name: "OFF THE FLOOR",
    intro: "Getting hit is a decision too. Tech the juggle, then pick how you stand up.",
    steps: [
      { id: "air-tech", kind: "airTech", dummyScript: "launcher", label: "EAT THE LAUNCHER \u00b7 {airTech}" },
      { id: "quick-rise", kind: "wake", option: "quick", dummyScript: "sweep", label: "EAT THE SWEEP \u00b7 {quickRise}" },
      { id: "delay-wake", kind: "wake", option: "delay", dummyScript: "sweep", label: "SWEPT AGAIN \u00b7 {delayWake}" },
    ],
  },
  {
    id: "street-furniture",
    name: "STREET FURNITURE",
    intro: "Every stage drops one object a round. Stand over it, pick it up, throw it \u2014 toward for the hard throw.",
    setup: "weapon",
    steps: [
      { id: "pick-up", kind: "pickup", label: "PICK IT UP \u00b7 {stageWeapon}" },
      { id: "throw-it", kind: "hit", action: "stageWeapon", label: "TOWARD + HP \u00b7 LAND THE THROW" },
    ],
  },
]);

/**
 * The label a step shows for `style` — templates resolve through the shared
 * command table so every surface (panel, announcer, tests) agrees.
 */
export function fightSchoolStepLabel(step, style = "classic") {
  return styleCopy(step?.label || "", style);
}

// Philly corner-man voice. The game draws these through a no-repeat bag so a
// line never lands back-to-back.
export const FIGHT_SCHOOL_COACH_LINES = freezeDeep({
  start: [
    "Aight jawn, school's in. No slacking on my corner.",
    "This the same lot I learned on. Pay attention.",
    "Water ice after class if you land everything. Focus up.",
    "They don't teach this at Temple. Eyes front.",
    "Off the ropes, youngbul. We got work.",
  ],
  step: [
    "There it is. Again like you mean it.",
    "That's the one. Drill it till it's boring.",
    "Clean. My man.",
    "Yerrr! That's how we do it down here.",
    "Textbook. If Philly had a textbook.",
    "Now you cooking with grease.",
  ],
  lesson: [
    "Lesson done. Shake it out, next page.",
    "That's a wrap on that one. Keep moving.",
    "You pass. Barely. Next lesson.",
    "Broad Street would be proud. Moving on.",
    "One more chapter closer to a real fighter.",
  ],
  graduate: [
    "School's out. You're officially a problem.",
    "That's the whole book. Go start something.",
    "Graduated. First round of cheesesteaks on you.",
  ],
});

export function createFightSchoolState(overrides = {}) {
  const lessonCount = FIGHT_SCHOOL_LESSONS.length;
  const completed = {};
  if (overrides.completed && typeof overrides.completed === "object") {
    for (const lesson of FIGHT_SCHOOL_LESSONS) {
      if (overrides.completed[lesson.id]) completed[lesson.id] = true;
    }
  }
  return {
    lesson: Number.isInteger(overrides.lesson)
      ? Math.max(0, Math.min(lessonCount, overrides.lesson))
      : 0,
    step: Number.isInteger(overrides.step) ? Math.max(0, overrides.step) : 0,
    walkFrames: 0,
    lastAttackSerial: -1,
    completed,
    graduated: Boolean(overrides.graduated) || Object.keys(completed).length >= lessonCount,
  };
}

export function fightSchoolLesson(school) {
  return FIGHT_SCHOOL_LESSONS[school?.lesson] || null;
}

/**
 * The combo-trial step machine pattern applied to lessons: sequential steps,
 * attackSerial dedupe on hit events, no failure state — a miss just leaves the
 * step armed. Returns null when nothing advanced, otherwise a progress record.
 */
export function fightSchoolObserve(school, event = {}) {
  const lesson = fightSchoolLesson(school);
  if (!lesson) return null;
  const step = lesson.steps[school.step];
  if (!step) return null;
  let advanced = false;
  if (step.kind === "walk" && event.type === "walk") {
    if (event.direction === step.direction) {
      school.walkFrames += 1;
      if (school.walkFrames >= step.frames) advanced = true;
    }
  } else if (step.kind === "block" && event.type === "block") {
    const levelOk = !step.level || event.level === step.level;
    const perfectOk = !step.perfect || Boolean(event.perfect);
    if (levelOk && perfectOk) advanced = true;
  } else if (step.kind === "hit" && event.type === "hit") {
    if (Number.isInteger(event.attackSerial) && event.attackSerial !== school.lastAttackSerial) {
      school.lastAttackSerial = event.attackSerial;
      const actionOk = step.actions
        ? step.actions.includes(event.action)
        : !step.action || event.action === step.action;
      const limbOk = !step.limb || step.limb === (event.limb || "punch");
      const backOk = step.back === undefined || Boolean(event.back) === step.back;
      const dizzyOk = !step.requireDizzy || Boolean(event.dizzy);
      if (actionOk && limbOk && backOk && dizzyOk) advanced = true;
    }
  } else if (step.kind === "finisher" && event.type === "finisher") {
    advanced = true;
  } else if (step.kind === "pickup" && event.type === "pickup") {
    advanced = true;
  } else if (step.kind === "airTech" && event.type === "airTech") {
    advanced = true;
  } else if (step.kind === "wake" && event.type === "wake") {
    if (event.option === step.option) advanced = true;
  }
  if (!advanced) return null;
  school.walkFrames = 0;
  school.step += 1;
  const lessonComplete = school.step >= lesson.steps.length;
  if (lessonComplete) {
    school.completed[lesson.id] = true;
    school.lesson += 1;
    school.step = 0;
    if (school.lesson >= FIGHT_SCHOOL_LESSONS.length) school.graduated = true;
  }
  return {
    stepComplete: true,
    lessonComplete,
    graduated: school.graduated,
    lessonId: lesson.id,
  };
}

export function fightSchoolSnapshot(school, { style = "classic" } = {}) {
  if (!school) return null;
  const lesson = fightSchoolLesson(school);
  return {
    lesson: school.lesson,
    lessonCount: FIGHT_SCHOOL_LESSONS.length,
    lessonId: lesson?.id || null,
    lessonName: lesson?.name || "GRADUATED",
    step: school.step,
    steps: lesson ? lesson.steps.map((entry, index) => ({
      id: entry.id,
      label: fightSchoolStepLabel(entry, style),
      complete: index < school.step,
    })) : [],
    completed: { ...school.completed },
    graduated: school.graduated,
  };
}
