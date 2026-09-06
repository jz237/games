import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MOTION_CELLS,
  MOTION3_BANK,
  UNIFIED_BANK,
  UNIFIED_CELLS,
  UNIFIED_EXT_BANK,
  UNIFIED_EXT2_BANK,
  UNIFIED_EXT3_BANK,
  UNIFIED_EXT4_BANK,
  UNIFIED_EXT5_BANK,
  UNIFIED_EXT5_CELLS,
  WALK_CELL_COUNT,
  baseCellRoles,
  buildMotion3KeyMap,
  buildMotionAcceptMasks,
  buildSwingAcceptMasks,
  buildUnifiedAcceptMasks,
  buildUnifiedExt2AcceptMasks,
  buildUnifiedExtAcceptMasks,
  motionPose,
  resolveMotionPose,
  unifiedExt5Pose,
  unifiedPose,
} from "../engine/fighter-kits.mjs";
import { swingContext, swingResolve } from "../engine/swing-resolve.mjs";
import {
  INTRO_ENTRANCE_RELEASE_SECONDS,
  INTRO_ENTRANCE_SECOND_BEAT_SECONDS,
  ROUND_WIN_HOLD_SECONDS,
  ROUND_WIN_TAUNT_AFTER_SECONDS,
  ROUND_WIN_TAUNT_MIN_SECONDS,
  introEntranceCell,
  roundWinShowcaseCell,
} from "../engine/bookends.mjs";
import { cellToken } from "../engine/finisher-scripts.mjs";

// ---------------------------------------------------------------------------
// v5.2 LOCOMOTION (bookends) — the intro and the round win as two-beat reads,
// traced through the engine with the gate from the shipped manifests.
// ---------------------------------------------------------------------------
const testDir = dirname(fileURLToPath(import.meta.url));
const assetDir = join(testDir, "..", "assets");
const readManifest = (bank) => JSON.parse(readFileSync(join(assetDir, bank, "MANIFEST.json"), "utf8"));
const E5 = UNIFIED_EXT5_CELLS;
const TICK = 1 / 60;
const INTRO_SECONDS = 2.25; // startFight: state.phaseTime = 2.25
const DEMO_KO_HOLD_SECONDS = 3.1; // game.js

