import {
  DEFAULT_INPUT_BUFFER_FRAMES,
  DeterministicRng,
  FIGHTER_STATES,
  FixedStepClock,
  FrameInputBuffer,
  SIMULATION_HZ,
  SIMULATION_STEP_SECONDS,
  createAttackInstance,
  hashSeed,
  transitionFighterState,
} from "./engine/foundation.mjs";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;
const FLOOR = 600;
const GRAVITY = 1850;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

const roster = [
  {
    id: "deathblow",
    name: "DEATHBLOW",
    title: "SEISMIC BRAWLER",
    mark: "DB",
    color: "#e52d2d",
    accent: "#ffb21f",
    weapon: "gauntlets",
    special: "FAULTLINE PUNCH",
    vfx: "seismic",
    finishers: ["FAULTLINE EXECUTION", "AFTERSHOCK BURIAL"],
  },
  {
    id: "jez",
    name: "JEZ",
    title: "BLUE-GI SIGNSMITH",
    mark: "JZ",
    color: "#14cbe8",
    accent: "#ff43c5",
    weapon: "signblade",
    special: "NEON PALM",
    vfx: "neon",
    finishers: ["NEON GUILLOTINE", "VINYL WRAP"],
  },
  {
    id: "alan",
    name: "ALLAN",
    title: "SOUTH PHILLY HEAVYWEIGHT",
    mark: "AL",
    color: "#d8d8d8",
    accent: "#e52d2d",
    weapon: "gauntlets",
    special: "SOUTH STREET SLAM",
    vfx: "steel",
    finishers: ["THE HEAVY HAND", "SOUTH STREET SHUTDOWN"],
  },
  {
    id: "post",
    name: "POST",
    title: "SPRAY-CAN BRAWLER",
    mark: "P",
    color: "#e59b25",
    accent: "#fff1b0",
    weapon: "spraycan",
    special: "PAINT THE TOWN",
    vfx: "paint",
    finishers: ["FULL COVERAGE", "WET PAINT"],
  },
  {
    id: "benny",
    name: "BENNY",
    title: "STREET TECHNICIAN",
    mark: "BN",
    color: "#416fe8",
    accent: "#f7e53e",
    weapon: "shockgloves",
    special: "BENNY BLITZ",
    vfx: "voltage",
    finishers: ["CIRCUIT BREAKER", "BENNY'S LAST CALL"],
  },
  {
    id: "donald",
    name: "DONALD TRUMP",
    title: "GILDED SHOWMAN",
    mark: "DT",
    color: "#315fb4",
    accent: "#f1bd26",
    weapon: "golfclub",
    special: "GOLDEN SHOCKWAVE",
    vfx: "gilded",
    finishers: ["GOLDEN SEND-OFF", "YOU'RE FIRED!"],
  },
  {
    id: "cyraxx",
    name: "CYRAXX",
    title: "FEEDBACK TRICKSTER",
    mark: "CX",
    color: "#54cf42",
    accent: "#ad5aff",
    weapon: "micstaff",
    special: "BUFFERING",
    vfx: "feedback",
    finishers: ["FEEDBACK BLACKOUT", "INTERNET MELTDOWN"],
  },
  {
    id: "ali",
    name: "ALI G",
    title: "WEST STAINES MC",
    mark: "AG",
    color: "#f4d21f",
    accent: "#ff48aa",
    weapon: "micchucks",
    special: "BASS DROP",
    vfx: "bass",
    finishers: ["MIC DROP", "WEST STAINES MASSIVE"],
  },
];

