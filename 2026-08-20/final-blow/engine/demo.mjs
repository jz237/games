import { DeterministicRng, hashSeed } from "./foundation.mjs";

export const DEMO_IDLE_DELAY_MS = 45_000;
export const DEMO_RESULT_HOLD_MS = 5_000;
import { registerAiDifficulty, resolveAiSettings } from "./ai.mjs";

// 4.3 DEMO SPACING: the attract-mode CPUs fight on a PRO brain with every kit
// range widened 1.6x and the mid-band pokes thinned, so the two never sit in
// a permanent clinch and each move can be read from the couch.
export const DEMO_AI_DIFFICULTY = "demo";
registerAiDifficulty(DEMO_AI_DIFFICULTY, {
  ...resolveAiSettings("pro"),
  label: "DEMO",
  spacing: 1.6,
  patience: 0.55,
  decisionFrames: 12,
  comboChance: 0.3,
  throwChance: 0.08,
  grabPressureChance: 0.1,
});

// 5.4 FIGHT NIGHT (round-ends): the CLOCK brain. Traced over 16 attract
// rounds the 99 s clock never read below 80 — every round ended by knockout
// ~17 s after the bell, so the TIME OVER buzzer, the DECISION banner, its
// stinger and the announcer's timeover bank were unreachable in attract. One
// cycle in four is now a CLOCK card: both demo CPUs run this tier (the demo
// brain with the pokes thinned further, the throws and combo chases mostly
// off, the guard up), the choreographer stands down (DEMO_CLOCK_COVERAGE_BLEND
// 0 — measured, the coverage scripts were the aggressor: a clock-tier round
// under the 0.3 blend still ended in 11-28 s, one of them a perfect), the card
// opens on footsies with no free Grit, and the round is a 30-second clock
// (game.js DEMO_CLOCK_ROUND_SECONDS; brain-only rounds measured 10-50 s,
// median 27, so patience alone never reaches 99). Registered here like the
// demo tier: only makeFighter's demo branch ever asks for it.
export const DEMO_CLOCK_AI_DIFFICULTY = "demo-clock";
registerAiDifficulty(DEMO_CLOCK_AI_DIFFICULTY, {
  ...resolveAiSettings(DEMO_AI_DIFFICULTY),
  label: "DEMO CLOCK",
  swing: 0.3,
  spaceJumpShare: 0,
  patience: 0.9,
  decisionFrames: 18,
  defenseChance: 0.94,
  perfectGuardChance: 0.35,
  antiAirChance: 0.4,
  wakeupReversalChance: 0.2,
  comboChance: 0.06,
  meterChance: 0.15,
  throwChance: 0.03,
  grabPressureChance: 0.04,
  errorChance: 0.03,
});
// The choreographer's coverage share on a CLOCK card (0.8 elsewhere): the
// brains own the card; the checklist is banked by the standard cards around
// it (the attract ledger is cumulative).
export const DEMO_CLOCK_COVERAGE_BLEND = 0;

// The four ways an exhibition can open. "super" is the opener every
// exhibition used to run (walk-in + full-meter super at tick 23-29 in 6/6
// traced cards). A standard card draws super / throw / dash-in from a seeded
// three-bag; footsies-first is the CLOCK card's own opener (the feel-out is
// the clock's story). With one clock card in four, every eight-card window
// shows all four openers and no two consecutive cards open the same way.
export const DEMO_OPENERS = Object.freeze(["super", "throw", "dash-in", "footsies-first"]);
export const DEMO_STANDARD_OPENERS = Object.freeze(["super", "throw", "dash-in"]);
// One CLOCK card in four; the first card of a session is always standard.
export const DEMO_FORMATS = Object.freeze(["standard", "clock"]);
const FORMAT_BAG = Object.freeze(["standard", "standard", "standard", "clock"]);

// The winner's health at the KO below which a round reads as won from the
// brink — the closer treats it like a comeback and takes the Final Blow.
export const DEMO_BRINK_HEALTH = 30;
// ...and the health an evening round must have been won under to count as a
// comeback rather than a plain trade of rounds.
export const DEMO_COMEBACK_HEALTH = 50;

/**
 * 5.4 FIGHT NIGHT (round-ends): the per-round CLOSER. Pure, deterministic on
 * the round state and the session ledger, so a seed replays the same show.
 * The winning CPU takes its Final Blow only when this round closes the match
 * (match point), evens a match it was losing while under half health (a
 * comeback — a bare evening round is not one, or two of every three rounds
 * would still be ceremonies), or was won from the brink; every other round
 * lapses into a plain knockout so the 5.3 collapse and the curtain call
 * finally play in attract. When it does finish, the
 * variant alternates per fighter through `ledger` (fighterId -> Final Blows
 * taken this session) so the B finisher — never once seen in 127 traced
 * attract rounds — comes out every second time.
 */
export function demoCloserPlan({
  winner = 0, rounds = [0, 0], roundsToWin = 2, winnerHealth = 100, fighterId = "", ledger = {},
  loserGrounded = true,
} = {}) {
  const loser = 1 - winner;
  const matchPoint = (rounds[winner] || 0) + 1 >= roundsToWin;
  const comeback = (rounds[winner] || 0) < (rounds[loser] || 0) && winnerHealth <= DEMO_COMEBACK_HEALTH;
  const brink = winnerHealth <= DEMO_BRINK_HEALTH;
  // A loser knocked out in the AIR (a juggle KO) is left hanging by the
  // plain-KO path — engine/bookends koCollapseOnRoundEnd lays down only a
  // grounded fighter, and the finish window freezes him where he is. That is
  // a feet-in-the-air read for the whole curtain call, so the ceremony takes
  // him instead: the Final Blow owns its victim from the first frame.
  const airborne = !loserGrounded;
  const reason = matchPoint ? "match-point" : comeback ? "comeback" : brink ? "brink" : airborne ? "airborne" : "plain";
  const finisher = reason !== "plain";
  const shown = Number(ledger?.[fighterId]) || 0;
  return Object.freeze({ finisher, variant: finisher ? shown % 2 : -1, reason });
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))];
}

