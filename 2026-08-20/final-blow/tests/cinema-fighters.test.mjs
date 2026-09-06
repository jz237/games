import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { atlasFrameFacing } from "../engine/atlas-facing.mjs";
import { AUTHORED_BANKS } from "../engine/fighter-kits.mjs";
import {
  presentationHash01, spriteMirror, postMirrorRotation, hitstopTremble, exhaustionLean, proneTransform, proneSettleLift,
} from "../renderer/three/sprite-pose.mjs";
import {
  STAGE_SPRITE_LIGHT, STAGE_SPRITE_LIGHT_IDS, spriteLightFor, spriteLightFrame, hueOf,
} from "../renderer/three/stage-lighting.mjs";
import { bleedPixels, normalPixels, footMetricsFromPixels, IdleQueue } from "../renderer/three/atlas-pixels.mjs";

// 5.1 CINEMA 3D fighter layer (#44 pose parity, #45 per-stage sprite light,
// #40 idle-time bank builds + eviction).
//
// The renderer imports "three" through the browser import map, so this
// suite registers tests/helpers/three-stub-loader.mjs — a resolve hook that
// routes "three" and the vendored postprocessing modules to a state-only
// stand-in — and then DRIVES FighterLayer.poseRig with a mock host. The
// pure maths (sprite-pose, stage-lighting, atlas-pixels) is pinned directly.

const testDir = dirname(fileURLToPath(import.meta.url));
const root = join(testDir, "..");
const gameSource = readFileSync(join(root, "game.js"), "utf8");
const fightersSource = readFileSync(join(root, "renderer", "three", "fighters.mjs"), "utf8");
const mainSource = readFileSync(join(root, "renderer", "three", "main.mjs"), "utf8");
const PX = 0.005;
const SIM_FLOOR = 600;

register("./helpers/three-stub-loader.mjs", import.meta.url);

// --- Fake DOM: the texture factories draw into canvases at layer build ------
function fakeContext(width, height) {
  const gradient = { addColorStop() {} };
  const target = {
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 0 }),
    canvas: { width, height },
  };
  return new Proxy(target, {
    get: (obj, key) => (key in obj ? obj[key] : () => obj),
    set: (obj, key, value) => { obj[key] = value; return true; },
  });
}
if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    createElement: () => {
      const canvas = { width: 0, height: 0 };
      canvas.getContext = () => fakeContext(canvas.width, canvas.height);
      return canvas;
    },
  };
}
const { FighterLayer } = await import("../renderer/three/fighters.mjs");
const { atlasCacheStats } = await import("../renderer/three/textures.mjs");

// --- Mock host + fighters -----------------------------------------------------
const OWN_BANKS = ["motion", "motion2", "unified", "unified-ext4"];
function mockHost(state, { ownBanks = OWN_BANKS } = {}) {
  const sheets = new Map();
  const sheetFor = (id, bank) => {
    const key = `${id}:${bank}`;
    if (!sheets.has(key)) sheets.set(key, { complete: true, naturalWidth: 1280, naturalHeight: 1280, src: `mock:${key}` });
    return sheets.get(key);
  };
  return {
    state,
    cinematicCamera: {},
    stageImages: {},
    fighterAtlases: {},
    fighterMoveAtlases: {},
    fighterRenderSize: () => 376,
    fighterAnimationPose: (fighter) => fighter.__pose,
    moveSheetAdjust: {},
    gameCanvas: {},
    isRollbackResimulating: () => false,
    getPerformanceProfile: () => state.performance,
    isWorldActive: () => true,
    paintProjectile() {},
    paintTrap() {},
    stageWeaponProfile: () => null,
    fighterScale: 1,
    // paletteAtlas semantics: a bank the fighter lacks falls back to the base sheet.
    fighterAtlasFor: (fighter, bank) => (bank === "base" || bank === "specials" || ownBanks.includes(bank)
      ? sheetFor(fighter.def.id, bank) : sheetFor(fighter.def.id, "base")),
    fighterPaletteKey: () => "",
    hdSheetPath: () => null,
    fighterBankSheet: (id, bank) => (ownBanks.includes(bank) ? sheetFor(id, bank) : null),
    downTiltFor: () => state.__downTilt ?? 1.35,
    downTiltRadians: 1.35,
    isUnifiedFighter: () => false,
    cellDrawAdjust: () => 1,
    cellVerticalOffset: () => 0,
    gritSuperCost: 100,
  };
}

function fighterMock(over = {}) {
  return {
    def: { id: "post", accent: "#ff8040" },
    side: 0, facing: 1, x: 640, y: SIM_FLOOR, vx: 0, grounded: true, crouch: false, block: false, stun: false,
    down: false, health: 100, meter: 0, hitFlash: 0, hitstunFrames: 0, cinematicFrame: null, cinematicRotation: 0,
    cinematicScale: 1, airTechFlipFrames: 0, attacking: null, attackTime: 0, animTime: 0, walkTime: 0,
    dizzyFrames: 0, guardCrushFrames: 0, specialGlow: 0,
    __pose: { bank: "base", frame: 0 },
    ...over,
  };
}

function stateMock(fighters) {
  return {
    fighters, phase: "fight", hitstop: 0, simulationTick: 0,
    accessibility: { reducedMotion: false }, performance: { id: "high", trailScale: 1 },
  };
}

function layerFor(state, options) {
  const host = mockHost(state, options);
  const layer = new FighterLayer(host);
  // No background scheduling in tests: steps run only through drain().
  layer.queue = new IdleQueue({ schedule: () => {} });
  return { host, layer };
}

