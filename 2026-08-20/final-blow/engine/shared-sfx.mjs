// Shared-sample variation and the two synthesized movement cues.
//
// Seven reviewed shared takes carry most of what a player hears: body-hit.mp3
// lands on nearly every impact (hit-heavy is recorded for 0/8 fighters,
// hit-light for 1/8), light-swing/heavy-swing on most swings (2/8 and 3/8),
// and until now jump.mp3 doubled as the dash and the ui-select menu click was
// the stage-weapon drop. The takes themselves are frozen by the audio review
// and are never regenerated or re-encoded, so the variation has to happen at
// play time: per-play pitch and level jitter on the shared pool (mirroring
// the single-take fighter-bank micro-variation, only wider), and Web Audio
// synthesis for the two cues whose borrowed samples were the wrong read (a
// dash sounding like a jump, a weapon landing with a menu click).
//
// Everything here is pure: it takes a random source and the previous draw
// and returns numbers, so the no-repeat guarantee is unit-testable without a
// browser. game.js supplies visualRandom() for samples and the tick hash for
// synth voices, and keeps the per-kind "previous" records.

/**
 * Per-play jitter spans for the shared pool, keyed by the sample kind that is
 * actually played (the fallback target, not the requested cue). `pitch` is
 * the ± playbackRate fraction; `level` the ± dB. Only the machine-gun takes
 * are listed: the menu click stays a crisp fixed UI sound, and finish/ko fire
 * once a round and are the moments the review approved as they sound.
 *   hit   ±8%  — the whole impact vocabulary rides this one 12 KB take.
 *   light ±7%, heavy ±6% — swing whooshes tolerate less shift before they
 *                read as a different weapon size.
 *   jump  ±6%  — still the jump; the dash no longer borrows it.
 */
export const SHARED_SAMPLE_VARIATION = Object.freeze({
  hit: Object.freeze({ pitch: 0.08, level: 1.5 }),
  light: Object.freeze({ pitch: 0.07, level: 1.5 }),
  heavy: Object.freeze({ pitch: 0.06, level: 1.5 }),
  jump: Object.freeze({ pitch: 0.06, level: 1.2 }),
});

/**
 * Minimum distance between consecutive draws, as a fraction of the full
 * [-1, 1] span. 0.35 of an 8% pitch span is ~2.8% — measured on body-hit.mp3
 * that is a clearly different pitch to the ear, while two draws inside 1%
 * would still sound like the same file.
 */
export const DISTINCT_DRAW_MIN_STEP = 0.35;

const NO_VARIATION = Object.freeze({ draw: 0, rate: 1, db: 0, gain: 1 });

/**
 * Draw a value in [-1, 1] that is at least `minStep` away from `previous`.
 * Rejection-samples a handful of times and then moves deterministically to
 * the far side of the previous draw, so the guarantee holds even for a
 * degenerate random source that keeps returning the same number.
 */
export function distinctDraw(previous, rand, minStep = DISTINCT_DRAW_MIN_STEP) {
  const has = Number.isFinite(previous);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const draw = clamp(rand() * 2 - 1, -1, 1);
    if (!has || Math.abs(draw - previous) >= minStep) return draw;
  }
  // Step away from the previous draw by between half and one-and-a-half
  // spans; clamping to the interval still leaves >= minStep of distance
  // because the previous draw is itself inside [-1, 1].
  const step = 0.5 + clamp(rand(), 0, 1);
  const away = previous > 0 ? previous - step : previous + step;
  return clamp(away, -1, 1);
}

/**
 * Next pitch/level variation for a shared sample kind. Returns the neutral
 * record (rate 1, gain 1) for kinds outside the table so callers can set
 * playbackRate unconditionally on reused pool elements. `previous` is the
 * record this function returned for the same kind last time.
 */
