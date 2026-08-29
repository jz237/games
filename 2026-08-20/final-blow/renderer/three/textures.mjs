// Procedural canvas-texture factory for the CINEMA 3D renderer.
// Everything here is generated once at stage/fighter build time and cached;
// nothing allocates per frame.
import * as THREE from "three";
import { mulberry32 } from "./shared.mjs";

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

// Blurred copy of a sprite atlas for the wet-floor reflections: the mirror
// image must be softer than the sprite itself or it reads as a second fighter.
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
    ctx.drawImage(image, 0, 0);
    ctx.filter = "none";
    blurCache.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
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

// Tight expanding shockwave ring for impact VFX. Deliberately THIN: the band
// occupies only the outer ~12% of the radius so at full scale it reads as a
// crisp pressure wave, never a translucent soap bubble filling the frame.
export function ringTexture(size = 256) {
  return canvasTexture(size, size, (ctx, w, h) => {
    const r = w * 0.46;
    const gradient = ctx.createRadialGradient(w / 2, h / 2, r * 0.7, w / 2, h / 2, r);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.62, "rgba(255,255,255,0)");
    gradient.addColorStop(0.8, "rgba(255,255,255,0.28)");
    gradient.addColorStop(0.9, "rgba(255,255,255,1)");
    gradient.addColorStop(0.97, "rgba(255,255,255,0.3)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
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
    // Broken-water interruptions: horizontal dark ripple bands.
    ctx.globalCompositeOperation = "destination-out";
    for (let y = 8; y < h; y += 10 + (y * 7) % 13) {
      const strength = 0.12 + ((y * 13) % 17) / 17 * 0.3;
      ctx.fillStyle = `rgba(0,0,0,${strength.toFixed(3)})`;
      ctx.fillRect(0, y, w, 2 + (y % 5));
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

export function normalMapForAtlas(image, { strength = 1.6 } = {}) {
  const key = image.src || image;
  if (normalCache.has(key)) return normalCache.get(key);
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  const sctx = scratch.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(image, 0, 0);
  const src = sctx.getImageData(0, 0, w, h).data;
  // Height field: luminance * alpha, lightly box-blurred to tame dither noise.
  const height = new Float32Array(w * h);
  for (let i = 0, p = 0; i < height.length; i += 1, p += 4) {
    height[i] = ((src[p] * 0.299 + src[p + 1] * 0.587 + src[p + 2] * 0.114) / 255) * (src[p + 3] / 255);
  }
  const blurred = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += height[yy * w + xx];
          n += 1;
        }
      }
      blurred[y * w + x] = sum / n;
    }
  }
  const out = sctx.createImageData(w, h);
  const data = out.data;
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - 1) * w;
    const y1 = Math.min(h - 1, y + 1) * w;
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      const dhdx = (blurred[row + x1] - blurred[row + x0]) * strength;
      const dhdy = (blurred[y1 + x] - blurred[y0 + x]) * strength;
      // CanvasTexture flipY makes v point up, so +dhdy (image-down) maps to +G.
      let nx = -dhdx;
      let ny = dhdy;
      const nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv;
      ny *= inv;
      const p = (row + x) * 4;
      data[p] = Math.round((nx * 0.5 + 0.5) * 255);
      data[p + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[p + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      data[p + 3] = 255;
    }
  }
  sctx.putImageData(out, 0, 0);
  const texture = new THREE.CanvasTexture(scratch);
  texture.anisotropy = 4;
  normalCache.set(key, texture);
  return texture;
}

// Wet-asphalt PBR set: albedo + roughness + metalness sharing one seeded
// layout. Wetness is broad anisotropic damp streaks (screen-length smears the
// way a wet street actually reads), NOT elliptical puddle stamps — repeated
// ellipse decals read as sticker sheets from across the room.
export function asphaltMaps(seed = 20260829, size = 1024) {
  const rand = mulberry32(seed);
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
    ctx.fillStyle = "#1d2026";
    ctx.fillRect(0, 0, size, size);
    // Visible aggregate: brighter, higher-contrast speckle so the concrete
    // reads in-focus at the fight line instead of a featureless brown wash.
    for (const speck of speckles) {
      const tone = 20 + Math.round(speck.v * 52);
      ctx.fillStyle = `rgb(${tone},${tone + 3},${tone + 7})`;
      ctx.fillRect(speck.x, speck.y, speck.r, speck.r);
    }
    ctx.strokeStyle = "rgba(6,7,9,0.85)";
    ctx.lineWidth = 1.6;
    for (const crack of cracks) {
      ctx.beginPath();
      ctx.moveTo(crack[0].x, crack[0].y);
      for (const point of crack.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    // Faded lane paint fragments.
    ctx.fillStyle = "rgba(180,170,120,0.10)";
    for (let i = 0; i < 5; i += 1) ctx.fillRect(size * 0.1 + i * size * 0.19, size * 0.46, size * 0.075, size * 0.015);
    // Damp streaks read slightly darker + cooler in albedo.
    paintStreaks(ctx, "8,12,22", 0.4);
    ctx.globalCompositeOperation = "screen";
    paintStreaks(ctx, "52,66,104", 0.12);
    ctx.globalCompositeOperation = "source-over";
  }, { srgb: true, repeat: true, mirror: true });

  const roughness = canvasTexture(size, size, (ctx) => {
    ctx.fillStyle = "#d9d9d9";
    ctx.fillRect(0, 0, size, size);
    for (const speck of speckles) {
      const tone = 190 + Math.round(speck.v * 55);
      ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
      ctx.fillRect(speck.x, speck.y, speck.r, speck.r);
    }
    // Broad damp sheen variation.
    for (let i = 0; i < 8; i += 1) {
      const x = ((i * 173.3) % size);
      const y = ((i * 311.7) % size);
      const gradient = ctx.createRadialGradient(x, y, 4, x, y, size * 0.3);
      gradient.addColorStop(0, "rgba(120,120,120,0.35)");
      gradient.addColorStop(1, "rgba(120,120,120,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
    // Damp streaks: glossy (low roughness) smears, not mirror ellipses.
    paintStreaks(ctx, "26,26,26", 0.8);
  }, { repeat: true, mirror: true });

  const metalness = canvasTexture(size, size, (ctx) => {
    ctx.fillStyle = "#161616";
    ctx.fillRect(0, 0, size, size);
    paintStreaks(ctx, "150,150,150", 0.5);
  }, { repeat: true, mirror: true });

  return { albedo, roughness, metalness };
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
