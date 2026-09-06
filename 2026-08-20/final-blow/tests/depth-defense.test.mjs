import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AIR_RECOVERY_RULES,
  ATTACK_LEVELS,
  DEFENSE_RULES,
  GUARD_RULES,
  PERFECT_GUARD_RULES,
  STUN_RULES,
  THROW_RULES,
  WAKEUP_RULES,
  canAirRecover,
  createCombatMove,
  createDepthFighterFields,
  getHurtboxes,
  guardGainForAttack,
  isPerfectGuard,
  isStrikeVulnerable,
  isWakeupVulnerable,
  resolveWakeOption,
  wakeupVulnerableFrames,
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

// ---------------------------------------------------------------------------
// 5.3 OKIZEME — the wake-up is a read, not a hard reset
//
// Sweep item #10: getHurtboxes returned [] for `down || knockdownFrames > 0 ||
// wakeupFrames > 0`, so nothing could be timed against a rising fighter for
// 64 frames (76 with the Down delay), and EVERY knockdown then handed out 40
// throw-immune frames. Measured on the live build before this pass: after a
// TREMOR TAP knockdown the victim was untouchable for 64 frames and
// unthrowable for 104, while the knockdown starters are −12 to −20 on block.
// The round genuinely restarted after every knockdown.
// ---------------------------------------------------------------------------

const risingFighter = (overrides = {}) => ({
  x: 500, y: 600, facing: 1, grounded: true, crouch: false, guardHeight: "high",
  attacking: null, attackFrame: 0, invulnerableFrames: 0, down: false,
  knockdownFrames: 0, wakeupFrames: 0, wakeOption: "", ...overrides,
});

test("the last wake-up frames carry hurtboxes so a meaty has a timing", () => {
  // The split is derived, not two independent numbers: the hurtbox-less half
  // of the rise is exactly what is left after the vulnerable half.
  assert.equal(
    DEFENSE_RULES.wakeupFrames - DEFENSE_RULES.wakeupVulnerableFrames,
    DEFENSE_RULES.wakeupInvulnerableFrames,
    "wakeupInvulnerableFrames must stay the derived complement of the meaty window",
  );
  assert.ok(DEFENSE_RULES.wakeupVulnerableFrames >= 4 && DEFENSE_RULES.wakeupVulnerableFrames <= 8,
    "the meaty window is a real timing (4-8 frames = 67-133 ms), not a free hit and not a pixel");

  // Down and knocked down stay untouchable — the lie-down animation is not a
  // fair target, and that half is unchanged from 1.7.
  assert.deepEqual(getHurtboxes(risingFighter({ down: true, knockdownFrames: 20 })), []);
  assert.deepEqual(getHurtboxes(risingFighter({ invulnerableFrames: 3 })), []);

  // The rise: hurtbox-less for the first 10 frames, real for the last 6.
  const seen = [];
  for (let wakeup = DEFENSE_RULES.wakeupFrames; wakeup >= 1; wakeup -= 1) {
    const boxes = getHurtboxes(risingFighter({ wakeupFrames: wakeup }));
    seen.push(boxes.length > 0);
    assert.equal(boxes.length > 0, isWakeupVulnerable(risingFighter({ wakeupFrames: wakeup })),
      `wakeupFrames ${wakeup}: the boxes and the predicate must agree`);
  }
  assert.equal(seen.filter(Boolean).length, DEFENSE_RULES.wakeupVulnerableFrames);
  assert.equal(seen.slice(0, DEFENSE_RULES.wakeupInvulnerableFrames).some(Boolean), false,
    "the first half of the rise is still untouchable");
  assert.equal(seen.slice(-DEFENSE_RULES.wakeupVulnerableFrames).every(Boolean), true,
    "the last frames are all vulnerable — the window is contiguous, so it can be aimed at");

  // The rising body wears the CROUCH shape: it has not stood up yet, so a
  // meaty has to be aimed at the floor rather than at head height.
  const rising = getHurtboxes(risingFighter({ wakeupFrames: 1 }));
  const crouching = getHurtboxes(risingFighter({ crouch: true }));
  assert.deepEqual(rising, crouching, "a rising body is the crouch shape");
  assert.ok(rising.length < getHurtboxes(risingFighter()).length, "and is smaller than a standing one");

  // Projectiles and paint traps ask the same question the fists do.
  assert.equal(isStrikeVulnerable(risingFighter({ wakeupFrames: 1 })), true);
  assert.equal(isStrikeVulnerable(risingFighter({ wakeupFrames: DEFENSE_RULES.wakeupFrames })), false);
  assert.equal(isStrikeVulnerable(risingFighter({ down: true, knockdownFrames: 4 })), false);
  assert.equal(isStrikeVulnerable(risingFighter()), true);
  assert.equal(isStrikeVulnerable(null), false);
});

