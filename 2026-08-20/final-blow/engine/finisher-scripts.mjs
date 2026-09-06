// ---------------------------------------------------------------------------
// v5.2 LOCOMOTION (bookends) — THE FINAL BLOW SCRIPTS, and the drawings they
// are keyed on.
//
// The ten cinematics lived in game.js as `finisherChoreography`, and every key
// carried its drawing as `af` / `vf`: a RAW BASE-ATLAS INDEX in the 4x4 atlas
// grammar the scripts were written against in wave 5 ("9 is a punch, 13 the
// heavy, 12 the crouch, 15 the flinch"). The pose resolver drew exactly that
// (`if (fighter.cinematicFrame !== null) return base(fighter.cinematicFrame)`),
// so the most-watched fifteen seconds in the game — the killing blow at 1.34x
// zoom, and the body under the spotlight after it — were the oldest generation
// on the roster, next to the unified family every other beat had moved to.
//
// The table is here now, VERBATIM in its timing, camera, zoom and rotation
// (`t`, `ax/ay/vx/vy`, `ar/vr`, `zoom`, `impacts`), so a node trace can walk a
// script the way the swing tests walk a strike; `af` / `vf` stay exactly as
// they were and are still what the sim stores in `cinematicFrame` (checksummed,
// rolled back, snapshotted); and each key gains the SAME-GENERATION DRAWING for
// that beat — `a` for the attacker, `v` for the victim — as a "bank:frame"
// token over the base cell, which is the exact pre-item chain on a fighter
// whose sheet is held. The bank token is a sheet frame, not a grammar cell.
//
//   attacker   unified (the prop-carrying cells: donald's club and the
//              commissioner's cane are on the unified sheet and on NO ext
//              sheet), ext2 (the gather, the throw release), ext3 (the strikes
//              and smears), ext5 (the run-in, the descent, the charge, the win)
//   victim     ext4 (dazed, head snap, body blow, big hit, launched, the
//              splayed wall splat laid down by the script's own rotation), the
//              ext5 carried fold at the top of a lift, and the ext4 KO cell
//              for the plain body at rest (`vPlain`, see finisherCinematicPose)
//   residual   post's PAINT LIFT / FULL COVERAGE keep base:13 / base:14 — the
//              spray can with its baked mist is a weapon-specific cinematic
//              drawing no sheet in the family carries.
//
// Coordinates are local to the victim: negative X begins behind the attacker,
// Y is height above the floor, and `af` / `vf` address the 4x4 atlas grammar.
// ---------------------------------------------------------------------------
import {
  UNIFIED_BANK,
  UNIFIED_EXT_BANK,
  UNIFIED_EXT2_BANK,
  UNIFIED_EXT3_BANK,
  UNIFIED_EXT4_BANK,
  UNIFIED_EXT5_BANK,
} from "./fighter-kits.mjs";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

/** The short bank names the tokens (and MOTION-ATLAS.md's attributions) use. */
export const CELL_TOKEN_BANKS = Object.freeze({
  base: "base",
  unified: UNIFIED_BANK,
  ext: UNIFIED_EXT_BANK,
  ext2: UNIFIED_EXT2_BANK,
  ext3: UNIFIED_EXT3_BANK,
  ext4: UNIFIED_EXT4_BANK,
  ext5: UNIFIED_EXT5_BANK,
});

/** "ext3:13" -> { bank: "unified-ext3", frame: 13 }; null for no token. Throws on an unknown bank. */
export function parseCellToken(token) {
  if (token === undefined || token === null) return null;
  const [short, frameText] = String(token).split(":");
  const bank = CELL_TOKEN_BANKS[short];
  const frame = Number(frameText);
  if (!bank || !Number.isInteger(frame) || frame < 0 || frame > 15) throw new Error(`Bad cell token: ${token}`);
  return { bank, frame };
}

/** The inverse, for traces: { bank, frame } -> "ext3:13". */
export function cellToken(pose) {
  const short = Object.entries(CELL_TOKEN_BANKS).find(([, bank]) => bank === pose.bank)?.[0] || pose.bank;
  return `${short}:${pose.frame}`;
}

