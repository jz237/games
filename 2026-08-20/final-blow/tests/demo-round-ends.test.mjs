import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_AI_DIFFICULTY,
  DEMO_BRINK_HEALTH,
  DEMO_CLOCK_AI_DIFFICULTY,
  DEMO_CLOCK_COVERAGE_BLEND,
  DEMO_COMEBACK_HEALTH,
  DEMO_FORMATS,
  DEMO_OPENERS,
  DEMO_STANDARD_OPENERS,
  createDemoDirector,
  demoCloserPlan,
  demoMatchupKey,
} from "../engine/demo.mjs";
import { AI_DIFFICULTY_ORDER, resolveAiSettings } from "../engine/ai.mjs";
import { FIGHTER_KITS, selectKitAiIntent } from "../engine/fighter-kits.mjs";
import { DEMO_COVERAGE_BLEND } from "../engine/demo-choreo.mjs";

// ===========================================================================
// 5.4 FIGHT NIGHT (round-ends). The sweep traced 16 attract rounds on three
// seeds: 16/16 ended as Final Blow variant A ~17 s after the bell, the clock
// never read below 80, no plain knockout (so the 5.3 collapse never played),
// no decision, and every card opened on the same walk-in super at tick
// 23-29. This file pins the three pure pieces that changed that — the
// director's seeded SHOW stream (format + opener), the per-round CLOSER
// policy, and the kit AI's `swing` knob the CLOCK brain runs on — plus the
// demo gates in game.js, from source, so a played match stays byte-identical.
// ===========================================================================

const gameRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fighters = Object.keys(FIGHTER_KITS);
const stages = ["somerset", "vet", "wildwood", "buffet", "cruise", "janney"];
const director = (seed) => createDemoDirector({ fighterIds: fighters, stageIds: stages, trackCount: 6, seed });

// ---------------------------------------------------------------------------
// The director's SHOW stream.
// ---------------------------------------------------------------------------

test("the show stream is seeded: the same seed replays the same formats and openers", () => {
  const [a, b] = [director(237), director(237)];
  const first = Array.from({ length: 32 }, () => a.next());
  const second = Array.from({ length: 32 }, () => b.next());
  assert.deepEqual(first.map((c) => c.show), second.map((c) => c.show));
  for (const cycle of first) {
    assert.ok(DEMO_FORMATS.includes(cycle.show.format), `format ${cycle.show.format}`);
    assert.ok(DEMO_OPENERS.includes(cycle.show.opener), `opener ${cycle.show.opener}`);
    assert.ok(Object.isFrozen(cycle.show));
  }
});

test("one CLOCK card in four, never the first card, never two in a row, and every clock card opens on footsies", () => {
  for (const seed of [237, 1234, 9001, 42, 8123]) {
    const d = director(seed);
    const cycles = Array.from({ length: 40 }, () => d.next());
    assert.equal(cycles[0].show.format, "standard", `seed ${seed}: the first card is a standard bout`);
    for (let start = 0; start < cycles.length; start += 4) {
      const clocks = cycles.slice(start, start + 4).filter((c) => c.show.format === "clock");
      assert.equal(clocks.length, 1, `seed ${seed}: cards ${start + 1}-${start + 4} carry exactly one clock card`);
    }
    for (let index = 1; index < cycles.length; index += 1) {
      assert.ok(!(cycles[index].show.format === "clock" && cycles[index - 1].show.format === "clock"),
        `seed ${seed}: clock cards ${index} and ${index + 1} are adjacent`);
    }
    for (const cycle of cycles) {
      if (cycle.show.format === "clock") assert.equal(cycle.show.opener, "footsies-first");
      else assert.ok(DEMO_STANDARD_OPENERS.includes(cycle.show.opener), `standard card opener ${cycle.show.opener}`);
    }
  }
});

