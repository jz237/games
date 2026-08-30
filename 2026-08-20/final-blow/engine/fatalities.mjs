export const GRAPHIC_FATALITY_FAMILIES = Object.freeze([
  "rupture",
  "slice",
  "crush",
  "dissolve",
  "electrocute",
  "launch",
  "glitch",
  "implode",
]);

export const GRAPHIC_FATALITY_LIMBS = Object.freeze([
  "left-arm",
  "right-arm",
  "left-leg",
  "right-leg",
]);

const profile = (values) => Object.freeze({
  blood: 1,
  separation: 1,
  angle: 0,
  pieces: 3,
  rating: "R",
  palette: Object.freeze(["#d1081c", "#65000d"]),
  ...values,
});

export const GRAPHIC_FATALITIES = Object.freeze({
  deathblow: Object.freeze([
    profile({
      id: "faultline-rupture",
      title: "FAULTLINE RUPTURE",
      family: "rupture",
      caption: "PIZZA-CUTTER ARM AVULSION",
      special: "WHOLE PIZZA",
      projectileId: "pizza",
      projectileSetup: "PIZZA WHEEL SPIN-UP",
      projectileAction: "PIZZA-CUTTER ARM LOCK",
      projectileFinale: "PIZZA WHEEL ARM SEVER",
      limb: "right-arm",
      device: "RUSTED PIZZA-WHEEL VISE",
      blood: 1.6,
      separation: 1.2,
      pieces: 4,
    }),
    profile({
      id: "aftershock-burial",
      title: "AFTERSHOCK BURIAL",
      family: "crush",
      caption: "PIZZA-DISC LEG SHEAR",
      special: "WHOLE PIZZA",
      projectileId: "pizza",
      projectileSetup: "OVEN-DECK PIZZA SPIN",
      projectileAction: "PIZZA EDGE LEG PIN",
      projectileFinale: "PIZZA DISC LEG SHEAR",
      limb: "left-leg",
      device: "OVEN-DOOR FLOOR LOCK",
      blood: 1.35,
      separation: 0.7,
      pieces: 3,
    }),
  ]),
  jez: Object.freeze([
    profile({
      id: "neon-guillotine",
      title: "NEON GUILLOTINE",
      family: "slice",
      caption: "MOUSE-CABLE ARM GUILLOTINE",
      special: "CORDED MOUSE",
      projectileId: "mouse",
      projectileSetup: "MOUSE CABLE LAUNCH",
      projectileAction: "CORDED MOUSE ARM REEL",
      projectileFinale: "MOUSE-CABLE ARM SEVER",
      limb: "left-arm",
      device: "CORDED-MOUSE STOCKS",
      blood: 1.25,
      separation: 1.1,
      angle: -0.58,
      pieces: 3,
      palette: Object.freeze(["#ff144f", "#5b0021"]),
    }),
    profile({
      id: "vinyl-wrap",
      title: "VINYL WRAP",
      family: "slice",
      caption: "MOUSE-CORD LEG DISSECTION",
      special: "CORDED MOUSE",
      projectileId: "mouse",
      projectileSetup: "MOUSE CABLE LAUNCH",
      projectileAction: "CORDED MOUSE LEG CINCH",
      projectileFinale: "MOUSE-CORD LEG SHEAR",
      limb: "right-leg",
      device: "MOUSE-CABLE TOURNIQUET",
      blood: 1.4,
      separation: 1.35,
      angle: 0.42,
      pieces: 5,
      palette: Object.freeze(["#ff2364", "#790025"]),
    }),
  ]),
  alan: Object.freeze([
    profile({
      id: "heavy-hand-crush",
      title: "THE HEAVY HAND",
      family: "crush",
      caption: "LOOGIE-BONDED ARM TEAR",
      special: "LOOGIES",
      projectileId: "loogie",
      projectileSetup: "LOOGIE PRESSURE PRIME",
      projectileAction: "LOOGIE ARM BOND",
      projectileFinale: "LOOGIE-BONDED ARM RIP",
      limb: "right-arm",
      device: "LOOGIE-BOND CHAIN FRAME",
      blood: 1.35,
      separation: 0.85,
      pieces: 4,
    }),
    profile({
      id: "south-street-shutdown",
      title: "SOUTH STREET SHUTDOWN",
      family: "rupture",
      caption: "LOOGIE-LOCKED LEG BREAK",
      special: "LOOGIES",
      projectileId: "loogie",
      projectileSetup: "LOOGIE PRESSURE PRIME",
      projectileAction: "LOOGIE LEG BOND",
      projectileFinale: "LOOGIE-BONDED LEG SHEAR",
      limb: "left-leg",
      device: "LOOGIE-PRESSURE BREAK TABLE",
      blood: 1.5,
      separation: 1.05,
      angle: 0.22,
      pieces: 4,
    }),
  ]),
  post: Object.freeze([
    profile({
      id: "full-coverage",
      title: "FULL COVERAGE",
      family: "dissolve",
      caption: "WIRE-SNARE ARM STRIPPING",
      special: "TANGLED WIRES",
      projectileId: "wires",
      projectileSetup: "WIRE BALL DEPLOY",
      projectileAction: "TANGLED-WIRE ARM SNARE",
      projectileFinale: "WIRE-WINCH ARM SEVER",
      limb: "left-arm",
      device: "TANGLED-WIRE RESTRAINT",
      blood: 1.15,
      separation: 0.9,
      pieces: 6,
      palette: Object.freeze(["#d80d28", "#6e0014"]),
    }),
    profile({
      id: "wet-paint",
      title: "WET PAINT",
      family: "dissolve",
      caption: "WIRE-WINCH LEG REMOVAL",
      special: "TANGLED WIRES",
      projectileId: "wires",
      projectileSetup: "WIRE BALL DEPLOY",
      projectileAction: "TANGLED-WIRE LEG SNARE",
      projectileFinale: "WIRE-WINCH LEG SEVER",
      limb: "right-leg",
      device: "TANGLED-WIRE CABLE SNARE",
      blood: 1.45,
      separation: 1.1,
      pieces: 8,
      palette: Object.freeze(["#f01839", "#750019"]),
    }),
  ]),
  benny: Object.freeze([
    profile({
      id: "circuit-breaker",
      title: "CIRCUIT BREAKER",
      family: "electrocute",
      caption: "X-ACTO ARM SEVER",
      special: "X-ACTO KNIFE",
      projectileId: "xacto",
      projectileSetup: "X-ACTO BLADE EXPOSED",
      projectileAction: "X-ACTO ARM SCORE",
      projectileFinale: "X-ACTO ARM SEVER",
      limb: "right-arm",
      device: "X-ACTO CUTTING SHACKLES",
      blood: 0.85,
      separation: 0.75,
      pieces: 4,
      palette: Object.freeze(["#f51f39", "#370009"]),
    }),
    profile({
      id: "last-call-overload",
      title: "BENNY'S LAST CALL",
      family: "electrocute",
      caption: "X-ACTO LEG DETACHMENT",
      special: "X-ACTO KNIFE",
      projectileId: "xacto",
      projectileSetup: "X-ACTO BLADE EXPOSED",
      projectileAction: "X-ACTO LEG SCORE",
      projectileFinale: "X-ACTO LEG SEVER",
      limb: "left-leg",
      device: "X-ACTO ANKLE CLAMP",
      blood: 1.25,
      separation: 1.2,
      pieces: 6,
      palette: Object.freeze(["#ff1738", "#69000d"]),
    }),
  ]),
  donald: Object.freeze([
    profile({
      id: "golden-send-off",
      title: "GOLDEN SEND-OFF",
      family: "launch",
      caption: "GOLF-BALL ARM LAUNCH",
      special: "GOLF BALL",
      projectileId: "golfball",
      projectileSetup: "GOLF BALL ON THE TEE",
      projectileAction: "GOLF BALL ARM DRIVE",
      projectileFinale: "GOLF-BALL ARM LAUNCH",
      limb: "left-arm",
      device: "GILDED GOLF-BALL STOCKS",
      blood: 1.25,
      separation: 1.45,
      angle: -0.32,
      pieces: 3,
    }),
    profile({
      id: "youre-fired",
      title: "YOU'RE FIRED!",
      family: "launch",
      caption: "GOLF-BALL LEG DISASSEMBLY",
      special: "GOLF BALL",
      projectileId: "golfball",
      projectileSetup: "GOLF BALL RICOCHET",
      projectileAction: "GOLF BALL LEG DRIVE",
      projectileFinale: "GOLF-BALL LEG LAUNCH",
      limb: "right-leg",
      device: "GOLDEN TEE LEG VISE",
      blood: 1.45,
      separation: 1.15,
      angle: 0.5,
      pieces: 5,
    }),
  ]),
  cyraxx: Object.freeze([
    profile({
      id: "feedback-blackout",
      title: "FEEDBACK BLACKOUT",
      family: "glitch",
      caption: "BED-BUG ARM DELETION",
      special: "BED BUGS",
      projectileId: "bedbugs",
      projectileSetup: "BED-BUG SWARM RELEASE",
      projectileAction: "BED-BUG ARM INFESTATION",
      projectileFinale: "BED-BUG ARM STRIP",
      limb: "right-arm",
      device: "BED-BUG SWARM RESTRAINT",
      blood: 1.1,
      separation: 1.05,
      pieces: 7,
      palette: Object.freeze(["#e30b38", "#530020"]),
    }),
    profile({
      id: "internet-meltdown",
      title: "INTERNET MELTDOWN",
      family: "glitch",
      caption: "BED-BUG LEG STRIPPING",
      special: "BED BUGS",
      projectileId: "bedbugs",
      projectileSetup: "BED-BUG SWARM RELEASE",
      projectileAction: "BED-BUG LEG INFESTATION",
      projectileFinale: "BED-BUG LEG STRIP",
      limb: "left-leg",
      device: "INFESTATION FLOOR PORT",
      blood: 1.35,
      separation: 1.35,
      pieces: 10,
      palette: Object.freeze(["#ff174f", "#66002d"]),
    }),
  ]),
  ali: Object.freeze([
    profile({
      id: "mic-drop-implosion",
      title: "MIC DROP",
      family: "implode",
      caption: "VINYL-BLADE ARM IMPLOSION",
      special: "VINYL RECORD",
      projectileId: "vinyl",
      projectileSetup: "VINYL RECORD SPIN-UP",
      projectileAction: "VINYL ARM GROOVE",
      projectileFinale: "VINYL-BLADE ARM SEVER",
      limb: "left-arm",
      device: "VINYL-GROOVE ARM CINCH",
      blood: 1.2,
      separation: 0.9,
      pieces: 5,
      palette: Object.freeze(["#ee0a32", "#660015"]),
    }),
    profile({
      id: "west-staines-massive",
      title: "WEST STAINES MASSIVE",
      family: "implode",
      caption: "VINYL-DISC LEG DETONATION",
      special: "VINYL RECORD",
      projectileId: "vinyl",
      projectileSetup: "VINYL RECORD SPIN-UP",
      projectileAction: "VINYL LEG GROOVE",
      projectileFinale: "VINYL-DISC LEG SEVER",
      limb: "right-leg",
      device: "WEST STAINES RECORD CAGE",
      blood: 1.55,
      separation: 1.45,
      pieces: 8,
      palette: Object.freeze(["#ff1245", "#720019"]),
    }),
  ]),
  // R2.0 FAMILY wave 17 — the Pinelands Devil. Both profiles ride his hex
  // charm (the audit demands the assigned projectile own every beat): the
  // charm binds the limb, then the wings shear or the hoof comes down.
  devil: Object.freeze([
    profile({
      id: "wing-shear",
      title: "WING SHEAR",
      family: "slice",
      caption: "HEX-CHARM ARM SHEAR",
      special: "HEX CHARM",
      projectileId: "charm",
      projectileSetup: "HEX CHARM FLUNG",
      projectileAction: "CHARM CURSE ARM BIND",
      projectileFinale: "HEX-CHARM ARM SHEAR",
      limb: "right-arm",
      device: "LEATHERWING SHEAR FRAME",
      blood: 1.3,
      separation: 1.15,
      angle: -0.4,
      pieces: 4,
      palette: Object.freeze(["#e00e2e", "#5c0016"]),
    }),
    profile({
      id: "hoof-stomp",
      title: "HOOF STOMP",
      family: "crush",
      caption: "CHARM-PINNED LEG STOMP",
      special: "HEX CHARM",
      projectileId: "charm",
      projectileSetup: "HEX CHARM DROPPED",
      projectileAction: "CHARM HEX LEG PIN",
      projectileFinale: "CHARM-PINNED LEG CRUSH",
      limb: "left-leg",
      device: "PINE-ROOT STOMP BRACE",
      blood: 1.45,
      separation: 0.85,
      angle: 0.3,
      pieces: 5,
      palette: Object.freeze(["#cf0a24", "#470010"]),
    }),
  ]),
  // R2.0 FAMILY wave 16 — the Commissioner stops borrowing DeathBlow's
  // finishers. Both profiles ride his steel-cane throwable (the audit demands
  // the assigned projectile owns every beat): one pure cane execution, one
  // staged around the black-book ledger.
  commissioner: Object.freeze([
    profile({
      id: "closed-session",
      title: "CLOSED SESSION",
      family: "crush",
      caption: "STEEL-CANE ARM SHATTER",
      special: "STEEL CANE",
      projectileId: "cane",
      projectileSetup: "STEEL CANE GAVEL RAP",
      projectileAction: "CANE-HOOK ARM LOCK",
      projectileFinale: "STEEL-CANE ARM SHATTER",
      limb: "right-arm",
      device: "STEEL-CANE ARM BRACE",
      blood: 1.4,
      separation: 0.95,
      angle: -0.24,
      pieces: 4,
      palette: Object.freeze(["#c9081f", "#4a000e"]),
    }),
    profile({
      id: "final-authority-ledger",
      title: "FINAL AUTHORITY",
      family: "rupture",
      caption: "LEDGER-PRESS LEG SEVER",
      special: "STEEL CANE",
      projectileId: "cane",
      projectileSetup: "BLACK-BOOK LEDGER OPENED",
      projectileAction: "CANE-PIN LEDGER PRESS",
      projectileFinale: "LEDGER-PRESS LEG SEVER",
      limb: "left-leg",
      device: "BLACK-BOOK LEDGER PRESS",
      blood: 1.5,
      separation: 1.2,
      angle: 0.34,
      pieces: 5,
      palette: Object.freeze(["#d6102b", "#560014"]),
    }),
  ]),
});

