import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CINEMA_HOST_MEMBERS,
  CINEMA_HOST_OPTIONAL,
  CINEMA_HOST_REQUIRED,
  assertHostContract,
  missingHostMembers,
} from "../renderer/three/host-contract.mjs";

// 5.1 CINEMA 3D host contract + gameplay reads.
//
// renderer/three imports "three" through the browser import map, so Node
// cannot load main.mjs; the contract therefore lives in its own dependency-
// free module and this suite pins it from both ends over the SOURCE:
//   (a) every `host.<member>` the 3D layer reads is declared in the contract;
//   (b) every declared member is a key of the literal game.js hands to
//       createRenderer (the bridge cannot silently lose a member);
//   (c) main.mjs actually asserts the contract before it builds anything.
// Plus the 5.1 read wiring: the 2D painters take a foreign context, the host
// exposes them, and the overlay pass runs after the world restore.

const testDir = dirname(fileURLToPath(import.meta.url));
const root = join(testDir, "..");
const gameSource = readFileSync(join(root, "game.js"), "utf8");
const threeDir = join(root, "renderer", "three");
const threeSources = Object.fromEntries(readdirSync(threeDir)
  .filter((name) => name.endsWith(".mjs"))
  .map((name) => [name, readFileSync(join(threeDir, name), "utf8")]));

// Line comments and block comments carry prose like `host.x` — strip them.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

// The object literal passed to createRenderer in ensureCinema3d(): keys are
// one per line, shorthand (`state,`) or `key: value`, comments excluded.
function hostLiteralKeys() {
  const start = gameSource.indexOf("module.createRenderer({");
  assert.ok(start > 0, "game.js builds the host with module.createRenderer({ ... })");
  const end = gameSource.indexOf("\n    });", start);
  assert.ok(end > start, "host literal closes");
  const literal = stripComments(gameSource.slice(start, end));
  const keys = new Set();
  for (const match of literal.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*[:,]/gm)) keys.add(match[1]);
  return keys;
}

function hostReads() {
  const reads = new Map();
  for (const [name, source] of Object.entries(threeSources)) {
    for (const match of stripComments(source).matchAll(/\bhost\??\.([A-Za-z_$][\w$]*)/g)) {
      if (!reads.has(match[1])) reads.set(match[1], new Set());
      reads.get(match[1]).add(name);
    }
  }
  return reads;
}

test("contract lists are disjoint, non-empty and frozen", () => {
  assert.ok(CINEMA_HOST_REQUIRED.length >= 12);
  assert.ok(CINEMA_HOST_OPTIONAL.length >= 10);
  const overlap = CINEMA_HOST_REQUIRED.filter((name) => CINEMA_HOST_OPTIONAL.includes(name));
  assert.deepEqual(overlap, []);
  assert.equal(new Set(CINEMA_HOST_MEMBERS).size, CINEMA_HOST_MEMBERS.length, "no duplicate member");
  assert.ok(Object.isFrozen(CINEMA_HOST_MEMBERS));
});

test("every host member the 3D layer reads is declared in the contract", () => {
  const reads = hostReads();
  const undeclared = [...reads.keys()].filter((name) => !CINEMA_HOST_MEMBERS.includes(name));
  assert.deepEqual(undeclared, [], `undeclared host reads: ${undeclared.map((name) => `${name} (${[...reads.get(name)].join(", ")})`).join("; ")}`);
  // ...and the contract carries no dead members either.
  const unread = CINEMA_HOST_MEMBERS.filter((name) => !reads.has(name));
  assert.deepEqual(unread, [], `contract members nothing reads: ${unread.join(", ")}`);
  // The 5.1 reads are real reads, not just declarations.
  for (const name of ["paintProjectile", "paintTrap", "stageWeaponProfile", "fighterScale"]) {
    assert.ok(reads.get(name)?.has("world-objects.mjs"), `${name} is read by world-objects.mjs`);
  }
});

test("game.js hands createRenderer every contract member, and nothing undeclared", () => {
  const keys = hostLiteralKeys();
  const missing = CINEMA_HOST_MEMBERS.filter((name) => !keys.has(name));
  assert.deepEqual(missing, [], `host literal lacks: ${missing.join(", ")}`);
  const extra = [...keys].filter((name) => !CINEMA_HOST_MEMBERS.includes(name));
  assert.deepEqual(extra, [], `host literal passes undeclared members: ${extra.join(", ")}`);
});