test("quick rise and delayed rise move the meaty window, so the rise is a guess", () => {
  const base = wakeupVulnerableFrames("");
  const quick = wakeupVulnerableFrames("quick");
  const delayed = wakeupVulnerableFrames("delay");
  assert.equal(quick, base + WAKEUP_RULES.quickRiseVulnerableBonusFrames);
  assert.equal(delayed, Math.max(1, base - WAKEUP_RULES.delayVulnerableReductionFrames));
  assert.ok(quick > base && delayed < base, "the three options must be three different windows");
  assert.ok(delayed >= 1, "a delayed rise is still meaty-able — it is a mix-up, not immunity");

  // The frame-count spread the attacker actually has to read: a quick rise
  // gets up 14 frames early and a delay 12 late, so the window the attacker is
  // aiming at moves by 26 frames (433 ms) between the two extremes. That is a
  // genuine guess, not a reaction.
  const spread = WAKEUP_RULES.quickRiseFrames + WAKEUP_RULES.delayFrames;
  assert.equal(spread, 26);
  assert.ok(spread > DEFENSE_RULES.wakeupVulnerableFrames * 2,
    "the option spread must be wider than the window itself or one timing covers both");

  // A fighter carrying its option resolves its own window.
  assert.equal(isWakeupVulnerable({ wakeupFrames: 7, wakeOption: "quick" }), true);
  assert.equal(isWakeupVulnerable({ wakeupFrames: 7, wakeOption: "" }), false);
  assert.equal(isWakeupVulnerable({ wakeupFrames: 5, wakeOption: "delay" }), false);
  assert.equal(isWakeupVulnerable({ wakeupFrames: 4, wakeOption: "delay" }), true);
  assert.equal(isWakeupVulnerable({ wakeupFrames: 0 }), false);
});

