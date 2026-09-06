import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SIMULATION_STEP_SECONDS } from "../engine/foundation.mjs";
import { AIR_RECOVERY_RULES, DEFENSE_RULES, FIGHTER_SCALE } from "../engine/defense.mjs";
import {
  MOTION_CELLS,
  MOTION2_CELLS,
  MOTION3_BANK,
  UNIFIED_BANK,
  UNIFIED_CELLS,
  UNIFIED_EXT_BANK,
  UNIFIED_EXT_CELLS,
  UNIFIED_EXT2_BANK,
  UNIFIED_EXT2_CELLS,
  UNIFIED_EXT3_BANK,
  UNIFIED_EXT3_CELLS,
  UNIFIED_EXT4_BANK,
  UNIFIED_EXT4_CELLS,
  UNIFIED_EXT5_BANK,
  UNIFIED_EXT5_CELLS,
  WALK_CELL_COUNT,
  attackAnimationPose,
  attackMotionBeat,
  crouchBlockstunKeys,
  dashKeys,
  getFighterMovement,
  jumpArcKeys,
  throwClinchKeys,
  unifiedExt5Pose,
  bareHandedAttack,
  baseCellRoles,
  beatPoseAt,
  buildMotion3KeyMap,
  buildMotionAcceptMasks,
  buildSwingAcceptMasks,
  buildUnifiedAcceptMasks,
  buildUnifiedExt2AcceptMasks,
  buildUnifiedExtAcceptMasks,
  createFighterMove,
  motion2Pose,
  motionPose,
  resolveMotionPose,
  unifiedPose,
} from "../engine/fighter-kits.mjs";
import { DIZZY_SWAY_TICKS, swingContext, swingResolve } from "../engine/swing-resolve.mjs";

// v5.0 FULL SWING — the resolver between a fighter snapshot and the
// substitution table: the 7-field context, the crouching-normal override and
// the drawable gate with its `alt` fallback. This is the one gate that keeps
// the INVERTED ext4 air-hit cell (head down, feet in the air) off screen.

const testDir = dirname(fileURLToPath(import.meta.url));
const assetDir = join(testDir, "..", "assets");
const readManifest = (bank) => JSON.parse(readFileSync(join(assetDir, bank, "MANIFEST.json"), "utf8"));
const E3 = UNIFIED_EXT3_CELLS;
const E4 = UNIFIED_EXT4_CELLS;
const ALL = () => true;
const NONE = () => false;

/** A grounded, idle fighter snapshot; override what the case needs. */
function snapshot(overrides = {}) {
  return {
    def: { id: "jez" },
    attacking: null,
    attackFrame: 0,
    grounded: true,
    crouch: false,
    hitstunFrames: 0,
    airHitstunFrames: 0,
    pendingKnockdown: false,
    vy: 0,
    ...overrides,
  };
}

/** A kit-less attack instance shaped like the sim's (only the fields the resolver reads). */
function attackLike(overrides = {}) {
  return { limb: "punch", kind: "light", cancelProfileId: "stand-light", animation: null, activeStartFrame: 4, activeEndFrame: 9, ...overrides };
}

function testContextFromSnapshot() {
  // Idle on the floor: nothing set, limb defaults to punch.
  assert.deepEqual(swingContext(snapshot()), {
    limb: "punch", heavy: false, crouching: false, attacking: false, airborne: false,
    victimAirborne: false, falling: false, crouchActive: false,
    bodyBlow: false, reeling: false, ko: false, blocking: false, swayBeat: false,
  });
  // v5.2: the dizzy loop's beat — 12-tick parity of the ELAPSED dizzy /
  // guard-crush clock; the reel owns the first beat (the table checks it
  // first), the slump the even beats, the sway the odd ones.
  assert.equal(DIZZY_SWAY_TICKS, 12);
  const beatAt = (dizzyFrames) => swingContext(snapshot({ dizzyFrames, dizzyTotalFrames: 128 })).swayBeat;
  assert.equal(beatAt(128), false, "elapsed 0");
  assert.equal(beatAt(117), false, "elapsed 11: the reel's last tick");
  assert.equal(beatAt(116), true, "elapsed 12: the first sway beat");
  assert.equal(beatAt(105), true, "elapsed 23");
  assert.equal(beatAt(104), false, "elapsed 24: the slump again");
  assert.equal(beatAt(92), true, "elapsed 36");
  assert.equal(swingContext(snapshot({ dizzyFrames: 116, dizzyTotalFrames: 128 })).reeling, false);
  assert.equal(swingContext(snapshot({ dizzyFrames: 117, dizzyTotalFrames: 128 })).reeling, true, "the reel and the first sway beat do not overlap");
  assert.equal(swingContext(snapshot({ guardCrushFrames: 48, guardCrushTotalFrames: 60 })).swayBeat, true, "a guard crush sways on the same clock (elapsed 12)");
  assert.equal(swingContext(snapshot({ guardCrushFrames: 49, guardCrushTotalFrames: 60 })).swayBeat, false);
  assert.equal(swingContext(snapshot({ dizzyFrames: 100 })).swayBeat, ((128 - 100) / 12 | 0) % 2 === 1, "the STUN_RULES total when the snapshot has none");
  assert.equal(swingContext(snapshot()).swayBeat, false, "no dizzy, no beat");
  assert.equal(swingContext(snapshot({ blockstunFrames: 5 })).blocking, true);
  // v5.1 reaction reads.
  assert.equal(swingContext(snapshot({ hitstunFrames: 6, lastHitLevel: "low" })).bodyBlow, true);
  assert.equal(swingContext(snapshot({ hitstunFrames: 6, lastHitLevel: "mid" })).bodyBlow, false, "a MID jab snaps the head");
  assert.equal(swingContext(snapshot({ hitstunFrames: 6, crouch: true })).bodyBlow, true);
  assert.equal(swingContext(snapshot({ hitstunFrames: 0, crouch: true })).bodyBlow, false, "no hitstun, no body blow");
  assert.equal(swingContext(snapshot({ dizzyFrames: 120, dizzyTotalFrames: 128 })).reeling, true);
  assert.equal(swingContext(snapshot({ dizzyFrames: 60, dizzyTotalFrames: 128 })).reeling, false);
  assert.equal(swingContext(snapshot({ health: 0 }), { roundDecided: true }).ko, true);
  assert.equal(swingContext(snapshot({ health: 0 })).ko, false, "a KO read needs the caller's phase");
  // The stance answers `crouching` while no attack is in flight...
  assert.equal(swingContext(snapshot({ crouch: true })).crouching, true);
  // ...and the ATTACK's cancel profile answers it while one is: a sweep
  // keeps its crouched drawings after the stick comes off down, and a
  // standing jab thrown from a crouch release is a standing jab.
  assert.equal(swingContext(snapshot({ crouch: false, attacking: attackLike({ cancelProfileId: "crouch-light" }) })).crouching, true);
  assert.equal(swingContext(snapshot({ crouch: true, attacking: attackLike({ cancelProfileId: "stand-light" }) })).crouching, false);
  assert.equal(swingContext(snapshot({ crouch: true, attacking: attackLike({ cancelProfileId: undefined }) })).crouching, false);
  // Limb and weight come off the attack.
  const heavyKick = swingContext(snapshot({ attacking: attackLike({ limb: "kick", kind: "heavy", cancelProfileId: "stand-heavy" }) }));
  assert.equal(heavyKick.limb, "kick");
  assert.equal(heavyKick.heavy, true);
  assert.equal(heavyKick.attacking, true);
  assert.equal(swingContext(snapshot({ attacking: attackLike({ kind: "special" }) })).heavy, false);
  assert.equal(swingContext(snapshot({ attacking: attackLike({ limb: undefined }) })).limb, "punch");
  // Airborne attacker: airborne, never a victim.
  const airAttacker = swingContext(snapshot({ grounded: false, attacking: attackLike({ cancelProfileId: "air-light" }) }));
  assert.equal(airAttacker.airborne, true);
  assert.equal(airAttacker.victimAirborne, false);
  assert.equal(airAttacker.falling, false);
  // Airborne victim: any of hitstun / pending knockdown / air hitstun; on
  // the floor none of them counts as airborne.
  for (const hit of [{ hitstunFrames: 3 }, { pendingKnockdown: true }, { airHitstunFrames: 2 }]) {
    assert.equal(swingContext(snapshot({ grounded: false, ...hit })).victimAirborne, true, JSON.stringify(hit));
    assert.equal(swingContext(snapshot({ grounded: true, ...hit })).victimAirborne, false, `${JSON.stringify(hit)} grounded`);
  }
  assert.equal(swingContext(snapshot({ grounded: false })).victimAirborne, false, "a plain jump is not a victim");
  // `falling` is the descent WITH a knockdown pending: not while rising, not
  // in plain air hitstun without the knockdown.
  assert.equal(swingContext(snapshot({ grounded: false, pendingKnockdown: true, vy: 300 })).falling, true);
  assert.equal(swingContext(snapshot({ grounded: false, pendingKnockdown: true, vy: -300 })).falling, false);
  assert.equal(swingContext(snapshot({ grounded: false, pendingKnockdown: true, vy: 0 })).falling, false);
  assert.equal(swingContext(snapshot({ grounded: false, hitstunFrames: 4, vy: 300 })).falling, false);
}

