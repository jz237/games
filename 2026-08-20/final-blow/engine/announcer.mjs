// Announcer and clock truth (roadmap2 w51, sweep items #22/#27).
//
// Everything the round-end call and the final-ten-seconds clock DECIDE lives
// here as pure functions so it can be unit tested without a DOM: which banner
// sub a round ends on, which announcer cues that banner books (and in what
// order), what the clock tick sounds like at each second, and the no-repeat
// shuffle bag every announcer cue draws its take from. game.js keeps the
// side effects (announce(), announcerSay(), WebAudio) and calls in here for
// the facts. Nothing in this file reads sim state or RNG streams: callers
// pass the numbers in, so replay/rollback checksums cannot see it.

// How a round ended. The old finishRound had exactly two shapes — a finisher
// (type >= 0) or "everything else", which it called KNOCKOUT even when the
// clock ran out on two standing fighters. A decision is its own thing now.
export const ROUND_END_CAUSES = Object.freeze({
  finisher: "finisher",
  knockout: "knockout",
  decision: "decision",
});

/**
 * Classify a finished round. `timer` is the round clock at the moment
 * finishRound fires (seconds, 0 when expired) and `loserHealth` the loser's
 * health at that moment: a loser still holding health when the clock reads 0
 * was never knocked out. The finishing-window expiry path (phase "finish")
 * also reaches finishRound with type -1 but the loser is at 0 health and the
 * clock stopped above 0, so it still classifies as a knockout.
 */
export function roundEndCause({ finisherType = -1, timer = 99, loserHealth = 0 } = {}) {
  if (finisherType >= 0) return ROUND_END_CAUSES.finisher;
  if (timer <= 0 && loserHealth > 0) return ROUND_END_CAUSES.decision;
  return ROUND_END_CAUSES.knockout;
}

// Banner sub-line under "<NAME> WINS" per cause. The finisher banner is
// "FINAL BLOW" with its own sub, so it never asks.
export function roundEndBannerSub(cause) {
  return cause === ROUND_END_CAUSES.decision ? "DECISION" : "KNOCKOUT";
}

// Delay before the fighter call follows the primary call. Kept at the value
// the old " WINS" banner map used (950 ms) so the KO -> name spacing the
// owner already signed off on does not move; the announcer busy window still
// pushes it later when the primary take runs long.
export const FIGHTER_CALL_DELAY_MS = 950;

/**
 * The spoken calls for a round-ending banner, in order. Two truths the old
 * banner map got wrong:
 *   - a decision opens on the "timeover" bank (TIME OVER — DECISION! / THE
 *     CLOCK CALLS IT! / TIME! JUDGES' DECISION!), never "ko"; and
 *   - a ROUND win speaks the fighter's NAME bank while a MATCH win (this
 *     round reached roundsToWin) speaks the "<id>-wins" bank, so "THE
 *     WINNER — BENNY!" is only ever heard when Benny actually won the match.
 * Returns [{ cue, delay }] for announcerSay in that order.
 */
export function roundEndAnnouncerPlan({ cause = ROUND_END_CAUSES.knockout, matchWon = false, fighterId = "" } = {}) {
  const primary = cause === ROUND_END_CAUSES.decision ? "timeover" : "ko";
  const plan = [{ cue: primary, delay: 0 }];
  if (fighterId) {
    plan.push({ cue: `${fighterId}-${matchWon ? "wins" : "name"}`, delay: FIGHTER_CALL_DELAY_MS });
  }
  return plan;
}

// The clock speaks at exactly this reading, once per round (the announcer
// "tenseconds" bank). Ticks run from here down to the buzzer at 0.
export const CLOCK_CALLOUT_SECONDS = 10;
export const CLOCK_TICK_SECONDS = 10;

/**
 * The synthesised tick for a displayed clock reading in the final ten
 * seconds, or null above them. A pitch ladder rather than one blip: 880 Hz at
 * :10 rising 22 Hz per second, then a brighter, shorter 1320 Hz+ ladder under
 * :05 — so no two consecutive ticks are the same sound and the ear can count
 * down without looking at the digits (the owner plays on a phone where the
 * timer is 20 px tall). Reading 0 is the buzzer: a long two-partial square
 * "time" horn that stands in for the KO sample a decision must not play.
 * Every value is in the synthToneShot vocabulary (hz, seconds, peak).
 */
export function clockTickPlan(timer) {
  const seconds = Math.ceil(Number(timer));
  if (!Number.isFinite(seconds) || seconds > CLOCK_TICK_SECONDS || seconds < 0) return null;
  if (seconds === 0) {
    return { kind: "buzzer", hz: 196, seconds: 0.62, peak: 0.055, wave: "square" };
  }
  if (seconds <= 5) {
    return { kind: "tick", hz: 1320 + (5 - seconds) * 40, seconds: 0.05, peak: 0.05, wave: "triangle" };
  }
  return { kind: "tick", hz: 880 + (CLOCK_TICK_SECONDS - seconds) * 22, seconds: 0.08, peak: 0.042, wave: "triangle" };
}

