import assert from "node:assert/strict";
import test from "node:test";
import {
  ONLINE_QOL_LEVEL,
  SET_LENGTHS,
  connectionTier,
  createSetState,
  ewma,
  normalizeSetLength,
  recordSetWin,
  sanitizeLobbyQol,
  sanitizeSetSync,
  setComplete,
  setPointSides,
  setSummary,
  setWinnerSide,
  stagePickerRole,
  validReturnLobbyMessage,
} from "../engine/online-qol.mjs";

test("set lengths normalize to the FT menu", () => {
  assert.equal(normalizeSetLength(1), 1);
  assert.equal(normalizeSetLength("3"), 3);
  assert.equal(normalizeSetLength(5), 5);
  assert.equal(normalizeSetLength(4), 1);
  assert.equal(normalizeSetLength(undefined), 1);
  assert.equal(normalizeSetLength("garbage"), 1);
});

test("first-to-N set math: score, set point, completion", () => {
  const set = createSetState(3);
  assert.deepEqual(set.scores, [0, 0]);
  assert.deepEqual(setPointSides(set), [false, false]);

  recordSetWin(set, 0, { matchKey: "m1", picks: ["deathblow", "jez"], rounds: [2, 0] });
  recordSetWin(set, 0, { matchKey: "m2", picks: ["deathblow", "jez"], rounds: [2, 1] });
  assert.deepEqual(set.scores, [2, 0]);
  assert.deepEqual(setPointSides(set), [true, false]);
  assert.equal(setComplete(set), false);

  recordSetWin(set, 1, { matchKey: "m3" });
  recordSetWin(set, 1, { matchKey: "m4" });
  assert.deepEqual(set.scores, [2, 2]);
  assert.deepEqual(setPointSides(set), [true, true]);

  const summary = recordSetWin(set, 1, { matchKey: "m5" });
  assert.deepEqual(set.scores, [2, 3]);
  assert.equal(summary.complete, true);
  assert.equal(summary.winnerSide, 1);
  assert.equal(setWinnerSide(set), 1);
  // Finished sets refuse further folds.
  assert.equal(recordSetWin(set, 0, { matchKey: "m6" }), null);
  assert.equal(set.history.length, 5);
});

test("set folds dedupe by match key and single-match sessions stay inert", () => {
  const set = createSetState(2);
  assert.ok(recordSetWin(set, 0, { matchKey: "match-a" }));
  assert.equal(recordSetWin(set, 0, { matchKey: "match-a" }), null);
  assert.deepEqual(set.scores, [1, 0]);

  const single = createSetState(1);
  assert.equal(recordSetWin(single, 0, { matchKey: "solo" }), null);
  assert.deepEqual(single.scores, [0, 0]);
  assert.equal(setWinnerSide(single), -1);
});

test("set sync payload sanitizes hostile shapes", () => {
  const clean = sanitizeSetSync({ scores: [2, "1"], history: [{ winner: 1, picks: ["jez"], rounds: [2] }] }, 3);
  assert.deepEqual(clean.scores, [2, 1]);
  assert.equal(clean.length, 3);
  assert.equal(clean.history[0].winner, 1);
  assert.deepEqual(clean.history[0].rounds, [2, 0]);
  const junk = sanitizeSetSync("garbage", 5);
  assert.deepEqual(junk.scores, [0, 0]);
  assert.equal(junk.length, 5);
  const flood = sanitizeSetSync({ scores: [9999, -4], history: new Array(200).fill({ winner: 0 }) }, 2);
  assert.deepEqual(flood.scores, [9, 0]);
  assert.equal(flood.history.length, 32);
});

test("connection tier blends ping, jitter, rollback depth and stalls", () => {
  assert.equal(connectionTier({ pingMs: 30, jitterMs: 4, rollbackDepth: 1, stalledRecent: 0 }).tier, 0);
  assert.equal(connectionTier({ pingMs: 90, jitterMs: 8, rollbackDepth: 1, stalledRecent: 0 }).tier, 1);
  assert.equal(connectionTier({ pingMs: 150, jitterMs: 10, rollbackDepth: 2, stalledRecent: 0 }).tier, 2);
  assert.equal(connectionTier({ pingMs: 400, jitterMs: 10, rollbackDepth: 0, stalledRecent: 0 }).tier, 3);
  // The worst factor wins even when ping looks clean.
  assert.equal(connectionTier({ pingMs: 30, jitterMs: 4, rollbackDepth: 9, stalledRecent: 0 }).tier, 3);
  assert.equal(connectionTier({ pingMs: 30, jitterMs: 4, rollbackDepth: 0, stalledRecent: 6 }).tier, 2);
  // Missing samples read as healthy rather than alarming.
  assert.equal(connectionTier({}).tier, 0);
  assert.equal(connectionTier({ pingMs: null, jitterMs: null }).tier, 0);
  const rough = connectionTier({ pingMs: 500 });
  assert.equal(rough.label, "ROUGH");
  assert.equal(rough.grade, "red");
});

