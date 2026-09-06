import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CROWD_REACTION,
  createCrowdKoHold,
  crowdDrawReaction,
  crowdKoHoldAge,
  crowdKoHoldLive,
  crowdReactionDefaults,
  decayCrowdReaction,
  resetCrowdReaction,
  stirCrowdReaction,
  updateCrowdKoHoldLatch,
} from "../engine/crowd-reaction.mjs";
import { AMBIENT_STIR_THRESHOLD, AMBIENT_BIG_THRESHOLD } from "../engine/ambient.mjs";
import { CROWD_KO_HOLD, crowdKoHoldReaction } from "../engine/crowd-voice.mjs";

// v5.3 SPECTACLE (sweep item #52) — the crowd's reaction machine. Four rules
// that used to be four places in game.js (stir, decay, reset, KO hold) with
// nothing but regexes over the source between them and a silent retune.

const testDir = dirname(fileURLToPath(import.meta.url));
const gameSource = readFileSync(join(testDir, "..", "game.js"), "utf8");

function testDefaults() {
  assert.deepEqual(crowdReactionDefaults(), {
    crowdReaction: 0, crowdStirSide: -1, crowdSplatX: 0, crowdSplatTick: -1e9,
  });
  // The FIELD NAMES are the contract: the 2D crowd draw, the CINEMA 3D
  // billboards, the crowd audio bus, the QA snapshot and the browser smoke
  // probe all read them off `state` by these names.
  for (const field of Object.keys(crowdReactionDefaults())) {
    assert.ok(gameSource.includes(`state.${field}`), `game.js must still read state.${field}`);
  }
  assert.equal(CROWD_REACTION.authorless, -1);
  // The splat tick starts far enough in the past that no flinch window can be
  // open on the first tick of a round.
  assert.ok(crowdReactionDefaults().crowdSplatTick < -CROWD_KO_HOLD.holdTicks * 1000);
}

function testStir() {
  const obs = crowdReactionDefaults();
  // An ordinary hit: the reaction rises, nobody is named, no pulse, no swell.
  assert.deepEqual(stirCrowdReaction(obs, 0.25), { pulseKind: null, swell: false });
  assert.equal(obs.crowdReaction, 0.25);
  assert.equal(obs.crowdStirSide, -1);
  // A stir BY somebody names its author, and it sticks.
  stirCrowdReaction(obs, 0.25, { side: 1 });
  assert.equal(obs.crowdStirSide, 1);
  stirCrowdReaction(obs, 0.25);
  assert.equal(obs.crowdStirSide, 1, "an authorless stir does not clear a named one");
  // The ceiling: the KO stir is 1.4 and nothing may out-shout it.
  for (let index = 0; index < 20; index += 1) stirCrowdReaction(obs, 1);
  assert.equal(obs.crowdReaction, CROWD_REACTION.ceiling);
  assert.equal(CROWD_REACTION.ceiling, 1.4);
  // The splat mark is recorded only when one is given, and it carries the tick.
  const before = obs.crowdSplatTick;
  stirCrowdReaction(obs, 1, { tick: 900 });
  assert.equal(obs.crowdSplatTick, before, "no splat, no mark");
  stirCrowdReaction(obs, 1, { splatX: 412, tick: 900 });
  assert.deepEqual([obs.crowdSplatX, obs.crowdSplatTick], [412, 900]);
  // A splat at x = 0 is still a splat (the null check, not a falsy check).
  stirCrowdReaction(obs, 1, { splatX: 0, tick: 901 });
  assert.deepEqual([obs.crowdSplatX, obs.crowdSplatTick], [0, 901]);
  // Side 0 is a real side, not a missing one.
  const zero = crowdReactionDefaults();
  stirCrowdReaction(zero, 0.25, { side: 0 });
  assert.equal(zero.crowdStirSide, 0);
}

function testStirThresholds() {
  // The ambient pulse and the crowd swell are two different thresholds, and
  // the stir reports both rather than deciding either.
  const fresh = () => crowdReactionDefaults();
  assert.equal(stirCrowdReaction(fresh(), AMBIENT_STIR_THRESHOLD - 0.01).pulseKind, null);
  assert.equal(stirCrowdReaction(fresh(), AMBIENT_STIR_THRESHOLD).pulseKind, "splat");
  assert.equal(stirCrowdReaction(fresh(), AMBIENT_BIG_THRESHOLD).pulseKind, "big");
  assert.equal(stirCrowdReaction(fresh(), 1.4).pulseKind, "big", "the KO stir is a big pulse");
  assert.equal(stirCrowdReaction(fresh(), CROWD_REACTION.swellThreshold - 0.01).swell, false);
  assert.equal(stirCrowdReaction(fresh(), CROWD_REACTION.swellThreshold).swell, true);
  // The swell latches BELOW the ambient threshold: a mid-sized hit is heard
  // before the floodlights answer it.
  assert.ok(CROWD_REACTION.swellThreshold < AMBIENT_STIR_THRESHOLD);
  // game.js turns each answer into its one side effect and nothing else.
  assert.match(gameSource, /const \{ pulseKind, swell \} = stirCrowdReaction\(state, amount, \{ side, splatX, tick: state\.simulationTick \}\);\s*\n\s*if \(pulseKind\) pulseAmbient\(pulseKind, amount\);/);
  assert.match(gameSource, /if \(swell\) latchCrowdSwell\(amount, kind\);/);
}

