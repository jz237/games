// Release 1.8 GRIND — progression logic: The Black Book achievement ledger,
// fight records accumulation, and per-fighter mastery ranks. Everything in
// here is pure and deterministic: no Date.now, no Math.random, no DOM, no sim
// reads. game.js OBSERVES the simulation at bounded points (round end,
// finisher end, run end — behind rollbackResimulating + dedupe guards) and
// feeds plain observation records into these functions; nothing here can ever
// write back into sim state, so the whole system is online-safe by shape.

const toCount = (value) => Math.max(0, Math.round(Number(value) || 0));

// ---------------------------------------------------------------------------
// Mastery ranks — bronze/silver/gold/onyx with Philly rank names. Points are
// derived from usage + wins so every match moves the needle a little and
// wins move it a lot.
// ---------------------------------------------------------------------------

export const MASTERY_TIERS = Object.freeze([
  Object.freeze({ id: "none", name: "UNRANKED", badge: "", min: 0 }),
  Object.freeze({ id: "bronze", name: "CORNER STORE CONTENDER", badge: "BRONZE", min: 60 }),
  Object.freeze({ id: "silver", name: "BLOCK CAPTAIN", badge: "SILVER", min: 300 }),
  Object.freeze({ id: "gold", name: "BROAD STREET LEGEND", badge: "GOLD", min: 900 }),
  Object.freeze({ id: "onyx", name: "PHILLY AFTER DARK IMMORTAL", badge: "ONYX", min: 2200 }),
]);

export function masteryPoints(fighterRecord) {
  if (!fighterRecord) return 0;
  const wins = toCount(fighterRecord.wins);
  const losses = toCount(fighterRecord.losses);
  const roundWins = toCount(fighterRecord.roundWins);
  const fatalities = toCount(fighterRecord.fatalities);
  const dizzies = toCount(fighterRecord.dizzies);
  const peakCombo = Math.min(25, toCount(fighterRecord.peakCombo));
  const damage = Math.min(50000, Math.max(0, Number(fighterRecord.damageDealt) || 0));
  return wins * 40 + losses * 8 + roundWins * 10 + fatalities * 15 + dizzies * 6
    + peakCombo * 3 + Math.floor(damage / 50);
}

export function masteryRank(fighterRecord) {
  const points = masteryPoints(fighterRecord);
  let tier = MASTERY_TIERS[0];
  for (const candidate of MASTERY_TIERS) {
    if (points >= candidate.min && candidate.min >= tier.min) tier = candidate;
  }
  const index = MASTERY_TIERS.indexOf(tier);
  const next = MASTERY_TIERS[index + 1] || null;
  return {
    id: tier.id,
    name: tier.name,
    badge: tier.badge,
    points,
    tierIndex: index,
    nextName: next?.name || null,
    nextAt: next?.min ?? null,
    toNext: next ? Math.max(0, next.min - points) : 0,
  };
}

// ---------------------------------------------------------------------------
// Fight records — persistent per-fighter + lifetime accumulation, written
// from match-end observations only.
// ---------------------------------------------------------------------------

export const RECORD_MODES = Object.freeze(["versus", "arcade", "survival", "team", "daily"]);

export function createFighterRecord() {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    rounds: 0,
    roundWins: 0,
    damageDealt: 0,
    damageTaken: 0,
    fatalities: 0,
    fatalityVariants: {},
    dizzies: 0,
    perfects: 0,
    peakCombo: 0,
    moveUses: {},
    modes: {},
  };
}

export function createRecordsStore() {
  return {
    version: 1,
    lifetime: {
      matches: 0,
      wins: 0,
      losses: 0,
      rounds: 0,
      roundWins: 0,
      damageDealt: 0,
      damageTaken: 0,
      fatalities: 0,
      perfects: 0,
      timeOverWins: 0,
    },
    fighters: {},
  };
}

function normalizeCountMap(raw) {
  const map = {};
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) {
      const count = toCount(value);
      if (count > 0) map[String(key)] = count;
    }
  }
  return map;
}

function normalizeFighterRecord(raw) {
  const record = createFighterRecord();
  if (!raw || typeof raw !== "object") return record;
  for (const field of ["matches", "wins", "losses", "rounds", "roundWins", "fatalities", "dizzies", "perfects", "peakCombo"]) {
    record[field] = toCount(raw[field]);
  }
  record.damageDealt = Math.max(0, Number(raw.damageDealt) || 0);
  record.damageTaken = Math.max(0, Number(raw.damageTaken) || 0);
  record.fatalityVariants = normalizeCountMap(raw.fatalityVariants);
  record.moveUses = normalizeCountMap(raw.moveUses);
  record.modes = {};
  if (raw.modes && typeof raw.modes === "object") {
    for (const [mode, tally] of Object.entries(raw.modes)) {
      record.modes[String(mode)] = { wins: toCount(tally?.wins), losses: toCount(tally?.losses) };
    }
  }
  return record;
}

