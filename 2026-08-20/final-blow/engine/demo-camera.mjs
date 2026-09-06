// ===========================================================================
// 5.4 FIGHT NIGHT — THE DEMO'S CAMERA AND CADENCE DIRECTOR (sweep #7 / #17).
//
// The attract show had no camera and no tempo. Measured on the 5.4 head
// (headless Chrome, 1920x1080, ?demo=237 on the wall clock, 175 s sampled at
// 100 ms): 95% of fight-phase frames sat at presentation zoom exactly 1.00,
// the only demo-conditional framing made the shot WIDER (the 0.86 pull-back,
// the 3D camera's 1.12 cap), and every tick of every round ran at the same
// 0.75x — footsies and the round-ending hit passed at one speed. From a couch
// a super, a counter and a KO all looked like the same locked wide shot.
//
// This module is the pure half of the fix: a SEEDED SHOT LIST for the two
// set pieces the sim already produces (the super wind-up and the KO hit) and
// a TEMPO-AWARE CADENCE POLICY (1x while both fighters are free and out of
// range, 0.75x once anyone swings or the pair is inside contact range, a
// slow-motion beat on the round-ending hit, 0.75x for the ceremony). game.js
// owns the wiring; renderer/three/camera.mjs reads the same beat to lift its
// demo punch-in cap. None of it touches the sim:
//
//   * every shot is a PRESENTATION envelope composed into the existing
//     cinematicCamera pose (zoom about a focus point, a dutch degree or two),
//     the same primitives the KO punch-in and the intro dolly already use;
//   * the slow-motion beat rides engine/demo-speed.mjs — a tick CADENCE
//     multiplier, never a dt change — so the tick stream a seed produces is
//     bit-identical with or without the beat (pinned in
//     tests/demo-camera.test.mjs and by the demo-seed-url smoke probe);
//   * the shot draw is a seeded shuffle bag (the director's refillBag, so no
//     variant ever repeats back to back) whose only inputs are the demo seed
//     and the ORDER of the events the tick stream produces — the same seed
//     replays the same shots at the same ticks.
//
// Every game.js call site is gated on the demo session (state.mode ===
// "demo" && demoSession.active), so a played match is byte-identical.
// ===========================================================================

import { DeterministicRng, hashSeed } from "./foundation.mjs";
import { refillBag } from "./demo.mjs";

/** The cadence policy's rates. `exchange` is the 4.3 couch default. */
export const DEMO_CADENCE_RATES = Object.freeze({
  intro: 0.75,
  neutral: 1,
  exchange: 0.75,
  ceremony: 0.75,
});

/** Every beat the policy can report (`ko` carries the shot's own rate). */
export const DEMO_CADENCE_BEATS = Object.freeze(["intro", "neutral", "exchange", "ko", "ceremony"]);

/**
 * An exchange keeps its tempo this many ticks after the last contact tick,
 * so a two-hit string with a 10-tick gap does not flicker 0.75 -> 1 -> 0.75.
 * 24 ticks = 0.4 s of sim, 0.53 s wall at 0.75x.
 */
export const DEMO_EXCHANGE_DWELL_TICKS = 24;

/**
 * Inside this many px (centre to centre) the pair is "in range" and the show
 * runs at exchange tempo even before a button is pressed — the pre-swing
 * beat is part of the exchange, and 1x footsies at throw range read as a
 * blur from the couch. ~1.9 body widths (BODY_WIDTH 105).
 */
export const DEMO_CONTACT_RANGE = 200;

/**
 * The SUPER shot list. `zoom` is the pose target (about the attacker's
 * chest; with the 2D pull-back at 0.86 a 1.32 pose is a 1.135 net frame —
 * from wide to tight, not from flat to slightly less flat). `attack` /
 * `hold` / `release` are seconds; `dutchDeg` a small roll; `ease` the pose
 * spring (higher = snappier). Three deliberately different moves so three
 * supers in a row never read as the same cut.
 */
