// ===========================================================================
// 5.4 FIGHT NIGHT — THE SESSION LAYER (demo sweep #11 / #14 / #15 / #16 / #25).
//
// Everything that CARRIES ACROSS exhibitions: the card of the night (which
// bout of the card this cycle is, and what format it runs), the session
// ledger (wins, losses, streaks, round scores per fighter), the standings
// board that survives a reload (localStorage, keyed by build), the NEXT UP
// panel's text and the sign-off line that bridges one bout into the next.
//
// All of it is presentation/meta on the demoSession pattern: pure functions
// over plain data, never read by the sim, never snapshotted into the
// checksummed state, and every game.js call site is gated on the demo. The
// one thing here the SIM does read is the bout's `roundsToWin` — through
// state.matchRules, exactly the way the ONE-ROUND SHOWDOWN mutator sets it —
// and only under state.mode === "demo" (pinned in tests/demo-session.test.mjs).
// ===========================================================================

/** Bouts per card of the night. */
export const DEMO_CARD_BOUTS = 6;

// The card's shape. Four one-round QUICK BOUTS on the undercard (a passer-by
// gets a result inside ~40 s instead of 65-141 s), a best-of-three CO-MAIN,
// and the best-of-five MAIN EVENT to close the card. Measured on the 5.4
// head every one of 48 traced exhibitions was a best-of-three (65% went to
// three rounds) and the loop had no rhythm at all.
export const DEMO_BOUT_KINDS = Object.freeze({
  quick: Object.freeze({ kind: "quick", label: "QUICK BOUT", roundsToWin: 1, format: "BEST OF 1" }),
  "co-main": Object.freeze({ kind: "co-main", label: "CO-MAIN EVENT", roundsToWin: 2, format: "BEST OF 3" }),
  main: Object.freeze({ kind: "main", label: "MAIN EVENT", roundsToWin: 3, format: "BEST OF 5" }),
});

/**
 * Which bout of which card a cycle is, and the format it runs. Pure on the
 * cycle number so the director, the HUD, the result card and the tests all
 * derive the same answer; `kind` forces a format (the QA show override).
 */
export function demoBoutPlan(cycle = 1, kind = null) {
  const number = Math.max(1, Math.floor(Number(cycle) || 1));
  const slot = ((number - 1) % DEMO_CARD_BOUTS) + 1;
  const card = Math.floor((number - 1) / DEMO_CARD_BOUTS) + 1;
  const natural = slot === DEMO_CARD_BOUTS ? "main" : slot === DEMO_CARD_BOUTS - 1 ? "co-main" : "quick";
  const shape = DEMO_BOUT_KINDS[kind] || DEMO_BOUT_KINDS[natural];
  return Object.freeze({ cycle: number, card, slot, of: DEMO_CARD_BOUTS, ...shape });
}

// ---------------------------------------------------------------------------
// The session ledger.
// ---------------------------------------------------------------------------

export function createDemoLedger() {
  return { bouts: [], fighters: {}, cycles: 0, cards: 0 };
}

function fighterRecord(ledger, id) {
  if (!ledger.fighters[id]) {
    ledger.fighters[id] = { wins: 0, losses: 0, streak: 0, bestStreak: 0, roundsWon: 0, roundsLost: 0, finishers: 0, bouts: 0 };
  }
  return ledger.fighters[id];
}

/** The ledger is bounded: an unattended cabinet runs for hours. */
export const DEMO_LEDGER_BOUTS_MAX = 60;

/**
 * Bank one settled bout. `rounds` is the round score by seat, `winner` the
 * seat; `finisher` whether the closing round was a Final Blow. Returns the
 * entry written. A streak is consecutive wins; a loss resets it to 0 and a
 * negative streak is not tracked (the board reads W3, never L3).
 */
export function demoLedgerRecord(ledger, {
  cycle = 0, pair = ["", ""], winner = 0, rounds = [0, 0], finisher = false, story = "", bout = null,
} = {}) {
  const seat = winner === 1 ? 1 : 0;
  const winnerId = String(pair[seat] || "");
  const loserId = String(pair[1 - seat] || "");
  const entry = {
    cycle, card: bout?.card ?? 0, slot: bout?.slot ?? 0, kind: bout?.kind ?? "", story,
    winner: winnerId, loser: loserId, rounds: [rounds[0] || 0, rounds[1] || 0], finisher: Boolean(finisher),
  };
  ledger.bouts.push(entry);
  while (ledger.bouts.length > DEMO_LEDGER_BOUTS_MAX) ledger.bouts.shift();
  ledger.cycles += 1;
  if (bout?.slot === DEMO_CARD_BOUTS) ledger.cards += 1;
  const won = fighterRecord(ledger, winnerId);
  const lost = fighterRecord(ledger, loserId);
  won.wins += 1; won.bouts += 1; won.streak += 1; won.bestStreak = Math.max(won.bestStreak, won.streak);
  won.roundsWon += entry.rounds[seat]; won.roundsLost += entry.rounds[1 - seat];
  if (entry.finisher) won.finishers += 1;
  lost.losses += 1; lost.bouts += 1; lost.streak = 0;
  lost.roundsWon += entry.rounds[1 - seat]; lost.roundsLost += entry.rounds[seat];
  return entry;
}

