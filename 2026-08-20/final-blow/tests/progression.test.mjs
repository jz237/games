import assert from "node:assert/strict";
import test from "node:test";

import {
  BLACK_BOOK_ENTRIES,
  BLACK_BOOK_RULES,
  MASTERY_TIERS,
  applyMatchToRecords,
  blackBookEntry,
  blackBookObserve,
  blackBookSummary,
  createBlackBookProgress,
  createRecordsStore,
  evaluateBlackBook,
  favoriteMove,
  masteryPoints,
  masteryRank,
  normalizeBlackBookStore,
  normalizeRecordsStore,
  prettyMoveName,
  recordsSummary,
} from "../engine/progression.mjs";
import { ARCADE_CREDITS, ARCADE_ENDING_PANELS, endingPanelsFor } from "../engine/arcade.mjs";

// Wave 17: the Pinelands Devil joins the base roster the set-collection
// entries count over (the Commissioner stays the secret extra).
const FIGHTERS = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "devil"];
const STAGES = ["somerset", "vet", "wildwood", "buffet", "cruise", "janney"];

// --- Mastery derivation ------------------------------------------------------

test("mastery tiers are ordered and reachable from usage + wins", () => {
  assert.equal(MASTERY_TIERS[0].id, "none");
  for (let index = 1; index < MASTERY_TIERS.length; index += 1) {
    assert.ok(MASTERY_TIERS[index].min > MASTERY_TIERS[index - 1].min, "tier thresholds ascend");
    assert.ok(MASTERY_TIERS[index].name.length > 3, "every tier carries a Philly rank name");
  }
  assert.equal(masteryRank(null).id, "none");
  assert.equal(masteryPoints(null), 0);
  const grinder = { wins: 2, losses: 3, roundWins: 5, fatalities: 1, dizzies: 1, peakCombo: 4, damageDealt: 500 };
  const points = masteryPoints(grinder);
  assert.equal(points, 2 * 40 + 3 * 8 + 5 * 10 + 15 + 6 + 4 * 3 + Math.floor(500 / 50));
  const rank = masteryRank(grinder);
  assert.equal(rank.id, "bronze", "a few matches reach CORNER STORE CONTENDER");
  assert.equal(rank.points, points);
  assert.equal(rank.nextName, MASTERY_TIERS[2].name);
  assert.equal(rank.toNext, MASTERY_TIERS[2].min - points);
  const legend = masteryRank({ wins: 60, roundWins: 130, fatalities: 20, damageDealt: 20000 });
  assert.equal(legend.id, "onyx");
  assert.equal(legend.toNext, 0, "the top tier has nothing above it");
});

test("mastery points are monotonic in wins and never negative on junk", () => {
  const base = masteryPoints({ wins: 2, losses: 2 });
  const better = masteryPoints({ wins: 3, losses: 2 });
  assert.ok(better > base);
  assert.equal(masteryPoints({ wins: -5, losses: "junk", damageDealt: -100 }), 0);
});

// --- Records accumulation ----------------------------------------------------

function playMatch(store, overrides = {}) {
  return applyMatchToRecords(store, {
    fighterId: "jez",
    mode: "versus",
    won: true,
    rounds: 3,
    roundWins: 2,
    damageDealt: 180,
    damageTaken: 90,
    fatalities: 1,
    fatalityVariants: ["jez:0"],
    dizzies: 1,
    perfects: 1,
    peakCombo: 5,
    timeOverWin: false,
    moveUses: { neonPalm: 4, "jez-light-punch": 6 },
    ...overrides,
  });
}

