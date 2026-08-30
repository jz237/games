import assert from "node:assert/strict";
import test from "node:test";
import {
  REPLAY_FORMAT_VERSION,
  REPLAY_RING_LIMIT,
  createReplayHeader,
  createReplayRecord,
  decodeInputStream,
  decodeReplayStreams,
  encodeInputStream,
  pushReplayToRing,
  replayCompatibility,
  replayFileName,
  replaySummary,
  validateReplayRecord,
} from "../engine/replay.mjs";
import { NET_INPUT, ROLLBACK_PROTOCOL_VERSION, RollbackSession, bitsToInput, inputToBits } from "../engine/rollback.mjs";

function sampleRecord(overrides = {}) {
  return createReplayRecord({
    header: {
      kind: "offline",
      mode: "versus",
      protocol: ROLLBACK_PROTOCOL_VERSION,
      gameVersion: "2.4",
      picks: ["deathblow", "jez"],
      stage: "somerset",
      matchSerial: 41,
      startTick: 12,
      recordedAt: 1_700_000_000_000,
      ...overrides.header,
    },
    frames0: overrides.frames0 || [0, 0, 3, 3, 3, 32, 0],
    frames1: overrides.frames1 || [0, 8, 8, 0, 0, 0, 64],
    burns: overrides.burns || [1, 1, 1, 0, 1, 1, 1],
    outcome: overrides.outcome ?? { winner: 0, rounds: [2, 1], healths: [37.5, 0] },
  });
}

test("input stream codec round-trips runs, singles and boundary words", () => {
  const cases = [
    [],
    [0],
    [0xffff],
    [0, 0, 0, 0, 0],
    [1, 2, 3, 4, 5],
    [7, 7, 7, 1, 1, 0xffff, 0xffff, 0, 42],
    Array.from({ length: 500 }, (_, index) => (index % 3 === 0 ? 0 : 0x2003)),
  ];
  for (const values of cases) {
    const encoded = encodeInputStream(values);
    assert.deepEqual(decodeInputStream(encoded), values);
  }
  // Long idle runs must actually compress.
  const idle = encodeInputStream(new Array(3600).fill(0));
  assert.ok(idle.length < 12, `idle run should RLE to a tiny token, got ${idle.length} chars`);
});

test("input stream decoder rejects malformed tokens", () => {
  assert.throws(() => decodeInputStream("zzz"));
  assert.throws(() => decodeInputStream("10000"));
  assert.throws(() => decodeInputStream("3x0"));
  assert.throws(() => decodeInputStream(12));
});

test("input pairs survive the bitsToInput/inputToBits round trip", () => {
  const words = [
    0,
    NET_INPUT.LEFT | NET_INPUT.LIGHT,
    NET_INPUT.RIGHT | NET_INPUT.HEAVY | NET_INPUT.KICK,
    NET_INPUT.DOWN | NET_INPUT.SPECIAL | NET_INPUT.ENHANCED,
    NET_INPUT.THROW | NET_INPUT.THROW_BACK,
    NET_INPUT.JUMP | NET_INPUT.SUPER | NET_INPUT.FINAL,
    NET_INPUT.GUARD | NET_INPUT.LIGHT | NET_INPUT.KICK,
  ];
  for (const word of words) {
    assert.equal(inputToBits(bitsToInput(word)), word, `word 0x${word.toString(16)} must survive`);
  }
  // Every single-bit word the wire can carry must survive too.
  for (const bit of Object.values(NET_INPUT)) {
    assert.equal(inputToBits(bitsToInput(bit)), bit);
  }
  // And the decoded object must express the four-button limb split.
  const kick = bitsToInput(NET_INPUT.LIGHT | NET_INPUT.KICK);
  assert.equal(kick.limb, "kick");
  assert.equal(kick.kick, true);
  assert.equal(kick.punch, false);
});

