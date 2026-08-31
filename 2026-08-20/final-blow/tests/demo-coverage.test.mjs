import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_BEATS,
  DEMO_COVERAGE_BLEND,
  createDemoChoreographer,
  demoCoverageChecklist,
  demoCoverageMoveId,
  demoStagingBand,
} from "../engine/demo-choreo.mjs";
import { createDemoDirector, demoMatchupKey } from "../engine/demo.mjs";
import { createMockWorld } from "./demo-mock-world.mjs";
import { FIGHTER_KITS } from "../engine/fighter-kits.mjs";
import { GRIT_RULES } from "../engine/combos.mjs";

const ROSTER_10 = Object.keys(FIGHTER_KITS);
const STAGES_6 = ["somerset", "vet", "wildwood", "buffet", "cruise", "janney"];

// ---------------------------------------------------------------------------
// A deterministic sim-lite world that honours the same contracts the real
// game.js wiring gives the choreographer: raw inputs in, noteMove() fired for
// every started move with the true action+context, noteBeat() fired from the
// same event sites (dizzy, knockdown, wall splat, grab, taunt, pickup), and
// observe() fed a per-tick view for the movement/guard/wake edges. It also
// reproduces the traps that shaped the choreography: the SF2 proximity-grab
// conversion, grounded-only advanced actions, meter gates, throwable stock,
// stun decay and the dash double-tap window.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

test("the coverage checklist spans the full kit grid for all ten fighters", () => {
  assert.equal(ROSTER_10.length, 10);
  for (const fighterId of ROSTER_10) {
    const checklist = demoCoverageChecklist(fighterId);
    for (const id of [
      "standLight", "forwardLight", "crouchLight", "standLightKick", "forwardLightKick", "crouchLightKick",
      "standHeavy", "overhead", "crouchHeavy", "standHeavyKick", "forwardHeavyKick", "crouchHeavyKick",
      "airLight", "airLightKick", "airHeavy", "airHeavyKick", "airSpecial",
      "special", "commandSpecial", "backSpecial", "launcher", "driveHeavy",
      "enhanced", "enhancedCommandSpecial", "enhancedBackSpecial", "enhancedLauncher",
      "super", "throw", "throwObject", "enhancedThrowObject",
    ]) {
      assert.ok(checklist.includes(id), `${fighterId} checklist must include ${id}`);
    }
  }
  assert.equal(demoCoverageMoveId("light", { crouching: true, limb: "kick" }), "crouchLightKick");
  assert.equal(demoCoverageMoveId("heavy", { forwardHeld: true }), "overhead");
  assert.equal(demoCoverageMoveId("special", { airborne: true }), "airSpecial");
  assert.equal(demoCoverageMoveId("enhancedBackSpecial", {}), "enhancedBackSpecial");
});

test("a bounded demo exhibition shows the entire kit and every staged beat", () => {
  const { choreo, tick } = createMockWorld({
    pair: ["deathblow", "jez"], stageId: "somerset", hasStageWeapon: true, seed: 237,
  });
  for (let frame = 0; frame < 14_000; frame += 1) tick();
  const coverage = choreo.coverage();
  for (const fighterId of ["deathblow", "jez"]) {
    const entry = coverage[fighterId];
    assert.deepEqual(entry.missingMoves, [], `${fighterId} must show 100% of its kit (missing: ${entry.missingMoves.join(", ")})`);
    assert.equal(entry.movesShown, entry.movesTotal);
  }
  const beatTotals = Object.fromEntries(DEMO_BEATS.map((beat) => [
    beat,
    coverage.deathblow.beats[beat] + coverage.jez.beats[beat],
  ]));
  for (const beat of [
    "wallsplat", "juggle", "counterhit", "dizzy", "knockdown", "wakeup",
    "throw", "taunt", "guardedContact",
    "dashForward", "dashBack", "jumpForward", "jumpNeutral", "jumpBack",
    "weaponPickup",
    // v2.9 FLOW: the motion2 animation beats join the bounded coverage —
    // crouch transitions and air attacks fall out of the staged normals,
    // the turnaround is staged as a close-range cross-up.
    "crouchTrans", "turnaround", "airAttack",
  ]) {
    assert.ok(beatTotals[beat] >= 1, `staged beat ${beat} must appear at least once (got ${beatTotals[beat]})`);
  }
  const stats = choreo.stats();
  assert.ok(stats.naturalWindows > 0, "the blend must hand real windows back to the archetype AI");
  assert.ok(stats.coveragePicks > stats.naturalWindows, "coverage picks must dominate the blend");
  assert.ok(DEMO_COVERAGE_BLEND > 0.5 && DEMO_COVERAGE_BLEND < 1);
  // v2.9 FLOW throughput floor. The first pass issued 6-16 directives for a
  // WHOLE three-round exhibition, which is why a fighter showed a median of
  // 11 of its 30 moves however long the match ran: the pipeline, not the
  // health bars, was the limit. Both lanes now run in parallel, a directive
  // ends the tick its move comes out and confirmed hits chain into the next
  // checklist entry, so the bounded harness issues hundreds.
  assert.ok(stats.coveragePicks >= 300,
    `the pipeline must issue directives continuously (got ${stats.coveragePicks})`);
  assert.ok(stats.chainLinks > 0, "confirmed hits must chain into the next checklist item");
  assert.ok(stats.feedTicks > 0, "duet beats must actually put the partner to work");
});

