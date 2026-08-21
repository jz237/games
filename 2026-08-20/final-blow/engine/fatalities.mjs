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

const profile = (values) => Object.freeze({
  blood: 1,
  separation: 1,
  angle: 0,
  pieces: 3,
  palette: Object.freeze(["#d1081c", "#65000d"]),
  ...values,
});

export const GRAPHIC_FATALITIES = Object.freeze({
  deathblow: Object.freeze([
    profile({
      id: "faultline-rupture",
      title: "FAULTLINE RUPTURE",
      family: "rupture",
      caption: "SEISMIC DISMEMBERMENT",
      blood: 1.6,
      separation: 1.2,
      pieces: 4,
    }),
    profile({
      id: "aftershock-burial",
      title: "AFTERSHOCK BURIAL",
      family: "crush",
      caption: "GROUND-ZERO CRUSH",
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
      caption: "THREE-WAY NEON BISECTION",
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
      caption: "RAZOR-RIBBON DISSECTION",
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
      caption: "FULL-BODY IMPACT",
      blood: 1.35,
      separation: 0.85,
      pieces: 4,
    }),
    profile({
      id: "south-street-shutdown",
      title: "SOUTH STREET SHUTDOWN",
      family: "rupture",
      caption: "HEAD-TO-HEEL BREAKDOWN",
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
      caption: "PAINT-AND-BLOOD DISSOLVE",
      blood: 1.15,
      separation: 0.9,
      pieces: 6,
      palette: Object.freeze(["#d80d28", "#6e0014"]),
    }),
    profile({
      id: "wet-paint",
      title: "WET PAINT",
      family: "dissolve",
      caption: "LIQUEFIED STREET ART",
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
      caption: "SKELETAL ARC FLASH",
      blood: 0.85,
      separation: 0.75,
      pieces: 4,
      palette: Object.freeze(["#f51f39", "#370009"]),
    }),
    profile({
      id: "last-call-overload",
      title: "BENNY'S LAST CALL",
      family: "electrocute",
      caption: "TOTAL SYSTEM OVERLOAD",
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
      caption: "HEAD OVER THE BACK NINE",
      blood: 1.25,
      separation: 1.45,
      angle: -0.32,
      pieces: 3,
    }),
    profile({
      id: "youre-fired",
      title: "YOU'RE FIRED!",
      family: "launch",
      caption: "CLUBHOUSE DISASSEMBLY",
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
      caption: "SIGNAL-SLICE DELETION",
      blood: 1.1,
      separation: 1.05,
      pieces: 7,
      palette: Object.freeze(["#e30b38", "#530020"]),
    }),
    profile({
      id: "internet-meltdown",
      title: "INTERNET MELTDOWN",
      family: "glitch",
      caption: "CORRUPTED BODY BUFFER",
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
      caption: "BASS-PRESSURE IMPLOSION",
      blood: 1.2,
      separation: 0.9,
      pieces: 5,
      palette: Object.freeze(["#ee0a32", "#660015"]),
    }),
    profile({
      id: "west-staines-massive",
      title: "WEST STAINES MASSIVE",
      family: "implode",
      caption: "MAXIMUM BASS DETONATION",
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

export function auditGraphicFatalities(fighterIds = Object.keys(GRAPHIC_FATALITIES)) {
  const ids = new Set();
  const errors = [];
  for (const fighterId of fighterIds) {
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
      for (const field of ["blood", "separation", "pieces"]) {
        if (!Number.isFinite(fatality[field]) || fatality[field] <= 0) errors.push(`${fighterId}:${fatality.id}:${field}`);
      }
    }
  }
  return { fighters: fighterIds.length, fatalities: ids.size, errors };
}
