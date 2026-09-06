import { DeterministicRng, hashSeed } from "./foundation.mjs";

/**
 * Background crowds.
 *
 * A stage crowd is generated once per round from the match seed and then animated
 * purely from the simulation tick, so it is byte-identical under replay, rollback,
 * the AI-vs-AI demo and automated tests, while never touching gameplay state.
 *
 * Pedestrians live on depth layers behind the fight. Each layer has its own scale,
 * walking speed, opacity, contrast and parallax factor, and every pedestrian gets
 * its own build, posture, gait phase, route, pause rhythm and palette so nearby
 * figures never move in sync or read as duplicated sprites.
 */

export const CROWD_LAYERS = Object.freeze([
  // Furthest back: small, slow, low contrast, barely parallaxing.
  Object.freeze({ id: "far", count: 14, baseY: 450, scale: 0.58, speed: 0.42, alpha: 0.72, parallax: 0.09, detail: "low" }),
  Object.freeze({ id: "mid", count: 11, baseY: 482, scale: 0.74, speed: 0.68, alpha: 0.82, parallax: 0.17, detail: "mid" }),
  // Nearest crowd layer still sits well behind the fighters' floor line.
  Object.freeze({ id: "near", count: 7, baseY: 516, scale: 0.92, speed: 1, alpha: 0.9, parallax: 0.29, detail: "high" }),
]);

export const CROWD_TOTAL = CROWD_LAYERS.reduce((total, layer) => total + layer.count, 0);

/**
 * Legacy street-posture archetypes remain available to crowd variants that need
 * hunched, shuffling and lingering figures, with a minority of upright walkers
 * and leaners for variety. Somerset uses embedded photographic actors instead.
 */
export const POSTURES = Object.freeze([
  Object.freeze({ id: "hunch", weight: 26, lean: 0.30, headDrop: 0.22, stride: 0.46, armSwing: 0.30, bob: 0.7 }),
  Object.freeze({ id: "shuffle", weight: 24, lean: 0.20, headDrop: 0.16, stride: 0.30, armSwing: 0.18, bob: 0.4 }),
  Object.freeze({ id: "stoop", weight: 16, lean: 0.42, headDrop: 0.30, stride: 0.24, armSwing: 0.12, bob: 0.3 }),
  Object.freeze({ id: "linger", weight: 14, lean: 0.14, headDrop: 0.10, stride: 0.06, armSwing: 0.08, bob: 0.2 }),
  Object.freeze({ id: "lean", weight: 8, lean: 0.50, headDrop: 0.08, stride: 0, armSwing: 0.05, bob: 0.1 }),
  Object.freeze({ id: "stride", weight: 7, lean: 0.06, headDrop: 0.02, stride: 1, armSwing: 0.7, bob: 1 }),
  Object.freeze({ id: "amble", weight: 5, lean: 0.12, headDrop: 0.06, stride: 0.66, armSwing: 0.45, bob: 0.6 }),
]);

/**
 * Tailgate postures. The Vet parking lot is a rowdy Eagles tailgate, so
 * its crowd is dominated by people drinking, toasting, chugging and arguing
 * rather than shuffling past.
 */
export const TAILGATE_POSTURES = Object.freeze([
  Object.freeze({ id: "drink", weight: 24, lean: 0.10, headDrop: -0.18, stride: 0.10, armSwing: 0.10, bob: 0.3, prop: "cup" }),
  Object.freeze({ id: "chug", weight: 14, lean: -0.16, headDrop: -0.46, stride: 0, armSwing: 0.06, bob: 0.2, prop: "can" }),
  Object.freeze({ id: "toast", weight: 16, lean: 0.04, headDrop: -0.10, stride: 0.06, armSwing: 0.42, bob: 0.5, prop: "cup" }),
  Object.freeze({ id: "pour", weight: 10, lean: 0.24, headDrop: 0.18, stride: 0, armSwing: 0.12, bob: 0.2, prop: "can" }),
  Object.freeze({ id: "cheer", weight: 14, lean: -0.08, headDrop: -0.24, stride: 0.12, armSwing: 0.9, bob: 0.9, prop: "flag" }),
  Object.freeze({ id: "stumble", weight: 10, lean: 0.34, headDrop: 0.20, stride: 0.68, armSwing: 0.55, bob: 1.2, prop: "cup" }),
  Object.freeze({ id: "sign", weight: 6, lean: 0.02, headDrop: -0.12, stride: 0, armSwing: 0.3, bob: 0.3, prop: "sign" }),
  Object.freeze({ id: "mill", weight: 6, lean: 0.10, headDrop: 0.04, stride: 0.6, armSwing: 0.4, bob: 0.6, prop: "" }),
]);

/**
 * Philadelphia Eagles fan colours. The photographic plate carries the readable
 * team identity; these animated supporters echo its green, white, black and
 * silver clothing, wing motifs, handmade numbers and face paint.
 */
const FAN_COLOURS = Object.freeze([
  "#1c4f42", "#143d33", "#255f4e", "#0f2f28", "#2d6b57",
  "#d8dde2", "#eef1f3", "#b9c2c8",
  "#181c1f", "#23282c",
  "#8d949b", "#a6adb4",
]);
const FAN_TROUSERS = Object.freeze([
  "#20262b", "#2b3138", "#1a2b26", "#33383d", "#12211d", "#3a4046",
]);
const FAN_ACCENTS = Object.freeze([
  "#f2f5f7", "#0f2f28", "#c7ced4", "#2d6b57", "#141719", "#9aa3ab",
]);