function buildGate(id, { ext5 = true } = {}) {
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

const runsOf = (cells) => {
  const runs = [];
  for (const cell of cells) { if (runs.length && runs.at(-1).cell === cell) runs.at(-1).ticks += 1; else runs.push({ cell, ticks: 1 }); }
  return runs.map((r) => `${r.cell} x${r.ticks}`);
};
const idleFighter = (id, side = 0) => ({ def: { id }, side, attacking: null, attackFrame: 0, grounded: true, crouch: false, hitstunFrames: 0, airHitstunFrames: 0, pendingKnockdown: false, vy: 0, health: 100 });
const draw = (id, gate, pose, fighter = idleFighter(id)) => cellToken(swingResolve(resolveMotionPose(pose, gate, id), swingContext(fighter), gate));

/** Mirror of the intro branch in fighterPoseDescriptor (game.js): the entrance beat over the seed-and-side signature, else the idle. */
function introPose(id, side, seed, phaseTime, animTime = 0) {
  const entrance = introEntranceCell(phaseTime);
  const cell = (((seed >>> 0) + side) % 2) ? MOTION_CELLS.sig2 : MOTION_CELLS.sig1;
  if (entrance !== null) return unifiedExt5Pose(entrance, motionPose(cell, "base", Math.floor(animTime * 5) % 4));
  return unifiedPose(UNIFIED_CELLS.idle, { bank: "base", frame: baseCellRoles(id).idle[0] });
}

/** Mirror of the round-win branch: the showcase cell over the rotation's pick (0 kit victory, 1 motion victory2, 2 sig2). */
function winPose(pick, phaseTime, hold, kitVictory = { bank: "specials", frame: 15 }) {
  const rotation = pick === 1 ? motionPose(MOTION_CELLS.victory2, kitVictory.bank, kitVictory.frame)
    : pick === 2 ? motionPose(MOTION_CELLS.sig2, kitVictory.bank, kitVictory.frame)
      : { bank: kitVictory.bank, frame: kitVictory.frame };
  return unifiedExt5Pose(roundWinShowcaseCell(pick, hold - phaseTime, hold), rotation);
}

test("introEntranceCell: entrance A, then entrance B, then released — on the intro clock", () => {
  assert.equal(INTRO_ENTRANCE_RELEASE_SECONDS, 0.95, "the 2.7 FRAMES release point");
  assert.equal(INTRO_ENTRANCE_SECOND_BEAT_SECONDS, 1.6, "the midpoint of the 2.25 -> 0.95 walk-on");
  assert.equal(introEntranceCell(2.25), E5.entranceA);
  assert.equal(introEntranceCell(1.61), E5.entranceA);
  assert.equal(introEntranceCell(1.6), E5.entranceB);
  assert.equal(introEntranceCell(0.96), E5.entranceB);
  assert.equal(introEntranceCell(0.95), null);
  assert.equal(introEntranceCell(0), null);
  assert.equal(introEntranceCell(3), E5.entranceA, "a longer QA intro (flowPhase 'intro', 3) starts on A too");
  assert.equal(introEntranceCell(NaN), null);
});

test("the intro traced: ext5:9 x39 -> ext5:10 x39 -> unified:0 x57 on both sides, over the pick the held sheet still shows", () => {
  const gate = buildGate("jez");
  for (const seed of [7, 8]) {
    for (const side of [0, 1]) {
      const cells = [];
      for (let tick = 0; tick * TICK < INTRO_SECONDS + 0.3; tick += 1) {
        const phaseTime = Math.max(0, INTRO_SECONDS - tick * TICK);
        cells.push(draw("jez", gate, introPose("jez", side, seed, phaseTime, tick * TICK)));
      }
      assert.deepEqual(runsOf(cells), ["ext5:9 x39", "ext5:10 x39", "unified:0 x75"], `seed ${seed} side ${side}`);
    }
  }
  // Held sheet: the 5.1 read — the seed-and-side signature for the whole walk-on.
  const noExt5 = buildGate("jez", { ext5: false });
  for (const [seed, side, sig] of [[7, 0, "motion:15"], [7, 1, "motion:14"], [8, 0, "motion:14"], [8, 1, "motion:15"]]) {
    const cells = [];
    for (let tick = 0; tick * TICK < INTRO_SECONDS; tick += 1) cells.push(draw("jez", noExt5, introPose("jez", side, seed, INTRO_SECONDS - tick * TICK, tick * TICK)));
    assert.deepEqual(runsOf(cells), [`${sig} x78`, "unified:0 x57"], `held ext5, seed ${seed} side ${side}`);
  }
  // deathblow (no ext / motion3 sheets, the ext5 sheet whole) reads the same two beats.
  const db = buildGate("deathblow");
  const cells = [];
  for (let tick = 0; tick * TICK < INTRO_SECONDS; tick += 1) cells.push(draw("deathblow", db, introPose("deathblow", 0, 3, INTRO_SECONDS - tick * TICK)));
  assert.deepEqual(runsOf(cells), ["ext5:9 x39", "ext5:10 x39", "unified:0 x57"]);
});

test("roundWinShowcaseCell: the victory through the WINS call, the taunt as the second beat where the rotation wanted two", () => {
  assert.equal(ROUND_WIN_HOLD_SECONDS, 4.9, "the plain-KO hold finishRound sets");
  assert.equal(ROUND_WIN_TAUNT_AFTER_SECONDS, 2.4, "the length of the <name> WINS call");
  assert.equal(ROUND_WIN_TAUNT_MIN_SECONDS, 1);
  for (const elapsed of [0, 1, 2.39, 2.4, 4.9]) assert.equal(roundWinShowcaseCell(0, elapsed), E5.victory, `pick 0 holds the victory at ${elapsed}`);
  for (const pick of [1, 2]) {
    assert.equal(roundWinShowcaseCell(pick, 0), E5.victory);
    assert.equal(roundWinShowcaseCell(pick, 2.39), E5.victory);
    assert.equal(roundWinShowcaseCell(pick, 2.4), E5.taunt);
    assert.equal(roundWinShowcaseCell(pick, 4.9), E5.taunt);
    // The demo's 3.1 s hold leaves the taunt 0.7 s — under a beat: one drawing.
    assert.equal(roundWinShowcaseCell(pick, 3.0, DEMO_KO_HOLD_SECONDS), E5.victory);
    assert.equal(roundWinShowcaseCell(pick, 2.5, 3.4), E5.taunt, "a 3.4 s hold leaves exactly one beat");
  }
});

test("the round win traced: ext5:11 x144 -> ext5:12 x150 on the two motion picks, ext5:11 x294 on the kit pick; the taunt key stays the taunt", () => {
  const gate = buildGate("jez");
  const trace = (pick, hold = ROUND_WIN_HOLD_SECONDS, g = gate) => {
    const cells = [];
    for (let tick = 0; tick * TICK < hold; tick += 1) cells.push(draw("jez", g, winPose(pick, hold - tick * TICK, hold)));
    return runsOf(cells);
  };
  assert.deepEqual(trace(0), ["ext5:11 x294"]);
  assert.deepEqual(trace(1), ["ext5:11 x144", "ext5:12 x150"]);
  assert.deepEqual(trace(2), ["ext5:11 x144", "ext5:12 x150"]);
  assert.deepEqual(trace(1, DEMO_KO_HOLD_SECONDS), ["ext5:11 x186"], "the demo hold: one beat");
  // Held sheet: the rotation's own three drawings, one per pick, as 5.1 drew them.
  const noExt5 = buildGate("jez", { ext5: false });
  assert.deepEqual(trace(0, ROUND_WIN_HOLD_SECONDS, noExt5), ["specials:15 x294"]);
  assert.deepEqual(trace(1, ROUND_WIN_HOLD_SECONDS, noExt5), ["motion:13 x294"]);
  assert.deepEqual(trace(2, ROUND_WIN_HOLD_SECONDS, noExt5), ["motion:15 x294"]);
  // The taunt (the taunt input in play) is still the ext5 taunt over the same rotation.
  assert.equal(draw("jez", gate, unifiedExt5Pose(E5.taunt, motionPose(MOTION_CELLS.victory2, "specials", 15))), "ext5:12");
});

test("baseFallbackFrame: the dash ghost trail reads the base cell at the bottom of the chain, not one level down", async () => {
  const { baseFallbackFrame, dashKeys, beatPoseAt, MOTION2_CELLS } = await import("../engine/fighter-kits.mjs");
  const gate = buildGate("jez");
  const launch = beatPoseAt(dashKeys(), 0, (key) => ({ bank: "base", frame: !key || key.at >= 0.68 ? 12 : 5 }));
  const resolved = resolveMotionPose(launch, gate, "jez");
  assert.equal(resolved.bank, UNIFIED_EXT5_BANK, "the dash launch draws from the ext5 sheet");
  assert.notEqual(resolved.fallback?.bank, "base", "its first fallback is the motion link it stands in for");
  assert.equal(baseFallbackFrame(resolved), 5, "the base cell is two levels down");
  assert.equal(baseFallbackFrame(unifiedExt5Pose(E5.dashBrake, { bank: "motion2", frame: MOTION2_CELLS.dashBrake, fallback: { bank: "base", frame: 12 } })), 12);
  assert.equal(baseFallbackFrame({ bank: "base", frame: 3 }), 3);
  assert.equal(baseFallbackFrame({ bank: "specials", frame: 3 }), -1, "a kit cell with no base fallback mutes the trail, as before");
  assert.equal(baseFallbackFrame(null), -1);
  // game.js reads the trail's frame through it.
  const gameSource = readFileSync(join(testDir, "..", "game.js"), "utf8");
  assert.match(gameSource, /const ghostPose = fighterAnimationPose\(fighter\);\s*\n\s*const ghostFrame = baseFallbackFrame\(ghostPose\);/);
});
