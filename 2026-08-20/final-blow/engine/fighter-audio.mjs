export const FIGHTER_AUDIO_IDS = Object.freeze([
  "deathblow",
  "jez",
  "alan",
  "post",
  "benny",
  "donald",
  "cyraxx",
  "ali",
]);

// The original single-take cue set shipped with 1.5 (one mp3 each, on disk).
export const FIGHTER_AUDIO_CORE_CUES = Object.freeze([
  "jump",
  "dash",
  "light",
  "heavy",
  "special",
  "throw",
  "hit-light",
  "hit-heavy",
  "block",
  "super",
  "fatal",
  "ko",
]);

// Release 1.6 "LOUD" reactive cue slots. The sim already surfaces every one
// of these moments; no takes exist yet (ElevenLabs auth is down), so playback
// falls back to FIGHTER_REACTIVE_PLACEHOLDERS until the real files land.
export const FIGHTER_REACTIVE_CUES = Object.freeze([
  "dizzy",
  "counter",
  "tech",
  "desperation",
  "scream",
  // Release 1.7 DEPTH: the guard-crush shatter bark.
  "crush",
  // Release 1.7 wave 11: the punishable-taunt voice line. The LINE is chosen
  // by the simulation via state.rng (so rollback peers agree); this cue owns
  // the variant bank the chosen take plays from.
  "taunt",
]);

export const FIGHTER_AUDIO_CUES = Object.freeze([
  ...FIGHTER_AUDIO_CORE_CUES,
  ...FIGHTER_REACTIVE_CUES,
]);

// Variant bank width: every cue may ship up to this many takes, named
// `<cue>.mp3` (variant 1 — the existing files keep working untouched),
// `<cue>-2.mp3`, `<cue>-3.mp3`. Missing variants are probed once at runtime
// and skipped; the moment a file appears at its canonical path it joins the
// no-repeat rotation.
export const FIGHTER_AUDIO_VARIANT_SLOTS = 3;

export const FIGHTER_AUDIO_LABELS = Object.freeze({
  jump: "SIGNATURE JUMP",
  dash: "SIGNATURE DASH",
  light: "LIGHT ATTACK",
  heavy: "HEAVY ATTACK",
  special: "SPECIAL ATTACK",
  throw: "THROW",
  "hit-light": "LIGHT IMPACT",
  "hit-heavy": "HEAVY IMPACT",
  block: "GUARD IMPACT",
  super: "FULL GRIT SUPER",
  fatal: "GRAPHIC FATALITY",
  ko: "KNOCKOUT",
  dizzy: "DIZZY DAZE",
  counter: "COUNTER BARK",
  tech: "THROW TECH SHOUT",
  desperation: "DESPERATION",
  scream: "FATALITY SCREAM",
  crush: "GUARD CRUSHED",
  taunt: "TAUNT",
});

// Until real reactive takes exist, each new cue borrows the nearest recorded
// take and detunes it so the moment still reads as its own voice line.
// `rate` multiplies playbackRate (pitch shifts with it — preservesPitch off).
export const FIGHTER_REACTIVE_PLACEHOLDERS = Object.freeze({
  dizzy: Object.freeze({ cue: "hit-heavy", rate: 0.86 }),
  counter: Object.freeze({ cue: "special", rate: 1.09 }),
  tech: Object.freeze({ cue: "block", rate: 1.06 }),
  desperation: Object.freeze({ cue: "hit-light", rate: 0.93 }),
  scream: Object.freeze({ cue: "fatal", rate: 1.14 }),
  crush: Object.freeze({ cue: "block", rate: 0.78 }),
  taunt: Object.freeze({ cue: "jump", rate: 1.18 }),
});

/**
 * Release 1.7 wave 11 — authored taunt lines, three per fighter, in persona
 * (voice directions live in MISSING-AUDIO.md). Positional contract: line
 * index N is spoken by the taunt variant file with slot N+1
 * (`taunt.mp3`, `taunt-2.mp3`, `taunt-3.mp3`), and the caption always shows
 * the exact line even before the takes exist. The index is chosen by the
 * simulation from state.rng, so both rollback peers rotate identically.
 */
export const FIGHTER_TAUNT_LINES = Object.freeze({
  deathblow: Object.freeze([
    "I POUR CONCRETE HARDER THAN YOU.",
    "ROCK BOTTOM SUITS YOU.",
    "STAY DOWN. IT'S LOAD-BEARING.",
  ]),
  jez: Object.freeze([
    "READ THE SIGN.",
    "I MADE THAT LOOK EASY.",
    "LIGHTS OUT, PAL.",
  ]),
  alan: Object.freeze([
    "YOUSE DONE ALREADY?",
    "GET UP. I AIN'T FINISHED.",
    "THAT ALL YOU GOT, HUH?",
  ]),
  post: Object.freeze([
    "CAN'T CATCH ME.",
    "I'LL TAG YOUR TOMBSTONE.",
    "SPRAYED AND SLAYED.",
  ]),
  benny: Object.freeze([
    "TOO SLOW. WAY TOO SLOW.",
    "PRECISION, BABY.",
    "CLIPPED YA.",
  ]),
  donald: Object.freeze([
    "TOTAL DISASTER. SAD.",
    "NOBODY FIGHTS BETTER THAN ME.",
    "YOU'RE FIRED.",
  ]),
  cyraxx: Object.freeze([
    "HEHEHE... FEEDBACK!",
    "YOU HEAR THAT? THAT'S LOSING.",
    "CRANK IT UP!",
  ]),
  ali: Object.freeze([
    "BOOYAKASHA!",
    "IS IT COS I IS WINNING?",
    "RESPEK. NOT FOR YOU, THOUGH.",
  ]),
});

