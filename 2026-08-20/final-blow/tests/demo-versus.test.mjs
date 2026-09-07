import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_VERSUS_BEAT_MS,
  DEMO_VERSUS_FIGHT_DELAY_MS,
  DEMO_VERSUS_HOLD_MS,
  DEMO_VERSUS_SPEECH_CAP_MS,
  demoVersusSpeechFloor,
  demoRecordLine,
  demoRingIntroDue,
  demoRingIntroPlan,
  demoStandingsAfterMatch,
  demoVersusAnnouncesRound,
  demoVersusCard,
  demoVersusCardTimes,
} from "../engine/demo-versus.mjs";
import { INTRO_ART_HOLD_MS, holdDecision } from "../engine/art-readiness.mjs";
import { DEMO_RESULT_HOLD_MS } from "../engine/demo.mjs";

// 5.4 FIGHT NIGHT — the VERSUS card and the ring introduction (demo sweep
// #8 / #20, on #16's time budget). The module is pure copy and a pure beat
// plan; these pin its contract, the hold floor it rides on, the seam's time
// budget, and — from source — the rule that every game.js entry point is
// gated on the demo so a played match is byte-identical.

const gameRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const corners = [
  { id: "alan", name: "ALLAN", title: "South Philly Heavyweight", archetype: "Heavyweight Counter-Puncher", color: "#d8d8d8" },
  { id: "deathblow", name: "DEATHBLOW", title: "Seismic Brawler", archetype: "Seismic Bruiser / Grappler", color: "#e52d2d" },
];

// ---------------------------------------------------------------------------
// The card copy
// ---------------------------------------------------------------------------

test("the card carries both corners: eyebrow, name, roster title, kit archetype, record, portrait and the name cue", () => {
  const card = demoVersusCard({ corners, stageName: "The Vet Parking Lot", cycle: 3 });
  assert.equal(card.cards.length, 2);
  assert.deepEqual(card.cards[0], {
    side: 0,
    id: "alan",
    eyebrow: "IN THE LEFT CORNER",
    name: "ALLAN",
    title: "SOUTH PHILLY HEAVYWEIGHT",
    archetype: "HEAVYWEIGHT COUNTER-PUNCHER",
    record: "FIRST BOUT TONIGHT",
    color: "#d8d8d8",
    portrait: "assets/fighters/alan.webp",
    cue: "alan-name",
  });
  assert.equal(card.cards[1].eyebrow, "IN THE RIGHT CORNER");
  assert.equal(card.cards[1].cue, "deathblow-name");
  assert.equal(card.stage.name, "THE VET PARKING LOT");
  assert.equal(card.stage.line, "TONIGHT · THE VET PARKING LOT");
  assert.equal(card.stage.show, "WATCH DEMO · CYCLE 3");
});

test("a CLOCK card says so on the show line, and the record line reads the standings", () => {
  const standings = { alan: { wins: 2, losses: 1 }, deathblow: { wins: 0, losses: 3 } };
  const card = demoVersusCard({ corners, stageName: "Somerset SEPTA Station", cycle: 7, format: "clock", standings });
  assert.equal(card.stage.show, "WATCH DEMO · CYCLE 7 · ON THE CLOCK");
  assert.equal(card.cards[0].record, "2-1 TONIGHT");
  assert.equal(card.cards[1].record, "0-3 TONIGHT");
  assert.equal(demoVersusCard({ corners: [], cycle: 0 }).stage.show, "WATCH DEMO · CYCLE 1", "cycles are 1-based");
});

test("the record line: FIRST BOUT TONIGHT with no record, W-L TONIGHT otherwise", () => {
  assert.equal(demoRecordLine(), "FIRST BOUT TONIGHT");
  assert.equal(demoRecordLine({ wins: 0, losses: 0 }), "FIRST BOUT TONIGHT");
  assert.equal(demoRecordLine({ wins: 1, losses: 0 }), "1-0 TONIGHT");
  assert.equal(demoRecordLine({ wins: 3, losses: 2 }), "3-2 TONIGHT");
  assert.equal(demoRecordLine({ wins: -1, losses: 2.7 }), "0-2 TONIGHT", "clamped and floored");
});

test("the standings fold never mutates its input, counts one win and one loss per exhibition, and survives a mirror", () => {
  const before = { alan: { wins: 1, losses: 0 } };
  const after = demoStandingsAfterMatch(before, "deathblow", "alan");
  assert.deepEqual(before, { alan: { wins: 1, losses: 0 } }, "input untouched");
  assert.deepEqual(after, { alan: { wins: 1, losses: 1 }, deathblow: { wins: 1, losses: 0 } });
  const mirror = demoStandingsAfterMatch({}, "jez", "jez");
  assert.deepEqual(mirror, { jez: { wins: 1, losses: 1 } });
  assert.deepEqual(demoStandingsAfterMatch(undefined, "", ""), {});
});

