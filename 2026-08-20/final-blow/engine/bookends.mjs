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
import { ROUND_END_CAUSES } from "./announcer.mjs";
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

// ---------------------------------------------------------------------------
// v5.3 SPECTACLE (ko-collapse) — the round's THIRD bookend: the loser going
// down.
//
// 5.2 shipped the entrance and the curtain call and left the body standing in
// between. checkKnockout opens the Final Blow window by explicitly UN-downing
// the victim (`down = false`, `knockdownFrames = 0`, `stun = 99`,
// `hitstunFrames = 5940`) so he is dazed on his feet for the 6 s stand-off —
// which is right for the stand-off and wrong for everything after it. When
// the window EXPIRES with no finisher, finishRound flipped straight to
// roundover and nothing ever put him down: the pose read fell through to the
// `hitstunFrames > 21` branch and drew unified:12 / ext4:1 — the head-snap,
// upright, feet planted — for the whole 4.9 s hold while the winner ran the
// ext5 victory beside him. The ext4 KO lie (cell 15) was already routed:
// swingSubstitute maps unified `knockdown` -> ext4:15 under the resolver's
// `ko` context (roundDecided && health <= 0), so the drawing existed and the
// only thing missing was a fighter who was actually DOWN.
//
// So the collapse is a knockdown flag on a decided round, not a new system.
// The three decisions are here, pure, because two of them are read from the
// sim path every tick and the third gates a sound:
//
//   koCollapseOnRoundEnd  fires ONCE at the finish->roundover edge. The
//                         cause classification is announcer.mjs's (the same
//                         one the banner and the "K.O.!" call already read),
//                         so a DECISION never lays anyone down and a FINAL
//                         BLOW keeps its own script.
//   koCollapseHolds       true while a KO'd loser's lie must not tick away.
//                         The knockdown countdown is 48 ticks; the roundover
//                         hold is 294. Left alone the loser would stand back
//                         up 0.8 s into the curtain call — the wake-up rung
//                         rising off a KO lie, which is the read the item
//                         exists to forbid. The countdown still RUNS (the
//                         crumple band below depends on it); it floors at 1
//                         instead of 0, so `wakeupFrames` is never armed and
//                         the result screen and the rematch open clean.
//   koCollapseThudTick    the tick the body reaches the boards: the crumple
//                         band's last frame. The thud and the dust puff are
//                         spent HERE, ~117 ms after the flag, not at the
//                         phase edge with the fighter still upright.
//
// Nothing here moves a clock the player can see: phaseTime, the 4.9 s hold,
// DEFENSE_RULES.knockdownFrames and the crowd's KO hold latch are untouched.
// ---------------------------------------------------------------------------
/**
 * How many ticks the collapse spends on the crumple (ext4:9, knees buckling)
 * before the body is flat on the boards (ext4:15). It is the SAME band the
 * ordinary knockdown already draws — game.js reads the crumple while
 * `knockdownFrames > DEFENSE_RULES.knockdownFrames - 7` — quoted here so the
 * landing beat and the drawing cannot drift apart.
 */
export const KO_COLLAPSE_CRUMPLE_TICKS = 7;

/**
 * Does the round that just ended lay its loser down? Only a KNOCKOUT does,
 * and only if he is on his feet on the ground: a decision leaves two standing
 * fighters, a Final Blow owns the victim through its own cinematic, and a
 * loser already prone (a knockdown that coincided with the clock) is left
 * exactly where he is rather than re-entering the knockdown.
 */
export function koCollapseOnRoundEnd({ cause, health = 0, down = false, grounded = true } = {}) {
  if (cause !== ROUND_END_CAUSES.knockout) return false;
  if (down || !grounded) return false;
  return health <= 0;
}

/**
 * Is this fighter's knockdown the decided round's KO lie — the one that must
 * hold rather than count down into a wake-up? Derived entirely from state the
 * snapshot already carries (phase, the finisher fields, health, down), so a
 * rollback resimulation reaches the same answer without a new field.
 */
export function koCollapseHolds({
  phase = "fight", finisher = false, finisherType = -1, health = 0, down = false,
} = {}) {
  if (phase !== "roundover" && phase !== "result") return false;
  if (finisher || finisherType >= 0) return false;
  return Boolean(down) && health <= 0;
}

/**
 * The single tick on which the collapsing body reaches the boards, given the
 * knockdown counter AFTER this tick's decrement. `total` is
 * DEFENSE_RULES.knockdownFrames (48), so the landing lands on the frame the
 * crumple band hands over to the KO lie.
 */
export function koCollapseThudTick(knockdownFrames, total = 48) {
  return knockdownFrames === Math.max(0, total - KO_COLLAPSE_CRUMPLE_TICKS);
}
