// w51 announcer/clock truth: the round-end call, the clock tick and the
// no-repeat take bag are pure functions in engine/announcer.mjs; the game.js
// pins below keep the wiring honest (a decision must not play knockout.mp3,
// a dizzy must not either, the tick must sit on the timer edge).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BANNER_CUES,
  CLOCK_CALLOUT_SECONDS,
  CLOCK_TICK_SECONDS,
  FIGHTER_CALL_DELAY_MS,
  ROUND_END_CAUSES,
  bannerAnnouncerPlan,
  clockTickPlan,
  dizzyRingPlan,
  drawFromBag,
  roundBannerCue,
  roundEndAnnouncerPlan,
  roundEndBannerSub,
  roundEndCause,
} from "../engine/announcer.mjs";

const gameSource = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const slice = (from, to) => {
  const start = gameSource.indexOf(from);
  assert.notEqual(start, -1, `game.js should contain ${from}`);
  const end = gameSource.indexOf(to, start);
  assert.notEqual(end, -1, `game.js should contain ${to} after ${from}`);
  return gameSource.slice(start, end);
};

test("a time-over on two standing fighters is a decision, a KO stays a KO", () => {
  assert.equal(roundEndCause({ finisherType: -1, timer: 0, loserHealth: 37 }), ROUND_END_CAUSES.decision);
  assert.equal(roundEndCause({ finisherType: -1, timer: 0, loserHealth: 0 }), ROUND_END_CAUSES.knockout);
  assert.equal(roundEndCause({ finisherType: -1, timer: 42, loserHealth: 0 }), ROUND_END_CAUSES.knockout);
  // Finishing-window expiry: loser at 0, clock stopped above 0 -> knockout.
  assert.equal(roundEndCause({ finisherType: -1, timer: 18, loserHealth: -3 }), ROUND_END_CAUSES.knockout);
  assert.equal(roundEndCause({ finisherType: 1, timer: 0, loserHealth: 12 }), ROUND_END_CAUSES.finisher);
  assert.equal(roundEndBannerSub(ROUND_END_CAUSES.decision), "DECISION");
  assert.equal(roundEndBannerSub(ROUND_END_CAUSES.knockout), "KNOCKOUT");
});

test("the round-end plan opens on timeover for a decision and splits round vs match wins", () => {
  assert.deepEqual(roundEndAnnouncerPlan({ cause: ROUND_END_CAUSES.knockout, matchWon: false, fighterId: "benny" }), [
    { cue: "ko", delay: 0 },
    { cue: "benny-name", delay: FIGHTER_CALL_DELAY_MS },
  ]);
  assert.deepEqual(roundEndAnnouncerPlan({ cause: ROUND_END_CAUSES.knockout, matchWon: true, fighterId: "benny" }), [
    { cue: "ko", delay: 0 },
    { cue: "benny-wins", delay: FIGHTER_CALL_DELAY_MS },
  ]);
  assert.deepEqual(roundEndAnnouncerPlan({ cause: ROUND_END_CAUSES.decision, matchWon: false, fighterId: "ali" }), [
    { cue: "timeover", delay: 0 },
    { cue: "ali-name", delay: FIGHTER_CALL_DELAY_MS },
  ]);
  assert.deepEqual(roundEndAnnouncerPlan({ cause: ROUND_END_CAUSES.decision, matchWon: true, fighterId: "ali" }), [
    { cue: "timeover", delay: 0 },
    { cue: "ali-wins", delay: FIGHTER_CALL_DELAY_MS },
  ]);
  // No fighter id (text-only fallback with an unknown name): the primary call only.
  assert.deepEqual(roundEndAnnouncerPlan({ cause: ROUND_END_CAUSES.knockout }), [{ cue: "ko", delay: 0 }]);
  // The cues the plan can name all have caption lines and, where recorded, takes.
  const lines = slice("const ANNOUNCER_LINES = (() => {", "return Object.freeze(banks);");
  for (const cue of ["ko", "timeover", "tenseconds"]) assert.match(lines, new RegExp(`\\n\\s+${cue}: \\[`), `${cue} bank`);
  assert.match(lines, /banks\[`\$\{id\}-name`\]/);
  assert.match(lines, /banks\[`\$\{id\}-wins`\]/);
});

