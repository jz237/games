import {
  DEFAULT_INPUT_BUFFER_FRAMES,
  DeterministicRng,
  FIGHTER_STATES,
  FixedStepClock,
  FrameInputBuffer,
  INPUT_BUFFER_RULES,
  SIMULATION_HZ,
  SIMULATION_STEP_SECONDS,
  createAttackInstance,
  hashSeed,
  transitionFighterState,
} from "./engine/foundation.mjs";
import {
  ATTACK_LEVELS,
  DEFENSE_RULES,
  DirectionTapTracker,
  FIGHTER_SCALE,
  MOVEMENT_RULES,
  STUN_RULES,
  stunGainForAttack,
  boxesOverlap,
  canGuardAttack,
  createCombatMove,
  findBoxCollision,
  getActiveHitboxes,
  getHurtboxes,
  isCounterHit,
  resolveArenaCollision,
} from "./engine/defense.mjs";
import {
  COMBO_RULES,
  GRIT_RULES,
  ComboTracker,
  canCancelAttack,
  createAdvancedMove,
  gritCostForAction,
  recognizeCombatCommand,
} from "./engine/combos.mjs";
import {
  KIT_ACTIONS,
  attackAnimationPose,
  createFighterMove,
  fighterActionCost,
  fighterActionGroup,
  getFighterKit,
  getFighterMovement,
  listFighterMoves,
  recognizeFighterCommand,
} from "./engine/fighter-kits.mjs";
import {
  AI_DIFFICULTIES,
  AI_DIFFICULTY_ORDER,
  DEFAULT_AI_DIFFICULTY,
  aiBrainSnapshot,
  createAiBrain,
  isPassiveDifficulty,
  normalizeAiDifficulty,
  resetAiBrain,
  stepAiBrain,
} from "./engine/ai.mjs";
import {
  ARCADE_BOSS_ID,
  arcadeRunSnapshot,
  createArcadeRun,
  currentArcadeMatch,
  getArcadeEnding,
  recordArcadeResult,
} from "./engine/arcade.mjs";
import {
  ATTACK_BUTTONS,
  BUTTON_LABELS,
  BUTTON_NAMES,
  DEFAULT_KEY_MAPS,
  DEFAULT_PAD_MAP,
  PAD_BUTTON_LABELS,
  REMAPPABLE_ACTIONS,
  TOURNAMENT_ACTION_PRIORITY,
  applyControlStyle,
  detectPadLabelSet,
  formatKeyCode,
  hasFlowSkipInput,
  normalizeControlStyle,
  normalizeKeyMaps,
  normalizePadMap,
  padButtonLabel,
  remapKeyBinding,
  remapPadBinding,
  resolveFourButtonInput,
} from "./engine/controls.mjs";
import {
  TRAINING_DUMMY_MODES,
  beginTrainingRecording,
  comboTrialsForFighter,
  createTrainingState,
  finishTrainingRecording,
  recordTrainingFrame,
  recordTrainingTrialHit,
  resetTrainingScenario,
  selectTrainingTrial,
  trainingDummyInput,
  trainingSnapshot,
} from "./engine/training.mjs";
import {
  auditFighterBalance,
  auditTournamentBalance,
  normalizeVisualQuality,
  resolvePerformanceProfile,
  trimVisualBudget,
} from "./engine/polish.mjs";
import {
  buildInviteUrl,
  connectPrivateRoom,
  createPrivateRoom,
  parseInvite,
  roomFingerprint,
  scrubInviteFromAddress,
} from "./engine/rooms.mjs";
import { FinalBlowPeer } from "./engine/webrtc.mjs";
import {
  RollbackSession,
  bitsToInput,
  checksumState,
  inputToBits,
  matchTagFromId,
  normalizeInputDelay,
  parseRollbackState,
  recommendedInputDelay,
  serializeRollbackState,
} from "./engine/rollback.mjs";
import {
  DEMO_AI_DIFFICULTY,
  DEMO_IDLE_DELAY_MS,
  DEMO_RESULT_HOLD_MS,
  createDemoDirector,
} from "./engine/demo.mjs";
import {
  auditGraphicFatalities,
  getGraphicFatality,
  graphicFatalitySnapshot,
} from "./engine/fatalities.mjs";
import {
  BOARDWALK_POSTURES,
  BUFFET_POSTURES,
  POOLSIDE_POSTURES,
  CROWD_LAYERS,
  POSTURES,
  TAILGATE_POSTURES,
  catPosition,
  createCrowd,
  crowdPosition,
  crowdSnapshot,
  scufflePhase,
} from "./engine/crowd.mjs";
import {
  STAGE_WEAPONS,
  canPickUpWeapon,
  canWeaponArrive,
  getStageWeapon,
  planStageWeapon,
  weaponSnapshot,
} from "./engine/stage-weapons.mjs";
import {
  FIGHTER_THROWABLES,
  THROWABLE_COMMAND,
  createThrowObjectMove,
  getThrowable,
  stepThrowable,
  throwableUses,
} from "./engine/throwables.mjs";
import {
  FIGHTER_AUDIO_CUES,
  FIGHTER_AUDIO_LABELS,
  auditFighterAudio,
  fighterAudioCue,
} from "./engine/fighter-audio.mjs";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;
const FLOOR = 600;
// Faster fall to match the quicker walks, then scaled with the fighters so the
// jump arc keeps the same shape and hang time relative to body size.
const GRAVITY = Math.round(2180 * FIGHTER_SCALE);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function storedJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function performanceEnvironment(reducedMotion = false) {
  return {
    reducedMotion,
    saveData: Boolean(navigator.connection?.saveData),
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    mobile: navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) <= 760,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
  };
}

const roster = [
  {
    id: "deathblow",
    name: "DEATHBLOW",
    title: "SEISMIC BRAWLER",
    mark: "DB",
    color: "#e52d2d",
    accent: "#ffb21f",
    weapon: "gauntlets",
    special: "FAULTLINE PUNCH",
    vfx: "seismic",
    finishers: ["FAULTLINE EXECUTION", "AFTERSHOCK BURIAL"],
  },
  {
    id: "jez",
    name: "JEZ",
    title: "BLUE-GI SIGNSMITH",
    mark: "JZ",
    color: "#14cbe8",
    accent: "#ff43c5",
    weapon: "signblade",
    special: "NEON PALM",
    vfx: "neon",
    finishers: ["NEON GUILLOTINE", "VINYL WRAP"],
  },
  {
    id: "alan",
    name: "ALLAN",
    title: "SOUTH PHILLY HEAVYWEIGHT",
    mark: "AL",
    color: "#d8d8d8",
    accent: "#e52d2d",
    weapon: "gauntlets",
    special: "SOUTH STREET SLAM",
    vfx: "steel",
    finishers: ["THE HEAVY HAND", "SOUTH STREET SHUTDOWN"],
  },
  {
    id: "post",
    name: "POST",
    title: "SPRAY-CAN BRAWLER",
    mark: "P",
    color: "#e59b25",
    accent: "#fff1b0",
    weapon: "spraycan",
    special: "PAINT THE TOWN",
    vfx: "paint",
    finishers: ["FULL COVERAGE", "WET PAINT"],
  },
  {
    id: "benny",
    name: "BENNY",
    title: "STREET TECHNICIAN",
    mark: "BN",
    color: "#416fe8",
    accent: "#f7e53e",
    weapon: "shockgloves",
    special: "BENNY BLITZ",
    vfx: "voltage",
    finishers: ["CIRCUIT BREAKER", "BENNY'S LAST CALL"],
  },
  {
    id: "donald",
    name: "DONALD TRUMP",
    title: "GILDED SHOWMAN",
    mark: "DT",
    color: "#315fb4",
    accent: "#f1bd26",
    weapon: "golfclub",
    special: "GOLDEN SHOCKWAVE",
    vfx: "gilded",
    finishers: ["GOLDEN SEND-OFF", "YOU'RE FIRED!"],
  },
  {
    id: "cyraxx",
    name: "CYRAXX",
    title: "FEEDBACK TRICKSTER",
    mark: "CX",
    color: "#54cf42",
    accent: "#ad5aff",
    weapon: "micstaff",
    special: "BUFFERING",
    vfx: "feedback",
    finishers: ["FEEDBACK BLACKOUT", "INTERNET MELTDOWN"],
  },
  {
    id: "ali",
    name: "ALI G",
    title: "WEST STAINES MC",
    mark: "AG",
    color: "#f4d21f",
    accent: "#ff48aa",
    weapon: "micchucks",
    special: "BASS DROP",
    vfx: "bass",
    finishers: ["MIC DROP", "WEST STAINES MASSIVE"],
  },
];

const balanceAudit = auditFighterBalance(roster.map(({ id }) => getFighterKit(id)));
if (balanceAudit.violations.length) console.warn("Final Blow balance guardrail warning", balanceAudit.violations);
const tournamentAudit = auditTournamentBalance(roster.map(({ id }) => id));
if (tournamentAudit.violations.length) console.warn("Final Blow tournament audit warning", tournamentAudit.violations);
const fatalityAudit = auditGraphicFatalities(roster.map(({ id }) => id));
if (fatalityAudit.errors.length) console.warn("Final Blow graphic fatality warning", fatalityAudit.errors);

const arcadeBoss = Object.freeze({
  id: ARCADE_BOSS_ID,
  kitId: "deathblow",
  name: "THE COMMISSIONER",
  title: "KEEPER OF THE BLACK BOOK",
  mark: "TC",
  color: "#661421",
  accent: "#d6b56b",
  weapon: "steel cane",
  special: "FINAL AUTHORITY",
  vfx: "authority",
  boss: true,
  finishers: ["CLOSED SESSION", "FINAL AUTHORITY"],
  victoryQuote: "THE BOOK CLOSES WHEN I SAY IT CLOSES.",
  finisherScriptId: "deathblow",
});

// Each Final Blow is staged as a short, character-specific arcade cinematic.
// Coordinates are local to the victim: negative X begins behind the attacker,
// Y is height above the floor, and frame numbers address the 4x4 atlas grammar.
const finisherScripts = {
  deathblow: {
    combo: "FAULTLINE FIVE",
    duration: 5.35,
    keys: [
      { t: 0, ax: -300, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .42, ax: -205, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.06 },
      { t: .68, ax: -58, ay: 0, af: 10, vx: 10, vy: 0, vf: 15, zoom: 1.12 },
      { t: 1.12, ax: -42, ay: 0, af: 13, vx: 28, vy: 38, vf: 15, vr: -.08, zoom: 1.15 },
      { t: 1.48, ax: -10, ay: 0, af: 14, vx: 58, vy: 176, vf: 15, vr: -.28, zoom: 1.22 },
      { t: 1.9, ax: -98, ay: 88, af: 13, vx: 62, vy: 225, vf: 15, vr: -.42, zoom: 1.18 },
      { t: 2.5, ax: -8, ay: 24, af: 14, vx: 30, vy: 0, vf: 15, vr: .62, zoom: 1.28 },
      { t: 3.3, ax: -130, ay: 0, af: 12, vx: 30, vy: 0, vf: 15, vr: .62, zoom: 1.12 },
      { t: 4.02, ax: -12, ay: 0, af: 14, vx: 48, vy: 0, vf: 15, vr: 1.18, zoom: 1.34 },
      { t: 5.35, ax: -118, ay: 0, af: 0, vx: 72, vy: 0, vf: 15, vr: 1.35, zoom: 1.08 },
    ],
    impacts: [
      { t: .68, label: "RAM", sound: "heavy", power: .55 },
      { t: 1.12, label: "RISING IRON", sound: "hit", power: .7 },
      { t: 1.48, label: "SKYBREAKER", sound: "special", power: .9 },
      { t: 2.5, label: "GROUND SLAM", sound: "heavy", power: 1.05 },
      { t: 4.02, label: "FAULTLINE", sound: "final", power: 1.45, final: true },
    ],
  },
  jez: {
    combo: "NEON SEVEN-PALM",
    duration: 5.25,
    keys: [
      { t: 0, ax: -305, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .38, ax: -150, ay: 0, af: 7, vx: 0, vy: 0, vf: 15, zoom: 1.07 },
      { t: .58, ax: -42, ay: 0, af: 9, vx: 4, vy: 0, vf: 15, zoom: 1.12 },
      { t: .86, ax: 48, ay: 0, af: 10, vx: -4, vy: 8, vf: 15, vr: .05, zoom: 1.15 },
      { t: 1.13, ax: -50, ay: 0, af: 9, vx: 6, vy: 16, vf: 15, vr: -.08, zoom: 1.17 },
      { t: 1.42, ax: 42, ay: 0, af: 10, vx: -8, vy: 28, vf: 15, vr: .12, zoom: 1.2 },
      { t: 1.82, ax: -58, ay: 0, af: 13, vx: 22, vy: 115, vf: 15, vr: -.2, zoom: 1.2 },
      { t: 2.25, ax: -5, ay: 155, af: 14, vx: 28, vy: 188, vf: 15, vr: -.5, zoom: 1.23 },
      { t: 2.8, ax: 65, ay: 50, af: 13, vx: 18, vy: 60, vf: 15, vr: .72, zoom: 1.17 },
      { t: 3.4, ax: -125, ay: 0, af: 12, vx: 18, vy: 0, vf: 15, vr: .72, zoom: 1.12 },
      { t: 4.0, ax: -16, ay: 0, af: 14, vx: 42, vy: 0, vf: 15, vr: 1.18, zoom: 1.33 },
      { t: 5.25, ax: -142, ay: 0, af: 0, vx: 64, vy: 0, vf: 15, vr: 1.35, zoom: 1.08 },
    ],
    impacts: [
      { t: .58, label: "PALM ONE", sound: "light", power: .38 },
      { t: .86, label: "PHASE STEP", sound: "hit", power: .48 },
      { t: 1.13, label: "NEON THREE", sound: "light", power: .5 },
      { t: 1.42, label: "SIGN FLASH", sound: "hit", power: .62 },
      { t: 1.82, label: "LIFT", sound: "heavy", power: .8 },
      { t: 2.25, label: "SKY PALM", sound: "special", power: .92 },
      { t: 4.0, label: "NEON GUILLOTINE", sound: "final", power: 1.42, final: true },
    ],
  },
  alan: {
    combo: "SOUTH STREET SIX",
    duration: 5.3,
    keys: [
      { t: 0, ax: -285, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .42, ax: -112, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.08 },
      { t: .66, ax: -42, ay: 0, af: 9, vx: 8, vy: 0, vf: 15, zoom: 1.13 },
      { t: .96, ax: -48, ay: 0, af: 10, vx: 16, vy: 4, vf: 15, vr: -.05, zoom: 1.14 },
      { t: 1.28, ax: -32, ay: 0, af: 13, vx: 35, vy: 60, vf: 15, vr: -.14, zoom: 1.18 },
      { t: 1.68, ax: -20, ay: 0, af: 14, vx: 58, vy: 188, vf: 15, vr: -.46, zoom: 1.24 },
      { t: 2.18, ax: -72, ay: 145, af: 13, vx: 55, vy: 220, vf: 15, vr: -.55, zoom: 1.2 },
      { t: 2.72, ax: 4, ay: 25, af: 14, vx: 24, vy: 0, vf: 15, vr: .78, zoom: 1.3 },
      { t: 3.42, ax: -112, ay: 0, af: 8, vx: 24, vy: 0, vf: 15, vr: .78, zoom: 1.12 },
      { t: 4.05, ax: -8, ay: 0, af: 13, vx: 52, vy: 0, vf: 15, vr: 1.22, zoom: 1.35 },
      { t: 5.3, ax: -130, ay: 0, af: 0, vx: 70, vy: 0, vf: 15, vr: 1.38, zoom: 1.08 },
    ],
    impacts: [
      { t: .66, label: "LEFT HOOK", sound: "light", power: .42 },
      { t: .96, label: "RIGHT CROSS", sound: "hit", power: .55 },
      { t: 1.28, label: "BODY BREAK", sound: "heavy", power: .72 },
      { t: 1.68, label: "UPPERCUT", sound: "special", power: .95 },
      { t: 2.72, label: "PILEDRIVER", sound: "heavy", power: 1.08 },
      { t: 4.05, label: "HEAVY HAND", sound: "final", power: 1.46, final: true },
    ],
  },
  post: {
    combo: "FULL COVERAGE",
    duration: 5.25,
    keys: [
      { t: 0, ax: -315, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .5, ax: -205, ay: 0, af: 8, vx: 0, vy: 0, vf: 15, zoom: 1.06 },
      { t: .82, ax: -155, ay: 0, af: 10, vx: 8, vy: 6, vf: 15, zoom: 1.12 },
      { t: 1.18, ax: -55, ay: 0, af: 9, vx: 18, vy: 12, vf: 15, vr: -.08, zoom: 1.15 },
      { t: 1.58, ax: 48, ay: 0, af: 10, vx: -8, vy: 32, vf: 15, vr: .14, zoom: 1.18 },
      { t: 1.96, ax: -35, ay: 0, af: 13, vx: 30, vy: 125, vf: 15, vr: -.28, zoom: 1.2 },
      { t: 2.42, ax: -12, ay: 128, af: 14, vx: 38, vy: 185, vf: 15, vr: -.5, zoom: 1.22 },
      { t: 2.92, ax: -85, ay: 0, af: 12, vx: 24, vy: 0, vf: 15, vr: .72, zoom: 1.14 },
      { t: 3.48, ax: -155, ay: 0, af: 13, vx: 24, vy: 0, vf: 15, vr: .72, zoom: 1.12 },
      { t: 4.0, ax: -28, ay: 0, af: 14, vx: 45, vy: 0, vf: 15, vr: 1.18, zoom: 1.34 },
      { t: 5.25, ax: -155, ay: 0, af: 0, vx: 72, vy: 0, vf: 15, vr: 1.36, zoom: 1.08 },
    ],
    impacts: [
      { t: .5, label: "PRIMER", sound: "special", power: .45 },
      { t: .82, label: "SPRAY BURST", sound: "hit", power: .55 },
      { t: 1.18, label: "ROLLER ONE", sound: "light", power: .55 },
      { t: 1.58, label: "ROLLER TWO", sound: "heavy", power: .7 },
      { t: 1.96, label: "PAINT LIFT", sound: "special", power: .88 },
      { t: 4.0, label: "FULL COVERAGE", sound: "final", power: 1.45, final: true },
    ],
  },
  benny: {
    combo: "CIRCUIT BREAKER",
    duration: 5.25,
    keys: [
      { t: 0, ax: -300, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .4, ax: -145, ay: 0, af: 7, vx: 0, vy: 0, vf: 15, zoom: 1.07 },
      { t: .62, ax: -44, ay: 0, af: 9, vx: 6, vy: 0, vf: 15, zoom: 1.12 },
      { t: .88, ax: 42, ay: 0, af: 10, vx: -4, vy: 10, vf: 15, vr: .05, zoom: 1.15 },
      { t: 1.14, ax: -46, ay: 0, af: 9, vx: 8, vy: 22, vf: 15, vr: -.09, zoom: 1.17 },
      { t: 1.45, ax: -28, ay: 0, af: 13, vx: 32, vy: 92, vf: 15, vr: -.2, zoom: 1.2 },
      { t: 1.88, ax: -8, ay: 100, af: 14, vx: 50, vy: 195, vf: 15, vr: -.48, zoom: 1.24 },
      { t: 2.4, ax: 55, ay: 65, af: 13, vx: 32, vy: 90, vf: 15, vr: .58, zoom: 1.2 },
      { t: 3.08, ax: -145, ay: 0, af: 12, vx: 24, vy: 0, vf: 15, vr: .72, zoom: 1.12 },
      { t: 3.96, ax: -22, ay: 0, af: 14, vx: 48, vy: 0, vf: 15, vr: 1.18, zoom: 1.34 },
      { t: 5.25, ax: -145, ay: 0, af: 0, vx: 72, vy: 0, vf: 15, vr: 1.36, zoom: 1.08 },
    ],
    impacts: [
      { t: .62, label: "HOT WIRE", sound: "light", power: .4 },
      { t: .88, label: "CROSS CURRENT", sound: "hit", power: .52 },
      { t: 1.14, label: "THREE-PHASE", sound: "light", power: .58 },
      { t: 1.45, label: "VOLTAGE LIFT", sound: "heavy", power: .82 },
      { t: 1.88, label: "ARC FLASH", sound: "special", power: 1 },
      { t: 3.96, label: "CIRCUIT BREAKER", sound: "final", power: 1.46, final: true },
    ],
  },
  donald: {
    combo: "GOLDEN BACK NINE",
    duration: 5.35,
    keys: [
      { t: 0, ax: -320, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .48, ax: -185, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.07 },
      { t: .76, ax: -72, ay: 0, af: 9, vx: 10, vy: 0, vf: 15, zoom: 1.12 },
      { t: 1.08, ax: -58, ay: 0, af: 10, vx: 20, vy: 22, vf: 15, vr: -.08, zoom: 1.15 },
      { t: 1.48, ax: -115, ay: 0, af: 13, vx: 20, vy: 22, vf: 15, vr: -.08, zoom: 1.12 },
      { t: 1.86, ax: -28, ay: 0, af: 14, vx: 58, vy: 178, vf: 15, vr: -.45, zoom: 1.25 },
      { t: 2.32, ax: -80, ay: 112, af: 13, vx: 68, vy: 220, vf: 15, vr: -.58, zoom: 1.2 },
      { t: 2.78, ax: 18, ay: 52, af: 14, vx: 32, vy: 0, vf: 15, vr: .72, zoom: 1.3 },
      { t: 3.38, ax: -180, ay: 0, af: 13, vx: 32, vy: 0, vf: 15, vr: .72, zoom: 1.12 },
      { t: 4.08, ax: -30, ay: 0, af: 14, vx: 65, vy: 0, vf: 15, vr: 1.2, zoom: 1.36 },
      { t: 5.35, ax: -180, ay: 0, af: 0, vx: 90, vy: 0, vf: 15, vr: 1.38, zoom: 1.08 },
    ],
    impacts: [
      { t: .76, label: "TEE SHOT", sound: "light", power: .42 },
      { t: 1.08, label: "CHIP SHOT", sound: "hit", power: .58 },
      { t: 1.86, label: "GOLDEN DRIVE", sound: "special", power: 1 },
      { t: 2.78, label: "CLUBHOUSE DROP", sound: "heavy", power: 1.08 },
      { t: 4.08, label: "YOU'RE FIRED", sound: "final", power: 1.5, final: true },
    ],
  },
  cyraxx: {
    combo: "FEEDBACK MELTDOWN",
    duration: 5.3,
    keys: [
      { t: 0, ax: -320, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .46, ax: -195, ay: 0, af: 7, vx: 0, vy: 0, vf: 15, zoom: 1.06 },
      { t: .72, ax: -90, ay: 0, af: 9, vx: 8, vy: 8, vf: 15, zoom: 1.12 },
      { t: 1.02, ax: 45, ay: 0, af: 10, vx: -6, vy: 18, vf: 15, vr: .08, zoom: 1.15 },
      { t: 1.34, ax: -48, ay: 0, af: 13, vx: 22, vy: 80, vf: 15, vr: -.18, zoom: 1.2 },
      { t: 1.75, ax: -15, ay: 95, af: 14, vx: 50, vy: 185, vf: 15, vr: -.45, zoom: 1.24 },
      { t: 2.2, ax: 70, ay: 80, af: 13, vx: 36, vy: 108, vf: 15, vr: .58, zoom: 1.2 },
      { t: 2.72, ax: -90, ay: 0, af: 12, vx: 26, vy: 0, vf: 15, vr: .7, zoom: 1.14 },
      { t: 3.3, ax: -165, ay: 0, af: 13, vx: 26, vy: 0, vf: 15, vr: .7, zoom: 1.12 },
      { t: 4.0, ax: -25, ay: 0, af: 14, vx: 54, vy: 0, vf: 15, vr: 1.2, zoom: 1.35 },
      { t: 5.3, ax: -165, ay: 0, af: 0, vx: 78, vy: 0, vf: 15, vr: 1.38, zoom: 1.08 },
    ],
    impacts: [
      { t: .72, label: "MIC CHECK", sound: "light", power: .4 },
      { t: 1.02, label: "STAFF SWEEP", sound: "hit", power: .56 },
      { t: 1.34, label: "GAIN SPIKE", sound: "heavy", power: .78 },
      { t: 1.75, label: "SONIC LIFT", sound: "special", power: 1 },
      { t: 2.2, label: "BUFFER DROP", sound: "heavy", power: 1.05 },
      { t: 4.0, label: "FEEDBACK BLACKOUT", sound: "final", power: 1.48, final: true },
    ],
  },
  ali: {
    combo: "WEST STAINES MASSIVE",
    duration: 5.3,
    keys: [
      { t: 0, ax: -310, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .42, ax: -175, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.07 },
      { t: .66, ax: -62, ay: 0, af: 9, vx: 8, vy: 5, vf: 15, zoom: 1.12 },
      { t: .94, ax: 45, ay: 0, af: 10, vx: -5, vy: 14, vf: 15, vr: .06, zoom: 1.15 },
      { t: 1.22, ax: -46, ay: 0, af: 9, vx: 12, vy: 30, vf: 15, vr: -.1, zoom: 1.17 },
      { t: 1.55, ax: -32, ay: 0, af: 13, vx: 34, vy: 105, vf: 15, vr: -.24, zoom: 1.2 },
      { t: 1.95, ax: -8, ay: 125, af: 14, vx: 54, vy: 195, vf: 15, vr: -.5, zoom: 1.25 },
      { t: 2.42, ax: 62, ay: 75, af: 13, vx: 34, vy: 92, vf: 15, vr: .58, zoom: 1.2 },
      { t: 3.05, ax: -150, ay: 0, af: 12, vx: 24, vy: 0, vf: 15, vr: .72, zoom: 1.12 },
      { t: 3.98, ax: -20, ay: 0, af: 14, vx: 52, vy: 0, vf: 15, vr: 1.2, zoom: 1.35 },
      { t: 5.3, ax: -150, ay: 0, af: 0, vx: 78, vy: 0, vf: 15, vr: 1.38, zoom: 1.08 },
    ],
    impacts: [
      { t: .66, label: "MIC ONE", sound: "light", power: .4 },
      { t: .94, label: "MIC TWO", sound: "hit", power: .52 },
      { t: 1.22, label: "BOOYAKASHA", sound: "light", power: .58 },
      { t: 1.55, label: "BASS LIFT", sound: "heavy", power: .82 },
      { t: 1.95, label: "MASSIVE AIR", sound: "special", power: 1 },
      { t: 2.42, label: "MIC DROP", sound: "heavy", power: 1.08 },
      { t: 3.98, label: "WEST STAINES MASSIVE", sound: "final", power: 1.5, final: true },
    ],
  },
};

const stages = {
  kensington: {
    name: "KENSINGTON & ALLEGHENY",
    ticker: "KENSINGTON & ALLEGHENY // PHILADELPHIA",
    src: "assets/kensington-allegheny.webp",
  },
  vet: {
    name: "THE VET PARKING LOT",
    ticker: "VETERANS STADIUM // SOUTH PHILADELPHIA // 1999",
    src: "assets/veterans-stadium.webp",
  },
  wildwood: {
    name: "WILDWOOD BOARDWALK",
    ticker: "WILDWOOD BOARDWALK // NEW JERSEY // AFTER DARK",
    src: "assets/wildwood-boardwalk.webp",
  },
  buffet: {
    name: "CHINESE BUFFET · CRAB LEGS",
    ticker: "CRAB-LEG SECTION // ALL YOU CAN EAT // 11PM",
    src: "assets/chinese-buffet.webp",
  },
  cruise: {
    name: "CRUISE-SHIP POOL DECK",
    ticker: "MAIN POOL DECK // DECK 11 // SAILING SOMEWHERE",
    src: "assets/cruise-pool-deck.webp",
  },
  janney: {
    name: "JANNEY STREET VACANT LOT",
    ticker: "JANNEY STREET // VACANT LOT // EARLY DUSK",
    src: "assets/janney-street-vacant-lot.webp",
  },
};

const stageImages = {};
for (const [id, stage] of Object.entries(stages)) {
  const image = new Image();
  image.src = stage.src;
  stageImages[id] = image;
}

const fighterImages = {};
const fighterAtlases = {};
const fighterMoveAtlases = {};
for (const fighter of [...roster, arcadeBoss]) {
  const image = new Image();
  image.src = `assets/fighters/${fighter.id}.webp`;
  fighterImages[fighter.id] = image;
  const atlas = new Image();
  atlas.src = `assets/atlases/${fighter.id}.webp`;
  fighterAtlases[fighter.id] = atlas;
  if (fighter.boss) {
    fighterMoveAtlases[fighter.id] = atlas;
  } else if (getFighterKit(fighter.id)) {
    const moveAtlas = new Image();
    moveAtlas.src = `assets/moves/${fighter.id}-specials.webp`;
    fighterMoveAtlases[fighter.id] = moveAtlas;
  }
}

// Original soundtrack and combat cues generated with the ElevenLabs API. The
// dedicated "Death Blow" announcer call is mixed into the `final` asset.
const audioAssets = {
  select: "assets/audio/ui-select.mp3",
  jump: "assets/audio/jump.mp3",
  light: "assets/audio/light-swing.mp3",
  heavy: "assets/audio/heavy-swing.mp3",
  special: "assets/audio/special-swing.mp3",
  hit: "assets/audio/body-hit.mp3",
  block: "assets/audio/block.mp3",
  finish: "assets/audio/finish-ready.mp3",
  final: "assets/audio/final-blow.mp3",
  ko: "assets/audio/knockout.mp3",
};

const sfxVolumes = {
  select: 0.5,
  jump: 0.42,
  dash: 0.46,
  light: 0.5,
  heavy: 0.58,
  special: 0.65,
  throw: 0.68,
  hit: 0.72,
  "hit-light": 0.66,
  "hit-heavy": 0.76,
  block: 0.62,
  super: 0.86,
  fatal: 0.94,
  finish: 0.78,
  final: 0.92,
  ko: 0.8,
};

function createSfxPool(kind, src) {
  return Array.from({ length: kind.startsWith("hit-") || kind === "hit" ? 5 : 3 }, () => {
    const sample = new Audio(src);
    sample.preload = "auto";
    return sample;
  });
}

const sfxPools = Object.fromEntries(Object.entries(audioAssets).map(([kind, src]) => [
  kind,
  createSfxPool(kind, src),
]));
const sfxCursors = Object.fromEntries(Object.keys(audioAssets).map((kind) => [kind, 0]));
const fighterSfxPools = new Map();
const fighterSfxCursors = new Map();
const fighterAudioAudit = auditFighterAudio();

const fallbackSoundKinds = Object.freeze({
  dash: "jump",
  throw: "heavy",
  "hit-light": "hit",
  "hit-heavy": "hit",
  super: "final",
  fatal: "final",
  "stage-weapon": "select",
});

const musicTracks = [
  { title: "PHILLY AFTER DARK", src: "assets/audio/philly-after-dark.mp3" },
  { title: "VET PARKING LOT", src: "assets/audio/vet-parking-lot.mp3" },
  { title: "NEON SIGN WAR", src: "assets/audio/neon-sign-war.mp3" },
  { title: "SUBWAY AFTER MIDNIGHT", src: "assets/audio/subway-after-midnight.mp3" },
];
let currentTrackIndex = 0;
const fightMusic = new Audio(musicTracks[currentTrackIndex].src);
fightMusic.preload = "auto";
fightMusic.loop = false;
fightMusic.volume = 0.24;
let musicDuckTimer = 0;
let soundCaptionTimer = 0;
let lastSoundEvent = null;
const soundCaptionLabels = Object.freeze({
  select: "MENU CLICK",
  jump: "JUMP",
  dash: "DASH",
  light: "LIGHT SWING",
  heavy: "HEAVY SWING",
  special: "SPECIAL ATTACK",
  throw: "THROW",
  hit: "BODY IMPACT",
  "hit-light": "LIGHT IMPACT",
  "hit-heavy": "HEAVY IMPACT",
  block: "GUARD IMPACT",
  super: "FULL GRIT SUPER",
  fatal: "GRAPHIC FATALITY",
  finish: "FINAL BLOW READY",
  "stage-weapon": "STAGE WEAPON DROPS",
  final: "FINAL BLOW",
  ko: "KNOCKOUT",
  pause: "GAME PAUSED",
  resume: "FIGHT RESUMED",
});

const keys = new Set();
const pressed = new Set();
const touch = new Set();
const previousPads = new Map();
const assignedPadBySide = [null, null];
const commandHistory = [[], []];
const qaInputOverrides = [null, null];

let keyMaps = normalizeKeyMaps(storedJson("final-blow-keymaps", DEFAULT_KEY_MAPS));
let padMap = normalizePadMap(storedJson("final-blow-pad-map", DEFAULT_PAD_MAP));
let pendingKeyBinding = null;

const simulationClock = new FixedStepClock();
// Keep the gameplay seed stable across presentation-only releases so arcade routes,
// AI openings, and rollback baselines do not change when visual content is added.
const initialSeed = hashSeed("FINAL BLOW", "PHILLY AFTER DARK", "1.0e-demo-edition");
const debugRequested = new URLSearchParams(location.search).has("debug");

const state = {
  screen: "title",
  mode: "arcade",
  picks: [0, 1],
  locks: [false, false],
  selectingPlayer: 0,
  stage: "kensington",
  fighters: [],
  particles: [],
  effects: [],
  traps: [],
  projectiles: [],
  rounds: [0, 0],
  round: 1,
  timer: 99,
  timerCarry: 0,
  phase: "idle",
  phaseTime: 0,
  finishWinner: -1,
  finisherType: 0,
  finisher: null,
  // A finisher only fires on a button press that starts after the prompt appears,
  // so the KO-causing attack or a held button can never trigger one.
  finishArmed: [false, false],
  cinematicZoom: 1,
  shake: 0,
  flash: 0,
  hitstop: 0,
  lastRenderTime: performance.now(),
  simulationTick: 0,
  simulationAlpha: 0,
  simulationSteps: 0,
  simulationDroppedSeconds: 0,
  matchSerial: 0,
  matchSeed: initialSeed,
  lastImpactSide: -1,
  rng: new DeterministicRng(initialSeed),
  visualRng: new DeterministicRng(hashSeed(initialSeed, "visual")),
  debug: debugRequested,
  qaManualMode: false,
  audio: null,
  audioUnlocked: false,
  musicDuck: 1,
  paused: false,
  pauseReason: "",
  musicChoice: localStorage.getItem("final-blow-music-choice") || "auto",
  musicVolume: clamp(Number(localStorage.getItem("final-blow-music-volume") ?? "1"), 0, 1),
  sfxVolume: clamp(Number(localStorage.getItem("final-blow-sfx-volume") ?? "1"), 0, 1),
  aiDifficulty: normalizeAiDifficulty(localStorage.getItem("final-blow-ai-difficulty") || DEFAULT_AI_DIFFICULTY),
  arcadeRun: null,
  controlStyle: normalizeControlStyle(localStorage.getItem("final-blow-control-style") || "classic"),
  visualQuality: normalizeVisualQuality(localStorage.getItem("final-blow-visual-quality") || "auto"),
  performance: null,
  soundCaptions: localStorage.getItem("final-blow-sound-captions") !== "0",
  attractEnabled: localStorage.getItem("final-blow-attract-mode") !== "0",
  graphicFatalities: localStorage.getItem("final-blow-graphic-fatalities") !== "0",
  stageWeaponsEnabled: localStorage.getItem("final-blow-stage-weapons") !== "0",
  stageWeapon: null,
  crowd: null,
  // Brief crowd reaction to a big moment, decaying back to normal routes.
  crowdReaction: 0,
  offlineReady: false,
  accessibility: {
    reducedMotion: localStorage.getItem("final-blow-reduced-motion") === "1",
    highContrast: localStorage.getItem("final-blow-high-contrast") === "1",
    colorAssist: localStorage.getItem("final-blow-color-assist") || "standard",
    shakeScale: clamp(Number(localStorage.getItem("final-blow-shake-scale") ?? "1"), 0, 1),
  },
  touchSettings: {
    handedness: localStorage.getItem("final-blow-touch-handedness") || "standard",
    scale: clamp(Number(localStorage.getItem("final-blow-touch-scale") ?? "1"), 0.8, 1.3),
    opacity: clamp(Number(localStorage.getItem("final-blow-touch-opacity") ?? "0.82"), 0.4, 1),
    haptics: localStorage.getItem("final-blow-touch-haptics") !== "0",
  },
  training: createTrainingState(),
};
state.performance = resolvePerformanceProfile(state.visualQuality, performanceEnvironment(state.accessibility.reducedMotion));

let pendingOnlineInvite = parseInvite(location.hash);
const onlineSession = {
  generation: 0,
  role: null,
  roomId: "",
  expiresAt: 0,
  inviteUrl: "",
  signaling: null,
  peer: null,
  stopUiSignal: null,
  peers: new Set(),
  latency: null,
  status: "idle",
  expiryTimer: 0,
  credentials: null,
  reconnectTimer: 0,
  reconnectAttempts: 0,
  reconnecting: false,
  peerGeneration: 0,
  lobby: {
    localFighter: "deathblow",
    remoteFighter: "jez",
    stage: "kensington",
    delayChoice: "auto",
    localReady: false,
    remoteReady: false,
    remoteControlStyle: "classic",
    remoteDelayChoice: "auto",
  },
  matchConfig: null,
  rollback: null,
  matchActive: false,
  networkPaused: false,
  localSuspended: false,
  remoteSuspended: false,
  awaitingResume: false,
  rematchVotes: new Set(),
  remoteChecksums: new Map(),
  checksumMismatches: 0,
  lastChecksumSentFrame: -1,
  lastPersistedFrame: -1,
};

const demoSession = {
  active: false,
  attract: false,
  qa: false,
  director: null,
  cycle: null,
  matches: 0,
  superSide: 0,
  superShown: false,
  resultTimer: 0,
  idleTimer: 0,
};
let fightAnnouncementTimer = 0;

function onlineSnapshot() {
  const rollback = onlineSession.rollback?.metrics() || null;
  const confirmedChecksumFrame = rollback
    ? Math.floor(Math.min(rollback.frame, rollback.confirmedRemoteFrame + 1, rollback.acknowledgedLocalFrame + 1) / 60) * 60
    : 0;
  return {
    role: onlineSession.role,
    roomId: onlineSession.roomId,
    fingerprint: onlineSession.roomId ? roomFingerprint(onlineSession.roomId) : "",
    expiresAt: onlineSession.expiresAt,
    peers: [...onlineSession.peers],
    latency: onlineSession.latency,
    status: onlineSession.status,
    signalingState: onlineSession.signaling?.socket?.readyState ?? -1,
    peer: onlineSession.peer?.snapshot() ?? null,
    lobby: { ...onlineSession.lobby },
    matchConfig: onlineSession.matchConfig ? { ...onlineSession.matchConfig } : null,
    matchActive: onlineSession.matchActive,
    networkPaused: onlineSession.networkPaused,
    reconnecting: onlineSession.reconnecting,
    rollback,
    checksumMismatches: onlineSession.checksumMismatches,
    localChecksum: rollback ? onlineSession.rollback.checksumAt(rollback.frame) : null,
    confirmedChecksumFrame,
    confirmedChecksum: confirmedChecksumFrame > 0 ? onlineSession.rollback.checksumAt(confirmedChecksumFrame) : null,
    lastChecksumSentFrame: onlineSession.lastChecksumSentFrame,
  };
}

function demoSnapshot() {
  return {
    active: demoSession.active,
    attract: demoSession.attract,
    qa: demoSession.qa,
    cycle: demoSession.cycle ? { ...demoSession.cycle, picks: [...demoSession.cycle.picks] } : null,
    matches: demoSession.matches,
    superSide: demoSession.superSide,
    superShown: demoSession.superShown,
    difficulty: DEMO_AI_DIFFICULTY,
    resultScheduled: Boolean(demoSession.resultTimer),
    idleScheduled: Boolean(demoSession.idleTimer),
    director: demoSession.director?.snapshot() || null,
  };
}

function cancelFightAnnouncement() {
  window.clearTimeout(fightAnnouncementTimer);
  fightAnnouncementTimer = 0;
}

function scheduleFightAnnouncement(callback, delay) {
  cancelFightAnnouncement();
  fightAnnouncementTimer = window.setTimeout(() => {
    fightAnnouncementTimer = 0;
    callback();
  }, delay);
}

function clearDemoResultTimer() {
  window.clearTimeout(demoSession.resultTimer);
  demoSession.resultTimer = 0;
}

function clearIdleDemoTimer() {
  window.clearTimeout(demoSession.idleTimer);
  demoSession.idleTimer = 0;
}

function updateDemoUi() {
  const activeFight = demoSession.active && state.mode === "demo" && state.screen === "fight";
  const panel = $("#demoHud");
  panel.hidden = !activeFight;
  if (!demoSession.cycle) return;
  const [firstId, secondId] = demoSession.cycle.picks;
  const first = roster.find(({ id }) => id === firstId);
  const second = roster.find(({ id }) => id === secondId);
  $("#demoHudMatchup").textContent = `${first?.name || firstId} VS ${second?.name || secondId}`;
  $("#demoHudCycle").textContent = `CYCLE ${demoSession.cycle.cycle} · ${stages[demoSession.cycle.stage].name}`;
}

function endDemoSession() {
  clearDemoResultTimer();
  cancelFightAnnouncement();
  demoSession.active = false;
  demoSession.attract = false;
  demoSession.qa = false;
  demoSession.director = null;
  demoSession.cycle = null;
  demoSession.matches = 0;
  demoSession.superSide = 0;
  demoSession.superShown = false;
  document.body.classList.remove("demo-active");
  $("#demoHud").hidden = true;
  $("#demoResultStatus").hidden = true;
  if (state.mode === "demo") state.mode = "arcade";
  if (state.musicChoice !== "auto") setTrack(Number(state.musicChoice), false);
}

function exitDemo() {
  if (!demoSession.active) return false;
  endDemoSession();
  showScreen("title");
  return true;
}

function startNextDemoMatch() {
  if (!demoSession.active || !demoSession.director) return false;
  clearDemoResultTimer();
  cancelFightAnnouncement();
  const cycle = demoSession.director.next();
  const picks = cycle.picks.map((id) => roster.findIndex((fighter) => fighter.id === id));
  if (picks.some((index) => index < 0) || picks[0] === picks[1]) throw new Error("Demo director produced an invalid matchup.");
  demoSession.cycle = cycle;
  demoSession.matches += 1;
  demoSession.superSide = (cycle.cycle - 1) % 2;
  demoSession.superShown = false;
  state.mode = "demo";
  state.arcadeRun = null;
  state.picks = picks;
  state.locks = [true, true];
  state.stage = cycle.stage;
  $("#demoResultStatus").hidden = true;
  startMatch(true);
  state.fighters[demoSession.superSide].meter = GRIT_RULES.maximum;
  updateHud();
  state.qaManualMode = demoSession.qa;
  setTrack(cycle.track, true);
  updateDemoUi();
  announce(`WATCH DEMO · CYCLE ${cycle.cycle}`, `${state.fighters[0].def.name} VS ${state.fighters[1].def.name}`, 1.2);
  return true;
}

function startDemo({ attract = false, qa = false, seed = null } = {}) {
  if (onlineSession.role) disconnectOnline(true);
  if (demoSession.active) endDemoSession();
  clearIdleDemoTimer();
  if (!attract && !qa) {
    enterImmersiveMode();
    unlockAudio();
  }
  demoSession.active = true;
  demoSession.attract = Boolean(attract);
  demoSession.qa = Boolean(qa);
  demoSession.director = createDemoDirector({
    fighterIds: roster.map(({ id }) => id),
    stageIds: Object.keys(stages),
    trackCount: musicTracks.length,
    seed: seed ?? hashSeed(Date.now(), performance.now(), state.rng.nextUint32()),
  });
  document.body.classList.add("demo-active");
  startNextDemoMatch();
  return demoSnapshot();
}

function scheduleNextDemoMatch() {
  if (!demoSession.active) return;
  clearDemoResultTimer();
  $("#demoResultStatus").hidden = false;
  demoSession.resultTimer = window.setTimeout(() => {
    demoSession.resultTimer = 0;
    startNextDemoMatch();
  }, DEMO_RESULT_HOLD_MS);
}

function scheduleIdleDemo() {
  clearIdleDemoTimer();
  if (!state.attractEnabled || demoSession.active || state.screen !== "title" || document.hidden) return;
  demoSession.idleTimer = window.setTimeout(() => {
    demoSession.idleTimer = 0;
    if (state.attractEnabled && state.screen === "title" && !document.hidden && !$("#controlsDialog").open) startDemo({ attract: true });
  }, DEMO_IDLE_DELAY_MS);
}

function noteUserActivity() {
  if (demoSession.active) return exitDemo();
  if (state.screen === "title") scheduleIdleDemo();
  return false;
}

function setOnlineStatus(kind, detail) {
  const titles = {
    idle: "ROOM SYSTEM READY",
    signaling: "SIGNALING LOCKED",
    waiting: "PRIVATE ROOM OPEN",
    connecting: "NEGOTIATING P2P",
    connected: "DIRECT LINK READY",
    error: "LINK ERROR",
    closed: "ROOM CLOSED",
  };
  onlineSession.status = kind;
  const panel = $("#onlineStatus");
  panel.className = `online-status ${kind}`;
  $("#onlineStatusTitle").textContent = titles[kind] || "PRIVATE ROOM";
  $("#onlineStatusDetail").textContent = detail || "Create a room or open a private invite.";
}

function setOnlineError(message = "") {
  const node = $("#onlineError");
  node.textContent = message;
  node.hidden = !message;
}

function updateOnlineSeats() {
  const hostPresent = onlineSession.role === "host" || onlineSession.peers.has("host");
  const guestPresent = onlineSession.role === "guest" || onlineSession.peers.has("guest");
  for (const [role, present] of [["host", hostPresent], ["guest", guestPresent]]) {
    const node = $(`#online${role[0].toUpperCase()}${role.slice(1)}Seat`);
    node.classList.toggle("occupied", present);
    node.querySelector("em").textContent = present ? (onlineSession.role === role ? "YOU" : "CONNECTED") : "WAITING";
  }
}

const ONLINE_RESUME_KEY = "final-blow-online-resume-v1";
const onlineFighterIds = new Set(roster.map(({ id }) => id));

function onlineLocalSide() {
  return onlineSession.role === "guest" ? 1 : 0;
}

function onlineRemoteRole() {
  return onlineSession.role === "host" ? "guest" : "host";
}

function safeSessionWrite(value) {
  try {
    if (value === null) sessionStorage.removeItem(ONLINE_RESUME_KEY);
    else sessionStorage.setItem(ONLINE_RESUME_KEY, JSON.stringify(value));
  } catch {
    // Private browsing can deny session storage; the in-memory room remains usable.
  }
}

function persistOnlineResume(includeState = false) {
  if (!onlineSession.credentials || !onlineSession.roomId) return;
  const resume = {
    credentials: onlineSession.credentials,
    inviteUrl: onlineSession.inviteUrl,
    lobby: onlineSession.lobby,
    matchConfig: onlineSession.matchConfig,
    matchActive: onlineSession.matchActive,
    screen: state.screen,
    savedAt: Date.now(),
  };
  if (includeState && onlineSession.rollback && state.screen === "fight") {
    const sync = onlineSession.rollback.exportSync();
    resume.rollback = { frame: sync.frame, state: serializeRollbackState(sync.state) };
  }
  safeSessionWrite(resume);
}

function readOnlineResume() {
  try {
    const value = JSON.parse(sessionStorage.getItem(ONLINE_RESUME_KEY));
    if (!value?.credentials?.roomId || !value.credentials.token) return null;
    if (Number(value.credentials.expiresAt) <= Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}

function setOnlineInterruption(visible, title = "RECONNECTING", detail = "Holding the match while the encrypted link returns…") {
  const panel = $("#onlineInterruption");
  panel.hidden = !visible;
  $("#onlineInterruptionTitle").textContent = title;
  $("#onlineInterruptionDetail").textContent = detail;
}

function updateOnlineHud(kind = "sync") {
  const panel = $("#onlineHud");
  const metrics = onlineSession.rollback?.metrics();
  panel.hidden = !(state.mode === "online" && ["fight", "result"].includes(state.screen));
  panel.classList.toggle("warning", kind === "warning" || onlineSession.networkPaused);
  panel.classList.toggle("error", kind === "error");
  $("#onlineHudState").textContent = onlineSession.networkPaused ? "LINK HOLD"
    : kind === "error" ? "DESYNC"
      : kind === "warning" ? "PREDICTING" : "ROLLBACK SYNC";
  $("#onlineHudPing").textContent = onlineSession.latency === null ? "— MS" : `${onlineSession.latency} MS`;
  $("#onlineHudDelay").textContent = `${metrics?.inputDelay ?? onlineSession.matchConfig?.inputDelay ?? 0}F DELAY`;
  $("#onlineHudRollbacks").textContent = `${metrics?.rollbacks || 0} RB`;
}

function updateOnlineMatchSetup() {
  const connected = Boolean(onlineSession.peer?.connected);
  const setup = $("#onlineMatchSetup");
  setup.hidden = !connected || onlineSession.matchActive;
  if (!connected) return;
  const lobby = onlineSession.lobby;
  $("#onlineFighterSelect").value = lobby.localFighter;
  $("#onlineOpponentFighter").textContent = onlineFighterIds.has(lobby.remoteFighter)
    ? roster.find(({ id }) => id === lobby.remoteFighter).name
    : "CHOOSING…";
  $("#onlineStageSelect").value = lobby.stage;
  $("#onlineStageSelect").disabled = onlineSession.role !== "host";
  $("#onlineDelaySelect").value = lobby.delayChoice;
  const readyButton = $("#onlineReadyButton");
  readyButton.disabled = !connected;
  readyButton.textContent = lobby.localReady ? "READY LOCKED · CANCEL" : "READY FOR ROLLBACK";
  setup.classList.toggle("ready", lobby.localReady && lobby.remoteReady);
  $("#onlineMatchStatus").textContent = lobby.localReady && lobby.remoteReady
    ? onlineSession.role === "host" ? "BOTH READY · LAUNCHING MATCH" : "BOTH READY · HOST IS LAUNCHING"
    : lobby.localReady ? "YOU ARE READY · WAITING FOR OPPONENT"
      : lobby.remoteReady ? "OPPONENT READY · LOCK YOUR FIGHTER" : "CHOOSE, TUNE DELAY, THEN READY UP";
}

function sendOnlineControl(message) {
  return onlineSession.peer?.sendControl({ protocol: "final-blow-1.0d", ...message }) || false;
}

function sendOnlineLobbyState() {
  if (!onlineSession.peer?.connected) return false;
  const lobby = onlineSession.lobby;
  return sendOnlineControl({
    type: "lobby-state",
    fighter: lobby.localFighter,
    stage: lobby.stage,
    delayChoice: lobby.delayChoice,
    controlStyle: state.controlStyle,
    ready: lobby.localReady,
  });
}

function tickOnlineExpiry() {
  if (!onlineSession.expiresAt) return;
  const remaining = Math.max(0, onlineSession.expiresAt - Date.now());
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  $("#onlineExpiry").textContent = `EXPIRES IN ${minutes}:${String(seconds).padStart(2, "0")}`;
  if (remaining === 0) {
    if (onlineSession.peer?.connected) {
      $("#onlineExpiry").textContent = "SIGNALING EXPIRED · P2P ACTIVE";
      return;
    }
    disconnectOnline(false);
    setOnlineStatus("closed", "This private room expired. Create a new room to continue.");
  }
}

function resetOnlineUi() {
  $("#onlineActions").hidden = false;
  $("#onlineRoomDetails").hidden = true;
  $("#onlineCreateButton").disabled = false;
  $("#onlineJoinButton").disabled = false;
  $("#onlineInviteLink").value = "";
  $("#onlineInviteInput").value = "";
  $("#onlineCopyButton").hidden = false;
  $("#onlineLatency").textContent = "NEGOTIATING";
  $("#onlineMatchSetup").hidden = true;
  $("#onlineRematchStatus").hidden = true;
  $("#onlineHud").hidden = true;
  setOnlineInterruption(false);
  setOnlineError();
  updateOnlineSeats();
}

function disconnectOnline(resetStatus = true, { clearStored = true } = {}) {
  onlineSession.generation += 1;
  onlineSession.peerGeneration += 1;
  if (onlineSession.expiryTimer) clearInterval(onlineSession.expiryTimer);
  if (onlineSession.reconnectTimer) clearTimeout(onlineSession.reconnectTimer);
  onlineSession.expiryTimer = 0;
  onlineSession.reconnectTimer = 0;
  onlineSession.stopUiSignal?.();
  onlineSession.stopUiSignal = null;
  onlineSession.peer?.close();
  onlineSession.signaling?.close();
  onlineSession.peer = null;
  onlineSession.signaling = null;
  onlineSession.role = null;
  onlineSession.roomId = "";
  onlineSession.expiresAt = 0;
  onlineSession.inviteUrl = "";
  onlineSession.peers.clear();
  onlineSession.latency = null;
  onlineSession.credentials = null;
  onlineSession.reconnectAttempts = 0;
  onlineSession.reconnecting = false;
  onlineSession.rollback = null;
  onlineSession.matchConfig = null;
  onlineSession.matchActive = false;
  onlineSession.networkPaused = false;
  onlineSession.localSuspended = false;
  onlineSession.remoteSuspended = false;
  onlineSession.awaitingResume = false;
  onlineSession.rematchVotes.clear();
  onlineSession.remoteChecksums.clear();
  onlineSession.checksumMismatches = 0;
  onlineSession.lastChecksumSentFrame = -1;
  onlineSession.lastPersistedFrame = -1;
  onlineSession.lobby.localReady = false;
  onlineSession.lobby.remoteReady = false;
  if (clearStored) safeSessionWrite(null);
  resetOnlineUi();
  if (resetStatus) setOnlineStatus("idle", "Create a room or open a private invite.");
}

function renderOnlineRoom() {
  $("#onlineActions").hidden = true;
  $("#onlineRoomDetails").hidden = false;
  $("#onlineFingerprint").textContent = roomFingerprint(onlineSession.roomId);
  $("#onlineInviteLink").value = onlineSession.role === "host" ? onlineSession.inviteUrl : "PRIVATE INVITE AUTHENTICATED";
  $("#onlineCopyButton").hidden = onlineSession.role !== "host";
  updateOnlineSeats();
  updateOnlineMatchSetup();
  tickOnlineExpiry();
}

function receiveOnlineSignal(message) {
  if (message.type === "welcome") {
    onlineSession.expiresAt = Number(message.expiresAt) || onlineSession.expiresAt;
    if (onlineSession.credentials) onlineSession.credentials.expiresAt = onlineSession.expiresAt;
    onlineSession.peers = new Set((message.peers || []).filter((role) => role === "host" || role === "guest"));
    updateOnlineSeats();
    tickOnlineExpiry();
    persistOnlineResume(false);
  } else if (message.type === "peer" && ["host", "guest"].includes(message.role)) {
    if (message.state === "joined") onlineSession.peers.add(message.role);
    else onlineSession.peers.delete(message.role);
    updateOnlineSeats();
  }
}

function scheduleOnlineReconnect(detail = "Encrypted peer link interrupted.") {
  if (onlineSession.reconnecting || !onlineSession.credentials || Date.now() >= onlineSession.expiresAt) return;
  onlineSession.reconnecting = true;
  onlineSession.networkPaused = onlineSession.matchActive;
  onlineSession.reconnectAttempts += 1;
  setOnlineInterruption(onlineSession.matchActive, "RECONNECTING", `${detail} · ATTEMPT ${onlineSession.reconnectAttempts} / 5`);
  updateOnlineHud("warning");
  setOnlineStatus("connecting", `Reconnecting encrypted seat · attempt ${onlineSession.reconnectAttempts} / 5…`);
  if (onlineSession.reconnectAttempts > 5) {
    setOnlineInterruption(true, "LINK LOST", "The room could not reconnect. Return to the title and create a new invite.");
    setOnlineStatus("error", "Reconnect window exhausted.");
    return;
  }
  onlineSession.peerGeneration += 1;
  onlineSession.stopUiSignal?.();
  onlineSession.stopUiSignal = null;
  onlineSession.peer?.close();
  onlineSession.signaling?.close();
  onlineSession.peer = null;
  onlineSession.signaling = null;
  onlineSession.reconnectTimer = setTimeout(async () => {
    onlineSession.reconnectTimer = 0;
    try {
      await connectOnlineTransport();
    } catch (error) {
      onlineSession.reconnecting = false;
      scheduleOnlineReconnect(error instanceof Error ? error.message : "Reconnect failed.");
    }
  }, 450 + onlineSession.reconnectAttempts * 350);
}

function beginOnlineResumeHandshake() {
  if (!onlineSession.matchActive || !onlineSession.rollback) return;
  onlineSession.networkPaused = true;
  onlineSession.awaitingResume = true;
  setOnlineInterruption(true, "RESYNCHRONIZING", "Verifying the deterministic match state…");
  const metrics = onlineSession.rollback.metrics();
  sendOnlineControl({
    type: "resume-hello",
    matchId: onlineSession.matchConfig?.matchId,
    frame: metrics.frame,
    checksum: onlineSession.rollback.checksumAt(metrics.frame),
  });
  updateOnlineHud("warning");
}

async function connectOnlineTransport() {
  const credentials = onlineSession.credentials;
  if (!credentials) throw new Error("Private room credentials are unavailable.");
  const generation = onlineSession.generation;
  const peerGeneration = ++onlineSession.peerGeneration;
  const signaling = await connectPrivateRoom(credentials);
  if (generation !== onlineSession.generation || peerGeneration !== onlineSession.peerGeneration) {
    signaling.close();
    return;
  }
  onlineSession.signaling = signaling;
  onlineSession.peer = new FinalBlowPeer({
    role: onlineSession.role,
    signaling,
    onStatus(kind, detail) {
      if (generation !== onlineSession.generation || peerGeneration !== onlineSession.peerGeneration) return;
      if (kind === "connected") {
        onlineSession.reconnectAttempts = 0;
        onlineSession.reconnecting = false;
        onlineSession.peers.add(onlineRemoteRole());
        setOnlineStatus("connected", onlineSession.matchActive ? "Direct link restored. Verifying rollback state…" : detail);
        updateOnlineSeats();
        updateOnlineMatchSetup();
        if (onlineSession.matchActive) beginOnlineResumeHandshake();
        else sendOnlineLobbyState();
        persistOnlineResume(false);
        return;
      }
      if (["error", "closed"].includes(kind) || (kind === "waiting" && onlineSession.matchActive)) {
        scheduleOnlineReconnect(detail);
        return;
      }
      setOnlineStatus(kind, detail);
    },
    onLatency(milliseconds) {
      if (generation !== onlineSession.generation || peerGeneration !== onlineSession.peerGeneration) return;
      onlineSession.latency = milliseconds;
      $("#onlineLatency").textContent = `${milliseconds} MS · ENCRYPTED`;
      updateOnlineHud();
    },
    onControl(message) {
      if (generation !== onlineSession.generation || peerGeneration !== onlineSession.peerGeneration) return;
      receiveOnlineControl(message);
    },
    onInput(packet) {
      if (generation !== onlineSession.generation || peerGeneration !== onlineSession.peerGeneration) return;
      receiveOnlineInput(packet);
    },
  });
  onlineSession.stopUiSignal = signaling.onMessage(receiveOnlineSignal);
  signaling.onClose(({ code, reason }) => {
    if (generation !== onlineSession.generation || peerGeneration !== onlineSession.peerGeneration) return;
    if (onlineSession.peer?.connected) return;
    if (code === 4001) setOnlineStatus("closed", "Private signaling room expired.");
    else scheduleOnlineReconnect(reason || "Private room signaling closed.");
  });
}

async function beginOnlineConnection({ roomId, role, token, guestToken = "", expiresAt = 0 }) {
  disconnectOnline(false, { clearStored: false });
  state.mode = "online";
  onlineSession.role = role;
  onlineSession.roomId = roomId;
  onlineSession.expiresAt = Number(expiresAt) || Date.now() + 15 * 60_000;
  onlineSession.inviteUrl = role === "host" ? buildInviteUrl({ roomId, guestToken }) : "";
  onlineSession.credentials = { roomId, role, token, guestToken, expiresAt: onlineSession.expiresAt };
  onlineSession.lobby.localFighter = role === "host" ? "deathblow" : "jez";
  onlineSession.lobby.remoteFighter = role === "host" ? "jez" : "deathblow";
  onlineSession.lobby.localReady = false;
  onlineSession.lobby.remoteReady = false;
  onlineSession.peers.add(role);
  renderOnlineRoom();
  setOnlineError();
  setOnlineStatus("signaling", "Authenticating the private room seat…");
  persistOnlineResume(false);
  try {
    await connectOnlineTransport();
    onlineSession.expiryTimer = setInterval(tickOnlineExpiry, 1000);
  } catch (error) {
    onlineSession.peer?.close();
    onlineSession.signaling?.close();
    onlineSession.peer = null;
    onlineSession.signaling = null;
    const message = error instanceof Error ? error.message : "Could not open private room.";
    setOnlineError(message);
    setOnlineStatus("error", message);
    if (!onlineSession.reconnecting) scheduleOnlineReconnect(message);
  }
}

async function resumeStoredOnlineConnection(resume) {
  const credentials = resume?.credentials;
  if (!credentials || !["host", "guest"].includes(credentials.role)) return false;
  disconnectOnline(false, { clearStored: false });
  state.mode = "online";
  onlineSession.role = credentials.role;
  onlineSession.roomId = credentials.roomId;
  onlineSession.expiresAt = Number(credentials.expiresAt) || 0;
  onlineSession.credentials = cloneRollbackValue(credentials);
  onlineSession.inviteUrl = credentials.role === "host" ? String(resume.inviteUrl || "") : "";
  Object.assign(onlineSession.lobby, resume.lobby || {});
  onlineSession.peers.add(credentials.role);
  if (resume.matchActive && validOnlineMatchConfig(resume.matchConfig)) {
    startOnlineMatch(resume.matchConfig);
    if (resume.rollback?.state && Number.isInteger(resume.rollback.frame)) {
      onlineSession.rollback.importSync({
        frame: resume.rollback.frame,
        state: parseRollbackState(resume.rollback.state),
      });
      syncRollbackPresentation();
    }
    if (resume.screen === "result") {
      const winner = state.rounds[0] > state.rounds[1] ? 0 : 1;
      showResult(winner);
    }
    onlineSession.networkPaused = true;
    onlineSession.reconnecting = true;
    setOnlineInterruption(true, "RESTORING MATCH", "Reopening the private seat and requesting verified host state…");
  } else {
    showScreen("online");
    renderOnlineRoom();
  }
  setOnlineStatus("connecting", "Restoring the private room seat…");
  try {
    await connectOnlineTransport();
    onlineSession.expiryTimer = setInterval(tickOnlineExpiry, 1000);
    return true;
  } catch (error) {
    onlineSession.reconnecting = false;
    scheduleOnlineReconnect(error instanceof Error ? error.message : "Stored room reconnect failed.");
    return false;
  }
}

function openOnlineLobby() {
  enterImmersiveMode();
  unlockAudio();
  state.mode = "online";
  showScreen("online");
  if (pendingOnlineInvite) {
    $("#onlineInviteInput").value = location.href;
    setOnlineStatus("waiting", "Private invite detected. Press Join Private Room.");
  }
}

async function createOnlineRoom() {
  setOnlineError();
  $("#onlineCreateButton").disabled = true;
  setOnlineStatus("connecting", "Creating an expiring two-seat room…");
  try {
    const room = await createPrivateRoom();
    await beginOnlineConnection({
      roomId: room.roomId,
      role: "host",
      token: room.hostToken,
      guestToken: room.guestToken,
      expiresAt: room.expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create private room.";
    setOnlineError(message);
    setOnlineStatus("error", message);
    $("#onlineCreateButton").disabled = false;
  }
}

async function joinOnlineRoom() {
  setOnlineError();
  const credentials = parseInvite($("#onlineInviteInput").value) || parseInvite(location.hash);
  if (!credentials) {
    setOnlineError("Paste the complete private invite link. A room fingerprint alone cannot unlock a seat.");
    setOnlineStatus("error", "Private invite missing its secure key.");
    return;
  }
  $("#onlineJoinButton").disabled = true;
  pendingOnlineInvite = null;
  scrubInviteFromAddress();
  await beginOnlineConnection(credentials);
}

async function copyOnlineInvite() {
  if (!onlineSession.inviteUrl) return;
  try {
    await navigator.clipboard.writeText(onlineSession.inviteUrl);
  } catch {
    const field = $("#onlineInviteLink");
    field.select();
    document.execCommand("copy");
  }
  const button = $("#onlineCopyButton");
  button.textContent = "COPIED";
  setTimeout(() => { button.textContent = "COPY"; }, 1200);
}

function delayChoiceFrames(choice) {
  return choice === "auto"
    ? recommendedInputDelay(onlineSession.latency || 70)
    : normalizeInputDelay(choice);
}

function makeOnlineMatchConfig({ rematch = false } = {}) {
  if (onlineSession.role !== "host") return null;
  const lobby = onlineSession.lobby;
  const seedBytes = new Uint32Array(1);
  crypto.getRandomValues(seedBytes);
  return {
    version: 1,
    matchId: crypto.randomUUID(),
    seed: seedBytes[0] || 237,
    picks: [lobby.localFighter, lobby.remoteFighter],
    stage: stages[lobby.stage] ? lobby.stage : "kensington",
    inputDelay: Math.max(delayChoiceFrames(lobby.delayChoice), delayChoiceFrames(lobby.remoteDelayChoice)),
    controlStyles: [state.controlStyle, lobby.remoteControlStyle],
    rematch: Boolean(rematch),
  };
}

function validOnlineMatchConfig(config) {
  return Boolean(
    config
    && config.version === 1
    && typeof config.matchId === "string"
    && config.matchId.length >= 12
    && Number.isInteger(config.seed)
    && config.picks?.length === 2
    && config.picks.every((id) => onlineFighterIds.has(id))
    && stages[config.stage]
    && Number.isInteger(config.inputDelay)
    && config.inputDelay >= 0
    && config.inputDelay <= 4
    && config.controlStyles?.length === 2,
  );
}

function maybeLaunchOnlineMatch() {
  if (onlineSession.role !== "host" || onlineSession.matchActive) return;
  if (!onlineSession.lobby.localReady || !onlineSession.lobby.remoteReady) return;
  const config = makeOnlineMatchConfig();
  if (!config) return;
  sendOnlineControl({ type: "match-start", config });
  startOnlineMatch(config);
}

function toggleOnlineReady() {
  if (!onlineSession.peer?.connected || onlineSession.matchActive) return;
  onlineSession.lobby.localReady = !onlineSession.lobby.localReady;
  sendOnlineLobbyState();
  updateOnlineMatchSetup();
  persistOnlineResume(false);
  maybeLaunchOnlineMatch();
}

function updateOnlineRematchUi() {
  const node = $("#onlineRematchStatus");
  const visible = state.mode === "online" && state.screen === "result";
  node.hidden = !visible;
  if (!visible) return;
  node.textContent = `REMATCH VOTES · ${onlineSession.rematchVotes.size} / 2`;
  $("#rematchButton").textContent = onlineSession.rematchVotes.has(onlineSession.role)
    ? "REMATCH REQUESTED" : onlineSession.rematchVotes.has(onlineRemoteRole()) ? "ACCEPT REMATCH" : "REQUEST REMATCH";
}

function maybeLaunchOnlineRematch() {
  if (onlineSession.role !== "host" || onlineSession.rematchVotes.size < 2) return;
  const config = makeOnlineMatchConfig({ rematch: true });
  if (!config) return;
  sendOnlineControl({ type: "match-start", config });
  startOnlineMatch(config);
}

function requestOnlineRematch() {
  if (state.mode !== "online" || state.screen !== "result" || !onlineSession.peer?.connected) return;
  onlineSession.rematchVotes.add(onlineSession.role);
  sendOnlineControl({ type: "rematch-vote", matchId: onlineSession.matchConfig?.matchId });
  updateOnlineRematchUi();
  maybeLaunchOnlineRematch();
}

function compareOnlineChecksum(frame, remoteChecksum) {
  const rollback = onlineSession.rollback;
  if (!rollback || typeof remoteChecksum !== "string") return;
  const localChecksum = rollback.checksumAt(frame);
  if (!localChecksum) {
    onlineSession.remoteChecksums.set(frame, remoteChecksum);
    return;
  }
  onlineSession.remoteChecksums.delete(frame);
  if (localChecksum === remoteChecksum) {
    onlineSession.checksumMismatches = 0;
    updateOnlineHud();
    return;
  }
  onlineSession.checksumMismatches += 1;
  updateOnlineHud("error");
  sendOnlineControl({ type: "desync-warning", matchId: onlineSession.matchConfig?.matchId, frame });
  if (onlineSession.role === "host" && onlineSession.checksumMismatches >= 2) sendAuthoritativeOnlineState("desync");
}

function checkPendingOnlineChecksums() {
  for (const [frame, checksum] of onlineSession.remoteChecksums) compareOnlineChecksum(frame, checksum);
}

function sendAuthoritativeOnlineState(reason = "reconnect") {
  if (onlineSession.role !== "host" || !onlineSession.rollback || !onlineSession.peer?.connected) return false;
  onlineSession.networkPaused = true;
  onlineSession.awaitingResume = true;
  setOnlineInterruption(true, reason === "desync" ? "SYNC REPAIR" : "RESYNCHRONIZING", "Transferring the host's verified deterministic state…");
  const sync = onlineSession.rollback.exportSync();
  const sent = sendOnlineControl({
    type: "state-sync",
    reason,
    matchId: onlineSession.matchConfig?.matchId,
    frame: sync.frame,
    state: serializeRollbackState(sync.state),
  });
  updateOnlineHud("warning");
  return sent;
}

function completeOnlineResume() {
  onlineSession.awaitingResume = false;
  onlineSession.reconnecting = false;
  onlineSession.localSuspended = !state.qaManualMode
    && (document.hidden || document.body.classList.contains("orientation-blocked"));
  onlineSession.networkPaused = onlineSession.localSuspended || onlineSession.remoteSuspended;
  onlineSession.checksumMismatches = 0;
  onlineSession.remoteChecksums.clear();
  refreshOnlinePauseOverlay();
  persistOnlineResume(true);
}

function refreshOnlinePauseOverlay() {
  if (!onlineSession.matchActive) return;
  const suspended = onlineSession.localSuspended || onlineSession.remoteSuspended;
  onlineSession.networkPaused = onlineSession.reconnecting || onlineSession.awaitingResume || suspended;
  if (suspended) setOnlineInterruption(true, "MATCH HOLD", onlineSession.localSuspended
    ? state.pauseReason || "Return to landscape play to resume both fighters."
    : "The other fighter is restoring the arena view…");
  else if (!onlineSession.networkPaused) setOnlineInterruption(false);
  updateOnlineHud(onlineSession.networkPaused ? "warning" : "sync");
}

function setOnlineLocalSuspended(suspended) {
  if (!onlineSession.matchActive || onlineSession.localSuspended === Boolean(suspended)) return;
  onlineSession.localSuspended = Boolean(suspended);
  sendOnlineControl({ type: "peer-suspend", matchId: onlineSession.matchConfig?.matchId, suspended: onlineSession.localSuspended });
  refreshOnlinePauseOverlay();
}

function receiveOnlineControl(message) {
  if (!message || typeof message !== "object") return;
  if (message.type === "lobby-state" && !onlineSession.matchActive) {
    if (onlineFighterIds.has(message.fighter)) onlineSession.lobby.remoteFighter = message.fighter;
    if (onlineSession.role === "guest" && stages[message.stage]) onlineSession.lobby.stage = message.stage;
    onlineSession.lobby.remoteDelayChoice = ["auto", "0", "1", "2", "3", "4"].includes(String(message.delayChoice))
      ? String(message.delayChoice) : "auto";
    onlineSession.lobby.remoteControlStyle = normalizeControlStyle(message.controlStyle);
    onlineSession.lobby.remoteReady = Boolean(message.ready);
    updateOnlineMatchSetup();
    maybeLaunchOnlineMatch();
    return;
  }
  if (message.type === "match-start" && onlineSession.role === "guest" && validOnlineMatchConfig(message.config)) {
    startOnlineMatch(message.config);
    return;
  }
  if (!onlineSession.matchConfig || message.matchId !== onlineSession.matchConfig.matchId) return;
  if (message.type === "checksum" && Number.isInteger(message.frame)) {
    compareOnlineChecksum(message.frame, message.checksum);
  } else if (message.type === "desync-warning" && onlineSession.role === "host") {
    onlineSession.checksumMismatches += 1;
    if (onlineSession.checksumMismatches >= 2) sendAuthoritativeOnlineState("desync");
  } else if (message.type === "resume-hello") {
    if (onlineSession.role === "host") sendAuthoritativeOnlineState("reconnect");
    else beginOnlineResumeHandshake();
  } else if (message.type === "state-sync" && onlineSession.role === "guest"
    && Number.isInteger(message.frame) && typeof message.state === "string") {
    try {
      onlineSession.networkPaused = true;
      onlineSession.rollback.importSync({ frame: message.frame, state: parseRollbackState(message.state) });
      syncRollbackPresentation();
      sendOnlineControl({ type: "state-sync-ack", matchId: message.matchId, frame: message.frame });
    } catch {
      scheduleOnlineReconnect("Authoritative state transfer failed.");
    }
  } else if (message.type === "state-sync-ack" && onlineSession.role === "host") {
    sendOnlineControl({ type: "state-sync-go", matchId: message.matchId, frame: onlineSession.rollback?.frame || 0 });
    completeOnlineResume();
  } else if (message.type === "state-sync-go" && onlineSession.role === "guest") {
    completeOnlineResume();
  } else if (message.type === "rematch-vote" && state.screen === "result") {
    onlineSession.rematchVotes.add(onlineRemoteRole());
    updateOnlineRematchUi();
    maybeLaunchOnlineRematch();
  } else if (message.type === "peer-suspend") {
    onlineSession.remoteSuspended = Boolean(message.suspended);
    refreshOnlinePauseOverlay();
  }
}

function receiveOnlineInput(packet) {
  if (!onlineSession.matchActive || !onlineSession.rollback) return;
  try {
    const result = onlineSession.rollback.receivePacket(packet);
    if (!result.accepted) return;
    checkPendingOnlineChecksums();
    updateOnlineHud(result.rolledBack ? "warning" : "sync");
  } catch {
    onlineSession.checksumMismatches += 1;
    updateOnlineHud("error");
  }
}

function random() {
  return state.rng.nextFloat();
}

function visualRandom() {
  return state.visualRng.nextFloat();
}

function seedMatch(round = state.round) {
  state.matchSeed = hashSeed(
    initialSeed,
    state.matchSerial,
    round,
    state.picks[0],
    state.picks[1],
    state.stage,
    state.arcadeRun?.current || 0,
    currentArcadeMatch(state.arcadeRun)?.opponentId || "versus",
  );
  state.rng.setState(state.matchSeed);
  state.visualRng.setState(hashSeed(state.matchSeed, "visual"));
}

function seedOnlineRound(round = state.round) {
  state.matchSeed = hashSeed("FINAL-BLOW-ONLINE", onlineSession.matchConfig?.seed || 237, round);
  state.rng.setState(state.matchSeed);
  state.visualRng.setState(hashSeed(state.matchSeed, "visual"));
}

function makeFighter(index, side, overrideDef = null) {
  const def = overrideDef || roster[index];
  const kitId = def.kitId || def.id;
  const kit = getFighterKit(kitId);
  const movement = getFighterMovement(kitId, MOVEMENT_RULES);
  return {
    def,
    kitId,
    kit,
    movement: def.boss ? {
      ...movement,
      walkForward: movement.walkForward * 1.04,
      walkBack: movement.walkBack * 1.04,
      dashSpeed: movement.dashSpeed * 1.03,
    } : movement,
    side,
    x: side === 0 ? 355 : 925,
    y: FLOOR,
    vx: 0,
    vy: 0,
    width: Math.round(92 * FIGHTER_SCALE),
    height: Math.round(196 * FIGHTER_SCALE),
    facing: side === 0 ? 1 : -1,
    health: 100,
    meter: 0,
    grounded: true,
    crouch: false,
    block: false,
    guarding: false,
    guardHeight: "high",
    attacking: null,
    attackTime: 0,
    attackFrame: 0,
    attackHit: false,
    attackHits: 0,
    attackSerial: 0,
    lastAttackHitFrame: -Infinity,
    lastDamageFrame: -Infinity,
    attackConnected: "",
    armorHits: 0,
    counterTriggered: false,
    trapDeployed: false,
    projectileSpawnFrames: new Set(),
    rhythmStacks: 0,
    rhythmExpiresFrame: 0,
    rhythmLastAttackSerial: -1,
    cancelledFrom: "",
    linkedFrom: "",
    linkWindow: null,
    confirmWindowFrames: 0,
    juggleCount: 0,
    combo: new ComboTracker(),
    stun: 0,
    hitstunFrames: 0,
    blockstunFrames: 0,
    knockdownFrames: 0,
    wakeupFrames: 0,
    invulnerableFrames: 0,
    reversalWindowFrames: 0,
    throwInvulnerableFrames: 0,
    pendingKnockdown: false,
    landingRecoveryFrames: 0,
    dashFrames: 0,
    dashCooldownFrames: 0,
    dashDirection: 0,
    queuedDashDirection: 0,
    directionTapTracker: new DirectionTapTracker(),
    previousDirectionalInput: { left: false, right: false },
    justWoke: false,
    throwTechFlashFrames: 0,
    // Personal throwable ammunition, refreshed at the start of every round.
    throwableUses: throwableUses(kitId),
    throwableSpawned: false,
    carriedWeapon: null,
    carryFrames: 0,
    slowFrames: 0,
    // Dizzy meter and its deterministic decay / recovery / immunity clocks.
    stunMeter: 0,
    stunDecayDelay: 0,
    dizzyFrames: 0,
    dizzyTotalFrames: 0,
    stunImmuneFrames: 0,
    dizzyMashCount: 0,
    // Live grab sequence state. `grabbing` is set on the thrower and `grabbed` on
    // the victim; both are plain data so rollback snapshots clone them directly.
    grabbing: null,
    grabbed: null,
    lastThrowInputFrame: -Infinity,
    lastHitResult: "",
    hitFlash: 0,
    specialGlow: 0,
    animTime: visualRandom() * 2,
    walkTime: visualRandom(),
    cinematicFrame: null,
    cinematicRotation: 0,
    cinematicScale: 1,
    down: false,
    aiClock: 0,
    aiBrain: createAiBrain(state.mode === "demo" ? DEMO_AI_DIFFICULTY : state.aiDifficulty),
    combatState: FIGHTER_STATES.IDLE,
    previousCombatState: FIGHTER_STATES.IDLE,
    stateFrame: 0,
    stateEnteredTick: state.simulationTick,
    inputBuffer: new FrameInputBuffer(DEFAULT_INPUT_BUFFER_FRAMES),
  };
}

let rollbackResimulating = false;
const rollbackFighterReferences = new Set(["def", "kit", "movement", "combo", "directionTapTracker", "inputBuffer", "projectileSpawnFrames"]);
const rollbackPresentationFighterFields = new Set([
  "animTime", "walkTime", "hitFlash", "specialGlow", "cinematicFrame", "cinematicRotation", "cinematicScale", "lastHitResult",
]);

function cloneRollbackValue(value) {
  return structuredClone(value);
}

function saveRollbackFighter(fighter) {
  const values = {};
  for (const [key, value] of Object.entries(fighter)) {
    if (!rollbackFighterReferences.has(key)) values[key] = cloneRollbackValue(value);
  }
  return {
    id: fighter.def.id,
    values,
    combo: {
      hits: fighter.combo.hits,
      totalDamage: fighter.combo.totalDamage,
      active: fighter.combo.active,
      startedFrame: fighter.combo.startedFrame,
      lastHitFrame: fighter.combo.lastHitFrame,
      displayUntilFrame: fighter.combo.displayUntilFrame,
      peakHits: fighter.combo.peakHits,
    },
    directionTaps: fighter.directionTapTracker.snapshot(),
    inputBuffer: fighter.inputBuffer.snapshot(),
    projectileSpawnFrames: [...fighter.projectileSpawnFrames],
  };
}

function restoreRollbackFighter(fighter, snapshot) {
  Object.assign(fighter, cloneRollbackValue(snapshot.values));
  Object.assign(fighter.combo, snapshot.combo);
  fighter.directionTapTracker.restore(snapshot.directionTaps);
  fighter.inputBuffer.restore(snapshot.inputBuffer);
  fighter.projectileSpawnFrames = new Set(snapshot.projectileSpawnFrames || []);
}

function saveRollbackState() {
  const finisher = state.finisher ? (() => {
    const { script: _script, ...values } = state.finisher;
    return { ...cloneRollbackValue(values), scriptId: state.fighters[state.finisher.winner]?.def.finisherScriptId || state.fighters[state.finisher.winner]?.def.id };
  })() : null;
  return {
    version: 1,
    simulationTick: state.simulationTick,
    picks: [...state.picks],
    stage: state.stage,
    rounds: [...state.rounds],
    round: state.round,
    timer: state.timer,
    timerCarry: state.timerCarry,
    phase: state.phase,
    phaseTime: state.phaseTime,
    finishWinner: state.finishWinner,
    finisherType: state.finisherType,
    finisher,
    cinematicZoom: state.cinematicZoom,
    shake: state.shake,
    flash: state.flash,
    hitstop: state.hitstop,
    matchSeed: state.matchSeed,
    lastImpactSide: state.lastImpactSide,
    rng: state.rng.getState(),
    visualRng: state.visualRng.getState(),
    fighters: state.fighters.map(saveRollbackFighter),
    traps: cloneRollbackValue(state.traps),
    projectiles: cloneRollbackValue(state.projectiles),
    particles: cloneRollbackValue(state.particles),
    effects: cloneRollbackValue(state.effects),
    commands: commandHistory.map((history) => cloneRollbackValue(history)),
    stageWeapon: cloneRollbackValue(state.stageWeapon),
  };
}

function restoreRollbackState(snapshot) {
  if (!snapshot || snapshot.version !== 1 || snapshot.fighters?.length !== 2) throw new Error("Unsupported Final Blow rollback state.");
  state.simulationTick = snapshot.simulationTick;
  state.picks = [...snapshot.picks];
  state.stage = snapshot.stage;
  state.rounds = [...snapshot.rounds];
  state.round = snapshot.round;
  state.timer = snapshot.timer;
  state.timerCarry = snapshot.timerCarry;
  state.phase = snapshot.phase;
  state.phaseTime = snapshot.phaseTime;
  state.finishWinner = snapshot.finishWinner;
  state.finisherType = snapshot.finisherType;
  state.cinematicZoom = snapshot.cinematicZoom;
  state.shake = snapshot.shake;
  state.flash = snapshot.flash;
  state.hitstop = snapshot.hitstop;
  state.matchSeed = snapshot.matchSeed;
  state.lastImpactSide = snapshot.lastImpactSide;
  state.rng.setState(snapshot.rng);
  state.visualRng.setState(snapshot.visualRng);
  for (let side = 0; side < 2; side += 1) {
    if (state.fighters[side]?.def.id !== snapshot.fighters[side].id) {
      const index = roster.findIndex(({ id }) => id === snapshot.fighters[side].id);
      state.fighters[side] = makeFighter(index, side);
    }
    restoreRollbackFighter(state.fighters[side], snapshot.fighters[side]);
  }
  state.traps = cloneRollbackValue(snapshot.traps || []);
  state.projectiles = cloneRollbackValue(snapshot.projectiles || []);
  state.particles = cloneRollbackValue(snapshot.particles || []);
  state.effects = cloneRollbackValue(snapshot.effects || []);
  commandHistory[0] = cloneRollbackValue(snapshot.commands?.[0] || []);
  commandHistory[1] = cloneRollbackValue(snapshot.commands?.[1] || []);
  state.stageWeapon = cloneRollbackValue(snapshot.stageWeapon ?? null);
  state.finisher = snapshot.finisher ? {
    ...cloneRollbackValue(snapshot.finisher),
    script: finisherScripts[snapshot.finisher.scriptId],
  } : null;
  if (state.finisher) delete state.finisher.scriptId;
}

function combatRollbackState() {
  const snapshot = saveRollbackState();
  delete snapshot.visualRng;
  delete snapshot.particles;
  delete snapshot.effects;
  delete snapshot.shake;
  delete snapshot.flash;
  delete snapshot.cinematicZoom;
  if (snapshot.finisher) {
    for (const field of ["cinematicShot", "cinematicCuts", "impactCloseUps", "peakZoom", "slowMotionHits"]) {
      delete snapshot.finisher[field];
    }
  }
  for (const fighter of snapshot.fighters) {
    for (const field of rollbackPresentationFighterFields) delete fighter.values[field];
  }
  return snapshot;
}

function syncRollbackPresentation() {
  updateHud();
  updateComboState();
  updateOnlineHud();
  $("#touchControls").classList.toggle("cinematic", Boolean(state.finisher));
  setTouchPrompt(state.phase === "finish" && state.finishWinner === onlineLocalSide() ? "final" : "");
}

function createOnlineRollback(config, initialFrame = 0) {
  return new RollbackSession({
    localSide: onlineLocalSide(),
    matchTag: matchTagFromId(config.matchId),
    inputDelay: config.inputDelay,
    initialFrame,
    saveState: saveRollbackState,
    loadState: restoreRollbackState,
    checksum: () => checksumState(combatRollbackState()),
    step(inputs, frame, { resimulating }) {
      const previous = rollbackResimulating;
      rollbackResimulating = resimulating;
      try {
        state.simulationTick = frame + 1;
        simulatePreparedGameTick(SIMULATION_STEP_SECONDS, bitsToInput(inputs[0]), bitsToInput(inputs[1]));
      } finally {
        rollbackResimulating = previous;
      }
    },
    onRollback() {
      syncRollbackPresentation();
    },
    onWindowExceeded() {
      updateOnlineHud("error");
      if (onlineSession.role === "host") sendAuthoritativeOnlineState("rollback-window");
      else sendOnlineControl({ type: "desync-warning", matchId: config.matchId, frame: onlineSession.rollback?.frame || 0 });
    },
  });
}

function setupRoster() {
  const grid = $("#rosterGrid");
  grid.innerHTML = "";
  roster.forEach((fighter, index) => {
    const card = document.createElement("button");
    card.className = "fighter-card";
    card.dataset.index = index;
    card.dataset.mark = fighter.mark;
    card.style.setProperty("--fighter", fighter.color);
    card.innerHTML = `
      <span class="pick-badge p1">P1</span><span class="pick-badge p2">P2</span>
      <img class="fighter-portrait" src="assets/fighters/${fighter.id}.webp" alt="" aria-hidden="true" draggable="false">
      <span class="fighter-info"><strong>${fighter.name}</strong><small>${fighter.title}</small></span>`;
    card.addEventListener("click", () => chooseFighter(index));
    grid.append(card);
  });
  updateRosterUI();
}

function renderMoveList(fighterId = "deathblow") {
  const kit = getFighterKit(fighterId);
  if (!kit) return;
  $("#moveListIdentity").innerHTML = `<strong>${kit.archetype}</strong> · ${kit.summary}`;
  $("#moveListRows").innerHTML = listFighterMoves(fighterId)
    .map(({ name, command }) => `<div class="move-list-row"><b>${name}</b><span>${command}</span></div>`)
    .join("");
}

function arcadeOpponentDef(match = currentArcadeMatch(state.arcadeRun)) {
  if (!match) return null;
  return match.opponentId === ARCADE_BOSS_ID
    ? arcadeBoss
    : roster.find(({ id }) => id === match.opponentId) || null;
}

function renderArcadeRoute() {
  const run = state.arcadeRun;
  const containers = [$("#arcadeRoutePreview"), $("#arcadeLadderNodes")].filter(Boolean);
  for (const container of containers) {
    container.hidden = state.mode !== "arcade" || !run;
    if (!run) {
      container.innerHTML = "";
      continue;
    }
    container.innerHTML = run.matches.map((match, index) => {
      const def = arcadeOpponentDef(match);
      const stateClass = index < run.current ? "cleared" : index === run.current ? "current" : "locked";
      return `<div class="ladder-node ${stateClass} ${match.kind}" title="${match.label} · ${def.name}">
        <span>${index < run.current ? "✓" : index + 1}</span>
        <img src="assets/fighters/${def.id}.webp" alt="" draggable="false">
        <b>${match.kind === "boss" ? "BOSS" : match.kind === "rival" ? "RIVAL" : def.name}</b>
      </div>`;
    }).join("");
  }
  if ($("#arcadeLadderCounter") && run) {
    $("#arcadeLadderCounter").textContent = run.completed
      ? `${run.wins} / ${run.matches.length} CLEARED`
      : `BOUT ${run.current + 1} / ${run.matches.length}`;
  }
}

function prepareArcadeOpponent(usePlannedStage = false) {
  const match = currentArcadeMatch(state.arcadeRun);
  const def = arcadeOpponentDef(match);
  if (!match || !def) return null;
  const opponentIndex = roster.findIndex(({ id }) => id === match.opponentId);
  state.picks[1] = opponentIndex >= 0 ? opponentIndex : 0;
  if (usePlannedStage) state.stage = match.stage;
  renderArcadeRoute();
  updateStageUI();
  return def;
}

function makeMatchFighters() {
  const match = state.mode === "arcade" ? currentArcadeMatch(state.arcadeRun) : null;
  const bossOverride = match?.opponentId === ARCADE_BOSS_ID ? arcadeBoss : null;
  return [makeFighter(state.picks[0], 0), makeFighter(state.picks[1], 1, bossOverride)];
}

function showScreen(name) {
  if (demoSession.active && !["fight", "result"].includes(name)) endDemoSession();
  const keepsOnlineLink = state.mode === "online" && ["online", "fight", "result"].includes(name);
  if (onlineSession.role && !keepsOnlineLink) disconnectOnline(true);
  state.screen = name;
  $$(".screen").forEach((screen) => screen.classList.toggle("active", screen.id === `${name}Screen`));
  const playing = name === "fight";
  if (!playing) {
    state.paused = false;
    state.pauseReason = "";
    $("#pausePanel").hidden = true;
    $("#pauseReason").hidden = true;
  }
  $("#hud").classList.toggle("hidden", !playing);
  $("#hud").setAttribute("aria-hidden", String(!playing));
  if (!playing) $$(".combo-readout").forEach((readout) => readout.classList.remove("active"));
  const trainingVisible = playing && state.mode === "training";
  $("#trainingPanel").hidden = !trainingVisible;
  $("#gameFrame").classList.toggle("training-active", trainingVisible);
  const playerControlled = playing && state.mode !== "demo";
  $("#touchControls").classList.toggle("playing", playerControlled);
  $("#touchPauseButton").classList.toggle("playing", playerControlled);
  $("#touchPauseButton").hidden = playing && state.mode === "online";
  if (!playing) $("#announcer").classList.add("hidden");
  updateFlowSkipHint();
  updateOnlineHud();
  updateDemoUi();
  syncMusic();
  if (name === "title") scheduleIdleDemo();
  else clearIdleDemoTimer();
}

function startSelect(mode) {
  enterImmersiveMode();
  unlockAudio();
  state.mode = ["arcade", "versus", "training"].includes(mode) ? mode : "arcade";
  state.arcadeRun = null;
  if (state.mode === "training") {
    // A fresh lab entry keeps accessibility-style toggles but clears transient
    // playback, trial and dummy state so an old recording cannot move P2 during
    // the next intro or silently queue a dash before FIGHT.
    state.training = createTrainingState({
      autoRecover: state.training.autoRecover,
      infiniteGrit: state.training.infiniteGrit,
      showHitboxes: state.training.showHitboxes,
    });
  }
  state.picks = [0, state.mode === "arcade" ? 4 : 1];
  state.locks = [false, state.mode === "arcade"];
  state.selectingPlayer = 0;
  $("#selectPrompt").textContent = state.mode === "training"
    ? "CHOOSE YOUR TRAINING FIGHTER"
    : "PLAYER 1 — CHOOSE";
  showScreen("select");
  syncDifficultyUi();
  updateRosterUI();
}

function chooseFighter(index) {
  unlockAudio();
  if (state.mode === "arcade") {
    state.picks[0] = index;
    state.locks = [true, true];
    state.arcadeRun = createArcadeRun(
      roster[index].id,
      roster.map(({ id }) => id),
      state.rng.nextUint32(),
    );
    prepareArcadeOpponent(false);
  } else if (!state.locks[0]) {
    state.picks[0] = index;
    state.locks[0] = true;
    state.selectingPlayer = 1;
    $("#selectPrompt").textContent = state.mode === "training"
      ? "TRAINING DUMMY — CHOOSE"
      : "PLAYER 2 — CHOOSE";
  } else {
    state.picks[1] = index;
    state.locks[1] = true;
    state.selectingPlayer = 1;
  }
  sound("select");
  updateRosterUI();
}

function updateRosterUI() {
  $$(".fighter-card").forEach((card) => {
    const index = Number(card.dataset.index);
    card.classList.toggle("p1-pick", state.locks[0] && state.picks[0] === index);
    card.classList.toggle("p2-pick", state.locks[1] && state.picks[1] === index);
    card.classList.toggle("focused", !state.locks[state.selectingPlayer] && state.picks[state.selectingPlayer] === index);
  });
  $("#selectionReadout").innerHTML = `<span>P1</span> ${roster[state.picks[0]].name} <i>VS</i> <span>P2</span> ${roster[state.picks[1]].name}`;
  $("#fighterContinue").disabled = !(state.locks[0] && state.locks[1]);
}

function showStageSelect() {
  if (!(state.locks[0] && state.locks[1])) return;
  $("#fightButton").textContent = state.mode === "training" ? "ENTER LAB →" : "FIGHT →";
  showScreen("stage");
  renderArcadeRoute();
  updateStageUI();
}

function chooseStage(id) {
  state.stage = id;
  sound("select");
  updateStageUI();
}

function updateStageUI() {
  $$(".stage-card").forEach((card) => card.classList.toggle("selected", card.dataset.stage === state.stage));
  $("#stageReadout").textContent = stages[state.stage].name;
  $("#stageTicker").textContent = stages[state.stage].ticker;
}

function startMatch(resetSet = true) {
  cancelFightAnnouncement();
  if (!(state.mode === "demo" && demoSession.attract)) unlockAudio();
  if (state.musicChoice === "auto" && state.mode !== "demo") advanceTrack();
  resetMusicDuck();
  if (resetSet) {
    state.rounds = [0, 0];
    state.round = 1;
  }
  state.matchSerial += 1;
  state.qaManualMode = false;
  seedMatch(state.round);
  state.fighters = makeMatchFighters();
  resetStageWeapon();
  resetCrowd();
  warmFighterAudio();
  if (state.mode === "training") {
    state.training = createTrainingState({
      ...state.training,
      resets: 0,
      lastDamage: 0,
      lastResult: "READY",
    });
    resetTrainingScenario(state.training);
    selectTrainingTrial(state.training, state.fighters[0].kitId, state.training.trialIndex);
    if (state.training.infiniteGrit) state.fighters.forEach((fighter) => { fighter.meter = GRIT_RULES.maximum; });
  }
  state.particles.length = 0;
  state.effects.length = 0;
  state.traps.length = 0;
  state.projectiles.length = 0;
  state.timer = 99;
  state.timerCarry = 0;
  state.phase = "intro";
  state.phaseTime = 2.25;
  state.hitstop = 0;
  state.lastImpactSide = -1;
  state.finishWinner = -1;
  state.finisherType = 0;
  state.finisher = null;
  state.cinematicZoom = 1;
  setTouchPrompt("");
  $("#touchControls").classList.remove("cinematic");
  commandHistory[0].length = 0;
  commandHistory[1].length = 0;
  updateHud();
  showScreen("fight");
  updateTrainingUi();
  const arcadeMatch = state.mode === "arcade" ? currentArcadeMatch(state.arcadeRun) : null;
  const introLabel = arcadeMatch?.kind === "boss" ? "FINAL BOUT · THE COMMISSIONER"
    : arcadeMatch?.kind === "rival" ? `RIVAL BOUT · ${state.fighters[1].def.name}`
      : stages[state.stage].name;
  announce(`ROUND ${state.round}`, introLabel, 1.2);
  scheduleFightAnnouncement(() => {
    if (state.screen === "fight" && state.phase === "intro") announce("FIGHT!", "NO MERCY ON THESE STREETS", 0.8);
  }, 1150);
  canvas.focus();
}

function startOnlineMatch(config) {
  if (!validOnlineMatchConfig(config)) return false;
  cancelFightAnnouncement();
  unlockAudio();
  if (state.musicChoice === "auto") advanceTrack();
  resetMusicDuck();
  state.mode = "online";
  state.arcadeRun = null;
  state.qaManualMode = false;
  state.paused = false;
  onlineSession.matchConfig = cloneRollbackValue(config);
  onlineSession.matchActive = true;
  onlineSession.networkPaused = false;
  onlineSession.localSuspended = false;
  onlineSession.remoteSuspended = false;
  onlineSession.awaitingResume = false;
  onlineSession.rematchVotes.clear();
  onlineSession.remoteChecksums.clear();
  onlineSession.checksumMismatches = 0;
  onlineSession.lastChecksumSentFrame = -1;
  onlineSession.lastPersistedFrame = -1;
  onlineSession.lobby.localReady = false;
  onlineSession.lobby.remoteReady = false;
  state.picks = config.picks.map((id) => roster.findIndex((fighter) => fighter.id === id));
  state.stage = config.stage;
  state.rounds = [0, 0];
  state.round = 1;
  state.matchSerial += 1;
  state.simulationTick = 0;
  seedOnlineRound(1);
  state.fighters = makeMatchFighters();
  resetStageWeapon();
  resetCrowd();
  warmFighterAudio();
  state.particles.length = 0;
  state.effects.length = 0;
  state.traps.length = 0;
  state.projectiles.length = 0;
  state.timer = 99;
  state.timerCarry = 0;
  state.phase = "intro";
  state.phaseTime = 2.25;
  state.hitstop = 0;
  state.lastImpactSide = -1;
  state.finishWinner = -1;
  state.finisherType = 0;
  state.finisher = null;
  state.cinematicZoom = 1;
  state.shake = 0;
  state.flash = 0;
  commandHistory[0].length = 0;
  commandHistory[1].length = 0;
  onlineSession.rollback = createOnlineRollback(config, 0);
  $("#onlineMatchSetup").hidden = true;
  $("#onlineRematchStatus").hidden = true;
  $("#touchControls").classList.remove("cinematic");
  setTouchPrompt("");
  updateStageUI();
  updateHud();
  showScreen("fight");
  updateOnlineHud();
  announce("ONLINE ROUND 1", `${roster[state.picks[0]].name} VS ${roster[state.picks[1]].name} · ${config.inputDelay}F DELAY`, 1.35);
  scheduleFightAnnouncement(() => {
    if (state.mode === "online" && state.screen === "fight" && state.phase === "intro") announce("FIGHT!", "ROLLBACK SYNC LOCKED", 0.8);
  }, 1150);
  persistOnlineResume(true);
  canvas.focus();
  return true;
}

function resetRound() {
  cancelFightAnnouncement();
  resetMusicDuck();
  const carriedGrit = state.fighters.map((fighter) => fighter.meter);
  state.round += 1;
  state.qaManualMode = false;
  if (state.mode === "online") seedOnlineRound(state.round);
  else seedMatch(state.round);
  state.fighters = makeMatchFighters();
  warmFighterAudio();
  state.fighters.forEach((fighter, side) => { fighter.meter = carriedGrit[side] || 0; });
  resetStageWeapon();
  resetCrowd();
  state.particles.length = 0;
  state.effects.length = 0;
  state.traps.length = 0;
  state.projectiles.length = 0;
  state.timer = 99;
  state.timerCarry = 0;
  state.phase = "intro";
  state.phaseTime = 2.1;
  state.hitstop = 0;
  state.lastImpactSide = -1;
  state.finishWinner = -1;
  state.finisher = null;
  state.cinematicZoom = 1;
  setTouchPrompt("");
  $("#touchControls").classList.remove("cinematic");
  commandHistory[0].length = 0;
  commandHistory[1].length = 0;
  updateFlowSkipHint();
  updateHud();
  announce(`ROUND ${state.round}`, "SETTLE IT", 1.15);
  scheduleFightAnnouncement(() => {
    if (state.screen === "fight" && state.phase === "intro") announce("FIGHT!", "", 0.75);
  }, 1050);
}

function announce(main, sub = "", duration = 1) {
  if (rollbackResimulating) return;
  const box = $("#announcer");
  box.querySelector("strong").textContent = main;
  box.querySelector("span").textContent = sub;
  box.classList.remove("hidden");
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => box.classList.add("hidden"), duration * 1000);
}

function updateFlowSkipHint() {
  const visible = state.screen === "fight" && (state.phase === "intro" || state.phase === "roundover");
  $("#flowSkipHint").hidden = !visible;
}

function trySkipFightFlow(input0 = {}, input1 = {}) {
  if (!hasFlowSkipInput(input0) && !hasFlowSkipInput(input1)) return false;
  if (state.phase === "intro") {
    state.phase = "fight";
    state.phaseTime = 0;
    cancelFightAnnouncement();
    announce("FIGHT!", "INTRO SKIPPED", 0.55);
    updateFlowSkipHint();
    return true;
  }
  if (state.phase === "roundover") {
    state.phaseTime = 0;
    state.finisher = null;
    state.cinematicZoom = 1;
    $("#touchControls").classList.remove("cinematic");
    updateFlowSkipHint();
    return true;
  }
  return false;
}

function finishRound(winner, type = -1) {
  if (state.phase === "roundover" || state.phase === "result") return;
  for (const fighter of state.fighters) clearGrabState(fighter);
  for (const fighter of state.fighters) { fighter.carriedWeapon = null; fighter.carryFrames = 0; }
  if (state.stageWeapon) state.stageWeapon.phase = "gone";
  state.phase = "roundover";
  state.rounds[winner] += 1;
  state.finisherType = type;
  const winDef = state.fighters[winner].def;
  if (type >= 0) {
    const duration = performFinisher(winner, type);
    state.phaseTime = duration;
    duckMusic(0.1, duration * 1000);
    const scriptId = winDef.finisherScriptId || winDef.id;
    announce("FINAL BLOW", `${winDef.finishers[type]} · ${finisherScripts[scriptId].combo}`, 2.45);
  } else {
    state.phaseTime = 2.4;
    duckMusic(0.28, 1700);
    announce(`${winDef.name} WINS`, "KNOCKOUT", 1.65);
    sound("ko", state.fighters[1 - winner]);
  }
  updateFlowSkipHint();
  updateHud();
}

function performFinisher(winner, type) {
  const attacker = state.fighters[winner];
  const victim = state.fighters[1 - winner];
  const scriptId = attacker.def.finisherScriptId || attacker.def.id;
  const script = finisherScripts[scriptId];
  const fatality = getGraphicFatality(scriptId, type);
  const fatalityAt = script.impacts.find((impact) => impact.final)?.t ?? script.duration;
  const direction = attacker.x <= victim.x ? 1 : -1;
  const anchor = clamp(victim.x, 390, W - 390);
  attacker.attacking = null;
  attacker.vx = 0;
  attacker.vy = 0;
  attacker.down = false;
  victim.vx = 0;
  victim.vy = 0;
  victim.down = false;
  state.finisher = {
    winner,
    type,
    script,
    direction,
    anchor,
    elapsed: 0,
    impactIndex: 0,
    beatLabel: script.combo,
    beatLife: .8,
    fatalityId: fatality.id,
    fatalityAt,
    fatalityTriggered: false,
    cinematicShot: "establishing",
    cinematicCuts: 0,
    impactCloseUps: 0,
    peakZoom: 1.24,
    slowMotionHits: 0,
  };
  state.cinematicZoom = 1.24;
  state.shake = .16;
  if (!rollbackResimulating) {
    setTouchPrompt("");
    $("#touchControls").classList.add("cinematic");
  }
  // Keep the fighter's launch accent, then place the dedicated spoken cue on
  // top so every LP/LK execution clearly announces "Death Blow" once.
  sound("special", attacker);
  sound("final");
  return script.duration + .55;
}

function sampleFinisher(keys, elapsed) {
  let from = keys[0];
  let to = keys.at(-1);
  for (let index = 0; index < keys.length - 1; index += 1) {
    if (elapsed >= keys[index].t && elapsed <= keys[index + 1].t) {
      from = keys[index];
      to = keys[index + 1];
      break;
    }
  }
  const span = Math.max(.001, to.t - from.t);
  const linear = clamp((elapsed - from.t) / span, 0, 1);
  const eased = linear * linear * (3 - 2 * linear);
  const mix = (field, fallback = 0) => lerp(from[field] ?? fallback, to[field] ?? from[field] ?? fallback, eased);
  return {
    ax: mix("ax"), ay: mix("ay"), vx: mix("vx"), vy: mix("vy"),
    ar: mix("ar"), vr: mix("vr"), zoom: mix("zoom", 1.08),
    af: linear < .5 ? from.af : to.af,
    vf: linear < .5 ? from.vf : to.vf,
  };
}

// Camera choreography is derived only from the current scripted beat. That
// keeps every cut deterministic in rollback play while allowing each client to
// soften the zoom locally when reduced motion is enabled.
function finisherCinematicCamera(poseZoom = 1.18) {
  const finisher = state.finisher;
  if (!finisher || state.fighters.length !== 2) {
    return { x: W * .5, y: H * .5, zoom: 1, shot: "arena", intensity: 0 };
  }
  const attacker = state.fighters[finisher.winner];
  const victim = state.fighters[1 - finisher.winner];
  const elapsed = finisher.elapsed;
  const closestImpact = finisher.script.impacts.reduce((closest, impact) => (
    Math.abs(impact.t - elapsed) < Math.abs(closest.t - elapsed) ? impact : closest
  ), finisher.script.impacts[0]);
  const impactDelta = elapsed - closestImpact.t;
  const inImpactWindow = impactDelta >= -.12 && impactDelta <= .24;
  const inFinalWindow = closestImpact.final && impactDelta >= -.16 && impactDelta <= .46;
  let shot = "pursuit";
  let zoom = Math.max(1.27, poseZoom);
  let intensity = .36;

  if (elapsed < .42) {
    shot = "establishing";
    zoom = Math.max(1.24, poseZoom);
    intensity = .2;
  } else if (inFinalWindow) {
    shot = "final-impact";
    zoom = Math.max(1.62, poseZoom);
    intensity = 1;
  } else if (inImpactWindow) {
    shot = "impact-close-up";
    zoom = Math.max(1.43, poseZoom);
    intensity = .72;
  } else if (finisher.fatalityTriggered && elapsed > finisher.fatalityAt) {
    shot = "aftermath";
    zoom = Math.max(1.48, poseZoom);
    intensity = .84;
  }

  // Keep the full exchange legible even when a script briefly throws the two
  // bodies apart, then settle the vertical focus onto the victim at impact.
  const separation = Math.abs(attacker.x - victim.x);
  const framingLimit = clamp((W * .72) / Math.max(340, separation), 1.18, 1.68);
  zoom = Math.min(zoom, framingLimit);
  const nominalZoom = zoom;
  if (state.accessibility.reducedMotion) zoom = Math.min(zoom, shot === "final-impact" ? 1.4 : 1.32);
  const midpointY = (attacker.y + victim.y) * .5 - 150;
  const impactY = victim.y - (shot === "final-impact" ? 132 : 145);
  return {
    x: (attacker.x + victim.x) * .5,
    y: clamp(inImpactWindow || shot === "aftermath" ? lerp(midpointY, impactY, .68) : midpointY, H * .3, H * .59),
    zoom,
    nominalZoom,
    shot,
    intensity,
  };
}

function triggerFinisherImpact(finisher, impact) {
  const attacker = state.fighters[finisher.winner];
  const victim = state.fighters[1 - finisher.winner];
  const finalImpact = Boolean(impact.final);
  const pointX = victim.x - finisher.direction * 12;
  const pointY = victim.y - (finalImpact ? 108 : 125);
  const gore = state.graphicFatalities;
  const count = Math.round((finalImpact ? 52 : 12) * impact.power * (gore ? 1.35 : 1));

  victim.hitFlash = finalImpact ? .22 : .11;
  attacker.specialGlow = finalImpact ? 1.1 : .45;
  // The long final-frame hold reads as time dilation without changing the
  // authored pose timeline or introducing a second simulation clock.
  state.hitstop = Math.max(state.hitstop, finalImpact ? .26 : .055 + impact.power * .032);
  state.shake = Math.max(state.shake, finalImpact ? 1.1 : .16 + impact.power * .22);
  if (finalImpact && $("#flashToggle").checked) state.flash = .34;
  finisher.beatLabel = impact.label;
  finisher.beatLife = finalImpact ? 1.05 : .48;
  finisher.impactCloseUps += 1;
  if (finalImpact) finisher.slowMotionHits += 1;

  for (let index = 0; index < count; index += 1) {
    const angle = visualRandom() * Math.PI * 2;
    const speed = 100 + visualRandom() * (finalImpact ? 670 : 330) * impact.power;
    const splatter = finalImpact && gore && visualRandom() > .34;
    state.particles.push({
      kind: gore ? "blood" : "impact",
      x: pointX,
      y: pointY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (finalImpact ? 150 : 35),
      life: (finalImpact ? .65 : .22) + visualRandom() * (finalImpact ? 1.15 : .42),
      max: finalImpact ? 1.8 : .64,
      size: 2 + visualRandom() * (finalImpact ? 8 : 5),
      color: gore
        ? splatter ? "#d90b19" : visualRandom() > .45 ? "#a50713" : "#e32632"
        : "#862833",
    });
  }

  state.effects.push({
    kind: "finisherImpact",
    style: attacker.def.vfx,
    variant: finisher.type,
    final: finalImpact,
    power: impact.power,
    direction: finisher.direction,
    x: pointX,
    y: pointY,
    life: finalImpact ? 1.2 : .55,
    max: finalImpact ? 1.2 : .55,
    color: attacker.def.accent,
    secondary: attacker.def.color,
  });
  if (finalImpact && gore) {
    const scriptId = attacker.def.finisherScriptId || attacker.def.id;
    const fatality = getGraphicFatality(scriptId, finisher.type);
    finisher.fatalityTriggered = true;
    finisher.beatLabel = fatality.title;
    finisher.beatLife = 1.45;
    const decalLife = Math.max(1.4, finisher.script.duration - finisher.elapsed + .8);
    state.effects.push({
      kind: "fatalityPool",
      profileId: fatality.id,
      family: fatality.family,
      x: victim.x,
      y: FLOOR + 4,
      life: decalLife,
      max: decalLife,
      color: fatality.palette[0],
      secondary: fatality.palette[1],
      direction: finisher.direction,
      scale: fatality.blood,
    });
    const goreCount = Math.round(42 * fatality.blood * state.performance.particleScale);
    for (let index = 0; index < goreCount; index += 1) {
      const angle = -Math.PI * (.12 + visualRandom() * .76);
      const speed = 180 + visualRandom() * 620 * fatality.separation;
      state.particles.push({
        kind: "blood",
        x: pointX + (visualRandom() - .5) * 34,
        y: pointY + (visualRandom() - .5) * 42,
        vx: Math.cos(angle) * speed * (visualRandom() > .5 ? 1 : -1),
        vy: Math.sin(angle) * speed,
        life: .75 + visualRandom() * 1.4,
        max: 2.15,
        size: 3 + visualRandom() * 9,
        color: visualRandom() > .28 ? fatality.palette[0] : fatality.palette[1],
      });
    }
    const fragmentCount = Math.max(12, Math.round(30 * fatality.separation * state.performance.particleScale));
    for (let index = 0; index < fragmentCount; index += 1) {
      const angle = -Math.PI * (.08 + visualRandom() * .84);
      const speed = 230 + visualRandom() * 760 * fatality.separation;
      state.particles.push({
        kind: "goreFragment",
        x: pointX + (visualRandom() - .5) * 46,
        y: pointY + (visualRandom() - .5) * 56,
        vx: Math.cos(angle) * speed * (visualRandom() > .5 ? 1 : -1),
        vy: Math.sin(angle) * speed - 45,
        gravity: 940,
        drag: .981,
        rotation: visualRandom() * Math.PI * 2,
        spin: (visualRandom() - .5) * 18,
        spikes: 5 + index % 4,
        bone: index % 6 === 0,
        life: 1 + visualRandom() * 1.5,
        max: 2.5,
        size: 6 + visualRandom() * 13,
        color: index % 4 ? fatality.palette[0] : fatality.palette[1],
      });
    }
    state.effects.push({
      kind: "goreShockwave",
      family: fatality.family,
      direction: finisher.direction,
      x: pointX,
      y: pointY,
      life: 1.45,
      max: 1.45,
      color: fatality.palette[0],
      secondary: fatality.palette[1],
      scale: fatality.separation,
    });
    state.effects.push({
      kind: "lensBlood",
      family: fatality.family,
      variant: finisher.type,
      x: pointX,
      y: pointY,
      life: decalLife,
      max: decalLife,
      color: fatality.palette[0],
      secondary: fatality.palette[1],
      scale: fatality.blood,
    });
  }
  sound(finalImpact ? "fatal" : impact.sound, attacker);
}

function updateFinisher(dt) {
  const finisher = state.finisher;
  if (!finisher) return;
  const attacker = state.fighters[finisher.winner];
  const victim = state.fighters[1 - finisher.winner];
  finisher.elapsed = Math.min(finisher.script.duration, finisher.elapsed + dt);
  finisher.beatLife = Math.max(0, finisher.beatLife - dt);
  const pose = sampleFinisher(finisher.script.keys, finisher.elapsed);

  attacker.x = finisher.anchor + finisher.direction * pose.ax;
  attacker.y = FLOOR - pose.ay;
  victim.x = finisher.anchor + finisher.direction * pose.vx;
  victim.y = FLOOR - pose.vy;
  attacker.facing = victim.x >= attacker.x ? 1 : -1;
  victim.facing = -attacker.facing;
  attacker.grounded = pose.ay < 2;
  victim.grounded = pose.vy < 2;
  attacker.cinematicFrame = pose.af;
  victim.cinematicFrame = pose.vf;
  attacker.cinematicRotation = pose.ar * finisher.direction;
  victim.cinematicRotation = pose.vr * finisher.direction;
  attacker.specialGlow = Math.max(attacker.specialGlow, .28 + Math.sin(finisher.elapsed * 9) * .08);
  attacker.block = false;
  victim.block = false;
  attacker.crouch = false;
  victim.crouch = false;
  const cinematic = finisherCinematicCamera(pose.zoom);
  if (cinematic.shot !== finisher.cinematicShot) {
    finisher.cinematicShot = cinematic.shot;
    finisher.cinematicCuts += 1;
  }
  finisher.peakZoom = Math.max(finisher.peakZoom, cinematic.nominalZoom);
  state.cinematicZoom = cinematic.zoom;

  while (finisher.impactIndex < finisher.script.impacts.length
    && finisher.script.impacts[finisher.impactIndex].t <= finisher.elapsed) {
    triggerFinisherImpact(finisher, finisher.script.impacts[finisher.impactIndex]);
    finisher.impactIndex += 1;
  }
}

function showResult(winner) {
  state.phase = "result";
  state.finisher = null;
  state.cinematicZoom = 1;
  updateFlowSkipHint();
  const def = state.fighters[winner].def;
  const kit = getFighterKit(def.kitId || def.id);
  const arcadeDefeat = state.mode === "arcade" && winner === 1 && state.arcadeRun;
  $("#resultEyebrow").textContent = state.mode === "demo" ? `WATCH DEMO · CYCLE ${demoSession.cycle?.cycle || 1}`
    : arcadeDefeat ? "ARCADE RUN INTERRUPTED" : "MATCH COMPLETE";
  $("#resultTitle").textContent = `${def.name} WINS`;
  $("#resultFinisher").textContent = arcadeDefeat
    ? `${currentArcadeMatch(state.arcadeRun)?.label || "BOUT"} · CONTINUE?`
    : state.finisherType >= 0 ? def.finishers[state.finisherType] : "KNOCKOUT";
  const victoryPose = $("#victoryPose");
  victoryPose.classList.toggle("portrait-art", !kit || def.boss);
  victoryPose.style.backgroundImage = kit && !def.boss
    ? `url("assets/moves/${def.id}-specials.webp")`
    : `url("assets/fighters/${def.id}.webp")`;
  $("#resultQuote").textContent = def.victoryQuote || kit?.victory.quote || "PHILLY REMEMBERS THE WINNER.";
  $("#rematchButton").textContent = arcadeDefeat ? "CONTINUE" : state.mode === "online" ? "REQUEST REMATCH" : "INSTANT REMATCH";
  $("#reselectButton").textContent = arcadeDefeat ? "ABANDON RUN" : state.mode === "online" ? "LEAVE ROOM" : "SELECT FIGHTERS";
  $("#newStageButton").hidden = state.mode !== "versus";
  showScreen("result");
  if (state.mode === "demo") scheduleNextDemoMatch();
  else $("#demoResultStatus").hidden = true;
  if (state.mode === "online") {
    onlineSession.rematchVotes.clear();
    updateOnlineRematchUi();
    persistOnlineResume(true);
  }
}

function showSameFightersStageSelect() {
  if (state.screen !== "result" || state.mode !== "versus") return false;
  state.locks = [true, true];
  state.selectingPlayer = 1;
  state.phase = "idle";
  showStageSelect();
  $("#fightButton").textContent = "FIGHT NEW STAGE →";
  return true;
}

function showArcadeLadder(clearedMatch) {
  const run = state.arcadeRun;
  const next = currentArcadeMatch(run);
  const nextDef = arcadeOpponentDef(next);
  const clearedDef = arcadeOpponentDef(clearedMatch);
  renderArcadeRoute();
  $("#arcadeLadderTitle").textContent = next?.kind === "boss" ? "FINAL AUTHORITY"
    : next?.kind === "rival" ? "SETTLE THE RIVALRY"
      : "THE STREET OPENS";
  $("#arcadeLadderMessage").textContent = next?.kind === "boss"
    ? "THE BLACK BOOK OPENS. THE COMMISSIONER IS WAITING AT THE VET."
    : `${clearedDef?.name || "ONE FIGHTER"} CROSSED OUT · ${nextDef?.name || "THE NEXT CHALLENGER"} STEPS FORWARD.`;
  $("#arcadeContinueButton").textContent = next?.kind === "boss" ? "ENTER FINAL BOUT →"
    : next?.kind === "rival" ? "FACE YOUR RIVAL →"
      : "NEXT FIGHT →";
  showScreen("ladder");
}

function showArcadeEnding() {
  const run = state.arcadeRun;
  const ending = getArcadeEnding(run?.playerId);
  const def = roster.find(({ id }) => id === run?.playerId);
  if (!ending || !def) {
    showScreen("title");
    return;
  }
  const screen = $("#endingScreen");
  screen.style.setProperty("--ending-color", ending.color);
  $("#endingTitle").textContent = ending.title;
  $("#endingQuote").textContent = ending.quote;
  $("#endingStory").textContent = ending.story;
  $("#endingArt").style.backgroundImage = `url("assets/moves/${def.id}-specials.webp")`;
  renderArcadeRoute();
  showScreen("ending");
}

function resolveMatchResult(winner) {
  if (state.mode !== "arcade" || !state.arcadeRun) {
    showResult(winner);
    return;
  }
  const outcome = recordArcadeResult(state.arcadeRun, winner === 0);
  if (winner !== 0) {
    showResult(winner);
    return;
  }
  if (outcome.completed) {
    showArcadeEnding();
    return;
  }
  prepareArcadeOpponent(true);
  showArcadeLadder(outcome.match);
}

function updateHud() {
  if (rollbackResimulating) return;
  if (!state.fighters.length) return;
  const sideTags = $$(".side-tag");
  if (sideTags[0]) sideTags[0].textContent = state.mode === "demo" ? "CPU 1" : "P1";
  if (sideTags[1]) sideTags[1].textContent = state.mode === "demo" ? "CPU 2" : "P2";
  state.fighters.forEach((fighter, side) => {
    const prefix = side === 0 ? "p1" : "p2";
    $(`#${prefix}Name`).textContent = fighter.def.name;
    const health = clamp(fighter.health, 0, 100) / 100;
    const healthBar = $(`#${prefix}Health`);
    healthBar.style.transform = `scaleX(${health})`;
    healthBar.classList.toggle("danger", health <= 0.25);
    $(`#${prefix}Damage`).style.transform = `scaleX(${health})`;
    $(`#${prefix}Meter`).style.transform = `scaleX(${clamp(fighter.meter, 0, 100) / 100})`;
    $(`#${prefix}Grit`).textContent = String(Math.floor(fighter.meter));
    $(`#${prefix}Meter`).closest(".grit-row").classList.toggle("full", fighter.meter >= GRIT_RULES.superCost);
    $(`#${prefix}Rounds`).innerHTML = [0, 1].map((round) => `<i class="${state.rounds[side] > round ? "won" : ""}"></i>`).join("");
  });
  state.fighters.forEach((fighter, side) => {
    const prefix = `p${side + 1}`;
    const profile = getThrowable(fighter.kitId);
    $(`#${prefix}ObjectName`).textContent = profile ? profile.name : "—";
    $(`#${prefix}Objects`).innerHTML = profile
      ? Array.from({ length: profile.usesPerRound }, (_, index) => `<i class="${index < fighter.throwableUses ? "left" : ""}"></i>`).join("")
      : "";
  });
  $("#timer").textContent = state.mode === "training" ? "∞" : String(Math.ceil(state.timer)).padStart(2, "0");
  $("#roundLabel").textContent = state.mode === "training" ? "TRAINING"
    : state.mode === "demo" ? `DEMO · ROUND ${state.round}` : `ROUND ${state.round}`;
  const finishing = state.phase === "finish" && state.finishWinner === 0;
  const superReady = state.phase === "fight" && state.fighters[0]?.meter >= GRIT_RULES.superCost;
  setTouchPrompt(finishing ? "final" : superReady ? "super" : "");
}

function setTouchPrompt(kind = "") {
  const prompt = $("#touchPrompt");
  const actions = $(".touch-action");
  const label = kind === "final" ? "FINISH HIM · LP = A · LK = B · ANY DISTANCE"
    : kind === "super" ? "SUPER READY · \u2193 \u2192 \u2193 \u2192 + PUNCH"
      : "";
  prompt.textContent = label;
  prompt.hidden = !label;
  prompt.classList.toggle("ready", kind === "final");
  prompt.classList.toggle("super-ready", kind === "super");
  actions.classList.toggle("ready", kind === "final");
  actions.classList.toggle("super-ready", kind === "super");
}

function resetTrainingPosition(countReset = true) {
  if (state.mode !== "training") return;
  state.fighters = makeMatchFighters();
  state.particles.length = 0;
  state.effects.length = 0;
  state.traps.length = 0;
  state.projectiles.length = 0;
  state.hitstop = 0;
  state.phase = "fight";
  state.phaseTime = 0;
  resetTrainingScenario(state.training);
  selectTrainingTrial(state.training, state.fighters[0].kitId, state.training.trialIndex);
  if (state.training.infiniteGrit) state.fighters.forEach((fighter) => { fighter.meter = GRIT_RULES.maximum; });
  if (countReset) state.training.resets += 1;
  state.training.lastDamage = 0;
  updateHud();
  updateTrainingUi();
}

function renderTrainingTrials() {
  if (state.mode !== "training" || !state.fighters.length) return;
  const fighterId = state.fighters[0].kitId;
  const trials = comboTrialsForFighter(fighterId);
  const select = $("#trainingTrialSelect");
  if (state.training.trialFighterId !== fighterId) selectTrainingTrial(state.training, fighterId, 0);
  if (select.dataset.fighterId !== fighterId) {
    select.dataset.fighterId = fighterId;
    select.innerHTML = trials.map((trial, index) => `<option value="${index}">${index + 1} · ${trial.name}</option>`).join("");
  }
  select.value = String(state.training.trialIndex);
}

function updateTrainingUi(input = {}) {
  if (rollbackResimulating) return;
  if (state.mode !== "training" || !state.fighters.length) return;
  const [player] = state.fighters;
  const combo = player.combo.snapshot(state.simulationTick);
  if (combo.damage > 0) state.training.lastDamage = combo.damage;
  const limbSuffix = input.limb === "kick" ? "K" : "P";
  const labels = [
    ["left", "←"], ["right", "→"], ["down", "↓"], ["jump", "↑"],
    ["light", `L${limbSuffix}`], ["heavy", `H${limbSuffix}`], ["special", "SPECIAL"],
    ["enhanced", "EX"], ["throw", input.throwBack ? "BACK THROW" : "THROW"], ["super", "SUPER"],
  ].filter(([action]) => input[action]).map(([, label]) => label);
  const inputLabel = labels.join("+");
  // Training always shows the live grab rule so the SF2 proximity command is learnable.
  const opponent = state.fighters[1];
  const grabReady = inProximityGrabRange(player, opponent) && !player.attacking;
  $("#trainingGrabHint").textContent = grabReady
    ? "IN GRAB RANGE · TOWARD + LP/LK THROWS FORWARD · AWAY + LP/LK THROWS BACK"
    : "GRAB: STEP IN CLOSE, THEN TOWARD OR AWAY + LP OR LK";
  $("#trainingGrabHint").classList.toggle("ready", grabReady);
  if (inputLabel && (inputLabel !== state.training.lastInputLabel
    || state.simulationTick - state.training.lastInputFrame > 6)) {
    state.training.inputHistory.push(inputLabel);
    state.training.inputHistory = state.training.inputHistory.slice(-12);
    state.training.lastInputLabel = inputLabel;
    state.training.lastInputFrame = state.simulationTick;
  } else if (!inputLabel) {
    state.training.lastInputLabel = "";
  }
  const snapshot = trainingSnapshot(state.training);
  renderTrainingTrials();
  const move = snapshot.lastMove;
  $("#trainingDamage").textContent = Number(snapshot.lastDamage).toFixed(1).replace(/\.0$/, "");
  $("#trainingCombo").textContent = `${combo.hits} HIT`;
  $("#trainingFrames").textContent = move
    ? `${move.name} · S${move.startup} A${move.active} R${move.recovery}`
    : "—";
  $("#trainingAdvantage").textContent = snapshot.lastAdvantage === null
    ? move ? `${move.onHit >= 0 ? "+" : ""}${move.onHit} HIT · ${move.onBlock >= 0 ? "+" : ""}${move.onBlock} BLOCK` : "—"
    : `${snapshot.lastAdvantage >= 0 ? "+" : ""}${snapshot.lastAdvantage} ACTUAL`;
  $("#trainingInputs").textContent = `INPUT: ${snapshot.inputHistory.join(" › ") || "—"}  //  DUMMY: ${snapshot.dummyMode.toUpperCase()}  //  RESETS: ${snapshot.resets}`;
  $("#trainingTrialSteps").innerHTML = `TRIAL: ${snapshot.trial.steps.map((step, index) => `<span class="${step.complete ? "done" : index === snapshot.trial.step ? "next" : ""}">${step.label}</span>`).join(" › ") || "—"}`;
  $("#trainingTrialStatus").textContent = `${snapshot.trial.status}${snapshot.trial.complete ? ` · ${snapshot.trial.completions} CLEAR` : ""}`;
  $("#trainingDummySelect").value = snapshot.dummyMode;
  $("#trainingRecoverToggle").checked = snapshot.autoRecover;
  $("#trainingGritToggle").checked = snapshot.infiniteGrit;
  $("#trainingHitboxToggle").checked = snapshot.showHitboxes;
  $("#trainingRecordButton").textContent = snapshot.recordingActive ? "STOP & PLAY" : "RECORD P2";
  $("#trainingPlaybackButton").disabled = snapshot.recordingFrames === 0;
  $("#trainingPlaybackButton").textContent = snapshot.dummyMode === "playback"
    ? `PLAYING ${snapshot.recordingFrames}F` : `PLAY LOOP ${snapshot.recordingFrames || "—"}F`;
}

function syncNewOptionsUi() {
  $("#goreToggle").checked = state.graphicFatalities;
  $("#stageWeaponToggle").checked = state.stageWeaponsEnabled;
  $("#controlStyleSelect").value = state.controlStyle;
  $("#reducedMotionToggle").checked = state.accessibility.reducedMotion;
  $("#highContrastToggle").checked = state.accessibility.highContrast;
  $("#colorAssistSelect").value = state.accessibility.colorAssist;
  $("#shakeSelect").value = String(state.accessibility.shakeScale);
  $("#touchHandednessSelect").value = state.touchSettings.handedness;
  $("#touchScale").value = String(Math.round(state.touchSettings.scale * 100));
  $("#touchOpacity").value = String(Math.round(state.touchSettings.opacity * 100));
  $("#touchScaleValue").textContent = `${Math.round(state.touchSettings.scale * 100)}%`;
  $("#touchOpacityValue").textContent = `${Math.round(state.touchSettings.opacity * 100)}%`;
  $("#touchHapticsToggle").checked = state.touchSettings.haptics;
  $("#soundCaptionsToggle").checked = state.soundCaptions;
  $("#visualQualitySelect").value = state.visualQuality;
  $("#attractModeToggle").checked = state.attractEnabled;
}

function getPad(index) {
  return [...(navigator.getGamepads?.() || [])].filter(Boolean)[index] || null;
}

function buttonValue(pad, index) {
  return pad?.buttons[index]?.pressed || (pad?.buttons[index]?.value || 0) > 0.55;
}

function readInput(side) {
  const map = keyMaps[side];
  const pad = getPad(side);
  assignedPadBySide[side] = pad?.index ?? null;
  const previous = previousPads.get(pad?.index) || [];
  const axisX = pad ? pad.axes[0] || 0 : 0;
  const axisY = pad ? pad.axes[1] || 0 : 0;
  const held = (action) => keys.has(map[action]) || (side === 0 && touch.has(action));
  const edge = (action) => {
    let active = false;
    if (pressed.has(map[action])) {
      active = true;
      pressed.delete(map[action]);
    }
    const touchToken = `${action}:pressed`;
    if (side === 0 && touch.has(touchToken)) {
      active = true;
      touch.delete(touchToken);
    }
    return active;
  };
  const padEdge = (index) => Boolean(pad && buttonValue(pad, index) && !previous[index]);
  const left = held("left") || axisX < -0.42 || buttonValue(pad, 14);
  const right = held("right") || axisX > 0.42 || buttonValue(pad, 15);
  const down = held("down") || axisY > 0.52 || buttonValue(pad, 13);
  const upHeld = held("up") || Boolean(pad && (axisY < -0.65 || buttonValue(pad, 12)));
  const up = edge("up") || (upHeld && !previous[20]);

  // The four combat buttons are the only attack inputs. Everything else is
  // reached by the directional control, a motion, or a two-button chord.
  const raw = { fourButton: true, left, right, down, up, jump: up };
  for (const button of ATTACK_BUTTONS) {
    raw[button] = edge(button) || padEdge(padMap[button]);
    raw[`${button}Held`] = held(button) || Boolean(buttonValue(pad, padMap[button]));
  }

  // Arm the finishing window only once every combat button is released, so the
  // KO-causing press or a held button can never roll straight into a finisher.
  const attackHeld = ATTACK_BUTTONS.some((button) => raw[`${button}Held`]);
  if (state.phase === "finish" && state.finishWinner === side) {
    if (!attackHeld) state.finishArmed[side] = true;
  } else {
    state.finishArmed[side] = false;
  }

  if (pad) {
    const next = pad.buttons.map((button) => button.pressed || button.value > 0.55);
    next[20] = axisY < -0.65 || buttonValue(pad, 12);
    previousPads.set(pad.index, next);
  }
  return raw;
}

function activeControlStyle(side) {
  return state.mode === "online"
    ? normalizeControlStyle(onlineSession.matchConfig?.controlStyles?.[side])
    : state.controlStyle;
}

function aiInput(fighter, opponent, dt) {
  fighter.aiClock -= dt;
  const input = { left: false, right: false, down: false, guard: false, jump: false, light: false, heavy: false, special: false, enhanced: false, throw: false, super: false, final: false };
  if (isPassiveDifficulty(fighter.aiBrain?.difficulty)) return input;
  const cpuFinisher = state.mode === "demo" || state.mode === "tournament" || fighter.side === 1;
  if (state.phase === "finish" && state.finishWinner === fighter.side && cpuFinisher) {
    input.final = fighter.aiClock <= 0;
    if (input.final) fighter.aiClock = 2;
    return input;
  }
  if (state.mode === "demo" && state.phase === "fight" && !demoSession.superShown) {
    const distance = Math.abs(opponent.x - fighter.x);
    const towardRight = opponent.x > fighter.x;
    if (distance > 245) {
      input.right = towardRight;
      input.left = !towardRight;
    } else if (fighter.side === demoSession.superSide) {
      input.super = true;
      demoSession.superShown = true;
    } else {
      input.guard = true;
    }
    return input;
  }
  return stepAiBrain(fighter.aiBrain, {
    frame: state.simulationTick,
    self: fighter,
    opponent,
    roll: random(),
  });
}

function readQaInput(side) {
  const override = qaInputOverrides[side];
  if (!override || override.frames <= 0) return null;
  override.frames -= 1;
  const input = { ...override.input };
  if (override.frames <= 0) qaInputOverrides[side] = null;
  return input;
}

function rememberCommand(side, token) {
  const history = commandHistory[side];
  const frame = state.simulationTick;
  if (!history.length || history.at(-1).token !== token || frame - history.at(-1).frame > 9) history.push({ token, frame });
  while (history.length > 9 || (history[0] && frame - history[0].frame > 108)) history.shift();
}

function commandMatches(side, sequence) {
  const tokens = commandHistory[side].map((item) => item.token);
  let cursor = tokens.length - 1;
  for (let i = sequence.length - 1; i >= 0; i -= 1) {
    while (cursor >= 0 && tokens[cursor] !== sequence[i]) cursor -= 1;
    if (cursor < 0) return false;
    cursor -= 1;
  }
  return true;
}

// Directions are recorded as discrete state changes rather than per-frame holds
// so a steady down-forward hold cannot fake a repeated quarter-circle motion.
const directionTokenState = ["", ""];

function directionStateToken(input, fighter) {
  const absolute = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const horizontal = absolute === 0 ? "" : absolute === fighter.facing ? "forward" : "back";
  if (input.down && horizontal) return `down-${horizontal}`;
  if (input.down) return "down";
  return horizontal;
}

function recordDirection(side, input, fighter) {
  const token = directionStateToken(input, fighter);
  if (token === directionTokenState[side]) return;
  directionTokenState[side] = token;
  if (!token) return;
  for (const part of token.split("-")) rememberCommand(side, part);
}

function recordInput(side, input, fighter) {
  recordDirection(side, input, fighter);
  if (input.punch) rememberCommand(side, "punch");
  if (input.kick) rememberCommand(side, "kick");
  if (input.enhanced) rememberCommand(side, "enhanced");
}

function tryFinish(side, input) {
  if (state.phase !== "finish" || state.finishWinner !== side) return false;
  if (!input.final) return false;
  // Input resolution only emits `final` for a fresh LP (A) or LK (B). There is
  // intentionally no distance check: the winner can finish from anywhere.
  const type = state.graphicFatalities ? (input.finisherVariant === 1 ? 1 : 0) : 0;
  finishRound(side, type);
  return true;
}

function directionContext(fighter, input) {
  const absolute = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  return {
    absolute,
    forwardHeld: absolute === fighter.facing,
    backHeld: absolute === -fighter.facing,
  };
}

const advancedActions = new Set([
  "throwObject",
  "commandSpecial",
  "launcher",
  "driveHeavy",
  "enhanced",
  "guardReversal",
  "super",
  ...KIT_ACTIONS,
]);

function beginAttack(fighter, action, input = {}, { reversal = false, force = false, cancelledFrom = "", limb = "", backThrow = null } = {}) {
  if (!force && (fighter.attacking || fighter.stun > 0 || fighter.down || fighter.wakeupFrames > 0)) return false;
  const actionGroup = fighterActionGroup(action);
  if (actionGroup === "throw" && !fighter.grounded) return false;
  if (advancedActions.has(action) && !fighter.grounded) return false;
  const direction = directionContext(fighter, input);
  const moveContext = {
    airborne: !fighter.grounded,
    crouching: fighter.crouch || Boolean(input.down),
    forwardHeld: direction.forwardHeld,
    limb: limb || input.limb || "punch",
  };
  if (action === "throwObject" && fighter.throwableUses <= 0) return false;
  if (action === "throwObject") {
    const profile = getThrowable(fighter.kitId);
    const activeObjects = state.projectiles.filter((projectile) => projectile.ownerSide === fighter.side && projectile.throwable === profile?.id);
    if (profile && activeObjects.length >= profile.maxActive) return false;
  }
  const throwObjectProfile = action === "throwObject"
    ? createThrowObjectMove(fighter.kitId, { strength: input.heavy ? "heavy" : "light" })
    : null;
  if (action === "throwObject" && !throwObjectProfile) return false;
  const kitMove = throwObjectProfile
    ? createAttackInstance(throwObjectProfile.baseKind, { ...throwObjectProfile, profileId: throwObjectProfile.id })
    : createFighterMove(fighter.kitId, action, moveContext);
  const gritCost = kitMove && !throwObjectProfile
    ? fighterActionCost(fighter.kitId, action, moveContext)
    : gritCostForAction(action);
  if (fighter.meter < gritCost) return false;
  const validLink = !cancelledFrom
    && fighter.linkWindow?.connected === "hit"
    && fighter.linkWindow.expiresFrame >= state.simulationTick
    && ["light", "heavy"].includes(actionGroup);
  const linkedFrom = validLink ? fighter.linkWindow.profileId : "";
  fighter.attacking = kitMove || (advancedActions.has(action)
    ? createAdvancedMove(action)
    : createCombatMove(action, moveContext));
  if (fighter.def.boss) {
    fighter.attacking.damage = Number((fighter.attacking.damage * 1.08).toFixed(4));
    fighter.attacking.chipDamage = Number(((fighter.attacking.chipDamage || 0) * 1.08).toFixed(4));
    if (fighter.attacking.advanceSpeed) fighter.attacking.advanceSpeed *= 1.04;
  }
  fighter.attackSerial += 1;
  fighter.attacking.attackSerial = fighter.attackSerial;
  if (throwObjectProfile) {
    fighter.throwableUses = Math.max(0, fighter.throwableUses - 1);
    fighter.throwableSpawned = false;
    updateHud();
  }
  if (actionGroup === "throw") {
    fighter.attacking.backThrow = Boolean(backThrow ?? input.throwBack);
  }
  const activeFlow = fighter.def.id === "ali"
    && fighter.rhythmStacks > 0
    && state.simulationTick <= fighter.rhythmExpiresFrame;
  if (activeFlow) {
    const flow = fighter.rhythmStacks;
    fighter.attacking.rhythmBoost = flow;
    fighter.attacking.damage = Number((fighter.attacking.damage * (1 + flow * 0.035)).toFixed(4));
    if (fighter.attacking.advanceSpeed) fighter.attacking.advanceSpeed *= 1 + flow * 0.055;
    fighter.attacking.hitstunFrames += flow;
  }
  if (state.mode === "training" && fighter.side === 0) {
    const move = fighter.attacking;
    const startup = Number.isFinite(move.startupFrames) ? move.startupFrames : move.activeStartFrame;
    const active = Number.isFinite(move.activeFrames)
      ? move.activeFrames
      : Math.max(1, move.activeEndFrame - move.activeStartFrame + 1);
    const recovery = Number.isFinite(move.recoveryFrames)
      ? move.recoveryFrames
      : Math.max(0, move.durationFrames - move.activeEndFrame);
    state.training.lastMove = {
      name: move.moveName || move.profileId || move.kind,
      startup,
      active,
      recovery,
      onHit: (move.hitstunFrames || 0) - recovery,
      onBlock: (move.blockstunFrames || 0) - recovery,
    };
    state.training.lastAdvantage = null;
  }
  fighter.meter = clamp(fighter.meter - gritCost, 0, GRIT_RULES.maximum);
  fighter.attackTime = 0;
  fighter.attackFrame = 0;
  fighter.attackHit = false;
  fighter.attackHits = 0;
  fighter.armorHits = 0;
  fighter.lastAttackHitFrame = -Infinity;
  fighter.attackConnected = "";
  fighter.cancelledFrom = cancelledFrom;
  fighter.linkedFrom = linkedFrom;
  fighter.counterTriggered = false;
  fighter.trapDeployed = false;
  fighter.projectileSpawnFrames.clear();
  fighter.linkWindow = null;
  fighter.block = false;
  fighter.guarding = false;
  fighter.blockstunFrames = force ? 0 : fighter.blockstunFrames;
  fighter.hitstunFrames = force ? 0 : fighter.hitstunFrames;
  fighter.stun = force ? 0 : fighter.stun;
  fighter.dashFrames = 0;
  fighter.queuedDashDirection = 0;
  fighter.lastHitResult = reversal ? "reversal" : "";
  if (reversal || fighter.attacking.reversalInvulnerableFrames) {
    fighter.invulnerableFrames = Math.max(
      fighter.invulnerableFrames,
      fighter.attacking.reversalInvulnerableFrames || DEFENSE_RULES.reversalWindowFrames,
    );
  }
  if (reversal) {
    const label = action === "guardReversal" ? "GRIT REVERSAL" : "REVERSAL";
    fighter.lastHitResult = action === "guardReversal" ? "guard-reversal" : "reversal";
    spawnCombatText(fighter.x, fighter.y - fighter.height - 25, label, fighter.def.accent);
  }
  if (fighter.attacking.kind === "special") fighter.specialGlow = fighter.attacking.superMove ? 1.25 : 0.7;
  if (fighter.attacking.superMove) {
    if ($("#flashToggle").checked) state.flash = Math.max(state.flash, 0.22);
    state.hitstop = Math.max(state.hitstop, 0.09);
    spawnCombatText(fighter.x, fighter.y - fighter.height - 35, "FULL GRIT SUPER", fighter.def.accent);
  }
  if (linkedFrom) spawnCombatText(fighter.x, fighter.y - fighter.height - 20, "LINK", fighter.def.accent);
  const suppressFlowMoveLabel = fighter.def.id === "ali"
    && cancelledFrom
    && fighter.rhythmStacks >= 2;
  if (fighter.attacking.moveName && !suppressFlowMoveLabel) {
    spawnCombatText(
      fighter.x + fighter.facing * 28,
      fighter.y - fighter.height - 42,
      fighter.attacking.moveName,
      fighter.def.accent,
    );
  }
  updateHud();
  sound(fighter.attacking.superMove ? "super" : actionGroup === "throw" ? "throw" : fighter.attacking.kind, fighter);
  return true;
}

const bufferedActions = [
  "jump",
  "throwObject",
  "throw",
  "super",
  "enhanced",
  "launcher",
  "driveHeavy",
  "commandSpecial",
  "light",
  "heavy",
  "special",
  ...KIT_ACTIONS,
];

function bufferActionInputs(fighter, input) {
  const limbPayload = input.limb === "kick" ? { limb: "kick" } : null;
  const throwPayload = input.throwBack ? { back: true } : null;
  for (const action of bufferedActions) {
    if (!input[action]) continue;
    const payload = action === "light" || action === "heavy" ? limbPayload
      : action === "throw" ? throwPayload
        : null;
    fighter.inputBuffer.push(action, state.simulationTick, payload);
  }
  fighter.inputBuffer.prune(state.simulationTick);
}

function trackDirectionalPresses(fighter, input) {
  const previous = fighter.previousDirectionalInput;
  for (const direction of ["left", "right"]) {
    if (input[direction] && !previous[direction]
      && fighter.directionTapTracker.press(direction, state.simulationTick)) {
      fighter.queuedDashDirection = direction === "right" ? 1 : -1;
    }
  }
  previous.left = Boolean(input.left);
  previous.right = Boolean(input.right);
}

const PROXIMITY_GRAB_RANGE = Math.round(104 * FIGHTER_SCALE);

function inProximityGrabRange(fighter, opponent) {
  return Boolean(opponent)
    && fighter.grounded
    && opponent.grounded
    && !opponent.down
    && opponent.wakeupFrames <= 0
    && opponent.hitstunFrames <= 0
    && opponent.blockstunFrames <= 0
    && opponent.throwInvulnerableFrames <= 0
    && Math.abs(opponent.x - fighter.x) <= PROXIMITY_GRAB_RANGE;
}

/**
 * SF2-style proximity throw: touching a valid opponent and pressing toward or
 * away plus LP or LK grabs instead of throwing out the ordinary normal. Outside
 * grab range the same press stays an ordinary normal, so there is no separate
 * grab-whiff animation and no extra button.
 */
function applyProximityGrab(fighter, normalized) {
  if (state.phase !== "fight") return;
  if (!normalized.light || normalized.heavy || normalized.throw) return;
  if (fighter.attacking || fighter.hitstunFrames > 0 || fighter.blockstunFrames > 0) return;
  const direction = directionContext(fighter, normalized);
  if (!direction.forwardHeld && !direction.backHeld) return;
  if (!inProximityGrabRange(fighter, state.fighters[1 - fighter.side])) return;
  normalized.throw = true;
  normalized.throwBack = direction.backHeld;
  normalized.light = false;
  normalized.punch = false;
  normalized.kick = false;
}

function prepareFighterInput(fighter, input) {
  const side = fighter.side;
  const finishing = state.phase === "finish" && state.finishWinner === side;
  const source = input?.fourButton
    ? resolveFourButtonInput(input, {
      facing: fighter.facing,
      style: activeControlStyle(side),
      meter: fighter.meter,
      finishing,
      finishArmed: state.finishArmed[side],
    })
    : input;
  const normalPress = Boolean(source.light || source.heavy);
  const limb = source.limb === "kick" ? "kick" : "punch";
  const normalized = {
    left: Boolean(source.left),
    right: Boolean(source.right),
    down: Boolean(source.down),
    guard: Boolean(source.guard),
    jump: Boolean(source.jump),
    light: Boolean(source.light),
    heavy: Boolean(source.heavy),
    special: Boolean(source.special),
    enhanced: Boolean(source.enhanced),
    throw: Boolean(source.throw),
    throwBack: Boolean(source.throwBack),
    super: Boolean(source.super || (source.final && state.phase === "fight")),
    final: Boolean(source.final),
    finisherVariant: Number.isInteger(source.finisherVariant) ? source.finisherVariant : 0,
    limb,
    punch: Boolean(source.punch ?? (normalPress && limb === "punch")),
    kick: Boolean(source.kick ?? (normalPress && limb === "kick")),
  };
  for (const action of advancedActions) normalized[action] = Boolean(normalized[action] || source[action]);
  Object.assign(normalized, applyControlStyle(normalized, activeControlStyle(side), fighter.facing));
  recordInput(side, normalized, fighter);
  if (state.phase === "fight") {
    const command = recognizeFighterCommand(
      fighter.kitId,
      commandHistory[side],
      state.simulationTick,
    ) || recognizeCombatCommand(commandHistory[side], state.simulationTick);
    const terminal = command?.terminal
      || (command?.action === "commandSpecial" ? "special" : "heavy");
    const affordable = command?.action !== "super" || fighter.meter >= GRIT_RULES.superCost;
    if (command && affordable && normalized[terminal]) {
      normalized[command.action] = true;
      normalized.punch = false;
      normalized.kick = false;
      normalized.light = false;
      normalized.heavy = false;
      normalized.enhanced = false;
      commandHistory[side].splice(0, command.endIndex + 1);
    }
    // A completed motion always beats the proximity grab shortcut, so close-range
    // command specials stay reachable while touching an opponent.
    applyProximityGrab(fighter, normalized);
    bufferActionInputs(fighter, normalized);
    trackDirectionalPresses(fighter, normalized);
    if (normalized.throw) fighter.lastThrowInputFrame = state.simulationTick;
  }
  return normalized;
}

function recoverFromDizzy(fighter) {
  fighter.dizzyFrames = 0;
  fighter.dizzyTotalFrames = 0;
  fighter.dizzyMashCount = 0;
  fighter.stunMeter = 0;
  fighter.stunDecayDelay = 0;
  // A long immunity after recovery is what makes dizzy loops impossible.
  fighter.stunImmuneFrames = STUN_RULES.immuneFrames;
  fighter.hitstunFrames = 0;
  fighter.stun = 0;
  fighter.invulnerableFrames = Math.max(fighter.invulnerableFrames, 6);
  spawnCombatText(fighter.x, fighter.y - fighter.height - 40, "SHAKE IT OFF", fighter.def.accent);
  sound("block", fighter);
}

function enterDizzy(fighter, attacker) {
  fighter.dizzyFrames = STUN_RULES.dizzyFrames;
  fighter.dizzyTotalFrames = STUN_RULES.dizzyFrames;
  fighter.dizzyMashCount = 0;
  fighter.stunMeter = 0;
  fighter.stunDecayDelay = 0;
  fighter.attacking = null;
  fighter.attackFrame = 0;
  fighter.attackTime = 0;
  fighter.hitstunFrames = 0;
  fighter.blockstunFrames = 0;
  fighter.stun = 0;
  fighter.block = false;
  fighter.guarding = false;
  fighter.dashFrames = 0;
  fighter.queuedDashDirection = 0;
  fighter.inputBuffer.clear();
  fighter.lastHitResult = "dizzy";
  state.hitstop = Math.max(state.hitstop, 0.16);
  state.shake = Math.max(state.shake, 0.34);
  if ($("#flashToggle").checked) state.flash = Math.max(state.flash, 0.2);
  spawnCombatText(fighter.x, fighter.y - fighter.height - 52, "DIZZY", "#ffd54a");
  duckMusic(0.55, 620);
  sound("ko", fighter);
}

// Mashing buttons and directions shortens the dizzy but never removes the punish
// window: the timer can never drop below STUN_RULES.minimumDizzyFrames elapsed.
function relieveDizzy(fighter, input) {
  const pressed = Boolean(input.light || input.heavy || input.special
    || input.enhanced || input.super || input.jump || input.throw);
  const directional = Boolean(input.left || input.right || input.down);
  if (!pressed && !(directional && state.simulationTick % 4 === 0)) return;
  fighter.dizzyMashCount += 1;
  const elapsed = fighter.dizzyTotalFrames - fighter.dizzyFrames;
  const floor = Math.max(0, STUN_RULES.minimumDizzyFrames - elapsed);
  fighter.dizzyFrames = Math.max(floor, fighter.dizzyFrames - STUN_RULES.mashRelief);
}

function addStun(victim, attacker, attack, { counter = false, blocked = false } = {}) {
  if (victim.stunImmuneFrames > 0 || victim.dizzyFrames > 0) return;
  const gain = stunGainForAttack(attack, { counter, blocked });
  if (gain <= 0) return;
  victim.stunMeter = Number((victim.stunMeter + gain).toFixed(3));
  victim.stunDecayDelay = STUN_RULES.decayGraceFrames;
  if (victim.stunMeter >= STUN_RULES.threshold) enterDizzy(victim, attacker);
}

function enterKnockdown(fighter) {
  fighter.pendingKnockdown = false;
  fighter.down = true;
  fighter.knockdownFrames = DEFENSE_RULES.knockdownFrames;
  fighter.wakeupFrames = 0;
  fighter.hitstunFrames = 0;
  fighter.blockstunFrames = 0;
  fighter.vx *= 0.28;
  fighter.vy = 0;
  fighter.attacking = null;
  fighter.inputBuffer.clear();
}

function advanceFighterTimers(fighter) {
  fighter.justWoke = false;
  fighter.hitFlash = Math.max(0, fighter.hitFlash - SIMULATION_STEP_SECONDS);
  fighter.specialGlow = Math.max(0, fighter.specialGlow - SIMULATION_STEP_SECONDS);
  fighter.invulnerableFrames = Math.max(0, fighter.invulnerableFrames - 1);
  fighter.throwInvulnerableFrames = Math.max(0, fighter.throwInvulnerableFrames - 1);
  fighter.dashCooldownFrames = Math.max(0, fighter.dashCooldownFrames - 1);
  fighter.reversalWindowFrames = Math.max(0, fighter.reversalWindowFrames - 1);
  fighter.throwTechFlashFrames = Math.max(0, fighter.throwTechFlashFrames - 1);
  fighter.confirmWindowFrames = Math.max(0, fighter.confirmWindowFrames - 1);
  fighter.landingRecoveryFrames = Math.max(0, fighter.landingRecoveryFrames - 1);
  fighter.stunImmuneFrames = Math.max(0, fighter.stunImmuneFrames - 1);
  fighter.slowFrames = Math.max(0, (fighter.slowFrames || 0) - 1);
  if (fighter.dizzyFrames > 0) {
    fighter.dizzyFrames -= 1;
    if (fighter.dizzyFrames === 0) recoverFromDizzy(fighter);
  } else if (fighter.stunDecayDelay > 0) {
    fighter.stunDecayDelay -= 1;
  } else if (fighter.stunMeter > 0) {
    fighter.stunMeter = Math.max(0, Number((fighter.stunMeter - STUN_RULES.decayPerFrame).toFixed(3)));
  }
  if (fighter.rhythmStacks > 0 && state.simulationTick > fighter.rhythmExpiresFrame) {
    fighter.rhythmStacks = 0;
    fighter.rhythmExpiresFrame = 0;
    fighter.rhythmLastAttackSerial = -1;
    if (fighter.def.id === "ali") spawnCombatText(fighter.x, fighter.y - fighter.height - 20, "FLOW LOST", fighter.def.accent);
  }

  if (fighter.down && fighter.grounded) {
    fighter.knockdownFrames = Math.max(0, fighter.knockdownFrames - 1);
    if (fighter.knockdownFrames === 0) {
      fighter.down = false;
      fighter.wakeupFrames = DEFENSE_RULES.wakeupFrames;
      fighter.throwInvulnerableFrames = DEFENSE_RULES.throwInvulnerableFrames;
    }
  } else if (fighter.wakeupFrames > 0) {
    fighter.wakeupFrames -= 1;
    if (fighter.wakeupFrames === 0) {
      fighter.justWoke = true;
      fighter.juggleCount = 0;
      fighter.reversalWindowFrames = DEFENSE_RULES.reversalWindowFrames;
      fighter.invulnerableFrames = DEFENSE_RULES.reversalWindowFrames;
    }
  } else {
    fighter.hitstunFrames = Math.max(0, fighter.hitstunFrames - 1);
    fighter.blockstunFrames = Math.max(0, fighter.blockstunFrames - 1);
  }
  fighter.stun = Math.max(fighter.hitstunFrames, fighter.blockstunFrames) / SIMULATION_HZ;
}

function startDash(fighter, direction) {
  const forward = direction === fighter.facing;
  fighter.dashDirection = direction;
  fighter.dashFrames = forward ? fighter.movement.forwardDashFrames : fighter.movement.backDashFrames;
  fighter.dashCooldownFrames = fighter.dashFrames + fighter.movement.dashCooldownFrames;
  fighter.queuedDashDirection = 0;
  fighter.block = false;
  fighter.guarding = false;
  fighter.crouch = false;
  if (!forward) fighter.invulnerableFrames = Math.max(fighter.invulnerableFrames, fighter.movement.backDashInvulnerableFrames);
  sound("dash", fighter);
}

function spawnKnockdownImpact(fighter, landingVelocity) {
  const force = clamp(Math.abs(landingVelocity) / 760, 0.55, 1.35);
  const count = Math.max(5, Math.round(14 * force * state.performance.particleScale));
  for (let index = 0; index < count; index += 1) {
    const direction = visualRandom() < 0.5 ? -1 : 1;
    state.particles.push({
      kind: "dust",
      x: fighter.x + (visualRandom() - 0.5) * 54,
      y: FLOOR - 3,
      vx: direction * (40 + visualRandom() * 210) * force,
      vy: -35 - visualRandom() * 150 * force,
      gravity: 440,
      drag: 0.96,
      life: 0.25 + visualRandom() * 0.42,
      max: 0.67,
      size: 4 + visualRandom() * 10,
      color: visualRandom() > 0.4 ? "#777067" : "#4e4a46",
    });
  }
  state.effects.push({
    kind: "floorImpact", x: fighter.x, y: FLOOR - 4,
    width: 62 + force * 74, life: 0.44, max: 0.44, color: "#b7a99a",
  });
  if (state.graphicFatalities) {
    const life = 2.4 + force;
    state.effects.push({
      kind: "bloodDecal", tier: "heavy", x: fighter.x, y: FLOOR + 3,
      width: 28 + force * 34, life, max: life, color: "#65060c",
    });
  }
  applyViolenceResponse(force > 1.08 ? "throw" : "heavy");
  sound("hit-heavy", state.fighters[state.lastImpactSide] || fighter);
}

function applyFighterPhysics(fighter, dt) {
  fighter.vy += GRAVITY * dt;
  fighter.x += fighter.vx * dt;
  fighter.y += fighter.vy * dt;
  if (fighter.y >= FLOOR) {
    const landed = !fighter.grounded;
    const landingVelocity = fighter.vy;
    const violentLanding = landed && fighter.pendingKnockdown;
    fighter.y = FLOOR;
    fighter.vy = 0;
    fighter.grounded = true;
    if (fighter.pendingKnockdown) {
      enterKnockdown(fighter);
      if (violentLanding) spawnKnockdownImpact(fighter, landingVelocity);
    }
    else if (landed && fighter.attacking?.profileId.startsWith("air-")) {
      fighter.attacking = null;
      fighter.attackTime = 0;
      fighter.attackFrame = 0;
      fighter.landingRecoveryFrames = DEFENSE_RULES.airAttackLandingRecoveryFrames;
    } else if (landed && !fighter.down) {
      // Even an empty jump costs a few frames on the way down.
      fighter.landingRecoveryFrames = Math.max(fighter.landingRecoveryFrames, DEFENSE_RULES.landingRecoveryFrames);
    }
  } else {
    fighter.grounded = false;
  }
  fighter.x = clamp(fighter.x, MOVEMENT_RULES.stageMinX, MOVEMENT_RULES.stageMaxX);
}

const attackActionPriority = [...TOURNAMENT_ACTION_PRIORITY];

function bufferedAction(fighter, actions = attackActionPriority) {
  return actions.find((action) => fighter.inputBuffer.has(action, state.simulationTick)) || null;
}

function tryStartBufferedAttack(fighter, input, actions = attackActionPriority, options = {}) {
  for (const action of actions) {
    const entry = fighter.inputBuffer.consume(action, state.simulationTick);
    if (!entry) continue;
    const started = beginAttack(fighter, action, input, {
      ...options,
      reversal: Boolean(options.reversalActions?.includes(action)),
      limb: entry.payload?.limb,
      backThrow: action === "throw" ? Boolean(entry.payload?.back) : null,
    });
    if (started) return true;
  }
  return false;
}

function tryGuardReversal(fighter, input) {
  if (!fighter.grounded || fighter.blockstunFrames <= 0 || fighter.meter < GRIT_RULES.guardReversalCost) return false;
  const direction = directionContext(fighter, input);
  const enhanced = fighter.inputBuffer.has("enhanced", state.simulationTick);
  const directionalSpecial = direction.forwardHeld
    && (fighter.inputBuffer.has("special", state.simulationTick)
      || fighter.inputBuffer.has("commandSpecial", state.simulationTick));
  if (!enhanced && !directionalSpecial) return false;
  if (enhanced) fighter.inputBuffer.consume("enhanced", state.simulationTick);
  else fighter.inputBuffer.consume(["commandSpecial", "special"], state.simulationTick);
  return beginAttack(fighter, "guardReversal", input, { force: true, reversal: true });
}

function tryAttackCancel(fighter, input) {
  const current = fighter.attacking;
  if (!current || !fighter.attackConnected) return false;
  const action = bufferedAction(fighter, attackActionPriority.filter((candidate) => candidate !== "throw"));
  const actionGroup = fighterActionGroup(action);
  if (current.rhythmCancel && fighter.rhythmStacks < (current.rhythmCancelStacks || 2)) return false;
  if (!action || !canCancelAttack(current, actionGroup, fighter.attackFrame, fighter.attackConnected)) return false;
  const queuedLimb = fighter.inputBuffer.entries.find((entry) => entry.action === action)?.payload?.limb;
  const moveContext = {
    airborne: !fighter.grounded,
    crouching: fighter.crouch,
    limb: queuedLimb || input.limb || "punch",
    ...directionContext(fighter, input),
  };
  const gritCost = createFighterMove(fighter.kitId, action, moveContext)
    ? fighterActionCost(fighter.kitId, action, moveContext)
    : gritCostForAction(action);
  if (fighter.meter < gritCost) return false;
  const consumed = fighter.inputBuffer.consume(action, state.simulationTick);
  const cancelLimb = consumed?.payload?.limb || queuedLimb || "";
  const previousMove = current.profileId;
  const voltageCancel = Boolean(current.rushCancel
    && ["special", "commandSpecial", "enhanced"].includes(actionGroup));
  const flowCancel = Boolean(current.rhythmCancel
    && fighter.rhythmStacks >= (current.rhythmCancelStacks || 2));
  fighter.attacking = null;
  const started = beginAttack(fighter, action, input, { cancelledFrom: previousMove, limb: cancelLimb });
  if (!started) {
    fighter.attacking = current;
    return false;
  }
  fighter.confirmWindowFrames = 12;
  const chain = ["light", "heavy", "launcher", "driveHeavy"].includes(actionGroup);
  spawnCombatText(
    fighter.x + fighter.facing * 35,
    fighter.y - fighter.height - 22,
    voltageCancel ? "VOLTAGE CANCEL" : flowCancel ? "FLOW CANCEL" : chain ? "CHAIN" : "HIT CONFIRM",
    fighter.def.accent,
  );
  return true;
}

function tryStartupChordOverride(fighter, input) {
  const current = fighter.attacking;
  if (!current || fighter.attackConnected) return false;
  let action = null;
  const bufferedEnhanced = bufferedAction(fighter, [
    "enhancedLauncher",
    "enhancedBackSpecial",
    "enhancedCommandSpecial",
    "enhanced",
  ]);
  // The super and enhanced chords are two buttons, so the first of the pair can
  // land a frame early and start an ordinary normal. Let the chord take over
  // during that normal's startup rather than eating the input.
  if (fighter.attackFrame <= 6
    && ["heavy", "special"].includes(current.kind)
    && fighter.inputBuffer.has("super", state.simulationTick)
    && fighter.meter >= GRIT_RULES.superCost) action = "super";
  else if (fighter.attackFrame <= 6
    && ["heavy", "special"].includes(current.kind)
    && bufferedEnhanced
    && fighter.meter >= GRIT_RULES.enhancedSpecialCost) action = bufferedEnhanced;
  else if (fighter.attackFrame <= 3
    && ["light", "heavy"].includes(current.kind)
    && fighter.inputBuffer.has("throw", state.simulationTick)) action = "throw";
  if (!action) return false;
  const consumedOverride = fighter.inputBuffer.consume(action, state.simulationTick);
  const previousMove = current.profileId;
  fighter.attacking = null;
  const started = beginAttack(fighter, action, input, {
    cancelledFrom: previousMove,
    backThrow: action === "throw" ? Boolean(consumedOverride?.payload?.back) : null,
  });
  if (!started) {
    fighter.attacking = current;
    return false;
  }
  spawnCombatText(fighter.x, fighter.y - fighter.height - 18, fighterActionGroup(action) === "enhanced" ? "ENHANCED" : "THROW", fighter.def.accent);
  return true;
}

function updateFighter(fighter, opponent, input, dt) {
  fighter.animTime += dt;
  advanceFighterTimers(fighter);
  fighter.block = false;
  fighter.guarding = false;
  fighter.crouch = false;

  if (tryFinish(fighter.side, input)) return;
  if (state.phase !== "fight") return;
  // A live grab owns both fighters until updateGrabHolds releases them.
  if (fighter.grabbed) {
    fighter.inputBuffer.clear();
    return;
  }
  if (fighter.grabbing) {
    fighter.vx = 0;
    if (fighter.attacking) {
      fighter.attackFrame = Math.min(fighter.attackFrame + 1, fighter.attacking.activeEndFrame);
      fighter.attackTime = fighter.attackFrame * SIMULATION_STEP_SECONDS;
    }
    return;
  }
  if (fighter.dizzyFrames > 0) {
    relieveDizzy(fighter, input);
    fighter.vx *= 0.82;
    fighter.inputBuffer.clear();
    applyFighterPhysics(fighter, dt);
    return;
  }
  const flowSpeed = fighter.def.id === "ali" ? 1 + fighter.rhythmStacks * 0.045 : 1;

  if (fighter.blockstunFrames > 0 && tryGuardReversal(fighter, input)) {
    // The reversal replaces blockstun and continues into normal attack processing.
  } else if (fighter.blockstunFrames > 0) {
    fighter.block = true;
    fighter.guarding = true;
    fighter.crouch = fighter.guardHeight === "low";
    fighter.vx *= 0.84;
  } else if (fighter.hitstunFrames > 0 || fighter.pendingKnockdown) {
    fighter.vx *= 0.9;
  } else if (fighter.down || fighter.wakeupFrames > 0 || fighter.landingRecoveryFrames > 0 || fighter.throwTechFlashFrames > 0) {
    fighter.vx *= 0.72;
  } else if (!fighter.attacking) {
    const direction = directionContext(fighter, input);
    if (!fighter.grounded) {
      fighter.queuedDashDirection = 0;
      const bufferedAirAttack = fighter.inputBuffer.consume(["special", "heavy", "light"], state.simulationTick);
      if (bufferedAirAttack) {
        beginAttack(fighter, bufferedAirAttack.action, input, { limb: bufferedAirAttack.payload?.limb });
      }
    } else {
      fighter.crouch = input.down;
      fighter.guardHeight = fighter.crouch ? "low" : "high";
      // SF2 directional guarding: hold away to block, down-away to crouch-block.
      // Crouching alone never blocks and there is no dedicated guard button.
      fighter.guarding = direction.backHeld || Boolean(input.guard);
      fighter.block = fighter.guarding;

      if (fighter.justWoke && fighter.inputBuffer.has("special", state.simulationTick)) {
        fighter.inputBuffer.consume("special", state.simulationTick);
        beginAttack(fighter, "special", input, { reversal: true });
      } else {
        const commandAction = bufferedAction(fighter, [
          "super",
          "enhancedLauncher",
          "enhancedBackSpecial",
          "enhancedCommandSpecial",
          "enhanced",
          "launcher",
          "backSpecial",
          "driveHeavy",
          "commandSpecial",
        ]);
        if (commandAction) {
          fighter.inputBuffer.consume(commandAction, state.simulationTick);
          beginAttack(fighter, commandAction, input, {
            reversal: fighter.reversalWindowFrames > 0
              && ["commandSpecial", "backSpecial", "launcher", "enhancedLauncher"].includes(commandAction),
          });
        } else if (fighter.queuedDashDirection && fighter.dashCooldownFrames === 0 && !fighter.crouch) {
          startDash(fighter, fighter.queuedDashDirection);
        }
      }

      if (fighter.dashFrames <= 0 && !fighter.attacking) {
        // Carrying a stage weapon is too heavy to jump with, but it must not
        // freeze the fighter in place either: the walk still runs below.
        const carryProfile = fighter.carriedWeapon ? stageWeaponProfile() : null;
        const jumpBuffered = fighter.inputBuffer.has("jump", state.simulationTick);
        if (carryProfile?.carryBlocksJump && jumpBuffered) {
          fighter.inputBuffer.consume("jump", state.simulationTick);
          if (fighter.carryFrames % 30 === 0) {
            spawnCombatText(fighter.x, fighter.y - fighter.height - 18, "TOO HEAVY", "#8a93a5");
          }
        }
        if (!carryProfile?.carryBlocksJump && fighter.inputBuffer.has("jump", state.simulationTick)) {
          fighter.inputBuffer.consume("jump", state.simulationTick);
          fighter.vy = fighter.movement.jumpVelocityY;
          fighter.vx = direction.forwardHeld ? fighter.facing * fighter.movement.forwardJumpVelocityX
            : direction.backHeld ? -fighter.facing * fighter.movement.backJumpVelocityX
              : fighter.movement.neutralJumpVelocityX;
          fighter.grounded = false;
          fighter.block = false;
          fighter.guarding = false;
          sound("jump", fighter);
        } else {
          if (fighter.crouch) fighter.vx = 0;
          else if (direction.absolute) {
            const speed = direction.forwardHeld ? fighter.movement.forwardWalkSpeed : fighter.movement.backWalkSpeed;
            const snare = fighter.slowFrames > 0 ? 0.55 : 1;
            const carry = fighter.carriedWeapon ? (stageWeaponProfile()?.carryWalkScale ?? 1) : 1;
            fighter.vx = direction.absolute * speed * flowSpeed * snare * carry;
          } else fighter.vx = 0;
          if (Math.abs(fighter.vx) > 20) fighter.walkTime += dt;
        }

        // Down + HP over a grounded weapon picks it up; outside pickup range the
        // same press stays an ordinary crouching HP. While carrying, the weapon
        // *replaces* HP entirely, so a heavy press either throws it or is
        // swallowed rather than leaking out as a normal.
        if (fighter.carriedWeapon) {
          const threw = tryThrowStageWeapon(fighter, input);
          fighter.inputBuffer.consume("heavy", state.simulationTick);
          if (threw) return;
        } else if (tryPickUpStageWeapon(fighter, input)) {
          fighter.inputBuffer.consume("heavy", state.simulationTick);
          return;
        }
        tryStartBufferedAttack(fighter, input, attackActionPriority, {
          reversalActions: fighter.reversalWindowFrames > 0
            ? ["special", "commandSpecial", "backSpecial", "launcher", "enhancedLauncher"]
            : [],
        });
      }
    }
  }

  if (fighter.dashFrames > 0 && !fighter.attacking) {
    const forward = fighter.dashDirection === fighter.facing;
    fighter.vx = fighter.dashDirection * (forward ? fighter.movement.forwardDashSpeed : fighter.movement.backDashSpeed) * flowSpeed;
    fighter.dashFrames -= 1;
    fighter.block = false;
    fighter.guarding = false;
    if (!forward && fighter.dashFrames >= fighter.movement.backDashFrames - fighter.movement.backDashInvulnerableFrames) {
      fighter.invulnerableFrames = Math.max(fighter.invulnerableFrames, 1);
    }
  }

  if (fighter.attacking) {
    fighter.attackFrame += 1;
    fighter.attackTime = fighter.attackFrame * SIMULATION_STEP_SECONDS;
    const attack = fighter.attacking;
    maybeDeployTrap(fighter, attack);
    maybeSpawnThrowable(fighter, attack);
    maybeSpawnProjectile(fighter, attack);
    if (attack.retreatSpeed && fighter.attackFrame < attack.activeEndFrame) fighter.vx = -fighter.facing * attack.retreatSpeed;
    else if (attack.advanceSpeed && fighter.attackFrame < attack.activeEndFrame) fighter.vx = fighter.facing * attack.advanceSpeed;
    else fighter.vx *= fighter.grounded ? 0.82 : 0.985;
    fighter.crouch = attack.profileId.startsWith("crouch-");
    const cancelled = tryStartupChordOverride(fighter, input) || tryAttackCancel(fighter, input);
    if (!cancelled && fighter.attackFrame >= attack.totalFrames) {
      fighter.linkWindow = fighter.attackConnected ? {
        profileId: attack.profileId,
        connected: fighter.attackConnected,
        expiresFrame: state.simulationTick + DEFAULT_INPUT_BUFFER_FRAMES,
      } : null;
      fighter.attacking = null;
      fighter.attackTime = 0;
      fighter.attackFrame = 0;
    }
  }

  applyFighterPhysics(fighter, dt);
}

function maybeDeployTrap(fighter, attack) {
  const profile = attack?.trap;
  if (!profile || fighter.trapDeployed || fighter.attackFrame < profile.deployFrame) return;
  fighter.trapDeployed = true;
  const color = profile.color || "#ff3fbf";
  const offsets = profile.offsets || [110];
  const newTraps = offsets.map((offset, index) => ({
    id: `${fighter.side}-${state.simulationTick}-${index}`,
    ownerSide: fighter.side,
    x: clamp(fighter.x + fighter.facing * offset, MOVEMENT_RULES.stageMinX + 12, MOVEMENT_RULES.stageMaxX - 12),
    y: FLOOR,
    radius: profile.radius,
    damage: profile.damage,
    chipDamage: profile.chipDamage,
    hitstunFrames: profile.hitstunFrames,
    blockstunFrames: profile.blockstunFrames,
    push: profile.push,
    knockdown: profile.knockdown,
    armFrames: profile.armFramesByIndex?.[index] ?? profile.armFrames,
    lifeFrames: profile.lifetimeFrames,
    maxLifeFrames: profile.lifetimeFrames,
    enhanced: offsets.length > 1,
    color,
  }));
  const ownerTraps = state.traps.filter((trap) => trap.ownerSide === fighter.side);
  const removeCount = Math.max(0, ownerTraps.length + newTraps.length - (profile.maxOwned || 2));
  if (removeCount) {
    const retired = new Set(ownerTraps.slice(0, removeCount).map((trap) => trap.id));
    state.traps = state.traps.filter((trap) => !retired.has(trap.id));
  }
  state.traps.push(...newTraps);
  for (const trap of newTraps) {
    state.effects.push({ kind: "paintDeploy", x: trap.x, y: trap.y - 8, life: 0.48, max: 0.48, color });
  }
  spawnCombatText(fighter.x + fighter.facing * 82, fighter.y - fighter.height - 16, newTraps.length > 1 ? "DOUBLE TRAP" : "TRAP SET", color);
  sound("special", fighter);
}

function triggerPaintTrap(trap, victim) {
  const owner = state.fighters[trap.ownerSide];
  if (!owner) return;
  const blocked = canGuardAttack({
    level: ATTACK_LEVELS.LOW,
    guardHeight: victim.guardHeight,
    guarding: victim.guarding,
    grounded: victim.grounded,
  });
  let damage = trap.chipDamage;
  if (!blocked) {
    const comboResult = owner.combo.registerHit(state.simulationTick, victim.juggleCount);
    damage = trap.damage * comboResult.damageScale;
    owner.combo.addDamage(damage);
  }
  victim.health = blocked
    ? Math.max(1, victim.health - damage)
    : clamp(victim.health - damage, 0, 100);
  victim.lastDamageFrame = state.simulationTick;
  victim.blockstunFrames = blocked ? trap.blockstunFrames : 0;
  victim.hitstunFrames = blocked ? 0 : trap.hitstunFrames;
  victim.stun = Math.max(victim.hitstunFrames, victim.blockstunFrames) / SIMULATION_HZ;
  victim.vx = owner.facing * trap.push * (blocked ? 0.26 : 1);
  victim.lastHitResult = blocked ? "blocked-low-trap" : "paint-trap";
  victim.hitFlash = 0.13;
  if (!blocked) {
    victim.attacking = null;
    victim.attackTime = 0;
    victim.attackFrame = 0;
    victim.attackHit = false;
    victim.dashFrames = 0;
    victim.queuedDashDirection = 0;
    if (trap.knockdown) {
      victim.pendingKnockdown = true;
      victim.grounded = false;
      victim.vy = -245;
    }
  }
  owner.meter = clamp(owner.meter + 13 * GRIT_RULES.hitGainMultiplier, 0, GRIT_RULES.maximum);
  victim.meter = clamp(victim.meter + 13 * GRIT_RULES.damageTakenGainMultiplier, 0, GRIT_RULES.maximum);
  owner.attackConnected = blocked ? "block" : "hit";
  state.effects.push({ kind: "paintTrapBurst", x: trap.x, y: trap.y - 24, life: 0.62, max: 0.62, color: trap.color });
  spawnHit(trap.x, trap.y - 63, owner.def, "special", blocked, { direction: owner.facing });
  spawnCombatText(trap.x, trap.y - 112, blocked ? "WET BLOCK" : "WET PAINT!", trap.color);
  applyViolenceResponse("special", { blocked });
  state.lastImpactSide = owner.side;
  sound(blocked ? "block" : "hit-heavy", blocked ? victim : owner);
  updateHud();
}

function updatePaintTraps() {
  if (!state.traps.length) return;
  for (const trap of state.traps) {
    trap.lifeFrames -= 1;
    trap.armFrames = Math.max(0, trap.armFrames - 1);
    if (trap.lifeFrames <= 0 || trap.armFrames > 0) continue;
    const victim = state.fighters[1 - trap.ownerSide];
    if (!victim || !victim.grounded || victim.down || victim.wakeupFrames > 0 || victim.invulnerableFrames > 0) continue;
    if (Math.abs(victim.x - trap.x) > trap.radius) continue;
    trap.triggered = true;
    triggerPaintTrap(trap, victim);
  }
  state.traps = state.traps.filter((trap) => trap.lifeFrames > 0 && !trap.triggered);
}

function maybeSpawnThrowable(fighter, attack) {
  if (!attack?.throwableId || fighter.throwableSpawned) return;
  if (fighter.attackFrame < attack.activeStartFrame) return;
  const profile = getThrowable(fighter.kitId);
  if (!profile) return;
  const variant = attack.throwableVariant && profile.variants?.[attack.throwableVariant]
    ? profile.variants[attack.throwableVariant]
    : null;
  const flight = variant ? { ...profile, ...variant } : profile;
  fighter.throwableSpawned = true;
  const scale = FIGHTER_SCALE;
  state.projectiles.push({
    id: `${fighter.side}-obj-${state.simulationTick}`,
    ownerSide: fighter.side,
    throwable: profile.id,
    x: fighter.x + fighter.facing * flight.spawnX * scale,
    y: FLOOR + flight.spawnY * scale,
    vx: fighter.facing * flight.speed * scale,
    vy: flight.launchY * scale,
    gravity: flight.gravity * scale,
    direction: fighter.facing,
    width: flight.width * scale,
    height: flight.height * scale,
    hazardWidth: flight.hazardWidth * scale,
    damage: flight.damage,
    chipDamage: flight.chipDamage,
    hitstunFrames: flight.hitstunFrames,
    blockstunFrames: flight.blockstunFrames,
    push: Math.round(flight.push * scale),
    level: flight.level,
    knockdown: Boolean(flight.knockdown),
    lifeFrames: flight.lifeFrames,
    maxLifeFrames: flight.lifeFrames,
    armFrames: 0,
    maxArmFrames: 0,
    bouncesLeft: flight.bounces,
    bounceDamping: flight.bounceDamping,
    hazardFrames: flight.hazardFrames,
    hazardArmFrames: flight.hazardArmFrames || 0,
    hazard: false,
    spin: flight.spin,
    spinAngle: 0,
    wobble: flight.wobble,
    tether: flight.tether ? { ...flight.tether } : null,
    slowFrames: flight.slowFrames,
    staggerFrames: flight.staggerFrames,
    impactLabel: flight.impactLabel,
    variant: attack.throwableVariant || "low",
    color: fighter.def.accent,
    style: profile.style,
    sequenceIndex: 0,
    enhanced: false,
  });
  sound("throw", fighter);
  if (!rollbackResimulating) objectSound(profile.style);
  spawnCombatText(fighter.x, fighter.y - fighter.height - 46, flight.name, fighter.def.accent);
}

function maybeSpawnProjectile(fighter, attack) {
  const profile = attack?.projectile;
  if (!profile) return;
  const spawnFrames = profile.spawnFrames || [attack.activeStartFrame];
  for (let index = 0; index < spawnFrames.length; index += 1) {
    const spawnFrame = spawnFrames[index];
    if (fighter.attackFrame < spawnFrame || fighter.projectileSpawnFrames.has(spawnFrame)) continue;
    fighter.projectileSpawnFrames.add(spawnFrame);
    const yOffset = profile.yOffsets?.[index] ?? profile.yOffsets?.[0] ?? -110;
    const xOffset = profile.xOffsets?.[index] ?? profile.xOffsets?.[0] ?? 78;
    const armFrames = profile.armFramesByIndex?.[index] ?? profile.armFrames ?? 0;
    const projectile = {
      id: `${fighter.side}-${state.simulationTick}-${index}`,
      ownerSide: fighter.side,
      x: fighter.x + fighter.facing * xOffset * FIGHTER_SCALE,
      y: FLOOR + yOffset * FIGHTER_SCALE,
      vx: fighter.facing * profile.speed * FIGHTER_SCALE,
      direction: fighter.facing,
      width: profile.width * FIGHTER_SCALE,
      height: profile.height * FIGHTER_SCALE,
      damage: profile.damage,
      chipDamage: profile.chipDamage,
      hitstunFrames: profile.hitstunFrames,
      blockstunFrames: profile.blockstunFrames,
      push: profile.push,
      level: profile.level,
      knockdown: Boolean(profile.knockdown),
      lifeFrames: profile.lifeFrames,
      maxLifeFrames: profile.lifeFrames,
      armFrames,
      maxArmFrames: armFrames,
      color: profile.color || fighter.def.accent,
      style: profile.style || "orb",
      sequenceIndex: index,
      enhanced: spawnFrames.length > 1,
    };
    const owned = state.projectiles.filter((item) => item.ownerSide === fighter.side
      && !item.throwable && !item.stageWeapon);
    if (owned.length >= (profile.maxOwned || 2)) {
      const oldest = owned[0];
      state.projectiles = state.projectiles.filter((item) => item.id !== oldest.id);
    }
    state.projectiles.push(projectile);
    state.effects.push({ kind: projectile.style === "feedback" ? "feedbackTelegraph" : "projectileLaunch", x: projectile.x, y: projectile.y, life: 0.35, max: 0.35, color: projectile.color });
    sound("special", fighter);
  }
}

const THROWABLE_IMPACT_COLORS = Object.freeze({
  pizza: ["#e8b23a", "#c4402a", "#f4e3b0"],
  mouse: ["#cfd6e2", "#7fe9ff", "#8a93a5"],
  loogie: ["#b9e37a", "#dff3b8", "#89b84f"],
  wires: ["#4f5b70", "#ff3fbf", "#9aa6bb"],
  xacto: ["#dfe6f0", "#ff5a4a", "#9fb0c6"],
  golfball: ["#ffffff", "#e6ecf5", "#c8d3e2"],
  bedbugs: ["#7a3a2c", "#c4552f", "#3d1f17"],
  vinyl: ["#1b1b1f", "#d8d8d2", "#ff4fb9"],
});

// Each object breaks, splatters or settles in its own way.
function spawnThrowableImpact(projectile, phase) {
  if (!projectile.throwable) return;
  const palette = THROWABLE_IMPACT_COLORS[projectile.style] || ["#d8d8d2"];
  const settling = phase === "settle";
  const count = Math.max(4, Math.round((settling ? 12 : 20) * state.performance.particleScale));
  for (let index = 0; index < count; index += 1) {
    const angle = settling ? -Math.PI * (0.15 + visualRandom() * 0.7) : visualRandom() * Math.PI * 2;
    const speed = (settling ? 60 : 140) + visualRandom() * (settling ? 110 : 300);
    state.particles.push({
      x: projectile.x,
      y: projectile.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.2 + visualRandom() * 0.36,
      max: 0.56,
      size: 2 + visualRandom() * (projectile.style === "pizza" ? 7 : 5),
      color: palette[Math.floor(visualRandom() * palette.length)] || palette[0],
    });
  }
  if (!rollbackResimulating) objectSound(projectile.style);
  state.effects.push({
    kind: "objectImpact",
    style: projectile.style,
    settling,
    x: projectile.x,
    y: projectile.y,
    life: 0.3,
    max: 0.3,
    color: palette[0],
  });
}

// Jez's mouse keeps its cable: a clean hit reels the victim in, a block just
// retracts it harmlessly, and a whiff leaves him in his long recovery.
function applyThrowableTether(projectile, victim, owner, blocked) {
  const tether = projectile.tether;
  if (!tether) return;
  if (blocked) {
    spawnCombatText(projectile.x, projectile.y - 40, "CABLE SLIPS", owner.def.accent);
    return;
  }
  const holdDistance = tether.holdDistance * FIGHTER_SCALE;
  const target = owner.x + owner.facing * holdDistance;
  victim.x = clamp(target, MOVEMENT_RULES.stageMinX, MOVEMENT_RULES.stageMaxX);
  victim.vx = 0;
  victim.vy = 0;
  victim.grounded = true;
  victim.pendingKnockdown = false;
  spawnCombatText((owner.x + victim.x) * 0.5, victim.y - victim.height - 30, "GET OVER HERE", owner.def.accent);
  state.shake = Math.max(state.shake, 0.26);
}

function triggerProjectile(projectile, victim) {
  const owner = state.fighters[projectile.ownerSide];
  if (!owner) return;
  const blocked = canGuardAttack({
    level: projectile.level,
    guardHeight: victim.guardHeight,
    guarding: victim.guarding,
    grounded: victim.grounded,
  });
  const armored = !blocked
    && victim.attacking?.armorFrames > 0
    && victim.attackFrame <= victim.attacking.armorFrames
    && victim.armorHits < 1;
  const counter = !blocked && !armored && isCounterHit(victim);
  let comboResult = { damageScale: 1 };
  if (!blocked) comboResult = owner.combo.registerHit(state.simulationTick, victim.juggleCount);
  const baseDamage = projectile.damage
    * (counter ? DEFENSE_RULES.counterDamageMultiplier : 1)
    * comboResult.damageScale
    * (armored ? 0.65 : 1);
  const damage = blocked ? projectile.chipDamage : baseDamage;
  victim.health = blocked ? Math.max(1, victim.health - damage) : clamp(victim.health - damage, 0, 100);
  victim.lastDamageFrame = state.simulationTick;
  victim.blockstunFrames = blocked ? projectile.blockstunFrames : 0;
  victim.hitstunFrames = blocked || armored ? 0 : projectile.hitstunFrames + (counter ? DEFENSE_RULES.counterHitstunBonusFrames : 0);
  victim.stun = Math.max(victim.hitstunFrames, victim.blockstunFrames) / SIMULATION_HZ;
  const hitDirection = Math.sign(projectile.vx) || projectile.direction || owner.facing;
  victim.vx = hitDirection * projectile.push * (blocked ? 0.27 : armored ? 0.12 : 1);
  const resultKind = projectile.style === "feedback" ? "feedback-echo" : "projectile";
  victim.lastHitResult = blocked ? `blocked-${projectile.level}-${resultKind}` : armored ? "armor" : counter ? `counter-${resultKind}` : projectile.style === "feedback" ? "feedback-echo" : `${projectile.level}-projectile`;
  victim.hitFlash = 0.13;
  if (!blocked && !armored) {
    owner.combo.addDamage(damage);
    victim.attacking = null;
    victim.attackTime = 0;
    victim.attackFrame = 0;
    victim.attackHit = false;
    victim.dashFrames = 0;
    victim.queuedDashDirection = 0;
    if (projectile.knockdown) {
      victim.pendingKnockdown = true;
      victim.grounded = false;
      victim.vy = -245;
    }
  } else if (armored) {
    victim.armorHits += 1;
    spawnCombatText(victim.x, victim.y - victim.height - 18, "SEISMIC ARMOR", victim.def.accent);
  }
  if (projectile.throwable) {
    applyThrowableTether(projectile, victim, owner, blocked);
    if (!blocked && !armored) {
      if (projectile.staggerFrames) {
        victim.hitstunFrames += projectile.staggerFrames;
        victim.stun = Math.max(victim.stun, victim.hitstunFrames / SIMULATION_HZ);
      }
      if (projectile.slowFrames) {
        victim.slowFrames = Math.max(victim.slowFrames || 0, projectile.slowFrames);
        spawnCombatText(victim.x, victim.y - victim.height - 24, "SNARED", owner.def.accent);
      }
    }
    spawnThrowableImpact(projectile, "hit");
    if (!blocked && !armored && projectile.impactLabel) {
      spawnCombatText(projectile.x, projectile.y - 58, projectile.impactLabel, owner.def.accent);
    }
    if (projectile.hazard) projectile.lifeFrames = 0;
  }
  owner.attackConnected = blocked ? "block" : "hit";
  owner.confirmWindowFrames = 12;
  owner.meter = clamp(owner.meter + 15 * GRIT_RULES.hitGainMultiplier, 0, GRIT_RULES.maximum);
  victim.meter = clamp(victim.meter + 15 * GRIT_RULES.damageTakenGainMultiplier, 0, GRIT_RULES.maximum);
  state.effects.push({ kind: projectile.style === "feedback" ? "feedbackBurst" : "projectileBurst", x: projectile.x, y: projectile.y, life: 0.5, max: 0.5, color: projectile.color });
  const impactTier = projectile.stageWeapon ? "weapon" : projectile.throwable ? "heavy" : "special";
  spawnHit(projectile.x, projectile.y, owner.def, impactTier, blocked, { direction: hitDirection, counter });
  if (projectile.style === "feedback") spawnCombatText(projectile.x, projectile.y - 86, blocked ? "ECHO BLOCK" : "FEEDBACK ECHO!", projectile.color);
  else if (counter) spawnCombatText(projectile.x, projectile.y - 72, "COUNTER", projectile.color);
  else if (!blocked && projectile.level === ATTACK_LEVELS.LOW) spawnCombatText(projectile.x, projectile.y - 61, "LOW SHOT", projectile.color);
  applyViolenceResponse(impactTier, { blocked, counter });
  state.lastImpactSide = owner.side;
  projectile.hit = true;
  sound(blocked ? "block" : "hit-heavy", blocked ? victim : owner);
  updateHud();
}

function updateProjectiles(dt) {
  for (const projectile of state.projectiles) {
    if (projectile.hit) continue;
    projectile.lifeFrames -= 1;
    projectile.armFrames = Math.max(0, (projectile.armFrames || 0) - 1);
    if (projectile.throwable) {
      const phase = stepThrowable(projectile, {
        dt,
        floorY: FLOOR,
        minX: MOVEMENT_RULES.stageMinX - 140,
        maxX: MOVEMENT_RULES.stageMaxX + 140,
      });
      if (phase === "bounce" && !rollbackResimulating) objectSound(projectile.style);
      if (phase === "settle") {
        projectile.armFrames = projectile.hazardArmFrames || 0;
        projectile.maxArmFrames = projectile.armFrames;
        spawnThrowableImpact(projectile, "settle");
      }
      if (phase === "expired") {
        projectile.lifeFrames = 0;
        spawnThrowableImpact(projectile, "expire");
      }
    } else {
      projectile.x += projectile.vx * dt;
    }
    if (projectile.lifeFrames <= 0
      || projectile.x < MOVEMENT_RULES.stageMinX - 160
      || projectile.x > MOVEMENT_RULES.stageMaxX + 160) continue;
    if (projectile.armFrames > 0) continue;
    if (!projectile.throwable && !projectile.stageWeapon) {
      const projectileBox = {
        x: projectile.x - projectile.width * 0.5,
        y: projectile.y - projectile.height * 0.5,
        width: projectile.width,
        height: projectile.height,
      };
      const rival = state.projectiles.find((other) => other !== projectile
        && other.ownerSide !== projectile.ownerSide
        && !other.throwable && !other.stageWeapon && !other.hit
        && other.lifeFrames > 0
        && (other.armFrames || 0) <= 0
        && boxesOverlap(projectileBox, {
          x: other.x - other.width * 0.5,
          y: other.y - other.height * 0.5,
          width: other.width,
          height: other.height,
        }));
      if (rival) {
        projectile.hit = true;
        rival.hit = true;
        state.effects.push({ kind: "projectileClash", x: (projectile.x + rival.x) * 0.5, y: (projectile.y + rival.y) * 0.5, life: 0.36, max: 0.36, color: "#ffffff" });
        spawnCombatText((projectile.x + rival.x) * 0.5, Math.min(projectile.y, rival.y) - 48, "CLASH", "#7fe9ff");
        sound("block");
        continue;
      }
    }
    const victim = state.fighters[1 - projectile.ownerSide];
    if (!victim || victim.down || victim.wakeupFrames > 0) continue;
    const projectileBox = {
      x: projectile.x - projectile.width * 0.5,
      y: projectile.y - projectile.height * 0.5,
      width: projectile.width,
      height: projectile.height,
    };
    if (!getHurtboxes(victim).some((hurtbox) => boxesOverlap(projectileBox, hurtbox))) continue;
    triggerProjectile(projectile, victim);
  }
  state.projectiles = state.projectiles.filter((projectile) => !projectile.hit
    && projectile.lifeFrames > 0
    && projectile.x >= MOVEMENT_RULES.stageMinX - 160
    && projectile.x <= MOVEMENT_RULES.stageMaxX + 160);
}

function spawnCombatText(x, y, label, color = "#fff") {
  state.effects.push({ kind: "combatText", label, x, y, life: 0.72, max: 0.72, color });
}

/**
 * Every fighter throws with its own hold, release and impact. The numbers are
 * deliberately small and data-driven so the grab game can be retuned without
 * touching the simulation. `hold` is the length of the visible clinch in frames,
 * `lift` raises the victim during the hold, `launch` scales the release arc and
 * `spin` rotates the held victim so grapplers read differently from strikers.
 */
const THROW_STYLES = Object.freeze({
  deathblow: { hold: 17, lift: 78, offset: 62, spin: -0.5, launch: 1.22, drop: 1.35, shake: 0.42, label: "SLAM" },
  jez: { hold: 12, lift: 22, offset: 54, spin: -1.15, launch: 0.94, drop: 1, shake: 0.26, label: "TRIP" },
  alan: { hold: 18, lift: 66, offset: 58, spin: -0.72, launch: 1.16, drop: 1.2, shake: 0.38, label: "CLINCH" },
  post: { hold: 14, lift: 48, offset: 66, spin: -0.4, launch: 1.08, drop: 1, shake: 0.28, label: "TOSS" },
  benny: { hold: 11, lift: 30, offset: 52, spin: -0.85, launch: 1.02, drop: 1.05, shake: 0.24, label: "DROP" },
  donald: { hold: 15, lift: 52, offset: 70, spin: -0.3, launch: 1.3, drop: 0.9, shake: 0.32, label: "HEAVE" },
  cyraxx: { hold: 12, lift: 34, offset: 56, spin: -0.6, launch: 1, drop: 1, shake: 0.26, label: "SHOVE" },
  ali: { hold: 13, lift: 70, offset: 50, spin: -1.35, launch: 1.12, drop: 1.1, shake: 0.3, label: "JUDO" },
  commissioner: { hold: 16, lift: 60, offset: 64, spin: -0.65, launch: 1.24, drop: 1.25, shake: 0.4, label: "HOOK" },
});

const DEFAULT_THROW_STYLE = Object.freeze({
  hold: 14, lift: 48, offset: 58, spin: -0.7, launch: 1.05, drop: 1.05, shake: 0.3, label: "THROW",
});

function throwStyle(fighter) {
  return THROW_STYLES[fighter?.def?.id] || DEFAULT_THROW_STYLE;
}

function beginGrabHold(attacker, victim, attack) {
  const style = throwStyle(attacker);
  const back = Boolean(attack.backThrow);
  attacker.grabbing = {
    victim: victim.side,
    frame: 0,
    total: style.hold,
    back,
    damage: attack.damage,
    push: attack.push,
    meter: attack.meter,
    profileId: attack.profileId,
    moveName: attack.moveName || style.label,
  };
  victim.grabbed = { attacker: attacker.side, frame: 0, total: style.hold, back };
  victim.attacking = null;
  victim.attackFrame = 0;
  victim.attackTime = 0;
  victim.vx = 0;
  victim.vy = 0;
  victim.down = false;
  victim.grounded = true;
  victim.hitstunFrames = 0;
  victim.blockstunFrames = 0;
  victim.pendingKnockdown = false;
  victim.inputBuffer.clear();
  victim.combo.reset();
  attacker.attackHit = true;
  attacker.attackHits += 1;
  attacker.attackConnected = "hit";
  attacker.lastHitResult = "grab";
  victim.lastHitResult = "grabbed";
  state.hitstop = Math.max(state.hitstop, 0.06);
  spawnCombatText(
    (attacker.x + victim.x) * 0.5,
    Math.min(attacker.y, victim.y) - 190,
    attacker.grabbing.moveName,
    attacker.def.accent,
  );
  sound("throw", attacker);
}

// ---------------------------------------------------------------------------
// Stage weapons
// ---------------------------------------------------------------------------

function resetStageWeapon() {
  for (const fighter of state.fighters) {
    fighter.carriedWeapon = null;
    fighter.carryFrames = 0;
  }
  if (!state.stageWeaponsEnabled) {
    state.stageWeapon = null;
    return;
  }
  const plan = planStageWeapon(state.stage, {
    matchSeed: state.matchSeed,
    round: state.round,
    minX: MOVEMENT_RULES.stageMinX,
    maxX: MOVEMENT_RULES.stageMaxX,
  });
  state.stageWeapon = plan
    ? { ...plan, phase: "pending", y: FLOOR, holder: -1, frames: 0, roundStartTick: state.simulationTick }
    : null;
}

function stageWeaponProfile() {
  return state.stageWeapon ? getStageWeapon(state.stageWeapon.stageId) : null;
}

function announceWeaponArrival(profile) {
  spawnCombatText(state.stageWeapon.x, FLOOR - 210, profile.cue, "#ffd54a");
  state.effects.push({
    kind: "guard",
    style: profile.style,
    attackKind: "stage-weapon",
    x: state.stageWeapon.x,
    y: FLOOR - 40,
    life: 0.5,
    max: 0.5,
    color: "#ffd54a",
  });
  if (!rollbackResimulating) sound("stage-weapon");
}

function updateStageWeapon() {
  const weapon = state.stageWeapon;
  if (!weapon) return;
  const profile = stageWeaponProfile();
  if (!profile) return;
  weapon.frames += 1;
  if (weapon.phase === "pending") {
    // spawnFrame counts from the start of the round, not from match boot.
    if (state.simulationTick - weapon.roundStartTick < weapon.spawnFrame) return;
    if (!canWeaponArrive({
      phase: state.phase,
      hitstop: state.hitstop,
      finisherActive: Boolean(state.finisher),
      superActive: state.fighters.some((fighter) => fighter.attacking?.superMove),
      anyKnockdown: state.fighters.some((fighter) => fighter.down || fighter.knockdownFrames > 0 || fighter.pendingKnockdown),
      paused: state.paused,
    })) return;
    weapon.phase = "telegraph";
    weapon.frames = 0;
    announceWeaponArrival(profile);
    return;
  }
  if (weapon.phase === "telegraph") {
    if (weapon.frames >= profile.telegraphFrames) {
      weapon.phase = "ground";
      weapon.frames = 0;
    }
    return;
  }
  if (weapon.phase === "ground") {
    if (weapon.frames >= profile.groundFrames) {
      weapon.phase = "gone";
      spawnCombatText(weapon.x, FLOOR - 120, "GONE", "#8a93a5");
    }
    return;
  }
  if (weapon.phase === "held") {
    const holder = state.fighters[weapon.holder];
    if (holder) holder.carryFrames = Math.min(holder.carryFrames, profile.carryFrames);
    if (!holder || holder.carriedWeapon !== weapon.weaponId) {
      dropStageWeapon(holder, true);
      return;
    }
    weapon.x = holder.x;
    holder.carryFrames += 1;
    // A dropped weapon after too long stops it being a permanent upgrade.
    if (holder.carryFrames >= profile.carryFrames) dropStageWeapon(holder, true);
  }
}

function tryPickUpStageWeapon(fighter, input) {
  const weapon = state.stageWeapon;
  if (!weapon || weapon.phase !== "ground") return false;
  if (fighter.carriedWeapon) return false;
  if (isPassiveDifficulty(fighter.aiBrain?.difficulty)) return false;
  if (!input.down || !input.heavy) return false;
  const profile = stageWeaponProfile();
  if (!canPickUpWeapon(fighter, weapon, { range: profile.pickupRange, scale: FIGHTER_SCALE })) return false;
  weapon.phase = "held";
  weapon.holder = fighter.side;
  weapon.frames = 0;
  fighter.carriedWeapon = weapon.weaponId;
  fighter.carryFrames = 0;
  fighter.inputBuffer.consume("heavy", state.simulationTick);
  spawnCombatText(fighter.x, fighter.y - fighter.height - 40, profile.name, fighter.def.accent);
  if (!rollbackResimulating) objectSound(profile.style);
  updateHud();
  return true;
}

function dropStageWeapon(fighter, expire = false) {
  const weapon = state.stageWeapon;
  if (!weapon) return;
  if (fighter) {
    fighter.carriedWeapon = null;
    fighter.carryFrames = 0;
  }
  weapon.phase = expire ? "gone" : "ground";
  weapon.holder = -1;
  weapon.frames = 0;
  updateHud();
}

// The held weapon replaces HP until it leaves the fighter's hands.
function tryThrowStageWeapon(fighter, input) {
  const weapon = state.stageWeapon;
  if (!weapon || weapon.phase !== "held" || weapon.holder !== fighter.side) return false;
  if (!fighter.carriedWeapon || fighter.attacking) return false;
  if (!input.heavy && !input.throwWeapon) return false;
  const profile = stageWeaponProfile();
  // The press that picks the weapon up must not also throw it: the fighter is
  // still bringing it up to throwing height.
  if (fighter.carryFrames < profile.pickupFrames) return false;
  const direction = directionContext(fighter, input);
  // Forward is the committed attacking throw; neutral or away is a safer toss.
  const committed = direction.forwardHeld;
  const scale = FIGHTER_SCALE;
  fighter.carriedWeapon = null;
  fighter.carryFrames = 0;
  weapon.phase = "thrown";
  weapon.holder = -1;
  fighter.attacking = createAttackInstance("special", {
    id: `stage-weapon-${profile.id}`,
    profileId: `stage-weapon-${profile.id}`,
    cancelProfileId: "stage-weapon",
    kind: "special",
    level: profile.level,
    moveName: profile.name,
    startupFrames: committed ? profile.throwStartupFrames : Math.max(6, profile.throwStartupFrames - 4),
    activeFrames: profile.throwActiveFrames,
    recoveryFrames: committed ? profile.throwRecoveryFrames : profile.dropRecoveryFrames,
    range: 0,
    damage: 0,
    chipDamage: 0,
    push: 0,
    meter: 6,
    hitstunFrames: 0,
    blockstunFrames: 0,
    hitboxes: [],
  });
  fighter.attackFrame = 0;
  fighter.attackTime = 0;
  fighter.attackHit = false;
  fighter.attackHits = 0;
  fighter.inputBuffer.consume("heavy", state.simulationTick);
  state.projectiles.push({
    id: `weapon-${state.simulationTick}`,
    ownerSide: fighter.side,
    throwable: profile.id,
    stageWeapon: true,
    x: fighter.x + fighter.facing * 66 * scale,
    y: FLOOR - 130 * scale,
    vx: fighter.facing * (committed ? profile.speed : profile.dropSpeed) * scale,
    vy: (committed ? profile.launchY : profile.dropLaunchY) * scale,
    gravity: profile.gravity * scale,
    direction: fighter.facing,
    width: profile.width * scale,
    height: profile.height * scale,
    hazardWidth: 0,
    damage: committed ? profile.damage : profile.damage * 0.6,
    chipDamage: profile.chipDamage,
    hitstunFrames: profile.hitstunFrames,
    blockstunFrames: profile.blockstunFrames,
    push: Math.round(profile.push * scale),
    level: profile.level,
    knockdown: Boolean(profile.knockdown),
    lifeFrames: profile.lifeFrames,
    maxLifeFrames: profile.lifeFrames,
    armFrames: 0,
    maxArmFrames: 0,
    bouncesLeft: profile.bounces,
    bounceDamping: 0.4,
    hazardFrames: 0,
    hazard: false,
    spin: profile.spin,
    spinAngle: 0,
    wobble: 0,
    tether: null,
    slowFrames: profile.slowFrames || 0,
    staggerFrames: profile.staggerFrames || 0,
    color: "#ffd54a",
    style: profile.style,
    sequenceIndex: 0,
    enhanced: false,
  });
  if (!rollbackResimulating) objectSound(profile.style);
  spawnCombatText(fighter.x, fighter.y - fighter.height - 46, committed ? profile.name : "TOSS", fighter.def.accent);
  updateHud();
  return true;
}

function updateGrabHolds() {
  for (const attacker of state.fighters) {
    const grab = attacker.grabbing;
    if (!grab) continue;
    const victim = state.fighters[grab.victim];
    if (!victim || victim.grabbed?.attacker !== attacker.side) {
      attacker.grabbing = null;
      continue;
    }
    const style = throwStyle(attacker);
    grab.frame += 1;
    victim.grabbed.frame = grab.frame;
    const progress = Math.min(1, grab.frame / Math.max(1, grab.total));
    // The victim rides the thrower's hand through the clinch, then gets released.
    const direction = grab.back ? -attacker.facing : attacker.facing;
    victim.x = clamp(
      attacker.x + attacker.facing * style.offset * (1 - progress * 0.35),
      MOVEMENT_RULES.stageMinX,
      MOVEMENT_RULES.stageMaxX,
    );
    victim.y = FLOOR - style.lift * Math.sin(progress * Math.PI);
    victim.grounded = victim.y >= FLOOR - 0.5;
    victim.vx = 0;
    victim.vy = 0;
    victim.facing = -attacker.facing;
    victim.cinematicRotation = style.spin * Math.sin(progress * Math.PI) * attacker.facing;
    attacker.vx = 0;
    if (grab.frame >= grab.total) resolveGrabThrow(attacker, victim, grab, style, direction);
  }
}

function resolveGrabThrow(attacker, victim, grab, style, direction) {
  attacker.grabbing = null;
  victim.grabbed = null;
  victim.cinematicRotation = 0;
  victim.health = clamp(victim.health - grab.damage, 0, 100);
  victim.lastDamageFrame = state.simulationTick;
  victim.lastHitResult = ATTACK_LEVELS.THROW;
  victim.juggleCount = 0;
  victim.pendingKnockdown = true;
  victim.grounded = false;
  victim.vx = direction * grab.push * style.launch;
  victim.vy = -371 * style.drop;
  victim.x = clamp(
    attacker.x + direction * style.offset,
    MOVEMENT_RULES.stageMinX,
    MOVEMENT_RULES.stageMaxX,
  );
  victim.hitFlash = 0.16;
  attacker.combo.reset();
  attacker.meter = clamp(attacker.meter + grab.meter * GRIT_RULES.hitGainMultiplier, 0, GRIT_RULES.maximum);
  victim.meter = clamp(victim.meter + grab.meter * GRIT_RULES.damageTakenGainMultiplier, 0, GRIT_RULES.maximum);
  applyViolenceResponse("throw");
  state.shake = Math.max(state.shake, style.shake * 1.2);
  state.lastImpactSide = attacker.side;
  const impactX = victim.x;
  const impactY = FLOOR - 60;
  spawnHit(impactX, impactY, attacker.def, "throw", false, { direction });
  spawnCombatText(impactX, impactY - 78, grab.back ? "BACK THROW" : "THROW", attacker.def.accent);
  sound("hit-heavy", attacker);
  if (state.mode === "training" && attacker.side === 0) {
    state.training.lastResult = grab.back ? "BACK THROW" : "THROW";
    state.training.lastDamage = grab.damage;
  }
  updateHud();
}

function clearGrabState(fighter) {
  if (fighter.grabbing) {
    const victim = state.fighters[fighter.grabbing.victim];
    if (victim?.grabbed?.attacker === fighter.side) victim.grabbed = null;
    fighter.grabbing = null;
  }
  if (fighter.grabbed) {
    const attacker = state.fighters[fighter.grabbed.attacker];
    if (attacker?.grabbing?.victim === fighter.side) attacker.grabbing = null;
    fighter.grabbed = null;
  }
}

function techThrow(attacker, victim) {
  clearGrabState(attacker);
  clearGrabState(victim);
  attacker.attackHit = true;
  attacker.attacking = null;
  victim.attacking = null;
  attacker.inputBuffer.consume("throw", state.simulationTick);
  victim.inputBuffer.consume("throw", state.simulationTick);
  attacker.vx = -attacker.facing * 260;
  victim.vx = attacker.facing * 260;
  attacker.throwInvulnerableFrames = DEFENSE_RULES.throwInvulnerableFrames;
  victim.throwInvulnerableFrames = DEFENSE_RULES.throwInvulnerableFrames;
  attacker.throwTechFlashFrames = 18;
  victim.throwTechFlashFrames = 18;
  attacker.lastHitResult = "throw-tech";
  victim.lastHitResult = "throw-tech";
  state.hitstop = Math.max(state.hitstop, 0.075);
  state.shake = Math.max(state.shake, 0.11);
  spawnCombatText((attacker.x + victim.x) * 0.5, Math.min(attacker.y, victim.y) - 205, "THROW TECH", "#68f5ff");
  sound("block", victim);
}

function triggerSouthpawCounter(counterFighter, incomingFighter, incomingAttack, collision) {
  const stance = counterFighter.attacking;
  if (!stance
    || counterFighter.counterTriggered
    || !Number.isFinite(stance.counterWindowFrom)
    || counterFighter.attackFrame < stance.counterWindowFrom
    || counterFighter.attackFrame > stance.counterWindowTo
    || incomingAttack.level === ATTACK_LEVELS.THROW
    || (incomingAttack.superMove && !stance.counterSuper)) return false;

  counterFighter.counterTriggered = true;
  counterFighter.attackHit = true;
  counterFighter.attackHits = 1;
  counterFighter.attackConnected = "hit";
  counterFighter.lastHitResult = "counter-punch";
  counterFighter.attackFrame = Math.max(counterFighter.attackFrame, stance.activeStartFrame);
  counterFighter.attackTime = counterFighter.attackFrame * SIMULATION_STEP_SECONDS;
  const comboResult = counterFighter.combo.registerHit(state.simulationTick, incomingFighter.juggleCount);
  const damage = stance.counterDamage * comboResult.damageScale;
  counterFighter.combo.addDamage(damage);
  incomingFighter.health = clamp(incomingFighter.health - damage, 0, 100);
  incomingFighter.lastDamageFrame = state.simulationTick;
  incomingFighter.attacking = null;
  incomingFighter.attackTime = 0;
  incomingFighter.attackFrame = 0;
  incomingFighter.attackHit = false;
  incomingFighter.attackConnected = "";
  incomingFighter.hitstunFrames = stance.counterHitstunFrames;
  incomingFighter.blockstunFrames = 0;
  incomingFighter.stun = stance.counterHitstunFrames / SIMULATION_HZ;
  incomingFighter.vx = counterFighter.facing * stance.counterPush;
  incomingFighter.pendingKnockdown = true;
  incomingFighter.grounded = false;
  incomingFighter.vy = stance.counterLaunchVelocityY;
  incomingFighter.lastHitResult = "southpaw-countered";
  incomingFighter.hitFlash = 0.17;
  incomingFighter.dashFrames = 0;
  incomingFighter.queuedDashDirection = 0;
  counterFighter.meter = clamp(counterFighter.meter + 24, 0, GRIT_RULES.maximum);
  incomingFighter.meter = clamp(incomingFighter.meter + 12, 0, GRIT_RULES.maximum);
  const impact = collision?.point || {
    x: incomingFighter.x - counterFighter.facing * 28,
    y: incomingFighter.y - 132,
  };
  spawnHit(impact.x, impact.y, counterFighter.def, "special", false, { direction: counterFighter.facing, counter: true });
  state.effects.push({ kind: "counterPunch", x: impact.x, y: impact.y, life: 0.62, max: 0.62, color: counterFighter.def.accent });
  spawnCombatText(impact.x, impact.y - 128, "COUNTER-PUNCH!", counterFighter.def.accent);
  applyViolenceResponse("special", { counter: true });
  state.lastImpactSide = counterFighter.side;
  if ($("#flashToggle").checked) state.flash = Math.max(state.flash, 0.11);
  sound("hit-heavy", counterFighter);
  updateHud();
  return true;
}

function registerAliFlow(attacker, attack) {
  if (attacker.def.id !== "ali"
    || attack.level === ATTACK_LEVELS.THROW
    || attacker.rhythmLastAttackSerial === attack.attackSerial) return;
  const continuing = attacker.rhythmStacks > 0 && state.simulationTick <= attacker.rhythmExpiresFrame;
  attacker.rhythmStacks = continuing ? Math.min(3, attacker.rhythmStacks + 1) : 1;
  attacker.rhythmExpiresFrame = state.simulationTick + 96;
  attacker.rhythmLastAttackSerial = attack.attackSerial;
  attacker.specialGlow = Math.max(attacker.specialGlow, 0.35 + attacker.rhythmStacks * 0.12);
  const massive = attacker.rhythmStacks === 3;
  spawnCombatText(
    attacker.x,
    attacker.y - attacker.height - 88,
    massive ? "MASSIVE FLOW!" : `FLOW ${attacker.rhythmStacks}/3`,
    massive ? "#ff4fb9" : attacker.def.accent,
  );
  state.effects.push({
    kind: "flowPulse",
    x: attacker.x,
    y: attacker.y - 112,
    life: massive ? 0.7 : 0.42,
    max: massive ? 0.7 : 0.42,
    color: massive ? "#ff4fb9" : attacker.def.accent,
    stacks: attacker.rhythmStacks,
  });
  if (massive && $("#flashToggle").checked) state.flash = Math.max(state.flash, 0.06);
}

function hit(attacker, victim, attack, collision) {
  if (triggerSouthpawCounter(victim, attacker, attack, collision)) return;
  if (attack.level === ATTACK_LEVELS.THROW) {
    if (!victim.grounded || victim.throwInvulnerableFrames > 0 || victim.down || victim.wakeupFrames > 0) return;
    if (victim.grabbed || attacker.grabbing) return;
    const recentThrowInput = state.simulationTick - victim.lastThrowInputFrame <= DEFENSE_RULES.throwTechWindowFrames;
    if (recentThrowInput
      || victim.attacking?.level === ATTACK_LEVELS.THROW) {
      techThrow(attacker, victim);
      return;
    }
    beginGrabHold(attacker, victim, attack);
    return;
  }

  attacker.attackHit = true;
  attacker.attackHits += 1;
  attacker.lastAttackHitFrame = attacker.attackFrame;
  const blocked = canGuardAttack({
    level: attack.level,
    guardHeight: victim.guardHeight,
    guarding: victim.guarding,
    grounded: victim.grounded,
  });
  if (state.mode === "training" && attacker.side === 0 && !blocked) {
    recordTrainingTrialHit(state.training, {
      fighterId: attacker.kitId,
      action: attack.kitAction || attack.kind,
      attackSerial: attack.attackSerial,
      frame: state.simulationTick,
    });
  }
  const armored = !blocked
    && attack.level !== ATTACK_LEVELS.THROW
    && victim.attacking?.armorFrames > 0
    && victim.attackFrame <= victim.attacking.armorFrames
    && victim.armorHits < 1;
  attacker.attackConnected = blocked ? "block" : "hit";
  attacker.confirmWindowFrames = 12;
  const counter = !blocked && !armored && attack.level !== ATTACK_LEVELS.THROW && isCounterHit(victim);
  const wasJuggle = !victim.grounded || victim.pendingKnockdown;
  let comboResult = { hitNumber: 1, damageScale: 1 };
  if (!blocked && attack.level !== ATTACK_LEVELS.THROW) {
    comboResult = attacker.combo.registerHit(state.simulationTick, victim.juggleCount);
    if ((attack.maxHits || 1) > 1 && attacker.attackHits > 1) {
      comboResult.damageScale = Math.max(comboResult.damageScale, COMBO_RULES.multiHitFloor);
    }
  } else if (!blocked) attacker.combo.reset();
  const baseDamage = attack.damage
    * (counter ? DEFENSE_RULES.counterDamageMultiplier : 1)
    * comboResult.damageScale
    * (armored ? 0.65 : 1);
  const damage = blocked ? attack.chipDamage : baseDamage;
  victim.health = blocked
    ? Math.max(1, victim.health - damage)
    : clamp(victim.health - damage, 0, 100);
  victim.lastDamageFrame = state.simulationTick;
  victim.blockstunFrames = blocked ? attack.blockstunFrames : 0;
  victim.hitstunFrames = blocked || armored ? 0 : attack.hitstunFrames + (counter ? DEFENSE_RULES.counterHitstunBonusFrames : 0);
  victim.stun = Math.max(victim.hitstunFrames, victim.blockstunFrames) / SIMULATION_HZ;
  if (state.mode === "training" && attacker.side === 0) {
    const remainingRecovery = Math.max(0, (attack.durationFrames || 0) - attacker.attackFrame);
    state.training.lastAdvantage = (victim.blockstunFrames || victim.hitstunFrames) - remainingRecovery;
    state.training.lastResult = blocked ? "BLOCK" : armored ? "ARMOR" : "HIT";
  }
  // A back throw sends the victim behind the thrower, which is how corners get
  // swapped in SF2. Everything else pushes along the attacker's facing.
  const pushDirection = attack.backThrow ? -attacker.facing : attacker.facing;
  victim.vx = pushDirection * attack.push * (blocked ? 0.28 : armored ? 0.12 : 1);
  victim.guardHeight = victim.crouch ? "low" : victim.guardHeight;
  victim.lastHitResult = blocked ? `blocked-${attack.level}` : armored ? "armor" : counter ? "counter" : attack.level;
  if (!blocked && !armored) {
    attacker.combo.addDamage(damage);
    registerAliFlow(attacker, attack);
    if (wasJuggle) victim.juggleCount += 1;
    victim.attacking = null;
    victim.attackTime = 0;
    victim.attackFrame = 0;
    victim.attackHit = false;
    victim.dashFrames = 0;
    victim.queuedDashDirection = 0;
    const finalAttackHit = attacker.attackHits >= (attack.maxHits || 1);
    const shouldKnockDown = (attack.knockdown && (!attack.knockdownOnFinal || finalAttackHit))
      || attack.level === ATTACK_LEVELS.THROW;
    if (shouldKnockDown) {
      victim.pendingKnockdown = true;
      victim.grounded = false;
      victim.vy = attack.level === ATTACK_LEVELS.THROW ? -371
        : attack.launchVelocityY || -259 - attack.damage * 3.5;
    } else if (attack.juggleLift) {
      victim.pendingKnockdown = true;
      victim.grounded = false;
      victim.vy = attack.juggleLift;
    }
  } else if (armored) {
    victim.armorHits += 1;
    spawnCombatText(victim.x, victim.y - victim.height - 18, "SEISMIC ARMOR", victim.def.accent);
  }
  victim.hitFlash = 0.12;
  if (!blocked && !armored) {
    addStun(victim, attacker, attack, { counter, blocked });
    if (victim.carriedWeapon) dropStageWeapon(victim, false);
  }
  attacker.meter = clamp(attacker.meter + attack.meter * GRIT_RULES.hitGainMultiplier, 0, GRIT_RULES.maximum);
  victim.meter = clamp(victim.meter + attack.meter * GRIT_RULES.damageTakenGainMultiplier, 0, GRIT_RULES.maximum);
  const impactTier = attack.superMove ? "super"
    : attack.kind === "throw" ? "throw"
      : attack.kind === "special" ? "special"
        : attack.kind === "heavy" ? "heavy" : "light";
  applyViolenceResponse(impactTier, {
    blocked,
    counter,
    final: attack.superMove && attacker.attackHits >= (attack.maxHits || 1),
  });
  const impact = collision?.point || { x: victim.x - attacker.facing * 22, y: victim.y - 105 };
  spawnHit(impact.x, impact.y, attacker.def, impactTier, blocked, { direction: attacker.facing, counter });
  if (attack.superMove) {
    state.effects.push({ kind: "super", x: impact.x, y: impact.y, life: 0.55, max: 0.55, color: attacker.def.accent });
    if ($("#flashToggle").checked) state.flash = Math.max(state.flash, attacker.attackHits >= attack.maxHits ? 0.22 : 0.08);
  }
  if (counter) spawnCombatText(impact.x, impact.y - 74, "COUNTER", attacker.def.accent);
  else if (!blocked && attack.level === ATTACK_LEVELS.OVERHEAD) spawnCombatText(impact.x, impact.y - 70, "OVERHEAD", attacker.def.accent);
  else if (!blocked && attack.level === ATTACK_LEVELS.LOW) spawnCombatText(impact.x, impact.y - 64, "LOW", attacker.def.accent);
  else if (!blocked && attack.level === ATTACK_LEVELS.THROW) spawnCombatText(impact.x, impact.y - 72, "THROW", attacker.def.accent);
  sound(
    blocked ? "block" : attack.kind === "light" ? "hit-light" : "hit-heavy",
    blocked ? victim : attacker,
  );
  updateHud();
  state.lastImpactSide = attacker.side;
}

function checkKnockout() {
  if (state.phase !== "fight" || !state.fighters.some((fighter) => fighter.health <= 0)) return;
  if (state.mode === "training") {
    const winner = state.fighters[0].health <= 0 ? 1 : 0;
    if (state.training.autoRecover) {
      state.training.lastResult = `${state.fighters[winner].def.name.toUpperCase()} RESET`;
      resetTrainingPosition(true);
    } else {
      state.fighters.forEach((fighter) => {
        fighter.health = Math.max(1, fighter.health);
        fighter.pendingKnockdown = false;
      });
      state.training.lastResult = "KO HELD · RESET WHEN READY";
      updateHud();
      updateTrainingUi();
    }
    return;
  }
  const [first, second] = state.fighters;
  const winner = first.health <= 0 && second.health <= 0
    ? state.lastImpactSide ?? 0
    : first.health <= 0 ? 1 : 0;
  const attacker = state.fighters[winner];
  const victim = state.fighters[1 - winner];
  for (const fighter of state.fighters) clearGrabState(fighter);
  state.phase = "finish";
  state.phaseTime = 6;
  state.finishWinner = winner;
  victim.down = false;
  victim.pendingKnockdown = false;
  victim.knockdownFrames = 0;
  victim.wakeupFrames = 0;
  victim.stun = 99;
  victim.hitstunFrames = 5940;
  attacker.attacking = null;
  duckMusic(0.34, 1900);
  stirCrowd(1.4);
  announce("FINISH THEM", "LP = A  ·  LK = B  ·  ANY DISTANCE", 2.2);
  if (!rollbackResimulating) setTouchPrompt("final");
  updateHud();
  sound("finish");
}

function resolveCombatInteractions() {
  const contacts = state.fighters.map((attacker, side) => {
    if (!attacker.attacking) return null;
    const maximumHits = attacker.attacking.maxHits || 1;
    if (attacker.attackHits >= maximumHits) return null;
    if (attacker.attackHits > 0
      && attacker.attackFrame - attacker.lastAttackHitFrame < (attacker.attacking.rehitFrames || Infinity)) return null;
    const victim = state.fighters[1 - side];
    // The juggle limit exists to stop separate attacks being strung together in
    // the air. A single authored multi-hit move is already bounded by its own
    // maxHits and rehitFrames, so its later hits are exempt.
    const rehitOfSameMove = attacker.attackHits > 0;
    const juggleLimit = attacker.attacking.juggleLimit || COMBO_RULES.juggleLimit;
    if (!rehitOfSameMove
      && (!victim.grounded || victim.pendingKnockdown)
      && victim.juggleCount >= juggleLimit) return null;
    const collision = findBoxCollision(attacker, victim);
    return collision ? { attacker, victim, attack: attacker.attacking, collision } : null;
  }).filter(Boolean);
  for (const contact of contacts) {
    if (contact.attack.level === ATTACK_LEVELS.THROW && contact.attacker.attacking !== contact.attack) continue;
    hit(contact.attacker, contact.victim, contact.attack, contact.collision);
  }
  checkKnockout();
}

function updateComboState() {
  for (const attacker of state.fighters) {
    const defender = state.fighters[1 - attacker.side];
    const defenderInCombo = Boolean(defender
      && (defender.hitstunFrames > 0 || defender.pendingKnockdown || !defender.grounded));
    attacker.combo.tick(state.simulationTick, defenderInCombo);
    if (rollbackResimulating) continue;
    const readout = $(`#p${attacker.side + 1}Combo`);
    if (!readout) continue;
    const combo = attacker.combo.snapshot(state.simulationTick);
    readout.classList.toggle("active", combo.visible);
    readout.querySelector("b").textContent = String(combo.hits);
    readout.querySelector("em").textContent = `${Math.round(combo.damage)} DAMAGE`;
  }
}

const VIOLENCE_TIERS = Object.freeze({
  light: Object.freeze({ particles: 10, speed: 250, life: 0.72, size: 4.2, shake: 0.16, hitstop: 0.052, crowd: 0.12, decal: false }),
  heavy: Object.freeze({ particles: 22, speed: 430, life: 1.08, size: 6.2, shake: 0.31, hitstop: 0.08, crowd: 0.34, decal: true }),
  special: Object.freeze({ particles: 30, speed: 520, life: 1.24, size: 7.2, shake: 0.43, hitstop: 0.112, crowd: 0.56, decal: true }),
  throw: Object.freeze({ particles: 26, speed: 470, life: 1.18, size: 7, shake: 0.46, hitstop: 0.12, crowd: 0.62, decal: true }),
  weapon: Object.freeze({ particles: 28, speed: 540, life: 1.28, size: 7.6, shake: 0.5, hitstop: 0.126, crowd: 0.68, decal: true }),
  super: Object.freeze({ particles: 44, speed: 700, life: 1.58, size: 9, shake: 0.76, hitstop: 0.15, crowd: 1.05, decal: true }),
});

function violenceTier(kind = "light") {
  return VIOLENCE_TIERS[kind] || VIOLENCE_TIERS.light;
}

function applyViolenceResponse(kind, { blocked = false, counter = false, final = false } = {}) {
  if (blocked) {
    state.shake = Math.max(state.shake, 0.1);
    state.hitstop = Math.max(state.hitstop, 0.035);
    return;
  }
  const profile = violenceTier(kind);
  const counterScale = counter ? 1.22 : 1;
  state.shake = Math.max(state.shake, profile.shake * counterScale);
  const hitstop = kind === "super" && !final ? 0.108 : profile.hitstop;
  state.hitstop = Math.max(state.hitstop, hitstop * counterScale);
  stirCrowd(profile.crowd * counterScale);
}

function spawnHit(x, y, def, attackKind, blocked, { direction = 1, counter = false } = {}) {
  if (blocked) {
    const count = Math.max(3, Math.round(8 * state.performance.particleScale));
    for (let index = 0; index < count; index += 1) {
      const angle = visualRandom() * Math.PI * 2;
      const speed = 90 + visualRandom() * 220;
      state.particles.push({
        kind: "guardSpark", x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravity: 420, drag: 0.975,
        life: 0.16 + visualRandom() * 0.2, max: 0.36,
        size: 1.5 + visualRandom() * 4, color: visualRandom() > 0.5 ? "#f5f7ff" : def.accent,
      });
    }
    state.effects.push({ kind: "guard", x, y, life: 0.28, max: 0.28, color: def.accent });
    return;
  }

  const tierName = VIOLENCE_TIERS[attackKind] ? attackKind : attackKind === "throw-object" ? "weapon" : "light";
  const profile = violenceTier(tierName);
  const graphicScale = state.graphicFatalities ? 1 : 0.34;
  const counterScale = counter ? 1.26 : 1;
  const count = Math.max(4, Math.round(profile.particles * graphicScale * counterScale * state.performance.particleScale));
  const bloodPalette = state.graphicFatalities
    ? ["#8f0710", "#bd0c18", "#e32632", "#5b060b"]
    : ["#7e1520", "#a52a34"];
  for (let index = 0; index < count; index += 1) {
    const spread = (visualRandom() - 0.5) * 1.65;
    const speed = 90 + visualRandom() * profile.speed * counterScale;
    state.particles.push({
      kind: "blood",
      x: x + (visualRandom() - 0.5) * 8,
      y: y + (visualRandom() - 0.5) * 12,
      vx: direction * (speed * (0.38 + visualRandom() * 0.7)) + Math.sin(spread) * speed * 0.34,
      vy: -80 - Math.cos(spread) * speed * (0.26 + visualRandom() * 0.5),
      gravity: 860,
      drag: 0.982,
      life: 0.28 + visualRandom() * profile.life,
      max: profile.life + 0.28,
      size: 1.8 + visualRandom() * profile.size * graphicScale,
      color: bloodPalette[Math.floor(visualRandom() * bloodPalette.length) % bloodPalette.length],
    });
  }
  state.effects.push({
    kind: "bloodBurst", tier: tierName, direction, x, y,
    life: tierName === "super" ? 0.52 : 0.34,
    max: tierName === "super" ? 0.52 : 0.34,
    color: "#d41120",
  });
  state.effects.push({
    kind: "impactFlash", tier: tierName, x, y,
    life: tierName === "super" ? 0.22 : 0.12,
    max: tierName === "super" ? 0.22 : 0.12,
    color: "#fff4df",
  });
  if (profile.decal && state.graphicFatalities) {
    const decalLife = 2.8 + visualRandom() * 2.4;
    state.effects.push({
      kind: "bloodDecal", tier: tierName,
      x: clamp(x + direction * (28 + visualRandom() * 68), 28, W - 28),
      y: FLOOR + 3,
      width: 24 + visualRandom() * (tierName === "super" ? 82 : 46),
      life: decalLife, max: decalLife, color: "#72060d",
    });
  }
}

function separateFighters() {
  const [a, b] = state.fighters;
  if (!a || !b) return;
  if (a.grabbing || b.grabbing || a.grabbed || b.grabbed) return;
  if (a.attacking?.ignorePushbox || b.attacking?.ignorePushbox) return;
  const positions = resolveArenaCollision(
    {
      x: a.x,
      y: a.y,
      grounded: a.grounded,
      side: a.side,
      halfWidth: a.crouch ? a.movement.crouchingPushboxHalfWidth : a.movement.standingPushboxHalfWidth,
    },
    {
      x: b.x,
      y: b.y,
      grounded: b.grounded,
      side: b.side,
      halfWidth: b.crouch ? b.movement.crouchingPushboxHalfWidth : b.movement.standingPushboxHalfWidth,
    },
    { floorY: FLOOR },
  );
  a.x = positions.aX;
  b.x = positions.bX;
}

function updateFacings() {
  const [a, b] = state.fighters;
  if (!a || !b || state.finisher) return;
  if (a.grabbing || b.grabbing || a.grabbed || b.grabbed) return;
  // Preserve a move's committed direction through startup and active frames so
  // cross-ups still punish whiffs instead of auto-correcting the hitbox. The
  // instant recovery begins, turn the fighter back toward the opponent; keeping
  // facing locked for the full recovery was what left fighters looking away.
  const canTurn = (fighter) => !fighter.attacking
    || fighter.attackFrame > fighter.attacking.activeEndFrame;
  const toward = (fighter, opponent) => {
    const delta = opponent.x - fighter.x;
    if (Math.abs(delta) > 1e-6) return delta > 0 ? 1 : -1;
    return fighter.side < opponent.side ? 1 : -1;
  };
  if (canTurn(a)) a.facing = toward(a, b);
  if (canTurn(b)) b.facing = toward(b, a);
}

function resolveFighterState(fighter) {
  if (state.finisher) return FIGHTER_STATES.FINISHER;
  if (fighter.down || fighter.knockdownFrames > 0) return FIGHTER_STATES.KNOCKDOWN;
  if (fighter.wakeupFrames > 0) return FIGHTER_STATES.WAKEUP;
  if (fighter.dizzyFrames > 0) return FIGHTER_STATES.HITSTUN;
  if (fighter.grabbing || fighter.grabbed) return FIGHTER_STATES.THROW;
  if (fighter.throwTechFlashFrames > 0) return FIGHTER_STATES.THROW_TECH;
  if (fighter.blockstunFrames > 0) return FIGHTER_STATES.BLOCKSTUN;
  if (fighter.hitstunFrames > 0 || fighter.pendingKnockdown) return FIGHTER_STATES.HITSTUN;
  if (fighter.attacking?.level === ATTACK_LEVELS.THROW) return FIGHTER_STATES.THROW;
  if (fighter.attacking) return FIGHTER_STATES.ATTACK;
  if (!fighter.grounded) return FIGHTER_STATES.JUMP;
  if (fighter.dashFrames > 0) return FIGHTER_STATES.DASH;
  if (fighter.block) return FIGHTER_STATES.BLOCK;
  if (fighter.crouch) return FIGHTER_STATES.CROUCH;
  if (Math.abs(fighter.vx) > 20) return FIGHTER_STATES.WALK;
  return FIGHTER_STATES.IDLE;
}

function syncFighterStateMachines() {
  for (const fighter of state.fighters) {
    transitionFighterState(fighter, resolveFighterState(fighter), state.simulationTick);
  }
}

function simulatePreparedGameTick(dt, input0 = {}, input1 = {}) {
  const skippedFlow = trySkipFightFlow(input0, input1);
  if (skippedFlow && state.phase === "fight") {
    input0 = {};
    input1 = {};
  }
  if (state.hitstop > 0) {
    state.hitstop = Math.max(0, state.hitstop - dt);
    return;
  }
  state.phaseTime = Math.max(0, state.phaseTime - dt);
  state.shake = Math.max(0, state.shake - dt * 2.8);
  state.flash = Math.max(0, state.flash - dt);

  updateFacings();
  if (state.phase === "intro") {
    input0 = {};
    input1 = {};
    if (state.phaseTime <= 0) {
      state.phase = "fight";
      updateFlowSkipHint();
    }
  }

  input0 = prepareFighterInput(state.fighters[0], input0);
  input1 = prepareFighterInput(state.fighters[1], input1);

  updateFighter(state.fighters[0], state.fighters[1], input0, dt);
  updateFighter(state.fighters[1], state.fighters[0], input1, dt);
  updateGrabHolds();
  updateStageWeapon();
  state.crowdReaction = Math.max(0, state.crowdReaction - 0.016);
  if (state.finisher) updateFinisher(dt);
  else {
    updateProjectiles(dt);
    updatePaintTraps();
    resolveCombatInteractions();
    separateFighters();
    updateFacings();
  }
  updateComboState();
  syncFighterStateMachines();

  if (state.mode === "training") {
    let trainingHudDirty = false;
    if (state.training.infiniteGrit) {
      state.fighters.forEach((fighter) => {
        if (fighter.meter < GRIT_RULES.maximum) trainingHudDirty = true;
        fighter.meter = GRIT_RULES.maximum;
      });
    }
    if (state.training.autoRecover && state.phase === "fight") {
      state.fighters.forEach((fighter) => {
        const ready = state.simulationTick - fighter.lastDamageFrame >= 90
          && fighter.hitstunFrames === 0
          && fighter.blockstunFrames === 0
          && !fighter.pendingKnockdown;
        if (!ready || fighter.health >= 100) return;
        fighter.health = Math.min(100, fighter.health + 0.45);
        trainingHudDirty = true;
      });
    }
    if (trainingHudDirty) updateHud();
  }

  if (state.phase === "fight" && state.mode !== "training") {
    state.timerCarry += dt;
    if (state.timerCarry >= 1) {
      state.timer = Math.max(0, state.timer - Math.floor(state.timerCarry));
      state.timerCarry %= 1;
      updateHud();
    }
    if (state.timer <= 0) {
      const winner = state.fighters[0].health >= state.fighters[1].health ? 0 : 1;
      finishRound(winner, -1);
    }
  } else if (state.phase === "finish" && state.phaseTime <= 0) {
    finishRound(state.finishWinner, -1);
  } else if (state.phase === "roundover" && state.phaseTime <= 0) {
    const winner = state.rounds[0] > state.rounds[1] ? 0 : 1;
    if (state.rounds[winner] >= 2) resolveMatchResult(winner);
    else resetRound();
  }

  for (const particle of state.particles) {
    particle.life -= dt;
    particle.vy += (particle.gravity ?? 720) * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= particle.drag ?? 0.985;
    if (Number.isFinite(particle.spin)) particle.rotation = (particle.rotation || 0) + particle.spin * dt;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
  for (const effect of state.effects) effect.life -= dt;
  state.effects = state.effects.filter((effect) => effect.life > 0);
  state.particles = trimVisualBudget(state.particles, state.performance.particleBudget);
  state.effects = trimVisualBudget(state.effects, state.performance.effectBudget);
  updateTrainingUi(input0);
}

function simulateOfflineGameTick(dt) {
  if (state.hitstop > 0) {
    state.hitstop = Math.max(0, state.hitstop - dt);
    return;
  }
  const bothCpu = state.mode === "demo" || state.mode === "tournament";
  let input0 = readQaInput(0)
    || (bothCpu ? aiInput(state.fighters[0], state.fighters[1], dt) : readInput(0));
  const manualTrainingInput = state.mode === "training" && state.training.dummyMode === "record"
    ? readInput(1) : null;
  let trainingDummy = state.mode === "training"
    ? trainingDummyInput(state.training, state.simulationTick, {
      attackLevel: state.fighters[0]?.attacking?.level,
      attackConnected: state.fighters[0]?.attackConnected,
      comboHits: state.fighters[0]?.combo.snapshot(state.simulationTick).hits || 0,
      hitstunFrames: state.fighters[1]?.hitstunFrames || 0,
      blockstunFrames: state.fighters[1]?.blockstunFrames || 0,
      wakeupFrames: state.fighters[1]?.wakeupFrames || 0,
      down: Boolean(state.fighters[1]?.down),
      justWoke: Boolean(state.fighters[1]?.justWoke),
      manualInput: manualTrainingInput,
    })
    : null;
  if (trainingDummy?.trainingKnockdown && state.fighters[1]) {
    enterKnockdown(state.fighters[1]);
    trainingDummy = { ...trainingDummy, trainingKnockdown: false };
  }
  let input1 = readQaInput(1)
    || (state.mode === "arcade" || bothCpu || (state.mode === "training" && trainingDummy === null)
      ? aiInput(state.fighters[1], state.fighters[0], dt)
      : trainingDummy || readInput(1));
  simulatePreparedGameTick(dt, input0, input1);
}

function maybeSendOnlineChecksum() {
  const rollback = onlineSession.rollback;
  if (!rollback || !onlineSession.peer?.connected) return;
  const metrics = rollback.metrics();
  const confirmed = Math.min(metrics.frame, metrics.confirmedRemoteFrame + 1, metrics.acknowledgedLocalFrame + 1);
  const checkpoint = Math.floor(confirmed / 60) * 60;
  if (checkpoint <= 0 || checkpoint <= onlineSession.lastChecksumSentFrame) return;
  const checksum = rollback.checksumAt(checkpoint);
  if (!checksum) return;
  onlineSession.lastChecksumSentFrame = checkpoint;
  sendOnlineControl({ type: "checksum", matchId: onlineSession.matchConfig?.matchId, frame: checkpoint, checksum });
}

function simulateOnlineGameTick() {
  const rollback = onlineSession.rollback;
  if (!rollback || onlineSession.networkPaused) return;
  const localInput = readQaInput(0) || readInput(0);
  const result = rollback.advance(inputToBits(localInput));
  if (onlineSession.peer?.connected) onlineSession.peer.sendInput(rollback.inputPacket());
  if (!result.advanced) {
    updateOnlineHud("warning");
    return;
  }
  state.simulationTick = rollback.frame;
  maybeSendOnlineChecksum();
  checkPendingOnlineChecksums();
  const metrics = rollback.metrics();
  if (metrics.frame - onlineSession.lastPersistedFrame >= 60) {
    onlineSession.lastPersistedFrame = metrics.frame;
    persistOnlineResume(true);
  }
  updateOnlineHud(metrics.frame - metrics.lastRollbackFrame < 30 ? "warning" : "sync");
}

function simulateGameTick(dt) {
  if (state.screen !== "fight" || !state.fighters.length) return;
  if (document.body.classList.contains("orientation-blocked")) return;
  if (state.paused) return;
  if (state.mode === "online" && onlineSession.matchActive) simulateOnlineGameTick();
  else simulateOfflineGameTick(dt);
}

function drawCover(image, offsetX = 0) {
  if (!image.complete || !image.naturalWidth) {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#0a1d35");
    gradient.addColorStop(1, "#100507");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const scale = Math.max(W / image.naturalWidth, H / image.naturalHeight);
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  ctx.drawImage(image, (W - dw) * 0.5 + offsetX, (H - dh) * 0.5, dw, dh);
}

function drawStage(time) {
  const center = state.fighters.length ? (state.fighters[0].x + state.fighters[1].x) * 0.5 : W * 0.5;
  const parallax = (center - W * 0.5) * -0.035;
  drawCover(stageImages[state.stage], parallax);
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(0,8,18,.12)");
  shade.addColorStop(0.58, "rgba(0,0,0,.03)");
  shade.addColorStop(1, "rgba(2,3,5,.74)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  drawCrowd(time);
  if (state.stage === "vet") drawVetAtmosphere(time);

  ctx.fillStyle = "rgba(6,8,11,.26)";
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.strokeStyle = state.stage === "vet" ? "rgba(255,177,50,.18)" : "rgba(70,190,240,.16)";
  ctx.lineWidth = 2;
  for (let x = -100; x < W + 200; x += 150) {
    ctx.beginPath();
    ctx.moveTo(x, FLOOR);
    ctx.lineTo(W * 0.5 + (x - W * 0.5) * 1.65, H);
    ctx.stroke();
  }
}

const POSTURE_BY_ID = Object.fromEntries(
  [...POSTURES, ...TAILGATE_POSTURES, ...BOARDWALK_POSTURES, ...BUFFET_POSTURES, ...POOLSIDE_POSTURES]
    .map((posture) => [posture.id, posture]),
);

function resetCrowd() {
  state.crowd = createCrowd(state.stage, { seed: hashSeed(state.matchSeed, state.round) });
  state.crowdReaction = 0;
}

// Big moments ripple through the crowd, then it goes back to its routes.
function stirCrowd(amount = 1) {
  state.crowdReaction = Math.min(1.4, state.crowdReaction + amount);
}

function drawPedestrian(person, layer, x, gait, paused, reaction) {
  const posture = POSTURE_BY_ID[person.posture] || POSTURES[0];
  const scale = layer.scale * person.height;
  const step = paused ? 0 : Math.sin(gait) * posture.stride;
  const bob = paused ? 0 : Math.abs(Math.sin(gait)) * posture.bob * 2.4;
  // A big moment makes them flinch and hunch briefly, without leaving their route.
  const flinch = reaction * (0.25 + person.pace * 0.2);
  const lean = posture.lean + flinch * 0.3;

  // Contact shadow so the pedestrian sits on the pavement rather than floating.
  ctx.save();
  ctx.globalAlpha = layer.alpha * 0.45;
  ctx.fillStyle = "rgba(0,0,0,.8)";
  ctx.beginPath();
  ctx.ellipse(x, person.y + 2, 20 * layer.scale * person.width, 5 * layer.scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, person.y - bob);
  ctx.scale(scale * person.direction, scale);
  ctx.globalAlpha = layer.alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Roughly seven-heads tall, with the legs taking a little under half the body.
  const headY = -124;
  const shoulderY = -100;
  const hipY = -56;

  // Legs. A permanent stance offset keeps the two legs separate even when the
  // stride is near zero, otherwise a standing figure collapses into one post.
  ctx.strokeStyle = person.trousers;
  ctx.lineWidth = 10 * person.width;
  ctx.beginPath();
  ctx.moveTo(-4, hipY);
  ctx.lineTo(step * 20 - 8, 0);
  ctx.moveTo(4, hipY);
  ctx.lineTo(-step * 20 + 9, 0);
  ctx.stroke();

  ctx.save();
  // Everything above the hips leans forward by posture.
  ctx.translate(0, hipY);
  ctx.rotate(lean * 0.45);
  ctx.translate(0, -hipY);

  // Torso: a tapered coat rather than a single fat stroke, so it reads as a body.
  const shoulderHalf = 12 * person.width;
  const hipHalf = 8.5 * person.width;
  ctx.fillStyle = person.coat;
  ctx.beginPath();
  ctx.moveTo(-shoulderHalf, shoulderY + person.shoulderSlope * 5);
  ctx.lineTo(shoulderHalf, shoulderY - person.shoulderSlope * 5);
  ctx.lineTo(hipHalf, hipY + 4);
  ctx.lineTo(-hipHalf, hipY + 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(8,11,16,.55)";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Arms swing out of phase with the legs.
  const swing = paused ? 0 : Math.sin(gait + Math.PI) * posture.armSwing;
  // Arms hang clear of the torso silhouette so the figure reads as a person.
  ctx.strokeStyle = person.coat;
  ctx.lineWidth = 6.5 * person.width;
  ctx.beginPath();
  ctx.moveTo(shoulderHalf - 2, shoulderY + 5);
  ctx.lineTo(swing * 14 + shoulderHalf + 4, hipY + 12);
  ctx.moveTo(-shoulderHalf + 2, shoulderY + 5);
  ctx.lineTo(-swing * 14 - shoulderHalf - 3, hipY + 14);
  ctx.stroke();

  if (person.hasBag && layer.detail !== "low") {
    ctx.fillStyle = person.accent;
    ctx.fillRect(person.bagSide * 13 - 5, hipY + 2, 11, 15);
  }

  // Tailgate props ride in the raised hand: cups, cans, flags and handmade signs.
  if (person.prop && layer.detail !== "low") {
    const handX = swing * 14 + shoulderHalf + 4;
    const handY = hipY + 12;
    ctx.save();
    ctx.translate(handX, handY);
    if (person.prop === "cup") {
      ctx.fillStyle = "#d8dde2";
      ctx.beginPath();
      ctx.moveTo(-4, -9); ctx.lineTo(4, -9); ctx.lineTo(3, 2); ctx.lineTo(-3, 2);
      ctx.closePath(); ctx.fill();
    } else if (person.prop === "can") {
      ctx.fillStyle = "#a6adb4";
      ctx.fillRect(-3.5, -10, 7, 11);
      ctx.fillStyle = person.accent;
      ctx.fillRect(-3.5, -6, 7, 3);
    } else if (person.prop === "flag") {
      ctx.strokeStyle = "#8d949b";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -34); ctx.stroke();
      ctx.fillStyle = person.accent;
      ctx.beginPath();
      ctx.moveTo(1, -34); ctx.lineTo(22, -28); ctx.lineTo(1, -20);
      ctx.closePath(); ctx.fill();
    } else if (person.prop === "plate") {
      ctx.fillStyle = "#eceff2";
      ctx.beginPath();
      ctx.ellipse(0, -3, 10, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      // A heap of crab legs piled well past the rim.
      ctx.fillStyle = "#e2743a";
      for (let leg = 0; leg < 4; leg += 1) {
        ctx.save();
        ctx.translate((leg - 1.5) * 4, -6);
        ctx.rotate((leg - 1.5) * 0.4);
        ctx.fillRect(-1.4, -8, 2.8, 9);
        ctx.restore();
      }
    } else if (person.prop === "bigcup") {
      // An absurd souvenir cup, straw and all.
      ctx.fillStyle = person.accent;
      ctx.beginPath();
      ctx.moveTo(-7, -20); ctx.lineTo(7, -20); ctx.lineTo(5, 3); ctx.lineTo(-5, 3);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#ff5aa8";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(3, -20); ctx.lineTo(9, -32); ctx.stroke();
    } else if (person.prop === "phone") {
      ctx.fillStyle = "#1c2026";
      ctx.fillRect(-3, -20, 7, 12);
      ctx.fillStyle = "#7fe9ff";
      ctx.fillRect(-2, -19, 5, 10);
    } else if (person.prop === "bag") {
      ctx.fillStyle = person.accent;
      ctx.fillRect(-8, -6, 18, 20);
      ctx.strokeStyle = "#2b3138";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(1, -6, 7, Math.PI, 0); ctx.stroke();
    } else if (person.prop === "towel") {
      ctx.fillStyle = person.accent;
      ctx.fillRect(-4, -14, 16, 22);
    } else if (person.prop === "tongs") {
      ctx.strokeStyle = "#d5dce8";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-2, 2); ctx.lineTo(12, -6);
      ctx.moveTo(-2, 6); ctx.lineTo(12, -1);
      ctx.stroke();
    } else if (person.prop === "sign") {
      ctx.fillStyle = "#e6e9ec";
      ctx.fillRect(-2, -34, 26, 18);
      ctx.strokeStyle = "#1c4f42";
      ctx.lineWidth = 2;
      ctx.strokeRect(-2, -34, 26, 18);
      // Hand-scrawled marks, never real text or a logo.
      ctx.beginPath();
      ctx.moveTo(2, -28); ctx.lineTo(20, -28);
      ctx.moveTo(2, -23); ctx.lineTo(14, -23);
      ctx.stroke();
      ctx.strokeStyle = "#8d949b";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(11, -16); ctx.lineTo(11, 2); ctx.stroke();
    }
    ctx.restore();
  }

  // Neck and head, dropped forward for the hunched postures.
  ctx.strokeStyle = "#7d6c5e";
  ctx.lineWidth = 5 * person.width;
  ctx.beginPath();
  ctx.moveTo(0, shoulderY + 3);
  ctx.lineTo(2, headY + 12);
  ctx.stroke();

  ctx.save();
  ctx.translate(2, headY + 6);
  ctx.rotate(person.headTilt + posture.headDrop * 0.9);
  ctx.fillStyle = "#8d7a69";
  ctx.beginPath();
  ctx.ellipse(0, 0, 8 * person.width, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(8,11,16,.5)";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  if (person.facePaint && layer.detail === "high") {
    ctx.fillStyle = "#1c4f42";
    ctx.fillRect(-8 * person.width, -3, 16 * person.width, 3.5);
  }
  if (person.hasHood) {
    ctx.fillStyle = person.coat;
    ctx.beginPath();
    ctx.ellipse(-2, -2, 11 * person.width, 11.5, 0, Math.PI * 0.82, Math.PI * 2.1);
    ctx.fill();
  } else if (person.hasHat) {
    ctx.fillStyle = person.accent;
    ctx.fillRect(-11 * person.width, -12, 22 * person.width, 4.5);
    ctx.fillRect(-7 * person.width, -17, 14 * person.width, 6);
  }
  ctx.restore();
  ctx.restore();
  ctx.restore();
}

// One rowdy background scuffle. Readable and physical, never graphic: shoving,
// shirt-grabbing, wild misses, wrestling, friends pulling people apart.
function drawScuffle(group, frame, centre, reaction) {
  const phase = scufflePhase(group, frame);
  const beat = Math.sin(phase * Math.PI * 2);
  const clash = Math.max(0, Math.sin(phase * Math.PI * 2 - 0.6));
  const drawX = group.x + (centre - W * 0.5) * -0.2;
  if (drawX < -110 || drawX > W + 110) return;

  ctx.save();
  ctx.translate(drawX, group.y);
  ctx.scale(group.scale * group.flip, group.scale);
  ctx.globalAlpha = 0.82;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const brawler = (offsetX, lean, armReach, shirt, tilt = 0) => {
    ctx.save();
    ctx.translate(offsetX, 0);
    ctx.rotate(tilt);
    ctx.strokeStyle = "#232a30";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-3, -46); ctx.lineTo(-9, 0);
    ctx.moveTo(3, -46); ctx.lineTo(10, 0);
    ctx.stroke();
    ctx.save();
    ctx.translate(0, -46);
    ctx.rotate(lean);
    ctx.translate(0, 46);
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.moveTo(-11, -88); ctx.lineTo(11, -88); ctx.lineTo(8, -44); ctx.lineTo(-8, -44);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(8,11,16,.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = shirt;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(9, -84); ctx.lineTo(armReach, -66);
    ctx.moveTo(-9, -84); ctx.lineTo(-armReach * 0.4, -52);
    ctx.stroke();
    ctx.fillStyle = "#8d7a69";
    ctx.beginPath();
    ctx.ellipse(2, -100, 8, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  };

  const swing = group.reach * (0.4 + clash * 0.6) * (1 + reaction * 0.25);
  switch (group.kind) {
    case "argue":
      brawler(-16, 0.2 + beat * 0.06, swing * 0.7, group.shirts[0]);
      brawler(18, -0.2 - beat * 0.06, -swing * 0.7, group.shirts[1], 0.04);
      break;
    case "shove":
      brawler(-18 - clash * 8, 0.26, swing, group.shirts[0]);
      brawler(20 + clash * 12, -0.3, -swing * 0.4, group.shirts[1], -clash * 0.16);
      break;
    case "shirtgrab":
      brawler(-13, 0.3, swing * 0.55, group.shirts[0]);
      brawler(14, -0.32, -swing * 0.55, group.shirts[1], beat * 0.08);
      break;
    case "swing":
      brawler(-20, 0.16 + clash * 0.2, swing * 1.3, group.shirts[0]);
      brawler(24, -0.34, -swing * 0.3, group.shirts[1], -clash * 0.22);
      break;
    case "wrestle":
      brawler(-10, 0.44, swing * 0.4, group.shirts[0], beat * 0.1);
      brawler(11, -0.46, -swing * 0.4, group.shirts[1], -beat * 0.1);
      break;
    case "separate":
      brawler(-26, 0.3, swing, group.shirts[0]);
      brawler(26, -0.3, -swing, group.shirts[1]);
      // The friend in the middle, arms out, holding them apart.
      brawler(0, -0.05, swing * 0.9, group.shirts[2], 0);
      break;
    case "tableflip": {
      brawler(-24, 0.34, swing, group.shirts[0]);
      brawler(26, -0.24, -swing * 0.5, group.shirts[1], clash * 0.2);
      const lift = clash * 26;
      ctx.save();
      ctx.translate(2, -22 - lift);
      ctx.rotate(clash * 0.5);
      ctx.fillStyle = "#6b7078";
      ctx.fillRect(-30, -6, 60, 7);
      ctx.strokeStyle = "#4e545b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-22, 1); ctx.lineTo(-26, 20);
      ctx.moveTo(22, 1); ctx.lineTo(26, 20);
      ctx.stroke();
      ctx.restore();
      break;
    }
    default:
      // celebrate
      brawler(-22, -0.1, -swing * 1.2, group.shirts[0]);
      brawler(0, -0.06, swing * 1.2, group.shirts[1]);
      brawler(23, -0.12, -swing, group.shirts[2]);
  }
  // A puff of dust at the peak of the clash so the scuffle reads as a fight
  // rather than two people standing close together.
  if (clash > 0.72) {
    ctx.globalAlpha = (clash - 0.72) * 2.2;
    ctx.fillStyle = "rgba(214,206,190,.55)";
    for (let index = 0; index < 4; index += 1) {
      const puffX = (index - 1.5) * 13;
      const puffY = -18 - Math.abs(Math.sin(phase * 9 + index)) * 12;
      ctx.beginPath();
      ctx.arc(puffX, puffY, 5 + index, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// Coolers, folding tables and grills the tailgate gathers around.
function drawTailgateProps(frame, centre) {
  const spots = [180, 470, 760, 1050];
  for (let index = 0; index < spots.length; index += 1) {
    const x = spots[index] + (centre - W * 0.5) * -0.14;
    if (x < -80 || x > W + 80) continue;
    const y = 498 + (index % 2) * 16;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.translate(x, y);
    if (index % 2 === 0) {
      ctx.fillStyle = "#c3cad0";
      ctx.fillRect(-22, -20, 44, 20);
      ctx.fillStyle = "#1c4f42";
      ctx.fillRect(-22, -24, 44, 5);
    } else {
      ctx.fillStyle = "#4a5057";
      ctx.fillRect(-20, -26, 40, 6);
      ctx.strokeStyle = "#3a4046";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-14, -20); ctx.lineTo(-17, 2);
      ctx.moveTo(14, -20); ctx.lineTo(17, 2);
      ctx.stroke();
      // Grill smoke.
      const smoke = 12 + Math.sin(frame * 0.03 + index) * 5;
      const gradient = ctx.createRadialGradient(0, -40, 2, 0, -40, smoke * 2.4);
      gradient.addColorStop(0, "rgba(214,222,228,.2)");
      gradient.addColorStop(1, "rgba(214,222,228,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, -40, smoke * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// Gulls, a moving ride car and neon haze over the boardwalk.
function drawBoardwalkAtmosphere(frame, centre) {
  ctx.save();
  // Seagulls drifting over the ocean.
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "#d8dee6";
  ctx.lineWidth = 2;
  for (let index = 0; index < 6; index += 1) {
    const gullX = ((frame * (0.6 + index * 0.18) + index * 230) % (W + 160)) - 80
      + (centre - W * 0.5) * -0.06;
    const gullY = 150 + index * 17 + Math.sin(frame * 0.02 + index) * 9;
    const flap = Math.sin(frame * 0.16 + index * 1.4) * 5;
    ctx.beginPath();
    ctx.moveTo(gullX - 8, gullY + flap);
    ctx.quadraticCurveTo(gullX, gullY - 3, gullX + 8, gullY + flap);
    ctx.stroke();
  }
  // A ride car climbing the coaster behind the sign.
  const rideT = (frame % 420) / 420;
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = "#ffd54a";
  ctx.fillRect(200 + rideT * 260 + (centre - W * 0.5) * -0.08, 300 - Math.sin(rideT * Math.PI) * 58, 14, 8);
  // Sea haze rolling along the railing line.
  const haze = ctx.createLinearGradient(0, 400, 0, 520);
  haze.addColorStop(0, "rgba(150,180,205,0)");
  haze.addColorStop(0.5, `rgba(150,180,205,${0.06 + Math.sin(frame * 0.008) * 0.02})`);
  haze.addColorStop(1, "rgba(150,180,205,0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = haze;
  ctx.fillRect(0, 400, W, 120);
  ctx.restore();
}

// Steam bursts, swaying pendant lights and rattling trays over the crab legs.
function drawBuffetAtmosphere(frame, centre, reaction) {
  ctx.save();
  for (let index = 0; index < 7; index += 1) {
    const x = 120 + index * 165 + (centre - W * 0.5) * -0.1;
    if (x < -60 || x > W + 60) continue;
    // Steam pulses on their own rhythm rather than all together.
    const pulse = (frame * (0.012 + index * 0.002) + index * 1.7) % (Math.PI * 2);
    const rise = (Math.sin(pulse) + 1) * 0.5;
    const size = 16 + rise * 26;
    const gradient = ctx.createRadialGradient(x, 430 - rise * 46, 2, x, 430 - rise * 46, size);
    gradient.addColorStop(0, `rgba(240,244,248,${0.16 * (1 - rise * 0.55)})`);
    gradient.addColorStop(1, "rgba(240,244,248,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, 430 - rise * 46, size, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pendant lights swaying, harder right after a big hit.
  const sway = (0.02 + reaction * 0.05) * Math.sin(frame * 0.03);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = "#f2c98a";
  ctx.lineWidth = 2;
  for (let index = 0; index < 6; index += 1) {
    const x = 150 + index * 200 + (centre - W * 0.5) * -0.1;
    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.lineTo(x + Math.sin(sway + index) * 12, 132);
    ctx.stroke();
  }
  ctx.restore();
}

// Splashes in the pool, traffic on the slide and heat shimmer over the deck.
function drawPoolDeckAtmosphere(frame, centre, reaction) {
  ctx.save();
  // Splash plumes where the pool sits behind the fight floor.
  for (let index = 0; index < 5; index += 1) {
    const cycle = (frame * (0.9 + index * 0.25) + index * 137) % 260;
    if (cycle > 60) continue;
    const life = cycle / 60;
    const x = 220 + index * 210 + (centre - W * 0.5) * -0.12;
    if (x < -60 || x > W + 60) continue;
    ctx.globalAlpha = (1 - life) * 0.65;
    ctx.fillStyle = "#dff4ff";
    for (let drop = 0; drop < 7; drop += 1) {
      const angle = (drop / 7) * Math.PI - Math.PI;
      const spread = life * 46;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * spread, 452 + Math.sin(angle) * spread * 0.5, 4 - life * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // A rider running the slide.
  const slideT = (frame % 300) / 300;
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "#ffd24a";
  ctx.beginPath();
  ctx.arc(150 + slideT * 120 + (centre - W * 0.5) * -0.1, 300 + Math.sin(slideT * Math.PI) * 90, 7, 0, Math.PI * 2);
  ctx.fill();
  // Heat shimmer over the hot deck, stronger when the crowd is stirred.
  const shimmer = ctx.createLinearGradient(0, 470, 0, 560);
  shimmer.addColorStop(0, "rgba(255,244,214,0)");
  shimmer.addColorStop(0.5, `rgba(255,244,214,${0.05 + reaction * 0.05 + Math.sin(frame * 0.02) * 0.015})`);
  shimmer.addColorStop(1, "rgba(255,244,214,0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = shimmer;
  ctx.fillRect(0, 470, W, 90);
  ctx.restore();
}

function drawVacantLotCat(cat, x, gait, paused, startled) {
  const scale = cat.scale;
  const step = paused ? 0 : Math.sin(gait) * 4.2;
  const crouch = startled ? 2 : 0;
  ctx.save();
  ctx.translate(x, cat.y + crouch);
  ctx.scale(scale * cat.direction, scale);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.beginPath();
  ctx.ellipse(0, 3, 18, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cat.coat;
  ctx.beginPath();
  ctx.ellipse(0, -9, 17, 9, startled ? -0.08 : 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(15, -15, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(10, -20); ctx.lineTo(12, -29); ctx.lineTo(16, -21);
  ctx.moveTo(16, -21); ctx.lineTo(21, -28); ctx.lineTo(21, -18);
  ctx.fill();
  ctx.strokeStyle = cat.coat;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-14, -10);
  ctx.quadraticCurveTo(-31, -23 - cat.tailCurl * 5, -27, -39 + cat.tailCurl * 4);
  ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-8, -4); ctx.lineTo(-9 + step, 1);
  ctx.moveTo(6, -4); ctx.lineTo(8 - step, 1);
  ctx.stroke();
  ctx.fillStyle = startled ? "#ffd96a" : "#9fc6a8";
  ctx.beginPath(); ctx.arc(17, -16, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// The generated stage already contains parked cars. These tiny suspension and
// reflection shifts make two of them feel occupied without drawing people or
// showing anything explicit.
function drawJanneyAtmosphere(frame, centre, reaction, crowd) {
  const parallax = (centre - W * 0.5) * -0.12;
  for (const [index, baseX] of [122, 1158].entries()) {
    const phase = frame * (0.031 + index * 0.004) + index * 2.4;
    const rock = Math.sin(phase) * (1.5 + reaction * 0.9);
    const x = baseX + parallax;
    const y = index ? 426 : 420;
    ctx.save();
    ctx.translate(x, y + Math.abs(rock) * 0.5);
    ctx.rotate(rock * 0.0025 * (index ? -1 : 1));
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = index ? "#8eb1bb" : "#77899a";
    ctx.beginPath();
    ctx.roundRect(-74, -18, 148, 32, 8);
    ctx.fill();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = "#ffd28a";
    ctx.fillRect(index ? -63 : 53, -8 + rock * 0.25, 10, 4);
    ctx.restore();
  }
  for (const cat of crowd.cats || []) {
    const position = catPosition(cat, frame, crowd.span, crowd.minX, reaction);
    const drawX = position.x + (centre - W * 0.5) * -0.2;
    if (drawX < -45 || drawX > W + 45) continue;
    drawVacantLotCat(cat, drawX, position.gait, position.paused, position.startled);
  }
  // A restrained dusk glow catches dust above the open fight floor.
  const glow = ctx.createRadialGradient(W * 0.5, 440, 40, W * 0.5, 440, 430);
  glow.addColorStop(0, "rgba(255,197,123,.06)");
  glow.addColorStop(1, "rgba(79,92,157,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 260, W, 300);
}

function drawCrowd(time) {
  const crowd = state.crowd;
  if (!crowd) return;
  const centre = state.fighters.length ? (state.fighters[0].x + state.fighters[1].x) * 0.5 : W * 0.5;
  const reaction = state.crowdReaction;
  const frame = state.simulationTick;
  // Cheapest possible culling: skip anyone whose parallaxed x is off screen.
  for (const person of crowd.people) {
    const layer = CROWD_LAYERS.find((entry) => entry.id === person.layer);
    const { x, gait, paused } = crowdPosition(person, layer, frame, crowd.span, crowd.minX);
    const drawX = x + (centre - W * 0.5) * -layer.parallax;
    if (drawX < -70 || drawX > W + 70) continue;
    drawPedestrian(person, layer, drawX, gait, paused, reaction);
  }
  ctx.globalAlpha = 1;

  for (const group of crowd.scuffles || []) drawScuffle(group, frame, centre, reaction);
  if (crowd.variant === "tailgate") {
    drawTailgateProps(frame, centre);
    // Cups thrown into the air when the crowd is stirred hardest.
    if (reaction > 0.5) {
      ctx.globalAlpha = Math.min(0.7, (reaction - 0.5) * 1.6);
      ctx.fillStyle = "#d8dde2";
      for (let index = 0; index < 14; index += 1) {
        const cupX = ((index * 97 + frame * 2.4) % (W + 60)) - 30;
        const cupY = 470 - Math.abs(Math.sin(frame * 0.05 + index)) * 90;
        ctx.fillRect(cupX, cupY, 6, 8);
      }
      ctx.globalAlpha = 1;
    }
    return;
  }

  if (crowd.variant === "boardwalk") {
    drawBoardwalkAtmosphere(frame, centre);
    return;
  }
  if (crowd.variant === "buffet") {
    drawBuffetAtmosphere(frame, centre, reaction);
    return;
  }
  if (crowd.variant === "poolside") {
    drawPoolDeckAtmosphere(frame, centre, reaction);
    return;
  }
  if (crowd.variant === "vacantLot") {
    drawJanneyAtmosphere(frame, centre, reaction, crowd);
    return;
  }

  // Street life behind the K&A crowd: the El train and drifting litter.
  const trainX = ((time * 0.08) % (W + 650)) - 500;
  ctx.fillStyle = "rgba(18,31,40,.7)";
  ctx.fillRect(trainX, 154, 430, 58);
  for (let x = trainX + 24; x < trainX + 410; x += 53) {
    ctx.fillStyle = "rgba(255,211,105,.75)";
    ctx.fillRect(x, 166, 34, 22);
  }
  for (let index = 0; index < 5; index += 1) {
    const litterX = ((frame * (0.5 + index * 0.2) + index * 260) % (W + 120)) - 60;
    const litterY = 528 + Math.sin(frame * 0.02 + index) * 7 + index * 4;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#7d8794";
    ctx.fillRect(litterX, litterY, 7, 4);
  }
  ctx.globalAlpha = 1;
}

function drawVetAtmosphere(time) {
  for (let i = 0; i < 5; i += 1) {
    const x = 110 + i * 275 + Math.sin(time * 0.0002 + i) * 10;
    const y = 492 + (i % 2) * 23;
    const smoke = 19 + Math.sin(time * 0.001 + i) * 7;
    const gradient = ctx.createRadialGradient(x, y - 40, 2, x, y - 40, smoke * 2.5);
    gradient.addColorStop(0, "rgba(210,220,225,.13)");
    gradient.addColorStop(1, "rgba(210,220,225,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y - 40, smoke * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function fighterAnimationPose(fighter) {
  const base = (frame) => ({ bank: "base", frame });
  if (fighter.cinematicFrame !== null) return base(fighter.cinematicFrame);
  if (fighter.grabbed) return base(15);
  if (fighter.dizzyFrames > 0) return base(12 + Math.floor(fighter.animTime * 6) % 2);
  if (fighter.down || fighter.knockdownFrames > 0 || fighter.hitFlash > 0 || fighter.hitstunFrames > 21) return base(15);
  if (fighter.wakeupFrames > 0) return base(fighter.wakeupFrames > 9 ? 15 : 12);
  if (fighter.throwTechFlashFrames > 0) return base(12);
  if (fighter.block || fighter.blockstunFrames > 0 || fighter.crouch) return base(12);
  if (fighter.attacking) {
    const attack = fighter.attacking;
    const kitPose = attackAnimationPose(attack, fighter.attackFrame);
    if (kitPose) return kitPose;
    const startup = attack.active[0];
    const activeEnd = attack.active[1];
    const time = fighter.attackTime;
    const frames = attack.kind === "light" ? [8, 9, 10, 11]
      : attack.kind === "heavy" ? [8, 13, 13, 11]
        : [8, 13, 14, 11];
    if (time < startup * 0.48) return base(frames[0]);
    if (time < startup) return base(frames[1]);
    if (time <= activeEnd) return base(frames[2]);
    return base(frames[3]);
  }
  if (!fighter.grounded) return base(fighter.vy < 0 ? 13 : 15);
  if (fighter.dashFrames > 0) return base(5 + Math.floor(fighter.walkTime * 18) % 3);
  if (Math.abs(fighter.vx) > 22) return base(4 + Math.floor(fighter.walkTime * 10) % 4);
  return base(Math.floor(fighter.animTime * 5) % 4);
}

function drawAtlasFrame(atlas, frame, size) {
  const cell = 320;
  ctx.drawImage(atlas, (frame % 4) * cell, Math.floor(frame / 4) * cell, cell, cell, -size * 0.5, -size, size, size);
}

function activeGraphicFatality(fighter) {
  const finisher = state.finisher;
  if (!state.graphicFatalities || !finisher?.fatalityTriggered || fighter.side === finisher.winner) return null;
  const attacker = state.fighters[finisher.winner];
  const scriptId = attacker?.def.finisherScriptId || attacker?.def.id || "deathblow";
  return graphicFatalitySnapshot(scriptId, finisher.type, finisher.elapsed, finisher.fatalityAt);
}

function drawFatalityAtlasBand(atlas, frame, size, top, bottom, transform = {}) {
  const y = -size + top * size;
  const height = Math.max(1, (bottom - top) * size);
  ctx.save();
  ctx.translate(transform.x || 0, transform.y || 0);
  ctx.rotate(transform.rotation || 0);
  ctx.scale(transform.scaleX || 1, transform.scaleY || 1);
  ctx.globalAlpha *= transform.alpha ?? 1;
  if (transform.filter) ctx.filter = transform.filter;
  ctx.beginPath();
  ctx.rect(-size * .52, y, size * 1.04, height);
  ctx.clip();
  drawAtlasFrame(atlas, frame, size);
  ctx.restore();
}

function drawFatalityCut(size, yRatio, fatality, width = .32) {
  const y = -size + yRatio * size;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = fatality.palette[0];
  ctx.fillStyle = fatality.palette[1];
  ctx.shadowColor = fatality.palette[0];
  ctx.shadowBlur = 13;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-size * width, y);
  ctx.quadraticCurveTo(0, y + 9, size * width, y - 3);
  ctx.stroke();
  for (let drop = 0; drop < 7; drop += 1) {
    const x = (drop - 3) * size * width / 4;
    ctx.beginPath();
    ctx.ellipse(x, y + 6 + (drop % 3) * 4, 3 + drop % 2 * 2, 7 + drop % 3 * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFatalitySkeleton(size, fatality, pulse) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha *= .44 + pulse * .38;
  ctx.strokeStyle = "#fff9d8";
  ctx.shadowColor = fatality.palette[0];
  ctx.shadowBlur = 18;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -size * .72, size * .07, 0, Math.PI * 2);
  ctx.moveTo(0, -size * .64); ctx.lineTo(0, -size * .34);
  ctx.moveTo(-size * .13, -size * .56); ctx.lineTo(size * .13, -size * .56);
  ctx.moveTo(-size * .12, -size * .55); ctx.lineTo(-size * .2, -size * .34);
  ctx.moveTo(size * .12, -size * .55); ctx.lineTo(size * .2, -size * .34);
  ctx.moveTo(0, -size * .34); ctx.lineTo(-size * .13, -size * .08);
  ctx.moveTo(0, -size * .34); ctx.lineTo(size * .13, -size * .08);
  ctx.stroke();
  for (let rib = 0; rib < 4; rib += 1) {
    ctx.beginPath();
    ctx.ellipse(0, -size * (.56 - rib * .055), size * (.1 - rib * .008), size * .033, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGraphicFatalityVictim(atlas, frame, size, fatality, time) {
  const reveal = fatality.reveal;
  const settle = fatality.settle;
  const force = fatality.separation;
  const direction = state.finisher?.direction || 1;
  const whole = (transform = {}) => drawFatalityAtlasBand(atlas, frame, size, 0, 1, transform);
  const band = (top, bottom, x, y, rotation = 0, extra = {}) => drawFatalityAtlasBand(
    atlas,
    frame,
    size,
    top,
    bottom,
    { x: x * direction * force * settle, y: y * force * settle, rotation: rotation * direction * settle, ...extra },
  );

  ctx.save();
  if (fatality.family === "rupture") {
    band(0, .28, -74, -92, -.86);
    band(.28, .52, 38, -42, .33);
    band(.52, .73, -48, 12, -.25);
    band(.73, 1, 64, 34, .5);
    drawFatalityCut(size, .28, fatality);
    drawFatalityCut(size, .52, fatality, .37);
    drawFatalityCut(size, .73, fatality, .3);
  } else if (fatality.family === "slice") {
    const pieces = Math.max(3, Math.min(5, fatality.pieces));
    for (let index = 0; index < pieces; index += 1) {
      const top = index / pieces;
      const bottom = (index + 1) / pieces;
      const side = index % 2 ? 1 : -1;
      band(top, bottom, side * (42 + index * 12), -20 - index * 7, fatality.angle + side * .08);
      if (index < pieces - 1) drawFatalityCut(size, bottom, fatality, .36 - index * .025);
    }
  } else if (fatality.family === "crush") {
    const compression = 1 - reveal * .68;
    whole({
      y: size * .28 * reveal,
      scaleX: 1 + reveal * .34,
      scaleY: compression,
      filter: "contrast(1.28) saturate(.72) brightness(.72)",
    });
    if (reveal > .46) {
      band(0, .34, -54, -28, -.32, { alpha: reveal * .9 });
      band(.34, .68, 45, 10, .22, { alpha: reveal * .82 });
      drawFatalityCut(size, .43, fatality, .4);
    }
  } else if (fatality.family === "dissolve") {
    const strips = Math.max(6, Math.min(10, fatality.pieces));
    for (let index = 0; index < strips; index += 1) {
      const top = index / strips;
      const bottom = (index + 1) / strips;
      const wave = Math.sin(index * 2.4 + time * .018);
      band(top, bottom, wave * (26 + index * 5), 18 + index * 5, wave * .06, {
        alpha: 1 - reveal * (.25 + index / strips * .48),
        filter: `saturate(${1 + reveal * 1.8}) contrast(${1 + reveal * .5})`,
      });
    }
    ctx.globalAlpha *= .58 + reveal * .34;
    ctx.fillStyle = fatality.palette[0];
    for (let drop = 0; drop < 20; drop += 1) {
      const angle = drop * 2.399;
      const radius = (28 + (drop % 6) * 16) * reveal;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * radius, -size * .42 + Math.sin(angle) * radius + settle * 72, 5 + drop % 5 * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (fatality.family === "electrocute") {
    const pulse = (Math.sin(time * .045) + 1) * .5;
    if (settle < .62) {
      whole({
        x: (pulse - .5) * 18,
        filter: pulse > .46 ? "brightness(2.2) contrast(1.7) grayscale(1)" : "brightness(.18) contrast(2)",
      });
      drawFatalitySkeleton(size, fatality, pulse);
    } else {
      band(0, .26, -52, -70, -.58, { filter: "brightness(.2) saturate(0)" });
      band(.26, .55, 38, -22, .28, { filter: "brightness(.2) saturate(0)" });
      band(.55, .77, -44, 18, -.2, { filter: "brightness(.2) saturate(0)" });
      band(.77, 1, 50, 28, .42, { filter: "brightness(.2) saturate(0)" });
      drawFatalityCut(size, .55, fatality, .33);
    }
  } else if (fatality.family === "launch") {
    band(.25, 1, 0, 22, .18, { filter: "contrast(1.15) brightness(.72)" });
    band(0, .25, 135, -205, -1.65, { scaleX: .96, scaleY: .96 });
    drawFatalityCut(size, .25, fatality, .24);
    if (fatality.pieces > 3) {
      band(.36, .61, -48, -16, -.22, { alpha: reveal });
      band(.61, .82, 55, 23, .31, { alpha: reveal });
      drawFatalityCut(size, .61, fatality, .32);
    }
  } else if (fatality.family === "glitch") {
    const strips = Math.max(7, Math.min(12, fatality.pieces));
    for (let index = 0; index < strips; index += 1) {
      const top = index / strips;
      const bottom = (index + 1) / strips;
      const glitch = ((index * 47) % 9 - 4) * 9 * reveal;
      band(top, bottom, glitch, index % 3 === 0 ? -18 : 8, (index % 2 ? .04 : -.04) * reveal, {
        alpha: 1 - reveal * (index % 3 === 0 ? .48 : .18),
        filter: index % 2 ? "hue-rotate(75deg) contrast(1.45)" : "hue-rotate(-35deg) contrast(1.6)",
      });
    }
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = fatality.palette[0];
    for (let line = 0; line < 9; line += 1) {
      ctx.globalAlpha = .25 + (line % 3) * .16;
      ctx.fillRect(-size * .45 + ((line * 71) % 90), -size * (.9 - line * .09), size * (.25 + (line % 4) * .08), 3 + line % 3 * 3);
    }
  } else if (fatality.family === "implode") {
    if (settle < .5) {
      const compression = 1 - settle * 1.05;
      whole({ scaleX: compression, scaleY: compression, y: -size * .34 * (1 - compression), filter: "contrast(1.5) brightness(.72)" });
    } else {
      const burst = (settle - .5) * 2;
      const pieces = Math.max(5, Math.min(8, fatality.pieces));
      for (let index = 0; index < pieces; index += 1) {
        const top = index / pieces;
        const bottom = (index + 1) / pieces;
        const angle = index * Math.PI * 2 / pieces;
        band(top, bottom, Math.cos(angle) * 86 * burst, Math.sin(angle) * 72 * burst - 26, (index - pieces / 2) * .16);
      }
      drawFatalityCut(size, .48, fatality, .42);
    }
  } else {
    whole();
  }
  ctx.restore();
}

function drawAttackVfx(fighter, time, activePower) {
  const attack = fighter.attacking;
  if (!attack || activePower <= 0) return;
  const strong = attack.kind === "special";
  const reach = attack.kind === "special" ? 178 : attack.kind === "heavy" ? 125 : 90;
  const pulse = 0.82 + Math.sin(time * 0.022) * 0.18;
  ctx.save();
  ctx.globalAlpha = clamp(activePower * (strong ? 1 : 0.72), 0, 1);
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = fighter.def.accent;
  ctx.fillStyle = fighter.def.accent;
  ctx.shadowColor = fighter.def.accent;
  ctx.shadowBlur = strong ? 26 : 13;
  ctx.lineCap = "round";

  if (fighter.def.vfx === "seismic") {
    ctx.lineWidth = strong ? 9 : 5;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(12 + i * 19, -4);
      ctx.lineTo(33 + i * 18, -18 - (i % 2) * 16);
      ctx.lineTo(49 + i * 20, -3);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(76, -5, reach * 0.7 * pulse, 24 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (fighter.def.vfx === "paint") {
    for (let i = 0; i < (strong ? 11 : 6); i += 1) {
      const x = 44 + i * 13;
      const y = -126 + Math.sin(i * 2.1 + time * 0.018) * (22 + i * 2);
      ctx.globalAlpha = activePower * (0.45 + (i % 3) * 0.2);
      ctx.beginPath(); ctx.arc(x, y, 3 + (i % 4) * 2.1, 0, Math.PI * 2); ctx.fill();
    }
  } else if (fighter.def.vfx === "voltage") {
    ctx.lineWidth = strong ? 8 : 4;
    for (let row = -1; row <= 1; row += 1) {
      ctx.beginPath(); ctx.moveTo(24, -130 + row * 22);
      for (let i = 1; i <= 6; i += 1) ctx.lineTo(24 + i * reach / 6, -130 + row * 22 + (i % 2 ? -12 : 12));
      ctx.stroke();
    }
  } else if (fighter.def.vfx === "neon") {
    ctx.lineWidth = strong ? 12 : 6;
    ctx.beginPath(); ctx.arc(28, -128, reach * 0.78, -1.12, 1.1); ctx.stroke();
    ctx.strokeStyle = fighter.def.color;
    ctx.lineWidth *= 0.38;
    ctx.beginPath(); ctx.arc(34, -128, reach * 0.66, -1.05, 1.03); ctx.stroke();
  } else if (fighter.def.vfx === "steel") {
    ctx.lineWidth = strong ? 8 : 4;
    ctx.beginPath(); ctx.arc(reach * 0.72, -118, 34 * pulse, 0, Math.PI * 2); ctx.stroke();
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath(); ctx.moveTo(38, -118 + i * 17); ctx.lineTo(reach + 24, -118 + i * 8); ctx.stroke();
    }
  } else if (fighter.def.vfx === "gilded") {
    ctx.lineWidth = strong ? 16 : 8;
    ctx.beginPath(); ctx.arc(20, -130, reach * 0.86, -1.15, 1.15); ctx.stroke();
  } else if (fighter.def.vfx === "feedback") {
    ctx.lineWidth = strong ? 8 : 4;
    for (let i = 0; i < 4; i += 1) {
      ctx.globalAlpha = activePower * (1 - i * 0.18);
      ctx.beginPath(); ctx.ellipse(48 + i * 35, -128, 17 + i * 9, 49 + i * 8, 0, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (fighter.def.vfx === "bass") {
    ctx.lineWidth = strong ? 10 : 5;
    for (let i = 0; i < 4; i += 1) {
      ctx.globalAlpha = activePower * (1 - i * 0.17);
      ctx.beginPath(); ctx.arc(42, -125, 35 + i * 31, -0.9, 0.9); ctx.stroke();
    }
  } else if (fighter.def.vfx === "authority") {
    ctx.strokeStyle = fighter.def.accent;
    ctx.lineWidth = strong ? 9 : 5;
    ctx.beginPath();
    ctx.moveTo(18, -172);
    ctx.lineTo(reach + 28, -84);
    ctx.stroke();
    ctx.fillStyle = "#f7e4ae";
    for (let seal = 0; seal < 3; seal += 1) {
      ctx.globalAlpha = activePower * (0.85 - seal * 0.18);
      ctx.strokeRect(62 + seal * 36, -158 + seal * 18, 26, 26);
    }
  }
  ctx.restore();
}

function drawPaintTraps(time) {
  for (const trap of state.traps) {
    const armed = trap.armFrames <= 0;
    const life = clamp(trap.lifeFrames / trap.maxLifeFrames, 0, 1);
    const pulse = 1 + Math.sin(time * 0.009 + trap.x * 0.02) * 0.08;
    ctx.save();
    ctx.translate(trap.x, trap.y);
    ctx.globalAlpha = Math.min(1, life * 1.8) * (armed ? 0.9 : 0.58);
    ctx.fillStyle = trap.color;
    ctx.shadowColor = trap.color;
    ctx.shadowBlur = armed ? 21 : 9;
    ctx.beginPath();
    ctx.ellipse(0, 1, trap.radius * 0.86 * pulse, 14 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = "#fff2c6";
    for (let spot = 0; spot < 6; spot += 1) {
      const angle = spot * 2.4;
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * trap.radius * 0.52, -3 + Math.sin(angle) * 7, 6 + spot % 3 * 2, 3, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, life * 1.8);
    ctx.fillStyle = "#d9d9d9";
    ctx.fillRect(-7, -23, 14, 25);
    ctx.fillStyle = trap.color;
    ctx.fillRect(-7, -18, 14, 10);
    ctx.strokeStyle = armed ? "#fff" : trap.color;
    ctx.lineWidth = armed ? 3 : 2;
    ctx.globalAlpha *= armed ? 0.75 : 0.35;
    ctx.beginPath();
    ctx.ellipse(0, 0, trap.radius * pulse, 20 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (state.debug) {
      ctx.globalAlpha = 0.82;
      ctx.strokeStyle = "#ffef5a";
      ctx.setLineDash([7, 5]);
      ctx.strokeRect(-trap.radius, -80, trap.radius * 2, 84);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

// Each personal object is drawn as a recognisable physical thing rather than a
// recoloured orb, so its flight path and weight read at a glance.
function drawThrowable(projectile, time, life) {
  const w = projectile.width;
  const h = projectile.height;
  const angle = projectile.spinAngle || 0;
  const wobble = projectile.wobble ? Math.sin(time * 0.02) * projectile.wobble * 0.01 : 0;
  ctx.globalAlpha = Math.min(1, life * 2.2);
  switch (projectile.style) {
    case "pizza": {
      ctx.rotate(angle + wobble);
      ctx.fillStyle = "#e8b23a";
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c9812a";
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f2e2b4";
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c4402a";
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * w * 0.2, Math.sin(a) * w * 0.2, w * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(120,70,20,.5)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * w * 0.5, Math.sin(a) * w * 0.5);
        ctx.stroke();
      }
      break;
    }
    case "mouse": {
      // Cable trailing back toward the thrower.
      const owner = state.fighters[projectile.ownerSide];
      if (owner) {
        const back = (owner.x - projectile.x) * (Math.sign(projectile.vx) || 1);
        ctx.strokeStyle = "#8a93a5";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let i = 1; i <= 8; i += 1) {
          const t = i / 8;
          ctx.lineTo(back * t, Math.sin(t * Math.PI * 2 + time * 0.02) * 9 * (1 - t));
        }
        ctx.stroke();
      }
      ctx.rotate(Math.sin(angle) * 0.2);
      ctx.fillStyle = "#e3e8f0";
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5b6474";
      ctx.fillRect(-w * 0.06, -h * 0.5, w * 0.12, h * 0.42);
      ctx.fillStyle = "#7fe9ff";
      ctx.beginPath();
      ctx.arc(w * 0.18, 0, h * 0.14, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "loogie": {
      ctx.fillStyle = "#b9e37a";
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.5, h * 0.42, Math.atan2(projectile.vy, projectile.vx) * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(223,243,184,.75)";
      ctx.beginPath();
      ctx.ellipse(-w * 0.12, -h * 0.12, w * 0.18, h * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(137,184,79,.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, h * 0.1);
      ctx.quadraticCurveTo(-w * 0.9, 0, -w * 1.2, h * 0.2);
      ctx.stroke();
      break;
    }
    case "wires": {
      const uncoiled = projectile.hazard;
      ctx.strokeStyle = "#4f5b70";
      ctx.lineWidth = 4;
      const coils = uncoiled ? 5 : 7;
      for (let i = 0; i < coils; i += 1) {
        const spread = uncoiled ? w * 0.5 : w * 0.3;
        ctx.strokeStyle = i % 2 ? "#4f5b70" : "#7b3fa0";
        ctx.beginPath();
        if (uncoiled) {
          ctx.moveTo(-spread + (i / coils) * spread * 2, h * 0.2);
          ctx.quadraticCurveTo(
            -spread + ((i + 0.5) / coils) * spread * 2,
            h * 0.2 - 16 - Math.sin(time * 0.01 + i) * 5,
            -spread + ((i + 1) / coils) * spread * 2,
            h * 0.2,
          );
        } else {
          ctx.arc(0, 0, w * 0.2 + i * 3, angle + i, angle + i + 4.2);
        }
        ctx.stroke();
      }
      break;
    }
    case "xacto": {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.35 + Math.abs(Math.sin(time * 0.022)) * 0.55;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-w * 0.85, 0); ctx.lineTo(-w * 0.2, 0); ctx.stroke();
      ctx.restore();
      ctx.rotate(Math.atan2(projectile.vy, Math.abs(projectile.vx)));
      ctx.fillStyle = "#2b3038";
      ctx.fillRect(-w * 0.5, -h * 0.5, w * 0.45, h);
      ctx.fillStyle = "#dfe6f0";
      ctx.beginPath();
      ctx.moveTo(-w * 0.05, -h * 0.5);
      ctx.lineTo(w * 0.5, 0);
      ctx.lineTo(-w * 0.05, h * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-w * 0.05, 0);
      ctx.lineTo(w * 0.5, 0);
      ctx.stroke();
      break;
    }
    case "golfball": {
      ctx.globalAlpha *= 0.52;
      ctx.fillStyle = "#ffffff";
      for (let trail = 1; trail <= 3; trail += 1) {
        ctx.beginPath();
        ctx.arc(-w * (0.55 + trail * 0.32), 0, Math.max(2, w * (0.15 - trail * 0.025)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = Math.min(1, life * 2.2);
      ctx.rotate(angle);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(150,165,185,.55)";
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * w * 0.24, Math.sin(a) * w * 0.24, w * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "bedbugs": {
      const swarm = projectile.hazard ? 9 : 6;
      for (let i = 0; i < swarm; i += 1) {
        const phase = time * 0.01 + i * 1.7;
        const bx = Math.cos(phase) * w * (projectile.hazard ? 0.45 : 0.28);
        const by = Math.sin(phase * 1.4) * h * 0.3;
        ctx.fillStyle = i % 3 ? "#7a3a2c" : "#c4552f";
        ctx.beginPath();
        ctx.ellipse(bx, by, 6, 4.4, phase, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(40,20,14,.8)";
        ctx.lineWidth = 1.2;
        for (let leg = -1; leg <= 1; leg += 2) {
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + leg * 6, by + Math.sin(phase * 3) * 4);
          ctx.stroke();
        }
      }
      break;
    }
    case "vinyl": {
      ctx.save();
      ctx.globalAlpha = 0.22 + Math.abs(Math.sin(time * 0.018)) * 0.2;
      ctx.strokeStyle = "#ff4fb9";
      ctx.lineWidth = 2;
      for (let ring = 1; ring <= 2; ring += 1) {
        ctx.beginPath();
        ctx.ellipse(0, 0, w * (0.5 + ring * 0.22), h * (0.32 + ring * 0.12), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.rotate(angle);
      ctx.fillStyle = "#16161a";
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(216,216,210,.28)";
      ctx.lineWidth = 1.4;
      for (let r = 3; r < 5; r += 1) {
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.5 * (r / 6), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#ff4fb9";
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#16161a";
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.04, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "needle": {
      ctx.rotate(Math.atan2(projectile.vy, Math.abs(projectile.vx) || 1));
      ctx.fillStyle = "#cfd6e2";
      ctx.fillRect(-w * 0.5, -h * 0.35, w * 0.7, h * 0.7);
      ctx.fillStyle = "#e9edf5";
      ctx.beginPath();
      ctx.moveTo(w * 0.2, -h * 0.2);
      ctx.lineTo(w * 0.5, 0);
      ctx.lineTo(w * 0.2, h * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ff6b5a";
      ctx.fillRect(-w * 0.5, -h * 0.5, w * 0.16, h);
      break;
    }
    case "bottle": {
      ctx.rotate(angle);
      ctx.fillStyle = "rgba(96,148,72,.92)";
      ctx.beginPath();
      ctx.moveTo(-w * 0.32, h * 0.5);
      ctx.lineTo(w * 0.32, h * 0.5);
      ctx.lineTo(w * 0.32, -h * 0.05);
      ctx.lineTo(w * 0.14, -h * 0.3);
      ctx.lineTo(w * 0.14, -h * 0.5);
      ctx.lineTo(-w * 0.14, -h * 0.5);
      ctx.lineTo(-w * 0.14, -h * 0.3);
      ctx.lineTo(-w * 0.32, -h * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(240,248,220,.55)";
      ctx.fillRect(-w * 0.2, -h * 0.02, w * 0.1, h * 0.42);
      ctx.fillStyle = "#d8b24a";
      ctx.fillRect(-w * 0.3, h * 0.06, w * 0.6, h * 0.2);
      break;
    }
    case "pigeon": {
      ctx.rotate(angle * 0.6);
      ctx.fillStyle = "#6f7684";
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.42, h * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8c93a3";
      ctx.beginPath();
      ctx.ellipse(-w * 0.28, -h * 0.1, w * 0.16, h * 0.2, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#585f6c";
      ctx.beginPath();
      ctx.ellipse(w * 0.3, -h * 0.16, w * 0.14, h * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ff9a4a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-w * 0.1, h * 0.28);
      ctx.lineTo(-w * 0.24, h * 0.5);
      ctx.stroke();
      break;
    }
    case "tongs": {
      ctx.rotate(angle);
      ctx.strokeStyle = "#d5dce8";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, -h * 0.4);
      ctx.lineTo(w * 0.5, 0);
      ctx.moveTo(-w * 0.5, h * 0.4);
      ctx.lineTo(w * 0.5, 0);
      ctx.stroke();
      ctx.strokeStyle = "#9fb0c6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-w * 0.5, 0, h * 0.4, -1.4, 1.4);
      ctx.stroke();
      break;
    }
    case "cup": {
      ctx.rotate(angle * 0.5);
      ctx.fillStyle = "#ff5aa8";
      ctx.beginPath();
      ctx.moveTo(-w * 0.34, -h * 0.5);
      ctx.lineTo(w * 0.34, -h * 0.5);
      ctx.lineTo(w * 0.22, h * 0.5);
      ctx.lineTo(-w * 0.22, h * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fillRect(-w * 0.3, -h * 0.44, w * 0.6, h * 0.12);
      ctx.strokeStyle = "#7fe9ff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w * 0.1, -h * 0.5);
      ctx.lineTo(w * 0.34, -h * 0.9);
      ctx.stroke();
      break;
    }
    default: {
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// The grounded weapon and its arrival telegraph. Both fighters can see exactly
// where and when it lands, so the pickup is always contestable.
function drawStageWeapon(time) {
  const weapon = state.stageWeapon;
  if (!weapon || !["telegraph", "ground"].includes(weapon.phase)) return;
  const profile = stageWeaponProfile();
  if (!profile) return;
  const telegraphing = weapon.phase === "telegraph";
  const progress = telegraphing ? clamp(weapon.frames / Math.max(1, profile.telegraphFrames), 0, 1) : 1;
  const remaining = telegraphing ? 1 : 1 - clamp(weapon.frames / Math.max(1, profile.groundFrames), 0, 1);
  ctx.save();
  ctx.translate(weapon.x, FLOOR);

  // Landing marker.
  ctx.globalAlpha = telegraphing ? 0.35 + 0.4 * Math.abs(Math.sin(time * 0.012)) : 0.28 + remaining * 0.3;
  ctx.strokeStyle = "#ffd54a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 4, 46 * FIGHTER_SCALE * (telegraphing ? 0.6 + progress * 0.6 : 1), 13, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (telegraphing) {
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -190);
    ctx.lineTo(0, -20);
    ctx.setLineDash([8, 9]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.globalAlpha = telegraphing ? progress : 1;
  const drop = telegraphing ? -150 * (1 - progress) : Math.sin(time * 0.006) * 2;
  ctx.translate(0, -profile.height * 0.5 * FIGHTER_SCALE + drop);
  drawThrowable({
    style: profile.style,
    width: profile.width * FIGHTER_SCALE,
    height: profile.height * FIGHTER_SCALE,
    spinAngle: telegraphing ? time * 0.01 : 0,
    vx: 1,
    vy: 0,
    color: "#ffd54a",
    ownerSide: -1,
    hazard: false,
  }, time, 1);

  if (profile.glint) {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.02));
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    for (const angle of [0, Math.PI / 2]) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * -22, Math.sin(angle) * -22);
      ctx.lineTo(Math.cos(angle) * 22, Math.sin(angle) * 22);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Name tag so the object is identifiable without knowing the stage.
  ctx.save();
  ctx.globalAlpha = telegraphing ? progress : 0.55 + remaining * 0.45;
  ctx.font = "900 15px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd54a";
  ctx.strokeStyle = "rgba(0,0,0,.75)";
  ctx.lineWidth = 4;
  ctx.strokeText(profile.name, weapon.x, FLOOR - profile.height * FIGHTER_SCALE - 26);
  ctx.fillText(profile.name, weapon.x, FLOOR - profile.height * FIGHTER_SCALE - 26);
  ctx.restore();
}

function drawProjectiles(time) {
  for (const projectile of state.projectiles) {
    const direction = Math.sign(projectile.vx) || projectile.direction || 1;
    const life = clamp(projectile.lifeFrames / projectile.maxLifeFrames, 0, 1);
    const pulse = 1 + Math.sin(time * 0.018 + projectile.x * 0.03) * 0.11;
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.scale(direction, 1);
    if (projectile.throwable) {
      // Ground shadow so the arc and landing point read clearly.
      ctx.save();
      ctx.scale(direction, 1);
      ctx.fillStyle = "rgba(0,0,0,.34)";
      ctx.beginPath();
      ctx.ellipse(0, FLOOR - projectile.y, projectile.width * 0.34, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawThrowable(projectile, time, life);
      ctx.restore();
      continue;
    }
    if (projectile.style === "feedback") {
      const armed = projectile.armFrames <= 0;
      const charge = projectile.maxArmFrames
        ? 1 - clamp(projectile.armFrames / projectile.maxArmFrames, 0, 1)
        : 1;
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.min(0.95, life * 1.6) * (0.38 + charge * 0.62);
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = armed ? 30 : 17;
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = armed ? 6 : 3;
      if (!armed) ctx.setLineDash([9, 7]);
      for (let ring = 0; ring < 3; ring += 1) {
        const phase = (time * 0.004 + ring * 0.29) % 1;
        const radiusX = projectile.width * (0.2 + phase * 0.34) * pulse;
        const radiusY = projectile.height * (0.23 + phase * 0.28) * pulse;
        ctx.globalAlpha *= 0.82;
        ctx.beginPath();
        ctx.ellipse(0, 0, radiusX, radiusY, Math.sin(time * 0.002 + ring) * 0.13, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = armed ? 0.9 : 0.48;
      ctx.fillStyle = armed ? "#efffe8" : projectile.color;
      for (let slice = -2; slice <= 2; slice += 1) {
        const jitter = Math.sin(time * 0.03 + slice * 2.1) * 9;
        ctx.fillRect(-projectile.width * 0.38 + jitter, slice * projectile.height * 0.16 - 3, projectile.width * (0.7 - Math.abs(slice) * 0.08), armed ? 5 : 3);
      }
      if (state.debug) {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = "#ffef5a";
        ctx.strokeRect(-projectile.width * 0.5, -projectile.height * 0.5, projectile.width, projectile.height);
      }
      ctx.restore();
      continue;
    }
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = Math.min(1, life * 2);
    const trail = ctx.createLinearGradient(-105, 0, 20, 0);
    trail.addColorStop(0, `${projectile.color}00`);
    trail.addColorStop(0.55, `${projectile.color}78`);
    trail.addColorStop(1, projectile.color);
    ctx.fillStyle = trail;
    ctx.beginPath();
    ctx.moveTo(-112, 0);
    ctx.quadraticCurveTo(-32, -projectile.height * 0.5, 15, 0);
    ctx.quadraticCurveTo(-32, projectile.height * 0.5, -112, 0);
    ctx.fill();
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#fff5b8";
    ctx.beginPath();
    ctx.ellipse(0, 0, projectile.width * 0.34 * pulse, projectile.height * 0.4 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = projectile.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, projectile.height * 0.48 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.82)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-4, -4, projectile.height * 0.18, -2.7, -0.3);
    ctx.stroke();
    if (state.debug) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#ffef5a";
      ctx.strokeRect(-projectile.width * 0.5, -projectile.height * 0.5, projectile.width, projectile.height);
    }
    ctx.restore();
  }
}

// 330 was 62.4% of the playable fight area; FIGHTER_SCALE lifts the roster into
// the 68-74% MK/SF2 band, and the per-fighter adjust keeps body types distinct
// without letting anyone leave that band.
const FIGHTER_RENDER_BASE = 330;
const FIGHTER_SIZE_ADJUST = Object.freeze({
  deathblow: 1.068, jez: 0.995, alan: 1.062, post: 1.04,
  benny: 1, donald: 1.02, cyraxx: 1.02, ali: 0.99, commissioner: 1.03,
});

function fighterRenderSize(fighterId) {
  return FIGHTER_RENDER_BASE * FIGHTER_SCALE * (FIGHTER_SIZE_ADJUST[fighterId] || 1);
}

function drawFighter(fighter, time) {
  const jump = FLOOR - fighter.y;
  const attack = fighter.attacking;
  const attackProgress = attack ? clamp(fighter.attackTime / attack.duration, 0, 1) : 0;
  const attackSwing = attack ? Math.sin(attackProgress * Math.PI) : 0;
  const startupPower = attack && fighter.attackTime < attack.active[0]
    ? Math.sin((fighter.attackTime / attack.active[0]) * Math.PI) : 0;
  const activePower = attack && fighter.attackTime >= attack.active[0] && fighter.attackTime <= attack.active[1]
    ? 1 : attack ? Math.max(0, attackSwing * 0.42) : 0;
  const moving = Math.abs(fighter.vx) > 22 && fighter.grounded && !attack;
  const bob = fighter.cinematicFrame === null && fighter.grounded && !fighter.stun && !fighter.block
    ? Math.sin((moving ? fighter.walkTime * 20 : fighter.animTime * 10) + fighter.side * 2) * (moving ? 1.8 : 2.7) : 0;
  const pose = fighterAnimationPose(fighter);
  const atlas = pose.bank === "specials"
    ? fighterMoveAtlases[fighter.def.id] || fighterAtlases[fighter.def.id]
    : fighterAtlases[fighter.def.id];
  const frame = pose.frame;
  const graphicFatality = activeGraphicFatality(fighter);
  const sizeAdjust = FIGHTER_SIZE_ADJUST[fighter.def.id] || 1;
  const moveSheetAdjust = pose.bank === "specials"
    ? ({ deathblow: 1.14, jez: 1.03, alan: 1.06, post: 1.02, benny: 1.02, donald: 1.04, cyraxx: 1.05, ali: 1.04, commissioner: 1.02 }[fighter.def.id] || 1)
    : 1;
  const renderSize = fighterRenderSize(fighter.def.id) * moveSheetAdjust;
  const attackKind = attack?.kind;
  const lunge = attackSwing * (attackKind === "special" ? 68 : attackKind === "heavy" ? 46 : 29);
  const crouchScale = fighter.crouch ? 0.88 : 1;
  const crouchDrop = fighter.crouch ? 21 : 0;

  ctx.save();
  ctx.translate(fighter.x, fighter.y + bob);
  ctx.fillStyle = "rgba(0,0,0,.58)";
  ctx.beginPath();
  ctx.ellipse(0, jump + 5, renderSize * 0.24, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  if (fighter.def.id === "ali" && fighter.rhythmStacks > 0) {
    ctx.save();
    ctx.translate(0, -112);
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = fighter.rhythmStacks === 3 ? "#ff4fb9" : fighter.def.accent;
    ctx.shadowColor = fighter.def.accent;
    ctx.shadowBlur = 17 + fighter.rhythmStacks * 4;
    for (let ring = 0; ring < fighter.rhythmStacks; ring += 1) {
      ctx.globalAlpha = 0.24 + ring * 0.07;
      ctx.lineWidth = 3 + ring;
      ctx.beginPath();
      ctx.arc(0, 0, 72 + ring * 22 + Math.sin(time * 0.01 + ring) * 6, -1.12, 1.12);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (fighter.cinematicRotation) ctx.rotate(fighter.cinematicRotation);
  if (fighter.cinematicScale !== 1) ctx.scale(fighter.cinematicScale, fighter.cinematicScale);

  if (fighter.down) {
    ctx.rotate(-fighter.facing * 1.35);
    ctx.translate(-fighter.facing * 45, 17);
  }

  ctx.scale(fighter.facing, 1);
  ctx.translate(lunge - startupPower * 8, crouchDrop - attackSwing * (attackKind === "special" ? 13 : 5));
  ctx.rotate(-attackSwing * (attackKind === "heavy" ? 0.07 : 0.025));
  ctx.scale(1 + activePower * 0.045 - startupPower * 0.025, crouchScale + startupPower * 0.035 - activePower * 0.025);

  if (fighter.specialGlow > 0) {
    const glow = ctx.createRadialGradient(0, -135, 16, 0, -135, 178);
    glow.addColorStop(0, `${fighter.def.accent}88`);
    glow.addColorStop(1, `${fighter.def.accent}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(-205, -335, 410, 350);
  }

  drawAttackVfx(fighter, time, activePower);
  if (fighter.carriedWeapon) {
    const carried = stageWeaponProfile();
    if (carried) {
      ctx.save();
      ctx.translate(52 * FIGHTER_SCALE, -150 * FIGHTER_SCALE);
      drawThrowable({
        style: carried.style,
        width: carried.width * FIGHTER_SCALE,
        height: carried.height * FIGHTER_SCALE,
        spinAngle: 0.4,
        vx: 1,
        vy: 0,
        color: "#ffd54a",
        ownerSide: -1,
        hazard: false,
      }, time, 1);
      ctx.restore();
    }
  }

  if (atlas?.complete && atlas.naturalWidth) {
    const baseTrails = state.accessibility.reducedMotion
      ? 0
      : attack ? (attackKind === "special" ? 3 : activePower > 0.8 ? 2 : 0) : 0;
    const trails = Math.floor(baseTrails * state.performance.trailScale);
    for (let index = trails; index >= 1; index -= 1) {
      ctx.save();
      ctx.translate(-index * (13 + activePower * 8), index * 1.5);
      ctx.globalAlpha = 0.08 + (trails - index) * 0.045;
      ctx.globalCompositeOperation = "screen";
      ctx.filter = "saturate(1.65) brightness(1.35)";
      ctx.shadowColor = fighter.def.accent;
      ctx.shadowBlur = 22;
      drawAtlasFrame(atlas, frame, renderSize);
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = fighter.specialGlow > 0 ? fighter.def.accent : "rgba(0,0,0,.9)";
    ctx.shadowBlur = state.performance.shadows ? fighter.specialGlow > 0 ? 25 : 9 : 0;
    ctx.shadowOffsetY = 6;
    if (fighter.hitFlash > 0) ctx.filter = "brightness(2.5) saturate(.28)";
    else if (fighter.block) ctx.filter = "brightness(.82) saturate(.78)";
    if (graphicFatality) drawGraphicFatalityVictim(atlas, frame, renderSize, graphicFatality, time);
    else drawAtlasFrame(atlas, frame, renderSize);
    ctx.restore();
  } else {
    ctx.fillStyle = fighter.def.color;
    ctx.fillRect(-48, -205, 96, 205);
  }

  if (fighter.block) {
    ctx.strokeStyle = `${fighter.def.accent}dd`;
    ctx.shadowColor = fighter.def.accent;
    ctx.shadowBlur = 17;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(35, -139, 85, -1.18, 1.18);
    ctx.stroke();
  }
  ctx.restore();

  if (fighter.stun > 0.4 && !fighter.down) {
    ctx.fillStyle = fighter.def.accent;
    ctx.font = "900 22px Arial";
    ctx.textAlign = "center";
    ctx.fillText("✦", fighter.x, fighter.y - fighter.height - 38 + Math.sin(time * 0.02) * 8);
  }
}

function drawLimb(x1, y1, x2, y2, width, skin, cloth) {
  ctx.lineCap = "round";
  ctx.strokeStyle = cloth;
  ctx.lineWidth = width + 6;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(lerp(x1, x2, 0.62), lerp(y1, y2, 0.62));
  ctx.stroke();
  ctx.strokeStyle = skin;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(lerp(x1, x2, 0.58), lerp(y1, y2, 0.58));
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawWeapon(fighter, handX, handY, swing) {
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(-0.35 + swing * 1.25);
  ctx.strokeStyle = fighter.def.accent;
  ctx.fillStyle = fighter.def.accent;
  ctx.lineCap = "round";
  ctx.lineWidth = 8;
  switch (fighter.def.weapon) {
    case "gauntlets":
      ctx.fillRect(-12, -18, 42, 36);
      ctx.fillStyle = "#303741";
      for (let i = 0; i < 3; i += 1) ctx.fillRect(20 + i * 7, -15 + i * 3, 11, 8);
      break;
    case "signblade":
      ctx.shadowBlur = 20;
      ctx.shadowColor = fighter.def.accent;
      ctx.fillRect(-4, -12, 18, 20);
      ctx.fillRect(8, -94, 10, 100);
      ctx.fillRect(-4, -102, 34, 13);
      break;
    case "reelchain":
      ctx.beginPath();
      ctx.arc(10, -5, 21, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(25, -20);
      ctx.lineTo(73, -71);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case "posthammer":
      ctx.fillRect(6, -75, 9, 86);
      ctx.fillRect(-20, -89, 61, 25);
      break;
    case "caneblade":
      ctx.beginPath();
      ctx.moveTo(5, 8);
      ctx.lineTo(12, -94);
      ctx.quadraticCurveTo(36, -113, 47, -89);
      ctx.stroke();
      break;
    case "golfclub":
      ctx.strokeStyle = "#eee6c8";
      ctx.beginPath();
      ctx.moveTo(5, 8);
      ctx.lineTo(17, -91);
      ctx.stroke();
      ctx.fillStyle = fighter.def.accent;
      ctx.fillRect(10, -100, 43, 18);
      break;
    case "micstaff":
      ctx.fillRect(7, -99, 8, 113);
      ctx.beginPath();
      ctx.arc(11, -107, 15, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "micchucks":
      ctx.beginPath();
      ctx.moveTo(7, -10);
      ctx.lineTo(20, -55);
      ctx.moveTo(30, -66);
      ctx.lineTo(55, -99);
      ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(20, -55);
      ctx.lineTo(30, -66);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function drawFinisherImpact(effect, alpha) {
  const spread = (effect.final ? 155 : 72) * effect.power;
  const growth = 1 - alpha;
  ctx.globalCompositeOperation = "screen";
  ctx.lineCap = "round";
  ctx.fillStyle = effect.color;
  ctx.strokeStyle = effect.color;

  if (effect.style === "seismic") {
    ctx.lineWidth = effect.final ? 11 : 6;
    ctx.beginPath(); ctx.ellipse(0, 94, spread * (.35 + growth), 18 + growth * 38, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = -4; i <= 4; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * 12, 45); ctx.lineTo(i * 24, 85); ctx.lineTo(i * 43, 112 + (i % 2) * 12); ctx.stroke();
    }
  } else if (effect.style === "neon") {
    ctx.lineWidth = effect.final ? 10 : 5;
    ctx.rotate((effect.variant ? -1 : 1) * growth * .7);
    for (let i = 0; i < 3; i += 1) {
      const radius = spread * (.28 + i * .22 + growth * .28);
      ctx.beginPath(); ctx.arc(0, 0, radius, i * .7, i * .7 + Math.PI * 1.35); ctx.stroke();
    }
    ctx.strokeStyle = effect.secondary;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = i * Math.PI / 4;
      const radius = i % 2 ? spread * .32 : spread * .6;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
  } else if (effect.style === "steel") {
    ctx.lineWidth = effect.final ? 12 : 6;
    ctx.beginPath(); ctx.arc(0, 0, spread * (.3 + growth * .55), 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 12; i += 1) {
      const angle = i * Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 18, Math.sin(angle) * 18); ctx.lineTo(Math.cos(angle) * spread, Math.sin(angle) * spread); ctx.stroke();
    }
  } else if (effect.style === "paint") {
    for (let i = 0; i < (effect.final ? 26 : 12); i += 1) {
      const angle = i * 2.399 + effect.variant;
      const radius = spread * (.15 + ((i * 37) % 100) / 120) * (0.45 + growth);
      ctx.globalAlpha = alpha * (.48 + (i % 3) * .2);
      ctx.fillStyle = i % 3 ? effect.color : effect.secondary;
      ctx.beginPath(); ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 4 + (i % 5) * 3, 0, Math.PI * 2); ctx.fill();
    }
  } else if (effect.style === "voltage") {
    ctx.lineWidth = effect.final ? 9 : 5;
    for (let branch = 0; branch < (effect.final ? 9 : 5); branch += 1) {
      const angle = branch * Math.PI * 2 / (effect.final ? 9 : 5);
      ctx.save(); ctx.rotate(angle); ctx.beginPath(); ctx.moveTo(0, 0);
      for (let step = 1; step <= 6; step += 1) ctx.lineTo(step * spread / 6, (step % 2 ? -1 : 1) * (8 + branch % 3 * 4));
      ctx.stroke(); ctx.restore();
    }
  } else if (effect.style === "gilded") {
    ctx.lineWidth = effect.final ? 18 : 9;
    for (let i = 0; i < 3; i += 1) {
      ctx.globalAlpha = alpha * (1 - i * .2);
      ctx.beginPath(); ctx.arc(-spread * .2, 0, spread * (.45 + i * .18 + growth * .2), -1.15, 1.15); ctx.stroke();
    }
  } else if (effect.style === "feedback") {
    ctx.lineWidth = effect.final ? 10 : 5;
    for (let i = 0; i < 5; i += 1) {
      ctx.globalAlpha = alpha * (1 - i * .13);
      const radius = spread * (.22 + i * .18 + growth * .22);
      ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * (.55 + i * .06), i % 2 ? .2 : -.2, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (effect.style === "bass") {
    ctx.lineWidth = effect.final ? 12 : 6;
    ctx.beginPath(); ctx.arc(0, 0, 20 + growth * 28, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      ctx.globalAlpha = alpha * (1 - i * .14);
      ctx.beginPath(); ctx.arc(0, 0, spread * (.25 + i * .19 + growth * .16), -1.1, 1.1); ctx.stroke();
    }
  }
}

function drawFatalityPool(effect, alpha) {
  const growth = 1 - alpha;
  const scale = effect.scale || 1;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.scale(effect.direction || 1, 1);
  ctx.globalAlpha = Math.min(1, alpha * 1.8);
  const pool = ctx.createRadialGradient(0, 0, 4, 0, 0, 116 * scale);
  pool.addColorStop(0, effect.color);
  pool.addColorStop(.54, effect.secondary);
  pool.addColorStop(1, "rgba(40,0,8,0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(0, 0, (42 + growth * 112) * scale, 8 + growth * 25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = effect.color;
  for (let drop = 0; drop < 13; drop += 1) {
    const angle = drop * 2.399 + (effect.family === "glitch" ? .4 : 0);
    const reach = (24 + growth * 118) * (.45 + (drop % 5) * .14) * scale;
    ctx.globalAlpha = alpha * (.38 + drop % 3 * .18);
    ctx.beginPath();
    ctx.ellipse(Math.cos(angle) * reach, Math.sin(angle) * reach * .22, 4 + drop % 4 * 3, 2 + drop % 3 * 2, angle, 0, Math.PI * 2);
    ctx.fill();
  }
  if (["rupture", "launch", "crush"].includes(effect.family)) {
    ctx.globalAlpha = alpha * .82;
    ctx.fillStyle = "#e9d6b1";
    ctx.strokeStyle = "#6d0c19";
    ctx.lineWidth = 4;
    ctx.rotate(-.18);
    ctx.beginPath();
    ctx.rect(-31, -13, 62, 14);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawCinematicGoreOverlay() {
  if (!state.graphicFatalities || !state.finisher) return;
  const overlays = state.effects.filter((effect) => effect.kind === "lensBlood");
  for (const effect of overlays) {
    const lifeAlpha = clamp(effect.life / effect.max, 0, 1);
    const reveal = clamp((1 - lifeAlpha) * 8, 0, 1);
    const alpha = reveal * Math.min(1, lifeAlpha * 2.2);
    if (alpha <= 0) continue;
    const familySeed = [...effect.family].reduce((total, character) => total + character.charCodeAt(0), 0)
      + effect.variant * 97;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    const vignette = ctx.createRadialGradient(W * .5, H * .46, W * .18, W * .5, H * .46, W * .68);
    vignette.addColorStop(0, "rgba(60,0,7,0)");
    vignette.addColorStop(.72, `rgba(96,0,12,${alpha * .12})`);
    vignette.addColorStop(1, `rgba(20,0,4,${alpha * .66})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = effect.color;
    ctx.strokeStyle = effect.secondary;
    ctx.shadowColor = "rgba(35,0,4,.8)";
    ctx.shadowBlur = 5;
    for (let drop = 0; drop < 31; drop += 1) {
      const x = ((drop * 173 + familySeed * 29) % 1180) / 1180 * W;
      const y = ((drop * 97 + familySeed * 43) % 640) / 640 * H;
      const edgeBias = drop % 3 === 0 ? (drop % 2 ? H * .1 : H * .88) : y;
      const radius = (4 + drop % 7 * 2.8) * (effect.scale || 1);
      ctx.globalAlpha = alpha * (.2 + drop % 5 * .09);
      ctx.beginPath();
      ctx.ellipse(x, edgeBias, radius * (drop % 4 === 0 ? 2.4 : 1), radius, (drop * .71) % Math.PI, 0, Math.PI * 2);
      ctx.fill();
      if (drop % 5 === 0) {
        ctx.lineWidth = Math.max(2, radius * .28);
        ctx.beginPath();
        ctx.moveTo(x, edgeBias);
        ctx.quadraticCurveTo(x + (drop % 2 ? -34 : 34), edgeBias + 38, x + (drop % 2 ? -22 : 22), edgeBias + 92);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = alpha * .56;
    ctx.lineCap = "round";
    if (["slice", "rupture", "launch"].includes(effect.family)) {
      ctx.lineWidth = effect.family === "slice" ? 19 : 13;
      ctx.beginPath();
      ctx.moveTo(W * .08, H * (effect.family === "launch" ? .76 : .68));
      ctx.quadraticCurveTo(W * .48, H * .25, W * .94, H * (effect.family === "rupture" ? .18 : .34));
      ctx.stroke();
    } else if (["crush", "implode"].includes(effect.family)) {
      ctx.fillStyle = effect.secondary;
      ctx.beginPath();
      ctx.ellipse(W * .5, H * .93, W * .43, H * .1, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.family === "electrocute") {
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = "#ff3048";
      ctx.lineWidth = 6;
      for (let bolt = 0; bolt < 6; bolt += 1) {
        ctx.beginPath();
        ctx.moveTo((bolt + 1) * W / 7, 0);
        ctx.lineTo((bolt + .7) * W / 7, H * .2);
        ctx.lineTo((bolt + 1.25) * W / 7, H * .42);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = effect.color;
      for (let strip = 0; strip < 8; strip += 1) {
        ctx.globalAlpha = alpha * (.18 + strip % 3 * .1);
        ctx.fillRect((strip * 191 + familySeed) % W, H * (.12 + strip * .1), W * (.08 + strip % 3 * .04), 5 + strip % 3 * 5);
      }
    }
    ctx.restore();
  }
}

// Unmistakable dizzy feedback: a ring of stars orbiting the head plus a label.
function drawDizzyStars(fighter, time) {
  if (!fighter || fighter.dizzyFrames <= 0) return;
  const centreX = fighter.x;
  // Anchor to the DRAWN sprite height, not the collision box, so the stars orbit
  // above the head rather than across the chest.
  const drawnHeight = fighterRenderSize(fighter.def.id) * 0.956;
  const centreY = fighter.y - drawnHeight - 26;
  const remaining = fighter.dizzyFrames / Math.max(1, fighter.dizzyTotalFrames);
  const stars = 5;
  ctx.save();
  ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(time * 6));
  for (let index = 0; index < stars; index += 1) {
    const angle = time * 4.4 + (index / stars) * Math.PI * 2;
    const x = centreX + Math.cos(angle) * 52;
    const y = centreY + Math.sin(angle) * 15;
    const size = 7 + Math.sin(angle * 2) * 2.4;
    ctx.fillStyle = index % 2 ? "#ffd54a" : "#fff2b8";
    ctx.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 ? size * 0.44 : size;
      const pointAngle = (point / 10) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(pointAngle) * radius;
      const py = y + Math.sin(pointAngle) * radius;
      if (point === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = "900 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd54a";
  ctx.strokeStyle = "rgba(0,0,0,.72)";
  ctx.lineWidth = 4;
  ctx.strokeText("DIZZY", centreX, centreY - 30);
  ctx.fillText("DIZZY", centreX, centreY - 30);
  // A thin drain bar shows the dizzy running out, so the punish window is legible.
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(centreX - 34, centreY - 22, 68, 5);
  ctx.fillStyle = "#ffd54a";
  ctx.fillRect(centreX - 34, centreY - 22, 68 * remaining, 5);
  ctx.restore();
}

function drawParticles() {
  for (const particle of state.particles) {
    const alpha = clamp(particle.life / particle.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = particle.kind === "dust" ? alpha * 0.42 : alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    if (particle.kind === "blood") {
      const angle = Math.atan2(particle.vy || 0, particle.vx || 1);
      ctx.ellipse(particle.x, particle.y, particle.size * 1.65, Math.max(1, particle.size * 0.62), angle, 0, Math.PI * 2);
    } else if (particle.kind === "goreFragment") {
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation || 0);
      const spikes = particle.spikes || 6;
      for (let point = 0; point < spikes * 2; point += 1) {
        const angle = point * Math.PI / spikes;
        const radius = particle.size * (point % 2 ? .48 : 1);
        if (point === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath();
    } else if (particle.kind === "dust") {
      ctx.ellipse(particle.x, particle.y, particle.size * 1.5, particle.size * 0.6, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    }
    ctx.fill();
    if (particle.kind === "goreFragment" && particle.bone) {
      ctx.fillStyle = "#ead7b7";
      ctx.fillRect(-particle.size * .58, -2, particle.size * 1.16, 4);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  for (const effect of state.effects) {
    const alpha = clamp(effect.life / (effect.max || 0.9), 0, 1);
    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = effect.color;
    ctx.shadowBlur = 25;
    ctx.shadowColor = effect.color;
    if (effect.kind === "combatText") {
      ctx.globalAlpha = Math.min(1, alpha * 1.7);
      ctx.translate(0, -(1 - alpha) * 42);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 24px Arial Narrow, Arial, sans-serif";
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(0,0,0,.88)";
      ctx.strokeText(effect.label, 0, 0);
      ctx.fillStyle = effect.color;
      ctx.fillText(effect.label, 0, 0);
    } else if (effect.kind === "finisherImpact") {
      drawFinisherImpact(effect, alpha);
    } else if (effect.kind === "fatalityPool") {
      drawFatalityPool(effect, alpha);
    } else if (effect.kind === "goreShockwave") {
      const growth = 1 - alpha;
      const reach = (54 + growth * 250) * (effect.scale || 1);
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = effect.color;
      ctx.fillStyle = effect.secondary;
      ctx.lineCap = "round";
      for (let spray = 0; spray < 17; spray += 1) {
        const angle = -1.42 + spray * .18 + (effect.family === "launch" ? -.18 : 0);
        const length = reach * (.38 + (spray % 6) * .12);
        ctx.globalAlpha = alpha * (.28 + spray % 4 * .14);
        ctx.lineWidth = 3 + spray % 5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
          Math.cos(angle) * length * .5 * effect.direction,
          Math.sin(angle) * length * .55 - 20,
          Math.cos(angle) * length * effect.direction,
          Math.sin(angle) * length,
        );
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(Math.cos(angle) * length * effect.direction, Math.sin(angle) * length, 3 + spray % 4 * 2, 7 + spray % 5 * 2, angle, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (effect.kind === "lensBlood") {
      // Screen-space pass in drawCinematicGoreOverlay().
    } else if (effect.kind === "bloodBurst") {
      const scale = effect.tier === "super" ? 1.45 : effect.tier === "light" ? 0.7 : 1;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = effect.color;
      ctx.fillStyle = effect.color;
      ctx.lineCap = "round";
      for (let spray = 0; spray < 7; spray += 1) {
        const spread = (spray - 3) * 0.22;
        const reach = (18 + (1 - alpha) * (58 + spray * 7)) * scale;
        ctx.globalAlpha = alpha * (0.45 + spray % 2 * 0.22);
        ctx.lineWidth = (2.5 + spray % 3) * scale;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(effect.direction * reach * 0.55, spread * reach - 18, effect.direction * reach, spread * reach);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(effect.direction * reach, spread * reach, (2 + spray % 3) * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (effect.kind === "impactFlash") {
      const radius = (effect.tier === "super" ? 64 : effect.tier === "light" ? 26 : 42) * alpha;
      ctx.globalCompositeOperation = "screen";
      ctx.shadowBlur = 18;
      ctx.lineWidth = 5 * alpha;
      for (let ray = 0; ray < 6; ray += 1) {
        const angle = ray * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 4, Math.sin(angle) * 4);
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        ctx.stroke();
      }
    } else if (effect.kind === "bloodDecal") {
      ctx.shadowBlur = 0;
      ctx.globalAlpha = Math.min(0.68, alpha * 0.82);
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, effect.width * 0.5, Math.max(3, effect.width * 0.1), 0, 0, Math.PI * 2);
      ctx.fill();
      for (let drop = 0; drop < 5; drop += 1) {
        const angle = drop * 2.37;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * effect.width * 0.55, Math.sin(angle) * effect.width * 0.1, 2 + drop % 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (effect.kind === "floorImpact") {
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha * 0.55;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 5 * alpha;
      ctx.beginPath();
      ctx.ellipse(0, 0, effect.width * (1 - alpha * 0.25), 12 + (1 - alpha) * 12, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    } else if (effect.kind === "objectImpact") {
      ctx.shadowBlur = 8;
      ctx.lineWidth = effect.settling ? 2 : 5;
      const radius = (effect.settling ? 18 : 30) + (1 - alpha) * 28;
      for (let slash = 0; slash < 5; slash += 1) {
        const angle = slash * Math.PI * 2 / 5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * radius * 0.35, Math.sin(angle) * radius * 0.35);
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        ctx.stroke();
      }
    } else if (effect.kind === "paintDeploy" || effect.kind === "paintTrapBurst") {
      const burst = effect.kind === "paintTrapBurst";
      const radius = (1 - alpha) * (burst ? 138 : 72) + 12;
      ctx.globalCompositeOperation = "screen";
      for (let drop = 0; drop < (burst ? 18 : 9); drop += 1) {
        const angle = drop * 2.399 + (burst ? 0.35 : 0);
        const reach = radius * (0.35 + (drop % 5) * 0.13);
        ctx.globalAlpha = alpha * (0.5 + (drop % 3) * 0.18);
        ctx.fillStyle = effect.color;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * reach, Math.sin(angle) * reach * 0.45, 4 + (drop % 4) * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (effect.kind === "counterPunch") {
      const radius = (1 - alpha) * 126 + 24;
      ctx.globalCompositeOperation = "screen";
      ctx.lineWidth = 12 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, radius, -1.25, 1.25);
      ctx.stroke();
      for (let ray = 0; ray < 10; ray += 1) {
        const angle = ray * Math.PI * 2 / 10;
        ctx.lineWidth = ray % 2 ? 4 : 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 20, Math.sin(angle) * 20);
        ctx.lineTo(Math.cos(angle) * radius * 1.35, Math.sin(angle) * radius * 1.35);
        ctx.stroke();
      }
    } else if (effect.kind === "flowPulse") {
      const radius = 35 + (1 - alpha) * (80 + effect.stacks * 18);
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = effect.color;
      for (let ring = 0; ring < effect.stacks + 1; ring += 1) {
        ctx.globalAlpha = alpha * (1 - ring * 0.15);
        ctx.lineWidth = 7 - ring;
        ctx.beginPath();
        ctx.arc(0, 0, radius + ring * 18, -1.1, 1.1);
        ctx.stroke();
      }
    } else if (effect.kind === "feedbackTelegraph" || effect.kind === "feedbackBurst") {
      const burst = effect.kind === "feedbackBurst";
      const radius = (1 - alpha) * (burst ? 146 : 76) + 18;
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = effect.color;
      for (let ring = 0; ring < (burst ? 5 : 3); ring += 1) {
        ctx.globalAlpha = alpha * (1 - ring * 0.13);
        ctx.lineWidth = burst ? 8 - ring : 4;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * (0.42 + ring * 0.18), radius * (0.28 + ring * 0.11), ring % 2 ? 0.18 : -0.18, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (effect.kind === "projectileLaunch" || effect.kind === "projectileBurst") {
      const burst = effect.kind === "projectileBurst";
      const radius = (1 - alpha) * (burst ? 112 : 62) + 12;
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = effect.color;
      for (let ray = 0; ray < (burst ? 12 : 7); ray += 1) {
        const angle = ray * Math.PI * 2 / (burst ? 12 : 7);
        ctx.lineWidth = 3 + ray % 3 * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * radius * 0.25, Math.sin(angle) * radius * 0.25);
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        ctx.stroke();
      }
    } else if (effect.kind === "slash") {
      ctx.lineWidth = 18 * alpha;
      ctx.beginPath();
      ctx.moveTo(-170, 110);
      ctx.lineTo(160, -150);
      ctx.stroke();
    } else if (effect.kind === "guard") {
      const radius = (1 - alpha) * 64 + 42;
      ctx.lineWidth = 9 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, radius, -1.45, 1.45);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 15, -1.18, 1.18);
      ctx.stroke();
    } else {
      const radius = (1 - alpha) * 165 + 25;
      ctx.lineWidth = 11 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawFinisherOverlay() {
  const finisher = state.finisher;
  if (!finisher) return;
  const attacker = state.fighters[finisher.winner];
  const progress = finisher.elapsed / finisher.script.duration;
  const cinematic = finisherCinematicCamera(state.cinematicZoom);
  const barHeight = 30 + cinematic.intensity * 30 + Math.sin(clamp(progress * 2, 0, 1) * Math.PI * .5) * 7;
  const tint = ctx.createRadialGradient(W * .5, H * .48, 90, W * .5, H * .48, W * .72);
  tint.addColorStop(0, `${attacker.def.accent}${cinematic.shot === "final-impact" ? "2f" : "16"}`);
  tint.addColorStop(.62, "rgba(60,0,8,.08)");
  tint.addColorStop(1, `rgba(0,0,0,${.28 + cinematic.intensity * .24})`);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  drawCinematicGoreOverlay();
  ctx.fillStyle = "rgba(0,0,0,.9)";
  ctx.fillRect(0, 0, W, barHeight);
  ctx.fillRect(0, H - barHeight, W, barHeight);
  ctx.fillStyle = attacker.def.accent;
  ctx.fillRect(0, barHeight - 3, W, 3);
  ctx.fillRect(0, H - barHeight, W, 3);

  ctx.save();
  ctx.textAlign = "left";
  ctx.font = "900 11px Arial Narrow, Arial";
  ctx.fillStyle = attacker.def.accent;
  ctx.globalAlpha = .82;
  ctx.fillText(`CINEMATIC · ${cinematic.shot.replaceAll("-", " ").toUpperCase()}`, 24, barHeight - 11);
  if (cinematic.shot === "final-impact") {
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff0df";
    ctx.font = "1000 14px Arial Narrow, Arial";
    ctx.fillText("FINAL-HIT SLOW MOTION", W - 24, barHeight - 11);
  }
  ctx.restore();

  if (finisher.beatLife > 0) {
    const alpha = clamp(finisher.beatLife * 2.2, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.font = "900 17px Arial Narrow, Arial";
    ctx.fillStyle = "white";
    ctx.shadowColor = "black";
    ctx.shadowBlur = 8;
    ctx.fillText(finisher.beatLabel, W * .5, H - barHeight - 16);
    ctx.font = "900 11px Arial";
    ctx.fillStyle = attacker.def.accent;
    ctx.fillText(`${finisher.impactIndex} HIT FINAL COMBINATION`, W * .5, H - barHeight + 19);
    ctx.restore();
  }

  if (finisher.fatalityTriggered) {
    const attackerId = attacker.def.finisherScriptId || attacker.def.id;
    const fatality = graphicFatalitySnapshot(attackerId, finisher.type, finisher.elapsed, finisher.fatalityAt);
    const reveal = fatality.reveal;
    ctx.save();
    ctx.globalAlpha = Math.sin(reveal * Math.PI * .5) * clamp(1.45 - fatality.aftermath * .14, .55, 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,.95)";
    ctx.shadowBlur = 18;
    ctx.lineWidth = 12;
    ctx.strokeStyle = "rgba(0,0,0,.92)";
    ctx.fillStyle = fatality.palette[0];
    ctx.font = "1000 52px Arial Narrow, Impact, sans-serif";
    ctx.strokeText("GRAPHIC FATALITY", W * .5, H * .23);
    ctx.fillText("GRAPHIC FATALITY", W * .5, H * .23);
    ctx.font = "900 18px Arial Narrow, Arial, sans-serif";
    ctx.lineWidth = 7;
    ctx.fillStyle = "#fff0df";
    ctx.strokeText(`${fatality.title} · ${fatality.caption}`, W * .5, H * .3);
    ctx.fillText(`${fatality.title} · ${fatality.caption}`, W * .5, H * .3);
    ctx.restore();
  }
}

function drawDebugOverlay() {
  const trainingBoxes = state.mode === "training" && state.training.showHitboxes;
  if (!state.debug && !trainingBoxes) return;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = "700 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "top";

  for (const fighter of state.fighters) {
    const hurtColor = fighter.side === 0 ? "#35e7ff" : "#ff4dc4";
    ctx.strokeStyle = hurtColor;
    for (const box of getHurtboxes(fighter)) ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.strokeStyle = "rgba(110,255,125,.88)";
    const pushHalf = fighter.crouch
      ? fighter.movement.crouchingPushboxHalfWidth
      : fighter.movement.standingPushboxHalfWidth;
    ctx.strokeRect(fighter.x - pushHalf, fighter.y - 112, pushHalf * 2, 112);
    ctx.strokeStyle = "#ffef5a";
    for (const box of getActiveHitboxes(fighter)) ctx.strokeRect(box.x, box.y, box.width, box.height);
  }

  if (!state.debug) {
    ctx.restore();
    return;
  }

  const lines = [
    `SIM ${SIMULATION_HZ}HZ · TICK ${state.simulationTick} · STEPS ${state.simulationSteps}`,
    `ALPHA ${state.simulationAlpha.toFixed(3)} · DROPPED ${state.simulationDroppedSeconds.toFixed(3)}s`,
    `PHASE ${state.phase} · RNG ${state.rng.getState().toString(16).padStart(8, "0")}`,
    ...(onlineSession.rollback ? [(() => {
      const net = onlineSession.rollback.metrics();
      return `NET F${net.frame} · CONF ${net.confirmedRemoteFrame} · ${net.inputDelay}F DELAY · ${net.rollbacks} RB / ${net.resimulatedFrames} RESIM · MAX ${net.maximumRollback}F ${net.maximumResimulationMs.toFixed(3)}MS · DESYNC ${onlineSession.checksumMismatches}`;
    })()] : []),
    ...state.fighters.map((fighter) => {
      const move = fighter.attacking?.profileId || "—";
      const guard = fighter.guarding ? fighter.guardHeight.toUpperCase() : "—";
      const combo = fighter.combo.snapshot(state.simulationTick);
      return `P${fighter.side + 1} ${fighter.combatState.toUpperCase()} F${fighter.stateFrame} · ${move} · GRIT ${Math.floor(fighter.meter)} · FLOW ${fighter.rhythmStacks || 0} · COMBO ${combo.hits}/${combo.damage.toFixed(1)} · JUG ${state.fighters[1 - fighter.side]?.juggleCount || 0} · GUARD ${guard} · HS ${fighter.hitstunFrames}/BS ${fighter.blockstunFrames}/KD ${fighter.knockdownFrames} · BUF ${fighter.inputBuffer.snapshot().map((entry) => entry.action).join("/") || "—"}`;
    }),
    ...commandHistory.map((history, side) => `P${side + 1} INPUT ${history.slice(-8).map((entry) => entry.token).join(" › ") || "—"}`),
  ];
  const panelWidth = 980;
  const panelHeight = 18 + lines.length * 19;
  ctx.fillStyle = "rgba(0,0,0,.82)";
  ctx.fillRect(14, 64, panelWidth, panelHeight);
  ctx.strokeStyle = "rgba(70,235,255,.75)";
  ctx.strokeRect(14, 64, panelWidth, panelHeight);
  lines.forEach((line, index) => {
    ctx.fillStyle = index === 0 ? "#5cf3ff" : "#f4f7ff";
    ctx.fillText(line, 25, 74 + index * 19);
  });
  ctx.restore();
}

function finisherCameraTarget() {
  const camera = finisherCinematicCamera(state.cinematicZoom);
  return { x: camera.x, y: camera.y };
}

function draw(time) {
  ctx.save();
  const shakeScale = state.accessibility.reducedMotion ? 0 : state.accessibility.shakeScale;
  const shakeX = state.shake > 0 ? Math.sin((state.simulationTick + 1) * 12.9898) * state.shake * 9 * shakeScale : 0;
  const shakeY = state.shake > 0 ? Math.cos((state.simulationTick + 1) * 7.233) * state.shake * 6 * shakeScale : 0;
  ctx.translate(shakeX, shakeY);
  if (state.finisher) {
    const camera = finisherCameraTarget();
    ctx.translate(W * .5, H * .53);
    ctx.scale(state.cinematicZoom, state.cinematicZoom);
    ctx.translate(-camera.x, -camera.y);
  }
  drawStage(time);
  if (state.screen === "fight") {
    drawPaintTraps(time);
    drawStageWeapon(time);
    drawProjectiles(time);
    const ordered = [...state.fighters].sort((a, b) => a.y - b.y);
    ordered.forEach((fighter) => drawFighter(fighter, time));
    state.fighters.forEach((fighter) => drawDizzyStars(fighter, time));
    drawParticles();
  }
  ctx.restore();
  drawFinisherOverlay();
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,245,220,${clamp(state.flash * 3, 0, 0.9)})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawDebugOverlay();
}

function clearLatchedInputEdges() {
  pressed.clear();
  for (const token of [...touch]) if (token.endsWith(":pressed")) touch.delete(token);
}

function runSimulationStep(dt, tick) {
  if (!(state.mode === "online" && onlineSession.rollback)) state.simulationTick = tick;
  simulateGameTick(dt);
}

function loop(now) {
  const elapsed = Math.max(0, (now - state.lastRenderTime) / 1000 || 0);
  state.lastRenderTime = now;
  const frame = state.qaManualMode
    ? {
      steps: 0,
      tick: simulationClock.tick,
      alpha: state.simulationAlpha,
      droppedSeconds: simulationClock.droppedSeconds,
    }
    : simulationClock.advance(elapsed, runSimulationStep);
  state.simulationTick = state.mode === "online" && onlineSession.rollback
    ? onlineSession.rollback.frame : frame.tick;
  state.simulationAlpha = frame.alpha;
  state.simulationSteps = frame.steps;
  state.simulationDroppedSeconds = frame.droppedSeconds;
  if (frame.steps > 0) clearLatchedInputEdges();
  draw(now);
  requestAnimationFrame(loop);
}

function musicBaseVolume() {
  return {
    title: 0.23,
    select: 0.27,
    stage: 0.28,
    fight: 0.34,
    result: 0.25,
  }[state.screen] || 0.25;
}

function updateMusicUi() {
  const select = $("#musicSelect");
  if (select) select.value = state.musicChoice;
  const button = $("#trackButton");
  if (button) button.textContent = `♫ ${state.musicChoice === "auto" ? "AUTO · " : ""}${musicTracks[currentTrackIndex].title}`;
}

function updateVolumeUi() {
  const musicSlider = $("#musicVolume");
  const sfxSlider = $("#sfxVolume");
  if (musicSlider) musicSlider.value = String(Math.round(state.musicVolume * 100));
  if (sfxSlider) sfxSlider.value = String(Math.round(state.sfxVolume * 100));
  if ($("#musicVolumeValue")) $("#musicVolumeValue").textContent = `${Math.round(state.musicVolume * 100)}%`;
  if ($("#sfxVolumeValue")) $("#sfxVolumeValue").textContent = `${Math.round(state.sfxVolume * 100)}%`;
}

function applyAccessibilitySettings() {
  document.body.classList.toggle("reduced-motion", state.accessibility.reducedMotion);
  document.body.classList.toggle("high-contrast", state.accessibility.highContrast);
  document.body.dataset.colorAssist = ["standard", "deuteranopia", "protanopia", "tritanopia"].includes(state.accessibility.colorAssist)
    ? state.accessibility.colorAssist : "standard";
  $("#reducedMotionToggle").checked = state.accessibility.reducedMotion;
  $("#highContrastToggle").checked = state.accessibility.highContrast;
  $("#colorAssistSelect").value = document.body.dataset.colorAssist;
  $("#shakeSelect").value = String(state.accessibility.shakeScale);
  applyPerformanceSettings();
}

function applyPerformanceSettings() {
  state.visualQuality = normalizeVisualQuality(state.visualQuality);
  state.performance = resolvePerformanceProfile(
    state.visualQuality,
    performanceEnvironment(state.accessibility.reducedMotion),
  );
  document.body.dataset.quality = state.performance.id;
  $("#visualQualitySelect").value = state.visualQuality;
  $("#pausePerformance").textContent = `${state.visualQuality.toUpperCase()} VISUALS · ${state.performance.id.toUpperCase()} PROFILE · ${state.performance.particleBudget} FX BUDGET`;
}

// The movement pad is three rows tall now, so on a short landscape phone the
// button size has to come from the available height rather than a fixed 56px.
const TOUCH_PAD_ROWS = 3;
const TOUCH_PAD_GAP = 5;
const TOUCH_PAD_HEIGHT_SHARE = 0.56;

function touchButtonSize() {
  const available = (window.innerHeight || 720) * TOUCH_PAD_HEIGHT_SHARE - TOUCH_PAD_GAP * (TOUCH_PAD_ROWS - 1);
  const fits = available / TOUCH_PAD_ROWS;
  return Math.round(clamp(Math.min(56, fits) * state.touchSettings.scale, 34, 72));
}

function applyTouchSettings() {
  state.touchSettings.handedness = state.touchSettings.handedness === "left" ? "left" : "standard";
  document.body.classList.toggle("touch-left", state.touchSettings.handedness === "left");
  document.documentElement.style.setProperty("--touch-button-size", `${touchButtonSize()}px`);
  document.documentElement.style.setProperty("--touch-opacity", String(state.touchSettings.opacity));
  $("#touchHandednessSelect").value = state.touchSettings.handedness;
  $("#touchScale").value = String(Math.round(state.touchSettings.scale * 100));
  $("#touchOpacity").value = String(Math.round(state.touchSettings.opacity * 100));
  $("#touchScaleValue").textContent = `${Math.round(state.touchSettings.scale * 100)}%`;
  $("#touchOpacityValue").textContent = `${Math.round(state.touchSettings.opacity * 100)}%`;
  $("#touchHapticsToggle").checked = state.touchSettings.haptics;
}

function saveBindings() {
  localStorage.setItem("final-blow-keymaps", JSON.stringify(keyMaps));
  localStorage.setItem("final-blow-pad-map", JSON.stringify(padMap));
}

function activePadLabelSet() {
  const pad = getPad(0) || getPad(1);
  return detectPadLabelSet(pad?.id || "");
}

function renderBindings() {
  const labels = {
    left: "LEFT", right: "RIGHT", up: "UP / JUMP", down: "DOWN / CROUCH",
    lp: BUTTON_NAMES.lp, hp: BUTTON_NAMES.hp, lk: BUTTON_NAMES.lk, hk: BUTTON_NAMES.hk,
  };
  for (const player of [0, 1]) {
    const container = $(`#p${player + 1}KeyBindings`);
    container.innerHTML = REMAPPABLE_ACTIONS.map((action) => `<button type="button" class="binding-button${pendingKeyBinding?.player === player && pendingKeyBinding.action === action ? " listening" : ""}" data-bind-player="${player}" data-bind-action="${action}"><span>${labels[action]}</span><b>${pendingKeyBinding?.player === player && pendingKeyBinding.action === action ? "PRESS KEY" : formatKeyCode(keyMaps[player][action])}</b></button>`).join("");
  }
  const labelSet = activePadLabelSet();
  $("#padBindings").innerHTML = ATTACK_BUTTONS.map((action) => `<label>${BUTTON_LABELS[action]} · ${labels[action]}<select data-pad-action="${action}">${PAD_BUTTON_LABELS.map((_, button) => `<option value="${button}"${padMap[action] === button ? " selected" : ""}>${padButtonLabel(button, labelSet)}</option>`).join("")}</select></label>`).join("");
  $$('[data-bind-player]').forEach((button) => button.addEventListener("click", () => {
    pendingKeyBinding = { player: Number(button.dataset.bindPlayer), action: button.dataset.bindAction };
    renderBindings();
  }));
  $$('[data-pad-action]').forEach((select) => select.addEventListener("change", () => {
    padMap = remapPadBinding(padMap, select.dataset.padAction, Number(select.value));
    saveBindings();
    renderBindings();
  }));
}

const DIFFICULTY_HINTS = Object.freeze({
  passive: "Never attacks, blocks, techs or moves. A living practice dummy.",
  rookie: "Slow to react and prone to mistakes. Room to learn a matchup.",
  street: "Balanced reactions and pressure. The default fight.",
  pro: "Fast reactions, real punishes and confident meter use.",
  final: "Reads almost everything. Boss-level pressure.",
});

function renderDifficultyOptions() {
  const container = $("#difficultyOptions");
  if (!container) return;
  container.innerHTML = AI_DIFFICULTY_ORDER.map((id) => {
    const selected = state.aiDifficulty === id;
    return `<button type="button" role="radio" class="${id}" data-difficulty="${id}" aria-checked="${selected}">${AI_DIFFICULTIES[id].label}</button>`;
  }).join("");
  $$("[data-difficulty]").forEach((button) => button.addEventListener("click", () => {
    setAiDifficulty(button.dataset.difficulty);
  }));
  $("#difficultyHint").textContent = DIFFICULTY_HINTS[state.aiDifficulty] || "";
}

// The picker is only meaningful when a CPU is actually in the match.
function facesCpuOpponent() {
  return state.mode === "arcade" || (state.mode === "training" && state.training.dummyMode === "cpu");
}

function syncDifficultyUi() {
  const bar = $("#difficultyBar");
  if (!bar) return;
  bar.hidden = !(state.screen === "select" && facesCpuOpponent());
  renderDifficultyOptions();
}

function setStageWeapons(enabled) {
  state.stageWeaponsEnabled = Boolean(enabled);
  localStorage.setItem("final-blow-stage-weapons", state.stageWeaponsEnabled ? "1" : "0");
  const toggle = $("#stageWeaponToggle");
  if (toggle) toggle.checked = state.stageWeaponsEnabled;
  if (!state.stageWeaponsEnabled) {
    state.stageWeapon = null;
    state.fighters.forEach((fighter) => { fighter.carriedWeapon = null; fighter.carryFrames = 0; });
  } else if (!state.stageWeapon && state.fighters.length) {
    resetStageWeapon();
  }
  updateHud();
  return state.stageWeaponsEnabled;
}

function setAiDifficulty(difficulty) {
  state.aiDifficulty = normalizeAiDifficulty(difficulty);
  localStorage.setItem("final-blow-ai-difficulty", state.aiDifficulty);
  const select = $("#aiDifficultySelect");
  if (select) select.value = state.aiDifficulty;
  for (const fighter of state.fighters) resetAiBrain(fighter.aiBrain, state.aiDifficulty);
  syncDifficultyUi();
  return state.aiDifficulty;
}

function setTrack(index, restart = true) {
  const next = (index + musicTracks.length) % musicTracks.length;
  const changed = next !== currentTrackIndex;
  currentTrackIndex = next;
  if (changed) {
    fightMusic.pause();
    fightMusic.src = musicTracks[currentTrackIndex].src;
    fightMusic.load();
  } else if (restart) {
    fightMusic.currentTime = 0;
  }
  updateMusicUi();
  syncMusic();
}

function advanceTrack() {
  setTrack(currentTrackIndex + 1, true);
}

function chooseMusic(choice) {
  state.musicChoice = choice;
  localStorage.setItem("final-blow-music-choice", choice);
  if (choice !== "auto") setTrack(Number(choice), true);
  else {
    updateMusicUi();
    syncMusic();
  }
}

function syncMusic() {
  if (!state.audioUnlocked) return;
  const enabled = Boolean($("#musicToggle")?.checked);
  fightMusic.loop = state.musicChoice !== "auto";
  fightMusic.volume = clamp(musicBaseVolume() * state.musicDuck * state.musicVolume, 0, 1);
  if (!enabled || document.hidden || state.paused) {
    fightMusic.pause();
    return;
  }
  if (fightMusic.paused) fightMusic.play().catch(() => {});
}

function resetMusicDuck() {
  window.clearTimeout(musicDuckTimer);
  state.musicDuck = 1;
  syncMusic();
}

function duckMusic(amount, duration) {
  if (rollbackResimulating) return;
  window.clearTimeout(musicDuckTimer);
  state.musicDuck = amount;
  syncMusic();
  musicDuckTimer = window.setTimeout(() => {
    state.musicDuck = 1;
    syncMusic();
  }, duration);
}

function stopSfx() {
  [...Object.values(sfxPools).flat(), ...[...fighterSfxPools.values()].flat()].forEach((sample) => {
    sample.pause();
    sample.currentTime = 0;
  });
}

function fighterSoundId(fighter) {
  if (typeof fighter === "string") return fighter;
  return fighter?.def?.id || fighter?.id || null;
}

function fighterSoundPool(kind, fighter) {
  const fighterId = fighterSoundId(fighter);
  const src = fighterAudioCue(fighterId, kind);
  if (!src) return null;
  const key = `${fighterId}:${kind}`;
  if (!fighterSfxPools.has(key)) fighterSfxPools.set(key, createSfxPool(kind, src));
  return { key, pool: fighterSfxPools.get(key) };
}

function warmFighterAudio(fighters = state.fighters) {
  for (const fighter of fighters) {
    for (const cue of FIGHTER_AUDIO_CUES) fighterSoundPool(cue, fighter);
  }
}

function unlockAudio() {
  state.audioUnlocked = true;
  if ($("#soundToggle").checked) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !state.audio) state.audio = new AudioContextClass();
    if (state.audio?.state === "suspended") state.audio.resume();
  }
  syncMusic();
}

function sound(kind, fighter = null) {
  if (rollbackResimulating) return;
  const fighterId = fighterSoundId(fighter);
  const fallbackKind = fallbackSoundKinds[kind] || kind;
  const signatureSrc = fighterAudioCue(fighterId, kind);
  lastSoundEvent = Object.freeze({
    kind,
    fighterId,
    signature: Boolean(signatureSrc),
    src: signatureSrc || audioAssets[fallbackKind] || null,
  });
  showSoundCaption(kind, fighter);
  if (!$("#soundToggle").checked) return;
  if (demoSession.attract && !state.audioUnlocked) return;
  unlockAudio();
  const signature = fighterSoundPool(kind, fighter);
  const pool = signature?.pool || sfxPools[fallbackKind];
  if (!pool?.length) {
    proceduralSound(fallbackKind);
    return;
  }
  const cursorKey = signature?.key || fallbackKind;
  const cursor = signature
    ? (fighterSfxCursors.get(cursorKey) || 0) % pool.length
    : (sfxCursors[cursorKey] || 0) % pool.length;
  if (signature) fighterSfxCursors.set(cursorKey, cursor + 1);
  else sfxCursors[cursorKey] = cursor + 1;
  const sample = pool[cursor];
  sample.pause();
  sample.currentTime = 0;
  sample.volume = (sfxVolumes[kind] ?? 0.62) * state.sfxVolume;
  const playback = sample.play();
  if (playback?.catch) playback.catch(() => proceduralSound(fallbackKind));
}

function showSoundCaption(kind, fighter = null) {
  if (!state.soundCaptions) return;
  const caption = $("#soundCaption");
  const fighterId = fighterSoundId(fighter);
  const fighterName = fighter?.def?.name || roster.find(({ id }) => id === fighterId)?.name;
  const label = FIGHTER_AUDIO_LABELS[kind] || soundCaptionLabels[kind];
  if (!caption || !label) return;
  window.clearTimeout(soundCaptionTimer);
  caption.textContent = `◀ ${fighterName ? `${fighterName} · ` : ""}${label} ▶`;
  caption.hidden = false;
  soundCaptionTimer = window.setTimeout(() => { caption.hidden = true; }, 720);
}

/**
 * Each personal object gets its own synthesized impact rather than a shared
 * sample: a tone sweep for the body of the sound plus a shaped noise burst for
 * its texture. Synthesis keeps the objects distinct without shipping eight more
 * audio files, works offline, and costs nothing to add a ninth.
 *
 * [startHz, endHz, seconds, waveform, gain, noiseAmount, noiseSeconds, filterHz]
 */
const OBJECT_SOUNDS = Object.freeze({
  pizza: [190, 62, 0.24, "sine", 0.085, 0.5, 0.2, 900],
  mouse: [640, 210, 0.13, "square", 0.06, 0.22, 0.1, 3200],
  loogie: [430, 120, 0.17, "sine", 0.07, 0.62, 0.16, 1500],
  wires: [150, 58, 0.3, "sawtooth", 0.075, 0.4, 0.26, 700],
  xacto: [1500, 640, 0.11, "triangle", 0.062, 0.3, 0.09, 6200],
  golfball: [900, 380, 0.09, "sine", 0.055, 0.16, 0.06, 4200],
  bedbugs: [260, 320, 0.34, "triangle", 0.05, 0.7, 0.32, 2400],
  vinyl: [520, 90, 0.26, "sawtooth", 0.08, 0.34, 0.2, 1800],
});

function noiseBurst(now, amount, seconds, filterHz) {
  if (!amount || !state.audio) return;
  const frames = Math.max(1, Math.floor(state.audio.sampleRate * seconds));
  const buffer = state.audio.createBuffer(1, frames, state.audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    // Deterministic pseudo-noise: audio must never touch gameplay RNG.
    const value = Math.sin(index * 12.9898) * 43758.5453;
    data[index] = ((value - Math.floor(value)) * 2 - 1) * (1 - index / frames);
  }
  const source = state.audio.createBufferSource();
  source.buffer = buffer;
  const filter = state.audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(filterHz, now);
  const gain = state.audio.createGain();
  gain.gain.setValueAtTime(Math.max(0.0001, amount * 0.09 * state.sfxVolume), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  source.connect(filter).connect(gain).connect(state.audio.destination);
  source.start(now);
  source.stop(now + seconds);
}

function objectSound(styleId) {
  if (!$("#soundToggle").checked) return;
  unlockAudio();
  if (!state.audio) return;
  const settings = OBJECT_SOUNDS[styleId];
  if (!settings) return;
  const now = state.audio.currentTime;
  const [startHz, endHz, seconds, waveform, gainValue, noiseAmount, noiseSeconds, filterHz] = settings;
  const oscillator = state.audio.createOscillator();
  const gain = state.audio.createGain();
  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(startHz, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), now + seconds);
  gain.gain.setValueAtTime(Math.max(0.0001, gainValue * state.sfxVolume), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  oscillator.connect(gain).connect(state.audio.destination);
  oscillator.start(now);
  oscillator.stop(now + seconds);
  noiseBurst(now, noiseAmount, noiseSeconds, filterHz);
}

function proceduralSound(kind) {
  if (!state.audio) return;
  const now = state.audio.currentTime;
  const oscillator = state.audio.createOscillator();
  const gain = state.audio.createGain();
  const settings = {
    select: [280, 430, 0.055, "square", 0.055],
    jump: [180, 340, 0.1, "sine", 0.045],
    light: [120, 70, 0.08, "square", 0.045],
    heavy: [95, 42, 0.16, "sawtooth", 0.065],
    special: [220, 55, 0.3, "sawtooth", 0.075],
    hit: [80, 35, 0.12, "square", 0.08],
    block: [520, 210, 0.08, "square", 0.04],
    finish: [160, 52, 0.8, "sawtooth", 0.09],
    final: [70, 24, 1.2, "sawtooth", 0.12],
    ko: [130, 45, 0.55, "square", 0.08],
  }[kind] || [160, 80, 0.1, "sine", 0.04];
  oscillator.type = settings[3];
  oscillator.frequency.setValueAtTime(settings[0], now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, settings[1]), now + settings[2]);
  gain.gain.setValueAtTime(Math.max(0.0001, settings[4] * state.sfxVolume), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + settings[2]);
  oscillator.connect(gain).connect(state.audio.destination);
  oscillator.start(now);
  oscillator.stop(now + settings[2]);
}

function back(target) {
  if (target === "title") showScreen("title");
  else if (target === "select") showScreen("select");
}

function isPhoneViewport() {
  return navigator.maxTouchPoints > 0
    && window.matchMedia("(pointer: coarse)").matches
    && Math.min(window.innerWidth, window.innerHeight) <= 680;
}

function syncOrientationGate() {
  const phone = isPhoneViewport();
  const portrait = window.innerHeight > window.innerWidth;
  const blocked = phone && portrait;
  document.body.classList.toggle("orientation-blocked", blocked);
  document.body.classList.toggle("mobile-landscape", phone && !portrait);
  setOnlineLocalSuspended(blocked || document.hidden);
}

function lockLandscape() {
  if (!screen.orientation?.lock) return;
  screen.orientation.lock("landscape").catch(() => {});
}

function enterImmersiveMode() {
  if (!isPhoneViewport()) return;
  const app = $("#app");
  const request = app.requestFullscreen?.({ navigationUI: "hide" }) || app.webkitRequestFullscreen?.();
  if (request?.then) request.then(lockLandscape).catch(() => {});
  else lockLandscape();
}

let deferredInstallPrompt = null;

function updateOfflineBadge() {
  const badge = $("#offlineBadge");
  badge.classList.toggle("ready", state.offlineReady && navigator.onLine);
  badge.classList.toggle("offline", !navigator.onLine);
  badge.textContent = !navigator.onLine ? "OFFLINE PLAY"
    : state.offlineReady ? "OFFLINE READY" : "CACHE CHECK";
}

async function registerOfflineGame() {
  if (!("serviceWorker" in navigator)) {
    $("#offlineBadge").textContent = "ONLINE ONLY";
    return;
  }
  try {
    await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    state.offlineReady = true;
    updateOfflineBadge();
  } catch (error) {
    console.warn("Final Blow offline cache unavailable", error);
    $("#offlineBadge").textContent = "ONLINE ONLY";
  }
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("#installButton").hidden = false;
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  $("#installButton").hidden = true;
});
window.addEventListener("online", updateOfflineBadge);
window.addEventListener("offline", updateOfflineBadge);

function setPaused(paused, reason = "") {
  if (state.screen !== "fight") return false;
  if (state.mode === "online" || state.mode === "demo") {
    state.paused = false;
    $("#pausePanel").hidden = true;
    return false;
  }
  state.paused = Boolean(paused);
  state.pauseReason = state.paused ? String(reason || state.pauseReason || "") : "";
  $("#pausePanel").hidden = !state.paused;
  $("#pauseReason").hidden = !state.pauseReason;
  $("#pauseReason").textContent = state.pauseReason;
  $("#touchControls").classList.toggle("paused", state.paused);
  if (state.paused) {
    fightMusic.pause();
    showSoundCaption("pause");
  } else {
    showSoundCaption("resume");
    syncMusic();
    canvas.focus();
  }
  return state.paused;
}

function handleControllerDisconnect(index = null, forcedSide = null) {
  if (state.screen !== "fight" || state.mode === "demo") return false;
  const side = Number.isInteger(forcedSide)
    ? forcedSide
    : assignedPadBySide.findIndex((padIndex) => padIndex === index);
  if (side < 0) return false;
  const reason = `PLAYER ${side + 1} CONTROLLER DISCONNECTED`;
  state.pauseReason = reason;
  if (state.mode === "online") {
    setOnlineLocalSuspended(true);
    return true;
  }
  setPaused(true, reason);
  return true;
}

function restartPausedRound() {
  if (state.screen !== "fight") return;
  setPaused(false);
  startMatch(false);
}

function titleKeyboard(event) {
  if (state.screen === "title" && (event.code === "Enter" || event.code === "Space")) startSelect("arcade");
  if (state.screen === "fight" && (event.code === "Escape" || event.code === "KeyP")) {
    event.preventDefault();
    setPaused(!state.paused);
    return;
  }
  if (event.code === "Escape") {
    if ($("#controlsDialog").open) return;
    if (state.screen !== "title") showScreen("title");
  }
  if (state.screen === "select" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
    event.preventDefault();
    const side = state.locks[0] ? 1 : 0;
    if (state.mode === "arcade" && state.locks[0]) return;
    const delta = event.code === "ArrowLeft" ? -1 : event.code === "ArrowRight" ? 1 : event.code === "ArrowUp" ? -4 : 4;
    state.picks[side] = (state.picks[side] + delta + roster.length) % roster.length;
    state.selectingPlayer = side;
    updateRosterUI();
  }
  if (state.screen === "select" && event.code === "Enter") chooseFighter(state.picks[state.selectingPlayer]);
}

window.addEventListener("keydown", (event) => {
  if (demoSession.active) {
    event.preventDefault();
    noteUserActivity();
    return;
  }
  if (pendingKeyBinding) {
    event.preventDefault();
    if (event.code === "Escape") {
      pendingKeyBinding = null;
    } else {
      keyMaps = remapKeyBinding(keyMaps, pendingKeyBinding.player, pendingKeyBinding.action, event.code);
      saveBindings();
      pendingKeyBinding = null;
    }
    renderBindings();
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) event.preventDefault();
  if (event.code === "F3") {
    event.preventDefault();
    state.debug = !state.debug;
  }
  if (!keys.has(event.code)) pressed.add(event.code);
  keys.add(event.code);
  titleKeyboard(event);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => { keys.clear(); pressed.clear(); });
document.addEventListener("pointerdown", () => noteUserActivity(), true);

window.addEventListener("gamepadconnected", (event) => {
  $("#padStatus").classList.add("connected");
  $("#padStatus").lastChild.textContent = ` ${event.gamepad.id.split("(")[0].trim().slice(0, 28)} READY`;
  if (state.paused && state.pauseReason.includes("CONTROLLER DISCONNECTED")) {
    state.pauseReason = "CONTROLLER RECONNECTED · RESUME WHEN READY";
    $("#pauseReason").textContent = state.pauseReason;
  }
  if (state.mode === "online" && onlineSession.localSuspended && state.pauseReason.includes("CONTROLLER")) {
    state.pauseReason = "";
    setOnlineLocalSuspended(false);
  }
  sound("select");
});
window.addEventListener("gamepaddisconnected", (event) => {
  handleControllerDisconnect(event.gamepad?.index ?? null);
  if (![...(navigator.getGamepads?.() || [])].filter(Boolean).length) {
    $("#padStatus").classList.remove("connected");
    $("#padStatus").lastChild.textContent = " KEYBOARD READY";
  }
});

let menuPadWasPressed = false;
let menuPadPauseWasPressed = false;
let menuPadAnyWasPressed = false;
function menuPadLoop() {
  const pad = getPad(0);
  const anyInput = Boolean(pad && (pad.buttons.some((button) => button.pressed || button.value > 0.55)
    || pad.axes.some((axis) => Math.abs(axis) > 0.55)));
  if (demoSession.active && anyInput && !menuPadAnyWasPressed) {
    menuPadAnyWasPressed = true;
    exitDemo();
    requestAnimationFrame(menuPadLoop);
    return;
  }
  if (!demoSession.active && anyInput && !menuPadAnyWasPressed) noteUserActivity();
  menuPadAnyWasPressed = anyInput;
  const pause = buttonValue(pad, 9);
  if (state.screen === "fight" && pause && !menuPadPauseWasPressed) setPaused(!state.paused);
  menuPadPauseWasPressed = pause;
  const confirm = buttonValue(pad, 0);
  if (confirm && !menuPadWasPressed) {
    if (state.screen === "title") startSelect("arcade");
    else if (state.screen === "select") {
      if (state.locks[0] && state.locks[1]) showStageSelect();
      else chooseFighter(state.picks[state.selectingPlayer]);
    } else if (state.screen === "stage") startMatch(true);
    else if (state.screen === "ladder") startMatch(true);
    else if (state.screen === "ending") startSelect("arcade");
    else if (state.screen === "result") {
      if (state.mode === "online") requestOnlineRematch();
      else startMatch(true);
    }
  }
  menuPadWasPressed = confirm;
  requestAnimationFrame(menuPadLoop);
}

$$('[data-mode]').forEach((button) => button.addEventListener("click", () => startSelect(button.dataset.mode)));
$("#onlineButton").addEventListener("click", openOnlineLobby);
$("#demoButton").addEventListener("click", () => startDemo());
$("#onlineCreateButton").addEventListener("click", createOnlineRoom);
$("#onlineJoinButton").addEventListener("click", joinOnlineRoom);
$("#onlineInviteInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinOnlineRoom();
});
$("#onlineCopyButton").addEventListener("click", copyOnlineInvite);
$("#onlineFighterSelect").addEventListener("change", (event) => {
  if (!onlineFighterIds.has(event.target.value)) return;
  onlineSession.lobby.localFighter = event.target.value;
  onlineSession.lobby.localReady = false;
  sendOnlineLobbyState();
  updateOnlineMatchSetup();
  persistOnlineResume(false);
});
$("#onlineStageSelect").addEventListener("change", (event) => {
  if (onlineSession.role !== "host" || !stages[event.target.value]) return;
  onlineSession.lobby.stage = event.target.value;
  onlineSession.lobby.localReady = false;
  sendOnlineLobbyState();
  updateOnlineMatchSetup();
  persistOnlineResume(false);
});
$("#onlineDelaySelect").addEventListener("change", (event) => {
  const choice = String(event.target.value);
  if (!["auto", "0", "1", "2", "3", "4"].includes(choice)) return;
  onlineSession.lobby.delayChoice = choice;
  onlineSession.lobby.localReady = false;
  sendOnlineLobbyState();
  updateOnlineMatchSetup();
  persistOnlineResume(false);
});
$("#onlineReadyButton").addEventListener("click", toggleOnlineReady);
$("#onlineDisconnectButton").addEventListener("click", () => disconnectOnline(true));
$("#controlsButton").addEventListener("click", () => { unlockAudio(); $("#controlsDialog").showModal(); });
$("#moveListSelect").addEventListener("change", (event) => renderMoveList(event.target.value));
$("#musicToggle").addEventListener("change", () => {
  unlockAudio();
  syncMusic();
});
$("#goreToggle").addEventListener("change", (event) => {
  state.graphicFatalities = event.target.checked;
  localStorage.setItem("final-blow-graphic-fatalities", state.graphicFatalities ? "1" : "0");
});
$("#musicVolume").addEventListener("input", (event) => {
  state.musicVolume = Number(event.target.value) / 100;
  localStorage.setItem("final-blow-music-volume", String(state.musicVolume));
  updateVolumeUi();
  unlockAudio();
  syncMusic();
});
$("#sfxVolume").addEventListener("input", (event) => {
  state.sfxVolume = Number(event.target.value) / 100;
  localStorage.setItem("final-blow-sfx-volume", String(state.sfxVolume));
  updateVolumeUi();
});
$("#stageWeaponToggle").addEventListener("change", (event) => setStageWeapons(event.target.checked));
$("#aiDifficultySelect").addEventListener("change", (event) => {
  setAiDifficulty(event.target.value);
  sound("select");
});
$("#controlStyleSelect").addEventListener("change", (event) => {
  state.controlStyle = normalizeControlStyle(event.target.value);
  localStorage.setItem("final-blow-control-style", state.controlStyle);
  if (state.mode === "online" && !onlineSession.matchActive) {
    onlineSession.lobby.localReady = false;
    sendOnlineLobbyState();
    updateOnlineMatchSetup();
  }
  syncNewOptionsUi();
});
$("#reducedMotionToggle").addEventListener("change", (event) => {
  state.accessibility.reducedMotion = event.target.checked;
  localStorage.setItem("final-blow-reduced-motion", event.target.checked ? "1" : "0");
  applyAccessibilitySettings();
});
$("#highContrastToggle").addEventListener("change", (event) => {
  state.accessibility.highContrast = event.target.checked;
  localStorage.setItem("final-blow-high-contrast", event.target.checked ? "1" : "0");
  applyAccessibilitySettings();
});
$("#colorAssistSelect").addEventListener("change", (event) => {
  state.accessibility.colorAssist = event.target.value;
  localStorage.setItem("final-blow-color-assist", state.accessibility.colorAssist);
  applyAccessibilitySettings();
});
$("#shakeSelect").addEventListener("change", (event) => {
  state.accessibility.shakeScale = clamp(Number(event.target.value), 0, 1);
  localStorage.setItem("final-blow-shake-scale", String(state.accessibility.shakeScale));
});
$("#visualQualitySelect").addEventListener("change", (event) => {
  state.visualQuality = normalizeVisualQuality(event.target.value);
  localStorage.setItem("final-blow-visual-quality", state.visualQuality);
  applyPerformanceSettings();
});
$("#soundCaptionsToggle").addEventListener("change", (event) => {
  state.soundCaptions = event.target.checked;
  localStorage.setItem("final-blow-sound-captions", event.target.checked ? "1" : "0");
  if (!state.soundCaptions) $("#soundCaption").hidden = true;
});
$("#attractModeToggle").addEventListener("change", (event) => {
  state.attractEnabled = event.target.checked;
  localStorage.setItem("final-blow-attract-mode", state.attractEnabled ? "1" : "0");
  if (state.attractEnabled) scheduleIdleDemo();
  else clearIdleDemoTimer();
});
$("#controlsDialog").addEventListener("close", scheduleIdleDemo);
$("#touchHandednessSelect").addEventListener("change", (event) => {
  state.touchSettings.handedness = event.target.value === "left" ? "left" : "standard";
  localStorage.setItem("final-blow-touch-handedness", state.touchSettings.handedness);
  applyTouchSettings();
});
$("#touchScale").addEventListener("input", (event) => {
  state.touchSettings.scale = clamp(Number(event.target.value) / 100, 0.8, 1.3);
  localStorage.setItem("final-blow-touch-scale", String(state.touchSettings.scale));
  syncNewOptionsUi();
  applyTouchSettings();
});
$("#touchOpacity").addEventListener("input", (event) => {
  state.touchSettings.opacity = clamp(Number(event.target.value) / 100, 0.4, 1);
  localStorage.setItem("final-blow-touch-opacity", String(state.touchSettings.opacity));
  syncNewOptionsUi();
  applyTouchSettings();
});
$("#touchHapticsToggle").addEventListener("change", (event) => {
  state.touchSettings.haptics = event.target.checked;
  localStorage.setItem("final-blow-touch-haptics", event.target.checked ? "1" : "0");
});
$("#resetBindingsButton").addEventListener("click", () => {
  keyMaps = normalizeKeyMaps(DEFAULT_KEY_MAPS);
  padMap = normalizePadMap(DEFAULT_PAD_MAP);
  localStorage.setItem("final-blow-keymaps", JSON.stringify(keyMaps));
  localStorage.setItem("final-blow-pad-map", JSON.stringify(padMap));
  pendingKeyBinding = null;
  renderBindings();
});
$("#trainingDummySelect").addEventListener("change", (event) => {
  if (!TRAINING_DUMMY_MODES.includes(event.target.value)) return;
  if (state.training.recordingActive && event.target.value !== "record") finishTrainingRecording(state.training, { play: false });
  state.training.dummyMode = event.target.value;
  state.training.playbackFrame = 0;
  state.training.guardAfterTriggered = false;
  state.training.reversalArmed = false;
  syncDifficultyUi();
  updateTrainingUi();
});
$("#trainingRecoverToggle").addEventListener("change", (event) => {
  state.training.autoRecover = event.target.checked;
  updateTrainingUi();
});
$("#trainingGritToggle").addEventListener("change", (event) => {
  state.training.infiniteGrit = event.target.checked;
  if (event.target.checked) state.fighters.forEach((fighter) => { fighter.meter = GRIT_RULES.maximum; });
  updateHud();
  updateTrainingUi();
});
$("#trainingHitboxToggle").addEventListener("change", (event) => {
  state.training.showHitboxes = event.target.checked;
  updateTrainingUi();
});
$("#trainingRecordButton").addEventListener("click", () => {
  if (state.training.recordingActive) finishTrainingRecording(state.training);
  else beginTrainingRecording(state.training);
  updateTrainingUi();
});
$("#trainingPlaybackButton").addEventListener("click", () => {
  if (!state.training.recording.length) return;
  state.training.recordingActive = false;
  state.training.playbackFrame = 0;
  state.training.dummyMode = "playback";
  state.training.lastResult = "DUMMY LOOP PLAYING";
  updateTrainingUi();
});
$("#trainingTrialSelect").addEventListener("change", (event) => {
  selectTrainingTrial(state.training, state.fighters[0]?.kitId, Number(event.target.value));
  updateTrainingUi();
});
$("#trainingTrialResetButton").addEventListener("click", () => {
  selectTrainingTrial(state.training, state.fighters[0]?.kitId, state.training.trialIndex);
  updateTrainingUi();
});
$("#trainingResetButton").addEventListener("click", () => resetTrainingPosition(true));
// Training can force this round's weapon onto the floor for practice.
$("#trainingWeaponButton").addEventListener("click", () => {
  if (!state.stageWeaponsEnabled) setStageWeapons(true);
  if (!state.stageWeapon) resetStageWeapon();
  if (!state.stageWeapon) return;
  state.stageWeapon.phase = "ground";
  state.stageWeapon.frames = 0;
  state.stageWeapon.holder = -1;
  state.fighters.forEach((fighter) => { fighter.carriedWeapon = null; fighter.carryFrames = 0; });
  updateHud();
});
$("#musicSelect").addEventListener("change", (event) => {
  unlockAudio();
  chooseMusic(event.target.value);
});
$("#trackButton").addEventListener("click", () => {
  unlockAudio();
  advanceTrack();
});
fightMusic.addEventListener("ended", () => {
  if (state.musicChoice === "auto") advanceTrack();
  else {
    fightMusic.currentTime = 0;
    syncMusic();
  }
});
$("#soundToggle").addEventListener("change", () => {
  if ($("#soundToggle").checked) unlockAudio();
  else stopSfx();
});
document.addEventListener("visibilitychange", () => {
  if (state.mode === "online" && state.screen === "fight") setOnlineLocalSuspended(document.hidden || document.body.classList.contains("orientation-blocked"));
  else if (document.hidden && state.screen === "fight" && !state.paused) setPaused(true);
  if (document.hidden) clearIdleDemoTimer();
  else if (state.screen === "title") scheduleIdleDemo();
  syncMusic();
});
$("#fighterContinue").addEventListener("click", showStageSelect);
$$(".stage-card").forEach((card) => card.addEventListener("click", () => chooseStage(card.dataset.stage)));
$("#fightButton").addEventListener("click", () => startMatch(true));
$("#arcadeContinueButton").addEventListener("click", () => startMatch(true));
$("#endingReplayButton").addEventListener("click", () => startSelect("arcade"));
$("#rematchButton").addEventListener("click", () => {
  if (state.mode === "online") requestOnlineRematch();
  else startMatch(true);
});
$("#newStageButton").addEventListener("click", showSameFightersStageSelect);
$("#reselectButton").addEventListener("click", () => startSelect(state.mode));
$("#resumeButton").addEventListener("click", () => setPaused(false));
$("#restartButton").addEventListener("click", restartPausedRound);
$("#pauseOptionsButton").addEventListener("click", () => $("#controlsDialog").showModal());
$("#pauseSelectButton").addEventListener("click", () => startSelect(state.mode));
$("#installButton").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("#installButton").hidden = true;
});
$("#touchPauseButton").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  setPaused(!state.paused);
});
$$("[data-back]").forEach((button) => button.addEventListener("click", () => back(button.dataset.back)));
$("#homeLink").addEventListener("click", (event) => { event.preventDefault(); showScreen("title"); });
$("#fullscreenButton").addEventListener("click", () => {
  unlockAudio();
  enterImmersiveMode();
});
window.addEventListener("resize", () => {
  syncOrientationGate();
  document.documentElement.style.setProperty("--touch-button-size", `${touchButtonSize()}px`);
  if (state.visualQuality === "auto") applyPerformanceSettings();
});
window.addEventListener("orientationchange", () => {
  syncOrientationGate();
  document.documentElement.style.setProperty("--touch-button-size", `${touchButtonSize()}px`);
});
document.addEventListener("fullscreenchange", syncOrientationGate);

$$("[data-touch]").forEach((button) => {
  // A pad button may map to two tokens at once, e.g. the up-forward corner.
  const tokens = button.dataset.touch.split(/\s+/).filter(Boolean);
  const start = (event) => {
    event.preventDefault();
    for (const token of tokens) {
      touch.add(token);
      touch.add(`${token}:pressed`);
    }
    button.classList.add("active");
    if (state.touchSettings.haptics && event.isTrusted) navigator.vibrate?.(12);
    unlockAudio();
  };
  const end = (event) => {
    event.preventDefault();
    for (const token of tokens) touch.delete(token);
    button.classList.remove("active");
  };
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("pointerleave", end);
});

window.__finalBlowEngine = {
  version: "1.3c-cinematic-gore",
  simulationHz: SIMULATION_HZ,
  toggleDebug(enabled = !state.debug) {
    state.debug = Boolean(enabled);
    return state.debug;
  },
  snapshot() {
    const cameraTarget = finisherCameraTarget();
    const cinematicCamera = finisherCinematicCamera(state.cinematicZoom);
    return {
      tick: state.simulationTick,
      phase: state.phase,
      screen: state.screen,
      mode: state.mode,
      stage: state.stage,
      picks: [...state.picks],
      aiDifficulty: state.aiDifficulty,
      paused: state.paused,
      pauseReason: state.pauseReason,
      controlStyle: state.controlStyle,
      visualQuality: state.visualQuality,
      performance: { ...state.performance },
      soundCaptions: state.soundCaptions,
      attractEnabled: state.attractEnabled,
      graphicFatalities: state.graphicFatalities,
      fatalityAudit,
      fighterAudioAudit,
      audio: {
        audit: fighterAudioAudit,
        lastEvent: lastSoundEvent ? { ...lastSoundEvent } : null,
        loadedPalettes: new Set([...fighterSfxPools.keys()].map((key) => key.split(":")[0])).size,
      },
      offlineReady: state.offlineReady,
      accessibility: { ...state.accessibility },
      touchSettings: { ...state.touchSettings },
      training: trainingSnapshot(state.training),
      online: onlineSnapshot(),
      demo: demoSnapshot(),
      balance: balanceAudit,
      tournament: tournamentAudit,
      inputRules: {
        buffer: { ...INPUT_BUFFER_RULES },
        priority: [...TOURNAMENT_ACTION_PRIORITY],
      },
      camera: {
        x: cameraTarget.x,
        y: cameraTarget.y,
        zoom: state.finisher ? state.cinematicZoom : 1,
        locked: !state.finisher,
        mode: state.finisher ? "finisher" : "arena",
        shot: cinematicCamera.shot,
        intensity: Number(cinematicCamera.intensity.toFixed(3)),
        cuts: state.finisher?.cinematicCuts || 0,
        impactCloseUps: state.finisher?.impactCloseUps || 0,
        peakZoom: state.finisher?.peakZoom || 1,
        slowMotionHits: state.finisher?.slowMotionHits || 0,
      },
      arcade: arcadeRunSnapshot(state.arcadeRun),
      seed: state.matchSeed,
      rng: state.rng.getState(),
      commands: commandHistory.map((history) => history.map((entry) => ({ ...entry }))),
      traps: state.traps.map((trap) => ({
        id: trap.id,
        ownerSide: trap.ownerSide,
        x: trap.x,
        radius: trap.radius,
        armFrames: trap.armFrames,
        lifeFrames: trap.lifeFrames,
        enhanced: trap.enhanced,
      })),
      crowd: crowdSnapshot(state.crowd, state.simulationTick, { viewLeft: 0, viewRight: W }),
      crowdReaction: Number(state.crowdReaction.toFixed(3)),
      violence: {
        bloodParticles: state.particles.filter((particle) => particle.kind === "blood").length,
        goreFragments: state.particles.filter((particle) => particle.kind === "goreFragment").length,
        dustParticles: state.particles.filter((particle) => particle.kind === "dust").length,
        bloodBursts: state.effects.filter((effect) => effect.kind === "bloodBurst").length,
        bloodDecals: state.effects.filter((effect) => effect.kind === "bloodDecal").length,
        fatalityPools: state.effects.filter((effect) => effect.kind === "fatalityPool").length,
        goreShockwaves: state.effects.filter((effect) => effect.kind === "goreShockwave").length,
        lensBlood: state.effects.filter((effect) => effect.kind === "lensBlood").length,
        genericHitEffects: state.effects.filter((effect) => effect.kind === "hit").length,
        shake: Number(state.shake.toFixed(3)),
        hitstop: Number(state.hitstop.toFixed(4)),
      },
      stageWeapon: weaponSnapshot(state.stageWeapon),
      stageWeaponsEnabled: state.stageWeaponsEnabled,
      projectiles: state.projectiles.map((projectile) => ({
        id: projectile.id,
        ownerSide: projectile.ownerSide,
        x: projectile.x,
        y: projectile.y,
        vx: projectile.vx,
        width: projectile.width,
        height: projectile.height,
        level: projectile.level,
        lifeFrames: projectile.lifeFrames,
        armFrames: projectile.armFrames,
        style: projectile.style,
        enhanced: projectile.enhanced,
        throwable: projectile.throwable || null,
        impactLabel: projectile.impactLabel || null,
        variant: projectile.variant || null,
        hazard: Boolean(projectile.hazard),
        bouncesLeft: projectile.bouncesLeft ?? 0,
        vy: projectile.vy ?? 0,
      })),
      fighters: state.fighters.map((fighter) => ({
        id: fighter.def.id,
        kitId: fighter.kitId,
        boss: Boolean(fighter.def.boss),
        side: fighter.side,
        state: fighter.combatState,
        stateFrame: fighter.stateFrame,
        x: fighter.x,
        y: fighter.y,
        vx: fighter.vx,
        vy: fighter.vy,
        health: fighter.health,
        meter: fighter.meter,
        attack: fighter.attacking?.kind || null,
        move: fighter.attacking?.profileId || null,
        moveName: fighter.attacking?.moveName || null,
        kitAction: fighter.attacking?.kitAction || null,
        animationBank: fighter.attacking?.animation?.bank || "base",
        archetype: fighter.kit?.archetype || null,
        movement: { ...fighter.movement },
        attackLevel: fighter.attacking?.level || null,
        attackFrame: fighter.attackFrame,
        activeEndFrame: fighter.attacking?.activeEndFrame ?? null,
        totalFrames: fighter.attacking?.totalFrames ?? null,
        attackHits: fighter.attackHits,
        attackConnected: fighter.attackConnected,
        rhythmStacks: fighter.rhythmStacks,
        rhythmExpiresFrame: fighter.rhythmExpiresFrame,
        rhythmBoost: fighter.attacking?.rhythmBoost || 0,
        counterTriggered: fighter.counterTriggered,
        trapDeployed: fighter.trapDeployed,
        cancelledFrom: fighter.cancelledFrom,
        linkedFrom: fighter.linkedFrom,
        facing: fighter.facing,
        grounded: fighter.grounded,
        crouching: fighter.crouch,
        guarding: fighter.guarding,
        guardHeight: fighter.guardHeight,
        dashFrames: fighter.dashFrames,
        dashDirection: fighter.dashDirection,
        hitstunFrames: fighter.hitstunFrames,
        blockstunFrames: fighter.blockstunFrames,
        knockdownFrames: fighter.knockdownFrames,
        wakeupFrames: fighter.wakeupFrames,
        invulnerableFrames: fighter.invulnerableFrames,
        pendingKnockdown: fighter.pendingKnockdown,
        juggleCount: fighter.juggleCount,
        down: fighter.down,
        lastHitResult: fighter.lastHitResult,
        throwableUses: fighter.throwableUses,
        carriedWeapon: fighter.carriedWeapon,
        carryFrames: fighter.carryFrames,
        slowFrames: fighter.slowFrames,
        stunMeter: fighter.stunMeter,
        dizzyFrames: fighter.dizzyFrames,
        dizzy: fighter.dizzyFrames > 0,
        stunImmuneFrames: fighter.stunImmuneFrames,
        grabbing: fighter.grabbing ? { ...fighter.grabbing } : null,
        grabbed: fighter.grabbed ? { ...fighter.grabbed } : null,
        throwInvulnerableFrames: fighter.throwInvulnerableFrames,
        throwTechFlashFrames: fighter.throwTechFlashFrames,
        combo: fighter.combo.snapshot(state.simulationTick),
        hurtboxes: getHurtboxes(fighter),
        hitboxes: getActiveHitboxes(fighter),
        inputBuffer: fighter.inputBuffer.snapshot(),
        ai: aiBrainSnapshot(fighter.aiBrain),
      })),
    };
  },
};

if (["127.0.0.1", "localhost"].includes(location.hostname)) {
  window.__finalBlowQa = {
    fight(firstId = "deathblow", secondId = "jez") {
      const firstIndex = roster.findIndex((fighter) => fighter.id === firstId);
      const secondIndex = roster.findIndex((fighter) => fighter.id === secondId);
      if (firstIndex < 0 || secondIndex < 0) throw new Error(`Unknown matchup: ${firstId} vs ${secondId}`);
      state.mode = "versus";
      state.arcadeRun = null;
      state.qaManualMode = true;
      state.picks = [firstIndex, secondIndex];
      state.rounds = [0, 0];
      state.round = 1;
      state.matchSerial += 1;
      seedMatch(state.round);
      state.fighters = [makeFighter(firstIndex, 0), makeFighter(secondIndex, 1)];
      resetStageWeapon();
      resetCrowd();
      state.particles.length = 0;
      state.effects.length = 0;
      state.traps.length = 0;
      state.projectiles.length = 0;
      state.timer = 99;
      state.timerCarry = 0;
      state.phase = "fight";
      state.phaseTime = 0;
      state.finishWinner = -1;
      state.finisher = null;
      state.hitstop = 0;
      state.lastImpactSide = -1;
      qaInputOverrides[0] = null;
      qaInputOverrides[1] = null;
      commandHistory[0].length = 0;
      commandHistory[1].length = 0;
      showScreen("fight");
      updateHud();
      updateFacings();
      return window.__finalBlowEngine.snapshot();
    },
    training(firstId = "deathblow", secondId = "jez", dummyMode = "stand") {
      window.__finalBlowQa.fight(firstId, secondId);
      state.mode = "training";
      state.training = createTrainingState({ dummyMode });
      state.fighters.forEach((fighter) => { fighter.meter = GRIT_RULES.maximum; });
      showScreen("fight");
      updateHud();
      updateTrainingUi();
      return window.__finalBlowEngine.snapshot();
    },
    trainingDummy(dummyMode = "stand") {
      if (!TRAINING_DUMMY_MODES.includes(dummyMode)) throw new Error(`Unknown dummy mode: ${dummyMode}`);
      state.training.dummyMode = dummyMode;
      updateTrainingUi();
      return trainingSnapshot(state.training);
    },
    trainingRecordStart() {
      if (state.mode !== "training") throw new Error("Start training first");
      beginTrainingRecording(state.training);
      updateTrainingUi();
      return trainingSnapshot(state.training);
    },
    trainingRecordStop(play = true) {
      if (state.mode !== "training") throw new Error("Start training first");
      finishTrainingRecording(state.training, { play: Boolean(play) });
      updateTrainingUi();
      return trainingSnapshot(state.training);
    },
    trainingRecordFrame(input = {}) {
      if (state.mode !== "training" || !state.training.recordingActive) throw new Error("Start dummy recording first");
      recordTrainingFrame(state.training, input);
      updateTrainingUi();
      return trainingSnapshot(state.training);
    },
    trainingTrial(index = 0) {
      if (state.mode !== "training") throw new Error("Start training first");
      selectTrainingTrial(state.training, state.fighters[0].kitId, index);
      updateTrainingUi();
      return trainingSnapshot(state.training).trial;
    },
    stage(stageId = "kensington") {
      if (!stages[stageId]) throw new Error(`Unknown stage: ${stageId}`);
      state.stage = stageId;
      updateStageUI();
      resetStageWeapon();
      resetCrowd();
      return state.stage;
    },
    stageWeapons(enabled = true) {
      setStageWeapons(Boolean(enabled));
      return state.stageWeaponsEnabled;
    },
    forceStageWeapon(x = null) {
      if (!state.stageWeapon) resetStageWeapon();
      if (!state.stageWeapon) return null;
      state.stageWeapon.phase = "ground";
      state.stageWeapon.frames = 0;
      state.stageWeapon.holder = -1;
      state.stageWeapon.roundStartTick = state.simulationTick;
      if (Number.isFinite(x)) state.stageWeapon.x = clamp(x, MOVEMENT_RULES.stageMinX, MOVEMENT_RULES.stageMaxX);
      state.fighters.forEach((fighter) => { fighter.carriedWeapon = null; fighter.carryFrames = 0; });
      updateHud();
      return weaponSnapshot(state.stageWeapon);
    },
    stageWeaponPlan(stageId = state.stage, round = state.round) {
      return planStageWeapon(stageId, {
        matchSeed: state.matchSeed,
        round,
        minX: MOVEMENT_RULES.stageMinX,
        maxX: MOVEMENT_RULES.stageMaxX,
      });
    },
    fighterScale() {
      return FIGHTER_SCALE;
    },
    fighterRenderSizes() {
      // Mirrors the sizing drawFighter uses, so tests can assert on-screen framing.
      return Object.fromEntries(roster.map(({ id }) => [id, fighterRenderSize(id)]));
    },
    difficulty(difficulty = DEFAULT_AI_DIFFICULTY) {
      return setAiDifficulty(difficulty);
    },
    pause(paused = true) {
      return setPaused(paused);
    },
    flowPhase(phase = "intro", seconds = 2.4, winner = 0) {
      if (!["intro", "roundover"].includes(phase)) throw new Error(`Unsupported flow phase: ${phase}`);
      if (state.screen !== "fight") throw new Error("Start a QA fight first");
      state.phase = phase;
      state.phaseTime = Math.max(0, Number(seconds) || 0);
      if (phase === "roundover") {
        const side = winner === 1 ? 1 : 0;
        state.rounds = side === 0 ? [2, 0] : [0, 2];
        state.finisherType = -1;
      }
      updateFlowSkipHint();
      return window.__finalBlowEngine.snapshot();
    },
    controllerDisconnect(side = 0) {
      return handleControllerDisconnect(null, side === 1 ? 1 : 0);
    },
    quality(quality = "auto") {
      state.visualQuality = normalizeVisualQuality(quality);
      applyPerformanceSettings();
      return { ...state.performance };
    },
    soundCue(fighterId = "deathblow", cue = "special") {
      const fighter = roster.find(({ id }) => id === fighterId);
      if (!fighter || !FIGHTER_AUDIO_CUES.includes(cue)) throw new Error(`Unknown fighter audio cue: ${fighterId}/${cue}`);
      sound(cue, fighter);
      return { ...lastSoundEvent };
    },
    aiMode(enabled = true) {
      state.mode = enabled ? "arcade" : "versus";
      return state.mode;
    },
    onlineManual(enabled = true) {
      if (state.mode !== "online" || !onlineSession.rollback) throw new Error("Start an online rollback match first");
      state.qaManualMode = Boolean(enabled);
      return state.qaManualMode;
    },
    dropOnlineLink() {
      if (!onlineSession.peer) throw new Error("No online peer link is active");
      onlineSession.peer.connection.close();
      return true;
    },
    onlineResult(winner = 0) {
      if (state.mode !== "online" || !onlineSession.rollback) throw new Error("Start an online rollback match first");
      const side = winner === 1 ? 1 : 0;
      state.rounds[side] = 2;
      state.finisherType = -1;
      showResult(side);
      return window.__finalBlowEngine.snapshot();
    },
    aiFight(firstId = "deathblow", secondId = "jez", difficulty = DEFAULT_AI_DIFFICULTY) {
      window.__finalBlowQa.fight(firstId, secondId);
      setAiDifficulty(difficulty);
      state.mode = "arcade";
      return window.__finalBlowEngine.snapshot();
    },
    tournamentMatrix(seconds = 8, difficulty = "pro") {
      const fighterIds = roster.map(({ id }) => id);
      const durationFrames = Math.max(120, Math.min(1200, Math.floor(seconds * SIMULATION_HZ)));
      const previousStageWeapons = state.stageWeaponsEnabled;
      state.stageWeaponsEnabled = false;
      const matchups = [];
      for (let first = 0; first < fighterIds.length; first += 1) {
        for (let second = first + 1; second < fighterIds.length; second += 1) {
          this.fight(fighterIds[first], fighterIds[second]);
          state.mode = "tournament";
          setAiDifficulty(difficulty);
          state.fighters.forEach((fighter) => resetAiBrain(fighter.aiBrain, difficulty));
          let maximumGroundOverlap = 0;
          let maximumProjectiles = 0;
          let maximumTraps = 0;
          let nonFinite = false;
          for (let frame = 0; frame < durationFrames && state.screen === "fight"; frame += 1) {
            simulationClock.stepOnce(runSimulationStep);
            const [a, b] = state.fighters;
            if (!a || !b) break;
            if (![a.x, a.y, a.health, b.x, b.y, b.health].every(Number.isFinite)) nonFinite = true;
            const collisionExempt = a.grabbing || b.grabbing || a.grabbed || b.grabbed
              || a.attacking?.ignorePushbox || b.attacking?.ignorePushbox;
            if (a.grounded && b.grounded && !collisionExempt) {
              const required = (a.crouch ? a.movement.crouchingPushboxHalfWidth : a.movement.standingPushboxHalfWidth)
                + (b.crouch ? b.movement.crouchingPushboxHalfWidth : b.movement.standingPushboxHalfWidth);
              maximumGroundOverlap = Math.max(maximumGroundOverlap, required - Math.abs(a.x - b.x));
            }
            maximumProjectiles = Math.max(maximumProjectiles, state.projectiles.length);
            maximumTraps = Math.max(maximumTraps, state.traps.length);
            if (["result", "roundover"].includes(state.phase)) break;
          }
          const snapshot = window.__finalBlowEngine.snapshot();
          matchups.push({
            fighters: [fighterIds[first], fighterIds[second]],
            health: snapshot.fighters.map((fighter) => Number(fighter.health.toFixed(2))),
            decisions: snapshot.fighters.map((fighter) => fighter.ai.decisions),
            maximumGroundOverlap: Number(Math.max(0, maximumGroundOverlap).toFixed(3)),
            maximumProjectiles,
            maximumTraps,
            nonFinite,
          });
        }
      }
      state.stageWeaponsEnabled = previousStageWeapons;
      this.fight("deathblow", "jez");
      return { difficulty, seconds: durationFrames / SIMULATION_HZ, matchups };
    },
    demoStages() {
      // The stage list the attract director shuffles through.
      return Object.keys(stages);
    },
    demo(seed = 237) {
      startDemo({ qa: true, seed });
      return window.__finalBlowEngine.snapshot();
    },
    demoKnockout(winner = 0) {
      if (!demoSession.active || state.mode !== "demo" || state.screen !== "fight") throw new Error("Start a QA demo first");
      const side = winner === 1 ? 1 : 0;
      state.fighters[1 - side].health = 0;
      state.lastImpactSide = side;
      state.hitstop = 0;
      checkKnockout();
      return window.__finalBlowEngine.snapshot();
    },
    demoResult(winner = 0) {
      if (!demoSession.active || state.mode !== "demo") throw new Error("Start a QA demo first");
      const side = winner === 1 ? 1 : 0;
      state.rounds[side] = 2;
      state.finisherType = 0;
      showResult(side);
      return window.__finalBlowEngine.snapshot();
    },
    demoCycles(count = 1) {
      if (!demoSession.active || state.mode !== "demo") throw new Error("Start a QA demo first");
      const total = Math.max(1, Math.min(500, Math.floor(count)));
      const cycles = [{ ...demoSession.cycle, picks: [...demoSession.cycle.picks] }];
      while (cycles.length < total) {
        startNextDemoMatch();
        cycles.push({ ...demoSession.cycle, picks: [...demoSession.cycle.picks] });
      }
      return {
        cycles,
        demo: demoSnapshot(),
        resources: {
          fighters: state.fighters.length,
          particles: state.particles.length,
          effects: state.effects.length,
          traps: state.traps.length,
          projectiles: state.projectiles.length,
          resultTimers: demoSession.resultTimer ? 1 : 0,
          introTimers: fightAnnouncementTimer ? 1 : 0,
        },
      };
    },
    exitDemo() {
      return exitDemo();
    },
    arcade(playerId = "deathblow", difficulty = DEFAULT_AI_DIFFICULTY, seed = 237) {
      const playerIndex = roster.findIndex(({ id }) => id === playerId);
      if (playerIndex < 0) throw new Error(`Unknown arcade fighter: ${playerId}`);
      state.mode = "arcade";
      state.qaManualMode = true;
      state.picks = [playerIndex, 0];
      state.locks = [true, true];
      state.arcadeRun = createArcadeRun(playerId, roster.map(({ id }) => id), seed);
      setAiDifficulty(difficulty);
      prepareArcadeOpponent(false);
      state.rounds = [0, 0];
      state.round = 1;
      state.fighters = makeMatchFighters();
      state.phase = "fight";
      state.phaseTime = 0;
      state.finishWinner = -1;
      state.finisher = null;
      state.traps.length = 0;
      state.projectiles.length = 0;
      showScreen("fight");
      updateHud();
      updateFacings();
      return window.__finalBlowEngine.snapshot();
    },
    arcadeResult(playerWon = true) {
      if (!state.arcadeRun) throw new Error("Start a QA arcade run first");
      const outcome = recordArcadeResult(state.arcadeRun, Boolean(playerWon));
      if (!playerWon) {
        showResult(1);
      } else if (outcome.completed) {
        showArcadeEnding();
      } else {
        prepareArcadeOpponent(true);
        state.rounds = [0, 0];
        state.round = 1;
        state.fighters = makeMatchFighters();
        showArcadeLadder(outcome.match);
      }
      return window.__finalBlowEngine.snapshot();
    },
    input(side, input = {}, frames = 1) {
      if (side !== 0 && side !== 1) throw new Error(`Unknown fighter side: ${side}`);
      qaInputOverrides[side] = { input: { ...input }, frames: Math.max(1, Math.floor(frames)) };
      return true;
    },
    fighter(side, values = {}) {
      const fighter = state.fighters[side];
      if (!fighter) throw new Error(`Unknown fighter side: ${side}`);
      const allowed = new Set([
        "health",
        "meter",
        "hitstunFrames",
        "blockstunFrames",
        "knockdownFrames",
        "wakeupFrames",
        "invulnerableFrames",
        "juggleCount",
        "rhythmStacks",
        "rhythmExpiresFrame",
      ]);
      for (const [key, value] of Object.entries(values)) {
        if (!allowed.has(key) || !Number.isFinite(value)) continue;
        fighter[key] = key === "health" || key === "meter" ? clamp(value, 0, 100)
          : key === "rhythmStacks" ? clamp(Math.floor(value), 0, 3)
            : Math.max(0, Math.floor(value));
      }
      fighter.stun = Math.max(fighter.hitstunFrames, fighter.blockstunFrames) / SIMULATION_HZ;
      updateHud();
      return window.__finalBlowEngine.snapshot();
    },
    positions(firstX = 500, secondX = 610) {
      if (state.fighters.length !== 2) throw new Error("Start a QA fight first");
      state.fighters[0].x = clamp(firstX, MOVEMENT_RULES.stageMinX, MOVEMENT_RULES.stageMaxX);
      state.fighters[1].x = clamp(secondX, MOVEMENT_RULES.stageMinX, MOVEMENT_RULES.stageMaxX);
      state.fighters.forEach((fighter) => {
        fighter.y = FLOOR;
        fighter.vx = 0;
        fighter.vy = 0;
        fighter.grounded = true;
      });
      separateFighters();
      updateFacings();
      return window.__finalBlowEngine.snapshot();
    },
    ready(id, type = 0) {
      const index = roster.findIndex((fighter) => fighter.id === id);
      if (index < 0) throw new Error(`Unknown fighter: ${id}`);
      state.mode = "versus";
      state.arcadeRun = null;
      state.qaManualMode = true;
      state.picks = [index, index === 1 ? 0 : 1];
      state.rounds = [0, 0];
      state.round = 1;
      state.matchSerial += 1;
      seedMatch(state.round);
      state.fighters = [makeFighter(state.picks[0], 0), makeFighter(state.picks[1], 1)];
      state.fighters[1].health = 0;
      state.particles.length = 0;
      state.effects.length = 0;
      state.traps.length = 0;
      state.projectiles.length = 0;
      state.phase = "finish";
      state.phaseTime = 6;
      state.finishWinner = 0;
      state.finisherType = type;
      state.finisher = null;
      state.hitstop = 0;
      state.cinematicZoom = 1;
      $("#touchControls").classList.remove("cinematic");
      showScreen("fight");
      updateHud();
      setTouchPrompt("final");
    },
    graphicFatality(id, type = 0, seconds = 4.7, enabled = true) {
      this.ready(id, type);
      state.graphicFatalities = Boolean(enabled);
      $("#goreToggle").checked = state.graphicFatalities;
      finishRound(0, type);
      this.step(seconds);
      return this.status();
    },
    result(id = "deathblow") {
      const index = roster.findIndex((fighter) => fighter.id === id);
      if (index < 0) throw new Error(`Unknown fighter: ${id}`);
      state.mode = "versus";
      state.arcadeRun = null;
      state.qaManualMode = true;
      state.picks = [index, index === 1 ? 0 : 1];
      state.fighters = [makeFighter(state.picks[0], 0), makeFighter(state.picks[1], 1)];
      state.finisherType = -1;
      showResult(0);
      return {
        title: $("#resultTitle").textContent,
        quote: $("#resultQuote").textContent,
        background: $("#victoryPose").style.backgroundImage,
      };
    },
    status() {
      const scriptId = state.fighters[state.finisher?.winner ?? 0]?.def.finisherScriptId
        || state.fighters[state.finisher?.winner ?? 0]?.def.id
        || "deathblow";
      const fatality = state.finisher ? getGraphicFatality(scriptId, state.finisher.type) : null;
      return {
        phase: state.phase,
        fighter: state.fighters[0]?.def.id,
        elapsed: state.finisher?.elapsed || 0,
        impacts: state.finisher?.impactIndex || 0,
        beat: state.finisher?.beatLabel || "",
        attackerFrame: state.fighters[0]?.cinematicFrame,
        victimFrame: state.fighters[1]?.cinematicFrame,
        graphicFatalities: state.graphicFatalities,
        fatalityId: state.finisher?.fatalityId || null,
        fatalityFamily: fatality?.family || null,
        fatalityTriggered: Boolean(state.finisher?.fatalityTriggered),
        fatalityPools: state.effects.filter((effect) => effect.kind === "fatalityPool").length,
        goreFragments: state.particles.filter((particle) => particle.kind === "goreFragment").length,
        goreShockwaves: state.effects.filter((effect) => effect.kind === "goreShockwave").length,
        lensBlood: state.effects.filter((effect) => effect.kind === "lensBlood").length,
        cinematicShot: state.finisher?.cinematicShot || "arena",
        cinematicCuts: state.finisher?.cinematicCuts || 0,
        impactCloseUps: state.finisher?.impactCloseUps || 0,
        peakZoom: state.finisher?.peakZoom || 1,
        slowMotionHits: state.finisher?.slowMotionHits || 0,
        simulationTick: state.simulationTick,
        simulationHz: SIMULATION_HZ,
      };
    },
    step(seconds) {
      const frames = Math.ceil(seconds * SIMULATION_HZ);
      for (let frame = 0; frame < frames; frame += 1) simulationClock.stepOnce(runSimulationStep);
      state.simulationTick = simulationClock.tick;
      return this.status();
    },
  };
}

setupRoster();
renderMoveList();
renderBindings();
applyAccessibilitySettings();
applyTouchSettings();
syncNewOptionsUi();
updateMusicUi();
updateVolumeUi();
setAiDifficulty(state.aiDifficulty);
syncOrientationGate();
updateOfflineBadge();
registerOfflineGame();
const storedOnlineResume = pendingOnlineInvite ? null : readOnlineResume();
if (pendingOnlineInvite) {
  state.mode = "online";
  $("#onlineInviteInput").value = location.href;
  showScreen("online");
  setOnlineStatus("waiting", "Private invite detected. Press Join Private Room.");
} else if (storedOnlineResume) {
  resumeStoredOnlineConnection(storedOnlineResume);
} else showScreen("title");
updateStageUI();
requestAnimationFrame(loop);
requestAnimationFrame(menuPadLoop);
