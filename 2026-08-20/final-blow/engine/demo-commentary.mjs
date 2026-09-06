// ===========================================================================
// 5.4 FIGHT NIGHT — THE DEMO'S LOWER THIRD (demo sweep #12, and the text half
// of #21).
//
// A 175 s attract run books 22 announcer calls and 53 crowd swells and leaves
// NOTHING readable on the screen: the centre letter-slam lives 0.55-2.4 s,
// the attack-name popups are 9 px, and on a muted TV the show has no voice
// at all. The crowd, meanwhile, has taken sides since 5.3 (crowd.mjs deals a
// favourite per painted person from a per-round house lean) and nothing on
// the HUD says whom the room is backing.
//
// This module is the pure half of the fix: an EVENT BUS the demo's sim call
// sites feed (super, EX, counter hit, throw, tech, weapon pickup / throw,
// wall bounce, perfect guard, guard crush, first hit, clutch, comeback,
// finisher, round start / end), a TEXT LINE per event drawn from a seeded
// shuffle bag per kind (drawFromBag — the announcer/crowd/stinger contract,
// so no line ever repeats back to back), a hold/priority policy so the line
// reads as a broadcast lower third and not a ticker, and the ALLEGIANCE read
// (which side the room favours this round, from the 5.3 favourites split).
//
// Text only, on purpose: voiced colour commentary is a later, owner-approved
// item (new voice lines need his sign-off). The bus is shaped for it — every
// accepted event is published to subscribers with a `cue` name, so a voice
// bank can subscribe without touching a call site.
//
// Nothing here reads sim state. game.js feeds it through ONE gated function
// (demoCommentaryEmit: demo mode, active session, never during a rollback
// resimulation) and the observer is called from the demo's own per-tick
// branch, so a played match is byte-identical (tests/demo-commentary.test.mjs
// pins the gate from source; DEMO.md carries the checksum trace).
// ===========================================================================

import { DeterministicRng, hashSeed } from "./foundation.mjs";
import { drawFromBag } from "./announcer.mjs";

/** The health (0-100) at or under which a standing fighter is IN THE CLUTCH. */
export const DEMO_CLUTCH_HEALTH = 20;
/**
 * The health gap (opponent minus own, while in the clutch) a side must have
 * been behind by for its lead to read as a COMEBACK. Without it a round that
 * ends with both fighters under 20 called two comebacks as the lead traded
 * (measured: 4 in a two-round card on seed 237) — a trade is not a story.
 */
export const DEMO_COMEBACK_DEFICIT = 25;
/** A fresh line of higher priority cannot be replaced by a lower one inside this many ticks. */
export const DEMO_COMMENTARY_PROTECT_TICKS = 45;
/** Bounded memory for the QA readout. */
export const DEMO_COMMENTARY_RECENT_MAX = 24;

// Every kind the bus knows, in the order the brief names them plus the two
// round bookends that carry the allegiance and the score. A kind not in
// this list is refused by emit() so a typo at a call site cannot invent one.
export const DEMO_COMMENTARY_KINDS = Object.freeze([
  "first-hit",
  "super",
  "ex",
  "counter",
  "throw",
  "tech",
  "weapon-pickup",
  "weapon-throw",
  "wall-bounce",
  "perfect-guard",
  "guard-crush",
  "clutch",
  "comeback",
  "finisher",
  "round-start",
  "round-end",
]);

