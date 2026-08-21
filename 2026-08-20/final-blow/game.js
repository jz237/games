import {
  DEFAULT_INPUT_BUFFER_FRAMES,
  DeterministicRng,
  FIGHTER_STATES,
  FixedStepClock,
  FrameInputBuffer,
  SIMULATION_HZ,
  SIMULATION_STEP_SECONDS,
  hashSeed,
  transitionFighterState,
} from "./engine/foundation.mjs";
import {
  ATTACK_LEVELS,
  DEFENSE_RULES,
  DirectionTapTracker,
  MOVEMENT_RULES,
  boxesOverlap,
  canGuardAttack,
  createCombatMove,
  findBoxCollision,
  getActiveHitboxes,
  getHurtboxes,
  isCounterHit,
  resolvePushboxPositions,
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
  DEFAULT_AI_DIFFICULTY,
  aiBrainSnapshot,
  createAiBrain,
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
  applyControlStyle,
  detectPadLabelSet,
  formatKeyCode,
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
  createTrainingState,
  trainingDummyInput,
  trainingSnapshot,
} from "./engine/training.mjs";
import {
  auditFighterBalance,
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
const GRAVITY = 1850;

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

// Original soundtrack and combat cues generated with the ElevenLabs API.
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
  final: "FINAL BLOW",
  ko: "KNOCKOUT",
  pause: "GAME PAUSED",
  resume: "FIGHT RESUMED",
});