function testCrouchActiveWindow() {
  const crouchJab = attackLike({ cancelProfileId: "crouch-light", activeStartFrame: 4, activeEndFrame: 9 });
  const at = (attackFrame, attacking = crouchJab, extra = {}) => swingContext(snapshot({ attacking, attackFrame, ...extra })).crouchActive;
  assert.equal(at(3), false, "startup");
  assert.equal(at(4), true, "first active tick");
  assert.equal(at(8), true, "last active tick");
  assert.equal(at(9), false, "recovery");
  // Only a KIT-LESS crouching normal: a kit move draws its own art.
  assert.equal(at(5, attackLike({ cancelProfileId: "crouch-light", animation: { bank: "specials", frames: [0, 1, 2, 3] } })), false);
  // Only a crouching one: a standing jab's active window has its motion cell.
  assert.equal(at(5, attackLike({ cancelProfileId: "stand-light" })), false);
  assert.equal(at(5, attackLike({ cancelProfileId: "stand-light" }), { crouch: true }), false, "the stance does not make a standing normal crouching");
  assert.equal(at(5, null), false);
}

function testSubstitutionAndGate() {
  const ctx = { limb: "punch", heavy: false, crouching: false, attacking: true, airborne: false, victimAirborne: false, falling: false, crouchActive: false };
  const punchExt = motionPose(MOTION_CELLS.punchExt, "base", 10);
  // Drawable: the substitute, carrying the resolved pose as its fallback.
  assert.deepEqual(swingResolve(punchExt, ctx, ALL), { bank: UNIFIED_EXT3_BANK, frame: E3.punchExt, fallback: punchExt });
  // Not drawable, no alt: the resolved pose back, the SAME object (timing
  // and identity untouched).
  assert.equal(swingResolve(punchExt, ctx, NONE), punchExt);
  // Nothing in the table: the same object. (v5.2 routed the dash and the
  // airborne tuck, so the tuck on the FLOOR is the example now — and the dash
  // is the ext5 stretch.)
  const tuck = motionPose(MOTION_CELLS.tuck, "base", 13);
  assert.equal(swingResolve(tuck, { ...ctx, attacking: false }, ALL), tuck);
  assert.deepEqual(swingResolve(tuck, { ...ctx, attacking: false, airborne: true }, ALL), { bank: UNIFIED_EXT5_BANK, frame: UNIFIED_EXT5_CELLS.apexTuck, fallback: tuck }, "v5.2: a neutral airborne tuck (the air-tech ball) is the apex tuck");
  const dash = motionPose(MOTION_CELLS.dash, "base", 5);
  assert.deepEqual(swingResolve(dash, ctx, ALL), { bank: UNIFIED_EXT5_BANK, frame: UNIFIED_EXT5_CELLS.dashStretch, fallback: dash });
  const idle = { bank: "base", frame: 0 };
  assert.equal(swingResolve(idle, ctx, ALL), idle);
  // Stance and weight pick the extension.
  assert.equal(swingResolve(punchExt, { ...ctx, heavy: true }, ALL).frame, E3.heavyPunchExt);
  assert.equal(swingResolve(punchExt, { ...ctx, crouching: true }, ALL).frame, E3.crouchPunchExt);
  const kickExt = motionPose(MOTION_CELLS.kickExt, "base", 10);
  assert.equal(swingResolve(kickExt, { ...ctx, limb: "kick" }, ALL).frame, E3.kickExt);
  assert.equal(swingResolve(kickExt, { ...ctx, limb: "kick", heavy: true }, ALL).frame, E3.heavyKickExt);
  assert.equal(swingResolve(kickExt, { ...ctx, limb: "kick", crouching: true }, ALL).frame, E3.sweep);
  // The gate is asked with (frame, bank) — bank-routed, since a substitute
  // may land on unified / ext / ext2, not only the swing sheets.
  const asked = [];
  const crouchTrans = motion2Pose(MOTION2_CELLS.crouchTrans, "base", 12);
  const out = swingResolve(crouchTrans, ctx, (frame, bank) => { asked.push([frame, bank]); return true; });
  assert.deepEqual(asked, [[UNIFIED_CELLS.crouchTrans, UNIFIED_BANK]]);
  assert.equal(out.bank, UNIFIED_BANK);
  const follow = motionPose(MOTION_CELLS.follow, "base", 11);
  assert.deepEqual(swingResolve(follow, { ...ctx, crouching: true }, ALL), { bank: UNIFIED_EXT2_BANK, frame: UNIFIED_EXT2_CELLS.crouchPunchRecover, fallback: follow });
}

function testAltFallback() {
  // The attacker's trail after an air strike is the ext5 air recover (v5.2);
  // behind it, in order, the 5.0 chain — the ext descent where a sheet
  // accepted it (ali), then the chambered air cell for the five 4.0 sheets
  // that never did. An alt is taken ONLY when everything ahead of it cannot
  // draw and it can; the chain is followed as deep as it goes.
  const ctx = { limb: "kick", heavy: false, crouching: false, attacking: true, airborne: true, victimAirborne: false, falling: false, crouchActive: false };
  const airrec = motionPose(MOTION_CELLS.airrec, "base", 13);
  const recover = [UNIFIED_EXT5_CELLS.airRecover, UNIFIED_EXT5_BANK];
  const descent = [UNIFIED_EXT_CELLS.jumpDescend, UNIFIED_EXT_BANK];
  const chamber = [E3.airChamber, UNIFIED_EXT3_BANK];
  const gateOf = (drawableList) => (frame, bank) => drawableList.some(([f, b]) => f === frame && b === bank);
  assert.deepEqual(swingResolve(airrec, ctx, gateOf([recover, descent, chamber])), { bank: UNIFIED_EXT5_BANK, frame: UNIFIED_EXT5_CELLS.airRecover, fallback: airrec }, "primary wins when all draw");
  assert.deepEqual(swingResolve(airrec, ctx, gateOf([descent, chamber])), { bank: UNIFIED_EXT_BANK, frame: UNIFIED_EXT_CELLS.jumpDescend, fallback: airrec }, "the first alt when the recover cannot draw");
  assert.deepEqual(swingResolve(airrec, ctx, gateOf([chamber])), { bank: UNIFIED_EXT3_BANK, frame: E3.airChamber, fallback: airrec }, "the alt's alt when the descent cannot draw either: the 5.0 read");
  assert.equal(swingResolve(airrec, ctx, gateOf([descent])).bank, UNIFIED_EXT_BANK);
  assert.equal(swingResolve(airrec, ctx, gateOf([])), airrec, "none: the motion pose stands");
  // The gate is asked primary first, then down the alt chain, and nothing else.
  const asked = [];
  swingResolve(airrec, ctx, (frame, bank) => { asked.push(`${bank}:${frame}`); return false; });
  assert.deepEqual(asked, [`${UNIFIED_EXT5_BANK}:${UNIFIED_EXT5_CELLS.airRecover}`, `${UNIFIED_EXT_BANK}:${UNIFIED_EXT_CELLS.jumpDescend}`, `${UNIFIED_EXT3_BANK}:${E3.airChamber}`]);
  // A carried juggle victim: the upright air hit, the launched arch behind it.
  const carried = { ...ctx, attacking: false, victimAirborne: true };
  assert.deepEqual(swingResolve(airrec, carried, gateOf([[UNIFIED_EXT5_CELLS.airHitUpright, UNIFIED_EXT5_BANK], [E4.launched, UNIFIED_EXT4_BANK]])).frame, UNIFIED_EXT5_CELLS.airHitUpright);
  assert.deepEqual(swingResolve(airrec, carried, gateOf([[E4.launched, UNIFIED_EXT4_BANK]])), { bank: UNIFIED_EXT4_BANK, frame: E4.launched, fallback: airrec }, "a held sheet keeps the 5.1 arch");
  // A target without an alt never invents one.
  const land = motionPose(MOTION_CELLS.land, "base", 12);
  const askedLand = [];
  assert.equal(swingResolve(land, ctx, (frame, bank) => { askedLand.push(`${bank}:${frame}`); return false; }), land);
  assert.deepEqual(askedLand, [`${UNIFIED_EXT3_BANK}:${E3.land}`]);
}

