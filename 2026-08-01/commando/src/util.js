// util.js — small math helpers: seeded RNG, 2D gradient noise, easing.

export function mulberry(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D gradient noise (Perlin-style) on a fixed permutation, range ~[-1, 1].
const PERM = new Uint8Array(512);
{
  const r = mulberry(1985);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const GX = [1, -1, 1, -1, 1.414, -1.414, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1.414, -1.414];
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const g = (ix, iy, dx, dy) => { const h = PERM[ix + PERM[iy]] & 7; return GX[h] * dx + GY[h] * dy; };
  const n00 = g(X, Y, xf, yf), n10 = g(X + 1, Y, xf - 1, yf);
  const n01 = g(X, Y + 1, xf, yf - 1), n11 = g(X + 1, Y + 1, xf - 1, yf - 1);
  const u = fade(xf), v = fade(yf);
  return (n00 + u * (n10 - n00)) + v * ((n01 + u * (n11 - n01)) - (n00 + u * (n10 - n00)));
}
export function fbm(x, y, oct = 4, lac = 2.03, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= gain; f *= lac; }
  return s / n;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;
export function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
export function approach(v, target, step) { return v < target ? Math.min(target, v + step) : Math.max(target, v - step); }

// piecewise-linear lookup over [[key, value], ...] sorted by key
export function pwl(table, k) {
  if (k <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (k <= table[i][0]) {
      const [k0, v0] = table[i - 1], [k1, v1] = table[i];
      const t = (k - k0) / (k1 - k0);
      return v0 + (v1 - v0) * (t * t * (3 - 2 * t));
    }
  }
  return table[table.length - 1][1];
}

export function hexColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
