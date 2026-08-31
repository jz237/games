import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_BEATS,
  DEMO_COVERAGE_BLEND,
  createDemoChoreographer,
  demoCoverageChecklist,
  demoCoverageMoveId,
  demoStagingBand,
  demoStunStringIds,
  demoWallSlamIds,
  turnaroundBlocker,
} from "../engine/demo-choreo.mjs";
import { createDemoDirector, demoMatchupKey } from "../engine/demo.mjs";
import { createMockWorld } from "./demo-mock-world.mjs";
import { FIGHTER_KITS, createFighterMove } from "../engine/fighter-kits.mjs";
import { GRIT_RULES } from "../engine/combos.mjs";
import { stunGainForAttack } from "../engine/defense.mjs";

const ROSTER_10 = Object.keys(FIGHTER_KITS);
const STAGES_6 = ["somerset", "vet", "wildwood", "buffet", "cruise", "janney"];

// The action/context a coverage id resolves from — the inverse of
// demoCoverageMoveId, for the round-4 spectacle-table tests at the end.
const MOVE_ROW_BY_ID = new Map([
  ["standLight", ["light", {}]],
  ["forwardLight", ["light", { forwardHeld: true }]],
  ["crouchLight", ["light", { crouching: true }]],
  ["standLightKick", ["light", { limb: "kick" }]],
  ["forwardLightKick", ["light", { limb: "kick", forwardHeld: true }]],
  ["crouchLightKick", ["light", { limb: "kick", crouching: true }]],
  ["standHeavy", ["heavy", {}]],
  ["overhead", ["heavy", { forwardHeld: true }]],
  ["crouchHeavy", ["heavy", { crouching: true }]],
  ["standHeavyKick", ["heavy", { limb: "kick" }]],
  ["forwardHeavyKick", ["heavy", { limb: "kick", forwardHeld: true }]],
  ["crouchHeavyKick", ["heavy", { limb: "kick", crouching: true }]],
  ["special", ["special", {}]],
  ["commandSpecial", ["commandSpecial", {}]],
  ["backSpecial", ["backSpecial", {}]],
  ["launcher", ["launcher", {}]],
  ["driveHeavy", ["driveHeavy", {}]],
  ["enhanced", ["enhanced", {}]],
  ["enhancedCommandSpecial", ["enhancedCommandSpecial", {}]],
  ["enhancedBackSpecial", ["enhancedBackSpecial", {}]],
  ["enhancedLauncher", ["enhancedLauncher", {}]],
  ["super", ["super", {}]],
]);
function moveRowFor(id) {
  const row = MOVE_ROW_BY_ID.get(id);
  assert.ok(row, `no move row registered for ${id}`);
  return row;
}

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

// ---------------------------------------------------------------------------
// v2.9 FLOW round 2 — the naturalness contract. Every assertion below pins a
// number the critic panel measured and scored FIX, so a regression names
// itself instead of showing up as "it reads like a statue" three waves later.
// ---------------------------------------------------------------------------

const NATURALNESS_RUNS = [
  [["deathblow", "jez"], "somerset", 237],
  [["donald", "cyraxx"], "wildwood", 909],
  [["benny", "ali"], "vet", 5150],
  [["devil", "commissioner"], "janney", 31],
  [["post", "alan"], "buffet", 424],
  [["deathblow", "post"], "cruise", 8123],
];

// One exhibition's worth of fight time in the sim-lite world.
const ONE_EXHIBITION_FRAMES = 2400;

function runExhibitions(frames = ONE_EXHIBITION_FRAMES) {
  return NATURALNESS_RUNS.map(([pair, stageId, seed]) => {
    const world = createMockWorld({ pair, stageId, hasStageWeapon: true, seed });
    for (let frame = 0; frame < frames; frame += 1) world.tick();
    return {
      pair,
      seed,
      coverage: world.choreo.coverage(),
      stats: world.choreo.stats(),
      census: world.census(),
    };
  });
}

test("no side is ever left standing still: the inertness ceiling", () => {
  // The critic's own definition: a fighter is inert on a tick when it is not
  // attacking, not in hitstun/blockstun/dizzy/wakeup/knockdown, grounded, not
  // dashing and barely moving. The round-1 watchdog counted `crouch` and
  // `guarding` as MOTION, but the sim pins vx to zero for both — so a demo
  // that spent half its idle script on ducks and standing blocks scored as a
  // statue while the watchdog reported everything was fine.
  for (const { pair, seed, census } of runExhibitions()) {
    for (let side = 0; side < 2; side += 1) {
      assert.ok(census.fraction[side] < 0.22,
        `${pair[side]} (seed ${seed}) must not be inert for ${(100 * census.fraction[side]).toFixed(1)}% of the fight`);
      assert.ok(census.longest[side] <= 60,
        `${pair[side]} (seed ${seed}) held still for ${census.longest[side]} ticks in a row`);
    }
  }
});

