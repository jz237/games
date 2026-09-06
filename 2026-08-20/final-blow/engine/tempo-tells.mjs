// ---------------------------------------------------------------------------
// v5.1 TEMPO TELLS — the whiff tax and the re-arm gap, made visible.
//
// 4.4 Tempo (WHIFF_RECOVERY_TAX) and 4.5 Re-Arm (ATTACK_REARM_FRAMES) exist to
// make fighting about reads instead of key-spam, but until this pass neither
// had a single pixel on screen: a mashing player just experienced "my button
// didn't come out", and the lab reported the UNTAXED recovery because the
// frame readout was snapshotted at attack start. Measured on jez's jab
// (S4 A3 R12): the whiff runs R12 + 6 tax + 4 re-arm = 22 frames of tail the
// player could not see, and every press in the last 4 was silently eaten.
//
// This module is the pure half: given a fighter's snapshotted sim fields it
// says which tell phase the drawing is in and how strong it should be, names
// the frame-meter phase, and formats the lab's frame-data line. Both
// renderers (drawFighter's 2D pass and renderer/three/fighters.mjs) read the
// SAME whiffTellState so the fringe agrees across worlds by construction.
// Nothing here is sim state — game.js writes fighter.whiffTell /
// attack.whiffTaxFrames / fighter.rearmDropTick at the sim sites and those
// plain fields ride the rollback snapshot for free.
// ---------------------------------------------------------------------------

export const TEMPO_TELL_RULES = Object.freeze({
  // Hot red — a fringe that survives Somerset's sodium floor and a phone at
  // arm's length. The super-ready aura is the fighter's accent; this is
  // deliberately NOT an accent so the two reads never look like one.
  whiffColor: "#ff3f55",
  // Muted grey-white for the re-arm flash: the body going pale for the gap
  // reads as "disarmed" without competing with a hit flash.
  rearmColor: "#c9d1de",
  textLabel: "WHIFF",
  textColor: "#ff6b7a",
  // Extension-cell ghosts trailing behind the taxed follow-through (scaled by
  // performance.trailScale, dropped under reduced motion).
  ghostTrailCopies: 2,
  // A press eaten by the re-arm gap flashes the body for this many ticks —
  // longer than the 4-frame gap so the last mash is still visible after the
  // fighter is free again.
  dropFlashTicks: 6,
});

/**
 * The tell phase for one fighter at `tick`:
 *   whiff  — the swing has closed on nothing (attack.whiffTaxed) and is still
 *            running; `taxed` is true for the extra frames the tax added,
 *            which is what the frame meter colours differently.
 *   rearm  — the swing is over and attackRearmFrames is counting down.
 *   none   — otherwise.
 * `strength` is the drawing's 0..1 weight (holds through the whiff, fades
 * across the re-arm gap); `dropFlash` is 0..1 for a press the gap ate.
 */
export function whiffTellState(fighter, tick = 0) {
  const none = {
    phase: "none", strength: 0, taxed: false, taxFrames: 0, taxLeft: 0,
    rearmFrames: 0, rearmLeft: 0, dropFlash: 0,
  };
  if (!fighter) return none;
  const dropTick = Number.isFinite(fighter.rearmDropTick) ? fighter.rearmDropTick : null;
  const dropAge = dropTick === null ? Infinity : tick - dropTick;
  const dropFlash = dropAge >= 0 && dropAge < TEMPO_TELL_RULES.dropFlashTicks
    ? 1 - dropAge / TEMPO_TELL_RULES.dropFlashTicks : 0;
  const attack = fighter.attacking;
  if (attack && attack.whiffTaxed) {
    const taxFrames = Math.max(0, attack.whiffTaxFrames || 0);
    const total = attack.totalFrames || 0;
    const frame = fighter.attackFrame || 0;
    const tailStart = total - taxFrames;
    const taxed = taxFrames > 0 && frame >= tailStart;
    const taxLeft = taxed ? Math.max(0, total - frame) : taxFrames;
    return {
      phase: "whiff",
      // The fringe lights the moment the active window closes on nothing and
      // burns hotter through the taxed tail — the part of the tail that is
      // the player's own fault.
      strength: taxed ? 1 : 0.7,
      taxed, taxFrames, taxLeft,
      rearmFrames: fighter.whiffTell?.rearmFrames || 0,
      rearmLeft: 0,
      dropFlash,
    };
  }
  const rearmLeft = Math.max(0, fighter.attackRearmFrames || 0);
  if (!attack && rearmLeft > 0) {
    const rearmFrames = Math.max(rearmLeft, fighter.whiffTell?.rearmFrames || 0);
    return {
      phase: "rearm",
      // 1 → 0.25 across the gap, so the last frame is still a visible read.
      strength: 0.25 + 0.75 * (rearmLeft / rearmFrames),
      taxed: false,
      taxFrames: fighter.whiffTell?.taxFrames || 0,
      taxLeft: 0,
      rearmFrames, rearmLeft,
      dropFlash,
    };
  }
  return dropFlash > 0 ? { ...none, dropFlash } : none;
}

/**
 * The training-lab frame meter phase. The pre-5.1 meter returned "recovery"
 * for the taxed tail and "idle" for the re-arm gap, so the lab literally
 * could not show the two rules that make mashing lose. Order matters: stun
 * outranks a swing (a hit interrupts it), and the re-arm gap only exists
 * with no swing live.
 */
export function trainingFramePhase(fighter) {
  if (!fighter) return "idle";
  if (fighter.dizzyFrames > 0 || fighter.hitstunFrames > 0) return "hitstun";
  if (fighter.blockstunFrames > 0) return "blockstun";
  const move = fighter.attacking;
  if (move) {
    if (fighter.attackFrame < move.activeStartFrame) return "startup";
    if (fighter.attackFrame < move.activeEndFrame) return "active";
    return whiffTellState(fighter).taxed ? "whiff" : "recovery";
  }
  return (fighter.attackRearmFrames || 0) > 0 ? "rearm" : "idle";
}

/**
 * The lab's FRAME DATA line. `JAB · S4 A3 R12` while the swing is authored;
 * once it whiffs, `R12+6 WHIFF · RE-ARM 4F` — the recovery the fighter
 * actually ran. Short enough for the phone panel's 1.6fr column.
 */
export function trainingFrameDataLabel(move) {
  if (!move) return "—";
  let label = `${move.name} · S${move.startup} A${move.active} R${move.recovery}`;
  if (move.whiffTax > 0) label += `+${move.whiffTax} WHIFF`;
  if (move.rearm > 0) label += ` · RE-ARM ${move.rearm}F`;
  return label;
}

/**
 * The lab record of a whiff, merged into training.lastMove at the tax site
 * (the readout used to be snapshotted at attack START, before the tax could
 * land, so it always showed the authored R).
 */
export function noteWhiffOnMove(move, taxFrames, rearmFrames) {
  if (!move) return null;
  return { ...move, whiffTax: Math.max(0, taxFrames | 0), rearm: Math.max(0, rearmFrames | 0) };
}
