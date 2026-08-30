import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BRACKET_SIZES,
  bracketComplete,
  bracketRoundName,
  bracketSnapshot,
  createBracket,
  deserializeBracket,
  nextBracketMatch,
  reportBracketResult,
  serializeBracket,
} from "../engine/bracket.mjs";

const four = () => createBracket([
  { fighter: "deathblow", human: true, label: "JEZ" },
  { fighter: "jez", human: false, difficulty: "pro" },
  { fighter: "benny", human: false, difficulty: "street" },
  { fighter: "post", human: false, difficulty: "rookie" },
]);

const eight = () => createBracket([
  { fighter: "deathblow", human: true },
  { fighter: "jez", human: false, difficulty: "final" },
  { fighter: "benny", human: false },
  { fighter: "post", human: false },
  { fighter: "alan", human: false },
  { fighter: "donald", human: false },
  { fighter: "cyraxx", human: false },
  { fighter: "ali", human: false },
]);

test("brackets seed like a real draw: top seeds cannot meet before the final", () => {
  const bracket4 = four();
  assert.deepEqual(bracket4.rounds[0].map((match) => match.slots), [[0, 3], [1, 2]]);
  const bracket8 = eight();
  assert.deepEqual(bracket8.rounds[0].map((match) => match.slots), [[0, 7], [3, 4], [1, 6], [2, 5]]);
  // Seed 1 and seed 2 sit in opposite halves of the 8-draw.
  const halves = bracket8.rounds[0].map((match) => match.slots);
  const topHalf = [...halves[0], ...halves[1]];
  const bottomHalf = [...halves[2], ...halves[3]];
  assert.ok(topHalf.includes(0) && bottomHalf.includes(1));
  assert.equal(bracket8.rounds.length, 3);
  assert.equal(bracket4.rounds.length, 2);
});

test("entrants are validated and normalized", () => {
  assert.throws(() => createBracket([{ fighter: "deathblow" }]), /4 or 8/u);
  assert.throws(() => createBracket([{ fighter: "BAD ID" }, { fighter: "jez" }, { fighter: "benny" }, { fighter: "post" }]), /needs a fighter/u);
  const bracket = four();
  assert.equal(bracket.entrants[0].label, "JEZ");
  assert.equal(bracket.entrants[0].difficulty, ""); // humans carry no difficulty
  assert.equal(bracket.entrants[1].difficulty, "pro");
  assert.equal(bracket.entrants[2].label, "CPU");
  assert.equal(bracket.entrants[0].seed, 1);
  assert.deepEqual(BRACKET_SIZES, [4, 8]);
});

test("advancement walks the rounds to a champion", () => {
  const bracket = four();
  const first = nextBracketMatch(bracket);
  assert.equal(first.round, 0);
  assert.equal(first.roundName, "SEMIFINALS");
  assert.deepEqual(first.slots, [0, 3]);
  // Stale/duplicate reports refuse.
  assert.equal(reportBracketResult(bracket, 1, 0, 0), null); // final not filled yet
  const semi1 = reportBracketResult(bracket, 0, 0, 0);
  assert.equal(semi1.winner, 0);
  assert.equal(semi1.complete, false);
  assert.equal(reportBracketResult(bracket, 0, 0, 1), null); // already decided
  const semi2 = reportBracketResult(bracket, 0, 1, 1);
  assert.equal(semi2.winner, 2);
  const final = nextBracketMatch(bracket);
  assert.equal(final.round, 1);
  assert.equal(final.roundName, "THE FINAL");
  assert.deepEqual(final.slots, [0, 2]);
  const crown = reportBracketResult(bracket, 1, 0, 1);
  assert.equal(crown.champion, 2);
  assert.equal(crown.complete, true);
  assert.equal(bracketComplete(bracket), true);
  assert.equal(nextBracketMatch(bracket), null);
  assert.equal(bracket.playedMatches, 3);
});

test("an 8-draw resolves through quarterfinals, semifinals and the final", () => {
  const bracket = eight();
  assert.equal(bracketRoundName(8, 0), "QUARTERFINALS");
  let guard = 0;
  while (!bracketComplete(bracket) && guard < 10) {
    const match = nextBracketMatch(bracket);
    // Higher seed (lower entrant index) always wins this scripted run.
    const winnerSide = match.slots[0] < match.slots[1] ? 0 : 1;
    reportBracketResult(bracket, match.round, match.index, winnerSide);
    guard += 1;
  }
  assert.equal(guard, 7);
  assert.equal(bracket.champion, 0);
  const snapshot = bracketSnapshot(bracket);
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.next, null);
  assert.equal(snapshot.rounds[2][0].winner, 0);
});

test("persistence round-trips mid-bracket and refuses tampered blobs", () => {
  const bracket = eight();
  const quarter = nextBracketMatch(bracket);
  reportBracketResult(bracket, quarter.round, quarter.index, 0);
  reportBracketResult(bracket, 0, 1, 1);
  bracket.createdAt = 1_234;
  const stored = serializeBracket(bracket);
  const restored = deserializeBracket(stored);
  assert.ok(restored);
  assert.equal(restored.playedMatches, 2);
  assert.equal(restored.createdAt, 1_234);
  assert.deepEqual(bracketSnapshot(restored).rounds, bracketSnapshot(bracket).rounds);
  const upNext = nextBracketMatch(restored);
  assert.deepEqual(upNext, nextBracketMatch(bracket));
  // Tampering: a winner who never sat in that match refuses the whole blob.
  const doctored = JSON.parse(stored);
  doctored.winners[1][0] = 5;
  assert.equal(deserializeBracket(JSON.stringify(doctored)), null);
  // Garbage and version drift refuse quietly.
  assert.equal(deserializeBracket("{"), null);
  assert.equal(deserializeBracket(JSON.stringify({ ...JSON.parse(stored), format: 99 })), null);
  assert.equal(deserializeBracket(JSON.stringify({ format: 1, size: 6, entrants: [], winners: [] })), null);
});

test("a completed bracket serializes and resumes as champion", () => {
  const bracket = four();
  while (!bracketComplete(bracket)) {
    const match = nextBracketMatch(bracket);
    reportBracketResult(bracket, match.round, match.index, 0);
  }
  const restored = deserializeBracket(serializeBracket(bracket));
  assert.equal(restored.champion, bracket.champion);
  assert.equal(bracketComplete(restored), true);
});