function testCrouchingNormalOverride() {
  // A crouching normal's active window draws a BASE cell (it never had a
  // motion cell), so the table returns nothing; the resolver stands the
  // crouch extension / sweep in directly, through the same gate.
  const activeCell = { bank: "base", frame: 10 };
  const punch = { limb: "punch", heavy: false, crouching: true, attacking: true, airborne: false, victimAirborne: false, falling: false, crouchActive: true };
  assert.deepEqual(swingResolve(activeCell, punch, ALL), { bank: UNIFIED_EXT3_BANK, frame: E3.crouchPunchExt, fallback: activeCell });
  assert.deepEqual(swingResolve(activeCell, { ...punch, limb: "kick", heavy: true }, ALL), { bank: UNIFIED_EXT3_BANK, frame: E3.sweep, fallback: activeCell });
  // Gated like every other substitute: rejected cell, base drawing stays.
  assert.equal(swingResolve(activeCell, punch, NONE), activeCell);
  // Outside the window nothing happens to the base cell...
  assert.equal(swingResolve(activeCell, { ...punch, crouchActive: false }, ALL), activeCell);
  // ...and the override only ever replaces a BASE cell: a resolved authored
  // cell in the window (the recover key arriving) keeps its own drawing.
  const ext2 = { bank: UNIFIED_EXT2_BANK, frame: UNIFIED_EXT2_CELLS.crouchPunchRecover };
  assert.equal(swingResolve(ext2, punch, ALL), ext2);
  const unrelatedMotion = motionPose(MOTION_CELLS.tuck, "base", 13);
  assert.equal(swingResolve(unrelatedMotion, punch, ALL), unrelatedMotion);
  // The real context derives crouchActive from the attack window, so the
  // override switches on and off with attackFrame.
  const sweep = attackLike({ limb: "kick", kind: "heavy", cancelProfileId: "crouch-heavy", activeStartFrame: 11, activeEndFrame: 18 });
  const base13 = { bank: "base", frame: 13 };
  assert.equal(swingResolve(base13, swingContext(snapshot({ attacking: sweep, attackFrame: 11 })), ALL).frame, E3.sweep);
  assert.equal(swingResolve(base13, swingContext(snapshot({ attacking: sweep, attackFrame: 18 })), ALL), base13);
}

