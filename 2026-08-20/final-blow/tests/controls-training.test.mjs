import assert from "node:assert/strict";
import {
  ATTACK_BUTTONS,
  BUTTON_NAMES,
  DEFAULT_KEY_MAPS,
  DEFAULT_PAD_MAP,
  REMAPPABLE_ACTIONS,
  applyControlStyle,
  buttonLimb,
  buttonStrength,
  detectPadLabelSet,
  normalizeKeyMaps,
  normalizePadMap,
  padButtonLabel,
  remapKeyBinding,
  remapPadBinding,
  resolveFourButtonInput,
  CONTROL_STYLE_COMMANDS,
  commandLabel,
  styleCopy,
} from "../engine/controls.mjs";
import { createTrainingState, trainingDummyInput, trainingSnapshot } from "../engine/training.mjs";

function testKeyboardRemapping() {
  const maps = normalizeKeyMaps(null);
  assert.deepEqual(maps, DEFAULT_KEY_MAPS);
  const remapped = remapKeyBinding(maps, 0, "lp", "KeyK");
  assert.equal(remapped[0].lp, "KeyK");
  assert.equal(remapped[0].hp, "KeyJ", "conflicting bindings should swap rather than duplicate");
  assert.equal(remapped[1].lp, DEFAULT_KEY_MAPS[1].lp);
}

function testFourButtonBindings() {
  // Only the directional control and the four combat buttons are bindable.
  assert.deepEqual([...REMAPPABLE_ACTIONS], ["left", "right", "up", "down", "lp", "hp", "lk", "hk"]);
  for (const legacy of ["guard", "light", "heavy", "special", "final", "jump"]) {
    assert.ok(!REMAPPABLE_ACTIONS.includes(legacy), `${legacy} must not be a bindable control any more`);
    assert.ok(!(legacy in DEFAULT_PAD_MAP), `${legacy} must not have a pad button`);
  }
  // XInput face buttons: X = LP, Y = HP, A = LK, B = HK.
  assert.deepEqual({ ...DEFAULT_PAD_MAP }, { lp: 2, hp: 3, lk: 0, hk: 1 });
  assert.equal(padButtonLabel(DEFAULT_PAD_MAP.lp, "xinput"), "X");
  assert.equal(padButtonLabel(DEFAULT_PAD_MAP.lk, "xinput"), "A");
  assert.equal(padButtonLabel(DEFAULT_PAD_MAP.lp, "playstation"), "SQUARE");
  assert.equal(padButtonLabel(DEFAULT_PAD_MAP.lk, "nintendo"), "B");
  assert.equal(detectPadLabelSet("DualSense Wireless Controller (STANDARD GAMEPAD)"), "playstation");
  assert.equal(detectPadLabelSet("Pro Controller (Nintendo)"), "nintendo");
  assert.equal(detectPadLabelSet("Xbox 360 Controller (XInput STANDARD GAMEPAD)"), "xinput");

  assert.deepEqual(ATTACK_BUTTONS.map(buttonStrength), ["light", "heavy", "light", "heavy"]);
  assert.deepEqual(ATTACK_BUTTONS.map(buttonLimb), ["punch", "punch", "kick", "kick"]);
  assert.deepEqual(
    ATTACK_BUTTONS.map((button) => BUTTON_NAMES[button]),
    ["JAB", "HOOK", "LIGHT KICK", "ROUNDHOUSE"],
  );
}

function testPadRemapping() {
  const pad = normalizePadMap(null);
  assert.deepEqual(pad, DEFAULT_PAD_MAP);
  const remapped = remapPadBinding(pad, "lp", 3);
  assert.equal(remapped.lp, 3);
  assert.equal(remapped.hp, 2, "swapped rather than duplicated");
}