test("missingHostMembers / assertHostContract report by tier", () => {
  assert.deepEqual(missingHostMembers({}), {
    required: [...CINEMA_HOST_REQUIRED],
    optional: [...CINEMA_HOST_OPTIONAL],
  });
  const full = Object.fromEntries(CINEMA_HOST_MEMBERS.map((name) => [name, () => null]));
  assert.deepEqual(missingHostMembers(full), { required: [], optional: [] });
  const warnings = [];
  assert.equal(assertHostContract(full, { warn: (message) => warnings.push(message) }), true);
  assert.deepEqual(warnings, []);
  const { paintTrap, ...noTrap } = full;
  assert.throws(() => assertHostContract(noTrap, { warn: () => {} }), /missing required member\(s\) paintTrap/);
  const { crowdBillboards, ...noCrowd } = full;
  assert.equal(assertHostContract(noCrowd, { warn: (message) => warnings.push(message) }), true);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /crowdBillboards/);
  assert.equal(missingHostMembers(null).required.length, CINEMA_HOST_REQUIRED.length);
});

test("main.mjs asserts the contract first and registers the world-objects layer", () => {
  const main = threeSources["main.mjs"];
  assert.match(main, /import \{ assertHostContract, CINEMA_HOST_MEMBERS \} from "\.\/host-contract\.mjs";/);
  const assertAt = main.indexOf("assertHostContract(host);");
  const rendererAt = main.indexOf("const renderer3d = {");
  assert.ok(assertAt > 0 && assertAt < rendererAt, "contract asserted before the renderer object is built");
  assert.match(main, /new WorldObjectsLayer\(host\)/);
  assert.match(main, /layers\.set\("worldObjects", worldObjects\)/);
  assert.match(main, /objects: renderer3d\.worldObjects\?\.visibleCount \?\? 0/);
});