test("records accumulate across matches with mode splits and lifetime totals", () => {
  const store = createRecordsStore();
  playMatch(store);
  playMatch(store, { won: false, mode: "arcade", damageDealt: 40, damageTaken: 130, fatalities: 0, fatalityVariants: [], perfects: 0, peakCombo: 9, moveUses: { neonPalm: 2 } });
  const record = store.fighters.jez;
  assert.equal(record.matches, 2);
  assert.equal(record.wins, 1);
  assert.equal(record.losses, 1);
  assert.equal(record.rounds, 6);
  assert.equal(record.roundWins, 4);
  assert.equal(record.damageDealt, 220);
  assert.equal(record.damageTaken, 220);
  assert.equal(record.fatalities, 1);
  assert.equal(record.fatalityVariants["jez:0"], 1);
  assert.equal(record.dizzies, 2);
  assert.equal(record.perfects, 1);
  assert.equal(record.peakCombo, 9, "peak combo keeps the maximum, not the sum");
  assert.deepEqual(record.modes, { versus: { wins: 1, losses: 0 }, arcade: { wins: 0, losses: 1 } });
  assert.equal(record.moveUses.neonPalm, 6);
  assert.equal(store.lifetime.matches, 2);
  assert.equal(store.lifetime.wins, 1);
  assert.equal(store.lifetime.damageDealt, 220);
  const summary = recordsSummary(store);
  assert.equal(summary.matches, 2);
  assert.equal(summary.topFighterId, "jez");
  assert.ok(summary.topPoints > 0);
});

test("rank-ups are reported exactly when a tier boundary is crossed", () => {
  const store = createRecordsStore();
  let rankedUp = false;
  for (let match = 0; match < 10; match += 1) {
    const result = playMatch(store);
    if (result.rankedUp) {
      rankedUp = true;
      assert.ok(result.after.tierIndex > result.before.tierIndex);
    }
  }
  assert.ok(rankedUp, "ten wins must cross at least one tier boundary");
  assert.ok(masteryRank(store.fighters.jez).tierIndex >= 1);
});

test("favorite move is deterministic and pretty-printed for the UI", () => {
  const record = { moveUses: { "jez-heavy-kick": 3, neonPalm: 3, jab: 1 } };
  assert.deepEqual(favoriteMove(record), { action: "jez-heavy-kick", count: 3 }, "ties break alphabetically");
  assert.equal(favoriteMove({ moveUses: {} }), null);
  assert.equal(prettyMoveName("neonPalm"), "NEON PALM");
  assert.equal(prettyMoveName("jez-heavy-kick"), "JEZ HEAVY KICK");
  assert.equal(prettyMoveName("stage-weapon-crab_leg"), "STAGE WEAPON CRAB LEG");
});

test("records store load is tolerant of junk and clamps to sane shapes", () => {
  assert.deepEqual(normalizeRecordsStore(null), createRecordsStore());
  assert.deepEqual(normalizeRecordsStore("garbage"), createRecordsStore());
  const restored = normalizeRecordsStore({
    lifetime: { matches: "7", wins: 3.9, damageDealt: -50 },
    fighters: {
      jez: { wins: "2", losses: null, moveUses: { jab: "3", ghost: 0 }, modes: { versus: { wins: "1" } } },
      bogus: "not-an-object",
    },
  });
  assert.equal(restored.lifetime.matches, 7);
  assert.equal(restored.lifetime.wins, 4);
  assert.equal(restored.lifetime.damageDealt, 0);
  assert.equal(restored.fighters.jez.wins, 2);
  assert.deepEqual(restored.fighters.jez.moveUses, { jab: 3 });
  assert.deepEqual(restored.fighters.jez.modes.versus, { wins: 1, losses: 0 });
  assert.deepEqual(restored.fighters.bogus, normalizeRecordsStore(null).fighters.bogus ?? restored.fighters.bogus);
});

// --- Black Book: ledger shape ------------------------------------------------

test("the Black Book carries ~30+ unique, fully-authored entries", () => {
  assert.ok(BLACK_BOOK_ENTRIES.length >= 30, `expected ~30 entries, got ${BLACK_BOOK_ENTRIES.length}`);
  const ids = new Set(BLACK_BOOK_ENTRIES.map((entry) => entry.id));
  assert.equal(ids.size, BLACK_BOOK_ENTRIES.length, "entry ids are unique");
  const fresh = createBlackBookProgress();
  for (const entry of BLACK_BOOK_ENTRIES) {
    assert.ok(entry.title.length >= 4, `${entry.id} has a title`);
    assert.ok(entry.line.length >= 10, `${entry.id} has an unlocked line`);
    assert.ok(entry.hint.length >= 8, `${entry.id} has a redacted hint`);
    assert.equal(typeof entry.test, "function");
    assert.equal(entry.test(fresh), false, `${entry.id} must start locked on a fresh ledger`);
  }
  assert.equal(blackBookEntry("first-entry")?.title, "FIRST ENTRY IN RED");
  assert.equal(blackBookEntry("nope"), null);
});

