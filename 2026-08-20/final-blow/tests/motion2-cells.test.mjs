import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_CELL_ROLES,
  MOTION2_CELLS,
  MOTION_CELLS,
  MOTION_CELL_COUNT,
  attackAnimationPose,
  attackMotionBeat,
  auditCellFloorOffsets,
  baseCellDrawAdjust,
  baseCellRoles,
  buildMotionAcceptMasks,
  cellFloorOffset,
  createFighterMove,
  isBaseUnusableCell,
  motion2Pose,
  motionPose,
  resolveMotionPose,
  safeBaseFrame,
  wakeupMotionPose,
  wakeupRiseTransform,
} from "../engine/fighter-kits.mjs";

// v2.9 FLOW — the motion2 bank contract (MOTION-ATLAS.md "Motion2 bank"):
// pure sim-state descriptors, the same manifest accept-mask gate as bank 1,
// chained fallbacks that land byte-for-byte on the pre-2.9 beat, the ≤4-tick
// windup anticipation window, the air-attack active window, and the
// getup-a → getup-b wake-up ordering.

const testDir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(testDir, "..", "assets", "motion2", "MANIFEST.json"), "utf8"));

const ROSTER = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "commissioner", "devil"];

function testManifestAcceptMasks() {
  const masks = buildMotionAcceptMasks(manifest);
  assert.deepEqual(Object.keys(masks).sort(), [...ROSTER].sort());
  let accepted = 0;
  for (const id of ROSTER) {
    assert.equal(masks[id].accept.length, MOTION_CELL_COUNT, `${id} mask must cover the 16-cell grammar`);
    assert.ok(masks[id].scale > 1 && masks[id].scale < 2, `${id} build scale should be recorded`);
    accepted += masks[id].accept.filter(Boolean).length;
  }
  // 2.9 critic round: the twenty walk-a/walk-b cells are REJECTED. Measured
  // foot-cluster positions prove walk-a and walk-b are the same stride phase
  // for every fighter (so the pair is not a cycle, and donald skated), and
  // the bank's build/palette/prop grading parts from the base walk bank badly
  // enough that interleaving strobed (deathblow, jez), teleported a golf club
  // (donald) or flipped body plan (the devil's all-fours prowl against an
  // upright bipedal cycle).
  //
  // 2.9 critic round 2 (B6): the devil's crouch-trans (4) and dash-brake (6)
  // join them. Both are all-fours PROWL poses — horizontal spine, head below
  // the shoulder line, both forelimbs bearing weight — on a fighter whose base
  // bank is upright and bipedal, so one crouch press played four body plans in
  // about 20 ticks. The other 138 cells stay live.
  assert.equal(accepted, 138);
  for (const id of ROSTER) {
    assert.equal(masks[id].accept[MOTION2_CELLS.walkA], false, `${id} walk-a must stay disabled`);
    assert.equal(masks[id].accept[MOTION2_CELLS.walkB], false, `${id} walk-b must stay disabled`);
    if (id === "devil") {
      assert.equal(masks[id].accept[MOTION2_CELLS.crouchTrans], false,
        "the devil's quadruped crouch-trans must stay disabled");
      assert.equal(masks[id].accept[MOTION2_CELLS.dashBrake], false,
        "the devil's quadruped dash-brake must stay disabled");
    } else {
      assert.equal(masks[id].accept[MOTION2_CELLS.crouchTrans], true,
        `${id} crouch-trans is a bipedal coil and must stay live`);
      assert.equal(masks[id].accept[MOTION2_CELLS.dashBrake], true,
        `${id} dash-brake is a bipedal lunge and must stay live`);
    }
    // Every rejected cell must carry the reviewer's reason, so a later wave
    // cannot silently re-enable art that measured incompatible.
    for (const cell of manifest.fighters[id].cells) {
      if (cell.accept === false) {
        assert.ok(typeof cell.note === "string" && cell.note.length > 40,
          `${id} cell ${cell.frame} must record why it was rejected`);
      }
    }
  }
  const partial = buildMotionAcceptMasks({
    fighters: { jez: { scale: 1.319, cells: [{ frame: 0, id: "windup-punch", accept: true }] } },
  });
  assert.equal(partial.jez.accept[MOTION2_CELLS.windupPunch], true);
  assert.equal(partial.jez.accept[MOTION2_CELLS.getupB], false);
}

