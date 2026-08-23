import assert from "node:assert/strict";
import test from "node:test";

import {
  FACING_RULES,
  attackLastHitboxFrame,
  attackReachSpan,
  fighterCanTurn,
  normalizeFacing,
  opponentWithinAttackReach,
  resolveFacingAxis,
  resolvePairFacing,
} from "../engine/facing.mjs";
import { FIGHTER_SCALE, HURTBOX_MAX_EXTENT } from "../engine/defense.mjs";
import { FIGHTER_KITS } from "../engine/fighter-kits.mjs";

// Tests assert the rule, not frozen numbers: the pair invariant is that two
// fighters face each other unless one is deliberately committed to a cross-up.

const DEADBAND = FACING_RULES.deadband;
const attack = (overrides = {}) => ({
  activeStartFrame: 4,
  activeEndFrame: 12,
  hitboxes: [{ from: 0, to: 5 }],
  ...overrides,
});

test("facing is only ever left or right, never a zero-width sprite", () => {
  for (const bad of [0, -0, NaN, undefined, null, 2, "1"]) {
    assert.equal(normalizeFacing(bad, 1), 1, `${String(bad)} must fall back, not leak through`);
    assert.equal(normalizeFacing(bad, -1), -1);
  }
  assert.equal(normalizeFacing(1, -1), 1);
  assert.equal(normalizeFacing(-1, 1), -1);
});

test("the shared axis follows the opponent once they clear the deadband", () => {
  assert.equal(resolveFacingAxis(1, 300, 500), 1, "side 1 to the right reads as +1");
  assert.equal(resolveFacingAxis(1, 500, 300), -1, "side 1 to the left flips the axis");
  assert.equal(resolveFacingAxis(-1, 300, 500), 1, "a stale axis is corrected, not preserved");
});

test("the deadband holds the axis through a near-perfect overlap", () => {
  // Sweeping dx across the overlap must not produce a single flip: this is the
  // jitter that made sprites strobe during cross-throughs and deep jump-ins.
  for (let delta = -DEADBAND; delta <= DEADBAND; delta += 1) {
    assert.equal(resolveFacingAxis(1, 500, 500 + delta), 1, `dx=${delta} must hold the axis`);
    assert.equal(resolveFacingAxis(-1, 500, 500 + delta), -1, `dx=${delta} must hold the axis`);
  }
  // An exact positional tie is the degenerate case Math.sign() would return 0 for.
  assert.equal(resolveFacingAxis(-1, 500, 500), -1);
  // Just outside, it must commit.
  assert.equal(resolveFacingAxis(-1, 500, 500 + DEADBAND + 1), 1);
  assert.equal(resolveFacingAxis(1, 500, 500 - DEADBAND - 1), -1);
});

test("non-finite positions never corrupt the axis", () => {
  assert.equal(resolveFacingAxis(1, NaN, 500), 1);
  assert.equal(resolveFacingAxis(-1, 500, Infinity), -1);
});

test("both fighters face each other whenever both are free to turn", () => {
  for (const [aX, bX] of [[300, 500], [500, 300], [0, 1280], [1280, 0]]) {
    const resolved = resolvePairFacing({ previousAxis: 1, aX, bX });
    assert.equal(resolved.aFacing, -resolved.bFacing, "the pair must be opposed");
    assert.equal(resolved.aFacing, bX > aX ? 1 : -1, "side 0 looks at side 1");
    assert.equal(resolved.bFacing, aX > bX ? 1 : -1, "side 1 looks at side 0");
  }
});

test("a committed attacker keeps its cross-up direction while it can still hit", () => {
  // Fighter A swung right, then the opponent crossed to A's left. A must not
  // auto-correct mid-move or the whiff stops being punishable.
  const resolved = resolvePairFacing({
    previousAxis: 1,
    aX: 520,
    bX: 300,
    aFacing: 1,
    bFacing: -1,
    aCanTurn: false,
  });
  assert.equal(resolved.axis, -1, "the axis still tracks the truth");
  assert.equal(resolved.aFacing, 1, "the committed attacker holds its direction");
  assert.equal(resolved.bFacing, 1, "the free fighter turns to face the attacker");
});

