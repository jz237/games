/**
 * Battle scars: what the floor, the walls and the furniture keep after an
 * impact.
 *
 * Until 5.3 every mark on every stage was the same chalky scuff plus a dark
 * crack polyline, pushed from exactly one call site (the knockdown floor
 * impact) — the same grey crack on the Vet's asphalt, the buffet's tile, the
 * boardwalk's planks and a wet pool deck, and nothing at all at the arena
 * edge where a wall splat had just happened. "The arena wears the fight"
 * stopped at a grey crack.
 *
 * This module owns the model, so both renderers agree on it:
 *   - which SURFACE each stage's floor is;
 *   - which KIND of mark a cause (knockdown / wall splat / stage-weapon
 *     impact) leaves on that surface, and which one a specific weapon leaves
 *     regardless of the floor (a bottle always leaves glass);
 *   - the geometry of one scar, built from an injected 0..1 random so the
 *     caller keeps ownership of its own stream (game.js hands over
 *     visualRandom, tests hand over a counted sequence);
 *   - a compact decal view of the list for the CINEMA 3D bridge.
 *
 * Everything here is pure. game.js owns the array, the cap and the rollback
 * guard; renderer/three/scar-decals.mjs reads the decal view.
 */

// The material the fighters land on, per stage id.
export const STAGE_SURFACES = Object.freeze({
  somerset: "asphalt",   // wet street asphalt under the El
  vet: "asphalt",        // stadium parking lot, painted lines and broken glass
  janney: "rubble",      // a vacant lot: dirt, weeds, broken brick
  buffet: "tile",        // catering tile and a wet mop line
  wildwood: "planks",    // boardwalk planking
  cruise: "poolDeck",    // painted non-slip deck, always a little wet
});

// The kinds themselves. Colours live here so the 2D canvas pass and the 3D
// decal textures are painted from ONE palette: a scar cannot look like two
// different things in the two renderers.
export const SCAR_KINDS = Object.freeze({
  // The 5.0 mark, kept: a dark crack over a chalky bruise.
  crack: Object.freeze({
    ink: "rgba(10,9,8,0.92)", edge: "rgba(188,176,156,0.42)",
    scuff: "rgba(196,184,164,0.55)", debris: 0, debrisColor: "#b9ad97",
    lines: 1, spread: 1, label: "cracked",
  }),
  // A body dragged sideways: a long smeared streak, barely any crack.
  skid: Object.freeze({
    ink: "rgba(24,20,16,0.6)", edge: "rgba(210,198,176,0.3)",
    scuff: "rgba(150,138,120,0.62)", debris: 0, debrisColor: "#8d8474",
    lines: 1, spread: 1.6, label: "skidded",
  }),
  // Wet floors: a dark irregular puddle with a bright rim, no crack at all.
  splash: Object.freeze({
    ink: "rgba(28,86,104,0.55)", edge: "rgba(180,236,255,0.5)",
    scuff: "rgba(64,150,180,0.5)", debris: 3, debrisColor: "#9fe4ff",
    lines: 0, spread: 1.35, label: "splashed",
  }),
  // Something hard and heavy: a compact bruise with a chipped rim.
  dent: Object.freeze({
    ink: "rgba(16,13,10,0.8)", edge: "rgba(228,214,188,0.5)",
    scuff: "rgba(120,108,92,0.66)", debris: 4, debrisColor: "#cbbda2",
    lines: 1, spread: 0.62, label: "dented",
  }),
  // Glass: a pale star and a scatter of bright chips.
  // Glass reads as the CHIPS, not as a big pale star: the three-armed
  // fracture is short and dim (measured at 0.9 spread it drew as white
  // scribble on the buffet tile), the scatter of bright bits does the work.
  shards: Object.freeze({
    ink: "rgba(198,222,206,0.5)", edge: "rgba(244,255,236,0.34)",
    scuff: "rgba(120,150,120,0.32)", debris: 8, debrisColor: "#dff3d6",
    lines: 3, spread: 0.38, label: "glassed",
  }),
  // Planks: a split running WITH the grain, pale torn fibre either side.
  splinter: Object.freeze({
    ink: "rgba(46,30,18,0.85)", edge: "rgba(214,178,124,0.55)",
    scuff: "rgba(138,104,64,0.5)", debris: 3, debrisColor: "#c79a5e",
    lines: 1, spread: 1.5, label: "splintered",
  }),
  // Food, beer, slush: a flat stain with a couple of solid bits in it.
  spill: Object.freeze({
    ink: "rgba(96,60,22,0.5)", edge: "rgba(214,168,96,0.4)",
    scuff: "rgba(150,104,44,0.55)", debris: 5, debrisColor: "#e8c07a",
    lines: 0, spread: 1.5, label: "spilled",
  }),
});

export const SCAR_CAUSES = Object.freeze(["knockdown", "wall", "weapon"]);

// Per surface, the flavours a cause can leave. The first entry is the common
// one; the roll picks inside the list, so every floor has more than one
// flavour but each still reads as its own material.
const SURFACE_SCARS = Object.freeze({
  asphalt: Object.freeze({
    knockdown: ["crack", "skid", "crack"],
    wall: ["crack", "dent"],
    weapon: ["crack", "dent"],
  }),
  rubble: Object.freeze({
    knockdown: ["skid", "dent", "crack"],
    wall: ["dent", "crack"],
    weapon: ["dent", "skid"],
  }),
  tile: Object.freeze({
    knockdown: ["crack", "spill", "shards"],
    wall: ["crack", "dent"],
    weapon: ["shards", "spill"],
  }),
  planks: Object.freeze({
    knockdown: ["splinter", "skid", "splinter"],
    wall: ["splinter", "dent"],
    weapon: ["splinter", "dent"],
  }),
  poolDeck: Object.freeze({
    knockdown: ["splash", "skid", "splash"],
    wall: ["splash", "dent"],
    weapon: ["splash", "spill"],
  }),
});

