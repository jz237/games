import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AMBIENT_BIG_THRESHOLD,
  AMBIENT_KO_AMOUNT,
  AMBIENT_PULSE_TICKS,
  AMBIENT_STIR_THRESHOLD,
  ambientPhaseChange,
  ambientPulseLevel,
  createAmbientObs,
  pulseAmbientLatch,
  stirPulseKind,
} from "../engine/ambient.mjs";

// v5.0 AMBIENT REACTIONS — the pulse state machine that makes the Vet's
// floodlights flare on a big hit and a KO. These are the numbers the shipped
// build runs on (stirCrowd's 0.7 latch, the 48-tick decay, the 1.4 KO latch);
// a retune that zeroes the reaction goes red here instead of on the owner.

const testDir = dirname(fileURLToPath(import.meta.url));
const gameSource = readFileSync(join(testDir, "..", "game.js"), "utf8");

function testConstantsAreTheShippedNumbers() {
  assert.equal(AMBIENT_PULSE_TICKS, 48);
  assert.equal(AMBIENT_STIR_THRESHOLD, 0.7);
  assert.equal(AMBIENT_BIG_THRESHOLD, 1);
  assert.equal(AMBIENT_KO_AMOUNT, 1.4);
  assert.deepEqual(createAmbientObs(), { phase: null, pulseTick: -100000, pulseAmount: 0, pulseKind: "" });
}

function testStirThresholds() {
  // The stirs the sim actually sends: 0.25 (a whiff / small event), 0.75 (a
  // clean hit), 1.4 (the winning hit), and the per-move crowd profile scaled
  // by counter. Below 0.7 nothing flares; 0.7..1 is a splat; 1 and up is big.
  assert.equal(stirPulseKind(0.25), null);
  assert.equal(stirPulseKind(0.5), null);
  assert.equal(stirPulseKind(0.69), null);
  assert.equal(stirPulseKind(0.7), "splat");
  assert.equal(stirPulseKind(0.75), "splat");
  assert.equal(stirPulseKind(0.99), "splat");
  assert.equal(stirPulseKind(1), "big");
  assert.equal(stirPulseKind(1.4), "big");
  assert.equal(stirPulseKind(Number.NaN), null, "a NaN stir never latches (matches the old `amount >= 0.7` read)");
  assert.equal(stirPulseKind(undefined), null);
}

function testLatch() {
  const obs = createAmbientObs();
  // Rest state reads as no pulse at any plausible frame.
  assert.deepEqual(ambientPulseLevel(obs, 0), { pulseAge: 100000, pulse: 0, ko: false });
  pulseAmbientLatch(obs, "splat", 0.75, 1000);
  assert.deepEqual({ ...obs }, { phase: null, pulseTick: 1000, pulseAmount: 0.75, pulseKind: "splat" });
  // The newest moment always wins — a second stir inside the first's decay
  // restarts the flare, it does not queue.
  pulseAmbientLatch(obs, "big", 1.2, 1010);
  assert.equal(obs.pulseTick, 1010);
  assert.equal(obs.pulseKind, "big");
  assert.equal(obs.pulseAmount, 1.2);
  assert.equal(pulseAmbientLatch(obs, "ko", 1.4, 1020), obs, "returns the obs for chaining");
}

function testDecayOver48Ticks() {
  const obs = pulseAmbientLatch(createAmbientObs(), "big", 1, 500);
  // Frame before the latch: negative age, zero level.
  assert.deepEqual(ambientPulseLevel(obs, 499), { pulseAge: -1, pulse: 0, ko: false });
  // Latch tick: full.
  assert.deepEqual(ambientPulseLevel(obs, 500), { pulseAge: 0, pulse: 1, ko: false });
  // Linear: half at 24, a quarter at 36, gone the tick after 48.
  assert.equal(ambientPulseLevel(obs, 524).pulse, 0.5);
  assert.equal(ambientPulseLevel(obs, 536).pulse, 0.25);
  assert.ok(ambientPulseLevel(obs, 547).pulse > 0, "tick 47 is the last visibly live tick");
  assert.equal(ambientPulseLevel(obs, 548).pulse, 0, "tick 48 reads as exactly zero: (1 - 48/48) = 0");
  assert.deepEqual(ambientPulseLevel(obs, 549), { pulseAge: 49, pulse: 0, ko: false });
  // Strictly monotonic over the live window.
  let previous = 2;
  for (let frame = 500; frame <= 548; frame += 1) {
    const { pulse } = ambientPulseLevel(obs, frame);
    assert.ok(pulse < previous, `tick ${frame - 500} decays (${pulse} < ${previous})`);
    previous = pulse;
  }
  // Amount scales the level below 1 and is clamped above it: a 0.75 splat
  // starts at 0.75, a 1.4 KO starts at exactly 1 (never over-bright).
  assert.equal(ambientPulseLevel(pulseAmbientLatch(createAmbientObs(), "splat", 0.75, 0), 0).pulse, 0.75);
  assert.equal(ambientPulseLevel(pulseAmbientLatch(createAmbientObs(), "ko", 1.4, 0), 0).pulse, 1);
  assert.equal(ambientPulseLevel(pulseAmbientLatch(createAmbientObs(), "splat", 0.75, 0), 24).pulse, 0.375);
}

