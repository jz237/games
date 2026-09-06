import assert from "node:assert/strict";
import {
  DAILY_RULES,
  DEFAULT_MATCH_RULES,
  MUTATORS,
  MUTATOR_ORDER,
  SCORE_RULES,
  SURVIVAL_MILESTONE_LINES,
  SURVIVAL_RULES,
  TEAM_RULES,
  createBoutTally,
  createDailyPlan,
  createSurvivalRun,
  createTeamBattle,
  draftCpuTeam,
  currentSurvivalBout,
  currentTeamPair,
  dailyDateString,
  dailyShareText,
  highScoreQualifies,
  insertHighScore,
  mutatorLabel,
  nextDailyRecord,
  normalizeInitials,
  normalizeMutators,
  previousDateString,
  recordSurvivalDefeat,
  recordSurvivalWin,
  recordTeamKo,
  resolveMatchRules,
  scaleMovementForRules,
  scoreDifficultyMultiplier,
  scoreForHit,
  survivalAiTuningForBout,
  survivalCarriedHealth,
  survivalRunSnapshot,
  tallyRows,
  tallySubtotal,
  tallyTotal,
  teamBattleSnapshot,
  teamCarriedHealth,
  teamFightersRemaining,
} from "../engine/modes.mjs";
import { AI_DIFFICULTIES, createAiBrain, registerAiDifficulty, resolveAiSettings, normalizeAiDifficulty } from "../engine/ai.mjs";

const fighters = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali"];
const stages = ["somerset", "vet", "wildwood", "buffet", "cruise", "janney"];

// --- Daily seeding determinism ---------------------------------------------

function testDailyPlanDeterminism() {
  const first = createDailyPlan("2026-08-23", fighters);
  const second = createDailyPlan("2026-08-23", fighters);
  assert.equal(first.seed, second.seed);
  assert.equal(first.fighterId, second.fighterId);
  assert.equal(first.mutator, second.mutator);
  assert.deepEqual(
    first.run.matches.map(({ opponentId, stage }) => ({ opponentId, stage })),
    second.run.matches.map(({ opponentId, stage }) => ({ opponentId, stage })),
    "the same date string must produce the identical run plan everywhere",
  );
  assert.equal(first.difficulty, DAILY_RULES.difficulty);
  assert.ok(MUTATORS[first.mutator], "the daily always draws a known mutator");
  assert.ok(fighters.includes(first.fighterId));
  assert.equal(first.run.matches.length, 8);
}

function testDailyPlansDifferAcrossDates() {
  const seeds = new Set();
  const orders = new Set();
  for (const date of ["2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25"]) {
    const plan = createDailyPlan(date, fighters);
    seeds.add(plan.seed);
    orders.add(`${plan.fighterId}:${plan.run.matches.map(({ opponentId }) => opponentId).join(",")}`);
  }
  assert.equal(seeds.size, 5, "different dates must derive different seeds");
  assert.ok(orders.size >= 4, "different dates must produce different runs");
  assert.throws(() => createDailyPlan("23-08-2026", fighters), /YYYY-MM-DD/);
}

function testDailyDateHelpers() {
  assert.match(dailyDateString(new Date(2026, 7, 23, 14, 30)), /^2026-08-23$/);
  assert.equal(previousDateString("2026-08-23"), "2026-08-22");
  assert.equal(previousDateString("2026-01-01"), "2025-12-31");
  assert.equal(previousDateString("2026-03-01"), "2026-02-28");
}

function testDailyStreakRecord() {
  const day1 = nextDailyRecord(null, { date: "2026-08-21", score: 1000, wins: 8, bouts: 8, cleared: true });
  assert.equal(day1.streak, 1);
  assert.equal(day1.bestStreak, 1);
  assert.equal(day1.lastClearedDate, "2026-08-21");
  const day2 = nextDailyRecord(day1, { date: "2026-08-22", score: 500, wins: 8, bouts: 8, cleared: true });
  assert.equal(day2.streak, 2, "consecutive clears grow the streak");
  assert.equal(day2.bestScore, 1000, "best score never regresses");
  const day3loss = nextDailyRecord(day2, { date: "2026-08-23", score: 300, wins: 2, bouts: 8, cleared: false });
  assert.equal(day3loss.streak, 0, "a failed daily breaks the streak");
  assert.equal(day3loss.bestStreak, 2);
  const gap = nextDailyRecord(day2, { date: "2026-08-25", score: 900, wins: 8, bouts: 8, cleared: true });
  assert.equal(gap.streak, 1, "a missed day restarts the streak at 1");
  const share = dailyShareText({ date: "2026-08-23", fighterName: "JEZ", score: 12345, wins: 8, bouts: 8, cleared: true, streak: 3, mutator: "turbo" });
  assert.match(share, /DAILY JAWN 2026-08-23/);
  assert.match(share, /12,345 PTS/);
  assert.match(share, /TURBO/);
  assert.match(share, /STREAK 3/);
}

