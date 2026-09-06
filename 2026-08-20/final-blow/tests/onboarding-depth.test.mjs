// 5.3 (sweep #30 / #31) — ONBOARDING DEPTH.
//
// Four things are pinned here, in the order a new player meets them:
//   1. the title's three tiers, and that grouping them moved no button id;
//   2. the last-fight digest — one cause per landed hit, tolerant load;
//   3. the lesson graph — the same digest always names the same lesson;
//   4. the command copy audit — nothing names a button outside the table.
//
// The digest and the graph are pure data, so they are asserted directly. The
// call sites that FEED them live in game.js and index.html and are asserted
// from source, because the wiring is the part that silently rots.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CONTROL_STYLE_COMMANDS,
  commandLabel,
  styleCopy,
} from "../engine/controls.mjs";
import {
  DAMAGE_CAUSES,
  DAMAGE_CAUSE_LABELS,
  classifyDamageCause,
  createFightDigest,
  fightRecapLine,
  normalizeFightDigest,
  noteFightDamage,
  topDamageCause,
} from "../engine/progression.mjs";
import {
  FIGHT_SCHOOL_LESSONS,
  FIGHT_SCHOOL_RECOMMENDATIONS,
  normalizeSchoolSignals,
  recommendLesson,
} from "../engine/training.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const gameSource = readFileSync(`${root}game.js`, "utf8");
const htmlSource = readFileSync(`${root}index.html`, "utf8");
const cssSource = readFileSync(`${root}styles.css`, "utf8");

const titleSection = htmlSource.slice(
  htmlSource.indexOf('<section id="titleScreen"'),
  htmlSource.indexOf('<section id="onlineScreen"'),
);

// --- 1. the title tiers ----------------------------------------------------

