import { performance } from "node:perf_hooks";

export const INPUT = Object.freeze({
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  LIGHT: 1 << 2,
  HEAVY: 1 << 3,
  SPECIAL: 1 << 4,
  GUARD: 1 << 5,
});

const STAGE_MIN = 80_000;
const STAGE_MAX = 1_200_000;
const FLOOR = 0;

function nextRng(value) {
  return (Math.imul(value >>> 0, 1664525) + 1013904223) >>> 0;
}

function fighter(side) {
  return {
    side,
    x: side === 0 ? 360_000 : 920_000,
    y: FLOOR,
    vx: 0,
    vy: 0,
    facing: side === 0 ? 1 : -1,
    health: 10_000,
    meter: 0,
    attackFrame: 0,
    attackKind: 0,
    attackHit: false,
    hitstun: 0,
    blockstun: 0,
  };
}

export function createBattleState(seed = 237) {
  return { frame: 0, rng: seed >>> 0, impacts: 0, fighters: [fighter(0), fighter(1)] };
}

function attackProfile(kind) {
  if (kind === INPUT.SPECIAL) return { startup: 8, active: 3, total: 28, damage: 980, range: 185_000, stun: 18, meter: 14 };
  if (kind === INPUT.HEAVY) return { startup: 6, active: 2, total: 22, damage: 720, range: 145_000, stun: 14, meter: 10 };
  return { startup: 3, active: 2, total: 14, damage: 390, range: 112_000, stun: 9, meter: 6 };
}

function startAttack(fighterState, input) {
  if (fighterState.attackFrame || fighterState.hitstun || fighterState.blockstun) return;
  const kind = input & INPUT.SPECIAL ? INPUT.SPECIAL
    : input & INPUT.HEAVY ? INPUT.HEAVY
      : input & INPUT.LIGHT ? INPUT.LIGHT : 0;
  if (!kind) return;
  fighterState.attackKind = kind;
  fighterState.attackFrame = 1;
  fighterState.attackHit = false;
}

function moveFighter(fighterState, input) {
  if (fighterState.hitstun || fighterState.blockstun || fighterState.attackFrame) {
    fighterState.vx = Math.trunc(fighterState.vx * 3 / 4);
  } else {
    const direction = (input & INPUT.RIGHT ? 1 : 0) - (input & INPUT.LEFT ? 1 : 0);
    fighterState.vx = direction * 4_100;
  }
  fighterState.x = Math.max(STAGE_MIN, Math.min(STAGE_MAX, fighterState.x + fighterState.vx));
}

export function advanceBattle(previous, inputs) {
  const state = structuredClone(previous);
  const [first, second] = state.fighters;
  first.facing = second.x >= first.x ? 1 : -1;
  second.facing = first.x >= second.x ? 1 : -1;

  for (let side = 0; side < 2; side += 1) {
    const current = state.fighters[side];
    current.hitstun = Math.max(0, current.hitstun - 1);
    current.blockstun = Math.max(0, current.blockstun - 1);
    startAttack(current, inputs[side]);
    moveFighter(current, inputs[side]);
  }

  for (let side = 0; side < 2; side += 1) {
    const attacker = state.fighters[side];
    const defender = state.fighters[1 - side];
    if (!attacker.attackFrame) continue;
    const profile = attackProfile(attacker.attackKind);
    const active = attacker.attackFrame >= profile.startup
      && attacker.attackFrame < profile.startup + profile.active;
    if (active && !attacker.attackHit && Math.abs(attacker.x - defender.x) <= profile.range) {
      const guarded = Boolean(inputs[1 - side] & INPUT.GUARD);
      const damage = guarded ? Math.trunc(profile.damage / 8) : profile.damage;
      defender.health = Math.max(0, defender.health - damage);
      defender.blockstun = guarded ? Math.max(defender.blockstun, Math.trunc(profile.stun * 2 / 3)) : 0;
      defender.hitstun = guarded ? 0 : Math.max(defender.hitstun, profile.stun);
      defender.vx = attacker.facing * (guarded ? 3_200 : 8_400);
      attacker.meter = Math.min(10_000, attacker.meter + profile.meter * 10);
      attacker.attackHit = true;
      state.rng = nextRng(state.rng);
      state.impacts += 1;
    }
    attacker.attackFrame += 1;
    if (attacker.attackFrame > profile.total) {
      attacker.attackFrame = 0;
      attacker.attackKind = 0;
      attacker.attackHit = false;
    }
  }

  state.frame += 1;
  return state;
}

export function saveBattleState(state) {
  return JSON.stringify(state);
}

export function loadBattleState(serialized) {
  return JSON.parse(serialized);
}

