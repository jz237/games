// Joust remake — game data (ROM-faithful).
// All coordinates are in NATIVE Joust pixels (playfield ~292 wide, Y grows DOWNWARD).
// Sources: notes/joust-src (rebuilt original 6809 source) + notes/research. See SPEC.md.
'use strict';
(function () {

// ─── world constants (JOUSTRV4.ASM EQU) ───
const WORLD = {
  CEIL: 25,          // visible raster starts seven source lines below the framebuffer origin
  FLOOR: 216,        // FLOOR $DF in visible-window coordinates
  LAVA_Y: 216,       // lava surface = floor
  WRAP_MIN: -10,     // ELEFT
  WRAP_MAX: 292,     // ERIGHT
  WRAP_SPAN: 302,    // ERIGHT - ELEFT
  VIEW_W: 292,       // visible raster width
  VIEW_H: 240,       // visible raster height
  DISPLAY_W: 320,    // physical 4:3 CRT presentation width
  PIXEL_ASPECT: 320 / 292,
  SPAWN_Y: 204,      // LAND5 in visible-window coordinates
};

// ─── green-label Rev.4 flight constants (8.8 fixed point at 60.096 Hz) ───
// Flap is a RELEASE→PRESS edge. Horizontal momentum changes only on a stroke and persists in air.
const PHYS = {
  TICK_HZ: 60.096154,
  GRAV_DOWN: 4 / 256,
  GRAV_UP: 8 / 256,
  FLAP_BASE: -96 / 256,
  FLAP_TIME_SCALE: 96 / 256,
  WING_DOWN_FRAMES: 5,
  MAX_FALL: 16,
  MAX_RISE: 4,
  MAX_H: 2,
  GROUND_ACCEL: 0.13, GROUND_MAX: 2.1, GROUND_DRAG: 0.7,
  ENEMY_MAX_H: 2,
  TAKEOFF_VY: -0.5,
  FLYX: { 0: 0, 2: 0.25, 4: 0.5, 6: 1.0, 8: 2.0 },
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
  // Wave 3 burns the thin OUTER floor, leaving the permanent central CLIF5 island.
  { id: 'floorL', x1: -10, x2: 48,  y: 204, erodeBit: null, bridge: true },
  { id: 'base',   x1: 48,  x2: 234, y: 204, erodeBit: null, sprite: 'CSRC5FULL', drawX: 48 },
  { id: 'floorR', x1: 234, x2: 292, y: 204, erodeBit: null, bridge: true },
  // ROM cliff DMA positions converted from framebuffer to the visible 292×240 window.
  { id: 'lowerMid', x1: 100, x2: 164, y: 156, erodeBit: 0x80, sprite: 'CSRC4',  drawX: 100 },
  { id: 'midTop',   x1: 80,  x2: 168, y: 74,  erodeBit: 0x40, sprite: 'CSRC2',  drawX: 80 },
  { id: 'topL',     x1: -10, x2: 30,  y: 62,  erodeBit: 0x10, sprite: 'CSRC1L', drawX: -4 },
  { id: 'topR',     x1: 246, x2: 294, y: 62,  erodeBit: 0x20, sprite: 'CSRC1R', drawX: 246 },
  { id: 'midWrapL', x1: -4,  x2: 60,  y: 131, erodeBit: null, sprite: 'CSRC3L', drawX: -4 },
  { id: 'upperR',   x1: 196, x2: 254, y: 122, erodeBit: null, sprite: 'CSRC3U', drawX: 196 },
  { id: 'midWrapR', x1: 248, x2: 296, y: 131, erodeBit: null, sprite: 'CSRC3R', drawX: 248 },
];

const TBRIDGE = 3;  // wave the bridge burns
const TTROLL = 4;   // wave the lava troll first appears

// spawn pads (transporters) — where players/enemies materialize (feet Y = platform top)
const SPAWN_PADS = [
  // TR1ID..TR4ID / PPOS anchors, with the framebuffer's seven hidden scanlines removed.
  { x: 113, y: 73 }, { x: 231, y: 121 },
  { x: 23,  y: 130 }, { x: 127, y: 203 },
];
const P1_SPAWN = { x: 100, y: 204, face: 1 };
const P2_SPAWN = { x: 196, y: 204, face: -1 };

// X offsets from the ROM's _OSTRICH/_STORK/_BUZARD composition pointer tables, converted
// from DMA bytes to pixels. Right-facing riders start at +4px; left-facing riders at 0.
function mountXOffset(prefix, mount, face) {
  if (face > 0) return 0;
  if (prefix === 'O') {
    if (mount.includes('RUNS')) return 2;
    if (mount.includes('RUN2') || mount.includes('RUN3')) return 4;
    if (mount.includes('RUN')) return 2;
    return 0;
  }
  if (prefix === 'S') {
    if (mount.includes('RUNS')) return 4;
    if (mount.includes('RUN1')) return 0;
    if (mount.includes('RUN')) return 2;
    if (mount.includes('FLY1')) return 2;
    return 0;
  }
  if (mount.includes('RUNS') || mount.includes('RUN2') || mount.includes('RUN3')) return 2;
  return 0;
}

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

const DATA = { WORLD, PHYS, SCORE, ENEMY, PLATFORMS, SPAWN_PADS, P1_SPAWN, P2_SPAWN, mountXOffset, TBRIDGE, TTROLL, WAVTBL, WAVE_TYPE, waveInfo, platformsForWave, PHRASES, BAITER };

if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
if (typeof window !== 'undefined') window.JOUST_DATA = DATA;

})();