/**
 * Boardwalk strollers: an easy night-out crowd, plus cyclists and people leaning
 * on the railing looking at the ocean.
 */
export const BOARDWALK_POSTURES = Object.freeze([
  Object.freeze({ id: "stroll", weight: 26, lean: 0.06, headDrop: 0.02, stride: 0.7, armSwing: 0.42, bob: 0.7, prop: "" }),
  Object.freeze({ id: "amble", weight: 18, lean: 0.10, headDrop: 0.04, stride: 0.5, armSwing: 0.3, bob: 0.5, prop: "" }),
  Object.freeze({ id: "railing", weight: 14, lean: 0.44, headDrop: -0.12, stride: 0, armSwing: 0.04, bob: 0.1, prop: "" }),
  Object.freeze({ id: "snack", weight: 14, lean: 0.06, headDrop: -0.16, stride: 0.3, armSwing: 0.14, bob: 0.3, prop: "cup" }),
  Object.freeze({ id: "cyclist", weight: 10, lean: 0.5, headDrop: 0.1, stride: 1.3, armSwing: 0.06, bob: 0.2, prop: "" }),
  Object.freeze({ id: "linger", weight: 10, lean: 0.14, headDrop: 0.08, stride: 0.06, armSwing: 0.08, bob: 0.2, prop: "" }),
  Object.freeze({ id: "point", weight: 8, lean: -0.06, headDrop: -0.2, stride: 0.1, armSwing: 0.7, bob: 0.3, prop: "" }),
]);

/**
 * Buffet patrons: loading plates, reaching with tongs, competing for crab legs
 * and carrying overflowing dishes back to their tables.
 */
export const BUFFET_POSTURES = Object.freeze([
  Object.freeze({ id: "load", weight: 24, lean: 0.34, headDrop: 0.24, stride: 0.06, armSwing: 0.5, bob: 0.2, prop: "plate" }),
  Object.freeze({ id: "tongs", weight: 20, lean: 0.4, headDrop: 0.26, stride: 0, armSwing: 0.66, bob: 0.2, prop: "tongs" }),
  Object.freeze({ id: "carry", weight: 18, lean: -0.04, headDrop: -0.06, stride: 0.5, armSwing: 0.1, bob: 0.4, prop: "plate" }),
  Object.freeze({ id: "queue", weight: 14, lean: 0.12, headDrop: 0.08, stride: 0.1, armSwing: 0.1, bob: 0.2, prop: "plate" }),
  Object.freeze({ id: "reach", weight: 12, lean: 0.46, headDrop: 0.18, stride: 0, armSwing: 0.8, bob: 0.2, prop: "tongs" }),
  Object.freeze({ id: "spill", weight: 6, lean: 0.3, headDrop: 0.3, stride: 0.4, armSwing: 0.7, bob: 0.9, prop: "plate" }),
  Object.freeze({ id: "linger", weight: 6, lean: 0.1, headDrop: 0.04, stride: 0.04, armSwing: 0.06, bob: 0.2, prop: "" }),
]);

// Easy night-out and restaurant palettes: warmer and lighter than the street.
const BOARDWALK_COLOURS = Object.freeze([
  "#6a5f77", "#4d6a7a", "#7a6455", "#5f7268", "#7d5f6a", "#556380",
  "#8a7a63", "#4a5f6d", "#6f6a52", "#77606b", "#3f5866", "#6b7460",
]);
const BUFFET_COLOURS = Object.freeze([
  "#7c6a5c", "#5f6b74", "#84756a", "#6b6f5e", "#75626b", "#5b6a6b",
  "#8b7a6c", "#666f7c", "#7a6c5a", "#6e6472", "#556663", "#877066",
]);

/**
 * Cruise pool deck. The brief asks for high-chaos budget-vacation energy through
 * behaviour, styling, props and colour rather than any branding, so the postures
 * are all impatience, over-packing, phone filming and drink-carrying.
 */
export const POOLSIDE_POSTURES = Object.freeze([
  Object.freeze({ id: "bigcup", weight: 18, lean: 0.06, headDrop: -0.14, stride: 0.2, armSwing: 0.14, bob: 0.3, prop: "bigcup" }),
  Object.freeze({ id: "filming", weight: 15, lean: -0.06, headDrop: -0.26, stride: 0.1, armSwing: 0.1, bob: 0.2, prop: "phone" }),
  Object.freeze({ id: "queue", weight: 14, lean: 0.16, headDrop: 0.1, stride: 0.06, armSwing: 0.08, bob: 0.2, prop: "bigcup" }),
  Object.freeze({ id: "overpacked", weight: 12, lean: 0.32, headDrop: 0.18, stride: 0.5, armSwing: 0.12, bob: 0.5, prop: "bag" }),
  Object.freeze({ id: "towel", weight: 11, lean: 0.28, headDrop: 0.2, stride: 0, armSwing: 0.4, bob: 0.2, prop: "towel" }),
  Object.freeze({ id: "dance", weight: 10, lean: -0.1, headDrop: -0.2, stride: 0.3, armSwing: 1.1, bob: 1.4, prop: "" }),
  Object.freeze({ id: "stagger", weight: 9, lean: 0.36, headDrop: 0.22, stride: 0.7, armSwing: 0.6, bob: 1.2, prop: "bigcup" }),
  Object.freeze({ id: "plate", weight: 7, lean: 0.1, headDrop: -0.04, stride: 0.34, armSwing: 0.1, bob: 0.3, prop: "plate" }),
  Object.freeze({ id: "staff", weight: 4, lean: 0.12, headDrop: 0.02, stride: 1.1, armSwing: 0.3, bob: 0.7, prop: "plate" }),
]);

