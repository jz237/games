import assert from "node:assert/strict";
import {
  ARCADE_BOSS_ID,
  ARCADE_ENDINGS,
  ARCADE_RIVALS,
  arcadeRunSnapshot,
  createArcadeRun,
  currentArcadeMatch,
  getArcadeEnding,
  recordArcadeResult,
} from "../engine/arcade.mjs";

const fighters = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali"];

function testCompleteDeterministicLadder() {
  const first = createArcadeRun("deathblow", fighters, 237);
  const second = createArcadeRun("deathblow", fighters, 237);
  assert.deepEqual(arcadeRunSnapshot(first), arcadeRunSnapshot(second));
  assert.equal(first.matches.length, 8);
  assert.equal(first.matches.at(-1).opponentId, ARCADE_BOSS_ID);
  assert.equal(first.matches.at(-1).kind, "boss");
  assert.equal(first.matches.at(-2).opponentId, ARCADE_RIVALS.deathblow);
  assert.equal(first.matches.at(-2).kind, "rival");
  assert.equal(new Set(first.matches.map(({ opponentId }) => opponentId)).size, 8);
  assert.ok(!first.matches.some(({ opponentId }) => opponentId === "deathblow"));
  assert.ok(first.matches.some(({ stage }) => stage === "janney"), "the vacant lot must appear in Arcade");
  assert.ok(new Set(first.matches.slice(0, -1).map(({ stage }) => stage)).size >= 5, "Arcade must rotate through the expanded stage list");
}

function testProgressAndRetry() {
  const run = createArcadeRun("jez", fighters, 99);
  const opening = currentArcadeMatch(run);
  const loss = recordArcadeResult(run, false);
  assert.equal(loss.advanced, false);
  assert.equal(run.current, 0);
  assert.equal(run.losses, 1);
  assert.equal(currentArcadeMatch(run), opening);
  for (let index = 0; index < 8; index += 1) recordArcadeResult(run, true);
  assert.equal(run.wins, 8);
  assert.equal(run.current, 8);
  assert.equal(run.completed, true);
  assert.equal(run.defeated.at(-1), ARCADE_BOSS_ID);
  assert.equal(currentArcadeMatch(run), null);
}

function testEightUniqueEndings() {
  // Wave 16: the secret ninth ending joins the eight mains.
  // Wave 17: the Pinelands Devil makes it ten.
  const endingIds = [...fighters, "devil", ARCADE_BOSS_ID];
  assert.deepEqual(Object.keys(ARCADE_ENDINGS), endingIds);
  assert.equal(new Set(endingIds.map((id) => getArcadeEnding(id).title)).size, 10);
  for (const id of endingIds) {
    const ending = getArcadeEnding(id);
    assert.ok(ending.quote.length > 12);
    assert.ok(ending.story.length > 60);
  }
}

// Wave 16: the unlocked Commissioner climbs his own book — all eight mains in
// shuffled order, no rival beat, then the boss-mirror FINAL BOUT at the Vet.
function testCommissionerMirrorLadder() {
  const run = createArcadeRun(ARCADE_BOSS_ID, fighters, 41);
  const rerun = createArcadeRun(ARCADE_BOSS_ID, fighters, 41);
  assert.deepEqual(arcadeRunSnapshot(run), arcadeRunSnapshot(rerun));
  assert.equal(run.matches.length, 9, "eight challengers plus the mirror final");
  assert.equal(run.rivalId, null);
  assert.ok(run.matches.slice(0, -1).every(({ kind }) => kind === "challenger"));
  assert.deepEqual(new Set(run.matches.slice(0, -1).map(({ opponentId }) => opponentId)), new Set(fighters));
  const final = run.matches.at(-1);
  assert.equal(final.opponentId, ARCADE_BOSS_ID);
  assert.equal(final.kind, "boss");
  assert.equal(final.stage, "vet");
  for (let index = 0; index < 9; index += 1) recordArcadeResult(run, true);
  assert.equal(run.completed, true);
}

testCompleteDeterministicLadder();
testProgressAndRetry();
testEightUniqueEndings();
testCommissionerMirrorLadder();

console.log("Final Blow arcade ladder tests passed");
