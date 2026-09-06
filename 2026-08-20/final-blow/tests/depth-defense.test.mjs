import assert from "node:assert/strict";
import test from "node:test";

import {
  AIR_RECOVERY_RULES,
  ATTACK_LEVELS,
  DEFENSE_RULES,
  GUARD_RULES,
  PERFECT_GUARD_RULES,
  STUN_RULES,
  WAKEUP_RULES,
  canAirRecover,
  createCombatMove,
  createDepthFighterFields,
  guardGainForAttack,
  isPerfectGuard,
  resolveWakeOption,
} from "../engine/defense.mjs";
import {
  checksumState,
  parseRollbackState,
  serializeRollbackState,
} from "../engine/rollback.mjs";

// ---------------------------------------------------------------------------
// Release 1.7 DEPTH — guard gauge (GUARD CRUSH)
// ---------------------------------------------------------------------------

test("guard gauge mirrors the stun pattern: blocked-only pressure, decay, immunity", () => {
  // The rule shape, not frozen numbers: a real threshold, a real grace
  // window, decay that actually drains, a crush long enough to punish and an
  // immunity long enough that a crush can never chain into the next one.
  assert.ok(GUARD_RULES.threshold > 0);
  assert.ok(GUARD_RULES.decayGraceFrames > 0);
  assert.ok(GUARD_RULES.decayPerFrame > 0);
  assert.ok(GUARD_RULES.crushFrames >= 45 && GUARD_RULES.crushFrames <= 90, "a crush must be a real but bounded punish window");
  assert.ok(GUARD_RULES.immuneFrames > GUARD_RULES.crushFrames * 2, "immunity outlasts the crush so it cannot loop");

  const light = createCombatMove("light");
  const heavy = createCombatMove("heavy");
  const special = createCombatMove("special");
  const gains = ["light", "heavy", "special"].map((kind) => guardGainForAttack(createCombatMove(kind), { blocked: true }));
  assert.ok(gains.every((gain) => gain > 0), "every blocked strike pressures the gauge");
  assert.ok(guardGainForAttack(heavy, { blocked: true }) > guardGainForAttack(light, { blocked: true }), "heavies pressure harder than lights");
  assert.ok(guardGainForAttack(special, { blocked: true }) > guardGainForAttack(heavy, { blocked: true }), "specials pressure hardest");

  // Unblocked hits, throws and Perfect Guards add nothing.
  assert.equal(guardGainForAttack(heavy, { blocked: false }), 0);
  assert.equal(guardGainForAttack(createCombatMove("throw"), { blocked: true }), 0);
  assert.equal(guardGainForAttack(heavy, { blocked: true, perfect: true }), 0, "a just-defend absorbs all gauge pressure");
  assert.equal(guardGainForAttack(null, { blocked: true }), 0);

  // Multi-hit moves divide their gain exactly like stunGainForAttack, so a
  // single blocked super cannot crush on its own.
  const multi = { kind: "special", level: ATTACK_LEVELS.MID, maxHits: 4 };
  assert.equal(
    guardGainForAttack(multi, { blocked: true }),
    Number((GUARD_RULES.gain.special / 4).toFixed(3)),
  );
  assert.ok(
    guardGainForAttack(multi, { blocked: true }) * 4 <= GUARD_RULES.gain.special + 0.001,
    "a full multi-hit move never out-pressures its single-hit equivalent",
  );

  // Balance conservatism: crushing takes a genuinely sustained blockstring —
  // more blocked hits than the dizzy takes clean hits, for every attack kind.
  for (const kind of ["light", "heavy", "special"]) {
    const blockedHitsToCrush = Math.ceil(GUARD_RULES.threshold / GUARD_RULES.gain[kind]);
    const cleanHitsToDizzy = Math.ceil(STUN_RULES.threshold / STUN_RULES.gain[kind]);
    assert.ok(blockedHitsToCrush > cleanHitsToDizzy, `${kind}: crushing must be slower than dizzying`);
  }
});

// ---------------------------------------------------------------------------
// Release 1.7 DEPTH — wake-up options
// ---------------------------------------------------------------------------

