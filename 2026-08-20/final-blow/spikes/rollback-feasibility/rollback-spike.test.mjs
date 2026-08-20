import assert from "node:assert/strict";
import {
  RollbackPeer,
  advanceBattle,
  checksumBattleState,
  createBattleState,
  loadBattleState,
  runRollbackSpike,
  saveBattleState,
  scriptedInput,
} from "./rollback-spike.mjs";

function deterministicRun(frames = 1800) {
  let state = createBattleState(237);
  for (let frame = 0; frame < frames; frame += 1) {
    state = advanceBattle(state, [scriptedInput(0, frame), scriptedInput(1, frame)]);
  }
  return state;
}

const first = deterministicRun();
const second = deterministicRun();
assert.equal(checksumBattleState(first), checksumBattleState(second));
assert.deepEqual(loadBattleState(saveBattleState(first)), first);

const normal = runRollbackSpike({ frames: 3600, minimumLatency: 2, maximumLatency: 6, lossPercent: 3 });
assert.equal(normal.exact, true, "predicted client must converge to the authoritative checksum");
assert.equal(normal.metrics.windowExceeded, 0);
assert.ok(normal.metrics.rollbacks > 0);
assert.ok(normal.metrics.maximumRollback <= 12);
assert.ok(normal.metrics.maximumResimulationMs < 8, "rollback must fit comfortably inside one 16.67 ms frame");
assert.ok(normal.metrics.stateBytes < 2048);

const stressed = runRollbackSpike({ frames: 3600, minimumLatency: 3, maximumLatency: 10, lossPercent: 5 });
assert.equal(stressed.exact, true);
assert.equal(stressed.metrics.windowExceeded, 0);
assert.ok(stressed.metrics.maximumRollback <= 12);
assert.ok(stressed.metrics.maximumResimulationMs < 8);

for (const seed of [1, 42, 1337]) {
  const replay = runRollbackSpike({ frames: 1800, seed, minimumLatency: 2, maximumLatency: 9, lossPercent: 5 });
  assert.equal(replay.exact, true, `seed ${seed} must converge`);
  assert.equal(replay.metrics.windowExceeded, 0);
  assert.ok(replay.metrics.maximumResimulationMs < 8);
}

const boundedFailure = new RollbackPeer({ maxRollbackFrames: 12 });
for (let frame = 0; frame < 20; frame += 1) boundedFailure.advance(0);
boundedFailure.receiveRemoteBatch([[0, 1]]);
assert.equal(boundedFailure.metrics().windowExceeded, 1, "late corrections beyond the window must be detected, not silently applied");

console.log(JSON.stringify({ verdict: "VALIDATED", normal, stressed, boundedFailure: boundedFailure.metrics() }, null, 2));