export const FINISHER_CHOREOGRAPHY = Object.freeze({
  deathblow: {
    combo: "FAULTLINE FIVE",
    duration: 5.35,
    keys: [
      { t: 0, ax: -300, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02, a: "ext5:0", v: "ext4:5" },
      { t: .42, ax: -205, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.06, a: "ext5:1", v: "ext4:5" },
      { t: .68, ax: -58, ay: 0, af: 10, vx: 10, vy: 0, vf: 15, zoom: 1.12, a: "ext3:13", v: "ext4:2" },
      { t: 1.12, ax: -42, ay: 0, af: 13, vx: 28, vy: 38, vf: 15, vr: -.08, zoom: 1.15, a: "ext3:9", v: "ext4:1" },
      { t: 1.48, ax: -10, ay: 0, af: 14, vx: 58, vy: 176, vf: 15, vr: -.28, zoom: 1.22, a: "ext3:3", v: "ext4:3" },
      { t: 1.9, ax: -98, ay: 88, af: 13, vx: 62, vy: 225, vf: 15, vr: -.42, zoom: 1.18, a: "ext3:6", v: "ext4:6" },
      { t: 2.5, ax: -8, ay: 24, af: 14, vx: 30, vy: 0, vf: 15, vr: .62, zoom: 1.28, a: "ext3:14", v: "ext4:8" },
      { t: 3.3, ax: -130, ay: 0, af: 12, vx: 30, vy: 0, vf: 15, vr: .62, zoom: 1.12, a: "ext5:8", v: "ext4:8" },
      { t: 4.02, ax: -12, ay: 0, af: 14, vx: 48, vy: 0, vf: 15, vr: 1.18, zoom: 1.34, a: "ext3:4", v: "ext4:8" },
      { t: 5.35, ax: -118, ay: 0, af: 0, vx: 72, vy: 0, vf: 15, vr: 1.35, zoom: 1.08, a: "ext5:11", v: "ext4:8", vPlain: "ext4:15" },
    ],
    impacts: [
      { t: .68, label: "RAM", sound: "heavy", power: .55 },
      { t: 1.12, label: "RISING IRON", sound: "hit", power: .7 },
      { t: 1.48, label: "SKYBREAKER", sound: "special", power: .9 },
      { t: 2.5, label: "GROUND SLAM", sound: "heavy", power: 1.05 },
      { t: 4.02, label: "FAULTLINE", sound: "final", power: 1.45, final: true },
    ],
  },
  jez: {
    combo: "NEON SEVEN-PALM",
    duration: 5.25,
    keys: [
      { t: 0, ax: -305, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02, a: "ext5:0", v: "ext4:5" },
      { t: .38, ax: -150, ay: 0, af: 7, vx: 0, vy: 0, vf: 15, zoom: 1.07, a: "ext5:1", v: "ext4:5" },
      { t: .58, ax: -42, ay: 0, af: 9, vx: 4, vy: 0, vf: 15, zoom: 1.12, a: "ext3:0", v: "ext4:1" },
      { t: .86, ax: 48, ay: 0, af: 10, vx: -4, vy: 8, vf: 15, vr: .05, zoom: 1.15, a: "ext3:3", v: "ext4:2" },
      { t: 1.13, ax: -50, ay: 0, af: 9, vx: 6, vy: 16, vf: 15, vr: -.08, zoom: 1.17, a: "ext3:0", v: "ext4:1" },
      { t: 1.42, ax: 42, ay: 0, af: 10, vx: -8, vy: 28, vf: 15, vr: .12, zoom: 1.2, a: "ext3:3", v: "ext4:2" },
      { t: 1.82, ax: -58, ay: 0, af: 13, vx: 22, vy: 115, vf: 15, vr: -.2, zoom: 1.2, a: "ext3:9", v: "ext4:3" },
      { t: 2.25, ax: -5, ay: 155, af: 14, vx: 28, vy: 188, vf: 15, vr: -.5, zoom: 1.23, a: "ext3:6", v: "ext4:6" },
      { t: 2.8, ax: 65, ay: 50, af: 13, vx: 18, vy: 60, vf: 15, vr: .72, zoom: 1.17, a: "ext5:5", v: "ext4:8" },
      { t: 3.4, ax: -125, ay: 0, af: 12, vx: 18, vy: 0, vf: 15, vr: .72, zoom: 1.12, a: "ext5:8", v: "ext4:8" },
      { t: 4.0, ax: -16, ay: 0, af: 14, vx: 42, vy: 0, vf: 15, vr: 1.18, zoom: 1.33, a: "ext3:14", v: "ext4:8" },
      { t: 5.25, ax: -142, ay: 0, af: 0, vx: 64, vy: 0, vf: 15, vr: 1.35, zoom: 1.08, a: "ext5:11", v: "ext4:8", vPlain: "ext4:15" },
    ],
    impacts: [
      { t: .58, label: "PALM ONE", sound: "light", power: .38 },
      { t: .86, label: "PHASE STEP", sound: "hit", power: .48 },
      { t: 1.13, label: "NEON THREE", sound: "light", power: .5 },
      { t: 1.42, label: "SIGN FLASH", sound: "hit", power: .62 },
      { t: 1.82, label: "LIFT", sound: "heavy", power: .8 },
      { t: 2.25, label: "SKY PALM", sound: "special", power: .92 },
      { t: 4.0, label: "NEON GUILLOTINE", sound: "final", power: 1.42, final: true },
    ],
  },
  alan: {
    combo: "SOUTH STREET SIX",
    duration: 5.3,
    keys: [
      { t: 0, ax: -285, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02, a: "ext5:0", v: "ext4:5" },
      { t: .42, ax: -112, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.08, a: "ext5:1", v: "ext4:5" },
      { t: .66, ax: -42, ay: 0, af: 9, vx: 8, vy: 0, vf: 15, zoom: 1.13, a: "ext3:0", v: "ext4:2" },
      { t: .96, ax: -48, ay: 0, af: 10, vx: 16, vy: 4, vf: 15, vr: -.05, zoom: 1.14, a: "ext3:13", v: "ext4:1" },
      { t: 1.28, ax: -32, ay: 0, af: 13, vx: 35, vy: 60, vf: 15, vr: -.14, zoom: 1.18, a: "ext3:4", v: "ext4:2" },
      { t: 1.68, ax: -20, ay: 0, af: 14, vx: 58, vy: 188, vf: 15, vr: -.46, zoom: 1.24, a: "ext3:9", v: "ext4:6" },
      { t: 2.18, ax: -72, ay: 145, af: 13, vx: 55, vy: 220, vf: 15, vr: -.55, zoom: 1.2, a: "ext5:14", v: "ext5:7" },
      { t: 2.72, ax: 4, ay: 25, af: 14, vx: 24, vy: 0, vf: 15, vr: .78, zoom: 1.3, a: "ext2:13", v: "ext4:8" },
      { t: 3.42, ax: -112, ay: 0, af: 8, vx: 24, vy: 0, vf: 15, vr: .78, zoom: 1.12, a: "ext5:8", v: "ext4:8" },
      { t: 4.05, ax: -8, ay: 0, af: 13, vx: 52, vy: 0, vf: 15, vr: 1.22, zoom: 1.35, a: "ext3:13", v: "ext4:8" },
      { t: 5.3, ax: -130, ay: 0, af: 0, vx: 70, vy: 0, vf: 15, vr: 1.38, zoom: 1.08, a: "ext5:11", v: "ext4:8", vPlain: "ext4:15" },
    ],
    impacts: [
      { t: .66, label: "LEFT HOOK", sound: "light", power: .42 },
      { t: .96, label: "RIGHT CROSS", sound: "hit", power: .55 },
      { t: 1.28, label: "BODY BREAK", sound: "heavy", power: .72 },
      { t: 1.68, label: "UPPERCUT", sound: "special", power: .95 },
      { t: 2.72, label: "PILEDRIVER", sound: "heavy", power: 1.08 },
      { t: 4.05, label: "HEAVY HAND", sound: "final", power: 1.46, final: true },
    ],
  },
  post: {
    combo: "FULL COVERAGE",
    duration: 5.25,
    keys: [
      { t: 0, ax: -315, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02, a: "ext5:0", v: "ext4:5" },
      { t: .5, ax: -205, ay: 0, af: 8, vx: 0, vy: 0, vf: 15, zoom: 1.06, a: "ext2:14", v: "ext4:5" },
      { t: .82, ax: -155, ay: 0, af: 10, vx: 8, vy: 6, vf: 15, zoom: 1.12, a: "ext3:0", v: "ext4:1" },
      { t: 1.18, ax: -55, ay: 0, af: 9, vx: 18, vy: 12, vf: 15, vr: -.08, zoom: 1.15, a: "ext3:13", v: "ext4:2" },
      { t: 1.58, ax: 48, ay: 0, af: 10, vx: -8, vy: 32, vf: 15, vr: .14, zoom: 1.18, a: "ext3:3", v: "ext4:1" },
      { t: 1.96, ax: -35, ay: 0, af: 13, vx: 30, vy: 125, vf: 15, vr: -.28, zoom: 1.2, a: "base:13", v: "ext4:3" },
      { t: 2.42, ax: -12, ay: 128, af: 14, vx: 38, vy: 185, vf: 15, vr: -.5, zoom: 1.22, a: "base:14", v: "ext4:6" },
      { t: 2.92, ax: -85, ay: 0, af: 12, vx: 24, vy: 0, vf: 15, vr: .72, zoom: 1.14, a: "ext3:10", v: "ext4:8" },
      { t: 3.48, ax: -155, ay: 0, af: 13, vx: 24, vy: 0, vf: 15, vr: .72, zoom: 1.12, a: "base:13", v: "ext4:8" },
      { t: 4.0, ax: -28, ay: 0, af: 14, vx: 45, vy: 0, vf: 15, vr: 1.18, zoom: 1.34, a: "base:14", v: "ext4:8" },
      { t: 5.25, ax: -155, ay: 0, af: 0, vx: 72, vy: 0, vf: 15, vr: 1.36, zoom: 1.08, a: "ext5:11", v: "ext4:8", vPlain: "ext4:15" },
    ],
    impacts: [
      { t: .5, label: "PRIMER", sound: "special", power: .45 },
      { t: .82, label: "SPRAY BURST", sound: "hit", power: .55 },
      { t: 1.18, label: "ROLLER ONE", sound: "light", power: .55 },
      { t: 1.58, label: "ROLLER TWO", sound: "heavy", power: .7 },
      { t: 1.96, label: "PAINT LIFT", sound: "special", power: .88 },
      { t: 4.0, label: "FULL COVERAGE", sound: "final", power: 1.45, final: true },
    ],
  },
  benny: {
    combo: "CIRCUIT BREAKER",
    duration: 5.25,
    keys: [
      { t: 0, ax: -300, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02, a: "ext5:0", v: "ext4:5" },
      { t: .4, ax: -145, ay: 0, af: 7, vx: 0, vy: 0, vf: 15, zoom: 1.07, a: "ext5:1", v: "ext4:5" },
      { t: .62, ax: -44, ay: 0, af: 9, vx: 6, vy: 0, vf: 15, zoom: 1.12, a: "ext3:0", v: "ext4:1" },
      { t: .88, ax: 42, ay: 0, af: 10, vx: -4, vy: 10, vf: 15, vr: .05, zoom: 1.15, a: "ext3:3", v: "ext4:2" },
      { t: 1.14, ax: -46, ay: 0, af: 9, vx: 8, vy: 22, vf: 15, vr: -.09, zoom: 1.17, a: "ext3:1", v: "ext4:1" },
      { t: 1.45, ax: -28, ay: 0, af: 13, vx: 32, vy: 92, vf: 15, vr: -.2, zoom: 1.2, a: "ext3:9", v: "ext4:3" },
      { t: 1.88, ax: -8, ay: 100, af: 14, vx: 50, vy: 195, vf: 15, vr: -.48, zoom: 1.24, a: "ext3:7", v: "ext4:6" },
      { t: 2.4, ax: 55, ay: 65, af: 13, vx: 32, vy: 90, vf: 15, vr: .58, zoom: 1.2, a: "ext5:5", v: "ext4:8" },
      { t: 3.08, ax: -145, ay: 0, af: 12, vx: 24, vy: 0, vf: 15, vr: .72, zoom: 1.12, a: "ext5:8", v: "ext4:8" },
      { t: 3.96, ax: -22, ay: 0, af: 14, vx: 48, vy: 0, vf: 15, vr: 1.18, zoom: 1.34, a: "ext3:14", v: "ext4:8" },
      { t: 5.25, ax: -145, ay: 0, af: 0, vx: 72, vy: 0, vf: 15, vr: 1.36, zoom: 1.08, a: "ext5:11", v: "ext4:8", vPlain: "ext4:15" },
    ],
    impacts: [
      { t: .62, label: "HOT WIRE", sound: "light", power: .4 },
      { t: .88, label: "CROSS CURRENT", sound: "hit", power: .52 },
      { t: 1.14, label: "THREE-PHASE", sound: "light", power: .58 },
      { t: 1.45, label: "VOLTAGE LIFT", sound: "heavy", power: .82 },
      { t: 1.88, label: "ARC FLASH", sound: "special", power: 1 },
      { t: 3.96, label: "CIRCUIT BREAKER", sound: "final", power: 1.46, final: true },
    ],
  },
  donald: {
    combo: "GOLDEN BACK NINE",
    duration: 5.35,
    keys: [
      { t: 0, ax: -320, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02, a: "unified:1", v: "ext4:5" },
      { t: .48, ax: -185, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.07, a: "unified:3", v: "ext4:5" },
      { t: .76, ax: -72, ay: 0, af: 9, vx: 10, vy: 0, vf: 15, zoom: 1.12, a: "unified:10", v: "ext4:1" },
      { t: 1.08, ax: -58, ay: 0, af: 10, vx: 20, vy: 22, vf: 15, vr: -.08, zoom: 1.15, a: "unified:11", v: "ext4:2" },
      { t: 1.48, ax: -115, ay: 0, af: 13, vx: 20, vy: 22, vf: 15, vr: -.08, zoom: 1.12, a: "unified:8", v: "ext4:2" },
      { t: 1.86, ax: -28, ay: 0, af: 14, vx: 58, vy: 178, vf: 15, vr: -.45, zoom: 1.25, a: "unified:10", v: "ext4:6" },
      { t: 2.32, ax: -80, ay: 112, af: 13, vx: 68, vy: 220, vf: 15, vr: -.58, zoom: 1.2, a: "unified:9", v: "ext5:7" },
      { t: 2.78, ax: 18, ay: 52, af: 14, vx: 32, vy: 0, vf: 15, vr: .72, zoom: 1.3, a: "unified:11", v: "ext4:8" },
      { t: 3.38, ax: -180, ay: 0, af: 13, vx: 32, vy: 0, vf: 15, vr: .72, zoom: 1.12, a: "unified:8", v: "ext4:8" },
      { t: 4.08, ax: -30, ay: 0, af: 14, vx: 65, vy: 0, vf: 15, vr: 1.2, zoom: 1.36, a: "unified:10", v: "ext4:8" },
      { t: 5.35, ax: -180, ay: 0, af: 0, vx: 90, vy: 0, vf: 15, vr: 1.38, zoom: 1.08, a: "ext5:11", v: "ext4:8", vPlain: "ext4:15" },
    ],
    impacts: [
      { t: .76, label: "TEE SHOT", sound: "light", power: .42 },
      { t: 1.08, label: "CHIP SHOT", sound: "hit", power: .58 },
      { t: 1.86, label: "GOLDEN DRIVE", sound: "special", power: 1 },
      { t: 2.78, label: "CLUBHOUSE DROP", sound: "heavy", power: 1.08 },
      { t: 4.08, label: "YOU'RE FIRED", sound: "final", power: 1.5, final: true },
    ],
  },
  cyraxx: {
    combo: "FEEDBACK MELTDOWN",
    duration: 5.3,
    keys: [
      { t: 0, ax: -320, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02, a: "ext5:0", v: "ext4:5" },
      { t: .46, ax: -195, ay: 0, af: 7, vx: 0, vy: 0, vf: 15, zoom: 1.06, a: "ext5:1", v: "ext4:5" },
      { t: .72, ax: -90, ay: 0, af: 9, vx: 8, vy: 8, vf: 15, zoom: 1.12, a: "ext3:0", v: "ext4:1" },
      { t: 1.02, ax: 45, ay: 0, af: 10, vx: -6, vy: 18, vf: 15, vr: .08, zoom: 1.15, a: "ext3:1", v: "ext4:2" },
      { t: 1.34, ax: -48, ay: 0, af: 13, vx: 22, vy: 80, vf: 15, vr: -.18, zoom: 1.2, a: "ext3:9", v: "ext4:3" },
      { t: 1.75, ax: -15, ay: 95, af: 14, vx: 50, vy: 185, vf: 15, vr: -.45, zoom: 1.24, a: "ext3:6", v: "ext4:6" },
      { t: 2.2, ax: 70, ay: 80, af: 13, vx: 36, vy: 108, vf: 15, vr: .58, zoom: 1.2, a: "ext5:5", v: "ext4:8" },
      { t: 2.72, ax: -90, ay: 0, af: 12, vx: 26, vy: 0, vf: 15, vr: .7, zoom: 1.14, a: "ext3:10", v: "ext4:8" },
      { t: 3.3, ax: -165, ay: 0, af: 13, vx: 26, vy: 0, vf: 15, vr: .7, zoom: 1.12, a: "ext5:8", v: "ext4:8" },
      { t: 4.0, ax: -25, ay: 0, af: 14, vx: 54, vy: 0, vf: 15, vr: 1.2, zoom: 1.35, a: "ext3:13", v: "ext4:8" },
      { t: 5.3, ax: -165, ay: 0, af: 0, vx: 78, vy: 0, vf: 15, vr: 1.38, zoom: 1.08, a: "ext5:11", v: "ext4:8", vPlain: "ext4:15" },
    ],
    impacts: [
      { t: .72, label: "MIC CHECK", sound: "light", power: .4 },
      { t: 1.02, label: "STAFF SWEEP", sound: "hit", power: .56 },
      { t: 1.34, label: "GAIN SPIKE", sound: "heavy", power: .78 },
      { t: 1.75, label: "SONIC LIFT", sound: "special", power: 1 },
      { t: 2.2, label: "BUFFER DROP", sound: "heavy", power: 1.05 },
      { t: 4.0, label: "FEEDBACK BLACKOUT", sound: "final", power: 1.48, final: true },
    ],
  },
  ali: {
    combo: "WEST STAINES MASSIVE",
    duration: 5.3,
    keys: [
      { t: 0, ax: -310, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02, a: "ext5:0", v: "ext4:5" },
      { t: .42, ax: -175, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.07, a: "ext5:1", v: "ext4:5" },
      { t: .66, ax: -62, ay: 0, af: 9, vx: 8, vy: 5, vf: 15, zoom: 1.12, a: "ext3:0", v: "ext4:1" },
      { t: .94, ax: 45, ay: 0, af: 10, vx: -5, vy: 14, vf: 15, vr: .06, zoom: 1.15, a: "ext3:3", v: "ext4:2" },
      { t: 1.22, ax: -46, ay: 0, af: 9, vx: 12, vy: 30, vf: 15, vr: -.1, zoom: 1.17, a: "ext3:1", v: "ext4:1" },
      { t: 1.55, ax: -32, ay: 0, af: 13, vx: 34, vy: 105, vf: 15, vr: -.24, zoom: 1.2, a: "ext3:9", v: "ext4:3" },
      { t: 1.95, ax: -8, ay: 125, af: 14, vx: 54, vy: 195, vf: 15, vr: -.5, zoom: 1.25, a: "ext3:6", v: "ext4:6" },
      { t: 2.42, ax: 62, ay: 75, af: 13, vx: 34, vy: 92, vf: 15, vr: .58, zoom: 1.2, a: "ext3:7", v: "ext4:8" },
      { t: 3.05, ax: -150, ay: 0, af: 12, vx: 24, vy: 0, vf: 15, vr: .72, zoom: 1.12, a: "ext5:8", v: "ext4:8" },
      { t: 3.98, ax: -20, ay: 0, af: 14, vx: 52, vy: 0, vf: 15, vr: 1.2, zoom: 1.35, a: "ext3:13", v: "ext4:8" },
      { t: 5.3, ax: -150, ay: 0, af: 0, vx: 78, vy: 0, vf: 15, vr: 1.38, zoom: 1.08, a: "ext5:11", v: "ext4:8", vPlain: "ext4:15" },
    ],
    impacts: [
      { t: .66, label: "MIC ONE", sound: "light", power: .4 },
      { t: .94, label: "MIC TWO", sound: "hit", power: .52 },
      { t: 1.22, label: "BOOYAKASHA", sound: "light", power: .58 },
      { t: 1.55, label: "BASS LIFT", sound: "heavy", power: .82 },
      { t: 1.95, label: "MASSIVE AIR", sound: "special", power: 1 },
      { t: 2.42, label: "MIC DROP", sound: "heavy", power: 1.08 },
      { t: 3.98, label: "WEST STAINES MASSIVE", sound: "final", power: 1.5, final: true },
    ],
  },
  // Wave 17 — the Devil's ceremony is a hunt: a swoop in, talons, the horn
  // charge, a screech that lifts the victim off the floor, and the wings
  // closing for WING SHEAR like a trap springing shut.
  devil: {
    combo: "BARRENS CURSE",
    duration: 5.3,
    keys: [
      { t: 0, ax: -315, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02, a: "ext5:0", v: "ext4:5" },
      { t: .4, ax: -170, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.07, a: "ext5:1", v: "ext4:5" },
      { t: .64, ax: -52, ay: 0, af: 9, vx: 6, vy: 0, vf: 15, zoom: 1.12, a: "ext3:0", v: "ext4:1" },
      { t: .92, ax: 44, ay: 0, af: 10, vx: -5, vy: 12, vf: 15, vr: .06, zoom: 1.15, a: "ext3:3", v: "ext4:2" },
      { t: 1.24, ax: -44, ay: 0, af: 9, vx: 10, vy: 26, vf: 15, vr: -.1, zoom: 1.17, a: "ext3:1", v: "ext4:1" },
      { t: 1.58, ax: -30, ay: 0, af: 13, vx: 34, vy: 100, vf: 15, vr: -.24, zoom: 1.2, a: "ext3:13", v: "ext4:3" },
      { t: 1.98, ax: -6, ay: 130, af: 14, vx: 52, vy: 195, vf: 15, vr: -.5, zoom: 1.25, a: "ext3:6", v: "ext4:6" },
      { t: 2.46, ax: 58, ay: 72, af: 13, vx: 34, vy: 95, vf: 15, vr: .58, zoom: 1.2, a: "ext3:7", v: "ext4:8" },
      { t: 3.05, ax: -150, ay: 0, af: 12, vx: 26, vy: 0, vf: 15, vr: .72, zoom: 1.12, a: "ext5:8", v: "ext4:8" },
      { t: 3.98, ax: -18, ay: 0, af: 14, vx: 50, vy: 0, vf: 15, vr: 1.2, zoom: 1.35, a: "ext3:14", v: "ext4:8" },
      { t: 5.3, ax: -150, ay: 0, af: 0, vx: 76, vy: 0, vf: 15, vr: 1.38, zoom: 1.08, a: "ext5:11", v: "ext4:8", vPlain: "ext4:15" },
    ],
    impacts: [
      { t: .64, label: "SWOOP IN", sound: "light", power: .4 },
      { t: .92, label: "TALON RIP", sound: "hit", power: .54 },
      { t: 1.24, label: "TAIL LASH", sound: "light", power: .58 },
      { t: 1.58, label: "HORN CHARGE", sound: "heavy", power: .82 },
      { t: 1.98, label: "SCREECH LIFT", sound: "special", power: 1 },
      { t: 2.46, label: "PINE DROP", sound: "heavy", power: 1.06 },
      { t: 3.98, label: "WING SHEAR", sound: "final", power: 1.46, final: true },
    ],
  },
  // Wave 16 — the Commissioner's own ceremony: unhurried, procedural, cruel.
  // Cane taps close the distance, the hook drags the victim to the book, and
  // FINAL AUTHORITY lands like a sentence being read out.
  commissioner: {
    combo: "FINAL AUTHORITY",
    duration: 5.4,
    keys: [
      { t: 0, ax: -310, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02, a: "unified:1", v: "ext4:5" },
      { t: .5, ax: -215, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.06, a: "unified:3", v: "ext4:5" },
      { t: .8, ax: -120, ay: 0, af: 9, vx: 6, vy: 0, vf: 15, zoom: 1.11, a: "unified:10", v: "ext4:1" },
      { t: 1.14, ax: -58, ay: 0, af: 10, vx: 18, vy: 6, vf: 15, vr: -.06, zoom: 1.14, a: "unified:8", v: "ext4:2" },
      { t: 1.5, ax: -34, ay: 0, af: 13, vx: 34, vy: 52, vf: 15, vr: -.16, zoom: 1.18, a: "unified:11", v: "ext4:3" },
      { t: 1.92, ax: -14, ay: 0, af: 14, vx: 56, vy: 182, vf: 15, vr: -.44, zoom: 1.24, a: "unified:8", v: "ext4:6" },
      { t: 2.4, ax: -88, ay: 120, af: 13, vx: 60, vy: 216, vf: 15, vr: -.56, zoom: 1.19, a: "unified:9", v: "ext5:7" },
      { t: 2.9, ax: 6, ay: 20, af: 14, vx: 26, vy: 0, vf: 15, vr: .7, zoom: 1.29, a: "unified:10", v: "ext4:8" },
      { t: 3.5, ax: -140, ay: 0, af: 12, vx: 26, vy: 0, vf: 15, vr: .7, zoom: 1.12, a: "unified:7", v: "ext4:8" },
      { t: 4.1, ax: -16, ay: 0, af: 14, vx: 50, vy: 0, vf: 15, vr: 1.2, zoom: 1.35, a: "unified:8", v: "ext4:8" },
      { t: 5.4, ax: -132, ay: 0, af: 0, vx: 74, vy: 0, vf: 15, vr: 1.36, zoom: 1.08, a: "ext5:11", v: "ext4:8", vPlain: "ext4:15" },
    ],
    impacts: [
      { t: .8, label: "CANE TAP", sound: "light", power: .42 },
      { t: 1.14, label: "WRIT SERVED", sound: "hit", power: .55 },
      { t: 1.5, label: "GAVEL CRACK", sound: "heavy", power: .78 },
      { t: 1.92, label: "OVERRULE", sound: "special", power: .95 },
      { t: 2.9, label: "CONTEMPT", sound: "heavy", power: 1.08 },
      { t: 4.1, label: "FINAL AUTHORITY", sound: "final", power: 1.48, final: true },
    ],
  },
});

