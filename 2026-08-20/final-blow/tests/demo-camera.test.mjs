// ===========================================================================
// 5.4 FIGHT NIGHT — the demo camera/cadence director (sweep #7 / #17).
//
// Three contracts. (1) The shot list is SEEDED and non-repeating: a seed
// replays the same shots in the same order, and no variant ever plays twice
// in a row. (2) The cadence policy is a pure function of sim state and tick —
// neutral 1x, exchange 0.75x with a dwell, a slow-motion KO beat of the
// drawn shot's length, ceremony 0.75x — and the transport it drives is still
// a tick CADENCE multiplier: the tick stream is bit-identical with or without
// it, and the operator's keys lock it out. (3) Every game.js call site is
// gated on the demo (pinned from source), so a played match never reaches
// any of it.
// ===========================================================================

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FixedStepClock } from "../engine/foundation.mjs";
import { createDemoSpeed, DEFAULT_DEMO_SPEED } from "../engine/demo-speed.mjs";
import { demoSpeedTag } from "../engine/demo-hud.mjs";
import {
  DEMO_3D_SHOT_ZOOM_CAP,
  DEMO_CADENCE_BEATS,
  DEMO_CADENCE_RATES,
  DEMO_CONTACT_RANGE,
  DEMO_EXCHANGE_DWELL_TICKS,
  DEMO_EXCHANGE_LEAN_ZOOM,
  DEMO_KO_SHOTS,
  DEMO_SUPER_SHOTS,
  cadenceTagText,
  createDemoCadence,
  createDemoCameraDirector,
  shotAlive,
  shotLife,
  shotShape,
} from "../engine/demo-camera.mjs";

const gameRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// --- the shot list ----------------------------------------------------------

test("the shot lists are authored to be told apart: distinct ids, real push-ins, a slow-mo beat per KO shot", () => {
  for (const list of [DEMO_SUPER_SHOTS, DEMO_KO_SHOTS]) {
    assert.ok(list.length >= 3, "three variants so three in a row never read the same");
    assert.equal(new Set(list.map(({ id }) => id)).size, list.length);
    for (const shot of list) {
      assert.ok(shot.zoom >= 1.18 && shot.zoom <= 1.45, `${shot.id}: a visible push-in (${shot.zoom})`);
      assert.ok(shot.zoom * 0.86 > 1, `${shot.id}: tighter than a played match's frame even through the 0.86 demo pull-back`);
      assert.ok(shotLife(shot) >= 0.9 && shotLife(shot) <= 2.2, `${shot.id}: a beat, not a flicker and not a hold (${shotLife(shot)} s)`);
      assert.ok(Math.abs(shot.dutchDeg) <= 2, `${shot.id}: a degree or two of dutch, never a tilt`);
    }
  }
  for (const shot of DEMO_KO_SHOTS) {
    assert.ok(shot.slowMoRate >= 0.25 && shot.slowMoRate <= 0.5, `${shot.id}: slow motion, still moving`);
    assert.ok(shot.slowMoTicks >= 18 && shot.slowMoTicks <= 30, `${shot.id}: inside the shortest KO window (the 21-tick Final Blow reaction covers most of it)`);
  }
  assert.equal(new Set(DEMO_KO_SHOTS.map(({ slowMoRate }) => slowMoRate)).size, DEMO_KO_SHOTS.length, "every KO beat has its own tempo");
  assert.ok(DEMO_3D_SHOT_ZOOM_CAP >= Math.max(...DEMO_SUPER_SHOTS.map(({ zoom }) => zoom)), "the 3D cap clears the tightest shot");
  assert.ok(DEMO_EXCHANGE_LEAN_ZOOM > 1 && DEMO_EXCHANGE_LEAN_ZOOM < 1.1, "the lean is a breath, not a shot");
});

