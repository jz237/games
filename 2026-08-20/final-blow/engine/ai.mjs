import { ATTACK_LEVELS, DEFENSE_RULES, THROW_RULES } from "./defense.mjs";
import { GRIT_RULES } from "./combos.mjs";
import { getFighterKit, selectKitAiIntent } from "./fighter-kits.mjs";

export const AI_DIFFICULTIES = Object.freeze({
  // Passive is an inert practice opponent. Every chance is zero and the brain
  // short-circuits before it can produce an input at all, so it never advances,
  // chases, attacks, throws, techs, jumps, blocks, reverses, spends meter or
  // takes a Final Blow. It exists to be hit.
  passive: Object.freeze({
    id: "passive", label: "PASSIVE", reactionFrames: 24, decisionFrames: 24,
    defenseChance: 0, antiAirChance: 0, comboChance: 0,
    throwChance: 0, meterChance: 0, wakeupReversalChance: 0, errorChance: 0,
    throwTechChance: 0, grabPressureChance: 0,
    meatyChance: 0, clinchTechChance: 0, throwWhiffPunishChance: 0,
    quickRiseChance: 0, wakeDelayChance: 0, airRecoveryChance: 0, perfectGuardChance: 0,
    tauntChance: 0,
    repeatLimit: 0, inert: true,
  }),
  rookie: Object.freeze({
    id: "rookie", label: "ROOKIE", reactionFrames: 20, decisionFrames: 18,
    defenseChance: 0.46, antiAirChance: 0.38, comboChance: 0.22,
    throwChance: 0.09, meterChance: 0.24, wakeupReversalChance: 0.16, errorChance: 0.24,
    throwTechChance: 0.12, grabPressureChance: 0.1,
    meatyChance: 0.1, clinchTechChance: 0.08, throwWhiffPunishChance: 0.15,
    quickRiseChance: 0.14, wakeDelayChance: 0.08, airRecoveryChance: 0.12, perfectGuardChance: 0.05,
    tauntChance: 0.35,
    repeatLimit: 2,
  }),
  street: Object.freeze({
    id: "street", label: "STREET", reactionFrames: 14, decisionFrames: 13,
    defenseChance: 0.62, antiAirChance: 0.55, comboChance: 0.42,
    throwChance: 0.15, meterChance: 0.44, wakeupReversalChance: 0.31, errorChance: 0.14,
    throwTechChance: 0.3, grabPressureChance: 0.2,
    meatyChance: 0.26, clinchTechChance: 0.22, throwWhiffPunishChance: 0.4,
    quickRiseChance: 0.32, wakeDelayChance: 0.12, airRecoveryChance: 0.28, perfectGuardChance: 0.12,
    tauntChance: 0.12,
    repeatLimit: 2,
  }),
  pro: Object.freeze({
    id: "pro", label: "PRO", reactionFrames: 9, decisionFrames: 9,
    defenseChance: 0.76, antiAirChance: 0.72, comboChance: 0.65,
    throwChance: 0.22, meterChance: 0.68, wakeupReversalChance: 0.52, errorChance: 0.08,
    throwTechChance: 0.56, grabPressureChance: 0.34,
    meatyChance: 0.5, clinchTechChance: 0.44, throwWhiffPunishChance: 0.66,
    quickRiseChance: 0.55, wakeDelayChance: 0.16, airRecoveryChance: 0.5, perfectGuardChance: 0.24,
    tauntChance: 0.05,
    repeatLimit: 3,
  }),
  final: Object.freeze({
    id: "final", label: "FINAL", reactionFrames: 6, decisionFrames: 7,
    defenseChance: 0.87, antiAirChance: 0.84, comboChance: 0.8,
    throwChance: 0.29, meterChance: 0.84, wakeupReversalChance: 0.7, errorChance: 0.04,
    throwTechChance: 0.78, grabPressureChance: 0.48,
    meatyChance: 0.72, clinchTechChance: 0.66, throwWhiffPunishChance: 0.84,
    quickRiseChance: 0.78, wakeDelayChance: 0.2, airRecoveryChance: 0.68, perfectGuardChance: 0.38,
    tauntChance: 0.02,
    repeatLimit: 3,
  }),
});

