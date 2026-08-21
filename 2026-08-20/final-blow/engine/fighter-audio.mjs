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

export const FIGHTER_AUDIO_CUES = Object.freeze([
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
});

export const FIGHTER_AUDIO = Object.freeze(Object.fromEntries(FIGHTER_AUDIO_IDS.map((fighterId) => [
  fighterId,
  Object.freeze(Object.fromEntries(FIGHTER_AUDIO_CUES.map((cue) => [
    cue,
    `assets/audio/fighters/${fighterId}/${cue}.mp3`,
  ]))),
])));

export function fighterAudioCue(fighterId, cue) {
  return FIGHTER_AUDIO[fighterId]?.[cue] || null;
}

export function fighterAudioManifest() {
  return FIGHTER_AUDIO_IDS.flatMap((fighterId) => FIGHTER_AUDIO_CUES.map((cue) => fighterAudioCue(fighterId, cue)));
}

export function auditFighterAudio() {
  const paths = fighterAudioManifest();
  const errors = [];
  for (const fighterId of FIGHTER_AUDIO_IDS) {
    const palette = FIGHTER_AUDIO[fighterId];
    if (!palette) {
      errors.push(`${fighterId}: missing palette`);
      continue;
    }
    for (const cue of FIGHTER_AUDIO_CUES) {
      if (!palette[cue]) errors.push(`${fighterId}: missing ${cue}`);
    }
  }
  if (new Set(paths).size !== paths.length) errors.push("audio paths must be unique");
  return Object.freeze({
    fighters: FIGHTER_AUDIO_IDS.length,
    cuesPerFighter: FIGHTER_AUDIO_CUES.length,
    totalCues: paths.length,
    errors: Object.freeze(errors),
  });
}