test("the 2D painters take a foreign context and the 2D world pass still uses them", () => {
  // The refactor must leave the 2D path drawing through the same functions.
  assert.match(gameSource, /function drawThrowable\(projectile, time, life\) \{\n  drawThrowableWith\(ctx, projectile, time, life\);\n\}/);
  assert.match(gameSource, /function drawThrowableWith\(c, projectile, time, life, options = \{\}\)/);
  assert.match(gameSource, /if \(owner && options\.cable !== false\) \{/);
  assert.match(gameSource, /drawPaintTrapWith\(ctx, trap, time\);/);
  assert.match(gameSource, /function drawPaintTrapWith\(c, trap, time\)/);
  assert.match(gameSource, /drawProjectileBodyWith\(ctx, projectile, time, life, pulse\);/);
  assert.match(gameSource, /function drawProjectileBodyWith\(c, projectile, time, life, pulse\)/);
  // No painter body still touches the module `ctx` (it would draw on the
  // game canvas while the 3D layer thinks it is painting an impostor).
  for (const name of ["drawThrowableWith", "drawPaintTrapWith", "drawProjectileBodyWith"]) {
    const start = gameSource.indexOf(`function ${name}(`);
    const end = gameSource.indexOf("\n}\n", start);
    const body = gameSource.slice(start, end);
    assert.ok(!/\bctx\./.test(body), `${name} never touches the module ctx`);
  }
  // The host exposes them, keyed on the sim's own throwable split.
  assert.match(gameSource, /paintProjectile: \(context, projectile, timeMs, options\) => \{/);
  assert.match(gameSource, /if \(projectile\.throwable\) \{\n\s+drawThrowableWith\(context, projectile, timeMs, life, options\);/);
  assert.match(gameSource, /drawProjectileBodyWith\(context, projectile, timeMs, life, pulse\);/);
  assert.match(gameSource, /paintTrap: \(context, trap, timeMs\) => drawPaintTrapWith\(context, trap, timeMs\),/);
});

test("the CINEMA 3D overlay pass draws the 2D-only reads after the world restore", () => {
  // Runs exactly once, after ctx.restore(), only while the 3D world is live
  // on the fight screen.
  const restoreAt = gameSource.indexOf("if (distortionRing) worldScreenTransform = ctx.getTransform();\n  ctx.restore();");
  assert.ok(restoreAt > 0);
  const callAt = gameSource.indexOf('if (cinema3dWorld && state.screen === "fight") drawCinema3dOverlayReads(time);');
  assert.ok(callAt > restoreAt && callAt - restoreAt < 600, "overlay pass follows the world restore");
  assert.equal(gameSource.split("drawCinema3dOverlayReads(time)").length, 3, "one definition, one call");
  const start = gameSource.indexOf("function drawCinema3dOverlayReads(time) {");
  const body = gameSource.slice(start, gameSource.indexOf("\n}\n", start));
  // Every read the 2D world pass owns, replayed through the same function.
  assert.match(body, /drawRhythmRings\(fighter, time\)/);
  assert.match(body, /drawDizzyStars\(fighter, time\)/);
  assert.match(body, /drawGuardCrushMarker\(fighter, time\)/);
  assert.match(body, /drawCombatTextBody\(effect, alpha\)/);
  assert.match(body, /strokeText\(profile\.name, weapon\.x, tagY\)/);
  assert.match(body, /presentationDebug\.cinema3dOverlayReads \+= drawn;/);
  // Anchored through the live framing camera, scaled by the projected size
  // of 100 sim px (the CRT-punch pattern), never a fixed screen size.
  assert.match(gameSource, /const above = project\(simX, simY - 100\);/);
  assert.match(gameSource, /const scale = clamp\(\(at\.y - above\.y\) \/ 100, 0\.35, 2\.5\);/);
  // The 2D world pass still draws the same reads through the shared bodies.
  assert.match(gameSource, /^  drawRhythmRings\(fighter, time\);$/m);
  assert.match(gameSource, /if \(effect\.kind === "combatText"\) \{\n\s+drawCombatTextBody\(effect, alpha\);/);
  assert.match(gameSource, /cinema3dOverlayReads: 0,/);
});

test("the 3D fighter layer carries the super-ready read (rim uniform, aura, embers)", () => {
  const fighters = threeSources["fighters.mjs"];
  assert.match(fighters, /uniform float uFbReadyRim;/);
  assert.match(fighters, /uniform vec3 uFbReadyColor;/);
  assert.match(fighters, /totalEmissiveRadiance \+= uFbReadyColor \* \(uFbReadyRim \* \(fbEdgeAny \* 1\.35 \+ 0\.05\)\);/);
  // A new uniform means a new program: the cache key must move with it.
  // v12 (5.1, #45): uFbTopTint — the per-stage top-light body multiplier;
  // v13 (5.1, #28): the tempo-tell uniforms (uFbWhiffRim / uFbRearmDim).
  assert.match(fighters, /customProgramCacheKey = \(\) => "fb-sprite-grade-v13"/);
  assert.match(fighters, /bank\.fb\.readyRim\.value = superReady \? 0\.55 \+ readyPulse \* 0\.45 : 0;/);
  // Same ember formula as the 2D aura, hashed from the sim tick.
  assert.match(fighters, /const cycleFrames = 66 \+ \(ember % 3\) \* 14;/);
  assert.match(fighters, /hash01\(Math\.floor\(clock \/ cycleFrames\) \* 13 \+ ember \* 7 \+ fighter\.side \* 101\)/);
  assert.match(fighters, /const emberY = sizePx \* \(0\.66 \+ progress \* 0\.32\);/);
  // Gated exactly like the 2D pass: reduced motion / battery trail scale.
  assert.match(fighters, /const showEmbers = superReady && !reducedMotion && trailScale > 0;/);
  assert.match(fighters, /rig\.aura\.geometry\.dispose\(\);/);
});

test("world-objects paints every live object through the host and keeps text on the overlay", () => {
  const objects = threeSources["world-objects.mjs"];
  assert.match(objects, /host\.paintProjectile\(c, projectile, timeMs, \{ cable: false \}\)/);
  assert.match(objects, /host\.paintTrap\(c, trap, timeMs\)/);
  assert.match(objects, /host\.stageWeaponProfile\(\)/);
  for (const phase of ['"telegraph"', '"ground"']) assert.ok(objects.includes(phase), `handles ${phase}`);
  assert.match(objects, /fighter\.carriedWeapon/);
  // Reads sit in front of the fighter plane; the carried weapon behind it
  // (the 2D hand covers it), never text on a quad.
  assert.match(objects, /const OBJECT_Z = 0\.1;/);
  assert.match(objects, /const CARRY_Z = -0\.03;/);
  assert.ok(!/fillText|strokeText/.test(objects), "no text painted into impostors");
  // 1 canvas px = 1 sim px at 2x: the impostor is the same drawing.
  assert.match(objects, /const SUPERSAMPLE = 2;/);
  assert.match(objects, /const s = size \/ \(extentPx \* 2\);/);
});
