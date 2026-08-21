import { ATTACK_LEVELS } from "./defense.mjs";
import { GRIT_RULES } from "./combos.mjs";
import { getFighterKit, selectKitAiIntent } from "./fighter-kits.mjs";

export const AI_DIFFICULTIES = Object.freeze({
  rookie: Object.freeze({
    id: "rookie", label: "ROOKIE", reactionFrames: 20, decisionFrames: 18,
    defenseChance: 0.46, antiAirChance: 0.38, comboChance: 0.22,
    throwChance: 0.09, meterChance: 0.24, wakeupReversalChance: 0.16, errorChance: 0.24,
    throwTechChance: 0.12, grabPressureChance: 0.1,
  }),
  street: Object.freeze({
    id: "street", label: "STREET", reactionFrames: 14, decisionFrames: 13,
    defenseChance: 0.62, antiAirChance: 0.55, comboChance: 0.42,
    throwChance: 0.15, meterChance: 0.44, wakeupReversalChance: 0.31, errorChance: 0.14,
    throwTechChance: 0.3, grabPressureChance: 0.2,
  }),
  pro: Object.freeze({
    id: "pro", label: "PRO", reactionFrames: 9, decisionFrames: 9,
    defenseChance: 0.76, antiAirChance: 0.72, comboChance: 0.65,
    throwChance: 0.22, meterChance: 0.68, wakeupReversalChance: 0.52, errorChance: 0.08,
    throwTechChance: 0.56, grabPressureChance: 0.34,
  }),
  final: Object.freeze({
    id: "final", label: "FINAL", reactionFrames: 6, decisionFrames: 7,
    defenseChance: 0.87, antiAirChance: 0.84, comboChance: 0.8,
    throwChance: 0.29, meterChance: 0.84, wakeupReversalChance: 0.7, errorChance: 0.04,
    throwTechChance: 0.78, grabPressureChance: 0.48,
  }),
});

export const DEFAULT_AI_DIFFICULTY = "street";

export function normalizeAiDifficulty(id) {
  return AI_DIFFICULTIES[id] ? id : DEFAULT_AI_DIFFICULTY;
}

export function createAiBrain(difficulty = DEFAULT_AI_DIFFICULTY) {
  const id = normalizeAiDifficulty(difficulty);
  return {
    difficulty: id,
    observations: [],
    nextDecisionFrame: 0,
    intent: { movement: "hold", action: null, reason: "boot" },
    lastDecisionFrame: -Infinity,
    lastObservedFrame: -1,
    lastComboKey: "",
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
  const retention = AI_DIFFICULTIES[brain.difficulty].reactionFrames + 90;
  while (brain.observations.length > retention) brain.observations.shift();
  return observation;
}

export function getReactionObservation(brain, frame) {
  const cutoff = frame - AI_DIFFICULTIES[brain.difficulty].reactionFrames;
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

function inputFromIntent(intent, self, observation, pulseAction = false) {
  const input = emptyInput();
  applyMovement(input, intent.movement, self, observation);
  input.guard = Boolean(intent.guard);
  input.down = Boolean(intent.down);
  input.jump = Boolean(intent.jump && pulseAction);
  if (pulseAction && intent.action) input[intent.action] = true;
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

export function decideAiIntent(brain, {
  frame,
  self,
  observation,
  roll = 0.5,
} = {}) {
  const settings = AI_DIFFICULTIES[brain.difficulty];
  const fighterId = self.kitId || self.def?.kitId || self.id || self.def?.id;
  const kit = getFighterKit(fighterId);
  const distance = Math.abs(observation.x - self.x);
  const combo = comboFollowup({ ...self, aiBrain: brain }, settings, roll);
  if (combo) {
    return { movement: "hold", action: combo.action, reason: "hit-confirm", comboKey: combo.comboKey };
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
      return {
        movement: "hold",
        action: null,
        guard: true,
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

  if (distance < 96 && mixRoll(roll, 10) < settings.throwChance) {
    // Corner-carry with a back throw sometimes, forward throw otherwise.
    const back = mixRoll(roll, 18) < (settings.grabPressureChance || 0) * 0.5;
    return { movement: "hold", action: "throw", throwBack: back, reason: back ? "back-throw" : "throw" };
  }

  let intent = selectKitAiIntent(fighterId, {
    distance,
    opponentAirborne: !observation.grounded,
    opponentAttacking: observation.attacking,
    meter: self.meter,
    roll: mixRoll(roll, 11),
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
  return { ...intent, reason: intent.reason || "archetype" };
}

export function stepAiBrain(brain, {
  frame,
  self,
  opponent,
  roll = 0.5,
} = {}) {
  recordAiObservation(brain, frame, opponent);
  const observation = getReactionObservation(brain, frame);
  if (!observation) return emptyInput();
  brain.lastObservedFrame = observation.frame;
  if (frame < brain.nextDecisionFrame) return inputFromIntent(brain.intent, self, observation, false);

  brain.intent = decideAiIntent(brain, { frame, self, observation, roll });
  if (brain.intent.comboKey) brain.lastComboKey = brain.intent.comboKey;
  brain.lastDecisionFrame = frame;
  brain.decisions += 1;
  brain.nextDecisionFrame = frame
    + AI_DIFFICULTIES[brain.difficulty].decisionFrames
    + Math.floor(mixRoll(roll, 16) * 4);
  return inputFromIntent(brain.intent, self, observation, true);
}

export function aiBrainSnapshot(brain) {
  const settings = AI_DIFFICULTIES[brain.difficulty];
  return {
    difficulty: brain.difficulty,
    reactionFrames: settings.reactionFrames,
    decisionFrames: settings.decisionFrames,
    lastDecisionFrame: brain.lastDecisionFrame,
    lastObservedFrame: brain.lastObservedFrame,
    nextDecisionFrame: brain.nextDecisionFrame,
    decisions: brain.decisions,
    intent: { ...brain.intent },
  };
}
