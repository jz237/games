// v5.3 SPECTACLE — the music layer above the four approved tracks: the two
// stage themes the 1.6 map has always had a slot for, the round/match
// stingers, and the low-health stem. Pure tables and pure decisions so node
// can pin them; every element, gain and timer lives in game.js.
//
// What was wrong. (1) STAGE_MUSIC has carried `todoTrack` entries for
// wildwood and cruise since release 1.6 and stageMusicTrackIndex() has always
// preferred them — the files simply never existed, so two of six stages wore
// another stage's identity (wildwood borrowed NEON SIGN WAR, cruise borrowed
// SUBWAY AFTER MIDNIGHT). (2) Nothing musical marked a round or a match: a KO
// ducked the bed to 0.28 for 2.6 s and the same loop came back, and
// resolveMatchResult never touched the music at all. (3) "Dynamic" music was
// one biquad: neutral 0.45 open -> 4.97 kHz, low health 0.8 -> 12.1 kHz, a
// presence gain moving 1.02 -> 1.17 (about +1.2 dB). On a phone speaker that
// rolls off above ~6 kHz, the difference between "fine" and "one hit from
// death" was very nearly nothing.
//
// What ships. Two NEW 80 s tracks generated the same way the four were
// (ElevenLabs music_v2, instrumental, 44.1 kHz / 128 kbps CBR stereo,
// loudness-matched to the shipped set); twelve NEW stingers in four banks of
// three takes; one NEW 14.4 s seamless danger loop. The four approved tracks
// are not touched, re-encoded or renamed by any of this.

import { ROUND_END_CAUSES } from "./announcer.mjs";

export const MUSIC_DIR = "assets/audio/music";
export const MUSIC_STINGER_DIR = `${MUSIC_DIR}/stingers`;

// The two tracks the 1.6 stage map named and could not have. Titles follow
// the shipped ALL-CAPS convention; `slug` is what STAGE_MUSIC.todoTrack has
// been matching on with `track.src.includes(...)` since 1.6, so the files
// drop into that path with no change to the resolver.
//
// Measured against the four shipped tracks (ffprobe + ffmpeg ebur128):
//   philly-after-dark      80.091 s  -11.2 LUFS  peak +0.5 dBFS
//   vet-parking-lot        80.091 s  -10.7 LUFS  peak +0.2 dBFS
//   neon-sign-war          80.065 s  -11.3 LUFS  peak +1.1 dBFS
//   subway-after-midnight  80.091 s  -12.2 LUFS  peak -0.2 dBFS
//   wildwood-boardwalk-night (NEW) 80.091 s  -11.1 LUFS  peak +0.1 dBFS
//   cruise-deck-disco        (NEW) 80.091 s  -12.9 LUFS  peak +0.1 dBFS
// The cruise track lands 0.7 LU under the quietest shipped track: its mix has
// a high crest factor and pushing the last 2 LU took audible limiting, so the
// honest number is documented rather than squashed.
export const MUSIC_STAGE_TRACKS = Object.freeze([
  Object.freeze({
    title: "BOARDWALK NEON",
    slug: "wildwood-boardwalk-night",
    stage: "wildwood",
    seconds: 80.091,
    lufs: -11.1,
  }),
  Object.freeze({
    title: "DECK PARTY DISASTER",
    slug: "cruise-deck-disco",
    stage: "cruise",
    seconds: 80.091,
    lufs: -12.9,
  }),
]);

export function musicTrackPath(slug) {
  return `${MUSIC_DIR}/${slug}.mp3`;
}

/** The two new track entries in musicTracks' shape ({ title, src }). */
export function musicStageTrackEntries() {
  return MUSIC_STAGE_TRACKS.map((track) => Object.freeze({
    title: track.title,
    src: musicTrackPath(track.slug),
  }));
}

// --- Stingers ---------------------------------------------------------------

// Four banks, three takes each, played on the stinger channel (its own Audio
// elements) OVER the bed — never instead of it, the crowd-voice contract. Per
// bank: how far the bed ducks under the take and for how long, the take's own
// level, the measured length of the longest take, and the caption the sound
// captions show. `seconds` is ffprobe on the shipped files; `duckMs` is that
// length plus a tail so the bed comes back after the stinger, not under it.
//
// Levels: the takes are true-peak-normalised and land at -18.5..-13.6 LUFS
// integrated (target -16), which is 3-7 LU under the bed, so the bank volume
// is set high and the bed dips rather than the stinger shouting.
export const MUSIC_STINGERS = Object.freeze({
  roundstart: Object.freeze({
    takes: 3, seconds: 3.056, volume: 0.85, duck: 0.62, duckMs: 3300,
    caption: "ROUND STINGER",
  }),
  ko: Object.freeze({
    takes: 3, seconds: 3.056, volume: 0.9, duck: 0.3, duckMs: 3300,
    caption: "KO STINGER",
  }),
  decision: Object.freeze({
    takes: 3, seconds: 3.056, volume: 0.85, duck: 0.34, duckMs: 3300,
    caption: "TIME OVER STINGER",
  }),
  matchwin: Object.freeze({
    takes: 3, seconds: 4.075, volume: 0.92, duck: 0.24, duckMs: 4400,
    caption: "WIN FANFARE",
  }),
});

