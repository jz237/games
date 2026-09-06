import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AMBIENT_BIG_THRESHOLD,
  AMBIENT_KO_AMOUNT,
  AMBIENT_KO_BEAT_TICKS,
  AMBIENT_KO_HORNS,
  AMBIENT_PULSE_TICKS,
  AMBIENT_STIR_THRESHOLD,
  ambientKoBeat,
  ambientPhaseChange,
  ambientPulseLevel,
  ambientStutter,
  ambientSurge,
  ambientSyncedCycle,
  createAmbientObs,
  pickKoHorn,
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
  // The QA surface can ask whether a pulse latched. (v5.1 STAGE KO BEATS:
  // the hook computes the KO beat and the surge before it returns, so the
  // pin moved from "returns the obs straight away" to "spreads the obs, the
  // level, the beat and the surge".)
  assert.match(gameSource, /ambient\(\) \{\n[\s\S]{0,700}?\.\.\.ambientObs,\n\s*\.\.\.level,\n\s*beat,\n\s*surge: ambientSurge\(level, beat\),\n\s*stage: state\.stage,/);
}

// v5.1 STAGE KO BEATS — the four stages that got one hook in 5.0 answer big
// hits and the KO off the crowd's KO hold. Pure helpers here, the furniture
// in game.js; a retune that stops a stage reacting goes red below.

function testKoBeat() {
  assert.equal(AMBIENT_KO_BEAT_TICKS, 48, "the KO flash decays over the same 48 ticks as the pulse");
  // No hold (crowdKoHoldAge() reads -1): nothing.
  assert.deepEqual(ambientKoBeat(-1), { age: -1, flash: 0, hold: false });
  assert.deepEqual(ambientKoBeat(undefined), { age: undefined, flash: 0, hold: false });
  assert.deepEqual(ambientKoBeat(Number.NaN), { age: Number.NaN, flash: 0, hold: false });
  // The roundover edge: full flash, hold on.
  assert.deepEqual(ambientKoBeat(0), { age: 0, flash: 1, hold: true });
  assert.deepEqual(ambientKoBeat(24), { age: 24, flash: 0.5, hold: true });
  assert.equal(ambientKoBeat(47).flash > 0, true);
  assert.equal(ambientKoBeat(48).flash, 0, "tick 48 reads as exactly zero like the pulse");
  // Past the flash the hold rides the whole 294-tick roundover.
  assert.deepEqual(ambientKoBeat(200), { age: 200, flash: 0, hold: true });
  // Reduced motion: no flash, no hold (nothing strobes), the age still reported.
  assert.deepEqual(ambientKoBeat(5, true), { age: 5, flash: 0, hold: false });
  let previous = 2;
  for (let age = 0; age <= 48; age += 1) {
    const { flash } = ambientKoBeat(age);
    assert.ok(flash < previous, `tick ${age} decays`);
    previous = flash;
  }
}

function testSurgePicksTheStrongerRead() {
  const rest = { pulseAge: 100000, pulse: 0 };
  // Nothing live: level 0, age -1, no ko, no hold.
  assert.deepEqual(ambientSurge(rest, ambientKoBeat(-1)), { level: 0, age: -1, ko: false, hold: false });
  assert.deepEqual(ambientSurge(null, null), { level: 0, age: -1, ko: false, hold: false });
  // A big hit alone: the pulse drives, with the pulse's own age.
  assert.deepEqual(ambientSurge({ pulseAge: 12, pulse: 0.75 }, ambientKoBeat(-1)), { level: 0.75, age: 12, ko: false, hold: false });
  // The KO tick: the pulse (1.4 clamped to 1) and the flash (1) tie; the KO wins the tie.
  assert.deepEqual(ambientSurge({ pulseAge: 0, pulse: 1 }, ambientKoBeat(0)), { level: 1, age: 0, ko: true, hold: true });
  // A fatality round: the ko pulse fired at the FINISH prompt and is long
  // gone when the hold latches on the kill — the beat drives on its own.
  assert.deepEqual(ambientSurge(rest, ambientKoBeat(10)), { level: 1 - 10 / 48, age: 10, ko: true, hold: true });
  // Deep in the hold with the flash spent: no level, but the hold is still
  // reported so the slow furniture (sign chase, horn light) keeps riding it.
  assert.deepEqual(ambientSurge(rest, ambientKoBeat(120)), { level: 0, age: -1, ko: false, hold: true });
  // A fresh big hit during a spent hold drives with the pulse.
  assert.deepEqual(ambientSurge({ pulseAge: 3, pulse: 0.9 }, ambientKoBeat(120)), { level: 0.9, age: 3, ko: false, hold: true });
  // Reduced motion zeroes both reads, so the surge is zero too.
  const obs = pulseAmbientLatch(createAmbientObs(), "ko", 1.4, 0);
  assert.equal(ambientSurge(ambientPulseLevel(obs, 0, true), ambientKoBeat(0, true)).level, 0);
}

