// R2.1 STREETS — Replay Theater core. Everything in here is pure data logic:
// the .fbr record format, the RLE input-stream codec, the version-stamp
// compatibility gate and the localStorage ring policy. No DOM, no Date.now in
// any decision path (timestamps are caller-provided metadata only), no rng.
//
// A replay is just deterministic seeding context plus the confirmed 16-bit
// input pair per simulation frame. The recorder in game.js overwrites frames
// on rollback resimulation so only confirmed values survive; by the time a
// record reaches this module the streams are plain arrays.

export const REPLAY_FORMAT_VERSION = 1;
export const REPLAY_RING_LIMIT = 10;
export const REPLAY_FILE_EXTENSION = ".fbr";

const REPLAY_KINDS = new Set(["offline", "online"]);
const REPLAY_MODES = new Set(["versus", "arcade", "online"]);

function finiteInt(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
}

// --------------------------------------------------------------------------
// Input stream codec — run-length encoded hex. Fight input streams are long
// runs of identical words (idle frames, held walks), so `<hex>` for a single
// frame and `<hex>x<count>` for a run keeps a full match to a few KB.
// --------------------------------------------------------------------------

export function encodeInputStream(values = []) {
  const tokens = [];
  let index = 0;
  while (index < values.length) {
    const word = Number(values[index]) & 0xffff;
    let run = 1;
    while (index + run < values.length && (Number(values[index + run]) & 0xffff) === word) run += 1;
    tokens.push(run > 1 ? `${word.toString(16)}x${run}` : word.toString(16));
    index += run;
  }
  return tokens.join(".");
}

export function decodeInputStream(text = "") {
  if (typeof text !== "string") throw new Error("Replay stream must be a string.");
  if (!text.length) return [];
  const values = [];
  for (const token of text.split(".")) {
    const [word, count] = token.split("x");
    const value = Number.parseInt(word, 16);
    const run = count === undefined ? 1 : Number.parseInt(count, 10);
    if (!Number.isFinite(value) || value < 0 || value > 0xffff) throw new Error(`Replay stream has an invalid word: ${token}`);
    if (!Number.isFinite(run) || run < 1 || run > 1_000_000) throw new Error(`Replay stream has an invalid run: ${token}`);
    for (let repeat = 0; repeat < run; repeat += 1) values.push(value);
  }
  return values;
}

// --------------------------------------------------------------------------
// Header — the seeding context that makes the input streams replayable, plus
// the mandatory version stamps. `protocol` is ROLLBACK_PROTOCOL_VERSION and
// `gameVersion` is the shipping build tag: EITHER mismatch refuses playback,
// because any tuning change invalidates old input streams.
// --------------------------------------------------------------------------

export function createReplayHeader({
  kind = "offline",
  mode = "versus",
  protocol = 0,
  gameVersion = "",
  picks = [],
  palettes = [0, 0],
  stage = "somerset",
  mutators = [],
  stageWeaponsEnabled = true,
  startPhase = { phase: "fight", phaseTime: 0 },
  startTick = 0,
  matchSerial = 0,
  arcadeCurrent = 0,
  arcadeOpponent = "versus",
  arcadeBoss = false,
  seed = 0,
  inputDelay = 0,
  matchId = "",
  recordedAt = 0,
} = {}) {
  return {
    format: REPLAY_FORMAT_VERSION,
    kind: REPLAY_KINDS.has(kind) ? kind : "offline",
    mode: REPLAY_MODES.has(mode) ? mode : "versus",
    protocol: finiteInt(protocol),
    gameVersion: String(gameVersion),
    picks: [String(picks[0] ?? ""), String(picks[1] ?? "")],
    palettes: [palettes?.[0] === 1 ? 1 : 0, palettes?.[1] === 1 ? 1 : 0],
    stage: String(stage),
    mutators: Array.isArray(mutators) ? mutators.map(String) : [],
    stageWeaponsEnabled: stageWeaponsEnabled !== false,
    startPhase: {
      phase: startPhase?.phase === "intro" ? "intro" : "fight",
      phaseTime: Math.max(0, Number(startPhase?.phaseTime) || 0),
    },
    startTick: Math.max(0, finiteInt(startTick)),
    matchSerial: finiteInt(matchSerial),
    arcadeCurrent: finiteInt(arcadeCurrent),
    arcadeOpponent: String(arcadeOpponent || "versus"),
    arcadeBoss: Boolean(arcadeBoss),
    seed: finiteInt(seed) >>> 0,
    inputDelay: Math.max(0, Math.min(4, finiteInt(inputDelay))),
    matchId: String(matchId || ""),
    recordedAt: Math.max(0, finiteInt(recordedAt)),
  };
}

/**
 * The playback gate. A replay is only admissible when the format is known and
 * BOTH stamps match the running build — a stale stream would silently play a
 * different fight, which is worse than refusing.
 */