function testFourButtonResolution() {
  // Each button produces exactly one deliberate normal with the right limb.
  const lp = resolveFourButtonInput({ lp: true });
  assert.deepEqual(
    { light: lp.light, heavy: lp.heavy, limb: lp.limb, punch: lp.punch, kick: lp.kick },
    { light: true, heavy: false, limb: "punch", punch: true, kick: false },
  );
  const hk = resolveFourButtonInput({ hk: true });
  assert.deepEqual(
    { light: hk.light, heavy: hk.heavy, limb: hk.limb, punch: hk.punch, kick: hk.kick },
    { light: false, heavy: true, limb: "kick", punch: false, kick: true },
  );
  const lk = resolveFourButtonInput({ lk: true });
  assert.equal(lk.light, true);
  assert.equal(lk.limb, "kick");

  // Up on the directional control jumps; there is no jump button.
  assert.equal(resolveFourButtonInput({ up: true }).jump, true);
  // Nothing resolves a guard: blocking is directional only.
  assert.equal(resolveFourButtonInput({ left: true, lp: true }).guard, false);
}

function testChords() {
  // LP+HP is the enhanced (EX) chord once the Grit is there.
  const ex = resolveFourButtonInput({ hp: true, lpHeld: true }, { meter: 40 });
  assert.equal(ex.enhanced, true);
  assert.equal(ex.limb, "punch");
  assert.equal(ex.heavy, false, "the chord must not also fire the ordinary normal");
  const exKick = resolveFourButtonInput({ hk: true, lkHeld: true }, { meter: 40 });
  assert.equal(exKick.enhanced, true);
  assert.equal(exKick.limb, "kick");
  // Without Grit the chord falls through to a plain normal instead of eating it.
  const broke = resolveFourButtonInput({ hp: true, lpHeld: true }, { meter: 0 });
  assert.equal(broke.enhanced, false);
  assert.equal(broke.heavy, true);

  // HP+HK at full Grit is the super chord.
  const superChord = resolveFourButtonInput({ hp: true, hkHeld: true }, { meter: 100 });
  assert.equal(superChord.super, true);
  assert.equal(resolveFourButtonInput({ hp: true, hkHeld: true }, { meter: 99 }).super, false);
}

function testFinishingWindow() {
  // Only a fresh LP or LK finishes: LP picks A and LK picks B.
  const a = resolveFourButtonInput({ lp: true }, { finishing: true, finishArmed: true });
  assert.equal(a.final, true);
  assert.equal(a.finisherVariant, 0);
  const b = resolveFourButtonInput({ lk: true }, { finishing: true, finishArmed: true });
  assert.equal(b.final, true);
  assert.equal(b.finisherVariant, 1);
  for (const button of ["hp", "hk"]) {
    const blocked = resolveFourButtonInput({ [button]: true }, { finishing: true, finishArmed: true });
    assert.equal(blocked.final, false, `${button.toUpperCase()} must not execute a finisher`);
    assert.equal(blocked.heavy, false, "the finishing window swallows non-finisher attacks");
  }
  const chord = resolveFourButtonInput({ lp: true, lk: true }, { finishing: true, finishArmed: true });
  assert.equal(chord.final, false, "a multi-button chord must not execute a finisher");
  // A held button that never released cannot trigger the finisher.
  const held = resolveFourButtonInput({ lp: true }, { finishing: true, finishArmed: false });
  assert.equal(held.final, false);
  assert.equal(held.heavy, false, "a disarmed finishing window swallows the press entirely");
  // No press, no finisher.
  assert.equal(resolveFourButtonInput({}, { finishing: true, finishArmed: true }).final, false);
}