// Loud mismatched resort wear: clashing brights, no branding anywhere.
const RESORT_COLOURS = Object.freeze([
  "#ef6a3d", "#31b6c9", "#f2c33d", "#d94f8a", "#59c46a", "#8a5fd6",
  "#f28a2e", "#2f9be0", "#e04b4b", "#4fd0b0", "#f0e14c", "#c95fc0",
]);
const RESORT_TROUSERS = Object.freeze([
  "#2f6fb5", "#d94f4f", "#3fae7a", "#e2a03a", "#7a5fc0", "#2fa9b5",
]);
const RESORT_ACCENTS = Object.freeze([
  "#fff3c4", "#ff8fc4", "#9df0ff", "#ffd24a", "#c6ff9d", "#ffb0e8",
]);

export const CROWD_VARIANTS = Object.freeze({
  street: Object.freeze({ postures: POSTURES, coats: null, trousers: null, accents: null }),
  // Somerset's adults are rendered into the generated photographic plate so
  // their fabric, anatomy, depth and deeply folded head-near-knees poses remain
  // realistic. Canvas pedestrians would visibly break that treatment.
  somerset: Object.freeze({
    postures: POSTURES,
    coats: null,
    trousers: null,
    accents: null,
    counts: Object.freeze({ far: 0, mid: 0, near: 0 }),
    embeddedPeople: 9,
    embeddedPose: "deep-slump-head-near-knees",
    // v5.3 CROWD DEPTH: the plate's folded sitters stay untouched, but the
    // hero stage is no longer empty of living people. Eight painted locals
    // stand at fixed places the plate already reads as standable — the two
    // sidewalks and the station mouth — instead of walking the open band,
    // because a pedestrian striding across the wet asphalt would walk through
    // the fight lane and over the plate's reflections. They are painted from
    // the tailgate bank (see CROWD_SPRITE_BORROW): puffers, beanies, hoods
    // and Eagles green are what a Kensington platform looks like on a game
    // night, and the El is how the city gets to and from the stadium.
    spriteBorrow: "tailgate",
    // Plate-anchored, so they ride the plate's own parallax factor (-0.035 in
    // drawStage) rather than the walking bands' 0.09/0.17/0.29 — at the band
    // factors a bystander slides off his own doorway as the camera tracks.
    parallax: 0.035,
    stations: Object.freeze([
      // Right-hand sidewalk, outside the roll-shuttered storefront where the
      // plate's own men are sitting: three locals standing over them.
      Object.freeze({ layer: "near", x: 1004, y: 484, roam: 0, direction: -1, lift: 0 }),
      Object.freeze({ layer: "near", x: 1096, y: 490, roam: 16, direction: -1, lift: 0 }),
      Object.freeze({ layer: "mid", x: 1186, y: 468, roam: 0, direction: -1, lift: 0 }),
      // Left-hand sidewalk under the storefront awnings.
      Object.freeze({ layer: "near", x: 104, y: 480, roam: 0, direction: 1, lift: 0 }),
      Object.freeze({ layer: "mid", x: 190, y: 466, roam: 18, direction: 1, lift: 0 }),
      Object.freeze({ layer: "mid", x: 262, y: 458, roam: 0, direction: -1, lift: 0 }),
      // The SOMERSET mouth: two waiting on the entrance steps, a step up from
      // the pavement (the lift the 3D layer raises them by). Held wide of the
      // doorway's centre line — that is the fight lane, and a far-band figure
      // standing directly behind the exchange is clutter nobody ever sees.
      Object.freeze({ layer: "mid", x: 392, y: 424, roam: 0, direction: 1, lift: 6 }),
      Object.freeze({ layer: "mid", x: 838, y: 422, roam: 12, direction: -1, lift: 6 }),
    ]),
    // One street argument by the left-hand awnings — the tailgate's loop
    // machinery, without the tailgate's celebration and table-flip kinds.
    scuffles: 1,
    scuffleKinds: Object.freeze(["argue", "shove", "separate"]),
    scuffleSpots: Object.freeze([Object.freeze({ x: 360, y: 474 })]),
  }),
  tailgate: Object.freeze({ postures: TAILGATE_POSTURES, coats: FAN_COLOURS, trousers: FAN_TROUSERS, accents: FAN_ACCENTS }),
  boardwalk: Object.freeze({ postures: BOARDWALK_POSTURES, coats: BOARDWALK_COLOURS, trousers: null, accents: null }),
  buffet: Object.freeze({ postures: BUFFET_POSTURES, coats: BUFFET_COLOURS, trousers: null, accents: null }),
  // The pool deck is deliberately the densest crowd in the game.
  poolside: Object.freeze({
    postures: POOLSIDE_POSTURES,
    coats: RESORT_COLOURS,
    trousers: RESORT_TROUSERS,
    accents: RESORT_ACCENTS,
    counts: Object.freeze({ far: 20, mid: 15, near: 9 }),
    incidents: 6,
  }),
  // Janney Street is deliberately resident-free. Its background life is a
  // seeded colony of cats rather than generic pedestrians.
  vacantLot: Object.freeze({
    postures: POSTURES,
    coats: null,
    trousers: null,
    accents: null,
    counts: Object.freeze({ far: 0, mid: 0, near: 0 }),
    cats: 16,
  }),
});

