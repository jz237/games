export const SIGNALING_API_URL = "https://final-blow-signaling.jez237.workers.dev";
export const SIGNALING_PROTOCOL = "final-blow-v1";
export const SIGNALING_AUTH_PREFIX = "fb-auth.";
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/u;
export const ROOM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function runtimeSignalingApiUrl(locationLike = globalThis.location) {
  if (!locationLike || !["127.0.0.1", "localhost"].includes(locationLike.hostname)) return SIGNALING_API_URL;
  try {
    const candidate = new URLSearchParams(locationLike.search).get("signaling");
    if (!candidate) return SIGNALING_API_URL;
    const url = new URL(candidate);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) return SIGNALING_API_URL;
    return url.origin;
  } catch {
    return SIGNALING_API_URL;
  }
}

function assertCredentials(credentials) {
  if (!credentials || !ROOM_ID_PATTERN.test(credentials.roomId) || !ROOM_TOKEN_PATTERN.test(credentials.token)) {
    throw new Error("That private-room invite is incomplete or invalid.");
  }
  return credentials;
}

export function roomFingerprint(roomId) {
  if (!ROOM_ID_PATTERN.test(roomId)) return "INVALID ROOM";
  return roomId.match(/.{1,5}/gu).join("-").toUpperCase();
}

export function buildInviteUrl({ roomId, guestToken }, baseHref = globalThis.location?.href || "https://jz237.github.io/games/2026-08-20/final-blow/") {
  assertCredentials({ roomId, token: guestToken });
  const url = new URL(baseHref);
  url.hash = new URLSearchParams({ online: "join", room: roomId, key: guestToken }).toString();
  return url.toString();
}

// Wave 19 spectator seats: the read-only watch link. Same fragment discipline
// as the guest invite — the token never rides in a query string or path.
export function buildWatchUrl({ roomId, watchToken }, baseHref = globalThis.location?.href || "https://jz237.github.io/games/2026-08-20/final-blow/") {
  assertCredentials({ roomId, token: watchToken });
  const url = new URL(baseHref);
  url.hash = new URLSearchParams({ online: "watch", room: roomId, key: watchToken }).toString();
  return url.toString();
}

export function parseInvite(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  let fragment = value.trim();
  try {
    if (!fragment.startsWith("#")) fragment = new URL(fragment).hash;
  } catch {
    // A raw fragment may not be a complete URL.
  }
  const params = new URLSearchParams(fragment.replace(/^#/u, ""));
  const kind = params.get("online");
  const roomId = params.get("room") || "";
  const token = params.get("key") || "";
  if (!["join", "watch"].includes(kind) || !ROOM_ID_PATTERN.test(roomId) || !ROOM_TOKEN_PATTERN.test(token)) return null;
  return { roomId, token, role: kind === "watch" ? "watch" : "guest" };
}

export function scrubInviteFromAddress(locationLike = globalThis.location, historyLike = globalThis.history) {
  if (!locationLike?.hash || !parseInvite(locationLike.hash) || !historyLike?.replaceState) return false;
  historyLike.replaceState(null, "", `${locationLike.pathname}${locationLike.search}`);
  return true;
}

export async function createPrivateRoom({ apiUrl = runtimeSignalingApiUrl(), fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Private rooms require a network connection.");
  const response = await fetchImpl(`${apiUrl.replace(/\/$/u, "")}/v1/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // A structured error is created below.
  }
  if (!response.ok) {
    const retry = Number(payload?.retryAfterSeconds);
    const suffix = Number.isFinite(retry) && retry > 0 ? ` Try again in ${Math.ceil(retry / 60)} minute(s).` : "";
    throw new Error(`${payload?.error || "Private-room service unavailable."}${suffix}`);
  }
  const roomId = String(payload?.roomId || "");
  const hostToken = String(payload?.hostToken || "");
  const guestToken = String(payload?.guestToken || "");
  if (!ROOM_ID_PATTERN.test(roomId) || !ROOM_TOKEN_PATTERN.test(hostToken) || !ROOM_TOKEN_PATTERN.test(guestToken)) {
    throw new Error("The room service returned invalid credentials.");
  }
  // Wave 19: the optional read-only seat token. Absent on a pre-wave worker —
  // every consumer treats "" as "no spectator seats on this room".
  const watchToken = ROOM_TOKEN_PATTERN.test(String(payload?.watchToken || "")) ? String(payload.watchToken) : "";
  return {
    roomId,
    hostToken,
    guestToken,
    watchToken,
    expiresAt: Number(payload.expiresAt) || Date.now(),
    inviteUrl: buildInviteUrl({ roomId, guestToken }),
  };
}

export class RoomSignalingClient {
  constructor({ roomId, role, token, apiUrl = runtimeSignalingApiUrl(), WebSocketImpl = globalThis.WebSocket }) {
    assertCredentials({ roomId, token });
    if (!['host', 'guest', 'watch'].includes(role)) throw new Error("Invalid private-room seat.");
    if (typeof WebSocketImpl !== "function") throw new Error("This browser does not support private rooms.");
    this.roomId = roomId;
    this.role = role;
    this.listeners = new Set();
    this.closeListeners = new Set();
    this.messageQueue = [];
    this.welcomeMessage = null;
    this.closed = false;
    const socketUrl = new URL(`${apiUrl.replace(/\/$/u, "")}/v1/rooms/${roomId}/socket/${role}`);
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocketImpl(socketUrl.toString(), [SIGNALING_PROTOCOL, `${SIGNALING_AUTH_PREFIX}${token}`]);
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Private-room connection timed out.")), 10_000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve(this);
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Could not open the private-room connection."));
      }, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.#receive(event.data));
    this.socket.addEventListener("close", (event) => {
      this.closed = true;
      for (const listener of this.closeListeners) listener({ code: event.code, reason: event.reason, clean: event.wasClean });
    });
  }

  #receive(raw) {
    if (typeof raw !== "string") return;
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message !== "object" || Array.isArray(message) || typeof message.type !== "string") return;
    if (message.type === "welcome") this.welcomeMessage = message;
    if (!this.listeners.size) this.messageQueue.push(message);
    else for (const listener of this.listeners) listener(message);
  }

  onMessage(listener) {
    this.listeners.add(listener);
    const queued = this.messageQueue.splice(0);
    if (queued.length) for (const message of queued) listener(message);
    else if (this.welcomeMessage) listener(this.welcomeMessage);
    return () => this.listeners.delete(listener);
  }

  onClose(listener) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  send(message) {
    if (this.socket.readyState !== 1) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  close(code = 1000, reason = "Leaving private room") {
    if (this.closed || this.socket.readyState >= 2) return;
    this.socket.close(code, reason);
  }
}

export async function connectPrivateRoom(options) {
  const client = new RoomSignalingClient(options);
  try {
    await client.ready;
    return client;
  } catch (error) {
    client.close(1000, "Connection failed");
    throw error;
  }
}