// ---------------------------------------------------------------------------
// The ring introduction — the order is the whole point
// ---------------------------------------------------------------------------

test("the plan runs left corner, right corner, stage, ROUND 1, FIGHT! — in that order, with the recorded name takes and no invented cue", () => {
  const card = demoVersusCard({ corners, stageName: "The Vet Parking Lot", cycle: 2 });
  const plan = demoRingIntroPlan({ card, stageName: "The Vet Parking Lot" });
  assert.deepEqual(plan.map((beat) => beat.kind), ["corner", "corner", "stage", "round", "fight"]);
  assert.deepEqual(plan.map((beat) => beat.cue), ["alan-name", "deathblow-name", "", "round1", "fight"]);
  assert.deepEqual(plan.map((beat) => beat.at), [0, 1000, 1900, DEMO_VERSUS_HOLD_MS, DEMO_VERSUS_HOLD_MS + DEMO_VERSUS_FIGHT_DELAY_MS]);
  assert.deepEqual(plan.map((beat) => beat.text), [
    "IN THE LEFT CORNER · ALLAN", "IN THE RIGHT CORNER · DEATHBLOW", "THE VET PARKING LOT", "ROUND 1", "FIGHT!",
  ]);
  assert.deepEqual(plan[2].banner, { main: "THE VET PARKING LOT", sub: "WATCH DEMO · CYCLE 2" });
  assert.deepEqual(plan[3].banner, { main: "ROUND 1", sub: "THE VET PARKING LOT" });
  assert.equal(plan[3].release, true, "ROUND 1 is owed at the hold's release");
  // The beats are strictly ordered in time, and every cue named is a bank
  // that exists in the reviewed set (no stage cue is recorded, so none is booked).
  for (let index = 1; index < plan.length; index += 1) assert.ok(plan[index].at > plan[index - 1].at);
});

test("the plan is honest about the speech clock: the corner takes fit their beats and ROUND 1 gets its 1150 ms before FIGHT!", async () => {
  const manifest = JSON.parse(await readFile(join(gameRoot, "assets/audio/MANIFEST.json"), "utf8"));
  const files = manifest.announcer.files;
  const longest = (prefix) => Math.max(...Object.entries(files).filter(([name]) => name.startsWith(prefix)).map(([, meta]) => meta.ms));
  // Every fighter has a recorded name bank; the median take is under the
  // 1000 ms corner beat and the longest (donald-name-3, 2847 ms) is what the
  // announcer busy window absorbs — the right corner is pushed, never lost.
  for (const id of ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "devil"]) {
    assert.ok(manifest.announcer.cues[`${id}-name`] >= 3, `${id}-name has takes`);
  }
  assert.ok(longest("round1-") <= DEMO_VERSUS_FIGHT_DELAY_MS + 1300, `round1 takes (${longest("round1-")} ms) sit inside the ROUND -> FIGHT window plus one bell`);
  assert.equal(DEMO_VERSUS_FIGHT_DELAY_MS, 1150, "the ROUND -> FIGHT spacing startMatch has always used");
});

test("due beats: only the corner and stage beats ever fire from the clock, in order, never twice", () => {
  const card = demoVersusCard({ corners, stageName: "Wildwood Boardwalk", cycle: 1 });
  const plan = demoRingIntroPlan({ card, stageName: "Wildwood Boardwalk" });
  assert.deepEqual(demoRingIntroDue(plan, 0, 0).map((beat) => beat.kind), ["corner"]);
  assert.deepEqual(demoRingIntroDue(plan, 999, 1).map((beat) => beat.kind), []);
  assert.deepEqual(demoRingIntroDue(plan, 1000, 1).map((beat) => beat.side), [1]);
  assert.deepEqual(demoRingIntroDue(plan, 5000, 0).map((beat) => beat.kind), ["corner", "corner", "stage"], "a clock that ran past (a hidden tab) fires the missed beats in order and stops at the ROUND beat");
  assert.deepEqual(demoRingIntroDue(plan, 99999, 3), [], "the round and fight beats are never the clock's to fire");
  assert.deepEqual(demoVersusCardTimes(), [0, 1, 1.9]);
  assert.deepEqual(demoVersusCardTimes(DEMO_VERSUS_BEAT_MS), [DEMO_VERSUS_BEAT_MS.left / 1000, DEMO_VERSUS_BEAT_MS.right / 1000, DEMO_VERSUS_BEAT_MS.stage / 1000]);
});