test("the clock tick is a rising ladder with no two consecutive readings alike, buzzer at :00", () => {
  assert.equal(CLOCK_TICK_SECONDS, 10);
  assert.equal(CLOCK_CALLOUT_SECONDS, 10);
  assert.equal(clockTickPlan(99), null);
  assert.equal(clockTickPlan(11), null);
  assert.equal(clockTickPlan(NaN), null);
  const ladder = [];
  for (let seconds = 10; seconds >= 1; seconds -= 1) ladder.push(clockTickPlan(seconds));
  for (const tick of ladder) {
    assert.equal(tick.kind, "tick");
    assert.equal(tick.wave, "triangle");
    assert.ok(tick.hz >= 880 && tick.hz <= 1520, `tick pitch in range: ${tick.hz}`);
  }
  for (let index = 1; index < ladder.length; index += 1) {
    assert.ok(ladder[index].hz > ladder[index - 1].hz, `pitch rises ${ladder[index - 1].hz} -> ${ladder[index].hz}`);
  }
  // Under :05 the tick is brighter and shorter (the "critical" HUD state).
  assert.equal(ladder[5].hz, 1320);
  assert.ok(ladder[5].seconds < ladder[4].seconds);
  assert.equal(ladder[0].hz, 880);
  const buzzer = clockTickPlan(0);
  assert.equal(buzzer.kind, "buzzer");
  assert.equal(buzzer.wave, "square");
  assert.ok(buzzer.seconds >= 0.5, "the buzzer is a held horn, not a blip");
  assert.ok(buzzer.hz < 400, "the buzzer sits under the tick ladder");
  // Fractional readings round the way the HUD digits do (Math.ceil).
  assert.equal(clockTickPlan(4.2).hz, clockTickPlan(5).hz);
});

test("the take bag never repeats a variant back to back, across bag borders included", () => {
  let seed = 1234567;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const size of [2, 3, 4, 5]) {
    const bags = new Map();
    const draws = Array.from({ length: 200 }, () => drawFromBag(bags, "ko", size, random));
    for (let index = 1; index < draws.length; index += 1) {
      assert.notEqual(draws[index], draws[index - 1], `size ${size}: draw ${index} repeated ${draws[index]}`);
    }
    // Every take plays once per bag before any repeats.
    for (let start = 0; start + size <= draws.length; start += size) {
      assert.deepEqual([...new Set(draws.slice(start, start + size))].sort(), Array.from({ length: size }, (_, i) => i));
    }
  }
  const bags = new Map();
  assert.equal(drawFromBag(bags, "single", 1, random), 0);
  assert.equal(drawFromBag(bags, "single", 1, random), 0);
  // A bank that grows (takes finished loading) rebuilds the bag at the new size.
  drawFromBag(bags, "grow", 2, random);
  assert.equal(bags.get("grow").size, 2);
  drawFromBag(bags, "grow", 3, random);
  assert.equal(bags.get("grow").size, 3);
});

test("the dizzy ring is three climbing chirps whose variant moves the root", () => {
  const low = dizzyRingPlan(0);
  const high = dizzyRingPlan(0.99);
  assert.equal(low.length, 3);
  for (const plan of [low, high]) {
    assert.ok(plan[0].hz < plan[1].hz && plan[1].hz < plan[2].hz, "chirps climb");
    assert.ok(plan[0].delay === 0 && plan[1].delay > 0 && plan[2].delay > plan[1].delay, "chirps are spaced");
    for (const chirp of plan) assert.ok(chirp.vibratoRate > 0 && chirp.vibratoDepth > 0, "wobble LFO on every chirp");
  }
  assert.ok(high[0].hz > low[0].hz * 1.1, "the variant walks the root across a real band");
  assert.deepEqual(dizzyRingPlan("nope"), dizzyRingPlan(0));
});

