import { DeterministicRng, hashSeed } from "./foundation.mjs";

export const DEMO_IDLE_DELAY_MS = 45_000;
export const DEMO_RESULT_HOLD_MS = 5_000;
import { registerAiDifficulty, resolveAiSettings } from "./ai.mjs";
import { getFighterKit } from "./fighter-kits.mjs";

// 4.3 DEMO SPACING: the attract-mode CPUs fight on a PRO brain with every kit
// range widened 1.6x and the mid-band pokes thinned, so the two never sit in
// a permanent clinch and each move can be read from the couch.
//
// 5.4 PERSONAS (sweep #2): kept registered as the FALLBACK for a kit without
// a persona, but no shipped kit uses it any more — see DEMO_PERSONAS.
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

// ---------------------------------------------------------------------------
// 5.4 PERSONAS — one demo brain per ARCHETYPE instead of one for the roster.
//
// The 4.3 tier widened every kit 1.6x and floored the bands at 230/130/340px,
// which made the attract loop readable and also made it anonymous: sampled
// with 3000 decideAiIntent rolls per fighter per distance, EVERY fighter's top
// intent at 90-200px was `retreat` (50-78%) and at 260-520px `advance`
// (50-62%) — the grappler backed out of the clinch he is built for, the zoner
// walked in on the band his golf ball was authored for, and the pair traded
// 21-33 walk reversals a minute. Each persona below is a PRO brain with the
// kit's own ranges (floors off), its own clinch line (`spaceRange`), and band
// weights that push the signature move back into the band it belongs in.
// Every knob is undefined on the built-in tiers, so a played match is
// byte-identical (tests/demo-personas.test.mjs pins that against a copy of
// the 5.3 table body).
//
// The 1.6x widening survives in exactly one place: the APPROACH band of the
// three close-range kits (deathblow 82px, alan 96px, benny 92px — the
// grappler, the counter-puncher and the rushdown). They still open from a
// readable distance and walk in — the walk-in is the point of all three —
// but their preferred bands are the authored ones, so the fight ends up
// where the kit was designed to be fought.
//
// The Grit policy (sweep #6) is shared by every persona: a full bar on a
// confirmed hit is the super (`superConfirmChance`, ahead of the combo roll),
// the standalone super's share rises from 0.38 to 0.6 of meterChance inside
// `superRange`, and a half bar converts the band's own action to EX at 0.8
// instead of 0.5.
const DEMO_GRIT_POLICY = Object.freeze({
  superConfirmChance: 0.92,
  meterSuperShare: 0.6,
  exShare: 0.8,
  superRange: 270,
});

export const DEMO_PERSONAS = Object.freeze({
  // Keep-away: hold the far band, fire the projectile/trap on it, throw
  // almost never, and back out of anything under ~190px.
  zoner: Object.freeze({
    label: "DEMO · ZONER",
    spacing: 1.3, patience: 0.7, spaceRange: 190, spacingFloors: null,
    rangedWeight: 3, pokeWeight: 1.2, throwWeight: 0.3, holdSlack: 50,
    throwChance: 0.05, grabPressureChance: 0.1,
    reactionFrames: 10, decisionFrames: 12, comboChance: 0.45, tauntChance: 0.08,
    superRange: 300,
  }),
  // Grab pressure: authored ranges, no clinch line at all, the throw and
  // the meaty grab at real shares, and the wide walk-in.
  grappler: Object.freeze({
    label: "DEMO · GRAPPLER",
    spacing: 1, approachSpacing: 1.6, patience: 0, spaceRange: 0, spacingFloors: null,
    throwWeight: 1.8, closeWeight: 1.2,
    throwChance: 0.3, grabPressureChance: 0.4, meatyChance: 0.7, clinchTechChance: 0.55,
    reactionFrames: 9, decisionFrames: 10, comboChance: 0.55,
  }),
  // Hunt: impatient, dashes in from the approach band, converts confirms.
  rushdown: Object.freeze({
    label: "DEMO · RUSHDOWN",
    spacing: 1, approachSpacing: 1.6, patience: 0.2, spaceRange: 0, spacingFloors: null,
    dashInChance: 0.45, pokeWeight: 1.3,
    throwChance: 0.15, comboChance: 0.7, meatyChance: 0.6,
    reactionFrames: 8, decisionFrames: 9,
  }),
  // Retreat and punish: sits just outside, blocks and perfect-guards more,
  // takes the counter on nearly every swing it sees, punishes every whiff.
  counter: Object.freeze({
    label: "DEMO · COUNTER",
    spacing: 1.15, approachSpacing: 1.6, patience: 0.5, spaceRange: 130, spacingFloors: null,
    counterChance: 0.9, counterFirstChance: 0.55, pokeWeight: 0.8, holdSlack: 30,
    defenseChance: 0.84, perfectGuardChance: 0.42, throwWhiffPunishChance: 0.9,
    throwChance: 0.12, errorChance: 0.05,
    reactionFrames: 8, decisionFrames: 11,
  }),
  // Mid-range pokes at the edge of reach.
  footsies: Object.freeze({
    label: "DEMO · FOOTSIES",
    spacing: 1.2, patience: 0.45, spaceRange: 120, spacingFloors: null,
    pokeWeight: 1.6, holdSlack: 40, throwChance: 0.16, comboChance: 0.5,
    reactionFrames: 9, decisionFrames: 11,
  }),
  // The echo: a zoner's ranged share with a rushdown's occasional dash.
  trickster: Object.freeze({
    label: "DEMO · TRICKSTER",
    spacing: 1.2, patience: 0.5, spaceRange: 150, spacingFloors: null,
    rangedWeight: 2.2, pokeWeight: 1.2, dashInChance: 0.15, holdSlack: 40,
    throwChance: 0.12, tauntChance: 0.1,
    reactionFrames: 10, decisionFrames: 12,
  }),
  // Hit and run: quick decisions, dashes in, leaves after the exchange.
  skirmisher: Object.freeze({
    label: "DEMO · SKIRMISHER",
    spacing: 1.15, patience: 0.45, spaceRange: 130, spacingFloors: null,
    pokeWeight: 1.3, dashInChance: 0.3, holdSlack: 30,
    throwChance: 0.14, airRecoveryChance: 0.6,
    reactionFrames: 8, decisionFrames: 10,
  }),
});

