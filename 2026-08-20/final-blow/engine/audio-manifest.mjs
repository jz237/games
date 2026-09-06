// Build-time audio manifest (assets/audio/MANIFEST.json, written by
// tools/audio/build_manifest.mjs) — the pure reading side. game.js used to
// discover voice takes at runtime: every fighter bank HEAD-probed its -2/-3
// slots (21-57 requests per fighter at fight start, all 200s since the LOUD
// batch landed every file) and the announcer guessed its busy window from a
// word count capped at 1.7 s while benny-wins-2 runs 4676 ms, so a KO ->
// wins -> comeback stack talked over itself on every long take. The manifest
// carries what both wanted to know — which takes exist and how long each one
// runs — measured once with ffprobe. Everything here is a pure function over
// that JSON so the runtime and the unit tests read it identically; the
// runtime keeps its probe/estimate path as the fallback for a missing file.

export const AUDIO_MANIFEST_PATH = "assets/audio/MANIFEST.json";

// Serialised speech clock constants. A call reserves its window from its real
// take length plus this breath before the next call may start; the estimate
// is what the clock used before durations were measured (kept as the tier-3
// fallback and, deliberately, unchanged: 420 ms + 260 ms a word, capped at
// 1.7 s).
export const ANNOUNCER_GAP_MS = 90;
export const ANNOUNCER_ESTIMATE_CAP_MS = 1700;

export function announcerEstimateMs(line) {
  return Math.min(ANNOUNCER_ESTIMATE_CAP_MS, 420 + String(line || "").trim().split(/\s+/).length * 260);
}

function positiveMs(value) {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0;
}

function fileTable(files) {
  if (!files || typeof files !== "object") return null;
  const table = {};
  for (const [name, entry] of Object.entries(files)) {
    const ms = positiveMs(entry?.ms ?? entry);
    if (!ms) continue;
    table[name] = Object.freeze({ ms, bytes: Math.max(0, Math.floor(Number(entry?.bytes) || 0)) });
  }
  return Object.freeze(table);
}

/**
 * Validate and freeze a parsed manifest. Returns null for anything that is
 * not a manifest (missing file, HTML error page parsed as JSON, wrong shape)
 * so callers fall back exactly as if the fetch had failed. A section that is
 * absent is simply absent: an announcer-only manifest still serves the
 * announcer and leaves the fighter banks on the probe path.
 */
export function parseAudioManifest(raw) {
  if (!raw || typeof raw !== "object") return null;
  const announcer = raw.announcer && typeof raw.announcer === "object" ? fileTable(raw.announcer.files) : null;
  const fighters = {};
  if (raw.fighters && typeof raw.fighters === "object") {
    for (const [fighterId, entry] of Object.entries(raw.fighters)) {
      const files = fileTable(entry?.files);
      if (files) fighters[fighterId] = files;
    }
  }
  const shared = fileTable(raw.shared);
  // v5.3 SPECTACLE: the music section. Beds/stems live flat under
  // assets/audio/music, stingers one level down; both are optional, so an
  // older manifest still parses and the music paths simply go unmeasured.
  const music = raw.music && typeof raw.music === "object"
    ? Object.freeze({
      tracks: fileTable(raw.music.tracks?.files ?? raw.music.tracks),
      stingers: fileTable(raw.music.stingers?.files ?? raw.music.stingers),
    })
    : null;
  if (!announcer && !Object.keys(fighters).length && !shared && !music) return null;
  return Object.freeze({
    generated: typeof raw.generated === "string" ? raw.generated : "",
    announcer,
    fighters: Object.freeze(fighters),
    shared,
    music,
  });
}

const FIGHTER_PATH = /^assets\/audio\/fighters\/([^/]+)\/([^/]+\.mp3)$/;
const ANNOUNCER_PATH = /^assets\/audio\/announcer\/([^/]+\.mp3)$/;
const MUSIC_STINGER_PATH = /^assets\/audio\/music\/stingers\/([^/]+\.mp3)$/;
const MUSIC_TRACK_PATH = /^assets\/audio\/music\/([^/]+\.mp3)$/;
const SHARED_PATH = /^assets\/audio\/([^/]+\.mp3)$/;

