import { BASE_MOVES, createAttackInstance } from "./foundation.mjs";

export const ATTACK_LEVELS = Object.freeze({
  MID: "mid",
  LOW: "low",
  OVERHEAD: "overhead",
  AIR: "air",
  THROW: "throw",
});

/**
 * MK/SF2 framing. Every spatial quantity that belongs to a fighter — body size,
 * hitboxes, hurtboxes, pushboxes, move reach, walk and jump speeds, launch
 * velocities and gravity — is multiplied by this one factor, while the stage
 * bounds stay put. The fighters therefore grow to roughly 71% of the playable
 * fight-area height and the arena reads as narrower in body-widths, exactly like
 * a classic 2D fighter, without changing a single spacing relationship between
 * reach, walk speed and body size.
 *
 * Measured: the 320px atlas cell is 95.6% character, the playable area between
 * the HUD (canvas y 79) and the floor (y 600) is 521px, and the pre-scale average
 * standing fighter was 62.4% of it. 1.14 lands the roster at 68.1%-74.0%.
 */
export const FIGHTER_SCALE = 1.14;

const spatial = (value) => Math.round(value * FIGHTER_SCALE);

// Arcade tempo. Walks and jumps are quicker than 1.0 so neutral has real
// momentum, but jump height is unchanged so anti-airs still line up, and dashes
// cost more to repeat so they support footsies instead of replacing them.
export const MOVEMENT_RULES = Object.freeze({
  // Stage bounds are deliberately NOT scaled: that is what makes the arena read
  // as narrower relative to the larger fighters.
  stageMinX: 76,
  stageMaxX: 1204,
  forwardWalkSpeed: spatial(336),
  backWalkSpeed: spatial(262),
  neutralJumpVelocityX: 0,
  forwardJumpVelocityX: spatial(352),
  backJumpVelocityX: spatial(300),
  jumpVelocityY: -spatial(815),
  forwardDashSpeed: spatial(620),
  forwardDashFrames: 10,
  backDashSpeed: spatial(540),
  backDashFrames: 13,
  backDashInvulnerableFrames: 4,
  dashTapWindowFrames: 12,
  dashCooldownFrames: 14,
  standingPushboxHalfWidth: spatial(39),
  crouchingPushboxHalfWidth: spatial(35),
});

export const COLLISION_RULES = Object.freeze({
  // A jump must clear the standing fighter's shoulders before a side switch is
  // legal. Below this height the pushboxes remain solid, preventing low-air
  // body overlap and corner tunnelling while preserving authored cross-ups.
  crossupClearance: spatial(92),
  overlapEpsilon: 0.001,
});

export const DEFENSE_RULES = Object.freeze({
  throwTechWindowFrames: 6,
  // Long post-throw protection is what stops throw loops without a defensive answer.
  throwInvulnerableFrames: 40,
  knockdownFrames: 48,
  wakeupFrames: 16,
  wakeupInvulnerableFrames: 10,
  reversalWindowFrames: 4,
  counterDamageMultiplier: 1.3,
  counterHitstunBonusFrames: 7,
  // Landing recovery makes a whiffed jump-in a real commitment.
  landingRecoveryFrames: 7,
  airAttackLandingRecoveryFrames: 11,
});

/**
 * Dizzy. Repeated clean hits in a short window stun a fighter; the meter bleeds
 * off once they stop getting hit, recovery is deterministic, and a long immunity
 * afterwards means dizzy can never loop. Mashing shortens the dizzy but cannot
 * remove it entirely, so the punish window is always real.
 */
export const STUN_RULES = Object.freeze({
  threshold: 100,
  decayGraceFrames: 48,
  decayPerFrame: 0.62,
  dizzyFrames: 128,
  minimumDizzyFrames: 46,
  mashRelief: 5,
  immuneFrames: 320,
  gain: Object.freeze({ light: 9, heavy: 17, special: 20, throw: 0 }),
  counterBonus: 4,
  levelBonus: Object.freeze({ overhead: 3, low: 2, air: 2 }),
});