function testSimplifiedStyle() {
  // Classic requires the authored motions; the light chord stays a normal.
  const classic = resolveFourButtonInput({ lp: true, lkHeld: true }, { style: "classic" });
  assert.equal(classic.commandSpecial, undefined);
  assert.equal(classic.light, true);
  // Simplified style reaches the special from the light chord without a motion.
  const modern = resolveFourButtonInput({ lp: true, lkHeld: true }, { style: "modern", facing: 1 });
  assert.equal(modern.commandSpecial, true);
  const modernBack = resolveFourButtonInput({ lp: true, lkHeld: true, left: true }, { style: "modern", facing: 1 });
  assert.equal(modernBack.backSpecial, true);
  const modernDown = resolveFourButtonInput({ lp: true, lkHeld: true, down: true }, { style: "modern", facing: 1 });
  assert.equal(modernDown.special, true);
  // Saved preferences keep working through the legacy hook.
  assert.equal(applyControlStyle({ special: true, right: true }, "modern", 1).commandSpecial, true);
  assert.equal(applyControlStyle({ special: true, right: true }, "classic", 1).special, true);
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
testFourButtonBindings();
testPadRemapping();
testFourButtonResolution();
testChords();
testFinishingWindow();
testSimplifiedStyle();
testTrainingDummy();
testCommandLabels();

console.log("Final Blow four-button controls and training tests passed");

// 5.1 (sweep #29/#31): the command table must agree with the resolver — a
// label that promises LP&LK under MODERN or a lone HP under LEGEND has to
// actually produce the move it names.
function testCommandLabels() {
  assert.deepEqual(Object.keys(CONTROL_STYLE_COMMANDS).sort(), ["classic", "legend", "modern"]);
  // MODERN: the LP&LK chord (neutral) is the command special; away is the back
  // special; the base kick special and the launcher keep their motions.
  const modernChord = applyControlStyle(resolveFourButtonInput({ lp: true, lkHeld: true }, { style: "modern", facing: 1 }), "modern", 1);
  assert.equal(modernChord.commandSpecial, true);
  assert.equal(commandLabel("commandSpecial", "modern"), "LP&LK");
  const modernBack = applyControlStyle(resolveFourButtonInput({ lp: true, lkHeld: true, left: true }, { style: "modern", facing: 1 }), "modern", 1);
  assert.equal(modernBack.backSpecial, true);
  assert.equal(commandLabel("backSpecial", "modern"), "← + LP&LK");
  assert.equal(commandLabel("special", "modern"), commandLabel("special", "classic"), "modern keeps the kick-special motion");
  assert.equal(commandLabel("launcher", "modern"), commandLabel("launcher", "classic"), "modern keeps the launcher motion");
  // LEGEND: HP alone is the command special, ↓ + HP the launcher, ← + HP the
  // back special, HK the base special.
  const legend = (raw) => applyControlStyle(resolveFourButtonInput(raw, { style: "legend", facing: 1 }), "legend", 1);
  assert.equal(legend({ hp: true }).commandSpecial, true);
  assert.equal(commandLabel("commandSpecial", "legend"), "HP");
  assert.equal(legend({ hp: true, down: true }).launcher, true);
  assert.equal(commandLabel("launcher", "legend"), "↓ + HP");
  assert.equal(legend({ hp: true, left: true }).backSpecial, true);
  assert.equal(commandLabel("backSpecial", "legend"), "← + HP");
  assert.equal(legend({ hk: true }).special, true);
  assert.equal(legend({ hk: true }).limb, "kick");
  assert.equal(commandLabel("special", "legend"), "HK");
  // Style-free entries are identical in every style; unknown actions fall
  // back to the kit's authored string, then to the action name.
  for (const style of ["classic", "modern", "legend"]) {
    assert.equal(commandLabel("enhancedCommandSpecial", style), "↓ → + LP&HP");
    assert.equal(commandLabel("taunt", style), "↓ ↓ + LK&HK");
    assert.equal(commandLabel("throwObject", style), "↓ ← + KICK");
  }
  assert.equal(commandLabel("mystery", "classic", "KIT SAYS"), "KIT SAYS");
  assert.equal(commandLabel("mystery", "bogus-style"), "MYSTERY");
  assert.equal(styleCopy("LAND {commandSpecial} · {super}", "legend"), "LAND HP · HP AT FULL GRIT");
  assert.equal(styleCopy("no tokens", "modern"), "no tokens");
}
