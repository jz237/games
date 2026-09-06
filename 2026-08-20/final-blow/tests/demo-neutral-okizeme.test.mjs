import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEMO_BEATS,
  DEMO_OKI_READ_ACCURACY,
  DEMO_RISE_MIX,
  NEUTRAL_TARGET_SHARE,
  NEUTRAL_WINDOW_FRAMES,
  createDemoChoreographer,
  demoCoverageChecklist,
  demoKnockdownPlan,
  demoOkiProfile,
  meatyPressFrameFor,
  neutralBandFor,
  riseFrameFor,
} from "../engine/demo-choreo.mjs";
import { DEMO_PERSONAS, demoPersonaFor } from "../engine/demo.mjs";
import { resolveAiSettings } from "../engine/ai.mjs";
import { DEFENSE_RULES, WAKEUP_RULES, wakeupVulnerableFrames } from "../engine/defense.mjs";
import { FIGHTER_KITS } from "../engine/fighter-kits.mjs";
import { GRIT_RULES } from "../engine/combos.mjs";
import { createMockWorld } from "./demo-mock-world.mjs";

// ---------------------------------------------------------------------------
// 5.4 FIGHT NIGHT — the NEUTRAL BUDGET (sweep #5, the neutral half) and the
// OKIZEME / TECH beat family (sweep #4). The pure half is enumerated here;
// the sim-lite world pins that the windows and the plans actually run, refuse
// the lanes, stay lively and replay; the game.js half is pinned from source
// (the only change there is eight visible fields on the demo-only view).
// ---------------------------------------------------------------------------

const testDir = dirname(fileURLToPath(import.meta.url));
const gameRoot = join(testDir, "..");
const ROSTER_10 = Object.keys(FIGHTER_KITS);
const ONE_EXHIBITION_FRAMES = 3200;

const grid = (count) => Array.from({ length: count }, (_, index) => (index + 0.5) / count);

test("the okizeme profile is the kit's own persona tier, knob for knob", () => {
  for (const fighterId of ROSTER_10) {
    const profile = demoOkiProfile(fighterId);
    const tier = resolveAiSettings(demoPersonaFor(fighterId));
    assert.equal(profile.persona, tier.persona || "demo", `${fighterId} persona`);
    assert.equal(profile.meatyChance, tier.meatyChance || 0);
    assert.equal(profile.grabPressureChance, tier.grabPressureChance || 0);
    assert.equal(profile.throwChance, tier.throwChance || 0);
    assert.equal(profile.clinchTechChance, tier.clinchTechChance ?? tier.throwTechChance ?? 0);
    assert.equal(profile.wakeupReversalChance, tier.wakeupReversalChance || 0);
    assert.equal(profile.preferredRange, FIGHTER_KITS[fighterId].ai.preferredRange);
    for (const knob of ["meatyChance", "grabPressureChance", "throwChance", "clinchTechChance", "wakeupReversalChance", "patience", "spacing"]) {
      assert.ok(Number.isFinite(profile[knob]), `${fighterId}.${knob} must be a number`);
    }
  }
  // The grappler pressures the rise and grabs on it; the zoner mostly resets
  // and almost never throws. These are the persona numbers the choreographer
  // plays by, so the exhibition's okizeme reads differ per archetype.
  const grappler = demoOkiProfile("deathblow");
  const zoner = demoOkiProfile("donald");
  assert.equal(grappler.persona, "grappler");
  assert.equal(zoner.persona, "zoner");
  assert.ok(grappler.meatyChance > zoner.meatyChance);
  assert.ok(grappler.grabPressureChance > zoner.grabPressureChance);
  assert.ok(grappler.throwChance >= 0.3 && zoner.throwChance <= 0.05);
  assert.equal(grappler.throwChance, DEMO_PERSONAS.grappler.throwChance);
});

test("each side's footsies band is its own range, clamped to a readable window", () => {
  const grappler = neutralBandFor(demoOkiProfile("deathblow"));
  const zoner = neutralBandFor(demoOkiProfile("donald"));
  const footsies = neutralBandFor(demoOkiProfile("jez"));
  assert.equal(grappler.centre, 170, "82 px preferred × 1 spacing clamps up to the readable floor");
  assert.equal(zoner.centre, 340, "276 px × 1.3 clamps down to the ceiling");
  assert.ok(footsies.centre > grappler.centre && footsies.centre < zoner.centre);
  for (const band of [grappler, zoner, footsies]) {
    assert.ok(band.near < band.centre && band.far > band.centre);
    assert.equal(band.far - band.near, 2 * 38);
  }
});