const keys = new Set();
const pressed = new Set();
const touch = new Set();
const previousPads = new Map();
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
    ? "Return to landscape play to resume both fighters."
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
    width: 92,
    height: 196,
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
    $("#pausePanel").hidden = true;
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
  state.picks = [0, state.mode === "arcade" ? 4 : 1];
  state.locks = [false, state.mode === "arcade"];
  state.selectingPlayer = 0;
  $("#selectPrompt").textContent = state.mode === "training"
    ? "CHOOSE YOUR TRAINING FIGHTER"
    : "PLAYER 1 — CHOOSE";
  showScreen("select");
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
  warmFighterAudio();
  if (state.mode === "training") {
    state.training = createTrainingState({
      ...state.training,
      resets: 0,
      lastDamage: 0,
      lastResult: "READY",
    });
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

function finishRound(winner, type = -1) {
  if (state.phase === "roundover" || state.phase === "result") return;
  for (const fighter of state.fighters) clearGrabState(fighter);
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
  };
  state.cinematicZoom = 1.02;
  state.shake = .16;
  if (!rollbackResimulating) {
    setTouchPrompt("");
    $("#touchControls").classList.add("cinematic");
  }
  sound("special", attacker);
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
  state.hitstop = Math.max(state.hitstop, finalImpact ? .16 : .045 + impact.power * .028);
  state.shake = Math.max(state.shake, finalImpact ? 1.1 : .16 + impact.power * .22);
  if (finalImpact && $("#flashToggle").checked) state.flash = .34;
  finisher.beatLabel = impact.label;
  finisher.beatLife = finalImpact ? 1.05 : .48;

  for (let index = 0; index < count; index += 1) {
    const angle = visualRandom() * Math.PI * 2;
    const speed = 100 + visualRandom() * (finalImpact ? 670 : 330) * impact.power;
    const splatter = finalImpact && gore && visualRandom() > .34;
    state.particles.push({
      x: pointX,
      y: pointY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (finalImpact ? 150 : 35),
      life: (finalImpact ? .65 : .22) + visualRandom() * (finalImpact ? 1.15 : .42),
      max: finalImpact ? 1.8 : .64,
      size: 2 + visualRandom() * (finalImpact ? 8 : 5),
      color: splatter ? "#d90b19" : visualRandom() > .38 ? attacker.def.accent : attacker.def.color,
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
  state.cinematicZoom = pose.zoom;

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
  $("#rematchButton").textContent = arcadeDefeat ? "CONTINUE" : "REMATCH";
  $("#reselectButton").textContent = arcadeDefeat ? "ABANDON RUN" : state.mode === "online" ? "LEAVE ROOM" : "SELECT FIGHTERS";
  showScreen("result");
  if (state.mode === "demo") scheduleNextDemoMatch();
  else $("#demoResultStatus").hidden = true;
  if (state.mode === "online") {
    onlineSession.rematchVotes.clear();
    updateOnlineRematchUi();
    persistOnlineResume(true);
  }
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
  const label = kind === "final" ? "FINISH HIM · ANY BUTTON"
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
  if (state.training.infiniteGrit) state.fighters.forEach((fighter) => { fighter.meter = GRIT_RULES.maximum; });
  if (countReset) state.training.resets += 1;
  state.training.lastDamage = 0;
  updateHud();
  updateTrainingUi();
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
    state.training.inputHistory = state.training.inputHistory.slice(-8);
    state.training.lastInputLabel = inputLabel;
    state.training.lastInputFrame = state.simulationTick;
  } else if (!inputLabel) {
    state.training.lastInputLabel = "";
  }
  const snapshot = trainingSnapshot(state.training);
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
  $("#trainingDummySelect").value = snapshot.dummyMode;
  $("#trainingRecoverToggle").checked = snapshot.autoRecover;
  $("#trainingGritToggle").checked = snapshot.infiniteGrit;
}

function syncNewOptionsUi() {
  $("#goreToggle").checked = state.graphicFatalities;
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
  const cpuFinisher = state.mode === "demo" || fighter.side === 1;
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
  // Any one of LP / HP / LK / HK finishes: lights pick Finisher A, heavies pick B.
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
  const kitMove = createFighterMove(fighter.kitId, action, moveContext);
  const gritCost = kitMove
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

const PROXIMITY_GRAB_RANGE = 104;

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

function applyFighterPhysics(fighter, dt) {
  fighter.vy += GRAVITY * dt;
  fighter.x += fighter.vx * dt;
  fighter.y += fighter.vy * dt;
  if (fighter.y >= FLOOR) {
    const landed = !fighter.grounded;
    fighter.y = FLOOR;
    fighter.vy = 0;
    fighter.grounded = true;
    if (fighter.pendingKnockdown) enterKnockdown(fighter);
    else if (landed && fighter.attacking?.profileId.startsWith("air-")) {
      fighter.attacking = null;
      fighter.attackTime = 0;
      fighter.attackFrame = 0;
      fighter.landingRecoveryFrames = 5;
    }
  } else {
    fighter.grounded = false;
  }
  fighter.x = clamp(fighter.x, MOVEMENT_RULES.stageMinX, MOVEMENT_RULES.stageMaxX);
}

const attackActionPriority = [
  "super",
  "enhancedLauncher",
  "enhancedBackSpecial",
  "enhancedCommandSpecial",
  "enhanced",
  "launcher",
  "backSpecial",
  "driveHeavy",
  "commandSpecial",
  "throw",
  "special",
  "heavy",
  "light",
];

function bufferedAction(fighter, actions = attackActionPriority) {
  return actions.find((action) => fighter.inputBuffer.has(action, state.simulationTick)) || null;
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
        if (fighter.inputBuffer.has("jump", state.simulationTick)) {
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
            fighter.vx = direction.absolute * speed * flowSpeed;
          } else fighter.vx = 0;
          if (Math.abs(fighter.vx) > 20) fighter.walkTime += dt;
        }

        const bufferedAttack = fighter.inputBuffer.consume(attackActionPriority, state.simulationTick);
        if (bufferedAttack) beginAttack(fighter, bufferedAttack.action, input, {
          reversal: fighter.reversalWindowFrames > 0 && bufferedAttack.action === "special",
          limb: bufferedAttack.payload?.limb,
          backThrow: bufferedAttack.action === "throw" ? Boolean(bufferedAttack.payload?.back) : null,
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
    armFrames: profile.armFrames,
    lifeFrames: profile.lifetimeFrames,
    maxLifeFrames: profile.lifetimeFrames,
    enhanced: offsets.length > 1,
    color,
  }));
  const ownerTraps = state.traps.filter((trap) => trap.ownerSide === fighter.side);
  const removeCount = Math.max(0, ownerTraps.length + newTraps.length - 3);
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
  spawnHit(trap.x, trap.y - 63, { ...owner.def, accent: trap.color }, "special", blocked);
  spawnCombatText(trap.x, trap.y - 112, blocked ? "WET BLOCK" : "WET PAINT!", trap.color);
  state.shake = Math.max(state.shake, blocked ? 0.12 : 0.28);
  state.hitstop = Math.max(state.hitstop, blocked ? 0.035 : 0.09);
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
      x: fighter.x + fighter.facing * xOffset,
      y: FLOOR + yOffset,
      vx: fighter.facing * profile.speed,
      direction: fighter.facing,
      width: profile.width,
      height: profile.height,
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
    const owned = state.projectiles.filter((item) => item.ownerSide === fighter.side);
    if (owned.length >= (profile.maxOwned || 5)) {
      const oldest = owned[0];
      state.projectiles = state.projectiles.filter((item) => item.id !== oldest.id);
    }
    state.projectiles.push(projectile);
    state.effects.push({ kind: projectile.style === "feedback" ? "feedbackTelegraph" : "projectileLaunch", x: projectile.x, y: projectile.y, life: 0.35, max: 0.35, color: projectile.color });
    sound("special", fighter);
  }
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
  owner.attackConnected = blocked ? "block" : "hit";
  owner.confirmWindowFrames = 12;
  owner.meter = clamp(owner.meter + 15 * GRIT_RULES.hitGainMultiplier, 0, GRIT_RULES.maximum);
  victim.meter = clamp(victim.meter + 15 * GRIT_RULES.damageTakenGainMultiplier, 0, GRIT_RULES.maximum);
  state.effects.push({ kind: projectile.style === "feedback" ? "feedbackBurst" : "projectileBurst", x: projectile.x, y: projectile.y, life: 0.5, max: 0.5, color: projectile.color });
  spawnHit(projectile.x, projectile.y, { ...owner.def, accent: projectile.color }, "special", blocked);
  if (projectile.style === "feedback") spawnCombatText(projectile.x, projectile.y - 86, blocked ? "ECHO BLOCK" : "FEEDBACK ECHO!", projectile.color);
  else if (counter) spawnCombatText(projectile.x, projectile.y - 72, "COUNTER", projectile.color);
  else if (!blocked && projectile.level === ATTACK_LEVELS.LOW) spawnCombatText(projectile.x, projectile.y - 61, "LOW SHOT", projectile.color);
  state.shake = Math.max(state.shake, blocked ? 0.1 : 0.25);
  state.hitstop = Math.max(state.hitstop, blocked ? 0.035 : 0.085);
  state.lastImpactSide = owner.side;
  projectile.hit = true;
  sound(blocked ? "block" : "hit-heavy", blocked ? victim : owner);
  updateHud();
}

