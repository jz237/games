import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_BEATS,
  DEMO_COVERAGE_BLEND,
  createDemoChoreographer,
  demoCoverageChecklist,
  demoCoverageMoveId,
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
