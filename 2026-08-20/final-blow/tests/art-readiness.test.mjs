// v5.1 #35 — the first fight on a phone: request order, readiness and the
// capped intro hold. The decisions live in engine/art-readiness.mjs so they
// can be pinned here without a DOM; the wiring into game.js is pinned by
// source below (the hold must be armed before the FIGHT! timer, the select
// screens must warm the matchup, the loop must freeze the clock).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  INTRO_ART_HOLD_MS,
  PRELOAD_PLAN,
  READINESS_BANKS,
  classifySheet,
  holdDecision,
  matchupPreloadIds,
  readinessSummary,
  shiftedAnnouncementDelay,
  unifiedFamilyFor,
} from "../engine/art-readiness.mjs";
import { SWING_BANK_LIST, bankPreloadPlan, swingSheetPath } from "../engine/banks.mjs";

const gameRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("preload plan: the unified family goes first, at high priority, the bonus banks last and low", () => {
  const banks = PRELOAD_PLAN.map((entry) => entry.bank);
  assert.deepEqual(banks.slice(0, 6), ["unified", "ext", "ext2", "ext3", "ext4", "ext5"]);
  assert.deepEqual(READINESS_BANKS, ["unified", "ext", "ext2", "ext3", "ext4", "ext5"]);
  assert.ok(banks.indexOf("motion") > banks.indexOf("ext5"), "motion banks follow the family");
  assert.ok(banks.indexOf("motion3") > banks.indexOf("motion2"));
  assert.ok(banks.indexOf("walk") > banks.indexOf("motion2"));
  const priority = Object.fromEntries(PRELOAD_PLAN.map((entry) => [entry.bank, entry.priority]));
  // The three sheets the fight opens on (idle/walk, the six-key walk, the
  // first jab) are the ones the browser must schedule ahead of the plates.
  assert.deepEqual([priority.unified, priority.ext, priority.ext2], ["high", "high", "high"]);
  assert.deepEqual([priority.motion3, priority.walk], ["low", "low"]);
  assert.ok(Object.isFrozen(PRELOAD_PLAN) && PRELOAD_PLAN.every(Object.isFrozen));
});

test("unifiedFamilyFor: the family follows the manifest gates, in plan order", () => {
  assert.deepEqual(unifiedFamilyFor(null), []);
  assert.deepEqual(unifiedFamilyFor({ whole: false }), []);
  // A 4.0 holdout: main sheet only.
  assert.deepEqual(unifiedFamilyFor({ whole: true }), ["unified"]);
  // A full 5.0 fighter, gates handed in any order.
  assert.deepEqual(
    unifiedFamilyFor({ ext4: true, ext2: true, whole: true, ext3: true, ext: true }),
    ["unified", "ext", "ext2", "ext3", "ext4"],
  );
  // ext missing but ext2+ present (deathblow/devil/donald/post shipped this
  // way until 5.2; still what a fighter whose ext sheet failed to decode is).
  assert.deepEqual(unifiedFamilyFor({ whole: true, ext: false, ext2: true, ext3: true, ext4: true }), ["unified", "ext2", "ext3", "ext4"]);
  // v5.2: the locomotion sheet is part of the family the intro waits for.
  assert.deepEqual(unifiedFamilyFor({ whole: true, ext: true, ext2: true, ext3: true, ext4: true, ext5: true }), ["unified", "ext", "ext2", "ext3", "ext4", "ext5"]);
  assert.deepEqual(unifiedFamilyFor({ whole: true, ext5: true }), ["unified", "ext5"]);
});

test("classifySheet: drawable wins, a failed decode is settled, everything else is pending", () => {
  assert.equal(classifySheet({ drawable: true, decodeState: "failed" }), "ready");
  assert.equal(classifySheet({ drawable: false, decodeState: "failed" }), "failed");
  assert.equal(classifySheet({ drawable: false, decodeState: "pending" }), "pending");
  assert.equal(classifySheet({ drawable: false, decodeState: "" }), "pending");
  assert.equal(classifySheet(), "pending");
});

test("readinessSummary: pending and failed are listed by name; failed never blocks", () => {
  const summary = readinessSummary([
    { name: "jez:unified", drawable: true },
    { name: "jez:ext", drawable: false, decodeState: "pending" },
    { name: "jez:ext2", drawable: false, decodeState: "failed" },
  ]);
  assert.deepEqual(summary, { ready: false, pending: ["jez:ext"], failed: ["jez:ext2"] });
  assert.deepEqual(readinessSummary([{ name: "a", drawable: false, decodeState: "failed" }]), { ready: true, pending: [], failed: ["a"] });
  assert.deepEqual(readinessSummary([]), { ready: true, pending: [], failed: [] });
});