// Each Final Blow is staged as a short, character-specific arcade cinematic.
// Coordinates are local to the victim: negative X begins behind the attacker,
// Y is height above the floor, and frame numbers address the 4x4 atlas grammar.
const finisherScripts = {
  deathblow: {
    combo: "FAULTLINE FIVE",
    duration: 5.35,
    keys: [
      { t: 0, ax: -300, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .42, ax: -205, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.06 },
      { t: .68, ax: -58, ay: 0, af: 10, vx: 10, vy: 0, vf: 15, zoom: 1.12 },
      { t: 1.12, ax: -42, ay: 0, af: 13, vx: 28, vy: 38, vf: 15, vr: -.08, zoom: 1.15 },
      { t: 1.48, ax: -10, ay: 0, af: 14, vx: 58, vy: 176, vf: 15, vr: -.28, zoom: 1.22 },
      { t: 1.9, ax: -98, ay: 88, af: 13, vx: 62, vy: 225, vf: 15, vr: -.42, zoom: 1.18 },
      { t: 2.5, ax: -8, ay: 24, af: 14, vx: 30, vy: 0, vf: 15, vr: .62, zoom: 1.28 },
      { t: 3.3, ax: -130, ay: 0, af: 12, vx: 30, vy: 0, vf: 15, vr: .62, zoom: 1.12 },
      { t: 4.02, ax: -12, ay: 0, af: 14, vx: 48, vy: 0, vf: 15, vr: 1.18, zoom: 1.34 },
      { t: 5.35, ax: -118, ay: 0, af: 0, vx: 72, vy: 0, vf: 15, vr: 1.35, zoom: 1.08 },
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
      { t: 0, ax: -305, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .38, ax: -150, ay: 0, af: 7, vx: 0, vy: 0, vf: 15, zoom: 1.07 },
      { t: .58, ax: -42, ay: 0, af: 9, vx: 4, vy: 0, vf: 15, zoom: 1.12 },
      { t: .86, ax: 48, ay: 0, af: 10, vx: -4, vy: 8, vf: 15, vr: .05, zoom: 1.15 },
      { t: 1.13, ax: -50, ay: 0, af: 9, vx: 6, vy: 16, vf: 15, vr: -.08, zoom: 1.17 },
      { t: 1.42, ax: 42, ay: 0, af: 10, vx: -8, vy: 28, vf: 15, vr: .12, zoom: 1.2 },
      { t: 1.82, ax: -58, ay: 0, af: 13, vx: 22, vy: 115, vf: 15, vr: -.2, zoom: 1.2 },
      { t: 2.25, ax: -5, ay: 155, af: 14, vx: 28, vy: 188, vf: 15, vr: -.5, zoom: 1.23 },
      { t: 2.8, ax: 65, ay: 50, af: 13, vx: 18, vy: 60, vf: 15, vr: .72, zoom: 1.17 },
      { t: 3.4, ax: -125, ay: 0, af: 12, vx: 18, vy: 0, vf: 15, vr: .72, zoom: 1.12 },
      { t: 4.0, ax: -16, ay: 0, af: 14, vx: 42, vy: 0, vf: 15, vr: 1.18, zoom: 1.33 },
      { t: 5.25, ax: -142, ay: 0, af: 0, vx: 64, vy: 0, vf: 15, vr: 1.35, zoom: 1.08 },
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
      { t: 0, ax: -285, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .42, ax: -112, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.08 },
      { t: .66, ax: -42, ay: 0, af: 9, vx: 8, vy: 0, vf: 15, zoom: 1.13 },
      { t: .96, ax: -48, ay: 0, af: 10, vx: 16, vy: 4, vf: 15, vr: -.05, zoom: 1.14 },
      { t: 1.28, ax: -32, ay: 0, af: 13, vx: 35, vy: 60, vf: 15, vr: -.14, zoom: 1.18 },
      { t: 1.68, ax: -20, ay: 0, af: 14, vx: 58, vy: 188, vf: 15, vr: -.46, zoom: 1.24 },
      { t: 2.18, ax: -72, ay: 145, af: 13, vx: 55, vy: 220, vf: 15, vr: -.55, zoom: 1.2 },
      { t: 2.72, ax: 4, ay: 25, af: 14, vx: 24, vy: 0, vf: 15, vr: .78, zoom: 1.3 },
      { t: 3.42, ax: -112, ay: 0, af: 8, vx: 24, vy: 0, vf: 15, vr: .78, zoom: 1.12 },
      { t: 4.05, ax: -8, ay: 0, af: 13, vx: 52, vy: 0, vf: 15, vr: 1.22, zoom: 1.35 },
      { t: 5.3, ax: -130, ay: 0, af: 0, vx: 70, vy: 0, vf: 15, vr: 1.38, zoom: 1.08 },
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
      { t: 0, ax: -315, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .5, ax: -205, ay: 0, af: 8, vx: 0, vy: 0, vf: 15, zoom: 1.06 },
      { t: .82, ax: -155, ay: 0, af: 10, vx: 8, vy: 6, vf: 15, zoom: 1.12 },
      { t: 1.18, ax: -55, ay: 0, af: 9, vx: 18, vy: 12, vf: 15, vr: -.08, zoom: 1.15 },
      { t: 1.58, ax: 48, ay: 0, af: 10, vx: -8, vy: 32, vf: 15, vr: .14, zoom: 1.18 },
      { t: 1.96, ax: -35, ay: 0, af: 13, vx: 30, vy: 125, vf: 15, vr: -.28, zoom: 1.2 },
      { t: 2.42, ax: -12, ay: 128, af: 14, vx: 38, vy: 185, vf: 15, vr: -.5, zoom: 1.22 },
      { t: 2.92, ax: -85, ay: 0, af: 12, vx: 24, vy: 0, vf: 15, vr: .72, zoom: 1.14 },
      { t: 3.48, ax: -155, ay: 0, af: 13, vx: 24, vy: 0, vf: 15, vr: .72, zoom: 1.12 },
      { t: 4.0, ax: -28, ay: 0, af: 14, vx: 45, vy: 0, vf: 15, vr: 1.18, zoom: 1.34 },
      { t: 5.25, ax: -155, ay: 0, af: 0, vx: 72, vy: 0, vf: 15, vr: 1.36, zoom: 1.08 },
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
      { t: 0, ax: -300, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .4, ax: -145, ay: 0, af: 7, vx: 0, vy: 0, vf: 15, zoom: 1.07 },
      { t: .62, ax: -44, ay: 0, af: 9, vx: 6, vy: 0, vf: 15, zoom: 1.12 },
      { t: .88, ax: 42, ay: 0, af: 10, vx: -4, vy: 10, vf: 15, vr: .05, zoom: 1.15 },
      { t: 1.14, ax: -46, ay: 0, af: 9, vx: 8, vy: 22, vf: 15, vr: -.09, zoom: 1.17 },
      { t: 1.45, ax: -28, ay: 0, af: 13, vx: 32, vy: 92, vf: 15, vr: -.2, zoom: 1.2 },
      { t: 1.88, ax: -8, ay: 100, af: 14, vx: 50, vy: 195, vf: 15, vr: -.48, zoom: 1.24 },
      { t: 2.4, ax: 55, ay: 65, af: 13, vx: 32, vy: 90, vf: 15, vr: .58, zoom: 1.2 },
      { t: 3.08, ax: -145, ay: 0, af: 12, vx: 24, vy: 0, vf: 15, vr: .72, zoom: 1.12 },
      { t: 3.96, ax: -22, ay: 0, af: 14, vx: 48, vy: 0, vf: 15, vr: 1.18, zoom: 1.34 },
      { t: 5.25, ax: -145, ay: 0, af: 0, vx: 72, vy: 0, vf: 15, vr: 1.36, zoom: 1.08 },
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
      { t: 0, ax: -320, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .48, ax: -185, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.07 },
      { t: .76, ax: -72, ay: 0, af: 9, vx: 10, vy: 0, vf: 15, zoom: 1.12 },
      { t: 1.08, ax: -58, ay: 0, af: 10, vx: 20, vy: 22, vf: 15, vr: -.08, zoom: 1.15 },
      { t: 1.48, ax: -115, ay: 0, af: 13, vx: 20, vy: 22, vf: 15, vr: -.08, zoom: 1.12 },
      { t: 1.86, ax: -28, ay: 0, af: 14, vx: 58, vy: 178, vf: 15, vr: -.45, zoom: 1.25 },
      { t: 2.32, ax: -80, ay: 112, af: 13, vx: 68, vy: 220, vf: 15, vr: -.58, zoom: 1.2 },
      { t: 2.78, ax: 18, ay: 52, af: 14, vx: 32, vy: 0, vf: 15, vr: .72, zoom: 1.3 },
      { t: 3.38, ax: -180, ay: 0, af: 13, vx: 32, vy: 0, vf: 15, vr: .72, zoom: 1.12 },
      { t: 4.08, ax: -30, ay: 0, af: 14, vx: 65, vy: 0, vf: 15, vr: 1.2, zoom: 1.36 },
      { t: 5.35, ax: -180, ay: 0, af: 0, vx: 90, vy: 0, vf: 15, vr: 1.38, zoom: 1.08 },
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
      { t: 0, ax: -320, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .46, ax: -195, ay: 0, af: 7, vx: 0, vy: 0, vf: 15, zoom: 1.06 },
      { t: .72, ax: -90, ay: 0, af: 9, vx: 8, vy: 8, vf: 15, zoom: 1.12 },
      { t: 1.02, ax: 45, ay: 0, af: 10, vx: -6, vy: 18, vf: 15, vr: .08, zoom: 1.15 },
      { t: 1.34, ax: -48, ay: 0, af: 13, vx: 22, vy: 80, vf: 15, vr: -.18, zoom: 1.2 },
      { t: 1.75, ax: -15, ay: 95, af: 14, vx: 50, vy: 185, vf: 15, vr: -.45, zoom: 1.24 },
      { t: 2.2, ax: 70, ay: 80, af: 13, vx: 36, vy: 108, vf: 15, vr: .58, zoom: 1.2 },
      { t: 2.72, ax: -90, ay: 0, af: 12, vx: 26, vy: 0, vf: 15, vr: .7, zoom: 1.14 },
      { t: 3.3, ax: -165, ay: 0, af: 13, vx: 26, vy: 0, vf: 15, vr: .7, zoom: 1.12 },
      { t: 4.0, ax: -25, ay: 0, af: 14, vx: 54, vy: 0, vf: 15, vr: 1.2, zoom: 1.35 },
      { t: 5.3, ax: -165, ay: 0, af: 0, vx: 78, vy: 0, vf: 15, vr: 1.38, zoom: 1.08 },
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
      { t: 0, ax: -310, ay: 0, af: 0, vx: 0, vy: 0, vf: 15, zoom: 1.02 },
      { t: .42, ax: -175, ay: 0, af: 6, vx: 0, vy: 0, vf: 15, zoom: 1.07 },
      { t: .66, ax: -62, ay: 0, af: 9, vx: 8, vy: 5, vf: 15, zoom: 1.12 },
      { t: .94, ax: 45, ay: 0, af: 10, vx: -5, vy: 14, vf: 15, vr: .06, zoom: 1.15 },
      { t: 1.22, ax: -46, ay: 0, af: 9, vx: 12, vy: 30, vf: 15, vr: -.1, zoom: 1.17 },
      { t: 1.55, ax: -32, ay: 0, af: 13, vx: 34, vy: 105, vf: 15, vr: -.24, zoom: 1.2 },
      { t: 1.95, ax: -8, ay: 125, af: 14, vx: 54, vy: 195, vf: 15, vr: -.5, zoom: 1.25 },
      { t: 2.42, ax: 62, ay: 75, af: 13, vx: 34, vy: 92, vf: 15, vr: .58, zoom: 1.2 },
      { t: 3.05, ax: -150, ay: 0, af: 12, vx: 24, vy: 0, vf: 15, vr: .72, zoom: 1.12 },
      { t: 3.98, ax: -20, ay: 0, af: 14, vx: 52, vy: 0, vf: 15, vr: 1.2, zoom: 1.35 },
      { t: 5.3, ax: -150, ay: 0, af: 0, vx: 78, vy: 0, vf: 15, vr: 1.38, zoom: 1.08 },
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
};

const stages = {
  kensington: {
    name: "KENSINGTON & ALLEGHENY",
    ticker: "KENSINGTON & ALLEGHENY // PHILADELPHIA",
    src: "assets/kensington-allegheny.webp",
  },
  vet: {
    name: "THE VET PARKING LOT",
    ticker: "VETERANS STADIUM // SOUTH PHILADELPHIA // 1999",
    src: "assets/veterans-stadium.webp",
  },
};

const stageImages = {};
for (const [id, stage] of Object.entries(stages)) {
  const image = new Image();
  image.src = stage.src;
  stageImages[id] = image;
}

const fighterImages = {};
const fighterAtlases = {};
for (const fighter of roster) {
  const image = new Image();
  image.src = `assets/fighters/${fighter.id}.webp`;
  fighterImages[fighter.id] = image;
  const atlas = new Image();
  atlas.src = `assets/atlases/${fighter.id}.webp`;
  fighterAtlases[fighter.id] = atlas;
}

// Original soundtrack and combat cues generated with the ElevenLabs API.
const audioAssets = {
  select: "assets/audio/ui-select.mp3",
  jump: "assets/audio/jump.mp3",
  light: "assets/audio/light-swing.mp3",
  heavy: "assets/audio/heavy-swing.mp3",
  special: "assets/audio/special-swing.mp3",
  hit: "assets/audio/body-hit.mp3",
  block: "assets/audio/block.mp3",
  finish: "assets/audio/finish-ready.mp3",
  final: "assets/audio/final-blow.mp3",
  ko: "assets/audio/knockout.mp3",
};

const sfxVolumes = {
  select: 0.5,
  jump: 0.42,
  light: 0.5,
  heavy: 0.58,
  special: 0.65,
  hit: 0.72,
  block: 0.62,
  finish: 0.78,
  final: 0.92,
  ko: 0.8,
};

const sfxPools = Object.fromEntries(Object.entries(audioAssets).map(([kind, src]) => [
  kind,
  Array.from({ length: kind === "hit" ? 5 : 3 }, () => {
    const sample = new Audio(src);
    sample.preload = "auto";
    return sample;
  }),
]));
const sfxCursors = Object.fromEntries(Object.keys(audioAssets).map((kind) => [kind, 0]));

const musicTracks = [
  { title: "PHILLY AFTER DARK", src: "assets/audio/philly-after-dark.mp3" },
  { title: "VET PARKING LOT", src: "assets/audio/vet-parking-lot.mp3" },
  { title: "NEON SIGN WAR", src: "assets/audio/neon-sign-war.mp3" },
  { title: "SUBWAY AFTER MIDNIGHT", src: "assets/audio/subway-after-midnight.mp3" },
];
let currentTrackIndex = 0;
const fightMusic = new Audio(musicTracks[currentTrackIndex].src);
fightMusic.preload = "auto";
fightMusic.loop = false;
fightMusic.volume = 0.24;
let musicDuckTimer = 0;

const keys = new Set();
const pressed = new Set();
const touch = new Set();
const previousPads = new Map();
const commandHistory = [[], []];

const keyMaps = [
  { left: "KeyA", right: "KeyD", jump: "KeyW", block: "KeyS", light: "KeyJ", heavy: "KeyK", special: "KeyL", final: "KeyU" },
  { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", block: "ArrowDown", light: "Numpad1", heavy: "Numpad2", special: "Numpad3", final: "Numpad0" },
];

const simulationClock = new FixedStepClock();
const initialSeed = hashSeed("FINAL BLOW", "PHILLY AFTER DARK", "0.6-foundation");
const debugRequested = new URLSearchParams(location.search).has("debug");

const state = {
  screen: "title",
  mode: "arcade",
  picks: [0, 1],
  locks: [false, false],
  selectingPlayer: 0,
  stage: "kensington",
  fighters: [],
  particles: [],
  effects: [],
  rounds: [0, 0],
  round: 1,
  timer: 99,
  timerCarry: 0,
  phase: "idle",
  phaseTime: 0,
  finishWinner: -1,
  finisherType: 0,
  finisher: null,
  cinematicZoom: 1,
  shake: 0,
  flash: 0,
  hitstop: 0,
  lastRenderTime: performance.now(),
  simulationTick: 0,
  simulationAlpha: 0,
  simulationSteps: 0,
  simulationDroppedSeconds: 0,
  matchSerial: 0,
  matchSeed: initialSeed,
  rng: new DeterministicRng(initialSeed),
  debug: debugRequested,
  audio: null,
  audioUnlocked: false,
  musicDuck: 1,
  musicChoice: localStorage.getItem("final-blow-music-choice") || "auto",
  musicVolume: clamp(Number(localStorage.getItem("final-blow-music-volume") ?? "1"), 0, 1),
  sfxVolume: clamp(Number(localStorage.getItem("final-blow-sfx-volume") ?? "1"), 0, 1),
};

function random() {
  return state.rng.nextFloat();
}

function seedMatch(round = state.round) {
  state.matchSeed = hashSeed(
    initialSeed,
    state.matchSerial,
    round,
    state.picks[0],
    state.picks[1],
    state.stage,
  );
  state.rng.setState(state.matchSeed);
}

function makeFighter(index, side) {
  const def = roster[index];
  return {
    def,
    side,
    x: side === 0 ? 355 : 925,
    y: FLOOR,
    vx: 0,
    vy: 0,
    width: 92,
    height: 196,
    facing: side === 0 ? 1 : -1,
    health: 100,
    meter: 0,
    grounded: true,
    crouch: false,
    block: false,
    attacking: null,
    attackTime: 0,
    attackFrame: 0,
    attackHit: false,
    stun: 0,
    hitFlash: 0,
    specialGlow: 0,
    animTime: random() * 2,
    walkTime: random(),
    cinematicFrame: null,
    cinematicRotation: 0,
    cinematicScale: 1,
    down: false,
    aiClock: 0,
    combatState: FIGHTER_STATES.IDLE,
    previousCombatState: FIGHTER_STATES.IDLE,
    stateFrame: 0,
    stateEnteredTick: state.simulationTick,
    inputBuffer: new FrameInputBuffer(DEFAULT_INPUT_BUFFER_FRAMES),
  };
}

function setupRoster() {
  const grid = $("#rosterGrid");
  grid.innerHTML = "";
  roster.forEach((fighter, index) => {
    const card = document.createElement("button");
    card.className = "fighter-card";
    card.dataset.index = index;
    card.dataset.mark = fighter.mark;
    card.style.setProperty("--fighter", fighter.color);
    card.innerHTML = `
      <span class="pick-badge p1">P1</span><span class="pick-badge p2">P2</span>
      <img class="fighter-portrait" src="assets/fighters/${fighter.id}.webp" alt="" aria-hidden="true" draggable="false">
      <span class="fighter-info"><strong>${fighter.name}</strong><small>${fighter.title}</small></span>`;
    card.addEventListener("click", () => chooseFighter(index));
    grid.append(card);
  });
  updateRosterUI();
}

function showScreen(name) {
  state.screen = name;
  $$(".screen").forEach((screen) => screen.classList.toggle("active", screen.id === `${name}Screen`));
  const playing = name === "fight";
  $("#hud").classList.toggle("hidden", !playing);
  $("#hud").setAttribute("aria-hidden", String(!playing));
  $("#touchControls").classList.toggle("playing", playing);
  if (!playing) $("#announcer").classList.add("hidden");
  syncMusic();
}

function startSelect(mode) {
  enterImmersiveMode();
  unlockAudio();
  state.mode = mode;
  state.picks = [0, mode === "arcade" ? 4 : 1];
  state.locks = [false, mode === "arcade"];
  state.selectingPlayer = 0;
  $("#selectPrompt").textContent = "PLAYER 1 — CHOOSE";
  showScreen("select");
  updateRosterUI();
}

function chooseFighter(index) {
  unlockAudio();
  if (state.mode === "arcade") {
    state.picks[0] = index;
    state.locks = [true, true];
    let opponent = Math.floor(random() * roster.length);
    if (opponent === index) opponent = (opponent + 1) % roster.length;
    state.picks[1] = opponent;
  } else if (!state.locks[0]) {
    state.picks[0] = index;
    state.locks[0] = true;
    state.selectingPlayer = 1;
    $("#selectPrompt").textContent = "PLAYER 2 — CHOOSE";
  } else {
    state.picks[1] = index;
    state.locks[1] = true;
    state.selectingPlayer = 1;
  }
  sound("select");
  updateRosterUI();
}

function updateRosterUI() {
  $$(".fighter-card").forEach((card) => {
    const index = Number(card.dataset.index);
    card.classList.toggle("p1-pick", state.locks[0] && state.picks[0] === index);
    card.classList.toggle("p2-pick", state.locks[1] && state.picks[1] === index);
    card.classList.toggle("focused", !state.locks[state.selectingPlayer] && state.picks[state.selectingPlayer] === index);
  });
  $("#selectionReadout").innerHTML = `<span>P1</span> ${roster[state.picks[0]].name} <i>VS</i> <span>P2</span> ${roster[state.picks[1]].name}`;
  $("#fighterContinue").disabled = !(state.locks[0] && state.locks[1]);
}

function showStageSelect() {
  if (!(state.locks[0] && state.locks[1])) return;
  showScreen("stage");
  updateStageUI();
}

function chooseStage(id) {
  state.stage = id;
  sound("select");
  updateStageUI();
}

function updateStageUI() {
  $$(".stage-card").forEach((card) => card.classList.toggle("selected", card.dataset.stage === state.stage));
  $("#stageReadout").textContent = stages[state.stage].name;
  $("#stageTicker").textContent = stages[state.stage].ticker;
}

function startMatch(resetSet = true) {
  unlockAudio();
  if (state.musicChoice === "auto") advanceTrack();
  resetMusicDuck();
  if (resetSet) {
    state.rounds = [0, 0];
    state.round = 1;
  }
  state.matchSerial += 1;
  seedMatch(state.round);
  state.fighters = [makeFighter(state.picks[0], 0), makeFighter(state.picks[1], 1)];
  state.particles.length = 0;
  state.effects.length = 0;
  state.timer = 99;
  state.timerCarry = 0;
  state.phase = "intro";
  state.phaseTime = 2.25;
  state.hitstop = 0;
  state.finishWinner = -1;
  state.finisherType = 0;
  state.finisher = null;
  state.cinematicZoom = 1;
  $(".touch-final").classList.remove("ready");
  $("#touchControls").classList.remove("cinematic");
  commandHistory[0].length = 0;
  commandHistory[1].length = 0;
  updateHud();
  showScreen("fight");
  announce(`ROUND ${state.round}`, stages[state.stage].name, 1.2);
  setTimeout(() => {
    if (state.screen === "fight" && state.phase === "intro") announce("FIGHT!", "NO MERCY ON THESE STREETS", 0.8);
  }, 1150);
  canvas.focus();
}

function resetRound() {
  resetMusicDuck();
  state.round += 1;
  seedMatch(state.round);
  state.fighters = [makeFighter(state.picks[0], 0), makeFighter(state.picks[1], 1)];
  state.particles.length = 0;
  state.effects.length = 0;
  state.timer = 99;
  state.timerCarry = 0;
  state.phase = "intro";
  state.phaseTime = 2.1;
  state.hitstop = 0;
  state.finishWinner = -1;
  state.finisher = null;
  state.cinematicZoom = 1;
  $(".touch-final").classList.remove("ready");
  $("#touchControls").classList.remove("cinematic");
  commandHistory[0].length = 0;
  commandHistory[1].length = 0;
  updateHud();
  announce(`ROUND ${state.round}`, "SETTLE IT", 1.15);
  setTimeout(() => {
    if (state.screen === "fight" && state.phase === "intro") announce("FIGHT!", "", 0.75);
  }, 1050);
}

function announce(main, sub = "", duration = 1) {
  const box = $("#announcer");
  box.querySelector("strong").textContent = main;
  box.querySelector("span").textContent = sub;
  box.classList.remove("hidden");
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => box.classList.add("hidden"), duration * 1000);
}

function finishRound(winner, type = -1) {
  if (state.phase === "roundover" || state.phase === "result") return;
  state.phase = "roundover";
  state.rounds[winner] += 1;
  state.finisherType = type;
  const winDef = state.fighters[winner].def;
  if (type >= 0) {
    const duration = performFinisher(winner, type);
    state.phaseTime = duration;
    duckMusic(0.1, duration * 1000);
    announce("FINAL BLOW", `${winDef.finishers[type]} · ${finisherScripts[winDef.id].combo}`, 2.45);
  } else {
    state.phaseTime = 2.4;
    duckMusic(0.28, 1700);
    announce(`${winDef.name} WINS`, "KNOCKOUT", 1.65);
    sound("ko");
  }
  updateHud();
}

function performFinisher(winner, type) {
  const attacker = state.fighters[winner];
  const victim = state.fighters[1 - winner];
  const script = finisherScripts[attacker.def.id];
  const direction = attacker.x <= victim.x ? 1 : -1;
  const anchor = clamp(victim.x, 390, W - 390);
  attacker.attacking = null;
  attacker.vx = 0;
  attacker.vy = 0;
  attacker.down = false;
  victim.vx = 0;
  victim.vy = 0;
  victim.down = false;
  state.finisher = {
    winner,
    type,
    script,
    direction,
    anchor,
    elapsed: 0,
    impactIndex: 0,
    beatLabel: script.combo,
    beatLife: .8,
  };
  state.cinematicZoom = 1.02;
  state.shake = .16;
  $(".touch-final").classList.remove("ready");
  $("#touchControls").classList.add("cinematic");
  sound("special");
  return script.duration + .55;
}

function sampleFinisher(keys, elapsed) {
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
  return {
    ax: mix("ax"), ay: mix("ay"), vx: mix("vx"), vy: mix("vy"),
    ar: mix("ar"), vr: mix("vr"), zoom: mix("zoom", 1.08),
    af: linear < .5 ? from.af : to.af,
    vf: linear < .5 ? from.vf : to.vf,
  };
}

function triggerFinisherImpact(finisher, impact) {
  const attacker = state.fighters[finisher.winner];
  const victim = state.fighters[1 - finisher.winner];
  const finalImpact = Boolean(impact.final);
  const pointX = victim.x - finisher.direction * 12;
  const pointY = victim.y - (finalImpact ? 108 : 125);
  const gore = $("#goreToggle").checked;
  const count = Math.round((finalImpact ? 52 : 12) * impact.power * (gore ? 1.35 : 1));

  victim.hitFlash = finalImpact ? .22 : .11;
  attacker.specialGlow = finalImpact ? 1.1 : .45;
  state.hitstop = Math.max(state.hitstop, finalImpact ? .16 : .045 + impact.power * .028);
  state.shake = Math.max(state.shake, finalImpact ? 1.1 : .16 + impact.power * .22);
  if (finalImpact && $("#flashToggle").checked) state.flash = .34;
  finisher.beatLabel = impact.label;
  finisher.beatLife = finalImpact ? 1.05 : .48;

  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const speed = 100 + random() * (finalImpact ? 670 : 330) * impact.power;
    const splatter = finalImpact && gore && random() > .34;
    state.particles.push({
      x: pointX,
      y: pointY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (finalImpact ? 150 : 35),
      life: (finalImpact ? .65 : .22) + random() * (finalImpact ? 1.15 : .42),
      max: finalImpact ? 1.8 : .64,
      size: 2 + random() * (finalImpact ? 8 : 5),
      color: splatter ? "#d90b19" : random() > .38 ? attacker.def.accent : attacker.def.color,
    });
  }

  state.effects.push({
    kind: "finisherImpact",
    style: attacker.def.vfx,
    variant: finisher.type,
    final: finalImpact,
    power: impact.power,
    direction: finisher.direction,
    x: pointX,
    y: pointY,
    life: finalImpact ? 1.2 : .55,
    max: finalImpact ? 1.2 : .55,
    color: attacker.def.accent,
    secondary: attacker.def.color,
  });
  sound(impact.sound);
}

function updateFinisher(dt) {
  const finisher = state.finisher;
  if (!finisher) return;
  const attacker = state.fighters[finisher.winner];
  const victim = state.fighters[1 - finisher.winner];
  finisher.elapsed = Math.min(finisher.script.duration, finisher.elapsed + dt);
  finisher.beatLife = Math.max(0, finisher.beatLife - dt);
  const pose = sampleFinisher(finisher.script.keys, finisher.elapsed);

  attacker.x = finisher.anchor + finisher.direction * pose.ax;
  attacker.y = FLOOR - pose.ay;
  victim.x = finisher.anchor + finisher.direction * pose.vx;
  victim.y = FLOOR - pose.vy;
  attacker.facing = victim.x >= attacker.x ? 1 : -1;
  victim.facing = -attacker.facing;
  attacker.grounded = pose.ay < 2;
  victim.grounded = pose.vy < 2;
  attacker.cinematicFrame = pose.af;
  victim.cinematicFrame = pose.vf;
  attacker.cinematicRotation = pose.ar * finisher.direction;
  victim.cinematicRotation = pose.vr * finisher.direction;
  attacker.specialGlow = Math.max(attacker.specialGlow, .28 + Math.sin(finisher.elapsed * 9) * .08);
  attacker.block = false;
  victim.block = false;
  attacker.crouch = false;
  victim.crouch = false;
  state.cinematicZoom = pose.zoom;

  while (finisher.impactIndex < finisher.script.impacts.length
    && finisher.script.impacts[finisher.impactIndex].t <= finisher.elapsed) {
    triggerFinisherImpact(finisher, finisher.script.impacts[finisher.impactIndex]);
    finisher.impactIndex += 1;
  }
}

function showResult(winner) {
  state.phase = "result";
  state.finisher = null;
  state.cinematicZoom = 1;
  const def = state.fighters[winner].def;
  $("#resultTitle").textContent = `${def.name} WINS`;
  $("#resultFinisher").textContent = state.finisherType >= 0 ? def.finishers[state.finisherType] : "KNOCKOUT";
  showScreen("result");
}

function updateHud() {
  if (!state.fighters.length) return;
  state.fighters.forEach((fighter, side) => {
    const prefix = side === 0 ? "p1" : "p2";
    $(`#${prefix}Name`).textContent = fighter.def.name;
    const health = clamp(fighter.health, 0, 100) / 100;
    const healthBar = $(`#${prefix}Health`);
    healthBar.style.transform = `scaleX(${health})`;
    healthBar.classList.toggle("danger", health <= 0.25);
    $(`#${prefix}Damage`).style.transform = `scaleX(${health})`;
    $(`#${prefix}Meter`).style.transform = `scaleX(${clamp(fighter.meter, 0, 100) / 100})`;
    $(`#${prefix}Rounds`).innerHTML = [0, 1].map((round) => `<i class="${state.rounds[side] > round ? "won" : ""}"></i>`).join("");
  });
  $("#timer").textContent = String(Math.ceil(state.timer)).padStart(2, "0");
  $("#roundLabel").textContent = `ROUND ${state.round}`;
}

function getPad(index) {
  return [...(navigator.getGamepads?.() || [])].filter(Boolean)[index] || null;
}

function buttonValue(pad, index) {
  return pad?.buttons[index]?.pressed || (pad?.buttons[index]?.value || 0) > 0.55;
}

function readInput(side) {
  const map = keyMaps[side];
  const pad = getPad(side);
  const previous = previousPads.get(pad?.index) || [];
  const axisX = pad ? pad.axes[0] || 0 : 0;
  const axisY = pad ? pad.axes[1] || 0 : 0;
  const held = (action) => keys.has(map[action]) || (side === 0 && touch.has(action));
  const edge = (action) => {
    let active = false;
    if (pressed.has(map[action])) {
      active = true;
      pressed.delete(map[action]);
    }
    const touchToken = `${action}:pressed`;
    if (side === 0 && touch.has(touchToken)) {
      active = true;
      touch.delete(touchToken);
    }
    return active;
  };
  const padEdge = (index) => Boolean(pad && buttonValue(pad, index) && !previous[index]);
  const left = held("left") || axisX < -0.42 || buttonValue(pad, 14);
  const right = held("right") || axisX > 0.42 || buttonValue(pad, 15);
  const down = held("block") || axisY > 0.52 || buttonValue(pad, 13);
  const jump = edge("jump") || padEdge(0) || Boolean(pad && (axisY < -0.65 || buttonValue(pad, 12)) && !previous[20]);
  const light = edge("light") || padEdge(2);
  const heavy = edge("heavy") || padEdge(3);
  const special = edge("special") || padEdge(4) || padEdge(5);
  const triggers = buttonValue(pad, 6) && buttonValue(pad, 7);
  const previousTriggers = Boolean(previous[6] && previous[7]);
  const final = edge("final") || (triggers && !previousTriggers);
  if (pad) {
    const next = pad.buttons.map((button) => button.pressed || button.value > 0.55);
    next[20] = axisY < -0.65 || buttonValue(pad, 12);
    previousPads.set(pad.index, next);
  }
  return { left, right, down, jump, light, heavy, special, final };
}

function aiInput(fighter, opponent, dt) {
  fighter.aiClock -= dt;
  const distance = opponent.x - fighter.x;
  const input = { left: false, right: false, down: false, jump: false, light: false, heavy: false, special: false, final: false };
  if (state.phase === "finish" && state.finishWinner === 1) {
    input.final = fighter.aiClock <= 0;
    if (input.final) fighter.aiClock = 2;
    return input;
  }
  if (fighter.aiClock <= 0) {
    fighter.aiClock = 0.14 + random() * 0.32;
    const abs = Math.abs(distance);
    if (opponent.attacking && abs < 145 && random() < 0.62) input.down = true;
    else if (abs > 250) {
      input.right = distance > 0;
      input.left = distance < 0;
      if (random() < 0.22) input.special = true;
    } else if (abs > 115) {
      input.right = distance > 0;
      input.left = distance < 0;
      if (random() < 0.2) input.jump = true;
      if (random() < 0.32) input.special = true;
    } else {
      const roll = random();
      if (roll < 0.44) input.light = true;
      else if (roll < 0.78) input.heavy = true;
      else input.down = true;
    }
  } else if (Math.abs(distance) > 170) {
    input.right = distance > 0;
    input.left = distance < 0;
  }
  return input;
}

function rememberCommand(side, token) {
  const history = commandHistory[side];
  const frame = state.simulationTick;
  if (!history.length || history.at(-1).token !== token || frame - history.at(-1).frame > 9) history.push({ token, frame });
  while (history.length > 9 || (history[0] && frame - history[0].frame > 108)) history.shift();
}

function commandMatches(side, sequence) {
  const tokens = commandHistory[side].map((item) => item.token);
  let cursor = tokens.length - 1;
  for (let i = sequence.length - 1; i >= 0; i -= 1) {
    while (cursor >= 0 && tokens[cursor] !== sequence[i]) cursor -= 1;
    if (cursor < 0) return false;
    cursor -= 1;
  }
  return true;
}

function recordInput(side, input, fighter) {
  if (input.down) rememberCommand(side, "down");
  if (input.left) rememberCommand(side, fighter.facing === -1 ? "forward" : "back");
  if (input.right) rememberCommand(side, fighter.facing === 1 ? "forward" : "back");
  if (input.heavy) rememberCommand(side, "heavy");
  if (input.special) rememberCommand(side, "special");
}

function tryFinish(side, input) {
  if (state.phase !== "finish" || state.finishWinner !== side) return false;
  let type = -1;
  if (commandMatches(side, ["back", "down", "forward", "special"])) type = 1;
  else if (commandMatches(side, ["down", "forward", "heavy"])) type = 0;
  else if (input.final) type = commandHistory[side].some((item) => item.token === "special") ? 1 : 0;
  if (type >= 0) {
    finishRound(side, type);
    return true;
  }
  return false;
}

function beginAttack(fighter, kind) {
  if (fighter.attacking || fighter.stun > 0 || fighter.down) return;
  fighter.attacking = createAttackInstance(kind);
  fighter.attackTime = 0;
  fighter.attackFrame = 0;
  fighter.attackHit = false;
  if (kind === "special") fighter.specialGlow = 0.7;
  sound(kind);
}

const bufferedActions = ["jump", "light", "heavy", "special"];

function bufferActionInputs(fighter, input) {
  for (const action of bufferedActions) {
    if (input[action]) fighter.inputBuffer.push(action, state.simulationTick);
  }
  fighter.inputBuffer.prune(state.simulationTick);
}

function updateFighter(fighter, opponent, input, dt) {
  fighter.animTime += dt;
  fighter.stun = Math.max(0, fighter.stun - dt);
  fighter.hitFlash = Math.max(0, fighter.hitFlash - dt);
  fighter.specialGlow = Math.max(0, fighter.specialGlow - dt);
  fighter.facing = opponent.x >= fighter.x ? 1 : -1;
  fighter.block = false;
  fighter.crouch = false;

  recordInput(fighter.side, input, fighter);
  if (tryFinish(fighter.side, input)) return;
  if (state.phase !== "fight") return;
  bufferActionInputs(fighter, input);

  if (fighter.stun <= 0 && !fighter.attacking) {
    const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    fighter.block = input.down && fighter.grounded;
    fighter.crouch = fighter.block;
    fighter.vx = fighter.block ? 0 : move * 285;
    if (Math.abs(fighter.vx) > 20 && fighter.grounded) fighter.walkTime += dt;
    if (fighter.grounded && !fighter.block && fighter.inputBuffer.has("jump", state.simulationTick)) {
      fighter.inputBuffer.consume("jump", state.simulationTick);
      fighter.vy = -730;
      fighter.grounded = false;
      sound("jump");
    }
    const bufferedAttack = fighter.inputBuffer.consume(["special", "heavy", "light"], state.simulationTick);
    if (bufferedAttack) beginAttack(fighter, bufferedAttack.action);
  } else if (fighter.stun > 0) {
    fighter.vx *= 0.9;
  }

  if (fighter.attacking) {
    fighter.attackFrame += 1;
    fighter.attackTime = fighter.attackFrame * SIMULATION_STEP_SECONDS;
    fighter.vx *= 0.82;
    const attack = fighter.attacking;
    if (!fighter.attackHit && fighter.attackFrame >= attack.activeStartFrame && fighter.attackFrame < attack.activeEndFrame) {
      const vertical = Math.abs((fighter.y - fighter.height * 0.5) - (opponent.y - opponent.height * 0.5));
      const forwardDistance = (opponent.x - fighter.x) * fighter.facing;
      if (forwardDistance > 8 && forwardDistance < attack.range && vertical < 125) hit(fighter, opponent, attack);
    }
    if (fighter.attackFrame >= attack.totalFrames) {
      fighter.attacking = null;
      fighter.attackTime = 0;
      fighter.attackFrame = 0;
    }
  }

  fighter.vy += GRAVITY * dt;
  fighter.x += fighter.vx * dt;
  fighter.y += fighter.vy * dt;
  if (fighter.y >= FLOOR) {
    fighter.y = FLOOR;
    fighter.vy = 0;
    fighter.grounded = true;
  }
  fighter.x = clamp(fighter.x, 85, W - 85);
}

function hit(attacker, victim, attack) {
  attacker.attackHit = true;
  const blocked = victim.block && victim.facing === -attacker.facing;
  const damage = blocked ? Math.max(1, attack.damage * 0.22) : attack.damage;
  victim.health = clamp(victim.health - damage, 0, 100);
  victim.stun = blocked ? 0.09 : 0.18 + attack.damage * 0.009;
  victim.vx = attacker.facing * attack.push * (blocked ? 0.32 : 1);
  if (!blocked && attack.kind !== "light") victim.vy = -55 - attack.damage * 5;
  victim.hitFlash = 0.12;
  attacker.meter = clamp(attacker.meter + attack.meter, 0, 100);
  victim.meter = clamp(victim.meter + attack.meter * 0.45, 0, 100);
  state.shake = Math.max(state.shake, attack.kind === "special" ? 0.34 : 0.13);
  state.hitstop = Math.max(state.hitstop, blocked ? 0.035 : attack.kind === "special" ? 0.105 : attack.kind === "heavy" ? 0.075 : 0.045);
  spawnHit(victim.x - attacker.facing * 22, victim.y - 105, attacker.def, attack.kind, blocked);
  sound(blocked ? "block" : "hit");
  updateHud();

  if (victim.health <= 0 && state.phase === "fight") {
    state.phase = "finish";
    state.phaseTime = 6;
    state.finishWinner = attacker.side;
    victim.down = false;
    victim.stun = 99;
    attacker.attacking = null;
    attacker.meter = 100;
    duckMusic(0.34, 1900);
    announce("FINISH THEM", "PRESS FB  /  ↓ → HEAVY  /  ← ↓ → SPECIAL", 2.2);
    $(".touch-final").classList.add("ready");
    sound("finish");
  }
}

function spawnHit(x, y, def, attackKind, blocked) {
  const count = blocked ? 9 : attackKind === "special" ? 28 : attackKind === "heavy" ? 18 : 12;
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const speed = 90 + random() * 310;
    state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.18 + random() * 0.34, max: 0.55, size: 2 + random() * 6, color: random() > 0.34 ? def.accent : def.color });
  }
  state.effects.push({ kind: blocked ? "guard" : "hit", style: def.vfx, attackKind, x, y, life: attackKind === "special" ? 0.42 : 0.28, max: attackKind === "special" ? 0.42 : 0.28, color: def.accent });
}

