import { createAttackInstance } from "./foundation.mjs";
import { ATTACK_LEVELS } from "./defense.mjs";
import { GRIT_RULES, matchCommandSequence } from "./combos.mjs";

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
    command: "← → + HEAVY", hitboxes: [box(32, -190, 145, 129, 0, 4), box(51, -178, 166, 120, 5, 8)],
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
    moveName: "FAULTLINE FIST", command: "↓ → + SPECIAL", animation: anim(0),
    hitboxes: [box(31, -199, 168, 151, 0, 5), box(52, -184, 191, 141, 6, 12)],
  }),
  backSpecial: move("deathblow-aftershock-grab", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.THROW,
    startupFrames: 8, activeFrames: 4, recoveryFrames: 28, range: 91, damage: 20, push: 245, meter: 18,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true,
    moveName: "AFTERSHOCK GRAB", command: "↓ ← + SPECIAL", animation: anim(1),
    hitboxes: [box(18, -181, 84, 151, 0, 3)],
  }),
  launcher: move("deathblow-quarry-breaker", "heavy", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 11, activeFrames: 8, recoveryFrames: 24, range: 132, damage: 12, push: 78, meter: 17,
    hitstunFrames: 27, blockstunFrames: 15, chipDamage: 0, knockdown: true, launchVelocityY: -560,
    juggleStarter: true, moveName: "QUARRY BREAKER", command: "→ ↓ → + HEAVY", animation: anim(2),
    hitboxes: [box(20, -216, 104, 169, 0, 3), box(34, -253, 118, 205, 4, 7)],
  }),
  enhanced: move("deathblow-ex-tremor-tap", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 10, activeFrames: 18, recoveryFrames: 15, range: 193, damage: 11, push: 105, meter: 9,
    hitstunFrames: 25, blockstunFrames: 20, chipDamage: 3, knockdown: true, knockdownOnFinal: true,
    maxHits: 2, rehitFrames: 8, gritCost: GRIT_RULES.enhancedSpecialCost, armorFrames: 13,
    moveName: "TREMOR TAP EX", command: "HEAVY + SPECIAL", animation: anim(0),
    hitboxes: [box(28, -202, 169, 155, 0, 8), box(48, -188, 191, 145, 9, 17)],
  }),
  enhancedCommandSpecial: move("deathblow-ex-faultline-fist", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 11, activeFrames: 20, recoveryFrames: 15, range: 238, damage: 12, push: 124, meter: 10,
    hitstunFrames: 27, blockstunFrames: 21, chipDamage: 4, knockdown: true, knockdownOnFinal: true,
    maxHits: 2, rehitFrames: 9, gritCost: GRIT_RULES.enhancedSpecialCost, armorFrames: 15, advanceSpeed: 330,
    moveName: "FAULTLINE FIST EX", command: "↓ → + HEAVY + SPECIAL", animation: anim(0),
    hitboxes: [box(29, -205, 184, 158, 0, 9), box(54, -188, 210, 145, 10, 19)],
  }),
  enhancedBackSpecial: move("deathblow-ex-aftershock-grab", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.THROW,
    startupFrames: 5, activeFrames: 6, recoveryFrames: 24, range: 113, damage: 25, push: 285, meter: 12,
    hitstunFrames: 0, blockstunFrames: 0, chipDamage: 0, knockdown: true,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 5,
    moveName: "AFTERSHOCK GRAB EX", command: "↓ ← + HEAVY + SPECIAL", animation: anim(1),
    hitboxes: [box(15, -186, 108, 156, 0, 5)],
  }),
  enhancedLauncher: move("deathblow-ex-quarry-breaker", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 8, activeFrames: 13, recoveryFrames: 21, range: 151, damage: 9, push: 78, meter: 10,
    hitstunFrames: 27, blockstunFrames: 17, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    launchVelocityY: -610, juggleStarter: true, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 10,
    moveName: "QUARRY BREAKER EX", command: "→ ↓ → + HEAVY + SPECIAL", animation: anim(2),
    hitboxes: [box(17, -221, 116, 178, 0, 5), box(33, -265, 135, 219, 6, 12)],
  }),
  super: move("deathblow-epicenter-execution", "special", {
    cancelProfileId: "grit-super", level: ATTACK_LEVELS.MID,
    startupFrames: 9, activeFrames: 36, recoveryFrames: 27, range: 251, damage: 10, push: 62, meter: 0,
    hitstunFrames: 29, blockstunFrames: 23, chipDamage: 3, knockdown: true, knockdownOnFinal: true,
    juggleLift: -230, maxHits: 4, rehitFrames: 8, gritCost: GRIT_RULES.superCost,
    superMove: true, armorFrames: 9, moveName: "EPICENTER EXECUTION", command: "FULL GRIT + FB", animation: anim(3),
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
    command: "← → + HEAVY", hitboxes: [box(37, -186, 161, 112, 0, 3), box(57, -173, 184, 107, 4, 7)],
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
    moveName: "SIGNLINE LANCE", command: "↓ → + SPECIAL", animation: anim(0),
    hitboxes: [box(41, -199, 224, 138, 0, 5), box(62, -188, 258, 128, 6, 11)],
  }),
  backSpecial: move("jez-vinyl-step", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 12, recoveryFrames: 12, range: 185, damage: 12, push: 165, meter: 18,
    hitstunFrames: 23, blockstunFrames: 15, chipDamage: 2, advanceSpeed: 610, ignorePushbox: true,
    moveName: "VINYL STEP", command: "↓ ← + SPECIAL", animation: anim(1),
    hitboxes: [box(28, -184, 151, 128, 0, 5), box(52, -174, 184, 122, 6, 11)],
  }),
  launcher: move("jez-signpost-rising", "heavy", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 8, recoveryFrames: 19, range: 138, damage: 9, push: 70, meter: 16,
    hitstunFrames: 25, blockstunFrames: 13, chipDamage: 0, knockdown: true, launchVelocityY: -545,
    juggleStarter: true, reversalInvulnerableFrames: 6,
    moveName: "SIGNPOST RISING", command: "→ ↓ → + HEAVY", animation: anim(2),
    hitboxes: [box(22, -218, 108, 170, 0, 3), box(38, -252, 125, 204, 4, 7)],
  }),
  enhanced: move("jez-ex-neon-edge", "special", {
    cancelProfileId: "ground-special", level: ATTACK_LEVELS.MID,
    startupFrames: 7, activeFrames: 17, recoveryFrames: 11, range: 244, damage: 8, push: 74, meter: 8,
    hitstunFrames: 23, blockstunFrames: 18, chipDamage: 3, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, moveName: "NEON EDGE EX", command: "HEAVY + SPECIAL", animation: anim(0),
    hitboxes: [box(31, -197, 202, 135, 0, 7), box(55, -182, 230, 127, 8, 16)],
  }),
  enhancedCommandSpecial: move("jez-ex-signline-lance", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 9, activeFrames: 19, recoveryFrames: 13, range: 318, damage: 9, push: 92, meter: 9,
    hitstunFrames: 25, blockstunFrames: 20, chipDamage: 4, knockdown: true, knockdownOnFinal: true,
    maxHits: 2, rehitFrames: 8, gritCost: GRIT_RULES.enhancedSpecialCost,
    moveName: "SIGNLINE LANCE EX", command: "↓ → + HEAVY + SPECIAL", animation: anim(0),
    hitboxes: [box(36, -204, 249, 145, 0, 8), box(64, -190, 287, 135, 9, 18)],
  }),
  enhancedBackSpecial: move("jez-ex-vinyl-step", "special", {
    cancelProfileId: "command-special", level: ATTACK_LEVELS.MID,
    startupFrames: 4, activeFrames: 16, recoveryFrames: 10, range: 212, damage: 8, push: 68, meter: 8,
    hitstunFrames: 23, blockstunFrames: 17, chipDamage: 3, maxHits: 2, rehitFrames: 7,
    advanceSpeed: 720, ignorePushbox: true, reversalInvulnerableFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, moveName: "VINYL STEP EX", command: "↓ ← + HEAVY + SPECIAL", animation: anim(1),
    hitboxes: [box(26, -192, 177, 137, 0, 7), box(54, -178, 214, 128, 8, 15)],
  }),
  enhancedLauncher: move("jez-ex-signpost-rising", "special", {
    cancelProfileId: "rising-launcher", level: ATTACK_LEVELS.MID,
    startupFrames: 5, activeFrames: 14, recoveryFrames: 17, range: 158, damage: 7, push: 62, meter: 8,
    hitstunFrames: 26, blockstunFrames: 16, chipDamage: 2, knockdown: true, knockdownOnFinal: true,
    launchVelocityY: -585, juggleStarter: true, maxHits: 2, rehitFrames: 7,
    gritCost: GRIT_RULES.enhancedSpecialCost, reversalInvulnerableFrames: 12,
    moveName: "SIGNPOST RISING EX", command: "→ ↓ → + HEAVY + SPECIAL", animation: anim(2),
    hitboxes: [box(18, -224, 121, 181, 0, 6), box(37, -268, 141, 223, 7, 13)],
  }),
  super: move("jez-seven-palm-neon-guillotine", "special", {
    cancelProfileId: "grit-super", level: ATTACK_LEVELS.MID,
    startupFrames: 6, activeFrames: 43, recoveryFrames: 21, range: 278, damage: 5.5, push: 44, meter: 0,
    hitstunFrames: 25, blockstunFrames: 20, chipDamage: 1.5, knockdown: true, knockdownOnFinal: true,
    juggleLift: -195, maxHits: 7, rehitFrames: 6, gritCost: GRIT_RULES.superCost,
    juggleLimit: 8,
    superMove: true, reversalInvulnerableFrames: 8,
    moveName: "SEVEN-PALM NEON GUILLOTINE", command: "FULL GRIT + FB", animation: anim(3),
    hitboxes: [box(25, -212, 192, 169, 0, 10), box(44, -202, 226, 159, 11, 21), box(29, -231, 244, 191, 22, 32), box(52, -213, 272, 177, 33, 42)],
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
      ["Hammer Jab / Body Check", "LIGHT / → + LIGHT"],
      ["Demolition Drop", "→ + HEAVY · overhead"],
      ["Tremor Tap", "SPECIAL"],
      ["Faultline Fist", "↓ → + SPECIAL"],
      ["Aftershock Grab", "↓ ← + SPECIAL · unblockable"],
      ["Quarry Breaker", "→ ↓ → + HEAVY · anti-air"],
      ["Enhanced specials", "Repeat motion + HEAVY + SPECIAL · 25 Grit"],
      ["Concrete Pour", "LIGHT + HEAVY"],
      ["Epicenter Execution", "FULL GRIT + FB"],
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
      ["Neon Jab / Letter Opener", "LIGHT / → + LIGHT"],
      ["Marquee Axe", "→ + HEAVY · overhead"],
      ["Neon Edge", "SPECIAL"],
      ["Signline Lance", "↓ → + SPECIAL"],
      ["Vinyl Step", "↓ ← + SPECIAL · cross-through"],
      ["Signpost Rising", "→ ↓ → + HEAVY · anti-air"],
      ["Enhanced specials", "Repeat motion + HEAVY + SPECIAL · 25 Grit"],
      ["Signpost Trip", "LIGHT + HEAVY"],
      ["Seven-Palm Neon Guillotine", "FULL GRIT + FB"],
    ],
    moves: { ...shared, ...jezMoves },
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
  if (action === "light") {
    if (context.airborne) return "airLight";
    if (context.crouching) return "crouchLight";
    if (context.forwardHeld) return "forwardLight";
    return "standLight";
  }
  if (action === "heavy") {
    if (context.airborne) return "airHeavy";
    if (context.crouching) return "crouchHeavy";
    if (context.forwardHeld) return "overhead";
    return "standHeavy";
  }
  if (action === "special" && context.airborne) return "airSpecial";
  return action;
}

