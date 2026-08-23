import {
  APPROVED_CORE_CUES,
  APPROVED_KICK_POOLS,
  REJECTED_PATHS,
  REVIEW_CORE_CUES,
  REVIEW_FIGHTER_IDS,
  REVIEW_KICK_ROLES,
} from "./audio-review.mjs";

export const FIGHTER_AUDIO_IDS = Object.freeze([...REVIEW_FIGHTER_IDS]);

// The original single-take cue set shipped with 1.5. One mp3 each on disk —
// but only where the take survived Jez's review; the rest are gone and route
// to a shared or procedural fallback instead.
export const FIGHTER_AUDIO_CORE_CUES = Object.freeze([...REVIEW_CORE_CUES]);

// Reviewed kick takes. The game already splits every light and heavy normal by
// limb, so these four cues sit under the punch-flavoured `light`/`heavy` cues
// and claim the moment whenever the normal was thrown with a leg. Each is
// backed by a pool of accepted takes (0, 1 or 2 of them) rather than the
// single-take-plus-probe contract the core cues use.
export const FIGHTER_KICK_CUES = Object.freeze([...REVIEW_KICK_ROLES]);

// Release 1.6 "LOUD" reactive cue slots. The sim already surfaces every one
// of these moments; no takes exist yet, so playback falls back to
// FIGHTER_REACTIVE_PLACEHOLDERS until the real files land.
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
  ...FIGHTER_KICK_CUES,
  ...FIGHTER_REACTIVE_CUES,
]);

// Variant bank width for the probe-driven cues: a core or reactive cue may
// ship up to this many takes, named `<cue>.mp3` (variant 1 — the existing
// files keep working untouched), `<cue>-2.mp3`, `<cue>-3.mp3`. Missing
// variants are probed once at runtime and skipped; the moment a file appears
// at its canonical path it joins the no-repeat rotation. Kick cues are exempt:
// their pool is exactly what the review accepted, so there is nothing to probe.
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
  "light-kick-swing": "LIGHT KICK",
  "light-kick-impact": "LIGHT KICK IMPACT",
  "roundhouse-swing": "ROUNDHOUSE",
  "roundhouse-impact": "ROUNDHOUSE IMPACT",
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
// A borrowed cue whose recording the review deleted simply has nothing to
// borrow for that fighter, and the caller falls through to the shared or
// procedural sound rather than reaching for a rejected file.
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

function probeVariants(fighterId, cue) {
  return Object.freeze(Array.from(
    { length: FIGHTER_AUDIO_VARIANT_SLOTS },
    (_, index) => variantPath(fighterId, cue, index + 1),
  ));
}

/**
 * How a cue's bank is filled at runtime.
 *
 * `recorded` — every path is a file the review accepted and the tree ships;
 *   play them straight, probe nothing.
 * `probed` — variant 1 is a shipped recording, slots 2 and 3 are speculative
 *   and get one HEAD probe each.
 * `placeholder` — nothing is recorded yet; probe all three slots and borrow a
 *   detuned take in the meantime.
 */
export const FIGHTER_AUDIO_BANK_KINDS = Object.freeze({
  recorded: "recorded",
  probed: "probed",
  placeholder: "placeholder",
});

export function fighterAudioBankKind(cue) {
  if (FIGHTER_KICK_CUES.includes(cue)) return FIGHTER_AUDIO_BANK_KINDS.recorded;
  if (FIGHTER_REACTIVE_CUES.includes(cue)) return FIGHTER_AUDIO_BANK_KINDS.placeholder;
  if (FIGHTER_AUDIO_CORE_CUES.includes(cue)) return FIGHTER_AUDIO_BANK_KINDS.probed;
  return null;
}

/**
 * Canonical paths per fighter and cue. A core cue whose recording the review
 * rejected is absent entirely rather than present-and-empty, so every lookup
 * below reports "no take" through the same `null` the unknown-fighter and
 * unknown-cue cases already used.
 */
export const FIGHTER_AUDIO = Object.freeze(Object.fromEntries(FIGHTER_AUDIO_IDS.map((fighterId) => {
  const palette = {};
  for (const cue of FIGHTER_AUDIO_CORE_CUES) {
    if (APPROVED_CORE_CUES[fighterId].includes(cue)) palette[cue] = probeVariants(fighterId, cue);
  }
  for (const cue of FIGHTER_KICK_CUES) {
    const pool = APPROVED_KICK_POOLS[fighterId][cue];
    if (pool.length) palette[cue] = Object.freeze([...pool]);
  }
  for (const cue of FIGHTER_REACTIVE_CUES) {
    palette[cue] = probeVariants(fighterId, cue);
  }
  return [fighterId, Object.freeze(palette)];
})));