/**
 * The base cells a script still needs because no sheet in the family draws
 * them: post's spray can with its baked mist (PAINT LIFT, FULL COVERAGE and
 * the wind-up between). Pinned by the tests so a residual cannot appear
 * without being named here.
 */
export const FINISHER_RESIDUAL_BASE_CELLS = Object.freeze({
  post: Object.freeze([13, 14]),
});

/**
 * The per-key sampler, moved from game.js unchanged: eased positions,
 * rotation and zoom; the DRAWING switches at the half-way point of a segment
 * (`af` / `vf`, and now the same-generation tokens on the same rule, so the
 * new cell arrives on the exact tick the base cell always did).
 */
export function sampleFinisher(keys, elapsed) {
  let from = keys[0];
  let to = keys.at(-1);
  for (let index = 0; index < keys.length - 1; index += 1) {
    if (elapsed >= keys[index].t && elapsed <= keys[index + 1].t) {
      from = keys[index];
      to = keys[index + 1];
      break;
    }
  }
  const span = Math.max(.001, to.t - from.t);
  const linear = clamp((elapsed - from.t) / span, 0, 1);
  const eased = linear * linear * (3 - 2 * linear);
  const mix = (field, fallback = 0) => lerp(from[field] ?? fallback, to[field] ?? from[field] ?? fallback, eased);
  const key = linear < .5 ? from : to;
  return {
    ax: mix("ax"), ay: mix("ay"), vx: mix("vx"), vy: mix("vy"),
    ar: mix("ar"), vr: mix("vr"), zoom: mix("zoom", 1.08),
    af: key.af,
    vf: key.vf,
    a: key.a ?? null,
    v: key.v ?? null,
    vPlain: key.vPlain ?? null,
  };
}

