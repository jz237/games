import { DurableObject } from "cloudflare:workers";
import {
  CREATE_LIMIT,
  CREATE_WINDOW_MS,
  MESSAGE_LIMIT,
  MESSAGE_WINDOW_MS,
  SOCKET_PROTOCOL,
  WATCH_SEAT_LIMIT,
  isSocketRole,
  parseSignalMessage,
  timingSafeHashEqual,
} from "./security";

type Role = "host" | "guest" | "watch";

// Wave 19: per-seat message vocabulary and routing. Player seats keep the
// exact 2.3 behaviour (every valid message reaches the opposite player seat
// and nothing else); the watch seat may only ping and ask the host for the
// spectate stream, and only host "spectate" messages ever reach watchers.
const ROLE_ALLOWED_TYPES: Record<Role, ReadonlySet<string>> = {
  host: new Set(["offer", "answer", "ice", "ready", "ping", "spectate"]),
  guest: new Set(["offer", "answer", "ice", "ready", "ping"]),
  watch: new Set(["ping", "watch-hello"]),
};

function relayTargets(from: Role, type: string): Role[] {
  if (type === "spectate") return from === "host" ? ["watch"] : [];
  if (type === "watch-hello") return ["host"];
  return from === "host" ? ["guest"] : from === "guest" ? ["host"] : [];
}
type ConnectionAttachment = {
  role: Role;
  joinedAt: number;
  messageCount: number;
  messageWindowStartedAt: number;
};

type StoredRoom = {
  room_id: string;
  host_hash: ArrayBuffer;
  guest_hash: ArrayBuffer;
  watch_hash: ArrayBuffer | null;
  created_at: number;
  expires_at: number;
};

