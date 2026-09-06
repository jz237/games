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
import { ATTACK_LEVELS, GUARD_RULES, STUN_RULES } from "./defense.mjs";

// v5.1: ticks of a dizzy / guard crush that wear the ext4 reel before the
// sway. 12 ticks is one MOTION_HOLD_BUDGET and a half — long enough to read as
// a beat against a 128-tick dizzy, short enough that the wobble transform
// (which starts at full amplitude) is already carrying the sway when it lands.
export const REEL_ONSET_TICKS = 12;

// v5.2 LOCOMOTION: the dizzy loop's own beat. After the reel the loop used
// to hold the ext4 slump for the remaining ~116 ticks of a dizzy (14x the
// hold budget) with the wobble transform doing all the work; it now
// alternates the slump with the ext5 sway every DIZZY_SWAY_TICKS, keyed on
// the ELAPSED ticks of the dizzy / guard-crush clock (sim state, so a
// rollback resim and both renderers agree). The same 12 ticks as the reel,
// so the whole loop — reel, slump, sway, slump, sway... — is one cadence, and
// the 86-tick rotation sway in fighterMotionTransform rides across it.
export const DIZZY_SWAY_TICKS = REEL_ONSET_TICKS;

/** Parity of the dizzy / guard-crush clock, in DIZZY_SWAY_TICKS beats: true on the odd beats. */
export function dizzySwayBeat(fighter) {
  const elapsed = fighter.dizzyFrames > 0
    ? (fighter.dizzyTotalFrames || STUN_RULES.dizzyFrames) - fighter.dizzyFrames
    : fighter.guardCrushFrames > 0
      ? (fighter.guardCrushTotalFrames || GUARD_RULES.crushFrames) - fighter.guardCrushFrames
      : -1;
  if (!(elapsed >= 0)) return false;
  return Math.floor(elapsed / DIZZY_SWAY_TICKS) % 2 === 1;
}

/**
 * The substitution context for a fighter snapshot. The seven 5.0 fields plus
 * the three 5.1 reaction reads are what `swingSubstitute` reads; `crouchActive` is the one extra the resolver needs
 * for the crouching normal's active window (see swingResolve).
 *
 * `crouching` is read from the ATTACK while one is in flight (its cancel
 * profile, "crouch-light" / "crouch-heavy") and from the stance otherwise —
 * a sweep keeps its crouched drawings even after the stick comes off down.
 * `falling` is the victim's descent with a knockdown pending: the moment the
 * airrec key hands over from the launched arch to the falling cell.
 */
export function swingContext(fighter, { roundDecided = false } = {}) {
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
    // v5.1 EXT4 ROUTING — the three reads that pick a reaction drawing. All
    // are snapshotted sim state, so a rollback resim and both renderers agree.
    //   bodyBlow  a landed LOW (the level of the last contact) or a crouched
    //             victim opens on the doubled-over body blow, not the head
    //             snap. MID is the level nearly every normal carries (127 of
    //             the kits' 154 levelled moves; there is no HIGH), so a MID
    //             jab is a face hit — routing MID here made every light a body
    //             blow and starved the head snap. Gated on real hitstun so the
    //             clinch flinch stays a head snap.
    //   reeling   the first REEL_ONSET_TICKS of a dizzy or guard crush wear
    //             the backward reel before the authored sway takes the loop.
    //   ko        the round is decided against this fighter (`roundDecided`
    //             is the caller's phase read): the KO lying cell replaces the
    //             knockdown drawing once he is down. Never a plain
    //             knockdown's cell, so the wake-up chain is untouched.
    bodyBlow: fighter.hitstunFrames > 0
      && (Boolean(fighter.crouch) || fighter.lastHitLevel === ATTACK_LEVELS.LOW),
    reeling: (fighter.dizzyFrames > 0 && fighter.dizzyFrames > (fighter.dizzyTotalFrames || STUN_RULES.dizzyFrames) - REEL_ONSET_TICKS)
      || (fighter.guardCrushFrames > 0 && fighter.guardCrushFrames > (fighter.guardCrushTotalFrames || GUARD_RULES.crushFrames) - REEL_ONSET_TICKS),
    ko: Boolean(roundDecided) && fighter.health <= 0,
    // v5.2: the dizzy loop's beat — the odd DIZZY_SWAY_TICKS beats of the
    // dizzy / guard-crush clock wear the ext5 sway, the even ones the ext4
    // slump. Reeling wins for the onset (the table checks it first).
    swayBeat: dizzySwayBeat(fighter),
    // In blockstun the settle band's fallback is the light-hit cell (motion3
    // block-settle is not accepted on every sheet); the table keeps the flinch
    // for a blocking fighter rather than snapping his head on a block.
    blocking: fighter.blockstunFrames > 0,
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
 * `alt` when it has one and that can draw; an alt may carry an alt of its
 * own (v5.2: the air recover's degrade path is the 5.0 chain in its order —
 * the ext descent where a sheet accepted it, then the ext3 chamber), and the
 * gate is asked down that chain until one draws; otherwise the resolved pose
 * stands untouched, so timing never changes.
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
  while (sub && !drawable(sub.frame, sub.bank)) sub = sub.alt || null;
  if (!sub) return pose;
  return { bank: sub.bank, frame: sub.frame, fallback: pose };
}