function testFallbackResolution() {
  const pose = motion2Pose(MOTION2_CELLS.dashBrake, "base", 12);
  // Sheet loaded + cell accepted: the motion2 cell holds.
  assert.deepEqual(resolveMotionPose(pose, () => true), pose);
  // Sheet missing / loading / rejected: the exact pre-2.9 cell draws.
  assert.deepEqual(resolveMotionPose(pose, () => false), { bank: "base", frame: 12 });
  // Bank-routed gate: motion2 rejected while motion is fine (and vice versa).
  const routed = resolveMotionPose(pose, (cell, bank) => bank !== "motion2");
  assert.deepEqual(routed, { bank: "base", frame: 12 });
  // Chained fallbacks: a motion2 beat whose pre-2.9 read was a bank-1 cell
  // still degrades all the way to base when both sheets are unavailable.
  const chained = { bank: "motion2", frame: MOTION2_CELLS.thrown, fallback: motionPose(8, "base", 15) };
  assert.deepEqual(resolveMotionPose(chained, () => false), { bank: "base", frame: 15 });
  assert.equal(resolveMotionPose(chained, (cell, bank) => bank === "motion").bank, "motion");
  // Non-motion poses pass through untouched.
  const plain = { bank: "specials", frame: 2 };
  assert.equal(resolveMotionPose(plain, () => false), plain);
}

function testWindupContract() {
  // v2.9 critic round (M2): the anticipation key FILLS the available startup
  // room above a 2-tick minimum — the same shape the 2.8 charge gate uses —
  // instead of the old `Math.min(4, ...)` cap. That cap left long-startup
  // heavies leaking the generic base windup cells for the first ticks of the
  // swing, which on deathblow is his costume-mismatched base(13): five
  // consecutive ticks of tactical trousers and combat boots mid-kick. Only
  // the smear flash is reserved out of the window, and the beat still ends
  // exactly where the smear (or the active window) begins and still picks the
  // cell by limb. Never on lights, crouch or air normals, overheads, the
  // drive heavy, or moves with authored windups.
  for (const id of ROSTER) {
    for (const limb of ["punch", "kick"]) {
      const heavy = createFighterMove(id, "heavy", limb === "kick" ? { limb: "kick" } : {});
      if (!heavy || heavy.animation) continue;
      let windups = 0;
      let lastWindupFrame = -1;
      let firstWindupFrame = -1;
      let firstAfter = null;
      for (let frame = 0; frame <= heavy.totalFrames; frame += 1) {
        const beat = attackMotionBeat(heavy, frame);
        if (beat?.beat === "windup") {
          windups += 1;
          if (firstWindupFrame < 0) firstWindupFrame = frame;
          lastWindupFrame = frame;
          assert.equal(beat.bank, "motion2", `${id} ${limb} windup must come from the motion2 bank`);
          assert.equal(
            beat.cell,
            limb === "kick" ? MOTION2_CELLS.windupKick : MOTION2_CELLS.windupPunch,
            `${id} ${limb} heavy must chamber the matching limb`,
          );
          assert.ok(frame < heavy.activeStartFrame, `${id} windup must re-skin startup ticks only`);
        } else if (lastWindupFrame >= 0 && firstAfter === null && frame > lastWindupFrame) {
          firstAfter = beat;
        }
      }
      assert.ok(windups >= 2,
        `${id} ${limb} heavy windup must hold at least 2 ticks, got ${windups}`);
      // NO VESTIGIAL BASE CELL: the anticipation owns the startup from frame
      // 0, so nothing before the smear/active window falls through to the
      // generic base windup reads.
      assert.equal(firstWindupFrame, 0,
        `${id} ${limb} heavy windup must fill the startup from frame 0, started at ${firstWindupFrame}`);
      // One continuous swing: the windup hands off directly to the smear
      // flash (punch heavies) or the extension (kick heavies — no leg smear
      // exists in the bank-1 grammar).
      // v2.9 final round (T3): kick heavies hand off through the ARC BRIDGE.
      // There is no leg smear anywhere in the four banks, so a kick used to cut
      // from the chambered knee straight to the extension in ONE tick; the two
      // reserved ticks the punch spends on its smear are now spent on a
      // transform arc that keeps the chamber drawing while the body rotates
      // back onto the support leg. Punch heavies are unchanged.
      const handoffOk = firstAfter && (firstAfter.beat === "smear"
        || firstAfter.beat === "extension"
        || (limb === "kick" && firstAfter.beat === "kickArc"));
      assert.ok(handoffOk,
        `${id} ${limb} windup must hand off to smear/extension/kickArc, got ${firstAfter?.beat}`);
    }
  }
  // Never on lights, crouch normals, air normals or the drive heavy.
  for (const move of [
    createFighterMove("deathblow", "light", {}),
    createFighterMove("deathblow", "heavy", { crouching: true }),
    createFighterMove("deathblow", "heavy", { airborne: true }),
    createFighterMove("deathblow", "driveHeavy", {}),
    createFighterMove("deathblow", "heavy", { forwardHeld: true }), // overhead
  ]) {
    for (let frame = 0; frame <= move.totalFrames; frame += 1) {
      assert.notEqual(attackMotionBeat(move, frame)?.beat, "windup",
        `${move.profileId} must never classify a windup beat`);
    }
  }
}