// The lines. Tokens are {NAME} (the side the event belongs to), {OTHER}
// (the opponent), {MOVE}, {WEAPON}, {HEALTH}, {ROUND}, {SCORE}, {FAV}, {A},
// {B}. Four to five per kind so a bag border is never a repeat and a three
// round card does not exhaust one. All caps: the bug is Impact and the line
// reads from across a room.
export const DEMO_COMMENTARY_LINES = Object.freeze({
  "first-hit": Object.freeze([
    "FIRST BLOOD · {NAME}",
    "{NAME} DRAWS FIRST",
    "FIRST TOUCH TO {NAME}",
    "{NAME} LANDS THE OPENER",
  ]),
  super: Object.freeze([
    "FULL GRIT SUPER · {NAME}",
    "{NAME} CASHES THE WHOLE BAR",
    "{NAME} EMPTIES THE TANK",
    "{NAME} GOES ALL IN",
    "EVERY DROP OF GRIT · {NAME}",
  ]),
  ex: Object.freeze([
    "EX {MOVE} · {NAME}",
    "{NAME} PAYS FOR THE {MOVE}",
    "GRIT ON THE {MOVE} · {NAME}",
    "{NAME} SPENDS HALF A BAR",
  ]),
  counter: Object.freeze([
    "COUNTER HIT · {NAME}",
    "{NAME} READ THAT ONE",
    "{OTHER} SWUNG INTO IT",
    "{NAME} STUFFS THE SWING",
    "CAUGHT ON THE STARTUP · {NAME}",
  ]),
  throw: Object.freeze([
    "THROW · {NAME}",
    "{NAME} GETS THE GRAB",
    "{NAME} TOSSES {OTHER}",
    "{OTHER} HELD ON TOO LONG",
  ]),
  tech: Object.freeze([
    "TECHED · {NAME}",
    "{NAME} BREAKS THE THROW",
    "{NAME} SAW THE GRAB COMING",
    "NO THROW FOR {OTHER}",
  ]),
  "weapon-pickup": Object.freeze([
    "{NAME} PICKS UP THE {WEAPON}",
    "STREET FURNITURE · {NAME}",
    "{NAME} ARMS UP",
    "{NAME} HAS THE {WEAPON}",
  ]),
  "weapon-throw": Object.freeze([
    "{NAME} THROWS THE {WEAPON}",
    "INCOMING · {NAME}",
    "{WEAPON} AWAY · {NAME}",
    "{NAME} LETS IT FLY",
  ]),
  "wall-bounce": Object.freeze([
    "OFF THE WALL · {NAME}",
    "{NAME} PUTS {OTHER} INTO THE WALL",
    "THE CORNER PAYS OFF · {NAME}",
    "{OTHER} EATS THE CORNER",
  ]),
  "perfect-guard": Object.freeze([
    "PERFECT GUARD · {NAME}",
    "{NAME} BLOCKS ON THE FRAME",
    "SPLIT-SECOND GUARD · {NAME}",
    "{NAME} SHUTS THE DOOR",
  ]),
  "guard-crush": Object.freeze([
    "GUARD CRUSH · {OTHER}",
    "{OTHER} IS WIDE OPEN",
    "{NAME} BREAKS THE GUARD",
    "{OTHER} BLOCKED ONE TOO MANY",
  ]),
  clutch: Object.freeze([
    "CLUTCH · {NAME} HOLDS ON AT {HEALTH}%",
    "{NAME} ON THE BRINK · {HEALTH}%",
    "{NAME} SURVIVES AT {HEALTH}%",
    "DOWN TO {HEALTH}% · {NAME} STILL STANDING",
  ]),
  comeback: Object.freeze([
    "COMEBACK · {NAME} FROM {HEALTH}%",
    "{NAME} WAS AT {HEALTH}% · NOW LEADS",
    "{NAME} TURNS IT AROUND FROM {HEALTH}%",
    "NEVER OUT · {NAME} FROM {HEALTH}%",
  ]),
  finisher: Object.freeze([
    "FINAL BLOW · {NAME} · {SCORE}",
    "{NAME} ENDS IT · {SCORE}",
    "THAT IS THE FINAL BLOW · {NAME} · {SCORE}",
    "CURTAIN · {NAME} · {SCORE}",
  ]),
  "round-start": Object.freeze([
    "THE ROOM IS BEHIND {FAV} · {A}-{B}",
    "{FAV}'S CROWD TONIGHT · {A}-{B}",
    "{A}-{B} · THIS ROOM WANTS {FAV}",
    "HOME LEAN {FAV} · {A}-{B}",
  ]),
  "round-end": Object.freeze([
    "{NAME} TAKES ROUND {ROUND} · {SCORE}",
    "ROUND {ROUND} TO {NAME} · {SCORE}",
    "{NAME} UP · {SCORE}",
    "{SCORE} · {NAME} ON THE BOARD",
  ]),
});