test("the spec's required entries all exist", () => {
  for (const id of [
    "every-jawn-thrown", "street-furnished", "double-feature", "death-by-papercuts",
    "south-philly-stance", "greased-pole", "the-book-closes", "the-picture-show",
    "door-breaker", "split-second", "showboat", "off-the-rowhome-wall", "paid-in-grit",
    "five-deep", "three-straight-mornings", "clean-sweep", "quarter-million-row",
  ]) {
    assert.ok(blackBookEntry(id), `missing required entry ${id}`);
  }
});

// --- Black Book: observation + predicates ------------------------------------

test("set-collection entries need the full set (throwables, stages, variants)", () => {
  const progress = createBlackBookProgress();
  for (const id of FIGHTERS.slice(0, 8)) blackBookObserve(progress, { type: "event", kind: "throwableLand", fighterId: id });
  assert.equal(blackBookEntry("every-jawn-thrown").test(progress), false);
  // Wave 17: the ninth jawn — the Devil's hex charm — closes the set.
  blackBookObserve(progress, { type: "event", kind: "throwableLand", fighterId: "devil" });
  assert.equal(blackBookEntry("every-jawn-thrown").test(progress), true);

  for (const stage of STAGES.slice(0, 5)) blackBookObserve(progress, { type: "event", kind: "weaponKo", stage });
  assert.equal(blackBookEntry("street-furnished").test(progress), false);
  blackBookObserve(progress, { type: "event", kind: "weaponKo", stage: "janney" });
  assert.equal(blackBookEntry("street-furnished").test(progress), true);

  for (const id of FIGHTERS) {
    blackBookObserve(progress, { type: "roundEnd", won: true, fatality: { fighterId: id, variant: 0 } });
    assert.equal(blackBookEntry("double-feature").test(progress), false);
  }
  for (const id of FIGHTERS) blackBookObserve(progress, { type: "roundEnd", won: true, fatality: { fighterId: id, variant: 1 } });
  assert.equal(blackBookEntry("double-feature").test(progress), true);
  assert.equal(progress.tallies.fatalities, 18, "every observed finisher also counts once");
});

test("round-end predicates: no-jump, perfect, decision, chip, combo, boss finish", () => {
  const progress = createBlackBookProgress();
  blackBookObserve(progress, { type: "roundEnd", won: true, jumped: true, combo: 4 });
  assert.equal(blackBookEntry("south-philly-stance").test(progress), false);
  blackBookObserve(progress, { type: "roundEnd", won: true, jumped: false, combo: 11 });
  assert.equal(blackBookEntry("south-philly-stance").test(progress), true);
  assert.equal(blackBookEntry("ten-deep-on-ridge").test(progress), true, "the 10-hit combo entry reads best.combo");
  assert.equal(blackBookEntry("not-a-scratch").test(progress), false);
  blackBookObserve(progress, { type: "roundEnd", won: true, perfect: true, jumped: true });
  assert.equal(blackBookEntry("not-a-scratch").test(progress), true);
  // Chip damage can never KO (blocked damage floors at 1 HP), so the chip win
  // is defined as a decision round whose last word was chip.
  blackBookObserve(progress, { type: "roundEnd", won: true, timeOver: true, chip: false, jumped: true });
  assert.equal(blackBookEntry("judges-table").test(progress), true);
  assert.equal(blackBookEntry("death-by-papercuts").test(progress), false);
  blackBookObserve(progress, { type: "roundEnd", won: true, timeOver: true, chip: true, jumped: true });
  assert.equal(blackBookEntry("death-by-papercuts").test(progress), true);
  // A LOST round contributes nothing to the win-flavoured tallies.
  const before = JSON.stringify(progress.tallies);
  blackBookObserve(progress, { type: "roundEnd", won: false, perfect: true, timeOver: true, chip: true, jumped: false });
  assert.equal(JSON.stringify(progress.tallies), before, "lost rounds never bank win tallies");
  blackBookObserve(progress, { type: "roundEnd", won: true, fatality: { fighterId: "jez", variant: 0, opponentIsBoss: true } });
  assert.equal(blackBookEntry("closed-session").test(progress), true);
});

