// Release 1.8 GRIND — game-mode logic: survival ladder, team battle rotation,
// daily challenge seeding, the House Rules mutator registry, and the score
// attack math. Everything in here is pure and deterministic: no Date.now, no
// Math.random, no DOM. The daily seed derives from a DATE STRING the caller
// computes once at run start (render-side); survival draws from a
// DeterministicRng seeded once at run creation.
import { DeterministicRng, hashSeed } from "./foundation.mjs";
import { refillBag } from "./demo.mjs";
import { AI_DIFFICULTIES } from "./ai.mjs";
import { createArcadeRun } from "./arcade.mjs";

const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));
const lerpValue = (a, b, t) => a + (b - a) * t;

// --------------------------------------------------------------------------
// Mutators — "House Rules". Every entry is a pure description of match rules.
// All sim-affecting values flow through resolveMatchRules() into the match
// config (state.mutators is snapshotted; matchRules is re-derived from it on
// restore), so both rollback peers always agree. Plain online rooms never set
// mutators, so they stay gated out of online unless a future lobby shares them.
// --------------------------------------------------------------------------

export const MUTATORS = Object.freeze({
  "sudden-death": Object.freeze({
    id: "sudden-death",
    name: "SUDDEN DEATH",
    blurb: "FIRST CLEAN HIT DIZZIES",
    rules: Object.freeze({ suddenDeathDizzy: true }),
  }),
  turbo: Object.freeze({
    id: "turbo",
    name: "TURBO",
    blurb: "HYPER FIGHTING SPEED",
    rules: Object.freeze({ speedScale: 1.25 }),
  }),
  "infinite-grit": Object.freeze({
    id: "infinite-grit",
    name: "INFINITE GRIT",
    blurb: "METER ALWAYS FULL",
    rules: Object.freeze({ infiniteGrit: true }),
  }),
  "weapons-rain": Object.freeze({
    id: "weapons-rain",
    name: "WEAPONS RAIN",
    blurb: "STAGE WEAPONS KEEP COMING",
    rules: Object.freeze({ weaponsRain: true }),
  }),
  "one-round": Object.freeze({
    id: "one-round",
    name: "ONE-ROUND SHOWDOWN",
    blurb: "SINGLE ROUND SETTLES IT",
    rules: Object.freeze({ roundsToWin: 1 }),
  }),
});

export const MUTATOR_ORDER = Object.freeze(["sudden-death", "turbo", "infinite-grit", "weapons-rain", "one-round"]);

export const DEFAULT_MATCH_RULES = Object.freeze({
  speedScale: 1,
  roundsToWin: 2,
  suddenDeathDizzy: false,
  infiniteGrit: false,
  weaponsRain: false,
  // Frames a "gone" stage weapon waits before the rain re-plans the next drop.
  weaponRespawnFrames: 300,
});

// Canonical form: known ids only, deduped, in registry order — so any two
// peers (or a snapshot round-trip) derive identical rules from the same set.
export function normalizeMutators(ids = []) {
  const requested = new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)));
  return MUTATOR_ORDER.filter((id) => requested.has(id));
}

export function resolveMatchRules(ids = []) {
  const rules = { ...DEFAULT_MATCH_RULES };
  for (const id of normalizeMutators(ids)) Object.assign(rules, MUTATORS[id].rules);
  return rules;
}

export function mutatorLabel(ids = []) {
  return normalizeMutators(ids).map((id) => MUTATORS[id].name).join(" · ");
}

// Movement is a derived-from-config reference on the fighter (never cloned by
// the rollback snapshot), so the Turbo scale is applied here when the fighter
// is built and stays constant for the whole match. Integer rounding keeps the
// scaled values checksum-stable.
export function scaleMovementForRules(movement, rules = DEFAULT_MATCH_RULES) {
  const scale = Number(rules?.speedScale) || 1;
  if (scale === 1) return movement;
  const scaled = { ...movement };
  for (const field of ["forwardWalkSpeed", "backWalkSpeed", "forwardDashSpeed", "backDashSpeed"]) {
    if (Number.isFinite(scaled[field])) scaled[field] = Math.round(scaled[field] * scale);
  }
  return scaled;
}

