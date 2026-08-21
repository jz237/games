export const ROLLBACK_PROTOCOL_VERSION = 1;
export const DEFAULT_ROLLBACK_WINDOW = 12;
export const DEFAULT_REDUNDANCY_FRAMES = 8;
export const DEFAULT_PREDICTION_LIMIT = 12;

export const NET_INPUT = Object.freeze({
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  DOWN: 1 << 2,
  GUARD: 1 << 3,
  JUMP: 1 << 4,
  LIGHT: 1 << 5,
  HEAVY: 1 << 6,
  SPECIAL: 1 << 7,
  ENHANCED: 1 << 8,
  THROW: 1 << 9,
  SUPER: 1 << 10,
  FINAL: 1 << 11,
});

const INPUT_FIELDS = Object.freeze([
  ["left", NET_INPUT.LEFT],
  ["right", NET_INPUT.RIGHT],
  ["down", NET_INPUT.DOWN],
  ["guard", NET_INPUT.GUARD],
  ["jump", NET_INPUT.JUMP],
  ["light", NET_INPUT.LIGHT],
  ["heavy", NET_INPUT.HEAVY],
  ["special", NET_INPUT.SPECIAL],
  ["enhanced", NET_INPUT.ENHANCED],
  ["throw", NET_INPUT.THROW],
  ["super", NET_INPUT.SUPER],
  ["final", NET_INPUT.FINAL],
]);

export const HELD_INPUT_MASK = NET_INPUT.LEFT | NET_INPUT.RIGHT | NET_INPUT.DOWN | NET_INPUT.GUARD;
export const PULSE_INPUT_MASK = INPUT_FIELDS.reduce((mask, [, bit]) => mask | bit, 0) & ~HELD_INPUT_MASK;

const PACKET_MAGIC = 0xfb14;
const PACKET_HEADER_BYTES = 16;
const MAX_PACKET_INPUTS = 32;

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function finiteInteger(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

export function normalizeInputDelay(value, fallback = 2) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(4, Math.floor(numeric))) : fallback;
}

export function recommendedInputDelay(roundTripMilliseconds = 0) {
  const oneWayFrames = Math.ceil(Math.max(0, Number(roundTripMilliseconds) || 0) / (1000 / 60) / 2);
  return normalizeInputDelay(oneWayFrames, 2);
}

export function inputToBits(input = {}) {
  let bits = 0;
  for (const [field, bit] of INPUT_FIELDS) if (input[field]) bits |= bit;
  return bits & 0xffff;
}

export function bitsToInput(bits = 0) {
  const normalized = Number(bits) & 0xffff;
  return Object.fromEntries(INPUT_FIELDS.map(([field, bit]) => [field, Boolean(normalized & bit)]));
}

export function predictedInput(bits = 0) {
  return Number(bits) & HELD_INPUT_MASK;
}