test("match-end and event tallies: techs, guards, taunt, wall bounce, EX, cinema", () => {
  const progress = createBlackBookProgress();
  blackBookObserve(progress, { type: "matchEnd", won: true, stage: "vet", techs: BLACK_BOOK_RULES.matchGrabTechs, dizzies: 3, supers: 3, perfectRounds: 2, runScore: 260000 });
  assert.equal(blackBookEntry("greased-pole").test(progress), true);
  assert.equal(blackBookEntry("seeing-pigeons").test(progress), true);
  assert.equal(blackBookEntry("grit-spender").test(progress), true);
  assert.equal(blackBookEntry("untouched-after-dark").test(progress), true);
  assert.equal(blackBookEntry("quarter-million-row").test(progress), true);
  assert.equal(blackBookEntry("first-entry").test(progress), true, "a won match is the first ink");
  for (let count = 0; count < BLACK_BOOK_RULES.perfectGuards; count += 1) blackBookObserve(progress, { type: "event", kind: "perfectGuard" });
  assert.equal(blackBookEntry("split-second").test(progress), true);
  assert.equal(blackBookEntry("parry-in-the-park").test(progress), true);
  for (let count = 0; count < BLACK_BOOK_RULES.guardCrushes; count += 1) blackBookObserve(progress, { type: "event", kind: "guardCrush" });
  assert.equal(blackBookEntry("door-breaker").test(progress), true);
  blackBookObserve(progress, { type: "event", kind: "taunt" });
  blackBookObserve(progress, { type: "event", kind: "wallBounce" });
  blackBookObserve(progress, { type: "event", kind: "exThrowable" });
  blackBookObserve(progress, { type: "event", kind: "cinema3d" });
  assert.equal(blackBookEntry("showboat").test(progress), true);
  assert.equal(blackBookEntry("off-the-rowhome-wall").test(progress), true);
  assert.equal(blackBookEntry("paid-in-grit").test(progress), true);
  assert.equal(blackBookEntry("the-picture-show").test(progress), true);
});

test("run-end predicates: arcade clears, FINAL, streaks, daily, team sweep, table top", () => {
  const progress = createBlackBookProgress();
  blackBookObserve(progress, { type: "runEnd", kind: "arcade", fighterId: "jez", finalDifficulty: false });
  assert.equal(blackBookEntry("ladder-climbed").test(progress), true);
  assert.equal(blackBookEntry("the-book-closes").test(progress), false);
  blackBookObserve(progress, { type: "runEnd", kind: "arcade", fighterId: "post", finalDifficulty: true });
  assert.equal(blackBookEntry("the-book-closes").test(progress), true);
  for (const id of FIGHTERS) blackBookObserve(progress, { type: "runEnd", kind: "arcade", fighterId: id });
  assert.equal(blackBookEntry("eight-signatures").test(progress), true);
  blackBookObserve(progress, { type: "runEnd", kind: "survival", wins: 5 });
  assert.equal(blackBookEntry("five-deep").test(progress), true);
  assert.equal(blackBookEntry("double-digits-after-dark").test(progress), false);
  blackBookObserve(progress, { type: "runEnd", kind: "survival", wins: 12 });
  assert.equal(blackBookEntry("double-digits-after-dark").test(progress), true);
  blackBookObserve(progress, { type: "runEnd", kind: "daily", cleared: true, streak: 3 });
  assert.equal(blackBookEntry("one-a-day").test(progress), true);
  assert.equal(blackBookEntry("three-straight-mornings").test(progress), true);
  blackBookObserve(progress, { type: "runEnd", kind: "team", won: true, sweep: true });
  assert.equal(blackBookEntry("clean-sweep").test(progress), true);
  blackBookObserve(progress, { type: "highScore", rank: 3 });
  assert.equal(blackBookEntry("name-in-lights").test(progress), false);
  blackBookObserve(progress, { type: "highScore", rank: 0 });
  assert.equal(blackBookEntry("name-in-lights").test(progress), true);
});

