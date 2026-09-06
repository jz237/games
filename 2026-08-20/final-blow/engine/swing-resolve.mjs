// ---------------------------------------------------------------------------
// v5.0 FULL SWING — the pose-resolution half of the substitution layer.
//
// `swingSubstitute` (fighter-kits) is the TABLE: motion/motion2 cell -> the
// same-generation ext3/ext4 (or unified / ext / ext2) drawing. This module is
// what sits between a fighter snapshot and that table: the 7-field context the
// table reads, the crouching-normal active-window override, and the drawable
// gate with its `alt` fallback. It lived inline in game.js (swingResolve) and
// was reachable only from a browser, which left the one gate that keeps the
// inverted ext4 air-hit cell off screen — the head-down, feet-in-the-air read
// the owner rejects — untested. Pure functions, no DOM: the caller passes the
// bank-routed drawable gate exactly as resolveMotionPose takes it.
// ---------------------------------------------------------------------------
import {
  UNIFIED_EXT3_BANK,
  UNIFIED_EXT3_CELLS,
  swingSubstitute,
} from "./fighter-kits.mjs";

/**
 * The substitution context for a fighter snapshot. The seven fields are what
 * `swingSubstitute` reads; `crouchActive` is the one extra the resolver needs
 * for the crouching normal's active window (see swingResolve).
 *
 * `crouching` is read from the ATTACK while one is in flight (its cancel
 * profile, "crouch-light" / "crouch-heavy") and from the stance otherwise —
 * a sweep keeps its crouched drawings even after the stick comes off down.
 * `falling` is the victim's descent with a knockdown pending: the moment the
 * airrec key hands over from the launched arch to the falling cell.
 */
export function swingContext(fighter) {
  const attack = fighter.attacking;
  const grounded = fighter.grounded;
  const victimAirborne = !grounded && (fighter.hitstunFrames > 0 || fighter.pendingKnockdown || fighter.airHitstunFrames > 0);
  const crouching = attack ? Boolean(attack.cancelProfileId?.startsWith("crouch")) : fighter.crouch;
  return {
    limb: attack?.limb === "kick" ? "kick" : "punch",
    heavy: attack?.kind === "heavy",
    crouching,
    attacking: Boolean(attack),
    airborne: !grounded,
    victimAirborne,
    falling: victimAirborne && fighter.vy > 0 && Boolean(fighter.pendingKnockdown),
    // A kit-less crouching normal inside its active window. That window has
    // no motion cell at all (it draws a base cell), so the table never sees
    // it; the resolver stands the crouch extension / sweep in directly.
    crouchActive: Boolean(attack) && crouching && !attack.animation
      && fighter.attackFrame >= attack.activeStartFrame && fighter.attackFrame < attack.activeEndFrame,
  };
}

/**
 * The swing substitution for a resolved pose, when its target cell can draw.
 *
 * `drawable(frame, bank)` is the BANK-ROUTED gate (motionBankCellDrawable in
 * game.js), not a swing-only one: a substitute may land on any authored bank
 * — ext3/ext4 mostly, but the unified crouch transition, the ext2 crouch
 * recover and the ext descent too. A target that cannot draw falls to its
 * `alt` when it has one and that can draw (the descent's chambered-air
 * fallback for the five sheets that never accepted their descent); otherwise
 * the resolved pose stands untouched, so timing never changes.
 */
export function swingResolve(pose, ctx, drawable) {
  let sub = swingSubstitute(pose.bank, pose.frame, ctx);
  // A crouching normal's active window has no motion cell at all (it draws a
  // base cell); the crouch extension / sweep stand in for it directly.
  if (!sub && ctx.crouchActive && pose.bank === "base") {
    sub = { bank: UNIFIED_EXT3_BANK, frame: ctx.limb === "kick" ? UNIFIED_EXT3_CELLS.sweep : UNIFIED_EXT3_CELLS.crouchPunchExt };
  }
  // The substitute may land on ANY authored bank (ext3/ext4 mostly, but the
  // unified crouch transition, the ext2 crouch recover and the ext descent
  // too), so the gate is the bank-routed one, not the swing-only one.
  if (sub && !drawable(sub.frame, sub.bank)) {
    sub = sub.alt && drawable(sub.alt.frame, sub.alt.bank) ? sub.alt : null;
  }
  if (!sub) return pose;
  return { bank: sub.bank, frame: sub.frame, fallback: pose };
}