// --- Survival ladder --------------------------------------------------------

function testSurvivalDeterminism() {
  const runA = createSurvivalRun({ playerId: "jez", fighterIds: fighters, stageIds: stages, seed: 42 });
  const runB = createSurvivalRun({ playerId: "jez", fighterIds: fighters, stageIds: stages, seed: 42 });
  const sequenceA = [];
  const sequenceB = [];
  for (let bout = 0; bout < 15; bout += 1) {
    sequenceA.push(`${currentSurvivalBout(runA).opponentId}@${currentSurvivalBout(runA).stage}`);
    sequenceB.push(`${currentSurvivalBout(runB).opponentId}@${currentSurvivalBout(runB).stage}`);
    recordSurvivalWin(runA, 50);
    recordSurvivalWin(runB, 50);
  }
  assert.deepEqual(sequenceA, sequenceB, "same seed must produce the same Gauntlet order");
  const other = createSurvivalRun({ playerId: "jez", fighterIds: fighters, stageIds: stages, seed: 43 });
  const otherSequence = [];
  for (let bout = 0; bout < 15; bout += 1) {
    otherSequence.push(`${currentSurvivalBout(other).opponentId}@${currentSurvivalBout(other).stage}`);
    recordSurvivalWin(other, 50);
  }
  assert.notDeepEqual(sequenceA, otherSequence, "a different seed must reshuffle the ladder");
}

function testSurvivalBagDiscipline() {
  const run = createSurvivalRun({ playerId: "jez", fighterIds: fighters, stageIds: stages, seed: 7 });
  const opponents = [];
  for (let bout = 0; bout < 21; bout += 1) {
    const current = currentSurvivalBout(run);
    assert.notEqual(current.opponentId, "jez", "the player never fights themselves");
    opponents.push(current.opponentId);
    recordSurvivalWin(run, 80);
  }
  for (let index = 1; index < opponents.length; index += 1) {
    assert.notEqual(opponents[index], opponents[index - 1], "no immediate opponent repeats");
  }
  // Every full 7-opponent cycle contains the whole roster (shuffle-bag law).
  assert.equal(new Set(opponents.slice(0, 7)).size, 7);
  assert.equal(new Set(opponents.slice(7, 14)).size, 7);
}

function testSurvivalCarryRegen() {
  assert.equal(survivalCarriedHealth(100), 100);
  assert.equal(survivalCarriedHealth(40), 40 + Math.round((100 - 40) * SURVIVAL_RULES.regenShare));
  assert.equal(survivalCarriedHealth(0), Math.max(1, Math.round(100 * SURVIVAL_RULES.regenShare)));
  assert.equal(survivalCarriedHealth(-20), survivalCarriedHealth(0), "health clamps at the floor");
  const run = createSurvivalRun({ playerId: "jez", fighterIds: fighters, stageIds: stages, seed: 5 });
  recordSurvivalWin(run, 40);
  assert.equal(run.carryHealth, 58, "carry = health + 30% of missing health");
  assert.equal(currentSurvivalBout(run).carryHealth, 58, "the next bout consumes the carried value");
  const defeat = recordSurvivalDefeat(run);
  assert.equal(defeat.wins, 1);
  assert.equal(run.over, true);
  assert.equal(recordSurvivalWin(run, 90), null, "a finished run records nothing further");
  const snapshot = survivalRunSnapshot(run);
  assert.equal(snapshot.wins, 1);
  assert.equal(snapshot.over, true);
}

function testSurvivalMilestones() {
  const run = createSurvivalRun({ playerId: "deathblow", fighterIds: fighters, stageIds: stages, seed: 11 });
  const milestones = [];
  for (let bout = 0; bout < 10; bout += 1) {
    const outcome = recordSurvivalWin(run, 70);
    if (outcome.milestone) milestones.push({ wins: outcome.wins, line: outcome.milestoneLine });
  }
  assert.deepEqual(milestones.map(({ wins }) => wins), [5, 10], "milestones land every 5 wins");
  assert.equal(milestones[0].line, SURVIVAL_MILESTONE_LINES[0]);
  assert.equal(milestones[1].line, SURVIVAL_MILESTONE_LINES[1], "milestone lines rotate variants");
}

