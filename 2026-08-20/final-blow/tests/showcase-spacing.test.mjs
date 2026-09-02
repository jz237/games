import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMockWorld } from "./demo-mock-world.mjs";

// ---------------------------------------------------------------------------
// v3.5 SHOWCASE SPACING — "also separate the players slightly so it doesnt get
// confusing with them too close."
//
// The `?rigdemo=` exhibition is a DeathBlow MIRROR MATCH: identical character,
// identical costume, one side drawn by the rig and one by the sprite bank. An
// overlap there is not cosmetic — it is the A/B comparison failing, because you
// cannot tell which limb came out of which renderer.
//
// Measured with a per-tick probe over the fixed showcase seed, before -> after:
//
//                        overall median   <120px    <150px
//   shipped (3.4)              164px       28.3%     45.0%
//   this wave                  238px       13.4%     19.8%
//
//   and restricted to NEUTRAL ticks (both fighters free — the "two identical
//   men standing on top of each other" case the owner is describing):
//
//   shipped (3.4)              247px       10.6%     17.4%
//   this wave                  330px        1.4%      2.6%
//
// THE CONTRACT THIS FILE PINS DOWN is the scoping, not the numbers: every one
// of the three nudges must be unreachable outside a live showcase, so versus,
// arcade, training, online and the ordinary attract demo keep the spacing and
// the pushboxes they ship with.
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME_SOURCE = readFileSync(join(HERE, "..", "game.js"), "utf8");
const CHOREO_SOURCE = readFileSync(join(HERE, "..", "engine", "demo-choreo.mjs"), "utf8");

test("the attract demo never cuts a stroll lease, so the showcase band is unreachable", () => {
  // The stroll lease is the only thing that reads STROLL_SHOWCASE_FLOOR, and
  // `strollWindow` bails on `locomotionShare <= 0` BEFORE it draws an rng
  // number. An attract exhibition passes 0, so it cannot reach the wider band
  // and its rng stream is bit-identical to what it has always been.
  const attract = createMockWorld({
    pair: ["deathblow", "jez"], stageId: "somerset", hasStageWeapon: true, seed: 3200,
  });
  for (let frame = 0; frame < 6000; frame += 1) attract.tick();
  assert.equal(attract.choreo.stats().strollLeases, 0,
    "an attract exhibition must never cut a locomotion lease");
  assert.equal(attract.choreo.stats().strollTicks, 0);

  // The showcase does, which is what makes the floor live code rather than
  // dead code — and it is the ONLY caller.
  const showcase = createMockWorld({
    pair: ["deathblow", "deathblow"], stageId: "somerset", hasStageWeapon: true,
    seed: 3200, locomotion: 0.75,
  });
  for (let frame = 0; frame < 6000; frame += 1) showcase.tick();
  assert.ok(showcase.choreo.stats().strollLeases > 0,
    "the showcase must still stroll — the locomotion bias is the point of it");
});

test("an attract exhibition still covers the whole kit with the wider band in the file", () => {
  // The band edit must not have starved the pipeline it shares a module with.
  const { choreo, tick } = createMockWorld({
    pair: ["deathblow", "jez"], stageId: "somerset", hasStageWeapon: true, seed: 237,
  });
  for (let frame = 0; frame < 14_000; frame += 1) tick();
  for (const fighterId of ["deathblow", "jez"]) {
    assert.deepEqual(choreo.coverage()[fighterId].missingMoves, [],
      `${fighterId} must still show 100% of its kit`);
  }
});

test("the stroll floor is applied only where a lease is cut", () => {
  const code = CHOREO_SOURCE.split("\n").filter((line) => !line.trim().startsWith("//"));
  const uses = code.filter((line) => line.includes("STROLL_SHOWCASE_FLOOR")).length;
  assert.equal(uses, 3, "one declaration and the two band edges, nothing else");
  // Both edges of the band move together, so the band keeps its full width and
  // the stroll still reads as a there-and-back rather than a standoff.
  assert.ok(/lease\.near = STROLL_SHOWCASE_FLOOR \+ 150 \+/.test(CHOREO_SOURCE));
  assert.ok(/lease\.far = STROLL_SHOWCASE_FLOOR \+ 380 \+/.test(CHOREO_SOURCE));
});

test("every spacing nudge in game.js is behind the showcase gate", () => {
  // 1. The wider opening.
  assert.ok(/function fighterHomeX\(side\) \{\n\s+const home = showcaseActive\(\) \? SHOWCASE_HOME_X : FIGHTER_HOME_X;/
    .test(GAME_SOURCE), "the round-start position must fall back to FIGHTER_HOME_X");
  assert.ok(/x: fighterHomeX\(side\),/.test(GAME_SOURCE),
    "makeFighter must spawn through it rather than a literal pair");
  assert.ok(/const FIGHTER_HOME_X = \[355, 925\];/.test(GAME_SOURCE),
    "the shipped home positions must be untouched");

  // 2/3. The legibility drift bails before it touches anything outside a
  //      showcase, and it runs AFTER the real pushbox pass so it can never
  //      mask or fight it.
  assert.ok(/if \(!showcaseActive\(\) \|\| state\.phase !== "fight" \|\| state\.finisher\) return;/
    .test(GAME_SOURCE), "the drift must bail immediately outside a live showcase");
  assert.ok(/separateFighters\(\);\n(?:\s*\/\/[^\n]*\n)*\s*driftShowcaseFightersApart\(\);/
    .test(GAME_SOURCE), "the drift must run after separateFighters, never instead of it");
  assert.ok(/demoSession\.active && demoSession\.showcase/.test(GAME_SOURCE),
    "the gate must require a LIVE showcase session");

  // The sim's own pushboxes are untouched: no showcase term may reach them.
  const separate = GAME_SOURCE.slice(GAME_SOURCE.indexOf("function separateFighters()"));
  const body = separate.slice(0, separate.indexOf("\n}"));
  assert.ok(!/showcase/i.test(body),
    "separateFighters must stay showcase-blind — real play keeps the shipped pushbox");
  assert.ok(/standingPushboxHalfWidth: spatial\(39\)/
    .test(readFileSync(join(HERE, "..", "engine", "defense.mjs"), "utf8")),
    "the pushbox half-widths themselves must be unchanged");
});

test("the drift stands down for anything that would change the fight", () => {
  // A live hitbox, a reaction, a throw, a dash or an airborne arc is COMMITTED:
  // moving that fighter would make a staged move whiff or re-time a reaction.
  // An attack's recovery is not, and that tail is exactly where a landed
  // exchange leaves the pair standing inside each other.
  const source = GAME_SOURCE.slice(GAME_SOURCE.indexOf("function showcaseCommitted(fighter)"));
  const body = source.slice(0, source.indexOf("\n}\n"));
  for (const field of [
    "grounded", "down", "grabbing", "grabbed", "hitstunFrames", "blockstunFrames",
    "pendingKnockdown", "knockdownFrames", "wakeupFrames", "dizzyFrames",
    "guardCrushFrames", "dashFrames",
  ]) {
    assert.ok(body.includes(field), `a committed fighter must include ${field}`);
  }
  assert.ok(/fighter\.attackFrame <= fighter\.attacking\.activeEndFrame/.test(body),
    "startup and the active window are committed; the recovery is not");
});
