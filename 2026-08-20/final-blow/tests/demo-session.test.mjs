import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEMO_STANDARD_STORY_IDS,
  DEMO_STORIES,
  DEMO_STORY_IDS,
  DEMO_STORY_TIERS,
  createDemoDirector,
  demoCloserPlan,
  demoMatchupKey,
  demoPersonaFor,
  demoStoryFor,
  demoStoryTierFor,
} from "../engine/demo.mjs";
import { AI_DIFFICULTIES, resolveAiSettings } from "../engine/ai.mjs";
import { createDemoChoreographer } from "../engine/demo-choreo.mjs";
import {
  DEMO_CARD_BOUTS,
  DEMO_SIGN_OFF_LINES,
  DEMO_SIGN_OFF_VARIANTS,
  createDemoLedger,
  demoBoutPlan,
  demoLedgerRecord,
  demoNextUpText,
  demoRecordsLine,
  demoResultEyebrow,
  demoRoundCardPlan,
  demoSignOffFamily,
  demoSignOffLine,
  demoStandingLine,
  demoStandings,
  demoStandingsStorageKey,
  demoStoryBugText,
  restoreDemoStandings,
  serializeDemoStandings,
} from "../engine/demo-session.mjs";

// ---------------------------------------------------------------------------
// 5.4 FIGHT NIGHT — THE SESSION LAYER (sweep #3 / #11 / #14 / #15 / #16 / #25):
// the card of the night, the seeded stories, the session ledger and the
// standings board, the NEXT UP panel and the sign-off, and the pins that keep
// every one of them on the demo path.
// ---------------------------------------------------------------------------

const fighters = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "devil", "commissioner"];
const stages = ["somerset", "vet", "wildwood", "buffet", "cruise", "janney"];
const director = (seed) => createDemoDirector({ fighterIds: fighters, stageIds: stages, trackCount: 4, seed });

// --- the card of the night -------------------------------------------------

test("the card: four one-round quick bouts, a best-of-three co-main, a best-of-five main event, then a new card", () => {
  const kinds = Array.from({ length: 13 }, (_, index) => demoBoutPlan(index + 1));
  assert.deepEqual(kinds.map((b) => b.kind), ["quick", "quick", "quick", "quick", "co-main", "main", "quick", "quick", "quick", "quick", "co-main", "main", "quick"]);
  assert.deepEqual(kinds.map((b) => b.roundsToWin), [1, 1, 1, 1, 2, 3, 1, 1, 1, 1, 2, 3, 1]);
  assert.deepEqual(kinds.slice(0, 7).map((b) => `${b.card}:${b.slot}/${b.of}`), ["1:1/6", "1:2/6", "1:3/6", "1:4/6", "1:5/6", "1:6/6", "2:1/6"]);
  assert.equal(DEMO_CARD_BOUTS, 6);
  assert.equal(demoBoutPlan(6).label, "MAIN EVENT");
  assert.equal(demoBoutPlan(6).format, "BEST OF 5");
  assert.equal(demoBoutPlan(5).label, "CO-MAIN EVENT");
  assert.equal(demoBoutPlan(1).format, "BEST OF 1");
  // The QA override reshapes a slot without moving it on the card.
  const forced = demoBoutPlan(1, "co-main");
  assert.deepEqual([forced.slot, forced.card, forced.kind, forced.roundsToWin], [1, 1, "co-main", 2]);
  assert.equal(demoBoutPlan(0).cycle, 1, "cycles are 1-based");
  assert.ok(Object.isFrozen(demoBoutPlan(3)));
});

test("the director's show tag carries the bout, and peek() names the next card's bout and story", () => {
  const d = director(237);
  for (let index = 0; index < 14; index += 1) {
    const peeked = d.peek();
    const cycle = d.next();
    assert.deepEqual(cycle.show.bout, demoBoutPlan(index + 1));
    assert.deepEqual(peeked.bout, cycle.show.bout, "peek names the bout next() seats");
    assert.equal(peeked.story, cycle.show.story, "peek names the story next() tells");
    assert.equal(peeked.format, cycle.show.format);
  }
});