test("a bounded exhibition reaches the moves the first pass never showed", () => {
  // Every one of these was never (or effectively never) observed across the
  // critic's five-seed sweep: the crouching and forward command normals were
  // being eaten by the motion recogniser (forward+PUNCH resolved as ↓→+PUNCH),
  // the air normals were staged from a constant distance, and the throwables
  // and stage weapon were never reached at all.
  const NEVER_SHOWN_BEFORE = [
    "forwardLight", "forwardLightKick", "overhead", "forwardHeavyKick",
    "crouchLight", "crouchLightKick", "crouchHeavy", "crouchHeavyKick",
    "airLight", "airLightKick", "airHeavy", "airHeavyKick", "airSpecial",
    "throwObject", "enhancedThrowObject",
  ];
  for (const [pair, stageId, seed] of [
    [["deathblow", "jez"], "somerset", 909],
    [["donald", "cyraxx"], "wildwood", 5150],
  ]) {
    const { choreo, tick } = createMockWorld({ pair, stageId, hasStageWeapon: true, seed });
    for (let frame = 0; frame < 14_000; frame += 1) tick();
    const coverage = choreo.coverage();
    for (const fighterId of pair) {
      for (const id of NEVER_SHOWN_BEFORE) {
        assert.ok(coverage[fighterId].moves[id] > 0,
          `${fighterId} must reach ${id} (seed ${seed})`);
      }
    }
    const beats = Object.fromEntries(DEMO_BEATS.map((beat) => [
      beat, coverage[pair[0]].beats[beat] + coverage[pair[1]].beats[beat],
    ]));
    // The 2.9 motion beats the census found drawing on ZERO ticks.
    for (const beat of ["guardedContact", "dashForward", "dashBack", "crouchTrans", "jumpNeutral", "airAttack", "weaponPickup"]) {
      assert.ok(beats[beat] >= 1, `${beat} must be staged (seed ${seed}, got ${beats[beat]})`);
    }
  }
});

test("staging distances come from the move's own hitboxes, not a constant", () => {
  // approach:165 for every standing normal and a 160-215 band for the command
  // normals were both outside real reach for most of the roster, which is
  // where the 50% whiff rate came from.
  for (const fighterId of ROSTER_10) {
    const bands = Object.fromEntries(
      demoCoverageChecklist(fighterId).map((id) => [id, demoStagingBand(fighterId, id)]),
    );
    for (const [id, band] of Object.entries(bands)) {
      assert.ok(band.max > band.min, `${fighterId} ${id} band must be non-empty`);
    }
    // A short jab and a rushing command special cannot share a staging
    // distance: the bands must genuinely differ per move.
    assert.ok(bands.standHeavy.max > bands.standLight.max,
      `${fighterId} must stage its heavy from further out than its jab`);
    // The SF2 proximity grab converts a forward-held LIGHT inside ~119px into
    // a throw, so the forward light bands must start outside it.
    for (const id of ["forwardLight", "forwardLightKick"]) {
      assert.ok(bands[id].min > 119,
        `${fighterId} ${id} must be staged outside proximity-grab range (got ${bands[id].min})`);
    }
  }
});