// ---------------------------------------------------------------------------
// #44 — pose parity through poseRig.
// ---------------------------------------------------------------------------
test("Post's 3D mirror equals the 2D renderMirror on every base and specials cell, both facings", () => {
  const fighter = fighterMock();
  const state = stateMock([fighter, fighterMock({ side: 1, facing: -1, x: 900, def: { id: "jez", accent: "#40c0ff" } })]);
  const { layer } = layerFor(state);
  let checked = 0;
  for (const bank of ["base", "specials"]) {
    for (let frame = 0; frame < 16; frame += 1) {
      for (const facing of [1, -1]) {
        fighter.facing = facing;
        fighter.__pose = { bank, frame };
        layer.update(state, 1 / 60, 0);
        const rig = layer.rigs[0];
        const expected = facing * atlasFrameFacing("post", bank, frame);
        assert.equal(Math.sign(rig.mesh.scale.x), expected, `${bank}:${frame} facing ${facing}`);
        assert.equal(rig.banks[bank].fb.facing.value, expected, `${bank}:${frame} shader facing`);
        assert.equal(spriteMirror("post", bank, frame, facing), expected);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 64);
  // A fully right-authored fighter is untouched by the rule.
  const jezRig = layer.rigs[1];
  assert.equal(Math.sign(jezRig.mesh.scale.x), -1);
});

test("a tilted knocked-down body rests on the boards; an authored-flat one drops its padding; airborne keeps its height", () => {
  const fighter = fighterMock({ down: true, __pose: { bank: "base", frame: 15 } });
  const state = stateMock([fighter]);
  const { layer } = layerFor(state);
  state.__downTilt = 1.35;
  layer.update(state, 1 / 60, 0);
  const rig = layer.rigs[0];
  assert.equal(rig.root.rotation.z, 1.35, "facing +1 tilts +1.35 rad in three (canvas -1.35)");
  // Lowest corner of the (default, unmeasured) silhouette box after the
  // rotation sits 2 px under the ground plane — not half a body width under.
  const lowest = (box) => {
    const cos = Math.cos(rig.root.rotation.z);
    const sin = Math.sin(rig.root.rotation.z);
    let min = Infinity;
    for (const u of [box.left, box.right]) {
      for (const v of [box.bottom, box.top]) {
        min = Math.min(min, u * rig.mesh.scale.x * sin + v * Math.abs(rig.mesh.scale.y) * cos);
      }
    }
    return rig.root.position.y + min;
  };
  assert.ok(Math.abs(lowest({ left: -0.5, right: 0.5, top: 1, bottom: 0 }) + 2 * PX) < 1e-9, "tilted body rests on the boards");
  assert.ok(rig.root.position.y > 0.4, `tilt LIFTS by ~half the quad width (got ${rig.root.position.y.toFixed(3)})`);
  // The 2D rotated-frame translate lands as a small FORWARD nudge in x.
  const prone = proneTransform({ facing: 1, downTilt: 1.35 });
  assert.ok(Math.abs(rig.root.position.x - prone.dx * PX) < 1e-9);
  assert.ok(prone.dx > 6 && prone.dx < 7.5, `dx ${prone.dx}`);
  assert.ok(prone.dyScreen > 47 && prone.dyScreen < 48, `dyScreen ${prone.dyScreen}`);
  const mirrored = proneTransform({ facing: -1, downTilt: 1.35 });
  assert.ok(Math.abs(mirrored.dx + prone.dx) < 1e-9 && Math.abs(mirrored.dyScreen - prone.dyScreen) < 1e-9);
  assert.equal(mirrored.rotation, -1.35);
  assert.deepEqual(proneTransform({ facing: 1, downTilt: 0 }), { rotation: 0, dx: 0, dyScreen: 0, share: 0 });

  // Authored flat with measured padding: drops by the padding, rests at -2 px.
  state.__downTilt = 0;
  rig.banks.base.footMetrics = {
    padBottom: new Float32Array(16).fill(0.1),
    feet: Array.from({ length: 16 }, () => []),
    extent: Array.from({ length: 16 }, () => ({ left: -0.2, right: 0.2, top: 0.6, bottom: 0.1 })),
  };
  layer.update(state, 1 / 60, 0);
  assert.equal(rig.root.rotation.z, 0);
  assert.ok(Math.abs(rig.root.position.y - (-2 * PX - 0.1 * rig.mesh.scale.y)) < 1e-9, "flat cell drops its bottom padding");

  // In the air: no settle at all.
  fighter.grounded = false;
  fighter.y = 500;
  layer.update(state, 1 / 60, 0);
  assert.ok(Math.abs(rig.root.position.y - (SIM_FLOOR - 500) * PX) < 1e-9);
});

test("proneSettleLift: rotation 0 is the padding drop, the full tilt is a half-body lift", () => {
  assert.ok(Math.abs(proneSettleLift({ rotation: 0, scaleX: 1.88, scaleY: 1.88, extent: { left: -0.3, right: 0.3, top: 0.9, bottom: 0.05 }, restBelow: 0.01 })
    - (-0.01 - 0.05 * 1.88)) < 1e-12);
  const lift = proneSettleLift({ rotation: 1.35, scaleX: 1.88, scaleY: 1.88, extent: { left: -0.3, right: 0.3, top: 0.9, bottom: 0.05 }, restBelow: 0.01 });
  assert.ok(lift > 0.3 * 1.88 * Math.sin(1.35) - 0.05 && lift < 0.3 * 1.88 * Math.sin(1.35) + 0.05, `lift ${lift}`);
  // The mirror flips which silhouette edge is the low one; the lift is the
  // same magnitude for a symmetric box.
  const lifted = proneSettleLift({ rotation: -1.35, scaleX: -1.88, scaleY: 1.88, extent: { left: -0.3, right: 0.3, top: 0.9, bottom: 0.05 }, restBelow: 0.01 });
  assert.ok(Math.abs(lifted - lift) < 1e-12);
});

test("hitstop tremble: the 2D formula, gated like the 2D, applied to the body but not the contact shadow", () => {
  const fighter = fighterMock({ hitstunFrames: 6 });
  const state = stateMock([fighter]);
  const { layer } = layerFor(state);
  layer.update(state, 1 / 60, 0);
  const rig = layer.rigs[0];
  const restX = rig.root.position.x;
  const restY = rig.root.position.y;
  state.hitstop = 0.1;
  state.simulationTick = 41;
  layer.update(state, 1 / 60, 0);
  const expected = hitstopTremble({ hitstunFrames: 6, hitstop: 0.1, tick: 41, side: 0 });
  assert.ok(expected && Math.abs(expected.x) > 0.05 && Math.abs(expected.y) > 0.02, "a real shiver");
  assert.ok(Math.abs(rig.root.position.x - restX - expected.x * PX) < 1e-12);
  assert.ok(Math.abs(rig.root.position.y - restY + expected.y * PX) < 1e-12, "sim y-down flips for world y");
  assert.ok(Math.abs(rig.shadow.position.x - restX) < 1e-12, "the contact shadow stays put, as in 2D");
  // Re-hashed per tick: the next tick moves.
  state.simulationTick = 42;
  layer.update(state, 1 / 60, 0);
  const next = hitstopTremble({ hitstunFrames: 6, hitstop: 0.1, tick: 42, side: 0 });
  assert.notEqual(next.x, expected.x);
  assert.ok(Math.abs(rig.root.position.x - restX - next.x * PX) < 1e-12);
  // Gates.
  assert.equal(hitstopTremble({ hitstunFrames: 6, hitstop: 0.1, tick: 41, reducedMotion: true }), null);
  assert.equal(hitstopTremble({ hitstunFrames: 0, hitstop: 0.1, tick: 41 }), null);
  assert.equal(hitstopTremble({ hitstunFrames: 6, hitstop: 0, tick: 41 }), null);
  assert.ok(hitstopTremble({ hitstunFrames: 6, hitstop: 0, opponentSuper: true, tick: 41 }), "super storms tremble too");
  assert.equal(hitstopTremble({ hitstunFrames: 6, hitstop: 0.1, cinematicFrame: 3, tick: 41 }), null);
  state.hitstop = 0;
  state.accessibility.reducedMotion = true;
  layer.update(state, 1 / 60, 0);
  assert.ok(Math.abs(rig.root.position.x - restX) < 1e-12);
});

test("the tremble hash is game.js's presentationHash01, verbatim", () => {
  const start = gameSource.indexOf("function presentationHash01(...nums) {");
  assert.ok(start > 0);
  const body = gameSource.slice(start, gameSource.indexOf("\n}\n", start) + 3);
  const theirs = new Function(`${body}; return presentationHash01;`)();
  for (let tick = 0; tick < 500; tick += 7) {
    for (const salt of [3, 7]) assert.equal(presentationHash01(tick * 2 + 17, salt), theirs(tick * 2 + 17, salt));
  }
  // And the 2D tremble line still reads exactly what this module encodes.
  assert.match(gameSource, /const trembleTick = state\.simulationTick \* 2 \+ fighter\.side \* 17;/);
  assert.match(gameSource, /\(presentationHash01\(trembleTick, 3\) - 0\.5\) \* 3\.2,/);
  assert.match(gameSource, /\(presentationHash01\(trembleTick, 7\) - 0\.5\) \* 1\.8,/);
});

test("exhaustion hunch: 0.085 rad at zero health, post-mirror sign, halved under reduced motion", () => {
  assert.equal(exhaustionLean({ breathing: true, moving: false, health: 100 }), 0);
  assert.equal(exhaustionLean({ breathing: true, moving: false, health: 25 }), 0);
  assert.ok(Math.abs(exhaustionLean({ breathing: true, moving: false, health: 10 }) - 0.085 * 0.6) < 1e-12);
  assert.equal(exhaustionLean({ breathing: false, moving: false, health: 10 }), 0);
  assert.equal(exhaustionLean({ breathing: true, moving: true, health: 10 }), 0);
  assert.ok(Math.abs(exhaustionLean({ breathing: true, moving: false, health: 10, reducedMotion: true }) - 0.085 * 0.3) < 1e-12);
  assert.match(gameSource, /if \(exhausted > 0\) ctx\.rotate\(0\.085 \* exhausted \* \(reducedMotion \? 0\.5 : 1\)\);/);
  // Through poseRig: an idle fighter at 10 health leans forward; the sign
  // follows the drawn mirror (a left-authored Post cell at facing +1 has
  // mirror -1).
  const fighter = fighterMock({ health: 10 });
  const state = stateMock([fighter]);
  const { layer } = layerFor(state);
  layer.update(state, 1 / 60, 0);
  const rig = layer.rigs[0];
  const mirror = atlasFrameFacing("post", "base", 0);
  assert.equal(mirror, -1);
  assert.ok(Math.abs(rig.mesh.rotation.z - postMirrorRotation(0.085 * 0.6, mirror)) < 1e-12);
  assert.ok(Math.abs(rig.mesh.rotation.z - 0.085 * 0.6) < 1e-12, "canvas +θ on a mirrored drawing is three +θ");
  fighter.health = 100;
  layer.update(state, 1 / 60, 0);
  assert.equal(rig.mesh.rotation.z, 0);
  // The attack tilt crosses the same way: canvas rotate(-swing*k) post-mirror.
  fighter.attacking = { duration: 0.4, active: [0.1, 0.2], kind: "heavy" };
  fighter.attackTime = 0.15;
  layer.update(state, 1 / 60, 0);
  const swing = Math.sin((0.15 / 0.4) * Math.PI);
  assert.ok(Math.abs(rig.mesh.rotation.z - postMirrorRotation(-swing * 0.07, mirror)) < 1e-12);
});

// ---------------------------------------------------------------------------
// #45 — per-stage sprite light.
// ---------------------------------------------------------------------------
test("Somerset's descriptor reproduces the pre-5.1 sprite-light constants exactly", () => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const SODIUM = rgb(0xffa04a);
  const BODEGA = rgb(0xffc27a);
  const NEON = rgb(0xff4fd8);
  const CYAN = rgb(0x3fd6ff);
  const LAMP = rgb(0xa9f7d2);
  const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} vs ${b}`);
  for (let fx = -3.5; fx <= 3.5; fx += 0.1) {
    for (const hitSmear of [0, 0.5, 1]) {
      // The old poseRig block, line for line.
      const leftNear = clamp(1 - (fx + 3.2) / 6, 0.25, 1);
      const rimLeft = lerp(SODIUM, BODEGA, clamp(-(fx + 2) / 5, 0, 1) * 0.5);
      const rimLeftStrength = (0.55 + leftNear * 0.45) * (1 + hitSmear * 0.5);
      const neonMix = clamp((fx + 0.4) / 3.3, 0, 1);
      const rimRight = lerp(NEON, CYAN, clamp((fx - 3.4) / 3, 0, 1) * 0.55);
      const rimRightStrength = 0.22 + neonMix * neonMix * 1.15;
      const lampNear = Math.exp(-((fx - 0.4) * (fx - 0.4)) / 7);
      const topStrength = 0.5 + lampNear * 0.95;
      const fillLeft = SODIUM.map((v) => v * (0.17 + leftNear * 0.24));
      const fillRight = NEON.map((v) => v * (0.14 + neonMix * neonMix * 0.6));
      const floorBounce = lerp(SODIUM, BODEGA, 0.35).map((v) => v * (0.32 + lampNear * 0.16 + leftNear * 0.12));
      const zone = [
        1.16 * (1 + leftNear * 0.20 + neonMix * neonMix * 0.16),
        1.16 * (1 + lampNear * 0.22 + leftNear * 0.05),
        1.16 * (1 + neonMix * neonMix * 0.34 + lampNear * 0.10 - leftNear * 0.12),
      ];
      const mirror = [
        1.0 + leftNear * 0.04 - neonMix * 0.02,
        1.01 + lampNear * 0.05 + leftNear * 0.01,
        1.06 + neonMix * neonMix * 0.14 + lampNear * 0.03,
      ];
      const frame = spriteLightFrame(spriteLightFor("somerset"), fx, hitSmear);
      rimLeft.forEach((v, i) => near(v, frame.rimLeft[i], "rimLeft"));
      near(rimLeftStrength, frame.rimLeftStrength, "rimLeftStrength");
      rimRight.forEach((v, i) => near(v, frame.rimRight[i], "rimRight"));
      near(rimRightStrength, frame.rimRightStrength, "rimRightStrength");
      LAMP.forEach((v, i) => near(v, frame.top[i], "top"));
      [0.88, 1.12, 0.99].forEach((v, i) => near(v, frame.topTint[i], "topTint"));
      near(topStrength, frame.topStrength, "topStrength");
      fillLeft.forEach((v, i) => near(v, frame.fillLeft[i], "fillLeft"));
      fillRight.forEach((v, i) => near(v, frame.fillRight[i], "fillRight"));
      floorBounce.forEach((v, i) => near(v, frame.floorBounce[i], "floorBounce"));
      zone.forEach((v, i) => near(v, frame.zone[i], "zone"));
      mirror.forEach((v, i) => near(v, frame.mirror[i], "mirror"));
      near(clamp((fx - 0.4) / 2.5, -1, 1), frame.lampDx, "lampDx");
      near(0.72 + lampNear * 0.68, frame.specStrength, "specStrength");
    }
  }
});

test("every stage has a complete descriptor and unknown ids light like Somerset", () => {
  assert.deepEqual([...STAGE_SPRITE_LIGHT_IDS].sort(), ["buffet", "cruise", "janney", "somerset", "vet", "wildwood"]);
  for (const id of STAGE_SPRITE_LIGHT_IDS) {
    const light = STAGE_SPRITE_LIGHT[id];
    assert.equal(light.id, id);
    for (const side of ["left", "right"]) {
      const practical = light[side];
      assert.equal(practical.rim.length, 3, `${id}.${side}.rim`);
      assert.equal(practical.strength.length, 2);
      assert.equal(practical.fill.length, 2);
      assert.equal(practical.zone.length, 3);
      assert.equal(practical.mirror.length, 3);
    }
    assert.equal(light.left.near.length, 3);
    assert.equal(light.left.deepReach.length, 3);
    assert.equal(light.right.near.length, 2);
    assert.equal(light.right.farReach.length, 3);
    assert.equal(typeof light.right.squared, "boolean");
    assert.equal(light.right.mirrorLinear.length, 3);
    assert.equal(light.top.color.length, 3);
    assert.equal(light.top.tint.length, 3);
    assert.ok(light.top.spread > 0);
    assert.equal(light.floor.strength.length, 3);
    assert.ok(light.zoneBase > 1 && light.zoneBase < 1.3);
    assert.equal(light.mirror.length, 3);
    // Every frame value is finite across the stage.
    for (const fx of [-3.4, -1, 0.4, 2, 3.4]) {
      const frame = spriteLightFrame(light, fx, 0.3);
      for (const [key, value] of Object.entries(frame)) {
        for (const n of Array.isArray(value) ? value : [value]) assert.ok(Number.isFinite(n), `${id} ${key} at ${fx}`);
      }
    }
  }
  assert.equal(spriteLightFor("not-a-stage"), STAGE_SPRITE_LIGHT.somerset);
  assert.equal(spriteLightFor(undefined), STAGE_SPRITE_LIGHT.somerset);
});

test("the Vet, buffet and cruise deck light the sprites VISIBLY differently from Somerset", () => {
  const somerset = spriteLightFrame(spriteLightFor("somerset"), 2.6);
  const hueGap = (a, b) => {
    const d = Math.abs(hueOf(a) - hueOf(b));
    return Math.min(d, 360 - d);
  };
  // Cornered screen-right (fx 2.6) Somerset wears the K&A magenta rim...
  assert.ok(hueGap(somerset.rimRight, [1, 0.31, 0.85]) < 15, "somerset right rim is magenta");
  for (const id of ["vet", "buffet", "cruise"]) {
    const frame = spriteLightFrame(spriteLightFor(id), 2.6);
    // ...and no other stage does: the right rim, the crown and the floor
    // bounce each move by a clearly visible hue on all three.
    assert.ok(hueGap(frame.rimRight, somerset.rimRight) > 40, `${id} right rim hue`);
    assert.ok(hueGap(frame.top, somerset.top) > 40 || Math.abs(frame.topTint[1] - somerset.topTint[1]) > 0.05, `${id} crown`);
    assert.ok(frame.rimRightStrength > 0.3, `${id} right rim strength reaches the corner`);
  }
  // The Vet's floodlight is a WHITE top (no green body cast) and its two
  // side rims are the same warm family; the buffet's crown is amber; the
  // cruise deck's floor bounce is turquoise, not sodium.
  const vet = spriteLightFrame(spriteLightFor("vet"), 0);
  assert.ok(vet.topTint[1] < 1.06 && vet.topTint[0] >= 0.98, "floodlight body tint is near-white");
  assert.ok(hueGap(vet.rimLeft, vet.rimRight) < 20, "sodium lot lamps both sides");
  assert.ok(vet.topStrength > 1.1, "stadium floodlights key the crowns everywhere");
  const buffet = spriteLightFrame(spriteLightFor("buffet"), 0);
  assert.ok(hueOf(buffet.top) > 25 && hueOf(buffet.top) < 45, "heat-lamp amber crown");
  assert.ok(buffet.topTint[0] > buffet.topTint[2], "the buffet body warms under the lamps");
  const cruise = spriteLightFrame(spriteLightFor("cruise"), 1);
  assert.ok(hueOf(cruise.floorBounce) > 160 && hueOf(cruise.floorBounce) < 200, "turquoise pool bounce");
  assert.ok(hueOf(cruise.top) > 190 && hueOf(cruise.top) < 230, "sky/moon top");
});

test("poseRig wears the stage the layer was handed", () => {
  const fighter = fighterMock({ x: 1100 });
  const state = stateMock([fighter]);
  const { layer } = layerFor(state);
  layer.update(state, 1 / 60, 0);
  const rig = layer.rigs[0];
  const fb = rig.banks.base.fb;
  const somersetRim = fb.rimRightColor.getHex();
  const somersetTint = [fb.topTint.r, fb.topTint.g, fb.topTint.b];
  assert.deepEqual(somersetTint.map((v) => Math.round(v * 100) / 100), [0.88, 1.12, 0.99]);
  layer.setStageLight(spriteLightFor("vet"));
  layer.update(state, 1 / 60, 0);
  const expected = spriteLightFrame(spriteLightFor("vet"), rig.root.position.x, 0);
  assert.notEqual(fb.rimRightColor.getHex(), somersetRim);
  assert.ok(Math.abs(fb.rimRightColor.r - expected.rimRight[0]) < 1e-9);
  assert.ok(Math.abs(fb.topTint.g - expected.topTint[1]) < 1e-9);
  assert.ok(Math.abs(fb.floorBounce.b - expected.floorBounce[2]) < 1e-9);
  assert.ok(Math.abs(rig.banks.base.reflMaterial.color.r - expected.mirror[0]) < 1e-9);
  assert.equal(layer.bankReport().stageLight, "vet");
  // Wiring: main.mjs hands every (re)built stage's descriptor over, and both
  // stage builders return one.
  assert.match(mainSource, /layers\.get\("fighters"\)\?\.setStageLight\(stage\.spriteLight \|\| spriteLightFor\(id\)\);/);
  assert.match(mainSource, /fighters\.setStageLight\(stage\.spriteLight \|\| spriteLightFor\(stageId\)\);/);
  const generic = readFileSync(join(root, "renderer", "three", "stage-generic.mjs"), "utf8");
  const somerset = readFileSync(join(root, "renderer", "three", "stage-somerset.mjs"), "utf8");
  assert.match(generic, /spriteLight: spriteLightFor\(stageId\),/);
  assert.match(somerset, /spriteLight: spriteLightFor\("somerset"\),/);
  // The shader's top-light body multiplier is the per-stage uniform now.
  assert.match(fightersSource, /uniform vec3 uFbTopTint;/);
  assert.match(fightersSource, /diffuseColor\.rgb \* uFbTopTint \+ uFbTopColor \* 0\.085,/);
  assert.ok(!/vec3\(0\.88, 1\.12, 0\.99\)/.test(fightersSource.replace(/\/\/.*$/gm, "")), "no baked station-lamp green left in the shader");
});

// ---------------------------------------------------------------------------
// #40 — idle-time bank builds, warm-up and eviction.
// ---------------------------------------------------------------------------
test("banks are drawable at once, finish on idle steps, and warm only the banks the fighter owns", () => {
  const fighter = fighterMock();
  const state = stateMock([fighter]);
  const { layer } = layerFor(state);
  layer.update(state, 1 / 60, 0);
  const rig = layer.rigs[0];
  const names = Object.keys(rig.banks).sort();
  assert.deepEqual(names, ["base", "specials", ...OWN_BANKS].sort(),
    "base + specials + the four authored banks with their own sheet, never walk/ext/ext2/ext3 (fighterAtlasFor would have handed back the base sheet)");
  for (const name of AUTHORED_BANKS) {
    if (!OWN_BANKS.includes(name)) assert.equal(rig.banks[name], undefined, `${name} not warmed`);
  }
  // Every bank draws from its raw sheet right now, nothing is ready.
  for (const [name, bank] of Object.entries(rig.banks)) {
    assert.equal(bank.stage, "raw", name);
    assert.equal(bank.ready, false, name);
    assert.equal(bank.material.map, bank.rawMap, `${name} draws the raw sheet until the bleed lands`);
    assert.equal(bank.reflMaterial.map, bank.rawMap);
    assert.equal(bank.footMetrics, null);
  }
  const report = layer.bankReport();
  assert.equal(report.built, 6);
  assert.equal(report.warmed, 4);
  assert.equal(report.lateFallbacks, 0);
  assert.equal(report.ready, 0);
  assert.ok(report.pending >= 6 * 4, `six chains of four steps queued (${report.pending})`);
  assert.deepEqual(report.sides[0].base, "raw");
  // Base runs before specials runs before the authored banks (priority).
  layer.queue.run({ timeRemaining: () => 0 });
  assert.equal(rig.banks.base.stage, "metrics");
  assert.equal(rig.banks.specials.stage, "raw");
  layer.drainBankQueue();
  for (const [name, bank] of Object.entries(rig.banks)) {
    assert.equal(bank.ready, true, name);
    assert.equal(bank.stage, "normal", name);
    assert.notEqual(bank.material.map, bank.rawMap, `${name} swapped to the bled map`);
    assert.equal(bank.material.emissiveMap, bank.material.map);
    assert.equal(bank.depthMaterial.map, bank.material.map);
    assert.notEqual(bank.reflMaterial.map, bank.material.map, "mirror draws the smeared copy");
    assert.equal(bank.rawMap, null, "raw sheet texture released");
    assert.ok(bank.footMetrics?.extent?.length === 16);
    assert.equal(bank.material.normalMap.image.width, 1280, `${name} swapped the flat 1x1 stand-in for the real normal map`);
  }
  assert.equal(layer.bankReport().ready, 6);
  assert.equal(layer.bankReport().pending, 0);
  // A texture landing mid-chain opens on the cell the rig is showing.
  fighter.__pose = { bank: "base", frame: 9 };
  layer.update(state, 1 / 60, 0);
  assert.equal(rig.banks.base.frame, 9);
  // Caches now hold the six sheets...
  const stats = atlasCacheStats();
  assert.equal(stats.bleed, 6);
  assert.equal(stats.normal, 6);
  assert.equal(stats.smear, 6);
  assert.equal(stats.footMetrics, 6);
  assert.equal(stats.pixels, 0, "the shared pixel read is released once its three consumers ran");
  // ...and disposing the rig EVICTS them.
  layer.disposeRig(rig);
  layer.rigs[0] = null;
  const after = atlasCacheStats();
  assert.deepEqual(after, { pixels: 0, bleed: 0, smear: 0, normal: 0, footMetrics: 0, hd: 0 });
  assert.ok(layer.bankReport().evicted >= 24, "bleed + smear + normal + metrics per sheet");
  for (const bank of Object.values(rig.banks)) {
    assert.equal(bank.disposed, true);
    assert.equal(bank.material.disposed, true);
    assert.equal(bank.map.disposed, true);
    assert.equal(bank.reflMap.disposed, true);
  }
});

test("a mid-chain disposal drops the queued steps, and a late bank counts as a fallback", () => {
  const fighter = fighterMock();
  const state = stateMock([fighter]);
  const { layer } = layerFor(state);
  layer.update(state, 1 / 60, 0);
  const rig = layer.rigs[0];
  layer.queue.run({ timeRemaining: () => 0 });
  assert.ok(layer.queue.pending > 0);
  layer.disposeRig(rig);
  assert.equal(layer.queue.pending, 0, "the rig's key cancels its chains");
  // A bank whose sheet decoded late is built on first use — drawable at
  // once, chain queued — and tallied.
  const late = fighterMock({ __pose: { bank: "walk", frame: 2, fallback: { bank: "base", frame: 4 } } });
  const lateState = stateMock([late]);
  const lateLayer = layerFor(lateState, { ownBanks: [] }).layer;
  lateLayer.host.fighterAtlasFor = (f, bank) => ({ complete: true, naturalWidth: 1280, naturalHeight: 1280, src: `late:${bank}` });
  lateLayer.update(lateState, 1 / 60, 0);
  const lateRig = lateLayer.rigs[0];
  assert.ok(lateRig.banks.walk, "built on first use");
  assert.equal(lateRig.currentBank, "walk");
  assert.equal(lateLayer.bankReport().lateFallbacks, 1);
  assert.equal(lateLayer.bankReport().warmed, 0);
});

test("sheets shared by both sides survive one side's disposal; idle rigs are evicted after 3 s", () => {
  const a = fighterMock();
  const b = fighterMock({ side: 1, facing: -1, x: 800 });
  const state = stateMock([a, b]);
  const { layer } = layerFor(state);
  layer.update(state, 1 / 60, 0);
  layer.drainBankQueue();
  assert.equal(atlasCacheStats().bleed, 6, "one cache entry per sheet, both sides share them");
  layer.disposeRig(layer.rigs[0]);
  layer.rigs[0] = null;
  assert.equal(atlasCacheStats().bleed, 6, "side 1 still draws every one of those sheets");
  layer.disposeRig(layer.rigs[1]);
  layer.rigs[1] = null;
  assert.equal(atlasCacheStats().bleed, 0);
  // Idle eviction: no fighters for IDLE_EVICT_SEC releases both rigs.
  layer.update(state, 1 / 60, 0);
  assert.ok(layer.rigs[0] && layer.rigs[1]);
  const empty = stateMock([]);
  layer.update(empty, 1, 0);
  layer.update(empty, 1, 0);
  assert.ok(layer.rigs[0], "not yet");
  layer.update(empty, 1.1, 0);
  assert.equal(layer.rigs[0], null);
  assert.equal(layer.rigs[1], null);
  assert.equal(atlasCacheStats().bleed, 0);
  assert.match(fightersSource, /const IDLE_EVICT_SEC = 3;/);
});

test("the balanced tier builds a half-resolution normal map", () => {
  const fighter = fighterMock();
  const state = stateMock([fighter]);
  state.performance = { id: "balanced", trailScale: 0.5 };
  const { layer } = layerFor(state);
  assert.equal(layer.normalStep(), 2);
  state.performance = { id: "high", trailScale: 1 };
  assert.equal(layer.normalStep(), 1);
});

// ---------------------------------------------------------------------------
// atlas-pixels kernels + the idle queue.
// ---------------------------------------------------------------------------
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A sheet of random blobs with soft alpha skirts, white under alpha 0.
function syntheticSheet(seed, w = 96, h = 96) {
  const rnd = mulberry(seed);
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let i = 3; i < data.length; i += 4) data[i] = 0;
  const blobs = Array.from({ length: 6 }, () => ({
    x: rnd() * w, y: rnd() * h, r: 4 + rnd() * 14, c: [rnd() * 255, rnd() * 255, rnd() * 255],
  }));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      for (const blob of blobs) {
        const d = Math.hypot(x - blob.x, y - blob.y) / blob.r;
        if (d > 1.1) continue;
        const p = (y * w + x) * 4;
        const alpha = d < 0.9 ? 255 : Math.round(255 * (1.1 - d) / 0.2);
        if (alpha <= data[p + 3]) continue;
        data[p] = blob.c[0] + (rnd() - 0.5) * 30;
        data[p + 1] = blob.c[1] + (rnd() - 0.5) * 30;
        data[p + 2] = blob.c[2] + (rnd() - 0.5) * 30;
        data[p + 3] = alpha;
      }
    }
  }
  return { data, w, h };
}

// The pre-5.1 whole-sheet dilation, kept here as the reference.
function referenceBleed(data, w, h, passes = 7) {
  const known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) known[i] = data[i * 4 + 3] > 12 ? 1 : 0;
  const next = new Uint8Array(w * h);
  for (let pass = 0; pass < passes; pass += 1) {
    next.set(known);
    let changed = false;
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = 0; x < w; x += 1) {
        const i = row + x;
        if (known[i]) continue;
        let r = 0; let g = 0; let b = 0; let n = 0;
        if (x > 0 && known[i - 1]) { const p = (i - 1) * 4; r += data[p]; g += data[p + 1]; b += data[p + 2]; n += 1; }
        if (x < w - 1 && known[i + 1]) { const p = (i + 1) * 4; r += data[p]; g += data[p + 1]; b += data[p + 2]; n += 1; }
        if (y > 0 && known[i - w]) { const p = (i - w) * 4; r += data[p]; g += data[p + 1]; b += data[p + 2]; n += 1; }
        if (y < h - 1 && known[i + w]) { const p = (i + w) * 4; r += data[p]; g += data[p + 1]; b += data[p + 2]; n += 1; }
        if (!n) continue;
        const p = i * 4;
        data[p] = r / n; data[p + 1] = g / n; data[p + 2] = b / n;
        next[i] = 1;
        changed = true;
      }
    }
    known.set(next);
    if (!changed) break;
  }
  return data;
}

test("the frontier bleed is byte-identical to the old whole-sheet dilation", () => {
  for (const seed of [1, 7, 42, 1999]) {
    const sheet = syntheticSheet(seed);
    const reference = referenceBleed(new Uint8ClampedArray(sheet.data), sheet.w, sheet.h);
    const frontier = bleedPixels(new Uint8ClampedArray(sheet.data), sheet.w, sheet.h);
    assert.equal(Buffer.compare(Buffer.from(reference.buffer), Buffer.from(frontier.buffer)), 0, `seed ${seed}`);
    // And it actually bled: transparent texels next to the blobs are no
    // longer white.
    let recoloured = 0;
    for (let i = 0; i < sheet.data.length; i += 4) {
      if (sheet.data[i + 3] <= 12 && (frontier[i] !== 255 || frontier[i + 1] !== 255 || frontier[i + 2] !== 255)) recoloured += 1;
    }
    assert.ok(recoloured > 200, `seed ${seed} recoloured ${recoloured}`);
  }
  // Degenerate sheets: all transparent (nothing to bleed) and all opaque.
  const empty = new Uint8ClampedArray(16 * 16 * 4);
  assert.deepEqual([...bleedPixels(new Uint8ClampedArray(empty), 16, 16)], [...empty]);
  const solid = new Uint8ClampedArray(16 * 16 * 4).fill(200);
  assert.deepEqual([...bleedPixels(new Uint8ClampedArray(solid), 16, 16)], [...solid]);
});

test("normal map: step 1 is the old kernel, step 2 is a quarter of the bytes with the same field", () => {
  const sheet = syntheticSheet(3, 64, 64);
  const full = normalPixels(sheet.data, sheet.w, sheet.h);
  assert.equal(full.width, 64);
  assert.equal(full.data.length, 64 * 64 * 4);
  // Flat where nothing is drawn: (128,128,255).
  let flat = 0;
  for (let i = 0; i < full.data.length; i += 4) {
    if (full.data[i] === 128 && full.data[i + 1] === 128 && full.data[i + 2] === 255) flat += 1;
  }
  assert.ok(flat > 1000 && flat < 64 * 64, `flat texels ${flat}`);
  // Outward-facing normals on the left edge of a blob: nx < 0 there means
  // the height falls off to the left... which is what the rim gate reads.
  let leaning = 0;
  for (let i = 0; i < full.data.length; i += 4) if (Math.abs(full.data[i] - 128) > 20) leaning += 1;
  assert.ok(leaning > 100, `edge normals ${leaning}`);
  const half = normalPixels(sheet.data, sheet.w, sheet.h, { step: 2 });
  assert.equal(half.width, 32);
  assert.equal(half.height, 32);
  assert.equal(half.data.length, full.data.length / 4);
  let halfLeaning = 0;
  for (let i = 0; i < half.data.length; i += 4) if (Math.abs(half.data[i] - 128) > 20) halfLeaning += 1;
  assert.ok(halfLeaning > 20, "the half-res field keeps its edges");
});

test("foot metrics: padding, soles and the silhouette box per cell", () => {
  // 64 px cells: the sole clusters split on gaps wider than 6% of the cell
  // (3.84 px here, 19.2 px on a real 320 px cell), so adjacent columns of
  // one shoe must not split — a 16 px cell would put that threshold under
  // one column and shatter every foot.
  const w = 256;
  const h = 256;
  const data = new Uint8ClampedArray(w * h * 4);
  // Cell 0: a 21-wide body from x 20..40, y 8..47 → padBottom 16/64.
  for (let y = 8; y <= 47; y += 1) for (let x = 20; x <= 40; x += 1) data[(y * w + x) * 4 + 3] = 255;
  // Cell 5 (at 64,64): two 8-wide legs at x 72..79 and 104..111, y 80..127 (soles on the cell edge).
  for (let y = 80; y <= 127; y += 1) {
    for (let x = 72; x <= 79; x += 1) data[(y * w + x) * 4 + 3] = 255;
    for (let x = 104; x <= 111; x += 1) data[(y * w + x) * 4 + 3] = 255;
  }
  const metrics = footMetricsFromPixels(data, w, h, 4, 4);
  assert.equal(metrics.padBottom.length, 16);
  assert.ok(Math.abs(metrics.padBottom[0] - 16 / 64) < 1e-9);
  assert.equal(metrics.feet[0].length, 1);
  assert.ok(Math.abs(metrics.feet[0][0].u - (30 / 64 - 0.5)) < 1e-9);
  assert.deepEqual(metrics.extent[0], { left: 20 / 64 - 0.5, right: 41 / 64 - 0.5, top: (64 - 8) / 64, bottom: 16 / 64 });
  assert.equal(metrics.padBottom[5], 0);
  assert.equal(metrics.feet[5].length, 2, "two clusters");
  assert.deepEqual(metrics.feet[5].map((f) => f.u).sort(), [11.5 / 64 - 0.5, 43.5 / 64 - 0.5]);
  assert.deepEqual(metrics.extent[5], { left: 8 / 64 - 0.5, right: 48 / 64 - 0.5, top: (64 - 16) / 64, bottom: 0 });
  // Empty cell.
  assert.equal(metrics.padBottom[15], 0);
  assert.deepEqual(metrics.feet[15], []);
  assert.deepEqual(metrics.extent[15], { left: -0.5, right: 0.5, top: 1, bottom: 0 });
});

test("IdleQueue: priority order, FIFO within a priority, key cancel, chained pushes, deadline slack", () => {
  const scheduled = [];
  const queue = new IdleQueue({ schedule: (fn) => scheduled.push(fn) });
  const ran = [];
  queue.push(() => ran.push("c1"), { key: "c", priority: 2 });
  queue.push(() => ran.push("a1"), { key: "a", priority: 0 });
  queue.push(() => ran.push("b1"), { key: "b", priority: 1 });
  queue.push(() => ran.push("a2"), { key: "a", priority: 0 });
  assert.equal(scheduled.length, 1, "one callback armed");
  assert.equal(queue.pending, 4);
  // No slack: exactly one step per callback.
  scheduled.shift()({ timeRemaining: () => 0 });
  assert.deepEqual(ran, ["a1"]);
  assert.equal(scheduled.length, 1, "re-armed");
  assert.equal(queue.cancel("b"), 1);
  assert.equal(queue.pending, 2);
  // Slack: keeps going while the deadline says so.
  let budget = 3;
  scheduled.shift()({ timeRemaining: () => (budget -= 1) * 10 });
  assert.deepEqual(ran, ["a1", "a2", "c1"]);
  assert.equal(scheduled.length, 0, "nothing left to arm");
  // A step that pushes its successor does not double-arm.
  queue.push(() => { ran.push("x"); queue.push(() => ran.push("y")); }, { key: "x" });
  assert.equal(scheduled.length, 1);
  scheduled.shift()(null);
  assert.deepEqual(ran.slice(-1), ["x"]);
  assert.equal(scheduled.length, 1, "re-armed exactly once for the successor");
  scheduled.shift()(null);
  assert.deepEqual(ran.slice(-2), ["x", "y"]);
  // drain runs everything synchronously and a throwing step does not stop it.
  queue.push(() => { throw new Error("boom"); });
  queue.push(() => ran.push("after"));
  const warn = console.warn;
  console.warn = () => {};
  try {
    queue.drain();
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(ran.slice(-1), ["after"]);
  assert.equal(queue.pending, 0);
});

test("fighters.mjs builds nothing synchronously past the raw shell, and game.js hands over the warm-up gate", () => {
  const stripped = fightersSource.replace(/\/\/.*$/gm, "");
  // poseRig / ensureMotionBank never call the kernels directly any more.
  const poseStart = stripped.indexOf("  poseRig(rig, fighter, state, timeSec, dtSec = 0) {");
  const poseBody = stripped.slice(poseStart);
  for (const kernel of ["bleedAtlasCanvas(", "normalMapForAtlas(", "smearedAtlasTexture(", "atlasFootMetrics("]) {
    assert.ok(!poseBody.includes(kernel), `${kernel} not called from poseRig`);
  }
  const buildStart = stripped.indexOf("  buildBank(image, hdPath = null");
  const buildEnd = stripped.indexOf("  setStageLight(");
  const buildBody = stripped.slice(buildStart, buildEnd);
  // Every kernel call inside buildBank sits inside a queued step.
  for (const kernel of ["atlasColorTexture(", "normalMapForAtlas(", "smearedAtlasTexture(", "atlasFootMetrics(", "hdComposedCanvas("]) {
    const at = buildBody.indexOf(kernel);
    assert.ok(at > 0, kernel);
    const before = buildBody.slice(0, at);
    assert.ok(before.lastIndexOf("step(\"") > before.lastIndexOf("const bank = {"), `${kernel} runs in a step`);
  }
  assert.match(fightersSource, /this\.queue\.cancel\(rig\.key\);/);
  assert.match(fightersSource, /this\.bankStats\.evicted \+= releaseAtlasCaches\(image\);/);
  assert.match(gameSource, /fighterBankSheet: \(fighterId, bank\) => altAtlasSource\(fighterId, bank\)\.image \|\| null,/);
  assert.match(gameSource, /downTiltRadians: DOWN_TILT_RADIANS,/);
  assert.match(mainSource, /banks: layers\.get\("fighters"\)\?\.bankReport\?\.\(\) \?\? null,/);
  assert.match(mainSource, /drainBankQueue: renderer3d\.drainBankQueue,/);
});