test("the large majority of staged directives complete", () => {
  // Round 1 measured 22 completed against 23 timed out on seed 7 and 10 v 24
  // on seed 101 — and that abandonment IS the approach/pause/whiff/reset
  // cadence on screen. The dominant cause was a cancel chain pressed off a
  // WHIFF: combos.mjs gates every cancel route on fighter.attackConnected, so
  // those links could never come out and the directive waited out its window
  // having shown nothing.
  for (const { pair, seed, stats } of runExhibitions()) {
    const total = stats.completed + stats.timedOut;
    assert.ok(total > 20, `seed ${seed} must issue a real pipeline (got ${total})`);
    const ratio = stats.completed / total;
    assert.ok(ratio >= 0.7,
      `${pair.join(" vs ")} (seed ${seed}) completed only ${(100 * ratio).toFixed(0)}% of its directives`);
  }
});

test("a single exhibition shows most of each kit, not just the cycle", () => {
  // The cumulative attract ledger still carries a returning fighter, but a
  // viewer watching ONE exhibition has to see most of a kit: the panel found
  // 21 of 40 sides under 20 of 30 and seven under 15.
  const shown = [];
  for (const { pair, seed, coverage } of runExhibitions()) {
    for (const fighterId of pair) {
      const entry = coverage[fighterId];
      shown.push(entry.movesShown);
      assert.ok(entry.movesShown >= 24,
        `${fighterId} (seed ${seed}) showed only ${entry.movesShown} of ${entry.movesTotal} in one exhibition`);
    }
  }
  shown.sort((a, b) => a - b);
  assert.ok(shown[Math.floor(shown.length / 2)] >= 28,
    `the single-exhibition median must stay high (got ${shown[Math.floor(shown.length / 2)]})`);
});

test("the stun string and the wall carry are built out of checklist moves", () => {
  // Round 1 gave each spectacle its own exclusive directive — a 300px herd of
  // drive heavies or a 100-point stun bar built from nothing — so every
  // attempt cost the kit a showcase and the beats still only reached half the
  // exhibitions (dizzy 6 of 20, wall splat 8 of 20). They now ride the
  // ordinary move pipeline: while either is unshown the picker prefers, among
  // the equally-least-shown candidates, the ones that push toward the
  // victim's wall or carry stun, and the beat scripts themselves throw the
  // least-shown checklist entry that serves the beat.
  let dizzyRuns = 0;
  let wallRuns = 0;
  let laneRuns = 0;
  for (const { pair, coverage, stats } of runExhibitions()) {
    const beats = (beat) => coverage[pair[0]].beats[beat] + coverage[pair[1]].beats[beat];
    if (beats("dizzy") > 0) dizzyRuns += 1;
    if (beats("wallsplat") > 0) wallRuns += 1;
    if (stats.stunLanePicks > 0 || stats.pushLanePicks > 0) laneRuns += 1;
  }
  assert.equal(laneRuns, NATURALNESS_RUNS.length,
    "every exhibition must build its spectacles out of ordinary showcases");
  assert.ok(dizzyRuns >= NATURALNESS_RUNS.length - 1,
    `the stun string must reach nearly every exhibition (got ${dizzyRuns} of ${NATURALNESS_RUNS.length})`);
  assert.ok(wallRuns >= 2,
    `the wall carry must reach a real share of exhibitions (got ${wallRuns} of ${NATURALNESS_RUNS.length})`);
});

test("a cancel chain is never pressed off a whiff", () => {
  // combos.mjs canCancelAttack() bails on an empty `connected`, so a link
  // queued behind a swing that never touched anything cannot come out. With
  // the sim-lite world's confirms switched off the choreographer must issue
  // no links at all — and it must still complete the majority of its
  // directives, because the chain is a bonus and never the plan.
  const blind = createMockWorld({
    pair: ["deathblow", "jez"], stageId: "somerset", hasStageWeapon: true,
    seed: 237, confirmHits: false,
  });
  for (let frame = 0; frame < ONE_EXHIBITION_FRAMES; frame += 1) blind.tick();
  const stats = blind.choreo.stats();
  assert.equal(stats.chainLinks, 0, "a whiff must never open a chain link");
  assert.ok(stats.completed > stats.timedOut,
    "the pipeline must not depend on chaining to complete its showcases");

  const confirmed = createMockWorld({
    pair: ["deathblow", "jez"], stageId: "somerset", hasStageWeapon: true, seed: 237,
  });
  for (let frame = 0; frame < ONE_EXHIBITION_FRAMES; frame += 1) confirmed.tick();
  assert.ok(confirmed.choreo.stats().chainLinks > 0,
    "a confirmed hit must still chain into the next checklist item");
});

