// textures.js — every texture in the game is painted here on canvases at boot,
// so the whole look ships as code (no image downloads) and stays consistent.
import * as THREE from 'three';
import { mulberry, fbm, smooth, clamp } from './util.js';

// periodic gradient noise so ground detail tiles seamlessly
function makePeriodicNoise(seed) {
  const r = mulberry(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y, P) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const g = (ix, iy, dx, dy) => {
      const h = perm[((ix % P) + P) % P + perm[((iy % P) + P) % P]] & 7;
      const a = h * 0.785398; return Math.cos(a) * dx + Math.sin(a) * dy;
    };
    const u = fade(xf), v = fade(yf);
    const a = g(xi, yi, xf, yf), b = g(xi + 1, yi, xf - 1, yf), c = g(xi, yi + 1, xf, yf - 1), d = g(xi + 1, yi + 1, xf - 1, yf - 1);
    return (a + u * (b - a)) + v * ((c + u * (d - c)) - (a + u * (b - a)));
  };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function texFrom(c, { repeat = true, srgb = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = mips;
  t.needsUpdate = true;
  return t;
}

// height field -> tangent-space normal map
function normalFromHeight(hf, N, strength) {
  const c = canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N);
  const H = (x, y) => hf[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return texFrom(c, { srgb: false });
}

// ---------------------------------------------------------------- ground
export function groundDetail() {
  const N = 512, nz = makePeriodicNoise(7), r = mulberry(11);
  const hf = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let h = 0, amp = 0.5, f = 4;
    for (let o = 0; o < 5; o++) { h += nz(x / N * f, y / N * f, f) * amp; amp *= 0.5; f *= 2; }
    hf[y * N + x] = h;
  }
  // pebbles & clods: small bumps stamped into the height field
  for (let i = 0; i < 900; i++) {
    const cx = r() * N, cy = r() * N, rad = 1.5 + r() * r() * 7, amp = (r() < 0.8 ? 1 : -0.6) * (0.25 + r() * 0.45);
    const R = Math.ceil(rad);
    for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
      const d = Math.hypot(xx, yy * 1.15) / rad; if (d >= 1) continue;
      const px = ((Math.floor(cx) + xx) % N + N) % N, py = ((Math.floor(cy) + yy) % N + N) % N;
      hf[py * N + px] += amp * Math.sqrt(1 - d * d);
    }
  }
  // albedo: neutral grey around 0.8 so vertex colours carry the hue
  const c = canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const h = hf[i];
    const fine = nz((i % N) / N * 64, Math.floor(i / N) / N * 64, 64) * 0.08;
    const v = Math.max(0, Math.min(1, 0.8 + h * 0.32 + fine));
    const warm = 1 + (h > 0.35 ? 0.05 : 0);
    img.data[i * 4] = v * 255 * warm; img.data[i * 4 + 1] = v * 248; img.data[i * 4 + 2] = v * 238; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { map: texFrom(c), normal: normalFromHeight(hf, N, 3.2) };
}

