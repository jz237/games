export const ROOM_ID_BYTES = 16;
export const TOKEN_BYTES = 32;
export const ROOM_TTL_MS = 15 * 60 * 1000;
export const CREATE_WINDOW_MS = 10 * 60 * 1000;
export const CREATE_LIMIT = 6;
export const MESSAGE_WINDOW_MS = 60 * 1000;
export const MESSAGE_LIMIT = 120;
export const MAX_SIGNAL_BYTES = 32 * 1024;
export const SOCKET_PROTOCOL = "final-blow-v1";
export const AUTH_PROTOCOL_PREFIX = "fb-auth.";
// Wave 19 spectator seats: one shared watch token per room, up to this many
// concurrent viewer sockets. Same digest discipline as the player seats.
export const WATCH_SEAT_LIMIT = 4;
// Wave 19 Street List: the public challenge board. Entries die with their
// room's 15-minute expiry; the open board itself is hard-capped.
export const CHALLENGE_BOARD_LIMIT = 32;
export const CHALLENGE_BODY_LIMIT = 512;

// Curated Philly street tags — the ONLY strings the public board will store or
// serve. The client mirrors this list for its picker; anything else is a 400.
export const STREET_TAGS = Object.freeze([
  "somerset", "kensington", "allegheny", "lehigh", "broad",
  "passyunk", "girard", "frankford", "tioga", "venango",
] as const);

export type StreetTag = (typeof STREET_TAGS)[number];

export function isStreetTag(value: unknown): value is StreetTag {
  return typeof value === "string" && (STREET_TAGS as readonly string[]).includes(value);
}

export function isFighterId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,24}$/u.test(value);
}

export function isRoomToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value);
}

const encoder = new TextEncoder();

export function randomBase64Url(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  let binary = "";
  for (const value of data) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(value));
}

export function bytesToHex(value: ArrayBuffer | ArrayBufferView): string {
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/u.test(value)) return null;
  const output = new Uint8Array(32);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

export function timingSafeHashEqual(providedHex: string, expected: ArrayBuffer): boolean {
  const provided = hexToBytes(providedHex) ?? new Uint8Array(32);
  const expectedBytes = new Uint8Array(expected);
  if (expectedBytes.byteLength !== 32) {
    crypto.subtle.timingSafeEqual(provided, new Uint8Array(32));
    return false;
  }
  const matches = crypto.subtle.timingSafeEqual(provided, expectedBytes);
  return matches && hexToBytes(providedHex) !== null;
}

export function parseSocketProtocols(header: string | null): { token: string } | null {
  if (!header) return null;
  const protocols = header.split(",").map((value) => value.trim()).filter(Boolean);
  const auth = protocols.filter((value) => value.startsWith(AUTH_PROTOCOL_PREFIX));
  if (!protocols.includes(SOCKET_PROTOCOL) || auth.length !== 1) return null;
  const token = auth[0]?.slice(AUTH_PROTOCOL_PREFIX.length) ?? "";
  return /^[A-Za-z0-9_-]{43}$/u.test(token) ? { token } : null;
}

export function isRoomId(value: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/u.test(value);
}

export function isRole(value: string): value is "host" | "guest" {
  return value === "host" || value === "guest";
}

// Wave 19: the socket paths gain a read-only third seat class. Player-seat
// checks everywhere else keep using isRole, so nothing about the original
// two-seat contract loosens.
export function isSocketRole(value: string): value is "host" | "guest" | "watch" {
  return isRole(value) || value === "watch";
}

export function isAllowedOrigin(origin: string | null, configuredOrigin: string): boolean {
  if (!origin) return false;
  if (origin === configuredOrigin) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

type SignalRecord = Record<string, unknown> & { type: string };

function isDescription(value: unknown, expectedType: "offer" | "answer"): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.type === expectedType && typeof record.sdp === "string" && record.sdp.length > 0 && record.sdp.length <= 20_000;
}

function isCandidate(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.candidate !== "string" || record.candidate.length > 4_096) return false;
  if (!(record.sdpMid === null || record.sdpMid === undefined || (typeof record.sdpMid === "string" && record.sdpMid.length <= 128))) return false;
  if (!(record.sdpMLineIndex === null || record.sdpMLineIndex === undefined || (Number.isInteger(record.sdpMLineIndex) && Number(record.sdpMLineIndex) >= 0 && Number(record.sdpMLineIndex) <= 64))) return false;
  return record.usernameFragment === undefined || record.usernameFragment === null
    || (typeof record.usernameFragment === "string" && record.usernameFragment.length <= 256);
}

