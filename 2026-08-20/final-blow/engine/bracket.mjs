// R2.1 STREETS wave 19 — THE PHILLY OPEN: a local (couch-only) 4- or 8-entrant
// single-elimination bracket. Pure bookkeeping in the modes.mjs style: who is
// seeded where, which match plays next, who advanced, who is champion — plus
// the persistence blob so an accidental reload resumes mid-bracket. Only ever
// TWO fighters exist in the sim; game.js maps each bracket match onto the
// existing versus / tournament match machinery.

import { AI_DIFFICULTIES } from "./ai.mjs";

export const BRACKET_SIZES = Object.freeze([4, 8]);
export const BRACKET_STORAGE_KEY = "final-blow-philly-open-v1";
export const BRACKET_FORMAT_VERSION = 1;

// Classic seeded draw: seed 1 meets the lowest seed first and can only meet
// seed 2 in the final. Values are ENTRANT indexes (entrant 0 = top seed).
const SEED_SLOTS = Object.freeze({
  4: Object.freeze([0, 3, 1, 2]),
  8: Object.freeze([0, 7, 3, 4, 1, 6, 2, 5]),
});

export const BRACKET_ROUND_NAMES = Object.freeze({
  4: Object.freeze(["SEMIFINALS", "THE FINAL"]),
  8: Object.freeze(["QUARTERFINALS", "SEMIFINALS", "THE FINAL"]),
});

const DIFFICULTY_IDS = Object.keys(AI_DIFFICULTIES);
const FIGHTER_ID_PATTERN = /^[a-z0-9-]{1,24}$/u;

export function bracketRoundName(size, round) {
  return BRACKET_ROUND_NAMES[size]?.[round] || `ROUND ${round + 1}`;
}

function normalizeEntrant(raw, index) {
  const fighter = String(raw?.fighter || "");
  if (!FIGHTER_ID_PATTERN.test(fighter)) throw new Error(`Entrant ${index + 1} needs a fighter.`);
  const human = Boolean(raw?.human);
  const difficulty = DIFFICULTY_IDS.includes(raw?.difficulty) ? raw.difficulty : "street";
  const label = String(raw?.label || "").toUpperCase().replace(/[^A-Z0-9 .-]/gu, "").slice(0, 12)
    || (human ? `PLAYER ${index + 1}` : "CPU");
  return { fighter, human, difficulty: human ? "" : difficulty, label, seed: index + 1 };
}

/**
 * Build a fresh bracket. `entrants` is 4 or 8 of {fighter, human, difficulty,
 * label} in SEED order (index 0 = top seed). Humans hot-seat one keyboard;
 * duplicates of a fighter are allowed (two people can both claim Deathblow).
 */
export function createBracket(entrants = []) {
  const size = entrants.length;
  if (!BRACKET_SIZES.includes(size)) throw new Error("The Philly Open runs 4 or 8 entrants.");
  const normalized = entrants.map((raw, index) => normalizeEntrant(raw, index));
  const slots = SEED_SLOTS[size];
  const rounds = [];
  let matches = size / 2;
  for (let round = 0; matches >= 1; round += 1, matches /= 2) {
    rounds.push(Array.from({ length: matches }, () => ({ slots: [-1, -1], winner: -1 })));
  }
  for (let index = 0; index < size; index += 1) {
    rounds[0][Math.floor(index / 2)].slots[index % 2] = slots[index];
  }
  return {
    format: BRACKET_FORMAT_VERSION,
    size,
    entrants: normalized,
    rounds,
    champion: -1,
    playedMatches: 0,
    createdAt: 0, // caller stamps for display only — never a decision input
  };
}

// The next unplayed match whose two slots are both filled, in round order.
export function nextBracketMatch(bracket) {
  if (!bracket || bracket.champion >= 0) return null;
  for (let round = 0; round < bracket.rounds.length; round += 1) {
    for (let index = 0; index < bracket.rounds[round].length; index += 1) {
      const match = bracket.rounds[round][index];
      if (match.winner < 0 && match.slots[0] >= 0 && match.slots[1] >= 0) {
        return {
          round,
          index,
          roundName: bracketRoundName(bracket.size, round),
          entrants: match.slots.map((slot) => bracket.entrants[slot]),
          slots: [...match.slots],
        };
      }
    }
  }
  return null;
}