export const DEMO_SUPER_SHOTS = Object.freeze([
  Object.freeze({ id: "tight", zoom: 1.32, attack: 0.14, hold: 0.95, release: 0.5, dutchDeg: 0, ease: 12 }),
  Object.freeze({ id: "creep", zoom: 1.24, attack: 0.65, hold: 0.7, release: 0.45, dutchDeg: 0.9, ease: 6 }),
  Object.freeze({ id: "snap", zoom: 1.4, attack: 0.06, hold: 0.55, release: 0.85, dutchDeg: -0.7, ease: 16 }),
]);

/**
 * The KO shot list. Same envelope, plus the slow-motion beat the cadence
 * policy plays on the round-ending hit: `slowMoRate` is the tick cadence
 * (0.35x = a tick every ~2.9 rendered frames at 60 Hz), `slowMoTicks` how
 * many sim ticks after the KO tick the beat lasts. The three beats differ in
 * both, so a viewer never learns "the KO always takes exactly a second".
 * (The demo's Final Blow reaction is 0.35 s = 21 ticks; a plain KO's window
 * is 0.9 s = 54 ticks. The longest beat here is 30 ticks: on a Final Blow
 * round the ceremony takes over mid-beat and the policy yields to it.)
 */
export const DEMO_KO_SHOTS = Object.freeze([
  Object.freeze({ id: "freeze", zoom: 1.26, attack: 0.08, hold: 1, release: 0.6, dutchDeg: 1.2, ease: 14, slowMoRate: 0.35, slowMoTicks: 24 }),
  Object.freeze({ id: "creep", zoom: 1.2, attack: 0.9, hold: 0.6, release: 0.5, dutchDeg: -1.6, ease: 5, slowMoRate: 0.5, slowMoTicks: 30 }),
  Object.freeze({ id: "smash", zoom: 1.32, attack: 0.05, hold: 0.6, release: 0.7, dutchDeg: 0, ease: 18, slowMoRate: 0.25, slowMoTicks: 18 }),
]);

/**
 * The exchange LEAN: while the policy is at exchange tempo the pose eases to
 * this zoom on the pair's midpoint and back to identity in neutral, so the
 * frame breathes with the fight between the set pieces. Modest on purpose —
 * with the pull-back it is 0.86 -> 0.92 — the obvious moves are the shots.
 */
export const DEMO_EXCHANGE_LEAN_ZOOM = 1.07;

/** The 3D camera's demo punch-in cap while a shot is live (1.12 otherwise). */
export const DEMO_3D_SHOT_ZOOM_CAP = 1.45;

function smoothstep(value) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

/**
 * The envelope, 0..1: smoothstep up over `attack`, 1 through `hold`,
 * smoothstep down over `release`, 0 after. Pure; seconds in.
 */
export function shotShape(shot, age) {
  if (!shot || !(age >= 0)) return 0;
  const { attack, hold, release } = shot;
  if (age < attack) return smoothstep(age / attack);
  if (age < attack + hold) return 1;
  if (age < attack + hold + release) return 1 - smoothstep((age - attack - hold) / release);
  return 0;
}

/** Is the envelope still alive at this age? */
export function shotAlive(shot, age) {
  return Boolean(shot) && age >= 0 && age < shot.attack + shot.hold + shot.release;
}

/** Total envelope life in seconds. */
export function shotLife(shot) {
  return shot ? shot.attack + shot.hold + shot.release : 0;
}

/**
 * THE SHOT DIRECTOR. Two seeded shuffle bags (super / KO), each refilled by
 * the demo director's refillBag so the head of a fresh bag never repeats the
 * last draw. Its rng is derived from the demo seed alone, so a seed replays
 * the same shot order; the draws are consumed in event order, which the tick
 * stream fixes. `snapshot()` / `log` are reporting only.
 */