test("replay header stamps protocol and game version", () => {
  const record = sampleRecord();
  assert.equal(record.format, REPLAY_FORMAT_VERSION);
  assert.equal(record.header.protocol, ROLLBACK_PROTOCOL_VERSION);
  assert.equal(record.header.gameVersion, "2.4");
  assert.equal(record.header.kind, "offline");
  assert.deepEqual(record.header.picks, ["deathblow", "jez"]);
  assert.equal(record.frames, 7);
});

test("replayCompatibility refuses stale stamps with a readable reason", () => {
  const record = sampleRecord();
  const here = { protocol: ROLLBACK_PROTOCOL_VERSION, gameVersion: "2.4" };
  assert.equal(replayCompatibility(record.header, here).ok, true);

  const oldProtocol = sampleRecord({ header: { protocol: ROLLBACK_PROTOCOL_VERSION - 1 } });
  const protoCheck = replayCompatibility(oldProtocol.header, here);
  assert.equal(protoCheck.ok, false);
  assert.match(protoCheck.reason, /PROTOCOL/);

  const oldBuild = sampleRecord({ header: { gameVersion: "2.3" } });
  const buildCheck = replayCompatibility(oldBuild.header, here);
  assert.equal(buildCheck.ok, false);
  assert.match(buildCheck.reason, /2\.3/);

  assert.equal(replayCompatibility(null, here).ok, false);
  assert.equal(replayCompatibility({ format: 99 }, here).ok, false);
});

test("ring keeps newest first and evicts past the cap", () => {
  let ring = [];
  for (let index = 0; index < REPLAY_RING_LIMIT + 4; index += 1) {
    ring = pushReplayToRing(ring, sampleRecord({ header: { matchSerial: index } }));
  }
  assert.equal(ring.length, REPLAY_RING_LIMIT);
  assert.equal(ring[0].header.matchSerial, REPLAY_RING_LIMIT + 3);
  assert.equal(ring.at(-1).header.matchSerial, 4);
  // Junk entries in a corrupted stored list are dropped, not crashed on.
  const repaired = pushReplayToRing([null, "junk", sampleRecord()], sampleRecord());
  assert.equal(repaired.length, 2);
});