// 5.4 SESSION LAYER: the pin moved from "every EIGHT cycles show all four
// openers" to "every TEN cycles show all five" — the story now names the
// opener, and the guarantee is the story bag's (four standard stories per
// bag; at most three clock cards in any ten, so at least seven standard
// draws, and any seven consecutive draws from a four-bag contain a full
// bag). Eight cycles can hold six standard draws, which a bag boundary can
// split 3 + 3 — the old window is no longer a guarantee.
test("every ten cycles shows all five openers and both formats, with no opener repeated back to back", () => {
  for (const seed of [237, 1234, 9001, 42]) {
    const d = director(seed);
    const cycles = Array.from({ length: 30 }, () => d.next());
    for (let start = 0; start < cycles.length; start += 10) {
      const window = cycles.slice(start, start + 10);
      const openers = new Set(window.map((c) => c.show.opener));
      for (const opener of DEMO_OPENERS) assert.ok(openers.has(opener), `seed ${seed}: cards ${start + 1}-${start + 10} never open on ${opener}`);
      assert.ok(window.some((c) => c.show.format === "clock"), `seed ${seed}: no clock card in cards ${start + 1}-${start + 10}`);
      assert.ok(window.some((c) => c.show.format === "standard"));
    }
    // No two consecutive cards open the same way (a clock card's footsies
    // counts: a footsies standard card never follows one).
    for (let index = 1; index < cycles.length; index += 1) {
      assert.notEqual(cycles[index].show.opener, cycles[index - 1].show.opener, `seed ${seed}: card ${index + 1} repeats card ${index}'s opener`);
    }
    const snapshot = d.snapshot();
    assert.ok(DEMO_FORMATS.includes(snapshot.lastFormat));
    assert.ok(DEMO_OPENERS.includes(snapshot.lastOpener));
  }
});

test("the show stream is its own rng: the matchup, stage and track draw is unchanged by it", () => {
  // A director whose show draws consumed the matchup rng would shift the
  // pair/stage/track of every seed. The show stream is hashSeed(seed, "show")
  // on its own DeterministicRng, so the 5.3 shape of the main stream holds:
  // the full 45-matchup bag before any repeat, no adjacent stage or track.
  // (The headless trace in DEMO.md pins seed 237's first cards — post/ali,
  // devil/deathblow, ali/cyraxx — against the live roster order.)
  const d = director(237);
  const cycles = Array.from({ length: 45 }, () => d.next());
  assert.equal(new Set(cycles.map(({ picks }) => demoMatchupKey(...picks))).size, 45);
  for (let index = 1; index < cycles.length; index += 1) {
    assert.notEqual(cycles[index].stage, cycles[index - 1].stage);
    assert.notEqual(cycles[index].track, cycles[index - 1].track);
  }
  assert.equal(d.snapshot().cycle, 45);
});

// ---------------------------------------------------------------------------
// The CLOSER policy.
// ---------------------------------------------------------------------------

test("closer: a first round is a plain knockout, match point is a Final Blow, the brink and a real comeback finish", () => {
  const plain = demoCloserPlan({ winner: 0, rounds: [0, 0], winnerHealth: 80, fighterId: "jez" });
  assert.deepEqual(plain, { finisher: false, variant: -1, reason: "plain" });
  const matchPoint = demoCloserPlan({ winner: 1, rounds: [0, 1], winnerHealth: 90, fighterId: "jez" });
  assert.deepEqual(matchPoint, { finisher: true, variant: 0, reason: "match-point" });
  // A bare evening round (0-1 down, healthy) is a plain trade of rounds...
  assert.equal(demoCloserPlan({ winner: 0, rounds: [0, 1], winnerHealth: DEMO_COMEBACK_HEALTH + 1, fighterId: "jez" }).reason, "plain");
  // ...evened under half health it is a comeback and finishes.
  const comeback = demoCloserPlan({ winner: 0, rounds: [0, 1], winnerHealth: DEMO_COMEBACK_HEALTH, fighterId: "jez" });
  assert.equal(comeback.reason, "comeback");
  assert.equal(comeback.finisher, true);
  // Won from the brink, whatever the round score.
  const brink = demoCloserPlan({ winner: 0, rounds: [0, 0], winnerHealth: DEMO_BRINK_HEALTH, fighterId: "jez" });
  assert.equal(brink.reason, "brink");
  assert.equal(brink.finisher, true);
  assert.equal(demoCloserPlan({ winner: 0, rounds: [0, 0], winnerHealth: DEMO_BRINK_HEALTH + 0.1, fighterId: "jez" }).finisher, false);
  // A juggle KO: the plain path would leave the loser frozen in the air for
  // the whole hold (koCollapseOnRoundEnd lays down grounded fighters only),
  // so the ceremony takes him.
  const airborne = demoCloserPlan({ winner: 0, rounds: [0, 0], winnerHealth: 90, fighterId: "jez", loserGrounded: false });
  assert.deepEqual(airborne, { finisher: true, variant: 0, reason: "airborne" });
  // roundsToWin is honoured (a one-round house rule is match point at 0-0).
  assert.equal(demoCloserPlan({ winner: 0, rounds: [0, 0], roundsToWin: 1, fighterId: "jez" }).reason, "match-point");
  assert.ok(Object.isFrozen(plain));
});