export function createDemoCameraDirector({ seed = 237, superShots = DEMO_SUPER_SHOTS, koShots = DEMO_KO_SHOTS } = {}) {
  if (!superShots.length || !koShots.length) throw new Error("The demo camera needs at least one shot per kind.");
  const rng = new DeterministicRng(hashSeed("FINAL-BLOW-DEMO-CAMERA", seed));
  let superBag = [];
  let koBag = [];
  let previousSuper = null;
  let previousKo = null;
  const log = [];
  let supers = 0;
  let kos = 0;

  function draw(kind, tick) {
    let shot;
    if (kind === "super") {
      if (!superBag.length) superBag = refillBag(superShots, rng, previousSuper, (item) => item.id);
      shot = superBag.shift();
      previousSuper = shot;
      supers += 1;
    } else {
      if (!koBag.length) koBag = refillBag(koShots, rng, previousKo, (item) => item.id);
      shot = koBag.shift();
      previousKo = shot;
      kos += 1;
    }
    log.push({ kind, id: shot.id, tick });
    while (log.length > 64) log.shift();
    return shot;
  }

  return Object.freeze({
    superShot(tick = -1) { return draw("super", tick); },
    koShot(tick = -1) { return draw("ko", tick); },
    snapshot() {
      return {
        supers,
        kos,
        lastSuper: previousSuper?.id || null,
        lastKo: previousKo?.id || null,
        remainingSupers: superBag.length,
        remainingKos: koBag.length,
        log: log.slice(),
        rng: rng.getState(),
      };
    },
  });
}

/**
 * THE CADENCE POLICY. A tick-keyed state machine: `update(view)` reads what
 * game.js observed this frame and answers { beat, rate }. The only memory is
 * the last contact tick (the exchange dwell), so it is deterministic from the
 * sim state it is shown and never from the wall clock.
 *
 *   view.phase        "intro" | "fight" | "finish" | "roundover" | ...
 *   view.finisher     a Final Blow cinematic is live
 *   view.tick         state.simulationTick
 *   view.engaged      anyone attacking / in stun / down / grabbing, or hitstop
 *   view.distance     centre-to-centre px (Infinity when unknown)
 *   view.koTick       the tick the KO landed (-1 when none this round)
 *   view.koShot       the KO shot drawn for it (carries the slow-mo beat)
 */
export function createDemoCadence({
  rates = DEMO_CADENCE_RATES,
  dwellTicks = DEMO_EXCHANGE_DWELL_TICKS,
  contactRange = DEMO_CONTACT_RANGE,
} = {}) {
  let lastContactTick = -Infinity;
  let beat = "intro";
  let rate = rates.intro;

  function update(view = {}) {
    const phase = view.phase || "fight";
    const tick = Number.isFinite(view.tick) ? view.tick : 0;
    if (phase === "intro") {
      beat = "intro";
      rate = rates.intro;
    } else if (view.finisher) {
      beat = "ceremony";
      rate = rates.ceremony;
    } else if (phase === "finish") {
      const shot = view.koShot;
      const koTick = Number.isFinite(view.koTick) ? view.koTick : -1;
      if (shot && koTick >= 0 && tick >= koTick && tick - koTick < shot.slowMoTicks) {
        beat = "ko";
        rate = shot.slowMoRate;
      } else {
        beat = "ceremony";
        rate = rates.ceremony;
      }
    } else if (phase !== "fight") {
      beat = "ceremony";
      rate = rates.ceremony;
    } else {
      const distance = Number.isFinite(view.distance) ? view.distance : Infinity;
      const contact = Boolean(view.engaged) || distance <= contactRange;
      if (contact) lastContactTick = tick;
      // A new round (or a rewound seed) moves the tick backwards: forget.
      if (tick < lastContactTick) lastContactTick = -Infinity;
      if (tick - lastContactTick <= dwellTicks) {
        beat = "exchange";
        rate = rates.exchange;
      } else {
        beat = "neutral";
        rate = rates.neutral;
      }
    }
    return { beat, rate };
  }

  return Object.freeze({
    update,
    reset() {
      lastContactTick = -Infinity;
      beat = "intro";
      rate = rates.intro;
    },
    get beat() { return beat; },
    get rate() { return rate; },
    snapshot() {
      return { beat, rate, lastContactTick: Number.isFinite(lastContactTick) ? lastContactTick : null };
    },
  });
}

/**
 * The rate tag's words for a cadence beat: the number while the policy is at
 * a plain rate, SLOW-MO on the KO beat. Shared by the broadcast bug (game.js
 * via engine/demo-hud.mjs) so the chip never prints "0.35×" at a viewer.
 */
export function cadenceTagText(beat, rate) {
  if (beat === "ko") return "SLOW-MO";
  const value = Number(rate);
  return Number.isFinite(value) && value > 0 ? `${value}×` : "1×";
}