export function getGraphicFatality(fighterId, variant = 0) {
  const profiles = GRAPHIC_FATALITIES[fighterId] || GRAPHIC_FATALITIES.deathblow;
  const index = Math.abs(Math.trunc(Number(variant) || 0)) % profiles.length;
  return profiles[index];
}

export function graphicFatalitySnapshot(fighterId, variant = 0, elapsed = 0, impactTime = 0) {
  const fatality = getGraphicFatality(fighterId, variant);
  const aftermath = Math.max(0, Number(elapsed) - Number(impactTime));
  return {
    ...fatality,
    aftermath,
    reveal: Math.min(1, aftermath / 0.42),
    settle: Math.min(1, aftermath / 1.15),
  };
}

export function auditGraphicFatalities(fighters = Object.keys(GRAPHIC_FATALITIES)) {
  const ids = new Set();
  const errors = [];
  for (const fighter of fighters) {
    const fighterId = typeof fighter === "string" ? fighter : fighter?.id;
    const assignedProjectile = typeof fighter === "string" ? null : fighter?.projectile;
    const profiles = GRAPHIC_FATALITIES[fighterId];
    if (!profiles || profiles.length !== 2) {
      errors.push(`${fighterId}:expected-two-fatalities`);
      continue;
    }
    for (const fatality of profiles) {
      if (ids.has(fatality.id)) errors.push(`${fighterId}:duplicate:${fatality.id}`);
      ids.add(fatality.id);
      if (!GRAPHIC_FATALITY_FAMILIES.includes(fatality.family)) errors.push(`${fighterId}:family:${fatality.family}`);
      if (!fatality.title || !fatality.caption) errors.push(`${fighterId}:missing-copy:${fatality.id}`);
      if (!fatality.special) errors.push(`${fighterId}:missing-special:${fatality.id}`);
      if (!fatality.projectileId) errors.push(`${fighterId}:missing-projectile:${fatality.id}`);
      for (const field of ["projectileSetup", "projectileAction", "projectileFinale"]) {
        if (!fatality[field]) errors.push(`${fighterId}:missing-${field}:${fatality.id}`);
      }
      if (assignedProjectile && (fatality.special !== assignedProjectile.name
        || fatality.projectileId !== assignedProjectile.id)) {
        errors.push(`${fighterId}:wrong-projectile:${fatality.id}`);
      }
      if (!GRAPHIC_FATALITY_LIMBS.includes(fatality.limb)) errors.push(`${fighterId}:limb:${fatality.id}`);
      if (!fatality.device) errors.push(`${fighterId}:missing-device:${fatality.id}`);
      if (fatality.rating !== "R") errors.push(`${fighterId}:rating:${fatality.id}`);
      for (const field of ["blood", "separation", "pieces"]) {
        if (!Number.isFinite(fatality[field]) || fatality[field] <= 0) errors.push(`${fighterId}:${fatality.id}:${field}`);
      }
    }
  }
  return { fighters: fighters.length, fatalities: ids.size, errors };
}
