import { createAttackInstance } from "./foundation.mjs";

export const ATTACK_LEVELS = Object.freeze({
  MID: "mid",
  LOW: "low",
  OVERHEAD: "overhead",
  AIR: "air",
  THROW: "throw",
});

export const MOVEMENT_RULES = Object.freeze({
  stageMinX: 76,
  stageMaxX: 1204,
  forwardWalkSpeed: 292,
  backWalkSpeed: 224,
  neutralJumpVelocityX: 0,
  forwardJumpVelocityX: 326,
  backJumpVelocityX: 278,
  jumpVelocityY: -748,
  forwardDashSpeed: 580,
  forwardDashFrames: 11,
  backDashSpeed: 505,
  backDashFrames: 14,
  backDashInvulnerableFrames: 6,
  dashTapWindowFrames: 12,
  dashCooldownFrames: 9,
  standingPushboxHalfWidth: 39,
  crouchingPushboxHalfWidth: 35,
});

export const DEFENSE_RULES = Object.freeze({
  throwTechWindowFrames: 7,
  throwInvulnerableFrames: 30,
  knockdownFrames: 46,
  wakeupFrames: 18,
  wakeupInvulnerableFrames: 12,
  reversalWindowFrames: 5,
  counterDamageMultiplier: 1.2,
  counterHitstunBonusFrames: 5,
});

const moveProfiles = {
  standLight: {
    id: "stand-light",
    baseKind: "light",
    level: ATTACK_LEVELS.MID,
    hitstunFrames: 22,
    blockstunFrames: 9,
    chipDamage: 0,
    hitboxes: [
      { from: 0, to: 2, box: { x: 24, y: -157, width: 82, height: 60 } },
      { from: 3, to: 5, box: { x: 34, y: -151, width: 94, height: 58 } },
    ],
  },
  crouchLight: {
    id: "crouch-light",
    baseKind: "light",
    level: ATTACK_LEVELS.LOW,
    startupFrames: 5,
    activeFrames: 5,
    recoveryFrames: 9,
    range: 112,
    damage: 5,
    hitstunFrames: 20,
    blockstunFrames: 9,
    chipDamage: 0,
    hitboxes: [
      { from: 0, to: 1, box: { x: 22, y: -73, width: 88, height: 45 } },
      { from: 2, to: 4, box: { x: 34, y: -66, width: 96, height: 38 } },
    ],
  },
  standHeavy: {
    id: "stand-heavy",
    baseKind: "heavy",
    level: ATTACK_LEVELS.MID,
    hitstunFrames: 20,
    blockstunFrames: 13,
    chipDamage: 0,
    hitboxes: [
      { from: 0, to: 2, box: { x: 32, y: -178, width: 98, height: 84 } },
      { from: 3, to: 7, box: { x: 45, y: -167, width: 118, height: 90 } },
    ],
  },
  crouchHeavy: {
    id: "crouch-heavy",
    baseKind: "heavy",
    level: ATTACK_LEVELS.LOW,
    startupFrames: 11,
    activeFrames: 7,
    recoveryFrames: 18,
    range: 154,
    damage: 11,
    push: 235,
    hitstunFrames: 21,
    blockstunFrames: 14,
    chipDamage: 0,
    knockdown: true,
    hitboxes: [
      { from: 0, to: 2, box: { x: 31, y: -62, width: 105, height: 40 } },
      { from: 3, to: 6, box: { x: 45, y: -55, width: 126, height: 35 } },
    ],
  },
  overhead: {
    id: "overhead",
    baseKind: "heavy",
    level: ATTACK_LEVELS.OVERHEAD,
    startupFrames: 18,
    activeFrames: 6,
    recoveryFrames: 18,
    range: 145,
    damage: 14,
    push: 285,
    hitstunFrames: 23,
    blockstunFrames: 15,
    chipDamage: 0,
    hitboxes: [
      { from: 0, to: 1, box: { x: 24, y: -215, width: 96, height: 96 } },
      { from: 2, to: 5, box: { x: 44, y: -201, width: 118, height: 126 } },
    ],
  },
  special: {
    id: "ground-special",
    baseKind: "special",
    level: ATTACK_LEVELS.MID,
    hitstunFrames: 26,
    blockstunFrames: 18,
    chipDamage: 3,
    knockdown: true,
    hitboxes: [
      { from: 0, to: 4, box: { x: 28, y: -190, width: 142, height: 145 } },
      { from: 5, to: 13, box: { x: 42, y: -178, width: 166, height: 132 } },
    ],
  },
  airLight: {
    id: "air-light",
    baseKind: "light",
    level: ATTACK_LEVELS.AIR,
    startupFrames: 5,
    activeFrames: 8,
    recoveryFrames: 7,
    range: 110,
    damage: 7,
    hitstunFrames: 16,
    blockstunFrames: 10,
    chipDamage: 0,
    hitboxes: [
      { from: 0, to: 3, box: { x: 24, y: -157, width: 96, height: 82 } },
      { from: 4, to: 7, box: { x: 38, y: -141, width: 107, height: 78 } },
    ],
  },
  airHeavy: {
    id: "air-heavy",
    baseKind: "heavy",
    level: ATTACK_LEVELS.AIR,
    startupFrames: 9,
    activeFrames: 9,
    recoveryFrames: 10,
    range: 144,
    damage: 13,
    push: 260,
    hitstunFrames: 22,
    blockstunFrames: 14,
    chipDamage: 0,
    knockdown: true,
    hitboxes: [
      { from: 0, to: 3, box: { x: 24, y: -159, width: 116, height: 97 } },
      { from: 4, to: 8, box: { x: 42, y: -141, width: 130, height: 91 } },
    ],
  },
  airSpecial: {
    id: "air-special",
    baseKind: "special",
    level: ATTACK_LEVELS.AIR,
    startupFrames: 13,
    activeFrames: 12,
    recoveryFrames: 16,
    range: 172,
    damage: 16,
    push: 330,
    hitstunFrames: 25,
    blockstunFrames: 17,
    chipDamage: 3,
    knockdown: true,
    hitboxes: [
      { from: 0, to: 5, box: { x: 27, y: -181, width: 145, height: 124 } },
      { from: 6, to: 11, box: { x: 42, y: -163, width: 162, height: 116 } },
    ],
  },
  throw: {
    id: "throw",
    baseKind: "throw",
    level: ATTACK_LEVELS.THROW,
    hitstunFrames: 0,
    blockstunFrames: 0,
    chipDamage: 0,
    knockdown: true,
    hitboxes: [
      { from: 0, to: 1, box: { x: 22, y: -172, width: 66, height: 142 } },
    ],
  },
};

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