// --- the stories -------------------------------------------------------------

test("five stories, four standard: every one of them inside any ten cycles, and the story names the opener", () => {
  assert.deepEqual([...DEMO_STORY_IDS], ["grudge", "rookie-veteran", "showboat", "zoning-war", "clock"]);
  assert.deepEqual([...DEMO_STANDARD_STORY_IDS], DEMO_STORY_IDS.slice(0, 4));
  for (const seed of [237, 1234, 9001, 42, 8123, 7, 99]) {
    const d = director(seed);
    const cycles = Array.from({ length: 50 }, () => d.next());
    // Any ten consecutive cycles (not only aligned windows) tell every story.
    for (let start = 0; start + 10 <= cycles.length; start += 1) {
      const stories = new Set(cycles.slice(start, start + 10).map((c) => c.show.story));
      for (const id of DEMO_STORY_IDS) assert.ok(stories.has(id), `seed ${seed}: cards ${start + 1}-${start + 10} never tell ${id}`);
    }
    for (let index = 0; index < cycles.length; index += 1) {
      const { show } = cycles[index];
      assert.equal(show.opener, DEMO_STORIES[show.story].opener, "the story names the opener");
      assert.equal(show.format, DEMO_STORIES[show.story].format, "the clock story is the clock format and nothing else is");
      assert.ok(show.flip === 0 || show.flip === 1);
      assert.ok(typeof show.quickFinisher === "boolean");
      assert.ok(Number.isInteger(show.signOff) && show.signOff >= 0 && show.signOff < DEMO_SIGN_OFF_VARIANTS);
      if (index > 0) {
        assert.notEqual(show.story, cycles[index - 1].show.story, `seed ${seed}: card ${index + 1} repeats card ${index}'s story`);
        assert.notEqual(show.signOff, cycles[index - 1].show.signOff, `seed ${seed}: card ${index + 1} repeats card ${index}'s sign-off variant`);
      }
    }
  }
});

test("the story stream is its own rng: the matchup, stage, track AND clock-card draw of a seed are unchanged by it", () => {
  // The same seed on the same roster before and after the stories — the
  // matchup/stage/track stream is on `rng`, the clock cards on `showRng`,
  // and the story on its own `storyRng`; the pin is that the first two are
  // pure functions of the seed (a second director agrees cycle for cycle,
  // and the matchup bag is still a full round-robin).
  const [a, b] = [director(1234), director(1234)];
  const first = Array.from({ length: 45 }, () => a.next());
  const second = Array.from({ length: 45 }, () => b.next());
  assert.deepEqual(first, second);
  assert.equal(new Set(first.slice(0, 45).map(({ picks }) => demoMatchupKey(...picks))).size, 45, "10 fighters: 45 matchups before a repeat");
  for (let start = 0; start < 44; start += 4) {
    assert.equal(first.slice(start, start + 4).filter((c) => c.show.format === "clock").length, 1, "one clock card in four is untouched");
  }
});

