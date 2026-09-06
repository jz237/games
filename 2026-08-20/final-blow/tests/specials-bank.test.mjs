// v5.3 SPECIALS — the kit bank in the unified generation.
//
// assets/moves/<id>-specials.webp is what every special, EX, super and throw
// release draws (fighter-kits `anim(row)`). Until 5.3 it was the BASE
// generation, so a special crossed generations twice on the beat the move is
// watched. These tests hold the three things that can silently rot: the sheet
// metrics in the manifest, the two engine tables derived from them, and the
// per-cell fallback that keeps a rejected cell on the shipped drawing.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORED_BANKS,
  FIGHTER_KITS,
  MOTION_CELL_COUNT,
  SPECIALS_BANK,
  SPECIALS_LEGACY_BANK,
  attackAnimationPose,
  auditSpecialsCellAdjust,
  baseCellDrawAdjust,
  cellDrawAdjust,
  createFighterMove,
  getFighterKit,
  isAuthoredBank,
} from "../engine/fighter-kits.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const root = join(testDir, "..");
const manifest = JSON.parse(readFileSync(join(root, "assets", "moves", "MANIFEST.json"), "utf8"));
const gameSource = readFileSync(join(root, "game.js"), "utf8");
const kitSource = readFileSync(join(root, "engine", "fighter-kits.mjs"), "utf8");
const threeSource = readFileSync(join(root, "renderer", "three", "fighters.mjs"), "utf8");

// The nine fighters who HAVE a specials sheet. The Commissioner is the tenth
// roster member and deliberately absent: his kit poses address his combat
// atlas, so the bank's gate must never touch him.
const SHEET_IDS = ["deathblow", "jez", "alan", "post", "donald", "devil", "ali", "benny", "cyraxx"];
// Where the unified slicer puts the last drawn row of every cell (floorRow-1).
const FLOOR_ROW = 314;

function tableLiteral(source, name) {
  const start = source.indexOf(`const ${name} = Object.freeze({`);
  assert.ok(start >= 0, `${name} not found`);
  const body = source.slice(start, source.indexOf("});", start));
  const out = {};
  for (const [, id, value] of body.matchAll(/([a-z]+):\s*([0-9.]+)/g)) out[id] = Number(value);
  return out;
}

function testManifestShape() {
  assert.deepEqual(Object.keys(manifest.fighters).sort(), [...SHEET_IDS].sort());
  assert.ok(!("commissioner" in manifest.fighters), "the Commissioner has no specials sheet");
  assert.match(manifest.format.acceptGate, /specials-legacy/);
  for (const id of SHEET_IDS) {
    const entry = manifest.fighters[id];
    assert.equal(entry.sheet, `assets/moves/${id}-specials.webp`);
    assert.equal(entry.fallbackSheet, `assets/moves/legacy/${id}-specials.webp`);
    assert.ok(statSync(join(root, entry.sheet)).size > 0, `${id} sheet ships`);
    assert.ok(statSync(join(root, entry.fallbackSheet)).size > 0, `${id} fallback ships`);
    assert.equal(entry.cells.length, MOTION_CELL_COUNT, `${id} is a whole 4x4 bank`);
    entry.cells.forEach((cell, index) => {
      assert.equal(cell.frame, index, `${id} cell ${index} is in grammar order`);
      assert.equal(typeof cell.accept, "boolean", `${id}:${index} has an accept flag`);
      assert.ok(cell.height > 80 && cell.height <= 320, `${id}:${index} height ${cell.height}`);
      // The whole point of re-slicing the bank: every cell's content bottoms on
      // ONE row, the unified family's. The shipped sheets bottomed anywhere
      // from 277 to 320, which is why five fighters levitated through a
      // special (the cell is floor-anchored, so an empty band under the feet
      // IS the fighter leaving the street).
      assert.equal(cell.bottom, FLOOR_ROW, `${id}:${index} plants on the shared floor row`);
      assert.ok(cell.drawAdjust >= 1 && cell.drawAdjust <= 1.75, `${id}:${index} adjust ${cell.drawAdjust}`);
      assert.ok(cell.bodyCentre > 100 && cell.bodyCentre < 300, `${id}:${index} centre ${cell.bodyCentre}`);
      if (!cell.accept) assert.ok(cell.reject?.length > 20, `${id}:${index} says WHY it was rejected`);
    });
    // The bank is one generation, and the record says how close it got.
    assert.ok(entry.de.vsUnifiedCostumeOnly < entry.deShipped.vsUnifiedCostumeOnly + 0.4,
      `${id} costume dE against his unified sheet did not get worse`);
    assert.ok(entry.de.vsUnifiedCostumeOnly <= 3.3, `${id} costume dE ${entry.de.vsUnifiedCostumeOnly}`);
    assert.match(entry.sheetAdjustFrom, /median/);
  }
}