export const COMBAT_MOVE_PROFILES = deepFreeze(moveProfiles);

export function selectMoveProfile(kind, context = {}) {
  if (kind === "throw") return COMBAT_MOVE_PROFILES.throw;
  if (context.airborne) {
    return COMBAT_MOVE_PROFILES[kind === "special" ? "airSpecial" : kind === "heavy" ? "airHeavy" : "airLight"];
  }
  if (kind === "light" && context.crouching) return COMBAT_MOVE_PROFILES.crouchLight;
  if (kind === "heavy" && context.crouching) return COMBAT_MOVE_PROFILES.crouchHeavy;
  if (kind === "heavy" && context.forwardHeld) return COMBAT_MOVE_PROFILES.overhead;
  if (kind === "special") return COMBAT_MOVE_PROFILES.special;
  return COMBAT_MOVE_PROFILES[kind === "heavy" ? "standHeavy" : "standLight"];
}

export function createCombatMove(kind, context = {}) {
  const profile = selectMoveProfile(kind, context);
  return createAttackInstance(profile.baseKind, {
    ...profile,
    kind,
    profileId: profile.id,
  });
}

export class DirectionTapTracker {
  constructor(windowFrames = MOVEMENT_RULES.dashTapWindowFrames) {
    this.windowFrames = windowFrames;
    this.lastPressFrame = { left: -Infinity, right: -Infinity };
  }

  press(direction, frame) {
    if (!(direction in this.lastPressFrame)) throw new Error(`Unknown direction: ${direction}`);
    const previous = this.lastPressFrame[direction];
    this.lastPressFrame[direction] = frame;
    return frame > previous && frame - previous <= this.windowFrames;
  }

  snapshot() {
    return { ...this.lastPressFrame };
  }

  restore(snapshot = {}) {
    this.lastPressFrame.left = Number.isFinite(snapshot.left) ? snapshot.left : -Infinity;
    this.lastPressFrame.right = Number.isFinite(snapshot.right) ? snapshot.right : -Infinity;
  }
}

export function localBoxToWorld(fighter, box) {
  const x = fighter.facing >= 0
    ? fighter.x + box.x
    : fighter.x - box.x - box.width;
  return { x, y: fighter.y + box.y, width: box.width, height: box.height };
}