export function pickSharedVariation(kind, previous, rand) {
  const span = SHARED_SAMPLE_VARIATION[kind];
  if (!span) return NO_VARIATION;
  const draw = distinctDraw(previous?.draw, rand);
  // Level jitter is an independent draw: the ear separates a louder-lower
  // hit from a softer-higher one, which is two axes of variety for free.
  const db = (clamp(rand(), 0, 1) * 2 - 1) * span.level;
  return Object.freeze({
    draw,
    rate: round4(1 + draw * span.pitch),
    db: round4(db),
    gain: round4(10 ** (db / 20)),
  });
}

/**
 * Dash scuff: a sneaker skidding on concrete. A band-passed noise hiss that
 * sweeps down as the foot slows, over a short sine plant for the push-off.
 * A back dash is the heel dragging — lower, a touch longer — so the two
 * directions read differently by ear as they do on screen. `draw` is a
 * distinctDraw() value so consecutive dashes never share a hiss.
 */
export function dashScuffParams({ forward = true, draw = 0, level = 1 } = {}) {
  const spread = clamp(draw, -1, 1);
  const base = forward
    ? { freq: 2200, freqEnd: 900, seconds: 0.13, peak: 0.055, plantHz: 150 }
    : { freq: 1650, freqEnd: 700, seconds: 0.165, peak: 0.05, plantHz: 125 };
  return {
    hiss: {
      seconds: round4(base.seconds * (1 + spread * 0.15)),
      filterType: "bandpass",
      freq: round4(base.freq * (1 + spread * 0.18)),
      freqEnd: round4(base.freqEnd * (1 + spread * 0.12)),
      q: 1.1,
      peak: round4(base.peak * level * (1 + spread * 0.12)),
      attack: 0.006,
    },
    plant: {
      wave: "sine",
      from: round4(base.plantHz * (1 - spread * 0.1)),
      to: 48,
      seconds: 0.07,
      peak: round4(0.03 * level),
      attack: 0.003,
    },
  };
}

/**
 * Per-style clatter for a stage weapon landing, keyed by the weapon `style`
 * in engine/stage-weapons.mjs. Each entry is the material: rings are tone
 * partials (wave, from, to, seconds, peak), thud the floor contact, bounces
 * the settling ticks (count, filter, gap between ticks) and roll an optional
 * tail. Peaks sit under the impact-layer thump (0.034-0.11) so a drop never
 * competes with a hit.
 */
export const STAGE_WEAPON_CLATTER = Object.freeze({
  // A needle: two glassy metal tinks, no body at all.
  needle: Object.freeze({
    rings: [["triangle", 5200, 3800, 0.06, 0.035], ["triangle", 6400, 5200, 0.04, 0.018]],
    thud: null,
    bounces: { count: 2, filterType: "highpass", freq: 6000, q: 0.9, seconds: 0.025, peak: 0.018, gap: 0.09 },
    roll: null,
  }),
  // A bottle: a glass ring, a thud, three ticks and a short roll.
  bottle: Object.freeze({
    rings: [["sine", 1900, 1720, 0.22, 0.045], ["sine", 3100, 2900, 0.12, 0.02]],
    thud: [160, 70, 0.08, 0.03],
    bounces: { count: 3, filterType: "bandpass", freq: 2600, q: 2, seconds: 0.03, peak: 0.028, gap: 0.1 },
    roll: { delay: 0.22, seconds: 0.36, filterType: "lowpass", freq: 640, freqEnd: 260, peak: 0.012 },
  }),
  // A pigeon: a soft body thud and a burst of wing flaps, nothing rings.
  pigeon: Object.freeze({
    rings: [],
    thud: [120, 50, 0.1, 0.045],
    bounces: { count: 4, filterType: "lowpass", freq: 900, q: 0.7, seconds: 0.032, peak: 0.022, gap: 0.05 },
    roll: null,
  }),
  // Tongs: two metal partials clanking, three hard ticks as they settle.
  tongs: Object.freeze({
    rings: [["triangle", 1500, 1100, 0.14, 0.05], ["triangle", 2300, 1900, 0.1, 0.03]],
    thud: [200, 80, 0.06, 0.03],
    bounces: { count: 3, filterType: "bandpass", freq: 3200, q: 1.5, seconds: 0.028, peak: 0.03, gap: 0.085 },
    roll: null,
  }),
  // A souvenir cup: a hollow plastic clunk that bounces twice and rolls.
  cup: Object.freeze({
    rings: [["triangle", 620, 480, 0.12, 0.04]],
    thud: [150, 60, 0.07, 0.03],
    bounces: { count: 3, filterType: "lowpass", freq: 1400, q: 0.8, seconds: 0.035, peak: 0.026, gap: 0.11 },
    roll: { delay: 0.3, seconds: 0.3, filterType: "lowpass", freq: 520, freqEnd: 220, peak: 0.01 },
  }),
});