/** Standings: wins, then fewer losses, then the live streak, then the id. */
export function demoStandings(ledger, { limit = 0 } = {}) {
  const rows = Object.entries(ledger?.fighters || {})
    .map(([id, record]) => ({ id, ...record }))
    .filter((row) => row.bouts > 0)
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.streak - a.streak || (a.id < b.id ? -1 : 1));
  return limit > 0 ? rows.slice(0, limit) : rows;
}

// ---------------------------------------------------------------------------
// The persistent board. Keyed by build so a new release opens on a clean
// board (the roster, the kits and the AI all move between builds, and a
// standings line that mixes two builds' fighters says nothing).
// ---------------------------------------------------------------------------

export const DEMO_STANDINGS_STORAGE_PREFIX = "final-blow-demo-standings-v1";

export function demoStandingsStorageKey(build = "0.0") {
  return `${DEMO_STANDINGS_STORAGE_PREFIX}:${String(build || "0.0")}`;
}

export function serializeDemoStandings(ledger, { build = "0.0", now = 0 } = {}) {
  return {
    build: String(build || "0.0"),
    updatedAt: Number(now) || 0,
    cycles: ledger?.cycles || 0,
    cards: ledger?.cards || 0,
    fighters: Object.fromEntries(Object.entries(ledger?.fighters || {}).map(([id, record]) => [id, { ...record }])),
  };
}

/**
 * A fresh ledger seeded from a stored board of the SAME build, or an empty
 * one for anything else (a different build, garbage, nothing). The stored
 * bout log is not restored — the board is the record, the log is the night.
 */
export function restoreDemoStandings(stored, { build = "0.0" } = {}) {
  const ledger = createDemoLedger();
  if (!stored || typeof stored !== "object" || stored.build !== String(build || "0.0")) return ledger;
  ledger.cycles = Math.max(0, Math.floor(Number(stored.cycles) || 0));
  ledger.cards = Math.max(0, Math.floor(Number(stored.cards) || 0));
  for (const [id, record] of Object.entries(stored.fighters || {})) {
    if (!record || typeof record !== "object") continue;
    const clean = fighterRecord(ledger, id);
    for (const field of Object.keys(clean)) clean[field] = Math.max(0, Math.floor(Number(record[field]) || 0));
    // A streak carried across a reload is still a streak, but never longer
    // than the wins that could have built it.
    clean.streak = Math.min(clean.streak, clean.wins);
  }
  return ledger;
}

// ---------------------------------------------------------------------------
// Text.
// ---------------------------------------------------------------------------

const upper = (value) => String(value || "").toUpperCase();

/** The bug's story row: `GRUDGE MATCH · BOUT 2 OF 6 · QUICK BOUT · BEST OF 1`. */
export function demoStoryBugText({ storyLabel = "", bout = null } = {}) {
  const parts = [];
  if (storyLabel) parts.push(upper(storyLabel));
  if (bout) parts.push(`BOUT ${bout.slot} OF ${bout.of}`, upper(bout.label), upper(bout.format));
  return parts.join(" · ");
}

/** The result screen's eyebrow: the card's address, not a counter. */
export function demoResultEyebrow({ cycle = 1, bout = null } = {}) {
  if (!bout) return `WATCH DEMO · CYCLE ${Math.max(1, Math.floor(Number(cycle) || 1))}`;
  return `WATCH DEMO · CARD ${bout.card} · BOUT ${bout.slot} OF ${bout.of} · ${upper(bout.label)}`;
}

/** A fighter's line on the board: `JEZ 3-1 · W3` (the streak only from 2). */
export function demoStandingLine({ name = "", wins = 0, losses = 0, streak = 0 } = {}) {
  const streakTag = streak >= 2 ? ` · W${streak}` : "";
  return `${upper(name)} ${wins}-${losses}${streakTag}`;
}

/** The set-score card's sub-line: both records for the night. */
export function demoRecordsLine({ first = {}, second = {} } = {}) {
  return `TONIGHT · ${demoStandingLine(first)} · ${demoStandingLine(second)}`;
}

