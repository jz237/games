// ===========================================================================
// v3.2 — the adjustable demo speed contract.
//
// The single most important assertion in this file is that the scaler is a
// TICK CADENCE multiplier and NOT a dt change. Everything about this sim is
// written against a fixed 1/60s step — frame windows, the input buffer, the
// stun decay grace, every physics integration — and a rollback engine on top
// of it requires two runs of the same inputs to produce the same state. A dt
// scaler breaks all of that at once; a cadence scaler is invisible to it.
// So: same tick stream, spread over more wall-clock. Nothing else.
// ===========================================================================

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FixedStepClock, SIMULATION_STEP_SECONDS } from "../engine/foundation.mjs";
import {
  DEMO_SPEED_RATES,
  DEFAULT_DEMO_SPEED,
  MAX_FRAME_STEP_BURST,
  clampDemoSpeed,
  createDemoSpeed,
  demoSpeedAllowed,
  nextDemoSpeed,
  parseDemoSpeed,
} from "../engine/demo-speed.mjs";

const gameRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// A render loop at a fixed display rate, driving the real fixed-step clock
// through the real transport. `dts` records the dt every sim tick was handed.
function runFrames(speed, {
  frames = 600, frameSeconds = 1 / 60, active = true,
} = {}) {
  const clock = new FixedStepClock();
  const dts = [];
  const ticks = [];
  let manual = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const stepped = active ? speed.takeFrameSteps() : 0;
    for (let index = 0; index < stepped; index += 1) {
      clock.stepOnce((dt, tick) => { dts.push(dt); ticks.push(tick); });
      manual += 1;
    }
    const simSeconds = active ? speed.scale(frameSeconds) : frameSeconds;
    clock.advance(simSeconds, (dt, tick) => { dts.push(dt); ticks.push(tick); });
  }
  return { clock, dts, ticks, manual, tick: clock.tick };
}

// ---------------------------------------------------------------------------
// THE CONTRACT: cadence, not dt
// ---------------------------------------------------------------------------

test("the speed scaler changes the TICK CADENCE and never the fixed step", () => {
  for (const rate of DEMO_SPEED_RATES) {
    const speed = createDemoSpeed({ rate });
    const run = runFrames(speed, { frames: 600 });
    // Every single tick ran at exactly the fixed step. This is the assertion
    // the whole feature rests on: a dt scaler would show 1/120, 1/240, 1/600.
    assert.ok(run.dts.length > 0, `${rate}x produced no ticks at all`);
    for (const dt of run.dts) {
      assert.equal(dt, SIMULATION_STEP_SECONDS,
        `${rate}x handed the sim dt ${dt} instead of the fixed ${SIMULATION_STEP_SECONDS}`);
    }
    // ...and it took proportionally fewer of them over the same wall clock.
    const expected = 600 * rate;
    assert.ok(Math.abs(run.tick - expected) <= 2,
      `${rate}x advanced ${run.tick} ticks over 600 frames, expected ~${expected}`);
  }
});

test("0.5x advances the sim every other rendered frame, 0.1x about one in ten", () => {
  const half = runFrames(createDemoSpeed({ rate: 0.5 }), { frames: 600 });
  const tenth = runFrames(createDemoSpeed({ rate: 0.1 }), { frames: 600 });
  const full = runFrames(createDemoSpeed({ rate: 1 }), { frames: 600 });
  assert.ok(Math.abs(full.tick - 600) <= 2, `1x should track the display rate, got ${full.tick}`);
  assert.ok(Math.abs(half.tick - 300) <= 2, `0.5x should halve the cadence, got ${half.tick}`);
  assert.ok(Math.abs(tenth.tick - 60) <= 2, `0.1x should be a tenth, got ${tenth.tick}`);
  // Rendering is untouched — the same 600 frames drew either way. The ONLY
  // difference is how many ticks the clock took inside them.
  assert.ok(half.tick < full.tick && tenth.tick < half.tick);
});

test("the tick STREAM is identical at every rate — same ticks, same order, same dt", () => {
  // Run each rate long enough in wall-clock to reach 120 ticks, then compare
  // the tick indices the sim was actually driven with.
  const streams = DEMO_SPEED_RATES.map((rate) => {
    const run = runFrames(createDemoSpeed({ rate }), { frames: Math.ceil(120 / rate) + 4 });
    return run.ticks.slice(0, 120);
  });
  const reference = streams[0];
  assert.equal(reference.length, 120);
  for (let index = 0; index < streams.length; index += 1) {
    assert.deepEqual(streams[index], reference,
      `rate ${DEMO_SPEED_RATES[index]} produced a different tick stream`);
  }
  // The stream is 1..120 with no gaps and no repeats. A dt scaler would keep
  // this property too — which is exactly why the dt assertion above is the
  // one that matters — but a BROKEN cadence scaler (one that skipped or
  // double-stepped) would fail here.
  assert.deepEqual(reference, Array.from({ length: 120 }, (unused, i) => i + 1));
});

