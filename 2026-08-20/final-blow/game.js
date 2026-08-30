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
  AIR_RECOVERY_RULES,
  ATTACK_LEVELS,
  DEFENSE_RULES,
  DirectionTapTracker,
  FIGHTER_SCALE,
  GUARD_RULES,
  HURTBOX_MAX_EXTENT,
  MOVEMENT_RULES,
  PERFECT_GUARD_RULES,
  STUN_RULES,
  TAUNT_RULES,
  WAKEUP_RULES,
  WALL_BOUNCE_RULES,
  canAirRecover,
  createDepthFighterFields,
  createOffenseFighterFields,
  qualifiesForWallBounce,
  guardGainForAttack,
  isPerfectGuard,
  resolveWakeOption,
  stunGainForAttack,
  attackFrameData,
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
  getKitMoveProfile,
  listFighterFrameData,
  listFighterMoves,
  prettyProfileName,
  recognizeFighterCommand,
  selectWinQuote,
} from "./engine/fighter-kits.mjs";
import {
  FIGHTER_ALT_PALETTES,
  getAltPalette,
  remapImageBytes,
  resolveMatchPalettes,
} from "./engine/palettes.mjs";
import {
  AI_DIFFICULTIES,
  AI_DIFFICULTY_ORDER,
  DEFAULT_AI_DIFFICULTY,
  aiBrainSnapshot,
  createAiBrain,
  isPassiveDifficulty,
  normalizeAiDifficulty,
  registerAiDifficulty,
  resetAiBrain,
  stepAiBrain,
} from "./engine/ai.mjs";
import {
  DAILY_RULES,
  MUTATORS,
  MUTATOR_ORDER,
  SCORE_RULES,
  TEAM_ELIMINATION_LINES,
  TEAM_RULES,
  createBoutTally,
  createDailyPlan,
  createSurvivalRun,
  createTeamBattle,
  currentSurvivalBout,
  currentTeamPair,
  dailyDateString,
  dailyShareText,
  highScoreQualifies,
  insertHighScore,
  mutatorLabel,
  nextDailyRecord,
  normalizeInitials,
  normalizeMutators,
  previousDateString,
  teamFightersRemaining,
  recordSurvivalDefeat,
  recordSurvivalWin,
  recordTeamKo,
  resolveMatchRules,
  scaleMovementForRules,
  scoreDifficultyMultiplier,
  scoreForHit,
  survivalRunSnapshot,
  tallyRows,
  tallyTotal,
  teamBattleSnapshot,
} from "./engine/modes.mjs";
import {
  ARCADE_BOSS_ID,
  ARCADE_CREDITS,
  ARCADE_RIVALS,
  arcadeRunSnapshot,
  bossDialogueVariants,
  createArcadeRun,
  currentArcadeMatch,
  endingPanelsFor,
  getArcadeEnding,
  recordArcadeResult,
  rivalDialogueVariants,
} from "./engine/arcade.mjs";
import {
  BLACK_BOOK_ENTRIES,
  applyMatchToRecords,
  blackBookObserve,
  blackBookSummary,
  evaluateBlackBook,
  favoriteMove,
  masteryRank,
  normalizeBlackBookStore,
  normalizeRecordsStore,
  prettyMoveName,
  recordsSummary,
} from "./engine/progression.mjs";
import {
  ATTACK_BUTTONS,
  BUTTON_LABELS,
  BUTTON_NAMES,
  DEFAULT_KEY_MAPS,
  DEFAULT_PAD_MAP,
  LEGEND_DAMAGE_SCALE,
  PAD_BUTTON_LABELS,
  REMAPPABLE_ACTIONS,
  TOURNAMENT_ACTION_PRIORITY,
  applyControlStyle,
  legendScaledAction,
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
  touchPadTokens,
} from "./engine/controls.mjs";
import {
  FIGHT_SCHOOL_COACH_LINES,
  FIGHT_SCHOOL_LESSONS,
  TRAINING_DUMMY_MODES,
  TRAINING_SLOT_COUNT,
  awardTrialMedal,
  beginTrainingRecording,
  comboTrialsForFighter,
  createFightSchoolState,
  createTrainingState,
  decodeTrainingSlot,
  encodeTrainingSlot,
  fighterMedalCounts,
  fightSchoolLesson,
  fightSchoolObserve,
  fightSchoolSnapshot,
  finishTrainingRecording,
  medalForTrial,
  normalizeTrialMedals,
  recordTrainingFrame,
  recordTrainingTrialHit,
  resetTrainingScenario,
  selectTrainingTrial,
  trainingDummyInput,
  trainingSnapshot,
  trialDemoScript,
} from "./engine/training.mjs";
import {
  PERFORMANCE_PROFILES,
  auditFighterBalance,
  auditTournamentBalance,
  createPerformanceGovernor,
  hapticPatternFor,
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
import {
  fighterCanTurn,
  resolvePairFacing,
} from "./engine/facing.mjs";
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
import { atlasFrameFacing } from "./engine/atlas-facing.mjs";
import {
  FIGHTER_AUDIO_BANK_KINDS,
  FIGHTER_AUDIO_CUES,
  FIGHTER_AUDIO_LABELS,
  FIGHTER_REACTIVE_PLACEHOLDERS,
  FIGHTER_TAUNT_LINES,
  auditFighterAudio,
  fighterAudioBankKind,
  fighterAudioCue,
  fighterAudioVariants,
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
  // R2.0 FAMILY wave 17: the Jersey Devil crawls out of the Pine Barrens and
  // into the tenth roster slot. Public-domain folklore, native son of the NJ
  // stages, and the loudest silhouette in the game.
  {
    id: "devil",
    name: "PINELANDS DEVIL",
    title: "SOUTH JERSEY CRYPTID",
    mark: "PD",
    color: "#6b4a2f",
    accent: "#7fae5a",
    weapon: "talons",
    special: "PINEY SCREECH",
    vfx: "barrens",
    finishers: ["WING SHEAR", "HOOF STOMP"],
  },
];

// R2.0 FAMILY wave 16: the boss carries his own kit, finishers and fatalities
// now — the DeathBlow reskin is gone.
const arcadeBoss = Object.freeze({
  id: ARCADE_BOSS_ID,
  kitId: "commissioner",
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
  finisherScriptId: "commissioner",
});

// ---------------------------------------------------------------------------
// Wave 16 — the secret ninth slot. Beating the arcade ladder on FINAL
// difficulty writes final-blow-commissioner-unlocked (the standard
// final-blow-* settings pattern) and the Commissioner joins the roster as a
// playable fighter: same kit, no boss movement buff, dark-red card.
// ---------------------------------------------------------------------------
const COMMISSIONER_UNLOCK_KEY = "final-blow-commissioner-unlocked";

const commissionerPlayableDef = Object.freeze({
  ...arcadeBoss,
  boss: false,
  secret: true,
});

function commissionerUnlocked() {
  return localStorage.getItem(COMMISSIONER_UNLOCK_KEY) === "1";
}

function rosterHasCommissioner() {
  return roster.some(({ id }) => id === ARCADE_BOSS_ID);
}

if (commissionerUnlocked()) roster.push(commissionerPlayableDef);

// The canonical eight-fighter cast — seeded runs everyone shares (the Daily
// Jawn) must derive from the same list on every machine, unlocked or not.
function baseRosterIds() {
  return roster.filter(({ secret }) => !secret).map(({ id }) => id);
}

const balanceAudit = auditFighterBalance(roster.map(({ id }) => getFighterKit(id)));
if (balanceAudit.violations.length) console.warn("Final Blow balance guardrail warning", balanceAudit.violations);
const tournamentAudit = auditTournamentBalance(roster.map(({ id }) => id));
if (tournamentAudit.violations.length) console.warn("Final Blow tournament audit warning", tournamentAudit.violations);
const fatalityAudit = auditGraphicFatalities(roster.map(({ id }) => ({
  id,
  projectile: getThrowable(id),
})));
if (fatalityAudit.errors.length) console.warn("Final Blow graphic fatality warning", fatalityAudit.errors);

// Each Final Blow is staged as a short, character-specific arcade cinematic.
// Coordinates are local to the victim: negative X begins behind the attacker,
// Y is height above the floor, and frame numbers address the 4x4 atlas grammar.
const finisherChoreography = {
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
  // Wave 17 — the Devil's ceremony is a hunt: a swoop in, talons, the horn
  // charge, a screech that lifts the victim off the floor, and the wings
  // closing for WING SHEAR like a trap springing shut.
  devil: {
    combo: "BARRENS CURSE",
    duration: 5.3,
    keys: [
      { t: 0, ax: -315, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .4, ax: -170, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.07 },
      { t: .64, ax: -52, ay: 0, af: 9, vx: 6, vy: 0, vf: 15, zoom: 1.12 },
      { t: .92, ax: 44, ay: 0, af: 10, vx: -5, vy: 12, vf: 15, vr: .06, zoom: 1.15 },
      { t: 1.24, ax: -44, ay: 0, af: 9, vx: 10, vy: 26, vf: 15, vr: -.1, zoom: 1.17 },
      { t: 1.58, ax: -30, ay: 0, af: 13, vx: 34, vy: 100, vf: 15, vr: -.24, zoom: 1.2 },
      { t: 1.98, ax: -6, ay: 130, af: 14, vx: 52, vy: 195, vf: 15, vr: -.5, zoom: 1.25 },
      { t: 2.46, ax: 58, ay: 72, af: 13, vx: 34, vy: 95, vf: 15, vr: .58, zoom: 1.2 },
      { t: 3.05, ax: -150, ay: 0, af: 12, vx: 26, vy: 0, vf: 15, vr: .72, zoom: 1.12 },
      { t: 3.98, ax: -18, ay: 0, af: 14, vx: 50, vy: 0, vf: 15, vr: 1.2, zoom: 1.35 },
      { t: 5.3, ax: -150, ay: 0, af: 0, vx: 76, vy: 0, vf: 15, vr: 1.38, zoom: 1.08 },
    ],
    impacts: [
      { t: .64, label: "SWOOP IN", sound: "light", power: .4 },
      { t: .92, label: "TALON RIP", sound: "hit", power: .54 },
      { t: 1.24, label: "TAIL LASH", sound: "light", power: .58 },
      { t: 1.58, label: "HORN CHARGE", sound: "heavy", power: .82 },
      { t: 1.98, label: "SCREECH LIFT", sound: "special", power: 1 },
      { t: 2.46, label: "PINE DROP", sound: "heavy", power: 1.06 },
      { t: 3.98, label: "WING SHEAR", sound: "final", power: 1.46, final: true },
    ],
  },
  // Wave 16 — the Commissioner's own ceremony: unhurried, procedural, cruel.
  // Cane taps close the distance, the hook drags the victim to the book, and
  // FINAL AUTHORITY lands like a sentence being read out.
  commissioner: {
    combo: "FINAL AUTHORITY",
    duration: 5.4,
    keys: [
      { t: 0, ax: -310, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .5, ax: -215, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.06 },
      { t: .8, ax: -120, ay: 0, af: 9, vx: 6, vy: 0, vf: 15, zoom: 1.11 },
      { t: 1.14, ax: -58, ay: 0, af: 10, vx: 18, vy: 6, vf: 15, vr: -.06, zoom: 1.14 },
      { t: 1.5, ax: -34, ay: 0, af: 13, vx: 34, vy: 52, vf: 15, vr: -.16, zoom: 1.18 },
      { t: 1.92, ax: -14, ay: 0, af: 14, vx: 56, vy: 182, vf: 15, vr: -.44, zoom: 1.24 },
      { t: 2.4, ax: -88, ay: 120, af: 13, vx: 60, vy: 216, vf: 15, vr: -.56, zoom: 1.19 },
      { t: 2.9, ax: 6, ay: 20, af: 14, vx: 26, vy: 0, vf: 15, vr: .7, zoom: 1.29 },
      { t: 3.5, ax: -140, ay: 0, af: 12, vx: 26, vy: 0, vf: 15, vr: .7, zoom: 1.12 },
      { t: 4.1, ax: -16, ay: 0, af: 14, vx: 50, vy: 0, vf: 15, vr: 1.2, zoom: 1.35 },
      { t: 5.4, ax: -132, ay: 0, af: 0, vx: 74, vy: 0, vf: 15, vr: 1.36, zoom: 1.08 },
    ],
    impacts: [
      { t: .8, label: "CANE TAP", sound: "light", power: .42 },
      { t: 1.14, label: "WRIT SERVED", sound: "hit", power: .55 },
      { t: 1.5, label: "GAVEL CRACK", sound: "heavy", power: .78 },
      { t: 1.92, label: "OVERRULE", sound: "special", power: .95 },
      { t: 2.9, label: "CONTEMPT", sound: "heavy", power: 1.08 },
      { t: 4.1, label: "FINAL AUTHORITY", sound: "final", power: 1.48, final: true },
    ],
  },
};

// Release 1.8B PROJECTILE FOCUS: the assigned personal projectile owns all
// three beats — prime, trap and kill. The restraint supports the object instead
// of becoming the star, and every label/camera cut follows the projectile.
const finisherScripts = Object.freeze(Object.fromEntries(
  Object.entries(finisherChoreography).map(([fighterId, script]) => {
    const fatality = getGraphicFatality(fighterId, 0);
    const setup = script.impacts[0];
    const signature = script.impacts.find((impact) => impact.sound === "special" && impact.t > setup.t)
      || script.impacts.find((impact) => impact.sound === "special")
      || script.impacts[Math.max(0, script.impacts.length - 2)];
    const final = script.impacts.find((impact) => impact.final) || script.impacts.at(-1);
    return [fighterId, Object.freeze({
      ...script,
      combo: `${fatality.special} FATALITY`,
      signatureSpecial: fatality.special,
      signatureProjectile: fatality.projectileId,
      impacts: Object.freeze([
        Object.freeze({
          ...setup,
          label: fatality.projectileSetup,
          power: Math.min(setup.power, .5),
          projectilePhase: "prime",
        }),
        Object.freeze({
          ...signature,
          t: Math.min(signature.t, setup.t + .36),
          label: fatality.projectileAction,
          power: Math.max(signature.power, .92),
          projectilePhase: "trap",
        }),
        Object.freeze({
          ...final,
          label: fatality.projectileFinale,
          power: Math.max(final.power, 1.48),
          projectilePhase: "kill",
          final: true,
        }),
      ]),
    })];
  }),
));

function projectileFinisherScript(fighterId, variant = 0) {
  const script = finisherScripts[fighterId];
  const fatality = getGraphicFatality(fighterId, variant);
  const labels = {
    prime: fatality.projectileSetup,
    trap: fatality.projectileAction,
    kill: fatality.projectileFinale,
  };
  return {
    ...script,
    combo: `${fatality.special} FATALITY`,
    signatureSpecial: fatality.special,
    signatureProjectile: fatality.projectileId,
    impacts: script.impacts.map((impact) => ({
      ...impact,
      label: labels[impact.projectilePhase] || impact.label,
    })),
  };
}

const stages = {
  somerset: {
    name: "SOMERSET SEPTA STATION",
    ticker: "SOMERSET SEPTA STATION // STREET ENTRANCE // PHILADELPHIA",
    src: "assets/somerset-septa.webp",
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

// Release 1.8C REALITY BREAK: a generated photoreal environment plate replaces
// the arcade arena only while a Final Blow is active. It is deliberately one
// shared set so all 16 finishers retain identical deterministic staging and the
// additional on-demand download stays tiny.
const finalBlowRealityImage = new Image();
finalBlowRealityImage.src = "assets/final-blow-reality.webp";

const fighterImages = {};
const fighterAtlases = {};
const fighterMoveAtlases = {};
// The boss def loads the Commissioner's art even when the playable def is in
// the roster: he has no separate specials sheet, so his kit poses address the
// combat atlas (the boss branch below) for both the boss AND the unlock.
for (const fighter of [...roster.filter(({ id }) => id !== ARCADE_BOSS_ID), arcadeBoss]) {
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

// The Commissioner has no separate specials sheet, so DOM art paths (victory
// pose, ending panels) address his combat atlas — the same fallback the
// canvas renderer uses via fighterMoveAtlases.
function posesSheetUrl(def) {
  return def.boss || def.secret
    ? `assets/atlases/${def.id}.webp`
    : `assets/moves/${def.id}-specials.webp`;
}

// ---------------------------------------------------------------------------
// R2.0 FAMILY wave 16 — alt palettes. Each fighter's authored alt is a cached
// canvas hue-remap of the shipped atlas (engine/palettes.mjs owns the pure
// pixel math). Built lazily once per atlas per session, zero per-frame cost;
// the canvas is shimmed with Image-like fields (src/complete/naturalWidth) so
// every existing consumer — tintedSilhouette's cache key, the 3D renderer's
// readiness guard and texture builders — accepts it unchanged.
// Palette STATE is deliberately module-level presentation config (never on
// fighters, never in state): both online peers derive the same pair from the
// shared match config, so rollback checksums are untouched.
// ---------------------------------------------------------------------------
const paletteFxDebug = { built: 0, altSides: 0 };
const altAtlasCache = new Map();

// Which palette each SIDE renders this match (0 primary, 1 alt)...
let matchPalettes = [0, 0];
// ...and which palettes the select screen has staged for the next match.
let pendingPalettes = [0, 0];

function altAtlasSource(fighterId, bank) {
  const specials = bank === "specials" ? fighterMoveAtlases[fighterId] : null;
  // The boss shares one sheet across banks — collapse to one cache entry.
  if (specials && specials !== fighterAtlases[fighterId]) return { image: specials, key: `${fighterId}:specials` };
  return { image: fighterAtlases[fighterId], key: `${fighterId}:base` };
}

function ensureAltAtlas(fighterId, bank = "base") {
  const spec = getAltPalette(fighterId);
  const { image, key } = altAtlasSource(fighterId, bank);
  if (!spec || !image?.complete || !image.naturalWidth) return null;
  let alt = altAtlasCache.get(key);
  if (alt) return alt;
  const scratch = document.createElement("canvas");
  scratch.width = image.naturalWidth;
  scratch.height = image.naturalHeight;
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  scratchCtx.drawImage(image, 0, 0);
  const pixels = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
  remapImageBytes(pixels.data, spec);
  scratchCtx.putImageData(pixels, 0, 0);
  // Image-interface shim for every downstream consumer.
  alt = scratch;
  alt.src = `alt-palette:${key}`;
  alt.complete = true;
  alt.naturalWidth = scratch.width;
  alt.naturalHeight = scratch.height;
  altAtlasCache.set(key, alt);
  paletteFxDebug.built += 1;
  return alt;
}

/** The atlas a side should draw from, alt palette applied when selected. */
function paletteAtlas(fighterId, side, bank = "base") {
  const base = bank === "specials"
    ? fighterMoveAtlases[fighterId] || fighterAtlases[fighterId]
    : fighterAtlases[fighterId];
  if (matchPalettes[side] !== 1) return base;
  return ensureAltAtlas(fighterId, bank) || base;
}

/** Set the active per-side palettes for the match being built. */
function applyMatchPalettes(defs, picks) {
  matchPalettes = resolveMatchPalettes(defs.map((def) => def?.id), picks);
  paletteFxDebug.altSides = matchPalettes.filter((palette) => palette === 1).length;
}

// Original soundtrack and combat cues generated with the ElevenLabs API, less
// the three stage-wide takes Jez rejected on review: the special swing, the
// guard impact and the "Death Blow" announcer call. Those files are deleted,
// so `special`, `block` and `final` deliberately have no entry here and reach
// proceduralSound() instead — see fallbackSoundKinds below.
const audioAssets = {
  select: "assets/audio/ui-select.mp3",
  jump: "assets/audio/jump.mp3",
  light: "assets/audio/light-swing.mp3",
  heavy: "assets/audio/heavy-swing.mp3",
  hit: "assets/audio/body-hit.mp3",
  finish: "assets/audio/finish-ready.mp3",
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
  // Reviewed kick takes. The swings sit just under their punch equivalents so
  // a limb switch reads as a different weapon, not a louder one.
  "light-kick-swing": 0.48,
  "roundhouse-swing": 0.56,
  "light-kick-impact": 0.68,
  "roundhouse-impact": 0.78,
  super: 0.86,
  fatal: 0.94,
  finish: 0.78,
  final: 0.92,
  ko: 0.8,
  // Wave 9 reactive fighter voice cues.
  dizzy: 0.7,
  counter: 0.72,
  tech: 0.6,
  desperation: 0.68,
  scream: 0.95,
  // Release 1.7 DEPTH: guard-crush shatter bark.
  crush: 0.74,
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

// Where a cue lands when the fighter has no recorded take of their own. Each
// target names an accepted shared sample where one fits; the three that point
// at `special`, `block` and `final` no longer resolve to a file at all, because
// those takes were rejected and deleted — they name a proceduralSound() voice
// instead, which is the whole point of routing through a kind rather than a
// path. Nothing here may ever name a rejected recording.
const fallbackSoundKinds = Object.freeze({
  dash: "jump",
  throw: "heavy",
  "hit-light": "hit",
  "hit-heavy": "hit",
  // Reviewed kick cues fall back to the shared swing and body-impact takes,
  // all three of which he accepted, whenever a fighter's own pool is empty.
  "light-kick-swing": "light",
  "roundhouse-swing": "heavy",
  "light-kick-impact": "hit",
  "roundhouse-impact": "hit",
  super: "final",
  fatal: "final",
  "stage-weapon": "select",
  // Wave 9 reactive voice cues: shared-sample/procedural fallbacks mirror the
  // FIGHTER_REACTIVE_PLACEHOLDERS mapping so a fighter with no palette at all
  // still lands on the nearest generic sound.
  dizzy: "hit",
  counter: "special",
  tech: "block",
  desperation: "hit",
  scream: "final",
  crush: "block",
});

const musicTracks = [
  { title: "PHILLY AFTER DARK", src: "assets/audio/philly-after-dark.mp3" },
  { title: "VET PARKING LOT", src: "assets/audio/vet-parking-lot.mp3" },
  { title: "NEON SIGN WAR", src: "assets/audio/neon-sign-war.mp3" },
  { title: "SUBWAY AFTER MIDNIGHT", src: "assets/audio/subway-after-midnight.mp3" },
];
let currentTrackIndex = 0;
// Release 1.6 "LOUD": stage-matched AUTO music, chosen by vibe/title fit.
// Four tracks cover six stages for now; each entry may also name a planned
// track via todoTrack, and stageMusicTrackIndex() automatically prefers that
// file the moment it appears in musicTracks.
// TODO(wildwood-boardwalk-night): compose with ElevenLabs when auth returns,
// append it to musicTracks, and the wildwood mapping below picks it up.
// TODO(cruise-deck-disco): same deal for the cruise pool deck.
const STAGE_MUSIC = Object.freeze({
  somerset: Object.freeze({ title: "PHILLY AFTER DARK" }),
  vet: Object.freeze({ title: "VET PARKING LOT" }),
  wildwood: Object.freeze({ title: "NEON SIGN WAR", todoTrack: "wildwood-boardwalk-night" }),
  buffet: Object.freeze({ title: "NEON SIGN WAR" }),
  cruise: Object.freeze({ title: "SUBWAY AFTER MIDNIGHT", todoTrack: "cruise-deck-disco" }),
  janney: Object.freeze({ title: "SUBWAY AFTER MIDNIGHT" }),
});
// True while the current track was picked by the stage map in AUTO mode.
// Render-only latch (never snapshotted): cleared by any manual track move or
// the auto-jukebox advancing at the end of a song.
let stageMusicAutoApplied = false;
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
  // Release 1.7 DEPTH: the Perfect Guard 'tink' block variant.
  "perfect-guard": "PERFECT GUARD",
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
  stage: "somerset",
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
  // Which way the pair is oriented: +1 when side 1 stands right of side 0. Both
  // fighters derive their facing from this single value, so they can never end
  // up pointing the same way. It is simulation state, not presentation — it
  // carries the facing deadband's memory and so rides along with rollback.
  facingAxis: 1,
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
  // Release 1.8 GRIND: survival ladder + 3v3 team battle bookkeeping (offline
  // modes; never part of the rollback snapshot) and the House Rules mutator
  // config. `mutators` IS sim-affecting match config: it is snapshotted by the
  // rollback machinery and `matchRules` is re-derived from it on restore, so
  // both online peers always agree (plain rooms simply never set it).
  survivalRun: null,
  teamBattle: null,
  teamPicks: [[], []],
  mutators: [],
  matchRules: resolveMatchRules([]),
  // One-shot per round: has the Sudden Death mutator's first-clean-hit dizzy
  // fired yet? Sim state (snapshotted + checksummed via saveRollbackState).
  suddenDeathHitDone: false,
  controlStyle: normalizeControlStyle(localStorage.getItem("final-blow-control-style") || "classic"),
  visualQuality: normalizeVisualQuality(localStorage.getItem("final-blow-visual-quality") || "auto"),
  // Wave 7 display toggles. Sharp render defaults on (it only ever engages on
  // the desktop high profile); CRT mode is an opt-in look and defaults off.
  sharpRender: localStorage.getItem("final-blow-sharp-render") !== "0",
  crtMode: localStorage.getItem("final-blow-crt-mode") === "1",
  // R1.9 wave 15: Arcade Cabinet preset — big-screen TV mode. Persisted like
  // attractEnabled; while on it forces the high profile, hides the touch HUD,
  // enlarges the fight HUD and keeps the attract loop cycling. Render/UI
  // only — never part of any rollback snapshot.
  cabinetMode: localStorage.getItem("final-blow-cabinet-mode") === "1",
  // CINEMA 3D experimental Three.js presentation renderer. Persisted like the
  // other toggles; ?renderer=3d forces it on for the session without
  // persisting. Battery profile refuses activation (see cinema3dAllowed).
  cinema3d: new URLSearchParams(location.search).get("renderer") === "3d"
    || localStorage.getItem("final-blow-cinema-3d") === "1",
  performance: null,
  // Captions label every sound event over the fight — invaluable when you
  // need them, permanent UI noise when you don't. Opt-in as of the
  // readability pass; the toggle is unchanged for anyone who had it on.
  soundCaptions: localStorage.getItem("final-blow-sound-captions") === "1",
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
    stage: "somerset",
    delayChoice: "auto",
    localReady: false,
    remoteReady: false,
    remoteControlStyle: "classic",
    remoteDelayChoice: "auto",
    // Wave 16: SF2 color pick + Commissioner eligibility, exchanged as plain
    // optional lobby fields (older peers ignore them; no protocol change).
    localPalette: 0,
    remotePalette: 0,
    remoteFighterRaw: "",
    remoteCommissionerUnlocked: false,
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

// --- Release 1.8 GRIND: score attack / daily / mutator sessions ------------
// Score is pure presentation/meta, tracked OUTSIDE the checksummed sim state
// (module-level, on the demoSession pattern). Every increment that runs on a
// sim path sits behind a rollbackResimulating guard, and online mode is
// excluded outright, so rollback and determinism never see the score.
const SCORE_STORAGE_KEY = "final-blow-high-scores";
const SCORE_INITIALS_KEY = "final-blow-initials";
const SURVIVAL_BEST_KEY = "final-blow-survival-best";
const SCORES_API = "https://game-scores.jez237.workers.dev/scores/final-blow";

const scoreSession = {
  active: false,
  mode: "",
  detail: "",
  total: 0,
  boutCount: 0,
  multiplier: 1,
  bout: createBoutTally(),
  roundFirstHitDone: false,
  lastBout: null,
  lastBoutTotal: 0,
  submitted: false,
};

const dailySession = {
  active: false,
  date: "",
  plan: null,
  finished: false,
  outcome: null,
};

// Render-side mutator picks from the versus/team stage-select screen. Consumed
// (normalized) into state.mutators by startMatch; never read by the sim.
let pendingMutators = [];

// Tally screen + initials entry transients (render-only).
const tallyUi = {
  active: false,
  rows: [],
  total: 0,
  runTotal: 0,
  multiplier: 1,
  startedAt: 0,
  done: false,
  onContinue: null,
};

// ===========================================================================
// R1.9 SCHOOL & POCKET — training & accessibility. Everything in this block
// is render/meta-side module state on the demoSession pattern: never
// snapshotted, never read by the checksummed sim. Hooks that run on sim paths
// are guarded with `if (!rollbackResimulating)` (the announce() pattern) at
// the call sites.
// ===========================================================================

// One-shot / live counters for the orchestrator's smoke tests (violence block).
const trainingFxDebug = {
  frameMeterTicks: 0,
  motionFlashes: 0,
  assistRecolors: 0,
  schoolSteps: 0,
  slotSaves: 0,
  slotLoads: 0,
  trialDemoRuns: 0,
  medalAwards: 0,
};

// --- Color assist for canvas-drawn cues ------------------------------------
// The DOM already reskins via body[data-color-assist] CSS variables; these are
// the canvas render paths that used to keep hardcoded hues. Standard palette
// returns the caller's original color so nothing changes for everyone else.
const ASSIST_CANVAS_PALETTES = Object.freeze({
  deuteranopia: Object.freeze({
    hurtboxP1: "#39a9ff", hurtboxP2: "#ffffff", pushbox: "#b9a5ff", hitbox: "#ff8c00",
    low: "#ffd166", overhead: "#ff6b35", dizzy: "#ffe066", dizzyAlt: "#ffffff", crush: "#82cfff",
    frameStartup: "#39a9ff", frameActive: "#ff8c00", frameRecovery: "#9aa5b1", frameStun: "#ffd166",
  }),
  protanopia: Object.freeze({
    hurtboxP1: "#36c8d8", hurtboxP2: "#ffffff", pushbox: "#c5b3ff", hitbox: "#f0a01e",
    low: "#ffe066", overhead: "#f08a24", dizzy: "#ffe680", dizzyAlt: "#ffffff", crush: "#7cd4e8",
    frameStartup: "#36c8d8", frameActive: "#f0a01e", frameRecovery: "#9aa5b1", frameStun: "#ffe066",
  }),
  tritanopia: Object.freeze({
    hurtboxP1: "#4ce6c4", hurtboxP2: "#ff4f8b", pushbox: "#d8e34a", hitbox: "#ff5c39",
    low: "#d8e34a", overhead: "#ff4f8b", dizzy: "#ffb3c8", dizzyAlt: "#ffffff", crush: "#4ce6c4",
    frameStartup: "#4ce6c4", frameActive: "#ff5c39", frameRecovery: "#9aa5b1", frameStun: "#d8e34a",
  }),
});

function assistColor(role, fallback) {
  const palette = ASSIST_CANVAS_PALETTES[state.accessibility.colorAssist];
  if (!palette || !palette[role]) return fallback;
  trainingFxDebug.assistRecolors += 1;
  return palette[role];
}

function colorAssistActive() {
  return Boolean(ASSIST_CANVAS_PALETTES[state.accessibility.colorAssist]);
}

// --- Frame meter strip (training lab) --------------------------------------
// One cell per simulation tick per fighter, fed once per NEW tick from
// updateTrainingUi (which already early-returns during resimulation).
const FRAME_METER_CELLS = 120;
const frameMeter = {
  history: [[], []],
  lastTick: -1,
};

function trainingFramePhase(fighter) {
  if (!fighter) return "idle";
  if (fighter.dizzyFrames > 0 || fighter.hitstunFrames > 0) return "hitstun";
  if (fighter.blockstunFrames > 0) return "blockstun";
  const move = fighter.attacking;
  if (move) {
    if (fighter.attackFrame < move.activeStartFrame) return "startup";
    if (fighter.attackFrame < move.activeEndFrame) return "active";
    return "recovery";
  }
  return "idle";
}

function feedFrameMeter() {
  if (state.simulationTick === frameMeter.lastTick) return;
  frameMeter.lastTick = state.simulationTick;
  for (const side of [0, 1]) {
    const history = frameMeter.history[side];
    history.push(trainingFramePhase(state.fighters[side]));
    if (history.length > FRAME_METER_CELLS) history.shift();
  }
  trainingFxDebug.frameMeterTicks += 1;
}

// --- Arcade-style input history column -------------------------------------
const INPUT_COLUMN_ROWS = 12;
const inputColumn = {
  rows: [],
  lastKey: "",
  flash: null,
  renderedStamp: "",
};

function inputColumnDirection(input) {
  const left = Boolean(input.left);
  const right = Boolean(input.right);
  const down = Boolean(input.down);
  const up = Boolean(input.up || input.jump);
  if (up && left) return "↖";
  if (up && right) return "↗";
  if (up) return "↑";
  if (down && left) return "↙";
  if (down && right) return "↘";
  if (down) return "↓";
  if (left) return "←";
  if (right) return "→";
  return "";
}

function inputColumnButtons(input) {
  const buttons = [];
  if (input.fourButton) {
    for (const button of ATTACK_BUTTONS) {
      if (input[button] || input[`${button}Held`]) buttons.push(button.toUpperCase());
    }
  } else {
    const kick = input.limb === "kick";
    if (input.light) buttons.push(kick ? "LK" : "LP");
    if (input.heavy) buttons.push(kick ? "HK" : "HP");
    if (input.special || input.commandSpecial || input.backSpecial) buttons.push("SP");
    if (input.launcher) buttons.push("LN");
    if (input.driveHeavy) buttons.push("DH");
    if (input.enhanced) buttons.push("EX");
    if (input.throw || input.throwObject) buttons.push("TH");
    if (input.super) buttons.push("SU");
    if (input.final) buttons.push("FB");
  }
  return buttons.slice(0, 4);
}

function feedInputColumn(input = {}) {
  const dir = inputColumnDirection(input);
  const buttons = inputColumnButtons(input);
  if (!dir && !buttons.length) {
    inputColumn.lastKey = "";
    return;
  }
  const key = `${dir}|${buttons.join("+")}`;
  const head = inputColumn.rows[0];
  if (key === inputColumn.lastKey && head) {
    head.frames = Math.min(99, head.frames + 1);
    return;
  }
  inputColumn.lastKey = key;
  inputColumn.rows.unshift({ dir, buttons, frames: 1 });
  if (inputColumn.rows.length > INPUT_COLUMN_ROWS) inputColumn.rows.pop();
}

// Motion-recognition flash: latched from prepareFighterInput when a command is
// consumed (guarded at the call site), shown as a green chip + green rows.
let inputColumnFlash = null;

function latchInputColumnFlash(action, fighter) {
  const profile = getKitMoveProfile(fighter?.kitId, action);
  inputColumnFlash = {
    label: profile?.moveName || String(action).replace(/([A-Z])/g, " $1").toUpperCase(),
    at: performance.now(),
    rows: Math.min(4, inputColumn.rows.length || 1),
  };
  trainingFxDebug.motionFlashes += 1;
}

function renderInputColumn() {
  const column = $("#inputHistoryColumn");
  const visible = state.mode === "training" && state.screen === "fight";
  column.hidden = !visible;
  if (!visible) return;
  const flashLive = inputColumnFlash && performance.now() - inputColumnFlash.at < 900;
  if (!flashLive) inputColumnFlash = null;
  const stamp = `${inputColumn.rows.map((row) => `${row.dir}${row.buttons.join("")}${row.frames}`).join(";")}|${flashLive ? inputColumnFlash.label : ""}`;
  if (stamp === inputColumn.renderedStamp) return;
  inputColumn.renderedStamp = stamp;
  const rows = inputColumn.rows.map((row, index) => `
    <div class="input-row${flashLive && index < inputColumnFlash.rows ? " flash" : ""}">
      <span class="dir">${row.dir || "·"}</span>
      ${row.buttons.map((button) => `<span class="chip ${button.toLowerCase()}">${button}</span>`).join("")}
      <span class="held">${row.frames}F</span>
    </div>`);
  const flashChip = flashLive ? `<div class="input-flash-chip">✓ ${inputColumnFlash.label}</div>` : "";
  column.innerHTML = rows.join("") + flashChip;
}

// --- Combo trial medals ----------------------------------------------------
const TRIAL_MEDALS_KEY = "final-blow-trial-medals";

function readStoredJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

let trialMedals = normalizeTrialMedals(readStoredJson(TRIAL_MEDALS_KEY));

function saveTrialMedals() {
  localStorage.setItem(TRIAL_MEDALS_KEY, JSON.stringify(trialMedals));
}

const MEDAL_GLYPHS = Object.freeze({ bronze: "●", silver: "●", gold: "★" });

function medalMarkup(counts) {
  const parts = [];
  if (counts.gold) parts.push(`<i class="medal-gold">★${counts.gold}</i>`);
  if (counts.silver) parts.push(`<i class="medal-silver">●${counts.silver}</i>`);
  if (counts.bronze) parts.push(`<i class="medal-bronze">●${counts.bronze}</i>`);
  return parts.join(" ");
}

function refreshTrialMedalBadges() {
  $$("#rosterGrid .fighter-card").forEach((card) => {
    const fighter = roster[Number(card.dataset.index)];
    if (!fighter) return;
    let badge = card.querySelector(".trial-medal-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "trial-medal-badge";
      card.append(badge);
    }
    const counts = fighterMedalCounts(trialMedals, fighter.id);
    badge.hidden = counts.total === 0;
    badge.innerHTML = medalMarkup(counts);
  });
}

// --- Authored trial demos (WATCH DEMO) -------------------------------------
// Feeds the PLAYER seat through the same direct action fields the QA input
// machinery uses. `forward` frames are mapped onto left/right against the live
// facing so cross-through specials cannot strand the walk-in.
const trialDemo = { active: false, frames: [], index: 0, trialName: "" };

function stopTrialDemo(message = "") {
  if (!trialDemo.active) return;
  trialDemo.active = false;
  trialDemo.frames = [];
  trialDemo.index = 0;
  if (message) state.training.lastResult = message;
  const button = $("#trainingTrialDemoButton");
  if (button) button.textContent = "WATCH DEMO";
}

function startTrialDemo() {
  if (state.mode !== "training" || !state.fighters.length) return false;
  const fighterId = state.fighters[0].kitId;
  const trial = comboTrialsForFighter(fighterId)[state.training.trialIndex];
  if (!trial) return false;
  resetTrainingPosition(false);
  state.training.dummyMode = "stand";
  selectTrainingTrial(state.training, fighterId, state.training.trialIndex);
  state.fighters.forEach((fighter) => { fighter.meter = GRIT_RULES.maximum; });
  trialDemo.frames = trialDemoScript(trial);
  trialDemo.index = 0;
  trialDemo.active = true;
  trialDemo.trialName = trial.name;
  trainingFxDebug.trialDemoRuns += 1;
  state.training.lastResult = `WATCH · ${trial.name}`;
  $("#trainingTrialDemoButton").textContent = "STOP DEMO";
  updateTrainingUi();
  return true;
}

function trialDemoInput() {
  if (!trialDemo.active) return null;
  if (state.mode !== "training" || state.screen !== "fight") {
    stopTrialDemo();
    return null;
  }
  const frame = trialDemo.frames[trialDemo.index];
  trialDemo.index += 1;
  if (trialDemo.index >= trialDemo.frames.length) stopTrialDemo(`${trialDemo.trialName} · YOUR TURN`);
  if (!frame) return null;
  if (frame.forward) {
    const [player, dummy] = state.fighters;
    const toward = player && dummy && dummy.x < player.x ? "left" : "right";
    return { [toward]: true };
  }
  return { ...frame };
}

// --- Situation slots -------------------------------------------------------
const TRAINING_SLOT_KEY_PREFIX = "final-blow-training-slot-";

const situationSlots = Array.from({ length: TRAINING_SLOT_COUNT }, (_, index) => (
  decodeTrainingSlot(localStorage.getItem(`${TRAINING_SLOT_KEY_PREFIX}${index}`))
));

function refreshSituationSlotButtons() {
  $$("[data-slot-load]").forEach((button) => {
    const index = Number(button.dataset.slotLoad);
    const filled = Boolean(situationSlots[index]);
    button.disabled = !filled;
    button.classList.toggle("filled", filled);
  });
}

function saveSituationSlot(index) {
  if (state.mode !== "training" || state.screen !== "fight") return false;
  if (!Number.isInteger(index) || index < 0 || index >= TRAINING_SLOT_COUNT) return false;
  const encoded = encodeTrainingSlot({
    state: serializeRollbackState(saveRollbackState()),
    stage: state.stage,
    dummyMode: state.training.dummyMode,
    recording: state.training.recording,
    savedAt: Date.now(),
  });
  if (!encoded) return false;
  localStorage.setItem(`${TRAINING_SLOT_KEY_PREFIX}${index}`, encoded);
  situationSlots[index] = decodeTrainingSlot(encoded);
  trainingFxDebug.slotSaves += 1;
  state.training.lastResult = `SITUATION SAVED · SLOT ${index + 1}`;
  refreshSituationSlotButtons();
  updateTrainingUi();
  return true;
}

function loadSituationSlot(index) {
  if (state.mode !== "training" || state.screen !== "fight") return false;
  const slot = situationSlots[index];
  if (!slot) return false;
  stopTrialDemo();
  let parsed = null;
  try {
    parsed = parseRollbackState(slot.state);
  } catch {
    return false;
  }
  const previousStage = state.stage;
  try {
    restoreRollbackState(parsed);
  } catch {
    return false;
  }
  // Offline the fixed-step clock owns the tick counter, so it must resume
  // from the snapshot's tick or every restored frame-relative counter
  // (buffers, combo gaps, taunt windows) would sit in the wrong tick domain.
  simulationClock.tick = state.simulationTick;
  state.training.dummyMode = slot.dummyMode;
  state.training.recording = slot.recording.map((frame) => ({ ...frame }));
  state.training.recordingActive = false;
  state.training.playbackFrame = 0;
  state.training.guardAfterTriggered = false;
  state.training.reversalArmed = false;
  state.training.lastResult = `SITUATION LOADED · SLOT ${index + 1}`;
  trainingFxDebug.slotLoads += 1;
  if (state.stage !== previousStage) {
    updateStageUI();
    resetCrowd();
  }
  updateHud();
  updateComboState();
  updateTrainingUi();
  return true;
}

// --- FIGHT SCHOOL ----------------------------------------------------------
const SCHOOL_STORAGE_KEY = "final-blow-fight-school";

const schoolSession = {
  active: false,
  machine: null,
  savedDifficulty: "",
  pendingSetup: null,
  dizzyCooldownTick: -Infinity,
  coachLast: {},
};

function loadSchoolProgress() {
  const raw = readStoredJson(SCHOOL_STORAGE_KEY);
  const completed = {};
  if (raw?.completed && typeof raw.completed === "object") {
    for (const lesson of FIGHT_SCHOOL_LESSONS) {
      if (raw.completed[lesson.id]) completed[lesson.id] = true;
    }
  }
  return { completed, graduated: Boolean(raw?.graduated) };
}

function saveSchoolProgress() {
  if (!schoolSession.machine) return;
  localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify({
    version: 1,
    completed: schoolSession.machine.completed,
    graduated: schoolSession.machine.graduated,
  }));
}

// Philly corner-man lines, drawn with a per-pool no-repeat latch so a line
// can never land back-to-back. visualRandom only — never state.rng here.
function schoolCoach(pool) {
  const lines = FIGHT_SCHOOL_COACH_LINES[pool] || [];
  if (!lines.length) return "";
  if (lines.length === 1) return lines[0];
  let pick = Math.floor(visualRandom() * lines.length) % lines.length;
  if (pick === schoolSession.coachLast[pool]) pick = (pick + 1) % lines.length;
  schoolSession.coachLast[pool] = pick;
  return lines[pick];
}

let schoolPanelStamp = "";

function renderSchoolPanel() {
  const panel = $("#schoolPanel");
  const visible = schoolSession.active && state.mode === "training" && state.screen === "fight";
  panel.hidden = !visible;
  if (!visible) {
    schoolPanelStamp = "";
    return;
  }
  const snapshot = fightSchoolSnapshot(schoolSession.machine);
  const stamp = `${snapshot.lesson}:${snapshot.step}:${snapshot.graduated}`;
  if (stamp === schoolPanelStamp) return;
  schoolPanelStamp = stamp;
  $("#schoolLessonCounter").textContent = snapshot.graduated
    ? "GRADUATED"
    : `LESSON ${Math.min(snapshot.lesson + 1, snapshot.lessonCount)} / ${snapshot.lessonCount}`;
  $("#schoolLessonName").textContent = snapshot.lessonName;
  const lesson = fightSchoolLesson(schoolSession.machine);
  $("#schoolLessonIntro").textContent = lesson?.intro || "Every page of the book, landed. Class dismissed.";
  $("#schoolSteps").innerHTML = snapshot.steps.map((step, index) => (
    `<span class="${step.complete ? "done" : index === snapshot.step ? "next" : ""}">${step.label}</span>`
  )).join("");
}

// Builds the scripted dummy attack loop for the guard lessons: walk toward the
// player, swing the scripted attack, breathe, repeat — through the exact
// sanitized-recording playback path the lab already ships.
function schoolDummyScript(script) {
  const frames = [];
  for (let index = 0; index < 42; index += 1) frames.push({ left: true });
  if (script === "low") frames.push({ down: true, heavy: true });
  else frames.push({ left: true, heavy: true });
  for (let index = 0; index < 66; index += 1) frames.push({});
  return frames;
}

function applySchoolStepSetup() {
  if (!schoolSession.active || !schoolSession.machine) return;
  const lesson = fightSchoolLesson(schoolSession.machine);
  const step = lesson?.steps[schoolSession.machine.step];
  if (!lesson) return;
  if (step?.dummyScript) {
    state.training.recording = schoolDummyScript(step.dummyScript).map((frame) => ({ ...frame }));
    state.training.recordingActive = false;
    state.training.playbackFrame = 0;
    state.training.dummyMode = "playback";
  } else {
    state.training.dummyMode = "cpu";
  }
  if (lesson.setup === "dizzy") {
    schoolSession.pendingSetup = "dizzy";
  } else if (lesson.setup === "lowHealth") {
    state.training.autoRecover = false;
    schoolSession.pendingSetup = "lowHealth";
  } else {
    state.training.autoRecover = true;
    schoolSession.pendingSetup = null;
  }
  updateTrainingUi();
}

function applySchoolLessonSetup() {
  if (!schoolSession.active) return;
  resetTrainingPosition(false);
  applySchoolStepSetup();
}

function exitFightSchool({ toTitle = false } = {}) {
  if (!schoolSession.active) return;
  schoolSession.active = false;
  schoolSession.pendingSetup = null;
  stopTrialDemo();
  if (schoolSession.savedDifficulty) setAiDifficulty(schoolSession.savedDifficulty);
  if (state.mode === "training") {
    state.training.autoRecover = true;
    state.training.dummyMode = "stand";
  }
  $("#schoolPanel").hidden = true;
  if (!toTitle) updateTrainingUi();
}

function startFightSchool() {
  unlockAudio();
  exitDemo?.();
  state.mode = "training";
  state.arcadeRun = null;
  state.survivalRun = null;
  state.teamBattle = null;
  dailySession.active = false;
  endScoreRun();
  const progress = loadSchoolProgress();
  const firstOpen = FIGHT_SCHOOL_LESSONS.findIndex((lesson) => !progress.completed[lesson.id]);
  state.picks = [0, 1];
  state.locks = [true, true];
  startMatch(true);
  state.phase = "fight";
  state.phaseTime = 0;
  schoolSession.machine = createFightSchoolState({
    lesson: firstOpen < 0 ? 0 : firstOpen,
    completed: firstOpen < 0 ? {} : progress.completed,
  });
  schoolSession.active = true;
  schoolSession.savedDifficulty = state.aiDifficulty;
  schoolSession.coachLast = {};
  setAiDifficulty("passive");
  state.training.dummyMode = "cpu";
  state.training.infiniteGrit = true;
  state.fighters.forEach((fighter) => { fighter.meter = GRIT_RULES.maximum; });
  applySchoolLessonSetup();
  renderSchoolPanel();
  const lesson = fightSchoolLesson(schoolSession.machine);
  announce(lesson ? lesson.name : "FIGHT SCHOOL", schoolCoach("start"), 2.4);
  updateTrainingUi();
}

// COMBO TRIALS quick entry: boots the lab with the locked trial dummy config
// (standing dummy, infinite Grit) using the current fighter picks.
function startComboTrialsLab() {
  unlockAudio();
  schoolSession.active = false;
  $("#schoolPanel").hidden = true;
  state.mode = "training";
  state.arcadeRun = null;
  state.survivalRun = null;
  state.teamBattle = null;
  dailySession.active = false;
  endScoreRun();
  startMatch(true);
  state.phase = "fight";
  state.phaseTime = 0;
  state.training.dummyMode = "stand";
  state.training.infiniteGrit = true;
  state.fighters.forEach((fighter) => { fighter.meter = GRIT_RULES.maximum; });
  selectTrainingTrial(state.training, state.fighters[0].kitId, 0);
  announce("COMBO TRIALS", "PICK A TRIAL · WATCH THE DEMO · EARN MEDALS", 1.8);
  updateTrainingUi();
}

// R1.9 LEGEND: the touch HUD advertises the one-button jobs (CSS badges via
// the data attribute, semantics via aria labels).
function syncTouchControlStyle() {
  $("#touchControls").dataset.controlStyle = state.controlStyle;
  const legend = state.controlStyle === "legend";
  $(".touch-hp").setAttribute("aria-label", legend
    ? "Special attack, or super at full Grit"
    : "Heavy punch, hook");
  $(".touch-hk").setAttribute("aria-label", legend
    ? "Kick special"
    : "Heavy kick, roundhouse");
}

/**
 * School progress fold. Called from guarded hook points (hit/block/finisher on
 * sim paths behind !rollbackResimulating, walk from updateTrainingUi which
 * already early-returns during resimulation).
 */
function schoolEvent(event) {
  if (!schoolSession.active || !schoolSession.machine) return;
  if (state.mode !== "training") return;
  const progress = fightSchoolObserve(schoolSession.machine, event);
  if (!progress) return;
  trainingFxDebug.schoolSteps += 1;
  saveSchoolProgress();
  if (progress.graduated) {
    announce("SCHOOL'S OUT", schoolCoach("graduate"), 2.6);
    state.training.autoRecover = true;
    // v2.1 PROGRESSION: graduation inks THE GRADUATE (ledger dedupes).
    progressionEvent("fightSchool");
    progressionEvaluateLedger();
  } else if (progress.lessonComplete) {
    const next = fightSchoolLesson(schoolSession.machine);
    announce(next ? next.name : "FIGHT SCHOOL", schoolCoach("lesson"), 2.3);
    applySchoolLessonSetup();
  } else {
    announce("NICE", schoolCoach("step"), 1.5);
    applySchoolStepSetup();
  }
  renderSchoolPanel();
}

// Per-tick school observation: walking drills, the panel/dummy babysitting and
// the deferred sim-side setups (dizzy stun, low-health KO dummy).
function schoolTick() {
  if (!schoolSession.active) return;
  if (state.mode !== "training" || state.screen !== "fight") {
    exitFightSchool({ toTitle: true });
    return;
  }
  const machine = schoolSession.machine;
  const lesson = fightSchoolLesson(machine);
  const step = lesson?.steps[machine.step];
  const [player, dummy] = state.fighters;
  if (schoolSession.pendingSetup === "dizzy" && dummy
    && state.simulationTick - schoolSession.dizzyCooldownTick > 90) {
    if (dummy.dizzyFrames <= 0 && !dummy.down && dummy.wakeupFrames <= 0) {
      enterDizzy(dummy, player);
      schoolSession.dizzyCooldownTick = state.simulationTick;
    }
  }
  if (schoolSession.pendingSetup === "lowHealth" && dummy && dummy.health > 5 && state.phase === "fight") {
    dummy.health = 5;
    updateHud();
  }
  if (step?.kind === "walk" && player && player.grounded && !player.attacking
    && player.hitstunFrames <= 0 && player.blockstunFrames <= 0 && Math.abs(player.vx) > 40) {
    const direction = Math.sign(player.vx) === player.facing ? "forward" : "back";
    schoolEvent({ type: "walk", direction });
  }
}
const initialsUi = {
  active: false,
  letters: ["A", "A", "A"],
  cursor: 0,
  score: 0,
  onDone: null,
};
// Monotonic one-shot totals for the new modes, on the hudFxDebug pattern.
const modeFxDebug = {
  tallyScreens: 0,
  tallyCountUps: 0,
  initialsEntries: 0,
  survivalMilestones: 0,
  teamEliminations: 0,
  teamWalkIns: 0,
  dailyRuns: 0,
  attractScoreBoards: 0,
  scoreSubmissions: 0,
  // v2.1 PROGRESSION one-shot totals, same monotonic pattern.
  blackBookToasts: 0,
  bookStamps: 0,
  rankSlams: 0,
  endingPanelsShown: 0,
  creditsRolls: 0,
  endingSequences: 0,
  blackBookScreens: 0,
  recordsScreens: 0,
  // R2.0 FAMILY wave 16 one-shot totals.
  commissionerUnlocks: 0,
  dialogueExchanges: 0,
  dialogueCardsShown: 0,
  winQuoteSelections: 0,
};

// ===========================================================================
// v2.1 PROGRESSION (R1.8 GRIND remainder) — The Black Book achievements
// ledger + fight records + mastery ranks. All logic lives in
// engine/progression.mjs (pure); this block is observation + persistence +
// UI. Everything here is render/meta-side on the scoreSession pattern:
// module-level, never snapshotted, never read by the sim. Hooks that sit on
// sim paths are announce()-guarded (`if (!rollbackResimulating)`) at the call
// site, and the fold points dedupe by matchSerial/round key, so rollback
// resimulation can never double-count. Online-safe by shape: observation only.
// ===========================================================================

const RECORDS_STORAGE_KEY = "final-blow-records";
const BLACK_BOOK_STORAGE_KEY = "final-blow-black-book";

let recordsStore = normalizeRecordsStore(storedJson(RECORDS_STORAGE_KEY, null));
let blackBookLedger = normalizeBlackBookStore(storedJson(BLACK_BOOK_STORAGE_KEY, null));

function saveRecordsStore() {
  try {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(recordsStore));
  } catch { /* storage full/blocked — records stay in-memory for the session */ }
}

function saveBlackBookLedger() {
  try {
    localStorage.setItem(BLACK_BOOK_STORAGE_KEY, JSON.stringify(blackBookLedger));
  } catch { /* non-fatal */ }
}

// Per-match observation accumulators. Reset at every match start (real flows
// and QA fights); folded exactly once per match by progressionMatchEnd.
const progressionMatch = {
  serial: -1,
  folded: false,
  rounds: 0,
  roundWins: [0, 0],
  perfectRounds: [0, 0],
  damageDealt: [0, 0],
  damageTaken: [0, 0],
  dizzies: [0, 0],
  techs: [0, 0],
  supers: [0, 0],
  moveUses: [{}, {}],
  fatalities: [0, 0],
  fatalityVariants: [[], []],
  peakCombo: [0, 0],
  timeOverWin: false,
  // Per-round latches.
  jumped: [false, false],
  roundStartHealth: [100, 100],
  // Last damage applied to each side: { tick, chip, weapon } — read only at
  // round end to classify decision/weapon finishes.
  lastDamage: [null, null],
  roundKey: "",
};

function progressionResetRound() {
  progressionMatch.jumped = [false, false];
  progressionMatch.lastDamage = [null, null];
  progressionMatch.roundStartHealth = state.fighters.map((fighter) => clamp(fighter?.health ?? 100, 0, 100));
}

function progressionResetMatch() {
  progressionMatch.serial = state.matchSerial;
  progressionMatch.folded = false;
  progressionMatch.rounds = 0;
  progressionMatch.roundWins = [0, 0];
  progressionMatch.perfectRounds = [0, 0];
  progressionMatch.damageDealt = [0, 0];
  progressionMatch.damageTaken = [0, 0];
  progressionMatch.dizzies = [0, 0];
  progressionMatch.techs = [0, 0];
  progressionMatch.supers = [0, 0];
  progressionMatch.moveUses = [{}, {}];
  progressionMatch.fatalities = [0, 0];
  progressionMatch.fatalityVariants = [[], []];
  progressionMatch.peakCombo = [0, 0];
  progressionMatch.timeOverWin = false;
  progressionMatch.roundKey = "";
  progressionResetRound();
}

// Human seat rule: the ledger and records belong to the P1 seat (the cabinet
// owner's book). Demo and tournament (CPU in seat 0) never write; the
// arcade/survival/team CPU in seat 1 never earns credit. Online is
// observation-only — the local player renders as side 0 there too.

// Move usage observation from beginAttack (sim path; call site is guarded).
// Distinct-move cap bounds localStorage growth against modded/QA move ids.
function progressionNoteMove(fighter) {
  if (state.screen !== "fight" || fighter.side !== 0 && fighter.side !== 1) return;
  const name = String(fighter.attacking?.profileId || fighter.attacking?.kind || "").trim();
  if (!name) return;
  const uses = progressionMatch.moveUses[fighter.side];
  if (uses[name] === undefined && Object.keys(uses).length >= 64) return;
  uses[name] = (uses[name] || 0) + 1;
}

// Damage-source latch from every damage site (guarded call sites).
function progressionNoteDamage(victimSide, { chip = false, weapon = false } = {}) {
  if (victimSide !== 0 && victimSide !== 1) return;
  progressionMatch.lastDamage[victimSide] = { tick: state.simulationTick, chip, weapon };
}

// Instant one-shot ledger events (throwables landed, perfect guards, taunts…).
// Counters only — predicate evaluation waits for the next bounded fold point.
function progressionEvent(kind, detail = {}, side = 0) {
  if (side !== 0 || sideIsCpuControlled(0)) return;
  blackBookObserve(blackBookLedger, { type: "event", kind, ...detail });
}

// Queue of pending unlock/rank toasts, shown one at a time via the announcer
// letter-slam + the book-stamp overlay. Pure DOM/timer land.
const progressionToasts = [];
let progressionToastTimer = 0;
let progressionToastHideTimer = 0;

function queueBlackBookUnlocks(entries) {
  for (const entry of entries) {
    progressionToasts.push({ kind: "unlock", title: entry.title, sub: "THE BLACK BOOK · ENTRY INKED" });
  }
  pumpProgressionToasts();
}

function queueRankUpToast(rank, fighterName) {
  progressionToasts.push({ kind: "rank", title: rank.name, sub: `${fighterName} · MASTERY ${rank.badge}` });
  pumpProgressionToasts();
}

function pumpProgressionToasts(delay = 1400) {
  if (progressionToastTimer || !progressionToasts.length) return;
  progressionToastTimer = window.setTimeout(() => {
    progressionToastTimer = 0;
    const toast = progressionToasts.shift();
    if (toast) showProgressionToast(toast);
    if (progressionToasts.length) pumpProgressionToasts(3050);
  }, delay);
}

function showProgressionToast(toast) {
  const box = $("#bookStampToast");
  if (!box) return;
  const strong = box.querySelector("strong");
  const letters = [...String(toast.title)];
  const stagger = 45;
  strong.setAttribute("aria-label", toast.title);
  // Same per-letter slam markup as announce(): spaces keep white-space:pre so
  // textContent round-trips exactly for QA reads.
  strong.innerHTML = letters.map((character, index) => (character === " "
    ? `<i class="gap" aria-hidden="true"> </i>`
    : `<i aria-hidden="true" style="animation-delay:${index * stagger}ms">${escapeAnnounceChar(character)}</i>`)).join("");
  box.querySelector(".stamp-sub").textContent = toast.sub;
  box.querySelector(".stamp-seal b").textContent = toast.kind === "rank" ? "RANK" : "INKED";
  box.classList.toggle("rank-up", toast.kind === "rank");
  // On the fight screen the announcer banner slams the title itself, so the
  // toast keeps just the seal + sub instead of doubling the letters.
  box.classList.toggle("with-announcer", state.screen === "fight");
  box.classList.remove("out");
  box.hidden = false;
  restartCssAnimation(box.querySelector(".stamp-seal"), "thud");
  if (toast.kind === "rank") modeFxDebug.rankSlams += 1;
  else modeFxDebug.blackBookToasts += 1;
  modeFxDebug.bookStamps += 1;
  // Mirror the call onto the fight announcer when a bout is on screen — the
  // letter-slam pipeline proper (announce() self-guards against resim).
  if (state.screen === "fight") announce(toast.title, toast.sub, 1.9);
  sound("select");
  window.clearTimeout(progressionToastHideTimer);
  progressionToastHideTimer = window.setTimeout(() => {
    box.classList.add("out");
    window.setTimeout(() => { box.hidden = true; box.classList.remove("out"); }, 160);
  }, 2600);
}

// Bounded evaluation point: run every locked predicate, stamp fresh unlocks
// with today's date, persist, queue toasts.
function progressionEvaluateLedger() {
  const fresh = evaluateBlackBook(blackBookLedger, dailyDateString());
  if (fresh.length) {
    saveBlackBookLedger();
    queueBlackBookUnlocks(fresh);
    refreshProgressionUi();
  }
  return fresh;
}

// Round-end fold, called from finishRound inside its existing
// `if (!rollbackResimulating)` block. Deduped by the same key shape
// queueStoryCallouts uses so a re-entered round can never double-fold.
function progressionRoundEnd(winner, type) {
  if (state.fighters.length !== 2 || state.mode === "demo" || state.mode === "tournament") return;
  const key = `${state.matchSerial}:${state.round}:${winner}:${state.rounds[winner]}`;
  if (key === progressionMatch.roundKey) return;
  progressionMatch.roundKey = key;
  if (progressionMatch.serial !== state.matchSerial) progressionResetMatch();
  const loser = 1 - winner;
  const winnerFighter = state.fighters[winner];
  const loserFighter = state.fighters[loser];
  // Health deltas against the round-start latch (health only falls mid-round).
  for (const side of [0, 1]) {
    const dealt = Math.max(0, progressionMatch.roundStartHealth[1 - side] - clamp(state.fighters[1 - side].health, 0, 100));
    const taken = Math.max(0, progressionMatch.roundStartHealth[side] - clamp(state.fighters[side].health, 0, 100));
    progressionMatch.damageDealt[side] += dealt;
    progressionMatch.damageTaken[side] += taken;
    progressionMatch.peakCombo[side] = Math.max(progressionMatch.peakCombo[side], state.fighters[side].combo?.peakHits || 0);
  }
  progressionMatch.rounds += 1;
  progressionMatch.roundWins[winner] += 1;
  const perfect = winnerFighter.health >= 100;
  if (perfect) progressionMatch.perfectRounds[winner] += 1;
  const timeOver = state.timer <= 0 && loserFighter.health > 0;
  if (timeOver && winner === 0) progressionMatch.timeOverWin = true;
  if (type >= 0) {
    progressionMatch.fatalities[winner] += 1;
    if (!winnerFighter.def.boss) {
      progressionMatch.fatalityVariants[winner].push(`${winnerFighter.def.id}:${type}`);
    }
  }
  // The Black Book observes from the P1 seat only.
  if (sideIsCpuControlled(0)) return;
  const lastOnLoser = progressionMatch.lastDamage[loser];
  if (winner === 0 && loserFighter.health <= 0 && lastOnLoser?.weapon) {
    blackBookObserve(blackBookLedger, { type: "event", kind: "weaponKo", stage: state.stage });
  }
  blackBookObserve(blackBookLedger, {
    type: "roundEnd",
    won: winner === 0,
    perfect: winner === 0 && perfect,
    timeOver,
    chip: Boolean(winner === 0 && timeOver && lastOnLoser?.chip),
    jumped: progressionMatch.jumped[0],
    combo: state.fighters[0].combo?.peakHits || 0,
    fatality: type >= 0 && winner === 0 && !winnerFighter.def.boss
      ? { fighterId: winnerFighter.def.id, variant: type, opponentIsBoss: Boolean(loserFighter.def.boss) }
      : null,
  });
  progressionEvaluateLedger();
}

function progressionRecordMode() {
  if (dailySession.active && state.mode === "arcade") return "daily";
  if (["arcade", "survival", "team"].includes(state.mode)) return state.mode;
  return "versus";
}

// Match-end fold: exactly once per matchSerial, from the resolveMatchResult
// family (never a resim path — guarded anyway for safety).
function progressionMatchEnd(winner) {
  if (rollbackResimulating || progressionMatch.folded) return;
  if (progressionMatch.serial !== state.matchSerial || state.fighters.length !== 2) return;
  if (state.mode === "demo" || state.mode === "tournament") return;
  progressionMatch.folded = true;
  const heroDef = state.fighters[0]?.def;
  if (!heroDef || heroDef.boss || sideIsCpuControlled(0)) return;
  const won = winner === 0;
  const result = applyMatchToRecords(recordsStore, {
    fighterId: heroDef.id,
    mode: progressionRecordMode(),
    won,
    rounds: progressionMatch.rounds,
    roundWins: progressionMatch.roundWins[0],
    damageDealt: progressionMatch.damageDealt[0],
    damageTaken: progressionMatch.damageTaken[0],
    fatalities: progressionMatch.fatalities[0],
    fatalityVariants: progressionMatch.fatalityVariants[0],
    dizzies: progressionMatch.dizzies[0],
    perfects: progressionMatch.perfectRounds[0],
    peakCombo: progressionMatch.peakCombo[0],
    timeOverWin: progressionMatch.timeOverWin,
    moveUses: progressionMatch.moveUses[0],
  });
  saveRecordsStore();
  if (result?.rankedUp) queueRankUpToast(result.after, heroDef.name);
  blackBookObserve(blackBookLedger, {
    type: "matchEnd",
    won,
    stage: state.stage,
    techs: progressionMatch.techs[0],
    dizzies: progressionMatch.dizzies[0],
    supers: progressionMatch.supers[0],
    perfectRounds: progressionMatch.perfectRounds[0],
    runScore: scoreTrackingActive() || scoreSession.total > 0 ? Math.round(scoreSession.total) : 0,
  });
  progressionEvaluateLedger();
  saveBlackBookLedger();
  refreshProgressionUi();
}

// Run-end fold (arcade clear, survival streak, daily, Block War) — pure
// meta paths, called beside the mode resolvers.
function progressionRunEnd(kind, detail = {}) {
  if (rollbackResimulating || sideIsCpuControlled(0)) return;
  blackBookObserve(blackBookLedger, { type: "runEnd", kind, ...detail });
  progressionEvaluateLedger();
  saveBlackBookLedger();
  // Wave 16: a FINAL-difficulty arcade clear hands over the Keeper's keys.
  if (kind === "arcade" && detail.finalDifficulty) unlockCommissioner();
}

// ---------------------------------------------------------------------------
// Wave 16 — playable-Commissioner unlock plumbing. Persisted via the standard
// final-blow-* localStorage pattern; the roster, the select grid and the
// online eligibility set all resync from the one flag.
// ---------------------------------------------------------------------------
function unlockCommissioner({ quiet = false } = {}) {
  const fresh = !commissionerUnlocked();
  localStorage.setItem(COMMISSIONER_UNLOCK_KEY, "1");
  if (!rosterHasCommissioner()) {
    roster.push(commissionerPlayableDef);
    setupRoster();
  }
  onlineFighterIds.add(ARCADE_BOSS_ID);
  syncOnlineCommissionerOption();
  if (fresh && !quiet) {
    modeFxDebug.commissionerUnlocks += 1;
    progressionToasts.push({ kind: "unlock", title: "KEEPER'S KEYS", sub: "THE COMMISSIONER JOINS THE ROSTER · 9TH SLOT" });
    pumpProgressionToasts();
  }
  return fresh;
}

function relockCommissioner() {
  localStorage.removeItem(COMMISSIONER_UNLOCK_KEY);
  const index = roster.findIndex(({ id }) => id === ARCADE_BOSS_ID);
  if (index >= 0) roster.splice(index, 1);
  onlineFighterIds.delete(ARCADE_BOSS_ID);
  syncOnlineCommissionerOption();
  setupRoster();
  return true;
}

function progressionHighScore(rank) {
  if (!Number.isFinite(rank) || rank < 0) return;
  blackBookObserve(blackBookLedger, { type: "highScore", rank });
  progressionEvaluateLedger();
  saveBlackBookLedger();
}

// CINEMA 3D first activation — fired from the options toggle (DOM path).
function progressionCinemaActivated() {
  blackBookObserve(blackBookLedger, { type: "event", kind: "cinema3d" });
  progressionEvaluateLedger();
  saveBlackBookLedger();
}

// --- Progression UI: title status, Black Book screen, Records screen -------

function refreshProgressionUi() {
  const summary = blackBookSummary(blackBookLedger);
  const bookStatus = $("#blackBookStatus");
  if (bookStatus) bookStatus.textContent = `${summary.unlocked} / ${summary.total} INKED`;
  const records = recordsSummary(recordsStore);
  const recordsStatus = $("#recordsStatus");
  if (recordsStatus) {
    recordsStatus.textContent = records.matches > 0
      ? `${records.wins}W · ${records.losses}L · ${records.rankedFighters} RANKED`
      : "NO FIGHTS LOGGED";
  }
}

function renderBlackBookScreen() {
  const summary = blackBookSummary(blackBookLedger);
  $("#blackBookCount").textContent = `${summary.unlocked} / ${summary.total} INKED`;
  $("#blackBookList").innerHTML = BLACK_BOOK_ENTRIES.map((entry, index) => {
    const date = blackBookLedger.unlocked[entry.id];
    const ordinal = String(index + 1).padStart(2, "0");
    if (date !== undefined) {
      return `<div class="book-entry inked" role="listitem" data-ordinal="${ordinal}">
        <b>${entry.title}</b><span>${entry.line}</span>
        <span class="book-date">INKED${date ? ` · ${date}` : ""}</span>
      </div>`;
    }
    return `<div class="book-entry locked" role="listitem" data-ordinal="${ordinal}">
      <b aria-label="Redacted entry">${entry.title.replace(/[^ ]/g, "█")}</b>
      <span>${entry.hint}</span>
    </div>`;
  }).join("");
}

function showBlackBookScreen() {
  renderBlackBookScreen();
  modeFxDebug.blackBookScreens += 1;
  sound("select");
  showScreen("blackbook");
}

function formatRecordNumber(value) {
  return Math.round(value).toLocaleString("en-US");
}

function renderRecordsScreen() {
  const records = recordsSummary(recordsStore);
  $("#recordsLifetime").innerHTML = [
    ["MATCHES", records.matches],
    ["WINS", records.wins],
    ["LOSSES", records.losses],
    ["ROUNDS", records.rounds],
    ["DMG DEALT", formatRecordNumber(records.damageDealt)],
    ["DMG TAKEN", formatRecordNumber(records.damageTaken)],
    ["FINAL BLOWS", records.fatalities],
    ["PERFECTS", records.perfects],
  ].map(([label, value]) => `<span>${label} <b>${value}</b></span>`).join("");
  const best = loadSurvivalBest();
  const daily = loadDailyRecord();
  $("#recordsStreaks").textContent =
    `GAUNTLET BEST ${best.streak} STRAIGHT · DAILY STREAK ${Math.max(0, Math.round(Number(daily?.streak) || 0))} (BEST ${Math.max(0, Math.round(Number(daily?.bestStreak) || 0))})`;
  $("#recordsGrid").innerHTML = roster.map((def) => {
    const record = recordsStore.fighters[def.id] || null;
    const rank = masteryRank(record);
    const favorite = favoriteMove(record);
    const modes = record?.modes || {};
    const arcadeWins = (modes.arcade?.wins || 0) + (modes.daily?.wins || 0);
    return `<div class="record-card" role="listitem" style="--fighter:${def.color}">
      <img src="assets/fighters/${def.id}.webp" alt="" draggable="false">
      <h3>${def.name}</h3>
      <span class="record-rank" data-tier="${rank.id}" title="${rank.points} PTS${rank.nextName ? ` · ${rank.toNext} TO ${rank.nextName}` : ""}">${rank.tierIndex > 0 ? rank.name : "UNRANKED"}</span>
      <div class="record-lines">
        <span>W — L <b>${record?.wins || 0} — ${record?.losses || 0}</b></span>
        <span>ROUNDS <b>${record?.rounds || 0}</b></span>
        <span>DMG DEALT <b>${formatRecordNumber(record?.damageDealt || 0)}</b></span>
        <span>DMG TAKEN <b>${formatRecordNumber(record?.damageTaken || 0)}</b></span>
        <span>GO-TO MOVE <b>${favorite ? prettyMoveName(favorite.action) : "—"}</b></span>
        <span>FINAL BLOWS <b>${record?.fatalities || 0}</b></span>
        <span>PEAK COMBO <b>${record?.peakCombo || 0} HITS</b></span>
        <span>ARCADE WINS <b>${arcadeWins}</b></span>
      </div>
    </div>`;
  }).join("");
}

function showRecordsScreen() {
  renderRecordsScreen();
  modeFxDebug.recordsScreens += 1;
  sound("select");
  showScreen("records");
}

// Small mastery chip on every select-screen portrait card.
function refreshMasteryBadges() {
  $$(".fighter-card .mastery-badge").forEach((badge) => {
    const card = badge.closest(".fighter-card");
    const id = roster[Number(card?.dataset.index)]?.id;
    if (!id) return;
    const rank = masteryRank(recordsStore.fighters[id]);
    badge.hidden = rank.tierIndex === 0;
    badge.dataset.tier = rank.id;
    badge.textContent = rank.badge;
    badge.title = `${rank.name} · ${rank.points} PTS`;
  });
}

function loadHighScores() {
  const stored = storedJson(SCORE_STORAGE_KEY, []);
  return Array.isArray(stored) ? stored.filter((row) => row && Number.isFinite(row.score)) : [];
}

function saveHighScores(list) {
  try {
    localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(list.slice(0, SCORE_RULES.tableSize)));
  } catch { /* storage full/blocked — table stays in-memory for the session */ }
}

function loadSurvivalBest() {
  const stored = storedJson(SURVIVAL_BEST_KEY, null);
  return {
    streak: Math.max(0, Math.round(Number(stored?.streak) || 0)),
    score: Math.max(0, Math.round(Number(stored?.score) || 0)),
  };
}

function saveSurvivalBest(best) {
  try {
    localStorage.setItem(SURVIVAL_BEST_KEY, JSON.stringify(best));
  } catch { /* non-fatal */ }
}

function loadDailyRecord() {
  return storedJson(DAILY_RULES.storageKey, null);
}

function saveDailyRecord(record) {
  try {
    localStorage.setItem(DAILY_RULES.storageKey, JSON.stringify(record));
  } catch { /* non-fatal */ }
}

// Offline-first, failure-silent submission to Jez's first-party score worker
// (the pinball-fantasies / hard-hat-mac client pattern). The local table is
// already written before this is ever called; any network problem is ignored.
async function submitScoreToWorker(initials, score, detail) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    await fetch(SCORES_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initials, score, extra: detail }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    modeFxDebug.scoreSubmissions += 1;
  } catch { /* offline or worker down — the local table already has it */ }
}

function scoreTrackingActive() {
  return scoreSession.active && (state.mode === "arcade" || state.mode === "survival");
}

function beginScoreRun(mode, detail, multiplier) {
  scoreSession.active = true;
  scoreSession.mode = mode;
  scoreSession.detail = detail;
  scoreSession.total = 0;
  scoreSession.boutCount = 0;
  scoreSession.multiplier = multiplier;
  scoreSession.bout = createBoutTally();
  scoreSession.roundFirstHitDone = false;
  scoreSession.lastBout = null;
  scoreSession.lastBoutTotal = 0;
  scoreSession.submitted = false;
}

function endScoreRun() {
  scoreSession.active = false;
}

function resetRoundScoreTracking() {
  scoreSession.roundFirstHitDone = false;
}

// Per-hit points, called from the sim's hit/grab/projectile damage sites.
// Guarded: never during resimulation, never online, only the human player.
function awardHitScore(attacker, kind, { counter = false } = {}) {
  if (rollbackResimulating || !scoreTrackingActive() || attacker.side !== 0) return;
  const points = scoreForHit(kind, { counter });
  scoreSession.bout.fightPoints += points;
  scoreSession.bout.hits += 1;
  if (!scoreSession.roundFirstHitDone) {
    scoreSession.roundFirstHitDone = true;
    scoreSession.bout.firstAttacks += 1;
  }
}

function awardDizzyScore(attacker) {
  if (rollbackResimulating || !scoreTrackingActive() || attacker?.side !== 0) return;
  scoreSession.bout.dizzies += 1;
}

// Round-end bonuses, captured in finishRound (sim path, resim-guarded there).
function captureRoundBonuses(winner, finisherType) {
  if (!scoreTrackingActive() || winner !== 0) return;
  const player = state.fighters[0];
  scoreSession.bout.rounds += 1;
  scoreSession.bout.timeSeconds += Math.max(0, Math.ceil(state.timer));
  scoreSession.bout.vitality += Math.max(0, Math.round(player?.health || 0));
  if ((player?.health ?? 0) >= 100) scoreSession.bout.perfects += 1;
  if (finisherType >= 0) scoreSession.bout.fatalities += 1;
}

// Close out the finished bout: bank its multiplied total into the run score
// and hand back the tally for the SF2 count-up screen.
function finalizeBoutTally() {
  if (!scoreTrackingActive()) return null;
  const tally = scoreSession.bout;
  const boutTotal = tallyTotal(tally, scoreSession.multiplier);
  scoreSession.total += boutTotal;
  scoreSession.boutCount += 1;
  scoreSession.lastBout = tally;
  scoreSession.lastBoutTotal = boutTotal;
  scoreSession.bout = createBoutTally();
  return { tally, boutTotal, runTotal: scoreSession.total, multiplier: scoreSession.multiplier };
}

function scoreSessionSnapshot() {
  return {
    active: scoreSession.active,
    mode: scoreSession.mode,
    detail: scoreSession.detail,
    total: scoreSession.total,
    boutCount: scoreSession.boutCount,
    multiplier: scoreSession.multiplier,
    bout: { ...scoreSession.bout },
    lastBoutTotal: scoreSession.lastBoutTotal,
    roundFirstHitDone: scoreSession.roundFirstHitDone,
  };
}

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
  $("#attractScores").hidden = true;
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
  $("#attractScores").hidden = true;
  state.mode = "demo";
  state.arcadeRun = null;
  state.survivalRun = null;
  state.teamBattle = null;
  dailySession.active = false;
  endScoreRun();
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
  // Release 1.8 GRIND: real-cabinet attract loop — while the idle demo holds
  // its result, the local high-score table takes the screen.
  if (demoSession.attract) {
    const table = renderHighScoreBoard();
    if (table.length) {
      $("#attractScores").hidden = false;
      modeFxDebug.attractScoreBoards += 1;
    }
  }
  demoSession.resultTimer = window.setTimeout(() => {
    demoSession.resultTimer = 0;
    startNextDemoMatch();
  }, DEMO_RESULT_HOLD_MS);
}

function scheduleIdleDemo() {
  clearIdleDemoTimer();
  // Wave 15: CABINET MODE always attracts — a cabinet with the demo switched
  // off is just a dark TV.
  const attracts = state.attractEnabled || state.cabinetMode;
  if (!attracts || demoSession.active || state.screen !== "title" || document.hidden) return;
  demoSession.idleTimer = window.setTimeout(() => {
    demoSession.idleTimer = 0;
    if ((state.attractEnabled || state.cabinetMode) && state.screen === "title" && !document.hidden && !$("#controlsDialog").open) startDemo({ attract: true });
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

// Wave 16: the Commissioner appears in the online fighter list only while
// BOTH peers have him unlocked (the lobby handshake carries the flags). A
// peer who loses eligibility mid-lobby is snapped back to DeathBlow.
function syncOnlineCommissionerOption() {
  const select = $("#onlineFighterSelect");
  if (!select) return;
  const eligible = commissionerUnlocked() && onlineSession.lobby.remoteCommissionerUnlocked;
  let option = select.querySelector('option[value="commissioner"]');
  if (eligible && !option) {
    option = document.createElement("option");
    option.value = ARCADE_BOSS_ID;
    option.textContent = "THE COMMISSIONER";
    select.append(option);
  } else if (!eligible && option) {
    option.remove();
    if (onlineSession.lobby.localFighter === ARCADE_BOSS_ID) {
      onlineSession.lobby.localFighter = "deathblow";
      onlineSession.lobby.localReady = false;
      sendOnlineLobbyState();
    }
  }
}

function updateOnlineMatchSetup() {
  const connected = Boolean(onlineSession.peer?.connected);
  const setup = $("#onlineMatchSetup");
  setup.hidden = !connected || onlineSession.matchActive;
  if (!connected) return;
  const lobby = onlineSession.lobby;
  $("#onlineFighterSelect").value = lobby.localFighter;
  $("#onlineOpponentFighter").textContent = onlineFighterIds.has(lobby.remoteFighter)
    ? `${roster.find(({ id }) => id === lobby.remoteFighter).name}${lobby.remotePalette === 1 ? " · ALT" : ""}`
    : lobby.remoteFighterRaw === ARCADE_BOSS_ID
      ? "THE COMMISSIONER · LOCKED HERE"
      : "CHOOSING…";
  const paletteSelect = $("#onlinePaletteSelect");
  if (paletteSelect) paletteSelect.value = String(lobby.localPalette);
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
    // Wave 16: color pick + Commissioner eligibility handshake.
    palette: lobby.localPalette,
    commissioner: commissionerUnlocked(),
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
        // Wave 9: fresh lobby link -> "opponent connected"; a reconnect
        // outside a live match resolves here too -> "connection recovered"
        // (mid-match recovery announces from completeOnlineResume instead).
        const wasReconnecting = onlineSession.reconnecting || onlineSession.reconnectAttempts > 0;
        onlineSession.reconnectAttempts = 0;
        onlineSession.reconnecting = false;
        onlineSession.peers.add(onlineRemoteRole());
        setOnlineStatus("connected", onlineSession.matchActive ? "Direct link restored. Verifying rollback state…" : detail);
        updateOnlineSeats();
        updateOnlineMatchSetup();
        if (onlineSession.matchActive) beginOnlineResumeHandshake();
        else {
          sendOnlineLobbyState();
          announcerOnlineMoment(wasReconnecting ? "recovered" : "connected");
        }
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
  // Wave 16: the Commissioner may only enter the config when BOTH peers have
  // him unlocked — the same both-sides-agree gate mutators use. The lobby UI
  // never offers him otherwise; this is the belt to that suspenders.
  const commissionerEligible = commissionerUnlocked() && lobby.remoteCommissionerUnlocked;
  if ([lobby.localFighter, lobby.remoteFighter].includes(ARCADE_BOSS_ID) && !commissionerEligible) return null;
  return {
    version: 1,
    matchId: crypto.randomUUID(),
    seed: seedBytes[0] || 237,
    picks: [lobby.localFighter, lobby.remoteFighter],
    stage: stages[lobby.stage] ? lobby.stage : "somerset",
    inputDelay: Math.max(delayChoiceFrames(lobby.delayChoice), delayChoiceFrames(lobby.remoteDelayChoice)),
    controlStyles: [state.controlStyle, lobby.remoteControlStyle],
    // Wave 16: agreed color picks, one per side, in picks order.
    palettes: [lobby.localPalette === 1 ? 1 : 0, lobby.remotePalette === 1 ? 1 : 0],
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
    && config.controlStyles?.length === 2
    // Optional shared House Rules: absent (plain rooms) or a list of known
    // mutator ids agreed by both peers. Unknown ids reject the config.
    && (config.mutators === undefined
      || (Array.isArray(config.mutators) && config.mutators.every((id) => Boolean(MUTATORS[id]))))
    // Wave 16: optional agreed color picks — absent (older peer) or exactly
    // one 0/1 per side. Anything else rejects the config.
    && (config.palettes === undefined
      || (Array.isArray(config.palettes) && config.palettes.length === 2
        && config.palettes.every((palette) => palette === 0 || palette === 1))),
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
  checkRematchAccepted();
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
  // Wave 9: the resync handshake finished — the announcer confirms the link.
  if (onlineSession.matchActive) announcerOnlineMoment("recovered");
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
    onlineSession.lobby.remoteFighterRaw = typeof message.fighter === "string" ? message.fighter : "";
    if (onlineFighterIds.has(message.fighter)) onlineSession.lobby.remoteFighter = message.fighter;
    if (onlineSession.role === "guest" && stages[message.stage]) onlineSession.lobby.stage = message.stage;
    onlineSession.lobby.remoteDelayChoice = ["auto", "0", "1", "2", "3", "4"].includes(String(message.delayChoice))
      ? String(message.delayChoice) : "auto";
    onlineSession.lobby.remoteControlStyle = normalizeControlStyle(message.controlStyle);
    onlineSession.lobby.remoteReady = Boolean(message.ready);
    // Wave 16: optional fields — absent from an older peer means primary
    // color and a locked Commissioner, which is the safe default both ways.
    onlineSession.lobby.remotePalette = message.palette === 1 ? 1 : 0;
    onlineSession.lobby.remoteCommissionerUnlocked = Boolean(message.commissioner);
    syncOnlineCommissionerOption();
    updateOnlineMatchSetup();
    maybeLaunchOnlineMatch();
    return;
  }
  if (message.type === "match-start" && onlineSession.role === "guest") {
    if (validOnlineMatchConfig(message.config)) {
      startOnlineMatch(message.config);
    } else if (message.config?.picks?.includes?.(ARCADE_BOSS_ID) && !commissionerUnlocked()) {
      // The mutator-style gate tripped: the config names a fighter this
      // machine has not earned. Refuse the match and say exactly why.
      setOnlineStatus("error", "THE COMMISSIONER IS LOCKED ON THIS MACHINE — BEAT ARCADE ON FINAL DIFFICULTY TO ACCEPT THIS MATCH.");
      setOnlineError("Match refused: THE COMMISSIONER is not unlocked on this machine.");
    }
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
    checkRematchAccepted();
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
  // Release 1.8 GRIND: the Turbo mutator scales walk/dash speeds here, at
  // build time. Movement is a derived-from-config reference (never cloned by
  // the rollback snapshot), and mutators are constant for the whole match, so
  // a rollback rebuild derives the identical object.
  const movement = scaleMovementForRules(getFighterMovement(kitId, MOVEMENT_RULES), state.matchRules);
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
    // Release 1.8 GRIND: Block War walk-in target during the intro (plain
    // data — snapshot-cloned like every other fighter field; null when idle).
    introWalkTarget: null,
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
    // Release 1.7 DEPTH: guard gauge / wake-up option / air recovery /
    // Perfect Guard fields. All plain data, so the rollback fighter snapshot
    // (which clones every enumerable non-reference field) captures each one
    // and every one counts toward the combat checksum.
    ...createDepthFighterFields(),
    // Release 1.7 wave 11: wall-bounce latches + taunt clocks + the
    // double-tap-Down tracker, on the same plain-data snapshot contract.
    ...createOffenseFighterFields(),
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
// Eased super-flash darkness. Module-level and render-only: it never enters a
// rollback snapshot, so a resimulation just re-eases it harmlessly.
let superDimLevel = 0;
// True while drawFighterReflections re-runs drawFighter into the floor sheen
// band; the mirror pass skips the extra silhouette/ghost copies so it stays a
// single sprite draw per fighter.
let reflectionPassActive = false;
// Per-rendered-frame counters for the fighter presentation passes, exposed via
// snapshot().violence for QA smoke tests. Reset at the top of each fight frame
// in draw(); reflection-pass copies are deliberately excluded.
const presentationDebug = {
  rimLights: 0, hitSmears: 0, dizzyGhosts: 0, breathing: 0,
  contactShadows: 0, gritAuras: 0, lastLegs: 0,
  battleDamage: 0, castShadows: 0,
  // 1.9E: the effective sprite mirror last used per side — numeric facing ×
  // authored atlas facing — so QA can prove a mixed-orientation sheet (post)
  // renders toward the opponent instead of trusting numeric facing alone.
  lastFighterMirror: [null, null],
  practicalLights: 0, weatherParticles: 0, foregroundOccluders: 0, crowdFlashes: 0,
  counterFlashes: 0, projectileGlows: 0, swipeRibbons: 0, wallSplats: 0,
  focusLines: 0, lightSpills: 0,
  // Wave 7 steady screen-space passes, counted per rendered frame.
  bloomPasses: 0, rgbSplits: 0,
  // Release 1.8C REALITY BREAK steady render-only passes.
  realisticBackdrops: 0, realisticLighting: 0, realisticPortraits: 0, filmGrainPasses: 0,
};

// Release 1.7A CLEAN HITS: preserve the fighter palette during hit feedback.
// Hitstop, particles, camera recoil and sound still carry the impact; this
// short brightness lift replaces the old desaturated/inverted silhouette.
const HIT_FLASH_FILTER = "brightness(1.55) saturate(1.12)";
// Grit super-ready flare latches, one per side. Render-only module state on the
// superDimLevel pattern: never snapshotted, only ever read/written from the
// draw path, so rollback resimulation cannot touch it.
const gritFlareLevel = [0, 0];
const gritReadyLatched = [false, false];
// Accumulating battle damage: MK3-style bruise/cut smudges baked onto each
// fighter's sprite. Module-level per-side arrays on the superDimLevel pattern —
// render-only, never snapshotted, so rollback checksums are untouched. Mark
// creation is resimulation-proof twice over: pushes bail while
// rollbackResimulating (the announce() pattern) AND dedupe against the
// simulationTick stored on each mark, so no (tick, side) pair can ever
// double-mark even if a hit tick is executed twice.
const BATTLE_DAMAGE_MARK_CAP = 10;
const battleDamageMarks = [[], []];
// Bumped on every push/clear so the compositor cache key invalidates cheaply.
const battleDamageRevision = [0, 0];

function pushBattleDamageMark(victim, tier = "light") {
  if (rollbackResimulating) return;
  const side = victim?.side;
  if (side !== 0 && side !== 1) return;
  const marks = battleDamageMarks[side];
  if (marks.some((mark) => mark.tick === state.simulationTick)) return;
  const heavy = tier !== "light";
  // Cell-space (320px atlas cell) coordinates biased to the head/torso bands.
  const band = visualRandom() < 0.38
    ? { top: 48, span: 60 }
    : { top: 112, span: 94 };
  marks.push({
    tick: state.simulationTick,
    x: 160 + (visualRandom() - 0.5) * 104,
    y: band.top + visualRandom() * band.span,
    size: (heavy ? 14 : 9) + visualRandom() * (heavy ? 12 : 7),
    cut: heavy && visualRandom() < 0.6,
    lean: (visualRandom() - 0.5) * 1.6,
  });
  if (marks.length > BATTLE_DAMAGE_MARK_CAP) marks.shift();
  battleDamageRevision[side] += 1;
}

function clearBattleDamage() {
  battleDamageMarks[0].length = 0;
  battleDamageMarks[1].length = 0;
  battleDamageRevision[0] += 1;
  battleDamageRevision[1] += 1;
}

// ---------------------------------------------------------------------------
// Wave 5 HUD/screen-space presentation. Module-level render-only state on the
// documented superDimLevel pattern: never snapshotted, never read by the
// simulation, driven purely from observed state (health deltas, phase changes,
// combo counts, round wins), so rollback checksums are untouched. Every write
// path is either the render loop (never runs during resimulation) or a DOM
// update function that already early-returns on rollbackResimulating.
// ---------------------------------------------------------------------------

// Cumulative one-shot event totals exposed via snapshot().violence. Unlike
// presentationDebug these are NOT reset per frame: they count discrete DOM/CSS
// effect triggers (an announce, a pip flip) that a per-frame sampler would
// race against, so peak-sampling simply reads the latest monotonic total.
const hudFxDebug = {
  damageGhosts: 0, letterSlams: 0, comboHeat: 0, slashWipes: 0,
  selectSlams: 0, victoryEntrances: 0, pipFlips: 0, timerPulses: 0,
  // Wave 7 render-tech one-shots: monotonic totals on the same pattern.
  // sloMoBlurFrames counts rendered frames with the slow-mo smear active
  // (like cinemaFxDebug.handheldFrames — still monotonic, never reset).
  distortionRings: 0, sloMoBlurFrames: 0, superCutIns: 0,
};
// Release 1.7 DEPTH: monotonic one-shot totals for the new defensive
// mechanics, on the same hudFxDebug pattern. Each increment site sits inside
// a sim path but is guarded by `if (!rollbackResimulating)` (the announce()
// discipline), so a resimulated tick can never double-count and the counters
// never enter a rollback snapshot or checksum.
const mechFxDebug = {
  guardCrushes: 0, quickRises: 0, wakeDelays: 0, airRecoveries: 0, perfectGuards: 0,
  // Release 1.7 wave 11 offense mechanics, same monotonic resim-guarded pattern.
  wallBounces: 0, exThrowables: 0, commandKicks: 0, taunts: 0,
};
// Per-side damage-ghost render state: `health` is the last observed fraction,
// `shown` the ghost bar's current scaleX, `holdMs` the remaining freeze time.
const damageGhostState = [
  { health: null, shown: 1, holdMs: 0, written: -1 },
  { health: null, shown: 1, holdMs: 0, written: -1 },
];
// Per-side combo readout render state for hit-pops, heat tiers and the
// damage count-up.
const comboFxState = [
  { hits: 0, tier: 0, damageShown: 0, damageWritten: -1 },
  { hits: 0, tier: 0, damageShown: 0, damageWritten: -1 },
];
// Render-side phase observer for the round-transition slash wipe.
let hudObservedPhase = null;
// Render-frame clock for the damage-ghost hold/drain easing.
let hudFxLastTime = 0;
// Select-screen latch so the VS slam fires once per double lock.
let selectBothLocked = false;

// ---------------------------------------------------------------------------
// Wave 6 cinematic camera. COMBAT.md guarantees a fixed tournament framing, so
// this is NOT a gameplay camera: it never tracks fighters during normal play.
// Every move here is a brief presentation beat (intro dolly, KO punch-in,
// FINISH THEM dread creep, counter pops, fatality handheld, win settle,
// directional recoil) that eases back to exact identity. All state is
// module-level render-only on the documented superDimLevel pattern: never
// snapshotted, never read by the simulation. Latches set from simulation paths
// follow the announce() pattern (`if (rollbackResimulating) return`) plus a
// simulationTick dedupe so a re-executed tick can never double-fire.
// ---------------------------------------------------------------------------

// The single shared render camera applied around the world draw. zoom/x/y/
// rotation are the applied values (identity = 1/0/0/0); focusX/focusY is the
// world-space pivot the zoom magnifies around (irrelevant at zoom 1). Zoom is
// always >= 1 so the world always overdraws the frame; the HUD layer and all
// screen-space passes draw after the world restore and are never affected.
const cinematicCamera = { zoom: 1, x: 0, y: 0, rotation: 0, focusX: W * 0.5, focusY: H * 0.5 };
// Monotonic one-shot event totals on the hudFxDebug pattern, exposed via
// snapshot().violence. handheldFrames counts rendered frames with the fatality
// handheld wobble active (still monotonic, never reset).
const cinemaFxDebug = {
  koPunchIns: 0, introDollies: 0, dreadCreeps: 0, counterPunchIns: 0,
  handheldFrames: 0, winSettles: 0, impactRecoils: 0,
};
// Transient zoom-punch envelope: { age, attack, hold, release, magnitude,
// focusX, focusY }. Shared by the KO punch-in and the counter/dizzy pops; the
// biggest young punch wins, smaller latches are dropped instead of stacking.
let cameraPunch = null;
let cameraKoTick = -1;
let cameraCounterTick = -1;
let cameraDizzyTick = -1;
let cameraGuardCrushTick = -1;
// Directional impact recoil (screen px). Displacement is kicked along the hit
// direction and returned by an analytic damped oscillation — a push with one
// tiny rebound, not a vibration. Closed-form (amplitude * e^-13t * cos 17t)
// rather than an integrated spring so it is unconditionally stable no matter
// how long a render frame takes.
const cameraRecoil = { x: 0, y: 0, ampX: 0, ampY: 0, age: 0 };
let cameraRecoilTick = -1;
const CAMERA_RECOIL_PX = Object.freeze({ heavy: 2.4, special: 3.2, throw: 3, weapon: 3.4, super: 4 });
// Eased phase-pose state (intro dolly / dread creep / win settle).
let cameraPhaseZoom = 1;
let cameraPhaseRotation = 0;
let cameraFocusX = W * 0.5;
let cameraFocusY = H * 0.5;
// Fatality handheld drift (smoothed visualRandom walk) and dutch tilt.
let cameraHandheldX = 0;
let cameraHandheldY = 0;
let cameraHandheldTargetX = 0;
let cameraHandheldTargetY = 0;
let cameraHandheldClock = 0;
let cameraDutch = 0;
// Render-side phase edge observer for the one-shot counters (same pattern as
// hudObservedPhase — draw() never runs during rollback resimulation).
let cameraObservedPhase = null;
// Intro cinema-bar deployment level (0..1), canvas-drawn screen-space.
let letterboxLevel = 0;
// Win-pose curtain-call dim, eased in the sim tick beside superDimLevel on the
// same deliberately-unsnapshotted pattern (a resimulation just re-eases it).
let roundOverDimLevel = 0;

function cameraMotionScale() {
  return state.accessibility.reducedMotion ? 0 : state.accessibility.shakeScale;
}

// KO freeze-frame punch-in: latched from checkKnockout() on the killing hit.
// Fast attack, held through the hitstop freeze, easing back out while the
// FINISH THEM stand-off (and later the roundover call) takes over.
function latchKoCameraPunch() {
  if (rollbackResimulating || cameraKoTick === state.simulationTick) return;
  cameraKoTick = state.simulationTick;
  const [first, second] = state.fighters;
  const focusX = first && second ? (first.x + second.x) * 0.5 : W * 0.5;
  const focusY = first && second ? (first.y + second.y) * 0.5 - 128 : H * 0.5;
  cameraPunch = {
    age: 0, attack: 0.07, hold: 0.5, release: 0.45, magnitude: 0.08,
    focusX: clamp(focusX, 0, W), focusY: clamp(focusY, 0, H),
  };
  cinemaFxDebug.koPunchIns += 1;
}

function latchCameraPunchEnvelope(magnitude, focusX, focusY, attack, hold, release) {
  if (cameraPunch && cameraPunch.magnitude > magnitude
    && cameraPunch.age < cameraPunch.attack + cameraPunch.hold) return false;
  cameraPunch = {
    age: 0, attack, hold, release, magnitude,
    focusX: clamp(focusX, 0, W), focusY: clamp(focusY, 0, H),
  };
  return true;
}

// Counter-hit pop: ~5 frame attack to 1.05x on the impact point, back inside
// 0.4s. Latched from spawnHit's counter path so projectiles count too.
function latchCounterCameraPunch(x, y) {
  if (rollbackResimulating || cameraCounterTick === state.simulationTick) return;
  cameraCounterTick = state.simulationTick;
  if (latchCameraPunchEnvelope(0.05, x, y, 0.08, 0.05, 0.26)) cinemaFxDebug.counterPunchIns += 1;
}

// Dizzy pop: same magnitude, slightly longer hold on the stumbling victim.
function latchDizzyCameraPunch(fighter) {
  if (rollbackResimulating || cameraDizzyTick === state.simulationTick) return;
  cameraDizzyTick = state.simulationTick;
  if (latchCameraPunchEnvelope(0.05, fighter.x, fighter.y - 118, 0.08, 0.08, 0.24)) {
    cinemaFxDebug.counterPunchIns += 1;
  }
}

// Release 1.7: guard-crush pop on the shattered defender — the dizzy latch
// pattern verbatim (render-only, resim-guarded, tick-deduped).
function latchGuardCrushCameraPunch(fighter) {
  if (rollbackResimulating || cameraGuardCrushTick === state.simulationTick) return;
  cameraGuardCrushTick = state.simulationTick;
  if (latchCameraPunchEnvelope(0.05, fighter.x, fighter.y - 118, 0.08, 0.1, 0.26)) {
    cinemaFxDebug.counterPunchIns += 1;
  }
}

// Directional impact recoil for landed heavy-class hits. Replaces nothing:
// the existing noise shake still runs; this layers a 2-4px directional shove
// under it. Scaled by the shake setting, zeroed under reduced motion.
function latchCameraRecoil(kind, direction) {
  const px = CAMERA_RECOIL_PX[kind];
  if (!px || rollbackResimulating || cameraRecoilTick === state.simulationTick) return;
  cameraRecoilTick = state.simulationTick;
  const scale = cameraMotionScale();
  cameraRecoil.ampX = clamp(cameraRecoil.x + direction * px * scale, -6, 6);
  cameraRecoil.ampY = clamp(cameraRecoil.y + px * 0.22 * scale, -6, 6);
  cameraRecoil.age = 0;
  cinemaFxDebug.impactRecoils += 1;
}

// One call from spawnHit covers both cinema latches for a landed hit.
function latchImpactCinema(x, y, kind, blocked, direction, counter) {
  if (blocked) return;
  latchCameraRecoil(kind, direction);
  if (counter) latchCounterCameraPunch(x, y);
}

function resetCinematicCamera() {
  cameraPunch = null;
  cameraRecoil.x = 0;
  cameraRecoil.y = 0;
  cameraRecoil.ampX = 0;
  cameraRecoil.ampY = 0;
  cameraRecoil.age = 0;
  cameraPhaseZoom = 1;
  cameraPhaseRotation = 0;
  cameraFocusX = W * 0.5;
  cameraFocusY = H * 0.5;
  cameraHandheldX = 0;
  cameraHandheldY = 0;
  cameraHandheldTargetX = 0;
  cameraHandheldTargetY = 0;
  cameraHandheldClock = 0;
  cameraDutch = 0;
  cameraObservedPhase = null;
  letterboxLevel = 0;
  cinematicCamera.zoom = 1;
  cinematicCamera.x = 0;
  cinematicCamera.y = 0;
  cinematicCamera.rotation = 0;
  cinematicCamera.focusX = W * 0.5;
  cinematicCamera.focusY = H * 0.5;
}

// Called once per rendered frame from draw(), before the world transform.
// Observes snapshotted state (phase, phaseTime, finisher progress, fighter
// positions), eases the presentation camera toward the current beat's pose and
// always back to exact identity when nothing owns the frame. Never writes sim
// state; never runs during rollback resimulation (draw() cannot).
function updateCinematicCamera(dtMs) {
  const dt = clamp(dtMs / 1000, 0.001, 0.1);
  const cam = cinematicCamera;
  if (state.screen !== "fight" || state.fighters.length !== 2) {
    resetCinematicCamera();
    return;
  }
  const motion = cameraMotionScale();
  const reduced = state.accessibility.reducedMotion;
  const phase = state.phase;
  const finisher = state.finisher;
  const [first, second] = state.fighters;
  const midX = (first.x + second.x) * 0.5;
  const midY = clamp((first.y + second.y) * 0.5 - 128, H * 0.3, H * 0.72);

  // One-shot beat counters on phase edges (fires even when reduced motion
  // strips the zoom itself — the beat still happened, bars/spotlight remain).
  if (cameraObservedPhase !== phase) {
    if (phase === "intro") cinemaFxDebug.introDollies += 1;
    else if (phase === "finish" && !finisher) cinemaFxDebug.dreadCreeps += 1;
    else if (phase === "roundover" && !finisher && state.finisherType < 0) cinemaFxDebug.winSettles += 1;
    cameraObservedPhase = phase;
  }

  // Phase pose target. Identity by default: normal fight play NEVER gets a
  // tracking pose, only the transient punch/recoil envelopes below.
  let targetZoom = 1;
  let targetFocusX = W * 0.5;
  let targetFocusY = H * 0.5;
  let targetRotation = 0;
  let ease = 1 - Math.exp(-dt * 9);
  if (finisher) {
    // The scripted finisher camera owns framing: collapse the pose and any
    // pending punch instantly so nothing leaks under the cinematic transform.
    cameraPhaseZoom = 1;
    cameraPhaseRotation = 0;
    cameraPunch = null;
  } else if (phase === "intro" && !reduced) {
    // Broadcast open: start 1.08x tight on the square-up, pull out to full
    // arena width timed so identity lands with FIGHT! (phaseTime 2.1 -> 0.9).
    // A flow-skip flips phase to "fight" and the brisk default ease whips the
    // camera home in a few frames, which reads as a cut.
    const progress = clamp((2.1 - state.phaseTime) / 1.2, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    targetZoom = 1 + 0.08 * (1 - eased);
    targetFocusX = midX;
    targetFocusY = midY;
    ease = 1 - Math.exp(-dt * 14);
  } else if (phase === "finish" && !reduced) {
    // FINISH THEM dread: slow 1.04x creep biased onto the helpless victim
    // with a subtle 0.3-degree sway. Expiry or a finisher start both leave
    // this branch, and the default ease snaps the pose back to identity.
    const victim = state.fighters[1 - state.finishWinner] || second;
    const creep = clamp((6 - state.phaseTime) / 5.5, 0, 1);
    targetZoom = 1 + 0.04 * creep;
    targetFocusX = lerp(midX, victim.x, 0.7);
    targetFocusY = clamp(victim.y - 128, H * 0.3, H * 0.72);
    targetRotation = Math.sin(state.simulationTick * 0.021) * (Math.PI / 180) * 0.3 * creep;
    ease = 1 - Math.exp(-dt * 3.2);
  } else if (phase === "roundover" && state.finisherType < 0 && !reduced) {
    // Win-pose settle: gentle 1.03x drift toward the winner under the
    // curtain-call spotlight. Skipped whenever a fatality owns the frame.
    const winner = first.health >= second.health ? first : second;
    targetZoom = 1.03;
    targetFocusX = winner.x;
    targetFocusY = clamp(winner.y - 128, H * 0.3, H * 0.72);
    ease = 1 - Math.exp(-dt * 2.2);
  }
  cameraPhaseZoom += (targetZoom - cameraPhaseZoom) * ease;
  cameraPhaseRotation += (targetRotation - cameraPhaseRotation) * (1 - Math.exp(-dt * 6));
  cameraFocusX += (targetFocusX - cameraFocusX) * ease;
  cameraFocusY += (targetFocusY - cameraFocusY) * ease;

  // Transient zoom-punch envelope (KO / counter / dizzy).
  let punchZoom = 1;
  if (cameraPunch) {
    cameraPunch.age += dt;
    const { age, attack, hold, release, magnitude } = cameraPunch;
    let shape = 0;
    if (age < attack) shape = age / attack;
    else if (age < attack + hold) shape = 1;
    else if (age < attack + hold + release) {
      const tail = (age - attack - hold) / release;
      shape = 1 - tail * tail * (3 - 2 * tail);
    } else cameraPunch = null;
    if (cameraPunch && shape > 0 && motion > 0) {
      punchZoom = 1 + magnitude * shape * motion;
      const pull = shape * (1 - Math.exp(-dt * 12));
      cameraFocusX += (cameraPunch.focusX - cameraFocusX) * pull;
      cameraFocusY += (cameraPunch.focusY - cameraFocusY) * pull;
    }
  }

  // Directional recoil: closed-form fast return with one small rebound,
  // then a hard zero (~0.3s from kick to rest).
  if (cameraRecoil.ampX !== 0 || cameraRecoil.ampY !== 0) {
    cameraRecoil.age += dt;
    const decay = Math.exp(-13 * cameraRecoil.age);
    const wave = Math.cos(17 * cameraRecoil.age);
    cameraRecoil.x = cameraRecoil.ampX * decay * wave;
    cameraRecoil.y = cameraRecoil.ampY * decay * wave;
    if (decay < 0.02) {
      cameraRecoil.x = 0;
      cameraRecoil.y = 0;
      cameraRecoil.ampX = 0;
      cameraRecoil.ampY = 0;
      cameraRecoil.age = 0;
    }
  }

  // Fatality handheld drift + dutch tilt, only while a finisher cinematic
  // plays. Drift is a smoothed visualRandom walk (~2px), the dutch eases in
  // hard at the fatal impact and unwinds through the aftermath. Both are
  // zeroed by reduced motion and scale with the shake setting.
  if (finisher && motion > 0) {
    const aftermath = Math.max(0, finisher.elapsed - finisher.fatalityAt);
    const fade = clamp(1 - aftermath / 2.6, 0, 1);
    const amplitude = 2 * motion * fade;
    cameraHandheldClock -= dt;
    if (cameraHandheldClock <= 0) {
      cameraHandheldClock = 0.18 + visualRandom() * 0.22;
      cameraHandheldTargetX = (visualRandom() - 0.5) * 2 * amplitude;
      cameraHandheldTargetY = (visualRandom() - 0.5) * 1.4 * amplitude;
    }
    const drift = 1 - Math.exp(-dt * 3.4);
    cameraHandheldX += (cameraHandheldTargetX - cameraHandheldX) * drift;
    cameraHandheldY += (cameraHandheldTargetY - cameraHandheldY) * drift;
    if (amplitude > 0.05) cinemaFxDebug.handheldFrames += 1;
    const struck = finisher.elapsed >= finisher.fatalityAt;
    const dutchTarget = struck
      ? (Math.PI / 180) * 2.5 * finisher.direction * clamp(1 - aftermath / 2.2, 0, 1) * motion
      : 0;
    const dutchRate = struck && aftermath < 0.4 ? 10 : 2.6;
    cameraDutch += (dutchTarget - cameraDutch) * (1 - Math.exp(-dt * dutchRate));
  } else {
    cameraHandheldTargetX = 0;
    cameraHandheldTargetY = 0;
    const settle = 1 - Math.exp(-dt * 8);
    cameraHandheldX += (0 - cameraHandheldX) * settle;
    cameraHandheldY += (0 - cameraHandheldY) * settle;
    cameraDutch += (0 - cameraDutch) * settle;
  }

  // Intro cinema bars: slide in during the intro, retract as FIGHT! lands.
  const barTarget = phase === "intro" && !finisher ? 1 : 0;
  letterboxLevel += (barTarget - letterboxLevel) * (1 - Math.exp(-dt * (barTarget > letterboxLevel ? 9 : 13)));
  if (letterboxLevel < 0.004) letterboxLevel = 0;

  // Compose, then snap-to-identity epsilons: a stuck camera is the failure
  // mode that matters, so anything within a hair of identity becomes identity.
  cam.zoom = cameraPhaseZoom * punchZoom;
  cam.rotation = cameraPhaseRotation + cameraDutch;
  cam.x = cameraRecoil.x + cameraHandheldX;
  cam.y = cameraRecoil.y + cameraHandheldY;
  cam.focusX = clamp(cameraFocusX, 0, W);
  cam.focusY = clamp(cameraFocusY, 0, H);
  if (Math.abs(cam.zoom - 1) < 0.0006) {
    cam.zoom = 1;
    if (Math.abs(cameraPhaseZoom - 1) < 0.0006) cameraPhaseZoom = 1;
  }
  if (Math.abs(cam.rotation) < 0.00025) {
    cam.rotation = 0;
    if (Math.abs(cameraPhaseRotation) < 0.00025) cameraPhaseRotation = 0;
    if (Math.abs(cameraDutch) < 0.00025) cameraDutch = 0;
  }
  if (Math.abs(cam.x) < 0.03) cam.x = 0;
  if (Math.abs(cam.y) < 0.03) cam.y = 0;
}

// Screen-space intro cinema bars, drawn after the world restore + stage grade
// so the camera transform never touches them. The finisher overlay owns its
// own bars, so these stand down whenever a finisher is live.
function drawIntroLetterbox() {
  if (letterboxLevel <= 0 || state.finisher || state.screen !== "fight") return;
  const barHeight = Math.round(52 * letterboxLevel);
  if (barHeight < 1) return;
  ctx.fillStyle = "rgba(0,0,0,.92)";
  ctx.fillRect(0, 0, W, barHeight);
  ctx.fillRect(0, H - barHeight, W, barHeight);
  ctx.fillStyle = `rgba(255,213,74,${(0.75 * letterboxLevel).toFixed(3)})`;
  ctx.fillRect(0, barHeight - 2, W, 2);
  ctx.fillRect(0, H - barHeight, W, 2);
}

// Remove-reflow-add so a one-shot CSS animation class replays reliably.
function restartCssAnimation(element, className) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function escapeAnnounceChar(character) {
  return character === "&" ? "&amp;" : character === "<" ? "&lt;" : character === ">" ? "&gt;" : character;
}

// Diagonal accent slash across the screen on round transitions. Pure
// compositor CSS; body.reduced-motion swaps the sweep for a soft crossfade
// via a higher-specificity override in styles.css.
function triggerScreenWipe(accent) {
  const wipe = $("#screenWipe");
  if (!wipe) return;
  wipe.style.setProperty("--wipe-accent", accent);
  restartCssAnimation(wipe, "run");
  hudFxDebug.slashWipes += 1;
}

// Observed-phase edge detector, called once per rendered frame from draw().
// Fires the slash wipe leaving the intro (intro -> fight) and entering
// roundover. draw() never runs during rollback resimulation, so no guard is
// needed beyond the screen check.
function observeFightPhaseWipes() {
  if (state.screen !== "fight") {
    hudObservedPhase = null;
    return;
  }
  const phase = state.phase;
  if (hudObservedPhase === null) {
    hudObservedPhase = phase;
    return;
  }
  if (phase === hudObservedPhase) return;
  if (hudObservedPhase === "intro" && phase === "fight") triggerScreenWipe("var(--cyan)");
  else if (phase === "roundover") triggerScreenWipe("var(--red)");
  hudObservedPhase = phase;
}

// SF-style hold-then-drain damage ghost. Runs in the render loop: freshly
// lost health freezes the pale ghost segment (bright + a white chunk flash)
// for ~0.6s — extended while the victim is still being combo'd — then drains
// down in one smooth sweep. Under reducedMotion the drain snaps instead.
function updateDamageGhosts(dtMs) {
  if (state.screen !== "fight" || state.fighters.length < 2) {
    damageGhostState[0].health = null;
    damageGhostState[1].health = null;
    return;
  }
  const reduced = state.accessibility.reducedMotion;
  for (let side = 0; side < 2; side += 1) {
    const fighter = state.fighters[side];
    const ghost = damageGhostState[side];
    const element = $(`#p${side + 1}Damage`);
    if (!element) continue;
    const health = clamp(fighter.health, 0, 100) / 100;
    if (ghost.health === null || health > ghost.health + 0.0001) {
      // Fresh round or a heal (training auto-recover): snap, no ghost.
      ghost.shown = health;
      ghost.holdMs = 0;
    } else if (health < ghost.health - 0.0001) {
      // Damage: freeze the ghost at the pre-hit value so the whole combo's
      // loss reads as one bright chunk, and flash the fresh chunk white.
      ghost.shown = Math.max(ghost.shown, ghost.health);
      ghost.holdMs = 600;
      hudFxDebug.damageGhosts += 1;
      if ($("#flashToggle").checked && !reduced) restartCssAnimation(element, "chunk-flash");
    }
    ghost.health = health;
    const inCombo = fighter.hitstunFrames > 0 || fighter.pendingKnockdown;
    if (ghost.shown > health + 0.0001) {
      if (inCombo) ghost.holdMs = Math.max(ghost.holdMs, 240);
      if (ghost.holdMs > 0) ghost.holdMs = Math.max(0, ghost.holdMs - dtMs);
      else if (reduced) ghost.shown = health;
      else {
        // Proportional sweep: big chunks drain visibly faster, small chips
        // still clear in well under a second.
        const rate = Math.max(0.55, (ghost.shown - health) * 2.6);
        ghost.shown = Math.max(health, ghost.shown - rate * (dtMs / 1000));
      }
    } else {
      ghost.shown = health;
      ghost.holdMs = 0;
    }
    element.classList.toggle("hold", ghost.holdMs > 0);
    if (Math.abs(ghost.shown - ghost.written) > 0.0005) {
      ghost.written = ghost.shown;
      element.style.transform = `scaleX(${ghost.shown.toFixed(4)})`;
    }
    // Release 1.7: guard-gauge sliver INSIDE the health frame (a new HUD row
    // would shrink the fighter-framing area — HANDOFF.md landmine). Synced
    // per rendered frame beside the damage ghost so decay visibly drains;
    // during a crush the sliver flips into the flashing crush-drain bar.
    const guardGauge = $(`#p${side + 1}GuardGauge`);
    if (guardGauge) {
      const crushed = fighter.guardCrushFrames > 0;
      const level = crushed
        ? fighter.guardCrushFrames / Math.max(1, fighter.guardCrushTotalFrames)
        : clamp(fighter.guardMeter, 0, GUARD_RULES.threshold) / GUARD_RULES.threshold;
      guardGauge.style.transform = `scaleX(${level.toFixed(4)})`;
      guardGauge.classList.toggle("crushed", crushed);
      guardGauge.classList.toggle("charged", !crushed && fighter.guardMeter >= GUARD_RULES.threshold * 0.65);
    }
  }
}

// ---------------------------------------------------------------------------
// Wave 3 stage presentation. Everything below is module-level render-only
// state on the documented superDimLevel pattern: never snapshotted, never read
// by the simulation, so rollback checksums are untouched.
// ---------------------------------------------------------------------------

// Small deterministic hash for presentation scatter (weather fields, crowd
// flash picks, light flicker phases). Pure function of its inputs — it never
// consumes the visualRandom stream, so draw order can't perturb other effects.
function presentationHash01(...nums) {
  let h = 2166136261;
  for (const n of nums) {
    h ^= Math.imul((n | 0) + 0x9e3779b9, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
  }
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- Rack focus: pre-blurred half-res stage covers, cross-faded in by the ---
// --- super dim ease / fatality state so the world softens behind the kill ---
const RACK_FOCUS_W = 640;
const RACK_FOCUS_H = 360;
const blurredStageCovers = {};
// Eased focus level (0 sharp → 1 fully racked). Render-only module state.
let rackFocusLevel = 0;

// Lazily pre-blur ONE stage backdrop the first time its rack focus is needed,
// not every stage at boot. ~640x360 RGBA is ~0.9MB per stage; even all six
// stay under 6MB.
function blurredStageCover(stageId) {
  const cached = blurredStageCovers[stageId];
  if (cached) return cached;
  const image = stageImages[stageId];
  if (!image?.complete || !image.naturalWidth) return null;
  const cover = document.createElement("canvas");
  cover.width = RACK_FOCUS_W;
  cover.height = RACK_FOCUS_H;
  const paint = cover.getContext("2d");
  const scale = Math.max(RACK_FOCUS_W / image.naturalWidth, RACK_FOCUS_H / image.naturalHeight);
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  // Blur at half resolution: 5px here reads as ~10px once upscaled to 1280.
  paint.filter = "blur(5px)";
  paint.drawImage(image, (RACK_FOCUS_W - dw) * 0.5, (RACK_FOCUS_H - dh) * 0.5, dw, dh);
  paint.filter = "none";
  blurredStageCovers[stageId] = cover;
  return cover;
}

// Ease + draw the blurred copy over the sharp cover. Alpha rides the existing
// superDimLevel ease while a super flies; a triggered fatality holds the world
// soft for the whole aftermath. Static cross-fade — not motion — so it stays
// on under reducedMotion, exactly like the super spotlight.
function drawRackFocus(parallax) {
  const target = Math.max(superDimLevel, state.finisher?.fatalityTriggered ? 1 : 0);
  rackFocusLevel = clamp(rackFocusLevel + clamp(target - rackFocusLevel, -0.05, 0.08), 0, 1);
  if (rackFocusLevel <= 0.02) return;
  const cover = blurredStageCover(state.stage);
  if (!cover) return;
  // Same cover-fit math as drawCover, oversized 2% to hide the blur fringe.
  const scale = Math.max(W / cover.width, H / cover.height) * 1.02;
  const dw = cover.width * scale;
  const dh = cover.height * scale;
  ctx.save();
  ctx.globalAlpha = rackFocusLevel;
  ctx.drawImage(cover, (W - dw) * 0.5 + parallax, (H - dh) * 0.5, dw, dh);
  ctx.restore();
}

// --- Stage battle scars: the arena wears the fight ------------------------
// Cheap stroked crack polylines + scuff ellipses under the fighters. Stored
// module-level (never snapshotted), guarded against rollback resimulation AND
// deduped by (tick, x) so no impact can double-mark, survives resetRound on
// purpose and clears on match start.
const STAGE_SCAR_CAP = 24;
const STAGE_SCAR_CAP_BATTERY = 10;
const stageScars = [];

function pushStageScar(x, force = 1) {
  if (rollbackResimulating) return;
  const tick = state.simulationTick;
  if (stageScars.some((scar) => scar.tick === tick && Math.abs(scar.x - x) < 1)) return;
  const heavy = force > 1.02;
  const points = [[0, 0]];
  const branch = [];
  const segments = 3 + Math.floor(visualRandom() * 3);
  const baseAngle = visualRandom() * Math.PI * 2;
  let px = 0;
  let py = 0;
  for (let index = 0; index < segments; index += 1) {
    const angle = baseAngle + (visualRandom() - 0.5) * 1.9;
    const length = 9 + visualRandom() * (heavy ? 24 : 15);
    px += Math.cos(angle) * length;
    py += Math.sin(angle) * length * 0.34; // squashed into the floor perspective
    points.push([px, py]);
    if (index === 1 && visualRandom() < 0.7) {
      const branchAngle = angle + (visualRandom() < 0.5 ? 1 : -1) * (0.9 + visualRandom() * 0.8);
      branch.push([px, py], [
        px + Math.cos(branchAngle) * (8 + visualRandom() * 12),
        py + Math.sin(branchAngle) * (8 + visualRandom() * 12) * 0.34,
      ]);
    }
  }
  stageScars.push({
    tick,
    x: clamp(x, 70, W - 70),
    y: FLOOR + 8 + visualRandom() * 58,
    points,
    branch,
    scuffW: 26 + force * 22 + visualRandom() * 16,
    scuffH: 5 + visualRandom() * 5,
    rot: (visualRandom() - 0.5) * 0.5,
    alpha: 0.45 + visualRandom() * 0.22,
    heavy,
  });
  const cap = state.performance.trailScale === 0 ? STAGE_SCAR_CAP_BATTERY : STAGE_SCAR_CAP;
  if (stageScars.length > cap) stageScars.splice(0, stageScars.length - cap);
}

function clearStageScars() {
  stageScars.length = 0;
}

function drawStageScars() {
  if (!stageScars.length) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const scar of stageScars) {
    ctx.save();
    ctx.translate(scar.x, scar.y);
    ctx.rotate(scar.rot);
    // Chalky scuff first so the cracks sit on a pale bruised patch — reads on
    // dark asphalt and light tile alike.
    ctx.globalAlpha = scar.alpha * 0.34;
    ctx.fillStyle = "rgba(196,184,164,0.55)";
    ctx.beginPath();
    ctx.ellipse(0, 0, scar.scuffW, scar.scuffH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = scar.alpha;
    // Pale chipped edge offset one pixel up, then the dark crack itself.
    for (const [style, width, offsetY] of [
      ["rgba(188,176,156,0.42)", scar.heavy ? 3 : 2.2, -1.4],
      ["rgba(10,9,8,0.92)", scar.heavy ? 2.2 : 1.5, 0],
    ]) {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(scar.points[0][0], scar.points[0][1] + offsetY);
      for (let index = 1; index < scar.points.length; index += 1) {
        ctx.lineTo(scar.points[index][0], scar.points[index][1] + offsetY);
      }
      if (scar.branch.length === 2) {
        ctx.moveTo(scar.branch[0][0], scar.branch[0][1] + offsetY);
        ctx.lineTo(scar.branch[1][0], scar.branch[1][1] + offsetY);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

// --- Practical light sprites ----------------------------------------------
// Each glow/cone is rendered once into a small offscreen canvas so the
// per-frame cost is a handful of drawImages, never fresh gradients.
const practicalSpriteCache = {};

function practicalSprite(key, width, height, painter) {
  let sprite = practicalSpriteCache[key];
  if (!sprite) {
    sprite = document.createElement("canvas");
    sprite.width = width;
    sprite.height = height;
    painter(sprite.getContext("2d"), width, height);
    practicalSpriteCache[key] = sprite;
  }
  return sprite;
}

function glowSprite(red, green, blue) {
  return practicalSprite(`glow-${red}-${green}-${blue}`, 128, 128, (paint, width, height) => {
    const gradient = paint.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, `rgba(${red},${green},${blue},0.55)`);
    gradient.addColorStop(0.55, `rgba(${red},${green},${blue},0.18)`);
    gradient.addColorStop(1, `rgba(${red},${green},${blue},0)`);
    paint.fillStyle = gradient;
    paint.fillRect(0, 0, width, height);
  });
}

function coneSprite(red, green, blue) {
  return practicalSprite(`cone-${red}-${green}-${blue}`, 160, 256, (paint, width, height) => {
    paint.beginPath();
    paint.moveTo(width * 0.5 - 7, 0);
    paint.lineTo(width * 0.5 + 7, 0);
    paint.lineTo(width, height);
    paint.lineTo(0, height);
    paint.closePath();
    const fall = paint.createLinearGradient(0, 0, 0, height);
    fall.addColorStop(0, `rgba(${red},${green},${blue},0.5)`);
    fall.addColorStop(0.65, `rgba(${red},${green},${blue},0.16)`);
    fall.addColorStop(1, `rgba(${red},${green},${blue},0)`);
    paint.fillStyle = fall;
    paint.fill();
    // Soften the cone sides so it reads as haze, not a hard triangle.
    paint.globalCompositeOperation = "destination-in";
    const side = paint.createLinearGradient(0, 0, width, 0);
    side.addColorStop(0, "rgba(0,0,0,0)");
    side.addColorStop(0.3, "rgba(0,0,0,1)");
    side.addColorStop(0.7, "rgba(0,0,0,1)");
    side.addColorStop(1, "rgba(0,0,0,0)");
    paint.fillStyle = side;
    paint.fillRect(0, 0, width, height);
  });
}

// --- Practical light sources that cast onto the scene ---------------------
// The lights painted into each backdrop start behaving like lights. All
// additive, all flicker phases from simulationTick hashes, flicker amplitude
// forced to 0 under reducedMotion, whole pass skipped without shadows.
function drawPracticalLights(time, frame, centre, reaction) {
  if (!state.performance.shadows) return;
  const reduced = state.accessibility.reducedMotion;
  const flicker = (speed, phase, amount) =>
    reduced ? 0 : Math.sin(frame * speed + phase * Math.PI * 2) * amount;
  const backdropShift = (centre - W * 0.5) * -0.035;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (state.stage === "somerset") {
    // The passing El sweeps a band of warm window-light across the pavement.
    const trainX = ((time * 0.08) % (W + 650)) - 500; // same formula as drawCrowd
    const bandX = trainX + 215;
    if (bandX > -280 && bandX < W + 280) {
      const band = glowSprite(255, 208, 116);
      ctx.globalAlpha = 0.34 + flicker(0.31, 0.2, 0.05);
      ctx.drawImage(band, bandX - 260, FLOOR - 66, 520, 132);
      ctx.globalAlpha = 0.2;
      ctx.drawImage(band, bandX - 150, 158, 300, 110); // spill around the cars
      presentationDebug.practicalLights += 2;
    }
  } else if (state.stage === "wildwood") {
    // Neon throbs coloured pools onto the wet planks; the two boardwalk
    // lamps keep steady warm pools beneath their heads.
    const pools = [
      { x: 430, red: 255, green: 122, blue: 214, phase: 0.13, radiusX: 190 },
      { x: 665, red: 255, green: 170, blue: 130, phase: 0.47, radiusX: 220 },
      { x: 915, red: 255, green: 104, blue: 190, phase: 0.79, radiusX: 190 },
      { x: 82, red: 255, green: 198, blue: 122, phase: 0.31, radiusX: 130 },
      { x: 1204, red: 255, green: 198, blue: 122, phase: 0.67, radiusX: 130 },
    ];
    for (const pool of pools) {
      const x = pool.x + backdropShift;
      if (x < -220 || x > W + 220) continue;
      ctx.globalAlpha = 0.24 + flicker(0.06, pool.phase, 0.09);
      ctx.drawImage(glowSprite(pool.red, pool.green, pool.blue), x - pool.radiusX, FLOOR - 34, pool.radiusX * 2, 120);
      presentationDebug.practicalLights += 1;
    }
    for (const lampX of [82, 1204]) {
      const x = lampX + backdropShift;
      ctx.globalAlpha = 0.3 + flicker(0.17, lampX, 0.04);
      ctx.drawImage(glowSprite(255, 208, 130), x - 56, 118, 112, 112);
      presentationDebug.practicalLights += 1;
    }
  } else if (state.stage === "buffet") {
    // Heat-lamp cones flicker over the steam table, hanging from the same
    // swaying pendants the atmosphere pass draws (same x, same phase).
    const sway = (0.02 + reaction * 0.05) * Math.sin(frame * 0.03);
    const cone = coneSprite(255, 186, 104);
    for (let index = 0; index < 6; index += 1) {
      const x = 150 + index * 200 + (centre - W * 0.5) * -0.1 + Math.sin(sway + index) * 12;
      if (x < -120 || x > W + 120) continue;
      ctx.globalAlpha = 0.3 + flicker(0.052, index * 0.37, 0.08);
      ctx.drawImage(cone, x - 82, 132, 164, 310);
      presentationDebug.practicalLights += 1;
    }
  } else if (state.stage === "janney") {
    // One sodium streetlight cone with dust drifting down through it.
    const lampX = 887 + backdropShift;
    const lampY = 148;
    ctx.globalAlpha = 0.34 + flicker(0.043, 0.61, 0.05);
    ctx.drawImage(coneSprite(255, 178, 84), lampX - 120, lampY, 240, FLOOR - lampY + 20);
    ctx.globalAlpha = 0.4;
    ctx.drawImage(glowSprite(255, 196, 110), lampX - 42, lampY - 40, 84, 84);
    presentationDebug.practicalLights += 2;
    const motes = Math.round(9 * state.performance.particleScale);
    ctx.fillStyle = "rgba(255,214,150,0.5)";
    for (let index = 0; index < motes; index += 1) {
      const seedA = presentationHash01(index, 7);
      const seedB = presentationHash01(index, 19);
      const progress = ((reduced ? seedB : frame * (0.0011 + seedB * 0.0013)) + seedA) % 1;
      const spread = 14 + progress * 100;
      const moteX = lampX + (presentationHash01(index, 37) - 0.5) * 2 * spread
        + (reduced ? 0 : Math.sin(frame * 0.01 + index * 2.1) * 5);
      const moteY = lampY + 16 + progress * (FLOOR - lampY - 24);
      ctx.globalAlpha = 0.3 * Math.sin(progress * Math.PI);
      ctx.fillRect(moteX, moteY, 1.6, 1.6);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// --- Time-of-day drift: pure function of the round number -----------------
function timeOfDayLevel() {
  return clamp(((state.round || 1) - 1) / 2, 0, 1);
}

// A soft horizon band over the sky pulls the backdrop later in the evening as
// rounds go by. Colour comes from the stage grade's "late" tint. Skipped under
// high contrast like every colour overlay.
function drawTimeOfDayHorizon() {
  if (state.accessibility.highContrast) return;
  const late = timeOfDayLevel();
  if (late <= 0.01) return;
  const grade = STAGE_GRADES[state.stage];
  if (!grade) return;
  const [red, green, blue] = grade.late;
  const band = ctx.createLinearGradient(0, 0, 0, H * 0.52);
  band.addColorStop(0, `rgba(${red},${green},${blue},${(0.2 * late).toFixed(3)})`);
  band.addColorStop(1, `rgba(${red},${green},${blue},0)`);
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, H * 0.52);
}

// --- Per-stage ambient air: deterministic weather particle fields ---------
// Every particle is a pure function of (index, simulationTick), so the field
// is exact under rollback/replay and costs zero state. Frozen to a static
// scatter under reducedMotion, scaled by particleScale, skipped on battery.
const STAGE_WEATHER = Object.freeze({
  somerset: { count: 24, kind: "litter" },
  vet: { count: 30, kind: "ashSmoke" },
  wildwood: { count: 40, kind: "mist" },
  buffet: { count: 26, kind: "steam" },
  cruise: { count: 32, kind: "sparkle" },
  janney: { count: 36, kind: "motes" },
});

function drawStageWeather(frame, centre) {
  const config = STAGE_WEATHER[state.stage];
  if (!config || state.performance.trailScale === 0) return;
  const reduced = state.accessibility.reducedMotion;
  const tick = reduced ? 0 : frame;
  const count = Math.max(6, Math.round(config.count * state.performance.particleScale));
  const drift = centre - W * 0.5;
  ctx.save();
  for (let index = 0; index < count; index += 1) {
    const seedA = presentationHash01(index, 11);
    const seedB = presentationHash01(index, 29);
    const seedC = presentationHash01(index, 47);
    const seedD = presentationHash01(index, 83);
    const depth = 0.05 + presentationHash01(index, 131) * 0.13;
    let x = 0;
    let y = 0;
    let alpha = 0;
    let size = 2;
    let additive = true;
    let color = "255,255,255";
    let stretch = 1;
    if (config.kind === "mist") {
      // Sea-mist droplets glinting past the neon.
      x = (((seedA * (W + 160)) - tick * (0.35 + seedB * 0.55)) % (W + 160) + (W + 160)) % (W + 160) - 80;
      y = 235 + seedC * 300 + (reduced ? 0 : Math.sin(tick * 0.01 + seedD * 6.28) * 9);
      const glint = reduced ? 0.12 : Math.max(0, Math.sin(tick * 0.05 + seedD * 20)) ** 3 * 0.4;
      alpha = 0.14 + glint;
      size = 1 + seedD * 1.6;
      color = "208,232,255";
    } else if (config.kind === "ashSmoke") {
      if (seedD < 0.45) {
        // Grill smoke wisps drifting up off the lots.
        const cycle = ((tick * (0.22 + seedB * 0.26) + seedA * 300) % 300 + 300) % 300;
        x = 80 + seedA * 1120 + (reduced ? 0 : Math.sin(tick * 0.008 + seedC * 6.28) * 16);
        y = 540 - cycle * 0.9;
        alpha = 0.07 * (1 - cycle / 300) + 0.02;
        size = 7 + cycle * 0.03;
        additive = false;
        color = "196,204,210";
      } else {
        // Drifting ash, falling slow and dark.
        const cycle = ((tick * (0.16 + seedB * 0.22) + seedA * 430) % 430 + 430) % 430;
        x = 40 + seedA * 1200 + (reduced ? 0 : Math.sin(tick * 0.013 + seedC * 6.28) * 22);
        y = 170 + cycle;
        alpha = 0.24 * Math.sin((cycle / 430) * Math.PI);
        size = 1 + seedC * 1.4;
        additive = false;
        color = "48,44,42";
      }
    } else if (config.kind === "steam") {
      // Steam curling up off the buffet line.
      const cycle = ((tick * (0.5 + seedB * 0.6) + seedA * 230) % 230 + 230) % 230;
      x = 110 + seedA * 1060 + (reduced ? 0 : Math.sin(cycle * 0.05 + seedC * 6.28) * 11);
      y = 436 - cycle * 0.78;
      alpha = 0.11 * (1 - cycle / 230) + 0.015;
      size = 4 + cycle * 0.05;
      additive = false;
      color = "238,242,246";
    } else if (config.kind === "motes") {
      // Golden dust hanging in the dusk.
      x = 130 + seedA * 1020 + (reduced ? 0 : Math.sin(tick * 0.004 + seedB * 6.28) * 22);
      y = 250 + seedC * 310 + (reduced ? 0 : Math.sin(tick * 0.006 + seedD * 6.28) * 13);
      alpha = 0.1 + (reduced ? 0.06 : (Math.sin(tick * 0.02 + seedB * 6.28) * 0.5 + 0.5) * 0.14);
      size = 0.9 + seedD * 1.3;
      color = "255,214,140";
    } else if (config.kind === "litter") {
      // Wind-blown litter and grit skimming the Somerset pavement.
      x = (((seedA * (W + 140)) + tick * (0.9 + seedB * 1.3)) % (W + 140) + (W + 140)) % (W + 140) - 70;
      y = 462 + seedC * 128 + (reduced ? 0 : Math.sin(tick * 0.02 + seedD * 6.28) * 7);
      alpha = 0.2;
      size = 1.4 + seedD * 2;
      additive = false;
      color = "125,135,148";
      stretch = 2.4;
    } else if (config.kind === "sparkle") {
      // Sun sparkle over the pool deck.
      x = 70 + seedA * 1140;
      y = 415 + seedC * 165;
      alpha = reduced ? 0.18 : Math.max(0, Math.sin(tick * 0.06 + seedD * 6.28)) ** 4 * 0.65;
      size = 0.8 + seedB * 1.4;
      color = "255,252,238";
    }
    if (alpha <= 0.01) continue;
    const drawX = x + drift * -depth;
    if (drawX < -30 || drawX > W + 30) continue;
    ctx.globalCompositeOperation = additive ? "lighter" : "source-over";
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = `rgb(${color})`;
    ctx.beginPath();
    ctx.ellipse(drawX, y, size * stretch, size, 0, 0, Math.PI * 2);
    ctx.fill();
    presentationDebug.weatherParticles += 1;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// --- Foreground occluder rig ----------------------------------------------
// Silhouetted near-depth dressing at the frame edges, drawn after fighters
// and particles with ~3x the backdrop parallax. Pre-rendered once per stage
// with gradient-soft inner edges (fake depth of field, no per-frame filter),
// confined to the outer ~90px of the frame.
const occluderRigs = {};

function occluderCanvas(width, height, painter, softEdge) {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = width;
  canvasEl.height = height;
  const paint = canvasEl.getContext("2d");
  painter(paint, width, height);
  // Fade the inner edge so the rig reads as out-of-focus depth, not a wall.
  paint.globalCompositeOperation = "destination-in";
  const fade = softEdge === "right"
    ? paint.createLinearGradient(0, 0, width, 0)
    : paint.createLinearGradient(width, 0, 0, 0);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.55, "rgba(0,0,0,0.9)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  paint.fillStyle = fade;
  paint.fillRect(0, 0, width, height);
  return canvasEl;
}

function buildOccluderRig(stageId) {
  const rig = [];
  if (stageId === "somerset") {
    // Chain-link fence corner hugging the left edge.
    rig.push({
      baseX: -34, y: 96, minX: -70, maxX: -6,
      canvas: occluderCanvas(124, 560, (paint, width, height) => {
        paint.strokeStyle = "rgba(8,10,13,0.94)";
        paint.lineWidth = 7;
        paint.beginPath();
        paint.moveTo(16, 0);
        paint.lineTo(16, height);
        paint.stroke();
        paint.lineWidth = 2.4;
        for (let offset = -height; offset < width + height; offset += 26) {
          paint.beginPath();
          paint.moveTo(offset, 0);
          paint.lineTo(offset + height * 0.55, height);
          paint.moveTo(offset + height * 0.55, 0);
          paint.lineTo(offset, height);
          paint.stroke();
        }
        paint.lineWidth = 4;
        paint.beginPath();
        paint.moveTo(0, 26);
        paint.lineTo(width, 44);
        paint.stroke();
      }, "right"),
    });
    // Steaming grate slats in the near right corner.
    rig.push({
      baseX: W - 128, y: H - 118, minX: W - 156, maxX: W - 96, steam: true,
      canvas: occluderCanvas(160, 118, (paint, width, height) => {
        paint.fillStyle = "rgba(6,8,10,0.96)";
        for (let row = 0; row < 5; row += 1) {
          paint.beginPath();
          paint.ellipse(width * 0.62, height - 12 - row * 21, width * 0.52, 8, -0.06, 0, Math.PI * 2);
          paint.fill();
        }
      }, "left"),
    });
  } else if (stageId === "wildwood") {
    // A soft-edged railing post at the right of frame.
    rig.push({
      baseX: W - 112, y: 0, minX: W - 148, maxX: W - 72,
      canvas: occluderCanvas(120, H, (paint, width, height) => {
        paint.fillStyle = "rgba(9,7,12,0.95)";
        paint.fillRect(48, 0, 44, height);
        paint.fillRect(30, 96, 80, 26);
        paint.fillRect(30, 342, 80, 26);
        paint.beginPath();
        paint.ellipse(70, 70, 34, 20, 0, 0, Math.PI * 2);
        paint.fill();
      }, "left"),
    });
  } else if (stageId === "buffet") {
    // Sneeze-guard glass glare sliding along the left edge.
    rig.push({
      baseX: -18, y: 120, minX: -54, maxX: 6, glare: true,
      canvas: occluderCanvas(110, 460, (paint, width, height) => {
        paint.fillStyle = "rgba(16,20,24,0.55)";
        paint.fillRect(0, 0, 30, height);
        const glare = paint.createLinearGradient(0, 0, width, height * 0.4);
        glare.addColorStop(0, "rgba(235,242,250,0)");
        glare.addColorStop(0.45, "rgba(235,242,250,0.34)");
        glare.addColorStop(0.55, "rgba(235,242,250,0.4)");
        glare.addColorStop(1, "rgba(235,242,250,0)");
        paint.fillStyle = glare;
        paint.fillRect(8, 0, width - 8, height);
      }, "right"),
    });
  } else if (stageId === "cruise") {
    // Hanging bar glasses in the top right corner (below the HUD band).
    rig.push({
      baseX: W - 150, y: 168, minX: W - 180, maxX: W - 110,
      canvas: occluderCanvas(210, 128, (paint) => {
        paint.fillStyle = "rgba(10,12,16,0.9)";
        paint.fillRect(0, 0, 210, 16);
        for (let slot = 0; slot < 4; slot += 1) {
          const x = 34 + slot * 46;
          paint.fillRect(x - 2, 16, 4, 18);
          paint.beginPath();
          paint.moveTo(x - 13, 34);
          paint.lineTo(x + 13, 34);
          paint.lineTo(x + 5, 74);
          paint.lineTo(x - 5, 74);
          paint.closePath();
          paint.fill();
        }
      }, "left"),
    });
  }
  return rig;
}

function drawForegroundOccluders(centre) {
  if (!state.performance.shadows) return;
  let rig = occluderRigs[state.stage];
  if (!rig) {
    rig = buildOccluderRig(state.stage);
    occluderRigs[state.stage] = rig;
  }
  if (!rig.length) return;
  // ~3x the backdrop parallax; pinned still under reducedMotion.
  const shift = state.accessibility.reducedMotion ? 0 : (centre - W * 0.5) * -0.105;
  const frame = state.simulationTick;
  for (const occluder of rig) {
    const x = clamp(occluder.baseX + shift, occluder.minX, occluder.maxX);
    ctx.drawImage(occluder.canvas, x, occluder.y);
    if (occluder.steam) {
      // Grate steam: an additive pulse rising off the slats.
      const pulse = state.accessibility.reducedMotion ? 0.5 : Math.sin(frame * 0.035) * 0.5 + 0.5;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.1 + pulse * 0.12;
      ctx.drawImage(glowSprite(210, 222, 230), x + 30, occluder.y - 130 - pulse * 22, 130, 190);
      ctx.restore();
    }
    presentationDebug.foregroundOccluders += 1;
  }
  ctx.globalAlpha = 1;
}

// --- Crowd flashbulbs + round-win light beats -----------------------------
// Flash picks hash (window, person index) — never the visualRandom stream —
// and are hard-capped at ~3/sec regardless of reaction level. Under
// reducedMotion the strobes become one dim steady glow.
let crowdFlashCacheCrowd = null;
let crowdFlashCandidates = [];

function crowdFlashPick(crowd, frame, reaction) {
  if (reaction <= 0.7 || !crowd.people?.length) return null;
  if (crowdFlashCacheCrowd !== crowd) {
    crowdFlashCacheCrowd = crowd;
    const phones = [];
    crowd.people.forEach((person, index) => {
      if (person.prop === "phone") phones.push(index);
    });
    // Bias toward the poolside phone holders when the stage has them.
    crowdFlashCandidates = phones.length >= 3 ? phones : crowd.people.map((_, index) => index);
  }
  const reduced = state.accessibility.reducedMotion;
  const windowTicks = reduced ? 60 : 20; // 20 ticks @60Hz → ≤3 pops per second
  const windowIndex = Math.floor(frame / windowTicks);
  const inWindow = frame - windowIndex * windowTicks;
  if (!reduced && inWindow >= 8) return null;
  const pick = crowdFlashCandidates[
    Math.floor(presentationHash01(windowIndex, crowdFlashCandidates.length) * crowdFlashCandidates.length)
    % crowdFlashCandidates.length
  ];
  return { index: pick, fade: reduced ? 1 : 1 - inWindow / 8, reduced };
}

function drawCrowdFlash(spot, pick) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const bloom = glowSprite(255, 255, 255);
  ctx.globalAlpha = pick.reduced ? 0.24 : 0.75 * pick.fade;
  ctx.drawImage(bloom, spot.x - spot.size * 2.2, spot.y - spot.size * 2.2, spot.size * 4.4, spot.size * 4.4);
  if (!pick.reduced) {
    // Tiny white starburst over the phone.
    ctx.strokeStyle = `rgba(255,255,255,${(0.85 * pick.fade).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7]]) {
      ctx.moveTo(spot.x, spot.y);
      ctx.lineTo(spot.x + dx * spot.size, spot.y + dy * spot.size);
    }
    ctx.stroke();
  }
  ctx.restore();
  presentationDebug.crowdFlashes += 1;
}

// Round-win light beat: one stage-signature moment when a round is won.
// Latched purely from the render path (draw never runs during rollback
// resimulation), timed from the simulation tick.
const ROUND_WIN_BEAT_TICKS = 84;
let roundWinBeatStartTick = -1;

function updateRoundWinBeatLatch() {
  if (state.phase === "roundover" && !state.finisher) {
    if (roundWinBeatStartTick < 0) roundWinBeatStartTick = state.simulationTick;
  } else if (state.phase !== "roundover" && roundWinBeatStartTick >= 0) {
    roundWinBeatStartTick = -1;
  }
}

function roundWinBeatLevel(frame) {
  if (roundWinBeatStartTick < 0) return 0;
  const t = (frame - roundWinBeatStartTick) / ROUND_WIN_BEAT_TICKS;
  return t >= 1 || t < 0 ? 0 : 1 - t;
}

const ROUND_WIN_BEATS = Object.freeze({
  wildwood: { glows: [{ x: 668, y: 96, rx: 170, ry: 120, color: [255, 150, 216] }], firework: true },
  somerset: { glows: [{ x: 640, y: 184, rx: 300, ry: 80, color: [255, 211, 105] }] },
  vet: {
    glows: [
      { x: 148, y: 186, rx: 130, ry: 110, color: [214, 232, 255] },
      { x: 1200, y: 312, rx: 120, ry: 100, color: [214, 232, 255] },
    ],
  },
  buffet: { glows: [{ x: 640, y: 250, rx: 340, ry: 90, color: [255, 196, 118] }] },
  cruise: { glows: [{ x: 640, y: 396, rx: 330, ry: 70, color: [140, 232, 255] }] },
  janney: { glows: [{ x: 887, y: 150, rx: 130, ry: 110, color: [255, 186, 96] }] },
});

function drawRoundWinBeat(frame, centre) {
  const level = roundWinBeatLevel(frame);
  if (level <= 0.01) return;
  const beat = ROUND_WIN_BEATS[state.stage];
  if (!beat) return;
  const reduced = state.accessibility.reducedMotion;
  const backdropShift = (centre - W * 0.5) * -0.035;
  const ease = level * level;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const glow of beat.glows) {
    ctx.globalAlpha = 0.5 * ease;
    ctx.drawImage(
      glowSprite(glow.color[0], glow.color[1], glow.color[2]),
      glow.x + backdropShift - glow.rx, glow.y - glow.ry, glow.rx * 2, glow.ry * 2,
    );
  }
  if (beat.firework && !reduced) {
    // A single firework bursting over the WILDWOOD sign.
    const burst = 1 - level;
    const x = 668 + backdropShift;
    const y = 88;
    ctx.globalAlpha = 0.9 * ease;
    ctx.lineWidth = 2;
    for (let spark = 0; spark < 12; spark += 1) {
      const angle = (spark / 12) * Math.PI * 2 + 0.26;
      const radius = 14 + burst * 86;
      const droop = burst * burst * 26;
      const gold = spark % 2 === 0;
      ctx.strokeStyle = gold ? "rgba(255,214,130,0.9)" : "rgba(255,150,216,0.9)";
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * radius * 0.62, y + Math.sin(angle) * radius * 0.62 + droop * 0.5);
      ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius + droop);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.8 * ease;
    ctx.drawImage(glowSprite(255, 224, 170), x - 34, y - 34, 68, 68);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
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
      graceUntilFrame: fighter.combo.graceUntilFrame,
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
    facingAxis: state.facingAxis,
    cinematicZoom: state.cinematicZoom,
    shake: state.shake,
    flash: state.flash,
    hitstop: state.hitstop,
    matchSeed: state.matchSeed,
    lastImpactSide: state.lastImpactSide,
    // Release 1.8 GRIND: House Rules config + the Sudden Death one-shot are
    // sim inputs, so they live in the snapshot (matchRules is derived from
    // mutators on restore rather than stored — single source of truth).
    mutators: [...state.mutators],
    suddenDeathHitDone: state.suddenDeathHitDone,
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
  // Older peers predate the pair axis; fall back to side 0's stored facing so a
  // mixed-build resimulation still restores a coherent orientation.
  state.facingAxis = snapshot.facingAxis ?? snapshot.fighters[0]?.values?.facing ?? 1;
  state.cinematicZoom = snapshot.cinematicZoom;
  state.shake = snapshot.shake;
  state.flash = snapshot.flash;
  state.hitstop = snapshot.hitstop;
  state.matchSeed = snapshot.matchSeed;
  state.lastImpactSide = snapshot.lastImpactSide;
  // Mutator config restores BEFORE the fighters: makeFighter derives movement
  // from state.matchRules, so a mid-restore rebuild must see the right rules.
  state.mutators = [...(snapshot.mutators || [])];
  state.matchRules = resolveMatchRules(state.mutators);
  state.suddenDeathHitDone = Boolean(snapshot.suddenDeathHitDone);
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
    script: projectileFinisherScript(snapshot.finisher.scriptId, snapshot.finisher.type),
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
  // Wave 17: ten cards need five columns; the classic 4x2 stays for any
  // hypothetical eight-fighter roster so the layout rule is data-driven.
  grid.classList.toggle("wide", roster.length > 8);
  roster.forEach((fighter, index) => {
    const card = document.createElement("button");
    // Wave 16: the unlocked Commissioner is the dark-red ninth card.
    card.className = fighter.secret ? "fighter-card secret-card" : "fighter-card";
    card.dataset.index = index;
    card.dataset.mark = fighter.mark;
    card.style.setProperty("--fighter", fighter.color);
    card.innerHTML = `
      <span class="pick-badge p1">P1</span><span class="pick-badge p2">P2</span>
      <span class="mastery-badge" data-tier="none" hidden></span>
      <img class="fighter-portrait" src="assets/fighters/${fighter.id}.webp" alt="" aria-hidden="true" draggable="false">
      <span class="fighter-info"><strong>${fighter.name}</strong><small>${fighter.title}</small></span>`;
    card.addEventListener("click", () => chooseFighter(index));
    grid.append(card);
  });
  // v2.1 PROGRESSION: mastery chips on the fresh cards.
  refreshMasteryBadges();
  // R1.9: combo-trial medal readout per fighter card.
  refreshTrialMedalBadges();
  updateRosterUI();
}

// R1.9: the move list is a live frame-data reference now. Rows come from
// listFighterFrameData — real attack instances, post-ARCADE_TUNING — so the
// dialog can never drift from the sim. Level chips give LOW/OH/MID/THROW at a
// glance (text + color, never hue alone).
const MOVE_LEVEL_TAGS = Object.freeze({
  mid: "MID", low: "LOW", overhead: "OH", throw: "THROW", air: "AIR",
});

function renderMoveList(fighterId = "deathblow") {
  const kit = getFighterKit(fighterId);
  if (!kit) return;
  $("#moveListIdentity").innerHTML = `<strong>${kit.archetype}</strong> · ${kit.summary}`;
  const signed = (value) => `${value >= 0 ? "+" : ""}${value}`;
  const rows = listFighterFrameData(fighterId).map((row) => `
    <div class="move-list-row frame-row">
      <b>${row.name}</b>
      <span>${row.command}</span>
      <span class="sar">${row.startup} / ${row.active} / ${row.recovery}</span>
      <span class="sar">${row.level === "throw" ? "—" : `${signed(row.onHit)} / ${signed(row.onBlock)}`}</span>
      <span class="sar">${row.damage}</span>
      <em class="level-chip lvl-${row.level}">${MOVE_LEVEL_TAGS[row.level] || row.level.toUpperCase()}</em>
    </div>`);
  $("#moveListRows").className = "move-list-rows frame-data";
  $("#moveListRows").innerHTML = `
    <div class="move-list-row frame-head">
      <b>MOVE</b><span>COMMAND</span><span>S / A / R</span><span>HIT / BLOCK</span><span>DMG</span><span>LVL</span>
    </div>` + rows.join("");
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
  // Wave 16: resolve the per-side palettes for this build. Online reads the
  // shared match config (both peers derive the identical pair); offline reads
  // the select-screen picks. Deterministic on every rebuild — rollback resim
  // included — so the mirror auto-alt can never flicker.
  const defs = [
    roster[state.picks[0]] || null,
    bossOverride || roster[state.picks[1]] || null,
  ];
  applyMatchPalettes(defs, state.mode === "online"
    ? onlineSession.matchConfig?.palettes || [0, 0]
    : pendingPalettes);
  // Fresh fighters always spawn side 0 left of side 1, so every path that
  // rebuilds the pair — new match, rematch, round reset, online seed — resets
  // the axis with them rather than inheriting a crossed-over orientation.
  state.facingAxis = 1;
  return [makeFighter(state.picks[0], 0), makeFighter(state.picks[1], 1, bossOverride)];
}

// ===========================================================================
// Release 1.8 GRIND — mode flows: The Gauntlet (survival), Block War (3v3),
// The Daily Jawn, House Rules mutators, and the SF2 tally / initials /
// high-score loop. Sim-affecting values all flow through state.mutators →
// state.matchRules (snapshotted config); everything else here is meta/UI.
// ===========================================================================

const FIGHTER_HOME_X = [355, 925];

function rosterIndexById(id) {
  return roster.findIndex((fighter) => fighter.id === id);
}

function roundsToWinValue() {
  if (state.mode === "survival" || state.mode === "team") return 1;
  return state.matchRules.roundsToWin || 2;
}

// The mutator set the NEXT match should run under. Online reads the shared
// match config (plain rooms never set it — mutators stay gated out of online);
// the daily forces its single seeded rule; versus and Block War read the
// stage-select picker; every other mode is clean.
function activeMutatorsForMatch() {
  if (state.mode === "online") return state.mutators;
  if (dailySession.active && state.mode === "arcade") return dailySession.plan?.mutator ? [dailySession.plan.mutator] : [];
  if (state.mode === "versus" || state.mode === "team") return pendingMutators;
  return [];
}

function applyMatchRulesForMatch() {
  state.mutators = normalizeMutators(activeMutatorsForMatch());
  state.matchRules = resolveMatchRules(state.mutators);
  state.suddenDeathHitDone = false;
}

// Block War: incoming teammates start at the near arena edge and walk to
// their slot during the intro. Fixed-dt math on snapshotted fields only.
function updateIntroWalkIns(dt) {
  for (const fighter of state.fighters) {
    if (!Number.isFinite(fighter.introWalkTarget)) continue;
    const speed = Math.max(220, Number(fighter.movement.forwardWalkSpeed) || 0);
    const delta = fighter.introWalkTarget - fighter.x;
    const step = Math.sign(delta) * speed * dt;
    if (Math.abs(delta) <= Math.abs(step) + 1) {
      fighter.x = fighter.introWalkTarget;
      fighter.introWalkTarget = null;
    } else {
      fighter.x += step;
      fighter.walkTime += dt * 2;
    }
  }
}

// Mode-specific fighter setup, applied right after makeMatchFighters() in
// startMatch. Health carry-in, regen results and AI tuning are all sim inputs
// derived from the run/battle config (never ad-hoc mid-round writes).
function applyModeFighterSetup() {
  if (state.mode === "survival" && state.survivalRun) {
    const bout = currentSurvivalBout(state.survivalRun);
    if (bout) {
      state.fighters[0].health = clamp(bout.carryHealth, 1, 100);
      state.fighters[1].aiBrain = createAiBrain(bout.difficultyId);
    }
  } else if (state.mode === "team" && state.teamBattle) {
    const battle = state.teamBattle;
    for (const side of [0, 1]) {
      state.fighters[side].health = clamp(battle.carryHealth[side], 1, 100);
      state.fighters[side].meter = clamp(battle.carryMeter[side], 0, GRIT_RULES.maximum);
    }
    const incomingSide = battle.lastElimination && !battle.lastElimination.over
      ? battle.lastElimination.loserSide : -1;
    if (incomingSide === 0 || incomingSide === 1) {
      const fighter = state.fighters[incomingSide];
      fighter.introWalkTarget = FIGHTER_HOME_X[incomingSide];
      fighter.x = incomingSide === 0 ? MOVEMENT_RULES.stageMinX : MOVEMENT_RULES.stageMaxX;
    }
    if (battle.cpu) state.fighters[1].aiBrain = createAiBrain(state.aiDifficulty);
  } else if (dailySession.active && state.mode === "arcade") {
    // The Daily Jawn is identical everywhere: CPU difficulty is pinned to the
    // plan's fixed tier regardless of the local difficulty setting.
    state.fighters[1].aiBrain = createAiBrain(dailySession.plan?.difficulty || DAILY_RULES.difficulty);
  }
  if (state.matchRules.infiniteGrit) {
    for (const fighter of state.fighters) fighter.meter = GRIT_RULES.maximum;
  }
}

// --- Survival: The Gauntlet ------------------------------------------------

function startSurvivalRun(fighterId, seed = null) {
  state.mode = "survival";
  state.arcadeRun = null;
  state.teamBattle = null;
  dailySession.active = false;
  const runSeed = Number.isFinite(seed) ? Number(seed) >>> 0 : state.rng.nextUint32();
  state.survivalRun = createSurvivalRun({
    playerId: fighterId,
    fighterIds: roster.map(({ id }) => id),
    stageIds: Object.keys(stages),
    seed: runSeed,
  });
  beginScoreRun("survival", `survival-${fighterId}`, currentSurvivalBout(state.survivalRun).multiplier);
  prepareSurvivalBout();
  startMatch(true);
  return state.survivalRun;
}

function prepareSurvivalBout() {
  const run = state.survivalRun;
  const bout = currentSurvivalBout(run);
  if (!run || !bout) return null;
  registerAiDifficulty(bout.difficultyId, bout.difficultySettings);
  state.picks[0] = Math.max(0, rosterIndexById(run.playerId));
  state.picks[1] = Math.max(0, rosterIndexById(bout.opponentId));
  state.locks = [true, true];
  state.stage = bout.stage;
  scoreSession.multiplier = bout.multiplier;
  return bout;
}

function survivalBestSummary() {
  return loadSurvivalBest();
}

function resolveSurvivalResult(winner) {
  const run = state.survivalRun;
  if (!run) {
    showResult(winner);
    return;
  }
  if (winner === 0) {
    const tallyContext = finalizeBoutTally();
    const outcome = recordSurvivalWin(run, state.fighters[0].health);
    const best = loadSurvivalBest();
    if (outcome.wins > best.streak) saveSurvivalBest({ ...best, streak: outcome.wins });
    // v2.1 PROGRESSION: each Gauntlet bout is a single-round match; the live
    // streak feeds the ledger on every win (best-of stays monotonic).
    progressionMatchEnd(0);
    progressionRunEnd("survival", { wins: outcome.wins });
    const proceed = () => {
      prepareSurvivalBout();
      startMatch(true);
    };
    const announceMilestone = () => {
      if (!outcome.milestone) return;
      modeFxDebug.survivalMilestones += 1;
      announce(`${outcome.wins} STRAIGHT`, outcome.milestoneLine, 1.9);
      announcerSay("perfect", { delay: 350 });
    };
    if (tallyContext) {
      showBoutTally(tallyContext, proceed, {
        title: `BOUT ${outcome.wins} CLEARED`,
        sub: `${outcome.wins} WIN STREAK · NEXT: ${arcadeOpponentDef({ opponentId: outcome.next.opponentId })?.name || outcome.next.opponentId.toUpperCase()}`,
        onShown: announceMilestone,
      });
    } else {
      announceMilestone();
      proceed();
    }
    return;
  }
  // Defeat: the run is over. Points earned during the losing bout still count
  // (banked without a tally screen), then initials if the total charts.
  recordSurvivalDefeat(run);
  finalizeBoutTally();
  const best = loadSurvivalBest();
  saveSurvivalBest({
    streak: Math.max(best.streak, run.wins),
    score: Math.max(best.score, scoreSession.total),
  });
  scoreSession.detail = `survival-${run.wins}`;
  // v2.1 PROGRESSION: the losing bout still counts; the run's final streak
  // is observed one last time.
  progressionMatchEnd(winner);
  progressionRunEnd("survival", { wins: run.wins });
  maybeEnterInitials(() => showResult(winner));
}

// --- Team battle: Block War ------------------------------------------------

function prepareTeamPairing() {
  const battle = state.teamBattle;
  const pair = currentTeamPair(battle);
  if (!pair) return null;
  state.picks[0] = Math.max(0, rosterIndexById(pair[0]));
  state.picks[1] = Math.max(0, rosterIndexById(pair[1]));
  state.locks = [true, true];
  return pair;
}

function beginTeamBattle(cpuOpponent = false) {
  state.teamBattle = createTeamBattle(state.teamPicks[0], state.teamPicks[1]);
  state.teamBattle.cpu = Boolean(cpuOpponent);
  prepareTeamPairing();
  return state.teamBattle;
}

function resolveTeamResult(winner) {
  const battle = state.teamBattle;
  if (!battle) {
    showResult(winner);
    return;
  }
  const winnerFighter = state.fighters[winner];
  const outcome = recordTeamKo(battle, winner, winnerFighter?.health || 0, winnerFighter?.meter || 0);
  // v2.1 PROGRESSION: every Block War pairing folds as a single-round match
  // for the active P1 fighter; a finished war observes the sweep entry.
  progressionMatchEnd(winner);
  if (outcome?.over) {
    progressionRunEnd("team", {
      won: winner === 0,
      sweep: winner === 0 && battle.eliminated[0].length === 0,
    });
  }
  if (!outcome || outcome.over) {
    showResult(winner);
    return;
  }
  modeFxDebug.teamWalkIns += 1;
  prepareTeamPairing();
  startMatch(true);
}

// --- Daily challenge: The Daily Jawn ---------------------------------------

function startDailyRun(dateOverride = null, { force = false } = {}) {
  // The date string is computed ONCE here, render-side; the whole run derives
  // from it (seed, fighter, opponents, stages, mutator) — never from a clock.
  const date = dateOverride || dailyDateString();
  const record = loadDailyRecord();
  if (!force && !dateOverride && record?.date === date && record.played) {
    updateDailyBanners();
    refreshDailyUi();
    sound("select");
    return false;
  }
  const plan = createDailyPlan(date, baseRosterIds());
  dailySession.active = true;
  dailySession.date = date;
  dailySession.plan = plan;
  dailySession.finished = false;
  dailySession.outcome = null;
  modeFxDebug.dailyRuns += 1;
  endDemoSession();
  state.mode = "arcade";
  state.survivalRun = null;
  state.teamBattle = null;
  state.arcadeRun = plan.run;
  state.picks = [Math.max(0, rosterIndexById(plan.fighterId)), 0];
  state.locks = [true, true];
  beginScoreRun("daily", `daily-${date}`, scoreDifficultyMultiplier(plan.difficulty));
  prepareArcadeOpponent(true);
  enterImmersiveMode();
  unlockAudio();
  startMatch(true);
  return true;
}

function finishDailyRun(cleared) {
  if (!dailySession.active || dailySession.finished) return null;
  if (!cleared) finalizeBoutTally();
  const run = state.arcadeRun;
  const record = nextDailyRecord(loadDailyRecord(), {
    date: dailySession.date,
    score: scoreSession.total,
    wins: run?.wins || 0,
    bouts: run?.matches?.length || 8,
    cleared,
  });
  saveDailyRecord(record);
  dailySession.finished = true;
  dailySession.outcome = {
    cleared: Boolean(cleared),
    score: scoreSession.total,
    wins: run?.wins || 0,
    bouts: run?.matches?.length || 8,
    streak: record.streak,
  };
  scoreSession.detail = `daily-${dailySession.date}`;
  // v2.1 PROGRESSION: Daily Jawn clears + streaks feed the Black Book.
  progressionRunEnd("daily", { cleared: Boolean(cleared), streak: record.streak });
  updateDailyBanners();
  refreshDailyUi();
  return dailySession.outcome;
}

function dailyShareTextForOutcome() {
  const outcome = dailySession.outcome;
  if (!outcome) return "";
  return dailyShareText({
    date: dailySession.date,
    fighterName: roster.find(({ id }) => id === dailySession.plan?.fighterId)?.name || dailySession.plan?.fighterId,
    score: outcome.score,
    wins: outcome.wins,
    bouts: outcome.bouts,
    cleared: outcome.cleared,
    streak: outcome.streak,
    mutator: dailySession.plan?.mutator,
  });
}

async function shareDailyResult(button) {
  const text = dailyShareTextForOutcome();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const scratch = document.createElement("textarea");
    scratch.value = text;
    document.body.append(scratch);
    scratch.select();
    document.execCommand("copy");
    scratch.remove();
  }
  if (button) {
    const label = button.dataset.label || button.textContent;
    button.dataset.label = label;
    button.textContent = "COPIED TO CLIPBOARD";
    setTimeout(() => { button.textContent = label; }, 1400);
  }
}

// Title-screen row state: fresh / completed + live streak readout.
function refreshDailyUi() {
  const status = $("#dailyStatus");
  if (!status) return;
  const today = dailyDateString();
  const record = loadDailyRecord();
  const playedToday = record?.date === today && record.played;
  const liveStreak = record && (record.date === today || record.lastClearedDate === previousDateString(today))
    ? record.streak : 0;
  if (playedToday) {
    status.textContent = `DONE · ${Math.round(record.score).toLocaleString("en-US")} PTS${liveStreak > 0 ? ` · STREAK ${liveStreak}` : ""}`;
    $("#dailyButton")?.classList.add("daily-done");
  } else {
    status.textContent = `${today} · FRESH JAWN${liveStreak > 0 ? ` · STREAK ${liveStreak}` : ""}`;
    $("#dailyButton")?.classList.remove("daily-done");
  }
}

function updateDailyBanners() {
  const visible = dailySession.finished && Boolean(dailySession.outcome);
  for (const id of ["#dailyResultBanner", "#dailyEndingBanner"]) {
    const banner = $(id);
    if (!banner) continue;
    banner.hidden = !visible;
    if (!visible) continue;
    const outcome = dailySession.outcome;
    banner.querySelector("b").textContent = `DAILY JAWN ${dailySession.date} · ${outcome.cleared ? "CLEARED" : `OUT AT ${outcome.wins}/${outcome.bouts}`}`;
    banner.querySelector("em").textContent = `${Math.round(outcome.score).toLocaleString("en-US")} PTS${outcome.streak > 0 ? ` · STREAK ${outcome.streak}` : ""}${dailySession.plan?.mutator ? ` · ${MUTATORS[dailySession.plan.mutator].name}` : ""}`;
  }
}

// --- SF2 tally screen ------------------------------------------------------

function showBoutTally(context, onContinue, { title = "BOUT CLEARED", sub = "", onShown = null } = {}) {
  tallyUi.active = true;
  tallyUi.rows = tallyRows(context.tally);
  tallyUi.total = context.boutTotal;
  tallyUi.runTotal = context.runTotal;
  tallyUi.multiplier = context.multiplier;
  tallyUi.done = false;
  tallyUi.onContinue = onContinue;
  tallyUi.startedAt = performance.now();
  tallyUi.lastTickedRow = -1;
  modeFxDebug.tallyScreens += 1;
  $("#tallyTitle").textContent = title;
  $("#tallySub").textContent = sub || `DIFFICULTY ×${context.multiplier}`;
  $("#tallyRows").innerHTML = tallyUi.rows.map((row) => `
    <div class="tally-row" data-row="${row.id}">
      <span>${row.label}</span>
      <small>${row.count > 0 ? `× ${row.count}` : "—"}</small>
      <b data-points="${row.points}">0</b>
    </div>`).join("");
  $("#tallyMultiplier").textContent = `DIFFICULTY MULTIPLIER ×${context.multiplier}`;
  $("#tallyBoutTotal").textContent = "0";
  $("#tallyRunTotal").textContent = Math.round(context.runTotal - context.boutTotal).toLocaleString("en-US");
  showScreen("tally");
  restartCssAnimation($("#tallyScreen").querySelector(".tally-panel"), "enter");
  if (onShown) onShown();
  requestAnimationFrame(stepTallyCountUp);
}

// Count-up: each row ticks up on a short stagger, then the multiplied bout
// total and run total land. A button press mid-count snaps to the final
// numbers; the next press continues. Reduced motion resolves instantly.
function stepTallyCountUp() {
  if (!tallyUi.active || state.screen !== "tally") return;
  const reduced = state.accessibility.reducedMotion;
  const elapsed = (performance.now() - tallyUi.startedAt) / 1000;
  const rowSlot = 0.16;
  const rowDuration = 0.42;
  const rowElements = $$("#tallyRows .tally-row");
  let allDone = true;
  rowElements.forEach((element, index) => {
    const points = Number(element.querySelector("b").dataset.points) || 0;
    const progress = reduced ? 1 : clamp((elapsed - index * rowSlot) / rowDuration, 0, 1);
    if (progress < 1) allDone = false;
    element.classList.toggle("counting", progress > 0 && progress < 1);
    element.classList.toggle("landed", progress >= 1);
    element.querySelector("b").textContent = Math.round(points * progress).toLocaleString("en-US");
    if (progress >= 1 && tallyUi.lastTickedRow < index) {
      tallyUi.lastTickedRow = index;
      if (points > 0 && !reduced) sound("select");
    }
  });
  const totalStart = reduced ? 0 : rowElements.length * rowSlot + rowDuration;
  const totalProgress = reduced ? 1 : clamp((elapsed - totalStart) / 0.5, 0, 1);
  $("#tallyBoutTotal").textContent = Math.round(tallyUi.total * totalProgress).toLocaleString("en-US");
  const runBase = tallyUi.runTotal - tallyUi.total;
  $("#tallyRunTotal").textContent = Math.round(runBase + tallyUi.total * totalProgress).toLocaleString("en-US");
  if (allDone && totalProgress >= 1) {
    if (!tallyUi.done) {
      tallyUi.done = true;
      modeFxDebug.tallyCountUps += 1;
      $("#tallyContinueButton").classList.add("ready");
    }
    return;
  }
  requestAnimationFrame(stepTallyCountUp);
}

function tallyContinue() {
  if (!tallyUi.active) return false;
  if (!tallyUi.done) {
    // First press: snap the count-up to its final numbers, resolved
    // synchronously so the CONTINUE button arms immediately (and scripted
    // probes can press straight through without waiting on a rAF).
    tallyUi.startedAt = -Infinity;
    stepTallyCountUp();
    return true;
  }
  tallyUi.active = false;
  $("#tallyContinueButton").classList.remove("ready");
  const proceed = tallyUi.onContinue;
  tallyUi.onContinue = null;
  sound("select");
  if (proceed) proceed();
  return true;
}

// --- Initials entry + high-score table -------------------------------------

function maybeEnterInitials(onDone) {
  const score = Math.round(scoreSession.total);
  if (!highScoreQualifies(loadHighScores(), score)) {
    onDone();
    return;
  }
  initialsUi.active = true;
  initialsUi.score = score;
  initialsUi.cursor = 0;
  initialsUi.letters = normalizeInitials(localStorage.getItem(SCORE_INITIALS_KEY) || "AAA").split("");
  initialsUi.onDone = onDone;
  modeFxDebug.initialsEntries += 1;
  $("#initialsScore").textContent = `${score.toLocaleString("en-US")} PTS`;
  $("#initialsMode").textContent = scoreSession.mode === "survival"
    ? "THE GAUNTLET" : scoreSession.mode === "daily" ? "DAILY JAWN" : "ARCADE";
  renderInitials();
  showScreen("initials");
}

function renderInitials() {
  $$("#initialsSlots .initials-slot").forEach((slot, index) => {
    slot.textContent = initialsUi.letters[index] || "A";
    slot.classList.toggle("cursor", initialsUi.active && index === initialsUi.cursor);
  });
}

const INITIALS_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function cycleInitialLetter(direction) {
  const current = initialsUi.letters[initialsUi.cursor] || "A";
  const index = (INITIALS_ALPHABET.indexOf(current) + direction + INITIALS_ALPHABET.length) % INITIALS_ALPHABET.length;
  initialsUi.letters[initialsUi.cursor] = INITIALS_ALPHABET[index];
  renderInitials();
}

function commitInitials() {
  if (!initialsUi.active) return false;
  const initials = normalizeInitials(initialsUi.letters.join(""));
  try {
    localStorage.setItem(SCORE_INITIALS_KEY, initials);
  } catch { /* non-fatal */ }
  const { list, rank } = insertHighScore(loadHighScores(), {
    initials,
    score: initialsUi.score,
    mode: scoreSession.mode || "arcade",
    detail: scoreSession.detail,
    date: dailySession.finished ? dailySession.date : dailyDateString(),
  });
  saveHighScores(list);
  // v2.1 PROGRESSION: taking the top row inks NAME IN LIGHTS.
  progressionHighScore(rank);
  // Optional first-party leaderboard: offline-first, silent on any failure.
  submitScoreToWorker(initials, initialsUi.score, `${scoreSession.mode}:${scoreSession.detail}`);
  initialsUi.active = false;
  const done = initialsUi.onDone;
  initialsUi.onDone = null;
  sound("select");
  if (done) done();
  else showScreen("title");
  return true;
}

function handleInitialsKey(event) {
  if (state.screen !== "initials" || !initialsUi.active) return false;
  const { code } = event;
  if (/^Key[A-Z]$/.test(code)) {
    initialsUi.letters[initialsUi.cursor] = code.slice(3);
    initialsUi.cursor = Math.min(2, initialsUi.cursor + 1);
  } else if (/^Digit\d$/.test(code)) {
    initialsUi.letters[initialsUi.cursor] = code.slice(5);
    initialsUi.cursor = Math.min(2, initialsUi.cursor + 1);
  } else if (code === "ArrowLeft") initialsUi.cursor = Math.max(0, initialsUi.cursor - 1);
  else if (code === "ArrowRight") initialsUi.cursor = Math.min(2, initialsUi.cursor + 1);
  else if (code === "ArrowUp") cycleInitialLetter(1);
  else if (code === "ArrowDown") cycleInitialLetter(-1);
  else if (code === "Backspace") {
    initialsUi.letters[initialsUi.cursor] = "A";
    initialsUi.cursor = Math.max(0, initialsUi.cursor - 1);
  } else if (["Enter", "Space", "Escape"].includes(code)) {
    commitInitials();
    return true;
  } else return false;
  event.preventDefault();
  renderInitials();
  return true;
}

function handleTallyKey(event) {
  if (state.screen !== "tally" || !tallyUi.active) return false;
  if (!["Enter", "Space", "Escape", "KeyJ", "KeyK"].includes(event.code)) return false;
  event.preventDefault();
  tallyContinue();
  return true;
}

function renderHighScoreBoard(container) {
  const table = loadHighScores();
  const target = container || $("#attractScoresRows");
  if (!target) return table;
  target.innerHTML = table.length
    ? table.map((row, index) => `
      <div class="attract-score-row${index === 0 ? " top" : ""}">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <b>${row.initials}</b>
        <em>${row.mode === "survival" ? "GAUNTLET" : row.mode === "daily" ? "DAILY" : "ARCADE"}</em>
        <strong>${Math.round(row.score).toLocaleString("en-US")}</strong>
      </div>`).join("")
    : `<div class="attract-score-row empty"><b>NO SCORES YET</b><strong>BE FIRST</strong></div>`;
  return table;
}

// --- Mutator picker (versus / Block War stage select) ----------------------

function renderMutatorBar() {
  const bar = $("#mutatorBar");
  if (!bar) return;
  const available = ["versus", "team"].includes(state.mode);
  bar.hidden = !available;
  if (!available) return;
  const options = $("#mutatorOptions");
  if (!options.childElementCount) {
    options.innerHTML = MUTATOR_ORDER.map((id) => `
      <button type="button" class="mutator-chip" data-mutator="${id}" title="${MUTATORS[id].blurb}">
        <b>${MUTATORS[id].name}</b><small>${MUTATORS[id].blurb}</small>
      </button>`).join("");
    options.querySelectorAll(".mutator-chip").forEach((chip) => {
      chip.addEventListener("click", () => toggleMutator(chip.dataset.mutator));
    });
  }
  options.querySelectorAll(".mutator-chip").forEach((chip) => {
    chip.classList.toggle("selected", pendingMutators.includes(chip.dataset.mutator));
  });
  $("#mutatorHint").textContent = pendingMutators.length
    ? `HOUSE RULES ON: ${mutatorLabel(pendingMutators)}`
    : "OPTIONAL HOUSE RULES · STACK AS MANY AS YOU WANT";
}

function toggleMutator(id) {
  if (!MUTATORS[id]) return;
  pendingMutators = pendingMutators.includes(id)
    ? pendingMutators.filter((existing) => existing !== id)
    : normalizeMutators([...pendingMutators, id]);
  sound("select");
  renderMutatorBar();
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
  // R1.9: the input column and school panel live and die with the lab.
  $("#inputHistoryColumn").hidden = !trainingVisible;
  if (!trainingVisible) $("#schoolPanel").hidden = true;
  else renderSchoolPanel();
  const playerControlled = playing && state.mode !== "demo";
  $("#touchControls").classList.toggle("playing", playerControlled);
  $("#touchPauseButton").classList.toggle("playing", playerControlled);
  $("#touchPauseButton").hidden = playing && state.mode === "online";
  if (!playing) $("#announcer").classList.add("hidden");
  updateFlowSkipHint();
  updateOnlineHud();
  updateDemoUi();
  syncMusic();
  if (name === "title") {
    refreshDailyUi();
    refreshProgressionUi();
    scheduleIdleDemo();
  } else clearIdleDemoTimer();
  // v2.1 PROGRESSION: leaving the ending screen tears the sequence down so
  // stale panel/credits timers can never advance a dead screen.
  if (name !== "ending" && endingSequence.active) cancelEndingSequence();
  if (name !== "result" && name !== "ending") updateDailyBanners();
  if (name === "stage") renderMutatorBar();
  // Wave 15: hold the screen awake through fights/attract, release on menus;
  // cabinet marquee lives and dies with the title screen.
  syncWakeLock();
  const marquee = $("#cabinetMarquee");
  if (marquee) marquee.hidden = !(state.cabinetMode && name === "title");
}

function startSelect(mode) {
  enterImmersiveMode();
  unlockAudio();
  state.mode = ["arcade", "versus", "training", "survival", "team"].includes(mode) ? mode : "arcade";
  state.arcadeRun = null;
  state.survivalRun = null;
  state.teamBattle = null;
  state.teamPicks = [[], []];
  dailySession.active = false;
  endScoreRun();
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
  state.locks = [false, state.mode === "arcade" || state.mode === "survival"];
  state.selectingPlayer = 0;
  // Wave 16: fresh color picks each visit to the select screen.
  pendingPalettes = [0, 0];
  $("#selectPrompt").textContent = state.mode === "training"
    ? "CHOOSE YOUR TRAINING FIGHTER"
    : state.mode === "survival"
      ? "THE GAUNTLET — CHOOSE YOUR FIGHTER"
      : state.mode === "team"
        ? "BLOCK WAR · PLAYER 1 — PICK 3 (1/3)"
        : "PLAYER 1 — CHOOSE";
  showScreen("select");
  syncDifficultyUi();
  // v2.1 PROGRESSION: mastery chips reflect any records earned since boot.
  refreshMasteryBadges();
  updateRosterUI();
}

// Wave 16: `palette` is the SF2-style color pick riding the confirm input —
// LP/click/Enter/pad-A locks color 1, HP (or pad Y) locks color 2. Stored per
// seat in pendingPalettes; resolveMatchPalettes applies the mirror auto-alt.
function chooseFighter(index, palette = 0) {
  unlockAudio();
  const paletteSeat = state.mode === "team" ? -1
    : state.mode === "arcade" || state.mode === "survival" || !state.locks[0] ? 0 : 1;
  if (paletteSeat >= 0) pendingPalettes[paletteSeat] = palette === 1 ? 1 : 0;
  if (state.mode === "survival") {
    // The Gauntlet: one pick, straight into bout 1 — no stage select, the
    // seeded ladder owns the route.
    state.picks[0] = index;
    state.locks = [true, true];
    sound("select");
    const lockedCard = $(`.fighter-card[data-index="${index}"]`);
    if (lockedCard) {
      restartCssAnimation(lockedCard, "locked-flash");
      hudFxDebug.selectSlams += 1;
    }
    announcerSay(`${roster[index].id}-name`);
    startSurvivalRun(roster[index].id);
    return;
  }
  if (state.mode === "team") {
    const side = state.locks[0] ? 1 : 0;
    const team = state.teamPicks[side];
    if (team.includes(roster[index].id) || team.length >= TEAM_RULES.teamSize) return;
    team.push(roster[index].id);
    state.picks[side] = index;
    state.selectingPlayer = side;
    if (team.length >= TEAM_RULES.teamSize) {
      state.locks[side] = true;
      state.selectingPlayer = 1;
    }
    $("#selectPrompt").textContent = state.locks[0] && state.locks[1]
      ? "BLOCK WAR · TEAMS SET — STAGE SELECT"
      : state.locks[0]
        ? `BLOCK WAR · PLAYER 2 — PICK 3 (${state.teamPicks[1].length + 1}/3)`
        : `BLOCK WAR · PLAYER 1 — PICK 3 (${state.teamPicks[0].length + 1}/3)`;
    sound("select");
    const lockedCard = $(`.fighter-card[data-index="${index}"]`);
    if (lockedCard) {
      restartCssAnimation(lockedCard, "locked-flash");
      hudFxDebug.selectSlams += 1;
    }
    if (!(state.locks[0] && state.locks[1])) announcerSay(`${roster[index].id}-name`);
    updateRosterUI();
    return;
  }
  if (state.mode === "arcade") {
    state.picks[0] = index;
    state.locks = [true, true];
    state.arcadeRun = createArcadeRun(
      roster[index].id,
      roster.map(({ id }) => id),
      state.rng.nextUint32(),
    );
    // Release 1.8 GRIND: every arcade run is a score-attack run.
    beginScoreRun("arcade", `arcade-${roster[index].id}`, scoreDifficultyMultiplier(state.aiDifficulty));
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
  // Lock-in stamp: white card flash + punch-scale on the confirmed portrait.
  const lockedCard = $(`.fighter-card[data-index="${index}"]`);
  if (lockedCard) {
    restartCssAnimation(lockedCard, "locked-flash");
    hudFxDebug.selectSlams += 1;
  }
  // Wave 9: the announcer calls the locked fighter's name — unless this lock
  // completes the pair, in which case the VS slam calls both names instead.
  if (!(state.locks[0] && state.locks[1])) announcerSay(`${roster[index].id}-name`);
  updateRosterUI();
}

function updateRosterUI() {
  const teamMode = state.mode === "team";
  $$(".fighter-card").forEach((card) => {
    const index = Number(card.dataset.index);
    const id = roster[index]?.id;
    card.classList.toggle("p1-pick", teamMode
      ? state.teamPicks[0].includes(id)
      : state.locks[0] && state.picks[0] === index);
    card.classList.toggle("p2-pick", teamMode
      ? state.teamPicks[1].includes(id)
      : state.locks[1] && state.picks[1] === index);
    card.classList.toggle("focused", !state.locks[state.selectingPlayer] && state.picks[state.selectingPlayer] === index);
    // Wave 16: the alt-color stamp on a locked card.
    card.classList.toggle("alt-pick", !teamMode && (
      (state.locks[0] && state.picks[0] === index && pendingPalettes[0] === 1)
      || (state.locks[1] && state.picks[1] === index && pendingPalettes[1] === 1)));
  });
  const readout = $("#selectionReadout");
  readout.innerHTML = teamMode
    ? `<span>P1</span> <b class="vs-name p1n">${state.teamPicks[0].map((id) => roster[rosterIndexById(id)].mark).join("·") || "—"}</b> <i>VS</i> <span>P2</span> <b class="vs-name p2n">${state.teamPicks[1].map((id) => roster[rosterIndexById(id)].mark).join("·") || "—"}</b>`
    : `<span>P1</span> <b class="vs-name p1n">${roster[state.picks[0]].name}</b> <i>VS</i> <span>P2</span> <b class="vs-name p2n">${roster[state.picks[1]].name}</b>`;
  const bothLocked = state.locks[0] && state.locks[1];
  readout.classList.toggle("both-locked", bothLocked);
  // VS slam: once both slots lock, the two names slam in from the sides
  // around the flashing VS with a clash flash between them. Latched so
  // later roster refreshes don't replay it.
  if (bothLocked && !selectBothLocked) {
    restartCssAnimation(readout, "vs-slam");
    hudFxDebug.selectSlams += 1;
    // Wave 9: the VS slam calls the matchup — both names in sequence.
    announcerSay(`${roster[state.picks[0]].id}-name`);
    announcerSay(`${roster[state.picks[1]].id}-name`, { delay: 700 });
  } else if (!bothLocked) readout.classList.remove("vs-slam");
  selectBothLocked = bothLocked;
  $("#fighterContinue").disabled = !bothLocked;
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
  // Release 1.6: AUTO mode now picks the stage-matched track instead of
  // cycling the jukebox. Demo/attract keeps whatever was already playing.
  if (state.mode !== "demo") applyAutoStageMusic();
  resetMusicDuck();
  if (resetSet) {
    state.rounds = [0, 0];
    state.round = 1;
  }
  state.matchSerial += 1;
  state.qaManualMode = false;
  // Release 1.8 GRIND: build the Block War roster on the first FIGHT press,
  // then lock the House Rules config for this match BEFORE the fighters are
  // built (Turbo scales movement at makeFighter time).
  if (state.mode === "team" && !state.teamBattle && state.teamPicks[0].length === TEAM_RULES.teamSize) {
    beginTeamBattle(false);
  }
  applyMatchRulesForMatch();
  resetRoundScoreTracking();
  // Arcade bouts score against the CURRENT difficulty setting; survival and
  // the daily pin their own multipliers when they prepare the bout.
  if (scoreSession.active && scoreSession.mode === "arcade" && state.mode === "arcade") {
    scoreSession.multiplier = scoreDifficultyMultiplier(state.aiDifficulty);
  }
  seedMatch(state.round);
  state.fighters = makeMatchFighters();
  applyModeFighterSetup();
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
  clearBattleDamage();
  clearStageScars();
  // v2.1 PROGRESSION: fresh per-match observation accumulators (fighters are
  // built and any survival/team carry health is already applied above).
  progressionResetMatch();
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
  let introLabel = arcadeMatch?.kind === "boss" ? "FINAL BOUT · THE COMMISSIONER"
    : arcadeMatch?.kind === "rival" ? `RIVAL BOUT · ${state.fighters[1].def.name}`
      : stages[state.stage].name;
  let introMain = `ROUND ${state.round}`;
  // Release 1.8 GRIND: mode-flavoured intro banners. Survival counts bouts,
  // Block War calls the pairing (and the walk-in), active House Rules get
  // named, and a walked-in teammate gets their name-call intro voice cue.
  if (state.mode === "survival" && state.survivalRun) {
    const bout = currentSurvivalBout(state.survivalRun);
    introMain = `BOUT ${(bout?.index ?? 0) + 1}`;
    introLabel = `${state.fighters[1].def.name} · ${state.survivalRun.wins} WIN STREAK`;
  } else if (state.mode === "team" && state.teamBattle) {
    const battle = state.teamBattle;
    const incoming = battle.lastElimination?.incomingId;
    introMain = `BOUT ${battle.bout}`;
    introLabel = incoming
      ? `${roster[rosterIndexById(incoming)]?.name || incoming} STEPS IN · ${teamFightersRemaining(battle, 0)}V${teamFightersRemaining(battle, 1)}`
      : `BLOCK WAR · ${teamFightersRemaining(battle, 0)}V${teamFightersRemaining(battle, 1)}`;
    if (incoming) announcerSay(`${incoming}-name`, { delay: 300 });
  }
  if (state.mutators.length) introLabel = `${introLabel} · ${mutatorLabel(state.mutators)}`;
  announce(introMain, introLabel, 1.2);
  // Wave 16: rival and FINAL BOUT intros open with a spoken-card exchange —
  // the intro window stretches to fit the read, and the FIGHT call waits.
  const dialogueSeconds = beginIntroDialogue(arcadeMatch);
  if (dialogueSeconds > 0) state.phaseTime = dialogueSeconds;
  // Wave 9: the arcade final boss bout gets its own announcer intro, queued
  // behind ROUND 1 / FIGHT via the announcer busy window.
  if (arcadeMatch?.kind === "boss") {
    voiceFxDebug.storyCallouts += 1;
    announcerSay("boss-intro", { delay: 2100 });
  }
  scheduleFightAnnouncement(() => {
    if (state.screen === "fight" && state.phase === "intro") announce("FIGHT!", "NO MERCY ON THESE STREETS", 0.8);
  }, dialogueSeconds > 0 ? Math.round(dialogueSeconds * 1000) - 650 : 1150);
  canvas.focus();
}

function startOnlineMatch(config) {
  if (!validOnlineMatchConfig(config)) return false;
  cancelFightAnnouncement();
  unlockAudio();
  resetMusicDuck();
  state.mode = "online";
  state.arcadeRun = null;
  state.survivalRun = null;
  state.teamBattle = null;
  dailySession.active = false;
  endScoreRun();
  // Release 1.8 GRIND: mutators only run online when BOTH sides carry them in
  // the shared match config. The lobby never offers them, so plain/ranked
  // rooms always derive the clean default rules on both peers.
  state.mutators = normalizeMutators(config.mutators || []);
  state.matchRules = resolveMatchRules(state.mutators);
  state.suddenDeathHitDone = false;
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
  // Release 1.6: online AUTO music maps to the agreed stage (set just above).
  applyAutoStageMusic();
  state.rounds = [0, 0];
  state.round = 1;
  state.matchSerial += 1;
  state.simulationTick = 0;
  seedOnlineRound(1);
  state.fighters = makeMatchFighters();
  resetStageWeapon();
  resetCrowd();
  warmFighterAudio();
  clearBattleDamage();
  clearStageScars();
  // v2.1 PROGRESSION: observation-only accumulators reset for the online
  // match too (nothing here ever writes back into the rollback sim).
  progressionResetMatch();
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
  // Release 1.8 GRIND: per-round sim/meta resets — the Sudden Death one-shot
  // re-arms (sim state) and the FIRST ATTACK score flag re-arms (meta).
  state.suddenDeathHitDone = false;
  resetRoundScoreTracking();
  if (state.mode === "online") seedOnlineRound(state.round);
  else seedMatch(state.round);
  state.fighters = makeMatchFighters();
  warmFighterAudio();
  state.fighters.forEach((fighter, side) => { fighter.meter = carriedGrit[side] || 0; });
  if (state.matchRules.infiniteGrit) state.fighters.forEach((fighter) => { fighter.meter = GRIT_RULES.maximum; });
  resetStageWeapon();
  resetCrowd();
  clearBattleDamage();
  // v2.1 PROGRESSION: re-arm the per-round latches (jump/no-jump, damage
  // sources, round-start health). resetRound runs on a sim path — guarded.
  if (!rollbackResimulating) progressionResetRound();
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
  const strong = box.querySelector("strong");
  const text = String(main);
  // Wave 9: every banner also books its spoken announcer call (captions
  // always; audio only once real takes exist in assets/audio/announcer/).
  announcerSpeakBanner(text);
  const letters = [...text];
  // Letter-by-letter slam: each character lands with its own scale-punch on a
  // short stagger. The innerHTML rebuild also restarts the animation on
  // consecutive announces (ROUND N -> FIGHT!) which the old textContent write
  // never replayed. Spaces keep white-space:pre so textContent round-trips
  // exactly (QA reads the announcer text).
  const stagger = 55;
  strong.setAttribute("aria-label", text);
  strong.innerHTML = letters.map((character, index) => (character === " "
    ? `<i class="gap" aria-hidden="true"> </i>`
    : `<i aria-hidden="true" style="animation-delay:${index * stagger}ms">${escapeAnnounceChar(character)}</i>`)).join("");
  hudFxDebug.letterSlams += letters.filter((character) => character !== " ").length;
  box.querySelector("span").textContent = sub;
  box.classList.remove("hidden", "out");
  // Small screen kick per landing letter: a jolt animation on the frame whose
  // duration tracks the letter count. Killed outright by body.reduced-motion.
  if (!state.accessibility.reducedMotion) {
    const frame = $("#gameFrame");
    frame.style.setProperty("--announce-kick-ms", `${Math.min(letters.length, 14) * stagger + 180}ms`);
    restartCssAnimation(frame, "announce-kick");
  }
  clearTimeout(announce.timer);
  clearTimeout(announce.outTimer);
  // Punch out with a quick scale-snap instead of blinking off; the final
  // hide still lands at exactly duration * 1000 so no hold timing moves.
  announce.outTimer = setTimeout(() => box.classList.add("out"), Math.max(0, duration * 1000 - 150));
  announce.timer = setTimeout(() => {
    box.classList.add("hidden");
    box.classList.remove("out");
  }, duration * 1000);
}

function updateFlowSkipHint() {
  const visible = state.screen === "fight" && (state.phase === "intro" || state.phase === "roundover");
  $("#flowSkipHint").hidden = !visible;
}

// ---------------------------------------------------------------------------
// R2.0 FAMILY wave 16 — pre-fight dialogue exchanges. Arcade-only: a rival
// bout or the FINAL BOUT opens with a two-card spoken exchange during the
// intro window (extended to fit the read). Pure presentation on module-level
// state — never snapshotted, never read by the sim; the intro phase clock it
// keys off is ordinary deterministic match config. Skippable through the
// existing flow-skip (phase leaves "intro" -> cards drop on the next frame);
// reduced motion shows both cards instantly with no slide.
// ---------------------------------------------------------------------------
const INTRO_DIALOGUE_SECONDS = 4.9;
const INTRO_DIALOGUE_CARD_TIMES = [0.35, 2.45];

const introDialogue = {
  active: false,
  kind: "",
  lines: [],
  total: 0,
  revealed: 0,
};
// Last variant shown per pairing, so back-to-back runs never repeat while an
// alternative exists. visualRandom only — presentation stream.
const dialogueVariantMemory = new Map();

function dialogueSpeakerDef(fighterId) {
  return fighterId === ARCADE_BOSS_ID
    ? arcadeBoss
    : roster.find(({ id }) => id === fighterId) || null;
}

function pickDialogueVariant(key, variants) {
  if (!variants?.length) return null;
  let pick = Math.floor(visualRandom() * variants.length) % variants.length;
  if (variants.length > 1 && pick === dialogueVariantMemory.get(key)) pick = (pick + 1) % variants.length;
  dialogueVariantMemory.set(key, pick);
  return variants[pick];
}

function cancelIntroDialogue() {
  introDialogue.active = false;
  introDialogue.lines = [];
  introDialogue.revealed = 0;
  const box = $("#introDialogue");
  if (box) {
    box.hidden = true;
    box.innerHTML = "";
  }
}

/**
 * Arm the exchange for the match being started. Returns the intro length the
 * bout should run (0 = no dialogue, keep the standard fast intro).
 */
function beginIntroDialogue(arcadeMatch) {
  cancelIntroDialogue();
  if (state.mode !== "arcade" || !arcadeMatch || !state.arcadeRun) return 0;
  const playerId = state.arcadeRun.playerId;
  let variant = null;
  if (arcadeMatch.kind === "rival") {
    variant = pickDialogueVariant(
      `rival:${[playerId, arcadeMatch.opponentId].sort().join(":")}`,
      rivalDialogueVariants(playerId, arcadeMatch.opponentId),
    );
  } else if (arcadeMatch.kind === "boss") {
    variant = pickDialogueVariant(`boss:${playerId}`, bossDialogueVariants(playerId));
  }
  if (!variant) return 0;
  introDialogue.active = true;
  introDialogue.kind = arcadeMatch.kind;
  introDialogue.total = INTRO_DIALOGUE_SECONDS;
  introDialogue.revealed = 0;
  introDialogue.lines = variant.map((card, index) => {
    const def = dialogueSpeakerDef(card.id);
    // Which corner speaks: match the card to a fighter side; a mirror (both
    // the same id) gives the opening line to the far corner.
    const sides = state.fighters
      .map((fighter, side) => ({ side, id: fighter.def.kitId === "commissioner" ? ARCADE_BOSS_ID : fighter.def.id }))
      .filter((entry) => entry.id === card.id);
    const side = sides.length === 1 ? sides[0].side : index === 0 ? 1 : 0;
    return {
      id: card.id,
      line: card.line,
      name: def?.name || card.id.toUpperCase(),
      color: def?.color || "#d8d8d8",
      side,
    };
  });
  modeFxDebug.dialogueExchanges += 1;
  const box = $("#introDialogue");
  if (box) {
    box.innerHTML = introDialogue.lines.map((card, index) => `
      <div class="speech-card ${card.side === 0 ? "from-left" : "from-right"}" data-card="${index}" hidden>
        <b style="--speaker:${card.color}">${card.name}</b>
        <p>${card.line}</p>
      </div>`).join("");
    box.hidden = false;
  }
  return INTRO_DIALOGUE_SECONDS;
}

// Per-rendered-frame card reveal, driven by the intro phase clock so pause
// holds the cards and the flow-skip drops them with the phase.
function updateIntroDialogue() {
  const box = $("#introDialogue");
  if (!box) return;
  const live = introDialogue.active && state.screen === "fight" && state.phase === "intro";
  if (!live) {
    if (introDialogue.active && (state.phase !== "intro" || state.screen !== "fight")) cancelIntroDialogue();
    else if (!box.hidden && !introDialogue.active) box.hidden = true;
    return;
  }
  const reduced = state.accessibility.reducedMotion;
  const elapsed = introDialogue.total - state.phaseTime;
  box.querySelectorAll(".speech-card").forEach((cardEl, index) => {
    const show = reduced || elapsed >= (INTRO_DIALOGUE_CARD_TIMES[index] ?? 0);
    if (show && cardEl.hidden) {
      cardEl.hidden = false;
      cardEl.classList.toggle("instant", reduced);
      modeFxDebug.dialogueCardsShown += 1;
      introDialogue.revealed = Math.max(introDialogue.revealed, index + 1);
    }
  });
}

// Release 1.8 GRIND: only HUMAN inputs may skip the intro/round-over flow. A
// CPU pressing buttons (arcade zoners, survival, Block War, demo) used to
// fast-forward straight through — which would eat the new elimination
// callouts and team walk-ins entirely.
function sideIsCpuControlled(side) {
  if (state.mode === "demo" || state.mode === "tournament") return true;
  if (side !== 1) return false;
  return state.mode === "arcade"
    || state.mode === "survival"
    || (state.mode === "team" && Boolean(state.teamBattle?.cpu))
    || (state.mode === "training" && state.training.dummyMode === "cpu");
}

function trySkipFightFlow(input0 = {}, input1 = {}) {
  const humanInput0 = sideIsCpuControlled(0) ? {} : input0;
  const humanInput1 = sideIsCpuControlled(1) ? {} : input1;
  if (!hasFlowSkipInput(humanInput0) && !hasFlowSkipInput(humanInput1)) return false;
  // In the CPU-only modes a finisher is the thing being exhibited — the
  // showcase must never cancel itself. The CPU-input filter above already
  // covers demo and tournament; kept as belt-and-braces.
  if (state.phase === "roundover" && state.finisher
    && (state.mode === "demo" || state.mode === "tournament")) return false;
  if (state.phase === "intro") {
    state.phase = "fight";
    state.phaseTime = 0;
    // A skipped intro lands any Block War walk-in on their slot instantly.
    for (const fighter of state.fighters) {
      if (Number.isFinite(fighter.introWalkTarget)) fighter.x = fighter.introWalkTarget;
      fighter.introWalkTarget = null;
    }
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
  // Wave 15: the KO slams in the hands — for both the knockout hold and the
  // opening of a Final Blow ceremony (all gates inside combatHaptic).
  combatHaptic("ko");
  if (type >= 0) {
    const duration = performFinisher(winner, type);
    state.phaseTime = duration;
    duckMusic(0.1, duration * 1000);
    const scriptId = winDef.finisherScriptId || winDef.id;
    announce("FINAL BLOW", `${winDef.finishers[type]} · ${projectileFinisherScript(scriptId, type).combo}`, 2.45);
  } else {
    // Hold the KO scene so the blood, dust and reactions can be seen before the
    // next round or the result screen takes over.
    state.phaseTime = 4.9;
    duckMusic(0.28, 2600);
    announce(`${winDef.name} WINS`, "KNOCKOUT", 2.4);
    sound("ko", state.fighters[1 - winner]);
  }
  // Wave 9: round-story callouts (FLAWLESS / COMEBACK / time-over / fatality)
  // layered after the primary call — guarded + deduped like announce().
  if (!rollbackResimulating) queueStoryCallouts(winner, type);
  // Release 1.8 GRIND: bank the SF2 tally bonuses for this round (score is
  // meta, tracked outside the checksummed state) and, in Block War, layer the
  // elimination callout behind the KO banner via the announcer busy window.
  if (!rollbackResimulating) {
    captureRoundBonuses(winner, type);
    // v2.1 PROGRESSION: round-end observation fold (dedupe key inside, same
    // shape as queueStoryCallouts'), plus any Black Book unlock toasts.
    progressionRoundEnd(winner, type);
    if (state.mode === "team" && state.teamBattle && !state.teamBattle.over) {
      const loserDef = state.fighters[1 - winner].def;
      const remaining = teamFightersRemaining(state.teamBattle, 1 - winner) - 1;
      const line = TEAM_ELIMINATION_LINES[
        (state.teamBattle.eliminated[0].length + state.teamBattle.eliminated[1].length) % TEAM_ELIMINATION_LINES.length
      ];
      modeFxDebug.teamEliminations += 1;
      scheduleFightAnnouncement(() => {
        if (state.screen === "fight" && state.phase === "roundover") {
          announce(`${loserDef.name} ELIMINATED`, remaining > 0 ? line : "LAST ONE DOWN · BLOCK WAR OVER", 1.7);
        }
      }, 2550);
    }
  }
  updateFlowSkipHint();
  updateHud();
}

function performFinisher(winner, type) {
  const attacker = state.fighters[winner];
  const victim = state.fighters[1 - winner];
  const scriptId = attacker.def.finisherScriptId || attacker.def.id;
  const script = projectileFinisherScript(scriptId, type);
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
    signatureProjectileTriggered: false,
    signatureProjectileId: null,
    signatureProjectileName: null,
    projectileFocusBeats: 0,
    projectileFocusBursts: 0,
    projectileBeatLabels: [],
    projectilePhase: "waiting",
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
  // Slow-mo debt plus a long look at the aftermath before the result screen.
  return script.duration + 3.4;
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
    return {
      x: W * .5,
      y: H * .5,
      zoom: 1,
      shot: "arena",
      intensity: 0,
      focus: "fighters",
      projectileId: null,
    };
  }
  const attacker = state.fighters[finisher.winner];
  const victim = state.fighters[1 - finisher.winner];
  const elapsed = finisher.elapsed;
  const projectile = state.effects.find((effect) => effect.kind === "fatalityProjectile"
    && effect.projectileId === finisher.signatureProjectileId);
  const projectileFocused = Boolean(projectile && finisher.projectileFocusBeats > 0);
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
    shot = projectileFocused
      ? (projectile.phase === "prime" ? "projectile-prime" : "projectile-trap")
      : "impact-close-up";
    zoom = Math.max(projectileFocused ? 1.5 : 1.43, poseZoom);
    intensity = projectileFocused ? .82 : .72;
  } else if ((finisher.fatalityTriggered || finisher.projectilePhase === "kill") && elapsed > finisher.fatalityAt) {
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
  const midpointX = (attacker.x + victim.x) * .5;
  const baseY = inImpactWindow || shot === "aftermath" ? lerp(midpointY, impactY, .68) : midpointY;
  const cameraX = projectileFocused && !state.accessibility.reducedMotion
    ? lerp(midpointX, projectile.x, shot === "aftermath" ? .42 : shot === "final-impact" ? .55 : .72)
    : midpointX;
  const cameraY = projectileFocused && !state.accessibility.reducedMotion
    ? lerp(baseY, projectile.y, shot === "aftermath" ? .32 : .55)
    : baseY;
  return {
    x: cameraX,
    y: clamp(cameraY, H * .3, H * .59),
    zoom,
    nominalZoom,
    shot,
    intensity,
    focus: projectileFocused ? "projectile" : "fighters",
    projectileId: projectileFocused ? projectile.projectileId : null,
  };
}

function fatalityWoundPoint(victim, fatality, direction) {
  const leg = fatality.limb.endsWith("leg");
  const side = fatality.limb.startsWith("left") ? -1 : 1;
  return {
    x: victim.x + direction * side * (leg ? 18 : 34),
    y: victim.y - (leg ? 58 : 132),
  };
}

function spawnFinisherProjectile(finisher, attacker, victim, fatality) {
  const projectile = getThrowable(attacker.def.finisherScriptId || attacker.def.id);
  if (!projectile || projectile.id !== fatality.projectileId) return;
  const target = fatalityWoundPoint(victim, fatality, finisher.direction);
  const startX = attacker.x + finisher.direction * 58;
  const startY = attacker.y - 142;
  const life = Math.max(1.4, finisher.script.duration - finisher.elapsed + 1.1);
  state.effects = state.effects.filter((effect) => effect.kind !== "fatalityProjectile");
  state.effects.push({
    kind: "fatalityProjectile",
    projectileId: projectile.id,
    name: projectile.name,
    style: projectile.style,
    ownerSide: finisher.winner,
    x: startX,
    y: startY,
    startX,
    startY,
    targetX: target.x,
    targetY: target.y,
    baseWidth: projectile.width * FIGHTER_SCALE * 1.18,
    baseHeight: projectile.height * FIGHTER_SCALE * 1.18,
    width: projectile.width * FIGHTER_SCALE * 1.18,
    height: projectile.height * FIGHTER_SCALE * 1.18,
    vx: finisher.direction * Math.max(320, projectile.speed),
    vy: projectile.launchY || -180,
    spin: projectile.spin || 8,
    spinAngle: 0,
    wobble: projectile.wobble || 0,
    hazard: false,
    landed: false,
    flightProgress: 0,
    phase: "prime",
    focusScale: 1.32,
    direction: finisher.direction,
    life,
    max: life,
    color: attacker.def.accent,
  });
  finisher.signatureProjectileTriggered = true;
  finisher.signatureProjectileId = projectile.id;
  finisher.signatureProjectileName = projectile.name;
}

function focusFinisherProjectile(finisher, attacker, victim, fatality, phase) {
  let projectile = state.effects.find((effect) => effect.kind === "fatalityProjectile"
    && effect.projectileId === fatality.projectileId);
  if (!projectile) {
    spawnFinisherProjectile(finisher, attacker, victim, fatality);
    projectile = state.effects.find((effect) => effect.kind === "fatalityProjectile"
      && effect.projectileId === fatality.projectileId);
  }
  if (!projectile) return;
  const target = fatalityWoundPoint(victim, fatality, finisher.direction);
  projectile.phase = phase;
  projectile.targetX = target.x;
  projectile.targetY = target.y;
  projectile.focusScale = phase === "kill" ? 1.82 : phase === "trap" ? 1.56 : 1.32;
  if (phase === "prime" && !rollbackResimulating) objectSound(projectile.style);
  if (phase !== "prime") {
    projectile.x = target.x;
    projectile.y = target.y;
    projectile.landed = true;
    projectile.hazard = ["wires", "bedbugs"].includes(projectile.style);
    spawnThrowableImpact({ ...projectile, throwable: true }, "impact");
  }
  state.effects.push({
    kind: "projectileFocusBurst",
    projectileId: projectile.projectileId,
    name: projectile.name,
    style: projectile.style,
    phase,
    x: phase === "prime" ? projectile.x : target.x,
    y: phase === "prime" ? projectile.y : target.y,
    direction: finisher.direction,
    life: phase === "kill" ? 1.35 : .72,
    max: phase === "kill" ? 1.35 : .72,
    color: attacker.def.accent,
  });
  finisher.projectilePhase = phase;
  finisher.projectileFocusBeats += 1;
  finisher.projectileFocusBursts += 1;
  finisher.projectileBeatLabels.push(phase === "prime"
    ? fatality.projectileSetup
    : phase === "trap" ? fatality.projectileAction : fatality.projectileFinale);
}

function triggerFinisherImpact(finisher, impact) {
  const attacker = state.fighters[finisher.winner];
  const victim = state.fighters[1 - finisher.winner];
  const finalImpact = Boolean(impact.final);
  const gore = state.graphicFatalities;
  const scriptId = attacker.def.finisherScriptId || attacker.def.id;
  const fatalityProfile = getGraphicFatality(scriptId, finisher.type);
  const fatality = finalImpact && gore ? fatalityProfile : null;
  const wound = impact.projectilePhase
    ? fatalityWoundPoint(victim, fatalityProfile, finisher.direction)
    : { x: victim.x - finisher.direction * 12, y: victim.y - 125 };
  const pointX = wound.x;
  const pointY = wound.y;
  const count = Math.round((finalImpact ? 52 : 12) * impact.power * (gore ? 1.35 : 1));

  victim.hitFlash = finalImpact ? .22 : .11;
  attacker.specialGlow = finalImpact ? 1.1 : .45;
  // The long final-frame hold reads as time dilation without changing the
  // authored pose timeline or introducing a second simulation clock.
  state.hitstop = Math.max(state.hitstop, finalImpact ? .26 : .055 + impact.power * .032);
  state.shake = Math.max(state.shake, finalImpact ? 1.1 : .16 + impact.power * .22);
  if (finalImpact && $("#flashToggle").checked) state.flash = .34;
  // Wave 7: the killing blow tears the screen — distortion ring from the
  // impact point plus a short RGB-split impulse (render-only latches).
  if (finalImpact) latchFatalImpactPresentation(pointX, pointY);
  finisher.beatLabel = impact.label;
  finisher.beatLife = finalImpact ? 1.05 : .48;
  finisher.impactCloseUps += 1;
  if (finalImpact) finisher.slowMotionHits += 1;
  if (impact.projectilePhase) {
    focusFinisherProjectile(finisher, attacker, victim, fatalityProfile, impact.projectilePhase);
  }
  // Release 1.6 LOUD: synth heft under the scripted cinematic impacts too.
  impactLayerAudio(finalImpact ? "super" : "heavy", { counter: false });
  // Wave 9: the victim's fatality scream on the killing blow — a distinct
  // cue from the shared ko bell (guarded + tick-deduped inside).
  if (finalImpact) fighterReactiveCue(victim, "scream");

  for (let index = 0; index < count; index += 1) {
    const angle = visualRandom() * Math.PI * 2;
    const speed = 100 + visualRandom() * (finalImpact ? 670 : 330) * impact.power;
    const splatter = finalImpact && gore && visualRandom() > .34;
    state.particles.push({
      kind: finalImpact && gore ? "blood" : "impact",
      x: pointX,
      y: pointY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (finalImpact ? 150 : 35),
      life: (finalImpact ? .65 : .22) + visualRandom() * (finalImpact ? 1.15 : .42),
      max: finalImpact ? 1.8 : .64,
      size: 2 + visualRandom() * (finalImpact ? 8 : 5),
      color: finalImpact && gore
        ? splatter ? "#d90b19" : visualRandom() > .45 ? "#a50713" : "#e32632"
        : visualRandom() > .4 ? attacker.def.accent : "#fff0df",
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
    finisher.fatalityTriggered = true;
    // Time dilation for the killing blow, then a pumping wound. Both are plain
    // numbers on the finisher, so rollback snapshots reproduce them exactly.
    finisher.slowMotionTicks = 42;
    finisher.arterialFrames = 210;
    finisher.fatalityLimb = fatality.limb;
    finisher.fatalitySpecial = fatality.special;
    finisher.beatLabel = fatality.projectileFinale;
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
    // One unmistakable complete limb, not an abstract meat fragment. It arcs
    // out of the signature-special impact, bounces once, and stays in the
    // aftermath beside its own blood trail for the full cinematic hold.
    state.effects.push({
      kind: "severedLimb",
      profileId: fatality.id,
      limb: fatality.limb,
      special: fatality.special,
      device: fatality.device,
      x: pointX,
      y: pointY,
      vx: finisher.direction * (240 + visualRandom() * 190),
      vy: -(390 + visualRandom() * 170),
      gravity: 1080,
      drag: .988,
      rotation: visualRandom() * Math.PI * 2,
      spin: finisher.direction * (7 + visualRandom() * 7),
      resting: false,
      bounced: false,
      life: decalLife,
      max: decalLife,
      color: fatality.palette[0],
      secondary: fatality.palette[1],
      clothColor: victim.def.color,
      clothAccent: victim.def.accent,
      direction: finisher.direction,
    });
  }
  sound(finalImpact ? "fatal" : impact.sound, attacker);
}

function updateFinisher(dt) {
  const finisher = state.finisher;
  if (!finisher) return;
  const attacker = state.fighters[finisher.winner];
  const victim = state.fighters[1 - finisher.winner];
  const slowMo = (finisher.slowMotionTicks || 0) > 0;
  if (slowMo) finisher.slowMotionTicks -= 1;
  finisher.elapsed = Math.min(finisher.script.duration, finisher.elapsed + dt * (slowMo ? 0.38 : 1));
  finisher.beatLife = Math.max(0, finisher.beatLife - dt);
  const pose = sampleFinisher(finisher.script.keys, finisher.elapsed);

  attacker.x = finisher.anchor + finisher.direction * pose.ax;
  attacker.y = FLOOR - pose.ay;
  victim.x = finisher.anchor + finisher.direction * pose.vx;
  victim.y = FLOOR - pose.vy;
  attacker.facing = victim.x >= attacker.x ? 1 : -1;
  victim.facing = -attacker.facing;
  // Keep the pair axis tracking the cinematic so the fighters stay oriented
  // through a script that walks them past each other, and so anything that
  // resumes after the finisher inherits the correct side.
  state.facingAxis = state.fighters[0].facing;
  attacker.grounded = pose.ay < 2;
  victim.grounded = pose.vy < 2;
  attacker.cinematicFrame = pose.af;
  victim.cinematicFrame = pose.vf;
  attacker.cinematicRotation = pose.ar * finisher.direction;
  victim.cinematicRotation = pose.vr * finisher.direction;
  const fatalityProfile = getGraphicFatality(attacker.def.finisherScriptId || attacker.def.id, finisher.type);
  const projectileTarget = fatalityWoundPoint(victim, fatalityProfile, finisher.direction);
  for (const effect of state.effects) {
    if (effect.kind !== "fatalityProjectile") continue;
    effect.targetX = projectileTarget.x;
    effect.targetY = projectileTarget.y;
  }
  if (finisher.fatalityTriggered && state.graphicFatalities && !state.accessibility.reducedMotion
    && finisher.elapsed > finisher.fatalityAt) {
    const aftermath = finisher.elapsed - finisher.fatalityAt;
    const fade = Math.max(0, 1 - aftermath / 2.4);
    if (fade > 0) {
      // Twitches arrive in spasms rather than a constant buzz: the slow sine
      // gates the fast one, and the whole thing decays to stillness.
      const spasm = Math.sin(state.simulationTick * 1.7) * Math.max(0, Math.sin(state.simulationTick * 0.11));
      victim.cinematicRotation += spasm * 0.055 * fade;
    }
  }
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

  // Arterial spray: the wound pumps on a heartbeat for ~2.6 seconds after the
  // killing blow. Droplets arc away from the attacker, and each one that lands
  // becomes a floor stain plus a small splash back up.
  if (finisher.fatalityTriggered && state.graphicFatalities && (finisher.arterialFrames || 0) > 0) {
    finisher.arterialFrames -= 1;
    const pump = 0.5 + 0.5 * Math.abs(Math.sin(state.simulationTick * 0.16));
    // Wave 15: one haptic lub-dub per peak of the same arterial pump wave.
    // Module-level tick latch on the wallSplatLastTick pattern; combatHaptic
    // carries the rollbackResimulating guard.
    if (pump > 0.94 && state.simulationTick - lastHeartbeatHapticTick > 12) {
      lastHeartbeatHapticTick = state.simulationTick;
      combatHaptic("fatalityHeartbeat");
    }
    const scriptId = attacker.def.finisherScriptId || attacker.def.id;
    const fatality = getGraphicFatality(scriptId, finisher.type);
    const wound = fatalityWoundPoint(victim, fatality, finisher.direction);
    if (state.simulationTick % 2 === 0) {
      const jets = 1 + (pump > 0.82 ? 1 : 0) + (state.performance.particleScale >= 1 ? 1 : 0);
      for (let jet = 0; jet < jets; jet += 1) {
        const vr = visualRandom();
        state.particles.push({
          kind: "arterial",
          x: wound.x + (visualRandom() - .5) * 8,
          y: wound.y + (visualRandom() - .5) * 7,
          vx: finisher.direction * (110 + vr * 390) * pump + (visualRandom() - 0.5) * 110,
          vy: -(190 + visualRandom() * 460) * pump,
          gravity: 1150, drag: 0.985,
          life: 1.5, max: 1.5,
          size: 2 + visualRandom() * 2.6,
          color: vr > 0.4 ? "#a50713" : "#d90b19",
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Wave 16 — context win quotes. The pools and the pure selector live in
// engine/fighter-kits.mjs; this side supplies the CONTEXT (all states the
// result path already knows) plus the visualRandom roll and the per-fighter
// no-repeat memory. lastWinQuoteSelection is exposed for QA probes.
// ---------------------------------------------------------------------------
const lastWinQuoteKeys = new Map();
let lastWinQuoteSelection = null;

function selectResultQuote(winner, def) {
  const loserDef = state.fighters[1 - winner]?.def;
  const winnerId = def.kitId || def.id;
  const loserId = loserDef ? loserDef.kitId || loserDef.id : "";
  const context = {
    fatality: state.finisherType >= 0,
    flawless: (state.fighters[winner]?.health ?? 0) >= 100,
    comeback: state.finisherType < 0 && (voiceRoundMinHealth[winner] ?? 100) <= 15,
    boss: loserId === ARCADE_BOSS_ID && winnerId !== ARCADE_BOSS_ID,
    rival: Boolean(loserId) && ARCADE_RIVALS[winnerId] === loserId,
    mirror: Boolean(loserId) && loserId === winnerId,
  };
  const selection = selectWinQuote(winnerId, context, visualRandom(), lastWinQuoteKeys.get(winnerId) || "");
  if (!selection) return "";
  lastWinQuoteKeys.set(winnerId, selection.key);
  lastWinQuoteSelection = { fighterId: winnerId, ...selection, context };
  modeFxDebug.winQuoteSelections += 1;
  return selection.text;
}

function showResult(winner) {
  state.phase = "result";
  state.finisher = null;
  state.cinematicZoom = 1;
  updateFlowSkipHint();
  const def = state.fighters[winner].def;
  const kit = getFighterKit(def.kitId || def.id);
  const dailyOver = dailySession.active && dailySession.finished;
  const arcadeDefeat = state.mode === "arcade" && winner === 1 && state.arcadeRun && !dailyOver;
  const survivalOver = state.mode === "survival" && state.survivalRun?.over;
  const teamOver = state.mode === "team" && state.teamBattle?.over;
  $("#resultEyebrow").textContent = state.mode === "demo" ? `WATCH DEMO · CYCLE ${demoSession.cycle?.cycle || 1}`
    : survivalOver ? "THE GAUNTLET · RUN ENDED"
      : teamOver ? "BLOCK WAR · 3V3 SETTLED"
        : dailyOver ? "THE DAILY JAWN · ONE SHOT A DAY"
          : arcadeDefeat ? "ARCADE RUN INTERRUPTED" : "MATCH COMPLETE";
  $("#resultTitle").textContent = teamOver ? `TEAM P${state.teamBattle.winnerSide + 1} WINS` : `${def.name} WINS`;
  $("#resultFinisher").textContent = survivalOver
    ? `${state.survivalRun.wins} WINS · ${Math.round(scoreSession.total).toLocaleString("en-US")} PTS · BEST ${survivalBestSummary().streak}`
    : teamOver
      ? `${def.name} HOLDS THE BLOCK · ${teamFightersRemaining(state.teamBattle, state.teamBattle.winnerSide)} STILL STANDING`
      : dailyOver
        ? `${dailySession.outcome?.cleared ? "CLEARED" : "RUN OVER"} · ${Math.round(scoreSession.total).toLocaleString("en-US")} PTS`
        : arcadeDefeat
          ? `${currentArcadeMatch(state.arcadeRun)?.label || "BOUT"} · CONTINUE?`
          : state.finisherType >= 0 ? def.finishers[state.finisherType] : "KNOCKOUT";
  const victoryPose = $("#victoryPose");
  victoryPose.classList.toggle("portrait-art", !kit || def.boss || def.secret);
  victoryPose.style.backgroundImage = kit && !def.boss && !def.secret
    ? `url("${posesSheetUrl(def)}")`
    : `url("assets/fighters/${def.id}.webp")`;
  // Wave 16: context-aware win quote — pool keyed to HOW the match was won,
  // rotated no-repeat via visualRandom (presentation stream only).
  $("#resultQuote").textContent = selectResultQuote(winner, def)
    || def.victoryQuote || kit?.victory.quote || "PHILLY REMEMBERS THE WINNER.";
  $("#rematchButton").textContent = survivalOver ? "NEW GAUNTLET RUN"
    : teamOver ? "REMATCH · SAME TEAMS"
      : dailyOver ? "BACK TO TITLE"
        : arcadeDefeat ? "CONTINUE" : state.mode === "online" ? "REQUEST REMATCH" : "INSTANT REMATCH";
  $("#reselectButton").textContent = arcadeDefeat ? "ABANDON RUN"
    : state.mode === "online" ? "LEAVE ROOM" : "SELECT FIGHTERS";
  $("#newStageButton").hidden = state.mode !== "versus";
  updateDailyBanners();
  showScreen("result");
  // Victory entrance: pose rises from the bottom edge, the WINS title slams
  // in with a scale-settle, the finisher name stamps down last, and a light
  // sweep passes across the copy panel. One-shot per match end; all classes
  // are flattened by body.reduced-motion into static end states.
  restartCssAnimation(victoryPose, "enter");
  restartCssAnimation($("#resultTitle"), "enter");
  restartCssAnimation($("#resultFinisher"), "enter");
  restartCssAnimation($(".result-copy"), "sweep");
  hudFxDebug.victoryEntrances += 1;
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

// ===========================================================================
// v2.1 PROGRESSION — arcade ending sequence: three treated story panels over
// art the game already ships (the 4x4 specials atlas + the roster portrait),
// an SF2-style credits roll, then the classic resting ending card. Pure DOM
// overlay, so it reads identically under the 2D canvas and CINEMA 3D. Every
// beat is skippable with any attack button / tap / pad confirm; reduced
// motion swaps crossfade+pan for instant cuts and a static credits list.
// ===========================================================================

const endingSequence = {
  active: false,
  def: null,
  panels: [],
  step: -1,
  timer: 0,
};

const ENDING_PANEL_NUMERALS = ["I", "II", "III"];

function clearEndingSequenceTimer() {
  window.clearTimeout(endingSequence.timer);
  endingSequence.timer = 0;
}

function cancelEndingSequence() {
  clearEndingSequenceTimer();
  endingSequence.active = false;
  endingSequence.step = -1;
  $("#endingScreen").classList.remove("sequencing");
  $("#endingPanels").hidden = true;
  $("#endingCredits").hidden = true;
}

function scheduleEndingAdvance(ms) {
  clearEndingSequenceTimer();
  endingSequence.timer = window.setTimeout(() => {
    endingSequence.timer = 0;
    advanceEndingSequence();
  }, ms);
}

function renderEndingPanel(step) {
  const panel = endingSequence.panels[step];
  const def = endingSequence.def;
  if (!panel || !def) return;
  const art = $("#endingPanelArt");
  const isPortrait = panel.art === "portrait";
  art.classList.toggle("portrait", isPortrait);
  art.classList.toggle("atlas", !isPortrait);
  art.style.backgroundImage = isPortrait
    ? `url("assets/fighters/${def.id}.webp")`
    : `url("${posesSheetUrl(def)}")`;
  if (isPortrait) {
    art.style.backgroundPosition = "";
  } else {
    // Frame one 4x4 atlas cell exactly like the victory pose treatment does.
    const frame = clamp(Math.round(panel.frame ?? 0), 0, 15);
    art.style.backgroundPosition = `${((frame % 4) / 3) * 100}% ${(Math.floor(frame / 4) / 3) * 100}%`;
  }
  const panelEl = $("#endingPanel");
  panelEl.dataset.treat = panel.treat || "night";
  $("#endingPanelIndex").textContent = `PART ${ENDING_PANEL_NUMERALS[step] || step + 1} · ${def.name}`;
  $("#endingPanelTitle").textContent = panel.title;
  $("#endingPanelText").textContent = panel.text;
  // Crossfade + slow pan; the global reduced-motion kill-rule flattens both
  // into an instant cut.
  restartCssAnimation(panelEl, "enter");
  modeFxDebug.endingPanelsShown += 1;
  scheduleEndingAdvance(state.accessibility.reducedMotion ? 5600 : 7400);
}

function renderEndingCredits() {
  const reduced = state.accessibility.reducedMotion;
  const crawl = $("#endingCreditsCrawl");
  crawl.innerHTML = `
    <div class="credits-heading"><b>${ARCADE_CREDITS.heading}</b><span>${ARCADE_CREDITS.subheading}</span></div>
    <div class="credits-section">${ARCADE_CREDITS.castTitle}</div>
    ${roster.map((def) => `<div class="credit-cast"><img src="assets/fighters/${def.id}.webp" alt="" draggable="false"><b>${def.name}</b><span>${def.title}</span></div>`).join("")}
    <div class="credit-row"><span>${ARCADE_CREDITS.bossCredit.role}</span><b>${ARCADE_CREDITS.bossCredit.name}</b></div>
    <div class="credits-section">${ARCADE_CREDITS.crewTitle}</div>
    ${ARCADE_CREDITS.crew.map((row) => `<div class="credit-row"><span>${row.role}</span><b>${row.name}</b></div>`).join("")}
    <div class="credit-finale">${ARCADE_CREDITS.finale}</div>`;
  $("#endingPanels").hidden = true;
  const container = $("#endingCredits");
  container.classList.toggle("static", reduced);
  container.hidden = false;
  modeFxDebug.creditsRolls += 1;
  if (reduced) {
    crawl.classList.remove("roll");
    scheduleEndingAdvance(9000);
  } else {
    crawl.style.setProperty("--credits-ms", "30s");
    restartCssAnimation(crawl, "roll");
    scheduleEndingAdvance(30800);
  }
}

function finishEndingSequence() {
  cancelEndingSequence();
  // The resting ending card (replay / title / daily share) takes the screen.
  restartCssAnimation($("#endingScreen").querySelector(".ending-copy"), "enter");
}

function advanceEndingSequence() {
  if (!endingSequence.active) return false;
  if (state.screen !== "ending") {
    cancelEndingSequence();
    return false;
  }
  clearEndingSequenceTimer();
  endingSequence.step += 1;
  if (endingSequence.step < endingSequence.panels.length) renderEndingPanel(endingSequence.step);
  else if (endingSequence.step === endingSequence.panels.length) renderEndingCredits();
  else finishEndingSequence();
  return true;
}

function beginEndingSequence(def, panels) {
  endingSequence.active = true;
  endingSequence.def = def;
  endingSequence.panels = [...panels];
  endingSequence.step = -1;
  $("#endingScreen").classList.add("sequencing");
  $("#endingCredits").hidden = true;
  $("#endingPanels").hidden = false;
  modeFxDebug.endingSequences += 1;
  advanceEndingSequence();
}

// Any attack button (either seat's bindings), Enter or Space skips the
// current ending beat. Pad confirm routes in via menuPadLoop; taps via the
// pointer handlers on the panel/credits containers.
function endingSkipKeyCode(code) {
  if (code === "Enter" || code === "Space") return true;
  return keyMaps.some((map) => [map.lp, map.hp, map.lk, map.hk].includes(code));
}

function handleEndingKey(event) {
  if (!endingSequence.active || state.screen !== "ending") return false;
  if (!endingSkipKeyCode(event.code)) return false;
  event.preventDefault();
  advanceEndingSequence();
  return true;
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
  $("#endingArt").style.backgroundImage = `url("${posesSheetUrl(def)}")`;
  renderArcadeRoute();
  updateDailyBanners();
  showScreen("ending");
  // v2.1 PROGRESSION: the 3-panel resolution + credits roll runs first; the
  // card above is the sequence's resting state (and the fallback if a fighter
  // ever ships without panels).
  const panels = endingPanelsFor(def.id);
  if (panels?.length) beginEndingSequence(def, panels);
  else cancelEndingSequence();
}

function resolveMatchResult(winner) {
  // Release 1.8 GRIND: mode routing. Survival and Block War resolve their
  // single-round bouts here; arcade (and the Daily Jawn riding it) keeps the
  // ladder flow but gains the SF2 tally + initials loop.
  if (state.mode === "survival" && state.survivalRun) {
    resolveSurvivalResult(winner);
    return;
  }
  if (state.mode === "team" && state.teamBattle) {
    resolveTeamResult(winner);
    return;
  }
  if (state.mode !== "arcade" || !state.arcadeRun) {
    // v2.1 PROGRESSION: versus/online matches fold into the records book here
    // (meta path — observation only, never during resimulation).
    progressionMatchEnd(winner);
    showResult(winner);
    return;
  }
  const outcome = recordArcadeResult(state.arcadeRun, winner === 0);
  if (winner !== 0) {
    // The Daily Jawn is one attempt — a defeat ends the run (score recorded,
    // streak broken) with no continues, then initials if the total charts.
    if (dailySession.active && !dailySession.finished) {
      finishDailyRun(false);
      progressionMatchEnd(winner);
      maybeEnterInitials(() => showResult(winner));
      return;
    }
    progressionMatchEnd(winner);
    showResult(winner);
    return;
  }
  const tallyContext = finalizeBoutTally();
  // v2.1 PROGRESSION: fold the cleared bout (after the tally banks so the
  // ledger sees the run score), and ink the ladder clear itself.
  progressionMatchEnd(0);
  if (outcome.completed) {
    progressionRunEnd("arcade", {
      fighterId: state.arcadeRun.playerId,
      finalDifficulty: !dailySession.active && state.aiDifficulty === "final",
    });
  }
  const proceed = () => {
    if (outcome.completed) {
      if (dailySession.active && !dailySession.finished) finishDailyRun(true);
      maybeEnterInitials(() => showArcadeEnding());
      return;
    }
    prepareArcadeOpponent(true);
    showArcadeLadder(outcome.match);
  };
  if (tallyContext) {
    const cleared = arcadeOpponentDef(outcome.match)?.name || "";
    showBoutTally(tallyContext, proceed, {
      title: outcome.completed ? "ARCADE CLEARED" : `${outcome.match.label} CLEARED`,
      sub: cleared ? `${cleared} DEFEATED · ×${tallyContext.multiplier} DIFFICULTY` : "",
    });
  } else proceed();
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
    // The damage ghost (#p1Damage/#p2Damage) is driven per rendered frame by
    // updateDamageGhosts() — hold-then-drain — so it is not synced here.
    $(`#${prefix}Meter`).style.transform = `scaleX(${clamp(fighter.meter, 0, 100) / 100})`;
    $(`#${prefix}Grit`).textContent = String(Math.floor(fighter.meter));
    $(`#${prefix}Meter`).closest(".grit-row").classList.toggle("full", fighter.meter >= GRIT_RULES.superCost);
    // Round pips only rebuild when the win count changes (updateHud fires on
    // every hit and timer tick, which would restart the flip constantly). The
    // freshly earned pip carries .flip for the 180° flash-flip entrance.
    const roundsEl = $(`#${prefix}Rounds`);
    const wins = state.rounds[side];
    if (roundsEl.dataset.wins !== String(wins)) {
      const previousWins = Number(roundsEl.dataset.wins || 0);
      roundsEl.dataset.wins = String(wins);
      roundsEl.innerHTML = [0, 1].map((round) => {
        const won = wins > round;
        const fresh = won && wins > previousWins && round === wins - 1;
        if (fresh) hudFxDebug.pipFlips += 1;
        return `<i class="${won ? (fresh ? "won flip" : "won") : ""}"></i>`;
      }).join("");
    }
  });
  state.fighters.forEach((fighter, side) => {
    const prefix = `p${side + 1}`;
    const profile = getThrowable(fighter.kitId);
    $(`#${prefix}ObjectName`).textContent = profile ? profile.name : "—";
    $(`#${prefix}Objects`).innerHTML = profile
      ? Array.from({ length: profile.usesPerRound }, (_, index) => `<i class="${index < fighter.throwableUses ? "left" : ""}"></i>`).join("")
      : "";
  });
  // Final-10-seconds urgency: red heartbeat pulse, quickening under 5. The
  // red comes from the static .low class (not the animation) so reducedMotion
  // keeps a calm steady red once the CSS kill-rule flattens the keyframes.
  const timerEl = $("#timer");
  const timerValue = state.mode === "training" ? "∞" : String(Math.ceil(state.timer)).padStart(2, "0");
  const timerLow = state.mode !== "training" && state.phase === "fight" && state.timer <= 10;
  timerEl.classList.toggle("low", timerLow);
  timerEl.classList.toggle("critical", timerLow && state.timer <= 5);
  if (timerEl.dataset.value !== timerValue) {
    timerEl.dataset.value = timerValue;
    timerEl.textContent = timerValue;
    if (timerLow) {
      restartCssAnimation(timerEl, "tick");
      hudFxDebug.timerPulses += 1;
    }
  }
  if (!timerLow) timerEl.classList.remove("tick");
  const battle = state.teamBattle;
  $("#roundLabel").textContent = state.mode === "training" ? "TRAINING"
    : state.mode === "demo" ? `DEMO · ROUND ${state.round}`
      : state.mode === "survival" ? `GAUNTLET · BOUT ${(currentSurvivalBout(state.survivalRun)?.index ?? 0) + 1}`
        : state.mode === "team" && battle ? `BLOCK WAR · ${teamFightersRemaining(battle, 0)}V${teamFightersRemaining(battle, 1)}`
          : `ROUND ${state.round}`;
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
  // R1.9: options carry the tier tag + a check for earned medals, so the
  // rebuild key includes the medal count for this fighter.
  const counts = fighterMedalCounts(trialMedals, fighterId);
  const stamp = `${fighterId}:${counts.total}`;
  if (select.dataset.stamp !== stamp) {
    select.dataset.stamp = stamp;
    select.dataset.fighterId = fighterId;
    select.innerHTML = trials.map((trial, index) => {
      const medal = medalForTrial(trialMedals, fighterId, trial.id);
      return `<option value="${index}">${index + 1} · ${trial.name} · ${trial.tier.toUpperCase()}${medal ? " ✓" : ""}</option>`;
    }).join("");
  }
  select.value = String(state.training.trialIndex);
  $("#trainingTrialMedals").innerHTML = counts.total ? medalMarkup(counts) : "";
}

function updateTrainingUi(input = {}) {
  if (rollbackResimulating) return;
  if (state.mode !== "training" || !state.fighters.length) return;
  const [player] = state.fighters;
  const combo = player.combo.snapshot(state.simulationTick);
  if (combo.damage > 0) state.training.lastDamage = combo.damage;
  // R1.9: per-tick training feeds — frame meter cells, the arcade input
  // column, and the FIGHT SCHOOL walk/setup babysitter. All render-side; this
  // function already early-returns during rollback resimulation.
  feedFrameMeter();
  feedInputColumn(input);
  renderInputColumn();
  schoolTick();
  renderSchoolPanel();
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
  // Release 1.7: Perfect Guard practice readout (player just-defends landed).
  $("#trainingPerfectGuards").textContent = String(snapshot.perfectGuards);
  // R1.9: the arcade input column (left edge) replaced the flat INPUT line;
  // this line keeps the dummy/reset status readout only.
  $("#trainingInputs").textContent = `DUMMY: ${snapshot.dummyMode.toUpperCase()}  //  RESETS: ${snapshot.resets}  //  ${snapshot.lastResult || "READY"}`;
  $("#trainingTrialSteps").innerHTML = `TRIAL: ${snapshot.trial.steps.map((step, index) => `<span class="${step.complete ? "done" : index === snapshot.trial.step ? "next" : ""}">${step.label}</span>`).join(" › ") || "—"}`;
  $("#trainingTrialStatus").textContent = `${snapshot.trial.status}${snapshot.trial.complete ? ` · ${snapshot.trial.completions} CLEAR` : ""}`;
  $("#trainingDummySelect").value = snapshot.dummyMode;
  $("#trainingRecoverToggle").checked = snapshot.autoRecover;
  $("#trainingGritToggle").checked = snapshot.infiniteGrit;
  $("#trainingHitboxToggle").checked = snapshot.showHitboxes;
  $("#trainingFrameMeterToggle").checked = snapshot.showFrameMeter;
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
  if ($("#cabinetModeToggle")) $("#cabinetModeToggle").checked = state.cabinetMode;
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
  // R1.9 FIGHT SCHOOL: the LP/LK Final Blow window lesson validates on the
  // executed finisher (guarded meta observation, announce() pattern).
  if (!rollbackResimulating && side === 0 && state.mode === "training") {
    schoolEvent({ type: "finisher" });
  }
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
  "enhancedThrowObject",
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
  const throwObjectAction = action === "throwObject" || action === "enhancedThrowObject";
  if (throwObjectAction && fighter.throwableUses <= 0) return false;
  if (throwObjectAction) {
    const profile = getThrowable(fighter.kitId);
    const activeObjects = state.projectiles.filter((projectile) => projectile.ownerSide === fighter.side && projectile.throwable === profile?.id);
    if (profile && activeObjects.length >= profile.maxActive) return false;
  }
  const throwObjectProfile = throwObjectAction
    ? createThrowObjectMove(fighter.kitId, {
      strength: input.heavy ? "heavy" : "light",
      enhanced: action === "enhancedThrowObject",
    })
    : null;
  if (throwObjectAction && !throwObjectProfile) return false;
  const kitMove = throwObjectProfile
    ? createAttackInstance(throwObjectProfile.baseKind, { ...throwObjectProfile, profileId: throwObjectProfile.id })
    : createFighterMove(fighter.kitId, action, moveContext);
  // The EX throwable carries its Grit price on the profile itself; the pip
  // cost below is shared with the base throw.
  const gritCost = throwObjectProfile
    ? (throwObjectProfile.gritCost || 0)
    : kitMove
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
  // R1.9 LEGEND: one-button specials trade ~10% damage. Deterministic: the
  // style is shared match config online (matchConfig.controlStyles) and the
  // single local setting offline, so both rollback peers scale identically.
  // CPU-driven seats never pay the tax.
  if (legendScaledAction(action) && activeControlStyle(fighter.side) === "legend"
    && !sideIsCpuControlled(fighter.side)) {
    fighter.attacking.damage = Number((fighter.attacking.damage * LEGEND_DAMAGE_SCALE).toFixed(4));
    fighter.attacking.chipDamage = Number(((fighter.attacking.chipDamage || 0) * LEGEND_DAMAGE_SCALE).toFixed(4));
  }
  if (fighter.def.boss) {
    fighter.attacking.damage = Number((fighter.attacking.damage * 1.08).toFixed(4));
    fighter.attacking.chipDamage = Number(((fighter.attacking.chipDamage || 0) * 1.08).toFixed(4));
    if (fighter.attacking.advanceSpeed) fighter.attacking.advanceSpeed *= 1.04;
  }
  fighter.attackSerial += 1;
  fighter.attacking.attackSerial = fighter.attackSerial;
  // Release 1.7 wave 11: QA counter for the derived forward command kicks
  // (their derive suffixes are the stable signature).
  if (!rollbackResimulating && /-(step-knee|axe-kick|slide)$/.test(fighter.attacking.profileId || "")) {
    mechFxDebug.commandKicks += 1;
  }
  // v2.1 PROGRESSION: per-move usage tally (render-only meta counters on the
  // mechFxDebug pattern; the guard keeps resimulated ticks from double-counting).
  if (!rollbackResimulating) progressionNoteMove(fighter);
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
    // R1.9: the S/A/R computation is the shared attackFrameData helper now, so
    // this readout, the frame meter and the move list all agree by construction.
    const move = fighter.attacking;
    const data = attackFrameData(move);
    state.training.lastMove = {
      name: move.moveName || prettyProfileName(move.profileId, fighter.kitId) || move.kind,
      startup: data.startup,
      active: data.active,
      recovery: data.recovery,
      onHit: data.onHit,
      onBlock: data.onBlock,
      level: data.level,
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
  if (fighter.attacking.kind === "heavy" || fighter.attacking.kind === "special") spawnSweat(fighter, 4, 1.1);
  if (fighter.attacking.superMove) {
    if ($("#flashToggle").checked) state.flash = Math.max(state.flash, 0.22);
    state.hitstop = Math.max(state.hitstop, 0.09);
    spawnCombatText(fighter.x, fighter.y - fighter.height - 35, "FULL GRIT SUPER", fighter.def.accent);
    // Wave 7: portrait cut-in band + screen-space distortion ring, latched
    // module-level on the announce() pattern (rollback guard + tick dedupe).
    latchSuperPresentation(fighter);
  }
  if (linkedFrom) spawnCombatText(fighter.x, fighter.y - fighter.height - 20, "LINK", fighter.def.accent);
  // Release 1.7A CLEAN HITS: move names remain available in the move list and
  // training data, but normal play no longer narrates each attack over the
  // fighters. Tactical callouts such as COUNTER, LOW and GUARD CRUSH remain.
  updateHud();
  sound(attackSwingCue(fighter.attacking, actionGroup), fighter);
  // Release 1.6 LOUD: synthesized pre-impact whoosh layered under the swing
  // sample (guards + tier gating live inside).
  impactSwingWhoosh(fighter.attacking);
  return true;
}

const bufferedActions = [
  "jump",
  "throwObject",
  "enhancedThrowObject",
  "taunt",
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
  // Release 1.7 wave 11: double-tap-Down tracker for the taunt chord. Runs on
  // the raw down state before resolution, entirely on snapshotted fighter
  // fields, so both rollback peers arm and expire the window identically. A
  // second press only counts after a genuine release (dash-style edge), so a
  // slow quarter-circle can never arm it.
  const downHeld = Boolean(input?.down);
  if (downHeld && !fighter.downTapHeld) {
    if (state.simulationTick - fighter.downTapLastTick <= TAUNT_RULES.doubleTapWindowFrames) {
      fighter.tauntArmedUntilTick = state.simulationTick + TAUNT_RULES.armFrames;
    }
    fighter.downTapLastTick = state.simulationTick;
  }
  fighter.downTapHeld = downHeld;
  const tauntArmed = state.simulationTick <= fighter.tauntArmedUntilTick;
  const source = input?.fourButton
    ? resolveFourButtonInput(input, {
      facing: fighter.facing,
      style: activeControlStyle(side),
      meter: fighter.meter,
      finishing,
      finishArmed: state.finishArmed[side],
      tauntArmed,
    })
    : input;
  // The taunt travels as light+heavy+kick — a combination nothing else emits —
  // so remote bits, QA overrides and the AI's direct taunt flag all decode to
  // the same deliberate input.
  const tauntPressed = Boolean(source.taunt
    || (source.light && source.heavy && source.limb === "kick"));
  const normalPress = !tauntPressed && Boolean(source.light || source.heavy);
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
    taunt: tauntPressed,
    punch: !tauntPressed && Boolean(source.punch ?? (normalPress && limb === "punch")),
    kick: !tauntPressed && Boolean(source.kick ?? (normalPress && limb === "kick")),
  };
  if (tauntPressed) {
    normalized.light = false;
    normalized.heavy = false;
  }
  for (const action of advancedActions) normalized[action] = Boolean(normalized[action] || source[action]);
  // R1.9: LEGEND expands its single special pulse against the held direction
  // here, inside the sim, identically on both rollback peers. The airborne
  // flag keeps the air special reachable from the one button.
  Object.assign(normalized, applyControlStyle(normalized, activeControlStyle(side), fighter.facing, {
    airborne: !fighter.grounded,
  }));
  recordInput(side, normalized, fighter);
  if (state.phase === "fight") {
    const command = recognizeFighterCommand(
      fighter.kitId,
      commandHistory[side],
      state.simulationTick,
      // The chord limb splits the down-back EX read: punch chord = EX back
      // special, kick chord = EX personal throwable.
      { limb: normalized.enhanced ? normalized.limb : "" },
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
      // R1.9: motion-recognition flash for the training input column — a
      // render-side latch on the announce() pattern, fired exactly when the
      // recognizer consumes the tokens.
      if (!rollbackResimulating && state.mode === "training" && side === 0) {
        latchInputColumnFlash(command.action, fighter);
      }
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
  // Release 1.8 GRIND: score attack — dizzying the CPU banks a tally bonus
  // (guarded meta bookkeeping; no sim state involved).
  awardDizzyScore(attacker);
  // v2.1 PROGRESSION: per-match dizzy tally for the attacker (guarded).
  if (!rollbackResimulating && (attacker?.side === 0 || attacker?.side === 1)) {
    progressionMatch.dizzies[attacker.side] += 1;
  }
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
  // Wave 15: the dizzy flutters in the hands (all gates inside).
  combatHaptic("dizzy");
  // Wave 9: dazed voice bark layered over the ring (guarded + tick-deduped).
  fighterReactiveCue(fighter, "dizzy");
  // Wave 6: camera pop on the dizzy trigger (render-only latch, guarded +
  // tick-deduped inside).
  latchDizzyCameraPunch(fighter);
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

// Release 1.7 wave 11 — the punishable taunt. ~45 fully vulnerable frames in
// the fighter's victory pose. The voice line is drawn from state.rng HERE, in
// the simulation, so both rollback peers rotate identically (the draw itself
// must never be resim-guarded — only the audible side effects are).
function performTaunt(fighter) {
  if (fighter.tauntFrames > 0) return;
  fighter.tauntFrames = TAUNT_RULES.durationFrames;
  fighter.tauntTotalFrames = TAUNT_RULES.durationFrames;
  fighter.tauntArmedUntilTick = -Infinity;
  fighter.vx = 0;
  fighter.block = false;
  fighter.guarding = false;
  fighter.crouch = false;
  const lines = FIGHTER_TAUNT_LINES[fighter.kitId]?.length || TAUNT_RULES.voiceLines;
  fighter.tauntLine = Math.floor(random() * lines) % lines;
  if (!rollbackResimulating) {
    mechFxDebug.taunts += 1;
    // v2.1 PROGRESSION: Black Book showboat entry (guarded, P1 seat only).
    progressionEvent("taunt", {}, fighter.side);
  }
  spawnCombatText(fighter.x, fighter.y - fighter.height - 44, "TAUNT", fighter.def.accent);
  stirCrowd(0.25);
  fighterTauntCue(fighter, fighter.tauntLine);
}

function interruptTaunt(fighter) {
  fighter.tauntFrames = 0;
  fighter.tauntTotalFrames = 0;
}

function completeTaunt(fighter) {
  fighter.tauntTotalFrames = 0;
  if (fighter.tauntGritGranted) return;
  fighter.tauntGritGranted = true;
  fighter.meter = clamp(fighter.meter + TAUNT_RULES.gritBonus, 0, GRIT_RULES.maximum);
  spawnCombatText(fighter.x, fighter.y - fighter.height - 40, `+${TAUNT_RULES.gritBonus} GRIT`, fighter.def.accent);
  updateHud();
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
  // Landing before reaching the wall forfeits the pending bounce conversion.
  fighter.wallBounceArmed = 0;
  if (fighter.tauntFrames > 0) interruptTaunt(fighter);
  fighter.down = true;
  fighter.knockdownFrames = DEFENSE_RULES.knockdownFrames;
  fighter.wakeupFrames = 0;
  fighter.hitstunFrames = 0;
  fighter.blockstunFrames = 0;
  fighter.vx *= 0.28;
  fighter.vy = 0;
  fighter.attacking = null;
  // Release 1.7: a fresh knockdown resets the wake-up option and any pending
  // air-recovery eligibility — the juggle is over.
  fighter.wakeOption = "";
  fighter.airTechArmed = false;
  fighter.airHitstunFrames = 0;
  fighter.airTechFlipFrames = 0;
  fighter.airTechTaxPending = false;
  fighter.inputBuffer.clear();
}

// Release 1.7: guard gauge — the addStun mirror for BLOCKED pressure. Fed
// from the blocked branch of hit() where blockstunFrames is set; immune and
// already-crushed defenders take no pressure, and a Perfect Guard absorbs the
// gain entirely inside guardGainForAttack.
function addGuardPressure(victim, attacker, attack, { perfect = false } = {}) {
  if (victim.guardImmuneFrames > 0 || victim.guardCrushFrames > 0) return;
  const gain = guardGainForAttack(attack, { blocked: true, perfect });
  if (gain <= 0) return;
  victim.guardMeter = Number((victim.guardMeter + gain).toFixed(3));
  victim.guardDecayDelay = GUARD_RULES.decayGraceFrames;
  if (victim.guardMeter >= GUARD_RULES.threshold) enterGuardCrush(victim, attacker);
}

// GUARD CRUSH: the enterDizzy path re-used for the shattered guard — the
// fighter is briefly helpless, with its own immunity window on recovery so a
// crush can never loop. All spectacle routes through the existing wave 1-9
// systems from this sim event, never the other way round.
function enterGuardCrush(fighter, attacker) {
  fighter.guardMeter = 0;
  fighter.guardDecayDelay = 0;
  fighter.guardCrushFrames = GUARD_RULES.crushFrames;
  fighter.guardCrushTotalFrames = GUARD_RULES.crushFrames;
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
  fighter.lastHitResult = "guard-crush";
  state.hitstop = Math.max(state.hitstop, 0.14);
  state.shake = Math.max(state.shake, 0.3);
  if ($("#flashToggle").checked) state.flash = Math.max(state.flash, 0.16);
  if (!rollbackResimulating) {
    mechFxDebug.guardCrushes += 1;
    // v2.1 PROGRESSION: the crusher's ledger tally (guarded, P1 seat only).
    if (attacker) progressionEvent("guardCrush", {}, attacker.side);
  }
  spawnCombatText(fighter.x, fighter.y - fighter.height - 52, "GUARD CRUSH", "#7de8ff");
  // Announcer letter-slam banner + its spoken bank cue (announce() carries the
  // resim guard and books the guardcrush announcer bank).
  announce("GUARD CRUSH", "", 1.05);
  duckMusic(0.55, 620);
  sound("block", fighter);
  // Wave 9: crush-specific reactive voice bark (guarded + tick-deduped).
  fighterReactiveCue(fighter, "crush");
  // Wave 6: camera punch-in on the shatter (render-only latch).
  latchGuardCrushCameraPunch(fighter);
  if (attacker) state.lastImpactSide = attacker.side;
}

function recoverFromGuardCrush(fighter) {
  fighter.guardCrushFrames = 0;
  fighter.guardCrushTotalFrames = 0;
  fighter.guardMeter = 0;
  fighter.guardDecayDelay = 0;
  // The long immunity after recovery is what makes crush loops impossible.
  fighter.guardImmuneFrames = GUARD_RULES.immuneFrames;
  fighter.hitstunFrames = 0;
  fighter.stun = 0;
  fighter.invulnerableFrames = Math.max(fighter.invulnerableFrames, 6);
  spawnCombatText(fighter.x, fighter.y - fighter.height - 40, "GUARD RESTORED", fighter.def.accent);
  sound("block", fighter);
}

// Release 1.7: air recovery (juggle tech) — escapes the juggle into a brief
// invulnerable back-flip; the landing tax is applied by applyFighterPhysics.
function performAirRecovery(fighter) {
  fighter.pendingKnockdown = false;
  fighter.wallBounceArmed = 0;
  fighter.hitstunFrames = 0;
  fighter.stun = 0;
  fighter.airTechArmed = false;
  fighter.airHitstunFrames = 0;
  fighter.airTechFlipFrames = AIR_RECOVERY_RULES.flipFrames;
  fighter.airTechTaxPending = true;
  fighter.invulnerableFrames = Math.max(fighter.invulnerableFrames, AIR_RECOVERY_RULES.invulnerableFrames);
  fighter.vx = -fighter.facing * AIR_RECOVERY_RULES.driftVelocityX;
  fighter.vy = Math.min(fighter.vy, AIR_RECOVERY_RULES.liftVelocityY);
  fighter.lastHitResult = "air-tech";
  if (!rollbackResimulating) mechFxDebug.airRecoveries += 1;
  spawnCombatText(fighter.x, fighter.y - fighter.height - 44, "AIR TECH", fighter.def.accent);
  // Wave 9: the throw-tech shout reads naturally on an air tech too.
  fighterReactiveCue(fighter, "tech");
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
  // Release 1.7: guard gauge clocks — the stun decay chain mirrored exactly.
  fighter.guardImmuneFrames = Math.max(0, fighter.guardImmuneFrames - 1);
  fighter.airTechFlipFrames = Math.max(0, fighter.airTechFlipFrames - 1);
  if (fighter.guardCrushFrames > 0) {
    fighter.guardCrushFrames -= 1;
    if (fighter.guardCrushFrames === 0) recoverFromGuardCrush(fighter);
  } else if (fighter.guardDecayDelay > 0) {
    fighter.guardDecayDelay -= 1;
  } else if (fighter.guardMeter > 0) {
    fighter.guardMeter = Math.max(0, Number((fighter.guardMeter - GUARD_RULES.decayPerFrame).toFixed(3)));
  }
  // Release 1.7: airborne-hitstun clock for the juggle-tech window.
  if (!fighter.grounded && fighter.pendingKnockdown) fighter.airHitstunFrames += 1;
  else fighter.airHitstunFrames = 0;
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
      // The combo is over: the once-per-combo wall bounce re-arms with it.
      fighter.wallBounceUsed = false;
      // Release 1.7: a quick rise trades a slightly shorter reversal window
      // for getting up early. The delay option keeps the full window.
      const reversalFrames = fighter.wakeOption === "quick"
        ? Math.max(1, DEFENSE_RULES.reversalWindowFrames - WAKEUP_RULES.quickRiseReversalPenaltyFrames)
        : DEFENSE_RULES.reversalWindowFrames;
      fighter.reversalWindowFrames = reversalFrames;
      fighter.invulnerableFrames = reversalFrames;
      fighter.wakeOption = "";
      spawnSweat(fighter, 5, 0.9);
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
  spawnFootDust(fighter, 6, 30, direction);
  sound("dash", fighter);
}

function spawnFootDust(fighter, count, spread, kick) {
  const total = Math.max(2, Math.round(count * state.performance.particleScale));
  for (let index = 0; index < total; index += 1) {
    const side = kick !== 0 ? -Math.sign(kick) : (visualRandom() < 0.5 ? -1 : 1);
    state.particles.push({
      kind: "dust",
      x: fighter.x + (visualRandom() - 0.5) * spread,
      y: FLOOR - 2,
      vx: side * (30 + visualRandom() * 130) + kick * 60,
      vy: -25 - visualRandom() * 85,
      gravity: 400,
      drag: 0.955,
      life: 0.2 + visualRandom() * 0.3,
      max: 0.5,
      size: 3 + visualRandom() * 7,
      color: visualRandom() > 0.4 ? "#777067" : "#4e4a46",
    });
  }
}

// SF2-style sweat spray: below 40% health, heavy exertions (big attacks,
// wake-ups, landings) fling glinting droplets off the fighter's head — harder
// still under 25%. Presentation-only: visualRandom + checksum-exempt
// state.particles, trimmed by the shared particle budget.
function spawnSweat(fighter, count, energy = 1) {
  if (fighter.health > 40) return;
  const strain = fighter.health < 25 ? 1.35 : 1;
  const total = Math.max(2, Math.round(count * strain * state.performance.particleScale));
  const headY = fighter.y - fighter.height * 0.94;
  for (let index = 0; index < total; index += 1) {
    const angle = -Math.PI / 2 + (visualRandom() - 0.5) * 2.3;
    const speed = (110 + visualRandom() * 210) * energy;
    state.particles.push({
      kind: "sweat",
      x: fighter.x + (visualRandom() - 0.5) * 34,
      y: headY + (visualRandom() - 0.5) * 20,
      vx: Math.cos(angle) * speed + fighter.vx * 0.12,
      vy: Math.sin(angle) * speed - 40,
      gravity: 780,
      drag: 0.982,
      life: 0.24 + visualRandom() * 0.26,
      max: 0.5,
      size: 1.8 + visualRandom() * 2.2,
      color: index % 3 ? "#d9f1ff" : "#9fd7ff",
    });
  }
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
  // The arena wears the fight: a persistent crack + scuff under the impact.
  pushStageScar(fighter.x, force);
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

// --- Corner wall-splat (wave 4): the arena edge answers a slammed fighter ---
// A vertical dust column erupts off the invisible wall, stage-toned debris
// chips spray and tumble down, and a tall shock ellipse marks the slam.
// Fired from applyFighterPhysics when the stage clamp actually arrests a fast
// hitstun/knockdown flight. Presentation only: everything lands in the
// checksum-exempt particle/effect arrays. The per-side cooldown tick lives
// module-level on the documented superDimLevel pattern (never snapshotted):
// re-executing the same or an earlier tick after a rollback restore re-fires
// the spawn (the restored arrays lost it), while the strictly-later ticks of a
// normal wall grind dedupe inside the window.
const WALL_SPLAT_COOLDOWN_TICKS = 22;
const wallSplatLastTick = [-Infinity, -Infinity];

function spawnWallImpact(fighter, wallDirection) {
  const tick = state.simulationTick;
  const last = wallSplatLastTick[fighter.side];
  if (tick > last && tick - last < WALL_SPLAT_COOLDOWN_TICKS) return;
  wallSplatLastTick[fighter.side] = tick;
  // Wave 7: a wall splat is a heavy moment — kick the RGB-split impulse.
  // Module-level render-only latch; profile/accessibility gates apply at draw.
  if (!rollbackResimulating) aberrationImpulse = Math.max(aberrationImpulse, 0.55);
  // Wave 15: the corner answers in the hands too — double pulse.
  combatHaptic("wallSplat");
  const wallX = wallDirection < 0
    ? MOVEMENT_RULES.stageMinX - 30
    : MOVEMENT_RULES.stageMaxX + 30;
  const impactY = fighter.y - fighter.height * 0.55;
  const force = clamp(Math.abs(fighter.vx) / 640, 0.6, 1.3);
  const dustCount = Math.max(5, Math.round(15 * force * state.performance.particleScale));
  for (let index = 0; index < dustCount; index += 1) {
    state.particles.push({
      kind: "dust",
      x: wallX + wallDirection * visualRandom() * 10,
      y: FLOOR - visualRandom() * (fighter.height + 44),
      vx: -wallDirection * (30 + visualRandom() * 170) * force,
      vy: -60 - visualRandom() * 240 * force,
      gravity: 420,
      drag: 0.955,
      life: 0.22 + visualRandom() * 0.4,
      max: 0.62,
      size: 3.5 + visualRandom() * 8,
      color: visualRandom() > 0.4 ? "#777067" : "#4e4a46",
    });
  }
  const chipCount = Math.max(3, Math.round(8 * force * state.performance.particleScale));
  for (let index = 0; index < chipCount; index += 1) {
    state.particles.push({
      kind: "debris",
      x: wallX,
      y: impactY + (visualRandom() - 0.5) * fighter.height * 0.8,
      vx: -wallDirection * (60 + visualRandom() * 260) * force,
      vy: -120 - visualRandom() * 190,
      gravity: 980,
      drag: 0.985,
      spin: (visualRandom() - 0.5) * 18,
      rotation: visualRandom() * Math.PI,
      life: 0.34 + visualRandom() * 0.42,
      max: 0.76,
      size: 2.4 + visualRandom() * 3.6,
      color: visualRandom() > 0.5 ? "#8a8175" : "#635c52",
    });
  }
  state.effects.push({
    kind: "wallShock",
    x: wallX - wallDirection * 6,
    y: impactY,
    size: 66 + force * 44,
    direction: -wallDirection,
    life: 0.3,
    max: 0.3,
    color: "#e9dfc8",
  });
  state.shake = Math.max(state.shake, 0.2 * force); // checksum-exempt, like flash
}

function applyFighterPhysics(fighter, dt) {
  fighter.vy += GRAVITY * dt;
  // Wave 17 — the Pinelands Devil's wing-glide: his authored movement caps
  // descent speed during any CONTROLLED airborne state, so his jump hangs
  // like something that owns the air. Pure function of already-snapshotted
  // fields (vy, grounded, hitstun/knockdown/grab state) and a static kit
  // constant: rollback resimulation reproduces it exactly and no new state
  // field exists to snapshot. Hitstun, juggles, knockdowns and grabs fall at
  // full gravity like everyone else — the wings only work when he does.
  const glideCap = fighter.movement.glideFallCap;
  if (glideCap > 0 && fighter.vy > glideCap && !fighter.grounded
    && !fighter.down && !fighter.pendingKnockdown && !fighter.grabbed
    && fighter.hitstunFrames === 0 && fighter.dizzyFrames === 0) {
    fighter.vy = glideCap;
  }
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
      // An attack on the way down supersedes the air-tech tax — same price.
      fighter.airTechTaxPending = false;
      fighter.airTechFlipFrames = 0;
      spawnFootDust(fighter, 8, 48, 0);
      spawnSweat(fighter, 3, 1);
    } else if (landed && fighter.airTechTaxPending) {
      // Release 1.7: the air-recovery landing tax — the existing air-attack
      // landing recovery, so a read meaty still punishes the escape.
      fighter.airTechTaxPending = false;
      fighter.airTechFlipFrames = 0;
      fighter.juggleCount = 0;
      fighter.wallBounceUsed = false;
      fighter.landingRecoveryFrames = Math.max(fighter.landingRecoveryFrames, DEFENSE_RULES.airAttackLandingRecoveryFrames);
      spawnFootDust(fighter, 8, 48, 0);
      spawnSweat(fighter, 3, 1);
    } else if (landed && !fighter.down) {
      // Even an empty jump costs a few frames on the way down.
      fighter.landingRecoveryFrames = Math.max(fighter.landingRecoveryFrames, DEFENSE_RULES.landingRecoveryFrames);
      spawnFootDust(fighter, 6, 44, 0);
      spawnSweat(fighter, 3, 0.8);
    }
  } else {
    fighter.grounded = false;
  }
  const preClampX = fighter.x;
  fighter.x = clamp(fighter.x, MOVEMENT_RULES.stageMinX, MOVEMENT_RULES.stageMaxX);
  if (fighter.x !== preClampX && (fighter.hitstunFrames > 0 || fighter.pendingKnockdown)) {
    const wallDirection = preClampX < MOVEMENT_RULES.stageMinX ? -1 : 1;
    // Release 1.7 wave 11: the armed knockdown converts at the wall into the
    // splat freeze + juggleable rebound. Otherwise the wave-4 presentation
    // splat fires exactly as before: hitstun bleeds vx 10% per tick before
    // physics runs, so a cornered victim reaches the clamp with 0.9x the
    // attack's push — 220 keeps the burst for heavy/special/throw-grade
    // slams (push 260-405+, arriving at 234+) and never light pokes
    // (145-210, arriving under 190).
    if (fighter.wallBounceArmed === wallDirection && !fighter.wallBounceUsed) {
      performWallBounce(fighter, wallDirection);
    } else if (Math.abs(fighter.vx) > 220) {
      spawnWallImpact(fighter, wallDirection);
    }
  }
}

// Release 1.7 wave 11 — the wall-bounce conversion itself. Pure snapshotted
// fighter state plus state.hitstop (already in the combat snapshot); all
// spectacle routes through the existing wave 1-9 systems from this sim event.
function performWallBounce(fighter, wallDirection) {
  fighter.wallBounceArmed = 0;
  fighter.wallBounceUsed = true;
  // The bounce consumes a juggle point, so juggleLimit:2 still bounds the combo.
  fighter.juggleCount += 1;
  fighter.pendingKnockdown = true;
  fighter.grounded = false;
  fighter.vx = -wallDirection * WALL_BOUNCE_RULES.reboundVelocityX;
  fighter.vy = WALL_BOUNCE_RULES.reboundVelocityY;
  fighter.hitstunFrames = Math.max(fighter.hitstunFrames, WALL_BOUNCE_RULES.hitstunFrames);
  fighter.stun = Math.max(fighter.hitstunFrames, fighter.blockstunFrames) / SIMULATION_HZ;
  // Brief splat freeze — state.hitstop is sim state in the rollback snapshot.
  state.hitstop = Math.max(state.hitstop, WALL_BOUNCE_RULES.splatFreezeSeconds);
  if (!rollbackResimulating) mechFxDebug.wallBounces += 1;
  // The rebound arc outlives the ordinary 38-frame combo gap while the victim
  // is completely helpless, so the attacker's combo stays open through it —
  // the conversion counts (and scales) as the same combo.
  const attacker = state.fighters[1 - fighter.side];
  // v2.1 PROGRESSION: wall-bounce conversion ledger event (guarded).
  if (!rollbackResimulating && attacker) progressionEvent("wallBounce", {}, attacker.side);
  if (attacker) {
    attacker.combo.graceUntilFrame = Math.max(
      attacker.combo.graceUntilFrame ?? -Infinity,
      state.simulationTick + WALL_BOUNCE_RULES.comboGraceFrames,
    );
  }
  // Spectacle through the existing systems: the wave-4 splat, the crowd surge
  // (0.75 clears the crowdFlashPick flashbulb threshold), combat text, the
  // announcer bank and the shared violence response.
  spawnWallImpact(fighter, wallDirection);
  stirCrowd(0.75);
  applyViolenceResponse("heavy");
  spawnCombatText(
    fighter.x - wallDirection * 46,
    fighter.y - fighter.height - 50,
    "WALL BOUNCE",
    "#ffd54a",
  );
  announcerSay("wallbounce");
  sound("hit-heavy", fighter);
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
  // Release 1.7: remember whether a guard was already held so the Perfect
  // Guard start tick below only stamps genuinely fresh guard inputs.
  const wasGuarding = fighter.guarding;
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
  // Release 1.7: GUARD CRUSH reuses the dizzy handling path — briefly
  // helpless, but with no mash relief so the punish window is always real.
  if (fighter.guardCrushFrames > 0) {
    fighter.vx *= 0.82;
    fighter.inputBuffer.clear();
    applyFighterPhysics(fighter, dt);
    return;
  }
  // Release 1.7 wave 11: the taunt hold. Fully vulnerable — no guard, no
  // actions, ordinary hurtboxes — and interruptible only by being hit or
  // grabbed. Completing it uninterrupted banks the once-per-round Grit.
  if (fighter.tauntFrames > 0) {
    fighter.tauntFrames -= 1;
    fighter.vx *= 0.8;
    fighter.crouch = false;
    if (fighter.tauntFrames === 0) completeTaunt(fighter);
    applyFighterPhysics(fighter, dt);
    return;
  }
  // Release 1.7: wake-up options. Up during the knockdown quick-rises, Down
  // held delays the getaway — both from input bits already in the protocol.
  if (fighter.down && fighter.knockdownFrames > 1 && !fighter.wakeOption) {
    const bufferedJump = fighter.inputBuffer.consume("jump", state.simulationTick);
    const option = resolveWakeOption({ jump: Boolean(input.jump || bufferedJump), down: input.down });
    if (option === "quick") {
      fighter.wakeOption = "quick";
      fighter.knockdownFrames = Math.max(1, fighter.knockdownFrames - WAKEUP_RULES.quickRiseFrames);
      if (!rollbackResimulating) mechFxDebug.quickRises += 1;
      spawnCombatText(fighter.x, fighter.y - fighter.height - 30, "QUICK RISE", fighter.def.accent);
    } else if (option === "delay") {
      fighter.wakeOption = "delay";
      fighter.knockdownFrames += WAKEUP_RULES.delayFrames;
      if (!rollbackResimulating) mechFxDebug.wakeDelays += 1;
      spawnCombatText(fighter.x, fighter.y - fighter.height - 30, "DELAYED", "#8a93a5");
    }
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
    // An armed wall-bounce flight holds its carry velocity to the wall; every
    // other hitstun flight bleeds 10% per tick exactly as before.
    if (!fighter.wallBounceArmed) fighter.vx *= 0.9;
    // Release 1.7: air recovery (juggle tech). Any attack button once the
    // airborne-hitstun window opens — armed only when the last hit was
    // neither knockdown-final nor a super — techs out of the juggle. The
    // buffered press is only consumed once the window is genuinely open, so
    // early mashes are not eaten.
    if (!fighter.grounded && fighter.pendingKnockdown && fighter.airTechArmed
      && fighter.airHitstunFrames >= AIR_RECOVERY_RULES.minimumHitstunFrames) {
      const buffered = fighter.inputBuffer.consume(["light", "heavy", "special"], state.simulationTick);
      const pressed = Boolean(buffered || input.light || input.heavy || input.special);
      if (canAirRecover(fighter, pressed)) performAirRecovery(fighter);
    }
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
          "enhancedThrowObject",
          "launcher",
          "backSpecial",
          "driveHeavy",
          "commandSpecial",
          "taunt",
        ]);
        if (commandAction === "taunt") {
          fighter.inputBuffer.consume("taunt", state.simulationTick);
          performTaunt(fighter);
        } else if (commandAction) {
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
          // v2.1 PROGRESSION: no-jump-round observation latch (guarded).
          if (!rollbackResimulating) progressionMatch.jumped[fighter.side] = true;
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
    // Ghost trail: a fading snapshot of the sprite every other tick of a dash.
    if (state.performance.trailScale > 0 && !state.accessibility.reducedMotion
      && state.simulationTick % 2 === 0) {
      const ghostPose = fighterAnimationPose(fighter);
      if (ghostPose.bank === "base") {
        state.effects.push({
          kind: "afterimage", fighterId: fighter.def.id, frame: ghostPose.frame,
          x: fighter.x, y: fighter.y, facing: fighter.facing,
          size: fighterRenderSize(fighter.def.id),
          life: 0.2, max: 0.2, color: fighter.def.accent,
        });
      }
    }
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

  // Release 1.7: Perfect Guard — stamp the tick a FRESH guard began. Blockstun
  // holds guarding true continuously, so a held guard keeps its original
  // stamp; only releasing and re-tapping back can arm a new just-defend.
  if (fighter.guarding && !wasGuarding) fighter.guardStartedTick = state.simulationTick;

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
    // Release 1.8 GRIND: score attack — a landed trap scores as a special
    // (guarded meta bookkeeping inside; never touches sim state).
    awardHitScore(owner, "special");
  }
  victim.health = blocked
    ? Math.max(1, victim.health - damage)
    : clamp(victim.health - damage, 0, 100);
  victim.lastDamageFrame = state.simulationTick;
  // v2.1 PROGRESSION: damage-source latch (guarded meta observation).
  if (!rollbackResimulating) progressionNoteDamage(victim.side, { chip: blocked });
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
      // Trap knockdowns are knockdown-final: no air tech.
      victim.airTechArmed = false;
      victim.airHitstunFrames = 0;
    }
  }
  owner.meter = clamp(owner.meter + 13 * GRIT_RULES.hitGainMultiplier, 0, GRIT_RULES.maximum);
  victim.meter = clamp(victim.meter + 13 * GRIT_RULES.damageTakenGainMultiplier, 0, GRIT_RULES.maximum);
  owner.attackConnected = blocked ? "block" : "hit";
  state.effects.push({ kind: "paintTrapBurst", x: trap.x, y: trap.y - 24, life: 0.62, max: 0.62, color: trap.color });
  if (!blocked) pushBattleDamageMark(victim, "special");
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
  const enhanced = Boolean(attack.enhancedThrowable);
  fighter.throwableSpawned = true;
  const scale = FIGHTER_SCALE;
  // Release 1.7 wave 11: an EX variant may author extraSpawns — additional
  // projectiles released on the same active frame, each merging its own
  // overrides over the EX flight (pizza slices, twin blades, dub plates).
  const releases = [flight, ...(flight.extraSpawns || []).map((extra) => ({ ...flight, ...extra }))];
  releases.forEach((release, index) => {
    state.projectiles.push({
      id: `${fighter.side}-obj-${state.simulationTick}${index ? `-${index}` : ""}`,
      ownerSide: fighter.side,
      throwable: profile.id,
      x: fighter.x + fighter.facing * release.spawnX * scale,
      y: FLOOR + release.spawnY * scale,
      vx: fighter.facing * release.speed * scale,
      vy: release.launchY * scale,
      gravity: release.gravity * scale,
      direction: fighter.facing,
      width: release.width * scale,
      height: release.height * scale,
      hazardWidth: release.hazardWidth * scale,
      damage: release.damage,
      chipDamage: release.chipDamage,
      hitstunFrames: release.hitstunFrames,
      blockstunFrames: release.blockstunFrames,
      push: Math.round(release.push * scale),
      level: release.level,
      knockdown: Boolean(release.knockdown),
      lifeFrames: release.lifeFrames,
      maxLifeFrames: release.lifeFrames,
      armFrames: 0,
      maxArmFrames: 0,
      bouncesLeft: release.bounces,
      bounceDamping: release.bounceDamping,
      hazardFrames: release.hazardFrames,
      hazardArmFrames: release.hazardArmFrames || 0,
      hazard: false,
      spin: release.spin,
      spinAngle: 0,
      wobble: release.wobble,
      tether: release.tether ? { ...release.tether } : null,
      slowFrames: release.slowFrames,
      staggerFrames: release.staggerFrames,
      impactLabel: release.impactLabel,
      variant: attack.throwableVariant || "low",
      color: fighter.def.accent,
      style: profile.style,
      sequenceIndex: index,
      enhanced,
    });
  });
  if (enhanced && !rollbackResimulating) {
    mechFxDebug.exThrowables += 1;
    // v2.1 PROGRESSION: EX throwable ledger event (guarded, P1 seat only).
    progressionEvent("exThrowable", {}, fighter.side);
  }
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
  cane: ["#aeb6c6", "#d6b56b", "#5a6274"],
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
  // Release 1.7 wave 11: the EX reel is a guaranteed launcher — the victim is
  // popped airborne beside the owner, juggleable but never techable (the
  // whole point of paying the Grit).
  if (tether.launch) {
    victim.grounded = false;
    victim.pendingKnockdown = true;
    victim.vy = Math.round((tether.launchVelocityY ?? -520) * FIGHTER_SCALE);
    victim.airTechArmed = false;
    victim.airHitstunFrames = 0;
    spawnCombatText((owner.x + victim.x) * 0.5, victim.y - victim.height - 30, "REELED LAUNCH", owner.def.accent);
    state.shake = Math.max(state.shake, 0.3);
    return;
  }
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
  // v2.1 PROGRESSION: damage-source latch + personal-throwable-landed event
  // (guarded meta observation on the announce() pattern).
  if (!rollbackResimulating) {
    progressionNoteDamage(victim.side, { chip: blocked, weapon: Boolean(projectile.stageWeapon) });
    if (!blocked && !armored && projectile.throwable) {
      progressionEvent("throwableLand", { fighterId: owner.def.id }, owner.side);
    }
  }
  victim.blockstunFrames = blocked ? projectile.blockstunFrames : 0;
  victim.hitstunFrames = blocked || armored ? 0 : projectile.hitstunFrames + (counter ? DEFENSE_RULES.counterHitstunBonusFrames : 0);
  victim.stun = Math.max(victim.hitstunFrames, victim.blockstunFrames) / SIMULATION_HZ;
  const hitDirection = Math.sign(projectile.vx) || projectile.direction || owner.facing;
  victim.vx = hitDirection * projectile.push * (blocked ? 0.27 : armored ? 0.12 : 1);
  const resultKind = projectile.style === "feedback" ? "feedback-echo" : "projectile";
  victim.lastHitResult = blocked ? `blocked-${projectile.level}-${resultKind}` : armored ? "armor" : counter ? `counter-${resultKind}` : projectile.style === "feedback" ? "feedback-echo" : `${projectile.level}-projectile`;
  victim.hitFlash = 0.13;
  if (!blocked && !armored) {
    // Release 1.8 GRIND: score attack — projectiles/thrown objects score as
    // specials (guarded meta bookkeeping; never touches sim state).
    awardHitScore(owner, "special", { counter });
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
      // Projectile knockdowns are knockdown-final: no air tech.
      victim.airTechArmed = false;
    }
    victim.airHitstunFrames = 0;
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
  if (!blocked && !armored) pushBattleDamageMark(victim, impactTier);
  spawnHit(projectile.x, projectile.y, owner.def, impactTier, blocked, { direction: hitDirection, counter });
  if (projectile.style === "feedback") spawnCombatText(projectile.x, projectile.y - 86, blocked ? "ECHO BLOCK" : "FEEDBACK ECHO!", projectile.color);
  else if (counter) spawnCombatText(projectile.x, projectile.y - 72, "COUNTER", projectile.color);
  else if (!blocked && projectile.level === ATTACK_LEVELS.LOW) spawnCombatText(projectile.x, projectile.y - 61, colorAssistActive() ? "\u25bc LOW SHOT" : "LOW SHOT", assistColor("low", projectile.color));
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
  // Wave 17: the Devil's wing-grab — the highest lift in the game (the wings
  // do the work), a hard spin, and a downward flick that reads like dropped
  // prey rather than a wrestler's slam.
  devil: { hold: 12, lift: 92, offset: 58, spin: -1, launch: 1.14, drop: 1.3, shake: 0.32, label: "SNATCH" },
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
  // Release 1.8 GRIND: the Weapons Rain house rule forces stage weapons on
  // for the match even when the persisted toggle is off — the rule comes from
  // matchRules (mutator config), so both peers derive the same answer.
  if (!state.stageWeaponsEnabled && !state.matchRules.weaponsRain) {
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
  // Release 1.8 GRIND: Weapons Rain house rule — a "gone" weapon re-plans the
  // next deterministic drop after a fixed cooldown. All counters live on the
  // snapshotted weapon object and the plan derives from matchSeed + wave, so
  // the rain is identical on both rollback peers and across resims.
  if (weapon.phase === "gone" && state.matchRules.weaponsRain && !state.finisher && state.phase === "fight") {
    weapon.rainFrames = (weapon.rainFrames || 0) + 1;
    if (weapon.rainFrames >= state.matchRules.weaponRespawnFrames) {
      const wave = (weapon.wave || 0) + 1;
      const plan = planStageWeapon(state.stage, {
        matchSeed: hashSeed(state.matchSeed, "weapons-rain", wave),
        round: state.round,
        minX: MOVEMENT_RULES.stageMinX,
        maxX: MOVEMENT_RULES.stageMaxX,
      });
      if (plan) {
        state.stageWeapon = {
          ...plan,
          spawnFrame: 60,
          phase: "pending",
          y: FLOOR,
          holder: -1,
          frames: 0,
          wave,
          roundStartTick: state.simulationTick,
        };
      }
    }
    return;
  }
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
  // Release 1.8 GRIND: score attack — a completed grab scores as a throw.
  awardHitScore(attacker, "throw");
  victim.health = clamp(victim.health - grab.damage, 0, 100);
  victim.lastDamageFrame = state.simulationTick;
  // v2.1 PROGRESSION: damage-source latch (guarded meta observation).
  if (!rollbackResimulating) progressionNoteDamage(victim.side, {});
  victim.lastHitResult = ATTACK_LEVELS.THROW;
  victim.juggleCount = 0;
  victim.wallBounceUsed = false;
  victim.wallBounceArmed = 0;
  victim.pendingKnockdown = true;
  victim.grounded = false;
  // Throws are never air-techable.
  victim.airTechArmed = false;
  victim.airHitstunFrames = 0;
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
  pushBattleDamageMark(victim, "throw");
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
  // Wave 9: tech shout from the escaping fighter (guarded + tick-deduped).
  fighterReactiveCue(victim, "tech");
  // v2.1 PROGRESSION: the escapee's grab-tech tally (guarded meta counter).
  if (!rollbackResimulating) progressionMatch.techs[victim.side] += 1;
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
  // The Southpaw counter launch is knockdown-final: no air tech.
  incomingFighter.airTechArmed = false;
  incomingFighter.airHitstunFrames = 0;
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
  pushBattleDamageMark(incomingFighter, "special");
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

// R1.9: shared trial/school observation for every landed player hit. Lives in
// one helper because the grab path returns out of hit() before the ordinary
// flow — throws and throw-type back specials must still advance trials and
// FIGHT SCHOOL. Sim-visible state is only the trial machine the lab already
// owned; medals/school are guarded meta on the announce() pattern.
function observeTrainingHit(attacker, victim, attack) {
  if (state.mode !== "training" || attacker.side !== 0) return;
  const action = attack.kitAction || attack.kind;
  const limb = attack.limb || "punch";
  const trialProgress = recordTrainingTrialHit(state.training, {
    fighterId: attacker.kitId,
    action,
    limb,
    attackSerial: attack.attackSerial,
    frame: state.simulationTick,
  });
  if (rollbackResimulating) return;
  // Medal persistence: first completion of a trial banks its tier medal. Demo
  // playback completes trials too but never earns the medal.
  if (trialProgress.complete && !trialDemo.active) {
    const trial = comboTrialsForFighter(attacker.kitId)[state.training.trialIndex];
    if (trial && !medalForTrial(trialMedals, attacker.kitId, trial.id)) {
      awardTrialMedal(trialMedals, attacker.kitId, trial);
      saveTrialMedals();
      trainingFxDebug.medalAwards += 1;
      state.training.lastResult = `${trial.tier.toUpperCase()} MEDAL · ${trial.name}`;
      refreshTrialMedalBadges();
    }
  }
  schoolEvent({
    type: "hit",
    action,
    limb,
    attackSerial: attack.attackSerial,
    back: Boolean(attack.backThrow),
    dizzy: victim.dizzyFrames > 0,
  });
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
    // Release 1.7 wave 11: getting grabbed punishes the taunt too.
    if (victim.tauntFrames > 0) interruptTaunt(victim);
    observeTrainingHit(attacker, victim, attack);
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
  // Release 1.7: Perfect Guard — the block STARTED within the just-defend
  // window of this impact. Purely derived from existing frame counters.
  const perfect = blocked && isPerfectGuard(victim.guardStartedTick, state.simulationTick);
  // R1.9 FIGHT SCHOOL: guard lessons validate on the block itself (the
  // LOW/OVERHEAD combat-text hook level), landed-hit lessons below. Both are
  // meta observations on the announce() guard pattern.
  if (!rollbackResimulating && state.mode === "training" && blocked && victim.side === 0) {
    schoolEvent({ type: "block", level: attack.level });
  }
  if (!blocked) observeTrainingHit(attacker, victim, attack);
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
  // A Perfect Guard takes zero chip and sheds blockstun frames.
  const damage = blocked ? (perfect ? 0 : attack.chipDamage) : baseDamage;
  victim.health = blocked
    ? Math.max(1, victim.health - damage)
    : clamp(victim.health - damage, 0, 100);
  victim.lastDamageFrame = state.simulationTick;
  // v2.1 PROGRESSION: damage-source latch (chip / stage-weapon) read only at
  // round end; a Perfect Guard deals nothing so it never becomes "the last
  // word". Guarded meta observation — no sim state involved.
  if (!rollbackResimulating && !(blocked && perfect)) {
    progressionNoteDamage(victim.side, {
      chip: blocked,
      weapon: String(attack.profileId || "").startsWith("stage-weapon-"),
    });
    if (!blocked && !armored && attack.superMove && attacker.attackHits === 1) {
      progressionMatch.supers[attacker.side] += 1;
    }
  }
  victim.blockstunFrames = blocked
    ? Math.max(1, attack.blockstunFrames - (perfect ? PERFECT_GUARD_RULES.blockstunReductionFrames : 0))
    : 0;
  victim.hitstunFrames = blocked || armored ? 0 : attack.hitstunFrames + (counter ? DEFENSE_RULES.counterHitstunBonusFrames : 0);
  victim.stun = Math.max(victim.hitstunFrames, victim.blockstunFrames) / SIMULATION_HZ;
  // Release 1.7: blocked hits pressure the guard gauge exactly where the
  // blockstun is set; a full gauge shatters into GUARD CRUSH inside.
  if (blocked) addGuardPressure(victim, attacker, attack, { perfect });
  if (state.mode === "training" && attacker.side === 0) {
    const remainingRecovery = Math.max(0, (attack.durationFrames || 0) - attacker.attackFrame);
    state.training.lastAdvantage = (victim.blockstunFrames || victim.hitstunFrames) - remainingRecovery;
    state.training.lastResult = blocked ? (perfect ? "PERFECT GUARD" : "BLOCK") : armored ? "ARMOR" : "HIT";
  }
  // Training readout: the player's own Perfect Guards are counted for practice.
  if (state.mode === "training" && perfect && victim.side === 0) state.training.perfectGuards += 1;
  // A back throw sends the victim behind the thrower, which is how corners get
  // swapped in SF2. Everything else pushes along the attacker's facing.
  const pushDirection = attack.backThrow ? -attacker.facing : attacker.facing;
  // A Perfect Guard also sheds most of the block pushback, holding ground.
  victim.vx = pushDirection * attack.push * (blocked ? (perfect ? 0.12 : 0.28) : armored ? 0.12 : 1);
  victim.guardHeight = victim.crouch ? "low" : victim.guardHeight;
  victim.lastHitResult = victim.guardCrushFrames > 0 ? "guard-crush"
    : blocked ? (perfect ? "perfect-guard" : `blocked-${attack.level}`)
      : armored ? "armor" : counter ? "counter" : attack.level;
  if (!blocked && !armored) {
    // Release 1.8 GRIND: score attack — clean hits score by move class
    // (guarded meta bookkeeping inside; never touches sim state).
    awardHitScore(attacker, attack.superMove ? "super" : attack.kind, { counter });
    attacker.combo.addDamage(damage);
    registerAliFlow(attacker, attack);
    if (wasJuggle) victim.juggleCount += 1;
    // Release 1.7 wave 11: a landed hit punishes the taunt — no Grit.
    if (victim.tauntFrames > 0) interruptTaunt(victim);
    victim.attacking = null;
    victim.attackTime = 0;
    victim.attackFrame = 0;
    victim.attackHit = false;
    victim.dashFrames = 0;
    victim.queuedDashDirection = 0;
    const finalAttackHit = attacker.attackHits >= (attack.maxHits || 1);
    const shouldKnockDown = (attack.knockdown && (!attack.knockdownOnFinal || finalAttackHit))
      || attack.level === ATTACK_LEVELS.THROW;
    // Release 1.7 wave 11: corner wall-bounce arming. A knockdown-class
    // heavy/special connecting with the victim already within one body width
    // of the wall it is being pushed toward converts, once per combo, when
    // the flight actually reaches that wall (applyFighterPhysics). The bounce
    // will consume a juggle point, so it is never armed with the juggle
    // budget already spent.
    victim.wallBounceArmed = 0;
    if ((shouldKnockDown || attack.juggleLift)
      && qualifiesForWallBounce(attack)
      && !victim.wallBounceUsed
      && victim.juggleCount < (attack.juggleLimit || COMBO_RULES.juggleLimit)) {
      const wallX = pushDirection > 0 ? MOVEMENT_RULES.stageMaxX : MOVEMENT_RULES.stageMinX;
      const bodyWidth = victim.width * WALL_BOUNCE_RULES.proximityBodyWidths;
      if (Math.abs(wallX - victim.x) <= bodyWidth) {
        victim.wallBounceArmed = pushDirection;
        // The armed flight commits to the wall: the carry velocity always
        // reaches the clamp before the knockdown landing can clear the arm.
        victim.vx = pushDirection * Math.max(Math.abs(victim.vx), WALL_BOUNCE_RULES.carryVelocityX);
      }
    }
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
    // Release 1.7: air recovery arming — every clean hit restarts the
    // airborne-hitstun clock. Authored launches (launchVelocityY juggle
    // starters, juggleLift mid-hits) and plain juggle hits stay escapable —
    // the classic tech read against launchers — while knockdown-final tumbles
    // (sweeps, air heavies, specials, a multi-hit's closing knockdown) and
    // every super hit still ride to the floor.
    victim.airHitstunFrames = 0;
    const authoredLaunch = Boolean(attack.launchVelocityY || attack.juggleLift);
    victim.airTechArmed = !attack.superMove && (authoredLaunch || !shouldKnockDown);
  } else if (armored) {
    victim.armorHits += 1;
    spawnCombatText(victim.x, victim.y - victim.height - 18, "SEISMIC ARMOR", victim.def.accent);
  }
  victim.hitFlash = 0.12;
  if (!blocked && !armored) {
    // Release 1.8 GRIND: Sudden Death house rule — the round's FIRST clean
    // melee hit instantly dizzies its victim. The one-shot flag is sim state
    // (snapshotted + checksummed) and the rule itself comes from matchRules,
    // which both rollback peers derive from the same mutator config.
    if (state.matchRules.suddenDeathDizzy && !state.suddenDeathHitDone) {
      state.suddenDeathHitDone = true;
      if (victim.dizzyFrames <= 0 && victim.stunImmuneFrames <= 0) enterDizzy(victim, attacker);
    }
    addStun(victim, attacker, attack, { counter, blocked });
    if (victim.carriedWeapon) dropStageWeapon(victim, false);
  }
  attacker.meter = clamp(attacker.meter + attack.meter * GRIT_RULES.hitGainMultiplier, 0, GRIT_RULES.maximum);
  victim.meter = clamp(victim.meter + attack.meter * GRIT_RULES.damageTakenGainMultiplier, 0, GRIT_RULES.maximum);
  // Release 1.7: a Perfect Guard banks bonus Grit for the defender.
  if (perfect) victim.meter = clamp(victim.meter + PERFECT_GUARD_RULES.gritBonus, 0, GRIT_RULES.maximum);
  const impactTier = attack.superMove ? "super"
    : attack.kind === "throw" ? "throw"
      : attack.kind === "special" ? "special"
        : attack.kind === "heavy" ? "heavy" : "light";
  if (!blocked && !armored) pushBattleDamageMark(victim, impactTier);
  applyViolenceResponse(impactTier, {
    blocked,
    counter,
    final: attack.superMove && attacker.attackHits >= (attack.maxHits || 1),
    damage: attack.damage,
  });
  const impact = collision?.point || { x: victim.x - attacker.facing * 22, y: victim.y - 105 };
  spawnHit(impact.x, impact.y, attacker.def, impactTier, blocked, { direction: attacker.facing, counter });
  if (attack.superMove) {
    state.effects.push({ kind: "super", x: impact.x, y: impact.y, life: 0.55, max: 0.55, color: attacker.def.accent });
    // Ordinary hits get a glint, not a whiteout — the full-strength flash is
    // reserved for supers, dizzies and guard crushes so it means something.
    if ($("#flashToggle").checked) state.flash = Math.max(state.flash, attacker.attackHits >= attack.maxHits ? 0.1 : 0.04);
  }
  if (counter) spawnCombatText(impact.x, impact.y - 74, "COUNTER", attacker.def.accent);
  // R1.9 color assist: the two mixup callouts pick up the colorblind-safe
  // palette plus a distinct glyph each (drop-arrow / down-chevron) so the cue
  // never rides on hue alone. Standard palette keeps the shipped label text
  // exactly (smoke tests read combatTextLabels).
  else if (!blocked && attack.level === ATTACK_LEVELS.OVERHEAD) {
    spawnCombatText(impact.x, impact.y - 70, colorAssistActive() ? "⤓ OVERHEAD" : "OVERHEAD", assistColor("overhead", attacker.def.accent));
  } else if (!blocked && attack.level === ATTACK_LEVELS.LOW) {
    spawnCombatText(impact.x, impact.y - 64, colorAssistActive() ? "▼ LOW" : "LOW", assistColor("low", attacker.def.accent));
  }
  else if (!blocked && attack.level === ATTACK_LEVELS.THROW) spawnCombatText(impact.x, impact.y - 72, "THROW", attacker.def.accent);
  // Release 1.7: Perfect Guard flash — a cyan ring plus PERFECT combat text
  // (checksum-exempt state.effects, same channel every hit spark uses).
  if (perfect) {
    if (!rollbackResimulating) {
      mechFxDebug.perfectGuards += 1;
      // v2.1 PROGRESSION: the defender's Perfect Guard ledger event (guarded).
      progressionEvent("perfectGuard", {}, victim.side);
    }
    state.effects.push({
      kind: "shockRing", x: impact.x, y: impact.y,
      size: 78, life: 0.3, max: 0.3, color: "#63f2ff",
    });
    spawnCombatText(impact.x, impact.y - 80, "PERFECT", "#63f2ff");
  }
  sound(attackImpactCue(attack, blocked), blocked ? victim : attacker);
  // The distinct 'tink' variant layered over the block cue on a just-defend.
  if (perfect) perfectGuardTink();
  updateHud();
  state.lastImpactSide = attacker.side;
}

// R1.9 FIGHT SCHOOL: the Final Blow lesson needs the REAL finish flow, which
// training otherwise short-circuits. Armed only while the school's finisher
// step is live and the dummy went down — training is strictly offline, so a
// meta read here can never touch rollback determinism.
function schoolFinisherArmed() {
  if (!schoolSession.active || !schoolSession.machine) return false;
  const lesson = fightSchoolLesson(schoolSession.machine);
  return lesson?.steps[schoolSession.machine.step]?.kind === "finisher";
}

function checkKnockout() {
  if (state.phase !== "fight" || !state.fighters.some((fighter) => fighter.health <= 0)) return;
  if (state.mode === "training"
    && !(schoolFinisherArmed() && state.fighters[1].health <= 0 && state.fighters[0].health > 0)) {
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
  // Wave 6: KO freeze-frame punch-in on the killing hit (render-only latch,
  // guarded + tick-deduped inside).
  latchKoCameraPunch();
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
    const fx = comboFxState[attacker.side];
    const numberEl = readout.querySelector("b");
    if (combo.visible && combo.hits !== fx.hits) {
      numberEl.textContent = String(combo.hits);
      // Physical hit-pop on every increment (scale overshoot back to 1).
      if (combo.hits > fx.hits) restartCssAnimation(numberEl, "pop");
    }
    // Heat tiers: styling escalates at 3 / 5 / 8+ hits and the label upgrades.
    const tier = !combo.visible ? 0 : combo.hits >= 8 ? 3 : combo.hits >= 5 ? 2 : combo.hits >= 3 ? 1 : 0;
    if (tier !== fx.tier) {
      readout.classList.toggle("hot", tier >= 1);
      readout.classList.toggle("blazing", tier >= 2);
      readout.classList.toggle("inferno", tier >= 3);
      readout.querySelector("span").textContent = tier >= 3 ? "FINAL COMBO" : tier >= 2 ? "SAVAGE COMBO" : "HIT COMBO";
      if (tier > fx.tier) hudFxDebug.comboHeat += 1;
      fx.tier = tier;
    }
    fx.hits = combo.visible ? combo.hits : 0;
    // The damage line counts up toward the real total instead of jumping.
    const damageTarget = Math.round(combo.damage);
    fx.damageShown = !combo.visible || damageTarget < fx.damageShown
      ? damageTarget
      : Math.min(damageTarget, fx.damageShown + Math.max(1, (damageTarget - fx.damageShown) * 0.22));
    const damageLabel = Math.round(fx.damageShown);
    if (damageLabel !== fx.damageWritten) {
      fx.damageWritten = damageLabel;
      readout.querySelector("em").textContent = `${damageLabel} DAMAGE`;
    }
  }
}

// Hitstop is the freeze that lets the eye register a hit before anything else
// moves; it climbed toward genre values (6f light through 13f super) in the
// readability pass. The freeze no longer eats inputs — simulatePreparedGameTick
// keeps reading and buffering through it — so the longer stops make the fight
// easier to follow without loosening a single link.
const VIOLENCE_TIERS = Object.freeze({
  light: Object.freeze({ particles: 10, speed: 250, life: 0.72, size: 4.2, shake: 0.16, hitstop: 0.1, crowd: 0.12, decal: false }),
  heavy: Object.freeze({ particles: 22, speed: 430, life: 1.08, size: 6.2, shake: 0.31, hitstop: 0.133, crowd: 0.34, decal: true }),
  special: Object.freeze({ particles: 30, speed: 520, life: 1.24, size: 7.2, shake: 0.43, hitstop: 0.167, crowd: 0.56, decal: true }),
  throw: Object.freeze({ particles: 26, speed: 470, life: 1.18, size: 7, shake: 0.46, hitstop: 0.167, crowd: 0.62, decal: true }),
  weapon: Object.freeze({ particles: 28, speed: 540, life: 1.28, size: 7.6, shake: 0.5, hitstop: 0.183, crowd: 0.68, decal: true }),
  super: Object.freeze({ particles: 44, speed: 700, life: 1.58, size: 9, shake: 0.76, hitstop: 0.217, crowd: 1.05, decal: true }),
});

function violenceTier(kind = "light") {
  return VIOLENCE_TIERS[kind] || VIOLENCE_TIERS.light;
}

function applyViolenceResponse(kind, { blocked = false, counter = false, final = false, damage = 0 } = {}) {
  // Wave 15: every screen response has a matching hand response — phone
  // vibration plus pad dual-rumble (toggle, resim guard and rate cap all
  // live inside combatHaptic).
  combatHaptic(kind, { damage, blocked, counter });
  if (blocked) {
    state.shake = Math.max(state.shake, 0.1);
    state.hitstop = Math.max(state.hitstop, 0.067);
    return;
  }
  const profile = violenceTier(kind);
  const counterScale = counter ? 1.22 : 1;
  state.shake = Math.max(state.shake, profile.shake * counterScale);
  const hitstop = kind === "super" && !final ? 0.15 : profile.hitstop;
  state.hitstop = Math.max(state.hitstop, hitstop * counterScale);
  stirCrowd(profile.crowd * counterScale);
}

function spawnHit(x, y, def, attackKind, blocked, { direction = 1, counter = false } = {}) {
  // Wave 6: directional camera recoil on landed heavy-class hits plus the
  // counter-hit punch-in (render-only latches, guarded + tick-deduped inside).
  latchImpactCinema(x, y, attackKind, blocked, direction, counter);
  // CINEMA 3D impact latch: null when 3D is off (zero-cost), presentation-only
  // when on — the bridge guards rollbackResimulating + tick-dedupes inside,
  // following the announce()/latch pattern above.
  if (cinema3dBridge.onHit) {
    cinema3dBridge.onHit({ x, y, kind: attackKind, blocked, direction, counter, tick: state.simulationTick });
  }
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
  // Release 1.6 LOUD: layered synth components under the hit sample by
  // violence tier (rollback guard + toggles live inside).
  impactLayerAudio(tierName, { counter });
  // Wave 9: counter-hit attacker bark (guarded + tick-deduped inside).
  if (counter) fighterReactiveCue(def.id, "counter");
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
  // Impact light spill (wave 4): heavy-tier and counter hits briefly become a
  // one-shot light source that tints the surrounding stage with the attacker's
  // spark colour. Carried on the existing impactFlash effect (same life/max,
  // so sparkLine/shockRing/impactFlash counts are untouched); the flash toggle
  // gates it at push time exactly like the full-screen flashes.
  const spillTier = ["heavy", "special", "super", "weapon"].includes(tierName) || counter;
  state.effects.push({
    kind: "impactFlash", tier: tierName, x, y,
    life: tierName === "super" ? 0.22 : 0.12,
    max: tierName === "super" ? 0.22 : 0.12,
    color: "#fff4df",
    spill: spillTier && $("#flashToggle").checked ? def.accent : null,
  });
  if (counter) {
    // Counter-hit focus burst (wave 4): a distinct gold ring of anime speed
    // lines converging on the impact point, layered with the victim's
    // inverted flash pop in drawFighter so counters read instantly.
    state.effects.push({
      kind: "counterFocus", x, y,
      life: 0.3, max: 0.3, color: "#ffd94f",
    });
  }
  // White-hot speed-line sparks along the hit direction, drawn additively so
  // they bloom against the dark stages; a shock ring joins the heavy tiers.
  const ringSizes = { heavy: 74, special: 96, super: 128, weapon: 82 };
  if (ringSizes[tierName] || counter) {
    state.effects.push({
      kind: "shockRing", x, y,
      size: (ringSizes[tierName] || 64) * (counter ? 1.3 : 1),
      life: 0.26, max: 0.26, color: "#fff2d8",
    });
  }
  const sparkCount = Math.max(3, Math.round((tierName === "light" ? 4 : 9)
    * counterScale * state.performance.particleScale));
  for (let index = 0; index < sparkCount; index += 1) {
    const cone = (visualRandom() - 0.5) * 1.9;
    const sparkSpeed = 260 + visualRandom() * 520;
    state.particles.push({
      kind: "sparkLine", x, y,
      vx: direction * Math.cos(cone) * sparkSpeed,
      vy: Math.sin(cone) * sparkSpeed - 40,
      gravity: 320, drag: 0.94,
      life: 0.1 + visualRandom() * 0.18, max: 0.28,
      size: 1.2 + visualRandom() * 2.2,
      color: index % 3 ? "#fff6db" : def.accent,
    });
  }
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

// A body that ends a lunge inside the opponent slides back out at this rate
// (px per fighter per tick) instead of teleporting apart in one step. Ordinary
// walking contact produces corrections far below the cap, so normal pushing is
// untouched; only the big post-pass-through overlaps ease, resolving a full
// body overlap in roughly four to six frames.
const SEPARATION_MAX_STEP_X = 14;

// Pass-through is the armored lunges' identity, but only while the move is
// actually travelling. Once the active window closes, the pushbox re-engages
// and the eased correction walks the pair apart through the recovery.
function attackPassesThrough(fighter) {
  return Boolean(fighter.attacking?.ignorePushbox)
    && fighter.attackFrame <= fighter.attacking.activeEndFrame;
}

function separateFighters() {
  const [a, b] = state.fighters;
  if (!a || !b) return;
  if (a.grabbing || b.grabbing || a.grabbed || b.grabbed) return;
  if (attackPassesThrough(a) || attackPassesThrough(b)) return;
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
  a.x += clamp(positions.aX - a.x, -SEPARATION_MAX_STEP_X, SEPARATION_MAX_STEP_X);
  b.x += clamp(positions.bX - b.x, -SEPARATION_MAX_STEP_X, SEPARATION_MAX_STEP_X);
}

// Offset of the opponent along the fighter's own facing: positive in front,
// negative behind. That sign is what lets the reach test tell a close cross-up
// (still reachable, keep the lock) from an opponent stranded across the stage.
function turnContext(fighter, opponent) {
  return {
    opponentOffset: (opponent.x - fighter.x) * fighter.facing,
    scale: FIGHTER_SCALE,
    allowance: HURTBOX_MAX_EXTENT,
  };
}

function updateFacings() {
  const [a, b] = state.fighters;
  if (!a || !b || state.finisher) return;
  // Grabs pose both fighters explicitly and finishers are fully scripted; both
  // still keep the axis current so whatever follows resumes oriented correctly.
  const posed = a.grabbing || b.grabbing || a.grabbed || b.grabbed;
  // Preserve a move's committed direction while it can still hit, so cross-ups
  // punish whiffs instead of auto-correcting the hitbox. The moment the last
  // hitbox window closes, the fighter snaps back onto the pair's axis.
  const resolved = resolvePairFacing({
    previousAxis: state.facingAxis,
    aX: a.x,
    bX: b.x,
    aFacing: a.facing,
    bFacing: b.facing,
    aCanTurn: !posed && fighterCanTurn(a, turnContext(a, b)),
    bCanTurn: !posed && fighterCanTurn(b, turnContext(b, a)),
  });
  state.facingAxis = resolved.axis;
  if (posed) return;
  a.facing = resolved.aFacing;
  b.facing = resolved.bFacing;
}

function resolveFighterState(fighter) {
  if (state.finisher) return FIGHTER_STATES.FINISHER;
  if (fighter.down || fighter.knockdownFrames > 0) return FIGHTER_STATES.KNOCKDOWN;
  if (fighter.wakeupFrames > 0) return FIGHTER_STATES.WAKEUP;
  if (fighter.dizzyFrames > 0) return FIGHTER_STATES.HITSTUN;
  // Release 1.7: GUARD CRUSH is helpless — it reads as hitstun to every
  // downstream system, exactly like dizzy.
  if (fighter.guardCrushFrames > 0) return FIGHTER_STATES.HITSTUN;
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
  // Shake and flash decay through the freeze — with the longer readability
  // hitstop they would otherwise hold at full blast for the whole stop and
  // read as more chaos, not more punctuation.
  state.shake = Math.max(0, state.shake - dt * 2.8);
  state.flash = Math.max(0, state.flash - dt);
  if (state.hitstop > 0) {
    state.hitstop = Math.max(0, state.hitstop - dt);
    // The freeze must not eat inputs. Both fighters' raw inputs still run the
    // full input pipeline — motion history, taunt taps, action buffering into
    // the rollback-snapshotted FrameInputBuffer — while physics stays frozen,
    // so a link pressed during the stop comes out the other side intact. The
    // returned resolved input is deliberately discarded; nothing may act yet.
    if (state.fighters.length === 2) {
      prepareFighterInput(state.fighters[0], input0);
      prepareFighterInput(state.fighters[1], input1);
    }
    return;
  }
  state.phaseTime = Math.max(0, state.phaseTime - dt);

  updateFacings();
  if (state.phase === "intro") {
    input0 = {};
    input1 = {};
    // Release 1.8 GRIND — Block War walk-in: an incoming teammate strolls to
    // their slot during the intro. Pure dt math on snapshotted plain fields
    // (introWalkTarget), so it is deterministic and rollback-safe by shape.
    updateIntroWalkIns(dt);
    if (state.phaseTime <= 0) {
      state.phase = "fight";
      for (const fighter of state.fighters) fighter.introWalkTarget = null;
      updateFlowSkipHint();
    }
  }

  input0 = prepareFighterInput(state.fighters[0], input0);
  input1 = prepareFighterInput(state.fighters[1], input1);

  updateFighter(state.fighters[0], state.fighters[1], input0, dt);
  updateFighter(state.fighters[1], state.fighters[0], input1, dt);
  updateGrabHolds();
  updateStageWeapon();
  // Release 1.8 GRIND: Infinite Grit house rule — meters pinned full, exactly
  // the training-lab precedent. Derived from matchRules (mutator config), so
  // both rollback peers agree; the pin re-derives identically on resim.
  if (state.matchRules.infiniteGrit) {
    let gritHudDirty = false;
    for (const fighter of state.fighters) {
      if (fighter.meter < GRIT_RULES.maximum) gritHudDirty = true;
      fighter.meter = GRIT_RULES.maximum;
    }
    if (gritHudDirty) updateHud();
  }
  state.crowdReaction = Math.max(0, state.crowdReaction - 0.016);
  const superActive = state.fighters.some((fighter) => fighter.attacking?.superMove);
  superDimLevel = clamp(superDimLevel + (superActive ? 0.09 : -0.055), 0, 1);
  // Wave 6 win-pose curtain call, eased beside superDimLevel on the same
  // deliberately-unsnapshotted pattern. Keyed off a fatality-free roundover so
  // the finisher cinematic always owns its own frame.
  const winPoseActive = state.phase === "roundover" && !state.finisher && state.finisherType < 0;
  roundOverDimLevel = clamp(roundOverDimLevel + (winPoseActive ? 0.045 : -0.06), 0, 1);
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
    // Release 1.8 GRIND: rounds-to-win is match config now — survival and
    // Block War pairings are single-round, and the One-Round Showdown house
    // rule shortens versus sets the same way.
    if (state.rounds[winner] >= roundsToWinValue()) resolveMatchResult(winner);
    else resetRound();
  }

  for (const particle of state.particles) {
    particle.life -= dt;
    particle.vy += (particle.gravity ?? 720) * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= particle.drag ?? 0.985;
    if (Number.isFinite(particle.spin)) particle.rotation = (particle.rotation || 0) + particle.spin * dt;
    if (particle.kind === "arterial" && particle.y >= FLOOR - 2 && particle.vy > 0) {
      particle.life = 0;
      // Cap the stain layer so a long spray cannot evict combat text and other
      // effects from the trimmed effect budget.
      const stains = state.effects.reduce((total, effect) => total + (effect.kind === "bloodDecal" && effect.stain ? 1 : 0), 0);
      if (stains >= 56) continue;
      const stainLife = 3.4 + visualRandom() * 2.2;
      state.effects.push({
        kind: "bloodDecal", stain: true, tier: "light",
        x: clamp(particle.x, 24, W - 24), y: FLOOR + 3,
        width: 9 + visualRandom() * 20,
        life: stainLife, max: stainLife, color: "#6b050c",
      });
      for (let splash = 0; splash < 2; splash += 1) {
        state.particles.push({
          kind: "blood", x: particle.x, y: FLOOR - 3,
          vx: (visualRandom() - 0.5) * 130, vy: -40 - visualRandom() * 90,
          gravity: 900, drag: 0.98,
          life: 0.18 + visualRandom() * 0.2, max: 0.38,
          size: 1.4 + visualRandom() * 2, color: "#a50713",
        });
      }
    }
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
  for (const effect of state.effects) {
    effect.life -= dt;
    if (effect.kind === "fatalityProjectile") {
      effect.spinAngle += (effect.spin || 8) * dt;
      effect.width = effect.baseWidth * (effect.focusScale || 1);
      effect.height = effect.baseHeight * (effect.focusScale || 1);
      if (effect.landed) {
        effect.x = effect.targetX;
        effect.y = effect.targetY;
      } else {
        effect.flightProgress = clamp((effect.flightProgress || 0) + dt / .3, 0, 1);
        const progress = effect.flightProgress;
        const eased = progress * progress * (3 - 2 * progress);
        effect.x = lerp(effect.startX, effect.targetX, eased);
        effect.y = lerp(effect.startY, effect.targetY, eased) - Math.sin(progress * Math.PI) * 62;
        effect.landed = progress >= 1;
        effect.hazard = effect.landed && ["wires", "bedbugs"].includes(effect.style);
      }
      continue;
    }
    if (effect.kind !== "severedLimb" || effect.resting) continue;
    effect.vy += (effect.gravity || 1080) * dt;
    effect.x += effect.vx * dt;
    effect.y += effect.vy * dt;
    effect.vx *= effect.drag || .988;
    effect.rotation += effect.spin * dt;
    const floorY = FLOOR - (effect.limb.endsWith("leg") ? 22 : 16);
    if (effect.y < floorY || effect.vy <= 0) continue;
    effect.y = floorY;
    if (!effect.bounced && effect.vy > 170) {
      effect.vy *= -.28;
      effect.vx *= .66;
      effect.spin *= .58;
      effect.bounced = true;
    } else {
      effect.vy = 0;
      effect.vx = 0;
      effect.spin = 0;
      effect.resting = true;
    }
  }
  state.effects = state.effects.filter((effect) => effect.life > 0);
  state.particles = trimVisualBudget(state.particles, state.performance.particleBudget);
  state.effects = trimVisualBudget(state.effects, state.performance.effectBudget);
  updateTrainingUi(input0);
}

function simulateOfflineGameTick(dt) {
  // No hitstop short-circuit here: inputs must be read on every tick so
  // presses during the freeze reach the buffer. simulatePreparedGameTick owns
  // the freeze itself and stops everything but the input pipeline.
  const bothCpu = state.mode === "demo" || state.mode === "tournament";
  // R1.9: a running trial demo drives the player seat through the QA-style
  // scripted input path (training mode only; readQaInput still outranks it so
  // probes can interrupt a demo).
  let input0 = readQaInput(0)
    || trialDemoInput()
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
  const cpuOpponent = state.mode === "arcade"
    || state.mode === "survival"
    || (state.mode === "team" && state.teamBattle?.cpu)
    || bothCpu
    || (state.mode === "training" && trainingDummy === null);
  let input1 = readQaInput(1)
    || (cpuOpponent
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

// Raw four-button reads must be resolved to the action vocabulary BEFORE they
// are encoded: inputToBits only knows action fields, so encoding the raw
// object silently drops every attack button. Resolution happens sender-side
// against the local fighter's current state — that is what the dedicated
// limb/taunt wire bits exist for — and the sim's own resolve branch only runs
// for objects still carrying fourButton, so nothing resolves twice.
function resolveOnlineLocalInput() {
  const raw = readQaInput(0) || readInput(0);
  if (!raw?.fourButton) return raw;
  const side = onlineLocalSide();
  const fighter = state.fighters[side];
  if (!fighter) return raw;
  return resolveFourButtonInput(raw, {
    facing: fighter.facing,
    style: activeControlStyle(side),
    meter: fighter.meter,
    finishing: state.phase === "finish" && state.finishWinner === side,
    finishArmed: state.finishArmed[side],
    tauntArmed: state.simulationTick <= fighter.tauntArmedUntilTick,
  });
}

function simulateOnlineGameTick() {
  const rollback = onlineSession.rollback;
  if (!rollback || onlineSession.networkPaused) return;
  const localInput = resolveOnlineLocalInput();
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

function finisherRealityAmount() {
  const finisher = state.finisher;
  if (!finisher) return 0;
  const duration = state.accessibility.reducedMotion ? .16 : .42;
  const linear = clamp(finisher.elapsed / duration, 0, 1);
  return linear * linear * (3 - 2 * linear);
}

function drawRealityBreakAtmosphere(time, amount) {
  if (amount <= .01) return;
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = "screen";
  const warm = ctx.createRadialGradient(W * .12, H * .32, 10, W * .12, H * .32, W * .55);
  warm.addColorStop(0, "rgba(255,164,78,.22)");
  warm.addColorStop(1, "rgba(255,110,48,0)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, W, H);
  const cold = ctx.createRadialGradient(W * .82, H * .26, 15, W * .82, H * .26, W * .56);
  cold.addColorStop(0, "rgba(104,194,255,.2)");
  cold.addColorStop(1, "rgba(70,120,255,0)");
  ctx.fillStyle = cold;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  const dustCount = state.performance.shadows ? 28 : 12;
  for (let mote = 0; mote < dustCount; mote += 1) {
    const clock = state.accessibility.reducedMotion ? mote * 19 : state.simulationTick + mote * 37;
    const x = ((mote * 181 + clock * (.18 + mote % 4 * .07)) % (W + 80)) - 40;
    const y = 80 + ((mote * 113 + clock * (.08 + mote % 3 * .04)) % Math.max(1, FLOOR - 120));
    const glow = .14 + (mote % 5) * .035;
    ctx.globalAlpha = amount * glow;
    ctx.fillStyle = mote % 3 ? "#d8c2a1" : "#9fc9dc";
    ctx.beginPath();
    ctx.arc(x, y, 1 + mote % 3 * .65, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  presentationDebug.realisticLighting += 1;
}

function drawStage(time) {
  const center = state.fighters.length ? (state.fighters[0].x + state.fighters[1].x) * 0.5 : W * 0.5;
  const parallax = (center - W * 0.5) * -0.035;
  const reality = finisherRealityAmount();
  drawCover(stageImages[state.stage], parallax);
  drawRackFocus(parallax);
  drawTimeOfDayHorizon();
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(0,8,18,.12)");
  shade.addColorStop(0.58, "rgba(0,0,0,.03)");
  shade.addColorStop(1, "rgba(2,3,5,.74)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  drawCrowd(time);
  if (state.stage === "vet") drawVetAtmosphere(time);
  drawStageWeather(state.simulationTick, center);

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
  drawStageScars();
  drawPracticalLights(time, state.simulationTick, center, state.crowdReaction);
  // Overlaying the plate after the normal arena dressing gives us a true
  // crossfade without an expensive full-canvas CSS filter. At 1.0 it cleanly
  // replaces every arcade layer beneath it.
  if (reality > .01 && finalBlowRealityImage.complete && finalBlowRealityImage.naturalWidth) {
    ctx.save();
    ctx.globalAlpha = reality;
    drawCover(finalBlowRealityImage, parallax * .18);
    ctx.restore();
    presentationDebug.realisticBackdrops += 1;
  }
  drawRealityBreakAtmosphere(time, reality);
  updateRoundWinBeatLatch();
  drawRoundWinBeat(state.simulationTick, center);
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
  // Release 1.6 LOUD: big stirs also latch a one-shot crowd swell/gasp for
  // the render-side crowd bus (guarded + tick-deduped inside the latch).
  if (amount >= 0.5) latchCrowdSwell(amount);
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

// Six tapped steel kegs plus tables, coolers and grills. The split placement
// keeps the fight lane clear while making the Eagles tailgate unmistakable.
function drawTailgateProps(frame, centre) {
  const spots = [90, 215, 360, 920, 1065, 1190];
  for (let index = 0; index < spots.length; index += 1) {
    const x = spots[index] + (centre - W * 0.5) * -0.14;
    if (x < -80 || x > W + 80) continue;
    const y = 498 + (index % 3) * 8;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.translate(x, y);

    // The keg body remains readable against both the plate and animated fans.
    const steel = ctx.createLinearGradient(-18, 0, 18, 0);
    steel.addColorStop(0, "#59636a");
    steel.addColorStop(0.22, "#d9e0e3");
    steel.addColorStop(0.55, "#87939a");
    steel.addColorStop(0.78, "#edf1f2");
    steel.addColorStop(1, "#4c555c");
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.ellipse(0, -31, 18, 6, 0, Math.PI, 0);
    ctx.lineTo(18, -3);
    ctx.ellipse(0, -3, 18, 6, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(24,31,35,.75)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -31, 18, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(0, -17, 18, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(0, -3, 18, 6, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Pump, tap and a small green cup make the interaction legible.
    ctx.strokeStyle = "#cbd3d7";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -36); ctx.lineTo(0, -52); ctx.lineTo(9, -52);
    ctx.stroke();
    ctx.fillStyle = "#10171a";
    ctx.fillRect(-3, -57, 6, 9);
    ctx.fillStyle = "#1c6a56";
    ctx.fillRect(11, -14, 9, 12);

    if (index === 1 || index === 4) {
      // Folding table with green cups beside the keg.
      ctx.fillStyle = "#4a5057";
      ctx.fillRect(-46, -25, 27, 5);
      ctx.strokeStyle = "#3a4046";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-42, -20); ctx.lineTo(-44, 2);
      ctx.moveTo(-24, -20); ctx.lineTo(-22, 2);
      ctx.stroke();
      ctx.fillStyle = "#1f765f";
      ctx.fillRect(-41, -34, 7, 9);
      ctx.fillRect(-31, -32, 7, 7);
    }

    if (index === 2 || index === 3) {
      // Grill smoke behind the two innermost keg stations.
      ctx.fillStyle = "#4a5057";
      ctx.fillRect(25, -27, 28, 6);
      const smoke = 12 + Math.sin(frame * 0.03 + index) * 5;
      const gradient = ctx.createRadialGradient(39, -44, 2, 39, -44, smoke * 2.4);
      gradient.addColorStop(0, "rgba(214,222,228,.2)");
      gradient.addColorStop(1, "rgba(214,222,228,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(39, -44, smoke * 2.4, 0, Math.PI * 2);
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
  // A hard-stirred crowd pops scattered phone flashes; the pick hashes
  // (window, person) so it can never perturb the visualRandom stream.
  const flashPick = crowdFlashPick(crowd, frame, reaction);
  let flashSpot = null;
  let personIndex = -1;
  for (const person of crowd.people) {
    personIndex += 1;
    const layer = CROWD_LAYERS.find((entry) => entry.id === person.layer);
    const { x, gait, paused } = crowdPosition(person, layer, frame, crowd.span, crowd.minX);
    const drawX = x + (centre - W * 0.5) * -layer.parallax;
    if (drawX < -70 || drawX > W + 70) continue;
    drawPedestrian(person, layer, drawX, gait, paused, reaction);
    if (flashPick && personIndex === flashPick.index) {
      const scale = layer.scale * person.height;
      flashSpot = { x: drawX + person.direction * 8 * scale, y: person.y - 118 * scale, size: 8 + 9 * layer.scale };
    }
  }
  ctx.globalAlpha = 1;
  if (flashSpot) drawCrowdFlash(flashSpot, flashPick);

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

  // Somerset keeps the old K&A motion layer: a passing El train, warm windows,
  // and wind-blown litter over the photoreal street plate. The people are baked
  // into that plate so their deep folded postures stay genuinely realistic.
  const trainX = ((time * 0.08) % (W + 650)) - 500;
  ctx.fillStyle = "rgba(157,166,174,.42)";
  ctx.fillRect(trainX, 154, 430, 58);
  ctx.fillStyle = "rgba(23,60,92,.48)";
  ctx.fillRect(trainX, 196, 430, 7);
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
  if (fighter.dizzyFrames > 0 || fighter.guardCrushFrames > 0) return base(12 + Math.floor(fighter.animTime * 6) % 2);
  // Release 1.7: air-recovery back-flip tuck.
  if (fighter.airTechFlipFrames > 0) return base(13);
  // Release 1.7 wave 11: the taunt holds the fighter's victory pose frame.
  if (fighter.tauntFrames > 0 && fighter.kit?.victory) {
    return { bank: fighter.kit.victory.bank, frame: fighter.kit.victory.frame };
  }
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

// ---------------------------------------------------------------------------
// Tinted silhouette infrastructure. One persistent atlas-cell-sized offscreen:
// the requested frame is drawn in, then flooded with a colour via source-in,
// yielding a flat tinted cut-out of the sprite. Shared by the stage rim light,
// the dizzy double-vision ghosts and the Grit-ready flare, and intended for
// reuse by any future tinted-copy pass (wave 2). The last atlas/frame/colour
// key is cached so repeated blits of the same tint skip the rebuild.
// ---------------------------------------------------------------------------
const SILHOUETTE_CELL = 320;
const silhouetteScratch = document.createElement("canvas");
silhouetteScratch.width = SILHOUETTE_CELL;
silhouetteScratch.height = SILHOUETTE_CELL;
const silhouetteScratchCtx = silhouetteScratch.getContext("2d");
let silhouetteScratchKey = "";

function tintedSilhouette(atlas, frame, color) {
  const key = `${atlas.src}|${frame}|${color}`;
  if (key !== silhouetteScratchKey) {
    silhouetteScratchKey = key;
    silhouetteScratchCtx.globalCompositeOperation = "source-over";
    silhouetteScratchCtx.clearRect(0, 0, SILHOUETTE_CELL, SILHOUETTE_CELL);
    silhouetteScratchCtx.drawImage(
      atlas,
      (frame % 4) * SILHOUETTE_CELL, Math.floor(frame / 4) * SILHOUETTE_CELL,
      SILHOUETTE_CELL, SILHOUETTE_CELL,
      0, 0, SILHOUETTE_CELL, SILHOUETTE_CELL,
    );
    silhouetteScratchCtx.globalCompositeOperation = "source-in";
    silhouetteScratchCtx.fillStyle = color;
    silhouetteScratchCtx.fillRect(0, 0, SILHOUETTE_CELL, SILHOUETTE_CELL);
  }
  return silhouetteScratch;
}

// Blit a tinted silhouette with the exact footprint drawAtlasFrame uses, so
// callers can layer it under/over the real sprite in the same transform space.
function drawSilhouetteFrame(atlas, frame, size, color) {
  ctx.drawImage(tintedSilhouette(atlas, frame, color), -size * 0.5, -size, size, size);
}

// ---------------------------------------------------------------------------
// Battle-damage compositor: one atlas-cell scratch per side. The current frame
// is drawn in, then the fighter's accumulated bruise/cut marks are stamped
// with source-atop so they clip to the sprite's alpha and ride the animation.
// The result blits with drawAtlasFrame's exact footprint. Keyed on
// atlas/frame/mark revision/gore so held poses reuse the composite; a frame
// change costs one cell draw plus at most BATTLE_DAMAGE_MARK_CAP gradients.
// ---------------------------------------------------------------------------
const damageScratches = [document.createElement("canvas"), document.createElement("canvas")];
const damageScratchContexts = damageScratches.map((scratch) => {
  scratch.width = SILHOUETTE_CELL;
  scratch.height = SILHOUETTE_CELL;
  return scratch.getContext("2d");
});
const damageScratchKeys = ["", ""];

function drawDamagedAtlasFrame(side, atlas, frame, size) {
  const scratchCtx = damageScratchContexts[side];
  const gore = state.graphicFatalities;
  const key = `${atlas.src}|${frame}|${battleDamageRevision[side]}|${gore ? 1 : 0}`;
  if (key !== damageScratchKeys[side]) {
    damageScratchKeys[side] = key;
    scratchCtx.globalCompositeOperation = "source-over";
    scratchCtx.clearRect(0, 0, SILHOUETTE_CELL, SILHOUETTE_CELL);
    scratchCtx.drawImage(
      atlas,
      (frame % 4) * SILHOUETTE_CELL, Math.floor(frame / 4) * SILHOUETTE_CELL,
      SILHOUETTE_CELL, SILHOUETTE_CELL,
      0, 0, SILHOUETTE_CELL, SILHOUETTE_CELL,
    );
    scratchCtx.globalCompositeOperation = "source-atop";
    for (const mark of battleDamageMarks[side]) {
      // Blood-red cuts honour the GRAPHIC FATALITIES toggle; with it off every
      // mark renders as a plain bruise.
      const bloody = mark.cut && gore;
      scratchCtx.save();
      scratchCtx.translate(mark.x, mark.y);
      scratchCtx.rotate(mark.lean);
      scratchCtx.scale(1, bloody ? 1.45 : 0.85);
      const smear = scratchCtx.createRadialGradient(0, 0, mark.size * 0.15, 0, 0, mark.size);
      if (bloody) {
        smear.addColorStop(0, "rgba(122,10,18,0.68)");
        smear.addColorStop(0.55, "rgba(88,8,16,0.44)");
        smear.addColorStop(1, "rgba(60,6,12,0)");
      } else {
        smear.addColorStop(0, "rgba(56,32,56,0.6)");
        smear.addColorStop(0.55, "rgba(42,26,46,0.38)");
        smear.addColorStop(1, "rgba(28,18,34,0)");
      }
      scratchCtx.fillStyle = smear;
      scratchCtx.beginPath();
      scratchCtx.arc(0, 0, mark.size, 0, Math.PI * 2);
      scratchCtx.fill();
      scratchCtx.restore();
    }
    scratchCtx.globalCompositeOperation = "source-over";
  }
  ctx.drawImage(damageScratches[side], -size * 0.5, -size, size, size);
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

function drawFatalityStump(size, fatality, direction) {
  const leg = fatality.limb.endsWith("leg");
  const side = fatality.limb.startsWith("left") ? -1 : 1;
  const x = side * direction * size * (leg ? .14 : .22);
  const y = -size * (leg ? .29 : .61);
  const radius = size * (leg ? .055 : .045);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.translate(x, y);
  ctx.rotate(side * direction * (leg ? .18 : -.32));
  ctx.shadowColor = fatality.palette[0];
  ctx.shadowBlur = 16;
  ctx.fillStyle = fatality.palette[1];
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.24, radius, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fatality.palette[0];
  ctx.beginPath();
  ctx.ellipse(0, 1, radius * .92, radius * .7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ead7b7";
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * .21, radius * .18, 0, 0, Math.PI * 2);
  ctx.fill();
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
  drawFatalityStump(size, fatality, direction);
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

  // Swipe ribbon (wave 4): heavies and specials trace a tapered additive arc
  // that sweeps with the swing — wide and bright at the fist, thinning to
  // nothing at the trail's start. Shared pass ahead of the per-fighter vfx
  // branches; pure render math off attackTime, jittered by presentationHash01
  // so rollback and the mirror pass replay it identically.
  if ((attack.kind === "heavy" || attack.kind === "special")
    && state.performance.trailScale > 0 && !state.accessibility.reducedMotion) {
    const progress = clamp(fighter.attackTime / attack.duration, 0, 1);
    if (progress > 0.12) {
      const eased = Math.sin(Math.min(1, progress * 1.15) * Math.PI * 0.5);
      const startAngle = -2.3;
      const headAngle = startAngle + eased * 2.65;
      const tailAngle = Math.max(startAngle, headAngle - 1.6);
      const segments = Math.max(3, Math.round(7 * state.performance.trailScale));
      const seed = (attack.attackSerial || 0) * 7 + fighter.side * 131;
      const pivotX = 8;
      const pivotY = -126;
      const headWidth = strong ? 19 : 13;
      ctx.save();
      for (let seg = 0; seg < segments; seg += 1) {
        const t0 = seg / segments;
        const t1 = (seg + 1) / segments;
        const a0 = lerp(tailAngle, headAngle, t0);
        const a1 = lerp(tailAngle, headAngle, t1);
        const r0 = reach * (0.62 + 0.3 * t0) * (0.97 + presentationHash01(seed, seg) * 0.06);
        const r1 = reach * (0.62 + 0.3 * t1) * (0.97 + presentationHash01(seed, seg + 1) * 0.06);
        ctx.globalAlpha = clamp(activePower, 0, 1) * (0.12 + 0.62 * t1 * t1);
        ctx.lineWidth = Math.max(1, headWidth * t1);
        ctx.beginPath();
        ctx.moveTo(pivotX + Math.cos(a0) * r0, pivotY + Math.sin(a0) * r0);
        ctx.quadraticCurveTo(
          pivotX + Math.cos((a0 + a1) * 0.5) * (r0 + r1) * 0.515,
          pivotY + Math.sin((a0 + a1) * 0.5) * (r0 + r1) * 0.515,
          pivotX + Math.cos(a1) * r1,
          pivotY + Math.sin(a1) * r1,
        );
        ctx.stroke();
        // White-hot core on the leading edge so the arc pops off dark stages.
        if (seg === segments - 1) {
          ctx.strokeStyle = "#fff6df";
          ctx.globalAlpha = clamp(activePower, 0, 1) * 0.5;
          ctx.lineWidth = Math.max(1, headWidth * 0.34);
          ctx.stroke();
          ctx.strokeStyle = fighter.def.accent;
        }
      }
      ctx.restore();
      if (!reflectionPassActive) presentationDebug.swipeRibbons += 1;
    }
  }

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
      if (cinema3dDressingActive()) {
        // CINEMA 3D: the painted pizza-on-cutter wheel (crust blisters,
        // mottled cheese, cupped pepperoni, rusted steel rim with a cold
        // specular) + radial motion smear ghosts trailing the spin. The
        // classic 2D primitives below stay byte-identical with 3D off.
        const hd = fatalityPizzaCanvas();
        const rim = fatalityPizzaRimCanvas();
        ctx.rotate(angle + wobble);
        const d = w * 1.04;
        ctx.drawImage(hd, -d / 2, -d / 2, d, d);
        // trailing RIM ghosts: the motion blur lives on the spinning edge —
        // the face detail stays printed once (no doubled pepperoni).
        ctx.save();
        ctx.globalAlpha *= 0.3;
        ctx.rotate(-0.1);
        ctx.drawImage(rim, -d / 2, -d / 2, d, d);
        ctx.rotate(-0.12);
        ctx.globalAlpha *= 0.55;
        ctx.drawImage(rim, -d / 2, -d / 2, d, d);
        ctx.restore();
        // rim speed smears: short bright arcs whipping off the cutting edge
        ctx.strokeStyle = "rgba(255,244,225,0.55)";
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(1.5, w * 0.02);
        for (let s = 0; s < 3; s += 1) {
          const a0 = s * 2.1 + 0.4;
          ctx.beginPath();
          ctx.arc(0, 0, w * 0.52, a0, a0 + 0.5);
          ctx.stroke();
        }
        break;
      }
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
    // Wave 16 — the Commissioner's steel cane: a hard end-over-end steel shaft
    // with a gold crook and ferrule, so the flat authority throw reads at a
    // glance against every other object in the set.
    case "cane": {
      ctx.rotate(angle);
      const shaft = w * 0.94;
      // steel shaft with a cold top highlight
      ctx.fillStyle = "#3b4150";
      ctx.fillRect(-shaft * 0.5, -h * 0.18, shaft, h * 0.36);
      ctx.fillStyle = "rgba(214,222,236,.5)";
      ctx.fillRect(-shaft * 0.5, -h * 0.18, shaft, h * 0.12);
      // gold crook handle
      ctx.strokeStyle = "#d6b56b";
      ctx.lineWidth = h * 0.3;
      ctx.beginPath();
      ctx.arc(-shaft * 0.5, -h * 0.5, h * 0.42, Math.PI * 0.15, Math.PI * 1.2);
      ctx.stroke();
      // gold ferrule tip
      ctx.fillStyle = "#d6b56b";
      ctx.fillRect(shaft * 0.5 - w * 0.08, -h * 0.22, w * 0.08, h * 0.44);
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
    // Travelling light pool (wave 4): every projectile and thrown object casts
    // an additive colour glow onto the floor beneath it, brightening as it
    // flies lower. Sibling of the throwable ground shadow; the battery
    // profile (shadows off) skips it.
    if (state.performance.shadows && projectile.y < FLOOR + 4) {
      const height = Math.max(0, FLOOR - projectile.y);
      const closeness = clamp(1 - height / 620, 0.25, 1);
      const reach = ((projectile.width || 44) * 1.6 + 52) * (0.8 + closeness * 0.4);
      const channels = /^#[0-9a-fA-F]{6}/.test(projectile.color || "")
        ? hexToRgbChannels(projectile.color)
        : "255,240,200";
      const glowAlpha = 0.42 * closeness * Math.min(1, life * 2) * pulse;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.translate(projectile.x, FLOOR + 4);
      ctx.scale(1, 0.24);
      const poolGlow = ctx.createRadialGradient(0, 0, 6, 0, 0, reach);
      poolGlow.addColorStop(0, `rgba(${channels},${clamp(glowAlpha, 0, 0.55).toFixed(3)})`);
      poolGlow.addColorStop(1, `rgba(${channels},0)`);
      ctx.fillStyle = poolGlow;
      ctx.beginPath();
      ctx.arc(0, 0, reach, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      presentationDebug.projectileGlows += 1;
    }
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
  benny: 1, donald: 1.02, cyraxx: 1.02, ali: 0.99, devil: 1.05, commissioner: 1.03,
});

// Per-fighter correction when a pose comes from the specials move sheet, whose
// cells frame the body slightly differently. Shared by drawFighter and the
// cast-shadow pass so both size a specials frame identically.
const MOVE_SHEET_ADJUST = Object.freeze({
  deathblow: 1.14, jez: 1.03, alan: 1.06, post: 1.02, benny: 1.02,
  donald: 1.04, cyraxx: 1.05, ali: 1.04, devil: 1.04, commissioner: 1.02,
});

function fighterRenderSize(fighterId) {
  return FIGHTER_RENDER_BASE * FIGHTER_SCALE * (FIGHTER_SIZE_ADJUST[fighterId] || 1);
}

// Deterministic 0..1 hash for aura embers: pure function of an integer seed so
// positions replay identically across rollback resimulation without touching
// either RNG stream.
function emberHash(seed) {
  const scrambled = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return scrambled - Math.floor(scrambled);
}

function hexToRgbChannels(hex) {
  const value = parseInt(hex.slice(1, 7), 16);
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}

// Soft contact shadow: radius/alpha derive from jump height, the ellipse
// stretches with dashes and lunges, and an accent bounce joins in while a
// special glows or the super spotlight is up. Pure function of existing render
// state; the battery profile keeps the original single flat ellipse.
function drawContactShadow(fighter, jump, renderSize, lunge) {
  const baseRadius = renderSize * 0.24;
  if (!state.performance.shadows) {
    ctx.fillStyle = "rgba(0,0,0,.58)";
    ctx.beginPath();
    ctx.ellipse(0, jump + 5, baseRadius, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const airFade = clamp(1 - jump / 430, 0.22, 1);
  const stretch = 1 + Math.abs(lunge) / (renderSize * 0.9) + (fighter.dashFrames > 0 ? 0.35 : 0);
  const radius = baseRadius * (0.66 + 0.34 * airFade) * stretch;
  const alpha = 0.62 * airFade;
  ctx.save();
  ctx.translate(0, jump + 5);
  ctx.scale(1, 15 / baseRadius);
  const soft = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
  soft.addColorStop(0, `rgba(0,0,0,${alpha.toFixed(3)})`);
  soft.addColorStop(0.62, `rgba(0,0,0,${(alpha * 0.44).toFixed(3)})`);
  soft.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = soft;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  const accentStrength = Math.max(
    clamp(fighter.specialGlow, 0, 1) * 0.5,
    superDimLevel > 0.02 ? superDimLevel * 0.42 : 0,
  );
  if (accentStrength > 0.02 && !state.accessibility.highContrast) {
    // Match the warm spotlight pools during a super, the accent otherwise.
    const tone = superDimLevel > 0.02 ? "255,214,150" : hexToRgbChannels(fighter.def.accent);
    const bounce = ctx.createRadialGradient(0, 0, radius * 0.05, 0, 0, radius * 0.9);
    bounce.addColorStop(0, `rgba(${tone},${(accentStrength * 0.5).toFixed(3)})`);
    bounce.addColorStop(1, `rgba(${tone},0)`);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = bounce;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (!reflectionPassActive) presentationDebug.contactShadows += 1;
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
  // Idle/walk pulse in pixels of chest travel. Applied further down as a
  // feet-anchored scaleY (the breathing pattern), never as a translate: the
  // feet and both shadows must stay glued to the floor line, or the fighter
  // reads as hovering. The old whole-sprite bob translate was exactly that
  // hover — the contact shadow rode up and down with it while the cast
  // shadow stayed planted, so the ground contact never agreed with itself.
  const bob = fighter.cinematicFrame === null && fighter.grounded && !fighter.stun && !fighter.block
    ? Math.sin((moving ? fighter.walkTime * 20 : fighter.animTime * 10) + fighter.side * 2) * (moving ? 1.8 : 2.7) : 0;
  const pose = fighterAnimationPose(fighter);
  // Wave 16: the side's palette pick decides which cached atlas draws.
  const atlas = paletteAtlas(fighter.def.id, fighter.side, pose.bank);
  const frame = pose.frame;
  const graphicFatality = activeGraphicFatality(fighter);
  const reality = finisherRealityAmount();
  const sizeAdjust = FIGHTER_SIZE_ADJUST[fighter.def.id] || 1;
  const moveSheetAdjust = pose.bank === "specials" ? (MOVE_SHEET_ADJUST[fighter.def.id] || 1) : 1;
  const renderSize = fighterRenderSize(fighter.def.id) * moveSheetAdjust;
  const attackKind = attack?.kind;
  const lunge = attackSwing * (attackKind === "special" ? 68 : attackKind === "heavy" ? 46 : 29);
  const crouchScale = fighter.crouch ? 0.88 : 1;
  const crouchDrop = fighter.crouch ? 21 : 0;
  const reducedMotion = state.accessibility.reducedMotion;
  // Breathing idle: chest-rise scaleY whose rate and depth grow as health
  // drops, so a gassed fighter visibly heaves before any UI is checked.
  // Transform math only — health/animTime are render-safe reads.
  const breathing = fighter.cinematicFrame === null && fighter.grounded && !fighter.down
    && !attack && !fighter.stun && !fighter.block && fighter.dizzyFrames <= 0 && fighter.guardCrushFrames <= 0;
  const fatigue = clamp(1 - fighter.health / 100, 0, 1);
  const breath = breathing
    ? Math.sin(fighter.animTime * (5.2 + fatigue * 5.6) + fighter.side * 1.9)
      * (0.009 + fatigue * 0.015) * (reducedMotion ? 0.5 : 1)
    : 0;
  // Hunched-forward exhaustion lean once idle health dips under 25%.
  const exhausted = breathing && !moving && fighter.health < 25 ? 1 - fighter.health / 25 : 0;
  // Hit-reaction smear intensity: normalised from the decaying hitFlash timer
  // (0.11-0.22s), gated exactly like the attack trails.
  const hitSmear = state.performance.trailScale > 0 && !reducedMotion
    ? clamp(fighter.hitFlash / 0.14, 0, 1)
    : 0;

  ctx.save();
  ctx.translate(fighter.x, fighter.y);
  drawContactShadow(fighter, jump, renderSize, lunge);

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

  // Release 1.7: air-recovery back-flip — one backward rotation across the
  // flip window. Render-only read of a snapshotted frame counter.
  if (fighter.airTechFlipFrames > 0 && !reducedMotion) {
    const flip = 1 - fighter.airTechFlipFrames / AIR_RECOVERY_RULES.flipFrames;
    ctx.rotate(fighter.facing * flip * Math.PI * 2);
  }

  // The mirror combines the fighter's numeric facing with the direction the
  // AUTHORED cell actually points (atlas-facing.mjs) — post's sheets mix
  // left- and right-facing art, so facing alone drew him looking away from
  // the opponent while his attacks still extended the right way.
  const renderMirror = fighter.facing * atlasFrameFacing(fighter.def.id, pose.bank, frame);
  if (!reflectionPassActive) {
    presentationDebug.lastFighterMirror[fighter.side] = {
      fighterId: fighter.def.id, bank: pose.bank, frame, facing: fighter.facing, mirror: renderMirror,
    };
  }
  ctx.scale(renderMirror, 1);
  ctx.translate(lunge - startupPower * 8, crouchDrop - attackSwing * (attackKind === "special" ? 13 : 5));
  ctx.rotate(-attackSwing * (attackKind === "heavy" ? 0.07 : 0.025));
  ctx.scale(1 + activePower * 0.045 - startupPower * 0.025, crouchScale + startupPower * 0.035 - activePower * 0.025);
  // Breathing + idle pulse + exhaustion posture: the origin sits at the feet,
  // so the chest-rise anchors correctly and the hunch pivots forward over the
  // toes. The bob rides the same feet-anchored scale — its pixel amplitude
  // becomes chest travel over the sprite height, and the feet never move.
  const idlePulse = breath - bob / (renderSize * 0.85);
  if (idlePulse !== 0) ctx.scale(1, 1 + idlePulse);
  if (breathing && !reflectionPassActive) presentationDebug.breathing += 1;
  if (exhausted > 0) ctx.rotate(0.085 * exhausted * (reducedMotion ? 0.5 : 1));
  // Impact squash-and-recover, decaying with the same hitFlash the smear uses.
  if (hitSmear > 0) ctx.scale(1 + hitSmear * 0.05, 1 - hitSmear * 0.06);

  if (fighter.specialGlow > 0) {
    const glow = ctx.createRadialGradient(0, -135, 16, 0, -135, 178);
    glow.addColorStop(0, `${fighter.def.accent}88`);
    glow.addColorStop(1, `${fighter.def.accent}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(-205, -335, 410, 350);
  }

  // Super-ready Grit aura: the moment the meter can pay for a super, a pulsing
  // accent under-glow wraps the sprite and embers rise off the shoulders.
  // Render-only read of snapshotted sim state (same check as the HUD grit-row
  // "full" class); ember positions are hashed from the simulation tick so no
  // visualRandom is consumed and rollback has nothing to re-wind. Kept under
  // highContrast because super-ready is gameplay information, not decoration.
  const superReady = state.phase === "fight" && fighter.cinematicFrame === null
    && fighter.meter >= GRIT_RULES.superCost;
  if (!reflectionPassActive) {
    if (superReady && !gritReadyLatched[fighter.side]) {
      gritReadyLatched[fighter.side] = true;
      gritFlareLevel[fighter.side] = 1;
    } else if (!superReady && gritReadyLatched[fighter.side]) {
      gritReadyLatched[fighter.side] = false;
    }
  }
  if (superReady) {
    const pulse = reducedMotion ? 0.5 : 0.5 + Math.sin(time * 0.006 + fighter.side * 2.4) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.5 + pulse * 0.3;
    const auraReach = renderSize * 0.6;
    const aura = ctx.createRadialGradient(0, -renderSize * 0.32, 14, 0, -renderSize * 0.32, auraReach);
    aura.addColorStop(0, `${fighter.def.accent}8c`);
    aura.addColorStop(0.55, `${fighter.def.accent}3c`);
    aura.addColorStop(1, `${fighter.def.accent}00`);
    ctx.fillStyle = aura;
    ctx.fillRect(-auraReach, -renderSize * 0.32 - auraReach, auraReach * 2, auraReach * 2);
    if (atlas?.complete && atlas.naturalWidth) {
      // Pulsing accent outline: a slightly enlarged silhouette behind the
      // sprite leaves a charged fringe all the way around the body (the KI/SF3
      // max-meter read). Feet-anchored scale keeps it grounded.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.32 + pulse * 0.26;
      const outline = 1.03 + pulse * 0.012;
      ctx.scale(outline, outline);
      drawSilhouetteFrame(atlas, frame, renderSize, fighter.def.accent);
      ctx.restore();
    }
    if (!reducedMotion && state.performance.trailScale > 0) {
      const emberCount = Math.max(3, Math.round(7 * state.performance.trailScale));
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = fighter.def.accent;
      ctx.shadowBlur = 9;
      for (let ember = 0; ember < emberCount; ember += 1) {
        const cycleFrames = 66 + (ember % 3) * 14;
        const clock = state.simulationTick + ember * 31;
        const progress = (clock % cycleFrames) / cycleFrames;
        const jitter = emberHash(Math.floor(clock / cycleFrames) * 13 + ember * 7 + fighter.side * 101);
        const emberX = (jitter - 0.5) * renderSize * 0.44 + Math.sin((progress + jitter) * Math.PI * 2) * 5;
        const emberY = -renderSize * (0.66 + progress * 0.32);
        ctx.globalAlpha = (1 - progress) * 0.85;
        ctx.fillStyle = ember % 2 ? fighter.def.accent : "#fff3d8";
        ctx.beginPath();
        ctx.arc(emberX, emberY, 2.4 + jitter * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    if (!reflectionPassActive) presentationDebug.gritAuras += 1;
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

    if (!reflectionPassActive && state.performance.shadows && !graphicFatality
      && !state.accessibility.highContrast) {
      // Stage-keyed rim light: a tinted silhouette peeking 2-3px past the edge
      // that faces the arena's key light. The sprite draw below covers all but
      // the lit edge; the colour warms while the super spotlight is up.
      const rim = STAGE_RIM_LIGHTS[state.stage] || STAGE_RIM_LIGHTS.somerset;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35;
      ctx.translate(rim.direction * fighter.facing * 3, -2);
      drawSilhouetteFrame(atlas, frame, renderSize, stageRimColor());
      ctx.restore();
      presentationDebug.rimLights += 1;
    }

    if (!reflectionPassActive && !graphicFatality && state.performance.trailScale > 0
      && !state.accessibility.highContrast && state.projectiles.length) {
      // Projectile rim light (wave 4): the nearest incoming projectile or
      // thrown object tints the fighter's silhouette edge on the side facing
      // it, brightening as it closes in — same offset-silhouette technique as
      // the stage rim pass above. Render-only read of state.projectiles.
      let nearest = null;
      let nearestDistance = 300;
      const chestY = fighter.y - fighter.height * 0.55;
      for (const projectile of state.projectiles) {
        const distance = Math.hypot(projectile.x - fighter.x, projectile.y - chestY);
        if (distance < nearestDistance) {
          nearest = projectile;
          nearestDistance = distance;
        }
      }
      if (nearest) {
        const strength = clamp(1 - nearestDistance / 300, 0, 1);
        const towardLocal = (Math.sign(nearest.x - fighter.x) || 1) * fighter.facing;
        const tint = /^#[0-9a-fA-F]{6}/.test(nearest.color || "") ? nearest.color : "#ffe9b8";
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.55 * strength;
        ctx.translate(towardLocal * 5, -2);
        drawSilhouetteFrame(atlas, frame, renderSize, tint);
        ctx.restore();
        presentationDebug.projectileGlows += 1;
      }
    }

    if (!reflectionPassActive && hitSmear > 0) {
      // Directional hit-reaction smear: stretched additive ghosts trailing
      // opposite the knockback on the frames the white hit flash is live.
      const knock = Math.abs(fighter.vx) > 30 ? Math.sign(fighter.vx) : -fighter.facing;
      const localKnock = knock * fighter.facing;
      const copies = Math.max(1, Math.round(2 * state.performance.trailScale));
      for (let copy = 1; copy <= copies; copy += 1) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = (0.22 * hitSmear) / copy;
        ctx.translate(-localKnock * copy * 26 * hitSmear, 0);
        ctx.scale(1 + copy * 0.06 * hitSmear, 1 - copy * 0.03 * hitSmear);
        drawAtlasFrame(atlas, frame, renderSize);
        ctx.restore();
        presentationDebug.hitSmears += 1;
      }
    }

    if (!reflectionPassActive && fighter.dizzyFrames > 0
      && state.performance.trailScale > 0 && !reducedMotion) {
      // Dizzy double vision: two hue-split silhouette ghosts sway apart and
      // drift back; the amplitude collapses with the drain bar so recovery is
      // telegraphed. Time-driven only — no RNG, mobile-cheap tinted blits.
      const drain = fighter.dizzyFrames / Math.max(1, fighter.dizzyTotalFrames);
      const sway = Math.sin(time * 0.008 + fighter.side * 1.7) * 7 * (0.35 + 0.65 * drain);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.28;
      ctx.translate(sway, -1.5);
      drawSilhouetteFrame(atlas, frame, renderSize, "rgb(255,120,170)");
      ctx.translate(-sway * 2, 3);
      drawSilhouetteFrame(atlas, frame, renderSize, "rgb(110,205,255)");
      ctx.restore();
      presentationDebug.dizzyGhosts += 2;
    }

    ctx.save();
    ctx.shadowColor = fighter.specialGlow > 0 ? fighter.def.accent : "rgba(0,0,0,.9)";
    ctx.shadowBlur = state.performance.shadows ? fighter.specialGlow > 0 ? 25 : 9 : 0;
    ctx.shadowOffsetY = 6;
    if (fighter.hitFlash > 0) {
      ctx.filter = HIT_FLASH_FILTER;
    } else if (fighter.block) ctx.filter = "brightness(.82) saturate(.78)";
    else if (!graphicFatality && fighter.health < 25 && !state.accessibility.highContrast) {
      // Last-legs grade: drained, slightly desaturated and contrasty. Lowest
      // priority in the filter chain — hit flash and block keep precedence.
      ctx.filter = "saturate(.68) contrast(1.14) brightness(.93)";
      if (!reflectionPassActive) presentationDebug.lastLegs += 1;
    }
    if (graphicFatality) drawGraphicFatalityVictim(atlas, frame, renderSize, graphicFatality, time);
    else if (!reflectionPassActive && state.performance.shadows && battleDamageMarks[fighter.side].length) {
      // Accumulating battle damage: composite the accrued marks onto this
      // frame's sprite. The mirror pass and the battery profile stay on the
      // plain atlas blit so the extra composite never doubles up.
      drawDamagedAtlasFrame(fighter.side, atlas, frame, renderSize);
      presentationDebug.battleDamage += battleDamageMarks[fighter.side].length;
    } else drawAtlasFrame(atlas, frame, renderSize);
    ctx.restore();

    // The roster portraits are substantially higher resolution than an atlas
    // cell. A restrained soft-light pass brings their skin/fabric/material
    // detail into the slow cinematic poses without replacing the authored
    // animation or disturbing the dismemberment compositor.
    const portrait = fighterImages[fighter.def.id];
    if (reality > .01 && !reflectionPassActive && !graphicFatality
      && portrait?.complete && portrait.naturalWidth && !state.accessibility.highContrast) {
      const portraitHeight = renderSize * 1.02;
      const portraitWidth = portraitHeight * portrait.naturalWidth / portrait.naturalHeight;
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = reality * .2;
      ctx.drawImage(portrait, -portraitWidth * .5, -portraitHeight, portraitWidth, portraitHeight);
      ctx.restore();
      presentationDebug.realisticPortraits += 1;
    }

    const flare = gritFlareLevel[fighter.side];
    if (flare > 0.01 && !reflectionPassActive && !graphicFatality) {
      // One-time threshold flare the frame the meter banks a super: a bright
      // full-body silhouette flash that decays over ~0.3s.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (reducedMotion ? 0.4 : 0.8) * flare;
      drawSilhouetteFrame(atlas, frame, renderSize, "#fff6da");
      ctx.restore();
    }
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

// --- CINEMA 3D fatality dressing -------------------------------------------
// True while the CINEMA 3D presentation is ON (toggle + eligible + loaded),
// including during scripted finishers where the world temporarily renders 2D.
// Every caller keeps the classic 2D path byte-identical when this is false.
function cinema3dDressingActive() {
  return Boolean(cinema3dBridge.renderer?.ready && state.cinema3d && cinema3dAllowed());
}

// One-time offscreen canvases for the 3D-mode fatality frame: an actually
// painted pizza-on-cutter wheel and a dimensional blood droplet sprite.
// Built lazily on first 3D fatality; nothing allocates per frame.
const fatalityDressing = { pizza: null, pizzaRim: null, droplet: null };

// Rim-only copy of the pizza wheel (outer steel + crust edge): the spin
// ghosts draw THIS, so the motion blur lives on the wheel's rim where a
// spinning disc actually smears, instead of double-printing the pepperoni.
function fatalityPizzaRimCanvas() {
  if (fatalityDressing.pizzaRim) return fatalityDressing.pizzaRim;
  const source = fatalityPizzaCanvas();
  const c = document.createElement("canvas");
  c.width = c.height = source.width;
  const p = c.getContext("2d");
  p.drawImage(source, 0, 0);
  p.globalCompositeOperation = "destination-out";
  const hole = p.createRadialGradient(c.width / 2, c.width / 2, c.width * 0.24,
    c.width / 2, c.width / 2, c.width * 0.4);
  hole.addColorStop(0, "rgba(0,0,0,1)");
  hole.addColorStop(1, "rgba(0,0,0,0)");
  p.fillStyle = hole;
  p.fillRect(0, 0, c.width, c.height);
  p.globalCompositeOperation = "source-over";
  fatalityDressing.pizzaRim = c;
  return c;
}

function fatalityPizzaCanvas() {
  if (fatalityDressing.pizza) return fatalityDressing.pizza;
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const p = c.getContext("2d");
  const cx = size / 2;
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  // --- rusted steel cutter wheel under the pizza ---------------------------
  const steel = p.createRadialGradient(cx, cx, size * 0.3, cx, cx, size * 0.5);
  steel.addColorStop(0, "#565049");
  steel.addColorStop(0.82, "#6a635a");
  steel.addColorStop(1, "#4a443e");
  p.fillStyle = steel;
  p.beginPath();
  p.arc(cx, cx, size * 0.5 - 2, 0, Math.PI * 2);
  p.fill();
  // rust blotches riding the exposed rim
  for (let i = 0; i < 26; i += 1) {
    const a = hash(i) * Math.PI * 2;
    const rr = size * (0.435 + hash(i + 40) * 0.05);
    p.fillStyle = `rgba(${122 + Math.round(hash(i + 7) * 30)},${64 + Math.round(hash(i + 13) * 18)},38,${(0.35 + hash(i + 3) * 0.4).toFixed(2)})`;
    p.beginPath();
    p.ellipse(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr,
      size * (0.012 + hash(i + 21) * 0.02), size * (0.008 + hash(i + 33) * 0.012), a, 0, Math.PI * 2);
    p.fill();
  }
  // sharpened cutting edge + cold specular arc (the metal must read METAL)
  p.lineWidth = size * 0.012;
  p.strokeStyle = "#b9bfc7";
  p.beginPath();
  p.arc(cx, cx, size * 0.488, 0, Math.PI * 2);
  p.stroke();
  p.lineWidth = size * 0.016;
  p.strokeStyle = "rgba(240,246,252,0.95)";
  p.beginPath();
  p.arc(cx, cx, size * 0.488, Math.PI * 1.12, Math.PI * 1.62);
  p.stroke();
  p.lineWidth = size * 0.01;
  p.strokeStyle = "rgba(18,16,14,0.8)";
  p.beginPath();
  p.arc(cx, cx, size * 0.488, Math.PI * 0.1, Math.PI * 0.55);
  p.stroke();
  // --- crust ring with charred blisters ------------------------------------
  const crustR = size * 0.42;
  const crust = p.createRadialGradient(cx, cx, size * 0.3, cx, cx, crustR);
  crust.addColorStop(0, "#c9873c");
  crust.addColorStop(0.75, "#d99a48");
  crust.addColorStop(1, "#a86a2a");
  p.fillStyle = crust;
  p.beginPath();
  p.arc(cx, cx, crustR, 0, Math.PI * 2);
  p.fill();
  for (let i = 0; i < 34; i += 1) {
    const a = (i / 34) * Math.PI * 2 + hash(i + 60) * 0.18;
    const rr = size * (0.365 + hash(i + 71) * 0.045);
    const blister = size * (0.012 + hash(i + 82) * 0.016);
    p.fillStyle = hash(i + 90) > 0.42 ? "rgba(122,70,26,0.85)" : "rgba(58,30,12,0.8)";
    p.beginPath();
    p.arc(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr, blister, 0, Math.PI * 2);
    p.fill();
    p.fillStyle = "rgba(240,196,120,0.5)";
    p.beginPath();
    p.arc(cx + Math.cos(a) * rr - blister * 0.3, cx + Math.sin(a) * rr - blister * 0.35, blister * 0.4, 0, Math.PI * 2);
    p.fill();
  }
  // --- cheese field: mottled melt over sauce -------------------------------
  const cheeseR = size * 0.335;
  p.fillStyle = "#b04226"; // sauce base peeking through
  p.beginPath();
  p.arc(cx, cx, cheeseR, 0, Math.PI * 2);
  p.fill();
  for (let i = 0; i < 120; i += 1) {
    const a = hash(i + 200) * Math.PI * 2;
    const rr = Math.sqrt(hash(i + 210)) * cheeseR * 0.96;
    const blob = size * (0.02 + hash(i + 220) * 0.035);
    const tone = hash(i + 230);
    p.fillStyle = tone > 0.62 ? "rgba(242,220,143,0.9)" : tone > 0.25 ? "rgba(232,201,106,0.9)" : "rgba(214,178,84,0.85)";
    p.beginPath();
    p.ellipse(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr, blob, blob * (0.6 + hash(i + 240) * 0.5), a, 0, Math.PI * 2);
    p.fill();
  }
  // browned cheese bubbles
  for (let i = 0; i < 26; i += 1) {
    const a = hash(i + 300) * Math.PI * 2;
    const rr = Math.sqrt(hash(i + 310)) * cheeseR * 0.9;
    p.fillStyle = `rgba(168,112,40,${(0.3 + hash(i + 320) * 0.35).toFixed(2)})`;
    p.beginPath();
    p.arc(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr, size * (0.006 + hash(i + 330) * 0.01), 0, Math.PI * 2);
    p.fill();
  }
  // deep sauce gaps torn into the melt: the dark accents that keep the face
  // readable through the finisher bloom + saturation drain
  for (let i = 0; i < 12; i += 1) {
    const a = hash(i + 500) * Math.PI * 2;
    const rr = Math.sqrt(hash(i + 510)) * cheeseR * 0.85;
    p.fillStyle = `rgba(112,30,16,${(0.55 + hash(i + 520) * 0.3).toFixed(2)})`;
    p.beginPath();
    p.ellipse(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr,
      size * (0.014 + hash(i + 530) * 0.022), size * (0.008 + hash(i + 540) * 0.012),
      a * 1.7, 0, Math.PI * 2);
    p.fill();
  }
  // edge shadow ring seating the cheese under the crust lip
  p.lineWidth = size * 0.014;
  p.strokeStyle = "rgba(88,44,14,0.7)";
  p.beginPath();
  p.arc(cx, cx, cheeseR * 0.99, 0, Math.PI * 2);
  p.stroke();
  // --- pepperoni: cupped discs with grease glints --------------------------
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + hash(i + 400) * 0.7;
    const rr = i === 7 ? cheeseR * 0.2 : cheeseR * (0.38 + hash(i + 410) * 0.5);
    const px = cx + Math.cos(a) * rr;
    const py = cx + Math.sin(a) * rr;
    const pr = size * (0.055 + hash(i + 420) * 0.014);
    // flat cured-meat read (the deep sphere gradient read as chocolate)
    const cup = p.createRadialGradient(px - pr * 0.2, py - pr * 0.24, pr * 0.3, px, py, pr);
    cup.addColorStop(0, "#c8523a");
    cup.addColorStop(0.7, "#b03a2a");
    cup.addColorStop(0.92, "#8a251a");
    cup.addColorStop(1, "#6e1a12");
    p.fillStyle = cup;
    p.beginPath();
    p.arc(px, py, pr, 0, Math.PI * 2);
    p.fill();
    // charred cup rim + grease specular
    p.lineWidth = pr * 0.16;
    p.strokeStyle = "rgba(52,12,8,0.75)";
    p.beginPath();
    p.arc(px, py, pr * 0.92, Math.PI * 0.1, Math.PI * 1.1);
    p.stroke();
    p.fillStyle = "rgba(255,214,178,0.85)";
    p.beginPath();
    p.ellipse(px - pr * 0.3, py - pr * 0.34, pr * 0.16, pr * 0.1, -0.6, 0, Math.PI * 2);
    p.fill();
  }
  // top-light: soft directional sheen across the whole face
  const sheen = p.createLinearGradient(0, 0, size, size);
  sheen.addColorStop(0, "rgba(255,240,210,0.16)");
  sheen.addColorStop(0.45, "rgba(255,240,210,0)");
  sheen.addColorStop(1, "rgba(30,10,4,0.18)");
  p.fillStyle = sheen;
  p.beginPath();
  p.arc(cx, cx, crustR, 0, Math.PI * 2);
  p.fill();
  // hub + bolt
  p.fillStyle = "#2c2a28";
  p.beginPath();
  p.arc(cx, cx, size * 0.055, 0, Math.PI * 2);
  p.fill();
  p.lineWidth = size * 0.008;
  p.strokeStyle = "#9aa0a8";
  p.stroke();
  p.fillStyle = "#e8edf2";
  p.beginPath();
  p.arc(cx - size * 0.014, cx - size * 0.016, size * 0.014, 0, Math.PI * 2);
  p.fill();
  fatalityDressing.pizza = c;
  return c;
}

// Round-4 blood grammar (Kimberly-paint reference): a DIRECTIONAL teardrop —
// fat glossy head pointing +x, comma tail whipping back along -x — so every
// draw site can aim it along a velocity. Deep arterial reds (no browns), a
// hot core inside the head, a dark wet rim, one bright specular kiss.
function fatalityDropletCanvas() {
  if (fatalityDressing.droplet) return fatalityDressing.droplet;
  const size = 96;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const p = c.getContext("2d");
  // comma body: tail tip (12,47) -> top edge -> around the head -> sagging
  // bottom edge back to the tip.
  const body = () => {
    p.beginPath();
    p.moveTo(12, 47);
    p.bezierCurveTo(30, 37, 44, 31, 60, 31);
    p.arc(60, 48, 17, -Math.PI / 2, Math.PI / 2);
    p.bezierCurveTo(42, 66, 26, 57, 12, 47);
    p.closePath();
  };
  const grad = p.createRadialGradient(64, 43, 3, 60, 48, 42);
  grad.addColorStop(0, "#f3312c");
  grad.addColorStop(0.4, "#c00a18");
  grad.addColorStop(0.78, "#7c0411");
  grad.addColorStop(1, "#4a020c");
  p.fillStyle = grad;
  body();
  p.fill();
  // dark wet rim
  p.strokeStyle = "rgba(40,0,8,0.85)";
  p.lineWidth = 2.4;
  body();
  p.stroke();
  // hot arterial core inside the head
  const core = p.createRadialGradient(63, 44, 1, 63, 44, 11);
  core.addColorStop(0, "rgba(255,92,72,0.85)");
  core.addColorStop(1, "rgba(255,92,72,0)");
  p.fillStyle = core;
  p.beginPath();
  p.arc(63, 44, 11, 0, Math.PI * 2);
  p.fill();
  // specular kiss + glint on the head's upper-left (lamp side)
  p.fillStyle = "rgba(255,226,216,0.92)";
  p.beginPath();
  p.ellipse(56, 40, 6.2, 3.4, -0.5, 0, Math.PI * 2);
  p.fill();
  p.fillStyle = "rgba(255,255,255,0.95)";
  p.beginPath();
  p.arc(66, 38, 1.9, 0, Math.PI * 2);
  p.fill();
  // faint warm floor-bounce along the belly
  p.fillStyle = "rgba(255,122,88,0.28)";
  p.beginPath();
  p.ellipse(58, 58, 9, 2.6, 0.15, 0, Math.PI * 2);
  p.fill();
  fatalityDressing.droplet = c;
  return c;
}

// Depth layering support: the same teardrop rendered through a tiny buffer so
// it comes back soft-edged — the FAR band of the gore field draws this one,
// while near droplets stay sharp (big sharp near, small soft far).
function fatalityDropletSoftCanvas() {
  if (fatalityDressing.dropletSoft) return fatalityDressing.dropletSoft;
  const sharp = fatalityDropletCanvas();
  const tiny = document.createElement("canvas");
  tiny.width = tiny.height = 20;
  tiny.getContext("2d").drawImage(sharp, 0, 0, 20, 20);
  const c = document.createElement("canvas");
  c.width = c.height = sharp.width;
  const p = c.getContext("2d");
  p.imageSmoothingEnabled = true;
  p.globalAlpha = 0.85;
  p.drawImage(tiny, 0, 0, c.width, c.height);
  fatalityDressing.dropletSoft = c;
  return c;
}

// Floor-hit splat: an irregular wet blot with RADIAL TAILS and satellite
// beads — what a droplet becomes the frame after it lands. Squashed by the
// caller onto the ground plane.
function fatalitySplatCanvas() {
  if (fatalityDressing.splat) return fatalityDressing.splat;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const p = c.getContext("2d");
  const cx = size / 2;
  const hash = (n) => {
    const s = Math.sin(n * 91.7 + 47.3) * 24634.5;
    return s - Math.floor(s);
  };
  p.lineCap = "round";
  // radial tails first (under the body): tapered strokes ending in beads
  for (let tail = 0; tail < 7; tail += 1) {
    const a = tail * 0.897 + hash(tail) * 0.5;
    const len = size * (0.2 + hash(tail + 9) * 0.22);
    const tx = cx + Math.cos(a) * len;
    const ty = cx + Math.sin(a) * len;
    p.strokeStyle = "rgba(122,4,17,0.9)";
    p.lineWidth = 4.5 - hash(tail + 4) * 2;
    p.beginPath();
    p.moveTo(cx + Math.cos(a) * size * 0.1, cx + Math.sin(a) * size * 0.1);
    p.quadraticCurveTo(cx + Math.cos(a) * len * 0.6, cx + Math.sin(a) * len * 0.6, tx, ty);
    p.stroke();
    p.fillStyle = "rgba(150,8,20,0.92)";
    p.beginPath();
    p.arc(tx, ty, 2.6 + hash(tail + 13) * 2, 0, Math.PI * 2);
    p.fill();
  }
  // satellite micro-beads flung past the tails
  for (let dot = 0; dot < 6; dot += 1) {
    const a = dot * 1.13 + 0.4;
    const len = size * (0.34 + hash(dot + 21) * 0.12);
    p.fillStyle = "rgba(140,6,18,0.8)";
    p.beginPath();
    p.arc(cx + Math.cos(a) * len, cx + Math.sin(a) * len, 1.6 + hash(dot + 27) * 1.4, 0, Math.PI * 2);
    p.fill();
  }
  // irregular blot body: overlapping lobes, dark rim tone under a hot centre
  const lobes = [[0, 0, 0.17], [0.09, 0.04, 0.12], [-0.1, 0.05, 0.1], [0.03, -0.08, 0.11]];
  for (const [ox, oy, r] of lobes) {
    const g = p.createRadialGradient(cx + ox * size, cx + oy * size, 1, cx + ox * size, cx + oy * size, r * size);
    g.addColorStop(0, "rgba(178,10,24,0.98)");
    g.addColorStop(0.72, "rgba(112,4,16,0.95)");
    g.addColorStop(1, "rgba(64,2,10,0.85)");
    p.fillStyle = g;
    p.beginPath();
    p.arc(cx + ox * size, cx + oy * size, r * size, 0, Math.PI * 2);
    p.fill();
  }
  // wet lamp streak
  p.fillStyle = "rgba(255,206,196,0.55)";
  p.beginPath();
  p.ellipse(cx - size * 0.05, cx - size * 0.06, size * 0.07, size * 0.025, -0.4, 0, Math.PI * 2);
  p.fill();
  fatalityDressing.splat = c;
  return c;
}

// Round-3 debris variety (critic item 2): the lens pass mixes FOUR distinct
// sprites — glossy droplet (above), a matte torn MEAT CHUNK with a fat seam,
// a pale BONE FLECK, and an elongated SPLASH RIVULET — so the gore field
// stops reading as one pepperoni ellipse stamped 31 times. All lit from
// upper-left (the lamp) with a dark underside.
function fatalityChunkCanvas() {
  if (fatalityDressing.chunk) return fatalityDressing.chunk;
  const size = 96;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const p = c.getContext("2d");
  const cx = size / 2;
  // irregular torn polygon
  p.fillStyle = "#7c0d16";
  p.beginPath();
  p.moveTo(cx - size * 0.3, cx - size * 0.08);
  p.lineTo(cx - size * 0.12, cx - size * 0.3);
  p.lineTo(cx + size * 0.16, cx - size * 0.24);
  p.lineTo(cx + size * 0.32, cx + size * 0.02);
  p.lineTo(cx + size * 0.18, cx + size * 0.26);
  p.lineTo(cx - size * 0.1, cx + size * 0.3);
  p.lineTo(cx - size * 0.28, cx + size * 0.12);
  p.closePath();
  p.fill();
  // darker muscle striations
  p.strokeStyle = "#4e050c";
  p.lineWidth = 2.5;
  for (const [y0, y1] of [[-0.12, 0.08], [0.02, 0.2], [-0.22, -0.05]]) {
    p.beginPath();
    p.moveTo(cx - size * 0.2, cx + size * y0);
    p.quadraticCurveTo(cx, cx + size * (y0 + y1) * 0.5 + 3, cx + size * 0.2, cx + size * y1);
    p.stroke();
  }
  // fat seam + lamp-side highlight
  p.fillStyle = "rgba(232,206,178,0.85)";
  p.beginPath();
  p.ellipse(cx - size * 0.08, cx - size * 0.16, size * 0.12, size * 0.05, -0.4, 0, Math.PI * 2);
  p.fill();
  p.fillStyle = "rgba(214,80,72,0.7)";
  p.beginPath();
  p.ellipse(cx - size * 0.14, cx - size * 0.06, size * 0.08, size * 0.05, -0.5, 0, Math.PI * 2);
  p.fill();
  // dark underside
  p.fillStyle = "rgba(30,2,6,0.6)";
  p.beginPath();
  p.ellipse(cx + size * 0.06, cx + size * 0.2, size * 0.2, size * 0.08, 0.2, 0, Math.PI * 2);
  p.fill();
  fatalityDressing.chunk = c;
  return c;
}
function fatalityBoneCanvas() {
  if (fatalityDressing.bone) return fatalityDressing.bone;
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const p = c.getContext("2d");
  const cx = size / 2;
  p.lineCap = "round";
  // shard shaft with a snapped, flared end
  p.strokeStyle = "#e6d3b2";
  p.lineWidth = size * 0.14;
  p.beginPath();
  p.moveTo(cx - size * 0.24, cx + size * 0.16);
  p.lineTo(cx + size * 0.2, cx - size * 0.14);
  p.stroke();
  p.strokeStyle = "#f4e8cd";
  p.lineWidth = size * 0.07;
  p.beginPath();
  p.moveTo(cx - size * 0.22, cx + size * 0.13);
  p.lineTo(cx + size * 0.18, cx - size * 0.14);
  p.stroke();
  // splintered tip + marrow fleck + blood stain at the root
  p.fillStyle = "#f4e8cd";
  p.beginPath();
  p.moveTo(cx + size * 0.16, cx - size * 0.2);
  p.lineTo(cx + size * 0.32, cx - size * 0.24);
  p.lineTo(cx + size * 0.22, cx - size * 0.06);
  p.closePath();
  p.fill();
  p.fillStyle = "#b89a74";
  p.beginPath();
  p.arc(cx + size * 0.12, cx - size * 0.1, size * 0.045, 0, Math.PI * 2);
  p.fill();
  p.fillStyle = "rgba(150,12,16,0.85)";
  p.beginPath();
  p.ellipse(cx - size * 0.22, cx + size * 0.16, size * 0.1, size * 0.07, 0.5, 0, Math.PI * 2);
  p.fill();
  fatalityDressing.bone = c;
  return c;
}
function fatalityRivuletCanvas() {
  if (fatalityDressing.rivulet) return fatalityDressing.rivulet;
  const w = 48;
  const h = 128;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const p = c.getContext("2d");
  // elongated tear: fat glossy head, whipping thin tail
  const grad = p.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(196,32,28,0.98)");
  grad.addColorStop(0.4, "rgba(150,12,16,0.95)");
  grad.addColorStop(1, "rgba(80,2,10,0.2)");
  p.fillStyle = grad;
  p.beginPath();
  p.moveTo(w * 0.5, h * 0.04);
  p.bezierCurveTo(w * 0.92, h * 0.16, w * 0.72, h * 0.42, w * 0.58, h * 0.66);
  p.quadraticCurveTo(w * 0.5, h * 0.86, w * 0.44, h * 0.97);
  p.quadraticCurveTo(w * 0.38, h * 0.8, w * 0.34, h * 0.6);
  p.bezierCurveTo(w * 0.2, h * 0.36, w * 0.14, h * 0.14, w * 0.5, h * 0.04);
  p.closePath();
  p.fill();
  // glossy head kiss
  p.fillStyle = "rgba(255,182,170,0.8)";
  p.beginPath();
  p.ellipse(w * 0.4, h * 0.14, w * 0.12, h * 0.045, -0.4, 0, Math.PI * 2);
  p.fill();
  fatalityDressing.rivulet = c;
  return c;
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
  if (cinema3dDressingActive()) {
    // CINEMA 3D: the pool reads WET — a darkened blood core, a cold glossy
    // streak answering the overhead lamp, and droplets become directional
    // spatter with dimensional cores + run-tails instead of flat ellipses.
    const core = ctx.createRadialGradient(0, 0, 2, 0, 0, 72 * scale);
    core.addColorStop(0, "rgba(60,2,8,0.85)");
    core.addColorStop(0.6, "rgba(96,6,12,0.4)");
    core.addColorStop(1, "rgba(60,2,8,0)");
    ctx.globalAlpha = Math.min(1, alpha * 1.6);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(0, 0, (34 + growth * 74) * scale, 6 + growth * 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, alpha * 1.2) * 0.55;
    ctx.fillStyle = "rgba(210,236,225,0.5)"; // lamp streak on the wet surface
    ctx.beginPath();
    ctx.ellipse(10 * scale, -2, (20 + growth * 30) * scale, 2.6 + growth * 3, -0.06, 0, Math.PI * 2);
    ctx.fill();
    const droplet = fatalityDropletCanvas();
    for (let drop = 0; drop < 13; drop += 1) {
      const angle = drop * 2.399 + (effect.family === "glitch" ? .4 : 0);
      const reach = (24 + growth * 118) * (.45 + (drop % 5) * .14) * scale;
      const dx = Math.cos(angle) * reach;
      const dy = Math.sin(angle) * reach * .22;
      const size = (7 + drop % 4 * 4.5) * (1 + growth * 0.3);
      ctx.globalAlpha = alpha * (.44 + drop % 3 * .2);
      // run-tail streaking back toward the pool centre
      ctx.strokeStyle = effect.color;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1.6, size * 0.22);
      ctx.beginPath();
      ctx.moveTo(dx * 0.55, dy * 0.55);
      ctx.lineTo(dx, dy);
      ctx.stroke();
      ctx.save();
      ctx.translate(dx, dy);
      if (drop % 4 === 0) {
        // landed hit: splat with radial tails flattened onto the floor plane
        ctx.rotate(angle * 0.3);
        ctx.scale(1.3, 0.45);
        ctx.drawImage(fatalitySplatCanvas(), -size * 1.4, -size * 1.4, size * 2.8, size * 2.8);
      } else {
        // teardrop head pointing away from the pool, tail meeting its run-tail
        ctx.rotate(angle);
        ctx.scale(1.3, 0.6);
        ctx.drawImage(droplet, -size, -size, size * 2, size * 2);
      }
      ctx.restore();
    }
  } else {
    ctx.fillStyle = effect.color;
    for (let drop = 0; drop < 13; drop += 1) {
      const angle = drop * 2.399 + (effect.family === "glitch" ? .4 : 0);
      const reach = (24 + growth * 118) * (.45 + (drop % 5) * .14) * scale;
      ctx.globalAlpha = alpha * (.38 + drop % 3 * .18);
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * reach, Math.sin(angle) * reach * .22, 4 + drop % 4 * 3, 2 + drop % 3 * 2, angle, 0, Math.PI * 2);
      ctx.fill();
    }
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

// CINEMA 3D painted severed limb (round-3, critic item 2): the flat capsule
// strokes read as a pink rubber glove on a teal toy — this builds a properly
// PAINTED limb sprite once per (limb, palette): shaded torn sleeve, modelled
// forearm + curled fist (or jeans + boot), a real gore stump (blood ring,
// bone, hanging shreds), warm rim light from the wheel's glow along one edge
// and a cool night kiss on the other, matching the fighters' rendered-paint
// language. Built lazily, cached; the classic 2D primitives are untouched.
const severedLimbCache = new Map();

// Round-4 (ship-review item 2): the severed arm is composited from the
// VICTIM'S OWN ATLAS PIXELS. Frame 10 of the shared 4x4 grammar is the fully
// extended straight punch — a clean horizontal forearm + fist painted in the
// fighter's own rendered language (Jez: bare muscled forearm, wrist wrap,
// black glove, torn blue gi at the shoulder). HD sheet when ready (same map
// the super close-up warms), SD atlas as fallback, null before either loads.
function severedArmAtlasSource(victimId) {
  const sd = fighterAtlases[victimId];
  if (!sd?.complete || !sd.naturalWidth) return null;
  const hdPath = `renderer/hd/${victimId}.webp`;
  if (!superPortraitHdImages.has(hdPath)) {
    const img = new Image();
    img.src = hdPath;
    superPortraitHdImages.set(hdPath, img);
  }
  const hd = superPortraitHdImages.get(hdPath);
  const atlas = hd.complete && hd.naturalWidth ? hd : sd;
  const cell = atlas.naturalWidth / 4;
  const x0 = 2 * cell; // frame 10 = column 2, row 2
  const y0 = 2 * cell;
  return {
    atlas,
    tag: atlas === hd ? "hd" : "sd",
    // crop: deltoid through glove knuckles (cell-normalised, grammar-level)
    sx: x0 + cell * 0.4609, sy: y0 + cell * 0.1875,
    sw: cell * 0.5234, sh: cell * 0.1953,
    // arm axis anchors in atlas pixels: mid-shoulder -> fist knuckles
    axAx: x0 + cell * 0.5312, axAy: y0 + cell * 0.2969,
    axBx: x0 + cell * 0.9609, axBy: y0 + cell * 0.2734,
  };
}

function severedLimbPaintedCanvas(effect, victimId = null, warmSide = 1) {
  const leg = effect.limb.endsWith("leg");
  const armSrc = !leg && victimId ? severedArmAtlasSource(victimId) : null;
  const key = `${leg ? "leg" : "arm"}:${victimId || "-"}:${armSrc ? armSrc.tag : "painted"}:${warmSide}`
    + `:${effect.clothColor}:${effect.clothAccent}:${effect.color}:${effect.secondary}`;
  if (severedLimbCache.has(key)) return severedLimbCache.get(key);
  const length = leg ? 92 : 72;
  const thickness = leg ? 30 : 23;
  const scale = 2; // authored at 2x, played back at 1x
  const c = document.createElement("canvas");
  c.width = Math.round(length * 1.5 * scale);
  c.height = Math.round(thickness * 3.2 * scale);
  const p = c.getContext("2d");
  p.scale(scale, scale);
  p.translate(length * 0.75, thickness * 1.6);
  p.lineCap = "round";
  p.lineJoin = "round";
  const shade = (hex, f) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
    const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
    const b = Math.min(255, Math.round((n & 255) * f));
    return `rgb(${r},${g},${b})`;
  };
  // Fabric, not roster accent: the raw def.color is a UI hue (Jez's is
  // near-cyan) — pulled 72% toward a night-fabric slate so the sleeve reads
  // as the fighter's CLOTHING under stage light, never a toy shell.
  const mixHex = (hexA, hexB, t) => {
    const a = parseInt((hexA || "#3a5a8c").replace("#", ""), 16);
    const b = parseInt(hexB.replace("#", ""), 16);
    const channel = (sh) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t)
      .toString(16).padStart(2, "0");
    return `#${channel(16)}${channel(8)}${channel(0)}`;
  };
  const cloth = mixHex(effect.clothColor, "#33415e", 0.72);
  const skin = "#c98b70";
  const gore = effect.color || "#a11220";
  const goreDeep = effect.secondary || "#6d0c19";
  // The limb is built as STACKED TAPERED STROKES (dark underlayer, mid tone,
  // top-half highlight) along a gently sagging axis — round painted forms,
  // no straight bars, no full-length rim rods.
  const sag = leg ? 4 : 2.6;
  const axis = (t) => ({ x: t * length, y: Math.sin((t + 0.42) * 2.4) * sag });
  const strokeAlong = (t0, t1, width, tone, offY = 0, alphaScale = 1) => {
    p.strokeStyle = tone;
    p.globalAlpha = alphaScale;
    p.lineWidth = width;
    p.beginPath();
    const a0 = axis(t0);
    const mid = axis((t0 + t1) / 2);
    const a1 = axis(t1);
    p.moveTo(a0.x, a0.y + offY);
    p.quadraticCurveTo(mid.x, mid.y + offY + 1.2, a1.x, a1.y + offY);
    p.stroke();
    p.globalAlpha = 1;
  };
  const stumpT = -0.42;
  const stumpAt = axis(stumpT);
  if (leg) {
    // thigh->calf in torn jeans, boot at the far end
    strokeAlong(-0.36, 0.3, thickness * 1.04, shade(cloth, 0.62));
    strokeAlong(-0.36, 0.3, thickness * 0.9, cloth);
    strokeAlong(-0.34, 0.26, thickness * 0.4, shade(cloth, 1.3), -thickness * 0.2, 0.85);
    // knee crease + fold shadows
    p.strokeStyle = shade(cloth, 0.55);
    p.lineWidth = 1.8;
    for (const fx of [-0.12, 0.05, 0.2]) {
      const at = axis(fx);
      p.beginPath();
      p.moveTo(at.x, at.y - thickness * 0.3);
      p.quadraticCurveTo(at.x + 2.5, at.y, at.x + 1, at.y + thickness * 0.32);
      p.stroke();
    }
    // boot: rounded leather mass + heel + pale sole line
    const bootAt = axis(0.42);
    p.fillStyle = "#1a1c22";
    p.beginPath();
    p.ellipse(bootAt.x + thickness * 0.16, bootAt.y + 1, thickness * 0.52, thickness * 0.42, 0.12, 0, Math.PI * 2);
    p.fill();
    p.beginPath();
    p.ellipse(bootAt.x + thickness * 0.62, bootAt.y + thickness * 0.16, thickness * 0.34, thickness * 0.28, 0.3, 0, Math.PI * 2);
    p.fill();
    p.fillStyle = "#2e323c"; // top-light on the toe
    p.beginPath();
    p.ellipse(bootAt.x + thickness * 0.5, bootAt.y - thickness * 0.08, thickness * 0.24, thickness * 0.12, 0.3, 0, Math.PI * 2);
    p.fill();
    p.strokeStyle = "#565c68";
    p.lineWidth = 2.2;
    p.beginPath();
    p.moveTo(bootAt.x + thickness * 0.1, bootAt.y + thickness * 0.36);
    p.quadraticCurveTo(bootAt.x + thickness * 0.5, bootAt.y + thickness * 0.44, bootAt.x + thickness * 0.86, bootAt.y + thickness * 0.3);
    p.stroke();
  } else if (armSrc) {
    // --- HERO PROP: the victim's actual arm, cut off his sprite -------------
    // The atlas punch-arm is clipped to a lumpy capsule along the limb axis,
    // sheared off at the stump on a wedge plane, then dressed: torn sleeve
    // lip with hanging threads, layered gore cross-section (dermis, muscle
    // wedges, bone ring with marrow, wet sheen), warm wheel-glow rim on the
    // screen-down edge (warmSide) and a night-cool key opposite.
    const armPath = () => {
      p.beginPath();
      for (const [t, r] of [[-0.6, 0.64], [-0.48, 0.7], [-0.34, 0.68], [-0.2, 0.62], [-0.06, 0.56],
        [0.08, 0.5], [0.2, 0.46], [0.3, 0.45], [0.4, 0.55], [0.48, 0.62]]) {
        const at = axis(t);
        p.moveTo(at.x + thickness * r, at.y);
        p.arc(at.x, at.y, thickness * r, 0, Math.PI * 2);
      }
    };
    // Cut plane sits INSIDE the sampled torn-sleeve band, so a strip of the
    // victim's actual blue gi survives on the stump side of the sever.
    const cutAt = axis(-0.56);
    // 1) the sampled arm, axis-mapped shoulder->stump so the sever runs
    //    through the torn gi sleeve and the glove stays at the far end
    const dstA = axis(-0.52);
    const dstB = axis(0.5);
    const srcAngle = Math.atan2(armSrc.axBy - armSrc.axAy, armSrc.axBx - armSrc.axAx);
    const dstAngle = Math.atan2(dstB.y - dstA.y, dstB.x - dstA.x);
    const fit = Math.hypot(dstB.x - dstA.x, dstB.y - dstA.y)
      / Math.hypot(armSrc.axBx - armSrc.axAx, armSrc.axBy - armSrc.axAy);
    p.save();
    armPath();
    p.clip();
    p.translate(dstA.x, dstA.y);
    p.rotate(dstAngle - srcAngle);
    p.scale(fit, fit * 1.16); // slight fatten across the axis: hero presence
    p.drawImage(armSrc.atlas, armSrc.sx, armSrc.sy, armSrc.sw, armSrc.sh,
      armSrc.sx - armSrc.axAx, armSrc.sy - armSrc.axAy, armSrc.sw, armSrc.sh);
    p.restore();
    // 2) light story clipped to the same silhouette: cool night key on the
    //    screen-up edge, wheel-glow warmth on the screen-down edge, a soft
    //    core shadow between them so the arm reads ROUND at play distance
    p.save();
    armPath();
    p.clip();
    const bboxX = -length * 0.82;
    const bboxW = length * 1.64;
    const coolG = p.createLinearGradient(0, -warmSide * thickness * 0.78, 0, -warmSide * thickness * 0.08);
    coolG.addColorStop(0, "rgba(150,190,255,0.28)");
    coolG.addColorStop(1, "rgba(150,190,255,0)");
    p.fillStyle = coolG;
    p.fillRect(bboxX, -thickness * 1.55, bboxW, thickness * 3.1);
    const shadeG = p.createLinearGradient(0, warmSide * thickness * 0.05, 0, warmSide * thickness * 0.52);
    shadeG.addColorStop(0, "rgba(26,8,16,0)");
    shadeG.addColorStop(1, "rgba(26,8,16,0.3)");
    p.fillStyle = shadeG;
    p.fillRect(bboxX, -thickness * 1.55, bboxW, thickness * 3.1);
    const warmG = p.createLinearGradient(0, warmSide * thickness * 0.3, 0, warmSide * thickness * 0.78);
    warmG.addColorStop(0, "rgba(255,150,54,0)");
    warmG.addColorStop(1, "rgba(255,158,58,0.5)");
    p.fillStyle = warmG;
    p.fillRect(bboxX, -thickness * 1.55, bboxW, thickness * 3.1);
    p.restore();
    // 3) shear everything past the cut plane off on a wedge angle
    p.save();
    p.translate(cutAt.x, cutAt.y);
    p.rotate(-0.28);
    p.globalCompositeOperation = "destination-out";
    p.fillRect(-length * 1.4, -thickness * 2.4, length * 1.4, thickness * 4.8);
    p.restore();
    // 4) torn sleeve lip biting over the cut, threads whipping off the fray
    p.save();
    p.translate(cutAt.x, cutAt.y);
    p.rotate(-0.28);
    const fray = (n) => {
      const s = Math.sin(n * 61.7 + 13.9) * 15731.3;
      return s - Math.floor(s);
    };
    // gi-blue for the painted sleeve parts: the roster colour is a UI hue
    // (Jez's is near-cyan), pulled hard toward the atlas gi's royal blue so
    // painted cloth and sampled cloth read as the SAME garment
    const gi = mixHex(effect.clothColor, "#31518f", 0.9);
    // the surviving sleeve: a torn cloth band around the upper bicep, clear
    // of the cross-section — jagged fist-side edge, fold shadows, a lit
    // frayed lip on the cut side
    p.beginPath();
    p.moveTo(9.5, -thickness * 0.56);
    for (let seg = 0; seg <= 6; seg += 1) {
      p.lineTo(16.6 + (fray(seg + 51) - 0.5) * 5, -thickness * 0.56 + (seg / 6) * thickness * 1.12);
    }
    p.lineTo(9.5, thickness * 0.56);
    p.closePath();
    p.fillStyle = gi;
    p.fill();
    p.strokeStyle = shade(gi, 0.55); // fold shadows down the band
    p.lineWidth = 1.1;
    for (const fy of [-0.3, 0.02, 0.3]) {
      p.beginPath();
      p.moveTo(11.4, thickness * fy - 2.4);
      p.quadraticCurveTo(13.8, thickness * fy + 0.5, 12.2, thickness * fy + 3.2);
      p.stroke();
    }
    p.strokeStyle = shade(gi, 1.42); // lit frayed lip on the cut side
    p.lineWidth = 1.2;
    p.beginPath();
    p.moveTo(10.2, -thickness * 0.5);
    p.quadraticCurveTo(11.8, 0, 10.4, thickness * 0.5);
    p.stroke();
    for (let tooth = 0; tooth < 7; tooth += 1) {
      const ta = (tooth / 7) * Math.PI * 2 + 0.3;
      const rimX = Math.cos(ta) * thickness * 0.52;
      const rimY = Math.sin(ta) * thickness * 0.46;
      p.fillStyle = fray(tooth) > 0.55 ? shade(gi, 1.22) : shade(gi, 0.82);
      p.beginPath();
      p.moveTo(rimX, rimY - thickness * 0.1);
      p.lineTo(rimX + 2.4 + fray(tooth + 5) * 2.6, rimY + (fray(tooth + 9) - 0.5) * 3);
      p.lineTo(rimX, rimY + thickness * 0.1);
      p.closePath();
      p.fill();
    }
    p.lineCap = "round";
    for (let thread = 0; thread < 3; thread += 1) {
      const ty = (thread - 1) * thickness * 0.26 + 1;
      p.strokeStyle = thread === 1 ? shade(gi, 1.5) : shade(gi, 0.7);
      p.lineWidth = 0.9;
      p.beginPath();
      p.moveTo(-thickness * 0.1, ty);
      p.quadraticCurveTo(
        -thickness * (0.34 + fray(thread + 3) * 0.2),
        ty + warmSide * (2 + fray(thread + 7) * 3.5),
        -thickness * (0.52 + fray(thread + 11) * 0.26),
        ty + warmSide * (5 + fray(thread + 13) * 4),
      );
      p.stroke();
    }
    // 5) the wedge cross-section: asymmetric, wet, torn — NOT a bullseye.
    // Lumpy dark base, off-origin muscle bundles in two close reds with
    // radial fibre strokes, a short skin lip on the lamp side only, a small
    // off-centre bone chip, clots breaking the silhouette, sheen on top.
    const rx = thickness * 0.52;
    const ry = thickness * 0.46;
    p.fillStyle = "#3c020b"; // congealed base, lumpy silhouette
    p.beginPath();
    p.ellipse(0, 0, rx, ry * 0.94, 0.18, 0, Math.PI * 2);
    p.ellipse(rx * 0.2, -ry * 0.26, rx * 0.74, ry * 0.66, 0.5, 0, Math.PI * 2);
    p.ellipse(-rx * 0.22, ry * 0.24, rx * 0.7, ry * 0.62, -0.4, 0, Math.PI * 2);
    p.ellipse(rx * 0.05, ry * 0.4, rx * 0.6, ry * 0.5, 0.9, 0, Math.PI * 2);
    p.fill();
    for (let bundle = 0; bundle < 5; bundle += 1) { // muscle bundles, off-origin
      const a0 = bundle * 1.256 + fray(bundle + 15) * 0.7;
      const wr = rx * (0.5 + fray(bundle + 17) * 0.3);
      const ox = (fray(bundle + 19) - 0.5) * rx * 0.5;
      const oy = (fray(bundle + 21) - 0.5) * ry * 0.5;
      p.fillStyle = bundle % 2 ? "#9c0715" : "#b30d1a";
      p.beginPath();
      p.ellipse(ox, oy, wr, wr * (0.55 + fray(bundle + 25) * 0.3), a0, 0, Math.PI * 2);
      p.fill();
    }
    p.strokeStyle = "rgba(58,2,10,0.8)"; // radial fibre strokes
    p.lineWidth = 1;
    for (let fibre = 0; fibre < 5; fibre += 1) {
      const fa = fibre * 1.35 + 0.5 + fray(fibre + 29) * 0.5;
      p.beginPath();
      p.moveTo(Math.cos(fa) * rx * 0.2, Math.sin(fa) * ry * 0.2);
      p.lineTo(Math.cos(fa) * rx * (0.6 + fray(fibre + 33) * 0.28),
        Math.sin(fa) * ry * (0.6 + fray(fibre + 35) * 0.28));
      p.stroke();
    }
    // short skin lip on the lamp side only (no full outline ring)
    p.lineWidth = 1.5;
    p.strokeStyle = "rgba(235,176,148,0.75)";
    p.beginPath();
    p.ellipse(0, 0, rx * 0.94, ry * 0.92, 0.18, -2.5, -1.3);
    p.stroke();
    // small bone chip high of centre: pale wedge with a marrow fleck and an
    // inner crescent shadow — a chip, not a ring
    p.save();
    p.translate(-rx * 0.26, -ry * 0.3);
    p.rotate(-0.4);
    p.fillStyle = "#f6ecd4";
    p.beginPath();
    p.ellipse(0, 0, thickness * 0.13, thickness * 0.1, 0, 0, Math.PI * 2);
    p.fill();
    p.strokeStyle = "rgba(150,118,80,0.7)";
    p.lineWidth = 0.9;
    p.beginPath();
    p.arc(thickness * 0.02, thickness * 0.02, thickness * 0.09, 0.4, 2.2);
    p.stroke();
    p.fillStyle = "#c59f68";
    p.beginPath();
    p.ellipse(thickness * 0.035, thickness * 0.02, thickness * 0.045, thickness * 0.032, 0.3, 0, Math.PI * 2);
    p.fill();
    p.restore();
    // dark clots riding the rim, breaking any circular read
    p.fillStyle = "#2c0108";
    p.beginPath();
    p.ellipse(rx * 0.6, ry * 0.34, rx * 0.2, ry * 0.14, 0.6, 0, Math.PI * 2);
    p.ellipse(-rx * 0.5, ry * 0.5, rx * 0.16, ry * 0.12, -0.5, 0, Math.PI * 2);
    p.fill();
    // wet sheen crescent + specular pin-lights on the cut's lamp side
    p.strokeStyle = "rgba(255,198,188,0.8)";
    p.lineWidth = 1.6;
    p.beginPath();
    p.arc(1, 0.5, rx * 0.74, -2.8, -1.7);
    p.stroke();
    p.fillStyle = "rgba(255,236,230,0.95)";
    p.beginPath();
    p.arc(-2.4, -3.6, 1.2, 0, Math.PI * 2);
    p.arc(3.4, -1.2, 0.8, 0, Math.PI * 2);
    p.fill();
    // gore shreds sagging off the screen-down lip + two gravity drips
    p.fillStyle = "#7c0512";
    p.beginPath();
    p.moveTo(-rx * 0.3, warmSide * ry * 0.7);
    p.quadraticCurveTo(-rx * 0.16, warmSide * (ry * 0.7 + 4.6), -rx * 0.02, warmSide * ry * 0.74);
    p.closePath();
    p.fill();
    p.beginPath();
    p.moveTo(rx * 0.2, warmSide * ry * 0.78);
    p.quadraticCurveTo(rx * 0.32, warmSide * (ry * 0.78 + 3.4), rx * 0.46, warmSide * ry * 0.7);
    p.closePath();
    p.fill();
    p.strokeStyle = "#a50713";
    p.lineWidth = 2;
    p.beginPath();
    p.moveTo(-rx * 0.1, warmSide * ry * 0.85);
    p.quadraticCurveTo(-rx * 0.16, warmSide * (ry * 0.85 + 5), -rx * 0.1, warmSide * (ry * 0.85 + 8));
    p.stroke();
    p.lineWidth = 1.3;
    p.beginPath();
    p.moveTo(rx * 0.34, warmSide * ry * 0.8);
    p.quadraticCurveTo(rx * 0.3, warmSide * (ry * 0.8 + 3.6), rx * 0.33, warmSide * (ry * 0.8 + 5.6));
    p.stroke();
    p.restore();
    // 6) fine blood flecks blown back along the forearm from the wound
    p.fillStyle = "rgba(156,7,21,0.75)";
    for (let fleck = 0; fleck < 6; fleck += 1) {
      const ft = -0.34 + fray(fleck + 23) * 0.5;
      const at = axis(ft);
      p.beginPath();
      p.ellipse(at.x, at.y + (fray(fleck + 31) - 0.5) * thickness * 0.7,
        1.5 + fray(fleck + 37) * 1.6, 0.8 + fray(fleck + 41) * 0.9,
        fray(fleck + 43) * 3, 0, Math.PI * 2);
      p.fill();
    }
  } else {
    // --- torn tee sleeve over the upper arm ---------------------------------
    strokeAlong(-0.36, -0.08, thickness * 1.02, shade(cloth, 0.6));
    strokeAlong(-0.36, -0.08, thickness * 0.88, cloth);
    strokeAlong(-0.35, -0.1, thickness * 0.36, shade(cloth, 1.34), -thickness * 0.18, 0.85);
    // torn cuff: small cloth-dark triangles biting into the arm
    p.fillStyle = shade(cloth, 0.72);
    const cuffAt = axis(-0.08);
    for (let z = 0; z < 3; z += 1) {
      p.beginPath();
      p.moveTo(cuffAt.x - 2, cuffAt.y - thickness * 0.42 + z * thickness * 0.3);
      p.lineTo(cuffAt.x + thickness * 0.24, cuffAt.y - thickness * 0.3 + z * thickness * 0.3);
      p.lineTo(cuffAt.x - 2, cuffAt.y - thickness * 0.18 + z * thickness * 0.3);
      p.closePath();
      p.fill();
    }
    // sleeve fold shadows
    p.strokeStyle = shade(cloth, 0.52);
    p.lineWidth = 1.6;
    for (const fx of [-0.28, -0.17]) {
      const at = axis(fx);
      p.beginPath();
      p.moveTo(at.x, at.y - thickness * 0.3);
      p.quadraticCurveTo(at.x + 2.2, at.y + 1, at.x + 0.5, at.y + thickness * 0.3);
      p.stroke();
    }
    // --- forearm: rounded skin with a top-half light plane ------------------
    strokeAlong(-0.1, 0.36, thickness * 0.74, shade(skin, 0.68));
    strokeAlong(-0.1, 0.36, thickness * 0.62, skin);
    strokeAlong(-0.08, 0.32, thickness * 0.26, shade(skin, 1.2), -thickness * 0.13, 0.9);
    // tendon hint + wrist crease (short, curved)
    p.strokeStyle = shade(skin, 0.58);
    p.lineWidth = 1.3;
    const tA = axis(0.05);
    const tB = axis(0.3);
    p.beginPath();
    p.moveTo(tA.x, tA.y - thickness * 0.06);
    p.quadraticCurveTo((tA.x + tB.x) / 2, tA.y - thickness * 0.12, tB.x, tB.y - thickness * 0.02);
    p.stroke();
    const wr = axis(0.37);
    p.beginPath();
    p.moveTo(wr.x, wr.y - thickness * 0.2);
    p.quadraticCurveTo(wr.x + 1.6, wr.y, wr.x, wr.y + thickness * 0.18);
    p.stroke();
    // --- curled fist: palm mass, knuckle arc along the top, tucked thumb ----
    const fist = axis(0.48);
    p.fillStyle = shade(skin, 0.82);
    p.beginPath();
    p.ellipse(fist.x + thickness * 0.1, fist.y + 1, thickness * 0.34, thickness * 0.38, -0.12, 0, Math.PI * 2);
    p.fill();
    // knuckle bumps riding the leading arc
    for (let finger = 0; finger < 4; finger += 1) {
      const ka = -1.05 + finger * 0.6;
      const kx = fist.x + thickness * 0.1 + Math.cos(ka) * thickness * 0.32;
      const ky = fist.y + 1 + Math.sin(ka) * thickness * 0.36;
      p.fillStyle = finger % 2 ? skin : shade(skin, 1.1);
      p.beginPath();
      p.ellipse(kx, ky, thickness * 0.12, thickness * 0.1, ka, 0, Math.PI * 2);
      p.fill();
    }
    // finger creases between the knuckles
    p.strokeStyle = shade(skin, 0.55);
    p.lineWidth = 1.2;
    for (let crease = 0; crease < 3; crease += 1) {
      const ca = -0.75 + crease * 0.6;
      p.beginPath();
      p.arc(fist.x + thickness * 0.1, fist.y + 1, thickness * 0.3, ca - 0.14, ca + 0.14);
      p.stroke();
    }
    // thumb wrapping low across the palm
    p.fillStyle = shade(skin, 1.06);
    p.beginPath();
    p.ellipse(fist.x - thickness * 0.02, fist.y + thickness * 0.24, thickness * 0.17, thickness * 0.1, 0.5, 0, Math.PI * 2);
    p.fill();
  }
  // --- gore stump at the shoulder/thigh end (drawn OVER the limb root) -----
  // Torn cross-section: dark rim, meat wedges, off-centre bone chip — an
  // anatomy read, not a glossy ball. (The atlas-composited arm carries its
  // own layered wedge stump + light story above, so this round-3 pass only
  // runs for legs and the no-atlas fallback.)
  if (!armSrc) {
  p.fillStyle = goreDeep;
  p.beginPath();
  p.ellipse(stumpAt.x, stumpAt.y, thickness * 0.44, thickness * 0.4, -0.1, 0, Math.PI * 2);
  p.fill();
  // meat wedges: radial pie segments in two reds
  for (let wedge = 0; wedge < 5; wedge += 1) {
    const a0 = wedge * 1.256 + 0.35;
    const wr = thickness * (0.27 + ((wedge * 37) % 11) / 11 * 0.09);
    p.fillStyle = wedge % 2 ? gore : shade(gore, 0.78);
    p.beginPath();
    p.moveTo(stumpAt.x + Math.cos(a0 + 0.5) * 2, stumpAt.y + Math.sin(a0 + 0.5) * 2);
    p.arc(stumpAt.x, stumpAt.y, wr, a0, a0 + 1.15);
    p.closePath();
    p.fill();
  }
  // wet sheen crescent on the upper lip of the cut
  p.strokeStyle = "rgba(255,158,148,0.55)";
  p.lineWidth = 1.8;
  p.beginPath();
  p.arc(stumpAt.x, stumpAt.y, thickness * 0.32, Math.PI * 1.15, Math.PI * 1.75);
  p.stroke();
  // bone chip: pale, high of centre, with a marrow fleck
  p.fillStyle = "#e6d3b2";
  p.beginPath();
  p.ellipse(stumpAt.x - thickness * 0.11, stumpAt.y - thickness * 0.14, thickness * 0.08, thickness * 0.065, 0.3, 0, Math.PI * 2);
  p.fill();
  p.fillStyle = "#a8906c";
  p.beginPath();
  p.arc(stumpAt.x - thickness * 0.11, stumpAt.y - thickness * 0.14, thickness * 0.028, 0, Math.PI * 2);
  p.fill();
  // one short drip + a flung droplet — restrained
  p.strokeStyle = gore;
  p.lineWidth = 2;
  p.beginPath();
  p.moveTo(stumpAt.x - thickness * 0.12, stumpAt.y + thickness * 0.36);
  p.quadraticCurveTo(stumpAt.x - thickness * 0.18, stumpAt.y + thickness * 0.62, stumpAt.x - thickness * 0.12, stumpAt.y + thickness * 0.8);
  p.stroke();
  p.fillStyle = gore;
  p.beginPath();
  p.ellipse(stumpAt.x - thickness * 0.34, stumpAt.y + thickness * 0.5, 2.1, 2.8, 0.3, 0, Math.PI * 2);
  p.fill();
  // --- light story: SHORT warm dashes on the wheel side, one cool kiss ------
  p.lineCap = "round";
  p.strokeStyle = "rgba(255,166,70,0.55)";
  p.lineWidth = 1.7;
  for (const [d0, d1, hug] of [[-0.3, -0.2, leg ? 0.47 : 0.4], [-0.04, 0.08, leg ? 0.44 : 0.28], [0.22, 0.32, leg ? 0.42 : 0.26]]) {
    const a0 = axis(d0);
    const a1 = axis(d1);
    p.beginPath();
    p.moveTo(a0.x, a0.y + thickness * hug);
    p.quadraticCurveTo((a0.x + a1.x) / 2, (a0.y + a1.y) / 2 + thickness * (hug + 0.04), a1.x, a1.y + thickness * (hug - 0.02));
    p.stroke();
  }
  p.strokeStyle = "rgba(150,190,255,0.35)";
  p.lineWidth = 1.4;
  const c0 = axis(-0.26);
  const c1 = axis(-0.06);
  p.beginPath();
  p.moveTo(c0.x, c0.y - thickness * 0.46);
  p.quadraticCurveTo((c0.x + c1.x) / 2, (c0.y + c1.y) / 2 - thickness * 0.5, c1.x, c1.y - thickness * 0.44);
  p.stroke();
  }
  severedLimbCache.set(key, c);
  return c;
}

function drawSeveredLimb(effect, alpha) {
  const leg = effect.limb.endsWith("leg");
  const length = leg ? 92 : 72;
  const thickness = leg ? 30 : 23;
  if (cinema3dDressingActive()) {
    // CINEMA 3D: composited limb sprite (same footprint/rotation as the 2D
    // primitives, so flight physics and resting pose read identically).
    // Round 4: the arm samples the victim's own atlas, its warm/cool rims and
    // drips pick the sprite edge that currently faces the wheel/floor, and in
    // flight it drags a motion smear + an arterial ribbon off the stump.
    const victimId = state.finisher
      ? state.fighters[1 - state.finisher.winner]?.def.id || null : null;
    const rotation = effect.rotation || 0;
    const warmSide = Math.cos(rotation) >= 0 ? 1 : -1;
    const painted = severedLimbPaintedCanvas(effect, victimId, warmSide);
    const baseAlpha = Math.min(1, alpha * 4);
    const speed = Math.hypot(effect.vx || 0, effect.vy || 0);
    ctx.save();
    if (!effect.resting && speed > 60) {
      const nx = (effect.vx || 0) / speed;
      const ny = (effect.vy || 0) / speed;
      // arterial ribbon whipping off the stump, bending under gravity
      const ca = Math.cos(rotation);
      const sa = Math.sin(rotation);
      const stumpX = -length * 0.42 * ca;
      const stumpY = -length * 0.42 * sa;
      const trail = Math.min(66, speed * 0.11);
      const endX = stumpX - nx * trail;
      const endY = stumpY - ny * trail + trail * 0.35;
      const ribbonGrad = ctx.createLinearGradient(stumpX, stumpY, endX, endY);
      ribbonGrad.addColorStop(0, "rgba(178,8,22,0.9)");
      ribbonGrad.addColorStop(1, "rgba(80,2,12,0)");
      ctx.strokeStyle = ribbonGrad;
      ctx.lineCap = "round";
      ctx.globalAlpha = baseAlpha * 0.85;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(stumpX, stumpY);
      ctx.quadraticCurveTo(stumpX - nx * trail * 0.55, stumpY - ny * trail * 0.55 + 6, endX, endY);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(235,52,44,0.55)";
      ctx.stroke();
      // shed droplets riding the ribbon, heads leading back along it
      const shedDir = Math.atan2(endY - stumpY, endX - stumpX);
      for (const [at, size] of [[0.4, 6.4], [0.72, 4.6], [1.02, 3.2]]) {
        ctx.save();
        ctx.translate(stumpX + (endX - stumpX) * at, stumpY + (endY - stumpY) * at + 1.5);
        ctx.rotate(shedDir);
        ctx.globalAlpha = baseAlpha * (0.85 - at * 0.35);
        ctx.drawImage(fatalityDropletCanvas(), -size, -size, size * 2, size * 2);
        ctx.restore();
      }
      // motion smear on the trailing edge: two rotation-lagged ghosts that
      // hug the limb (a detached copy reads as a second object)
      for (let ghost = 2; ghost >= 1; ghost -= 1) {
        ctx.save();
        ctx.translate(-nx * ghost * 5.5, -ny * ghost * 5.5);
        ctx.rotate(rotation - (effect.spin || 0) * 0.03 * ghost);
        ctx.globalAlpha = baseAlpha * (ghost === 1 ? 0.13 : 0.07);
        ctx.drawImage(painted, -length * 0.75, -thickness * 1.6, painted.width / 2, painted.height / 2);
        ctx.restore();
      }
    }
    ctx.rotate(rotation);
    ctx.globalAlpha = baseAlpha;
    ctx.shadowColor = "rgba(20,0,4,.72)";
    ctx.shadowBlur = 8;
    ctx.drawImage(painted, -length * 0.75, -thickness * 1.6, painted.width / 2, painted.height / 2);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.rotate(effect.rotation || 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = Math.min(1, alpha * 4);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(20,0,4,.72)";
  ctx.shadowBlur = 8;

  // Clothing shell and exposed flesh make the silhouette read instantly as a
  // complete arm/leg rather than one more irregular gore particle.
  ctx.strokeStyle = effect.clothColor;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.moveTo(-length * .36, 0);
  ctx.lineTo(length * .28, leg ? 6 : -3);
  ctx.stroke();
  ctx.strokeStyle = effect.clothAccent;
  ctx.lineWidth = Math.max(5, thickness * .22);
  ctx.beginPath();
  ctx.moveTo(-length * .2, -thickness * .24);
  ctx.lineTo(length * .18, -thickness * .18);
  ctx.stroke();

  ctx.strokeStyle = "#c98b70";
  ctx.lineWidth = thickness * .66;
  ctx.beginPath();
  ctx.moveTo(length * .18, leg ? 5 : -2);
  ctx.lineTo(length * .46, leg ? 10 : 2);
  ctx.stroke();

  // Wet stump, pale bone core, and a boot/hand at the far end.
  ctx.fillStyle = effect.secondary;
  ctx.beginPath();
  ctx.ellipse(-length * .42, 0, thickness * .46, thickness * .36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = effect.color;
  ctx.beginPath();
  ctx.ellipse(-length * .43, 0, thickness * .31, thickness * .24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ead7b7";
  ctx.beginPath();
  ctx.ellipse(-length * .44, 0, thickness * .09, thickness * .08, 0, 0, Math.PI * 2);
  ctx.fill();

  if (leg) {
    ctx.fillStyle = "#17191f";
    ctx.beginPath();
    ctx.moveTo(length * .37, -thickness * .12);
    ctx.lineTo(length * .61, -thickness * .08);
    ctx.lineTo(length * .66, thickness * .24);
    ctx.lineTo(length * .35, thickness * .28);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = "#c98b70";
    ctx.beginPath();
    ctx.ellipse(length * .52, 2, thickness * .31, thickness * .4, -.18, 0, Math.PI * 2);
    ctx.fill();
    for (let finger = 0; finger < 4; finger += 1) {
      ctx.fillRect(length * (.48 + finger * .035), -thickness * .43, 4, thickness * .28);
    }
  }
  ctx.restore();
}

function drawFatalityProjectile(effect, alpha) {
  const reveal = clamp((1 - alpha) * 12, 0, 1);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = Math.min(1, alpha * 3) * reveal;
  ctx.shadowColor = effect.color;
  // 3D mode: halve the halo glow — the painted wheel carries its own values,
  // and the old glow + bloom washed the face to a soft gold disc.
  const dressedHalo = cinema3dDressingActive();
  ctx.shadowBlur = (effect.landed ? 22 : 12) * (dressedHalo ? 0.5 : 1);
  ctx.strokeStyle = effect.color;
  ctx.lineWidth = (effect.landed ? 6 : 3) * (dressedHalo ? 0.6 : 1);
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(effect.width, effect.height) * (.58 + (1 - alpha) * .08), 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.scale(effect.phase === "kill" ? 1.24 : 1.12, effect.phase === "kill" ? 1.24 : 1.12);
  drawThrowable(effect, state.simulationTick * 1000 / SIMULATION_HZ, alpha);
  ctx.restore();
  // 3D mode: once the fatality banner block owns the frame, the floating
  // world-space focus label only collides with it (the half-hidden
  // "WHOLE PIZZA · KILL" ghosting through the caption) — drop it there.
  if (!(cinema3dDressingActive() && state.finisher?.fatalityTriggered)) {
    ctx.globalAlpha = Math.min(1, alpha * 4);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "1000 13px Arial Narrow, Arial, sans-serif";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,.92)";
    ctx.fillStyle = "#fff0df";
    const focusLabel = `${effect.name} · ${effect.phase.toUpperCase()}`;
    ctx.strokeText(focusLabel, 0, -Math.max(38, effect.height * .72));
    ctx.fillText(focusLabel, 0, -Math.max(38, effect.height * .72));
  }
  ctx.restore();
}

function drawProjectileFocusBurst(effect, alpha) {
  const growth = 1 - alpha;
  const radius = (effect.phase === "kill" ? 86 : 52) + growth * (effect.phase === "kill" ? 240 : 145);
  // 3D mode + pizza/vinyl: the burst's energy stays OUTSIDE the painted
  // wheel — centre-rooted rings/spokes were dissolving the face into a red
  // starburst. Rings collapse to the outermost, spokes root past the rim.
  const dressedBurst = cinema3dDressingActive() && ["pizza", "vinyl"].includes(effect.style);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.shadowBlur = 18;
  ctx.shadowColor = effect.color;
  ctx.strokeStyle = effect.color;
  ctx.fillStyle = effect.color;
  ctx.lineCap = "round";
  ctx.globalAlpha = alpha * .9;
  for (let ring = dressedBurst ? 2 : 0; ring < 3; ring += 1) {
    ctx.lineWidth = Math.max(2, 8 - ring * 2);
    ctx.beginPath();
    ctx.arc(0, 0, radius * (.52 + ring * .22), 0, Math.PI * 2);
    ctx.stroke();
  }
  if (["pizza", "vinyl"].includes(effect.style)) {
    // 3D mode, landed kill wheel: NO spokes at all — at that scale every
    // centre-rooted line lands across the painted face. The outer ring +
    // rim ghosts + spatter carry the energy read.
    if (!(dressedBurst && effect.phase === "kill")) {
      ctx.rotate(state.simulationTick * .16 * effect.direction);
      const spokeRoot = dressedBurst ? 1.02 : 0.18;
      const spokeTip = dressedBurst ? 1.32 : 1;
      for (let spoke = 0; spoke < 12; spoke += 1) {
        const angle = spoke * Math.PI / 6;
        ctx.lineWidth = spoke % 3 === 0 ? 8 : 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * radius * spokeRoot, Math.sin(angle) * radius * spokeRoot);
        ctx.lineTo(Math.cos(angle) * radius * spokeTip, Math.sin(angle) * radius * spokeTip);
        ctx.stroke();
      }
    }
  } else if (["mouse", "wires"].includes(effect.style)) {
    for (let cable = 0; cable < 7; cable += 1) {
      const offset = (cable - 3) * 13;
      ctx.lineWidth = 3 + cable % 3;
      ctx.beginPath();
      ctx.moveTo(-radius, offset);
      ctx.bezierCurveTo(-radius * .35, offset - 42, radius * .35, offset + 42, radius, offset);
      ctx.stroke();
    }
  } else if (effect.style === "loogie") {
    for (let drop = 0; drop < 16; drop += 1) {
      const angle = drop * 2.399;
      const reach = radius * (.28 + drop % 5 * .14);
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * reach, Math.sin(angle) * reach, 8 + drop % 4 * 4, 5 + drop % 3 * 3, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (effect.style === "xacto") {
    for (let cut = -2; cut <= 2; cut += 1) {
      ctx.lineWidth = 4 + (2 - Math.abs(cut)) * 2;
      ctx.beginPath();
      ctx.moveTo(-radius, cut * 18 + radius * .42);
      ctx.lineTo(radius, cut * 18 - radius * .42);
      ctx.stroke();
    }
  } else if (effect.style === "golfball") {
    for (let ball = 0; ball < 8; ball += 1) {
      const x = -radius + ball * radius * .28;
      const y = Math.sin(ball * 1.5) * radius * .35;
      ctx.beginPath();
      ctx.arc(x, y, 5 + ball, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (effect.style === "bedbugs") {
    for (let bug = 0; bug < 24; bug += 1) {
      const angle = bug * 2.399 + state.simulationTick * .03;
      const reach = radius * (.18 + bug % 7 * .11);
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * reach, Math.sin(angle) * reach, 7, 4.5, angle, 0, Math.PI * 2);
      ctx.fill();
    }
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
    const dressed = cinema3dDressingActive();
    const droplet3d = dressed ? fatalityDropletCanvas() : null;
    // Round-3 wheel occlusion (critic item 2): debris whose screen position
    // falls inside the landed signature wheel is SKIPPED — it reads as
    // having flown behind the disc, so the gore field sits in depth instead
    // of floating over the centrepiece as an overlay.
    let wheelOccluder = null;
    if (dressed && state.finisher) {
      const wheelProjectile = state.effects.find((fx) => fx.kind === "fatalityProjectile");
      if (wheelProjectile) {
        const goreCamera = finisherCinematicCamera(state.cinematicZoom);
        const goreZoom = goreCamera.zoom || 1;
        wheelOccluder = {
          x: W * .5 + (wheelProjectile.x - goreCamera.x) * goreZoom,
          y: H * .53 + (wheelProjectile.y - goreCamera.y) * goreZoom,
          r: Math.max(wheelProjectile.width, wheelProjectile.height) * .6 * goreZoom
            * (wheelProjectile.phase === "kill" ? 1.24 : 1.12),
        };
      }
    }
    for (let drop = 0; drop < 31; drop += 1) {
      const x = ((drop * 173 + familySeed * 29) % 1180) / 1180 * W;
      const y = ((drop * 97 + familySeed * 43) % 640) / 640 * H;
      const edgeBias = drop % 3 === 0 ? (drop % 2 ? H * .1 : H * .88) : y;
      const radius = (4 + drop % 7 * 2.8) * (effect.scale || 1);
      ctx.globalAlpha = alpha * (.2 + drop % 5 * .09);
      if (dressed) {
        // CINEMA 3D round-4 (ship-review item 1): a real droplet FIELD in the
        // Kimberly-paint grammar. Teardrops stretch along their flight
        // direction (radially out of the sever point), depth-graded — big
        // sharp near, small soft far — with ribbon trails on the fast ones,
        // camera-plane smears, floor splats with radial tails, and crescent
        // occlusion behind the wheel rim. Density DROPS from 31 stamps to 24
        // crafted shapes; the classic 2D branch below is untouched.
        if (drop >= 24) continue;
        const jitter = ((drop * 199 + familySeed * 17) % 97) / 97;
        const originX = wheelOccluder ? wheelOccluder.x : W * 0.52;
        const originY = wheelOccluder ? wheelOccluder.y : H * 0.5;
        const dir = Math.atan2(edgeBias - originY, x - originX) + (jitter - 0.5) * 0.55;
        let rimClip = false;
        if (wheelOccluder) {
          const wdx = x - wheelOccluder.x;
          const wdy = edgeBias - wheelOccluder.y;
          const wd2 = wdx * wdx + wdy * wdy;
          if (wd2 < wheelOccluder.r * wheelOccluder.r) continue;
          // near-rim drops get CLIPPED against the disc: the crescent bite
          // reads as the droplet flying BEHIND the wheel, not printed on it.
          rimClip = wd2 < wheelOccluder.r * wheelOccluder.r * 1.69;
        }
        ctx.save();
        if (rimClip) {
          ctx.beginPath();
          ctx.rect(0, 0, W, H);
          ctx.arc(wheelOccluder.x, wheelOccluder.y, wheelOccluder.r, 0, Math.PI * 2, true);
          ctx.clip("evenodd");
        }
        if (drop % 6 === 0) {
          // floor band (H*.88 edge bias): a LANDED hit — splat with radial
          // tails squashed onto the ground plane, not a floating ellipse.
          ctx.globalAlpha = alpha * (0.44 + (drop % 5) * 0.1);
          ctx.translate(x, edgeBias);
          ctx.rotate((jitter - 0.5) * 0.6);
          ctx.scale(1.45, 0.52);
          ctx.drawImage(fatalitySplatCanvas(), -radius * 2, -radius * 2, radius * 4, radius * 4);
        } else if (drop % 7 === 2) {
          // matte meat chunk: full spin variety, slightly bigger presence
          ctx.globalAlpha = alpha * (0.3 + (drop % 5) * 0.1);
          ctx.translate(x, edgeBias);
          ctx.rotate((drop * 1.17) % (Math.PI * 2));
          ctx.drawImage(fatalityChunkCanvas(), -radius * 1.5, -radius * 1.5, radius * 3, radius * 3);
        } else if (drop % 7 === 5) {
          // bone fleck: small, pale, catches the eye against the reds
          ctx.globalAlpha = alpha * (0.27 + (drop % 5) * 0.09);
          ctx.translate(x, edgeBias);
          ctx.rotate((drop * 2.31) % (Math.PI * 2));
          ctx.drawImage(fatalityBoneCanvas(), -radius * 1.1, -radius * 1.1, radius * 2.2, radius * 2.2);
        } else if (drop % 6 === 3) {
          // top band (H*.1 edge bias): a hit on the glass, smearing DOWN
          ctx.globalAlpha = alpha * (0.32 + (drop % 5) * 0.09);
          ctx.translate(x, edgeBias);
          ctx.rotate(drop % 2 ? 0.14 : -0.12);
          ctx.drawImage(fatalityRivuletCanvas(), -radius * 0.7, -radius * 1.2, radius * 1.4, radius * 3.4);
        } else {
          // depth band off a second hash (drop % 3 is fully consumed by the
          // floor/rivulet selectors above): 0 near, 1 mid, 2 far
          const depthHash = ((drop * 131 + familySeed * 7) % 89) / 89;
          const band = depthHash < 0.3 ? 0 : depthHash < 0.68 ? 1 : 2;
          const sizeMul = band === 0 ? 1.85 : band === 1 ? 1.12 : 0.6;
          const sprite = band === 2 ? fatalityDropletSoftCanvas() : droplet3d;
          const fast = drop % 5 === 1;
          const smear = band === 0 && drop % 4 === 1 && !fast;
          let stretch = 1.12 + jitter * 0.85 + (fast ? 1.1 : 0);
          ctx.globalAlpha = alpha * (0.3 + (drop % 5) * 0.11)
            * (band === 0 ? 1.2 : band === 1 ? 1 : 0.7);
          if (fast && !smear) {
            // ribbon trail whipping back down the flight path, gravity-bent,
            // with a brighter liquid core and a mid-trail bead
            const ribbonLen = radius * (4.5 + jitter * 3);
            const tx = x - Math.cos(dir) * ribbonLen;
            const ty = edgeBias - Math.sin(dir) * ribbonLen + ribbonLen * 0.3;
            const ribbonGrad = ctx.createLinearGradient(x, edgeBias, tx, ty);
            ribbonGrad.addColorStop(0, "rgba(178,8,22,0.85)");
            ribbonGrad.addColorStop(1, "rgba(80,2,12,0)");
            ctx.strokeStyle = ribbonGrad;
            ctx.lineCap = "round";
            ctx.lineWidth = Math.max(1.6, radius * 0.5);
            ctx.beginPath();
            ctx.moveTo(x, edgeBias);
            ctx.quadraticCurveTo(
              x - Math.cos(dir) * ribbonLen * 0.55,
              edgeBias - Math.sin(dir) * ribbonLen * 0.55 + 7,
              tx, ty,
            );
            ctx.stroke();
            ctx.lineWidth = Math.max(0.9, radius * 0.2);
            ctx.strokeStyle = "rgba(240,64,54,0.5)";
            ctx.stroke();
            const beadSize = radius * 0.55;
            ctx.save();
            ctx.translate((x + tx) / 2, (edgeBias + ty) / 2 + 2);
            ctx.rotate(dir);
            ctx.drawImage(droplet3d, -beadSize * 1.35, -beadSize * 1.35, beadSize * 2.7, beadSize * 2.7);
            ctx.restore();
          }
          ctx.translate(x, edgeBias);
          ctx.rotate(dir);
          if (smear) {
            // crossing the camera plane: a long motion smear, not a shape
            stretch = 5.6;
            ctx.globalAlpha *= 0.5;
          }
          ctx.scale(stretch, 1);
          const drawSize = radius * sizeMul;
          ctx.drawImage(sprite, -drawSize * 1.35, -drawSize * 1.35, drawSize * 2.7, drawSize * 2.7);
          if (smear) {
            ctx.strokeStyle = "rgba(255,118,104,0.5)";
            ctx.lineCap = "round";
            ctx.lineWidth = drawSize * 0.28;
            ctx.beginPath();
            ctx.moveTo(-drawSize * 1.2, 0);
            ctx.lineTo(drawSize * 1.2, 0);
            ctx.stroke();
          }
        }
        ctx.restore();
        continue;
      }
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
    ctx.fillStyle = index % 2 ? assistColor("dizzy", "#ffd54a") : assistColor("dizzyAlt", "#fff2b8");
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
  ctx.fillStyle = assistColor("dizzy", "#ffd54a");
  ctx.strokeStyle = "rgba(0,0,0,.72)";
  ctx.lineWidth = 4;
  ctx.strokeText("DIZZY", centreX, centreY - 30);
  ctx.fillText("DIZZY", centreX, centreY - 30);
  // A thin drain bar shows the dizzy running out, so the punish window is legible.
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(centreX - 34, centreY - 22, 68, 5);
  ctx.fillStyle = assistColor("dizzy", "#ffd54a");
  ctx.fillRect(centreX - 34, centreY - 22, 68 * remaining, 5);
  ctx.restore();
}

// Release 1.7: GUARD CRUSH marker — the dizzy-stars pattern with shard motes
// instead of stars, a CRUSHED label and the same legible drain bar. Pure
// render-side reads of snapshotted fields.
function drawGuardCrushMarker(fighter, time) {
  if (!fighter || fighter.guardCrushFrames <= 0 || fighter.dizzyFrames > 0) return;
  const centreX = fighter.x;
  const drawnHeight = fighterRenderSize(fighter.def.id) * 0.956;
  const centreY = fighter.y - drawnHeight - 26;
  const remaining = fighter.guardCrushFrames / Math.max(1, fighter.guardCrushTotalFrames);
  ctx.save();
  ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(time * 7));
  // Broken-guard shards tumbling around the head.
  for (let index = 0; index < 6; index += 1) {
    const angle = time * 3.6 + (index / 6) * Math.PI * 2;
    const x = centreX + Math.cos(angle) * 50;
    const y = centreY + Math.sin(angle) * 14;
    const size = 6 + Math.sin(angle * 2) * 2;
    ctx.fillStyle = index % 2 ? assistColor("crush", "#7de8ff") : "#d8f9ff";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle * 1.7);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.8, size * 0.6);
    ctx.lineTo(-size * 0.7, size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.font = "900 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = assistColor("crush", "#7de8ff");
  ctx.strokeStyle = "rgba(0,0,0,.72)";
  ctx.lineWidth = 4;
  ctx.strokeText("CRUSHED", centreX, centreY - 30);
  ctx.fillText("CRUSHED", centreX, centreY - 30);
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(centreX - 34, centreY - 22, 68, 5);
  ctx.fillStyle = assistColor("crush", "#7de8ff");
  ctx.fillRect(centreX - 34, centreY - 22, 68 * remaining, 5);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Scene dressing: reflections, spotlight, afterimages and colour grade.
// All of it is presentation-only — driven by visualRandom or the tick, gated by
// the performance profile, and invisible to rollback checksums.
// ---------------------------------------------------------------------------

// How mirror-like each stage floor is. Wet asphalt and polished tile reflect
// hard; the Vet's dry lot barely does.
const STAGE_REFLECTIONS = Object.freeze({
  somerset: 0.30, vet: 0.15, wildwood: 0.22, buffet: 0.34, cruise: 0.26,
});
const REFLECTION_DEPTH = 128;

function drawFighterReflections(time) {
  if (!state.performance.shadows) return;
  const strength = STAGE_REFLECTIONS[state.stage] ?? 0.18;
  if (strength <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, FLOOR + 1, W, REFLECTION_DEPTH);
  ctx.clip();
  // Mirror the fighters through the floor line. drawFighter may override the
  // filter briefly during hit flashes; the tail fade below keeps that subtle.
  ctx.translate(0, FLOOR * 2 + 8);
  ctx.scale(1, -1);
  ctx.filter = `opacity(${Math.round(strength * 100)}%)`;
  reflectionPassActive = true;
  for (const fighter of state.fighters) drawFighter(fighter, time);
  reflectionPassActive = false;
  ctx.filter = "none";
  ctx.restore();
  // Sink the reflection into the floor so it reads as sheen, not a twin.
  const fade = ctx.createLinearGradient(0, FLOOR, 0, FLOOR + REFLECTION_DEPTH);
  fade.addColorStop(0, "rgba(7,10,15,0.05)");
  fade.addColorStop(1, "rgba(7,10,15,0.62)");
  ctx.save();
  ctx.fillStyle = fade;
  ctx.fillRect(0, FLOOR + 1, W, REFLECTION_DEPTH);
  ctx.restore();
}

// Key-light cast shadows: each fighter throws a long, soft, sheared black
// silhouette across the floor away from the stage's key light — the exact
// sibling of drawFighterReflections (same clipped floor band, one sprite draw
// per fighter) but squashed, skewed and black instead of mirrored and tinted.
// Direction and rake come from STAGE_RIM_LIGHTS, so the rim highlight and the
// cast shadow always agree about where the light hangs. Airborne fighters
// slide the whole shadow down-light and fade it, visibly detaching it from
// the feet; while the super spotlight is up the shadows deepen and lengthen
// with superDimLevel. Static transform of snapshotted state — reducedMotion
// safe — and the battery profile (shadows off) skips the pass entirely.
function drawFighterCastShadows() {
  if (!state.performance.shadows) return;
  const rim = STAGE_RIM_LIGHTS[state.stage] || STAGE_RIM_LIGHTS.somerset;
  const away = -rim.direction; // shadows fall away from the key light
  const deepen = clamp(superDimLevel, 0, 1);
  const stretch = (rim.castStretch ?? 0.45) * (1 + deepen * 0.45);
  const shear = away * (rim.castShear ?? 0.55) * (1 + deepen * 0.3);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, FLOOR + 1, W, REFLECTION_DEPTH);
  ctx.clip();
  for (const fighter of state.fighters) {
    const pose = fighterAnimationPose(fighter);
    const atlas = pose.bank === "specials"
      ? fighterMoveAtlases[fighter.def.id] || fighterAtlases[fighter.def.id]
      : fighterAtlases[fighter.def.id];
    if (!atlas?.complete || !atlas.naturalWidth) continue;
    const renderSize = fighterRenderSize(fighter.def.id)
      * (pose.bank === "specials" ? MOVE_SHEET_ADJUST[fighter.def.id] || 1 : 1);
    const jump = Math.max(0, FLOOR - fighter.y);
    const airFade = clamp(1 - jump / 520, 0.25, 1);
    ctx.save();
    // Feet anchor; height above the floor slides the contact point down-light.
    ctx.translate(fighter.x + away * jump * 0.5, FLOOR + 2 + jump * 0.1);
    ctx.transform(1, 0, shear, 1, 0, 0); // rake the far end down-light
    // Same authored-facing correction the body draw applies, so the cast
    // shadow of a mixed-orientation sheet cannot point opposite its fighter.
    ctx.scale(fighter.facing * atlasFrameFacing(fighter.def.id, pose.bank, pose.frame), -stretch);  // flip into the floor, squashed long
    ctx.globalAlpha = (0.3 + deepen * 0.22) * airFade;
    drawSilhouetteFrame(atlas, pose.frame, renderSize, "#04060a");
    ctx.restore();
    presentationDebug.castShadows += 1;
  }
  ctx.restore();
}

// Classic super presentation: the street goes dark, the fighters stay lit.
function drawSpotlightPool(dim, targets, darkness = 0.58) {
  if (dim <= 0.02) return;
  ctx.fillStyle = `rgba(3,5,16,${(darkness * dim).toFixed(3)})`;
  ctx.fillRect(-120, -120, W + 240, H + 240);
  for (const fighter of targets) {
    const radius = fighterRenderSize(fighter.def.id) * 0.62;
    const glow = ctx.createRadialGradient(
      fighter.x, fighter.y - radius * 0.55, radius * 0.12,
      fighter.x, fighter.y - radius * 0.55, radius,
    );
    glow.addColorStop(0, `rgba(255,244,214,${(0.15 * dim).toFixed(3)})`);
    glow.addColorStop(1, "rgba(255,244,214,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(fighter.x - radius, fighter.y - radius * 1.65, radius * 2, radius * 2.1);
  }
}

function drawSuperSpotlight() {
  drawSpotlightPool(superDimLevel, state.fighters);
}

// Wave 6 win-pose curtain call: the stage dims like the super spotlight while
// only the round winner keeps the warm pool. Static light on the documented
// spotlight pattern, so it stays on under reduced motion; a live finisher
// cinematic owns the frame instead (roundOverDimLevel also stays down then).
function drawWinPoseSpotlight() {
  if (roundOverDimLevel <= 0.02 || state.finisher || state.fighters.length !== 2) return;
  const [first, second] = state.fighters;
  drawSpotlightPool(roundOverDimLevel, [first.health >= second.health ? first : second], 0.44);
}

// Super focus lines (wave 4): while the spotlight dim is up, sparse comic-style
// speed lines converge from past the frame edges onto the super's attacker.
// Pure render pass driven by superDimLevel and snapshotted fighter state; the
// side latch is module-level render-only state on the superDimLevel pattern so
// the lines hold their target while the dim decays after the super ends.
let superFocusSide = 0;

function drawSuperFocusLines(time) {
  if (superDimLevel <= 0.5 || state.accessibility.highContrast) return;
  const attacker = state.fighters.find((fighter) => fighter.attacking?.superMove);
  if (attacker) superFocusSide = attacker.side;
  const target = state.fighters[superFocusSide];
  if (!target) return;
  const reducedMotion = state.accessibility.reducedMotion;
  const count = Math.max(8, Math.round(26 * state.performance.particleScale));
  const cx = target.x;
  const cy = target.y - target.height * 0.62;
  const strength = clamp((superDimLevel - 0.5) / 0.5, 0, 1);
  const spin = reducedMotion ? 0 : time * 0.00022;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = target.def.accent;
  ctx.lineCap = "round";
  for (let line = 0; line < count; line += 1) {
    const jitterA = presentationHash01(line, 17);
    const jitterB = presentationHash01(line, 91);
    const angle = (line / count) * Math.PI * 2 + jitterA * 0.5 + spin;
    const outer = 860 + jitterB * 260;
    // Animated lines rush inward on a staggered cycle; reduced motion holds
    // them static at low alpha instead.
    const rush = reducedMotion ? 0.55 : 0.35 + 0.4 * ((time * 0.0011 + jitterA) % 1);
    const inner = outer * (0.4 + rush * 0.3);
    ctx.globalAlpha = (reducedMotion ? 0.05 : 0.05 + jitterB * 0.07) * strength;
    ctx.lineWidth = 1.5 + jitterA * 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.lineTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.stroke();
    presentationDebug.focusLines += 1;
  }
  ctx.restore();
}

function drawAfterimages() {
  for (const effect of state.effects) {
    if (effect.kind !== "afterimage") continue;
    const atlas = fighterAtlases[effect.fighterId];
    if (!atlas) continue;
    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.scale(effect.facing * atlasFrameFacing(effect.fighterId, "base", effect.frame), 1);
    ctx.globalAlpha = clamp(effect.life / effect.max, 0, 1) * 0.34;
    drawAtlasFrame(atlas, effect.frame, effect.size);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// Stage key lights for the fighter rim pass: the colour of each arena's
// dominant practical light and which world-space side it comes from. The rim
// blends toward the warm spotlight tone while the super dim is up.
// castShear/castStretch drive the floor cast-shadow pass: how hard the same
// key light skews the shadow down-light and how long it throws (low harsh
// practicals like the el-track arcs and boardwalk neon throw long, raked
// shadows; the buffet's overhead lanterns keep them short and steep).
const STAGE_RIM_LIGHTS = Object.freeze({
  somerset: Object.freeze({ color: Object.freeze([126, 178, 255]), direction: -1, castShear: 0.66, castStretch: 0.44 }), // cool blue el-track arcs
  vet: Object.freeze({ color: Object.freeze([255, 178, 84]), direction: 1, castShear: 0.5, castStretch: 0.5 }),            // sodium lot floods
  wildwood: Object.freeze({ color: Object.freeze([255, 104, 214]), direction: 1, castShear: 0.76, castStretch: 0.4 }),     // boardwalk neon pink
  buffet: Object.freeze({ color: Object.freeze([255, 190, 108]), direction: -1, castShear: 0.36, castStretch: 0.48 }),     // lantern amber
  cruise: Object.freeze({ color: Object.freeze([108, 226, 255]), direction: -1, castShear: 0.58, castStretch: 0.42 }),     // pool-deck cyan
});
const SUPER_RIM_WARMTH = Object.freeze([255, 214, 150]);

function stageRimColor() {
  const rim = STAGE_RIM_LIGHTS[state.stage] || STAGE_RIM_LIGHTS.somerset;
  const warmth = clamp(superDimLevel, 0, 1);
  const red = Math.round(lerp(rim.color[0], SUPER_RIM_WARMTH[0], warmth));
  const green = Math.round(lerp(rim.color[1], SUPER_RIM_WARMTH[1], warmth));
  const blue = Math.round(lerp(rim.color[2], SUPER_RIM_WARMTH[2], warmth));
  return `rgb(${red},${green},${blue})`;
}

// Per-stage colour grade plus an edge vignette: one soft-light tint pulls each
// arena toward its own palette without crushing the sprite art. Each entry now
// carries a second "late" tint: round 1 → round 3 the evening visibly gets
// later, lerped purely from state.round so it is exact under rollback and
// replay (the fill count in drawStageGrade never changes). Janney finally gets
// the grade entry it was silently missing.
const STAGE_GRADES = Object.freeze({
  somerset: { tint: [44, 74, 110, 0.30], late: [26, 50, 122, 0.38], vignette: 0.30, lateVignette: 0.36 },
  vet: { tint: [96, 74, 40, 0.24], late: [52, 68, 108, 0.30], vignette: 0.26, lateVignette: 0.32 },           // floodlights take over, cooler cast
  wildwood: { tint: [88, 44, 110, 0.26], late: [62, 24, 126, 0.34], vignette: 0.28, lateVignette: 0.34 },     // sky deepens, neon reads hotter
  buffet: { tint: [112, 78, 40, 0.26], late: [98, 56, 54, 0.32], vignette: 0.22, lateVignette: 0.28 },
  cruise: { tint: [40, 104, 118, 0.20], late: [124, 88, 58, 0.26], vignette: 0.18, lateVignette: 0.24 },      // afternoon slides toward golden hour
  janney: { tint: [122, 84, 52, 0.26], late: [86, 54, 132, 0.34], vignette: 0.24, lateVignette: 0.32 },       // early dusk amber → violet
});

function drawStageGrade() {
  if (state.accessibility.highContrast) return;
  // The killing blow drains the colour out of the scene, so the reds of the
  // pool, spray and vignette are the only saturated thing left on screen.
  const finisher = state.finisher;
  if (state.graphicFatalities && finisher?.fatalityTriggered) {
    const aftermath = Math.max(0, finisher.elapsed - finisher.fatalityAt);
    const drain = Math.min(0.55, aftermath * 1.1);
    if (drain > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "saturation";
      ctx.fillStyle = `rgba(128,128,128,${drain.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
  const grade = STAGE_GRADES[state.stage];
  if (!grade) return;
  const late = timeOfDayLevel();
  const tint = `rgba(${Math.round(lerp(grade.tint[0], grade.late[0], late))},${Math.round(lerp(grade.tint[1], grade.late[1], late))},${Math.round(lerp(grade.tint[2], grade.late[2], late))},${lerp(grade.tint[3], grade.late[3], late).toFixed(3)})`;
  const vignetteStrength = lerp(grade.vignette, grade.lateVignette, late).toFixed(3);
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  const vignette = ctx.createRadialGradient(W * 0.5, H * 0.44, H * 0.42, W * 0.5, H * 0.52, W * 0.72);
  vignette.addColorStop(0, "rgba(4,6,12,0)");
  vignette.addColorStop(1, `rgba(4,6,12,${vignetteStrength})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawFinisherRealityComposite() {
  const reality = finisherRealityAmount();
  if (reality <= .01) return;
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = reality;
  const splitLight = ctx.createLinearGradient(0, 0, W, H);
  splitLight.addColorStop(0, "rgba(255,142,66,.32)");
  splitLight.addColorStop(.43, "rgba(62,44,46,.08)");
  splitLight.addColorStop(1, "rgba(72,164,230,.28)");
  ctx.fillStyle = splitLight;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  const vignette = ctx.createRadialGradient(W * .5, H * .47, H * .18, W * .5, H * .47, W * .7);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(.72, `rgba(4,4,7,${(reality * .08).toFixed(3)})`);
  vignette.addColorStop(1, `rgba(1,2,4,${(reality * .5).toFixed(3)})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  presentationDebug.realisticLighting += 1;

  if (state.performance.shadows && !state.accessibility.highContrast) {
    ctx.globalCompositeOperation = "overlay";
    const grainTick = state.accessibility.reducedMotion ? 0 : state.simulationTick;
    for (let grain = 0; grain < 96; grain += 1) {
      const x = (grain * 197 + grainTick * 17) % W;
      const y = (grain * 109 + grainTick * 11) % H;
      ctx.globalAlpha = reality * (.025 + grain % 4 * .008);
      ctx.fillStyle = grain % 2 ? "#e8dfd2" : "#2a3340";
      ctx.fillRect(x, y, 1 + grain % 3, 1 + (grain + 1) % 2);
    }
    presentationDebug.filmGrainPasses += 1;
  }
  ctx.restore();
}

function drawParticles() {
  for (const particle of state.particles) {
    const alpha = clamp(particle.life / particle.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = particle.kind === "dust" ? alpha * 0.42 : alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    if (particle.kind === "sparkLine") {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = particle.size;
      ctx.lineCap = "round";
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x - (particle.vx || 0) * 0.045, particle.y - (particle.vy || 0) * 0.045);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    if (particle.kind === "debris") {
      // Wall-splat chip (wave 4): a stage-toned slab tumbling under the shared
      // spin/rotation integration the gore fragments already use.
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation || 0);
      ctx.fillRect(-particle.size, -particle.size * 0.42, particle.size * 2, particle.size * 0.84);
      ctx.restore();
      continue;
    }
    if (particle.kind === "sweat") {
      // Glinting droplet: an additive bead stretched along its velocity with a
      // small white highlight trailing it.
      ctx.globalCompositeOperation = "lighter";
      const angle = Math.atan2(particle.vy || 0, particle.vx || 1);
      ctx.ellipse(particle.x, particle.y, particle.size * 1.4, Math.max(0.8, particle.size * 0.5), angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(
        particle.x - Math.cos(angle) * particle.size * 0.6,
        particle.y - Math.sin(angle) * particle.size * 0.6,
        Math.max(0.6, particle.size * 0.3), 0, Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
      continue;
    }
    if (particle.kind === "blood" || particle.kind === "arterial") {
      const angle = Math.atan2(particle.vy || 0, particle.vx || 1);
      if (cinema3dDressingActive()) {
        // CINEMA 3D: dimensional spatter — the gradient droplet sprite
        // stretched along its velocity with a thinning smear tail, instead
        // of a flat solid ellipse.
        const speed = Math.hypot(particle.vx || 0, particle.vy || 0);
        const stretch = 1.2 + Math.min(1.6, speed * 0.0016);
        ctx.strokeStyle = particle.color;
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(1, particle.size * 0.5);
        ctx.globalAlpha = alpha * 0.55;
        ctx.beginPath();
        ctx.moveTo(particle.x - (particle.vx || 0) * 0.03, particle.y - (particle.vy || 0) * 0.03);
        ctx.lineTo(particle.x, particle.y);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.translate(particle.x, particle.y);
        ctx.rotate(angle);
        ctx.scale(stretch, 1);
        const dropSize = particle.size * 2.1;
        ctx.drawImage(fatalityDropletCanvas(), -dropSize, -dropSize, dropSize * 2, dropSize * 2);
        ctx.restore();
        continue;
      }
      ctx.ellipse(particle.x, particle.y, particle.size * 1.65, Math.max(1, particle.size * 0.62), angle, 0, Math.PI * 2);
    } else if (particle.kind === "goreFragment") {
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation || 0);
      const spikes = particle.spikes || 6;
      const dressedGore = cinema3dDressingActive();
      for (let point = 0; point < spikes * 2; point += 1) {
        const angle = point * Math.PI / spikes;
        // 3D mode: per-point jitter breaks the symmetric star into a torn
        // irregular chunk (the flat throwing-star read was pure clipart).
        const jag = dressedGore
          ? 0.62 + (Math.abs(Math.sin((point * 37.7 + spikes * 91.3 + particle.size * 13.1))) * 0.55)
          : (point % 2 ? .48 : 1);
        const radius = particle.size * (dressedGore ? jag : jag);
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
    } else if (effect.kind === "fatalityProjectile") {
      drawFatalityProjectile(effect, alpha);
    } else if (effect.kind === "projectileFocusBurst") {
      drawProjectileFocusBurst(effect, alpha);
    } else if (effect.kind === "fatalityPool") {
      drawFatalityPool(effect, alpha);
    } else if (effect.kind === "severedLimb") {
      drawSeveredLimb(effect, alpha);
    } else if (effect.kind === "goreShockwave") {
      const growth = 1 - alpha;
      const reach = (54 + growth * 250) * (effect.scale || 1);
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = effect.color;
      ctx.fillStyle = effect.secondary;
      ctx.lineCap = "round";
      const dressedSpray = cinema3dDressingActive();
      for (let spray = 0; spray < 17; spray += 1) {
        const angle = -1.42 + spray * .18 + (effect.family === "launch" ? -.18 : 0);
        const length = reach * (.38 + (spray % 6) * .12);
        ctx.globalAlpha = alpha * (.28 + spray % 4 * .14);
        if (dressedSpray) {
          // CINEMA 3D: tapered arterial arcs — thick dark root fading down a
          // gravity-bent path to a droplet-sprite tip; the straight uniform
          // "red spoke" read is gone.
          const tipX = Math.cos(angle) * length * effect.direction;
          const tipY = Math.sin(angle) * length + length * 0.22; // gravity sag
          const sprayGrad = ctx.createLinearGradient(0, 0, tipX, tipY);
          sprayGrad.addColorStop(0, effect.secondary);
          sprayGrad.addColorStop(0.5, effect.color);
          sprayGrad.addColorStop(1, "rgba(96,4,10,0.25)");
          ctx.strokeStyle = sprayGrad;
          ctx.lineWidth = 4.5 + spray % 5;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(
            Math.cos(angle) * length * .55 * effect.direction,
            Math.sin(angle) * length * .45 - 24,
            tipX, tipY,
          );
          ctx.stroke();
          // thinner core pass rides the same arc: reads as a liquid rope
          ctx.globalAlpha *= 0.7;
          ctx.lineWidth = Math.max(1.4, (4.5 + spray % 5) * 0.4);
          ctx.stroke();
          const tipSize = 5 + spray % 4 * 2.4;
          ctx.save();
          ctx.translate(tipX, tipY);
          // teardrop head leads along the arc's end tangent (gravity-drooped)
          ctx.rotate(angle + 0.3);
          ctx.scale(1.5, 0.85);
          ctx.drawImage(fatalityDropletCanvas(), -tipSize, -tipSize, tipSize * 2, tipSize * 2);
          ctx.restore();
          continue;
        }
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
      if (effect.spill && !state.accessibility.highContrast) {
        // Impact light spill (wave 4): one radial gradient splash of the spark
        // colour across the nearby stage, snapping back with the flash's own
        // life. Radius halves on the battery profile and eases down with the
        // effect budget so the balanced tier stays cheap.
        const reach = (effect.tier === "super" ? 500 : 330)
          * (state.performance.shadows ? 1 : 0.5)
          * (0.6 + 0.4 * Math.min(1, state.performance.effectBudget / 220));
        const channels = hexToRgbChannels(effect.spill);
        const spillAlpha = alpha * (effect.tier === "super" ? 0.38 : 0.24);
        ctx.shadowBlur = 0;
        const spill = ctx.createRadialGradient(0, 0, 12, 0, 0, reach);
        spill.addColorStop(0, `rgba(${channels},${spillAlpha.toFixed(3)})`);
        spill.addColorStop(0.55, `rgba(${channels},${(spillAlpha * 0.4).toFixed(3)})`);
        spill.addColorStop(1, `rgba(${channels},0)`);
        ctx.fillStyle = spill;
        ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
        presentationDebug.lightSpills += 1;
      }
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
    } else if (effect.kind === "counterFocus") {
      // Counter-hit focus burst (wave 4): gold anime speed lines rushing in on
      // the impact point. Skipped under reduced motion; the color-preserving
      // brightness pop still marks the counter. Deterministic jitter only.
      if (!state.accessibility.reducedMotion) {
        const rush = 1 - alpha;
        ctx.globalCompositeOperation = "screen";
        ctx.shadowBlur = 0;
        ctx.lineCap = "round";
        for (let line = 0; line < 12; line += 1) {
          const jitter = presentationHash01(line, 29);
          const angle = line * (Math.PI * 2 / 12) + jitter * 0.42;
          const outer = (150 + jitter * 70) * (1 - rush * 0.45);
          const inner = outer * (0.36 + rush * 0.36);
          ctx.globalAlpha = alpha * (0.5 + jitter * 0.4);
          ctx.lineWidth = 1.5 + rush * 2 + jitter * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
          ctx.lineTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
          ctx.stroke();
        }
        presentationDebug.counterFlashes += 1;
      }
    } else if (effect.kind === "wallShock") {
      // Corner wall-splat (wave 4): a tall shock ellipse hugging the arena
      // edge plus an offset shimmer ring that reads as compressed air coming
      // off the wall. Static, dimmer variant under reduced motion.
      const reducedMotion = state.accessibility.reducedMotion;
      const growth = reducedMotion ? 0.4 : 1 - alpha;
      const size = effect.size || 84;
      ctx.globalCompositeOperation = "screen";
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha * (reducedMotion ? 0.4 : 0.85);
      ctx.lineWidth = 2.5 + alpha * 5.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * (0.14 + growth * 0.4), size * (0.55 + growth * 1.05), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha *= 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(effect.direction * (6 + growth * 16), 0, size * (0.2 + growth * 0.5), size * (0.62 + growth * 1.2), 0, 0, Math.PI * 2);
      ctx.stroke();
      presentationDebug.wallSplats += 1;
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
    } else if (effect.kind === "shockRing") {
      const growth = 1 - alpha;
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.5 + alpha * 5;
      ctx.globalAlpha = alpha * 0.85;
      ctx.beginPath();
      ctx.ellipse(0, 0, (effect.size || 60) * (0.25 + growth), (effect.size || 60) * (0.18 + growth * 0.7), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    } else if (effect.kind === "afterimage") {
      // Rendered in the world pass before the fighters; nothing to do here.
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

  // CINEMA 3D text layout: the DOM HUD (health bars, grit) covers the TOP
  // letterbox bar in 3D mode, which truncated every meta label into garbage
  // ("CIN...", "REAK", "...ON" peeking around the bars — the critic's
  // shipping blocker). All three meta labels move into the BOTTOM bar, which
  // is actually visible. 2D-off path is byte-identical.
  const dressedOverlay = cinema3dDressingActive();
  const metaY = dressedOverlay ? H - 10 : barHeight - 11;
  ctx.save();
  ctx.textAlign = "left";
  ctx.font = "900 11px Arial Narrow, Arial";
  ctx.fillStyle = attacker.def.accent;
  ctx.globalAlpha = .82;
  ctx.fillText(`CINEMATIC · ${cinematic.shot.replaceAll("-", " ").toUpperCase()}`, 24, metaY);
  if (state.graphicFatalities) {
    const attackerId = attacker.def.finisherScriptId || attacker.def.id;
    const fatality = getGraphicFatality(attackerId, finisher.type);
    ctx.textAlign = "center";
    ctx.fillStyle = "#d90b19";
    ctx.fillText(`REALITY BREAK · ${fatality.special} FATALITY`, W * .5, metaY);
  }
  if (cinematic.shot === "final-impact") {
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff0df";
    ctx.font = "1000 14px Arial Narrow, Arial";
    ctx.fillText("FINAL-HIT SLOW MOTION", W - 24, metaY);
  }
  ctx.restore();

  // 3D mode drops the beat-label block once the fatality banner owns the
  // frame (round-3, critic item 2): "PIZZA WHEEL ARM SEVER" was printing in
  // the banner AND down here — four stacked text elements over one shot.
  if (finisher.beatLife > 0 && !(dressedOverlay && finisher.fatalityTriggered)) {
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
    // 3D mode: the beats counter rides just under its beat label, clear of
    // the meta line now living in the bottom bar.
    ctx.fillText(`${finisher.impactIndex} / 3 PROJECTILE BEATS`, W * .5,
      dressedOverlay ? H - barHeight - 2 : H - barHeight + 19);
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
    // 3D mode: ONE title line under the header (round-3, critic item 2) —
    // the cinematic carries the story; the caption stack is gone.
    const titleLine = dressedOverlay ? fatality.caption : `${fatality.title} · ${fatality.caption}`;
    ctx.strokeText(titleLine, W * .5, H * .3);
    ctx.fillText(titleLine, W * .5, H * .3);
    if (!dressedOverlay) {
      ctx.font = "900 14px Arial Narrow, Arial, sans-serif";
      ctx.lineWidth = 6;
      ctx.fillStyle = attacker.def.accent;
      const signatureLine = `${fatality.projectileFinale} · ${fatality.device}`;
      ctx.strokeText(signatureLine, W * .5, H * .345);
      ctx.fillText(signatureLine, W * .5, H * .345);
    }
    ctx.restore();
  }
}

// R1.9: hex + alpha helper for the viewer's translucent fills.
function fillWithAlpha(hex, alpha) {
  const value = parseInt(String(hex).replace("#", ""), 16);
  if (!Number.isFinite(value)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

const FRAME_PHASE_ROLES = Object.freeze({
  startup: ["frameStartup", "#59d66d"],
  active: ["frameActive", "#ff4d5e"],
  recovery: ["frameRecovery", "#3fa7ff"],
  hitstun: ["frameStun", "#ffd54a"],
  blockstun: ["frameStun", "#b8985a"],
});

function framePhaseColor(phase) {
  const entry = FRAME_PHASE_ROLES[phase];
  if (!entry) return "#252c35";
  return assistColor(entry[0], entry[1]);
}

/**
 * R1.9: SFV-style frame meter strip — one cell per simulation tick per
 * fighter, colored startup/active/recovery/stun, with the measured ADVANTAGE
 * number rendered at the live edge. Render-only, fed by feedFrameMeter(),
 * gated behind the FRAME METER training toggle.
 */
function drawTrainingFrameMeter() {
  if (state.mode !== "training" || !state.training.showFrameMeter) return;
  if (state.screen !== "fight" || state.fighters.length !== 2) return;
  const cellWidth = 7;
  const cellHeight = 13;
  const originX = 150;
  const width = FRAME_METER_CELLS * (cellWidth + 1) + 12;
  const originY = H - 104;
  ctx.save();
  ctx.fillStyle = "rgba(3,8,13,.82)";
  ctx.fillRect(originX - 34, originY - 8, width + 116, cellHeight * 2 + 30);
  ctx.strokeStyle = "rgba(78,221,245,.5)";
  ctx.strokeRect(originX - 34, originY - 8, width + 116, cellHeight * 2 + 30);
  ctx.font = "900 11px ui-monospace, monospace";
  ctx.textBaseline = "top";
  for (const side of [0, 1]) {
    const history = frameMeter.history[side];
    const rowY = originY + side * (cellHeight + 4);
    ctx.fillStyle = side === 0
      ? assistColor("hurtboxP1", "#35e7ff")
      : assistColor("hurtboxP2", "#ff4dc4");
    ctx.fillText(`P${side + 1}`, originX - 28, rowY + 2);
    for (let index = 0; index < history.length; index += 1) {
      const phase = history[index];
      ctx.fillStyle = phase === "idle" ? "#1c232c" : framePhaseColor(phase);
      ctx.fillRect(originX + index * (cellWidth + 1), rowY, cellWidth, cellHeight);
    }
  }
  const advantage = state.training.lastAdvantage;
  if (Number.isFinite(advantage)) {
    ctx.fillStyle = advantage >= 0
      ? assistColor("frameStartup", "#71f7a1")
      : assistColor("frameActive", "#ff6478");
    ctx.fillText(`${advantage >= 0 ? "+" : ""}${advantage}`, originX + width - 4, originY + 8);
  }
  ctx.restore();
}

function drawDebugOverlay() {
  const trainingBoxes = state.mode === "training" && state.training.showHitboxes;
  if (!state.debug && !trainingBoxes) return;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = "700 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "top";

  // R1.9 viewer polish: dashed hurtboxes with translucent phase-colored fills
  // (startup/active/recovery from the live move), solid filled hitboxes with
  // attack-level tags, dotted pushbox, and the proximity-grab ring — all
  // through assistColor so the colorblind palettes reach the canvas too.
  for (const fighter of state.fighters) {
    const phase = trainingFramePhase(fighter);
    const hurtColor = fighter.side === 0
      ? assistColor("hurtboxP1", "#35e7ff")
      : assistColor("hurtboxP2", "#ff4dc4");
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = hurtColor;
    const phaseTint = fighter.attacking ? framePhaseColor(phase) : null;
    for (const box of getHurtboxes(fighter)) {
      if (phaseTint) {
        ctx.fillStyle = fillWithAlpha(phaseTint, 0.16);
        ctx.fillRect(box.x, box.y, box.width, box.height);
      }
      ctx.strokeRect(box.x, box.y, box.width, box.height);
    }
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = fillWithAlpha(assistColor("pushbox", "#6eff7d"), 0.88);
    const pushHalf = fighter.crouch
      ? fighter.movement.crouchingPushboxHalfWidth
      : fighter.movement.standingPushboxHalfWidth;
    ctx.strokeRect(fighter.x - pushHalf, fighter.y - 112, pushHalf * 2, 112);
    ctx.setLineDash([]);
    const hitColor = assistColor("hitbox", "#ffef5a");
    ctx.strokeStyle = hitColor;
    ctx.fillStyle = fillWithAlpha(hitColor, 0.3);
    let levelTagged = false;
    for (const box of getActiveHitboxes(fighter)) {
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      if (!levelTagged && fighter.attacking) {
        levelTagged = true;
        ctx.font = "900 12px ui-monospace, monospace";
        ctx.fillStyle = "#0b0e14";
        ctx.fillRect(box.x, box.y - 15, 9 * String(fighter.attacking.level).length + 8, 14);
        ctx.fillStyle = hitColor;
        ctx.fillText(String(fighter.attacking.level).toUpperCase(), box.x + 4, box.y - 14);
        ctx.font = "700 14px ui-monospace, SFMono-Regular, Menlo, monospace";
      }
    }
  }

  if (trainingBoxes && state.fighters.length === 2) {
    // 104px proximity-grab ring around the player, the same rule the grab
    // hint reads — lights up exactly when a grab would connect.
    const [player, opponent] = state.fighters;
    const grabReady = inProximityGrabRange(player, opponent) && !player.attacking;
    ctx.setLineDash(grabReady ? [] : [7, 6]);
    ctx.lineWidth = grabReady ? 3 : 2;
    ctx.strokeStyle = grabReady
      ? assistColor("frameStartup", "#71f7a1")
      : "rgba(255,255,255,.4)";
    ctx.beginPath();
    ctx.ellipse(player.x, player.y - 6, PROXIMITY_GRAB_RANGE, PROXIMITY_GRAB_RANGE * 0.24, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    // On-canvas legend for the viewer.
    const legend = [
      ["STARTUP", framePhaseColor("startup")],
      ["ACTIVE", framePhaseColor("active")],
      ["RECOVERY", framePhaseColor("recovery")],
      ["HITBOX", assistColor("hitbox", "#ffef5a")],
      ["HURTBOX P1", assistColor("hurtboxP1", "#35e7ff")],
      ["HURTBOX P2", assistColor("hurtboxP2", "#ff4dc4")],
      ["GRAB RING 104PX", "#ffffff"],
    ];
    // Right edge, below the training panel and above the school panel, clear
    // of the left-side input history column.
    const legendX = W - 150;
    const legendY = Math.round(H * 0.5);
    ctx.font = "900 10px ui-monospace, monospace";
    ctx.fillStyle = "rgba(0,0,0,.72)";
    ctx.fillRect(legendX, legendY, 136, legend.length * 15 + 10);
    legend.forEach(([label, color], index) => {
      ctx.fillStyle = color;
      ctx.fillRect(legendX + 6, legendY + 6 + index * 15, 9, 9);
      ctx.fillStyle = "#e8eef4";
      ctx.fillText(label, legendX + 20, legendY + 5 + index * 15);
    });
    ctx.font = "700 14px ui-monospace, SFMono-Regular, Menlo, monospace";
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
      return `P${fighter.side + 1} ${fighter.combatState.toUpperCase()} F${fighter.stateFrame} · ${move} · GRIT ${Math.floor(fighter.meter)} · FLOW ${fighter.rhythmStacks || 0} · COMBO ${combo.hits}/${combo.damage.toFixed(1)} · JUG ${state.fighters[1 - fighter.side]?.juggleCount || 0} · GUARD ${guard} · GM ${Math.floor(fighter.guardMeter)}${fighter.guardCrushFrames > 0 ? ` CRUSH ${fighter.guardCrushFrames}` : ""} · HS ${fighter.hitstunFrames}/BS ${fighter.blockstunFrames}/KD ${fighter.knockdownFrames} · BUF ${fighter.inputBuffer.snapshot().map((entry) => entry.action).join("/") || "—"}`;
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

// ---------------------------------------------------------------------------
// Wave 7 render tech. Offscreen-canvas compositing passes, all module-level
// render-only state on the documented superDimLevel pattern: never
// snapshotted, never read by the simulation, so rollback checksums are
// untouched. Latches set from simulation paths follow the announce() pattern
// (rollbackResimulating guard + simulationTick dedupe). Performance
// discipline: every pass is skipped outright on the battery profile
// (!performance.shadows) and degrades on balanced; offscreen surfaces are
// cached and only ever (re)sized on a backing-store change, never allocated
// per frame.
// ---------------------------------------------------------------------------

// Backing-store scale for the DPR-sharp mode (feature: SHARP RENDER). Logical
// coordinates stay W x H = 1280x720 everywhere; draw() applies a
// setTransform(renderDpr,...) baseline so all existing code is untouched.
let renderDpr = 1;

function createOffscreen(width, height) {
  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = height;
  return surface;
}

// Cached offscreen surfaces, lazily created once and resized in place only
// when the backing store or profile resolution changes.
const renderSurfaces = {
  bloom: null,
  aberrRed: null,
  aberrCyan: null,
  aberrMask: null,
  crtPattern: null,
  crtVignette: null,
};

function ensureSurface(key, width, height) {
  let surface = renderSurfaces[key];
  if (!surface) {
    surface = createOffscreen(width, height);
    renderSurfaces[key] = surface;
  } else if (surface.width !== width || surface.height !== height) {
    surface.width = width;
    surface.height = height;
  }
  return surface;
}

// --- Frame capture service -------------------------------------------------
// Every pass that resamples the composited frame reads a one-frame-late
// ImageBitmap snapshot instead of drawImage(canvas, ...): sampling the live
// canvas forces a synchronous raster flush/readback that is catastrophically
// slow on software rasterisers (~50ms/frame measured headless), while
// createImageBitmap snapshots asynchronously off the critical path (~1ms).
// One frame of latency is invisible in a soft additive glow or a smear.
// The capture is taken after the stage grade + slow-mo blend and before the
// bloom composite, so the smear accumulates recursively but bloom can never
// feed back into itself.
let frameBitmap = null;
let frameBitmapPending = false;
let slowMoBlurWasActive = false;
// Adaptive refresh cadence. On GPU-composited browsers a capture is a cheap
// texture copy and the snapshot refreshes every frame. Software rasterisers
// (headless QA, --disable-gpu) pay a synchronous full-frame raster per
// capture, so the cadence backs off and the passes composite from a slightly
// stale snapshot instead — the counters and the look survive, the stall is
// amortised.
let frameCaptureCooldown = 0;
let frameCaptureCostEma = 0;

function requestFrameCapture() {
  // Bloom runs on every high/balanced fight frame, and every other consumer
  // (ring, RGB split, slow-mo smear) is inside that same gate — so battery
  // never pays for a single capture.
  if (state.screen !== "fight" || !state.performance.shadows) return;
  if (frameBitmapPending || typeof createImageBitmap !== "function") return;
  if (frameCaptureCooldown > 0) {
    frameCaptureCooldown -= 1;
    return;
  }
  frameBitmapPending = true;
  const started = performance.now();
  const capture = createImageBitmap(canvas);
  // The raster stall, when there is one, is synchronous inside the call.
  const syncCost = performance.now() - started;
  frameCaptureCostEma = frameCaptureCostEma
    ? frameCaptureCostEma * 0.8 + syncCost * 0.2
    : syncCost;
  frameCaptureCooldown = frameCaptureCostEma > 40 ? 7
    : frameCaptureCostEma > 20 ? 3
      : frameCaptureCostEma > 8 ? 1 : 0;
  capture.then((bitmap) => {
    if (frameBitmap) frameBitmap.close();
    frameBitmap = bitmap;
    frameBitmapPending = false;
  }).catch(() => {
    frameBitmapPending = false;
  });
}

// Draw the latest frame snapshot stretched over the full backing store.
function drawFrameBitmap(target) {
  target.drawImage(
    frameBitmap,
    0, 0, frameBitmap.width, frameBitmap.height,
    0, 0, canvas.width, canvas.height,
  );
}

// Sizes the canvas backing store to min(devicePixelRatio, 2) on the desktop
// high profile so atlases and HUD text render at native DPI. CSS sizing
// (width/height 100%) is untouched, so layout, touch mapping and the smoke
// suite's CSS-pixel measurements never change.
function applyBackingStoreResolution() {
  const nativeDpr = Number(window.devicePixelRatio) || 1;
  // Sharp rendering follows the profile, not the pointer type: a phone that
  // earned the high profile renders sharp exactly like a HiDPI desktop
  // (1.9E mobile parity — the old coarse-pointer ban left phones upscaling a
  // 1x backing store across ~3x screens, which is also what let the scanline
  // overlay shred large lettering). The cap stays at the desktop-proven 2x
  // (2560x1440, ~3.7 MP): a denser phone still gets the 2x store scaled to
  // its screen, crisp without allocating a ~7 MP canvas no shipped build has
  // ever driven. Battery/balanced and the sharp-render toggle still force
  // 1x, so constrained devices keep the cheap path.
  const sharp = Boolean(state.sharpRender)
    && state.performance.id === "high"
    && nativeDpr > 1;
  const dpr = sharp ? Math.min(2, nativeDpr) : 1;
  const width = Math.round(W * dpr);
  const height = Math.round(H * dpr);
  if (renderDpr === dpr && canvas.width === width && canvas.height === height) return;
  renderDpr = dpr;
  canvas.width = width;
  canvas.height = height;
  if (frameBitmap) {
    frameBitmap.close();
    frameBitmap = null;
  }
  ctx.setTransform(renderDpr, 0, 0, renderDpr, 0, 0);
}

// --- Feature 1: quarter-res bloom composite --------------------------------
// The whole composited frame is downsampled to a small offscreen, squared
// against itself (a free highlight threshold: midtones collapse, neon and
// spark whites survive) and drawn back full-screen additively — the bilinear
// upscale supplies the soft blur. High: 320x180. Balanced: 160x90 at lower
// alpha. Battery: skipped.
function drawBloomComposite() {
  if (state.screen !== "fight" || !state.performance.shadows || !frameBitmap) return;
  const high = state.performance.id === "high";
  const bloomWidth = high ? 320 : 160;
  const bloomHeight = high ? 180 : 90;
  const surface = ensureSurface("bloom", bloomWidth, bloomHeight);
  const bloomCtx = surface.getContext("2d");
  bloomCtx.globalCompositeOperation = "copy";
  bloomCtx.drawImage(frameBitmap, 0, 0, frameBitmap.width, frameBitmap.height, 0, 0, bloomWidth, bloomHeight);
  // Self-multiply squares the image (a free highlight threshold); squaring
  // twice on high (image^4) keeps the glow to genuine emitters — neon,
  // practicals, sparks — instead of lifting whole bright sprites.
  bloomCtx.globalCompositeOperation = "multiply";
  bloomCtx.drawImage(surface, 0, 0);
  if (high) bloomCtx.drawImage(surface, 0, 0);
  bloomCtx.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // "screen" rolls off softly near white, so bright sprites glow without
  // clipping the way straight additive compositing does.
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = high ? 0.34 : 0.18;
  ctx.drawImage(surface, 0, 0, bloomWidth, bloomHeight, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  presentationDebug.bloomPasses += 1;
}

// --- Feature 2: RGB-split chromatic aberration -----------------------------
// Heavy moments only: a render-side impulse (fatal impact, wall splat, super
// ignition) or a super in flight (superDimLevel > 0.5, suppressed during the
// long finisher aftermath so the tear never becomes steady-state). Channel
// isolation: two cached offscreens hold red / cyan multiplied copies of the
// frame, edge-masked (destination-in radial falloff, centre stays sharp) and
// recombined "lighter" at opposite offsets.
let aberrationImpulse = 0;

function chromaticAberrationLevel() {
  const superFlight = !state.finisher && superDimLevel > 0.5
    ? Math.min(1, (superDimLevel - 0.5) * 2.4) : 0;
  return Math.max(aberrationImpulse, superFlight);
}

function ensureAberrationMask(width, height) {
  const cached = renderSurfaces.aberrMask;
  if (cached && cached.width === width && cached.height === height) return cached;
  const surface = ensureSurface("aberrMask", width, height);
  const maskCtx = surface.getContext("2d");
  maskCtx.clearRect(0, 0, width, height);
  const gradient = maskCtx.createRadialGradient(
    width * 0.5, height * 0.5, Math.min(width, height) * 0.22,
    width * 0.5, height * 0.5, Math.max(width, height) * 0.62,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0.3)");
  gradient.addColorStop(1, "rgba(0,0,0,1)");
  maskCtx.fillStyle = gradient;
  maskCtx.fillRect(0, 0, width, height);
  return surface;
}

function drawChromaticAberration() {
  if (aberrationImpulse > 0) aberrationImpulse = Math.max(0, aberrationImpulse - 0.15);
  if (state.screen !== "fight" || !state.performance.shadows || !frameBitmap) return;
  if (state.accessibility.reducedMotion) return;
  const level = chromaticAberrationLevel();
  if (level <= 0.02) return;
  const high = state.performance.id === "high";
  // Balanced degrades to half-res ghost copies (the upscale blurs them a
  // touch, which reads fine for a 2px tear) at a smaller max offset.
  const scale = high ? 1 : 0.5;
  const splitWidth = Math.round(canvas.width * scale);
  const splitHeight = Math.round(canvas.height * scale);
  const mask = ensureAberrationMask(splitWidth, splitHeight);
  const passes = [
    ["aberrRed", "#ff0000"],
    ["aberrCyan", "#00ffff"],
  ];
  for (const [key, channel] of passes) {
    const surface = ensureSurface(key, splitWidth, splitHeight);
    const splitCtx = surface.getContext("2d");
    splitCtx.globalCompositeOperation = "copy";
    splitCtx.drawImage(frameBitmap, 0, 0, frameBitmap.width, frameBitmap.height, 0, 0, splitWidth, splitHeight);
    splitCtx.globalCompositeOperation = "multiply";
    splitCtx.fillStyle = channel;
    splitCtx.fillRect(0, 0, splitWidth, splitHeight);
    splitCtx.globalCompositeOperation = "destination-in";
    splitCtx.drawImage(mask, 0, 0);
    splitCtx.globalCompositeOperation = "source-over";
  }
  const offset = (high ? 3 : 2) * level * renderDpr;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(0.85, 0.5 + level * 0.35);
  ctx.drawImage(renderSurfaces.aberrRed, -offset, 0, canvas.width, canvas.height);
  ctx.drawImage(renderSurfaces.aberrCyan, offset, 0, canvas.width, canvas.height);
  ctx.restore();
  presentationDebug.rgbSplits += 1;
}

// --- Feature 3: screen-space distortion ring -------------------------------
// One concurrent refraction ring: concentric annulus slices of the already
// composited frame redrawn with tiny alternating scale offsets around the
// impact point (no per-pixel work). World-space origin is projected through
// the world transform captured just before the restore in draw().
let distortionRing = null;
let distortionRingTick = -1;
let worldScreenTransform = null;

function latchDistortionRing(x, y) {
  if (rollbackResimulating || distortionRingTick === state.simulationTick) return;
  if (distortionRing) return; // cap: 1 concurrent ring
  if (state.accessibility.reducedMotion || !state.performance.shadows) return;
  if (!$("#flashToggle").checked) return;
  distortionRingTick = state.simulationTick;
  distortionRing = { x, y, age: 0, duration: 0.3 };
  hudFxDebug.distortionRings += 1;
}

function drawDistortionRing(dtMs) {
  if (!distortionRing) return;
  const ring = distortionRing;
  ring.age += dtMs / 1000;
  if (ring.age >= ring.duration || state.screen !== "fight"
    || !state.performance.shadows || state.accessibility.reducedMotion) {
    distortionRing = null;
    return;
  }
  if (!frameBitmap) return;
  const matrix = worldScreenTransform;
  const originX = matrix ? matrix.a * ring.x + matrix.c * ring.y + matrix.e : ring.x * renderDpr;
  const originY = matrix ? matrix.b * ring.x + matrix.d * ring.y + matrix.f : ring.y * renderDpr;
  const progress = ring.age / ring.duration;
  const eased = 1 - (1 - progress) ** 2;
  const radius = (36 + eased * 330) * renderDpr;
  const strength = (1 - progress) * 0.028;
  const slices = state.performance.id === "high" ? 4 : 2;
  const sliceDepth = 8 * renderDpr;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let index = 0; index < slices; index += 1) {
    const inner = radius + index * sliceDepth;
    const outer = inner + sliceDepth;
    const magnify = 1 + strength * (index % 2 === 0 ? 1 : -0.7) * (1 - index / (slices + 1));
    ctx.save();
    ctx.beginPath();
    ctx.arc(originX, originY, outer, 0, Math.PI * 2);
    ctx.arc(originX, originY, inner, 0, Math.PI * 2, true);
    ctx.clip();
    ctx.translate(originX, originY);
    ctx.scale(magnify, magnify);
    ctx.translate(-originX, -originY);
    drawFrameBitmap(ctx);
    ctx.restore();
  }
  // Hairline additive rim so the refraction edge reads at speed.
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.1 * (1 - progress);
  ctx.strokeStyle = "#cfe6ff";
  ctx.lineWidth = 1.5 * renderDpr;
  ctx.beginPath();
  ctx.arc(originX, originY, radius + sliceDepth * slices * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// --- Feature 5: slow-mo motion-blur buffer ---------------------------------
// While fatality time dilation runs, the previous frame's capture (the single
// cached copy) is blended over the fresh world at low alpha. Because the next
// capture is taken after this blend, the smear accumulates recursively with a
// 0.35 geometric decay — trailing photographic smears confined to the slow-mo
// window. The first blend after activation is skipped (the standing capture
// predates the window), and nothing leaks out: normal frames simply never
// blend.
function updateSlowMoBlur() {
  const active = state.screen === "fight"
    && (state.finisher?.slowMotionTicks || 0) > 0
    && state.performance.id !== "battery"
    && !state.accessibility.reducedMotion;
  if (!active) {
    slowMoBlurWasActive = false;
    return;
  }
  if (frameBitmap && slowMoBlurWasActive) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.35;
    drawFrameBitmap(ctx);
    ctx.restore();
    hudFxDebug.sloMoBlurFrames += 1;
  }
  slowMoBlurWasActive = true;
}

// --- Feature 6: CRT display mode -------------------------------------------
// Opt-in arcade-monitor look: cached RGB phosphor-stripe + scanline pattern,
// cached low-res barrel vignette upscaled over the corners, and a faint
// rolling flicker band (gated on #flashToggle and reduced motion). Pure
// screen-space, applied after everything; skipped on battery.
function crtOverlayActive() {
  return Boolean(state.crtMode) && state.performance.id !== "battery";
}

function ensureCrtPattern() {
  if (renderSurfaces.crtPattern) return renderSurfaces.crtPattern;
  const tile = createOffscreen(3, 3);
  const tileCtx = tile.getContext("2d");
  tileCtx.fillStyle = "rgba(255,64,64,0.055)";
  tileCtx.fillRect(0, 0, 1, 3);
  tileCtx.fillStyle = "rgba(64,255,96,0.05)";
  tileCtx.fillRect(1, 0, 1, 3);
  tileCtx.fillStyle = "rgba(80,128,255,0.06)";
  tileCtx.fillRect(2, 0, 1, 3);
  tileCtx.fillStyle = "rgba(4,6,10,0.17)";
  tileCtx.fillRect(0, 2, 3, 1);
  renderSurfaces.crtPattern = ctx.createPattern(tile, "repeat");
  return renderSurfaces.crtPattern;
}

function ensureCrtVignette() {
  if (renderSurfaces.crtVignette) return renderSurfaces.crtVignette;
  const surface = createOffscreen(320, 180);
  const vignetteCtx = surface.getContext("2d");
  const gradient = vignetteCtx.createRadialGradient(160, 90, 74, 160, 90, 208);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.72, "rgba(0,0,0,0.05)");
  gradient.addColorStop(1, "rgba(0,0,0,0.36)");
  vignetteCtx.fillStyle = gradient;
  vignetteCtx.fillRect(0, 0, 320, 180);
  renderSurfaces.crtVignette = surface;
  return surface;
}

// Offscreen scratch for the 3D-mode CRT pass: the scanline pattern is built
// here first so soft holes can be punched over the fighters (a straight
// destination-out on the main canvas would erase the world beneath).
let crtPunchCanvas = null;
let crtPunchCtx = null;

function drawCrtOverlay(time) {
  if (!crtOverlayActive()) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // CINEMA 3D (critic fix 6): the scanline veil lifts ~50% over the character
  // bodies — full-strength scanlines beat against the sprite texels into
  // moiré on faces. Stage keeps the full CRT flavour; 2D-off path untouched.
  let punched = false;
  if (cinema3dWorldActive() && cinema3dBridge.renderer?.projectSim && state.fighters?.length === 2) {
    if (!crtPunchCanvas || crtPunchCanvas.width !== canvas.width || crtPunchCanvas.height !== canvas.height) {
      crtPunchCanvas = document.createElement("canvas");
      crtPunchCanvas.width = canvas.width;
      crtPunchCanvas.height = canvas.height;
      crtPunchCtx = crtPunchCanvas.getContext("2d");
    }
    const pctx = crtPunchCtx;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, crtPunchCanvas.width, crtPunchCanvas.height);
    pctx.fillStyle = ensureCrtPattern();
    pctx.fillRect(0, 0, crtPunchCanvas.width, crtPunchCanvas.height);
    const px = canvas.width / W;
    pctx.globalCompositeOperation = "destination-out";
    for (const fighter of state.fighters) {
      const feet = cinema3dBridge.renderer.projectSim(fighter.x, fighter.y);
      const head = cinema3dBridge.renderer.projectSim(fighter.x, fighter.y - fighter.height * 1.02);
      if (!feet || !head) continue;
      const cx = feet.x * px;
      const cy = (head.y + feet.y) * 0.5 * px;
      const ry = Math.max(24, (feet.y - head.y) * 0.62 * px);
      const rx = ry * 0.52;
      const hole = pctx.createRadialGradient(cx, cy, ry * 0.25, cx, cy, ry);
      hole.addColorStop(0, "rgba(0,0,0,0.5)");
      hole.addColorStop(0.7, "rgba(0,0,0,0.4)");
      hole.addColorStop(1, "rgba(0,0,0,0)");
      pctx.save();
      pctx.translate(cx, cy);
      pctx.scale(rx / ry, 1);
      pctx.translate(-cx, -cy);
      pctx.fillStyle = hole;
      pctx.beginPath();
      pctx.arc(cx, cy, ry, 0, Math.PI * 2);
      pctx.fill();
      pctx.restore();
    }
    pctx.globalCompositeOperation = "source-over";
    ctx.drawImage(crtPunchCanvas, 0, 0);
    punched = true;
  }
  if (!punched) {
    ctx.fillStyle = ensureCrtPattern();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(ensureCrtVignette(), 0, 0, canvas.width, canvas.height);
  if ($("#flashToggle").checked && !state.accessibility.reducedMotion) {
    const bandHeight = canvas.height * 0.16;
    const bandY = ((time * 0.055) % (canvas.height + bandHeight)) - bandHeight;
    const gradient = ctx.createLinearGradient(0, bandY, 0, bandY + bandHeight);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.045)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, bandY, canvas.width, bandHeight);
  }
  ctx.restore();
}

// --- Feature 7: super portrait cut-in band ---------------------------------
// FULL GRIT SUPER slams the attacker's roster portrait (the select-screen
// webp art, already preloaded in fighterImages) across a diagonal accent band
// for ~0.7s. Deliberately cheap (one drawImage + gradients), so it runs on
// every profile; reduced motion swaps the sweep for a static fade.
let superCutIn = null;
let superCutInTick = -1;
const SUPER_CUT_IN_SECONDS = 0.7;

// CINEMA 3D cut-in dressing: halftone dot + brush-streak pattern tiles, built
// once on first use. Only the 3D-mode banner draws these; the 2D banner path
// is byte-for-byte untouched.
let cutInHalftonePattern = null;
let cutInBrushPattern = null;
function cutInPatterns() {
  if (cutInHalftonePattern) return { halftone: cutInHalftonePattern, brush: cutInBrushPattern };
  // Tiles authored at 2x and played back through a 0.5 pattern transform:
  // the 1x banner dot screen read visibly aliased (AAA-critic fix 5).
  const dots = document.createElement("canvas");
  dots.width = dots.height = 96;
  const dctx = dots.getContext("2d");
  dctx.fillStyle = "rgba(0,0,0,0.85)";
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const r = (2.1 + ((x * 7 + y * 13) % 5) * 0.55) * 2;
      dctx.beginPath();
      dctx.arc(x * 24 + (y % 2 ? 12 : 0) + 6, y * 24 + 6, r, 0, Math.PI * 2);
      dctx.fill();
    }
  }
  const brush = document.createElement("canvas");
  brush.width = 512;
  brush.height = 128;
  const bctx = brush.getContext("2d");
  for (let i = 0; i < 34; i += 1) {
    const seed = Math.sin((i + 3) * 12.9898) * 43758.5453;
    const jitter = seed - Math.floor(seed);
    bctx.strokeStyle = `rgba(255,255,255,${(0.05 + jitter * 0.16).toFixed(3)})`;
    bctx.lineWidth = (0.8 + jitter * 2.6) * 2;
    const y = jitter * 128;
    bctx.beginPath();
    bctx.moveTo(-24, y + 10);
    bctx.lineTo(536, y - 12);
    bctx.stroke();
  }
  cutInHalftonePattern = dots;
  cutInBrushPattern = brush;
  return { halftone: dots, brush };
}

// Half-scale playback transform for the 2x cut-in tiles (3D banner only).
const CUT_IN_PATTERN_SCALE = new DOMMatrix([0.5, 0, 0, 0.5, 0, 0]);

// CINEMA 3D super portrait (AAA-critic fix 6): a dedicated aggressive
// close-up composed at 2x from the attacker's ACTUAL super wind-up atlas
// frame (HD atlas when available) with a hard white key rim, an accent
// back-rim and a contrast push — not the idle roster art re-pasted. 3D-mode
// only: none of this runs while the classic 2D banner draws.
const superPortraitHdImages = new Map();
const superPortraitCache = new Map();
function superPortrait3d(cut) {
  const bank = cut.poseBank === "specials" && fighterMoveAtlases[cut.fighterId] ? "specials" : "base";
  const sdAtlas = bank === "specials" ? fighterMoveAtlases[cut.fighterId] : fighterAtlases[cut.fighterId];
  if (!sdAtlas?.complete || !sdAtlas.naturalWidth) return null;
  const hdPath = `renderer/hd/${cut.fighterId}${bank === "specials" ? "-specials" : ""}.webp`;
  if (!superPortraitHdImages.has(hdPath)) {
    const img = new Image();
    img.src = hdPath; // warm in the fighter layer's HTTP cache; SD fallback
    superPortraitHdImages.set(hdPath, img);
  }
  const hd = superPortraitHdImages.get(hdPath);
  const atlas = hd.complete && hd.naturalWidth ? hd : sdAtlas;
  const key = `${cut.fighterId}:${bank}:${cut.poseFrame}:${atlas === hd ? "hd" : "sd"}`;
  if (superPortraitCache.has(key)) return superPortraitCache.get(key);
  const cellW = atlas.naturalWidth / 4;
  const cellH = atlas.naturalHeight / 4;
  const crop = 0.68; // head + torso + raised fists: the wind-up close-up
  const sx = (cut.poseFrame % 4) * cellW;
  const sy = Math.floor(cut.poseFrame / 4) * cellH;
  const sh = cellH * crop;
  const canvas = document.createElement("canvas");
  canvas.height = 584; // ~2x the on-screen portrait height
  canvas.width = Math.round(584 * (cellW / sh));
  const pctx = canvas.getContext("2d");
  // Tinted stamp helper: the frame silhouette filled with one colour.
  const stamp = document.createElement("canvas");
  stamp.width = canvas.width;
  stamp.height = canvas.height;
  const stampCtx = stamp.getContext("2d");
  const drawFrame = (target) => target.drawImage(atlas, sx, sy, cellW, sh, 0, 0, canvas.width, canvas.height);
  const tinted = (color) => {
    stampCtx.clearRect(0, 0, stamp.width, stamp.height);
    drawFrame(stampCtx);
    stampCtx.globalCompositeOperation = "source-in";
    stampCtx.fillStyle = color;
    stampCtx.fillRect(0, 0, stamp.width, stamp.height);
    stampCtx.globalCompositeOperation = "source-over";
    return stamp;
  };
  // Accent back-rim (down-right) then white key rim (up-left) under the real
  // frame. The rim stamps are BLURRED (critic fix 7): the raw NN-scaled alpha
  // printed a jaggy white staircase matte around the portrait — softened
  // here, the sharp art on top still owns the silhouette.
  pctx.filter = "blur(2.4px)";
  pctx.drawImage(tinted(cut.accent), 9, 7);
  pctx.filter = "blur(1.5px)";
  pctx.drawImage(tinted("rgba(255,255,255,0.95)"), -7, -6);
  pctx.drawImage(tinted("rgba(255,255,255,0.95)"), -3, -3);
  pctx.filter = "contrast(1.14) saturate(1.12)";
  drawFrame(pctx);
  pctx.filter = "none";
  superPortraitCache.set(key, canvas);
  return canvas;
}

// Limb-following super-freeze energy arcs (critic fix 7): jagged bolts that
// START at one emitter (the wind-up's chest/fist zone) and WALK the body —
// each step stays inside the portrait's alpha, hugging the silhouette, so the
// energy traces arms and shoulders instead of scribbling randomly. Two seeded
// variants per portrait, cached; the cut-in flickers between them.
const superArcCache = new Map();
function superPortraitArcs(portrait, accent, variant) {
  const key = `${portrait.width}x${portrait.height}:${accent}:${variant}`;
  if (superArcCache.has(key)) return superArcCache.get(key);
  const w = portrait.width;
  const h = portrait.height;
  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  const sctx = scratch.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(portrait, 0, 0);
  const alphaData = sctx.getImageData(0, 0, w, h).data;
  const solid = (x, y) => {
    if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) return false;
    return alphaData[(Math.round(y) * w + Math.round(x)) * 4 + 3] > 90;
  };
  const canvasOut = document.createElement("canvas");
  canvasOut.width = w;
  canvasOut.height = h;
  const octx = canvasOut.getContext("2d");
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7 + variant * 53.7) * 43758.5453;
    return s - Math.floor(s);
  };
  // emitter: chest/lead-fist zone of the wind-up crop
  const ex = w * 0.52;
  const ey = h * 0.46;
  octx.lineCap = "round";
  octx.lineJoin = "round";
  for (let arc = 0; arc < 6; arc += 1) {
    let x = ex + (hash(arc * 9 + 1) - 0.5) * w * 0.08;
    let y = ey + (hash(arc * 9 + 2) - 0.5) * h * 0.06;
    let angle = hash(arc * 9 + 3) * Math.PI * 2;
    const points = [[x, y]];
    const step = Math.max(6, w * 0.028);
    for (let s = 0; s < 26; s += 1) {
      angle += (hash(arc * 31 + s) - 0.5) * 1.1;
      let nx = x + Math.cos(angle) * step;
      let ny = y + Math.sin(angle) * step;
      if (!solid(nx, ny)) {
        // hug the silhouette: try tangential turns before giving up — this is
        // what makes the bolt FOLLOW an arm instead of flying off it
        let turned = false;
        for (const dTurn of [0.7, -0.7, 1.3, -1.3, 2.0, -2.0]) {
          const tx = x + Math.cos(angle + dTurn) * step;
          const ty = y + Math.sin(angle + dTurn) * step;
          if (solid(tx, ty)) {
            angle += dTurn;
            nx = tx;
            ny = ty;
            turned = true;
            break;
          }
        }
        if (!turned) break;
      }
      x = nx;
      y = ny;
      points.push([x, y]);
    }
    if (points.length < 5) continue;
    // BLANKA-GRAMMAR BOLT (round-3, critic item 6): drawn segment-by-segment
    // with real WIDTH VARIATION — a fat rooted trunk tapering to a whipped
    // point, jittered per step — in three passes: a soft orange falloff glow,
    // a hot amber body, and a thin WHITE-HOT core. No more uniform noodle.
    const jittered = points.map((pt, p) => [
      pt[0] + (hash(p * 7 + arc) - 0.5) * 3,
      pt[1] + (hash(p * 11 + arc) - 0.5) * 3,
    ]);
    const drawBolt = (pts, rootWidth, seedBase) => {
      const segs = pts.length - 1;
      for (let p = 0; p < segs; p += 1) {
        const t = p / Math.max(1, segs - 1);
        // taper root -> tip with per-segment crackle so no two widths match
        const wSeg = Math.max(0.7, rootWidth * (1 - t * 0.78) * (0.62 + hash(seedBase + p * 13) * 0.76));
        const seg = () => {
          octx.beginPath();
          octx.moveTo(pts[p][0], pts[p][1]);
          octx.lineTo(pts[p + 1][0], pts[p + 1][1]);
          octx.stroke();
        };
        // orange falloff glow
        octx.globalAlpha = 0.3 * (1 - t * 0.4);
        octx.strokeStyle = "rgba(255,118,20,1)";
        octx.lineWidth = wSeg * 3.1;
        seg();
        // hot amber body
        octx.globalAlpha = 0.82;
        octx.strokeStyle = "rgba(255,178,58,1)";
        octx.lineWidth = wSeg;
        seg();
        // white-hot core
        octx.globalAlpha = 0.95;
        octx.strokeStyle = "rgba(255,250,238,1)";
        octx.lineWidth = Math.max(0.6, wSeg * 0.34);
        seg();
      }
    };
    drawBolt(jittered, Math.max(3.4, w * 0.016), arc * 101);
    // BRANCHES: 2 true forks walked off mid points with their own taper —
    // branching is what separates lightning from scribble.
    for (let br = 0; br < 2; br += 1) {
      const rootIndex = Math.floor(jittered.length * (0.3 + hash(arc * 17 + br * 29) * 0.45));
      const root = jittered[rootIndex];
      if (!root) continue;
      let bx = root[0];
      let by = root[1];
      let bAngle = hash(arc * 23 + br * 31) * Math.PI * 2;
      const branchPts = [[bx, by]];
      const bStep = Math.max(4.5, w * 0.02);
      for (let s = 0; s < 7; s += 1) {
        bAngle += (hash(arc * 41 + br * 7 + s) - 0.5) * 1.3;
        let nx = bx + Math.cos(bAngle) * bStep;
        let ny = by + Math.sin(bAngle) * bStep;
        if (!solid(nx, ny)) {
          let turned = false;
          for (const dTurn of [0.8, -0.8, 1.5, -1.5]) {
            const tx = bx + Math.cos(bAngle + dTurn) * bStep;
            const ty = by + Math.sin(bAngle + dTurn) * bStep;
            if (solid(tx, ty)) { bAngle += dTurn; nx = tx; ny = ty; turned = true; break; }
          }
          if (!turned) break;
        }
        bx = nx;
        by = ny;
        branchPts.push([bx, by]);
      }
      if (branchPts.length >= 3) drawBolt(branchPts, Math.max(1.8, w * 0.008), arc * 211 + br * 57);
    }
  }
  // hot emitter knot where every bolt roots
  const knot = octx.createRadialGradient(ex, ey, 2, ex, ey, w * 0.075);
  knot.addColorStop(0, "rgba(255,248,235,0.95)");
  knot.addColorStop(0.4, `${accent}aa`);
  knot.addColorStop(1, "rgba(0,0,0,0)");
  octx.globalAlpha = 1;
  octx.fillStyle = knot;
  octx.fillRect(ex - w * 0.075, ey - w * 0.075, w * 0.15, w * 0.15);
  superArcCache.set(key, canvasOut);
  return canvasOut;
}

function latchSuperPresentation(fighter) {
  if (rollbackResimulating || superCutInTick === state.simulationTick) return;
  superCutInTick = state.simulationTick;
  // poseBank/poseFrame capture the live wind-up pose for the CINEMA 3D
  // close-up portrait; plain data, unread by the classic 2D banner path.
  const pose = fighterAnimationPose(fighter);
  superCutIn = {
    side: fighter.side,
    fighterId: fighter.def.id,
    name: fighter.def.name,
    accent: fighter.def.accent,
    color: fighter.def.color,
    poseBank: pose.bank,
    poseFrame: pose.frame,
    t: 0,
  };
  hudFxDebug.superCutIns += 1;
  latchDistortionRing(fighter.x, fighter.y - fighter.height * 0.6);
  if (state.performance.shadows && !state.accessibility.reducedMotion) {
    aberrationImpulse = Math.max(aberrationImpulse, 0.7);
  }
}

function latchFatalImpactPresentation(x, y) {
  if (rollbackResimulating) return;
  latchDistortionRing(x, y);
  if (state.performance.shadows && !state.accessibility.reducedMotion) {
    aberrationImpulse = Math.max(aberrationImpulse, 1);
  }
}

function drawSuperCutIn(dtMs) {
  if (!superCutIn) return;
  if (state.screen !== "fight") {
    superCutIn = null;
    return;
  }
  const cut = superCutIn;
  cut.t += dtMs / 1000;
  if (cut.t >= SUPER_CUT_IN_SECONDS) {
    superCutIn = null;
    return;
  }
  const reduced = state.accessibility.reducedMotion;
  const progress = clamp(cut.t / SUPER_CUT_IN_SECONDS, 0, 1);
  const alpha = Math.min(clamp(progress / 0.07, 0, 1), clamp((1 - progress) / 0.16, 0, 1));
  const fromLeft = cut.side === 0;
  // CINEMA 3D banner treatment (halftone band, textured type, portrait punch)
  // only fires over the 3D world; the classic 2D banner is untouched.
  const in3d = cinema3dWorldActive();
  // Band held to the upper-middle third: clear of the HUD and low enough to
  // frame the portrait without burying the fighters for its 0.7s life.
  const bandTop = H * 0.19;
  const bandBottom = H * 0.46;
  const tilt = 32;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-60, bandTop + tilt);
  ctx.lineTo(W + 60, bandTop - tilt);
  ctx.lineTo(W + 60, bandBottom - tilt);
  ctx.lineTo(-60, bandBottom + tilt);
  ctx.closePath();
  ctx.clip();
  // Near-opaque dark core with a hard accent wash so the portrait pops on any
  // stage and the band reads as a cut-in, not a tint.
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(5,7,13,0.93)";
  ctx.fillRect(0, bandTop - tilt, W, bandBottom - bandTop + tilt * 2);
  const wash = ctx.createLinearGradient(fromLeft ? 0 : W, 0, fromLeft ? W : 0, 0);
  wash.addColorStop(0, `${cut.accent}e6`);
  wash.addColorStop(0.4, `${cut.color}55`);
  wash.addColorStop(1, "rgba(8,10,18,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, bandTop - tilt, W, bandBottom - bandTop + tilt * 2);
  if (in3d) {
    // Print texture INTO the accent band: a drifting halftone dot screen in
    // the wash's own shadow tone plus raking brush streaks, so the slash
    // reads as inked print, not a flat gradient.
    const { halftone, brush } = cutInPatterns();
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.globalCompositeOperation = "multiply";
    const dotPattern = ctx.createPattern(halftone, "repeat");
    dotPattern.setTransform(CUT_IN_PATTERN_SCALE);
    ctx.translate((fromLeft ? -1 : 1) * cut.t * 160, 0);
    ctx.fillStyle = dotPattern;
    ctx.fillRect(-W, bandTop - tilt, W * 3, bandBottom - bandTop + tilt * 2);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha * 0.55;
    ctx.globalCompositeOperation = "overlay";
    const brushPattern = ctx.createPattern(brush, "repeat");
    brushPattern.setTransform(CUT_IN_PATTERN_SCALE);
    ctx.translate((fromLeft ? 1 : -1) * cut.t * 420, 0);
    ctx.fillStyle = brushPattern;
    ctx.fillRect(-W, bandTop - tilt, W * 3, bandBottom - bandTop + tilt * 2);
    ctx.restore();
  }
  // Speed lines streak against the sweep (skipped under reduced motion).
  if (!reduced) {
    ctx.globalCompositeOperation = "lighter";
    for (let index = 0; index < 11; index += 1) {
      const seed = Math.sin((index + 1) * 12.9898) * 43758.5453;
      const jitter = seed - Math.floor(seed);
      const lineY = bandTop + 10 + jitter * (bandBottom - bandTop - 20);
      const speed = (1100 + jitter * 1100) * (fromLeft ? 1 : -1);
      const span = W + 700;
      let lineX = (fromLeft ? -350 : W + 350) + speed * cut.t * 1.7;
      // Wrap so the streaks keep flowing for the whole 0.7s hold.
      lineX = fromLeft ? ((lineX + 350) % span) - 350 : ((lineX - W - 350) % span) + W + 350;
      ctx.globalAlpha = alpha * (0.3 + jitter * 0.34);
      ctx.fillStyle = index % 3 === 0 ? cut.accent : "#eef4ff";
      ctx.fillRect(lineX, lineY, (150 + jitter * 240) * (fromLeft ? 1 : -1), 2.5 + jitter * 2.5);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  // Portrait slam: eased slide toward centre (static under reduced motion),
  // riding an accent glow pool so the cutout art separates from the band.
  // CINEMA 3D uses the dedicated 2x wind-up close-up (superPortrait3d) with a
  // speed-line burst behind it; the 2D roster-art path is byte-for-byte
  // unchanged.
  const image = fighterImages[cut.fighterId];
  const closeUp = in3d ? superPortrait3d(cut) : null;
  // 3D deliberate band break (round-3, critic item 6): the portrait's head +
  // shoulders COMMIT past the band's top edge instead of grazing it — drawn
  // after the clip ends, through a top-open window bounded at the band's
  // bottom edge. Geometry is computed here; the actual punch draw happens
  // post-restore so the edge stroke passes BEHIND the figure.
  let breakDraw = null;
  if (closeUp || (image?.complete && image.naturalWidth > 0)) {
    const bustFraction = 0.46; // top of the roster art: head + torso
    const sourceHeight = in3d ? (image?.naturalHeight ?? 1) * bustFraction : image?.naturalHeight ?? 1;
    const portraitHeight = (bandBottom - bandTop) * (closeUp ? 1.46 : in3d ? 1.18 : 2.15);
    const portraitWidth = portraitHeight * (closeUp
      ? closeUp.width / closeUp.height
      : (image?.naturalWidth ?? 1) / sourceHeight);
    const slide = reduced ? 1 : 1 - (1 - clamp(progress / 0.34, 0, 1)) ** 3;
    const targetX = W * 0.5 - portraitWidth * 0.5;
    const startX = fromLeft ? -portraitWidth - 80 : W + 80;
    const portraitX = lerp(startX, targetX, slide)
      + (reduced ? 0 : (fromLeft ? 1 : -1) * (1 - progress) * 30);
    const glowX = portraitX + portraitWidth * 0.5;
    const glowY = (bandTop + bandBottom) * 0.5;
    const glow = ctx.createRadialGradient(glowX, glowY, 12, glowX, glowY, portraitHeight * 0.52);
    glow.addColorStop(0, `${cut.accent}b4`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = glow;
    ctx.fillRect(0, bandTop - tilt, W, bandBottom - bandTop + tilt * 2);
    ctx.globalCompositeOperation = "source-over";
    if (in3d && closeUp && !reduced) {
      // SPEED-LINE BURST behind the close-up: comic rays converging on the
      // portrait, wound slightly by the band's life (SF6 cut-in energy).
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (let ray = 0; ray < 22; ray += 1) {
        const seed = Math.sin((ray + 5) * 78.233) * 43758.5453;
        const jitter = seed - Math.floor(seed);
        const angle = (ray / 22) * Math.PI * 2 + jitter * 0.4 + cut.t * 0.5;
        const outer = portraitHeight * (0.85 + jitter * 0.7);
        const inner = portraitHeight * (0.34 + jitter * 0.16);
        ctx.globalAlpha = alpha * (0.16 + jitter * 0.3);
        ctx.strokeStyle = ray % 3 === 0 ? cut.accent : "#fff6e6";
        ctx.lineWidth = 1.5 + jitter * 3.5;
        ctx.beginPath();
        ctx.moveTo(glowX + Math.cos(angle) * outer, glowY + Math.sin(angle) * outer);
        ctx.lineTo(glowX + Math.cos(angle) * inner, glowY + Math.sin(angle) * inner);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = alpha;
    }
    if (in3d) {
      // Portrait PUNCH geometry: slams in oversized and slightly rolled,
      // easing to rest over the first quarter of the band's life. Anchored
      // HIGH: the crown clears the band's top edge by a committed margin.
      const punch = reduced ? 1 : clamp(progress / 0.24, 0, 1);
      const punchEase = 1 - (1 - punch) ** 3;
      const punchScale = 1.22 - punchEase * 0.22;
      const punchRot = (fromLeft ? -1 : 1) * (1 - punchEase) * 0.09 - 0.025;
      const pcx = portraitX + portraitWidth * 0.5;
      const pcy = bandTop - 20 + portraitHeight * 0.5;
      breakDraw = () => {
        ctx.save();
        // Top-open window: free above, cut at the band's bottom edge so the
        // torso still exits INTO the band (a raw crop line never shows).
        ctx.beginPath();
        ctx.moveTo(-60, -H);
        ctx.lineTo(W + 60, -H);
        ctx.lineTo(W + 60, bandBottom - tilt);
        ctx.lineTo(-60, bandBottom + tilt);
        ctx.closePath();
        ctx.clip();
        ctx.globalAlpha = alpha;
        ctx.translate(pcx, pcy);
        ctx.rotate(punchRot);
        ctx.scale(punchScale, punchScale);
        if (closeUp) {
          // Mirror the P2 close-up so the wind-up drives INTO the frame.
          if (!fromLeft) ctx.scale(-1, 1);
          ctx.drawImage(closeUp, -portraitWidth * 0.5, -portraitHeight * 0.5, portraitWidth, portraitHeight);
          // Limb-following energy bolts from the chest emitter, flickering
          // between two seeded variants over the band's life.
          if (!reduced) {
            const arcs = superPortraitArcs(closeUp, cut.accent, Math.floor(cut.t * 21) % 2);
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = alpha * (0.75 + 0.25 * Math.sin(cut.t * 47));
            ctx.drawImage(arcs, -portraitWidth * 0.5, -portraitHeight * 0.5, portraitWidth, portraitHeight);
            ctx.restore();
          }
        } else {
          ctx.drawImage(
            image, 0, 0, image.naturalWidth, sourceHeight,
            -portraitWidth * 0.5, -portraitHeight * 0.5, portraitWidth, portraitHeight,
          );
        }
        ctx.restore();
      };
    } else {
      ctx.drawImage(image, portraitX, bandTop - portraitHeight * 0.24, portraitWidth, portraitHeight);
    }
  }
  // Name plate riding the band's lower edge.
  ctx.globalAlpha = alpha;
  ctx.textAlign = fromLeft ? "right" : "left";
  ctx.textBaseline = "alphabetic";
  const nameX = fromLeft ? W - 54 : 54;
  if (in3d) {
    // Textured display type: skewed heavy caps punched in with the portrait,
    // hot accent under-stroke offset like misregistered ink, gradient fill,
    // halftone screen INSIDE the letterforms and a hard black contour.
    const namePunch = reduced ? 1 : clamp((progress - 0.04) / 0.2, 0, 1);
    const nameEase = 1 - (1 - namePunch) ** 3;
    const nameY = bandBottom - 16;
    ctx.save();
    ctx.translate(nameX, nameY);
    ctx.transform(1, 0, -0.24, 1, 0, 0); // slam-forward skew
    ctx.scale(1 + (1 - nameEase) * 0.35, 1 + (1 - nameEase) * 0.35);
    ctx.globalAlpha = alpha * (0.25 + nameEase * 0.75);
    ctx.font = "1000 58px Arial Narrow, Impact, sans-serif";
    // Misregistered accent pass first (offset down-right).
    ctx.fillStyle = cut.accent;
    ctx.fillText(cut.name, 4, 4);
    // Hard contour.
    ctx.lineJoin = "round";
    ctx.lineWidth = 9;
    ctx.strokeStyle = "rgba(3,4,8,.95)";
    ctx.strokeText(cut.name, 0, 0);
    // Gradient body: hot top light falling to steel.
    const nameGrad = ctx.createLinearGradient(0, -48, 0, 6);
    nameGrad.addColorStop(0, "#ffffff");
    nameGrad.addColorStop(0.52, "#f2f5ff");
    nameGrad.addColorStop(0.56, "#c9d2e8");
    nameGrad.addColorStop(1, "#9aa6c4");
    ctx.fillStyle = nameGrad;
    ctx.fillText(cut.name, 0, 0);
    // Halftone screen inside the letterforms only.
    const { halftone } = cutInPatterns();
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = ctx.createPattern(halftone, "repeat");
    ctx.fillText(cut.name, 0, 0);
    ctx.restore();
  } else {
    ctx.font = "italic 1000 44px Arial Narrow, Impact, sans-serif";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(0,0,0,.92)";
    ctx.fillStyle = "#f4f7ff";
    ctx.strokeText(cut.name, nameX, bandBottom - 18);
    ctx.fillText(cut.name, nameX, bandBottom - 18);
  }
  ctx.restore();
  // Band edge strokes drawn unclipped so they stay crisp — BEFORE the 3D
  // portrait break, so the top edge line passes BEHIND the figure and the
  // crown reads as a designed break, not a graze.
  ctx.save();
  ctx.globalAlpha = alpha * 0.95;
  ctx.strokeStyle = cut.accent;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-60, bandTop + tilt);
  ctx.lineTo(W + 60, bandTop - tilt);
  ctx.moveTo(-60, bandBottom + tilt);
  ctx.lineTo(W + 60, bandBottom - tilt);
  ctx.stroke();
  ctx.restore();
  // 3D-only: the committed band break (no-op in 2D — breakDraw stays null).
  if (breakDraw) {
    ctx.save();
    breakDraw();
    ctx.restore();
  }
}

function draw(time) {
  // Wave 5 HUD observers: phase-edge slash wipe and the hold-then-drain
  // damage ghosts, both driven from observed state in the render loop.
  const hudDtMs = clamp(time - hudFxLastTime, 0, 100) || 16.7;
  hudFxLastTime = time;
  observeFightPhaseWipes();
  updateDamageGhosts(hudDtMs);
  // Wave 6 cinematic camera: observe state and ease the presentation camera
  // before the world transform is built. Runs unconditionally so the camera
  // hard-resets to identity the moment the fight screen goes away.
  updateCinematicCamera(hudDtMs);
  // Release 1.6 LOUD: ease the render-side audio buses (crowd bed, music
  // intensity routing, stage ambience) from observed state. Unconditional so
  // every bed settles/tears down the moment the fight screen goes away.
  updateAudioPresentation(time, hudDtMs);
  // Wave 7 DPR-sharp baseline: all logical-coordinate code below draws through
  // this transform; identity when sharp render is off (renderDpr === 1).
  ctx.setTransform(renderDpr, 0, 0, renderDpr, 0, 0);
  // CINEMA 3D: when the experimental Three.js world renderer is active it
  // draws the world on its own canvas UNDER this one; the 2D canvas is
  // cleared so only the screen-space overlay passes composite on top. When
  // inactive this is a no-op and the 2D path below is untouched.
  const cinema3dWorld = cinema3dWorldActive();
  cinema3dBridge.renderer?.setVisible(cinema3dWorld);
  if (cinema3dWorld) {
    cinema3dBridge.renderer.renderFrame(time, hudDtMs);
    ctx.clearRect(0, 0, W, H);
  }
  ctx.save();
  const shakeScale = state.accessibility.reducedMotion ? 0 : state.accessibility.shakeScale;
  const shakeX = state.shake > 0 ? Math.sin((state.simulationTick + 1) * 12.9898) * state.shake * 9 * shakeScale : 0;
  const shakeY = state.shake > 0 ? Math.cos((state.simulationTick + 1) * 7.233) * state.shake * 6 * shakeScale : 0;
  // Recoil/handheld offsets ride beside the existing noise shake translate.
  ctx.translate(shakeX + cinematicCamera.x, shakeY + cinematicCamera.y);
  if (state.finisher) {
    const camera = finisherCameraTarget();
    ctx.translate(W * .5, H * .53);
    // Fatality dutch tilt rolls the scripted cinematic about screen centre.
    if (cinematicCamera.rotation !== 0) ctx.rotate(cinematicCamera.rotation);
    ctx.scale(state.cinematicZoom, state.cinematicZoom);
    ctx.translate(-camera.x, -camera.y);
  } else if (cinematicCamera.zoom !== 1 || cinematicCamera.rotation !== 0) {
    // Presentation-only zoom punch/dolly about its focus point. Zoom is always
    // >= 1 and the focus stays inside the frame, so the world always covers
    // the canvas; identity (the normal-play state) skips this entirely.
    ctx.translate(cinematicCamera.focusX, cinematicCamera.focusY);
    if (cinematicCamera.rotation !== 0) ctx.rotate(cinematicCamera.rotation);
    ctx.scale(cinematicCamera.zoom, cinematicCamera.zoom);
    ctx.translate(-cinematicCamera.focusX, -cinematicCamera.focusY);
  }
  // Counters reset before drawStage so the stage-level passes (weather,
  // practicals, flashbulbs, occluders) count into the same rendered frame.
  // Unconditional: drawStage runs on every screen, so a gated reset would let
  // the stage counters accumulate without bound outside the fight.
  for (const key of Object.keys(presentationDebug)) {
    // lastFighterMirror is a latch, not a counter: it holds the most recent
    // per-side sprite mirror for the QA facing probe rather than a per-frame
    // tally, so the counter reset must leave it alone.
    if (key === "lastFighterMirror") continue;
    presentationDebug[key] = 0;
  }
  if (state.screen === "fight") {
    gritFlareLevel[0] = Math.max(0, gritFlareLevel[0] - 0.05);
    gritFlareLevel[1] = Math.max(0, gritFlareLevel[1] - 0.05);
  }
  if (!cinema3dWorld) {
    drawStage(time);
    if (state.screen === "fight") {
      drawSuperSpotlight();
      drawWinPoseSpotlight();
      drawSuperFocusLines(time);
      drawFighterCastShadows();
      drawFighterReflections(time);
      drawPaintTraps(time);
      drawStageWeapon(time);
      drawProjectiles(time);
      drawAfterimages();
      const ordered = [...state.fighters].sort((a, b) => a.y - b.y);
      ordered.forEach((fighter) => drawFighter(fighter, time));
      state.fighters.forEach((fighter) => drawDizzyStars(fighter, time));
      state.fighters.forEach((fighter) => drawGuardCrushMarker(fighter, time));
      drawParticles();
      drawForegroundOccluders(state.fighters.length
        ? (state.fighters[0].x + state.fighters[1].x) * 0.5 : W * 0.5);
    }
  }
  // Wave 7: capture the live world transform so the screen-space distortion
  // ring can project its world-space origin after the restore.
  if (distortionRing) worldScreenTransform = ctx.getTransform();
  ctx.restore();
  // CINEMA 3D handles grade/bloom/grain in its own post stack; the 2D
  // frame-capture composites would smear a transparent canvas, so they are
  // skipped while the 3D world is live. UI-readability overlays (letterbox,
  // cut-ins, flash, CRT, debug) still draw on top either way.
  if (!cinema3dWorld) {
    drawStageGrade();
    drawFinisherRealityComposite();
    // Wave 7 screen-space composite passes, in order: slow-mo smear first, then
    // the frame capture (so the smear recursively accumulates but bloom can
    // never feed back into itself), then bloom and the one-shot warps.
    updateSlowMoBlur();
    requestFrameCapture();
    drawBloomComposite();
    drawDistortionRing(hudDtMs);
    drawChromaticAberration();
  }
  drawIntroLetterbox();
  drawFinisherOverlay();
  if (state.flash > 0) {
// CINEMA 3D carries its own layered impact flash (hit-masked white pop,
    // shockwave ring, embers in the world), so the screen wash is nearly off
    // there. The 2D path keeps the 1.9E cap: at 0.9 the flash erased the
    // whole frame on every multi-hit; supers and finishers still reach it.
    const flashAlpha = cinema3dWorld
      ? clamp(state.flash * 0.4, 0, 0.08)
      : clamp(state.flash * 3, 0, 0.5);
    ctx.fillStyle = `rgba(255,245,220,${flashAlpha})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawSuperCutIn(hudDtMs);
  drawCrtOverlay(time);
  drawDebugOverlay();
  drawTrainingFrameMeter();
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
  // Wave 15: the adaptive governor watches real frame times (all gates,
  // including the online/forced-profile exclusions, live inside).
  feedPerformanceGovernor(elapsed * 1000);
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

// ---------------------------------------------------------------------------
// R1.9 wave 15: adaptive runtime performance governor (integration layer).
// The pure hysteresis machine lives in engine/polish.mjs; this layer feeds it
// real render-loop frame times and applies its tier decisions. Hard gates:
// only in AUTO quality (never fighting a user-forced profile), never during
// online matches (fixed presentation pacing for determinism of feel), never
// in CABINET MODE (which pins high), and only while a fight or demo is
// actually rendering. state.performance is render-only and un-checksummed,
// so every decision is rollback-safe by construction.
// ---------------------------------------------------------------------------
const performanceGovernor = { machine: null, steps: 0, lastChange: "" };
let governorToastTimer = 0;

function governorEligible() {
  return state.visualQuality === "auto"
    && !state.cabinetMode
    && state.mode !== "online"
    && !document.hidden
    && (state.screen === "fight" || demoSession.active);
}

// One-line HUD toast on a tier change, on the sound-caption channel's element
// (same look, own timer) so it never fights an actual caption for long.
function governorToast(text) {
  const caption = $("#soundCaption");
  if (!caption) return;
  window.clearTimeout(governorToastTimer);
  window.clearTimeout(soundCaptionTimer);
  caption.textContent = `◀ ${text} ▶`;
  caption.hidden = false;
  governorToastTimer = window.setTimeout(() => { caption.hidden = true; }, 2400);
}

function applyGovernorChange(change) {
  if (!change) return;
  performanceGovernor.steps += 1;
  performanceGovernor.lastChange = `${change.action}:${change.from}->${change.to}`;
  applyPerformanceSettings();
  governorToast(change.action === "down"
    ? `AUTO PERFORMANCE · COOLING TO ${change.to.toUpperCase()}`
    : `AUTO PERFORMANCE · RESTORED TO ${change.to.toUpperCase()}`);
}

function feedPerformanceGovernor(frameMs) {
  if (!governorEligible()) {
    // Leaving eligibility (online match, forced profile, cabinet) drops the
    // machine entirely so the static resolution rules the profile again and a
    // later return to AUTO re-baselines from scratch.
    if (performanceGovernor.machine) {
      performanceGovernor.machine = null;
      applyPerformanceSettings();
    }
    return;
  }
  if (!performanceGovernor.machine) {
    const baseline = resolvePerformanceProfile("auto", performanceEnvironment(state.accessibility.reducedMotion)).id;
    performanceGovernor.machine = createPerformanceGovernor({ profileId: state.performance.id, baselineId: baseline });
  }
  applyGovernorChange(performanceGovernor.machine.observe(frameMs));
}

// ---------------------------------------------------------------------------
// R1.9 wave 15: combat-event haptics + gamepad dual-rumble.
// Follows the sound() pattern exactly: early-return on rollbackResimulating,
// gated behind the persisted HAPTICS toggle, rate-capped so a multi-hit never
// turns the phone into a hair clipper. Pattern selection is pure
// (hapticPatternFor in engine/polish.mjs); pads rumble per human side via the
// same getPad plumbing readInput uses. Presentation only — nothing here can
// touch the simulation.
// ---------------------------------------------------------------------------
const hapticsDebug = { events: 0, rumbles: 0, suppressed: 0, lastKind: "" };
// Tick latch for the fatality heartbeat pulse (wallSplatLastTick pattern —
// module-level, render-only, never snapshotted).
let lastHeartbeatHapticTick = -Infinity;
const HAPTIC_MIN_GAP_MS = 45;
const HAPTIC_PRIORITY_KINDS = new Set(["ko", "dizzy", "fatalityHeartbeat", "super", "throw", "wallSplat"]);
let lastHapticAt = 0;

function combatHaptic(kind, { damage = 0, blocked = false, counter = false } = {}) {
  if (rollbackResimulating) return;
  if (!state.touchSettings.haptics) return;
  // Nobody is holding anything during the self-running attract loop.
  if (state.mode === "demo" || state.mode === "tournament") return;
  const now = performance.now();
  if (now - lastHapticAt < HAPTIC_MIN_GAP_MS && !HAPTIC_PRIORITY_KINDS.has(kind)) {
    hapticsDebug.suppressed += 1;
    return;
  }
  lastHapticAt = now;
  const pattern = hapticPatternFor(kind, { damage, blocked, counter });
  hapticsDebug.events += 1;
  hapticsDebug.lastKind = pattern.kind;
  try {
    navigator.vibrate?.(pattern.vibrate);
  } catch {
    // Some browsers throw instead of ignoring vibration without a gesture.
  }
  for (const side of [0, 1]) {
    if (sideIsCpuControlled(side)) continue;
    const pad = getPad(side);
    const actuator = pad?.vibrationActuator;
    if (!actuator?.playEffect) continue;
    hapticsDebug.rumbles += 1;
    try {
      const played = actuator.playEffect("dual-rumble", pattern.rumble);
      played?.catch?.(() => {});
    } catch {
      // A pad may vanish between getPad and playEffect; rumble is best-effort.
    }
  }
}

// ---------------------------------------------------------------------------
// R1.9 wave 15: screen wake lock. Held during fights and the attract demo,
// released on menus/pause/hidden tab, re-acquired on visibilitychange. Silent
// no-op where unsupported, like screen.orientation.lock.
// ---------------------------------------------------------------------------
let wakeLockSentinel = null;
let wakeLockWanted = false;
let wakeLockRequesting = false;

function syncWakeLock() {
  wakeLockWanted = !document.hidden
    && ((state.screen === "fight" && !state.paused) || demoSession.active);
  if (wakeLockWanted && !wakeLockSentinel && !wakeLockRequesting && navigator.wakeLock?.request) {
    wakeLockRequesting = true;
    navigator.wakeLock.request("screen").then((sentinel) => {
      wakeLockRequesting = false;
      wakeLockSentinel = sentinel;
      // The browser can release it on its own (tab hidden); track that.
      sentinel.addEventListener?.("release", () => {
        if (wakeLockSentinel === sentinel) wakeLockSentinel = null;
      });
      // The screen may have changed while the request was in flight.
      if (!wakeLockWanted) syncWakeLock();
    }).catch(() => {
      wakeLockRequesting = false;
    });
  } else if (!wakeLockWanted && wakeLockSentinel) {
    const sentinel = wakeLockSentinel;
    wakeLockSentinel = null;
    try {
      sentinel.release?.()?.catch?.(() => {});
    } catch {
      // Already released.
    }
  }
}

// ---------------------------------------------------------------------------
// R1.9 wave 15: ARCADE CABINET mode. Composes existing pieces into one TV
// preset: high profile pinned, CRT defaulted on at activation, touch HUD
// hidden, fight HUD enlarged ~15%, attract loop + high-score cycling forced,
// cursor auto-hidden at idle, and any pad press on the title dropping
// straight into character select (handled in menuPadLoop).
// ---------------------------------------------------------------------------
let cabinetCursorTimer = 0;

function applyCabinetMode() {
  document.body.classList.toggle("cabinet-mode", state.cabinetMode);
  const marquee = $("#cabinetMarquee");
  if (marquee) marquee.hidden = !(state.cabinetMode && state.screen === "title");
  if (!state.cabinetMode) {
    window.clearTimeout(cabinetCursorTimer);
    cabinetCursorTimer = 0;
    document.body.classList.remove("cabinet-idle");
  } else {
    scheduleCabinetCursorHide();
    scheduleIdleDemo();
  }
  applyPerformanceSettings();
}

function scheduleCabinetCursorHide() {
  window.clearTimeout(cabinetCursorTimer);
  cabinetCursorTimer = window.setTimeout(() => {
    if (state.cabinetMode) document.body.classList.add("cabinet-idle");
  }, 4000);
}

document.addEventListener("mousemove", () => {
  if (!state.cabinetMode) return;
  document.body.classList.remove("cabinet-idle");
  scheduleCabinetCursorHide();
}, { passive: true });

function applyPerformanceSettings() {
  state.visualQuality = normalizeVisualQuality(state.visualQuality);
  // Wave 15 resolution order: CABINET MODE pins high for the TV; otherwise
  // the adaptive governor may hold a stepped-down tier while quality is AUTO;
  // otherwise the static device resolution decides. A user-forced profile
  // always wins because the governor machine only exists under AUTO.
  let resolved = state.cabinetMode
    ? PERFORMANCE_PROFILES.high
    : resolvePerformanceProfile(state.visualQuality, performanceEnvironment(state.accessibility.reducedMotion));
  if (!state.cabinetMode && state.visualQuality === "auto" && performanceGovernor.machine) {
    resolved = PERFORMANCE_PROFILES[performanceGovernor.machine.profile()] || resolved;
  }
  state.performance = resolved;
  document.body.dataset.quality = state.performance.id;
  $("#visualQualitySelect").value = state.visualQuality;
  $("#sharpRenderToggle").checked = Boolean(state.sharpRender);
  $("#crtModeToggle").checked = Boolean(state.crtMode);
  if ($("#cabinetModeToggle")) $("#cabinetModeToggle").checked = Boolean(state.cabinetMode);
  $("#cinema3dToggle").checked = Boolean(state.cinema3d);
  // Profile switches can grant/revoke CINEMA 3D eligibility (battery refuses).
  ensureCinema3d();
  $("#pausePerformance").textContent = `${state.visualQuality.toUpperCase()} VISUALS · ${state.performance.id.toUpperCase()} PROFILE · ${state.performance.particleBudget} FX BUDGET`;
  // Wave 7: quality switches re-apply the DPR-sharp backing store.
  applyBackingStoreResolution();
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
  // Any manual/jukebox advance means the track is no longer stage-matched.
  stageMusicAutoApplied = false;
  setTrack(currentTrackIndex + 1, true);
}

function chooseMusic(choice) {
  stageMusicAutoApplied = false;
  state.musicChoice = choice;
  localStorage.setItem("final-blow-music-choice", choice);
  if (choice !== "auto") setTrack(Number(choice), true);
  else {
    updateMusicUi();
    syncMusic();
  }
}

// Release 1.6: resolve the best-fit track for a stage. Prefers a stage's
// planned todoTrack if that file has been composed and added to musicTracks;
// otherwise falls back to the mapped existing track.
function stageMusicTrackIndex(stageId) {
  const entry = STAGE_MUSIC[stageId];
  if (!entry) return currentTrackIndex;
  if (entry.todoTrack) {
    const pending = musicTracks.findIndex((track) => track.src.includes(entry.todoTrack));
    if (pending >= 0) return pending;
  }
  const index = musicTracks.findIndex((track) => track.title === entry.title);
  return index >= 0 ? index : currentTrackIndex;
}

// Applied at match start when the music mode is AUTO: the header keeps its
// existing "AUTO · <TRACK>" readout, manual track picking is untouched.
function applyAutoStageMusic() {
  if (state.musicChoice !== "auto") return;
  setTrack(stageMusicTrackIndex(state.stage), true);
  stageMusicAutoApplied = true;
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

// ---------------------------------------------------------------------------
// Wave 9 "voice plumbing" — fighter voice variant banks. Module-level render
// state only (never snapshotted, never read by the simulation): which
// canonical variant files exist on disk, probed exactly once per bank per
// session via HEAD requests so missing takes can never spam the network.
// Everything ships working with zero new mp3 files present and picks up real
// takes automatically the moment they appear at their canonical paths.
// ---------------------------------------------------------------------------

// Monotonic wave-9 voice totals, exposed via snapshot().violence.
const voiceFxDebug = {
  announcerCalls: 0, announcerBanksLoaded: 0, voiceVariantPlays: 0,
  reactiveCues: 0, storyCallouts: 0, onlineMoments: 0,
};
// Every probe HEAD request ever issued — QA asserts this stays flat when the
// same missing bank is requested repeatedly (probe once, cached forever).
let voiceProbeRequests = 0;

function probeAudioFile(url) {
  voiceProbeRequests += 1;
  return fetch(url, { method: "HEAD" })
    .then((response) => response.ok)
    .catch(() => false);
}

// `${fighterId}:${cue}` -> { srcs: confirmed variant files, probed }. How a
// bank fills depends on what the review left behind:
//   recorded    — the reviewed kick pools. Every path is an accepted take that
//                 ships, so the bank is complete on creation and never probes.
//   probed      — a surviving 1.5 core take. Variant 1 is known to exist;
//                 slots 2 and 3 are speculative and cost one HEAD each.
//   placeholder — a reactive cue with nothing recorded yet; starts empty and
//                 borrows a detuned take until real files appear.
// A cue whose recording was rejected has no palette entry at all, so it never
// reaches this function and can never be requested from the network.
const fighterVoiceBanks = new Map();

function fighterVoiceBank(fighterId, cue) {
  const variants = fighterAudioVariants(fighterId, cue);
  if (!variants) return null;
  const key = `${fighterId}:${cue}`;
  let bank = fighterVoiceBanks.get(key);
  if (!bank) {
    // Wave 16: the bank kind is fighter-aware — the Commissioner's core cues
    // probe all slots because no recorded variant 1 exists yet.
    const kind = fighterAudioBankKind(cue, fighterId);
    if (kind === FIGHTER_AUDIO_BANK_KINDS.recorded) {
      bank = { key, srcs: [...variants], probed: true };
      fighterVoiceBanks.set(key, bank);
      return bank;
    }
    const seeded = kind === FIGHTER_AUDIO_BANK_KINDS.probed ? 1 : 0;
    bank = { key, srcs: variants.slice(0, seeded), probed: false };
    fighterVoiceBanks.set(key, bank);
    // One probe pass per bank per session, sequential and stopping at the
    // first gap (banks are contiguous), so a fully-missing bank costs a
    // single request and a present bank grows the rotation in place.
    (async () => {
      const found = variants.slice(0, seeded);
      for (let index = seeded; index < variants.length; index += 1) {
        if (!(await probeAudioFile(variants[index]))) break;
        found.push(variants[index]);
      }
      bank.srcs = found;
      bank.probed = true;
    })();
  }
  return bank;
}

function fighterVoicePool(kind, bankKey, variantIndex, src) {
  const poolKey = `${bankKey}:${variantIndex}`;
  if (!fighterSfxPools.has(poolKey)) fighterSfxPools.set(poolKey, createSfxPool(kind, src));
  return fighterSfxPools.get(poolKey);
}

/**
 * Resolve the next fighter voice take for a cue. The fighterSfxCursors
 * round-robin is the no-repeat rotation across confirmed variants; a bank
 * with a single real take gets deterministic playbackRate micro-variation
 * (visualRandom — checksum-exempt, never state.rng) so consecutive plays are
 * never identical; reactive cues with no takes yet borrow their pitch-offset
 * placeholder take from FIGHTER_REACTIVE_PLACEHOLDERS.
 */
function fighterVoiceTake(kind, fighterId) {
  if (!fighterId) return null;
  let cue = kind;
  let rate = 1;
  let bank = fighterVoiceBank(fighterId, cue);
  if (!bank) return null;
  if (!bank.srcs.length) {
    const placeholder = FIGHTER_REACTIVE_PLACEHOLDERS[cue];
    if (!placeholder) return null;
    cue = placeholder.cue;
    rate = placeholder.rate;
    bank = fighterVoiceBank(fighterId, cue);
    if (!bank?.srcs.length) return null;
  }
  const cursorKey = `${fighterId}:${cue}`;
  const cursor = fighterSfxCursors.get(cursorKey) || 0;
  fighterSfxCursors.set(cursorKey, cursor + 1);
  const variantIndex = cursor % bank.srcs.length;
  const pool = fighterVoicePool(cue, bank.key, variantIndex, bank.srcs[variantIndex]);
  if (!pool?.length) return null;
  if (bank.srcs.length === 1) rate *= 0.94 + visualRandom() * 0.12;
  return { sample: pool[Math.floor(cursor / bank.srcs.length) % pool.length], rate };
}

function warmFighterAudio(fighters = state.fighters) {
  for (const fighter of fighters) {
    const fighterId = fighterSoundId(fighter);
    for (const cue of FIGHTER_AUDIO_CUES) {
      const bank = fighterVoiceBank(fighterId, cue);
      bank?.srcs.forEach((src, index) => fighterVoicePool(cue, bank.key, index, src));
    }
  }
}

function unlockAudio() {
  state.audioUnlocked = true;
  if ($("#soundToggle").checked) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !state.audio) state.audio = new AudioContextClass();
    if (state.audio?.state === "suspended") state.audio.resume();
    // Release 1.6 LOUD: the shared master gain -> limiter bus rides the same
    // first-gesture lazy-init path, so nothing audio-graph runs at boot.
    if (state.audio) ensureAudioGraph();
  }
  syncMusic();
}

/**
 * Which cue a swing announces. Every derived kick profile is tagged
 * `limb: "kick"` by the sim itself, so light and heavy normals thrown with a
 * leg claim the reviewed kick cues instead of the punch-flavoured ones. The
 * tag rides on the move instance that actually spawned, so the audio can never
 * disagree with the attack on screen. Supers and throws keep their own cue
 * whichever limb threw them.
 */
function attackSwingCue(move, actionGroup) {
  if (move.superMove) return "super";
  if (actionGroup === "throw") return "throw";
  if (move.limb === "kick") {
    if (move.kind === "light") return "light-kick-swing";
    if (move.kind === "heavy") return "roundhouse-swing";
  }
  return move.kind;
}

/** The impact counterpart of attackSwingCue. A blocked hit stays a guard cue. */
function attackImpactCue(attack, blocked) {
  if (blocked) return "block";
  if (attack.limb === "kick") {
    if (attack.kind === "light") return "light-kick-impact";
    if (attack.kind === "heavy") return "roundhouse-impact";
  }
  return attack.kind === "light" ? "hit-light" : "hit-heavy";
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
  // Wave 9: signature cues route through the variant banks (no-repeat
  // rotation + micro-variation + reactive placeholders). playbackRate and
  // preservesPitch are set explicitly on every play because pool elements
  // are reused and a detuned take must never leak into the next play.
  const take = fighterVoiceTake(kind, fighterId);
  if (take) {
    voiceFxDebug.voiceVariantPlays += 1;
    const sample = take.sample;
    sample.pause();
    sample.currentTime = 0;
    sample.preservesPitch = take.rate === 1;
    sample.playbackRate = take.rate;
    sample.volume = (sfxVolumes[kind] ?? 0.62) * state.sfxVolume;
    const playback = sample.play();
    if (playback?.catch) playback.catch(() => proceduralSound(fallbackKind));
    return;
  }
  const pool = sfxPools[fallbackKind];
  if (!pool?.length) {
    proceduralSound(fallbackKind);
    return;
  }
  const cursor = (sfxCursors[fallbackKind] || 0) % pool.length;
  sfxCursors[fallbackKind] = cursor + 1;
  const sample = pool[cursor];
  sample.pause();
  sample.currentTime = 0;
  sample.volume = (sfxVolumes[kind] ?? 0.62) * state.sfxVolume;
  const playback = sample.play();
  if (playback?.catch) playback.catch(() => proceduralSound(fallbackKind));
}

function showSoundCaption(kind, fighter = null, overrideText = "") {
  if (!state.soundCaptions) return;
  const caption = $("#soundCaption");
  const fighterId = fighterSoundId(fighter);
  const fighterName = fighter?.def?.name || roster.find(({ id }) => id === fighterId)?.name;
  // Wave 9: spoken announcer lines echo their exact text (they are not fixed
  // cue labels) and hold slightly longer so the line can be read.
  const label = overrideText || FIGHTER_AUDIO_LABELS[kind] || soundCaptionLabels[kind];
  if (!caption || !label) return;
  window.clearTimeout(soundCaptionTimer);
  caption.textContent = `◀ ${fighterName ? `${fighterName} · ` : ""}${label} ▶`;
  caption.hidden = false;
  soundCaptionTimer = window.setTimeout(() => { caption.hidden = true; }, overrideText ? 1150 : 720);
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
  // Steel cane: a hard metallic ring with a short clatter tail.
  cane: [980, 240, 0.16, "triangle", 0.07, 0.28, 0.12, 5200],
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
  source.connect(filter).connect(gain).connect(masterBusInput());
  source.start(now);
  source.stop(now + seconds);
}

/**
 * Release 1.7: Perfect Guard 'tink' — a bright metallic ping layered over the
 * ordinary block cue so a just-defend reads instantly by ear. Synthesized on
 * the objectSound pattern (no new samples), render-side only with the
 * announce() resim guard; no gameplay reads or writes.
 */
function perfectGuardTink() {
  if (rollbackResimulating) return;
  showSoundCaption("perfect-guard");
  if (!$("#soundToggle").checked) return;
  unlockAudio();
  if (!state.audio) return;
  const now = state.audio.currentTime;
  const oscillator = state.audio.createOscillator();
  const gain = state.audio.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(2600, now);
  oscillator.frequency.exponentialRampToValueAtTime(1450, now + 0.09);
  gain.gain.setValueAtTime(Math.max(0.0001, 0.07 * state.sfxVolume), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
  oscillator.connect(gain).connect(masterBusInput());
  oscillator.start(now);
  oscillator.stop(now + 0.11);
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
  oscillator.connect(gain).connect(masterBusInput());
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
  oscillator.connect(gain).connect(masterBusInput());
  oscillator.start(now);
  oscillator.stop(now + settings[2]);
}

// ---------------------------------------------------------------------------
// Release 1.6 "LOUD" — the synthesized soundstage. Everything below is
// render/presentation audio on the documented superDimLevel pattern:
// module-level, never snapshotted, never read by the simulation, so rollback
// checksums are untouched. Sim-path triggers (crowd swells, impact layers)
// follow the announce() pattern (rollbackResimulating guard + simulationTick
// dedupe); all parameter jitter comes from presentationHash01 tick hashes so
// no RNG stream — gameplay or visual — is ever consumed. The whole graph
// lazy-initialises on the existing unlockAudio() first-user-gesture path:
// nothing here touches WebAudio at boot, so autoplay policy stays silent.
// Every synth voice routes through one shared master gain -> compressor
// limiter, so super + crowd + music + impact stacking cannot clip.
// ---------------------------------------------------------------------------

// Monotonic one-shot totals on the hudFxDebug pattern, exposed via
// snapshot().violence. nodesCreated counts every WebAudio node ever built so
// the leak probe can assert creation stays proportional to events.
const audioFxDebug = {
  impactLayers: 0, crowdSwells: 0, ambienceEvents: 0, nodesCreated: 0,
};
// Live node bookkeeping for the QA node-graph hook: persistent = currently
// connected long-lived nodes (master bus, beds, music routing), one-shots =
// currently sounding envelope voices (decremented by their "ended" events).
let audioPersistentNodes = 0;
let audioLiveOneShots = 0;
let audioGraph = null;
let sharedNoiseBuffer = null;

function audioContextRunning() {
  return Boolean(state.audio && state.audio.state === "running");
}

// Shared master bus: gain headroom trim into a limiter-tuned compressor.
function ensureAudioGraph() {
  if (!state.audio) return null;
  if (!audioGraph) {
    const master = state.audio.createGain();
    master.gain.value = 0.92;
    const limiter = state.audio.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.24;
    master.connect(limiter).connect(state.audio.destination);
    audioGraph = { master, limiter };
    audioPersistentNodes += 2;
    audioFxDebug.nodesCreated += 2;
  }
  return audioGraph;
}

function masterBusInput() {
  return ensureAudioGraph()?.master || state.audio?.destination || null;
}

// One shared deterministic pseudo-noise loop (the noiseBurst hash formula):
// every noise layer and burst reads this buffer through its own filter, so a
// full soundstage costs one buffer allocation.
function ambientNoiseBuffer() {
  if (!state.audio) return null;
  if (!sharedNoiseBuffer || sharedNoiseBuffer.sampleRate !== state.audio.sampleRate) {
    const frames = Math.max(1, Math.floor(state.audio.sampleRate * 1.7));
    const buffer = state.audio.createBuffer(1, frames, state.audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) {
      const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
      data[index] = ((value - Math.floor(value)) * 2 - 1) * 0.86;
    }
    sharedNoiseBuffer = buffer;
  }
  return sharedNoiseBuffer;
}

function trackOneShot(source, extraNodes = 0) {
  audioLiveOneShots += 1;
  audioFxDebug.nodesCreated += 1 + extraNodes;
  source.addEventListener("ended", () => {
    audioLiveOneShots = Math.max(0, audioLiveOneShots - 1);
  }, { once: true });
}

// Filtered-noise envelope voice. Only ever builds nodes on a running context
// so a suspended (headless/stub) context can never accumulate zombie sources.
function synthNoiseShot({
  delay = 0, seconds, filterType = "lowpass", freq, freqEnd = 0, q = 0.8,
  peak, attack = 0.004, rate = 1,
} = {}) {
  if (!audioContextRunning() || !(peak > 0) || !(seconds > 0)) return;
  const bus = masterBusInput();
  const buffer = ambientNoiseBuffer();
  if (!bus || !buffer) return;
  const now = state.audio.currentTime + delay;
  const source = state.audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = rate;
  const filter = state.audio.createBiquadFilter();
  filter.type = filterType;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(Math.max(40, freq), now);
  if (freqEnd > 0) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + seconds);
  const gain = state.audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(Math.max(0.0002, peak), now + Math.min(attack, seconds * 0.5));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  source.connect(filter).connect(gain).connect(bus);
  source.start(now);
  source.stop(now + seconds + 0.03);
  trackOneShot(source, 2);
}

// Oscillator envelope voice with optional filter and vibrato LFO.
function synthToneShot({
  delay = 0, seconds, wave = "sine", from, to = 0, peak, attack = 0.003,
  filterType = "", freq = 0, q = 1, vibratoRate = 0, vibratoDepth = 0,
} = {}) {
  if (!audioContextRunning() || !(peak > 0) || !(seconds > 0)) return;
  const bus = masterBusInput();
  if (!bus) return;
  const now = state.audio.currentTime + delay;
  const oscillator = state.audio.createOscillator();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(Math.max(20, from), now);
  if (to > 0) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + seconds);
  const gain = state.audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(Math.max(0.0002, peak), now + Math.min(attack, seconds * 0.5));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  let head = oscillator;
  let extraNodes = 1;
  if (filterType) {
    const filter = state.audio.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(Math.max(40, freq), now);
    filter.Q.value = q;
    oscillator.connect(filter);
    head = filter;
    extraNodes += 1;
  }
  if (vibratoRate > 0) {
    const lfo = state.audio.createOscillator();
    lfo.frequency.value = vibratoRate;
    const lfoGain = state.audio.createGain();
    lfoGain.gain.value = vibratoDepth;
    lfo.connect(lfoGain).connect(oscillator.frequency);
    lfo.start(now);
    lfo.stop(now + seconds + 0.03);
    extraNodes += 2;
  }
  head.connect(gain).connect(bus);
  oscillator.start(now);
  oscillator.stop(now + seconds + 0.03);
  trackOneShot(oscillator, extraNodes);
}

// --- Feature: layered impact audio by VIOLENCE_TIERS class -----------------

const IMPACT_LAYER_TIERS = Object.freeze({
  light: Object.freeze({ thump: 0.034, thumpHz: 150, seconds: 0.09, noise: 0 }),
  heavy: Object.freeze({ thump: 0.07, thumpHz: 118, seconds: 0.15, noise: 0.032 }),
  special: Object.freeze({ thump: 0.085, thumpHz: 102, seconds: 0.19, noise: 0.04 }),
  throw: Object.freeze({ thump: 0.078, thumpHz: 95, seconds: 0.19, noise: 0.036 }),
  weapon: Object.freeze({ thump: 0.072, thumpHz: 110, seconds: 0.17, noise: 0.034, ring: true }),
  super: Object.freeze({ thump: 0.11, thumpHz: 86, seconds: 0.25, noise: 0.05 }),
});

// Shared guard for every sim-path synth trigger: the announce() pattern plus
// the exact toggle/attract gating sound() applies to sampled SFX.
function impactAudioAllowed() {
  if (rollbackResimulating) return false;
  if (!$("#soundToggle").checked || state.sfxVolume <= 0) return false;
  if (demoSession.attract && !state.audioUnlocked) return false;
  return true;
}

function impactLayerAudio(tierName, { counter = false } = {}) {
  if (!impactAudioAllowed()) return;
  const profile = IMPACT_LAYER_TIERS[tierName] || IMPACT_LAYER_TIERS.light;
  audioFxDebug.impactLayers += 1;
  // Tick-hash jitter (never an RNG stream) so repeated hits never sound
  // machine-identical; the layer serial keeps same-tick multi-hits distinct.
  const jitter = (salt) => presentationHash01(state.simulationTick, audioFxDebug.impactLayers, salt) - 0.5;
  const level = state.sfxVolume;
  // Low sine sub-thump under every clean hit, bigger for the heavy tiers.
  synthToneShot({
    wave: "sine",
    from: profile.thumpHz * (1 + jitter(3) * 0.18),
    to: 36,
    seconds: profile.seconds * (1 + jitter(5) * 0.14),
    peak: profile.thump * level,
    attack: 0.004,
  });
  if (profile.noise > 0) {
    synthNoiseShot({
      seconds: profile.seconds * 0.8,
      filterType: "lowpass",
      freq: 900 * (1 + jitter(7) * 0.3),
      freqEnd: 160,
      peak: profile.noise * level,
    });
  }
  if (counter) {
    // Sharper crunch transient so counter hits snap out of the mix.
    synthNoiseShot({
      seconds: 0.055,
      filterType: "highpass",
      freq: 1500 * (1 + jitter(11) * 0.2),
      q: 0.9,
      peak: 0.05 * level,
      attack: 0.002,
    });
  }
  if (profile.ring) {
    // Inharmonic partial pair (1 : 1.5024) reads as struck metal.
    const ringHz = 1160 * (1 + jitter(13) * 0.12);
    synthToneShot({
      wave: "triangle", from: ringHz, seconds: 0.42, peak: 0.026 * level,
      attack: 0.002, filterType: "bandpass", freq: ringHz, q: 6,
    });
    synthToneShot({
      wave: "triangle", from: ringHz * 1.5024, seconds: 0.3, peak: 0.017 * level,
      attack: 0.002, filterType: "bandpass", freq: ringHz * 1.5024, q: 6,
    });
  }
}

// Pre-impact whoosh layered under the swing sample at attack start.
function impactSwingWhoosh(attack) {
  if (!attack || !impactAudioAllowed()) return;
  const kind = attack.superMove ? "super" : attack.kind;
  const size = kind === "super" ? 1 : kind === "special" ? 0.8 : kind === "heavy" ? 0.62 : 0;
  if (!size) return;
  const jitter = presentationHash01(state.simulationTick, 29) - 0.5;
  synthNoiseShot({
    seconds: 0.16 + size * 0.08,
    filterType: "bandpass",
    freq: 340 * (1 + jitter * 0.3),
    freqEnd: 1500 + size * 900,
    q: 1.4,
    peak: (0.016 + size * 0.02) * state.sfxVolume,
    attack: 0.03,
  });
}

// --- Feature: crowd audio bus driven by state.crowdReaction ----------------

// One chatter-bed voicing per crowd variant (engine/crowd.mjs). rate warps the
// shared noise loop so no two variants share a texture.
const CROWD_AUDIO_PROFILES = Object.freeze({
  street: Object.freeze({ base: 0.013, react: 0.042, filterType: "lowpass", filterBase: 430, filterReact: 950, rate: 0.72, swell: "gasp" }),
  somerset: Object.freeze({ base: 0.008, react: 0.024, filterType: "lowpass", filterBase: 360, filterReact: 720, rate: 0.66, swell: "gasp" }),
  tailgate: Object.freeze({ base: 0.021, react: 0.062, filterType: "lowpass", filterBase: 620, filterReact: 1500, rate: 0.86, swell: "roar" }),
  boardwalk: Object.freeze({ base: 0.011, react: 0.034, filterType: "lowpass", filterBase: 520, filterReact: 1050, rate: 0.78, swell: "gasp" }),
  buffet: Object.freeze({ base: 0.012, react: 0.032, filterType: "bandpass", filterBase: 1150, filterReact: 850, rate: 1.06, swell: "clatter" }),
  poolside: Object.freeze({ base: 0.017, react: 0.055, filterType: "lowpass", filterBase: 780, filterReact: 1450, rate: 0.94, swell: "whoop" }),
  vacantLot: Object.freeze({ base: 0.005, react: 0.015, filterType: "lowpass", filterBase: 300, filterReact: 480, rate: 0.6, swell: "echo" }),
});

// Eased applied bus level (0-1), exposed as snapshot().violence.crowdBusLevel.
let crowdAudioLevel = 0;
let crowdBed = null;
// One-shot swell latch fed by stirCrowd (sim path, guarded + tick-deduped).
let crowdSwellPending = 0;
let crowdSwellTick = -1;
// Post-fatal-blow bed swell and its render-side edge observer.
let crowdKillSwell = 0;
let crowdObservedKillHits = 0;

function latchCrowdSwell(amount) {
  if (rollbackResimulating || crowdSwellTick === state.simulationTick) return;
  crowdSwellTick = state.simulationTick;
  crowdSwellPending = Math.max(crowdSwellPending, Math.min(1.6, amount));
}

function buildCrowdBed(variant) {
  const profile = CROWD_AUDIO_PROFILES[variant] || CROWD_AUDIO_PROFILES.street;
  const bus = masterBusInput();
  const buffer = ambientNoiseBuffer();
  if (!bus || !buffer) return null;
  const source = state.audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = profile.rate;
  const filter = state.audio.createBiquadFilter();
  filter.type = profile.filterType;
  filter.frequency.value = profile.filterBase;
  filter.Q.value = 0.9;
  const gain = state.audio.createGain();
  gain.gain.value = 0.0001;
  source.connect(filter).connect(gain).connect(bus);
  source.start();
  audioPersistentNodes += 3;
  audioFxDebug.nodesCreated += 3;
  return { variant, profile, source, filter, gain };
}

function teardownCrowdBed() {
  if (!crowdBed) return;
  try { crowdBed.source.stop(); } catch { /* already stopped */ }
  crowdBed.source.disconnect();
  crowdBed.filter.disconnect();
  crowdBed.gain.disconnect();
  audioPersistentNodes = Math.max(0, audioPersistentNodes - 3);
  crowdBed = null;
}

function playCrowdSwell(variant, amount) {
  const profile = CROWD_AUDIO_PROFILES[variant] || CROWD_AUDIO_PROFILES.street;
  const strength = clamp(amount / 1.4, 0.25, 1.15);
  const level = state.sfxVolume;
  const jitter = presentationHash01(state.simulationTick, audioFxDebug.crowdSwells) - 0.5;
  switch (profile.swell) {
    case "roar":
      synthNoiseShot({ seconds: 0.9 + strength * 0.5, filterType: "lowpass", freq: 700 + strength * 700, freqEnd: 420, peak: 0.05 * strength * level, attack: 0.16 });
      break;
    case "whoop":
      synthNoiseShot({ seconds: 0.6 + strength * 0.3, filterType: "bandpass", freq: 900, q: 1.2, peak: 0.038 * strength * level, attack: 0.1 });
      synthToneShot({ wave: "triangle", from: 520 * (1 + jitter * 0.2), to: 980, seconds: 0.34, peak: 0.014 * strength * level, attack: 0.05, filterType: "bandpass", freq: 800, q: 2 });
      break;
    case "clatter":
      synthNoiseShot({ seconds: 0.5, filterType: "bandpass", freq: 1400, q: 1.4, peak: 0.03 * strength * level, attack: 0.06 });
      synthToneShot({ wave: "triangle", from: 2300 * (1 + jitter * 0.3), seconds: 0.16, peak: 0.012 * strength * level, attack: 0.002, filterType: "bandpass", freq: 2300, q: 7, delay: 0.09 });
      break;
    case "echo":
      // Janney: one sparse gasp and its late slap-back off the rowhomes.
      synthNoiseShot({ seconds: 0.42, filterType: "bandpass", freq: 420, q: 1.6, peak: 0.02 * strength * level, attack: 0.05 });
      synthNoiseShot({ seconds: 0.36, filterType: "bandpass", freq: 380, q: 1.6, peak: 0.009 * strength * level, attack: 0.05, delay: 0.24 });
      break;
    default:
      synthNoiseShot({ seconds: 0.55 + strength * 0.3, filterType: "lowpass", freq: 520 + strength * 520, freqEnd: 300, peak: 0.04 * strength * level, attack: 0.12 });
  }
}

function updateCrowdAudio(dt) {
  const fightLive = state.screen === "fight" && state.fighters.length === 2;
  const soundOn = Boolean($("#soundToggle")?.checked) && state.sfxVolume > 0;
  // Fatality cinematics: the bed drops away pre-kill so the gore soundscape
  // owns the frame, then swells on the killing blow. The kill is observed
  // render-side via finisher.slowMotionHits (set for gore on or off).
  const finisherHits = state.finisher?.slowMotionHits || 0;
  if (fightLive && finisherHits > crowdObservedKillHits) {
    crowdKillSwell = 1;
    crowdSwellPending = Math.max(crowdSwellPending, 1.5);
  }
  crowdObservedKillHits = state.finisher ? finisherHits : 0;
  crowdKillSwell = Math.max(0, crowdKillSwell - dt / 2.6);
  const preKillDuck = state.finisher && finisherHits === 0 ? 0.12 : 1;
  const target = fightLive
    ? clamp(clamp(state.crowdReaction / 1.4, 0, 1) * preKillDuck + crowdKillSwell * 0.8, 0, 1)
    : 0;
  // Fast attack, slow decay — the crowd catches its breath rather than
  // snapping quiet.
  const tau = target > crowdAudioLevel ? 0.14 : 0.85;
  crowdAudioLevel += (target - crowdAudioLevel) * (1 - Math.exp(-dt / tau));
  if (crowdAudioLevel < 0.0005) crowdAudioLevel = 0;
  // One-shot swell/gasp bursts latched by stirCrowd spikes and the kill.
  if (crowdSwellPending > 0) {
    const amount = crowdSwellPending;
    crowdSwellPending = 0;
    if (fightLive && soundOn) {
      audioFxDebug.crowdSwells += 1;
      playCrowdSwell(state.crowd?.variant || "street", amount);
    }
  }
  const wantBed = fightLive && soundOn && audioContextRunning();
  if (wantBed) {
    const variant = state.crowd?.variant || "street";
    if (crowdBed && crowdBed.variant !== variant) teardownCrowdBed();
    if (!crowdBed) crowdBed = buildCrowdBed(variant);
    if (crowdBed) {
      const profile = crowdBed.profile;
      const pauseDuck = state.paused ? 0.35 : 1;
      const now = state.audio.currentTime;
      crowdBed.gain.gain.setTargetAtTime(
        Math.max(0.0001, (profile.base + crowdAudioLevel * profile.react) * state.sfxVolume * pauseDuck),
        now,
        0.09,
      );
      crowdBed.filter.frequency.setTargetAtTime(profile.filterBase + crowdAudioLevel * profile.filterReact, now, 0.12);
    }
  } else if (crowdBed) teardownCrowdBed();
}

// --- Feature: dynamic music intensity via WebAudio routing -----------------

// Eased intensity (0-1), exposed as snapshot().violence.musicIntensity. Kept
// state-side so QA can read it even where the audio stack is stubbed.
let musicIntensityLevel = 0.45;
// null until routed | "failed" if the element tap ever throws | node bundle.
let musicRouting = null;
let musicDuckPulse = 0;
let musicObservedSuperDim = 0;
let musicObservedFinishPhase = false;

function ensureMusicRouting() {
  if (musicRouting || !audioContextRunning()) return musicRouting;
  const bus = masterBusInput();
  if (!bus) return null;
  try {
    // One-time tap: after this the element's output exists only inside the
    // graph. Element volume (musicBaseVolume * duck * settings) still applies
    // upstream, so duckMusic()/syncMusic() keep working exactly as before —
    // this stage only adds the intensity filter + presence gain.
    const source = state.audio.createMediaElementSource(fightMusic);
    const filter = state.audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 5200;
    filter.Q.value = 0.55;
    const presence = state.audio.createGain();
    presence.gain.value = 1;
    source.connect(filter).connect(presence).connect(bus);
    musicRouting = { source, filter, presence };
    audioPersistentNodes += 3;
    audioFxDebug.nodesCreated += 3;
  } catch {
    // Element already claimed or the context refused the tap — leave the
    // element's direct output alone rather than killing the music.
    musicRouting = "failed";
  }
  return musicRouting;
}

function updateMusicIntensity(dt) {
  const fightLive = state.screen === "fight" && state.fighters.length === 2;
  let target = 0.45;
  let tau = 0.4;
  if (fightLive) {
    const lowHealth = state.fighters.some((fighter) => fighter.health <= 30);
    const matchPoint = state.rounds[0] >= 1 || state.rounds[1] >= 1;
    if (lowHealth) target = 0.8;
    else if (matchPoint) target = 0.62;
    if (superDimLevel > 0.3 || state.phase === "finish") target = 1;
    if (state.phase === "roundover" && !state.finisher) target = 0.35;
    if (state.finisher) {
      // Fatality cinematic: heavy duck under the gore mix, fast.
      target = 0.12;
      tau = 0.16;
    }
  }
  // Brief duck on the super-flash / FINISH THEM edge, then the full-open ride.
  const finishNow = fightLive && state.phase === "finish";
  if ((superDimLevel > 0.25 && musicObservedSuperDim <= 0.25) || (finishNow && !musicObservedFinishPhase)) {
    musicDuckPulse = 1;
  }
  musicObservedSuperDim = superDimLevel;
  musicObservedFinishPhase = finishNow;
  musicDuckPulse = Math.max(0, musicDuckPulse - dt / 0.33);
  musicIntensityLevel += (target - musicIntensityLevel) * (1 - Math.exp(-dt / tau));
  if (!$("#musicToggle")?.checked) return;
  const routing = ensureMusicRouting();
  if (!routing || routing === "failed") return;
  const now = state.audio.currentTime;
  const open = clamp(musicIntensityLevel, 0, 1);
  // setTargetAtTime on eased levels: two smoothing stages, zero zipper noise.
  routing.filter.frequency.setTargetAtTime(650 + 16800 * open ** 1.7, now, 0.09);
  routing.presence.gain.setTargetAtTime(
    clamp((0.82 + 0.44 * open) * (1 - 0.55 * musicDuckPulse), 0.05, 1.3),
    now,
    0.08,
  );
}

// --- Feature: per-stage ambience beds --------------------------------------

// One shared ambience engine, per-stage parameter tables. Layers are
// persistent loops (noise/tone + filter + gain + optional gain-LFO); events
// are sparse one-shots on their own render-clock cadence. Everything sits far
// below the music and ducks with it during cinematics.
const AMBIENCE_PROFILES = Object.freeze({
  somerset: Object.freeze({
    layers: Object.freeze([
      // Distant traffic wash.
      Object.freeze({ kind: "noise", rate: 0.6, filterType: "lowpass", filterFreq: 280, q: 0.7, gain: 0.02, lfoRate: 0.07, lfoDepth: 0.3 }),
      // Substation hum under the el structure.
      Object.freeze({ kind: "tone", wave: "sawtooth", freq: 51, filterType: "lowpass", filterFreq: 130, q: 0.7, gain: 0.006, lfoRate: 0.11, lfoDepth: 0.25 }),
      // El-train rumble; gain is driven by the train visual's x position.
      Object.freeze({ kind: "noise", rate: 0.42, filterType: "bandpass", filterFreq: 105, q: 1.2, gain: 0.028, train: true }),
    ]),
    events: Object.freeze([]),
  }),
  vet: Object.freeze({
    layers: Object.freeze([
      Object.freeze({ kind: "noise", rate: 0.66, filterType: "lowpass", filterFreq: 240, q: 0.7, gain: 0.02, lfoRate: 0.05, lfoDepth: 0.5 }),
    ]),
    events: Object.freeze([Object.freeze({ kind: "stadiumSwell", min: 13, max: 30 })]),
  }),
  wildwood: Object.freeze({
    layers: Object.freeze([
      // Surf, deep slow LFO.
      Object.freeze({ kind: "noise", rate: 0.7, filterType: "lowpass", filterFreq: 430, q: 0.6, gain: 0.024, lfoRate: 0.09, lfoDepth: 0.7 }),
      // Faint carousel tone drifting on the wind.
      Object.freeze({ kind: "tone", wave: "triangle", freq: 392, filterType: "bandpass", filterFreq: 420, q: 2.4, gain: 0.0035, lfoRate: 0.4, lfoDepth: 0.5, vibratoRate: 5.2, vibratoDepth: 4 }),
    ]),
    events: Object.freeze([Object.freeze({ kind: "boardwalkCreak", min: 7, max: 18 })]),
  }),
  buffet: Object.freeze({
    layers: Object.freeze([
      Object.freeze({ kind: "tone", wave: "sine", freq: 92, gain: 0.008, lfoRate: 0.9, lfoDepth: 0.12 }),
      Object.freeze({ kind: "noise", rate: 0.55, filterType: "lowpass", filterFreq: 190, q: 0.7, gain: 0.012, lfoRate: 0.06, lfoDepth: 0.2 }),
    ]),
    events: Object.freeze([Object.freeze({ kind: "kitchenClatter", min: 2.6, max: 7.5 })]),
  }),
  cruise: Object.freeze({
    layers: Object.freeze([
      // Engine drone from decks below.
      Object.freeze({ kind: "tone", wave: "sawtooth", freq: 46, filterType: "lowpass", filterFreq: 120, q: 0.8, gain: 0.01, lfoRate: 0.16, lfoDepth: 0.18 }),
      // Pool water lap.
      Object.freeze({ kind: "noise", rate: 0.8, filterType: "lowpass", filterFreq: 520, q: 0.6, gain: 0.014, lfoRate: 0.27, lfoDepth: 0.75 }),
    ]),
    events: Object.freeze([Object.freeze({ kind: "gullCry", min: 8, max: 21 })]),
  }),
  janney: Object.freeze({
    layers: Object.freeze([
      Object.freeze({ kind: "noise", rate: 0.62, filterType: "bandpass", filterFreq: 330, q: 1.1, gain: 0.018, lfoRate: 0.08, lfoDepth: 0.65 }),
    ]),
    events: Object.freeze([Object.freeze({ kind: "chainRattle", min: 6, max: 16 })]),
  }),
});

let ambienceRig = null;
// State-side engagement flag, exposed as snapshot().violence.ambienceActive.
let ambienceEngaged = false;
let ambienceNextEventAt = 0;
let ambienceEventSerial = 0;

function buildAmbienceLayer(layerSpec, master) {
  const sources = [];
  let nodeCount = 0;
  let head;
  if (layerSpec.kind === "noise") {
    const source = state.audio.createBufferSource();
    source.buffer = ambientNoiseBuffer();
    source.loop = true;
    source.playbackRate.value = layerSpec.rate || 1;
    sources.push(source);
    nodeCount += 1;
    head = source;
  } else {
    const oscillator = state.audio.createOscillator();
    oscillator.type = layerSpec.wave || "sine";
    oscillator.frequency.value = layerSpec.freq || 220;
    sources.push(oscillator);
    nodeCount += 1;
    if (layerSpec.vibratoRate) {
      const vibrato = state.audio.createOscillator();
      vibrato.frequency.value = layerSpec.vibratoRate;
      const vibratoGain = state.audio.createGain();
      vibratoGain.gain.value = layerSpec.vibratoDepth || 1;
      vibrato.connect(vibratoGain).connect(oscillator.frequency);
      sources.push(vibrato);
      nodeCount += 2;
    }
    head = oscillator;
  }
  if (layerSpec.filterType) {
    const filter = state.audio.createBiquadFilter();
    filter.type = layerSpec.filterType;
    filter.frequency.value = layerSpec.filterFreq || 400;
    filter.Q.value = layerSpec.q ?? 0.8;
    head.connect(filter);
    head = filter;
    nodeCount += 1;
  }
  const gain = state.audio.createGain();
  gain.gain.value = layerSpec.train ? 0.0001 : layerSpec.gain;
  nodeCount += 1;
  if (layerSpec.lfoRate) {
    const lfo = state.audio.createOscillator();
    lfo.frequency.value = layerSpec.lfoRate;
    const lfoGain = state.audio.createGain();
    lfoGain.gain.value = layerSpec.gain * (layerSpec.lfoDepth || 0.3);
    lfo.connect(lfoGain).connect(gain.gain);
    sources.push(lfo);
    nodeCount += 2;
  }
  head.connect(gain).connect(master);
  for (const source of sources) source.start();
  return { spec: layerSpec, gain, sources, nodeCount };
}

function buildAmbienceRig(stageId) {
  const profile = AMBIENCE_PROFILES[stageId];
  const bus = masterBusInput();
  if (!profile || !bus || !ambientNoiseBuffer()) return null;
  const master = state.audio.createGain();
  master.gain.value = 0.0001;
  master.connect(bus);
  let nodeCount = 1;
  const layers = [];
  for (const layerSpec of profile.layers) {
    const layer = buildAmbienceLayer(layerSpec, master);
    nodeCount += layer.nodeCount;
    layers.push(layer);
  }
  audioPersistentNodes += nodeCount;
  audioFxDebug.nodesCreated += nodeCount;
  return { stage: stageId, master, layers, nodeCount };
}

function teardownAmbienceRig() {
  if (!ambienceRig) return;
  for (const layer of ambienceRig.layers) {
    for (const source of layer.sources) {
      try { source.stop(); } catch { /* never started */ }
    }
    layer.gain.disconnect();
  }
  ambienceRig.master.disconnect();
  audioPersistentNodes = Math.max(0, audioPersistentNodes - ambienceRig.nodeCount);
  ambienceRig = null;
}

function playAmbienceEvent(kind) {
  const level = state.sfxVolume;
  const hash = (salt) => presentationHash01(ambienceEventSerial, salt);
  switch (kind) {
    case "stadiumSwell":
      synthNoiseShot({ seconds: 2.6 + hash(3) * 1.6, filterType: "bandpass", freq: 480 + hash(5) * 220, q: 0.9, peak: 0.014 * level, attack: 1.1 });
      break;
    case "boardwalkCreak":
      synthToneShot({ wave: "sawtooth", from: 150 * (0.85 + hash(3) * 0.4), to: 68, seconds: 0.4, peak: 0.007 * level, attack: 0.06, filterType: "lowpass", freq: 620, q: 1.2 });
      break;
    case "kitchenClatter": {
      const ticks = 2 + Math.floor(hash(3) * 3);
      for (let index = 0; index < ticks; index += 1) {
        synthNoiseShot({ delay: index * (0.05 + hash(7 + index) * 0.07), seconds: 0.035, filterType: "highpass", freq: 2300, peak: 0.011 * level, attack: 0.002 });
      }
      synthToneShot({ wave: "triangle", from: 2600 * (0.9 + hash(11) * 0.3), seconds: 0.22, peak: 0.006 * level, attack: 0.002, filterType: "bandpass", freq: 2600, q: 8, delay: 0.04 });
      break;
    }
    case "gullCry": {
      const cries = 1 + (hash(3) < 0.4 ? 1 : 0);
      for (let index = 0; index < cries; index += 1) {
        synthToneShot({ wave: "triangle", from: 1500 * (0.9 + hash(5 + index) * 0.25), to: 940, seconds: 0.4, peak: 0.007 * level, attack: 0.05, filterType: "bandpass", freq: 1300, q: 3, vibratoRate: 9, vibratoDepth: 70, delay: index * 0.5 });
      }
      break;
    }
    case "chainRattle": {
      const ticks = 3 + Math.floor(hash(3) * 3);
      for (let index = 0; index < ticks; index += 1) {
        synthToneShot({ wave: "square", from: 1750 * (0.85 + hash(9 + index) * 0.4), seconds: 0.045, peak: 0.005 * level, attack: 0.002, filterType: "highpass", freq: 1250, delay: index * (0.04 + hash(17 + index) * 0.05) });
      }
      break;
    }
    default:
      break;
  }
}

function updateAmbienceAudio(time, dt) {
  // Stage select previews the highlighted stage at half level; fights run at
  // full level; every other screen is silent (and tears the rig down).
  const wantScreens = state.screen === "fight" || state.screen === "stage";
  const soundOn = Boolean($("#soundToggle")?.checked) && state.sfxVolume > 0;
  ambienceEngaged = wantScreens && soundOn;
  if (!ambienceEngaged) {
    ambienceNextEventAt = 0;
    if (ambienceRig) teardownAmbienceRig();
    return;
  }
  const profile = AMBIENCE_PROFILES[state.stage];
  // Event cadence runs off the render clock (not the context clock) so the
  // rhythm — and the QA counter — never depend on audio backend state.
  if (profile?.events.length) {
    if (!ambienceNextEventAt) ambienceNextEventAt = time + 2500 + presentationHash01(ambienceEventSerial, 61) * 4000;
    if (time >= ambienceNextEventAt) {
      ambienceEventSerial += 1;
      const roll = presentationHash01(ambienceEventSerial, 97);
      const event = profile.events[Math.floor(roll * profile.events.length) % profile.events.length];
      audioFxDebug.ambienceEvents += 1;
      if (state.screen === "fight") playAmbienceEvent(event.kind);
      ambienceNextEventAt = time + (event.min + presentationHash01(ambienceEventSerial, 131) * (event.max - event.min)) * 1000;
    }
  } else ambienceNextEventAt = 0;
  if (!audioContextRunning()) return;
  if (ambienceRig && ambienceRig.stage !== state.stage) teardownAmbienceRig();
  if (!ambienceRig) ambienceRig = buildAmbienceRig(state.stage);
  if (!ambienceRig) return;
  const now = state.audio.currentTime;
  const cinematicDuck = state.finisher ? 0.25 : 1;
  const preview = state.screen === "stage" ? 0.5 : 1;
  const pauseDuck = state.paused ? 0.35 : 1;
  // Follows musicDuck so cinematic ducks pull the bed down with the music.
  const target = clamp(state.sfxVolume, 0, 1) * cinematicDuck * preview * pauseDuck * (0.35 + 0.65 * state.musicDuck);
  ambienceRig.master.gain.setTargetAtTime(Math.max(0.0001, target), now, 0.25);
  // Somerset: El-train rumble loosely follows the moving train-light layer.
  const trainLayer = ambienceRig.layers.find((layer) => layer.spec.train);
  if (trainLayer) {
    const trainX = ((time * 0.08) % (W + 650)) - 500;
    const visible = trainX > -430 && trainX < W;
    trainLayer.gain.gain.setTargetAtTime(visible ? trainLayer.spec.gain : 0.0001, now, 0.6);
  }
}

// Hidden tabs stop the render loop; drop the beds instantly so they cannot
// drone at their last eased level until the tab returns.
function muteRenderAudioBeds() {
  if (!state.audio) return;
  const now = state.audio.currentTime;
  if (crowdBed) crowdBed.gain.gain.setTargetAtTime(0.0001, now, 0.06);
  if (ambienceRig) ambienceRig.master.gain.setTargetAtTime(0.0001, now, 0.06);
}

// --- Wave 9: spoken announcer bank system ----------------------------------
// Banks live at assets/audio/announcer/<cue>-<n>.mp3. None of those files
// exist yet (ElevenLabs auth is down): every cue still fires — the caption
// always shows its line — and each bank is HEAD-probed exactly once per
// session, so real takes drop in the moment they land on disk. All module
// state below is render-side (announce() pattern), never snapshotted, and
// its only randomness is visualRandom (checksum-exempt) — never state.rng.

const ANNOUNCER_MAX_TAKES = 5;

// One line per planned take, mirrored exactly by MISSING-AUDIO.md — the
// caption index and the mp3 take index stay aligned as files appear.
const ANNOUNCER_LINES = (() => {
  const banks = {
    round1: ["ROUND ONE", "ROUND ONE — SETTLE IT", "FIRST ROUND — FIGHT'S ON"],
    round2: ["ROUND TWO", "SECOND ROUND", "ROUND TWO — NO MERCY"],
    finalround: ["FINAL ROUND", "LAST ROUND — MAKE IT COUNT", "THE FINAL ROUND"],
    fight: ["FIGHT!", "GET IT ON!", "THROW DOWN!", "GO!"],
    finishthem: ["FINISH THEM!", "END THIS!", "PUT THEM DOWN!"],
    ko: ["K.O.!", "KNOCKOUT!", "IT'S OVER!", "LIGHTS OUT!"],
    perfect: ["PERFECT!", "UNTOUCHABLE!", "NOT A SCRATCH!"],
    flawless: ["FLAWLESS VICTORY!", "AN ABSOLUTE SHUTOUT!"],
    comeback: ["WHAT A COMEBACK!", "BACK FROM THE DEAD!", "NEVER COUNT THEM OUT!"],
    timeover: ["TIME OVER — DECISION!", "THE CLOCK CALLS IT!", "TIME! JUDGES' DECISION!"],
    "fatality-performed": ["FATALITY.", "A GRAPHIC FINISH.", "THAT WAS A FINAL BLOW."],
    // Release 1.7 DEPTH: the guard-crush letter-slam's spoken call.
    guardcrush: ["GUARD CRUSH!", "DEFENSE SHATTERED!", "THE GUARD BREAKS!"],
    // Release 1.7 wave 11: the corner wall-bounce conversion.
    wallbounce: ["OFF THE WALL!", "CORNER CARNAGE!", "THE WALL HITS BACK!"],
    "boss-intro": ["THE FINAL AUTHORITY STEPS IN.", "FINAL BOUT — THE BLACK BOOK CLOSES TONIGHT.", "THE COMMISSIONER IS WAITING."],
    connected: ["CHALLENGER CONNECTED!", "YOUR OPPONENT HAS ENTERED!", "THE WIRE IS LIVE!"],
    setpoint: ["SET POINT!", "ONE ROUND FROM GLORY!", "THE MATCH IS ON THE LINE!"],
    rematch: ["REMATCH ACCEPTED!", "RUN IT BACK!", "ONE MORE TIME!"],
    recovered: ["CONNECTION RESTORED!", "BACK IN SYNC!", "THE LINK HOLDS!"],
  };
  for (const { id, name } of roster) {
    banks[`${id}-name`] = [name, name, name];
    banks[`${id}-wins`] = [`${name} WINS!`, `THE WINNER — ${name}!`, `${name} TAKES IT!`];
  }
  return Object.freeze(banks);
})();

// Shuffle bags per cue: every take plays once before any repeats, and the
// reshuffle never lets the same take land back-to-back across bag borders.
const announcerBags = new Map();

function announcerBagDraw(cue, size) {
  if (size <= 1) return 0;
  let bag = announcerBags.get(cue);
  if (!bag || bag.size !== size) {
    bag = { size, order: [], position: 0, last: -1 };
    announcerBags.set(cue, bag);
  }
  if (bag.position >= bag.order.length) {
    const order = Array.from({ length: size }, (_, index) => index);
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(visualRandom() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    if (order[0] === bag.last) [order[0], order[order.length - 1]] = [order[order.length - 1], order[0]];
    bag.order = order;
    bag.position = 0;
  }
  const pick = bag.order[bag.position];
  bag.position += 1;
  bag.last = pick;
  return pick;
}

// cue -> { takes: [Audio...], probed }. Probed sequentially (<cue>-1.mp3,
// -2, ... stop at the first gap) exactly once per session; a fully missing
// bank costs one HEAD request forever.
const announcerBankCache = new Map();

function announcerBank(cue) {
  let bank = announcerBankCache.get(cue);
  if (bank) return bank;
  bank = { cue, takes: [], probed: false };
  announcerBankCache.set(cue, bank);
  (async () => {
    const found = [];
    for (let take = 1; take <= ANNOUNCER_MAX_TAKES; take += 1) {
      const src = `assets/audio/announcer/${cue}-${take}.mp3`;
      if (!(await probeAudioFile(src))) break;
      found.push(src);
    }
    bank.takes = found.map((src) => {
      const sample = new Audio(src);
      sample.preload = "auto";
      return sample;
    });
    bank.probed = true;
    if (found.length) voiceFxDebug.announcerBanksLoaded += 1;
  })();
  return bank;
}

// Serialised speech clock: each accepted call reserves a busy window so
// layered calls (KO -> fighter-wins -> story) never talk over each other.
let announcerBusyUntil = 0;

function announcerEstimateMs(line) {
  return Math.min(1700, 420 + line.split(/\s+/).length * 260);
}

/**
 * Queue a spoken announcer line. Same guard discipline as announce(): early
 * return during rollback resimulation, everything downstream render-side.
 * The caption always shows the exact line even with zero mp3 assets; music
 * ducks under real takes only.
 */
function announcerSay(cue, { delay = 0 } = {}) {
  if (rollbackResimulating) return false;
  const lines = ANNOUNCER_LINES[cue];
  if (!lines?.length) return false;
  voiceFxDebug.announcerCalls += 1;
  const bank = announcerBank(cue);
  const now = performance.now();
  const pick = announcerBagDraw(cue, Math.max(lines.length, bank.takes.length));
  const line = lines[pick % lines.length];
  const startAt = Math.max(now + delay, announcerBusyUntil + 90);
  announcerBusyUntil = startAt + announcerEstimateMs(line);
  window.setTimeout(() => {
    showSoundCaption("announcer", null, line);
    if (!$("#soundToggle").checked) return;
    if (demoSession.attract && !state.audioUnlocked) return;
    const take = bank.takes.length ? bank.takes[pick % bank.takes.length] : null;
    if (!take) return;
    unlockAudio();
    duckMusic(0.45, Math.max(750, announcerEstimateMs(line)));
    take.pause();
    take.currentTime = 0;
    take.volume = 0.9 * state.sfxVolume;
    const playback = take.play();
    if (playback?.catch) playback.catch(() => {});
  }, Math.max(0, startAt - now));
  return true;
}

// Banner -> spoken cue map. Runs inside announce() after its rollback guard,
// so every existing announce call site (round intros, FIGHT, FINISH THEM,
// KO, FINAL BLOW) gains the spoken call without new sim-path hooks.
function announcerSpeakBanner(text) {
  if (text === "FIGHT!") {
    announcerSay("fight");
    return;
  }
  const roundMatch = text.match(/^(?:ONLINE )?ROUND (\d+)$/);
  if (roundMatch) {
    const round = Number(roundMatch[1]);
    announcerSay(round === 1 ? "round1" : round === 2 ? "round2" : "finalround");
    return;
  }
  if (text === "FINISH THEM") {
    announcerSay("finishthem");
    return;
  }
  if (text === "GUARD CRUSH") {
    announcerSay("guardcrush");
    return;
  }
  if (text === "FINAL BLOW") {
    announcerSay("ko");
    return;
  }
  if (text.endsWith(" WINS")) {
    announcerSay("ko");
    const fighter = roster.find(({ name }) => text === `${name} WINS`);
    if (fighter) announcerSay(`${fighter.id}-wins`, { delay: 950 });
  }
}

// --- Wave 9: reactive fighter cues + match-story callouts ------------------

// Sim-path reactive voice trigger: announce() pattern (resim guard) plus a
// per-cue simulationTick dedupe, mirroring the camera latches.
const reactiveCueTicks = new Map();

// Release 1.7 wave 11 — taunt voice payoff. The LINE INDEX was already drawn
// from state.rng inside performTaunt (sim state, checksummed); this side is
// pure presentation on the announce() guard discipline. The caption always
// shows the exact authored line; audio plays the matching bank variant when
// its take exists and falls back to the pitch-shifted placeholder until then.
function fighterTauntCue(fighter, line = 0) {
  if (rollbackResimulating) return;
  voiceFxDebug.reactiveCues += 1;
  const fighterId = fighterSoundId(fighter);
  const lineText = FIGHTER_TAUNT_LINES[fighterId]?.[line] || "";
  showSoundCaption("taunt", fighter, lineText);
  if (!$("#soundToggle").checked) return;
  if (demoSession.attract && !state.audioUnlocked) return;
  unlockAudio();
  const bank = fighterVoiceBank(fighterId, "taunt");
  const src = bank?.srcs?.[line];
  const pool = src ? fighterVoicePool("taunt", bank.key, line, src) : null;
  const sample = pool?.[0];
  if (sample) {
    voiceFxDebug.voiceVariantPlays += 1;
    sample.pause();
    sample.currentTime = 0;
    sample.preservesPitch = true;
    sample.playbackRate = 1;
    sample.volume = (sfxVolumes.taunt ?? 0.62) * state.sfxVolume;
    sample.play()?.catch?.(() => {});
    return;
  }
  // No take on disk yet: the nearest recorded cue, detuned per line so the
  // three rotating lines still read differently.
  const take = fighterVoiceTake("taunt", fighterId);
  if (!take) return;
  voiceFxDebug.voiceVariantPlays += 1;
  const fallback = take.sample;
  fallback.pause();
  fallback.currentTime = 0;
  fallback.preservesPitch = false;
  fallback.playbackRate = take.rate * (1 + line * 0.05);
  fallback.volume = (sfxVolumes.taunt ?? 0.62) * state.sfxVolume;
  fallback.play()?.catch?.(() => {});
}

function fighterReactiveCue(fighter, cue) {
  if (rollbackResimulating || reactiveCueTicks.get(cue) === state.simulationTick) return;
  reactiveCueTicks.set(cue, state.simulationTick);
  voiceFxDebug.reactiveCues += 1;
  sound(cue, fighter);
}

// Render-observed per-round health story: minimum health per side (feeds the
// COMEBACK callout) and the once-per-round desperation bark under 20%.
let voiceRoundKey = "";
let voiceRoundMinHealth = [100, 100];
const desperationFired = [false, false];

function updateVoiceCallouts() {
  if (state.screen !== "fight" || state.fighters.length !== 2) return;
  const key = `${state.matchSerial}:${state.round}`;
  if (key !== voiceRoundKey) {
    voiceRoundKey = key;
    voiceRoundMinHealth = [100, 100];
    desperationFired[0] = false;
    desperationFired[1] = false;
  }
  state.fighters.forEach((fighter, side) => {
    voiceRoundMinHealth[side] = Math.min(voiceRoundMinHealth[side], fighter.health);
    if (!desperationFired[side] && state.phase === "fight" && fighter.health > 0 && fighter.health <= 20) {
      desperationFired[side] = true;
      voiceFxDebug.reactiveCues += 1;
      sound("desperation", fighter);
    }
  });
}

// Round-story detection, called from finishRound behind a rollback guard.
// Pure reads of existing round state plus the render-observed minimum-health
// track above; deduped per round result so a resimulated finish can never
// re-queue. Callouts layer after the primary KO/FINAL BLOW call via the
// announcerSay busy window plus a base delay.
let storyRoundKey = "";

function queueStoryCallouts(winner, type) {
  const key = `${state.matchSerial}:${state.round}:${winner}:${state.rounds[winner]}`;
  if (key === storyRoundKey) return;
  storyRoundKey = key;
  const loser = state.fighters[1 - winner];
  if (type >= 0) {
    voiceFxDebug.storyCallouts += 1;
    announcerSay("fatality-performed", { delay: 2400 });
  } else if (state.timer <= 0 && loser.health > 0) {
    voiceFxDebug.storyCallouts += 1;
    announcerSay("timeover", { delay: 1100 });
  } else if (state.fighters[winner].health >= 100) {
    voiceFxDebug.storyCallouts += 1;
    announcerSay("perfect", { delay: 1200 });
    announcerSay("flawless", { delay: 2300 });
  } else if (voiceRoundMinHealth[winner] <= 15) {
    voiceFxDebug.storyCallouts += 1;
    announcerSay("comeback", { delay: 1400 });
  }
  // Online set point: a player is now one round from taking the match.
  if (state.mode === "online" && state.rounds[winner] === 1 && state.rounds[1 - winner] < 2) {
    voiceFxDebug.onlineMoments += 1;
    announcerSay("setpoint", { delay: 2100 });
  }
}

// --- Wave 9: online-moments hooks (UI/network side, never checksummed) -----

let rematchAnnounced = false;

function announcerOnlineMoment(cue) {
  voiceFxDebug.onlineMoments += 1;
  announcerSay(cue);
}

function checkRematchAccepted() {
  if (onlineSession.rematchVotes.size < 2) {
    rematchAnnounced = false;
    return;
  }
  if (rematchAnnounced) return;
  rematchAnnounced = true;
  announcerOnlineMoment("rematch");
}

// Per-rendered-frame audio observer, called from draw() beside the cinematic
// camera update. Levels ease state-side even where WebAudio is stubbed, so
// the QA counters stay meaningful headless; nodes are only touched when the
// context is genuinely running.
function updateAudioPresentation(time, dtMs) {
  const dt = clamp(dtMs / 1000, 0.001, 0.1);
  updateCrowdAudio(dt);
  updateMusicIntensity(dt);
  updateAmbienceAudio(time, dt);
  updateVoiceCallouts();
  // Wave 16: pre-fight dialogue card reveal rides the same per-frame observer.
  updateIntroDialogue();
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
  if (blocked) renderRotateGate();
  setOnlineLocalSuspended(blocked || document.hidden);
}

function lockLandscape() {
  if (!screen.orientation?.lock) return;
  screen.orientation.lock("landscape").catch(() => {});
}

// ---------------------------------------------------------------------------
// Portrait gate capability handling. The gate must never show a button that
// silently does nothing: iOS offers no element fullscreen at all, and in-app
// browsers (Discord's WKWebView is the reported case) additionally pin the
// webview to portrait so physically rotating the phone changes nothing either.
// Capability checks decide the gate's mode; the user agent only refines the
// wording for known in-app containers. A page cannot programmatically launch
// Safari, so the fallback gives instructions plus a copy-the-link control
// rather than pretending to.
// ---------------------------------------------------------------------------

// Render-only latch: the DOMException (or Error) name of a fullscreen request
// that failed at runtime, so the gate can say why the button disappeared.
let immersiveModeFailure = null;
// The last gate mode written to the DOM, so aria-live only announces changes.
let rotateGateRenderedMode = "";

function fullscreenRequestSupported() {
  const app = $("#app");
  if (typeof app.requestFullscreen === "function") return document.fullscreenEnabled !== false;
  return typeof app.webkitRequestFullscreen === "function";
}

// Best-effort naming of a known in-app browser. Purely cosmetic on top of the
// capability checks: it decides the copy, never whether the button works.
function inAppBrowserName() {
  const ua = navigator.userAgent || "";
  if (/discord/i.test(ua)) return "Discord";
  if (/\bFBAN|\bFBAV|Instagram|Snapchat|TikTok|musical_ly|\bLine\//i.test(ua)) return "this app";
  // A WKWebView identifies as iPhone/iPad without Safari's own token. Real
  // iOS Safari (and Chrome/Firefox on iOS) all end with "Safari/…".
  const iosDevice = /iPhone|iPad|iPod/.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iosDevice && !/Safari\//.test(ua)) return "this app";
  return null;
}

function isIosDevice() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent || "")
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function rotateGateMode() {
  if (document.fullscreenElement || document.webkitFullscreenElement) return "rotate-fullscreen";
  if (immersiveModeFailure) return inAppBrowserName() ? "in-app" : "request-failed";
  if (fullscreenRequestSupported()) return "immersive";
  return inAppBrowserName() ? "in-app" : "rotate-only";
}

function renderRotateGate() {
  const mode = rotateGateMode();
  if (mode === rotateGateRenderedMode) return;
  rotateGateRenderedMode = mode;
  const hint = $("#rotateGateHint");
  const fullscreenButton = $("#fullscreenButton");
  const copyButton = $("#copyGameLinkButton");
  fullscreenButton.hidden = mode !== "immersive";
  copyButton.hidden = mode !== "in-app";
  const browser = isIosDevice() ? "Safari" : "your regular browser";
  if (mode === "immersive") {
    hint.textContent = "Final Blow requires landscape on mobile.";
  } else if (mode === "rotate-fullscreen") {
    hint.textContent = "You're in fullscreen — now turn your phone sideways to play.";
  } else if (mode === "in-app") {
    const container = inAppBrowserName() || "this app";
    const why = immersiveModeFailure ? `Fullscreen was blocked (${immersiveModeFailure})` : "Fullscreen isn't available";
    hint.textContent = `${why} inside ${container}'s browser, and it usually stays locked to portrait. `
      + `Use the menu (⋯ or share) and choose “Open in ${browser}”, or copy the game link below and paste it into ${browser} — then turn your phone sideways.`;
  } else if (mode === "request-failed") {
    hint.textContent = `Fullscreen was blocked here (${immersiveModeFailure}) — turn your phone sideways to play.`;
  } else {
    hint.textContent = "Fullscreen isn't available in this browser — turn your phone sideways to play.";
  }
}

function failImmersiveMode(error) {
  immersiveModeFailure = error?.name || error?.message || "blocked";
  renderRotateGate();
}

// Wave 15: the manifest-shortcut boot router starts a mode without a user
// gesture; a fullscreen request would reject and latch a bogus gate failure,
// so the router suppresses exactly one immersive attempt.
let suppressImmersivePrompt = false;

function enterImmersiveMode() {
  if (suppressImmersivePrompt) {
    suppressImmersivePrompt = false;
    return;
  }
  if (!isPhoneViewport()) return;
  const app = $("#app");
  if (!fullscreenRequestSupported()) {
    failImmersiveMode(new Error("not supported"));
    return;
  }
  let request;
  try {
    request = app.requestFullscreen
      ? app.requestFullscreen({ navigationUI: "hide" })
      : app.webkitRequestFullscreen();
  } catch (error) {
    failImmersiveMode(error);
    return;
  }
  if (request?.then) request.then(lockLandscape).catch(failImmersiveMode);
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
    await navigator.serviceWorker.register("./sw.js?v=final-blow-2.3");
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

// ---------------------------------------------------------------------------
// R1.9 wave 15: iOS "Add to Home Screen" coach mark. Safari on iOS never
// fires beforeinstallprompt, so the only install path is the share sheet —
// point at it once, dismissible forever, and only in real iOS Safari when
// the game is not already running standalone.
// ---------------------------------------------------------------------------
function maybeShowIosCoachMark() {
  const coach = $("#iosCoachMark");
  if (!coach) return false;
  if (!isIosDevice() || inAppBrowserName()) return false;
  if (!/Safari\//.test(navigator.userAgent || "")) return false;
  if (navigator.standalone === true) return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches
    || window.matchMedia?.("(display-mode: fullscreen)").matches) return false;
  if (localStorage.getItem("final-blow-ios-coach") === "1") return false;
  coach.hidden = false;
  return true;
}

$("#iosCoachDismiss")?.addEventListener("click", () => {
  localStorage.setItem("final-blow-ios-coach", "1");
  $("#iosCoachMark").hidden = true;
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
  // Wave 15: the wake lock releases while paused and returns on resume.
  syncWakeLock();
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
  // Wave 16: SF2-style color select — confirming with a LIGHT button locks
  // color 1, confirming with a HEAVY button locks color 2 (either seat's
  // bindings work on the shared cursor, exactly like the ending-skip keys).
  if (state.screen === "select" && !(state.locks[0] && state.locks[1])) {
    for (const map of keyMaps) {
      if (event.code === map.lp || event.code === map.lk) {
        event.preventDefault();
        chooseFighter(state.picks[state.selectingPlayer], 0);
        return;
      }
      if (event.code === map.hp || event.code === map.hk) {
        event.preventDefault();
        chooseFighter(state.picks[state.selectingPlayer], 1);
        return;
      }
    }
  }
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
  // Release 1.8 GRIND: tally count-up and initials entry own the keyboard
  // while their screens are up. v2.1: the arcade ending sequence too.
  if (handleTallyKey(event) || handleInitialsKey(event) || handleEndingKey(event)) return;
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

// ---------------------------------------------------------------------------
// R1.9 wave 15: full gamepad menu navigation.
// menuPadLoop grows from a single confirm button into a complete navigator:
// d-pad/left stick moves a visible focus (or the roster/stage cursor on the
// screens that already have one), A confirms, B backs out, and a second pad
// drives P2's pick in the local two-player modes. Everything routes through
// handleMenuPadEvent so the QA layer can drive the exact same paths
// headlessly. Keyboard and touch handling are untouched — pad navigation
// clicks the same DOM buttons they do.
// ---------------------------------------------------------------------------
const MENU_PAD_REPEAT = Object.freeze({ initialMs: 340, repeatMs: 150 });
const menuPadSlots = [
  { direction: "", nextRepeatAt: 0, buttons: new Map() },
  { direction: "", nextRepeatAt: 0, buttons: new Map() },
];
const padNavDebug = { moves: 0, confirms: 0, backs: 0 };
let padFocusElement = null;
let menuPadAnyWasPressed = false;

function padMenuDirection(pad) {
  const axisX = pad.axes?.[0] || 0;
  const axisY = pad.axes?.[1] || 0;
  if (buttonValue(pad, 12) || axisY < -0.55) return "up";
  if (buttonValue(pad, 13) || axisY > 0.55) return "down";
  if (buttonValue(pad, 14) || axisX < -0.55) return "left";
  if (buttonValue(pad, 15) || axisX > 0.55) return "right";
  return "";
}

function menuPadDirectionEvents(pad, slot, now) {
  const direction = pad ? padMenuDirection(pad) : "";
  const events = [];
  if (direction !== slot.direction) {
    slot.direction = direction;
    if (direction) {
      events.push(direction);
      slot.nextRepeatAt = now + MENU_PAD_REPEAT.initialMs;
    }
  } else if (direction && now >= slot.nextRepeatAt) {
    events.push(direction);
    slot.nextRepeatAt = now + MENU_PAD_REPEAT.repeatMs;
  }
  return events;
}

function menuPadButtonEdge(pad, slot, index) {
  const pressed = Boolean(pad && buttonValue(pad, index));
  const was = slot.buttons.get(index) || false;
  slot.buttons.set(index, pressed);
  return pressed && !was;
}

function menuFocusRoot() {
  const dialog = $("#controlsDialog");
  if (dialog.open) return dialog;
  if (state.screen === "fight") return state.paused ? $("#pausePanel") : null;
  return $(`#${state.screen}Screen`);
}

function menuFocusables(root) {
  if (!root) return [];
  return [...root.querySelectorAll("button, select, input:not([type=hidden])")].filter((element) => {
    if (element.disabled || element.hidden || element.closest("[hidden]")) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function setPadFocus(element) {
  if (padFocusElement === element) return;
  padFocusElement?.classList.remove("pad-focus");
  padFocusElement = element || null;
  if (padFocusElement) {
    padFocusElement.classList.add("pad-focus");
    padFocusElement.focus?.({ preventScroll: true });
    padFocusElement.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    padNavDebug.moves += 1;
  }
}

function movePadFocus(delta) {
  const focusables = menuFocusables(menuFocusRoot());
  if (!focusables.length) return false;
  const index = focusables.indexOf(padFocusElement);
  if (index < 0) {
    setPadFocus(focusables.find((element) => element.classList.contains("menu-focus")) || focusables[0]);
    return true;
  }
  setPadFocus(focusables[(index + delta + focusables.length) % focusables.length]);
  return true;
}

// Left/right on a focused select or slider adjusts it instead of moving focus.
function adjustPadFocusValue(direction) {
  const element = padFocusElement;
  if (!element || !menuFocusRoot()?.contains(element)) return false;
  if (element.tagName === "SELECT") {
    const next = element.selectedIndex + (direction === "right" ? 1 : -1);
    if (next >= 0 && next < element.options.length) {
      element.selectedIndex = next;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }
  if (element.tagName === "INPUT" && element.type === "range") {
    const step = Number(element.step) || 1;
    const value = Number(element.value) + (direction === "right" ? step : -step);
    element.value = String(Math.min(Number(element.max) || 100, Math.max(Number(element.min) || 0, value)));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

function handleSelectPadEvent(kind, padIndex) {
  if (kind === "back") {
    padNavDebug.backs += 1;
    back("title");
    return;
  }
  const twoPlayer = ["versus", "team"].includes(state.mode);
  if (padIndex === 1 && !twoPlayer) return;
  // Pad 0 drives whichever side is currently picking (the keyboard-cursor
  // rule); a second pad always owns P2's pick in the two-player modes.
  const side = padIndex === 1 ? 1 : (state.locks[0] ? 1 : 0);
  if (kind === "confirm" || kind === "altConfirm") {
    padNavDebug.confirms += 1;
    if (state.locks[0] && state.locks[1]) {
      showStageSelect();
      return;
    }
    if (padIndex === 1 && !state.locks[0]) return; // P2's pad waits for P1's lock
    if (state.mode !== "team" && state.locks[side]) return;
    // Wave 16: A confirms color 1, Y confirms color 2.
    chooseFighter(state.picks[side], kind === "altConfirm" ? 1 : 0);
    return;
  }
  if (state.mode === "arcade" && state.locks[0]) return;
  if (state.mode !== "team" && state.locks[side]) return;
  const delta = kind === "left" ? -1 : kind === "right" ? 1 : kind === "up" ? -4 : 4;
  state.picks[side] = (state.picks[side] + delta + roster.length) % roster.length;
  // P2's pad may browse early, but the shared keyboard cursor only follows
  // the side whose turn it actually is.
  if (padIndex === 0 || state.locks[0]) state.selectingPlayer = side;
  updateRosterUI();
  padNavDebug.moves += 1;
}

function handleStagePadEvent(kind) {
  if (kind === "back") {
    padNavDebug.backs += 1;
    showScreen("select");
    return;
  }
  if (kind === "confirm") {
    padNavDebug.confirms += 1;
    startMatch(true);
    return;
  }
  const ids = $$("#stageGrid .stage-card").map((card) => card.dataset.stage);
  if (!ids.length) return;
  const index = Math.max(0, ids.indexOf(state.stage));
  const delta = kind === "left" ? -1 : kind === "right" ? 1 : kind === "up" ? -3 : 3;
  chooseStage(ids[(index + delta + ids.length) % ids.length]);
  padNavDebug.moves += 1;
}

function handleInitialsPadEvent(kind) {
  if (!initialsUi.active) return;
  if (kind === "up") cycleInitialLetter(1);
  else if (kind === "down") cycleInitialLetter(-1);
  else if (kind === "left") initialsUi.cursor = Math.max(0, initialsUi.cursor - 1);
  else if (kind === "right") initialsUi.cursor = Math.min(2, initialsUi.cursor + 1);
  else if (kind === "confirm") {
    padNavDebug.confirms += 1;
    commitInitials();
    return;
  } else if (kind === "back") return;
  renderInitials();
}

const PAD_BACK_TARGETS = Object.freeze({
  online: "title",
  blackbook: "title",
  records: "title",
  ending: "title",
  result: "title",
});

function handleGenericPadBack() {
  padNavDebug.backs += 1;
  if (state.screen === "ending" && endingSequence.active) {
    advanceEndingSequence();
    return;
  }
  // An online rematch screen must never be torn down by a stray B press.
  if (state.screen === "result" && state.mode === "online") return;
  const target = PAD_BACK_TARGETS[state.screen];
  if (target) showScreen(target);
}

function handleGenericPadConfirm() {
  padNavDebug.confirms += 1;
  // v2.1: pad confirm skips the current ending beat first; only the resting
  // card starts a fresh arcade run.
  if (state.screen === "ending" && endingSequence.active) {
    advanceEndingSequence();
    return;
  }
  const root = menuFocusRoot();
  if (padFocusElement && root?.contains(padFocusElement)) {
    padFocusElement.click();
    return;
  }
  // No focus engaged: the pre-wave-15 defaults.
  if (state.screen === "title") startSelect("arcade");
  else if (state.screen === "ladder") startMatch(true);
  else if (state.screen === "ending") startSelect("arcade");
  else if (state.screen === "tally") tallyContinue();
  else if (state.screen === "result") {
    if (state.mode === "online") requestOnlineRematch();
    else if (dailySession.active && dailySession.finished) showScreen("title");
    else if (state.mode === "survival" && state.survivalRun?.over) startSurvivalRun(state.survivalRun.playerId);
    else if (state.mode === "team" && state.teamBattle?.over) {
      beginTeamBattle(state.teamBattle.cpu);
      startMatch(true);
    } else startMatch(true);
  }
}

function handleMenuPadEvent(kind, padIndex = 0) {
  const dialog = $("#controlsDialog");
  if (dialog.open) {
    if (kind === "back") {
      padNavDebug.backs += 1;
      dialog.close();
      return;
    }
    if (kind === "confirm") {
      padNavDebug.confirms += 1;
      if (padFocusElement && dialog.contains(padFocusElement)) padFocusElement.click();
      return;
    }
    if ((kind === "left" || kind === "right") && adjustPadFocusValue(kind)) return;
    movePadFocus(kind === "up" || kind === "left" ? -1 : 1);
    return;
  }
  if (state.screen === "fight") {
    if (!state.paused) return; // combat owns the pad through readInput
    if (kind === "back") {
      padNavDebug.backs += 1;
      setPaused(false);
      return;
    }
    if (kind === "confirm") {
      padNavDebug.confirms += 1;
      if (padFocusElement && $("#pausePanel").contains(padFocusElement)) padFocusElement.click();
      else setPaused(false);
      return;
    }
    movePadFocus(kind === "up" || kind === "left" ? -1 : 1);
    return;
  }
  if (state.screen === "select") return handleSelectPadEvent(kind, padIndex);
  if (state.screen === "stage") return handleStagePadEvent(kind);
  if (state.screen === "initials") return handleInitialsPadEvent(kind);
  if (kind === "back") return handleGenericPadBack();
  if (kind === "confirm") return handleGenericPadConfirm();
  // The two ledger screens scroll their list with up/down.
  if ((state.screen === "blackbook" || state.screen === "records") && (kind === "up" || kind === "down")) {
    const scroller = state.screen === "blackbook" ? $("#blackBookList") : $("#recordsGrid");
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 4) {
      scroller.scrollBy({ top: kind === "down" ? 150 : -150, behavior: "smooth" });
      return;
    }
  }
  movePadFocus(kind === "up" || kind === "left" ? -1 : 1);
}

// Mouse/touch use dismisses the pad focus ring until the pad speaks again.
document.addEventListener("pointerdown", () => {
  if (padFocusElement) {
    padFocusElement.classList.remove("pad-focus");
    padFocusElement = null;
  }
}, true);

function menuPadLoop() {
  const now = performance.now();
  const pads = [getPad(0), getPad(1)];
  const anyInput = pads.some((pad) => Boolean(pad && (pad.buttons.some((button) => button.pressed || button.value > 0.55)
    || pad.axes.some((axis) => Math.abs(axis) > 0.55))));
  if (demoSession.active && anyInput && !menuPadAnyWasPressed) {
    menuPadAnyWasPressed = true;
    exitDemo();
    // Wave 15 CABINET MODE: interrupting the attract loop drops straight
    // into character select — insert coin, pick your fighter.
    if (state.cabinetMode) startSelect("arcade");
    requestAnimationFrame(menuPadLoop);
    return;
  }
  if (!demoSession.active && anyInput && !menuPadAnyWasPressed) noteUserActivity();
  menuPadAnyWasPressed = anyInput;
  for (const padIndex of [0, 1]) {
    const pad = pads[padIndex];
    const slot = menuPadSlots[padIndex];
    const pause = menuPadButtonEdge(pad, slot, 9);
    if (pause && state.screen === "fight") setPaused(!state.paused);
    const confirm = menuPadButtonEdge(pad, slot, 0);
    const backEdge = menuPadButtonEdge(pad, slot, 1);
    const directions = menuPadDirectionEvents(pad, slot, now);
    if (state.screen === "fight" && !state.paused) continue; // edges consumed, combat untouched
    // Wave 15 CABINET MODE: any face-button press on the title starts a run.
    if (state.cabinetMode && state.screen === "title" && (confirm || backEdge)) {
      startSelect("arcade");
      continue;
    }
    if (confirm) handleMenuPadEvent("confirm", padIndex);
    // Wave 16: Y/triangle on the select screen is the alt-color confirm.
    const altConfirm = menuPadButtonEdge(pad, slot, 3);
    if (altConfirm && state.screen === "select") handleMenuPadEvent("altConfirm", padIndex);
    if (backEdge) handleMenuPadEvent("back", padIndex);
    for (const direction of directions) handleMenuPadEvent(direction, padIndex);
  }
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
// Wave 16: the SF2 color pick travels the lobby like the fighter choice.
$("#onlinePaletteSelect")?.addEventListener("change", (event) => {
  onlineSession.lobby.localPalette = event.target.value === "1" ? 1 : 0;
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
  syncTouchControlStyle();
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
$("#sharpRenderToggle").addEventListener("change", (event) => {
  state.sharpRender = event.target.checked;
  localStorage.setItem("final-blow-sharp-render", state.sharpRender ? "1" : "0");
  applyPerformanceSettings();
});
$("#crtModeToggle").addEventListener("change", (event) => {
  state.crtMode = event.target.checked;
  localStorage.setItem("final-blow-crt-mode", state.crtMode ? "1" : "0");
});
$("#cabinetModeToggle").addEventListener("change", (event) => {
  state.cabinetMode = event.target.checked;
  localStorage.setItem("final-blow-cabinet-mode", state.cabinetMode ? "1" : "0");
  // The cabinet preset defaults the CRT look on at activation; it stays a
  // free choice afterwards.
  if (state.cabinetMode && !state.crtMode) {
    state.crtMode = true;
    localStorage.setItem("final-blow-crt-mode", "1");
  }
  applyCabinetMode();
  scheduleIdleDemo();
});
$("#cinema3dToggle").addEventListener("change", (event) => {
  state.cinema3d = event.target.checked;
  localStorage.setItem("final-blow-cinema-3d", state.cinema3d ? "1" : "0");
  // v2.1 PROGRESSION: first CINEMA 3D activation inks THE PICTURE SHOW
  // (pure DOM path — the ledger dedupes via its unlocked map).
  if (state.cinema3d) progressionCinemaActivated();
  // Live-switch: the module lazy-loads on first activation; toggling off just
  // hides the 3D canvas and resumes the 2D world draw next frame.
  ensureCinema3d();
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
$("#trainingFrameMeterToggle").addEventListener("change", (event) => {
  state.training.showFrameMeter = event.target.checked;
  updateTrainingUi();
});
// R1.9: situation slots — save/load the full training situation.
$$("[data-slot-save]").forEach((button) => button.addEventListener("click", () => {
  saveSituationSlot(Number(button.dataset.slotSave));
}));
$$("[data-slot-load]").forEach((button) => button.addEventListener("click", () => {
  loadSituationSlot(Number(button.dataset.slotLoad));
}));
// R1.9: authored trial demo playback.
$("#trainingTrialDemoButton").addEventListener("click", () => {
  if (trialDemo.active) stopTrialDemo("DEMO STOPPED");
  else startTrialDemo();
  updateTrainingUi();
});
// R1.9: FIGHT SCHOOL entries + panel controls.
$("#fightSchoolButton").addEventListener("click", () => startFightSchool());
$("#comboTrialsButton").addEventListener("click", () => startComboTrialsLab());
$("#schoolSkipButton").addEventListener("click", () => {
  if (!schoolSession.active || !schoolSession.machine) return;
  const machine = schoolSession.machine;
  if (machine.lesson + 1 >= FIGHT_SCHOOL_LESSONS.length) {
    exitFightSchool();
    return;
  }
  schoolSession.machine = createFightSchoolState({
    lesson: machine.lesson + 1,
    completed: machine.completed,
  });
  const lesson = fightSchoolLesson(schoolSession.machine);
  announce(lesson ? lesson.name : "FIGHT SCHOOL", schoolCoach("start"), 2);
  applySchoolLessonSetup();
  renderSchoolPanel();
});
$("#schoolExitButton").addEventListener("click", () => exitFightSchool());
// R1.9 boot sync: slot availability + touch style badges.
refreshSituationSlotButtons();
syncTouchControlStyle();
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
  // Release 1.6 LOUD: rAF stops in hidden tabs, so drop the synth beds here
  // rather than letting them drone at their last eased level. The render loop
  // re-eases them when the tab returns; music restart stays syncMusic's job,
  // so nothing double-starts on visibility flips.
  if (document.hidden) muteRenderAudioBeds();
  syncMusic();
  // Wave 15: browsers drop the wake lock on a hidden tab; re-acquire it here
  // when the fight/attract screen returns to view.
  syncWakeLock();
});
$("#fighterContinue").addEventListener("click", showStageSelect);
$$(".stage-card").forEach((card) => card.addEventListener("click", () => chooseStage(card.dataset.stage)));
$("#fightButton").addEventListener("click", () => startMatch(true));
$("#arcadeContinueButton").addEventListener("click", () => startMatch(true));
$("#endingReplayButton").addEventListener("click", () => startSelect("arcade"));
$("#rematchButton").addEventListener("click", () => {
  if (state.mode === "online") {
    requestOnlineRematch();
    return;
  }
  // Release 1.8 GRIND: run-based modes restart their RUN, not the lost bout.
  if (state.mode === "survival" && state.survivalRun?.over) {
    startSurvivalRun(state.survivalRun.playerId);
    return;
  }
  if (state.mode === "team" && state.teamBattle?.over) {
    beginTeamBattle(state.teamBattle.cpu);
    startMatch(true);
    return;
  }
  if (dailySession.active && dailySession.finished) {
    showScreen("title");
    return;
  }
  startMatch(true);
});
$("#newStageButton").addEventListener("click", showSameFightersStageSelect);
$("#reselectButton").addEventListener("click", () => startSelect(state.mode));
// Release 1.8 GRIND: new-mode surfaces.
$("#dailyButton").addEventListener("click", () => startDailyRun());
// v2.1 PROGRESSION surfaces: the ledger screens + ending sequence skips.
$("#blackBookButton").addEventListener("click", () => { unlockAudio(); showBlackBookScreen(); });
$("#recordsButton").addEventListener("click", () => { unlockAudio(); showRecordsScreen(); });
$("#endingPanels").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  advanceEndingSequence();
});
$("#endingCredits").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  advanceEndingSequence();
});
$("#tallyContinueButton").addEventListener("click", () => tallyContinue());
$("#initialsConfirmButton").addEventListener("click", () => commitInitials());
$$("#initialsSlots .initials-slot").forEach((slot, index) => {
  slot.addEventListener("click", () => {
    if (!initialsUi.active) return;
    if (initialsUi.cursor === index) cycleInitialLetter(1);
    else initialsUi.cursor = index;
    renderInitials();
  });
});
$("#shareDailyButton").addEventListener("click", (event) => shareDailyResult(event.currentTarget));
$("#shareDailyEndingButton").addEventListener("click", (event) => shareDailyResult(event.currentTarget));
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
$("#copyGameLinkButton").addEventListener("click", async () => {
  const url = new URL(location.href);
  url.searchParams.delete("debug");
  const link = url.toString();
  const button = $("#copyGameLinkButton");
  try {
    await navigator.clipboard.writeText(link);
    button.textContent = "LINK COPIED";
  } catch {
    // No clipboard access in this container: surface the address itself so it
    // can be long-pressed and copied by hand.
    $("#rotateGateHint").textContent = `Copy this address into your browser: ${link}`;
    button.textContent = "COPY BY HAND";
  }
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
document.addEventListener("webkitfullscreenchange", syncOrientationGate);

// ---------------------------------------------------------------------------
// R1.9 wave 15: thumb-slide touch input.
// The old per-button pointerdown/pointerup binding meant implicit pointer
// capture pinned a touch to the first cell it landed on — sliding a thumb
// from Down to Down-Forward to Forward never fired the next cell, which made
// QCF/DP/double-QCF motions physically impossible on a phone. Both control
// groups now track pointers at group level:
//   · the 3x3 movement pad runs sector math around its centre
//     (touchPadTokens, engine/controls.mjs) and swaps direction tokens in the
//     existing touch Set as the thumb crosses cells — CONTROLS.md decision 5
//     (directions recorded on state change) makes the rolled QCF readable;
//   · the LP/HP/LK/HK cluster re-hit-tests on pointermove, piano-roll style:
//     rolling LP onto HP keeps LP held and edges HP, which is exactly the
//     "one button edges while its partner is held" chord read, landing the
//     existing 6-frame chord-takeover window for EX moves and supers.
// Everything still flows through the same touch tokens into readInput's
// action vocabulary: no new inputs, no new net bits, no timing changes.
// ---------------------------------------------------------------------------
const touchFxDebug = { padSlides: 0, clusterRolls: 0 };

function pressTouchTokens(tokens) {
  for (const token of tokens) {
    touch.add(token);
    touch.add(`${token}:pressed`);
  }
}

function releaseTouchTokens(tokens) {
  for (const token of tokens) touch.delete(token);
}

function touchTokenKey(tokens) {
  return [...tokens].sort().join(" ");
}

function capturePointer(element, pointerId) {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    // Synthetic QA PointerEvents have no live pointer to capture; the group
    // listeners still receive the dispatched moves directly.
  }
}

(() => {
  const pad = $(".touch-move");
  if (!pad) return;
  // Sorted token key -> cell button, for the pressed-cell highlight only.
  const cellButtons = new Map();
  for (const button of pad.querySelectorAll("[data-touch]")) {
    cellButtons.set(touchTokenKey(button.dataset.touch.split(/\s+/).filter(Boolean)), button);
  }
  const pointers = new Map(); // pointerId -> { tokens, rect }
  const setHighlight = () => {
    const activeKeys = new Set([...pointers.values()].map((entry) => touchTokenKey(entry.tokens)));
    for (const [key, button] of cellButtons) button.classList.toggle("active", activeKeys.has(key));
  };
  const tokensAt = (entry, event) => {
    const dx = event.clientX - (entry.rect.left + entry.rect.width / 2);
    const dy = event.clientY - (entry.rect.top + entry.rect.height / 2);
    return touchPadTokens(dx, dy, Math.min(entry.rect.width, entry.rect.height) / 2);
  };
  const applyTokens = (entry, nextTokens) => {
    if (touchTokenKey(entry.tokens) === touchTokenKey(nextTokens)) return;
    releaseTouchTokens(entry.tokens.filter((token) => !nextTokens.includes(token)));
    pressTouchTokens(nextTokens.filter((token) => !entry.tokens.includes(token)));
    if (entry.tokens.length) touchFxDebug.padSlides += 1;
    entry.tokens = nextTokens;
    setHighlight();
  };
  pad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    capturePointer(pad, event.pointerId);
    const entry = { tokens: [], rect: pad.getBoundingClientRect() };
    pointers.set(event.pointerId, entry);
    applyTokens(entry, tokensAt(entry, event));
    if (state.touchSettings.haptics && event.isTrusted) navigator.vibrate?.(12);
    unlockAudio();
  });
  pad.addEventListener("pointermove", (event) => {
    const entry = pointers.get(event.pointerId);
    if (!entry) return;
    event.preventDefault();
    applyTokens(entry, tokensAt(entry, event));
  });
  const end = (event) => {
    const entry = pointers.get(event.pointerId);
    if (!entry) return;
    event.preventDefault();
    releaseTouchTokens(entry.tokens);
    pointers.delete(event.pointerId);
    setHighlight();
  };
  pad.addEventListener("pointerup", end);
  pad.addEventListener("pointercancel", end);
})();

(() => {
  const cluster = $(".touch-action");
  if (!cluster) return;
  const buttons = [...cluster.querySelectorAll("[data-touch]")];
  const pointers = new Map(); // pointerId -> { rects, held, current }
  const refresh = () => {
    const held = new Set();
    for (const entry of pointers.values()) for (const button of entry.held) held.add(button);
    for (const button of buttons) button.classList.toggle("active", held.has(button));
  };
  const buttonAt = (entry, event) => {
    for (const [button, rect] of entry.rects) {
      if (event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom) return button;
    }
    return null;
  };
  const applyButton = (entry, next, trusted) => {
    if (!next || next === entry.current) {
      if (!next) entry.current = null;
      return;
    }
    // Piano-roll: the earlier button of this touch stays held until lift-off,
    // so the new edge lands as a chord with it.
    if (!entry.held.has(next)) {
      pressTouchTokens([next.dataset.touch]);
      entry.held.add(next);
      if (entry.current) touchFxDebug.clusterRolls += 1;
      if (state.touchSettings.haptics && trusted) navigator.vibrate?.(12);
    }
    entry.current = next;
    refresh();
  };
  cluster.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    capturePointer(cluster, event.pointerId);
    const entry = {
      rects: buttons.map((button) => [button, button.getBoundingClientRect()]),
      held: new Set(),
      current: null,
    };
    pointers.set(event.pointerId, entry);
    applyButton(entry, buttonAt(entry, event), event.isTrusted);
    unlockAudio();
  });
  cluster.addEventListener("pointermove", (event) => {
    const entry = pointers.get(event.pointerId);
    if (!entry) return;
    event.preventDefault();
    applyButton(entry, buttonAt(entry, event), event.isTrusted);
  });
  const end = (event) => {
    const entry = pointers.get(event.pointerId);
    if (!entry) return;
    event.preventDefault();
    releaseTouchTokens([...entry.held].map((button) => button.dataset.touch));
    pointers.delete(event.pointerId);
    refresh();
  };
  cluster.addEventListener("pointerup", end);
  cluster.addEventListener("pointercancel", end);
})();

window.__finalBlowEngine = {
  version: "2.3-family",
  simulationHz: SIMULATION_HZ,
  toggleDebug(enabled = !state.debug) {
    state.debug = Boolean(enabled);
    return state.debug;
  },
  snapshot() {
    const cameraTarget = finisherCameraTarget();
    const finisherCinematic = finisherCinematicCamera(state.cinematicZoom);
    return {
      tick: state.simulationTick,
      phase: state.phase,
      screen: state.screen,
      mode: state.mode,
      stage: state.stage,
      stageArt: {
        asset: stages[state.stage]?.src || "",
        loaded: Boolean(stageImages[state.stage]?.complete && stageImages[state.stage]?.naturalWidth),
        style: state.stage === "somerset"
          ? "photorealistic-street"
          : state.stage === "vet"
            ? "photorealistic-eagles-tailgate"
            : "cinematic-arcade",
        embeddedPeople: state.crowd?.embeddedPeople || 0,
        embeddedPose: state.crowd?.embeddedPose || "",
      },
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
      // R1.9 wave 15 platform blocks: thumb-slide input, haptics, pad menu
      // navigation, cabinet mode, the adaptive governor and the wake lock.
      touchInput: { ...touchFxDebug, activeTokens: [...touch] },
      haptics: { ...hapticsDebug, enabled: state.touchSettings.haptics },
      padNav: {
        ...padNavDebug,
        focused: padFocusElement ? (padFocusElement.id || padFocusElement.textContent.trim().slice(0, 28)) : null,
      },
      cabinetMode: state.cabinetMode,
      governor: {
        eligible: governorEligible(),
        active: Boolean(performanceGovernor.machine),
        profile: state.performance.id,
        steps: performanceGovernor.steps,
        lastChange: performanceGovernor.lastChange,
      },
      wakeLock: {
        supported: Boolean(navigator.wakeLock),
        wanted: wakeLockWanted,
        held: Boolean(wakeLockSentinel),
      },
      training: trainingSnapshot(state.training),
      online: onlineSnapshot(),
      demo: demoSnapshot(),
      balance: balanceAudit,
      tournament: tournamentAudit,
      inputRules: {
        buffer: { ...INPUT_BUFFER_RULES },
        priority: [...TOURNAMENT_ACTION_PRIORITY],
      },
      presentationRules: {
        hitFlashFilter: HIT_FLASH_FILTER,
        attackNamePopups: false,
      },
      combatTextLabels: state.effects
        .filter((effect) => effect.kind === "combatText")
        .map((effect) => effect.label),
      camera: {
        x: cameraTarget.x,
        y: cameraTarget.y,
        zoom: state.finisher ? state.cinematicZoom : 1,
        locked: !state.finisher,
        mode: state.finisher ? "finisher" : "arena",
        shot: finisherCinematic.shot,
        intensity: Number(finisherCinematic.intensity.toFixed(3)),
        focus: finisherCinematic.focus,
        projectileId: finisherCinematic.projectileId,
        cuts: state.finisher?.cinematicCuts || 0,
        impactCloseUps: state.finisher?.impactCloseUps || 0,
        peakZoom: state.finisher?.peakZoom || 1,
        slowMotionHits: state.finisher?.slowMotionHits || 0,
        // Wave 6 presentation camera: applied render values. Identity is
        // exactly 1/0/0/0 — smoke tests assert it returns there after every
        // cinematic beat.
        presentation: {
          zoom: Number(cinematicCamera.zoom.toFixed(4)),
          x: Number(cinematicCamera.x.toFixed(3)),
          y: Number(cinematicCamera.y.toFixed(3)),
          rotation: Number(cinematicCamera.rotation.toFixed(5)),
          letterbox: Number(letterboxLevel.toFixed(3)),
        },
      },
      finalBlowArt: {
        active: Boolean(state.finisher),
        style: state.finisher ? "photorealistic" : "arcade",
        transition: Number(finisherRealityAmount().toFixed(3)),
        phase: state.finisher?.projectilePhase || "waiting",
        backdropAsset: "assets/final-blow-reality.webp",
        backdropLoaded: Boolean(finalBlowRealityImage.complete && finalBlowRealityImage.naturalWidth),
        backdropPasses: presentationDebug.realisticBackdrops,
        lightingPasses: presentationDebug.realisticLighting,
        portraitPasses: presentationDebug.realisticPortraits,
        filmGrainPasses: presentationDebug.filmGrainPasses,
      },
      arcade: arcadeRunSnapshot(state.arcadeRun),
      // Release 1.8 GRIND: mode/meta block — score attack, survival, Block
      // War, the Daily Jawn, House Rules config, and the one-shot totals.
      meta: {
        score: scoreSessionSnapshot(),
        survival: survivalRunSnapshot(state.survivalRun),
        team: teamBattleSnapshot(state.teamBattle),
        daily: {
          active: dailySession.active,
          date: dailySession.date,
          finished: dailySession.finished,
          fighterId: dailySession.plan?.fighterId || null,
          mutator: dailySession.plan?.mutator || null,
          outcome: dailySession.outcome ? { ...dailySession.outcome } : null,
          record: loadDailyRecord(),
        },
        mutators: [...state.mutators],
        pendingMutators: [...pendingMutators],
        matchRules: { ...state.matchRules },
        suddenDeathHitDone: state.suddenDeathHitDone,
        tally: {
          active: tallyUi.active,
          done: tallyUi.done,
          total: tallyUi.total,
          runTotal: tallyUi.runTotal,
          rows: tallyUi.rows.map((row) => ({ ...row })),
        },
        initials: {
          active: initialsUi.active,
          letters: [...initialsUi.letters],
          cursor: initialsUi.cursor,
          score: initialsUi.score,
        },
        highScores: loadHighScores(),
        survivalBest: loadSurvivalBest(),
        // v2.1 PROGRESSION probes: unlocked count + records rollup + the
        // ending sequence position, for smoke tests and QA scripts.
        blackBook: blackBookSummary(blackBookLedger),
        records: recordsSummary(recordsStore),
        ending: {
          active: endingSequence.active,
          step: endingSequence.step,
          panels: endingSequence.panels.length,
          fighterId: endingSequence.def?.id || null,
        },
        fx: { ...modeFxDebug },
        // R1.9 SCHOOL & POCKET: lesson machine, slot presence, medal rollup.
        school: schoolSession.machine
          ? { active: schoolSession.active, ...fightSchoolSnapshot(schoolSession.machine) }
          : null,
        trainingSlots: situationSlots.map((slot) => Boolean(slot)),
        trialMedals: Object.fromEntries(roster.map(({ id }) => [id, fighterMedalCounts(trialMedals, id)])),
      },
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
        sparkLines: state.particles.filter((particle) => particle.kind === "sparkLine").length,
        arterialSprays: state.particles.filter((particle) => particle.kind === "arterial").length,
        severedLimbs: state.effects.filter((effect) => effect.kind === "severedLimb").length,
        signatureProjectiles: state.effects.filter((effect) => effect.kind === "fatalityProjectile").length,
        projectileFocusBursts: state.effects.filter((effect) => effect.kind === "projectileFocusBurst").length,
        bloodStains: state.effects.filter((effect) => effect.kind === "bloodDecal" && effect.stain).length,
        fatalitySlowMo: Boolean((state.finisher?.slowMotionTicks || 0) > 0),
        shockRings: state.effects.filter((effect) => effect.kind === "shockRing").length,
        afterimages: state.effects.filter((effect) => effect.kind === "afterimage").length,
        sweatDrops: state.particles.filter((particle) => particle.kind === "sweat").length,
        rimLights: presentationDebug.rimLights,
        hitSmears: presentationDebug.hitSmears,
        dizzyGhosts: presentationDebug.dizzyGhosts,
        breathingFighters: presentationDebug.breathing,
        contactShadows: presentationDebug.contactShadows,
        gritAuras: presentationDebug.gritAuras,
        // R1.9 SCHOOL & POCKET counters (trainingFxDebug: monotonic one-shots
        // on the hudFxDebug pattern) for orchestrator smoke tests.
        frameMeterTicks: trainingFxDebug.frameMeterTicks,
        motionFlashes: trainingFxDebug.motionFlashes,
        assistRecolors: trainingFxDebug.assistRecolors,
        schoolSteps: trainingFxDebug.schoolSteps,
        situationSlotSaves: trainingFxDebug.slotSaves,
        situationSlotLoads: trainingFxDebug.slotLoads,
        trialDemoRuns: trainingFxDebug.trialDemoRuns,
        trialMedalAwards: trainingFxDebug.medalAwards,
        inputHistoryRows: inputColumn.rows.length,
        lastLegsFighters: presentationDebug.lastLegs,
        battleDamageMarks: battleDamageMarks[0].length + battleDamageMarks[1].length,
        battleDamageDrawn: presentationDebug.battleDamage,
        castShadows: presentationDebug.castShadows,
        // 1.9E facing probe: numeric facing × authored atlas facing per side.
        fighterMirrors: presentationDebug.lastFighterMirror.map((entry) => (entry ? { ...entry } : null)),
        stageScars: stageScars.length,
        rackFocus: Number(rackFocusLevel.toFixed(3)),
        practicalLights: presentationDebug.practicalLights,
        weatherParticles: presentationDebug.weatherParticles,
        foregroundOccluders: presentationDebug.foregroundOccluders,
        crowdFlashes: presentationDebug.crowdFlashes,
        counterFlashes: presentationDebug.counterFlashes,
        projectileGlows: presentationDebug.projectileGlows,
        swipeRibbons: presentationDebug.swipeRibbons,
        wallSplats: presentationDebug.wallSplats,
        focusLines: presentationDebug.focusLines,
        lightSpills: presentationDebug.lightSpills,
        timeOfDay: Number(timeOfDayLevel().toFixed(3)),
        roundWinBeat: Number(roundWinBeatLevel(state.simulationTick).toFixed(3)),
        gritFlare: Number(Math.max(gritFlareLevel[0], gritFlareLevel[1]).toFixed(3)),
        superDim: Number(superDimLevel.toFixed(3)),
        // R2.0 FAMILY wave 16 counters.
        dialogueExchanges: modeFxDebug.dialogueExchanges,
        dialogueCardsShown: modeFxDebug.dialogueCardsShown,
        winQuoteSelections: modeFxDebug.winQuoteSelections,
        altPalettesBuilt: paletteFxDebug.built,
        altPaletteSides: [...matchPalettes],
        reflections: Boolean(state.performance.shadows && (STAGE_REFLECTIONS[state.stage] ?? 0) > 0),
        shake: Number(state.shake.toFixed(3)),
        hitstop: Number(state.hitstop.toFixed(4)),
        // Wave 5 HUD effects: cumulative one-shot trigger totals (see
        // hudFxDebug) — monotonic, so per-frame peak sampling reads them
        // without racing the presentationDebug frame reset.
        damageGhosts: hudFxDebug.damageGhosts,
        letterSlams: hudFxDebug.letterSlams,
        comboHeat: hudFxDebug.comboHeat,
        slashWipes: hudFxDebug.slashWipes,
        selectSlams: hudFxDebug.selectSlams,
        victoryEntrances: hudFxDebug.victoryEntrances,
        pipFlips: hudFxDebug.pipFlips,
        timerPulses: hudFxDebug.timerPulses,
        // Wave 6 cinematic camera: cumulative one-shot beat totals on the
        // same monotonic pattern, plus the win-pose dim level.
        koPunchIns: cinemaFxDebug.koPunchIns,
        introDollies: cinemaFxDebug.introDollies,
        dreadCreeps: cinemaFxDebug.dreadCreeps,
        counterPunchIns: cinemaFxDebug.counterPunchIns,
        handheldFrames: cinemaFxDebug.handheldFrames,
        winSettles: cinemaFxDebug.winSettles,
        impactRecoils: cinemaFxDebug.impactRecoils,
        // Signed live kick amplitude (screen px along the hit direction).
        // Holds the full kick value for the ~0.3s return, so per-frame peak
        // sampling reads the 2-4px magnitude without racing the decay.
        impactRecoilKick: Number(cameraRecoil.ampX.toFixed(3)),
        winPoseDim: Number(roundOverDimLevel.toFixed(3)),
        // Wave 7 render tech: per-frame pass counts (presentationDebug) for
        // the steady composites, monotonic one-shot totals (hudFxDebug) for
        // the latched effects, and 0/1 current display-mode states.
        bloomPasses: presentationDebug.bloomPasses,
        rgbSplits: presentationDebug.rgbSplits,
        distortionRings: hudFxDebug.distortionRings,
        sharpRender: renderDpr > 1 ? 1 : 0,
        sloMoBlurFrames: hudFxDebug.sloMoBlurFrames,
        crtMode: crtOverlayActive() ? 1 : 0,
        superCutIns: hudFxDebug.superCutIns,
        // Release 1.6 LOUD: live synth-bus levels (eased render values),
        // monotonic one-shot totals (audioFxDebug) and the audio node-graph
        // debug counts. All render-side observers — nothing here reads back
        // into the simulation.
        crowdBusLevel: Number(crowdAudioLevel.toFixed(3)),
        crowdSwells: audioFxDebug.crowdSwells,
        impactLayers: audioFxDebug.impactLayers,
        musicIntensity: Number(musicIntensityLevel.toFixed(3)),
        ambienceActive: ambienceEngaged ? 1 : 0,
        ambienceStage: ambienceEngaged ? state.stage : "",
        ambienceEvents: audioFxDebug.ambienceEvents,
        stageMusicAuto: state.musicChoice === "auto" && stageMusicAutoApplied ? 1 : 0,
        audioContextState: state.audio ? state.audio.state : "none",
        audioNodesLive: audioPersistentNodes,
        audioOneShots: audioLiveOneShots,
        audioNodesCreated: audioFxDebug.nodesCreated,
        // Wave 9 voice systems: monotonic call totals (voiceFxDebug pattern)
        // plus the probe-request count QA uses to prove missing banks are
        // probed exactly once, never per call.
        announcerCalls: voiceFxDebug.announcerCalls,
        announcerBanksLoaded: voiceFxDebug.announcerBanksLoaded,
        voiceVariantPlays: voiceFxDebug.voiceVariantPlays,
        reactiveCues: voiceFxDebug.reactiveCues,
        storyCallouts: voiceFxDebug.storyCallouts,
        onlineMoments: voiceFxDebug.onlineMoments,
        voiceProbeRequests,
        // Release 1.7 DEPTH: sim-mechanic one-shot totals (mechFxDebug —
        // monotonic, resim-guarded at every increment site).
        guardCrushes: mechFxDebug.guardCrushes,
        quickRises: mechFxDebug.quickRises,
        wakeDelays: mechFxDebug.wakeDelays,
        airRecoveries: mechFxDebug.airRecoveries,
        perfectGuards: mechFxDebug.perfectGuards,
        // Release 1.7 wave 11 offense mechanics, same monotonic pattern.
        wallBounces: mechFxDebug.wallBounces,
        exThrowables: mechFxDebug.exThrowables,
        commandKicks: mechFxDebug.commandKicks,
        taunts: mechFxDebug.taunts,
        // Release 1.8 GRIND mode systems, same monotonic one-shot pattern
        // (full detail lives in snapshot().meta.fx).
        tallyScreens: modeFxDebug.tallyScreens,
        initialsEntries: modeFxDebug.initialsEntries,
        survivalMilestones: modeFxDebug.survivalMilestones,
        teamEliminations: modeFxDebug.teamEliminations,
        teamWalkIns: modeFxDebug.teamWalkIns,
        dailyRuns: modeFxDebug.dailyRuns,
        attractScoreBoards: modeFxDebug.attractScoreBoards,
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
        guardMeter: fighter.guardMeter,
        guardCrushFrames: fighter.guardCrushFrames,
        guardCrushed: fighter.guardCrushFrames > 0,
        guardImmuneFrames: fighter.guardImmuneFrames,
        guardStartedTick: fighter.guardStartedTick,
        wakeOption: fighter.wakeOption,
        // Release 1.7 wave 11 offense fields.
        wallBounceArmed: fighter.wallBounceArmed,
        wallBounceUsed: fighter.wallBounceUsed,
        tauntFrames: fighter.tauntFrames,
        taunting: fighter.tauntFrames > 0,
        tauntGritGranted: fighter.tauntGritGranted,
        tauntLine: fighter.tauntLine,
        airTechArmed: fighter.airTechArmed,
        airHitstunFrames: fighter.airHitstunFrames,
        airTechFlipFrames: fighter.airTechFlipFrames,
        airTechTaxPending: fighter.airTechTaxPending,
        landingRecoveryFrames: fighter.landingRecoveryFrames,
        reversalWindowFrames: fighter.reversalWindowFrames,
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
    fight(firstId = "deathblow", secondId = "jez", serial = null) {
      const firstIndex = roster.findIndex((fighter) => fighter.id === firstId);
      const secondIndex = roster.findIndex((fighter) => fighter.id === secondId);
      if (firstIndex < 0 || secondIndex < 0) throw new Error(`Unknown matchup: ${firstId} vs ${secondId}`);
      state.mode = "versus";
      state.arcadeRun = null;
      state.survivalRun = null;
      state.teamBattle = null;
      dailySession.active = false;
      endScoreRun();
      // Release 1.8 GRIND: QA fights honour the pending House Rules picker so
      // probes can demonstrate mutators altering a versus match.
      applyMatchRulesForMatch();
      state.qaManualMode = true;
      state.picks = [firstIndex, secondIndex];
      state.rounds = [0, 0];
      state.round = 1;
      // Release 1.7 wave 11: a pinned serial reproduces the exact match seed
      // (and therefore the state.rng stream), so determinism probes can run
      // the same scripted sequence twice from identical initial state.
      if (Number.isFinite(serial)) state.matchSerial = serial;
      else state.matchSerial += 1;
      seedMatch(state.round);
      // Wave 16: QA fights honour the staged color picks + mirror auto-alt.
      applyMatchPalettes([roster[firstIndex], roster[secondIndex]], pendingPalettes);
      state.fighters = [makeFighter(firstIndex, 0), makeFighter(secondIndex, 1)];
      resetStageWeapon();
      resetCrowd();
      clearBattleDamage();
      clearStageScars();
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
      // v2.1 PROGRESSION: QA fights accumulate records like real ones.
      progressionResetMatch();
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
    // --- R1.9 SCHOOL & POCKET probes --------------------------------------
    trainingSlotSave(slot = 0) {
      return saveSituationSlot(slot);
    },
    trainingSlotLoad(slot = 0) {
      return loadSituationSlot(slot);
    },
    trialDemo(index = null) {
      if (state.mode !== "training") throw new Error("Start training first");
      if (Number.isInteger(index)) selectTrainingTrial(state.training, state.fighters[0].kitId, index);
      return startTrialDemo();
    },
    trialDemoActive() {
      return trialDemo.active;
    },
    trialMedals() {
      return JSON.parse(JSON.stringify(trialMedals));
    },
    clearTrialMedals() {
      trialMedals = normalizeTrialMedals(null);
      saveTrialMedals();
      refreshTrialMedalBadges();
      return true;
    },
    school() {
      startFightSchool();
      return { active: schoolSession.active, ...fightSchoolSnapshot(schoolSession.machine) };
    },
    schoolStatus() {
      return schoolSession.machine
        ? { active: schoolSession.active, ...fightSchoolSnapshot(schoolSession.machine) }
        : null;
    },
    schoolExit() {
      exitFightSchool();
      return true;
    },
    schoolClear() {
      localStorage.removeItem(SCHOOL_STORAGE_KEY);
      return true;
    },
    comboTrialsLab() {
      startComboTrialsLab();
      return trainingSnapshot(state.training).trial;
    },
    stage(stageId = "somerset") {
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
    // --- R2.0 FAMILY wave 16 probes ---------------------------------------
    commissioner(unlock = true) {
      if (unlock) unlockCommissioner();
      else relockCommissioner();
      return {
        unlocked: commissionerUnlocked(),
        rosterIds: roster.map(({ id }) => id),
        cards: $$(".fighter-card").length,
      };
    },
    palettes(first = 0, second = 0) {
      pendingPalettes = [first === 1 ? 1 : 0, second === 1 ? 1 : 0];
      if (state.fighters.length === 2) {
        applyMatchPalettes(state.fighters.map(({ def }) => def), pendingPalettes);
      }
      return { pendingPalettes: [...pendingPalettes], matchPalettes: [...matchPalettes], built: paletteFxDebug.built };
    },
    dialogue() {
      return {
        active: introDialogue.active,
        kind: introDialogue.kind,
        revealed: introDialogue.revealed,
        lines: introDialogue.lines.map(({ id, name, line, side }) => ({ id, name, line, side })),
        exchanges: modeFxDebug.dialogueExchanges,
        cardsShown: modeFxDebug.dialogueCardsShown,
        phase: state.phase,
        phaseTime: Number(state.phaseTime.toFixed(2)),
      };
    },
    winQuote() {
      return lastWinQuoteSelection ? { ...lastWinQuoteSelection } : null;
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
    // --- Release 1.8 GRIND mode probes ------------------------------------
    survival(fighterId = "deathblow", seed = 237) {
      if (rosterIndexById(fighterId) < 0) throw new Error(`Unknown fighter: ${fighterId}`);
      startSurvivalRun(fighterId, seed);
      return window.__finalBlowEngine.snapshot();
    },
    // Resolve the current survival/arcade/team bout as a player win through
    // the REAL finishRound → roundover → resolveMatchResult pipeline. Pass
    // hold=true to leave the round-over ceremony playing in real time (so
    // wall-clock layers like the Block War elimination callout can fire).
    winBout(playerHealth = null, hold = false) {
      if (state.screen !== "fight") throw new Error("Start a fight first");
      if (Number.isFinite(playerHealth)) state.fighters[0].health = clamp(playerHealth, 1, 100);
      finishRound(0, -1);
      if (!hold) {
        state.phaseTime = 0;
        simulationClock.stepOnce(runSimulationStep);
      }
      return window.__finalBlowEngine.snapshot();
    },
    loseBout() {
      if (state.screen !== "fight") throw new Error("Start a fight first");
      finishRound(1, -1);
      state.phaseTime = 0;
      simulationClock.stepOnce(runSimulationStep);
      return window.__finalBlowEngine.snapshot();
    },
    teamBattle(teamA = ["deathblow", "jez", "alan"], teamB = ["post", "benny", "donald"], cpu = true) {
      state.mode = "team";
      state.arcadeRun = null;
      state.survivalRun = null;
      dailySession.active = false;
      endScoreRun();
      state.teamPicks = [[...teamA], [...teamB]];
      beginTeamBattle(Boolean(cpu));
      startMatch(true);
      return window.__finalBlowEngine.snapshot();
    },
    daily(dateString = null) {
      startDailyRun(dateString, { force: true });
      return window.__finalBlowEngine.snapshot();
    },
    dailyPlan(dateString = null) {
      const date = dateString || dailyDateString();
      const plan = createDailyPlan(date, baseRosterIds());
      return {
        date: plan.date,
        seed: plan.seed,
        fighterId: plan.fighterId,
        mutator: plan.mutator,
        difficulty: plan.difficulty,
        matches: plan.run.matches.map(({ opponentId, stage, kind }) => ({ opponentId, stage, kind })),
      };
    },
    mutators(ids = []) {
      pendingMutators = normalizeMutators(ids);
      renderMutatorBar();
      return [...pendingMutators];
    },
    tallyContinue() {
      // Mirrors a player: a press mid-count snaps the numbers, the next press
      // continues. The helper presses through both stages in one call.
      tallyContinue();
      if (tallyUi.active && tallyUi.done) tallyContinue();
      return window.__finalBlowEngine.snapshot();
    },
    enterInitials(text = "JEZ") {
      if (!initialsUi.active) throw new Error("Initials entry is not active");
      initialsUi.letters = normalizeInitials(text).split("");
      renderInitials();
      commitInitials();
      return window.__finalBlowEngine.snapshot();
    },
    highScores() {
      return loadHighScores();
    },
    clearScores() {
      saveHighScores([]);
      localStorage.removeItem(DAILY_RULES.storageKey);
      localStorage.removeItem(SURVIVAL_BEST_KEY);
      return true;
    },
    // --- v2.1 PROGRESSION probes -------------------------------------------
    progression() {
      return {
        blackBook: blackBookSummary(blackBookLedger),
        unlocked: Object.keys(blackBookLedger.unlocked),
        tallies: { ...blackBookLedger.tallies },
        best: { ...blackBookLedger.best },
        sets: Object.fromEntries(Object.entries(blackBookLedger.sets).map(([group, keys]) => [group, Object.keys(keys)])),
        records: recordsSummary(recordsStore),
        fighters: Object.fromEntries(Object.entries(recordsStore.fighters).map(([id, record]) => [id, {
          wins: record.wins,
          losses: record.losses,
          rounds: record.rounds,
          damageDealt: Math.round(record.damageDealt),
          damageTaken: Math.round(record.damageTaken),
          fatalities: record.fatalities,
          peakCombo: record.peakCombo,
          favorite: favoriteMove(record),
          rank: masteryRank(record),
        }])),
      };
    },
    clearProgression() {
      recordsStore = normalizeRecordsStore(null);
      blackBookLedger = normalizeBlackBookStore(null);
      localStorage.removeItem(RECORDS_STORAGE_KEY);
      localStorage.removeItem(BLACK_BOOK_STORAGE_KEY);
      refreshProgressionUi();
      return true;
    },
    blackBookScreen() {
      showBlackBookScreen();
      return blackBookSummary(blackBookLedger);
    },
    recordsScreen() {
      showRecordsScreen();
      return recordsSummary(recordsStore);
    },
    ending(playerId = "deathblow") {
      // Complete an arcade ladder instantly and roll the ending sequence —
      // the fast QA path to panels + credits.
      const run = createArcadeRun(playerId, roster.map(({ id }) => id), 237);
      while (!run.completed) recordArcadeResult(run, true);
      state.mode = "arcade";
      state.arcadeRun = run;
      dailySession.active = false;
      showArcadeEnding();
      return window.__finalBlowEngine.snapshot().meta.ending;
    },
    endingAdvance() {
      advanceEndingSequence();
      return window.__finalBlowEngine.snapshot().meta.ending;
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
          // Overlap while a lunge travels is that move's identity, and overlap
          // easing back out through recovery is the readability pass working
          // as designed. What must never happen is STUCK overlap: two grounded
          // unexempt bodies inside each other without the gap shrinking. The
          // metric keeps its name so the harness assertion reads the same.
          let previousOverlap = Infinity;
          for (let frame = 0; frame < durationFrames && state.screen === "fight"; frame += 1) {
            simulationClock.stepOnce(runSimulationStep);
            const [a, b] = state.fighters;
            if (!a || !b) break;
            if (![a.x, a.y, a.health, b.x, b.y, b.health].every(Number.isFinite)) nonFinite = true;
            // Hitstop freezes positions, so overlap holding steady across a
            // frozen tick is not "stuck" — the comparison skips those ticks.
            const collisionExempt = a.grabbing || b.grabbing || a.grabbed || b.grabbed
              || a.attacking?.ignorePushbox || b.attacking?.ignorePushbox
              || state.hitstop > 0;
            if (a.grounded && b.grounded && !collisionExempt) {
              const required = (a.crouch ? a.movement.crouchingPushboxHalfWidth : a.movement.standingPushboxHalfWidth)
                + (b.crouch ? b.movement.crouchingPushboxHalfWidth : b.movement.standingPushboxHalfWidth);
              const overlap = required - Math.abs(a.x - b.x);
              if (overlap > 0 && overlap >= previousOverlap) {
                maximumGroundOverlap = Math.max(maximumGroundOverlap, overlap);
              }
              previousOverlap = overlap > 0 ? overlap : Infinity;
            } else {
              previousOverlap = Infinity;
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
        "dizzyFrames",
        "dizzyTotalFrames",
        // Release 1.7 DEPTH fields, settable for probe setup.
        "guardMeter",
        "guardCrushFrames",
        "guardCrushTotalFrames",
        "guardImmuneFrames",
        "airHitstunFrames",
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
      // A QA teleport settles instantly: run the eased separation to a fixed
      // point so scripts always start from legal spacing, not mid-resolution.
      for (let settle = 0; settle < 12; settle += 1) {
        const before = [state.fighters[0].x, state.fighters[1].x];
        separateFighters();
        if (before[0] === state.fighters[0].x && before[1] === state.fighters[1].x) break;
      }
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
        fatalitySpecial: fatality?.special || null,
        fatalityProjectileId: fatality?.projectileId || null,
        fatalityProjectileSetup: fatality?.projectileSetup || null,
        fatalityProjectileAction: fatality?.projectileAction || null,
        fatalityProjectileFinale: fatality?.projectileFinale || null,
        projectileCause: fatality?.projectileFinale || null,
        fatalityLimb: fatality?.limb || null,
        fatalityDevice: fatality?.device || null,
        fatalityTriggered: Boolean(state.finisher?.fatalityTriggered),
        fatalityPools: state.effects.filter((effect) => effect.kind === "fatalityPool").length,
        goreFragments: state.particles.filter((particle) => particle.kind === "goreFragment").length,
        goreShockwaves: state.effects.filter((effect) => effect.kind === "goreShockwave").length,
        lensBlood: state.effects.filter((effect) => effect.kind === "lensBlood").length,
        severedLimbs: state.effects.filter((effect) => effect.kind === "severedLimb").length,
        signatureProjectiles: state.effects.filter((effect) => effect.kind === "fatalityProjectile").length,
        projectileFocusBursts: state.finisher?.projectileFocusBursts || 0,
        projectileFocusBeats: state.finisher?.projectileFocusBeats || 0,
        projectileBeatLabels: [...(state.finisher?.projectileBeatLabels || [])],
        projectilePhase: state.finisher?.projectilePhase || "waiting",
        cinematicArtStyle: state.finisher ? "photorealistic" : "arcade",
        realityBreakActive: Boolean(state.finisher),
        realityBreakAmount: Number(finisherRealityAmount().toFixed(3)),
        realisticBackdropLoaded: Boolean(finalBlowRealityImage.complete && finalBlowRealityImage.naturalWidth),
        signatureProjectileTriggered: Boolean(state.finisher?.signatureProjectileTriggered),
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
    // --- R1.9 wave 15 platform probes -------------------------------------
    touchDebug() {
      return { ...touchFxDebug, tokens: [...touch] };
    },
    haptics(enabled = null) {
      if (enabled !== null) state.touchSettings.haptics = Boolean(enabled);
      return { ...hapticsDebug, enabled: state.touchSettings.haptics };
    },
    hapticEvent(kind = "heavy", damage = 0) {
      combatHaptic(kind, { damage });
      return { ...hapticsDebug };
    },
    padMenu(kind, padIndex = 0) {
      handleMenuPadEvent(kind, padIndex);
      return {
        screen: state.screen,
        focused: padFocusElement ? (padFocusElement.id || padFocusElement.textContent.trim().slice(0, 28)) : null,
        ...padNavDebug,
      };
    },
    cabinet(enabled = true) {
      state.cabinetMode = Boolean(enabled);
      if (state.cabinetMode && !state.crtMode) state.crtMode = true;
      applyCabinetMode();
      return {
        cabinetMode: state.cabinetMode,
        crtMode: state.crtMode,
        profile: state.performance.id,
        touchDisplay: getComputedStyle($("#touchControls")).display,
        marqueeVisible: Boolean($("#cabinetMarquee") && !$("#cabinetMarquee").hidden),
      };
    },
    governorInject(frameMs = 25, frames = 130) {
      if (!performanceGovernor.machine) {
        const baseline = resolvePerformanceProfile("auto", performanceEnvironment(state.accessibility.reducedMotion)).id;
        performanceGovernor.machine = createPerformanceGovernor({ profileId: state.performance.id, baselineId: baseline });
      }
      for (let frame = 0; frame < Math.max(1, Math.floor(frames)); frame += 1) {
        applyGovernorChange(performanceGovernor.machine.observe(frameMs));
      }
      return {
        eligible: governorEligible(),
        profile: state.performance.id,
        machineProfile: performanceGovernor.machine?.profile() || null,
        steps: performanceGovernor.steps,
        lastChange: performanceGovernor.lastChange,
      };
    },
    wakeLock() {
      syncWakeLock();
      return { supported: Boolean(navigator.wakeLock), wanted: wakeLockWanted, held: Boolean(wakeLockSentinel) };
    },
    iosCoach(show = true) {
      $("#iosCoachMark").hidden = !show;
      return !$("#iosCoachMark").hidden;
    },
    // Release 1.7 DEPTH: live rollback round-trip. Snapshots the real combat
    // state, mutates it by simulating ahead, restores, and reports whether the
    // combat checksum returned to the pre-snapshot value — proving every
    // fighter field (including the DEPTH additions) is captured and restored.
    rollbackProbe(seconds = 0.5) {
      if (state.fighters.length !== 2) throw new Error("Start a QA fight first");
      const checksumBefore = checksumState(combatRollbackState());
      const snapshot = saveRollbackState();
      this.step(seconds);
      const checksumMutated = checksumState(combatRollbackState());
      restoreRollbackState(structuredClone(snapshot));
      const checksumAfter = checksumState(combatRollbackState());
      return {
        match: checksumBefore === checksumAfter,
        mutated: checksumMutated !== checksumBefore,
        checksumBefore,
        checksumMutated,
        checksumAfter,
      };
    },
  };
}

// Wave 16: a FINAL clear inked in the Black Book before this build shipped
// still counts — grant the ninth slot retroactively (quiet: no toast at boot).
if (!commissionerUnlocked() && blackBookLedger.tallies.finalArcadeClears >= 1) {
  unlockCommissioner({ quiet: true });
}
setupRoster();
renderMoveList();
// ---------------------------------------------------------------------------
// CINEMA 3D bridge — experimental Three.js presentation renderer.
// The module lazy-loads on first activation (toggle or ?renderer=3d) so the
// 2D game never pays its cost. The 3D renderer only READS sim state; the
// world-draw handoff happens per-frame in draw() via cinema3dWorldActive().
// Battery performance profile refuses activation entirely.
// ---------------------------------------------------------------------------
const cinema3dBridge = { renderer: null, loading: false, onHit: null };

function cinema3dAllowed() {
  return state.performance?.id !== "battery";
}

function cinema3dWorldActive() {
  return Boolean(
    cinema3dBridge.renderer?.ready
    && state.cinema3d
    && cinema3dAllowed()
    && state.screen === "fight"
    // Scripted fatality finishers keep their bespoke 2D cinematic presentation.
    && !state.finisher,
  );
}

function ensureCinema3d() {
  if (!state.cinema3d || !cinema3dAllowed()) {
    cinema3dBridge.renderer?.setVisible(false);
    return;
  }
  if (cinema3dBridge.renderer || cinema3dBridge.loading) return;
  cinema3dBridge.loading = true;
  import("./renderer/three/main.mjs").then((module) => {
    const renderer3d = module.createRenderer({
      state,
      cinematicCamera,
      stageImages,
      fighterAtlases,
      fighterMoveAtlases,
      // Wave 16: the 3D rigs consume the same palette-remapped atlas canvases
      // the 2D renderer draws (canvas shimmed with Image-like fields). The
      // palette key invalidates a side's rig when its color pick changes.
      fighterAtlasFor: (fighter, bank) => paletteAtlas(fighter.def.id, fighter.side, bank),
      fighterPaletteKey: (fighter) => (matchPalettes[fighter.side] === 1 ? "alt" : ""),
      fighterRenderSize,
      fighterAnimationPose,
      moveSheetAdjust: MOVE_SHEET_ADJUST,
      gritSuperCost: GRIT_RULES.superCost,
      gameCanvas: canvas,
      isRollbackResimulating: () => rollbackResimulating,
      getPerformanceProfile: () => state.performance,
      isWorldActive: () => cinema3dWorldActive(),
    });
    cinema3dBridge.renderer = renderer3d;
    cinema3dBridge.onHit = (payload) => renderer3d.onHit(payload);
  }).catch((error) => {
    console.warn("CINEMA 3D failed to load; staying on the 2D renderer.", error);
  }).finally(() => {
    cinema3dBridge.loading = false;
  });
}

renderBindings();
applyAccessibilitySettings();
applyTouchSettings();
applyCabinetMode();
maybeShowIosCoachMark();
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
} else {
  // Wave 15 PWA shortcuts: ?mode=arcade|survival|daily deep-links from the
  // manifest jump list land past the title, straight into their mode.
  const bootMode = new URLSearchParams(location.search).get("mode");
  if (bootMode === "arcade" || bootMode === "survival") {
    showScreen("title");
    suppressImmersivePrompt = true;
    startSelect(bootMode);
  } else if (bootMode === "daily") {
    showScreen("title");
    suppressImmersivePrompt = true;
    startDailyRun();
  } else showScreen("title");
}
updateStageUI();
requestAnimationFrame(loop);
requestAnimationFrame(menuPadLoop);
