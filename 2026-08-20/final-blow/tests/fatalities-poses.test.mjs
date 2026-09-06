import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MOTION3_BANK,
  UNIFIED_BANK,
  UNIFIED_EXT_BANK,
  UNIFIED_EXT2_BANK,
  UNIFIED_EXT3_BANK,
  UNIFIED_EXT4_BANK,
  UNIFIED_EXT5_BANK,
  WALK_CELL_COUNT,
  buildMotion3KeyMap,
  buildMotionAcceptMasks,
  buildSwingAcceptMasks,
  buildUnifiedAcceptMasks,
  buildUnifiedExt2AcceptMasks,
  buildUnifiedExtAcceptMasks,
  resolveMotionPose,
  swingDrawnHeight,
  swingStandInAdjust,
  unifiedScreenHeight,
} from "../engine/fighter-kits.mjs";
import { swingContext, swingResolve } from "../engine/swing-resolve.mjs";
import {
  CINEMATIC_PRONE_LIE_RADIANS,
  FINISHER_CHOREOGRAPHY,
  FINISHER_RESIDUAL_BASE_CELLS,
  cellToken,
  cinematicDrawRotation,
  finisherCinematicPose,
  finisherKeyTokens,
  isCinematicProneCell,
  parseCellToken,
  sampleFinisher,
} from "../engine/finisher-scripts.mjs";
import { GRAPHIC_FATALITIES } from "../engine/fatalities.mjs";

// ---------------------------------------------------------------------------
// v5.2 LOCOMOTION (bookends) — THE FINAL BLOW ON THE UNIFIED FAMILY.
//
// The ten scripts drew raw base-atlas cells (`af` / `vf`) at 1.02-1.34x zoom:
// the oldest generation at the most-watched moment. Every key now names the
// same-generation drawing for that beat, and this suite walks each script
// through the engine's own resolver with the gate from the SHIPPED manifests
// — the trace MOTION-ATLAS.md's attributions are read from — and pins:
//   1. the scripts' timing, camera, zoom and rotation are the base commit's,
//      byte for byte (a digest of the table with the tokens stripped);
//   2. the drawing switches on exactly the ticks it always did;
//   3. every drawn bank is the unified family, except the residuals named in
//      FINISHER_RESIDUAL_BASE_CELLS (post's spray can);
//   4. a held sheet is byte-identical to the pre-item read.
// ---------------------------------------------------------------------------
const testDir = dirname(fileURLToPath(import.meta.url));
const assetDir = join(testDir, "..", "assets");
const readManifest = (bank) => JSON.parse(readFileSync(join(assetDir, bank, "MANIFEST.json"), "utf8"));
const FIGHTERS = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "devil", "commissioner"];
const TICK = 1 / 60;
const AFTERMATH_HOLD_SECONDS = 3.4; // performFinisher: script.duration + 3.4
const FAMILY = new Set([UNIFIED_BANK, UNIFIED_EXT_BANK, UNIFIED_EXT2_BANK, UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK, UNIFIED_EXT5_BANK]);

// The base commit's `finisherChoreography` (73e7f4f), keys stripped to
// t/ax/ay/af/vx/vy/vf/vr/zoom in their authored order, sha256 of the JSON.
const BASE_SCRIPT_DIGEST = "e5f94f3033c7a4269156d9cb6f4b1bf92e9d3d74003f7875069887d77f8eab36";