test("scaling withholds wall-clock rather than discarding ticks", () => {
  const speed = createDemoSpeed({ rate: 0.25 });
  // 60 frames of 1/60s = 1.0s of wall clock; a quarter of it reaches the clock.
  let delivered = 0;
  for (let frame = 0; frame < 60; frame += 1) delivered += speed.scale(1 / 60);
  assert.ok(Math.abs(delivered - 0.25) < 1e-9, `delivered ${delivered}s, expected 0.25s`);
  assert.ok(Math.abs(speed.heldSeconds - 0.75) < 1e-9,
    `withheld ${speed.heldSeconds}s, expected 0.75s`);
});

// ---------------------------------------------------------------------------
// Pause and frame step
// ---------------------------------------------------------------------------

test("pause holds the sim completely and releases it unchanged", () => {
  const speed = createDemoSpeed({ rate: 1 });
  const clock = new FixedStepClock();
  for (let frame = 0; frame < 60; frame += 1) clock.advance(speed.scale(1 / 60), () => {});
  const running = clock.tick;
  assert.ok(running >= 58, `expected the clock to run before pausing, got ${running}`);

  speed.setPaused(true);
  for (let frame = 0; frame < 600; frame += 1) {
    assert.equal(speed.scale(1 / 60), 0, "a paused transport must deliver zero seconds");
    clock.advance(speed.scale(1 / 60), () => {});
  }
  assert.equal(clock.tick, running, "ten seconds of paused wall clock advanced the sim");

  speed.setPaused(false);
  for (let frame = 0; frame < 60; frame += 1) clock.advance(speed.scale(1 / 60), () => {});
  assert.ok(clock.tick - running >= 58,
    `unpausing must resume at the full rate, advanced ${clock.tick - running}`);
});

test("frame step advances EXACTLY one tick per request, at the fixed step", () => {
  const speed = createDemoSpeed({ rate: 1 });
  const clock = new FixedStepClock();
  const dts = [];
  const drive = () => {
    const stepped = speed.takeFrameSteps();
    for (let index = 0; index < stepped; index += 1) clock.stepOnce((dt) => dts.push(dt));
    clock.advance(speed.scale(1 / 60), (dt) => dts.push(dt));
    return stepped;
  };

  speed.setPaused(true);
  for (let frame = 0; frame < 10; frame += 1) drive();
  const held = clock.tick;

  // One request, one tick — and nothing more on the frames after it.
  speed.frameStep();
  assert.equal(drive(), 1);
  assert.equal(clock.tick, held + 1, "a single frame step must advance exactly one tick");
  for (let frame = 0; frame < 30; frame += 1) drive();
  assert.equal(clock.tick, held + 1, "a spent frame step must not keep advancing");

  // Three requests, three ticks.
  speed.frameStep(3);
  drive();
  assert.equal(clock.tick, held + 4);
  for (const dt of dts) assert.equal(dt, SIMULATION_STEP_SECONDS);
});

test("frame step pauses a running transport and a long hold cannot dump a burst", () => {
  const speed = createDemoSpeed({ rate: 1 });
  assert.equal(speed.paused, false);
  speed.frameStep();
  assert.equal(speed.paused, true, "asking for one frame must stop the clock first");

  speed.frameStep(50);
  assert.equal(speed.takeFrameSteps(), MAX_FRAME_STEP_BURST,
    "a held key must not bank an unbounded burst into one rendered frame");
  assert.equal(speed.pendingSteps, 51 - MAX_FRAME_STEP_BURST);

  // Unpausing throws the queue away rather than firing it into live motion.
  speed.setPaused(false);
  assert.equal(speed.pendingSteps, 0);
  assert.equal(speed.takeFrameSteps(), 0);
});

// ---------------------------------------------------------------------------
// Scoping — the thing that must never leak
// ---------------------------------------------------------------------------

test("the transport is scoped to demo and training and REFUSES online", () => {
  assert.equal(demoSpeedAllowed("demo"), true);
  assert.equal(demoSpeedAllowed("training"), true);
  for (const mode of ["online", "versus", "arcade", "tournament", "survival", "team", "daily", ""]) {
    assert.equal(demoSpeedAllowed(mode), false, `${mode} must not get the speed transport`);
  }
  // Online is refused a second time by the session flag, whatever the mode
  // string says — a spectate/rollback session that mislabels itself still
  // cannot slow its own clock away from its peer.
  assert.equal(demoSpeedAllowed("demo", { online: true }), false);
  assert.equal(demoSpeedAllowed("training", { online: true }), false);
  // Replay playback is its own transport and drives the clock itself.
  assert.equal(demoSpeedAllowed("demo", { replay: true }), false);
});