function testSurvivalAiRamp() {
  const bout0 = survivalAiTuningForBout(0);
  assert.equal(bout0.settings.reactionFrames, AI_DIFFICULTIES.rookie.reactionFrames, "bout 1 fights like ROOKIE");
  assert.equal(bout0.settings.defenseChance, AI_DIFFICULTIES.rookie.defenseChance);
  assert.equal(bout0.multiplier, scoreDifficultyMultiplier("rookie"));
  const mid = survivalAiTuningForBout(4);
  assert.ok(mid.settings.defenseChance > AI_DIFFICULTIES.street.defenseChance, "bout 5 has ramped past STREET");
  assert.ok(mid.settings.defenseChance < AI_DIFFICULTIES.pro.defenseChance, "…but not yet reached PRO");
  assert.ok(mid.settings.errorChance < AI_DIFFICULTIES.street.errorChance, "errors lerp DOWN as bouts climb");
  const cap = survivalAiTuningForBout(9);
  assert.equal(cap.settings.reactionFrames, AI_DIFFICULTIES.final.reactionFrames, "the ramp clamps at FINAL");
  assert.equal(cap.multiplier, scoreDifficultyMultiplier("final"));
  const far = survivalAiTuningForBout(30).settings;
  assert.deepEqual(
    { ...far, label: "" },
    { ...cap.settings, label: "" },
    "beyond the ramp the numbers stay pinned at FINAL (labels still count bouts)",
  );
  // Registered blend flows through the AI module without touching the picker.
  const tuning = survivalAiTuningForBout(4);
  registerAiDifficulty(tuning.id, tuning.settings);
  const brain = createAiBrain(tuning.id);
  assert.equal(brain.difficulty, tuning.id, "custom ids survive createAiBrain");
  assert.equal(resolveAiSettings(tuning.id).defenseChance, tuning.settings.defenseChance);
  assert.equal(normalizeAiDifficulty(tuning.id), "street", "the persisted picker never adopts custom ids");
  assert.throws(() => registerAiDifficulty("street", {}), /built-in/);
}

// --- Team battle rotation ---------------------------------------------------

function testTeamRotation() {
  const battle = createTeamBattle(["deathblow", "jez", "alan"], ["post", "benny", "donald"]);
  assert.deepEqual(currentTeamPair(battle), ["deathblow", "post"], "openers lead both teams");
  assert.equal(currentTeamPair(battle).length, 2, "only two fighters are ever simulated");

  // P1's opener wins at 40 health: P2 loses post, benny walks in.
  const first = recordTeamKo(battle, 0, 40, 55);
  assert.equal(first.eliminatedId, "post");
  assert.equal(first.incomingId, "benny");
  assert.equal(first.over, false);
  assert.equal(battle.carryHealth[0], teamCarriedHealth(40), "winner carries health + small regen");
  assert.equal(battle.carryHealth[0], 40 + Math.round(60 * TEAM_RULES.regenShare));
  assert.equal(battle.carryMeter[0], 55, "the stayer keeps their meter");
  assert.equal(battle.carryHealth[1], 100, "the incoming teammate arrives fresh");
  assert.deepEqual(currentTeamPair(battle), ["deathblow", "benny"]);
  assert.equal(battle.bout, 2);

  // Benny takes the round: P1 loses deathblow, jez walks in.
  const second = recordTeamKo(battle, 1, 12, 0);
  assert.equal(second.eliminatedId, "deathblow");
  assert.equal(second.incomingId, "jez");
  assert.deepEqual(currentTeamPair(battle), ["jez", "benny"]);
  assert.equal(teamFightersRemaining(battle, 0), 2);
  assert.equal(teamFightersRemaining(battle, 1), 2);

  // P1 sweeps the rest.
  recordTeamKo(battle, 0, 66, 10);
  const last = recordTeamKo(battle, 0, 80, 0);
  assert.equal(last.over, true, "three eliminations end the war");
  assert.equal(battle.over, true);
  assert.equal(battle.winnerSide, 0);
  assert.equal(currentTeamPair(battle), null);
  assert.equal(recordTeamKo(battle, 0, 50, 0), null, "a finished battle records nothing further");
  const snapshot = teamBattleSnapshot(battle);
  assert.deepEqual(snapshot.eliminated[1], ["post", "benny", "donald"]);
  assert.deepEqual(snapshot.remaining, [2, 0]);
  assert.equal(snapshot.lastElimination.line.length > 4, true, "elimination callout lines exist");
}

