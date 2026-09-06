// ---------------------------------------------------------------------------
// v5.0 AMBIENT REACTIONS — the pulse state machine.
//
// A presentation-side pulse the stage life reacts to (the Vet's floodlights
// flare and a burst goes up over the bowl, the wok flares, the gulls scatter).
// It is latched from the crowd stir at 0.7 and above and from the KO phase
// change, decays linearly over 48 ticks, and is never sim state — nothing
// here is snapshotted or resimulated. The math lived inline in game.js
// (pulseAmbient / stirCrowd / drawStageAmbient) where a threshold retune, a
// reduced-motion flag or a stage without the pulse branch could zero the
// owner's "reactions must be visible" bar with nothing red. game.js keeps the
// `rollbackResimulating` guard and the `state` reads; the arithmetic is here.
// ---------------------------------------------------------------------------

/** Ticks a pulse lives: 0..1 over the first ~40 ticks after a big moment, then gone. */
export const AMBIENT_PULSE_TICKS = 48;
/** A crowd stir this big (stirCrowd's amount) latches a pulse at all. */
export const AMBIENT_STIR_THRESHOLD = 0.7;
/** ...and this big is a "big" pulse rather than a "splat". */
export const AMBIENT_BIG_THRESHOLD = 1;
/** The KO pulse: same amount the winning hit's stir uses (stirCrowd(1.4)). */
export const AMBIENT_KO_AMOUNT = 1.4;

/** The latch's rest state: no phase seen, a pulse so old it reads as zero. */
export function createAmbientObs() {
  return { phase: null, pulseTick: -100000, pulseAmount: 0, pulseKind: "" };
}

/** Latch a pulse at `tick`. Always overwrites: the newest moment wins. */
export function pulseAmbientLatch(obs, kind, amount, tick) {
  obs.pulseTick = tick;
  obs.pulseAmount = amount;
  obs.pulseKind = kind;
  return obs;
}

/**
 * Which pulse a crowd stir of `amount` latches: "big" from 1 up, "splat" from
 * 0.7 up, nothing below (a 0.25 whiff-stir and a 0.5 block-stir never flare a
 * floodlight). Pure; stirCrowd feeds it the same amount it adds to the crowd.
 */
export function stirPulseKind(amount) {
  if (!(amount >= AMBIENT_STIR_THRESHOLD)) return null;
  return amount >= AMBIENT_BIG_THRESHOLD ? "big" : "splat";
}

/**
 * The KO latch, read once per drawn frame. Records the phase it saw and, on
 * the change INTO finish/roundover while the fight screen is up, returns the
 * KO pulse to latch; every other change (and no change) returns null. The
 * caller latches through its guarded pulseAmbient so a resimulated tick
 * cannot re-fire it. Note the phase is recorded even when no pulse fires:
 * the latch is one-shot per phase change, never per frame.
 */
export function ambientPhaseChange(obs, phase, screen) {
  if (phase === obs.phase) return null;
  obs.phase = phase;
  return (phase === "finish" || phase === "roundover") && screen === "fight"
    ? { kind: "ko", amount: AMBIENT_KO_AMOUNT }
    : null;
}

/**
 * The pulse read at `frame`: `pulse` 0..1 (linear decay over
 * AMBIENT_PULSE_TICKS, amount clamped to 1 so a 1.4 KO latch starts at full),
 * `pulseAge` in ticks (negative before the latch tick, which reads as zero),
 * `ko` while a KO pulse is still live. Reduced motion zeroes the level but
 * not the age, so the firework seeds keyed off the latch tick stay stable.
 */
export function ambientPulseLevel(obs, frame, reduced = false) {
  const pulseAge = frame - obs.pulseTick;
  const pulse = reduced || pulseAge < 0 || pulseAge > AMBIENT_PULSE_TICKS
    ? 0
    : (1 - pulseAge / AMBIENT_PULSE_TICKS) * Math.min(1, obs.pulseAmount);
  return { pulseAge, pulse, ko: obs.pulseKind === "ko" && pulse > 0 };
}