test("demoStoryFor casts the story onto the seats from the seeded coin, and every field is what the story says", () => {
  const grudge = demoStoryFor("grudge", { flip: 1, cycle: 3 });
  assert.deepEqual([grudge.opener, grudge.format, grudge.superSide, grudge.showboatSide, grudge.comebackSide], ["throw", "standard", 0, -1, -1]);
  assert.deepEqual(grudge.tiers, ["grudge", "grudge"]);
  assert.deepEqual(grudge.yield, [null, null], "a grudge never yields on either seat");
  assert.equal(demoStoryFor("grudge", { flip: 0, cycle: 4 }).superSide, 1, "alternate: the lead alternates by cycle as the round-ends rule did");

  const rookieVet = demoStoryFor("rookie-veteran", { flip: 1, cycle: 1 });
  assert.equal(rookieVet.superSide, 1, "the veteran (seat flip) gets the walk-in super");
  assert.deepEqual(rookieVet.tiers, ["rookie", "veteran"]);
  assert.equal(rookieVet.comebackSide, 0, "the rookie is the other seat");
  assert.deepEqual(rookieVet.yield, [null, { coverage: 2, health: 14 }], "the veteran yields early, the rookie never");
  const flipped = demoStoryFor("rookie-veteran", { flip: 0, cycle: 1 });
  assert.deepEqual([flipped.superSide, flipped.comebackSide, flipped.tiers[0]], [0, 1, "veteran"]);

  const showboat = demoStoryFor("showboat", { flip: 0, cycle: 2 });
  assert.deepEqual([showboat.opener, showboat.superSide, showboat.showboatSide], ["dash-in", 0, 0]);
  assert.deepEqual(showboat.tiers, ["showboat", null]);

  const zoning = demoStoryFor("zoning-war", { flip: 1, cycle: 1 });
  assert.deepEqual([zoning.opener, zoning.tiers[0], zoning.tiers[1], zoning.showboatSide], ["none", "spacing", "spacing", -1]);

  const clock = demoStoryFor("clock", { flip: 0, cycle: 1 });
  assert.deepEqual([clock.opener, clock.format, clock.tiers], ["footsies-first", "clock", [null, null]]);
  assert.equal(demoStoryFor("nonsense").id, "grudge", "an unknown story is the grudge, never a crash");
  assert.ok(Object.isFrozen(clock) && Object.isFrozen(clock.tiers));
});

test("story tiers: every overlay is registered over every persona, a null overlay IS the persona, and no player tier carries one", () => {
  for (const id of fighters) {
    assert.equal(demoStoryTierFor(id), demoPersonaFor(id));
    assert.equal(demoStoryTierFor(id, null), demoPersonaFor(id));
    assert.equal(demoStoryTierFor(id, "nonsense"), demoPersonaFor(id));
    for (const overlay of Object.keys(DEMO_STORY_TIERS)) {
      const tier = demoStoryTierFor(id, overlay);
      assert.equal(tier, `${demoPersonaFor(id)}-${overlay}`);
      const settings = resolveAiSettings(tier);
      assert.equal(settings.id, tier, `${tier} is registered`);
      assert.equal(settings.overlay, overlay);
      const base = resolveAiSettings(demoPersonaFor(id));
      assert.equal(settings.persona, base.persona, "the seat keeps its archetype");
      for (const [knob, value] of Object.entries(DEMO_STORY_TIERS[overlay])) assert.equal(settings[knob], value, `${tier}.${knob}`);
      // Everything the overlay does NOT name is the persona's own.
      for (const knob of ["spaceRange", "superConfirmChance", "meterSuperShare", "exShare"]) {
        if (!(knob in DEMO_STORY_TIERS[overlay])) assert.equal(settings[knob], base[knob], `${tier}.${knob} is the persona's`);
      }
    }
  }
  // The veteran is FINAL-grade, the rookie ROOKIE-grade, on the reads that
  // define the grades.
  const veteran = resolveAiSettings(demoStoryTierFor("jez", "veteran"));
  const rookie = resolveAiSettings(demoStoryTierFor("jez", "rookie"));
  assert.ok(veteran.reactionFrames <= AI_DIFFICULTIES.final.reactionFrames && veteran.defenseChance >= AI_DIFFICULTIES.final.defenseChance);
  assert.ok(rookie.reactionFrames >= AI_DIFFICULTIES.rookie.reactionFrames - 3 && rookie.errorChance >= AI_DIFFICULTIES.street.errorChance);
  assert.ok(rookie.reactionFrames > veteran.reactionFrames * 2, "the asymmetry is visible in the reaction clock");
  // Grudge: no patience, no disrespect. Spacing: a clinch line for anyone.
  assert.equal(resolveAiSettings(demoStoryTierFor("deathblow", "grudge")).patience, 0);
  assert.equal(resolveAiSettings(demoStoryTierFor("deathblow", "grudge")).tauntChance, 0);
  assert.equal(resolveAiSettings(demoStoryTierFor("deathblow", "spacing")).spaceRange, 200, "the grappler keeps away in a zoning war");
  assert.equal(resolveAiSettings(demoStoryTierFor("ali", "showboat")).tauntChance, 0.6);
  for (const tier of Object.values(AI_DIFFICULTIES)) {
    assert.equal(tier.overlay, undefined);
    assert.equal(tier.persona, undefined);
  }
});

