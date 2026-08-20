import assert from "node:assert/strict";
import {
  DEFAULT_KEY_MAPS,
  DEFAULT_PAD_MAP,
  applyControlStyle,
  normalizeKeyMaps,
  normalizePadMap,
  remapKeyBinding,
  remapPadBinding,
} from "../engine/controls.mjs";
import { createTrainingState, trainingDummyInput, trainingSnapshot } from "../engine/training.mjs";

function testKeyboardRemapping() {
  const maps = normalizeKeyMaps(null);
  assert.deepEqual(maps, DEFAULT_KEY_MAPS);
  const remapped = remapKeyBinding(maps, 0, "light", "KeyK");
  assert.equal(remapped[0].light, "KeyK");
  assert.equal(remapped[0].heavy, "KeyJ", "conflicting bindings should swap rather than duplicate");
  assert.equal(remapped[1].light, DEFAULT_KEY_MAPS[1].light);
}

function testPadRemapping() {
  const pad = normalizePadMap(null);
  assert.deepEqual(pad, DEFAULT_PAD_MAP);
  const remapped = remapPadBinding(pad, "light", 3);
  assert.equal(remapped.light, 3);
  assert.equal(remapped.heavy, 2);
}

function testClassicAndModernInputs() {
  const classic = applyControlStyle({ right: true, special: true }, "classic", 1);
  assert.equal(classic.special, true);
  assert.equal(classic.commandSpecial, undefined);
  const forwardSpecial = applyControlStyle({ right: true, special: true }, "modern", 1);
  assert.equal(forwardSpecial.special, false);
  assert.equal(forwardSpecial.commandSpecial, true);
  const backSpecial = applyControlStyle({ right: true, special: true }, "modern", -1);
  assert.equal(backSpecial.backSpecial, true);
  const launcher = applyControlStyle({ down: true, heavy: true }, "modern", 1);
  assert.equal(launcher.heavy, false);
  assert.equal(launcher.launcher, true);
}

function testTrainingDummy() {
  const training = createTrainingState();
  assert.equal(training.infiniteGrit, true);
  assert.deepEqual(trainingDummyInput(training, 1), {
    left: false, right: false, down: false, guard: false, jump: false,
    light: false, heavy: false, special: false, enhanced: false, throw: false,
    super: false, final: false,
  });
  training.dummyMode = "guard";
  assert.equal(trainingDummyInput(training, 2, { attackLevel: "low" }).down, true);
  training.dummyMode = "jump";
  assert.equal(trainingDummyInput(training, 90).jump, true);
  training.dummyMode = "cpu";
  assert.equal(trainingDummyInput(training, 90), null);
  assert.equal(trainingSnapshot(training).dummyMode, "cpu");
}

testKeyboardRemapping();
testPadRemapping();
testClassicAndModernInputs();
testTrainingDummy();

console.log("Final Blow controls and training tests passed");
