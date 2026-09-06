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
  KO_COLLAPSE_CRUMPLE_TICKS,
  ROUND_WIN_HOLD_SECONDS,
  ROUND_WIN_TAUNT_AFTER_SECONDS,
  ROUND_WIN_TAUNT_MIN_SECONDS,
  introEntranceCell,
  koCollapseHolds,
  koCollapseOnRoundEnd,
  koCollapseThudTick,
  roundWinShowcaseCell,
} from "../engine/bookends.mjs";
import { ROUND_END_CAUSES, roundEndCause } from "../engine/announcer.mjs";
import { DEFENSE_RULES } from "../engine/defense.mjs";
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

// ---------------------------------------------------------------------------
// v5.3 SPECTACLE (ko-collapse) — the third bookend. Same shape as the two
// above: the pure decisions first, then the loser's chain traced tick by tick
// across the finish -> roundover edge with the shipped manifests as the gate.
// ---------------------------------------------------------------------------
const KO_HOLD_TICKS = Math.round(ROUND_WIN_HOLD_SECONDS * 60); // the 4.9 s curtain call

/** A fighter in the state checkKnockout leaves the loser in: dazed, upright, at 0. */
const dazedLoser = (id, side = 1) => ({
  ...idleFighter(id, side),
  health: 0,
  down: false,
  knockdownFrames: 0,
  wakeupFrames: 0,
  hitstunFrames: 5940,
  dizzyFrames: 0,
  lastHitLevel: null,
});

/** `draw`, with the caller's phase read — the roundDecided flag game.js passes at the pose site. */
const drawDecided = (id, gate, pose, fighter) => cellToken(
  swingResolve(resolveMotionPose(pose, gate, id), swingContext(fighter, { roundDecided: true }), gate),
);

/**
 * Mirror of the three branches of fighterPoseDescriptor a KO'd loser can
 * reach on a decided round, in game.js's order: the knockdown read (crumple
 * band, then the KO lie), then the daze read the 5.2 build fell through to.
 */
function loserPose(id, fighter) {
  const roles = baseCellRoles(id);
  if (fighter.down || fighter.knockdownFrames > 0) {
    if (fighter.down && fighter.knockdownFrames > DEFENSE_RULES.knockdownFrames - KO_COLLAPSE_CRUMPLE_TICKS) {
      return motionPose(MOTION_CELLS.crumple, "base", roles.down);
    }
    return unifiedPose(UNIFIED_CELLS.knockdown, { bank: "base", frame: roles.down });
  }
  return unifiedPose(UNIFIED_CELLS.lightHit, { bank: "base", frame: roles.hit });
}

/** Mirror of advanceFighterTimers' down block, including the 5.3 hold. Returns the landing ticks. */
function tickDownCountdown(fighter, phase) {
  const landings = [];
  const koLie = koCollapseHolds({ phase, finisher: false, finisherType: -1, health: fighter.health, down: fighter.down });
  if (!(fighter.down && fighter.grounded)) {
    if (fighter.wakeupFrames > 0) fighter.wakeupFrames -= 1;
    return landings;
  }
  if (koLie && fighter.knockdownFrames <= 1) {
    fighter.knockdownFrames = 1;
    return landings;
  }
  fighter.knockdownFrames = Math.max(0, fighter.knockdownFrames - 1);
  if (koLie && koCollapseThudTick(fighter.knockdownFrames, DEFENSE_RULES.knockdownFrames)) landings.push(fighter.knockdownFrames);
  if (fighter.knockdownFrames === 0) {
    fighter.down = false;
    fighter.wakeupFrames = DEFENSE_RULES.wakeupFrames;
  }
  return landings;
}

