import { ChallengeBoard } from "./board";
import { CreateLimiter, FinalBlowRoom } from "./room";
import {
  AUTH_PROTOCOL_PREFIX,
  CHALLENGE_BODY_LIMIT,
  ROOM_ID_BYTES,
  ROOM_TTL_MS,
  SOCKET_PROTOCOL,
  STREET_TAGS,
  TOKEN_BYTES,
  bytesToHex,
  isAllowedOrigin,
  isFighterId,
  isRoomId,
  isRoomToken,
  isSocketRole,
  isStreetTag,
  parseSocketProtocols,
  randomBase64Url,
  sha256,
} from "./security";

export { ChallengeBoard, CreateLimiter, FinalBlowRoom };

const API_VERSION = "1.1.0";
const ROOM_PATH = /^\/v1\/rooms\/([A-Za-z0-9_-]{22})\/socket\/(host|guest|watch)$/u;
const CLAIM_PATH = /^\/v1\/challenges\/([A-Za-z0-9_-]{22})\/claim$/u;
// The single public board lives in one named Durable Object.
const BOARD_NAME = "street-board";

function responseHeaders(origin?: string): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
    headers.set("Vary", "Origin");
  }
  return headers;
}

function json(data: unknown, status: number, origin?: string, extraHeaders?: HeadersInit): Response {
  const headers = responseHeaders(origin);
  for (const [name, value] of new Headers(extraHeaders)) headers.set(name, value);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers });
}

function clientKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "local-development";
}

async function createRoom(request: Request, env: Env, origin: string): Promise<Response> {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > 64) {
    return json({ error: "Request body too large" }, 413, origin);
  }
  const limiterHash = bytesToHex(await sha256(clientKey(request)));
  const limiter = env.CREATE_LIMITS.getByName(limiterHash);
  const now = Date.now();
  const allowed = await limiter.allowCreate(now);
  if (!allowed.allowed) {
    return json(
      { error: "Room creation rate exceeded", retryAfterSeconds: allowed.retryAfterSeconds },
      429,
      origin,
      { "Retry-After": String(allowed.retryAfterSeconds) },
    );
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const roomId = randomBase64Url(ROOM_ID_BYTES);
    const hostToken = randomBase64Url(TOKEN_BYTES);
    const guestToken = randomBase64Url(TOKEN_BYTES);
    // Wave 19: the optional read-only seat token. Returned once like the seat
    // tokens; only its digest is stored. 2.3 clients simply ignore the field.
    const watchToken = randomBase64Url(TOKEN_BYTES);
    const expiresAt = now + ROOM_TTL_MS;
    const [hostHash, guestHash, watchHash] = await Promise.all([sha256(hostToken), sha256(guestToken), sha256(watchToken)]);
    const room = env.ROOMS.getByName(roomId, { locationHint: "enam" });
    if (await room.createRoom(roomId, hostHash, guestHash, now, expiresAt, watchHash)) {
      console.log(JSON.stringify({ message: "room created", requestId: crypto.randomUUID(), expiresAt }));
      return json({
        roomId,
        hostToken,
        guestToken,
        watchToken,
        expiresAt,
        socketProtocol: SOCKET_PROTOCOL,
        authProtocolPrefix: AUTH_PROTOCOL_PREFIX,
      }, 201, origin);
    }
  }
  return json({ error: "Could not allocate room" }, 503, origin);
}

// ---------------------------------------------------------------------------
// Wave 19 — Street List endpoints. All additive: 2.3 clients never call them.
// ---------------------------------------------------------------------------

