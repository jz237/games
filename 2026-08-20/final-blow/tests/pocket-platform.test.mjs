import assert from "node:assert/strict";
import test from "node:test";
import { TOUCH_PAD_RULES, pruneFlickSamples, touchPadFlick, touchPadTokens } from "../engine/controls.mjs";
import {
  GOVERNOR_RULES,
  GOVERNOR_TIERS,
  createPerformanceGovernor,
  forgetGovernorMemory,
  governorMemoryKey,
  governorMemorySignature,
  HAPTIC_KINDS,
  hapticPatternFor,
  readGovernorMemory,
  writeGovernorMemory,
} from "../engine/polish.mjs";

// ---------------------------------------------------------------------------
// 5.x sweep #41 — flick-to-dash read over the pad's horizontal samples.
// ---------------------------------------------------------------------------
test("a fast sweep to the pad edge reads as a flick in that direction", () => {
  const radius = 75; // the 844x390 target's pad radius
  const travel = radius * TOUCH_PAD_RULES.flickDistanceRatio;
  // Centre to the edge in 60 ms: a flick right.
  assert.equal(touchPadFlick([{ t: 0, x: 0 }, { t: 30, x: radius * 0.3 }, { t: 60, x: radius * 0.9 }], radius), 1);
  // Mirrored: a flick left.
  assert.equal(touchPadFlick([{ t: 0, x: 0 }, { t: 60, x: -radius * 0.9 }], radius), -1);
  // Exactly the minimum travel, landing exactly at the landing line, counts.
  assert.equal(touchPadFlick([{ t: 0, x: -(travel - radius * TOUCH_PAD_RULES.flickLandRatio) }, { t: 90, x: radius * TOUCH_PAD_RULES.flickLandRatio }], radius), 1);
  // Too slow: the same travel over 140 ms is a walk, not a flick.
  assert.equal(touchPadFlick([{ t: 0, x: 0 }, { t: 140, x: radius * 0.9 }], radius), 0);
  // Too short: a wobble inside the sector never dashes.
  assert.equal(touchPadFlick([{ t: 0, x: radius * 0.3 }, { t: 40, x: radius * 0.7 }], radius), 0);
  // Fewer than two samples, or a bad radius, is no flick.
  assert.equal(touchPadFlick([{ t: 0, x: radius }], radius), 0);
  assert.equal(touchPadFlick([{ t: 0, x: 0 }, { t: 10, x: radius }], 0), 0);
  assert.equal(touchPadFlick(null, radius), 0);
});

test("the thumb's return swing to the centre is not a backdash", () => {
  const radius = 75;
  // Resting at the right edge, snapping back to rest — even overshooting the
  // centre by a cell (the dead zone is 0.17R) — lands short of 0.45R, so the
  // 0.8R+ of leftward travel is rejected by the landing test.
  assert.equal(touchPadFlick([{ t: 0, x: radius * 0.9 }, { t: 50, x: 0 }], radius), 0);
  assert.equal(touchPadFlick([{ t: 0, x: radius * 0.9 }, { t: 50, x: -radius * 0.25 }], radius), 0);
  // A deliberate right-then-hard-left across the whole pad IS a backdash.
  assert.equal(touchPadFlick([{ t: 0, x: radius * 0.9 }, { t: 60, x: -radius * 0.6 }], radius), -1);
  // Only samples inside the window are considered: an old sample at the far
  // side (1.2R of travel over 260 ms) must not stitch a slow drift into a
  // flick when the last 60 ms only covered 0.4R.
  const drift = [{ t: 0, x: -radius * 0.9 }, { t: 200, x: -radius * 0.1 }, { t: 260, x: radius * 0.3 }];
  assert.equal(touchPadFlick(drift, radius), 0);
  // pruneFlickSamples keeps the history bounded to the window.
  const samples = [{ t: 0, x: 0 }, { t: 90, x: 10 }, { t: 150, x: 20 }, { t: 200, x: 30 }];
  pruneFlickSamples(samples, 200);
  assert.deepEqual(samples.map((sample) => sample.t), [150, 200]);
});

// ---------------------------------------------------------------------------
// 5.x sweep #37 — governor memory: the landed tier survives an ineligible gap
// and the next session, keyed by build and fenced by a device signature.
// ---------------------------------------------------------------------------
function memoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
}