test("a returning fighter leads with what the cabinet has not shown yet", () => {
  // The cumulative attract ledger: an exhibition cannot honestly fit 30 moves
  // per side every time, so a fighter that comes back around the rotation
  // opens with its unshown column.
  const first = createMockWorld({ pair: ["benny", "ali"], stageId: "vet", hasStageWeapon: false, seed: 31 });
  for (let frame = 0; frame < 900; frame += 1) first.tick();
  const carry = first.choreo.carryover();
  assert.deepEqual(Object.keys(carry).sort(), ["ali", "benny"]);
  const shownFirst = Object.entries(carry.benny).filter(([, count]) => count > 0).map(([id]) => id);
  assert.ok(shownFirst.length > 0, "the first exhibition must bank something");

  const cold = createMockWorld({ pair: ["benny", "ali"], stageId: "vet", hasStageWeapon: false, seed: 77 });
  const warm = createMockWorld({
    pair: ["benny", "ali"], stageId: "vet", hasStageWeapon: false, seed: 77, priorShown: carry,
  });
  for (let frame = 0; frame < 700; frame += 1) { cold.tick(); warm.tick(); }
  const freshCold = Object.entries(cold.choreo.coverage().benny.moves)
    .filter(([id, count]) => count > 0 && !shownFirst.includes(id)).length;
  const freshWarm = Object.entries(warm.choreo.coverage().benny.moves)
    .filter(([id, count]) => count > 0 && !shownFirst.includes(id)).length;
  assert.ok(freshWarm >= freshCold,
    `the carried ledger must not show FEWER new moves (cold ${freshCold}, warm ${freshWarm})`);
  // And the ledger keeps accumulating rather than resetting.
  const combined = warm.choreo.carryover();
  for (const id of shownFirst) {
    assert.ok(combined.benny[id] >= carry.benny[id], `${id} must survive the carry`);
  }
});

test("a stage without a weapon never chases the pickup beat but covers the rest", () => {
  const { choreo, tick } = createMockWorld({
    pair: ["devil", "commissioner"], stageId: "janney", hasStageWeapon: false, seed: 8123,
  });
  for (let frame = 0; frame < 14_000; frame += 1) tick();
  const coverage = choreo.coverage();
  for (const fighterId of ["devil", "commissioner"]) {
    assert.deepEqual(coverage[fighterId].missingMoves, [], `${fighterId} must show 100% of its kit`);
    assert.equal(coverage[fighterId].beats.weaponPickup, 0);
  }
  const dizzyTotal = coverage.devil.beats.dizzy + coverage.commissioner.beats.dizzy;
  assert.ok(dizzyTotal >= 1, "the dizzy beat must still be staged");
});

test("choreography is deterministic: same seed, same coverage ledger", () => {
  const runs = [1, 2].map(() => {
    const { choreo, tick } = createMockWorld({
      pair: ["benny", "ali"], stageId: "vet", hasStageWeapon: true, seed: 424,
    });
    for (let frame = 0; frame < 6_000; frame += 1) tick();
    return { coverage: choreo.coverage(), stats: choreo.stats() };
  });
  assert.deepEqual(runs[0], runs[1]);
});

test("noteMove only credits ids on the featured fighter's checklist", () => {
  const choreo = createDemoChoreographer({ pair: ["deathblow", "jez"], stageId: "vet", hasStageWeapon: false, seed: 1 });
  choreo.noteMove(0, "light", {});
  choreo.noteMove(0, "modded-nonsense", {});
  choreo.noteMove(2, "light", {});
  const coverage = choreo.coverage();
  assert.equal(coverage.deathblow.moves.standLight, 1);
  assert.ok(!("modded-nonsense" in coverage.deathblow.moves));
});

test("the demo rotation reaches all ten fighters and all six stages without immediate repeats", () => {
  const director = createDemoDirector({ fighterIds: ROSTER_10, stageIds: STAGES_6, trackCount: 4, seed: 237 });
  const matchupCount = (ROSTER_10.length * (ROSTER_10.length - 1)) / 2;
  assert.equal(matchupCount, 45);
  const fightersSeen = new Set();
  const stagesSeen = new Set();
  const keys = [];
  let previousKey = null;
  let previousStage = null;
  for (let index = 0; index < matchupCount; index += 1) {
    const cycle = director.next();
    const key = demoMatchupKey(...cycle.picks);
    assert.notEqual(key, previousKey, "no immediate matchup repeats");
    assert.notEqual(cycle.stage, previousStage, "no immediate stage repeats");
    previousKey = key;
    previousStage = cycle.stage;
    keys.push(key);
    cycle.picks.forEach((id) => fightersSeen.add(id));
    stagesSeen.add(cycle.stage);
  }
  assert.equal(new Set(keys).size, matchupCount, "a full bag features every pairing exactly once");
  assert.equal(fightersSeen.size, 10, "all ten fighters appear across the demo cycle");
  assert.equal(stagesSeen.size, 6, "all six stages appear across the demo cycle");
});
