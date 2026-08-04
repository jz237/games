// area2.js — Area 2. LAYOUT IS NOT MEASURED: automation could not clear Area 1
// on the disk (the fortress gate defeats the scripted navigator), so this area
// is designed in the same idiom and to the same 26m metric as Area 1, using the
// log-wall trench lines actually observed north of the bridge (it46 capture).
window.AREA2 = {
  title: 'DESERT OUTPOST — BUNKER GATE',
  width: 274,
  height: 868,
  spawn: { x: 137, y: 840 },
  exit: { y: 58, x0: 112, x1: 162 },
  checkpoints: [742, 520, 300],
  zones: [
    { y0: 503, y1: 868, kind: 'scrub', base: '#9c7f52', accent: '#7a6a45' },
    { y0: 169, y1: 534, kind: 'scrub', base: '#9c7f52', accent: '#7a6a45' },
    { y0: 0, y1: 200, kind: 'fortress-gate', base: '#7a7a7a', accent: '#565656' },
  ],
  obstacles: [],
  plates: [
    { name: 'a2-gate', y0: 0, y1: 200, src: 'assets/plates/a2-gate.webp' },
    { name: 'a2-ravine', y0: 169, y1: 534, src: 'assets/plates/a2-ravine.webp' },
    { name: 'a2-palisade', y0: 503, y1: 868, src: 'assets/plates/a2-palisade.webp' },
  ],
  spawns: [
    { y: 800, type: 'rifleman', x: 140 },
    { y: 760, type: 'trencher', x: 60 },
    { y: 730, type: 'trencher', x: 200 },
    { y: 690, type: 'lobber',   x: 137 },
    { y: 650, type: 'mortar',   x: 210 },
    { y: 610, type: 'trencher', x: 70 },
    { y: 575, type: 'rifleman', x: 140 },
    { y: 470, type: 'rifleman', x: 145 },
    { y: 430, type: 'mortar',   x: 45 },
    { y: 300, type: 'rifleman', x: 140 },
    { y: 250, type: 'lobber',   x: 190 },
    { y: 150, type: 'rifleman', x: 100 },
    { y: 110, type: 'officer',  x: 137 },
  ],
  pows: [
    { x: 140, y: 660 },
    { x: 137, y: 440 },
    { x: 145, y: 230 },
  ],
};

// it59: dusk assault — the palisade falls at last light
window.AREA2.ambience = { mode: "dusk", rain: true }; // it65: dusk downpour