function testAirAttackBeat() {
  // v2.9 critic round (B5): a kit-less air normal is ONE authored pose for its
  // WHOLE window — startup, active and recovery. 2.9 only owned the active
  // band, so the move played grounded standing base cells for ~4 airborne
  // ticks, then base(13) — a HIGH KICK on benny, a costume swap on deathblow
  // — for ~4 more, then snapped to the authored diving strike: the extended
  // limb teleported leg to fist mid-move.
  for (const id of ROSTER) {
    for (const [action, context] of [
      ["light", { airborne: true }],
      ["heavy", { airborne: true }],
      ["heavy", { airborne: true, limb: "kick" }],
    ]) {
      const move = createFighterMove(id, action, context);
      if (!move || move.animation) continue;
      for (let frame = 0; frame <= move.totalFrames; frame += 1) {
        const beat = attackMotionBeat(move, frame);
        assert.equal(beat?.beat, "airAttack", `${id} ${move.profileId} frame ${frame}`);
        assert.equal(beat.bank, "motion2");
        assert.equal(beat.cell, MOTION2_CELLS.airAttack);
      }
      // No grounded beat may ever classify inside an air normal.
      assert.equal(attackMotionBeat(move, 0).beat, "airAttack");
      assert.equal(attackMotionBeat(move, move.activeEndFrame).beat, "airAttack");
    }
  }
  // Grounded normals never classify the air beat.
  const grounded = createFighterMove("jez", "heavy", {});
  for (let frame = 0; frame <= grounded.totalFrames; frame += 1) {
    assert.notEqual(attackMotionBeat(grounded, frame)?.beat, "airAttack");
  }
}