/**
 * The descriptor the pose resolver hands on for a fighter inside a Final Blow:
 * the key's same-generation cell OVER the base cell the sim stored (the exact
 * pre-item drawing, so a held sheet is byte-identical), or that base cell
 * alone where a key carries no token.
 *
 * `plainBody` is the victim's read when his sprite is drawn WHOLE — no
 * dismemberment overlay. The graphic fatality slices the victim's cell into
 * bands by height (head 0-28%, torso, waist, legs) and anchors the stump at
 * the standing-pose arm and leg heights, so under the overlay the rest must
 * stay an UPRIGHT-PLAN cell laid down by the script's own rotation (the ext4
 * wall splat, arms and legs splayed — a body that hit something hard). With
 * the sprite drawn whole there is nothing to slice, and the body at rest is
 * the ext4 KO cell, authored flat, drawn flat (see cinematicDrawRotation).
 */
export function finisherCinematicPose(sample, role, fallback, { plainBody = false } = {}) {
  if (!sample) return fallback;
  const token = role === "attacker" ? sample.a : (plainBody && sample.vPlain) || sample.v;
  const cell = parseCellToken(token);
  if (!cell) return fallback;
  if (cell.bank === "base") return { bank: "base", frame: cell.frame };
  return { bank: cell.bank, frame: cell.frame, fallback };
}