test("wake-up options stay inside the knockdown contract", () => {
  // Direction mapping: Up quick-rises and wins ties, Down delays, nothing
  // else does anything.
  assert.equal(resolveWakeOption({ jump: true }), "quick");
  assert.equal(resolveWakeOption({ down: true }), "delay");
  assert.equal(resolveWakeOption({ jump: true, down: true }), "quick", "Up beats Down deterministically");
  assert.equal(resolveWakeOption({}), null);
  assert.equal(resolveWakeOption({ left: true, right: true, guard: true }), null);

  // The quick rise meaningfully shortens the down time but can never remove
  // the knockdown, and the delay meaningfully extends it without doubling it.
  assert.ok(WAKEUP_RULES.quickRiseFrames > 0);
  assert.ok(WAKEUP_RULES.quickRiseFrames < DEFENSE_RULES.knockdownFrames, "a quick rise can never skip the knockdown entirely");
  assert.ok(WAKEUP_RULES.delayFrames > 0);
  assert.ok(WAKEUP_RULES.delayFrames < DEFENSE_RULES.knockdownFrames, "a delay is a mix-up, not a second knockdown");

  // The quick-rise trade: a shorter reversal window that still exists.
  assert.ok(WAKEUP_RULES.quickRiseReversalPenaltyFrames > 0);
  assert.ok(
    DEFENSE_RULES.reversalWindowFrames - WAKEUP_RULES.quickRiseReversalPenaltyFrames >= 1,
    "a quick riser always keeps a real reversal window",
  );
});

// ---------------------------------------------------------------------------
// Release 1.7 DEPTH — air recovery (juggle tech)
// ---------------------------------------------------------------------------

test("air recovery gates on armed juggles, the hitstun window and a real press", () => {
  const juggled = (overrides = {}) => ({
    grounded: false,
    pendingKnockdown: true,
    airTechArmed: true,
    airHitstunFrames: AIR_RECOVERY_RULES.minimumHitstunFrames,
    ...overrides,
  });
  assert.equal(canAirRecover(juggled(), true), true);
  assert.equal(canAirRecover(juggled(), false), false, "no press, no tech");
  assert.equal(canAirRecover(juggled({ grounded: true }), true), false, "grounded fighters cannot air tech");
  assert.equal(canAirRecover(juggled({ pendingKnockdown: false }), true), false, "only a live juggle can be teched");
  assert.equal(canAirRecover(juggled({ airTechArmed: false }), true), false, "knockdown-final and super launches stay untechable");
  assert.equal(
    canAirRecover(juggled({ airHitstunFrames: AIR_RECOVERY_RULES.minimumHitstunFrames - 1 }), true),
    false,
    "the escape window opens only after the minimum airborne hitstun",
  );
  assert.equal(canAirRecover(juggled({ airHitstunFrames: undefined }), true), false, "a missing clock reads as zero");

  // The escape is brief and taxed: invulnerability shorter than the window it
  // escapes from, and the landing tax reuses the existing air-attack landing
  // recovery so a read meaty still punishes it.
  assert.ok(AIR_RECOVERY_RULES.invulnerableFrames > 0);
  assert.ok(AIR_RECOVERY_RULES.invulnerableFrames < AIR_RECOVERY_RULES.minimumHitstunFrames);
  assert.ok(DEFENSE_RULES.airAttackLandingRecoveryFrames > DEFENSE_RULES.landingRecoveryFrames,
    "the landing tax must exceed an empty jump's landing");
  assert.ok(AIR_RECOVERY_RULES.flipFrames > 0);
});

// ---------------------------------------------------------------------------
// Release 1.7 DEPTH — Perfect Guard (just-defend)
// ---------------------------------------------------------------------------

test("perfect guard is a strict just-defend window on the guard start tick", () => {
  const impact = 1000;
  for (let age = 0; age <= PERFECT_GUARD_RULES.windowFrames; age += 1) {
    assert.equal(isPerfectGuard(impact - age, impact), true, `a guard started ${age} frames before impact is perfect`);
  }
  assert.equal(isPerfectGuard(impact - PERFECT_GUARD_RULES.windowFrames - 1, impact), false, "one frame too early fails");
  assert.equal(isPerfectGuard(impact + 1, impact), false, "a guard started after impact can never be perfect");
  assert.equal(isPerfectGuard(-Infinity, impact), false, "the fresh-fighter sentinel never perfects");
  assert.equal(isPerfectGuard(Number.NaN, impact), false);

  // Reward shape: real but conservative — blockstun relief smaller than any
  // authored blockstun, a Grit sip far below a super's cost.
  assert.ok(PERFECT_GUARD_RULES.windowFrames >= 2 && PERFECT_GUARD_RULES.windowFrames <= 6, "the window stays a skill test");
  assert.ok(PERFECT_GUARD_RULES.blockstunReductionFrames > 0);
  assert.ok(PERFECT_GUARD_RULES.gritBonus > 0 && PERFECT_GUARD_RULES.gritBonus <= 5);
});