test("export/import round-trips through validateReplayRecord", () => {
  const record = sampleRecord();
  const imported = validateReplayRecord(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(imported, record);
  const streams = decodeReplayStreams(imported);
  assert.deepEqual(streams.frames0, [0, 0, 3, 3, 3, 32, 0]);
  assert.deepEqual(streams.frames1, [0, 8, 8, 0, 0, 0, 64]);
  assert.deepEqual(streams.burns, [1, 1, 1, 0, 1, 1, 1]);
});

test("validateReplayRecord refuses broken files", () => {
  assert.throws(() => validateReplayRecord(null), /replay file/i);
  assert.throws(() => validateReplayRecord({ format: 0 }), /format/i);
  const record = JSON.parse(JSON.stringify(sampleRecord()));
  record.streams.p1 = encodeInputStream([1, 2]);
  assert.throws(() => validateReplayRecord(record), /unbalanced/i);
  const empty = JSON.parse(JSON.stringify(sampleRecord()));
  empty.streams.p0 = "";
  empty.streams.p1 = "";
  assert.throws(() => validateReplayRecord(empty), /empty/i);
  const nameless = JSON.parse(JSON.stringify(sampleRecord()));
  nameless.header.picks = ["", ""];
  assert.throws(() => validateReplayRecord(nameless), /fighters/i);
});

// The recorder contract game.js relies on: an independent frame-keyed store,
// written from the step callback and OVERWRITTEN on resimulation, ends up
// holding only confirmed inputs — identical on both peers — even though each
// side simulated through predictions and rollbacks to get there.
test("online recorder pattern: overwrite-on-resim leaves identical confirmed streams on both peers", () => {
  const makeRecordingPeer = (localSide) => {
    let state = { frame: 0, sum: 0 };
    const recorded = new Map();
    const session = new RollbackSession({
      localSide,
      matchTag: 77,
      inputDelay: 1,
      saveState: () => ({ ...state }),
      loadState: (snapshot) => { state = { ...snapshot }; },
      step: (inputs) => {
        // Record BEFORE stepping, keyed by the frame being simulated, exactly
        // like the createOnlineRollback hook — resims overwrite predictions.
        recorded.set(state.frame, [inputs[0] & 0xffff, inputs[1] & 0xffff]);
        state.sum += inputs[0] + inputs[1] * 3;
        state.frame += 1;
      },
    });
    return { session, recorded, state: () => state };
  };
  const host = makeRecordingPeer(0);
  const guest = makeRecordingPeer(1);
  const hostInputAt = (frame) => (frame % 5 === 0 ? NET_INPUT.LIGHT | NET_INPUT.RIGHT : frame % 2 ? NET_INPUT.RIGHT : 0);
  const guestInputAt = (frame) => (frame % 7 === 0 ? NET_INPUT.HEAVY : frame % 3 ? NET_INPUT.LEFT : 0);
  const pending = { host: [], guest: [] };
  const frames = 90;
  for (let frame = 0; frame < frames; frame += 1) {
    host.session.advance(hostInputAt(frame));
    guest.session.advance(guestInputAt(frame));
    pending.host.push(host.session.inputPacket());
    pending.guest.push(guest.session.inputPacket());
    // Bursty delivery every 4th frame so both sides predict, then roll back.
    if (frame % 4 === 3) {
      for (const packet of pending.host.splice(0)) guest.session.receivePacket(packet);
      for (const packet of pending.guest.splice(0)) host.session.receivePacket(packet);
    }
  }
  for (const packet of pending.host.splice(0)) guest.session.receivePacket(packet);
  for (const packet of pending.guest.splice(0)) host.session.receivePacket(packet);
  assert.ok(host.session.metrics().rollbacks > 0, "the exchange must actually exercise rollback");
  const confirmed = Math.min(host.session.frame, guest.session.frame);
  const flatten = (recorded) => {
    const p0 = [];
    const p1 = [];
    for (let frame = 0; frame < confirmed; frame += 1) {
      const pair = recorded.get(frame);
      assert.ok(pair, `frame ${frame} missing from the recorder store`);
      p0.push(pair[0]);
      p1.push(pair[1]);
    }
    return { p0, p1 };
  };
  const hostStreams = flatten(host.recorded);
  const guestStreams = flatten(guest.recorded);
  assert.deepEqual(hostStreams, guestStreams, "both peers must bank the identical confirmed stream");
  // And the confirmed stream round-trips the .fbr codec unchanged.
  assert.deepEqual(decodeInputStream(encodeInputStream(hostStreams.p0)), hostStreams.p0);
  assert.deepEqual(decodeInputStream(encodeInputStream(hostStreams.p1)), hostStreams.p1);
});

test("header clamps hostile arcade context and start phase", () => {
  const header = createReplayHeader({
    startPhase: { phase: "banana", phaseTime: -4 },
    startTick: -12,
    inputDelay: 99,
    seed: -1,
    arcadeBoss: "yes",
  });
  assert.equal(header.startPhase.phase, "fight");
  assert.equal(header.startPhase.phaseTime, 0);
  assert.equal(header.startTick, 0);
  assert.equal(header.inputDelay, 4);
  assert.ok(header.seed >= 0);
  assert.equal(header.arcadeBoss, true);
});

test("summary and filename derive from the header", () => {
  const record = sampleRecord();
  const summary = replaySummary(record, 3);
  assert.equal(summary.index, 3);
  assert.equal(summary.mode, "versus");
  assert.deepEqual(summary.picks, ["deathblow", "jez"]);
  assert.equal(summary.frames, 7);
  assert.equal(summary.winner, 0);
  const name = replayFileName(record);
  assert.match(name, /^final-blow-.*deathblow-vs-jez\.fbr$/);
});
