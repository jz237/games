export const SIMULATION_HZ = 60;
export const SIMULATION_STEP_SECONDS = 1 / SIMULATION_HZ;
export const INPUT_BUFFER_RULES = Object.freeze({
  minimumFrames: 4,
  defaultFrames: 6,
  maximumFrames: 6,
});
export const DEFAULT_INPUT_BUFFER_FRAMES = INPUT_BUFFER_RULES.defaultFrames;

export const FIGHTER_STATES = Object.freeze({
  IDLE: "idle",
  WALK: "walk",
  CROUCH: "crouch",
  JUMP: "jump",
  DASH: "dash",
  ATTACK: "attack",
  THROW: "throw",
  BLOCK: "block",
  BLOCKSTUN: "blockstun",
  HITSTUN: "hitstun",
  KNOCKDOWN: "knockdown",
  WAKEUP: "wakeup",
  THROW_TECH: "throw-tech",
  FINISHER: "finisher",
  DOWN: "down",
});

const ALL_ACTIVE_STATES = [
  FIGHTER_STATES.IDLE,
  FIGHTER_STATES.WALK,
  FIGHTER_STATES.CROUCH,
  FIGHTER_STATES.JUMP,
  FIGHTER_STATES.DASH,
  FIGHTER_STATES.ATTACK,
  FIGHTER_STATES.THROW,
  FIGHTER_STATES.BLOCK,
  FIGHTER_STATES.BLOCKSTUN,
  FIGHTER_STATES.HITSTUN,
  FIGHTER_STATES.KNOCKDOWN,
  FIGHTER_STATES.WAKEUP,
  FIGHTER_STATES.THROW_TECH,
  FIGHTER_STATES.FINISHER,
  FIGHTER_STATES.DOWN,
];

