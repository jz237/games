import { env, exports } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { FinalBlowRoom } from "../src/room";
import { bytesToHex, randomBase64Url, sha256 } from "../src/security";

const origin = "https://jz237.github.io";

function socketHeaders(token: string): HeadersInit {
  return {
    Origin: origin,
    Upgrade: "websocket",
    "Sec-WebSocket-Protocol": `final-blow-v1, fb-auth.${token}`,
  };
}

function nextMessage(socket: WebSocket, timeoutMs = 2_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for WebSocket message")), timeoutMs);
    socket.addEventListener("message", (event) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
    }, { once: true });
  });
}

async function create(): Promise<{ roomId: string; hostToken: string; guestToken: string; expiresAt: number }> {
  const response = await exports.default.fetch("https://service.test/v1/rooms", { method: "POST", headers: { Origin: origin } });
  expect(response.status).toBe(201);
  return response.json();
}

describe("Final Blow signaling Worker", () => {
  it("publishes a no-store health response", async () => {
    const response = await exports.default.fetch("https://service.test/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ status: "ok", version: "1.0.0" });
  });

  it("rejects foreign origins and oversized creation requests", async () => {
    const foreign = await exports.default.fetch("https://service.test/v1/rooms", { method: "POST", headers: { Origin: "https://evil.example" } });
    expect(foreign.status).toBe(403);
    const oversized = await exports.default.fetch("https://service.test/v1/rooms", {
      method: "POST",
      headers: { Origin: origin, "Content-Length": "65" },
    });
    expect(oversized.status).toBe(413);
  });

  it("creates unique 15-minute rooms without exposing token hashes", async () => {
    const first = await create();
    const second = await create();
    expect(first.roomId).toMatch(/^[A-Za-z0-9_-]{22}$/u);
    expect(first.hostToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(first.guestToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(first.roomId).not.toBe(second.roomId);
    expect(first.hostToken).not.toBe(first.guestToken);
    expect(first.expiresAt - Date.now()).toBeGreaterThan(14 * 60 * 1000);
    expect(JSON.stringify(first)).not.toContain(bytesToHex(await sha256(first.hostToken)));
  });

  it("authenticates two seats and relays only validated WebRTC signaling", async () => {
    const credentials = await create();
    const invalid = await exports.default.fetch(
      `https://service.test/v1/rooms/${credentials.roomId}/socket/host`,
      { headers: socketHeaders("Z".repeat(43)) },
    );
    expect(invalid.status).toBe(401);

    const hostResponse = await exports.default.fetch(
      `https://service.test/v1/rooms/${credentials.roomId}/socket/host`,
      { headers: socketHeaders(credentials.hostToken) },
    );
    expect(hostResponse.status).toBe(101);
    expect(hostResponse.headers.get("Sec-WebSocket-Protocol")).toBe("final-blow-v1");
    const host = hostResponse.webSocket;
    expect(host).not.toBeNull();
    host?.accept();
    expect(await nextMessage(host as WebSocket)).toMatchObject({ type: "welcome", role: "host" });

    const hostPeerMessage = nextMessage(host as WebSocket);
    const guestResponse = await exports.default.fetch(
      `https://service.test/v1/rooms/${credentials.roomId}/socket/guest`,
      { headers: socketHeaders(credentials.guestToken) },
    );
    expect(guestResponse.status).toBe(101);
    const guest = guestResponse.webSocket;
    expect(guest).not.toBeNull();
    guest?.accept();
    expect(await nextMessage(guest as WebSocket)).toMatchObject({ type: "welcome", role: "guest" });
    expect(await hostPeerMessage).toMatchObject({ type: "peer", role: "guest", state: "joined" });

    const duplicate = await exports.default.fetch(
      `https://service.test/v1/rooms/${credentials.roomId}/socket/guest`,
      { headers: socketHeaders(credentials.guestToken) },
    );
    expect(duplicate.status).toBe(409);

    const relayedOffer = nextMessage(host as WebSocket);
    guest?.send(JSON.stringify({ type: "offer", description: { type: "offer", sdp: "v=0\\r\\n" } }));
    expect(await relayedOffer).toMatchObject({ type: "offer", from: "guest" });

    const relayedAnswer = nextMessage(guest as WebSocket);
    host?.send(JSON.stringify({ type: "answer", description: { type: "answer", sdp: "v=0\\r\\n" } }));
    expect(await relayedAnswer).toMatchObject({ type: "answer", from: "host" });

    const pong = nextMessage(host as WebSocket);
    host?.send(JSON.stringify({ type: "ping", nonce: "latency-1" }));
    expect(await pong).toMatchObject({ type: "pong", nonce: "latency-1" });
    host?.close(1000, "test complete");
    guest?.close(1000, "test complete");
  });

  it("stores only token digests and destroys rooms on expiry alarm", async () => {
    const roomId = randomBase64Url(16);
    const room = env.ROOMS.getByName(roomId);
    const now = Date.now();
    await room.createRoom(roomId, await sha256("host"), await sha256("guest"), now, now + 60_000);
    await runInDurableObject(room, async (instance: FinalBlowRoom, state) => {
      expect(instance).toBeInstanceOf(FinalBlowRoom);
      const stored = state.storage.sql.exec<{ room_id: string; host_hash: ArrayBuffer }>(
        "SELECT room_id, host_hash FROM room WHERE id = 1",
      ).one();
      expect(stored.room_id).toBe(roomId);
      expect(stored.host_hash).toBeInstanceOf(ArrayBuffer);
      expect(new TextDecoder().decode(stored.host_hash)).not.toContain("host");
    });
    expect(await runDurableObjectAlarm(room)).toBe(true);
    await runInDurableObject(room, async (_instance: FinalBlowRoom, state) => {
      expect(state.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM room",
      ).one().count).toBe(0);
    });
  });
});
