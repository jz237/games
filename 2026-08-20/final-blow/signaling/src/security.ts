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
  return null;
}