function testTeamValidation() {
  assert.throws(() => createTeamBattle(["deathblow", "jez"], ["post", "benny", "donald"]), /exactly 3/);
  assert.throws(() => createTeamBattle(["deathblow", "deathblow", "jez"], ["post", "benny", "donald"]), /repeat/);
}

// --- Mutators / match rules -------------------------------------------------

function testMutatorNormalization() {
  assert.deepEqual(normalizeMutators(["turbo", "turbo", "nope", "sudden-death"]), ["sudden-death", "turbo"]);
  assert.deepEqual(normalizeMutators(["one-round", "sudden-death"]), ["sudden-death", "one-round"], "canonical registry order");
  assert.deepEqual(normalizeMutators(undefined), []);
  assert.equal(mutatorLabel(["turbo", "one-round"]), "TURBO · ONE-ROUND SHOWDOWN");
}

function testMatchRulesRoundTrip() {
  assert.deepEqual(resolveMatchRules([]), { ...DEFAULT_MATCH_RULES });
  const rules = resolveMatchRules(["turbo", "one-round", "infinite-grit", "weapons-rain", "sudden-death"]);
  assert.equal(rules.speedScale, 1.25);
  assert.equal(rules.roundsToWin, 1);
  assert.equal(rules.infiniteGrit, true);
  assert.equal(rules.weaponsRain, true);
  assert.equal(rules.suddenDeathDizzy, true);
  // The config round-trip both rollback peers rely on: ids → JSON → ids →
  // identical derived rules, regardless of input order.
  const ids = ["one-round", "turbo"];
  const wire = JSON.parse(JSON.stringify({ mutators: normalizeMutators(ids) }));
  assert.deepEqual(normalizeMutators(wire.mutators), normalizeMutators(["turbo", "one-round"]));
  assert.deepEqual(resolveMatchRules(wire.mutators), resolveMatchRules(ids));
  for (const id of MUTATOR_ORDER) {
    const single = resolveMatchRules([id]);
    assert.notDeepEqual(single, { ...DEFAULT_MATCH_RULES }, `${id} must change at least one rule`);
  }
}

function testTurboMovementScale() {
  const movement = { forwardWalkSpeed: 300, backWalkSpeed: 240, forwardDashSpeed: 700, backDashSpeed: 500, jumpVelocityY: -800 };
  const unchanged = scaleMovementForRules(movement, resolveMatchRules([]));
  assert.equal(unchanged, movement, "no mutators → the identical reference (no rebuild)");
  const turbo = scaleMovementForRules(movement, resolveMatchRules(["turbo"]));
  assert.equal(turbo.forwardWalkSpeed, 375);
  assert.equal(turbo.backWalkSpeed, 300);
  assert.equal(turbo.forwardDashSpeed, 875);
  assert.equal(turbo.backDashSpeed, 625);
  assert.equal(turbo.jumpVelocityY, -800, "only walk/dash speeds scale");
  assert.equal(movement.forwardWalkSpeed, 300, "the source object is never mutated");
}

// --- Score attack -----------------------------------------------------------

function testScorePerHit() {
  assert.equal(scoreForHit("light"), SCORE_RULES.hitPoints.light);
  assert.equal(scoreForHit("heavy"), SCORE_RULES.hitPoints.heavy);
  assert.equal(scoreForHit("special"), SCORE_RULES.hitPoints.special);
  assert.equal(scoreForHit("throw"), SCORE_RULES.hitPoints.throw);
  assert.equal(scoreForHit("super"), SCORE_RULES.hitPoints.super);
  assert.equal(scoreForHit("light", { counter: true }), Math.round(SCORE_RULES.hitPoints.light * SCORE_RULES.counterMultiplier));
  assert.equal(scoreForHit("unknown"), SCORE_RULES.hitPoints.light, "unknown classes fall back to light");
}

