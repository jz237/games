import { createAttackInstance } from "./foundation.mjs";
import { ATTACK_LEVELS } from "./defense.mjs";

export const GRIT_RULES = Object.freeze({
  maximum: 100,
  enhancedSpecialCost: 25,
  guardReversalCost: 30,
  superCost: 100,
  hitGainMultiplier: 1,
  damageTakenGainMultiplier: 0.45,
});

export const COMBO_RULES = Object.freeze({
  resetGapFrames: 45,
  displayFrames: 72,
  juggleLimit: 4,
  hitScales: Object.freeze([1, 0.9, 0.8, 0.72, 0.64, 0.57, 0.5, 0.44, 0.4, 0.36]),
  minimumScale: 0.35,
  juggleScaleStep: 0.08,
  minimumJuggleScale: 0.68,
});

const advancedProfiles = {
  commandSpecial: {
    id: "command-special",
    baseKind: "special",
    kind: "special",
    level: ATTACK_LEVELS.MID,
    startupFrames: 14,
    activeFrames: 14,
    recoveryFrames: 16,
    range: 198,
    damage: 18,
    push: 345,
    meter: 24,
    hitstunFrames: 27,
    blockstunFrames: 18,
    chipDamage: 3,
    knockdown: true,
    command: "↓ → + SPECIAL",
    hitboxes: [
      { from: 0, to: 5, box: { x: 31, y: -194, width: 154, height: 148 } },
      { from: 6, to: 13, box: { x: 48, y: -180, width: 174, height: 134 } },
    ],
  },
  launcher: {
    id: "rising-launcher",
    baseKind: "heavy",
    kind: "heavy",
    level: ATTACK_LEVELS.MID,
    startupFrames: 10,
    activeFrames: 7,
    recoveryFrames: 21,
    range: 124,
    damage: 10,
    push: 72,
    meter: 16,
    hitstunFrames: 25,
    blockstunFrames: 14,
    chipDamage: 0,
    knockdown: true,
    launchVelocityY: -535,
    juggleStarter: true,
    command: "→ ↓ → + HEAVY",
    hitboxes: [
      { from: 0, to: 2, box: { x: 22, y: -210, width: 94, height: 160 } },
      { from: 3, to: 6, box: { x: 33, y: -244, width: 108, height: 194 } },
    ],
  },
  driveHeavy: {
    id: "drive-heavy",
    baseKind: "heavy",
    kind: "heavy",
    level: ATTACK_LEVELS.MID,
    startupFrames: 15,
    activeFrames: 8,
    recoveryFrames: 17,
    range: 178,
    damage: 15,
    push: 310,
    meter: 19,
    hitstunFrames: 24,
    blockstunFrames: 16,
    chipDamage: 0,
    advanceSpeed: 235,
    command: "← → + HEAVY",
    hitboxes: [
      { from: 0, to: 3, box: { x: 34, y: -181, width: 132, height: 116 } },
      { from: 4, to: 7, box: { x: 52, y: -171, width: 151, height: 108 } },
    ],
  },
  enhanced: {
    id: "enhanced-special",
    baseKind: "special",
    kind: "special",
    level: ATTACK_LEVELS.MID,
    startupFrames: 12,
    activeFrames: 18,
    recoveryFrames: 14,
    range: 212,
    damage: 11,
    push: 96,
    meter: 8,
    hitstunFrames: 24,
    blockstunFrames: 19,
    chipDamage: 3,
    knockdown: true,
    knockdownOnFinal: true,
    juggleLift: -245,
    maxHits: 2,
    rehitFrames: 8,
    gritCost: GRIT_RULES.enhancedSpecialCost,
    hitboxes: [
      { from: 0, to: 7, box: { x: 30, y: -198, width: 164, height: 151 } },
      { from: 8, to: 17, box: { x: 48, y: -186, width: 188, height: 141 } },
    ],
  },
  guardReversal: {
    id: "guard-reversal",
    baseKind: "special",
    kind: "special",
    level: ATTACK_LEVELS.MID,
    startupFrames: 7,
    activeFrames: 8,
    recoveryFrames: 23,
    range: 165,
    damage: 10,
    push: 390,
    meter: 0,
    hitstunFrames: 22,
    blockstunFrames: 17,
    chipDamage: 2,
    knockdown: true,
    reversalInvulnerableFrames: 11,
    gritCost: GRIT_RULES.guardReversalCost,
    hitboxes: [
      { from: 0, to: 3, box: { x: 18, y: -215, width: 146, height: 176 } },
      { from: 4, to: 7, box: { x: 37, y: -196, width: 168, height: 156 } },
    ],
  },
  super: {
    id: "grit-super",
    baseKind: "special",
    kind: "special",
    level: ATTACK_LEVELS.MID,
    startupFrames: 8,
    activeFrames: 32,
    recoveryFrames: 25,
    range: 236,
    damage: 8,
    push: 54,
    meter: 0,
    hitstunFrames: 27,
    blockstunFrames: 21,
    chipDamage: 2,
    knockdown: true,
    knockdownOnFinal: true,
    juggleLift: -205,
    maxHits: 4,
    rehitFrames: 7,
    gritCost: GRIT_RULES.superCost,
    superMove: true,
    hitboxes: [
      { from: 0, to: 7, box: { x: 23, y: -210, width: 174, height: 171 } },
      { from: 8, to: 15, box: { x: 42, y: -199, width: 194, height: 161 } },
      { from: 16, to: 23, box: { x: 24, y: -226, width: 206, height: 187 } },
      { from: 24, to: 31, box: { x: 49, y: -205, width: 218, height: 172 } },
    ],
  },
};

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