function testGetupSequenceOrdering() {
  // getup-a (knee up) must precede getup-b (half-risen) as the wake-up counter
  // runs down, each carrying the exact pre-2.9 cell as fallback.
  //
  // v2.9 critic round 2 (M3): the track now OPENS on the bank-1 crumple key.
  // The rise END was fixed in round 1 and the START then hard-cut — base:15
  // (flat on his back, a horizontal body) straight to motion2:14 (kneeling,
  // hand on the floor) in ONE tick, ~90 degrees of torso rotation and ~150px
  // of head rise with nothing in between. crumple is the collapse pose, which
  // played in reverse is precisely that missing in-between, and it falls back
  // to the same prone cell so a missing bank changes nothing.
  // Asserted on what DRAWS: resolved with the (not yet authored) motion3 bank
  // reporting absent, which is the shipping configuration.
  const noMotion3 = (cell, bank) => bank !== "motion3";
  const seen = [];
  const prone = { bank: "base", frame: 15 };
  const gather = { bank: "base", frame: 12 };
  for (let frames = 16; frames >= 1; frames -= 1) {
    const pose = resolveMotionPose(wakeupMotionPose(frames), noMotion3);
    assert.ok(pose.bank === "motion2" || pose.bank === "motion",
      `wake-up must stay authored, got ${pose.bank}`);
    const key = `${pose.bank}:${pose.frame}`;
    if (!seen.length || seen.at(-1) !== key) seen.push(key);
    // Every band still degrades to the exact cell the pre-fix read showed: the
    // prone cell while he is down, the crouched gather as he reaches his feet.
    // v3.0: the unified bank sits between the authored key and that base cell
    // (the prone read is its knockdown, the gather is its crouch), so the
    // assertion is on where the chain LANDS with no sheets at all — which is
    // the byte-identical property that actually matters.
    const expected = pose.bank === "motion2" && pose.frame === MOTION2_CELLS.getupB ? gather : prone;
    assert.equal(pose.fallback.bank, "unified");
    assert.deepEqual(pose.fallback.fallback, expected);
    assert.deepEqual(resolveMotionPose(pose.fallback, () => false), expected);
  }
  assert.deepEqual(seen, [
    `motion:${MOTION_CELLS.crumple}`,
    `motion2:${MOTION2_CELLS.getupA}`,
    `motion2:${MOTION2_CELLS.getupB}`,
  ], "wake-up must run crumple then getup-a then getup-b with no interleave");
  // With no sheets at all the track still only ever shows the two cells the
  // pre-2.9 read used — prone while he is down, the crouched gather as he
  // reaches his feet — and never interleaves them.
  const bareSeen = [];
  for (let frames = 16; frames >= 1; frames -= 1) {
    const bare = resolveMotionPose(wakeupMotionPose(frames), () => false);
    assert.deepEqual(bare, frames > 6 ? prone : gather);
    const key = `${bare.bank}:${bare.frame}`;
    if (!bareSeen.length || bareSeen.at(-1) !== key) bareSeen.push(key);
  }
  assert.deepEqual(bareSeen, ["base:15", "base:12"]);
  assert.equal(wakeupMotionPose(0), null);
}

function testDescriptorDeterminism() {
  // Rollback contract: the same snapshotted attack state must produce the
  // same descriptor walk every time, windup/air beats included.
  for (const id of ROSTER) {
    for (const [action, context] of [
      ["heavy", {}], ["heavy", { limb: "kick" }],
      ["light", { airborne: true }], ["heavy", { airborne: true }],
    ]) {
      const move = createFighterMove(id, action, context);
      if (!move) continue;
      const walk = () => {
        const frames = [];
        for (let frame = 0; frame <= move.totalFrames; frame += 1) {
          frames.push(attackAnimationPose(move, frame));
          frames.push(attackMotionBeat(move, frame));
        }
        return frames;
      };
      assert.deepEqual(walk(), walk(), `${id} ${action} motion2 walk must resimulate identically`);
    }
  }
}

// ---------------------------------------------------------------------------
// v2.9 critic round — the BASE-CELL SEMANTIC MAP contract.
//
// These are the tests that would have caught the whole critic round: the base
// bank's frame grammar is not uniform, so no beat may name a raw index.
// ---------------------------------------------------------------------------