export function parseSignalMessage(message: string | ArrayBuffer): SignalRecord | null {
  if (typeof message !== "string" || encoder.encode(message).byteLength > MAX_SIGNAL_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (record.type === "offer" || record.type === "answer") {
    if (!isDescription(record.description, record.type)) return null;
    const description = record.description as Record<string, unknown>;
    return { type: record.type, description: { type: description.type, sdp: description.sdp } };
  }
  if (record.type === "ice") {
    if (!isCandidate(record.candidate)) return null;
    if (record.candidate === null) return { type: "ice", candidate: null };
    const candidate = record.candidate as Record<string, unknown>;
    return {
      type: "ice",
      candidate: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? null,
        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
        usernameFragment: candidate.usernameFragment ?? null,
      },
    };
  }
  if (record.type === "ready") {
    const fighterId = record.fighterId;
    if (fighterId === undefined) return { type: "ready" };
    return typeof fighterId === "string" && /^[a-z0-9-]{1,24}$/u.test(fighterId)
      ? { type: "ready", fighterId }
      : null;
  }
  if (record.type === "ping" || record.type === "pong") {
    return typeof record.nonce === "string" && record.nonce.length >= 1 && record.nonce.length <= 64
      ? { type: record.type, nonce: record.nonce }
      : null;
  }
  // Wave 19 spectator relay. Host -> watchers: a match header, a batch of
  // confirmed input frames (RLE text), or an end card. Size is already capped
  // by MAX_SIGNAL_BYTES; each field is bounded and normalized here.
  if (record.type === "spectate") {
    return normalizeSpectateMessage(record);
  }
  // Watcher -> host: request the header plus a resend from frame `have`.
  if (record.type === "watch-hello") {
    const have = record.have === undefined ? 0 : record.have;
    return Number.isInteger(have) && Number(have) >= 0 && Number(have) <= 1_000_000
      ? { type: "watch-hello", have: Number(have) }
      : null;
  }
  return null;
}

function isMatchId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 64;
}

function normalizeSpectateMessage(record: Record<string, unknown>): SignalRecord | null {
  if (!isMatchId(record.matchId)) return null;
  if (record.kind === "header") {
    const picks = record.picks;
    if (!Array.isArray(picks) || picks.length !== 2 || !picks.every((pick) => isFighterId(pick))) return null;
    if (!isFighterId(record.stage)) return null;
    const mutators = record.mutators === undefined ? [] : record.mutators;
    if (!Array.isArray(mutators) || mutators.length > 8 || !mutators.every((id) => isFighterId(id))) return null;
    if (!Number.isInteger(record.seed)) return null;
    if (!Number.isInteger(record.inputDelay) || Number(record.inputDelay) < 0 || Number(record.inputDelay) > 4) return null;
    if (typeof record.gameVersion !== "string" || record.gameVersion.length > 16) return null;
    if (!Number.isInteger(record.protocol) || Number(record.protocol) < 0 || Number(record.protocol) > 10_000) return null;
    const palettes = Array.isArray(record.palettes) ? record.palettes : [0, 0];
    return {
      type: "spectate",
      kind: "header",
      level: Number.isInteger(record.level) && Number(record.level) >= 1 ? Number(record.level) : 1,
      matchId: record.matchId,
      seed: record.seed,
      picks: [picks[0], picks[1]],
      palettes: [palettes[0] === 1 ? 1 : 0, palettes[1] === 1 ? 1 : 0],
      stage: record.stage,
      inputDelay: record.inputDelay,
      mutators,
      gameVersion: record.gameVersion,
      protocol: record.protocol,
    };
  }
  if (record.kind === "frames") {
    if (!Number.isInteger(record.start) || Number(record.start) < 0 || Number(record.start) > 1_000_000) return null;
    if (!Number.isInteger(record.count) || Number(record.count) < 1 || Number(record.count) > 100_000) return null;
    const streamPattern = /^[0-9a-fx.]{1,28672}$/u;
    if (typeof record.p0 !== "string" || typeof record.p1 !== "string") return null;
    if (!streamPattern.test(record.p0) || !streamPattern.test(record.p1)) return null;
    return { type: "spectate", kind: "frames", matchId: record.matchId, start: record.start, count: record.count, p0: record.p0, p1: record.p1 };
  }
  if (record.kind === "end") {
    const reason = ["ended", "host-left", "expired"].includes(String(record.reason)) ? String(record.reason) : "ended";
    const winner = record.winner === 0 || record.winner === 1 ? record.winner : null;
    return { type: "spectate", kind: "end", matchId: record.matchId, reason, winner };
  }
  return null;
}
