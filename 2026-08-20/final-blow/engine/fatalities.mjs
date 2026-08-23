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
      caption: "SEISMIC ARM AVULSION",
      special: "WHOLE PIZZA",
      projectileId: "pizza",
      limb: "right-arm",
      device: "RUSTED FAULTLINE VISE",
      blood: 1.6,
      separation: 1.2,
      pieces: 4,
    }),
    profile({
      id: "aftershock-burial",
      title: "AFTERSHOCK BURIAL",
      family: "crush",
      caption: "GROUND-ZERO LEG SHEAR",
      special: "WHOLE PIZZA",
      projectileId: "pizza",
      limb: "left-leg",
      device: "AFTERSHOCK FLOOR LOCK",
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
      caption: "NEON ARM GUILLOTINE",
      special: "CORDED MOUSE",
      projectileId: "mouse",
      limb: "left-arm",
      device: "NEON SIGNBLADE STOCKS",
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
      caption: "RAZOR-RIBBON LEG DISSECTION",
      special: "CORDED MOUSE",
      projectileId: "mouse",
      limb: "right-leg",
      device: "VINYL WIRE TOURNIQUET",
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
      caption: "SOUTH STREET ARM TEAR",
      special: "LOOGIES",
      projectileId: "loogie",
      limb: "right-arm",
      device: "HEAVYWEIGHT CHAIN FRAME",
      blood: 1.35,
      separation: 0.85,
      pieces: 4,
    }),
    profile({
      id: "south-street-shutdown",
      title: "SOUTH STREET SHUTDOWN",
      family: "rupture",
      caption: "SOUTH STREET LEG BREAKDOWN",
      special: "LOOGIES",
      projectileId: "loogie",
      limb: "left-leg",
      device: "SOUTH STREET SLAM TABLE",
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
      caption: "PRESSURIZED ARM STRIPPING",
      special: "TANGLED WIRES",
      projectileId: "wires",
      limb: "left-arm",
      device: "PAINT-PRESSURE RESTRAINT",
      blood: 1.15,
      separation: 0.9,
      pieces: 6,
      palette: Object.freeze(["#d80d28", "#6e0014"]),
    }),
    profile({
      id: "wet-paint",
      title: "WET PAINT",
      family: "dissolve",
      caption: "LIQUEFIED LEG REMOVAL",
      special: "TANGLED WIRES",
      projectileId: "wires",
      limb: "right-leg",
      device: "WET-PAINT CABLE SNARE",
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
      caption: "ARC-FLASH ARM SEVER",
      special: "X-ACTO KNIFE",
      projectileId: "xacto",
      limb: "right-arm",
      device: "BREAKER-BOX SHACKLES",
      blood: 0.85,
      separation: 0.75,
      pieces: 4,
      palette: Object.freeze(["#f51f39", "#370009"]),
    }),
    profile({
      id: "last-call-overload",
      title: "BENNY'S LAST CALL",
      family: "electrocute",
      caption: "OVERLOADED LEG DETACHMENT",
      special: "X-ACTO KNIFE",
      projectileId: "xacto",
      limb: "left-leg",
      device: "LIVE-WIRE ANKLE CLAMP",
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
      caption: "BACK-NINE ARM LAUNCH",
      special: "GOLF BALL",
      projectileId: "golfball",
      limb: "left-arm",
      device: "GILDED CLUBHOUSE STOCKS",
      blood: 1.25,
      separation: 1.45,
      angle: -0.32,
      pieces: 3,
    }),
    profile({
      id: "youre-fired",
      title: "YOU'RE FIRED!",
      family: "launch",
      caption: "GOLDEN LEG DISASSEMBLY",
      special: "GOLF BALL",
      projectileId: "golfball",
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
      caption: "SIGNAL-SLICE ARM DELETION",
      special: "BED BUGS",
      projectileId: "bedbugs",
      limb: "right-arm",
      device: "FEEDBACK CABLE RESTRAINT",
      blood: 1.1,
      separation: 1.05,
      pieces: 7,
      palette: Object.freeze(["#e30b38", "#530020"]),
    }),
    profile({
      id: "internet-meltdown",
      title: "INTERNET MELTDOWN",
      family: "glitch",
      caption: "CORRUPTED LEG BUFFER",
      special: "BED BUGS",
      projectileId: "bedbugs",
      limb: "left-leg",
      device: "BUFFER-LOCK FLOOR PORT",
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
      caption: "BASS-PRESSURE ARM IMPLOSION",
      special: "VINYL RECORD",
      projectileId: "vinyl",
      limb: "left-arm",
      device: "MIC-CABLE ARM CINCH",
      blood: 1.2,
      separation: 0.9,
      pieces: 5,
      palette: Object.freeze(["#ee0a32", "#660015"]),
    }),
    profile({
      id: "west-staines-massive",
      title: "WEST STAINES MASSIVE",
      family: "implode",
      caption: "MAXIMUM BASS LEG DETONATION",
      special: "VINYL RECORD",
      projectileId: "vinyl",
      limb: "right-leg",
      device: "WEST STAINES BASS CAGE",
      blood: 1.55,
      separation: 1.45,
      pieces: 8,
      palette: Object.freeze(["#ff1245", "#720019"]),
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