test("game.js wiring: no knockout.mp3 on a decision or a dizzy, tick on the timer edge", () => {
  const finish = slice("function finishRound(winner, type = -1) {", "function performFinisher(");
  assert.match(finish, /roundEndCause\(\{ finisherType: type, timer: state\.timer, loserHealth: loser\.health \}\)/);
  // 5.3 SPECTACLE (music): the match-won test is now a `const` because the
  // round-end music stinger reads the same fact as the announcer plan. The
  // pin follows the value to its new site rather than the old inline literal
  // — what it protects is that the plan is still told whether this round
  // closed the match, which the second assertion below now carries.
  assert.match(finish, /const matchWon = state\.rounds\[winner\] >= roundsToWinValue\(\);/);
  assert.match(finish, /roundEndAnnouncerPlan\(\{ cause, matchWon, fighterId: winDef\.id \}\)/);
  assert.match(finish, /announce\(`\$\{winDef\.name\} WINS`, roundEndBannerSub\(cause\), 2\.4, \{ speak \}\)/);
  assert.match(finish, /if \(cause !== ROUND_END_CAUSES\.decision\) sound\("ko", loser\);/);
  assert.doesNotMatch(finish, /"KNOCKOUT"/, "the banner sub is derived, never hard-coded KNOCKOUT");

  const dizzy = slice("function enterDizzy(fighter, attacker) {", "function relieveDizzy(");
  assert.doesNotMatch(dizzy, /sound\("ko"/, "a dizzy must not play the KO sample");
  assert.match(dizzy, /dizzyRingAudio\(fighter\);/);
  assert.match(dizzy, /fighterReactiveCue\(fighter, "dizzy"\);/, "the dazed voice bark stays");

  // The time-over story callout is gone (the decision plan opens on timeover).
  const story = slice("function queueStoryCallouts(winner, type) {", "// --- Wave 9: online-moments hooks");
  assert.doesNotMatch(story, /announcerSay\("timeover"/);
  assert.match(story, /announcerSay\("perfect"/);

  // Ticks are booked on the exact timer edge that pulses the red digits.
  const hud = slice("function updateHud() {", "const battle = state.teamBattle;");
  assert.match(hud, /hudFxDebug\.timerPulses \+= 1;\s*\n[\s\S]*?hudFxDebug\.timerTicks \+= 1;\s*\n\s*clockTickAudio\(state\.timer\);\s*\n\s*clockCallout\(\);/);
  assert.match(gameSource, /timerTicks: hudFxDebug\.timerTicks,/, "QA snapshot exposes timerTicks");
  assert.match(gameSource, /clockCallouts: voiceFxDebug\.clockCallouts,/);
  assert.match(gameSource, /decisionCalls: voiceFxDebug\.decisionCalls,/);

  // The once-per-round TEN SECONDS call is keyed like the voice round tracker.
  const callout = slice("function clockCallout() {", "// Pre-impact whoosh");
  assert.match(callout, /Math\.ceil\(state\.timer\) !== CLOCK_CALLOUT_SECONDS/);
  assert.match(callout, /`\$\{state\.matchSerial\}:\$\{state\.round\}`/);
  assert.match(callout, /announcerSay\("tenseconds"\)/);

  // Synth only: the tick and ring never touch a reviewed take.
  const synths = slice("function dizzyRingAudio(fighter) {", "// Pre-impact whoosh");
  assert.doesNotMatch(synths, /\.mp3|sfxPools|fighterVoiceTake|sound\(/);
  assert.match(synths, /impactAudioAllowed\(\)/);
});

// v5.3 VERIFICATION HARNESS (sweep #53). The whole clock ladder above — the
// :10 call, the tick per displayed second, the time-over decision — was
// unreachable from a probe: a round starts at 99 seconds and nothing waits 89
// of them. qa.setTimer() puts the clock on the edge so the browser smoke's
// `announcer-decision` probe can walk it, and it is guarded so nothing a
// player can reach ever has its clock written.
test("qa.setTimer forces the round clock, and only inside a QA fight", () => {
  const setTimer = slice("    setTimer(seconds = 10) {", "    loseBout() {");
  assert.match(setTimer, /if \(state\.screen !== "fight"\) throw new Error\("Start a fight first"\);/);
  assert.match(
    setTimer,
    /if \(!state\.qaManualMode\) throw new Error\("setTimer is QA-fight only"\);/,
    "state.qaManualMode is set by qa.fight()/qa.training() and cleared by every real match start",
  );
  // Whole seconds with the carry cleared: the same shape the sim writes, so
  // the very next tick books an honest edge.
  assert.match(setTimer, /state\.timer = clamp\(Math\.floor\(seconds\), 0, 99\);/);
  assert.match(setTimer, /state\.timerCarry = 0;/);
  // updateHud() is what books the pulse, the tick and the callout — setTimer
  // must go through it rather than announcing anything itself.
  assert.match(setTimer, /updateHud\(\);/);
  assert.doesNotMatch(setTimer, /announcerSay|clockCallout|clockTickAudio/);
  // The real match starts clear the flag, which is what makes the guard real.
  for (const marker of ["  state.qaManualMode = false;"]) {
    assert.ok(gameSource.includes(marker), "a played match must not be a QA fight");
  }
});
// v5.3 SPECTACLE (sweep item #52) — the rest of announcerSpeakBanner's ladder.
// w51 moved the round-END call into the engine and left the banner -> cue map
// inline in game.js, where nothing tested it: the two facts below were only
// ever asserted by the fact that the characters were still there.
test("the banner -> cue map speaks the right bank, and knows what it does not know", () => {
  const plan = (text, lookup) => bannerAnnouncerPlan(text, lookup).plan;
  // The one-cue banners.
  assert.deepEqual(plan("FIGHT!"), [{ cue: "fight", delay: 0 }]);
  assert.deepEqual(plan("FINISH THEM"), [{ cue: "finishthem", delay: 0 }]);
  assert.deepEqual(plan("GUARD CRUSH"), [{ cue: "guardcrush", delay: 0 }]);
  assert.deepEqual(plan("FINAL BLOW"), [{ cue: "ko", delay: 0 }]);
  // FIGHT! is the one that also releases the fighter voice budget — the
  // sheets had the intro to themselves until then.
  assert.equal(bannerAnnouncerPlan("FIGHT!").warmFighterVoices, true);
  for (const text of ["FINISH THEM", "GUARD CRUSH", "FINAL BLOW", "ROUND 1", "JEZ WINS", ""]) {
    assert.equal(bannerAnnouncerPlan(text).warmFighterVoices, false, text);
  }
  // ROUND n, online or off. Round 3 and beyond is the FINAL ROUND bank —
  // there is no "round3" cue, so a naive `round${n}` would speak nothing.
  assert.deepEqual(plan("ROUND 1"), [{ cue: "round1", delay: 0 }]);
  assert.deepEqual(plan("ONLINE ROUND 2"), [{ cue: "round2", delay: 0 }]);
  assert.deepEqual(plan("ROUND 3"), [{ cue: "finalround", delay: 0 }]);
  assert.deepEqual(plan("ONLINE ROUND 9"), [{ cue: "finalround", delay: 0 }]);
  assert.equal(roundBannerCue(1), "round1");
  assert.equal(roundBannerCue(2), "round2");
  assert.equal(roundBannerCue(5), "finalround");
  // A ROUND banner with anything else around it is not a round banner.
  assert.deepEqual(plan("ROUND 1 OF 3"), []);
  assert.deepEqual(plan("BONUS ROUND 1"), []);
  // The text-only " WINS" fallback books the fighter's NAME bank, never
  // "-wins": without the round/match facts it cannot honestly claim he won
  // the match, so it says the KO and then his name.
  const lookup = { fighterIdForName: (name) => (name === "BENNY" ? "benny" : "") };
  assert.deepEqual(plan("BENNY WINS", lookup), [
    { cue: "ko", delay: 0 },
    { cue: "benny-name", delay: FIGHTER_CALL_DELAY_MS },
  ]);
  // An unknown name still calls the KO — it is the half it can be sure of.
  assert.deepEqual(plan("NOBODY WINS", lookup), [{ cue: "ko", delay: 0 }]);
  assert.deepEqual(plan(" WINS", lookup), [{ cue: "ko", delay: 0 }]);
  assert.deepEqual(plan("WINS", lookup), [], "the suffix is \" WINS\", so a bare WINS is not a win banner");
  // Every other banner (titles, toasts, mode headers) books nothing.
  for (const text of ["SPECTATING", "REPLAY", "SET POINT", "CHAMPION", "", null, undefined, 7]) {
    assert.deepEqual(bannerAnnouncerPlan(text), { plan: [], warmFighterVoices: false });
  }
  // Every cue the map can produce must be a bank game.js actually has lines
  // for, or the banner speaks nothing and the caption is blank.
  const lines = slice("const ANNOUNCER_LINES = (() => {", "const announcerBankCache");
  for (const cue of [...Object.values(BANNER_CUES), "round1", "round2", "finalround", "timeover"]) {
    assert.ok(new RegExp(`\\b${cue}: \\[`).test(lines), `ANNOUNCER_LINES must carry ${cue}`);
  }
});

test("game.js speaks the plan and keeps only the side effects", () => {
  const banner = slice("function announcerSpeakBanner(text, plan = null) {", "// --- Wave 9: reactive fighter cues");
  // The explicit plan (finishRound's) still wins over the text map.
  assert.match(banner, /if \(Array\.isArray\(plan\)\) \{/);
  assert.match(banner, /if \(plan\[0\]\?\.cue === "timeover"\) voiceFxDebug\.decisionCalls \+= 1;/);
  // ...and the text map is the engine's, driven by the roster lookup.
  assert.match(banner, /bannerAnnouncerPlan\(text, \{\s*\n\s*fighterIdForName: \(name\) => roster\.find\(\(entry\) => entry\.name === name\)\?\.id \|\| "",\s*\n\s*\}\);/);
  assert.match(banner, /for \(const \{ cue, delay = 0 \} of banner\.plan\) announcerSay\(cue, \{ delay \}\);/);
  assert.match(banner, /if \(banner\.warmFighterVoices\) topUpFighterAudio\(\);/);
  // No copy of the ladder left behind.
  assert.doesNotMatch(banner, /text === "FINISH THEM"/);
  assert.doesNotMatch(banner, /round === 1 \? "round1"/);
});