test("the choreographer reads the story: a seat with no yield tolerance never yields, the showboat taunts every knockdown", () => {
  const seats = (story) => createDemoChoreographer({ pair: ["jez", "ali"], stageId: "vet", hasStageWeapon: false, seed: 5, story });
  assert.equal(seats(null).story(), null);
  const grudge = seats(demoStoryFor("grudge", { flip: 0, cycle: 1 })).story();
  assert.deepEqual(grudge, { id: "grudge", showboatSide: -1, yield: [null, null] });
  const rv = seats(demoStoryFor("rookie-veteran", { flip: 1, cycle: 1 })).story();
  assert.deepEqual(rv.yield, [null, { coverage: 2, health: 14 }]);
  const show = seats(demoStoryFor("showboat", { flip: 1, cycle: 1 })).story();
  assert.equal(show.showboatSide, 1);
  // A default story keeps the 2.9 round-4 constants.
  assert.deepEqual(seats(demoStoryFor("zoning-war", { flip: 0, cycle: 1 })).story().yield, [{ coverage: 4, health: 26 }, { coverage: 4, health: 26 }]);
  // Stepped: a grudge leader that is dominating on every 2.9 measure is
  // refused the yield (counted), a default leader takes it.
  const run = (story) => {
    const choreo = seats(story);
    const fighter = (x, facing, health) => ({
      x, y: 0, facing, health, meter: 0, grounded: true, down: false, crouch: false, guarding: false,
      attacking: null, attackFrame: 0, hitstunFrames: 0, knockdownFrames: 0, wakeupFrames: 0, stunFrames: 0,
      tauntFrames: 0, grabbed: false, grabbing: false, carriedWeapon: null, dizzy: false, stun: 0, blockstunFrames: 0,
      combo: { hits: 0 }, confirmWindowFrames: 0, attackConnected: "", vx: 0, vy: 0, dashFrames: 0, airborne: false,
    });
    for (let tick = 0; tick < 200; tick += 1) {
      const view = {
        tick, fighters: [fighter(300, 1, 100), fighter(700, -1, 40)], weapon: null, stageMinX: 60, stageMaxX: 1220,
        phase: "fight", round: 1, timer: 90,
      };
      // Seat 0 has "shown" five moves, seat 1 none: a coverage gap of 5.
      if (tick === 0) for (const id of ["light", "heavy", "special", "throw", "super"]) choreo.noteMove(0, id);
      choreo.observe(view);
      choreo.step(0, view);
      choreo.step(1, view);
    }
    return choreo.stats();
  };
  const plain = run(demoStoryFor("zoning-war", { flip: 0, cycle: 1 }));
  const grudgeStats = run(demoStoryFor("grudge", { flip: 0, cycle: 1 }));
  assert.ok(plain.yieldTicks > 0, `a dominating default leader yields (got ${plain.yieldTicks})`);
  assert.equal(grudgeStats.yieldTicks, 0, "a grudge leader never yields");
  assert.ok(grudgeStats.yieldRefused > 0, "...and the refusal is counted");
});

// --- the closer on a quick bout ---------------------------------------------

test("closer: a one-round quick bout is not match point; brink, airborne and the seeded coin still finish", () => {
  const base = { winner: 0, rounds: [0, 0], roundsToWin: 1, winnerHealth: 90, fighterId: "jez", ledger: {}, loserGrounded: true };
  assert.deepEqual(demoCloserPlan({ ...base }), { finisher: true, variant: 0, reason: "match-point" }, "without the quick flag round 1 of a best-of-1 IS match point");
  assert.deepEqual(demoCloserPlan({ ...base, quickBout: true }), { finisher: false, variant: -1, reason: "plain" });
  assert.deepEqual(demoCloserPlan({ ...base, quickBout: true, quickFinisher: true }), { finisher: true, variant: 0, reason: "quick" });
  assert.equal(demoCloserPlan({ ...base, quickBout: true, winnerHealth: 20 }).reason, "brink");
  assert.equal(demoCloserPlan({ ...base, quickBout: true, loserGrounded: false }).reason, "airborne");
  // The coin is seeded: half the undercard finishes (measured over the stream).
  const d = director(237);
  const coins = Array.from({ length: 200 }, () => d.next().show.quickFinisher);
  const heads = coins.filter(Boolean).length;
  assert.ok(heads > 70 && heads < 130, `the quick-bout coin is a coin (${heads} of 200)`);
});