test("the envelope: smooth attack, flat hold, smooth release, dead after", () => {
  const shot = { attack: 0.2, hold: 0.5, release: 0.3 };
  assert.equal(shotShape(shot, 0), 0);
  assert.ok(shotShape(shot, 0.1) > 0.4 && shotShape(shot, 0.1) < 0.6);
  assert.equal(shotShape(shot, 0.2), 1);
  assert.equal(shotShape(shot, 0.6), 1);
  assert.ok(shotShape(shot, 0.85) > 0.4 && shotShape(shot, 0.85) < 0.6);
  assert.equal(shotShape(shot, 1), 0);
  assert.equal(shotShape(shot, 5), 0);
  assert.equal(shotAlive(shot, 0.99), true);
  assert.equal(shotAlive(shot, 1), false);
  assert.equal(shotAlive(null, 0), false);
  assert.equal(shotShape(shot, -1), 0);
  // Monotonic on the way up and the way down.
  let last = -1;
  for (let age = 0; age <= 0.2; age += 0.01) { const value = shotShape(shot, age); assert.ok(value >= last); last = value; }
  last = 2;
  for (let age = 0.7; age <= 1; age += 0.01) { const value = shotShape(shot, age); assert.ok(value <= last); last = value; }
});

test("a seed replays the same shot order; another seed does not; no variant ever repeats back to back", () => {
  const draws = (seed, count) => {
    const director = createDemoCameraDirector({ seed });
    const supers = [];
    const kos = [];
    for (let index = 0; index < count; index += 1) {
      supers.push(director.superShot(index * 7).id);
      kos.push(director.koShot(index * 11).id);
    }
    return { supers, kos, snapshot: director.snapshot() };
  };
  const first = draws(237, 300);
  const again = draws(237, 300);
  assert.deepEqual(first.supers, again.supers);
  assert.deepEqual(first.kos, again.kos);
  assert.equal(first.snapshot.rng, again.snapshot.rng);
  const other = draws(9001, 300);
  assert.notDeepEqual(first.supers.slice(0, 40), other.supers.slice(0, 40), "a different seed is a different show");
  for (const sequence of [first.supers, first.kos, other.supers, other.kos]) {
    for (let index = 1; index < sequence.length; index += 1) {
      assert.notEqual(sequence[index], sequence[index - 1], `back-to-back repeat at draw ${index}`);
    }
    // Every variant is reached, and roughly evenly (a bag, not a coin).
    const counts = {};
    for (const id of sequence) counts[id] = (counts[id] || 0) + 1;
    assert.equal(Object.keys(counts).length, 3);
    for (const count of Object.values(counts)) assert.ok(count >= 80 && count <= 120, JSON.stringify(counts));
  }
  assert.equal(first.snapshot.supers, 300);
  assert.equal(first.snapshot.kos, 300);
  assert.equal(first.snapshot.log.length, 64, "the log is bounded");
  assert.deepEqual(Object.keys(first.snapshot.log[0]).sort(), ["id", "kind", "tick"]);
  assert.throws(() => createDemoCameraDirector({ seed: 1, superShots: [] }));
});

test("the order of events fixes the draw: a replayed event order replays the shots, and any order stays non-repeating", () => {
  const pure = createDemoCameraDirector({ seed: 55 });
  const mixed = createDemoCameraDirector({ seed: 55 });
  const pureKos = Array.from({ length: 30 }, () => pure.koShot().id);
  const mixedKos = [];
  for (let index = 0; index < 30; index += 1) {
    mixed.superShot();
    mixedKos.push(mixed.koShot().id);
  }
  // Both bags share one rng, so interleaving DOES change the draw — what is
  // pinned is that either order is a legal non-repeating sequence from the
  // same seed, i.e. the order of events fixes the show, nothing else does.
  for (const sequence of [pureKos, mixedKos]) {
    for (let index = 1; index < sequence.length; index += 1) assert.notEqual(sequence[index], sequence[index - 1]);
  }
  const replay = createDemoCameraDirector({ seed: 55 });
  const replayKos = [];
  for (let index = 0; index < 30; index += 1) { replay.superShot(); replayKos.push(replay.koShot().id); }
  assert.deepEqual(replayKos, mixedKos);
});

// --- the cadence policy -------------------------------------------------------