test("a fighter stranded inside the deadband turns the moment it is free", () => {
  // The regression. An airborne crossover skips pushbox separation, so the pair
  // can sit inside the deadband for many frames. Previously each fighter kept
  // its own stale facing there, which left a turn-eligible fighter pointing
  // away from an opponent that had demonstrably swapped sides.
  const crossed = { previousAxis: -1, aX: 500, bX: 500 - Math.floor(DEADBAND / 2) };

  const locked = resolvePairFacing({ ...crossed, aFacing: 1, bFacing: 1, aCanTurn: false });
  assert.equal(locked.aFacing, 1, "still committed, so it holds");

  const freed = resolvePairFacing({ ...crossed, aFacing: 1, bFacing: 1, aCanTurn: true });
  assert.equal(freed.aFacing, -1, "released from the attack, it snaps onto the axis");
  assert.equal(freed.bFacing, 1);
  assert.equal(freed.aFacing, -freed.bFacing, "and the pair is opposed again");
});

test("two free fighters can never end up pointing the same way", () => {
  // Exhaustive sweep over the states that used to disagree: any pair of stale
  // facings, on either side of the deadband, from either held axis.
  for (const previousAxis of [1, -1]) {
    for (const aFacing of [1, -1]) {
      for (const bFacing of [1, -1]) {
        for (let delta = -40; delta <= 40; delta += 1) {
          const resolved = resolvePairFacing({
            previousAxis, aFacing, bFacing, aX: 500, bX: 500 + delta,
          });
          assert.equal(
            resolved.aFacing,
            -resolved.bFacing,
            `axis=${previousAxis} a=${aFacing} b=${bFacing} dx=${delta} left the pair unopposed`,
          );
        }
      }
    }
  }
});

test("the axis is stable under repeated resolution, so facings do not oscillate", () => {
  let axis = 1;
  let aFacing = 1;
  let bFacing = -1;
  const flips = [];
  // Walk side 1 slowly through side 0 and back out, one pixel a frame.
  for (const delta of [...Array(81).keys()].map((index) => 40 - index)) {
    const resolved = resolvePairFacing({ previousAxis: axis, aX: 500, bX: 500 + delta, aFacing, bFacing });
    if (resolved.aFacing !== aFacing) flips.push(delta);
    ({ axis, aFacing, bFacing } = resolved);
  }
  assert.equal(flips.length, 1, `a single crossing must flip facing exactly once, flipped at ${flips}`);
  assert.equal(aFacing, -1, "and it ends up looking at the opponent");
});

test("the same inputs always resolve identically, so resimulation matches", () => {
  // Rollback replays frames from a restored snapshot. Facing must be a pure
  // function of (axis, positions, turn eligibility) with no hidden carry.
  const inputs = { previousAxis: -1, aX: 640, bX: 646, aFacing: 1, bFacing: 1, aCanTurn: true };
  const first = resolvePairFacing(inputs);
  for (let repeat = 0; repeat < 8; repeat += 1) {
    assert.deepEqual(resolvePairFacing(inputs), first, "resolution must be deterministic");
  }
  // Feeding the restored axis back in reproduces the same result, which is what
  // a peer does when it resimulates from a rolled-back frame.
  assert.deepEqual(resolvePairFacing({ ...inputs, previousAxis: first.axis }), first);
});

test("a move stops locking facing once its last hitbox window closes", () => {
  const move = attack();
  const last = attackLastHitboxFrame(move);
  assert.ok(last <= move.activeEndFrame, "the lock never outlasts the active window");
  assert.equal(fighterCanTurn({ attacking: move, attackFrame: last }), false);
  assert.equal(fighterCanTurn({ attacking: move, attackFrame: last + 1 }), true);
});

test("a fighter with no attack is always free to turn", () => {
  assert.equal(fighterCanTurn({ attacking: null, attackFrame: 0 }), true);
  assert.equal(fighterCanTurn(undefined), true);
  assert.equal(attackLastHitboxFrame(null), -1);
});

