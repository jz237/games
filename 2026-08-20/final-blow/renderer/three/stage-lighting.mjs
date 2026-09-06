// Per-stage SPRITE lighting for CINEMA 3D (5.1, #45).
//
// The fighter shader (fighters.mjs) lights each sprite with position-driven
// terms: a rim on the screen-left silhouette edge, a rim on the screen-right
// edge, a crown/top strip plus a top-down body gradient, two lateral body
// fills, a floor bounce climbing the shins, a zone grade (exposure and
// temperature shifting with the nearest practical) and a whisper of hue in
// the wet-floor mirror. Until 5.1 every one of those was a Somerset constant
// — sodium streetlights screen-left, the K&A neon screen-right, the green
// station lamp overhead — so on the Vet a cornered fighter glowed pink from
// a sign that is not on the plate and both crowns were station-lamp cyan
// under stadium floodlights. The fighters were lit by a different stage
// than the one behind them on five of six stages.
//
// This table is the fix: one descriptor per stage id, read by poseRig
// through spriteLightFrame(). `somerset` IS the old constant set, number for
// number (tests/cinema-fighters.test.mjs holds it to the pre-5.1 formulas to
// 1e-9), so the hero stage did not move. The other five were fitted to their
// plates and the practicals stage-generic.mjs already places (STAGE_MOOD).
//
// No "three" import: colours are plain [r, g, b] floats, so Node can test
// the maths and the hue separation between stages.

function rgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

// THREE.Color.lerp, component for component: a += (b - a) * t.
function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const SODIUM = rgb(0xffa04a);
const BODEGA_WARM = rgb(0xffc27a);
const NEON_MAGENTA = rgb(0xff4fd8);
const NEON_CYAN = rgb(0x3fd6ff);
const STATION_LAMP = rgb(0xa9f7d2);

