import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SIMULATION_STEP_SECONDS } from "../engine/foundation.mjs";
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
  WALK_CELL_COUNT,
  attackMotionBeat,
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
import { swingContext, swingResolve } from "../engine/swing-resolve.mjs";

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
    bodyBlow: false, reeling: false, ko: false, blocking: false,
  });
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
  // Nothing in the table: the same object.
  const dash = motionPose(MOTION_CELLS.dash, "base", 5);
  assert.equal(swingResolve(dash, ctx, ALL), dash);
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
  // The attacker's trail after an air strike is the ext descent; five 4.0
  // sheets never accepted their descent, and for those the chambered air
  // cell is the same-generation trail. The alt is taken ONLY when the
  // primary cannot draw and the alt can.
  const ctx = { limb: "kick", heavy: false, crouching: false, attacking: true, airborne: true, victimAirborne: false, falling: false, crouchActive: false };
  const airrec = motionPose(MOTION_CELLS.airrec, "base", 13);
  const descent = [UNIFIED_EXT_CELLS.jumpDescend, UNIFIED_EXT_BANK];
  const chamber = [E3.airChamber, UNIFIED_EXT3_BANK];
  const gateOf = (drawableList) => (frame, bank) => drawableList.some(([f, b]) => f === frame && b === bank);
  assert.deepEqual(swingResolve(airrec, ctx, gateOf([descent, chamber])), { bank: UNIFIED_EXT_BANK, frame: UNIFIED_EXT_CELLS.jumpDescend, fallback: airrec }, "primary wins when both draw");
  assert.deepEqual(swingResolve(airrec, ctx, gateOf([chamber])), { bank: UNIFIED_EXT3_BANK, frame: E3.airChamber, fallback: airrec }, "alt when the descent cannot draw");
  assert.equal(swingResolve(airrec, ctx, gateOf([descent])).bank, UNIFIED_EXT_BANK);
  assert.equal(swingResolve(airrec, ctx, gateOf([])), airrec, "neither: the motion pose stands");
  // The gate is asked primary first, then alt, and nothing else.
  const asked = [];
  swingResolve(airrec, ctx, (frame, bank) => { asked.push(`${bank}:${frame}`); return false; });
  assert.deepEqual(asked, [`${UNIFIED_EXT_BANK}:${UNIFIED_EXT_CELLS.jumpDescend}`, `${UNIFIED_EXT3_BANK}:${E3.airChamber}`]);
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
  const unrelatedMotion = motionPose(MOTION_CELLS.dash, "base", 5);
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

function buildJezGate() {
  const unified = readManifest("unified");
  const main = buildUnifiedAcceptMasks(unified);
  const motion3 = readManifest("motion3");
  const masks = {
    [UNIFIED_BANK]: main,
    [UNIFIED_EXT_BANK]: buildUnifiedExtAcceptMasks(unified, main),
    [UNIFIED_EXT2_BANK]: buildUnifiedExt2AcceptMasks(unified, main),
    [UNIFIED_EXT3_BANK]: buildSwingAcceptMasks(unified, UNIFIED_EXT3_BANK, main),
    [UNIFIED_EXT4_BANK]: buildSwingAcceptMasks(unified, UNIFIED_EXT4_BANK, main),
    motion: buildMotionAcceptMasks(readManifest("motion")),
    motion2: buildMotionAcceptMasks(readManifest("motion2")),
    [MOTION3_BANK]: buildMotionAcceptMasks(motion3, 8),
    walk: buildMotionAcceptMasks(readManifest("walk"), WALK_CELL_COUNT),
  };
  const keyMap = buildMotion3KeyMap(motion3);
  return (cell, bank) => {
    const mask = masks[bank]?.jez;
    if (!mask) return false;
    if (bank === MOTION3_BANK) {
      const frame = keyMap[cell];
      return Number.isInteger(frame) && mask.accept[frame] ? frame : false;
    }
    if ("whole" in mask && !mask.whole) return false;
    return Boolean(mask.accept[cell]);
  };
}

const SHORT = { [UNIFIED_BANK]: "unified", [UNIFIED_EXT_BANK]: "ext", [UNIFIED_EXT2_BANK]: "ext2", [UNIFIED_EXT3_BANK]: "ext3", [UNIFIED_EXT4_BANK]: "ext4" };
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
  if (beat?.beat === "kickArc") return motion2Pose(beat.cell, "base", frames[1]);
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

function strikeChain(gate, action, context) {
  const attack = createFighterMove("jez", action, context);
  assert.ok(attack && !attack.animation, `${action} ${JSON.stringify(context)} is a kit-less normal`);
  const roles = baseCellRoles("jez");
  // jez: ext sheet whole, descent (ext cell 20) NOT accepted, ext2 whole.
  const beatOpt = Object.freeze({ extended: true, inbetween: true });
  const chain = [];
  const raw = [];
  for (let attackFrame = 0; attackFrame < attack.totalFrames; attackFrame += 1) {
    const pose = kitlessStrikePose(attack, attackFrame, beatOpt, roles);
    const resolved = resolveMotionPose(pose, gate, "jez", { bareHanded: bareHandedAttack(attack) });
    const fighter = snapshot({
      attacking: attack, attackFrame, grounded: !context.airborne, crouch: Boolean(context.crouching),
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
  const airKick = strikeChain(gate, "light", { limb: "kick", airborne: true });
  assert.deepEqual(airKick.chain, ["ext3:8", "ext3:7", "motion3:4", "ext3:8", "ext3:10"]);
  assert.deepEqual(airKick.raw, ["motion:5", "motion2:13", "motion3:4", "motion:11", "motion:6"]);
  // No chain ever draws ext4 (the reaction sheet) on the attacker.
  for (const { chain } of [jab, heavyKick, crouchJab, sweep, airKick]) {
    assert.ok(chain.every((cell) => !cell.startsWith("ext4:")), chain.join(" -> "));
  }
  // Without the swing sheets the jab is byte-identical to the 4.9 read. The
  // heavy kick keeps ONE substitute: the kick arc's compress band lands on
  // the UNIFIED crouch transition, not a swing sheet, so it draws whenever
  // the unified sheet does — which is exactly why the gate is bank-routed.
  const noSwing = (cell, bank) => (bank === UNIFIED_EXT3_BANK || bank === UNIFIED_EXT4_BANK ? false : gate(cell, bank));
  assert.deepEqual(strikeChain(noSwing, "light", {}).chain, jab.raw);
  assert.deepEqual(strikeChain(noSwing, "heavy", { limb: "kick" }).chain, ["ext:6", "ext2:6", "unified:6", "motion:1", "motion:4", "ext2:7", "unified:7", "unified:0"]);
  // Same for the crouch jab's follow-through: a crouching punch holds its ext2
  // crouched recover instead of the standing follow (which would pop him
  // upright), and ext2 is not a swing sheet either.
  assert.deepEqual(strikeChain(noSwing, "light", { crouching: true }).chain, ["ext2:8", "base:10", "ext2:9", "unified:7", "unified:0"]);
  assert.deepEqual(strikeChain(noSwing, "light", { limb: "kick", airborne: true }).chain, airKick.raw);
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
    'return motion2Pose(beat.cell, "base", frames[1]);',
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

testContextFromSnapshot();
testCrouchActiveWindow();
testSubstitutionAndGate();
testAltFallback();
testCrouchingNormalOverride();
testAirHitNeverReachesTheScreen();
testFrameChains();
testGameMirror();

console.log("Final Blow swing resolver tests passed");
