import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALT_ATLAS_TABLE,
  BANK_GATE_KIND,
  SWING_BANK_LIST,
  SWING_MASK_KEY,
  SWING_SUFFIX,
  altAtlasKey,
  altAtlasSource,
  bankCellDrawable,
  bankGateKind,
  bankPreloadPlan,
  isSwingBank,
  swingSheetPath,
} from "../engine/banks.mjs";
import {
  AUTHORED_BANKS,
  MOTION3_BANK,
  SPECIALS_BANK,
  SPECIALS_LEGACY_BANK,
  SWING_BANKS,
  UNIFIED_BANK,
  UNIFIED_CELLS,
  UNIFIED_EXT_BANK,
  UNIFIED_EXT_CELLS,
  UNIFIED_EXT2_BANK,
  UNIFIED_EXT3_BANK,
  UNIFIED_EXT3_CELLS,
  UNIFIED_EXT4_BANK,
  UNIFIED_EXT5_BANK,
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
import { SIMULATION_STEP_SECONDS } from "../engine/foundation.mjs";
import { swingContext, swingResolve } from "../engine/swing-resolve.mjs";

// v5.3 SPECTACLE (sweep item #52) — the bank plumbing extracted out of
// game.js. Every assertion below used to be a regex over game.js's SOURCE
// TEXT: the routing ladder, the swing mask keys, the alt-palette cache keys
// and the preload's request order. A regex pin passes when the characters
// line up, not when the behaviour holds, and it breaks on a reformat that
// changed nothing. These are the behaviours those pins were aiming at.

const testDir = dirname(fileURLToPath(import.meta.url));
const gameSource = readFileSync(join(testDir, "..", "game.js"), "utf8");
const assetDir = join(testDir, "..", "assets");
const readManifest = (bank) => JSON.parse(readFileSync(join(assetDir, bank, "MANIFEST.json"), "utf8"));

// --- the routing table -----------------------------------------------------

function testGateRouting() {
  // Every authored bank routes somewhere, and motion3 (addressed by pose name,
  // not by index) has its own row.
  for (const bank of AUTHORED_BANKS) {
    assert.ok(BANK_GATE_KIND[bank], `${bank} must have a gate row`);
  }
  assert.equal(bankGateKind(MOTION3_BANK), "motion3");
  assert.equal(bankGateKind(UNIFIED_BANK), "unified");
  assert.equal(bankGateKind(UNIFIED_EXT_BANK), "ext");
  assert.equal(bankGateKind(UNIFIED_EXT2_BANK), "ext2");
  assert.equal(bankGateKind("walk"), "walk");
  assert.equal(bankGateKind("motion2"), "motion2");
  assert.equal(bankGateKind("motion"), "motion");
  // The three swing sheets share ONE gate, which is why it is the only one
  // that is handed the bank name.
  for (const bank of SWING_BANK_LIST) assert.equal(bankGateKind(bank), "swing");
  // Anything else falls to bank 1, which is what the if-ladder's trailing
  // ternary did: an unknown name degrades to a gate that answers honestly.
  assert.equal(bankGateKind("base"), "motion");
  assert.equal(bankGateKind(undefined), "motion");
  assert.equal(bankGateKind("unified-ext9"), "motion");
}

function testGateDispatch() {
  const calls = [];
  const gates = {};
  for (const kind of ["motion3", "ext2", "swing", "ext", "unified", "walk", "motion2", "motion"]) {
    gates[kind] = (id, cell, bank) => {
      calls.push([kind, id, cell, bank]);
      return true;
    };
  }
  for (const [bank, kind] of Object.entries(BANK_GATE_KIND)) {
    calls.length = 0;
    assert.equal(bankCellDrawable("jez", 3, bank, gates), true);
    assert.equal(calls.length, 1, `${bank} asks exactly one gate`);
    assert.equal(calls[0][0], kind);
    // Only the swing gate is told which sheet it is answering for.
    assert.equal(calls[0][3], kind === "swing" ? bank : undefined);
  }
  // A missing gate answers false rather than throwing: that is the same "no
  // sheet yet" answer the loaders give before their manifest lands.
  assert.equal(bankCellDrawable("jez", 0, UNIFIED_BANK, {}), false);
  // THE FRAME-INDEX CONTRACT. motion3 is addressed by pose NAME and answers
  // with the resolved frame index; frame 0 is a real cell, so a Boolean()
  // anywhere on this path would quietly retire the first cell of every
  // motion3 sheet. resolveMotionPose reads `answer === true` OR an integer.
  assert.equal(bankCellDrawable("jez", "dash", MOTION3_BANK, { motion3: () => 0 }), 0);
  assert.equal(bankCellDrawable("jez", "dash", MOTION3_BANK, { motion3: () => 5 }), 5);
  assert.equal(bankCellDrawable("jez", "dash", MOTION3_BANK, { motion3: () => false }), false);
}

function testGameJsGateTable() {
  // The DOM half: game.js hands one gate per kind, and every kind the table
  // can produce has a row (a missing row is a bank that silently stops
  // drawing).
  const start = gameSource.indexOf("const MOTION_BANK_GATES = Object.freeze({");
  assert.ok(start > 0, "game.js must build the gate table");
  const table = gameSource.slice(start, gameSource.indexOf("});", start));
  for (const kind of new Set(Object.values(BANK_GATE_KIND))) {
    assert.match(table, new RegExp(`\\n\\s*${kind}: \\w+,`), `game.js must supply the ${kind} gate`);
  }
  assert.match(gameSource, /function motionBankCellDrawable\(fighterId, cell, bank\) \{\s*\n\s*return bankCellDrawable\(fighterId, cell, bank, MOTION_BANK_GATES\);\s*\n\}/);
}

// --- the swing family tables ----------------------------------------------

function testSwingTables() {
  // The list, the mask keys and the suffixes must name the SAME three banks
  // fighter-kits registers, or a sheet loads under a gate that never reads it.
  assert.deepEqual([...SWING_BANK_LIST], Object.keys(SWING_BANKS));
  assert.deepEqual(Object.keys(SWING_MASK_KEY), [...SWING_BANK_LIST]);
  assert.deepEqual(Object.keys(SWING_SUFFIX), [...SWING_BANK_LIST]);
  assert.deepEqual(Object.values(SWING_MASK_KEY), ["ext3Masks", "ext4Masks", "ext5Masks"]);
  assert.deepEqual(Object.values(SWING_SUFFIX), ["ext3", "ext4", "ext5"]);
  // Ship order: ext3 (strikes, 5.0), ext4 (reactions, 5.0), ext5 (locomotion,
  // 5.2). The preload asks in this order, so a fight that opens on a strike
  // has its strike sheet first.
  assert.deepEqual([...SWING_BANK_LIST], [UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK, UNIFIED_EXT5_BANK]);
  for (const bank of SWING_BANK_LIST) assert.equal(isSwingBank(bank), true);
  assert.equal(isSwingBank(UNIFIED_EXT2_BANK), false);
  assert.equal(isSwingBank(UNIFIED_BANK), false);
  // The shipped paths, which are the files in assets/unified.
  assert.equal(swingSheetPath("jez", UNIFIED_EXT3_BANK), "assets/unified/jez-ext3.webp");
  assert.equal(swingSheetPath("deathblow", UNIFIED_EXT5_BANK), "assets/unified/deathblow-ext5.webp");
  assert.equal(swingSheetPath("jez", UNIFIED_BANK), null);
  // The mask keys must be the ones game.js actually allocates on the loader
  // state, or swingFighterWhole reads undefined for a whole sheet.
  for (const key of Object.values(SWING_MASK_KEY)) {
    assert.ok(gameSource.includes(`${key}:`), `unifiedBankState must carry ${key}`);
  }
}

// --- the alt-palette atlas resolution --------------------------------------

function testAltAtlasKeys() {
  assert.equal(altAtlasKey("jez", "motion"), "jez:motion");
  assert.equal(altAtlasKey("jez", "motion2"), "jez:motion2");
  assert.equal(altAtlasKey("jez", "motion3"), "jez:motion3");
  assert.equal(altAtlasKey("jez", "walk"), "jez:walk");
  assert.equal(altAtlasKey("jez", UNIFIED_BANK), "jez:unified");
  assert.equal(altAtlasKey("jez", UNIFIED_EXT_BANK), "jez:unified-ext");
  assert.equal(altAtlasKey("jez", UNIFIED_EXT2_BANK), "jez:unified-ext2");
  assert.equal(altAtlasKey("jez", SPECIALS_LEGACY_BANK), "jez:specials-legacy");
  // The three swing sheets share a table, so they MUST key on the bank name.
  const swingKeys = SWING_BANK_LIST.map((bank) => altAtlasKey("jez", bank));
  assert.deepEqual(swingKeys, ["jez:unified-ext3", "jez:unified-ext4", "jez:unified-ext5"]);
  assert.equal(new Set(swingKeys).size, 3, "no two swing sheets may share a cache key");
  // Every key is unique across the whole family: a collision would serve one
  // fighter's remapped sheet where another bank's belongs, and it would only
  // show up when somebody picked palette 2.
  const keys = Object.keys(ALT_ATLAS_TABLE).map((bank) => altAtlasKey("jez", bank));
  assert.equal(new Set(keys).size, keys.length, keys.join(" "));
}

function testAltAtlasSource() {
  const img = (name) => ({ name, complete: true, naturalWidth: 320 });
  const base = img("base");
  const tables = {
    motion: { jez: img("motion") },
    motion2: { jez: img("motion2") },
    motion3: { jez: img("motion3") },
    walk: { jez: img("walk") },
    unified: { jez: img("unified") },
    ext: { jez: img("ext") },
    ext2: { jez: img("ext2") },
    swing: {
      [UNIFIED_EXT3_BANK]: { jez: img("ext3") },
      [UNIFIED_EXT4_BANK]: { jez: img("ext4") },
      [UNIFIED_EXT5_BANK]: { jez: img("ext5") },
    },
    specialsLegacy: { jez: img("legacy") },
    specials: { jez: img("specials") },
    base: { jez: base },
  };
  assert.equal(altAtlasSource("jez", UNIFIED_BANK, tables).image.name, "unified");
  assert.equal(altAtlasSource("jez", UNIFIED_EXT_BANK, tables).image.name, "ext");
  assert.equal(altAtlasSource("jez", UNIFIED_EXT4_BANK, tables).image.name, "ext4");
  assert.equal(altAtlasSource("jez", SPECIALS_LEGACY_BANK, tables).image.name, "legacy");
  assert.equal(altAtlasSource("jez", "motion3", tables).image.name, "motion3");
  // A distinct specials sheet earns its own key...
  assert.deepEqual(altAtlasSource("jez", SPECIALS_BANK, tables), { image: tables.specials.jez, key: "jez:specials" });
  // ...but the BOSS shares one sheet across his banks, so his specials
  // collapses onto the base key rather than caching the same pixels twice.
  const boss = { ...tables, specials: { jez: base } };
  assert.deepEqual(altAtlasSource("jez", SPECIALS_BANK, boss), { image: base, key: "jez:base" });
  // A fighter with no specials sheet at all (the Commissioner's DOM paths
  // address his combat atlas) also lands on base.
  assert.deepEqual(altAtlasSource("jez", SPECIALS_BANK, { ...tables, specials: {} }), { image: base, key: "jez:base" });
  // Anything unrecognised is the base atlas, never undefined.
  assert.equal(altAtlasSource("jez", "base", tables).image, base);
  assert.equal(altAtlasSource("jez", "nonsense", tables).key, "jez:base");
  // game.js must hand every table this file can address, or a bank remaps
  // from undefined and the alt side silently draws the primary.
  const wiring = gameSource.slice(gameSource.indexOf("function altAtlasSource(fighterId, bank) {"),
    gameSource.indexOf("function ensureAltAtlas("));
  for (const field of Object.keys(tables)) {
    assert.match(wiring, new RegExp(`\\n\\s*${field}: fighter\\w+,`), `game.js must supply the ${field} atlas table`);
  }
}

// --- the preload plan ------------------------------------------------------

function testPreloadPlan() {
  const gates = {
    unifiedWhole: (id) => id !== "cyraxx",
    extWhole: (id) => id === "jez",
    ext2Whole: (id) => id !== "post",
    swingWhole: (id, bank) => !(id === "post" && bank === UNIFIED_EXT5_BANK),
  };
  const plan = bankPreloadPlan(["jez", "post", "cyraxx"], gates);
  // v5.1 #35 — REQUEST ORDER IS THE POINT: the unified family first, per
  // fighter, main -> ext -> ext2 -> the swing sheets in ship order.
  assert.deepEqual(plan.unified.map((step) => step.key), [
    "jez:unified", "jez:ext", "jez:ext2", "jez:ext3", "jez:ext4", "jez:ext5",
    "post:unified", "post:ext3", "post:ext4",
  ]);
  assert.deepEqual(plan.unified.map((step) => step.kind).slice(0, 6),
    ["unified", "ext", "ext2", "swing", "swing", "swing"]);
  assert.deepEqual(plan.unified.filter((step) => step.kind === "swing").map((step) => step.bank),
    [UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK, UNIFIED_EXT5_BANK, UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK]);
  // A fighter who is not 16/16 contributes NOTHING — not even his ext sheets,
  // which can never draw without the main one. This is the manifest-BEFORE-
  // sheet order that keeps a fighter with no sheet in the repo from 404ing.
  assert.ok(plan.unified.every((step) => step.id !== "cyraxx"));
  // The motion banks follow, for EVERY fighter (they are per-beat fallbacks,
  // so they are warmed whether or not the unified family is whole).
  assert.deepEqual(plan.motion.map((step) => step.key),
    ["jez:motion", "jez:motion2", "post:motion", "post:motion2", "cyraxx:motion", "cyraxx:motion2"]);
  // The bonus banks gate the REQUEST on their own manifests.
  const bonus = bankPreloadPlan(["jez", "post"], { motion3Any: (id) => id === "jez", walkHas: () => false });
  assert.deepEqual(bonus.bonus.motion3.map((step) => step.key), ["jez:motion3"]);
  assert.deepEqual(bonus.bonus.walk, []);
  // No gates at all: nothing from the unified family, everything from motion.
  const bare = bankPreloadPlan(["jez"]);
  assert.deepEqual(bare.unified, []);
  assert.equal(bare.motion.length, 2);
  // Junk ids are dropped before anything is asked.
  assert.deepEqual(bankPreloadPlan([null, "", 7]).motion, []);
  assert.deepEqual(bankPreloadPlan(null).motion, []);
  // game.js must pass all four unified-family gates, or a sheet silently
  // stops being warmed and the fighter's vocabulary flips mid-round.
  const wiring = gameSource.slice(gameSource.indexOf("const plan = bankPreloadPlan(ids, {"), gameSource.indexOf("for (const step of plan.unified)"));
  for (const gate of ["unifiedWhole", "extWhole", "ext2Whole", "swingWhole"]) {
    assert.match(wiring, new RegExp(`${gate}: \\w+,`), `game.js must pass ${gate}`);
  }
}

// --- the routing table drives the shipped frame chains ---------------------
//
// MOTION-ATLAS.md v5.0 records the acceptance evidence as frame chains read
// off real play. They resolve through this table: every authored cell in them
// is one bankCellDrawable question. Resolving them here with a gate wired
// THROUGH the table proves the extraction did not move a single drawing.

function buildTableGate(id) {
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
  const indexGate = (bank) => (fighterId, cell) => {
    const mask = masks[bank]?.[fighterId];
    if (!mask) return false;
    if ("whole" in mask && !mask.whole) return false;
    return Boolean(mask.accept[cell]);
  };
  const gates = {
    motion3: (fighterId, key) => {
      const mask = masks[MOTION3_BANK]?.[fighterId];
      const frame = keyMap[key];
      return mask && Number.isInteger(frame) && mask.accept[frame] ? frame : false;
    },
    swing: (fighterId, cell, bank) => indexGate(bank)(fighterId, cell),
    unified: indexGate(UNIFIED_BANK),
    ext: indexGate(UNIFIED_EXT_BANK),
    ext2: indexGate(UNIFIED_EXT2_BANK),
    walk: indexGate("walk"),
    motion2: indexGate("motion2"),
    motion: indexGate("motion"),
  };
  // The gate the chain sees is routed ENTIRELY through the extracted table.
  return (cell, bank) => bankCellDrawable(id, cell, bank, gates);
}

const SHORT = {
  [UNIFIED_BANK]: "unified", [UNIFIED_EXT_BANK]: "ext", [UNIFIED_EXT2_BANK]: "ext2",
  [UNIFIED_EXT3_BANK]: "ext3", [UNIFIED_EXT4_BANK]: "ext4", [UNIFIED_EXT5_BANK]: "ext5",
};
const cellName = (pose) => `${SHORT[pose.bank] || pose.bank}:${pose.frame}`;

/** Mirror of the kit-less strike branch in fighterPoseDescriptor (game.js). */
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

function strikeChain(gate, action, context, id = "jez") {
  const beatOpt = Object.freeze({ extended: true, inbetween: true });
  const attack = createFighterMove(id, action, context);
  const roles = baseCellRoles(id);
  const chain = [];
  for (let attackFrame = 0; attackFrame < attack.totalFrames; attackFrame += 1) {
    const pose = kitlessStrikePose(attack, attackFrame, beatOpt, roles);
    const resolved = resolveMotionPose(pose, gate, id, { bareHanded: bareHandedAttack(attack) });
    const fighter = {
      def: { id }, attacking: attack, attackFrame, grounded: !context.airborne, crouch: Boolean(context.crouching),
      hitstunFrames: 0, airHitstunFrames: 0, pendingKnockdown: false, vy: 0,
    };
    const drawn = swingResolve(resolved, swingContext(fighter), gate);
    if (chain.at(-1) !== cellName(drawn)) chain.push(cellName(drawn));
  }
  return chain;
}

function testShippedChainsThroughTheTable() {
  const gate = buildTableGate("jez");
  // The gate still reads the shipped manifests through the table: jez's ext
  // descent is the one cell his ext sheet rejected.
  assert.equal(gate(UNIFIED_EXT_CELLS.jumpDescend, UNIFIED_EXT_BANK), false);
  assert.equal(gate(UNIFIED_EXT3_CELLS.airChamber, UNIFIED_EXT3_BANK), true);
  // motion3 answers with the frame index, through the table, unchanged.
  assert.equal(gate("air-attack-b", MOTION3_BANK), 4);
  // MOTION-ATLAS.md v5.0 / v5.2, "Verified by frame attribution in real play".
  assert.deepEqual(strikeChain(gate, "light", {}),
    ["ext2:0", "ext3:0", "ext3:2", "ext2:1", "unified:7", "unified:0"]);
  assert.deepEqual(strikeChain(gate, "heavy", { limb: "kick" }),
    ["ext:6", "ext2:6", "unified:6", "ext3:14", "ext3:11", "ext2:7", "unified:7", "unified:0"]);
  assert.deepEqual(strikeChain(gate, "light", { crouching: true }),
    ["ext2:8", "ext3:4", "ext2:9", "unified:7", "unified:0"]);
  assert.deepEqual(strikeChain(gate, "heavy", { limb: "kick", crouching: true }),
    ["ext2:10", "ext3:5", "ext3:15", "ext2:11", "unified:7", "unified:0"]);
  assert.deepEqual(strikeChain(gate, "light", { limb: "kick", airborne: true }),
    ["ext3:8", "ext3:7", "motion3:4", "ext5:6", "ext3:10"]);
  // And the same chains on a fighter who is off the swing sheets entirely:
  // the table degrades bank by bank, never all at once.
  const noSwing = (cell, bank) => (SWING_BANK_LIST.includes(bank) ? false : gate(cell, bank));
  assert.deepEqual(strikeChain(noSwing, "light", {}),
    ["ext2:0", "motion:0", "motion:4", "ext2:1", "unified:7", "unified:0"]);
}

test("BK-A every bank routes to exactly one gate, and an unknown bank degrades to bank 1", testGateRouting);
test("BK-B the gate is asked once, told the sheet only when it shares one, and its answer is passed through", testGateDispatch);
test("BK-C game.js supplies a gate for every kind the table can produce", testGameJsGateTable);
test("BK-D the swing family's list, mask keys and suffixes agree with the registered banks", testSwingTables);
test("BK-E every bank's alt-palette cache key is distinct", testAltAtlasKeys);
test("BK-F the alt-palette source reads the right table, and the boss collapses onto base", testAltAtlasSource);
test("BK-G the preload asks the unified family first, in family order, and drops a fighter who is not whole", testPreloadPlan);
test("BK-H the shipped v5.0 frame chains resolve identically through the routing table", testShippedChainsThroughTheTable);
