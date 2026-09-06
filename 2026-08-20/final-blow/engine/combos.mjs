import { createAttackInstance } from "./foundation.mjs";
import { ATTACK_LEVELS } from "./defense.mjs";

export const GRIT_RULES = Object.freeze({
  maximum: 100,
  enhancedSpecialCost: 25,
  guardReversalCost: 30,
  superCost: 100,
  hitGainMultiplier: 1,
  damageTakenGainMultiplier: 0.45,
  // BLOCK ECONOMY (post-5.0): a blocked strike pays the attacker half. Before
  // this, chip pressure built a super exactly as fast as landing hits — seven
  // blocked Blitzes banked 168 Grit for Benny while the blocker got 76 — so
  // the player who read the string correctly was still losing the long game.
  // At 0.5x versus the defender's 0.45x a blocked hit is close to Grit-neutral.
  blockGainMultiplier: 0.5,
  // A projectile pays a flat sum once per projectile, hit or block. The old
  // flat 15 on every touch let Donald fund GOLDEN BACK NINE (100 Grit) with
  // seven blocked Shockwaves in 5.25 s of zero-risk zoning; a blocked shot is
  // now worth 6, so the same wall needs seventeen blocked orbs (~13 s).
  projectileGain: Object.freeze({ hit: 15, block: 6 }),
});

// Grit the attacker banks for one connecting hit of `attack`. The defender's
// 0.45x share is unchanged by the block: blocking correctly is the one thing
// in the economy that keeps its full rate.
export function attackGritGain(attack, { blocked = false } = {}) {
  const base = Number.isFinite(attack?.meter) ? attack.meter : 0;
  return base * (blocked ? GRIT_RULES.blockGainMultiplier : GRIT_RULES.hitGainMultiplier);
}

export function projectileGritGain({ blocked = false } = {}) {
  return blocked ? GRIT_RULES.projectileGain.block : GRIT_RULES.projectileGain.hit;
}

// BLOCK ECONOMY: a special that cancels into another special (Benny's voltage
// cancels, Ali's flow cancels) may do so on BLOCK only this many times per
// string. One blocked cancel keeps the rushdown identity — Blitz into Blitz is
// still real pressure — but the second one is refused, so the string ends on
// the cancelled move's own recovery instead of looping into a true
// blockstring. Measured before the rule: Blitz (last hit f21, blockstun to
// f38) cancelled into Blitz at f34 was airtight for as long as the buttons
// lasted and guard-crushed on the seventh rep. On HIT the cancels are still
// unlimited; supers already required a hit.
export const SPECIAL_CANCEL_RULES = Object.freeze({
  blockedPerString: 1,
});