export function stunGainForAttack(attack, { counter = false, blocked = false } = {}) {
  if (!attack || blocked || attack.level === ATTACK_LEVELS.THROW) return 0;
  const base = STUN_RULES.gain[attack.kind] ?? STUN_RULES.gain.light;
  const levelBonus = STUN_RULES.levelBonus[attack.level] || 0;
  const scale = attack.maxHits > 1 ? 1 / Math.min(4, attack.maxHits) : 1;
  return Math.max(0, Number(((base + levelBonus + (counter ? STUN_RULES.counterBonus : 0)) * scale).toFixed(3)));
}

/**
 * Release 1.7 DEPTH — guard gauge, mirroring the STUN_RULES pattern exactly:
 * integer gains per BLOCKED hit, a grace window, per-frame decay, a helpless
 * CRUSHED state at full charge and a long immunity after recovery so a crush
 * can never loop. Every value is integer or frame-based and lives on the
 * fighter, so the gauge is fully deterministic under replay and rollback.
 * Blocked chip pressure can never take the last hit point (blocks already
 * floor health at 1), so the crush is the long-game payoff instead.
 */
export const GUARD_RULES = Object.freeze({
  threshold: 100,
  decayGraceFrames: 30,
  decayPerFrame: 0.5,
  crushFrames: 60,
  immuneFrames: 300,
  gain: Object.freeze({ light: 7, heavy: 13, special: 16, throw: 0 }),
});

export function guardGainForAttack(attack, { blocked = false, perfect = false } = {}) {
  // Only blocked strikes pressure the gauge, and a Perfect Guard absorbs the
  // pressure entirely — the just-defend reward against blockstrings.
  if (!attack || !blocked || perfect || attack.level === ATTACK_LEVELS.THROW) return 0;
  const base = GUARD_RULES.gain[attack.kind] ?? GUARD_RULES.gain.light;
  const scale = attack.maxHits > 1 ? 1 / Math.min(4, attack.maxHits) : 1;
  return Math.max(0, Number((base * scale).toFixed(3)));
}

/**
 * Release 1.7 DEPTH — wake-up options. Knockdowns are a fixed 48+16 frames;
 * pressing Up during the knockdown quick-rises (shorter, with a slightly
 * shorter reversal window), holding Down delays the getaway. Both directions
 * already travel in the 16-bit net input, so no protocol change.
 */
export const WAKEUP_RULES = Object.freeze({
  quickRiseFrames: 14,
  delayFrames: 12,
  quickRiseReversalPenaltyFrames: 1,
});

export function resolveWakeOption(input = {}) {
  if (input.jump) return "quick";
  if (input.down) return "delay";
  return null;
}

/**
 * Release 1.7 DEPTH — air recovery (juggle tech). Any attack button pressed
 * after enough airborne hitstun techs out of a juggle — unless the last hit
 * was knockdown-final or a super — into a brief invulnerable back-flip, then
 * the existing air-attack landing recovery as the tax so meaties still work.
 */
export const AIR_RECOVERY_RULES = Object.freeze({
  minimumHitstunFrames: 14,
  invulnerableFrames: 8,
  flipFrames: 12,
  driftVelocityX: 150,
  liftVelocityY: -250,
});

export function canAirRecover(fighter, pressed = false) {
  return Boolean(pressed)
    && !fighter.grounded
    && Boolean(fighter.pendingKnockdown)
    && Boolean(fighter.airTechArmed)
    && (fighter.airHitstunFrames || 0) >= AIR_RECOVERY_RULES.minimumHitstunFrames;
}

/**
 * Release 1.7 DEPTH — Perfect Guard (just-defend). A block whose guard input
 * began within the window frames of impact takes zero chip, sheds blockstun,
 * banks a little Grit and absorbs all guard-gauge pressure. Derived purely
 * from existing inputs and frame counters — rollback-safe, no protocol change.
 */
export const PERFECT_GUARD_RULES = Object.freeze({
  windowFrames: 4,
  blockstunReductionFrames: 4,
  gritBonus: 3,
});

export function isPerfectGuard(guardStartedTick, impactTick) {
  return Number.isFinite(guardStartedTick)
    && impactTick - guardStartedTick >= 0
    && impactTick - guardStartedTick <= PERFECT_GUARD_RULES.windowFrames;
}