export const DEFAULT_AI_DIFFICULTY = "street";

// Ordered easiest to hardest for the difficulty pickers.
export const AI_DIFFICULTY_ORDER = Object.freeze(["passive", "rookie", "street", "pro", "final"]);

// Release 1.8 GRIND: registered custom difficulty tiers (the survival ramp
// lerps between the named tiers and registers the blend per bout). The
// registry is deterministic-derived config — never written from a sim path —
// and the persisted difficulty picker still only ever sees the named tiers
// because normalizeAiDifficulty deliberately ignores custom entries.
const CUSTOM_AI_DIFFICULTIES = new Map();

export function registerAiDifficulty(id, settings) {
  if (AI_DIFFICULTIES[id]) throw new Error(`Cannot override built-in AI difficulty: ${id}`);
  CUSTOM_AI_DIFFICULTIES.set(String(id), Object.freeze({ ...settings, id: String(id) }));
  return CUSTOM_AI_DIFFICULTIES.get(String(id));
}

export function resolveAiSettings(id) {
  return AI_DIFFICULTIES[id] || CUSTOM_AI_DIFFICULTIES.get(id) || AI_DIFFICULTIES[DEFAULT_AI_DIFFICULTY];
}

function isKnownAiDifficulty(id) {
  return Boolean(AI_DIFFICULTIES[id] || CUSTOM_AI_DIFFICULTIES.has(id));
}

export function isPassiveDifficulty(difficulty) {
  return normalizeAiDifficulty(difficulty) === "passive";
}

export function normalizeAiDifficulty(id) {
  return AI_DIFFICULTIES[id] ? id : DEFAULT_AI_DIFFICULTY;
}

export function createAiBrain(difficulty = DEFAULT_AI_DIFFICULTY) {
  const id = isKnownAiDifficulty(difficulty) ? String(difficulty) : DEFAULT_AI_DIFFICULTY;
  return {
    difficulty: id,
    observations: [],
    nextDecisionFrame: 0,
    intent: { movement: "hold", action: null, reason: "boot" },
    lastDecisionFrame: -Infinity,
    lastObservedFrame: -1,
    lastComboKey: "",
    // 5.3 CLOSE RANGE: the two close-range reads are COMMITMENTS, not a fresh
    // coin flip per frame. `roll` is a new RNG draw every tick, and both reads
    // need the brain to look every frame (a meaty is a 4-8 frame window; a
    // clinch tech is 7), so the decision is latched once per knockdown and
    // once per clinch and only the TIMING is re-evaluated after that.
    okiWindowEnd: -1,
    okiTake: false,
    clinchTick: -1,
    clinchTake: false,
    recentActions: [],
    suppressedRepeats: 0,
    decisions: 0,
  };
}

export function resetAiBrain(brain, difficulty = brain?.difficulty || DEFAULT_AI_DIFFICULTY) {
  const fresh = createAiBrain(difficulty);
  if (!brain) return fresh;
  Object.assign(brain, fresh);
  return brain;
}

export function visibleOpponentObservation(opponent, frame) {
  const attack = opponent?.attacking;
  return Object.freeze({
    frame,
    x: opponent?.x ?? 0,
    y: opponent?.y ?? 0,
    grounded: Boolean(opponent?.grounded),
    crouching: Boolean(opponent?.crouch),
    guarding: Boolean(opponent?.guarding),
    down: Boolean(opponent?.down),
    wakeupFrames: opponent?.wakeupFrames || 0,
    // 5.3 OKIZEME / CLOSE RANGE: the knockdown clock (so the brain can walk
    // in before the rise instead of reacting to it) and the swing's total
    // length (so it can tell a live throw from one that has already whiffed).
    // Both are on-screen facts — the animation says them — not hidden state.
    knockdownFrames: opponent?.knockdownFrames || 0,
    attackTotalFrames: attack?.totalFrames ?? 0,
    attacking: Boolean(attack),
    attackLevel: attack?.level || null,
    attackKind: attack?.kind || null,
    attackFrame: opponent?.attackFrame || 0,
    attackStartupFrame: attack?.activeStartFrame ?? Infinity,
    attackActiveEndFrame: attack?.activeEndFrame ?? -Infinity,
    attackRange: attack?.range || 0,
    grabbing: Boolean(opponent?.grabbing),
    health: opponent?.health ?? 100,
    meter: opponent?.meter ?? 0,
  });
}