function testSyncedCycle() {
  // The pigeons' scatter rule as it shipped in 5.0, now shared with the pool
  // splashes and the buffet steam: for the window after a latch every piece
  // rides the latch age plus its own stagger, outside it the idle rhythm.
  assert.equal(ambientSyncedCycle(0, 4, 60, 777), 4);
  assert.equal(ambientSyncedCycle(30, 8, 60, 777), 38);
  assert.equal(ambientSyncedCycle(59, 0, 60, 777), 59);
  assert.equal(ambientSyncedCycle(60, 0, 60, 777), 777, "the window is half-open");
  assert.equal(ambientSyncedCycle(-1, 0, 60, 777), 777, "before the latch: idle");
  assert.equal(ambientSyncedCycle(100000, 0, 60, 777), 777, "rest state: idle");
  // Five splash plumes three ticks apart all fire inside the first 12 ticks.
  const fired = [0, 1, 2, 3, 4].map((index) => ambientSyncedCycle(0, index * 3, 60, 200));
  assert.deepEqual(fired, [0, 3, 6, 9, 12]);
}

function testStutter() {
  // No surge: a plain multiplier of 1 for every bulb, whatever its hash.
  for (const hash of [0, 0.3, 0.6, 0.99]) assert.equal(ambientStutter(hash, 0), 1);
  assert.equal(ambientStutter(0.5, -1), 1);
  assert.equal(ambientStutter(0.5, Number.NaN), 1);
  // Full surge: 55% of bulbs overdriven to 1.8, the rest dropped to 0.15 —
  // a stutter, never a dimmer, never every bulb doing the same thing.
  assert.equal(ambientStutter(0.54, 1), 1.8);
  assert.equal(ambientStutter(0.56, 1), 0.15);
  let lit = 0;
  for (let bulb = 0; bulb < 1000; bulb += 1) if (ambientStutter(bulb / 1000, 1) > 1) lit += 1;
  assert.equal(lit, 550);
  // Half surge: 1.4 for the lit share (~77%), 0.15 for the rest.
  assert.equal(ambientStutter(0.5, 0.5), 1.4);
  assert.equal(ambientStutter(0.8, 0.5), 0.15);
  // Over-unity levels clamp (a 1.4 KO stir never darkens more than 45%).
  assert.equal(ambientStutter(0.54, 1.4), 1.8);
  assert.equal(ambientStutter(0.56, 1.4), 0.15);
}

function testKoHornsNeverRepeat() {
  assert.equal(AMBIENT_KO_HORNS.length, 3);
  const ids = AMBIENT_KO_HORNS.map((horn) => horn.id);
  assert.deepEqual(ids, ["long", "double", "high"]);
  for (const horn of AMBIENT_KO_HORNS) {
    assert.ok(horn.from >= 80 && horn.from <= 120, `${horn.id} sits in the ship-whistle register`);
    assert.ok(Math.abs(horn.fifth / horn.from - 1.5) < 0.01, `${horn.id}'s second reed is a fifth up`);
    assert.ok(horn.seconds > 0.5 && horn.peak > 0 && horn.blasts >= 1);
  }
  assert.equal(AMBIENT_KO_HORNS[1].blasts, 2, "the double is two blasts");
  // First pick: any of the three by the roll.
  assert.equal(pickKoHorn(-1, 0), 0);
  assert.equal(pickKoHorn(-1, 0.5), 1);
  assert.equal(pickKoHorn(undefined, 0.99), 2);
  // Never the previous one, whatever the roll.
  for (let previous = 0; previous < 3; previous += 1) {
    for (let roll = 0; roll < 1; roll += 0.05) {
      const pick = pickKoHorn(previous, roll);
      assert.notEqual(pick, previous, `previous ${previous} roll ${roll.toFixed(2)}`);
      assert.ok(pick >= 0 && pick < 3);
    }
    // Both other horns are reachable.
    assert.deepEqual([pickKoHorn(previous, 0.1), pickKoHorn(previous, 0.9)].sort(), [0, 1, 2].filter((index) => index !== previous));
  }
  // A bad roll still picks something valid.
  assert.equal(pickKoHorn(0, Number.NaN), 1);
  assert.equal(pickKoHorn(0, 2), 1);
}

