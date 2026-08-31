// ---------------------------------------------------------------------------
// 2.8 FATALITY REALISM — pure gore math + data tables shared by game.js and
// the node tests. Everything here is presentation support: no gameplay reads,
// no RNG, no DOM. game.js feeds these functions already-snapshotted sim
// numbers (finisher.arterialFrames, effect ages) and spends the results in
// the checksum-exempt particle/effect arrays.
// ---------------------------------------------------------------------------

// Hard particle/decal budgets for the 2.8 gore systems. The browser smoke
// asserts the stain layer never exceeds 56 total, so the floor and wall
// budgets deliberately sum to exactly that historical cap.
export const GORE_BUDGETS = Object.freeze({
  floorStains: 36,
  wallStains: 20,
  smears: 14,
  mist: 36,
});

// The arterial window in sim ticks (~5.3s: strong spurts collapsing into a
// weak dribble well before the cinematic hold ends, so the aftermath reads
// as a body running out, not a fountain on a timer).
export const ARTERIAL_FRAMES = 320;

/**
 * Pressure-based arterial model. The wound pumps on a heartbeat whose rate
 * slows and whose peak pressure decays as the supply drains — early spurts
 * are fast, tall and regular; late ones are weak, slow dribbles.
 *
 * framesLeft counts down from totalFrames (finisher.arterialFrames).
 * Returns plain numbers only — deterministic for identical inputs, so
 * rollback resimulation reproduces the same envelope exactly.
 */
export function arterialPressure(framesLeft, totalFrames = ARTERIAL_FRAMES) {
  const total = Math.max(1, totalFrames);
  const left = Math.min(Math.max(Number(framesLeft) || 0, 0), total);
  const reserve = left / total; // 1 = fresh wound, 0 = bled out
  const elapsed = total - left;
  // The heart slows as pressure drops: beat period stretches ~46 -> ~80 ticks.
  const period = 46 + (1 - reserve) * 34;
  const phase = (elapsed % period) / period;
  // Sharp systolic rise with a long diastolic tail.
  const pulse = Math.pow(Math.max(0, Math.sin(phase * Math.PI)), 1.6);
  const pressure = reserve * reserve; // supply drains quadratically
  return {
    reserve,
    pressure,
    pulse,
    // Spurt velocity scale: even at diastole a live wound seeps a little.
    strength: pressure * (0.35 + 0.65 * pulse),
    peak: pulse > 0.9 && pressure > 0.04,
  };
}

/**
 * Pool soak: 0 = fresh (bright, glossy) -> 1 = old (dark, matte, soaked in).
 * Pure age curve in seconds; the draw pass mixes palette colours with it.
 */
export function bloodSoak(ageSeconds) {
  const age = Math.max(0, Number(ageSeconds) || 0);
  return Math.min(1, 1 - Math.exp(-age / 3.1));
}

/**
 * Decal budget walk: one pass over the effect array, counted by class so the
 * spawn sites can respect GORE_BUDGETS without re-filtering per spawn.
 */
export function stainBudget(effects) {
  let floor = 0;
  let wall = 0;
  let smears = 0;
  for (const effect of effects) {
    if (effect.kind !== "bloodDecal") continue;
    if (effect.smear) smears += 1;
    else if (effect.stain) {
      if (effect.wall) wall += 1;
      else floor += 1;
    }
  }
  return { floor, wall, smears, stains: floor + wall };
}

export function canSpawnFloorStain(budget) {
  return budget.floor < GORE_BUDGETS.floorStains
    && budget.stains < GORE_BUDGETS.floorStains + GORE_BUDGETS.wallStains;
}

export function canSpawnWallStain(budget) {
  return budget.wall < GORE_BUDGETS.wallStains
    && budget.stains < GORE_BUDGETS.floorStains + GORE_BUDGETS.wallStains;
}

export function canSpawnSmear(budget) {
  return budget.smears < GORE_BUDGETS.smears;
}

