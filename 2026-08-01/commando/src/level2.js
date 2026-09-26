// level2.js — Area 2 "River Crossing — Palisade Gate", at dusk in the rain.
// Beach landing, a log palisade with a blown breach and a guarded gate, a
// narrow cliff ravine with grenadiers on the ledges and motorcycles charging
// down it, a long bridge over a wide river, the far bank, and the palisade
// fort. Same coordinates as Area 1: x right of centre, p north (metres).

export const AREA2 = {
  id: 2,
  name: 'AREA 2',
  title: 'RIVER CROSSING — PALISADE GATE',
  length: 244,
  wallP: 236,
  gateHalf: 4.2,
  gate: 'palisade',
  spawn: { x: 0, p: 4 },
  halfWidth: [[-40, 15], [26, 15], [40, 16], [66, 15], [72, 10], [80, 7.5], [108, 7.5], [118, 13], [124, 16], [244, 16]],
  // the ravine: the banks become 5 m cliffs with a steep face
  bank: [[-40, 1.6], [64, 1.6], [72, 5.6], [112, 5.6], [120, 1.8], [244, 1.6]],
  bankSpan: [[-40, 7], [64, 7], [72, 2.2], [112, 2.2], [120, 6], [244, 7]],
  road: [[-40, 0], [10, 1], [30, 5], [46, 5], [60, 2], [80, 0], [100, -1], [118, 0], [152, 0], [178, 2], [200, -2], [244, 0]],
  biomes: [
    { p: -40, kind: 'beach' }, { p: 26, kind: 'jungle' }, { p: 44, kind: 'camp' }, { p: 68, kind: 'ravine' },
    { p: 116, kind: 'river' }, { p: 154, kind: 'scrub' }, { p: 184, kind: 'fort' },
  ],
  waters: [
    { t: 'band', p0: -38, p1: 0.5, level: -0.55, bed: -1.8 },          // the water you landed from
    { t: 'band', p0: 126, p1: 150, level: -0.7, bed: -2.0 },          // the river
  ],
  craters: { from: 156, to: 228 },
  objectives: [[0, 'SECURE THE BEACH'], [40, 'BREACH THE PALISADE'], [68, 'PUSH THROUGH THE RAVINE'], [118, 'CROSS THE RIVER'], [152, 'TAKE THE FAR BANK'], [200, 'BREAK THROUGH TO THE GATE']],
  ambience: 'dusk-rain',

  props: [
    // --- beach ---
    { t: 'boat', x: -8.5, p: 1.2, rot: 0.45 },
    { t: 'boat', x: 9.5, p: -0.5, rot: -0.3, sunk: true },
    { t: 'hedgehog', x: -5, p: 9 }, { t: 'hedgehog', x: 3.5, p: 15 }, { t: 'hedgehog', x: -9.5, p: 21 },
    { t: 'hedgehog', x: 12, p: 23 }, { t: 'hedgehog', x: 6.5, p: 29 },
    { t: 'sandbags', pts: [[5, 12], [7.8, 13.2], [10.8, 12.6]] },
    { t: 'crate', x: 9.6, p: 16, rot: 0.3 }, { t: 'crate', x: 10.5, p: 16.9, rot: -0.2, s: 0.8 },
    { t: 'barrel', x: -12, p: 14, red: true }, { t: 'barrel', x: -11.2, p: 14.8, red: true },
    { t: 'rock', x: 13, p: 6, s: 1.4 }, { t: 'rock', x: -14, p: 20, s: 1.2 },
    { t: 'debris', x: -3, p: 5.5 }, { t: 'tires', x: 13.6, p: 12.8 }, { t: 'pallet', x: 11.9, p: 18.4, rot: 0.2 },
    // --- trench line & palisade ---
    { t: 'trench', x0: -15, x1: -3, p: 37 },
    { t: 'sandbags', pts: [[5, 38.2], [7.5, 39.5], [10.2, 38.6]] },
    { t: 'wire', pts: [[-1.5, 33], [3.5, 33.8]] },
    { t: 'palisade', pts: [[-17, 46], [-9.3, 46.1]] },
    { t: 'palisade', pts: [[-5.7, 46.3], [2.6, 46.2]] },
    { t: 'palisade', pts: [[7.4, 46.2], [17, 46]] },
    { t: 'gatepost', x: 2.6, p: 46.2 }, { t: 'gatepost', x: 7.4, p: 46.2 },
    { t: 'log', x: -7.4, p: 44.4, rot: 1.1, len: 2.6 }, { t: 'rock', x: -6.4, p: 48, s: 0.7 },
    { t: 'tower', x: -13, p: 48.5 }, { t: 'tower', x: 12.5, p: 48.5 },
    // --- camp behind the palisade ---
    { t: 'tent', x: -10, p: 56, rot: 0.3 }, { t: 'tent', x: -11, p: 63, rot: -0.2 },
    { t: 'hut', x: 9.5, p: 56, rot: 0.15 },
    { t: 'campfire', x: -4, p: 58 },
    { t: 'crate', x: 11.5, p: 62, rot: 0.4 }, { t: 'crate', x: 10.6, p: 63, rot: 0.1, s: 0.85 },
    { t: 'barrel', x: -6.5, p: 64 },
    { t: 'pallet', x: 12.6, p: 60, rot: 0.1 }, { t: 'barrel', x: 12.9, p: 65 }, { t: 'watertank', x: 13.6, p: 51 },
    // --- ravine ---
    { t: 'rock', x: -3.2, p: 82, s: 1.6 }, { t: 'rock', x: 4, p: 90, s: 1.3 }, { t: 'rock', x: -4.6, p: 97, s: 1.4 },
    { t: 'rock', x: 3.4, p: 104, s: 1.8 }, { t: 'rock', x: -1.2, p: 111, s: 1.0 },
    { t: 'log', x: 2.2, p: 86, rot: 0.45, len: 3 },
    { t: 'sandbags', pts: [[-5.2, 93], [-2.2, 93.6]] },
    // --- river crossing ---
    { t: 'bridge', x: 0, p0: 124.6, p1: 151.4, half: 2.4 },
    { t: 'sandbags', pts: [[-8.5, 120.6], [-5.2, 121.4]] },
    { t: 'sandbags', pts: [[-12.5, 154.2], [-7.5, 155.2], [-3.2, 154.6]] },
    { t: 'sandbags', pts: [[3.2, 154.8], [8, 155.4], [12.5, 154.6]] },
    { t: 'mortarpit', x: -11, p: 164 },
    { t: 'wreck', x: 13, p: 166, rot: -0.3 }, { t: 'debris', x: 6, p: 176 },
    { t: 'sacks', x: -13, p: 199.5, rot: 0.2, small: true },
    // --- far bank ---
    { t: 'trench', x0: -16, x1: -4, p: 186 },
    { t: 'hedgehog', x: 4, p: 170 }, { t: 'hedgehog', x: -6, p: 175 }, { t: 'hedgehog', x: 13, p: 181 },
    { t: 'wire', pts: [[5, 192], [9.5, 192.8], [14.5, 192]] },
    { t: 'bunker', x: 8.5, p: 199 },
    { t: 'barrel', x: -12, p: 191, red: true }, { t: 'barrel', x: -11.2, p: 191.8, red: true }, { t: 'barrel', x: -12.7, p: 192.4, red: true },
    { t: 'crate', x: -3.5, p: 196, rot: 0.6 }, { t: 'crate', x: -2.6, p: 197.2, rot: 0.1, s: 0.85 },
    { t: 'sandbags', pts: [[-6.5, 206], [-2.8, 206.8]] },
    { t: 'sandbags', pts: [[3.5, 213.4], [7.8, 214.2]] },
    { t: 'trench', x0: 3, x1: 16, p: 222 },
    { t: 'hedgehog', x: -10, p: 216 }, { t: 'hedgehog', x: -3, p: 226 },
    { t: 'tower', x: -13.2, p: 230 }, { t: 'tower', x: 13.2, p: 230 },
    { t: 'fortress', p: 236 },
  ],

  pows: [
    { x: -12.5, p: 60 },
    { x: 5.4, p: 99.5 },
    { x: 12.5, p: 119 },
    { x: -12, p: 210 },
  ],

  encounters: [
    { at: 20, type: 'rifle', from: 'north', xs: [-3, 4] },
    { at: 30, type: 'rifle', from: 'west', ps: [26] },
    { at: 38, type: 'trench', pts: [[-11, 37], [-6, 37]] },
    { at: 42, type: 'rifle', from: 'place', pts: [[7, 39.9], [9.4, 40]], cover: true },
    { at: 52, type: 'sniper', tower: 0 }, { at: 52, type: 'sniper', tower: 1 },
    { at: 56, type: 'rifle', from: 'place', pts: [[9.5, 53.4]], hut: true },
    { at: 60, type: 'lobber', from: 'north', xs: [-2] },
    { at: 64, type: 'rifle', from: 'east', ps: [60, 62] },
    { at: 80, type: 'moto', from: 'north', x: 0 },
    { at: 86, type: 'ledge', pts: [[-10.6, 88], [10.4, 94]] },
    { at: 96, type: 'rifle', from: 'north', xs: [-2, 2] },
    { at: 102, type: 'ledge', pts: [[-10.4, 104], [10.8, 108]] },
    { at: 108, type: 'moto', from: 'north', x: 0 },
    { at: 118, type: 'rifle', from: 'north', xs: [-4, 4] },
    { at: 132, type: 'rifle', from: 'north', xs: [-1, 1, 0], ambush: true },
    { at: 152, type: 'rifle', from: 'place', pts: [[-9.4, 156.1], [-5.2, 156.4], [5.2, 156.5], [9.6, 156.3]], cover: true },
    { at: 164, type: 'mortar', pit: 0 },
    { at: 174, type: 'moto', from: 'east', p: 178 },
    { at: 178, type: 'moto', from: 'west', p: 181 },
    { at: 184, type: 'truck', x: 0, stopP: 200 },
    { at: 188, type: 'trench', pts: [[-12, 186], [-7, 186]] },
    { at: 198, type: 'bunker', bunker: 0 },
    { at: 204, type: 'lobber', from: 'north', xs: [-5, 5] },
    { at: 212, type: 'rifle', from: 'place', pts: [[-5.4, 207.6], [-3.2, 208.1]], cover: true },
    { at: 218, type: 'moto', from: 'west', p: 219 },
    { at: 224, type: 'trench', pts: [[6, 222], [12, 222]] },
    { at: 232, type: 'sniper', tower: 2 }, { at: 232, type: 'sniper', tower: 3 },
  ],
  patrol: { every: 3.8, cap: 9, types: [['rifle', 0.75], ['lobber', 0.25]], from: 16, to: 214 },
  finale: { triggerP: 220, waves: [5, 6, 6], officer: true },
};
