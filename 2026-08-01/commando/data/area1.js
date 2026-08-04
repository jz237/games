// area1.js — Area 1 terrain data derived from the parity study's stitched map.
// World units = original lores pixels. World is 274 wide; y=0 is the NORTH end
// (fortress gate), y grows southward; spawn near the south edge.
// Terrain bands are placeholder render zones until painterly art lands; obstacle
// rects are traced from the reference stitch (coarse pass — refined during QA).
window.AREA1 = {
  width: 274,
  height: 1840,
  spawn: { x: 137, y: 1790 },
  // coarse zone bands (south -> north), placeholder colors sampled from the study
  zones: [
    { y0: 1560, y1: 1840, kind: 'jungle-lz',   base: '#8a6f4d', accent: '#4e6b2f' },
    { y0: 1180, y1: 1560, kind: 'jungle-paths', base: '#8a6f4d', accent: '#557436' },
    { y0: 980,  y1: 1180, kind: 'scrub',        base: '#96794f', accent: '#5d7a38' },
    { y0: 930,  y1: 980,  kind: 'bridge',       base: '#8f8468', accent: '#6d6548' },
    { y0: 420,  y1: 930,  kind: 'desert-trench', base: '#9c7f52', accent: '#7a6a45' },
    { y0: 60,   y1: 420,  kind: 'fortress-approach', base: '#97794e', accent: '#6f6f6f' },
    { y0: 0,    y1: 60,   kind: 'fortress-gate', base: '#7a7a7a', accent: '#565656' },
  ],
  title: 'LANDING ZONE — FORTRESS GATE',
  exit: { y: 58, x0: 116, x1: 160 },
  // painted plates, north to south (each carries a baked top-edge alpha ramp)
  plates: [
    { name: 'gate-f', y0: 0, y1: 200, src: 'assets/plates/gate-f.webp' },
    { name: 'approach-e', y0: 169, y1: 534, src: 'assets/plates/approach-e.webp' },
    { name: 'trench-d', y0: 503, y1: 868, src: 'assets/plates/trench-d.webp' },
    { name: 'bridge-c', y0: 837, y1: 1202, src: 'assets/plates/bridge-c.webp' },
    { name: 'jungle-b', y0: 1171, y1: 1536, src: 'assets/plates/jungle-b.webp' },
    { name: 'lz', y0: 1505, y1: 1870, src: 'assets/plates/lz.webp' },
  ],
  // LEGACY: superseded by the painted plates above and their walkability masks.
  // Kept only as a fallback for any y not covered by a plate.
  obstacles: [
    { x: 0,   y: 1720, w: 60,  h: 80,  kind: 'water' },     // LZ pond
    { x: 28,  y: 1600, w: 26,  h: 30,  kind: 'palm' },
    { x: 196, y: 1608, w: 26,  h: 30,  kind: 'palm' },
    { x: 60,  y: 1400, w: 30,  h: 34,  kind: 'palm' },
    { x: 170, y: 1330, w: 34,  h: 30,  kind: 'grass-knoll' },
    { x: 20,  y: 1240, w: 40,  h: 28,  kind: 'grass-knoll' },
    { x: 120, y: 1120, w: 30,  h: 30,  kind: 'palm' },
    { x: 0,   y: 930,  w: 90,  h: 46,  kind: 'bridge-rail' },
    { x: 184, y: 930,  w: 90,  h: 46,  kind: 'bridge-rail' },
    { x: 30,  y: 800,  w: 70,  h: 12,  kind: 'trench' },
    { x: 150, y: 720,  w: 80,  h: 12,  kind: 'trench' },
    { x: 40,  y: 600,  w: 90,  h: 12,  kind: 'trench' },
    { x: 160, y: 520,  w: 70,  h: 12,  kind: 'trench' },
    { x: 0,   y: 0,    w: 96,  h: 58,  kind: 'gate-wall' },  // fortress wall left
    { x: 178, y: 0,    w: 96,  h: 58,  kind: 'gate-wall' },  // fortress wall right (gate gap 96..178)
  ],
  // first-pass enemy placements (spawnY triggers as the camera approaches)
  spawns: [
    { y: 1706, type: 'rifleman', x: 150 },
    { y: 1640, type: 'rifleman', x: 145 },
    { y: 1500, type: 'lobber',   x: 140 },
    { y: 1380, type: 'rifleman', x: 145 },
    { y: 1248, type: 'lobber',   x: 150 },
    { y: 1100, type: 'rifleman', x: 180 },
    { y: 960,  type: 'rifleman', x: 137 },
    { y: 860,  type: 'trencher', x: 60 },
    { y: 790,  type: 'trencher', x: 135 },
    { y: 655,  type: 'lobber',   x: 100 },
    { y: 830,  type: 'mortar',   x: 60 },
    { y: 578,  type: 'trencher', x: 132 },
    { y: 470,  type: 'mortar',   x: 52 },
    { y: 300,  type: 'rifleman', x: 150 },
    { y: 250,  type: 'mortar',   x: 205 },
    { y: 200,  type: 'rifleman', x: 60 },
    { y: 120,  type: 'officer',  x: 137 },
  ],
  // POW rescues — prisoners staked out near the trail. Walk into one to cut him
  // loose; shoot him and the bonus is lost.
  pows: [
    { x: 166, y: 1330 },
    { x: 130, y: 905 },
    { x: 163, y: 690 },
    { x: 100, y: 380 },
  ],
};

// it65: the LZ pond shimmers
window.AREA1.water = [{ x0: 4, y0: 1724, x1: 56, y1: 1796 }];