test("the knockdown plan: moment beats keep their windows, the first two plans show both reads, then the persona rolls", () => {
  const attacker = demoOkiProfile("deathblow");
  const victim = demoOkiProfile("jez");
  assert.deepEqual(demoKnockdownPlan({ attacker, victim, weapon: true, taunt: true }), { kind: "weapon" });
  assert.deepEqual(demoKnockdownPlan({ attacker, victim, taunt: true }), { kind: "taunt" });
  // Fairness: the first knockdown is okizeme whatever the roll, the first
  // after that a reset, so both reads are on screen before the dice run.
  for (const roll of grid(8)) {
    assert.equal(demoKnockdownPlan({ attacker, victim, shown: { oki: 0, reset: 0 }, rolls: [roll] }).kind, "oki");
    assert.equal(demoKnockdownPlan({ attacker, victim, shown: { oki: 1, reset: 0 }, rolls: [roll] }).kind, "reset");
  }
  // ...then meatyChance decides: the grappler (0.7) pressures far more often
  // than the zoner (0.5 from pro).
  const share = (profile) => grid(100).filter((roll) => demoKnockdownPlan({
    attacker: profile, victim, shown: { oki: 1, reset: 1 }, rolls: [roll, 0.9, 0.9, 0.1, 0.9],
  }).kind === "oki").length / 100;
  assert.ok(Math.abs(share(attacker) - attacker.meatyChance) < 0.02);
  assert.ok(Math.abs(share(demoOkiProfile("donald")) - demoOkiProfile("donald").meatyChance) < 0.02);
});

test("the knockdown plan: the option, the rise, the guess and the answer", () => {
  const attacker = demoOkiProfile("deathblow");
  const victim = demoOkiProfile("jez");
  const shown = { oki: 1, reset: 1 };
  // The meaty throw comes at grabPressureChance and never after a throw
  // knockdown (the 40-frame immunity makes it a whiff by construction).
  const throwShare = grid(100).filter((roll) => demoKnockdownPlan({
    attacker, victim, shown, rolls: [0, roll, 0.9, 0.1, 0.9],
  }).option === "meatyThrow").length / 100;
  assert.ok(Math.abs(throwShare - attacker.grabPressureChance) < 0.02);
  for (const roll of grid(10)) {
    assert.equal(demoKnockdownPlan({ attacker, victim, shown, throwKnockdown: true, rolls: [0, roll, 0.9, 0.1, 0.9] }).option, "meaty");
  }
  // The rise mix.
  const rises = { quick: 0, delay: 0, plain: 0 };
  for (const roll of grid(100)) rises[demoKnockdownPlan({ attacker, victim, shown, rolls: [0, 0.9, roll, 0.1, 0.9] }).rise] += 1;
  assert.ok(Math.abs(rises.quick / 100 - DEMO_RISE_MIX.quick) < 0.02);
  assert.ok(Math.abs(rises.delay / 100 - DEMO_RISE_MIX.delay) < 0.02);
  assert.ok(rises.plain > 0, "a plain rise must stay in the mix");
  // The guess: right at DEMO_OKI_READ_ACCURACY, otherwise one of the other two.
  for (const rise of ["quick", "delay", "plain"]) {
    const riseRoll = rise === "quick" ? 0.1 : rise === "delay" ? 0.5 : 0.9;
    let right = 0;
    for (const roll of grid(100)) {
      const plan = demoKnockdownPlan({ attacker, victim, shown, rolls: [0, 0.9, riseRoll, roll, 0.9] });
      assert.equal(plan.rise, rise);
      assert.ok(["quick", "delay", "plain"].includes(plan.guess));
      if (plan.guess === rise) right += 1;
    }
    assert.ok(Math.abs(right / 100 - DEMO_OKI_READ_ACCURACY) < 0.02, `${rise}: ${right} right`);
  }
  // The answer: against a throw, tech or eat at clinchTechChance; against a
  // strike, the reversal only with the meter for it, else a wake-up button or
  // the block.
  const techShare = grid(100).filter((roll) => demoKnockdownPlan({
    attacker, victim, shown, rolls: [0, 0, 0.9, 0.1, roll],
  }).answer === "tech").length / 100;
  assert.ok(Math.abs(techShare - victim.clinchTechChance) < 0.02);
  const answers = (meter) => {
    const tally = {};
    for (const roll of grid(100)) {
      const plan = demoKnockdownPlan({ attacker, victim, shown, victimMeter: meter, rolls: [0, 0.9, 0.9, 0.1, roll] });
      tally[plan.answer] = (tally[plan.answer] || 0) + 1;
    }
    return tally;
  };
  const broke = answers(0);
  const loaded = answers(GRIT_RULES.enhancedSpecialCost);
  assert.equal(broke.reversal, undefined, "no reversal without the meter for it");
  assert.ok(loaded.reversal > 0, "the reversal is on the table with the meter");
  assert.ok(broke.press > 0 && broke.block > 0, "the wake-up button and the block both show");
  // Pure: the same inputs give the same plan.
  assert.deepEqual(
    demoKnockdownPlan({ attacker, victim, shown, victimMeter: 50, rolls: [0.3, 0.2, 0.5, 0.7, 0.4] }),
    demoKnockdownPlan({ attacker, victim, shown, victimMeter: 50, rolls: [0.3, 0.2, 0.5, 0.7, 0.4] }),
  );
});