export const ADVANCED_MOVE_PROFILES = deepFreeze(advancedProfiles);

export function createAdvancedMove(action) {
  const profile = ADVANCED_MOVE_PROFILES[action];
  if (!profile) throw new Error(`Unknown advanced move: ${action}`);
  return createAttackInstance(profile.baseKind, {
    ...profile,
    kind: profile.kind,
    profileId: profile.id,
  });
}

export function gritCostForAction(action) {
  return ADVANCED_MOVE_PROFILES[action]?.gritCost || 0;
}

export function damageScaleForHit(hitNumber, juggleCount = 0) {
  const base = COMBO_RULES.hitScales[Math.max(0, hitNumber - 1)] ?? COMBO_RULES.minimumScale;
  const juggle = Math.max(COMBO_RULES.minimumJuggleScale, 1 - Math.max(0, juggleCount) * COMBO_RULES.juggleScaleStep);
  return Math.max(COMBO_RULES.minimumScale, base * juggle);
}

export class ComboTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.hits = 0;
    this.totalDamage = 0;
    this.active = false;
    this.startedFrame = -Infinity;
    this.lastHitFrame = -Infinity;
    this.displayUntilFrame = -Infinity;
    this.peakHits = this.peakHits || 0;
  }

  registerHit(frame, juggleCount = 0) {
    if (!this.active || frame - this.lastHitFrame > COMBO_RULES.resetGapFrames) {
      const peak = this.peakHits;
      this.reset();
      this.peakHits = peak;
    }
    if (this.hits === 0) this.startedFrame = frame;
    this.active = true;
    this.hits += 1;
    this.peakHits = Math.max(this.peakHits, this.hits);
    this.lastHitFrame = frame;
    this.displayUntilFrame = frame + COMBO_RULES.displayFrames;
    return {
      hitNumber: this.hits,
      damageScale: damageScaleForHit(this.hits, juggleCount),
    };
  }

  addDamage(amount) {
    this.totalDamage += amount;
  }

  tick(frame, defenderInCombo = false) {
    if (this.hits === 0) return;
    if (this.active && !defenderInCombo && frame > this.lastHitFrame + 1) this.active = false;
    if (this.active && frame - this.lastHitFrame > COMBO_RULES.resetGapFrames) this.active = false;
  }

  visible(frame) {
    return this.hits >= 2 && frame <= this.displayUntilFrame;
  }

  snapshot(frame = Infinity) {
    return {
      hits: this.hits,
      damage: Number(this.totalDamage.toFixed(2)),
      startedFrame: this.startedFrame,
      lastHitFrame: this.lastHitFrame,
      visible: this.visible(frame),
      active: this.active,
      peakHits: this.peakHits,
    };
  }
}