function testReducedMotionZeroesTheLevelNotTheAge() {
  const obs = pulseAmbientLatch(createAmbientObs(), "ko", 1.4, 100);
  const reduced = ambientPulseLevel(obs, 110, true);
  assert.equal(reduced.pulse, 0);
  assert.equal(reduced.ko, false, "no KO double-burst under reduced motion");
  assert.equal(reduced.pulseAge, 10, "the age still advances so the firework seeds keyed off the latch tick stay stable");
  const full = ambientPulseLevel(obs, 110, false);
  assert.ok(full.pulse > 0 && full.ko);
}

function testKoLatch() {
  const obs = createAmbientObs();
  // First read of a fight: the phase is recorded, nothing fires.
  assert.equal(ambientPhaseChange(obs, "intro", "fight"), null);
  assert.equal(obs.phase, "intro");
  assert.equal(ambientPhaseChange(obs, "fight", "fight"), null);
  // Same phase, frame after frame: nothing.
  assert.equal(ambientPhaseChange(obs, "fight", "fight"), null);
  // The KO: exactly one pulse on the change INTO finish...
  assert.deepEqual(ambientPhaseChange(obs, "finish", "fight"), { kind: "ko", amount: AMBIENT_KO_AMOUNT });
  assert.equal(obs.phase, "finish");
  assert.equal(ambientPhaseChange(obs, "finish", "fight"), null, "one-shot per phase change, never per frame");
  // ...and again on the change into roundover (a time-over decision reaches
  // roundover without passing finish, so both phases latch).
  assert.deepEqual(ambientPhaseChange(obs, "roundover", "fight"), { kind: "ko", amount: 1.4 });
  assert.equal(ambientPhaseChange(obs, "roundover", "fight"), null);
  // Off the fight screen (attract demo, replay theatre) a KO phase records
  // the phase but fires nothing — a phase change is not lost, it is just
  // not a stage reaction.
  const attract = createAmbientObs();
  ambientPhaseChange(attract, "fight", "title");
  assert.equal(ambientPhaseChange(attract, "finish", "title"), null);
  assert.equal(attract.phase, "finish");
  // Back to fight from finish: no pulse on the way down.
  assert.equal(ambientPhaseChange(obs, "fight", "fight"), null);
  // The KO latch reads as a KO pulse only while live.
  pulseAmbientLatch(obs, "ko", AMBIENT_KO_AMOUNT, 2000);
  assert.equal(ambientPulseLevel(obs, 2000).ko, true);
  assert.equal(ambientPulseLevel(obs, 2014).ko, true, "still live at the second burst's 14-tick offset");
  assert.equal(ambientPulseLevel(obs, 2049).ko, false);
  // A big hit after the KO overwrites the kind: no phantom double burst.
  pulseAmbientLatch(obs, "big", 1, 2010);
  assert.equal(ambientPulseLevel(obs, 2012).ko, false);
}

function testGameWiring() {
  // game.js keeps the resim guard around the latch and reads the level at the
  // stage draw; the arithmetic lives here and nowhere else.
  assert.match(gameSource, /const ambientObs = createAmbientObs\(\);/);
  assert.match(gameSource, /if \(rollbackResimulating\) return;\n\s*pulseAmbientLatch\(ambientObs, kind, amount, state\.simulationTick\);/);
  assert.match(gameSource, /const pulseKind = stirPulseKind\(amount\);\n\s*if \(pulseKind\) pulseAmbient\(pulseKind, amount\);/);
  assert.match(gameSource, /const koPulse = ambientPhaseChange\(ambientObs, state\.phase, state\.screen\);\n\s*if \(koPulse\) pulseAmbient\(koPulse\.kind, koPulse\.amount\);/);
  assert.match(gameSource, /const \{ pulseAge, pulse, ko \} = ambientPulseLevel\(ambientObs, frame, reduced\);/);
  assert.ok(!/pulseAge \/ 48/.test(gameSource), "no second copy of the decay in game.js");
  // The QA surface can ask whether a pulse latched.
  assert.match(gameSource, /ambient\(\) \{\n\s*return \{\n\s*\.\.\.ambientObs,/);
}

testConstantsAreTheShippedNumbers();
testStirThresholds();
testLatch();
testDecayOver48Ticks();
testReducedMotionZeroesTheLevelNotTheAge();
testKoLatch();
testGameWiring();

console.log("Final Blow ambient pulse tests passed");