function testBaseCellSemanticMap() {
  for (const id of ROSTER) {
    const roles = baseCellRoles(id);
    assert.ok(BASE_CELL_ROLES[id], `${id} must have an inspected entry, not the default`);
    assert.ok(typeof BASE_CELL_ROLES[id].note === "string" && BASE_CELL_ROLES[id].note.length > 20,
      `${id} must record what its cells actually depict`);
    // Shape.
    assert.equal(roles.idle.length, 4, `${id} idle cycle`);
    assert.equal(roles.walk.length, 4, `${id} walk cycle`);
    for (const frame of [...roles.idle, ...roles.walk, roles.guard, roles.crouch, roles.hit]) {
      assert.ok(Number.isInteger(frame) && frame >= 0 && frame < MOTION_CELL_COUNT,
        `${id} role frame ${frame} out of range`);
    }
    assert.ok(roles.crouchAdjust > 0.6 && roles.crouchAdjust <= 1.2, `${id} crouch adjust sane`);

    // THE CONTRACT: no role a non-attack beat consumes may name an attack or
    // an unusable cell. This is the assertion the 2.9 integration needed —
    // base(13) is an attack pose on nine of ten fighters and base(12) a deep
    // squat on six, and both were being handed to reaction/guard beats.
    const reactionRoles = ["guard", "crouch", "stagger", "hit", "secondStrike"];
    for (const role of reactionRoles) {
      const frame = roles[role];
      if (!Number.isInteger(frame)) continue;
      assert.ok(!roles.attack.includes(frame),
        `${id}.${role} resolves to base(${frame}), which the map marks as an ATTACK pose`);
      assert.ok(!roles.unusable.includes(frame),
        `${id}.${role} resolves to base(${frame}), which the map marks UNUSABLE`);
    }
    // Idle and walk cycles are non-attack by definition too.
    for (const frame of [...roles.idle, ...roles.walk]) {
      assert.ok(!roles.attack.includes(frame) && !roles.unusable.includes(frame),
        `${id} locomotion cell ${frame} must not be an attack/unusable pose`);
    }
    // The assumed-uniform index is honestly recorded: base(13) is only a real
    // "second strike" cell on the one sheet that matches the old assumption.
    if (id !== "commissioner") {
      assert.equal(roles.secondStrike, null,
        `${id} has no second-strike cell — base(13) is an attack pose on this sheet`);
    } else {
      assert.equal(roles.secondStrike, 13);
    }
  }
  // deathblow's costume-mismatched cell is the one hard art defect: it must be
  // both flagged and routed away from.
  assert.ok(isBaseUnusableCell("deathblow", 13));
  assert.equal(safeBaseFrame("deathblow", 13), 9);
  assert.ok(!isBaseUnusableCell("benny", 13));
  assert.equal(safeBaseFrame("benny", 13), 13);
}

function testUnusableCellsCanNeverResolve() {
  // The swap runs at the single choke point every consumer reads through, so
  // an unusable cell cannot reach a renderer no matter which beat, fallback
  // chain or bank availability produced it.
  for (const id of ROSTER) {
    const roles = baseCellRoles(id);
    for (const bad of roles.unusable) {
      for (const drawable of [() => true, () => false, (cell, bank) => bank === "motion"]) {
        const direct = resolveMotionPose({ bank: "base", frame: bad }, drawable, id);
        assert.ok(!roles.unusable.includes(direct.frame),
          `${id} direct base(${bad}) leaked through resolveMotionPose`);
        const viaFallback = resolveMotionPose(
          motion2Pose(MOTION2_CELLS.lightHit, "base", bad), drawable, id,
        );
        if (viaFallback.bank === "base") {
          assert.ok(!roles.unusable.includes(viaFallback.frame),
            `${id} base(${bad}) leaked through a motion2 fallback`);
        }
        const chained = resolveMotionPose(
          { bank: "motion2", frame: MOTION2_CELLS.thrown, fallback: motionPose(8, "base", bad) },
          drawable, id,
        );
        if (chained.bank === "base") {
          assert.ok(!roles.unusable.includes(chained.frame),
            `${id} base(${bad}) leaked through a chained fallback`);
        }
      }
    }
  }
  // Passing no fighter id keeps the pre-2.9 pass-through behaviour, so the
  // existing two-argument callers are unaffected.
  assert.deepEqual(resolveMotionPose({ bank: "base", frame: 13 }, () => false),
    { bank: "base", frame: 13 });
}