export function getKitMoveProfile(fighterId, action, context = {}) {
  const kit = getFighterKit(fighterId);
  if (!kit) return null;
  return kit.moves[selectKitMoveKey(action, context)] || null;
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

export function getFighterMovement(fighterId, fallback) {
  return { ...fallback, ...(getFighterKit(fighterId)?.movement || {}) };
}

export function recognizeFighterCommand(fighterId, history, currentFrame) {
  if (!getFighterKit(fighterId)) return null;
  const candidates = [
    { action: "enhancedLauncher", sequence: ["forward", "down", "forward", "enhanced"], terminal: "enhanced" },
    { action: "enhancedBackSpecial", sequence: ["down", "back", "enhanced"], terminal: "enhanced" },
    { action: "enhancedCommandSpecial", sequence: ["down", "forward", "enhanced"], terminal: "enhanced" },
    { action: "launcher", sequence: ["forward", "down", "forward", "heavy"], terminal: "heavy" },
    { action: "driveHeavy", sequence: ["back", "forward", "heavy"], terminal: "heavy" },
    { action: "backSpecial", sequence: ["down", "back", "special"], terminal: "special" },
    { action: "commandSpecial", sequence: ["down", "forward", "special"], terminal: "special" },
  ];
  for (const candidate of candidates) {
    const match = matchCommandSequence(history, candidate.sequence, currentFrame);
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
  meter = 0,
  roll = 0.5,
} = {}) {
  const ai = getFighterKit(fighterId)?.ai;
  if (!ai) return null;
  if (opponentAirborne && distance < 180) return { movement: "hold", action: ai.antiAirAction };
  if (meter >= GRIT_RULES.superCost && roll < 0.22 && distance < 245) return { movement: "hold", action: "super" };
  if (distance < ai.retreatRange) {
    const action = roll < 0.42 ? ai.closeAction : roll < 0.72 ? "light" : "throw";
    return { movement: fighterId === "jez" ? "retreat" : "hold", action };
  }
  if (distance > ai.approachRange) {
    return { movement: "advance", action: roll < 0.34 ? ai.rangedAction : null };
  }
  if (distance > ai.preferredRange + 28) return { movement: "advance", action: roll < 0.48 ? ai.pokeAction : null };
  if (distance < ai.preferredRange - 24) return { movement: fighterId === "jez" ? "retreat" : "hold", action: roll < 0.52 ? ai.closeAction : "heavy" };
  return { movement: "hold", action: roll < 0.36 ? ai.pokeAction : roll < 0.62 ? "light" : roll < 0.8 ? "heavy" : null };
}

export function listFighterMoves(fighterId) {
  return getFighterKit(fighterId)?.moveList.map(([name, command]) => ({ name, command })) || [];
}