export function recordAiObservation(brain, frame, opponent) {
  const observation = visibleOpponentObservation(opponent, frame);
  brain.observations.push(observation);
  const retention = resolveAiSettings(brain.difficulty).reactionFrames + 90;
  while (brain.observations.length > retention) brain.observations.shift();
  return observation;
}

export function getReactionObservation(brain, frame) {
  const cutoff = frame - resolveAiSettings(brain.difficulty).reactionFrames;
  for (let index = brain.observations.length - 1; index >= 0; index -= 1) {
    if (brain.observations[index].frame <= cutoff) return brain.observations[index];
  }
  return null;
}

function mixRoll(roll, salt) {
  const value = Math.sin((Number(roll) || 0) * 917.17 + salt * 61.73) * 43758.5453;
  return value - Math.floor(value);
}

function emptyInput() {
  return {
    left: false, right: false, down: false, guard: false, jump: false,
    light: false, heavy: false, special: false, enhanced: false, throw: false,
    super: false, final: false,
  };
}

function applyMovement(input, movement, self, observation) {
  const towardRight = observation.x > self.x;
  if (movement === "advance") {
    input.right = towardRight;
    input.left = !towardRight;
  } else if (movement === "retreat") {
    input.right = !towardRight;
    input.left = towardRight;
  }
}

/**
 * Release 1.7: just-defend gate. A justDefend intent only actually holds the
 * guard input once the observed attack is within the Perfect Guard window of
 * going active (compensating for how stale the reaction-delayed observation
 * is), so the AI's block STARTS just before impact exactly like a human
 * tapping back late. Pure frame math on the visible observation — no reads of
 * hidden opponent state.
 */
export function justDefendHold(observation, frame) {
  if (!observation?.attacking) return false;
  const observationAge = frame - observation.frame;
  const framesUntilActive = (observation.attackStartupFrame - observation.attackFrame) - observationAge;
  return framesUntilActive <= 4;
}

/**
 * 5.3 OKIZEME — meaty timing. The last `wakeupVulnerableFrames` of a rise
 * carry hurtboxes (engine/defense.mjs), so a strike started `startup` frames
 * before that window opens is active on it. This compensates for the
 * reaction-delayed observation exactly like justDefendHold does, and reads
 * only the visible wake clock — never the hidden wake option, which is
 * precisely the thing the attacker is supposed to be guessing.
 *
 * Returns true through the whole window (not just its first frame) so a brain
 * whose decision tick lands late still swings instead of freezing.
 */
export function meatyTiming(observation, frame, startup = 5) {
  if (!observation || observation.wakeupFrames <= 0) return false;
  const age = frame - observation.frame;
  const untilVulnerable = (observation.wakeupFrames - DEFENSE_RULES.wakeupVulnerableFrames) - age;
  return untilVulnerable <= startup && untilVulnerable > -DEFENSE_RULES.wakeupVulnerableFrames;
}

/**
 * 5.3 CLOSE RANGE — is the opponent's live swing a THROW that has already
 * missed? A whiffed throw now runs its full 32-39 frames plus the 0.25 whiff
 * tax, which is the punish window this pass created; the brain reads it off
 * the same visible fields a player reads off the animation (a grab that is
 * past its active frames with nobody in its hands).
 */
export function whiffedThrowPunish(observation, frame) {
  if (!observation?.attacking || observation.attackLevel !== ATTACK_LEVELS.THROW) return false;
  if (observation.grabbing) return false;
  const age = frame - observation.frame;
  return (observation.attackFrame + age) >= observation.attackActiveEndFrame;
}

