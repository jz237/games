import { CreateLimiter, FinalBlowRoom } from "./room";
import {
  AUTH_PROTOCOL_PREFIX,
  ROOM_ID_BYTES,
  ROOM_TTL_MS,
  SOCKET_PROTOCOL,
  TOKEN_BYTES,
  bytesToHex,
  isAllowedOrigin,
  isRole,
  isRoomId,
  parseSocketProtocols,
  randomBase64Url,
  sha256,
} from "./security";

export { CreateLimiter, FinalBlowRoom };

const API_VERSION = "1.0.0";
const ROOM_PATH = /^\/v1\/rooms\/([A-Za-z0-9_-]{22})\/socket\/(host|guest)$/u;

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
    const expiresAt = now + ROOM_TTL_MS;
    const [hostHash, guestHash] = await Promise.all([sha256(hostToken), sha256(guestToken)]);
    const room = env.ROOMS.getByName(roomId, { locationHint: "enam" });
    if (await room.createRoom(roomId, hostHash, guestHash, now, expiresAt)) {
      console.log(JSON.stringify({ message: "room created", requestId: crypto.randomUUID(), expiresAt }));
      return json({
        roomId,
        hostToken,
        guestToken,
        expiresAt,
        socketProtocol: SOCKET_PROTOCOL,
        authProtocolPrefix: AUTH_PROTOCOL_PREFIX,
      }, 201, origin);
    }
  }
  return json({ error: "Could not allocate room" }, 503, origin);
}

async function connectSocket(request: Request, env: Env, origin: string, roomId: string, roleValue: string): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "WebSocket upgrade required" }, 426, origin);
  if (!isRoomId(roomId) || !isRole(roleValue)) return json({ error: "Invalid room request" }, 400, origin);
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
