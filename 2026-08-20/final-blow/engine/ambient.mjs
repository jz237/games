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

// ---------------------------------------------------------------------------
// v5.1 STAGE KO BEATS — the four stages that got one hook in 5.0 (buffet,
// cruise, Somerset, Wildwood) answer big hits and the KO with their own
// furniture at the Vet's level. The big-hit read is the pulse above; the KO
// read is the crowd's KO hold (crowdKoHoldAge() in game.js, latched on the
// roundover edge and held for the whole 4.9 s), so the stage and the crowd
// celebrate the same moment. Everything below is pure so a stutter, a synced
// eruption or a horn pick can never diverge between replay and live play.
// ---------------------------------------------------------------------------

/** Ticks the KO flash lives: the same 48 the pulse decays over. */
export const AMBIENT_KO_BEAT_TICKS = 48;

/**
 * The stage's KO beat off the crowd hold age (-1 when no hold is live, else
 * ticks since the roundover edge). `flash` is 1 at the edge and decays
 * linearly to 0 over AMBIENT_KO_BEAT_TICKS; `hold` stays true for the whole
 * roundover so the slow furniture (the sign chase, the horn light, the
 * gulls) can ride the entire hold. Reduced motion zeroes the flash and drops
 * the hold — the latch itself is game.js state and still fires the horn.
 */
export function ambientKoBeat(holdAge, reduced = false) {
  if (reduced || !(holdAge >= 0)) return { age: holdAge, flash: 0, hold: false };
  const flash = holdAge < AMBIENT_KO_BEAT_TICKS ? 1 - holdAge / AMBIENT_KO_BEAT_TICKS : 0;
  return { age: holdAge, flash, hold: true };
}

/**
 * The single "how hard is the stage reacting" read the four stages draw
 * from: whichever of the big-hit pulse and the KO flash is stronger, with
 * the age of that one (so an eruption keyed off `age` rises from the moment
 * that actually fired). `ko` is true when the KO beat is the one driving,
 * which is also the only time `hold` is worth reading.
 */
export function ambientSurge(level, beat) {
  const pulse = level && level.pulse > 0 ? level.pulse : 0;
  const flash = beat && beat.flash > 0 ? beat.flash : 0;
  if (flash >= pulse && flash > 0) return { level: flash, age: beat.age, ko: true, hold: Boolean(beat.hold) };
  return { level: pulse, age: pulse > 0 ? level.pulseAge : -1, ko: false, hold: Boolean(beat && beat.hold) };
}

/**
 * The "all together now" cycle for furniture that idles on its own rhythm
 * (the pool's five splash plumes, the buffet steam, Somerset's pigeons):
 * for the first `window` ticks after a surge the cycle position is
 * `age + stagger`, so every piece fires at once with a small per-piece
 * offset; outside that window the caller's idle rhythm comes back.
 */
export function ambientSyncedCycle(age, stagger, window, idle) {
  return age >= 0 && age < window ? age + stagger : idle;
}

/**
 * A bulb's stutter during a surge. `hash` is that bulb's 0..1 hash for the
 * current flicker window, `level` the surge. At zero level every bulb burns
 * at 1 (a plain multiplier). As the level rises a bulb is either overdriven
 * (1 + 0.8 * level) or dropped to a dim 0.15, with the dark share growing
 * to 45% at full level — so a flare reads as neon stuttering under load,
 * never as a dimmer, and never as every bulb doing the same thing.
 */
export function ambientStutter(hash, level) {
  if (!(level > 0)) return 1;
  return hash < 1 - Math.min(1, level) * 0.45 ? 1 + Math.min(1, level) * 0.8 : 0.15;
}

/**
 * The cruise ship's KO horns: three blasts that are clearly different to the
 * ear (a long single at 98 Hz, a double at 87 Hz, a high long at 110 Hz).
 * The second oscillator sits a fifth up so the horn has the two-reed
 * chord of a real ship whistle. Peaks are per-oscillator against sfxVolume.
 */
export const AMBIENT_KO_HORNS = Object.freeze([
  Object.freeze({ id: "long", from: 98, fifth: 147, seconds: 1.25, blasts: 1, gap: 0, peak: 0.055 }),
  Object.freeze({ id: "double", from: 87, fifth: 130, seconds: 0.62, blasts: 2, gap: 0.78, peak: 0.05 }),
  Object.freeze({ id: "high", from: 110, fifth: 165, seconds: 1.5, blasts: 1, gap: 0, peak: 0.048 }),
]);

/**
 * Pick the next horn: never the one that played last. `roll` is 0..1 (a
 * presentation hash of the hold tick, so replay and live agree); with a
 * previous index the roll chooses among the other two.
 */
export function pickKoHorn(previous, roll) {
  const count = AMBIENT_KO_HORNS.length;
  const r = roll >= 0 && roll < 1 ? roll : 0;
  if (!(previous >= 0 && previous < count)) return Math.floor(r * count) % count;
  const offset = 1 + (Math.floor(r * (count - 1)) % (count - 1));
  return (previous + offset) % count;
}
