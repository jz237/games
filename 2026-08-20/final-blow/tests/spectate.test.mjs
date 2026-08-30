import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SPECTATE_BATCH_FRAMES,
  SPECTATE_BYTE_BUDGET,
  SPECTATE_MAX_WATCHERS,
  SPECTATE_WORST_BYTES_PER_FRAME,
  buildSpectateHeader,
  collectConfirmedRange,
  createSpectatorFeed,
  decodeSpectateBatch,
  encodeSpectateBatch,
  encodeSpectateEnd,
  feedSpectateBatch,
  feedSpectateEnd,
  feedSpectateHeader,
  planSpectateChunks,
  sanitizeSpectateHeader,
} from "../engine/spectate.mjs";

const matchConfig = {
  version: 1,
  matchId: "spectate-test-match-1",
  seed: 987654,
  picks: ["deathblow", "jez"],
  stage: "somerset",
  inputDelay: 2,
  palettes: [0, 1],
  mutators: [],
};

test("the spectate header mirrors everything the seeding path reads", () => {
  const header = buildSpectateHeader(matchConfig, { gameVersion: "2.4", protocol: 3 });
  assert.equal(header.type, "spectate");
  assert.equal(header.kind, "header");
  assert.equal(header.matchId, matchConfig.matchId);
  assert.equal(header.seed, 987654);
  assert.deepEqual(header.picks, ["deathblow", "jez"]);
  assert.deepEqual(header.palettes, [0, 1]);
  assert.equal(header.stage, "somerset");
  assert.equal(header.inputDelay, 2);
  assert.equal(header.gameVersion, "2.4");
  assert.equal(header.protocol, 3);
  const clean = sanitizeSpectateHeader(header);
  assert.deepEqual(clean.picks, ["deathblow", "jez"]);
  // Hostile shapes refuse instead of seeding a garbage match.
  assert.equal(sanitizeSpectateHeader({ kind: "header", matchId: "x", picks: ["a", "b"], stage: "somerset" }), null);
  assert.equal(sanitizeSpectateHeader({ ...header, picks: ["DEATH BLOW", "jez"] }), null);
  assert.equal(sanitizeSpectateHeader({ ...header, stage: "../etc" }), null);
  assert.equal(sanitizeSpectateHeader(null), null);
});

test("batches round-trip through the replay RLE codec", () => {
  const frames0 = [0, 0, 0, 5, 5, 9, 0x8001, 0x8001];
  const frames1 = [1, 1, 1, 1, 0, 0, 0, 2];
  const batch = encodeSpectateBatch("m-1", 120, frames0, frames1);
  assert.equal(batch.start, 120);
  assert.equal(batch.count, 8);
  const decoded = decodeSpectateBatch(batch);
  assert.deepEqual(decoded.frames0, frames0);
  assert.deepEqual(decoded.frames1, frames1);
  // Mismatched stream lengths refuse at both ends.
  assert.equal(encodeSpectateBatch("m-1", 0, [1, 2], [1]), null);
  assert.equal(decodeSpectateBatch({ kind: "frames", start: 0, count: 3, p0: "1x2", p1: "1x3" }), null);
  assert.equal(decodeSpectateBatch({ kind: "frames", start: -1, count: 1, p0: "1", p1: "1" }), null);
  assert.equal(decodeSpectateBatch({ kind: "frames", start: 0, count: 1, p0: "zzz", p1: "1" }), null);
});

test("chunk planning respects the signaling byte budget", () => {
  // Steady-state batch: one message per second of confirmed play.
  assert.equal(SPECTATE_BATCH_FRAMES, 60);
  const perMessage = Math.floor(SPECTATE_BYTE_BUDGET / (SPECTATE_WORST_BYTES_PER_FRAME * 2));
  const chunks = planSpectateChunks(0, perMessage * 2 + 7);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0], { start: 0, count: perMessage });
  assert.deepEqual(chunks[1], { start: perMessage, count: perMessage });
  assert.deepEqual(chunks[2], { start: perMessage * 2, count: 7 });
  // Every planned chunk's worst-case wire size stays under the 32 KiB cap.
  for (const chunk of chunks) {
    assert.ok(chunk.count * SPECTATE_WORST_BYTES_PER_FRAME * 2 <= 32 * 1024 - 512);
  }
  // A three-minute catch-up (10800 frames) still chunks cleanly.
  const catchUp = planSpectateChunks(0, 10_800);
  assert.equal(catchUp.reduce((total, chunk) => total + chunk.count, 0), 10_800);
  assert.ok(catchUp.length >= Math.ceil(10_800 / perMessage));
  assert.deepEqual(planSpectateChunks(500, 0), []);
  // Offsets carry through.
  assert.deepEqual(planSpectateChunks(500, 5), [{ start: 500, count: 5 }]);
});