test("an inactive transport passes wall-clock through untouched", () => {
  const speed = createDemoSpeed({ rate: 0.1 });
  speed.setPaused(true);
  // `active: false` is what game.js does outside the scoped modes: the
  // transport is never consulted, so a rate or a pause left set from an
  // earlier demo cannot follow the player into a real match.
  const run = runFrames(speed, { frames: 600, active: false });
  assert.ok(Math.abs(run.tick - 600) <= 2,
    `an out-of-scope context must run at 1x, got ${run.tick} ticks`);
  assert.equal(run.manual, 0);
});

test("game.js gates every transport call site on the scoping helper", async () => {
  const game = await readFile(join(gameRoot, "game.js"), "utf8");
  // The render loop must consult demoSpeedActive() before it scales anything.
  assert.match(game, /const speedScaled = demoSpeedActive\(\);/);
  assert.match(game, /const simSeconds = speedScaled \? demoSpeed\.scale\(elapsed\) : elapsed;/);
  // ...and demoSpeedActive must stand down under qaManualMode, which is what
  // keeps the seeded QA reproduction path byte-identical.
  assert.match(game, /function demoSpeedActive\(\)\s*\{\s*return demoSpeedScoped\(\) && !state\.qaManualMode;/);
  // The scoping helper must refuse an online session role outright.
  assert.match(game, /function demoSpeedScoped\(\)\s*\{\s*if \(onlineSession\.role\) return false;/);
  // The fixed step itself must never be multiplied anywhere.
  assert.doesNotMatch(game, /SIMULATION_STEP_SECONDS\s*\*\s*demoSpeed/);
  assert.doesNotMatch(game, /demoSpeed\.rate\s*\*\s*SIMULATION_STEP_SECONDS/);
  assert.doesNotMatch(game, /runSimulationStep\([^)]*demoSpeed/);
  // The transport keys have to be claimed before the any-key-exits-the-demo
  // rule, or every one of them would quit the demo on first press.
  const transportAt = game.indexOf("if (handleDemoSpeedKey(event)) {");
  const exitAt = game.indexOf("if (demoSession.active) {\n    event.preventDefault();\n    noteUserActivity();");
  assert.ok(transportAt > 0 && exitAt > 0 && transportAt < exitAt,
    "the transport keys must be handled before the demo-exit rule");
  // ...but it must never steal a key that belongs to a player binding, a
  // rebind capture, or a focused text field. Every combat key is remappable,
  // so "the defaults do not collide" is not a guarantee on its own.
  assert.match(game, /if \(pendingKeyBinding\) return false;/);
  assert.ok(game.includes(
    "if (keyMaps.some((map) => Object.values(map).includes(event.code))) return false;",
  ), "the transport must defer to any key the player has bound");
});

// ---------------------------------------------------------------------------
// Rate ladder plumbing
// ---------------------------------------------------------------------------

test("the rate ladder covers the requested rates and steps in both directions", () => {
  assert.deepEqual([...DEMO_SPEED_RATES], [1, 0.5, 0.25, 0.1]);
  assert.equal(DEFAULT_DEMO_SPEED, 1);
  assert.equal(nextDemoSpeed(1, -1), 0.5);
  assert.equal(nextDemoSpeed(0.5, -1), 0.25);
  assert.equal(nextDemoSpeed(0.25, -1), 0.1);
  assert.equal(nextDemoSpeed(0.1, -1), 0.1, "the ladder must clamp at its slow end");
  assert.equal(nextDemoSpeed(0.1, 1), 0.25);
  assert.equal(nextDemoSpeed(1, 1), 1, "the ladder must clamp at its fast end");
});

test("?speed= parses, snaps to the ladder and rejects nonsense", () => {
  assert.equal(parseDemoSpeed("0.25"), 0.25);
  assert.equal(parseDemoSpeed("1"), 1);
  assert.equal(parseDemoSpeed(".1"), 0.1);
  // Snapped in log space, so 0.3 is nearer 0.25 than 0.5.
  assert.equal(parseDemoSpeed("0.3"), 0.25);
  assert.equal(parseDemoSpeed("0.7"), 0.5);
  assert.equal(parseDemoSpeed("4"), 1, "the transport never runs the sim FASTER than real time");
  assert.equal(parseDemoSpeed(null), null);
  assert.equal(parseDemoSpeed(""), null);
  assert.equal(parseDemoSpeed("fast"), null);
  assert.equal(parseDemoSpeed("-2"), null);
  assert.equal(parseDemoSpeed("0"), null);
  assert.equal(clampDemoSpeed(NaN), DEFAULT_DEMO_SPEED);
  assert.equal(clampDemoSpeed(0.24), 0.25);
});

console.log("Final Blow demo-speed tests passed");