test("the meaty is timed off the sim's own wake-up rules: active on the first vulnerable frame of the guessed rise", () => {
  const kd = DEFENSE_RULES.knockdownFrames;
  const wake = DEFENSE_RULES.wakeupFrames;
  assert.equal(riseFrameFor("plain"), kd + wake);
  assert.equal(riseFrameFor("quick"), kd - WAKEUP_RULES.quickRiseFrames + wake);
  assert.equal(riseFrameFor("delay"), kd + WAKEUP_RULES.delayFrames + wake);
  for (const guess of ["plain", "quick", "delay"]) {
    for (const startup of [4, 5, 7]) {
      const press = meatyPressFrameFor(guess, { startup });
      const active = press + startup - 1;
      assert.equal(active, riseFrameFor(guess) - wakeupVulnerableFrames(guess),
        `${guess}/${startup}: the strike goes active on the first vulnerable rising frame`);
      // ...and the throw on the first THROWABLE tick after the rise.
      const grab = meatyPressFrameFor(guess, { option: "meatyThrow", startup });
      assert.equal(grab + startup - 1, riseFrameFor(guess) + DEFENSE_RULES.strikeKnockdownThrowImmuneFrames);
    }
  }
  // The 26-frame spread between a quick and a delayed rise is the read.
  assert.equal(meatyPressFrameFor("delay") - meatyPressFrameFor("quick"),
    WAKEUP_RULES.delayFrames + WAKEUP_RULES.quickRiseFrames
    + wakeupVulnerableFrames("quick") - wakeupVulnerableFrames("delay"));
});

test("the beat ledger carries the four new observed beats and the checklist is unchanged", () => {
  for (const beat of ["meaty", "meatyThrow", "throwTech", "throwWhiff"]) assert.ok(DEMO_BEATS.includes(beat), beat);
  for (const fighterId of ROSTER_10) assert.equal(demoCoverageChecklist(fighterId).length, 30);
  assert.ok(NEUTRAL_WINDOW_FRAMES.min >= 60 && NEUTRAL_WINDOW_FRAMES.max <= 150);
  assert.ok(NEUTRAL_TARGET_SHARE >= 0.25 && NEUTRAL_TARGET_SHARE <= 0.35);
});

function runWorld({ pair, stageId = "somerset", seed, frames = ONE_EXHIBITION_FRAMES, hasStageWeapon = true }) {
  const world = createMockWorld({ pair, stageId, hasStageWeapon, seed });
  let neutralTicks = 0;
  let lanesDuringWindows = 0;
  let okiTicks = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    world.tick();
    const stats = world.choreo.stats();
    if (stats.neutralLive) {
      neutralTicks += 1;
      if (world.choreo.directives().some((lane) => lane !== null)) lanesDuringWindows += 1;
    }
    if (stats.okiLive) okiTicks += 1;
  }
  return {
    world, neutralTicks, lanesDuringWindows, okiTicks,
    stats: world.choreo.stats(), coverage: world.choreo.coverage(), census: world.census(),
  };
}

const RUNS = [
  [["deathblow", "jez"], "somerset", 237],
  [["devil", "commissioner"], "janney", 31],
  [["benny", "ali"], "vet", 5150],
  [["post", "alan"], "buffet", 424],
];