/**
 * Flatten a clatter entry into the tone and noise shots game.js fires. The
 * draw detunes the rings and stretches the bounce gaps together, so one
 * landing is a slightly higher, quicker-settling object than the last.
 * Unknown styles land on the cup so a new weapon still makes a sound.
 */
export function weaponClatterParams(style, { draw = 0, level = 1 } = {}) {
  const entry = STAGE_WEAPON_CLATTER[style] || STAGE_WEAPON_CLATTER.cup;
  const spread = clamp(draw, -1, 1);
  const detune = 1 + spread * 0.09;
  const tones = entry.rings.map(([wave, from, to, seconds, peak]) => ({
    wave,
    from: round4(from * detune),
    to: round4(to * detune),
    seconds: round4(seconds * (1 - spread * 0.08)),
    peak: round4(peak * level),
    attack: 0.002,
  }));
  if (entry.thud) {
    const [from, to, seconds, peak] = entry.thud;
    tones.push({ wave: "sine", from: round4(from * detune), to, seconds, peak: round4(peak * level), attack: 0.003 });
  }
  const noises = [];
  const { count, filterType, freq, q, seconds, peak, gap } = entry.bounces;
  const gapScale = 1 + spread * 0.2;
  let delay = 0;
  for (let index = 0; index < count; index += 1) {
    // Each bounce is quieter and arrives sooner than the last — the
    // settling curve of anything that lands and rocks.
    const decay = 1 / (1 + index * 0.8);
    noises.push({
      delay: round4(delay),
      seconds,
      filterType,
      freq: round4(freq * detune),
      q,
      peak: round4(peak * decay * level),
      attack: 0.002,
    });
    delay += gap * gapScale * (1 - index * 0.18);
  }
  if (entry.roll) {
    noises.push({ ...entry.roll, delay: round4(entry.roll.delay * gapScale), peak: round4(entry.roll.peak * level), attack: 0.03 });
  }
  return { style: STAGE_WEAPON_CLATTER[style] ? style : "cup", tones, noises };
}

/**
 * v5.1 TEMPO TELLS: the re-arm click — a press the 4-frame re-arm gap ate.
 * A dry, muted tick (short lowpassed noise over a falling sine pip), well
 * under every swing and impact peak (0.02 vs the scuff's 0.055) so a mash
 * reads as "not yet" by ear without adding a beat to the fight. `draw` is a
 * distinctDraw() value so two eaten presses in one gap never share a pitch.
 */
export function rearmClickParams({ draw = 0, level = 1 } = {}) {
  const spread = clamp(draw, -1, 1);
  return {
    tick: {
      seconds: round4(0.028 * (1 + spread * 0.12)),
      filterType: "lowpass",
      freq: round4(1400 * (1 + spread * 0.2)),
      freqEnd: 0,
      q: 0.9,
      peak: round4(0.02 * level),
      attack: 0.002,
    },
    pip: {
      wave: "sine",
      from: round4(520 * (1 + spread * 0.14)),
      to: 260,
      seconds: 0.045,
      peak: round4(0.016 * level),
      attack: 0.002,
    },
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}