// ---------------------------------------------------------------------------
// 2.8 gore SFX manifest: generated ElevenLabs layers under
// assets/audio/fatality/, played through the ordinary sound() pool machinery
// via the rate-capped goreSfx() wrapper (graphicFatalities-gated there).
// ---------------------------------------------------------------------------
export const GORE_SFX = Object.freeze({
  "gore-arterial": Object.freeze({ file: "arterial-spurt.mp3", volume: 0.42, minMs: 640 }),
  "gore-squelch": Object.freeze({ file: "wet-squelch.mp3", volume: 0.68, minMs: 420 }),
  "gore-bone": Object.freeze({ file: "bone-crack.mp3", volume: 0.74, minMs: 500 }),
  "gore-body-drop": Object.freeze({ file: "body-drop.mp3", volume: 0.7, minMs: 1600 }),
  "gore-drip": Object.freeze({ file: "blood-drip.mp3", volume: 0.34, minMs: 1900 }),
});

// ---------------------------------------------------------------------------
// Per-fighter signature gore beats. Keyed by finisher script id (the same key
// GRAPHIC_FATALITIES uses); every entry names one bespoke presentation beat
// that fits the fighter's kit, consumed by spawnSignatureGoreBeat() at the
// killing blow plus a light per-pump aftermath emitter. Purely data — the
// booleans/scales select presentation code paths in game.js.
// ---------------------------------------------------------------------------
export const SIGNATURE_GORE = Object.freeze({
  // Seismic gauntlets: the slam answers in the ground — a low blood shock
  // ring and a heavier bone-chip fountain out of the crush point.
  deathblow: Object.freeze({ beat: "gauntlet-quake", slamRing: true, boneScale: 1.7, mistScale: 1.35 }),
  // Neon cable slice: the cut edges flash hot and cool like a sign tube —
  // cyan embers spit off the wound while it is fresh.
  jez: Object.freeze({ beat: "neon-cauter", emberColor: "#7df9ff", emberRate: 0.5 }),
  // Concrete-grade crush: pressure gush — thicker, slower gouts and a wider,
  // faster-soaking pool.
  alan: Object.freeze({ beat: "pressure-gush", gushScale: 1.45, dropletScale: 1.4 }),
  // Paint kit: the blood marbles with spray colour — every third droplet
  // carries the attacker's accent before it lands dark.
  post: Object.freeze({ beat: "paint-marbling", marbling: true }),
  // Voltage kit: feedback overload — arc lines snap off the wound on each
  // heartbeat peak and the blood boils off as steam wisps.
  benny: Object.freeze({ beat: "feedback-arc", arcs: true, arcColor: "#b4e6ff", steam: true }),
  // Gilded kit: gold flecks glint inside the spray.
  donald: Object.freeze({ beat: "gilded-flecks", fleckColor: "#ffd76b", fleckRate: 0.4 }),
  // Glitch kit: the gore itself drops frames — quantised debris bits in
  // signal green tumble out with the fragments.
  cyraxx: Object.freeze({ beat: "signal-tear", glitchBits: true, glitchColor: "#8cff6b" }),
  // Bass kit: the pool answers the heartbeat — a low ripple ring rolls
  // across the blood on each pump peak.
  ali: Object.freeze({ beat: "bass-ripple", poolRipples: true }),
  // Curse kit: withering — black ash motes rise off the wound and the cut
  // edges scorch dark instead of running bright.
  devil: Object.freeze({ beat: "curse-wither", ash: true, ashColor: "#171019", scorch: true }),
  // Contract kit: the verdict lands twice — a precise, tight seal-burst of
  // deep red and a second delayed bone report.
  commissioner: Object.freeze({ beat: "ledger-verdict", verdict: true, boneScale: 1.35 }),
});

export function signatureGore(scriptId) {
  return SIGNATURE_GORE[scriptId] || SIGNATURE_GORE.deathblow;
}

/**
 * Collapse weight envelope: a beat of stillness after the killing blow, then
 * the joints unload into an eased slump; twitch spasms decay quadratically to
 * true stillness. Pure function of the aftermath clock + sim tick so rollback
 * resimulation replays it exactly.
 * Returns { slump: 0..1, twitch: -1..1 } — the caller scales into radians.
 */