export const STAGE_CROWD_VARIANT = Object.freeze({
  somerset: "somerset",
  vet: "tailgate",
  wildwood: "boardwalk",
  buffet: "buffet",
  cruise: "poolside",
  janney: "vacantLot",
});

/**
 * Looping background scuffles for the tailgate. Each is a small group running one
 * of several fight loops at its own speed and phase, so the lot never looks like
 * one animation played in unison.
 */
/**
 * Pool-deck incidents. Same loop machinery as the tailgate scuffles, different
 * events: cannonballs, splashing, arguing over a lounger, cutting the bar line,
 * spilling a frozen drink and a staff member squeezing through the crowd.
 */
// v4.7 BYSTANDERS: painted sprite banks (assets/crowd/<variant>-N.webp, built by
// tools/build_crowd_sheets.py) — painted characters per variant, each with a
// stand / weight-shift / cheer / stride cell. Somerset's people are baked into
// the plate and the vacant lot is cats only, so neither has a bank; the
// vector figures stay as the fallback until a sheet arrives.
export const CROWD_SPRITE_BANKS = Object.freeze({ tailgate: 8, boardwalk: 8, buffet: 8, poolside: 8, somerset: 4 });
export const CROWD_SPRITE_COLUMNS = Object.freeze({ stand: 0, shift: 1, cheer: 2, stride: 3 });

// v5.3 CROWD DEPTH: a variant with no sheet family of its own borrows a
// subset of another's. Somerset takes the four tailgate characters whose
// wardrobe reads as a Philadelphia street at night rather than a parking lot
// — black puffer + beanie, grey sweatshirt, white puffer + phone, hooded
// track suit — and drops the wing hat, the face paint, the jersey-and-sign
// and the hot dog. `grade` is the tone the borrowing stage draws them under
// (both renderers), because the tailgate plate is lit by lot floodlights and
// Somerset is lit by sodium lamps under the El.
export const CROWD_SPRITE_BORROW = Object.freeze({
  somerset: Object.freeze({ from: "tailgate", characters: Object.freeze([2, 3, 5, 7]), grade: "night" }),
});

/** The sheet-family variant a crowd variant paints from (itself, or its loan). */
export function crowdSheetVariant(variantId) {
  return CROWD_SPRITE_BORROW[variantId]?.from || variantId;
}

export const POOL_INCIDENT_KINDS = Object.freeze([
  Object.freeze({ id: "cannonball", period: 240, members: 1, reach: 30 }),
  Object.freeze({ id: "splash", period: 160, members: 2, reach: 26 }),
  Object.freeze({ id: "loungerrow", period: 220, members: 2, reach: 34 }),
  Object.freeze({ id: "barcut", period: 200, members: 3, reach: 28 }),
  Object.freeze({ id: "spill", period: 180, members: 2, reach: 40 }),
  Object.freeze({ id: "squeeze", period: 150, members: 3, reach: 22 }),
]);

export const SCUFFLE_KINDS = Object.freeze([
  Object.freeze({ id: "argue", period: 190, members: 2, reach: 30 }),
  Object.freeze({ id: "shove", period: 150, members: 2, reach: 42 }),
  Object.freeze({ id: "shirtgrab", period: 220, members: 2, reach: 26 }),
  Object.freeze({ id: "swing", period: 130, members: 2, reach: 46 }),
  Object.freeze({ id: "wrestle", period: 250, members: 2, reach: 22 }),
  Object.freeze({ id: "separate", period: 210, members: 3, reach: 38 }),
  Object.freeze({ id: "tableflip", period: 300, members: 2, reach: 50 }),
  Object.freeze({ id: "celebrate", period: 170, members: 3, reach: 34 }),
]);

const POSTURE_TOTAL = POSTURES.reduce((total, posture) => total + posture.weight, 0);

// Muted street palette: nothing here may out-contrast the fighters.
const COAT_COLOURS = Object.freeze([
  "#454d5a", "#55483a", "#374b5a", "#5f4f3e", "#484150", "#4a554a",
  "#5f4a4a", "#3c554e", "#46505f", "#554851", "#354553", "#565240",
]);
const TROUSER_COLOURS = Object.freeze([
  "#2e343d", "#3a342c", "#28313d", "#3b342e", "#2f3540", "#333b34",
]);
const ACCENT_COLOURS = Object.freeze([
  "#95a0ad", "#a8917a", "#8496a1", "#a58585", "#909c88", "#828a97",
]);

function pick(rng, list) {
  return list[Math.floor(rng.nextFloat() * list.length) % list.length];
}