// --------------------------------------------------------------------------
// Score attack — classic SF2-style points. Score is presentation/meta only:
// game.js tracks it OUTSIDE the checksummed sim state behind
// rollbackResimulating guards. Everything here is arithmetic.
// --------------------------------------------------------------------------

export const SCORE_RULES = Object.freeze({
  hitPoints: Object.freeze({
    light: 100,
    heavy: 300,
    special: 500,
    throw: 400,
    super: 1500,
  }),
  counterMultiplier: 1.5,
  timeBonusPerSecond: 300,
  vitalityPerPoint: 100,
  perfectBonus: 15000,
  firstAttackBonus: 1500,
  dizzyBonus: 2500,
  fatalityBonus: 25000,
  tableSize: 10,
});

// Difficulty multiplier applied to the whole bout tally, derived from the
// AI_DIFFICULTIES ladder (passive earns nothing — it cannot fight back).
export const SCORE_DIFFICULTY_MULTIPLIERS = Object.freeze({
  passive: 0,
  rookie: 0.5,
  street: 1,
  pro: 1.5,
  final: 2,
});

export function scoreDifficultyMultiplier(id) {
  return SCORE_DIFFICULTY_MULTIPLIERS[id] ?? 1;
}

export function scoreForHit(kind, { counter = false } = {}) {
  const base = SCORE_RULES.hitPoints[kind] ?? SCORE_RULES.hitPoints.light;
  return Math.round(base * (counter ? SCORE_RULES.counterMultiplier : 1));
}

export function createBoutTally() {
  return {
    fightPoints: 0,
    hits: 0,
    timeSeconds: 0,
    vitality: 0,
    perfects: 0,
    firstAttacks: 0,
    dizzies: 0,
    fatalities: 0,
    rounds: 0,
  };
}

// One SF2 tally row per bonus with its computed points, in screen order.
export function tallyRows(tally) {
  return [
    { id: "fight", label: "FIGHT POINTS", count: tally.hits, points: Math.round(tally.fightPoints) },
    { id: "time", label: "TIME BONUS", count: Math.round(tally.timeSeconds), points: Math.round(tally.timeSeconds * SCORE_RULES.timeBonusPerSecond) },
    { id: "vitality", label: "VITALITY", count: Math.round(tally.vitality), points: Math.round(tally.vitality * SCORE_RULES.vitalityPerPoint) },
    { id: "perfect", label: "PERFECT", count: tally.perfects, points: tally.perfects * SCORE_RULES.perfectBonus },
    { id: "first", label: "FIRST ATTACK", count: tally.firstAttacks, points: tally.firstAttacks * SCORE_RULES.firstAttackBonus },
    { id: "dizzy", label: "DIZZY", count: tally.dizzies, points: tally.dizzies * SCORE_RULES.dizzyBonus },
    { id: "fatality", label: "FATALITY", count: tally.fatalities, points: tally.fatalities * SCORE_RULES.fatalityBonus },
  ];
}

export function tallySubtotal(tally) {
  return tallyRows(tally).reduce((total, row) => total + row.points, 0);
}

export function tallyTotal(tally, difficultyMultiplier = 1) {
  return Math.round(tallySubtotal(tally) * difficultyMultiplier);
}