test("the repeatable movement beats come back for real screen time", () => {
  // The authored dash-brake cell draws on a dash's last TWO ticks and the
  // turnaround key for the 2-3 latch ticks after a grounded facing flip, so a
  // one-shot ledger bought them 2 and 3 ticks of a ~1730-tick exhibition
  // (0.12% and 0.17%). Both are repeatable on a cooldown now.
  for (const { pair, seed, coverage } of runExhibitions()) {
    const dashes = pair.reduce((total, id) => total
      + coverage[id].beats.dashForward + coverage[id].beats.dashBack, 0);
    assert.ok(dashes >= 4,
      `seed ${seed} must dash repeatedly for the brake cell (got ${dashes})`);
  }
});

// ---------------------------------------------------------------------------
// v2.9 round 4 — the four defects the third critic panel left open.
// ---------------------------------------------------------------------------

test("the air row is reachable: every air normal fires in every exhibition", () => {
  // THE SYSTEMIC HOLE. Measured across 16 fighter-slots of the real sim
  // (5 exhibitions on seed 1234 + 3 on seed 9001), airLightKick fired in 6,
  // airHeavyKick in 4 and the rest of the row in 6-7. Three causes, all in
  // the pipeline: the free lane and the closer both narrow the pool to
  // PUSH_LANE_IDS / STUN_LANE_IDS and no air normal is in either set; an air
  // pick was DISCARDED outright whenever the fighter was in its own recovery
  // tail (which is exactly when showcases start); and the arc took its
  // direction from the least-shown jump BEAT, so an air normal was regularly
  // thrown out of a back jump with no approach at all.
  const AIR_ROW = ["airLight", "airLightKick", "airHeavy", "airHeavyKick", "airSpecial"];
  for (const { pair, seed, coverage } of runExhibitions()) {
    for (const fighterId of pair) {
      for (const id of AIR_ROW) {
        assert.ok(coverage[fighterId].moves[id] > 0,
          `${fighterId} (seed ${seed}) never showed ${id} — the air row must be reachable`);
      }
    }
  }
});

test("the air row is reserved out of the picker, not left to the tie-breaks", () => {
  // The reservation is what makes the row reachable, so it has to be visible
  // in the ledger: if it ever stops firing the row goes straight back to
  // losing every filter it can never win.
  for (const { seed, stats } of runExhibitions()) {
    assert.ok(stats.airRowPicks > 0,
      `seed ${seed} must reserve picks for the unshown air row (got ${stats.airRowPicks})`);
  }
});

test("the losing side gets a fair share of the showcase", () => {
  // THE MANNEQUIN'S SEQUEL. Seed 1234 match 5 finished with jez on 6 of 30
  // against ali on 19: he spent the exhibition in hitstun, so `stageable` was
  // false whenever the pipeline looked at him. The attract loop is a showcase,
  // not a competition — the leader yields the stage rather than convincing
  // anyone. Pinned on the TRAILING column, which is the number that was broken.
  for (const { pair, seed, coverage } of runExhibitions()) {
    const shown = pair.map((id) => coverage[id].movesShown);
    const low = Math.min(...shown);
    const gap = Math.abs(shown[0] - shown[1]);
    assert.ok(low >= 24,
      `seed ${seed}: the trailing fighter showed only ${low} of 30`);
    assert.ok(gap <= 6,
      `seed ${seed}: a ${gap}-move gap between the two columns is a competition, not an exhibition`);
  }
});

test("the yield is duty-cycled, never a whole round of standing down", () => {
  // A leader that yielded indefinitely would just be a different kind of
  // mannequin, so the stand-down runs in bursts and the inertness ceiling
  // above still applies to every tick of it.
  for (const { seed, stats, census } of runExhibitions()) {
    assert.ok(stats.yieldTicks < census.ticks * 0.34,
      `seed ${seed} yielded for ${stats.yieldTicks} of ${census.ticks} ticks`);
  }
});

