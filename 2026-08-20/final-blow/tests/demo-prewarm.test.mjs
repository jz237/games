import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AUTHORED_BANKS } from "../engine/fighter-kits.mjs";
import { IdleQueue } from "../renderer/three/atlas-pixels.mjs";
import { createDemoDirector } from "../engine/demo.mjs";

// ---------------------------------------------------------------------------
// 5.4 FIGHT NIGHT (sweep #26 / #27) — PREWARM THE NEXT PAIR.
//
// Two measured faults: CINEMA 3D rebuilt both fighter rigs on the cycle-start
// frame of every exhibition swap (130-362 ms of main-thread JS, 12-26 frames
// over 33 ms in the first two seconds), and on a cold host a new fighter's
// first 1.6-4.2 s were drawn from base fallbacks because the demo was exempt
// from the intro art hold and could not know its next pair. The fix has three
// halves: engine/demo.mjs peek() (pinned in demo.test.mjs), the fighter
// layer's prewarm + adoption + side-swap (driven here through the same mock
// host cinema-fighters.test.mjs uses), and the game.js wiring, which is
// pinned from source because the part that must never regress is the GATING:
// every warm-up site is demo-only, and the sim never reads any of it.
// ---------------------------------------------------------------------------

const testDir = dirname(fileURLToPath(import.meta.url));
const root = join(testDir, "..");
const gameSource = readFileSync(join(root, "game.js"), "utf8");
const fightersSource = readFileSync(join(root, "renderer", "three", "fighters.mjs"), "utf8");
const mainSource = readFileSync(join(root, "renderer", "three", "main.mjs"), "utf8");
const indexSource = readFileSync(join(root, "index.html"), "utf8");
const cssSource = readFileSync(join(root, "styles.css"), "utf8");
const demoDoc = readFileSync(join(root, "DEMO.md"), "utf8");

register("./helpers/three-stub-loader.mjs", import.meta.url);

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

const SIM_FLOOR = 600;
const OWN_BANKS = ["motion", "motion2", "unified", "unified-ext4"];

// The mock host: every sheet is decoded unless the test says otherwise
// (`pending` holds "id:bank" keys whose sheet has not arrived yet).
function mockHost(state, { ownBanks = OWN_BANKS, pending = new Set(), palettes = {} } = {}) {
  const sheets = new Map();
  const sheetFor = (id, bank) => {
    const key = `${id}:${bank}`;
    if (!sheets.has(key)) sheets.set(key, { complete: true, naturalWidth: 1280, naturalHeight: 1280, src: `mock:${key}` });
    const sheet = sheets.get(key);
    sheet.complete = !pending.has(key);
    return sheet;
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
    fighterAtlasFor: (fighter, bank) => (bank === "base" || bank === "specials" || ownBanks.includes(bank)
      ? sheetFor(fighter.def.id, bank) : sheetFor(fighter.def.id, "base")),
    fighterPaletteKey: (fighter) => palettes[fighter.def.id] || "",
    hdSheetPath: () => null,
    fighterBankSheet: (id, bank) => (ownBanks.includes(bank) ? sheetFor(id, bank) : null),
    downTiltFor: () => 1.35,
    downTiltRadians: 1.35,
    isUnifiedFighter: () => false,
    cellDrawAdjust: () => 1,
    cellVerticalOffset: () => 0,
    gritSuperCost: 100,
    pending,
  };
}