function variantPath(fighterId, cue, variant) {
  return `assets/audio/fighters/${fighterId}/${cue}${variant > 1 ? `-${variant}` : ""}.mp3`;
}

export const FIGHTER_AUDIO = Object.freeze(Object.fromEntries(FIGHTER_AUDIO_IDS.map((fighterId) => [
  fighterId,
  Object.freeze(Object.fromEntries(FIGHTER_AUDIO_CUES.map((cue) => [
    cue,
    Object.freeze(Array.from(
      { length: FIGHTER_AUDIO_VARIANT_SLOTS },
      (_, index) => variantPath(fighterId, cue, index + 1),
    )),
  ]))),
])));

// Primary (variant 1) path — the pre-1.6 contract every caller relied on.
export function fighterAudioCue(fighterId, cue) {
  return FIGHTER_AUDIO[fighterId]?.[cue]?.[0] || null;
}

// Full canonical variant list for a cue (present or not — runtime probes
// decide which files actually exist).
export function fighterAudioVariants(fighterId, cue) {
  return FIGHTER_AUDIO[fighterId]?.[cue] || null;
}

export function fighterAudioManifest() {
  return FIGHTER_AUDIO_IDS.flatMap((fighterId) => FIGHTER_AUDIO_CUES.map((cue) => fighterAudioCue(fighterId, cue)));
}

export function fighterAudioVariantManifest() {
  return FIGHTER_AUDIO_IDS.flatMap((fighterId) => FIGHTER_AUDIO_CUES.flatMap((cue) => [
    ...fighterAudioVariants(fighterId, cue),
  ]));
}

export function auditFighterAudio() {
  const paths = fighterAudioManifest();
  const variantPaths = fighterAudioVariantManifest();
  const errors = [];
  for (const fighterId of FIGHTER_AUDIO_IDS) {
    const palette = FIGHTER_AUDIO[fighterId];
    if (!palette) {
      errors.push(`${fighterId}: missing palette`);
      continue;
    }
    for (const cue of FIGHTER_AUDIO_CUES) {
      const variants = palette[cue];
      if (!variants?.length) {
        errors.push(`${fighterId}: missing ${cue}`);
        continue;
      }
      if (variants.length !== FIGHTER_AUDIO_VARIANT_SLOTS) {
        errors.push(`${fighterId}: ${cue} has ${variants.length} variant slots`);
      }
      variants.forEach((path, index) => {
        if (path !== variantPath(fighterId, cue, index + 1)) {
          errors.push(`${fighterId}: ${cue} variant ${index + 1} misnamed (${path})`);
        }
      });
    }
  }
  for (const [cue, placeholder] of Object.entries(FIGHTER_REACTIVE_PLACEHOLDERS)) {
    if (!FIGHTER_REACTIVE_CUES.includes(cue)) errors.push(`placeholder for unknown reactive cue ${cue}`);
    if (!FIGHTER_AUDIO_CORE_CUES.includes(placeholder.cue)) errors.push(`${cue}: placeholder source ${placeholder.cue} is not a core cue`);
    if (!(placeholder.rate > 0) || placeholder.rate === 1) errors.push(`${cue}: placeholder rate must offset pitch (got ${placeholder.rate})`);
  }
  for (const cue of FIGHTER_REACTIVE_CUES) {
    if (!FIGHTER_REACTIVE_PLACEHOLDERS[cue]) errors.push(`${cue}: missing reactive placeholder mapping`);
    if (!FIGHTER_AUDIO_LABELS[cue]) errors.push(`${cue}: missing caption label`);
  }
  if (new Set(paths).size !== paths.length) errors.push("audio paths must be unique");
  if (new Set(variantPaths).size !== variantPaths.length) errors.push("variant paths must be unique");
  return Object.freeze({
    fighters: FIGHTER_AUDIO_IDS.length,
    cuesPerFighter: FIGHTER_AUDIO_CUES.length,
    coreCues: FIGHTER_AUDIO_CORE_CUES.length,
    reactiveCues: FIGHTER_REACTIVE_CUES.length,
    variantSlots: FIGHTER_AUDIO_VARIANT_SLOTS,
    totalCues: paths.length,
    totalVariantPaths: variantPaths.length,
    errors: Object.freeze(errors),
  });
}
