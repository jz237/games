// R2.1 STREETS wave 19 — spectator seats. Pure protocol + buffering logic for
// the third-seat "watch" role: the host mirrors its match config, then batches
// CONFIRMED input pairs (the wave-18 recorder's stream) over the signaling
// relay; a spectator seeds the identical deterministic sim and plays the
// batches through the replay driver a beat behind live. No DOM, no clocks,
// no rng — game.js owns transport, pacing and presentation.

import { decodeInputStream, encodeInputStream } from "./replay.mjs";

export const SPECTATE_PROTOCOL_LEVEL = 1;
// Steady cadence: one batch per second (60 confirmed frames) keeps the host
// socket far inside the room's 120-messages-per-minute budget with pings and
// control traffic riding alongside.
export const SPECTATE_BATCH_FRAMES = 60;
// Catch-up resends stay far under the 32 KiB signaling frame cap. Worst-case
// RLE token is "ffffx999999." (12 bytes per frame, no runs) — the planner
// assumes that worst case so a chunk can never overflow the cap.
export const SPECTATE_BYTE_BUDGET = 24 * 1024;
export const SPECTATE_WORST_BYTES_PER_FRAME = 12;
export const SPECTATE_MAX_WATCHERS = 4;

const FIGHTER_ID_PATTERN = /^[a-z0-9-]{1,24}$/u;

// --------------------------------------------------------------------------
// Header — the seeding context a spectator needs to build the exact match the
// two players are running: everything startOnlineMatch reads from the shared
// config, plus both version stamps so a mismatched build refuses cleanly.
// --------------------------------------------------------------------------

export function buildSpectateHeader(config, { gameVersion = "", protocol = 0 } = {}) {
  if (!config || typeof config !== "object") return null;
  return {
    type: "spectate",
    kind: "header",
    level: SPECTATE_PROTOCOL_LEVEL,
    matchId: String(config.matchId || ""),
    seed: Number(config.seed) | 0,
    picks: [String(config.picks?.[0] ?? ""), String(config.picks?.[1] ?? "")],
    palettes: [config.palettes?.[0] === 1 ? 1 : 0, config.palettes?.[1] === 1 ? 1 : 0],
    stage: String(config.stage || ""),
    inputDelay: Math.max(0, Math.min(4, Number(config.inputDelay) | 0)),
    mutators: Array.isArray(config.mutators) ? config.mutators.map(String) : [],
    gameVersion: String(gameVersion),
    protocol: Number(protocol) | 0,
  };
}

export function sanitizeSpectateHeader(raw) {
  if (!raw || typeof raw !== "object" || raw.kind !== "header") return null;
  const matchId = String(raw.matchId || "");
  const picks = [String(raw.picks?.[0] ?? ""), String(raw.picks?.[1] ?? "")];
  if (matchId.length < 12 || matchId.length > 64) return null;
  if (!picks.every((id) => FIGHTER_ID_PATTERN.test(id))) return null;
  const stage = String(raw.stage || "");
  if (!/^[a-z0-9-]{1,24}$/u.test(stage)) return null;
  return {
    level: Number(raw.level) >= 1 ? Number(raw.level) | 0 : 1,
    matchId,
    seed: Number(raw.seed) | 0,
    picks,
    palettes: [raw.palettes?.[0] === 1 ? 1 : 0, raw.palettes?.[1] === 1 ? 1 : 0],
    stage,
    inputDelay: Math.max(0, Math.min(4, Number(raw.inputDelay) | 0)),
    mutators: Array.isArray(raw.mutators) ? raw.mutators.slice(0, 8).map(String) : [],
    gameVersion: String(raw.gameVersion || ""),
    protocol: Number(raw.protocol) | 0,
  };
}

// --------------------------------------------------------------------------
// Batches — confirmed frame ranges, RLE-encoded with the replay codec.
// --------------------------------------------------------------------------

export function encodeSpectateBatch(matchId, start, frames0, frames1) {
  if (!Array.isArray(frames0) || !frames0.length || frames0.length !== frames1?.length) return null;
  return {
    type: "spectate",
    kind: "frames",
    matchId: String(matchId || ""),
    start: Math.max(0, Number(start) | 0),
    count: frames0.length,
    p0: encodeInputStream(frames0),
    p1: encodeInputStream(frames1),
  };
}

export function decodeSpectateBatch(raw) {
  if (!raw || typeof raw !== "object" || raw.kind !== "frames") return null;
  const start = Number(raw.start);
  const count = Number(raw.count);
  if (!Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1 || count > 100_000) return null;
  let frames0;
  let frames1;
  try {
    frames0 = decodeInputStream(String(raw.p0 ?? ""));
    frames1 = decodeInputStream(String(raw.p1 ?? ""));
  } catch {
    return null;
  }
  if (frames0.length !== count || frames1.length !== count) return null;
  return { matchId: String(raw.matchId || ""), start, count, frames0, frames1 };
}