function updateProjectiles(dt) {
  for (const projectile of state.projectiles) {
    projectile.lifeFrames -= 1;
    projectile.armFrames = Math.max(0, (projectile.armFrames || 0) - 1);
    projectile.x += projectile.vx * dt;
    if (projectile.lifeFrames <= 0
      || projectile.x < MOVEMENT_RULES.stageMinX - 160
      || projectile.x > MOVEMENT_RULES.stageMaxX + 160) continue;
    if (projectile.armFrames > 0) continue;
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
  victim.vy = -315 * style.drop;
  victim.x = clamp(
    attacker.x + direction * style.offset,
    MOVEMENT_RULES.stageMinX,
    MOVEMENT_RULES.stageMaxX,
  );
  victim.hitFlash = 0.16;
  attacker.combo.reset();
  attacker.meter = clamp(attacker.meter + grab.meter * GRIT_RULES.hitGainMultiplier, 0, GRIT_RULES.maximum);
  victim.meter = clamp(victim.meter + grab.meter * GRIT_RULES.damageTakenGainMultiplier, 0, GRIT_RULES.maximum);
  state.shake = Math.max(state.shake, style.shake);
  state.hitstop = Math.max(state.hitstop, 0.11);
  state.lastImpactSide = attacker.side;
  const impactX = victim.x;
  const impactY = FLOOR - 60;
  spawnHit(impactX, impactY, attacker.def, "throw", false);
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
  spawnHit(impact.x, impact.y, counterFighter.def, "special", false);
  state.effects.push({ kind: "counterPunch", x: impact.x, y: impact.y, life: 0.62, max: 0.62, color: counterFighter.def.accent });
  spawnCombatText(impact.x, impact.y - 128, "COUNTER-PUNCH!", counterFighter.def.accent);
  state.hitstop = Math.max(state.hitstop, 0.16);
  state.shake = Math.max(state.shake, 0.42);
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
      victim.vy = attack.level === ATTACK_LEVELS.THROW ? -315
        : attack.launchVelocityY || -220 - attack.damage * 3;
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
  attacker.meter = clamp(attacker.meter + attack.meter * GRIT_RULES.hitGainMultiplier, 0, GRIT_RULES.maximum);
  victim.meter = clamp(victim.meter + attack.meter * GRIT_RULES.damageTakenGainMultiplier, 0, GRIT_RULES.maximum);
  state.shake = Math.max(state.shake, attack.kind === "special" || attack.kind === "throw" ? 0.34 : 0.13);
  state.hitstop = Math.max(state.hitstop, blocked ? 0.035 : attack.kind === "special" || attack.kind === "throw" ? 0.105 : attack.kind === "heavy" ? 0.075 : 0.045);
  const impact = collision?.point || { x: victim.x - attacker.facing * 22, y: victim.y - 105 };
  spawnHit(impact.x, impact.y, attacker.def, attack.kind, blocked);
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
  announce("FINISH THEM", "ANY BUTTON  ·  LP/LK = A  ·  HP/HK = B", 2.2);
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
    const juggleLimit = attacker.attacking.juggleLimit || COMBO_RULES.juggleLimit;
    if ((!victim.grounded || victim.pendingKnockdown) && victim.juggleCount >= juggleLimit) return null;
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

function spawnHit(x, y, def, attackKind, blocked) {
  const baseCount = blocked ? 9 : attackKind === "special" ? 28 : attackKind === "heavy" ? 18 : 12;
  const count = Math.max(3, Math.round(baseCount * state.performance.particleScale));
  for (let i = 0; i < count; i += 1) {
    const angle = visualRandom() * Math.PI * 2;
    const speed = 90 + visualRandom() * 310;
    state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.18 + visualRandom() * 0.34, max: 0.55, size: 2 + visualRandom() * 6, color: visualRandom() > 0.34 ? def.accent : def.color });
  }
  state.effects.push({ kind: blocked ? "guard" : "hit", style: def.vfx, attackKind, x, y, life: attackKind === "special" ? 0.42 : 0.28, max: attackKind === "special" ? 0.42 : 0.28, color: def.accent });
}

