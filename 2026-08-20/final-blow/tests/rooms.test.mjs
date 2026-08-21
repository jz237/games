import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ROOM_ID_PATTERN,
  ROOM_TOKEN_PATTERN,
  RoomSignalingClient,
  buildInviteUrl,
  connectPrivateRoom,
  createPrivateRoom,
  parseInvite,
  roomFingerprint,
  runtimeSignalingApiUrl,
  scrubInviteFromAddress,
} from "../engine/rooms.mjs";

const roomId = "A".repeat(22);
const hostToken = "H".repeat(43);
const guestToken = "G".repeat(43);

test("local QA may opt into a loopback signaling worker but public pages cannot override production", () => {
  assert.equal(runtimeSignalingApiUrl({ hostname: "127.0.0.1", search: "?signaling=http%3A%2F%2F127.0.0.1%3A8787" }), "http://127.0.0.1:8787");
  assert.match(runtimeSignalingApiUrl({ hostname: "jz237.github.io", search: "?signaling=http%3A%2F%2F127.0.0.1%3A8787" }), /workers\.dev/u);
  assert.match(runtimeSignalingApiUrl({ hostname: "localhost", search: "?signaling=https%3A%2F%2Fevil.example" }), /workers\.dev/u);
});

test("private invites keep credentials in the URL fragment", () => {
  const invite = buildInviteUrl(
    { roomId, guestToken },
    "https://jz237.github.io/games/2026-08-20/final-blow/?debug=1",
  );
  const url = new URL(invite);
  assert.equal(url.searchParams.has("key"), false);
  assert.equal(url.pathname, "/games/2026-08-20/final-blow/");
  assert.equal(parseInvite(invite).roomId, roomId);
  assert.equal(parseInvite(url.hash).token, guestToken);
  assert.equal(parseInvite("https://example.com/#room=bad"), null);
  assert.equal(roomFingerprint(roomId), "AAAAA-AAAAA-AAAAA-AAAAA-AA");
});
test("invite fragments can be scrubbed without a navigation", () => {
  let replaced = "";
  const locationLike = {
    hash: new URL(buildInviteUrl({ roomId, guestToken })).hash,
    pathname: "/games/final-blow/",
    search: "?debug=1",
  };
  assert.equal(scrubInviteFromAddress(locationLike, { replaceState: (_state, _title, value) => { replaced = value; } }), true);
  assert.equal(replaced, "/games/final-blow/?debug=1");
});

test("room creation validates credentials and builds a guest invite", async () => {
  const room = await createPrivateRoom({
    apiUrl: "https://signal.example",
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://signal.example/v1/rooms");
      assert.equal(init.method, "POST");
      return Response.json({ roomId, hostToken, guestToken, expiresAt: Date.now() + 900_000 }, { status: 201 });
    },
  });
  assert.match(room.roomId, ROOM_ID_PATTERN);
  assert.match(room.hostToken, ROOM_TOKEN_PATTERN);
  assert.match(room.guestToken, ROOM_TOKEN_PATTERN);
  assert.deepEqual(parseInvite(room.inviteUrl), { roomId, token: guestToken, role: "guest" });
});

test("room creation surfaces bounded service errors", async () => {
  await assert.rejects(
    createPrivateRoom({
      fetchImpl: async () => Response.json({ error: "Room creation rate exceeded", retryAfterSeconds: 120 }, { status: 429 }),
    }),
    /Try again in 2 minute/u,
  );
});

test("WebSocket authentication travels as a subprotocol, never in the URL", async () => {
  class FakeWebSocket extends EventTarget {
    constructor(url, protocols) {
      super();
      this.url = url;
      this.protocols = protocols;
      this.readyState = 0;
      queueMicrotask(() => {
        this.readyState = 1;
        this.dispatchEvent(new Event("open"));
      });
    }

    send(value) { this.sent = value; }
    close() { this.readyState = 3; }
  }

  const client = await connectPrivateRoom({
    roomId,
    role: "host",
    token: hostToken,
    apiUrl: "https://signal.example",
    WebSocketImpl: FakeWebSocket,
  });
  assert.ok(client instanceof RoomSignalingClient);
  assert.equal(client.socket.url.includes(hostToken), false);
  assert.deepEqual(client.socket.protocols, ["final-blow-v1", `fb-auth.${hostToken}`]);
  const messages = [];
  client.onMessage((message) => messages.push(message));
  client.socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "welcome", role: "host" }) }));
  assert.deepEqual(messages, [{ type: "welcome", role: "host" }]);
  assert.equal(client.send({ type: "ready", fighterId: "deathblow" }), true);
  assert.equal(JSON.parse(client.socket.sent).type, "ready");
  client.close();
});