function buildGate(id, { ext5 = true, family = true } = {}) {
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
    if (!family && FAMILY.has(bank)) return false;
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

/** The sim's fighter fields the resolver reads, for one role at one sampled key. */
function fighterAt(id, role, sample) {
  const airborne = (role === "attacker" ? sample.ay : sample.vy) >= 2;
  return {
    def: { id }, side: role === "attacker" ? 0 : 1, attacking: null, attackFrame: 0,
    grounded: !airborne, crouch: false, hitstunFrames: 0, airHitstunFrames: 0, pendingKnockdown: false, vy: 0,
    health: role === "attacker" ? 100 : 0, cinematicFrame: role === "attacker" ? sample.af : sample.vf,
  };
}

/**
 * Mirror of game.js cinematicPoseDescriptor + fighterAnimationPose for a
 * fighter inside a Final Blow: the key's token over base(cinematicFrame),
 * resolved through the bank-routed gate and the substitution layer
 * (roundDecided: the finisher runs in the roundover phase).
 */
function drawAt(id, role, keys, elapsed, gate, { gore = true, fatalityAt = Infinity } = {}) {
  const sample = sampleFinisher(keys, elapsed);
  const fighter = fighterAt(id, role, sample);
  const fallback = { bank: "base", frame: fighter.cinematicFrame };
  const plainBody = role === "victim" && !(gore && elapsed >= fatalityAt);
  const descriptor = finisherCinematicPose(sample, role, fallback, { plainBody });
  const resolved = resolveMotionPose(descriptor, gate, id);
  return swingResolve(resolved, swingContext(fighter, { roundDecided: true }), gate);
}

function traceScript(id, gate, options = {}) {
  const script = FINISHER_CHOREOGRAPHY[id];
  const fatalityAt = script.impacts.find((impact) => impact.final).t;
  const attacker = [];
  const victim = [];
  const ticks = Math.round((script.duration + AFTERMATH_HOLD_SECONDS) / TICK);
  for (let tick = 0; tick <= ticks; tick += 1) {
    // finisher.elapsed saturates at the script duration; the hold after it sits on the last key.
    const elapsed = Math.min(script.duration, tick * TICK);
    attacker.push(cellToken(drawAt(id, "attacker", script.keys, elapsed, gate, { ...options, fatalityAt })));
    victim.push(cellToken(drawAt(id, "victim", script.keys, elapsed, gate, { ...options, fatalityAt })));
  }
  return { attacker, victim, runs: { attacker: runsOf(attacker), victim: runsOf(victim) }, fatalityAt, duration: script.duration };
}

/** The base commit's sampler, drawing side only: the key whose af/vf shows at `elapsed`. */
function baseSampleFrames(keys, elapsed) {
  let from = keys[0];
  let to = keys.at(-1);
  for (let index = 0; index < keys.length - 1; index += 1) {
    if (elapsed >= keys[index].t && elapsed <= keys[index + 1].t) { from = keys[index]; to = keys[index + 1]; break; }
  }
  const span = Math.max(.001, to.t - from.t);
  const linear = Math.min(1, Math.max(0, (elapsed - from.t) / span));
  return { af: linear < .5 ? from.af : to.af, vf: linear < .5 ? from.vf : to.vf, key: linear < .5 ? from : to };
}

test("the ten scripts are the base commit's, byte for byte, in timing, camera, zoom and rotation", () => {
  const stripped = Object.entries(FINISHER_CHOREOGRAPHY).map(([id, script]) => [id, {
    combo: script.combo,
    duration: script.duration,
    keys: script.keys.map(({ a: _a, v: _v, vPlain: _vPlain, ...key }) => key),
    impacts: script.impacts,
  }]);
  assert.equal(createHash("sha256").update(JSON.stringify(stripped)).digest("hex"), BASE_SCRIPT_DIGEST,
    "a key's t / ax / ay / vx / vy / vr / zoom / af / vf or an impact moved — the item re-keys DRAWINGS only");
  assert.deepEqual(Object.keys(FINISHER_CHOREOGRAPHY), FIGHTERS);
  for (const id of FIGHTERS) assert.ok(GRAPHIC_FATALITIES[id], `${id} has a fatality profile for the script to serve`);
});

test("every key carries a same-generation attacker and victim cell, and the only base tokens are the named residuals", () => {
  for (const id of FIGHTERS) {
    const script = FINISHER_CHOREOGRAPHY[id];
    const residual = FINISHER_RESIDUAL_BASE_CELLS[id] || [];
    for (const [index, key] of script.keys.entries()) {
      const a = parseCellToken(key.a);
      const v = parseCellToken(key.v);
      assert.ok(a && v, `${id} key ${index} (t ${key.t}) names both drawings`);
      if (a.bank === "base") {
        assert.ok(residual.includes(a.frame), `${id} key ${index} keeps base:${a.frame} — a residual must be named in FINISHER_RESIDUAL_BASE_CELLS`);
        assert.equal(a.frame, key.af, "a residual keeps the cell the sim stores, never another base cell");
      }
      assert.notEqual(v.bank, "base", `${id} key ${index}: the victim never draws a base cell`);
      assert.ok([UNIFIED_EXT4_BANK, UNIFIED_EXT5_BANK].includes(v.bank), `${id} key ${index}: the victim is ext4, or the ext5 carried fold`);
      if (v.bank === UNIFIED_EXT5_BANK) assert.equal(v.frame, 7, "the only ext5 victim cell is the carried fold at the top of a lift");
      if (key.vPlain) {
        assert.equal(key.vPlain, "ext4:15", "the plain body's rest is the KO cell");
        assert.equal(index, script.keys.length - 1, "and only the script's last key lies in it");
      }
    }
    assert.equal(script.keys.at(-1).vPlain, "ext4:15", `${id}: the victim's plain body ends in the KO cell`);
    assert.equal(script.keys.at(-1).a, "ext5:11", `${id}: the attacker turns from the body into the ext5 victory`);
    assert.equal(script.keys[0].v, "ext4:5", `${id}: the victim opens dazed on the ext4 dizzy`);
    const kill = script.keys.find((key) => key.t === script.impacts.find((impact) => impact.final).t);
    assert.equal(kill.v, "ext4:8", `${id}: the killing blow lands on the splayed wall splat, the upright plan the bands slice`);
  }
  // The tokens' short names round-trip, and a bad bank is loud.
  assert.deepEqual(parseCellToken("ext3:13"), { bank: UNIFIED_EXT3_BANK, frame: 13 });
  assert.equal(cellToken({ bank: UNIFIED_EXT5_BANK, frame: 11 }), "ext5:11");
  assert.equal(parseCellToken(null), null);
  assert.throws(() => parseCellToken("motion:5"), /Bad cell token/);
  assert.throws(() => parseCellToken("ext4:16"), /Bad cell token/);
  assert.deepEqual(FINISHER_RESIDUAL_BASE_CELLS, { post: [13, 14] });
  assert.equal(finisherKeyTokens("nobody"), null);
  assert.equal(finisherKeyTokens("jez").length, 12);
});

test("the drawing switches on exactly the ticks the base sampler switched af / vf — timing never moves", () => {
  for (const id of FIGHTERS) {
    const { keys, duration } = FINISHER_CHOREOGRAPHY[id];
    let lastKey = null;
    let switches = 0;
    for (let tick = 0; tick * TICK <= duration + 0.5; tick += 1) {
      const elapsed = Math.min(duration, tick * TICK);
      const base = baseSampleFrames(keys, elapsed);
      const sample = sampleFinisher(keys, elapsed);
      assert.equal(sample.af, base.af, `${id} tick ${tick}: af`);
      assert.equal(sample.vf, base.vf, `${id} tick ${tick}: vf`);
      assert.equal(sample.a, base.key.a, `${id} tick ${tick}: the attacker token is the same key's`);
      assert.equal(sample.v, base.key.v, `${id} tick ${tick}: the victim token is the same key's`);
      assert.equal(sample.vPlain, base.key.vPlain ?? null);
      if (base.key !== lastKey) { switches += 1; lastKey = base.key; }
    }
    assert.equal(switches, keys.length, `${id}: every key shows once, in order`);
  }
  // The eased fields still come from the same sampler (the camera reads zoom off it).
  const mid = sampleFinisher(FINISHER_CHOREOGRAPHY.jez.keys, 0.19);
  assert.ok(mid.ax > -305 && mid.ax < -150 && mid.zoom > 1.02 && mid.zoom < 1.07);
});

test("finisherCinematicPose: the token over the base cell, the base cell alone for a residual, the plain body's KO lie", () => {
  const fallback = { bank: "base", frame: 15 };
  const key = { af: 14, vf: 15, a: "ext3:14", v: "ext4:8", vPlain: "ext4:15" };
  assert.deepEqual(finisherCinematicPose(key, "attacker", { bank: "base", frame: 14 }), { bank: UNIFIED_EXT3_BANK, frame: 14, fallback: { bank: "base", frame: 14 } });
  assert.deepEqual(finisherCinematicPose(key, "victim", fallback), { bank: UNIFIED_EXT4_BANK, frame: 8, fallback });
  assert.deepEqual(finisherCinematicPose(key, "victim", fallback, { plainBody: true }), { bank: UNIFIED_EXT4_BANK, frame: 15, fallback });
  assert.deepEqual(finisherCinematicPose({ af: 13, vf: 15, a: "base:13", v: "ext4:3" }, "attacker", { bank: "base", frame: 13 }), { bank: "base", frame: 13 });
  assert.deepEqual(finisherCinematicPose({ af: 0, vf: 15 }, "attacker", fallback), fallback, "no token, the sim's own cell");
  assert.deepEqual(finisherCinematicPose({ af: 0, vf: 15, v: "ext4:8" }, "victim", fallback, { plainBody: true }), { bank: UNIFIED_EXT4_BANK, frame: 8, fallback }, "no plain-body cell on a key: the upright plan");
  assert.equal(finisherCinematicPose(null, "attacker", fallback), fallback);
});

test("cinematicDrawRotation: an upright cell keeps the script's rotation; the KO lie sheds its own lie first", () => {
  assert.equal(cinematicDrawRotation(UNIFIED_EXT4_BANK, 8, 1.35), 1.35);
  assert.equal(cinematicDrawRotation("base", 15, -1.38), -1.38);
  assert.equal(cinematicDrawRotation(UNIFIED_EXT3_BANK, 13, 0.7), 0.7);
  assert.equal(cinematicDrawRotation(UNIFIED_EXT4_BANK, 15, 0), 0);
  assert.ok(Math.abs(cinematicDrawRotation(UNIFIED_EXT4_BANK, 15, 1.35)) < 1e-12, "the rest angle draws the KO cell flat");
  assert.ok(Math.abs(cinematicDrawRotation(UNIFIED_EXT4_BANK, 15, 1.38) - 0.03) < 1e-9, "only what the script asks beyond a lie-down remains");
  assert.ok(Math.abs(cinematicDrawRotation(UNIFIED_EXT4_BANK, 15, -1.38) + 0.03) < 1e-9, "mirrored the same way");
  assert.equal(cinematicDrawRotation(UNIFIED_EXT4_BANK, 15, 1.2), 0, "short of the lie, flat: never stood back up");
  assert.equal(cinematicDrawRotation(UNIFIED_BANK, 15, 1.35), 0, "the unified knockdown lies the same way");
  assert.equal(CINEMATIC_PRONE_LIE_RADIANS, 1.35, "DOWN_TILT_RADIANS in both renderers");
  assert.ok(isCinematicProneCell(UNIFIED_EXT4_BANK, 15) && !isCinematicProneCell(UNIFIED_EXT4_BANK, 14) && !isCinematicProneCell("base", 15));
  // The deepest rest any script asks for is 1.38: on the KO cell that is 1.7 degrees, never a stand-up.
  for (const id of FIGHTERS) {
    const rest = Math.abs(FINISHER_CHOREOGRAPHY[id].keys.at(-1).vr);
    assert.ok(rest >= 1.35 && rest <= 1.38, `${id} rest ${rest}`);
    assert.ok(Math.abs(cinematicDrawRotation(UNIFIED_EXT4_BANK, 15, rest)) <= 0.03 + 1e-9);
  }
});

test("every script draws the unified family only, on both bodies, except the named residuals — traced through the engine", () => {
  for (const id of FIGHTERS) {
    const gate = buildGate(id);
    const trace = traceScript(id, gate);
    const residual = new Set((FINISHER_RESIDUAL_BASE_CELLS[id] || []).map((frame) => `base:${frame}`));
    for (const cell of trace.attacker) {
      const { bank } = parseCellToken(cell);
      assert.ok(FAMILY.has(bank) || residual.has(cell), `${id} attacker drew ${cell}`);
    }
    for (const cell of trace.victim) assert.ok(FAMILY.has(parseCellToken(cell).bank), `${id} victim drew ${cell}`);
    // The attacker ends in the ext5 victory for the whole aftermath hold, the victim on the splat under the overlay.
    assert.equal(trace.attacker.at(-1), "ext5:11");
    assert.equal(trace.victim.at(-1), "ext4:8");
    // No cross-generation flip: two neighbouring runs are never base <-> family unless the base one is a residual.
    for (let index = 1; index < trace.attacker.length; index += 1) {
      const prev = trace.attacker[index - 1];
      const next = trace.attacker[index];
      if (prev === next) continue;
      const crosses = (parseCellToken(prev).bank === "base") !== (parseCellToken(next).bank === "base");
      if (crosses) assert.ok(residual.has(prev) || residual.has(next), `${id}: ${prev} -> ${next} crosses generations without a residual`);
    }
  }
});

test("the attributions MOTION-ATLAS.md records: jez, deathblow, post and the commissioner, hold ticks included", () => {
  const jez = traceScript("jez", buildGate("jez"));
  assert.deepEqual(jez.runs.attacker, [
    "ext5:0 x12", "ext5:1 x17", "ext3:0 x15", "ext3:3 x16", "ext3:0 x17", "ext3:3 x21", "ext3:9 x25", "ext3:6 x29", "ext5:5 x34", "ext5:8 x37", "ext3:14 x55", "ext5:11 x242",
  ]);
  assert.deepEqual(jez.runs.victim, [
    "ext4:5 x29", "ext4:1 x15", "ext4:2 x16", "ext4:1 x17", "ext4:2 x21", "ext4:3 x25", "ext4:6 x29", "ext4:8 x368",
  ]);
  // The plain body (no dismemberment overlay): the same ladder into the KO lie on the last key.
  const plain = traceScript("jez", buildGate("jez"), { gore: false });
  assert.deepEqual(plain.runs.victim.slice(-2), ["ext4:8 x126", "ext4:15 x242"]);
  assert.deepEqual(plain.runs.attacker, jez.runs.attacker, "the overlay never changes the attacker's read");
  const deathblow = traceScript("deathblow", buildGate("deathblow"));
  assert.deepEqual(deathblow.runs.attacker, [
    "ext5:0 x13", "ext5:1 x20", "ext3:13 x22", "ext3:9 x23", "ext3:3 x24", "ext3:6 x30", "ext3:14 x42", "ext5:8 x46", "ext3:4 x62", "ext5:11 x244",
  ]);
  assert.deepEqual(deathblow.runs.victim, ["ext4:5 x33", "ext4:2 x22", "ext4:1 x23", "ext4:3 x24", "ext4:6 x30", "ext4:8 x394"]);
  // post: the spray can's two base cells are the residual, every other beat is the family.
  const post = traceScript("post", buildGate("post"));
  assert.deepEqual(post.runs.attacker, [
    "ext5:0 x15", "ext2:14 x25", "ext3:0 x20", "ext3:13 x23", "ext3:3 x24", "base:13 x25", "base:14 x29", "ext3:10 x31", "base:13 x33", "base:14 x53", "ext5:11 x242",
  ]);
  // The commissioner keeps his cane: the unified sheet is the only family sheet that draws it.
  const commissioner = traceScript("commissioner", buildGate("commissioner"));
  assert.deepEqual(commissioner.runs.attacker, [
    "unified:1 x15", "unified:3 x24", "unified:10 x20", "unified:8 x21", "unified:11 x23", "unified:8 x27", "unified:9 x29", "unified:10 x33", "unified:7 x36", "unified:8 x57", "ext5:11 x244",
  ]);
  assert.deepEqual(commissioner.runs.victim, ["ext4:5 x39", "ext4:1 x20", "ext4:2 x21", "ext4:3 x23", "ext4:6 x27", "ext5:7 x29", "ext4:8 x370"]);
  // Every fighter's victim ladder has the same shape: dazed, the hits, the launch, the splat.
  for (const id of FIGHTERS) {
    const { runs } = traceScript(id, buildGate(id));
    assert.equal(runs.victim[0].split(" ")[0], "ext4:5", `${id} opens dazed`);
    assert.ok(runs.victim.some((run) => run.startsWith("ext4:6 ")), `${id} launches`);
    assert.equal(runs.victim.at(-1).split(" ")[0], "ext4:8", `${id} rests splayed`);
  }
});

test("the victim's cells against the idle: the splat rest needs no reconciliation, the dazed opener and the KO lie take 1", () => {
  // Drawn height x fit-restore over the unified idle (the commissioner's fold on both sides): the splayed
  // wall splat sits at 0.87-1.03 on all ten — the commissioner's +2.5% is the only one over, inside the
  // 3% deadband — so SWING_STAND_IN_TARGET carries no rule for it and the factor is 1 everywhere.
  for (const id of FIGHTERS) {
    const ratio = swingDrawnHeight(id, UNIFIED_EXT4_BANK, 8) / unifiedScreenHeight(id, 0);
    assert.ok(ratio >= 0.87 && ratio <= 1.03, `${id} splat/idle ${ratio.toFixed(3)}`);
    assert.equal(swingStandInAdjust(id, UNIFIED_EXT4_BANK, 8), 1, `${id}: no rule bites on the splat`);
    assert.equal(swingStandInAdjust(id, UNIFIED_EXT4_BANK, 5), 1, `${id}: the dizzy slump keeps item two's loop against the sway`);
    assert.equal(swingStandInAdjust(id, UNIFIED_EXT4_BANK, 15), 1, `${id}: the KO lie is not a rung`);
    const lie = swingDrawnHeight(id, UNIFIED_EXT4_BANK, 15) / unifiedScreenHeight(id, 0);
    assert.ok(lie >= 0.27 && lie <= 0.40, `${id}: the KO cell lies flat (${lie.toFixed(3)} of the idle tall)`);
  }
});

test("a held family is byte-identical to the base commit: the sim's own base cells, tick for tick", () => {
  for (const id of FIGHTERS) {
    const script = FINISHER_CHOREOGRAPHY[id];
    const held = buildGate(id, { family: false });
    for (let tick = 0; tick * TICK <= script.duration; tick += 6) {
      const elapsed = tick * TICK;
      const base = baseSampleFrames(script.keys, elapsed);
      const attacker = drawAt(id, "attacker", script.keys, elapsed, held);
      const victim = drawAt(id, "victim", script.keys, elapsed, held, { gore: false });
      // resolveMotionPose's unusable swap (deathblow's base:13 -> 9) ran before this item too.
      const expectedAf = id === "deathblow" && base.af === 13 ? 9 : base.af;
      assert.deepEqual([attacker.bank, attacker.frame], ["base", expectedAf], `${id} attacker at ${elapsed.toFixed(2)}`);
      assert.deepEqual([victim.bank, victim.frame], ["base", base.vf], `${id} victim at ${elapsed.toFixed(2)}`);
    }
  }
});