/**
 * The cells authored LYING DOWN that a cinematic can key: the ext4 KO cell and
 * the unified knockdown (4.6 measured both flat — downTiltFor reads 0). A
 * script's `vr` was written to lay an UPRIGHT flinch down about its feet
 * (1.18 at the kill, 1.35-1.38 at rest, 77-79 degrees); applied to a cell
 * that already lies flat it would stand the body back up.
 */
export const CINEMATIC_PRONE_CELLS = Object.freeze({
  [UNIFIED_EXT4_BANK]: Object.freeze([15]),
  [UNIFIED_BANK]: Object.freeze([15]),
});

/** The prone settle's full-tilt reference — DOWN_TILT_RADIANS in both renderers. */
export const CINEMATIC_PRONE_LIE_RADIANS = 1.35;

export function isCinematicProneCell(bank, frame) {
  return Boolean(CINEMATIC_PRONE_CELLS[bank]?.includes(frame));
}

/**
 * The rotation a renderer applies for `cinematicRotation` on the cell it is
 * about to draw: unchanged for every upright-plan cell (every drawing the
 * scripts keyed before this item); for a prone cell the lie the drawing
 * already carries is taken off first, toward zero, so a script's rest angle
 * draws the KO cell flat and only what the script asks BEYOND a lie-down
 * (nothing today: the deepest rest is 1.38) would tilt it. Both renderers
 * read this — the 3D rig through the host bridge — so they cannot differ.
 */
export function cinematicDrawRotation(bank, frame, rotation, lie = CINEMATIC_PRONE_LIE_RADIANS) {
  if (!rotation) return 0;
  if (!isCinematicProneCell(bank, frame)) return rotation;
  const remainder = Math.max(0, Math.abs(rotation) - lie);
  return Math.sign(rotation) * remainder;
}

/** Every key's drawing for one script, as tokens, for the traces and the doc. */
export function finisherKeyTokens(scriptId) {
  const script = FINISHER_CHOREOGRAPHY[scriptId];
  if (!script) return null;
  return script.keys.map((key) => ({ t: key.t, af: key.af, vf: key.vf, a: key.a ?? null, v: key.v ?? null, vPlain: key.vPlain ?? null }));
}