/**
 * The DEPTH gameplay fields added to every fighter. All plain data (numbers,
 * booleans, short strings and the -Infinity sentinel the rollback transport
 * already canonicalises), so the fighter snapshot machinery — which clones
 * every enumerable non-reference field — captures and restores each one, and
 * every one of them counts toward the combat checksum.
 */
export function createDepthFighterFields() {
  return {
    // Guard gauge and its deterministic decay / crush / immunity clocks.
    guardMeter: 0,
    guardDecayDelay: 0,
    guardCrushFrames: 0,
    guardCrushTotalFrames: 0,
    guardImmuneFrames: 0,
    // Perfect Guard: the tick this guard input began.
    guardStartedTick: -Infinity,
    // Wake-up option chosen during the current knockdown ("", "quick", "delay").
    wakeOption: "",
    // Air recovery: eligibility + airborne-hitstun clock + flip/tax latches.
    airTechArmed: false,
    airHitstunFrames: 0,
    airTechFlipFrames: 0,
    airTechTaxPending: false,
  };
}

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

/**
 * Kick normals are derived from each fighter's authored punch normals so every
 * character keeps a distinct kick game (range, timing and push all inherit the
 * source move's personality) without hand-authoring a second set of 48 moves.
 * The transforms follow SF2/MK3 proportions: kicks reach further and push harder
 * than the matching punch, but start slower and recover slower.
 */
export const KICK_VARIANTS = deepFreeze({
  standLightKick: {
    source: "standLight", suffix: "lk", moveName: "LIGHT KICK", level: ATTACK_LEVELS.MID,
    range: 1.2, damage: 1, push: 1.12, startup: 1, active: 0, recovery: 2,
    hitstun: 0, blockstun: 1, boxY: 0.9, boxHeight: 1.06,
  },
  standHeavyKick: {
    source: "standHeavy", suffix: "hk", moveName: "ROUNDHOUSE", level: ATTACK_LEVELS.MID,
    range: 1.3, damage: 1.05, push: 1.38, startup: 3, active: 1, recovery: 5,
    hitstun: 1, blockstun: 1, boxY: 0.88, boxHeight: 1.1,
  },
  crouchLightKick: {
    source: "crouchLight", suffix: "lk", moveName: "SHORT KICK", level: ATTACK_LEVELS.LOW,
    range: 1.15, damage: 0.95, push: 1.05, startup: 0, active: 0, recovery: 1,
    hitstun: 0, blockstun: 0, boxY: 1, boxHeight: 1,
  },
  crouchHeavyKick: {
    source: "crouchHeavy", suffix: "sweep", moveName: "SWEEP", level: ATTACK_LEVELS.LOW,
    range: 1.24, damage: 1.02, push: 1.3, startup: 2, active: 0, recovery: 6,
    hitstun: 0, blockstun: 1, boxY: 1.04, boxHeight: 0.94, knockdown: true,
  },
  airLightKick: {
    source: "airLight", suffix: "lk", moveName: "JUMP KICK", level: ATTACK_LEVELS.AIR,
    range: 1.14, damage: 1, push: 1.06, startup: 0, active: 0, recovery: 1,
    hitstun: 0, blockstun: 0, boxY: 0.92, boxHeight: 1.04,
  },
  airHeavyKick: {
    source: "airHeavy", suffix: "hk", moveName: "JUMP ROUNDHOUSE", level: ATTACK_LEVELS.AIR,
    range: 1.22, damage: 1.03, push: 1.18, startup: 1, active: 0, recovery: 2,
    hitstun: 0, blockstun: 1, boxY: 0.9, boxHeight: 1.08,
  },
});

export const KICK_MOVE_KEYS = Object.freeze(Object.keys(KICK_VARIANTS));

const droppedOnDerive = ["animation", "projectile", "trap", "superMove", "gritCost", "command", "maxHits", "rehitFrames"];

function resolveField(source, base, field) {
  return Number.isFinite(source?.[field]) ? source[field] : base[field];
}

