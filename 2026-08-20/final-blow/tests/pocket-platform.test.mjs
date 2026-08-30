import assert from "node:assert/strict";
import test from "node:test";
import { TOUCH_PAD_RULES, touchPadTokens } from "../engine/controls.mjs";
import {
  GOVERNOR_RULES,
  GOVERNOR_TIERS,
  createPerformanceGovernor,
  HAPTIC_KINDS,
  hapticPatternFor,
} from "../engine/polish.mjs";

// ---------------------------------------------------------------------------
// R1.9 wave 15 — thumb-slide sector math for the 3x3 touch movement pad.
// ---------------------------------------------------------------------------
test("touch pad sector math resolves thumb positions to direction tokens", () => {
  const radius = 90;
  // Resting over the centre cell is neutral.
  assert.deepEqual(touchPadTokens(0, 0, radius), []);
  assert.deepEqual(touchPadTokens(radius * TOUCH_PAD_RULES.deadZoneRatio * 0.9, 0, radius), []);
  // The eight cardinals/diagonals (screen coordinates: +y is down).
  assert.deepEqual(touchPadTokens(radius, 0, radius), ["right"]);
  assert.deepEqual(touchPadTokens(-radius, 0, radius), ["left"]);
  assert.deepEqual(touchPadTokens(0, radius, radius), ["down"]);
  assert.deepEqual(touchPadTokens(0, -radius, radius), ["up"]);
  assert.deepEqual(touchPadTokens(radius, radius, radius), ["down", "right"]);
  assert.deepEqual(touchPadTokens(-radius, radius, radius), ["down", "left"]);
  assert.deepEqual(touchPadTokens(radius, -radius, radius), ["up", "right"]);
  assert.deepEqual(touchPadTokens(-radius, -radius, radius), ["up", "left"]);
  // Sector boundaries: 45-degree sectors centred on each direction.
  assert.deepEqual(touchPadTokens(radius, radius * Math.tan(Math.PI / 9), radius), ["right"], "20 degrees stays in the right sector");
  assert.deepEqual(touchPadTokens(radius, radius * Math.tan(Math.PI / 6) * 1.01, radius), ["down", "right"], "past 22.5 degrees rolls into down-forward");
  // Sliding beyond the pad edge still reads by angle (stick-gate emulation).
  assert.deepEqual(touchPadTokens(radius * 3, radius * 3, radius), ["down", "right"]);
  // Garbage in, neutral out.
  assert.deepEqual(touchPadTokens(Number.NaN, 4, radius), []);
  assert.deepEqual(touchPadTokens(4, 4, 0), []);
});

test("a thumb slide across the pad produces the QCF direction sequence", () => {
  const radius = 80;
  const slide = [
    [0, radius * 0.8],              // down
    [radius * 0.6, radius * 0.6],   // down-forward
    [radius * 0.85, 0],             // forward
  ].map(([dx, dy]) => touchPadTokens(dx, dy, radius));
  assert.deepEqual(slide, [["down"], ["down", "right"], ["right"]]);
  // And the reverse roll reads as the mirrored quarter circle.
  const mirrored = [
    [0, radius * 0.8],
    [-radius * 0.6, radius * 0.6],
    [-radius * 0.85, 0],
  ].map(([dx, dy]) => touchPadTokens(dx, dy, radius));
  assert.deepEqual(mirrored, [["down"], ["down", "left"], ["left"]]);
});

// ---------------------------------------------------------------------------
// R1.9 wave 15 — adaptive performance governor hysteresis machine.
// ---------------------------------------------------------------------------
test("governor steps down after a sustained window of budget misses", () => {
  const governor = createPerformanceGovernor({ profileId: "high", baselineId: "high" });
  assert.deepEqual(GOVERNOR_TIERS, ["battery", "balanced", "high"]);
  let firstChange = null;
  for (let frame = 0; frame < GOVERNOR_RULES.windowFrames; frame += 1) {
    firstChange = governor.observe(25) || firstChange;
  }
  assert.deepEqual(firstChange, { action: "down", from: "high", to: "balanced" });
  assert.equal(governor.profile(), "balanced");
  // Hysteresis: the cooldown outlasts the next full window, so sustained
  // misses cannot double-step immediately.
  for (let frame = 0; frame < GOVERNOR_RULES.windowFrames; frame += 1) governor.observe(25);
  assert.equal(governor.profile(), "balanced", "cooldown must hold the second step back");
  // Keep missing long enough and it lands on battery — and stays there.
  for (let frame = 0; frame < GOVERNOR_RULES.cooldownFrames + GOVERNOR_RULES.windowFrames; frame += 1) governor.observe(25);
  assert.equal(governor.profile(), "battery");
  for (let frame = 0; frame < GOVERNOR_RULES.windowFrames * 3; frame += 1) governor.observe(25);
  assert.equal(governor.profile(), "battery", "battery is the floor");
  assert.equal(governor.steps, 2);
});

