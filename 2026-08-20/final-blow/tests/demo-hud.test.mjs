import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_CURSOR_IDLE_MS,
  DEMO_HUD_IDLE_MS,
  DEMO_RESUME_BEAT_MS,
  FINISH_THEM_PLAYER_SUBLINE,
  createDemoHold,
  demoBugText,
  demoHoldWanted,
  demoIdleState,
  demoLegendVisible,
  demoResultHoldRemaining,
  demoResultPrompt,
  demoSpeedTag,
  finishThemSubline,
  flowSkipHintVisible,
} from "../engine/demo-hud.mjs";
import { DEMO_RESULT_HOLD_MS } from "../engine/demo.mjs";

// 5.4 FIGHT NIGHT — the demo HUD item (sweep #10 / #28 / #31 / #32). The
// module is pure presentation logic; these pin its contract and, from source,
// the rule that every game.js call site is gated on the demo so a played
// match is byte-identical.

const gameRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// The broadcast bug
// ---------------------------------------------------------------------------

test("the bug names the matchup, the cycle and the stage, and words the prompt for the pointer", () => {
  const keyboard = demoBugText({ first: "Post", second: "Ali G", cycle: 3, stageName: "Janney Street" });
  assert.deepEqual(keyboard, {
    matchup: "POST VS ALI G",
    cycle: "CYCLE 3 · JANNEY STREET",
    prompt: "PRESS ANY BUTTON TO PLAY",
  });
  const touch = demoBugText({ first: "Post", second: "Ali G", cycle: 3, stageName: "Janney Street", coarsePointer: true });
  assert.equal(touch.prompt, "TAP TO PLAY", "a phone viewer has no button to press");
  assert.equal(touch.matchup, keyboard.matchup);
  assert.equal(demoBugText({ first: "a", second: "b" }).cycle, "CYCLE 1");
  assert.equal(demoBugText({ first: "a", second: "b", cycle: 0 }).cycle, "CYCLE 1", "cycles are 1-based");
});

test("the result countdown follows the pointer and says so while held", () => {
  // 5.4 versus card (sweep #8/#20): the result hold is 2.4 s now — the other
  // 2.6 s of the old 5 s hold moved onto the fight screen as the versus card
  // (tests/demo-versus.test.mjs pins the budget), so the prompt reads 2.
  assert.equal(demoResultPrompt({ holdMs: DEMO_RESULT_HOLD_MS }), "NEXT RANDOM FIGHT IN 2 SECONDS · PRESS ANY BUTTON TO PLAY");
  assert.equal(demoResultPrompt({ holdMs: DEMO_RESULT_HOLD_MS, coarsePointer: true }), "NEXT RANDOM FIGHT IN 2 SECONDS · TAP TO PLAY");
  assert.equal(demoResultPrompt({ holdMs: 5000 }), "NEXT RANDOM FIGHT IN 5 SECONDS · PRESS ANY BUTTON TO PLAY");
  assert.equal(demoResultPrompt({ holdMs: 1000 }), "NEXT RANDOM FIGHT IN 1 SECOND · PRESS ANY BUTTON TO PLAY");
  assert.equal(demoResultPrompt({ held: true }), "NEXT FIGHT WAITS FOR THE SCREEN");
});

test("the rate tag replaces the canvas chip and never lies about a hold", () => {
  assert.deepEqual(demoSpeedTag({ rate: 0.75 }), { text: "0.75×", tone: "slow" });
  assert.deepEqual(demoSpeedTag({ rate: 1 }), { text: "1×", tone: "live" });
  assert.deepEqual(demoSpeedTag({ rate: 0.25, paused: true }), { text: "PAUSED", tone: "paused" });
  assert.deepEqual(demoSpeedTag({ rate: 0.25, paused: false, held: true }), { text: "HELD", tone: "held" });
  assert.deepEqual(demoSpeedTag({ rate: "nope" }), { text: "1×", tone: "slow" });
});

// ---------------------------------------------------------------------------
// The three prompts that were wrong for a spectator
// ---------------------------------------------------------------------------

test("the operator legend is hidden by default, revealed by a key, and never on a coarse pointer", () => {
  assert.equal(demoLegendVisible({ scoped: true, hintUntilMs: 0, nowMs: 100 }), false, "hidden by default");
  assert.equal(demoLegendVisible({ scoped: true, hintUntilMs: 9100, nowMs: 100 }), true, "a transport key arms it");
  assert.equal(demoLegendVisible({ scoped: true, hintUntilMs: 9100, nowMs: 9100 }), false, "and it times out");
  assert.equal(demoLegendVisible({ scoped: true, hintUntilMs: 9100, nowMs: 100, coarsePointer: true }), false,
    "keyboard advice is never painted for a touch viewer");
  assert.equal(demoLegendVisible({ scoped: false, hintUntilMs: 9100, nowMs: 100 }), false, "out of scope is out");
});