/**
 * Record a finished match. `winnerSide` is 0/1 within the match. Advances the
 * winner into the next round's slot (top slot for even match index) and crowns
 * the champion when the final resolves. Returns a summary or null when the
 * coordinates are stale (already-decided match, bad indexes).
 */
export function reportBracketResult(bracket, round, index, winnerSide) {
  const match = bracket?.rounds?.[round]?.[index];
  if (!match || match.winner >= 0 || (winnerSide !== 0 && winnerSide !== 1)) return null;
  if (match.slots[0] < 0 || match.slots[1] < 0) return null;
  const winnerEntrant = match.slots[winnerSide];
  match.winner = winnerEntrant;
  bracket.playedMatches += 1;
  const isFinal = round === bracket.rounds.length - 1;
  if (isFinal) {
    bracket.champion = winnerEntrant;
  } else {
    bracket.rounds[round + 1][Math.floor(index / 2)].slots[index % 2] = winnerEntrant;
  }
  return {
    round,
    index,
    winner: winnerEntrant,
    loser: match.slots[1 - winnerSide],
    champion: bracket.champion,
    complete: bracket.champion >= 0,
  };
}

export function bracketComplete(bracket) {
  return Boolean(bracket && bracket.champion >= 0);
}

export function bracketSnapshot(bracket) {
  if (!bracket) return null;
  return {
    size: bracket.size,
    entrants: bracket.entrants.map((entrant) => ({ ...entrant })),
    rounds: bracket.rounds.map((round) => round.map((match) => ({ slots: [...match.slots], winner: match.winner }))),
    champion: bracket.champion,
    playedMatches: bracket.playedMatches,
    next: nextBracketMatch(bracket),
    complete: bracketComplete(bracket),
  };
}

// --------------------------------------------------------------------------
// Persistence — the reload-resume blob. Serialization is trivial; the
// deserializer re-derives every structural invariant instead of trusting the
// stored shape (localStorage is user-editable).
// --------------------------------------------------------------------------

export function serializeBracket(bracket) {
  return JSON.stringify({
    format: BRACKET_FORMAT_VERSION,
    size: bracket.size,
    entrants: bracket.entrants,
    winners: bracket.rounds.map((round) => round.map((match) => match.winner)),
    createdAt: bracket.createdAt,
  });
}

export function deserializeBracket(text) {
  let raw;
  try {
    raw = JSON.parse(String(text));
  } catch {
    return null;
  }
  if (!raw || raw.format !== BRACKET_FORMAT_VERSION || !BRACKET_SIZES.includes(raw.size)) return null;
  if (!Array.isArray(raw.entrants) || raw.entrants.length !== raw.size) return null;
  let bracket;
  try {
    bracket = createBracket(raw.entrants.map((entrant, index) => ({
      ...entrant,
      // Preserve stored humanity/difficulty; normalizeEntrant re-validates.
      human: Boolean(entrant?.human),
    })));
  } catch {
    return null;
  }
  bracket.createdAt = Math.max(0, Number(raw.createdAt) || 0);
  // Replay the recorded winners through the real advancement rules so a
  // tampered blob can only ever produce a legal bracket (or be refused).
  if (!Array.isArray(raw.winners) || raw.winners.length !== bracket.rounds.length) return null;
  for (let round = 0; round < bracket.rounds.length; round += 1) {
    const winners = raw.winners[round];
    if (!Array.isArray(winners) || winners.length !== bracket.rounds[round].length) return null;
    for (let index = 0; index < winners.length; index += 1) {
      const winner = Number(winners[index]);
      if (winner < 0 || !Number.isInteger(winner)) continue;
      const match = bracket.rounds[round][index];
      const side = match.slots.indexOf(winner);
      if (side < 0) return null; // impossible winner — refuse the blob
      if (!reportBracketResult(bracket, round, index, side)) return null;
    }
  }
  return bracket;
}