function inputFromIntent(intent, self, observation, pulseAction = false, frame = observation.frame) {
  const input = emptyInput();
  applyMovement(input, intent.movement, self, observation);
  input.guard = Boolean(intent.guard) && (!intent.justDefend || justDefendHold(observation, frame));
  input.down = Boolean(intent.down);
  input.jump = Boolean(intent.jump && pulseAction);
  if (pulseAction && intent.action) input[intent.action] = true;
  // Release 1.7 wave 11: a kick-limbed normal rides the same limb selector a
  // human uses, so advancing lights and heavies naturally come out as the
  // forward command kicks.
  if (pulseAction && intent.limb === "kick" && (intent.action === "light" || intent.action === "heavy")) {
    input.limb = "kick";
    input.kick = true;
  }
  if (intent.action === "throw") {
    // Grabs are a direction plus LP/LK, so hold toward or away from the opponent
    // exactly like a human would.
    const towardRight = observation.x > self.x;
    input.right = intent.throwBack ? !towardRight : towardRight;
    input.left = intent.throwBack ? towardRight : !towardRight;
    input.throwBack = Boolean(intent.throwBack);
  }
  return input;
}

function enhancedVersion(action) {
  return {
    special: "enhanced",
    commandSpecial: "enhancedCommandSpecial",
    backSpecial: "enhancedBackSpecial",
    launcher: "enhancedLauncher",
  }[action] || action;
}

function comboFollowup(self, settings, roll) {
  if (!self.attacking || self.attackConnected !== "hit") return null;
  const comboKey = `${self.attackSerial || 0}:${self.attackHits || 0}`;
  if (self.aiBrain?.lastComboKey === comboKey || mixRoll(roll, 2) >= settings.comboChance) return null;
  if (self.meter >= GRIT_RULES.superCost && mixRoll(roll, 3) < settings.meterChance) return { action: "super", comboKey };
  const current = self.attacking.kitAction;
  let action = ["light", "heavy", "driveHeavy"].includes(current) ? "special"
    : current === "special" ? "commandSpecial"
      : current === "commandSpecial" ? "launcher"
        : "special";
  if (self.meter >= GRIT_RULES.enhancedSpecialCost && mixRoll(roll, 4) < settings.meterChance) {
    action = enhancedVersion(action);
  }
  return { action, comboKey };
}

export const PASSIVE_INTENT = Object.freeze({ movement: "hold", action: null, reason: "passive" });

function applyRepetitionGuard(brain, intent, settings, roll) {
  if (!intent.action || !settings.repeatLimit) return intent;
  const consecutive = [...brain.recentActions].reverse().findIndex((action) => action !== intent.action);
  const repeated = consecutive < 0 ? brain.recentActions.length : consecutive;
  if (repeated < settings.repeatLimit) return intent;
  brain.suppressedRepeats += 1;
  return {
    movement: mixRoll(roll, 21) < 0.5 ? "advance" : "retreat",
    action: null,
    reason: "reposition-break",
  };
}