export function deriveKickProfile(source, key) {
  const variant = KICK_VARIANTS[key];
  if (!source || !variant) return null;
  const base = BASE_MOVES[source.baseKind] || BASE_MOVES.light;
  const scaleRange = variant.range;
  const derived = {
    ...source,
    id: `${source.id}-${variant.suffix}`,
    cancelProfileId: source.cancelProfileId || source.id,
    level: variant.level,
    moveName: variant.moveName,
    limb: "kick",
    startupFrames: Math.max(3, Math.round(resolveField(source, base, "startupFrames") + variant.startup)),
    activeFrames: Math.max(2, Math.round(resolveField(source, base, "activeFrames") + variant.active)),
    recoveryFrames: Math.max(4, Math.round(resolveField(source, base, "recoveryFrames") + variant.recovery)),
    range: Math.round(resolveField(source, base, "range") * scaleRange),
    damage: Number((resolveField(source, base, "damage") * variant.damage).toFixed(2)),
    push: Math.round(resolveField(source, base, "push") * variant.push),
    meter: Math.round(resolveField(source, base, "meter") * 1.02),
    hitstunFrames: Math.max(0, Math.round((source.hitstunFrames ?? 20) + variant.hitstun)),
    blockstunFrames: Math.max(0, Math.round((source.blockstunFrames ?? 10) + variant.blockstun)),
    hitboxes: (source.hitboxes || []).map((entry) => ({
      from: entry.from,
      to: entry.to,
      box: {
        x: Math.round(entry.box.x * scaleRange),
        y: Math.round(entry.box.y * variant.boxY),
        width: Math.round(entry.box.width * scaleRange),
        height: Math.round(entry.box.height * variant.boxHeight),
      },
    })),
  };
  if (variant.knockdown) derived.knockdown = true;
  for (const field of droppedOnDerive) delete derived[field];
  return derived;
}

for (const key of KICK_MOVE_KEYS) {
  const derived = deriveKickProfile(moveProfiles[KICK_VARIANTS[key].source], key);
  if (derived) moveProfiles[key] = derived;
}

export const COMBAT_MOVE_PROFILES = deepFreeze(moveProfiles);

export function selectMoveProfile(kind, context = {}) {
  if (kind === "throw") return COMBAT_MOVE_PROFILES.throw;
  const kick = context.limb === "kick";
  if (context.airborne) {
    if (kind === "special") return COMBAT_MOVE_PROFILES.airSpecial;
    if (kind === "heavy") return COMBAT_MOVE_PROFILES[kick ? "airHeavyKick" : "airHeavy"];
    return COMBAT_MOVE_PROFILES[kick ? "airLightKick" : "airLight"];
  }
  if (kind === "light" && context.crouching) return COMBAT_MOVE_PROFILES[kick ? "crouchLightKick" : "crouchLight"];
  if (kind === "heavy" && context.crouching) return COMBAT_MOVE_PROFILES[kick ? "crouchHeavyKick" : "crouchHeavy"];
  if (kind === "heavy" && context.forwardHeld && !kick) return COMBAT_MOVE_PROFILES.overhead;
  if (kind === "special") return COMBAT_MOVE_PROFILES.special;
  if (kind === "heavy") return COMBAT_MOVE_PROFILES[kick ? "standHeavyKick" : "standHeavy"];
  return COMBAT_MOVE_PROFILES[kick ? "standLightKick" : "standLight"];
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

// Boxes are authored in unscaled body-local units, so scaling here keeps every
// hitbox, hurtbox and attack box aligned with the enlarged art automatically.
export function localBoxToWorld(fighter, box) {
  const width = box.width * FIGHTER_SCALE;
  const offsetX = box.x * FIGHTER_SCALE;
  const x = fighter.facing >= 0 ? fighter.x + offsetX : fighter.x - offsetX - width;
  return { x, y: fighter.y + box.y * FIGHTER_SCALE, width, height: box.height * FIGHTER_SCALE };
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

export function resolveArenaCollision(a, b, {
  minX = MOVEMENT_RULES.stageMinX,
  maxX = MOVEMENT_RULES.stageMaxX,
  floorY = 600,
} = {}) {
  const aClearance = a.grounded === false ? floorY - a.y : 0;
  const bClearance = b.grounded === false ? floorY - b.y : 0;
  const legalCrossup = Math.max(aClearance, bClearance) >= COLLISION_RULES.crossupClearance;
  if (legalCrossup) {
    return { aX: a.x, bX: b.x, overlap: 0, legalCrossup: true };
  }
  return { ...resolvePushboxPositions(a, b, minX, maxX), legalCrossup: false };
}
