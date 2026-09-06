import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STAGE_WEAPONS,
  STAGE_WEAPON_ARRIVALS,
  getStageWeapon,
  getWeaponArrival,
  planStageWeapon,
  stageWeaponIds,
  weaponArrivalOrigin,
  weaponArrivalPose,
} from "../engine/stage-weapons.mjs";
import {
  SCAR_KINDS,
  STAGE_SURFACES,
  describeScar,
  makeStageScar,
  scarDecals,
  scarKindFor,
  stageSurface,
} from "../engine/stage-scars.mjs";
import { STAGE_WEAPON_CLATTER, weaponClatterParams } from "../engine/shared-sfx.mjs";

// 5.3 SPECTACLE — the stage reaches into the fight (sweep #18 + #19).
//
// #18: every stage has a weapon (Janney's loose brick was the hole) and every
// arrival comes off a named piece of that stage on its own path, instead of
// one scorch mark and a 150 px vertical drop with cue text that promised
// something else.
// #19: battle scars are per-material, come from three causes rather than one,
// stand on the walls as well as the floor, and reach CINEMA 3D as decals.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gameSource = readFileSync(join(root, "game.js"), "utf8");
const STAGES = ["somerset", "vet", "wildwood", "buffet", "cruise", "janney"];
const FLOOR = 600;

// A counted, repeatable 0..1 source so every geometry assertion is exact.
function sequence(seed = 1) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

test("every stage has a weapon, and Janney's is the loose brick", () => {
  assert.deepEqual(stageWeaponIds().sort(), [...STAGES].sort());
  const brick = getStageWeapon("janney");
  assert.equal(brick.id, "brick");
  assert.equal(brick.style, "brick");
  assert.equal(brick.name, "LOOSE BRICK");
  // Inside the audited stage-weapon envelope (engine/polish.mjs): damage <=
  // 14, chip <= 2, hitstun <= 24, throw recovery >= 22.
  assert.ok(brick.damage <= 14 && brick.chipDamage <= 2 && brick.hitstunFrames <= 24);
  assert.ok(brick.throwRecoveryFrames >= 22);
  // The heaviest hit in the set, paid for with the shortest throw: it is the
  // slowest object with the strongest gravity, so it drops fastest.
  const others = STAGES.filter((stage) => stage !== "janney").map((stage) => getStageWeapon(stage));
  assert.ok(others.every((weapon) => weapon.damage <= brick.damage), "no weapon hits harder");
  assert.ok(others.every((weapon) => weapon.gravity < brick.gravity), "nothing falls faster");
  // Every id is unique — one themed pickup per stage, still.
  const ids = STAGES.map((stage) => getStageWeapon(stage).id);
  assert.equal(new Set(ids).size, STAGES.length);
  // It plans like the other five (same window, same fair slots).
  const plan = planStageWeapon("janney", { matchSeed: 237, round: 1 });
  assert.equal(plan.weaponId, "brick");
  assert.ok(plan.spawnFrame > 60 * 10 && plan.spawnFrame < 99 * 60);
  assert.deepEqual(plan, planStageWeapon("janney", { matchSeed: 237, round: 1 }));
  assert.notDeepEqual(plan, planStageWeapon("janney", { matchSeed: 237, round: 2 }));
});