function pickPosture(rng, postures = POSTURES) {
  const total = postures === POSTURES
    ? POSTURE_TOTAL
    : postures.reduce((sum, posture) => sum + posture.weight, 0);
  let roll = rng.nextFloat() * total;
  for (const posture of postures) {
    roll -= posture.weight;
    if (roll <= 0) return posture;
  }
  return postures[0];
}

/**
 * Build one stage's crowd. Pure: the same seed and stage always produce the same
 * people, in the same places, walking the same routes.
 */
// The walking band is only a little wider than the 1280px screen, so almost the
// whole crowd is on camera at once and the "25 visible" floor holds every frame.
export function createCrowd(stageId, { seed = 1, minX = -90, maxX = 1370 } = {}) {
  const rng = new DeterministicRng(hashSeed(seed, "crowd", stageId));
  const variantId = STAGE_CROWD_VARIANT[stageId] || "street";
  const variant = CROWD_VARIANTS[variantId];
  const span = maxX - minX;
  const people = [];
  // v5.3 CROWD DEPTH: a variant may place its people at fixed stations (a
  // doorway, a sidewalk, the station steps) instead of spreading them along
  // the walking band. A station person keeps every other field a band person
  // has, so the draw, the billboards and the snapshot need no special case;
  // only `roam` (0 = rooted) changes how crowdPosition moves them.
  for (const station of variant.stations || []) {
    const posture = pickPosture(rng, variant.postures);
    people.push({
      layer: station.layer,
      posture: posture.id,
      originX: station.x,
      y: station.y,
      stationed: true,
      lift: station.lift || 0,
      roam: station.roam || 0,
      direction: station.direction,
      pace: 0.55 + rng.nextFloat() * 0.95,
      gaitPhase: rng.nextFloat() * Math.PI * 2,
      pausePeriod: 260 + Math.floor(rng.nextFloat() * 520),
      pauseLength: 40 + Math.floor(rng.nextFloat() * 150),
      pauseOffset: Math.floor(rng.nextFloat() * 600),
      height: 0.84 + rng.nextFloat() * 0.34,
      width: 0.82 + rng.nextFloat() * 0.42,
      shoulderSlope: (rng.nextFloat() - 0.35) * 0.4,
      headTilt: (rng.nextFloat() - 0.5) * 0.34,
      prop: posture.prop || "",
      coat: pick(rng, variant.coats || COAT_COLOURS),
      trousers: pick(rng, variant.trousers || TROUSER_COLOURS),
      accent: pick(rng, variant.accents || ACCENT_COLOURS),
      facePaint: false,
      jerseyNumber: 1 + Math.floor(rng.nextFloat() * 98),
      hasBag: rng.nextFloat() < 0.34,
      hasHood: rng.nextFloat() < 0.42,
      hasHat: rng.nextFloat() < 0.22,
      bagSide: rng.nextFloat() < 0.5 ? -1 : 1,
      sprite: null,
    });
  }
  for (const layer of CROWD_LAYERS) {
    const count = variant.counts?.[layer.id] ?? layer.count;
    for (let index = 0; index < count; index += 1) {
      const posture = pickPosture(rng, variant.postures);
      // Spread along the band with jitter so the spacing never looks regular.
      const slot = (index + rng.nextFloat() * 0.85) / count;
      people.push({
        layer: layer.id,
        posture: posture.id,
        originX: minX + slot * span,
        y: layer.baseY + Math.round((rng.nextFloat() - 0.5) * 16),
        stationed: false,
        lift: 0,
        roam: 0,
        direction: rng.nextFloat() < 0.5 ? -1 : 1,
        // Individual pace, so two neighbours on the same layer still drift apart.
        pace: 0.55 + rng.nextFloat() * 0.95,
        gaitPhase: rng.nextFloat() * Math.PI * 2,
        // Everyone pauses on their own rhythm and for their own length.
        pausePeriod: 260 + Math.floor(rng.nextFloat() * 520),
        pauseLength: 40 + Math.floor(rng.nextFloat() * 150),
        pauseOffset: Math.floor(rng.nextFloat() * 600),
        height: 0.84 + rng.nextFloat() * 0.34,
        width: 0.82 + rng.nextFloat() * 0.42,
        shoulderSlope: (rng.nextFloat() - 0.35) * 0.4,
        headTilt: (rng.nextFloat() - 0.5) * 0.34,
        prop: posture.prop || "",
        coat: pick(rng, variant.coats || COAT_COLOURS),
        trousers: pick(rng, variant.trousers || TROUSER_COLOURS),
        accent: pick(rng, variant.accents || ACCENT_COLOURS),
        facePaint: variantId === "tailgate" && rng.nextFloat() < 0.34,
        jerseyNumber: 1 + Math.floor(rng.nextFloat() * 98),
        hasBag: rng.nextFloat() < 0.34,
        hasHood: rng.nextFloat() < 0.42,
        hasHat: rng.nextFloat() < 0.22,
        bagSide: rng.nextFloat() < 0.5 ? -1 : 1,
        sprite: null,
      });
    }
  }
  const cats = [];
  for (let index = 0; index < (variant.cats || 0); index += 1) {
    const slot = (index + rng.nextFloat() * 0.72) / variant.cats;
    cats.push({
      originX: minX + slot * span,
      y: 414 + Math.floor(rng.nextFloat() * 112),
      direction: rng.nextFloat() < 0.5 ? -1 : 1,
      pace: 0.45 + rng.nextFloat() * 0.9,
      gaitPhase: rng.nextFloat() * Math.PI * 2,
      pausePeriod: 150 + Math.floor(rng.nextFloat() * 360),
      pauseLength: 35 + Math.floor(rng.nextFloat() * 120),
      pauseOffset: Math.floor(rng.nextFloat() * 480),
      scale: 0.55 + rng.nextFloat() * 0.42,
      coat: pick(rng, ["#17191d", "#302a25", "#5a554e", "#8a8176", "#c0b8aa", "#5b4435"]),
      tailCurl: rng.nextFloat() < 0.5 ? -1 : 1,
    });
  }
  const scuffles = variantId === "tailgate"
    ? createScuffles(rng, minX, span, SCUFFLE_KINDS, 5)
    : variantId === "poolside"
      ? createScuffles(rng, minX, span, POOL_INCIDENT_KINDS, variant.incidents || 6)
      // v5.3 CROWD DEPTH: any variant may ask for a few loops from a named
      // subset of the kinds, placed at fixed spots rather than spread.
      : variant.scuffles
        ? createScuffles(
          rng, minX, span,
          SCUFFLE_KINDS.filter((kind) => variant.scuffleKinds.includes(kind.id)),
          variant.scuffles, variant.scuffleSpots,
        )
        : [];
  // v4.7 BYSTANDERS: painted-character assignment rides its OWN seeded stream
  // so the people above (postures, routes, palettes) stay byte-identical to
  // the pre-sprite crowd. Neighbours never share a painting.
  const characters = CROWD_SPRITE_BANKS[variantId] || 0;
  if (characters) {
    const spriteRng = new DeterministicRng(hashSeed(seed, "crowd-sprites", stageId));
    let previous = -1;
    for (const person of people) {
      let character = Math.floor(spriteRng.nextFloat() * characters);
      if (character === previous) character = (character + 1) % characters;
      previous = character;
      person.sprite = {
        character,
        shiftPeriod: 200 + Math.floor(spriteRng.nextFloat() * 340),
        shiftLength: 45 + Math.floor(spriteRng.nextFloat() * 70),
        shiftOffset: Math.floor(spriteRng.nextFloat() * 500),
        reactThreshold: 0.3 + spriteRng.nextFloat() * 0.5,
      };
    }
    // Scuffle and incident groups get three distinct painted members each.
    for (const group of scuffles) {
      const deck = [];
      while (deck.length < Math.min(3, characters)) {
        const character = Math.floor(spriteRng.nextFloat() * characters);
        if (!deck.includes(character)) deck.push(character);
      }
      group.characters = deck;
    }
  }
  // v5.3 CROWD DEPTH: who each painted person is here for. Its OWN seeded
  // stream again (hashSeed(seed, "crowd-favour", stage)), for the same reason
  // 4.7's painting did: the people and their paintings stay byte-identical to
  // what every pre-5.3 pin measured, and a favourite can never move a route.
  // The house lean is drawn once per round, so one round can be a 5/11 room
  // and the next a 9/7 room rather than every round splitting exactly in half.
  let homeLean = 0.5;
  if (characters) {
    const favourRng = new DeterministicRng(hashSeed(seed, "crowd-favour", stageId));
    homeLean = 0.34 + favourRng.nextFloat() * 0.32;
    // Dealt from an exact deck and shuffled, not flipped per person: eight
    // independent coins on Somerset's eight bystanders lands on 7/1 often
    // enough to lose the whole effect (seed 42 did), and the point of the
    // favourite is that BOTH halves are on screen for every hit.
    const home = Math.round(people.length * homeLean);
    const deck = people.map((_, index) => (index < home ? 0 : 1));
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(favourRng.nextFloat() * (index + 1));
      const held = deck[index];
      deck[index] = deck[swap];
      deck[swap] = held;
    }
    people.forEach((person, index) => {
      person.sprite.favourite = deck[index];
      // How hard they take it: scales the wince tilt and the flinch duck, so
      // the crowd is not one animation played at one amplitude.
      person.sprite.loyalty = 0.55 + favourRng.nextFloat() * 0.45;
    });
    for (const group of scuffles) group.favourite = favourRng.nextFloat() < homeLean ? 0 : 1;
  }
  return {
    stageId,
    variant: variantId,
    sheetVariant: crowdSheetVariant(variantId),
    grade: CROWD_SPRITE_BORROW[variantId]?.grade || "",
    // A variant with no sheet family of its own has no vector look designed
    // for it either: Somerset's plate is photoreal, and the fallback arcade
    // figure would sit on it as a cut-out. Until the borrowed sheets land,
    // these people simply are not drawn.
    paintedOnly: Boolean(variant.spriteBorrow),
    parallax: variant.parallax || 0,
    homeLean,
    seed,
    minX,
    maxX,
    span,
    people,
    cats,
    scuffles,
    kegs: variantId === "tailgate" ? 6 : 0,
    embeddedPeople: variant.embeddedPeople || 0,
    embeddedPose: variant.embeddedPose || "",
  };
}