export const FIGHTER_STATE_TRANSITIONS = Object.freeze({
  [FIGHTER_STATES.IDLE]: new Set(ALL_ACTIVE_STATES),
  [FIGHTER_STATES.WALK]: new Set(ALL_ACTIVE_STATES),
  [FIGHTER_STATES.CROUCH]: new Set(ALL_ACTIVE_STATES),
  [FIGHTER_STATES.JUMP]: new Set([
    FIGHTER_STATES.JUMP,
    FIGHTER_STATES.IDLE,
    FIGHTER_STATES.ATTACK,
    FIGHTER_STATES.HITSTUN,
    FIGHTER_STATES.FINISHER,
    FIGHTER_STATES.DOWN,
  ]),
  [FIGHTER_STATES.DASH]: new Set([
    FIGHTER_STATES.DASH,
    FIGHTER_STATES.IDLE,
    FIGHTER_STATES.WALK,
    FIGHTER_STATES.CROUCH,
    FIGHTER_STATES.JUMP,
    FIGHTER_STATES.ATTACK,
    FIGHTER_STATES.THROW,
    FIGHTER_STATES.BLOCK,
    FIGHTER_STATES.BLOCKSTUN,
    FIGHTER_STATES.HITSTUN,
    FIGHTER_STATES.KNOCKDOWN,
    FIGHTER_STATES.FINISHER,
    FIGHTER_STATES.DOWN,
  ]),
  [FIGHTER_STATES.ATTACK]: new Set([
    FIGHTER_STATES.ATTACK,
    FIGHTER_STATES.IDLE,
    FIGHTER_STATES.WALK,
    FIGHTER_STATES.CROUCH,
    FIGHTER_STATES.JUMP,
    FIGHTER_STATES.DASH,
    FIGHTER_STATES.THROW,
    FIGHTER_STATES.BLOCK,
    FIGHTER_STATES.BLOCKSTUN,
    FIGHTER_STATES.HITSTUN,
    FIGHTER_STATES.KNOCKDOWN,
    FIGHTER_STATES.THROW_TECH,
    FIGHTER_STATES.FINISHER,
    FIGHTER_STATES.DOWN,
  ]),
  [FIGHTER_STATES.THROW]: new Set([
    FIGHTER_STATES.THROW,
    FIGHTER_STATES.IDLE,
    FIGHTER_STATES.WALK,
    FIGHTER_STATES.CROUCH,
    FIGHTER_STATES.JUMP,
    FIGHTER_STATES.DASH,
    FIGHTER_STATES.ATTACK,
    FIGHTER_STATES.BLOCK,
    FIGHTER_STATES.THROW_TECH,
    FIGHTER_STATES.BLOCKSTUN,
    FIGHTER_STATES.HITSTUN,
    FIGHTER_STATES.KNOCKDOWN,
    FIGHTER_STATES.FINISHER,
    FIGHTER_STATES.DOWN,
  ]),
  [FIGHTER_STATES.BLOCK]: new Set([
    FIGHTER_STATES.BLOCK,
    FIGHTER_STATES.IDLE,
    FIGHTER_STATES.WALK,
    FIGHTER_STATES.CROUCH,
    FIGHTER_STATES.JUMP,
    FIGHTER_STATES.DASH,
    FIGHTER_STATES.ATTACK,
    FIGHTER_STATES.THROW,
    FIGHTER_STATES.BLOCKSTUN,
    FIGHTER_STATES.HITSTUN,
    FIGHTER_STATES.KNOCKDOWN,
    FIGHTER_STATES.FINISHER,
    FIGHTER_STATES.DOWN,
  ]),
  [FIGHTER_STATES.BLOCKSTUN]: new Set([
    FIGHTER_STATES.BLOCKSTUN,
    FIGHTER_STATES.IDLE,
    FIGHTER_STATES.WALK,
    FIGHTER_STATES.CROUCH,
    FIGHTER_STATES.JUMP,
    FIGHTER_STATES.DASH,
    FIGHTER_STATES.ATTACK,
    FIGHTER_STATES.THROW,
    FIGHTER_STATES.BLOCK,
    FIGHTER_STATES.HITSTUN,
    FIGHTER_STATES.KNOCKDOWN,
    FIGHTER_STATES.FINISHER,
    FIGHTER_STATES.DOWN,
  ]),
  [FIGHTER_STATES.HITSTUN]: new Set([
    FIGHTER_STATES.HITSTUN,
    FIGHTER_STATES.IDLE,
    FIGHTER_STATES.WALK,
    FIGHTER_STATES.CROUCH,
    FIGHTER_STATES.JUMP,
    FIGHTER_STATES.DASH,
    FIGHTER_STATES.ATTACK,
    FIGHTER_STATES.THROW,
    FIGHTER_STATES.BLOCK,
    FIGHTER_STATES.BLOCKSTUN,
    FIGHTER_STATES.KNOCKDOWN,
    FIGHTER_STATES.FINISHER,
    FIGHTER_STATES.DOWN,
  ]),
  [FIGHTER_STATES.KNOCKDOWN]: new Set([
    FIGHTER_STATES.KNOCKDOWN,
    FIGHTER_STATES.WAKEUP,
    FIGHTER_STATES.FINISHER,
    FIGHTER_STATES.DOWN,
  ]),
  [FIGHTER_STATES.WAKEUP]: new Set([
    FIGHTER_STATES.WAKEUP,
    FIGHTER_STATES.IDLE,
    FIGHTER_STATES.WALK,
    FIGHTER_STATES.CROUCH,
    FIGHTER_STATES.JUMP,
    FIGHTER_STATES.DASH,
    FIGHTER_STATES.ATTACK,
    FIGHTER_STATES.THROW,
    FIGHTER_STATES.BLOCK,
    FIGHTER_STATES.BLOCKSTUN,
    FIGHTER_STATES.HITSTUN,
    FIGHTER_STATES.KNOCKDOWN,
    FIGHTER_STATES.FINISHER,
    FIGHTER_STATES.DOWN,
  ]),
  [FIGHTER_STATES.THROW_TECH]: new Set([
    FIGHTER_STATES.THROW_TECH,
    FIGHTER_STATES.IDLE,
    FIGHTER_STATES.WALK,
    FIGHTER_STATES.CROUCH,
    FIGHTER_STATES.JUMP,
    FIGHTER_STATES.DASH,
    FIGHTER_STATES.ATTACK,
    FIGHTER_STATES.THROW,
    FIGHTER_STATES.BLOCK,
    FIGHTER_STATES.BLOCKSTUN,
    FIGHTER_STATES.HITSTUN,
    FIGHTER_STATES.KNOCKDOWN,
    FIGHTER_STATES.WAKEUP,
    FIGHTER_STATES.FINISHER,
    FIGHTER_STATES.DOWN,
  ]),
  [FIGHTER_STATES.FINISHER]: new Set([
    FIGHTER_STATES.FINISHER,
    FIGHTER_STATES.IDLE,
    FIGHTER_STATES.DOWN,
  ]),
  [FIGHTER_STATES.DOWN]: new Set([
    FIGHTER_STATES.DOWN,
    FIGHTER_STATES.IDLE,
    FIGHTER_STATES.FINISHER,
  ]),
});