export function collapseEnvelope(aftermathSeconds, simulationTick) {
  const aftermath = Math.max(0, Number(aftermathSeconds) || 0);
  const hold = 0.5; // the stillness beat before the body lets go
  const slumpLinear = Math.min(1, Math.max(0, (aftermath - hold) / 0.85));
  const slump = slumpLinear * slumpLinear * (3 - 2 * slumpLinear);
  const fade = Math.max(0, 1 - aftermath / 2.4);
  let twitch = 0;
  if (fade > 0) {
    // Spasms arrive in bursts that space out as the body stills: the slow
    // gate's frequency itself decays with the fade.
    const gate = Math.max(0, Math.sin(simulationTick * (0.055 + 0.055 * fade)));
    twitch = Math.sin(simulationTick * 1.7) * gate * fade * fade;
  }
  return { slump, twitch, still: fade <= 0 };
}

/**
 * Ballistic scatter for separated victim pieces (2.8 critic round, M6). The
 * authored hover offsets become a burst velocity; the piece flies under
 * gravity, takes one damped floor bounce, and settles on the ground plane.
 * Pure closed-form function of the aftermath clock — deterministic, no RNG,
 * so rollback resimulation and the mirror pass replay it exactly.
 *
 * burstX/burstY: authored scatter offsets in px (y negative = up).
 * restY: the ground line in piece-local px below the spawn point (>= 0).
 * Returns { x, y, progress: 0..1 flight easing, landed }.
 */
export function scatterBandOffset(burstX, burstY, restY, seconds, options = {}) {
  const gravity = options.gravity ?? 1500;
  const restitution = options.restitution ?? 0.32;
  const launch = options.launch ?? 1.6;
  const time = Math.max(0, Number(seconds) || 0);
  const floor = Math.max(0, Number(restY) || 0);
  const vx = (Number(burstX) || 0) * launch * 0.8;
  // Up-biased pop so even a low authored offset visibly leaves the body
  // before gravity takes the piece.
  const vy = (Number(burstY) || 0) * launch * 1.15 - 120;
  const disc = Math.sqrt(Math.max(0, vy * vy + 2 * gravity * floor));
  const flight = Math.max(0.001, (disc - vy) / gravity);
  if (time <= flight) {
    return {
      x: vx * time,
      y: vy * time + 0.5 * gravity * time * time,
      progress: Math.min(1, time / flight),
      landed: false,
    };
  }
  const impact = vy + gravity * flight;
  const rebound = Math.max(0, impact) * restitution;
  const bounceTime = (2 * rebound) / gravity;
  const vxb = vx * 0.55;
  const tau = Math.min(time - flight, bounceTime);
  const landed = time - flight >= bounceTime;
  return {
    x: vx * flight + vxb * tau,
    y: landed ? floor : floor - (rebound * tau - 0.5 * gravity * tau * tau),
    progress: 1,
    landed,
  };
}

/**
 * Clamp any palette colour into the arterial red family (2.8 critic round,
 * S1): fighter-flavoured fatality palettes lean hot pink/magenta on some
 * kits, which reads as candy once it colours BLOOD. Keeps the red channel
 * (per-fighter brightness survives), crushes green/blue below arterial
 * ratios. Signature EMITTERS (embers, arcs, glitch bits) never route through
 * this — only blood-classed spawns and draws do.
 */
export function bloodTint(hex) {
  const raw = typeof hex === "string" ? hex.replace("#", "") : "";
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return "#b40714";
  const value = parseInt(raw, 16);
  const r = (value >> 16) & 255;
  const g = Math.min((value >> 8) & 255, Math.round(r * 0.18));
  const b = Math.min(value & 255, Math.round(r * 0.14));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function auditSignatureGore(scriptIds) {
  const errors = [];
  for (const scriptId of scriptIds) {
    const entry = SIGNATURE_GORE[scriptId];
    if (!entry) {
      errors.push(`${scriptId}:missing-signature-gore`);
      continue;
    }
    if (!entry.beat) errors.push(`${scriptId}:missing-beat-name`);
  }
  return { fighters: scriptIds.length, errors };
}
