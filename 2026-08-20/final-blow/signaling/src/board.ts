// Wave 19 — the Street List challenge board. One named Durable Object holds
// every open public challenge: { roomId, guestToken, tag, fighter, createdAt,
// expiresAt } keyed by a random challenge id. The guest token is an escrow
// claim-check: it is stored ONLY for the listing's lifetime (bounded by the
// room's own 15-minute expiry), is released to exactly one claimer (the
// SELECT+DELETE below runs synchronously inside one DO event, so two racing
// claims can never both read it), and never appears in the public listing.
// Posting requires proof of host-seat ownership — the Worker verifies both
// token digests against the room before anything lands here.
import { DurableObject } from "cloudflare:workers";
import { CHALLENGE_BOARD_LIMIT, isStreetTag, isFighterId, isRoomId, isRoomToken } from "./security";

export type ChallengeListing = {
  id: string;
  tag: string;
  fighter: string;
  createdAt: number;
  expiresAt: number;
};

type StoredChallenge = ChallengeListing & {
  room_id: string;
  guest_token: string;
  created_at: number;
  expires_at: number;
};

export class ChallengeBoard extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
          id INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS challenges (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL UNIQUE,
          guest_token TEXT NOT NULL,
          tag TEXT NOT NULL,
          fighter TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO _sql_schema_migrations (id) VALUES (1);
      `);
    });
  }

  private sweep(now: number): void {
    this.ctx.storage.sql.exec("DELETE FROM challenges WHERE expires_at <= ?", now);
  }

  private async armAlarm(): Promise<void> {
    const next = this.ctx.storage.sql.exec<{ next_expiry: number | null }>(
      "SELECT MIN(expires_at) AS next_expiry FROM challenges",
    ).one().next_expiry;
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  /**
   * List (or replace) a room's open challenge. Reposting the same room swaps
   * its listing (new tag/fighter) instead of duplicating it. Refuses when the
   * board is full or any field fails the curated validation.
   */
  async post(id: string, roomId: string, guestToken: string, tag: string, fighter: string, now: number, expiresAt: number): Promise<{ ok: boolean; reason: string }> {
    if (!isRoomId(id) || !isRoomId(roomId) || !isRoomToken(guestToken) || !isStreetTag(tag) || !isFighterId(fighter)) {
      return { ok: false, reason: "invalid" };
    }
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return { ok: false, reason: "expired" };
    this.sweep(now);
    const open = this.ctx.storage.sql.exec<{ count: number }>(
      "SELECT COUNT(*) AS count FROM challenges WHERE room_id != ?", roomId,
    ).one().count;
    if (open >= CHALLENGE_BOARD_LIMIT) return { ok: false, reason: "board-full" };
    this.ctx.storage.sql.exec("DELETE FROM challenges WHERE room_id = ?", roomId);
    this.ctx.storage.sql.exec(
      "INSERT INTO challenges (id, room_id, guest_token, tag, fighter, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id, roomId, guestToken, tag, fighter, now, expiresAt,
    );
    await this.armAlarm();
    return { ok: true, reason: "" };
  }

  /** Public listing — never includes room ids or tokens. Newest first. */
  async list(now: number): Promise<ChallengeListing[]> {
    this.sweep(now);
    return this.ctx.storage.sql.exec<StoredChallenge>(
      "SELECT id, tag, fighter, created_at, expires_at FROM challenges ORDER BY created_at DESC LIMIT ?",
      CHALLENGE_BOARD_LIMIT,
    ).toArray().map((row) => ({
      id: row.id,
      tag: row.tag,
      fighter: row.fighter,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));
  }

  /**
   * One-time claim: returns the join credentials exactly once and removes the
   * listing in the same synchronous storage transaction.
   */
  async claim(id: string, now: number): Promise<{ roomId: string; guestToken: string; expiresAt: number } | null> {
    if (!isRoomId(id)) return null;
    this.sweep(now);
    const row = this.ctx.storage.sql.exec<StoredChallenge>(
      "SELECT id, room_id, guest_token, tag, fighter, created_at, expires_at FROM challenges WHERE id = ?", id,
    ).toArray()[0];
    if (!row) return null;
    this.ctx.storage.sql.exec("DELETE FROM challenges WHERE id = ?", id);
    return { roomId: row.room_id, guestToken: row.guest_token, expiresAt: row.expires_at };
  }

  /** Host withdrawal — requires the same challenge id the post returned. */
  async withdraw(id: string, roomId: string): Promise<boolean> {
    if (!isRoomId(id) || !isRoomId(roomId)) return false;
    const before = this.ctx.storage.sql.exec<{ count: number }>(
      "SELECT COUNT(*) AS count FROM challenges WHERE id = ? AND room_id = ?", id, roomId,
    ).one().count;
    if (!before) return false;
    this.ctx.storage.sql.exec("DELETE FROM challenges WHERE id = ? AND room_id = ?", id, roomId);
    return true;
  }

  async alarm(): Promise<void> {
    this.sweep(Date.now());
    await this.armAlarm();
  }
}