export const MUSIC_STINGER_IDS = Object.freeze(Object.keys(MUSIC_STINGERS));

/** Canonical path of one take (1-based, the announcer/crowd convention). */
export function musicStingerPath(cue, take) {
  return `${MUSIC_STINGER_DIR}/${cue}-${take}.mp3`;
}

/** Every shipped stinger take, in bank order — the registration list. */
export function musicStingerFiles() {
  const files = [];
  for (const [cue, spec] of Object.entries(MUSIC_STINGERS)) {
    for (let take = 1; take <= spec.takes; take += 1) files.push(musicStingerPath(cue, take));
  }
  return files;
}

/**
 * Which stinger a round end earns, from the same three facts finishRound
 * already computes for the announcer (roundEndCause, whether this round won
 * the match, whether a Final Blow is playing).
 *
 * A Final Blow returns null on purpose: performFinisher already ducks the bed
 * to 0.1 for the whole cinematic so the gore mix owns the frame, and a
 * fanfare on top of that is exactly the mud the 2.8 gore wave removed. The
 * match-win moment on a fatality is carried by the fatality itself.
 *
 * A match won on the clock returns "matchwin", not "decision": the announcer
 * still opens on the timeover bank, and the bigger of two simultaneous
 * moments is the one the music should mark.
 */
export function musicStingerForRoundEnd({ cause = ROUND_END_CAUSES.knockout, matchWon = false, finisher = false } = {}) {
  if (finisher) return null;
  if (matchWon) return "matchwin";
  return cause === ROUND_END_CAUSES.decision ? "decision" : "ko";
}

// --- Low-health stem --------------------------------------------------------

export const DANGER_STEM_SLUG = "danger-stem";
export const DANGER_STEM_PATH = `${MUSIC_DIR}/${DANGER_STEM_SLUG}.mp3`;

// The stem is unpitched on purpose — heartbeat kick, rim build, taiko rolls,
// industrial hits, one unmoving low drone — because it has to sit over six
// different songs in six different keys. 100 BPM, cut to six bars (14.400 s)
// and closed with a one-beat (0.240 s) equal-power crossfade so the element
// loop is seamless; ffprobe reads 14.446 s including the encoder's padding.
export const DANGER_STEM = Object.freeze({
  seconds: 14.446,
  loopSeconds: 14.4,
  bpm: 100,
  bars: 6,
  lufs: -13.8,
  // Health at or under which the danger layer is wanted. Same number the
  // filter ride has used since 5.0 (updateMusicIntensity's lowHealth test),
  // so the stem and the filter open on the same edge instead of two.
  healthAt: 30,
  // Element gain at full mix, before duck and the music slider. The stem is
  // -13.8 LUFS against a -11 LUFS bed, so at 0.9 it reads as a layer that
  // arrived, not as a second song.
  gain: 0.9,
  // How far the bed drops when the stem is fully in. This is the crossfade:
  // the song loses a third of its level and the stem takes that space, so the
  // change is a texture swap you feel on a phone speaker rather than a shelf
  // move above 5 kHz that a phone speaker cannot reproduce.
  bedDip: 0.34,
  // Ease constants (seconds) for the eased mix — in fast enough to be the
  // answer to the hit that took you under 30, out slower so a heal or a new
  // round does not snap it off.
  tauIn: 0.55,
  tauOut: 1.1,
});

/**
 * Target mix (0 or 1) for the danger stem. Live fight only, either fighter at
 * or under the health threshold, and never under a Final Blow cinematic or a
 * round that is already over — those beats have their own mix.
 */
export function dangerStemTarget({
  fightLive = false, phase = "fight", finisher = false, healths = [],
} = {}) {
  if (!fightLive || finisher) return 0;
  if (phase !== "fight" && phase !== "finish") return 0;
  return healths.some((health) => Number(health) <= DANGER_STEM.healthAt) ? 1 : 0;
}

/** Eased step of the stem mix toward `target` over `dt` seconds. */
export function dangerStemStep(level, target, dt) {
  const current = Number.isFinite(level) ? level : 0;
  const tau = target > current ? DANGER_STEM.tauIn : DANGER_STEM.tauOut;
  const stepped = current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / tau));
  return Math.min(1, Math.max(0, stepped));
}

/** Bed level multiplier at this stem mix — the other half of the crossfade. */
export function dangerStemBedGain(mix) {
  const level = Math.min(1, Math.max(0, Number(mix) || 0));
  return 1 - DANGER_STEM.bedDip * level;
}

/** Stem element volume at this mix, before the duck and the music slider. */
export function dangerStemGain(mix) {
  const level = Math.min(1, Math.max(0, Number(mix) || 0));
  return DANGER_STEM.gain * level;
}

/** Every new music file this module registers — the manifest/audit list. */
export function musicMediaFiles() {
  return [
    ...MUSIC_STAGE_TRACKS.map((track) => musicTrackPath(track.slug)),
    DANGER_STEM_PATH,
    ...musicStingerFiles(),
  ];
}