test("governor recovers cautiously and never climbs past its baseline", () => {
  const governor = createPerformanceGovernor({ profileId: "balanced", baselineId: "high" });
  let upChange = null;
  let frames = 0;
  while (!upChange && frames < GOVERNOR_RULES.recoveryFrames * 2) {
    upChange = governor.observe(10);
    frames += 1;
  }
  assert.deepEqual(upChange, { action: "up", from: "balanced", to: "high" });
  assert.ok(frames >= GOVERNOR_RULES.recoveryFrames, `recovery took ${frames} frames; must be >= ${GOVERNOR_RULES.recoveryFrames} (~30s)`);
  // Already at baseline: more headroom never over-promotes.
  for (let frame = 0; frame < GOVERNOR_RULES.recoveryFrames + 10; frame += 1) governor.observe(10);
  assert.equal(governor.profile(), "high");
  // A single laggy frame resets the recovery streak.
  const jittery = createPerformanceGovernor({ profileId: "balanced", baselineId: "high" });
  for (let frame = 0; frame < GOVERNOR_RULES.recoveryFrames * 2; frame += 1) {
    const spike = frame % (GOVERNOR_RULES.recoveryFrames - 5) === 0;
    assert.equal(jittery.observe(spike ? 20 : 10), null);
  }
  assert.equal(jittery.profile(), "balanced", "interrupted headroom must not recover");
});

test("governor ignores tab-switch stalls instead of reading them as thermal misses", () => {
  const governor = createPerformanceGovernor({ profileId: "high", baselineId: "high" });
  for (let frame = 0; frame < GOVERNOR_RULES.windowFrames * 4; frame += 1) {
    assert.equal(governor.observe(400), null);
  }
  assert.equal(governor.profile(), "high");
  assert.equal(governor.steps, 0);
  assert.equal(governor.observe(Number.NaN), null);
  assert.equal(governor.observe(-4), null);
});

// ---------------------------------------------------------------------------
// R1.9 wave 15 — combat haptic pattern selection.
// ---------------------------------------------------------------------------
test("haptic patterns scale with the event and stay inside actuator limits", () => {
  const light = hapticPatternFor("light", { damage: 4 });
  const heavy = hapticPatternFor("heavy", { damage: 14 });
  const ko = hapticPatternFor("ko");
  const block = hapticPatternFor("special", { blocked: true });
  // Tier ordering: KO slams hardest, blocks are a tick.
  assert.ok(ko.rumble.strongMagnitude > heavy.rumble.strongMagnitude);
  assert.ok(heavy.rumble.strongMagnitude > light.rumble.strongMagnitude);
  assert.ok(block.rumble.strongMagnitude < light.rumble.strongMagnitude);
  assert.equal(block.kind, "block", "a blocked hit always feels like a block");
  assert.ok(block.vibrate[0] <= light.vibrate[0]);
  // Damage scales the strike pulse monotonically.
  const weakHit = hapticPatternFor("heavy", { damage: 0 });
  const strongHit = hapticPatternFor("heavy", { damage: 28 });
  assert.ok(strongHit.vibrate[0] > weakHit.vibrate[0]);
  assert.ok(strongHit.rumble.strongMagnitude > weakHit.rumble.strongMagnitude);
  const counterHit = hapticPatternFor("heavy", { damage: 28, counter: true });
  assert.ok(counterHit.rumble.strongMagnitude >= strongHit.rumble.strongMagnitude);
  // Signature shapes: throws/wall-splats double-pulse, dizzy flutters,
  // the fatality heartbeat is one lub-dub.
  assert.equal(hapticPatternFor("throw").vibrate.length, 3);
  assert.equal(hapticPatternFor("wallSplat").vibrate.length, 3);
  assert.ok(hapticPatternFor("dizzy").vibrate.length >= 5);
  assert.equal(hapticPatternFor("fatalityHeartbeat").vibrate.length, 3);
  assert.ok(hapticPatternFor("fatalityHeartbeat").rumble.strongMagnitude >= 0.8);
  // Unknown kinds fall back to a light tap; every pattern respects limits.
  assert.equal(hapticPatternFor("mystery").kind, "light");
  for (const kind of HAPTIC_KINDS) {
    const pattern = hapticPatternFor(kind, { damage: 28, counter: true });
    assert.ok(pattern.rumble.strongMagnitude <= 1);
    assert.ok(pattern.rumble.weakMagnitude <= 1);
    assert.ok(pattern.rumble.duration <= 250);
    assert.ok(pattern.vibrate.every((ms) => Number.isInteger(ms) && ms >= 0 && ms <= 250));
  }
});
