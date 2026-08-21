import assert from "node:assert/strict";
import test from "node:test";
import {
  HELD_INPUT_MASK,
  NET_INPUT,
  RollbackSession,
  bitsToInput,
  checksumState,
  decodeInputPacket,
  encodeInputPacket,
  inputToBits,
  matchTagFromId,
  parseRollbackState,
  predictedInput,
  recommendedInputDelay,
  serializeRollbackState,
} from "../engine/rollback.mjs";

function battleState() {
  return { frame: 0, fighters: [{ x: 10, life: 100 }, { x: 90, life: 100 }], impacts: 0 };
}

function stepBattle(state, inputs) {
  for (let side = 0; side < 2; side += 1) {
    const input = bitsToInput(inputs[side]);
    state.fighters[side].x += (input.right ? 2 : 0) - (input.left ? 2 : 0);
    if (input.light && Math.abs(state.fighters[0].x - state.fighters[1].x) < 35) {
      state.fighters[1 - side].life -= 3;
      state.impacts += 1;
    }
  }
  state.frame += 1;
}

function makePeer({ localSide, tag, inputDelay = 2 }) {
  let state = battleState();
  const peer = new RollbackSession({
    localSide,
    matchTag: tag,
    inputDelay,
    saveState: () => structuredClone(state),
    loadState: (snapshot) => { state = structuredClone(snapshot); },
    step: (inputs) => stepBattle(state, inputs),
  });
  return { peer, state: () => state };
}

test("input bitfields preserve held and pulse controls without predicting repeated attacks", () => {
  const bits = inputToBits({ left: true, down: true, guard: true, light: true, final: true });
  assert.deepEqual(bitsToInput(bits), {
    left: true, right: false, down: true, guard: true,
    jump: false, light: true, heavy: false, special: false,
    enhanced: false, throw: false, super: false, final: true,
  });
  assert.equal(predictedInput(bits), bits & HELD_INPUT_MASK);
  assert.equal(bitsToInput(predictedInput(bits)).light, false);
});

test("binary input packets include redundant frames, acknowledgement and match isolation", () => {
  const inputs = new Map([[5, NET_INPUT.LEFT], [6, NET_INPUT.LIGHT], [7, NET_INPUT.RIGHT]]);
  const packet = encodeInputPacket({ matchTag: 237, latestFrame: 7, acknowledgedFrame: 4, inputs, redundancyFrames: 3 });
  const decoded = decodeInputPacket(packet);
  assert.equal(packet.byteLength, 22);
  assert.equal(decoded.matchTag, 237);
  assert.equal(decoded.acknowledgedFrame, 4);
  assert.deepEqual(decoded.entries, [[5, NET_INPUT.LEFT], [6, NET_INPUT.LIGHT], [7, NET_INPUT.RIGHT]]);
  assert.throws(() => decodeInputPacket(packet.slice(0, -1)), /invalid length|truncated/);
});

test("stable state checksums and transport preserve non-finite rollback sentinels", () => {
  const first = { z: -Infinity, a: { y: Infinity, x: -0 }, n: Number.NaN };
  const second = { n: Number.NaN, a: { x: 0, y: Infinity }, z: -Infinity };
  assert.equal(checksumState(first), checksumState(second));
  const restored = parseRollbackState(serializeRollbackState(first));
  assert.equal(restored.z, -Infinity);
  assert.equal(restored.a.y, Infinity);
  assert.equal(Object.is(restored.a.x, -0), false);
  assert.equal(Number.isNaN(restored.n), true);
});

test("delay recommendation is bounded to four frames", () => {
  assert.equal(recommendedInputDelay(0), 0);
  assert.equal(recommendedInputDelay(32), 1);
  assert.equal(recommendedInputDelay(100), 3);
  assert.equal(recommendedInputDelay(500), 4);
});