test("a move without authored hitboxes still releases at its active end", () => {
  assert.equal(attackLastHitboxFrame(attack({ hitboxes: [] })), 12);
  assert.equal(attackLastHitboxFrame(attack({ hitboxes: undefined })), 12);
  // A malformed move must not lock a fighter's facing forever.
  assert.equal(
    fighterCanTurn({ attacking: { hitboxes: [] }, attackFrame: 0 }),
    true,
    "a move with neither hitboxes nor an active end cannot strand a fighter",
  );
});

// --- Range-aware facing lock -------------------------------------------------
// 1.9's offensive-depth pass added long EX moves whose committed-facing lock
// outlasts what a viewer tolerates. The lock exists to protect a committed
// cross-up hitbox, so it is released once the opponent is somewhere that
// hitbox provably cannot reach — derived from authored data, never per-fighter.

const cyraxxExBufferSkip = FIGHTER_KITS.cyraxx.moves.enhancedBackSpecial;

test("a move's reach comes from its authored hitboxes, scaled to the body", () => {
  const span = attackReachSpan(cyraxxExBufferSkip, FIGHTER_SCALE);
  const boxes = cyraxxExBufferSkip.hitboxes;
  const near = Math.min(...boxes.map(({ box }) => box.x)) * FIGHTER_SCALE;
  const far = Math.max(...boxes.map(({ box }) => box.x + box.width)) * FIGHTER_SCALE;
  assert.equal(span.near, near, "near edge must be the closest authored box");
  assert.equal(span.far, far, "far edge must be the furthest authored box");
  assert.ok(span.far > span.near);
});

test("BUFFER SKIP EX releases its facing lock at the captured out-of-range state", () => {
  // Captured live from a 1.9 AI match: cyraxx committed at attackFrame 23 of a
  // 37-frame EX, opponent 248px BEHIND it, facing +1 — visibly wrong for 21+
  // frames. That is the defect this rule exists to end.
  const stranded = {
    attacking: cyraxxExBufferSkip,
    attackFrame: 23,
    facing: 1,
  };
  const context = { scale: FIGHTER_SCALE, allowance: HURTBOX_MAX_EXTENT };
  assert.equal(
    fighterCanTurn({ ...stranded }, { ...context, opponentOffset: -248 }),
    true,
    "an opponent 248px behind is unreachable, so the fighter must be free to turn",
  );
  // Sanity: the move genuinely cannot reach behind itself.
  assert.equal(opponentWithinAttackReach(cyraxxExBufferSkip, -248, FIGHTER_SCALE, HURTBOX_MAX_EXTENT), false);
});

test("close-range committed attacks keep their facing lock", () => {
  const context = { scale: FIGHTER_SCALE, allowance: HURTBOX_MAX_EXTENT };
  const committed = { attacking: cyraxxExBufferSkip, attackFrame: 23, facing: 1 };
  // A genuine cross-up: opponent just behind the attacker, well inside the
  // body allowance. Auto-correcting here would make whiffs unpunishable.
  for (const offset of [-30, -60, -100, 0, 40, 120, 240]) {
    assert.equal(
      fighterCanTurn({ ...committed }, { ...context, opponentOffset: offset }),
      false,
      `offset ${offset} is reachable, so the lock must hold`,
    );
  }
});

test("every authored move keeps its lock at point-blank range", () => {
  // Whatever the kits ship, nobody may auto-correct while the opponent is
  // standing on top of them — that is the case cross-up protection is for.
  for (const [kitId, kit] of Object.entries(FIGHTER_KITS)) {
    for (const [moveKey, move] of Object.entries(kit.moves)) {
      if (!Array.isArray(move?.hitboxes) || move.hitboxes.length === 0) continue;
      const locked = fighterCanTurn(
        { attacking: move, attackFrame: 0, facing: 1 },
        { opponentOffset: 0, scale: FIGHTER_SCALE, allowance: HURTBOX_MAX_EXTENT },
      );
      assert.equal(locked, false, `${kitId}.${moveKey} must hold its lock at point blank`);
    }
  }
});

