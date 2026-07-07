// Joust remake — game data (ROM-faithful).
// All coordinates are in NATIVE Joust pixels (playfield ~292 wide, Y grows DOWNWARD).
// Sources: notes/joust-src (rebuilt original 6809 source) + notes/research. See SPEC.md.
'use strict';
(function () {

// ─── world constants (JOUSTRV4.ASM EQU) ───
const WORLD = {
  CEIL: 32,          // CEILNG $20 — top clamp
  FLOOR: 223,        // FLOOR $DF — floor / lava death line
  LAVA_Y: 223,       // lava surface = floor
  WRAP_MIN: -10,     // ELEFT
  WRAP_MAX: 292,     // ERIGHT
  WRAP_SPAN: 302,    // ERIGHT - ELEFT
  VIEW_W: 292,       // visible raster width
  VIEW_H: 240,       // visible raster height
  SPAWN_Y: 210,      // LAND5 — player spawn Y (feet)
};

// ─── physics constants — ROM-exact (JOUSTRV4.ASM), native 1/256-px → px/frame ───
// See SPEC §2 and decision #18. Values verified against the disassembly AND an independent
// research cross-check (both agree, zero disagreements).
const PHYS = {
  GRAV_DOWN: 4 / 256,     // +0.015625 wings-down (flapping) — GRAV=4, ADDGRA
  GRAV_UP: 8 / 256,       // +0.03125 wings-up (gliding), exactly 2× down — FLIPS2 LDB #4
  // Flap = discrete impulse per press: raw = floor(ptimup*96/256) − 96, then /256 (ADDFLP).
  // Fresh flap (ptimup≈0) = −96/256 = −0.375 px/f; diminishes to 0 as time since last flap grows.
  FLAP_BASE: 96,          // the 96 in ADDFLP's decay curve
  FLAP_REPEAT: 6,         // hold-to-auto-flap cadence (comfort layer; each auto-flap still
                          // uses the authentic decay curve) — the one intentional add, decision #18
  TAKEOFF_VY: -0x80 / 256, // −0.5 first flap off a platform — STFLY LDD #-$0080
  MAX_FALL: 16,           // MAXVY $1000 (reference cap; effectively never binds)
  MAX_RISE: 4,            // MINVY $0400 (reference cap)
  // horizontal AIR model: PVELX is an index (−8..+8 step 2), stepped ±2 only ON a flap-with-
  // direction, mapped through the non-linear FLYX table; momentum PERSISTS between flaps (no drag).
  FLYX: [0, 0, 0.25, 0, 0.5, 0, 1.0, 0, 2.0], // index |vxi| 0..8 → px/f (max 2.0 = index 8)
  MAXVX: 8,               // MAXVX EQU 8 — max PVELX index
  GROUND_ACCEL: 0.13, GROUND_MAX: 2.0, GROUND_DRAG: 0.7, // ground = animation-state approx (§2.4)
  ENEMY_MAX_H: 1.4,       // (legacy; enemies now use the FLYX index model too)
  // lava troll
  TROLL_BREAKFREE: -0x180 / 256, // -1.5 px/frame: rising faster escapes
  TROLL_PULL_BASE: 4 / 256,      // starts ~ gravity
  TROLL_PULL_CAP: 0x500 / 256,   // 5.0 px/frame max
  TROLL_WARMUP_FR: 30 * 60,      // 30s before it strengthens
  TROLL_RAMP: 1 / 256,           // +1/256 px/frame each frame after warmup
  // pterodactyl AI caps
  PTE_UP: -0xC0 / 256,           // 0.75 px/frame
  PTE_DN: 0x100 / 256,           // 1.0 px/frame
};

// ─── scoring (ROM-exact) ───
const SCORE = {
  BOUNDER: 500,
  HUNTER: 750,
  SHADOW: 1500,      // attract text ATX8 'SHADOW LORD (1500)'
  PTERO: 1000,
  EGG_LADDER: [250, 500, 750, 1000], // EGGVAL, cap index 4 (4th+ = 1000)
  EGG_AIR_BONUS: 500,    // caught mid-air (PFEET==0)
  SURVIVE_BONUS: 3000,
  TEAM_BONUS: 3000,
  GLADIATOR_BOUNTY: 3000,
  LAVA_ESCAPE: 50,       // survive a joust as loser bump
  EXTRA_MAN_EVERY: 20000,
};

// ─── enemy types ───
const ENEMY = {
  bounder: { key: 'bounder', color: 'red',  points: 500,  flapPeriod: 26, aggr: 0.30, climb: 0.55 },
  hunter:  { key: 'hunter',  color: 'grey', points: 750,  flapPeriod: 20, aggr: 0.62, climb: 0.80 },
  shadow:  { key: 'shadow',  color: 'blue', points: 1500, flapPeriod: 14, aggr: 0.92, climb: 1.00 },
};

// ─── platform geometry (native px; decoded from JOUSTI.ASM cliff DMA records + LNDBn heights) ───
// id, x1, x2 (inclusive-ish), y (top surface where feet rest), erodeBit (or null = permanent)
// Erosion bits: WBCL1L $10, WBCL1R $20, WBCL2 $40, WBCL4 $80.
const PLATFORMS = [
  // base (CLIF5) split into left/right + a burnable central BRIDGE over the lava pit
  { id: 'baseL',  x1: 54,  x2: 128, y: 211, erodeBit: null },
  { id: 'baseR',  x1: 164, x2: 240, y: 211, erodeBit: null },
  { id: 'bridge', x1: 128, x2: 164, y: 211, erodeBit: null, bridge: true }, // gone from wave TBRIDGE(3)
  // center floating island (CLIF4, y162)
  { id: 'center', x1: 104, x2: 152, y: 162, erodeBit: 0x80 }, // WBCL4
  // upper-left-center platform (CLIF2, y80)
  { id: 'upperL', x1: 80,  x2: 126, y: 80,  erodeBit: 0x40 }, // WBCL2
  // top edge ledges (CLIF1L / CLIF1R, y68) — near the wrap seam
  { id: 'topL',   x1: -10, x2: 34,  y: 68,  erodeBit: 0x10 }, // WBCL1L
  { id: 'topR',   x1: 250, x2: 294, y: 68,  erodeBit: 0x20 }, // WBCL1R
  // mid edge ledges (CLIF3L / CLIF3R) — permanent, span the seam
  { id: 'midL',   x1: -10, x2: 36,  y: 137, erodeBit: null },
  { id: 'midR',   x1: 200, x2: 258, y: 130, erodeBit: null },
];

const TBRIDGE = 3;  // wave the bridge burns
const TTROLL = 4;   // wave the lava troll first appears

// spawn pads (transporters) — where players/enemies materialize (feet Y = platform top)
const SPAWN_PADS = [
  { x: 92,  y: 211 }, { x: 200, y: 211 },  // on the base
  { x: 128, y: 162 },                       // center island
  { x: 103, y: 80 },                        // upper-left
  { x: 12,  y: 68 },  { x: 272, y: 68 },    // top ledges
];
const P1_SPAWN = { x: 100, y: 211, face: 1 };
const P2_SPAWN = { x: 196, y: 211, face: -1 };

// ─── wave table (JOUSTRV4.ASM WAVTBL, waves 1..90; loops 81..90 thereafter) ───
// each row = [byte0, byte1, byte2, byte3]
//   byte0 = (bounders<<4) | hunters
//   byte1 = (shadowLords<<4) | speedTier(DYTBL 0..F)
//   byte2 = scheduled pterodactyls
//   byte3 = WBPER(bit0) | typeCode(bits1-3: 0/2 normal,4 survive/team,6 gladiator,8 egg,10 ptero) | erosion(bits4-7)
const WAVTBL = [
  [0x30,0x01,0,2],[0x40,0x01,0,4],[0x60,0x02,0,0],[0x33,0x01,0,6],[0x60,0x01,0,8],
  [0x33,0x03,0,65],[0x24,0x02,0,117],[0x06,0x01,1,123],[0x06,0x02,0,247],[0x80,0x03,0,8],
  [0x35,0x03,0,1],[0x26,0x02,0,133],[0x07,0x03,1,251],[0x08,0x04,0,247],[0x06,0x02,0,8],
  [0x05,0x1F,0,0],[0x05,0x1F,0,4],[0x05,0x1F,2,10],[0x04,0x2F,0,6],[0x06,0x03,0,8],
  [0x03,0x3F,0,49],[0x02,0x4F,0,53],[0x02,0x4F,2,187],[0x02,0x4F,0,183],[0x06,0x04,0,8],
  [0x03,0x5F,0,241],[0x03,0x5F,0,245],[0x02,0x4F,2,251],[0x03,0x5F,0,247],[0x06,0x03,0,8],
  [0x04,0x4F,0,1],[0x02,0x6F,0,5],[0x02,0x4F,2,75],[0x02,0x6F,0,71],[0x08,0x05,0,8],
  [0x02,0x6F,0,129],[0x00,0x8F,0,133],[0x00,0x6F,2,203],[0x00,0x8F,0,199],[0x08,0x05,0,8],
  [0x03,0x7F,0,49],[0x00,0xAF,0,181],[0x00,0x7F,3,187],[0x00,0xAF,0,247],[0x08,0x06,0,8],
  [0x03,0x7F,0,1],[0x00,0xAF,0,5],[0x00,0x7F,3,11],[0x00,0xAF,0,135],[0x08,0x06,0,8],
  [0x03,0x7F,0,49],[0x00,0xAF,0,181],[0x00,0x7F,3,187],[0x00,0xAF,0,247],[0x08,0x0F,0,8],
  [0x03,0x7F,0,1],[0x00,0xAF,0,5],[0x00,0x7F,3,11],[0x00,0xAF,0,135],[0x00,0x63,0,8],
  [0x00,0xAF,0,49],[0x00,0xAF,0,181],[0x00,0x7F,3,187],[0x00,0xAF,0,247],[0x00,0x64,0,8],
  [0x00,0xAF,0,1],[0x00,0xAF,0,5],[0x00,0x7F,3,11],[0x00,0xAF,0,135],[0x00,0x65,0,8],
  [0x00,0xAF,0,49],[0x00,0xAF,0,181],[0x00,0x7F,3,187],[0x00,0xAF,0,247],[0x00,0x6F,0,8],
  [0x00,0xAF,0,1],[0x00,0xAF,0,5],[0x00,0x7F,3,11],[0x00,0xAF,0,135],[0x00,0x86,0,8],
  [0x00,0xAF,0,49],[0x00,0xAF,0,181],[0x00,0x7F,3,187],[0x00,0xAF,0,247],[0x00,0x8F,0,8],
  [0x00,0xAF,0,1],[0x00,0xAF,0,5],[0x00,0x7F,3,11],[0x00,0xAF,0,135],[0x00,0x8F,0,8],
];

const WAVE_TYPE = { 0: 'normal', 2: 'normal', 4: 'survival', 6: 'gladiator', 8: 'egg', 10: 'ptero', 12: 'normal', 14: 'normal' };

function waveInfo(n) {
  // n is 1-indexed; table loops 81..90 for n>90
  let idx = n - 1;
  if (n > 90) idx = 80 + ((n - 81) % 10);
  const row = WAVTBL[idx] || WAVTBL[WAVTBL.length - 1];
  const [b0, b1, b2, b3] = row;
  const typeCode = b3 & 0x0E;
  let type = WAVE_TYPE[typeCode] || 'normal';
  // pterodactyl scheduled waves only from wave 8 (type 10) — wave 3 is normal despite mod5
  if (type === 'ptero' && n < 8) type = 'normal';
  return {
    wave: n,
    bounders: (b0 >> 4) & 0xF,
    hunters: b0 & 0xF,
    shadowLords: (b1 >> 4) & 0xF,
    speed: b1 & 0xF,           // DYTBL difficulty tier 0..15
    pteros: b2,                 // scheduled pterodactyls
    type,
    pursueInstant: !!(b3 & 0x01),
    erosion: {
      topL: !!(b3 & 0x10), topR: !!(b3 & 0x20), upperL: !!(b3 & 0x40), center: !!(b3 & 0x80),
    },
    bridgeGone: n >= TBRIDGE,
    trollActive: n >= TTROLL,
  };
}

// active platforms for a given wave (erosion + bridge)
function platformsForWave(n) {
  const info = waveInfo(n);
  return PLATFORMS.filter(p => {
    if (p.bridge) return !info.bridgeGone;
    if (p.erodeBit === 0x10) return !info.erosion.topL;
    if (p.erodeBit === 0x20) return !info.erosion.topR;
    if (p.erodeBit === 0x40) return !info.erosion.upperL;
    if (p.erodeBit === 0x80) return !info.erosion.center;
    return true;
  });
}

// ─── on-screen phrases (verbatim from PHRASE.ASM / MESSAGE.ASM) ───
const PHRASES = {
  prepare: 'PREPARE TO JOUST',
  survival: 'SURVIVAL WAVE',
  survivalGet: 'COLLECT 3000 SURVIVAL POINTS',
  survivalNo: 'NO SURVIVAL POINTS AWARDED',
  team: 'TEAM WAVE',
  teamCoop: 'PLAYER CO-OPERATION - EACH PLAYER 3000 POINTS',
  teamBonus: 'BONUS AWARDED FOR TEAM PLAY',
  gladiator: 'GLADIATOR WAVE',
  bounty: '3000 POINT BOUNTY',
  noBounty: 'NO BOUNTY AWARDED',
  gotBounty: 'COLLECTED 3000 BOUNTY',
  egg: 'EGG WAVE',
  eggPick: 'PICK UP THE EGGS',
  eggHatch: 'BEFORE THEY HATCH',
  ptero: 'BEWARE THE PTERODACTYL',
  bait: 'BUZZARD BAIT!',
  lavaTroll: 'LAVA TROLL',
  meetEnemies: 'MEET THY ENEMIES',
  nice: 'NICE JOUSTING!',
  gameOver: 'GAME OVER',
  welcome: 'WELCOME TO JOUST',
  enterName: 'ENTER THY NAME MY LORD!',
  champions: 'JOUST CHAMPIONS',
};

// pterodactyl dawdling "baiter" send-off delays (seconds) — BAITBL, first entry per wave.
// wave 1 first ptero ~60s, wave 2 ~45s, wave 3+ ~30s, then accelerating.
const BAITER = {
  firstDelay: (wave) => wave <= 1 ? 60 : wave === 2 ? 45 : 30,
  // subsequent delays (seconds) shrink the longer you stall
  nextDelays: [30, 15, 15, 7, 5, 3, 1, 1, 1, 1, 1],
  maxOnScreen: 3,
};

const DATA = { WORLD, PHYS, SCORE, ENEMY, PLATFORMS, SPAWN_PADS, P1_SPAWN, P2_SPAWN, TBRIDGE, TTROLL, WAVTBL, WAVE_TYPE, waveInfo, platformsForWave, PHRASES, BAITER };

if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
if (typeof window !== 'undefined') window.JOUST_DATA = DATA;

})();
