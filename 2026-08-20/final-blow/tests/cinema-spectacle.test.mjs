import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PLATE_H,
  PLATE_W,
  PRACTICAL_STAGES,
  STAGE_PRACTICALS,
  FIREWORK_TICKS,
  fireworkShots,
  practicalLevel,
  practicalSpill,
} from "../engine/stage-practicals.mjs";
import {
  PARTICLE_CHANNELS,
  afterimageGhost,
  chargeGlowAlpha,
  chargeGlowRadius,
  damageDecalKey,
  elementFrameIndex,
  elementSpriteAlpha,
  particleChannel,
  particleMote,
} from "../engine/vfx-bridge.mjs";
import { ambientSurge, ambientKoBeat, ambientPulseLevel, createAmbientObs, pulseAmbientLatch } from "../engine/ambient.mjs";

// ---------------------------------------------------------------------------
// v5.3 SPECTACLE (#16/#43/#47/#48) — CINEMA 3D stops being a dead card.
//
// Before this wave the five generic 3D stages had a literally empty update(),
// the KO pulse was never even LATCHED while the 3D world was on (its latch
// lived inside the 2D-only drawStageAmbient), and four whole effect families
// were simulated every frame and drawn by nobody. renderer/three cannot be
// imported in Node (it resolves "three" through the browser import map), so
// this suite pins the two ends that CAN be: the pure math both renderers read,
// and the source wiring that carries it across the bridge.
// ---------------------------------------------------------------------------

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");
const gameSource = read("game.js");
const stageGeneric = read("renderer/three/stage-generic.mjs");
const stageSomerset = read("renderer/three/stage-somerset.mjs");
const effectsLayer = read("renderer/three/effects-layer.mjs");
const fightersLayer = read("renderer/three/fighters.mjs");
const mainSource = read("renderer/three/main.mjs");

// --- the practicals table ---------------------------------------------------

test("every generic 3D stage has practicals, pinned to the plate", () => {
  // main.mjs registers exactly these five ids on the generic builder.
  assert.deepEqual(PRACTICAL_STAGES, ["vet", "wildwood", "buffet", "cruise", "janney"]);
  for (const id of PRACTICAL_STAGES) {
    const specs = STAGE_PRACTICALS[id];
    assert.ok(specs.length >= 3, `${id} carries at least three practicals`);
    const ids = specs.map((spec) => spec.id);
    assert.equal(new Set(ids).size, ids.length, `${id} practical ids are unique`);
    for (const spec of specs) {
      // Positions are plate coordinates: the 1280x720 canvas drawStageAmbient
      // paints into, which is the same image the 3D backdrop card hangs.
      assert.ok(spec.x >= 0 && spec.x <= PLATE_W, `${id}/${spec.id} x on the plate`);
      assert.ok(spec.y >= 0 && spec.y <= PLATE_H, `${id}/${spec.id} y on the plate`);
      assert.ok(spec.gain > 0, `${id}/${spec.id} answers a surge at all`);
      assert.ok(Object.isFrozen(spec));
    }
    // At least one practical throws a real point light out toward the fight
    // plane — otherwise a KO brightens a distant decal and nothing else.
    assert.ok(specs.some((spec) => spec.spill > 0), `${id} has a spill light`);
  }
});

test("the Vet's floodlights sit exactly where the 2D pass paints them", () => {
  // game.js drawStageAmbient: `for (const [lx, ly] of [[125, 88], [1230, 232]])`.
  assert.match(gameSource, /for \(const \[lx, ly\] of \[\[125, 88\], \[1230, 232\]\]\)/);
  const heads = STAGE_PRACTICALS.vet.filter((spec) => spec.id.startsWith("flood"));
  assert.deepEqual(heads.map((spec) => [spec.x, spec.y]), [[125, 88], [1230, 232]]);
  // ...and the buffet's five pendants, ditto.
  assert.match(gameSource, /\[40, 330, 640, 940, 1240\]/);
  assert.deepEqual(
    STAGE_PRACTICALS.buffet.filter((spec) => spec.id.startsWith("pendant")).map((spec) => spec.x),
    [40, 330, 640, 940, 1240],
  );
});