function separateFighters() {
  const [a, b] = state.fighters;
  if (!a || !b) return;
  const overlap = 86 - Math.abs(a.x - b.x);
  if (overlap > 0) {
    const direction = a.x < b.x ? -1 : 1;
    a.x += direction * overlap * 0.5;
    b.x -= direction * overlap * 0.5;
  }
}

function resolveFighterState(fighter) {
  if (state.finisher) return FIGHTER_STATES.FINISHER;
  if (fighter.down) return FIGHTER_STATES.DOWN;
  if (fighter.stun > 0) return FIGHTER_STATES.HITSTUN;
  if (fighter.attacking) return FIGHTER_STATES.ATTACK;
  if (!fighter.grounded) return FIGHTER_STATES.JUMP;
  if (fighter.block) return FIGHTER_STATES.BLOCK;
  if (fighter.crouch) return FIGHTER_STATES.CROUCH;
  if (Math.abs(fighter.vx) > 20) return FIGHTER_STATES.WALK;
  return FIGHTER_STATES.IDLE;
}

function syncFighterStateMachines() {
  for (const fighter of state.fighters) {
    transitionFighterState(fighter, resolveFighterState(fighter), state.simulationTick);
  }
}

function simulateGameTick(dt) {
  if (state.screen !== "fight" || !state.fighters.length) return;
  if (document.body.classList.contains("orientation-blocked")) return;
  if (state.hitstop > 0) {
    state.hitstop = Math.max(0, state.hitstop - dt);
    return;
  }
  state.phaseTime = Math.max(0, state.phaseTime - dt);
  state.shake = Math.max(0, state.shake - dt * 2.8);
  state.flash = Math.max(0, state.flash - dt);

  let input0 = readInput(0);
  let input1 = state.mode === "arcade" ? aiInput(state.fighters[1], state.fighters[0], dt) : readInput(1);
  if (state.phase === "intro") {
    input0 = {};
    input1 = {};
    if (state.phaseTime <= 0) state.phase = "fight";
  }

  updateFighter(state.fighters[0], state.fighters[1], input0, dt);
  updateFighter(state.fighters[1], state.fighters[0], input1, dt);
  if (state.finisher) updateFinisher(dt);
  else separateFighters();
  syncFighterStateMachines();

  if (state.phase === "fight") {
    state.timerCarry += dt;
    if (state.timerCarry >= 1) {
      state.timer = Math.max(0, state.timer - Math.floor(state.timerCarry));
      state.timerCarry %= 1;
      updateHud();
    }
    if (state.timer <= 0) {
      const winner = state.fighters[0].health >= state.fighters[1].health ? 0 : 1;
      finishRound(winner, -1);
    }
  } else if (state.phase === "finish" && state.phaseTime <= 0) {
    finishRound(state.finishWinner, -1);
  } else if (state.phase === "roundover" && state.phaseTime <= 0) {
    const winner = state.rounds[0] > state.rounds[1] ? 0 : 1;
    if (state.rounds[winner] >= 2) showResult(winner);
    else resetRound();
  }

  for (const particle of state.particles) {
    particle.life -= dt;
    particle.vy += 720 * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.985;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
  for (const effect of state.effects) effect.life -= dt;
  state.effects = state.effects.filter((effect) => effect.life > 0);
}

function drawCover(image, offsetX = 0) {
  if (!image.complete || !image.naturalWidth) {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#0a1d35");
    gradient.addColorStop(1, "#100507");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const scale = Math.max(W / image.naturalWidth, H / image.naturalHeight);
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  ctx.drawImage(image, (W - dw) * 0.5 + offsetX, (H - dh) * 0.5, dw, dh);
}

function drawStage(time) {
  const center = state.fighters.length ? (state.fighters[0].x + state.fighters[1].x) * 0.5 : W * 0.5;
  const parallax = (center - W * 0.5) * -0.035;
  drawCover(stageImages[state.stage], parallax);
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(0,8,18,.12)");
  shade.addColorStop(0.58, "rgba(0,0,0,.03)");
  shade.addColorStop(1, "rgba(2,3,5,.74)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  if (state.stage === "kensington") drawShufflers(time);
  else drawVetAtmosphere(time);

  ctx.fillStyle = "rgba(6,8,11,.26)";
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.strokeStyle = state.stage === "vet" ? "rgba(255,177,50,.18)" : "rgba(70,190,240,.16)";
  ctx.lineWidth = 2;
  for (let x = -100; x < W + 200; x += 150) {
    ctx.beginPath();
    ctx.moveTo(x, FLOOR);
    ctx.lineTo(W * 0.5 + (x - W * 0.5) * 1.65, H);
    ctx.stroke();
  }
}

function drawShufflers(time) {
  const people = [
    { x: 155, y: 493, scale: 0.48, speed: 0.7 },
    { x: 540, y: 475, scale: 0.38, speed: 0.47 },
    { x: 1100, y: 492, scale: 0.52, speed: 0.58 },
  ];
  for (const person of people) {
    const drift = Math.sin(time * 0.00016 * person.speed + person.x) * 19;
    const sway = Math.sin(time * 0.0012 * person.speed + person.x) * 0.06;
    ctx.save();
    ctx.translate(person.x + drift, person.y);
    ctx.scale(person.scale, person.scale);
    ctx.rotate(sway);
    ctx.fillStyle = "rgba(5,7,10,.73)";
    ctx.beginPath();
    ctx.ellipse(0, -80, 24, 28, 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = "round";
    ctx.lineWidth = 28;
    ctx.strokeStyle = "rgba(5,7,10,.76)";
    ctx.beginPath();
    ctx.moveTo(-8, -60);
    ctx.lineTo(25, -10);
    ctx.lineTo(16, 55);
    ctx.stroke();
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(13, -34);
    ctx.lineTo(43, 22);
    ctx.moveTo(4, -34);
    ctx.lineTo(27, 28);
    ctx.moveTo(16, 48);
    ctx.lineTo(-2, 100);
    ctx.moveTo(22, 48);
    ctx.lineTo(43, 100);
    ctx.stroke();
    ctx.restore();
  }
  const trainX = ((time * 0.08) % (W + 650)) - 500;
  ctx.fillStyle = "rgba(18,31,40,.7)";
  ctx.fillRect(trainX, 154, 430, 58);
  for (let x = trainX + 24; x < trainX + 410; x += 53) {
    ctx.fillStyle = "rgba(255,211,105,.75)";
    ctx.fillRect(x, 166, 34, 22);
  }
}

function drawVetAtmosphere(time) {
  for (let i = 0; i < 5; i += 1) {
    const x = 110 + i * 275 + Math.sin(time * 0.0002 + i) * 10;
    const y = 492 + (i % 2) * 23;
    const smoke = 19 + Math.sin(time * 0.001 + i) * 7;
    const gradient = ctx.createRadialGradient(x, y - 40, 2, x, y - 40, smoke * 2.5);
    gradient.addColorStop(0, "rgba(210,220,225,.13)");
    gradient.addColorStop(1, "rgba(210,220,225,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y - 40, smoke * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function fighterAnimationFrame(fighter) {
  if (fighter.cinematicFrame !== null) return fighter.cinematicFrame;
  if (fighter.down || fighter.hitFlash > 0 || fighter.stun > 0.36) return 15;
  if (fighter.block || fighter.crouch) return 12;
  if (fighter.attacking) {
    const attack = fighter.attacking;
    const startup = attack.active[0];
    const activeEnd = attack.active[1];
    const time = fighter.attackTime;
    const frames = attack.kind === "light" ? [8, 9, 10, 11]
      : attack.kind === "heavy" ? [8, 13, 13, 11]
        : [8, 13, 14, 11];
    if (time < startup * 0.48) return frames[0];
    if (time < startup) return frames[1];
    if (time <= activeEnd) return frames[2];
    return frames[3];
  }
  if (!fighter.grounded) return fighter.vy < 0 ? 13 : 15;
  if (Math.abs(fighter.vx) > 22) return 4 + Math.floor(fighter.walkTime * 10) % 4;
  return Math.floor(fighter.animTime * 5) % 4;
}

function drawAtlasFrame(atlas, frame, size) {
  const cell = 320;
  ctx.drawImage(atlas, (frame % 4) * cell, Math.floor(frame / 4) * cell, cell, cell, -size * 0.5, -size, size, size);
}

function drawAttackVfx(fighter, time, activePower) {
  const attack = fighter.attacking;
  if (!attack || activePower <= 0) return;
  const strong = attack.kind === "special";
  const reach = attack.kind === "special" ? 178 : attack.kind === "heavy" ? 125 : 90;
  const pulse = 0.82 + Math.sin(time * 0.022) * 0.18;
  ctx.save();
  ctx.globalAlpha = clamp(activePower * (strong ? 1 : 0.72), 0, 1);
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = fighter.def.accent;
  ctx.fillStyle = fighter.def.accent;
  ctx.shadowColor = fighter.def.accent;
  ctx.shadowBlur = strong ? 26 : 13;
  ctx.lineCap = "round";

  if (fighter.def.vfx === "seismic") {
    ctx.lineWidth = strong ? 9 : 5;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(12 + i * 19, -4);
      ctx.lineTo(33 + i * 18, -18 - (i % 2) * 16);
      ctx.lineTo(49 + i * 20, -3);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(76, -5, reach * 0.7 * pulse, 24 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (fighter.def.vfx === "paint") {
    for (let i = 0; i < (strong ? 11 : 6); i += 1) {
      const x = 44 + i * 13;
      const y = -126 + Math.sin(i * 2.1 + time * 0.018) * (22 + i * 2);
      ctx.globalAlpha = activePower * (0.45 + (i % 3) * 0.2);
      ctx.beginPath(); ctx.arc(x, y, 3 + (i % 4) * 2.1, 0, Math.PI * 2); ctx.fill();
    }
  } else if (fighter.def.vfx === "voltage") {
    ctx.lineWidth = strong ? 8 : 4;
    for (let row = -1; row <= 1; row += 1) {
      ctx.beginPath(); ctx.moveTo(24, -130 + row * 22);
      for (let i = 1; i <= 6; i += 1) ctx.lineTo(24 + i * reach / 6, -130 + row * 22 + (i % 2 ? -12 : 12));
      ctx.stroke();
    }
  } else if (fighter.def.vfx === "neon") {
    ctx.lineWidth = strong ? 12 : 6;
    ctx.beginPath(); ctx.arc(28, -128, reach * 0.78, -1.12, 1.1); ctx.stroke();
    ctx.strokeStyle = fighter.def.color;
    ctx.lineWidth *= 0.38;
    ctx.beginPath(); ctx.arc(34, -128, reach * 0.66, -1.05, 1.03); ctx.stroke();
  } else if (fighter.def.vfx === "steel") {
    ctx.lineWidth = strong ? 8 : 4;
    ctx.beginPath(); ctx.arc(reach * 0.72, -118, 34 * pulse, 0, Math.PI * 2); ctx.stroke();
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath(); ctx.moveTo(38, -118 + i * 17); ctx.lineTo(reach + 24, -118 + i * 8); ctx.stroke();
    }
  } else if (fighter.def.vfx === "gilded") {
    ctx.lineWidth = strong ? 16 : 8;
    ctx.beginPath(); ctx.arc(20, -130, reach * 0.86, -1.15, 1.15); ctx.stroke();
  } else if (fighter.def.vfx === "feedback") {
    ctx.lineWidth = strong ? 8 : 4;
    for (let i = 0; i < 4; i += 1) {
      ctx.globalAlpha = activePower * (1 - i * 0.18);
      ctx.beginPath(); ctx.ellipse(48 + i * 35, -128, 17 + i * 9, 49 + i * 8, 0, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (fighter.def.vfx === "bass") {
    ctx.lineWidth = strong ? 10 : 5;
    for (let i = 0; i < 4; i += 1) {
      ctx.globalAlpha = activePower * (1 - i * 0.17);
      ctx.beginPath(); ctx.arc(42, -125, 35 + i * 31, -0.9, 0.9); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFighter(fighter, time) {
  const jump = FLOOR - fighter.y;
  const attack = fighter.attacking;
  const attackProgress = attack ? clamp(fighter.attackTime / attack.duration, 0, 1) : 0;
  const attackSwing = attack ? Math.sin(attackProgress * Math.PI) : 0;
  const startupPower = attack && fighter.attackTime < attack.active[0]
    ? Math.sin((fighter.attackTime / attack.active[0]) * Math.PI) : 0;
  const activePower = attack && fighter.attackTime >= attack.active[0] && fighter.attackTime <= attack.active[1]
    ? 1 : attack ? Math.max(0, attackSwing * 0.42) : 0;
  const moving = Math.abs(fighter.vx) > 22 && fighter.grounded && !attack;
  const bob = fighter.cinematicFrame === null && fighter.grounded && !fighter.stun && !fighter.block
    ? Math.sin((moving ? fighter.walkTime * 20 : fighter.animTime * 10) + fighter.side * 2) * (moving ? 1.8 : 2.7) : 0;
  const atlas = fighterAtlases[fighter.def.id];
  const frame = fighterAnimationFrame(fighter);
  const sizeAdjust = { deathblow: 1.08, jez: 1, alan: 1.08, post: 1.05, benny: 1.01, donald: 1.01, cyraxx: 1.02, ali: 1 }[fighter.def.id] || 1;
  const renderSize = 330 * sizeAdjust;
  const attackKind = attack?.kind;
  const lunge = attackSwing * (attackKind === "special" ? 68 : attackKind === "heavy" ? 46 : 29);
  const crouchScale = fighter.crouch ? 0.88 : 1;
  const crouchDrop = fighter.crouch ? 21 : 0;

  ctx.save();
  ctx.translate(fighter.x, fighter.y + bob);
  ctx.fillStyle = "rgba(0,0,0,.58)";
  ctx.beginPath();
  ctx.ellipse(0, jump + 5, renderSize * 0.24, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  if (fighter.cinematicRotation) ctx.rotate(fighter.cinematicRotation);
  if (fighter.cinematicScale !== 1) ctx.scale(fighter.cinematicScale, fighter.cinematicScale);

  if (fighter.down) {
    ctx.rotate(-fighter.facing * 1.35);
    ctx.translate(-fighter.facing * 45, 17);
  }

  ctx.scale(fighter.facing, 1);
  ctx.translate(lunge - startupPower * 8, crouchDrop - attackSwing * (attackKind === "special" ? 13 : 5));
  ctx.rotate(-attackSwing * (attackKind === "heavy" ? 0.07 : 0.025));
  ctx.scale(1 + activePower * 0.045 - startupPower * 0.025, crouchScale + startupPower * 0.035 - activePower * 0.025);

  if (fighter.specialGlow > 0) {
    const glow = ctx.createRadialGradient(0, -135, 16, 0, -135, 178);
    glow.addColorStop(0, `${fighter.def.accent}88`);
    glow.addColorStop(1, `${fighter.def.accent}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(-205, -335, 410, 350);
  }

  drawAttackVfx(fighter, time, activePower);

  if (atlas?.complete && atlas.naturalWidth) {
    const trails = attack ? (attackKind === "special" ? 3 : activePower > 0.8 ? 2 : 0) : 0;
    for (let index = trails; index >= 1; index -= 1) {
      ctx.save();
      ctx.translate(-index * (13 + activePower * 8), index * 1.5);
      ctx.globalAlpha = 0.08 + (trails - index) * 0.045;
      ctx.globalCompositeOperation = "screen";
      ctx.filter = "saturate(1.65) brightness(1.35)";
      ctx.shadowColor = fighter.def.accent;
      ctx.shadowBlur = 22;
      drawAtlasFrame(atlas, frame, renderSize);
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = fighter.specialGlow > 0 ? fighter.def.accent : "rgba(0,0,0,.9)";
    ctx.shadowBlur = fighter.specialGlow > 0 ? 25 : 9;
    ctx.shadowOffsetY = 6;
    if (fighter.hitFlash > 0) ctx.filter = "brightness(2.5) saturate(.28)";
    else if (fighter.block) ctx.filter = "brightness(.82) saturate(.78)";
    drawAtlasFrame(atlas, frame, renderSize);
    ctx.restore();
  } else {
    ctx.fillStyle = fighter.def.color;
    ctx.fillRect(-48, -205, 96, 205);
  }

  if (fighter.block) {
    ctx.strokeStyle = `${fighter.def.accent}dd`;
    ctx.shadowColor = fighter.def.accent;
    ctx.shadowBlur = 17;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(35, -139, 85, -1.18, 1.18);
    ctx.stroke();
  }
  ctx.restore();

  if (fighter.stun > 0.4 && !fighter.down) {
    ctx.fillStyle = fighter.def.accent;
    ctx.font = "900 22px Arial";
    ctx.textAlign = "center";
    ctx.fillText("✦", fighter.x, fighter.y - fighter.height - 38 + Math.sin(time * 0.02) * 8);
  }
}

function drawLimb(x1, y1, x2, y2, width, skin, cloth) {
  ctx.lineCap = "round";
  ctx.strokeStyle = cloth;
  ctx.lineWidth = width + 6;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(lerp(x1, x2, 0.62), lerp(y1, y2, 0.62));
  ctx.stroke();
  ctx.strokeStyle = skin;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(lerp(x1, x2, 0.58), lerp(y1, y2, 0.58));
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawWeapon(fighter, handX, handY, swing) {
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(-0.35 + swing * 1.25);
  ctx.strokeStyle = fighter.def.accent;
  ctx.fillStyle = fighter.def.accent;
  ctx.lineCap = "round";
  ctx.lineWidth = 8;
  switch (fighter.def.weapon) {
    case "gauntlets":
      ctx.fillRect(-12, -18, 42, 36);
      ctx.fillStyle = "#303741";
      for (let i = 0; i < 3; i += 1) ctx.fillRect(20 + i * 7, -15 + i * 3, 11, 8);
      break;
    case "signblade":
      ctx.shadowBlur = 20;
      ctx.shadowColor = fighter.def.accent;
      ctx.fillRect(-4, -12, 18, 20);
      ctx.fillRect(8, -94, 10, 100);
      ctx.fillRect(-4, -102, 34, 13);
      break;
    case "reelchain":
      ctx.beginPath();
      ctx.arc(10, -5, 21, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(25, -20);
      ctx.lineTo(73, -71);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case "posthammer":
      ctx.fillRect(6, -75, 9, 86);
      ctx.fillRect(-20, -89, 61, 25);
      break;
    case "caneblade":
      ctx.beginPath();
      ctx.moveTo(5, 8);
      ctx.lineTo(12, -94);
      ctx.quadraticCurveTo(36, -113, 47, -89);
      ctx.stroke();
      break;
    case "golfclub":
      ctx.strokeStyle = "#eee6c8";
      ctx.beginPath();
      ctx.moveTo(5, 8);
      ctx.lineTo(17, -91);
      ctx.stroke();
      ctx.fillStyle = fighter.def.accent;
      ctx.fillRect(10, -100, 43, 18);
      break;
    case "micstaff":
      ctx.fillRect(7, -99, 8, 113);
      ctx.beginPath();
      ctx.arc(11, -107, 15, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "micchucks":
      ctx.beginPath();
      ctx.moveTo(7, -10);
      ctx.lineTo(20, -55);
      ctx.moveTo(30, -66);
      ctx.lineTo(55, -99);
      ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(20, -55);
      ctx.lineTo(30, -66);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function drawFinisherImpact(effect, alpha) {
  const spread = (effect.final ? 155 : 72) * effect.power;
  const growth = 1 - alpha;
  ctx.globalCompositeOperation = "screen";
  ctx.lineCap = "round";
  ctx.fillStyle = effect.color;
  ctx.strokeStyle = effect.color;

  if (effect.style === "seismic") {
    ctx.lineWidth = effect.final ? 11 : 6;
    ctx.beginPath(); ctx.ellipse(0, 94, spread * (.35 + growth), 18 + growth * 38, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = -4; i <= 4; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * 12, 45); ctx.lineTo(i * 24, 85); ctx.lineTo(i * 43, 112 + (i % 2) * 12); ctx.stroke();
    }
  } else if (effect.style === "neon") {
    ctx.lineWidth = effect.final ? 10 : 5;
    ctx.rotate((effect.variant ? -1 : 1) * growth * .7);
    for (let i = 0; i < 3; i += 1) {
      const radius = spread * (.28 + i * .22 + growth * .28);
      ctx.beginPath(); ctx.arc(0, 0, radius, i * .7, i * .7 + Math.PI * 1.35); ctx.stroke();
    }
    ctx.strokeStyle = effect.secondary;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = i * Math.PI / 4;
      const radius = i % 2 ? spread * .32 : spread * .6;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
  } else if (effect.style === "steel") {
    ctx.lineWidth = effect.final ? 12 : 6;
    ctx.beginPath(); ctx.arc(0, 0, spread * (.3 + growth * .55), 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 12; i += 1) {
      const angle = i * Math.PI / 6;
      ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 18, Math.sin(angle) * 18); ctx.lineTo(Math.cos(angle) * spread, Math.sin(angle) * spread); ctx.stroke();
    }
  } else if (effect.style === "paint") {
    for (let i = 0; i < (effect.final ? 26 : 12); i += 1) {
      const angle = i * 2.399 + effect.variant;
      const radius = spread * (.15 + ((i * 37) % 100) / 120) * (0.45 + growth);
      ctx.globalAlpha = alpha * (.48 + (i % 3) * .2);
      ctx.fillStyle = i % 3 ? effect.color : effect.secondary;
      ctx.beginPath(); ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 4 + (i % 5) * 3, 0, Math.PI * 2); ctx.fill();
    }
  } else if (effect.style === "voltage") {
    ctx.lineWidth = effect.final ? 9 : 5;
    for (let branch = 0; branch < (effect.final ? 9 : 5); branch += 1) {
      const angle = branch * Math.PI * 2 / (effect.final ? 9 : 5);
      ctx.save(); ctx.rotate(angle); ctx.beginPath(); ctx.moveTo(0, 0);
      for (let step = 1; step <= 6; step += 1) ctx.lineTo(step * spread / 6, (step % 2 ? -1 : 1) * (8 + branch % 3 * 4));
      ctx.stroke(); ctx.restore();
    }
  } else if (effect.style === "gilded") {
    ctx.lineWidth = effect.final ? 18 : 9;
    for (let i = 0; i < 3; i += 1) {
      ctx.globalAlpha = alpha * (1 - i * .2);
      ctx.beginPath(); ctx.arc(-spread * .2, 0, spread * (.45 + i * .18 + growth * .2), -1.15, 1.15); ctx.stroke();
    }
  } else if (effect.style === "feedback") {
    ctx.lineWidth = effect.final ? 10 : 5;
    for (let i = 0; i < 5; i += 1) {
      ctx.globalAlpha = alpha * (1 - i * .13);
      const radius = spread * (.22 + i * .18 + growth * .22);
      ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * (.55 + i * .06), i % 2 ? .2 : -.2, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (effect.style === "bass") {
    ctx.lineWidth = effect.final ? 12 : 6;
    ctx.beginPath(); ctx.arc(0, 0, 20 + growth * 28, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      ctx.globalAlpha = alpha * (1 - i * .14);
      ctx.beginPath(); ctx.arc(0, 0, spread * (.25 + i * .19 + growth * .16), -1.1, 1.1); ctx.stroke();
    }
  }
}

function drawParticles() {
  for (const particle of state.particles) {
    ctx.globalAlpha = clamp(particle.life / particle.max, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const effect of state.effects) {
    const alpha = clamp(effect.life / (effect.max || 0.9), 0, 1);
    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = effect.color;
    ctx.shadowBlur = 25;
    ctx.shadowColor = effect.color;
    if (effect.kind === "finisherImpact") {
      drawFinisherImpact(effect, alpha);
    } else if (effect.kind === "slash") {
      ctx.lineWidth = 18 * alpha;
      ctx.beginPath();
      ctx.moveTo(-170, 110);
      ctx.lineTo(160, -150);
      ctx.stroke();
    } else if (effect.kind === "guard") {
      const radius = (1 - alpha) * 64 + 42;
      ctx.lineWidth = 9 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, radius, -1.45, 1.45);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 15, -1.18, 1.18);
      ctx.stroke();
    } else if (effect.kind === "hit") {
      const radius = (1 - alpha) * (effect.attackKind === "special" ? 120 : 68) + 18;
      ctx.lineWidth = (effect.attackKind === "special" ? 12 : 7) * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      const rays = effect.attackKind === "special" ? 12 : 8;
      for (let i = 0; i < rays; i += 1) {
        const angle = i * Math.PI * 2 / rays + (effect.style === "feedback" ? 0.18 : 0);
        const start = radius * 0.45;
        const end = radius * (effect.style === "seismic" && i % 2 ? 1.8 : 1.3);
        ctx.lineWidth = i % 2 ? 3 : 6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * start, Math.sin(angle) * start);
        ctx.lineTo(Math.cos(angle) * end, Math.sin(angle) * end);
        ctx.stroke();
      }
      if (["bass", "feedback", "voltage"].includes(effect.style)) {
        ctx.globalAlpha *= 0.65;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.45, radius * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      const radius = (1 - alpha) * 165 + 25;
      ctx.lineWidth = 11 * alpha;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawFinisherOverlay() {
  const finisher = state.finisher;
  if (!finisher) return;
  const attacker = state.fighters[finisher.winner];
  const progress = finisher.elapsed / finisher.script.duration;
  const barHeight = 24 + Math.sin(clamp(progress * 2, 0, 1) * Math.PI * .5) * 17;
  const tint = ctx.createRadialGradient(W * .5, H * .48, 90, W * .5, H * .48, W * .72);
  tint.addColorStop(0, `${attacker.def.accent}16`);
  tint.addColorStop(1, "rgba(0,0,0,.22)");
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,.9)";
  ctx.fillRect(0, 0, W, barHeight);
  ctx.fillRect(0, H - barHeight, W, barHeight);
  ctx.fillStyle = attacker.def.accent;
  ctx.fillRect(0, barHeight - 3, W, 3);
  ctx.fillRect(0, H - barHeight, W, 3);

  if (finisher.beatLife > 0) {
    const alpha = clamp(finisher.beatLife * 2.2, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.font = "900 17px Arial Narrow, Arial";
    ctx.fillStyle = "white";
    ctx.shadowColor = "black";
    ctx.shadowBlur = 8;
    ctx.fillText(finisher.beatLabel, W * .5, H - barHeight - 16);
    ctx.font = "900 11px Arial";
    ctx.fillStyle = attacker.def.accent;
    ctx.fillText(`${finisher.impactIndex} HIT FINAL COMBINATION`, W * .5, H - barHeight + 19);
    ctx.restore();
  }
}

function drawDebugOverlay() {
  if (!state.debug) return;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = "700 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "top";

  for (const fighter of state.fighters) {
    ctx.strokeStyle = fighter.side === 0 ? "#35e7ff" : "#ff4dc4";
    ctx.strokeRect(
      fighter.x - fighter.width * 0.5,
      fighter.y - fighter.height,
      fighter.width,
      fighter.height,
    );
    if (fighter.attacking
      && fighter.attackFrame >= fighter.attacking.activeStartFrame
      && fighter.attackFrame < fighter.attacking.activeEndFrame) {
      ctx.strokeStyle = "#ffef5a";
      const attackX = fighter.facing > 0 ? fighter.x + 8 : fighter.x - fighter.attacking.range;
      ctx.strokeRect(attackX, fighter.y - 190, fighter.attacking.range - 8, 150);
    }
  }

  const lines = [
    `SIM ${SIMULATION_HZ}HZ · TICK ${state.simulationTick} · STEPS ${state.simulationSteps}`,
    `ALPHA ${state.simulationAlpha.toFixed(3)} · DROPPED ${state.simulationDroppedSeconds.toFixed(3)}s`,
    `PHASE ${state.phase} · RNG ${state.rng.getState().toString(16).padStart(8, "0")}`,
    ...state.fighters.map((fighter) => `P${fighter.side + 1} ${fighter.combatState.toUpperCase()} F${fighter.stateFrame} · BUF ${fighter.inputBuffer.snapshot().map((entry) => entry.action).join("/") || "—"}`),
  ];
  const panelWidth = 560;
  const panelHeight = 18 + lines.length * 19;
  ctx.fillStyle = "rgba(0,0,0,.82)";
  ctx.fillRect(14, 64, panelWidth, panelHeight);
  ctx.strokeStyle = "rgba(70,235,255,.75)";
  ctx.strokeRect(14, 64, panelWidth, panelHeight);
  lines.forEach((line, index) => {
    ctx.fillStyle = index === 0 ? "#5cf3ff" : "#f4f7ff";
    ctx.fillText(line, 25, 74 + index * 19);
  });
  ctx.restore();
}

function draw(time) {
  ctx.save();
  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 18 : 0;
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 12 : 0;
  ctx.translate(shakeX, shakeY);
  if (state.finisher) {
    ctx.translate(W * .5, H * .53);
    ctx.scale(state.cinematicZoom, state.cinematicZoom);
    ctx.translate(-W * .5, -H * .53);
  }
  drawStage(time);
  if (state.screen === "fight") {
    const ordered = [...state.fighters].sort((a, b) => a.y - b.y);
    ordered.forEach((fighter) => drawFighter(fighter, time));
    drawParticles();
  }
  ctx.restore();
  drawFinisherOverlay();
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,245,220,${clamp(state.flash * 3, 0, 0.9)})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawDebugOverlay();
}

function clearLatchedInputEdges() {
  pressed.clear();
  for (const token of [...touch]) if (token.endsWith(":pressed")) touch.delete(token);
}

function runSimulationStep(dt, tick) {
  state.simulationTick = tick;
  simulateGameTick(dt);
}

function loop(now) {
  const elapsed = Math.max(0, (now - state.lastRenderTime) / 1000 || 0);
  state.lastRenderTime = now;
  const frame = simulationClock.advance(elapsed, runSimulationStep);
  state.simulationTick = frame.tick;
  state.simulationAlpha = frame.alpha;
  state.simulationSteps = frame.steps;
  state.simulationDroppedSeconds = frame.droppedSeconds;
  if (frame.steps > 0) clearLatchedInputEdges();
  draw(now);
  requestAnimationFrame(loop);
}

function musicBaseVolume() {
  return {
    title: 0.23,
    select: 0.27,
    stage: 0.28,
    fight: 0.34,
    result: 0.25,
  }[state.screen] || 0.25;
}

function updateMusicUi() {
  const select = $("#musicSelect");
  if (select) select.value = state.musicChoice;
  const button = $("#trackButton");
  if (button) button.textContent = `♫ ${state.musicChoice === "auto" ? "AUTO · " : ""}${musicTracks[currentTrackIndex].title}`;
}

function updateVolumeUi() {
  const musicSlider = $("#musicVolume");
  const sfxSlider = $("#sfxVolume");
  if (musicSlider) musicSlider.value = String(Math.round(state.musicVolume * 100));
  if (sfxSlider) sfxSlider.value = String(Math.round(state.sfxVolume * 100));
  if ($("#musicVolumeValue")) $("#musicVolumeValue").textContent = `${Math.round(state.musicVolume * 100)}%`;
  if ($("#sfxVolumeValue")) $("#sfxVolumeValue").textContent = `${Math.round(state.sfxVolume * 100)}%`;
}

function setTrack(index, restart = true) {
  const next = (index + musicTracks.length) % musicTracks.length;
  const changed = next !== currentTrackIndex;
  currentTrackIndex = next;
  if (changed) {
    fightMusic.pause();
    fightMusic.src = musicTracks[currentTrackIndex].src;
    fightMusic.load();
  } else if (restart) {
    fightMusic.currentTime = 0;
  }
  updateMusicUi();
  syncMusic();
}

function advanceTrack() {
  setTrack(currentTrackIndex + 1, true);
}

function chooseMusic(choice) {
  state.musicChoice = choice;
  localStorage.setItem("final-blow-music-choice", choice);
  if (choice !== "auto") setTrack(Number(choice), true);
  else {
    updateMusicUi();
    syncMusic();
  }
}

function syncMusic() {
  if (!state.audioUnlocked) return;
  const enabled = Boolean($("#musicToggle")?.checked);
  fightMusic.loop = state.musicChoice !== "auto";
  fightMusic.volume = clamp(musicBaseVolume() * state.musicDuck * state.musicVolume, 0, 1);
  if (!enabled || document.hidden) {
    fightMusic.pause();
    return;
  }
  if (fightMusic.paused) fightMusic.play().catch(() => {});
}

function resetMusicDuck() {
  window.clearTimeout(musicDuckTimer);
  state.musicDuck = 1;
  syncMusic();
}

function duckMusic(amount, duration) {
  window.clearTimeout(musicDuckTimer);
  state.musicDuck = amount;
  syncMusic();
  musicDuckTimer = window.setTimeout(() => {
    state.musicDuck = 1;
    syncMusic();
  }, duration);
}

function stopSfx() {
  Object.values(sfxPools).flat().forEach((sample) => {
    sample.pause();
    sample.currentTime = 0;
  });
}

function unlockAudio() {
  state.audioUnlocked = true;
  if ($("#soundToggle").checked) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !state.audio) state.audio = new AudioContextClass();
    if (state.audio?.state === "suspended") state.audio.resume();
  }
  syncMusic();
}

function sound(kind) {
  if (!$("#soundToggle").checked) return;
  unlockAudio();
  const pool = sfxPools[kind];
  if (!pool?.length) {
    proceduralSound(kind);
    return;
  }
  const cursor = sfxCursors[kind] % pool.length;
  sfxCursors[kind] = cursor + 1;
  const sample = pool[cursor];
  sample.pause();
  sample.currentTime = 0;
  sample.volume = (sfxVolumes[kind] ?? 0.62) * state.sfxVolume;
  const playback = sample.play();
  if (playback?.catch) playback.catch(() => proceduralSound(kind));
}

function proceduralSound(kind) {
  if (!state.audio) return;
  const now = state.audio.currentTime;
  const oscillator = state.audio.createOscillator();
  const gain = state.audio.createGain();
  const settings = {
    select: [280, 430, 0.055, "square", 0.055],
    jump: [180, 340, 0.1, "sine", 0.045],
    light: [120, 70, 0.08, "square", 0.045],
    heavy: [95, 42, 0.16, "sawtooth", 0.065],
    special: [220, 55, 0.3, "sawtooth", 0.075],
    hit: [80, 35, 0.12, "square", 0.08],
    block: [520, 210, 0.08, "square", 0.04],
    finish: [160, 52, 0.8, "sawtooth", 0.09],
    final: [70, 24, 1.2, "sawtooth", 0.12],
    ko: [130, 45, 0.55, "square", 0.08],
  }[kind] || [160, 80, 0.1, "sine", 0.04];
  oscillator.type = settings[3];
  oscillator.frequency.setValueAtTime(settings[0], now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, settings[1]), now + settings[2]);
  gain.gain.setValueAtTime(Math.max(0.0001, settings[4] * state.sfxVolume), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + settings[2]);
  oscillator.connect(gain).connect(state.audio.destination);
  oscillator.start(now);
  oscillator.stop(now + settings[2]);
}

function back(target) {
  if (target === "title") showScreen("title");
  else if (target === "select") showScreen("select");
}

function isPhoneViewport() {
  return navigator.maxTouchPoints > 0
    && window.matchMedia("(pointer: coarse)").matches
    && Math.min(window.innerWidth, window.innerHeight) <= 680;
}

function syncOrientationGate() {
  const phone = isPhoneViewport();
  const portrait = window.innerHeight > window.innerWidth;
  document.body.classList.toggle("orientation-blocked", phone && portrait);
  document.body.classList.toggle("mobile-landscape", phone && !portrait);
}

function lockLandscape() {
  if (!screen.orientation?.lock) return;
  screen.orientation.lock("landscape").catch(() => {});
}

function enterImmersiveMode() {
  if (!isPhoneViewport()) return;
  const app = $("#app");
  const request = app.requestFullscreen?.({ navigationUI: "hide" }) || app.webkitRequestFullscreen?.();
  if (request?.then) request.then(lockLandscape).catch(() => {});
  else lockLandscape();
}

function titleKeyboard(event) {
  if (state.screen === "title" && (event.code === "Enter" || event.code === "Space")) startSelect("arcade");
  if (event.code === "Escape") {
    if (state.screen === "fight") showScreen("title");
    else if (state.screen !== "title") showScreen("title");
  }
  if (state.screen === "select" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
    event.preventDefault();
    const side = state.locks[0] ? 1 : 0;
    if (state.mode === "arcade" && state.locks[0]) return;
    const delta = event.code === "ArrowLeft" ? -1 : event.code === "ArrowRight" ? 1 : event.code === "ArrowUp" ? -4 : 4;
    state.picks[side] = (state.picks[side] + delta + roster.length) % roster.length;
    state.selectingPlayer = side;
    updateRosterUI();
  }
  if (state.screen === "select" && event.code === "Enter") chooseFighter(state.picks[state.selectingPlayer]);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) event.preventDefault();
  if (event.code === "F3") {
    event.preventDefault();
    state.debug = !state.debug;
  }
  if (!keys.has(event.code)) pressed.add(event.code);
  keys.add(event.code);
  titleKeyboard(event);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => { keys.clear(); pressed.clear(); });

window.addEventListener("gamepadconnected", (event) => {
  $("#padStatus").classList.add("connected");
  $("#padStatus").lastChild.textContent = ` ${event.gamepad.id.split("(")[0].trim().slice(0, 28)} READY`;
  sound("select");
});
window.addEventListener("gamepaddisconnected", () => {
  if (![...(navigator.getGamepads?.() || [])].filter(Boolean).length) {
    $("#padStatus").classList.remove("connected");
    $("#padStatus").lastChild.textContent = " KEYBOARD READY";
  }
});

let menuPadWasPressed = false;
function menuPadLoop() {
  const pad = getPad(0);
  const confirm = buttonValue(pad, 0) || buttonValue(pad, 9);
  if (confirm && !menuPadWasPressed) {
    if (state.screen === "title") startSelect("arcade");
    else if (state.screen === "select") {
      if (state.locks[0] && state.locks[1]) showStageSelect();
      else chooseFighter(state.picks[state.selectingPlayer]);
    } else if (state.screen === "stage") startMatch(true);
    else if (state.screen === "result") startMatch(true);
  }
  menuPadWasPressed = confirm;
  requestAnimationFrame(menuPadLoop);
}

$$('[data-mode]').forEach((button) => button.addEventListener("click", () => startSelect(button.dataset.mode)));
$("#controlsButton").addEventListener("click", () => { unlockAudio(); $("#controlsDialog").showModal(); });
$("#musicToggle").addEventListener("change", () => {
  unlockAudio();
  syncMusic();
});
$("#musicVolume").addEventListener("input", (event) => {
  state.musicVolume = Number(event.target.value) / 100;
  localStorage.setItem("final-blow-music-volume", String(state.musicVolume));
  updateVolumeUi();
  unlockAudio();
  syncMusic();
});
$("#sfxVolume").addEventListener("input", (event) => {
  state.sfxVolume = Number(event.target.value) / 100;
  localStorage.setItem("final-blow-sfx-volume", String(state.sfxVolume));
  updateVolumeUi();
});
$("#musicSelect").addEventListener("change", (event) => {
  unlockAudio();
  chooseMusic(event.target.value);
});
$("#trackButton").addEventListener("click", () => {
  unlockAudio();
  advanceTrack();
});
fightMusic.addEventListener("ended", () => {
  if (state.musicChoice === "auto") advanceTrack();
  else {
    fightMusic.currentTime = 0;
    syncMusic();
  }
});
$("#soundToggle").addEventListener("change", () => {
  if ($("#soundToggle").checked) unlockAudio();
  else stopSfx();
});
document.addEventListener("visibilitychange", syncMusic);
$("#fighterContinue").addEventListener("click", showStageSelect);
$$(".stage-card").forEach((card) => card.addEventListener("click", () => chooseStage(card.dataset.stage)));
$("#fightButton").addEventListener("click", () => startMatch(true));
$("#rematchButton").addEventListener("click", () => startMatch(true));
$("#reselectButton").addEventListener("click", () => startSelect(state.mode));
$$("[data-back]").forEach((button) => button.addEventListener("click", () => back(button.dataset.back)));
$("#homeLink").addEventListener("click", (event) => { event.preventDefault(); showScreen("title"); });
$("#fullscreenButton").addEventListener("click", () => {
  unlockAudio();
  enterImmersiveMode();
});
window.addEventListener("resize", syncOrientationGate);
window.addEventListener("orientationchange", syncOrientationGate);
document.addEventListener("fullscreenchange", syncOrientationGate);

$$("[data-touch]").forEach((button) => {
  const action = button.dataset.touch;
  const start = (event) => {
    event.preventDefault();
    touch.add(action);
    touch.add(`${action}:pressed`);
    button.classList.add("active");
    unlockAudio();
  };
  const end = (event) => {
    event.preventDefault();
    touch.delete(action);
    button.classList.remove("active");
  };
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("pointerleave", end);
});

window.__finalBlowEngine = {
  version: "0.6-foundation",
  simulationHz: SIMULATION_HZ,
  toggleDebug(enabled = !state.debug) {
    state.debug = Boolean(enabled);
    return state.debug;
  },
  snapshot() {
    return {
      tick: state.simulationTick,
      phase: state.phase,
      screen: state.screen,
      seed: state.matchSeed,
      rng: state.rng.getState(),
      fighters: state.fighters.map((fighter) => ({
        id: fighter.def.id,
        side: fighter.side,
        state: fighter.combatState,
        stateFrame: fighter.stateFrame,
        x: fighter.x,
        y: fighter.y,
        health: fighter.health,
        meter: fighter.meter,
        attack: fighter.attacking?.kind || null,
        attackFrame: fighter.attackFrame,
        inputBuffer: fighter.inputBuffer.snapshot(),
      })),
    };
  },
};

if (["127.0.0.1", "localhost"].includes(location.hostname)) {
  window.__finalBlowQa = {
    ready(id, type = 0) {
      const index = roster.findIndex((fighter) => fighter.id === id);
      if (index < 0) throw new Error(`Unknown fighter: ${id}`);
      state.mode = "versus";
      state.picks = [index, index === 1 ? 0 : 1];
      state.rounds = [0, 0];
      state.round = 1;
      state.matchSerial += 1;
      seedMatch(state.round);
      state.fighters = [makeFighter(state.picks[0], 0), makeFighter(state.picks[1], 1)];
      state.fighters[1].health = 0;
      state.particles.length = 0;
      state.effects.length = 0;
      state.phase = "finish";
      state.phaseTime = 6;
      state.finishWinner = 0;
      state.finisherType = type;
      state.finisher = null;
      state.hitstop = 0;
      state.cinematicZoom = 1;
      $("#touchControls").classList.remove("cinematic");
      showScreen("fight");
      updateHud();
      $(".touch-final").classList.add("ready");
    },
    status() {
      return {
        phase: state.phase,
        fighter: state.fighters[0]?.def.id,
        elapsed: state.finisher?.elapsed || 0,
        impacts: state.finisher?.impactIndex || 0,
        beat: state.finisher?.beatLabel || "",
        attackerFrame: state.fighters[0]?.cinematicFrame,
        victimFrame: state.fighters[1]?.cinematicFrame,
        simulationTick: state.simulationTick,
        simulationHz: SIMULATION_HZ,
      };
    },
    step(seconds) {
      const frames = Math.ceil(seconds * SIMULATION_HZ);
      for (let frame = 0; frame < frames; frame += 1) simulationClock.stepOnce(runSimulationStep);
      state.simulationTick = simulationClock.tick;
      return this.status();
    },
  };
}

setupRoster();
updateMusicUi();
updateVolumeUi();
syncOrientationGate();
showScreen("title");
updateStageUI();
requestAnimationFrame(loop);
requestAnimationFrame(menuPadLoop);
