import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHALLENGE_ID_PATTERN,
  STREET_TAGS,
  buildChallengePost,
  challengeAgeLabel,
  claimChallenge,
  fetchChallenges,
  isStreetTag,
  postChallenge,
  sanitizeChallengeList,
  sanitizeClaimResponse,
  streetTagLabel,
} from "../engine/streets.mjs";

const roomId = "A".repeat(22);
const hostToken = "H".repeat(43);
const guestToken = "G".repeat(43);
const challengeId = "c".repeat(22);

test("the street tag list is curated and closed", () => {
  assert.ok(STREET_TAGS.length >= 8);
  for (const tag of STREET_TAGS) {
    assert.match(tag.id, /^[a-z]+$/u);
    assert.match(tag.label, /^[A-Z]+$/u);
  }
  assert.equal(isStreetTag("somerset"), true);
  assert.equal(isStreetTag("kensington"), true);
  assert.equal(isStreetTag("<script>"), false);
  assert.equal(isStreetTag(""), false);
  assert.equal(streetTagLabel("broad"), "BROAD");
});

test("challenge posts validate every field before touching the network", () => {
  const body = buildChallengePost({ roomId, hostToken, guestToken, tag: "girard", fighter: "deathblow" });
  assert.deepEqual(body, { roomId, hostToken, guestToken, tag: "girard", fighter: "deathblow" });
  assert.throws(() => buildChallengePost({ roomId: "short", hostToken, guestToken, tag: "girard", fighter: "jez" }), /live private room/u);
  assert.throws(() => buildChallengePost({ roomId, hostToken: "x", guestToken, tag: "girard", fighter: "jez" }), /host/u);
  assert.throws(() => buildChallengePost({ roomId, hostToken, guestToken, tag: "market", fighter: "jez" }), /listed streets/u);
  assert.throws(() => buildChallengePost({ roomId, hostToken, guestToken, tag: "girard", fighter: "JEZ!" }), /fighter/u);
});

test("board listings are sanitized: bad rows drop, tokens are hostile", () => {
  const now = 1_000_000;
  const rows = sanitizeChallengeList({
    challenges: [
      { id: challengeId, tag: "lehigh", fighter: "benny", createdAt: now - 90_000, expiresAt: now + 60_000 },
      { id: "bad id", tag: "lehigh", fighter: "benny", createdAt: now, expiresAt: now + 1 },
      { id: "d".repeat(22), tag: "elm street", fighter: "benny", createdAt: now, expiresAt: now + 1 },
      { id: "e".repeat(22), tag: "broad", fighter: "UPPER", createdAt: now, expiresAt: now + 1 },
      { id: "f".repeat(22), tag: "broad", fighter: "post", createdAt: now - 5_000, expiresAt: now - 1 },
      { id: "g".repeat(22), tag: "broad", fighter: "post", createdAt: now, expiresAt: now + 1, guestToken },
      null,
      "junk",
    ],
  }, now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, challengeId);
  assert.equal(rows[0].tagLabel, "LEHIGH");
  assert.equal(rows[0].ageLabel, "1 MIN AGO");
  assert.ok(!("guestToken" in rows[0]));
});

test("age labels stay coarse", () => {
  assert.equal(challengeAgeLabel(1_000, 30_000), "JUST NOW");
  assert.equal(challengeAgeLabel(0, 60_000), "1 MIN AGO");
  assert.equal(challengeAgeLabel(0, 14 * 60_000 + 5_000), "14 MIN AGO");
});

test("claim responses become guest join credentials exactly once", () => {
  const credentials = sanitizeClaimResponse({ roomId, guestToken, expiresAt: 123 });
  assert.deepEqual(credentials, { roomId, token: guestToken, role: "guest", expiresAt: 123 });
  assert.throws(() => sanitizeClaimResponse({ roomId, guestToken: "nope" }), /already answered/u);
  assert.throws(() => sanitizeClaimResponse(null), /already answered/u);
});

test("fetch helpers hit the versioned endpoints and surface retry hints", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method });
    if (url.endsWith("/v1/challenges") && options.method === "POST") {
      return { ok: true, json: async () => ({ id: challengeId, expiresAt: 42 }) };
    }
    if (url.endsWith("/v1/challenges")) {
      return { ok: true, json: async () => ({ challenges: [{ id: challengeId, tag: "passyunk", fighter: "ali", createdAt: 0, expiresAt: 9_999 }] }) };
    }
    if (url.endsWith(`/v1/challenges/${challengeId}/claim`)) {
      return { ok: true, json: async () => ({ roomId, guestToken, expiresAt: 77 }) };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const options = { apiUrl: "https://signal.test/", fetchImpl, now: 5_000 };
  const posted = await postChallenge({ roomId, hostToken, guestToken, tag: "passyunk", fighter: "ali" }, options);
  assert.deepEqual(posted, { listed: true, id: challengeId, expiresAt: 42 });
  const board = await fetchChallenges(options);
  assert.equal(board.length, 1);
  assert.equal(board[0].fighter, "ali");
  const claim = await claimChallenge(challengeId, options);
  assert.equal(claim.role, "guest");
  assert.equal(claim.token, guestToken);
  assert.deepEqual(calls.map((call) => call.method), ["POST", "GET", "POST"]);
  assert.ok(calls.every((call) => call.url.startsWith("https://signal.test/v1/challenges")));

  const limited = { apiUrl: "https://signal.test", fetchImpl: async () => ({ ok: false, json: async () => ({ error: "Rate exceeded", retryAfterSeconds: 120 }) }) };
  await assert.rejects(() => postChallenge({ roomId, hostToken, guestToken, tag: "broad", fighter: "jez" }, limited), /Rate exceeded.*2 minute/u);
  await assert.rejects(() => claimChallenge("not-an-id", limited), /malformed/u);
});

test("challenge id pattern matches room id discipline", () => {
  assert.match("Ab3dEf6hIj9kLm1nOp4qRs", CHALLENGE_ID_PATTERN);
  assert.doesNotMatch("Ab3dEf6hIj9kLm1nOp4qR", CHALLENGE_ID_PATTERN);
});
