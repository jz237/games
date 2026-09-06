#!/usr/bin/env node
/**
 * Bake assets/audio/MANIFEST.json from the mp3s on disk.
 *
 * The runtime used to DISCOVER voice takes: every fighter bank HEAD-probed
 * its -2/-3 slots once per session (21-57 requests per fighter, 114 for a
 * devil vs commissioner fight) and the announcer guessed how long a take
 * runs from its word count (capped at 1.7 s while benny-wins-2 runs 4.68 s,
 * so layered KO -> wins -> comeback calls talked over each other). Every
 * take now exists, so both facts can be measured here, once, at build time:
 *
 *   announcer.files["ko-2.mp3"]      -> { ms: 2429, bytes: 39184 }
 *   fighters.alan.files["light.mp3"] -> { ms: 522,  bytes: 8365 }
 *
 * plus per-cue contiguous take counts (`cues`), which is what the pickers
 * clamp to. The runtime treats this file as the truth about what is on disk
 * (zero probes when it loads) and falls back to the old probe path only when
 * it is missing or unreadable, so it must be regenerated whenever a take is
 * added, removed or renamed:
 *
 *   node tools/audio/build_manifest.mjs           # write the manifest
 *   node tools/audio/build_manifest.mjs --check   # exit 1 if it is stale
 *
 * Durations come from `ffprobe -show_entries format=duration` (the same
 * number the file's stream reports — checked on ko-2, benny-wins-2, fight-3,
 * alan/light: format and stream durations agree to the microsecond). Nothing
 * here reads, decodes or rewrites audio samples: the reviewed takes are never
 * touched, only measured. The manifest is written remove-then-write because
 * the asset tree may be hardlinked into other checkouts.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const audioRoot = join(gameRoot, "assets", "audio");
const manifestPath = join(audioRoot, "MANIFEST.json");

// Take suffixes the runtime understands: numeric variant slots (`cue-2.mp3`,
// slot 1 is the bare `cue.mp3` for fighters and `cue-1.mp3` for the
// announcer) and the reviewed kick pools' a/b takes.
const TAKE_SUFFIX = /^(.+?)-(\d+|[ab])\.mp3$/;

function probeMs(file) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    file,
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`ffprobe failed on ${relative(gameRoot, file)}: ${result.stderr.trim() || result.error?.message}`);
  }
  const seconds = Number(result.stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe reported no duration for ${relative(gameRoot, file)}`);
  }
  return Math.round(seconds * 1000);
}

function mp3sIn(dir) {
  return readdirSync(dir).filter((name) => name.endsWith(".mp3")).sort();
}

function measureDir(dir) {
  const files = {};
  for (const name of mp3sIn(dir)) {
    const file = join(dir, name);
    files[name] = { ms: probeMs(file), bytes: statSync(file).size };
  }
  return files;
}

/**
 * Cue -> contiguous take count, derived the way the runtime pickers walk a
 * bank: slot 1, then 2, 3 ... stopping at the first hole. `firstSlot` is 0
 * for fighters (bare `cue.mp3` is slot 1) and 1 for the announcer (`cue-1`).
 * Files past a hole are reported as gaps so a misnamed take is loud, not
 * silently unreachable.
 */
function cueCounts(files, { announcer }) {
  const names = new Set(Object.keys(files));
  const cues = new Set();
  for (const name of names) {
    const match = name.match(TAKE_SUFFIX);
    cues.add(match ? match[1] : name.replace(/\.mp3$/, ""));
  }
  const counts = {};
  const gaps = [];
  for (const cue of [...cues].sort()) {
    const kick = [...names].filter((name) => /-[ab]\.mp3$/.test(name) && name.startsWith(`${cue}-`) && name.match(TAKE_SUFFIX)?.[1] === cue);
    if (kick.length) {
      counts[cue] = kick.length;
      continue;
    }
    let takes = 0;
    for (let slot = 1; slot <= 9; slot += 1) {
      const name = slot === 1 && !announcer ? `${cue}.mp3` : `${cue}-${slot}.mp3`;
      if (!names.has(name)) break;
      takes += 1;
    }
    counts[cue] = takes;
    for (const name of names) {
      const match = name.match(TAKE_SUFFIX);
      const slot = match && match[1] === cue ? Number(match[2]) : name === `${cue}.mp3` && !announcer ? 1 : NaN;
      if (Number.isFinite(slot) && slot > takes) gaps.push(name);
    }
  }
  return { counts, gaps };
}

function build() {
  const announcerFiles = measureDir(join(audioRoot, "announcer"));
  const announcerCues = cueCounts(announcerFiles, { announcer: true });
  const fighters = {};
  const gaps = [...announcerCues.gaps.map((name) => `announcer/${name}`)];
  for (const fighterId of readdirSync(join(audioRoot, "fighters")).sort()) {
    const dir = join(audioRoot, "fighters", fighterId);
    if (!statSync(dir).isDirectory()) continue;
    const files = measureDir(dir);
    const { counts, gaps: fighterGaps } = cueCounts(files, { announcer: false });
    gaps.push(...fighterGaps.map((name) => `fighters/${fighterId}/${name}`));
    fighters[fighterId] = { takes: Object.keys(files).length, cues: counts, files };
  }
  const shared = measureDir(audioRoot);
  return {
    generated: new Date().toISOString().slice(0, 10),
    tool: "tools/audio/build_manifest.mjs",
    purpose: "Per-take duration (ms) and size (bytes) of every voice take and shared sample, plus contiguous take counts per cue, measured from the files on disk with ffprobe. game.js reads this instead of HEAD-probing variant slots and instead of guessing announcer speech length from word counts; it falls back to those only when this file is missing. Regenerate whenever a take is added, removed or renamed.",
    announcer: { takes: Object.keys(announcerFiles).length, cues: announcerCues.counts, files: announcerFiles },
    fighters,
    shared,
    gaps,
  };
}

const manifest = build();
const json = `${JSON.stringify(manifest, null, 2)}\n`;
const totalTakes = manifest.announcer.takes + Object.values(manifest.fighters).reduce((sum, entry) => sum + entry.takes, 0);

if (process.argv.includes("--check")) {
  const current = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  const strip = ({ generated, ...rest }) => JSON.stringify(rest);
  if (!current || strip(current) !== strip(manifest)) {
    console.error(`assets/audio/MANIFEST.json is stale — run node tools/audio/build_manifest.mjs`);
    process.exit(1);
  }
  console.log(`assets/audio/MANIFEST.json is current (${totalTakes} takes, ${Object.keys(manifest.shared).length} shared files)`);
  process.exit(0);
}

if (existsSync(manifestPath)) unlinkSync(manifestPath);
writeFileSync(manifestPath, json);
console.log(`wrote ${relative(gameRoot, manifestPath)}: announcer ${manifest.announcer.takes} takes / ${Object.keys(manifest.announcer.cues).length} cues, ${Object.keys(manifest.fighters).length} fighters / ${totalTakes - manifest.announcer.takes} takes, ${Object.keys(manifest.shared).length} shared files`);
if (manifest.gaps.length) console.warn(`unreachable takes (hole before them in the bank): ${manifest.gaps.join(", ")}`);