test("governor memory round-trips the landed tier and refuses foreign records", () => {
  const storage = memoryStorage();
  const key = governorMemoryKey("5.0");
  assert.equal(key, "final-blow-governor-tier:5.0");
  const signature = governorMemorySignature({ userAgent: "phone", hardwareConcurrency: 8, deviceMemory: 4, baselineId: "high" });
  assert.equal(readGovernorMemory(storage, key, signature), null, "nothing remembered yet");
  assert.equal(writeGovernorMemory(storage, key, { signature, profileId: "balanced", savedAt: 1 }), true);
  assert.deepEqual(readGovernorMemory(storage, key, signature), { profileId: "balanced", savedAt: 1 });
  // Different build: different key, nothing remembered.
  assert.equal(readGovernorMemory(storage, governorMemoryKey("5.1"), signature), null);
  // Different device signature (new phone, or a baseline change): refused.
  const otherSignature = governorMemorySignature({ userAgent: "phone", hardwareConcurrency: 4, deviceMemory: 4, baselineId: "balanced" });
  assert.equal(readGovernorMemory(storage, key, otherSignature), null);
  // Corrupt or invented tiers are refused, and never throw.
  storage.setItem(key, "{not json");
  assert.equal(readGovernorMemory(storage, key, signature), null);
  storage.setItem(key, JSON.stringify({ signature, profileId: "ultra" }));
  assert.equal(readGovernorMemory(storage, key, signature), null);
  assert.equal(writeGovernorMemory(storage, key, { signature, profileId: "ultra" }), false);
  // Missing or refusing storage is a quiet no-op.
  assert.equal(readGovernorMemory(null, key, signature), null);
  assert.equal(writeGovernorMemory({ setItem() { throw new Error("quota"); } }, key, { signature, profileId: "battery" }), false);
  forgetGovernorMemory(storage, key);
  assert.equal(readGovernorMemory(storage, key, signature), null);
  forgetGovernorMemory(null, key);
});

test("seeded tier survives an ineligible gap and never climbs past the static baseline", () => {
  const storage = memoryStorage();
  const key = governorMemoryKey("5.0");
  const signature = governorMemorySignature({ userAgent: "phone", hardwareConcurrency: 8, deviceMemory: 8, baselineId: "high" });
  // Fight 1 on a boundary phone: one window of misses lands balanced and the
  // game layer remembers it.
  const first = createPerformanceGovernor({ profileId: "high", baselineId: "high" });
  let change = null;
  for (let frame = 0; frame < GOVERNOR_RULES.windowFrames; frame += 1) change = first.observe(25) || change;
  assert.deepEqual(change, { action: "down", from: "high", to: "balanced" });
  writeGovernorMemory(storage, key, { signature, profileId: first.profile() });
  // The ineligible gap (result screen, character select): the game layer
  // retains the machine and simply stops feeding it, so its counters are
  // exactly where the fight left them — the cooldown resumes from the parked
  // value on the first fed frame of the next fight, it does not restart.
  assert.equal(first.cooldown, GOVERNOR_RULES.cooldownFrames);
  first.observe(16);
  assert.equal(first.cooldown, GOVERNOR_RULES.cooldownFrames - 1, "a retained machine resumes its cooldown where it parked");
  assert.equal(first.profile(), "balanced");
  // Next session: a fresh machine seeded from memory starts on balanced with
  // no window of misses at all, and a stable phone stays there.
  const remembered = readGovernorMemory(storage, key, signature);
  const second = createPerformanceGovernor({ profileId: remembered.profileId, baselineId: "high" });
  assert.equal(second.profile(), "balanced", "the next fight must start where the last one landed");
  for (let frame = 0; frame < GOVERNOR_RULES.windowFrames; frame += 1) assert.equal(second.observe(16), null);
  assert.equal(second.profile(), "balanced");
  assert.equal(second.steps, 0, "no step, so no COOLING toast");
  // Recovery still works from a seeded start and rewrites the memory.
  let up = null;
  for (let frame = 0; frame < GOVERNOR_RULES.recoveryFrames + 1 && !up; frame += 1) up = second.observe(10);
  assert.deepEqual(up, { action: "up", from: "balanced", to: "high" });
  writeGovernorMemory(storage, key, { signature, profileId: second.profile() });
  assert.equal(readGovernorMemory(storage, key, signature).profileId, "high");
  // A stale 'high' memory on a device whose static resolution now says
  // balanced is clamped at creation: memory never seeds above the baseline.
  const clamped = createPerformanceGovernor({ profileId: "high", baselineId: "balanced" });
  assert.equal(clamped.profile(), "balanced");
});

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