test("holdDecision: holds while pending inside the cap, releases on ready, cap, or leaving the intro", () => {
  assert.equal(INTRO_ART_HOLD_MS, 1500);
  const base = { startedAt: 1000, capMs: 1500, pendingCount: 3, inIntro: true };
  assert.deepEqual(holdDecision({ ...base, now: 1000 }), { hold: true, reason: "holding", elapsed: 0 });
  assert.deepEqual(holdDecision({ ...base, now: 2499 }), { hold: true, reason: "holding", elapsed: 1499 });
  assert.deepEqual(holdDecision({ ...base, now: 2500 }), { hold: false, reason: "capped", elapsed: 1500 });
  assert.deepEqual(holdDecision({ ...base, now: 1300, pendingCount: 0 }), { hold: false, reason: "ready", elapsed: 300 });
  // A skipped intro, a pause, a screen change: the hold cannot outlive the intro.
  assert.deepEqual(holdDecision({ ...base, now: 1300, inIntro: false }), { hold: false, reason: "left", elapsed: 300 });
  // A clock that went backwards never yields a negative elapsed.
  assert.equal(holdDecision({ ...base, now: 900 }).elapsed, 0);
});

test("shiftedAnnouncementDelay: the FIGHT! call moves by exactly the held time, never negative", () => {
  const plan = { armedAt: 10_000, delay: 1150 };
  // Released before the timer fired: the remaining delay plus the hold.
  assert.equal(shiftedAnnouncementDelay(plan, 400, 10_300), 1150 - 300 + 400);
  // The timer fired during the hold (deferred): what is left of the shifted moment.
  assert.equal(shiftedAnnouncementDelay(plan, 1500, 11_500), 10_000 + 1150 + 1500 - 11_500);
  // A hold of zero is the plain remaining delay; an over-long wait clamps to 0.
  assert.equal(shiftedAnnouncementDelay(plan, 0, 10_500), 650);
  assert.equal(shiftedAnnouncementDelay(plan, 100, 20_000), 0);
  assert.equal(shiftedAnnouncementDelay(plan, -50, 10_000), 1150);
  assert.equal(shiftedAnnouncementDelay(undefined, 0, 0), 0);
});

test("matchupPreloadIds: both seats, boss substitution, Block War rosters, de-duplicated", () => {
  const roster = [{ id: "deathblow" }, { id: "jez" }, { id: "alan" }, { id: "post" }];
  assert.deepEqual(matchupPreloadIds({ picks: [0, 1], roster }), ["deathblow", "jez"]);
  // A mirror match warms one fighter once.
  assert.deepEqual(matchupPreloadIds({ picks: [2, 2], roster }), ["alan"]);
  // The arcade ladder at the FINAL BOUT: seat 1 is the boss def, not the pick.
  assert.deepEqual(matchupPreloadIds({ picks: [0, 3], roster, bossId: "commissioner", bossActive: true }), ["deathblow", "commissioner"]);
  assert.deepEqual(matchupPreloadIds({ picks: [0, 3], roster, bossId: "commissioner", bossActive: false }), ["deathblow", "post"]);
  // Block War: every picked teammate, then the seats, with no repeats.
  assert.deepEqual(
    matchupPreloadIds({ picks: [1, 0], roster, teamPicks: [["jez", "alan"], ["post"]] }),
    ["jez", "alan", "post", "deathblow"],
  );
  assert.deepEqual(matchupPreloadIds({ picks: [9], roster }), []);
  assert.deepEqual(matchupPreloadIds(), []);
});