export const BASE_MOVES = deepFreeze({
  light: {
    startupFrames: 6,
    activeFrames: 6,
    recoveryFrames: 9,
    range: 98,
    damage: 6,
    push: 150,
    meter: 10,
  },
  heavy: {
    startupFrames: 12,
    activeFrames: 8,
    recoveryFrames: 14,
    range: 132,
    damage: 12,
    push: 260,
    meter: 16,
  },
  special: {
    startupFrames: 16,
    activeFrames: 14,
    recoveryFrames: 17,
    range: 184,
    damage: 17,
    push: 360,
    meter: 22,
  },
  throw: {
    startupFrames: 5,
    activeFrames: 2,
    recoveryFrames: 22,
    range: 76,
    damage: 14,
    push: 180,
    meter: 14,
  },
});

/**
 * Arcade tuning applied to every move instance as it is built. This is the one
 * choke point where all authored per-fighter frame data passes through, so the
 * SF2 Hyper Fighting / MK3 proportions can be dialled in globally without
 * rewriting eight hand-authored move sets:
 *
 *  - individual hits land harder than a modern combo-heavy fighter,
 *  - a whiffed heavy, sweep, uppercut, throw or special leaves a real punish
 *    window because recovery grows faster than damage does,
 *  - light pokes stay fast so neutral still rewards spacing over mashing.
 *
 * Training frame data reads the resolved instance, so what a player sees on
 * screen is always the tuned number.
 */
// Kept in sync with FIGHTER_SCALE in defense.mjs. It lives here as a literal
// because foundation.mjs is the base module and must not import from defense.
export const MOVE_SPATIAL_SCALE = 1.14;

export const ARCADE_TUNING = deepFreeze({
  damage: { light: 1.15, heavy: 1.22, special: 1.14, throw: 1.16 },
  recovery: { light: 1.08, heavy: 1.28, special: 1.32, throw: 1.24 },
  chipDamage: { light: 1, heavy: 1, special: 1.4, throw: 1 },
  // Gravity rose with the faster arcade tempo, so authored launch and juggle
  // velocities are scaled by the same ratio. Hang time — and therefore every
  // authored multi-hit rhythm — is preserved exactly.
  launchVelocity: 2180 / 1850,
});

// v4.4 TEMPO: a swing that touches nothing pays extra recovery, scaled by the
// move's own recovery so a whiffed jab costs a few frames and a whiffed special
// costs a real punish window. Confirmed hits and blocked hits pay nothing, so
// reads and pressure keep their exact frame data; only mashing gets slower.
// Moves that launch a projectile, deploy a trap or hurl an object connect
// later through what they spawned, so they are exempt.
export const WHIFF_RECOVERY_TAX = deepFreeze({
  light: 0.5,
  heavy: 0.35,
  special: 0.3,
  throw: 0.25,
});
export const WHIFF_RECOVERY_MINIMUM_FRAMES = 2;
// After a whiffed swing runs its course the fighter must RE-ARM: for this many
// frames he can walk, dash and block but cannot start another attack. A swing
// that made contact (hit or block) re-arms instantly so links and pressure
// keep their exact timing.
export const ATTACK_REARM_FRAMES = 4;