// Primary (variant 1) path — the pre-1.6 contract every caller relied on.
// Null now also means "reviewed away", which is exactly how callers already
// treated a missing palette entry.
export function fighterAudioCue(fighterId, cue) {
  return FIGHTER_AUDIO[fighterId]?.[cue]?.[0] || null;
}

// Full canonical variant list for a cue. For recorded banks every entry is a
// shipped file; for the others runtime probes decide which ones exist.
export function fighterAudioVariants(fighterId, cue) {
  return FIGHTER_AUDIO[fighterId]?.[cue] || null;
}

/** Every take that is actually on disk, in fighter then cue order. */
export function fighterAudioRecordedManifest() {
  return FIGHTER_AUDIO_IDS.flatMap((fighterId) => [
    ...APPROVED_CORE_CUES[fighterId].map((cue) => fighterAudioCue(fighterId, cue)),
    ...FIGHTER_KICK_CUES.flatMap((cue) => [...APPROVED_KICK_POOLS[fighterId][cue]]),
  ]);
}

export function fighterAudioManifest() {
  return fighterAudioRecordedManifest();
}

/** Every path the runtime may reference, shipped or merely probed for. */
export function fighterAudioVariantManifest() {
  return FIGHTER_AUDIO_IDS.flatMap((fighterId) => FIGHTER_AUDIO_CUES.flatMap(
    (cue) => [...(fighterAudioVariants(fighterId, cue) || [])],
  ));
}

export function auditFighterAudio() {
  const recorded = fighterAudioRecordedManifest();
  const variantPaths = fighterAudioVariantManifest();
  const rejected = new Set(REJECTED_PATHS);
  const errors = [];
  let approvedCoreTakes = 0;
  let approvedKickTakes = 0;
  for (const fighterId of FIGHTER_AUDIO_IDS) {
    const palette = FIGHTER_AUDIO[fighterId];
    if (!palette) {
      errors.push(`${fighterId}: missing palette`);
      continue;
    }
    for (const cue of FIGHTER_AUDIO_CORE_CUES) {
      const approved = APPROVED_CORE_CUES[fighterId].includes(cue);
      const variants = palette[cue];
      if (!approved) {
        if (variants) errors.push(`${fighterId}: ${cue} was rejected but still routes`);
        continue;
      }
      approvedCoreTakes += 1;
      if (variants?.length !== FIGHTER_AUDIO_VARIANT_SLOTS) {
        errors.push(`${fighterId}: ${cue} has ${variants?.length ?? 0} variant slots`);
        continue;
      }
      variants.forEach((path, index) => {
        if (path !== variantPath(fighterId, cue, index + 1)) {
          errors.push(`${fighterId}: ${cue} variant ${index + 1} misnamed (${path})`);
        }
      });
    }
    for (const cue of FIGHTER_KICK_CUES) {
      const pool = APPROVED_KICK_POOLS[fighterId][cue];
      approvedKickTakes += pool.length;
      const variants = palette[cue];
      if (!pool.length) {
        if (variants) errors.push(`${fighterId}: ${cue} has no accepted take but still routes`);
        continue;
      }
      if (variants?.length !== pool.length) {
        errors.push(`${fighterId}: ${cue} routes ${variants?.length ?? 0} of ${pool.length} accepted takes`);
      }
    }
    for (const cue of FIGHTER_REACTIVE_CUES) {
      if (palette[cue]?.length !== FIGHTER_AUDIO_VARIANT_SLOTS) {
        errors.push(`${fighterId}: reactive ${cue} lost its variant slots`);
      }
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
  for (const cue of FIGHTER_KICK_CUES) {
    if (!FIGHTER_AUDIO_LABELS[cue]) errors.push(`${cue}: missing caption label`);
  }
  // The one check the whole review turns on: nothing he rejected may be
  // reachable, whether as a shipped take or as a path the runtime probes.
  for (const path of variantPaths) {
    if (rejected.has(path)) errors.push(`rejected recording still routed: ${path}`);
  }
  if (new Set(recorded).size !== recorded.length) errors.push("audio paths must be unique");
  if (new Set(variantPaths).size !== variantPaths.length) errors.push("variant paths must be unique");
  return Object.freeze({
    fighters: FIGHTER_AUDIO_IDS.length,
    cuesPerFighter: FIGHTER_AUDIO_CUES.length,
    coreCues: FIGHTER_AUDIO_CORE_CUES.length,
    kickCues: FIGHTER_KICK_CUES.length,
    reactiveCues: FIGHTER_REACTIVE_CUES.length,
    variantSlots: FIGHTER_AUDIO_VARIANT_SLOTS,
    approvedCoreTakes,
    approvedKickTakes,
    recordedTakes: recorded.length,
    totalVariantPaths: variantPaths.length,
    errors: Object.freeze(errors),
  });
}
