// ---------------------------------------------------------------------------
// v5.3 SPECTACLE (#16/#43) — the 3D stages' practical lights, as data.
//
// Until now CINEMA 3D's five generic stages (vet / wildwood / buffet /
// cruise / janney) were one graded backdrop card and a three-point night rig
// with an EMPTY update(): a KO on the Vet flared two floodlights and put two
// fireworks over the bowl on the 2D canvas and did precisely nothing in 3D.
// The 2D reactions all key off engine/ambient.mjs `ambientSurge`; so does
// this table, so the two renderers flare on the same tick from the same
// number.
//
// Every position here is in PLATE coordinates — the 1280x720 canvas the 2D
// drawStageAmbient paints its glows into, which is also the backdrop image
// the 3D stage hangs at depth. That is what makes the two agree: the Vet's
// screen-left floodlight is `[125, 88]` in drawStageAmbient (game.js) and
// `x: 125, y: 88` here; stage-generic.mjs maps plate -> world through the
// backdrop card's own size and curvature, so the emissive head lands on the
// painted floodlight instead of near it.
//
// Nothing here imports three. It is pure arithmetic so the intensity curves
// are unit-tested rather than eyeballed through a screenshot.
// ---------------------------------------------------------------------------
import { ambientStutter } from "./ambient.mjs";

/** The plate the positions below are measured in (drawStageAmbient's canvas). */
export const PLATE_W = 1280;
export const PLATE_H = 720;

// A practical is: where it sits on the plate, how big its emissive card is,
// its colour, and HOW IT ANSWERS a surge.
//   idle     baseline multiplier with no surge at all (0 = dark until a hit)
//   breath   +/- idle wobble amplitude, at breathRate rad/tick (0 = steady)
//   gain     multiplier added per unit of surge level (the visible answer)
//   koGain   extra gain while the surge is the KO beat, not a big hit
//   stutter  >0 routes the level through ambientStutter at this scale, so
//            neon/bulb practicals break up under load instead of dimming
//   spill    a real PointLight this many world units in FRONT of the plate
//            (the reason the asphalt and the fighters flare, not just a card)
const practical = (spec) => Object.freeze({
  idle: 1, breath: 0, breathRate: 0.03, phase: 0, gain: 1, koGain: 0, stutter: 0,
  w: 120, h: 120, spill: 0, spillGain: 1, ...spec,
});

export const STAGE_PRACTICALS = Object.freeze({
  // Two floodlight heads + the bowl's own wash. 2D: ambientGlow at [125,88]
  // and [1230,232], radius 90 + pulse*120, alpha 0.09 + sin + pulse*0.28.
  vet: Object.freeze([
    practical({ id: "flood-left", x: 125, y: 88, w: 250, h: 250, color: 0xffecbe, idle: 0.34, breath: 0.12, gain: 1.5, koGain: 0.6, spill: 9.2, spillGain: 26 }),
    practical({ id: "flood-right", x: 1230, y: 232, w: 250, h: 250, color: 0xffecbe, idle: 0.34, breath: 0.12, phase: 1.9, gain: 1.5, koGain: 0.6, spill: 9.2, spillGain: 26 }),
    practical({ id: "bowl", x: 640, y: 300, w: 900, h: 300, color: 0xffd79a, idle: 0.05, gain: 0.7, koGain: 0.35 }),
  ]),
  // The wheel hub + rim, and the WILDWOOD sign's two flood pools. 2D: wheel
  // at (222,240) r83, sign glows at (520,165) and (850,165) r250.
  wildwood: Object.freeze([
    practical({ id: "wheel", x: 222, y: 240, w: 300, h: 300, color: 0xffbee6, idle: 0.18, breath: 0.06, gain: 1.35, koGain: 0.55, stutter: 0.8, spill: 8.4, spillGain: 17 }),
    practical({ id: "sign-left", x: 520, y: 165, w: 420, h: 220, color: 0xffaac8, idle: 0.08, gain: 1.25, koGain: 0.5 }),
    practical({ id: "sign-right", x: 850, y: 165, w: 420, h: 220, color: 0xffc496, idle: 0.08, gain: 1.25, koGain: 0.5 }),
    practical({ id: "chase", x: 692, y: 234, w: 700, h: 60, color: 0xffe4c8, idle: 0.22, gain: 1, stutter: 1, spill: 7, spillGain: 11 }),
  ]),
  // Five pendants over the pass, the wok flare, and the pass-through window.
  // 2D: pendants [40,330,640,940,1240] at y74; wok (1040,150); band y122 h100.
  buffet: Object.freeze([
    practical({ id: "pendant-0", x: 40, y: 74, w: 150, h: 150, color: 0xffc478, idle: 0.3, breath: 0.1, breathRate: 0.05, gain: 1.1, stutter: 1 }),
    practical({ id: "pendant-1", x: 330, y: 74, w: 150, h: 150, color: 0xffc478, idle: 0.3, breath: 0.1, breathRate: 0.05, phase: 1.1, gain: 1.1, stutter: 1 }),
    practical({ id: "pendant-2", x: 640, y: 74, w: 150, h: 150, color: 0xffc478, idle: 0.3, breath: 0.1, breathRate: 0.05, phase: 2.2, gain: 1.1, stutter: 1, spill: 7.6, spillGain: 18 }),
    practical({ id: "pendant-3", x: 940, y: 74, w: 150, h: 150, color: 0xffc478, idle: 0.3, breath: 0.1, breathRate: 0.05, phase: 3.3, gain: 1.1, stutter: 1 }),
    practical({ id: "pendant-4", x: 1240, y: 74, w: 150, h: 150, color: 0xffc478, idle: 0.3, breath: 0.1, breathRate: 0.05, phase: 4.4, gain: 1.1, stutter: 1 }),
    practical({ id: "wok", x: 1040, y: 150, w: 320, h: 320, color: 0xffbe5a, idle: 0.03, gain: 2.4, koGain: 0.8, spill: 8.4, spillGain: 42 }),
    // The pass-through window is the one buffet practical BEHIND the fight
    // line: without its spill the stage's whole surge landed on cards the
    // framing camera barely sees (measured +3.2% frame mean; +12.7% with it).
    practical({ id: "pass", x: 680, y: 172, w: 900, h: 140, color: 0xffe4b4, idle: 0.04, gain: 0.85, koGain: 0.6, spill: 9.6, spillGain: 28 }),
  ]),
  // The party string, the pool surface, and the funnel's horn light.
  // 2D: string y308 across 350..1000; pool band y402 h96 + glow (640,450).
  cruise: Object.freeze([
    practical({ id: "string", x: 688, y: 308, w: 720, h: 70, color: 0xffd696, idle: 0.4, gain: 0.9, stutter: 1, spill: 6.4, spillGain: 12 }),
    practical({ id: "pool", x: 640, y: 430, w: 900, h: 220, color: 0x96ebff, idle: 0.06, gain: 1.6, koGain: 0.5, spill: 4.2, spillGain: 22 }),
    practical({ id: "horn", x: 745, y: 22, w: 220, h: 220, color: 0xfff0c8, idle: 0.02, gain: 0.4, koGain: 2.2 }),
  ]),
  // The sodium lamp the moths orbit, and two lit rowhouse windows.
  // 2D: moth orbit centre (533,140); windows (62,38) and (1050,188).
  janney: Object.freeze([
    practical({ id: "sodium", x: 533, y: 140, w: 210, h: 210, color: 0xffd18a, idle: 0.45, breath: 0.1, breathRate: 0.021, gain: 1.4, koGain: 0.7, stutter: 0.5, spill: 8.6, spillGain: 22 }),
    practical({ id: "window-left", x: 100, y: 48, w: 130, h: 110, color: 0x96beff, idle: 0.16, breath: 0.08, breathRate: 0.09, gain: 0.9, koGain: 0.9 }),
    practical({ id: "window-right", x: 1050, y: 188, w: 130, h: 120, color: 0x96beff, idle: 0.16, breath: 0.08, breathRate: 0.09, phase: 2.4, gain: 0.9, koGain: 0.9 }),
    practical({ id: "street", x: 640, y: 330, w: 1000, h: 240, color: 0xffb478, idle: 0.04, gain: 0.7, koGain: 0.5 }),
  ]),
});