export function hashText32(text = "") {
  let hash = 0x811c9dc5;
  for (let index = 0; index < String(text).length; index += 1) {
    hash ^= String(text).charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function matchTagFromId(matchId = "") {
  return hashText32(`FINAL-BLOW-ROLLBACK:${matchId}`);
}

function canonicalNumber(value) {
  if (Number.isNaN(value)) return '"$NaN"';
  if (value === Infinity) return '"$Infinity"';
  if (value === -Infinity) return '"$-Infinity"';
  if (Object.is(value, -0)) return "0";
  return JSON.stringify(value);
}

export function stableStringify(value) {
  if (value === null) return "null";
  if (typeof value === "number") return canonicalNumber(value);
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value instanceof Set) return stableStringify([...value]);
  if (value instanceof Map) return stableStringify([...value.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
  if (typeof value === "object") {
    const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return "null";
}

export function checksumState(value) {
  return hashText32(stableStringify(value)).toString(16).padStart(8, "0");
}

export function serializeRollbackState(value) {
  return stableStringify(value);
}

export function parseRollbackState(serialized) {
  return JSON.parse(serialized, (_key, value) => {
    if (value === "$NaN") return Number.NaN;
    if (value === "$Infinity") return Infinity;
    if (value === "$-Infinity") return -Infinity;
    return value;
  });
}

export function encodeInputPacket({
  matchTag,
  latestFrame,
  acknowledgedFrame = 0,
  inputs,
  redundancyFrames = DEFAULT_REDUNDANCY_FRAMES,
} = {}) {
  const last = finiteInteger(latestFrame);
  const count = Math.max(1, Math.min(MAX_PACKET_INPUTS, finiteInteger(redundancyFrames, DEFAULT_REDUNDANCY_FRAMES)));
  const first = Math.max(0, last - count + 1);
  const actualCount = last - first + 1;
  const packet = new ArrayBuffer(PACKET_HEADER_BYTES + actualCount * 2);
  const view = new DataView(packet);
  view.setUint16(0, PACKET_MAGIC);
  view.setUint8(2, ROLLBACK_PROTOCOL_VERSION);
  view.setUint8(3, actualCount);
  view.setUint32(4, Number(matchTag) >>> 0);
  view.setUint32(8, last >>> 0);
  view.setUint32(12, finiteInteger(acknowledgedFrame) >>> 0);
  for (let index = 0; index < actualCount; index += 1) {
    const frame = first + index;
    view.setUint16(PACKET_HEADER_BYTES + index * 2, Number(inputs?.get(frame) || 0) & 0xffff);
  }
  return packet;
}

export function decodeInputPacket(raw) {
  const bytes = raw instanceof ArrayBuffer
    ? new Uint8Array(raw)
    : ArrayBuffer.isView(raw)
      ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
      : null;
  if (!bytes || bytes.byteLength < PACKET_HEADER_BYTES) throw new Error("Rollback input packet is truncated.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0) !== PACKET_MAGIC) throw new Error("Rollback input packet has an invalid signature.");
  if (view.getUint8(2) !== ROLLBACK_PROTOCOL_VERSION) throw new Error("Rollback input protocol versions do not match.");
  const count = view.getUint8(3);
  if (count < 1 || count > MAX_PACKET_INPUTS || bytes.byteLength !== PACKET_HEADER_BYTES + count * 2) {
    throw new Error("Rollback input packet has an invalid length.");
  }
  const matchTag = view.getUint32(4);
  const latestFrame = view.getUint32(8);
  const acknowledgedFrame = view.getUint32(12);
  if (latestFrame + 1 < count) throw new Error("Rollback input packet frame range is invalid.");
  const firstFrame = latestFrame - count + 1;
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    entries.push([firstFrame + index, view.getUint16(PACKET_HEADER_BYTES + index * 2)]);
  }
  return { matchTag, latestFrame, acknowledgedFrame, entries };
}

export class RollbackSession {
  constructor({
    localSide = 0,
    matchTag = 0,
    inputDelay = 2,
    maxRollbackFrames = DEFAULT_ROLLBACK_WINDOW,
    redundancyFrames = DEFAULT_REDUNDANCY_FRAMES,
    maxPredictionFrames = DEFAULT_PREDICTION_LIMIT,
    initialFrame = 0,
    saveState,
    loadState,
    step,
    checksum = checksumState,
    onRollback = () => {},
    onWindowExceeded = () => {},
  } = {}) {
    if (localSide !== 0 && localSide !== 1) throw new Error("Rollback local side must be 0 or 1.");
    if (![saveState, loadState, step].every((callback) => typeof callback === "function")) {
      throw new Error("Rollback requires saveState, loadState and step callbacks.");
    }
    this.localSide = localSide;
    this.matchTag = Number(matchTag) >>> 0;
    this.inputDelay = normalizeInputDelay(inputDelay);
    this.maxRollbackFrames = Math.max(1, finiteInteger(maxRollbackFrames, DEFAULT_ROLLBACK_WINDOW));
    this.redundancyFrames = Math.max(2, Math.min(MAX_PACKET_INPUTS, finiteInteger(redundancyFrames, DEFAULT_REDUNDANCY_FRAMES)));
    this.maxPredictionFrames = Math.max(this.inputDelay + 2, finiteInteger(maxPredictionFrames, DEFAULT_PREDICTION_LIMIT));
    this.frame = finiteInteger(initialFrame);
    this.saveState = saveState;
    this.loadState = loadState;
    this.step = step;
    this.checksum = checksum;
    this.onRollback = onRollback;
    this.onWindowExceeded = onWindowExceeded;
    this.history = new Map();
    this.localInputs = new Map();
    this.remoteInputs = new Map();
    this.usedRemoteInputs = new Map();
    this.checksums = new Map();
    this.remoteContiguousFrame = this.frame - 1;
    this.latestLocalFrame = this.frame - 1;
    this.latestRemoteAcknowledgement = this.frame - 1;
    this.rollbackCount = 0;
    this.resimulatedFrames = 0;
    this.maximumRollback = 0;
    this.windowExceeded = 0;
    this.stalledFrames = 0;
    this.lastRollbackFrames = 0;
    this.lastRollbackFrame = -Infinity;
    this.totalResimulationMs = 0;
    this.maximumResimulationMs = 0;
  }

  scheduleLocalInput(bits) {
    const target = this.frame + this.inputDelay;
    const incoming = Number(bits) & 0xffff;
    const previous = this.localInputs.get(target);
    const merged = previous === undefined
      ? incoming
      : (incoming & HELD_INPUT_MASK) | ((previous | incoming) & PULSE_INPUT_MASK);
    this.localInputs.set(target, merged);
    this.latestLocalFrame = Math.max(this.latestLocalFrame, target);
    return target;
  }

  predictRemoteInput(frame) {
    if (this.remoteInputs.has(frame)) return this.remoteInputs.get(frame);
    for (let candidate = frame - 1; candidate >= Math.max(0, frame - this.maxPredictionFrames - 2); candidate -= 1) {
      if (this.remoteInputs.has(candidate)) return predictedInput(this.remoteInputs.get(candidate));
    }
    return 0;
  }

  canAdvance() {
    return this.frame <= this.remoteContiguousFrame + this.maxPredictionFrames;
  }

  advance(localInputBits = 0) {
    this.scheduleLocalInput(localInputBits);
    if (!this.canAdvance()) {
      this.stalledFrames += 1;
      return { advanced: false, stalled: true, frame: this.frame };
    }
    this.#advanceStoredFrame(this.frame, false);
    return { advanced: true, stalled: false, frame: this.frame };
  }

  #orderedInputs(localInput, remoteInput) {
    return this.localSide === 0 ? [localInput, remoteInput] : [remoteInput, localInput];
  }

  #advanceStoredFrame(frame, resimulating) {
    this.history.set(frame, clone(this.saveState()));
    const localInput = this.localInputs.get(frame) || 0;
    const remoteInput = this.predictRemoteInput(frame);
    this.usedRemoteInputs.set(frame, remoteInput);
    this.step(this.#orderedInputs(localInput, remoteInput), frame, { resimulating });
    this.frame = frame + 1;
    this.checksums.set(this.frame, this.checksum(this.saveState()));
    this.#prune();
  }

  #prune() {
    const oldestState = Math.max(0, this.frame - this.maxRollbackFrames - 2);
    const oldestInput = Math.max(0, this.frame - Math.max(this.maxRollbackFrames + this.redundancyFrames + 4, 180));
    for (const frame of this.history.keys()) if (frame < oldestState) this.history.delete(frame);
    for (const collection of [this.localInputs, this.remoteInputs, this.usedRemoteInputs, this.checksums]) {
      for (const frame of collection.keys()) if (frame < oldestInput) collection.delete(frame);
    }
  }

  inputPacket() {
    const latestFrame = Math.max(this.frame - 1, this.latestLocalFrame, 0);
    return encodeInputPacket({
      matchTag: this.matchTag,
      latestFrame,
      acknowledgedFrame: Math.max(0, this.remoteContiguousFrame),
      inputs: this.localInputs,
      redundancyFrames: this.redundancyFrames,
    });
  }

  receivePacket(raw) {
    const packet = decodeInputPacket(raw);
    if (packet.matchTag !== this.matchTag) return { accepted: false, reason: "match-tag" };
    this.latestRemoteAcknowledgement = Math.max(this.latestRemoteAcknowledgement, packet.acknowledgedFrame);
    const result = this.receiveRemoteInputs(packet.entries);
    return { accepted: true, ...result };
  }

  receiveRemoteInputs(entries = []) {
    let earliestMismatch = Infinity;
    for (const [rawFrame, rawInput] of entries) {
      const frame = finiteInteger(rawFrame);
      const input = Number(rawInput) & 0xffff;
      this.remoteInputs.set(frame, input);
      if (frame < this.frame && this.usedRemoteInputs.has(frame) && this.usedRemoteInputs.get(frame) !== input) {
        earliestMismatch = Math.min(earliestMismatch, frame);
      }
    }
    while (this.remoteInputs.has(this.remoteContiguousFrame + 1)) this.remoteContiguousFrame += 1;
    const rolledBack = earliestMismatch !== Infinity ? this.rollback(earliestMismatch) : false;
    return { rolledBack, earliestMismatch: earliestMismatch === Infinity ? null : earliestMismatch };
  }

  rollback(fromFrame) {
    const frames = this.frame - fromFrame;
    if (frames <= 0) return false;
    if (frames > this.maxRollbackFrames || !this.history.has(fromFrame)) {
      this.windowExceeded += 1;
      this.onWindowExceeded({ fromFrame, currentFrame: this.frame, frames });
      return false;
    }
    const targetFrame = this.frame;
    const snapshot = clone(this.history.get(fromFrame));
    this.loadState(snapshot);
    this.frame = fromFrame;
    for (const collection of [this.history, this.usedRemoteInputs, this.checksums]) {
      for (const frame of collection.keys()) if (frame >= fromFrame) collection.delete(frame);
    }
    const started = globalThis.performance?.now?.() ?? Date.now();
    while (this.frame < targetFrame) this.#advanceStoredFrame(this.frame, true);
    const elapsed = (globalThis.performance?.now?.() ?? Date.now()) - started;
    this.rollbackCount += 1;
    this.resimulatedFrames += frames;
    this.maximumRollback = Math.max(this.maximumRollback, frames);
    this.lastRollbackFrames = frames;
    this.lastRollbackFrame = targetFrame;
    this.totalResimulationMs += elapsed;
    this.maximumResimulationMs = Math.max(this.maximumResimulationMs, elapsed);
    this.onRollback({ fromFrame, targetFrame, frames });
    return true;
  }

  checksumAt(frame = this.frame) {
    return this.checksums.get(frame) || (frame === this.frame ? this.checksum(this.saveState()) : null);
  }

  exportSync() {
    return { frame: this.frame, state: clone(this.saveState()) };
  }

  importSync({ frame, state } = {}) {
    const nextFrame = finiteInteger(frame);
    this.loadState(clone(state));
    this.frame = nextFrame;
    this.history.clear();
    this.localInputs.clear();
    this.remoteInputs.clear();
    this.usedRemoteInputs.clear();
    this.checksums.clear();
    this.remoteContiguousFrame = nextFrame - 1;
    this.latestLocalFrame = nextFrame - 1;
    this.latestRemoteAcknowledgement = nextFrame - 1;
    this.checksums.set(nextFrame, this.checksum(this.saveState()));
    return this.frame;
  }

  setInputDelay(value) {
    this.inputDelay = normalizeInputDelay(value, this.inputDelay);
    return this.inputDelay;
  }

  metrics() {
    return {
      frame: this.frame,
      inputDelay: this.inputDelay,
      confirmedRemoteFrame: this.remoteContiguousFrame,
      acknowledgedLocalFrame: this.latestRemoteAcknowledgement,
      rollbacks: this.rollbackCount,
      resimulatedFrames: this.resimulatedFrames,
      maximumRollback: this.maximumRollback,
      lastRollbackFrames: this.lastRollbackFrames,
      lastRollbackFrame: this.lastRollbackFrame,
      windowExceeded: this.windowExceeded,
      stalledFrames: this.stalledFrames,
      maximumResimulationMs: Number(this.maximumResimulationMs.toFixed(4)),
      averageResimulationMs: Number((this.rollbackCount ? this.totalResimulationMs / this.rollbackCount : 0).toFixed(4)),
    };
  }
}