test("closer: the Final Blow variant alternates per fighter through the session ledger", () => {
  const ledger = {};
  const variants = [];
  for (let take = 0; take < 6; take += 1) {
    const plan = demoCloserPlan({ winner: 0, rounds: [1, 0], fighterId: "ali", ledger });
    assert.equal(plan.finisher, true);
    variants.push(plan.variant);
    ledger.ali = (ledger.ali || 0) + 1;
  }
  assert.deepEqual(variants, [0, 1, 0, 1, 0, 1]);
  // Another fighter's ledger is its own.
  assert.equal(demoCloserPlan({ winner: 1, rounds: [0, 1], fighterId: "benny", ledger }).variant, 0);
  // A plain knockout never touches a variant.
  assert.equal(demoCloserPlan({ winner: 0, rounds: [0, 0], fighterId: "ali", ledger }).variant, -1);
});

test("eight scripted cards through the closer show FB-A, FB-B, a plain knockout and (from the director) a decision card", () => {
  // The round shapes a best-of-three can take, in the proportions the
  // 24-cycle trace measured (2-0 sweeps and 2-1 sets, one brink round).
  const cards = [
    [{ w: 0, h: 80 }, { w: 0, h: 60 }],
    [{ w: 1, h: 70 }, { w: 0, h: 90 }, { w: 1, h: 40 }],
    [{ w: 0, h: 25 }, { w: 0, h: 55 }],
    [{ w: 1, h: 88 }, { w: 1, h: 33 }],
    [{ w: 0, h: 50 }, { w: 1, h: 20 }, { w: 1, h: 75 }],
    [{ w: 1, h: 66 }, { w: 1, h: 66 }],
    [{ w: 0, h: 91 }, { w: 0, h: 12 }],
    [{ w: 1, h: 45 }, { w: 0, h: 61 }, { w: 0, h: 70 }],
  ];
  const ledger = {};
  const outcomes = { "fb-a": 0, "fb-b": 0, knockout: 0 };
  cards.forEach((rounds, card) => {
    const ids = card % 2 ? ["donald", "ali"] : ["jez", "benny"];
    const score = [0, 0];
    for (const { w, h } of rounds) {
      const plan = demoCloserPlan({ winner: w, rounds: score, winnerHealth: h, fighterId: ids[w], ledger });
      if (!plan.finisher) outcomes.knockout += 1;
      else {
        outcomes[plan.variant === 1 ? "fb-b" : "fb-a"] += 1;
        ledger[ids[w]] = (ledger[ids[w]] || 0) + 1;
      }
      score[w] += 1;
    }
    assert.ok(score.some((r) => r === 2), "every card closes");
  });
  assert.ok(outcomes["fb-a"] >= 1 && outcomes["fb-b"] >= 1 && outcomes.knockout >= 1, JSON.stringify(outcomes));
  // No single ending owns the card: the ceremony share the sweep measured
  // (16/16) is gone — plain knockouts are at least a third of the rounds.
  const total = outcomes["fb-a"] + outcomes["fb-b"] + outcomes.knockout;
  assert.ok(outcomes.knockout / total >= 1 / 3, JSON.stringify(outcomes));
  // The fourth ending, the decision, is the CLOCK card's: one per four.
  const d = director(9001);
  const formats = Array.from({ length: 8 }, () => d.next()).map((c) => c.show.format);
  assert.equal(formats.filter((f) => f === "clock").length, 2);
});

