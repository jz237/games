import { DurableObject } from "cloudflare:workers";
import {
  CREATE_LIMIT,
  CREATE_WINDOW_MS,
  MESSAGE_LIMIT,
  MESSAGE_WINDOW_MS,
  SOCKET_PROTOCOL,
  isRole,
  parseSignalMessage,
  timingSafeHashEqual,
} from "./security";

type Role = "host" | "guest";
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
    });
  }

  async createRoom(roomId: string, hostHash: ArrayBuffer, guestHash: ArrayBuffer, createdAt: number, expiresAt: number): Promise<boolean> {
    const existing = this.getRoom();
    if (existing) return false;
    this.ctx.storage.sql.exec(
      "INSERT INTO room (id, room_id, host_hash, guest_hash, created_at, expires_at) VALUES (1, ?, ?, ?, ?, ?)",
      roomId,
      hostHash,
      guestHash,
      createdAt,
      expiresAt,
    );
    await this.ctx.storage.setAlarm(expiresAt);
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return jsonError("WebSocket upgrade required", 426);
    const roleValue = request.headers.get("X-Final-Blow-Role") ?? "";
    const providedHash = request.headers.get("X-Final-Blow-Token-Hash") ?? "";
    if (!isRole(roleValue)) return jsonError("Invalid room role", 400);

    const room = this.getRoom();
    if (!room) return jsonError("Room not found", 404);
    if (room.expires_at <= Date.now()) return jsonError("Room expired", 410);
    const expectedHash = roleValue === "host" ? room.host_hash : room.guest_hash;
    if (!timingSafeHashEqual(providedHash, expectedHash)) return jsonError("Room authentication failed", 401);
    if (this.ctx.getWebSockets(roleValue).length >= 1) return jsonError(`${roleValue} seat already occupied`, 409);

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
    if (parsed.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", nonce: parsed.nonce, serverTime: now }));
      return;
    }
    this.broadcast({ ...parsed, from: attachment.role }, attachment.role);
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
      "SELECT room_id, host_hash, guest_hash, created_at, expires_at FROM room WHERE id = 1",
    ).toArray()[0] ?? null;
  }

  private readAttachment(socket: WebSocket): ConnectionAttachment | null {
    const value: unknown = socket.deserializeAttachment();
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (!isRole(String(record.role))) return null;
    if (!Number.isFinite(record.joinedAt) || !Number.isFinite(record.messageCount) || !Number.isFinite(record.messageWindowStartedAt)) return null;
    return {
      role: record.role as Role,
      joinedAt: Number(record.joinedAt),
      messageCount: Number(record.messageCount),
      messageWindowStartedAt: Number(record.messageWindowStartedAt),
    };
  }

  private connectedRoles(): Role[] {
    return (["host", "guest"] as const).filter((role) => this.ctx.getWebSockets(role).length > 0);
  }

  private broadcast(payload: Record<string, unknown>, exceptRole?: Role): void {
    const encoded = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.readAttachment(socket);
      if (!attachment || attachment.role === exceptRole) continue;
      try {
        socket.send(encoded);
      } catch (error) {
        console.error(JSON.stringify({
          message: "room relay failed",
          role: attachment.role,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }
  }
}