// Short, high-impact combos. The scaling curve drops hard after the third hit so
// a confirm is worth having but an extended string is not, and the juggle floor
// is low enough that air chains cannot replace neutral.
export const COMBO_RULES = Object.freeze({
  // Measured in simulation ticks, which keep counting through hitstop. The
  // 1.9C readability pass lengthened the freeze on every landed hit by about
  // five ticks, so the budget grew by the same amount — the real fight-time a
  // combo may idle between hits is unchanged from the original 38-frame tune.
  resetGapFrames: 44,
  displayFrames: 72,
  juggleLimit: 2,
  hitScales: Object.freeze([1, 0.74, 0.52, 0.38, 0.3, 0.25, 0.22, 0.2, 0.18, 0.16]),
  minimumScale: 0.15,
  juggleScaleStep: 0.2,
  minimumJuggleScale: 0.4,
  // A single authored multi-hit move (a super, an EX rekka) should not scale its
  // own hits into nothing. Its length is already bounded by maxHits/rehitFrames,
  // so its later hits get a floor that the general curve does not.
  multiHitFloor: 0.52,
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
    command: "↓ → + PUNCH",
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
    command: "→ ↓ → + PUNCH",
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
    command: "← → + KICK",
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
    // Release 1.7 wave 11: a set piece (the corner wall-bounce) may hold the
    // combo open past the ordinary reset gap while the defender is helpless
    // riding its arc. Granted only by the simulation, snapshot-carried.
    this.graceUntilFrame = -Infinity;
    this.peakHits = this.peakHits || 0;
  }

  #gapExpired(frame) {
    return frame - this.lastHitFrame > COMBO_RULES.resetGapFrames
      && frame > (this.graceUntilFrame ?? -Infinity);
  }

  registerHit(frame, juggleCount = 0) {
    if (!this.active || this.#gapExpired(frame)) {
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
    if (this.active && this.#gapExpired(frame)) this.active = false;
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

export const COMMAND_INPUT_RULES = Object.freeze({
  // Six tenths of a second for the whole motion and three tenths between
  // directions keeps quarter-circles comfortable on keyboards, pads and touch.
  // The attack button must still be fresh, and excessive direction waggling is
  // rejected, so the added leniency does not manufacture accidental specials.
  maxWindowFrames: 36,
  maxGapFrames: 18,
  terminalWindowFrames: 4,
  maxSkippedEntries: 3,
});

export function matchCommandSequence(history, sequence, currentFrame, {
  maxWindowFrames = COMMAND_INPUT_RULES.maxWindowFrames,
  maxGapFrames = COMMAND_INPUT_RULES.maxGapFrames,
  terminalWindowFrames = COMMAND_INPUT_RULES.terminalWindowFrames,
  maxSkippedEntries = COMMAND_INPUT_RULES.maxSkippedEntries,
} = {}) {
  let cursor = history.length - 1;
  let nextFrame = currentFrame;
  let startIndex = -1;
  let endIndex = -1;
  let skippedEntries = 0;
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
      if (entry.frame <= nextFrame) skippedEntries += 1;
      cursor -= 1;
    }
    if (found < 0) return null;
    if (skippedEntries > maxSkippedEntries) return null;
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
    { action: "super", sequence: ["down", "forward", "down", "forward", "punch"], terminal: "punch", options: { maxWindowFrames: 54, maxGapFrames: 20, maxSkippedEntries: 4 } },
    { action: "launcher", sequence: ["forward", "down", "forward", "punch"], terminal: "punch" },
    { action: "driveHeavy", sequence: ["back", "forward", "kick"], terminal: "kick" },
    { action: "commandSpecial", sequence: ["down", "forward", "punch"], terminal: "punch" },
    { action: "special", sequence: ["down", "forward", "kick"], terminal: "kick" },
    { action: "throwObject", sequence: ["down", "back", "kick"], terminal: "kick" },
  ];
  for (const candidate of candidates) {
    const match = matchCommandSequence(history, candidate.sequence, currentFrame, candidate.options);
    if (match) return { ...candidate, ...match };
  }
  return null;
}

// Deliberate, limited cancel routes: a light confirms into one heavy, a heavy
// confirms into a special. There is no universal chain and no light-into-light
// mash string, so pressure has to be earned with spacing rather than buttons.
const cancelRoutes = {
  "stand-light": ["heavy", "special", "commandSpecial", "enhanced", "super"],
  "crouch-light": ["heavy", "special", "commandSpecial", "enhanced", "super"],
  "stand-heavy": ["special", "commandSpecial", "enhanced", "super"],
  "crouch-heavy": ["special", "commandSpecial", "enhanced", "super"],
  overhead: ["special", "commandSpecial", "enhanced", "super"],
  "drive-heavy": ["special", "commandSpecial", "enhanced", "super"],
  "rising-launcher": ["super"],
  "command-special": ["super"],
};

export const CANCEL_ROUTES = deepFreeze(cancelRoutes);

const SPECIAL_CANCEL_ROUTES = Object.freeze(["special", "commandSpecial", "enhanced"]);

// A voltage/flow cancel is a special (rushCancel / rhythmCancel) going into
// another special. Ordinary normal-into-special cancels are not counted: a
// blocked heavy into one special is the genre's standard frame trap and ends
// on that special's recovery by itself.
export function isSpecialIntoSpecialCancel(attack, nextAction) {
  return Boolean(attack && (attack.rushCancel || attack.rhythmCancel))
    && SPECIAL_CANCEL_ROUTES.includes(nextAction);
}

export function canCancelAttack(attack, nextAction, attackFrame, connected = "", { blockedSpecialCancels = 0 } = {}) {
  const routeId = attack?.cancelProfileId || attack?.profileId;
  const allowedRoutes = attack?.cancelRoutes || CANCEL_ROUTES[routeId];
  if (!attack || !connected || !allowedRoutes?.includes(nextAction)) return false;
  const chainAction = ["light", "heavy", "launcher", "driveHeavy"].includes(nextAction);
  const earliest = chainAction ? attack.activeStartFrame : Math.max(attack.activeStartFrame, attack.activeEndFrame - 2);
  const latest = attack.activeEndFrame + (attack.kind === "light" ? 7 : 5);
  if (attackFrame < earliest || attackFrame > latest) return false;
  if (nextAction === "super" && connected !== "hit") return false;
  // BLOCK ECONOMY: the string's blocked special-into-special budget is spent.
  if (connected === "block"
    && isSpecialIntoSpecialCancel(attack, nextAction)
    && blockedSpecialCancels >= SPECIAL_CANCEL_RULES.blockedPerString) return false;
  return true;
}
