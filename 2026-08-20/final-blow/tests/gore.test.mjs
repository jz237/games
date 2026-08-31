import assert from "node:assert/strict";
import test from "node:test";

import {
  ARTERIAL_FRAMES,
  GORE_BUDGETS,
  GORE_SFX,
  SIGNATURE_GORE,
  arterialPressure,
  auditSignatureGore,
  bloodSoak,
  bloodTint,
  canSpawnFloorStain,
  canSpawnSmear,
  canSpawnWallStain,
  collapseEnvelope,
  scatterBandOffset,
  signatureGore,
  stainBudget,
} from "../engine/gore.mjs";
import { GRAPHIC_FATALITIES } from "../engine/fatalities.mjs";

test("arterial pressure starts strong and bleeds out to nothing", () => {
  const fresh = arterialPressure(ARTERIAL_FRAMES);
  const mid = arterialPressure(Math.round(ARTERIAL_FRAMES / 2));
  const spent = arterialPressure(0);
  assert.equal(fresh.reserve, 1);
  assert.equal(fresh.pressure, 1);
  assert.ok(mid.pressure > 0 && mid.pressure < fresh.pressure);
  assert.equal(spent.pressure, 0);
  assert.equal(spent.strength, 0);
  assert.equal(spent.peak, false);
});

test("arterial pulse rises to systolic peaks and returns near zero between them", () => {
  let peaks = 0;
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let frame = ARTERIAL_FRAMES; frame >= 0; frame -= 1) {
    const { pulse, peak } = arterialPressure(frame);
    minimum = Math.min(minimum, pulse);
    maximum = Math.max(maximum, pulse);
    if (peak) peaks += 1;
  }
  assert.ok(maximum > 0.95, `pulse must reach systole, saw ${maximum}`);
  assert.ok(minimum < 0.05, `pulse must fall to diastole, saw ${minimum}`);
  assert.ok(peaks >= 4, `a ~5s window must carry several heartbeats, saw ${peaks} peak frames`);
});

test("arterial pressure is deterministic and clamps out-of-range inputs", () => {
  assert.deepEqual(arterialPressure(120), arterialPressure(120));
  assert.equal(arterialPressure(-50).pressure, 0);
  assert.equal(arterialPressure(ARTERIAL_FRAMES * 4).pressure, 1);
  assert.equal(arterialPressure(Number.NaN).pressure, 0);
});

test("blood soak darkens monotonically from fresh to matte", () => {
  assert.equal(bloodSoak(0), 0);
  assert.ok(bloodSoak(1) > 0.2);
  assert.ok(bloodSoak(4) > bloodSoak(1));
  assert.ok(bloodSoak(60) <= 1);
  assert.equal(bloodSoak(-3), 0);
});

test("stain budgets classify decals and respect the historical 56 cap", () => {
  assert.equal(GORE_BUDGETS.floorStains + GORE_BUDGETS.wallStains, 56);
  const effects = [
    { kind: "bloodDecal", stain: true },
    { kind: "bloodDecal", stain: true, wall: 1 },
    { kind: "bloodDecal", smear: true },
    { kind: "bloodDecal" },
    { kind: "fatalityPool" },
  ];
  const budget = stainBudget(effects);
  assert.deepEqual(budget, { floor: 1, wall: 1, smears: 1, stains: 2 });
  assert.equal(canSpawnFloorStain(budget), true);
  assert.equal(canSpawnWallStain(budget), true);
  assert.equal(canSpawnSmear(budget), true);
});

test("stain budgets refuse spawns at their caps", () => {
  const floorFull = { floor: GORE_BUDGETS.floorStains, wall: 0, smears: 0, stains: GORE_BUDGETS.floorStains };
  assert.equal(canSpawnFloorStain(floorFull), false);
  assert.equal(canSpawnWallStain(floorFull), true);
  const wallFull = { floor: 0, wall: GORE_BUDGETS.wallStains, smears: 0, stains: GORE_BUDGETS.wallStains };
  assert.equal(canSpawnWallStain(wallFull), false);
  const total = GORE_BUDGETS.floorStains + GORE_BUDGETS.wallStains;
  const everythingFull = { floor: total, wall: 0, smears: 0, stains: total };
  assert.equal(canSpawnWallStain(everythingFull), false);
  assert.equal(canSpawnSmear({ floor: 0, wall: 0, smears: GORE_BUDGETS.smears, stains: 0 }), false);
});

test("collapse envelope holds a beat of stillness then slumps and stills", () => {
  const atImpact = collapseEnvelope(0, 100);
  assert.equal(atImpact.slump, 0);
  const inHold = collapseEnvelope(0.4, 100);
  assert.equal(inHold.slump, 0);
  const midSlump = collapseEnvelope(0.95, 100);
  assert.ok(midSlump.slump > 0 && midSlump.slump < 1);
  const settled = collapseEnvelope(2.0, 100);
  assert.equal(settled.slump, 1);
  const still = collapseEnvelope(3.0, 100);
  assert.equal(still.twitch, 0);
  assert.equal(still.still, true);
});