test("koCollapseOnRoundEnd: a knockout lays a standing loser down, a decision and a Final Blow never do", () => {
  const standing = { health: 0, down: false, grounded: true };
  // The cause comes from the announcer's own classifier, the one the banner reads.
  const koCause = roundEndCause({ finisherType: -1, timer: 41, loserHealth: 0 });
  assert.equal(koCause, ROUND_END_CAUSES.knockout);
  assert.equal(koCollapseOnRoundEnd({ cause: koCause, ...standing }), true);
  // A DECISION: the clock ran out on two fighters who are both still standing.
  const decision = roundEndCause({ finisherType: -1, timer: 0, loserHealth: 23 });
  assert.equal(decision, ROUND_END_CAUSES.decision);
  assert.equal(koCollapseOnRoundEnd({ cause: decision, health: 23, down: false, grounded: true }), false);
  // A FINAL BLOW keeps its own script — the victim is the cinematic's, not ours.
  assert.equal(koCollapseOnRoundEnd({ cause: roundEndCause({ finisherType: 1 }), ...standing }), false);
  // Already prone, or still in the air: leave him exactly where he is.
  assert.equal(koCollapseOnRoundEnd({ cause: koCause, ...standing, down: true }), false);
  assert.equal(koCollapseOnRoundEnd({ cause: koCause, ...standing, grounded: false }), false);
  // A timer win where the loser still holds health is a decision even at 1 hp.
  assert.equal(koCollapseOnRoundEnd({ cause: koCause, ...standing, health: 0.4 }), false);
  assert.equal(koCollapseOnRoundEnd({}), false);
});

test("koCollapseHolds: the KO lie holds through roundover and the result, and nowhere else", () => {
  const lie = { finisher: false, finisherType: -1, health: 0, down: true };
  assert.equal(koCollapseHolds({ phase: "roundover", ...lie }), true);
  assert.equal(koCollapseHolds({ phase: "result", ...lie }), true);
  // A live round's knockdown must still count down into the wake-up.
  assert.equal(koCollapseHolds({ phase: "fight", ...lie }), false);
  assert.equal(koCollapseHolds({ phase: "finish", ...lie }), false);
  assert.equal(koCollapseHolds({ phase: "intro", ...lie }), false);
  // A fatality victim is the finisher script's.
  assert.equal(koCollapseHolds({ phase: "roundover", ...lie, finisher: true }), false);
  assert.equal(koCollapseHolds({ phase: "roundover", ...lie, finisherType: 0 }), false);
  // A fighter knocked down as the clock expired still has health: he gets up.
  assert.equal(koCollapseHolds({ phase: "roundover", ...lie, health: 12 }), false);
  assert.equal(koCollapseHolds({ phase: "roundover", ...lie, down: false }), false);
  assert.equal(koCollapseHolds({}), false);
});

test("koCollapseThudTick: the body reaches the boards on the crumple band's last tick, once", () => {
  assert.equal(KO_COLLAPSE_CRUMPLE_TICKS, 7, "the band game.js has always drawn the crumple over");
  assert.equal(DEFENSE_RULES.knockdownFrames, 48, "the knockdown countdown the collapse borrows");
  const hits = [];
  for (let frames = 48; frames >= 0; frames -= 1) if (koCollapseThudTick(frames, 48)) hits.push(frames);
  assert.deepEqual(hits, [41], "exactly one landing, at total - 7");
  assert.equal(koCollapseThudTick(1, 48), false, "the frozen lie never re-fires it");
});