// --- the ledger and the board ------------------------------------------------

test("the ledger banks wins, losses, streaks and round scores, and the standings sort by record", () => {
  const ledger = createDemoLedger();
  const bout = (cycle, pair, winner, rounds, finisher = false) => demoLedgerRecord(ledger, {
    cycle, pair, winner, rounds, finisher, story: "grudge", bout: demoBoutPlan(cycle),
  });
  bout(1, ["jez", "ali"], 0, [1, 0], true);
  bout(2, ["post", "jez"], 1, [0, 1]);
  bout(3, ["ali", "post"], 0, [1, 0]);
  bout(4, ["jez", "donald"], 0, [1, 0]);
  bout(5, ["jez", "ali"], 1, [1, 2]);
  bout(6, ["post", "ali"], 1, [2, 3], true);
  assert.equal(ledger.cycles, 6);
  assert.equal(ledger.cards, 1, "the main event closed a card");
  assert.deepEqual(ledger.fighters.jez, { wins: 3, losses: 1, streak: 0, bestStreak: 3, roundsWon: 4, roundsLost: 2, finishers: 1, bouts: 4 });
  assert.deepEqual(ledger.fighters.ali, { wins: 3, losses: 1, streak: 3, bestStreak: 3, roundsWon: 6, roundsLost: 4, finishers: 1, bouts: 4 });
  assert.deepEqual(ledger.fighters.post, { wins: 0, losses: 3, streak: 0, bestStreak: 0, roundsWon: 2, roundsLost: 5, finishers: 0, bouts: 3 });
  const rows = demoStandings(ledger);
  assert.deepEqual(rows.map((row) => row.id), ["ali", "jez", "donald", "post"], "wins, then losses, then the live streak");
  assert.deepEqual(demoStandings(ledger, { limit: 2 }).map((row) => row.id), ["ali", "jez"]);
  assert.equal(ledger.bouts.length, 6);
  assert.deepEqual(ledger.bouts[5], { cycle: 6, card: 1, slot: 6, kind: "main", story: "grudge", winner: "ali", loser: "post", rounds: [2, 3], finisher: true });
  // Bounded.
  for (let cycle = 7; cycle < 200; cycle += 1) bout(cycle, ["jez", "ali"], cycle % 2, [1, 0]);
  assert.ok(ledger.bouts.length <= 60);
});

test("the board round-trips through storage keyed by build, and a different build opens clean", () => {
  const ledger = createDemoLedger();
  demoLedgerRecord(ledger, { cycle: 1, pair: ["jez", "ali"], winner: 0, rounds: [1, 0], bout: demoBoutPlan(1) });
  demoLedgerRecord(ledger, { cycle: 2, pair: ["jez", "post"], winner: 0, rounds: [1, 0], bout: demoBoutPlan(2) });
  const stored = JSON.parse(JSON.stringify(serializeDemoStandings(ledger, { build: "5.4", now: 1000 })));
  assert.equal(stored.build, "5.4");
  assert.equal(stored.updatedAt, 1000);
  assert.equal(stored.cycles, 2);
  const restored = restoreDemoStandings(stored, { build: "5.4" });
  assert.deepEqual(restored.fighters, ledger.fighters);
  assert.equal(restored.cycles, 2);
  assert.deepEqual(restored.bouts, [], "the bout log is the night's, not the board's");
  assert.deepEqual(restoreDemoStandings(stored, { build: "5.5" }).fighters, {}, "a new build opens a clean board");
  assert.deepEqual(restoreDemoStandings(null, { build: "5.4" }).fighters, {});
  assert.deepEqual(restoreDemoStandings("garbage", { build: "5.4" }).fighters, {});
  assert.deepEqual(restoreDemoStandings({ build: "5.4", fighters: { jez: { wins: "x", streak: 9 } } }, { build: "5.4" }).fighters.jez.streak, 0,
    "a streak can never exceed the wins that built it; garbage counts are zero");
  assert.equal(demoStandingsStorageKey("5.4"), "final-blow-demo-standings-v1:5.4");
  // Banking continues on the restored board.
  demoLedgerRecord(restored, { cycle: 3, pair: ["jez", "ali"], winner: 0, rounds: [1, 0], bout: demoBoutPlan(3) });
  assert.equal(restored.fighters.jez.wins, 3);
  assert.equal(restored.fighters.jez.streak, 3);
});