/** Seeded stray-cat movement for the vacant lot. */
export function catPosition(cat, frame, span, minX, reaction = 0) {
  const cycle = (frame + cat.pauseOffset) % cat.pausePeriod;
  const startled = reaction > 0.18;
  const paused = !startled && cycle < cat.pauseLength;
  const cycles = Math.floor((frame + cat.pauseOffset) / cat.pausePeriod);
  const movingFrames = frame - cycles * cat.pauseLength - (paused ? cycle : cat.pauseLength);
  const speed = cat.pace * (startled ? 2.7 + reaction * 0.8 : 0.55);
  let x = cat.originX + cat.direction * Math.max(0, movingFrames) * speed;
  x = ((x - minX) % span + span) % span + minX;
  return {
    x,
    paused,
    gait: paused ? 0 : frame * speed * 0.16 + cat.gaitPhase,
    startled,
  };
}

/** Several simultaneous fight loops, each with its own kind, place and phase. */
function createScuffles(rng, minX, span, kinds = SCUFFLE_KINDS, count = 5, spots = null) {
  const groups = [];
  for (let index = 0; index < count; index += 1) {
    const kind = kinds[Math.floor(rng.nextFloat() * kinds.length) % kinds.length];
    const slot = (index + 0.15 + rng.nextFloat() * 0.7) / count;
    const spot = spots?.[index] || null;
    groups.push({
      kind: kind.id,
      period: kind.period,
      members: kind.members,
      reach: kind.reach,
      x: spot ? spot.x : Math.round(minX + slot * span),
      y: spot ? spot.y : 470 + Math.floor(rng.nextFloat() * 56),
      scale: 0.78 + rng.nextFloat() * 0.46,
      // Independent offsets and speeds so no two loops beat together.
      offset: Math.floor(rng.nextFloat() * kind.period),
      speed: 0.72 + rng.nextFloat() * 0.7,
      flip: rng.nextFloat() < 0.5 ? -1 : 1,
      shirts: [pick(rng, FAN_COLOURS), pick(rng, FAN_COLOURS), pick(rng, FAN_COLOURS)],
    });
  }
  return groups;
}