test("twitch decays: late spasms are weaker than early ones", () => {
  const amplitude = (aftermath) => {
    let peak = 0;
    for (let tick = 0; tick < 240; tick += 1) {
      peak = Math.max(peak, Math.abs(collapseEnvelope(aftermath, tick).twitch));
    }
    return peak;
  };
  const early = amplitude(0.2);
  const late = amplitude(1.9);
  assert.ok(early > 0, "a fresh kill must twitch");
  assert.ok(late < early * 0.5, `twitch must decay hard (${late} vs ${early})`);
  assert.equal(amplitude(2.5), 0, "the body must reach true stillness");
});

test("every fatality script id has a bespoke signature gore beat", () => {
  const scriptIds = Object.keys(GRAPHIC_FATALITIES);
  assert.ok(scriptIds.length >= 10);
  const audit = auditSignatureGore(scriptIds);
  assert.deepEqual(audit.errors, []);
  assert.equal(audit.fighters, scriptIds.length);
  const beats = new Set(scriptIds.map((id) => SIGNATURE_GORE[id].beat));
  assert.equal(beats.size, scriptIds.length, "signature beats must be distinct per fighter");
});

test("signatureGore falls back to the deathblow beat for unknown ids", () => {
  assert.equal(signatureGore("nobody"), SIGNATURE_GORE.deathblow);
  assert.equal(signatureGore("benny").arcs, true);
});

test("scattered pieces obey gravity: fly, bounce, and settle on the ground plane", () => {
  const restY = 210;
  const launch = scatterBandOffset(135, -205, restY, 0);
  assert.equal(launch.x, 0);
  assert.equal(launch.y, 0);
  assert.equal(launch.landed, false);
  // early flight: the piece is airborne ABOVE its rest line and moving out
  const early = scatterBandOffset(135, -205, restY, 0.3);
  assert.ok(early.y < restY, `piece must still be airborne at 0.3s, y=${early.y}`);
  assert.ok(early.x > 0, "piece must fly out along its burst direction");
  assert.ok(early.progress > 0 && early.progress < 1);
  // settled: by 2.5s every piece rests exactly on its ground line
  const settled = scatterBandOffset(135, -205, restY, 2.5);
  assert.equal(settled.landed, true);
  assert.equal(settled.y, restY);
  // and it STAYS there — no drift, no hover (deterministic rest pose)
  const later = scatterBandOffset(135, -205, restY, 6);
  assert.equal(later.x, settled.x);
  assert.equal(later.y, restY);
  assert.equal(later.landed, true);
  // a bottom band (restY 0) settles almost immediately
  const bottom = scatterBandOffset(64, 34, 0, 0.6);
  assert.equal(bottom.landed, true);
  assert.equal(bottom.y, 0);
  // determinism: identical inputs, identical outputs
  assert.deepEqual(scatterBandOffset(38, -42, 134, 0.5), scatterBandOffset(38, -42, 134, 0.5));
});

test("no scattered piece hangs mid-air: everything lands within ~1.6s", () => {
  const bands = [
    [-74 * 1.5, -92 * 1.5, 0.72 * 280], // rupture head, max separation force
    [135 * 1.5, -205 * 1.5, 0.75 * 280], // launch head
    [45, 10, 0.32 * 280], // crush mid
    [0, 22, 0], // grounded body band
  ];
  for (const [burstX, burstY, restY] of bands) {
    const state = scatterBandOffset(burstX, burstY, restY, 1.65);
    assert.equal(state.landed, true, `piece (${burstX},${burstY}) must settle by 1.65s`);
  }
});

test("bloodTint clamps candy palettes into the arterial red family", () => {
  // hot pink / magenta accents crush their green+blue toward arterial ratios
  for (const candy of ["#ff144f", "#ff2364", "#ff174f", "#ff1245"]) {
    const clamped = bloodTint(candy);
    const value = parseInt(clamped.slice(1), 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    assert.equal(red, parseInt(candy.slice(1, 3), 16), "red channel carries the fighter's brightness");
    assert.ok(green <= Math.round(red * 0.18), `${candy} -> ${clamped} green must sit at arterial ratio`);
    assert.ok(blue <= Math.round(red * 0.14), `${candy} -> ${clamped} blue must sit at arterial ratio`);
  }
  // true arterial reds pass through untouched
  assert.equal(bloodTint("#d1081c"), "#d1081c");
  assert.equal(bloodTint("#65000d"), "#65000d");
  // junk input falls back to a safe arterial red
  assert.equal(bloodTint(""), "#b40714");
  assert.equal(bloodTint(null), "#b40714");
  assert.equal(bloodTint("#zzz"), "#b40714");
});

test("gore SFX manifest names distinct files with sane volumes and rate caps", () => {
  const kinds = Object.keys(GORE_SFX);
  assert.equal(kinds.length, 5);
  const files = new Set();
  for (const [kind, meta] of Object.entries(GORE_SFX)) {
    assert.match(kind, /^gore-/, "gore SFX kinds must be namespaced");
    assert.match(meta.file, /\.mp3$/);
    files.add(meta.file);
    assert.ok(meta.volume > 0 && meta.volume <= 1, `${kind} volume ${meta.volume}`);
    assert.ok(meta.minMs >= 300, `${kind} must rate-cap at >=300ms`);
  }
  assert.equal(files.size, kinds.length, "gore SFX files must be distinct");
});