function testStageBeatWiring() {
  // One shared read: the phase latch and the level live in readAmbientPulse,
  // the KO beat folds in through stageSurge, and every layer that reacts —
  // the ambient furniture, the two atmosphere passes, the practical lights —
  // reads through it (never its own copy of the arithmetic).
  assert.match(gameSource, /function readAmbientPulse\(frame, reduced\) \{\n\s*const koPulse = ambientPhaseChange/);
  assert.match(gameSource, /function stageKoBeat\(reduced = state\.accessibility\.reducedMotion\) \{\n\s*updateCrowdKoHoldLatch\(\);\n\s*return ambientKoBeat\(crowdKoHoldAge\(\), reduced\);/);
  assert.match(gameSource, /const \{ pulseAge, pulse, ko \} = readAmbientPulse\(frame, reduced\);\n[\s\S]{0,600}?const beat = stageKoBeat\(reduced\);\n\s*const surge = ambientSurge\(\{ pulseAge, pulse \}, beat\);/);
  assert.match(gameSource, /function drawBuffetAtmosphere\([^)]*\) \{\n[\s\S]{0,400}?const surge = stageSurge\(frame\);/);
  assert.match(gameSource, /function drawPoolDeckAtmosphere\([^)]*\) \{\n[\s\S]{0,500}?const surge = stageSurge\(frame\);/);
  assert.match(gameSource, /function drawPracticalLights\([^)]*\) \{\n[\s\S]{0,700}?const surge = stageSurge\(frame, reduced\);/);
  assert.ok(!/ambientKoBeat\(crowdKoHoldAge\(\), [^)]*\)[\s\S]*ambientKoBeat\(crowdKoHoldAge\(\), [^)]*\)[\s\S]*ambientKoBeat\(crowdKoHoldAge\(\)/.test(gameSource), "the beat is read in stageKoBeat and the QA hook only");
  // Each of the four stage branches draws from the surge and the beat.
  const ambient = gameSource.slice(gameSource.indexOf("function drawStageAmbient("), gameSource.indexOf("function drawBoardwalkAtmosphere("));
  for (const stage of ["wildwood", "buffet", "cruise", "somerset"]) {
    const start = ambient.indexOf(`stage === "${stage}"`);
    assert.ok(start > 0, `${stage} branch present`);
    const branch = ambient.slice(start, ambient.indexOf("} else if (stage ===", start + 10) === -1 ? undefined : ambient.indexOf("} else if (stage ===", start + 10));
    assert.ok((branch.match(/surge\.level/g) || []).length >= 3, `${stage} draws its furniture from the surge (${(branch.match(/surge\.level/g) || []).length} reads)`);
    assert.ok(/beat\.(hold|flash)/.test(branch), `${stage} has a KO beat of its own`);
    assert.ok(/ambientStutter\(/.test(branch), `${stage} stutters something (no bulb ever just dims)`);
  }
  // The synced cycles all go through the helper: pigeons, splashes, steam.
  assert.match(gameSource, /const scatter = ambientSyncedCycle\(pulseAge, bird \* 4, 60, \(f \+ bird \* 90\) % 900\);/);
  assert.match(gameSource, /ambientSyncedCycle\(surge\.pulseAge, index \* 3, 60, idle\)/);
  assert.match(gameSource, /const erupt = surge\.level > 0 \? Math\.min\(1, surge\.age \/ 10\) : 0;/);
  // The cruise horn: once per hold, the pick never repeating, off the hold tick's hash.
  assert.match(gameSource, /state\.stage === "cruise" && crowdKoHold\.startTick >= 0 && koHorn\.holdTick !== crowdKoHold\.startTick/);
  assert.match(gameSource, /koHorn\.last = pickKoHorn\(koHorn\.last, presentationHash01\(crowdKoHold\.startTick, 211\)\);\n\s*playKoHorn\(AMBIENT_KO_HORNS\[koHorn\.last\]\);/);
  assert.match(gameSource, /koHorns: audioFxDebug\.koHorns,/);
}

testConstantsAreTheShippedNumbers();
testStirThresholds();
testLatch();
testDecayOver48Ticks();
testReducedMotionZeroesTheLevelNotTheAge();
testKoLatch();
testGameWiring();
testKoBeat();
testSurgePicksTheStrongerRead();
testSyncedCycle();
testStutter();
testKoHornsNeverRepeat();
testStageBeatWiring();

console.log("Final Blow ambient pulse tests passed");
