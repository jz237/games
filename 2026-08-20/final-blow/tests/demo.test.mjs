import assert from "node:assert/strict";
import test from "node:test";
import { createDemoDirector, demoMatchupKey } from "../engine/demo.mjs";

const fighters = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali"];
const stages = ["kensington", "vet", "wildwood", "buffet", "cruise", "janney"];

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
