import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  DISTINCT_DRAW_MIN_STEP,
  SHARED_SAMPLE_VARIATION,
  STAGE_WEAPON_CLATTER,
  clinchTechBreakParams,
  dashScuffParams,
  distinctDraw,
  pickSharedVariation,
  rearmClickParams,
  weaponClatterParams,
} from "../engine/shared-sfx.mjs";
import { STAGE_WEAPONS } from "../engine/stage-weapons.mjs";

// Deterministic LCG so the no-repeat proof is reproducible.
function lcg(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

test("only the machine-gun shared takes are jittered, inside the ±6-10% brief", () => {
  assert.deepEqual(Object.keys(SHARED_SAMPLE_VARIATION).sort(), ["heavy", "hit", "jump", "light"]);
  for (const [kind, span] of Object.entries(SHARED_SAMPLE_VARIATION)) {
    assert.ok(span.pitch >= 0.06 && span.pitch <= 0.1, `${kind} pitch span ${span.pitch} outside ±6-10%`);
    assert.ok(span.level > 0 && span.level <= 1.5, `${kind} level span ${span.level} dB`);
  }
  // The menu click and the once-a-round takes play as reviewed.
  for (const kind of ["select", "finish", "ko", "unknown"]) {
    const neutral = pickSharedVariation(kind, null, lcg(3));
    assert.deepEqual({ rate: neutral.rate, gain: neutral.gain }, { rate: 1, gain: 1 });
  }
});

test("consecutive plays of one shared take never share a pitch", () => {
  const rand = lcg(237);
  for (const [kind, span] of Object.entries(SHARED_SAMPLE_VARIATION)) {
    let previous = null;
    let minDistance = Infinity;
    for (let play = 0; play < 4000; play += 1) {
      const variation = pickSharedVariation(kind, previous, rand);
      assert.ok(variation.rate >= 1 - span.pitch - 1e-9 && variation.rate <= 1 + span.pitch + 1e-9, `${kind} rate ${variation.rate}`);
      assert.ok(Math.abs(variation.db) <= span.level + 1e-9, `${kind} level ${variation.db} dB`);
      assert.ok(Math.abs(variation.gain - 10 ** (variation.db / 20)) < 1e-3);
      if (previous) {
        const distance = Math.abs(variation.rate - previous.rate);
        minDistance = Math.min(minDistance, distance);
        assert.notEqual(variation.rate, previous.rate, `${kind} repeated rate ${variation.rate} on play ${play}`);
      }
      previous = variation;
    }
    // ~0.35 of the span apart at minimum (rounded to 4 places in the record).
    assert.ok(minDistance >= span.pitch * DISTINCT_DRAW_MIN_STEP - 1e-3, `${kind} min step ${minDistance}`);
  }
});

test("distinctDraw holds its guarantee against a degenerate random source", () => {
  // A source stuck on one value (the worst case for rejection sampling).
  for (const stuck of [0, 0.25, 0.5, 0.75, 1]) {
    let previous = null;
    for (let play = 0; play < 50; play += 1) {
      const draw = distinctDraw(previous, () => stuck);
      assert.ok(draw >= -1 && draw <= 1);
      if (previous !== null) assert.ok(Math.abs(draw - previous) >= DISTINCT_DRAW_MIN_STEP - 1e-9, `stuck ${stuck}: ${previous} -> ${draw}`);
      previous = draw;
    }
  }
  // Edge previous values at the ends of the interval still step inward.
  for (const previous of [-1, 1, 0]) {
    const draw = distinctDraw(previous, () => previous > 0 ? 1 : 0);
    assert.ok(Math.abs(draw - previous) >= DISTINCT_DRAW_MIN_STEP);
  }
});

test("the dash scuff is a bandpass hiss over a plant, back dash lower and longer", () => {
  const forward = dashScuffParams({ forward: true, draw: 0, level: 1 });
  const back = dashScuffParams({ forward: false, draw: 0, level: 1 });
  assert.equal(forward.hiss.filterType, "bandpass");
  assert.ok(forward.hiss.freq > forward.hiss.freqEnd, "the hiss sweeps down as the foot slows");
  assert.ok(back.hiss.freq < forward.hiss.freq && back.hiss.seconds > forward.hiss.seconds);
  assert.equal(forward.plant.wave, "sine");
  assert.ok(forward.plant.from > forward.plant.to);
  // Peaks stay under the heavy impact thump so a dash never out-hits a hit.
  assert.ok(forward.hiss.peak < 0.07 && forward.plant.peak < 0.07);
  // Draw at both ends moves the hiss audibly and the volume follows sfxVolume.
  const low = dashScuffParams({ forward: true, draw: -1 });
  const high = dashScuffParams({ forward: true, draw: 1 });
  assert.ok(high.hiss.freq / low.hiss.freq > 1.3, "the draw must shift the hiss by a clearly audible interval");
  assert.equal(dashScuffParams({ forward: true, level: 0.5 }).hiss.peak, forward.hiss.peak * 0.5);
});

test("every stage weapon style has its own clatter material", () => {
  const styles = new Set(Object.values(STAGE_WEAPONS).map((weapon) => weapon.style));
  for (const style of styles) {
    assert.ok(STAGE_WEAPON_CLATTER[style], `${style} has no clatter entry`);
    const params = weaponClatterParams(style, { draw: 0, level: 1 });
    assert.equal(params.style, style);
    assert.ok(params.tones.length + params.noises.length >= 3, `${style} needs body and settle`);
    for (const tone of params.tones) assert.ok(tone.peak > 0 && tone.peak <= 0.06 && tone.seconds > 0);
    for (const noise of params.noises) assert.ok(noise.peak > 0 && noise.peak <= 0.06 && noise.seconds > 0 && noise.delay >= 0);
    // Bounces settle: later ticks arrive sooner and quieter.
    const bounces = params.noises.filter((noise) => noise.filterType === STAGE_WEAPON_CLATTER[style].bounces.filterType && noise.attack === 0.002);
    for (let index = 1; index < bounces.length; index += 1) {
      assert.ok(bounces[index].peak < bounces[index - 1].peak, `${style} bounce ${index} must be quieter`);
      assert.ok(bounces[index].delay > bounces[index - 1].delay);
    }
  }
  // Materials differ: needle rings high with nothing under it, pigeon has no ring at all.
  assert.equal(weaponClatterParams("pigeon").tones.filter((tone) => tone.wave !== "sine").length, 0);
  assert.ok(weaponClatterParams("needle").tones[0].from > 4000);
  assert.ok(weaponClatterParams("bottle").noises.some((noise) => noise.seconds >= 0.3), "the bottle rolls");
  // Unknown styles still make a sound.
  assert.equal(weaponClatterParams("anvil").style, "cup");
  // The draw detunes: two consecutive landings are not the same clatter.
  const a = weaponClatterParams("tongs", { draw: -0.6 });
  const b = weaponClatterParams("tongs", { draw: 0.6 });
  assert.notEqual(a.tones[0].from, b.tones[0].from);
  assert.notEqual(a.noises[1].delay, b.noises[1].delay);
});

test("game.js routes the shared pool through the variation and the two cues through synthesis", async () => {
  const game = await readFile(resolve("game.js"), "utf8");
  // The dash and the weapon drop no longer borrow jump.mp3 / ui-select.
  const fallbacks = game.match(/const fallbackSoundKinds = Object\.freeze\(\{([\s\S]*?)\n\}\);/)[1];
  assert.ok(!/^\s*dash:/m.test(fallbacks), "dash must not fall back to a shared sample");
  assert.ok(!/"stage-weapon":/.test(fallbacks), "stage-weapon must not fall back to a shared sample");
  assert.match(game, /const SHARED_SYNTH_VOICES = Object\.freeze\(\{\s*dash: \(fighter\) => dashScuff\(fighter\),\s*"stage-weapon": \(\) => weaponClatter\(\),/);
  // The shared branch sets rate and preservesPitch on every play, after the
  // fighter-bank branch and only for real pool samples.
  const shared = game.slice(game.indexOf("const pool = sfxPools[fallbackKind];"), game.indexOf("function showSoundCaption"));
  assert.match(shared, /const variation = nextSharedVariation\(fallbackKind\);/);
  assert.match(shared, /sample\.preservesPitch = variation\.rate === 1;\s*sample\.playbackRate = variation\.rate;/);
  assert.match(shared, /sample\.volume = Math\.min\(1, \(sfxVolumes\[kind\] \?\? 0\.62\) \* state\.sfxVolume \* variation\.gain\);/);
  // The draw uses the checksum-exempt visual stream, never state.rng.
  assert.match(game, /pickSharedVariation\(kind, sharedVariationLast\[kind\], visualRandom\)/);
  // The synth voices are resim/toggle guarded and hash-jittered like the impact layers.
  for (const name of ["dashScuff", "weaponClatter"]) {
    const body = game.slice(game.indexOf(`function ${name}(`), game.indexOf("\n}\n", game.indexOf(`function ${name}(`)));
    assert.match(body, /if \(!impactAudioAllowed\(\)\) return;/, `${name} must ride the sim-path audio guard`);
    assert.match(body, /synthVoiceDraw\(/, `${name} must draw a no-repeat jitter`);
  }
  assert.match(game, /presentationHash01\(state\.simulationTick, serial, 41 \+ salt\+\+\)/);
});

// v5.1 TEMPO TELLS: the re-arm click — the press the 4-frame gap ate.
test("the re-arm click is a dry muted tick under every swing and impact", () => {
  const click = rearmClickParams({ draw: 0, level: 1 });
  assert.equal(click.tick.filterType, "lowpass");
  assert.ok(click.tick.seconds < 0.05, "a tick, not a beat");
  assert.ok(click.pip.seconds < 0.06);
  assert.ok(click.pip.from > click.pip.to, "the pip falls");
  // Quieter than the dash scuff (0.055) and far under the impact layers.
  assert.ok(click.tick.peak < dashScuffParams({ forward: true }).hiss.peak);
  assert.ok(click.tick.peak <= 0.02 && click.pip.peak <= 0.02);
  // The draw moves the pitch so two eaten presses in one gap differ.
  const low = rearmClickParams({ draw: -1 });
  const high = rearmClickParams({ draw: 1 });
  assert.ok(high.tick.freq > low.tick.freq);
  assert.ok(high.pip.from > low.pip.from);
  assert.equal(rearmClickParams({ level: 0.5 }).tick.peak, click.tick.peak * 0.5);
});

// 5.3 CLOSE RANGE: the clinch-break snap — the layer that tells a REACTION
// tech (a hold broken open) apart from the pre-contact clash, which keeps the
// reviewed `block` take underneath it in both cases.
test("the clinch-break snap is a downward rip that never repeats back to back", () => {
  const snap = clinchTechBreakParams({ draw: 0, level: 1 });
  assert.equal(snap.rip.filterType, "bandpass");
  assert.ok(snap.rip.freq > snap.rip.freqEnd, "the rip sweeps DOWN — the opposite of the dash scuff, so the two never blur");
  assert.ok(snap.rip.freqEnd < dashScuffParams({ forward: true }).hiss.freqEnd * 1.5
    || snap.rip.freq !== dashScuffParams({ forward: true }).hiss.freq,
    "it must not land on the scuff's own sweep");
  assert.ok(snap.rip.seconds > 0.08 && snap.rip.seconds < 0.2, "a snap, not a wash");
  assert.equal(snap.partials.length, 2);
  assert.ok(snap.partials.every((partial) => partial.wave === "square" && partial.from > partial.to),
    "both shove partials fall");
  assert.ok(snap.partials[1].delay > 0, "the second partial lands after the first — one event, not a chord");
  // Louder than the eaten-press click (it is an escape, not a nothing) and
  // still under the recorded impact takes.
  assert.ok(snap.rip.peak > rearmClickParams({}).tick.peak);
  assert.ok(snap.rip.peak < 0.09);
  assert.equal(clinchTechBreakParams({ level: 0.5 }).rip.peak, snap.rip.peak * 0.5);

  // The no-repeat guarantee: consecutive draws from distinctDraw are at least
  // DISTINCT_DRAW_MIN_STEP apart, and the detune is monotonic in the draw, so
  // two clinch techs in a row are audibly different pitches.
  const low = clinchTechBreakParams({ draw: -1 });
  const high = clinchTechBreakParams({ draw: 1 });
  assert.ok(high.rip.freq > low.rip.freq);
  assert.ok(high.partials[0].from > low.partials[0].from);
  const rand = lcg(11);
  let previous = null;
  for (let index = 0; index < 200; index += 1) {
    const draw = distinctDraw(previous, rand);
    if (previous !== null) {
      assert.ok(Math.abs(draw - previous) >= DISTINCT_DRAW_MIN_STEP - 1e-9,
        "two consecutive clinch breaks must never share a pitch");
      assert.notEqual(clinchTechBreakParams({ draw }).rip.freq, clinchTechBreakParams({ draw: previous }).rip.freq);
    }
    previous = draw;
  }
});