export function decideAiIntent(brain, {
  frame,
  self,
  observation,
  roll = 0.5,
} = {}) {
  const settings = resolveAiSettings(brain.difficulty);
  if (settings.inert) return { ...PASSIVE_INTENT };
  const fighterId = self.kitId || self.def?.kitId || self.id || self.def?.id;
  const kit = getFighterKit(fighterId);
  const distance = Math.abs(observation.x - self.x);
  const combo = comboFollowup({ ...self, aiBrain: brain }, settings, roll);
  if (combo) {
    return { movement: "hold", action: combo.action, reason: "hit-confirm", comboKey: combo.comboKey };
  }

  // Release 1.7: downed — pick a wake-up option through the same inputs a
  // human uses (Up pulse quick-rises, Down held delays the getaway).
  if (self.down && self.knockdownFrames > 0) {
    if (mixRoll(roll, 22) < (settings.quickRiseChance || 0)) {
      return { movement: "hold", action: null, jump: true, reason: "quick-rise" };
    }
    if (mixRoll(roll, 23) < (settings.wakeDelayChance || 0)) {
      return { movement: "hold", action: null, down: true, reason: "delay-wakeup" };
    }
    return { movement: "hold", action: null, guard: true, reason: "downed" };
  }

  // 5.3 CLOSE RANGE: caught in a clinch — the REACTION tech. The hold runs
  // 11-18 frames and its first `clinchTechWindowFrames` accept a fresh grab
  // of your own, so the CPU answers with the same →+LP a human would inside
  // the same window. Sits above every other branch because a grabbed fighter
  // has no other legal option.
  if (self.grabbed) {
    const startTick = self.grabbed.startTick ?? -1;
    if (brain.clinchTick !== startTick) {
      brain.clinchTick = startTick;
      brain.clinchTake = mixRoll(roll, 33) < (settings.clinchTechChance ?? settings.throwTechChance ?? 0);
    }
    if (brain.clinchTake && (self.grabbed.frame || 0) <= DEFENSE_RULES.clinchTechWindowFrames) {
      return { movement: "hold", action: "throw", reason: "clinch-tech" };
    }
    return { movement: "hold", action: null, reason: "clinched" };
  }

  // Release 1.7: juggled — tech out with an attack button once the sim's
  // escape window opens, at the difficulty's configured rate.
  if (!self.grounded && self.pendingKnockdown) {
    if (self.airTechArmed && mixRoll(roll, 24) < (settings.airRecoveryChance || 0)) {
      return { movement: "hold", action: "light", reason: "air-tech" };
    }
    return { movement: "hold", action: null, reason: "juggled" };
  }

  // 5.3 CLOSE RANGE: punish a whiffed throw. The commitment band means a
  // grab pressed just outside its reach now runs 42-51 frames of tail; that
  // is the biggest free punish in the game and the brain must take it.
  if (whiffedThrowPunish(observation, frame) && distance < 170
    && mixRoll(roll, 34) < (settings.throwWhiffPunishChance || 0)) {
    return {
      movement: distance > 120 ? "advance" : "hold",
      action: self.meter >= GRIT_RULES.superCost && mixRoll(roll, 35) < settings.meterChance
        ? "super" : "heavy",
      reason: "throw-whiff-punish",
    };
  }

  // 5.3 OKIZEME: the meaty. The last rising frames carry hurtboxes now, so a
  // knockdown is finally worth pressure: walk in while the opponent is still
  // down, watch the rise, and swing so the active window lands on the 4-8
  // vulnerable frames. A command grab is legal on the way up after a STRIKE
  // knockdown (the 40-frame throw immunity is reserved for throws and techs),
  // so grapplers mix it in — that is the strike/throw half of the read, and
  // quick-rise/delayed-rise is what makes it a guess rather than a script.
  //
  // The take is decided ONCE per knockdown (the roll is a fresh RNG draw every
  // tick, and stepAiBrain re-decides every frame while the reason is
  // "oki-approach" so the press can be timed). Being early is not free: the
  // strike meets the hurtbox-less half of the rise, pays the whiff tax and
  // eats the reversal — the same risk a human takes guessing the rise.
  const opponentRising = Boolean(observation.down) || observation.wakeupFrames > 0;
  if (opponentRising && distance <= 240) {
    if (frame > (brain.okiWindowEnd ?? -1)) {
      brain.okiWindowEnd = frame + DEFENSE_RULES.knockdownFrames + DEFENSE_RULES.wakeupFrames + 30;
      brain.okiTake = mixRoll(roll, 36) < (settings.meatyChance || 0);
    }
    if (brain.okiTake) {
      if (meatyTiming(observation, frame, 5) && distance <= 170) {
        const grabMeaty = distance <= THROW_RULES.grabRange
          && mixRoll(roll, 37) < (settings.grabPressureChance || 0);
        if (grabMeaty) return { movement: "hold", action: "throw", reason: "meaty-throw" };
        return {
          movement: "hold",
          action: "light",
          limb: mixRoll(roll, 38) < 0.45 ? "kick" : "punch",
          down: mixRoll(roll, 39) < 0.4,
          reason: "meaty",
        };
      }
      return {
        movement: distance > 118 ? "advance" : "hold",
        action: null,
        reason: "oki-approach",
      };
    }
  }

  // Release 1.7 wave 11: disrespect. With the opponent visibly down and the
  // spacing safe, low difficulties sometimes burn the knockdown on a taunt —
  // through the same taunt input a human uses. Passive never reaches here.
  if (observation.down && distance > 190 && mixRoll(roll, 26) < (settings.tauntChance || 0)) {
    return { movement: "hold", action: "taunt", reason: "taunt" };
  }

  const incomingRange = Math.min(300, (observation.attackRange || 105) + 42);
  if (observation.attacking && distance <= incomingRange) {
    const defend = mixRoll(roll, 5) < settings.defenseChance;
    if (observation.attackLevel === ATTACK_LEVELS.THROW && defend) {
      // Teching means answering with a grab of your own inside the tech window.
      if (mixRoll(roll, 17) < (settings.throwTechChance || 0)) {
        return { movement: "hold", action: "throw", reason: "throw-tech" };
      }
      return mixRoll(roll, 6) < 0.52
        ? { movement: "retreat", action: null, jump: true, reason: "throw-evade" }
        : { movement: "retreat", action: "backSpecial", reason: "throw-evade" };
    }
    if (defend) {
      // Release 1.7: sometimes time the block as a just-defend — the guard
      // input is then withheld until the attack is about to land (see
      // justDefendHold), which is exactly how a human fishes for a Perfect
      // Guard instead of holding back all day.
      const justDefend = mixRoll(roll, 25) < (settings.perfectGuardChance || 0);
      return {
        movement: "hold",
        action: null,
        guard: true,
        justDefend,
        down: observation.attackLevel === ATTACK_LEVELS.LOW,
        reason: observation.attackLevel === ATTACK_LEVELS.LOW ? "low-block" : "high-block",
      };
    }
  }

  if (!observation.grounded && !observation.down && distance < 190
    && mixRoll(roll, 7) < settings.antiAirChance) {
    return { movement: "hold", action: kit?.ai.antiAirAction || "launcher", reason: "anti-air" };
  }

  if ((self.justWoke || (self.wakeupFrames > 0 && self.wakeupFrames <= 4))) {
    if (self.meter >= GRIT_RULES.enhancedSpecialCost
      && mixRoll(roll, 8) < settings.wakeupReversalChance) {
      return { movement: "hold", action: "enhancedLauncher", reason: "wakeup-reversal" };
    }
    return { movement: "hold", action: null, guard: true, down: mixRoll(roll, 9) < 0.36, reason: "wakeup-block" };
  }

  // 5.3 CLOSE RANGE: the brain grabs strictly inside the throw's REACH, not
  // the wider commit band — pressing in the band is now a whiffed throw with
  // a real punish window, and a CPU that mashed it there would be feeding.
  if (distance < Math.min(THROW_RULES.grabRange - 12, 96 * (settings.spacing || 1))
    && mixRoll(roll, 10) < settings.throwChance) {
    // Corner-carry with a back throw sometimes, forward throw otherwise.
    const back = mixRoll(roll, 18) < (settings.grabPressureChance || 0) * 0.5;
    return { movement: "hold", action: "throw", throwBack: back, reason: back ? "back-throw" : "throw" };
  }

  // 4.3 DEMO SPACING: when a patient (attract-mode) brain finds itself deep
  // inside the clinch with nothing incoming, it opens the gap first — a
  // back-jump a third of the time, a back-walk otherwise — so the next
  // exchange is readable from a distance.
  if ((settings.patience || 0) > 0 && !observation.attacking && self.grounded
    && distance < 150 && mixRoll(roll, 30) < settings.patience) {
    return mixRoll(roll, 31) < 0.34
      ? { movement: "retreat", action: null, jump: true, reason: "demo-space-jump" }
      : { movement: "retreat", action: null, reason: "demo-space" };
  }

  let intent = selectKitAiIntent(fighterId, {
    distance,
    opponentAirborne: !observation.grounded,
    opponentAttacking: observation.attacking,
    meter: self.meter,
    roll: mixRoll(roll, 11),
    spacing: settings.spacing || 1,
    patience: settings.patience || 0,
  }) || { movement: "hold", action: null };

  if (self.meter >= GRIT_RULES.superCost
    && distance < 270
    && mixRoll(roll, 12) < settings.meterChance * 0.38) {
    intent = { movement: "hold", action: "super", reason: "meter-super" };
  } else if (intent.action
    && self.meter >= GRIT_RULES.enhancedSpecialCost
    && mixRoll(roll, 13) < settings.meterChance * 0.5) {
    intent = { ...intent, action: enhancedVersion(intent.action), reason: "enhanced-special" };
  }

  if (mixRoll(roll, 14) < settings.errorChance) {
    return mixRoll(roll, 15) < 0.55
      ? { movement: "hold", action: null, reason: "hesitation" }
      : { movement: intent.movement === "advance" ? "retreat" : "advance", action: null, reason: "spacing-error" };
  }
  // Release 1.7 wave 11: normals split between limbs, so held-position pokes
  // mix the kick normals into ordinary move selection…
  if (["light", "heavy"].includes(intent.action) && mixRoll(roll, 27) < 0.4) {
    intent = { ...intent, limb: "kick" };
  }
  // …and an empty-handed approach sometimes walks in behind an advancing kick
  // — which is exactly the forward command normals, reached through the same
  // forward-held + kick-limb inputs a human uses.
  // (Demo spacing: a patient brain walks in empty-handed instead of kicking
  // its way into the clinch.)
  if (intent.movement === "advance" && !intent.action && mixRoll(roll, 28) < 0.35 * (1 - (settings.patience || 0))) {
    intent = {
      ...intent,
      action: mixRoll(roll, 29) < 0.5 ? "light" : "heavy",
      limb: "kick",
      reason: "advancing-kick",
    };
  }
  return { ...intent, reason: intent.reason || "archetype" };
}