const koShot = DEMO_KO_SHOTS[0];
const fight = (tick, overrides = {}) => ({ phase: "fight", finisher: false, tick, engaged: false, distance: 600, koTick: -1, koShot: null, ...overrides });

test("the policy: intro, neutral at range, exchange on contact or in range, ceremony after", () => {
  const cadence = createDemoCadence();
  assert.deepEqual(cadence.update({ phase: "intro", tick: 10 }), { beat: "intro", rate: DEMO_CADENCE_RATES.intro });
  assert.deepEqual(cadence.update(fight(100)), { beat: "neutral", rate: 1 });
  assert.deepEqual(cadence.update(fight(101, { engaged: true })), { beat: "exchange", rate: 0.75 });
  assert.deepEqual(cadence.update(fight(200, { distance: DEMO_CONTACT_RANGE })), { beat: "exchange", rate: 0.75 }, "in range is an exchange before a button is pressed");
  assert.deepEqual(cadence.update(fight(200 + DEMO_EXCHANGE_DWELL_TICKS + 1, { distance: DEMO_CONTACT_RANGE + 1 })), { beat: "neutral", rate: 1 });
  assert.deepEqual(cadence.update({ phase: "roundover", tick: 400 }), { beat: "ceremony", rate: 0.75 });
  assert.deepEqual(cadence.update({ phase: "fight", finisher: true, tick: 401 }), { beat: "ceremony", rate: 0.75 }, "a Final Blow cinematic owns its own slow motion");
  assert.deepEqual(cadence.update({ phase: "result", tick: 402 }), { beat: "ceremony", rate: 0.75 });
  assert.ok(DEMO_CADENCE_BEATS.includes(cadence.beat));
  assert.deepEqual(Object.keys(cadence.snapshot()).sort(), ["beat", "lastContactTick", "rate"]);
});

test("the exchange dwell: a string with gaps holds its tempo, and only a real gap opens neutral", () => {
  const cadence = createDemoCadence();
  cadence.update(fight(0, { engaged: true }));
  for (let tick = 1; tick <= DEMO_EXCHANGE_DWELL_TICKS; tick += 1) {
    assert.equal(cadence.update(fight(tick)).beat, "exchange", `tick ${tick} inside the dwell`);
  }
  assert.equal(cadence.update(fight(DEMO_EXCHANGE_DWELL_TICKS + 1)).beat, "neutral");
  // A second contact 10 ticks after the first restarts the dwell from there.
  cadence.update(fight(100, { engaged: true }));
  cadence.update(fight(110, { engaged: true }));
  assert.equal(cadence.update(fight(110 + DEMO_EXCHANGE_DWELL_TICKS)).beat, "exchange");
  assert.equal(cadence.update(fight(111 + DEMO_EXCHANGE_DWELL_TICKS)).beat, "neutral");
  // A rewound tick (new seed on the same page) forgets the old contact.
  cadence.update(fight(500, { engaged: true }));
  assert.equal(cadence.update(fight(5)).beat, "neutral");
  cadence.reset();
  assert.equal(cadence.beat, "intro");
});

test("the KO beat: the drawn shot's slow-mo rate for exactly its ticks, then the ceremony", () => {
  const cadence = createDemoCadence();
  cadence.update(fight(1000, { engaged: true }));
  const koTick = 1001;
  for (let tick = koTick; tick < koTick + koShot.slowMoTicks; tick += 1) {
    assert.deepEqual(cadence.update(fight(tick, { phase: "finish", koTick, koShot })), { beat: "ko", rate: koShot.slowMoRate }, `tick ${tick}`);
  }
  assert.deepEqual(cadence.update(fight(koTick + koShot.slowMoTicks, { phase: "finish", koTick, koShot })), { beat: "ceremony", rate: 0.75 });
  // Every KO shot plays its own beat length.
  for (const shot of DEMO_KO_SHOTS) {
    const fresh = createDemoCadence();
    let koTicks = 0;
    for (let tick = 0; tick < 80; tick += 1) if (fresh.update(fight(tick, { phase: "finish", koTick: 0, koShot: shot })).beat === "ko") koTicks += 1;
    assert.equal(koTicks, shot.slowMoTicks, shot.id);
  }
  // No shot drawn (a played match never draws one): the finish phase is ceremony tempo.
  assert.deepEqual(createDemoCadence().update(fight(5, { phase: "finish" })), { beat: "ceremony", rate: 0.75 });
  assert.equal(cadenceTagText("ko", 0.35), "SLOW-MO");
  assert.equal(cadenceTagText("neutral", 1), "1×");
  assert.equal(cadenceTagText("exchange", 0.75), "0.75×");
});