function testRejectedCells() {
  // 143 of the 144 cells were accepted in the side-by-side review; the one
  // that was not is the devil's launcher wind-up, and it is the reason the
  // fallback exists at all. If a later wave re-generates it, this number moves
  // — deliberately, with the manifest.
  const rejected = SHEET_IDS.flatMap((id) => manifest.fighters[id].cells
    .filter((cell) => !cell.accept).map((cell) => `${id}:${cell.frame}`));
  assert.deepEqual(rejected, ["devil:8"]);
  assert.match(manifest.fighters.devil.cells[8].reject, /crouched gather/);
}

function testEngineTablesMatchTheArt() {
  assert.deepEqual(auditSpecialsCellAdjust(), []);
  for (const id of SHEET_IDS) {
    for (const cell of manifest.fighters[id].cells) {
      // The per-cell fit restore IS the manifest's drawAdjust — the engine
      // table cannot drift from the sheet it was measured on.
      assert.equal(baseCellDrawAdjust(id, SPECIALS_BANK, cell.frame), cell.drawAdjust,
        `${id}:${cell.frame} draw adjust`);
      // cellDrawAdjust is the ONE rule both renderers call, and for this bank
      // it is exactly the fit restore (no guard flinch, no stand-in).
      assert.equal(cellDrawAdjust(id, SPECIALS_BANK, cell.frame, { unified: true }), cell.drawAdjust);
      // The fallback bank is the SHIPPED art: it must never be rescaled.
      assert.equal(baseCellDrawAdjust(id, SPECIALS_LEGACY_BANK, cell.frame), 1);
    }
  }
  const adjust = tableLiteral(gameSource, "MOVE_SHEET_ADJUST");
  const legacy = tableLiteral(gameSource, "MOVE_SHEET_LEGACY_ADJUST");
  for (const id of SHEET_IDS) {
    assert.equal(adjust[id], manifest.fighters[id].sheetAdjust, `${id} sheet adjust matches the manifest`);
    assert.notEqual(legacy[id], undefined, `${id} keeps a legacy sheet adjust`);
  }
  // The Commissioner's sheet did not change, so neither did his correction,
  // and the two tables agree about him.
  assert.equal(adjust.commissioner, 1.02);
  assert.equal(legacy.commissioner, 1.02);
  // The fallback generation is the shipped art at the shipped size.
  assert.deepEqual(legacy, {
    deathblow: 1.14, jez: 1.03, alan: 1.06, post: 1.02, benny: 1.02,
    donald: 1.04, cyraxx: 1.05, ali: 1.04, devil: 1.04, commissioner: 1.02,
  });
}

function testEveryAnimatedMoveDrawsTheBank() {
  const accept = Object.fromEntries(SHEET_IDS.map((id) =>
    [id, manifest.fighters[id].cells.map((cell) => cell.accept)]));
  const redirect = (id, pose) => (pose.bank === SPECIALS_BANK && accept[id]?.[pose.frame] === false
    ? { ...pose, bank: SPECIALS_LEGACY_BANK } : pose);
  const bankOf = (id, pose) => {
    // A beat that rides over the kit cell carries that cell as its fallback;
    // the terminal cell is what the bank has to own.
    let current = pose;
    while (current?.fallback) current = current.fallback;
    return redirect(id, current);
  };

  let moves = 0;
  let legacyTicks = 0;
  for (const id of Object.keys(FIGHTER_KITS)) {
    const kit = getFighterKit(id);
    assert.equal(kit.victory.bank, SPECIALS_BANK, `${id} wins on the kit bank`);
    assert.equal(kit.victory.frame, 15, `${id} wins on cell 15`);
    const reached = new Set();
    for (const name of Object.keys(kit.moves)) {
      if (!kit.moves[name].animation) continue;
      const attack = createFighterMove(id, name) || kit.moves[name];
      const total = attack.totalFrames ?? attack.activeEndFrame + 1;
      let sawBank = false;
      for (let frame = 0; frame <= total; frame += 1) {
        const pose = attackAnimationPose(attack, frame, { inbetween: true });
        if (!pose) continue;
        const terminal = bankOf(id, pose);
        if (terminal.bank !== SPECIALS_BANK && terminal.bank !== SPECIALS_LEGACY_BANK) continue;
        sawBank = true;
        reached.add(terminal.frame);
        if (terminal.bank === SPECIALS_LEGACY_BANK) legacyTicks += 1;
      }
      assert.ok(sawBank, `${id} ${name} draws the kit bank`);
      moves += 1;
    }
    // Every cell of the 4x4 is reachable: four rows of four, and the row-3
    // wind-up (12) only through the super's charge-stance fallback.
    assert.equal(reached.size, MOTION_CELL_COUNT, `${id} reaches all 16 cells (${[...reached].sort((a, b) => a - b)})`);
  }
  assert.equal(moves, 100, "ten kits x ten animated moves");
  assert.ok(legacyTicks > 0, "the rejected cell actually routes to the fallback");
}

