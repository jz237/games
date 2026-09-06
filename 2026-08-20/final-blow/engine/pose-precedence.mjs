// ---------------------------------------------------------------------------
// v5.3 SPECTACLE — THE CONTACT POSE PRECEDENCE (sweep item #52).
//
// Four branches of fighterPoseDescriptor decide what a fighter who has just
// been HIT or has just BLOCKED is drawing, and their ORDER is the whole of the
// behaviour. Written out as an if-ladder they read as four independent tests;
// they are not — each one is only correct because of what the ones above it
// already took. The order, and why:
//
//   1. STANDING BLOCKSTUN (`blockstunFrames > 0 && !crouch`). The authored
//      guard flinch owns the impact and the stance recovers behind it. Above
//      the flash branch because blockstun is the fact and the flash is the
//      decoration; a hit-cell read here made a blocked heavy look like a
//      landed one.
//   2. CROUCH BLOCKSTUN (`blockstunFrames > 0 && crouch && grounded`). A
//      separate branch, not a flag on the first, because the authored flinch
//      is a STANDING cover: v5.1 gave the low block its own crouch-guard
//      track (before it, a low-blocked heavy produced no pose change at all).
//      An AIRBORNE fighter in blockstun matches neither and falls through —
//      there is no air block in this game, so that is a corrupt state and the
//      ladder below draws it honestly rather than posing it.
//   3. THE CONTACT FLASH ON A GUARD (`(hitFlash > 0 || hitstunFrames > 21)`
//      with no hitstun and a guard up). v5.1: the flash OUTLIVES a jab's
//      4-tick blockstun, and this read used to borrow the clean-hit cell for
//      the remaining ticks — measured as unified:12 / ext4:1 at ticks 63-66
//      after a blocked jab with blockstun 0 and the guard still up. No
//      hitstun and a guard up is a BLOCK, not a hit, so it keeps the stance
//      (crouched or standing, whichever the fighter is in).
//   4. THE CONTACT FLASH ON A HIT — everything else in the flash window: the
//      light-hit cell.
//
// A pure function over a fighter SNAPSHOT (seven booleans and numbers, no
// kit, no bank, no atlas) so the order can be asserted exhaustively instead of
// pinned by a regex over game.js's source text. game.js keeps the drawings.
// ---------------------------------------------------------------------------

/** The named branches, in precedence order. */
export const POSE_BRANCHES = Object.freeze({
  blockstunStanding: "blockstun-standing",
  blockstunCrouch: "blockstun-crouch",
  flashGuardCrouch: "flash-guard-crouch",
  flashGuardStand: "flash-guard-stand",
  flashHit: "flash-hit",
});

/** Precedence order, for the tests and for anyone reading the ladder. */
export const POSE_BRANCH_ORDER = Object.freeze([
  POSE_BRANCHES.blockstunStanding,
  POSE_BRANCHES.blockstunCrouch,
  POSE_BRANCHES.flashGuardCrouch,
  POSE_BRANCHES.flashGuardStand,
  POSE_BRANCHES.flashHit,
]);

/**
 * The hitstun reading above which the contact pose is held even after the
 * flash has decayed — a heavy's opening ticks, so the recoil is not one frame
 * of flash and then the reaction ladder.
 */
export const CONTACT_FLASH_HITSTUN = 21;

/**
 * Which contact branch owns this fighter's drawing, or null when none does
 * (he is not in blockstun and not inside a contact flash, so the reaction
 * ladder, the wake-up track, the turnaround latch and the stance below all
 * still get their turn).
 *
 * `fighter` is any snapshot carrying: blockstunFrames, crouch, grounded,
 * hitFlash, hitstunFrames, guarding, block.
 */
export function contactPoseBranch(fighter = {}) {
  const blockstun = fighter.blockstunFrames > 0;
  if (blockstun && !fighter.crouch) return POSE_BRANCHES.blockstunStanding;
  if (blockstun && fighter.crouch && fighter.grounded) return POSE_BRANCHES.blockstunCrouch;
  if (!(fighter.hitFlash > 0 || fighter.hitstunFrames > CONTACT_FLASH_HITSTUN)) return null;
  if (fighter.hitstunFrames === 0 && (fighter.guarding || fighter.block)) {
    return fighter.crouch ? POSE_BRANCHES.flashGuardCrouch : POSE_BRANCHES.flashGuardStand;
  }
  return POSE_BRANCHES.flashHit;
}

/**
 * How far through blockstun the fighter is, 0..0.999. The observed TOTAL is
 * the honest denominator — the fighter only carries the countdown, so without
 * the observer's recorded total a long blockstun and a short one would both
 * read as one band — and `Math.max` against the live countdown keeps the
 * phase inside [0, 1) on the first tick, before the observer has seen it.
 */
export function blockstunPhase(blockstunFrames, observedTotal = 0) {
  const total = Math.max(blockstunFrames, observedTotal || 0);
  const phase = 1 - blockstunFrames / Math.max(1, total);
  return phase < 0 ? 0 : phase > 0.999 ? 0.999 : phase;
}