test("game.js wiring: family-first preload, select-screen warm, the hold and the frozen clock", async () => {
  const [game, index, css] = await Promise.all([
    readFile(join(gameRoot, "game.js"), "utf8"),
    readFile(join(gameRoot, "index.html"), "utf8"),
    readFile(join(gameRoot, "styles.css"), "utf8"),
  ]);
  // Every authored sheet is built by the one constructor that sets the
  // priority hint BEFORE src — a bare `new Image()` + `assets/<bank>/` src
  // would bypass both the hint and the decode bookkeeping.
  for (const bank of ["motion", "motion2", "motion3", "walk", "unified", "ext", "ext2"]) {
    assert.ok(game.includes(`authoredSheetImage("${bank}", `), `${bank} sheet goes through authoredSheetImage`);
  }
  // v5.3 (sweep #52): the swing family's suffix and path are engine/banks.mjs.
  assert.ok(game.includes("authoredSheetImage(SWING_SUFFIX[bank], swingSheetPath(fighterId, bank))"),
    "ext3/ext4/ext5 sheets go through authoredSheetImage");
  for (const bank of SWING_BANK_LIST) {
    assert.match(swingSheetPath("jez", bank), /^assets\/unified\/jez-ext[345]\.webp$/);
  }
  assert.doesNotMatch(game, /new Image\(\);\n\s*atlas\.src = `assets\/(motion|motion2|motion3|walk|unified)\//);
  // The manifest is kicked at boot and the whole preload runs behind it, the
  // unified sheet requested before the motion banks.
  assert.match(game, /\nensureUnifiedManifest\(\);\n/);
  const preload = game.slice(game.indexOf("function preloadAuthoredBanks("), game.indexOf("const preloadedFighterIds"));
  assert.ok(preload.indexOf("ensureUnifiedAtlas(step.id)") < preload.indexOf("ensureMotionAtlas(step.id)"), "unified before motion");
  assert.ok(preload.indexOf("ensureMotionAtlas(step.id)") < preload.indexOf("ensureMotion3Atlas(step.id)"), "motion before the bonus banks");
  assert.ok(preload.includes("motion3BankState.masks?.[id]?.accept.some(Boolean)"), "motion3 request is manifest-gated");
  assert.ok(preload.includes("walkBankState.masks?.[id]"), "walk request is manifest-gated");
  // ...and the order itself is the plan's, not the shape of a loop: the whole
  // unified family for a fighter goes out before the per-beat motion banks.
  const plan = bankPreloadPlan(["jez"], {
    unifiedWhole: () => true, extWhole: () => true, ext2Whole: () => true, swingWhole: () => true,
  });
  assert.deepEqual(plan.unified.map((step) => step.key),
    ["jez:unified", "jez:ext", "jez:ext2", "jez:ext3", "jez:ext4", "jez:ext5"]);
  assert.deepEqual(plan.motion.map((step) => step.key), ["jez:motion", "jez:motion2"]);
  // The select screens warm the matchup; the stage screen warms voice too.
  assert.match(game, /selectBothLocked = bothLocked;[\s\S]{0,400}preloadSelectMatchup\(\{ immediate: bothLocked, voice: bothLocked \}\)/);
  assert.match(game, /function showStageSelect\(\) \{[\s\S]{0,400}preloadSelectMatchup\(\{ immediate: true, voice: true \}\)/);
  // startMatch arms the hold after the screen switch and BEFORE the FIGHT!
  // timer, so a release can shift the call.
  const startMatch = game.slice(game.indexOf("function startMatch("), game.indexOf("function startRound("));
  const armAt = startMatch.indexOf("armIntroArtHold(state.fighters.map(");
  assert.ok(armAt > startMatch.indexOf('showScreen("fight")'), "hold armed after the fight screen shows");
  assert.ok(armAt < startMatch.indexOf("scheduleFightAnnouncement("), "hold armed before the FIGHT! timer");
  // The hold is presentation only: offline modes, never online/demo/replay,
  // and the loop freezes the clock rather than the sim touching phaseTime.
  assert.ok(game.includes('state.mode !== "online" && state.mode !== "demo" && !replayPlayback.active'));
  assert.match(game, /const artHeld = updateIntroArtHold\(now\);[\s\S]{0,400}?simulationClock\.advance\(artHeld \? 0 : simSeconds, runSimulationStep\)/);
  assert.ok(game.includes("if (introArtHold.active) return;"), "a FIGHT! timer that fires mid-hold defers to the release");
  assert.ok(game.includes("shiftFightAnnouncement(introArtHold.heldMs, now)"));
  // QA surface.
  assert.ok(game.includes("artReadiness: artReadinessSnapshot(),"), "snapshot exposes readiness");
  assert.ok(game.includes("artReadiness(ids = null) {") && game.includes("artHold(enabled = true) {"));
  // The curtain exists and covers the round card.
  assert.ok(index.includes('id="artHold" class="art-hold"'));
  assert.match(css, /\.art-hold \{[\s\S]*?z-index: 12;/);
  assert.match(css, /\.art-hold\[hidden\] \{ display: none !important; \}/);
});
