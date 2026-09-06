// ---------------------------------------------------------------------------
// v5.1 #35 — ART READINESS: the pure half of the first-fight loading story.
//
// The first fight of a session on a phone used to race its own art: 8-14 MB
// of sheets started downloading at makeFighter against a 2.25 s intro, the
// motion banks were requested before the unified family (whose gate flips a
// fighter's ENTIRE vocabulary on one tick), and nothing held the intro. Over
// cellular the fight opened on base cells and popped bank by bank for 5-30 s
// — the cross-generation strobe the one-generation law removed from the art,
// delivered by the network.
//
// game.js owns the Image objects, the manifest gates and the intro clock; this
// module owns the decisions so they can be unit-tested without a DOM: which
// sheets a fighter needs before FIGHT! and in what request order, what
// "ready" means for one sheet, and when a capped hold releases. Nothing here
// touches the simulation: the hold freezes the fixed-step clock from outside
// (loop() hands it zero seconds), so the tick stream a replay or a checksum
// sees is identical with or without it.
// ---------------------------------------------------------------------------

/** How long the intro may stall waiting for both fighters' unified family. */
export const INTRO_ART_HOLD_MS = 1500;

/**
 * Request order. The unified family first — it is the all-or-nothing gate —
 * then the per-beat motion banks whose fallbacks cost one beat each, then
 * the bonus banks. `priority` is the img.fetchPriority hint: the browser's
 * scheduler puts a "high" sheet ahead of the stage plate and the crowd, and
 * a "low" one behind everything the first fight actually needs.
 */
export const PRELOAD_PLAN = Object.freeze([
  Object.freeze({ bank: "unified", gate: "whole", priority: "high" }),
  Object.freeze({ bank: "ext", gate: "ext", priority: "high" }),
  Object.freeze({ bank: "ext2", gate: "ext2", priority: "high" }),
  Object.freeze({ bank: "ext3", gate: "ext3", priority: "auto" }),
  Object.freeze({ bank: "ext4", gate: "ext4", priority: "auto" }),
  // v5.2: the locomotion sheet joins the family — the dash is the first thing
  // a player does, so it must not pop in bank by bank after FIGHT!.
  Object.freeze({ bank: "ext5", gate: "ext5", priority: "auto" }),
  Object.freeze({ bank: "motion", gate: null, priority: "auto" }),
  Object.freeze({ bank: "motion2", gate: null, priority: "auto" }),
  Object.freeze({ bank: "motion3", gate: "motion3", priority: "low" }),
  Object.freeze({ bank: "walk", gate: "walk", priority: "low" }),
]);

/** The banks whose decode the intro waits for: the unified family only. */
export const READINESS_BANKS = Object.freeze(PRELOAD_PLAN.slice(0, 6).map((entry) => entry.bank));

/**
 * The sheets one fighter needs before the first fight tick, from his manifest
 * gates (`gates.whole`, `gates.ext`, ...). A fighter with no unified block —
 * or one whose manifest has not arrived — needs nothing from the family, and
 * the caller reports the manifest itself as the pending item in that case.
 */
export function unifiedFamilyFor(gates) {
  if (!gates) return [];
  return PRELOAD_PLAN
    .filter((entry) => READINESS_BANKS.includes(entry.bank) && Boolean(gates[entry.gate]))
    .map((entry) => entry.bank);
}

/**
 * One sheet's state. `drawable` is the same predicate the drawable gates use
 * (complete && naturalWidth, or the padded ext canvas existing); `decodeState`
 * is what the decode promise reported. A failed request must count as settled
 * — otherwise a 404 would hold every intro to the cap.
 */
export function classifySheet({ drawable = false, decodeState = "" } = {}) {
  if (drawable) return "ready";
  if (decodeState === "failed") return "failed";
  return "pending";
}

/**
 * Fold per-sheet entries ({ name, drawable, decodeState }) into the readiness
 * summary the hold and the QA snapshot both read.
 */
export function readinessSummary(entries) {
  const pending = [];
  const failed = [];
  for (const entry of entries || []) {
    const state = classifySheet(entry);
    if (state === "pending") pending.push(entry.name);
    else if (state === "failed") failed.push(entry.name);
  }
  return { ready: pending.length === 0, pending, failed };
}

/**
 * Whether a hold that started at `startedAt` is still holding at `now`.
 * Releases the moment nothing is pending, at the cap, or when the intro is
 * gone (a skip, a pause-to-select, a screen change) — the hold can never
 * outlive the thing it was holding for.
 */
export function holdDecision({ startedAt = 0, now = 0, capMs = INTRO_ART_HOLD_MS, pendingCount = 0, inIntro = true } = {}) {
  const elapsed = Math.max(0, now - startedAt);
  if (!inIntro) return { hold: false, reason: "left", elapsed };
  if (pendingCount <= 0) return { hold: false, reason: "ready", elapsed };
  if (elapsed >= capMs) return { hold: false, reason: "capped", elapsed };
  return { hold: true, reason: "holding", elapsed };
}

/**
 * The FIGHT! call is a wall-clock timer armed at the top of the intro; a hold
 * that froze the sim for `heldMs` must push it by the same amount or the
 * banner lands before the fighters can move. Answers the delay to re-arm
 * with from `now`, never negative.
 */
export function shiftedAnnouncementDelay({ armedAt = 0, delay = 0 } = {}, heldMs = 0, now = 0) {
  return Math.max(0, armedAt + delay + Math.max(0, heldMs) - now);
}

/**
 * The ids a select screen should warm for the matchup it is showing: the two
 * highlighted seats (or the whole Block War roster), de-duplicated, with the
 * arcade boss substituted when the ladder has reached him.
 */
export function matchupPreloadIds({ picks = [], roster = [], teamPicks = null, bossId = "", bossActive = false } = {}) {
  const ids = [];
  if (teamPicks) {
    for (const team of teamPicks) for (const id of team || []) ids.push(id);
  }
  picks.forEach((index, seat) => {
    const id = seat === 1 && bossActive && bossId ? bossId : roster[index]?.id;
    if (id) ids.push(id);
  });
  return [...new Set(ids.filter((id) => typeof id === "string" && id))];
}