test("the skip hint keeps its intro/roundover rule outside the demo and is gated inside it", () => {
  assert.equal(flowSkipHintVisible({ screen: "fight", phase: "intro" }), true);
  assert.equal(flowSkipHintVisible({ screen: "fight", phase: "roundover" }), true);
  assert.equal(flowSkipHintVisible({ screen: "fight", phase: "fight" }), false);
  assert.equal(flowSkipHintVisible({ screen: "result", phase: "intro" }), false);
  assert.equal(flowSkipHintVisible({ screen: "fight", phase: "intro", demoActive: true }), false,
    "any input exits a demo, so SKIP would be an instruction to kill it");
  assert.equal(flowSkipHintVisible({ screen: "fight", phase: "roundover", demoActive: true }), false);
});

test("FINISH THEM keeps the player's exact sub-line and names the mover in a demo", () => {
  assert.equal(finishThemSubline({ demo: false, winnerName: "Post" }), FINISH_THEM_PLAYER_SUBLINE);
  assert.equal(FINISH_THEM_PLAYER_SUBLINE, "LP = A  ·  LK = B  ·  ANY DISTANCE", "the 5.3 string, byte for byte");
  assert.equal(finishThemSubline({ demo: true, winnerName: "Post" }), "POST MOVES IN FOR THE FINAL BLOW");
  assert.equal(finishThemSubline({ demo: true }), "THE FINAL BLOW IS COMING");
});

// ---------------------------------------------------------------------------
// Screensaver hygiene
// ---------------------------------------------------------------------------

test("the idle clocks: pointer hides at 3 s, the bug tucks at 12 s, and a new exhibition wakes the bug", () => {
  assert.equal(DEMO_CURSOR_IDLE_MS, 3000);
  assert.equal(DEMO_HUD_IDLE_MS, 12_000);
  assert.deepEqual(demoIdleState({ now: 1000, lastInputAt: 0, matchStartedAt: 0 }), { cursorIdle: false, hudIdle: false });
  assert.deepEqual(demoIdleState({ now: 3000, lastInputAt: 0, matchStartedAt: 0 }), { cursorIdle: true, hudIdle: false });
  assert.deepEqual(demoIdleState({ now: 12_000, lastInputAt: 0, matchStartedAt: 0 }), { cursorIdle: true, hudIdle: true });
  // A new exhibition brings the bug back (but not the pointer: nobody moved).
  assert.deepEqual(demoIdleState({ now: 20_000, lastInputAt: 0, matchStartedAt: 15_000 }), { cursorIdle: true, hudIdle: false });
  assert.deepEqual(demoIdleState({ now: 27_000, lastInputAt: 0, matchStartedAt: 15_000 }), { cursorIdle: true, hudIdle: true });
  // Real input wakes both.
  assert.deepEqual(demoIdleState({ now: 27_000, lastInputAt: 26_000, matchStartedAt: 15_000 }), { cursorIdle: false, hudIdle: false });
});

// ---------------------------------------------------------------------------
// The hidden-tab hold
// ---------------------------------------------------------------------------

test("the hold wants a hidden tab or a portrait phone and nothing else", () => {
  assert.equal(demoHoldWanted({}), false);
  assert.equal(demoHoldWanted({ hidden: true }), true);
  assert.equal(demoHoldWanted({ orientationBlocked: true }), true);
  assert.equal(demoHoldWanted({ hidden: false, orientationBlocked: false }), false);
});

test("the result hold remembers exactly what was left", () => {
  assert.equal(demoResultHoldRemaining({ armedAt: 1000, holdMs: 5000, now: 3200 }), 2800);
  assert.equal(demoResultHoldRemaining({ armedAt: 1000, holdMs: 5000, now: 9000 }), 0, "never negative");
});

test("hold → release → settle hands back the whole span after a one-second RESUMING beat", () => {
  const hold = createDemoHold();
  assert.equal(hold.frozen(), false);
  assert.equal(hold.settle(0), null, "nothing to settle while live");
  assert.equal(hold.hold(1000), true);
  assert.equal(hold.hold(1500), false, "holding twice is one hold");
  assert.equal(hold.frozen(), true);
  assert.equal(hold.phase, "held");
  assert.equal(hold.settle(2000), null, "a hidden tab never settles on its own");
  assert.equal(hold.release(7000), true);
  assert.equal(hold.phase, "resuming");
  assert.equal(hold.frozen(), true, "the beat is still frozen: the viewer sees a RESUMING frame first");
  assert.equal(hold.settle(7000 + DEMO_RESUME_BEAT_MS - 1), null);
  const settled = hold.settle(7000 + DEMO_RESUME_BEAT_MS);
  assert.deepEqual(settled, { heldMs: 6000 + DEMO_RESUME_BEAT_MS }, "the plans owe the hold AND the beat");
  assert.equal(hold.frozen(), false);
  assert.deepEqual(hold.snapshot(), { phase: "live", holds: 1, heldMs: 7000 });
  assert.equal(DEMO_RESUME_BEAT_MS, 1000);
});

