import assert from "node:assert/strict";
import { test } from "node:test";
import { FinalBlowPeer } from "../engine/webrtc.mjs";

class FakeChannel extends EventTarget {
  constructor(label, options = {}) {
    super();
    this.label = label;
    this.options = options;
    this.readyState = "connecting";
    this.sent = [];
  }

  open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }

  send(value) { this.sent.push(value); }
  close() { this.readyState = "closed"; this.dispatchEvent(new Event("close")); }
}

class FakePeerConnection extends EventTarget {
  constructor(configuration) {
    super();
    this.configuration = configuration;
    this.channels = [];
    this.connectionState = "new";
    this.remoteDescription = null;
    this.localDescription = null;
    this.candidates = [];
  }

  createDataChannel(label, options) {
    const channel = new FakeChannel(label, options);
    this.channels.push(channel);
    return channel;
  }

  async createOffer() { return { type: "offer", sdp: "v=0" }; }
  async createAnswer() { return { type: "answer", sdp: "v=0" }; }
  async setLocalDescription(value) { this.localDescription = value; }
  async setRemoteDescription(value) { this.remoteDescription = value; }
  async addIceCandidate(value) { this.candidates.push(value); }
  close() { this.connectionState = "closed"; }
}

class FakeSignaling {
  constructor() { this.listeners = new Set(); this.closeListeners = new Set(); this.sent = []; }
  onMessage(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  onClose(listener) { this.closeListeners.add(listener); return () => this.closeListeners.delete(listener); }
  send(message) { this.sent.push(message); return true; }
  emit(message) { for (const listener of this.listeners) listener(message); }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("host creates reliable control and lossy unordered input channels", async () => {
  const signaling = new FakeSignaling();
  const statuses = [];
  const inputs = [];
  const peer = new FinalBlowPeer({
    role: "host",
    signaling,
    RTCPeerConnectionImpl: FakePeerConnection,
    onStatus: (kind) => statuses.push(kind),
    onInput: (packet) => inputs.push(packet),
  });
  assert.deepEqual(peer.controlChannel.options, { ordered: true });
  assert.deepEqual(peer.inputChannel.options, { ordered: false, maxRetransmits: 0 });
  signaling.emit({ type: "peer", role: "guest", state: "joined" });
  await settle();
  assert.equal(signaling.sent[0].type, "offer");
  assert.equal(signaling.sent[0].description.type, "offer");
  peer.controlChannel.open();
  peer.inputChannel.open();
  assert.equal(peer.snapshot().connected, true);
  assert.ok(statuses.includes("connected"));
  const packet = new Uint8Array([0xfb, 0x14, 1]).buffer;
  peer.inputChannel.dispatchEvent(new MessageEvent("message", { data: packet }));
  await settle();
  assert.deepEqual([...new Uint8Array(inputs[0])], [0xfb, 0x14, 1]);
  peer.close();
});

test("guest answers offers and queues ICE until the remote description exists", async () => {
  const signaling = new FakeSignaling();
  const peer = new FinalBlowPeer({ role: "guest", signaling, RTCPeerConnectionImpl: FakePeerConnection });
  signaling.emit({ type: "ice", candidate: { candidate: "candidate:1" } });
  signaling.emit({ type: "offer", description: { type: "offer", sdp: "v=0" } });
  await settle();
  await settle();
  assert.equal(peer.connection.remoteDescription.type, "offer");
  assert.deepEqual(peer.connection.candidates, [{ candidate: "candidate:1" }]);
  assert.equal(signaling.sent.find((message) => message.type === "answer")?.description.type, "answer");
  peer.close();
});