// --- the transport ----------------------------------------------------------

function runFrames(speed, cadenceAt, { frames = 900 } = {}) {
  const clock = new FixedStepClock();
  const dts = [];
  const ticks = [];
  let heldSeconds = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    speed.setCadence(cadenceAt(frame));
    const before = speed.heldSeconds;
    const result = clock.advance(speed.scale(1 / 60), (dt, tick) => { dts.push(dt); ticks.push(tick); });
    heldSeconds += speed.heldSeconds - before;
    void result;
  }
  return { dts, ticks, tick: clock.tick, heldSeconds };
}

test("the cadence rides the same scaler: same dt every tick, same tick stream, only the wall-clock spread changes", () => {
  const plain = runFrames(createDemoSpeed(), () => null);
  const driven = runFrames(createDemoSpeed(), (frame) => (frame < 300 ? 1 : frame < 600 ? 0.75 : 0.35));
  const step = plain.dts[0];
  assert.ok(driven.dts.every((dt) => dt === step), "the cadence never changes the step");
  assert.deepEqual(driven.ticks, driven.ticks.map((_, index) => driven.ticks[0] + index), "ticks in order, none skipped");
  assert.ok(driven.tick !== plain.tick, "the same 900 frames reached a different tick count — that is the whole feature");
  // 300 frames at 1x = 300 ticks, 300 at 0.75 = 225, 300 at 0.35 = 105 (±1 for the accumulator).
  assert.ok(Math.abs(driven.tick - 630) <= 1, `expected ~630 ticks, got ${driven.tick}`);
  assert.ok(Math.abs(plain.tick - 675) <= 1, `expected ~675 ticks at the 0.75 default, got ${plain.tick}`);
  // The prefix of the tick stream is identical whichever cadence spread it.
  assert.deepEqual(driven.dts.slice(0, 600), plain.dts.slice(0, 600));
});

test("setCadence: null releases, values are clamped to 1x, the operator's lock wins and survives further drives", () => {
  const speed = createDemoSpeed();
  assert.equal(speed.effectiveRate(), DEFAULT_DEMO_SPEED);
  assert.equal(speed.setCadence(1), 1);
  assert.equal(speed.effectiveRate(), 1);
  assert.equal(speed.setCadence(0.35), 0.35, "a beat rate is NOT snapped to the key ladder");
  assert.equal(speed.setCadence(3), 1);
  assert.equal(speed.setCadence(0), null);
  assert.equal(speed.setCadence("nope"), null);
  assert.equal(speed.setCadence(0.5), 0.5);
  assert.equal(speed.setCadence(null), null);
  assert.equal(speed.effectiveRate(), DEFAULT_DEMO_SPEED);
  speed.setCadence(0.35);
  assert.equal(speed.scale(1), 0.35);
  speed.lockCadence();
  assert.equal(speed.cadence, null);
  assert.equal(speed.setCadence(0.35), null, "locked: the director is ignored");
  assert.equal(speed.scale(1), DEFAULT_DEMO_SPEED);
  speed.setRate(0.25);
  speed.setCadence(1);
  assert.equal(speed.scale(1), 0.25, "the operator's rate drives");
  const snapshot = speed.snapshot();
  assert.equal(snapshot.cadenceLocked, true);
  assert.equal(snapshot.cadence, null);
  assert.equal(snapshot.effectiveRate, 0.25);
  speed.unlockCadence();
  assert.equal(speed.setCadence(1), 1);
  assert.equal(speed.snapshot().effectiveRate, 1);
  speed.setPaused(true);
  assert.equal(speed.scale(1), 0, "pause outranks the cadence");
});

