import { createAttackInstance } from "./foundation.mjs";
import { ATTACK_LEVELS, KICK_VARIANTS, attackFrameData, deriveKickProfile, resolveKickVariant } from "./defense.mjs";
import { GRIT_RULES, matchCommandSequence } from "./combos.mjs";
import { ENHANCED_THROWABLE_COMMAND, FIGHTER_THROWABLES, THROWABLE_COMMAND } from "./throwables.mjs";

export const KIT_ACTIONS = Object.freeze([
  "backSpecial",
  "enhancedCommandSpecial",
  "enhancedBackSpecial",
  "enhancedLauncher",
]);

const box = (x, y, width, height, from = 0, to = 3) => ({ from, to, box: { x, y, width, height } });
const anim = (row) => Object.freeze({ bank: "specials", frames: Object.freeze([0, 1, 2, 3].map((column) => row * 4 + column)) });

function move(id, baseKind, overrides = {}) {
  return {
    id,
    baseKind,
    kind: overrides.kind || baseKind,
    cancelProfileId: overrides.cancelProfileId || id,
    ...overrides,
  };
}

const shared = {
  airLight: move("air-light", "light", {
    level: ATTACK_LEVELS.AIR, startupFrames: 5, activeFrames: 8, recoveryFrames: 7,
    range: 112, damage: 7, push: 165, meter: 9, hitstunFrames: 16, blockstunFrames: 10, chipDamage: 0,
    hitboxes: [box(24, -157, 96, 82, 0, 3), box(38, -141, 107, 78, 4, 7)],
  }),
  airHeavy: move("air-heavy", "heavy", {
    level: ATTACK_LEVELS.AIR, startupFrames: 9, activeFrames: 9, recoveryFrames: 10,
    range: 144, damage: 13, push: 260, meter: 16, hitstunFrames: 22, blockstunFrames: 14, chipDamage: 0,
    knockdown: true,
    hitboxes: [box(24, -159, 116, 97, 0, 3), box(42, -141, 130, 91, 4, 8)],
  }),
  airSpecial: move("air-special", "special", {
    level: ATTACK_LEVELS.AIR, startupFrames: 13, activeFrames: 12, recoveryFrames: 16,
    range: 172, damage: 16, push: 330, meter: 22, hitstunFrames: 25, blockstunFrames: 17, chipDamage: 3,
    knockdown: true,
    hitboxes: [box(27, -181, 145, 124, 0, 5), box(42, -163, 162, 116, 6, 11)],
  }),
};

const deathblowMoves = {
  standLight: move("deathblow-hammer-jab", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 5, recoveryFrames: 10, range: 96, damage: 7, push: 165, meter: 11,
    hitstunFrames: 23, blockstunFrames: 10, chipDamage: 0,
    hitboxes: [box(22, -169, 82, 67, 0, 2), box(34, -163, 96, 64, 3, 4)],
  }),
  forwardLight: move("deathblow-body-check", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 9, activeFrames: 5, recoveryFrames: 12, range: 126, damage: 9, push: 210, meter: 12,
    hitstunFrames: 24, blockstunFrames: 11, chipDamage: 0, advanceSpeed: 155,
    hitboxes: [box(24, -178, 108, 96, 0, 4)],
  }),
  crouchLight: move("deathblow-quarry-tap", "light", {
    cancelProfileId: "crouch-light", level: ATTACK_LEVELS.LOW,
    startupFrames: 6, activeFrames: 5, recoveryFrames: 10, range: 106, damage: 6, push: 145, meter: 10,
    hitstunFrames: 21, blockstunFrames: 10, chipDamage: 0,
    hitboxes: [box(25, -73, 90, 43, 0, 4)],
  }),
  standHeavy: move("deathblow-wrecking-hook", "heavy", {
    cancelProfileId: "stand-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 15, activeFrames: 8, recoveryFrames: 17, range: 145, damage: 15, push: 310, meter: 18,
    hitstunFrames: 23, blockstunFrames: 15, chipDamage: 0,
    hitboxes: [box(31, -189, 111, 99, 0, 3), box(48, -179, 130, 96, 4, 7)],
  }),
  crouchHeavy: move("deathblow-foundation-sweep", "heavy", {
    cancelProfileId: "crouch-heavy", level: ATTACK_LEVELS.LOW,
    startupFrames: 13, activeFrames: 7, recoveryFrames: 21, range: 166, damage: 13, push: 265, meter: 17,
    hitstunFrames: 22, blockstunFrames: 15, chipDamage: 0, knockdown: true,
    hitboxes: [box(28, -66, 116, 43, 0, 2), box(48, -58, 137, 38, 3, 6)],
  }),
  overhead: move("deathblow-demolition-drop", "heavy", {
    cancelProfileId: "overhead", level: ATTACK_LEVELS.OVERHEAD,
    startupFrames: 22, activeFrames: 6, recoveryFrames: 20, range: 151, damage: 17, push: 315, meter: 19,
    hitstunFrames: 25, blockstunFrames: 16, chipDamage: 0,
    hitboxes: [box(21, -228, 102, 107, 0, 1), box(42, -207, 126, 135, 2, 5)],
  }),
  driveHeavy: move("deathblow-broad-street-shoulder", "heavy", {
    cancelProfileId: "drive-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 17, activeFrames: 9, recoveryFrames: 18, range: 186, damage: 17, push: 350, meter: 20,
    hitstunFrames: 25, blockstunFrames: 17, chipDamage: 0, advanceSpeed: 245,
    command: "← → + KICK", hitboxes: [box(32, -190, 145, 129, 0, 4), box(51, -178, 166, 120, 5, 8)],
  }),
  throw: move("deathblow-concrete-pour", "throw", {
    cancelProfileId: "throw", level: ATTACK_LEVELS.THROW,
    startupFrames: 5, activeFrames: 3, recoveryFrames: 24, range: 83, damage: 17, push: 215, meter: 15,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true, animation: anim(1),
    hitboxes: [box(20, -179, 75, 148, 0, 2)],
  }),
  special: move("deathblow-tremor-tap", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 13, activeFrames: 11, recoveryFrames: 18, range: 169, damage: 16, push: 325, meter: 22,
    hitstunFrames: 27, blockstunFrames: 18, chipDamage: 3, knockdown: true, armorFrames: 9,
    moveName: "TREMOR TAP", command: "SPECIAL", animation: anim(0),
    hitboxes: [box(26, -193, 146, 145, 0, 4), box(43, -181, 168, 134, 5, 10)],
  }),
  commandSpecial: move("deathblow-faultline-fist", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 15, activeFrames: 13, recoveryFrames: 17, range: 211, damage: 20, push: 385, meter: 25,
    hitstunFrames: 29, blockstunFrames: 19, chipDamage: 4, knockdown: true, armorFrames: 11, advanceSpeed: 280,
    moveName: "FAULTLINE FIST", command: "↓ → + PUNCH", animation: anim(0),
    hitboxes: [box(31, -199, 168, 151, 0, 5), box(52, -184, 191, 141, 6, 12)],
  }),
  backSpecial: move("deathblow-aftershock-grab", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.THROW,
    startupFrames: 8, activeFrames: 4, recoveryFrames: 28, range: 91, damage: 20, push: 245, meter: 18,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true,
    moveName: "AFTERSHOCK GRAB", command: "↓ ← + PUNCH", animation: anim(1),
    hitboxes: [box(18, -181, 84, 151, 0, 3)],
  }),
  launcher: move("deathblow-quarry-breaker", "heavy", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 11, activeFrames: 8, recoveryFrames: 24, range: 132, damage: 12, push: 78, meter: 17,
    hitstunFrames: 27, blockstunFrames: 15, chipDamage: 0, knockdown: true, launchVelocityY: -560,
    juggleStarter: true, moveName: "QUARRY BREAKER", command: "→ ↓ → + PUNCH", animation: anim(2),
    hitboxes: [box(20, -216, 104, 169, 0, 3), box(34, -253, 118, 205, 4, 7)],
  }),
  enhanced: move("deathblow-ex-tremor-tap", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 18, recoveryFrames: 15, range: 193, damage: 11, push: 105, meter: 9,
    hitstunFrames: 25, blockstunFrames: 20, chipDamage: 3, knockdown: true, knockdownOnFinal: true,
    maxHits: 2, rehitFrames: 8, gritCost: GRIT_RULES.enhancedSpecialCost, armorFrames: 13,
    moveName: "TREMOR TAP EX", command: "LP&HP", animation: anim(0),
    hitboxes: [box(28, -202, 169, 155, 0, 8), box(48, -188, 191, 145, 9, 17)],
  }),
  enhancedCommandSpecial: move("deathblow-ex-faultline-fist", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 11, activeFrames: 20, recoveryFrames: 15, range: 238, damage: 12, push: 124, meter: 10,
    hitstunFrames: 27, blockstunFrames: 21, chipDamage: 4, knockdown: true, knockdownOnFinal: true,
    maxHits: 2, rehitFrames: 9, gritCost: GRIT_RULES.enhancedSpecialCost, armorFrames: 15, advanceSpeed: 330,
    moveName: "FAULTLINE FIST EX", command: "↓ → + LP&HP", animation: anim(0),
    hitboxes: [box(29, -205, 184, 158, 0, 9), box(54, -188, 210, 145, 10, 19)],
  }),
  enhancedBackSpecial: move("deathblow-ex-aftershock-grab", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.THROW,
    startupFrames: 5, activeFrames: 6, recoveryFrames: 24, range: 113, damage: 25, push: 285, meter: 12,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 5,
    moveName: "AFTERSHOCK GRAB EX", command: "↓ ← + LP&HP", animation: anim(1),
    hitboxes: [box(15, -186, 108, 156, 0, 5)],
  }),
  enhancedLauncher: move("deathblow-ex-quarry-breaker", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 13, recoveryFrames: 21, range: 151, damage: 9, push: 78, meter: 10,
    hitstunFrames: 27, blockstunFrames: 17, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    launchVelocityY: -610, juggleStarter: true, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 10,
    moveName: "QUARRY BREAKER EX", command: "→ ↓ → + LP&HP", animation: anim(2),
    hitboxes: [box(17, -221, 116, 178, 0, 5), box(33, -265, 135, 219, 6, 12)],
  }),
  super: move("deathblow-epicenter-execution", "special", {
    cancelProfileId: "grit-super", level: ATTACK_LEVELS.MID,
    startupFrames: 9, activeFrames: 36, recoveryFrames: 27, range: 251, damage: 10, push: 62, meter: 0,
    hitstunFrames: 29, blockstunFrames: 23, chipDamage: 3, knockdown: true, knockdownOnFinal: true,
    juggleLift: -230, maxHits: 4, rehitFrames: 8, gritCost: GRIT_RULES.superCost,
    superMove: true, armorFrames: 9, moveName: "EPICENTER EXECUTION", command: "FULL GRIT + ↓ → ↓ → PUNCH", animation: anim(3),
    hitboxes: [box(20, -218, 181, 180, 0, 8), box(43, -205, 207, 166, 9, 17), box(21, -235, 222, 197, 18, 26), box(46, -214, 239, 179, 27, 35)],
  }),
};

const jezMoves = {
  standLight: move("jez-neon-jab", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 4, activeFrames: 5, recoveryFrames: 7, range: 105, damage: 5, push: 130, meter: 9,
    hitstunFrames: 21, blockstunFrames: 8, chipDamage: 0,
    hitboxes: [box(25, -165, 91, 62, 0, 2), box(38, -158, 104, 60, 3, 4)],
  }),
  forwardLight: move("jez-letter-opener", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 6, recoveryFrames: 9, range: 148, damage: 7, push: 155, meter: 11,
    hitstunFrames: 22, blockstunFrames: 10, chipDamage: 0, advanceSpeed: 120,
    hitboxes: [box(29, -174, 132, 69, 0, 5)],
  }),
  crouchLight: move("jez-blue-line-low", "light", {
    cancelProfileId: "crouch-light", level: ATTACK_LEVELS.LOW,
    startupFrames: 4, activeFrames: 5, recoveryFrames: 8, range: 118, damage: 5, push: 126, meter: 9,
    hitstunFrames: 20, blockstunFrames: 8, chipDamage: 0,
    hitboxes: [box(24, -72, 101, 42, 0, 4)],
  }),
  standHeavy: move("jez-channel-letter-chop", "heavy", {
    cancelProfileId: "stand-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 9, activeFrames: 7, recoveryFrames: 13, range: 158, damage: 11, push: 235, meter: 15,
    hitstunFrames: 22, blockstunFrames: 12, chipDamage: 0,
    hitboxes: [box(35, -185, 120, 88, 0, 2), box(50, -174, 139, 87, 3, 6)],
  }),
  crouchHeavy: move("jez-vinyl-sweep", "heavy", {
    cancelProfileId: "crouch-heavy", level: ATTACK_LEVELS.LOW,
    startupFrames: 9, activeFrames: 7, recoveryFrames: 16, range: 172, damage: 10, push: 220, meter: 15,
    hitstunFrames: 21, blockstunFrames: 13, chipDamage: 0, knockdown: true,
    hitboxes: [box(34, -62, 121, 40, 0, 2), box(51, -55, 143, 35, 3, 6)],
  }),
  overhead: move("jez-marquee-axe", "heavy", {
    cancelProfileId: "overhead", level: ATTACK_LEVELS.OVERHEAD,
    startupFrames: 15, activeFrames: 6, recoveryFrames: 15, range: 164, damage: 13, push: 250, meter: 17,
    hitstunFrames: 23, blockstunFrames: 13, chipDamage: 0,
    hitboxes: [box(29, -221, 112, 103, 0, 1), box(49, -204, 136, 130, 2, 5)],
  }),
  driveHeavy: move("jez-window-letter-lunge", "heavy", {
    cancelProfileId: "drive-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 12, activeFrames: 8, recoveryFrames: 14, range: 205, damage: 13, push: 275, meter: 18,
    hitstunFrames: 23, blockstunFrames: 14, chipDamage: 0, advanceSpeed: 285,
    command: "← → + KICK", hitboxes: [box(37, -186, 161, 112, 0, 3), box(57, -173, 184, 107, 4, 7)],
  }),
  throw: move("jez-signpost-trip", "throw", {
    cancelProfileId: "throw", level: ATTACK_LEVELS.THROW,
    startupFrames: 4, activeFrames: 3, recoveryFrames: 20, range: 78, damage: 13, push: 195, meter: 13,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true, animation: anim(1),
    hitboxes: [box(22, -174, 69, 145, 0, 2)],
  }),
  special: move("jez-neon-edge", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 11, recoveryFrames: 13, range: 219, damage: 14, push: 245, meter: 21,
    hitstunFrames: 24, blockstunFrames: 16, chipDamage: 3,
    moveName: "NEON EDGE", command: "SPECIAL", animation: anim(0),
    hitboxes: [box(35, -191, 183, 128, 0, 5), box(54, -178, 207, 121, 6, 10)],
  }),
  commandSpecial: move("jez-signline-lance", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 12, activeFrames: 12, recoveryFrames: 16, range: 286, damage: 16, push: 315, meter: 24,
    hitstunFrames: 25, blockstunFrames: 18, chipDamage: 4, knockdown: true,
    moveName: "SIGNLINE LANCE", command: "↓ → + PUNCH", animation: anim(0),
    hitboxes: [box(41, -199, 224, 138, 0, 5), box(62, -188, 258, 128, 6, 11)],
  }),
  backSpecial: move("jez-vinyl-step", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 12, recoveryFrames: 12, range: 185, damage: 12, push: 165, meter: 18,
    hitstunFrames: 23, blockstunFrames: 15, chipDamage: 2, advanceSpeed: 610, ignorePushbox: true,
    moveName: "VINYL STEP", command: "↓ ← + PUNCH", animation: anim(1),
    hitboxes: [box(28, -184, 151, 128, 0, 5), box(52, -174, 184, 122, 6, 11)],
  }),
  launcher: move("jez-signpost-rising", "heavy", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 8, recoveryFrames: 19, range: 138, damage: 9, push: 70, meter: 16,
    hitstunFrames: 25, blockstunFrames: 13, chipDamage: 0, knockdown: true, launchVelocityY: -545,
    juggleStarter: true, reversalInvulnerableFrames: 6,
    moveName: "SIGNPOST RISING", command: "→ ↓ → + PUNCH", animation: anim(2),
    hitboxes: [box(22, -218, 108, 170, 0, 3), box(38, -252, 125, 204, 4, 7)],
  }),
  enhanced: move("jez-ex-neon-edge", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 17, recoveryFrames: 11, range: 244, damage: 8, push: 74, meter: 8,
    hitstunFrames: 23, blockstunFrames: 18, chipDamage: 3, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, moveName: "NEON EDGE EX", command: "LP&HP", animation: anim(0),
    hitboxes: [box(31, -197, 202, 135, 0, 7), box(55, -182, 230, 127, 8, 16)],
  }),
  enhancedCommandSpecial: move("jez-ex-signline-lance", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 9, activeFrames: 19, recoveryFrames: 13, range: 318, damage: 9, push: 92, meter: 9,
    hitstunFrames: 25, blockstunFrames: 20, chipDamage: 4, knockdown: true, knockdownOnFinal: true,
    maxHits: 2, rehitFrames: 8, gritCost: GRIT_RULES.enhancedSpecialCost,
    moveName: "SIGNLINE LANCE EX", command: "↓ → + LP&HP", animation: anim(0),
    hitboxes: [box(36, -204, 249, 145, 0, 8), box(64, -190, 287, 135, 9, 18)],
  }),
  enhancedBackSpecial: move("jez-ex-vinyl-step", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    // BLOCK ECONOMY: recovery 10→15 (tuned 13→20), −3 on block instead of +4.
    startupFrames: 4, activeFrames: 16, recoveryFrames: 15, range: 212, damage: 8, push: 68, meter: 8,
    hitstunFrames: 23, blockstunFrames: 17, chipDamage: 3, maxHits: 2, rehitFrames: 7,
    advanceSpeed: 720, ignorePushbox: true, reversalInvulnerableFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, moveName: "VINYL STEP EX", command: "↓ ← + LP&HP", animation: anim(1),
    hitboxes: [box(26, -192, 177, 137, 0, 7), box(54, -178, 214, 128, 8, 15)],
  }),
  enhancedLauncher: move("jez-ex-signpost-rising", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 5, activeFrames: 14, recoveryFrames: 17, range: 158, damage: 7, push: 62, meter: 8,
    hitstunFrames: 26, blockstunFrames: 16, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    launchVelocityY: -585, juggleStarter: true, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 12,
    moveName: "SIGNPOST RISING EX", command: "→ ↓ → + LP&HP", animation: anim(2),
    hitboxes: [box(18, -224, 121, 181, 0, 6), box(37, -268, 141, 223, 7, 13)],
  }),
  super: move("jez-seven-palm-neon-guillotine", "special", {
    cancelProfileId: "grit-super", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 43, recoveryFrames: 21, range: 278, damage: 5.5, push: 44, meter: 0,
    hitstunFrames: 25, blockstunFrames: 20, chipDamage: 1.5, knockdown: true, knockdownOnFinal: true,
    juggleLift: -195, maxHits: 7, rehitFrames: 6, gritCost: GRIT_RULES.superCost,
    juggleLimit: 8,
    superMove: true, reversalInvulnerableFrames: 8,
    moveName: "SEVEN-PALM NEON GUILLOTINE", command: "FULL GRIT + ↓ → ↓ → PUNCH", animation: anim(3),
    hitboxes: [box(25, -212, 192, 169, 0, 10), box(44, -202, 226, 159, 11, 21), box(29, -231, 244, 191, 22, 32), box(52, -213, 272, 177, 33, 42)],
  }),
};

const alanMoves = {
  standLight: move("alan-union-jab", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 5, recoveryFrames: 9, range: 105, damage: 8, push: 172, meter: 11,
    hitstunFrames: 22, blockstunFrames: 10, chipDamage: 0,
    hitboxes: [box(22, -171, 91, 66, 0, 4)],
  }),
  forwardLight: move("alan-shoulder-check", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 5, recoveryFrames: 11, range: 134, damage: 10, push: 218, meter: 12,
    hitstunFrames: 23, blockstunFrames: 11, chipDamage: 0, advanceSpeed: 168,
    hitboxes: [box(20, -181, 119, 105, 0, 4)],
  }),
  crouchLight: move("alan-pipefitters-tap", "light", {
    cancelProfileId: "crouch-light", level: ATTACK_LEVELS.LOW,
    startupFrames: 7, activeFrames: 5, recoveryFrames: 11, range: 115, damage: 7, push: 153, meter: 10,
    hitstunFrames: 21, blockstunFrames: 10, chipDamage: 0,
    hitboxes: [box(24, -74, 100, 45, 0, 4)],
  }),
  standHeavy: move("alan-heavy-hand", "heavy", {
    cancelProfileId: "stand-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 14, activeFrames: 7, recoveryFrames: 17, range: 154, damage: 17, push: 325, meter: 18,
    hitstunFrames: 25, blockstunFrames: 15, chipDamage: 0, armorFrames: 4,
    hitboxes: [box(31, -191, 119, 101, 0, 2), box(48, -181, 140, 96, 3, 6)],
  }),
  crouchHeavy: move("alan-loading-dock-sweep", "heavy", {
    cancelProfileId: "crouch-heavy", level: ATTACK_LEVELS.LOW,
    startupFrames: 15, activeFrames: 7, recoveryFrames: 22, range: 174, damage: 15, push: 290, meter: 17,
    hitstunFrames: 24, blockstunFrames: 15, chipDamage: 0, knockdown: true,
    hitboxes: [box(29, -67, 121, 43, 0, 2), box(51, -60, 145, 39, 3, 6)],
  }),
  overhead: move("alan-foreman-hammer", "heavy", {
    cancelProfileId: "overhead", level: ATTACK_LEVELS.OVERHEAD,
    startupFrames: 21, activeFrames: 7, recoveryFrames: 20, range: 157, damage: 19, push: 335, meter: 20,
    hitstunFrames: 26, blockstunFrames: 17, chipDamage: 0, knockdown: true,
    hitboxes: [box(20, -231, 111, 112, 0, 2), box(42, -211, 135, 142, 3, 6)],
  }),
  driveHeavy: move("alan-broad-street-boot", "heavy", {
    cancelProfileId: "drive-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 16, activeFrames: 9, recoveryFrames: 19, range: 194, damage: 18, push: 370, meter: 20,
    hitstunFrames: 26, blockstunFrames: 17, chipDamage: 0, advanceSpeed: 238,
    command: "← → + KICK", hitboxes: [box(30, -188, 154, 124, 0, 4), box(50, -176, 178, 116, 5, 8)],
  }),
  throw: move("alan-dockyard-clinch", "throw", {
    cancelProfileId: "throw", level: ATTACK_LEVELS.THROW,
    startupFrames: 5, activeFrames: 3, recoveryFrames: 25, range: 86, damage: 18, push: 225, meter: 16,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true, animation: anim(1),
    hitboxes: [box(18, -183, 82, 154, 0, 2)],
  }),
  special: move("alan-heavy-hand-special", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 12, activeFrames: 10, recoveryFrames: 18, range: 177, damage: 18, push: 345, meter: 23,
    hitstunFrames: 27, blockstunFrames: 18, chipDamage: 3, armorFrames: 8,
    moveName: "HEAVY HAND", command: "SPECIAL", animation: anim(0),
    hitboxes: [box(29, -198, 151, 144, 0, 4), box(48, -184, 174, 132, 5, 9)],
  }),
  commandSpecial: move("alan-south-street-slam", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 15, activeFrames: 12, recoveryFrames: 19, range: 218, damage: 22, push: 405, meter: 26,
    hitstunFrames: 30, blockstunFrames: 20, chipDamage: 4, knockdown: true, armorFrames: 10, advanceSpeed: 295,
    moveName: "SOUTH STREET SLAM", command: "↓ → + PUNCH", animation: anim(0),
    hitboxes: [box(27, -207, 175, 158, 0, 5), box(51, -191, 202, 145, 6, 11)],
  }),
  backSpecial: move("alan-southpaw-counter", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 3, activeFrames: 14, recoveryFrames: 18, range: 0, damage: 0, push: 0, meter: 0,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0,
    counterWindowFrom: 3, counterWindowTo: 16, counterDamage: 23, counterHitstunFrames: 34,
    counterPush: 430, counterLaunchVelocityY: -330,
    moveName: "SOUTHPAW COUNTER", command: "↓ ← + PUNCH · counters strikes", animation: anim(1), hitboxes: [],
  }),
  launcher: move("alan-broad-street-uppercut", "heavy", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 9, recoveryFrames: 25, range: 139, damage: 14, push: 82, meter: 18,
    hitstunFrames: 28, blockstunFrames: 16, chipDamage: 0, knockdown: true, launchVelocityY: -590,
    juggleStarter: true, reversalInvulnerableFrames: 7,
    moveName: "BROAD STREET UPPERCUT", command: "→ ↓ → + PUNCH", animation: anim(2),
    hitboxes: [box(18, -225, 111, 180, 0, 3), box(33, -270, 129, 225, 4, 8)],
  }),
  enhanced: move("alan-ex-heavy-hand", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 17, recoveryFrames: 15, range: 201, damage: 11, push: 112, meter: 10,
    hitstunFrames: 26, blockstunFrames: 20, chipDamage: 3, maxHits: 2, rehitFrames: 8,
    gritCost: GRIT_RULES.enhancedSpecialCost, armorFrames: 13,
    moveName: "HEAVY HAND EX", command: "LP&HP", animation: anim(0),
    hitboxes: [box(27, -204, 175, 152, 0, 7), box(50, -189, 199, 140, 8, 16)],
  }),
  enhancedCommandSpecial: move("alan-ex-south-street-slam", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 20, recoveryFrames: 16, range: 246, damage: 13, push: 132, meter: 11,
    hitstunFrames: 28, blockstunFrames: 22, chipDamage: 4, knockdown: true, knockdownOnFinal: true,
    maxHits: 2, rehitFrames: 9, gritCost: GRIT_RULES.enhancedSpecialCost, armorFrames: 16, advanceSpeed: 345,
    moveName: "SOUTH STREET SLAM EX", command: "↓ → + LP&HP", animation: anim(0),
    hitboxes: [box(27, -211, 192, 164, 0, 9), box(53, -195, 220, 151, 10, 19)],
  }),
  enhancedBackSpecial: move("alan-ex-southpaw-counter", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 1, activeFrames: 20, recoveryFrames: 14, range: 0, damage: 0, push: 0, meter: 0,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, gritCost: GRIT_RULES.enhancedSpecialCost,
    counterWindowFrom: 1, counterWindowTo: 20, counterDamage: 30, counterHitstunFrames: 39,
    counterPush: 485, counterLaunchVelocityY: -385, counterSuper: true,
    moveName: "SOUTHPAW COUNTER EX", command: "↓ ← + LP&HP · counters all strikes", animation: anim(1), hitboxes: [],
  }),
  enhancedLauncher: move("alan-ex-broad-street-uppercut", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 14, recoveryFrames: 21, range: 160, damage: 9, push: 74, meter: 9,
    hitstunFrames: 28, blockstunFrames: 18, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    launchVelocityY: -635, juggleStarter: true, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 12,
    moveName: "BROAD STREET UPPERCUT EX", command: "→ ↓ → + LP&HP", animation: anim(2),
    hitboxes: [box(16, -229, 124, 187, 0, 6), box(35, -281, 145, 238, 7, 13)],
  }),
  super: move("alan-south-street-six", "special", {
    cancelProfileId: "grit-super", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 42, recoveryFrames: 27, range: 248, damage: 7, push: 58, meter: 0,
    hitstunFrames: 29, blockstunFrames: 23, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    juggleLift: -215, maxHits: 6, rehitFrames: 7, gritCost: GRIT_RULES.superCost, juggleLimit: 7,
    superMove: true, armorFrames: 11,
    moveName: "SOUTH STREET SIX", command: "FULL GRIT + ↓ → ↓ → PUNCH", animation: anim(3),
    hitboxes: [box(21, -218, 183, 177, 0, 10), box(45, -207, 218, 166, 11, 21), box(24, -237, 234, 198, 22, 31), box(49, -218, 253, 181, 32, 41)],
  }),
};

const postMoves = {
  standLight: move("post-can-tap", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 5, activeFrames: 5, recoveryFrames: 8, range: 112, damage: 6, push: 142, meter: 10,
    hitstunFrames: 21, blockstunFrames: 9, chipDamage: 0,
    hitboxes: [box(25, -172, 98, 65, 0, 4)],
  }),
  forwardLight: move("post-taggers-poke", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 6, recoveryFrames: 10, range: 151, damage: 8, push: 172, meter: 11,
    hitstunFrames: 22, blockstunFrames: 10, chipDamage: 0, advanceSpeed: 115,
    hitboxes: [box(29, -178, 135, 74, 0, 5)],
  }),
  crouchLight: move("post-low-tag", "light", {
    cancelProfileId: "crouch-light", level: ATTACK_LEVELS.LOW,
    startupFrames: 5, activeFrames: 5, recoveryFrames: 9, range: 124, damage: 6, push: 135, meter: 10,
    hitstunFrames: 21, blockstunFrames: 9, chipDamage: 0,
    hitboxes: [box(25, -72, 108, 43, 0, 4)],
  }),
  standHeavy: move("post-roller-swing", "heavy", {
    cancelProfileId: "stand-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 11, activeFrames: 8, recoveryFrames: 14, range: 166, damage: 12, push: 255, meter: 16,
    hitstunFrames: 23, blockstunFrames: 13, chipDamage: 0,
    hitboxes: [box(33, -190, 129, 98, 0, 3), box(52, -178, 150, 94, 4, 7)],
  }),
  crouchHeavy: move("post-puddle-sweep", "heavy", {
    cancelProfileId: "crouch-heavy", level: ATTACK_LEVELS.LOW,
    startupFrames: 11, activeFrames: 7, recoveryFrames: 18, range: 184, damage: 11, push: 238, meter: 16,
    hitstunFrames: 22, blockstunFrames: 14, chipDamage: 0, knockdown: true,
    hitboxes: [box(32, -65, 132, 42, 0, 2), box(53, -58, 153, 37, 3, 6)],
  }),
  overhead: move("post-drip-drop", "heavy", {
    cancelProfileId: "overhead", level: ATTACK_LEVELS.OVERHEAD,
    startupFrames: 17, activeFrames: 7, recoveryFrames: 17, range: 173, damage: 14, push: 270, meter: 18,
    hitstunFrames: 24, blockstunFrames: 14, chipDamage: 0,
    hitboxes: [box(27, -225, 122, 111, 0, 2), box(48, -207, 146, 136, 3, 6)],
  }),
  driveHeavy: move("post-wall-run", "heavy", {
    cancelProfileId: "drive-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 13, activeFrames: 9, recoveryFrames: 15, range: 211, damage: 14, push: 292, meter: 18,
    hitstunFrames: 24, blockstunFrames: 15, chipDamage: 0, advanceSpeed: 315,
    command: "← → + KICK", hitboxes: [box(35, -191, 169, 121, 0, 4), box(58, -178, 192, 113, 5, 8)],
  }),
  throw: move("post-fresh-coat-toss", "throw", {
    cancelProfileId: "throw", level: ATTACK_LEVELS.THROW,
    startupFrames: 4, activeFrames: 3, recoveryFrames: 21, range: 79, damage: 14, push: 205, meter: 14,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true, animation: anim(1),
    hitboxes: [box(21, -178, 72, 148, 0, 2)],
  }),
  special: move("post-rattlecan-burst", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 9, activeFrames: 13, recoveryFrames: 14, range: 231, damage: 14, push: 238, meter: 21,
    hitstunFrames: 24, blockstunFrames: 17, chipDamage: 3,
    moveName: "RATTLECAN BURST", command: "SPECIAL", animation: anim(0),
    hitboxes: [box(37, -191, 184, 129, 0, 6), box(55, -181, 218, 120, 7, 12)],
  }),
  commandSpecial: move("post-paint-the-town", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 13, activeFrames: 15, recoveryFrames: 18, range: 333, damage: 17, push: 322, meter: 24,
    hitstunFrames: 26, blockstunFrames: 19, chipDamage: 4,
    moveName: "PAINT THE TOWN", command: "↓ → + PUNCH", animation: anim(0),
    hitboxes: [box(44, -200, 248, 142, 0, 7), box(67, -190, 309, 130, 8, 14)],
  }),
  backSpecial: move("post-wet-paint", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.LOW,
    startupFrames: 5, activeFrames: 7, recoveryFrames: 18, range: 0, damage: 0, push: 0, meter: 0,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0,
    trap: { deployFrame: 8, offsets: [112], armFrames: 20, lifetimeFrames: 360, radius: 58, damage: 8, chipDamage: 1, hitstunFrames: 20, blockstunFrames: 13, push: 220, knockdown: false, maxOwned: 2, color: "#ff3bbf" },
    moveName: "WET PAINT", command: "↓ ← + PUNCH · persistent low trap", animation: anim(1), hitboxes: [],
  }),
  launcher: move("post-tag-updraft", "heavy", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 9, recoveryFrames: 21, range: 151, damage: 10, push: 68, meter: 17,
    hitstunFrames: 26, blockstunFrames: 15, chipDamage: 0, knockdown: true, launchVelocityY: -565,
    juggleStarter: true, reversalInvulnerableFrames: 6,
    moveName: "TAG UPDRAFT", command: "→ ↓ → + PUNCH", animation: anim(2),
    hitboxes: [box(20, -222, 118, 177, 0, 3), box(38, -263, 137, 218, 4, 8)],
  }),
  enhanced: move("post-ex-rattlecan-burst", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 20, recoveryFrames: 12, range: 264, damage: 8, push: 80, meter: 8,
    hitstunFrames: 24, blockstunFrames: 19, chipDamage: 3, maxHits: 2, rehitFrames: 8,
    gritCost: GRIT_RULES.enhancedSpecialCost,
    moveName: "RATTLECAN BURST EX", command: "LP&HP", animation: anim(0),
    hitboxes: [box(33, -198, 210, 137, 0, 9), box(58, -185, 251, 128, 10, 19)],
  }),
  enhancedCommandSpecial: move("post-ex-paint-the-town", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 9, activeFrames: 23, recoveryFrames: 14, range: 374, damage: 9, push: 94, meter: 9,
    hitstunFrames: 26, blockstunFrames: 21, chipDamage: 4, knockdown: true, knockdownOnFinal: true,
    maxHits: 2, rehitFrames: 10, gritCost: GRIT_RULES.enhancedSpecialCost,
    moveName: "PAINT THE TOWN EX", command: "↓ → + LP&HP", animation: anim(0),
    hitboxes: [box(38, -205, 281, 149, 0, 10), box(68, -191, 347, 137, 11, 22)],
  }),
  enhancedBackSpecial: move("post-ex-wet-paint", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.LOW,
    startupFrames: 3, activeFrames: 9, recoveryFrames: 15, range: 0, damage: 0, push: 0, meter: 0,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, gritCost: GRIT_RULES.enhancedSpecialCost,
    reversalInvulnerableFrames: 5,
    trap: { deployFrame: 6, offsets: [88, 205], armFrames: 15, armFramesByIndex: [15, 27], lifetimeFrames: 360, radius: 66, damage: 9, chipDamage: 2, hitstunFrames: 22, blockstunFrames: 15, push: 245, knockdown: false, maxOwned: 2, color: "#ff3bbf" },
    moveName: "WET PAINT EX", command: "↓ ← + LP&HP · two traps", animation: anim(1), hitboxes: [],
  }),
  enhancedLauncher: move("post-ex-tag-updraft", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 5, activeFrames: 15, recoveryFrames: 18, range: 174, damage: 7, push: 61, meter: 8,
    hitstunFrames: 27, blockstunFrames: 17, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    launchVelocityY: -605, juggleStarter: true, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 11,
    moveName: "TAG UPDRAFT EX", command: "→ ↓ → + LP&HP", animation: anim(2),
    hitboxes: [box(17, -226, 130, 185, 0, 6), box(38, -276, 151, 234, 7, 14)],
  }),
  super: move("post-full-coverage", "special", {
    cancelProfileId: "grit-super", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 45, recoveryFrames: 22, range: 365, damage: 6, push: 47, meter: 0,
    hitstunFrames: 26, blockstunFrames: 21, chipDamage: 1.5, knockdown: true, knockdownOnFinal: true,
    juggleLift: -188, maxHits: 7, rehitFrames: 6, gritCost: GRIT_RULES.superCost, juggleLimit: 8,
    superMove: true, reversalInvulnerableFrames: 8,
    moveName: "FULL COVERAGE", command: "FULL GRIT + ↓ → ↓ → PUNCH", animation: anim(3),
    hitboxes: [box(27, -211, 215, 168, 0, 10), box(49, -204, 268, 160, 11, 21), box(32, -230, 322, 190, 22, 33), box(58, -215, 361, 176, 34, 44)],
  }),
};

const bennyCancelRoutes = Object.freeze(["special", "commandSpecial", "enhanced", "super"]);

const bennyMoves = {
  standLight: move("benny-static-jab", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 3, activeFrames: 5, recoveryFrames: 6, range: 106, damage: 5, push: 123, meter: 9,
    hitstunFrames: 20, blockstunFrames: 8, chipDamage: 0,
    hitboxes: [box(25, -169, 91, 63, 0, 4)],
  }),
  forwardLight: move("benny-hot-lead", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 5, activeFrames: 6, recoveryFrames: 7, range: 142, damage: 6, push: 145, meter: 10,
    hitstunFrames: 21, blockstunFrames: 9, chipDamage: 0, advanceSpeed: 155,
    hitboxes: [box(28, -177, 127, 72, 0, 5)],
  }),
  crouchLight: move("benny-ground-wire", "light", {
    cancelProfileId: "crouch-light", level: ATTACK_LEVELS.LOW,
    startupFrames: 3, activeFrames: 5, recoveryFrames: 7, range: 119, damage: 5, push: 120, meter: 9,
    hitstunFrames: 20, blockstunFrames: 8, chipDamage: 0,
    hitboxes: [box(24, -70, 103, 41, 0, 4)],
  }),
  standHeavy: move("benny-breaker-cross", "heavy", {
    cancelProfileId: "stand-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 7, recoveryFrames: 11, range: 151, damage: 11, push: 225, meter: 15,
    hitstunFrames: 22, blockstunFrames: 12, chipDamage: 0,
    hitboxes: [box(34, -185, 116, 88, 0, 2), box(49, -175, 135, 85, 3, 6)],
  }),
  crouchHeavy: move("benny-live-low", "heavy", {
    cancelProfileId: "crouch-heavy", level: ATTACK_LEVELS.LOW,
    startupFrames: 8, activeFrames: 7, recoveryFrames: 14, range: 164, damage: 10, push: 210, meter: 15,
    hitstunFrames: 22, blockstunFrames: 12, chipDamage: 0, knockdown: true,
    hitboxes: [box(31, -62, 118, 39, 0, 2), box(49, -55, 137, 34, 3, 6)],
  }),
  overhead: move("benny-power-surge", "heavy", {
    cancelProfileId: "overhead", level: ATTACK_LEVELS.OVERHEAD,
    startupFrames: 14, activeFrames: 6, recoveryFrames: 13, range: 158, damage: 12, push: 235, meter: 16,
    hitstunFrames: 23, blockstunFrames: 13, chipDamage: 0,
    hitboxes: [box(26, -219, 109, 101, 0, 1), box(46, -202, 131, 127, 2, 5)],
  }),
  driveHeavy: move("benny-current-carry", "heavy", {
    cancelProfileId: "drive-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 8, recoveryFrames: 12, range: 191, damage: 12, push: 246, meter: 17,
    hitstunFrames: 23, blockstunFrames: 13, chipDamage: 0, advanceSpeed: 350,
    command: "← → + KICK", hitboxes: [box(34, -187, 150, 111, 0, 3), box(53, -175, 172, 105, 4, 7)],
  }),
  throw: move("benny-ground-fault", "throw", {
    cancelProfileId: "throw", level: ATTACK_LEVELS.THROW,
    startupFrames: 4, activeFrames: 3, recoveryFrames: 18, range: 77, damage: 13, push: 190, meter: 14,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true, animation: anim(1),
    hitboxes: [box(21, -175, 70, 145, 0, 2)],
  }),
  special: move("benny-static-snap", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 15, recoveryFrames: 10, range: 183, damage: 7, push: 72, meter: 9,
    hitstunFrames: 22, blockstunFrames: 16, chipDamage: 2, maxHits: 2, rehitFrames: 7,
    rushCancel: true, cancelRoutes: bennyCancelRoutes,
    moveName: "STATIC SNAP", command: "SPECIAL", animation: anim(0),
    hitboxes: [box(28, -193, 151, 135, 0, 6), box(49, -181, 176, 126, 7, 14)],
  }),
  commandSpecial: move("benny-blitz", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 22, recoveryFrames: 12, range: 229, damage: 6, push: 64, meter: 8,
    hitstunFrames: 23, blockstunFrames: 17, chipDamage: 2, maxHits: 3, rehitFrames: 7,
    advanceSpeed: 650, rushCancel: true, cancelRoutes: bennyCancelRoutes,
    moveName: "BENNY BLITZ", command: "↓ → + PUNCH", animation: anim(0),
    hitboxes: [box(24, -199, 174, 145, 0, 6), box(52, -186, 211, 135, 7, 14), box(65, -178, 224, 128, 15, 21)],
  }),
  backSpecial: move("benny-live-wire", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    // BLOCK ECONOMY: recovery 9→14 (tuned 12→18), −3 on block instead of +3.
    // Benny already owns the only plus-on-block jabs in the game; a free
    // cross-through does not get to be plus as well.
    startupFrames: 4, activeFrames: 16, recoveryFrames: 14, range: 194, damage: 7, push: 58, meter: 8,
    hitstunFrames: 22, blockstunFrames: 15, chipDamage: 2, maxHits: 2, rehitFrames: 7,
    advanceSpeed: 790, ignorePushbox: true, reversalInvulnerableFrames: 5,
    rushCancel: true, cancelRoutes: bennyCancelRoutes,
    moveName: "LIVE WIRE", command: "↓ ← + PUNCH · cross-through", animation: anim(1),
    hitboxes: [box(22, -190, 158, 133, 0, 7), box(51, -178, 192, 124, 8, 15)],
  }),
  launcher: move("benny-circuit-riser", "heavy", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 9, recoveryFrames: 18, range: 137, damage: 9, push: 64, meter: 16,
    hitstunFrames: 25, blockstunFrames: 13, chipDamage: 0, knockdown: true, launchVelocityY: -555,
    juggleStarter: true, reversalInvulnerableFrames: 7,
    moveName: "CIRCUIT RISER", command: "→ ↓ → + PUNCH", animation: anim(2),
    hitboxes: [box(19, -217, 107, 169, 0, 3), box(37, -254, 124, 207, 4, 8)],
  }),
  enhanced: move("benny-ex-static-snap", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 4, activeFrames: 22, recoveryFrames: 8, range: 207, damage: 5.5, push: 52, meter: 6,
    hitstunFrames: 23, blockstunFrames: 18, chipDamage: 2, maxHits: 3, rehitFrames: 6,
    gritCost: GRIT_RULES.enhancedSpecialCost, rushCancel: true, cancelRoutes: bennyCancelRoutes,
    moveName: "STATIC SNAP EX", command: "LP&HP", animation: anim(0),
    hitboxes: [box(25, -199, 172, 142, 0, 10), box(51, -184, 201, 132, 11, 21)],
  }),
  enhancedCommandSpecial: move("benny-ex-blitz", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 5, activeFrames: 29, recoveryFrames: 9, range: 257, damage: 5, push: 48, meter: 6,
    hitstunFrames: 24, blockstunFrames: 19, chipDamage: 2, maxHits: 4, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, advanceSpeed: 735,
    rushCancel: true, cancelRoutes: bennyCancelRoutes,
    moveName: "BENNY BLITZ EX", command: "↓ → + LP&HP", animation: anim(0),
    hitboxes: [box(23, -204, 191, 150, 0, 8), box(53, -190, 229, 141, 9, 18), box(70, -181, 248, 132, 19, 28)],
  }),
  enhancedBackSpecial: move("benny-ex-live-wire", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    // BLOCK ECONOMY: recovery 7→18 (tuned 9→24), −6 on block instead of +9
    // (real, third hit at f14: about −15). The voltage cancel still opens at
    // f22-29 on hit, so the confirm is intact; only the blocked read moved.
    startupFrames: 2, activeFrames: 22, recoveryFrames: 18, range: 224, damage: 5.5, push: 47, meter: 6,
    hitstunFrames: 23, blockstunFrames: 18, chipDamage: 2, maxHits: 3, rehitFrames: 6,
    gritCost: GRIT_RULES.enhancedSpecialCost, advanceSpeed: 885, ignorePushbox: true,
    reversalInvulnerableFrames: 8, rushCancel: true, cancelRoutes: bennyCancelRoutes,
    moveName: "LIVE WIRE EX", command: "↓ ← + LP&HP · cross-through", animation: anim(1),
    hitboxes: [box(19, -198, 183, 143, 0, 10), box(54, -183, 221, 133, 11, 21)],
  }),
  enhancedLauncher: move("benny-ex-circuit-riser", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 4, activeFrames: 14, recoveryFrames: 15, range: 158, damage: 6.5, push: 57, meter: 7,
    hitstunFrames: 26, blockstunFrames: 16, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    launchVelocityY: -595, juggleStarter: true, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 11,
    moveName: "CIRCUIT RISER EX", command: "→ ↓ → + LP&HP", animation: anim(2),
    hitboxes: [box(16, -222, 120, 179, 0, 6), box(37, -268, 141, 224, 7, 13)],
  }),
  super: move("benny-circuit-breaker-super", "special", {
    cancelProfileId: "grit-super", level: ATTACK_LEVELS.MID,
    startupFrames: 5, activeFrames: 48, recoveryFrames: 19, range: 281, damage: 4.75, push: 39, meter: 0,
    hitstunFrames: 25, blockstunFrames: 20, chipDamage: 1.25, knockdown: true, knockdownOnFinal: true,
    juggleLift: -180, maxHits: 8, rehitFrames: 6, gritCost: GRIT_RULES.superCost, juggleLimit: 9,
    superMove: true, reversalInvulnerableFrames: 9,
    moveName: "CIRCUIT BREAKER", command: "FULL GRIT + ↓ → ↓ → PUNCH", animation: anim(3),
    hitboxes: [box(23, -210, 196, 167, 0, 11), box(45, -201, 231, 157, 12, 23), box(29, -228, 252, 187, 24, 35), box(53, -211, 279, 172, 36, 47)],
  }),
};

const donaldMoves = {
  standLight: move("donald-caddy-tap", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 5, recoveryFrames: 10, range: 135, damage: 7, push: 158, meter: 10,
    hitstunFrames: 21, blockstunFrames: 10, chipDamage: 0,
    hitboxes: [box(28, -174, 118, 68, 0, 4)],
  }),
  forwardLight: move("donald-long-iron", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 6, recoveryFrames: 11, range: 182, damage: 8, push: 184, meter: 11,
    hitstunFrames: 22, blockstunFrames: 11, chipDamage: 0,
    hitboxes: [box(34, -177, 164, 73, 0, 5)],
  }),
  crouchLight: move("donald-putter-poke", "light", {
    cancelProfileId: "crouch-light", level: ATTACK_LEVELS.LOW,
    startupFrames: 6, activeFrames: 6, recoveryFrames: 10, range: 151, damage: 6, push: 145, meter: 10,
    hitstunFrames: 21, blockstunFrames: 10, chipDamage: 0,
    hitboxes: [box(28, -70, 134, 43, 0, 5)],
  }),
  standHeavy: move("donald-driver-swing", "heavy", {
    cancelProfileId: "stand-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 14, activeFrames: 9, recoveryFrames: 18, range: 225, damage: 15, push: 315, meter: 18,
    hitstunFrames: 25, blockstunFrames: 16, chipDamage: 0,
    hitboxes: [box(36, -195, 172, 105, 0, 3), box(57, -184, 205, 99, 4, 8)],
  }),
  crouchHeavy: move("donald-sand-wedge", "heavy", {
    cancelProfileId: "crouch-heavy", level: ATTACK_LEVELS.LOW,
    startupFrames: 14, activeFrames: 8, recoveryFrames: 21, range: 206, damage: 13, push: 275, meter: 17,
    hitstunFrames: 23, blockstunFrames: 15, chipDamage: 0, knockdown: true,
    hitboxes: [box(33, -67, 153, 44, 0, 3), box(56, -59, 177, 38, 4, 7)],
  }),
  overhead: move("donald-clubhouse-chop", "heavy", {
    cancelProfileId: "overhead", level: ATTACK_LEVELS.OVERHEAD,
    startupFrames: 20, activeFrames: 7, recoveryFrames: 20, range: 204, damage: 17, push: 322, meter: 19,
    hitstunFrames: 25, blockstunFrames: 16, chipDamage: 0,
    hitboxes: [box(31, -237, 145, 119, 0, 2), box(54, -214, 177, 145, 3, 6)],
  }),
  driveHeavy: move("donald-cart-path-drive", "heavy", {
    cancelProfileId: "drive-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 16, activeFrames: 9, recoveryFrames: 18, range: 236, damage: 16, push: 345, meter: 19,
    hitstunFrames: 25, blockstunFrames: 16, chipDamage: 0, advanceSpeed: 225,
    command: "← → + KICK", hitboxes: [box(37, -194, 181, 122, 0, 4), box(61, -180, 211, 114, 5, 8)],
  }),
  throw: move("donald-clubhouse-ejection", "throw", {
    cancelProfileId: "throw", level: ATTACK_LEVELS.THROW,
    startupFrames: 5, activeFrames: 3, recoveryFrames: 23, range: 82, damage: 16, push: 235, meter: 15,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true, animation: anim(1),
    hitboxes: [box(19, -181, 78, 151, 0, 2)],
  }),
  special: move("donald-clubhouse-check", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 12, activeFrames: 11, recoveryFrames: 17, range: 251, damage: 17, push: 332, meter: 22,
    hitstunFrames: 26, blockstunFrames: 18, chipDamage: 3,
    moveName: "CLUBHOUSE CHECK", command: "SPECIAL", animation: anim(0),
    hitboxes: [box(35, -204, 191, 146, 0, 5), box(63, -188, 226, 134, 6, 10)],
  }),
  commandSpecial: move("donald-golden-shockwave", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 11, activeFrames: 5, recoveryFrames: 22, range: 0, damage: 0, push: 0, meter: 0,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0,
    projectile: { spawnFrames: [12], speed: 530, lifeFrames: 105, width: 58, height: 42, yOffsets: [-112], damage: 15, chipDamage: 3, hitstunFrames: 26, blockstunFrames: 18, push: 310, level: ATTACK_LEVELS.MID, color: "#ffd43b" },
    moveName: "GOLDEN SHOCKWAVE", command: "↓ → + PUNCH · projectile", animation: anim(0), hitboxes: [],
  }),
  backSpecial: move("donald-executive-retreat", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.LOW,
    startupFrames: 7, activeFrames: 7, recoveryFrames: 17, range: 0, damage: 0, push: 0, meter: 0,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, retreatSpeed: 470, reversalInvulnerableFrames: 4,
    projectile: { spawnFrames: [12], speed: 430, lifeFrames: 112, width: 46, height: 32, yOffsets: [-48], damage: 11, chipDamage: 2, hitstunFrames: 23, blockstunFrames: 16, push: 245, level: ATTACK_LEVELS.LOW, color: "#ffbd28" },
    moveName: "EXECUTIVE RETREAT", command: "↓ ← + PUNCH · backstep low shot", animation: anim(1), hitboxes: [],
  }),
  launcher: move("donald-eagle-uppercut", "heavy", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 9, recoveryFrames: 24, range: 171, damage: 12, push: 75, meter: 17,
    hitstunFrames: 27, blockstunFrames: 15, chipDamage: 0, knockdown: true, launchVelocityY: -575,
    juggleStarter: true, reversalInvulnerableFrames: 6,
    moveName: "EAGLE UPPERCUT", command: "→ ↓ → + PUNCH", animation: anim(2),
    hitboxes: [box(23, -226, 127, 181, 0, 3), box(42, -269, 151, 224, 4, 8)],
  }),
  enhanced: move("donald-ex-clubhouse-check", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 19, recoveryFrames: 14, range: 281, damage: 10, push: 92, meter: 9,
    hitstunFrames: 26, blockstunFrames: 20, chipDamage: 3, maxHits: 2, rehitFrames: 9,
    gritCost: GRIT_RULES.enhancedSpecialCost,
    moveName: "CLUBHOUSE CHECK EX", command: "LP&HP", animation: anim(0),
    hitboxes: [box(31, -210, 219, 153, 0, 8), box(64, -193, 257, 141, 9, 18)],
  }),
  enhancedCommandSpecial: move("donald-ex-golden-shockwave", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 10, recoveryFrames: 18, range: 0, damage: 0, push: 0, meter: 0,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, gritCost: GRIT_RULES.enhancedSpecialCost,
    projectile: { spawnFrames: [9, 15], speed: 610, lifeFrames: 112, width: 62, height: 45, yOffsets: [-106, -151], damage: 10, chipDamage: 3, hitstunFrames: 25, blockstunFrames: 20, push: 105, level: ATTACK_LEVELS.MID, color: "#ffe45f" },
    moveName: "GOLDEN SHOCKWAVE EX", command: "↓ → + LP&HP · two projectiles", animation: anim(0), hitboxes: [],
  }),
  enhancedBackSpecial: move("donald-ex-executive-retreat", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.LOW,
    startupFrames: 4, activeFrames: 10, recoveryFrames: 14, range: 0, damage: 0, push: 0, meter: 0,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, gritCost: GRIT_RULES.enhancedSpecialCost,
    retreatSpeed: 590, reversalInvulnerableFrames: 8,
    projectile: { spawnFrames: [8, 13], speed: 490, lifeFrames: 120, width: 51, height: 36, yOffsets: [-47, -82], damage: 8, chipDamage: 2, hitstunFrames: 24, blockstunFrames: 18, push: 96, level: ATTACK_LEVELS.LOW, color: "#ffe45f" },
    moveName: "EXECUTIVE RETREAT EX", command: "↓ ← + LP&HP · two low shots", animation: anim(1), hitboxes: [],
  }),
  enhancedLauncher: move("donald-ex-eagle-uppercut", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 14, recoveryFrames: 20, range: 194, damage: 8, push: 66, meter: 8,
    hitstunFrames: 27, blockstunFrames: 17, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    launchVelocityY: -620, juggleStarter: true, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 11,
    moveName: "EAGLE UPPERCUT EX", command: "→ ↓ → + LP&HP", animation: anim(2),
    hitboxes: [box(19, -232, 141, 190, 0, 6), box(43, -282, 166, 239, 7, 13)],
  }),
  super: move("donald-golden-back-nine", "special", {
    cancelProfileId: "grit-super", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 54, recoveryFrames: 24, range: 351, damage: 4.25, push: 34, meter: 0,
    hitstunFrames: 26, blockstunFrames: 21, chipDamage: 1, knockdown: true, knockdownOnFinal: true,
    juggleLift: -174, maxHits: 9, rehitFrames: 6, gritCost: GRIT_RULES.superCost, juggleLimit: 10,
    superMove: true, reversalInvulnerableFrames: 8,
    moveName: "GOLDEN BACK NINE", command: "FULL GRIT + ↓ → ↓ → PUNCH", animation: anim(3),
    hitboxes: [box(31, -218, 226, 177, 0, 12), box(57, -207, 278, 165, 13, 26), box(36, -235, 323, 194, 27, 40), box(64, -216, 354, 178, 41, 53)],
  }),
};

const cyraxxMoves = {
  standLight: move("cyraxx-static-check", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 5, activeFrames: 5, recoveryFrames: 8, range: 112, damage: 6, push: 138, meter: 10,
    hitstunFrames: 21, blockstunFrames: 9, chipDamage: 0,
    hitboxes: [box(24, -174, 98, 70, 0, 4)],
  }),
  forwardLight: move("cyraxx-cable-poke", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 6, recoveryFrames: 10, range: 179, damage: 8, push: 174, meter: 11,
    hitstunFrames: 22, blockstunFrames: 10, chipDamage: 0,
    hitboxes: [box(31, -181, 158, 76, 0, 5)],
  }),
  crouchLight: move("cyraxx-low-signal", "light", {
    cancelProfileId: "crouch-light", level: ATTACK_LEVELS.LOW,
    startupFrames: 5, activeFrames: 6, recoveryFrames: 9, range: 139, damage: 6, push: 142, meter: 10,
    hitstunFrames: 21, blockstunFrames: 9, chipDamage: 0,
    hitboxes: [box(27, -68, 121, 42, 0, 5)],
  }),
  standHeavy: move("cyraxx-speaker-crash", "heavy", {
    cancelProfileId: "stand-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 12, activeFrames: 8, recoveryFrames: 15, range: 208, damage: 14, push: 292, meter: 17,
    hitstunFrames: 24, blockstunFrames: 15, chipDamage: 0,
    hitboxes: [box(34, -210, 161, 122, 0, 3), box(57, -194, 190, 111, 4, 7)],
  }),
  crouchHeavy: move("cyraxx-dead-channel-sweep", "heavy", {
    cancelProfileId: "crouch-heavy", level: ATTACK_LEVELS.LOW,
    startupFrames: 11, activeFrames: 7, recoveryFrames: 18, range: 192, damage: 12, push: 252, meter: 16,
    hitstunFrames: 23, blockstunFrames: 14, chipDamage: 0, knockdown: true,
    hitboxes: [box(31, -66, 143, 43, 0, 2), box(52, -58, 167, 37, 3, 6)],
  }),
  overhead: move("cyraxx-dropped-signal", "heavy", {
    cancelProfileId: "overhead", level: ATTACK_LEVELS.OVERHEAD,
    startupFrames: 18, activeFrames: 7, recoveryFrames: 17, range: 185, damage: 15, push: 286, meter: 18,
    hitstunFrames: 25, blockstunFrames: 15, chipDamage: 0,
    hitboxes: [box(29, -239, 132, 121, 0, 2), box(52, -216, 162, 146, 3, 6)],
  }),
  driveHeavy: move("cyraxx-signal-hijack", "heavy", {
    cancelProfileId: "drive-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 13, activeFrames: 9, recoveryFrames: 16, range: 224, damage: 15, push: 315, meter: 18,
    hitstunFrames: 25, blockstunFrames: 16, chipDamage: 0, advanceSpeed: 295,
    command: "← → + KICK", hitboxes: [box(34, -202, 172, 132, 0, 4), box(58, -187, 202, 121, 5, 8)],
  }),
  throw: move("cyraxx-mute-button", "throw", {
    cancelProfileId: "throw", level: ATTACK_LEVELS.THROW,
    startupFrames: 4, activeFrames: 3, recoveryFrames: 20, range: 78, damage: 14, push: 208, meter: 14,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true, animation: anim(1),
    hitboxes: [box(20, -179, 72, 149, 0, 2)],
  }),
  special: move("cyraxx-mic-check", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 16, recoveryFrames: 12, range: 215, damage: 8, push: 82, meter: 10,
    hitstunFrames: 23, blockstunFrames: 16, chipDamage: 2, maxHits: 2, rehitFrames: 8,
    moveName: "MIC CHECK", command: "SPECIAL", animation: anim(0),
    hitboxes: [box(30, -207, 171, 151, 0, 7), box(54, -193, 204, 139, 8, 15)],
  }),
  commandSpecial: move("cyraxx-feedback-loop", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 5, recoveryFrames: 17, range: 0, damage: 0, push: 0, meter: 0,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0,
    projectile: { spawnFrames: [9], speed: 0, lifeFrames: 88, armFrames: 22, xOffsets: [192], yOffsets: [-123], width: 124, height: 154, damage: 14, chipDamage: 2, hitstunFrames: 27, blockstunFrames: 18, push: 245, level: ATTACK_LEVELS.MID, color: "#b15cff", style: "feedback" },
    moveName: "FEEDBACK LOOP", command: "↓ → + PUNCH · delayed echo", animation: anim(0), hitboxes: [],
  }),
  backSpecial: move("cyraxx-buffer-skip", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    // BLOCK ECONOMY: recovery 10→15 (tuned 13→20), −4 on block instead of +3.
    startupFrames: 5, activeFrames: 18, recoveryFrames: 15, range: 201, damage: 7, push: 62, meter: 9,
    hitstunFrames: 23, blockstunFrames: 16, chipDamage: 2, maxHits: 2, rehitFrames: 8,
    advanceSpeed: 815, ignorePushbox: true, reversalInvulnerableFrames: 5,
    moveName: "BUFFER SKIP", command: "↓ ← + PUNCH · phase through", animation: anim(1),
    hitboxes: [box(23, -197, 166, 143, 0, 8), box(48, -183, 194, 132, 9, 17)],
  }),
  launcher: move("cyraxx-gain-spike", "heavy", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 10, recoveryFrames: 19, range: 159, damage: 10, push: 68, meter: 16,
    hitstunFrames: 26, blockstunFrames: 14, chipDamage: 0, knockdown: true, launchVelocityY: -585,
    juggleStarter: true, reversalInvulnerableFrames: 6,
    moveName: "GAIN SPIKE", command: "→ ↓ → + PUNCH", animation: anim(2),
    hitboxes: [box(21, -225, 119, 181, 0, 4), box(39, -273, 145, 229, 5, 9)],
  }),
  enhanced: move("cyraxx-ex-mic-check", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 5, activeFrames: 24, recoveryFrames: 9, range: 239, damage: 6, push: 58, meter: 7,
    hitstunFrames: 24, blockstunFrames: 18, chipDamage: 2, maxHits: 3, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost,
    moveName: "MIC CHECK EX", command: "LP&HP", animation: anim(0),
    hitboxes: [box(27, -213, 190, 158, 0, 11), box(54, -198, 228, 147, 12, 23)],
  }),
  enhancedCommandSpecial: move("cyraxx-ex-feedback-loop", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 12, recoveryFrames: 14, range: 0, damage: 0, push: 0, meter: 0,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, gritCost: GRIT_RULES.enhancedSpecialCost,
    projectile: { spawnFrames: [7, 13], speed: 0, lifeFrames: 104, armFramesByIndex: [15, 31], xOffsets: [139, 284], yOffsets: [-102, -151], width: 128, height: 148, damage: 10, chipDamage: 2, hitstunFrames: 25, blockstunFrames: 19, push: 116, level: ATTACK_LEVELS.MID, color: "#d276ff", style: "feedback" },
    moveName: "FEEDBACK LOOP EX", command: "↓ → + LP&HP · two echoes", animation: anim(0), hitboxes: [],
  }),
  enhancedBackSpecial: move("cyraxx-ex-buffer-skip", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    // BLOCK ECONOMY: recovery 7→18 (tuned 9→24), −6 on block instead of +9
    // (real, third hit at f17: about −16). The echo (spawn f13, arms f31)
    // still covers most of the new recovery — that is the read the EX buys,
    // not free plus frames.
    startupFrames: 3, activeFrames: 25, recoveryFrames: 18, range: 229, damage: 5.5, push: 46, meter: 7,
    hitstunFrames: 24, blockstunFrames: 18, chipDamage: 2, maxHits: 3, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, advanceSpeed: 930, ignorePushbox: true, reversalInvulnerableFrames: 9,
    projectile: { spawnFrames: [13], speed: 0, lifeFrames: 82, armFrames: 18, xOffsets: [-34], yOffsets: [-117], width: 108, height: 143, damage: 8, chipDamage: 2, hitstunFrames: 22, blockstunFrames: 17, push: 85, level: ATTACK_LEVELS.MID, color: "#8cff4d", style: "feedback" },
    moveName: "BUFFER SKIP EX", command: "↓ ← + LP&HP · phase + echo", animation: anim(1),
    hitboxes: [box(19, -205, 181, 152, 0, 11), box(52, -187, 222, 139, 12, 24)],
  }),
  enhancedLauncher: move("cyraxx-ex-gain-spike", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 5, activeFrames: 15, recoveryFrames: 16, range: 183, damage: 7, push: 58, meter: 8,
    hitstunFrames: 27, blockstunFrames: 17, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    launchVelocityY: -625, juggleStarter: true, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 10,
    moveName: "GAIN SPIKE EX", command: "→ ↓ → + LP&HP", animation: anim(2),
    hitboxes: [box(18, -232, 134, 192, 0, 7), box(43, -288, 161, 247, 8, 14)],
  }),
  super: move("cyraxx-feedback-meltdown", "special", {
    cancelProfileId: "grit-super", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 49, recoveryFrames: 20, range: 329, damage: 4.6, push: 37, meter: 0,
    hitstunFrames: 26, blockstunFrames: 20, chipDamage: 1.25, knockdown: true, knockdownOnFinal: true,
    juggleLift: -182, maxHits: 7, rehitFrames: 7, gritCost: GRIT_RULES.superCost, juggleLimit: 8,
    superMove: true, reversalInvulnerableFrames: 9,
    moveName: "FEEDBACK MELTDOWN", command: "FULL GRIT + ↓ → ↓ → PUNCH", animation: anim(3),
    hitboxes: [box(27, -221, 213, 182, 0, 11), box(54, -209, 261, 169, 12, 24), box(34, -241, 302, 201, 25, 36), box(59, -223, 334, 185, 37, 48)],
  }),
};

const aliFlowRoutes = Object.freeze(["light", "heavy", "special", "commandSpecial", "enhanced", "super"]);

const aliMoves = {
  standLight: move("ali-mic-one", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 4, activeFrames: 5, recoveryFrames: 7, range: 108, damage: 5.5, push: 128, meter: 9,
    hitstunFrames: 20, blockstunFrames: 8, chipDamage: 0,
    hitboxes: [box(23, -171, 94, 67, 0, 4)],
  }),
  forwardLight: move("ali-mic-two", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 6, recoveryFrames: 8, range: 151, damage: 7, push: 157, meter: 10,
    hitstunFrames: 22, blockstunFrames: 9, chipDamage: 0, advanceSpeed: 145,
    hitboxes: [box(29, -178, 132, 76, 0, 5)],
  }),
  crouchLight: move("ali-low-flow", "light", {
    cancelProfileId: "crouch-light", level: ATTACK_LEVELS.LOW,
    startupFrames: 4, activeFrames: 5, recoveryFrames: 8, range: 126, damage: 5.5, push: 128, meter: 9,
    hitstunFrames: 20, blockstunFrames: 8, chipDamage: 0,
    hitboxes: [box(25, -68, 110, 42, 0, 4)],
  }),
  standHeavy: move("ali-chain-whip", "heavy", {
    cancelProfileId: "stand-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 8, recoveryFrames: 13, range: 186, damage: 12, push: 248, meter: 16,
    hitstunFrames: 23, blockstunFrames: 13, chipDamage: 0,
    hitboxes: [box(32, -198, 145, 102, 0, 3), box(53, -185, 171, 97, 4, 7)],
  }),
  crouchHeavy: move("ali-bass-sweep", "heavy", {
    cancelProfileId: "crouch-heavy", level: ATTACK_LEVELS.LOW,
    startupFrames: 9, activeFrames: 7, recoveryFrames: 15, range: 177, damage: 11, push: 228, meter: 15,
    hitstunFrames: 22, blockstunFrames: 13, chipDamage: 0, knockdown: true,
    hitboxes: [box(29, -64, 132, 42, 0, 2), box(48, -56, 154, 37, 3, 6)],
  }),
  overhead: move("ali-crown-drop", "heavy", {
    cancelProfileId: "overhead", level: ATTACK_LEVELS.OVERHEAD,
    startupFrames: 16, activeFrames: 7, recoveryFrames: 15, range: 171, damage: 14, push: 266, meter: 17,
    hitstunFrames: 24, blockstunFrames: 14, chipDamage: 0,
    hitboxes: [box(27, -233, 121, 116, 0, 2), box(49, -211, 149, 140, 3, 6)],
  }),
  driveHeavy: move("ali-wicked-step", "heavy", {
    cancelProfileId: "drive-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 9, recoveryFrames: 13, range: 212, damage: 13, push: 276, meter: 17,
    hitstunFrames: 24, blockstunFrames: 14, chipDamage: 0, advanceSpeed: 355,
    command: "← → + KICK", hitboxes: [box(32, -192, 162, 119, 0, 4), box(54, -179, 193, 112, 5, 8)],
  }),
  throw: move("ali-respect-toss", "throw", {
    cancelProfileId: "throw", level: ATTACK_LEVELS.THROW,
    startupFrames: 4, activeFrames: 3, recoveryFrames: 18, range: 76, damage: 13, push: 198, meter: 14,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true, animation: anim(1),
    hitboxes: [box(20, -176, 70, 146, 0, 2)],
  }),
  special: move("ali-booyakasha-beat", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 15, recoveryFrames: 9, range: 183, damage: 7, push: 68, meter: 9,
    hitstunFrames: 22, blockstunFrames: 15, chipDamage: 2, maxHits: 2, rehitFrames: 7,
    rhythmCancel: true, rhythmCancelStacks: 2, cancelRoutes: aliFlowRoutes,
    moveName: "BOOYAKASHA BEAT", command: "SPECIAL · builds Flow", animation: anim(0),
    hitboxes: [box(27, -195, 149, 137, 0, 6), box(50, -181, 176, 127, 7, 14)],
  }),
  commandSpecial: move("ali-massive-step", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 22, recoveryFrames: 10, range: 224, damage: 6, push: 56, meter: 8,
    hitstunFrames: 23, blockstunFrames: 16, chipDamage: 2, maxHits: 3, rehitFrames: 7, advanceSpeed: 615,
    rhythmCancel: true, rhythmCancelStacks: 2, cancelRoutes: aliFlowRoutes,
    moveName: "MASSIVE STEP", command: "↓ → + PUNCH · three-beat rush", animation: anim(0),
    hitboxes: [box(23, -199, 165, 145, 0, 6), box(50, -186, 198, 135, 7, 14), box(65, -178, 220, 128, 15, 21)],
  }),
  backSpecial: move("ali-beat-skip", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    // BLOCK ECONOMY: recovery 8→14 (tuned 11→18), −3 on block instead of +4.
    // On hit the flow cancel still opens before recovery, so Ali's rhythm
    // game is untouched; only the blocked read now belongs to the blocker.
    startupFrames: 4, activeFrames: 17, recoveryFrames: 14, range: 196, damage: 7, push: 54, meter: 8,
    hitstunFrames: 22, blockstunFrames: 15, chipDamage: 2, maxHits: 2, rehitFrames: 8,
    advanceSpeed: 835, ignorePushbox: true, reversalInvulnerableFrames: 5,
    rhythmCancel: true, rhythmCancelStacks: 2, cancelRoutes: aliFlowRoutes,
    moveName: "BEAT SKIP", command: "↓ ← + PUNCH · cross-through", animation: anim(1),
    hitboxes: [box(22, -193, 159, 137, 0, 7), box(49, -180, 190, 127, 8, 16)],
  }),
  launcher: move("ali-bassline-riser", "heavy", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 9, recoveryFrames: 17, range: 146, damage: 9, push: 61, meter: 15,
    hitstunFrames: 25, blockstunFrames: 13, chipDamage: 0, knockdown: true, launchVelocityY: -568,
    juggleStarter: true, reversalInvulnerableFrames: 7,
    moveName: "BASSLINE RISER", command: "→ ↓ → + PUNCH", animation: anim(2),
    hitboxes: [box(19, -220, 111, 175, 0, 3), box(37, -263, 133, 218, 4, 8)],
  }),
  enhanced: move("ali-ex-booyakasha-beat", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 4, activeFrames: 23, recoveryFrames: 7, range: 204, damage: 5.5, push: 48, meter: 7,
    hitstunFrames: 23, blockstunFrames: 18, chipDamage: 2, maxHits: 3, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, rhythmCancel: true, rhythmCancelStacks: 1, cancelRoutes: aliFlowRoutes,
    moveName: "BOOYAKASHA BEAT EX", command: "LP&HP", animation: anim(0),
    hitboxes: [box(24, -202, 171, 146, 0, 10), box(50, -186, 199, 136, 11, 22)],
  }),
  enhancedCommandSpecial: move("ali-ex-massive-step", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 4, activeFrames: 29, recoveryFrames: 8, range: 251, damage: 5, push: 43, meter: 6,
    hitstunFrames: 24, blockstunFrames: 19, chipDamage: 2, maxHits: 4, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, advanceSpeed: 735,
    rhythmCancel: true, rhythmCancelStacks: 1, cancelRoutes: aliFlowRoutes,
    moveName: "MASSIVE STEP EX", command: "↓ → + LP&HP · four-beat rush", animation: anim(0),
    hitboxes: [box(21, -207, 183, 152, 0, 8), box(50, -192, 221, 143, 9, 18), box(68, -182, 247, 133, 19, 28)],
  }),
  enhancedBackSpecial: move("ali-ex-beat-skip", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    // BLOCK ECONOMY: recovery 6→18 (tuned 8→24) so the invulnerable
    // cross-through reads −6 on block instead of +10 (last-active-frame
    // convention; with the third hit landing at f16 the real number is about
    // −14). Startup, active, invulnerability and the side switch are the
    // payoff and stay; on hit the flow cancel still opens before recovery.
    startupFrames: 2, activeFrames: 23, recoveryFrames: 18, range: 222, damage: 5.5, push: 43, meter: 6,
    hitstunFrames: 24, blockstunFrames: 18, chipDamage: 2, maxHits: 3, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, advanceSpeed: 950, ignorePushbox: true, reversalInvulnerableFrames: 9,
    rhythmCancel: true, rhythmCancelStacks: 1, cancelRoutes: aliFlowRoutes,
    moveName: "BEAT SKIP EX", command: "↓ ← + LP&HP · triple cross", animation: anim(1),
    hitboxes: [box(18, -201, 178, 145, 0, 10), box(51, -185, 218, 134, 11, 22)],
  }),
  enhancedLauncher: move("ali-ex-bassline-riser", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    // BLOCK ECONOMY: recovery 14→15 (tuned 18→20, −2→−4 on block) so the
    // invulnerable EX riser clears the −3 floor on its own numbers instead
    // of via the createAttackInstance clamp.
    startupFrames: 4, activeFrames: 14, recoveryFrames: 15, range: 169, damage: 6.5, push: 54, meter: 7,
    hitstunFrames: 26, blockstunFrames: 16, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    launchVelocityY: -610, juggleStarter: true, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 11,
    moveName: "BASSLINE RISER EX", command: "→ ↓ → + LP&HP", animation: anim(2),
    hitboxes: [box(17, -228, 126, 187, 0, 6), box(40, -278, 151, 236, 7, 13)],
  }),
  super: move("ali-west-staines-massive-super", "special", {
    cancelProfileId: "grit-super", level: ATTACK_LEVELS.MID,
    startupFrames: 5, activeFrames: 48, recoveryFrames: 18, range: 304, damage: 4.5, push: 35, meter: 0,
    hitstunFrames: 25, blockstunFrames: 20, chipDamage: 1.25, knockdown: true, knockdownOnFinal: true,
    juggleLift: -178, maxHits: 8, rehitFrames: 6, gritCost: GRIT_RULES.superCost, juggleLimit: 9,
    superMove: true, reversalInvulnerableFrames: 10,
    moveName: "WEST STAINES MASSIVE", command: "FULL GRIT + ↓ → ↓ → PUNCH", animation: anim(3),
    hitboxes: [box(24, -216, 199, 174, 0, 11), box(49, -205, 241, 162, 12, 23), box(31, -234, 278, 193, 24, 35), box(56, -216, 308, 177, 36, 47)],
  }),
};

// ---------------------------------------------------------------------------
// R2.0 FAMILY wave 16 — THE COMMISSIONER's real kit. The arcade boss (and the
// secret unlockable) stops borrowing DeathBlow's sheet: every move is the
// steel cane. Identity: the longest grounded pokes in the game on the slowest
// feet, an unblockable contract grab, and one armored ceremony of a super.
// Damage sits mid-table — the reach IS the boss fight; difficulty still comes
// from the arcade ladder's AI tier and the boss movement buff, not from a
// stat cheat.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// R2.0 FAMILY wave 17 — THE PINELANDS DEVIL. A winged hit-and-run predator:
// hooved speed, the wing-glide jump (movement.glideFallCap, applied in the
// shared physics step as a pure function of snapshotted velocity — no new
// state field), a horn-charge running heavy, a tail-whip sweep, the
// short-range PINEY SCREECH cone, the LEATHERWING DIVE air special and the
// BARRENS CURSE super. Kick normals derive from these via the standard table.
// ---------------------------------------------------------------------------
const devilMoves = {
  standLight: move("devil-talon-jab", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 5, activeFrames: 5, recoveryFrames: 9, range: 108, damage: 6, push: 150, meter: 10,
    hitstunFrames: 22, blockstunFrames: 9, chipDamage: 0,
    hitboxes: [box(24, -170, 88, 64, 0, 4)],
  }),
  forwardLight: move("devil-wing-hook", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 5, recoveryFrames: 11, range: 128, damage: 8, push: 195, meter: 11,
    hitstunFrames: 23, blockstunFrames: 10, chipDamage: 0, advanceSpeed: 150,
    hitboxes: [box(26, -176, 104, 88, 0, 4)],
  }),
  crouchLight: move("devil-hoof-scrape", "light", {
    cancelProfileId: "crouch-light", level: ATTACK_LEVELS.LOW,
    startupFrames: 6, activeFrames: 5, recoveryFrames: 10, range: 112, damage: 6, push: 140, meter: 10,
    hitstunFrames: 21, blockstunFrames: 10, chipDamage: 0,
    hitboxes: [box(26, -70, 92, 42, 0, 4)],
  }),
  standHeavy: move("devil-horn-hook", "heavy", {
    cancelProfileId: "stand-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 13, activeFrames: 7, recoveryFrames: 16, range: 150, damage: 14, push: 300, meter: 17,
    hitstunFrames: 24, blockstunFrames: 14, chipDamage: 0,
    hitboxes: [box(30, -186, 112, 94, 0, 2), box(46, -176, 126, 90, 3, 6)],
  }),
  crouchHeavy: move("devil-tail-whip", "heavy", {
    cancelProfileId: "crouch-heavy", level: ATTACK_LEVELS.LOW,
    startupFrames: 12, activeFrames: 8, recoveryFrames: 20, range: 172, damage: 13, push: 270, meter: 17,
    hitstunFrames: 22, blockstunFrames: 15, chipDamage: 0, knockdown: true,
    hitboxes: [box(26, -64, 124, 42, 0, 3), box(44, -58, 144, 38, 4, 7)],
  }),
  overhead: move("devil-perch-drop", "heavy", {
    cancelProfileId: "overhead", level: ATTACK_LEVELS.OVERHEAD,
    startupFrames: 21, activeFrames: 6, recoveryFrames: 19, range: 148, damage: 16, push: 305, meter: 18,
    hitstunFrames: 25, blockstunFrames: 15, chipDamage: 0,
    hitboxes: [box(22, -226, 104, 110, 0, 1), box(40, -208, 124, 140, 2, 5)],
  }),
  driveHeavy: move("devil-horn-charge", "heavy", {
    cancelProfileId: "drive-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 15, activeFrames: 9, recoveryFrames: 19, range: 196, damage: 16, push: 345, meter: 19,
    hitstunFrames: 25, blockstunFrames: 16, chipDamage: 0, advanceSpeed: 265,
    command: "← → + KICK", hitboxes: [box(30, -188, 150, 124, 0, 4), box(50, -176, 172, 116, 5, 8)],
  }),
  throw: move("devil-wing-snatch", "throw", {
    cancelProfileId: "throw", level: ATTACK_LEVELS.THROW,
    startupFrames: 5, activeFrames: 3, recoveryFrames: 24, range: 84, damage: 16, push: 215, meter: 15,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true, animation: anim(1),
    hitboxes: [box(20, -178, 74, 148, 0, 2)],
  }),
  special: move("devil-piney-screech", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 11, activeFrames: 12, recoveryFrames: 18, range: 176, damage: 15, push: 310, meter: 21,
    hitstunFrames: 26, blockstunFrames: 17, chipDamage: 3, knockdown: true,
    moveName: "PINEY SCREECH", command: "SPECIAL", animation: anim(0),
    hitboxes: [box(30, -196, 150, 150, 0, 5), box(44, -186, 172, 140, 6, 11)],
  }),
  commandSpecial: move("devil-pine-howl", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 14, activeFrames: 11, recoveryFrames: 18, range: 210, damage: 18, push: 360, meter: 24,
    hitstunFrames: 27, blockstunFrames: 18, chipDamage: 4, knockdown: true, advanceSpeed: 180,
    moveName: "PINE HOWL", command: "↓ → + PUNCH", animation: anim(0),
    hitboxes: [box(34, -198, 176, 146, 0, 5), box(50, -188, 200, 136, 6, 10)],
  }),
  backSpecial: move("devil-wing-flit", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 9, activeFrames: 8, recoveryFrames: 16, range: 132, damage: 10, push: 210, meter: 18,
    hitstunFrames: 22, blockstunFrames: 13, chipDamage: 0, ignorePushbox: true, advanceSpeed: 330,
    moveName: "WING FLIT", command: "↓ ← + PUNCH · cross-through", animation: anim(1),
    hitboxes: [box(18, -180, 104, 132, 0, 3), box(30, -172, 118, 124, 4, 7)],
  }),
  launcher: move("devil-updraft-talon", "heavy", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 8, recoveryFrames: 24, range: 136, damage: 12, push: 78, meter: 17,
    hitstunFrames: 27, blockstunFrames: 15, chipDamage: 0, knockdown: true, launchVelocityY: -575,
    juggleStarter: true,
    moveName: "UPDRAFT TALON", command: "→ ↓ → + PUNCH", animation: anim(2),
    hitboxes: [box(20, -214, 106, 168, 0, 3), box(34, -256, 122, 206, 4, 7)],
  }),
  enhanced: move("devil-ex-piney-screech", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 16, recoveryFrames: 15, range: 198, damage: 9, push: 100, meter: 9,
    hitstunFrames: 25, blockstunFrames: 19, chipDamage: 3, knockdown: true, knockdownOnFinal: true,
    maxHits: 2, rehitFrames: 8, gritCost: GRIT_RULES.enhancedSpecialCost,
    moveName: "PINEY SCREECH EX", command: "LP&HP", animation: anim(0),
    hitboxes: [box(28, -202, 172, 156, 0, 7), box(46, -190, 196, 144, 8, 15)],
  }),
  enhancedCommandSpecial: move("devil-ex-pine-howl", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 18, recoveryFrames: 15, range: 236, damage: 11, push: 118, meter: 10,
    hitstunFrames: 27, blockstunFrames: 20, chipDamage: 4, knockdown: true, knockdownOnFinal: true,
    maxHits: 2, rehitFrames: 9, gritCost: GRIT_RULES.enhancedSpecialCost, advanceSpeed: 240,
    moveName: "PINE HOWL EX", command: "↓ → + LP&HP", animation: anim(0),
    hitboxes: [box(32, -204, 198, 152, 0, 8), box(52, -192, 224, 140, 9, 17)],
  }),
  enhancedBackSpecial: move("devil-ex-wing-flit", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 8, recoveryFrames: 14, range: 148, damage: 13, push: 230, meter: 10,
    hitstunFrames: 24, blockstunFrames: 15, chipDamage: 0, ignorePushbox: true, advanceSpeed: 380,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 6,
    moveName: "WING FLIT EX", command: "↓ ← + LP&HP", animation: anim(1),
    hitboxes: [box(16, -184, 116, 138, 0, 7)],
  }),
  enhancedLauncher: move("devil-ex-updraft-talon", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 13, recoveryFrames: 21, range: 156, damage: 9, push: 72, meter: 9,
    hitstunFrames: 27, blockstunFrames: 17, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    launchVelocityY: -620, juggleStarter: true, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 10,
    moveName: "UPDRAFT TALON EX", command: "→ ↓ → + LP&HP", animation: anim(2),
    hitboxes: [box(17, -220, 118, 176, 0, 5), box(32, -264, 138, 216, 6, 12)],
  }),
  super: move("devil-barrens-curse", "special", {
    cancelProfileId: "grit-super", level: ATTACK_LEVELS.MID,
    startupFrames: 9, activeFrames: 38, recoveryFrames: 26, range: 246, damage: 9, push: 58, meter: 0,
    hitstunFrames: 28, blockstunFrames: 22, chipDamage: 3, knockdown: true, knockdownOnFinal: true,
    juggleLift: -220, maxHits: 5, rehitFrames: 8, gritCost: GRIT_RULES.superCost,
    superMove: true,
    moveName: "BARRENS CURSE", command: "FULL GRIT + ↓ → ↓ → PUNCH", animation: anim(3),
    hitboxes: [box(22, -214, 178, 172, 0, 8), box(44, -204, 214, 160, 9, 18), box(24, -230, 234, 190, 19, 28), box(48, -212, 250, 174, 29, 37)],
  }),
  // The DIVE: his air special drops lower and carries wing momentum forward,
  // overriding the shared airSpecial the rest of the cast uses.
  airSpecial: move("devil-leatherwing-dive", "special", {
    level: ATTACK_LEVELS.AIR, startupFrames: 11, activeFrames: 12, recoveryFrames: 15,
    range: 170, damage: 15, push: 320, meter: 22, hitstunFrames: 25, blockstunFrames: 17, chipDamage: 3,
    knockdown: true, advanceSpeed: 300,
    moveName: "LEATHERWING DIVE",
    hitboxes: [box(20, -140, 130, 130, 0, 5), box(34, -120, 150, 120, 6, 11)],
  }),
};

const commissionerMoves = {
  standLight: move("commissioner-cane-jab", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 5, recoveryFrames: 11, range: 150, damage: 7, push: 172, meter: 10,
    hitstunFrames: 22, blockstunFrames: 10, chipDamage: 0,
    hitboxes: [box(30, -172, 132, 58, 0, 4)],
  }),
  forwardLight: move("commissioner-writ-server", "light", {
    cancelProfileId: "stand-light", level: ATTACK_LEVELS.MID,
    startupFrames: 9, activeFrames: 5, recoveryFrames: 12, range: 178, damage: 8, push: 196, meter: 11,
    hitstunFrames: 22, blockstunFrames: 11, chipDamage: 0, advanceSpeed: 118,
    hitboxes: [box(36, -176, 158, 64, 0, 4)],
  }),
  crouchLight: move("commissioner-docket-tap", "light", {
    cancelProfileId: "crouch-light", level: ATTACK_LEVELS.LOW,
    startupFrames: 7, activeFrames: 5, recoveryFrames: 11, range: 156, damage: 6, push: 150, meter: 10,
    hitstunFrames: 21, blockstunFrames: 10, chipDamage: 0,
    hitboxes: [box(30, -70, 138, 42, 0, 4)],
  }),
  standHeavy: move("commissioner-gavel-crack", "heavy", {
    cancelProfileId: "stand-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 14, activeFrames: 7, recoveryFrames: 17, range: 198, damage: 14, push: 300, meter: 17,
    hitstunFrames: 24, blockstunFrames: 14, chipDamage: 0,
    hitboxes: [box(38, -186, 150, 84, 0, 2), box(56, -178, 176, 82, 3, 6)],
  }),
  crouchHeavy: move("commissioner-fee-sweep", "heavy", {
    cancelProfileId: "crouch-heavy", level: ATTACK_LEVELS.LOW,
    startupFrames: 14, activeFrames: 7, recoveryFrames: 21, range: 202, damage: 12, push: 262, meter: 16,
    hitstunFrames: 23, blockstunFrames: 14, chipDamage: 0, knockdown: true,
    hitboxes: [box(34, -64, 148, 40, 0, 2), box(56, -57, 172, 36, 3, 6)],
  }),
  overhead: move("commissioner-sentence-drop", "heavy", {
    cancelProfileId: "overhead", level: ATTACK_LEVELS.OVERHEAD,
    startupFrames: 20, activeFrames: 6, recoveryFrames: 19, range: 182, damage: 16, push: 312, meter: 18,
    hitstunFrames: 25, blockstunFrames: 15, chipDamage: 0,
    hitboxes: [box(26, -226, 118, 108, 0, 1), box(48, -206, 152, 138, 2, 5)],
  }),
  driveHeavy: move("commissioner-court-order", "heavy", {
    cancelProfileId: "drive-heavy", level: ATTACK_LEVELS.MID,
    startupFrames: 16, activeFrames: 9, recoveryFrames: 18, range: 216, damage: 16, push: 348, meter: 19,
    hitstunFrames: 25, blockstunFrames: 16, chipDamage: 0, advanceSpeed: 228,
    command: "← → + KICK", hitboxes: [box(36, -188, 168, 120, 0, 4), box(58, -176, 196, 112, 5, 8)],
  }),
  throw: move("commissioner-contempt-hold", "throw", {
    cancelProfileId: "throw", level: ATTACK_LEVELS.THROW,
    startupFrames: 5, activeFrames: 3, recoveryFrames: 24, range: 84, damage: 16, push: 215, meter: 15,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true, animation: anim(1),
    hitboxes: [box(19, -180, 76, 150, 0, 2)],
  }),
  special: move("commissioner-cane-check", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 12, activeFrames: 10, recoveryFrames: 19, range: 226, damage: 15, push: 320, meter: 21,
    hitstunFrames: 26, blockstunFrames: 17, chipDamage: 3, knockdown: true, armorFrames: 8,
    moveName: "CANE CHECK", command: "SPECIAL", animation: anim(0),
    hitboxes: [box(34, -190, 178, 132, 0, 4), box(54, -180, 208, 124, 5, 9)],
  }),
  commandSpecial: move("commissioner-ledger-lance", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 14, activeFrames: 11, recoveryFrames: 19, range: 268, damage: 18, push: 372, meter: 24,
    hitstunFrames: 27, blockstunFrames: 18, chipDamage: 4, knockdown: true, advanceSpeed: 165,
    moveName: "LEDGER LANCE", command: "↓ → + PUNCH", animation: anim(0),
    hitboxes: [box(42, -196, 214, 138, 0, 5), box(64, -186, 246, 128, 6, 10)],
  }),
  backSpecial: move("commissioner-binding-clause", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.THROW,
    startupFrames: 9, activeFrames: 4, recoveryFrames: 27, range: 96, damage: 19, push: 240, meter: 17,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true,
    moveName: "BINDING CLAUSE", command: "↓ ← + PUNCH · unblockable contract", animation: anim(1),
    hitboxes: [box(18, -182, 88, 152, 0, 3)],
  }),
  launcher: move("commissioner-overrule", "heavy", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 8, recoveryFrames: 24, range: 142, damage: 12, push: 76, meter: 17,
    hitstunFrames: 27, blockstunFrames: 15, chipDamage: 0, knockdown: true, launchVelocityY: -570,
    juggleStarter: true, reversalInvulnerableFrames: 6,
    moveName: "OVERRULE", command: "→ ↓ → + PUNCH", animation: anim(2),
    hitboxes: [box(21, -218, 110, 172, 0, 3), box(36, -258, 126, 210, 4, 7)],
  }),
  enhanced: move("commissioner-ex-cane-check", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 9, activeFrames: 17, recoveryFrames: 16, range: 252, damage: 9, push: 96, meter: 9,
    hitstunFrames: 25, blockstunFrames: 19, chipDamage: 3, knockdown: true, knockdownOnFinal: true,
    maxHits: 2, rehitFrames: 8, gritCost: GRIT_RULES.enhancedSpecialCost, armorFrames: 12,
    moveName: "CANE CHECK EX", command: "LP&HP", animation: anim(0),
    hitboxes: [box(32, -196, 200, 140, 0, 7), box(56, -184, 232, 130, 8, 16)],
  }),
  enhancedCommandSpecial: move("commissioner-ex-ledger-lance", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 19, recoveryFrames: 16, range: 298, damage: 11, push: 118, meter: 10,
    hitstunFrames: 27, blockstunFrames: 20, chipDamage: 4, knockdown: true, knockdownOnFinal: true,
    maxHits: 2, rehitFrames: 9, gritCost: GRIT_RULES.enhancedSpecialCost, advanceSpeed: 210,
    moveName: "LEDGER LANCE EX", command: "↓ → + LP&HP", animation: anim(0),
    hitboxes: [box(40, -202, 238, 148, 0, 8), box(66, -190, 276, 136, 9, 18)],
  }),
  enhancedBackSpecial: move("commissioner-ex-binding-clause", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.THROW,
    startupFrames: 6, activeFrames: 6, recoveryFrames: 24, range: 118, damage: 24, push: 280, meter: 12,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 5,
    moveName: "BINDING CLAUSE EX", command: "↓ ← + LP&HP", animation: anim(1),
    hitboxes: [box(15, -188, 110, 158, 0, 5)],
  }),
  enhancedLauncher: move("commissioner-ex-overrule", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 13, recoveryFrames: 21, range: 162, damage: 9, push: 70, meter: 9,
    hitstunFrames: 27, blockstunFrames: 17, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    launchVelocityY: -615, juggleStarter: true, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 11,
    moveName: "OVERRULE EX", command: "→ ↓ → + LP&HP", animation: anim(2),
    hitboxes: [box(18, -224, 122, 180, 0, 6), box(35, -270, 142, 226, 7, 12)],
  }),
  super: move("commissioner-final-authority", "special", {
    cancelProfileId: "grit-super", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 40, recoveryFrames: 26, range: 262, damage: 8, push: 56, meter: 0,
    hitstunFrames: 28, blockstunFrames: 22, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    juggleLift: -212, maxHits: 5, rehitFrames: 8, gritCost: GRIT_RULES.superCost, juggleLimit: 7,
    superMove: true, armorFrames: 12,
    moveName: "FINAL AUTHORITY", command: "FULL GRIT + ↓ → ↓ → PUNCH", animation: anim(3),
    hitboxes: [box(22, -216, 190, 176, 0, 9), box(46, -206, 226, 164, 10, 19), box(26, -234, 246, 194, 20, 29), box(50, -216, 262, 178, 30, 39)],
  }),
};

const fighterKits = {
  deathblow: {
    id: "deathblow",
    archetype: "SEISMIC BRUISER / GRAPPLER",
    summary: "Armored pressure, huge counter damage and a command grab. Slow feet; terrifying once he is close.",
    movement: {
      forwardWalkSpeed: 246, backWalkSpeed: 182, jumpVelocityY: -708,
      forwardJumpVelocityX: 286, backJumpVelocityX: 242, neutralJumpVelocityX: 0,
      forwardDashSpeed: 510, forwardDashFrames: 13, backDashSpeed: 438, backDashFrames: 16,
      backDashInvulnerableFrames: 6, dashCooldownFrames: 11,
      standingPushboxHalfWidth: 44, crouchingPushboxHalfWidth: 40,
    },
    ai: { preferredRange: 82, retreatRange: 52, approachRange: 176, antiAirAction: "launcher", pokeAction: "driveHeavy", closeAction: "backSpecial", rangedAction: "commandSpecial" },
    victory: { bank: "specials", frame: 15, quote: "THE STREET MOVED FIRST." },
    moveList: [
      ["Hammer Jab / Body Check", "LP / → + LP"],
      ["Demolition Drop", "→ + HP · overhead"],
      ["Tremor Tap", "↓ → + KICK"],
      ["Faultline Fist", "↓ → + PUNCH"],
      ["Aftershock Grab", "↓ ← + PUNCH · unblockable"],
      ["Quarry Breaker", "→ ↓ → + PUNCH · anti-air"],
      ["Enhanced specials", "Repeat motion + LP&HP · 25 Grit"],
      ["Concrete Pour", "CLOSE + → or ← + LP/LK"],
      ["Epicenter Execution", "FULL GRIT + ↓ → ↓ → PUNCH"],
    ],
    moves: { ...shared, ...deathblowMoves },
  },
  jez: {
    id: "jez",
    archetype: "NEON-SIGNBLADE FOOTSIES",
    summary: "Fast walk speed, long confirms and evasive cross-through pressure. Wins by owning the exact tip range.",
    movement: {
      forwardWalkSpeed: 338, backWalkSpeed: 278, jumpVelocityY: -792,
      forwardJumpVelocityX: 354, backJumpVelocityX: 314, neutralJumpVelocityX: 0,
      forwardDashSpeed: 670, forwardDashFrames: 9, backDashSpeed: 575, backDashFrames: 12,
      backDashInvulnerableFrames: 7, dashCooldownFrames: 7,
      standingPushboxHalfWidth: 36, crouchingPushboxHalfWidth: 33,
    },
    ai: { preferredRange: 188, retreatRange: 96, approachRange: 286, antiAirAction: "launcher", pokeAction: "special", closeAction: "backSpecial", rangedAction: "commandSpecial" },
    victory: { bank: "specials", frame: 15, quote: "READ THE SIGN." },
    moveList: [
      ["Neon Jab / Letter Opener", "LP / → + LP"],
      ["Marquee Axe", "→ + HP · overhead"],
      ["Neon Edge", "↓ → + KICK"],
      ["Signline Lance", "↓ → + PUNCH"],
      ["Vinyl Step", "↓ ← + PUNCH · cross-through"],
      ["Signpost Rising", "→ ↓ → + PUNCH · anti-air"],
      ["Enhanced specials", "Repeat motion + LP&HP · 25 Grit"],
      ["Signpost Trip", "CLOSE + → or ← + LP/LK"],
      ["Seven-Palm Neon Guillotine", "FULL GRIT + ↓ → ↓ → PUNCH"],
    ],
    moves: { ...shared, ...jezMoves },
  },
  alan: {
    id: "alan",
    archetype: "HEAVYWEIGHT COUNTER-PUNCHER",
    summary: "A planted powerhouse with armored hands and the roster's only true strike counter. Slow to turn; brutal when he reads you.",
    movement: {
      forwardWalkSpeed: 228, backWalkSpeed: 172, jumpVelocityY: -684,
      forwardJumpVelocityX: 268, backJumpVelocityX: 224, neutralJumpVelocityX: 0,
      forwardDashSpeed: 488, forwardDashFrames: 14, backDashSpeed: 412, backDashFrames: 17,
      backDashInvulnerableFrames: 5, dashCooldownFrames: 12,
      standingPushboxHalfWidth: 46, crouchingPushboxHalfWidth: 42,
    },
    ai: { preferredRange: 96, retreatRange: 58, approachRange: 188, antiAirAction: "launcher", pokeAction: "special", closeAction: "heavy", rangedAction: "commandSpecial", counterAction: "backSpecial", counterRange: 172, counterChance: 0.76 },
    victory: { bank: "specials", frame: 15, quote: "SIX SHOTS. ONE ANSWER." },
    moveList: [
      ["Union Jab / Shoulder Check", "LP / → + LP"],
      ["Foreman Hammer", "→ + HP · overhead"],
      ["Heavy Hand", "↓ → + KICK · armored"],
      ["South Street Slam", "↓ → + PUNCH"],
      ["Southpaw Counter", "↓ ← + PUNCH · counters strikes"],
      ["Broad Street Uppercut", "→ ↓ → + PUNCH · anti-air"],
      ["Enhanced specials", "Repeat motion + LP&HP · 25 Grit"],
      ["Dockyard Clinch", "CLOSE + → or ← + LP/LK"],
      ["South Street Six", "FULL GRIT + ↓ → ↓ → PUNCH"],
    ],
    moves: { ...shared, ...alanMoves },
  },
  post: {
    id: "post",
    archetype: "GRAFFITI ZONER / TRAPPER",
    summary: "Controls long lanes with spray, retreats behind persistent Wet Paint traps, then launches anyone who chases carelessly.",
    movement: {
      forwardWalkSpeed: 302, backWalkSpeed: 294, jumpVelocityY: -765,
      forwardJumpVelocityX: 322, backJumpVelocityX: 338, neutralJumpVelocityX: 0,
      forwardDashSpeed: 595, forwardDashFrames: 10, backDashSpeed: 625, backDashFrames: 10,
      backDashInvulnerableFrames: 8, dashCooldownFrames: 8,
      standingPushboxHalfWidth: 37, crouchingPushboxHalfWidth: 34,
    },
    ai: { preferredRange: 238, retreatRange: 126, approachRange: 348, antiAirAction: "launcher", pokeAction: "special", closeAction: "launcher", rangedAction: "backSpecial", retreatWhenClose: true },
    victory: { bank: "specials", frame: 15, quote: "THE WHOLE CITY IS MY WALL." },
    moveList: [
      ["Can Tap / Tagger's Poke", "LP / → + LP"],
      ["Drip Drop", "→ + HP · overhead"],
      ["Rattlecan Burst", "↓ → + KICK"],
      ["Paint the Town", "↓ → + PUNCH · long range"],
      ["Wet Paint", "↓ ← + PUNCH · persistent low trap"],
      ["Tag Updraft", "→ ↓ → + PUNCH · anti-air"],
      ["Enhanced specials", "Repeat motion + LP&HP · 25 Grit"],
      ["Fresh Coat Toss", "CLOSE + → or ← + LP/LK"],
      ["Full Coverage", "FULL GRIT + ↓ → ↓ → PUNCH"],
    ],
    moves: { ...shared, ...postMoves },
  },
  benny: {
    id: "benny",
    archetype: "ELECTRICAL RUSHDOWN",
    summary: "The fastest pressure fighter in Philly: multi-hit current, cross-through Live Wire attacks and hit-confirm voltage cancels keep his turn alive.",
    movement: {
      forwardWalkSpeed: 358, backWalkSpeed: 272, jumpVelocityY: -806,
      forwardJumpVelocityX: 372, backJumpVelocityX: 322, neutralJumpVelocityX: 0,
      forwardDashSpeed: 735, forwardDashFrames: 8, backDashSpeed: 586, backDashFrames: 11,
      backDashInvulnerableFrames: 7, dashCooldownFrames: 6,
      standingPushboxHalfWidth: 35, crouchingPushboxHalfWidth: 32,
    },
    ai: { preferredRange: 92, retreatRange: 48, approachRange: 258, antiAirAction: "launcher", pokeAction: "commandSpecial", closeAction: "special", rangedAction: "backSpecial" },
    victory: { bank: "specials", frame: 15, quote: "CURRENT STAYS WITH ME." },
    moveList: [
      ["Static Jab / Hot Lead", "LP / → + LP"],
      ["Power Surge", "→ + HP · overhead"],
      ["Static Snap", "↓ → + KICK · voltage cancel"],
      ["Benny Blitz", "↓ → + PUNCH · three-hit rush"],
      ["Live Wire", "↓ ← + PUNCH · cross-through"],
      ["Circuit Riser", "→ ↓ → + PUNCH · anti-air"],
      ["Enhanced specials", "Repeat motion + LP&HP · 25 Grit"],
      ["Ground Fault", "CLOSE + → or ← + LP/LK"],
      ["Circuit Breaker", "FULL GRIT + ↓ → ↓ → PUNCH"],
    ],
    moves: { ...shared, ...bennyMoves },
  },
  donald: {
    id: "donald",
    archetype: "GOLF-CLUB KEEP-AWAY",
    summary: "Huge club normals, real moving Golden Shockwaves and evasive chip shots make approaching him a very expensive round.",
    movement: {
      forwardWalkSpeed: 246, backWalkSpeed: 304, jumpVelocityY: -702,
      forwardJumpVelocityX: 278, backJumpVelocityX: 306, neutralJumpVelocityX: 0,
      forwardDashSpeed: 492, forwardDashFrames: 13, backDashSpeed: 618, backDashFrames: 11,
      backDashInvulnerableFrames: 8, dashCooldownFrames: 9,
      standingPushboxHalfWidth: 41, crouchingPushboxHalfWidth: 38,
    },
    ai: { preferredRange: 276, retreatRange: 142, approachRange: 388, antiAirAction: "launcher", pokeAction: "commandSpecial", closeAction: "backSpecial", rangedAction: "commandSpecial", retreatWhenClose: true },
    victory: { bank: "specials", frame: 15, quote: "NINE HOLES. NO MERCY." },
    moveList: [
      ["Caddy Tap / Long Iron", "LP / → + LP"],
      ["Clubhouse Chop", "→ + HP · overhead"],
      ["Clubhouse Check", "↓ → + KICK"],
      ["Golden Shockwave", "↓ → + PUNCH · projectile"],
      ["Executive Retreat", "↓ ← + PUNCH · backstep low shot"],
      ["Eagle Uppercut", "→ ↓ → + PUNCH · anti-air"],
      ["Enhanced specials", "Repeat motion + LP&HP · 25 Grit"],
      ["Clubhouse Ejection", "CLOSE + → or ← + LP/LK"],
      ["Golden Back Nine", "FULL GRIT + ↓ → ↓ → PUNCH"],
    ],
    moves: { ...shared, ...donaldMoves },
  },
  cyraxx: {
    id: "cyraxx",
    archetype: "FEEDBACK TRICKSTER",
    summary: "Plants delayed feedback echoes, phases through commitments and turns empty space into a timed purple-green threat.",
    movement: {
      forwardWalkSpeed: 318, backWalkSpeed: 296, jumpVelocityY: -782,
      forwardJumpVelocityX: 338, backJumpVelocityX: 344, neutralJumpVelocityX: 0,
      forwardDashSpeed: 636, forwardDashFrames: 10, backDashSpeed: 648, backDashFrames: 10,
      backDashInvulnerableFrames: 8, dashCooldownFrames: 7,
      standingPushboxHalfWidth: 37, crouchingPushboxHalfWidth: 34,
    },
    ai: { preferredRange: 206, retreatRange: 104, approachRange: 326, antiAirAction: "launcher", pokeAction: "special", closeAction: "backSpecial", rangedAction: "commandSpecial", retreatWhenClose: true },
    victory: { bank: "specials", frame: 15, quote: "THE ECHO GETS THE LAST WORD." },
    moveList: [
      ["Static Check / Cable Poke", "LP / → + LP"],
      ["Dropped Signal", "→ + HP · overhead"],
      ["Mic Check", "↓ → + KICK · two-hit feedback"],
      ["Feedback Loop", "↓ → + PUNCH · delayed echo"],
      ["Buffer Skip", "↓ ← + PUNCH · phase through"],
      ["Gain Spike", "→ ↓ → + PUNCH · anti-air"],
      ["Enhanced specials", "Repeat motion + LP&HP · 25 Grit"],
      ["Mute Button", "CLOSE + → or ← + LP/LK"],
      ["Feedback Meltdown", "FULL GRIT + ↓ → ↓ → PUNCH"],
    ],
    moves: { ...shared, ...cyraxxMoves },
  },
  ali: {
    id: "ali",
    archetype: "RHYTHM / MOMENTUM FIGHTER",
    summary: "Lands distinct attacks inside a tight beat window to build three levels of Flow, speeding his movement and unlocking pressure cancels.",
    movement: {
      forwardWalkSpeed: 332, backWalkSpeed: 266, jumpVelocityY: -798,
      forwardJumpVelocityX: 358, backJumpVelocityX: 312, neutralJumpVelocityX: 0,
      forwardDashSpeed: 682, forwardDashFrames: 9, backDashSpeed: 562, backDashFrames: 11,
      backDashInvulnerableFrames: 7, dashCooldownFrames: 6,
      standingPushboxHalfWidth: 36, crouchingPushboxHalfWidth: 33,
    },
    ai: { preferredRange: 112, retreatRange: 57, approachRange: 272, antiAirAction: "launcher", pokeAction: "commandSpecial", closeAction: "special", rangedAction: "backSpecial" },
    victory: { bank: "specials", frame: 15, quote: "KEEP IT MASSIVE." },
    moveList: [
      ["Mic One / Mic Two", "LP / → + LP"],
      ["Crown Drop", "→ + HP · overhead"],
      ["Booyakasha Beat", "↓ → + KICK · builds Flow"],
      ["Massive Step", "↓ → + PUNCH · three-beat rush"],
      ["Beat Skip", "↓ ← + PUNCH · cross-through"],
      ["Bassline Riser", "→ ↓ → + PUNCH · anti-air"],
      ["Enhanced specials", "Repeat motion + LP&HP · 25 Grit"],
      ["Respect Toss", "CLOSE + → or ← + LP/LK"],
      ["West Staines Massive", "FULL GRIT + ↓ → ↓ → PUNCH"],
    ],
    moves: { ...shared, ...aliMoves },
  },
  devil: {
    id: "devil",
    archetype: "WINGED BARRENS PREDATOR / HIT-AND-RUN",
    summary: "A pine-barrens cryptid on hooves: quick feet, a wing-glide jump that hangs over anti-airs, a horn charge, a tail-whip sweep and a screech that shreds up close. He has to keep moving — nothing about him holds ground.",
    movement: {
      forwardWalkSpeed: 322, backWalkSpeed: 262, jumpVelocityY: -772,
      forwardJumpVelocityX: 344, backJumpVelocityX: 300, neutralJumpVelocityX: 0,
      forwardDashSpeed: 648, forwardDashFrames: 9, backDashSpeed: 566, backDashFrames: 11,
      backDashInvulnerableFrames: 7, dashCooldownFrames: 7,
      standingPushboxHalfWidth: 37, crouchingPushboxHalfWidth: 34,
      // Wave 17 — the wing-glide quirk: his leathery wings cap fall speed
      // (world px/s) during any controlled airborne state. Applied in
      // applyFighterPhysics as a pure function of already-snapshotted fields,
      // so rollback needs no new state. Hitstun/knockdown/grabs fall at full
      // gravity like everyone else.
      glideFallCap: 350,
    },
    ai: { preferredRange: 150, retreatRange: 74, approachRange: 300, antiAirAction: "launcher", pokeAction: "special", closeAction: "backSpecial", rangedAction: "commandSpecial" },
    victory: { bank: "specials", frame: 15, quote: "THE PINES KEEP WHAT THEY CATCH." },
    moveList: [
      ["Talon Jab / Wing Hook", "LP / → + LP"],
      ["Perch Drop", "→ + HP · overhead"],
      ["Piney Screech", "↓ → + KICK · sonic cone"],
      ["Pine Howl", "↓ → + PUNCH"],
      ["Wing Flit", "↓ ← + PUNCH · cross-through"],
      ["Updraft Talon", "→ ↓ → + PUNCH · anti-air"],
      ["Enhanced specials", "Repeat motion + LP&HP · 25 Grit"],
      ["Wing Snatch", "CLOSE + → or ← + LP/LK"],
      ["Barrens Curse", "FULL GRIT + ↓ → ↓ → PUNCH"],
    ],
    moves: { ...shared, ...devilMoves },
  },
  commissioner: {
    id: "commissioner",
    archetype: "STEEL-CANE AUTHORITY / SPACING TYRANT",
    summary: "The longest grounded reach in Philadelphia on the slowest feet. Controls tip range with the cane, signs you into an unblockable contract up close, and armors through anything during FINAL AUTHORITY.",
    movement: {
      forwardWalkSpeed: 238, backWalkSpeed: 196, jumpVelocityY: -696,
      forwardJumpVelocityX: 272, backJumpVelocityX: 234, neutralJumpVelocityX: 0,
      forwardDashSpeed: 505, forwardDashFrames: 13, backDashSpeed: 452, backDashFrames: 15,
      backDashInvulnerableFrames: 6, dashCooldownFrames: 10,
      standingPushboxHalfWidth: 43, crouchingPushboxHalfWidth: 39,
    },
    ai: { preferredRange: 212, retreatRange: 94, approachRange: 322, antiAirAction: "launcher", pokeAction: "commandSpecial", closeAction: "backSpecial", rangedAction: "commandSpecial" },
    victory: { bank: "specials", frame: 15, quote: "THE BOOK CLOSES WHEN I SAY IT CLOSES." },
    moveList: [
      ["Cane Jab / Writ Server", "LP / → + LP"],
      ["Sentence Drop", "→ + HP · overhead"],
      ["Cane Check", "↓ → + KICK · armored"],
      ["Ledger Lance", "↓ → + PUNCH · long reach"],
      ["Binding Clause", "↓ ← + PUNCH · unblockable contract"],
      ["Overrule", "→ ↓ → + PUNCH · anti-air"],
      ["Enhanced specials", "Repeat motion + LP&HP · 25 Grit"],
      ["Contempt Hold", "CLOSE + → or ← + LP/LK"],
      ["Final Authority", "FULL GRIT + ↓ → ↓ → PUNCH · armored"],
    ],
    moves: { ...shared, ...commissionerMoves },
  },
};

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

export const FIGHTER_KITS = deepFreeze(fighterKits);

export function getFighterKit(id) {
  return FIGHTER_KITS[id] || null;
}

export function fighterActionGroup(action) {
  if (["backSpecial"].includes(action)) return "commandSpecial";
  if (["enhancedCommandSpecial", "enhancedBackSpecial", "enhancedLauncher"].includes(action)) return "enhanced";
  return action;
}

export function selectKitMoveKey(action, context = {}) {
  const kick = context.limb === "kick";
  if (action === "light") {
    if (context.airborne) return kick ? "airLightKick" : "airLight";
    if (context.crouching) return kick ? "crouchLightKick" : "crouchLight";
    // Release 1.7 wave 11: forward+LK is the advancing step knee instead of
    // collapsing to the standing light kick.
    if (kick) return context.forwardHeld ? "forwardLightKick" : "standLightKick";
    if (context.forwardHeld) return "forwardLight";
    return "standLight";
  }
  if (action === "heavy") {
    if (context.airborne) return kick ? "airHeavyKick" : "airHeavy";
    if (context.crouching) return kick ? "crouchHeavyKick" : "crouchHeavy";
    // Release 1.7 wave 11: forward+HK is the per-archetype axe kick or slide.
    if (kick) return context.forwardHeld ? "forwardHeavyKick" : "standHeavyKick";
    if (context.forwardHeld) return "overhead";
    return "standHeavy";
  }
  if (action === "special" && context.airborne) return "airSpecial";
  return action;
}

/**
 * Release 1.7 wave 11 — the authored forward+HK flavour per archetype. Slide
 * archetypes trade the axe-kick overhead for a short advancing low that is
 * clearly punishable on block; everyone else swings the axe. One word per
 * fighter is the whole authoring cost — the derive table does the rest.
 */
export const FORWARD_KICK_STYLES = Object.freeze({
  deathblow: "axe",
  jez: "slide",
  alan: "slide",
  post: "axe",
  benny: "slide",
  donald: "axe",
  cyraxx: "slide",
  ali: "axe",
  // Wave 17: the Devil's forward heavy kick is a low tail-slide off the sweep.
  devil: "slide",
  // Wave 16: the Commissioner swings the cane like an axe — no slides in a suit.
  commissioner: "axe",
});

// Per-fighter kick normals are derived once from that fighter's own punch
// normals, so every character keeps a personal kick game without a second set of
// hand-authored move data. The cache keeps the profiles referentially stable,
// which matters for deterministic replay and rollback comparisons.
const derivedKickCache = new Map();

function kitKickProfile(fighterId, kit, key) {
  const cacheKey = `${fighterId}:${key}`;
  if (derivedKickCache.has(cacheKey)) return derivedKickCache.get(cacheKey);
  // The forward heavy kick reads the fighter's authored flavour; every other
  // key resolves to its single table entry with the style ignored.
  const style = key === "forwardHeavyKick" ? FORWARD_KICK_STYLES[fighterId] || "" : "";
  const source = kit.moves[resolveKickVariant(key, style).source];
  const derived = deepFreeze(deriveKickProfile(source, key, style));
  derivedKickCache.set(cacheKey, derived);
  return derived;
}

export function getKitMoveProfile(fighterId, action, context = {}) {
  const kit = getFighterKit(fighterId);
  if (!kit) return null;
  const key = selectKitMoveKey(action, context);
  if (kit.moves[key]) return kit.moves[key];
  if (KICK_VARIANTS[key]) return kitKickProfile(fighterId, kit, key);
  return null;
}

export function createFighterMove(fighterId, action, context = {}) {
  const profile = getKitMoveProfile(fighterId, action, context);
  if (!profile) return null;
  return createAttackInstance(profile.baseKind, {
    ...profile,
    kind: profile.kind,
    profileId: profile.id,
    fighterId,
    kitAction: action,
  });
}

export function fighterActionCost(fighterId, action, context = {}) {
  return getKitMoveProfile(fighterId, action, context)?.gritCost || 0;
}

/**
 * The per-fighter movement blocks below were authored against the original 1.0
 * shared rules. Treating those literals as absolute meant every later change to
 * the shared tempo — and now the fighter scale — silently failed to reach any
 * fighter, because all eight override every field.
 *
 * They are therefore interpreted as *ratios* of this baseline. A fighter that was
 * authored at 246 against a 292 baseline stays at 84% of whatever the shared
 * forward walk currently is, so personality is preserved while arcade tempo and
 * fighter scale both propagate correctly.
 */
export const AUTHORED_MOVEMENT_BASELINE = Object.freeze({
  forwardWalkSpeed: 292,
  backWalkSpeed: 224,
  jumpVelocityY: -748,
  forwardJumpVelocityX: 326,
  backJumpVelocityX: 278,
  forwardDashSpeed: 580,
  backDashSpeed: 505,
  standingPushboxHalfWidth: 39,
  crouchingPushboxHalfWidth: 35,
});

export function getFighterMovement(fighterId, fallback) {
  const authored = getFighterKit(fighterId)?.movement;
  if (!authored) return { ...fallback };
  const movement = { ...fallback };
  for (const [field, value] of Object.entries(authored)) {
    const baseline = AUTHORED_MOVEMENT_BASELINE[field];
    const shared = fallback?.[field];
    movement[field] = Number.isFinite(baseline) && Number.isFinite(shared) && baseline !== 0
      ? Math.round((value / baseline) * shared)
      : value;
  }
  return movement;
}

// Four-button motion vocabulary. Punch terminals (LP/HP) drive the signature
// command specials and the super; kick terminals (LK/HK) drive the base special
// and the running attack. No move needs a fifth button.
export const FIGHTER_COMMANDS = Object.freeze([
  { action: "super", sequence: ["down", "forward", "down", "forward", "punch"], terminal: "punch", display: "↓ → ↓ → + PUNCH", options: { maxWindowFrames: 48, maxGapFrames: 18 } },
  { action: "enhancedLauncher", sequence: ["forward", "down", "forward", "enhanced"], terminal: "enhanced", display: "→ ↓ → + LP+HP" },
  // The down-back chord splits by limb exactly like its single-button pair
  // below: the punch chord is the EX back special, the kick chord the EX
  // personal throwable. Callers that pass no limb keep the pre-wave-11
  // behaviour (the back special matches first).
  { action: "enhancedBackSpecial", sequence: ["down", "back", "enhanced"], terminal: "enhanced", limb: "punch", display: "↓ ← + LP+HP" },
  { action: "enhancedThrowObject", sequence: [...ENHANCED_THROWABLE_COMMAND.sequence], terminal: ENHANCED_THROWABLE_COMMAND.terminal, limb: ENHANCED_THROWABLE_COMMAND.limb, display: ENHANCED_THROWABLE_COMMAND.display },
  { action: "enhancedCommandSpecial", sequence: ["down", "forward", "enhanced"], terminal: "enhanced", display: "↓ → + LP+HP" },
  { action: "launcher", sequence: ["forward", "down", "forward", "punch"], terminal: "punch", display: "→ ↓ → + PUNCH" },
  { action: "driveHeavy", sequence: ["back", "forward", "kick"], terminal: "kick", display: "← → + KICK" },
  { action: "backSpecial", sequence: ["down", "back", "punch"], terminal: "punch", display: "↓ ← + PUNCH" },
  { action: "commandSpecial", sequence: ["down", "forward", "punch"], terminal: "punch", display: "↓ → + PUNCH" },
  { action: "special", sequence: ["down", "forward", "kick"], terminal: "kick", display: "↓ → + KICK" },
  // The last free quarter-circle throws the fighter's personal object.
  { action: "throwObject", sequence: ["down", "back", "kick"], terminal: "kick", display: "↓ ← + KICK" },
]);

export function recognizeFighterCommand(fighterId, history, currentFrame, { limb = "" } = {}) {
  if (!getFighterKit(fighterId)) return null;
  for (const candidate of FIGHTER_COMMANDS) {
    // A limb-tagged candidate only matches when the caller's chord limb
    // agrees; with no limb supplied the tag is ignored (legacy behaviour).
    if (candidate.limb && limb && candidate.limb !== limb) continue;
    const match = matchCommandSequence(history, candidate.sequence, currentFrame, candidate.options);
    if (match) return { ...candidate, ...match };
  }
  return null;
}

// ---------------------------------------------------------------------------
// v2.7 FRAMES — the per-fighter MOTION bank (assets/motion, MOTION-ATLAS.md).
// Pure sim-state cell selection: pose descriptors may name bank "motion" and
// then ALWAYS carry the base/specials cell the machinery used before as
// `fallback`, so a missing sheet or a manifest-rejected cell degrades to
// exactly the 2.6 read in both renderers. A motion cell is a bonus, never a
// dependency.
// ---------------------------------------------------------------------------

export const MOTION_CELL_COUNT = 16;

export const MOTION_CELLS = Object.freeze({
  punchExt: 0, kickExt: 1, smearH: 2, smearV: 3, follow: 4, tuck: 5,
  land: 6, dash: 7, bighit: 8, crumple: 9, wallsplat: 10, airrec: 11,
  charge: 12, victory2: 13, sig1: 14, sig2: 15,
});

/**
 * v5.2 LOCOMOTION (bookends): the BASE cell at the bottom of a descriptor's
 * fallback chain, or -1 when the chain never reaches the base bank. The dash
 * ghost trail reads it: a resolved ext5 dash cell falls back to the motion
 * link it stands in for and only then to the base cell, so reading one level
 * of fallback found nothing and the trail went silent on a decoded sheet.
 */
export function baseFallbackFrame(pose) {
  let current = pose;
  let guard = 0;
  while (current && guard < 12) {
    if (current.bank === "base") return Number.isInteger(current.frame) ? current.frame : -1;
    current = current.fallback;
    guard += 1;
  }
  return -1;
}

export function motionPose(cell, fallbackBank, fallbackFrame) {
  return { bank: "motion", frame: cell, fallback: { bank: fallbackBank, frame: fallbackFrame } };
}

// ---------------------------------------------------------------------------
// v2.9 critic round — BASE-CELL SEMANTIC MAP.
//
// THE ROOT CAUSE this table exists to kill: the base atlas bank's frame
// grammar is NOT uniform across the roster, but every wave up to 2.9 handed
// off to HARDCODED base indices as if it were. Verified cell by cell against
// assets/atlases/<id>.webp at 1:1 (crops + silhouette/area measurement, this
// wave) — the two indices the integration leaned on hardest:
//
//   base(12) was assumed "standing-ish, good for guard". It is a DEEP SQUAT
//   on deathblow / ali / benny / donald / post and a wing-wrapped cocoon on
//   the devil — so standing guard dropped them into a crouch and the 2.9
//   standing block-flinch made them RISE ~80px into the punch. Worse, those
//   squat cells are drawn OVERSIZED (the artist filled the cell with a folded
//   body): measured 1.13x-1.33x the standing figure's mass, so entering
//   crouch ballooned the character in one tick.
//
//   base(13) was assumed "second strike / stagger". It is an ATTACK POSE on
//   nine of ten fighters — benny's high kick, ali's overhead mic swing, the
//   devil's airborne claw lunge, donald's golf swing (with baked crescent
//   VFX), alan's high kick, jez's knee chamber, post's spray raise, cyraxx's
//   airborne tuck — and on DEATHBLOW it is a DIFFERENT COSTUME entirely
//   (long tactical trousers, knee pads, combat boots against his shorts +
//   sneakers everywhere else). Only the Commissioner's 13 is the arms-out
//   recoil the code assumed.
//
// Every beat now resolves through this table instead of a literal index.
// Where a fighter has no suitable base cell for a beat the consumer prefers
// an authored motion/motion2 cell — it must NEVER fall through to a cell
// listed in `attack` or `unusable`.
//
// Roles:
//   idle/walk   the verified neutral cycles (kept for the contract tests)
//   guard       a STANDING braced stance — reconciled with motion2 block-hit
//   crouch      the low stance actually drawn for crouching
//   crouchAdjust uniform draw-scale correction for `crouch` so the figure's
//               MASS matches the motion2 crouch-trans key that precedes it
//               (1 = the cell is already correctly normalised)
//   stagger     a non-attack recoil/absorb cell for the reaction middle beats
//   hit         the flat hit-reaction cell (the long-standing 2.6-2.8 read)
//   secondStrike the cell base(13) was ASSUMED to be; null wherever the sheet
//               does not actually carry one (nine of ten fighters)
//   attack      indices that depict a strike / baked VFX / airborne body —
//               legal in an attack beat, never in a reaction/guard/idle beat
//   unusable    indices that must never draw for this fighter in ANY beat
//               (art defects: wrong costume, wrong generation). `swap` routes
//               them to the nearest correct cell at the single choke point in
//               resolveMotionPose, so no beat anywhere can reach them.
// ---------------------------------------------------------------------------

const DEFAULT_BASE_ROLES = Object.freeze({
  idle: Object.freeze([0, 1, 2, 3]),
  walk: Object.freeze([4, 5, 6, 7]),
  guard: 12,
  crouch: 12,
  crouchAdjust: 1,
  stagger: 15,
  hit: 15,
  // v2.9 final round (R1) — `hit` and `down` are DIFFERENT ROLES. They are the
  // same index on nine of ten sheets, so nothing ever forced them apart, and
  // the devil is the counter-example that proves they are not the same
  // question: his 15 is FLAT ON HIS BACK, which is the correct knockdown
  // drawing and an absurd answer to "he just took a light jab". `down` is the
  // prone / knockdown / wake-up read; `hit` is the STANDING recoil.
  down: 15,
  secondStrike: null,
  attack: Object.freeze([9, 10, 13, 14]),
  unusable: Object.freeze([]),
  swap: Object.freeze({}),
});

export const BASE_CELL_ROLES = Object.freeze({
  deathblow: Object.freeze({
    guard: 8, crouch: 12, crouchAdjust: 0.8, stagger: 11, hit: 15, secondStrike: null,
    attack: Object.freeze([9, 10, 13, 14]),
    unusable: Object.freeze([13]),
    swap: Object.freeze({ 13: 9 }),
    note: "8 braced fists-up; 11 upright recovery; 12 deep squat drawn 1.25x oversized; "
      + "13 is a DIFFERENT COSTUME (tactical trousers, knee pads, combat boots) — never drawable",
  }),
  jez: Object.freeze({
    guard: 11, crouch: 12, crouchAdjust: 1, stagger: 15, hit: 15, secondStrike: null,
    attack: Object.freeze([9, 10, 13, 14]),
    note: "11/15 upright guard reads; 12 is a knee-lift (the shipped crouch cell, correctly scaled); "
      + "13 is a high knee chamber and 14 a high kick",
  }),
  alan: Object.freeze({
    guard: 11, crouch: 12, crouchAdjust: 1, stagger: 15, hit: 15, secondStrike: null,
    attack: Object.freeze([9, 10, 13, 14]),
    note: "12 is a genuine compact crouch at the right scale; 13/14 are kicks",
  }),
  post: Object.freeze({
    guard: 11, crouch: 12, crouchAdjust: 0.79, stagger: 15, hit: 15, secondStrike: null,
    attack: Object.freeze([9, 10, 13, 14]),
    note: "12 is a low forward lunge drawn 1.32x oversized; 13 raises the spray can (baked mist), "
      + "14 is the spray blast",
  }),
  donald: Object.freeze({
    guard: 0, crouch: 12, crouchAdjust: 0.82, stagger: 15, hit: 15, secondStrike: null,
    attack: Object.freeze([9, 10, 11, 13, 14]),
    note: "no defensive cell exists — guard holds the club-carrying idle; 12 is a deep forward "
      + "lunge drawn 1.24x oversized; 13 is the full golf swing WITH a baked golden crescent",
  }),
  devil: Object.freeze({
    guard: 11, crouch: 12, crouchAdjust: 0.9, stagger: null, hit: 8, down: 15, secondStrike: null,
    attack: Object.freeze([9, 10, 13, 14]),
    // v2.9 final round (R1): `hit` was 15 while this very note said 15 is flat
    // on his back — so a single LIGHT jab laid him out mid-air, and the
    // wake-up track's prone fallback and the hit-flash read both pointed at
    // the same cell for opposite reasons. Re-read at 1:1 this round: the
    // sheet has no standing recoil, but 8 is a hunched forward-leaning body
    // with the weight on the back leg and the head dropped — the only upright,
    // non-guard, non-attack drawing on the sheet, and a defensible absorb.
    // The authored reaction keys (motion:8 big-hit, motion2:9 head snap,
    // motion2:10 rubber-legs) still lead every reaction track; 8 is what shows
    // underneath them. `down` keeps 15, which is the right knockdown drawing.
    note: "11 upright bipedal guard; 12 is the wing-wrapped cocoon; 13 is an AIRBORNE claw lunge; "
      + "15 is FLAT ON HIS BACK — it is the `down` cell, never the standing `hit` cell; 8 is the "
      + "only upright non-attack absorb the sheet has and carries the standing recoil",
  }),
  ali: Object.freeze({
    guard: 9, crouch: 12, crouchAdjust: 0.83, stagger: 15, hit: 15, secondStrike: null,
    // v2.9 final round (R2): 8 added — it is an OVERHEAD MIC SWING, the same
    // prop-in-action class as 11/13/14, and its omission left it reachable by
    // any beat that only consults `attack`.
    attack: Object.freeze([8, 10, 11, 13, 14]),
    note: "9 is the braced wide stance (his only non-attack guard read); 12 is a deep squat drawn "
      + "1.22x oversized; 8, 11 and 13 are mic swings, 14 the sonic wave. 15 is the arm-up flinch "
      + "and carried BLED-IN sonic-wave crescents from cell 14 until the 2.9 atlas repair",
  }),
  benny: Object.freeze({
    guard: 11, crouch: 12, crouchAdjust: 0.8, stagger: 15, hit: 15, secondStrike: null,
    attack: Object.freeze([9, 10, 13]),
    note: "11 fists-up guard; 12 is a deep squat drawn 1.33x oversized; 13 is a HIGH KICK; "
      + "15 is the arm-up flinch",
  }),
  commissioner: Object.freeze({
    guard: 12, crouch: 12, crouchAdjust: 1, stagger: null, hit: 12, down: 15, secondStrike: 13,
    attack: Object.freeze([8, 9, 10, 11, 14]),
    // v2.9 final round (R8) — CANE CONTINUITY. Read cell by cell at 1:1 this
    // round: on his base sheet EXACTLY TWO cells are cane-less, 13 and 15 —
    // and they were his `stagger` and his `hit`, i.e. the two cells the whole
    // reaction ladder was built out of. Every standing reaction therefore
    // blinked the cane out of his hand and back: base idle (cane) -> motion:8
    // (NO cane) -> motion3:7 (cane) -> motion2:9 (cane) -> base:13 (NO cane)
    // -> base:12 (cane). The cane is the character.
    //
    // The standing recoil is now 12, the cane brace — the only upright,
    // non-attack, cane-carrying drawing the sheet has — and `stagger` is null
    // so the ladder never reaches for 13 either. `down` keeps 15: a man
    // knocked flat on his back has dropped his cane, and that reads fine.
    // 13 stays as `secondStrike`, a documented slot nothing consumes today.
    // 10 joins the attack set — it raises the cane across the body, the same
    // prop-in-action class as 8/9/11/14 and the same omission ali's 8 was.
    note: "12 is a standing cane brace and carries the standing recoil; 13 and 15 are the ONLY "
      + "cane-less cells on the sheet — 15 is the knockdown (`down`), 13 is reachable by nothing",
  }),
  cyraxx: Object.freeze({
    guard: 11, crouch: 12, crouchAdjust: 1, stagger: 8, hit: 15, secondStrike: null,
    attack: Object.freeze([9, 10, 13, 14]),
    note: "12 is a genuine crouch at the right scale; 13 is an airborne tuck. Base walk carries "
      + "keyed energy flecks the motion2 bank was deliberately generated without",
  }),
});

/** The semantic roles for one fighter's base bank, defaults filled in. */
export function baseCellRoles(fighterId) {
  const entry = BASE_CELL_ROLES[fighterId];
  if (!entry) return DEFAULT_BASE_ROLES;
  return {
    ...DEFAULT_BASE_ROLES,
    ...entry,
    idle: entry.idle || DEFAULT_BASE_ROLES.idle,
    walk: entry.walk || DEFAULT_BASE_ROLES.walk,
    unusable: entry.unusable || DEFAULT_BASE_ROLES.unusable,
    swap: entry.swap || DEFAULT_BASE_ROLES.swap,
  };
}

/** True when the base cell depicts a strike / baked VFX / airborne body. */
export function isBaseAttackCell(fighterId, frame) {
  return baseCellRoles(fighterId).attack.includes(frame);
}

/** True when the base cell must never draw for this fighter in ANY beat. */
export function isBaseUnusableCell(fighterId, frame) {
  return baseCellRoles(fighterId).unusable.includes(frame);
}

/**
 * The single choke point for the `unusable` swap: any resolved base-bank
 * frame that names an art-defect cell is routed to its nearest correct
 * neighbour. Applied inside resolveMotionPose, which EVERY consumer (both
 * renderers, the observers, the 3D bridge) already reads through — so
 * deathblow's tactical-trouser cell cannot be reached by any beat, present
 * or future.
 */
export function safeBaseFrame(fighterId, frame) {
  const swap = BASE_CELL_ROLES[fighterId]?.swap;
  const mapped = swap?.[frame];
  return Number.isInteger(mapped) ? mapped : frame;
}

/**
 * Uniform draw-scale correction for one resolved cell. Bank-1/2 sheets carry
 * their own whole-sheet adjust (MOTION_SHEET_ADJUST in the renderers); this
 * is the PER-CELL correction the base bank needs (the oversized deep-squat
 * crouch cells and the T4 walk-scale pop) plus, since 3.0, the unified bank's
 * own idle/walk height reconciliation. Both renderers multiply renderSize by
 * it, exactly as they already do for the sheet adjust.
 */
export function baseCellDrawAdjust(fighterId, bank, frame) {
  if (bank === UNIFIED_EXT2_BANK) return UNIFIED_EXT2_CELL_ADJUST[fighterId]?.[frame] || 1;
  if (bank === UNIFIED_EXT3_BANK) return UNIFIED_EXT3_CELL_ADJUST[fighterId]?.[frame] || 1;
  if (bank === UNIFIED_EXT4_BANK) return UNIFIED_EXT4_CELL_ADJUST[fighterId]?.[frame] || 1;
  if (bank === UNIFIED_EXT5_BANK) return UNIFIED_EXT5_CELL_ADJUST[fighterId]?.[frame] || 1;
  if (bank === UNIFIED_EXT_BANK) return UNIFIED_EXT_CELL_ADJUST[fighterId]?.[frame] || 1;
  if (bank === UNIFIED_BANK) return UNIFIED_CELL_ADJUST[fighterId]?.[frame] || 1;
  if (bank !== "base") return 1;
  const roles = BASE_CELL_ROLES[fighterId];
  if (!roles) return BASE_WALK_ADJUST[fighterId]?.[frame] || 1;
  if (frame === roles.crouch) return roles.crouchAdjust || 1;
  return BASE_WALK_ADJUST[fighterId]?.[frame] || 1;
}

// ---------------------------------------------------------------------------
// v3.0 critic round (B1) — THE IDLE<->WALK HEIGHT POP.
//
// The 3.0 wave shipped `cellDrawAdjust` returning 1 for every unified cell "by
// design", on the reasoning that one sheet generated in one pass at one global
// scale needs no per-cell correction. The scale is indeed global; the DRAWING
// is not. Every unified sheet paints the idle as a settled wide fighting
// stance with the knees bent and paints the four walk keys as an upright
// figure mid-stride, so inside one self-consistent sheet the two beats differ
// in CONTENT HEIGHT. Measured at 1:1 (opaque pixels, alpha >= 24, floor row
// 315), walk keys against that fighter's own unified idle:
//
//   deathblow  idle 272  walk 298/306/300/305   +9.6 .. +12.5%
//   jez        idle 271  walk 306/306/300/300  +10.7 .. +12.9%
//   alan       idle 274  walk 306/306/303/305  +10.6 .. +11.7%
//   post       idle 279  walk 295/294/294/290   +3.9 ..  +5.7%
//   donald     idle 261  walk 286/289/289/285   +9.2 .. +10.7%
//   devil      idle 283  walk 303/303/306/303   +7.1 ..  +8.1%
//   ali        idle 271  walk 303/306/303/301  +11.1 .. +12.9%
//   benny      idle 279  walk 306/306/305/303   +8.6 ..  +9.7%
//   comm.      idle 278  walk 303/306/302/306   +8.6 .. +10.1%
//
// That is a 4-13% size change in ONE TICK, every time a fighter starts or
// stops walking — landing on the exact transition this whole bank exists to
// perfect. The costume is finally stable across it and the fighter changed
// SIZE instead.
//
// The IDLE is the anchor, for three independent reasons: it is the sheet's own
// U1 reference cell, it is what WAKEUP_RISE_HEIGHT.standUnified was measured
// on, and it is what the 2.9 precedent does (BASE_WALK_ADJUST lands each walk
// cell on the fighter's own idle height). So the four walk keys are corrected
// ONTO the idle, and nothing else on the sheet is touched.
//
// Only cells that depict an UPRIGHT STANDING figure are candidates, and of
// those only the walk keys need anything: guard measures -2.3..+3.0% of the
// idle and light-hit +0.0..+4.8%, both inside the 5% deadband the T4 table
// uses. crouch (-26..-43%), crouch-trans (-4.8..-20.5%), jump-tuck, stagger,
// big-hit and knockdown are legitimately shorter drawings and are deliberately
// left alone — normalising those would flatten the poses, not the pop.
//
// Unlike T4 the correction is applied to ALL FOUR keys whenever ANY of them is
// outside the deadband (post's cycle spans 3.9-5.7%): correcting only the
// out-of-band keys would flatten the idle->walk step and leave a smaller pop
// INSIDE the cycle. All nine sheets need it; all nine land within 0.05%.
// ---------------------------------------------------------------------------
// v4.0 — RE-MEASURED, because the sheets under this table CHANGED.
//
// The 4.0 art wave redrew jez, alan, benny and the commissioner at 24 cells and
// was correctly asset-only, so it could not touch this file. That left four
// fighters wearing a correction fitted to sheets that no longer exist. Measured
// on the sheets actually in the repo (opaque pixels, alpha >= 24, cell of 320),
// the stale table was UNDERSHOOTING every one of them — benny's contact key
// drew 3.3% below his idle and the commissioner's second contact 4.7% below —
// i.e. the idle<->walk height pop B1 removed had quietly re-opened in the other
// direction. The five holdout fighters keep their 3.0 sheets byte-identically
// and their rows here are therefore untouched and still correct.
//
// The rule is unchanged: every key of the walk cycle is corrected onto that
// fighter's own idle, all keys whenever any one of them leaves the 5% deadband.
// All four re-measured fighters land within 0.4% of their idle.
const UNIFIED_CELL_ADJUST = Object.freeze({
  deathblow: Object.freeze({ 1: 0.913, 2: 0.889, 3: 0.907, 4: 0.892 }),
  jez: Object.freeze({ 1: 0.908, 2: 0.917, 3: 0.905, 4: 0.936 }),
  alan: Object.freeze({ 1: 0.904, 2: 0.895, 3: 0.904, 4: 0.907 }),
  post: Object.freeze({ 1: 0.946, 2: 0.949, 3: 0.949, 4: 0.962 }),
  donald: Object.freeze({ 1: 0.913, 2: 0.903, 3: 0.903, 4: 0.916 }),
  devil: Object.freeze({ 1: 0.934, 2: 0.934, 3: 0.925, 4: 0.934 }),
  // v4.1: re-measured on his 24-cell sheet. His new idle is a much taller
  // drawing (271 -> 294), so the 4.0 row was over-correcting every key by
  // ~7.5%. His cycle is the tightest on the roster after the correction —
  // +1.4% to +4.1% raw — so only key 1 leaves the 3% deadband, and all four
  // are corrected anyway: that is the rule this table has always used, and
  // correcting only key 1 would leave a 2.7% pop INSIDE his stride.
  ali: Object.freeze({ 1: 0.977, 2: 0.977, 3: 0.997, 4: 0.980 }),
  benny: Object.freeze({ 1: 0.943, 2: 0.943, 3: 0.933, 4: 0.912 }),
  commissioner: Object.freeze({ 1: 0.947, 2: 0.938, 3: 0.966, 4: 0.950, 7: 1.067 }),
  // cyraxx's cycle is the tightest on the roster at +3.0% to +3.4%, but the
  // contract is `raw deviation over 3% must draw within 1% of the idle`, so he
  // is corrected like everyone else rather than left just over the line.
  cyraxx: Object.freeze({ 1: 0.970, 2: 0.967, 3: 0.970, 4: 0.970, 7: 1.053 }),
});

/**
 * v4.0 — the same reconciliation for the EXT sheet, indexed by SHEET FRAME.
 *
 * Only the two walk in-betweens need one: they are the other half of the same
 * upright mid-stride cycle and measure +1.0% to +7.9% of their fighter's idle.
 * They are corrected onto the idle exactly like cells 1-4, so the six-key cycle
 * is height-flat all the way round instead of pulsing twice per stride on the
 * two new drawings.
 *
 * Nothing else on the ext sheet is corrected, for the 3.0 reasons: the idle
 * breathe IS the idle (within 1.1% on all four), and the ascent, descent,
 * chambers and mid-reaction are legitimately different body plans — an airborne
 * figure is not a standing one, and normalising those flattens the pose rather
 * than the pop.
 */
const UNIFIED_EXT_CELL_ADJUST = Object.freeze({
  jez: Object.freeze({ 1: 0.926, 2: 0.936 }),
  alan: Object.freeze({ 1: 0.935, 2: 0.945 }),
  benny: Object.freeze({ 1: 0.952, 2: 0.959 }),
  // THE COMMISSIONER'S WHOLE-SHEET CORRECTION LIVES HERE, and it is the one
  // entry in this table that is not a height reconciliation.
  //
  // He is the single fighter with a UNIFIED_SHEET_ADJUST (1.033): his older
  // base atlas normalises to the full cell where every other fighter's
  // standing cells are 305-306, so his unified sheet is drawn 3.3% larger. The
  // ext sheet is the SAME generation at the SAME global scale, so it needs the
  // identical correction — and without it his idle would pulse 3.2% every
  // eight ticks as it alternates 0 <-> 16, and his walk twice per stride.
  //
  // It is folded in HERE rather than added to `bankSheetAdjust` because the
  // per-cell adjust is the only correction channel BOTH renderers read for
  // this bank: CINEMA 3D's sheet-adjust chain tests `bankName === UNIFIED_BANK`
  // and has no ext branch, so a sheet-level fix would land on the 2D canvas
  // only and the two renderers would draw him at different sizes. Both call
  // `cellDrawAdjust` for every bank, so this reaches both.
  //
  // DO NOT also add an ext branch to bankSheetAdjust without removing this —
  // the two would multiply. game.js carries the same warning at that function.
  //
  // 1.033 flat: his two walk in-betweens measure +1.0% and -1.7% of his idle,
  // inside the correction band, so neither carries a height term on top.
  commissioner: Object.freeze({
    0: 1.033, 1: 1.033, 2: 1.033, 3: 1.033,
    4: 1.033, 5: 1.033, 6: 1.033, 7: 1.033,
  }),
  // cyraxx needs a height term for 17 (+3.0%) and none for 18 (+0.3%), and has
  // no sheet adjust.
  cyraxx: Object.freeze({ 1: 0.970 }),
  // v4.1: ali's two in-betweens both measure 303px against a 294px idle
  // (+3.06% each), so both take the same term. He has NO sheet adjust, so
  // nothing is folded in here beyond the height reconciliation — see the
  // commissioner's block above for the one entry that is not a height term.
  ali: Object.freeze({  }),
  // v5.2 — THE FOUR 4.0 HOLDOUTS, on ext sheets composed from a two-take
  // second generation (tools/swing/install_ext8.py; MOTION-ATLAS v5.2). Each
  // sheet was resampled ONCE at build time so its breathing idle lands on the
  // fighter's unified idle, so no sheet-level term is folded in here: the
  // rows below are the same height reconciliation the 4.0 rows carry.
  // deathblow's two walk-downs measure 290px against a 272px idle (+6.6%
  // each) and take the same term; post's (-1.8%/-2.2%) and donald's
  // (0.0%/-1.9%) sit inside the band.
  deathblow: Object.freeze({ 1: 0.938, 2: 0.938 }),
  post: Object.freeze({  }),
  donald: Object.freeze({  }),
  // The devil's walk-down A is 280px wide with its wings and tail; at his
  // sheet factor the slicer's fit rule trims it 0.6% to keep it inside the
  // cell, and this draws it back (the ext3/ext4 convention). His height
  // terms are inside the band (-2.1%/-1.8%).
  devil: Object.freeze({ 1: 1.0056 }),
});

/**
 * Audit hook for B1: the measured raw content height of every unified cell,
 * and the drawn height once UNIFIED_CELL_ADJUST is applied. The contract test
 * asserts idle and the four walk keys agree once corrected.
 */
export const UNIFIED_CELL_HEIGHT = Object.freeze({
  deathblow: Object.freeze([272, 298, 306, 300, 305, 180, 259, 279, 278, 145, 250, 268, 272, 241, 212, 99]),
  // v4.0: re-measured on the redrawn 24-cell sheets.
  jez: Object.freeze([277, 305, 302, 306, 296, 218, 241, 271, 300, 168, 261, 260, 267, 277, 282, 70]),
  alan: Object.freeze([274, 303, 306, 303, 302, 210, 226, 265, 297, 158, 249, 259, 267, 281, 266, 98]),
  post: Object.freeze([279, 295, 294, 294, 290, 177, 246, 273, 283, 166, 273, 284, 292, 306, 248, 107]),
  donald: Object.freeze([261, 286, 289, 289, 285, 193, 243, 255, 306, 157, 245, 251, 266, 256, 230, 122]),
  devil: Object.freeze([283, 303, 303, 306, 303, 191, 242, 284, 292, 176, 266, 268, 294, 296, 254, 123]),
  // v4.1: re-measured on the 24-cell sheet that replaced his 3.0 one.
  ali: Object.freeze([299, 306, 306, 300, 305, 207, 266, 292, 296, 178, 282, 276, 290, 274, 225, 70]),
  benny: Object.freeze([279, 296, 296, 299, 306, 195, 216, 274, 310, 149, 264, 248, 279, 271, 272, 73]),
  commissioner: Object.freeze([287, 303, 306, 297, 302, 196, 235, 269, 313, 171, 273, 261, 270, 273, 275, 86]),
  cyraxx: Object.freeze([296, 305, 306, 305, 305, 207, 253, 281, 315, 150, 282, 278, 287, 268, 292, 72]),
});

/**
 * v4.0 — the same audit hook for the EXT sheet, by SHEET FRAME. The contract
 * test asserts the two walk in-betweens land on the fighter's own idle once
 * UNIFIED_EXT_CELL_ADJUST is applied, exactly as cells 1-4 do.
 */
export const UNIFIED_EXT_CELL_HEIGHT = Object.freeze({
  jez: Object.freeze([278, 299, 296, 284, 250, 265, 279, 233]),
  alan: Object.freeze([274, 293, 290, 309, 289, 262, 270, 245]),
  benny: Object.freeze([282, 293, 291, 288, 271, 264, 291, 202]),
  commissioner: Object.freeze([287, 290, 282, 320, 315, 263, 284, 241]),
  cyraxx: Object.freeze([294, 305, 297, 290, 297, 280, 290, 247]),
  ali: Object.freeze([297, 300, 296, 264, 302, 292, 302, 269]),
  // v5.2: measured on the composed ext8 sheets (alpha >= 24, after the
  // per-sheet resample that puts frame 0 on the idle: deathblow 272, post
  // 279, donald 261, devil 283).
  deathblow: Object.freeze([273, 290, 290, 283, 285, 274, 277, 281]),
  post: Object.freeze([280, 274, 273, 288, 274, 265, 282, 269]),
  donald: Object.freeze([261, 261, 256, 243, 261, 254, 257, 256]),
  devil: Object.freeze([283, 277, 278, 302, 270, 279, 285, 281]),
});

/** Drawn (corrected) content height of a unified cell, in cell pixels. */
export function unifiedDrawnHeight(fighterId, cell) {
  const raw = UNIFIED_CELL_HEIGHT[fighterId]?.[cell];
  return Number.isFinite(raw) ? raw * baseCellDrawAdjust(fighterId, UNIFIED_BANK, cell) : 0;
}

/** Drawn (corrected) content height of an ext cell, by SHEET FRAME. */
export function unifiedExtDrawnHeight(fighterId, frame) {
  const raw = UNIFIED_EXT_CELL_HEIGHT[fighterId]?.[frame];
  return Number.isFinite(raw) ? raw * baseCellDrawAdjust(fighterId, UNIFIED_EXT_BANK, frame) : 0;
}

// v4.9 IN-BETWEENS: measured on the built ext2 sheets (alpha >= 24 content
// height per cell). Every cell is registered like the unified bank — feet on
// row 314, torso band on column 160 — so no height reconciliation is needed;
// the ADJUST table restores the size of the wide wind-ups the slicer had to
// fit into the cell, with the commissioner's 1.033 sheet correction folded in
// per cell exactly as the ext table does (bankSheetAdjust must not branch).
export const UNIFIED_EXT2_CELL_HEIGHT = Object.freeze({
  deathblow: Object.freeze([303, 306, 313, 313, 299, 269, 302, 255, 204, 199, 190, 188, 247, 245, 277, 284]),
  jez: Object.freeze([305, 306, 313, 305, 296, 213, 291, 300, 213, 208, 189, 202, 300, 269, 294, 303]),
  alan: Object.freeze([306, 303, 313, 306, 299, 271, 309, 303, 214, 191, 145, 184, 300, 264, 293, 302]),
  post: Object.freeze([306, 303, 307, 303, 274, 278, 306, 305, 202, 190, 192, 177, 251, 256, 278, 283]),
  benny: Object.freeze([306, 306, 313, 313, 294, 267, 295, 283, 185, 185, 158, 189, 275, 275, 275, 278]),
  donald: Object.freeze([299, 306, 312, 303, 284, 243, 295, 295, 218, 203, 210, 185, 285, 284, 291, 285]),
  cyraxx: Object.freeze([306, 306, 313, 313, 287, 263, 305, 296, 189, 187, 173, 186, 279, 279, 279, 279]),
  ali: Object.freeze([306, 298, 301, 301, 276, 273, 303, 290, 193, 186, 161, 183, 285, 262, 258, 285]),
  commissioner: Object.freeze([303, 306, 303, 307, 273, 257, 297, 297, 188, 181, 159, 184, 261, 265, 263, 267]),
  devil: Object.freeze([305, 305, 311, 302, 253, 241, 295, 263, 191, 203, 210, 206, 305, 273, 269, 306]),
});

const UNIFIED_EXT2_CELL_ADJUST = Object.freeze({
  deathblow: Object.freeze({ 3: 1.0086, 7: 1.1449, 12: 1.1364 }),
  jez: Object.freeze({ 2: 1.0263, 5: 1.2218, 10: 1.0408 }),
  alan: Object.freeze({ 4: 1.0041, 10: 1.2166 }),
  post: Object.freeze({ 4: 1.0813, 11: 1.0603, 12: 1.1234 }),
  benny: Object.freeze({ 2: 1.0248, 3: 1.0248, 6: 1.0091, 10: 1.2284 }),
  donald: Object.freeze({ 11: 1.0773, 12: 1.0213 }),
  cyraxx: Object.freeze({ 2: 1.0065, 3: 1.0065 }),
  ali: Object.freeze({  }),
  commissioner: Object.freeze({ 0: 1.033, 1: 1.033, 2: 1.033, 3: 1.033, 4: 1.033, 5: 1.033, 6: 1.033, 7: 1.033, 8: 1.033, 9: 1.033, 10: 1.0748, 11: 1.033, 12: 1.0516, 13: 1.033, 14: 1.033, 15: 1.033 }),
  devil: Object.freeze({ 4: 1.1131, 5: 1.0652, 7: 1.1124, 8: 1.0791, 10: 1.0376 }),
});

/** Drawn (corrected) content height of an ext2 cell, by SHEET FRAME. */
export function unifiedExt2DrawnHeight(fighterId, frame) {
  const raw = UNIFIED_EXT2_CELL_HEIGHT[fighterId]?.[frame];
  return Number.isFinite(raw) ? raw * baseCellDrawAdjust(fighterId, UNIFIED_EXT2_BANK, frame) : 0;
}

// v5.0 FULL SWING: measured on the built ext3/ext4 sheets (alpha >= 24).
export const UNIFIED_EXT3_CELL_HEIGHT = Object.freeze({
  deathblow: Object.freeze([258, 237, 251, 246, 179, 116, 208, 195, 202, 260, 199, 239, 189, 204, 220, 131]),
  jez: Object.freeze([296, 279, 296, 283, 188, 130, 222, 201, 209, 285, 188, 254, 205, 195, 270, 154]),
  alan: Object.freeze([272, 281, 287, 243, 206, 151, 222, 245, 200, 313, 194, 263, 193, 202, 270, 118]),
  post: Object.freeze([270, 287, 282, 270, 185, 115, 207, 229, 193, 288, 169, 247, 190, 218, 239, 133]),
  benny: Object.freeze([291, 303, 302, 283, 206, 118, 236, 233, 211, 237, 192, 260, 211, 230, 255, 138]),
  donald: Object.freeze([247, 250, 250, 248, 176, 112, 213, 190, 190, 233, 150, 230, 195, 225, 242, 148]),
  cyraxx: Object.freeze([291, 308, 310, 284, 225, 121, 235, 243, 227, 313, 197, 262, 216, 210, 250, 132]),
  commissioner: Object.freeze([299, 251, 313, 257, 211, 130, 264, 235, 233, 313, 202, 302, 221, 200, 197, 132]),
  devil: Object.freeze([247, 269, 272, 219, 179, 130, 242, 197, 226, 288, 192, 213, 215, 196, 269, 173]),
  ali: Object.freeze([281, 272, 298, 245, 192, 113, 233, 177, 218, 311, 193, 242, 201, 231, 176, 145]),
});
const UNIFIED_EXT3_CELL_ADJUST = Object.freeze({
  deathblow: Object.freeze({ 1: 1.0713, 3: 1.0329, 5: 1.4016, 7: 1.0827, 13: 1.0653, 15: 1.1515 }),
  jez: Object.freeze({ 1: 1.0506, 3: 1.0433, 5: 1.376, 7: 1.1238, 11: 1.0153, 13: 1.1256, 15: 1.1131 }),
  alan: Object.freeze({ 0: 1.0599, 1: 1.0357, 3: 1.1868, 5: 1.233, 9: 1.0031, 13: 1.181, 15: 1.2998 }),
  post: Object.freeze({ 0: 1.0628, 1: 1.0039, 3: 1.0735, 5: 1.35, 7: 1.0815, 11: 1.0339, 13: 1.0178, 14: 1.1449, 15: 1.2849 }),
  benny: Object.freeze({ 0: 1.0619, 3: 1.093, 5: 1.4479, 13: 1.0942, 15: 1.4104 }),
  donald: Object.freeze({ 5: 1.2782, 10: 1.1621, 14: 1.0067, 15: 1.1242 }),
  cyraxx: Object.freeze({ 0: 1.1034, 1: 1.0643, 3: 1.1195, 5: 1.599, 9: 1.114, 11: 1.112, 13: 1.1637, 14: 1.2013, 15: 1.4744 }),
  commissioner: Object.freeze({ 0: 1.1496, 1: 1.3531, 2: 1.0638, 3: 1.3196, 4: 1.0392, 5: 1.5821, 6: 1.1233, 7: 1.1545, 8: 1.033, 9: 1.1373, 10: 1.033, 11: 1.033, 12: 1.033, 13: 1.2103, 14: 1.5614, 15: 1.7152 }),
  devil: Object.freeze({ 0: 1.1058, 1: 1.0647, 3: 1.2217, 4: 1.0726, 5: 1.3871, 7: 1.2723, 11: 1.1923, 13: 1.0993, 15: 1.1129 }),
  ali: Object.freeze({ 0: 1.0904, 1: 1.1289, 3: 1.2476, 4: 1.0039, 5: 1.4499, 7: 1.2424, 11: 1.0634, 14: 1.6171, 15: 1.2697 }),
});
export const UNIFIED_EXT4_CELL_HEIGHT = Object.freeze({
  deathblow: Object.freeze([263, 278, 223, 261, 244, 248, 231, 160, 251, 169, 183, 195, 183, 206, 162, 105]),
  jez: Object.freeze([281, 292, 237, 253, 268, 272, 216, 258, 257, 140, 187, 201, 156, 243, 170, 76]),
  alan: Object.freeze([289, 291, 246, 270, 240, 258, 250, 278, 258, 177, 173, 208, 202, 239, 180, 108]),
  post: Object.freeze([272, 280, 238, 268, 261, 258, 242, 275, 259, 186, 171, 187, 166, 219, 221, 99]),
  benny: Object.freeze([310, 313, 246, 275, 246, 279, 274, 267, 252, 175, 174, 202, 189, 258, 142, 89]),
  donald: Object.freeze([244, 260, 228, 250, 239, 255, 173, 225, 229, 167, 183, 180, 177, 219, 147, 100]),
  cyraxx: Object.freeze([313, 313, 282, 290, 276, 306, 291, 300, 294, 185, 163, 177, 212, 246, 203, 101]),
  commissioner: Object.freeze([273, 312, 251, 279, 231, 287, 193, 281, 279, 169, 215, 181, 209, 244, 143, 97]),
  devil: Object.freeze([277, 277, 258, 225, 262, 261, 246, 268, 254, 177, 214, 189, 172, 225, 170, 103]),
  ali: Object.freeze([303, 306, 267, 270, 303, 313, 251, 263, 231, 194, 214, 165, 208, 250, 169, 83]),
});
const UNIFIED_EXT4_CELL_ADJUST = Object.freeze({
  deathblow: Object.freeze({ 3: 1.0171, 10: 1.0038, 11: 1.0554, 14: 1.0162 }),
  jez: Object.freeze({ 3: 1.019, 4: 1.0103, 6: 1.1112, 11: 1.0123, 12: 1.0777, 14: 1.0738, 15: 1.0164 }),
  alan: Object.freeze({ 3: 1.0563, 4: 1.1415, 6: 1.0011 }),
  post: Object.freeze({ 4: 1.0415, 8: 1.0202, 11: 1.1581, 14: 1.1129, 15: 1.0551 }),
  benny: Object.freeze({ 1: 1.0135, 3: 1.0649, 4: 1.1638, 8: 1.0817, 14: 1.1151, 15: 1.0924 }),
  donald: Object.freeze({ 4: 1.0433, 6: 1.094 }),
  cyraxx: Object.freeze({ 0: 1.0529, 1: 1.0623, 3: 1.1096, 4: 1.1547, 10: 1.2401, 11: 1.2768, 12: 1.005, 14: 1.1456, 15: 1.0911 }),
  commissioner: Object.freeze({ 0: 1.1028, 1: 1.033, 2: 1.033, 3: 1.15, 4: 1.2597, 5: 1.033, 6: 1.1071, 7: 1.033, 8: 1.0892, 9: 1.033, 10: 1.033, 11: 1.1814, 12: 1.033, 13: 1.033, 14: 1.1362, 15: 1.1658 }),
  devil: Object.freeze({ 3: 1.0696, 12: 1.03, 15: 1.0148 }),
  ali: Object.freeze({ 3: 1.1219, 5: 1.0052, 8: 1.1274, 11: 1.1899, 14: 1.0434, 15: 1.0326 }),
});

// v5.2 LOCOMOTION — the sixth sheet (unified-ext5, grammar cells 72-87):
// the dash in three drawings, the turnaround, the apex tuck and the descent,
// the air recover, an upright air hit, the power charge, two entrances, the
// victory, the taunt, a crouched guard flinch, the throw grab and the dizzy
// sway. Measured on the built sheets exactly as ext3/ext4 (opaque rows at
// alpha >= 24; feet on row 314 in all 160 cells). Built at the fighter's
// UNIFIED scale — ali at his own 1.3661, a 6x4 main sheet draws its figure
// smaller — and a wide cell (the dash stretch is a horizontal lunge on every
// sheet, 134-213 px tall) is fit-scaled about its torso column and drawn
// back up through the ADJUST table. The commissioner's rows fold his 1.033
// sheet factor into every cell, as his ext2/ext3/ext4 rows do, because
// bankSheetAdjust deliberately has no ext branch (see game.js).
//
// Registered by item one (sheet, gate, tables; nothing routed, so the trace
// could prove the drawing unchanged with the sheets accepted) and ROUTED by
// item two for the GROUND and BOOKEND cells: dashKeys / throwClinchKeys /
// crouchBlockstunKeys carry ext5 links ahead of their motion links,
// swingSubstitute maps the motion dash / charge / victory / signatures and
// the motion2 pivot / brake / seize / dizzy onto the sheet, and game.js emits
// the exit brake, the pivot, the entrance, the win and the taunt through
// unifiedExt5Pose. Item three (ext5-air) routes the AIR cells (4-7):
// jumpArcKeys carries the apex tuck / descent / air recover ahead of the
// motion3 and motion links under the `air` answer, and swingSubstitute maps
// the neutral airborne tuck, the attacker's trail, the air-tech tail and the
// carried juggle victim onto the sheet. All sixteen cells reach the screen.
// The four are airborne bodies anchored by CELL_BODY_CENTRE like every other
// airborne cell, so swingStandInAdjust stays 1 on them (no ground rung).
export const UNIFIED_EXT5_CELL_HEIGHT = Object.freeze({
  deathblow: Object.freeze([215, 211, 168, 254, 168, 259, 251, 194, 248, 253, 246, 260, 249, 197, 232, 244]),
  jez: Object.freeze([251, 184, 186, 291, 202, 285, 292, 236, 279, 292, 289, 292, 298, 233, 288, 292]),
  alan: Object.freeze([241, 186, 209, 279, 188, 263, 245, 196, 275, 279, 261, 290, 278, 212, 265, 286]),
  post: Object.freeze([249, 134, 206, 271, 173, 258, 267, 209, 256, 257, 258, 261, 256, 193, 256, 256]),
  benny: Object.freeze([232, 153, 201, 274, 201, 279, 291, 206, 289, 289, 281, 289, 281, 213, 278, 281]),
  donald: Object.freeze([232, 203, 209, 254, 171, 249, 247, 212, 261, 264, 235, 286, 260, 219, 245, 251]),
  cyraxx: Object.freeze([265, 183, 237, 313, 193, 302, 284, 244, 310, 313, 310, 313, 305, 272, 303, 310]),
  ali: Object.freeze([253, 173, 204, 301, 195, 281, 287, 221, 302, 306, 303, 306, 292, 242, 294, 301]),
  commissioner: Object.freeze([285, 213, 210, 310, 218, 309, 310, 236, 300, 300, 288, 303, 305, 242, 284, 302]),
  devil: Object.freeze([217, 173, 226, 269, 250, 273, 265, 221, 274, 280, 261, 285, 291, 209, 276, 272]),
});
const UNIFIED_EXT5_CELL_ADJUST = Object.freeze({
  deathblow: Object.freeze({ 1: 1.0593, 2: 1.1155 }),
  jez: Object.freeze({ 1: 1.1832, 2: 1.26 }),
  alan: Object.freeze({ 1: 1.1676, 2: 1.0815 }),
  post: Object.freeze({ 1: 1.2842, 2: 1.03 }),
  benny: Object.freeze({ 0: 1.0589, 1: 1.2909 }),
  donald: Object.freeze({ 1: 1.0128 }),
  cyraxx: Object.freeze({ 1: 1.271, 2: 1.1833, 3: 1.0012, 6: 1.0304, 9: 1.0012, 11: 1.0294 }),
  ali: Object.freeze({ 1: 1.2633, 2: 1.1463 }),
  commissioner: Object.freeze({ 0: 1.033, 1: 1.0968, 2: 1.1554, 3: 1.033, 4: 1.033, 5: 1.033, 6: 1.033, 7: 1.067, 8: 1.033, 9: 1.033, 10: 1.0697, 11: 1.033, 12: 1.033, 13: 1.033, 14: 1.0793, 15: 1.033 }),
  devil: Object.freeze({ 0: 1.1078, 1: 1.2516 }),
});

// ---------------------------------------------------------------------------
// v5.1 EXT4 ROUTING — THE STAND-IN HEIGHT RECONCILIATION, and the M4 size pop
// the 5.0 guard flinch re-opened.
//
// 5.0 substituted the authored block flinch (motion2:8) with the ext4 guard
// flinch at draw time and left guardFlinchAdjust matching motion2:8 against
// the guard — so the cell that ACTUALLY drew got no reconciliation at all,
// and the function floors at 1 so it could not have shrunk one anyway.
// Measured on the sheets in the repo (UNIFIED_EXT4_CELL_HEIGHT x its ADJUST
// against unifiedDrawnHeight(guard), on screen, the commissioner's 1.033
// sheet correction on both sides):
//
//   benny   310 : 274  +13.1%      cyraxx  330 : 296  +11.4%
//   alan    289 : 265   +9.1%      ali     303 : 292   +3.8%
//   jez     281 : 271   +3.7%      commissioner 301 : 296  +1.5%
//   deathblow 263 : 279 -5.7%      donald  244 : 255   -4.3%
//
// The 2.9 critic finding M4 was written for says a 15% one-tick height step
// "reads as the character changing size"; the 3.0 note warned against
// exactly this sign flip. The ext4 flinch is an UPRIGHT figure where the
// unified guard is the settled knees-bent stance — the same content-height
// gap the walk keys have against the idle, and it takes the same cure: land
// the stand-in on the drawn height of the cell it replaces. 3% deadband (the
// honest measurement noise of a hand-painted sheet), clamped to 0.80..1.22,
// the same cap philosophy as every other correction in this file.
//
// The rule generalises to the reaction cells this wave routes for the first
// time, and it is per PLAN, not per cell:
//   MATCH    stand-ins whose body plan is the plan of the rung they replace
//            are matched onto it in both directions — ext4:0 guard flinch
//            onto unified:7, ext4:1 head snap onto unified:12 (an upright
//            recoil; measured +9.4 jez, +13.7 benny, +15.9 cyraxx, +15.6
//            commissioner, +9.0 alan against the light hit), ext3:12 crouch
//            guard onto unified:5 (a crouch; -8.1 alan .. +12.8 commissioner).
//   CEILING  stand-ins of a DIFFERENT plan — the body blow (doubled over),
//            the big hit (arched, at a depth that differs per drawing) and
//            the stagger (a backward reel where several unified staggers are
//            a forward fold) — are legitimately different heights, and
//            forcing them onto the rung would flatten the pose, not the pop
//            (the 3.0 reasoning for leaving crouch/stagger/big-hit alone).
//            They are only ever brought DOWN to the fighter's own idle: a
//            struck fighter does not grow, and growth is the direction every
//            reported pop had. cyraxx's big hit (+8.7% of his idle) and reel
//            (+7.7%) and the commissioner's big hit (+8.2%) take it; the body
//            blow is shorter than the idle on every sheet and takes nothing.
//
// Applied through cellDrawAdjust like the flinch reconciliation, so both
// renderers read one number per cell. The floor-bounce and air-hit cells are
// not here because they are not routed (see swingSubstitute).
// ---------------------------------------------------------------------------

/**
 * game.js applies UNIFIED_SHEET_ADJUST to the unified bank at draw time and
 * the ext tables above fold the same number into every commissioner cell, so
 * an on-screen comparison between a unified rung and its ext stand-in has to
 * put it on the unified side. Mirrors game.js; the contract test pins both.
 */
export const UNIFIED_SHEET_FOLD = Object.freeze({ commissioner: 1.033 });
export const SWING_STAND_IN_DEADBAND = 0.03;
export const SWING_STAND_IN_CLAMP = Object.freeze({ min: 0.80, max: 1.22 });

// SWING_STAND_IN_TARGET (which rung each stand-in reconciles to, and how) is
// declared beside SWING_BANKS below: it keys on the bank names, which are
// declared there, and a module-level literal cannot read them earlier.

/** Drawn (fit-restored) content height of an ext3/ext4/ext5 cell, by SHEET FRAME. */
export function swingDrawnHeight(fighterId, bank, frame) {
  const table = bank === UNIFIED_EXT4_BANK ? UNIFIED_EXT4_CELL_HEIGHT
    : bank === UNIFIED_EXT3_BANK ? UNIFIED_EXT3_CELL_HEIGHT
      : bank === UNIFIED_EXT5_BANK ? UNIFIED_EXT5_CELL_HEIGHT : null;
  const raw = table?.[fighterId]?.[frame];
  return Number.isFinite(raw) ? raw * baseCellDrawAdjust(fighterId, bank, frame) : 0;
}

/** On-screen drawn height of a unified main cell, sheet correction included. */
export function unifiedScreenHeight(fighterId, cell) {
  return unifiedDrawnHeight(fighterId, cell) * (UNIFIED_SHEET_FOLD[fighterId] || 1);
}

/**
 * The reconciliation a routed ext3/ext4 reaction stand-in takes on top of its
 * fit-restore adjust. 1 for every cell that is not a routed stand-in, inside
 * the deadband, or (ceiling mode) already no taller than the idle.
 */
export function swingStandInAdjust(fighterId, bank, frame) {
  const target = SWING_STAND_IN_TARGET[bank]?.[frame];
  if (!target) return 1;
  const drawn = swingDrawnHeight(fighterId, bank, frame);
  const goal = unifiedScreenHeight(fighterId, target.cell);
  if (!(drawn > 0) || !(goal > 0)) return 1;
  const ratio = goal / drawn;
  if (target.mode === "ceiling" && ratio >= 1 - SWING_STAND_IN_DEADBAND) return 1;
  if (target.mode === "match" && Math.abs(ratio - 1) <= SWING_STAND_IN_DEADBAND) return 1;
  return Math.min(SWING_STAND_IN_CLAMP.max, Math.max(SWING_STAND_IN_CLAMP.min, ratio));
}

// ---------------------------------------------------------------------------
// v2.9 final round (T4) — THE BASE WALK SCALE POP.
//
// baseCellDrawAdjust corrected exactly one cell per fighter, the oversized
// deep-squat crouch. Nothing corrected the WALK cells, and they are not all
// drawn at the same scale either. Measured content height (opaque pixels,
// alpha >= 24) of base cells 4-7 against the mean of that fighter's four idle
// cells 0-3, at 1:1, this round:
//
//   donald        4:305  5:306  6:250  7:306   — cell 6 is -18.3%
//   devil         4:274  5:273  6:273  7:268   — the WHOLE cycle is -9..-11%
//   commissioner  4:299  5:287  6:280  7:248   — a -5% to -21% RAMP
//   alan          4:291  5:305  6:305  7:305   — -4.6%, under the gate
//   everyone else within +-1.4%
//
// donald's is the one the critics caught: he loses a fifth of his height for
// 100ms, once per walk cycle, every cycle. The devil's and the commissioner's
// were never reported because they are steady across the cycle rather than a
// one-cell pop, but they are the same defect — the fighter is a different size
// while walking than while standing.
//
// Corrections land each cell on the fighter's own idle height and are CAPPED
// at 1.25, the same cap philosophy the crouch and guard-flinch corrections
// use; the commissioner's cell 7 wants 1.27 and takes the cap. Cells within
// 5% of the idle height are left alone — that is inside the honest measurement
// noise of a hand-painted sheet.
//
// NOT FIXED HERE, and deliberately: donald's base walk draws the SAME LEAD LEG
// in all four cells — a moonwalk. That is the known base-bank single-phase
// defect (assets/walk/MANIFEST.json `gate` documents the negative control that
// catches it), it is an ART problem, and no draw-scale table can touch it.
// ---------------------------------------------------------------------------
const BASE_WALK_ADJUST = Object.freeze({
  donald: Object.freeze({ 6: 1.224 }),
  devil: Object.freeze({ 4: 1.099, 5: 1.103, 6: 1.103, 7: 1.123 }),
  commissioner: Object.freeze({ 5: 1.096, 6: 1.123, 7: 1.25 }),
});

// ---------------------------------------------------------------------------
// v2.9 critic round 2 (M4) — GUARD / BLOCK-HIT STANCE RECONCILIATION.
//
// The standing guard cell and the authored block-flinch are different
// generations at different scales, and a blocked hit cuts between them with no
// in-between. Measured content heights at 1:1 (opaque pixels, alpha >= 24):
//
//   ali        guard base:9  305px   block-hit motion2:8  259px   -15.1%
//   jez        guard base:11 305px   block-hit motion2:8  255px   -16.4%
//   donald     guard base:0  306px   block-hit motion2:8  265px   -13.4%
//   post       guard base:11 306px   block-hit motion2:8  263px   -14.1%
//
// The flinch SHOULD compress a little — he is absorbing a blow — but a 15%
// height step in one tick reads as the character changing size, which is what
// the critics saw. The correction takes the flinch back to the guard's height
// and is capped: the same mechanism, and the same cap philosophy, as the
// oversized-crouch correction above.
// ---------------------------------------------------------------------------

const GUARD_FLINCH_ADJUST = Object.freeze({
  deathblow: 1.10, jez: 1.20, alan: 1.09, post: 1.16, donald: 1.16,
  devil: 1.08, ali: 1.18, benny: 1.11, commissioner: 1.03, cyraxx: 1.05,
});

// ---------------------------------------------------------------------------
// v3.0 — THE GUARD-FLINCH TARGET MOVED, so the 2.9 correction had to be
// re-derived rather than kept. This is the one 2.9 workaround the unified bank
// genuinely invalidates.
//
// M4's numbers reconcile the authored block-flinch (motion2:8) against the
// STANDING GUARD CELL. For a unified fighter that cell is no longer
// base(roles.guard) — it is unified:7, which the unified sheets draw at their
// own settled-stance height rather than at the base bank's flat 305-306px.
// Measured content heights at 1:1 (opaque pixels, alpha >= 24) this wave,
// unified guard : motion2 block-hit, beside the 2.9 value that assumed the
// base guard:
//
//   jez           279 : 255  -> 1.094   (2.9 assumed 1.20)
//   devil         284 : 252  -> 1.127   (2.9 assumed 1.08)
//   ali           274 : 259  -> 1.058   (2.9 assumed 1.18)
//   benny         286 : 275  -> 1.040   (2.9 assumed 1.11)
//   post          273 : 263  -> 1.038   (2.9 assumed 1.16)
//   commissioner  279 : 279  -> 1.000   (2.9 assumed 1.03)
//   alan          276 : 282  -> 0.979   (2.9 assumed 1.09) -> clamped to 1
//   donald        255 : 265  -> 0.962   (2.9 assumed 1.16) -> clamped to 1
//
// Left uncorrected, jez's flinch would have drawn 255 * 1.20 = 306px against a
// 279px guard: the fighter GROWING 10% on a blocked hit, which is M4's own
// defect with the sign flipped. The floor stays 1 and the cap stays 1.22, the
// same philosophy the crouch and base-walk corrections use.
//
// `deathblow` and `cyraxx` are not on the bank and are not in this table, so
// they keep their 2.9 values through the default path.
// ---------------------------------------------------------------------------
// v4.0: re-measured as unified-guard-height / motion2:8-height on the sheets
// actually in the repo. The five untouched fighters reproduce their recorded
// numbers exactly, which is what confirms the rule; the four redrawn ones had
// drifted because their guard cell changed height with the redraw.
// v4.1: ali re-measured for the same reason — his unified guard cell grew from
// 274px to 294px with the redraw, so the 4.0 number would have let his blocked
// hit draw 7% SHORT of his own guard. 294 : 259 -> 1.135. The other eight
// reproduce their recorded values exactly on the sheets in the repo, which is
// what confirms the measurement rather than the number.
const UNIFIED_GUARD_FLINCH_ADJUST = Object.freeze({
  jez: 1.063, alan: 0.940, post: 1.038, donald: 0.962,
  devil: 1.127, ali: 1.127, benny: 0.996, commissioner: 1.029,
  cyraxx: 1.053,
});

/**
 * Scale correction that lands the authored guard flinch on the guard's height.
 * `options.unified` says this fighter's standing guard is drawing from the
 * unified sheet, which moves the target the flinch is being matched to.
 */
export function guardFlinchAdjust(fighterId, bank, frame, options = {}) {
  if (bank !== "motion2" || frame !== MOTION2_CELLS.blockHit) return 1;
  // A fighter with no unified row falls back to his 2.9 number rather than to
  // no correction at all: the two fighters off the bank are never passed
  // `unified: true` by either renderer, and if a future one ever is, keeping
  // M4's correction is the safe answer.
  const adjust = (options.unified === true ? UNIFIED_GUARD_FLINCH_ADJUST[fighterId] : undefined)
    ?? GUARD_FLINCH_ADJUST[fighterId];
  return Number.isFinite(adjust) ? Math.min(1.22, Math.max(1, adjust)) : 1;
}

/**
 * The ONE draw-scale correction a renderer needs for a resolved cell. Both
 * renderers call exactly this so the 2D canvas and the CINEMA 3D rig can never
 * disagree about how big a cell draws.
 *
 * v3.0: the unified sheets are ONE global scale each, normalised on the same
 * 306px standing convention motion2 uses and mutually registered by
 * construction, so no unified cell needs a per-cell correction — the whole
 * point of authoring the vocabulary in one pass. `options.unified` only
 * reaches the guard-flinch reconciliation, which compares a motion2 cell
 * against whichever bank is drawing the guard.
 */
export function cellDrawAdjust(fighterId, bank, frame, options = {}) {
  // v5.1: the third factor lands a routed ext3/ext4 reaction stand-in on the
  // height of the unified rung it draws instead of (guard flinch, head snap,
  // crouch guard) or under the idle (body blow, big hit, reel). 1 for every
  // other cell, so nothing measured before this wave moves.
  return baseCellDrawAdjust(fighterId, bank, frame)
    * guardFlinchAdjust(fighterId, bank, frame, options)
    * swingStandInAdjust(fighterId, bank, frame);
}

// ---------------------------------------------------------------------------
// v2.9 critic round (M5) — PER-CELL FLOOR REGISTRATION.
//
// Sprites are bottom-anchored: drawAtlasFrame lands the CELL's bottom edge on
// the floor line, which only plants the feet if every cell's content bottoms
// out at the same row. Measured across all three banks and all ten fighters,
// exactly one sheet breaks that: the COMMISSIONER's base atlas, an older
// generation whose content bottom wanders from 277 to 320 while every other
// sheet in the game sits at a flat 316.
//
// The visible cost was his walk. Base walk cells bottom at 303/294/298/286
// against motion2's 316, so at his ~387px render size his feet oscillated
// between 5px and 41px ABOVE the ground every ~6 ticks — he levitated while
// walking. Values are the downward shift in CELL pixels (of 320) that puts
// each cell's content on the same floor line as the rest of the game;
// negatives lift the two cells that overhang it. Both renderers apply it in
// the sprite transform only, so contact shadows stay planted.
// ---------------------------------------------------------------------------

const BASE_FLOOR_TARGET = 316;

export const CELL_FLOOR_OFFSET = Object.freeze({
  commissioner: Object.freeze({
    base: Object.freeze([0, -2, -3, -3, 13, 22, 18, 30, 38, 39, -4, 15, 25, 35, 3, 16]),
  }),
});

/** Downward shift, in cell pixels of 320, that plants this cell's content. */
export function cellFloorOffset(fighterId, bank, frame) {
  return CELL_FLOOR_OFFSET[fighterId]?.[bank]?.[frame] || 0;
}

/** Audit hook: the offsets are the measured deltas to one shared floor line. */
export function auditCellFloorOffsets() {
  const errors = [];
  for (const [fighterId, banks] of Object.entries(CELL_FLOOR_OFFSET)) {
    for (const [bank, offsets] of Object.entries(banks)) {
      if (offsets.length !== MOTION_CELL_COUNT) {
        errors.push(`${fighterId}/${bank}: ${offsets.length} entries, expected ${MOTION_CELL_COUNT}`);
      }
      offsets.forEach((value, index) => {
        if (!Number.isFinite(value) || Math.abs(value) > 64) {
          errors.push(`${fighterId}/${bank}[${index}]: ${value}`);
        }
      });
    }
  }
  return Object.freeze({ target: BASE_FLOOR_TARGET, errors: Object.freeze(errors) });
}

// ---------------------------------------------------------------------------
// v2.9 critic round 2 (B2) — AIRBORNE BODY-CENTRE ANCHORING.
//
// Every cell is FLOOR anchored: drawAtlasFrame lands the cell's bottom edge on
// the fighter's y, which is right for a figure standing on the street and
// WRONG for a figure in the air. Measured content centres (PIL, opaque pixels,
// alpha >= 24, one row per cell of 320, floor-registration folded in):
//
//   deathblow jump-rise (motion2:7) content centre row 174, height 281
//   deathblow tuck      (motion:5)  content centre row 238, height 156
//
// Both floor-anchored, so on the tick the ascent hands off to the tuck the
// body centre drops 64 cell px (~78 world px) and the HEAD drops 125 cell px
// (~152 world px, half a body height) — on the tick vy is most negative. The
// character visually plummets while he is rising fastest.
//
// The fix anchors airborne cells by BODY CENTRE instead of by feet: the cell
// is shifted so its content centroid sits where the standing reference's
// centroid sits. A tuck then brings the FEET UP to the chest, which is what a
// tuck is, and — because every airborne cell targets the SAME reference row —
// no airborne bank switch can move the body at all.
//
// Ground continuity is preserved by ramping the correction with height: the
// shift is zero on the floor and full by AIRBORNE_ANCHOR_RAMP_PX, so takeoff
// and touchdown stay feet-planted and the last ticks of a fall read as the
// legs reaching down for the street. Cells are addressed by measurement, so a
// future bank (motion3) inherits the behaviour by adding a row here.
// ---------------------------------------------------------------------------

/** Height above the floor, in world px, at which the anchor is fully applied. */
export const AIRBORNE_ANCHOR_RAMP_PX = 110;

/**
 * Measured content-centroid row (of 320) per cell per bank, with each sheet's
 * floor registration already folded in. `ref` is the fighter's standing
 * reference centroid (the mean of the four base idle cells).
 */
export const CELL_BODY_CENTRE = Object.freeze({
  deathblow: Object.freeze({
    base: Object.freeze([162, 162, 162, 162, 162, 162, 162, 162, 162, 163, 172, 162, 162, 162, 187, 162]),
    motion: Object.freeze([195, 187, 191, 163, 187, 238, 230, 238, 191, 231, 199, 224, 174, 160, 160, 164]),
    motion2: Object.freeze([171, 163, 164, 168, 187, 171, 186, 174, 177, 174, 176, 197, 201, 174, 212, 180]),
    motion3: Object.freeze([161, 158, 158, 158, 164, 188, 158, 166, -1, -1, -1, -1, -1, -1, -1, -1]),
    unified: Object.freeze([180, 170, 162, 166, 163, 226, 186, 177, 180, 247, 192, 184, 180, 199, 210, 270]),
    // v5.2: bbox midpoints of the composed ext8 sheet (install_ext8.py).
    "unified-ext": Object.freeze([178, 170, 170, 173, 172, 178, 176, 174]),
    "unified-ext2": Object.freeze([163, 162, 158, 158, 165, 180, 164, 187, 212, 215, 220, 220, 191, 192, 176, 172]),
    "unified-ext3": Object.freeze([186, 196, 189, 192, 225, 256, 210, 217, 214, 184, 215, 195, 220, 212, 204, 249]),
    "unified-ext4": Object.freeze([183, 176, 203, 184, 192, 190, 199, 234, 189, 230, 223, 217, 223, 212, 234, 262]),
    "unified-ext5": Object.freeze([207, 209, 230, 188, 230, 185, 189, 218, 190, 188, 192, 184, 190, 217, 198, 192]),
    ref: 162,
  }),
  jez: Object.freeze({
    base: Object.freeze([162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 170, 162, 162, 162, 162, 162]),
    motion: Object.freeze([187, 182, 189, 163, 179, 228, 220, 227, 197, 229, 198, 195, 175, 160, 160, 190]),
    motion2: Object.freeze([173, 163, 165, 169, 196, 174, 204, 186, 187, 181, 186, 211, 209, 172, 221, 206]),
    motion3: Object.freeze([182, 160, 158, 158, 182, 222, 168, 186, -1, -1, -1, -1, -1, -1, -1, -1]),
    unified: Object.freeze([176, 162, 164, 162, 166, 206, 194, 179, 164, 230, 184, 184, 181, 176, 174, 280]),
    "unified-ext": Object.freeze([176, 165, 166, 172, 190, 182, 175, 198]),
    "unified-ext2": Object.freeze([162, 162, 158, 162, 166, 208, 169, 164, 208, 210, 220, 214, 164, 180, 168, 164]),
    "unified-ext3": Object.freeze([166, 175, 166, 173, 220, 250, 204, 214, 210, 172, 220, 188, 212, 217, 180, 238]),
    "unified-ext4": Object.freeze([174, 168, 196, 188, 180, 178, 206, 186, 186, 244, 221, 214, 236, 193, 230, 276]),
    "unified-ext5": Object.freeze([189, 222, 222, 169, 214, 172, 168, 196, 175, 168, 170, 168, 166, 198, 170, 168]),
    ref: 162,
  }),
  alan: Object.freeze({
    base: Object.freeze([162, 162, 162, 162, 168, 161, 161, 161, 162, 199, 209, 162, 165, 162, 175, 163]),
    motion: Object.freeze([186, 188, 185, 163, 183, 231, 214, 242, 191, 233, 188, 200, 166, 160, 160, 191]),
    motion2: Object.freeze([171, 163, 163, 166, 186, 166, 189, 168, 175, 171, 178, 210, 200, 185, 212, 193]),
    motion3: Object.freeze([160, 158, 158, 161, 168, 214, 158, 172, -1, -1, -1, -1, -1, -1, -1, -1]),
    unified: Object.freeze([178, 163, 162, 163, 164, 210, 202, 182, 166, 236, 190, 185, 181, 174, 182, 266]),
    "unified-ext": Object.freeze([178, 168, 170, 160, 170, 184, 180, 192]),
    "unified-ext2": Object.freeze([162, 163, 158, 162, 165, 179, 160, 163, 208, 219, 242, 222, 164, 182, 168, 164]),
    "unified-ext3": Object.freeze([178, 174, 171, 193, 212, 239, 204, 192, 214, 158, 218, 183, 218, 214, 180, 256]),
    "unified-ext4": Object.freeze([170, 169, 192, 180, 196, 186, 190, 176, 186, 226, 228, 210, 214, 195, 224, 260]),
    "unified-ext5": Object.freeze([194, 222, 210, 175, 220, 183, 192, 216, 177, 175, 184, 170, 176, 208, 182, 172]),
    ref: 162,
  }),
  post: Object.freeze({
    base: Object.freeze([162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 184, 174]),
    motion: Object.freeze([177, 171, 186, 163, 175, 221, 223, 229, 196, 226, 182, 211, 158, 160, 164, 219]),
    motion2: Object.freeze([174, 163, 163, 163, 190, 166, 197, 170, 184, 181, 187, 196, 199, 190, 211, 183]),
    motion3: Object.freeze([172, 158, 158, 158, 176, 204, 158, 178, -1, -1, -1, -1, -1, -1, -1, -1]),
    unified: Object.freeze([176, 169, 170, 170, 172, 228, 192, 179, 178, 234, 179, 174, 170, 166, 192, 266]),
    "unified-ext": Object.freeze([176, 178, 179, 172, 178, 183, 174, 181]),
    "unified-ext2": Object.freeze([162, 163, 161, 163, 178, 176, 162, 162, 214, 220, 218, 226, 189, 186, 176, 173]),
    "unified-ext3": Object.freeze([180, 171, 174, 180, 222, 257, 211, 200, 218, 170, 230, 191, 220, 206, 195, 248]),
    "unified-ext4": Object.freeze([178, 174, 196, 180, 184, 186, 194, 177, 185, 222, 229, 221, 232, 205, 204, 265]),
    "unified-ext5": Object.freeze([190, 248, 212, 179, 228, 186, 181, 210, 186, 186, 186, 184, 186, 218, 186, 186]),
    ref: 162,
  }),
  donald: Object.freeze({
    base: Object.freeze([162, 162, 162, 162, 161, 162, 190, 162, 162, 162, 208, 169, 162, 161, 205, 162]),
    motion: Object.freeze([184, 185, 185, 163, 185, 227, 225, 207, 187, 235, 209, 185, 179, 171, 158, 163]),
    motion2: Object.freeze([175, 163, 162, 169, 197, 172, 196, 181, 183, 175, 188, 202, 197, 191, 209, 200]),
    motion3: Object.freeze([176, 158, 158, 158, 178, 203, 164, 184, -1, -1, -1, -1, -1, -1, -1, -1]),
    unified: Object.freeze([185, 176, 171, 175, 173, 219, 194, 188, 166, 238, 194, 191, 184, 190, 202, 258]),
    "unified-ext": Object.freeze([184, 184, 186, 193, 184, 188, 186, 186]),
    "unified-ext2": Object.freeze([165, 162, 158, 163, 172, 193, 167, 167, 206, 213, 210, 222, 172, 172, 169, 172]),
    "unified-ext3": Object.freeze([191, 190, 190, 190, 226, 258, 208, 220, 220, 198, 240, 200, 217, 202, 194, 240]),
    "unified-ext4": Object.freeze([192, 184, 200, 190, 195, 187, 228, 202, 200, 231, 223, 224, 226, 205, 241, 264]),
    "unified-ext5": Object.freeze([198, 213, 210, 188, 229, 190, 191, 208, 184, 182, 197, 172, 184, 205, 192, 189]),
    ref: 162,
  }),
  devil: Object.freeze({
    base: Object.freeze([165, 163, 167, 166, 179, 179, 179, 182, 181, 209, 216, 180, 199, 197, 214, 209]),
    motion: Object.freeze([175, 171, 178, 163, 176, 205, 224, 252, 194, 219, 191, 201, 188, 160, 184, 169]),
    motion2: Object.freeze([164, 163, 217, 215, 212, 166, 206, 175, 190, 183, 180, 190, 190, 187, 222, 172]),
    motion3: Object.freeze([158, 158, 158, 158, 157, 198, 158, 160, -1, -1, -1, -1, -1, -1, -1, -1]),
    unified: Object.freeze([176, 164, 164, 162, 165, 222, 196, 176, 174, 228, 186, 186, 172, 172, 192, 258]),
    "unified-ext": Object.freeze([173, 176, 176, 164, 180, 175, 172, 174]),
    "unified-ext2": Object.freeze([162, 162, 159, 164, 188, 194, 167, 183, 219, 213, 210, 212, 162, 178, 180, 162]),
    "unified-ext3": Object.freeze([191, 180, 178, 206, 225, 250, 194, 216, 202, 170, 218, 208, 207, 216, 180, 228]),
    "unified-ext4": Object.freeze([177, 176, 186, 202, 184, 184, 192, 180, 188, 226, 208, 220, 228, 202, 230, 263]),
    "unified-ext5": Object.freeze([206, 228, 202, 180, 190, 178, 182, 204, 178, 174, 184, 172, 169, 210, 176, 178]),
    ref: 165,
  }),
  ali: Object.freeze({
    base: Object.freeze([162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 185, 185, 162, 162, 192, 193]),
    motion: Object.freeze([172, 176, 180, 163, 177, 237, 214, 220, 197, 214, 202, 216, 203, 160, 160, 160]),
    motion2: Object.freeze([173, 163, 164, 169, 197, 174, 201, 186, 186, 184, 188, 189, 192, 182, 215, 204]),
    motion3: Object.freeze([172, 158, 158, 158, 158, 201, 158, 172, -1, -1, -1, -1, -1, -1, -1, -1]),
    // v4.1 — RE-MEASURED. His 3.0 sheet was replaced by a 24-cell one and the
    // old row was fitted to art that no longer exists. Drift per cell:
    // [-12,-3,4,-1,-3,-15,4,-10,-35,-16,-16,-10,-4,-6,-21,10]. Cell 8 (the
    // jump-rise the airborne anchor reads) was stale by 35 rows and cell 9
    // (the tuck) by 16, so the old row visibly misplaced him in the air —
    // and 4.1 routes BOTH of those cells for him. This is the exact trap the
    // 3.1 wave fell into with four fighters at once.
    unified: Object.freeze([165, 162, 162, 164, 162, 211, 182, 168, 166, 226, 174, 176, 170, 178, 202, 280]),
    "unified-ext": Object.freeze([166, 164, 166, 182, 164, 168, 164, 180]),
    "unified-ext2": Object.freeze([162, 166, 164, 164, 176, 178, 163, 170, 218, 222, 234, 223, 172, 184, 186, 172]),
    "unified-ext3": Object.freeze([174, 178, 166, 192, 218, 258, 198, 226, 206, 159, 218, 194, 214, 199, 226, 242]),
    "unified-ext4": Object.freeze([163, 162, 181, 180, 163, 158, 189, 183, 199, 218, 208, 232, 210, 190, 230, 273]),
    "unified-ext5": Object.freeze([188, 229, 212, 164, 217, 174, 171, 204, 164, 162, 163, 162, 168, 194, 168, 164]),
    ref: 162,
  }),
  benny: Object.freeze({
    base: Object.freeze([162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 162, 162]),
    motion: Object.freeze([189, 184, 208, 160, 185, 240, 234, 206, 197, 238, 190, 192, 182, 160, 161, 180]),
    motion2: Object.freeze([171, 163, 163, 165, 199, 173, 185, 164, 178, 174, 182, 193, 194, 168, 213, 194]),
    motion3: Object.freeze([160, 158, 158, 158, 158, 204, 158, 179, -1, -1, -1, -1, -1, -1, -1, -1]),
    unified: Object.freeze([175, 166, 166, 165, 162, 217, 206, 178, 160, 240, 182, 190, 175, 179, 178, 278]),
    "unified-ext": Object.freeze([174, 168, 169, 170, 179, 182, 169, 214]),
    "unified-ext2": Object.freeze([162, 162, 158, 158, 168, 181, 167, 173, 222, 222, 236, 220, 177, 177, 177, 176]),
    "unified-ext3": Object.freeze([169, 163, 164, 173, 212, 256, 196, 198, 209, 196, 218, 184, 209, 200, 187, 246]),
    "unified-ext4": Object.freeze([160, 158, 192, 177, 192, 175, 178, 181, 188, 227, 228, 214, 220, 186, 244, 270]),
    "unified-ext5": Object.freeze([198, 238, 214, 178, 214, 175, 169, 212, 170, 170, 174, 170, 174, 208, 176, 174]),
    ref: 162,
  }),
  commissioner: Object.freeze({
    base: Object.freeze([158, 158, 158, 160, 166, 172, 176, 192, 182, 181, 156, 185, 172, 186, 159, 167]),
    motion: Object.freeze([181, 180, 184, 163, 187, 229, 225, 205, 199, 233, 193, 194, 193, 163, 160, 171]),
    motion2: Object.freeze([168, 163, 163, 163, 198, 170, 204, 183, 176, 176, 190, 197, 167, 174, 199, 197]),
    motion3: Object.freeze([160, 158, 158, 158, 166, 204, 158, 187, -1, -1, -1, -1, -1, -1, -1, -1]),
    unified: Object.freeze([171, 163, 162, 166, 164, 216, 197, 180, 158, 229, 178, 184, 180, 178, 177, 272]),
    "unified-ext": Object.freeze([171, 170, 174, 160, 157, 183, 172, 194]),
    "unified-ext2": Object.freeze([163, 162, 163, 161, 178, 186, 166, 166, 220, 224, 235, 222, 184, 182, 183, 181]),
    "unified-ext3": Object.freeze([165, 189, 158, 186, 209, 250, 182, 197, 198, 158, 214, 164, 204, 214, 216, 248]),
    "unified-ext4": Object.freeze([178, 158, 189, 175, 199, 171, 218, 174, 175, 230, 207, 224, 211, 192, 243, 266]),
    "unified-ext5": Object.freeze([172, 208, 210, 160, 206, 160, 160, 196, 164, 164, 170, 163, 162, 194, 172, 164]),
    ref: 158,
  }),
  cyraxx: Object.freeze({
    base: Object.freeze([165, 165, 165, 165, 164, 165, 163, 163, 168, 168, 185, 168, 195, 159, 167, 179]),
    motion: Object.freeze([178, 180, 186, 160, 189, 229, 222, 227, 181, 221, 189, 202, 183, 160, 160, 160]),
    motion2: Object.freeze([175, 163, 163, 165, 195, 164, 201, 188, 175, 175, 182, 206, 204, 160, 208, 174]),
    motion3: Object.freeze([162, 158, 158, 158, 158, 214, 158, 170, -1, -1, -1, -1, -1, -1, -1, -1]),
    unified: Object.freeze([166, 162, 162, 162, 162, 211, 188, 174, 157, 240, 174, 176, 171, 180, 168, 278]),
    "unified-ext": Object.freeze([168, 162, 166, 170, 166, 174, 170, 191]),
    "unified-ext2": Object.freeze([162, 162, 158, 158, 171, 183, 162, 166, 220, 221, 228, 222, 175, 175, 175, 175]),
    "unified-ext3": Object.freeze([169, 160, 160, 172, 202, 254, 197, 193, 201, 158, 216, 184, 206, 210, 190, 248]),
    "unified-ext4": Object.freeze([158, 158, 174, 170, 176, 162, 169, 164, 168, 222, 233, 226, 208, 192, 213, 264]),
    "unified-ext5": Object.freeze([182, 223, 196, 158, 218, 164, 172, 192, 160, 158, 160, 158, 162, 178, 163, 160]),
    ref: 165,
  }),
});

/**
 * The airborne anchor correction for one cell, in CELL pixels of 320 (the same
 * unit CELL_FLOOR_OFFSET uses). Negative lifts the drawing. Callers scale it by
 * airborneAnchorRamp(heightAboveFloor) so the correction is absent on the
 * ground and total in the air.
 */
export function airborneAnchorOffset(fighterId, bank, frame) {
  const table = CELL_BODY_CENTRE[fighterId];
  if (!table) return 0;
  const centres = table[bank];
  const centre = centres?.[frame];
  if (!Number.isFinite(centre) || centre < 0) return 0;
  return table.ref - centre - cellFloorOffset(fighterId, bank, frame);
}

/** 0 on the street, 1 once the fighter is a body-height off it. */
export function airborneAnchorRamp(heightAboveFloor) {
  if (!(heightAboveFloor > 0)) return 0;
  return Math.min(1, heightAboveFloor / AIRBORNE_ANCHOR_RAMP_PX);
}

/**
 * The ONE vertical registration a renderer needs for a resolved cell, in cell
 * pixels: the per-sheet floor registration plus the ramped airborne anchor.
 * Both renderers call exactly this, so the 2D canvas and the CINEMA 3D rig can
 * never disagree about where a cell's body sits.
 */
export function cellVerticalOffset(fighterId, bank, frame, heightAboveFloor = 0) {
  const floor = cellFloorOffset(fighterId, bank, frame);
  const ramp = airborneAnchorRamp(heightAboveFloor);
  if (ramp <= 0) return floor;
  return floor + airborneAnchorOffset(fighterId, bank, frame) * ramp;
}

/** Audit hook: every roster sheet is measured and the reference is sane. */
export function auditBodyCentres() {
  const errors = [];
  for (const [fighterId, table] of Object.entries(CELL_BODY_CENTRE)) {
    if (!(table.ref > 100 && table.ref < 220)) errors.push(`${fighterId}: ref ${table.ref}`);
    for (const bank of ["base", "motion", "motion2", "motion3", UNIFIED_BANK]) {
      const centres = table[bank];
      if (!centres || centres.length !== MOTION_CELL_COUNT) {
        errors.push(`${fighterId}/${bank}: ${centres?.length ?? 0} entries`);
        continue;
      }
      centres.forEach((value, index) => {
        // -1 marks a cell the bank does not use (motion3 ships 8 of 16), which
        // airborneAnchorOffset reads as "no measurement, no correction".
        if (!Number.isFinite(value) || value > 320 || (value < 0 && value !== -1)) {
          errors.push(`${fighterId}/${bank}[${index}]: ${value}`);
        }
      });
    }
    // v4.0: the ext row is eight entries, not sixteen, and only the fighters
    // who HAVE an ext sheet carry one. Its airborne cells (jump-ascent and
    // jump-descend) are routed, so an unmeasured row would put the B2 body-drop
    // straight back into the middle of those fighters' jumps.
    // v5.0: the ext3/ext4 rows are sixteen entries on every fighter who has them.
    // v5.2: and the ext5 row, on all ten.
    for (const swingBank of [UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK, UNIFIED_EXT5_BANK]) {
      const swingCentres = table[swingBank];
      if (!swingCentres) continue;
      if (swingCentres.length !== 16) errors.push(`${fighterId}/${swingBank}: ${swingCentres.length} entries`);
      swingCentres.forEach((value, index) => {
        if (!Number.isFinite(value) || value > 320 || (value < 0 && value !== -1)) errors.push(`${fighterId}/${swingBank}[${index}]: ${value}`);
      });
    }
    // v4.9: the ext2 row is sixteen entries on every fighter who has the sheet.
    const ext2Centres = table[UNIFIED_EXT2_BANK];
    if (ext2Centres) {
      if (ext2Centres.length !== UNIFIED_EXT2_CELL_COUNT) {
        errors.push(`${fighterId}/${UNIFIED_EXT2_BANK}: ${ext2Centres.length} entries`);
      }
      ext2Centres.forEach((value, index) => {
        if (!Number.isFinite(value) || value > 320 || (value < 0 && value !== -1)) {
          errors.push(`${fighterId}/${UNIFIED_EXT2_BANK}[${index}]: ${value}`);
        }
      });
    }
    const extCentres = table[UNIFIED_EXT_BANK];
    if (extCentres) {
      if (extCentres.length !== UNIFIED_EXT_CELL_COUNT) {
        errors.push(`${fighterId}/${UNIFIED_EXT_BANK}: ${extCentres.length} entries`);
      }
      extCentres.forEach((value, index) => {
        if (!Number.isFinite(value) || value > 320 || (value < 0 && value !== -1)) {
          errors.push(`${fighterId}/${UNIFIED_EXT_BANK}[${index}]: ${value}`);
        }
      });
    }
  }
  return Object.freeze({ errors: Object.freeze(errors) });
}

// ---------------------------------------------------------------------------
// v2.9 critic round 2 (B4) — PROP-CELL PROHIBITION.
//
// BASE_CELL_ROLES.attack answers "may this cell draw during an attack beat".
// That is not the same question as "is this the right drawing for THIS move".
// donald's bare-fisted heavy punch resolved its recovery to base:11 — a full
// club-in-hand golf follow-through — and held it for 23 ticks, and base:11 is
// in his `attack` set, so the 2.9 contract test passed it.
//
// Four fighters carry a signature prop whose art is baked into specific cells:
// donald's driver, post's spray can, ali's microphone, the Commissioner's
// cane. Those cells are correct for the KIT moves that swing the prop and
// wrong for every bare-handed normal. `propAction` lists the cells that depict
// the prop being SWUNG / SPRAYED / STRUCK WITH (including baked prop VFX);
// `bareHand` routes each one to the fighter's nearest prop-free equivalent at
// the same choke point the `unusable` swap uses, so no bare-handed beat
// anywhere — present or future — can reach one.
// ---------------------------------------------------------------------------

export const PROP_CELLS = Object.freeze({
  donald: Object.freeze({
    prop: "golf club",
    // Verified cell by cell at 1:1 this round. 9 is a straight club thrust,
    // 10 a downward swing with a baked golden starburst, 11 the swing's
    // follow-through (the 23-tick freeze the critics caught), 13 the full
    // overhead swing with three baked crescents, 14 a fist blast cone.
    // base:8 (gloves crossed high, no club, no VFX) is his ONLY club-free
    // clean cell and is therefore the whole bare-hand map. His motion2 bank
    // carries no club at all, so it needs no entries.
    propAction: Object.freeze({
      base: Object.freeze([9, 10, 11, 13, 14]),
      motion: Object.freeze([2, 3, 14]),
      motion2: Object.freeze([]),
    }),
    bareHand: Object.freeze({
      base: Object.freeze({ 9: 8, 10: 8, 11: 8, 13: 8, 14: 8 }),
    }),
  }),
  post: Object.freeze({
    prop: "spray can",
    // 10 is a punch with a baked pink splat on the fist, 13 raises the can
    // through its own mist, 14 is the full spray cone. base:9 is a clean
    // two-fist straight punch with no can in the cell at all. In motion, only
    // smear-v swings the can — smear-h is a bare punch streak.
    propAction: Object.freeze({
      base: Object.freeze([10, 13, 14]),
      motion: Object.freeze([3]),
      motion2: Object.freeze([]),
    }),
    bareHand: Object.freeze({
      base: Object.freeze({ 10: 9, 13: 9, 14: 9 }),
    }),
  }),
  ali: Object.freeze({
    prop: "microphone",
    // The worst case on the roster: ali's base bank has NO clean bare-handed
    // strike cell. 8 swings the mic overhead on its cable (and 8 is the
    // kit-less startup cell), 10 and 11 are swings with baked impact art, 13
    // is an overhead swing, 14 the sonic blast. Everything routes to 9 — a
    // braced wide stance carrying the mic passively, no swing arc, no VFX —
    // which is also the role map's guard read. The authored banks own his
    // real strike beats, so base is a one-tick fallback here.
    propAction: Object.freeze({
      base: Object.freeze([8, 10, 11, 13, 14]),
      motion: Object.freeze([2, 14]),
      motion2: Object.freeze([]),
    }),
    bareHand: Object.freeze({
      base: Object.freeze({ 8: 9, 10: 9, 11: 9, 13: 9, 14: 9 }),
    }),
  }),
  commissioner: Object.freeze({
    prop: "cane",
    // 8 and 9 are cane thrusts, 11 a low sweep with a baked gold crescent, 14
    // an overhead raise inside a flame aura. 13 (arms-out recoil) and 15
    // (folded arms) are his two cane-free cells; 13 is the strike/recovery
    // stand-in. His motion2 bank only ever CARRIES the cane — cell 8 raises it
    // as a block, which is defensive, not a strike.
    propAction: Object.freeze({
      base: Object.freeze([8, 9, 11, 14]),
      motion: Object.freeze([2, 3]),
      motion2: Object.freeze([]),
    }),
    bareHand: Object.freeze({
      base: Object.freeze({ 8: 13, 9: 13, 11: 13, 14: 13 }),
    }),
  }),
});

/** True when this cell depicts the fighter's signature prop IN ACTION. */
export function isPropActionCell(fighterId, bank, frame) {
  return Boolean(PROP_CELLS[fighterId]?.propAction?.[bank]?.includes(frame));
}

/**
 * The prop-free stand-in for a cell, used whenever a BARE-HANDED move resolves
 * to a prop-action cell. Returns the frame unchanged when there is nothing to
 * swap (which is every cell of the six prop-free fighters).
 */
export function bareHandedFrame(fighterId, bank, frame) {
  if (!isPropActionCell(fighterId, bank, frame)) return frame;
  const mapped = PROP_CELLS[fighterId]?.bareHand?.[bank]?.[frame];
  return Number.isInteger(mapped) ? mapped : frame;
}

/**
 * A move is BARE-HANDED when it has no authored kit art of its own: kit-less
 * normals draw from the shared base/authored banks, and those banks are the
 * only place a prop cell can leak in. Every move that DOES carry kit animation
 * frames is drawing its own art, prop included, on purpose.
 */
export function bareHandedAttack(attack) {
  return Boolean(attack) && !attack.animation;
}

// ---------------------------------------------------------------------------
// v2.9 critic round 2 (B1) — THE HOLD BUDGET, and the data-driven beat tracks
// that enforce it.
//
// The round-1 integration was a slideshow: authored cells were held for
// 183-500ms and slid across the screen by a transform. Measured on the 2.9
// build: heavy-kick windup 17 ticks on ONE drawing, jump tuck 28 ticks
// covering the apex AND the descent, air normal 30 ticks with zero pose
// change, throw recovery 31 ticks, dash body 10 ticks.
//
// THE RULE: no single drawing may own a beat for longer than
// MOTION_HOLD_BUDGET ticks. A beat that runs longer must advance to another
// compatible authored cell. Every long beat below is therefore expressed as a
// KEY LIST — an ordered array of `{ at, pose }` bands over the beat's own
// normalised progress — rather than as one cell plus a transform.
//
// MOTION3 SLOT-IN: keys whose bank is "motion3" are addressed BY POSE NAME,
// not by frame index, because that bank does not exist yet and its frame order
// is not fixed. Each carries the exact key it replaces as its fallback, so
// with no motion3 sheet on disk every track below degrades to a real,
// shipping-today sequence and NOTHING regresses; when the bank lands, its
// manifest's poseIds list is enough to light every slot up with no code change
// (see MOTION-ATLAS.md "Motion3 slots").
// ---------------------------------------------------------------------------

/** Longest run of ticks one drawing may own inside a beat. */
export const MOTION_HOLD_BUDGET = 8;

/** Ticks the throw-recovery track is paced over (see attackMotionBeat). */
const THROW_RECOVERY_TICKS = 34;

/**
 * The name-addressed bonus bank. Deliberately NOT in AUTHORED_BANKS: those
 * banks resolve by frame INDEX against a fixed 16-cell grammar, motion3
 * resolves by pose NAME against whatever its manifest happens to ship, so the
 * two gates are different contracts and share nothing but the fallback chain.
 */
export const MOTION3_BANK = "motion3";

/**
 * The pose names a motion3 sheet may supply. Order is irrelevant — these are
 * NAMES, matched against the manifest's own format.poseIds list, which is why
 * the bank lit up on the tracks below the moment its eight cells landed
 * without a line of code changing.
 *
 * The first eight are the ids the shipped bank actually carries. The rest are
 * reserved slots the tracks already reference: they resolve to nothing today
 * and will light up the same way if a later bank supplies them.
 */
export const MOTION3_KEYS = Object.freeze({
  // Shipped in assets/motion3 (2.9 hold-breaking bank).
  windupPunchB: "windup-punch-b",
  windupKickB: "windup-kick-b",
  jumpApex: "jump-apex",
  jumpDescent: "jump-descent",
  airAttackB: "air-attack-b",
  dashBodyB: "dash-body-b",
  throwRecover: "throw-recover",
  reactMid: "react-mid",
  // Reserved: the holds a future bank could still shorten.
  airStartup: "air-startup",
  dashLaunch: "dash-launch",
  throwClinch: "throw-clinch",
  attackSettle: "attack-settle",
  blockSettle: "block-settle",
  getupRoll: "getup-roll",
});

/**
 * A motion3 descriptor. `key` is a pose NAME; the host resolves it against
 * whatever assets/motion3/MANIFEST.json ships and returns the frame index, or
 * false when the bank (or that pose) is absent — in which case the fallback,
 * which is always a shipping-today key, wins.
 */
export function motion3Pose(key, fallback) {
  return { bank: MOTION3_BANK, key, frame: -1, fallback };
}

/**
 * Build the pose-name -> frame-index map from a motion3 manifest. Tolerant by
 * construction: an absent manifest, an absent poseIds list or an unknown name
 * all yield "no such key", which routes the descriptor to its fallback.
 */
export function buildMotion3KeyMap(manifest) {
  const ids = manifest?.format?.poseIds;
  const map = {};
  if (Array.isArray(ids)) {
    ids.forEach((id, index) => {
      if (typeof id === "string" && id && !(id in map)) map[id] = index;
    });
  }
  return map;
}

/**
 * Key-chain constructors. A key is `{ at, chain }` where `chain` runs from the
 * most-preferred drawing to the least; the CALLER appends its own fallback, so
 * one track shape serves the kit-less path (base-cell fallback) and the kit
 * path (kit-frame fallback) without being written twice.
 */
export const m3key = (key) => Object.freeze({ bank: MOTION3_BANK, key });
export const m2key = (cell) => Object.freeze({ bank: "motion2", cell });
export const m1key = (cell) => Object.freeze({ bank: "motion", cell });

// ---------------------------------------------------------------------------
// v3.0 — THE UNIFIED BANK (assets/unified, MOTION-ATLAS.md "Unified bank").
//
// Banks 1-3 and the walk bank are PATCHES: each supplies a handful of beats
// and every descriptor carries the base cell it replaces underneath. That
// architecture is why 2.9 shipped 40 cells behind `accept: false` — cells from
// different generations do not share a costume, so deathblow's clear glasses
// became SUNGLASSES and his plaid forearms became GAUNTLETS on the tick he
// started walking (measured 11.4-11.9 dE against 0.63-1.03 dE of same-
// generation pose noise).
//
// This bank is the opposite shape. Each sheet is a fighter's WHOLE constantly-
// visible vocabulary — 16 cells — authored in ONE generation, so it is self-
// consistent by construction. Measured roster-wide, the idle->walk costume
// delta collapses to 0.0-2.7 dE: inside the base bank's own pose noise.
//
// TWO RULES DEFINE THE INTEGRATION, and they answer different questions.
//
// RULE 1 — ALL-OR-NOTHING, and it is PER FIGHTER.
// EVERY unified sheet is a DIFFERENT DRAUGHTSMAN from that fighter's base
// atlas (donald measures 22.5 dE from his own base idle, jez 11.1, ali 9.9).
// So no beat the bank owns may fall through to another bank for a fighter who
// is on it: buildUnifiedAcceptMasks below collapses any sheet that is not
// 16/16 `accept: true` to an all-false mask, so a partially-accepted sheet
// cannot draw a single cell and that fighter stays byte-identical to 2.9.
// Nobody gets a unified idle with a base walk.
//
// Today: NINE fighters are whole (deathblow, jez, alan, post, benny, donald,
// ali, commissioner, devil). `cyraxx` ships 0/16 after failing U1 in three
// generations and keeps his existing banks entirely; his sheet is not in the
// repo at all (see assets/unified/MANIFEST.json `cyraxxNote`). Nothing about
// this file has to change when he lands: drop an all-accept manifest and a
// sheet in and the gate opens.
//
// RULE 2 — CONNECTED REGIONS, and it is PER BEAT, applied to every fighter
// identically. v3.0 critic round; this is the rule the first 3.0 wave was
// missing and the reason it had to be re-cut.
//
// Rule 1 says a fighter is wholly on the bank or wholly off it. It does NOT
// say the bank should be routed into every beat it has a drawing for, and the
// first wave assumed it did. Routing is not about which cells EXIST; it is
// about which cells are NEIGHBOURS at run time.
//
// The measurement that settles it (critics' weighted-Lab cluster metric —
// adaptive k-means over the opaque Lab pixels of a cell, mean of the two
// weighted nearest-cluster distances; deathblow's calibration is a same-
// generation floor of 3.15 dE and a known-bad strobe of 7.29-7.45 dE):
//
//   motion and motion2 are COSTUME-COMPATIBLE WITH EACH OTHER. deathblow's
//   motion:0 against motion2:6 measures 2.62 dE — they share the same white-
//   side-stripe sneaker. The motion family is ONE generation.
//
// So dropping a unified cell into the middle of a motion-bank chain does not
// remove a seam; it CUTS a chain that was already consistent. Measured on
// deathblow's heavy punch, boundary by boundary:
//
//   2.9  motion2:0 -> motion2:6 -> motion2:4 -> motion:2 -> motion:0
//        -> motion:4 -> base:11                    2 generation crossings
//   3.0  motion2:0 -> motion2:6 -> unified:6 -> motion:2 -> unified:10
//        -> motion:4 -> base:11                    5 generation crossings,
//        and the follow-through boundary went 3.87 -> 6.95 dE, into the same
//        band as the strobe that put 40 cells behind accept:false in 2.9.
//        Two of the five had no smear, flash or impact over them at all
//        (motion2:6->unified:6 at 5.26, motion:4->base:11 at 7.01).
//
// THE RULE: the unified bank owns a beat only if it can own that beat's WHOLE
// CONNECTED NEIGHBOURHOOD. Where a beat sits inside a chain the motion banks
// already own consistently, it stays there.
//
// Applied by measurement across the roster (see UNIFIED_ROUTED_BEATS below),
// that gives the bank two connected regions and nothing else:
//
//   GROUNDED NEUTRAL  idle, the four walk keys, crouch, crouch-transition and
//                     guard. Every neighbour of every one of them is another
//                     one of them, so the region is crossing-free internally:
//                     crouch in/out went 4 crossings and 8.61 dE worst to
//                     ZERO, and idle->walk->idle is 100% unified.
//   REACTIONS         light-hit, big-hit, stagger, knockdown. Measured on all
//                     nine, owning the WHOLE ladder beats both 2.9 and the
//                     first 3.0 cut: light 4 -> 2 -> 0 crossings, heavy
//                     2 -> 2 -> 0.
//
// And it RETIRES four cells from routing entirely — jump-rise, jump-tuck,
// punch-extension and kick-extension. Each of those sits inside a motion chain
// (the arc's descent and landing, the smear->extension->follow swing), and
// each was cutting one. The worst single seam in the first cut was unified:9
// -> motion:11 at 7.56 dE HELD 15+ ticks fully airborne, centre-frame, with no
// VFX over it; retiring the two jump cells takes the arc's worst crossing to
// 5.55 dE, below every 2.9 figure. THE ART STAYS IN THE SHEET, unused: the
// sixteen-cell grammar and the 16/16 accept gate are unchanged, so a future
// wave that can own a whole airborne or attack chain has the drawings waiting.
// ---------------------------------------------------------------------------

export const UNIFIED_BANK = "unified";

export const UNIFIED_CELL_COUNT = 16;

/**
 * The unified grammar. Row-major over a 4x4 320px sheet, right-facing, one
 * global scale per sheet normalised to 306px on the tallest STANDING figure
 * (the motion2 convention), foot bottoms on floor row 315.
 */
export const UNIFIED_CELLS = Object.freeze({
  idle: 0,
  walkContactA: 1, walkPassingA: 2, walkContactB: 3, walkPassingB: 4,
  crouch: 5, crouchTrans: 6, guard: 7,
  jumpRise: 8, jumpTuck: 9,
  punchExt: 10, kickExt: 11,
  lightHit: 12, bigHit: 13, stagger: 14, knockdown: 15,
});

/**
 * The four walk keys, cycled AMONG THEMSELVES at the existing cadence and
 * never interleaved with the base walk cells.
 *
 * The stride is SINGLE-PHASE — the legs do not alternate. That is a settled
 * decision, not an oversight: it is parity with the shipping base walk (37 of
 * its 40 cells share one lead foot), and splitting the walk into its own
 * generation to chase phase is exactly what would put a cross-generation seam
 * back at idle->walk, which is the most common transition in the game and the
 * one this bank exists to fix. See MOTION-ATLAS.md "THE ROSTER ROLLOUT".
 */
export const UNIFIED_WALK_KEYS = Object.freeze([
  UNIFIED_CELLS.walkContactA, UNIFIED_CELLS.walkPassingA,
  UNIFIED_CELLS.walkContactB, UNIFIED_CELLS.walkPassingB,
]);

/**
 * The sixteen beats the SHEET carries, by unified cell. This is the GRAMMAR —
 * what every sheet must draw and what the 16/16 accept gate counts. It is not
 * the routing table; see UNIFIED_ROUTED_BEATS.
 */
export const UNIFIED_BEATS = Object.freeze([
  "idle", "walk-contact-a", "walk-passing-a", "walk-contact-b", "walk-passing-b",
  "crouch", "crouch-trans", "guard", "jump-rise", "jump-tuck",
  "punch-extension", "kick-extension", "light-hit", "big-hit", "stagger", "knockdown",
]);

/**
 * RULE 2, as data: the cells the bank is ROUTED into, and the ones it is not.
 *
 * Two connected regions and nothing else. A cell being retired is a routing
 * decision, not an art one — it stays on the sheet, it stays inside the 16/16
 * accept gate, and it is measured by the same U1 benchmark as the rest.
 *
 * The contract test walks both lists: every routed cell must be reachable from
 * game.js, and no retired cell may appear in a routed chain.
 */
export const UNIFIED_ROUTED_CELLS = Object.freeze([
  UNIFIED_CELLS.idle,
  UNIFIED_CELLS.walkContactA, UNIFIED_CELLS.walkPassingA,
  UNIFIED_CELLS.walkContactB, UNIFIED_CELLS.walkPassingB,
  UNIFIED_CELLS.crouch, UNIFIED_CELLS.crouchTrans, UNIFIED_CELLS.guard,
  UNIFIED_CELLS.lightHit, UNIFIED_CELLS.bigHit,
  UNIFIED_CELLS.stagger, UNIFIED_CELLS.knockdown,
]);

/**
 * Retired from routing by the v3.0 critic round. Each measured WORSE than the
 * motion chain it was cutting (deathblow, weighted-Lab cluster dE):
 *
 *   jump-rise / jump-tuck   the arc's descent and landing come from motion, so
 *                           the tuck handed to motion:11 at 7.56 dE and HELD it
 *                           15+ ticks fully airborne with no VFX cover. Off the
 *                           route the arc's worst crossing is 5.55 dE.
 *   punch-ext / kick-ext    sit between the motion smear and the motion
 *                           follow-through. Routed, the punch ran 5 crossings
 *                           and pushed the follow-through boundary 3.87 -> 6.95
 *                           dE. Off the route it runs 3, and the two it keeps
 *                           are the entry to the swing and the return to the
 *                           (unified) stance.
 */
export const UNIFIED_RETIRED_CELLS = Object.freeze([
  UNIFIED_CELLS.jumpRise, UNIFIED_CELLS.jumpTuck,
  UNIFIED_CELLS.punchExt, UNIFIED_CELLS.kickExt,
]);

/**
 * A unified descriptor. `fallback` is the ENTIRE 2.9 chain for that beat, so a
 * fighter whose sheet is missing, still decoding or not 16/16 accepted renders
 * exactly what 2.9 rendered — there is no third path.
 */
export function unifiedPose(cell, fallback) {
  return { bank: UNIFIED_BANK, frame: cell, fallback };
}

/** Chain-constructor sibling of m1key/m2key/m3key for the key tracks. */
export const ukey = (cell) => Object.freeze({ bank: UNIFIED_BANK, cell });

/**
 * THE ALL-OR-NOTHING GATE, and the only place it lives.
 *
 * Same per-cell manifest shape every other bank uses, then one extra rule: a
 * sheet that is not 16/16 `accept: true` is collapsed to an ALL-FALSE mask.
 * There is deliberately no partial mode — a fighter is either wholly on this
 * bank or wholly off it, because a single fallthrough inside these sixteen
 * beats is the cross-generation strobe the bank was built to delete.
 */
export function buildUnifiedAcceptMasks(manifest) {
  const raw = buildMotionAcceptMasks(manifest, UNIFIED_CELL_COUNT);
  const masks = {};
  for (const [fighterId, mask] of Object.entries(raw)) {
    const whole = mask.accept.length === UNIFIED_CELL_COUNT && mask.accept.every(Boolean);
    masks[fighterId] = Object.freeze({
      whole,
      accept: whole ? mask.accept : Object.freeze(new Array(UNIFIED_CELL_COUNT).fill(false)),
      scale: mask.scale,
    });
  }
  return masks;
}

/** The fighter ids whose sheet is whole, from a built mask table. */
export function unifiedFighterIds(masks) {
  return Object.keys(masks || {}).filter((id) => masks[id]?.whole).sort();
}

// ---------------------------------------------------------------------------
// v4.0 — THE EXT SHEET (assets/unified/<id>-ext.webp), the second half of one
// generation.
//
// A 4.0 sheet is TWENTY-FOUR cells drawn in a SINGLE generation, not sixteen.
// Sixteen of them keep the 3.0 grammar and stay in <id>.webp so the shipping
// runtime contract is untouched; the other eight ride <id>-ext.webp, a 1280x640
// 4x2 grid of the same 320px cells at the same global scale, same floor row,
// same registration. Physically it is just a shorter sheet, which is why
// drawAtlasFrame's `frame % 4` / `floor(frame / 4)` addresses it with no change.
//
// TWO NUMBERINGS, and keeping them straight is the whole trick.
//   GRAMMAR cell   16..23 — what the manifest, MOTION-ATLAS and this file's
//                  documentation call the cell. `UNIFIED_EXT_BASE` is 16.
//   SHEET frame    0..7   — where it actually sits on the ext sheet, and what
//                  a descriptor carries. frame = cell - 16.
// A descriptor NEVER carries a grammar number: the renderer would address row 4
// of a two-row sheet. `xkey`/`unifiedExtPose` take SHEET frames, and
// `unifiedExtCell` converts when a caller only has the grammar number.
//
// THE GATE IS THE SAME SHAPE AS THE MAIN SHEET'S, AND IT IS STRICTER BY ONE
// CLAUSE. All eight or none, per fighter — because the ext cells are drawn to
// sit BETWEEN the main sheet's cells (two walk in-betweens, an ascent, a
// descent), so half an ext sheet is a cycle that changes drawing-count halfway
// round. The extra clause: a fighter must ALSO be whole on the main sheet. The
// two sheets are one generation and the beats interleave them cell by cell
// (walk 1 -> 17 -> 2 -> 3 -> 18 -> 4), so an ext sheet riding a rejected main
// sheet is exactly the cross-generation strobe the unified bank exists to kill.
//
// A fighter with no ext sheet — the five 3.0 holdouts (deathblow, post, donald,
// ali, devil) until 4.1 gave ali one and 5.2 the other four — has NO extCells
// block in the manifest, so the mask is not-whole, no Image is ever requested
// (no 404), and every beat below returns its pre-4.0 array unchanged. The
// branch stays for that reason even with the whole roster on the sheet: it is
// what a sheet that fails to decode, or a future fighter, degrades to.
//
// v5.2: the four holdouts' sheets are a SECOND generation (two takes of the
// eight poses, image-to-image from the unified sheet — tools/swing/
// install_ext8.py), resampled once at build time so the breathing idle lands
// on the unified idle, which is the one premise every table below rests on.
// ---------------------------------------------------------------------------

export const UNIFIED_EXT_BANK = "unified-ext";

export const UNIFIED_EXT_CELL_COUNT = 8;

/** Grammar cell number of ext SHEET frame 0. Grammar cell = frame + this. */
export const UNIFIED_EXT_BASE = 16;

/**
 * The ext grammar, BY SHEET FRAME (0..7). The comment on each line is the
 * grammar cell number the manifest and MOTION-ATLAS use for it.
 */
export const UNIFIED_EXT_CELLS = Object.freeze({
  idleBreathe: 0,   // 16 — the idle one breath later
  walkDownA: 1,     // 17 — weight sinking between contact A and passing A
  walkDownB: 2,     // 18 — the leg exchange of 17
  jumpAscent: 3,    // 19 — airborne and still rising
  jumpDescend: 4,   // 20 — falling, legs reaching down
  punchWindup: 5,   // 21 — fist chambered at the ribs
  kickWindup: 6,    // 22 — knee up, foot cocked
  midReaction: 7,   // 23 — the flinch between light-hit and big-hit
});

/** The eight beats an ext sheet carries, in sheet-frame order. */
export const UNIFIED_EXT_BEATS = Object.freeze([
  "idle-breathe", "walk-down-a", "walk-down-b", "jump-ascent",
  "jump-descend", "punch-windup", "kick-windup", "mid-reaction",
]);

/**
 * RULE 2 for the ext sheet: the frames every whole sheet routes, and the one
 * whose routing is decided PER FIGHTER by the drawing he actually got.
 *
 * Seven of the eight are spent on the beat they were drawn for on every sheet,
 * and the accept gate counts exactly these.
 *
 * `jumpDescend` is the eighth and it is the one cell on this bank whose routing
 * is a property of the ART rather than of the chain. 3.0 retired four MAIN
 * cells for where they sat in a chain — a roster-uniform decision, because the
 * chain is the same for everyone. Cell 20 is different: on jez, alan, benny,
 * the commissioner and cyraxx it came back as a HIT REACTION (head thrown back,
 * spine arched backward, arms flung limp) rather than the "torso upright, legs
 * reaching down" fall the prompt asked for, and at 1:1 it is a sibling of that
 * fighter's own cells 12 and 13 (IoU 0.47-0.77 against them). Routed on those
 * five, every jump would flinch on the way down.
 *
 * v4.1 — ali's is the first one that is genuinely a descent, so the roster no
 * longer has one answer and pretending it does would mean either throwing away
 * a correct drawing or shipping five flinching jumps. Measured on his sheet:
 * torso upright, head LEVEL and carried 24.7px FORWARD of his torso centre
 * where his own cells 12/13/14 carry it 6.1px, 3.9px and 0.7px BACK, and legs
 * straight and reaching down. It reads as his own ascent's other half (IoU
 * 0.493 against cell 19, the highest on the roster by a third).
 *
 * So the routing is DATA, and the data already exists: the manifest's own
 * `accept` flag on extCells[4], which the art waves have been setting honestly
 * all along (false on all five, true on ali). No new manifest key, and a future
 * whole-sheet regeneration switches a fighter on by flipping that flag.
 *
 * The gate deliberately does NOT count this cell — see buildUnifiedExtAcceptMasks.
 */
export const UNIFIED_EXT_ROUTED_CELLS = Object.freeze([
  0, 1, 2, 3, 5, 6, 7,
]);

/**
 * Routed only for a fighter whose own manifest block accepts them. A fighter
 * who does not gets them forced FALSE in his mask, so a stray descriptor draws
 * nothing rather than a flinch in mid-air — exactly what "retired" meant before
 * the answer stopped being roster-uniform.
 */
export const UNIFIED_EXT_OPTIONAL_CELLS = Object.freeze([4]);

/** Grammar cell (16..23) -> sheet frame (0..7). Returns -1 for a main cell. */
export function unifiedExtFrame(cell) {
  const frame = cell - UNIFIED_EXT_BASE;
  return frame >= 0 && frame < UNIFIED_EXT_CELL_COUNT ? frame : -1;
}

/** Sheet frame (0..7) -> grammar cell (16..23). */
export function unifiedExtCell(frame) {
  return frame + UNIFIED_EXT_BASE;
}

/** True when a GRAMMAR cell number names an ext cell rather than a main one. */
export function isUnifiedExtCell(cell) {
  return Number.isInteger(cell) && cell >= UNIFIED_EXT_BASE
    && cell < UNIFIED_EXT_BASE + UNIFIED_EXT_CELL_COUNT;
}

/**
 * Is this resolved cell part of the bank's IDLE<->WALK CYCLE?
 *
 * The crossfade ghost has an exemption for adjacent keys of one cycle: those
 * get a crisp cross-dissolve and everything else gets the softened big-delta
 * ghost. 3.0 gave the exemption to unified cells 0-4 — one idle and the four
 * keys of one stride, authored together — because without it every walk-key
 * handoff took the softened ghost, which is a quality step down on the
 * most-seen transition in the game.
 *
 * v4.0 SPANS TWO BANKS, and it has to. The cycle is now
 * `0 <-> 16` on the idle and `1 -> 17 -> 2 -> 3 -> 18 -> 4` on the walk, so
 * FOUR of the six handoffs per stride and EVERY breath cross from `unified` to
 * `unified-ext`. A bank-equality test would have quietly sent all of them back
 * to the softened ghost — the 3.0 regression, reintroduced by the wave that
 * added the drawings. The cells are one generation and one cycle; which of the
 * two files they happen to sit in is not a visual fact.
 *
 * Deliberately in the engine rather than in a renderer: both renderers and the
 * contract test must answer this identically.
 */
export function isUnifiedCycleCell(bank, frame) {
  if (bank === UNIFIED_BANK) return frame <= UNIFIED_CELLS.walkPassingB;
  if (bank === UNIFIED_EXT_BANK) return frame <= UNIFIED_EXT_CELLS.walkDownB;
  return false;
}

/**
 * An ext descriptor. `cell` is a SHEET FRAME. Same contract as unifiedPose:
 * `fallback` is the entire pre-4.0 chain for that beat, so a fighter with no
 * ext sheet renders exactly what 3.5 rendered.
 */
export function unifiedExtPose(cell, fallback) {
  return { bank: UNIFIED_EXT_BANK, frame: cell, fallback };
}

/** Chain-constructor sibling of ukey/m1key/m2key/m3key. Takes a SHEET FRAME. */
export const xkey = (cell) => Object.freeze({ bank: UNIFIED_EXT_BANK, cell });

/**
 * A key-chain link for a ladder rung expressed in GRAMMAR numbering, which is
 * how the reaction ladder names its cells (0..23 in one list). Dispatches to
 * the right bank so a ladder can mix main and ext rungs in one array.
 */
export function urung(cell) {
  const frame = unifiedExtFrame(cell);
  return frame >= 0 ? xkey(frame) : ukey(cell);
}

/** Pose-descriptor sibling of `urung`, for the callers that need a fallback. */
export function unifiedRungPose(cell, fallback) {
  const frame = unifiedExtFrame(cell);
  return frame >= 0 ? unifiedExtPose(frame, fallback) : unifiedPose(cell, fallback);
}

/**
 * THE EXT ALL-OR-NOTHING GATE. Indexed by SHEET FRAME, built from the
 * manifest's `extCells` array, whose `frame` fields are GRAMMAR numbers.
 *
 * `unifiedMasks` is the already-built main-sheet mask table: a fighter who is
 * not whole there cannot be whole here, however good his ext block looks.
 */
export function buildUnifiedExtAcceptMasks(manifest, unifiedMasks = null) {
  const masks = {};
  for (const [fighterId, entry] of Object.entries(manifest?.fighters || {})) {
    const accept = new Array(UNIFIED_EXT_CELL_COUNT).fill(false);
    for (const cell of entry?.extCells || []) {
      const frame = unifiedExtFrame(cell?.frame);
      if (frame >= 0) accept[frame] = cell.accept === true;
    }
    const mainWhole = unifiedMasks ? Boolean(unifiedMasks[fighterId]?.whole) : true;
    // THE GATE COUNTS THE ROUTED CELLS, and that is a deliberate difference from
    // the main sheet's, which counts all sixteen including its four retired
    // ones. The difference is WHY each cell is retired. The main sheet's four
    // are waiting on a ROUTING decision — the drawings are right and a future
    // wave can switch them on with no new art — so counting them keeps a
    // quality bar over the whole generation. Cell 20 is waiting on a REDRAW:
    // it came back as a hit reaction rather than a fall, on all five sheets,
    // and the art wave itself marked it accept:false on alan and benny for that
    // reason. Gating on it would cost those two their entire ext sheet — walk
    // in-betweens, chambers, breathing idle, mid-reaction — over one cell no
    // beat can reach, which is the dead-weight failure the 3.0 round removed,
    // inverted. "Whole" here means every cell that CAN draw is accepted.
    //
    // The retired frame is additionally forced false in the mask, so a stray
    // descriptor naming it draws nothing rather than a flinch in mid-air. The
    // routing refusal and the gate say the same thing in two places on purpose.
    //
    // v4.1: an OPTIONAL cell is not gated on either, for the same reason and
    // with the same arithmetic — but it is no longer forced false for everyone.
    // A fighter whose own block accepts it routes it; a fighter whose block
    // rejects it is exactly as retired as he was before. That is one rule, read
    // off the manifest, and it is why ali's correct descent can ship without
    // giving the other five a flinch on the way down.
    const routedOk = UNIFIED_EXT_ROUTED_CELLS.every((frame) => accept[frame]);
    const whole = Boolean(entry?.extSheet) && mainWhole && routedOk;
    const gated = accept.map((ok, frame) => ok
      && (UNIFIED_EXT_ROUTED_CELLS.includes(frame) || UNIFIED_EXT_OPTIONAL_CELLS.includes(frame)));
    masks[fighterId] = Object.freeze({
      whole,
      accept: Object.freeze(whole ? gated : new Array(UNIFIED_EXT_CELL_COUNT).fill(false)),
      sheet: entry?.extSheet || null,
    });
  }
  return masks;
}

/** The fighter ids carrying a whole ext sheet, from a built mask table. */
export function unifiedExtFighterIds(masks) {
  return Object.keys(masks || {}).filter((id) => masks[id]?.whole).sort();
}

// ---------------------------------------------------------------------------
// v4.9 IN-BETWEENS — THE THIRD SHEET: attack anticipation and recovery keys.
//
// `<id>-ext2.webp` is a 1280x1280 4x4 sheet of 320px cells (no padding needed)
// generated as ONE 4x4 sheet per fighter with that fighter's own unified sheet
// as the image-to-image reference, then colour-matched onto it (per-cluster
// LAB mean shift; measured 0.9-1.3 weighted dE against the unified sheet, the
// shipped ext sheets sit at 0.66 and the cross-generation strobe at 11-14).
// The cells are the instants BEFORE and AFTER a strike: a light's wind-up and
// recover per limb, the heavy's deeper pair, the crouch pair, and the throw's
// reach and release. Every consumer degrades to the pre-4.9 read when the
// sheet is missing — the beats fire only when the caller passes `inbetween`.
export const UNIFIED_EXT2_BANK = "unified-ext2";
export const UNIFIED_EXT2_CELL_COUNT = 16;
/** Grammar cell number of ext2 SHEET frame 0 (grammar cells 24..39). */
export const UNIFIED_EXT2_BASE = 24;

/** The ext2 grammar, BY SHEET FRAME (0..15). */
export const UNIFIED_EXT2_CELLS = Object.freeze({
  punchWindup: 0,        // 24 — rear arm cocked, weight loaded, the instant before a jab
  punchRecover: 1,       // 25 — the arm halfway back, weight settling
  kickWindup: 2,         // 26 — knee chambered tight on the support leg
  kickRecover: 3,        // 27 — the leg coming back down, foot just off the floor
  heavyPunchWindup: 4,   // 28 — deep loaded stance, fist behind the shoulder
  heavyPunchRecover: 5,  // 29 — over-committed follow-through, weight far forward
  heavyKickWindup: 6,    // 30 — sunk on one leg, knee high, arms swung back
  heavyKickRecover: 7,   // 31 — the leg swinging back down across the body
  crouchPunchWindup: 8,  // 32 — crouched, arm cocked at the ribs
  crouchPunchRecover: 9, // 33 — crouched, arm halfway back
  crouchKickWindup: 10,  // 34 — crouched, sweep leg gathered, hand on the floor
  crouchKickRecover: 11, // 35 — crouched, the sweep leg returning
  throwWindup: 12,       // 36 — both arms reaching to grab
  throwRecover: 13,      // 37 — the release, arms swinging down and back
  specialWindup: 14,     // 38 — hands gathered at the hip (reserved)
  specialRecover: 15,    // 39 — arms dropping after a thrust (reserved)
});

/** The sixteen beats an ext2 sheet carries, in sheet-frame order. */
export const UNIFIED_EXT2_BEATS = Object.freeze([
  "punch-windup", "punch-recover", "kick-windup", "kick-recover",
  "heavy-punch-windup", "heavy-punch-recover", "heavy-kick-windup", "heavy-kick-recover",
  "crouch-punch-windup", "crouch-punch-recover", "crouch-kick-windup", "crouch-kick-recover",
  "throw-windup", "throw-recover", "special-windup", "special-recover",
]);

/** Routed this wave: every strike and throw in-between. */
export const UNIFIED_EXT2_ROUTED_CELLS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
/** v5.0: the special gather/settle are routed on plain specials; nothing is reserved. */
export const UNIFIED_EXT2_RESERVED_CELLS = Object.freeze([]);

/** Grammar cell (24..39) -> sheet frame (0..15). Returns -1 otherwise. */
export function unifiedExt2Frame(cell) {
  const frame = cell - UNIFIED_EXT2_BASE;
  return frame >= 0 && frame < UNIFIED_EXT2_CELL_COUNT ? frame : -1;
}

/** Sheet frame (0..15) -> grammar cell (24..39). */
export function unifiedExt2Cell(frame) {
  return frame + UNIFIED_EXT2_BASE;
}

/** An ext2 descriptor. `cell` is a SHEET FRAME; `fallback` is the pre-4.9 chain. */
export function unifiedExt2Pose(cell, fallback) {
  return { bank: UNIFIED_EXT2_BANK, frame: cell, fallback };
}

/** Chain-constructor sibling of xkey. Takes a SHEET FRAME. */
export const x2key = (cell) => Object.freeze({ bank: UNIFIED_EXT2_BANK, cell });

/**
 * THE EXT2 GATE: all routed cells accepted, the main sheet whole, or nothing.
 * Reserved cells are forced false so a stray descriptor draws nothing.
 */
export function buildUnifiedExt2AcceptMasks(manifest, unifiedMasks = null) {
  const masks = {};
  for (const [fighterId, entry] of Object.entries(manifest?.fighters || {})) {
    const accept = new Array(UNIFIED_EXT2_CELL_COUNT).fill(false);
    for (const cell of entry?.ext2Cells || []) {
      const frame = unifiedExt2Frame(cell?.frame);
      if (frame >= 0) accept[frame] = cell.accept === true;
    }
    const mainWhole = unifiedMasks ? Boolean(unifiedMasks[fighterId]?.whole) : true;
    const routedOk = UNIFIED_EXT2_ROUTED_CELLS.every((frame) => accept[frame]);
    const whole = Boolean(entry?.ext2Sheet) && mainWhole && routedOk;
    const gated = accept.map((ok, frame) => ok && UNIFIED_EXT2_ROUTED_CELLS.includes(frame));
    masks[fighterId] = Object.freeze({
      whole,
      accept: Object.freeze(whole ? gated : new Array(UNIFIED_EXT2_CELL_COUNT).fill(false)),
      sheet: entry?.ext2Sheet || null,
    });
  }
  return masks;
}

/** The fighter ids carrying a whole ext2 sheet, from a built mask table. */
export function unifiedExt2FighterIds(masks) {
  return Object.keys(masks || {}).filter((id) => masks[id]?.whole).sort();
}

// ---------------------------------------------------------------------------
// v5.0 FULL SWING — the fourth and fifth sheets: the strikes themselves and
// the reactions, generated the 4.9 way (image-to-image from the fighter's own
// unified sheet, colour-matched onto it) so the whole vocabulary is one
// generation-matched family. They are not routed through new beats: the
// resolved pose is SUBSTITUTED at draw time (swingSubstitute) whenever it
// names a motion-family cell that has an equivalent here, so every track's
// timing and hold budget is untouched and only the drawing changes. Per-cell
// gates: a rejected cell simply keeps its motion drawing.
export const UNIFIED_EXT3_BANK = "unified-ext3";
export const UNIFIED_EXT3_CELL_COUNT = 16;
export const UNIFIED_EXT3_BASE = 40;
export const UNIFIED_EXT3_CELLS = Object.freeze({
  punchExt: 0, kickExt: 1, follow: 2, smearH: 3,
  crouchPunchExt: 4, sweep: 5, airPunch: 6, airKick: 7,
  airChamber: 8, smearV: 9, land: 10, kickFollow: 11,
  crouchGuard: 12, heavyPunchExt: 13, heavyKickExt: 14, sweepFollow: 15,
});
export const UNIFIED_EXT3_BEATS = Object.freeze([
  "punch-extension", "kick-extension", "follow-through", "punch-smear",
  "crouch-punch-extension", "sweep", "air-punch", "air-kick",
  "air-chamber", "rising-smear", "landing", "kick-follow-through",
  "crouch-guard", "heavy-punch-extension", "heavy-kick-extension", "sweep-follow-through",
]);
export const UNIFIED_EXT4_BANK = "unified-ext4";
export const UNIFIED_EXT4_CELL_COUNT = 16;
export const UNIFIED_EXT4_BASE = 56;
export const UNIFIED_EXT4_CELLS = Object.freeze({
  guardFlinch: 0, headSnap: 1, bodyBlow: 2, bigHit: 3,
  stagger: 4, dizzy: 5, launched: 6, airHit: 7,
  wallSplat: 8, crumple: 9, falling: 10, floorBounce: 11,
  getupA: 12, getupB: 13, thrown: 14, ko: 15,
});
export const UNIFIED_EXT4_BEATS = Object.freeze([
  "guard-flinch", "head-snap", "body-blow", "big-hit",
  "stagger", "dizzy", "launched", "air-hit",
  "wall-splat", "crumple", "falling", "floor-bounce",
  "getup-a", "getup-b", "thrown", "ko",
]);
// v5.2 LOCOMOTION — the sixth sheet. Same pipeline and the same per-cell
// gate as ext3/ext4 (a SWING_BANKS entry, so buildSwingAcceptMasks,
// swingFrame and the loaders need no bank-specific code). Registered by the
// install item; the GROUND and BOOKEND cells (0-3, 8-15) are routed by the
// item after it (see the UNIFIED_EXT5_CELL_HEIGHT block), the AIR cells
// (4-7) by the one after that (jumpArcKeys `air`, the airborne cases of
// swingSubstitute) — every cell is reachable and the tests pin all sixteen.
export const UNIFIED_EXT5_BANK = "unified-ext5";
export const UNIFIED_EXT5_CELL_COUNT = 16;
export const UNIFIED_EXT5_BASE = 72;
export const UNIFIED_EXT5_CELLS = Object.freeze({
  dashLaunch: 0, dashStretch: 1, dashBrake: 2, turnaround: 3,
  apexTuck: 4, descent: 5, airRecover: 6, airHitUpright: 7,
  powerCharge: 8, entranceA: 9, entranceB: 10, victory: 11,
  taunt: 12, crouchGuardFlinch: 13, throwGrab: 14, dizzySway: 15,
});
export const UNIFIED_EXT5_BEATS = Object.freeze([
  "dash-launch", "dash-stretch", "dash-brake", "turnaround",
  "apex-tuck", "descent", "air-recover", "air-hit-upright",
  "power-charge", "entrance-a", "entrance-b", "victory",
  "taunt", "crouch-guard-flinch", "throw-grab", "dizzy-sway",
]);
export const SWING_BANKS = Object.freeze({
  [UNIFIED_EXT3_BANK]: Object.freeze({ base: UNIFIED_EXT3_BASE, count: UNIFIED_EXT3_CELL_COUNT, sheetKey: "ext3Sheet", cellsKey: "ext3Cells" }),
  [UNIFIED_EXT4_BANK]: Object.freeze({ base: UNIFIED_EXT4_BASE, count: UNIFIED_EXT4_CELL_COUNT, sheetKey: "ext4Sheet", cellsKey: "ext4Cells" }),
  [UNIFIED_EXT5_BANK]: Object.freeze({ base: UNIFIED_EXT5_BASE, count: UNIFIED_EXT5_CELL_COUNT, sheetKey: "ext5Sheet", cellsKey: "ext5Cells" }),
});

/**
 * v5.1: which unified rung each routed reaction stand-in is height-reconciled
 * to, and how — see the STAND-IN HEIGHT RECONCILIATION block above
 * swingStandInAdjust for the measurements and the match/ceiling rule.
 */
export const SWING_STAND_IN_TARGET = Object.freeze({
  [UNIFIED_EXT4_BANK]: Object.freeze({
    0: Object.freeze({ cell: 7, mode: "match" }),    // guard flinch  -> guard
    1: Object.freeze({ cell: 12, mode: "match" }),   // head snap     -> light hit
    2: Object.freeze({ cell: 0, mode: "ceiling" }),  // body blow     <= idle
    3: Object.freeze({ cell: 0, mode: "ceiling" }),  // big hit       <= idle
    4: Object.freeze({ cell: 0, mode: "ceiling" }),  // stagger/reel  <= idle
    // v5.2 LOCOMOTION (bookends): the wall splat (8) is the Final Blow
    // victim's rest from the slam to the end of the hold, under a 1.34x zoom.
    // Measured (drawn height x fit-restore over the unified idle, the
    // commissioner's fold on both sides) it sits at 0.87-1.03 of the idle on
    // all ten sheets — the commissioner's +2.5% is the only one over, inside
    // the deadband — so it takes no rule; tests/fatalities-poses pins that.
  }),
  [UNIFIED_EXT3_BANK]: Object.freeze({
    12: Object.freeze({ cell: 5, mode: "match" }),   // crouch guard  -> crouch
  }),
  // v5.2 LOCOMOTION — the ground and bookend stand-ins, by the same rule.
  // Measured on the shipped ext5 sheets against the unified rung (drawn
  // height x fit-restore, the commissioner's fold on both sides):
  //   turnaround   a standing plan between the idle, walk and guard rungs:
  //                MATCH the idle (commissioner +8.0%, cyraxx +5.9%, jez
  //                +5.1%, deathblow -6.6%, devil -4.9%; the rest inside 3%).
  //   entrances    a standing hold that releases to the idle before FIGHT!:
  //                MATCH (entrance B donald -10.0%, deathblow -9.6%, alan
  //                -4.7%, devil -7.8%; entrance A deathblow -7.0%, post -7.9%).
  //   crouch guard flinch  a crouch: MATCH the crouch rung like the ext3
  //                crouch guard it hands to (cyraxx +31.4%, commissioner
  //                +23.5%, ali +16.9%, donald +13.5%, the rest +7..9%; the
  //                clamp floor leaves cyraxx 5% over).
  //   power charge / victory / taunt  different plans (a wide low stance, the
  //                arms raised, a fist up): CEILING at the idle (victory
  //                donald +9.6%, cyraxx +8.9%, alan +5.8%; taunt jez +7.6%,
  //                commissioner +6.3%; charge cyraxx +4.7%, commissioner
  //                +4.5%) — a fighter does not grow for a pose.
  //   The three dash cells, the throw grab and the dizzy sway take exactly 1:
  //   a lunge, a lean and a sway are the motion, and each replaces a motion
  //   cell that never had a reconciliation either.
  [UNIFIED_EXT5_BANK]: Object.freeze({
    3: Object.freeze({ cell: 0, mode: "match" }),    // turnaround    -> idle
    8: Object.freeze({ cell: 0, mode: "ceiling" }),  // power charge  <= idle
    9: Object.freeze({ cell: 0, mode: "match" }),    // entrance A    -> idle
    10: Object.freeze({ cell: 0, mode: "match" }),   // entrance B    -> idle
    11: Object.freeze({ cell: 0, mode: "ceiling" }), // victory       <= idle
    12: Object.freeze({ cell: 0, mode: "ceiling" }), // taunt         <= idle
    13: Object.freeze({ cell: 5, mode: "match" }),   // crouch guard flinch -> crouch
  }),
});

/** Chain-constructor siblings of x2key for the swing sheets. SHEET FRAMES. */
export const x3key = (cell) => Object.freeze({ bank: UNIFIED_EXT3_BANK, cell });
export const x4key = (cell) => Object.freeze({ bank: UNIFIED_EXT4_BANK, cell });
export const x5key = (cell) => Object.freeze({ bank: UNIFIED_EXT5_BANK, cell });

/**
 * v5.2: an ext5 descriptor over the exact pre-5.2 chain, for the pose sites
 * game.js emits DIRECTLY rather than through a track or the substitution
 * table: the dash-exit brake, the turnaround latch, the intro entrance, the
 * win pose and the taunt. `cell` is a SHEET FRAME. The fallback matters on
 * the devil, whose motion2 dash brake is rejected — with the table alone his
 * dash exit would resolve base:12 and never be substituted.
 */
export function unifiedExt5Pose(cell, fallback) {
  return { bank: UNIFIED_EXT5_BANK, frame: cell, fallback };
}

export function swingFrame(bank, cell) {
  const spec = SWING_BANKS[bank];
  if (!spec) return -1;
  const frame = cell - spec.base;
  return frame >= 0 && frame < spec.count ? frame : -1;
}

/** Per-cell gate: the sheet must exist and the main sheet be whole; each cell then stands on its own accept flag. */
export function buildSwingAcceptMasks(manifest, bank, unifiedMasks = null) {
  const spec = SWING_BANKS[bank];
  const masks = {};
  for (const [fighterId, entry] of Object.entries(manifest?.fighters || {})) {
    const accept = new Array(spec.count).fill(false);
    for (const cell of entry?.[spec.cellsKey] || []) {
      const frame = swingFrame(bank, cell?.frame);
      if (frame >= 0) accept[frame] = cell.accept === true;
    }
    const mainWhole = unifiedMasks ? Boolean(unifiedMasks[fighterId]?.whole) : true;
    const whole = Boolean(entry?.[spec.sheetKey]) && mainWhole && accept.some(Boolean);
    masks[fighterId] = Object.freeze({
      whole,
      accept: Object.freeze(whole ? accept : new Array(spec.count).fill(false)),
      sheet: entry?.[spec.sheetKey] || null,
    });
  }
  return masks;
}

export function swingFighterIds(masks) {
  return Object.keys(masks || {}).filter((id) => masks[id]?.whole).sort();
}

/**
 * THE SUBSTITUTION TABLE. Given a resolved pose (bank, frame) and what the
 * fighter is doing, the same-family drawing that should stand in for it, or
 * null. Pure; the caller checks the target cell is drawable.
 *
 * ctx: { limb, heavy, crouching, attacking, airborne, victimAirborne, falling,
 *        bodyBlow, reeling, ko }
 *
 * v5.1 EXT4 ROUTING — WHY HALF THE REACTION SHEET NEVER DREW. 5.0 keyed the
 * head snap on motion2:9 and the big hit on motion:8, but every chain that
 * carries those links leads with a UNIFIED rung: reactionTrackKeys stacks
 * urung(ladder[band]) in front of the 2.9 chain, the airborne victim reads
 * uni(bigHit, motion bighit), the clinch uni(lightHit, motion2 lightHit).
 * All ten fighters are whole on the unified bank, so the resolved pose was
 * unified:12/13/14 on every hit and the motion links underneath were never
 * reached — traced light and heavy with every sheet whole: unified:12/13 ->
 * unified:14 / ext:7 -> unified:7 -> idle, no ext4 cell. The substitution
 * therefore has to key on the UNIFIED reaction cells too. It is the same
 * generation (ext4 is generated image-to-image from that sheet), so RULE 2's
 * connected-region objection to swapping a unified rung does not apply; the
 * idle, walk, guard and crouch stay untouched. The motion-family cases are
 * kept for the read a fighter off the bank would take.
 *
 *   unified:12 light hit  -> body blow when the landed hit was MID/LOW or the
 *                            victim is crouching (ctx.bodyBlow), else head snap
 *   unified:13 big hit    -> launched while carried, else big hit
 *   unified:14 stagger    -> the reel
 *   unified:15 knockdown  -> the KO lying cell, only once the round is decided
 *                            against this fighter (ctx.ko); the plain
 *                            knockdown keeps drawing the unified cell
 *   motion2:10 dizzy      -> the reel for the ONSET of a dizzy / guard crush
 *                            (ctx.reeling), then the ext4 slump and the ext5
 *                            sway alternating on ctx.swayBeat (v5.2)
 *
 * v5.2 LOCOMOTION — the ground and bookend cells of the ext5 sheet, keyed
 * on the motion cells the tracks and descriptors resolve. Context-free:
 *
 *   motion:7   dash       -> ext5:1 dash stretch (dashKeys also links the
 *                            launch / stretch / brake ahead of its motion
 *                            links, since the launch band's motion link is
 *                            the brake and the table cannot tell the two
 *                            brake bands apart)
 *   motion:12  charge     -> ext5:8 power charge (the super / EX stance)
 *   motion:13  victory2   -> ext5:11 victory
 *   motion:14  sig1       -> ext5:9 entrance A
 *   motion:15  sig2       -> ext5:10 entrance B
 *   motion2:5  turnaround -> ext5:3
 *   motion2:6  dash brake -> ext5:2 (the dash-exit tail, and the throw
 *                            recovery's brake fallback)
 *   motion2:12 throw grab -> ext5:14 (the clinch also links it in its load
 *                            band, since the seize band leads with ext2's
 *                            reach on every fighter)
 *
 * v5.2 LOCOMOTION (ext5-air) — the four AIR cells, keyed on the airborne
 * motion cells (the plain jump's track links them directly, see jumpArcKeys):
 *
 *   motion:5  tuck        -> ext3:8 air chamber for an airborne ATTACKER
 *                            (5.0); ext5:4 apex tuck for a neutral airborne
 *                            body — the air-tech flip's ball
 *   motion:11 airrec      -> ext4:10 falling once the knockdown is pending
 *                            (5.0); ext5:7 air-hit-upright (alt: the ext4
 *                            launched arch) for a victim CARRIED in a juggle;
 *                            ext5:6 air recover for any other airborne body —
 *                            the attacker's trail after an air strike, the
 *                            air-tech tail — with the 5.0 chain as its alts
 *                            (the ext descent where accepted, then the ext3
 *                            chamber); the ext3 land on the floor (5.0)
 *
 * NOT routed, on purpose: the air hit (7) and the FLOOR BOUNCE (11). Both
 * came out with the feet in the air on every sheet (the bounce is a body on
 * its shoulders, legs up), which is the read 4.6 took off the floor and the
 * owner's standing rule; there is also no ground-bounce sim state for the
 * bounce to mean anything. They stay drawn, gated and unrouted.
 */
export function swingSubstitute(bank, frame, ctx = {}) {
  const kick = ctx.limb === "kick";
  const E3 = UNIFIED_EXT3_CELLS, E4 = UNIFIED_EXT4_CELLS, E5 = UNIFIED_EXT5_CELLS;
  if (bank === UNIFIED_BANK) {
    switch (frame) {
      case UNIFIED_CELLS.lightHit:
        // The blockstun settle's fallback can land on the unified light hit too.
        if (ctx.blocking) return ctx.crouching ? { bank: UNIFIED_EXT3_BANK, frame: E3.crouchGuard } : { bank: UNIFIED_EXT4_BANK, frame: E4.guardFlinch };
        return { bank: UNIFIED_EXT4_BANK, frame: ctx.bodyBlow ? E4.bodyBlow : E4.headSnap };
      case UNIFIED_CELLS.bigHit: return { bank: UNIFIED_EXT4_BANK, frame: ctx.victimAirborne ? E4.launched : E4.bigHit };
      case UNIFIED_CELLS.stagger: return { bank: UNIFIED_EXT4_BANK, frame: E4.stagger };
      case UNIFIED_CELLS.knockdown: return ctx.ko ? { bank: UNIFIED_EXT4_BANK, frame: E4.ko } : null;
      default: return null;
    }
  }
  if (bank === "motion") {
    switch (frame) {
      case MOTION_CELLS.punchExt:
        return { bank: UNIFIED_EXT3_BANK, frame: ctx.crouching ? E3.crouchPunchExt : ctx.heavy ? E3.heavyPunchExt : E3.punchExt };
      case MOTION_CELLS.kickExt:
        return { bank: UNIFIED_EXT3_BANK, frame: ctx.crouching ? E3.sweep : ctx.heavy ? E3.heavyKickExt : E3.kickExt };
      case MOTION_CELLS.follow:
        if (!ctx.attacking) return null;
        // A crouching punch has no crouched follow-through drawing; its recover
        // cell (the arm halfway back, still crouched) holds instead of the
        // standing follow, which would pop him upright mid-swing.
        if (ctx.crouching && !kick) return { bank: UNIFIED_EXT2_BANK, frame: UNIFIED_EXT2_CELLS.crouchPunchRecover };
        return { bank: UNIFIED_EXT3_BANK, frame: kick ? (ctx.crouching ? E3.sweepFollow : E3.kickFollow) : E3.follow };
      case MOTION_CELLS.smearH: return { bank: UNIFIED_EXT3_BANK, frame: E3.smearH };
      case MOTION_CELLS.smearV: return { bank: UNIFIED_EXT3_BANK, frame: E3.smearV };
      case MOTION_CELLS.land: return { bank: UNIFIED_EXT3_BANK, frame: E3.land };
      case MOTION_CELLS.tuck:
        if (ctx.attacking && ctx.airborne) return { bank: UNIFIED_EXT3_BANK, frame: E3.airChamber };
        // v5.2 (ext5-air): a NEUTRAL airborne tuck — the air-tech flip's ball
        // (the plain jump's tuck band leads with unified:9 and never resolves
        // this cell) — is the apex tuck, so the flip stays on the family.
        if (ctx.airborne) return { bank: UNIFIED_EXT5_BANK, frame: E5.apexTuck };
        return null;
      case MOTION_CELLS.bighit: return { bank: UNIFIED_EXT4_BANK, frame: ctx.victimAirborne ? E4.launched : E4.bigHit };
      case MOTION_CELLS.airrec:
        // A launched victim: the falling cell once the knockdown is pending.
        // The ext4 air-hit cell (E4.airHit) came out INVERTED on every sheet
        // — head down, feet in the air, the read 4.6 removed from the floor —
        // so it stays drawn but unrouted.
        if (ctx.falling) return { bank: UNIFIED_EXT4_BANK, frame: E4.falling };
        // v5.2 (ext5-air): a victim CARRIED in a juggle (airborne hitstun,
        // not yet falling with the knockdown pending) wears the ext5 upright
        // air hit — a body folding over the blow, head above the hips on all
        // ten sheets — where 5.0/5.1 held the launched arch for the whole
        // carry. The arch stays the LAUNCH's opener (unified:13 / motion:8
        // while rising fast) and this cell's alt for a held sheet.
        if (ctx.victimAirborne) return { bank: UNIFIED_EXT5_BANK, frame: E5.airHitUpright, alt: { bank: UNIFIED_EXT4_BANK, frame: E4.launched } };
        // v5.2 (ext5-air): the ATTACKER's trail after an air strike, the
        // air-tech flip's tail and the plain jump's last airborne band are
        // the ext5 air recover — limbs loose, the same key's own meaning —
        // and NEVER the chambered air cell again (5.0 drew the chamber here
        // on the five sheets whose ext descent was rejected, which put a
        // chamber -> strike -> chamber rewind on every air normal). The 5.0
        // chain is the degrade path behind it, in its order: the ext descent
        // where a sheet accepted it (ali), then the chamber. The same key on
        // the floor is the landing footing, the land cell held.
        if (ctx.airborne) {
          return {
            bank: UNIFIED_EXT5_BANK, frame: E5.airRecover,
            alt: { bank: UNIFIED_EXT_BANK, frame: UNIFIED_EXT_CELLS.jumpDescend, alt: { bank: UNIFIED_EXT3_BANK, frame: E3.airChamber } },
          };
        }
        return { bank: UNIFIED_EXT3_BANK, frame: E3.land };
      case MOTION_CELLS.wallsplat: return { bank: UNIFIED_EXT4_BANK, frame: E4.wallSplat };
      case MOTION_CELLS.crumple: return { bank: UNIFIED_EXT4_BANK, frame: E4.crumple };
      // v5.2 LOCOMOTION — the ground and bookend cells. Context-free: each
      // motion cell here has exactly one meaning wherever a track resolves it.
      case MOTION_CELLS.dash: return { bank: UNIFIED_EXT5_BANK, frame: E5.dashStretch };
      case MOTION_CELLS.charge: return { bank: UNIFIED_EXT5_BANK, frame: E5.powerCharge };
      case MOTION_CELLS.victory2: return { bank: UNIFIED_EXT5_BANK, frame: E5.victory };
      case MOTION_CELLS.sig1: return { bank: UNIFIED_EXT5_BANK, frame: E5.entranceA };
      case MOTION_CELLS.sig2: return { bank: UNIFIED_EXT5_BANK, frame: E5.entranceB };
      default: return null;
    }
  }
  if (bank === "motion2") {
    switch (frame) {
      // v5.2 LOCOMOTION: the pivot, the brake (the dash-exit tail and the
      // throw recovery's brake fallback), the seize.
      case MOTION2_CELLS.turnaround: return { bank: UNIFIED_EXT5_BANK, frame: E5.turnaround };
      case MOTION2_CELLS.dashBrake: return { bank: UNIFIED_EXT5_BANK, frame: E5.dashBrake };
      case MOTION2_CELLS.throwGrab: return { bank: UNIFIED_EXT5_BANK, frame: E5.throwGrab };
      case MOTION2_CELLS.airAttack: return { bank: UNIFIED_EXT3_BANK, frame: kick ? E3.airKick : E3.airPunch };
      // The heavy windup's COMPRESS band is the stand<->crouch bridge; with
      // the whole swing on the unified family now, the unified crouch
      // transition is the same-generation drawing for it.
      case MOTION2_CELLS.crouchTrans: return ctx.attacking && !ctx.crouching ? { bank: UNIFIED_BANK, frame: UNIFIED_CELLS.crouchTrans } : null;
      // A crouching fighter's block flinch is the ext3 crouch guard, never the
      // standing cover (the reason the standing branch was gated on !crouch).
      case MOTION2_CELLS.blockHit: return ctx.crouching ? { bank: UNIFIED_EXT3_BANK, frame: E3.crouchGuard } : { bank: UNIFIED_EXT4_BANK, frame: E4.guardFlinch };
      case MOTION2_CELLS.lightHit:
        // A blocked hit's settle fallback lands here too: keep the flinch.
        if (ctx.blocking) return ctx.crouching ? { bank: UNIFIED_EXT3_BANK, frame: E3.crouchGuard } : { bank: UNIFIED_EXT4_BANK, frame: E4.guardFlinch };
        return { bank: UNIFIED_EXT4_BANK, frame: ctx.bodyBlow ? E4.bodyBlow : E4.headSnap };
      case MOTION2_CELLS.dizzy:
        // v5.1: the reel for the onset. v5.2: then the loop ALTERNATES the
        // ext4 slump with the ext5 sway on its own beat (ctx.swayBeat, the
        // resolver's 12-tick parity of the dizzy clock) instead of holding
        // one cell for the 116 ticks after the reel; the slump is the alt
        // where the sway cannot draw, so the loop never leaves the family.
        if (ctx.reeling) return { bank: UNIFIED_EXT4_BANK, frame: E4.stagger };
        if (ctx.swayBeat) return { bank: UNIFIED_EXT5_BANK, frame: E5.dizzySway, alt: { bank: UNIFIED_EXT4_BANK, frame: E4.dizzy } };
        return { bank: UNIFIED_EXT4_BANK, frame: E4.dizzy };
      case MOTION2_CELLS.getupA: return { bank: UNIFIED_EXT4_BANK, frame: E4.getupA };
      case MOTION2_CELLS.getupB: return { bank: UNIFIED_EXT4_BANK, frame: E4.getupB };
      case MOTION2_CELLS.thrown: return { bank: UNIFIED_EXT4_BANK, frame: E4.thrown };
      default: return null;
    }
  }
  return null;
}

/** Which ext2 cell opens a kit-less normal, by limb and stance. */
export function inbetweenWindupCell(limb, { heavy = false, crouching = false } = {}) {
  const kick = limb === "kick";
  if (crouching) return kick ? UNIFIED_EXT2_CELLS.crouchKickWindup : UNIFIED_EXT2_CELLS.crouchPunchWindup;
  if (heavy) return kick ? UNIFIED_EXT2_CELLS.heavyKickWindup : UNIFIED_EXT2_CELLS.heavyPunchWindup;
  return kick ? UNIFIED_EXT2_CELLS.kickWindup : UNIFIED_EXT2_CELLS.punchWindup;
}

/** Which ext2 cell a kit-less normal recovers on, by limb and stance. */
export function inbetweenRecoverCell(limb, { heavy = false, crouching = false } = {}) {
  const kick = limb === "kick";
  if (crouching) return kick ? UNIFIED_EXT2_CELLS.crouchKickRecover : UNIFIED_EXT2_CELLS.crouchPunchRecover;
  if (heavy) return kick ? UNIFIED_EXT2_CELLS.heavyKickRecover : UNIFIED_EXT2_CELLS.heavyPunchRecover;
  return kick ? UNIFIED_EXT2_CELLS.kickRecover : UNIFIED_EXT2_CELLS.punchRecover;
}

/**
 * A LIGHT's anticipation (and a crouching heavy's): one drawing over the
 * whole startup, the limb cocked. Without `inbetween` the chain is empty and
 * the caller's per-tick base read (cell 8 then 9) shows exactly as before.
 */
export function lightWindupKeys(limb, { inbetween = false, heavy = false, crouching = false } = {}) {
  return [
    { at: 0, chain: inbetween ? [x2key(inbetweenWindupCell(limb, { heavy, crouching }))] : [] },
  ];
}

// ---------------------------------------------------------------------------
// v4.0 — THE SIX-KEY ALTERNATING WALK, and the end of the single-phase stride.
//
// Everything the block above says about the four-key cycle was true of a 3.0
// sheet and is no longer true of a 4.0 one. The 3.0 walk was SINGLE-PHASE by
// decision: cells 1 and 3 carried the same lead leg, because five attempts at
// prompting a phase inversion had failed and splitting the walk into its own
// generation would have put a cross-generation seam back at idle->walk.
//
// The 4.0 sheets invert. The prompt technique that finally worked declares the
// NEAR leg to be one FIXED PHYSICAL LIMB, drawn on top and lit in all six
// panels, whose only change is WHICH WAY IT POINTS — forward in panels 1-3,
// backward in 4-6, swapping exactly once. Verified at 1:1 by a named costume
// object that swaps ends between the contacts (benny's thigh cargo pocket, the
// commissioner's coat lining and pale cane tip, alan's faded-denim highlight).
// So on a 4.0 fighter the two contact keys genuinely lead with OPPOSITE legs —
// the defect MOTION-ATLAS has recorded since the walk bank was authored.
//
// THE CYCLE IS 1 -> 17 -> 2 -> 3 -> 18 -> 4, six drawings where there were
// four. 17 and 18 are the WEIGHT-SINKING beats: the body at its lowest, just
// after each contact, which is the in-between a four-key cycle skips and the
// reason the old stride read as a glide even when the legs were right.
//
// CADENCE IS PRESERVED EXACTLY, and this is the part that is easy to get
// wrong. The four keys ran at `walkTime * 10`, so one full gait cycle took
// 0.4s. Six keys at the same 10 keys/s would take 0.6s — the legs would cycle
// 33% slower than the body travels and the fighter would SKATE, which is the
// very fault the 3.5 stride clock was written to remove. The six-key cycle
// therefore runs at `walkTime * 15`: six keys at 15/s is 0.4s, the identical
// gait frequency and the identical ground-distance per stride. More drawings,
// same walk.
//
// The stride clock is untouched. `strideClockAdvance` still signs the phase by
// `vx * facing`, and `walkCycleFrameExt` normalises a negative phase into the
// grammar exactly as `walkCycleFrame` does, so a RETREAT plays these six keys
// in reverse — 4 -> 18 -> 3 -> 2 -> 17 -> 1 — and the legs un-step through the
// new in-betweens too.
// ---------------------------------------------------------------------------

/** Keys per gait cycle on a 4.0 (ext) sheet. */
export const UNIFIED_EXT_WALK_KEY_COUNT = 6;

/**
 * Keys per second for the six-key cycle. `WALK_CELL_COUNT / 0.1` is the 10/s
 * the four-key cycle has always used; this is the rate that keeps the GAIT
 * PERIOD identical while stepping through six drawings instead of four.
 */
export const UNIFIED_EXT_WALK_RATE = 15;

/**
 * The six-key cycle, as `{ cell, ext }` links in stride order. `ext: true`
 * means the cell is a SHEET FRAME on the ext sheet; `ext: false` means it is a
 * main-sheet cell.
 *
 * `under` is the four-key index this key falls back to when the ext sheet is
 * missing or still decoding — the drawing the pre-4.0 cycle would have been on
 * at that point in the stride, so the degraded read is a real walk and not a
 * hole.
 */
export const UNIFIED_EXT_WALK_KEYS = Object.freeze([
  Object.freeze({ cell: UNIFIED_CELLS.walkContactA, ext: false, under: 0 }),
  Object.freeze({ cell: UNIFIED_EXT_CELLS.walkDownA, ext: true, under: 0 }),
  Object.freeze({ cell: UNIFIED_CELLS.walkPassingA, ext: false, under: 1 }),
  Object.freeze({ cell: UNIFIED_CELLS.walkContactB, ext: false, under: 2 }),
  Object.freeze({ cell: UNIFIED_EXT_CELLS.walkDownB, ext: true, under: 2 }),
  Object.freeze({ cell: UNIFIED_CELLS.walkPassingB, ext: false, under: 3 }),
]);

/**
 * Which of the SIX keys this stride phase is on. Same shape and the same
 * negative-phase normalisation as `walkCycleFrame`, at the rate that holds the
 * gait period at the four-key cycle's 0.4s.
 */
export function walkCycleFrameExt(walkTime) {
  const time = Number.isFinite(walkTime) ? walkTime : 0;
  const phase = Math.floor(time * UNIFIED_EXT_WALK_RATE);
  const n = UNIFIED_EXT_WALK_KEY_COUNT;
  return ((phase % n) + n) % n;
}

/**
 * THE UNIFIED REACTION LADDER — one cell per REACTION_BANDS band, and the only
 * place a unified fighter's reaction reads from.
 *
 * v3.0 critic round (M1) — THE LIGHT REACTION WAS A-B-A ON ALL NINE.
 *
 * The first cut layered unified links onto the 2.9 track and left the CALLER's
 * band ladder (snap / fold / settle / idle over fixed band groups) underneath
 * it. The two ladders were a band out of step, so the light track measured, on
 * every unified fighter:
 *
 *   unified:12 -> unified:14 -> motion2:10 -> unified:14 -> unified:7
 *
 * — the stagger, a cross-generation detour to the rubber-legs key, and then a
 * RETURN to the stagger for 6-8 ticks. Returning to a drawing the animation
 * has already left is precisely the rewind hitch the 2.9 throw-recovery fix
 * (R7) was written to eliminate, and the two motion2 boundaries measured 9.85
 * dE each on jez with nothing over them.
 *
 * The ladder is now EXPLICIT, MONOTONIC and entirely inside one generation.
 * One entry per band; no cell is ever returned to after the beat leaves it:
 *
 *   light   12 light-hit -> 14 stagger -> 6 crouch-trans -> 7 guard -> 0 idle
 *   heavy   13 big-hit -> 12 light-hit -> 14 stagger -> 7 guard -> 0 idle
 *
 * Read at 1:1 on the sheets, that is a rising recovery: struck, folded over
 * with the knees buckled, half-risen with the guard reforming, braced, back to
 * the stance. `crouch-trans` earns its place in the light track — it is not a
 * duck, it is a compressed fighting stance with the fists already up, which is
 * exactly the in-between between a folded stagger and a standing brace, and
 * the same kind of re-use motion2:4 already gets as the heavy-windup coil and
 * the landing gather. The heavy does not need it: it already has four rungs
 * before the tail. BOTH tracks end on the guard, whose drawn height is within
 * 3% of the idle on all nine sheets, so the last transition of every reaction
 * is height-flat. Measured roster-wide the light reaction goes 2 crossings and
 * 9.85 dE worst to ZERO crossings, and the heavy 2 and 11.20 to ZERO.
 *
 * The tracks' openings and middles still differ (13/12 against 12/14), which
 * is the 2.9 M5 contract, and the two tracks converge only on the shared tail.
 *
 * v3.0 critic round (m1) — WHERE THE LADDER ENDS, and the Commissioner.
 *
 * 2.9 DROPPED its third tail band (`settle`) for any fighter whose base sheet
 * cannot supply three distinct non-attack drawings — reactionFallbackCells
 * returns settle:null when `stagger` is null or equal to `hit` — and handed
 * band 4 straight to the breathing idle. That is eight of the nine unified
 * fighters, the Commissioner among them (guard 12 === hit 12, stagger null).
 * The first 3.0 cut gave the band back unconditionally, and because a measured
 * reaction runs ~30 ticks against a 44-tick band grid, band 4 is only ever 2-3
 * ticks long: he got a two-tick flash of the unified brace before the idle.
 * A 2-tick band is a blip, not a beat.
 *
 * So BOTH ladders hand to the breathing idle from band 4 (tick 28 of 44) on
 * EVERY fighter — which is exactly the tick 2.9 handed the Commissioner (and
 * seven others) to it. No per-fighter branch: where the bank's ladder ends is
 * a uniform design decision, like which beats it owns. The rungs are packed
 * into bands 0-3, the four that a real reaction actually plays.
 */
/*
 * v4.0 — THE MID-REACTION RUNG.
 *
 * The ext sheet's cell 23 is drawn as "a heavier flinch, halfway to being
 * floored: doubled forward over the waist, both arms dropping open and loose,
 * head down, knees buckling" — the in-between between the light recoil (12) and
 * the blasted arch (13), which is exactly what the manifest's integration order
 * asks for with "12 -> 23 -> 13 in the reaction ladder".
 *
 * It goes in WITHOUT changing the band grid, and that constraint is what picks
 * the shape. Two 3.0 decisions are load-bearing here and neither moves:
 *   - band 4 hands to the breathing idle on EVERY fighter (the m1 finding: a
 *     2-3 tick rung is a blip, not a beat), so a rung cannot be appended;
 *   - band 3 is the GUARD on both tracks, whose drawn height is within 3% of
 *     the idle, which is what makes the last transition of every reaction
 *     height-flat.
 * So 23 has to displace a rung inside bands 0-2, and the honest one to displace
 * is different per track:
 *   HEAVY  13 -> 12 -> 14 -> 7   becomes   13 -> 23 -> 14 -> 7
 *          The light-hit rung goes. A heavy reaction passing through the LIGHT
 *          hit drawing was always the weakest rung on the ladder; 23 is drawn
 *          for this exact position and is a heavier fold, so the recovery reads
 *          blasted back -> doubled over -> stumbling -> braced.
 *   LIGHT  12 -> 14 -> 6 -> 7    becomes   12 -> 14 -> 23 -> 7
 *          The crouch-TRANSITION rung goes. 3.0 borrowed it because no drawing
 *          existed for the beat and it is a compressed stance with the fists
 *          up; 23 is a drawing of being hurt, made for it. Swapping a re-used
 *          neutral cell for a purpose-drawn reaction cell is the whole point of
 *          the wave.
 *
 * The M5 distinctness contract is kept and strengthened: the openings still
 * differ (13 against 12), and now bands 1 AND 2 differ too (23/14 against
 * 14/23) where 3.0 had them differ at 12/14 and 14/6. The two tracks still
 * converge only on the shared guard tail, and neither ladder returns to a cell
 * it has left.
 */
export function unifiedReactionLadder(heavy, { extended = false } = {}) {
  const C = UNIFIED_CELLS;
  const mid = unifiedExtCell(UNIFIED_EXT_CELLS.midReaction);
  if (extended) {
    return heavy
      ? Object.freeze([C.bigHit, mid, C.stagger, C.guard, C.idle, C.idle])
      : Object.freeze([C.lightHit, C.stagger, mid, C.guard, C.idle, C.idle]);
  }
  return heavy
    ? Object.freeze([C.bigHit, C.lightHit, C.stagger, C.guard, C.idle, C.idle])
    : Object.freeze([C.lightHit, C.stagger, C.crouchTrans, C.guard, C.idle, C.idle]);
}

/**
 * The ladder rung for the band a key sits in. game.js holds the key, not the
 * band index, and both must read the same table or they drift out of step —
 * which is the bug M1 is.
 */
export function unifiedReactionCellAt(at, heavy, options = undefined) {
  const ladder = unifiedReactionLadder(heavy, options);
  let index = 0;
  for (let band = 0; band < REACTION_BANDS.length; band += 1) {
    if ((at ?? 0) >= REACTION_BANDS[band]) index = band;
  }
  return ladder[index];
}

/**
 * Fold a key's chain onto a fallback into one pose descriptor. A key may pin
 * its OWN terminal fallback (`key.fallback`) when the beat it replaces showed
 * a different base cell there than the rest of the track — that is how each
 * track stays byte-identical to the pre-fix read when no sheet is on disk.
 */
export function beatKeyPose(key, fallback) {
  let pose = key?.fallback || fallback;
  const chain = key?.chain || [];
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const link = chain[index];
    pose = link.bank === MOTION3_BANK
      ? motion3Pose(link.key, pose)
      : { bank: link.bank, frame: link.cell, fallback: pose };
  }
  return pose;
}

/**
 * Pick the key whose band contains `progress` (0..1). Bands are `at` values in
 * ascending order; the first key's `at` must be 0.
 */
export function pickBeatKey(keys, progress) {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const point = progress <= 0 ? 0 : progress >= 1 ? 0.999999 : progress;
  let chosen = keys[0];
  for (const key of keys) {
    if (point >= key.at) chosen = key;
    else break;
  }
  return chosen;
}

/** pickBeatKey + beatKeyPose in one call: the shape every consumer wants. */
export function beatPoseAt(keys, progress, fallback) {
  const key = pickBeatKey(keys, progress);
  // `fallback` may be a FUNCTION of the key. Tracks whose bands land on
  // different base cells (the reaction tracks' stagger/guard/idle reads, the
  // throw tail's kit-cell/idle split) need that: two bands that degrade to the
  // SAME cell are one hold, which is the trap round 1 fell into.
  const resolveFallback = (chosen) => (typeof fallback === "function" ? fallback(chosen) : fallback);
  return key ? beatKeyPose(key, resolveFallback(key)) : resolveFallback(null);
}

/**
 * What a key ACTUALLY DRAWS with no motion3 bank on disk — the first link of
 * its chain that is not a motion3 slot, or the caller's fallback. This is the
 * resolution the hold-budget audit uses, because "two neighbouring motion3
 * slots that both degrade to the same authored cell" is one hold, not two.
 */
export function defaultBeatKeyResolve(key, {
  motion3 = false, unified = false, ext = false, ext2 = false, swing = false, fallback = null,
} = {}) {
  for (const link of key?.chain || []) {
    // v4.9: an ext2 link is skipped unless the caller audits a fighter who
    // HAS the in-between sheet, so every earlier budget keeps its meaning.
    if (link.bank === UNIFIED_EXT2_BANK) {
      if (ext2) return `unified-ext2:${link.cell}`;
      continue;
    }
    // v5.1: the same for a swing-sheet link (the crouch blockstun flinch).
    // v5.2: ext5 rides the same `swing` answer.
    if (link.bank === UNIFIED_EXT3_BANK || link.bank === UNIFIED_EXT4_BANK || link.bank === UNIFIED_EXT5_BANK) {
      if (swing) return `${link.bank}:${link.cell}`;
      continue;
    }
    if (link.bank === MOTION3_BANK) {
      if (motion3) return `motion3:${link.key}`;
      continue;
    }
    // v4.0: an ext link is skipped exactly like a motion3 slot or a unified one
    // unless the caller is auditing a fighter who HAS an ext sheet. Five
    // fighters have none, so the pre-4.0 audit (`ext: false`) still measures
    // the 3.5 read and every budget assertion keeps its original meaning.
    if (link.bank === UNIFIED_EXT_BANK) {
      if (ext) return `unified-ext:${link.cell}`;
      continue;
    }
    // v3.0: a unified link is skipped exactly like a motion3 slot unless the
    // caller is auditing a UNIFIED fighter. Two fighters are not on the bank,
    // so the shipping-today audit (`unified: false`) still measures the 2.9
    // read and every 2.9 budget assertion keeps its original meaning.
    if (link.bank === UNIFIED_BANK) {
      if (unified) return `unified:${link.cell}`;
      continue;
    }
    return `${link.bank}:${link.cell}`;
  }
  // An empty chain defers to the CALLER's per-band fallback. The audit must
  // not assume two such bands draw the same cell (they deliberately do not),
  // so they are distinguished by band unless the caller says otherwise.
  return typeof fallback === "function" ? fallback(key) : fallback || `fallback@${key?.at ?? 0}`;
}

/**
 * Audit hook for the hold budget: the tick length of every band of a key list
 * when the beat runs for `spanTicks`. Adjacent bands that resolve to the SAME
 * drawing are merged first — two neighbouring keys that fall back to one cell
 * are one hold, not two, which is exactly the trap the round-1 reaction track
 * fell into.
 */
export function beatKeyRuns(keys, spanTicks, resolve = defaultBeatKeyResolve) {
  const span = Math.max(1, Math.round(spanTicks));
  const cells = [];
  for (let tick = 0; tick < span; tick += 1) {
    const key = pickBeatKey(keys, tick / span);
    cells.push(key ? resolve(key) : "none");
  }
  const runs = [];
  let current = null;
  for (const cell of cells) {
    if (current && current.cell === cell) current.ticks += 1;
    else { current = { cell, ticks: 1 }; runs.push(current); }
  }
  return runs;
}

/** The worst hold in a key list at a given span — what the budget test asserts. */
export function longestBeatHold(keys, spanTicks, resolve) {
  return beatKeyRuns(keys, spanTicks, resolve).reduce((worst, run) => Math.max(worst, run.ticks), 0);
}

// ---------------------------------------------------------------------------
// v2.9 FLOW — the second authored bank (assets/motion2, MOTION-ATLAS.md
// "Motion2 bank"): sixteen transition/anticipation keys targeting every beat
// that still snapped after 2.7. Same architecture as bank 1 — descriptors are
// pure sim-state, the manifest gates per-cell acceptance through the same
// buildMotionAcceptMasks shape, and every motion2 descriptor carries the
// exact pre-2.9 beat as its fallback. A motion2 cell is a bonus, never a
// dependency.
// ---------------------------------------------------------------------------

export const MOTION2_CELLS = Object.freeze({
  windupPunch: 0, windupKick: 1, walkA: 2, walkB: 3, crouchTrans: 4,
  turnaround: 5, dashBrake: 6, jumpRise: 7, blockHit: 8, lightHit: 9,
  dizzy: 10, thrown: 11, throwGrab: 12, airAttack: 13, getupA: 14, getupB: 15,
});

export function motion2Pose(cell, fallbackBank, fallbackFrame) {
  return { bank: "motion2", frame: cell, fallback: { bank: fallbackBank, frame: fallbackFrame } };
}

/**
 * v2.9 FLOW: the sequenced wake-up rise — knee-up push-off (getup-a) through
 * the half-risen crouch (getup-b) — mapped onto the existing knockdown
 * recovery countdown, ending the old teleport-to-feet. Pure function of the
 * snapshotted counter; fallbacks are byte-for-byte the pre-2.9 cells
 * (down/hit 15, then the crouched gather 12).
 */
export function wakeupMotionPose(wakeupFrames, roles = DEFAULT_BASE_ROLES, totalFrames = 16) {
  if (!(wakeupFrames > 0)) return null;
  const total = Math.max(1, totalFrames);
  return beatPoseAt(wakeupKeys(total, roles), 1 - wakeupFrames / total, null);
}

/**
 * v2.9 critic round 2 (M3) — the wake-up ENTRY bridge. The rise END was fixed
 * in round 1; the START then hard-cut, base:15 (flat on his back, a horizontal
 * body) straight to motion2:14 (kneeling, one hand on the floor) in ONE tick —
 * about 90 degrees of torso rotation and ~150px of head rise with nothing
 * between. The first ticks now wear the authored crumple key (a folded body
 * still low to the street: the collapse pose played backwards is exactly the
 * missing in-between), and wakeupRiseTransform opens with a matching pitch, so
 * the sequence reads prone -> folding up -> knee up -> half-risen -> standing.
 * The crumple key falls back to base `hit`, which is the flat-on-back cell the
 * pre-fix read showed at that moment, so a missing bank changes nothing.
 */
export function wakeupKeys(totalFrames = 16, roles = DEFAULT_BASE_ROLES) {
  // v3.0: both terminal fallbacks are beats the unified bank owns — the prone
  // read is its knockdown, the gather is its crouch — so a unified fighter
  // cannot show a base cell here either. The 2.9 base cell stays underneath
  // each one, so the read is byte-identical off the bank.
  const prone = unifiedPose(UNIFIED_CELLS.knockdown,
    { bank: "base", frame: Number.isInteger(roles.hit) ? roles.hit : 15 });
  const gather = unifiedPose(UNIFIED_CELLS.crouch,
    { bank: "base", frame: Number.isInteger(roles.crouch) ? roles.crouch : 12 });
  return [
    { at: 0, chain: [m1key(MOTION_CELLS.crumple)], fallback: prone },
    { at: totalFrames > 12 ? 0.18 : 0.12, chain: [m2key(MOTION2_CELLS.getupA)], fallback: prone },
    { at: 0.46, chain: [m3key(MOTION3_KEYS.getupRoll), m2key(MOTION2_CELLS.getupA)], fallback: prone },
    { at: 0.62, chain: [m2key(MOTION2_CELLS.getupB)], fallback: gather },
  ];
}

// ---------------------------------------------------------------------------
// v2.9 critic round 2 (B1) — the long-beat KEY TRACKS.
//
// Each returns an `{ at, chain, fallback? }` list over the beat's own
// normalised progress. Measured round-1 holds, and what each track does:
//
//   JUMP ARC       28 ticks on the tuck cell covering the apex AND the whole
//                  descent. Now rise -> tuck -> [apex] -> [descend] -> airrec
//                  -> land: four real body plans today, six with motion3.
//   AIR NORMAL     30 ticks on ONE cell for startup + active + recovery. Now
//                  chamber (tuck) -> strike (air-attack) -> trail (airrec) ->
//                  gather (land).
//   HEAVY WINDUP   17 ticks (kick) / 11 (punch) on the chamber cell. Now the
//                  weight GATHERS on the charge stance before the limb cocks.
//   DASH           10 ticks on the stretch cell with a 90-degree entry pop and
//                  a 2-tick exit. Now launch -> stretch -> brake, and the
//                  brake owns the velocity decay instead of the idle.
//   THROW RECOVERY 31 ticks on one kit cell. Now release -> follow-through ->
//                  stance -> idle cycle.
//   REACTION       the heavy opened on big-hit for 4 ticks and then dropped
//                  into the SAME cell the light track uses. The two tracks now
//                  differ through their middles, and both end on the idle
//                  cycle instead of pinning the guard cell for a dozen ticks.
//
// Every chain ends at a shipping-today authored or base cell, so no track
// depends on motion3 existing.
// ---------------------------------------------------------------------------

/**
 * The ballistic arc, 0 = takeoff, 0.5 = apex, 1 = touchdown. `bandStart` is
 * the fighter-specific progress at which the tuck may open (donald's base
 * ascent cell is his golf swing, so his opens almost immediately — kept
 * exactly as 2.7 shipped it).
 */
export function jumpArcKeys(bandStart = 0.17, { extended = false, descend = false, air = false } = {}) {
  // donald's band used to open at 0.06 because his BASE ascent cell is the
  // golf swing and a plain jump wore it for ~10 ticks. That workaround is
  // superseded: since 2.9 the ascent wears the authored jump-rise key, so his
  // opening is clamped back into the roster's range — leaving it at 0.06 gave
  // him a 3-tick rise and a 20-tick tuck, which is the very hold this track
  // exists to break.
  // v2.9 final round (T5): the clamp window moved down from [0.18, 0.26].
  // The RISE band is linear in time (progress maps vy, and vy is linear in
  // time under constant gravity), so its width in progress is its width in
  // ticks: at 0.22 of a 46-tick arc that is 10 ticks on motion2:7, which is
  // the measured overrun. 0.17 is 7.8.
  const open = Math.min(0.20, Math.max(0.15, bandStart));
  // The airborne middle is divided RELATIVE to the opening, so an earlier or
  // later tuck cannot stretch one band past the budget.
  const span = 0.72 - open;
  // v3.0 critic round (RULE 2) — THE JUMP ARC IS A MOTION CHAIN, END TO END.
  //
  // The first cut routed the unified rise and tuck into the first two bands
  // and left the descent (motion:11), the air-recovery (motion:11) and the
  // landing gather (motion:6) where they were. That put a generation crossing
  // in the MIDDLE OF THE AIR: deathblow's unified:9 handed to motion:11 at
  // 7.56 dE — inside his 7.29-7.45 known-bad strobe band — and HELD it 15+
  // ticks, fully airborne, centre-frame, with no smear, flash or dust over it.
  // It is the largest and longest-held seam the 3.0 build had.
  //
  // Both cells are retired from this track. The arc is now motion2:7 -> the
  // motion tuck -> [motion3 apex] -> [motion3 descent] -> motion:11 -> the
  // motion landing gather: one generation from takeoff to touchdown, with its
  // only two crossings at the moments the fighter actually leaves and rejoins
  // the street (unified:0 -> motion2:7 at 5.13 dE, motion:6 -> unified:6 at
  // 5.55 dE on deathblow, both one tick, both under dust). Measured roster-
  // wide that is a worst crossing of 8.31 dE mean — better than the first 3.0
  // cut (9.17) AND better than 2.9 (9.08).
  //
  // The LANDING GATHER stays unified: it is the crouch-transition beat in its
  // own connected neighbourhood (gather -> plant -> stand -> idle), not an
  // airborne one.
  //
  // v4.0 — THE ASCENT IS OWNED. THE DESCENT IS NOT, AND THAT IS A MEASUREMENT.
  //
  // routingNote kept unified:8 and :9 on the sheet "waiting for a future wave
  // that can own a WHOLE airborne or attack chain", and the ext sheet was drawn
  // to be that wave: cell 19 "jump ascent, higher" and cell 20 "jump descent,
  // falling" are exactly the two drawings the 3.0 arc was missing, and they are
  // the same generation as 8 and 9. The integration order asks for the whole
  // chain, 8 -> 19 -> 9 -> 20.
  //
  // HALF OF THAT SHIPPED CORRECTLY AND HALF DID NOT, so only half is routed.
  //
  // Cell 19 is right: on all five sheets it is a genuinely airborne figure,
  // stretched upward, arms up, legs trailing loose below — a taller, later
  // reading of cell 8, which is what an ascent is.
  //
  // CELL 20 IS A HIT REACTION. Read at 1:1 against each fighter's own cells 12
  // and 13 it is their sibling, not an airborne pose: head thrown back, spine
  // arched BACKWARD, arms flung open and limp. The prompt asked for "torso
  // upright, legs unfolding and REACHING DOWN, arms out for balance" and every
  // one of the five came back arched over backwards — benny's is nearly
  // horizontal and alan's is all but indistinguishable from his own big-hit.
  // The generator ran the row as reactions and swept the panel in with them.
  // This is a GENERATION defect across the whole ext wave, not one bad fighter.
  // Routed into the descent it would play a flinch on the way down out of every
  // single jump, which is a worse fault than the hold it would have broken.
  //
  // So the bank owns the ASCENT — a real connected sub-region, idle -> rise ->
  // ascent, three consecutive drawings from one generation ending at the tuck —
  // and hands the apex, the fall, the air-recovery and the landing back to the
  // motion family exactly as 3.0 shipped them. Crossing count is UNCHANGED at
  // one: 3.0 crossed at takeoff (unified:0 -> motion2:7), this crosses one band
  // later at ascent -> tuck. What is bought is the 10-12 tick rise splitting
  // into two drawings, both the fighter's own.
  //
  // unified:9 stays retired with 20: with no usable descent after it the tuck
  // would hand straight to a motion cell in mid-air, which is the precise
  // 7.56-dE-held-15-ticks configuration the 3.0 critic round measured and
  // removed. One cell cannot own a chain — that is RULE 2, and it still binds.
  //
  // A fighter WITHOUT an ext sheet takes the 3.0 array below unchanged, retired
  // cells and all.
  //
  // v4.1 — AND ON ONE FIGHTER THE WHOLE CHAIN IS NOW OWNABLE.
  //
  // Everything above is a statement about the five 4.0 sheets. ali's cell 20
  // came back as a real feet-first descent (see UNIFIED_EXT_OPTIONAL_CELLS for
  // the measurement), which is the cell this arc has been missing since 3.0 —
  // and its absence is the ONLY reason unified:9 was retired with it: "with no
  // usable descent after it the tuck would hand straight to a motion cell in
  // mid-air". That reason is conditional and it no longer holds for him.
  //
  // So `descend` takes the integration order's whole airborne chain, 8 -> 19 ->
  // 9 -> 20: rise, ascent, apex tuck and fall, FOUR consecutive drawings from
  // one generation, which is precisely the "whole airborne chain" routingNote
  // said cells 8 and 9 were being kept on the sheet to wait for. RULE 2 is
  // satisfied by a connected region, not by a roster-wide identical answer.
  //
  // CROSSING COUNT IS UNCHANGED AT ONE and it moves LATER. The 4.0 extended arc
  // crosses at ascent -> motion tuck, near the apex, with the fighter centre
  // frame and nothing over it. This crosses at descend -> motion3 descent,
  // deep into the fall where the landing is already reading. Everything from
  // there down — descent, air-recovery, landing gather — is the motion family
  // exactly as 3.0 shipped it.
  //
  // The apex band keeps motion3 rather than stretching his tuck across it: the
  // tuck would then hold 12 ticks against a budget of 8, which is the very hold
  // this track exists to break.
  //
  // v5.2 LOCOMOTION (ext5-air) — THE ARC IS ONE FAMILY FROM TAKEOFF TO
  // TOUCHDOWN. `air` is the caller's ONE capability answer for this track
  // (game.js: the ext5 apex tuck, descent and air recover all drawable, read
  // once per pose exactly as `extended` and `descend` are), and with it every
  // band below the ascent leads with the fighter's own drawing, one link
  // AHEAD of the motion link it replaces — the same band grid, so every hold
  // is the one the motion links set, tick for tick: apex tuck (ext5:4) over
  // the motion3 apex, descent (ext5:5) over the motion3 jump-descent, air
  // recover (ext5:6, limbs loose) over motion:11, and the ext3 landing gather
  // over motion:6 (the substitution table already drew it there; the link
  // makes the track say so). The 3.0 objection to unified:8 and :9 — "with
  // no usable descent after it the tuck would hand straight to a motion cell
  // in mid-air" — was always conditional on what followed, and nothing motion
  // follows now: the rise and the tuck come back into every `air` arc, on the
  // ten sheets whose cell 9 reads upright at 1:1 (a compact ball, knees to
  // chest, head over the hips on all ten — the manifest's notes). Traced on
  // jez, `unified:8 x5 -> ext:3 x5 -> unified:9 x7 -> ext5:4 x5 -> ext5:5 x3
  // -> ext5:6 x4 -> ext3:10 -> unified:6`, where 5.1 read `unified:8 -> ext:3
  // -> motion:5 -> motion3:2 -> motion3:3 -> ext3:8 -> ext3:10`: the same
  // seven holds, the same lengths, one generation. ali keeps his own ext
  // descent (cell 20) where the 4.1 arc put it and the ext5 descent follows
  // it; the five sheets that never accepted cell 20 take ext5:5 in its place.
  // A fighter without the answer takes the arrays below, byte for byte.
  if (air) {
    const rise = [ukey(UNIFIED_CELLS.jumpRise), m2key(MOTION2_CELLS.jumpRise)];
    const ascent = [xkey(UNIFIED_EXT_CELLS.jumpAscent), m2key(MOTION2_CELLS.jumpRise)];
    const tuck = [ukey(UNIFIED_CELLS.jumpTuck), m1key(MOTION_CELLS.tuck)];
    const apex = [x5key(UNIFIED_EXT5_CELLS.apexTuck), m3key(MOTION3_KEYS.jumpApex), m1key(MOTION_CELLS.tuck)];
    const fall = [x5key(UNIFIED_EXT5_CELLS.descent), m3key(MOTION3_KEYS.jumpDescent), m1key(MOTION_CELLS.airrec)];
    const recover = [x5key(UNIFIED_EXT5_CELLS.airRecover), m1key(MOTION_CELLS.airrec)];
    const gather = [x3key(UNIFIED_EXT3_CELLS.land), m1key(MOTION_CELLS.land)];
    if (extended && descend) {
      return [
        { at: 0, chain: rise },
        { at: open * 0.5, chain: ascent },
        { at: open, chain: tuck },
        // THE FALL is still his own cell 20 (the 4.1 arc); the ext5 apex tuck
        // is the same-family fallback behind it, then the 4.0 cells.
        { at: open + span * 0.30, chain: [xkey(UNIFIED_EXT_CELLS.jumpDescend), ...apex] },
        { at: open + span * 0.50, chain: fall },
        { at: open + span * 0.66, chain: recover },
        { at: 0.72, chain: gather },
      ];
    }
    if (extended) {
      return [
        { at: 0, chain: rise },
        { at: open * 0.5, chain: ascent },
        { at: open, chain: tuck },
        { at: open + span * 0.30, chain: apex },
        { at: open + span * 0.50, chain: fall },
        { at: open + span * 0.66, chain: recover },
        { at: 0.72, chain: gather },
      ];
    }
    // No ext sheet (deathblow, post, donald, the devil): the 3.0 grid with the
    // rise and the tuck un-retired, since the family owns everything after.
    return [
      { at: 0, chain: rise },
      { at: open, chain: tuck },
      { at: open + span * 0.30, chain: apex },
      { at: open + span * 0.50, chain: fall },
      { at: open + span * 0.66, chain: recover },
      { at: 0.72, chain: gather },
    ];
  }
  if (extended && descend) {
    return [
      // TAKEOFF and ASCENT, identical to the extended arc below.
      { at: 0, chain: [ukey(UNIFIED_CELLS.jumpRise), m2key(MOTION2_CELLS.jumpRise)] },
      { at: open * 0.5, chain: [xkey(UNIFIED_EXT_CELLS.jumpAscent), m2key(MOTION2_CELLS.jumpRise)] },
      // THE APEX TUCK, now his own drawing instead of the motion tuck.
      { at: open, chain: [ukey(UNIFIED_CELLS.jumpTuck), m1key(MOTION_CELLS.tuck)] },
      // THE FALL — the drawing 3.0 never had. Fallbacks are the exact cells the
      // 4.0 arc plays here, so a fighter who loses his sheet mid-session
      // degrades to it band for band rather than to a different shape of arc.
      { at: open + span * 0.30, chain: [xkey(UNIFIED_EXT_CELLS.jumpDescend), m3key(MOTION3_KEYS.jumpApex), m1key(MOTION_CELLS.tuck)] },
      // From here down, byte-for-byte the 3.0 arc.
      { at: open + span * 0.50, chain: [m3key(MOTION3_KEYS.jumpDescent), m1key(MOTION_CELLS.airrec)] },
      { at: open + span * 0.66, chain: [m1key(MOTION_CELLS.airrec)] },
      { at: 0.72, chain: [m1key(MOTION_CELLS.land)] },
    ];
  }
  if (extended) {
    return [
      // TAKEOFF, on the fighter's own rise instead of motion2:7.
      { at: 0, chain: [ukey(UNIFIED_CELLS.jumpRise), m2key(MOTION2_CELLS.jumpRise)] },
      // ASCENT — the new drawing, splitting the arc's longest hold.
      { at: open * 0.5, chain: [xkey(UNIFIED_EXT_CELLS.jumpAscent), m2key(MOTION2_CELLS.jumpRise)] },
      // From here down, byte-for-byte the 3.0 arc.
      { at: open, chain: [m1key(MOTION_CELLS.tuck)] },
      { at: open + span * 0.30, chain: [m3key(MOTION3_KEYS.jumpApex), m1key(MOTION_CELLS.tuck)] },
      { at: open + span * 0.50, chain: [m3key(MOTION3_KEYS.jumpDescent), m1key(MOTION_CELLS.airrec)] },
      { at: open + span * 0.66, chain: [m1key(MOTION_CELLS.airrec)] },
      { at: 0.72, chain: [m1key(MOTION_CELLS.land)] },
    ];
  }
  return [
    { at: 0, chain: [m2key(MOTION2_CELLS.jumpRise)] },
    { at: open, chain: [m1key(MOTION_CELLS.tuck)] },
    // v2.9 final round (T5): the sub-band split is no longer uniform. The
    // DESCENT half of the arc maps remaining HEIGHT onto progress, and height
    // changes slowest at the apex — so a band just past 0.5 costs far more
    // ticks than its width in progress suggests, which is why motion3:3
    // measured 9. The bands are front-loaded to compensate: the descent key's
    // window is 0.16 of the span where the others are 0.30/0.20/0.34.
    { at: open + span * 0.30, chain: [m3key(MOTION3_KEYS.jumpApex), m1key(MOTION_CELLS.tuck)] },
    { at: open + span * 0.50, chain: [m3key(MOTION3_KEYS.jumpDescent), m1key(MOTION_CELLS.airrec)] },
    { at: open + span * 0.66, chain: [m1key(MOTION_CELLS.airrec)] },
    // The airborne gather. The TOUCHDOWN that follows it is the landing-
    // recovery branch's half-crouch, so the landing reads gather -> plant ->
    // stand across two drawings under one squash.
    { at: 0.72, chain: [m1key(MOTION_CELLS.land)] },
  ];
}

/**
 * A kit-less AIR NORMAL across its whole window, in progress over the move's
 * total duration. The active band is the authored diving strike; the startup
 * chambers on the tuck (knees drawn up before the limb goes out) and the
 * recovery trails on the loose-limbed air-recovery key into the landing
 * gather, so the extended limb is not frozen for half a second.
 */
export function airNormalKeys(startupPhase, recoverPhase) {
  const strike = Math.min(0.6, Math.max(0.08, startupPhase));
  const trail = Math.min(0.92, Math.max(strike + 0.1, recoverPhase));
  return [
    // v3.0 critic round (RULE 2): the unified tuck is retired from this
    // chamber for the same reason it left the jump arc — every band after it
    // (the motion2 strike, the motion trail, the motion gather) is one
    // generation, so routing it here bought a 8.33 dE mean crossing to remove
    // none. Measured roster-wide the air normal is now crossing-free.
    { at: 0, chain: [m3key(MOTION3_KEYS.airStartup), m1key(MOTION_CELLS.tuck)] },
    { at: strike, chain: [m2key(MOTION2_CELLS.airAttack)] },
    { at: strike + (trail - strike) * 0.5, chain: [m3key(MOTION3_KEYS.airAttackB), m2key(MOTION2_CELLS.airAttack)] },
    { at: trail, chain: [m1key(MOTION_CELLS.airrec)] },
    { at: trail + (1 - trail) * 0.55, chain: [m1key(MOTION_CELLS.land)] },
  ];
}

/**
 * The anticipation on a kit-less standing heavy, in progress over the windup
 * window. One drawing owned all 17 ticks of deathblow's heavy kick; the weight
 * now GATHERS first and the limb cocks second, which is the order a real windup
 * happens in.
 *
 * The gather is motion2's crouch-trans cell, checked at 1:1 across the roster
 * this round: on all nine human fighters it is a deep coiled crouch with the
 * fists already up — prop-free (donald's carries no club) and VFX-free, which
 * `charge` is NOT (charge glows on deathblow, jez, benny, donald and cyraxx,
 * so using it would put a power-up aura on every ordinary heavy). The devil's
 * crouch-trans is an all-fours prowl and is accept:false for him, so his chain
 * degrades to the cocked cell exactly as before.
 */
export function heavyWindupKeys(limb, { extended = false, inbetween = false } = {}) {
  const kick = limb === "kick";
  const cocked = kick ? MOTION2_CELLS.windupKick : MOTION2_CELLS.windupPunch;
  // v4.0 — THE CHAMBER IS THE FIGHTER'S OWN DRAWING NOW.
  //
  // The ext sheet's 21 (fist chambered at the ribs, shoulder rotated back, hips
  // coiled) and 22 (knee snapped up, foot cocked underneath) are drawn as this
  // beat's opening, and the manifest's integration order asks for them as the
  // ramps into the extensions. Only the CHAMBER is routed, not the extension:
  // unified:10/11 stay retired, because the 3.0 round measured what routing
  // them costs — the extension sits between the motion smear and the motion
  // follow-through, which are one generation, so a cell dropped in the middle
  // took the swing from 2 crossings to 5 and pushed the follow-through boundary
  // to 6.95 dE with no flash over it. Nothing about that has changed; the ext
  // sheet supplies no smear and no follow-through, so the bank still cannot own
  // the whole swing the way it can now own the whole airborne middle.
  //
  // The chamber is different, and it is a strict improvement rather than a
  // trade: the drawing BEFORE it is the unified idle or guard, so today's
  // unified:0 -> motion2:0 crossing at the beat's entry disappears, and the one
  // this adds (chamber -> the motion2 load) is 3-4 ticks later with the smear
  // flash immediately behind it. Crossing count is unchanged and the fighter
  // chambers on art of himself.
  const chamber = kick ? UNIFIED_EXT_CELLS.kickWindup : UNIFIED_EXT_CELLS.punchWindup;
  const cock = extended ? [xkey(chamber), m2key(cocked)] : [m2key(cocked)];
  // The motion3 mid-key is LIMB-SPECIFIC, exactly like the chamber it sits
  // between, so a kick windup never borrows the punch's coil.
  const mid = kick ? MOTION3_KEYS.windupKickB : MOTION3_KEYS.windupPunchB;
  return [
    // v2.9 final round (T1/T2) — THE ORDER WAS INVERTED, AND THE GATHER WAS
    // THE WRONG DRAWING.
    //
    // Round 2 ran crouch-trans (0.0) -> motion3 mid (0.44) -> cocked (0.72),
    // and the measured content heights on deathblow's heavy punch were
    // 306 idle -> 258 gather -> 309 mid -> 290 cocked -> 249 smear: he
    // squatted 48px, sprang 51px back up to 3px ABOVE his idle height in one
    // tick, then dropped again. The heavy kick was worse (306 -> 258x7 ->
    // 316x5 -> 306x5 -> 258). Two separate faults:
    //
    //  T1 the deepest coil played in the MIDDLE and a shallower cock played
    //     last, right before the release — an anticipation that un-coils into
    //     its own strike;
    //  T2 motion2:4 crouch-trans is the stand<->crouch BRIDGE, a symmetric
    //     two-footed squat measured 15-30% below the idle height on every
    //     fighter (deathblow -48px, the devil -94px). As the OPENING key it
    //     read "duck, then stand up and punch".
    //
    // The beat now runs COCK -> LOAD -> COMPRESS, and the drawings are
    // ordered so the body gets lower as the release approaches. Measured on
    // deathblow's heavy punch with the motion3 bank off (which is what he
    // ships after this round's consistency gate): 306 idle -> 290 cocked ->
    // 260 load -> 258 compress -> 249 smear. Monotonic; the bob is gone.
    //
    // 1. COCK — the limb chambers first, at very nearly the standing height.
    { at: 0, chain: cock },
    // 2. LOAD — the weight shifts onto the planted foot. The authored motion3
    //    coil when the bank is there; motion2:6 dash-brake underneath it,
    //    which is a one-foot-planted weight-shifted body with the arms
    //    trailing — a WEIGHT SHIFT, which is what an anticipation is, rather
    //    than the symmetric squat T2 threw out.
    //    v4.9: with the in-between sheet the LOAD is the fighter's own deep
    //    wind-up drawing (fist behind the shoulder / knee high, arms back),
    //    which is what deathblow and donald — motion3 off — were missing.
    { at: 0.36, chain: [...(inbetween ? [x2key(kick ? UNIFIED_EXT2_CELLS.heavyKickWindup : UNIFIED_EXT2_CELLS.heavyPunchWindup)] : []), m3key(mid), m2key(MOTION2_CELLS.dashBrake)] },
    // 3. COMPRESS — the deepest coil on the sheet, and now it is immediately
    //    before the release instead of in the middle of the beat.
    //    v3.0 critic round (RULE 2): the first cut routed the unified crouch-
    //    transition here on the reasoning that the extension after it was
    //    unified too. The extension is retired, and this band was never
    //    connected in the first place — it sits between motion2:6 (the load)
    //    and motion:2 (the smear), which are ONE generation. Routed, it added
    //    a 5.26 dE crossing with no flash over it and a 9.51 dE one into the
    //    smear; retired, the whole windup->smear->extension->follow swing is
    //    a single unbroken motion-family chain, exactly as 2.9 shipped it.
    //    v5.2: on an EXT fighter the band already draws the unified crouch
    //    transition — swingSubstitute maps a resolved motion2:4 onto it (5.0),
    //    so the "retired" reasoning above stopped describing the screen when
    //    the whole swing moved onto the fighter's own sheets. The devil is the
    //    one fighter whose motion2:4 is rejected (his is an all-fours prowl),
    //    so his chain never RESOLVED motion2:4, the substitution never fired,
    //    and the band fell through to the caller's base fallback — base 13,
    //    his AIRBORNE claw lunge, held for the last 30% of every heavy windup
    //    on the street. The same drawing the other nine get is keyed under the
    //    bridge for him, inside the ext branch so the 3.5 array is untouched.
    { at: 0.70, chain: extended ? [m2key(MOTION2_CELLS.crouchTrans), ukey(UNIFIED_CELLS.crouchTrans)] : [m2key(MOTION2_CELLS.crouchTrans)] },
  ];
}

/**
 * v2.9 final round (T3) — THE HEAVY KICK'S MISSING BRIDGE.
 *
 * motion2:1 (knee chambered at waist, torso upright, measured 305-306px) cuts
 * to motion:1 (leg extended at head height, torso leaned back) in ONE tick,
 * and kicks are excluded from the smear beat — correctly, because both smear
 * cells are painted ARM streaks (the 2.7 critic round rejected them on kicks)
 * — so there is no flash to carry the eye across. The punch's equivalent beat
 * is the best in the build precisely because it gets that flash.
 *
 * There is no leg-smear drawing anywhere in the four banks, so the bridge is a
 * TRANSFORM ARC rather than a cell: over the last two startup ticks the body
 * rotates back and rises onto the support leg along the arc the kick is about
 * to travel, which is the in-between the two drawings do not contain. Returned
 * as a beat so the pose functions and the transform read the same classifier,
 * exactly like the smear.
 */
export function kickArcTransform(progress) {
  const p = Math.min(1, Math.max(0, progress));
  const ease = p * p * (3 - 2 * p);
  return { lean: -0.16 * ease, lift: -7 * ease, reach: 0.09 * ease };
}

/**
 * The dash, in progress over the dash window. M1: the 2.7 wave fixed the exit
 * pop and left the ENTRY identical — one tick of upright idle at vx 0 followed
 * by a fully horizontal lunge at vx 622. The brake key (a mid-lunge body, one
 * foot planted, arms trailing) now bookends the stretch, so the fighter passes
 * through a transitional body plan on the way INTO the lunge as well as out.
 */
export function dashKeys() {
  // v5.2 LOCOMOTION: the dash in THREE same-generation drawings, one link
  // ahead of every motion link so the band grid (and so every hold budget)
  // is untouched — launch, stretch, brake. The 2.9 dash crossed four banks
  // in thirteen ticks (motion2:6 -> motion:7 -> motion3:5 -> motion2:6 on
  // jez); every fighter with the ext5 sheet now enters from the unified idle,
  // dashes on his own sheet and brakes back onto it. The stretch owns bands
  // 0.16 AND 0.42 (there is one stretch drawing, where motion3 supplied a
  // second body): merged, that is 8 ticks at the 16-tick audit span —
  // exactly MOTION_HOLD_BUDGET — and 6 on a 13-tick dash. The launch is a
  // running leap, the brake the planted-foot skid, so a dash is no longer
  // brake -> stretch -> brake.
  return [
    { at: 0, chain: [x5key(UNIFIED_EXT5_CELLS.dashLaunch), m3key(MOTION3_KEYS.dashLaunch), m2key(MOTION2_CELLS.dashBrake)] },
    { at: 0.16, chain: [x5key(UNIFIED_EXT5_CELLS.dashStretch), m1key(MOTION_CELLS.dash)] },
    { at: 0.42, chain: [x5key(UNIFIED_EXT5_CELLS.dashStretch), m3key(MOTION3_KEYS.dashBodyB), m1key(MOTION_CELLS.dash)] },
    { at: 0.68, chain: [x5key(UNIFIED_EXT5_CELLS.dashBrake), m2key(MOTION2_CELLS.dashBrake)] },
  ];
}

/**
 * The throw ATTACKER's recovery, in progress over the recovery window. The
 * clinch released and then held ONE kit cell for 31 ticks. The weight now
 * carries past the release on the follow-through key before the stance
 * recovers, and the tail hands back to the caller's idle read so the last
 * third breathes instead of freezing. An empty chain means "whatever the
 * caller's fallback is at this instant" — the kit cell, then the idle cycle.
 */
export function throwClinchKeys({ inbetween = false } = {}) {
  return [
    // v2.9 final round (R7) — THE GRAB MUST PRECEDE THE HURL. Measured on the
    // 2.9 build: the victim leaves the ground at T10 and wears motion2:11
    // `thrown` from T11, while the attacker's motion2:12 `throw-grab` — the
    // SEIZING key, the drawing of two hands closing on the opponent — did not
    // reach the screen until after that. The clinch is short and the old 0.18
    // opening spent its first fifth on the kit cell, so on a fast throw the
    // seize landed at or behind the launch. The seize now owns the clinch from
    // the first tick; a grab you can see is the whole point of the beat.
    // SEIZE — the two hands closing, on the first tick of the clinch.
    { at: 0, chain: [...(inbetween ? [x2key(UNIFIED_EXT2_CELLS.throwWindup)] : []), m2key(MOTION2_CELLS.throwGrab)] },
    // LOAD — the weight drops to lift.
    // v3.0 critic round (RULE 2): the unified crouch-transition was routed
    // here by the first cut and is retired from it. This band's neighbours are
    // the motion2 seize before it and the kit's own release art after it — a
    // chain the motion family already owns consistently — and dropping a
    // unified cell in cost 3 crossings where the 2.9 read had 1 (measured
    // roster-wide: worst crossing 8.84 dE mean against 7.35). The cell is not
    // gone from the sheet; it is not routed HERE.
    // v5.2 LOCOMOTION: the fighter's own THROW GRAB — the two hands closing —
    // takes the load band, so the clinch reads reach (ext2) -> seize (ext5)
    // -> hurl (kit) on one sheet family. The 5.0 substitution had been
    // standing the UNIFIED crouch transition in for the crouchTrans link
    // here (a half-crouch in the middle of a grab, the exact drawing RULE 2
    // retired from this band in 3.0); the seize is what the band means.
    { at: 0.34, chain: [x5key(UNIFIED_EXT5_CELLS.throwGrab), m3key(MOTION3_KEYS.throwClinch), m2key(MOTION2_CELLS.crouchTrans)] },
    // HURL — the kit's own release art, which the recovery beat then carries
    // forward instead of re-showing. Never a return to the seize: the beat is
    // monotonic, like the recovery below it.
    { at: 0.66, chain: [] },
  ];
}

export function throwRecoveryKeys({ inbetween = false } = {}) {
  // v2.9 final round (R7) — THE A-B-A FLIP. Round 2's track played
  // specials:7 -> motion:4 -> specials:7 AGAIN -> motion3:6 -> base:9,
  // because bands 0.00 and 0.40 both had EMPTY chains and therefore both
  // resolved to the caller's kit cell, with the follow-through key between
  // them. Returning to a drawing the animation has already left reads as a
  // rewind hitch, not as recovery. The track is MONOTONIC now: the kit's
  // release cell, then the follow-through, then the authored recovery key,
  // then the stance — every band a drawing the beat has not worn yet.
  //
  // The beat runs 34 ticks and now has FOUR distinct drawings, so 8.5 ticks
  // is the arithmetic floor and the worst run is 9. Round 2 met the 8-tick
  // budget only by re-showing specials:7 — an in-budget REWIND, which is a
  // worse read than a monotonic sequence one tick over. The bands are as even
  // as four keys allow.
  //
  // The recovery does NOT re-open on the kit's release cell: the clinch beat
  // immediately before it ends on that cell, so opening here would put the
  // load key between two stretches of one drawing — the same A-B-A across the
  // beat boundary. The kit cell stays the terminal fallback, so a missing
  // motion bank still degrades to exactly the pre-fix read.
  return [
    { at: 0, chain: [m1key(MOTION_CELLS.follow)] },
    { at: 0.26, chain: [...(inbetween ? [x2key(UNIFIED_EXT2_CELLS.throwRecover)] : []), m3key(MOTION3_KEYS.throwRecover), m2key(MOTION2_CELLS.dashBrake)] },
    { at: 0.52, chain: [] },
    { at: 0.78, chain: [] },
  ];
}

/**
 * A kit-less normal's RECOVERY, in progress over the recovery window. Round 1
 * left this beat completely unsequenced: `return base(frames[3])` for the
 * whole window, measured at 20-23 ticks frozen on one cell across the roster
 * (and on donald that cell was a club-in-hand golf follow-through). The weight
 * now carries past the target on the follow-through key before the stance
 * recovers, and the tail hands back to the caller's idle read so the last
 * third breathes instead of freezing.
 */
export function attackRecoveryKeys({ inbetween = false } = {}, { limb = "punch", heavy = false, crouching = false } = {}) {
  return [
    { at: 0, chain: [m1key(MOTION_CELLS.follow)] },
    // v4.9: the fighter's own RECOVER drawing — the limb halfway back, the
    // weight settling — fills the band that used to fall to base 11.
    { at: 0.24, chain: inbetween ? [x2key(inbetweenRecoverCell(limb, { heavy, crouching }))] : [] },
    { at: 0.46, chain: [m3key(MOTION3_KEYS.attackSettle)] },
    { at: 0.66, chain: [] },
  ];
}

/**
 * BLOCKSTUN, in progress over the blockstun window. The authored guard flinch
 * owned all 17 ticks of it — a static absorb, and the one drawing whose height
 * mismatch with the guard cell M4 is about. The flinch now owns the IMPACT and
 * the stance recovers behind it, which is what blockstun looks like.
 */
export function blockstunKeys() {
  return [
    { at: 0, chain: [m2key(MOTION2_CELLS.blockHit)] },
    { at: BLOCK_EXIT_AT, chain: [m3key(MOTION3_KEYS.blockSettle)] },
    { at: 0.62, chain: [] },
  ];
}

/** The progress at which the flinch hands the beat back to the stance. */
export const BLOCK_EXIT_AT = 0.42;

/**
 * v5.1 — CROUCH BLOCKSTUN, which had no flinch at all. game.js gated the
 * blockstun track on `!fighter.crouch` because motion2:8 is a STANDING cover,
 * and the crouch stance branch then held unified:5 through every tick of a
 * crouched block: a low-blocked heavy produced zero pose change. The ext3
 * crouch guard (forearms crossed, still crouched) is the drawing for that
 * beat, and it takes the same shape as the standing track — the flinch owns
 * the impact to BLOCK_EXIT_AT, the stance recovers behind it. No motion3
 * settle exists for a crouch, so the recovery bands are empty and hand to the
 * caller's crouch read, which is exactly what drew before on every tick. A
 * fighter without the cell is therefore byte-identical.
 */
export function crouchBlockstunKeys({ flinch = false } = {}) {
  // v5.2 LOCOMOTION: with `flinch` — the caller's ONE capability answer,
  // true when this fighter's ext5 crouch guard flinch can draw, exactly as
  // `inbetween` and `extended` are passed — the crouched block gets an
  // IMPACT and a SETTLE like the standing one. The flinch (knees folded,
  // forearms up, jolted) opens the impact band and the ext3 crouch guard
  // takes the settle band the standing track spends on its motion3
  // block-settle slot; the last band still hands to the crouch read. Same
  // grid, so the budget is untouched: 8 / 3 / 6 ticks at the 17-tick audit
  // span. Without the answer the track is the 5.1 one, byte for byte —
  // which is what ali reads while his flinch cell is HELD (a painted impact
  // burst): opening the settle on the crouch guard for him too would merge
  // his impact and settle into one 11-tick hold.
  if (!flinch) {
    return [
      { at: 0, chain: [x3key(UNIFIED_EXT3_CELLS.crouchGuard)] },
      { at: BLOCK_EXIT_AT, chain: [] },
      { at: 0.62, chain: [] },
    ];
  }
  return [
    { at: 0, chain: [x5key(UNIFIED_EXT5_CELLS.crouchGuardFlinch), x3key(UNIFIED_EXT3_CELLS.crouchGuard)] },
    { at: BLOCK_EXIT_AT, chain: [x3key(UNIFIED_EXT3_CELLS.crouchGuard)] },
    { at: 0.62, chain: [] },
  ];
}

/**
 * v2.9 final round (R6) — THE GUARD-FLINCH EXIT WAS A HARD CUT.
 *
 * One tick from motion2:8 — a tucked, head-down cover with both forearms
 * crossed in front of the face — to base `guard`, a tall wide brace with an
 * arm extended forward. M4 already made the two the same HEIGHT
 * (GUARD_FLINCH_ADJUST); what was still missing is that they are 90 degrees
 * of torso rotation apart and nothing sat between them.
 *
 * No bank contains a half-uncovered guard, so the bridge is a transform on
 * the RECEIVING cell rather than a third drawing: the stance arrives still
 * carrying the flinch's tuck — lower, pitched forward, slightly compressed —
 * and unwinds out of it over the next few ticks. Pure function of blockstun
 * progress, so both renderers and a rollback resim agree, and it is exactly
 * zero before the handoff (the flinch itself is never double-tucked) and
 * exactly zero once settled.
 */
export function blockRecoverTransform(phase, exitAt = BLOCK_EXIT_AT) {
  if (!(phase >= exitAt)) return null;
  const p = Math.min(1, Math.max(0, (phase - exitAt) / 0.30));
  const carry = 1 - p * p * (3 - 2 * p);
  if (carry <= 0.001) return null;
  return { lift: 6 * carry, pitch: 0.09 * carry, squash: 1 - 0.045 * carry };
}

/**
 * The victim REACTION tracks, in progress over the reaction window. Round 1
 * opened the heavy on the big-hit key for four ticks and then dropped it into
 * motion2:9 — the SAME cell the light track uses — with a 60-70 degree torso
 * jump and no in-between, and then both tracks pinned ONE base cell for 6-7
 * ticks. The middles are now different drawings (heavy sags through the
 * authored rubber-legs key, light folds through the authored guard flinch) and
 * motion3's react-mid pair slots straight into both. Empty chains defer to the
 * caller's per-band base fallback (the map's stagger/hit/guard reads).
 */
/**
 * v3.0 critic round (M1): the unified rung for every band comes from ONE
 * table, unifiedReactionLadder, so the track and the caller's per-band
 * fallback in game.js can never fall out of step again — which is exactly how
 * the light track ended up playing stagger -> rubber-legs -> stagger. A rung
 * is stacked IN FRONT of that band's 2.9 chain, so a non-unified fighter skips
 * it (defaultBeatKeyResolve treats a unified link like a motion3 slot) and
 * reads byte-for-byte what 2.9 read. Bands whose ladder rung is the idle carry
 * no key at all: the caller hands those to the breathing idle cycle.
 */
export function reactionTrackKeys(heavy, options = undefined) {
  const ladder = unifiedReactionLadder(heavy, options);
  // The 2.9 chains, band by band, unchanged. `null` is an empty chain.
  const base29 = heavy
    ? [
      [m1key(MOTION_CELLS.bighit)],
      [m3key(MOTION3_KEYS.reactMid), m2key(MOTION2_CELLS.dizzy)],
      [m2key(MOTION2_CELLS.lightHit)],
      [], [], [],
    ]
    : [
      [m2key(MOTION2_CELLS.lightHit)],
      // v2.9 final round (R3): this band used to be motion2:8, the authored
      // GUARD FLINCH — both forearms crossed over the head — held ~7 ticks
      // after a CLEAN UNBLOCKED hit, so a victim covered up as though he had
      // blocked it. blockHit is now referenced by exactly one track,
      // blockstunKeys, which is the beat it was drawn for. The light track
      // folds through the map's standing recoil and then the authored
      // rubber-legs key, which are both HURT drawings.
      [],
      [m2key(MOTION2_CELLS.dizzy)],
      [], [], [],
    ];
  return REACTION_BANDS.map((at, band) => ({
    at,
    // The idle rung is NOT keyed: the tail hands back to the caller's
    // breathing idle cycle, which advances on its own, rather than pinning one
    // drawing. Every other rung leads its band's 2.9 chain.
    // v4.0: `urung` dispatches on the GRAMMAR number, so a ladder may mix main
    // and ext rungs in one array and the chain link lands on the right bank.
    chain: ladder[band] === UNIFIED_CELLS.idle
      ? base29[band]
      : [urung(ladder[band]), ...base29[band]],
  }));
}

/**
 * v2.9 final round (R4) — THE REACTION TAIL, and why it collapsed.
 *
 * Round 2's tail read `base(hitKey ? roles.hit : fold)` at 0.30 and
 * `base(fold)` at 0.44, where `fold = roles.stagger ?? roles.hit`. On SEVEN OF
 * TEN fighters there is no distinct stagger cell, so `fold === roles.hit` and
 * the two bands were the SAME DRAWING — a single ~12-13 tick freeze closing
 * every ground reaction. The hold audit could not see it because
 * `defaultBeatKeyResolve` distinguishes empty-chain bands by their band
 * position, not by the base cell the caller resolves them to.
 *
 * The band edges are now shared by both tracks and by this ladder, one cell
 * per band, and the cells are chosen so that CONSECUTIVE BANDS CAN NEVER
 * RESOLVE TO THE SAME FRAME:
 *
 *   snap    the standing recoil (roles.hit)
 *   fold    the stagger step — roles.stagger when the sheet HAS one, and the
 *           map's braced stance when it does not, because that is the only
 *           other drawing the map certifies as non-attack and it is distinct
 *           from `hit` on all ten fighters
 *   settle  the braced stance — dropped (null) when `fold` already took it,
 *           in which case the band hands STRAIGHT to the breathing idle
 *           rather than repeating a drawing. Shortening the tail is the
 *           honest answer when a sheet does not have the drawings for it.
 */
export const REACTION_BANDS = Object.freeze([0, 0.14, 0.30, 0.46, 0.64, 0.82]);

export function reactionFallbackCells(roles = DEFAULT_BASE_ROLES) {
  const hit = Number.isInteger(roles.hit) ? roles.hit : 15;
  const guard = Number.isInteger(roles.guard) ? roles.guard : 12;
  const stagger = Number.isInteger(roles.stagger) ? roles.stagger : null;
  const fold = stagger !== null && stagger !== hit ? stagger : guard;
  return { snap: hit, fold, settle: fold === guard ? null : guard };
}

/**
 * The base cell each reaction band degrades to for one fighter — the read the
 * hold audit has to make to see R4's collapse. Returns one entry per band.
 */
export function reactionBandCells(roles = DEFAULT_BASE_ROLES) {
  const tail = reactionFallbackCells(roles);
  return REACTION_BANDS.map((at) => {
    if (at < REACTION_BANDS[2]) return tail.snap;
    if (at < REACTION_BANDS[4]) return tail.fold;
    if (at < REACTION_BANDS[5] && tail.settle !== null) return tail.settle;
    return null; // the breathing idle cycle, which advances on its own
  });
}

/**
 * v2.9 critic round (M4): the procedural rise that carries the wake-up.
 * getup-a holds 7 identical ticks and getup-b nine more, so the recovery was
 * two freezes and then a one-tick teleport to standing with the head jumping
 * ~90-100px. This eases a feet-anchored lift and an unwinding forward pitch
 * across the WHOLE countdown so the body is visibly rising every tick, and
 * ramps the last rung so the final authored frame is already reaching
 * standing height instead of snapping there. Pure function of the snapshotted
 * counter — identical under rollback resim and in both renderers.
 */
// ---------------------------------------------------------------------------
// v2.9 final round (R5) — THE WAKE-UP TELEPORT WAS NEVER FIXED.
//
// The 2.9 note claiming the teleport was removed is FALSE, and this beat fires
// on every knockdown, which makes it the most-seen animation defect in the
// build. Tracking ali's beanie top-y, the rise moves 2-9px per tick through
// getup-a and getup-b and then JUMPS ~71px on the final rung.
//
// Measured cause, at 1:1 (opaque content height, alpha >= 24). The last rung
// is motion2:15, the half-risen crouch, and the cell it hands off to is the
// standing idle:
//
//   fighter       getup-b   standing   gap        ratio
//   jez             219       306       87px      1.397
//   ali             224       306       82px      1.366
//   commissioner    237       316       79px      1.333
//   donald          231       306       75px      1.325
//   benny           244       306       62px      1.254
//   alan            246       305       59px      1.240
//   post            266       306       40px      1.150
//   deathblow       270       306       36px      1.133
//   cyraxx          284       302       18px      1.063
//   devil           287       301       14px      1.049
//
// Round 2's bridge — a flat 12% stretch on the last four ticks — closes 1.12
// of a ratio that runs to 1.40. It was never going to be enough, and no
// authored cell closes the rest either: probed this round, motion2:4
// crouch-trans (the stand<->crouch in-between, the obvious candidate for an
// extra rung) is TALLER than getup-b on only four of ten fighters and would
// REVERSE the rise on the other six.
//
// So the gap is closed from BOTH SIDES, and neither side takes more than it
// can carry. The last rung stretches toward the standing height, capped at
// 1.18; whatever is left is taken up by squashing the STANDING cell down to
// meet it on the tick it arrives, floored at 0.88, easing out over five ticks.
// A rising figure stretching vertically reads as reaching up, and a standing
// figure briefly compressed reads as the last of the push — both are the
// bounded-correction mechanism guardFlinchAdjust and the crouch adjust
// already use.
//
// Residual seam after the fix, same measurement: EIGHT of ten fighters land
// exactly 0px, jez 11px, ali 5px. Was 4-61px.
// ---------------------------------------------------------------------------

/** Most the final rung may be stretched toward the standing height. */
export const WAKEUP_STRETCH_CAP = 1.18;
/** Most the standing cell may be compressed to meet it. */
export const WAKEUP_SETTLE_FLOOR = 0.86;
/**
 * Ticks the standing cell takes to ease out of that compression. Measured on
 * ali: at 5 the settle moved 12-14px/tick, which is smooth but faster than the
 * 2-9px/tick the rise itself runs at; 8 puts the whole recovery on one cadence.
 */
export const WAKEUP_SETTLE_FRAMES = 8;

/**
 * Measured opaque content height in CELL pixels of the cells a wake-up can end
 * on, plus each fighter's standing reference (the mean of their idle cells,
 * which are all within a pixel of each other). RAW heights — the per-cell draw
 * adjust is applied by the functions below, so the crouch fallback is measured
 * at the size it actually draws.
 */
// v3.0: `standUnified` is the same measurement taken on the cell that
// ACTUALLY ends the rise for a unified fighter — unified:0, his idle. It is
// 8-15% shorter than his base idle on every sheet, because the unified idle is
// a settled wide fighting stance rather than the base bank's upright figure
// (verified at 1:1: same head size, knees bent, feet apart — pose, not scale,
// which is why no draw-scale correction is applied to it). Left unfixed, R5's
// settle would have compressed the standing cell toward a 306px target it no
// longer reaches and re-opened the wake-up height step it closed. The unified
// crouch joins `cells` because the gather rung's fallback now resolves there.
export const WAKEUP_RISE_HEIGHT = Object.freeze({
  deathblow: Object.freeze({ stand: 306, standUnified: 272, cells: Object.freeze({ "motion2:15": 270, "base:12": 304, "unified:5": 180 }) }),
  jez: Object.freeze({ stand: 306, standUnified: 277, cells: Object.freeze({ "motion2:15": 219, "base:12": 305, "unified:5": 218 }) }),
  alan: Object.freeze({ stand: 305, standUnified: 274, cells: Object.freeze({ "motion2:15": 246, "base:12": 299, "unified:5": 210 }) }),
  post: Object.freeze({ stand: 306, standUnified: 279, cells: Object.freeze({ "motion2:15": 266, "base:12": 304, "unified:5": 177 }) }),
  donald: Object.freeze({ stand: 306, standUnified: 261, cells: Object.freeze({ "motion2:15": 231, "base:12": 304, "unified:5": 193 }) }),
  devil: Object.freeze({ stand: 301, standUnified: 283, cells: Object.freeze({ "motion2:15": 287, "base:12": 234, "unified:5": 191 }) }),
  // v4.1: `standUnified` and the unified crouch rung re-measured on the 24-cell
  // sheet (271 -> 294 and 199 -> 226). His base and motion2 rungs are untouched
  // art and re-measure to their recorded values exactly.
  ali: Object.freeze({ stand: 306, standUnified: 299, cells: Object.freeze({ "motion2:15": 224, "base:12": 304, "unified:5": 207 }) }),
  benny: Object.freeze({ stand: 306, standUnified: 279, cells: Object.freeze({ "motion2:15": 244, "base:12": 304, "unified:5": 195 }) }),
  commissioner: Object.freeze({ stand: 316, standUnified: 287, cells: Object.freeze({ "motion2:15": 237, "base:12": 288, "unified:5": 196 }) }),
  cyraxx: Object.freeze({ stand: 302, standUnified: 296, cells: Object.freeze({ "motion2:15": 284, "base:12": 241, "unified:5": 207 }) }),
});

/** The standing height the rise is aiming at, per bank the idle draws from. */
function wakeupStandHeight(entry, options) {
  if (!entry) return 0;
  return options?.unified === true && Number.isFinite(entry.standUnified)
    ? entry.standUnified : entry.stand;
}

/** The drawn height of a wake-up rung, or 0 when the cell is not a rung. */
export function wakeupRungHeight(fighterId, bank, frame) {
  const entry = WAKEUP_RISE_HEIGHT[fighterId];
  let raw = entry?.cells[`${bank}:${frame}`];
  // v5.0: the swing substitution draws the last rung from the ext4 get-up
  // cell. It is the SAME rung — the stretch and the settle key off the drawn
  // cell — so it is measured on that sheet, or the seam it closes reopens.
  if (!Number.isFinite(raw) && bank === UNIFIED_EXT4_BANK && frame === UNIFIED_EXT4_CELLS.getupB) {
    raw = UNIFIED_EXT4_CELL_HEIGHT[fighterId]?.[frame];
  }
  if (!Number.isFinite(raw)) return 0;
  return raw * baseCellDrawAdjust(fighterId, bank, frame);
}

/** How far the final rung stretches toward standing height. 1 = not a rung. */
export function wakeupRiseStretch(fighterId, bank, frame, options = {}) {
  const entry = WAKEUP_RISE_HEIGHT[fighterId];
  const drawn = wakeupRungHeight(fighterId, bank, frame);
  if (!entry || !(drawn > 0)) return 1;
  return Math.min(WAKEUP_STRETCH_CAP, Math.max(1, wakeupStandHeight(entry, options) / drawn));
}

/**
 * The scale the STANDING cell arrives at on the tick the countdown ends — the
 * stretched rung's own height as a fraction of standing, so the two drawings
 * are the same height across the handoff.
 */
export function wakeupSettleStart(fighterId, bank, frame, totalFrames = 16, options = {}) {
  const entry = WAKEUP_RISE_HEIGHT[fighterId];
  const drawn = wakeupRungHeight(fighterId, bank, frame);
  if (!entry || !(drawn > 0)) return 1;
  // Evaluated through the SAME rise transform the last tick actually used, so
  // the two sides of the handoff are computed from one formula and cannot
  // drift apart if that curve is ever retuned.
  const stretch = wakeupRiseStretch(fighterId, bank, frame, options);
  const finalTick = wakeupRiseTransform(1, totalFrames, stretch);
  const last = drawn * (finalTick ? finalTick.scaleY : 1);
  return Math.min(1, Math.max(WAKEUP_SETTLE_FLOOR, last / wakeupStandHeight(entry, options)));
}

/** The standing cell easing out of that compression. Null once settled. */
export function wakeupSettleTransform(settleFrames, startScale,
  totalFrames = WAKEUP_SETTLE_FRAMES) {
  if (!(settleFrames > 0) || !(startScale < 0.999)) return null;
  const total = Math.max(1, totalFrames);
  const done = Math.min(1, Math.max(0, 1 - settleFrames / total));
  const eased = done * done * (3 - 2 * done);
  return { scaleY: startScale + (1 - startScale) * eased };
}

export function wakeupRiseTransform(wakeupFrames, totalFrames = 16,
  finalStretch = 1.12) {
  if (!(wakeupFrames > 0)) return null;
  const total = Math.max(1, totalFrames);
  const rise = Math.min(1, Math.max(0, 1 - wakeupFrames / total));
  const eased = rise * rise * (3 - 2 * rise);
  // The final four ticks stretch the half-risen cell the rest of the way up,
  // so the hand-off to the standing cell is a continuation, not a jump.
  // v2.9 final round (R5): the bridge is the MEASURED per-fighter stretch now,
  // not a flat 12%. The default keeps the old value so any caller that cannot
  // resolve the rung (and the 3D bridge's own default) behaves exactly as it
  // did.
  // v2.9 final round (R5): the bridge reaches its FULL value on the last
  // tick of the countdown. `1 - wakeupFrames / 4` topped out at 0.75 there,
  // so the rung only ever got three quarters of the correction it was
  // being handed — a quarter of round 2's bridge was unreachable.
  const bridge = Math.min(1, Math.max(0, 1 - (wakeupFrames - 1) / 4));
  return {
    scaleY: (0.93 + 0.07 * eased) * (1 + (finalStretch - 1) * bridge),
    scaleX: 1 + 0.035 * (1 - eased),
    pitch: 0.30 * (1 - eased),
  };
}

// ---------------------------------------------------------------------------
// v2.10 WALK — the third authored bank (assets/walk, MOTION-ATLAS.md "Walk
// bank"): FOUR keys of one stride, generated in a single pass so build,
// costume and grading match BY CONSTRUCTION, and played as its own
// self-contained cycle that is NEVER interleaved with the base walk cells.
//
// Both prior attempts failed for reasons this shape removes at once. The base
// bank is not a cycle -- its four walk cells are near-duplicate redraws of ONE
// stride phase (adjacent-key silhouette IoU ~0.88-0.93, and pointed at those
// cells the 2.10 gate fails phase alternation on every fighter) -- so no
// two-cell patch bolted onto it can produce a walk; and a patch generated
// separately from the base bank cannot match its grading, which is the
// identity strobe the 2.9 critic round rejected.
//
// A fighter without an ACCEPTED sheet keeps the pre-2.10 base-only walk
// byte-identically: the descriptor's fallback is exactly the base cell that
// stride phase used to show, and resolveMotionPose drops to it whenever the
// sheet is missing, still decoding, or manifest-rejected. Eight of ten
// fighters ship that way today.
// ---------------------------------------------------------------------------

/** Cells per walk sheet. Only row 0 of the 4x4 grid carries art. */
export const WALK_CELL_COUNT = 4;

export const WALK_CELLS = Object.freeze({
  contactLeft: 0, passingLeft: 1, contactRight: 2, passingRight: 3,
});

export function walkPose(cell, fallbackBank, fallbackFrame) {
  return { bank: "walk", frame: cell, fallback: { bank: fallbackBank, frame: fallbackFrame } };
}

/**
 * Which of the four walk keys this stride phase is on: 0 -> 1 -> 2 -> 3 -> 0.
 *
 * Deliberately the SAME `walkTime * 10` phase the base cycle has always used,
 * so locomotion speed still drives cadence exactly as it did and the fallback
 * lands on the very base cell the old read would have shown at that instant.
 * Pure function of snapshotted sim state -- no Math.random, no observer
 * latch -- so rollback resimulation and both online peers agree.
 */
export function walkCycleFrame(walkTime) {
  const phase = Math.floor((Number.isFinite(walkTime) ? walkTime : 0) * 10);
  return ((phase % WALK_CELL_COUNT) + WALK_CELL_COUNT) % WALK_CELL_COUNT;
}

/**
 * The locomotion descriptor: the authored key, falling back to the base walk
 * cell that same phase already used. `roles.walk` is [4,5,6,7] for all ten
 * fighters, so the fallback is byte-for-byte the pre-2.10 read.
 */
export function walkCyclePose(walkTime, roles = DEFAULT_BASE_ROLES, { extended = false } = {}) {
  const walkKeys = roles.walk || DEFAULT_BASE_ROLES.walk;
  // v4.0: a fighter with a whole ext sheet walks the SIX-key alternating cycle
  // at the rate that holds the gait period. Everything below this branch is the
  // 3.5 four-key path, reached byte-for-byte by every fighter without one (the
  // five holdouts until 4.1/5.2; a sheet that fails to decode today).
  if (extended) {
    const step = UNIFIED_EXT_WALK_KEYS[walkCycleFrameExt(walkTime)];
    // The degraded chain, innermost first: the four-key cycle's drawing at this
    // point in the stride, then the 2.10 walk-bank cell, then the base cell.
    const under = walkPose(step.under, "base", walkKeys[step.under % walkKeys.length]);
    const main = unifiedPose(UNIFIED_WALK_KEYS[step.under % UNIFIED_WALK_KEYS.length], under);
    // A main-sheet key needs no ext link at all; only 17 and 18 do.
    return step.ext ? unifiedExtPose(step.cell, main) : unifiedPose(step.cell, under);
  }
  const key = walkCycleFrame(walkTime);
  const walk = walkKeys;
  // v3.0: locomotion is the beat this whole programme exists for — the
  // costume strobe the 2.9 round rejected happened on the tick a fighter
  // started walking. A unified fighter cycles the four keys of his own sheet
  // at the identical `walkTime * 10` cadence; the 2.10 walk-bank descriptor
  // (accept:false roster-wide since the 2.9 consistency gate) and then the
  // base walk cell stay underneath it, so an unsheeted fighter's locomotion
  // is byte-identical to what ships today.
  return unifiedPose(UNIFIED_WALK_KEYS[key % UNIFIED_WALK_KEYS.length],
    walkPose(key, "base", walk[key % walk.length]));
}

// ---------------------------------------------------------------------------
// v3.5 BACK-WALK — the retreat is a WALK, not a stance.
//
// THE BUG, as it shipped. This game guards the SF2 way: there is no guard
// button, you hold away. `updateFighter` therefore sets `guarding`/`block` on
// EVERY tick a fighter holds back — including the ticks he is simply walking
// backwards at his kit's own `backWalkSpeed` (the kits have carried a distinct
// one per fighter since the first wave: 182 on deathblow against 246 forward,
// 304 on donald against 246). The sim modelled the retreat perfectly. The
// RENDERER then asked "is he blocking?" before it asked "is he moving?", so
// the standing-guard branch outranked the locomotion branch and every fighter
// on the roster drew ONE cell -- unified:7, the guard -- for the whole retreat
// while his x slid out from under him. Measured before the fix on all ten:
// back-walk resolved to exactly one distinct cell (`unified:7`) across 30
// ticks, against the four-key cycle `unified:1/2/3/4` a forward walk of the
// same fighter drew over the same span. That is the reported glide, and it was
// universal because the ROUTING decided it, not the art.
//
// Two pure functions fix it, and they live here rather than in the renderer so
// both renderers, the tests and any future consumer share one answer.
// ---------------------------------------------------------------------------

/**
 * The locomotion gate, in world px/sec of |vx|. Below it a fighter is standing
 * still as far as pose selection is concerned. This is the same threshold the
 * 2D renderer's walk branch has always used, named so the guard branch and the
 * walk branch cannot drift apart.
 */
export const WALK_POSE_MIN_SPEED = 22;

/**
 * THE STANCE DECISION for a grounded fighter — "crouch", "guard", "walk" or
 * null (this is not a guard/crouch tick at all; carry on down the chain).
 *
 * The judgement call it encodes: the standing guard drawing owns the beats
 * where GUARDING IS WHAT THE BODY IS DOING, and nothing else.
 *
 *   blockstun   -> "guard". He is pinned, absorbing a hit; the sim is already
 *                  bleeding his vx and he is not taking steps. This is also
 *                  the beat that makes the guard read appear exactly when the
 *                  guard is doing work, which is the tell a player needs.
 *   crouch      -> "crouch". Crouch-guard has vx forced to 0 upstream, so
 *                  there is no locomotion to draw in the first place.
 *   held guard,
 *   not moving  -> "guard". Standing his ground: the stance is correct.
 *   held guard,
 *   MOVING      -> "walk". A retreating fighter animates his retreat. This is
 *                  what every 2D fighter in the genre does -- backing up while
 *                  blocking still moves the legs -- and it costs the defence
 *                  nothing: `block` is SIM state and is untouched here, so the
 *                  fighter guards exactly as hard as he did before. Only the
 *                  drawing changed.
 *
 * `dashExiting` keeps the dash-brake window (which owns the velocity decay out
 * of a back dash and has its own authored key) from being claimed as a walk,
 * so exactly one branch can win a tick.
 *
 * Pure function of snapshotted sim state — no observer latch, no Math.random —
 * so rollback resimulation and both online peers agree.
 */
export function groundedStanceBeat({
  block = false, blockstunFrames = 0, crouch = false, grounded = true,
  vx = 0, dashExiting = false,
} = {}) {
  if (crouch) return "crouch";
  if (blockstunFrames > 0) return "guard";
  if (!block) return null;
  const moving = grounded && !dashExiting
    && Math.abs(Number.isFinite(vx) ? vx : 0) > WALK_POSE_MIN_SPEED;
  return moving ? "walk" : "guard";
}

/**
 * One tick of the STRIDE CLOCK, signed along the fighter's own facing.
 *
 * Why a second clock instead of reusing `walkTime`. `walkTime` advances at a
 * flat `dt` whenever |vx| > 20, so the stride cadence is a constant 10 keys/s
 * no matter how fast the body is actually travelling. Forward that is the
 * cadence the walk art was drawn for; on a retreat at 0.74x the speed it means
 * the same number of steps over 26% less ground, i.e. the feet skate backwards
 * on top of the glide. This returns `dt` scaled by the fraction of the
 * fighter's OWN forward walk speed he is currently making, so one stride
 * always covers the same distance and the plant rate tracks the ground.
 *
 * It is SIGNED by `vx * facing`: advancing winds the clock forward and
 * retreating winds it BACK, so `walkCycleFrame` (which already normalises a
 * negative phase into the grammar) plays the identical four keys in reverse
 * and the legs un-step. A reversal is therefore continuous -- no phase jump at
 * the tick the fighter turns round -- and the phase is a function of NET
 * DISTANCE TRAVELLED, which is exactly the non-skating condition.
 *
 * At a full-speed forward walk the ratio is 1 and this returns `dt` unchanged,
 * so a fighter walking forwards keeps the shipped cadence byte-for-byte.
 */
// v4.4 TEMPO: the drawn contact keys plant the feet ~0.66 of a body height
// apart, so one six-key cycle (two steps) covers far more ground than the
// 153px a full-speed walk made in the 0.4s cycle — the legs were cycling
// faster than the floor went past. The caller divides the reference speed by
// this, so a full-speed walk now winds the cycle at 0.62x (≈0.65s per cycle)
// and the planted foot stays put on the floor.
export const STRIDE_CADENCE = 0.62;

export function strideClockAdvance(vx, facing, forwardWalkSpeed, dt) {
  const speed = Number.isFinite(vx) ? vx : 0;
  if (Math.abs(speed) <= WALK_POSE_MIN_SPEED) return 0;
  const reference = Number.isFinite(forwardWalkSpeed) && forwardWalkSpeed > 0
    ? forwardWalkSpeed : Math.abs(speed);
  const gait = speed * (facing < 0 ? -1 : 1);
  // Capped so a scripted or mutator-boosted overspeed cannot spin the cycle
  // into a strobe; 1.6x the kit's own walk is already a run.
  const rate = Math.max(-1.6, Math.min(1.6, gait / reference));
  return (Number.isFinite(dt) ? dt : 0) * rate;
}

/**
 * Per-fighter accept masks (+ build scale, kept for reference) from
 * assets/motion/MANIFEST.json. A cell missing from the manifest is treated as
 * rejected, so a stale manifest can never ship an unreviewed frame.
 */
export function buildMotionAcceptMasks(manifest, cellCount = MOTION_CELL_COUNT) {
  const masks = {};
  for (const [fighterId, entry] of Object.entries(manifest?.fighters || {})) {
    const accept = new Array(cellCount).fill(false);
    for (const cell of entry.cells || []) {
      if (Number.isInteger(cell.frame) && cell.frame >= 0 && cell.frame < cellCount) {
        accept[cell.frame] = cell.accept === true;
      }
    }
    masks[fighterId] = { accept: Object.freeze(accept), scale: Number(entry.scale) || 1 };
  }
  return masks;
}

/**
 * The authored sheet banks, in the order they were added. v3.0 appends
 * "unified" — it is index-addressed against a fixed 16-cell grammar like the
 * first three, so it rides exactly the same sheet + accept-mask gate and the
 * 3D renderer picks it up from this list with no bank-specific code.
 */
// v4.0 appends "unified-ext" for the same reason: it is index-addressed against
// a fixed grammar on a 320px-cell sheet, so it rides the identical sheet +
// accept-mask gate. It is deliberately LAST — the order is the order the banks
// were added, and the 3D renderer walks this list to decide which pose banks it
// must build a texture for.
// v5.2 appends "unified-ext5" (the locomotion sheet), last for the same reason.
export const AUTHORED_BANKS = Object.freeze([
  "motion", "motion2", "walk", UNIFIED_BANK, UNIFIED_EXT_BANK, UNIFIED_EXT2_BANK, UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK, UNIFIED_EXT5_BANK,
]);

/** True for a bank that must clear the sheet + accept-mask gate before it draws. */
export function isAuthoredBank(bank) {
  return AUTHORED_BANKS.includes(bank);
}

/**
 * Resolve a pose descriptor against sheet availability: an authored bank
 * ("motion", v2.9 "motion2", or v2.10 "walk") holds only while
 * `drawable(cell, bank)` reports that bank's sheet loaded AND its manifest
 * accepting the cell; otherwise the descriptor's fallback wins. The chain is
 * walked, so a motion2 beat whose pre-2.9 read was itself a bank-1 cell still
 * degrades all the way to base cleanly. Non-authored poses pass through
 * untouched.
 */
export function resolveMotionPose(pose, drawable, fighterId = null, options = {}) {
  // v2.9 critic round 2 (B4): a BARE-HANDED move may not resolve to a cell
  // that depicts the fighter's signature prop being swung.
  const bareHanded = options.bareHanded === true;
  let current = pose;
  let guard = 0;
  while (current && (isAuthoredBank(current.bank) || current.bank === MOTION3_BANK) && guard < 12) {
    guard += 1;
    // v2.9 critic round 2 (B1): motion3 keys are addressed BY POSE NAME, so
    // the host answers with the RESOLVED FRAME INDEX (or false). The
    // index-addressed banks keep the boolean contract they shipped with.
    const answer = current.bank === MOTION3_BANK
      ? drawable(current.key, MOTION3_BANK)
      : drawable(current.frame, current.bank);
    const frame = answer === true ? current.frame
      : Number.isInteger(answer) && answer >= 0 ? answer : -1;
    if (frame >= 0 && !(bareHanded && isPropActionCell(fighterId, current.bank, frame))) {
      return frame === current.frame ? current : { ...current, frame };
    }
    current = current.fallback || { bank: "base", frame: 0 };
  }
  // v2.9 critic round: the `unusable` swap runs on whatever base cell won, so
  // an art-defect cell can never reach a renderer no matter which beat, kit
  // or fallback chain produced it.
  if (fighterId && current && current.bank === "base") {
    const swapped = bareHanded ? bareHandedFrame(fighterId, "base", current.frame) : current.frame;
    const safe = safeBaseFrame(fighterId, swapped);
    if (safe !== current.frame) return { ...current, frame: safe };
  }
  return current;
}

/**
 * Strike-beat classification shared by the pose functions AND the procedural
 * extension envelope (fighterMotionTransform in game.js), so the chosen cell
 * and the transform riding it always agree. Pure function of the snapshotted
 * attack instance + attackFrame.
 */
export function attackMotionBeat(attack, attackFrame, options = undefined) {
  if (!attack) return null;
  const start = attack.activeStartFrame;
  const end = attack.activeEndFrame;
  // v2.9 critic round 2 (B1): the THROW attacker's recovery. Measured at 31
  // ticks frozen on one kit cell after the clinch released. `cell` stays null
  // so no legacy consumer changes behaviour; the sequence rides `keys`.
  if (attack.kind === "throw") {
    if (attackFrame < end) return null;
    // A throw's totalFrames includes the whole clinch, so measuring the
    // recovery against it stretched the first band over 25 ticks. The track is
    // paced against the recovery window itself, capped at a real recovery
    // length rather than the move's whole timeline.
    const tail = Math.min(THROW_RECOVERY_TICKS, Math.max(1, (attack.totalFrames ?? end + 1) - end));
    return {
      beat: "throwRecover",
      cell: null,
      keys: throwRecoveryKeys(options),
      phase: Math.min(0.999, (attackFrame - end) / tail),
    };
  }
  const crouching = Boolean(attack.cancelProfileId?.startsWith("crouch"));
  const airborne = attack.level === ATTACK_LEVELS.AIR;
  // v2.9 critic round (B5): a kit-less AIR NORMAL is one authored pose for its
  // WHOLE window — startup, active and recovery. 2.9 only owned the active
  // band, so the move played grounded standing base cells for ~4 airborne
  // ticks, then base(13) (a HIGH KICK on benny, a costume swap on deathblow)
  // for ~4 more, then snapped to the authored diving strike: the extended
  // limb teleported leg -> fist mid-move. Checked before every other beat so
  // no smear/charge/windup branch can re-open the grounded reads.
  if (airborne && !attack.animation && (attack.kind === "light" || attack.kind === "heavy")) {
    // v2.9 critic round 2 (B1): round 1 fixed WHICH cell an air normal wears
    // and left it wearing that ONE cell for all 30 ticks of the move — the
    // longest single-drawing hold measured anywhere in the build. `cell` and
    // `bank` are unchanged (the beat's signature drawing, and what the 2.9
    // contract asserts); `keys` sequences chamber -> strike -> trail -> gather
    // across the same window.
    const total = Math.max(1, attack.totalFrames ?? end + 1);
    return {
      beat: "airAttack",
      bank: "motion2",
      cell: MOTION2_CELLS.airAttack,
      keys: airNormalKeys(start / total, end / total),
      phase: Math.min(0.999, Math.max(0, attackFrame / total)),
    };
  }
  if (attackFrame < start) {
    // 1-2 FLASH frames between windup and contact on standing heavies,
    // specials and supers. Rising arcs streak upward (smear-v); overheads
    // keep their authored windup — the grammar has no downward smear, and
    // (2.7 critic round) no LEG smear either: both smear cells are painted
    // ARM streaks, so kick-limb strikes keep their authored windup.
    // (2.7 critic round J4) The Commissioner's authored smears are CANE
    // thrusts, but his kit-less normals are bare-fisted — the cane
    // materialised for the 2-frame flash and vanished at contact. His
    // bare-hand normals keep their authored windup; kit moves (cane art
    // throughout) keep the smear.
    const smearEligible = start >= 6 && !crouching && !airborne
      && attack.kind !== "light" && attack.level !== ATTACK_LEVELS.OVERHEAD
      && attack.limb !== "kick"
      && !(attack.fighterId === "commissioner" && !attack.animation);
    if (smearEligible && attackFrame >= start - 2) {
      const rising = attack.juggleStarter
        || (Number.isFinite(attack.launchVelocityY) && attack.launchVelocityY < 0)
        || attack.kitAction === "launcher" || attack.kitAction === "enhancedLauncher";
      return { beat: "smear", cell: rising ? MOTION_CELLS.smearV : MOTION_CELLS.smearH };
    }
    // v2.9 FLOW: 2-4 tick authored ANTICIPATION key on kit-less standing
    // heavies — cocked-back fist (punch limb) / chambered knee (kick limb)
    // riding the startup ticks immediately before the smear→extension
    // sequence, so the bank-1 extension stops appearing from a neutral
    // guard: windup → smear flash → extension → follow reads as ONE swing.
    // Re-skins EXISTING startup ticks only (startup length untouched);
    // moves with authored windup art (kit animation), overheads (arms rise
    // overhead, not back) and the drive shoulder run keep their own reads.
    const windupEligible = !attack.animation && attack.kind === "heavy"
      && !crouching && !airborne
      && attack.level !== ATTACK_LEVELS.OVERHEAD && attack.kitAction !== "driveHeavy";
    if (windupEligible) {
      const smearTicks = smearEligible ? 2 : 0;
      // v2.9 critic round (M2): the anticipation fills WHATEVER startup room
      // exists above a 2-tick minimum — exactly the shape the 2.8 charge gate
      // uses — instead of the old `Math.min(4, ...)` cap. That cap left long-
      // startup heavies leaking the base windup cells for the first ticks of
      // the swing, which on deathblow is his costume-mismatched base(13):
      // five consecutive ticks (83ms) of tactical trousers and combat boots
      // in the middle of a kick. Only the smear flash is reserved.
      // v2.9 final round (T3): a kick-limb heavy reserves the same two ticks
      // the punch gives its smear, but spends them on the ARC TRANSFORM — the
      // chamber cell keeps drawing while the body rotates back and rises onto
      // the support leg, so the extension is arrived at instead of cut to.
      const kickArcTicks = !smearEligible && attack.limb === "kick" && start >= 6 ? 2 : 0;
      const windupEnd = start - smearTicks - kickArcTicks;
      if (kickArcTicks && windupEnd >= 2 && attackFrame >= windupEnd) {
        return {
          // The arc CONTINUES the windup's last drawing — the deepest coil —
          // rather than re-showing the chamber, which would be a rewind. The
          // two ticks are a pure transform continuation into the extension.
          beat: "kickArc", bank: "motion2", cell: MOTION2_CELLS.crouchTrans,
          phase: Math.min(0.999, Math.max(0, (attackFrame - windupEnd) / kickArcTicks)),
        };
      }
      if (windupEnd >= 2 && attackFrame < windupEnd) {
        // v2.9 critic round 2 (B1): filling the window with ONE drawing was
        // the other half of the problem — deathblow's heavy kick owned 17
        // consecutive ticks (283ms) of the chambered-knee cell. `cell` stays
        // the beat's signature drawing (the limb chamber, which is what the
        // 2.9 contract asserts and what the transform pairs with); `keys`
        // splits the window into gather -> [mid] -> cocked.
        return {
          beat: "windup", bank: "motion2",
          cell: attack.limb === "kick" ? MOTION2_CELLS.windupKick : MOTION2_CELLS.windupPunch,
          keys: heavyWindupKeys(attack.limb, options),
          phase: Math.min(0.999, Math.max(0, attackFrame / windupEnd)),
        };
      }
    }
    // Super/EX startups hold the gathered charge stance until the smear.
    // 2.7 critic round: the stance occupies WHATEVER startup room exists
    // above a 2-tick minimum — the old `start >= 8` gate left every short
    // super/EX (cyraxx's whole meltdown kit, jez/benny/ali supers) holding a
    // generic base windup while devil got his authored charge. Only the
    // smear flash (when one will fire) is reserved out of the window;
    // genuinely instant moves (< 2 ticks of room) still skip it.
    // v4.9 IN-BETWEENS: a LIGHT's anticipation, and a crouching heavy's — the
    // one startup the 2.9 flow left on raw base cells (8 then 9). With the
    // in-between sheet the whole startup wears the fighter's own cocked limb;
    // the beat exists only when the caller passes `inbetween`, so every
    // fighter without the sheet classifies exactly as before.
    if (options?.inbetween && !attack.animation && !airborne
      && attack.level !== ATTACK_LEVELS.OVERHEAD && attack.kitAction !== "driveHeavy"
      && (attack.kind === "light" || (attack.kind === "heavy" && crouching)) && start >= 1) {
      return {
        beat: "cock", cell: null,
        keys: lightWindupKeys(attack.limb, { inbetween: true, heavy: attack.kind === "heavy", crouching }),
        phase: Math.min(0.999, Math.max(0, attackFrame / start)),
      };
    }
    if (attack.superMove || (attack.gritCost || 0) > 0) {
      const chargeEnd = start - (smearEligible ? 2 : 0);
      if (chargeEnd >= 2 && attackFrame < chargeEnd) {
        return { beat: "charge", cell: MOTION_CELLS.charge };
      }
    }
    return null;
  }
  if (attackFrame >= end) {
    // v2.9 critic round 2 (B1): the RECOVERY of a kit-less normal. Measured
    // 20-23 ticks frozen on one base cell on every fighter tested. Gated to
    // kit-less normals exactly like the windup/smear/extension beats, so an
    // authored special's own recovery art is untouched.
    if (!attack.animation && (attack.kind === "light" || attack.kind === "heavy")) {
      const tail = Math.max(1, (attack.totalFrames ?? end + 1) - end);
      return {
        beat: "recover",
        cell: MOTION_CELLS.follow,
        keys: attackRecoveryKeys(options, { limb: attack.limb, heavy: attack.kind === "heavy", crouching }),
        phase: Math.min(0.999, (attackFrame - end) / tail),
      };
    }
    return null;
  }
  const progress = (attackFrame - start) / Math.max(1, end - start);
  // Full-extension contact for the matching limb — kit-less normals only
  // (authored specials cells stay the contact art; driveHeavy is a shoulder/
  // body run, not a limb extension). 2.7 critic round J1: heavies hold the
  // extension cell straight through the mid-band into the follow key — the
  // old 0.34 cutoff dropped back to the raised-fist base cell mid-swing,
  // which read as punch / re-cock / punch. The extension beat's FALLBACK is
  // that exact base cell, so a missing/rejected bank still shows the 2.6
  // read frame-for-frame.
  // v4.9 IN-BETWEENS: with the fighter's own recover drawing waiting after
  // the swing, a light holds its extension through the whole active window
  // instead of dropping to the raw base strike cell for its back half.
  if (!attack.animation && !crouching && !airborne && attack.kitAction !== "driveHeavy"
    && (attack.kind === "light" || attack.kind === "heavy")
    && progress < (attack.kind === "light" ? (options?.inbetween ? 1 : 0.52) : 0.67)) {
    return { beat: "extension", cell: attack.limb === "kick" ? MOTION_CELLS.kickExt : MOTION_CELLS.punchExt };
  }
  // Follow-through key: the authored weight-carry replaces the recovery cell
  // arriving early.
  if (attack.kind !== "light" && progress >= 0.67) return { beat: "follow", cell: MOTION_CELLS.follow };
  return null;
}

export function attackAnimationPose(attack, attackFrame, options = undefined) {
  const animation = attack?.animation;
  if (!animation) return null;
  // v5.0: a PLAIN special (no super, no EX charge) gathers on the fighter's
  // own special wind-up for the first half of its startup and settles on the
  // special recover for the tail of its recovery, both over the kit's own
  // cell; supers, EX and throws keep their authored reads. Only with the
  // in-between sheet — without it the kit art shows exactly as before.
  const plainSpecial = options?.inbetween && attack.kind === "special" && !attack.superMove
    && !((attack.gritCost || 0) > 0) && attack.level !== ATTACK_LEVELS.AIR;
  let index = 0;
  if (attackFrame >= attack.activeEndFrame) index = 3;
  else if (attackFrame >= attack.activeStartFrame) {
    const activeProgress = (attackFrame - attack.activeStartFrame) / Math.max(1, attack.activeFrames);
    // v2.6 BODY-FIRST: heavies and specials play a full three-beat across the
    // active window — strike, second strike pose, then the FOLLOW-THROUGH
    // (the recovery cell arriving a third early, weight carrying past the
    // target) — so no active window ever holds one frozen cell. Lights keep
    // the tighter two-beat; their follow-through is the procedural extension
    // transform in the renderers.
    if (attack.kind === "light") index = activeProgress < 0.52 ? 1 : 2;
    else index = activeProgress < 0.34 ? 1 : activeProgress < 0.67 ? 2 : 3;
  }
  const frame = animation.frames[index];
  if (plainSpecial) {
    if (attackFrame < attack.activeStartFrame * 0.5 && attack.activeStartFrame >= 4) {
      return unifiedExt2Pose(UNIFIED_EXT2_CELLS.specialWindup, { bank: animation.bank, frame });
    }
    const total = attack.totalFrames ?? attack.activeEndFrame + 1;
    const tail = total - attack.activeEndFrame;
    if (attackFrame >= attack.activeEndFrame && tail >= 6 && attackFrame - attack.activeEndFrame >= tail * 0.55) {
      return unifiedExt2Pose(UNIFIED_EXT2_CELLS.specialRecover, { bank: animation.bank, frame });
    }
  }
  // v2.7 FRAMES: authored charge/smear/follow keys ride over the kit
  // sequence, each carrying the exact cell it replaces as its fallback.
  const beat = attackMotionBeat(attack, attackFrame, options);
  if (beat && beat.beat !== "extension") {
    // v2.9 critic round 2 (B1): a beat that carries a KEY TRACK sequences
    // through it, with the kit's own cell as the terminal fallback — that is
    // how the throw attacker's 31-tick recovery freeze becomes release ->
    // follow-through -> stance without losing the kit art.
    if (beat.keys) return beatPoseAt(beat.keys, beat.phase ?? 0, { bank: animation.bank, frame });
    // v2.9 FLOW: beats may name either authored bank (windup/air-attack are
    // motion2). In practice both are gated on kit-less moves, but the routing
    // stays bank-correct if a future beat lands here.
    return beat.bank === "motion2"
      ? motion2Pose(beat.cell, animation.bank, frame)
      : motionPose(beat.cell, animation.bank, frame);
  }
  return { bank: animation.bank, frame };
}

export function selectKitAiIntent(fighterId, {
  distance = Infinity,
  opponentAirborne = false,
  opponentAttacking = false,
  meter = 0,
  roll = 0.5,
  // 4.3 DEMO SPACING: `spacing` scales every kit range (1 = the kit as
  // authored), `patience` (0..1) thins out the mid-band pokes so two CPUs keep
  // a readable gap and each move can be seen instead of a permanent clinch.
  spacing = 1,
  patience = 0,
} = {}) {
  const kitAi = getFighterKit(fighterId)?.ai;
  if (!kitAi) return null;
  // Floors: a grappler kit authored to fight at 82px would still clinch at
  // 1.6x, so the demo band never sits closer than a readable ~230px.
  const ai = spacing === 1 ? kitAi : {
    ...kitAi,
    preferredRange: Math.max(kitAi.preferredRange * spacing, 230),
    retreatRange: Math.max(kitAi.retreatRange * spacing, 130),
    approachRange: Math.max(kitAi.approachRange * spacing, 340),
  };
  const calm = 1 - Math.max(0, Math.min(1, patience));
  if (opponentAttacking
    && ai.counterAction
    && distance < (ai.counterRange || 160)
    && roll < (ai.counterChance || 0.7)) {
    return { movement: "hold", action: ai.counterAction, response: "counter" };
  }
  if (opponentAirborne && distance < 180) return { movement: "hold", action: ai.antiAirAction };
  if (meter >= GRIT_RULES.superCost && roll < 0.22 && distance < 245) return { movement: "hold", action: "super" };
  if (distance < ai.retreatRange) {
    const action = roll < 0.42 ? ai.closeAction : roll < 0.72 ? "light" : "throw";
    // A patient brain backs out of the clinch, but still swings on the way
    // out: the hit/block pushback is what actually restores the gap.
    return { movement: ai.retreatWhenClose || fighterId === "jez" || patience > 0 ? "retreat" : "hold", action };
  }
  if (distance > ai.approachRange) {
    return { movement: "advance", action: roll < 0.34 ? ai.rangedAction : null };
  }
  if (distance > ai.preferredRange + 28) return { movement: "advance", action: roll < 0.48 * calm ? ai.pokeAction : null };
  if (distance < ai.preferredRange - 24) return { movement: ai.retreatWhenClose || fighterId === "jez" || patience > 0 ? "retreat" : "hold", action: roll < 0.52 * calm ? ai.closeAction : roll >= 1 - 0.48 * calm ? "heavy" : null };
  return { movement: "hold", action: roll < 0.36 * calm ? ai.pokeAction : roll < 0.62 * calm ? "light" : roll < 0.8 * calm ? "heavy" : null };
}

export function listFighterMoves(fighterId) {
  const kit = getFighterKit(fighterId);
  if (!kit) return [];
  const moves = kit.moveList.map(([name, command]) => ({ name, command }));
  // Release 1.7 wave 11: the two forward command kicks are derived data, so
  // they are listed from their derived profiles rather than hand-copied into
  // every kit's move list.
  const stepKnee = getKitMoveProfile(fighterId, "light", { limb: "kick", forwardHeld: true });
  const forwardHeavy = getKitMoveProfile(fighterId, "heavy", { limb: "kick", forwardHeld: true });
  if (stepKnee) moves.splice(1, 0, { name: stepKnee.moveName, command: "→ + LK" });
  if (forwardHeavy) {
    moves.splice(2, 0, {
      name: forwardHeavy.moveName,
      command: `→ + HK · ${forwardHeavy.level === ATTACK_LEVELS.LOW ? "low" : "overhead"}`,
    });
  }
  // The personal throwable is data-driven, so it is listed from the throwable
  // table rather than duplicated into every kit's move list.
  const throwable = FIGHTER_THROWABLES[fighterId];
  if (throwable) {
    moves.splice(Math.max(0, moves.length - 1), 0, {
      name: throwable.name,
      command: `${THROWABLE_COMMAND.display} · ${throwable.usesPerRound} per round`,
    });
    if (throwable.variants?.ex) {
      moves.splice(Math.max(0, moves.length - 1), 0, {
        name: throwable.variants.ex.name || `${throwable.name} EX`,
        command: `${ENHANCED_THROWABLE_COMMAND.display} · ${GRIT_RULES.enhancedSpecialCost} Grit + 1 object`,
      });
    }
  }
  return moves;
}

/**
 * R1.9 SCHOOL & POCKET: the move-list frame-data table. Every row is built
 * from a LIVE attack instance (createFighterMove, i.e. post-ARCADE_TUNING and
 * spatial scale), so the dialog can never drift from what the sim actually
 * runs — the repo's assert-the-rule-not-the-number philosophy applied to UI.
 */
const FRAME_DATA_ROWS = Object.freeze([
  { command: "LP", action: "light", context: {} },
  { command: "\u2192 + LP", action: "light", context: { forwardHeld: true } },
  { command: "\u2193 + LP", action: "light", context: { crouching: true } },
  { command: "LK", action: "light", context: { limb: "kick" } },
  { command: "\u2192 + LK", action: "light", context: { limb: "kick", forwardHeld: true } },
  { command: "\u2193 + LK", action: "light", context: { limb: "kick", crouching: true } },
  { command: "HP", action: "heavy", context: {} },
  { command: "\u2192 + HP", action: "heavy", context: { forwardHeld: true } },
  { command: "\u2193 + HP", action: "heavy", context: { crouching: true } },
  { command: "HK", action: "heavy", context: { limb: "kick" } },
  { command: "\u2192 + HK", action: "heavy", context: { limb: "kick", forwardHeld: true } },
  { command: "\u2193 + HK", action: "heavy", context: { limb: "kick", crouching: true } },
  { command: "CLOSE \u21c4 + LP/LK", action: "throw", context: {} },
  { command: "", action: "special", context: {} },
  { command: "", action: "commandSpecial", context: {} },
  { command: "", action: "backSpecial", context: {} },
  { command: "", action: "launcher", context: {} },
  { command: "", action: "driveHeavy", context: {} },
  { command: "", action: "enhanced", context: {} },
  { command: "", action: "enhancedCommandSpecial", context: {} },
  { command: "", action: "enhancedBackSpecial", context: {} },
  { command: "", action: "enhancedLauncher", context: {} },
  { command: "", action: "super", context: {} },
]);

export function prettyProfileName(profileId = "", fighterId = "") {
  return String(profileId)
    .replace(new RegExp(`^${fighterId}-`), "")
    .replace(/-/g, " ")
    .toUpperCase();
}

export function listFighterFrameData(fighterId) {
  const kit = getFighterKit(fighterId);
  if (!kit) return [];
  const rows = [];
  for (const { command, action, context } of FRAME_DATA_ROWS) {
    const move = createFighterMove(fighterId, action, context);
    if (!move) continue;
    const data = attackFrameData(move);
    rows.push({
      action,
      name: move.moveName || prettyProfileName(move.profileId, fighterId),
      command: command || move.command || "",
      ...data,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// R2.0 FAMILY wave 16 — context-aware win-quote pools. kit.victory.quote stays
// as the last-resort fallback; the result screen asks selectWinQuote() for a
// line keyed to HOW the match was won. Pure data + a pure selector so tests
// can hold every pool and the rotation contract to account. Presentation only:
// the roll comes from visualRandom() at the call site, never state.rng.
// ---------------------------------------------------------------------------

const quotes = (...lines) => Object.freeze(lines);

export const FIGHTER_WIN_QUOTES = deepFreeze({
  deathblow: {
    default: quotes("THE STREET MOVED FIRST.", "CONCRETE SETS. SO DO I.", "GO HOME. THE GROUND'S TAKEN."),
    rival: quotes("SOUTH PHILLY'S TOO SMALL FOR TWO OF US, ALLAN.", "YOUR HANDS ARE HEAVY, ALLAN. THE GROUND IS HEAVIER.", "TELL THE DOCKS THE QUARRY WON."),
    fatality: quotes("THE GROUND KEEPS WHAT IT TAKES.", "THAT'S A LOAD-BEARING LESSON.", "CLEANUP'S ON YOU."),
    flawless: quotes("NOT A CRACK ON ME.", "YOU NEVER TOUCHED THE FOUNDATION.", "INSPECTION PASSED. YOURS DIDN'T."),
    comeback: quotes("YOU BUILT ON SAND.", "I WAS DOWN. THE GROUND WASN'T.", "AFTERSHOCKS HIT HARDEST."),
    boss: quotes("YOUR LEDGER'S RUBBLE NOW.", "THE BOOK BREAKS LIKE EVERYTHING ELSE.", "FILE THAT UNDER DEMOLITION."),
  },
  jez: {
    default: quotes("READ THE SIGN.", "LIGHTS OUT. SIGN'S STILL ON.", "THAT'S HOW YOU HANG A LETTER."),
    rival: quotes("PAINT DRIPS, POST. NEON HOLDS.", "TAG THAT, POST — IF YOUR ARM STILL WORKS.", "MY SIGN OUTLASTS YOUR WALL, POST."),
    fatality: quotes("SOME SIGNS YOU ONLY READ ONCE.", "THAT ONE'S PERMANENT INSTALLATION.", "CLOSED. FOREVER. SEE SIGN."),
    flawless: quotes("CLEAN INSTALL. NO SCRATCHES.", "YOU NEVER TOUCHED THE GLASS.", "SHOWROOM FINISH."),
    comeback: quotes("FLICKERED. NEVER WENT DARK.", "YOU FORGOT NEON RUNS ALL NIGHT.", "LAST LIGHT STANDING WINS."),
    boss: quotes("YOUR NAME'S OFF THE MARQUEE, COMMISSIONER.", "NEW SIGN GOING UP: EVERYBODY GETS HOME.", "THE BOOK'S CLOSED. THE SHOP'S OPEN."),
  },
  alan: {
    default: quotes("SIX SHOTS. ONE ANSWER.", "YOUSE SEEN ENOUGH?", "THAT'S HOW WE SETTLE IT DOWN HERE."),
    rival: quotes("TOO SLOW, DEATHBLOW. TOO LOUD.", "THE GROUND DIDN'T SAVE YA, DEATHBLOW.", "QUARRY'S CLOSED, BIG MAN."),
    fatality: quotes("I TOLD YA TO STAY DOWN.", "THAT ONE'S ON YOU.", "NO REMATCH FOR THAT."),
    flawless: quotes("YOUSE NEVER LAID A GLOVE.", "MY CORNER DIDN'T EVEN STAND UP.", "UNTOUCHED. UNBOTHERED."),
    comeback: quotes("HEART OF SOUTH PHILLY, BABY.", "I EAT COUNTS OF EIGHT FOR BREAKFAST.", "YA HAD ME. YA BLEW IT."),
    boss: quotes("KEYS ARE MINE NOW, COMMISSIONER.", "EVERY DOOR YOU LOCKED OPENS TONIGHT.", "THE BOOK READS DIFFERENT IN MY HANDS."),
  },
  post: {
    default: quotes("THE WHOLE CITY IS MY WALL.", "FRESH COAT. SAME RESULT.", "CAN'T BUFF THIS ONE OUT."),
    rival: quotes("YOUR SIGN'S JUST A STENCIL, JEZ.", "NEON BURNS OUT, JEZ. PAINT SOAKS IN.", "I'LL TAG YOUR SHOP WINDOW ON THE WAY HOME, JEZ."),
    fatality: quotes("THAT'S A MURAL NOW.", "RED'S A GOOD COLOR ON YOU.", "SIGNED IT. DATED IT."),
    flawless: quotes("NOT A DROP ON ME.", "CLEAN LINES, NO DRIPS.", "YOU SPRAYED AIR ALL NIGHT."),
    comeback: quotes("SECOND COAT ALWAYS COVERS.", "YOU CORNERED ME INTO A MASTERPIECE.", "WET PAINT DRIES. I DON'T."),
    boss: quotes("YOUR BLACK BOOK'S MY PRIMER, COMMISSIONER.", "FORTY FEET TALL AND IMPOSSIBLE TO SUBPOENA.", "THE WALLS TALK NOW. THEY SAY YOU LOST."),
  },
  benny: {
    default: quotes("CURRENT STAYS WITH ME.", "GROUNDED. YOU, I MEAN.", "CIRCUIT CLOSED. GO HOME."),
    rival: quotes("MONEY CAN'T BUY AMPS, DONALD.", "SHOULDA PAID YOUR ELECTRIC BILL, DONALD.", "YOUR CADDY CAN'T CARRY THAT ONE, DONALD."),
    fatality: quotes("PRECISION WORK. NO REFUNDS.", "CUT CLEAN. LIVE WIRE.", "THAT'S A CODE VIOLATION. YOURS."),
    flawless: quotes("NEVER TOUCHED THE WIRING.", "ZERO FAULTS ON THE LINE.", "INSULATED, BABY."),
    comeback: quotes("BREAKERS FLIP BACK.", "YOU LEFT ONE WIRE LIVE. MINE.", "SURGE PROTECTED, PAL."),
    boss: quotes("YOUR GRID'S PUBLIC NOW, COMMISSIONER.", "I REROUTED YOUR WHOLE RACKET.", "LIGHTS ON IN KENSINGTON. BOOK CLOSED AT THE VET."),
  },
  donald: {
    default: quotes("NINE HOLES. NO MERCY.", "TREMENDOUS. EVERYBODY SAYS SO.", "YOU'RE FIRED. OBVIOUSLY."),
    rival: quotes("SAD LITTLE SPARKY, BENNY.", "I OWN THE POWER COMPANY, BENNY.", "YOUR UNION CAN'T SAVE YOU, BENNY."),
    fatality: quotes("THAT'S A GOLD-PLATED FINISH.", "CLEANEST CUT ON THE COURSE.", "SOMEBODY FRAME THAT. BEAUTIFUL."),
    flawless: quotes("A PERFECT ROUND. NATURALLY.", "UNTOUCHED. LIKE MY HAIRLINE.", "NOT A BLADE OF GRASS OUT OF PLACE."),
    comeback: quotes("THE BACK NINE IS WHERE I WIN.", "THEY COUNTED ME OUT. LOSERS.", "GREATEST COMEBACK IN HISTORY. MAYBE EVER."),
    boss: quotes("YOU'RE FIRED, COMMISSIONER.", "I'M KEEPING THE TROPHY AND THE CLUBHOUSE.", "YOUR LITTLE BOOK? TERRIBLE READ."),
  },
  cyraxx: {
    default: quotes("THE ECHO GETS THE LAST WORD.", "HEHEHE... STILL LIVE!", "YOU GOT BUFFERED, SON."),
    // Wave 17: the rivalry retunes — the internet cryptid hunts the real one.
    rival: quotes("CAUGHT THE DEVIL ON CAMERA, BABY!", "YOUR SCREECH PEAKED MY MIC, DEVIL. STILL WON.", "THE PINE BARRENS GOT WIFI NOW, DEVIL."),
    fatality: quotes("THAT'S GOING ON THE CHANNEL.", "CLIP IT. LOOP IT. SCREAM IT.", "DELETED. LIKE, PERMANENTLY."),
    flawless: quotes("ZERO PACKET LOSS, BABY!", "YOU COULDN'T EVEN TOUCH THE MIC.", "FULL SIGNAL. NO DAMAGE."),
    comeback: quotes("YOU CAN'T MUTE ME TWICE.", "BUFFERING... BUFFERING... BOOM.", "THE SIGNAL WAS NEVER LOST."),
    boss: quotes("YOUR ARCHIVE'S STREAMING NOW, COMMISSIONER.", "SIX PASSWORDS. ONE SCREAM.", "THE WHOLE CITY HEARD YOU LOSE."),
  },
  ali: {
    default: quotes("KEEP IT MASSIVE.", "BOOYAKASHA. FIGHT OVER.", "RESPEK... FOR ME, OBVIOUSLY."),
    // Wave 17: Ali's beef moves upstairs — the MC versus the COMMISSIONER.
    rival: quotes("CHECK IT — THE COMMISSIONER GOT SERVED.", "YOUR RULES IS WELL BORING, COMMISSIONER.", "IS IT COS I IS BANNED, COMMISSIONER? NOT NO MORE."),
    fatality: quotes("THAT WAS WELL OUT OF ORDER. INNIT.", "DROPPED THE MIC AND THE MAN.", "TELL THE MASSIVE WHAT YOU SAW."),
    flawless: quotes("NOT EVEN A SCRATCH ON THE CHAINS.", "UNTOUCHABLE, ME.", "AII, THAT WAS TOO EASY."),
    comeback: quotes("THE BEAT ALWAYS COMES BACK ROUND.", "YOU HAD ME ON MUTE FOR A MINUTE.", "BIG FINISH. AS REHEARSED."),
    boss: quotes("YOUR RULES GOT REMIXED, COMMISSIONER.", "THE BLOCK'S GOT THE MIC NOW.", "WEST STAINES RUNS THE VET TONIGHT."),
  },
  // Wave 17 — the tenth voice: the Pinelands Devil.
  devil: {
    default: quotes("THE PINES KEEP WHAT THEY CATCH.", "SKREEE! ...LOOSELY, THAT MEANS 'NEXT'.", "GO HOME. THE BARRENS ARE CLOSED."),
    rival: quotes("NO SIGNAL IN THE PINES, CYRAXX.", "YOUR FEEDBACK AIN'T FOLKLORE, CYRAXX.", "STREAM THAT, CYRAXX. LAST EPISODE."),
    fatality: quotes("THE BARRENS FEED TONIGHT.", "THIRTEENTH CHILD. FIRST BLOOD.", "THEY'LL TELL THIS ONE AROUND CAMPFIRES."),
    flawless: quotes("NOT A FEATHER OUT OF PLACE.", "YOU NEVER TOUCHED THE WINGS.", "TWO CENTURIES UNCAUGHT. STILL COUNTING."),
    comeback: quotes("YOU CORNERED A CRYPTID. BAD IDEA.", "THE PINES ALWAYS GROW BACK.", "LEGENDS DON'T STAY DOWN."),
    boss: quotes("MY NAME WAS NEVER IN YOUR BOOK, KEEPER.", "JERSEY DOESN'T ANSWER TO PHILADELPHIA.", "PUT THE CANE DOWN. THE PINES ARE OWED."),
  },
  commissioner: {
    default: quotes("THE BOOK CLOSES WHEN I SAY IT CLOSES.", "COURT IS ADJOURNED.", "YOUR PURSE IS FORFEIT. READ THE FINE PRINT."),
    // Wave 17: the Keeper's rivalry lands on the loudest mouth in the lobby.
    rival: quotes("THE COURT FINDS MR. G IN CONTEMPT.", "YOUR APPEAL IS DENIED, MR. G.", "NO ENCORES IN MY COURTROOM, MR. G."),
    fatality: quotes("SESSION CLOSED. PERMANENTLY.", "THE CANE REMEMBERS EVERY DEBT.", "STRICKEN FROM THE RECORD."),
    flawless: quotes("YOU NEVER TOUCHED THE SUIT.", "OBJECTION NOTED. OVERRULED.", "NOT ONE MARK ON THE LEDGER."),
    comeback: quotes("I WROTE THE LAST CHAPTER MYSELF.", "APPEALS COURT FOUND IN MY FAVOR.", "YOU NEARLY BALANCED THE BOOKS. NEARLY."),
    mirror: quotes("THERE IS ONLY ONE KEEPER.", "A FORGERY. I THOUGHT SO.", "THE BOOK RECOGNIZES ITS AUTHOR."),
  },
});

/**
 * Pick a win quote for `fighterId` given how the match ended. Priority runs
 * most-specific-first: fatality > flawless > comeback > boss > rival > mirror
 * > default. `roll` is a 0..1 presentation roll (visualRandom at the call
 * site); `lastKey` is the previously shown quote key so back-to-back wins
 * never repeat a line while the pool has an alternative.
 */
export function selectWinQuote(fighterId, context = {}, roll = 0, lastKey = "") {
  const pools = FIGHTER_WIN_QUOTES[fighterId];
  if (!pools) return null;
  const order = [];
  if (context.fatality) order.push("fatality");
  if (context.flawless) order.push("flawless");
  if (context.comeback) order.push("comeback");
  if (context.boss) order.push("boss");
  if (context.rival) order.push("rival");
  if (context.mirror) order.push("mirror");
  order.push("default");
  const poolName = order.find((name) => pools[name]?.length) || "default";
  const pool = pools[poolName];
  const keyed = pool.map((text, index) => ({ text, key: `${fighterId}:${poolName}:${index}`, pool: poolName }));
  const candidates = keyed.length > 1 ? keyed.filter((entry) => entry.key !== lastKey) : keyed;
  const clamped = Math.min(0.999999, Math.max(0, Number(roll) || 0));
  return candidates[Math.floor(clamped * candidates.length) % candidates.length];
}