test("a hide during the RESUMING beat keeps the original start, and release without a hold is a no-op", () => {
  const hold = createDemoHold({ beatMs: 500 });
  assert.equal(hold.release(10), false);
  hold.hold(1000);
  hold.release(2000);
  assert.equal(hold.hold(2200), true, "re-hidden mid-beat");
  assert.equal(hold.since, 1000, "no frame was seen since the first hide");
  hold.release(5000);
  assert.deepEqual(hold.settle(5500), { heldMs: 4500 });
  hold.hold(6000);
  hold.reset();
  assert.equal(hold.frozen(), false);
  // Three hold() calls took: the first hide, the mid-beat re-hide, the last.
  assert.equal(hold.snapshot().holds, 3);
});

test("a settled hold shifts a fight announcement by exactly the time held", () => {
  // The composition rule game.js uses: fold the held span into the plan's
  // armedAt, then re-arm from armedAt + delay. Two holds compose.
  const plan = { armedAt: 100, delay: 1200 };
  const hold = createDemoHold({ beatMs: 0 });
  hold.hold(400);
  hold.release(2400);
  plan.armedAt += hold.settle(2400).heldMs;
  assert.equal(Math.max(0, plan.armedAt + plan.delay - 2400), 900, "900 ms were still owed before the hide, 900 are owed after");
  hold.hold(2500);
  hold.release(9000);
  plan.armedAt += hold.settle(9000).heldMs;
  assert.equal(Math.max(0, plan.armedAt + plan.delay - 9000), 800);
});

// ---------------------------------------------------------------------------
// The played match is byte-identical: every call site is demo-gated
// ---------------------------------------------------------------------------

test("game.js gates every demo-hud call site on the demo session", async () => {
  const game = await readFile(join(gameRoot, "game.js"), "utf8");
  // The render loop only hands the clock zero seconds through settleDemoHold,
  // which refuses to do anything unless a demo is running.
  assert.match(game, /function settleDemoHold\(now\)\s*\{\s*if \(!demoSession\.active \|\| !demoHold\.frozen\(\)\) return false;/);
  assert.match(game, /simulationClock\.advance\(artHeld \|\| demoHeld \? 0 : simSeconds, runSimulationStep\)/);
  // The hold itself resets and returns when no demo is active.
  assert.match(game, /function syncDemoHold\(now = performance\.now\(\)\)\s*\{\s*if \(!demoSession\.active\)\s*\{\s*demoHold\.reset\(\);\s*return;/);
  // FINISH THEM asks for the demo string only under state.mode === "demo".
  assert.match(game, /finishThemSubline\(\{ demo: state\.mode === "demo", winnerName: attacker\.def\.name \}\)/);
  // The skip hint passes the session flag through.
  assert.match(game, /flowSkipHintVisible\(\{ screen: state\.screen, phase: state\.phase, demoActive: demoSession\.active \}\)/);
  // The canvas speed chip is untouched outside the demo (training keeps it).
  assert.match(game, /if \(state\.mode !== "demo"\) \{\s*const rateLabel = demoSpeed\.paused \? "PAUSED" : `\$\{demoSpeed\.rate\}x`;/);
  // Presence and the ticker are written from demo-only paths.
  assert.match(game, /if \(demoSession\.active\) noteDemoPresence\(\);/);
  const startNext = game.slice(game.indexOf("function startNextDemoMatch()"), game.indexOf("function startDemo("));
  assert.ok(startNext.includes('$("#stageTicker").textContent = stages[state.stage].ticker;'),
    "the ticker refresh lives inside startNextDemoMatch, not startMatch");
  // The legend is no longer armed on demo start.
  const startDemo = game.slice(game.indexOf("function startDemo("), game.indexOf("function scheduleNextDemoMatch()"));
  assert.ok(startDemo.includes("demoSpeed.hintUntilMs = 0;"), "hidden by default");
  assert.ok(!startDemo.includes("performance.now() + DEMO_SPEED_HINT_MS"), "startDemo must not arm the legend");
});

test("index.html keeps the smoke selectors and the bug carries the show name, the rate tag and the prompt", async () => {
  const html = await readFile(join(gameRoot, "index.html"), "utf8");
  assert.match(html, /<div id="demoHud" class="demo-hud" aria-live="polite" hidden>/);
  assert.match(html, /<b>WATCH DEMO · CPU VS CPU<\/b>/);
  assert.match(html, /<i id="demoHudSpeed" class="demo-hud-speed"/);
  assert.match(html, /<span id="demoHudMatchup">/);
  assert.match(html, /<em id="demoHudCycle">/);
  assert.match(html, /<small>PRESS ANY BUTTON TO PLAY<\/small>/);
  const css = await readFile(join(gameRoot, "styles.css"), "utf8");
  assert.match(css, /body\.demo-active\.demo-cursor-idle \*\s*\{\s*cursor: none !important;/);
  assert.match(css, /body\.demo-active\.demo-idle \.demo-hud \{ opacity: \.45;/);
  assert.match(css, /@keyframes demo-bug-drift/);
  // The phone media query must not hide the prompt any more (#28).
  const phoneQuery = css.slice(css.indexOf("@media (pointer: coarse), (max-width: 760px) {"));
  assert.ok(!phoneQuery.slice(0, phoneQuery.indexOf("}\n\n")).includes(".demo-hud small { display: none; }"),
    "the exit prompt must survive on a phone");
});