async function readChallengeBody(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > CHALLENGE_BODY_LIMIT) return null;
  try {
    const text = await request.text();
    if (text.length > CHALLENGE_BODY_LIMIT) return null;
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// The post/claim budgets reuse the CreateLimiter machinery (same window, same
// count, same hashed-source keying) under namespaced limiter names so board
// abuse can never starve room creation and vice versa.
async function boardRateLimited(request: Request, env: Env, action: "post" | "claim"): Promise<number> {
  const limiterHash = bytesToHex(await sha256(`${action}:${clientKey(request)}`));
  const allowed = await env.CREATE_LIMITS.getByName(limiterHash).allowCreate(Date.now());
  return allowed.allowed ? 0 : allowed.retryAfterSeconds;
}

async function postChallenge(request: Request, env: Env, origin: string): Promise<Response> {
  const body = await readChallengeBody(request);
  if (!body) return json({ error: "Challenge body invalid" }, 400, origin);
  const { roomId, hostToken, guestToken, tag, fighter } = body;
  if (!isRoomId(String(roomId)) || !isRoomToken(hostToken) || !isRoomToken(guestToken)
    || !isStreetTag(tag) || !isFighterId(fighter)) {
    return json({ error: "Challenge fields invalid" }, 400, origin);
  }
  const retryAfterSeconds = await boardRateLimited(request, env, "post");
  if (retryAfterSeconds > 0) {
    return json({ error: "Challenge posting rate exceeded", retryAfterSeconds }, 429, origin, { "Retry-After": String(retryAfterSeconds) });
  }
  const now = Date.now();
  // Proof of ownership: BOTH digests must match the room before the board
  // will escrow the guest token — nobody can list a room they do not host,
  // and the board can never hand out a token that fails seat auth.
  const [hostHash, guestHash] = await Promise.all([sha256(String(hostToken)), sha256(String(guestToken))]);
  const room = env.ROOMS.getByName(String(roomId), { locationHint: "enam" });
  const verified = await room.verifyChallengeTokens(bytesToHex(hostHash), bytesToHex(guestHash), now);
  if (!verified.ok) {
    const status = verified.reason === "room-missing" || verified.reason === "room-expired" ? 404
      : verified.reason === "guest-seated" ? 409 : 401;
    return json({ error: "Challenge rejected", reason: verified.reason }, status, origin);
  }
  const id = randomBase64Url(ROOM_ID_BYTES);
  const posted = await env.BOARDS.getByName(BOARD_NAME, { locationHint: "enam" })
    .post(id, String(roomId), String(guestToken), tag, fighter, now, verified.expiresAt);
  if (!posted.ok) {
    return json({ error: posted.reason === "board-full" ? "The Street List is full — try again soon" : "Challenge rejected" }, posted.reason === "board-full" ? 503 : 400, origin);
  }
  console.log(JSON.stringify({ message: "challenge posted", tag, expiresAt: verified.expiresAt }));
  return json({ id, tag, fighter, expiresAt: verified.expiresAt }, 201, origin);
}

async function listChallenges(env: Env, origin: string): Promise<Response> {
  const challenges = await env.BOARDS.getByName(BOARD_NAME, { locationHint: "enam" }).list(Date.now());
  return json({ challenges, tags: STREET_TAGS }, 200, origin);
}

async function claimChallenge(request: Request, env: Env, origin: string, challengeId: string): Promise<Response> {
  const retryAfterSeconds = await boardRateLimited(request, env, "claim");
  if (retryAfterSeconds > 0) {
    return json({ error: "Challenge claiming rate exceeded", retryAfterSeconds }, 429, origin, { "Retry-After": String(retryAfterSeconds) });
  }
  const claimed = await env.BOARDS.getByName(BOARD_NAME, { locationHint: "enam" }).claim(challengeId, Date.now());
  if (!claimed) return json({ error: "That challenge was already answered or expired" }, 404, origin);
  console.log(JSON.stringify({ message: "challenge claimed", expiresAt: claimed.expiresAt }));
  return json(claimed, 200, origin);
}

async function connectSocket(request: Request, env: Env, origin: string, roomId: string, roleValue: string): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "WebSocket upgrade required" }, 426, origin);
  if (!isRoomId(roomId) || !isSocketRole(roleValue)) return json({ error: "Invalid room request" }, 400, origin);
  const protocols = parseSocketProtocols(request.headers.get("Sec-WebSocket-Protocol"));
  if (!protocols) return json({ error: "Missing room authentication" }, 401, origin);
  const tokenHash = bytesToHex(await sha256(protocols.token));
  const room = env.ROOMS.getByName(roomId, { locationHint: "enam" });
  const internalRequest = new Request("https://final-blow-room.internal/socket", {
    headers: {
      "Upgrade": "websocket",
      "Sec-WebSocket-Protocol": SOCKET_PROTOCOL,
      "X-Final-Blow-Role": roleValue,
      "X-Final-Blow-Token-Hash": tokenHash,
    },
  });
  return room.fetch(internalRequest);
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") {
    return json({ status: "ok", service: "final-blow-signaling", version: API_VERSION }, 200);
  }
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin, env.ALLOWED_ORIGIN)) return json({ error: "Origin not allowed" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(origin ?? undefined) });
  if (url.pathname === "/v1/rooms" && request.method === "POST") return createRoom(request, env, origin ?? env.ALLOWED_ORIGIN);
  // Wave 19 Street List (additive endpoints — see postChallenge/listChallenges).
  if (url.pathname === "/v1/challenges" && request.method === "POST") return postChallenge(request, env, origin ?? env.ALLOWED_ORIGIN);
  if (url.pathname === "/v1/challenges" && request.method === "GET") return listChallenges(env, origin ?? env.ALLOWED_ORIGIN);
  const claimMatch = url.pathname.match(CLAIM_PATH);
  if (claimMatch && request.method === "POST") return claimChallenge(request, env, origin ?? env.ALLOWED_ORIGIN, claimMatch[1] ?? "");
  const socketMatch = url.pathname.match(ROOM_PATH);
  if (socketMatch && request.method === "GET") return connectSocket(request, env, origin ?? env.ALLOWED_ORIGIN, socketMatch[1] ?? "", socketMatch[2] ?? "");
  return json({ error: "Not found" }, 404, origin ?? undefined);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (error) {
      console.error(JSON.stringify({
        message: "unhandled signaling error",
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : String(error),
      }));
      const origin = request.headers.get("Origin");
      const allowedOrigin = isAllowedOrigin(origin, env.ALLOWED_ORIGIN) ? origin ?? undefined : undefined;
      return json({ error: "Signaling service unavailable" }, 500, allowedOrigin);
    }
  },
} satisfies ExportedHandler<Env>;