// Tolerant load: any malformed/foreign JSON collapses back to a fresh store
// instead of crashing the boot path.
export function normalizeRecordsStore(raw) {
  const store = createRecordsStore();
  if (!raw || typeof raw !== "object") return store;
  const lifetime = raw.lifetime && typeof raw.lifetime === "object" ? raw.lifetime : {};
  for (const field of Object.keys(store.lifetime)) {
    store.lifetime[field] = field.startsWith("damage")
      ? Math.max(0, Number(lifetime[field]) || 0)
      : toCount(lifetime[field]);
  }
  if (raw.fighters && typeof raw.fighters === "object") {
    for (const [id, record] of Object.entries(raw.fighters)) {
      store.fighters[String(id)] = normalizeFighterRecord(record);
    }
  }
  return store;
}

/**
 * Fold one finished match observation into the records store. Returns the
 * mastery tier before/after so the caller can letter-slam rank-ups. The
 * observation is plain data assembled render-side:
 * { fighterId, mode, won, rounds, roundWins, damageDealt, damageTaken,
 *   fatalities, fatalityVariants: ["jez:0"...], dizzies, perfects, peakCombo,
 *   timeOverWin, moveUses: { action: count } }
 */
export function applyMatchToRecords(store, match) {
  if (!store || !match || !match.fighterId) return null;
  const id = String(match.fighterId);
  const fighter = store.fighters[id] || (store.fighters[id] = createFighterRecord());
  const before = masteryRank(fighter);
  const won = Boolean(match.won);
  const mode = RECORD_MODES.includes(match.mode) ? match.mode : "versus";
  fighter.matches += 1;
  fighter.wins += won ? 1 : 0;
  fighter.losses += won ? 0 : 1;
  fighter.rounds += toCount(match.rounds);
  fighter.roundWins += toCount(match.roundWins);
  fighter.damageDealt += Math.max(0, Number(match.damageDealt) || 0);
  fighter.damageTaken += Math.max(0, Number(match.damageTaken) || 0);
  fighter.fatalities += toCount(match.fatalities);
  fighter.dizzies += toCount(match.dizzies);
  fighter.perfects += toCount(match.perfects);
  fighter.peakCombo = Math.max(fighter.peakCombo, toCount(match.peakCombo));
  for (const variant of match.fatalityVariants || []) {
    const key = String(variant);
    fighter.fatalityVariants[key] = (fighter.fatalityVariants[key] || 0) + 1;
  }
  for (const [action, count] of Object.entries(match.moveUses || {})) {
    const uses = toCount(count);
    if (uses > 0) fighter.moveUses[String(action)] = (fighter.moveUses[String(action)] || 0) + uses;
  }
  const modeTally = fighter.modes[mode] || (fighter.modes[mode] = { wins: 0, losses: 0 });
  modeTally.wins += won ? 1 : 0;
  modeTally.losses += won ? 0 : 1;
  const lifetime = store.lifetime;
  lifetime.matches += 1;
  lifetime.wins += won ? 1 : 0;
  lifetime.losses += won ? 0 : 1;
  lifetime.rounds += toCount(match.rounds);
  lifetime.roundWins += toCount(match.roundWins);
  lifetime.damageDealt += Math.max(0, Number(match.damageDealt) || 0);
  lifetime.damageTaken += Math.max(0, Number(match.damageTaken) || 0);
  lifetime.fatalities += toCount(match.fatalities);
  lifetime.perfects += toCount(match.perfects);
  lifetime.timeOverWins += match.timeOverWin && won ? 1 : 0;
  const after = masteryRank(fighter);
  return { fighter, before, after, rankedUp: after.tierIndex > before.tierIndex };
}

// Deterministic favourite: highest use count, ties broken alphabetically so
// two loads of the same store always agree.
export function favoriteMove(fighterRecord) {
  const entries = Object.entries(fighterRecord?.moveUses || {});
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return { action: entries[0][0], count: entries[0][1] };
}