function fighterMock(id, side, over = {}) {
  return {
    def: { id, accent: "#ff8040" },
    side, facing: side === 0 ? 1 : -1, x: side === 0 ? 500 : 780, y: SIM_FLOOR, vx: 0, grounded: true, crouch: false, block: false, stun: false,
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
  layer.queue = new IdleQueue({ schedule: () => {} });
  const uploads = [];
  layer.uploadTexture = (texture) => uploads.push(texture);
  return { host, layer, uploads };
}

const EXPECTED_BANKS = 2 + OWN_BANKS.length; // base + specials + the four own authored sheets

// ---------------------------------------------------------------------------
// The prewarm plan: what a fighter's warm-up builds, in what priority, and
// that it is incremental against sheets still in flight.
// ---------------------------------------------------------------------------
test("prewarmFighters builds the same bank set buildRig would, behind every live step, and adds late sheets on a later pass", () => {
  const live = [fighterMock("ali", 0), fighterMock("benny", 1)];
  const state = stateMock(live);
  const pending = new Set(["post:unified-ext4"]);
  const { layer } = layerFor(state, { pending });
  layer.update(state, 1 / 60, 0);
  layer.drainBankQueue();
  const builtBefore = layer.bankStats.built;
  assert.equal(builtBefore, EXPECTED_BANKS * 2, "two live rigs, every own bank warmed at build");

  // A live rig chain step queued now must run before anything the prewarm queues.
  layer.queue.push(() => {}, { key: "live-probe", priority: 3 });
  const started = layer.prewarmFighters([{ def: { id: "post" }, side: 0 }, { def: { id: "devil" }, side: 1 }]);
  assert.equal(started, EXPECTED_BANKS * 2 - 1, "everything but the sheet still in flight");
  assert.equal(layer.bankStats.prewarmed, started);
  assert.deepEqual([...layer.prewarmed.keys()], ["post", "devil"]);
  assert.equal(layer.queue.steps[0].key, "live-probe", "prewarm steps sort behind live work");
  assert.ok(layer.queue.steps.slice(1).every((step) => step.priority >= 20 && /^prewarm:/.test(step.key)));
  const report = layer.prewarmReport();
  assert.deepEqual(report.declared, ["post", "devil"]);
  assert.equal(Object.keys(report.sets.post).length, EXPECTED_BANKS - 1);
  assert.equal(report.sets.post["unified-ext4"], undefined, "the pending sheet has no bank yet");
  assert.equal(report.ready, false);

  // Idempotent: the same call again builds nothing new.
  assert.equal(layer.prewarmFighters([{ def: { id: "post" }, side: 0 }, { def: { id: "devil" }, side: 1 }]), 0);
  // The sheet lands; the next pass adds exactly that bank.
  pending.delete("post:unified-ext4");
  assert.equal(layer.prewarmFighters([{ def: { id: "post" }, side: 0 }, { def: { id: "devil" }, side: 1 }]), 1);
  assert.equal(Object.keys(layer.prewarmReport().sets.post).length, EXPECTED_BANKS);
  assert.equal(layer.bankStats.built, builtBefore + EXPECTED_BANKS * 2, "the live rigs were not rebuilt");
});

test("a prewarmed bank finishes its chain on idle slices and uploads its textures there, never on a draw", () => {
  const state = stateMock([]);
  const { layer, uploads } = layerFor(state);
  layer.prewarmFighters([{ def: { id: "post" }, side: 0 }]);
  assert.equal(uploads.length, 0, "nothing uploaded synchronously");
  layer.drainBankQueue();
  const report = layer.prewarmReport();
  assert.ok(Object.values(report.sets.post).every((stage) => stage === "ready"), JSON.stringify(report.sets.post));
  assert.equal(report.ready, true);
  // colour map + mirror map + normal map per bank.
  assert.equal(uploads.length, EXPECTED_BANKS * 3);
  assert.equal(layer.bankStats.uploaded, EXPECTED_BANKS * 3);
  for (const bank of Object.values(layer.prewarmed.get("post").banks)) {
    assert.ok(bank.upload && bank.warm && bank.ready);
    assert.ok(uploads.includes(bank.map) && uploads.includes(bank.reflMap) && uploads.includes(bank.normalMap));
  }
  // A live rig's banks are NOT uploaded through this path (its raw upload
  // happens on the frame that draws it, as before).
  const live = stateMock([fighterMock("ali", 0)]);
  const plain = layerFor(live);
  plain.layer.update(live, 1 / 60, 0);
  plain.layer.drainBankQueue();
  assert.equal(plain.uploads.length, 0);
});

// ---------------------------------------------------------------------------
// The swap: adoption, no rebuild on the boundary frame, the sweep after.
// ---------------------------------------------------------------------------
test("the swap adopts a prewarmed set whole: no bank is built on the boundary frame and the chain's work is kept", () => {
  const outgoing = [fighterMock("ali", 0), fighterMock("benny", 1)];
  const state = stateMock(outgoing);
  const { layer } = layerFor(state);
  layer.update(state, 1 / 60, 0);
  layer.drainBankQueue();
  layer.prewarmFighters([{ def: { id: "post" }, side: 0 }, { def: { id: "devil" }, side: 1 }]);
  layer.drainBankQueue();
  const postSet = layer.prewarmed.get("post");
  const builtBefore = layer.bankStats.built;
  const readyBefore = layer.bankStats.ready;

  // The boundary frame.
  state.fighters = [fighterMock("post", 0), fighterMock("devil", 1)];
  layer.update(state, 1 / 60, 1);
  assert.equal(layer.bankStats.built, builtBefore, "no bank built on the swap frame");
  assert.equal(layer.bankStats.adopted, EXPECTED_BANKS * 2);
  assert.deepEqual(layer.rigs.map((rig) => rig.adopted), [EXPECTED_BANKS, EXPECTED_BANKS]);
  assert.equal(layer.rigs[0].banks.base, postSet.banks.base, "the very same bank object");
  assert.ok(layer.rigs[0].banks.base.ready, "adopted banks arrive finished");
  assert.deepEqual(layer.rigs[0].keys, [layer.rigs[0].key, postSet.key], "the rig owns the prewarm key too");
  assert.equal(layer.prewarmed.size, 0, "adopted sets leave the prewarm map");
  assert.equal(layer.bankStats.ready, readyBefore, "nothing re-ran");
  assert.equal(layer.queue.pending, 0, "nothing queued by the swap");
  const report = layer.bankReport();
  assert.deepEqual(report.adoptedSides, [EXPECTED_BANKS, EXPECTED_BANKS]);
  assert.deepEqual(report.prewarm.sets, {});
  // The outgoing pair's caches were evicted after the swap, the incoming
  // pair's kept: the cache holds exactly the live sheets.
  const caches = atlasCacheStats();
  assert.equal(caches.footMetrics, EXPECTED_BANKS * 2, `caches ${JSON.stringify(caches)}`);
  // Disposal of an adopted rig cancels both keys' steps.
  layer.queue.push(() => {}, { key: postSet.key, priority: 20 });
  layer.queue.push(() => {}, { key: layer.rigs[0].key, priority: 0 });
  layer.disposeRig(layer.rigs[0]);
  assert.equal(layer.queue.pending, 0);
  layer.rigs[0] = null;
});

test("a set that was prewarmed but never adopted is swept once nobody declares it, and releasePrewarm drops everything", () => {
  const state = stateMock([fighterMock("ali", 0), fighterMock("benny", 1)]);
  const { layer } = layerFor(state);
  layer.update(state, 1 / 60, 0);
  layer.drainBankQueue();
  layer.prewarmFighters([{ def: { id: "post" }, side: 0 }, { def: { id: "devil" }, side: 1 }]);
  layer.drainBankQueue();
  const cachesWarm = atlasCacheStats().footMetrics;
  assert.equal(cachesWarm, EXPECTED_BANKS * 4);
  // Still declared: an update keeps it.
  layer.update(state, 1 / 60, 1);
  assert.equal(layer.prewarmed.size, 2);
  // The director changed its mind: only devil is declared now.
  layer.prewarmFighters([{ def: { id: "devil" }, side: 0 }]);
  layer.update(state, 1 / 60, 2);
  assert.deepEqual([...layer.prewarmed.keys()], ["devil"]);
  assert.equal(atlasCacheStats().footMetrics, EXPECTED_BANKS * 3, "post's caches were evicted with his set");
  // The demo exits: everything not live goes.
  const evictedBefore = layer.bankStats.evicted;
  assert.equal(layer.releasePrewarm(), 1);
  assert.equal(layer.prewarmed.size, 0);
  assert.ok(layer.bankStats.evicted > evictedBefore);
  assert.equal(atlasCacheStats().footMetrics, EXPECTED_BANKS * 2, "only the live pair's sheets remain cached");
  assert.equal(layer.prewarmReport().ready, true);
  // A palette change on a declared fighter rebuilds his set (the alt atlas is a different source).
  layer.prewarmFighters([{ def: { id: "post" }, side: 0 }]);
  const firstKey = layer.prewarmed.get("post").key;
  layer.host.fighterPaletteKey = () => "alt";
  layer.prewarmFighters([{ def: { id: "post" }, side: 0 }]);
  assert.notEqual(layer.prewarmed.get("post").key, firstKey);
  assert.equal(layer.prewarmed.get("post").paletteKey, "alt");
  layer.releasePrewarm();
});

// ---------------------------------------------------------------------------
// The returning fighter: side swap instead of a cold rebuild, and no phantom
// second bank set for a fighter who is already on screen.
// ---------------------------------------------------------------------------
test("a fighter who returns on the other side keeps his rig (side swap), and prewarm never duplicates a live fighter", () => {
  const state = stateMock([fighterMock("ali", 0), fighterMock("benny", 1)]);
  const { layer } = layerFor(state);
  layer.update(state, 1 / 60, 0);
  layer.drainBankQueue();
  const aliRig = layer.rigs[0];
  // The next pair is ali (returning, other side) + post: only post is warmed.
  const started = layer.prewarmFighters([{ def: { id: "post" }, side: 0 }, { def: { id: "ali" }, side: 1 }]);
  assert.equal(started, EXPECTED_BANKS, "ali is live: no second set for him");
  assert.deepEqual([...layer.prewarmed.keys()], ["post"]);
  layer.drainBankQueue();
  const builtBefore = layer.bankStats.built;
  state.fighters = [fighterMock("post", 0), fighterMock("ali", 1)];
  layer.update(state, 1 / 60, 1);
  assert.equal(layer.rigs[1], aliRig, "ali's rig crossed to side 1 untouched");
  assert.equal(layer.bankStats.sideSwaps, 1);
  assert.equal(layer.bankStats.built, builtBefore, "nothing rebuilt on the boundary: post adopted, ali moved");
  assert.equal(layer.rigs[0].id, "post");
  assert.equal(layer.rigs[0].adopted, EXPECTED_BANKS);
  // Ali's caches survived his old seat's disposal (benny's did not).
  assert.equal(atlasCacheStats().footMetrics, EXPECTED_BANKS * 2);
  // Posed on the new side: the mirror follows the fighter, not the old seat.
  assert.equal(Math.sign(aliRig.mesh.scale.x), -1);
  // A same-side return is not a swap.
  state.fighters = [fighterMock("post", 0), fighterMock("ali", 1)];
  layer.update(state, 1 / 60, 2);
  assert.equal(layer.bankStats.sideSwaps, 1);
});

// ---------------------------------------------------------------------------
// The wiring, pinned from source: demo-gated everywhere, sim untouched.
// ---------------------------------------------------------------------------
test("game.js warms the next pair only inside the demo session, from the director's peek, and the played match is untouched", () => {
  const stripped = gameSource.replace(/\/\/.*$/gm, "");
  const sites = [...stripped.matchAll(/demoPrewarmNextPair\(/g)].map((match) => match.index);
  // The definition plus exactly four call sites: round 2, the result hold,
  // the idle countdown and the QA hook.
  assert.equal(sites.length, 5, `sites ${sites.length}`);
  const around = (index) => stripped.slice(Math.max(0, index - 900), index);
  const calls = sites.filter((index) => !stripped.slice(index, index + 40).startsWith("demoPrewarmNextPair(reason"));
  assert.equal(calls.length, 4);
  assert.ok(calls.some((index) => /state\.mode === "demo" && demoSession\.active && !rollbackResimulating\) demoPrewarmNextPair\("round2"\)/.test(stripped.slice(index - 90, index + 40))), "round 2 site is demo-gated and resim-guarded");
  assert.ok(calls.some((index) => around(index).includes("function scheduleNextDemoMatch() {") && around(index).includes("if (!demoSession.active) return;")), "result-hold site sits behind the demo session guard");
  assert.ok(calls.some((index) => /demoPrewarmNextPair\("idle", demoSession\.pendingDirector\)/.test(stripped.slice(index, index + 60)) && around(index).includes('state.screen !== "title" || document.hidden) return;')), "idle site is title-screen only");
  assert.ok(calls.some((index) => /if \(force && demoSession\.active\) demoPrewarmNextPair\("qa"\)/.test(stripped.slice(index - 40, index + 40))), "QA site needs an active demo");
  // The warm-up reads the director's peek and only render/network-side hooks.
  const body = stripped.slice(stripped.indexOf("function demoPrewarmNextPair("), stripped.indexOf("function demoPrewarmSnapshot("));
  assert.ok(body.includes("const next = director.peek();"));
  for (const hook of ["preloadAuthoredBanks(ids)", "warmFighterAudio(ids)", "announcerBank(`${id}-name`)", "announcerBank(`${id}-wins`)", "prewarmFighters?.(demoPrewarmDescriptors(prewarm.ids))"]) {
    assert.ok(body.includes(hook), hook);
  }
  for (const simField of ["state.rng", "state.visualRng", "state.phase =", "state.phaseTime", "simulationClock", "state.fighters["]) {
    assert.ok(!body.includes(simField), `the warm-up never touches ${simField}`);
  }
  // The sim never reads the warm-up: every read of demoSession.prewarm sits
  // in the warm-up functions, the snapshot, endDemoSession or startMatch's
  // abandon branch — never in a tick.
  const tickStart = stripped.indexOf("function simulateGameTick(");
  const tickEnd = stripped.indexOf("function loop(now)");
  assert.ok(tickStart > 0 && tickEnd > tickStart);
  assert.ok(!stripped.slice(tickStart, tickEnd).includes("demoSession.prewarm"), "no tick reads the warm-up");
  // Round 2 in a demo triggers before any sim field is touched by the trigger.
  assert.match(stripped, /state\.phaseTime = state\.mode === "demo" \? DEMO_ROUND_INTRO_SECONDS : 2\.1;\s*if \(state\.mode === "demo" && demoSession\.active && !rollbackResimulating\) demoPrewarmNextPair\("round2"\);/);
  // The demo honours the hold like a played match, under its own chip.
  assert.ok(stripped.includes('const holdable = introArtHold.enabled && state.mode !== "online" && !replayPlayback.active;'));
  assert.ok(stripped.includes('curtain.hidden = demo || !introArtHold.active;'));
  assert.ok(stripped.includes("chip.textContent = `LOADING · ${progress}`;"));
  // A played match abandons an idle warm-up and releases its 3D banks.
  assert.match(stripped, /if \(state\.mode !== "demo" && \(demoSession\.pendingDirector \|\| demoSession\.prewarm\)\) \{\s*demoSession\.pendingDirector = null;\s*demoSession\.pendingDirectorSeed = null;\s*clearDemoPrewarm\(true\);/);
  // The attract loop adopts the countdown's director; a seeded QA demo never does.
  assert.ok(stripped.includes("const pending = seed === null ? demoSession.pendingDirector : null;"));
  // Timers: the pump is cleared at the swap and on exit.
  assert.ok(stripped.includes("clearDemoPrewarm(false);") && stripped.includes("clearDemoPrewarm(true);"));
  assert.ok(stripped.includes("window.clearInterval(prewarm.timer);"));
  // QA surface + snapshot.
  assert.ok(stripped.includes("demoPrewarm({ force = false } = {}) {"));
  assert.ok(stripped.includes("prewarm: demoPrewarmSnapshot(),"));
});

test("the 3D bridge, the HUD chip and the doc carry the feature", () => {
  assert.match(mainSource, /fighters\.uploadTexture = \(texture\) => renderer\.initTexture\(texture\);/);
  assert.match(mainSource, /renderer3d\.prewarmFighters = \(fighters\) => layers\.get\("fighters"\)\?\.prewarmFighters\?\.\(fighters\) \?\? 0;/);
  assert.match(mainSource, /renderer3d\.releasePrewarm = \(\) => layers\.get\("fighters"\)\?\.releasePrewarm\?\.\(\) \?\? 0;/);
  assert.match(mainSource, /prewarmFighters: renderer3d\.prewarmFighters,\s*releasePrewarm: renderer3d\.releasePrewarm,/);
  assert.match(fightersSource, /const PREWARM_PRIORITY = 20;/);
  assert.match(fightersSource, /prewarm: this\.prewarmReport\(\),/);
  assert.ok(indexSource.includes('<i id="demoHudLoading" class="demo-hud-loading" hidden>LOADING</i>'));
  // (5.4 integration: the chip rule is scoped to its own class — the demo-hud
  // item's speed tag is an <i> on the same panel and must not pulse amber.)
  assert.match(cssSource, /\.demo-hud-loading \{ color: var\(--amber\);/);
  assert.match(cssSource, /\.demo-hud-loading\[hidden\] \{ display: none !important; \}/);
  assert.ok(demoDoc.includes("## Prewarming the next pair (5.4"), "DEMO.md documents the warm-up");
  assert.ok(demoDoc.includes("director.peek()"));
});

test("peek() is what the warm-up sees: the pair the next swap seats, one exhibition early", () => {
  const director = createDemoDirector({ fighterIds: ["ali", "benny", "post", "devil"], stageIds: ["somerset", "vet"], trackCount: 2, seed: 5 });
  director.next();
  const peeked = director.peek();
  const cycle = director.next();
  assert.deepEqual([...cycle.picks].sort(), [...peeked.pair].sort());
  assert.equal(cycle.cycle, peeked.cycle);
});