// ---------------------------------------------------------------------------
// The CLOCK brain and the kit AI's swing knob.
// ---------------------------------------------------------------------------

test("the clock tier is registered on top of the demo tier: swings cut, no back-jump, guard up, and it is not a player tier", () => {
  const demo = resolveAiSettings(DEMO_AI_DIFFICULTY);
  const clock = resolveAiSettings(DEMO_CLOCK_AI_DIFFICULTY);
  assert.equal(clock.id, DEMO_CLOCK_AI_DIFFICULTY);
  assert.equal(clock.label, "DEMO CLOCK");
  assert.equal(clock.swing, 0.3);
  assert.equal(clock.spaceJumpShare, 0);
  assert.equal(clock.spacing, demo.spacing, "the demo spacing floors carry over");
  assert.ok(clock.patience > demo.patience);
  assert.ok(clock.comboChance < demo.comboChance);
  assert.ok(clock.meterChance < demo.meterChance);
  assert.ok(clock.throwChance < demo.throwChance);
  assert.ok(clock.defenseChance > demo.defenseChance);
  assert.ok(!AI_DIFFICULTY_ORDER.includes(DEMO_CLOCK_AI_DIFFICULTY), "never offered on the difficulty ladder");
  // Every player-facing tier (and the demo tier itself) swings as authored.
  for (const id of [...AI_DIFFICULTY_ORDER, DEMO_AI_DIFFICULTY]) {
    const settings = resolveAiSettings(id);
    assert.equal(settings.swing, undefined, `${id} carries no swing knob`);
    assert.equal(settings.spaceJumpShare, undefined, `${id} carries no space-jump knob`);
  }
  assert.equal(DEMO_CLOCK_COVERAGE_BLEND, 0, "the choreographer stands down on a clock card");
  // (0.8 at 5.3; the personas item lowered the standard card's share to 0.55
  // and pins the bound in tests/demo-coverage.test.mjs.)
  assert.equal(DEMO_COVERAGE_BLEND, 0.55, "the standard card's share is the personas item's");
});

test("swing 1 is the authored kit table bit for bit; swing 0.3 swings less and never more", () => {
  const distances = [40, 90, 130, 180, 220, 250, 300, 340, 400, 520];
  const rolls = Array.from({ length: 41 }, (_, index) => index / 40);
  let compared = 0;
  let authoredActions = 0;
  let clockActions = 0;
  for (const fighterId of fighters) {
    for (const distance of distances) {
      for (const roll of rolls) {
        for (const opponentAttacking of [false, true]) {
          for (const meter of [0, 100]) {
            const base = { distance, roll, opponentAttacking, meter, spacing: 1.6, patience: 0.55 };
            const authored = selectKitAiIntent(fighterId, base);
            assert.deepEqual(selectKitAiIntent(fighterId, { ...base, swing: 1 }), authored);
            const clock = selectKitAiIntent(fighterId, { ...base, swing: 0.3 });
            if (authored.action) authoredActions += 1;
            if (clock.action) {
              clockActions += 1;
              assert.ok(authored.action, `${fighterId} @${distance} r${roll}: the clock brain swung where the authored one held`);
            }
            compared += 1;
          }
        }
      }
    }
  }
  assert.ok(compared > 15_000, `${compared} intents compared`);
  assert.ok(clockActions < authoredActions * 0.45, `${clockActions} of ${authoredActions} authored swings survive at 0.3`);
  assert.ok(clockActions > 0, "the clock brain still fights");
});

// ---------------------------------------------------------------------------
// The game.js gates — a played match must be byte-identical.
// ---------------------------------------------------------------------------