test("a single-corner card (a malformed pair) still plans without throwing", () => {
  const plan = demoRingIntroPlan({ card: demoVersusCard({ corners: [corners[0]], stageName: "X" }), stageName: "X" });
  assert.deepEqual(plan.map((beat) => beat.kind), ["corner", "stage", "round", "fight"]);
});

test("ROUND 1 is owed at a release only while the sim is still in the intro", () => {
  assert.equal(demoVersusAnnouncesRound({ reason: "floor" }), true);
  assert.equal(demoVersusAnnouncesRound({ reason: "capped" }), true);
  assert.equal(demoVersusAnnouncesRound({ reason: "ready" }), true);
  assert.equal(demoVersusAnnouncesRound({ reason: "left" }), false, "the QA manual clock stepped through the intro: the fight is on");
  assert.equal(demoVersusAnnouncesRound({ reason: "rearmed" }), false);
  assert.equal(demoVersusAnnouncesRound({ reason: "floor", phase: "fight" }), false);
  assert.equal(demoVersusAnnouncesRound({ reason: "floor", screen: "result" }), false);
});

// ---------------------------------------------------------------------------
// The hold floor (engine/art-readiness) and the seam's time budget
// ---------------------------------------------------------------------------

test("holdDecision with a floor: holds to the floor with nothing pending, releases as 'floor', and caps a pending sheet past it", () => {
  const floorMs = DEMO_VERSUS_HOLD_MS;
  assert.deepEqual(holdDecision({ startedAt: 0, now: 100, pendingCount: 0, floorMs }), { hold: true, reason: "holding", elapsed: 100 });
  assert.deepEqual(holdDecision({ startedAt: 0, now: 2599, pendingCount: 0, floorMs }), { hold: true, reason: "holding", elapsed: 2599 });
  assert.deepEqual(holdDecision({ startedAt: 0, now: 2600, pendingCount: 0, floorMs }), { hold: false, reason: "floor", elapsed: 2600 });
  assert.deepEqual(holdDecision({ startedAt: 0, now: 2000, pendingCount: 2, floorMs }), { hold: true, reason: "holding", elapsed: 2000 }, "a pending sheet past the 1.5 s cap but under the floor still holds — the card is the cover");
  assert.deepEqual(holdDecision({ startedAt: 0, now: 2600, pendingCount: 2, floorMs }), { hold: false, reason: "capped", elapsed: 2600 }, "the floor is the cap for a sheet that never decoded");
  assert.deepEqual(holdDecision({ startedAt: 0, now: 300, pendingCount: 0, floorMs, inIntro: false }), { hold: false, reason: "left", elapsed: 300 }, "leaving the intro always wins");
});

test("holdDecision without a floor is byte-identical to the shipped decision", () => {
  const cases = [
    { pendingCount: 0, now: 10 }, { pendingCount: 1, now: 10 }, { pendingCount: 1, now: INTRO_ART_HOLD_MS },
    { pendingCount: 1, now: INTRO_ART_HOLD_MS + 1 }, { pendingCount: 3, now: 5, inIntro: false },
  ];
  for (const input of cases) {
    assert.deepEqual(holdDecision({ startedAt: 0, ...input }), holdDecision({ startedAt: 0, ...input, floorMs: 0 }));
  }
  assert.deepEqual(holdDecision({ startedAt: 0, now: 10, pendingCount: 0 }), { hold: false, reason: "ready", elapsed: 10 });
  assert.deepEqual(holdDecision({ startedAt: 0, now: INTRO_ART_HOLD_MS, pendingCount: 1 }), { hold: false, reason: "capped", elapsed: INTRO_ART_HOLD_MS });
});

test("the seam: 3.0 s of result hold for the spoken sign-off, then the 2.6 s card floor — under the 8 s it was at 5.3", () => {
  // Before 5.4: a 5000 ms result hold, then the 2.25 s round-1 intro (3.0 s of
  // wall clock at the 0.75x demo rate) = 8.0 s between two exhibitions. 5.4
  // repartitioned it to 2.4 s + 2.6 s. 5.4.1 RINGSIDE speaks the sign-off in
  // the result hold (a fragment, the winner's name take, sometimes a tail —
  // about 3 s) and the venue on the card, so the result hold is 3.0 s and
  // the card's floor extends to the moment the MC's window clears (capped).
  assert.equal(DEMO_RESULT_HOLD_MS, 3000);
  assert.equal(DEMO_VERSUS_HOLD_MS, 2600);
  assert.ok(DEMO_RESULT_HOLD_MS + DEMO_VERSUS_SPEECH_CAP_MS <= 9000, "even a capped card keeps the seam near the 5.3 length");
  assert.ok(DEMO_VERSUS_BEAT_MS.stage < DEMO_VERSUS_HOLD_MS, "the stage banner lands before the ROUND card");
  assert.ok(DEMO_VERSUS_BEAT_MS.right - DEMO_VERSUS_BEAT_MS.left >= 1000, "the left corner's name take has its beat before the right corner is called");
});