export const DEMO_PERSONA_PREFIX = "demo-";

for (const [name, persona] of Object.entries(DEMO_PERSONAS)) {
  registerAiDifficulty(`${DEMO_PERSONA_PREFIX}${name}`, {
    ...resolveAiSettings("pro"),
    ...DEMO_GRIT_POLICY,
    ...persona,
    persona: name,
  });
}

// The registered AI tier a fighter plays in the demo: its kit's authored
// `ai.persona`, or the 4.3 fallback tier for a kit that names none. Pure
// lookup — game.js makeFighter calls it under `state.mode === "demo"` only.
export function demoPersonaFor(fighterId) {
  const persona = getFighterKit(fighterId)?.ai?.persona;
  return persona && DEMO_PERSONAS[persona] ? `${DEMO_PERSONA_PREFIX}${persona}` : DEMO_AI_DIFFICULTY;
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

  // The three bags are refilled in one fixed order (matchup, stage, track) so
  // that peek() — which may refill early — draws from the rng exactly what a
  // later next() would have drawn, in the same order.
  function refillBags() {
    if (!matchupBag.length) matchupBag = refillBag(matchups, rng, previousMatchup, ([a, b]) => demoMatchupKey(a, b));
    if (!stageBag.length) stageBag = refillBag(stages, rng, previousStage);
    if (!trackBag.length) trackBag = refillBag(tracks, rng, previousTrack);
    // The SHOW stream's format bag rides its own rng (showRng), so a refill
    // here never touches the matchup/stage/track draw; it is in this one
    // place so peek() and next() see the same head.
    if (!formatBag.length) formatBag = refillFormats();
  }

  // 5.4 FIGHT NIGHT (sweep #26/#27) — PEEK. The next exhibition's unordered
  // pair, stage and track WITHOUT consuming them, so the running exhibition
  // can warm the next pair's sheets, voice banks and CINEMA 3D rigs while the
  // 3D world is idle and the network has 60-120 s to hide 6-10 MB per new
  // fighter. Bag semantics are untouched: a refill peek() performs is the
  // refill next() would have performed a moment later, from the same rng
  // draws in the same order, and the side coin flip stays in next() — so
  // next() with or without a preceding peek() returns the identical cycle and
  // leaves the identical rng state (pinned in tests/demo.test.mjs). Sides are
  // deliberately not part of the answer: a prewarm is per fighter, not per
  // seat, and revealing the flip early would mean drawing it early.
  function peek() {
    refillBags();
    return Object.freeze({
      cycle: cycle + 1,
      pair: Object.freeze([...matchupBag[0]]),
      stage: stageBag[0],
      track: trackBag[0],
      format: formatBag[0],
    });
  }

  function next() {
    refillBags();
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

  return Object.freeze({ next, peek, snapshot });
}
