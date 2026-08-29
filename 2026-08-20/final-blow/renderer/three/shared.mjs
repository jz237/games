// Shared constants + coordinate mapping for the CINEMA 3D renderer.
// The sim keeps its 2D logical space (1280x720, y down, FLOOR=600). The 3D
// world maps 1 sim pixel to PX world units (metres-ish) so light falloff and
// fog behave physically: a fighter sprite (~376px) stands ~1.88 units tall.
export const PX = 0.005;
export const SIM_W = 1280;
export const SIM_H = 720;
export const SIM_FLOOR = 600;

// x: sim pixels -> world units, centred on the stage middle.
export function worldX(px) {
  return (px - SIM_W * 0.5) * PX;
}

// y: sim pixels (down-positive, FLOOR = ground) -> world units (up-positive,
// ground at 0).
export function worldY(py) {
  return (SIM_FLOOR - py) * PX;
}

// Deterministic PRNG for procedural textures / scatter so rebuilds are stable.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic 0..1 hash of an integer, matching the ember-hash style used by
// the 2D presentation for flicker phases.
export function hash01(seed) {
  const scrambled = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return scrambled - Math.floor(scrambled);
}