// --- the text ----------------------------------------------------------------

test("the bug's story row, the eyebrow, the standings lines", () => {
  assert.equal(demoStoryBugText({ storyLabel: "Grudge Match", bout: demoBoutPlan(2) }), "GRUDGE MATCH · BOUT 2 OF 6 · QUICK BOUT · BEST OF 1");
  assert.equal(demoStoryBugText({ storyLabel: "", bout: demoBoutPlan(6) }), "BOUT 6 OF 6 · MAIN EVENT · BEST OF 5");
  assert.equal(demoStoryBugText({}), "");
  assert.equal(demoResultEyebrow({ cycle: 8, bout: demoBoutPlan(8) }), "WATCH DEMO · CARD 2 · BOUT 2 OF 6 · QUICK BOUT");
  assert.equal(demoResultEyebrow({ cycle: 3 }), "WATCH DEMO · CYCLE 3", "no bout keeps the 5.3 eyebrow");
  assert.equal(demoStandingLine({ name: "Jez", wins: 3, losses: 1, streak: 3 }), "JEZ 3-1 · W3");
  assert.equal(demoStandingLine({ name: "Jez", wins: 1, losses: 0, streak: 1 }), "JEZ 1-0", "a streak of one is not a streak");
  assert.equal(demoRecordsLine({ first: { name: "Jez", wins: 2, losses: 0, streak: 2 }, second: { name: "Ali G", wins: 0, losses: 1 } }), "TONIGHT · JEZ 2-0 · W2 · ALI G 0-1");
});

test("NEXT UP: the pair, the stage, the bout, a real countdown, the pointer's prompt — and the held wording the hold probe pins", () => {
  const next = { first: "Jez", second: "Alan", stageName: "Veterans Stadium", bout: demoBoutPlan(6), storyLabel: "Grudge Match" };
  assert.equal(demoNextUpText({ next, remainingMs: 5000 }), "NEXT UP · JEZ VS ALAN · VETERANS STADIUM · MAIN EVENT · BEST OF 5 · GRUDGE MATCH · IN 5 SECONDS · PRESS ANY BUTTON TO PLAY");
  assert.equal(demoNextUpText({ next, remainingMs: 1400, coarsePointer: true }), "NEXT UP · JEZ VS ALAN · VETERANS STADIUM · MAIN EVENT · BEST OF 5 · GRUDGE MATCH · IN 2 SECONDS · TAP TO PLAY");
  assert.equal(demoNextUpText({ next, remainingMs: 0 }).includes("IN 1 SECOND ·"), true, "the countdown never reads zero");
  assert.equal(demoNextUpText({ next, held: true }), "NEXT FIGHT WAITS FOR THE SCREEN");
  assert.equal(demoNextUpText({ next: null, remainingMs: 5000 }), "NEXT RANDOM FIGHT IN 5 SECONDS · PRESS ANY BUTTON TO PLAY", "no tease keeps the 5.3 line");
});