export function stepAiBrain(brain, {
  frame,
  self,
  opponent,
  roll = 0.5,
} = {}) {
  recordAiObservation(brain, frame, opponent);
  // A passive brain never produces an input, whatever it can see.
  if (resolveAiSettings(brain.difficulty).inert) {
    brain.intent = { ...PASSIVE_INTENT };
    brain.lastObservedFrame = frame;
    return emptyInput();
  }
  const observation = getReactionObservation(brain, frame);
  if (!observation) return emptyInput();
  brain.lastObservedFrame = observation.frame;
  if (frame < brain.nextDecisionFrame) return inputFromIntent(brain.intent, self, observation, false, frame);

  brain.intent = applyRepetitionGuard(
    brain,
    decideAiIntent(brain, { frame, self, observation, roll }),
    resolveAiSettings(brain.difficulty),
    roll,
  );
  brain.recentActions.push(brain.intent.action || null);
  brain.recentActions = brain.recentActions.slice(-6);
  if (brain.intent.comboKey) brain.lastComboKey = brain.intent.comboKey;
  brain.lastDecisionFrame = frame;
  brain.decisions += 1;
  // 5.3 CLOSE RANGE: the two timed reads look again NEXT FRAME. A meaty
  // window is 4-8 frames and a clinch tech 7, both far inside the 7-18-frame
  // decision cadence, so without this the brain would only ever hit them by
  // luck. The take itself is already latched (okiTake / clinchTake), so this
  // buys timing, never extra probability.
  const timedRead = brain.intent.reason === "oki-approach" || brain.intent.reason === "clinched";
  brain.nextDecisionFrame = timedRead ? frame + 1 : frame
    + resolveAiSettings(brain.difficulty).decisionFrames
    + Math.floor(mixRoll(roll, 16) * 4);
  return inputFromIntent(brain.intent, self, observation, true, frame);
}

export function aiBrainSnapshot(brain) {
  const settings = resolveAiSettings(brain.difficulty);
  return {
    difficulty: brain.difficulty,
    reactionFrames: settings.reactionFrames,
    decisionFrames: settings.decisionFrames,
    lastDecisionFrame: brain.lastDecisionFrame,
    lastObservedFrame: brain.lastObservedFrame,
    nextDecisionFrame: brain.nextDecisionFrame,
    decisions: brain.decisions,
    recentActions: [...brain.recentActions],
    suppressedRepeats: brain.suppressedRepeats,
    intent: { ...brain.intent },
  };
}