// ---------------------------------------------------------------- foliage cards
export function grassCard() {
  const W = 128, H = 128, c = canvas(W, H), g = c.getContext('2d'), r = mulberry(21);
  for (let i = 0; i < 38; i++) {
    const x0 = 14 + r() * (W - 28), lean = (r() - 0.5) * 50, h = H * (0.45 + r() * 0.52), w = 2 + r() * 3.5;
    const grad = g.createLinearGradient(0, H, 0, H - h);
    const hue = 70 + r() * 30, lit = 26 + r() * 16;
    grad.addColorStop(0, `hsl(${hue},45%,${lit * 0.55}%)`);
    grad.addColorStop(1, `hsl(${hue - 12},55%,${lit + 18}%)`);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(x0 - w, H);
    g.quadraticCurveTo(x0 + lean * 0.3, H - h * 0.6, x0 + lean, H - h);
    g.quadraticCurveTo(x0 + lean * 0.3 + w * 0.4, H - h * 0.6, x0 + w, H);
    g.fill();
  }
  const t = texFrom(c, { repeat: false }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function frondTexture() {
  // one palm frond: rib down the middle, leaflets combed out to both sides
  const W = 128, H = 512, c = canvas(W, H), g = c.getContext('2d'), r = mulberry(33);
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const t = i / 70, y = H * 0.02 + t * H * 0.96;
    const len = W * 0.5 * Math.sin(Math.PI * (0.12 + t * 0.85)) * (0.8 + r() * 0.25);
    for (const side of [-1, 1]) {
      const lit = 22 + r() * 18 + (1 - t) * 6;
      g.strokeStyle = `hsl(${88 + r() * 22},${48 + r() * 12}%,${lit}%)`;
      g.lineWidth = 3.2 + r() * 1.6;
      g.beginPath(); g.moveTo(W / 2, y);
      g.quadraticCurveTo(W / 2 + side * len * 0.55, y + 6, W / 2 + side * len, y + 18 + r() * 10);
      g.stroke();
    }
  }
  g.strokeStyle = '#6f6a33'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  const t = texFrom(c, { repeat: false }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function leafTexture() {
  // broad jungle leaf (banana / elephant-ear) with veins
  const W = 128, H = 256, c = canvas(W, H), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, '#2c4a1c'); grad.addColorStop(1, '#5d8a33');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(W / 2, H - 2);
  g.bezierCurveTo(W * 0.02, H * 0.72, W * 0.06, H * 0.2, W / 2, 2);
  g.bezierCurveTo(W * 0.94, H * 0.2, W * 0.98, H * 0.72, W / 2, H - 2);
  g.fill();
  g.strokeStyle = 'rgba(190,220,120,.55)'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(W / 2, H - 2); g.lineTo(W / 2, 6); g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(170,210,110,.3)';
  for (let i = 1; i < 14; i++) {
    const y = H - 10 - i * (H - 20) / 14;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(W / 2, y); g.quadraticCurveTo(W / 2 + s * 30, y - 8, W / 2 + s * 52, y - 26); g.stroke(); }
  }
  const t = texFrom(c, { repeat: false }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ---------------------------------------------------------------- materials for props
export function thatchTexture() {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d'), r = mulberry(44);
  g.fillStyle = '#7a6337'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    const x = r() * W, y = r() * H, l = 10 + r() * 26;
    g.strokeStyle = `hsla(${38 + r() * 10},${35 + r() * 20}%,${28 + r() * 32}%,.8)`;
    g.lineWidth = 1 + r() * 1.3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y + l); g.stroke();
  }
  for (let y = 0; y < H; y += 32) { g.fillStyle = 'rgba(30,20,8,.35)'; g.fillRect(0, y, W, 3); }
  return texFrom(c);
}

export function planksTexture() {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d'), r = mulberry(55);
  const rows = 8;
  for (let i = 0; i < rows; i++) {
    const y = i * H / rows, l = 26 + r() * 12;
    g.fillStyle = `hsl(${28 + r() * 8},${28 + r() * 10}%,${l}%)`; g.fillRect(0, y, W, H / rows);
    for (let k = 0; k < 40; k++) {
      g.strokeStyle = `rgba(20,12,4,${0.08 + r() * 0.15})`; g.lineWidth = 1;
      const yy = y + r() * H / rows; g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy + (r() - 0.5) * 3); g.stroke();
    }
    g.fillStyle = 'rgba(10,6,2,.6)'; g.fillRect(0, y, W, 2);
    const nx = r() * W; g.fillStyle = 'rgba(15,10,4,.5)'; g.fillRect(nx, y, 2, H / rows);
  }
  return texFrom(c);
}

