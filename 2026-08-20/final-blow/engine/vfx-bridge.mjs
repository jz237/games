// ---------------------------------------------------------------------------
// v5.3 SPECTACLE (#47/#48) — the effect math BOTH renderers read.
//
// The 2D canvas has always drawn four effect families the 3D world silently
// dropped: the elemental flipbooks (assets/vfx, ~190 sprites integrated every
// frame whether or not anything draws them), the charging limb glow, the dash
// afterimages, and the 25-kind particle pool. Every one of them was simulated
// while CINEMA 3D was on and then thrown away, which is the exact opposite of
// a visible upgrade — a curse special in 3D was a re-tinted spark burst.
//
// The sprites themselves stay where they are (the 2D pass draws them with
// canvas, the 3D pass with instanced quads and the ember points), but the
// FRAME PICK, the fade curve, the per-kind routing and the ghost's opacity
// ladder live here so the two passes cannot drift: a flicker sheet forks on
// the same tick in both, and a dash ghost is the same wash in both.
//
// Pure: no canvas, no three, no sim state. Unit-tested in tests/vfx-bridge.
// ---------------------------------------------------------------------------

/**
 * Which cell of a 4x4 element sheet a live sprite shows.
 *   anim     — plays 0..15 across its life (a flame burns down)
 *   flicker  — re-forks EVERY sim tick off the sprite's seed (live
 *              electricity; ticks keep advancing through hitstop, so a held
 *              impact never shows the same fork twice)
 *   scatter  — the cell picked at spawn, held for life (debris, cash)
 * `frames` may be shorter than 16 on a hand-trimmed sheet, hence the clamp.
 */
export function elementFrameIndex(meta, particle, tick) {
  const count = meta?.frames?.length || 16;
  if (meta?.mode === "anim") {
    const fade = clamp01(particle.life / particle.max);
    return Math.min(count - 1, Math.max(0, Math.floor((1 - fade) * count)));
  }
  if (meta?.mode === "flicker") {
    return (((particle.seed || 0) * 31 + tick * 7) % 16 + 16) % 16 % count;
  }
  return Math.min(count - 1, Math.max(0, particle.frame | 0));
}

/**
 * The sprite's drawn alpha. Front-loaded on purpose: sprites hold near-full
 * presence through most of their life and drop off at the end, instead of
 * thinning from the first frame (additive sheets ramp linearly x1.35,
 * alpha-blended ones on a sqrt so smoke keeps its body).
 */
export function elementSpriteAlpha(particle) {
  const fade = clamp01(particle.life / particle.max);
  const curve = particle.additive ? Math.min(1, fade * 1.35) : Math.min(1, Math.sqrt(fade) * 1.08);
  return curve * (particle.alpha ?? 1);
}

/** The charging limb glow's radius in sim px (2D: 40 + tier*16, pulsed). */
export function chargeGlowRadius(level, tier, tick, side) {
  const pulse = 1 + Math.sin(tick * 0.55 + side) * 0.08;
  return (40 + tier * 16) * pulse * (0.6 + clamp01(level) * 0.4);
}

/** ...and its alpha (2D: 0.26 * level, x1.35 for a super). */
export function chargeGlowAlpha(level, tier) {
  return 0.26 * clamp01(level) * (tier === 2 ? 1.35 : 1);
}

// --- the 2D particle pool, routed for 3D ------------------------------------
// 25 kinds spawn into state.particles; they are already integrated by the sim
// path every frame, so 3D does not re-simulate them — it MIRRORS them. Each
// kind maps to one of three 3D channels:
//   mote   — a soft additive/alpha point in the shared points cloud
//   ring   — an expanding shockwave quad (a handful at a time)
//   skip   — screen-space or 2D-overlay only (combat text, lens blood, the
//            HUD-space flashes); the overlay pass already draws those.
export const PARTICLE_CHANNELS = Object.freeze({
  dust: "mote", blood: "mote", arterial: "mote", bloodDecal: "skip", goreFragment: "mote",
  goreShockwave: "ring", shockRing: "ring", wallShock: "ring",
  debris: "mote", sparkLine: "mote", hitSpark: "mote", guardSpark: "mote",
  sweat: "mote", mist: "mote", steam: "mote", motes: "mote", litter: "mote",
  sparkle: "mote", severedLimb: "mote", floorImpact: "ring",
  groundCrackFlash: "ring", impactFlash: "skip", combatText: "skip",
  lensBlood: "skip", noise: "skip", tone: "skip", rank: "skip",
  unlock: "skip", online: "skip", stadiumSwell: "skip",
});

/** The 3D channel for a particle kind; unknown kinds ride as motes. */
export function particleChannel(kind) {
  return PARTICLE_CHANNELS[kind] || "mote";
}

/**
 * A mirrored mote's drawn size (world px) and alpha. Dust is the quiet
 * background layer in both renderers (2D multiplies its alpha by 0.42);
 * blood and gore keep their full weight. `additive` routes the mote into the
 * hot spark cloud rather than the soft dust cloud.
 */
export function particleMote(particle) {
  const alpha = clamp01(particle.life / particle.max);
  const kind = particle.kind;
  const quiet = kind === "dust" || kind === "mist" || kind === "steam";
  return {
    alpha: quiet ? alpha * 0.42 : alpha,
    size: Math.max(1.5, particle.size || 4) * (kind === "mist" || kind === "steam" ? 1 + (1 - alpha) * 1.5 : 1),
    additive: kind === "sparkLine" || kind === "hitSpark" || kind === "guardSpark" || kind === "sparkle",
  };
}

/**
 * A dash afterimage's read at `age` (0 = freshest). Matches drawAfterimages:
 * the freshest ghost is a horizontal STRETCH-SMEAR of the current cell at
 * 15% (a smear of the torso in motion, never a second body); older ghosts sit
 * under a crushed 13%-and-falling wash with their head band clipped away.
 * Alphas are deliberately below face readability.
 */
export function afterimageGhost(age) {
  const a = clamp01(age);
  if (a < 0.45) return { opacity: 0.15, scaleX: 1.3, scaleY: 0.97, clipTop: 0 };
  return { opacity: Math.max(0, 0.13 - a * 0.07), scaleX: 1, scaleY: 1, clipTop: 0.26 };
}

/**
 * The cache key for a side's composited battle-damage decal. Identical in
 * both renderers so a probe can prove the 3D decal rebuilt on the same push
 * the 2D scratch did.
 */
export function damageDecalKey(revision, gore) {
  return `${revision | 0}|${gore ? 1 : 0}`;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