export function checksumBattleState(state) {
  const text = saveBattleState(state);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class RollbackPeer {
  constructor({ seed = 237, maxRollbackFrames = 12 } = {}) {
    this.state = createBattleState(seed);
    this.frame = 0;
    this.maxRollbackFrames = maxRollbackFrames;
    this.history = new Map();
    this.localInputs = new Map();
    this.remoteInputs = new Map();
    this.usedRemoteInputs = new Map();
    this.rollbacks = 0;
    this.resimulatedFrames = 0;
    this.maximumRollback = 0;
    this.maximumResimulationMs = 0;
    this.totalResimulationMs = 0;
    this.windowExceeded = 0;
  }

  predictedRemoteInput(frame) {
    if (this.remoteInputs.has(frame)) return this.remoteInputs.get(frame);
    for (let candidate = frame - 1; candidate >= 0; candidate -= 1) {
      if (this.remoteInputs.has(candidate)) return this.remoteInputs.get(candidate);
    }
    return 0;
  }

  advance(localInput) {
    this.localInputs.set(this.frame, localInput);
    this.advanceStoredFrame(this.frame);
  }

  advanceStoredFrame(frame) {
    this.history.set(frame, saveBattleState(this.state));
    const localInput = this.localInputs.get(frame) || 0;
    const remoteInput = this.predictedRemoteInput(frame);
    this.usedRemoteInputs.set(frame, remoteInput);
    this.state = advanceBattle(this.state, [localInput, remoteInput]);
    this.frame = frame + 1;
  }

  receiveRemoteBatch(entries) {
    let earliestMismatch = Infinity;
    for (const [frame, input] of entries) {
      this.remoteInputs.set(frame, input);
      if (frame < this.frame && this.usedRemoteInputs.get(frame) !== input) {
        earliestMismatch = Math.min(earliestMismatch, frame);
      }
    }
    if (earliestMismatch !== Infinity) this.rollback(earliestMismatch);
  }

  rollback(fromFrame) {
    const rollbackFrames = this.frame - fromFrame;
    if (rollbackFrames > this.maxRollbackFrames || !this.history.has(fromFrame)) {
      this.windowExceeded += 1;
      return false;
    }
    const targetFrame = this.frame;
    this.state = loadBattleState(this.history.get(fromFrame));
    this.frame = fromFrame;
    for (const frame of [...this.history.keys()]) if (frame >= fromFrame) this.history.delete(frame);
    const started = performance.now();
    while (this.frame < targetFrame) this.advanceStoredFrame(this.frame);
    const elapsed = performance.now() - started;
    this.rollbacks += 1;
    this.resimulatedFrames += rollbackFrames;
    this.maximumRollback = Math.max(this.maximumRollback, rollbackFrames);
    this.maximumResimulationMs = Math.max(this.maximumResimulationMs, elapsed);
    this.totalResimulationMs += elapsed;
    return true;
  }

  metrics() {
    return {
      rollbacks: this.rollbacks,
      resimulatedFrames: this.resimulatedFrames,
      maximumRollback: this.maximumRollback,
      maximumResimulationMs: Number(this.maximumResimulationMs.toFixed(4)),
      averageResimulationMs: Number((this.rollbacks ? this.totalResimulationMs / this.rollbacks : 0).toFixed(4)),
      windowExceeded: this.windowExceeded,
      stateBytes: Buffer.byteLength(saveBattleState(this.state)),
      checksum: checksumBattleState(this.state),
    };
  }
}

export function scriptedInput(player, frame) {
  const phase = (frame + player * 17) % 180;
  let input = phase < 48 ? (player === 0 ? INPUT.RIGHT : INPUT.LEFT)
    : phase < 82 ? 0
      : phase < 118 ? (player === 0 ? INPUT.LEFT : INPUT.RIGHT) : 0;
  if (frame % (player ? 41 : 37) === 0) input |= INPUT.LIGHT;
  if (frame % (player ? 73 : 67) === 0) input |= INPUT.HEAVY;
  if (frame % (player ? 109 : 97) === 0) input |= INPUT.SPECIAL;
  if ((frame + player * 13) % 53 < 9) input |= INPUT.GUARD;
  return input;
}

export function runRollbackSpike({
  frames = 3600,
  seed = 237,
  minimumLatency = 2,
  maximumLatency = 10,
  lossPercent = 5,
  redundancyFrames = 8,
  maxRollbackFrames = 12,
} = {}) {
  const actualInputs = [[], []];
  for (let frame = 0; frame < frames; frame += 1) {
    actualInputs[0].push(scriptedInput(0, frame));
    actualInputs[1].push(scriptedInput(1, frame));
  }

  let authoritative = createBattleState(seed);
  for (let frame = 0; frame < frames; frame += 1) {
    authoritative = advanceBattle(authoritative, [actualInputs[0][frame], actualInputs[1][frame]]);
  }

  let networkRng = (seed ^ 0xa5a5a5a5) >>> 0;
  const deliveries = new Map();
  for (let sendFrame = 0; sendFrame < frames; sendFrame += 1) {
    networkRng = nextRng(networkRng);
    if (networkRng % 100 < lossPercent) continue;
    networkRng = nextRng(networkRng);
    const latency = minimumLatency + networkRng % (maximumLatency - minimumLatency + 1);
    const entries = [];
    for (let frame = Math.max(0, sendFrame - redundancyFrames + 1); frame <= sendFrame; frame += 1) {
      entries.push([frame, actualInputs[1][frame]]);
    }
    const deliveryFrame = sendFrame + latency;
    const scheduled = deliveries.get(deliveryFrame) || [];
    scheduled.push(entries);
    deliveries.set(deliveryFrame, scheduled);
  }

  const peer = new RollbackPeer({ seed, maxRollbackFrames });
  for (let frame = 0; frame < frames; frame += 1) {
    for (const packet of deliveries.get(frame) || []) peer.receiveRemoteBatch(packet);
    peer.advance(actualInputs[0][frame]);
  }
  for (let delivery = frames; delivery <= frames + maximumLatency; delivery += 1) {
    for (const packet of deliveries.get(delivery) || []) peer.receiveRemoteBatch(packet);
  }
  const finalEntries = [];
  for (let frame = Math.max(0, frames - maxRollbackFrames); frame < frames; frame += 1) {
    finalEntries.push([frame, actualInputs[1][frame]]);
  }
  peer.receiveRemoteBatch(finalEntries);

  return {
    settings: { frames, minimumLatency, maximumLatency, lossPercent, redundancyFrames, maxRollbackFrames },
    authoritativeChecksum: checksumBattleState(authoritative),
    peerChecksum: checksumBattleState(peer.state),
    exact: checksumBattleState(authoritative) === checksumBattleState(peer.state),
    metrics: peer.metrics(),
  };
}