test("the neutral budget arms footsies windows — the bell, the resets, the budget — and refuses both lanes while one runs", () => {
  for (const [pair, stageId, seed] of RUNS) {
    const { stats, neutralTicks, lanesDuringWindows } = runWorld({ pair, stageId, seed });
    assert.ok(stats.neutralWindows >= 3, `${pair.join(" vs ")} (seed ${seed}) armed only ${stats.neutralWindows} windows`);
    assert.equal(stats.neutralBy.bell, 1, "the sim-lite world is one endless round: exactly one bell window");
    assert.ok((stats.neutralBy.budget || 0) <= 3, "the budget arm is capped per round");
    assert.ok(neutralTicks >= 3 * NEUTRAL_WINDOW_FRAMES.min, `windows scripted ${neutralTicks} ticks`);
    assert.ok(neutralTicks <= stats.neutralWindows * NEUTRAL_WINDOW_FRAMES.max);
    // (The window closes in observe(), one tick before step() would have
    // counted it, so the two counts differ by at most one per window.)
    assert.ok(Math.abs(stats.neutralTicks - neutralTicks) <= stats.neutralWindows,
      `stats.neutralTicks ${stats.neutralTicks} vs ${neutralTicks} observed`);
    assert.equal(lanesDuringWindows, 0, "no lead or feed lane may hold a fighter inside a footsies window");
    assert.ok(stats.neutralBaits >= 2, `the bait must be thrown (got ${stats.neutralBaits})`);
    assert.ok(stats.neutralReads.forward + stats.neutralReads.back >= 1, "a read must be taken");
  }
});

test("every knockdown is a decision: okizeme or reset, persona-weighted, the meaty pressed on the rise", () => {
  let presses = 0;
  for (const [pair, stageId, seed] of RUNS) {
    const { stats, coverage, okiTicks } = runWorld({ pair, stageId, seed });
    const plans = stats.okiPlans;
    assert.ok((plans.oki || 0) >= 1, `${pair.join(" vs ")} (seed ${seed}): an okizeme plan`);
    assert.ok((plans.reset || 0) >= 1, `${pair.join(" vs ")} (seed ${seed}): a reset plan`);
    assert.ok(okiTicks > 0, "the plan must own ticks");
    // (A guess of "delay" against the sim-lite world's 45+12 knockdown is a
    // press the attacker rightly withholds — the victim is up first — so the
    // press count is pinned across the runs, the plans per run.)
    presses += stats.okiPresses;
    const rises = Object.values(stats.okiRises).reduce((total, count) => total + count, 0);
    assert.equal(rises, stats.okiGuesses.right + stats.okiGuesses.wrong, "every staged rise carries a guess");
    const knockdowns = coverage[pair[0]].beats.knockdown + coverage[pair[1]].beats.knockdown;
    const drawn = Object.entries(plans).filter(([kind]) => kind !== "capped").reduce((total, [, count]) => total + count, 0);
    assert.equal(drawn, knockdowns, "one plan per knockdown");
  }
  assert.ok(presses >= 3, `meaties must be pressed on the rise (got ${presses} across the runs)`);
});

test("the throw family repeats per side at the persona's share, capped and rate-limited", () => {
  const { stats, coverage } = runWorld({ pair: ["deathblow", "jez"], seed: 237 });
  const cap = (fighterId) => 2 + Math.round(demoOkiProfile(fighterId).throwChance * 8);
  assert.ok(stats.throwOpportunities >= 2, `the grappler must take the clinch (got ${stats.throwOpportunities})`);
  assert.ok(stats.throwOpportunities <= cap("deathblow") + cap("jez"), "capped per side per exhibition");
  const family = (fighterId) => coverage[fighterId].beats.throw + coverage[fighterId].beats.throwTech + coverage[fighterId].beats.throwWhiff;
  assert.ok(family("deathblow") + family("jez") >= 3, "throws, techs and whiffs must reach the ledger");
  // Across the runs the two duets exist: the sim-lite world can tech a hold
  // and whiff a grab, so the beats are observed, never assumed.
  let techs = 0;
  let whiffs = 0;
  for (const [pair, stageId, seed] of RUNS) {
    const run = runWorld({ pair, stageId, seed });
    for (const id of pair) { techs += run.coverage[id].beats.throwTech; whiffs += run.coverage[id].beats.throwWhiff; }
  }
  assert.ok(techs >= 1, "a throw tech must be observed");
  assert.ok(whiffs >= 1, "a throw whiff must be observed");
});

