import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CROWD_SPRITE_BANKS,
  CROWD_SPRITE_COLUMNS,
  STAGE_CROWD_VARIANT,
  createCrowd,
  crowdSnapshot,
} from "../engine/crowd.mjs";

// v4.7 BYSTANDERS — painted crowd sheets: the manifest contract and the
// seeded character deal that rides beside (never inside) the crowd stream.

const testDir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(testDir, "..", "assets", "crowd", "MANIFEST.json"), "utf8"));

function testManifestContract() {
  assert.equal(manifest.cell, 256);
  assert.deepEqual(manifest.columns, ["stand", "shift", "cheer", "stride"]);
  assert.deepEqual(Object.keys(CROWD_SPRITE_COLUMNS), manifest.columns);
  for (const [variant, characters] of Object.entries(CROWD_SPRITE_BANKS)) {
    const entry = manifest.variants[variant];
    assert.ok(entry, `${variant} must have a painted bank`);
    assert.equal(entry.characters.length, characters, `${variant} bank size must match the engine table`);
    assert.ok(entry.sheets.length >= 1);
    for (const character of entry.characters) {
      assert.ok(character.sheet < entry.sheets.length);
      assert.equal(character.cells.length, 4, "stand / shift / cheer / stride");
      for (const cell of character.cells) {
        const cellX = Math.floor(cell.x / manifest.cell) * manifest.cell;
        const cellY = Math.floor(cell.y / manifest.cell) * manifest.cell;
        assert.ok(cell.w > 40 && cell.h > 180, "a full-body figure fills most of its cell");
        assert.ok(cell.baseline > cellY && cell.baseline <= cellY + manifest.cell, "feet sit inside the cell");
        assert.ok(cell.cx >= cellX && cell.cx < cellX + manifest.cell, "centre sits inside the cell");
      }
    }
  }
}

function testSeededCharacterDeal() {
  for (const [stage, variant] of Object.entries(STAGE_CROWD_VARIANT)) {
    const crowd = createCrowd(stage, { seed: 42 });
    const bank = CROWD_SPRITE_BANKS[variant] || 0;
    if (!bank) {
      assert.ok(crowd.people.every((person) => person.sprite === null), `${stage} keeps its plate/cat crowd unpainted`);
      continue;
    }
    let previous = -1;
    for (const person of crowd.people) {
      assert.ok(person.sprite, `${stage} people carry a painted character`);
      assert.ok(person.sprite.character >= 0 && person.sprite.character < bank);
      assert.notEqual(person.sprite.character, previous, "neighbours never share a painting");
      previous = person.sprite.character;
      assert.ok(person.sprite.reactThreshold >= 0.3 && person.sprite.reactThreshold < 0.8);
    }
    for (const group of crowd.scuffles) {
      assert.equal(new Set(group.characters).size, 3, "a scuffle deals three distinct members");
    }
    // The deal is deterministic and lives beside the crowd stream: the people
    // themselves are what they were before painting.
    const again = createCrowd(stage, { seed: 42 });
    assert.deepEqual(again.people.map((person) => person.sprite), crowd.people.map((person) => person.sprite));
    const snapshot = crowdSnapshot(crowd, 0);
    assert.equal(snapshot.spriteBank, bank);
    assert.ok(snapshot.spriteCharacters >= Math.min(bank, 6), `${stage} shows most of its painted cast`);
  }
}

function testPaintingNeverMovesThePeople() {
  // Postures, routes and palettes come off the crowd stream untouched by the
  // sprite stream, so the drinking-posture and visibility floors the smoke
  // pins cannot drift because a sheet was added.
  const crowd = createCrowd("vet", { seed: 7 });
  const stripped = crowd.people.map(({ sprite, ...rest }) => rest);
  const fields = Object.keys(stripped[0]);
  assert.ok(fields.includes("posture") && fields.includes("originX") && fields.includes("coat"));
  assert.ok(!fields.includes("sprite"));
}

testManifestContract();
testSeededCharacterDeal();
testPaintingNeverMovesThePeople();

console.log("Final Blow crowd sprite tests passed");