function testCrouchAndFloorCorrections() {
  // M3: only the measured deep-squat cells carry a correction, and it applies
  // to that cell alone — never to a whole sheet or another bank.
  const oversized = ["deathblow", "post", "donald", "ali", "benny", "devil"];
  for (const id of ROSTER) {
    const roles = baseCellRoles(id);
    const atCrouch = baseCellDrawAdjust(id, "base", roles.crouch);
    if (oversized.includes(id)) {
      assert.ok(atCrouch < 0.95, `${id} oversized crouch cell must be corrected, got ${atCrouch}`);
    } else {
      assert.equal(atCrouch, 1, `${id} crouch cell measured correctly scaled — no correction`);
    }
    // Never leaks onto other cells or the authored banks.
    assert.equal(baseCellDrawAdjust(id, "base", roles.idle[0]), 1);
    assert.equal(baseCellDrawAdjust(id, "motion", roles.crouch), 1);
    assert.equal(baseCellDrawAdjust(id, "motion2", roles.crouch), 1);
  }
  // M5: the Commissioner's base bank is the roster's only registration
  // outlier (measured: content bottoms wander 277-320 where every other sheet
  // in the game is a flat 316). Nothing else may carry offsets.
  assert.deepEqual(auditCellFloorOffsets().errors, []);
  for (const id of ROSTER) {
    for (const bank of ["base", "motion", "motion2"]) {
      for (let frame = 0; frame < MOTION_CELL_COUNT; frame += 1) {
        const offset = cellFloorOffset(id, bank, frame);
        if (id === "commissioner" && bank === "base") continue;
        assert.equal(offset, 0, `${id}/${bank}[${frame}] must not carry a floor offset`);
      }
    }
  }
  // His walk cells are the ones that levitated: they need the largest lifts.
  for (const frame of baseCellRoles("commissioner").walk) {
    assert.ok(cellFloorOffset("commissioner", "base", frame) > 10,
      `commissioner walk cell ${frame} must be planted back onto the floor`);
  }
}

function testWakeupRise() {
  // M4: the rise must be strictly monotonic through the held getup cells —
  // every tick of the 16-frame recovery moves the body — and the final rung
  // must already be reaching standing height so the hand-off is not a jump.
  let previous = -Infinity;
  for (let frames = 16; frames >= 1; frames -= 1) {
    const rise = wakeupRiseTransform(frames, 16);
    assert.ok(rise, `wake-up rise must exist at ${frames}`);
    assert.ok(rise.scaleY > previous, `wake-up must keep rising at ${frames}`);
    previous = rise.scaleY;
    assert.ok(rise.pitch >= 0 && rise.pitch <= 0.31);
  }
  // Starts hunched and low, ends reaching past the held cell's own height.
  assert.ok(wakeupRiseTransform(16, 16).scaleY < 0.95);
  assert.ok(wakeupRiseTransform(1, 16).scaleY > 1.05);
  assert.ok(wakeupRiseTransform(16, 16).pitch > wakeupRiseTransform(1, 16).pitch);
  assert.equal(wakeupRiseTransform(0, 16), null);
}

testManifestAcceptMasks();
testFallbackResolution();
testWindupContract();
testAirAttackBeat();
testGetupSequenceOrdering();
testDescriptorDeterminism();
testBaseCellSemanticMap();
testUnusableCellsCanNeverResolve();
testCrouchAndFloorCorrections();
testWakeupRise();

console.log("Final Blow motion2 bank tests passed");