export function stoneTexture() {
  const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d'), r = mulberry(66), nz = makePeriodicNoise(3);
  g.fillStyle = '#3d3a33'; g.fillRect(0, 0, W, H);
  const rowH = 64;
  for (let y = 0, row = 0; y < H; y += rowH, row++) {
    let x = row % 2 ? -48 : 0;
    while (x < W) {
      const w = 80 + r() * 60, l = 44 + r() * 14;
      g.fillStyle = `hsl(${36 + r() * 10},${8 + r() * 8}%,${l}%)`;
      g.fillRect(x + 3, y + 3, w - 6, rowH - 6);
      if (x + w > W) { g.fillRect(x - W + 3, y + 3, w - 6, rowH - 6); }
      x += w;
    }
  }
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < W * H; i++) {
    const n = nz((i % W) / W * 16, Math.floor(i / W) / H * 16, 16) * 26 + (r() - 0.5) * 14;
    img.data[i * 4] += n; img.data[i * 4 + 1] += n; img.data[i * 4 + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return texFrom(c);
}

export function concreteTexture() {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d'), r = mulberry(77), nz = makePeriodicNoise(9);
  const img = g.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    const v = 150 + nz(x / W * 8, y / H * 8, 8) * 30 + nz(x / W * 32, y / H * 32, 32) * 12 + (r() - 0.5) * 16;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.97; img.data[i * 4 + 2] = v * 0.9; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(40,30,20,.25)';
  for (let i = 0; i < 12; i++) g.fillRect(r() * W, 0, 1 + r() * 2, H * (0.2 + r() * 0.6));
  return texFrom(c);
}

export function burlapTexture() {
  const W = 64, H = 64, c = canvas(W, H), g = c.getContext('2d'), r = mulberry(88);
  g.fillStyle = '#9a8a62'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(60,48,26,${0.12 + r() * 0.1})`; g.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 2) { g.fillStyle = `rgba(255,240,200,${0.04 + r() * 0.06})`; g.fillRect(x, 0, 1, H); }
  return texFrom(c);
}

// ---------------------------------------------------------------- fx sprites
export function softDot() {
  const N = 64, c = canvas(N, N), g = c.getContext('2d');
  const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, N, N);
  const t = texFrom(c, { repeat: false, srgb: false }); return t;
}

export function smokePuff() {
  const N = 128, c = canvas(N, N), g = c.getContext('2d'), r = mulberry(99);
  for (let i = 0; i < 14; i++) {
    const x = N / 2 + (r() - 0.5) * N * 0.4, y = N / 2 + (r() - 0.5) * N * 0.4, rad = N * (0.16 + r() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(255,255,255,.34)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, N, N);
  }
  return texFrom(c, { repeat: false, srgb: false });
}

// a lumpy cloud puff for fire and smoke: fbm density inside a soft disc,
// shaded as if lit from above-left so billows read as volumes, not blobs
export function billowTexture(seed = 7) {
  const N = 128, c = canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N - 0.5, v = y / N - 0.5, d = Math.hypot(u, v) * 2;
    const n = fbm(u * 3.2 + seed, v * 3.2 - seed, 4), n2 = fbm(u * 7 - seed, v * 7 + seed, 3);
    const dens = smooth(1.0, 0.45, d + n * 0.45 + n2 * 0.12);
    const shade = clamp(0.7 + 0.3 * (-(u + v) * 1.4) + n * 0.35 + n2 * 0.15, 0.25, 1);
    const o = (y * N + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255 * shade;
    img.data[o + 3] = 255 * dens;
  }
  g.putImageData(img, 0, 0);
  return texFrom(c, { repeat: false, srgb: false });
}

export function flashStar() {
  const N = 128, c = canvas(N, N), g = c.getContext('2d');
  g.translate(N / 2, N / 2);
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3 + (i % 2) * 0.2);
    const grad = g.createLinearGradient(0, 0, N / 2, 0);
    grad.addColorStop(0, 'rgba(255,255,230,1)'); grad.addColorStop(1, 'rgba(255,180,60,0)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, -5); g.lineTo(N / 2 * (i % 2 ? 0.6 : 1), 0); g.lineTo(0, 5); g.fill();
  }
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, N * 0.22);
  grad.addColorStop(0, 'rgba(255,255,240,1)'); grad.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = grad; g.fillRect(-N / 2, -N / 2, N, N);
  return texFrom(c, { repeat: false, srgb: false });
}

export function scorchTexture() {
  const N = 128, c = canvas(N, N), g = c.getContext('2d'), r = mulberry(123);
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, d = r() * N * 0.18, rad = N * (0.12 + r() * 0.22);
    const x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(22,16,10,.13)'); grad.addColorStop(1, 'rgba(22,16,10,0)');
    g.fillStyle = grad; g.fillRect(0, 0, N, N);
  }
  return texFrom(c, { repeat: false });
}

export function helipadTexture() {
  const N = 512, c = canvas(N, N), g = c.getContext('2d'), r = mulberry(5);
  g.clearRect(0, 0, N, N);
  g.strokeStyle = 'rgba(236,230,210,.82)'; g.lineWidth = 22;
  g.beginPath(); g.arc(N / 2, N / 2, N * 0.42, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(236,230,210,.78)';
  const s = N * 0.2;
  g.fillRect(N / 2 - s, N / 2 - s * 1.1, s * 0.42, s * 2.2);
  g.fillRect(N / 2 + s * 0.58, N / 2 - s * 1.1, s * 0.42, s * 2.2);
  g.fillRect(N / 2 - s, N / 2 - s * 0.2, s * 2, s * 0.4);
  // weather it: scrape paint away with dirt noise
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.45})`;
    const x = r() * N, y = r() * N, w = 1 + r() * r() * 7;
    g.beginPath(); g.ellipse(x, y, w, w * (0.4 + r() * 0.8), r() * 3, 0, Math.PI * 2); g.fill();
  }
  return texFrom(c, { repeat: false });
}

export function ringTexture() {
  const N = 128, c = canvas(N, N), g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 7;
  g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 6, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 6, 0, Math.PI * 2); g.fill();
  return texFrom(c, { repeat: false, srgb: false });
}

export function blobShadow() {
  const N = 64, c = canvas(N, N), g = c.getContext('2d');
  const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grad.addColorStop(0, 'rgba(0,0,0,.55)'); grad.addColorStop(0.6, 'rgba(0,0,0,.25)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, N, N);
  return texFrom(c, { repeat: false, srgb: false });
}

// chain-link fence: diamond wire grid on transparent
export function fenceTexture() {
  const N = 128, c = canvas(N, N), g = c.getContext('2d');
  g.strokeStyle = 'rgba(190,195,200,1)'; g.lineWidth = 2.2;
  for (let i = -N; i < N * 2; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + N, N); g.stroke();
    g.beginPath(); g.moveTo(i, N); g.lineTo(i + N, 0); g.stroke();
  }
  const t = texFrom(c, { srgb: true }); return t;
}

// soft vertical streak for rain drops
export function rainStreak() {
  const W = 8, H = 64, c = canvas(W, H), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.7, 'rgba(255,255,255,.55)'); grad.addColorStop(1, 'rgba(255,255,255,.9)');
  g.fillStyle = grad; g.fillRect(W / 2 - 1.5, 0, 3, H);
  return texFrom(c, { repeat: false, srgb: false });
}

// searchlight beam: bright core fading to the edges and along its length
export function beamTexture() {
  const W = 64, H = 128, c = canvas(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = Math.abs(x / (W - 1) - 0.5) * 2, v = y / (H - 1);
    const a = Math.pow(1 - u, 2.2) * (0.35 + 0.65 * (1 - v));
    const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return texFrom(c, { repeat: false, srgb: false });
}