export function replayCompatibility(header, { protocol, gameVersion } = {}) {
  if (!header || typeof header !== "object") return { ok: false, reason: "MISSING HEADER" };
  if (header.format !== REPLAY_FORMAT_VERSION) {
    return { ok: false, reason: `UNKNOWN REPLAY FORMAT ${header.format ?? "?"}` };
  }
  if (finiteInt(header.protocol, -1) !== finiteInt(protocol, -2)) {
    return { ok: false, reason: `ROLLBACK PROTOCOL MISMATCH · REPLAY V${header.protocol} · GAME V${protocol}` };
  }
  if (String(header.gameVersion) !== String(gameVersion)) {
    return { ok: false, reason: `RECORDED ON ${header.gameVersion || "?"} · THIS BUILD IS ${gameVersion}` };
  }
  return { ok: true, reason: "" };
}

// --------------------------------------------------------------------------
// Full record — header + encoded streams + outcome metadata.
// --------------------------------------------------------------------------

export function createReplayRecord({ header, frames0 = [], frames1 = [], burns = [], outcome = null } = {}) {
  const record = {
    format: REPLAY_FORMAT_VERSION,
    header: createReplayHeader(header || {}),
    frames: frames0.length,
    streams: {
      p0: encodeInputStream(frames0),
      p1: encodeInputStream(frames1),
      burns: encodeInputStream(burns),
    },
    outcome: outcome
      ? {
        winner: outcome.winner === 1 ? 1 : 0,
        rounds: [finiteInt(outcome.rounds?.[0]), finiteInt(outcome.rounds?.[1])],
        healths: [Number(outcome.healths?.[0]) || 0, Number(outcome.healths?.[1]) || 0],
      }
      : null,
  };
  return record;
}

/**
 * Import-side shape check. Returns the normalized record or throws with a
 * player-readable message; the caller shows the message verbatim.
 */
export function validateReplayRecord(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Not a Final Blow replay file.");
  if (raw.format !== REPLAY_FORMAT_VERSION) throw new Error(`Unknown replay format: ${raw.format ?? "?"}.`);
  if (!raw.header || typeof raw.header !== "object") throw new Error("Replay is missing its header.");
  if (!raw.streams || typeof raw.streams !== "object") throw new Error("Replay is missing its input streams.");
  const frames0 = decodeInputStream(raw.streams.p0 ?? "");
  const frames1 = decodeInputStream(raw.streams.p1 ?? "");
  const burns = decodeInputStream(raw.streams.burns ?? "");
  if (!frames0.length || frames0.length !== frames1.length) {
    throw new Error("Replay input streams are empty or unbalanced.");
  }
  if (burns.length && burns.length !== frames0.length) throw new Error("Replay burn stream is unbalanced.");
  const header = createReplayHeader(raw.header);
  if (!header.picks[0] || !header.picks[1]) throw new Error("Replay header names no fighters.");
  return createReplayRecord({
    header,
    frames0,
    frames1,
    burns,
    outcome: raw.outcome && typeof raw.outcome === "object" ? raw.outcome : null,
  });
}

export function decodeReplayStreams(record) {
  return {
    frames0: decodeInputStream(record?.streams?.p0 ?? ""),
    frames1: decodeInputStream(record?.streams?.p1 ?? ""),
    burns: decodeInputStream(record?.streams?.burns ?? ""),
  };
}

// --------------------------------------------------------------------------
// Ring policy — newest first, hard cap, oldest evicted.
// --------------------------------------------------------------------------

export function pushReplayToRing(list, record, limit = REPLAY_RING_LIMIT) {
  const ring = Array.isArray(list) ? list.filter((entry) => entry && typeof entry === "object") : [];
  return [record, ...ring].slice(0, Math.max(1, finiteInt(limit, REPLAY_RING_LIMIT)));
}

export function replaySummary(record, index = 0) {
  const header = record?.header || {};
  return {
    index,
    kind: header.kind || "offline",
    mode: header.mode || "versus",
    picks: [...(header.picks || [])],
    stage: header.stage || "",
    frames: finiteInt(record?.frames),
    seconds: Math.round(finiteInt(record?.frames) / 60),
    winner: record?.outcome ? record.outcome.winner : null,
    rounds: record?.outcome ? [...record.outcome.rounds] : null,
    gameVersion: header.gameVersion || "",
    protocol: finiteInt(header.protocol),
    recordedAt: finiteInt(header.recordedAt),
  };
}

export function replayFileName(record) {
  const header = record?.header || {};
  const picks = (header.picks || []).join("-vs-").replace(/[^a-z0-9-]/gi, "") || "match";
  const stamp = header.recordedAt ? new Date(header.recordedAt).toISOString().slice(0, 10) : "replay";
  return `final-blow-${stamp}-${picks}${REPLAY_FILE_EXTENSION}`;
}