test("the spectator feed appends in order, dedupes overlap, flags gaps", () => {
  const feed = createSpectatorFeed();
  const header = buildSpectateHeader(matchConfig, { gameVersion: "2.4", protocol: 3 });
  // Batches before a header are refused.
  assert.equal(feedSpectateBatch(feed, encodeSpectateBatch(matchConfig.matchId, 0, [1], [2])).accepted, false);
  assert.equal(feedSpectateHeader(feed, header), true);
  const first = feedSpectateBatch(feed, encodeSpectateBatch(matchConfig.matchId, 0, [1, 2, 3], [4, 5, 6]));
  assert.deepEqual(first, { accepted: true, appended: 3, gap: false });
  // Overlapping resend: frames 1..4 — only 3 is new.
  const overlap = feedSpectateBatch(feed, encodeSpectateBatch(matchConfig.matchId, 1, [2, 3, 7], [5, 6, 8]));
  assert.deepEqual(overlap, { accepted: true, appended: 1, gap: false });
  assert.deepEqual(feed.frames0, [1, 2, 3, 7]);
  assert.deepEqual(feed.frames1, [4, 5, 6, 8]);
  // Exact duplicate: accepted, nothing appended.
  const duplicate = feedSpectateBatch(feed, encodeSpectateBatch(matchConfig.matchId, 0, [1, 2], [4, 5]));
  assert.deepEqual(duplicate, { accepted: true, appended: 0, gap: false });
  // Future gap: refused and remembered so the client can request a resend.
  const gapped = feedSpectateBatch(feed, encodeSpectateBatch(matchConfig.matchId, 9, [9], [9]));
  assert.deepEqual(gapped, { accepted: false, appended: 0, gap: true });
  assert.equal(feed.gapAt, 4);
  // Wrong match id never lands.
  const foreign = feedSpectateBatch(feed, encodeSpectateBatch("other-match-id-000", 4, [9], [9]));
  assert.equal(foreign.accepted, false);
  // End message closes the feed; later batches bounce.
  assert.equal(feedSpectateEnd(feed, encodeSpectateEnd(matchConfig.matchId, { reason: "host-left" })), true);
  assert.equal(feed.endReason, "host-left");
  assert.equal(feedSpectateBatch(feed, encodeSpectateBatch(matchConfig.matchId, 4, [9], [9])).accepted, false);
});

test("a fresh header resets the feed for the next match in the set", () => {
  const feed = createSpectatorFeed();
  feedSpectateHeader(feed, buildSpectateHeader(matchConfig, {}));
  feedSpectateBatch(feed, encodeSpectateBatch(matchConfig.matchId, 0, [1, 1], [2, 2]));
  feedSpectateEnd(feed, encodeSpectateEnd(matchConfig.matchId, { winner: 0 }));
  const nextConfig = { ...matchConfig, matchId: "spectate-test-match-2" };
  assert.equal(feedSpectateHeader(feed, buildSpectateHeader(nextConfig, {})), true);
  assert.equal(feed.frames0.length, 0);
  assert.equal(feed.ended, false);
  assert.equal(feed.header.matchId, "spectate-test-match-2");
});

test("collectConfirmedRange refuses holes in the recorder map", () => {
  const map = new Map([[0, [1, 2]], [1, [3, 4]], [3, [7, 8]]]);
  assert.deepEqual(collectConfirmedRange(map, 0, 2), { frames0: [1, 3], frames1: [2, 4] });
  assert.equal(collectConfirmedRange(map, 0, 4), null); // frame 2 missing
  assert.equal(collectConfirmedRange(map, 2, 2), null); // empty range
  assert.equal(collectConfirmedRange(null, 0, 1), null);
});

test("watcher cap constant stays within the seat design", () => {
  assert.ok(SPECTATE_MAX_WATCHERS >= 1 && SPECTATE_MAX_WATCHERS <= 4);
});
