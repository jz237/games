import assert from "node:assert/strict";
import { getFighterKit } from "../engine/fighter-kits.mjs";
import {
  PERFORMANCE_PROFILES,
  auditFighterBalance,
  normalizeVisualQuality,
  resolvePerformanceProfile,
  trimVisualBudget,
} from "../engine/polish.mjs";

const fighterIds = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali"];

assert.equal(normalizeVisualQuality("unknown"), "auto");
assert.equal(resolvePerformanceProfile("high").id, "high");
// 1.9E mobile parity: pointer type no longer downgrades — capability does. A
// capable phone (coarse pointer, strong hardware) earns high; weak hardware
// lands on balanced whatever the pointer; the saver guards outrank both.
assert.equal(resolvePerformanceProfile("auto", { coarsePointer: true, hardwareConcurrency: 8, deviceMemory: 8 }).id, "high");
assert.equal(resolvePerformanceProfile("auto", { coarsePointer: true, hardwareConcurrency: 4, deviceMemory: 4 }).id, "balanced");
assert.equal(resolvePerformanceProfile("auto", { mobile: true, deviceMemory: 2 }).id, "balanced");
assert.equal(resolvePerformanceProfile("auto", { reducedMotion: true }).id, "battery");
assert.equal(resolvePerformanceProfile("auto", { saveData: true, hardwareConcurrency: 12 }).id, "battery");
assert.equal(resolvePerformanceProfile("auto", { hardwareConcurrency: 12, deviceMemory: 16 }).id, "high");
assert.ok(PERFORMANCE_PROFILES.high.particleBudget > PERFORMANCE_PROFILES.balanced.particleBudget);
assert.ok(PERFORMANCE_PROFILES.balanced.particleBudget > PERFORMANCE_PROFILES.battery.particleBudget);

const audit = auditFighterBalance(fighterIds.map((id) => getFighterKit(id)));
assert.equal(audit.version, "1.0");
assert.equal(audit.fighters.length, 8);
assert.deepEqual(audit.violations, []);
assert.ok(audit.fighters.every(({ moves }) => moves === 20));

const visuals = [{ id: 1 }, { id: 2 }, { id: 3 }];
assert.deepEqual(trimVisualBudget(visuals, 2), [{ id: 2 }, { id: 3 }]);
assert.equal(trimVisualBudget(visuals, 4), visuals);

console.log("Final Blow 1.0 polish and balance tests passed");