test("the brick has its own painter, clatter and pickup sound", () => {
  assert.match(gameSource, /case "brick": \{/);
  assert.ok(STAGE_WEAPON_CLATTER.brick, "the brick has its own clatter material");
  const params = weaponClatterParams("brick", { draw: 0, level: 1 });
  assert.equal(params.style, "brick");
  assert.equal(params.tones.filter((tone) => tone.wave !== "sine").length, 0, "masonry does not ring");
  assert.ok(params.tones[0].from < 120, "a dead low thud");
  // Two consecutive landings never share a pitch (the draw detunes).
  assert.notEqual(weaponClatterParams("brick", { draw: -0.6 }).tones[0].from,
    weaponClatterParams("brick", { draw: 0.6 }).tones[0].from);
  // Picking a weapon up used to be silent on every stage: OBJECT_SOUNDS had
  // no entry for any of the five styles.
  const table = gameSource.slice(gameSource.indexOf("const OBJECT_SOUNDS"), gameSource.indexOf("function noiseBurst"));
  for (const style of ["needle", "bottle", "pigeon", "tongs", "cup", "brick"]) {
    assert.match(table, new RegExp(`\\n\\s*${style}: \\[`), `${style} has a pickup sound`);
  }
});

test("every arrival comes off a named piece of its stage and ends on the slot", () => {
  assert.deepEqual(Object.keys(STAGE_WEAPON_ARRIVALS).sort(), [...STAGES].sort());
  const kinds = STAGES.map((stage) => getWeaponArrival(stage).kind);
  assert.deepEqual(kinds, ["stairs", "lob", "rail", "counter", "chair", "wall"]);
  assert.equal(new Set(kinds).size, STAGES.length, "no two stages share a choreography");
  for (const stage of STAGES) {
    for (const landingX of [392, 640, 888]) {
      const origin = weaponArrivalOrigin(stage, landingX, { floor: FLOOR });
      assert.ok(origin.x >= 76 && origin.x <= 1204, `${stage} source stays on the plate`);
      assert.ok(origin.y < FLOOR - 100, `${stage} source is off the floor`);
      const start = weaponArrivalPose(stage, landingX, 0, { floor: FLOOR });
      assert.equal(Math.round(start.x), Math.round(origin.x));
      assert.equal(Math.round(start.y), Math.round(origin.y));
      // The landing slot, the frame and telegraphFrames are untouched by the
      // choreography: pose(1) is exactly the 5.2 grounded draw.
      const end = weaponArrivalPose(stage, landingX, 1, { floor: FLOOR });
      assert.equal(end.x, landingX);
      assert.equal(end.y, FLOOR);
      assert.equal(end.leg, "rest");
      assert.equal(end.airborne, false);
      // Continuous: no sample jumps more than 140 px between 2% steps, so the
      // object is never seen to teleport between legs.
      let previous = start;
      let travelled = 0;
      let airborne = false;
      const legs = new Set();
      for (let step = 1; step <= 50; step += 1) {
        const pose = weaponArrivalPose(stage, landingX, step / 50, { floor: FLOOR });
        const jump = Math.hypot(pose.x - previous.x, pose.y - previous.y);
        assert.ok(jump < 140, `${stage} arrival is continuous (${jump.toFixed(1)} px at ${step / 50})`);
        assert.ok(pose.y <= FLOOR + 0.001, `${stage} arrival never sinks below the floor`);
        travelled += jump;
        airborne = airborne || pose.airborne;
        legs.add(pose.leg);
        previous = pose;
      }
      assert.ok(travelled > 140, `${stage} arrival actually travels (${travelled.toFixed(0)} px)`);
      assert.ok(airborne, `${stage} arrival leaves the ground at some point`);
      assert.ok(legs.size >= 2, `${stage} arrival has more than one leg`);
    }
  }
  // A stage with no entry keeps the 5.2 vertical drop as the fallback.
  const fallback = weaponArrivalPose("nowhere", 640, 0, { floor: FLOOR });
  assert.equal(fallback.leg, "drop");
  assert.equal(fallback.x, 640);
  assert.equal(fallback.y, FLOOR - 150);
});

test("the cue text names the furniture the arrival actually uses", () => {
  const words = {
    somerset: /STAIRS/,
    vet: /STANDS/,
    wildwood: /RAIL/,
    buffet: /COUNTER/,
    cruise: /DECK CHAIR/,
    janney: /WALL/,
  };
  for (const stage of STAGES) {
    const cue = getStageWeapon(stage).cue;
    assert.match(cue, words[stage], `${stage} cue names its source`);
    // ...and the arrival's own prose agrees with the cue.
    const from = getWeaponArrival(stage).from.toUpperCase();
    const noun = from.split(" ").pop();
    assert.ok(cue.includes(noun), `${stage} cue and arrival agree on "${noun}"`);
  }
});

test("the arrival is presentation only: plan and landing slots are unchanged", () => {
  // The 5.2 plan for the five stages that already had a weapon must be
  // byte-identical, or replays and rollback peers would disagree. These are
  // the values HEAD produces for (seed 1, round 1) on Somerset.
  assert.deepEqual(planStageWeapon("somerset", { matchSeed: 1, round: 1 }), {
    weaponId: "needle",
    stageId: "somerset",
    slot: 2,
    x: 640,
    spawnFrame: 1054,
    telegraphFrames: 48,
    groundFrames: 540,
  });
  // The pose function never moves the landing point, whatever the path.
  for (const stage of STAGES) {
    const slotPlan = planStageWeapon(stage, { matchSeed: 99, round: 2 });
    assert.equal(weaponArrivalPose(stage, slotPlan.x, 1, { floor: FLOOR }).x, slotPlan.x);
  }
});

test("each floor is its own material and wears more than one flavour", () => {
  assert.deepEqual(Object.keys(STAGE_SURFACES).sort(), [...STAGES].sort());
  assert.equal(stageSurface("buffet"), "tile");
  assert.equal(stageSurface("wildwood"), "planks");
  assert.equal(stageSurface("cruise"), "poolDeck");
  assert.equal(stageSurface("janney"), "rubble");
  assert.equal(stageSurface("nowhere"), "asphalt", "an unknown stage falls back to asphalt");
  for (const stage of STAGES) {
    const kinds = new Set();
    for (let roll = 0; roll < 30; roll += 1) kinds.add(scarKindFor(stage, "knockdown", { roll: roll / 30 }));
    assert.ok(kinds.size >= 2, `${stage} knockdowns leave more than one flavour`);
    for (const kind of kinds) assert.ok(SCAR_KINDS[kind], `${kind} is a known kind`);
  }
  // The material shows: only the wet deck puddles, only the boards splinter.
  const knockdownKinds = (stage) => new Set(Array.from({ length: 30 },
    (_, roll) => scarKindFor(stage, "knockdown", { roll: roll / 30 })));
  assert.ok(knockdownKinds("cruise").has("splash"));
  assert.ok(!knockdownKinds("wildwood").has("splash"));
  assert.ok(knockdownKinds("wildwood").has("splinter"));
  assert.ok(!knockdownKinds("somerset").has("splinter"));
  assert.ok(knockdownKinds("buffet").has("spill"), "the buffet floor ends up with food on it");
});

test("a thrown weapon leaves ITS mess, wherever it lands", () => {
  for (const stage of STAGES) {
    assert.equal(scarKindFor(stage, "weapon", { weaponStyle: "bottle" }), "shards");
    assert.equal(scarKindFor(stage, "weapon", { weaponStyle: "cup" }), "splash");
    assert.equal(scarKindFor(stage, "weapon", { weaponStyle: "brick" }), "dent");
    assert.equal(scarKindFor(stage, "weapon", { weaponStyle: "tongs" }), "dent");
  }
  // An unknown style falls back to the floor's own table.
  assert.ok(SCAR_KINDS[scarKindFor("wildwood", "weapon", { weaponStyle: "anvil", roll: 0 })]);
});

test("scar geometry: floor marks lie down, wall marks stand up, debris scales", () => {
  const random = sequence(7);
  const floorScar = makeStageScar({ x: 400, y: 640, stageId: "vet", cause: "knockdown", force: 1.2, tick: 9, random });
  assert.equal(floorScar.wall, 0);
  assert.equal(floorScar.surface, "asphalt");
  assert.ok(floorScar.heavy, "force over 1.02 is a heavy mark");
  // A floor crack is squashed into the floor perspective (0.34), so its
  // vertical reach is far shorter than its horizontal one.
  const spread = (points) => ({
    x: Math.max(...points.map(([x]) => Math.abs(x))),
    y: Math.max(...points.map(([, y]) => Math.abs(y))),
  });
  const flat = spread(floorScar.points);
  assert.ok(flat.y < flat.x, "a floor mark lies in the floor plane");
  const wallScar = makeStageScar({
    x: 1204, y: 430, stageId: "vet", cause: "wall", wall: 1, force: 1.1, tick: 9, kind: "crack", random,
  });
  assert.equal(wallScar.wall, 1);
  const upright = spread(wallScar.points);
  assert.ok(upright.y > flat.y, "a wall mark stands up instead of lying squashed");
  // Debris count comes from the kind, not the caller.
  const glass = makeStageScar({ x: 600, stageId: "buffet", cause: "weapon", weaponStyle: "bottle", random });
  const plain = makeStageScar({ x: 600, stageId: "somerset", cause: "knockdown", kind: "crack", random });
  assert.equal(glass.kind, "shards");
  assert.ok(glass.debris.length >= SCAR_KINDS.shards.debris);
  assert.equal(plain.debris.length, 0);
  // Repeatable: the same stream builds the same scar.
  const a = makeStageScar({ x: 600, stageId: "cruise", cause: "knockdown", random: sequence(3) });
  const b = makeStageScar({ x: 600, stageId: "cruise", cause: "knockdown", random: sequence(3) });
  assert.deepEqual(a, b);
  assert.match(describeScar(wallScar), /^wall\/crack@wallR:1204$/);
  assert.match(describeScar(floorScar), /^knockdown\/(crack|skid)@floor:400$/);
});

test("the decal view carries what CINEMA 3D needs and nothing else", () => {
  const random = sequence(11);
  const scars = [
    makeStageScar({ x: 300, y: 640, stageId: "cruise", cause: "knockdown", random }),
    makeStageScar({ x: 1204, y: 420, stageId: "cruise", cause: "wall", wall: 1, random }),
  ];
  const decals = scarDecals(scars);
  assert.equal(decals.length, 2);
  assert.deepEqual(Object.keys(decals[0]).sort(),
    ["alpha", "heavy", "kind", "rot", "surface", "wall", "width", "x", "y"]);
  assert.ok(decals.every((decal) => decal.width > 0 && decal.alpha > 0));
  assert.equal(decals[1].wall, 1);
  assert.equal(scarDecals([]).length, 0);
});

test("game.js pushes scars from all three causes and hands them to the bridge", () => {
  // Knockdown (the 5.0 site), wall splat (the arena edge) and stage-weapon
  // impacts — the whole point of #19 is that this list is longer than one.
  assert.match(gameSource, /pushStageScar\(fighter\.x, force, \{ cause: "knockdown" \}\)/);
  assert.match(gameSource, /\{ cause: "wall", wall: wallDirection, y: impactY \}/);
  assert.match(gameSource, /pushStageScar\(projectile\.x, 1\.05, \{ cause: "weapon", weaponStyle: projectile\.style \}\)/);
  // A stage weapon has bounces: 0, so the landing phase is "expired" — the
  // mark has to hang off both, behind a floor check.
  assert.match(gameSource, /\(phase === "bounce" \|\| phase === "expired"\) && projectile\.stageWeapon/);
  assert.match(gameSource, /projectile\.y >= FLOOR - projectile\.height \* 0\.5 - 1/);
  assert.match(gameSource, /pushStageScar\(weapon\.x, 0\.95, \{ cause: "weapon", weaponStyle: profile\.style \}\)/);
  // The wall push sits inside spawnWallImpact, after its own cooldown latch.
  const splat = gameSource.slice(gameSource.indexOf("function spawnWallImpact("),
    gameSource.indexOf("function performWallBounce("));
  assert.ok(splat.includes('cause: "wall"'), "the wall splat marks the wall");
  assert.ok(splat.indexOf("wallSplatLastTick[fighter.side] = tick;") < splat.indexOf('cause: "wall"'),
    "the splat cooldown still dedupes the mark");
  // The model comes from the engine module, and the bridge view is exported.
  assert.match(gameSource, /from "\.\/engine\/stage-scars\.mjs"/);
  assert.match(gameSource, /function stageScarDecals\(\) \{\n  return scarDecals\(stageScars\);\n\}/);
  assert.match(gameSource, /stageScars: stageScarDecals,/);
  // Still module-level, still rollback-guarded, still capped and deduped.
  assert.match(gameSource, /function pushStageScar\(x, force = 1, options = \{\}\) \{\n  if \(rollbackResimulating\) return null;/);
  assert.match(gameSource, /scar\.tick === tick && scar\.wall === wall && Math\.abs\(scar\.x - x\) < 1/);
  assert.match(gameSource, /const cap = state\.performance\.trailScale === 0 \? STAGE_SCAR_CAP_BATTERY : STAGE_SCAR_CAP;/);
});

test("the 3D decal layer is wired and reads the bridge", () => {
  const layer = readFileSync(join(root, "renderer", "three", "scar-decals.mjs"), "utf8");
  const main = readFileSync(join(root, "renderer", "three", "main.mjs"), "utf8");
  const objects = readFileSync(join(root, "renderer", "three", "world-objects.mjs"), "utf8");
  assert.match(layer, /host\.stageScars\?\.\(\) \?\? \[\]/);
  assert.match(layer, /import \{ SCAR_KINDS \} from "\.\.\/\.\.\/engine\/stage-scars\.mjs";/);
  assert.match(layer, /rotation\.set\(-Math\.PI \/ 2, 0, decal\.rot\)/, "floor decals lie on the ground plane");
  assert.match(main, /new ScarDecalLayer\(host\)/);
  assert.match(main, /layers\.set\("scarDecals", scarDecals\)/);
  assert.match(main, /scars: renderer3d\.scarDecals\?\.visibleCount \?\? 0/);
  // The 3D telegraph rides the SAME choreography as the 2D one.
  assert.match(objects, /import \{ getWeaponArrival, weaponArrivalPose \} from "\.\.\/\.\.\/engine\/stage-weapons\.mjs";/);
  assert.match(objects, /weaponArrivalPose\(weapon\.stageId, weapon\.x, progress, \{ floor: SIM_FLOOR \}\)/);
  assert.match(objects, /if \(telegraphing && !arrival\) \{/, "the vertical streak only survives without a choreography");
});