/** Manifest entry ({ ms, bytes }) for a canonical asset path, or null. */
export function audioManifestEntry(manifest, path) {
  if (!manifest || typeof path !== "string") return null;
  let match = path.match(FIGHTER_PATH);
  if (match) return manifest.fighters[match[1]]?.[match[2]] || null;
  match = path.match(ANNOUNCER_PATH);
  if (match) return manifest.announcer?.[match[1]] || null;
  // Stingers before tracks: the stinger pattern is the more specific of the
  // two (SHARED_PATH cannot swallow either — its segment excludes "/").
  match = path.match(MUSIC_STINGER_PATH);
  if (match) return manifest.music?.stingers?.[match[1]] || null;
  match = path.match(MUSIC_TRACK_PATH);
  if (match) return manifest.music?.tracks?.[match[1]] || null;
  match = path.match(SHARED_PATH);
  if (match) return manifest.shared?.[match[1]] || null;
  return null;
}

/** Measured length of a take in ms, or 0 when the manifest does not know it. */
export function audioManifestMs(manifest, path) {
  return audioManifestEntry(manifest, path)?.ms || 0;
}

/**
 * The announcer bank for a cue: `<cue>-1.mp3 … <cue>-N.mp3`, contiguous from
 * take 1 and clamped to maxTakes, exactly how the old probe loop walked it
 * (stop at the first hole). Returns null only when the manifest has no
 * announcer section at all — then the caller probes. A cue absent from the
 * manifest has zero takes and costs zero requests.
 */
export function announcerBankFromManifest(manifest, cue, maxTakes = 5) {
  if (!manifest?.announcer) return null;
  const srcs = [];
  const durationsMs = [];
  for (let take = 1; take <= maxTakes; take += 1) {
    const name = `${cue}-${take}.mp3`;
    const entry = manifest.announcer[name];
    if (!entry) break;
    srcs.push(`assets/audio/announcer/${name}`);
    durationsMs.push(entry.ms);
  }
  return Object.freeze({ srcs: Object.freeze(srcs), durationsMs: Object.freeze(durationsMs) });
}

/**
 * A fighter voice bank resolved from the manifest: the canonical variant
 * list filtered to the takes that exist, contiguous from slot 1 (the probe
 * contract — banks never have holes, and a hole would hide everything past
 * it just as the sequential probe did). Null when the manifest carries no
 * entry for this fighter, which sends the caller to the probe path.
 */
export function fighterBankFromManifest(manifest, fighterId, variants) {
  const files = manifest?.fighters?.[fighterId];
  if (!files || !Array.isArray(variants)) return null;
  const srcs = [];
  const durationsMs = [];
  for (const path of variants) {
    const entry = files[path.slice(path.lastIndexOf("/") + 1)];
    if (!entry) break;
    srcs.push(path);
    durationsMs.push(entry.ms);
  }
  return Object.freeze({ srcs: Object.freeze(srcs), durationsMs: Object.freeze(durationsMs) });
}

/**
 * The serialised announcer clock. Each accepted call starts no earlier than
 * its requested moment and no earlier than the previous call's end plus a
 * breath, then reserves its own real length. speechMs is the measured take
 * length (manifest, or the element's loaded metadata); when neither is known
 * the word-count estimate stands in, which is the pre-manifest behaviour.
 */
export function announcerWindow({ now, delay = 0, busyUntil = 0, speechMs = 0, line = "" }) {
  const length = positiveMs(speechMs) || announcerEstimateMs(line);
  const startAt = Math.max(now + Math.max(0, delay), busyUntil + ANNOUNCER_GAP_MS);
  return { startAt, busyUntil: startAt + length, speechMs: length };
}