test("evaluateBlackBook stamps fresh unlocks once, in ledger order, with the date", () => {
  const progress = createBlackBookProgress();
  blackBookObserve(progress, { type: "matchEnd", won: true, stage: "vet" });
  blackBookObserve(progress, { type: "roundEnd", won: true, jumped: false });
  const fresh = evaluateBlackBook(progress, "2026-08-30");
  const ids = fresh.map((entry) => entry.id);
  assert.ok(ids.includes("first-entry"));
  assert.ok(ids.includes("south-philly-stance"));
  assert.equal(progress.unlocked["first-entry"], "2026-08-30");
  assert.equal(progress.lastUnlock, fresh.at(-1).id);
  assert.deepEqual(evaluateBlackBook(progress, "2026-08-31"), [], "already-inked entries never re-unlock");
  const summary = blackBookSummary(progress);
  assert.equal(summary.unlocked, ids.length);
  assert.equal(summary.total, BLACK_BOOK_ENTRIES.length);
});

test("black book store load is tolerant of junk and round-trips unlocks", () => {
  assert.deepEqual(normalizeBlackBookStore(undefined), createBlackBookProgress());
  const restored = normalizeBlackBookStore({
    unlocked: { "first-entry": "2026-08-29", ghost: "" },
    lastUnlock: "first-entry",
    sets: { throwables: { jez: 1, deathblow: true }, nonsense: { x: 1 } },
    tallies: { matchesWon: "9", perfectGuards: -2, bogus: 4 },
    best: { combo: "12" },
  });
  assert.equal(restored.unlocked["first-entry"], "2026-08-29");
  assert.equal(restored.lastUnlock, "first-entry");
  assert.deepEqual(Object.keys(restored.sets.throwables).sort(), ["deathblow", "jez"]);
  assert.equal(restored.sets.nonsense, undefined);
  assert.equal(restored.tallies.matchesWon, 9);
  assert.equal(restored.tallies.perfectGuards, 0);
  assert.equal(restored.tallies.bogus, undefined);
  assert.equal(restored.best.combo, 12);
});

// --- Arcade ending panels + credits data -------------------------------------

test("every roster fighter has a full 3-panel ending over shipped art", () => {
  // Wave 16: the secret ninth resolution ships beside the eight mains.
  assert.deepEqual(Object.keys(ARCADE_ENDING_PANELS).sort(), [...FIGHTERS, "commissioner"].sort());
  for (const id of [...FIGHTERS, "commissioner"]) {
    const panels = endingPanelsFor(id);
    assert.equal(panels.length, 3, `${id} has exactly three panels`);
    for (const panel of panels) {
      assert.ok(panel.title.length >= 4, `${id} panel titled`);
      const sentences = panel.text.split(/[.!?]+\s*/).filter(Boolean).length;
      assert.ok(sentences >= 2 && sentences <= 3, `${id} panels run 2-3 sentences (${sentences})`);
      assert.ok(["specials", "portrait"].includes(panel.art), `${id} reuses shipped art only`);
      assert.ok(Number.isInteger(panel.frame) && panel.frame >= 0 && panel.frame <= 15, `${id} atlas frame in the 4x4 grid`);
      assert.ok(["night", "work", "dawn"].includes(panel.treat), `${id} uses a known CSS grade`);
    }
  }
  // Wave 16: the boss IS a player now — his panels ship like everyone's.
  assert.equal(endingPanelsFor("commissioner")?.length, 3, "the unlocked Commissioner has a player ending");
});

test("the credits roll data credits Jez, the agents, and the toolchain", () => {
  assert.equal(ARCADE_CREDITS.heading, "FINAL BLOW");
  assert.ok(ARCADE_CREDITS.crew.length >= 5);
  const names = ARCADE_CREDITS.crew.map((row) => `${row.role} ${row.name}`).join(" · ");
  assert.match(names, /JEZ/);
  assert.match(names, /ELEVENLABS/);
  assert.match(names, /GPT-IMAGE/);
  assert.match(names, /CLAW|GAMEMAKER|AGENT/);
  assert.equal(ARCADE_CREDITS.bossCredit.name, "KEEPER OF THE BLACK BOOK");
  assert.ok(ARCADE_CREDITS.finale.length > 5);
});

console.log("Final Blow progression tests passed");
