// R2.1 STREETS wave 19 — the Street List: client logic for the public
// challenge board served by the signaling worker (/v1/challenges). This
// module owns the curated tag list mirror, every sanitizer between the wire
// and the UI, and the fetch flows (injectable fetch, same style as
// rooms.mjs). Pure besides the explicit fetch helpers: no DOM, no clocks —
// callers pass `now`.

import { ROOM_ID_PATTERN, ROOM_TOKEN_PATTERN, runtimeSignalingApiUrl } from "./rooms.mjs";

// Curated Philly street tags. The server enforces its own copy — this mirror
// only feeds the picker UI and display labels, so the public board can never
// carry arbitrary user text on either side.
export const STREET_TAGS = Object.freeze([
  Object.freeze({ id: "somerset", label: "SOMERSET" }),
  Object.freeze({ id: "kensington", label: "KENSINGTON" }),
  Object.freeze({ id: "allegheny", label: "ALLEGHENY" }),
  Object.freeze({ id: "lehigh", label: "LEHIGH" }),
  Object.freeze({ id: "broad", label: "BROAD" }),
  Object.freeze({ id: "passyunk", label: "PASSYUNK" }),
  Object.freeze({ id: "girard", label: "GIRARD" }),
  Object.freeze({ id: "frankford", label: "FRANKFORD" }),
  Object.freeze({ id: "tioga", label: "TIOGA" }),
  Object.freeze({ id: "venango", label: "VENANGO" }),
]);

export const CHALLENGE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/u;
export const CHALLENGE_FIGHTER_PATTERN = /^[a-z0-9-]{1,24}$/u;

export function isStreetTag(value) {
  return STREET_TAGS.some((tag) => tag.id === value);
}

export function streetTagLabel(id) {
  return STREET_TAGS.find((tag) => tag.id === id)?.label || String(id || "").toUpperCase();
}

// "JUST NOW" under a minute, then whole minutes. The board dies with the
// 15-minute room TTL so hours never happen.
export function challengeAgeLabel(createdAt, now) {
  const seconds = Math.max(0, Math.floor((Number(now) - Number(createdAt)) / 1000));
  if (!Number.isFinite(seconds) || seconds < 60) return "JUST NOW";
  return `${Math.floor(seconds / 60)} MIN AGO`;
}

/**
 * Validate the body for POST /v1/challenges. Throws a player-readable message
 * on any invalid field; returns the exact wire shape otherwise.
 */
export function buildChallengePost({ roomId, hostToken, guestToken, tag, fighter } = {}) {
  if (!ROOM_ID_PATTERN.test(String(roomId || ""))) throw new Error("Post a challenge from a live private room.");
  if (!ROOM_TOKEN_PATTERN.test(String(hostToken || "")) || !ROOM_TOKEN_PATTERN.test(String(guestToken || ""))) {
    throw new Error("Only the room's host can post it to the Street List.");
  }
  if (!isStreetTag(tag)) throw new Error("Pick one of the listed streets.");
  if (!CHALLENGE_FIGHTER_PATTERN.test(String(fighter || ""))) throw new Error("Pick your fighter before posting.");
  return { roomId, hostToken, guestToken, tag, fighter };
}

/**
 * Sanitize the GET /v1/challenges listing. Unknown tags, malformed ids or
 * fighter names drop the row entirely — the board renders server text nowhere.
 * Tokens can never appear here; a row carrying one is discarded as hostile.
 */
export function sanitizeChallengeList(raw, now = 0) {
  const list = Array.isArray(raw?.challenges) ? raw.challenges : Array.isArray(raw) ? raw : [];
  const rows = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const id = String(entry.id || "");
    const tag = String(entry.tag || "");
    const fighter = String(entry.fighter || "");
    const createdAt = Number(entry.createdAt);
    const expiresAt = Number(entry.expiresAt);
    if (!CHALLENGE_ID_PATTERN.test(id) || !isStreetTag(tag) || !CHALLENGE_FIGHTER_PATTERN.test(fighter)) continue;
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) continue;
    if ("guestToken" in entry || "roomId" in entry || "hostToken" in entry) continue;
    if (now && expiresAt <= now) continue;
    rows.push({
      id,
      tag,
      tagLabel: streetTagLabel(tag),
      fighter,
      createdAt,
      expiresAt,
      ageLabel: challengeAgeLabel(createdAt, now || createdAt),
    });
    if (rows.length >= 32) break;
  }
  return rows;
}

/**
 * Sanitize the one-time claim response into join credentials. The guest token
 * appears exactly here and flows straight into beginOnlineConnection — it is
 * never rendered or stored by the board UI.
 */
export function sanitizeClaimResponse(raw) {
  const roomId = String(raw?.roomId || "");
  const guestToken = String(raw?.guestToken || "");
  const expiresAt = Number(raw?.expiresAt) || 0;
  if (!ROOM_ID_PATTERN.test(roomId) || !ROOM_TOKEN_PATTERN.test(guestToken)) {
    throw new Error("That challenge was already answered.");
  }
  return { roomId, token: guestToken, role: "guest", expiresAt };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function boardError(payload, fallback) {
  const retry = Number(payload?.retryAfterSeconds);
  const suffix = Number.isFinite(retry) && retry > 0 ? ` Try again in ${Math.ceil(retry / 60)} minute(s).` : "";
  return new Error(`${payload?.error || fallback}${suffix}`);
}

export async function postChallenge(body, { apiUrl = runtimeSignalingApiUrl(), fetchImpl = globalThis.fetch } = {}) {
  const validated = buildChallengePost(body);
  const response = await fetchImpl(`${apiUrl.replace(/\/$/u, "")}/v1/challenges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validated),
  });
  const payload = await readJson(response);
  if (!response.ok) throw boardError(payload, "The Street List is unavailable.");
  return { listed: true, id: String(payload?.id || ""), expiresAt: Number(payload?.expiresAt) || 0 };
}

export async function fetchChallenges({ apiUrl = runtimeSignalingApiUrl(), fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const response = await fetchImpl(`${apiUrl.replace(/\/$/u, "")}/v1/challenges`, { method: "GET" });
  const payload = await readJson(response);
  if (!response.ok) throw boardError(payload, "The Street List is unavailable.");
  return sanitizeChallengeList(payload, now);
}

export async function claimChallenge(challengeId, { apiUrl = runtimeSignalingApiUrl(), fetchImpl = globalThis.fetch } = {}) {
  if (!CHALLENGE_ID_PATTERN.test(String(challengeId || ""))) throw new Error("That challenge is malformed.");
  const response = await fetchImpl(`${apiUrl.replace(/\/$/u, "")}/v1/challenges/${challengeId}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = await readJson(response);
  if (!response.ok) throw boardError(payload, "That challenge was already answered.");
  return sanitizeClaimResponse(payload);
}
