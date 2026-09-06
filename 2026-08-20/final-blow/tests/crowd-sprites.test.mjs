import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CROWD_FLINCH,
  CROWD_LAYERS,
  CROWD_MOOD_TILT,
  CROWD_SPRITE_BANKS,
  CROWD_SPRITE_BORROW,
  CROWD_SPRITE_COLUMNS,
  CROWD_VARIANTS,
  STAGE_CROWD_VARIANT,
  createCrowd,
  crowdFlinchLevel,
  crowdMemberMood,
  crowdPosition,
  crowdSheetVariant,
  crowdSnapshot,
} from "../engine/crowd.mjs";
import { stirCrowdReaction } from "../engine/crowd-reaction.mjs";

// v4.7 BYSTANDERS — painted crowd sheets: the manifest contract and the
// seeded character deal that rides beside (never inside) the crowd stream.

const testDir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(testDir, "..", "assets", "crowd", "MANIFEST.json"), "utf8"));
const gameSource = readFileSync(join(testDir, "..", "game.js"), "utf8");
const crowdLayerSource = readFileSync(join(testDir, "..", "renderer", "three", "crowd-layer.mjs"), "utf8");

function testManifestContract() {
  assert.equal(manifest.cell, 256);
  assert.deepEqual(manifest.columns, ["stand", "shift", "cheer", "stride"]);
  assert.deepEqual(Object.keys(CROWD_SPRITE_COLUMNS), manifest.columns);
  for (const [variant, characters] of Object.entries(CROWD_SPRITE_BANKS)) {
    // v5.3 CROWD DEPTH: a variant either owns a sheet family or borrows a
    // named subset of another's, and the engine's bank size is the size of
    // whichever list the draw actually indexes.
    const loan = CROWD_SPRITE_BORROW[variant];
    const entry = manifest.variants[crowdSheetVariant(variant)];
    assert.ok(entry, `${variant} must have a painted bank`);
    if (loan) {
      assert.equal(loan.characters.length, characters, `${variant} borrows ${characters} characters`);
      assert.equal(new Set(loan.characters).size, characters, `${variant} borrows distinct characters`);
      for (const index of loan.characters) {
        assert.ok(entry.characters[index], `${variant} borrows ${loan.from} character ${index}`);
      }
      continue;
    }
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

// --- v5.3 CROWD DEPTH -----------------------------------------------------

// Every painted character is classified, and only a painting that is actually
// holding a phone may pop a flashbulb — with the point ON the phone.
function testPhoneClassification() {
  assert.equal(manifest.version, "5.3");
  const props = new Set(manifest.props);
  assert.ok(props.has("phone") && props.has("cup") && props.has("plate"));
  const phonesPerVariant = {};
  for (const [variant, entry] of Object.entries(manifest.variants)) {
    let phones = 0;
    for (const character of entry.characters) {
      assert.ok(props.has(character.prop), `${variant} character prop "${character.prop}" must be classified`);
      assert.equal(character.phone, character.prop === "phone");
      if (!character.phone) {
        for (const cell of character.cells) {
          assert.equal(cell.hand, undefined, `${variant} only a phone holder carries a hand point`);
        }
        continue;
      }
      phones += 1;
      for (const cell of character.cells) {
        assert.ok(cell.hand, `${variant} phone cell ${cell.frame} needs its hand point`);
        assert.ok(cell.hand.x >= cell.x && cell.hand.x < cell.x + cell.w, "the phone sits inside the figure's box");
        assert.ok(cell.hand.y >= cell.y && cell.hand.y < cell.y + cell.h, "the phone sits inside the figure's box");
        // Measured: the phone is always held above the waist, never down at
        // a beer cup's height. baseline - hand.y is the height up the body.
        const up = (cell.baseline - cell.hand.y) / cell.h;
        assert.ok(up > 0.55, `${variant} cell ${cell.frame} holds the phone at ${(up * 100).toFixed(0)}% body height`);
      }
    }
    phonesPerVariant[variant] = phones;
  }
  // The measurement behind the change: 1 of 8 tailgate and 1 of 8 poolside
  // characters holds a phone; boardwalk and buffet hold food, drinks, bags
  // and plates in every cell, so those two stages pop nothing until a phone
  // character is painted for them. Before 5.3 the pick came off the POSTURE
  // prop, which is dealt on a different stream from the painting, so a flash
  // could fire beside a plate of crab legs.
  assert.deepEqual(phonesPerVariant, { tailgate: 1, boardwalk: 0, buffet: 0, poolside: 1 });
}

// Somerset: eight bystanders standing where the plate says a person stands,
// painted from a borrowed bank, plus one street argument.
function testSomersetBystanders() {
  const variant = CROWD_VARIANTS.somerset;
  assert.equal(variant.spriteBorrow, "tailgate");
  assert.equal(crowdSheetVariant("somerset"), "tailgate");
  assert.equal(variant.stations.length, 8);
  assert.equal(CROWD_SPRITE_BANKS.somerset, CROWD_SPRITE_BORROW.somerset.characters.length);
  for (const seed of [1, 7, 42, 99, 2600]) {
    const crowd = createCrowd("somerset", { seed });
    assert.equal(crowd.people.length, 8, "the plate's nine sitters are untouched; these are the standing eight");
    assert.equal(crowd.embeddedPeople, 9);
    assert.equal(crowd.grade, "night", "a borrowed bank is re-lit for the stage that borrows it");
    assert.equal(crowd.paintedOnly, true, "no arcade vector figure ever lands on the photoreal plate");
    assert.equal(crowd.scuffles.length, 1);
    assert.ok(["argue", "shove", "separate"].includes(crowd.scuffles[0].kind), "no tailgate celebration on a wet street");
    // Stationed: they never walk the band, so they cannot stride across the
    // fight lane or off their own doorway.
    for (const person of crowd.people) {
      assert.ok(person.stationed);
      const layer = CROWD_LAYERS.find((band) => band.id === person.layer);
      let min = Infinity;
      let max = -Infinity;
      for (let frame = 0; frame < 3600; frame += 7) {
        const { x } = crowdPosition(person, layer, frame, crowd.span, crowd.minX);
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
      assert.ok(max - min <= person.roam * 2 + 0.001, `a stationed person roams at most ${person.roam}px either side`);
      assert.ok(min >= 0 && max <= 1280, "and stays on the plate");
    }
    assert.equal(crowd.people.filter((person) => person.lift > 0).length, 2, "two wait on the station steps");
    const snapshot = crowdSnapshot(crowd, 0);
    assert.equal(snapshot.stationed, 8);
    assert.equal(snapshot.sheetVariant, "tailgate");
    assert.equal(snapshot.spriteBank, 4);
  }
}

// The per-round favourite: dealt on its own seeded stream, always a real
// split, and it never moves a person or a painting.
function testFavourites() {
  for (const [stage, variantId] of Object.entries(STAGE_CROWD_VARIANT)) {
    if (!CROWD_SPRITE_BANKS[variantId]) continue;
    for (const seed of [1, 7, 42, 99]) {
      const crowd = createCrowd(stage, { seed });
      const [home, away] = crowdSnapshot(crowd, 0).favourites;
      assert.equal(home + away, crowd.people.length, `${stage} everyone is here for somebody`);
      // Dealt from an exact deck, not flipped per person, so BOTH halves are
      // always on screen — eight independent coins put Somerset at 7/1.
      assert.ok(home >= 2 && away >= 2, `${stage} seed ${seed} split ${home}/${away}`);
      assert.ok(Math.abs(home - away) <= crowd.people.length * 0.36, `${stage} seed ${seed} split ${home}/${away}`);
      for (const person of crowd.people) {
        assert.ok(person.sprite.loyalty >= 0.55 && person.sprite.loyalty < 1.0001);
      }
      for (const group of crowd.scuffles) assert.ok(group.favourite === 0 || group.favourite === 1);
      const again = createCrowd(stage, { seed });
      assert.deepEqual(again.people.map((person) => person.sprite), crowd.people.map((person) => person.sprite));
    }
  }
  // The favour stream rides BESIDE the painting stream, which rides beside
  // the people: strip the two added fields and the 4.7 sprite deal is what
  // it was, so no pin measured before 5.3 can have moved.
  const crowd = createCrowd("vet", { seed: 42 });
  for (const person of crowd.people) {
    assert.deepEqual(Object.keys(person.sprite), [
      "character", "shiftPeriod", "shiftLength", "shiftOffset", "reactThreshold", "favourite", "loyalty",
    ]);
  }
}

// One hit, two crowds.
function testMoodsSplitTheRoom() {
  const home = { reactThreshold: 0.4, favourite: 0, loyalty: 1 };
  const away = { reactThreshold: 0.4, favourite: 1, loyalty: 1 };
  // Authorless stir (a taunt, a stage beat): exactly the pre-5.3 read.
  for (const sprite of [home, away]) {
    const mood = crowdMemberMood(sprite, { reaction: 0.9, stirSide: -1 });
    assert.equal(mood.mood, "cheer");
    assert.equal(mood.column, CROWD_SPRITE_COLUMNS.cheer);
  }
  // A hit by side 0: the home half goes up, the away half hunches and leans.
  const up = crowdMemberMood(home, { reaction: 0.9, stirSide: 0, awaySign: 1 });
  const down = crowdMemberMood(away, { reaction: 0.9, stirSide: 0, awaySign: 1 });
  assert.equal(up.mood, "cheer");
  assert.equal(up.column, CROWD_SPRITE_COLUMNS.cheer);
  assert.equal(down.mood, "wince");
  assert.equal(down.column, CROWD_SPRITE_COLUMNS.shift, "the painted crowd's own weight-shift cell");
  assert.ok(down.tilt > 0.05, `a wince leans away (${down.tilt.toFixed(3)} rad)`);
  assert.ok(up.tilt < 0, "a cheer leans into the fight");
  // And the mirror when the other side lands one.
  assert.equal(crowdMemberMood(away, { reaction: 0.9, stirSide: 1 }).mood, "cheer");
  assert.equal(crowdMemberMood(home, { reaction: 0.9, stirSide: 1 }).mood, "wince");
  // Below their own threshold nobody reacts at all, either way.
  assert.equal(crowdMemberMood(home, { reaction: 0.2, stirSide: 0 }).mood, "idle");
  assert.equal(crowdMemberMood(away, { reaction: 0.2, stirSide: 0 }).mood, "idle");
  // The lean is signed by where the person stands, so a wince is away from
  // the fight and not all one way across the room.
  const left = crowdMemberMood(away, { reaction: 0.9, stirSide: 0, awaySign: -1 });
  assert.equal(Math.sign(left.tilt), -1);
  assert.equal(Math.abs(left.tilt).toFixed(6), Math.abs(down.tilt).toFixed(6));
  // Loyalty scales it: a lukewarm bystander barely moves.
  const soft = crowdMemberMood({ ...away, loyalty: 0.55 }, { reaction: 0.9, stirSide: 0 });
  assert.ok(soft.tilt < down.tilt && soft.tilt > 0);
  assert.ok(down.tilt <= CROWD_MOOD_TILT.wince + 1e-9);
  // Reduced motion keeps the cell swap (that is what makes the split
  // readable) and drops every lean and duck to zero.
  const reduced = crowdMemberMood(away, { reaction: 0.9, stirSide: 0, reducedMotion: true });
  assert.equal(reduced.mood, "wince");
  assert.equal(reduced.column, CROWD_SPRITE_COLUMNS.shift);
  assert.equal(reduced.tilt, 0);
  assert.equal(reduced.duck, 0);
}

// The flinch: a wall splat rocks whoever is standing near it, regardless of
// who they are here for.
function testFlinchOutranksAllegiance() {
  assert.equal(crowdFlinchLevel(600, 600, -1), 0, "no splat, no flinch");
  assert.equal(crowdFlinchLevel(600, 600, CROWD_FLINCH.ticks), 0, "the window closes");
  assert.equal(crowdFlinchLevel(600, 600 + CROWD_FLINCH.radius, 0), 0, "outside the radius");
  const atImpact = crowdFlinchLevel(600, 600, 0);
  assert.ok(atImpact > 0.99, "hardest at the impact on the tick it lands");
  assert.ok(crowdFlinchLevel(700, 600, 0) < atImpact, "and falls off with distance");
  assert.ok(crowdFlinchLevel(600, 600, 13) < atImpact, "and with age");
  const home = { reactThreshold: 0.4, favourite: 0, loyalty: 1 };
  const flinched = crowdMemberMood(home, { reaction: 1.4, stirSide: 0, flinch: 0.8, awaySign: 1 });
  assert.equal(flinched.mood, "flinch", "a body hitting the wall beside you outranks your own fighter landing it");
  assert.equal(flinched.column, CROWD_SPRITE_COLUMNS.shift);
  assert.ok(flinched.tilt > CROWD_MOOD_TILT.wince, "a flinch leans harder than a wince");
  assert.ok(flinched.duck > 0, "and ducks");
  // Far from the splat the same person still cheers his fighter's hit.
  assert.equal(crowdMemberMood(home, { reaction: 1.4, stirSide: 0, flinch: 0 }).mood, "cheer");
}

// Both renderers must resolve a member through the same pure mood, or the
// canvas and the 3D world will disagree about who is cheering.
function testRenderersAgree() {
  // Every hit path names its author.
  assert.match(gameSource, /function applyViolenceResponse\(kind, \{[^}]*side = -1, splatX = null[^}]*\} = \{\}\) \{/);
  assert.match(gameSource, /stirCrowd\(profile\.crowd \* counterScale, "", \{ side, splatX \}\);/);
  assert.match(gameSource, /function stirCrowd\(amount = 1, kind = "", \{ side = -1, splatX = null \} = \{\}\)/);
  // v5.3 (sweep #52): the stir's own bookkeeping — who it was for, where it
  // landed, the ceiling — is engine/crowd-reaction.mjs, so "a named stir
  // sticks and an authorless one does not clear it" is asserted rather than
  // grepped. (tests/crowd-reaction.test.mjs carries the rest.)
  const stirred = { crowdReaction: 0, crowdStirSide: -1, crowdSplatX: 0, crowdSplatTick: -1e9 };
  stirCrowdReaction(stirred, 0.6, { side: 1, splatX: 480, tick: 300 });
  assert.deepEqual(stirred, { crowdReaction: 0.6, crowdStirSide: 1, crowdSplatX: 480, crowdSplatTick: 300 });
  stirCrowdReaction(stirred, 0.2);
  assert.equal(stirred.crowdStirSide, 1, "an authorless stir keeps the last author");
  // ... and the mood is resolved once, in the engine, for both renderers.
  const frame = gameSource.slice(gameSource.indexOf("function crowdSpriteFrame("), gameSource.indexOf("function crowdFightCentre("));
  assert.match(frame, /crowdFlinchLevel\(x, state\.crowdSplatX, frame - state\.crowdSplatTick\)/);
  assert.match(frame, /crowdMemberMood\(person\.sprite, \{/);
  assert.match(frame, /stirSide: state\.crowdStirSide,/);
  assert.match(frame, /return \{ column, bob: bob - mood\.duck, tilt: mood\.tilt, mood: mood\.mood \};/);
  // The 2D sprite leans about its feet, before the mirror.
  const draw = gameSource.slice(gameSource.indexOf("function drawCrowdSprite("), gameSource.indexOf("function drawPedestrian("));
  assert.match(draw, /if \(tilt\) ctx\.rotate\(tilt\);\s*\n\s*ctx\.scale\(person\.direction, 1\);/);
  // The 3D billboard carries the same lean (it sent tilt: 0 for people from
  // 4.8 through 5.2), plus the step and the grade.
  const billboards = gameSource.slice(gameSource.indexOf("function crowdBillboards("), gameSource.indexOf("// Six tapped steel kegs"));
  assert.doesNotMatch(billboards, /tilt: 0,/, "a person's lean must reach the 3D layer");
  assert.match(billboards, /direction: person\.direction, alpha: layer\.alpha \* holdDim, tilt, mood, grade,/);
  assert.match(billboards, /lift: person\.lift \|\| 0,/);
  assert.match(crowdLayerSource, /const lift = \(spec\.lift \|\| 0\) \* LIFT_PER_PX;/);
  assert.match(crowdLayerSource, /mesh\.rotation\.z = -spec\.tilt;/);
  assert.match(crowdLayerSource, /const tone = GRADE_TONE\[grade\] \|\| null;/);
  // A flashbulb comes off a painting that holds a phone, never off a posture.
  const flashes = gameSource.slice(gameSource.indexOf("function crowdFlashPicks("), gameSource.indexOf("function drawCrowdFlash("));
  assert.doesNotMatch(flashes, /person\.prop === "phone"/, "the posture prop is a different stream from the painting");
  assert.match(flashes, /entry\?\.characters\?\.\[person\.sprite\?\.character\]\?\.phone/);
  assert.match(flashes, /if \(!crowdFlashCandidates\.length\) return \[\];/);
  // ... and lands ON the phone.
  const crowdDraw = gameSource.slice(gameSource.indexOf("function drawCrowd("), gameSource.indexOf("function drawVetAtmosphere("));
  assert.match(crowdDraw, /if \(cell\.hand\) \{/);
  assert.match(crowdDraw, /x: drawX \+ \(cell\.hand\.x - cell\.cx\) \* drawScale \* person\.direction,/);
  // A painted-only crowd never falls back to the arcade vector figure.
  assert.match(gameSource, /if \(state\.crowd\?\.paintedOnly\) return;/);
}

testManifestContract();
testSeededCharacterDeal();
testPaintingNeverMovesThePeople();
testPhoneClassification();
testSomersetBystanders();
testFavourites();
testMoodsSplitTheRoom();
testFlinchOutranksAllegiance();
testRenderersAgree();

console.log("Final Blow crowd sprite tests passed");