test("practicalLevel: idle at rest, swells with the surge, KO swells harder", () => {
  const flood = STAGE_PRACTICALS.vet[0];
  const rest = practicalLevel(flood, { level: 0, ko: false }, 0, 0.5, true);
  assert.equal(Number(rest.toFixed(4)), flood.idle);
  const hit = practicalLevel(flood, { level: 1, ko: false }, 0, 0.5, true);
  const ko = practicalLevel(flood, { level: 1, ko: true }, 0, 0.5, true);
  assert.ok(hit > rest * 4, `a full pulse is a real swell (${rest} -> ${hit})`);
  assert.ok(ko > hit, `a KO burns hotter than a big hit (${hit} -> ${ko})`);
  assert.equal(Number((ko - hit).toFixed(4)), flood.koGain);
  // Monotonic in the level, so a decaying pulse can only fade.
  let previous = -1;
  for (const level of [0, 0.25, 0.5, 0.75, 1]) {
    const value = practicalLevel(flood, { level, ko: false }, 0, 0.5, true);
    assert.ok(value > previous);
    previous = value;
  }
});

test("practicalLevel: breath is the only thing reduced motion flattens", () => {
  const pendant = STAGE_PRACTICALS.buffet[0];
  const frames = [0, 7, 19, 33, 48];
  const moving = frames.map((f) => practicalLevel(pendant, { level: 0, ko: false }, f, 0.9, false));
  const still = frames.map((f) => practicalLevel(pendant, { level: 0, ko: false }, f, 0.9, true));
  assert.ok(new Set(moving.map((v) => v.toFixed(4))).size > 1, "the pendant breathes");
  assert.deepEqual(new Set(still.map((v) => v.toFixed(4))).size, 1, "reduced motion holds it steady");
});

test("stutter practicals break up under load instead of dimming", () => {
  const neon = STAGE_PRACTICALS.wildwood.find((spec) => spec.id === "chase");
  assert.ok(neon.stutter > 0);
  // A bulb in the lit share overdrives; a bulb in the dark share drops out.
  const bright = practicalLevel(neon, { level: 1, ko: false }, 0, 0.05, true);
  const dark = practicalLevel(neon, { level: 1, ko: false }, 0, 0.99, true);
  assert.ok(bright > dark * 3, `stutter is a dropout, not a dimmer (${bright} vs ${dark})`);
  // At rest every bulb burns the same: ambientStutter is a plain 1 at level 0.
  assert.equal(
    practicalLevel(neon, { level: 0, ko: false }, 0, 0.05, true),
    practicalLevel(neon, { level: 0, ko: false }, 0, 0.99, true),
  );
});

test("practicalSpill only adds light above the practical's own idle", () => {
  const flood = STAGE_PRACTICALS.vet[0];
  assert.equal(practicalSpill(flood, flood.idle * 0.5), 0, "at rest the hand-tuned rig is untouched");
  assert.ok(practicalSpill(flood, 2) > 20, "a KO genuinely lights the street");
  // A practical with no spill budget never creates a light.
  const bowl = STAGE_PRACTICALS.vet.find((spec) => spec.id === "bowl");
  assert.equal(bowl.spill, 0);
  assert.equal(practicalSpill(bowl, 5), 0);
});

test("fireworks fire on the same shots the 2D pass fires, and only over the bowl", () => {
  const big = { level: 1, age: 0, ko: false };
  assert.equal(fireworkShots(big, 500, "vet").length, 1, "a big hit is one burst");
  const ko = { level: 1, age: 20, ko: true };
  assert.equal(fireworkShots(ko, 500, "vet").length, 2, "a KO puts two up (2D: the second 14 ticks later)");
  assert.equal(fireworkShots({ level: 1, age: 5, ko: true }, 500, "vet").length, 1, "...the second waits for tick 14");
  assert.deepEqual(fireworkShots(big, 500, "buffet"), [], "only the Vet and the pier have a sky for them");
  assert.deepEqual(fireworkShots({ level: 0, age: 0, ko: false }, 500, "vet"), []);
  assert.deepEqual(fireworkShots(null, 0, "vet"), []);
  // The seed is the LATCH TICK, so a replayed KO puts the same shell in the
  // same place (the 2D bursts seed off ambientObs.pulseTick the same way).
  assert.notEqual(fireworkShots(big, 500, "vet")[0].seed, fireworkShots(big, 501, "vet")[0].seed);
  // A shot that has run its course is dropped, not clamped on at full.
  assert.deepEqual(fireworkShots({ level: 0.2, age: FIREWORK_TICKS + 1, ko: false }, 0, "vet"), []);
});