test("the rate tag follows the cadence (1× · 0.75× · SLOW-MO) and the operator's rate once it is locked", () => {
  assert.deepEqual(demoSpeedTag({ rate: 0.75, cadence: 1, beat: "neutral" }), { text: "1×", tone: "live" });
  assert.deepEqual(demoSpeedTag({ rate: 0.75, cadence: 0.75, beat: "exchange" }), { text: "0.75×", tone: "slow" });
  assert.deepEqual(demoSpeedTag({ rate: 0.75, cadence: 0.35, beat: "ko" }), { text: "SLOW-MO", tone: "slowmo" });
  assert.deepEqual(demoSpeedTag({ rate: 0.75, cadence: null, beat: "ko" }), { text: "0.75×", tone: "slow" }, "no cadence (qa clock, locked): the rate, whatever the beat");
  assert.deepEqual(demoSpeedTag({ rate: 0.25, cadence: null, beat: "neutral" }), { text: "0.25×", tone: "slow" });
  assert.deepEqual(demoSpeedTag({ rate: 0.75, cadence: 0.35, beat: "ko", held: true }), { text: "HELD", tone: "held" });
  assert.deepEqual(demoSpeedTag({ rate: 0.75, cadence: 0.35, beat: "ko", paused: true }), { text: "PAUSED", tone: "paused" });
  assert.deepEqual(demoSpeedTag({ rate: 0.75 }), { text: "0.75×", tone: "slow" }, "the pre-5.4 call shape is unchanged");
});

// --- the game.js and renderer pins ------------------------------------------

