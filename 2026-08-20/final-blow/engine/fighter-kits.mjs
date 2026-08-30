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
    startupFrames: 4, activeFrames: 16, recoveryFrames: 10, range: 212, damage: 8, push: 68, meter: 8,
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
    startupFrames: 4, activeFrames: 16, recoveryFrames: 9, range: 194, damage: 7, push: 58, meter: 8,
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
    startupFrames: 2, activeFrames: 22, recoveryFrames: 7, range: 224, damage: 5.5, push: 47, meter: 6,
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
    startupFrames: 5, activeFrames: 18, recoveryFrames: 10, range: 201, damage: 7, push: 62, meter: 9,
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
    startupFrames: 3, activeFrames: 25, recoveryFrames: 7, range: 229, damage: 5.5, push: 46, meter: 7,
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
    startupFrames: 4, activeFrames: 17, recoveryFrames: 8, range: 196, damage: 7, push: 54, meter: 8,
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
    startupFrames: 2, activeFrames: 23, recoveryFrames: 6, range: 222, damage: 5.5, push: 43, meter: 6,
    hitstunFrames: 24, blockstunFrames: 18, chipDamage: 2, maxHits: 3, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, advanceSpeed: 950, ignorePushbox: true, reversalInvulnerableFrames: 9,
    rhythmCancel: true, rhythmCancelStacks: 1, cancelRoutes: aliFlowRoutes,
    moveName: "BEAT SKIP EX", command: "↓ ← + LP&HP · triple cross", animation: anim(1),
    hitboxes: [box(18, -201, 178, 145, 0, 10), box(51, -185, 218, 134, 11, 22)],
  }),
  enhancedLauncher: move("ali-ex-bassline-riser", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 4, activeFrames: 14, recoveryFrames: 14, range: 169, damage: 6.5, push: 54, meter: 7,
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

export function attackAnimationPose(attack, attackFrame) {
  const animation = attack?.animation;
  if (!animation) return null;
  let index = 0;
  if (attackFrame >= attack.activeEndFrame) index = 3;
  else if (attackFrame >= attack.activeStartFrame) {
    const activeProgress = (attackFrame - attack.activeStartFrame) / Math.max(1, attack.activeFrames);
    index = activeProgress < 0.52 ? 1 : 2;
  }
  return { bank: animation.bank, frame: animation.frames[index] };
}

export function selectKitAiIntent(fighterId, {
  distance = Infinity,
  opponentAirborne = false,
  opponentAttacking = false,
  meter = 0,
  roll = 0.5,
} = {}) {
  const ai = getFighterKit(fighterId)?.ai;
  if (!ai) return null;
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
    return { movement: ai.retreatWhenClose || fighterId === "jez" ? "retreat" : "hold", action };
  }
  if (distance > ai.approachRange) {
    return { movement: "advance", action: roll < 0.34 ? ai.rangedAction : null };
  }
  if (distance > ai.preferredRange + 28) return { movement: "advance", action: roll < 0.48 ? ai.pokeAction : null };
  if (distance < ai.preferredRange - 24) return { movement: ai.retreatWhenClose || fighterId === "jez" ? "retreat" : "hold", action: roll < 0.52 ? ai.closeAction : "heavy" };
  return { movement: "hold", action: roll < 0.36 ? ai.pokeAction : roll < 0.62 ? "light" : roll < 0.8 ? "heavy" : null };
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
