import { FIGHTER_KITS, getKitMoveProfile } from "./fighter-kits.mjs";
import { FIGHTER_THROWABLES } from "./throwables.mjs";
import { STAGE_WEAPONS } from "./stage-weapons.mjs";

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

export const TOURNAMENT_NORMAL_ROLES = Object.freeze({
  standLP: Object.freeze(["light", Object.freeze({})]),
  standHP: Object.freeze(["heavy", Object.freeze({})]),
  standLK: Object.freeze(["light", Object.freeze({ limb: "kick" })]),
  standHK: Object.freeze(["heavy", Object.freeze({ limb: "kick" })]),
  crouchLP: Object.freeze(["light", Object.freeze({ crouching: true })]),
  crouchHP: Object.freeze(["heavy", Object.freeze({ crouching: true })]),
  crouchLK: Object.freeze(["light", Object.freeze({ crouching: true, limb: "kick" })]),
  sweep: Object.freeze(["heavy", Object.freeze({ crouching: true, limb: "kick" })]),
  jumpLP: Object.freeze(["light", Object.freeze({ airborne: true })]),
  jumpHP: Object.freeze(["heavy", Object.freeze({ airborne: true })]),
  jumpLK: Object.freeze(["light", Object.freeze({ airborne: true, limb: "kick" })]),
  jumpHK: Object.freeze(["heavy", Object.freeze({ airborne: true, limb: "kick" })]),
  poke: Object.freeze(["light", Object.freeze({ forwardHeld: true })]),
  overhead: Object.freeze(["heavy", Object.freeze({ forwardHeld: true })]),
  antiAir: Object.freeze(["launcher", Object.freeze({})]),
});

function moveExtent(move) {
  return (move?.hitboxes || []).reduce(
    (maximum, entry) => Math.max(maximum, (entry.box?.x || 0) + (entry.box?.width || 0)),
    0,
  );
}

export function auditTournamentNormals(fighterIds = Object.keys(FIGHTER_KITS)) {
  const violations = [];
  const fighters = fighterIds.map((fighterId) => {
    const roles = {};
    for (const [role, [action, context]] of Object.entries(TOURNAMENT_NORMAL_ROLES)) {
      const move = getKitMoveProfile(fighterId, action, context);
      if (!move) {
        violations.push(`${fighterId}:${role}:missing`);
        continue;
      }
      const activeFrames = Number(move.activeFrames) || 0;
      const extent = moveExtent(move);
      const ratio = move.range > 0 ? extent / move.range : 0;
      if (!(move.startupFrames >= 3 && move.startupFrames <= 24)) violations.push(`${fighterId}:${role}:startup=${move.startupFrames}`);
      if (!(activeFrames >= 2 && activeFrames <= 16)) violations.push(`${fighterId}:${role}:active=${activeFrames}`);
      if (!(move.recoveryFrames >= 4 && move.recoveryFrames <= 30)) violations.push(`${fighterId}:${role}:recovery=${move.recoveryFrames}`);
      if (!(move.damage > 0)) violations.push(`${fighterId}:${role}:damage=${move.damage}`);
      if (!(move.range >= 80 && move.range <= 320)) violations.push(`${fighterId}:${role}:range=${move.range}`);
      if (!(ratio >= 0.72 && ratio <= 1.5)) violations.push(`${fighterId}:${role}:hitbox-ratio=${ratio.toFixed(3)}`);
      for (const [index, entry] of (move.hitboxes || []).entries()) {
        if (!entry.box || entry.box.width <= 0 || entry.box.height <= 0) violations.push(`${fighterId}:${role}:box-${index}:size`);
        if (entry.from < 0 || entry.to < entry.from || entry.to >= activeFrames) violations.push(`${fighterId}:${role}:box-${index}:frames`);
      }
      roles[role] = {
        id: move.id,
        startup: move.startupFrames,
        active: activeFrames,
        recovery: move.recoveryFrames,
        range: move.range,
        extent,
        hitboxes: move.hitboxes?.length || 0,
      };
    }
    return { fighterId, roles };
  });
  return { fighters, rolesPerFighter: Object.keys(TOURNAMENT_NORMAL_ROLES).length, violations };
}

export function enumerateTournamentMatchups(fighterIds = Object.keys(FIGHTER_KITS)) {
  const matchups = [];
  for (let first = 0; first < fighterIds.length; first += 1) {
    for (let second = first + 1; second < fighterIds.length; second += 1) {
      matchups.push(Object.freeze([fighterIds[first], fighterIds[second]]));
    }
  }
  return matchups;
}

