// Procedural canvas-texture factory for the CINEMA 3D renderer.
// Everything here is generated once at stage/fighter build time and cached;
// nothing allocates per frame.
import * as THREE from "three";
import { mulberry32 } from "./shared.mjs";
import { bleedPixels, normalPixels, footMetricsFromPixels } from "./atlas-pixels.mjs";

export function canvasTexture(width, height, paint, options = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  paint(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (options.srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (options.repeat) {
    texture.wrapS = texture.wrapT = options.mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  }
  texture.anisotropy = options.anisotropy ?? 4;
  return texture;
}

// --- Atlas pixel cache (5.1, #40) -------------------------------------------
// ONE getImageData per sheet, shared by the bleed, the normal map and the
// foot metrics (each used to draw the sheet into its own scratch canvas and
// read it back — three 6.5 MB reads per bank). Released by the fighter
// layer once a bank's chain has run, and on rig disposal, so no sheet's
// bytes stay resident behind a fighter who left the match.
const pixelCache = new Map();
export function atlasKey(image) {
  return image.src || image;
}
export function atlasPixels(image) {
  const key = atlasKey(image);
  if (pixelCache.has(key)) return pixelCache.get(key);
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
  pixelCache.set(key, pixels);
  return pixels;
}
export function releaseAtlasPixels(image) {
  return pixelCache.delete(atlasKey(image));
}

// Drop everything cached for one sheet: the pixel read, the bled canvas,
// the smear, the normal-map texture (disposed — it is GPU memory) and any HD
// composite keyed on it. The fighter layer calls this when the last rig
// drawing the sheet is disposed (an arcade ladder used to leave ~200 MB of
// canvases resident per fighter met in 3D).
export function releaseAtlasCaches(image) {
  const key = atlasKey(image);
  let released = 0;
  if (pixelCache.delete(key)) released += 1;
  if (bleedCache.delete(key)) released += 1;
  if (smearCache.delete(`${key}:vsmear`)) released += 1;
  for (const blurKey of [...blurCache.keys()]) {
    if (blurKey.startsWith(`${key}:`) && blurCache.delete(blurKey)) released += 1;
  }
  const normal = normalCache.get(key);
  if (normal) {
    normal.dispose();
    normalCache.delete(key);
    released += 1;
  }
  if (footMetricsCache.delete(key)) released += 1;
  if (hdComposeCache.delete(key)) released += 1;
  return released;
}

/** QA: what the atlas caches currently hold (keys are sheet URLs / canvases). */
export function atlasCacheStats() {
  return {
    pixels: pixelCache.size,
    bleed: bleedCache.size,
    smear: smearCache.size,
    normal: normalCache.size,
    footMetrics: footMetricsCache.size,
    hd: hdComposeCache.size,
  };
}

// Alpha-bleed (RGB dilation): floods the colour of each opaque pixel outward
// into the transparent region around it. The source atlases store WHITE under
// their transparent texels, so linear filtering / mipmapping at the sprite
// edge blended toward white — the single biggest cause of the "sticker halo".
// After bleeding, edge texels filter toward the character's own colours.
// 5.1: the dilation itself is the frontier walk in atlas-pixels.mjs (same
// output as the old seven whole-sheet passes, a fraction of the pixels
// visited) and it reads the shared pixel cache instead of its own copy.
const bleedCache = new Map();
export function bleedAtlasCanvas(image, passes = 7) {
  const key = atlasKey(image);
  if (bleedCache.has(key)) return bleedCache.get(key);
  const pixels = atlasPixels(image);
  const w = pixels.width;
  const h = pixels.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  img.data.set(pixels.data);
  bleedPixels(img.data, w, h, passes);
  ctx.putImageData(img, 0, 0);
  bleedCache.set(key, canvas);
  return canvas;
}

// Blurred copy of a sprite atlas for the wet-floor reflections: the mirror
// image must be softer than the sprite itself or it reads as a second fighter.
// Blurs the BLED atlas — blurring the raw atlas dragged the white transparent
// RGB into the mirror image as a grey haze.
// The blurred CANVAS is cached; each caller gets its own texture so mirror
// matches can drive two frame windows independently.
const blurCache = new Map();
export function blurredAtlasTexture(image, blurPx = 3) {
  const key = `${image.src || image}:${blurPx}`;
  let canvas = blurCache.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(bleedAtlasCanvas(image), 0, 0);
    ctx.filter = "none";
    blurCache.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

// Vertically-smeared copy of a sprite atlas for the wet-floor mirror: a light
// isotropic soften, then the frame re-stamped at growing VERTICAL offsets —
// water drags a mirror image into vertical streaks (SF6 night-stage water),
// it never blurs it evenly. Horizontal detail survives (silhouette still
// tracks the pose); vertical detail melts.
const smearCache = new Map();
export function smearedAtlasTexture(image) {
  const key = `${image.src || image}:vsmear`;
  let canvas = smearCache.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    const bled = bleedAtlasCanvas(image);
    ctx.filter = "blur(1.2px)";
    ctx.drawImage(bled, 0, 0);
    ctx.filter = "none";
    // Decaying smear weights (round-3 palette fix): the flat 0.30 stamps let
    // far rows (warm face/skin) bleed 10px through a dark shirt, so every
    // mirror drifted orange-brown regardless of what the fighter wears. Near
    // offsets dominate; the base frame is re-asserted so the mirror keeps the
    // sprite's OWN palette rows.
    for (const [dy, weight] of [[-3, 0.3], [3, 0.3], [-6, 0.2], [6, 0.2], [-10, 0.11], [10, 0.11]]) {
      ctx.globalAlpha = weight;
      ctx.drawImage(bled, 0, dy);
    }
    ctx.globalAlpha = 0.5;
    ctx.filter = "blur(0.6px)";
    ctx.drawImage(bled, 0, 0);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    smearCache.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

// HD atlas composition: the 2x upscaled atlas stamped over the ORIGINAL's
// bled RGB (scaled up), so the HD sprite's transparent texels inherit
// character-coloured RGB instead of the upscaler's white — same fringe-free
// filtering as the SD path, without running the per-pixel dilation over a
// 2560x2560 image on the main thread.
const hdComposeCache = new Map();
export function hdComposedCanvas(hdImage, originalImage) {
  const key = hdImage.src || hdImage;
  if (hdComposeCache.has(key)) return hdComposeCache.get(key);
  const w = hdImage.naturalWidth;
  const h = hdImage.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bleedAtlasCanvas(originalImage), 0, 0, w, h);
  ctx.drawImage(hdImage, 0, 0);
  hdComposeCache.set(key, canvas);
  return canvas;
}

// Horizontal soft streak (bright core, feathered ends) — headlight smears on
// the wet asphalt and light-pool stretches.
export function streakTexture(size = 256) {
  return canvasTexture(size, size / 4, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.9)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    const vfade = ctx.createLinearGradient(0, 0, 0, h);
    vfade.addColorStop(0, "rgba(0,0,0,1)");
    vfade.addColorStop(0.5, "rgba(0,0,0,0)");
    vfade.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = vfade;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  });
}

// Broken, tapered shockwave ring for impact VFX with a CHROMATIC FRINGE. NOT
// a uniform-width circle stroke: 6-8 tapered arc segments of varying
// width/length with gaps — each arc carries a warm red lip riding OUTSIDE the
// white core and a cyan lip riding INSIDE (lens dispersion at the pressure
// front), plus a dark trailing edge so the band reads as refraction.
export function ringTexture(size = 256, seed = 0x51ab) {
  const rand = mulberry32(seed);
  return canvasTexture(size, size, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = w * 0.42;
    ctx.lineCap = "round";
    let angle = rand() * Math.PI * 2;
    for (let i = 0; i < 7; i += 1) {
      const span = 0.5 + rand() * 1.15;           // arc length varies
      const steps = 14;
      const baseWidth = w * (0.007 + rand() * 0.016);
      const wobble = (rand() - 0.5) * w * 0.02;
      for (let s = 0; s < steps; s += 1) {
        const p = s / (steps - 1);
        const taper = Math.sin(p * Math.PI);      // fat middle, pointed ends
        const a0 = angle + span * p;
        const a1 = angle + span * (p + 1.15 / steps);
        const rr = r + wobble * Math.sin(p * 5 + i);
        // Chromatic dispersion lips: red just outside, cyan just inside.
        ctx.strokeStyle = `rgba(255,72,48,${(0.6 * taper).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, baseWidth * taper * 1.7);
        ctx.beginPath();
        ctx.arc(cx, cy, rr + baseWidth * 1.9, a0, a1);
        ctx.stroke();
        ctx.strokeStyle = `rgba(70,210,255,${(0.55 * taper).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, baseWidth * taper * 1.5);
        ctx.beginPath();
        ctx.arc(cx, cy, rr - baseWidth * 1.7, a0 + 0.015, a1 + 0.015);
        ctx.stroke();
        // White-hot core band.
        ctx.strokeStyle = `rgba(255,255,255,${(0.85 * taper).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, baseWidth * taper * 2.2);
        ctx.beginPath();
        ctx.arc(cx, cy, rr, a0, a1);
        ctx.stroke();
        // Dark trailing inner edge: pseudo-refraction (band compresses light).
        ctx.strokeStyle = `rgba(0,0,0,${(0.35 * taper).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, baseWidth * taper * 1.6);
        ctx.beginPath();
        ctx.arc(cx, cy, rr - baseWidth * 3.2, a0, a1);
        ctx.stroke();
      }
      angle += span + 0.2 + rand() * 0.6;         // gap before the next arc
    }
  });
}

// Radial impact burst: tapered spark streaks of varying length and width
// radiating from a hot core — the SF6-style star burst that replaces the
// uniform circle stroke. Rendered additively and rotated randomly per impact.
export function impactBurstTexture(size = 256, seed = 0xb1a57) {
  const rand = mulberry32(seed);
  return canvasTexture(size, size, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const rays = 15;
    for (let i = 0; i < rays; i += 1) {
      const angle = (i / rays) * Math.PI * 2 + (rand() - 0.5) * 0.45;
      const len = w * (0.16 + rand() * 0.32);     // long and short rays mixed
      const base = w * (0.008 + rand() * 0.02);   // varying root width
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const px = -dy;
      const py = dx;
      const r0 = w * 0.015;
      const gradient = ctx.createLinearGradient(cx + dx * r0, cy + dy * r0, cx + dx * len, cy + dy * len);
      gradient.addColorStop(0, "rgba(255,255,255,0.95)");
      gradient.addColorStop(0.45, "rgba(255,255,255,0.55)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      // Tapered quad: full base width at the core, a point at the tip.
      ctx.beginPath();
      ctx.moveTo(cx + dx * r0 + px * base, cy + dy * r0 + py * base);
      ctx.lineTo(cx + dx * len, cy + dy * len);
      ctx.lineTo(cx + dx * r0 - px * base, cy + dy * r0 - py * base);
      ctx.closePath();
      ctx.fill();
    }
    // Small hot core knot where the rays root.
    const core = ctx.createRadialGradient(cx, cy, 1, cx, cy, w * 0.06);
    core.addColorStop(0, "rgba(255,255,255,1)");
    core.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, h);
  });
}

// Expanding halftone shock ring: a donut band of graphic screen-print dots,
// dense and fat at the band's spine, shrinking to pinpricks at both edges —
// the SF6 Drive-Impact print language (dots, not airbrush) for the hit answer.
export function halftoneRingTexture(size = 256, seed = 0x7a11) {
  const rand = mulberry32(seed);
  return canvasTexture(size, size, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const rMid = w * 0.4;
    const band = w * 0.07;
    // Polar dot grid: a THIN open donut (wide bands read as a dot doily
    // pasted over the victim instead of a pressure ring passing him).
    for (let ring = -2; ring <= 2; ring += 1) {
      const rr = rMid + (ring / 2) * band;
      const count = Math.round((Math.PI * 2 * rr) / (w * 0.052));
      const phase = rand() * Math.PI * 2;
      // Dot size tapers away from the band spine.
      const dotR = w * 0.016 * (1 - Math.abs(ring) / 2.7) * (0.85 + rand() * 0.3);
      for (let i = 0; i < count; i += 1) {
        const a = phase + (i / count) * Math.PI * 2;
        const jitter = (rand() - 0.5) * w * 0.008;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (rr + jitter), cy + Math.sin(a) * (rr + jitter), dotR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(0.75 + rand() * 0.25).toFixed(3)})`;
        ctx.fill();
      }
    }
    // Thin solid leading lip just outside the dots: reads as the wavefront.
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = w * 0.007;
    ctx.beginPath();
    ctx.arc(cx, cy, rMid + band * 1.6, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// Tapered PAINT-STREAK ray with chromatic fringe: one long comet stroke —
// fat rough root, whipped point — drawn as a warm-white core with a red
// fringe riding one edge and a cyan fringe the other (the Luke Drive-Impact
// ink language). Instanced radially per impact; each seed is a different
// stroke so the fan never reads as a stamped star.
export function paintStreakTexture(width = 256, height = 96, seed = 0x77aa) {
  const rand = mulberry32(seed);
  return canvasTexture(width, height, (ctx, w, h) => {
    const cy = h / 2;
    const rootX = w * 0.06;
    const len = w * (0.82 + rand() * 0.12);
    // Thinner root (round-3): these read as SPARK STREAKS behind the
    // fighters now, not paint slabs — hairline energy, 2.5x width variance.
    const rootW = h * (0.11 + rand() * 0.09);
    const wob = (rand() - 0.5) * h * 0.24;
    const path = (offY, scaleW) => {
      // paint the stroke as stacked tapered segments with edge jitter
      const steps = 22;
      ctx.beginPath();
      for (let s = 0; s <= steps; s += 1) {
        const p = s / steps;
        const x = rootX + p * len;
        const half = rootW * scaleW * Math.pow(1 - p, 1.35) * (0.82 + 0.18 * Math.sin(p * 19 + seed));
        const y = cy + offY + Math.sin(p * Math.PI) * wob;
        if (s === 0) ctx.moveTo(x, y - half);
        else ctx.lineTo(x, y - half);
      }
      for (let s = steps; s >= 0; s -= 1) {
        const p = s / steps;
        const x = rootX + p * len;
        const half = rootW * scaleW * Math.pow(1 - p, 1.35) * (0.82 + 0.18 * Math.sin(p * 23 + seed));
        const y = cy + offY + Math.sin(p * Math.PI) * wob;
        ctx.lineTo(x, y + half);
      }
      ctx.closePath();
      ctx.fill();
    };
    // chromatic fringes first (they peek past the core's edges)
    ctx.fillStyle = "rgba(255,60,40,0.55)";
    path(-rootW * 0.34, 0.95);
    ctx.fillStyle = "rgba(70,200,255,0.5)";
    path(rootW * 0.34, 0.95);
    // warm-white core
    const grad = ctx.createLinearGradient(rootX, 0, rootX + len, 0);
    grad.addColorStop(0, "rgba(255,255,255,0.98)");
    grad.addColorStop(0.55, "rgba(255,238,210,0.85)");
    grad.addColorStop(1, "rgba(255,220,170,0)");
    ctx.fillStyle = grad;
    path(0, 0.8);
    // hairline riding the core: hand-inked energy
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = Math.max(1, h * 0.03);
    ctx.beginPath();
    ctx.moveTo(rootX, cy + wob * 0.2);
    ctx.quadraticCurveTo(rootX + len * 0.5, cy + wob, rootX + len * 0.92, cy + wob * 0.4);
    ctx.stroke();
  });
}

// Curved anime smear arc: one thick crescent stroke (fat middle, whipped
// pointed tips) with a couple of thin trailing hairlines — the hand-drawn
// swing smear that frames an impact instead of a symmetric star.
export function smearArcTexture(size = 256, seed = 0x53a2) {
  const rand = mulberry32(seed);
  return canvasTexture(size, size, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = w * (0.3 + rand() * 0.08);
    const start = rand() * Math.PI * 2;
    const span = 1.5 + rand() * 0.9;             // ~86-137 degrees of arc
    const steps = 26;
    const fat = w * (0.035 + rand() * 0.02);
    ctx.lineCap = "round";
    for (let s = 0; s < steps; s += 1) {
      const p = s / (steps - 1);
      const taper = Math.pow(Math.sin(p * Math.PI), 1.35); // whip-pointed tips
      const a0 = start + span * p;
      const a1 = start + span * (p + 1.3 / steps);
      ctx.strokeStyle = `rgba(255,255,255,${(0.92 * taper).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.8, fat * taper * 2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a1);
      ctx.stroke();
      // Trailing hairlines riding just inside/outside the main smear.
      ctx.strokeStyle = `rgba(255,255,255,${(0.4 * taper).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.6, fat * taper * 0.4);
      ctx.beginPath();
      ctx.arc(cx, cy, r + fat * 1.7, a0, a1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r - fat * 1.6, a0 + 0.04, a1 + 0.04);
      ctx.stroke();
    }
  });
}

// Per-frame foot metrics for a 4x4 sprite atlas: where the visible soles
// actually END inside each cell (atlases carry transparent padding under the
// feet, which made the fighters hover above the 3D ground plane), plus the
// x-centroids of up to two foot clusters so contact shadows can sit under
// each shoe instead of one oversized blob under the sprite centre.
//   padBottom[frame] — fraction of the CELL height that is empty below the
//                      lowest opaque pixel (0 = feet touch the cell edge);
//   feet[frame]      — array of 1-2 { u } offsets in -0.5..0.5 cell widths
//                      from the cell centre (sprite-local, pre-facing);
//   extent[frame]    — the silhouette box (5.1 prone settle), see
//                      footMetricsFromPixels in atlas-pixels.mjs.
const footMetricsCache = new Map();
export function atlasFootMetrics(image, columns = 4, rows = 4) {
  const key = atlasKey(image);
  if (footMetricsCache.has(key)) return footMetricsCache.get(key);
  const pixels = atlasPixels(image);
  const metrics = footMetricsFromPixels(pixels.data, pixels.width, pixels.height, columns, rows);
  footMetricsCache.set(key, metrics);
  return metrics;
}

// Tight, hard-edged contact-shadow ellipse: near-full darkness across the
// sole line with a short falloff — distinct from the wide soft penumbra.
export function hardShadowTexture(size = 128) {
  return canvasTexture(size, size, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(0.55, "rgba(0,0,0,0.96)");
    gradient.addColorStop(0.78, "rgba(0,0,0,0.5)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

// Vertical wet-street light smear: bright at the top (under the source),
// streaking + feathering away down the texture; soft width falloff so the
// edges never read as a quad. Laid flat on the ground under each practical.
export function wetStreakTexture(size = 256) {
  return canvasTexture(size / 2, size, (ctx, w, h) => {
    const along = ctx.createLinearGradient(0, 0, 0, h);
    along.addColorStop(0, "rgba(255,255,255,0.95)");
    along.addColorStop(0.3, "rgba(255,255,255,0.55)");
    along.addColorStop(0.75, "rgba(255,255,255,0.16)");
    along.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = along;
    ctx.fillRect(0, 0, w, h);
    // Broken-water interruptions: horizontal dark ripple bands. SPARSER
    // (round-3): at a ~12px pitch the bands tiled the light pools into a
    // plank-deck read that fought the slab grid — fewer, irregular breaks
    // read as water without drawing a second floor.
    ctx.globalCompositeOperation = "destination-out";
    for (let y = 14; y < h; y += 26 + (y * 7) % 21) {
      const strength = 0.12 + ((y * 13) % 17) / 17 * 0.3;
      ctx.fillStyle = `rgba(0,0,0,${strength.toFixed(3)})`;
      ctx.fillRect(0, y, w, 2 + (y % 5));
    }
    // Plank/grain breakup ALONG the smear: vertical ribbons of varying
    // strength so the light pool breaks over the floor boards instead of
    // reading as a smooth decal laid on top of them.
    for (let x = 3; x < w; x += 5 + (x * 11) % 9) {
      const strength = 0.08 + ((x * 29) % 23) / 23 * 0.3;
      ctx.fillStyle = `rgba(0,0,0,${strength.toFixed(3)})`;
      ctx.fillRect(x, 0, 1 + (x % 3), h);
    }
    // Soft width falloff.
    const across = ctx.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, "rgba(0,0,0,1)");
    across.addColorStop(0.28, "rgba(0,0,0,0)");
    across.addColorStop(0.72, "rgba(0,0,0,0)");
    across.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  });
}

// Defocused-light bokeh disc: near-flat bright body with a slightly hotter
// rim and a hard-ish edge — the discrete circle a distant practical becomes
// through a wide-open lens (NOT a gaussian glow; the edge is the read).
// `softness` 0..1 blends from that hard lens circle toward a melted far-out-
// of-focus glow, so the field carries genuinely different focus depths.
export function bokehDiscTexture(size = 64, softness = 0) {
  return canvasTexture(size, size, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    const edge = 0.95 - softness * 0.45;   // where the falloff begins
    const rimBoost = 0.95 - softness * 0.35;
    gradient.addColorStop(0, `rgba(255,255,255,${(0.72 - softness * 0.12).toFixed(2)})`);
    gradient.addColorStop(0.62 - softness * 0.25, `rgba(255,255,255,${(0.78 - softness * 0.15).toFixed(2)})`);
    gradient.addColorStop(Math.min(edge - 0.1, 0.85), `rgba(255,255,255,${rimBoost.toFixed(2)})`);
    gradient.addColorStop(edge, `rgba(255,255,255,${(0.5 - softness * 0.3).toFixed(2)})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

// Soft radial dot used by spark points and the contact-shadow blob.
export function softDotTexture(size = 64, inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  return canvasTexture(size, size, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(0.4, inner.replace(/,1\)$/, ",0.55)"));
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

// Height-from-luminance -> tangent-space normal map for a sprite atlas.
// Alpha-weighted so the silhouette edge produces strong outward normals: side
// "rim" practicals then catch the character outline exactly like a lit cutout.
const normalCache = new Map();

export function normalMapForAtlas(image, { strength = 1.6, step = 1 } = {}) {
  const key = atlasKey(image);
  if (normalCache.has(key)) return normalCache.get(key);
  const pixels = atlasPixels(image);
  const normal = normalPixels(pixels.data, pixels.width, pixels.height, { strength, step });
  const canvas = document.createElement("canvas");
  canvas.width = normal.width;
  canvas.height = normal.height;
  const ctx = canvas.getContext("2d");
  const out = ctx.createImageData(normal.width, normal.height);
  out.data.set(normal.data);
  ctx.putImageData(out, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  normalCache.set(key, texture);
  return texture;
}

// 5.1 (#40): the stand-in normal map a bank draws with until its real one is
// generated off the frame — a single flat (0,0,1) texel. The material is
// created WITH a normal map so the program never recompiles when the real
// texture lands (same defines, different texture object).
let flatNormal = null;
export function flatNormalTexture() {
  if (flatNormal) return flatNormal;
  const data = new Uint8Array([128, 128, 255, 255]);
  flatNormal = new THREE.DataTexture(data, 1, 1);
  flatNormal.needsUpdate = true;
  return flatNormal;
}

// Wet-street PBR set: albedo + roughness + metalness + bump sharing one
// seeded layout. The surface is authored as CONCRETE SIDEWALK SLABS — a
// readable expansion-joint grid with per-slab tone shifts and aggregate
// speckle — because a floor with structure is what grounds the fighters
// (SF6's stone flags carry half the grounding). Wetness is broad anisotropic
// damp streaks plus a few glossy standing-water puddles; the joints go glossy
// too (grooves hold water), so specular pooling draws the grid at night.
export function asphaltMaps(seed = 20260829, size = 1024) {
  const rand = mulberry32(seed);
  // Expansion-joint slab grid (5x4 per tile): slight jitter so the grid
  // reads poured-in-place, not vector-drawn.
  const SLAB_X = 5;
  const SLAB_Y = 4;
  const jointsX = [];
  for (let x = 0; x <= SLAB_X; x += 1) jointsX.push((x / SLAB_X) * size + (rand() - 0.5) * size * 0.02);
  const jointsY = [];
  for (let y = 0; y <= SLAB_Y; y += 1) jointsY.push((y / SLAB_Y) * size + (rand() - 0.5) * size * 0.025);
  const slabTones = [];
  for (let i = 0; i < SLAB_X * SLAB_Y; i += 1) slabTones.push(0.84 + rand() * 0.36);
  const paintSlabs = (ctx, base) => {
    // Per-slab albedo variation: neighbouring slabs never share a tone.
    for (let sy = 0; sy < SLAB_Y; sy += 1) {
      for (let sx = 0; sx < SLAB_X; sx += 1) {
        const tone = slabTones[sy * SLAB_X + sx];
        ctx.fillStyle = `rgb(${Math.round(base[0] * tone)},${Math.round(base[1] * tone)},${Math.round(base[2] * tone)})`;
        ctx.fillRect(jointsX[sx], jointsY[sy], jointsX[sx + 1] - jointsX[sx] + 1, jointsY[sy + 1] - jointsY[sy] + 1);
      }
    }
  };
  // Fixed per-joint lean so the groove lines land identically in every map
  // (albedo darkening, roughness gloss and bump recess must coincide).
  const jointLeanX = jointsX.map(() => (rand() - 0.5) * 6);
  const jointLeanY = jointsY.map(() => (rand() - 0.5) * 6);
  const paintJoints = (ctx, style, width) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    for (let i = 1; i < jointsX.length - 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(jointsX[i], 0);
      ctx.lineTo(jointsX[i] + jointLeanX[i], size);
      ctx.stroke();
    }
    for (let i = 1; i < jointsY.length - 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, jointsY[i]);
      ctx.lineTo(size, jointsY[i] + jointLeanY[i]);
      ctx.stroke();
    }
  };
  // Damp streaks: long, soft, mostly-vertical smears at varying widths.
  const streaks = [];
  for (let i = 0; i < 14; i += 1) {
    streaks.push({
      x: rand() * size,
      w: size * (0.04 + rand() * 0.11),
      lean: (rand() - 0.5) * size * 0.16,
      strength: 0.35 + rand() * 0.6,
    });
  }
  // Standing-water puddles: a few irregular soft-edged pools that go glossy
  // (near-zero roughness, high metalness) so they MIRROR the night scene.
  const puddles = [];
  for (let i = 0; i < 6; i += 1) {
    puddles.push({
      x: rand() * size,
      y: rand() * size,
      rx: size * (0.05 + rand() * 0.09),
      ry: size * (0.025 + rand() * 0.05),
      rot: (rand() - 0.5) * 0.8,
    });
  }
  const paintPuddles = (ctx, rgb, alpha) => {
    for (const puddle of puddles) {
      ctx.save();
      ctx.translate(puddle.x, puddle.y);
      ctx.rotate(puddle.rot);
      const gradient = ctx.createRadialGradient(0, 0, 1, 0, 0, puddle.rx);
      gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
      gradient.addColorStop(0.72, `rgba(${rgb},${alpha})`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.scale(1, puddle.ry / puddle.rx);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, puddle.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };
  const cracks = [];
  for (let i = 0; i < 26; i += 1) {
    const points = [{ x: rand() * size, y: rand() * size }];
    const segments = 3 + Math.floor(rand() * 5);
    let angle = rand() * Math.PI * 2;
    for (let s = 0; s < segments; s += 1) {
      angle += (rand() - 0.5) * 1.4;
      const last = points[points.length - 1];
      points.push({ x: last.x + Math.cos(angle) * size * 0.06, y: last.y + Math.sin(angle) * size * 0.06 });
    }
    cracks.push(points);
  }
  const speckles = [];
  for (let i = 0; i < 2600; i += 1) {
    speckles.push({ x: rand() * size, y: rand() * size, r: 0.4 + rand() * 1.7, v: rand() });
  }
  // Soft vertical damp smears; `level` scales per-streak strength.
  const paintStreaks = (ctx, rgb, level) => {
    for (const streak of streaks) {
      const alpha = Math.min(1, streak.strength * level);
      const gradient = ctx.createLinearGradient(streak.x - streak.w, 0, streak.x + streak.w, 0);
      gradient.addColorStop(0, `rgba(${rgb},0)`);
      gradient.addColorStop(0.5, `rgba(${rgb},${alpha.toFixed(3)})`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.save();
      ctx.transform(1, 0, streak.lean / size, 1, 0, 0);
      ctx.fillStyle = gradient;
      ctx.fillRect(streak.x - streak.w * 1.6, 0, streak.w * 3.2, size);
      ctx.restore();
    }
  };

  const albedo = canvasTexture(size, size, (ctx) => {
    // Dark wet concrete slabs: base stays low so light pools and speculars
    // carry the night read, but the slab grid + aggregate keep STRUCTURE in
    // focus at the fight line instead of a featureless wash.
    paintSlabs(ctx, [17, 19, 23]);
    // Visible aggregate: high-contrast speckle inside every slab.
    for (const speck of speckles) {
      const tone = 14 + Math.round(speck.v * 44);
      ctx.fillStyle = `rgb(${tone},${tone + 2},${tone + 6})`;
      ctx.fillRect(speck.x, speck.y, speck.r, speck.r);
    }
    // Expansion joints: dark recessed grooves drawing the slab grid.
    paintJoints(ctx, "rgba(4,5,8,0.95)", 7);
    ctx.strokeStyle = "rgba(4,5,7,0.85)";
    ctx.lineWidth = 1.6;
    for (const crack of cracks) {
      ctx.beginPath();
      ctx.moveTo(crack[0].x, crack[0].y);
      for (const point of crack.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    // Faded lane paint fragments.
    ctx.fillStyle = "rgba(180,170,120,0.08)";
    for (let i = 0; i < 5; i += 1) ctx.fillRect(size * 0.1 + i * size * 0.19, size * 0.46, size * 0.075, size * 0.015);
    // Damp streaks read slightly darker + cooler in albedo.
    paintStreaks(ctx, "5,8,16", 0.5);
    // Puddles darken further: standing water over dark concrete.
    paintPuddles(ctx, "4,6,12", 0.75);
    ctx.globalCompositeOperation = "screen";
    paintStreaks(ctx, "40,52,86", 0.1);
    ctx.globalCompositeOperation = "source-over";
  }, { srgb: true, repeat: true, mirror: true });

  const roughness = canvasTexture(size, size, (ctx) => {
    ctx.fillStyle = "#c9c9c9";
    ctx.fillRect(0, 0, size, size);
    for (const speck of speckles) {
      const tone = 180 + Math.round(speck.v * 55);
      ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
      ctx.fillRect(speck.x, speck.y, speck.r, speck.r);
    }
    // Broad damp sheen variation.
    for (let i = 0; i < 8; i += 1) {
      const x = ((i * 173.3) % size);
      const y = ((i * 311.7) % size);
      const gradient = ctx.createRadialGradient(x, y, 4, x, y, size * 0.3);
      gradient.addColorStop(0, "rgba(110,110,110,0.35)");
      gradient.addColorStop(1, "rgba(110,110,110,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
    // Damp streaks: glossy smears, but with a roughness FLOOR — a near-zero
    // roughness band under a 30-intensity spot fires a clipped specular spike
    // that blooms straight over the fighters' legs.
    paintStreaks(ctx, "90,90,90", 0.75);
    // Wet joints: the grooves hold water, so specular pooling draws the slab
    // grid at night — the floor's identity survives the light pools. Pushed
    // glossier + wider (critic fix h): the sodium pools must visibly BREAK
    // at the seams instead of washing over them.
    paintJoints(ctx, "rgba(24,24,24,0.92)", 7);
    // Puddles: glossy standing water (localised, so glints read as pools
    // without firing a clipped white ball through bloom).
    paintPuddles(ctx, "44,44,44", 0.95);
  }, { repeat: true, mirror: true });

  const metalness = canvasTexture(size, size, (ctx) => {
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(0, 0, size, size);
    paintStreaks(ctx, "160,160,160", 0.55);
    paintJoints(ctx, "rgba(150,150,150,0.7)", 5);
    // Puddles reflect like water: metalness high inside the pool (held just
    // off full mirror so lamp glints glow instead of clipping).
    paintPuddles(ctx, "200,200,200", 0.92);
  }, { repeat: true, mirror: true });

  // Bump: recessed joints + aggregate grain so the slabs catch raking light.
  const bump = canvasTexture(size, size, (ctx) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, size, size);
    for (const speck of speckles) {
      const tone = 110 + Math.round(speck.v * 60);
      ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
      ctx.fillRect(speck.x, speck.y, speck.r, speck.r);
    }
    paintJoints(ctx, "rgba(30,30,30,0.95)", 6);
    ctx.strokeStyle = "rgba(52,52,52,0.8)";
    ctx.lineWidth = 1.6;
    for (const crack of cracks) {
      ctx.beginPath();
      ctx.moveTo(crack[0].x, crack[0].y);
      for (const point of crack.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  }, { repeat: true, mirror: true });

  return { albedo, roughness, metalness, bump };
}

// Night-street environment for PMREM: dark sky dome, sodium horizon band and
// a few neon strips. Gives puddles + speculars something city-like to reflect.
export function buildNightEnvScene() {
  const scene = new THREE.Scene();
  const skyTexture = canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#04060d");
    gradient.addColorStop(0.55, "#0b1226");
    gradient.addColorStop(0.72, "#27180b");
    gradient.addColorStop(0.8, "#3d2410");
    gradient.addColorStop(1, "#120b06");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: true });
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide }),
  );
  scene.add(dome);
  const strip = (color, intensity, x, y, z, w, h, ry = 0) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    scene.add(mesh);
  };
  // Neon strips stay modest: at higher intensities the env-mapped floor
  // reflected them as a full-frame magenta wash instead of local glints.
  strip(0xff9a3c, 5, -14, 6, -20, 10, 1.4, 0.5);   // sodium row
  strip(0xff9a3c, 4, 16, 5, -18, 8, 1.2, -0.5);
  strip(0x35d8ff, 3, -20, 8, 8, 5, 2.4, 1.2);       // cool neon
  strip(0xff4fd8, 2.4, 22, 9, 6, 5, 2.2, -1.2);     // magenta neon
  strip(0xfff2c8, 3, 0, 14, -24, 16, 1, 0);         // dim skyline glow
  return scene;
}
