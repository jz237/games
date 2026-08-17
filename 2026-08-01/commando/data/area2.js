// area2.js — Area 2. LAYOUT IS STILL NOT MEASURED (automation cannot clear
// Area 1's gate on the disk), but as of it84 the ART is rebuilt in the
// ORIGINAL'S OWN VOCABULARY, read off the stitched disk map of Area 1:
// hard dirt ground, SCATTERED short log-and-sandbag barricade segments at
// staggered offsets (not one tidy band), a water crossing on a wide causeway,
// and a full-width stone wall with a central arch as the gate.
window.AREA2 = {
  title: 'RIVER CROSSING — FORTRESS GATE',
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

// it66: the rope bridge is a killing zone — the trap springs mid-crossing
// it117: the demo's route knowledge — the parity trail runs EAST through the
// trench belt, then centres for the breach/causeway/gate (read off the masks)
window.AREA2.route = [{ y0: 500, y1: 9999, lane: 182 }, { y0: 0, y1: 500, lane: 191 }];
// it136: COLLISION FOLLOWS THE ART, NOT THE DISK NUMBERS. it113's causeway
// (120-174) is where the DISK's crossing sits; the HD plate's painter drew the
// bridge at x~162-215. Imposing the disk rect walled off the VISIBLE deck
// (Joe pinned mid-bridge on an invisible wall at x=174) and opened a crossing
// over painted water. Players cross what they can SEE: water ends at the west
// railing, resumes past the east railing, and the carve keeps the drawn deck
// (174-208, between the railings) open through mask misreads. The disk truth
// stays in the ledger; the art is the contract with the player.
window.AREA2.water = [{ x0: 0, y0: 205, x1: 164, y1: 289 }, { x0: 212, y0: 205, x1: 274, y1: 289 }];
window.AREA2.carve = [{ x0: 174, y0: 200, x1: 208, y1: 294 }];
window.AREA2.ambushZone = { x0: 174, x1: 208, y0: 220, y1: 280, farY: 200, nearY: 300 }; // the killing zone covers the real deck