// The sign-off lines. One family per situation, several variants each; the
// director hands the VARIANT index in from its seeded stream so a seed
// replays the same sign-off and the same one never runs twice in a row
// (a shuffle bag over the variants — see engine/demo.mjs). {W} / {L} are the
// winner and loser, {S} the score, {N} the next bout's label, {K} the streak.
export const DEMO_SIGN_OFF_LINES = Object.freeze({
  // The MAIN EVENT closed the card.
  card: Object.freeze([
    "THAT'S THE CARD. {W} CLOSES THE NIGHT.",
    "MAIN EVENT TO {W}. THE BOARD STANDS.",
    "{W} TAKES THE HEADLINER {S}. NEW CARD NEXT.",
    "FINAL BELL OF THE CARD. {W} OWNS IT.",
  ]),
  // A streak worth naming (three or more).
  streak: Object.freeze([
    "{K} STRAIGHT FOR {W}. WHO STOPS THAT?",
    "{W} IS ON A {K}-BOUT RUN. NEXT UP: {N}.",
    "NOBODY HAS AN ANSWER FOR {W}. {K} IN A ROW.",
    "{W}: {K} WINS TONIGHT AND COUNTING.",
  ]),
  // The co-main hands over to the headliner.
  main: Object.freeze([
    "{W} GETS IT DONE. THE MAIN EVENT IS NEXT.",
    "CO-MAIN TO {W}. NOW THE HEADLINER.",
    "{W} {S}. STAY WITH US — MAIN EVENT COMING UP.",
    "THAT SETS THE TABLE. THE MAIN EVENT FOLLOWS.",
  ]),
  // An undercard bout, nothing special to add.
  plain: Object.freeze([
    "{W} OVER {L}. NEXT: {N}.",
    "QUICK WORK FROM {W}. {N} IS NEXT.",
    "{W} BANKS THE WIN. UP NEXT: {N}.",
    "{L} WILL WANT THAT BACK. NEXT: {N}.",
    "{W} MOVES UP THE BOARD. {N} NEXT.",
  ]),
});
export const DEMO_SIGN_OFF_VARIANTS = 5;

/** Which sign-off family a settled bout belongs to. */
export function demoSignOffFamily({ bout = null, nextBout = null, streak = 0 } = {}) {
  if (bout?.kind === "main") return "card";
  if (streak >= 3) return "streak";
  if (nextBout?.kind === "main") return "main";
  return "plain";
}

export function demoSignOffLine({
  variant = 0, winnerName = "", loserName = "", rounds = [0, 0], winner = 0,
  bout = null, nextBout = null, streak = 0,
} = {}) {
  const family = demoSignOffFamily({ bout, nextBout, streak });
  const lines = DEMO_SIGN_OFF_LINES[family];
  const line = lines[Math.max(0, Math.floor(Number(variant) || 0)) % lines.length];
  const seat = winner === 1 ? 1 : 0;
  const score = `${rounds[seat] || 0}-${rounds[1 - seat] || 0}`;
  return line
    .replaceAll("{W}", upper(winnerName))
    .replaceAll("{L}", upper(loserName))
    .replaceAll("{S}", score)
    .replaceAll("{N}", nextBout ? `${upper(nextBout.label)}` : "THE NEXT BOUT")
    .replaceAll("{K}", String(Math.max(0, Math.floor(Number(streak) || 0))));
}

/**
 * The NEXT UP line under the result: the next pair from the director's peek,
 * its stage and its bout, with a real countdown. `held` keeps the hidden-tab
 * wording the demo-hold probe pins; no `next` keeps the 5.3 wording.
 */
export function demoNextUpText({
  next = null, remainingMs = 5000, coarsePointer = false, held = false,
} = {}) {
  if (held) return "NEXT FIGHT WAITS FOR THE SCREEN";
  const prompt = coarsePointer ? "TAP TO PLAY" : "PRESS ANY BUTTON TO PLAY";
  const seconds = Math.max(1, Math.ceil(Math.max(0, Number(remainingMs) || 0) / 1000));
  const countdown = `IN ${seconds} SECOND${seconds === 1 ? "" : "S"}`;
  if (!next) return `NEXT RANDOM FIGHT ${countdown} · ${prompt}`;
  const parts = ["NEXT UP", `${upper(next.first)} VS ${upper(next.second)}`];
  if (next.stageName) parts.push(upper(next.stageName));
  if (next.bout) parts.push(`${upper(next.bout.label)} · ${upper(next.bout.format)}`);
  if (next.storyLabel) parts.push(upper(next.storyLabel));
  parts.push(countdown, prompt);
  return parts.join(" · ");
}

/**
 * The demo's ROUND card on rounds after the first: what the banner says and
 * what the announcer speaks. A best-of-five has rounds the banks were never
 * cut for ("ROUND 3" spoke `finalround` unconditionally — wrong for 1-1 in a
 * best-of-five), so the DECIDING round speaks finalround, a round with one
 * side on match point speaks setpoint, rounds one and two keep their banks,
 * and any other round is caption-only. The banner's sub-line carries the
 * running score so the viewer knows where the set stands.
 */
export function demoRoundCardPlan({
  round = 2, rounds = [0, 0], roundsToWin = 2, names = ["", ""], bout = null,
} = {}) {
  const need = Math.max(1, roundsToWin);
  const deciding = rounds[0] === need - 1 && rounds[1] === need - 1;
  const matchPoint = rounds[0] === need - 1 || rounds[1] === need - 1;
  const cue = deciding ? "finalround" : matchPoint ? "setpoint" : round === 2 ? "round2" : round === 1 ? "round1" : null;
  const main = deciding && need > 1 ? "FINAL ROUND" : `ROUND ${round}`;
  const label = bout ? upper(bout.label) : "SETTLE IT";
  const sub = `${label} · ${upper(names[0])} ${rounds[0]}–${rounds[1]} ${upper(names[1])}`;
  return { main, sub, speak: cue ? [{ cue, delay: 0 }] : [] };
}