test("perfect guard re-arms inside a string on a fresh back tap (block economy)", async () => {
  // The rule is pure: whatever tick the guard was (re)stamped on is the tick
  // the window counts from. Hit 2 of a two-hit string lands 7 frames after
  // hit 1 (a rehit cadence shared by most of the roster's specials); with the
  // original stamp it is 7 frames stale and cannot be perfect, with a re-stamp
  // 3 frames before impact it is.
  const firstHit = 1000;
  const secondHit = firstHit + 7;
  const originalStamp = firstHit - 2;
  assert.equal(isPerfectGuard(originalStamp, firstHit), true, "hit 1 was a perfect guard");
  assert.equal(isPerfectGuard(originalStamp, secondHit), false, "a held guard cannot perfect hit 2");
  const reStamp = secondHit - 3;
  assert.equal(isPerfectGuard(reStamp, secondHit), true, "a re-tap inside blockstun can perfect hit 2");
  assert.ok(PERFECT_GUARD_RULES.windowFrames < 7, "the window is tighter than the rehit cadence, so the re-tap is still a read");

  // game.js only ever refused this because blockstun forces guarding true
  // and the stamp keyed on a fresh guarding edge. The re-arm keys on the
  // directional back edge (guardInputHeld) while blockstun is live; the
  // engine-internal input.guard channel the CPU drives is deliberately not
  // part of the edge.
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../game.js", import.meta.url), "utf8");
  assert.match(source, /const backTapped = directionContext\(fighter, input\)\.backHeld;/);
  assert.match(source, /const guardTapEdge = backTapped && !fighter\.guardInputHeld;/);
  assert.match(source, /if \(fighter\.guarding && \(!wasGuarding \|\| \(fighter\.blockstunFrames > 0 && guardTapEdge\)\)\)/);
  assert.match(source, /guardInputHeld: false,/, "the edge memory is a plain fighter field so rollback carries it");
});

// ---------------------------------------------------------------------------
// Release 1.7 DEPTH — rollback round-trip for every new gameplay field
// ---------------------------------------------------------------------------

test("every DEPTH fighter field round-trips the rollback snapshot machinery", () => {
  const fields = createDepthFighterFields();
  const names = Object.keys(fields);
  assert.deepEqual(names.sort(), [
    "airHitstunFrames",
    "airTechArmed",
    "airTechFlipFrames",
    "airTechTaxPending",
    "guardCrushFrames",
    "guardCrushTotalFrames",
    "guardDecayDelay",
    "guardImmuneFrames",
    "guardMeter",
    "guardStartedTick",
    "wakeOption",
  ]);
  // Plain data only: the fighter snapshot clones every enumerable
  // non-reference field with structuredClone, so nothing here may be a
  // function, symbol or object reference.
  for (const [name, value] of Object.entries(fields)) {
    assert.ok(["number", "boolean", "string"].includes(typeof value), `${name} must be plain data`);
  }

  // Mid-fight values, including the -Infinity sentinel and a decimal decay
  // value — the shapes these fields actually take in play.
  const live = {
    guardMeter: 42.375,
    guardDecayDelay: 12,
    guardCrushFrames: 31,
    guardCrushTotalFrames: GUARD_RULES.crushFrames,
    guardImmuneFrames: 120,
    guardStartedTick: 5321,
    wakeOption: "quick",
    airTechArmed: true,
    airHitstunFrames: 9,
    airTechFlipFrames: 4,
    airTechTaxPending: true,
  };
  assert.deepEqual(Object.keys(live).sort(), names.sort(), "the live sample covers every field");

  for (const [name, mutated] of Object.entries(live)) {
    // Snapshot (the exact clone the fighter snapshot machinery performs)...
    const fighter = createDepthFighterFields();
    const snapshot = structuredClone(fighter);
    // ...mutate the live object...
    fighter[name] = mutated;
    assert.notDeepEqual(fighter[name], snapshot[name], `${name}: the mutation must be observable`);
    // ...restore (the exact Object.assign restoreRollbackFighter performs)...
    Object.assign(fighter, structuredClone(snapshot));
    // ...and assert identical, field by field.
    assert.deepEqual(fighter, createDepthFighterFields(), `${name}: restore must return the pre-mutation value`);
  }

  // The rollback transport itself: serialization preserves every field —
  // including the non-finite guardStartedTick sentinel — bit for bit.
  const defaults = createDepthFighterFields();
  const overWire = parseRollbackState(serializeRollbackState(defaults));
  assert.deepEqual(overWire, defaults, "defaults survive serialize/parse (with the -Infinity sentinel)");
  assert.equal(overWire.guardStartedTick, -Infinity);
  const liveOverWire = parseRollbackState(serializeRollbackState(live));
  assert.deepEqual(liveOverWire, live, "live values survive serialize/parse");

  // And every field is checksum-visible: any single-field change must change
  // the state checksum, or a desync in that field would corrupt online play
  // invisibly.
  const baseline = checksumState(defaults);
  for (const [name, mutated] of Object.entries(live)) {
    const changed = { ...createDepthFighterFields(), [name]: mutated };
    assert.notEqual(checksumState(changed), baseline, `${name} must be checksum-visible`);
  }
});