export function boxesOverlap(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function getActiveHitboxes(fighter) {
  const attack = fighter.attacking;
  if (!attack || fighter.attackFrame < attack.activeStartFrame || fighter.attackFrame >= attack.activeEndFrame) return [];
  const activeFrame = fighter.attackFrame - attack.activeStartFrame;
  return (attack.hitboxes || [])
    .filter((entry) => activeFrame >= entry.from && activeFrame <= entry.to)
    .map((entry) => localBoxToWorld(fighter, entry.box));
}

export function getHurtboxes(fighter) {
  if (fighter.invulnerableFrames > 0 || fighter.down || fighter.knockdownFrames > 0 || fighter.wakeupFrames > 0) return [];
  let boxes;
  if (!fighter.grounded) {
    boxes = [
      { x: -34, y: -181, width: 68, height: 72 },
      { x: -42, y: -111, width: 84, height: 91 },
    ];
  } else if (fighter.crouch || fighter.guardHeight === "low") {
    boxes = [
      { x: -39, y: -126, width: 78, height: 60 },
      { x: -47, y: -68, width: 94, height: 68 },
    ];
  } else {
    boxes = [
      { x: -31, y: -199, width: 62, height: 61 },
      { x: -43, y: -142, width: 86, height: 91 },
      { x: -39, y: -55, width: 78, height: 55 },
    ];
  }
  if (fighter.attacking) {
    const phase = fighter.attackFrame < fighter.attacking.activeStartFrame ? "startup"
      : fighter.attackFrame < fighter.attacking.activeEndFrame ? "active" : "recovery";
    if (phase === "startup") boxes.push({ x: 18, y: -169, width: 46, height: 63 });
    if (phase === "active") boxes.push({ x: 24, y: -158, width: 58, height: 72 });
    if (phase === "recovery") boxes[1] = { ...boxes[1], width: boxes[1].width + 10 };
  }
  return boxes.map((box) => localBoxToWorld(fighter, box));
}

export function findBoxCollision(attacker, defender) {
  const hitboxes = getActiveHitboxes(attacker);
  const hurtboxes = getHurtboxes(defender);
  for (const hitbox of hitboxes) {
    for (const hurtbox of hurtboxes) {
      if (!boxesOverlap(hitbox, hurtbox)) continue;
      const left = Math.max(hitbox.x, hurtbox.x);
      const right = Math.min(hitbox.x + hitbox.width, hurtbox.x + hurtbox.width);
      const top = Math.max(hitbox.y, hurtbox.y);
      const bottom = Math.min(hitbox.y + hitbox.height, hurtbox.y + hurtbox.height);
      return { hitbox, hurtbox, point: { x: (left + right) * 0.5, y: (top + bottom) * 0.5 } };
    }
  }
  return null;
}

export function canGuardAttack({ level, guardHeight, guarding, grounded = true }) {
  if (!guarding || !grounded || level === ATTACK_LEVELS.THROW) return false;
  if (level === ATTACK_LEVELS.LOW) return guardHeight === "low";
  if (level === ATTACK_LEVELS.OVERHEAD || level === ATTACK_LEVELS.AIR) return guardHeight === "high";
  return guardHeight === "high" || guardHeight === "low";
}

export function isCounterHit(defender) {
  if (!defender.attacking) return defender.dashFrames > 0;
  return defender.attackFrame < defender.attacking.activeStartFrame
    || defender.attackFrame >= defender.attacking.activeEndFrame;
}

export function resolvePushboxPositions(a, b, minX = MOVEMENT_RULES.stageMinX, maxX = MOVEMENT_RULES.stageMaxX) {
  const requiredGap = a.halfWidth + b.halfWidth;
  const distance = Math.abs(a.x - b.x);
  if (distance >= requiredGap) return { aX: a.x, bX: b.x, overlap: 0 };
  const overlap = requiredGap - distance;
  const aIsLeft = a.x === b.x ? a.side < b.side : a.x < b.x;
  let left = aIsLeft ? a.x : b.x;
  let right = aIsLeft ? b.x : a.x;
  left = Math.max(minX, left - overlap * 0.5);
  right = Math.min(maxX, right + overlap * 0.5);
  const remaining = requiredGap - (right - left);
  if (remaining > 0) {
    if (left <= minX + 1e-6) right = Math.min(maxX, right + remaining);
    else if (right >= maxX - 1e-6) left = Math.max(minX, left - remaining);
  }
  return aIsLeft
    ? { aX: left, bX: right, overlap }
    : { aX: right, bX: left, overlap };
}