// Hold (ticks at 60 Hz) and priority per kind. A new line replaces the one
// on screen when its priority is at least the current line's, or once the
// current line is older than DEMO_COMMENTARY_PROTECT_TICKS; otherwise it is
// dropped (counted, never shown — a lower third that changes every 0.3 s in
// an exchange is a ticker nobody can read). Round bookends hold longest:
// they sit through the KO freeze and the round card. The bell's room read is
// the one long line that yields to EVERYTHING (priority 1): first contact
// lands 0.3-1.5 s after the bell (sweep #5), and FIRST BLOOD must not be
// swallowed by a line whose fact persists in the room row anyway.
export const DEMO_COMMENTARY_POLICY = Object.freeze({
  "first-hit": Object.freeze({ priority: 2, holdTicks: 150 }),
  super: Object.freeze({ priority: 3, holdTicks: 210 }),
  ex: Object.freeze({ priority: 1, holdTicks: 120 }),
  counter: Object.freeze({ priority: 2, holdTicks: 150 }),
  throw: Object.freeze({ priority: 2, holdTicks: 150 }),
  tech: Object.freeze({ priority: 2, holdTicks: 150 }),
  "weapon-pickup": Object.freeze({ priority: 2, holdTicks: 150 }),
  "weapon-throw": Object.freeze({ priority: 2, holdTicks: 150 }),
  "wall-bounce": Object.freeze({ priority: 2, holdTicks: 180 }),
  "perfect-guard": Object.freeze({ priority: 1, holdTicks: 120 }),
  "guard-crush": Object.freeze({ priority: 2, holdTicks: 180 }),
  clutch: Object.freeze({ priority: 2, holdTicks: 180 }),
  comeback: Object.freeze({ priority: 3, holdTicks: 300 }),
  finisher: Object.freeze({ priority: 3, holdTicks: 300 }),
  "round-start": Object.freeze({ priority: 1, holdTicks: 240 }),
  "round-end": Object.freeze({ priority: 3, holdTicks: 300 }),
});

const upper = (value) => String(value ?? "").toUpperCase();

/**
 * Token substitution. Unknown tokens become "", and a separator left dangling
 * by an empty token (" · " at either end, or doubled) is collapsed, so a
 * round-end line without a score still reads as a sentence.
 */
