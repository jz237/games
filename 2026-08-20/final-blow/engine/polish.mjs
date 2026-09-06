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
  // Capability decides, not input modality: a flagship phone gets the same
  // presentation as a desktop (1.9E mobile parity). Weak hardware — few
  // cores or little memory, whatever the pointer type — still lands on
  // balanced, and the reduced-motion/data-saver guards above outrank
  // everything. Browsers that hide these fields report undefined and fall
  // to the capable defaults; the explicit quality picker remains the
  // override for devices that misreport.
  if (hardwareConcurrency <= 4 || deviceMemory <= 4) {
    return PERFORMANCE_PROFILES.balanced;
  }
  return PERFORMANCE_PROFILES.high;
}

// ---------------------------------------------------------------------------
// R1.9 wave 15: adaptive runtime performance governor.
// Pure hysteresis state machine — the render loop feeds it real frame times
// and applies whatever tier change it emits. state.performance is render-only
// and never checksummed, so every decision here is rollback-safe by
// construction. The caller is responsible for never feeding it during online
// matches or while the player has forced a fixed profile.
// ---------------------------------------------------------------------------
export const GOVERNOR_TIERS = Object.freeze(["battery", "balanced", "high"]);

export const GOVERNOR_RULES = Object.freeze({
  // A 60Hz frame has 16.7ms; 18ms sustained means the device is genuinely
  // missing vsync, not just jittering.
  budgetMs: 18,
  windowFrames: 120,
  missRatio: 0.5,
  // After any tier change, hold for 6 seconds before another one — the
  // hysteresis that stops a boundary device from ping-ponging.
  cooldownFrames: 360,
  // Recovery is deliberately cautious: ~30 seconds of unbroken headroom
  // before stepping back up.
  recoveryFrames: 1800,
  recoveryBudgetMs: 14,
  // A single enormous frame is a tab switch or a GC stall, not thermal
  // evidence. It resets the recovery streak but never counts as a miss.
  ignoreAboveMs: 120,
});

function governorTier(profileId) {
  const tier = GOVERNOR_TIERS.indexOf(profileId);
  return tier < 0 ? GOVERNOR_TIERS.length - 1 : tier;
}

export function createPerformanceGovernor({ profileId = "high", baselineId = profileId, rules = GOVERNOR_RULES } = {}) {
  return {
    rules,
    // The governor never climbs above the profile static resolution picked —
    // it only sheds load and claws back what it shed.
    baselineTier: governorTier(baselineId),
    tier: Math.min(governorTier(profileId), governorTier(baselineId)),
    windowFrames: 0,
    windowMisses: 0,
    recoveryStreak: 0,
    cooldown: 0,
    steps: 0,
    profile() {
      return GOVERNOR_TIERS[this.tier];
    },
    observe(frameMs) {
      if (!Number.isFinite(frameMs) || frameMs <= 0) return null;
      if (frameMs > this.rules.ignoreAboveMs) {
        this.recoveryStreak = 0;
        return null;
      }
      if (this.cooldown > 0) this.cooldown -= 1;
      // Step-down evidence: a rolling window where at least half the frames
      // blew the budget.
      this.windowFrames += 1;
      if (frameMs > this.rules.budgetMs) this.windowMisses += 1;
      let change = null;
      if (this.windowFrames >= this.rules.windowFrames) {
        const missed = this.windowMisses / this.windowFrames;
        this.windowFrames = 0;
        this.windowMisses = 0;
        if (missed >= this.rules.missRatio && this.tier > 0 && this.cooldown <= 0) {
          const from = this.profile();
          this.tier -= 1;
          this.cooldown = this.rules.cooldownFrames;
          this.recoveryStreak = 0;
          this.steps += 1;
          change = { action: "down", from, to: this.profile() };
        }
      }
      // Step-up evidence: a long unbroken run of clear headroom.
      if (frameMs <= this.rules.recoveryBudgetMs) this.recoveryStreak += 1;
      else this.recoveryStreak = 0;
      if (!change && this.recoveryStreak >= this.rules.recoveryFrames
        && this.tier < this.baselineTier && this.cooldown <= 0) {
        const from = this.profile();
        this.tier += 1;
        this.cooldown = this.rules.cooldownFrames;
        this.recoveryStreak = 0;
        this.steps += 1;
        change = { action: "up", from, to: this.profile() };
      }
      return change;
    },
  };
}

// ---------------------------------------------------------------------------
// 5.x governor memory (sweep #37). The machine used to be rebuilt from the
// static baseline at every fight, so a boundary phone re-lived the same
// 2 s (one 120-frame window) to 8 s (two steps through a 360-frame cooldown)
// of misses and the same COOLING toast at the top of every round 1. These
// helpers remember the landed tier in a storage the game layer hands in
// (localStorage in the browser, any {getItem,setItem,removeItem} in tests),
// keyed by build so a release with a different render cost starts fresh, and
// fenced by a device signature so a shared browser profile on new hardware
// does not inherit an old phone's verdict. Never throws: storage can be
// missing, full or refused (private mode) and the governor simply forgets.
// ---------------------------------------------------------------------------
export const GOVERNOR_MEMORY_KEY_PREFIX = "final-blow-governor-tier:";

export function governorMemoryKey(buildId = "0.0") {
  return `${GOVERNOR_MEMORY_KEY_PREFIX}${buildId}`;
}