export function auditTournamentItems({
  throwables = FIGHTER_THROWABLES,
  stageWeapons = STAGE_WEAPONS,
} = {}) {
  const violations = [];
  for (const [fighterId, item] of Object.entries(throwables)) {
    if (!(item.usesPerRound >= 1 && item.usesPerRound <= 4)) violations.push(`${fighterId}:uses=${item.usesPerRound}`);
    if (!(item.damage >= 5 && item.damage <= 12)) violations.push(`${fighterId}:damage=${item.damage}`);
    if (!(item.chipDamage >= 0 && item.chipDamage <= 3)) violations.push(`${fighterId}:chip=${item.chipDamage}`);
    if (!(item.recoveryFrames >= 18)) violations.push(`${fighterId}:recovery=${item.recoveryFrames}`);
    if (!(item.hitstunFrames <= 30)) violations.push(`${fighterId}:hitstun=${item.hitstunFrames}`);
    if (item.maxActive !== 1) violations.push(`${fighterId}:max-active=${item.maxActive}`);
    if (item.hazardFrames > 0 && item.hazardArmFrames < 15) violations.push(`${fighterId}:hazard-arm=${item.hazardArmFrames}`);
  }
  for (const [stageId, item] of Object.entries(stageWeapons)) {
    if (!(item.damage >= 5 && item.damage <= 14)) violations.push(`${stageId}:weapon-damage=${item.damage}`);
    if (!(item.chipDamage >= 0 && item.chipDamage <= 2)) violations.push(`${stageId}:weapon-chip=${item.chipDamage}`);
    if (!(item.throwRecoveryFrames >= 22)) violations.push(`${stageId}:weapon-recovery=${item.throwRecoveryFrames}`);
    if (!(item.hitstunFrames <= 24)) violations.push(`${stageId}:weapon-hitstun=${item.hitstunFrames}`);
  }
  return {
    personalObjects: Object.keys(throwables).length,
    stageWeapons: Object.keys(stageWeapons).length,
    violations,
  };
}

export function auditTournamentSpecialControl(fighterIds = Object.keys(FIGHTER_KITS)) {
  const violations = [];
  let projectiles = 0;
  let traps = 0;
  for (const fighterId of fighterIds) {
    const kit = FIGHTER_KITS[fighterId];
    for (const move of Object.values(kit?.moves || {})) {
      if (move.projectile) {
        projectiles += 1;
        const projectile = move.projectile;
        if ((projectile.maxOwned ?? 2) > 2) violations.push(`${fighterId}:${move.id}:projectile-max-owned`);
        if (projectile.damage > 16 || projectile.chipDamage > 4) violations.push(`${fighterId}:${move.id}:projectile-damage`);
        if ((projectile.spawnFrames?.length || 1) > 2) violations.push(`${fighterId}:${move.id}:projectile-count`);
      }
      if (move.trap) {
        traps += 1;
        const trapProfile = move.trap;
        if ((trapProfile.maxOwned ?? Infinity) > 2) violations.push(`${fighterId}:${move.id}:trap-max-owned`);
        if (trapProfile.armFrames < 15) violations.push(`${fighterId}:${move.id}:trap-telegraph`);
        if (trapProfile.lifetimeFrames > 360) violations.push(`${fighterId}:${move.id}:trap-life`);
        if (trapProfile.damage > 9 || trapProfile.chipDamage > 2) violations.push(`${fighterId}:${move.id}:trap-damage`);
        if (trapProfile.knockdown) violations.push(`${fighterId}:${move.id}:trap-knockdown-loop`);
      }
    }
  }
  return { projectiles, traps, violations };
}

export function auditTournamentIdentities(fighterIds = Object.keys(FIGHTER_KITS)) {
  const violations = [];
  const archetypes = new Set();
  const movementSignatures = new Set();
  const fighters = fighterIds.map((fighterId) => {
    const kit = FIGHTER_KITS[fighterId];
    if (!kit?.archetype) violations.push(`${fighterId}:missing-archetype`);
    if (archetypes.has(kit?.archetype)) violations.push(`${fighterId}:duplicate-archetype`);
    archetypes.add(kit?.archetype);
    const movement = kit?.movement || {};
    const signature = [movement.forwardWalkSpeed, movement.backWalkSpeed, movement.forwardDashSpeed, movement.backDashSpeed].join(":");
    if (movementSignatures.has(signature)) violations.push(`${fighterId}:duplicate-movement`);
    movementSignatures.add(signature);
    const moves = Object.values(kit?.moves || {});
    const damaging = moves.filter((move) => move.damage > 0);
    const averageDamage = damaging.reduce((total, move) => total + move.damage, 0) / Math.max(1, damaging.length);
    const averageStartup = moves.reduce((total, move) => total + (move.startupFrames || 0), 0) / Math.max(1, moves.length);
    return {
      fighterId,
      archetype: kit?.archetype || "",
      forwardWalkSpeed: movement.forwardWalkSpeed,
      backWalkSpeed: movement.backWalkSpeed,
      averageDamage: Number(averageDamage.toFixed(2)),
      averageStartup: Number(averageStartup.toFixed(2)),
    };
  });
  return { fighters, violations };
}

export function auditTournamentBalance(fighterIds = Object.keys(FIGHTER_KITS)) {
  const normals = auditTournamentNormals(fighterIds);
  const items = auditTournamentItems();
  const specialControl = auditTournamentSpecialControl(fighterIds);
  const identities = auditTournamentIdentities(fighterIds);
  const matchups = enumerateTournamentMatchups(fighterIds);
  return {
    version: "1.3",
    fighters: fighterIds.length,
    matchups,
    matchupCount: matchups.length,
    normals,
    items,
    specialControl,
    identities,
    violations: [
      ...normals.violations,
      ...items.violations,
      ...specialControl.violations,
      ...identities.violations,
    ],
  };
}
