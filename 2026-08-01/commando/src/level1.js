// level1.js — Area 1 "Landing Zone — Fortress Gate", laid out in metres.
// x = metres right of the corridor centre line, p = metres north of the LZ.
// (World space: X = x, Z = -p.) The section order follows the original's
// Area 1: landing zone, jungle paths, scrub, river bridge, desert trenches,
// fortress approach, fortress gate.

export const AREA1 = {
  id: 1,
  name: 'AREA 1',
  title: 'LANDING ZONE — FORTRESS GATE',
  length: 236,
  wallP: 230,          // fortress wall face
  gateHalf: 4.2,       // gate opening half-width
  spawn: { x: 0, p: 5 },
  // walkable corridor half-width along the area (smoothly interpolated)
  halfWidth: [[0, 15], [26, 15], [36, 12], [78, 12.5], [90, 14.5], [112, 16], [236, 16]],
  // dirt road centre line [p, x]
  road: [[-20, 0], [8, 0.5], [26, -1], [44, 3], [60, -2.5], [78, 1], [96, 0], [116, 0], [134, -3], [154, 2.5], [176, 0], [240, 0]],
  // ground look by section
  biomes: [
    { p: -40, kind: 'lz' }, { p: 30, kind: 'jungle' }, { p: 82, kind: 'scrub' },
    { p: 99, kind: 'river' }, { p: 113, kind: 'desert' }, { p: 180, kind: 'fort' },
  ],
  // water: the river the bridge crosses, and the landing-zone pond
  waters: [
    { t: 'band', p0: 100, p1: 111, level: -0.62, bed: -1.7 },
    { t: 'pool', x: -11.5, p: 7, rx: 3.6, rp: 3.1, level: -0.55, bed: -1.2 },
  ],
  craters: { from: 80, to: 224 },
  gate: 'stone',
  objectives: [[0, 'ADVANCE TO THE FORTRESS'], [180, 'BREAK THROUGH TO THE GATE']],
  ambience: 'day',

  props: [
    // --- landing zone ---
    { t: 'helipad', x: -1.5, p: 11, r: 4.4 },
    { t: 'campfire', x: -8.5, p: 18 },
    { t: 'log', x: -10.2, p: 17.1, rot: 0.3, len: 1.8 },
    { t: 'log', x: -6.9, p: 19.2, rot: -1.1, len: 1.6 },
    { t: 'sandbags', pts: [[6.5, 21], [8.5, 22.4], [10.8, 22.6], [12.5, 21.5]] },
    { t: 'crate', x: 9.4, p: 13.2, rot: 0.2 }, { t: 'crate', x: 10.5, p: 14.1, rot: -0.1, s: 0.9 },
    { t: 'crate', x: 9.8, p: 13.7, rot: 0.5, s: 0.8, y: 1.0 },
    { t: 'barrel', x: 11.6, p: 11.8 }, { t: 'barrel', x: 12.3, p: 12.6 },
    { t: 'jeep', x: 10.8, p: 4.5, rot: 0.55 },
    { t: 'tent', x: -10.5, p: 26, rot: 0.25 },
    { t: 'pallet', x: 12.4, p: 16.6, rot: 0.3 }, { t: 'tires', x: 13.4, p: 8.8 }, { t: 'barrel', x: 13.3, p: 18.6 },
    { t: 'debris', x: -5.5, p: 30.5 }, { t: 'wreck', x: -12.2, p: 37, rot: 0.35 },
    // --- jungle paths ---
    { t: 'hut', x: 8.2, p: 41, rot: -0.25 },
    { t: 'rock', x: -9, p: 47, s: 1.5 }, { t: 'rock', x: -7.3, p: 48.6, s: 0.9 }, { t: 'rock', x: -10.3, p: 49.8, s: 1.1 },
    { t: 'palm', x: -3.8, p: 56, s: 1.0 }, { t: 'palm', x: 6.5, p: 66, s: 1.1 },
    { t: 'bush', x: -7.5, p: 69, s: 1.3 }, { t: 'bush', x: 3.2, p: 33, s: 1.0 },
    { t: 'sandbags', pts: [[-9.5, 61.5], [-7.4, 62.6], [-5, 62.8], [-3, 62]] },
    { t: 'log', x: 1.5, p: 75, rot: 0.08, len: 6.5 },
    { t: 'crate', x: 10.2, p: 45.5, rot: 0.4 },
    { t: 'sacks', x: 10.6, p: 72.5, rot: 0.1, small: true },
    // --- scrub ---
    { t: 'rock', x: 11, p: 84, s: 1.8 }, { t: 'rock', x: -12, p: 90, s: 2.0 }, { t: 'rock', x: -4.5, p: 95, s: 0.8 },
    { t: 'barrel', x: 7.4, p: 88.5, red: true }, { t: 'barrel', x: 8.3, p: 89.3, red: true }, { t: 'barrel', x: 7.6, p: 90.2, red: true },
    { t: 'sandbags', pts: [[-11, 86], [-8.5, 87], [-6.2, 86.7]] },
    { t: 'bush', x: 12.8, p: 93, s: 1.1, dry: true },
    { t: 'tires', x: -9.8, p: 80.5, s: 0.9 }, { t: 'debris', x: 4, p: 83 },
    // --- river + bridge ---
    { t: 'bridge', x: 0, p0: 98.6, p1: 112.4, half: 2.9 },
    // --- desert trenches ---
    { t: 'trench', x0: -16.5, x1: -2.2, p: 121.5 },
    { t: 'trench', x0: 2.8, x1: 16.5, p: 137 },
    { t: 'trench', x0: -16.5, x1: -4.8, p: 153 }, { t: 'trench', x0: 5.2, x1: 16.5, p: 153 },
    { t: 'trench', x0: -9.5, x1: 16.5, p: 168 },
    { t: 'tower', x: 12.5, p: 127 },
    { t: 'mortarpit', x: -11, p: 144.5 },
    { t: 'mortarpit', x: 10.5, p: 176 },
    { t: 'wire', pts: [[-15, 116], [-8, 116.8], [-4.5, 115.8]] },
    { t: 'wire', pts: [[5, 131], [9, 131.6], [15, 130.8]] },
    { t: 'wire', pts: [[-14, 160], [-9, 159.3]] },
    { t: 'crate', x: -3.2, p: 129, rot: 0.7 }, { t: 'crate', x: -2.3, p: 130.3, rot: 0.2, s: 0.85 },
    { t: 'barrel', x: 3.8, p: 146, red: true }, { t: 'barrel', x: 4.6, p: 146.9, red: true },
    { t: 'rock', x: -13.5, p: 134, s: 1.4 }, { t: 'rock', x: 14, p: 149, s: 1.2 },
    { t: 'sandbags', pts: [[-2.5, 160], [0, 160.8], [2.5, 160.2]] },
    { t: 'barrier', x: -14, p: 141, rot: 0.2 }, { t: 'barrier', x: 13.2, p: 164.2, rot: -0.1 },
    { t: 'pallet', x: -2.7, p: 131.9, rot: 0.9 }, { t: 'debris', x: 7, p: 125 }, { t: 'barrel', x: 14.3, p: 142 },
    // --- fortress approach ---
    { t: 'bunker', x: -9, p: 197, rot: 0 },
    { t: 'sandbags', pts: [[2.2, 188], [5.5, 188.8], [9, 188.3]] },
    { t: 'sandbags', pts: [[-4.5, 207], [-1.5, 207.6], [1.2, 207.2]] },
    { t: 'sandbags', pts: [[5, 216], [8.5, 216.8], [11.5, 216.2]] },
    { t: 'hedgehog', x: -2.5, p: 183 }, { t: 'hedgehog', x: 12.5, p: 196 }, { t: 'hedgehog', x: 1, p: 200 },
    { t: 'hedgehog', x: -13, p: 213 }, { t: 'hedgehog', x: 14, p: 208 }, { t: 'hedgehog', x: -6.5, p: 220 },
    { t: 'barrel', x: 13.2, p: 186, red: true }, { t: 'barrel', x: 13.9, p: 186.9, red: true },
    { t: 'barrel', x: -12.8, p: 203.5, red: true },
    { t: 'crate', x: 9.5, p: 202, rot: 0.3 }, { t: 'crate', x: 10.4, p: 203.1, rot: -0.2, s: 0.9 },
    { t: 'container', x: -13.4, p: 188, rot: 1.45 }, { t: 'watertank', x: 13.6, p: 212.5 },
    { t: 'barrier', x: -8.5, p: 184.5, rot: 0.1 }, { t: 'pallet', x: 11.6, p: 200.4, rot: 0.2 },
    { t: 'tower', x: -13.2, p: 224 }, { t: 'tower', x: 13.2, p: 224 },
    { t: 'fortress', p: 230 },
  ],

  pows: [
    { x: 7.5, p: 52.5 },
    { x: -12.5, p: 131 },
    { x: 12.8, p: 159 },
    { x: -12, p: 214 },
  ],

  // Scripted encounters. `at` fires when the top of the view passes that p.
  // from: 'north' enters from beyond the top edge; 'west'/'east' from the
  // jungle walls; 'place' appears in position (inside huts, trenches, pits).
  encounters: [
    { at: 26, type: 'rifle', from: 'north', xs: [3, -4] },
    { at: 38, type: 'rifle', from: 'east', ps: [36] },
    { at: 46, type: 'rifle', from: 'place', pts: [[7.2, 39]], hut: true },
    { at: 50, type: 'rifle', from: 'place', pts: [[6.5, 54.5]], guard: true },
    { at: 55, type: 'lobber', from: 'north', xs: [1] },
    { at: 64, type: 'rifle', from: 'place', pts: [[-7.3, 63.8], [-4.8, 64]], cover: true },
    { at: 70, type: 'rifle', from: 'west', ps: [66, 68] },
    { at: 86, type: 'truck', x: 0, stopP: 95 },
    { at: 104, type: 'rifle', from: 'north', xs: [-1.5, 1.5, 0] , ambush: true },
    { at: 116, type: 'lobber', from: 'north', xs: [-6] },
    { at: 124, type: 'trench', pts: [[-12, 121.5], [-7, 121.5]] },
    { at: 129, type: 'sniper', tower: 0 },
    { at: 140, type: 'trench', pts: [[6, 137], [12.5, 137]] },
    { at: 146, type: 'mortar', pit: 0 },
    { at: 156, type: 'trench', pts: [[-10, 153], [9, 153]] },
    { at: 160, type: 'rifle', from: 'east', ps: [158, 161] },
    { at: 170, type: 'trench', pts: [[-4, 168], [4, 168], [11, 168]] },
    { at: 176, type: 'mortar', pit: 1 },
    { at: 190, type: 'rifle', from: 'place', pts: [[4.5, 190], [7.5, 190]], cover: true },
    { at: 198, type: 'bunker', bunker: 0 },
    { at: 206, type: 'lobber', from: 'north', xs: [-6, 6] },
    { at: 210, type: 'rifle', from: 'place', pts: [[-2.8, 209], [0, 209.3]], cover: true },
    { at: 218, type: 'rifle', from: 'place', pts: [[7, 218], [10, 218]], cover: true },
    { at: 226, type: 'sniper', tower: 1 }, { at: 226, type: 'sniper', tower: 2 },
  ],
  // background pressure: squads from the north while nothing scripted is busy
  patrol: { every: 3.6, cap: 9, types: [['rifle', 0.75], ['lobber', 0.25]], from: 20, to: 212 },
  // gate finale
  finale: { triggerP: 214, waves: [5, 5, 6], officer: true },
};