type AllowResult = { allowed: boolean; retryAfterSeconds: number };

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export class CreateLimiter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
          id INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS create_limit (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          window_started_at INTEGER NOT NULL,
          request_count INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO _sql_schema_migrations (id) VALUES (1);
      `);
    });
  }

  async allowCreate(now: number): Promise<AllowResult> {
    const row = this.ctx.storage.sql.exec<{ window_started_at: number; request_count: number }>(
      "SELECT window_started_at, request_count FROM create_limit WHERE id = 1",
    ).toArray()[0];
    if (!row || now - row.window_started_at >= CREATE_WINDOW_MS) {
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO create_limit (id, window_started_at, request_count) VALUES (1, ?, 1)",
        now,
      );
      await this.ctx.storage.setAlarm(now + CREATE_WINDOW_MS);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (row.request_count >= CREATE_LIMIT) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((row.window_started_at + CREATE_WINDOW_MS - now) / 1000)),
      };
    }
    this.ctx.storage.sql.exec("UPDATE create_limit SET request_count = request_count + 1 WHERE id = 1");
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async alarm(): Promise<void> {
    this.ctx.storage.sql.exec("DELETE FROM create_limit");
  }
}

export class FinalBlowRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
          id INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS room (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          room_id TEXT NOT NULL,
          host_hash BLOB NOT NULL,
          guest_hash BLOB NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO _sql_schema_migrations (id) VALUES (1);
      `);
      // Wave 19 migration: the optional spectator digest column. Room ids are
      // random 128-bit names so pre-wave instances are practically extinct,
      // but the guard keeps any straggler's table consistent.
      const columns = this.ctx.storage.sql.exec<{ name: string }>(
        "SELECT name FROM pragma_table_info('room')",
      ).toArray().map((row) => row.name);
      if (!columns.includes("watch_hash")) {
        this.ctx.storage.sql.exec("ALTER TABLE room ADD COLUMN watch_hash BLOB");
        this.ctx.storage.sql.exec("INSERT OR IGNORE INTO _sql_schema_migrations (id) VALUES (2)");
      }
    });
  }

  async createRoom(roomId: string, hostHash: ArrayBuffer, guestHash: ArrayBuffer, createdAt: number, expiresAt: number, watchHash?: ArrayBuffer): Promise<boolean> {
    const existing = this.getRoom();
    if (existing) return false;
    this.ctx.storage.sql.exec(
      "INSERT INTO room (id, room_id, host_hash, guest_hash, created_at, expires_at, watch_hash) VALUES (1, ?, ?, ?, ?, ?, ?)",
      roomId,
      hostHash,
      guestHash,
      createdAt,
      expiresAt,
      watchHash ?? null,
    );
    await this.ctx.storage.setAlarm(expiresAt);
    return true;
  }

  // Wave 19 Street List: prove a challenge post really comes from this room's
  // host and that the escrowed guest token actually unlocks the guest seat —
  // BOTH digests must match before the board will list anything. Returns the
  // room expiry so the listing dies exactly when the room does.
  async verifyChallengeTokens(hostHashHex: string, guestHashHex: string, now: number): Promise<{ ok: boolean; reason: string; expiresAt: number }> {
    const room = this.getRoom();
    if (!room) return { ok: false, reason: "room-missing", expiresAt: 0 };
    if (room.expires_at <= now) return { ok: false, reason: "room-expired", expiresAt: 0 };
    if (!timingSafeHashEqual(hostHashHex, room.host_hash)) return { ok: false, reason: "host-auth", expiresAt: 0 };
    if (!timingSafeHashEqual(guestHashHex, room.guest_hash)) return { ok: false, reason: "guest-auth", expiresAt: 0 };
    if (this.ctx.getWebSockets("guest").length > 0) return { ok: false, reason: "guest-seated", expiresAt: 0 };
    return { ok: true, reason: "", expiresAt: room.expires_at };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return jsonError("WebSocket upgrade required", 426);
    const roleValue = request.headers.get("X-Final-Blow-Role") ?? "";
    const providedHash = request.headers.get("X-Final-Blow-Token-Hash") ?? "";
    if (!isSocketRole(roleValue)) return jsonError("Invalid room role", 400);

    const room = this.getRoom();
    if (!room) return jsonError("Room not found", 404);
    if (room.expires_at <= Date.now()) return jsonError("Room expired", 410);
    if (roleValue === "watch") {
      // Wave 19: the read-only seat class. One shared token digest, bounded
      // viewer count, no ability to signal into the match.
      if (!room.watch_hash) return jsonError("Room has no spectator seats", 404);
      if (!timingSafeHashEqual(providedHash, room.watch_hash)) return jsonError("Room authentication failed", 401);
      if (this.ctx.getWebSockets("watch").length >= WATCH_SEAT_LIMIT) return jsonError("Spectator seats are full", 409);
    } else {
      const expectedHash = roleValue === "host" ? room.host_hash : room.guest_hash;
      if (!timingSafeHashEqual(providedHash, expectedHash)) return jsonError("Room authentication failed", 401);
      if (this.ctx.getWebSockets(roleValue).length >= 1) return jsonError(`${roleValue} seat already occupied`, 409);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const now = Date.now();
    const attachment: ConnectionAttachment = {
      role: roleValue,
      joinedAt: now,
      messageCount: 0,
      messageWindowStartedAt: now,
    };
    this.ctx.acceptWebSocket(server, [roleValue]);
    server.serializeAttachment(attachment);
    server.send(JSON.stringify({
      type: "welcome",
      role: roleValue,
      roomId: room.room_id,
      expiresAt: room.expires_at,
      peers: this.connectedRoles(),
      watchers: this.ctx.getWebSockets("watch").length,
    }));
    this.broadcast({ type: "peer", role: roleValue, state: "joined" }, roleValue);
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": SOCKET_PROTOCOL },
    });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = this.readAttachment(socket);
    if (!attachment) {
      socket.close(1008, "Missing connection state");
      return;
    }
    const now = Date.now();
    if (now - attachment.messageWindowStartedAt >= MESSAGE_WINDOW_MS) {
      attachment.messageWindowStartedAt = now;
      attachment.messageCount = 0;
    }
    attachment.messageCount += 1;
    socket.serializeAttachment(attachment);
    if (attachment.messageCount > MESSAGE_LIMIT) {
      socket.close(1008, "Signal rate exceeded");
      return;
    }
    const parsed = parseSignalMessage(message);
    if (!parsed) {
      socket.close(1008, "Invalid signal message");
      return;
    }
    // Wave 19: each seat class has a fixed vocabulary — a watcher can never
    // inject WebRTC signaling and a guest can never impersonate the spectate
    // stream. Player-to-player behaviour is byte-identical to 2.3.
    if (!ROLE_ALLOWED_TYPES[attachment.role].has(parsed.type)) {
      socket.close(1008, "Signal not allowed for this seat");
      return;
    }
    if (parsed.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", nonce: parsed.nonce, serverTime: now }));
      return;
    }
    this.relay({ ...parsed, from: attachment.role }, relayTargets(attachment.role, parsed.type));
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const attachment = this.readAttachment(socket);
    if (attachment) this.broadcast({ type: "peer", role: attachment.role, state: "left" }, attachment.role);
    console.log(JSON.stringify({
      message: "room socket closed",
      role: attachment?.role ?? "unknown",
      code,
      reason: reason.slice(0, 120),
      wasClean,
    }));
  }

  async webSocketError(socket: WebSocket, error: unknown): Promise<void> {
    const attachment = this.readAttachment(socket);
    console.error(JSON.stringify({
      message: "room socket error",
      role: attachment?.role ?? "unknown",
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  async alarm(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) socket.close(4001, "Room expired");
    this.ctx.storage.sql.exec("DELETE FROM room");
  }

  private getRoom(): StoredRoom | null {
    return this.ctx.storage.sql.exec<StoredRoom>(
      "SELECT room_id, host_hash, guest_hash, watch_hash, created_at, expires_at FROM room WHERE id = 1",
    ).toArray()[0] ?? null;
  }

  private readAttachment(socket: WebSocket): ConnectionAttachment | null {
    const value: unknown = socket.deserializeAttachment();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (!isSocketRole(String(record.role))) return null;
    if (!Number.isFinite(record.joinedAt) || !Number.isFinite(record.messageCount) || !Number.isFinite(record.messageWindowStartedAt)) return null;
    return {
      role: record.role as Role,
      joinedAt: Number(record.joinedAt),
      messageCount: Number(record.messageCount),
      messageWindowStartedAt: Number(record.messageWindowStartedAt),
    };
  }

  private connectedRoles(): ("host" | "guest")[] {
    return (["host", "guest"] as const).filter((role) => this.ctx.getWebSockets(role).length > 0);
  }

  private send(socket: WebSocket, encoded: string, role: Role): void {
    try {
      socket.send(encoded);
    } catch (error) {
      console.error(JSON.stringify({
        message: "room relay failed",
        role,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  private relay(payload: Record<string, unknown>, targets: Role[]): void {
    if (!targets.length) return;
    const encoded = JSON.stringify(payload);
    for (const role of targets) {
      for (const socket of this.ctx.getWebSockets(role)) this.send(socket, encoded, role);
    }
  }

  private broadcast(payload: Record<string, unknown>, exceptRole?: Role): void {
    const encoded = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.readAttachment(socket);
      if (!attachment || attachment.role === exceptRole) continue;
      this.send(socket, encoded, attachment.role);
    }
  }
}
