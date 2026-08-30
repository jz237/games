// R2.1 STREETS — Online quality-of-life logic: first-to-N set scoring, the
// connection-quality tiering, and the sanitizers for the versioned lobby /
// control-channel message extensions. Pure and deterministic: no DOM, no
// clocks, no rng. game.js owns all transport and presentation.

// --------------------------------------------------------------------------
// First-to-N sets. Length 1 means "single match" — set bookkeeping stays
// dormant and no scoreboard card shows. Scores are indexed by SIDE (0 = host /
// P1 seat, 1 = guest / P2 seat), which is stable across every match in a room.
// --------------------------------------------------------------------------

export const SET_LENGTHS = Object.freeze([1, 2, 3, 5]);

export function normalizeSetLength(value) {
  const numeric = Number(value);
  return SET_LENGTHS.includes(numeric) ? numeric : 1;
}

export function createSetState(length = 1) {
  return {
    length: normalizeSetLength(length),
    scores: [0, 0],
    history: [],
    lastMatchKey: "",
  };
}

export function setWinnerSide(set) {
  if (!set || set.length <= 1) return -1;
  if (set.scores[0] >= set.length) return 0;
  if (set.scores[1] >= set.length) return 1;
  return -1;
}

export function setComplete(set) {
  return setWinnerSide(set) >= 0;
}

// Which sides are ONE win away from taking the set (only meaningful while the
// set is still live).
export function setPointSides(set) {
  if (!set || set.length <= 1 || setComplete(set)) return [false, false];
  return [set.scores[0] === set.length - 1, set.scores[1] === set.length - 1];
}

/**
 * Record one finished match into the set. `matchKey` dedupes the fold (match
 * id online, match serial offline) so a re-entered result can never double
 * count. Returns a summary of the set AFTER the win, or null when the record
 * was refused (duplicate, finished set, inert single-match session).
 */
export function recordSetWin(set, side, { matchKey = "", picks = [], rounds = [0, 0] } = {}) {
  if (!set || (side !== 0 && side !== 1)) return null;
  if (set.length <= 1) return null;
  if (setComplete(set)) return null;
  const key = String(matchKey || "");
  if (key && set.lastMatchKey === key) return null;
  set.lastMatchKey = key;
  set.scores[side] += 1;
  set.history.push({
    winner: side,
    picks: [String(picks[0] ?? ""), String(picks[1] ?? "")],
    rounds: [Number(rounds[0]) || 0, Number(rounds[1]) || 0],
  });
  if (set.history.length > 32) set.history.shift();
  return setSummary(set);
}

export function setSummary(set) {
  if (!set) return null;
  return {
    length: set.length,
    scores: [...set.scores],
    history: set.history.map((entry) => ({ ...entry, picks: [...entry.picks], rounds: [...entry.rounds] })),
    setPoint: setPointSides(set),
    complete: setComplete(set),
    winnerSide: setWinnerSide(set),
  };
}

// Control-channel sync payload for the set (host → guest piggyback on
// match-start). Sanitized on receive so a hostile or stale peer can never
// inject junk shapes.
export function sanitizeSetSync(raw, length = 1) {
  const set = createSetState(length);
  if (!raw || typeof raw !== "object") return set;
  const scores = Array.isArray(raw.scores) ? raw.scores : [];
  set.scores = [
    Math.max(0, Math.min(9, Number(scores[0]) || 0)),
    Math.max(0, Math.min(9, Number(scores[1]) || 0)),
  ];
  if (Array.isArray(raw.history)) {
    set.history = raw.history.slice(-32).map((entry) => ({
      winner: entry?.winner === 1 ? 1 : 0,
      picks: [String(entry?.picks?.[0] ?? ""), String(entry?.picks?.[1] ?? "")],
      rounds: [Number(entry?.rounds?.[0]) || 0, Number(entry?.rounds?.[1]) || 0],
    }));
  }
  return set;
}

// --------------------------------------------------------------------------
// Connection quality. Four tiers from best to worst; the badge renders
// (4 - tier) lit bars. The blend takes the WORST of the individual factors —
// a clean ping with deep rollbacks is still a rough match.
// --------------------------------------------------------------------------

export const CONNECTION_TIERS = Object.freeze([
  Object.freeze({ id: 0, label: "GREEN", grade: "green" }),
  Object.freeze({ id: 1, label: "GOOD", grade: "green" }),
  Object.freeze({ id: 2, label: "SHAKY", grade: "yellow" }),
  Object.freeze({ id: 3, label: "ROUGH", grade: "red" }),
]);

const PING_TIERS = [60, 110, 180];
const JITTER_TIERS = [12, 28, 48];
const ROLLBACK_TIERS = [2, 4, 7];
const STALL_TIERS = [0, 4, 12];

function tierFor(value, thresholds) {
  if (!Number.isFinite(value)) return 0;
  for (let tier = 0; tier < thresholds.length; tier += 1) {
    if (value <= thresholds[tier]) return tier;
  }
  return thresholds.length;
}

/**
 * Blend a ping/jitter sample with the rollback session's recent behaviour
 * into a single 0 (green) .. 3 (red) tier.
 * - pingMs: EWMA round-trip in milliseconds
 * - jitterMs: EWMA of |ping - previous ping|
 * - rollbackDepth: deepest recent rollback, in frames
 * - stalledRecent: stalled frames accumulated over the recent window
 */
export function connectionTier({ pingMs = null, jitterMs = null, rollbackDepth = 0, stalledRecent = 0 } = {}) {
  const tier = Math.max(
    tierFor(pingMs, PING_TIERS),
    tierFor(jitterMs, JITTER_TIERS),
    tierFor(rollbackDepth, ROLLBACK_TIERS),
    tierFor(stalledRecent, STALL_TIERS),
  );
  return { tier, ...CONNECTION_TIERS[tier] };
}

// Standard exponential moving average with a null-safe seed.
export function ewma(previous, sample, alpha = 0.3) {
  if (!Number.isFinite(sample)) return previous;
  if (!Number.isFinite(previous)) return sample;
  return previous + (sample - previous) * alpha;
}

// --------------------------------------------------------------------------
// Lobby / control message extensions. Older peers omit every one of these
// fields; each sanitizer's default is exactly the pre-QoL behaviour, so a
// mixed-version room degrades to the 2.3 flow instead of breaking.
// --------------------------------------------------------------------------

export const ONLINE_QOL_LEVEL = 1;

// Optional lobby-state fields → normalized. qol 0 means "older peer".
export function sanitizeLobbyQol(message = {}) {
  const ping = Number(message?.ping);
  return {
    qol: Number(message?.qol) >= 1 ? 1 : 0,
    ping: Number.isFinite(ping) && ping >= 0 ? Math.min(9999, Math.round(ping)) : null,
    setLength: normalizeSetLength(message?.setLength),
  };
}

// The CHANGE FIGHTERS return-to-lobby control message.
export function validReturnLobbyMessage(message, matchId) {
  return Boolean(
    message
    && message.type === "return-lobby"
    && typeof message.matchId === "string"
    && message.matchId.length > 0
    && message.matchId === matchId,
  );
}

// Loser-picks-stage: given both peers' QoL levels and the side that lost the
// last finished match, who owns the stage cursor? Host keeps it (the 2.3
// rule) until both peers speak QoL and a match has actually been lost.
export function stagePickerRole({ localQol = ONLINE_QOL_LEVEL, remoteQol = 0, lastLoserRole = "" } = {}) {
  if (localQol >= 1 && remoteQol >= 1 && (lastLoserRole === "host" || lastLoserRole === "guest")) {
    return lastLoserRole;
  }
  return "host";
}