function testBankRegistry() {
  // Neither bank is authored. "specials" was never in the list (the 3D rig
  // builds it at rig build), and the legacy sheet must stay out of it too:
  // AUTHORED_BANKS is what warmFighterBanks walks at idle, and warming a
  // 1280px sheet that serves ONE cell on ONE fighter is a texture nobody asked
  // for. It is built the first time that cell resolves instead.
  assert.ok(!AUTHORED_BANKS.includes(SPECIALS_BANK));
  assert.ok(!AUTHORED_BANKS.includes(SPECIALS_LEGACY_BANK));
  assert.ok(!isAuthoredBank(SPECIALS_BANK) && !isAuthoredBank(SPECIALS_LEGACY_BANK));
  assert.equal(SPECIALS_BANK, "specials");
  assert.equal(SPECIALS_LEGACY_BANK, "specials-legacy");
  assert.match(kitSource, /if \(bank === SPECIALS_BANK\) return SPECIALS_CELL_ADJUST\[fighterId\]\?\.\[frame\] \|\| 1;/);
}

function testGameWiring() {
  // The redirect runs at the single pose-resolution choke point, after the
  // swing resolver, so every consumer (drawFighter, the observers, the cast
  // shadow, the CINEMA 3D bridge, the QA pose hook) reads the same answer.
  assert.match(gameSource, /const pose = specialsGenerationPose\(fighter\.def\.id, swung\);/);
  assert.match(gameSource, /function specialsGenerationPose\(fighterId, pose\)/);
  // No manifest entry means no gate — the Commissioner and the boss share
  // their combat atlas as their specials bank and must never be redirected.
  const gate = gameSource.slice(gameSource.indexOf("function specialsCellDrawable("),
    gameSource.indexOf("function specialsCellDrawable(") + 320);
  assert.match(gate, /if \(!entry\) return true;/);
  // Both banks size through bankSheetAdjust, from their own tables.
  assert.match(gameSource, /if \(bank === "specials"\) return MOVE_SHEET_ADJUST\[fighterId\] \|\| 1;\n\s*if \(bank === SPECIALS_LEGACY_BANK\) return MOVE_SHEET_LEGACY_ADJUST\[fighterId\] \|\| 1;/);
  // ...and resolve to an atlas everywhere an atlas is resolved by bank.
  for (const fn of ["altAtlasSource", "paletteAtlas"]) {
    const body = gameSource.slice(gameSource.indexOf(`function ${fn}(`), gameSource.indexOf(`function ${fn}(`) + 2600);
    assert.ok(body.includes("SPECIALS_LEGACY_BANK"), `${fn} resolves the fallback bank`);
  }
  assert.match(gameSource, /fighterMoveLegacyAtlases\[fighter\.def\.id\] \|\| fighterAtlases\[fighter\.def\.id\]/,
    "the cast-shadow pass resolves it too");
  // The gate and its sheet are warm before the first special, not on it.
  assert.match(gameSource, /ensureWalkManifest\(\);\n(?:\s*\/\/[^\n]*\n)*\s*ensureMovesManifest\(\);/);
}

function testHdRetired() {
  // An HD variant of a bank that has been redrawn is the same fault the wave
  // removes, with an extra download: the 3D rig would have run its WHOLE
  // specials bank on the old generation while the canvas ran the new one.
  assert.ok(!/-specials"/.test(gameSource.slice(gameSource.indexOf("const HD_SHEETS"),
    gameSource.indexOf("const HD_SHEETS") + 400)), "HD_SHEETS lists no specials sheet");
  assert.match(gameSource, /return bank === "base" && HD_SHEETS\.has\(fighterId\) \? `renderer\/hd\/\$\{fighterId\}\.webp` : null;/);
  for (const id of SHEET_IDS) {
    assert.ok(!existsSync(join(root, "renderer", "hd", `${id}-specials.webp`)), `${id} HD specials is gone`);
  }
  const hd = JSON.parse(readFileSync(join(root, "renderer", "hd", "MANIFEST.json"), "utf8"));
  assert.ok(hd.files.every((file) => !file.hd.includes("-specials")));
  assert.equal(hd.retired_2026_09_v5_3.files.length, 8);
  assert.ok(hd.retired_2026_09_v5_3.bytes_removed > 9e6);
}

function testCinemaWiring() {
  // The 3D layer reads the fallback bank the same lazy way it reads motion:
  // SD only, no renderer/hd request, and its own sheet-adjust table.
  assert.match(threeSource, /import \{ AUTHORED_BANKS, SPECIALS_LEGACY_BANK, UNIFIED_BANK \}/);
  assert.match(threeSource, /pose\.bank === SPECIALS_LEGACY_BANK && !this\.ensureMotionBank\(rig, fighter, pose\.bank\)/);
  assert.match(threeSource, /: pose\.bank === SPECIALS_LEGACY_BANK && rig\.banks\[SPECIALS_LEGACY_BANK\] \? SPECIALS_LEGACY_BANK/);
  assert.match(threeSource, /bankName === SPECIALS_LEGACY_BANK \? \(host\.moveSheetLegacyAdjust\?\.\[fighter\.def\.id\] \|\| 1\)/);
  assert.ok(!/hdFor\("specials"?-?legacy?"?\)/.test(threeSource));
}

testManifestShape();
testRejectedCells();
testEngineTablesMatchTheArt();
testEveryAnimatedMoveDrawsTheBank();
testBankRegistry();
testGameWiring();
testHdRetired();
testCinemaWiring();

console.log("Final Blow specials bank tests passed");