export function matchCommandSequence(history, sequence, currentFrame, {
  maxWindowFrames = 32,
  maxGapFrames = 14,
  terminalWindowFrames = 2,
} = {}) {
  let cursor = history.length - 1;
  let nextFrame = currentFrame;
  let startIndex = -1;
  let endIndex = -1;
  for (let sequenceIndex = sequence.length - 1; sequenceIndex >= 0; sequenceIndex -= 1) {
    let found = -1;
    while (cursor >= 0) {
      const entry = history[cursor];
      if (entry.token === sequence[sequenceIndex]
        && entry.frame <= nextFrame
        && nextFrame - entry.frame <= maxGapFrames) {
        found = cursor;
        break;
      }
      cursor -= 1;
    }
    if (found < 0) return null;
    if (sequenceIndex === sequence.length - 1 && currentFrame - history[found].frame > terminalWindowFrames) return null;
    if (endIndex < 0) endIndex = found;
    startIndex = found;
    nextFrame = history[found].frame;
    cursor = found - 1;
  }
  if (currentFrame - history[startIndex].frame > maxWindowFrames) return null;
  return { startIndex, endIndex, startFrame: history[startIndex].frame, endFrame: history[endIndex].frame };
}

export function recognizeCombatCommand(history, currentFrame) {
  const candidates = [
    { action: "launcher", sequence: ["forward", "down", "forward", "heavy"] },
    { action: "driveHeavy", sequence: ["back", "forward", "heavy"] },
    { action: "commandSpecial", sequence: ["down", "forward", "special"] },
  ];
  for (const candidate of candidates) {
    const match = matchCommandSequence(history, candidate.sequence, currentFrame);
    if (match) return { ...candidate, ...match };
  }
  return null;
}

const cancelRoutes = {
  "stand-light": ["light", "heavy", "launcher", "driveHeavy", "special", "commandSpecial", "enhanced", "super"],
  "crouch-light": ["light", "heavy", "launcher", "special", "commandSpecial", "enhanced", "super"],
  "stand-heavy": ["special", "commandSpecial", "enhanced", "super"],
  "crouch-heavy": ["special", "commandSpecial", "enhanced", "super"],
  overhead: ["special", "commandSpecial", "enhanced", "super"],
  "drive-heavy": ["special", "commandSpecial", "enhanced", "super"],
  "rising-launcher": ["super"],
  "command-special": ["super"],
};

export const CANCEL_ROUTES = deepFreeze(cancelRoutes);

export function canCancelAttack(attack, nextAction, attackFrame, connected = "") {
  const routeId = attack?.cancelProfileId || attack?.profileId;
  const allowedRoutes = attack?.cancelRoutes || CANCEL_ROUTES[routeId];
  if (!attack || !connected || !allowedRoutes?.includes(nextAction)) return false;
  const chainAction = ["light", "heavy", "launcher", "driveHeavy"].includes(nextAction);
  const earliest = chainAction ? attack.activeStartFrame : Math.max(attack.activeStartFrame, attack.activeEndFrame - 2);
  const latest = attack.activeEndFrame + (attack.kind === "light" ? 7 : 5);
  if (attackFrame < earliest || attackFrame > latest) return false;
  if (nextAction === "super" && connected !== "hit") return false;
  return true;
}