/** Every stage id this table answers for (main.mjs registers exactly these). */
export const PRACTICAL_STAGES = Object.freeze(Object.keys(STAGE_PRACTICALS));

/**
 * How hard one practical is burning this frame. 1 is "its own idle";
 * a full surge on a `gain: 1.5` head reads 1.84+, a KO more. Reduced motion
 * flattens the breath but never the surge answer (the surge level is already
 * zeroed upstream by ambientPulseLevel when reduced motion is on).
 *
 * `hash` is that practical's 0..1 flicker hash for the current window; it
 * only matters for `stutter` practicals, and it is the caller's job to hash
 * the same way the 2D pass does (presentationHash01 over frame/3).
 */
export function practicalLevel(spec, surge, frame, hash = 0.5, reduced = false) {
  const level = surge && surge.level > 0 ? surge.level : 0;
  const ko = Boolean(surge && surge.ko);
  const breath = reduced || !spec.breath
    ? 0
    : Math.sin(frame * (spec.breathRate || 0.03) + (spec.phase || 0)) * spec.breath;
  const swell = spec.idle + breath + level * (spec.gain + (ko ? spec.koGain : 0));
  const lit = Math.max(0, swell);
  return spec.stutter ? lit * ambientStutter(hash, level * spec.stutter) : lit;
}

/**
 * The point light a practical throws onto the fight plane: its own spill
 * budget times the level above the idle, so a stage at rest keeps the
 * hand-tuned three-point rig and a surge is the only thing that adds light.
 */
export function practicalSpill(spec, level) {
  if (!(spec.spill > 0)) return 0;
  return Math.max(0, level - spec.idle * 0.5) * spec.spillGain;
}

// --- fireworks --------------------------------------------------------------
// The Vet and Wildwood answer a big moment with a burst over the bowl / pier.
// 2D fires ambientFirework(pulseAge, ...) on the pulse and a second one 14
// ticks later on a KO; the same two shots, same seeds, drive the 3D points.

/** Ticks a 3D burst lives (the 2D shell + trail reads ~34 ticks of arc). */
export const FIREWORK_TICKS = 34;

/**
 * Which bursts are in the air. `[]` when nothing fired. Each entry carries
 * the shot's 0..1 progress and its integer seed, so the shell's scatter is
 * identical every replay of the same tick.
 */
export function fireworkShots(surge, latchTick, stage) {
  if (!surge || !(surge.level > 0) || !(surge.age >= 0)) return [];
  if (stage !== "vet" && stage !== "wildwood") return [];
  const shots = [{ seed: 71 + latchTick, progress: Math.min(1, surge.age / FIREWORK_TICKS) }];
  if (surge.ko && surge.age >= 14) {
    shots.push({ seed: 93 + latchTick, progress: Math.min(1, (surge.age - 14) / FIREWORK_TICKS) });
  }
  return shots.filter((shot) => shot.progress < 1);
}