export function normalizeInitials(text) {
  const letters = String(text ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
  return (letters + "AAA").slice(0, 3);
}

// Insert into a high-score list: sorted descending, capped, stable for ties
// (earlier entries keep their spot). Returns the new list plus the 0-based
// rank of the inserted entry, or rank -1 when it failed to chart.
export function insertHighScore(list, entry, tableSize = SCORE_RULES.tableSize) {
  const table = (Array.isArray(list) ? list : [])
    .filter((row) => row && Number.isFinite(row.score))
    .slice(0, tableSize);
  const record = {
    initials: normalizeInitials(entry?.initials),
    score: Math.max(0, Math.round(Number(entry?.score) || 0)),
    mode: String(entry?.mode || "arcade"),
    detail: String(entry?.detail || ""),
    date: String(entry?.date || ""),
  };
  let rank = table.findIndex((row) => record.score > row.score);
  if (rank < 0) rank = table.length;
  if (rank >= tableSize) return { list: table, rank: -1, entry: record };
  const next = [...table.slice(0, rank), record, ...table.slice(rank)].slice(0, tableSize);
  return { list: next, rank, entry: record };
}

export function highScoreQualifies(list, score, tableSize = SCORE_RULES.tableSize) {
  if (!Number.isFinite(score) || score <= 0) return false;
  const table = (Array.isArray(list) ? list : []).filter((row) => row && Number.isFinite(row.score));
  if (table.length < tableSize) return true;
  return table.slice(0, tableSize).some((row) => score > row.score);
}

// --------------------------------------------------------------------------
// Survival — "The Gauntlet". An endless deterministic ladder drawn from the
// demo shuffle-bag (never the same opponent twice in a row, full roster every
// cycle), with partial health carry + regen between wins and an AI that ramps
// by lerping the AI_DIFFICULTIES numeric fields every few bouts.
// --------------------------------------------------------------------------

export const SURVIVAL_RULES = Object.freeze({
  // Winner keeps their health plus regains this share of what is missing.
  regenShare: 0.3,
  // Bout indexes where the ramp anchors sit; lerped between, clamped after.
  rampAnchors: Object.freeze(["rookie", "street", "pro", "final"]),
  rampBoutsPerTier: 3,
  milestoneEvery: 5,
});

export const SURVIVAL_MILESTONE_LINES = Object.freeze([
  "THE BLOCK IS WATCHING",
  "NOBODY LEFT IN LINE",
  "THE STREET KNOWS YOUR NAME",
  "STILL STANDING · STILL SWINGING",
  "SEND THE NEXT ONE ALREADY",
  "PHILLY RUNS ON THIS",
]);

const SURVIVAL_LERP_FIELDS = Object.freeze([
  "defenseChance", "antiAirChance", "comboChance", "throwChance", "meterChance",
  "wakeupReversalChance", "errorChance", "throwTechChance", "grabPressureChance",
  "quickRiseChance", "wakeDelayChance", "airRecoveryChance", "perfectGuardChance",
  "tauntChance",
]);
const SURVIVAL_ROUND_FIELDS = Object.freeze(["reactionFrames", "decisionFrames", "repeatLimit"]);

// Lerped AI settings for a bout index. Deterministic pure math: bout 0 is
// exactly ROOKIE, each rampBoutsPerTier bouts advance one anchor, and the ramp
// clamps at FINAL. The score multiplier lerps along the same track.
export function survivalAiTuningForBout(boutIndex) {
  const anchors = SURVIVAL_RULES.rampAnchors;
  const position = clampValue(boutIndex / SURVIVAL_RULES.rampBoutsPerTier, 0, anchors.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(anchors.length - 1, lower + 1);
  const t = position - lower;
  const from = AI_DIFFICULTIES[anchors[lower]];
  const to = AI_DIFFICULTIES[anchors[upper]];
  const settings = { label: `GAUNTLET ${boutIndex + 1}` };
  for (const field of SURVIVAL_LERP_FIELDS) {
    settings[field] = Number(lerpValue(from[field] ?? 0, to[field] ?? 0, t).toFixed(4));
  }
  for (const field of SURVIVAL_ROUND_FIELDS) {
    settings[field] = Math.round(lerpValue(from[field] ?? 0, to[field] ?? 0, t));
  }
  const fromMultiplier = scoreDifficultyMultiplier(anchors[lower]);
  const toMultiplier = scoreDifficultyMultiplier(anchors[upper]);
  return {
    id: `survival-${boutIndex}`,
    settings,
    multiplier: Number(lerpValue(fromMultiplier, toMultiplier, t).toFixed(3)),
    anchor: t >= 0.5 ? anchors[upper] : anchors[lower],
  };
}

export function survivalCarriedHealth(health, regenShare = SURVIVAL_RULES.regenShare) {
  const current = clampValue(Number(health) || 0, 0, 100);
  return clampValue(Math.round(current + (100 - current) * regenShare), 1, 100);
}

export function createSurvivalRun({ playerId, fighterIds, stageIds, seed = 237 } = {}) {
  const opponents = [...new Set(fighterIds)].filter((id) => id && id !== playerId);
  const stages = [...new Set(stageIds)];
  if (opponents.length < 2) throw new Error("Survival requires at least two opponents.");
  if (!stages.length) throw new Error("Survival requires at least one stage.");
  const normalizedSeed = hashSeed("FINAL-BLOW-GAUNTLET", playerId, seed, opponents.join("|"), stages.join("|"));
  const run = {
    playerId,
    seed: Number(seed) >>> 0,
    normalizedSeed,
    rngState: normalizedSeed,
    opponents,
    stages,
    bout: 0,
    wins: 0,
    carryHealth: 100,
    over: false,
    opponentBag: [],
    stageBag: [],
    previousOpponent: null,
    previousStage: null,
    current: null,
    history: [],
  };
  advanceSurvivalBout(run);
  return run;
}

function advanceSurvivalBout(run) {
  const rng = new DeterministicRng(run.rngState);
  if (!run.opponentBag.length) run.opponentBag = refillBag(run.opponents, rng, run.previousOpponent);
  if (!run.stageBag.length) run.stageBag = refillBag(run.stages, rng, run.previousStage);
  const opponentId = run.opponentBag.shift();
  const stage = run.stageBag.shift();
  run.rngState = rng.getState();
  run.previousOpponent = opponentId;
  run.previousStage = stage;
  const tuning = survivalAiTuningForBout(run.bout);
  run.current = {
    index: run.bout,
    opponentId,
    stage,
    difficultyId: tuning.id,
    difficultySettings: tuning.settings,
    difficultyAnchor: tuning.anchor,
    multiplier: tuning.multiplier,
    carryHealth: run.carryHealth,
  };
  return run.current;
}

export function currentSurvivalBout(run) {
  return run?.current || null;
}

// A won bout: records the streak, computes the carried health for the next
// bout from the health the player finished with, and reports whether this win
// crossed a milestone (every milestoneEvery wins → announcer callout with a
// rotating variant line).
export function recordSurvivalWin(run, remainingHealth) {
  if (!run || run.over) return null;
  run.wins += 1;
  run.history.push(run.current.opponentId);
  if (run.history.length > 64) run.history.shift();
  run.carryHealth = survivalCarriedHealth(remainingHealth);
  run.bout += 1;
  const milestone = run.wins % SURVIVAL_RULES.milestoneEvery === 0;
  const line = SURVIVAL_MILESTONE_LINES[
    Math.floor(run.wins / SURVIVAL_RULES.milestoneEvery - 1) % SURVIVAL_MILESTONE_LINES.length
  ];
  advanceSurvivalBout(run);
  return {
    wins: run.wins,
    carryHealth: run.carryHealth,
    milestone,
    milestoneLine: milestone ? line : "",
    next: run.current,
  };
}

export function recordSurvivalDefeat(run) {
  if (!run) return null;
  run.over = true;
  return { wins: run.wins, bout: run.bout };
}

export function survivalRunSnapshot(run) {
  if (!run) return null;
  return {
    playerId: run.playerId,
    seed: run.seed,
    bout: run.bout,
    wins: run.wins,
    carryHealth: run.carryHealth,
    over: run.over,
    current: run.current ? { ...run.current, difficultySettings: { ...run.current.difficultySettings } } : null,
    history: [...run.history],
  };
}

// --------------------------------------------------------------------------
// Team battle — "Block War" (KOF-style 3v3 winner-stays). Only ever TWO
// fighters exist in the sim; this object is pure bookkeeping about who those
// two are, who is eliminated, and what health the stayer carries in.
// --------------------------------------------------------------------------

export const TEAM_RULES = Object.freeze({
  teamSize: 3,
  regenShare: 0.15,
});

export const TEAM_ELIMINATION_LINES = Object.freeze([
  "SENT BACK TO THE CORNER",
  "ONE MORE OFF THE BLOCK",
  "THE BENCH GETS HEAVIER",
  "NEXT UP · KEEP IT MOVING",
  "THAT CORNER JUST GOT QUIET",
]);

export function teamCarriedHealth(health, regenShare = TEAM_RULES.regenShare) {
  return survivalCarriedHealth(health, regenShare);
}

export function createTeamBattle(teamA, teamB, { teamSize = TEAM_RULES.teamSize } = {}) {
  const teams = [teamA, teamB].map((team) => [...(team || [])]);
  teams.forEach((team, side) => {
    if (team.length !== teamSize) throw new Error(`Team ${side + 1} needs exactly ${teamSize} fighters.`);
    if (new Set(team).size !== team.length) throw new Error(`Team ${side + 1} cannot repeat a fighter.`);
  });
  return {
    teams,
    active: [0, 0],
    eliminated: [[], []],
    carryHealth: [100, 100],
    carryMeter: [0, 0],
    bout: 1,
    winnerSide: -1,
    over: false,
    lastElimination: null,
  };
}

export function currentTeamPair(battle) {
  if (!battle || battle.over) return null;
  return [battle.teams[0][battle.active[0]], battle.teams[1][battle.active[1]]];
}

export function teamFightersRemaining(battle, side) {
  return battle.teams[side].length - battle.eliminated[side].length;
}

// A KO in the current pairing: the loser's fighter is eliminated and the next
// teammate walks in fresh, while the winner stays on carried health + small
// regen (meter carries too — the stayer never leaves the arena).
export function recordTeamKo(battle, winnerSide, winnerHealth, winnerMeter = 0) {
  if (!battle || battle.over || (winnerSide !== 0 && winnerSide !== 1)) return null;
  const loserSide = 1 - winnerSide;
  const eliminatedId = battle.teams[loserSide][battle.active[loserSide]];
  battle.eliminated[loserSide].push(eliminatedId);
  battle.carryHealth[winnerSide] = teamCarriedHealth(winnerHealth);
  battle.carryMeter[winnerSide] = clampValue(Math.round(Number(winnerMeter) || 0), 0, 100);
  const over = battle.eliminated[loserSide].length >= battle.teams[loserSide].length;
  const result = {
    winnerSide,
    loserSide,
    eliminatedId,
    remaining: battle.teams[loserSide].length - battle.eliminated[loserSide].length,
    incomingId: null,
    over,
    line: TEAM_ELIMINATION_LINES[(battle.eliminated[0].length + battle.eliminated[1].length - 1) % TEAM_ELIMINATION_LINES.length],
  };
  if (over) {
    battle.over = true;
    battle.winnerSide = winnerSide;
  } else {
    battle.active[loserSide] += 1;
    battle.carryHealth[loserSide] = 100;
    battle.carryMeter[loserSide] = 0;
    battle.bout += 1;
    result.incomingId = battle.teams[loserSide][battle.active[loserSide]];
  }
  battle.lastElimination = result;
  return result;
}

export function teamBattleSnapshot(battle) {
  if (!battle) return null;
  return {
    teams: battle.teams.map((team) => [...team]),
    active: [...battle.active],
    eliminated: battle.eliminated.map((list) => [...list]),
    carryHealth: [...battle.carryHealth],
    carryMeter: [...battle.carryMeter],
    bout: battle.bout,
    over: battle.over,
    winnerSide: battle.winnerSide,
    pair: currentTeamPair(battle),
    remaining: [teamFightersRemaining(battle, 0), teamFightersRemaining(battle, 1)],
    lastElimination: battle.lastElimination ? { ...battle.lastElimination } : null,
  };
}

// --------------------------------------------------------------------------
// Daily challenge — "The Daily Jawn". One identical seeded arcade run for
// everyone, fully offline: the date string alone decides the fighter, the
// opponent/stage order (via createArcadeRun's seed) and the single mutator.
// --------------------------------------------------------------------------

export const DAILY_RULES = Object.freeze({
  difficulty: "street",
  storageKey: "final-blow-daily",
});

// Local calendar date, Wordle-style: the run flips at the player's midnight.
// The caller computes this ONCE at run start (render-side) and threads the
// string everywhere — nothing downstream ever looks at the clock again.
export function dailyDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function previousDateString(dateString) {
  const noon = new Date(`${dateString}T12:00:00Z`);
  const before = new Date(noon.getTime() - 86_400_000);
  return before.toISOString().slice(0, 10);
}

export function createDailyPlan(dateString, fighterIds, { mutatorIds = MUTATOR_ORDER } = {}) {
  const date = String(dateString);
  const roster = [...new Set(fighterIds)];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Daily date must be YYYY-MM-DD, got: ${date}`);
  if (roster.length < 2) throw new Error("Daily challenge needs a roster.");
  const seed = hashSeed("FINAL-BLOW-DAILY", date);
  const fighterId = roster[hashSeed("FINAL-BLOW-DAILY-FIGHTER", date) % roster.length];
  const pool = normalizeMutators(mutatorIds);
  const mutator = pool.length ? pool[hashSeed("FINAL-BLOW-DAILY-MUTATOR", date) % pool.length] : null;
  return {
    date,
    seed,
    fighterId,
    mutator,
    difficulty: DAILY_RULES.difficulty,
    run: createArcadeRun(fighterId, roster, seed),
  };
}

export function dailyShareText({ date, fighterName, score, wins, bouts, cleared, streak, mutator } = {}) {
  const ladder = `${wins ?? 0}/${bouts ?? 0}`;
  const outcome = cleared ? `CLEARED ${ladder}` : `OUT AT ${ladder}`;
  const parts = [
    `FINAL BLOW · DAILY JAWN ${date}`,
    `${fighterName || "?"} · ${outcome}`,
    `${Math.round(score || 0).toLocaleString("en-US")} PTS`,
  ];
  if (mutator && MUTATORS[mutator]) parts.push(`HOUSE RULE: ${MUTATORS[mutator].name}`);
  if (Number(streak) > 0) parts.push(`STREAK ${streak}`);
  parts.push("jz237.github.io/jez237-site");
  return parts.join("\n");
}

// Streak bookkeeping for a completed daily. `previous` is the stored record
// (or null); returns the next record to persist. Clearing the full ladder on
// consecutive calendar days grows the streak; missing a day resets it to 1.
export function nextDailyRecord(previous, { date, score, wins, bouts, cleared } = {}) {
  const record = {
    date: String(date),
    played: true,
    cleared: Boolean(cleared),
    score: Math.max(0, Math.round(Number(score) || 0)),
    wins: Math.max(0, Math.round(Number(wins) || 0)),
    bouts: Math.max(0, Math.round(Number(bouts) || 0)),
    streak: 0,
    bestScore: Math.max(0, Math.round(Number(previous?.bestScore) || 0)),
    bestStreak: Math.max(0, Math.round(Number(previous?.bestStreak) || 0)),
    lastClearedDate: String(previous?.lastClearedDate || ""),
  };
  if (record.cleared) {
    const continued = previous?.lastClearedDate === previousDateString(record.date);
    record.streak = continued ? Math.max(1, Number(previous?.streak) || 0) + 1 : 1;
    record.lastClearedDate = record.date;
  } else {
    record.streak = 0;
  }
  record.bestScore = Math.max(record.bestScore, record.score);
  record.bestStreak = Math.max(record.bestStreak, record.streak);
  return record;
}

/**
 * 5.1 (sweep #32): the CPU's Block War roster. Three ids drawn from the
 * roster the player did NOT pick, shuffled with the supplied unit-interval
 * `random` so the draft is reproducible under a seeded rng and the QA hook.
 * The CPU never mirrors the player's team: with ten fighters there are always
 * seven candidates, and the guard below only matters for an unlocked-roster
 * edge case where fewer than three remain (it then fills from the picks).
 */
export function draftCpuTeam(pickedIds = [], rosterIds = [], random = Math.random, teamSize = TEAM_RULES.teamSize) {
  const picked = new Set(pickedIds);
  const pool = rosterIds.filter((id) => !picked.has(id));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.max(0, Math.min(0.999999, random())) * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  const team = pool.slice(0, teamSize);
  for (const id of pickedIds) {
    if (team.length >= teamSize) break;
    if (!team.includes(id)) team.push(id);
  }
  return team;
}