export function formatCommentaryLine(template, tokens = {}) {
  const filled = String(template).replace(/\{([A-Z]+)\}/g, (_, key) => upper(tokens[key]));
  return filled
    .replace(/(\s*·\s*){2,}/g, " · ")
    .replace(/^\s*·\s*/, "")
    .replace(/\s*·\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * The allegiance read: who the painted crowd favours this round, from the
 * 5.3 per-person favourites (crowd.mjs deals them from a per-round house
 * lean, so one round can be a 9-7 room and the next 5-11). `favourites` is
 * the [side 0, side 1] head count. A stage with no crowd (Janney Street) is
 * an empty street; an exact split is called a split.
 */
export function demoAllegiance({ favourites = [0, 0], names = ["", ""] } = {}) {
  const counts = [Math.max(0, Math.floor(Number(favourites?.[0]) || 0)), Math.max(0, Math.floor(Number(favourites?.[1]) || 0))];
  const total = counts[0] + counts[1];
  if (total === 0) return { kind: "empty", side: -1, counts, share: 0.5, text: "NO CROWD ON THIS STREET" };
  if (counts[0] === counts[1]) return { kind: "split", side: -1, counts, share: 0.5, text: `THE ROOM IS SPLIT · ${counts[0]}-${counts[1]}` };
  const side = counts[0] > counts[1] ? 0 : 1;
  const share = counts[side] / total;
  return {
    kind: "backs",
    side,
    counts,
    share,
    text: `THE ROOM BACKS ${upper(names?.[side])} · ${counts[side]}-${counts[1 - side]}`,
  };
}

/**
 * The bus. `seed` names the card (game.js hashes the director's seed with
 * the cycle, like the choreographer) so a seed replays the same lines; a
 * caller may hand in its own `random` instead.
 */
export function createDemoCommentaryBus({ seed = 1, random = null } = {}) {
  const rng = random ? null : new DeterministicRng(hashSeed(seed, "commentary"));
  const draw = random || (() => rng.nextFloat());
  const bags = new Map();
  const listeners = new Set();
  const counts = Object.fromEntries(DEMO_COMMENTARY_KINDS.map((kind) => [kind, 0]));
  const recent = [];
  let current = null;
  let emitted = 0;
  let dropped = 0;
  let sequence = 0;
  let allegiance = null;
  // Per-round latches for the observer: the first hit, each side's clutch
  // and comeback, and each side's minimum health so the comeback line can
  // say where the fighter came back from.
  let round = { firstHit: false, clutch: [false, false], comeback: [false, false], minHealth: [100, 100], deficit: [0, 0] };

  function publish(event) {
    for (const listener of listeners) listener(event);
  }

  function emit(kind, { side = -1, tick = 0, tokens = {} } = {}) {
    if (!DEMO_COMMENTARY_KINDS.includes(kind)) return null;
    const policy = DEMO_COMMENTARY_POLICY[kind];
    // The hold/priority rule: the line on screen keeps its place against a
    // lesser event while it is fresh.
    if (current && tick - current.tick < Math.min(current.holdTicks, DEMO_COMMENTARY_PROTECT_TICKS)
      && policy.priority < current.priority) {
      dropped += 1;
      return null;
    }
    const lines = DEMO_COMMENTARY_LINES[kind];
    const variant = drawFromBag(bags, kind, lines.length, draw);
    sequence += 1;
    const event = Object.freeze({
      id: sequence,
      kind,
      cue: `demo-${kind}`,
      side,
      tick,
      priority: policy.priority,
      holdTicks: policy.holdTicks,
      variant,
      line: formatCommentaryLine(lines[variant], tokens),
      tokens: Object.freeze({ ...tokens }),
    });
    current = event;
    emitted += 1;
    counts[kind] += 1;
    recent.push({ id: event.id, kind, tick, variant, line: event.line, side });
    while (recent.length > DEMO_COMMENTARY_RECENT_MAX) recent.shift();
    publish(event);
    return event;
  }

  /** The line to show at `tick`, or null once it has run its hold. */
  function currentAt(tick = 0) {
    if (!current) return null;
    if (tick - current.tick >= current.holdTicks) return null;
    return current;
  }

  /** A new round: the latches reset; the allegiance read is set from the crowd. */
  function roundStart({ tick = 0, names = ["", ""], favourites = [0, 0] } = {}) {
    round = { firstHit: false, clutch: [false, false], comeback: [false, false], minHealth: [100, 100], deficit: [0, 0] };
    allegiance = demoAllegiance({ favourites, names });
    if (allegiance.kind !== "backs") return null;
    return emit("round-start", {
      side: allegiance.side,
      tick,
      tokens: { FAV: names[allegiance.side], A: allegiance.counts[allegiance.side], B: allegiance.counts[1 - allegiance.side] },
    });
  }

  /**
   * The per-tick health observer (pure on what it is handed). Books CLUTCH
   * the first tick a standing side is at or under DEMO_CLUTCH_HEALTH, and
   * COMEBACK the first tick a side that has been in the clutch — and behind
   * by DEMO_COMEBACK_DEFICIT while there — holds the health lead. Once per
   * round per side; `phase` must be "fight".
   */
  function observe({ tick = 0, phase = "", health = [100, 100], names = ["", ""] } = {}) {
    if (phase !== "fight") return null;
    let event = null;
    for (const side of [0, 1]) {
      const own = Number(health[side]);
      round.minHealth[side] = Math.min(round.minHealth[side], own);
      if (!round.clutch[side] && own > 0 && own <= DEMO_CLUTCH_HEALTH) {
        round.clutch[side] = true;
        event = emit("clutch", { side, tick, tokens: { NAME: names[side], OTHER: names[1 - side], HEALTH: Math.max(1, Math.round(own)) } }) || event;
      }
      if (round.clutch[side] && own > 0) round.deficit[side] = Math.max(round.deficit[side], Number(health[1 - side]) - own);
    }
    for (const side of [0, 1]) {
      const own = Number(health[side]);
      const other = Number(health[1 - side]);
      if (round.clutch[side] && !round.comeback[side] && round.deficit[side] >= DEMO_COMEBACK_DEFICIT && own > other && other > 0) {
        round.comeback[side] = true;
        event = emit("comeback", { side, tick, tokens: { NAME: names[side], OTHER: names[1 - side], HEALTH: Math.max(1, Math.round(round.minHealth[side])) } }) || event;
      }
    }
    return event;
  }

  /** A landed hit: the first of the round is FIRST BLOOD; returns the event or null. */
  function noteHit({ side = 0, tick = 0, names = ["", ""] } = {}) {
    if (round.firstHit) return null;
    round.firstHit = true;
    return emit("first-hit", { side, tick, tokens: { NAME: names[side], OTHER: names[1 - side] } });
  }

  /**
   * The round settles. A winner who was in the clutch and never took the lead
   * before the KO came back on the deciding hit, so that round reads as a
   * comeback (with the score) rather than a plain round line; a Final Blow
   * round reads as the finisher (with the score); anything else is the round
   * line. One line per settled round — the three never stack.
   */
  function roundEnd({ winner = 0, tick = 0, names = ["", ""], roundNumber = 1, rounds = [0, 0], finisher = false } = {}) {
    const score = `${rounds[0]}-${rounds[1]}`;
    if (round.clutch[winner] && !round.comeback[winner] && round.deficit[winner] >= DEMO_COMEBACK_DEFICIT) {
      round.comeback[winner] = true;
      return emit("comeback", {
        side: winner,
        tick,
        tokens: { NAME: names[winner], OTHER: names[1 - winner], HEALTH: Math.max(1, Math.round(round.minHealth[winner])), SCORE: score },
      });
    }
    if (finisher) {
      return emit("finisher", {
        side: winner,
        tick,
        tokens: { NAME: names[winner], OTHER: names[1 - winner], SCORE: score },
      });
    }
    return emit("round-end", {
      side: winner,
      tick,
      tokens: { NAME: names[winner], OTHER: names[1 - winner], ROUND: roundNumber, SCORE: score },
    });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function stats() {
    return {
      emitted,
      dropped,
      counts: { ...counts },
      kinds: Object.keys(counts).filter((kind) => counts[kind] > 0).length,
      subscribers: listeners.size,
    };
  }

  return Object.freeze({
    emit,
    current: currentAt,
    roundStart,
    roundEnd,
    observe,
    noteHit,
    subscribe,
    stats,
    recent: () => recent.map((entry) => ({ ...entry })),
    allegiance: () => (allegiance ? { ...allegiance, counts: [...allegiance.counts] } : null),
    round: () => ({ ...round, clutch: [...round.clutch], comeback: [...round.comeback], minHealth: [...round.minHealth], deficit: [...round.deficit] }),
  });
}