test("the plain KO traced: the 5.2 hold drew ext4:1 for all 294 ticks; the collapse reads ext4:9 x7 -> ext4:15 x287 and never a getup", () => {
  const gate = buildGate("jez");
  // 5.2 (the shipped bug): no collapse, so the loser holds the daze read.
  const before = [];
  for (let tick = 0; tick < KO_HOLD_TICKS; tick += 1) before.push(drawDecided("jez", gate, loserPose("jez", dazedLoser("jez")), dazedLoser("jez")));
  assert.deepEqual(runsOf(before), [`ext4:1 x${KO_HOLD_TICKS}`], "the head snap, upright, for the whole curtain call");

  // 5.3: finishRound lays him down (enterKnockdown), then the hold.
  const loser = dazedLoser("jez");
  assert.equal(koCollapseOnRoundEnd({
    cause: roundEndCause({ finisherType: -1, timer: 41, loserHealth: loser.health }),
    health: loser.health, down: loser.down, grounded: loser.grounded,
  }), true);
  Object.assign(loser, { down: true, knockdownFrames: DEFENSE_RULES.knockdownFrames, hitstunFrames: 0, dizzyFrames: 0 });
  const after = [];
  const landings = [];
  for (let tick = 0; tick < KO_HOLD_TICKS; tick += 1) {
    after.push(drawDecided("jez", gate, loserPose("jez", loser), loser));
    landings.push(...tickDownCountdown(loser, "roundover"));
  }
  assert.deepEqual(runsOf(after), [
    `ext4:9 x${KO_COLLAPSE_CRUMPLE_TICKS}`,
    `ext4:15 x${KO_HOLD_TICKS - KO_COLLAPSE_CRUMPLE_TICKS}`,
  ], "the crumple, then the KO lie the ext4 sheet was drawn for");
  assert.equal(landings.length, 1, "one thud, one dust puff");
  assert.equal(loser.down, true, "he is still on the boards when the hold ends");
  assert.equal(loser.knockdownFrames, 1, "the countdown floors instead of arming a wake-up");
  assert.equal(loser.wakeupFrames, 0, "no wake-up rung is ever rung off a KO lie");
  assert.equal(after.some((cell) => cell.startsWith("ext4:12") || cell.startsWith("ext4:13")), false, "no getup cell reaches the screen");

  // The same knockdown on a LIVE round is untouched: it counts out and wakes.
  const live = { ...dazedLoser("jez"), health: 34, down: true, knockdownFrames: DEFENSE_RULES.knockdownFrames, hitstunFrames: 0 };
  for (let tick = 0; tick < DEFENSE_RULES.knockdownFrames; tick += 1) tickDownCountdown(live, "fight");
  assert.equal(live.down, false, "a live knockdown still counts out");
  assert.equal(live.wakeupFrames, DEFENSE_RULES.wakeupFrames, "and still arms the wake-up");
});

test("the collapse is wired: finishRound lays the loser down, the countdown floors, and the landing is the knockdown impact", () => {
  const gameSource = readFileSync(join(testDir, "..", "game.js"), "utf8");
  assert.match(gameSource, /if \(koCollapseOnRoundEnd\(\{\s*\n\s*cause, health: loser\.health, down: loser\.down, grounded: loser\.grounded,\s*\n\s*\}\)\) collapseKoLoser\(loser\);/);
  // The collapse IS enterKnockdown — no parallel knockdown path.
  assert.match(gameSource, /function collapseKoLoser\(fighter\) \{[\s\S]*?enterKnockdown\(fighter\);\s*\n\}/);
  // and it clears the stand-off's daze, which outranks the down read.
  assert.match(gameSource, /function collapseKoLoser\(fighter\) \{[\s\S]*?fighter\.hitstunFrames = 0;[\s\S]*?fighter\.dizzyFrames = 0;/);
  assert.match(gameSource, /if \(koLie && fighter\.knockdownFrames <= 1\) \{\s*\n\s*fighter\.knockdownFrames = 1;/);
  assert.match(gameSource, /if \(koLie && koCollapseThudTick\(fighter\.knockdownFrames, DEFENSE_RULES\.knockdownFrames\)\) \{\s*\n\s*spawnKoCollapseLanding\(fighter\);/);
  assert.match(gameSource, /function spawnKoCollapseLanding\(fighter\) \{\s*\n\s*spawnKnockdownImpact\(fighter, KO_COLLAPSE_LANDING_VELOCITY\);/);
  // The crumple band is the shared constant, not a second 7.
  assert.match(gameSource, /fighter\.knockdownFrames > DEFENSE_RULES\.knockdownFrames - KO_COLLAPSE_CRUMPLE_TICKS/);
  // Nothing here touches a clock the player can see.
  assert.match(gameSource, /state\.phaseTime = roundWinHoldSeconds\(\);/);
});