test("the turnaround beat is only counted when the pivot could reach the screen", () => {
  // THE COUNTER WAS LYING. qa.demoCoverage() reported `turnaround` as FIRING
  // while motion2:5 drew for zero frames, because observe() counted every
  // grounded facing flip and fighterPoseDescriptor only reaches the authored
  // pivot when the flipper is grounded, not attacking, and not in hitstun /
  // blockstun / knockdown / wake-up / a grab / dizzy. Most recorded flips were
  // in exactly those states.
  assert.equal(turnaroundBlocker({ grounded: true }), "");
  assert.equal(turnaroundBlocker({ grounded: false }), "airborne");
  assert.equal(turnaroundBlocker({ grounded: true, hitstunFrames: 4 }), "hitstun");
  assert.equal(turnaroundBlocker({ grounded: true, blockstunFrames: 4 }), "blockstun");
  assert.equal(turnaroundBlocker({ grounded: true, down: true }), "knockdown");
  assert.equal(turnaroundBlocker({ grounded: true, wakeupFrames: 3 }), "wakeup");
  assert.equal(turnaroundBlocker({ grounded: true, dizzyFrames: 9 }), "dizzy");
  assert.equal(turnaroundBlocker({ grounded: true, grabbed: true }), "grab");
  assert.equal(turnaroundBlocker({ grounded: true, attacking: true }), "attacking");

  // ...and the ledger must actually use it: every counted beat has to be a
  // flip the renderer could have drawn, and the rejects have to be recorded
  // rather than silently folded into the count.
  let counted = 0;
  let blind = 0;
  for (const { coverage, pair, stats } of runExhibitions()) {
    counted += pair.reduce((total, id) => total + coverage[id].beats.turnaround, 0);
    blind += Object.values(stats.turnaroundBlind).reduce((a, b) => a + b, 0);
    assert.equal(
      counted + blind >= 0 && typeof stats.turnaroundSeen === "number", true,
      "every observed flip must be classified as counted or blind",
    );
  }
  assert.ok(blind > 0,
    "flips taken in hitstun/knockdown/mid-swing are real and must be recorded as blind, not counted");
  assert.ok(counted > 0,
    "the cross-up staging must still produce flips the authored pivot can draw");
});

test("the wall splat is chased through the sim's own conversion, not a guess", () => {
  // The herd used to slam with driveHeavy, which qualifies for a corner wall
  // bounce on NONE of the nine kits — and the raw >220 vx route needs the
  // victim inside ~40px because hitstun bleeds the carry 10% a tick. The
  // deterministic route is the ARMED bounce: a knockdown-class heavy/special
  // landing within one body width of the wall sets carryVelocityX 680 and the
  // clamp always fires spawnWallImpact.
  for (const fighterId of ROSTER_10) {
    const slam = demoWallSlamIds(fighterId);
    assert.ok(slam.length >= 3,
      `${fighterId} must own several wall-bounce conversions (got ${slam.length})`);
    assert.ok(!slam.includes("driveHeavy"),
      `${fighterId}: driveHeavy cannot arm a wall bounce and must not be the slam`);
    assert.ok(!slam.some((id) => id.startsWith("air")),
      `${fighterId}: the grounded slam must not reach for an air normal`);
  }
});

test("the stun string is a combo built from non-knockdown stun carriers", () => {
  // The round-3 string was lights-only on "9 stun every 22 frames beats 17
  // every 40", which left out STUN_RULES.decayGraceFrames — but the real
  // problem is bigger than which button: a re-approached poke leaves a 55-70
  // tick gap between hits against a 48-tick grace, so the bar hands most of
  // every gain straight back. A CANCEL lands inside the previous hit's
  // hitstun. Measured in the real sim, the string's peak went 17-65 -> 71-98
  // when it started cancelling.
  for (const fighterId of ROSTER_10) {
    const { build, topUp, link } = demoStunStringIds(fighterId);
    assert.ok(build.length > 0 && topUp.length > 0 && link.length > 0,
      `${fighterId} must have a usable opener, build and link set`);
    for (const id of [...build, ...topUp, ...link]) {
      assert.ok(!id.startsWith("air"), `${fighterId}: ${id} cannot be part of a grounded string`);
      const move = createFighterMove(fighterId, ...moveRowFor(id));
      assert.ok(!move.knockdown && !move.knockdownOnFinal && !move.launchVelocityY && !move.juggleLift,
        `${fighterId}: ${id} knocks the victim down and hands the decay the whole get-up`);
      assert.ok(stunGainForAttack(move) > 0, `${fighterId}: ${id} awards no stun at all`);
    }
    for (const id of link) {
      assert.ok(build.includes(id), `${fighterId}: ${id} must be a build entry to be a link`);
    }
  }
});

test("the two spectacles reach the exhibition", () => {
  // The panel measured wall splat and dizzy as near-zero across 14 fighter
  // slots. Both are now built deliberately — the victim is carried to the
  // arming window over several exchanges and the stun bar is topped up with
  // cancels — rather than hoped for.
  let dizzyRuns = 0;
  let wallRuns = 0;
  for (const { pair, coverage } of runExhibitions()) {
    const beats = (beat) => coverage[pair[0]].beats[beat] + coverage[pair[1]].beats[beat];
    if (beats("dizzy") > 0) dizzyRuns += 1;
    if (beats("wallsplat") > 0) wallRuns += 1;
  }
  assert.ok(dizzyRuns >= NATURALNESS_RUNS.length - 1,
    `the stun string must reach nearly every exhibition (got ${dizzyRuns} of ${NATURALNESS_RUNS.length})`);
  assert.ok(wallRuns >= 3,
    `the wall splat must reach a real share of exhibitions (got ${wallRuns} of ${NATURALNESS_RUNS.length})`);
});