function testDecay() {
  const obs = crowdReactionDefaults();
  stirCrowdReaction(obs, 1.4, { side: 0 });
  let ticks = 0;
  while (obs.crowdReaction > 0) {
    decayCrowdReaction(obs);
    ticks += 1;
    assert.ok(ticks < 500, "the decay must terminate");
  }
  // 1.4 at 0.016 a tick: 88 ticks, 1.47 s — long enough that a combo's hits
  // stack into one reaction, short enough that the room is back on its routes
  // before the next exchange.
  assert.equal(ticks, 88);
  assert.equal(CROWD_REACTION.decayPerTick, 0.016);
  // Once the room has settled the AUTHOR goes too, so the next authorless
  // stir cannot inherit the last hit's side.
  assert.equal(obs.crowdStirSide, -1);
  // It floors at 0 rather than going negative (the bed divides by 1.4).
  decayCrowdReaction(obs);
  assert.equal(obs.crowdReaction, 0);
  // The author survives while the room is still up.
  const live = crowdReactionDefaults();
  stirCrowdReaction(live, 1.4, { side: 1 });
  decayCrowdReaction(live);
  assert.equal(live.crowdStirSide, 1);
}

function testReset() {
  const obs = crowdReactionDefaults();
  stirCrowdReaction(obs, 1.4, { side: 1, splatX: 300, tick: 40 });
  resetCrowdReaction(obs);
  assert.deepEqual(obs, crowdReactionDefaults());
  // A round reset must not leave the previous round's splat window open —
  // and (the one deliberate change of the 5.3 extraction) not the previous
  // round's splat POINT either. game.js's reset cleared three of the four.
  assert.equal(obs.crowdSplatTick, -1e9);
  assert.equal(obs.crowdSplatX, 0);
}

function testHoldLatch() {
  const hold = createCrowdKoHold();
  assert.equal(crowdKoHoldAge(hold, 100), -1);
  // Not the fight screen, not roundover: nothing latches.
  assert.equal(crowdKoHoldLive({ screen: "select", phase: "roundover" }), false);
  assert.equal(crowdKoHoldLive({ screen: "fight", phase: "fight" }), false);
  assert.equal(crowdKoHoldLive({ screen: "fight", phase: "roundover" }), true);
  // A fatality's PRE-KILL cinematic keeps the room hushed; the kill releases it.
  assert.equal(crowdKoHoldLive({ screen: "fight", phase: "roundover", finisher: { slowMotionHits: 0 } }), false);
  assert.equal(crowdKoHoldLive({ screen: "fight", phase: "roundover", finisher: { slowMotionHits: 2 } }), true);
  // Latching is IDEMPOTENT — every consumer pokes it, several times a frame.
  updateCrowdKoHoldLatch(hold, true, 500);
  updateCrowdKoHoldLatch(hold, true, 501);
  updateCrowdKoHoldLatch(hold, true, 502);
  assert.equal(hold.startTick, 500);
  assert.equal(crowdKoHoldAge(hold, 502), 2);
  // Releasing clears the cheer flag so the next KO gets its own cheer.
  hold.cheerFired = true;
  updateCrowdKoHoldLatch(hold, false, 600);
  assert.deepEqual(hold, createCrowdKoHold());
  assert.equal(crowdKoHoldAge(hold, 600), -1);
  // game.js supplies the two facts only it has, and nothing else.
  assert.match(gameSource, /function updateCrowdKoHoldLatch\(\) \{\s*\n\s*latchCrowdKoHold\(crowdKoHold, crowdKoHoldLive\(state\), state\.simulationTick\);\s*\n\}/);
  assert.match(gameSource, /function crowdKoHoldAge\(\) \{\s*\n\s*return koHoldAge\(crowdKoHold, state\.simulationTick\);\s*\n\}/);
}

function testDrawReaction() {
  // Not latched: the drawn reaction IS the decaying stir.
  assert.equal(crowdDrawReaction(0.4, -1), 0.4);
  assert.equal(crowdDrawReaction(0, -1), 0);
  // Latched: the hold curve takes over, and it does not dip below the stir
  // that caused it on the frame it latches.
  assert.equal(crowdDrawReaction(1.4, 0), 1.4, "the KO stir out-ranks the hold's floor");
  assert.equal(crowdDrawReaction(0, 0), CROWD_KO_HOLD.floor);
  assert.equal(crowdDrawReaction(0, CROWD_KO_HOLD.rampTicks), CROWD_KO_HOLD.peak);
  // Deep into the hold the stir has long since decayed to nothing and the
  // curve is the only thing keeping the room up — which is the whole of the
  // 5.1 KO moment (measured before it: 2.5 ticks of cheer in a 294-tick hold).
  for (const age of [40, 150, 293]) {
    assert.equal(crowdDrawReaction(0, age), crowdKoHoldReaction(age));
    assert.equal(crowdDrawReaction(0, age), CROWD_KO_HOLD.peak);
  }
  assert.match(gameSource, /function crowdDrawReaction\(\) \{\s*\n\s*return crowdHoldReaction\(state\.crowdReaction, crowdKoHoldAge\(\)\);\s*\n\}/);
}

test("CR-A the four fields, their defaults and the names game.js reads them by", testDefaults);
test("CR-B a stir raises the room, names its author and marks a splat", testStir);
test("CR-C the ambient pulse and the crowd swell are two thresholds, reported not decided", testStirThresholds);
test("CR-D the decay is 88 ticks and takes the author with it", testDecay);
test("CR-E a round reset closes the splat window", testReset);
test("CR-F the KO hold latch is idempotent and hushed through a pre-kill cinematic", testHoldLatch);
test("CR-G the drawn reaction is the hold curve while it is latched, the stir otherwise", testDrawReaction);