/** Phase of one scuffle loop on a given frame, in 0..1. */
export function scufflePhase(group, frame) {
  return (((frame * group.speed + group.offset) % group.period) + group.period) % group.period / group.period;
}

/**
 * Where a pedestrian is on a given frame, including their pause rhythm.
 * Frame-driven rather than wall-clock, so replays reproduce it exactly.
 */
export function crowdPosition(person, layer, frame, span, minX) {
  // v5.3 CROWD DEPTH: a stationed person does not walk the band. They stand
  // where the plate says a person stands and shift a few px either side of it
  // (roam 0 = rooted), so they never stride across the fight lane or off
  // their own doorway.
  if (person.stationed) {
    const cycle = (frame + person.pauseOffset) % person.pausePeriod;
    const paused = person.roam === 0 || cycle < person.pauseLength;
    const sway = person.roam
      ? Math.sin((frame + person.pauseOffset) * 0.006 * person.pace + person.gaitPhase) * person.roam
      : 0;
    return {
      x: person.originX + sway,
      paused,
      gait: paused ? 0 : frame * layer.speed * person.pace * 0.09 + person.gaitPhase,
    };
  }
  const cycle = (frame + person.pauseOffset) % person.pausePeriod;
  const paused = cycle < person.pauseLength;
  // Distance walked so far, with paused stretches removed.
  const cycles = Math.floor((frame + person.pauseOffset) / person.pausePeriod);
  const movingFrames = frame - cycles * person.pauseLength - (paused ? cycle : person.pauseLength);
  const distance = Math.max(0, movingFrames) * layer.speed * person.pace * 0.42;
  let x = person.originX + person.direction * distance;
  // Wrap through the band so the street never empties.
  x = ((x - minX) % span + span) % span + minX;
  return { x, paused, gait: paused ? 0 : (frame * layer.speed * person.pace * 0.09 + person.gaitPhase) };
}

// --- v5.3 CROWD DEPTH: who a hit was for, and what it does to one person --
//
// Before 5.3 `state.crowdReaction` was one scalar with no author: a hit by
// either fighter threw the same arms up on the same people. It now carries
// the side that landed it, and every painted person carries a per-round
// favourite, so ONE hit reads as two crowds — the favourite's half up on the
// cheer cell, the rival's half hunched onto the weight-shift cell and tilted
// away from the fight. The flinch is the third read: a wall splat or a big
// hit close to a person shoves them back whoever they are here for.
//
// Everything below is pure and frame-driven: the 2D draw, the CINEMA 3D
// billboards and the node traces all resolve a member through crowdMemberMood
// so the two renderers can never disagree about who is cheering.

export const CROWD_MOOD_TILT = Object.freeze({
  // Radians. A winced-at hit leans a billboard away from the fight; a cheer
  // leans a little INTO it. Small on purpose: these are people in a crowd,
  // not a wave — 0.16 rad is ~9 degrees, plainly visible at near scale
  // without reading as a falling sprite.
  wince: 0.16,
  cheer: 0.05,
  flinch: 0.26,
});

export const CROWD_FLINCH = Object.freeze({
  // A wall splat / near KO blow that lands within `radius` sim px of a person
  // rocks them for `ticks`, hardest at the impact and gone by the edge.
  radius: 300,
  ticks: 26,
  duckPx: 6,
});

/**
 * How hard the person at `personX` is rocked by an impact at `impactX` that
 * landed `age` ticks ago. 0 outside the radius or the window.
 */