test("the sign-off: one family per situation, seeded variants, never the same line twice running across a seed's cards", () => {
  assert.equal(demoSignOffFamily({ bout: demoBoutPlan(6) }), "card");
  assert.equal(demoSignOffFamily({ bout: demoBoutPlan(2), streak: 3 }), "streak");
  assert.equal(demoSignOffFamily({ bout: demoBoutPlan(5), nextBout: demoBoutPlan(6) }), "main");
  assert.equal(demoSignOffFamily({ bout: demoBoutPlan(2), nextBout: demoBoutPlan(3), streak: 2 }), "plain");
  const line = demoSignOffLine({ variant: 0, winnerName: "Jez", loserName: "Ali G", rounds: [1, 0], winner: 0, bout: demoBoutPlan(2), nextBout: demoBoutPlan(3) });
  assert.equal(line, "JEZ OVER ALI G. NEXT: QUICK BOUT.");
  assert.equal(demoSignOffLine({ variant: 2, winnerName: "Jez", rounds: [1, 3], winner: 1, bout: demoBoutPlan(6) }), "JEZ TAKES THE HEADLINER 3-1. NEW CARD NEXT.");
  assert.equal(demoSignOffLine({ variant: 1, winnerName: "Post", streak: 4, bout: demoBoutPlan(3), nextBout: demoBoutPlan(4) }), "POST IS ON A 4-BOUT RUN. NEXT UP: QUICK BOUT.");
  for (const lines of Object.values(DEMO_SIGN_OFF_LINES)) assert.ok(lines.length >= 4, "every family has variants");
  // Across a seed's cards the director's variant bag never repeats a variant
  // back to back, so two consecutive bouts of the same family never share a line.
  const d = director(9001);
  const cards = Array.from({ length: 30 }, () => d.next());
  for (let index = 1; index < cards.length; index += 1) {
    const [a, b] = [cards[index - 1], cards[index]];
    if (a.show.bout.kind === b.show.bout.kind) {
      const text = (card) => demoSignOffLine({ variant: card.show.signOff, winnerName: "X", loserName: "Y", bout: card.show.bout, nextBout: demoBoutPlan(card.cycle + 1) });
      assert.notEqual(text(a), text(b), `cards ${index} and ${index + 1} sign off with the same line`);
    }
  }
});

test("the demo's round card: FINAL ROUND on the decider, setpoint on a match point, honest banks on a best-of-five", () => {
  const names = ["Jez", "Ali G"];
  const bout = demoBoutPlan(6);
  assert.deepEqual(demoRoundCardPlan({ round: 2, rounds: [1, 0], roundsToWin: 3, names, bout }),
    { main: "ROUND 2", sub: "MAIN EVENT · JEZ 1–0 ALI G", speak: [{ cue: "round2", delay: 0 }] });
  assert.deepEqual(demoRoundCardPlan({ round: 3, rounds: [1, 1], roundsToWin: 3, names, bout }).speak, [], "1-1 in a best-of-five is nobody's final round");
  assert.equal(demoRoundCardPlan({ round: 3, rounds: [1, 1], roundsToWin: 3, names, bout }).main, "ROUND 3");
  assert.deepEqual(demoRoundCardPlan({ round: 4, rounds: [2, 1], roundsToWin: 3, names, bout }).speak, [{ cue: "setpoint", delay: 0 }]);
  const decider = demoRoundCardPlan({ round: 5, rounds: [2, 2], roundsToWin: 3, names, bout });
  assert.equal(decider.main, "FINAL ROUND");
  assert.deepEqual(decider.speak, [{ cue: "finalround", delay: 0 }]);
  // A best-of-three decider is still the final round.
  assert.deepEqual(demoRoundCardPlan({ round: 3, rounds: [1, 1], roundsToWin: 2, names, bout: demoBoutPlan(5) }).speak, [{ cue: "finalround", delay: 0 }]);
  assert.equal(demoRoundCardPlan({ round: 2, rounds: [0, 1], roundsToWin: 2, names }).sub, "SETTLE IT · JEZ 0–1 ALI G");
});

// --- the demo gate -------------------------------------------------------------