export function governorMemorySignature(environment = {}) {
  return [
    environment.userAgent || "",
    environment.hardwareConcurrency ?? "",
    environment.deviceMemory ?? "",
    environment.baselineId || "",
  ].join("|");
}

export function readGovernorMemory(storage, key, signature) {
  try {
    const raw = storage?.getItem?.(key);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record || record.signature !== signature) return null;
    if (!GOVERNOR_TIERS.includes(record.profileId)) return null;
    return { profileId: record.profileId, savedAt: Number(record.savedAt) || 0 };
  } catch {
    return null;
  }
}

export function writeGovernorMemory(storage, key, { signature, profileId, savedAt = Date.now() }) {
  if (!GOVERNOR_TIERS.includes(profileId)) return false;
  try {
    storage?.setItem?.(key, JSON.stringify({ signature, profileId, savedAt }));
    return true;
  } catch {
    return false;
  }
}

export function forgetGovernorMemory(storage, key) {
  try {
    storage?.removeItem?.(key);
  } catch {
    // Nothing to forget, or storage refused — either way the next fight
    // re-baselines from the static resolution, which is the old behaviour.
  }
}

// ---------------------------------------------------------------------------
// R1.9 wave 15: combat-event haptic pattern selection.
// Pure lookup + scaling so the tiers are unit-testable. The game layer owns
// every gate (haptics toggle, rollbackResimulating, rate cap) — this module
// only answers "what does this event feel like".
// vibrate: navigator.vibrate() pattern (pulse/gap milliseconds).
// rumble:  gamepad dual-rumble effect parameters, magnitudes clamped 0..1.
// ---------------------------------------------------------------------------
const HAPTIC_TIERS = Object.freeze({
  press: Object.freeze({ vibrate: Object.freeze([12]), strong: 0, weak: 0.22, duration: 20 }),
  block: Object.freeze({ vibrate: Object.freeze([8]), strong: 0.04, weak: 0.2, duration: 26 }),
  light: Object.freeze({ vibrate: Object.freeze([14]), strong: 0.18, weak: 0.34, duration: 45 }),
  heavy: Object.freeze({ vibrate: Object.freeze([32]), strong: 0.48, weak: 0.5, duration: 90 }),
  special: Object.freeze({ vibrate: Object.freeze([42]), strong: 0.6, weak: 0.55, duration: 110 }),
  weapon: Object.freeze({ vibrate: Object.freeze([46]), strong: 0.64, weak: 0.58, duration: 120 }),
  // Throws and corner wall-splats double-pulse: impact, beat, ground.
  throw: Object.freeze({ vibrate: Object.freeze([30, 45, 38]), strong: 0.58, weak: 0.5, duration: 135 }),
  wallSplat: Object.freeze({ vibrate: Object.freeze([26, 40, 34]), strong: 0.56, weak: 0.48, duration: 120 }),
  super: Object.freeze({ vibrate: Object.freeze([68]), strong: 0.85, weak: 0.7, duration: 160 }),
  // Dizzy flutters — a train of tiny pulses, weak-motor biased.
  dizzy: Object.freeze({ vibrate: Object.freeze([10, 26, 10, 26, 10, 26, 10]), strong: 0.14, weak: 0.4, duration: 150 }),
  ko: Object.freeze({ vibrate: Object.freeze([110, 60, 40]), strong: 1, weak: 0.85, duration: 220 }),
  // One lub-dub of the fatality heartbeat; the game layer fires it on each
  // peak of the existing sin(tick*0.16) arterial pump.
  fatalityHeartbeat: Object.freeze({ vibrate: Object.freeze([26, 96, 44]), strong: 0.9, weak: 0.35, duration: 190 }),
});

export const HAPTIC_KINDS = Object.freeze(Object.keys(HAPTIC_TIERS));

const HAPTIC_LIMITS = Object.freeze({ maxPulseMs: 250, maxDamage: 28 });

// Only strike-class events scale with damage; ceremonies (dizzy/ko/heartbeat)
// are authored as fixed patterns.
const DAMAGE_SCALED_KINDS = Object.freeze(new Set(["light", "heavy", "special", "weapon", "throw", "super"]));

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function hapticPatternFor(kind, { damage = 0, blocked = false, counter = false } = {}) {
  const key = blocked ? "block" : (HAPTIC_TIERS[kind] ? kind : "light");
  const base = HAPTIC_TIERS[key];
  let scale = 1;
  if (!blocked && DAMAGE_SCALED_KINDS.has(key)) {
    const damageRatio = clamp01(Math.max(0, damage) / HAPTIC_LIMITS.maxDamage);
    scale = 1 + damageRatio * 0.6 + (counter ? 0.15 : 0);
  }
  const vibrate = base.vibrate.map((ms, index) => (index % 2 === 0
    ? Math.min(HAPTIC_LIMITS.maxPulseMs, Math.round(ms * scale))
    : ms));
  return {
    kind: key,
    vibrate,
    rumble: {
      duration: Math.min(HAPTIC_LIMITS.maxPulseMs, Math.round(base.duration * scale)),
      startDelay: 0,
      strongMagnitude: clamp01(base.strong * scale),
      weakMagnitude: clamp01(base.weak * scale),
    },
  };
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