test("ewma seeds from the first sample and ignores junk", () => {
  assert.equal(ewma(null, 100), 100);
  assert.equal(ewma(100, 200, 0.5), 150);
  assert.equal(ewma(100, Number.NaN, 0.5), 100);
  assert.equal(ewma(undefined, 80), 80);
});

test("lobby QoL fields default to the 2.3 behaviour for older peers", () => {
  const older = sanitizeLobbyQol({ type: "lobby-state", fighter: "jez", ready: true });
  assert.deepEqual(older, { qol: 0, ping: null, setLength: 1 });
  const qol = sanitizeLobbyQol({ qol: 1, ping: 87.6, setLength: 5 });
  assert.deepEqual(qol, { qol: 1, ping: 88, setLength: 5 });
  const hostile = sanitizeLobbyQol({ qol: "9", ping: -50, setLength: 999 });
  assert.deepEqual(hostile, { qol: 1, ping: null, setLength: 1 });
  assert.equal(ONLINE_QOL_LEVEL, 1);
});

test("return-lobby control message is validated against the live match", () => {
  const matchId = "abcd-1234-efgh-5678";
  assert.equal(validReturnLobbyMessage({ type: "return-lobby", matchId }, matchId), true);
  assert.equal(validReturnLobbyMessage({ type: "return-lobby", matchId: "other" }, matchId), false);
  assert.equal(validReturnLobbyMessage({ type: "return-lobby" }, matchId), false);
  assert.equal(validReturnLobbyMessage({ type: "rematch-vote", matchId }, matchId), false);
  assert.equal(validReturnLobbyMessage(null, matchId), false);
});

test("loser picks the stage only when both peers speak QoL", () => {
  assert.equal(stagePickerRole({ localQol: 1, remoteQol: 1, lastLoserRole: "guest" }), "guest");
  assert.equal(stagePickerRole({ localQol: 1, remoteQol: 1, lastLoserRole: "host" }), "host");
  // Older opponent, no loser yet, or junk role → the 2.3 host rule.
  assert.equal(stagePickerRole({ localQol: 1, remoteQol: 0, lastLoserRole: "guest" }), "host");
  assert.equal(stagePickerRole({ localQol: 1, remoteQol: 1, lastLoserRole: "" }), "host");
  assert.equal(stagePickerRole({ localQol: 1, remoteQol: 1, lastLoserRole: "spectator" }), "host");
  assert.equal(stagePickerRole({}), "host");
});

test("match-start config set snapshot round-trips through sanitizeSetSync", () => {
  assert.deepEqual([...SET_LENGTHS], [1, 2, 3, 5]);
  // Host folds two wins, snapshots the set into the shared config…
  const hostSet = createSetState(3);
  recordSetWin(hostSet, 0, { matchKey: "m1", picks: ["deathblow", "jez"], rounds: [2, 0] });
  recordSetWin(hostSet, 1, { matchKey: "m2", picks: ["deathblow", "jez"], rounds: [1, 2] });
  const config = {
    setLength: hostSet.length,
    set: { length: hostSet.length, scores: [...hostSet.scores], history: hostSet.history.map((entry) => ({ ...entry })) },
  };
  // …and the guest adopts an identical scoreboard from the wire shape.
  const guestSet = sanitizeSetSync(config.set, config.setLength);
  assert.deepEqual(guestSet.scores, hostSet.scores);
  assert.equal(guestSet.length, hostSet.length);
  assert.equal(guestSet.history.length, 2);
  assert.deepEqual(guestSet.history[1].picks, ["deathblow", "jez"]);
  // Continuing the set on the guest matches the host's next fold.
  const summary = recordSetWin(guestSet, 0, { matchKey: "m3" });
  assert.deepEqual(summary.scores, [2, 1]);
  assert.deepEqual(summary.setPoint, [true, false]);
});

test("loser-picks-stage flips with each result and survives a QoL downgrade", () => {
  let lastLoserRole = "";
  const roleAfter = (winnerSide) => {
    lastLoserRole = winnerSide === 0 ? "guest" : "host";
    return stagePickerRole({ localQol: ONLINE_QOL_LEVEL, remoteQol: 1, lastLoserRole });
  };
  assert.equal(stagePickerRole({ localQol: ONLINE_QOL_LEVEL, remoteQol: 1, lastLoserRole }), "host");
  assert.equal(roleAfter(0), "guest");
  assert.equal(roleAfter(1), "host");
  assert.equal(roleAfter(0), "guest");
  // The opponent reconnecting on an older build snaps back to host-picks.
  assert.equal(stagePickerRole({ localQol: ONLINE_QOL_LEVEL, remoteQol: 0, lastLoserRole }), "host");
});

test("set summary is a detached copy", () => {
  const set = createSetState(2);
  recordSetWin(set, 0, { matchKey: "a", picks: ["benny", "post"], rounds: [2, 1] });
  const summary = setSummary(set);
  summary.scores[0] = 99;
  summary.history[0].picks[0] = "mutated";
  assert.equal(set.scores[0], 1);
  assert.equal(set.history[0].picks[0], "benny");
});