test("a real KO drives the table end to end (latch -> surge -> practical)", () => {
  // The exact chain game.js's cinema3dAmbientPulse hands the 3D stage.
  const obs = pulseAmbientLatch(createAmbientObs(), "ko", 1.4, 900);
  const level = ambientPulseLevel(obs, 900, false);
  const beat = ambientKoBeat(0, false);
  const surge = ambientSurge(level, beat);
  assert.ok(surge.level > 0.9 && surge.ko, "the KO tick is a full KO surge");
  const flood = STAGE_PRACTICALS.vet[0];
  const lit = practicalLevel(flood, surge, 900, 0.5, true);
  const rest = practicalLevel(flood, { level: 0, ko: false }, 900, 0.5, true);
  assert.ok(lit / rest > 5, `the Vet floodlight is >5x its rest level at the KO tick (${rest} -> ${lit})`);
  assert.ok(practicalSpill(flood, lit) > 40, "and it dumps real light onto the lot");
  // 48 ticks later the pulse is spent and the stage is back at idle.
  const spent = ambientSurge(ambientPulseLevel(obs, 900 + 48, false), ambientKoBeat(48, false));
  assert.equal(practicalLevel(flood, spent, 948, 0.5, true), rest);
});

// --- the shared effect math -------------------------------------------------

test("elementFrameIndex reproduces all three sheet modes", () => {
  const frames = new Array(16).fill(null).map((_, i) => ({ index: i }));
  // anim: plays 0..15 down the life.
  assert.equal(elementFrameIndex({ mode: "anim", frames }, { life: 1, max: 1 }, 0), 0);
  assert.equal(elementFrameIndex({ mode: "anim", frames }, { life: 0.5, max: 1 }, 0), 8);
  assert.equal(elementFrameIndex({ mode: "anim", frames }, { life: 0, max: 1 }, 0), 15);
  // flicker: re-forks EVERY tick (the 2D formula, seed*31 + tick*7).
  const flicker = { mode: "flicker", frames };
  const forks = new Set([0, 1, 2, 3, 4].map((tick) => elementFrameIndex(flicker, { seed: 9 }, tick)));
  assert.ok(forks.size >= 4, "a held impact never shows the same fork twice");
  assert.equal(elementFrameIndex(flicker, { seed: 9 }, 5), (9 * 31 + 35) % 16);
  // scatter: the cell picked at spawn, held.
  assert.equal(elementFrameIndex({ mode: "scatter", frames }, { frame: 11 }, 77), 11);
  // A hand-trimmed sheet with fewer than 16 cells never indexes past its end.
  const short = new Array(6).fill({});
  for (const tick of [0, 1, 2, 3, 9, 30]) {
    assert.ok(elementFrameIndex({ mode: "flicker", frames: short }, { seed: 3 }, tick) < 6);
  }
  assert.ok(elementFrameIndex({ mode: "scatter", frames: short }, { frame: 15 }, 0) < 6);
});

test("elementSpriteAlpha is front-loaded, and matches the shipped 2D curve", () => {
  const additive = (fade) => elementSpriteAlpha({ life: fade, max: 1, additive: true, alpha: 1 });
  const soft = (fade) => elementSpriteAlpha({ life: fade, max: 1, additive: false, alpha: 1 });
  assert.equal(additive(1), 1);
  assert.equal(additive(0.8), 1, "additive holds full presence through most of its life");
  assert.equal(Number(additive(0.5).toFixed(3)), 0.675);
  assert.equal(Number(soft(0.5).toFixed(3)), Number(Math.min(1, Math.sqrt(0.5) * 1.08).toFixed(3)));
  assert.equal(soft(0), 0);
  // The sheet's own alpha (paint's 0.9) still scales the result.
  assert.equal(elementSpriteAlpha({ life: 1, max: 1, additive: true, alpha: 0.9 }), 0.9);
});

test("the charge glow's radius and alpha are the 2D formula", () => {
  const tick = 40;
  for (const [level, tier] of [[0.2, 0], [0.6, 1], [1, 2]]) {
    const expected = (40 + tier * 16) * (1 + Math.sin(tick * 0.55) * 0.08) * (0.6 + level * 0.4);
    assert.equal(chargeGlowRadius(level, tier, tick, 0), expected);
  }
  assert.equal(chargeGlowAlpha(1, 0), 0.26);
  assert.equal(Number(chargeGlowAlpha(1, 2).toFixed(4)), 0.351, "a super's charge burns 35% hotter");
  assert.equal(chargeGlowAlpha(0, 2), 0);
});

