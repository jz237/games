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
  assert.deepEqual(Object.keys(ARCADE_ENDINGS), fighters);
  assert.equal(new Set(fighters.map((id) => getArcadeEnding(id).title)).size, 8);
  for (const id of fighters) {
    const ending = getArcadeEnding(id);
    assert.ok(ending.quote.length > 12);
    assert.ok(ending.story.length > 60);
  }
}

testCompleteDeterministicLadder();
testProgressAndRetry();
testEightUniqueEndings();

console.log("Final Blow arcade ladder tests passed");