export function crowdFlinchLevel(personX, impactX, age, { radius = CROWD_FLINCH.radius, ticks = CROWD_FLINCH.ticks } = {}) {
  if (!(age >= 0) || age >= ticks) return 0;
  const distance = Math.abs(personX - impactX);
  if (distance >= radius) return 0;
  const near = 1 - distance / radius;
  const fresh = 1 - age / ticks;
  return near * near * fresh;
}

/**
 * The reaction one painted member is in on this tick.
 *
 * `stirSide` is the side that landed the stir (-1 for an authorless one — a
 * taunt, a stage beat — which keeps exactly the pre-5.3 behaviour: everyone
 * past threshold cheers). `holdColumn` is the KO-hold column when the hold
 * owns the crowd (crowdKoHoldColumn), -1 otherwise. `awaySign` is +1 or -1:
 * which way "away from the impact" points for this person, so the wince and
 * the flinch tilt off the fight rather than all one way.
 *
 * Returns the painted column, the mood, the signed tilt in radians and the
 * duck in sim px at scale 1.
 */
export function crowdMemberMood(sprite, {
  reaction = 0,
  stirSide = -1,
  holdColumn = -1,
  flinch = 0,
  awaySign = 1,
  reducedMotion = false,
} = {}) {
  const idle = { mood: "idle", column: -1, tilt: 0, duck: 0 };
  if (!sprite) return idle;
  // The flinch outranks everything: a body just hit the wall next to them.
  if (flinch > 0.02) {
    return {
      mood: "flinch",
      column: CROWD_SPRITE_COLUMNS.shift,
      tilt: reducedMotion ? 0 : awaySign * CROWD_MOOD_TILT.flinch * flinch * sprite.loyalty,
      duck: reducedMotion ? 0 : CROWD_FLINCH.duckPx * flinch * sprite.loyalty,
    };
  }
  const engaged = holdColumn >= 0 || reaction > sprite.reactThreshold;
  if (!engaged) return idle;
  // An authorless stir, or a hit by the person's own fighter: arms up. During
  // the KO hold the hold's own pump column wins, so a held cheer still
  // breathes; a rival's supporter pumps in the same rhythm but on the shift
  // cell, hunched, which is what the hold looks like from the losing half.
  const rival = stirSide >= 0 && sprite.favourite !== stirSide;
  if (!rival) {
    return {
      mood: "cheer",
      column: holdColumn >= 0 ? holdColumn : CROWD_SPRITE_COLUMNS.cheer,
      tilt: reducedMotion ? 0 : -awaySign * CROWD_MOOD_TILT.cheer,
      duck: 0,
    };
  }
  const bite = Math.min(1, (reaction - sprite.reactThreshold) * 2 + 0.35);
  return {
    mood: "wince",
    column: CROWD_SPRITE_COLUMNS.shift,
    tilt: reducedMotion ? 0 : awaySign * CROWD_MOOD_TILT.wince * bite * sprite.loyalty,
    duck: 0,
  };
}

/** Snapshot for tests and the debug overlay. */
export function crowdSnapshot(crowd, frame, { viewLeft = 0, viewRight = 1280 } = {}) {
  if (!crowd) return { total: 0, visible: 0, layers: {}, postures: {} };
  const layers = {};
  const postures = {};
  let visible = 0;
  for (const person of crowd.people) {
    const layer = CROWD_LAYERS.find((entry) => entry.id === person.layer);
    const { x } = crowdPosition(person, layer, frame, crowd.span, crowd.minX);
    const onScreen = x > viewLeft - 60 && x < viewRight + 60;
    if (onScreen) {
      visible += 1;
      layers[person.layer] = (layers[person.layer] || 0) + 1;
      postures[person.posture] = (postures[person.posture] || 0) + 1;
    }
  }
  let visibleCats = 0;
  for (const cat of crowd.cats || []) {
    const { x } = catPosition(cat, frame, crowd.span, crowd.minX);
    if (x > viewLeft - 40 && x < viewRight + 40) visibleCats += 1;
  }
  const embeddedPeople = crowd.embeddedPeople || 0;
  return {
    total: crowd.people.length + embeddedPeople,
    visible: visible + visibleCats + embeddedPeople,
    embeddedPeople,
    embeddedPose: crowd.embeddedPose || "",
    cats: (crowd.cats || []).length,
    visibleCats,
    layers,
    postures,
    variant: crowd.variant,
    kegs: crowd.kegs || 0,
    scuffles: (crowd.scuffles || []).length,
    scuffleKinds: [...new Set((crowd.scuffles || []).map((group) => group.kind))],
    spriteBank: CROWD_SPRITE_BANKS[crowd.variant] || 0,
    sheetVariant: crowd.sheetVariant || crowd.variant,
    grade: crowd.grade || "",
    stationed: crowd.people.filter((person) => person.stationed).length,
    homeLean: crowd.homeLean ?? 0.5,
    favourites: [
      crowd.people.filter((person) => person.sprite?.favourite === 0).length,
      crowd.people.filter((person) => person.sprite?.favourite === 1).length,
    ],
    spriteCharacters: new Set(crowd.people.map((person) => person.sprite?.character).filter((c) => c !== undefined && c !== null)).size,
  };
}
