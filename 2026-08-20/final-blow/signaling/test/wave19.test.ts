// Wave 19 — Street List endpoints and spectator watch seats. Everything here
// is additive to the 2.3 surface; the worker.test.ts suite still proves the
// original contract byte-for-byte.
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { parseSignalMessage } from "../src/security";

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

type Created = { roomId: string; hostToken: string; guestToken: string; watchToken: string; expiresAt: number };

async function create(): Promise<Created> {
  const response = await exports.default.fetch("https://service.test/v1/rooms", { method: "POST", headers: { Origin: origin } });
  expect(response.status).toBe(201);
  return response.json();
}

async function connect(roomId: string, role: string, token: string): Promise<WebSocket> {
  const response = await exports.default.fetch(
    `https://service.test/v1/rooms/${roomId}/socket/${role}`,
    { headers: socketHeaders(token) },
  );
  expect(response.status).toBe(101);
  const socket = response.webSocket as WebSocket;
  socket.accept();
  return socket;
}

function postChallenge(body: Record<string, unknown>): Promise<Response> {
  return exports.default.fetch("https://service.test/v1/challenges", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("wave 19: street list challenge board", () => {
  it("lists a verified room, hides tokens, and releases the guest token exactly once", async () => {
    const room = await create();
    const posted = await postChallenge({
      roomId: room.roomId,
      hostToken: room.hostToken,
      guestToken: room.guestToken,
      tag: "kensington",
      fighter: "deathblow",
    });
    expect(posted.status).toBe(201);
    const listing = await posted.json() as { id: string; expiresAt: number };
    expect(listing.id).toMatch(/^[A-Za-z0-9_-]{22}$/u);
    expect(listing.expiresAt).toBe(room.expiresAt);

    const board = await exports.default.fetch("https://service.test/v1/challenges", { headers: { Origin: origin } });
    expect(board.status).toBe(200);
    const boardText = JSON.stringify(await board.clone().json());
    expect(boardText).toContain("kensington");
    expect(boardText).toContain(listing.id);
    expect(boardText).not.toContain(room.guestToken);
    expect(boardText).not.toContain(room.roomId);
    const payload = await board.json() as { challenges: { id: string; tag: string; fighter: string }[]; tags: string[] };
    const row = payload.challenges.find((entry) => entry.id === listing.id);
    expect(row).toMatchObject({ tag: "kensington", fighter: "deathblow" });
    expect(payload.tags).toContain("somerset");

    const claim = await exports.default.fetch(`https://service.test/v1/challenges/${listing.id}/claim`, {
      method: "POST", headers: { Origin: origin }, body: "{}",
    });
    expect(claim.status).toBe(200);
    const credentials = await claim.json() as { roomId: string; guestToken: string };
    expect(credentials.roomId).toBe(room.roomId);
    expect(credentials.guestToken).toBe(room.guestToken);

    // One-time release: the second claim finds nothing and the listing is gone.
    const again = await exports.default.fetch(`https://service.test/v1/challenges/${listing.id}/claim`, {
      method: "POST", headers: { Origin: origin }, body: "{}",
    });
    expect(again.status).toBe(404);
    const emptied = await (await exports.default.fetch("https://service.test/v1/challenges", { headers: { Origin: origin } })).json() as { challenges: { id: string }[] };
    expect(emptied.challenges.find((entry) => entry.id === listing.id)).toBeUndefined();
  });

  it("refuses posts without proof of host ownership and rejects junk fields", async () => {
    const room = await create();
    const wrongHost = await postChallenge({
      roomId: room.roomId,
      hostToken: room.guestToken, // not the host token
      guestToken: room.guestToken,
      tag: "broad",
      fighter: "jez",
    });
    expect(wrongHost.status).toBe(401);
    const wrongGuest = await postChallenge({
      roomId: room.roomId,
      hostToken: room.hostToken,
      guestToken: "B".repeat(43), // does not unlock the guest seat
      tag: "broad",
      fighter: "jez",
    });
    expect(wrongGuest.status).toBe(401);
    const badTag = await postChallenge({
      roomId: room.roomId, hostToken: room.hostToken, guestToken: room.guestToken,
      tag: "wall street", fighter: "jez",
    });
    expect(badTag.status).toBe(400);
    const badFighter = await postChallenge({
      roomId: room.roomId, hostToken: room.hostToken, guestToken: room.guestToken,
      tag: "broad", fighter: "<b>JEZ</b>",
    });
    expect(badFighter.status).toBe(400);
    const missingRoom = await postChallenge({
      roomId: "Missing000000000000000".slice(0, 22),
      hostToken: room.hostToken, guestToken: room.guestToken, tag: "broad", fighter: "jez",
    });
    expect(missingRoom.status).toBe(404);
    const foreign = await exports.default.fetch("https://service.test/v1/challenges", {
      method: "POST", headers: { Origin: "https://evil.example" }, body: "{}",
    });
    expect(foreign.status).toBe(403);
  });
});

describe("wave 19: spectator watch seats", () => {
  it("authenticates watchers with the watch token only and relays spectate one-way", async () => {
    const room = await create();
    expect(room.watchToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(room.watchToken).not.toBe(room.hostToken);

    const host = await connect(room.roomId, "host", room.hostToken);
    expect(await nextMessage(host)).toMatchObject({ type: "welcome", role: "host", watchers: 0 });

    // A player token cannot open the watch seat.
    const badWatch = await exports.default.fetch(
      `https://service.test/v1/rooms/${room.roomId}/socket/watch`,
      { headers: socketHeaders(room.guestToken) },
    );
    expect(badWatch.status).toBe(401);

    const hostSeesWatcher = nextMessage(host);
    const watcher = await connect(room.roomId, "watch", room.watchToken);
    expect(await nextMessage(watcher)).toMatchObject({ type: "welcome", role: "watch", roomId: room.roomId });
    expect(await hostSeesWatcher).toMatchObject({ type: "peer", role: "watch", state: "joined" });

    // watch-hello reaches the host; the host's spectate stream reaches the watcher.
    const hello = nextMessage(host);
    watcher.send(JSON.stringify({ type: "watch-hello", have: 0 }));
    expect(await hello).toMatchObject({ type: "watch-hello", from: "watch", have: 0 });

    const relayedHeader = nextMessage(watcher);
    host.send(JSON.stringify({
      type: "spectate",
      kind: "header",
      matchId: "spectate-match-000001",
      seed: 42,
      picks: ["deathblow", "jez"],
      palettes: [0, 1],
      stage: "somerset",
      inputDelay: 2,
      mutators: [],
      gameVersion: "2.4",
      protocol: 3,
      level: 1,
    }));
    expect(await relayedHeader).toMatchObject({ type: "spectate", kind: "header", from: "host", seed: 42 });

    const relayedFrames = nextMessage(watcher);
    host.send(JSON.stringify({
      type: "spectate", kind: "frames", matchId: "spectate-match-000001",
      start: 0, count: 3, p0: "0x3", p1: "1.1.1",
    }));
    expect(await relayedFrames).toMatchObject({ type: "spectate", kind: "frames", start: 0, count: 3 });

    // A watcher trying to signal into the match is cut off at the seat.
    const closed = new Promise<number>((resolve) => watcher.addEventListener("close", (event) => resolve((event as CloseEvent).code), { once: true }));
    watcher.send(JSON.stringify({ type: "offer", description: { type: "offer", sdp: "v=0" } }));
    expect(await closed).toBe(1008);
    host.close(1000, "test complete");
  });

  it("caps concurrent watchers at the seat limit", async () => {
    const room = await create();
    const watchers: WebSocket[] = [];
    for (let seat = 0; seat < 4; seat += 1) {
      watchers.push(await connect(room.roomId, "watch", room.watchToken));
    }
    const overflow = await exports.default.fetch(
      `https://service.test/v1/rooms/${room.roomId}/socket/watch`,
      { headers: socketHeaders(room.watchToken) },
    );
    expect(overflow.status).toBe(409);
    for (const watcher of watchers) watcher.close(1000, "test complete");
  });

  it("keeps guest signaling private to the player seats", async () => {
    const room = await create();
    const host = await connect(room.roomId, "host", room.hostToken);
    await nextMessage(host); // welcome
    const watcher = await connect(room.roomId, "watch", room.watchToken);
    await nextMessage(watcher); // welcome
    const guestJoin = nextMessage(host);
    const guest = await connect(room.roomId, "guest", room.guestToken);
    await nextMessage(guest); // welcome
    await guestJoin;

    // Watcher must never see the WebRTC negotiation.
    let watcherSaw: unknown = null;
    watcher.addEventListener("message", (event) => { watcherSaw = JSON.parse(String(event.data)); });
    const hostGets = nextMessage(host);
    guest.send(JSON.stringify({ type: "offer", description: { type: "offer", sdp: "v=0" } }));
    expect(await hostGets).toMatchObject({ type: "offer", from: "guest" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(watcherSaw).toBeNull();
    // And a guest cannot fake the spectate stream — the seat closes.
    const guestClosed = new Promise<number>((resolve) => guest.addEventListener("close", (event) => resolve((event as CloseEvent).code), { once: true }));
    guest.send(JSON.stringify({ type: "spectate", kind: "end", matchId: "spectate-match-000001", reason: "ended" }));
    expect(await guestClosed).toBe(1008);
    host.close(1000, "test complete");
    watcher.close(1000, "test complete");
  });
});

describe("wave 19: spectate message normalization", () => {
  it("bounds every spectate field and refuses malformed streams", () => {
    const header = parseSignalMessage(JSON.stringify({
      type: "spectate", kind: "header", matchId: "spectate-match-000001", seed: 7,
      picks: ["deathblow", "jez"], stage: "somerset", inputDelay: 2,
      gameVersion: "2.4", protocol: 3,
    }));
    expect(header).toMatchObject({ type: "spectate", kind: "header" });
    expect(parseSignalMessage(JSON.stringify({
      type: "spectate", kind: "header", matchId: "spectate-match-000001", seed: 7,
      picks: ["<script>", "jez"], stage: "somerset", inputDelay: 2, gameVersion: "2.4", protocol: 3,
    }))).toBeNull();
    expect(parseSignalMessage(JSON.stringify({
      type: "spectate", kind: "frames", matchId: "spectate-match-000001", start: 0, count: 2, p0: "1x2", p1: "NOT HEX",
    }))).toBeNull();
    expect(parseSignalMessage(JSON.stringify({
      type: "spectate", kind: "frames", matchId: "spectate-match-000001", start: -5, count: 2, p0: "1x2", p1: "1x2",
    }))).toBeNull();
    expect(parseSignalMessage(JSON.stringify({ type: "spectate", kind: "mystery", matchId: "spectate-match-000001" }))).toBeNull();
    expect(parseSignalMessage(JSON.stringify({ type: "watch-hello", have: -1 }))).toBeNull();
    expect(parseSignalMessage(JSON.stringify({ type: "watch-hello" }))).toMatchObject({ type: "watch-hello", have: 0 });
  });
});