function shuffled(values, rng) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng.nextFloat() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

// Exported for the survival "Gauntlet" ladder (engine/modes.mjs), which reuses
// the exact demo shuffle-bag discipline: never repeat the previous draw first.
export function refillBag(values, rng, previous, key = (value) => value) {
  const bag = shuffled(values, rng);
  if (bag.length > 1 && previous !== null && key(bag[0]) === key(previous)) {
    const different = bag.findIndex((value) => key(value) !== key(previous));
    if (different > 0) [bag[0], bag[different]] = [bag[different], bag[0]];
  }
  return bag;
}

export function demoMatchupKey(first, second) {
  return [String(first), String(second)].sort().join("::");
}

export function createDemoDirector({ fighterIds, stageIds, trackCount = 0, seed = 237 } = {}) {
  const fighters = uniqueStrings(fighterIds);
  const stages = uniqueStrings(stageIds);
  const tracks = Array.from({ length: Math.max(0, Math.floor(Number(trackCount) || 0)) }, (_, index) => index);
  if (fighters.length < 2) throw new Error("Demo mode requires at least two different fighters.");
  if (!stages.length) throw new Error("Demo mode requires at least one stage.");
  if (!tracks.length) throw new Error("Demo mode requires at least one soundtrack.");

  const matchups = [];
  for (let first = 0; first < fighters.length - 1; first += 1) {
    for (let second = first + 1; second < fighters.length; second += 1) {
      matchups.push([fighters[first], fighters[second]]);
    }
  }

  const normalizedSeed = hashSeed("FINAL-BLOW-DEMO", seed, fighters.join("|"), stages.join("|"), tracks.length);
  const rng = new DeterministicRng(normalizedSeed);
  // 5.4: the SHOW stream (format + opener) is its own seeded rng so the
  // matchup/stage/track draw of every existing seed is byte-identical to 5.3.
  const showRng = new DeterministicRng(hashSeed(normalizedSeed, "show"));
  let matchupBag = [];
  let stageBag = [];
  let trackBag = [];
  let formatBag = [];
  let openerBag = [];
  let previousMatchup = null;
  let previousStage = null;
  let previousTrack = null;
  let previousFormat = null;
  let previousOpener = null;
  let cycle = 0;

  // One CLOCK card per four: a shuffled bag, never two clock cards in a row
  // and never on the first card of the session (the first thing a passer-by
  // sees is a standard bout).
  function refillFormats() {
    const bag = shuffled(FORMAT_BAG, showRng);
    if (bag[0] === "clock" && (previousFormat === "clock" || cycle === 0)) {
      const standard = bag.indexOf("standard");
      [bag[0], bag[standard]] = [bag[standard], bag[0]];
    }
    return bag;
  }

  function next() {
    if (!matchupBag.length) matchupBag = refillBag(matchups, rng, previousMatchup, ([a, b]) => demoMatchupKey(a, b));
    if (!stageBag.length) stageBag = refillBag(stages, rng, previousStage);
    if (!trackBag.length) trackBag = refillBag(tracks, rng, previousTrack);
    if (!formatBag.length) formatBag = refillFormats();
    const matchup = matchupBag.shift();
    const stage = stageBag.shift();
    const track = trackBag.shift();
    const format = formatBag.shift();
    // A CLOCK card always opens on footsies: the feel-out IS the clock's
    // story, and a free walk-in super is a third of a health bar the round
    // cannot afford if it is to reach 0. Standard cards rotate the other
    // three, so six standard cards always exhaust the bag at least once.
    let opener = "footsies-first";
    if (format !== "clock") {
      if (!openerBag.length) openerBag = refillBag(DEMO_STANDARD_OPENERS, showRng, previousOpener);
      // No two consecutive CARDS open the same way — a clock card's footsies
      // can sit between two standard cards, so the bag head is checked
      // against the previous card at draw time too.
      if (openerBag.length > 1 && openerBag[0] === previousOpener) [openerBag[0], openerBag[1]] = [openerBag[1], openerBag[0]];
      opener = openerBag.shift();
    }
    const picks = rng.nextFloat() < 0.5 ? [...matchup] : [matchup[1], matchup[0]];
    previousMatchup = matchup;
    previousStage = stage;
    previousTrack = track;
    previousFormat = format;
    previousOpener = opener;
    cycle += 1;
    return Object.freeze({
      cycle, picks: Object.freeze(picks), stage, track,
      // 5.4 FIGHT NIGHT: how this card opens and whether it is on the clock.
      show: Object.freeze({ format, opener }),
    });
  }

  function snapshot() {
    return {
      cycle,
      seed: normalizedSeed,
      matchupCount: matchups.length,
      remainingMatchups: matchupBag.length,
      remainingStages: stageBag.length,
      remainingTracks: trackBag.length,
      lastMatchup: previousMatchup ? [...previousMatchup] : null,
      lastStage: previousStage,
      lastTrack: previousTrack,
      lastFormat: previousFormat,
      lastOpener: previousOpener,
      rng: rng.getState(),
    };
  }

  return Object.freeze({ next, snapshot });
}
