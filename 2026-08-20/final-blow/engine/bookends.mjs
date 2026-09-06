// ---------------------------------------------------------------------------
// v5.2 LOCOMOTION (bookends) — the round's two bookends as BEATS.
//
// Item two put the ext5 entrance and the ext5 victory on screen as one held
// cell each: the seed-and-side pick chose entrance A OR B for the whole 1.3 s
// walk-on, and the win pose held the victory for the whole 4.9 s curtain call
// on every showcase pick. Both are now two-beat reads keyed on the phase
// clock the sim already snapshots (`state.phaseTime`, counting down), so a
// rollback resim and both renderers agree, and nothing in the sim moves:
//
//   intro   entrance A for the first half of the walk-on, entrance B for the
//           second, then the unified idle for the 0.95 s before FIGHT! — on
//           BOTH fighters, in that order. The pre-5.2 fallback (the motion
//           signature the seed-and-side pick chose) rides under both beats,
//           so a fighter whose ext5 sheet is held reads exactly as before.
//   win     the ext5 victory through the "<name> WINS" call, then the ext5
//           taunt as the SECOND beat — on the two showcase picks that were
//           the rotation's own second drawings (the motion victory2 and the
//           second signature), and only when the hold leaves the taunt a
//           whole beat to read (the demo's 3.1 s KO hold does not). The
//           kit's own pick (0) holds the victory: one drawing was always what
//           that pick meant.
// ---------------------------------------------------------------------------
import { UNIFIED_EXT5_CELLS } from "./fighter-kits.mjs";

/** The intro clock (seconds) below which the walk-on releases to the idle — the 2.7 FRAMES value. */
export const INTRO_ENTRANCE_RELEASE_SECONDS = 0.95;
/** The intro clock at which entrance A hands to entrance B: the midpoint of the 2.25 -> 0.95 walk-on. */
export const INTRO_ENTRANCE_SECOND_BEAT_SECONDS = 1.6;

/** Which ext5 entrance the walk-on wears at `phaseTime` (counting down), or null once released. */
export function introEntranceCell(phaseTime) {
  if (!(phaseTime > INTRO_ENTRANCE_RELEASE_SECONDS)) return null;
  return phaseTime > INTRO_ENTRANCE_SECOND_BEAT_SECONDS ? UNIFIED_EXT5_CELLS.entranceA : UNIFIED_EXT5_CELLS.entranceB;
}

/** The plain-KO curtain call (seconds) — the value finishRound has always set. */
export const ROUND_WIN_HOLD_SECONDS = 4.9;
/** The "<name> WINS" call is 2.4 s; the winner holds the victory through it. */
export const ROUND_WIN_TAUNT_AFTER_SECONDS = 2.4;
/** A second beat needs at least this long on screen to read as one. */
export const ROUND_WIN_TAUNT_MIN_SECONDS = 1;

/**
 * The showcase cell for the round-win pose: `pick` is the seed-and-rounds
 * rotation (0 the kit's victory, 1 the motion victory2, 2 the second
 * signature), `elapsed` the seconds into the hold, `hold` the hold's length.
 */
export function roundWinShowcaseCell(pick, elapsed, hold = ROUND_WIN_HOLD_SECONDS) {
  const wantsTwo = pick !== 0 && hold - ROUND_WIN_TAUNT_AFTER_SECONDS >= ROUND_WIN_TAUNT_MIN_SECONDS;
  if (wantsTwo && elapsed >= ROUND_WIN_TAUNT_AFTER_SECONDS) return UNIFIED_EXT5_CELLS.taunt;
  return UNIFIED_EXT5_CELLS.victory;
}