// "neonPalm" / "hit-heavy" -> "NEON PALM" / "HIT HEAVY" for the records UI.
export function prettyMoveName(action) {
  return String(action || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toUpperCase();
}

export function recordsSummary(store) {
  const lifetime = store?.lifetime || createRecordsStore().lifetime;
  let ranked = 0;
  let top = null;
  for (const [id, record] of Object.entries(store?.fighters || {})) {
    const rank = masteryRank(record);
    if (rank.tierIndex > 0) ranked += 1;
    if (!top || rank.points > top.points) top = { fighterId: id, tierId: rank.id, points: rank.points };
  }
  return {
    matches: lifetime.matches,
    wins: lifetime.wins,
    losses: lifetime.losses,
    rounds: lifetime.rounds,
    damageDealt: Math.round(lifetime.damageDealt),
    damageTaken: Math.round(lifetime.damageTaken),
    fatalities: lifetime.fatalities,
    perfects: lifetime.perfects,
    rankedFighters: ranked,
    topFighterId: top?.fighterId || null,
    topTierId: top?.tierId || "none",
    topPoints: top?.points || 0,
  };
}

// ---------------------------------------------------------------------------
// 5.3 (sweep #30 / #31): THE LAST FIGHT DIGEST.
//
// The records store answers "how have I done overall". Nothing answered "what
// just happened", which is the question a player actually has on the result
// screen and the one FIGHT SCHOOL needs in order to recommend anything. The
// digest is the single-match companion to the store: same shape rules (plain
// data, tolerant load, no clock, no sim reads), written once per match at the
// same fold point, kept in localStorage so the title screen can still coach
// after a reload.
//
// Damage is attributed at the damage sites themselves, because the health
// delta at round end cannot know WHAT took the health. One cause per landed
// hit, resolved in priority order — a blocked hit is chip whatever threw it,
// a throw is a throw, a stage weapon outranks the jawn that carried it, and
// only then do the levels and the kinds get a say.
// ---------------------------------------------------------------------------

export const DAMAGE_CAUSES = Object.freeze([
  "chip", "throw", "weapon", "jawn", "super", "special",
  "jumpIn", "low", "overhead", "heavy", "light",
]);

export const DAMAGE_CAUSE_LABELS = Object.freeze({
  chip: "CHIP THROUGH YOUR GUARD",
  throw: "THROWS",
  weapon: "STAGE WEAPONS",
  jawn: "THROWN JAWNS",
  super: "SUPERS",
  special: "SPECIALS",
  jumpIn: "JUMP-INS",
  low: "LOWS AND SWEEPS",
  overhead: "OVERHEADS",
  heavy: "HEAVY NORMALS",
  light: "LIGHT NORMALS",
});

// The one place that turns an attack instance's flags into a cause name.
// Order is the priority order: the first true wins.
export function classifyDamageCause({
  blocked = false, throwMove = false, weapon = false, throwable = false,
  superMove = false, kind = "", level = "",
} = {}) {
  if (blocked) return "chip";
  if (throwMove || kind === "throw" || level === "throw") return "throw";
  if (weapon) return "weapon";
  if (throwable) return "jawn";
  if (superMove) return "super";
  if (kind === "special") return "special";
  if (level === "air") return "jumpIn";
  if (level === "low") return "low";
  if (level === "overhead") return "overhead";
  if (kind === "heavy") return "heavy";
  return "light";
}

export const FIGHT_DIGEST_VERSION = 1;

const DIGEST_COUNTERS = Object.freeze([
  "hitsTaken", "blocks", "perfectGuards", "throwsTaken", "knockdownsTaken",
  "techs", "specialsLanded", "supersLanded", "exLanded", "throwablesUsed",
  "weaponPickups", "heavyLanded", "lightLanded", "hitsLanded", "rounds",
]);

const DIGEST_AMOUNTS = Object.freeze([
  "damageTaken", "damageDealt", "meterSpent", "meterPeak",
]);

export function createFightDigest(overrides = {}) {
  const digest = {
    version: FIGHT_DIGEST_VERSION,
    fighterId: "",
    opponentId: "",
    mode: "versus",
    won: false,
    weaponOffered: false,
    damageBy: {},
    hitsBy: {},
  };
  for (const field of DIGEST_COUNTERS) digest[field] = 0;
  for (const field of DIGEST_AMOUNTS) digest[field] = 0;
  return Object.assign(digest, normalizeFightDigest({ ...digest, ...overrides }));
}

// Tolerant load, exactly like normalizeRecordsStore: any malformed or foreign
// JSON collapses to a zeroed digest rather than throwing on the boot path.
export function normalizeFightDigest(raw) {
  const digest = {
    version: FIGHT_DIGEST_VERSION,
    fighterId: String(raw?.fighterId || ""),
    opponentId: String(raw?.opponentId || ""),
    mode: RECORD_MODES.includes(raw?.mode) ? raw.mode : "versus",
    won: Boolean(raw?.won),
    weaponOffered: Boolean(raw?.weaponOffered),
    damageBy: {},
    hitsBy: {},
  };
  for (const field of DIGEST_COUNTERS) digest[field] = toCount(raw?.[field]);
  for (const field of DIGEST_AMOUNTS) digest[field] = Math.max(0, Number(raw?.[field]) || 0);
  for (const cause of DAMAGE_CAUSES) {
    const amount = Math.max(0, Number(raw?.damageBy?.[cause]) || 0);
    const hits = toCount(raw?.hitsBy?.[cause]);
    if (amount > 0) digest.damageBy[cause] = amount;
    if (hits > 0) digest.hitsBy[cause] = hits;
  }
  return digest;
}

/** Fold one landed hit on the player into the digest. Unknown causes are dropped. */
export function noteFightDamage(digest, cause, amount = 0) {
  if (!digest || !DAMAGE_CAUSES.includes(cause)) return digest;
  const value = Math.max(0, Number(amount) || 0);
  digest.hitsBy[cause] = (digest.hitsBy[cause] || 0) + 1;
  digest.hitsTaken += 1;
  if (value > 0) digest.damageBy[cause] = (digest.damageBy[cause] || 0) + value;
  return digest;
}

/**
 * The biggest single source of damage taken. Ties break on DAMAGE_CAUSES
 * order (chip first, light last) so two loads of the same digest always agree.
 * Returns null when nothing landed.
 */
export function topDamageCause(digest) {
  let best = null;
  const total = DAMAGE_CAUSES.reduce((sum, cause) => sum + (digest?.damageBy?.[cause] || 0), 0);
  for (const cause of DAMAGE_CAUSES) {
    const amount = digest?.damageBy?.[cause] || 0;
    if (amount <= 0) continue;
    if (!best || amount > best.amount) {
      best = {
        cause,
        label: DAMAGE_CAUSE_LABELS[cause],
        amount,
        hits: digest.hitsBy?.[cause] || 0,
        share: total > 0 ? amount / total : 0,
      };
    }
  }
  return best;
}

/**
 * The result screen's "what just happened" line. One sentence, no jargon, and
 * it never lies about a fight where nothing landed.
 */
export function fightRecapLine(digest) {
  if (!digest || digest.hitsTaken <= 0 || !(digest.damageTaken > 0)) {
    return digest && digest.won
      ? "WHAT JUST HAPPENED · THEY NEVER TOUCHED YOU. FLAWLESS."
      : "WHAT JUST HAPPENED · NOTHING LANDED ON YOU WORTH COUNTING.";
  }
  const top = topDamageCause(digest);
  if (!top) return "WHAT JUST HAPPENED · NOTHING LANDED ON YOU WORTH COUNTING.";
  const share = Math.round(top.share * 100);
  const hits = top.hits === 1 ? "ONE OF THEM" : `${top.hits} OF THEM`;
  return `WHAT JUST HAPPENED · ${share}% OF THE ${Math.round(digest.damageTaken)} DAMAGE YOU TOOK CAME FROM ${top.label} · ${hits}.`;
}

// ---------------------------------------------------------------------------
// The Black Book — the Commissioner's ledger of everything he never wanted
// you to finish. ~30 entries, each a pure predicate over accumulated
// observation counters. Locked entries render as redacted lines.
// ---------------------------------------------------------------------------

export const BLACK_BOOK_RULES = Object.freeze({
  // Wave 17: the Pinelands Devil makes nine base fighters (the Commissioner
  // stays outside the set-collection counts — his card is the secret tenth).
  fighters: 9,
  stages: 6,
  fatalityVariants: 18,
  matchGrabTechs: 5,
  matchDizzies: 3,
  matchSupers: 3,
  matchPerfectRounds: 2,
  comboHits: 10,
  survivalStreakFirst: 5,
  survivalStreakSecond: 10,
  dailyStreak: 3,
  runScore: 250000,
  perfectGuards: 10,
  guardCrushes: 10,
  matchWinsKnown: 10,
  matchWinsFixture: 50,
});

export function createBlackBookProgress() {
  return {
    version: 1,
    unlocked: {},
    lastUnlock: "",
    sets: {
      throwables: {},
      weaponStages: {},
      fatalityVariants: {},
      arcadeFighters: {},
      stagesFought: {},
    },
    tallies: {
      matchesWon: 0,
      perfectGuards: 0,
      guardCrushes: 0,
      taunts: 0,
      wallBounces: 0,
      exThrowables: 0,
      fatalities: 0,
      bossFatalities: 0,
      perfectRounds: 0,
      timeOverWins: 0,
      chipWins: 0,
      noJumpRoundWins: 0,
      arcadeClears: 0,
      finalArcadeClears: 0,
      dailyClears: 0,
      teamSweeps: 0,
      tableTops: 0,
      cinemaActivations: 0,
      // R1.9 SCHOOL & POCKET: FIGHT SCHOOL graduations.
      schoolGraduations: 0,
    },
    best: {
      matchTechs: 0,
      matchDizzies: 0,
      matchSupers: 0,
      matchPerfectRounds: 0,
      combo: 0,
      survivalStreak: 0,
      dailyStreak: 0,
      runScore: 0,
    },
  };
}

export function normalizeBlackBookStore(raw) {
  const store = createBlackBookProgress();
  if (!raw || typeof raw !== "object") return store;
  if (raw.unlocked && typeof raw.unlocked === "object") {
    for (const [id, date] of Object.entries(raw.unlocked)) store.unlocked[String(id)] = String(date || "");
  }
  store.lastUnlock = typeof raw.lastUnlock === "string" ? raw.lastUnlock : "";
  for (const group of Object.keys(store.sets)) {
    const source = raw.sets?.[group];
    if (!source || typeof source !== "object") continue;
    for (const key of Object.keys(source)) {
      if (source[key]) store.sets[group][String(key)] = 1;
    }
  }
  for (const field of Object.keys(store.tallies)) store.tallies[field] = toCount(raw.tallies?.[field]);
  for (const field of Object.keys(store.best)) store.best[field] = toCount(raw.best?.[field]);
  return store;
}

const setSize = (set) => Object.keys(set || {}).length;

/**
 * Fold one observation into the ledger's counters. Observations are plain
 * records produced by game.js at guarded, deduped hook points:
 *  { type: "event", kind, fighterId?, stage? }
 *  { type: "roundEnd", won, perfect, timeOver, chip, jumped, combo, fatality? }
 *  { type: "matchEnd", won, stage, techs, dizzies, supers, perfectRounds, runScore }
 *  { type: "runEnd", kind: "arcade"|"survival"|"daily"|"team", ... }
 *  { type: "highScore", rank }
 */
export function blackBookObserve(progress, observation) {
  if (!progress || !observation) return progress;
  const tallies = progress.tallies;
  const best = progress.best;
  switch (observation.type) {
    case "event": {
      switch (observation.kind) {
        case "perfectGuard": tallies.perfectGuards += 1; break;
        case "guardCrush": tallies.guardCrushes += 1; break;
        case "taunt": tallies.taunts += 1; break;
        case "wallBounce": tallies.wallBounces += 1; break;
        case "exThrowable": tallies.exThrowables += 1; break;
        case "cinema3d": tallies.cinemaActivations += 1; break;
        case "fightSchool": tallies.schoolGraduations += 1; break;
        case "throwableLand":
          if (observation.fighterId) progress.sets.throwables[String(observation.fighterId)] = 1;
          break;
        case "weaponKo":
          if (observation.stage) progress.sets.weaponStages[String(observation.stage)] = 1;
          break;
        default: break;
      }
      break;
    }
    case "roundEnd": {
      best.combo = Math.max(best.combo, toCount(observation.combo));
      if (observation.fatality) {
        tallies.fatalities += 1;
        const { fighterId, variant, opponentIsBoss } = observation.fatality;
        if (fighterId != null && variant != null) {
          progress.sets.fatalityVariants[`${fighterId}:${variant}`] = 1;
        }
        if (opponentIsBoss) tallies.bossFatalities += 1;
      }
      if (!observation.won) break;
      if (!observation.jumped) tallies.noJumpRoundWins += 1;
      if (observation.perfect) tallies.perfectRounds += 1;
      if (observation.timeOver) {
        tallies.timeOverWins += 1;
        if (observation.chip) tallies.chipWins += 1;
      }
      break;
    }
    case "matchEnd": {
      if (observation.stage) progress.sets.stagesFought[String(observation.stage)] = 1;
      best.matchTechs = Math.max(best.matchTechs, toCount(observation.techs));
      best.matchDizzies = Math.max(best.matchDizzies, toCount(observation.dizzies));
      best.matchSupers = Math.max(best.matchSupers, toCount(observation.supers));
      best.matchPerfectRounds = Math.max(best.matchPerfectRounds, toCount(observation.perfectRounds));
      best.runScore = Math.max(best.runScore, toCount(observation.runScore));
      if (observation.won) tallies.matchesWon += 1;
      break;
    }
    case "runEnd": {
      switch (observation.kind) {
        case "arcade":
          tallies.arcadeClears += 1;
          if (observation.finalDifficulty) tallies.finalArcadeClears += 1;
          if (observation.fighterId) progress.sets.arcadeFighters[String(observation.fighterId)] = 1;
          break;
        case "survival":
          best.survivalStreak = Math.max(best.survivalStreak, toCount(observation.wins));
          break;
        case "daily":
          if (observation.cleared) tallies.dailyClears += 1;
          best.dailyStreak = Math.max(best.dailyStreak, toCount(observation.streak));
          break;
        case "team":
          if (observation.won && observation.sweep) tallies.teamSweeps += 1;
          break;
        default: break;
      }
      break;
    }
    case "highScore": {
      if (observation.rank === 0) tallies.tableTops += 1;
      break;
    }
    default: break;
  }
  return progress;
}

// The ledger itself. `line` is the unlocked description; `hint` is the
// redacted teaser shown before the entry is earned.
export const BLACK_BOOK_ENTRIES = Object.freeze([
  {
    id: "first-entry",
    title: "FIRST ENTRY IN RED",
    line: "Won a match. The Commissioner opened a fresh page and hated every word.",
    hint: "Win one match. Any street, any rules.",
    test: (p) => p.tallies.matchesWon >= 1,
  },
  {
    id: "known-on-the-block",
    title: "KNOWN ON THE BLOCK",
    line: `Won ${BLACK_BOOK_RULES.matchWinsKnown} matches. Corner stores start nodding when you walk in.`,
    hint: `Win ${BLACK_BOOK_RULES.matchWinsKnown} matches.`,
    test: (p) => p.tallies.matchesWon >= BLACK_BOOK_RULES.matchWinsKnown,
  },
  {
    id: "neighborhood-fixture",
    title: "NEIGHBORHOOD FIXTURE",
    line: `Won ${BLACK_BOOK_RULES.matchWinsFixture} matches. They name sandwiches after people like you.`,
    hint: `Win ${BLACK_BOOK_RULES.matchWinsFixture} matches.`,
    test: (p) => p.tallies.matchesWon >= BLACK_BOOK_RULES.matchWinsFixture,
  },
  {
    id: "south-philly-stance",
    title: "SOUTH PHILLY STANCE",
    line: "Won a round without ever leaving the pavement. Both feet, whole time.",
    hint: "Win a round without jumping.",
    test: (p) => p.tallies.noJumpRoundWins >= 1,
  },
  {
    id: "not-a-scratch",
    title: "NOT A SCRATCH",
    line: "Took a round perfect. The other corner is still reviewing the tape.",
    hint: "Win a round without taking damage.",
    test: (p) => p.tallies.perfectRounds >= 1,
  },
  {
    id: "untouched-after-dark",
    title: "UNTOUCHED AFTER DARK",
    line: `Stacked ${BLACK_BOOK_RULES.matchPerfectRounds} perfect rounds in one match. Immaculate. Insulting.`,
    hint: `Win ${BLACK_BOOK_RULES.matchPerfectRounds} perfect rounds in a single match.`,
    test: (p) => p.best.matchPerfectRounds >= BLACK_BOOK_RULES.matchPerfectRounds,
  },
  {
    id: "judges-table",
    title: "THE JUDGES' TABLE",
    line: "Let the clock run out and took the decision. Paperwork wins fights too.",
    hint: "Win a round on a time-over decision.",
    test: (p) => p.tallies.timeOverWins >= 1,
  },
  {
    id: "death-by-papercuts",
    title: "DEATH BY PAPERCUTS",
    line: "Closed a decision round with chip damage as the last word. A thousand tiny receipts.",
    hint: "Win by chip: take a decision where your final damage was chip.",
    test: (p) => p.tallies.chipWins >= 1,
  },
  {
    id: "split-second",
    title: "SPLIT SECOND",
    line: "First Perfect Guard in the ledger. Blocked it the exact moment it mattered.",
    hint: "Land one Perfect Guard.",
    test: (p) => p.tallies.perfectGuards >= 1,
  },
  {
    id: "parry-in-the-park",
    title: "PARRY IN THE PARK",
    line: `${BLACK_BOOK_RULES.perfectGuards} Perfect Guards logged. Defense so clean it counts as offense.`,
    hint: `Land ${BLACK_BOOK_RULES.perfectGuards} Perfect Guards.`,
    test: (p) => p.tallies.perfectGuards >= BLACK_BOOK_RULES.perfectGuards,
  },
  {
    id: "door-breaker",
    title: "DOOR BREAKER",
    line: `Shattered ${BLACK_BOOK_RULES.guardCrushes} guards. Locks are a suggestion.`,
    hint: `Crush ${BLACK_BOOK_RULES.guardCrushes} guards.`,
    test: (p) => p.tallies.guardCrushes >= BLACK_BOOK_RULES.guardCrushes,
  },
  {
    id: "greased-pole",
    title: "THE GREASED POLE",
    line: `Teched ${BLACK_BOOK_RULES.matchGrabTechs} grabs in one match. Nobody's holding onto you tonight.`,
    hint: `Tech ${BLACK_BOOK_RULES.matchGrabTechs} grabs in a single match.`,
    test: (p) => p.best.matchTechs >= BLACK_BOOK_RULES.matchGrabTechs,
  },
  {
    id: "showboat",
    title: "SHOWBOAT ON SOUTH STREET",
    line: "Taunted mid-fight. Grit earned, respect optional.",
    hint: "Taunt an opponent.",
    test: (p) => p.tallies.taunts >= 1,
  },
  {
    id: "off-the-rowhome-wall",
    title: "OFF THE ROWHOME WALL",
    line: "Converted a corner wall-bounce. The architecture fights for you now.",
    hint: "Land a wall-bounce conversion in the corner.",
    test: (p) => p.tallies.wallBounces >= 1,
  },
  {
    id: "paid-in-grit",
    title: "PAID IN GRIT",
    line: "Spent meter on an EX throwable. Premium delivery, no refunds.",
    hint: "Throw an EX-enhanced personal object.",
    test: (p) => p.tallies.exThrowables >= 1,
  },
  {
    id: "every-jawn-thrown",
    title: "EVERY JAWN THROWN",
    line: `Landed all ${BLACK_BOOK_RULES.fighters} personal throwables. Each fighter's jawn, delivered on time.`,
    hint: `Land the signature throwable of all ${BLACK_BOOK_RULES.fighters} fighters.`,
    test: (p) => setSize(p.sets.throwables) >= BLACK_BOOK_RULES.fighters,
  },
  {
    id: "street-furnished",
    title: "STREET FURNISHED",
    line: `Scored a stage-weapon KO on all ${BLACK_BOOK_RULES.stages} stages. The city keeps leaving you presents.`,
    hint: `Finish a round with a stage weapon on every stage (${BLACK_BOOK_RULES.stages}).`,
    test: (p) => setSize(p.sets.weaponStages) >= BLACK_BOOK_RULES.stages,
  },
  {
    id: "seeing-pigeons",
    title: "SEEING PIGEONS",
    line: `Dizzied an opponent ${BLACK_BOOK_RULES.matchDizzies} times in one match. They'll hear the birds all week.`,
    hint: `Dizzy the opponent ${BLACK_BOOK_RULES.matchDizzies} times in a single match.`,
    test: (p) => p.best.matchDizzies >= BLACK_BOOK_RULES.matchDizzies,
  },
  {
    id: "ten-deep-on-ridge",
    title: "TEN DEEP ON RIDGE AVE",
    line: `Strung a ${BLACK_BOOK_RULES.comboHits}-hit combo. One continuous bad decision for the other corner.`,
    hint: `Land a ${BLACK_BOOK_RULES.comboHits}-hit combo.`,
    test: (p) => p.best.combo >= BLACK_BOOK_RULES.comboHits,
  },
  {
    id: "grit-spender",
    title: "BIG GRIT ENERGY",
    line: `Landed ${BLACK_BOOK_RULES.matchSupers} supers in one match. The meter was a to-do list.`,
    hint: `Land ${BLACK_BOOK_RULES.matchSupers} super moves in a single match.`,
    test: (p) => p.best.matchSupers >= BLACK_BOOK_RULES.matchSupers,
  },
  {
    id: "inked-in-red",
    title: "INKED IN RED",
    line: "Performed a Final Blow. The page still smells like copper.",
    hint: "Perform any Final Blow finisher.",
    test: (p) => p.tallies.fatalities >= 1,
  },
  {
    id: "double-feature",
    title: "DOUBLE FEATURE",
    line: `Performed all ${BLACK_BOOK_RULES.fatalityVariants} Final Blow variants — both endings, every fighter.`,
    hint: `See both finisher variants for all ${BLACK_BOOK_RULES.fighters} fighters.`,
    test: (p) => setSize(p.sets.fatalityVariants) >= BLACK_BOOK_RULES.fatalityVariants,
  },
  {
    id: "closed-session",
    title: "CLOSED SESSION",
    line: "Finished the Commissioner with a Final Blow. Motion carried.",
    hint: "Perform a Final Blow on the boss.",
    test: (p) => p.tallies.bossFatalities >= 1,
  },
  {
    id: "toured-the-city",
    title: "TOURED THE CITY",
    line: `Fought on all ${BLACK_BOOK_RULES.stages} stages, from the El platform to international waters.`,
    hint: `Fight a match on every stage (${BLACK_BOOK_RULES.stages}).`,
    test: (p) => setSize(p.sets.stagesFought) >= BLACK_BOOK_RULES.stages,
  },
  {
    id: "ladder-climbed",
    title: "THE LADDER CLIMBED",
    line: "Cleared the arcade ladder. Eight names crossed out, one book opened.",
    hint: "Beat arcade mode.",
    test: (p) => p.tallies.arcadeClears >= 1,
  },
  {
    // Wave 17: nine base fighters now — the id stays stable so earned
    // unlocks survive, the copy counts the new roster.
    id: "eight-signatures",
    title: "NINE SIGNATURES",
    line: `Cleared arcade with all ${BLACK_BOOK_RULES.fighters} fighters. Every ending, earned in person.`,
    hint: `Beat arcade with all ${BLACK_BOOK_RULES.fighters} fighters.`,
    test: (p) => setSize(p.sets.arcadeFighters) >= BLACK_BOOK_RULES.fighters,
  },
  {
    id: "native-son",
    title: "NATIVE SON",
    line: "Cleared the ladder as the Pinelands Devil. South Jersey finally sent its own.",
    hint: "Beat arcade with the Pinelands Devil.",
    test: (p) => Boolean(p.sets.arcadeFighters.devil),
  },
  {
    id: "the-book-closes",
    title: "THE BOOK CLOSES",
    line: "Beat the arcade ladder on FINAL difficulty. The Commissioner retired the pen.",
    hint: "Beat arcade on FINAL difficulty.",
    test: (p) => p.tallies.finalArcadeClears >= 1,
  },
  {
    id: "keepers-keys",
    title: "KEEPER'S KEYS",
    line: "Took the Commissioner's keys on FINAL difficulty. The tenth card in the deck is his — and now it deals for you.",
    hint: "Beat arcade on FINAL difficulty to claim the secret ninth fighter.",
    test: (p) => p.tallies.finalArcadeClears >= 1,
  },
  {
    id: "five-deep",
    title: "FIVE DEEP IN THE GAUNTLET",
    line: `${BLACK_BOOK_RULES.survivalStreakFirst} straight Gauntlet wins. The line behind you keeps growing.`,
    hint: `Reach a ${BLACK_BOOK_RULES.survivalStreakFirst}-win survival streak.`,
    test: (p) => p.best.survivalStreak >= BLACK_BOOK_RULES.survivalStreakFirst,
  },
  {
    id: "double-digits-after-dark",
    title: "DOUBLE DIGITS AFTER DARK",
    line: `${BLACK_BOOK_RULES.survivalStreakSecond} straight Gauntlet wins. The block ran out of challengers twice.`,
    hint: `Reach a ${BLACK_BOOK_RULES.survivalStreakSecond}-win survival streak.`,
    test: (p) => p.best.survivalStreak >= BLACK_BOOK_RULES.survivalStreakSecond,
  },
  {
    id: "clean-sweep",
    title: "CLEAN SWEEP ON THE BLOCK",
    line: "Won a Block War 3-0. Three walked in, three walked home, none of them yours.",
    hint: "Win a team battle without losing a fighter.",
    test: (p) => p.tallies.teamSweeps >= 1,
  },
  {
    id: "one-a-day",
    title: "ONE-A-DAY",
    line: "Cleared a Daily Jawn. Same run as everybody else — you just did it better.",
    hint: "Clear the Daily Jawn ladder.",
    test: (p) => p.tallies.dailyClears >= 1,
  },
  {
    id: "three-straight-mornings",
    title: "THREE STRAIGHT MORNINGS",
    line: `A ${BLACK_BOOK_RULES.dailyStreak}-day Daily Jawn streak. A routine now. A problem for everyone else.`,
    hint: `Hold a ${BLACK_BOOK_RULES.dailyStreak}-day daily streak.`,
    test: (p) => p.best.dailyStreak >= BLACK_BOOK_RULES.dailyStreak,
  },
  {
    id: "quarter-million-row",
    title: "QUARTER MILLION ROW",
    line: `Banked a ${BLACK_BOOK_RULES.runScore.toLocaleString("en-US")}-point run. The tally screen needed a second breath.`,
    hint: `Score ${BLACK_BOOK_RULES.runScore.toLocaleString("en-US")} points in one run.`,
    test: (p) => p.best.runScore >= BLACK_BOOK_RULES.runScore,
  },
  {
    id: "name-in-lights",
    title: "NAME IN LIGHTS",
    line: "Topped the high-score table. Three letters, first row, no argument.",
    hint: "Take the #1 spot on the score table.",
    test: (p) => p.tallies.tableTops >= 1,
  },
  {
    id: "the-picture-show",
    title: "THE PICTURE SHOW",
    line: "Rolled the fight in CINEMA 3D. Philly never looked so expensive.",
    hint: "Switch on CINEMA 3D for the first time.",
    test: (p) => p.tallies.cinemaActivations >= 1,
  },
  {
    id: "the-graduate",
    title: "THE GRADUATE",
    line: "Finished every FIGHT SCHOOL lesson. The corner man finally cracked a smile.",
    hint: "Graduate FIGHT SCHOOL.",
    test: (p) => p.tallies.schoolGraduations >= 1,
  },
].map(Object.freeze));

export function blackBookEntry(id) {
  return BLACK_BOOK_ENTRIES.find((entry) => entry.id === id) || null;
}

/**
 * Evaluate every locked entry against the accumulated progress. Newly passing
 * entries are stamped into progress.unlocked with the caller-supplied date
 * string and returned (in ledger order) for toasts.
 */
export function evaluateBlackBook(progress, dateString = "") {
  if (!progress) return [];
  const fresh = [];
  for (const entry of BLACK_BOOK_ENTRIES) {
    if (progress.unlocked[entry.id]) continue;
    let passed = false;
    try {
      passed = Boolean(entry.test(progress));
    } catch {
      passed = false;
    }
    if (!passed) continue;
    progress.unlocked[entry.id] = String(dateString || "");
    progress.lastUnlock = entry.id;
    fresh.push(entry);
  }
  return fresh;
}

export function blackBookSummary(progress) {
  return {
    unlocked: setSize(progress?.unlocked),
    total: BLACK_BOOK_ENTRIES.length,
    lastUnlock: progress?.lastUnlock || null,
  };
}