function testAirHitNeverReachesTheScreen() {
  // The ext4 air-hit cell came out INVERTED on every sheet (head down, feet
  // in the air — the read 4.6 took off the floor). It is drawn, and never
  // routed: no bank, no cell, no context, no gate may return it.
  const flags = ["heavy", "crouching", "attacking", "airborne", "victimAirborne", "falling", "crouchActive"];
  const contexts = [];
  for (let bits = 0; bits < 1 << flags.length; bits += 1) {
    for (const limb of ["punch", "kick"]) {
      const ctx = { limb };
      flags.forEach((flag, index) => { ctx[flag] = Boolean(bits & (1 << index)); });
      contexts.push(ctx);
    }
  }
  assert.equal(contexts.length, 256);
  const banks = ["base", "motion", "motion2", "walk", UNIFIED_BANK, UNIFIED_EXT_BANK, UNIFIED_EXT2_BANK, UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK];
  const gates = [ALL, NONE, (frame, bank) => bank === UNIFIED_EXT4_BANK, (frame) => frame === E4.airHit];
  let resolved = 0;
  let substituted = 0;
  for (const bank of banks) {
    for (let frame = 0; frame < 16; frame += 1) {
      const pose = { bank, frame };
      for (const ctx of contexts) {
        for (const gate of gates) {
          const out = swingResolve(pose, ctx, gate);
          resolved += 1;
          // The resolver hands an un-substituted pose back as the SAME
          // object (an ext4:7 input is the descriptor's business, and no
          // descriptor names it); everything it produces itself is checked.
          if (out === pose) continue;
          substituted += 1;
          assert.ok(!(out.bank === UNIFIED_EXT4_BANK && out.frame === E4.airHit), `${bank}:${frame} ${JSON.stringify(ctx)} returned the inverted air-hit cell`);
          // Whatever came back is a substitute the gate accepted, never an
          // ungated cell.
          assert.ok(gate(out.frame, out.bank), `${bank}:${frame} -> ${out.bank}:${out.frame} was not drawable`);
        }
      }
    }
  }
  assert.ok(resolved === banks.length * 16 * 256 * gates.length);
  assert.ok(substituted > 1000, `the sweep actually exercised the table (${substituted} substitutions)`);
  // v5.1 routed the stagger, body blow and KO cells (ext4 routing pass); the
  // air hit (inverted on every sheet) and the floor bounce (feet-up, and no
  // ground-bounce state in the sim) stay unrouted.
  const unrouted = [E4.airHit, E4.floorBounce].filter(Number.isInteger);
  for (const bank of banks) {
    for (let frame = 0; frame < 16; frame += 1) {
      for (const ctx of contexts) {
        const pose = { bank, frame };
        const out = swingResolve(pose, ctx, ALL);
        if (out !== pose && out.bank === UNIFIED_EXT4_BANK) assert.ok(!unrouted.includes(out.frame), `${bank}:${frame} routed unrouted ext4:${out.frame}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The 5.0 frame chains, at node level. MOTION-ATLAS.md v5.0 records what jez
// drew in real play — jab `ext2:0 -> ext3:0 -> ext3:2 -> ext2:1 -> unified:7
// -> idle` and four more. The gate below is built from the SHIPPED manifests
// (so a manifest reject or a table change goes red here), the track pieces
// are the engine's, and the kit-less strike branch of fighterPoseDescriptor
// (game.js) is mirrored in `kitlessStrikePose` — the one piece not yet an
// import (see sweep item #52); testGameMirror pins that the mirror still
// matches the source it mirrors.
// ---------------------------------------------------------------------------
const gameSource = readFileSync(join(testDir, "..", "game.js"), "utf8");

/**
 * v5.2 (ext5-air): the gate for any fighter, from the shipped manifests.
 * `extOverride` stands a synthetic ext acceptance in (deathblow has no ext
 * sheet in 5.1; the parallel ext8 item may give him one), `ext5: false` holds
 * the ext5 sheet, `swing: false` holds ext3/ext4/ext5 together.
 */
function buildGate(id, { extOverride = null, ext5 = true } = {}) {
  const unified = readManifest("unified");
  const main = buildUnifiedAcceptMasks(unified);
  const motion3 = readManifest("motion3");
  const masks = {
    [UNIFIED_BANK]: main,
    [UNIFIED_EXT_BANK]: buildUnifiedExtAcceptMasks(unified, main),
    [UNIFIED_EXT2_BANK]: buildUnifiedExt2AcceptMasks(unified, main),
    [UNIFIED_EXT3_BANK]: buildSwingAcceptMasks(unified, UNIFIED_EXT3_BANK, main),
    [UNIFIED_EXT4_BANK]: buildSwingAcceptMasks(unified, UNIFIED_EXT4_BANK, main),
    [UNIFIED_EXT5_BANK]: buildSwingAcceptMasks(unified, UNIFIED_EXT5_BANK, main),
    motion: buildMotionAcceptMasks(readManifest("motion")),
    motion2: buildMotionAcceptMasks(readManifest("motion2")),
    [MOTION3_BANK]: buildMotionAcceptMasks(motion3, 8),
    walk: buildMotionAcceptMasks(readManifest("walk"), WALK_CELL_COUNT),
  };
  const keyMap = buildMotion3KeyMap(motion3);
  return (cell, bank) => {
    if (bank === UNIFIED_EXT5_BANK && !ext5) return false;
    if (bank === UNIFIED_EXT_BANK && extOverride) return Boolean(extOverride[cell]);
    const mask = masks[bank]?.[id];
    if (!mask) return false;
    if (bank === MOTION3_BANK) {
      const frame = keyMap[cell];
      return Number.isInteger(frame) && mask.accept[frame] ? frame : false;
    }
    if ("whole" in mask && !mask.whole) return false;
    return Boolean(mask.accept[cell]);
  };
}
const buildJezGate = () => buildGate("jez");

const SHORT = { [UNIFIED_BANK]: "unified", [UNIFIED_EXT_BANK]: "ext", [UNIFIED_EXT2_BANK]: "ext2", [UNIFIED_EXT3_BANK]: "ext3", [UNIFIED_EXT4_BANK]: "ext4", [UNIFIED_EXT5_BANK]: "ext5" };
const cellName = (pose) => `${SHORT[pose.bank] || pose.bank}:${pose.frame}`;

/** Mirror of the kit-less strike branch in fighterPoseDescriptor (game.js); animTime 0 so the idle is the held unified cell. */
function kitlessStrikePose(attack, attackFrame, beatOpt, roles) {
  const base = (frame) => ({ bank: "base", frame });
  const uni = (cell, pose) => unifiedPose(cell, pose);
  const idle = () => uni(UNIFIED_CELLS.idle, base(roles.idle[0]));
  const startup = attack.active[0];
  const activeEnd = attack.active[1];
  const time = attackFrame * SIMULATION_STEP_SECONDS;
  const frames = attack.kind === "light" ? [8, 9, 10, 11] : attack.kind === "heavy" ? [8, 13, 13, 11] : [8, 13, 14, 11];
  const beat = attackMotionBeat(attack, attackFrame, beatOpt);
  if (beat?.beat === "windup") return beatPoseAt(beat.keys, beat.phase, base(frames[1]));
  if (beat?.beat === "cock") return beatPoseAt(beat.keys, beat.phase, () => base(time < startup * 0.48 ? frames[0] : frames[1]));
  if (beat?.beat === "kickArc") {
    const arc = motion2Pose(beat.cell, "base", frames[1]);
    return beatOpt?.extended ? { ...arc, fallback: uni(UNIFIED_CELLS.crouchTrans, arc.fallback) } : arc;
  }
  if (beat?.beat === "airAttack") {
    return beatPoseAt(beat.keys, beat.phase, (key) => base(!key || key.at <= 0 ? frames[1] : key.at < 0.9 ? frames[2] : frames[3]));
  }
  if (beat?.beat === "recover") {
    return beatPoseAt(beat.keys, beat.phase, (key) => (
      !key || key.at < 0.46 ? base(frames[3]) : key.at < 0.66 ? uni(UNIFIED_CELLS.guard, base(roles.guard)) : idle()));
  }
  if (beat?.beat === "smear") return motionPose(beat.cell, "base", frames[1]);
  if (beat?.beat === "extension") return motionPose(beat.cell, "base", frames[2]);
  if (time < startup * 0.48) return base(frames[0]);
  if (time < startup) return base(frames[1]);
  if (time <= activeEnd) {
    if (attack.kind !== "light" && (time - startup) / Math.max(0.001, activeEnd - startup) >= 0.67) {
      return beat?.beat === "follow" ? motionPose(beat.cell, "base", frames[3]) : base(frames[3]);
    }
    return base(frames[2]);
  }
  return base(frames[3]);
}

function strikeChain(gate, action, context, id = "jez", beatOpt = Object.freeze({ extended: true, inbetween: true })) {
  const attack = createFighterMove(id, action, context);
  assert.ok(attack && !attack.animation, `${action} ${JSON.stringify(context)} is a kit-less normal`);
  const roles = baseCellRoles(id);
  // jez: ext sheet whole, descent (ext cell 20) NOT accepted, ext2 whole.
  const chain = [];
  const raw = [];
  for (let attackFrame = 0; attackFrame < attack.totalFrames; attackFrame += 1) {
    const pose = kitlessStrikePose(attack, attackFrame, beatOpt, roles);
    const resolved = resolveMotionPose(pose, gate, id, { bareHanded: bareHandedAttack(attack) });
    const fighter = snapshot({
      def: { id }, attacking: attack, attackFrame, grounded: !context.airborne, crouch: Boolean(context.crouching),
    });
    const drawn = swingResolve(resolved, swingContext(fighter), gate);
    if (chain.at(-1) !== cellName(drawn)) chain.push(cellName(drawn));
    if (raw.at(-1) !== cellName(resolved)) raw.push(cellName(resolved));
  }
  return { chain, raw, attack };
}

function testFrameChains() {
  const gate = buildJezGate();
  // The gate reads the shipped manifests: jez's ext descent is the one cell
  // his ext sheet rejected (why the air kick's trail is the chambered alt).
  assert.equal(gate(UNIFIED_EXT_CELLS.jumpDescend, UNIFIED_EXT_BANK), false);
  assert.equal(gate(E3.airChamber, UNIFIED_EXT3_BANK), true);
  assert.equal(gate("air-attack-b", MOTION3_BANK), 4);
  // MOTION-ATLAS.md v5.0, "Verified by frame attribution in real play (jez)".
  // Ordered transitions, not tick counts, so tempo tuning does not break it;
  // the trailing idle (unified:0) is the neutral hand-back.
  const jab = strikeChain(gate, "light", {});
  assert.deepEqual(jab.chain, ["ext2:0", "ext3:0", "ext3:2", "ext2:1", "unified:7", "unified:0"]);
  assert.deepEqual(jab.raw, ["ext2:0", "motion:0", "motion:4", "ext2:1", "unified:7", "unified:0"], "the track itself is untouched: only the drawing changes");
  const heavyKick = strikeChain(gate, "heavy", { limb: "kick" });
  assert.deepEqual(heavyKick.chain, ["ext:6", "ext2:6", "unified:6", "ext3:14", "ext3:11", "ext2:7", "unified:7", "unified:0"]);
  assert.deepEqual(heavyKick.raw, ["ext:6", "ext2:6", "motion2:4", "motion:1", "motion:4", "ext2:7", "unified:7", "unified:0"]);
  const crouchJab = strikeChain(gate, "light", { crouching: true });
  assert.deepEqual(crouchJab.chain, ["ext2:8", "ext3:4", "ext2:9", "unified:7", "unified:0"]);
  assert.deepEqual(crouchJab.raw, ["ext2:8", "base:10", "motion:4", "ext2:9", "unified:7", "unified:0"], "the crouch jab's active window is the base cell the override replaces");
  const sweep = strikeChain(gate, "heavy", { limb: "kick", crouching: true });
  assert.deepEqual(sweep.chain, ["ext2:10", "ext3:5", "ext3:15", "ext2:11", "unified:7", "unified:0"]);
  assert.deepEqual(sweep.raw, ["ext2:10", "base:13", "motion:4", "ext2:11", "unified:7", "unified:0"]);
  // The air kick's landing gather (unified:6) is the landing-recovery branch,
  // outside the attack track; the attack's own chain ends on the land cell.
  // v5.2 (ext5-air): the trail after the strike is the ext5 air recover,
  // never the chambered air cell again — 5.0 read ext3:8 -> ext3:7 ->
  // motion3:4 -> ext3:8 -> ext3:10, a chamber rewind on every air normal.
  const airKick = strikeChain(gate, "light", { limb: "kick", airborne: true });
  assert.deepEqual(airKick.chain, ["ext3:8", "ext3:7", "motion3:4", "ext5:6", "ext3:10"]);
  assert.deepEqual(airKick.raw, ["motion:5", "motion2:13", "motion3:4", "motion:11", "motion:6"]);
  assert.deepEqual(strikeChain(gate, "light", { limb: "punch", airborne: true }).chain, ["ext3:8", "ext3:6", "motion3:4", "ext5:6", "ext3:10"]);
  assert.ok(!airKick.chain.slice(1).includes("ext3:8"), "the chamber is drawn once, at the start");
  // No chain ever draws ext4 (the reaction sheet) on the attacker.
  for (const { chain } of [jab, heavyKick, crouchJab, sweep, airKick]) {
    assert.ok(chain.every((cell) => !cell.startsWith("ext4:")), chain.join(" -> "));
  }
  // Without the swing sheets the jab is byte-identical to the 4.9 read. The
  // heavy kick keeps ONE substitute: the kick arc's compress band lands on
  // the UNIFIED crouch transition, not a swing sheet, so it draws whenever
  // the unified sheet does — which is exactly why the gate is bank-routed.
  const noSwing = (cell, bank) => (bank === UNIFIED_EXT3_BANK || bank === UNIFIED_EXT4_BANK || bank === UNIFIED_EXT5_BANK ? false : gate(cell, bank));
  assert.deepEqual(strikeChain(noSwing, "light", {}).chain, jab.raw);
  assert.deepEqual(strikeChain(noSwing, "heavy", { limb: "kick" }).chain, ["ext:6", "ext2:6", "unified:6", "motion:1", "motion:4", "ext2:7", "unified:7", "unified:0"]);
  // Same for the crouch jab's follow-through: a crouching punch holds its ext2
  // crouched recover instead of the standing follow (which would pop him
  // upright), and ext2 is not a swing sheet either.
  assert.deepEqual(strikeChain(noSwing, "light", { crouching: true }).chain, ["ext2:8", "base:10", "ext2:9", "unified:7", "unified:0"]);
  assert.deepEqual(strikeChain(noSwing, "light", { limb: "kick", airborne: true }).chain, airKick.raw);
  // With only the ext5 sheet held the trail degrades down its alt chain to the
  // exact 5.0 read (jez's ext descent is rejected, so the chamber).
  const noExt5 = (cell, bank) => (bank === UNIFIED_EXT5_BANK ? false : gate(cell, bank));
  assert.deepEqual(strikeChain(noExt5, "light", { limb: "kick", airborne: true }).chain, ["ext3:8", "ext3:7", "motion3:4", "ext3:8", "ext3:10"]);
}

function testGameMirror() {
  // The mirror above must stay the branch it mirrors: pin the lines of the
  // kit-less strike branch in fighterPoseDescriptor that decide the chains.
  const descriptor = gameSource.indexOf("function fighterPoseDescriptor(fighter) {");
  const branchStart = gameSource.indexOf("    const startup = attack.active[0];", descriptor);
  const branchEnd = gameSource.indexOf("\n  if (!fighter.grounded) {", branchStart);
  assert.ok(branchStart > 0 && branchEnd > branchStart, "found the kit-less strike branch");
  const branch = gameSource.slice(branchStart, branchEnd);
  assert.ok(branch.length < 12000, `one branch, not the whole descriptor (${branch.length} chars)`);
  for (const line of [
    'const frames = attack.kind === "light" ? [8, 9, 10, 11]',
    ': attack.kind === "heavy" ? [8, 13, 13, 11]',
    ": [8, 13, 14, 11];",
    "const beat = attackMotionBeat(attack, fighter.attackFrame, beatOpt);",
    'if (beat?.beat === "windup") {',
    "return beatPoseAt(beat.keys, beat.phase, { bank: \"base\", frame: frames[1] });",
    'if (beat?.beat === "cock") {',
    "return beatPoseAt(beat.keys, beat.phase, () => base(time < startup * 0.48 ? frames[0] : frames[1]));",
    'if (beat?.beat === "kickArc") {',
    'const arc = motion2Pose(beat.cell, "base", frames[1]);',
    "return ext ? { ...arc, fallback: uni(UNIFIED_CELLS.crouchTrans, arc.fallback) } : arc",
    'if (beat?.beat === "airAttack") {',
    "frame: !key || key.at <= 0 ? frames[1] : key.at < 0.9 ? frames[2] : frames[3],",
    'if (beat?.beat === "recover") {',
    "if (!key || key.at < 0.46) return base(frames[3]);",
    "if (key.at < 0.66) return uni(UNIFIED_CELLS.guard, base(roles.guard));",
    "return breathingIdle(rolesIdle());",
    'if (beat?.beat === "smear") return motionPose(beat.cell, "base", frames[1]);',
    'if (beat?.beat === "extension") {',
    'return motionPose(beat.cell, "base", frames[2]);',
    "if (time < startup * 0.48) return base(frames[0]);",
    "if (time < startup) return base(frames[1]);",
    "if (time <= activeEnd) {",
    "&& (time - startup) / Math.max(0.001, activeEnd - startup) >= 0.67) {",
    'return beat?.beat === "follow"',
    '? motionPose(beat.cell, "base", frames[3])',
    "return base(frames[2]);",
    "return base(frames[3]);",
  ]) {
    assert.ok(branch.includes(line), `kit-less strike branch still has: ${line}`);
  }
  // And the QA trace hook the browser probe reads the same chains from.
  assert.match(gameSource, /recordPoseTrace\(fighter, pose\);/);
  assert.match(gameSource, /poseTrace\(count = POSE_TRACE_SIZE, side = null\)/);
}

// ---------------------------------------------------------------------------
// v5.2 LOCOMOTION (ext5-ground) — the ground and bookend chains, at node
// level, with the gate from the shipped manifests. MOTION-ATLAS.md v5.2
// records the attributions; the trace mirrors the descriptor sites game.js
// emits directly (the dash branch, the exit tail, the pivot latch, the
// entrance, the showcase, the crouched block) with the engine's own tracks.
// ---------------------------------------------------------------------------
const E5 = UNIFIED_EXT5_CELLS;
const clamp01 = (v) => Math.min(0.999, Math.max(0, v));
const runsOf = (cells) => {
  const runs = [];
  for (const cell of cells) { if (runs.length && runs.at(-1).cell === cell) runs.at(-1).ticks += 1; else runs.push({ cell, ticks: 1 }); }
  return runs.map((r) => `${r.cell} x${r.ticks}`);
};
const drawJez = (gate, pose, fighter, opts = {}) => cellName(swingResolve(resolveMotionPose(pose, gate, "jez", opts), swingContext(fighter, opts), gate));
const jezIdle = () => unifiedPose(UNIFIED_CELLS.idle, { bank: "base", frame: baseCellRoles("jez").idle[0] });

function dashChain(gate, back) {
  const total = back ? getFighterMovement("jez").backDashFrames : getFighterMovement("jez").forwardDashFrames;
  const cells = [drawJez(gate, jezIdle(), snapshot())];
  for (let dashFrames = total; dashFrames > 0; dashFrames -= 1) {
    const pose = beatPoseAt(dashKeys(), clamp01(1 - dashFrames / total), (key) => ({ bank: "base", frame: !key || key.at >= 0.68 ? 12 : 5 }));
    cells.push(drawJez(gate, pose, snapshot()));
  }
  // MOTION_RULES.dashExitFrames ticks of the exit tail, then the idle.
  for (let exit = 4; exit > 0; exit -= 1) cells.push(drawJez(gate, unifiedExt5Pose(E5.dashBrake, motion2Pose(MOTION2_CELLS.dashBrake, "base", 12)), snapshot()));
  cells.push(drawJez(gate, jezIdle(), snapshot()));
  return { runs: runsOf(cells), cells, total };
}

function testExt5GroundChains() {
  const gate = buildJezGate();
  assert.equal(gate(E5.dashLaunch, UNIFIED_EXT5_BANK), true, "jez's ext5 sheet is whole and accepted");
  // THE DASH: 9 forward ticks + 4 exit ticks, every one on the unified
  // family, entered from and exited to unified:0. Before: unified:0 ->
  // motion2:6 -> motion:7 -> motion3:5 -> motion2:6 -> unified:0 (four banks).
  const forward = dashChain(gate, false);
  assert.equal(forward.total, 9);
  assert.deepEqual(forward.runs, ["unified:0 x1", "ext5:0 x2", "ext5:1 x5", "ext5:2 x6", "unified:0 x1"]);
  assert.deepEqual(dashChain(gate, true).runs, ["unified:0 x1", "ext5:0 x2", "ext5:1 x7", "ext5:2 x7", "unified:0 x1"]);
  const noExt5 = (cell, bank) => (bank === UNIFIED_EXT5_BANK ? false : gate(cell, bank));
  assert.deepEqual(dashChain(noExt5, false).runs, ["unified:0 x1", "motion2:6 x2", "motion:7 x2", "motion3:5 x3", "motion2:6 x6", "unified:0 x1"],
    "without the sheet the 5.1 read, tick for tick: the same hold lengths, a different generation");
  // THE PIVOT: the three latch ticks between two idles.
  const pivot = [jezIdle(), ...Array.from({ length: 3 }, () => unifiedExt5Pose(E5.turnaround, motion2Pose(MOTION2_CELLS.turnaround, "base", 0))), jezIdle()]
    .map((pose) => drawJez(gate, pose, snapshot()));
  assert.deepEqual(runsOf(pivot), ["unified:0 x1", "ext5:3 x3", "unified:0 x1"]);
  // THE SUPER CHARGE: the whole charge band on the power charge, then the
  // smear (ext3:3) the super's startup reserves — the kit path.
  const superMove = createFighterMove("jez", "super", {});
  const chargeCells = [];
  for (let attackFrame = 0; attackFrame < superMove.activeStartFrame; attackFrame += 1) {
    const pose = attackAnimationPose(superMove, attackFrame, Object.freeze({ extended: true, inbetween: true }));
    chargeCells.push(drawJez(gate, pose, snapshot({ attacking: superMove, attackFrame }), { bareHanded: bareHandedAttack(superMove) }));
  }
  assert.deepEqual(runsOf(chargeCells), ["ext5:8 x4", "ext3:3 x2"]);
  // THE ENTRANCES, THE WIN AND THE TAUNT: one held cell each, over the
  // motion signature / the showcase rotation.
  assert.equal(drawJez(gate, unifiedExt5Pose(E5.entranceA, motionPose(MOTION_CELLS.sig1, "base", 0)), snapshot()), "ext5:9");
  assert.equal(drawJez(gate, unifiedExt5Pose(E5.entranceB, motionPose(MOTION_CELLS.sig2, "base", 0)), snapshot()), "ext5:10");
  for (const rotation of [{ bank: "specials", frame: 15 }, motionPose(MOTION_CELLS.victory2, "specials", 15), motionPose(MOTION_CELLS.sig2, "specials", 15)]) {
    assert.equal(drawJez(gate, unifiedExt5Pose(E5.victory, rotation), snapshot()), "ext5:11");
    assert.equal(drawJez(gate, unifiedExt5Pose(E5.taunt, rotation), snapshot()), "ext5:12");
  }
  // Off the sheet the rotation is what it was: the kit cell, then the two
  // motion picks — which the table maps onto the same ext5 cells.
  assert.equal(drawJez(noExt5, unifiedExt5Pose(E5.victory, { bank: "specials", frame: 15 }), snapshot()), "specials:15");
  assert.equal(drawJez(noExt5, unifiedExt5Pose(E5.victory, motionPose(MOTION_CELLS.victory2, "specials", 15)), snapshot()), "motion:13");
  assert.equal(drawJez(gate, motionPose(MOTION_CELLS.victory2, "specials", 15), snapshot()), "ext5:11", "the table reaches the win from the motion pick too");
  assert.equal(drawJez(gate, motionPose(MOTION_CELLS.charge, "specials", 0), snapshot()), "ext5:8");
  // THE THROW CLINCH: reach (ext2) -> seize (ext5) -> the hurl band's
  // fallback. Before, the load band drew the unified crouch transition.
  const throwMove = createFighterMove("jez", "throw", {});
  const guard = unifiedPose(UNIFIED_CELLS.guard, { bank: "base", frame: baseCellRoles("jez").guard });
  const clinch = (g) => runsOf(Array.from({ length: 24 }, (_, frame) => drawJez(g, beatPoseAt(throwClinchKeys({ inbetween: true }), clamp01(frame / 24), guard), snapshot({ attacking: throwMove, attackFrame: 4 }))));
  assert.deepEqual(clinch(gate), ["ext2:12 x9", "ext5:14 x7", "unified:7 x8"]);
  assert.deepEqual(clinch(noExt5), ["ext2:12 x9", "unified:6 x7", "unified:7 x8"]);
  // THE DIZZY: the reel, then the slump and the sway alternating every 12
  // ticks for the rest of the 128. Before: ext4:4 x12 -> ext4:5 x116.
  const dizzyCells = [];
  for (let dizzyFrames = 128; dizzyFrames > 0; dizzyFrames -= 1) {
    dizzyCells.push(drawJez(gate, motion2Pose(MOTION2_CELLS.dizzy, "base", 12), snapshot({ dizzyFrames, dizzyTotalFrames: 128 })));
  }
  const dizzyRuns = runsOf(dizzyCells);
  assert.deepEqual(dizzyRuns.slice(0, 4), ["ext4:4 x12", "ext5:15 x12", "ext4:5 x12", "ext5:15 x12"]);
  assert.equal(dizzyRuns.length, 11);
  assert.ok(dizzyRuns.slice(1).every((run, i) => run.startsWith(i % 2 === 0 ? "ext5:15" : "ext4:5")), dizzyRuns.join(" -> "));
  assert.ok(dizzyRuns.every((run) => Number(run.split(" x")[1]) <= 12), "no drawing owns more than one beat");
  assert.deepEqual(runsOf(Array.from({ length: 128 }, (_, i) => drawJez(noExt5, motion2Pose(MOTION2_CELLS.dizzy, "base", 12), snapshot({ dizzyFrames: 128 - i, dizzyTotalFrames: 128 })))),
    ["ext4:4 x12", "ext4:5 x116"], "off the sheet the sway's alt is the slump: the 5.1 loop");
  // THE CROUCHED BLOCK: impact on the flinch, settle on the crouch guard,
  // then the crouch — 8 / 3 / 6 over a 17-tick blockstun. Before: ext3:12
  // x8 -> unified:5 x9.
  const crouch = unifiedPose(UNIFIED_CELLS.crouch, { bank: "base", frame: baseCellRoles("jez").crouch });
  const block = (g, flinch) => runsOf(Array.from({ length: 17 }, (_, i) => {
    const blockstunFrames = 17 - i;
    return drawJez(g, beatPoseAt(crouchBlockstunKeys({ flinch }), clamp01(1 - blockstunFrames / 17), crouch), snapshot({ crouch: true, blockstunFrames }));
  }));
  assert.deepEqual(block(gate, true), ["ext5:13 x8", "ext3:12 x3", "unified:5 x6"]);
  assert.deepEqual(block(gate, false), ["ext3:12 x8", "unified:5 x9"], "ali's read (flinch held): the 5.1 track");
  assert.deepEqual(block(noExt5, true), ["ext3:12 x11", "unified:5 x6"], "why the answer is asked per fighter, not left to the gate");
  // No chain above draws the reaction sheet's inverted cells or an ungated cell.
  for (const cell of [...forward.cells, ...chargeCells, ...dizzyCells]) assert.ok(!["ext4:7", "ext4:11"].includes(cell));
}

// ---------------------------------------------------------------------------
// v5.2 LOCOMOTION (ext5-air) — the AIR chains, at node level, over a
// ballistic model that mirrors the descriptor's airborne branches (game.js:
// the neutral jump arc's progress read, the airborne-victim branch, the
// air-tech flip, the landing-recovery hand-off) with the engine's tracks and
// the gate from the shipped manifests. MOTION-ATLAS.md v5.2 item three
// records these attributions; the physics are the sim's (GRAVITY, dt, the
// devil's glide cap) so the tick counts are the ones a player sees.
// ---------------------------------------------------------------------------
const SIM_FLOOR = 600;
const GRAVITY = Math.round(2180 * FIGHTER_SCALE);
const E = UNIFIED_EXT_CELLS;
const snapFor = (id, over = {}) => snapshot({ def: { id }, ...over });
const drawFor = (id, gate, pose, fighter, opts = {}) => cellName(swingResolve(resolveMotionPose(pose, gate, id, opts), swingContext(fighter, opts), gate));
const idleFor = (id) => unifiedPose(UNIFIED_CELLS.idle, { bank: "base", frame: baseCellRoles(id).idle[0] });
const landingFor = () => unifiedPose(UNIFIED_CELLS.crouchTrans, motion2Pose(MOTION2_CELLS.crouchTrans, "base", 12));
const runsJoined = (cells) => runsOf(cells).join(" -> ");
/** Mirror of game.js: the ONE capability answer per pose (ext / descend / air). */
function capabilityFor(id, gate) {
  const ext = gate(E.jumpAscent, UNIFIED_EXT_BANK) || gate(E.idleBreathe, UNIFIED_EXT_BANK);
  const descend = ext && gate(E.jumpDescend, UNIFIED_EXT_BANK);
  const air = gate(E5.apexTuck, UNIFIED_EXT5_BANK) && gate(E5.descent, UNIFIED_EXT5_BANK) && gate(E5.airRecover, UNIFIED_EXT5_BANK);
  const o = {};
  if (ext) o.extended = true;
  if (descend) o.descend = true;
  if (air) o.air = true;
  return Object.keys(o).length ? Object.freeze(o) : undefined;
}
function arcProgress(id, y, vy) {
  const launch = getFighterMovement(id).jumpVelocityY || -720;
  const apex = (launch * launch) / (2 * GRAVITY);
  const height = Math.max(0, SIM_FLOOR - y);
  return vy < 0 ? 0.5 * (1 - clamp01(Math.max(0, vy / launch))) : 0.5 + 0.5 * clamp01(1 - height / Math.max(1, apex));
}
const arcPose = (id, extOpt, y, vy) => beatPoseAt(jumpArcKeys(id === "donald" ? 0.06 : 0.22, extOpt), arcProgress(id, y, vy), (key) => ({ bank: "base", frame: !key || key.at < 0.76 ? 13 : 12 }));
/** One physics tick; the devil's glide cap applies only to a CONTROLLED airborne body (never a victim). */
function fallStep(id, y, vy, controlled = true) {
  const cap = controlled ? getFighterMovement(id).glideFallCap : 0;
  let next = vy + GRAVITY * SIMULATION_STEP_SECONDS;
  if (cap > 0 && next > cap) next = cap;
  return [y + next * SIMULATION_STEP_SECONDS, next];
}
/** The neutral jump: idle, takeoff to touchdown through the arc, the landing recovery, the idle. */
function jumpTrace(id, gate, extOpt = capabilityFor(id, gate)) {
  let y = SIM_FLOOR;
  let vy = getFighterMovement(id).jumpVelocityY || -720;
  const cells = [drawFor(id, gate, idleFor(id), snapFor(id))];
  for (;;) {
    [y, vy] = fallStep(id, y, vy);
    if (y >= SIM_FLOOR) break;
    cells.push(drawFor(id, gate, arcPose(id, extOpt, y, vy), snapFor(id, { grounded: false, vy })));
  }
  for (let i = 0; i < DEFENSE_RULES.landingRecoveryFrames; i += 1) cells.push(drawFor(id, gate, landingFor(), snapFor(id)));
  cells.push(drawFor(id, gate, idleFor(id), snapFor(id)));
  return runsJoined(cells);
}
/** An air normal, chamber to land, then the air-attack landing recovery, then the idle. */
function airNormalTrace(id, gate, limb, extOpt = capabilityFor(id, gate)) {
  const attack = createFighterMove(id, "light", { limb, airborne: true });
  const beatOpt = Object.freeze({ ...(extOpt || {}), inbetween: gate(0, UNIFIED_EXT2_BANK) });
  const cells = [];
  for (let attackFrame = 0; attackFrame < attack.totalFrames; attackFrame += 1) {
    const pose = kitlessStrikePose(attack, attackFrame, beatOpt, baseCellRoles(id));
    cells.push(drawFor(id, gate, pose, snapFor(id, { attacking: attack, attackFrame, grounded: false, vy: 200 }), { bareHanded: bareHandedAttack(attack) }));
  }
  for (let i = 0; i < DEFENSE_RULES.airAttackLandingRecoveryFrames; i += 1) cells.push(drawFor(id, gate, landingFor(), snapFor(id)));
  cells.push(drawFor(id, gate, idleFor(id), snapFor(id)));
  return runsJoined(cells);
}
/** A launched victim carried to the floor: the descriptor's airborne-victim branch. */
function juggleTrace(id, gate, launchVy = -610) {
  const roles = baseCellRoles(id);
  let y = SIM_FLOOR;
  let vy = launchVy;
  const cells = [];
  for (;;) {
    [y, vy] = fallStep(id, y, vy, false);
    if (y >= SIM_FLOOR) break;
    const fighter = snapFor(id, { grounded: false, vy, hitstunFrames: 30, airHitstunFrames: 30, pendingKnockdown: true });
    const pose = vy > 0 && SIM_FLOOR - y < 55 ? motionPose(MOTION_CELLS.crumple, "base", roles.down)
      : vy < -120 ? unifiedPose(UNIFIED_CELLS.bigHit, motionPose(MOTION_CELLS.bighit, "base", roles.down))
        : motionPose(MOTION_CELLS.airrec, "base", roles.down);
    cells.push(drawFor(id, gate, pose, fighter));
  }
  return runsJoined(cells);
}
/** An air tech out of a carry: the flip's ball and tail, the neutral fall, the landing tax, the idle. */
function airTechTrace(id, gate, extOpt = capabilityFor(id, gate)) {
  let y = SIM_FLOOR - 220;
  let vy = Math.min(60, AIR_RECOVERY_RULES.liftVelocityY);
  let flip = AIR_RECOVERY_RULES.flipFrames;
  const cells = [];
  for (;;) {
    [y, vy] = fallStep(id, y, vy);
    if (y >= SIM_FLOOR) break;
    const fighter = snapFor(id, { grounded: false, vy, airTechFlipFrames: flip });
    let pose;
    if (flip > 0) {
      pose = 1 - flip / AIR_RECOVERY_RULES.flipFrames < 0.6 ? motionPose(MOTION_CELLS.tuck, "base", 13) : motionPose(MOTION_CELLS.airrec, "base", 13);
      flip -= 1;
    } else {
      pose = arcPose(id, extOpt, y, vy);
    }
    cells.push(drawFor(id, gate, pose, fighter));
  }
  for (let i = 0; i < DEFENSE_RULES.airAttackLandingRecoveryFrames; i += 1) cells.push(drawFor(id, gate, landingFor(), snapFor(id)));
  cells.push(drawFor(id, gate, idleFor(id), snapFor(id)));
  return runsJoined(cells);
}
const holdsOf = (runs) => runs.split(" -> ").map((r) => Number(r.split(" x")[1]));
const banksOf = (runs) => runs.split(" -> ").map((r) => r.split(":")[0]);

function testExt5AirChains() {
  const jez = buildGate("jez");
  const jezNo5 = buildGate("jez", { ext5: false });
  assert.deepEqual(capabilityFor("jez", jez), { extended: true, air: true });
  // THE PLAIN JUMP, jez: one family from takeoff to touchdown, the same
  // seven airborne holds the 5.1 read had, tick for tick — rise, ascent,
  // tuck (un-retired), apex tuck, descent, air recover, gather, then the
  // unified crouch transition of the landing recovery and the idle.
  const jump = jumpTrace("jez", jez);
  assert.equal(jump, "unified:0 x1 -> unified:8 x3 -> ext:3 x4 -> unified:9 x6 -> ext5:4 x4 -> ext5:5 x5 -> ext5:6 x8 -> ext3:10 x7 -> unified:6 x7 -> unified:0 x1");
  const jumpBefore = jumpTrace("jez", jezNo5);
  assert.equal(jumpBefore, "unified:0 x1 -> unified:8 x3 -> ext:3 x4 -> motion:5 x6 -> motion3:2 x4 -> motion3:3 x5 -> ext3:8 x8 -> ext3:10 x7 -> unified:6 x7 -> unified:0 x1",
    "without the sheet the 5.1 read exactly (the capability answer is off, so the rise and tuck stay retired)");
  assert.deepEqual(holdsOf(jump), holdsOf(jumpBefore), "a same-generation cell replaces a drawing and never changes timing");
  assert.ok(banksOf(jump).every((b) => ["unified", "ext", "ext3", "ext5"].includes(b)), "no motion cell left on the arc");
  assert.ok(Math.max(...holdsOf(jump).slice(1, -2)) <= 8, "every airborne hold inside the budget");
  // DEATHBLOW, both accept states: no ext sheet (5.1) and with one (the
  // parallel ext8 item may hand him one — traced with the ascent accepted
  // and the descent held, the 4.0 shape, and with both).
  // 5.2 ext8 gave deathblow a real ext sheet; the 5.1 shape (no ext) is
  // pinned through an explicit rejection so both reads stay covered.
  const db = buildGate("deathblow", { extOverride: {} });
  assert.deepEqual(capabilityFor("deathblow", db), { air: true });
  assert.equal(jumpTrace("deathblow", db), "unified:0 x1 -> unified:8 x6 -> unified:9 x6 -> ext5:4 x3 -> ext5:5 x4 -> ext5:6 x8 -> ext3:10 x6 -> unified:6 x7 -> unified:0 x1");
  assert.equal(jumpTrace("deathblow", buildGate("deathblow", { ext5: false, extOverride: {} })), "unified:0 x1 -> motion2:7 x6 -> motion:5 x9 -> ext3:8 x12 -> ext3:10 x6 -> unified:6 x7 -> unified:0 x1",
    "5.1: no motion3 on his sheet, so the tuck held 9 and the chamber 12");
  const dbExt = buildGate("deathblow", { extOverride: { [E.idleBreathe]: 1, [E.jumpAscent]: 1 } });
  assert.deepEqual(capabilityFor("deathblow", dbExt), { extended: true, air: true });
  assert.equal(jumpTrace("deathblow", dbExt), "unified:0 x1 -> unified:8 x3 -> ext:3 x3 -> unified:9 x6 -> ext5:4 x3 -> ext5:5 x4 -> ext5:6 x8 -> ext3:10 x6 -> unified:6 x7 -> unified:0 x1");
  const dbDescend = buildGate("deathblow", { extOverride: { [E.idleBreathe]: 1, [E.jumpAscent]: 1, [E.jumpDescend]: 1 } });
  assert.equal(jumpTrace("deathblow", dbDescend), "unified:0 x1 -> unified:8 x3 -> ext:3 x3 -> unified:9 x6 -> ext:4 x3 -> ext5:5 x4 -> ext5:6 x8 -> ext3:10 x6 -> unified:6 x7 -> unified:0 x1",
    "with a real descent of his own it takes the fall band, as ali's does");
  // The REAL 5.2 gate: his composed ext sheet accepts the ascent and the
  // feet-first descent, so he reads exactly like the synthetic descend case.
  const dbReal = buildGate("deathblow");
  assert.deepEqual(capabilityFor("deathblow", dbReal), { extended: true, descend: true, air: true });
  assert.equal(jumpTrace("deathblow", dbReal), jumpTrace("deathblow", dbDescend), "the shipped ext sheet gives him the descend chain");
  // ALI keeps his own cell 20 where 4.1 put it; the ext5 descent follows it,
  // and the 5.1 rewind (ext:4 -> motion3:3 -> ext:4) is gone.
  const ali = buildGate("ali");
  assert.deepEqual(capabilityFor("ali", ali), { extended: true, descend: true, air: true });
  assert.equal(jumpTrace("ali", ali), "unified:0 x1 -> unified:8 x3 -> ext:3 x4 -> unified:9 x6 -> ext:4 x4 -> ext5:5 x5 -> ext5:6 x8 -> ext3:10 x7 -> unified:6 x7 -> unified:0 x1");
  assert.equal(jumpTrace("ali", buildGate("ali", { ext5: false })), "unified:0 x1 -> unified:8 x3 -> ext:3 x4 -> unified:9 x6 -> ext:4 x4 -> motion3:3 x5 -> ext:4 x8 -> ext3:10 x7 -> unified:6 x7 -> unified:0 x1");
  // THE DEVIL: a glide cap on the fall (longer descent holds, exactly as
  // long as 5.1's). 5.2 ext8 gave him an ext sheet too, so his rise/ascent
  // and his own feet-first descent lead into the ext5 descent and recover;
  // the no-ext read of the same arc is pinned through an explicit rejection.
  const devil = buildGate("devil");
  assert.equal(jumpTrace("devil", devil), "unified:0 x1 -> unified:8 x3 -> ext:3 x4 -> unified:9 x6 -> ext:4 x4 -> ext5:5 x4 -> ext5:6 x9 -> ext3:10 x11 -> unified:6 x7 -> unified:0 x1");
  assert.equal(jumpTrace("devil", buildGate("devil", { extOverride: {} })), "unified:0 x1 -> unified:8 x7 -> unified:9 x6 -> ext5:4 x4 -> ext5:5 x4 -> ext5:6 x9 -> ext3:10 x11 -> unified:6 x7 -> unified:0 x1");
  assert.deepEqual(holdsOf(jumpTrace("devil", devil)), holdsOf(jumpTrace("devil", buildGate("devil", { ext5: false }))));
  // AIR NORMALS: the trail after the strike is the air recover on every
  // fighter, and the chamber is drawn once. jez / ali / the devil carry the
  // motion3 second strike body; deathblow does not.
  assert.equal(airNormalTrace("jez", jez, "kick"), "ext3:8 x5 -> ext3:7 x4 -> motion3:4 x4 -> ext5:6 x5 -> ext3:10 x4 -> unified:6 x11 -> unified:0 x1");
  assert.equal(airNormalTrace("jez", jezNo5, "kick"), "ext3:8 x5 -> ext3:7 x4 -> motion3:4 x4 -> ext3:8 x5 -> ext3:10 x4 -> unified:6 x11 -> unified:0 x1", "5.0: the chamber rewind");
  assert.equal(airNormalTrace("jez", jez, "punch"), "ext3:8 x5 -> ext3:6 x5 -> motion3:4 x3 -> ext5:6 x5 -> ext3:10 x3 -> unified:6 x11 -> unified:0 x1");
  assert.equal(airNormalTrace("deathblow", db, "kick"), "ext3:8 x5 -> ext3:7 x8 -> ext5:6 x5 -> ext3:10 x4 -> unified:6 x11 -> unified:0 x1");
  assert.equal(airNormalTrace("ali", ali, "kick"), "ext3:8 x5 -> ext3:7 x4 -> motion3:4 x4 -> ext5:6 x5 -> ext3:10 x4 -> unified:6 x11 -> unified:0 x1");
  assert.equal(airNormalTrace("ali", buildGate("ali", { ext5: false }), "kick"), "ext3:8 x5 -> ext3:7 x4 -> motion3:4 x4 -> ext:4 x5 -> ext3:10 x4 -> unified:6 x11 -> unified:0 x1", "ali's 5.0 trail was his own descent");
  assert.equal(airNormalTrace("devil", devil, "punch"), "ext3:8 x5 -> ext3:6 x5 -> motion3:4 x3 -> ext5:6 x5 -> ext3:10 x3 -> unified:6 x11 -> unified:0 x1");
  for (const id of ["jez", "deathblow", "ali", "devil"]) {
    for (const limb of ["kick", "punch"]) {
      const runs = airNormalTrace(id, buildGate(id), limb).split(" -> ");
      assert.equal(runs.filter((r) => r.startsWith("ext3:8")).length, 1, `${id} ${limb}: the chamber is drawn once`);
      assert.ok(runs.some((r) => r.startsWith("ext5:6")), `${id} ${limb}: the trail is the air recover`);
    }
  }
  // A JUGGLE HIT: the launch opener keeps the ext4 arch while rising fast,
  // the CARRY (hanging at the top) is the ext5 upright air hit, the fall
  // with the knockdown pending is ext4:10, the last 55px the crumple.
  for (const id of ["jez", "deathblow", "ali", "devil"]) {
    assert.equal(juggleTrace(id, buildGate(id)), "ext4:6 x11 -> ext5:7 x3 -> ext4:10 x6 -> ext4:9 x8", id);
    assert.equal(juggleTrace(id, buildGate(id, { ext5: false })), "ext4:6 x14 -> ext4:10 x6 -> ext4:9 x8", `${id}: 5.1, the arch through the carry`);
  }
  // AN AIR TECH: the flip's ball is the apex tuck, its tail the air recover,
  // then the neutral fall on the family, the landing tax, the idle.
  assert.equal(airTechTrace("jez", jez), "ext5:4 x8 -> ext5:6 x4 -> ext5:5 x11 -> ext5:6 x4 -> ext3:10 x4 -> unified:6 x11 -> unified:0 x1");
  assert.equal(airTechTrace("jez", jezNo5), "motion:5 x8 -> ext3:8 x4 -> motion3:3 x11 -> ext3:8 x4 -> ext3:10 x4 -> unified:6 x11 -> unified:0 x1", "5.1: three banks in one fall");
  assert.equal(airTechTrace("deathblow", db), "ext5:4 x8 -> ext5:6 x4 -> ext5:5 x13 -> ext5:6 x2 -> ext3:10 x4 -> unified:6 x11 -> unified:0 x1");
  assert.equal(airTechTrace("ali", ali), "ext5:4 x8 -> ext5:6 x4 -> ext5:5 x11 -> ext5:6 x3 -> ext3:10 x5 -> unified:6 x11 -> unified:0 x1");
  assert.equal(airTechTrace("devil", devil), "ext5:4 x8 -> ext5:6 x4 -> ext5:5 x18 -> ext5:6 x7 -> ext3:10 x12 -> unified:6 x11 -> unified:0 x1");
  // Nothing above draws the inverted ext4 cells; every air chain runs the
  // same number of ticks as its 5.1 read, and on a fighter with the motion3
  // keys (jez, ali, the devil) its holds ARE the 5.1 holds. deathblow has no
  // motion3 sheet, so the ext5 cells fill the two slots his arc left empty
  // and his holds only shorten (9 + 12 -> 6 + 3 + 4 + 8).
  const sum = (a) => a.reduce((t, n) => t + n, 0);
  for (const id of ["jez", "deathblow", "ali", "devil"]) {
    const g = buildGate(id), n = buildGate(id, { ext5: false });
    for (const [a, b] of [[jumpTrace(id, g), jumpTrace(id, n)], [airTechTrace(id, g), airTechTrace(id, n)], [airNormalTrace(id, g, "kick"), airNormalTrace(id, n, "kick")]]) {
      assert.ok(!/ext4:(7|11) /.test(`${a} `), a);
      assert.equal(sum(holdsOf(a)), sum(holdsOf(b)), `${id}: the same ticks`);
      assert.ok(Math.max(...holdsOf(a)) <= Math.max(...holdsOf(b)), `${id}: the air cells never lengthen a hold — ${a} against ${b}`);
      if (id !== "deathblow") assert.deepEqual(holdsOf(a), holdsOf(b), `${id}: ${a} against ${b}`);
    }
  }
  // The descriptor sites this trace mirrors, pinned in game.js.
  assert.match(gameSource, /const air = unifiedFighterAirReady\(fighter\.def\.id\);/);
  assert.match(gameSource, /\? \(air \? EXTENDED_DESCEND_AIR : EXTENDED_DESCEND\)\s*\n\s*: \(air \? EXTENDED_AIR : EXTENDED\)\)\s*\n\s*: \(air \? AIR : undefined\);/);
  assert.match(gameSource, /function unifiedFighterAirReady\(fighterId\) \{\s*\n\s*return swingCellDrawable\(fighterId, UNIFIED_EXT5_CELLS\.apexTuck, UNIFIED_EXT5_BANK\)\s*\n\s*&& swingCellDrawable\(fighterId, UNIFIED_EXT5_CELLS\.descent, UNIFIED_EXT5_BANK\)\s*\n\s*&& swingCellDrawable\(fighterId, UNIFIED_EXT5_CELLS\.airRecover, UNIFIED_EXT5_BANK\);/);
  assert.match(gameSource, /return beatPoseAt\(jumpArcKeys\(bandStart, extOpt\), progress, \(key\) => \(\s*\n[^\n]*\n\s*!key \|\| key\.at < 0\.76 \? base\(13\) : base\(12\)/);
  assert.match(gameSource, /if \(fighter\.landingRecoveryFrames > 0\) \{\s*\n\s*return uni\(UNIFIED_CELLS\.crouchTrans, motion2Pose\(MOTION2_CELLS\.crouchTrans, "base", 12\)\);/);
  assert.match(gameSource, /return flip < 0\.6\s*\n\s*\? motionPose\(MOTION_CELLS\.tuck, "base", 13\)\s*\n\s*: motionPose\(MOTION_CELLS\.airrec, "base", 13\);/);
}

// v5.2 — THE DEVIL'S HEAVY WIND-UP LANDS ON HIS OWN COMPRESS, NOT HIS CLAW
// LUNGE. His motion2:4 (crouch-trans) is rejected — an all-fours prowl — so the
// compress band's chain never RESOLVED motion2:4, the 5.0 substitution onto
// unified:6 never fired, and both the band and the kick arc that continues it
// fell through to the caller's base fallback: base 13, his AIRBORNE claw
// lunge, for the last 30% of every heavy wind-up on the street. With his ext
// sheet the band keys unified:6 under the bridge and the arc degrades the
// same way, so his chain is the shape everyone else's is.
// ---------------------------------------------------------------------------
function testDevilCompressBand() {
  const gate = buildGate("devil");
  assert.equal(gate(MOTION2_CELLS.crouchTrans, "motion2"), false, "the devil's motion2 crouch-trans is rejected");
  assert.equal(gate(UNIFIED_CELLS.crouchTrans, UNIFIED_BANK), true);
  assert.equal(gate(UNIFIED_EXT_CELLS.kickWindup, UNIFIED_EXT_BANK), true, "the devil carries an ext sheet as of 5.2");
  const withExt = Object.freeze({ extended: true, inbetween: true });
  for (const limb of ["punch", "kick"]) {
    const { chain, raw } = strikeChain(gate, "heavy", { limb }, "devil", withExt);
    assert.ok(!raw.includes("base:13") && !chain.includes("base:13"),
      `devil heavy ${limb} still draws his airborne claw lunge: ${raw.join(" -> ")}`);
    assert.ok(raw.includes("unified:6"), `devil heavy ${limb} must compress on his own crouch transition: ${raw.join(" -> ")}`);
    assert.equal(raw[0], `ext:${limb === "kick" ? UNIFIED_EXT_CELLS.kickWindup : UNIFIED_EXT_CELLS.punchWindup}`, "the cock opens on his own chamber");
  }
  assert.deepEqual(strikeChain(gate, "heavy", { limb: "kick" }, "devil", withExt).raw,
    ["ext:6", "ext2:6", "unified:6", "motion:1", "motion:4", "ext2:7", "unified:7", "unified:0"]);
  // Without the ext sheet (what he shipped through 5.1) the arrays are the
  // 4.9 ones and the lunge is back — pinned so the fix is known to be the
  // ext branch and nothing else moved.
  const noExt = Object.freeze({ inbetween: true });
  const before = strikeChain(gate, "heavy", { limb: "kick" }, "devil", noExt).raw;
  assert.ok(before.includes("base:13"), `expected the 4.9 read to show the lunge: ${before.join(" -> ")}`);
  // The other nine resolve motion2:4 and are substituted onto unified:6 as
  // before; the extra link under the bridge never reaches them.
  assert.deepEqual(strikeChain(buildGate("jez"), "heavy", { limb: "kick" }).raw,
    ["ext:6", "ext2:6", "motion2:4", "motion:1", "motion:4", "ext2:7", "unified:7", "unified:0"]);
}

testContextFromSnapshot();
testCrouchActiveWindow();
testSubstitutionAndGate();
testAltFallback();
testCrouchingNormalOverride();
testAirHitNeverReachesTheScreen();
testFrameChains();
testGameMirror();
testExt5GroundChains();
testExt5AirChains();

console.log("Final Blow swing resolver tests passed");
testDevilCompressBand();