function testTallyMath() {
  const tally = createBoutTally();
  tally.fightPoints = 1200;
  tally.hits = 7;
  tally.timeSeconds = 55;
  tally.vitality = 80;
  tally.perfects = 1;
  tally.firstAttacks = 2;
  tally.dizzies = 1;
  tally.fatalities = 1;
  const rows = tallyRows(tally);
  const byId = Object.fromEntries(rows.map((row) => [row.id, row.points]));
  assert.equal(byId.fight, 1200);
  assert.equal(byId.time, 55 * SCORE_RULES.timeBonusPerSecond);
  assert.equal(byId.vitality, 80 * SCORE_RULES.vitalityPerPoint);
  assert.equal(byId.perfect, SCORE_RULES.perfectBonus);
  assert.equal(byId.first, 2 * SCORE_RULES.firstAttackBonus);
  assert.equal(byId.dizzy, SCORE_RULES.dizzyBonus);
  assert.equal(byId.fatality, SCORE_RULES.fatalityBonus);
  const subtotal = tallySubtotal(tally);
  assert.equal(subtotal, rows.reduce((total, row) => total + row.points, 0));
  assert.equal(tallyTotal(tally, 1), subtotal);
  assert.equal(tallyTotal(tally, 1.5), Math.round(subtotal * 1.5), "difficulty multiplies the whole tally");
  assert.equal(tallyTotal(tally, 0), 0, "PASSIVE earns nothing");
  assert.equal(tallyTotal(createBoutTally(), 2), 0, "an empty tally is worth zero");
}

function testHighScoreTable() {
  assert.equal(normalizeInitials("jez"), "JEZ");
  assert.equal(normalizeInitials("j!"), "JAA");
  assert.equal(normalizeInitials(""), "AAA");
  assert.equal(normalizeInitials("PHILADELPHIA"), "PHI");
  let list = [];
  for (let index = 0; index < 12; index += 1) {
    ({ list } = insertHighScore(list, { initials: `P${index}`, score: (index + 1) * 100, mode: "arcade" }));
  }
  assert.equal(list.length, SCORE_RULES.tableSize, "the table caps at ten rows");
  assert.equal(list[0].score, 1200);
  assert.equal(list.at(-1).score, 300, "the weakest charted rows fall off");
  assert.ok(list.every((row, index) => index === 0 || list[index - 1].score >= row.score), "sorted descending");
  const { rank } = insertHighScore(list, { initials: "JEZ", score: 650, mode: "survival" });
  assert.equal(rank, 6, "a mid score slots into its rank");
  const missed = insertHighScore(list, { initials: "LOW", score: 1, mode: "arcade" });
  assert.equal(missed.rank, -1, "a too-low score does not chart on a full table");
  assert.equal(highScoreQualifies(list, 1), false);
  assert.equal(highScoreQualifies(list, 5000), true);
  assert.equal(highScoreQualifies([], 10), true);
  assert.equal(highScoreQualifies([], 0), false, "zero never charts");
}

testDailyPlanDeterminism();
testDailyPlansDifferAcrossDates();
testDailyDateHelpers();
testDailyStreakRecord();
testSurvivalDeterminism();
testSurvivalBagDiscipline();
testSurvivalCarryRegen();
testSurvivalMilestones();
testSurvivalAiRamp();
testTeamRotation();
testTeamValidation();
testCpuTeamDraft();
testMutatorNormalization();
testMatchRulesRoundTrip();
testTurboMovementScale();
testScorePerHit();
testTallyMath();
testHighScoreTable();

console.log("Final Blow game-mode tests passed");

// 5.1 (sweep #32): the auto-drafted CPU Block War team — three fighters the
// player did not pick, reproducible under a seeded draw, always a legal team
// for createTeamBattle.
function testCpuTeamDraft() {
  const rosterIds = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "devil", "commissioner"];
  const picks = ["deathblow", "jez", "alan"];
  const seeded = () => {
    let x = 0.137;
    return () => { x = (x * 9301 + 0.49297) % 1; return x; };
  };
  const drafted = draftCpuTeam(picks, rosterIds, seeded());
  assert.equal(drafted.length, 3);
  assert.equal(new Set(drafted).size, 3, "no repeats");
  for (const id of drafted) assert.ok(!picks.includes(id), `${id} was not the player's pick`);
  for (const id of drafted) assert.ok(rosterIds.includes(id));
  assert.deepEqual(draftCpuTeam(picks, rosterIds, seeded()), drafted, "same draw, same draft");
  const battle = createTeamBattle(picks, drafted);
  assert.deepEqual(battle.teams[1], drafted);
  // A different draw usually drafts a different trio (10 fighters, 7 spare).
  const other = draftCpuTeam(picks, rosterIds, () => 0.91);
  assert.equal(other.length, 3);
  // Degenerate roster: fewer than three unpicked ids fill from the picks
  // rather than returning a short team.
  const tiny = draftCpuTeam(picks, ["deathblow", "jez", "alan", "post"], () => 0.5);
  assert.equal(tiny.length, 3);
  assert.equal(tiny[0], "post");
  assert.equal(new Set(tiny).size, 3);
}
