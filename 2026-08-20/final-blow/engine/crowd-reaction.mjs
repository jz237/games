// ---------------------------------------------------------------------------
// v5.3 SPECTACLE — THE CROWD REACTION STATE MACHINE (sweep item #52).
//
// `state.crowdReaction` is the room's excitement, and four separate things
// write it: a stir (a big hit, a taunt, a stage beat) adds to it, the fixed
// step decays it, a round reset zeroes it, and the KO hold OVERRIDES it with
// a curve for the length of the hold. Those four rules used to be four places
// in game.js — stirCrowd at one end of the file, the decay line inside the
// fixed step, resetCrowd beside the crowd builder, the hold latch a thousand
// lines away beside the round-win beat — and the only test of any of them was
// a regex over the source text.
//
// They are one machine and they are pure, so they are one file now. The
// FIELD NAMES ARE UNCHANGED and the functions take the live `state` object:
// `state.crowdReaction`, `state.crowdStirSide`, `state.crowdSplatX` and
// `state.crowdSplatTick` are read by the 2D crowd draw, the CINEMA 3D
// billboards, the crowd audio bus, the QA snapshot and the browser smoke
// probe, and renaming them for tidiness would have been a user-visible change
// dressed as a refactor.
//
// None of this is snapshotted for rollback (nothing in the fight reads it
// back), and none of it is RNG — a resimulated tick recomputes the same
// decay from the same start, which is why the decay may live on the sim path
// at all.
// ---------------------------------------------------------------------------

import { crowdKoHoldReaction } from "./crowd-voice.mjs";
import { stirPulseKind } from "./ambient.mjs";

export const CROWD_REACTION = Object.freeze({
  // The ceiling a stir saturates at. Same number as the KO stir (1.4), so the
  // biggest moment in a round cannot be out-shouted by two ordinary ones.
  ceiling: 1.4,
  // Per fixed step. 1.4 -> 0 in 88 ticks (1.47 s): long enough that a combo's
  // hits stack into one reaction, short enough that the room is back on its
  // routes before the next exchange.
  decayPerTick: 0.016,
  // A stir at or above this latches the one-shot crowd swell/gasp on the
  // render-side crowd bus. Below it the people react and the bus does not.
  swellThreshold: 0.5,
  // -1 is an AUTHORLESS stir (a taunt, a stage beat): everyone past their
  // threshold cheers, which is exactly the pre-5.3 read.
  authorless: -1,
});

/** The fields the machine owns, for a fresh state or a round reset. */
export function crowdReactionDefaults() {
  return { crowdReaction: 0, crowdStirSide: CROWD_REACTION.authorless, crowdSplatX: 0, crowdSplatTick: -1e9 };
}

/**
 * A stir. Returns what the CALLER still has to do with its own side effects:
 * the ambient pulse kind to latch (null for a stir under the threshold) and
 * whether the crowd bus owes a swell. `side` is who landed it (0/1, or -1);
 * `splatX` marks a wall splat / near-KO blow the people near it flinch from.
 */
export function stirCrowdReaction(obs, amount = 1, { side = CROWD_REACTION.authorless, splatX = null, tick = 0 } = {}) {
  obs.crowdReaction = Math.min(CROWD_REACTION.ceiling, obs.crowdReaction + amount);
  if (side === 0 || side === 1) obs.crowdStirSide = side;
  if (splatX !== null) {
    obs.crowdSplatX = splatX;
    obs.crowdSplatTick = tick;
  }
  return { pulseKind: stirPulseKind(amount), swell: amount >= CROWD_REACTION.swellThreshold };
}

/**
 * One fixed step of decay. Once the room has settled nobody is reacting to
 * anybody, so the author is dropped too and the next AUTHORLESS stir cannot
 * inherit the last hit's side (which would have half the crowd wincing at a
 * taunt that was not aimed at them).
 */
export function decayCrowdReaction(obs) {
  obs.crowdReaction = Math.max(0, obs.crowdReaction - CROWD_REACTION.decayPerTick);
  if (obs.crowdReaction <= 0) obs.crowdStirSide = CROWD_REACTION.authorless;
  return obs.crowdReaction;
}

/**
 * A round reset: the room starts every round on its routes, with no author.
 *
 * THE ONE DELIBERATE DIFFERENCE from the pre-extraction reset, written down:
 * game.js's resetCrowd cleared the reaction, the author and the splat TICK
 * but left `crowdSplatX` holding the previous round's impact point. Nothing
 * could read it — crowdFlinchLevel is 0 past 26 ticks and the tick was
 * -1e9 — so the only place it showed was the debug snapshot's `splat.x`,
 * beside an age of a billion. A machine that resets three of its four fields
 * is a latent bug waiting for a fourth reader, so the reset is the whole
 * default now.
 */
export function resetCrowdReaction(obs) {
  Object.assign(obs, crowdReactionDefaults());
  return obs;
}

// --- The KO hold latch -----------------------------------------------------
//
// v5.1 KO MOMENT: while the hold is latched the crowd draw, the CINEMA 3D
// billboards, the scuffles, the cups, the flashbulbs and the crowd bed all
// read the HOLD CURVE instead of the decaying sim value, so the room stays up
// for the whole 294-tick hold instead of the 2.5 ticks a heavy-hit KO's decay
// bought (measured on 20 seeds: 6-10% of the painted people on the cheer cell).
//
// Render-side, never sim state, never resimulated, and IDEMPOTENT — every
// consumer may poke the latch, which is why it can be read from a draw, from
// the audio bus and from the QA hook in the same frame.

/** A fresh latch. */
export function createCrowdKoHold() {
  return { startTick: -1, cheerFired: false };
}

/**
 * Should the hold be live? The roundover phase on the fight screen — except
 * during a fatality's PRE-KILL cinematic, which is observed through
 * `finisher.slowMotionHits` exactly the way the music bed's swell is, so the
 * crowd stays hushed until the kill actually lands.
 */
export function crowdKoHoldLive({ screen = "", phase = "", finisher = null } = {}) {
  return screen === "fight" && phase === "roundover"
    && (!finisher || (finisher.slowMotionHits || 0) > 0);
}

/** Latch or release. Idempotent: the same `live` twice changes nothing. */
export function updateCrowdKoHoldLatch(hold, live, tick = 0) {
  if (live) {
    if (hold.startTick < 0) {
      hold.startTick = tick;
      hold.cheerFired = false;
    }
  } else if (hold.startTick >= 0) {
    hold.startTick = -1;
    hold.cheerFired = false;
  }
  return hold;
}

/** Ticks since the hold latched, or -1 when it is not latched. */
export function crowdKoHoldAge(hold, tick = 0) {
  return hold.startTick < 0 ? -1 : tick - hold.startTick;
}

/**
 * What the crowd DRAWS on this tick: the hold curve when it is latched, the
 * decaying stir otherwise. `Math.max` rather than a branch so the frame a
 * hold latches on cannot dip below the stir that caused it.
 */
export function crowdDrawReaction(reaction, holdAge) {
  return Math.max(reaction, crowdKoHoldReaction(holdAge));
}