test("nobody stands still inside a window or over a body, and the exhibition still shows the kit", () => {
  for (const [pair, stageId, seed] of RUNS) {
    const { census, coverage } = runWorld({ pair, stageId, seed });
    for (let side = 0; side < 2; side += 1) {
      assert.ok(census.fraction[side] < 0.22, `${pair[side]} inert ${(100 * census.fraction[side]).toFixed(1)}%`);
      assert.ok(census.longest[side] <= 60, `${pair[side]} still for ${census.longest[side]} ticks`);
      assert.ok(coverage[pair[side]].movesShown >= 24, `${pair[side]} showed ${coverage[pair[side]].movesShown} of 30`);
    }
  }
});

test("a CLOCK card (blend 0) stands down: no windows, no staged plans, no throw opportunities", () => {
  const choreo = createDemoChoreographer({ pair: ["alan", "ali"], stageId: "cruise", seed: 1234, blend: 0 });
  // Drive it with the same sim-lite world by swapping the choreographer in.
  const world = createMockWorld({ pair: ["alan", "ali"], stageId: "cruise", hasStageWeapon: false, seed: 1234 });
  world.world.choreo = choreo;
  for (let frame = 0; frame < ONE_EXHIBITION_FRAMES; frame += 1) world.tick();
  const stats = choreo.stats();
  assert.equal(stats.neutralWindows, 0);
  assert.equal(stats.okiPresses, 0);
  assert.equal(stats.throwOpportunities, 0);
  assert.ok(Object.keys(stats.okiPlans).length >= 1, "the plans are still recorded for the ledger");
});

test("a seed replays the same show: two worlds, identical stats, coverage and plans", () => {
  const first = runWorld({ pair: ["cyraxx", "donald"], stageId: "wildwood", seed: 909 });
  const second = runWorld({ pair: ["cyraxx", "donald"], stageId: "wildwood", seed: 909 });
  const strip = (stats) => { const copy = { ...stats }; delete copy.okiTrace; return copy; };
  assert.deepEqual(strip(first.stats), strip(second.stats));
  assert.deepEqual(first.coverage, second.coverage);
  assert.equal(first.neutralTicks, second.neutralTicks);
  assert.equal(first.okiTicks, second.okiTicks);
  // ...and a different seed is a different show.
  const third = runWorld({ pair: ["cyraxx", "donald"], stageId: "wildwood", seed: 910 });
  assert.notDeepEqual(strip(third.stats), strip(first.stats));
});

// ---------------------------------------------------------------------------
// The game.js half — a played match must be byte-identical.
// ---------------------------------------------------------------------------

test("game.js changes only the demo-only choreographer view: eight visible fields, no new sim reads", async () => {
  const game = await readFile(join(gameRoot, "game.js"), "utf8");
  const start = game.indexOf("function demoChoreoFighterView(fighter) {");
  assert.ok(start > 0);
  const end = game.indexOf("\nfunction demoChoreoView() {", start);
  const view = game.slice(start, end);
  for (const field of [
    "knockdownFrames: fighter.knockdownFrames,",
    "throwKnockdown: Boolean(fighter.throwKnockdown),",
    "attackLevel: fighter.attacking?.level || null,",
    "attackRearmFrames: fighter.attackRearmFrames || 0,",
    "whiffTick: Number.isFinite(fighter.whiffTell?.tick) ? fighter.whiffTell.tick : -1,",
    "whiffKind: fighter.whiffTell?.kind || null,",
    "grabbedFrame: fighter.grabbed ? fighter.grabbed.frame || 0 : 0,",
    "throwTechFlashFrames: fighter.throwTechFlashFrames || 0,",
  ]) {
    assert.ok(view.includes(field), `the demo view must carry ${field}`);
  }
  // The hidden wake option never reaches the choreographer: the rise is the
  // thing the attacker is supposed to be guessing.
  assert.ok(!view.includes("wakeOption"), "the demo view must not leak the wake option");
  // The new names exist nowhere else in game.js: the view is the only site.
  for (const name of ["whiffTick", "whiffKind", "grabbedFrame"]) {
    assert.equal((game.match(new RegExp(`\\b${name}\\b`, "g")) || []).length, 1, `${name} appears only in the demo view`);
  }
  // ...and the view is built on the demo path only (aiInput's demo branch).
  assert.equal((game.match(/demoChoreoFighterView/g) || []).length, 2, "declared once, mapped once");
  assert.match(game, /if \(state\.mode === "demo" && demoSession\.choreo\) \{\s*const view = demoChoreoView\(\);/);
  assert.equal((game.match(/demoChoreoView\(\)/g) || []).length, 2, "declared once, called once");
});