test("the reach test never fires without an offset, so old callers are unchanged", () => {
  const committed = { attacking: cyraxxExBufferSkip, attackFrame: 23 };
  assert.equal(fighterCanTurn(committed), false, "no offset means pure frame-window behaviour");
  assert.equal(fighterCanTurn({ ...committed, attackFrame: 99 }), true, "the frame window still releases");
});

test("a move with no usable hitbox data keeps the lock rather than guessing", () => {
  const shapeless = { activeStartFrame: 0, activeEndFrame: 40, hitboxes: [{ from: 0, to: 30 }] };
  assert.deepEqual(attackReachSpan(shapeless, FIGHTER_SCALE), { near: -Infinity, far: Infinity });
  assert.equal(opponentWithinAttackReach(shapeless, 9999, FIGHTER_SCALE, 0), true);
  assert.equal(
    fighterCanTurn({ attacking: shapeless, attackFrame: 5 }, { opponentOffset: 9999, scale: FIGHTER_SCALE }),
    false,
    "unknown reach must not silently unlock",
  );
});

test("the reach decision is deterministic and rollback-safe", () => {
  // Pure function of authored data plus positions, both already snapshotted.
  const call = () => fighterCanTurn(
    { attacking: cyraxxExBufferSkip, attackFrame: 23, facing: 1 },
    { opponentOffset: -248, scale: FIGHTER_SCALE, allowance: HURTBOX_MAX_EXTENT },
  );
  const first = call();
  for (let repeat = 0; repeat < 8; repeat += 1) assert.equal(call(), first);
  assert.equal(opponentWithinAttackReach(cyraxxExBufferSkip, NaN, FIGHTER_SCALE, 0), true, "NaN must fail safe to locked");
});

test("a committed direction is unconditional for the visibility window", () => {
  // The browser suite pins this: start a heavy, teleport the opponent 200px
  // behind, and the attacker must still be committed on the next frame. Reach
  // alone would have unlocked it there — 200px behind is genuinely outside a
  // wrecking hook — so the window is what keeps that guard intact while still
  // ending a sustained wrong facing elsewhere.
  const heavy = FIGHTER_KITS.deathblow.moves.standHeavy;
  const context = { scale: FIGHTER_SCALE, allowance: HURTBOX_MAX_EXTENT, opponentOffset: -200 };
  assert.equal(opponentWithinAttackReach(heavy, -200, FIGHTER_SCALE, HURTBOX_MAX_EXTENT), false,
    "200px behind is out of reach, so only the window can be holding this lock");
  assert.equal(fighterCanTurn({ attacking: heavy, attackFrame: 1 }, context), false, "startup stays committed");
  // A short normal closes its hitbox window long before the visibility window,
  // so it is released by the frame rule exactly as it always was.
  assert.ok(attackLastHitboxFrame(heavy) < FACING_RULES.lockVisibilityFrames);
  assert.equal(fighterCanTurn({ attacking: heavy, attackFrame: 9 }, context), true, "and its own hitbox window still frees it");
});

test("the lock releases only once it is both pointless and visible", () => {
  const move = cyraxxExBufferSkip;
  const base = { scale: FIGHTER_SCALE, allowance: HURTBOX_MAX_EXTENT };
  const gate = FACING_RULES.lockVisibilityFrames;
  // The EX still has hitboxes out past the visibility window — that overlap is
  // precisely the state that stranded cyraxx facing backwards.
  assert.ok(attackLastHitboxFrame(move) > gate, "this move outlives the visibility window");
  assert.equal(fighterCanTurn({ attacking: move, attackFrame: gate }, { ...base, opponentOffset: -248 }), false,
    "at the window it still holds");
  assert.equal(fighterCanTurn({ attacking: move, attackFrame: gate + 1 }, { ...base, opponentOffset: -248 }), true,
    "past it, an unreachable opponent frees the turn");
  // Reachable opponents stay locked for as long as the move can still connect.
  for (let frame = 0; frame <= attackLastHitboxFrame(move); frame += 1) {
    assert.equal(fighterCanTurn({ attacking: move, attackFrame: frame }, { ...base, opponentOffset: -40 }), false,
      `a close cross-up must keep its lock at frame ${frame}`);
  }
});