// Descriptor shape (every field is read by spriteLightFrame):
//   left  — the screen-left practical. near: [origin, span, floor] gives
//           leftNear = clamp(1 - (fx - origin)/span, floor, 1); deep: the
//           colour the rim warms toward past origin (mix at full reach);
//           strength/fill: [base, gain] on leftNear; zone/mirror: per-channel
//           gains on leftNear.
//   right — the screen-right practical. near: [origin, span] gives
//           rightNear = clamp((fx - origin)/span, 0, 1), SQUARED when
//           `squared` (a corner sign that only lands when you stand under it;
//           false for a light that reaches the whole stage); far: the colour
//           the rim cools toward at the far-right edge.
//   top   — the overhead source. x/spread: lampNear = exp(-(fx-x)^2/spread);
//           tint: the body multiplier under it (Somerset's green-white lamp
//           was a shader constant until 5.1); spec: the sheen budget.
//   floor — the bounce colour on shoes/shins: strength [base, lamp, left].
//   zoneBase — the body exposure lift the zone grade rides on.
//   mirror — the wet-floor mirror's base tint + per-practical gains.
export const STAGE_SPRITE_LIGHT = Object.freeze({
  // The hero stage: sodium streetlights screen-left (warming toward the
  // bodega deep left), the K&A neon screen-right (cooling toward the
  // check-cashing cyan at the far wall), the green-white station lamp
  // overhead at x=0.4. Every number here is the pre-5.1 constant.
  somerset: {
    id: "somerset",
    left: {
      rim: SODIUM, deep: BODEGA_WARM, deepReach: [-2, 5, 0.5], near: [-3.2, 6, 0.25],
      strength: [0.55, 0.45], fill: [0.17, 0.24], zone: [0.20, 0.05, -0.12], mirror: [0.04, 0.01, 0],
    },
    right: {
      rim: NEON_MAGENTA, far: NEON_CYAN, farReach: [3.4, 3, 0.55], near: [-0.4, 3.3], squared: true,
      strength: [0.22, 1.15], fill: [0.14, 0.6], zone: [0.16, 0, 0.34], mirror: [0, 0, 0.14], mirrorLinear: [-0.02, 0, 0],
    },
    top: {
      color: STATION_LAMP, tint: [0.88, 1.12, 0.99], x: 0.4, spread: 7,
      strength: [0.5, 0.95], spec: [0.72, 0.68], zone: [0, 0.22, 0.10], mirror: [0, 0.05, 0.03],
    },
    floor: { color: lerp(SODIUM, BODEGA_WARM, 0.35), strength: [0.32, 0.16, 0.12] },
    zoneBase: 1.16,
    mirror: [1.0, 1.01, 1.06],
  },
  // Eagles tailgate at the Vet: stadium floodlights — a cool white-green
  // wash from high above that reaches the whole lot (huge spread, so both
  // crowns read floodlit wherever they stand), warm sodium lot lamps on
  // BOTH sides (no corner sign: the right rim is linear and symmetric with
  // the left), and grill-fire amber bouncing off the asphalt.
  vet: {
    id: "vet",
    left: {
      rim: rgb(0xffb054), deep: rgb(0xffd9a0), deepReach: [-2, 5, 0.4], near: [-3.4, 6, 0.3],
      strength: [0.5, 0.4], fill: [0.15, 0.2], zone: [0.14, 0.06, -0.06], mirror: [0.03, 0.01, 0],
    },
    right: {
      rim: rgb(0xffd9a0), far: rgb(0xffb054), farReach: [2.4, 3, 0.5], near: [-2.6, 6], squared: false,
      strength: [0.3, 0.6], fill: [0.12, 0.3], zone: [0.14, 0.06, -0.06], mirror: [0.03, 0.01, 0], mirrorLinear: [0, 0, 0],
    },
    top: {
      color: rgb(0xe6f6ff), tint: [1.0, 1.05, 1.08], x: 0, spread: 40,
      strength: [0.6, 0.7], spec: [0.7, 0.5], zone: [0.06, 0.10, 0.14], mirror: [0, 0.03, 0.05],
    },
    floor: { color: rgb(0xffb060), strength: [0.26, 0.08, 0.12] },
    zoneBase: 1.14,
    mirror: [1.0, 1.0, 1.02],
  },
  // Wildwood boardwalk: pink and cyan neon from the arcade fronts on either
  // side, a cool moonlit top, the boards throwing the pink back up.
  wildwood: {
    id: "wildwood",
    left: {
      rim: rgb(0xff7fd4), deep: rgb(0xff5fb0), deepReach: [-2, 5, 0.5], near: [-3.2, 6, 0.25],
      strength: [0.55, 0.5], fill: [0.16, 0.3], zone: [0.20, 0.0, 0.20], mirror: [0.05, 0, 0.04],
    },
    right: {
      rim: rgb(0x62d8ff), far: rgb(0x8fe8ff), farReach: [3.2, 3, 0.4], near: [-0.6, 3.4], squared: true,
      strength: [0.25, 1.0], fill: [0.14, 0.55], zone: [0, 0.16, 0.30], mirror: [0, 0.04, 0.14], mirrorLinear: [0, 0, 0],
    },
    top: {
      color: rgb(0xaac8ff), tint: [0.96, 1.0, 1.08], x: 0.2, spread: 12,
      strength: [0.45, 0.7], spec: [0.7, 0.55], zone: [0, 0.10, 0.14], mirror: [0, 0.03, 0.05],
    },
    floor: { color: rgb(0xff9adf), strength: [0.28, 0.10, 0.14] },
    zoneBase: 1.16,
    mirror: [1.0, 1.0, 1.06],
  },
  // The buffet: amber heat lamps hang over the fight line (a tight, warm
  // top key — the crowns glow like the sneeze guards), the red BUFFET sign
  // burns screen-right, warm sconces screen-left, and the carpet bounces
  // a dull orange onto the shoes.
  buffet: {
    id: "buffet",
    left: {
      rim: rgb(0xffd0a0), deep: rgb(0xffb070), deepReach: [-2, 5, 0.5], near: [-3.2, 6, 0.3],
      strength: [0.5, 0.4], fill: [0.16, 0.22], zone: [0.16, 0.08, -0.04], mirror: [0.03, 0.01, 0],
    },
    right: {
      rim: rgb(0xff5f4a), far: rgb(0xff8a3c), farReach: [3.2, 3, 0.5], near: [-0.4, 3.3], squared: true,
      strength: [0.25, 1.1], fill: [0.14, 0.55], zone: [0.22, 0.02, -0.06], mirror: [0.06, 0, -0.02], mirrorLinear: [0, 0, 0],
    },
    top: {
      color: rgb(0xffb347), tint: [1.10, 1.0, 0.86], x: 0, spread: 10,
      strength: [0.55, 0.85], spec: [0.75, 0.6], zone: [0.14, 0.10, 0], mirror: [0.04, 0.02, 0],
    },
    floor: { color: rgb(0xffa070), strength: [0.30, 0.14, 0.10] },
    zoneBase: 1.14,
    mirror: [1.0, 0.99, 0.97],
  },
  // Cruise deck: a cool night sky and the moon from above (a wide, even
  // top), pale deck lamps screen-left, and the lit pool screen-right
  // throwing turquoise up the legs — the pool bounce IS the stage's floor
  // light, strongest toward the pool side.
  cruise: {
    id: "cruise",
    left: {
      rim: rgb(0xbfe4ff), deep: rgb(0xe0f0ff), deepReach: [-2, 5, 0.4], near: [-3.2, 6, 0.3],
      strength: [0.5, 0.4], fill: [0.14, 0.2], zone: [0.0, 0.06, 0.16], mirror: [0, 0.02, 0.05],
    },
    right: {
      rim: rgb(0x62e8ff), far: rgb(0x3fd0e8), farReach: [3.2, 3, 0.4], near: [-1.2, 4], squared: true,
      strength: [0.3, 1.0], fill: [0.14, 0.55], zone: [-0.02, 0.20, 0.26], mirror: [0, 0.06, 0.12], mirrorLinear: [0, 0, 0],
    },
    top: {
      color: rgb(0xd8ecff), tint: [0.96, 1.0, 1.08], x: 0, spread: 40,
      strength: [0.5, 0.5], spec: [0.7, 0.5], zone: [0.04, 0.06, 0.12], mirror: [0, 0.03, 0.06],
    },
    floor: { color: rgb(0x4fe0d8), strength: [0.30, 0.10, 0.06] },
    zoneBase: 1.16,
    mirror: [0.98, 1.04, 1.10],
  },
  // Janney Street: a sodium lamp screen-left, the violet sign light
  // screen-right, a violet-white top from the lot lights.
  janney: {
    id: "janney",
    left: {
      rim: rgb(0xff9a3c), deep: rgb(0xffc27a), deepReach: [-2, 5, 0.5], near: [-3.2, 6, 0.25],
      strength: [0.55, 0.45], fill: [0.17, 0.24], zone: [0.20, 0.06, -0.10], mirror: [0.04, 0.01, 0],
    },
    right: {
      rim: rgb(0xd8b8ff), far: rgb(0xb8a0ff), farReach: [3.4, 3, 0.5], near: [-0.4, 3.3], squared: true,
      strength: [0.22, 1.0], fill: [0.14, 0.5], zone: [0.12, 0.04, 0.28], mirror: [0.02, 0, 0.12], mirrorLinear: [0, 0, 0],
    },
    top: {
      color: rgb(0xd8b8ff), tint: [1.02, 0.98, 1.08], x: 0.4, spread: 9,
      strength: [0.5, 0.8], spec: [0.72, 0.6], zone: [0.06, 0.04, 0.16], mirror: [0.02, 0.02, 0.05],
    },
    floor: { color: rgb(0xff9a3c), strength: [0.30, 0.12, 0.12] },
    zoneBase: 1.16,
    mirror: [1.0, 1.0, 1.06],
  },
});