export function encodeSpectateEnd(matchId, { reason = "ended", winner = null } = {}) {
  return {
    type: "spectate",
    kind: "end",
    matchId: String(matchId || ""),
    reason: ["ended", "host-left", "expired"].includes(reason) ? reason : "ended",
    winner: winner === 0 || winner === 1 ? winner : null,
  };
}

// --------------------------------------------------------------------------
// Chunk planning — pure math for catch-up sends (late joiner or gap repair).
// Splits [start, start+total) into ranges that respect BOTH the frame batch
// preference and the worst-case byte budget of a signaling frame.
// --------------------------------------------------------------------------

export function planSpectateChunks(start, total, {
  byteBudget = SPECTATE_BYTE_BUDGET,
  worstBytesPerFrame = SPECTATE_WORST_BYTES_PER_FRAME,
} = {}) {
  const first = Math.max(0, Number(start) | 0);
  const frames = Math.max(0, Number(total) | 0);
  if (!frames) return [];
  // Two streams per message share the budget; overhead for the JSON envelope
  // is padded into the per-frame worst case.
  const perMessage = Math.max(1, Math.floor(byteBudget / (worstBytesPerFrame * 2)));
  const chunks = [];
  for (let offset = 0; offset < frames; offset += perMessage) {
    chunks.push({ start: first + offset, count: Math.min(perMessage, frames - offset) });
  }
  return chunks;
}

// --------------------------------------------------------------------------
// Spectator-side feed: an append-only confirmed stream. Batches may overlap
// (host resends are cheap insurance) — only genuinely new frames append. A
// future-gapped batch is refused and remembered so the client can ask the
// host for a resend from the frontier.
// --------------------------------------------------------------------------

export function createSpectatorFeed() {
  return {
    header: null,
    frames0: [],
    frames1: [],
    ended: false,
    endReason: "",
    endWinner: null,
    gapAt: -1,
  };
}

export function feedSpectateHeader(feed, header) {
  const clean = sanitizeSpectateHeader(header);
  if (!feed || !clean) return false;
  feed.header = clean;
  feed.frames0.length = 0;
  feed.frames1.length = 0;
  feed.ended = false;
  feed.endReason = "";
  feed.endWinner = null;
  feed.gapAt = -1;
  return true;
}

export function feedSpectateBatch(feed, raw) {
  if (!feed?.header || feed.ended) return { accepted: false, appended: 0, gap: false };
  const batch = decodeSpectateBatch(raw);
  if (!batch || batch.matchId !== feed.header.matchId) return { accepted: false, appended: 0, gap: false };
  const frontier = feed.frames0.length;
  if (batch.start > frontier) {
    feed.gapAt = frontier;
    return { accepted: false, appended: 0, gap: true };
  }
  const skip = frontier - batch.start;
  if (skip >= batch.count) return { accepted: true, appended: 0, gap: false }; // pure duplicate
  for (let index = skip; index < batch.count; index += 1) {
    feed.frames0.push(batch.frames0[index]);
    feed.frames1.push(batch.frames1[index]);
  }
  feed.gapAt = -1;
  return { accepted: true, appended: batch.count - skip, gap: false };
}

export function feedSpectateEnd(feed, raw) {
  if (!feed || !raw || typeof raw !== "object" || raw.kind !== "end") return false;
  if (feed.header && String(raw.matchId || "") !== feed.header.matchId) return false;
  feed.ended = true;
  feed.endReason = ["ended", "host-left", "expired"].includes(raw.reason) ? raw.reason : "ended";
  feed.endWinner = raw.winner === 0 || raw.winner === 1 ? raw.winner : null;
  return true;
}

// --------------------------------------------------------------------------
// Host-side helper: pull a contiguous confirmed range out of the wave-18
// recorder's frame map. Returns null unless EVERY frame in the range exists —
// a hole means the range is not confirmed yet.
// --------------------------------------------------------------------------

export function collectConfirmedRange(frameMap, start, endExclusive) {
  if (!frameMap || endExclusive <= start) return null;
  const frames0 = [];
  const frames1 = [];
  for (let frame = start; frame < endExclusive; frame += 1) {
    const pair = frameMap.get(frame);
    if (!pair) return null;
    frames0.push(Number(pair[0]) & 0xffff);
    frames1.push(Number(pair[1]) & 0xffff);
  }
  return { frames0, frames1 };
}