test("game.js reaches the session layer only through the demo: a played match is byte-identical", async () => {
  const game = await readFile(new URL("../game.js", import.meta.url), "utf8");
  // The bout's roundsToWin reaches the sim through state.matchRules under the
  // demo gate, in the one rules choke point, and nowhere else.
  assert.match(game, /if \(state\.mode === "demo" && demoSession\.show\?\.bout\?\.roundsToWin\) \{\s*state\.matchRules = \{ \.\.\.state\.matchRules, roundsToWin: demoSession\.show\.bout\.roundsToWin \};/);
  assert.equal((game.match(/bout\??\.roundsToWin/g) || []).length, 2, "the rules read the bout in exactly one place");
  // The story's tiers reach the fighters only through demoAiTier's demo pick.
  assert.match(game, /aiBrain: createAiBrain\(state\.mode === "demo" \? demoAiTier\(kitId\) : state\.aiDifficulty\),/);
  assert.match(game, /return clock \? DEMO_CLOCK_AI_DIFFICULTY : demoStoryTierFor\(kitId, demoStoryOverlayFor\(kitId\)\);/);
  assert.equal((game.match(/demoStoryOverlayFor\(/g) || []).length, 2, "declared once, called once");
  // The rookie's comeback bar and the demo's round card are demo-gated in resetRound.
  assert.match(game, /if \(state\.mode === "demo"\) demoStoryRoundGrit\(\);/);
  assert.match(game, /if \(state\.mode === "demo"\) \{\s*const card = demoRoundCardPlan\(\{/);
  assert.match(game, /\} else \{\s*announce\(`ROUND \$\{state\.round\}`, "SETTLE IT", 1\.15\);\s*\}/);
  // The closer's quick-bout inputs come from the show tag, inside demoPlanCloser.
  assert.match(game, /quickBout: demoSession\.show\?\.bout\?\.kind === "quick",\s*quickFinisher: Boolean\(demoSession\.show\?\.quickFinisher\),/);
  // The ledger is written at showResult on the demo path and persisted per bout.
  assert.match(game, /if \(state\.mode === "demo"\) \{\n    demoRecordBout\(winner\);\n    noteDemoMatchResult\(winner\);\n    scheduleNextDemoMatch\(\);\n  \}/);
  assert.match(game, /function demoRecordBout\(winner\) \{\s*if \(!demoSession\.active \|\| !demoSession\.ledger \|\| rollbackResimulating\) return null;/);
  assert.match(game, /localStorage\.setItem\(demoStandingsStorageKey\(GAME_VERSION\)/);
  assert.match(game, /demoSession\.ledger = restoreDemoStandings\(storedJson\(demoStandingsStorageKey\(GAME_VERSION\), null\), \{ build: GAME_VERSION \}\);/);
  // The result card, the standings band and the NEXT UP tease are demo-only.
  assert.match(game, /if \(state\.mode === "demo"\) renderDemoResultCard\(winner\);/);
  assert.match(game, /demoSession\.nextUp = demoNextUpFromPeek\(\);\s*renderDemoStandingsBand\(\);/);
  // (5.4.1 RINGSIDE: the result hold speaks the sign-off instead of reading the
  // next pair's names — the versus card's corner calls introduce them once.)
  assert.doesNotMatch(game, /announcerSay\(`\$\{id\}-name`, \{ delay: 1500 \}\)/, "the 5.4 name reads doubled the card's corner calls");
  assert.match(game, /if \(!demoSession\.qa\) \{\s*const cues = demoSignOffSpeech\(\{/);
  // The story is resolved once per card from the director's tag + the QA override.
  assert.match(game, /demoResolveShow\(cycle, showOverride\);/);
  assert.equal((game.match(/demoResolveShow\(/g) || []).length, 2);
  // No sim site ever reads the ledger or the standings.
  assert.doesNotMatch(game, /demoSession\.ledger\.fighters\[[^\]]*\]\.(wins|losses|streak) [<>=]/);
  // The HUD keeps the seed-url pin's cycle line verbatim; the story rides its own row.
  assert.match(game, /`\$\{text\.cycle\}\$\{onTheClock\}\$\{seedLabel\}`/);
  assert.match(game, /storyRow\.textContent = demoStoryBugText\(/);
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<strong id="demoHudStory" class="demo-hud-story" hidden>/);
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-areas: "show speed" "matchup matchup" "story story" "line line" "room room" "cycle prompt" "actions actions";/);
  // The standings band never covers the winner: bottom-anchored, demo-scoped.
  assert.match(css, /body\.demo-active \.attract-scores\.demo-standings \{\s*inset: auto 0 0 0;/);
});
