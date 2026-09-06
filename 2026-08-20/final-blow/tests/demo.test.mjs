import assert from "node:assert/strict";
import test from "node:test";
import { createDemoDirector, demoMatchupKey } from "../engine/demo.mjs";

const fighters = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali"];
const stages = ["somerset", "vet", "wildwood", "buffet", "cruise", "janney"];

test("demo director is deterministic and exhausts every matchup before repeating", () => {
  const first = createDemoDirector({ fighterIds: fighters, stageIds: stages, trackCount: 4, seed: 237 });
  const second = createDemoDirector({ fighterIds: fighters, stageIds: stages, trackCount: 4, seed: 237 });
  const firstCycle = Array.from({ length: 56 }, () => first.next());
  const secondCycle = Array.from({ length: 56 }, () => second.next());
  assert.deepEqual(firstCycle, secondCycle);
  for (const cycle of firstCycle) assert.notEqual(cycle.picks[0], cycle.picks[1]);
  assert.equal(new Set(firstCycle.slice(0, 28).map(({ picks }) => demoMatchupKey(...picks))).size, 28);
  assert.equal(new Set(firstCycle.slice(28).map(({ picks }) => demoMatchupKey(...picks))).size, 28);
  assert.notEqual(
    demoMatchupKey(...firstCycle[27].picks),
    demoMatchupKey(...firstCycle[28].picks),
    "shuffle-bag boundaries must not immediately repeat a matchup",
  );
});

test("stage and soundtrack bags cover every choice without adjacent repeats", () => {
  const director = createDemoDirector({ fighterIds: fighters, stageIds: stages, trackCount: 4, seed: 99 });
  const cycles = Array.from({ length: 40 }, () => director.next());
  for (let index = 1; index < cycles.length; index += 1) {
    assert.notEqual(cycles[index].stage, cycles[index - 1].stage);
    assert.notEqual(cycles[index].track, cycles[index - 1].track);
  }
  for (let index = 0; index < cycles.length; index += 4) {
    assert.equal(new Set(cycles.slice(index, index + 4).map(({ track }) => track)).size, 4);
  }
});

test("ten thousand attract cycles retain only bounded shuffle bags", () => {
  const director = createDemoDirector({ fighterIds: fighters, stageIds: stages, trackCount: 4, seed: 0x15 });
  let previous = null;
  for (let index = 0; index < 10_000; index += 1) {
    const cycle = director.next();
    const key = demoMatchupKey(...cycle.picks);
    assert.notEqual(key, previous);
    previous = key;
  }
  const snapshot = director.snapshot();
  assert.equal(snapshot.cycle, 10_000);
  assert.ok(snapshot.remainingMatchups < snapshot.matchupCount);
  assert.ok(snapshot.remainingStages < stages.length);
  assert.ok(snapshot.remainingTracks < 4);
});

test("demo director rejects unusable rosters, stages and soundtrack sets", () => {
  assert.throws(() => createDemoDirector({ fighterIds: ["solo"], stageIds: stages, trackCount: 4 }), /two different/);
  assert.throws(() => createDemoDirector({ fighterIds: fighters, stageIds: [], trackCount: 4 }), /one stage/);
  assert.throws(() => createDemoDirector({ fighterIds: fighters, stageIds: stages, trackCount: 0 }), /one soundtrack/);
});

test("the stage bag reaches every stage before repeating any of them", () => {
  const director = createDemoDirector({ fighterIds: fighters, stageIds: stages, trackCount: 4, seed: 8123 });
  const seen = new Set();
  let previous = null;
  for (let cycle = 0; cycle < stages.length * 3; cycle += 1) {
    const match = director.next();
    seen.add(match.stage);
    assert.notEqual(match.stage, previous, "the same stage must never run twice in a row");
    previous = match.stage;
  }
  assert.deepEqual([...seen].sort(), [...stages].sort(), "every stage must appear in the rotation");
});

// ---------------------------------------------------------------------------
// 5.4 FIGHT NIGHT (sweep #26/#27) — director.peek(): the next pair without
// consuming the bag. The contract is "bag semantics unchanged": a director that
// peeks before every next() produces the identical cycle stream and the
// identical rng state as one that never peeks, including across the shuffle-
// bag boundary (where peek performs the refill next() would have performed).
// ---------------------------------------------------------------------------
test("peek() names the next pair, stage and track without consuming them, and never perturbs next()", () => {
  const plain = createDemoDirector({ fighterIds: fighters, stageIds: stages, trackCount: 4, seed: 237 });
  const peeking = createDemoDirector({ fighterIds: fighters, stageIds: stages, trackCount: 4, seed: 237 });
  // 28 unordered pairs for 8 fighters: 70 cycles cross the bag boundary twice.
  for (let index = 0; index < 70; index += 1) {
    const first = peeking.peek();
    const again = peeking.peek();
    assert.deepEqual(again, first, "peek is idempotent");
    assert.equal(first.cycle, index + 1);
    const cycle = peeking.next();
    assert.deepEqual(plain.next(), cycle, `cycle ${index + 1} identical with and without a peek`);
    assert.equal(cycle.cycle, first.cycle);
    assert.equal(demoMatchupKey(...cycle.picks), demoMatchupKey(...first.pair), "the peeked pair is the pair next() seats");
    assert.equal(cycle.stage, first.stage);
    assert.equal(cycle.track, first.track);
    assert.deepEqual(peeking.snapshot(), plain.snapshot(), "rng state and bag counts agree after every cycle");
  }
});

test("peek() at a bag boundary refills the way next() would, and a peeked pair is frozen data", () => {
  const director = createDemoDirector({ fighterIds: fighters, stageIds: stages, trackCount: 4, seed: 99 });
  for (let index = 0; index < 28; index += 1) director.next();
  assert.equal(director.snapshot().remainingMatchups, 0, "the bag is empty at the boundary");
  const last = director.snapshot().lastMatchup;
  const next = director.peek();
  assert.equal(director.snapshot().remainingMatchups, 28, "peek refilled the bag early");
  assert.notEqual(demoMatchupKey(...next.pair), demoMatchupKey(...last), "the refill keeps the no-immediate-repeat rule");
  assert.ok(Object.isFrozen(next) && Object.isFrozen(next.pair));
  assert.throws(() => { next.pair[0] = "nobody"; }, TypeError);
  const cycle = director.next();
  assert.equal(demoMatchupKey(...cycle.picks), demoMatchupKey(...next.pair));
  assert.equal(director.snapshot().remainingMatchups, 27);
});