test("game.js gates every camera/cadence call site on the demo, and the played match keeps its identity contract", async () => {
  const game = await readFile(join(gameRoot, "game.js"), "utf8");
  assert.match(game, /function demoCameraActive\(\)\s*\{\s*return state\.mode === "demo" && demoSession\.active && Boolean\(demoSession\.camera\);/);
  // The two latches draw a shot only in a demo.
  const koLatch = game.slice(game.indexOf("function latchKoCameraPunch()"), game.indexOf("function demoCameraActive()"));
  assert.ok(koLatch.includes("if (demoCameraActive()) {"), "the KO shot is demo-gated");
  assert.ok(koLatch.includes("magnitude: 0.08"), "the played game's 0.08 KO punch is untouched");
  const superLatch = game.slice(game.indexOf("function latchSuperPresentation(fighter)"), game.indexOf("function latchFatalImpactPresentation"));
  assert.ok(superLatch.includes("if (demoCameraActive()) {"), "the super shot is demo-gated");
  // The pose, the bars, the smear and the transport.
  assert.match(game, /const demoPose = demoCameraPose\(dt, phase, finisher, reduced\);/);
  assert.match(game, /function demoCameraPose\(dt, phase, finisher, reduced = false\)\s*\{\s*if \(!demoCameraActive\(\)\) return null;/);
  assert.match(game, /if \(finisher \|\| phase === "intro" \|\| reduced\) \{\s*demoSession\.shot = null;/, "reduced motion keeps the tempo, never the moves");
  assert.match(game, /const demoKoBars = phase === "finish" && !finisher && demoSession\.koTick >= 0 && demoCameraActive\(\);/);
  assert.match(game, /\(demoCameraActive\(\) && demoSession\.cadenceBeat === "ko"\)/);
  assert.match(game, /demoSpeed\.setCadence\(speedScaled && demoCameraActive\(\) \? demoSession\.cadenceRate : null\);/);
  assert.match(game, /const simSeconds = speedScaled \? demoSpeed\.scale\(elapsed\) : elapsed;/, "the 3.2 scaler line is the only clock write");
  // "Identity by default" for a played match is still the comment AND the code.
  assert.match(game, /Identity by default: normal fight play NEVER gets a\s*\n\s*\/\/ tracking pose/);
  // The operator's keys and the explicit qa rate lock the cadence; a demo start unlocks only at the couch default.
  const keys = game.slice(game.indexOf("function handleDemoSpeedKey(event)"), game.indexOf("function handleDemoSpeedKey(event)") + 2500);
  assert.ok(keys.includes("demoSpeed.lockCadence();"));
  assert.match(game, /demoSpeed\.setRate\(rate\);\s*demoSpeed\.lockCadence\(\);/);
  assert.match(game, /if \(demoSpeed\.rate === DEFAULT_DEMO_SPEED\) demoSpeed\.unlockCadence\(\);\s*else demoSpeed\.lockCadence\(\);/);
  // Session teardown releases everything.
  const end = game.slice(game.indexOf("function endDemoSession()"), game.indexOf("function exitDemo()"));
  for (const line of ["demoSession.camera = null;", "demoSession.cadence = null;", "demoSession.shot = null;", "demoSpeed.setCadence(null);", "cinematicCamera.demoShot = null;"]) {
    assert.ok(end.includes(line), line);
  }
  // A seeded demo rewinds the tick domain: the render-side per-tick dedupe
  // latches rewind with it, or a replayed super on a repeated tick is skipped.
  assert.match(game, /function resetPresentationTickLatches\(\)\s*\{\s*cameraKoTick = -1;/);
  const rewind = game.slice(game.indexOf("if (seed !== null) {", game.indexOf("function startDemo(")), game.indexOf("const pending = seed === null"));
  assert.ok(rewind.includes("resetPresentationTickLatches();"), "the seeded rewind resets the latches");
  for (const latch of ["superCutInTick", "distortionRingTick", "crowdSwellTick", "cameraRecoilTick", "cameraCounterTick"]) {
    assert.match(game, new RegExp(`function resetPresentationTickLatches\\(\\)[^}]*${latch} = -1;`), latch);
  }
  // The cadence view reads snapshotted sim fields only — no wall clock.
  const view = game.slice(game.indexOf("function demoCadenceView()"), game.indexOf("function demoCameraPose("));
  assert.ok(!view.includes("performance.now") && !view.includes("Date.now"), "tick-keyed, never wall-clock");
});

test("the CINEMA 3D camera lifts its demo cap only while a demo shot is live", async () => {
  const camera = await readFile(join(gameRoot, "renderer", "three", "camera.mjs"), "utf8");
  assert.match(camera, /const demoCap = cinematic\?\.demoShot \? DEMO_3D_SHOT_ZOOM_CAP : 1\.12;/);
  assert.match(camera, /const zoom = Math\.min\(demo \? demoCap : Infinity, Math\.max\(1, cinematic\?\.zoom \?\? 1\)\);/);
  assert.match(camera, /import \{ DEMO_3D_SHOT_ZOOM_CAP \} from "\.\.\/\.\.\/engine\/demo-camera\.mjs";/);
  // The 4.3 demo framing (wide margin, fill floor) is untouched.
  assert.match(camera, /const margin = demo \? 0\.78 : FRAME_MARGIN;/);
  assert.match(camera, /\(demo \? 1\.1 : MIN_FILL\)/);
  // The cap arithmetic: a 1.32 super pose is a real fov push in the demo.
  const fov = (zoom, cap) => 30 / Math.min(cap, Math.max(1, zoom));
  assert.ok(fov(1.32, 1.12) > fov(1.32, DEMO_3D_SHOT_ZOOM_CAP) + 4, "the lifted cap narrows the fov by more than 4 degrees");
  assert.equal(fov(1.32, Infinity), fov(1.32, DEMO_3D_SHOT_ZOOM_CAP), "a played match's uncapped punch-in is unchanged");
});

test("the tag's slowmo tone is styled and the bug's markup is unchanged", async () => {
  const css = await readFile(join(gameRoot, "styles.css"), "utf8");
  assert.ok(css.includes('.demo-hud-speed[data-tone="slowmo"]'), "SLOW-MO has its own tone");
  const html = await readFile(join(gameRoot, "index.html"), "utf8");
  assert.ok(html.includes('<i id="demoHudSpeed" class="demo-hud-speed" data-tone="slow">0.75×</i>'));
});