/**
 * Shuffle-bag draw for a cue with `size` takes: every take plays once before
 * any repeats, and the reshuffle never lets the same take land back-to-back
 * across bag borders. `bags` is the caller's Map (per announcer, per fighter
 * voice — whatever scope needs the guarantee); `random` is the caller's
 * checksum-exempt source (visualRandom in game.js, seeded in tests). Moved
 * out of game.js verbatim so the no-repeat rule is a tested fact.
 */
export function drawFromBag(bags, cue, size, random = Math.random) {
  if (size <= 1) return 0;
  let bag = bags.get(cue);
  if (!bag || bag.size !== size) {
    bag = { size, order: [], position: 0, last: -1 };
    bags.set(cue, bag);
  }
  if (bag.position >= bag.order.length) {
    const order = Array.from({ length: size }, (_, index) => index);
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    if (order[0] === bag.last) [order[0], order[order.length - 1]] = [order[order.length - 1], order[0]];
    bag.order = order;
    bag.position = 0;
  }
  const pick = bag.order[bag.position];
  bag.position += 1;
  bag.last = pick;
  return pick;
}

/**
 * Dizzy ring parameters: three triangle chirps on a wobble LFO (the
 * perfectGuardTink family, not the KO sample). `variant` in [0, 1) is a
 * tick hash from the caller so back-to-back dizzies never ring identically:
 * the root walks across a minor-third band and the chirp spacing breathes.
 */
export function dizzyRingPlan(variant = 0) {
  const v = Math.min(0.999, Math.max(0, Number(variant) || 0));
  const root = 1040 * (1 + (v - 0.5) * 0.19);
  const gap = 0.11 + v * 0.03;
  return [0, 1, 2].map((index) => ({
    delay: index * gap,
    hz: root * [1, 1.26, 1.5][index],
    seconds: 0.34 - index * 0.04,
    peak: 0.03 - index * 0.006,
    vibratoRate: 6.5 + v * 2,
    vibratoDepth: 26 + index * 8,
  }));
}

// ---------------------------------------------------------------------------
// v5.3 SPECTACLE (sweep item #52) — THE BANNER -> SPEECH MAP.
//
// w51 moved the round-END call in here (roundEndAnnouncerPlan, above) but left
// the rest of announcerSpeakBanner's ladder inline in game.js: a chain of
// string equalities and one regex over the banner text, deciding which cue
// each banner books. It is pure — text in, cues out — and it carries two
// facts that are easy to break silently and impossible to see in a test that
// only greps the source: ROUND 3 and up speak "finalround" (not "round3",
// which has no bank), and the text-only " WINS" fallback books the fighter's
// NAME bank rather than his "-wins" bank, because without the round/match
// facts it cannot honestly claim he won the match.
//
// `fighterIdForName` is the caller's roster lookup (name -> id) so this file
// still knows nothing about the roster. `warmFighterVoices` is the one side
// effect the ladder had that is not speech: FIGHT! is the moment the sheets
// stop competing for bytes and the fighters' voice takes may pull theirs.
// ---------------------------------------------------------------------------

/** Banners that book exactly one cue, by exact text. */
export const BANNER_CUES = Object.freeze({
  "FIGHT!": "fight",
  "FINISH THEM": "finishthem",
  "GUARD CRUSH": "guardcrush",
  "FINAL BLOW": "ko",
});

/** ROUND n -> cue. Round 3 and beyond is the FINAL ROUND bank. */
export function roundBannerCue(round) {
  return round === 1 ? "round1" : round === 2 ? "round2" : "finalround";
}

const ROUND_BANNER = /^(?:ONLINE )?ROUND (\d+)$/;

/**
 * The cues a banner books, in order, plus whether it is the FIGHT! banner
 * (the caller tops up the fighter voice budget on that one). An unrecognised
 * banner books nothing, which is what every title/toast banner does today.
 */
export function bannerAnnouncerPlan(text, { fighterIdForName = () => "" } = {}) {
  const quiet = { plan: [], warmFighterVoices: false };
  if (typeof text !== "string" || !text) return quiet;
  const direct = BANNER_CUES[text];
  if (direct) return { plan: [{ cue: direct, delay: 0 }], warmFighterVoices: text === "FIGHT!" };
  const round = ROUND_BANNER.exec(text);
  if (round) return { plan: [{ cue: roundBannerCue(Number(round[1])), delay: 0 }], warmFighterVoices: false };
  if (text.endsWith(" WINS")) {
    // Text-only fallback (no caller uses it since w51 — finishRound always
    // passes an explicit plan). Without the round/match facts it can only be
    // honest about the KO call, so it books the name bank, never "-wins".
    const fighterId = fighterIdForName(text.slice(0, -" WINS".length)) || "";
    return { plan: roundEndAnnouncerPlan({ fighterId }), warmFighterVoices: false };
  }
  return quiet;
}