test("the title menu is three labelled tiers and keeps every button id", () => {
  const labels = [...titleSection.matchAll(/<p class="tier-label">([^<]+)<\/p>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["PLAY", "LEARN", "MORE"]);
  // Every id and data-mode that existed at 5.2 must still resolve — the smoke
  // suite clicks [data-mode="arcade"/"versus"/"training"] and measures
  // #demoButton / #controlsButton, so a rename here is a silent smoke break.
  const ids = [...titleSection.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const id of [
    "dailyButton", "blackBookButton", "recordsButton", "onlineButton",
    "fightSchoolButton", "comboTrialsButton", "phillyOpenButton",
    "demoButton", "replayTheaterButton", "controlsButton", "titleNewcomerButton",
  ]) assert.ok(ids.includes(id), `title lost #${id}`);
  const modes = [...titleSection.matchAll(/data-mode="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(modes.sort(), ["arcade", "survival", "team", "training", "versus"]);
  // The tiers are visual weight, not visibility: nothing in the stack may be
  // hidden by default or the pad walk and the mobile bounds probes lose it.
  const tierBlock = titleSection.slice(titleSection.indexOf('class="menu-stack title-tiers"'));
  const hiddenButtons = [...tierBlock.matchAll(/<button[^>]*>/g)].filter((m) => / hidden/.test(m[0]));
  assert.equal(hiddenButtons.length, 1, "only the coach card starts hidden");
  assert.match(hiddenButtons[0][0], /id="titleCoach"/);
  // PLAY is the loudest, MORE the quietest — the weight has to actually fall.
  assert.match(cssSource, /\.title-screen \.tier-play \.arcade-button \{ min-height: 38px/);
  assert.match(cssSource, /\.title-screen \.tier-more \.arcade-button \{ min-height: 26px/);
});

test("both coach cards and the recap line exist and route to the school", () => {
  for (const id of ["titleCoach", "resultCoach", "resultRecap"]) {
    assert.ok(htmlSource.includes(`id="${id}"`), `missing #${id}`);
  }
  assert.match(gameSource, /\$\("#titleCoach"\)\?\.addEventListener\("click", \(\) => startRecommendedLesson\("#titleCoach"\)\)/);
  assert.match(gameSource, /\$\("#resultCoach"\)\?\.addEventListener\("click", \(\) => startRecommendedLesson\("#resultCoach"\)\)/);
  // The recap has to be rendered from showResult, after the digest is sealed.
  assert.ok(gameSource.indexOf("renderResultRecap();") > gameSource.indexOf("function showResult(winner)"));
  assert.match(gameSource, /function startFightSchool\(startAt = null\)/);
});

// --- 2. the digest ---------------------------------------------------------

test("a hit is classified by exactly one cause, in priority order", () => {
  // Blocked outranks everything: chip is chip whatever threw it.
  assert.equal(classifyDamageCause({ blocked: true, superMove: true, kind: "special" }), "chip");
  assert.equal(classifyDamageCause({ throwMove: true }), "throw");
  assert.equal(classifyDamageCause({ kind: "throw" }), "throw");
  // A stage weapon outranks the jawn machinery that carries it.
  assert.equal(classifyDamageCause({ weapon: true, throwable: true, kind: "special" }), "weapon");
  assert.equal(classifyDamageCause({ throwable: true, kind: "special" }), "jawn");
  assert.equal(classifyDamageCause({ superMove: true, kind: "special" }), "super");
  assert.equal(classifyDamageCause({ kind: "special" }), "special");
  assert.equal(classifyDamageCause({ kind: "heavy", level: "air" }), "jumpIn");
  assert.equal(classifyDamageCause({ kind: "heavy", level: "low" }), "low");
  assert.equal(classifyDamageCause({ kind: "light", level: "overhead" }), "overhead");
  assert.equal(classifyDamageCause({ kind: "heavy", level: "mid" }), "heavy");
  assert.equal(classifyDamageCause({}), "light");
  for (const cause of DAMAGE_CAUSES) assert.ok(DAMAGE_CAUSE_LABELS[cause], `no label for ${cause}`);
});

test("the digest loads tolerantly and folds one hit at a time", () => {
  const blank = createFightDigest();
  assert.equal(blank.hitsTaken, 0);
  assert.deepEqual(blank.damageBy, {});
  // Garbage in — a zeroed digest out, never a throw on the boot path.
  const junk = normalizeFightDigest({ hitsTaken: "many", damageBy: { nonsense: 9, throw: -4 }, mode: "hyperspace" });
  assert.equal(junk.hitsTaken, 0);
  assert.deepEqual(junk.damageBy, {});
  assert.equal(junk.mode, "versus");
  assert.equal(normalizeFightDigest(null).damageTaken, 0);
  assert.equal(normalizeFightDigest("nope").blocks, 0);

  const digest = createFightDigest();
  noteFightDamage(digest, "throw", 14);
  noteFightDamage(digest, "throw", 14);
  noteFightDamage(digest, "low", 9);
  noteFightDamage(digest, "chip", 0);
  noteFightDamage(digest, "not-a-cause", 100);
  assert.equal(digest.hitsTaken, 4, "the unknown cause is dropped, not counted");
  assert.deepEqual(digest.damageBy, { throw: 28, low: 9 });
  assert.deepEqual(digest.hitsBy, { throw: 2, low: 1, chip: 1 });
});

test("the top cause is the biggest one, with a deterministic tie-break", () => {
  const digest = createFightDigest();
  noteFightDamage(digest, "throw", 20);
  noteFightDamage(digest, "heavy", 30);
  noteFightDamage(digest, "heavy", 10);
  digest.damageTaken = 60;
  const top = topDamageCause(digest);
  assert.equal(top.cause, "heavy");
  assert.equal(top.amount, 40);
  assert.equal(top.hits, 2);
  assert.ok(Math.abs(top.share - 40 / 60) < 1e-9);
  assert.equal(fightRecapLine(digest), "WHAT JUST HAPPENED · 67% OF THE 60 DAMAGE YOU TOOK CAME FROM HEAVY NORMALS · 2 OF THEM.");

  // Equal amounts break on DAMAGE_CAUSES order, so two loads always agree.
  const tie = createFightDigest();
  noteFightDamage(tie, "light", 12);
  noteFightDamage(tie, "throw", 12);
  assert.equal(topDamageCause(tie).cause, "throw");
  assert.equal(topDamageCause(createFightDigest()), null);

  const untouched = createFightDigest({ won: true, rounds: 2 });
  assert.equal(fightRecapLine(untouched), "WHAT JUST HAPPENED · THEY NEVER TOUCHED YOU. FLAWLESS.");
  assert.match(fightRecapLine(createFightDigest({ rounds: 2 })), /NOTHING LANDED ON YOU/);
  // One hit reads as ONE OF THEM, not "1 of them".
  const single = createFightDigest();
  noteFightDamage(single, "jumpIn", 18);
  single.damageTaken = 18;
  assert.match(fightRecapLine(single), /JUMP-INS · ONE OF THEM\.$/);
});

test("every damage site feeds the digest a cause and an amount", () => {
  // The four call sites: paint trap, projectile, throw, and the main strike.
  const calls = [...gameSource.matchAll(/progressionNoteDamage\(([\s\S]{0,320}?)\);/g)].map((m) => m[1]);
  assert.equal(calls.length, 4, "a damage site appeared or vanished");
  for (const call of calls) assert.match(call, /amount:/, `damage site has no amount: ${call.slice(0, 80)}`);
  // The signals with no single sim event are sampled once per frame in the HUD.
  assert.match(gameSource, /digest\.meterPeak = Math\.max\(digest\.meterPeak/);
  assert.match(gameSource, /if \(state\.stageWeapon && state\.stageWeapon\.phase !== "gone"\) digest\.weaponOffered = true;/);
  // A Perfect Guard deals nothing, so it books its own block.
  assert.match(gameSource, /progressionMatch\.digest\.perfectGuards \+= 1;/);
  // Knockdowns and techs come off their single entry points.
  assert.match(gameSource, /progressionMatch\.digest\.knockdownsTaken \+= 1;/);
  assert.match(gameSource, /progressionMatch\.digest\.techs \+= 1;/);
  assert.match(gameSource, /progressionMatch\.digest\.meterSpent \+= gritCost;/);
  // Sealed exactly once, at the same fold point the records store uses.
  assert.match(gameSource, /lastFightDigest = normalizeFightDigest\(digest\);\n  saveLastFightDigest\(\);/);
});

// --- 3. the lesson graph ---------------------------------------------------

const lessonIds = new Set(FIGHT_SCHOOL_LESSONS.map((lesson) => lesson.id));

test("every recommendation rule points at a lesson that exists", () => {
  assert.ok(FIGHT_SCHOOL_RECOMMENDATIONS.length >= 8);
  const seen = new Set();
  for (const rule of FIGHT_SCHOOL_RECOMMENDATIONS) {
    assert.ok(lessonIds.has(rule.lessonId), `rule ${rule.id} names no lesson`);
    assert.ok(!seen.has(rule.id), `duplicate rule id ${rule.id}`);
    seen.add(rule.id);
    // A rule must survive a completely empty signal set without throwing.
    assert.equal(typeof rule.when(normalizeSchoolSignals(null)), "boolean");
    assert.equal(typeof rule.reason(normalizeSchoolSignals({})), "string");
  }
});

test("the three named signals reach their three lessons", () => {
  const neverBlocked = recommendLesson({ rounds: 2, hitsTaken: 9, blocks: 0, damageTaken: 74 });
  assert.equal(neverBlocked.lessonId, "guard-heights");
  assert.equal(neverBlocked.ruleId, "never-blocked");
  assert.match(neverBlocked.reason, /74 DAMAGE WALKED STRAIGHT IN/);

  const ateThrows = recommendLesson({ rounds: 2, hitsTaken: 9, blocks: 6, throwsTaken: 3 });
  assert.equal(ateThrows.lessonId, "throw-tech");
  assert.match(ateThrows.reason, /THREW YOU 3 TIMES/);
  // One throw is enough when it was a quarter of the damage.
  const oneBigThrow = recommendLesson({
    rounds: 1, hitsTaken: 4, blocks: 4, throwsTaken: 1,
    damageBy: { throw: 30, light: 10 },
  });
  assert.equal(oneBigThrow.ruleId, "ate-throws");
  assert.match(oneBigThrow.reason, /THREW YOU 1 TIME\./);

  const neverSpent = recommendLesson({ rounds: 2, hitsTaken: 5, blocks: 5, meterSpent: 0, meterPeak: 100 });
  assert.equal(neverSpent.lessonId, "grit-economy");
  assert.match(neverSpent.reason, /BANKED 100 GRIT/);
  // Grit that was never banked is not a lesson, it is a short fight.
  const noGrit = recommendLesson({ rounds: 1, hitsTaken: 5, blocks: 5, meterSpent: 0, meterPeak: 10, hitsLanded: 6, specialsLanded: 2, heavyLanded: 2, lightLanded: 2, throwablesUsed: 1 });
  assert.notEqual(noGrit.ruleId, "never-spent-grit");
});

test("an unfinished lesson outranks a finished one, and the graph is stable", () => {
  const digest = { rounds: 2, hitsTaken: 9, blocks: 0, damageTaken: 40, throwsTaken: 4 };
  const fresh = recommendLesson(digest);
  assert.equal(fresh.lessonId, "guard-heights");
  assert.equal(fresh.replay, false);
  assert.match(fresh.headline, /^NEXT · LESSON 2 · HIGH & LOW GUARD$/);
  // Guard done: the next matching rule (the throws) takes the slot instead.
  const afterGuard = recommendLesson(digest, { completed: { "guard-heights": true } });
  assert.equal(afterGuard.lessonId, "throw-tech");
  assert.equal(afterGuard.replay, false);
  // Both done: the highest-priority match comes back as a replay.
  const bothDone = recommendLesson(digest, { completed: { "guard-heights": true, "throw-tech": true } });
  assert.equal(bothDone.lessonId, "guard-heights");
  assert.equal(bothDone.replay, true);
  assert.match(bothDone.headline, /^REPLAY · /);
  // Same digest, same answer, every time.
  for (let i = 0; i < 5; i += 1) assert.deepEqual(recommendLesson(digest), fresh);
});

test("no fight logged starts at the top; a clean fight takes the next page", () => {
  const first = recommendLesson(null);
  assert.equal(first.lessonId, FIGHT_SCHOOL_LESSONS[0].id);
  assert.equal(first.ruleId, "first-run");
  assert.deepEqual(recommendLesson(createFightDigest()), first);
  // Halfway through the book with nothing logged: the next unfinished lesson.
  const midway = recommendLesson(null, { completed: { footwork: true, "guard-heights": true } });
  assert.equal(midway.lessonId, "four-normals");

  const clean = {
    rounds: 2, hitsTaken: 4, blocks: 9, perfectGuards: 2, throwsTaken: 0,
    knockdownsTaken: 1, techs: 1, meterSpent: 50, meterPeak: 100,
    specialsLanded: 3, hitsLanded: 20, heavyLanded: 5, lightLanded: 7,
    throwablesUsed: 2, weaponOffered: true, weaponPickups: 1,
    damageBy: { heavy: 20, light: 8 },
  };
  const next = recommendLesson(clean, { completed: { footwork: true } });
  assert.equal(next.ruleId, "next-up");
  assert.equal(next.lessonId, "guard-heights");
  // A graduate with a clean fight has nothing left to be told.
  const graduated = Object.fromEntries(FIGHT_SCHOOL_LESSONS.map((lesson) => [lesson.id, true]));
  assert.equal(recommendLesson(clean, { completed: graduated }), null);
  // ...but a graduate who ate four throws still gets sent back to that page.
  const sloppy = recommendLesson({ ...clean, throwsTaken: 4 }, { completed: graduated });
  assert.equal(sloppy.lessonId, "throw-tech");
  assert.equal(sloppy.replay, true);
});

test("signals normalize before a rule ever reads them", () => {
  const signals = normalizeSchoolSignals({ blocks: "7", hitsTaken: -3, damageBy: { low: "12", bogus: 5 }, hitsBy: { low: 2 } });
  assert.equal(signals.blocks, 7);
  assert.equal(signals.hitsTaken, 0);
  assert.equal(signals.damageBy.low, 12);
  assert.equal(signals.damageBySum, 17);
  assert.equal(signals.weaponOffered, false);
  // 35% of the damage arriving low is the crouch-guard lesson, not the throw one.
  const lows = recommendLesson({
    rounds: 2, hitsTaken: 8, blocks: 6, damageTaken: 50,
    damageBy: { low: 30, heavy: 20 },
  });
  assert.equal(lows.ruleId, "ate-lows");
  assert.equal(lows.lessonId, "guard-heights");
});

// --- 4. the command copy audit ---------------------------------------------

test("the command table owns every string that names a button", () => {
  for (const style of ["classic", "modern", "legend"]) {
    assert.ok(commandLabel("block", style));
    assert.ok(commandLabel("finalBlow", style));
    assert.equal(CONTROL_STYLE_COMMANDS[style].throw, "CLOSE + TOWARD/AWAY + LP OR LK");
  }
  assert.equal(styleCopy("THROW: {throw} · DASH: {dash}", "modern"),
    "THROW: CLOSE + TOWARD/AWAY + LP OR LK · DASH: DOUBLE-TAP ← OR →");
  assert.equal(styleCopy("SPECIALS: {commandSpecial}", "legend"), "SPECIALS: HP");

  // The first-run card, the touch FINISH HIM prompt and the lab's grab hint
  // were the last three hard-coded command strings on the render side.
  assert.ok(!gameSource.includes('"CLOSE + TOWARD + LP"'), "the control card still hard-codes the grab");
  assert.ok(!gameSource.includes('"FINISH HIM · LP = A · LK = B · ANY DISTANCE"'),
    "the touch prompt still hard-codes the finishing buttons");
  assert.match(gameSource, /\["BLOCK", commandLabel\("block", style\)\]/);
  assert.match(gameSource, /\["GRAB", commandLabel\("throw", style\)\]/);
  assert.match(gameSource, /commandLabel\("finalBlow", state\.controlStyle\)/);

  // The dialog's throw / dash / object / final-blow paragraphs are templates
  // now, in all three sections (P1 keyboard, P2 keyboard, gamepad).
  const templates = [...htmlSource.matchAll(/<p data-style-copy>([^<]+)<\/p>/g)].map((m) => m[1]);
  assert.equal(templates.filter((line) => line.includes("{throwObject}")).length, 3);
  assert.equal(templates.filter((line) => line.includes("{finalBlow}")).length, 2);
  assert.equal(templates.filter((line) => line.includes("{dash}")).length, 3);
  for (const line of templates) {
    for (const [, action] of line.matchAll(/\{([a-zA-Z]+)\}/g)) {
      assert.ok(CONTROL_STYLE_COMMANDS.classic[action], `template names unknown action {${action}}`);
    }
    // Every token must actually resolve — a typo would render the raw brace.
    assert.ok(!/[{}]/.test(styleCopy(line, "legend")), `unresolved token in: ${line}`);
  }
  // The dialog copy must not carry a raw motion outside a template any more.
  const dialog = htmlSource.slice(htmlSource.indexOf('<dialog id="controlsDialog"'), htmlSource.indexOf('</dialog>'));
  const rawMotions = [...dialog.matchAll(/<p(?![^>]*data-style-copy)[^>]*>([^<]*(?:↓ ←|↓ →|LK&amp;HK|LP&amp;LK)[^<]*)<\/p>/g)];
  assert.deepEqual(rawMotions.map((m) => m[1]), []);
});