test("the 40-frame throw immunity belongs to throws and techs, not to every knockdown", async () => {
  // Old: 40 frames on EVERY wake-up, so a knockdown left the victim
  // unthrowable for 40 frames on top of the 64 hurtbox-less ones — command
  // grabs could never follow a knockdown at all. New: a strike knockdown pays
  // the short one, and only a knockdown that came from a throw pays 40.
  assert.equal(DEFENSE_RULES.throwInvulnerableFrames, 40);
  assert.ok(DEFENSE_RULES.strikeKnockdownThrowImmuneFrames > 0,
    "a strike knockdown still needs enough immunity that a throw cannot be pre-buffered onto the wake tick");
  assert.ok(DEFENSE_RULES.strikeKnockdownThrowImmuneFrames < DEFENSE_RULES.wakeupFrames,
    "…but it must expire before the rise finishes, or nothing changed");
  assert.ok(DEFENSE_RULES.strikeKnockdownThrowImmuneFrames * 4 <= DEFENSE_RULES.throwInvulnerableFrames,
    "the anti-throw-loop number stays a different order of magnitude from the strike one");

  const source = readFileSync(new URL("../game.js", import.meta.url), "utf8");
  // The latch is set by the throw itself and consumed (and cleared) by the
  // wake tick, so it can never leak into the next knockdown.
  assert.match(source, /victim\.throwKnockdown = true;/);
  assert.match(source, /fighter\.throwInvulnerableFrames = fighter\.throwKnockdown\s*\?\s*DEFENSE_RULES\.throwInvulnerableFrames\s*:\s*DEFENSE_RULES\.strikeKnockdownThrowImmuneFrames;/);
  assert.match(source, /fighter\.throwKnockdown = false;/);
  assert.match(source, /throwKnockdown: false,/, "the latch is a plain fighter field so rollback carries it");
  // A meaty that connected on the way up cancels the reversal grant: without
  // this the victim got 4 invulnerable frames mid-hitstun and the meaty's own
  // combo dropped.
  assert.match(source, /const meatied = fighter\.hitstunFrames > 0 \|\| fighter\.blockstunFrames > 0;/);
  assert.match(source, /const reversalFrames = meatied \? 0 :/);
  assert.match(source, /fighter\.justWoke = !meatied;/);
  // And the stun clocks run during the rise, so a meaty's hitstun is honest.
  assert.match(source, /} else if \(fighter\.wakeupFrames > 0\) \{\s*\n\s*fighter\.wakeupFrames -= 1;[\s\S]{0,400}?fighter\.hitstunFrames = Math\.max\(0, fighter\.hitstunFrames - 1\);/);
  // The rising fighter may guard on the vulnerable frames — the wake-up is a
  // high/low read, not a coin flip.
  assert.match(source, /if \(isWakeupVulnerable\(fighter\)\) \{\s*\n\s*const risingDirection = directionContext\(fighter, input\);/);
});

// ---------------------------------------------------------------------------
// 5.3 CLOSE RANGE — the throw has a whiff and a reactable tech
//
// Sweep item #13: the only tech was the 6 sim frames BEFORE contact (a
// pre-emption, not a reaction), `updateGrabHolds` ran the 11-18-frame clinch
// with no tech check at all although CONTROLS.md promised one, and an
// out-of-range →+LP silently became a safe advancing light — so →+LP at close
// range was a no-loss option-select: throw / tech / safe poke.
// ---------------------------------------------------------------------------

test("the throw commits further than it reaches, so a grab can whiff", () => {
  assert.ok(THROW_RULES.attemptRange > THROW_RULES.grabRange,
    "the press must commit beyond the reach or there is no whiff risk");
  // Measured on the live build: the universal throw's authored hitbox reaches
  // 152-167 world units against a standing hurtbox (163-167 for alan, the
  // longest), while the press gate was 119 — so the contact test let a throw
  // pressed at the gate still land after the victim had walked ~38 units away,
  // and neither a back-walk nor a backdash could escape a grab it had already
  // seen. The contact gate now re-checks grabRange, and the commit band is the
  // 41 units between the two.
  const band = THROW_RULES.attemptRange - THROW_RULES.grabRange;
  assert.equal(THROW_RULES.grabRange, 119, "104px × the 1.14 fighter scale — the documented reach, unchanged");
  assert.equal(THROW_RULES.attemptRange, 160, "140px × the same scale");
  assert.ok(band >= 30 && band <= 60,
    "the band is a quarter to half a body width: real spacing risk, but the forward light stays reachable past it");
});

test("the clinch tech is a reaction window, and it never covers the whole hold", () => {
  const pre = DEFENSE_RULES.throwTechWindowFrames;
  const clinch = DEFENSE_RULES.clinchTechWindowFrames;
  assert.equal(pre, 6, "the pre-contact half is unchanged");
  assert.ok(clinch > 0, "the clinch half is the half CONTROLS.md promised and the code never had");
  // Total reactable span: a press from 6 frames before contact through the
  // 7th clinch frame breaks the hold — 14 ticks, 233 ms at 60 Hz, which is a
  // reaction to the lift animation rather than a pre-emption of it. Measured
  // in the browser: pressing on observed clinch frames 1-7 techs, frame 8 does
  // not, and the throw lands for its full 19.7.
  const spanTicks = pre + clinch;
  assert.equal(spanTicks, 14);
  assert.ok(spanTicks / 60 >= 0.2 && spanTicks / 60 <= 0.28,
    `the window must sit in human reaction range, got ${(spanTicks / 60 * 1000).toFixed(0)} ms`);
  // The shortest authored hold is 11 frames (jez/ali/benny); the window has to
  // stay inside it or the "clinch" would simply be teched by holding a button.
  assert.ok(clinch < 11, "the window must end before the shortest hold does");
  // The break reads differently from the clash: harder shove, longer flash.
  assert.ok(THROW_RULES.clinchTechPushback > THROW_RULES.techPushback);
  assert.ok(THROW_RULES.clinchTechFlashFrames > THROW_RULES.techFlashFrames);

  const source = readFileSync(new URL("../game.js", import.meta.url), "utf8");
  assert.match(source, /if \(grab\.frame <= DEFENSE_RULES\.clinchTechWindowFrames/);
  assert.match(source, /victim\.lastThrowInputFrame >= \(grab\.startTick \?\? -Infinity\)/);
  assert.match(source, /techThrow\(attacker, victim, \{ clinch: true \}\);/);
  // The universal throw re-checks its reach at CONTACT; command grabs (level
  // THROW, kind "special") keep their own authored reach.
  assert.match(source, /if \(attack\.kind === "throw" && Math\.abs\(victim\.x - attacker\.x\) > PROXIMITY_GRAB_RANGE\) return;/);
  // The press commits over the wider band…
  assert.match(source, /if \(!fighter\.grabbed\s*\n\s*&& !inProximityGrabAttemptRange\(fighter, state\.fighters\[1 - fighter\.side\]\)\) return;/);
  // …and a fighter already in a clinch may always answer it.
  assert.match(source, /const PROXIMITY_GRAB_ATTEMPT_RANGE = THROW_RULES\.attemptRange;/);
});