function separateFighters() {
  const [a, b] = state.fighters;
  if (!a || !b) return;
  if (a.grabbing || b.grabbing || a.grabbed || b.grabbed) return;
  if (a.attacking?.ignorePushbox || b.attacking?.ignorePushbox) return;
  if ((!a.grounded && a.y < FLOOR - 34) || (!b.grounded && b.y < FLOOR - 34)) return;
  const positions = resolvePushboxPositions(
    {
      x: a.x,
      side: a.side,
      halfWidth: a.crouch ? a.movement.crouchingPushboxHalfWidth : a.movement.standingPushboxHalfWidth,
    },
    {
      x: b.x,
      side: b.side,
      halfWidth: b.crouch ? b.movement.crouchingPushboxHalfWidth : b.movement.standingPushboxHalfWidth,
    },
  );
  a.x = positions.aX;
  b.x = positions.bX;
}

function updateFacings() {
  const [a, b] = state.fighters;
  if (!a || !b || state.finisher) return;
  if (a.grabbing || b.grabbing || a.grabbed || b.grabbed) return;
  if (!a.attacking || !a.grounded) a.facing = b.x >= a.x ? 1 : -1;
  if (!b.attacking || !b.grounded) b.facing = a.x >= b.x ? 1 : -1;
}

function resolveFighterState(fighter) {
  if (state.finisher) return FIGHTER_STATES.FINISHER;
  if (fighter.down || fighter.knockdownFrames > 0) return FIGHTER_STATES.KNOCKDOWN;
  if (fighter.wakeupFrames > 0) return FIGHTER_STATES.WAKEUP;
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
    if (state.phaseTime <= 0) state.phase = "fight";
  }

  input0 = prepareFighterInput(state.fighters[0], input0);
  input1 = prepareFighterInput(state.fighters[1], input1);

  updateFighter(state.fighters[0], state.fighters[1], input0, dt);
  updateFighter(state.fighters[1], state.fighters[0], input1, dt);
  updateGrabHolds();
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
    particle.vy += 720 * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.985;
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
  let input0 = readQaInput(0)
    || (state.mode === "demo" ? aiInput(state.fighters[0], state.fighters[1], dt) : readInput(0));
  const trainingDummy = state.mode === "training"
    ? trainingDummyInput(state.training, state.simulationTick, {
      attackLevel: state.fighters[0]?.attacking?.level,
    })
    : null;
  let input1 = readQaInput(1)
    || (state.mode === "arcade" || state.mode === "demo" || (state.mode === "training" && trainingDummy === null)
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

  if (state.stage === "kensington") drawShufflers(time);
  else drawVetAtmosphere(time);

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

function drawShufflers(time) {
  const people = [
    { x: 155, y: 493, scale: 0.48, speed: 0.7 },
    { x: 540, y: 475, scale: 0.38, speed: 0.47 },
    { x: 1100, y: 492, scale: 0.52, speed: 0.58 },
  ];
  for (const person of people) {
    const drift = Math.sin(time * 0.00016 * person.speed + person.x) * 19;
    const sway = Math.sin(time * 0.0012 * person.speed + person.x) * 0.06;
    ctx.save();
    ctx.translate(person.x + drift, person.y);
    ctx.scale(person.scale, person.scale);
    ctx.rotate(sway);
    ctx.fillStyle = "rgba(5,7,10,.73)";
    ctx.beginPath();
    ctx.ellipse(0, -80, 24, 28, 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = "round";
    ctx.lineWidth = 28;
    ctx.strokeStyle = "rgba(5,7,10,.76)";
    ctx.beginPath();
    ctx.moveTo(-8, -60);
    ctx.lineTo(25, -10);
    ctx.lineTo(16, 55);
    ctx.stroke();
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(13, -34);
    ctx.lineTo(43, 22);
    ctx.moveTo(4, -34);
    ctx.lineTo(27, 28);
    ctx.moveTo(16, 48);
    ctx.lineTo(-2, 100);
    ctx.moveTo(22, 48);
    ctx.lineTo(43, 100);
    ctx.stroke();
    ctx.restore();
  }
  const trainX = ((time * 0.08) % (W + 650)) - 500;
  ctx.fillStyle = "rgba(18,31,40,.7)";
  ctx.fillRect(trainX, 154, 430, 58);
  for (let x = trainX + 24; x < trainX + 410; x += 53) {
    ctx.fillStyle = "rgba(255,211,105,.75)";
    ctx.fillRect(x, 166, 34, 22);
  }
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

function drawProjectiles(time) {
  for (const projectile of state.projectiles) {
    const direction = Math.sign(projectile.vx) || projectile.direction || 1;
    const life = clamp(projectile.lifeFrames / projectile.maxLifeFrames, 0, 1);
    const pulse = 1 + Math.sin(time * 0.018 + projectile.x * 0.03) * 0.11;
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.scale(direction, 1);
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
  const sizeAdjust = { deathblow: 1.08, jez: 1, alan: 1.08, post: 1.05, benny: 1.01, donald: 1.01, cyraxx: 1.02, ali: 1, commissioner: 1.02 }[fighter.def.id] || 1;
  const moveSheetAdjust = pose.bank === "specials"
    ? ({ deathblow: 1.14, jez: 1.03, alan: 1.06, post: 1.02, benny: 1.02, donald: 1.04, cyraxx: 1.05, ali: 1.04, commissioner: 1.02 }[fighter.def.id] || 1)
    : 1;
  const renderSize = 330 * sizeAdjust * moveSheetAdjust;
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

function drawParticles() {
  for (const particle of state.particles) {
    ctx.globalAlpha = clamp(particle.life / particle.max, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
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
    } else if (effect.kind === "hit") {
      const radius = (1 - alpha) * (effect.attackKind === "special" ? 120 : 68) + 18;
      ctx.lineWidth = (effect.attackKind === "special" ? 12 : 7) * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      const rays = effect.attackKind === "special" ? 12 : 8;
      for (let i = 0; i < rays; i += 1) {
        const angle = i * Math.PI * 2 / rays + (effect.style === "feedback" ? 0.18 : 0);
        const start = radius * 0.45;
        const end = radius * (effect.style === "seismic" && i % 2 ? 1.8 : 1.3);
        ctx.lineWidth = i % 2 ? 3 : 6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * start, Math.sin(angle) * start);
        ctx.lineTo(Math.cos(angle) * end, Math.sin(angle) * end);
        ctx.stroke();
      }
      if (["bass", "feedback", "voltage"].includes(effect.style)) {
        ctx.globalAlpha *= 0.65;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.45, radius * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
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
  const barHeight = 24 + Math.sin(clamp(progress * 2, 0, 1) * Math.PI * .5) * 17;
  const tint = ctx.createRadialGradient(W * .5, H * .48, 90, W * .5, H * .48, W * .72);
  tint.addColorStop(0, `${attacker.def.accent}16`);
  tint.addColorStop(1, "rgba(0,0,0,.22)");
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,.9)";
  ctx.fillRect(0, 0, W, barHeight);
  ctx.fillRect(0, H - barHeight, W, barHeight);
  ctx.fillStyle = attacker.def.accent;
  ctx.fillRect(0, barHeight - 3, W, 3);
  ctx.fillRect(0, H - barHeight, W, 3);

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
  if (!state.debug) return;
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

function draw(time) {
  ctx.save();
  const shakeScale = state.accessibility.reducedMotion ? 0 : state.accessibility.shakeScale;
  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 18 * shakeScale : 0;
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 12 * shakeScale : 0;
  ctx.translate(shakeX, shakeY);
  if (state.finisher) {
    ctx.translate(W * .5, H * .53);
    ctx.scale(state.cinematicZoom, state.cinematicZoom);
    ctx.translate(-W * .5, -H * .53);
  }
  drawStage(time);
  if (state.screen === "fight") {
    drawPaintTraps(time);
    drawProjectiles(time);
    const ordered = [...state.fighters].sort((a, b) => a.y - b.y);
    ordered.forEach((fighter) => drawFighter(fighter, time));
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

function setAiDifficulty(difficulty) {
  state.aiDifficulty = normalizeAiDifficulty(difficulty);
  localStorage.setItem("final-blow-ai-difficulty", state.aiDifficulty);
  const select = $("#aiDifficultySelect");
  if (select) select.value = state.aiDifficulty;
  for (const fighter of state.fighters) resetAiBrain(fighter.aiBrain, state.aiDifficulty);
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

function setPaused(paused) {
  if (state.screen !== "fight") return false;
  if (state.mode === "online" || state.mode === "demo") {
    state.paused = false;
    $("#pausePanel").hidden = true;
    return false;
  }
  state.paused = Boolean(paused);
  $("#pausePanel").hidden = !state.paused;
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
  sound("select");
});
window.addEventListener("gamepaddisconnected", () => {
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
  state.training.dummyMode = event.target.value;
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
$("#trainingResetButton").addEventListener("click", () => resetTrainingPosition(true));
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
  version: "1.1b-grapple-edition",
  simulationHz: SIMULATION_HZ,
  toggleDebug(enabled = !state.debug) {
    state.debug = Boolean(enabled);
    return state.debug;
  },
  snapshot() {
    return {
      tick: state.simulationTick,
      phase: state.phase,
      screen: state.screen,
      mode: state.mode,
      aiDifficulty: state.aiDifficulty,
      paused: state.paused,
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
    difficulty(difficulty = DEFAULT_AI_DIFFICULTY) {
      return setAiDifficulty(difficulty);
    },
    pause(paused = true) {
      return setPaused(paused);
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
    graphicFatality(id, type = 0, seconds = 4.7) {
      this.ready(id, type);
      state.graphicFatalities = true;
      $("#goreToggle").checked = true;
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