// BLOCK ECONOMY invariant: a move that carries reversal invulnerability must
// be negative on block by at least this much. Before 5.0's sweep the three
// rushdown EX back specials (BEAT SKIP EX, LIVE WIRE EX, BUFFER SKIP EX) were
// 2-3f startup, invulnerable from frame 0, cross-through AND +9/+10 on block:
// block it and you still lose your turn, press and you get hit through it.
// Every kit's numbers are hand-tuned to satisfy this (the kit test asserts the
// clamp never fires on authored data); the clamp here is the backstop so a
// future kit edit cannot ship a plus-on-block invulnerable move by accident.
export const REVERSAL_BLOCK_DISADVANTAGE_FRAMES = 3;

export function whiffRecoveryFrames(attack) {
  if (!attack || attack.projectile || attack.trap || attack.throwableId) return 0;
  const kind = WHIFF_RECOVERY_TAX[attack.baseKind] !== undefined ? attack.baseKind : attack.kind;
  const scale = WHIFF_RECOVERY_TAX[kind];
  if (!scale) return 0;
  return Math.max(WHIFF_RECOVERY_MINIMUM_FRAMES, Math.round((attack.recoveryFrames || 0) * scale));
}

function tuned(table, kind, value, { round = false, minimum = 0 } = {}) {
  const scale = table[kind] ?? 1;
  const scaled = value * scale;
  const result = round ? Math.round(scaled) : Number(scaled.toFixed(3));
  return Math.max(minimum, result);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

export function createAttackInstance(kind, overrides = {}) {
  const source = BASE_MOVES[kind];
  if (!source) throw new Error(`Unknown move kind: ${kind}`);
  const move = { ...source, ...overrides };
  const tuningKind = BASE_MOVES[move.baseKind] ? move.baseKind : kind;
  move.damage = tuned(ARCADE_TUNING.damage, tuningKind, move.damage, { minimum: 1 });
  move.recoveryFrames = tuned(ARCADE_TUNING.recovery, tuningKind, move.recoveryFrames, { round: true, minimum: 4 });
  if (move.reversalInvulnerableFrames > 0) {
    move.recoveryFrames = Math.max(move.recoveryFrames, (move.blockstunFrames || 0) + REVERSAL_BLOCK_DISADVANTAGE_FRAMES);
  }
  if (move.chipDamage) {
    move.chipDamage = tuned(ARCADE_TUNING.chipDamage, tuningKind, move.chipDamage, { minimum: 0 });
  }
  for (const field of ["launchVelocityY", "juggleLift"]) {
    if (Number.isFinite(move[field])) move[field] = Math.round(move[field] * ARCADE_TUNING.launchVelocity);
  }
  // Reach and impulse scale with the fighter so spacing relationships survive.
  for (const field of ["range", "push", "advanceSpeed", "retreatSpeed", "launchVelocityY", "juggleLift"]) {
    if (Number.isFinite(move[field])) move[field] = Math.round(move[field] * MOVE_SPATIAL_SCALE);
  }
  const totalFrames = move.startupFrames + move.activeFrames + move.recoveryFrames;
  return {
    kind,
    ...move,
    totalFrames,
    activeStartFrame: move.startupFrames,
    activeEndFrame: move.startupFrames + move.activeFrames,
    duration: totalFrames * SIMULATION_STEP_SECONDS,
    active: [
      move.startupFrames * SIMULATION_STEP_SECONDS,
      (move.startupFrames + move.activeFrames) * SIMULATION_STEP_SECONDS,
    ],
  };
}

export class FixedStepClock {
  constructor({
    hz = SIMULATION_HZ,
    maxFrameSeconds = 0.25,
    maxCatchUpSteps = 8,
  } = {}) {
    this.hz = hz;
    this.stepSeconds = 1 / hz;
    this.maxFrameSeconds = maxFrameSeconds;
    this.maxCatchUpSteps = maxCatchUpSteps;
    this.accumulator = 0;
    this.tick = 0;
    this.droppedSeconds = 0;
  }

  advance(frameSeconds, step) {
    const raw = Number.isFinite(frameSeconds) ? Math.max(0, frameSeconds) : 0;
    const accepted = Math.min(raw, this.maxFrameSeconds);
    this.droppedSeconds += raw - accepted;
    this.accumulator += accepted;
    let steps = 0;

    while (this.accumulator + 1e-10 >= this.stepSeconds && steps < this.maxCatchUpSteps) {
      this.accumulator -= this.stepSeconds;
      if (this.accumulator < 0 && this.accumulator > -1e-9) this.accumulator = 0;
      this.tick += 1;
      step(this.stepSeconds, this.tick);
      steps += 1;
    }

    if (this.accumulator + 1e-10 >= this.stepSeconds) {
      const wholeSteps = Math.floor((this.accumulator + 1e-10) / this.stepSeconds);
      const discarded = wholeSteps * this.stepSeconds;
      this.accumulator -= discarded;
      this.droppedSeconds += discarded;
    }

    return {
      steps,
      tick: this.tick,
      alpha: Math.min(1, this.accumulator / this.stepSeconds),
      droppedSeconds: this.droppedSeconds,
    };
  }

  stepOnce(step) {
    this.tick += 1;
    step(this.stepSeconds, this.tick);
    return this.tick;
  }

  reset() {
    this.accumulator = 0;
    this.tick = 0;
    this.droppedSeconds = 0;
  }
}

export class FrameInputBuffer {
  constructor(windowFrames = DEFAULT_INPUT_BUFFER_FRAMES) {
    this.windowFrames = windowFrames;
    this.entries = [];
  }

  push(action, frame, payload = null) {
    this.entries = this.entries.filter((entry) => entry.action !== action);
    this.entries.push({ action, frame, payload });
  }

  prune(frame) {
    this.entries = this.entries.filter((entry) => frame >= entry.frame && frame - entry.frame <= this.windowFrames);
  }

  consume(actions, frame) {
    this.prune(frame);
    const order = Array.isArray(actions) ? actions : [actions];
    for (const action of order) {
      let selected = -1;
      for (let index = this.entries.length - 1; index >= 0; index -= 1) {
        if (this.entries[index].action === action) {
          selected = index;
          break;
        }
      }
      if (selected >= 0) return this.entries.splice(selected, 1)[0];
    }
    return null;
  }

  has(action, frame) {
    this.prune(frame);
    return this.entries.some((entry) => entry.action === action);
  }

  clear() {
    this.entries.length = 0;
  }

  snapshot() {
    return this.entries.map((entry) => ({ ...entry }));
  }

  restore(entries = []) {
    this.entries = entries.map((entry) => ({ ...entry }));
  }
}

export class DeterministicRng {
  constructor(seed = 0x5f3759df) {
    this.setState(seed);
  }

  setState(seed) {
    const normalized = Number(seed) >>> 0;
    this.state = normalized || 0x6d2b79f5;
  }

  getState() {
    return this.state >>> 0;
  }

  nextUint32() {
    let value = this.state >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  nextFloat() {
    return this.nextUint32() / 0x100000000;
  }
}

export function hashSeed(...parts) {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const text = String(part);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0 || 1;
}

export function transitionFighterState(fighter, nextState, tick, { force = false } = {}) {
  if (!Object.values(FIGHTER_STATES).includes(nextState)) throw new Error(`Unknown fighter state: ${nextState}`);
  const current = fighter.combatState || FIGHTER_STATES.IDLE;
  if (current === nextState) {
    fighter.stateFrame = (fighter.stateFrame || 0) + 1;
    return false;
  }
  if (!force && !FIGHTER_STATE_TRANSITIONS[current]?.has(nextState)) return false;
  fighter.previousCombatState = current;
  fighter.combatState = nextState;
  fighter.stateFrame = 0;
  fighter.stateEnteredTick = tick;
  return true;
}
