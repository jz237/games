import assert from "node:assert/strict";
import WebSocket from "ws";

const apiUrl = (process.env.FINAL_BLOW_SIGNAL_URL || "https://final-blow-signaling.jez237.workers.dev").replace(/\/$/u, "");
const origin = "https://jz237.github.io";

function nextMessage(socket, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for signaling message")), timeoutMs);
    socket.once("message", (value) => {
      clearTimeout(timer);
      resolve(JSON.parse(value.toString()));
    });
  });
}

async function connect(roomId, role, token) {
  const socketUrl = `${apiUrl.replace(/^http/u, "ws")}/v1/rooms/${roomId}/socket/${role}`;
  const socket = new WebSocket(socketUrl, ["final-blow-v1", `fb-auth.${token}`], { headers: { Origin: origin } });
  const welcome = nextMessage(socket);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return { socket, welcome: await welcome };
}

const createResponse = await fetch(`${apiUrl}/v1/rooms`, { method: "POST", headers: { Origin: origin } });
assert.equal(createResponse.status, 201);
const credentials = await createResponse.json();
assert.match(credentials.roomId, /^[A-Za-z0-9_-]{22}$/u);

const host = await connect(credentials.roomId, "host", credentials.hostToken);
assert.deepEqual({ type: host.welcome.type, role: host.welcome.role }, { type: "welcome", role: "host" });
const hostPeer = nextMessage(host.socket);
const guest = await connect(credentials.roomId, "guest", credentials.guestToken);
assert.deepEqual({ type: guest.welcome.type, role: guest.welcome.role }, { type: "welcome", role: "guest" });
assert.deepEqual(await hostPeer, { type: "peer", role: "guest", state: "joined" });

const offerRelay = nextMessage(host.socket);
guest.socket.send(JSON.stringify({ type: "offer", description: { type: "offer", sdp: "v=0\\r\\n" } }));
assert.deepEqual(
  (({ type, from }) => ({ type, from }))(await offerRelay),
  { type: "offer", from: "guest" },
);

const answerRelay = nextMessage(guest.socket);
host.socket.send(JSON.stringify({ type: "answer", description: { type: "answer", sdp: "v=0\\r\\n" } }));
assert.deepEqual(
  (({ type, from }) => ({ type, from }))(await answerRelay),
  { type: "answer", from: "host" },
);

const pong = nextMessage(host.socket);
host.socket.send(JSON.stringify({ type: "ping", nonce: "live-check" }));
assert.deepEqual(
  (({ type, nonce }) => ({ type, nonce }))(await pong),
  { type: "pong", nonce: "live-check" },
);

host.socket.close(1000, "live test complete");
guest.socket.close(1000, "live test complete");
console.log(JSON.stringify({
  status: "passed",
  service: apiUrl,
  roomIdLength: credentials.roomId.length,
  protocol: host.socket.protocol,
  relays: ["offer", "answer", "ping"],
}));