test("every 2D particle kind is routed, and the screen-space ones are skipped", () => {
  // Kinds the sim actually pushes into state.particles (grepped from game.js).
  const spawned = [...gameSource.matchAll(/state\.particles\.push\(\{\s*\n?\s*kind: "([a-zA-Z]+)"/g)]
    .map((match) => match[1]);
  assert.ok(spawned.length > 5, "the grep found the pool's spawners");
  for (const kind of new Set(spawned)) {
    assert.ok(PARTICLE_CHANNELS[kind], `${kind} is routed explicitly, not by the fallback`);
  }
  assert.equal(particleChannel("blood"), "mote");
  assert.equal(particleChannel("shockRing"), "ring");
  // Screen-space / overlay reads must NOT be mirrored into the world: the
  // CINEMA 3D overlay pass already draws them on the 2D canvas on top.
  for (const kind of ["combatText", "lensBlood", "impactFlash", "noise", "rank"]) {
    assert.equal(particleChannel(kind), "skip", `${kind} stays on the overlay`);
  }
  // An unknown kind rides as a mote rather than vanishing.
  assert.equal(particleChannel("somethingNew"), "mote");
});

test("particleMote keeps dust quiet and sparks hot", () => {
  const dust = particleMote({ kind: "dust", life: 1, max: 1, size: 6 });
  assert.equal(Number(dust.alpha.toFixed(3)), 0.42, "2D multiplies dust alpha by 0.42");
  assert.equal(dust.additive, false);
  const blood = particleMote({ kind: "blood", life: 1, max: 1, size: 5 });
  assert.equal(blood.alpha, 1, "blood carries its full weight");
  assert.equal(particleMote({ kind: "sparkLine", life: 1, max: 1, size: 3 }).additive, true);
  // Mist and steam BILLOW as they thin (2D: radius x (1 + (1-alpha) * 1.5)).
  const young = particleMote({ kind: "mist", life: 1, max: 1, size: 10 });
  const old = particleMote({ kind: "mist", life: 0.2, max: 1, size: 10 });
  assert.ok(old.size > young.size * 2);
  // Never a zero-size point, whatever the spawner left out.
  assert.ok(particleMote({ kind: "dust", life: 1, max: 1 }).size >= 1.5);
});

test("afterimageGhost stays a wash, never a second fighter", () => {
  const fresh = afterimageGhost(0);
  assert.equal(fresh.opacity, 0.15);
  assert.equal(fresh.scaleX, 1.3, "the freshest ghost is a horizontal smear of the live cell");
  assert.equal(fresh.clipTop, 0);
  const older = afterimageGhost(0.6);
  assert.ok(older.opacity < fresh.opacity);
  assert.equal(older.scaleX, 1);
  assert.equal(older.clipTop, 0.26, "older ghosts lose their head band");
  // Crushed below face readability at every age, and never negative.
  for (const age of [0, 0.3, 0.45, 0.7, 1]) {
    const ghost = afterimageGhost(age);
    assert.ok(ghost.opacity >= 0 && ghost.opacity <= 0.15, `age ${age}: ${ghost.opacity}`);
  }
});

test("damageDecalKey moves on a mark push and on the gore toggle, nothing else", () => {
  assert.equal(damageDecalKey(3, false), damageDecalKey(3, false));
  assert.notEqual(damageDecalKey(3, false), damageDecalKey(4, false));
  assert.notEqual(damageDecalKey(3, false), damageDecalKey(3, true));
});

// --- the wiring -------------------------------------------------------------

test("every generic 3D stage has a REAL update, driven by the shared surge", () => {
  // The dead card that started this item.
  assert.ok(!/update\(\) \{\}/.test(stageGeneric), "stage-generic no longer ships an empty update()");
  assert.match(stageGeneric, /update\(timeSec, state, beat\) \{/);
  assert.match(stageGeneric, /const surge = updatePracticals\(beat\);/);
  assert.match(stageGeneric, /updateFireworks\(surge\);/);
  assert.match(stageGeneric, /from "\.\.\/\.\.\/engine\/stage-practicals\.mjs"/);
  // The plate mapping is the reason a card lands ON its painted fixture: the
  // backdrop's own size AND its barrel bend.
  assert.match(stageGeneric, /function plateToWorld\(px, py, lift = 0\.09\) \{/);
  assert.match(stageGeneric, /const bend = -Math\.pow\(Math\.abs\(x\) \/ \(PLATE\.width \* 0\.5\), PLATE\.bendPower\) \* PLATE\.bend;/);
  // ...and the backdrop mesh bends by the same rule, from the same constants.
  assert.match(stageGeneric, /positions\.setZ\(i, -Math\.pow\(Math\.abs\(nx\), PLATE\.bendPower\) \* PLATE\.bend\);/);
  // The crowd's roar is a floor under the discrete pulses.
  assert.match(stageGeneric, /const floor = Math\.min\(0\.55, reaction \* 0\.4\);/);
});

test("Somerset's update finally reads state, and its practicals answer", () => {
  assert.match(stageSomerset, /update\(timeSec, state, beat\) \{/);
  assert.match(stageSomerset, /for \(const respond of surgeResponders\) respond\(level, ko\);/);
  // Ordering rule: responders run AFTER the flickers, so a `boost` multiply
  // can never compound (the flicker rewrites that light every frame).
  const body = stageSomerset.slice(stageSomerset.indexOf("update(timeSec, state, beat) {"));
  const flickerAt = body.indexOf("for (const flicker of flickers)");
  const respondAt = body.indexOf("for (const respond of surgeResponders)");
  assert.ok(flickerAt >= 0 && flickerAt < respondAt, "flickers first, responders second");
  // The street-level lights are the ones actually ON the fighters.
  assert.match(stageSomerset, /swell\(sodiumRim, 13, 0\.55, 0\.35\);/);
  assert.match(stageSomerset, /swell\(signalLight, 9, 0\.9, 0\.6\);/);
  assert.ok(stageSomerset.includes("neonLight.intensity *="), "the corner neon overdrives");
});

test("main.mjs latches the pulse and hands both stages the beat", () => {
  assert.match(mainSource, /surge: host\.ambientPulse \? host\.ambientPulse\(\) : null,/);
  assert.match(mainSource, /reaction: host\.crowdReaction \? host\.crowdReaction\(\) : 0,/);
  assert.match(mainSource, /stage\.update\?\.\(t, state, ambientBeat\);/);
  assert.match(mainSource, /new EffectsLayer\(host\)/);
  assert.match(mainSource, /layers\.set\("effects", effects\)/);
  // gl_PointSize is in framebuffer pixels: the cloud must be told when the
  // backing store moves or it silently shrinks on a hi-dpi display.
  assert.match(mainSource, /setPixelScale\(SIM_H \* wantedRatio \* 0\.5\)/);
  assert.match(mainSource, /effects: renderer3d\.effects\?\.stats\?\.\(\) \?\? null,/);
  assert.match(mainSource, /practicals: stage\?\.report\?\.\(\) \?\? null,/);
});

test("game.js latches the KO pulse THROUGH the bridge, and hands over every read", () => {
  // The bug: the KO latch lived inside drawStageAmbient, whose only caller is
  // inside `if (!cinema3dWorld)`. cinema3dAmbientPulse is the 3D path to it.
  assert.match(gameSource, /function cinema3dAmbientPulse\(\) \{\n  const surge = stageSurge\(state\.simulationTick\);/);
  assert.match(gameSource, /latchTick: ambientObs\.pulseTick,/);
  assert.match(gameSource, /function readAmbientPulse\(frame, reduced\) \{\n  const koPulse = ambientPhaseChange\(ambientObs, state\.phase, state\.screen\);/);
  for (const member of ["ambientPulse: cinema3dAmbientPulse",
    "crowdReaction: cinema3dCrowdReaction",
    "elementSprites: cinema3dElementSprites",
    "elementSheet: cinema3dElementSheet",
    "elementCharge: cinema3dElementCharge",
    "battleDamage: cinema3dBattleDamage"]) {
    assert.ok(gameSource.includes(member), `the host literal carries ${member}`);
  }
  assert.match(gameSource, /paintBattleDamage: \(context, side\) => paintBattleDamageWith\(context, side\),/);
});

test("the 2D pass draws through the SAME shared functions the 3D layer reads", () => {
  // If the 2D path stops using them, the modules stop being parity and become
  // a second implementation — which is the failure this whole item is about.
  assert.match(gameSource, /const index = elementFrameIndex\(meta, particle, state\.simulationTick\);/);
  assert.match(gameSource, /ctx\.globalAlpha = elementSpriteAlpha\(particle\);/);
  assert.match(gameSource, /const radius = chargeGlowRadius\(obs\.chargeLevel, tier, state\.simulationTick, side\);/);
  assert.match(gameSource, /ctx\.globalAlpha = chargeGlowAlpha\(obs\.chargeLevel, tier\);/);
  assert.match(gameSource, /ctx\.globalAlpha = particleMote\(particle\)\.alpha;/);
  assert.match(gameSource, /const ghost = afterimageGhost\(ghostAge\);/);
  assert.match(gameSource, /damageDecalKey\(battleDamageRevision\[side\], gore\)/);
  // The extracted damage painter never touches the module ctx (it would draw
  // on the game canvas while the 3D layer thinks it is painting a decal).
  const start = gameSource.indexOf("function paintBattleDamageWith(c, side) {");
  assert.ok(start > 0);
  const body = gameSource.slice(start, gameSource.indexOf("\n}\n", start));
  assert.ok(!/\bctx\./.test(body), "paintBattleDamageWith never touches the module ctx");
  // ...and the 2D compositor still goes through it.
  assert.match(gameSource, /paintBattleDamageWith\(scratchCtx, side\);/);
});

test("the effects layer mirrors the pool rather than simulating a second one", () => {
  assert.match(effectsLayer, /host\.elementSprites\(\)/);
  assert.match(effectsLayer, /host\.elementSheet\(particle\.sheet\)/);
  assert.match(effectsLayer, /host\.elementCharge\(side\)/);
  assert.match(effectsLayer, /const channel = particleChannel\(particle\.kind\);/);
  assert.match(effectsLayer, /if \(channel === "skip"\) continue;/);
  // Reads only: nothing in this layer may write to a particle or an effect.
  assert.ok(!/particle\.(x|y|vx|vy|life) *=[^=]/.test(effectsLayer), "never writes a particle field");
  // One instanced mesh per LIVE sheet, not one per sprite.
  assert.match(effectsLayer, /new THREE\.InstancedMesh\(geometry, material, SPRITES_PER_SHEET\)/);
  assert.match(effectsLayer, /this\.sheets = new Map\(\);/);
});

test("the 3D sprites wear their bruises, and dash ghosts read the live cell", () => {
  assert.match(fightersLayer, /uniform sampler2D uFbDamage;/);
  assert.match(fightersLayer, /uniform float uFbDamageOn;/);
  assert.match(fightersLayer, /vec4 fbDmg = texture2D\(uFbDamage, vFbLocal\);/);
  assert.match(fightersLayer, /diffuseColor\.rgb = mix\(diffuseColor\.rgb, fbDmg\.rgb, fbDmg\.a\);/);
  // The decal is CELL space, which is what makes mirroring and the HD swap
  // free: vFbLocal is the quad's own uv.
  assert.match(fightersLayer, /const DAMAGE_CELL = 320;/);
  assert.match(fightersLayer, /host\.paintBattleDamage\(entry\.ctx, side\)/);
  assert.match(fightersLayer, /const key = damageDecalKey\(report\.revision, report\.gore\);/);
  assert.match(fightersLayer, /if \(entry\.key !== key\) \{/, "repainted on the revision, not per frame");
  // Ghosts: live bank map (so the echo can never show a pose already left),
  // dropped the moment the dash ends, and behind the body.
  assert.match(fightersLayer, /if \(effect\.kind !== "afterimage"\) continue;/);
  assert.match(fightersLayer, /if \(!rig \|\| !fighter \|\| fighter\.dashFrames <= 0\) continue;/);
  assert.match(fightersLayer, /const bank = rig\.banks\[rig\.currentBank\] \|\| rig\.banks\.base;/);
  assert.match(fightersLayer, /const ghost = afterimageGhost\(/);
  // A disposed rig must not leave a ghost holding its freed texture.
  assert.match(fightersLayer, /const ghostSide = this\.rigs\.indexOf\(rig\);/);
});
