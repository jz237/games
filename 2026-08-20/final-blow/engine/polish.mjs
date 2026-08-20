export const VISUAL_QUALITY_OPTIONS = Object.freeze(["auto", "high", "balanced", "battery"]);

export const PERFORMANCE_PROFILES = Object.freeze({
  high: Object.freeze({ id: "high", particleScale: 1, particleBudget: 420, effectBudget: 220, trailScale: 1, shadows: true }),
  balanced: Object.freeze({ id: "balanced", particleScale: 0.68, particleBudget: 240, effectBudget: 140, trailScale: 0.67, shadows: true }),
  battery: Object.freeze({ id: "battery", particleScale: 0.42, particleBudget: 120, effectBudget: 80, trailScale: 0, shadows: false }),
});

export const BALANCE_GUARDRAILS = Object.freeze({
  startupFrames: Object.freeze([1, 32]),
  activeFrames: Object.freeze([1, 60]),
  recoveryFrames: Object.freeze([4, 42]),
  damage: Object.freeze([0, 28]),
  chipDamage: Object.freeze([0, 5]),
  forwardWalkSpeed: Object.freeze([210, 370]),
  backWalkSpeed: Object.freeze([160, 315]),
  forwardDashSpeed: Object.freeze([460, 760]),
  backDashInvulnerableFrames: Object.freeze([3, 9]),
});

export function normalizeVisualQuality(value) {
  return VISUAL_QUALITY_OPTIONS.includes(value) ? value : "auto";
}

export function resolvePerformanceProfile(quality = "auto", environment = {}) {
  const normalized = normalizeVisualQuality(quality);
  if (normalized !== "auto") return PERFORMANCE_PROFILES[normalized];
  if (environment.reducedMotion || environment.saveData) return PERFORMANCE_PROFILES.battery;
  const hardwareConcurrency = Number(environment.hardwareConcurrency) || 8;
  const deviceMemory = Number(environment.deviceMemory) || 8;
  if (environment.coarsePointer || environment.mobile || hardwareConcurrency <= 4 || deviceMemory <= 4) {
    return PERFORMANCE_PROFILES.balanced;
  }
  return PERFORMANCE_PROFILES.high;
}

function outside(value, [minimum, maximum]) {
  return !Number.isFinite(value) || value < minimum || value > maximum;
}

export function auditFighterBalance(fighters = []) {
  const violations = [];
  const reports = fighters.map((fighter) => {
    const moves = Object.values(fighter.moves || {});
    for (const move of moves) {
      for (const field of ["startupFrames", "activeFrames", "recoveryFrames", "damage", "chipDamage"]) {
        if (outside(move[field] ?? 0, BALANCE_GUARDRAILS[field])) {
          violations.push(`${fighter.id}:${move.id || "move"}:${field}=${move[field]}`);
        }
      }
    }
    for (const field of ["forwardWalkSpeed", "backWalkSpeed", "forwardDashSpeed", "backDashInvulnerableFrames"]) {
      if (outside(fighter.movement?.[field], BALANCE_GUARDRAILS[field])) {
        violations.push(`${fighter.id}:movement:${field}=${fighter.movement?.[field]}`);
      }
    }
    const damaging = moves.filter((move) => Number(move.damage) > 0);
    const averageDamage = damaging.length
      ? damaging.reduce((total, move) => total + move.damage, 0) / damaging.length
      : 0;
    const averageStartup = moves.length
      ? moves.reduce((total, move) => total + move.startupFrames, 0) / moves.length
      : 0;
    return {
      id: fighter.id,
      moves: moves.length,
      averageDamage: Number(averageDamage.toFixed(2)),
      averageStartup: Number(averageStartup.toFixed(2)),
    };
  });
  return { version: "1.0", fighters: reports, violations };
}

export function trimVisualBudget(items, maximum) {
  if (!Array.isArray(items) || items.length <= maximum) return items;
  return items.slice(items.length - maximum);
}
