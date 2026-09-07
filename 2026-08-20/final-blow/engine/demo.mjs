import { DeterministicRng, hashSeed } from "./foundation.mjs";

export const DEMO_IDLE_DELAY_MS = 45_000;
// 5.4 FIGHT NIGHT (sweep #8/#16/#20): the result hold was 5 s of static text.
// The seam between two exhibitions keeps its 8.0 s of wall clock (at the 0.75x
// demo rate: 5.0 s hold + 3.0 s round-1 intro before; 2.4 s hold + the 2.6 s
// VERSUS hold + 3.0 s intro after) — the 2.6 s moved onto the fight screen as
// the versus card and ring introduction (engine/demo-versus.mjs).
// 5.4.1 RINGSIDE: 2.4 s at 5.4; the spoken sign-off (a fragment, the winner's
// name take, sometimes a tail) needs ~3 s before the versus card's corner
// calls, so the hold is 3.0 s — the seam is still under the 8 s it was at 5.3.
export const DEMO_RESULT_HOLD_MS = 3_000;
import { registerAiDifficulty, resolveAiSettings } from "./ai.mjs";
import { getFighterKit } from "./fighter-kits.mjs";
import { DEMO_SIGN_OFF_VARIANTS, demoBoutPlan } from "./demo-session.mjs";

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
// 5.4 SESSION LAYER (sweep #3): the STORY now names the opener — "none" is
// the ZONING WAR's (no forced opener, the spacing brains own the bell) —
// and every standard story has its own, so the set below is what the
// stories draw from rather than a bag of its own.
export const DEMO_OPENERS = Object.freeze(["super", "throw", "dash-in", "footsies-first", "none"]);
export const DEMO_STANDARD_OPENERS = Object.freeze(["super", "throw", "dash-in", "none"]);
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
  loserGrounded = true, quickBout = false, quickFinisher = false,
} = {}) {
  const loser = 1 - winner;
  // 5.4 SESSION LAYER (sweep #15): a one-round QUICK BOUT is match point from
  // the bell, which would hand every undercard bout the nine-second ceremony
  // the closer exists to ration. Match point alone earns nothing there; the
  // brink and the airborne rules still apply, and the director's seeded
  // `quickFinisher` coin gives half the undercard a Final Blow anyway.
  const matchPoint = !quickBout && (rounds[winner] || 0) + 1 >= roundsToWin;
  const comeback = (rounds[winner] || 0) < (rounds[loser] || 0) && winnerHealth <= DEMO_COMEBACK_HEALTH;
  const brink = winnerHealth <= DEMO_BRINK_HEALTH;
  // A loser knocked out in the AIR (a juggle KO) is left hanging by the
  // plain-KO path — engine/bookends koCollapseOnRoundEnd lays down only a
  // grounded fighter, and the finish window freezes him where he is. That is
  // a feet-in-the-air read for the whole curtain call, so the ceremony takes
  // him instead: the Final Blow owns its victim from the first frame.
  const airborne = !loserGrounded;
  const quick = quickBout && quickFinisher;
  const reason = matchPoint ? "match-point" : comeback ? "comeback" : brink ? "brink" : airborne ? "airborne" : quick ? "quick" : "plain";
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

// ---------------------------------------------------------------------------
// 5.4 SESSION LAYER — STORIES (sweep #3). Traced on the 5.4 head, every
// exhibition had the same skeleton: the showcase side strictly alternated,
// the leader visibly threw the fight for 7-35% of the fight ticks (the
// choreographer's yield, at one fixed tolerance), every card had exactly one
// taunt, and both seats always played the same persona strength. A STORY is
// the seeded per-card answer: it sets the opener, which side leads it, how
// much each side is allowed to yield, a per-side tier overlay on the seat's
// persona, and (SHOWBOAT) who disrespects every knockdown. The stories SET
// the round-ends and personas hooks — the opener draw, `superSide`, the
// clock format, `demoPersonaFor` — they do not replace them.
//
//   GRUDGE            both aggressive, NO yield either side, the throw opener
//   ROOKIE VS VETERAN asymmetric tiers per seat (the veteran a FINAL-grade
//                     persona, the rookie a ROOKIE-grade one); the veteran
//                     gets the walk-in super, yields early; the rookie never
//                     yields and gets a full bar for the late comeback when
//                     the veteran reaches match point
//   SHOWBOAT          one seat taunts after every knockdown (choreographer +
//                     brain), opens on the dash-in
//   ZONING WAR        no forced opener, both seats on the SPACING overlay
//   CLOCK             the round-ends CLOCK card (format "clock", footsies)
//
// `flip` (a seeded coin from the director's story stream) decides which seat
// is the veteran / the showboat, so a seed replays the same casting.
export const DEMO_STORY_IDS = Object.freeze(["grudge", "rookie-veteran", "showboat", "zoning-war", "clock"]);
export const DEMO_STANDARD_STORY_IDS = Object.freeze(["grudge", "rookie-veteran", "showboat", "zoning-war"]);

// The choreographer's yield tolerance per seat ({ coverage, health } — the
// 2.9 round-4 constants are 4 / 26) or null for a seat that never yields.
const YIELD_DEFAULT = Object.freeze({ coverage: 4, health: 26 });
const YIELD_EARLY = Object.freeze({ coverage: 2, health: 14 });

export const DEMO_STORIES = Object.freeze({
  grudge: Object.freeze({
    id: "grudge", label: "GRUDGE MATCH", opener: "throw", format: "standard",
    tiers: Object.freeze(["grudge", "grudge"]), yield: Object.freeze([null, null]),
    superSide: "alternate", showboatSide: -1, comebackSide: -1,
  }),
  "rookie-veteran": Object.freeze({
    id: "rookie-veteran", label: "ROOKIE VS VETERAN", opener: "super", format: "standard",
    // Indexed by ROLE: [veteran, rookie]; demoStoryFor maps roles to seats.
    tiers: Object.freeze(["veteran", "rookie"]), yield: Object.freeze([YIELD_EARLY, null]),
    superSide: "veteran", showboatSide: -1, comebackSide: "rookie",
  }),
  showboat: Object.freeze({
    id: "showboat", label: "SHOWBOAT", opener: "dash-in", format: "standard",
    tiers: Object.freeze(["showboat", null]), yield: Object.freeze([YIELD_DEFAULT, YIELD_DEFAULT]),
    superSide: "showboat", showboatSide: "showboat", comebackSide: -1,
  }),
  "zoning-war": Object.freeze({
    id: "zoning-war", label: "ZONING WAR", opener: "none", format: "standard",
    tiers: Object.freeze(["spacing", "spacing"]), yield: Object.freeze([YIELD_DEFAULT, YIELD_DEFAULT]),
    superSide: "alternate", showboatSide: -1, comebackSide: -1,
  }),
  clock: Object.freeze({
    id: "clock", label: "THE CLOCK", opener: "footsies-first", format: "clock",
    tiers: Object.freeze([null, null]), yield: Object.freeze([YIELD_DEFAULT, YIELD_DEFAULT]),
    superSide: "alternate", showboatSide: -1, comebackSide: -1,
  }),
});

// The per-seat tier OVERLAYS a story lays over the seat's persona. Every
// overlay is registered per persona at load (`demo-<persona>-<overlay>`, plus
// `demo-<overlay>` over the fallback tier), so a seat still plays its kit's
// archetype — the grappler grudges at grab range, the zoner grudges with its
// projectile — with the story's temperament on top.
export const DEMO_STORY_TIERS = Object.freeze({
  // Both men come forward: no patience, the throw and the grab up, the dash
  // in, no disrespect.
  grudge: Object.freeze({
    patience: 0, throwWeight: 1.6, closeWeight: 1.2, throwChance: 0.28, grabPressureChance: 0.35,
    dashInChance: 0.35, meatyChance: 0.6, comboChance: 0.7, tauntChance: 0,
  }),
  // FINAL-grade reads on the persona's ranges.
  veteran: Object.freeze({
    reactionFrames: 6, decisionFrames: 7, defenseChance: 0.87, antiAirChance: 0.84, comboChance: 0.8,
    errorChance: 0.03, perfectGuardChance: 0.38, throwTechChance: 0.78, throwWhiffPunishChance: 0.84,
    wakeupReversalChance: 0.6, tauntChance: 0.02,
  }),
  // ROOKIE-grade reads: slow, mistakes, a low guard, the odd taunt.
  rookie: Object.freeze({
    reactionFrames: 17, decisionFrames: 16, defenseChance: 0.5, antiAirChance: 0.4, comboChance: 0.3,
    errorChance: 0.22, perfectGuardChance: 0.05, throwTechChance: 0.15, throwWhiffPunishChance: 0.2,
    wakeupReversalChance: 0.2, counterFirstChance: 0, tauntChance: 0.2,
  }),
  // The brain's own disrespect roll on every safe knockdown (the
  // choreographer stages the rest — see showboatSide).
  showboat: Object.freeze({ tauntChance: 0.6 }),
  // Keep-away for anyone: a wide clinch line, a wide hold band, the ranged
  // share up, no dash-in, throws down.
  spacing: Object.freeze({
    spacing: 1.35, patience: 0.7, spaceRange: 200, holdSlack: 55, rangedWeight: 2.5, pokeWeight: 1.3,
    throwWeight: 0.4, throwChance: 0.06, dashInChance: 0, grabPressureChance: 0.08,
  }),
});

for (const [overlayName, overlay] of Object.entries(DEMO_STORY_TIERS)) {
  registerAiDifficulty(`${DEMO_AI_DIFFICULTY}-${overlayName}`, {
    ...resolveAiSettings(DEMO_AI_DIFFICULTY),
    ...overlay,
    label: `DEMO · ${overlayName.toUpperCase()}`,
    overlay: overlayName,
  });
  for (const [name, persona] of Object.entries(DEMO_PERSONAS)) {
    registerAiDifficulty(`${DEMO_PERSONA_PREFIX}${name}-${overlayName}`, {
      ...resolveAiSettings(`${DEMO_PERSONA_PREFIX}${name}`),
      ...overlay,
      label: `${persona.label} · ${overlayName.toUpperCase()}`,
      persona: name,
      overlay: overlayName,
    });
  }
}

/** The registered tier for a seat: its persona under a story overlay (or the bare persona). */
export function demoStoryTierFor(fighterId, overlay = null) {
  const base = demoPersonaFor(fighterId);
  if (!overlay || !DEMO_STORY_TIERS[overlay]) return base;
  return `${base}-${overlay}`;
}

/**
 * A story resolved onto the two SEATS. `flip` is the director's seeded coin:
 * the veteran / the showboat sits on seat `flip`; `alternate` keeps the
 * round-ends rule (the lead alternates by cycle). Pure — the same inputs
 * always cast the same show.
 */
export function demoStoryFor(storyId = "grudge", { flip = 0, cycle = 1 } = {}) {
  const story = DEMO_STORIES[storyId] || DEMO_STORIES.grudge;
  const seat = flip === 1 ? 1 : 0;
  const alternate = (Math.max(1, Math.floor(Number(cycle) || 1)) - 1) % 2;
  const roleSeat = (role) => (role === "alternate" ? alternate : role === -1 ? -1 : seat);
  // Role-indexed tables land on the seats: role 0 (veteran / showboat) on
  // `seat`, role 1 on the other seat.
  const bySeat = (table) => {
    const seats = [null, null];
    seats[seat] = table[0];
    seats[1 - seat] = table[1];
    return Object.freeze(seats);
  };
  return Object.freeze({
    id: story.id,
    label: story.label,
    opener: story.opener,
    format: story.format,
    superSide: roleSeat(story.superSide),
    showboatSide: roleSeat(story.showboatSide),
    comebackSide: story.comebackSide === -1 ? -1 : 1 - seat,
    tiers: bySeat(story.tiers),
    yield: bySeat(story.yield),
  });
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
  // 5.4 SESSION LAYER: the STORY stream (story bag, the casting coin, the
  // sign-off variant bag, the quick-bout finisher coin) is a third seeded
  // rng, so the matchup/stage/track draw AND the clock-card positions of
  // every existing seed stay exactly what they were.
  const storyRng = new DeterministicRng(hashSeed(normalizedSeed, "story"));
  let matchupBag = [];
  let stageBag = [];
  let trackBag = [];
  let formatBag = [];
  let storyBag = [];
  let signOffBag = [];
  let previousMatchup = null;
  let previousStage = null;
  let previousTrack = null;
  let previousFormat = null;
  let previousOpener = null;
  let previousStory = null;
  let previousSignOff = null;
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
    // 5.4 SESSION LAYER: the story bag (four standard stories, never the
    // same one back to back across a refill) rides the story rng; a CLOCK
    // card's story is "clock" and leaves the bag alone, so the head here is
    // the story the next STANDARD card will tell — which is why peek() can
    // name it.
    if (!storyBag.length) storyBag = refillBag(DEMO_STANDARD_STORY_IDS, storyRng, previousStory);
    if (!signOffBag.length) {
      signOffBag = refillBag(Array.from({ length: DEMO_SIGN_OFF_VARIANTS }, (_, index) => index), storyRng, previousSignOff);
    }
  }

  // The next card's show tag without consuming anything (peek and next
  // agree by construction: both read the bag heads after one refillBags()).
  function showHead(number) {
    const format = formatBag[0];
    const story = format === "clock" ? "clock" : storyBag[0];
    return { format, story, opener: DEMO_STORIES[story].opener, bout: demoBoutPlan(number) };
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
    const head = showHead(cycle + 1);
    return Object.freeze({
      cycle: cycle + 1,
      pair: Object.freeze([...matchupBag[0]]),
      stage: stageBag[0],
      track: trackBag[0],
      format: head.format,
      // 5.4 SESSION LAYER: the NEXT UP panel names the story and the bout.
      story: head.story,
      bout: head.bout,
    });
  }

  function next() {
    refillBags();
    const head = showHead(cycle + 1);
    const matchup = matchupBag.shift();
    const stage = stageBag.shift();
    const track = trackBag.shift();
    const format = formatBag.shift();
    // 5.4 SESSION LAYER: the STORY names the opener. A CLOCK card is the
    // clock story (footsies — a free walk-in super is a third of a health
    // bar the round cannot afford if it is to reach 0) and leaves the story
    // bag alone; a standard card takes the bag head. Every standard story
    // has its own opener, so no two consecutive cards open the same way and
    // ten cards always show every story (pinned in tests/demo-session.test.mjs).
    const story = head.story;
    if (format !== "clock") storyBag.shift();
    const opener = head.opener;
    // The casting coin (which seat is the veteran / the showboat), the
    // sign-off variant and the quick-bout finisher coin: drawn for EVERY
    // card in a fixed order so the story stream stays aligned whatever the
    // card turned out to be.
    const flip = storyRng.nextFloat() < 0.5 ? 0 : 1;
    const signOff = signOffBag.shift();
    const quickFinisher = storyRng.nextFloat() < 0.5;
    const picks = rng.nextFloat() < 0.5 ? [...matchup] : [matchup[1], matchup[0]];
    previousMatchup = matchup;
    previousStage = stage;
    previousTrack = track;
    previousFormat = format;
    previousOpener = opener;
    if (format !== "clock") previousStory = story;
    previousSignOff = signOff;
    cycle += 1;
    return Object.freeze({
      cycle, picks: Object.freeze(picks), stage, track,
      // 5.4 FIGHT NIGHT: how this card opens and whether it is on the clock;
      // 5.4 SESSION LAYER: the story it tells, its casting coin, the bout of
      // the card it is, its sign-off variant and its quick-bout coin.
      show: Object.freeze({ format, opener, story, flip, bout: head.bout, signOff, quickFinisher }),
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
      lastStory: previousStory,
      remainingStories: storyBag.length,
      rng: rng.getState(),
    };
  }

  return Object.freeze({ next, peek, snapshot });
}

// ---------------------------------------------------------------------------
// 5.4 FIGHT NIGHT (sweep #30, and the share half of #12): SHAREABLE
// EXHIBITIONS. The seeded entry has always existed (qa.demo(seed)) but only
// under the QA manual clock, and the title button and the 45 s attract timer
// seeded from the wall clock — two WATCH DEMO presses measured 1991900429 and
// 3442111718 (normalised), so a good exhibition on the TV could never be
// shown twice. These helpers are the pure half of the feature: the URL
// grammar, its parser and its builder. game.js owns the boot router and the
// button; the sim never reads any of this.
//
//   ?demo=<seed>            boot straight into the seeded exhibition
//   ?demo=<seed>&cycle=<n>  ...opening on card n of that seed (1-500)
//   ?mode=demo              boot into a random exhibition (manifest shortcut)
//
// A seed is either an unsigned decimal (237) or a short slug (fight-night):
// the director hashes String(seed), so 237 and "237" are the same show and a
// slug is as good a seed as a number. Anything else is refused rather than
// guessed at — a refused seed means no demo boot, never a different one.
export const DEMO_SEED_PARAM = "demo";
export const DEMO_CYCLE_PARAM = "cycle";
export const DEMO_CYCLE_MAX = 500;
const DEMO_SEED_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
// The presentation choices a link carries along: which renderer drew it, and
// the transport rate (cadence only — it never changes a tick). Everything
// else (debug, a mode deep-link, an online invite) is deliberately dropped.
const DEMO_SHARE_KEEP = ["renderer", "fighters", "speed"];

export function parseDemoSeed(text) {
  if (text === null || text === undefined) return null;
  const value = String(text).trim();
  if (!value) return null;
  // All digits is a NUMBER or nothing — never a slug — so 237 and "237" stay
  // one show and a number past uint32 is refused rather than re-read as text.
  if (/^\d+$/.test(value)) {
    const number = Number(value);
    return value.length <= 10 && number <= 0xffffffff ? number : null;
  }
  return DEMO_SEED_SLUG.test(value) ? value : null;
}

export function parseDemoCycle(text) {
  if (text === null || text === undefined || String(text).trim() === "") return 1;
  const number = Number(String(text).trim());
  if (!Number.isInteger(number) || number < 1) return 1;
  return Math.min(DEMO_CYCLE_MAX, number);
}

/**
 * The boot request a query string asks for, or null when it asks for none.
 * `?demo=` wins over `?mode=demo`; a `?demo=` that fails to parse is NOT a
 * random demo — a mistyped share link should land on the title, where the
 * viewer can see something is off, not on a different exhibition.
 */
export function parseDemoBootRequest(search = "") {
  const params = new URLSearchParams(String(search ?? ""));
  if (params.has(DEMO_SEED_PARAM)) {
    const seed = parseDemoSeed(params.get(DEMO_SEED_PARAM));
    if (seed === null) return null;
    return { seed, cycle: parseDemoCycle(params.get(DEMO_CYCLE_PARAM)) };
  }
  if (params.get("mode") === "demo") return { seed: null, cycle: 1 };
  return null;
}

/**
 * The link for the exhibition on screen. Built from the page's own address so
 * a deployed copy, a local server and a file:// open each share themselves;
 * `cycle` is only written when it says something (card 1 is the default).
 */
export function buildDemoShareUrl(href, { seed, cycle = 1 } = {}) {
  const parsed = parseDemoSeed(seed);
  if (parsed === null) return null;
  const url = new URL(String(href));
  const kept = DEMO_SHARE_KEEP.map((key) => [key, url.searchParams.get(key)]).filter(([, value]) => value !== null);
  url.search = "";
  url.hash = "";
  url.searchParams.set(DEMO_SEED_PARAM, String(parsed));
  const card = parseDemoCycle(cycle);
  if (card > 1) url.searchParams.set(DEMO_CYCLE_PARAM, String(card));
  for (const [key, value] of kept) url.searchParams.set(key, value);
  return url.toString();
}
