// area3.js — Area 3. LAYOUT IS NOT MEASURED (see area2.js): built in the same
// idiom and to the same 26 m metric as areas 1-2.
window.AREA3 = {
  title: 'RIVER CAMP — STOCKADE GATE',
  width: 274,
  height: 868,
  spawn: { x: 137, y: 840 },
  exit: { y: 58, x0: 112, x1: 162 },
  checkpoints: [742, 520, 300],
  zones: [
    { y0: 503, y1: 868, kind: 'jungle-paths', base: '#8a6f4d', accent: '#557436' },
    { y0: 169, y1: 534, kind: 'jungle-paths', base: '#8a6f4d', accent: '#4e6b2f' },
    { y0: 0, y1: 200, kind: 'fortress-gate', base: '#7a7a7a', accent: '#565656' },
  ],
  obstacles: [],
  plates: [
    { name: 'a3-gate', y0: 0, y1: 200, src: 'assets/plates/a3-gate.webp' },
    { name: 'a3-swamp', y0: 169, y1: 534, src: 'assets/plates/a3-swamp.webp' },
    { name: 'a3-camp', y0: 503, y1: 868, src: 'assets/plates/a3-camp.webp' },
  ],
  spawns: [
    { y: 810, type: 'rifleman', x: 140 },
    { y: 770, type: 'lobber',   x: 150 },
    { y: 735, type: 'trencher', x: 60 },
    { y: 700, type: 'trencher', x: 205 },
    { y: 660, type: 'rifleman', x: 140 },
    { y: 620, type: 'mortar',   x: 210 },
    { y: 560, type: 'rifleman', x: 145 },
    { y: 470, type: 'lobber',   x: 137 },
    { y: 430, type: 'rifleman', x: 145 },
    { y: 300, type: 'mortar',   x: 50 },
    { y: 250, type: 'rifleman', x: 140 },
    { y: 160, type: 'trencher', x: 190 },
    { y: 110, type: 'officer',  x: 137 },
  ],
  pows: [
    { x: 140, y: 690 },
    { x: 137, y: 460 },
    { x: 143, y: 220 },
  ],
};