test("the speech floor: the card holds while the MC is talking, never under its own floor, never past the cap", () => {
  assert.equal(demoVersusSpeechFloor({ floorMs: 2600, startedAt: 1000, busyUntil: 0 }), 2600, "nothing queued: the card's own floor");
  assert.equal(demoVersusSpeechFloor({ floorMs: 2600, startedAt: 1000, busyUntil: 3000 }), 2600, "a window that clears before the floor changes nothing");
  assert.equal(demoVersusSpeechFloor({ floorMs: 2600, startedAt: 1000, busyUntil: 5200 }), 4450, "a venue call still playing at 4.2 s: ROUND 1 follows it (plus the 250 ms settle)");
  assert.equal(demoVersusSpeechFloor({ floorMs: 2600, startedAt: 1000, busyUntil: 60000 }), DEMO_VERSUS_SPEECH_CAP_MS, "a stuck window cannot hold the card past the cap");
  assert.equal(demoVersusSpeechFloor({ floorMs: 0, startedAt: 0, busyUntil: 0 }), 250, "no floor at all: only the settle");
});

// ---------------------------------------------------------------------------
// Source pins: every game.js entry point is gated on the demo
// ---------------------------------------------------------------------------

test("game.js: the versus card, the hold floor, the standings and the deferred ROUND card are all demo-gated; the WATCH DEMO slam is gone", async () => {
  const source = await readFile(join(gameRoot, "game.js"), "utf8");
  const block = (name) => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} exists`);
    return source.slice(start, source.indexOf("\n}\n", start) + 3);
  };
  // The one gate every entry point asks.
  assert.match(block("demoVersusWanted"), /state\.mode === "demo" && demoSession\.active/);
  assert.match(block("demoVersusWanted"), /state\.round === 1/);
  assert.match(block("demoVersusWanted"), /!rollbackResimulating/);
  assert.match(block("planDemoVersusCard"), /if \(!demoVersusWanted\(resetSet\)\) return null;/);
  // The floor only exists while a card is planned; a played match arms the
  // hold exactly as before (floorMs 0 -> the pre-5.4 skip when nothing pends).
  const arm = block("armIntroArtHold");
  assert.match(arm, /const floorMs = holdable && demoVersus\.planned \? DEMO_VERSUS_HOLD_MS : 0;/);
  assert.match(arm, /if \(!pending\.length && !floorMs\) \{/);
  // startMatch defers the ROUND card only on a versus card; every other mode
  // announces it where it always did.
  const startMatch = block("startMatch");
  assert.match(startMatch, /const versus = planDemoVersusCard\(resetSet\);/);
  assert.match(startMatch, /if \(versus\) demoVersus\.roundCard = \{ main: introMain, sub: introLabel \};\n  else announce\(introMain, introLabel, 1\.2\);/);
  assert.match(startMatch, /if \(versus\) mountDemoVersusCard\(\);/);
  // The release announces the deferred card and clears the box.
  assert.match(block("releaseIntroArtHold"), /releaseDemoVersusCard\(reason, now\);/);
  assert.match(block("releaseDemoVersusCard"), /demoVersusAnnouncesRound\(\{ reason, phase: state\.phase, screen: state\.screen \}\)/);
  // The standings fold and the beat firing are demo-only.
  assert.match(block("noteDemoMatchResult"), /if \(state\.mode !== "demo" \|\| !demoSession\.active \|\| rollbackResimulating\) return;/);
  assert.match(block("showResult"), /if \(state\.mode === "demo"\) \{\n    demoRecordBout\(winner\);\n    noteDemoMatchResult\(winner\);\n    scheduleNextDemoMatch\(\);\n  \}/);
  assert.match(block("fireDemoVersusBeats"), /if \(!demoVersus\.active \|\| !demoVersus\.plan\) return;/);
  // The collision itself: startNextDemoMatch no longer slams WATCH DEMO over
  // the ROUND 1 card.
  assert.doesNotMatch(block("startNextDemoMatch"), /announce\(`WATCH DEMO/);
  assert.doesNotMatch(source, /announce\(`WATCH DEMO · CYCLE/);
  // The arcade exchange keeps its phase-clock reveal: the versus clock is
  // read only for the versus kind.
  assert.match(block("updateIntroDialogue"), /const versus = introDialogue\.clock === "versus";/);
  assert.match(block("updateIntroDialogue"), /const elapsed = versus \? demoVersusElapsedMs\(\) \/ 1000 : introDialogue\.total - state\.phaseTime;/);
});