test("game.js reaches the closer, the opener, the clock brain and the clock only through state.mode === \"demo\"", async () => {
  const game = await readFile(join(gameRoot, "game.js"), "utf8");
  // checkKnockout: the plan is asked for on the demo branch only, and only a
  // plain demo plan shortens the window / withholds the FINISH THEM promise.
  assert.match(game, /const plainDemoKo = state\.mode === "demo" && !demoPlanCloser\(winner\)\.finisher;/);
  assert.match(game, /loserGrounded: Boolean\(state\.fighters\[1 - winner\]\.grounded\),/);
  assert.match(game, /if \(plainDemoKo\) \{\s*state\.phaseTime = DEMO_PLAIN_KO_WINDOW_SECONDS;\s*\} else \{\s*announce\("FINISH THEM"/);
  assert.match(game, /if \(!plainDemoKo\) sound\("finish"\);/);
  assert.equal((game.match(/demoPlanCloser\(/g) || []).length, 2, "declared once, called once");
  // aiInput: the finish branch reads the plan inside its demo block, and the
  // opener runs only on the demo/fight/opener-pending line.
  const finishBlock = game.slice(game.indexOf("if (state.mode === \"demo\") {\n      // 5.4 FIGHT NIGHT (round-ends): the CLOSER"), game.indexOf("input.final = fighter.aiClock <= 0;"));
  assert.ok(finishBlock.includes("const plan = demoSession.closer;"));
  assert.ok(finishBlock.includes("input.finisherVariant = plan ? plan.variant : 0;"));
  assert.match(game, /if \(state\.mode === "demo" && state\.phase === "fight" && !demoSession\.openerShown\) \{\s*const scripted = demoOpenerInput\(fighter, opponent, input\);/);
  assert.equal((game.match(/demoOpenerInput\(/g) || []).length, 2);
  // makeFighter: the tier pick.
  // (5.4 integration: demoAiTier takes the kit id — a standard card hands each
  // seat its archetype persona, a clock card the CLOCK brain.)
  assert.match(game, /aiBrain: createAiBrain\(state\.mode === "demo" \? demoAiTier\(kitId\) : state\.aiDifficulty\),/);
  assert.equal((game.match(/demoAiTier\(kitId\)/g) || []).length, 2);
  // (5.4 session layer: the persona is resolved under the story's overlay.)
  assert.match(game, /return clock \? DEMO_CLOCK_AI_DIFFICULTY : demoStoryTierFor\(kitId, demoStoryOverlayFor\(kitId\)\);/);
  // The clock: 99 everywhere, the card's length only for the clock brain in a demo.
  assert.match(game, /function roundClockSeconds\(\) \{\s*if \(state\.mode === "demo" && demoSession\.fightersTier === DEMO_CLOCK_AI_DIFFICULTY\) return DEMO_CLOCK_ROUND_SECONDS;\s*return 99;/);
  assert.equal((game.match(/state\.timer = roundClockSeconds\(\);/g) || []).length, 2, "startMatch and resetRound");
  assert.match(game, /const DEMO_CLOCK_ROUND_SECONDS = 30;/);
  // finishRound: the note is demo-only and never on a resimulation.
  assert.match(game, /if \(state\.mode === "demo" && !rollbackResimulating\) demoNoteRoundEnd\(winner, type\);/);
  // The hold: the plain-KO curtain call is the full one, the window the KO freeze.
  assert.match(game, /const DEMO_KO_HOLD_SECONDS = ROUND_WIN_HOLD_SECONDS;/);
  assert.match(game, /const DEMO_PLAIN_KO_WINDOW_SECONDS = 0\.9;/);
  // resolveInput has carried finisherVariant since 1.x — the plumbing the
  // demo brain never used.
  assert.match(game, /finisherVariant: Number\.isInteger\(source\.finisherVariant\) \? source\.finisherVariant : 0,/);
  assert.match(game, /const type = state\.graphicFatalities \? \(input\.finisherVariant === 1 \? 1 : 0\) : 0;/);
});