test("two peers converge exactly through prediction, packet loss and rollback", () => {
  const tag = matchTagFromId("rollback-production-test");
  const host = makePeer({ localSide: 0, tag });
  const guest = makePeer({ localSide: 1, tag });
  const deliveries = [[], []];
  let network = 0x237237;
  const next = () => {
    network = (Math.imul(network, 1664525) + 1013904223) >>> 0;
    return network;
  };
  const frames = 900;
  for (let frame = 0; frame < frames; frame += 1) {
    for (const index of [0, 1]) {
      const ready = deliveries[index].filter((item) => item.at <= frame);
      deliveries[index] = deliveries[index].filter((item) => item.at > frame);
      for (const item of ready) (index === 0 ? host.peer : guest.peer).receivePacket(item.packet);
    }
    const hostInput = (frame % 80 < 26 ? NET_INPUT.RIGHT : 0) | (frame % 43 === 0 ? NET_INPUT.LIGHT : 0);
    const guestInput = (frame % 90 < 24 ? NET_INPUT.LEFT : 0) | (frame % 47 === 0 ? NET_INPUT.LIGHT : 0);
    host.peer.advance(hostInput);
    guest.peer.advance(guestInput);
    for (const [sender, target] of [[host.peer, 1], [guest.peer, 0]]) {
      if (next() % 100 < 7) continue;
      const latency = 2 + next() % 6;
      deliveries[target].push({ at: frame + latency, packet: sender.inputPacket() });
    }
  }
  for (let frame = frames; frame < frames + 18; frame += 1) {
    for (const index of [0, 1]) {
      const ready = deliveries[index].filter((item) => item.at <= frame);
      deliveries[index] = deliveries[index].filter((item) => item.at > frame);
      for (const item of ready) (index === 0 ? host.peer : guest.peer).receivePacket(item.packet);
    }
  }
  host.peer.receivePacket(guest.peer.inputPacket());
  guest.peer.receivePacket(host.peer.inputPacket());
  assert.ok(host.peer.metrics().rollbacks > 0);
  assert.ok(guest.peer.metrics().rollbacks > 0);
  assert.equal(host.peer.frame, guest.peer.frame);
  assert.equal(checksumState(host.state()), checksumState(guest.state()));
});

test("state sync resets rollback history and resumes at the authoritative frame", () => {
  const tag = matchTagFromId("resume");
  const host = makePeer({ localSide: 0, tag, inputDelay: 0 });
  const guest = makePeer({ localSide: 1, tag, inputDelay: 0 });
  host.peer.receiveRemoteInputs(Array.from({ length: 21 }, (_, frame) => [frame, 0]));
  for (let frame = 0; frame < 20; frame += 1) host.peer.advance(NET_INPUT.RIGHT);
  guest.peer.importSync(host.peer.exportSync());
  assert.equal(guest.peer.frame, host.peer.frame);
  assert.equal(checksumState(guest.state()), checksumState(host.state()));
  assert.equal(guest.peer.metrics().rollbacks, 0);
  host.peer.advance(NET_INPUT.RIGHT);
  const immediatePacket = decodeInputPacket(host.peer.inputPacket());
  assert.equal(immediatePacket.latestFrame, 20);
  assert.equal(immediatePacket.entries.at(-1)[1], NET_INPUT.RIGHT);
});

test("out-of-window corrections are detected and packets from old matches are ignored", () => {
  let state = battleState();
  let exceeded = 0;
  const peer = new RollbackSession({
    localSide: 0,
    matchTag: 111,
    inputDelay: 0,
    maxRollbackFrames: 4,
    maxPredictionFrames: 12,
    saveState: () => structuredClone(state),
    loadState: (snapshot) => { state = structuredClone(snapshot); },
    step: (inputs) => stepBattle(state, inputs),
    onWindowExceeded: () => { exceeded += 1; },
  });
  for (let frame = 0; frame < 9; frame += 1) peer.advance(0);
  peer.receiveRemoteInputs([[0, NET_INPUT.LIGHT]]);
  assert.equal(peer.metrics().windowExceeded, 1);
  assert.equal(exceeded, 1);
  const foreign = encodeInputPacket({ matchTag: 222, latestFrame: 9, inputs: new Map([[9, NET_INPUT.RIGHT]]) });
  assert.deepEqual(peer.receivePacket(foreign), { accepted: false, reason: "match-tag" });
});