// A thrown object leaves ITS OWN mark wherever it lands — glass is glass on
// tile and on planks. Styles not listed fall through to the surface table.
const WEAPON_STYLE_SCARS = Object.freeze({
  bottle: "shards",
  cup: "splash",
  tongs: "dent",
  brick: "dent",
  needle: "crack",
  pigeon: "spill",
});

export function stageSurface(stageId) {
  return STAGE_SURFACES[stageId] || "asphalt";
}

/**
 * Which flavour this impact leaves. `roll` is a 0..1 draw from the caller's
 * own stream; the same roll always picks the same kind.
 */
export function scarKindFor(stageId, cause = "knockdown", { weaponStyle = null, roll = 0 } = {}) {
  if (cause === "weapon" && weaponStyle && WEAPON_STYLE_SCARS[weaponStyle]) {
    return WEAPON_STYLE_SCARS[weaponStyle];
  }
  const table = SURFACE_SCARS[stageSurface(stageId)] || SURFACE_SCARS.asphalt;
  const list = table[cause] || table.knockdown;
  const index = Math.min(list.length - 1, Math.max(0, Math.floor(roll * list.length)));
  return list[index];
}

/**
 * Build one scar. `random` is a () => 0..1 from the caller's stream.
 *
 * `wall` is 0 for a floor mark, -1 / +1 for a mark ON the arena edge (the
 * wall splat's own bruise); a wall scar's geometry stands UP rather than
 * lying squashed into the floor perspective, which is the whole reason the
 * squash factor is a field instead of a constant.
 */
export function makeStageScar({
  x = 0,
  y = 0,
  stageId = "somerset",
  cause = "knockdown",
  weaponStyle = null,
  force = 1,
  tick = 0,
  wall = 0,
  kind = null,
  random = Math.random,
} = {}) {
  const roll = random();
  const chosen = kind || scarKindFor(stageId, cause, { weaponStyle, roll });
  const spec = SCAR_KINDS[chosen] || SCAR_KINDS.crack;
  const heavy = force > 1.02;
  const squash = wall ? 1 : 0.34;
  const points = [[0, 0]];
  const branch = [];
  const segments = 3 + Math.floor(random() * 3);
  const baseAngle = random() * Math.PI * 2;
  let px = 0;
  let py = 0;
  for (let index = 0; index < segments; index += 1) {
    const angle = baseAngle + (random() - 0.5) * 1.9;
    const length = (9 + random() * (heavy ? 24 : 15)) * spec.spread;
    px += Math.cos(angle) * length;
    py += Math.sin(angle) * length * squash;
    points.push([px, py]);
    if (index === 1 && random() < 0.7) {
      const branchAngle = angle + (random() < 0.5 ? 1 : -1) * (0.9 + random() * 0.8);
      branch.push([px, py], [
        px + Math.cos(branchAngle) * (8 + random() * 12),
        py + Math.sin(branchAngle) * (8 + random() * 12) * squash,
      ]);
    }
  }
  // Loose bits: glass chips, splinters, crab legs, slush.
  const debris = [];
  const debrisCount = Math.round(spec.debris * (heavy ? 1.35 : 1));
  for (let index = 0; index < debrisCount; index += 1) {
    const angle = random() * Math.PI * 2;
    const reach = (10 + random() * 26) * spec.spread;
    debris.push({
      x: Math.cos(angle) * reach,
      y: Math.sin(angle) * reach * squash,
      r: 1.6 + random() * 3.4,
      a: random() * Math.PI,
    });
  }
  return {
    tick,
    cause,
    kind: chosen,
    surface: stageSurface(stageId),
    stageId,
    x,
    y,
    wall,
    points,
    branch,
    debris,
    // A wall mark is a whole body arriving at speed: it is wider, much
    // taller (it is not squashed into the floor plane) and reads a shade
    // stronger than a floor scuff, which the eye finds under a fighter.
    scuffW: (26 + force * 22 + random() * 16) * (spec.spread * 0.5 + 0.5) * (wall ? 1.2 : 1),
    scuffH: (5 + random() * 5) * (wall ? 2.4 : 1),
    rot: (random() - 0.5) * (wall ? 0.2 : 0.5),
    alpha: (0.45 + random() * 0.22) * (wall ? 1.3 : 1),
    heavy,
  };
}

/**
 * The CINEMA 3D view of the list: everything the decal layer needs and
 * nothing it does not (no polylines — the 3D pass paints one texture per
 * kind and scales it, so a decal is a quad, not a canvas per scar).
 */
export function scarDecals(scars = []) {
  return scars.map((scar) => ({
    x: scar.x,
    y: scar.y,
    kind: scar.kind,
    surface: scar.surface,
    wall: scar.wall || 0,
    width: scar.scuffW * 2.6,
    rot: scar.rot,
    alpha: scar.alpha,
    heavy: Boolean(scar.heavy),
  }));
}

/** Human-readable one-liner for QA traces. */
export function describeScar(scar) {
  if (!scar) return "";
  const where = scar.wall ? `wall${scar.wall < 0 ? "L" : "R"}` : "floor";
  return `${scar.cause}/${scar.kind}@${where}:${Math.round(scar.x)}`;
}