export const STAGE_SPRITE_LIGHT_IDS = Object.freeze(Object.keys(STAGE_SPRITE_LIGHT));

/** The descriptor for a stage id; unknown ids light like Somerset (the old behaviour). */
export function spriteLightFor(stageId) {
  return STAGE_SPRITE_LIGHT[stageId] || STAGE_SPRITE_LIGHT.somerset;
}

/**
 * The per-frame sprite-light numbers for a fighter at world x `fx` under
 * `light`. `hitSmear` (0..1) is the 2D hit-reaction smear level, which
 * boosts the left rim exactly as before. Pure; poseRig copies the result
 * into the material uniforms.
 */
export function spriteLightFrame(light, fx, hitSmear = 0) {
  const { left, right, top, floor } = light;
  const leftNear = clamp(1 - (fx - left.near[0]) / left.near[1], left.near[2], 1);
  const deepMix = clamp(-(fx - left.deepReach[0]) / left.deepReach[1], 0, 1) * left.deepReach[2];
  const rightNear = clamp((fx - right.near[0]) / right.near[1], 0, 1);
  const rightPow = right.squared ? rightNear * rightNear : rightNear;
  const farMix = clamp((fx - right.farReach[0]) / right.farReach[1], 0, 1) * right.farReach[2];
  const lampNear = Math.exp(-((fx - top.x) * (fx - top.x)) / top.spread);
  const zone = [0, 1, 2].map((c) => light.zoneBase
    * (1 + leftNear * left.zone[c] + rightPow * right.zone[c] + lampNear * top.zone[c]));
  const mirror = [0, 1, 2].map((c) => light.mirror[c]
    + leftNear * left.mirror[c] + rightNear * right.mirrorLinear[c] + rightPow * right.mirror[c] + lampNear * top.mirror[c]);
  return {
    leftNear,
    rightNear,
    lampNear,
    rimLeft: lerp(left.rim, left.deep, deepMix),
    rimLeftStrength: (left.strength[0] + leftNear * left.strength[1]) * (1 + hitSmear * 0.5),
    rimRight: lerp(right.rim, right.far, farMix),
    rimRightStrength: right.strength[0] + rightPow * right.strength[1],
    top: top.color,
    topTint: top.tint,
    topStrength: top.strength[0] + lampNear * top.strength[1],
    fillLeft: scale(left.rim, left.fill[0] + leftNear * left.fill[1]),
    fillRight: scale(right.rim, right.fill[0] + rightPow * right.fill[1]),
    floorBounce: scale(floor.color, floor.strength[0] + lampNear * floor.strength[1] + leftNear * floor.strength[2]),
    zone,
    mirror,
    lampDx: clamp((fx - top.x) / 2.5, -1, 1),
    specStrength: top.spec[0] + lampNear * top.spec[1],
  };
}

/** Hue (degrees, 0..360) of an [r, g, b] triple — the tests' rim-colour probe. */
export function hueOf([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-6) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}
