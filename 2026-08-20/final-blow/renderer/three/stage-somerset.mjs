// Somerset / K&A hero stage for CINEMA 3D — Philly after dark, rebuilt in
// real 3D: wet-asphalt PBR ground with the backdrop's own light reflections
// smeared onto it (no seam between plate and playfield), the existing
// backdrop art as a graded, softly defocused projection card at depth,
// staggered building silhouette cards, the el-train overpass as lit
// shadow-casting geometry, practicals with soft-edged noise-filled light
// shafts that sit BEHIND the fighters, a living midground (silhouette
// pedestrians behind a chain-link fence, a passing car's headlight sweep,
// a TV-flicker window) and foreground frame silhouettes for parallax.
// All animation phases are deterministic functions of the renderer clock so
// screenshots freeze cleanly.
import * as THREE from "three";
import { PX, worldX, mulberry32, hash01 } from "./shared.mjs";
import { canvasTexture, asphaltMaps, softDotTexture, streakTexture, wetStreakTexture, bokehDiscTexture } from "./textures.mjs";
import { spriteLightFor } from "./stage-lighting.mjs";

const SODIUM = 0xffa04a;
const NEON_MAGENTA = 0xff4fd8;
const NEON_CYAN = 0x3fd6ff;

function gradedBackdropTexture(image) {
  return canvasTexture(1280, 720, (ctx, w, h) => {
    if (image?.complete && image.naturalWidth) {
      // Farthest plane: deep defocus, but STRUCTURED — a moderate blur keeps
      // window/sign shapes readable as depth (the old 5px wash read as a
      // low-res texture), and the bokeh disc field adds the discrete lens
      // circles a real defocused street produces.
      ctx.filter = "blur(3px)";
      ctx.drawImage(image, 0, 0, w, h);
      ctx.filter = "none";
    } else {
      ctx.fillStyle = "#0a0e18";
      ctx.fillRect(0, 0, w, h);
    }
    // Night grade: cool the shadows, keep sodium warmth in the mids, but
    // leave the plate readable — it is the hero backdrop, not set dressing.
    ctx.globalCompositeOperation = "multiply";
    const grade = ctx.createLinearGradient(0, 0, 0, h);
    grade.addColorStop(0, "#8496c4");
    grade.addColorStop(0.55, "#b3aec2");
    grade.addColorStop(1, "#77687e");
    ctx.fillStyle = grade;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "screen";
    const warmth = ctx.createRadialGradient(w * 0.5, h * 0.62, 40, w * 0.5, h * 0.62, w * 0.62);
    warmth.addColorStop(0, "rgba(110,66,22,0.2)");
    warmth.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = warmth;
    ctx.fillRect(0, 0, w, h);
    // Cool atmospheric haze rising from the street line: melts the plate's
    // base into the 3D floor instead of ending on a hard row of pixels.
    const haze = ctx.createLinearGradient(0, h * 0.55, 0, h);
    haze.addColorStop(0, "rgba(0,0,0,0)");
    haze.addColorStop(0.7, "rgba(46,66,102,0.28)");
    haze.addColorStop(1, "rgba(58,80,118,0.5)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    const vignette = ctx.createLinearGradient(0, 0, 0, h);
    vignette.addColorStop(0, "rgba(2,4,10,0.4)");
    vignette.addColorStop(0.3, "rgba(2,4,10,0)");
    vignette.addColorStop(0.88, "rgba(2,4,10,0)");
    vignette.addColorStop(1, "rgba(4,5,10,0.45)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: true });
}

// The backdrop's lit signage/storefront band, mirrored, blurred and streaked
// down onto the playfield asphalt: the plate's wet-street reflections keep
// going under the fighters' feet, killing the photo/floor seam.
function backdropReflectionTexture(image) {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    if (image?.complete && image.naturalWidth) {
      const iw = image.naturalWidth;
      const ih = image.naturalHeight;
      ctx.save();
      ctx.scale(1, -1);
      // Lit band of the plate (signage + storefront glow), mirrored so the
      // street line lands at the far edge of the carpet.
      ctx.filter = "blur(6px)";
      ctx.drawImage(image, 0, ih * 0.3, iw, ih * 0.54, 0, -h, w, h);
      // Second pass, heavier blur + vertical stretch = smeared wet streaks.
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.55;
      ctx.filter = "blur(14px)";
      ctx.drawImage(image, 0, ih * 0.34, iw, ih * 0.42, 0, -h, w, h * 1.45);
      ctx.restore();
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    // Fade the carpet out toward the camera (canvas bottom = near edge).
    ctx.globalCompositeOperation = "multiply";
    const fade = ctx.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, "#b4b4b4");
    fade.addColorStop(0.45, "#6f6f6f");
    fade.addColorStop(1, "#000000");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }, { srgb: true });
}

// Depth-of-field for card layers: paint sharp into a scratch canvas, then
// stamp it back through a gaussian blur — each parallax plane gets its own
// distinct focus level instead of one shared cutout sharpness.
function bluredCardTexture(width, height, blurPx, paint, options) {
  if (!blurPx) return canvasTexture(width, height, paint, options);
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  paint(scratch.getContext("2d"), width, height);
  return canvasTexture(width, height, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(scratch, 0, 0, w, h);
    ctx.filter = "none";
  }, options);
}

function buildingCardTexture(seed, tint, litWindows, blurPx = 0) {
  const rand = mulberry32(seed);
  return bluredCardTexture(512, 512, blurPx, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = tint;
    // Rooftop skyline silhouette.
    let x = 0;
    ctx.beginPath();
    ctx.moveTo(0, h);
    while (x < w) {
      const width = 60 + rand() * 120;
      const top = h * (0.12 + rand() * 0.3);
      ctx.lineTo(x, top);
      ctx.lineTo(Math.min(w, x + width), top);
      if (rand() > 0.6) {
        // Rooftop clutter: water tank / bulkhead.
        const cx = x + width * 0.5;
        ctx.rect(cx - 12, top - 26 - rand() * 14, 24, 30);
      }
      x += width;
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    // Dim window grid inside the silhouette.
    ctx.globalCompositeOperation = "source-atop";
    for (let i = 0; i < litWindows; i += 1) {
      const wx = rand() * w;
      const wy = h * 0.3 + rand() * h * 0.6;
      const warm = rand() > 0.35;
      ctx.fillStyle = warm
        ? `rgba(255,${170 + Math.round(rand() * 50)},90,${0.25 + rand() * 0.5})`
        : `rgba(140,190,255,${0.2 + rand() * 0.35})`;
      ctx.fillRect(wx, wy, 5 + rand() * 6, 8 + rand() * 8);
    }
    ctx.globalCompositeOperation = "source-over";
  }, { srgb: true });
}

// Chain-link fence card: midground structure the pedestrians walk behind.
function fenceTexture() {
  return canvasTexture(512, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(130,142,160,0.8)";
    ctx.lineWidth = 1.7;
    const cell = 16;
    for (let x = -h; x < w + h; x += cell) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + h, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    // Top rail + posts.
    ctx.strokeStyle = "rgba(150,160,175,0.8)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(w, 4);
    ctx.stroke();
    ctx.lineWidth = 4;
    for (let x = 24; x < w; x += 118) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }, { srgb: true, repeat: true });
}

// NON-REPEATING damage/dressing overlay laid across the whole fence run:
// bent-link scars, a sagging patch, taped posters — the breaks that stop the
// 16px diamond tile from reading as wallpaper at midground blur distance.
function fenceBreaksTexture() {
  return canvasTexture(2048, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const rand = mulberry32(0xfe9ce);
    // --- Bent/mangled link scars: wavy strokes overpainting the lattice ----
    const scarAt = (sx, sy, spread, count) => {
      ctx.strokeStyle = "rgba(148,158,174,0.9)";
      for (let i = 0; i < count; i += 1) {
        ctx.lineWidth = 1.4 + rand() * 1.3;
        ctx.beginPath();
        const x0 = sx + (rand() - 0.5) * spread;
        const y0 = sy + (rand() - 0.5) * spread * 0.6;
        ctx.moveTo(x0, y0);
        let px = x0;
        let py = y0;
        for (let s = 0; s < 4; s += 1) {
          px += (rand() - 0.2) * spread * 0.5;
          py += (rand() - 0.5) * spread * 0.7;
          const cx = px + (rand() - 0.5) * 18;
          const cy = py + (rand() - 0.5) * 18;
          ctx.quadraticCurveTo(cx, cy, px, py);
        }
        ctx.stroke();
      }
      // Dark hole behind the mangle: the lattice is torn open there.
      const hole = ctx.createRadialGradient(sx, sy, 2, sx, sy, spread * 0.55);
      hole.addColorStop(0, "rgba(5,7,10,0.55)");
      hole.addColorStop(1, "rgba(5,7,10,0)");
      ctx.fillStyle = hole;
      ctx.fillRect(sx - spread, sy - spread, spread * 2, spread * 2);
    };
    // Visible fence span in the standard FIGHT framing is only u ~0.39..0.61
    // (the wide corner shot reaches ~0.32..0.68) — the breaks must cluster
    // inside the narrow band or the on-screen run still reads as wallpaper.
    scarAt(w * 0.365, h * 0.42, 46, 9);
    scarAt(w * 0.505, h * 0.5, 44, 8);
    scarAt(w * 0.575, h * 0.6, 56, 11);
    scarAt(w * 0.655, h * 0.36, 38, 7);
    // --- Broad grime patches: soft dark blotches that modulate whole zones
    // of the lattice up/down — the low-frequency variation a real weathered
    // fence run has, and the strongest anti-wallpaper term at fight framing.
    for (let i = 0; i < 7; i += 1) {
      const gx = w * (0.34 + i * 0.048 + (rand() - 0.5) * 0.02);
      const gy = h * (0.3 + rand() * 0.5);
      const gr = 70 + rand() * 120;
      const patch = ctx.createRadialGradient(gx, gy, 4, gx, gy, gr);
      patch.addColorStop(0, `rgba(6,8,11,${(0.16 + rand() * 0.2).toFixed(3)})`);
      patch.addColorStop(1, "rgba(6,8,11,0)");
      ctx.fillStyle = patch;
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    // Snagged plastic bag: a pale scrap caught in the links, mid-band.
    ctx.save();
    ctx.translate(w * 0.472, h * 0.34);
    ctx.rotate(-0.2);
    ctx.fillStyle = "rgba(148,150,146,0.6)";
    ctx.beginPath();
    ctx.moveTo(-14, -10);
    ctx.quadraticCurveTo(4, -22, 16, -8);
    ctx.quadraticCurveTo(22, 6, 6, 14);
    ctx.quadraticCurveTo(-10, 18, -16, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(60,62,60,0.5)";
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.quadraticCurveTo(6, -4, 4, 8);
    ctx.quadraticCurveTo(-8, 8, -6, -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // --- Sagging top-rail dip: the rail bows where a car clipped it --------
    ctx.strokeStyle = "rgba(150,160,175,0.85)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w * 0.4, 4);
    ctx.quadraticCurveTo(w * 0.45, 22, w * 0.5, 6);
    ctx.stroke();
    // --- Taped posters/flyers: dull paper rectangles with print lines ------
    const poster = (px, py, pw, ph, tone, lean) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(lean);
      ctx.fillStyle = tone;
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.fillStyle = "rgba(28,32,40,0.85)";
      for (let line = 0; line < 4; line += 1) {
        const ly = -ph / 2 + ph * (0.22 + line * 0.18);
        ctx.fillRect(-pw * 0.36, ly, pw * (0.5 + rand() * 0.22), ph * 0.07);
      }
      // Torn corner + tape glints.
      ctx.fillStyle = "rgba(8,10,14,0.6)";
      ctx.beginPath();
      ctx.moveTo(pw / 2, ph / 2);
      ctx.lineTo(pw / 2 - pw * 0.3, ph / 2);
      ctx.lineTo(pw / 2, ph / 2 - ph * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(210,218,228,0.5)";
      ctx.fillRect(-pw / 2 - 2, -ph / 2 - 2, 8, 5);
      ctx.fillRect(pw / 2 - 6, -ph / 2 - 2, 8, 5);
      ctx.restore();
    };
    poster(w * 0.405, h * 0.52, 46, 62, "#8d8471", -0.06);
    poster(w * 0.455, h * 0.44, 38, 50, "#7c8577", 0.1);
    poster(w * 0.545, h * 0.55, 44, 58, "#8a7d6b", -0.09);
    poster(w * 0.625, h * 0.47, 40, 54, "#767f83", 0.08);
    poster(w * 0.34, h * 0.58, 34, 46, "#837768", 0.04);
  }, { srgb: true });
}

// Two-frame walking figure for the midground pedestrians — LIT, not a flat
// black cutout: clothing tones, a coloured rim highlight down one side (from
// whichever practical is nearest) and a subtle top kiss on head/shoulders.
// blurPx > 0 produces the defocused far-crowd variant.
function pedestrianTexture(step, blurPx = 0, style = {}) {
  const body = style.body || "#12161f";
  const jacket = style.jacket || "#1a2029";
  const rim = style.rim || "rgba(255,160,74,0.85)";
  const rimSide = style.rimSide ?? 1; // 1 = right edge lit, -1 = left
  const top = style.top || "rgba(190,255,222,0.5)";
  return bluredCardTexture(96, 192, blurPx, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const drawFigure = (fill, dx) => {
      ctx.fillStyle = fill;
      ctx.strokeStyle = fill;
      // Head.
      ctx.beginPath();
      ctx.arc(cx + dx, h * 0.13, w * 0.13, 0, Math.PI * 2);
      ctx.fill();
      // Torso (jacket drawn separately below).
      ctx.beginPath();
      ctx.moveTo(cx + dx - w * 0.2, h * 0.22);
      ctx.lineTo(cx + dx + w * 0.2, h * 0.22);
      ctx.lineTo(cx + dx + w * 0.16, h * 0.58);
      ctx.lineTo(cx + dx - w * 0.16, h * 0.58);
      ctx.closePath();
      ctx.fill();
      ctx.lineCap = "round";
      ctx.lineWidth = w * 0.14;
      const spread = step === 0 ? w * 0.2 : w * 0.05;
      ctx.beginPath();
      ctx.moveTo(cx + dx - w * 0.06, h * 0.56);
      ctx.lineTo(cx + dx - spread, h * 0.94);
      ctx.moveTo(cx + dx + w * 0.06, h * 0.56);
      ctx.lineTo(cx + dx + spread, h * 0.96);
      ctx.stroke();
      ctx.lineWidth = w * 0.11;
      const swing = step === 0 ? w * 0.14 : w * 0.03;
      ctx.beginPath();
      ctx.moveTo(cx + dx - w * 0.18, h * 0.26);
      ctx.lineTo(cx + dx - w * 0.14 - swing, h * 0.46);
      ctx.moveTo(cx + dx + w * 0.18, h * 0.26);
      ctx.lineTo(cx + dx + w * 0.14 + swing, h * 0.46);
      ctx.stroke();
    };
    // Rim pass FIRST: the lit copy offset toward the light, then the body
    // stamped over it — leaves a 1-2px lit edge along one silhouette side.
    drawFigure(rim, rimSide * w * 0.028);
    drawFigure(body, 0);
    // Jacket tone over the torso so the figure has clothing, not void.
    ctx.fillStyle = jacket;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.18, h * 0.24);
    ctx.lineTo(cx + w * 0.18, h * 0.24);
    ctx.lineTo(cx + w * 0.145, h * 0.56);
    ctx.lineTo(cx - w * 0.145, h * 0.56);
    ctx.closePath();
    ctx.fill();
    // Cool top kiss on head + shoulders from the overhead lamps.
    ctx.globalCompositeOperation = "source-atop";
    const kiss = ctx.createLinearGradient(0, 0, 0, h * 0.4);
    kiss.addColorStop(0, top);
    kiss.addColorStop(1, "rgba(190,255,222,0)");
    ctx.fillStyle = kiss;
    ctx.fillRect(0, 0, w, h * 0.4);
    ctx.globalCompositeOperation = "source-over";
  }, { srgb: true });
}

// Soft-edged, noise-filled, flickering light shaft. Rendered with depth
// testing ON and positioned BEHIND the fighter plane, so fighters occlude the
// beam instead of being tinted by a constant-alpha triangle.
function volumeShaft(color, radiusTop, radiusBottom, height, opacity) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uFlicker: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uFlicker;
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewV;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        // Soft silhouette: fade where the cone surface turns away from view.
        float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
        float edge = pow(facing, 2.4);
        // Bright at the lamp, feathered to nothing WELL before the base so
        // the beams read as cones of dusty air, not standing glass panels.
        float fall = pow(vUv.y, 2.1);
        // Dust motes drifting slowly down through the beam.
        float dust = vnoise(vec2(vUv.x * 9.0, vUv.y * 5.0 + uTime * 0.16));
        dust += 0.5 * vnoise(vec2(vUv.x * 21.0 + 7.3, vUv.y * 11.0 + uTime * 0.34));
        float body = 0.55 + 0.45 * smoothstep(0.42, 1.05, dust);
        gl_FragColor = vec4(uColor, uOpacity * uFlicker * edge * fall * body);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 24, 1, true),
    material,
  );
  mesh.renderOrder = 3;
  return mesh;
}

// Slow steam plume drifting up from a station grate: scrolling fractal noise
// shaped into a rising column that widens and thins with height. Additive and
// deterministic in uTime, so it drifts through the lamp beams and freezes
// cleanly for screenshots.
function steamPlume(color, width, height, opacity, seed) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uSeed: { value: seed },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uSeed;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453123); }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        // Rising, sideways-wandering noise column.
        float drift = sin(uTime * 0.21 + uSeed) * 0.16 * vUv.y;
        vec2 p = vec2((vUv.x - 0.5 - drift) * 2.6, vUv.y * 2.1 - uTime * 0.14);
        float n = vnoise(p * 2.2) * 0.62 + vnoise(p * 5.1 + 3.7) * 0.38;
        // Column mask: tight at the grate, blooming then dissolving upward.
        float spine = 1.0 - abs(vUv.x - 0.5 - drift) / (0.16 + vUv.y * 0.4);
        float column = clamp(spine, 0.0, 1.0);
        float fade = smoothstep(0.0, 0.14, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float body = smoothstep(0.36, 0.85, n) * column * fade;
        gl_FragColor = vec4(uColor, body * uOpacity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.renderOrder = 3;
  return mesh;
}

export function buildSomersetStage(host, { quality }) {
  const group = new THREE.Group();
  group.name = "stage-somerset";
  const updaters = [];
  const flickers = [];
  const shadowSize = quality === "high" ? 2048 : 1024;

  // --- Atmosphere -----------------------------------------------------------
  // DEPTH-GRADED fog: zero at the fight plane (camera sits ~6.7 units out, so
  // near=8.8 starts just behind the fighters), thickening only past the
  // mid-ground. The old FogExp2 misted the fighters themselves — uniform haze.
  const fog = new THREE.Fog(0x0a0e19, 8.8, 26);
  const background = new THREE.Color(0x05070d);

  // --- Ground: wet concrete slabs ------------------------------------------
  // Expansion-joint grid + aggregate + bump so the surface has IDENTITY at
  // the fight line (readable slabs, specular pooling in the grooves) instead
  // of a blurry wash.
  const maps = asphaltMaps(0x50fa57);
  // Coarser repeat (round-3, critic item 3): at (4,2) the slab grid behind
  // the curb compressed into a dense bathroom-tile read against the wide
  // plank-like slabs at the fight line — two floors in one frame. At
  // (2.4, 1.2) the joint pitch stays big enough to read as the SAME poured
  // slabs receding in perspective, front band to fence line.
  maps.albedo.repeat.set(2.4, 1.2);
  maps.roughness.repeat.set(2.4, 1.2);
  maps.metalness.repeat.set(2.4, 1.2);
  maps.bump.repeat.set(2.4, 1.2);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 13),
    new THREE.MeshStandardMaterial({
      map: maps.albedo,
      roughnessMap: maps.roughness,
      metalnessMap: maps.metalness,
      bumpMap: maps.bump,
      // Raised so raking practicals catch the plank/aggregate relief and the
      // light pools break up instead of reading as smooth decals.
      bumpScale: 0.6,
      roughness: 1,
      metalness: 1,
      envMapIntensity: 0.9,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -2.4);
  ground.receiveShadow = true;
  group.add(ground);

  // The backdrop's own reflections continued onto the playfield: mirrored,
  // blurred, streaked and faded toward the camera (seam killer #1). Kept
  // WELL behind the fence line and cooled hard — at full warmth/reach it
  // repainted the whole street as a brown gradient instead of wet asphalt.
  const reflectionCarpet = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 5),
    new THREE.MeshBasicMaterial({
      map: backdropReflectionTexture(host.stageImages.somerset),
      transparent: true,
      opacity: 0.26,
      color: new THREE.Color(0.72, 0.78, 0.98),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  reflectionCarpet.name = "fb-carpet";
  reflectionCarpet.rotation.x = -Math.PI / 2;
  reflectionCarpet.position.set(0, 0.006, -6.4);
  group.add(reflectionCarpet);

  // Wet-concrete specular streaks at the fight line: every practical smears
  // its own colour down the asphalt toward camera — pink under the K&A neon,
  // green-white under the station lamp, sodium pools under the streetlights,
  // dim warm bokeh smears from the backdrop. This is the reflection layer
  // that ties the fighters into the stage.
  const wetStreakMap = wetStreakTexture();
  const groundStreaks = [];
  const groundStreak = (color, x, zFar, length, width, opacity) => {
    const streak = new THREE.Mesh(
      new THREE.PlaneGeometry(width, length),
      new THREE.MeshBasicMaterial({
        map: wetStreakMap,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    streak.name = "fb-wet-streak";
    streak.rotation.x = -Math.PI / 2;
    // Plane local +y maps to world -z after the fold: texture top (bright,
    // under the source) lands at zFar, feathering toward the camera.
    streak.position.set(x, 0.008 + groundStreaks.length * 0.0005, zFar + length * 0.5);
    streak.renderOrder = 2;
    group.add(streak);
    groundStreaks.push(streak);
    return streak;
  };
  // K&A pink smear: THE hero reflection — a long magenta streak dragged from
  // under the sign all the way toward the camera THROUGH the fight line.
  const neonStreak = groundStreak(NEON_MAGENTA, 4.75, -3.1, 9.6, 2.2, 0.62);
  // Green-white smear from the overhead station lamp: pulled forward through
  // the fight plane so the lamp legibly reflects where the fighters stand.
  const lampStreak = groundStreak(0xbfffd9, 2.9, -4.4, 5.6, 1.5, 0.2);
  const lampStreak2 = groundStreak(0xd6ffe9, 0.4, -4.0, 6.4, 1.1, 0.15);
  groundStreak(SODIUM, -1.85, -1.6, 4.6, 0.9, 0.19);                          // left sodium head
  groundStreak(SODIUM, 1.85, -1.6, 4.6, 0.9, 0.19);                          // right sodium head
  groundStreak(0xff9a3c, -5.6, -4.6, 4.2, 1.7, 0.12);                         // warm bokeh smears
  groundStreak(0xffb060, -7.4, -4.8, 3.6, 1.4, 0.09);
  groundStreak(0x3fd6ff, 6.3, -2.4, 4.4, 0.85, 0.3);                          // cyan check-cashing
  groundStreak(0xffc070, 7.6, -4.6, 3.2, 1.4, 0.09);
  // Shelter lightbox: the lit ad panel answers on the wet street below it —
  // EVERY emissive in frame owns a reflection, the lightbox included.
  const shelterStreak = groundStreak(0xffe9c0, -0.25, -5.7, 4.2, 1.05, 0.14);
  // Traffic-signal smear: red/green swaps with the signal phase (wired into
  // the signal flicker below), so even the corner light reflects.
  const signalStreak = groundStreak(0xff2b1e, -4.05, -1.75, 3.2, 0.62, 0.12);

  // Sidewalk curb line behind the fighters: expansion cuts + a worn top-edge
  // highlight so the long horizontal band carries mid-frequency detail
  // instead of reading as one flat extrusion (coherence fix i).
  const curbTexture = canvasTexture(512, 64, (ctx, w, h) => {
    const rand = mulberry32(0xc07b);
    ctx.fillStyle = "#1d2026";
    ctx.fillRect(0, 0, w, h);
    // Tonal patches along the run.
    for (let i = 0; i < 10; i += 1) {
      const px = rand() * w;
      const pw = 30 + rand() * 60;
      ctx.fillStyle = `rgba(${12 + Math.round(rand() * 14)},${14 + Math.round(rand() * 14)},${18 + Math.round(rand() * 16)},0.55)`;
      ctx.fillRect(px, 0, pw, h);
    }
    // Expansion cuts.
    ctx.fillStyle = "rgba(5,6,9,0.9)";
    for (let x = 26; x < w; x += 84) ctx.fillRect(x + (rand() - 0.5) * 8, 0, 2.5, h);
    // Worn top-edge highlight, chipped in places.
    ctx.fillStyle = "rgba(96,104,118,0.5)";
    ctx.fillRect(0, 0, w, 3);
    ctx.fillStyle = "rgba(10,12,16,0.8)";
    for (let i = 0; i < 8; i += 1) ctx.fillRect(rand() * w, 0, 4 + rand() * 10, 3);
  }, { srgb: true, repeat: true });
  curbTexture.repeat.set(8, 1);
  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(46, 0.14, 1.7),
    new THREE.MeshStandardMaterial({ map: curbTexture, color: 0xb8bcc4, roughness: 0.85 }),
  );
  curb.name = "fb-curb";
  curb.position.set(0, 0.07, -4.2);
  curb.receiveShadow = true;
  group.add(curb);

  // --- Backdrop card: existing art, graded, gentle cylindrical warp --------
  const backdropGeometry = new THREE.PlaneGeometry(26, 14.6, 48, 8);
  const positions = backdropGeometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const nx = positions.getX(i) / 13; // -1..1
    positions.setZ(i, -Math.pow(Math.abs(nx), 1.7) * 1.9);
  }
  backdropGeometry.computeVertexNormals();
  const backdropMaterial = new THREE.MeshBasicMaterial({ map: gradedBackdropTexture(host.stageImages.somerset) });
  backdropMaterial.color.setRGB(1.08, 1.06, 1.14); // gentle cool lift, no frame-wide bloom feed
  const backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial);
  backdrop.position.set(0, 4.1, -11);
  group.add(backdrop);

  // Seam blend + atmospheric depth: standing haze gradients at the plate's
  // base and at mid-depth (transparent at top, cool haze at street level).
  const hazeTexture = canvasTexture(64, 128, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "rgba(74,98,142,0)");
    gradient.addColorStop(0.6, "rgba(74,98,142,0.42)");
    gradient.addColorStop(1, "rgba(64,86,126,0.62)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: true });
  const hazeBand = (width, height, x, y, z, opacity) => {
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: hazeTexture,
        transparent: true,
        opacity,
        depthWrite: false,
        fog: false,
      }),
    );
    band.name = "fb-haze";
    band.position.set(x, y, z);
    band.renderOrder = 2;
    group.add(band);
    return band;
  };
  // One LOW band right at the plate/floor junction only: taller or nearer
  // bands frosted the whole midground into a glass box.
  hazeBand(30, 1.3, 0, 0.62, -8.82, 0.5);

  // --- Mid-ground building silhouette cards at staggered depths ------------
  // Rooftop skylines only: their bottoms stay above the backdrop's street art
  // so the hero plate remains readable behind the fighters. Each depth gets
  // its own defocus (sharp -> 2px -> 4px): three genuinely distinct focus
  // planes instead of one shared cutout sharpness.
  const cardSpecs = [
    { seed: 11, tint: "#0d1220", windows: 26, z: -9.5, y: 5.6, w: 34, h: 6.4, blur: 4 },
    { seed: 23, tint: "#111828", windows: 18, z: -7.2, y: 5.5, w: 30, h: 5, blur: 2 },
    { seed: 37, tint: "#080c16", windows: 10, z: -5.4, y: 4.6, w: 27, h: 3.8, blur: 0 },
  ];
  for (const spec of cardSpecs) {
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.w, spec.h),
      new THREE.MeshBasicMaterial({
        map: buildingCardTexture(spec.seed, spec.tint, spec.windows, spec.blur),
        transparent: true,
        depthWrite: false,
      }),
    );
    card.position.set(0, spec.y, spec.z);
    card.renderOrder = 1;
    group.add(card);
  }

  // Hot window planes that punch through the bloom threshold.
  const windowSpots = [
    { x: -6.2, y: 4.7, z: -7.1, color: 0xffc06a, intensity: 2.6 },
    { x: 4.8, y: 5.3, z: -9.3, color: 0xffdf9a, intensity: 2.2 },
    { x: -3.1, y: 5.8, z: -9.4, color: 0x9fc8ff, intensity: 1.8 },
  ];
  const windowGlow = [];
  for (const spot of windowSpots) {
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.72),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(spot.color).multiplyScalar(spot.intensity) }),
    );
    pane.position.set(spot.x, spot.y, spot.z + 0.02);
    group.add(pane);
    windowGlow.push(pane);
  }
  // Living midground: the cool pane flickers like a TV behind glass.
  const tvPane = windowGlow[2];
  updaters.push((t) => {
    const step = Math.floor(t * 6.7);
    const level = 0.9 + hash01(step) * 1.6 + (hash01(step * 3 + 11) > 0.82 ? 0.9 : 0);
    tvPane.material.color.set(hash01(step * 5 + 3) > 0.4 ? 0x9fc8ff : 0xcfe2ff).multiplyScalar(level);
  });

  // --- Bokeh disc field: the defocused street's lights as DISCRETE lens
  // circles (SF6 lantern bokeh), not gaussian smears. Hot enough to bloom a
  // little; sizes/colours scatter deterministically across the far planes.
  // Three softness planes (critic fix 5): crisp near-defocus lens circles,
  // mid melt, far fully-melted glows — the field carries genuinely different
  // focus depths instead of one shared disc stamp.
  const bokehMaps = [bokehDiscTexture(64, 0), bokehDiscTexture(64, 0.55), bokehDiscTexture(64, 1)];
  const bokehRand = mulberry32(0xb0ceb);
  const bokehColors = [0xffb066, 0xffd9a0, 0xff9a3c, 0x8fd8ff, 0xff7ce0, 0xfff2c8];
  for (let i = 0; i < 18; i += 1) {
    const depth = bokehRand(); // 0 near (z -8.6) .. 1 far (z -11.4)
    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        // softness follows depth (far discs melt) with a random half-step
        map: bokehMaps[Math.min(2, Math.floor(depth * 2 + bokehRand() * 0.9))],
        color: new THREE.Color(bokehColors[Math.floor(bokehRand() * bokehColors.length)])
          .multiplyScalar(1.15 + bokehRand() * 1.15),
        transparent: true,
        opacity: 0.5 + bokehRand() * 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    // Bigger discs when further defocused (deeper). CONSTRAINED to the lit
    // street band (y 0.85..2.35): scattered any higher they landed over the
    // dark building silhouettes, and a defocused light circle floating on a
    // solid dark tower reads as bokeh IN FRONT of the midground (critic
    // fix e) — the street band is the only zone that legibly holds distant
    // practicals behind the fence. WIDER size scatter (critic fix 5): tiny
    // pinpricks through fat melted pools, slight ellipse per disc.
    const scale = (0.11 + bokehRand() * 0.3) * (1 + depth * 1.1);
    disc.scale.set(scale, scale * (0.9 + bokehRand() * 0.2), 1);
    disc.position.set(
      (bokehRand() - 0.5) * 21,
      0.85 + bokehRand() * 1.5,
      -8.6 - depth * 2.8,
    );
    disc.renderOrder = 1;
    group.add(disc);
  }

  // --- Station story props behind the fence (critic fix 5) -----------------
  // Four RECOGNIZABLE silhouettes at just-below-fence contrast: a stopped
  // SEPTA bus with a lit window band, a fare kiosk with a cool screen, a
  // turnstile bank, and a keystone SEPTA pole sign. Dark bodies, one small
  // emissive read each — story detail, never competition for the fighters.
  const storyProp = (paint, w, h, x, y, z, opts = {}) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(opts.tw ?? 256, opts.th ?? 256, paint, { srgb: true }),
        transparent: true,
        opacity: opts.opacity ?? 0.96,
        depthWrite: false,
        // slight lift on the lit elements so they survive the painterly
        // flatten + night grade (fog still applies: same air as the street)
        color: new THREE.Color(1, 1, 1).multiplyScalar(opts.boost ?? 1),
      }),
    );
    mesh.position.set(x, y, z);
    mesh.renderOrder = 1;
    group.add(mesh);
    return mesh;
  };
  // Stopped SEPTA bus, far screen-left: long dark mass, warm lit window band,
  // glowing route header, wheel notches — instantly a bus through the fence.
  storyProp((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#141920";
    ctx.beginPath();
    ctx.moveTo(w * 0.02, h * 0.92);
    ctx.lineTo(w * 0.02, h * 0.24);
    ctx.quadraticCurveTo(w * 0.03, h * 0.1, w * 0.1, h * 0.1);
    ctx.lineTo(w * 0.94, h * 0.1);
    ctx.quadraticCurveTo(w * 0.98, h * 0.12, w * 0.98, h * 0.26);
    ctx.lineTo(w * 0.98, h * 0.92);
    ctx.closePath();
    ctx.fill();
    // window band: warm interior light broken by mullions + a rider head
    ctx.fillStyle = "rgba(255,196,120,0.85)";
    ctx.fillRect(w * 0.07, h * 0.22, w * 0.86, h * 0.24);
    ctx.fillStyle = "#141920";
    for (let i = 0; i < 7; i += 1) ctx.fillRect(w * (0.145 + i * 0.12), h * 0.22, w * 0.018, h * 0.24);
    ctx.beginPath();
    ctx.arc(w * 0.4, h * 0.42, w * 0.026, 0, Math.PI * 2); // silhouetted rider
    ctx.fill();
    // route header glow + marker lights
    ctx.fillStyle = "rgba(255,150,60,0.95)";
    ctx.fillRect(w * 0.07, h * 0.12, w * 0.2, h * 0.06);
    ctx.fillStyle = "rgba(255,120,60,0.8)";
    for (const mx of [0.05, 0.5, 0.95]) ctx.fillRect(w * mx - 2, h * 0.08, 4, 3);
    // skirt shadow + wheel notches
    ctx.fillStyle = "#080b10";
    ctx.fillRect(w * 0.02, h * 0.78, w * 0.96, h * 0.14);
    ctx.beginPath();
    ctx.arc(w * 0.22, h * 0.92, w * 0.055, 0, Math.PI * 2);
    ctx.arc(w * 0.76, h * 0.92, w * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }, 4.2, 1.5, -4.7, 0.8, -7.0, { tw: 512, th: 192, opacity: 0.94, boost: 1.3 });
  // Fare kiosk: tall cabinet, cool screen glow, card slot, base plinth.
  storyProp((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#161b23";
    ctx.fillRect(w * 0.18, h * 0.06, w * 0.64, h * 0.88);
    ctx.fillStyle = "#0c1017";
    ctx.fillRect(w * 0.12, h * 0.9, w * 0.76, h * 0.08);
    ctx.fillStyle = "rgba(127,196,255,0.9)"; // idle screen
    ctx.fillRect(w * 0.28, h * 0.16, w * 0.44, h * 0.2);
    ctx.fillStyle = "rgba(196,228,255,0.85)";
    ctx.fillRect(w * 0.3, h * 0.19, w * 0.28, h * 0.03);
    ctx.fillRect(w * 0.3, h * 0.25, w * 0.36, h * 0.02);
    ctx.fillStyle = "rgba(255,214,150,0.75)"; // card reader
    ctx.fillRect(w * 0.36, h * 0.46, w * 0.28, h * 0.045);
    ctx.strokeStyle = "rgba(140,150,168,0.5)"; // panel seams
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.24, h * 0.56, w * 0.52, h * 0.26);
  }, 0.62, 1.32, -2.6, 0.66, -6.0, { tw: 128, th: 256, boost: 1.18 });
  // Turnstile bank: three pedestals with tripod arms between end cabinets.
  storyProp((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 3; i += 1) {
      const px = w * (0.16 + i * 0.28);
      ctx.fillStyle = "#171c24";
      ctx.fillRect(px, h * 0.3, w * 0.1, h * 0.62); // pedestal
      ctx.fillStyle = "#1e242e";
      ctx.fillRect(px - w * 0.012, h * 0.26, w * 0.124, h * 0.08); // head
      // tripod arms catching the station's green-white spill
      ctx.strokeStyle = "rgba(168,188,178,0.85)";
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(2.5, w * 0.014);
      ctx.beginPath();
      ctx.moveTo(px + w * 0.05, h * 0.34);
      ctx.lineTo(px + w * 0.185, h * 0.42);
      ctx.moveTo(px + w * 0.05, h * 0.34);
      ctx.lineTo(px + w * 0.14, h * 0.55);
      ctx.moveTo(px + w * 0.05, h * 0.34);
      ctx.lineTo(px - w * 0.02, h * 0.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(190,255,225,0.5)"; // fare-paid lamp dot
      ctx.fillRect(px + w * 0.03, h * 0.29, w * 0.02, h * 0.02);
    }
  }, 1.9, 0.85, 1.25, 0.43, -6.05, { tw: 384, th: 160, opacity: 0.94, boost: 1.15 });
  // Keystone SEPTA pole sign: the transit-authority read over the fence line.
  storyProp((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#10151d";
    ctx.fillRect(w * 0.47, h * 0.3, w * 0.06, h * 0.7); // pole
    // keystone plate
    const kx = w * 0.5;
    const ky = h * 0.18;
    const kw = w * 0.62;
    const kh = h * 0.3;
    ctx.fillStyle = "#22355c";
    ctx.beginPath();
    ctx.moveTo(kx - kw * 0.5, ky - kh * 0.28);
    ctx.lineTo(kx - kw * 0.3, ky - kh * 0.5);
    ctx.lineTo(kx + kw * 0.3, ky - kh * 0.5);
    ctx.lineTo(kx + kw * 0.5, ky - kh * 0.28);
    ctx.lineTo(kx + kw * 0.38, ky + kh * 0.5);
    ctx.lineTo(kx - kw * 0.38, ky + kh * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(214,228,246,0.85)";
    ctx.lineWidth = Math.max(2, w * 0.015);
    ctx.stroke();
    ctx.fillStyle = "rgba(224,236,250,0.92)";
    ctx.font = `900 ${Math.round(h * 0.11)}px Arial Narrow, Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SEPTA", kx, ky + kh * 0.02);
  }, 0.85, 1.7, 5.7, 1.06, -6.15, { tw: 128, th: 256, opacity: 0.95, boost: 1.15 });

  // Shared contact-ellipse matte for all static background figures.
  const bystanderShadowMap = softDotTexture(96, "rgba(0,0,0,1)", "rgba(0,0,0,0)");

  // --- Round-3 band density (critic item 5) --------------------------------
  // The props existed but did not READ: the band gets individual dim
  // practicals (platform downlights with halos + wet answers), a waiting
  // bench, two STANDING rim-lit figures, and a lit laundromat storefront
  // filling the near-black left third. Every glow is small and dim — story
  // light, never competition for the fight line.
  const bandGlowMap = softDotTexture(96);
  const bandGlow = (color, x, y, z, size, opacity) => {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        map: bandGlowMap,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    glow.position.set(x, y, z);
    glow.renderOrder = 2;
    group.add(glow);
    return glow;
  };
  // Three platform downlights along the station band: gooseneck stem +
  // shade + bright head, halo hugging the fixture — each glow is ANCHORED
  // to visible hardware (a bare ball of light is exactly the matte-residue
  // read the head-halo fix just killed).
  const fixtureSteel = new THREE.MeshBasicMaterial({ color: 0x2a2f38, fog: false });
  for (const [plx, hue] of [[-3.5, 0xffd9a0], [-0.9, 0xd6ffe9], [2.35, 0xffd9a0]]) {
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.85, 0.05), fixtureSteel);
    stem.position.set(plx, 2.62, -6.4);
    group.add(stem);
    const shade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.16), fixtureSteel);
    shade.position.set(plx, 2.2, -6.4);
    group.add(shade);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.05, 0.1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hue).multiplyScalar(3.1), fog: false }),
    );
    head.position.set(plx, 2.14, -6.38);
    group.add(head);
    bandGlow(hue, plx, 2.05, -6.42, 0.8, 0.34);
    // Dim pool on the platform below each fixture.
    const pool = bandGlow(hue, plx, 0.28, -6.35, 1.5, 0.16);
    pool.scale.y = 0.5;
  }
  // Waiting bench under the right platform light, slatted top catching it.
  storyProp((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#151a21";
    ctx.fillRect(w * 0.06, h * 0.34, w * 0.88, h * 0.16); // seat mass
    ctx.fillRect(w * 0.1, h * 0.5, w * 0.08, h * 0.44);   // legs
    ctx.fillRect(w * 0.82, h * 0.5, w * 0.08, h * 0.44);
    ctx.fillRect(w * 0.06, h * 0.06, w * 0.88, h * 0.12); // back rail
    ctx.fillRect(w * 0.12, h * 0.18, w * 0.05, h * 0.2);  // back posts
    ctx.fillRect(w * 0.83, h * 0.18, w * 0.05, h * 0.2);
    // lamp catch on the seat slats + back rail top edge
    ctx.fillStyle = "rgba(255,214,150,0.5)";
    ctx.fillRect(w * 0.06, h * 0.34, w * 0.88, h * 0.035);
    ctx.fillStyle = "rgba(255,214,150,0.32)";
    ctx.fillRect(w * 0.06, h * 0.06, w * 0.88, h * 0.03);
    for (let s = 0; s < 5; s += 1) ctx.fillRect(w * (0.1 + s * 0.17), h * 0.37, w * 0.02, h * 0.1);
  }, 1.15, 0.42, 2.6, 0.21, -6.2, { tw: 256, th: 96, opacity: 0.95, boost: 1.1 });
  // Two STANDING figures behind the fence — planted, rim-lit, watching the
  // fight (the walkers pass; these two give the band persistent human mass).
  const standerSpecs = [
    { x: -1.85, z: -6.18, scale: 1.58, flip: 1, style: { rim: "rgba(214,255,233,0.75)", rimSide: 1, jacket: "#181d26", top: "rgba(190,255,222,0.45)" } },
    { x: 3.55, z: -6.28, scale: 1.66, flip: -1, style: { rim: "rgba(255,178,92,0.8)", rimSide: -1, jacket: "#221c1a", body: "#120f14", top: "rgba(255,214,150,0.35)" } },
  ];
  for (const spec of standerSpecs) {
    const stander = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.scale * 0.5, spec.scale),
      new THREE.MeshBasicMaterial({
        map: pedestrianTexture(0, 0, spec.style),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        color: 0x8d94a2,
      }),
    );
    stander.position.set(spec.x, spec.scale * 0.5, spec.z);
    stander.scale.x = spec.flip;
    stander.renderOrder = 1;
    group.add(stander);
    const standerContact = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.scale * 0.3, spec.scale * 0.08),
      new THREE.MeshBasicMaterial({
        map: bystanderShadowMap,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        color: 0x000000,
      }),
    );
    standerContact.rotation.x = -Math.PI / 2;
    standerContact.position.set(spec.x, 0.012, spec.z + 0.06);
    standerContact.renderOrder = 1;
    group.add(standerContact);
  }
  // Lit laundromat storefront: the left-third void gets a place. Warm window
  // grid over machine silhouettes, cyan OPEN sign, awning mass — baked 1.5px
  // soft (deep plane: the depth-graded defocus is IN the texture, farther
  // than the tack-sharp turnstiles, softer than the bus).
  storyProp((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.filter = "blur(1.5px)";
    ctx.fillStyle = "#0e1218";
    ctx.fillRect(0, 0, w, h); // building mass
    // window band
    ctx.fillStyle = "rgba(255,206,138,0.88)";
    ctx.fillRect(w * 0.08, h * 0.34, w * 0.84, h * 0.42);
    // interior: washer drums + counter silhouettes
    ctx.fillStyle = "rgba(46,38,30,0.9)";
    for (let m = 0; m < 4; m += 1) {
      ctx.fillRect(w * (0.12 + m * 0.2), h * 0.52, w * 0.15, h * 0.24);
      ctx.fillStyle = "rgba(255,232,190,0.5)";
      ctx.beginPath();
      ctx.arc(w * (0.195 + m * 0.2), h * 0.63, w * 0.045, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(46,38,30,0.9)";
    }
    // window mullions
    ctx.fillStyle = "#0e1218";
    for (let i = 1; i < 4; i += 1) ctx.fillRect(w * (0.08 + i * 0.21), h * 0.34, w * 0.02, h * 0.42);
    // awning
    ctx.fillStyle = "#181320";
    ctx.fillRect(w * 0.04, h * 0.22, w * 0.92, h * 0.12);
    ctx.fillStyle = "rgba(255,150,60,0.35)";
    ctx.fillRect(w * 0.04, h * 0.31, w * 0.92, h * 0.03);
    // cyan OPEN sign
    ctx.fillStyle = "rgba(88,232,255,0.9)";
    ctx.font = `700 ${Math.round(h * 0.09)}px Arial Narrow, Arial`;
    ctx.textAlign = "center";
    ctx.fillText("WASH", w * 0.24, h * 0.16);
    ctx.filter = "none";
  }, 3.6, 2.6, -6.4, 1.72, -8.5, { tw: 320, th: 224, opacity: 0.95, boost: 1.12 });
  // The storefront answers on the street + a dim body of light in the void
  // (upper half rides above the parked bus, filling the dead left third).
  bandGlow(0xffc586, -6.4, 1.6, -8.3, 3.4, 0.16);
  const laundromatLight = new THREE.PointLight(0xffc586, 3.2, 7, 2);
  laundromatLight.position.set(-6.3, 1.9, -7.9);
  group.add(laundromatLight);
  groundStreak(0xffc586, -6.4, -6.9, 3.4, 1.8, 0.11);
  // SEPTA keystone sign gets its own dim downlight halo so it reads.
  bandGlow(0xcfe0ff, 5.7, 1.62, -6.2, 1.05, 0.22);

  // --- Centre focal element: lit SEPTA waiting shelter + two riders ---------
  // The wide shot's centre used to be an empty defocused smear; a practical
  // in the middle distance gives the frame a lit anchor and place identity.
  const shelter = new THREE.Group();
  shelter.position.set(-0.85, 0, -5.75);
  const shelterSteel = new THREE.MeshStandardMaterial({ color: 0x1a1f26, roughness: 0.6, metalness: 0.5 });
  for (const sx of [-1.05, 1.05]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.62, 0.09), shelterSteel);
    post.position.set(sx, 0.81, 0);
    shelter.add(post);
  }
  const shelterRoof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.09, 0.9), shelterSteel);
  shelterRoof.position.set(0, 1.66, 0);
  shelter.add(shelterRoof);
  // Interior lit ad panel: the shelter's fluorescent glow — bright enough to
  // read as the centre's light source and kiss the bloom threshold.
  const shelterPanelTexture = canvasTexture(96, 144, (ctx, w, h) => {
    // Backlit ad box: bright frame margin, DARK poster art filling the pane
    // (a night-blue skyline ad with a warm headline band) so the panel reads
    // as a lit advertisement, not a bare white pane.
    ctx.fillStyle = "#e9ddb9";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#141c30";
    ctx.fillRect(w * 0.09, h * 0.07, w * 0.82, h * 0.86);
    // Poster art: dusk gradient + skyline blocks.
    const sky = ctx.createLinearGradient(0, h * 0.07, 0, h * 0.6);
    sky.addColorStop(0, "#3a2c58");
    sky.addColorStop(1, "#182642");
    ctx.fillStyle = sky;
    ctx.fillRect(w * 0.09, h * 0.07, w * 0.82, h * 0.5);
    ctx.fillStyle = "#0b1020";
    for (let i = 0; i < 6; i += 1) {
      const bw = w * (0.07 + (i % 3) * 0.035);
      ctx.fillRect(w * 0.12 + i * w * 0.13, h * (0.28 + (i % 2) * 0.07), bw, h * 0.3);
    }
    // Warm headline band + text scribbles.
    ctx.fillStyle = "#e8a13c";
    ctx.fillRect(w * 0.09, h * 0.6, w * 0.82, h * 0.13);
    ctx.fillStyle = "#241a10";
    ctx.fillRect(w * 0.14, h * 0.645, w * 0.5, h * 0.035);
    ctx.fillStyle = "#f2ead6";
    ctx.fillRect(w * 0.14, h * 0.78, w * 0.62, h * 0.03);
    ctx.fillRect(w * 0.14, h * 0.84, w * 0.44, h * 0.03);
  }, { srgb: true });
  const shelterPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.98),
    new THREE.MeshBasicMaterial({
      map: shelterPanelTexture,
      color: new THREE.Color(1.02, 0.99, 0.92),
      fog: false,
    }),
  );
  shelterPanel.position.set(0.62, 0.86, -0.06);
  shelter.add(shelterPanel);
  const shelterLight = new THREE.PointLight(0xffe9c0, 4.5, 5, 2);
  shelterLight.position.set(0.4, 1.2, 0.5);
  shelter.add(shelterLight);
  // Bench silhouette under the roof.
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.34), shelterSteel);
  bench.position.set(-0.3, 0.48, 0);
  shelter.add(bench);
  for (const bx of [-0.9, 0.3]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.3), shelterSteel);
    leg.position.set(bx, 0.24, 0);
    shelter.add(leg);
  }
  // Two silhouetted riders waiting in the shelter's warm spill: the centre
  // frame gets PEOPLE at its focal light, SF6-crowd style.
  const riderSpecs = [
    { x: -0.28, scale: 1.5, flip: 1, style: { rim: "rgba(255,224,170,0.8)", rimSide: 1, jacket: "#20242c", top: "rgba(255,236,200,0.4)" } },
    { x: 0.34, scale: 1.42, flip: -1, style: { rim: "rgba(255,214,150,0.7)", rimSide: -1, jacket: "#241f1c", body: "#141118", top: "rgba(255,232,190,0.3)" } },
  ];
  for (const spec of riderSpecs) {
    const rider = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.scale * 0.5, spec.scale),
      new THREE.MeshBasicMaterial({
        map: pedestrianTexture(1, 0, spec.style),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        color: 0xa2a8b4,
      }),
    );
    rider.position.set(spec.x, spec.scale * 0.5, 0.22);
    rider.scale.x = spec.flip;
    rider.renderOrder = 1;
    shelter.add(rider);
    const riderContact = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.scale * 0.32, spec.scale * 0.09),
      new THREE.MeshBasicMaterial({
        map: bystanderShadowMap,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        color: 0x000000,
      }),
    );
    riderContact.rotation.x = -Math.PI / 2;
    riderContact.position.set(spec.x, 0.012, 0.28);
    riderContact.renderOrder = 1;
    shelter.add(riderContact);
  }
  group.add(shelter);
  flickers.push((t) => {
    const hum = 1 + Math.sin(t * 43 + 4.1) * 0.04 + (hash01(Math.floor(t * 8 + 5)) > 0.96 ? -0.4 : 0);
    shelterLight.intensity = 4.5 * Math.max(0.4, hum);
    shelterPanel.material.color.setRGB(1.02, 0.99, 0.92).multiplyScalar(Math.max(0.55, hum));
    // The lightbox's wet-street answer hums with its fluorescents.
    shelterStreak.material.opacity = 0.14 * Math.max(0.5, hum);
  });

  // --- Chain-link fence line: midground structure at the curb --------------
  const fenceMap = fenceTexture();
  fenceMap.repeat.set(6, 1);
  // NEAR-SHARP focus plane, now LIT: standard material with a metallic sheen
  // so the galvanised wire answers the practicals (green glints under the
  // station lamp, pink kiss near the K&A corner) instead of flat-tint strokes.
  const fence = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 1.55),
    new THREE.MeshStandardMaterial({
      map: fenceMap,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      color: 0x939eb6,
      // Calmer base sheen: the uniform metallic sparkle across the whole run
      // was half the wallpaper read — localized glints (fenceGlint near the
      // lamp) now carry the wire speculars instead.
      roughness: 0.48,
      metalness: 0.58,
      envMapIntensity: 0.6,
    }),
  );
  fence.name = "fb-fence";
  fence.position.set(0, 0.78, -5.05);
  fence.renderOrder = 1;
  group.add(fence);
  // Specular glint band on the wires nearest the green overhead lamp: an
  // additive copy of the mesh pattern, masked to a soft radial pool.
  const glintTexture = canvasTexture(512, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.4;
    const cell = 16;
    for (let x = -h; x < w + h; x += cell) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + h, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    // Radial mask: glints only where the lamp actually rakes the wire.
    ctx.globalCompositeOperation = "destination-in";
    const pool = ctx.createRadialGradient(w * 0.5, h * 0.3, 8, w * 0.5, h * 0.3, w * 0.52);
    pool.addColorStop(0, "rgba(255,255,255,0.95)");
    pool.addColorStop(0.55, "rgba(255,255,255,0.4)");
    pool.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }, { srgb: true });
  const fenceGlint = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 1.55),
    new THREE.MeshBasicMaterial({
      map: glintTexture,
      transparent: true,
      opacity: 0.5,
      color: new THREE.Color(0xbfffd9).multiplyScalar(1.25),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  fenceGlint.position.set(0.55, 0.8, -5.03);
  fenceGlint.renderOrder = 2;
  group.add(fenceGlint);
  flickers.push((t) => {
    // Glints breathe with the same fluorescent hum as the lamp above them.
    const hum = 1 + Math.sin(t * 41) * 0.05;
    fenceGlint.material.opacity = 0.5 * Math.max(0.5, hum);
  });
  // Tiling breaks: one NON-repeating overlay across the whole run — bent-link
  // scars, a bowed rail, taped posters — so the diamond lattice stops reading
  // as wallpaper in wide framings (composition fix).
  const fenceBreaks = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 1.55),
    new THREE.MeshStandardMaterial({
      map: fenceBreaksTexture(),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      color: 0x9aa4b8,
      roughness: 0.62,
      metalness: 0.35,
      envMapIntensity: 0.5,
    }),
  );
  fenceBreaks.name = "fb-fence-breaks";
  fenceBreaks.position.set(0, 0.78, -5.04);
  fenceBreaks.renderOrder = 1;
  group.add(fenceBreaks);

  // --- Animated silhouette pedestrians behind the fence --------------------
  // Two parallax crowds: a near line just behind the fence (sharp, dark) and
  // a far line across the street (defocused, dimmer, smaller) so the crowd
  // reads as layered depth instead of a single cutout card.
  // Near line: lit figures — sodium rim down the streetlight side, clothing
  // tones, cool head kiss (baked in the texture; material stays near-white so
  // the rim actually shows). Far line: dimmer, defocused, cooled.
  const pedMaterials = [pedestrianTexture(0), pedestrianTexture(1)].map((map) => new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    color: 0x9aa1b0,
  }));
  const farPedMaterials = [
    pedestrianTexture(0, 3, { rim: "rgba(255,160,74,0.5)", top: "rgba(190,255,222,0.3)" }),
    pedestrianTexture(1, 3, { rim: "rgba(255,160,74,0.5)", top: "rgba(190,255,222,0.3)" }),
  ].map((map) => new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    color: 0x5a6274,
  }));
  const pedRand = mulberry32(0x9ed5);
  const pedestrians = [];
  const spawnPed = (materials, zBase, zJitter, scaleBase) => {
    const scale = scaleBase + pedRand() * 0.26;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale * 0.5, scale), materials[0]);
    mesh.position.set(0, scale * 0.5, zBase - pedRand() * zJitter);
    mesh.renderOrder = 1;
    group.add(mesh);
    pedestrians.push({
      mesh,
      materials,
      scale,
      start: pedRand() * 19,
      speed: 0.22 + pedRand() * 0.24,
      dir: pedRand() > 0.5 ? 1 : -1,
      gait: 1.9 + pedRand() * 0.7,
    });
  };
  for (let i = 0; i < 3; i += 1) spawnPed(pedMaterials, -5.6, 0.4, 1.62);
  for (let i = 0; i < 3; i += 1) spawnPed(farPedMaterials, -7.8, 0.6, 1.5);
  updaters.push((t) => {
    for (const ped of pedestrians) {
      const travel = (ped.start + t * ped.speed) % 19;
      const x = -9.5 + travel;
      ped.mesh.position.x = ped.dir > 0 ? x : -x;
      ped.mesh.scale.x = ped.dir;
      const phase = Math.floor(t * ped.gait + ped.start) % 2;
      ped.mesh.material = ped.materials[phase];
      ped.mesh.position.y = ped.scale * 0.5 + Math.abs(Math.sin(t * ped.gait * Math.PI + ped.start)) * 0.016;
    }
  });

  // --- Booth bystanders: place identity at the SOMERSET entrance -----------
  // Two standing figures by the station mouth: one caught in the stairwell's
  // green-white spill, one nearer the K&A corner picking up a magenta rim.
  // Static (they're waiting, not walking), each grounded by a contact ellipse.
  const bystanderSpecs = [
    {
      x: 1.72, z: -4.62, scale: 1.66, flip: -1,
      style: { rim: "rgba(190,255,225,0.6)", rimSide: 1, jacket: "#1c242a", top: "rgba(200,255,230,0.4)" },
    },
    {
      x: 4.28, z: -4.5, scale: 1.58, flip: 1,
      style: { rim: "rgba(255,110,225,0.55)", rimSide: 1, jacket: "#241a24", body: "#151219", top: "rgba(255,170,235,0.25)" },
    },
  ];
  for (const spec of bystanderSpecs) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.scale * 0.5, spec.scale),
      new THREE.MeshBasicMaterial({
        map: pedestrianTexture(1, 0, spec.style),
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        color: 0x99a0ae,
      }),
    );
    mesh.position.set(spec.x, spec.scale * 0.5, spec.z);
    mesh.scale.x = spec.flip;
    mesh.renderOrder = 1;
    group.add(mesh);
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.scale * 0.34, spec.scale * 0.1),
      new THREE.MeshBasicMaterial({
        map: bystanderShadowMap,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        color: 0x000000,
      }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(spec.x, 0.012, spec.z + 0.06);
    contact.renderOrder = 1;
    group.add(contact);
  }

  // --- Steam drifting from the station grates through the lamp beams ------
  const steams = [
    { mesh: steamPlume(0xbfe8d4, 1.5, 2.6, 0.13, 3.1), x: 0.75, z: -3.85 },
    { mesh: steamPlume(0xc8d8e8, 1.4, 2.4, 0.11, 8.7), x: -3.4, z: -4.55 },
    // Third plume rising THROUGH the fence line mid-right: a moving vertical
    // break across the lattice (magenta-kissed toward the K&A corner), placed
    // clear of the corner so a cornered fighter never hides it.
    { mesh: steamPlume(0xe0c6e2, 1.4, 2.4, 0.11, 12.3), x: 1.7, z: -4.95 },
  ];
  for (const steam of steams) {
    steam.mesh.position.set(steam.x, steam.mesh.geometry.parameters.height * 0.5 + 0.05, steam.z);
    group.add(steam.mesh);
  }
  updaters.push((t) => {
    for (const steam of steams) steam.mesh.material.uniforms.uTime.value = t;
  });

  // --- Passing car: headlight sweep across the wet asphalt -----------------
  const car = new THREE.Group();
  const carMaterial = new THREE.MeshBasicMaterial({ color: 0x0b0e14 });
  const carBody = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.36, 0.85), carMaterial);
  carBody.position.y = 0.5;
  car.add(carBody);
  const carCabin = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.3, 0.8), carMaterial);
  carCabin.position.set(-0.15, 0.82, 0);
  car.add(carCabin);
  // Wheels ground the silhouette so it reads "car", not "floating box".
  for (const wx of [-0.82, 0.85]) {
    const wheel = new THREE.Mesh(new THREE.CircleGeometry(0.21, 12), carMaterial);
    wheel.position.set(wx, 0.21, 0.44);
    car.add(wheel);
  }
  const headlightMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffe9c4).multiplyScalar(3.4),
    fog: false,
  });
  const lampL = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), headlightMaterial);
  lampL.position.set(1.26, 0.44, 0.28);
  lampL.rotation.y = Math.PI / 2;
  car.add(lampL);
  const lampR = lampL.clone();
  lampR.position.z = -0.28;
  car.add(lampR);
  const tail = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.08),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3524).multiplyScalar(2.4), fog: false }),
  );
  tail.position.set(-1.26, 0.46, 0.28);
  tail.rotation.y = -Math.PI / 2;
  car.add(tail);
  const carLight = new THREE.PointLight(0xffd9a8, 0, 9, 2);
  carLight.position.set(0.9, 0.55, 0.4);
  car.add(carLight);
  const carStreak = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 1.1),
    new THREE.MeshBasicMaterial({
      map: streakTexture(),
      color: 0xffd9a8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  carStreak.rotation.x = -Math.PI / 2;
  carStreak.position.set(0.6, 0.02, 0.7);
  car.add(carStreak);
  car.visible = false;
  car.position.z = -6.35;
  group.add(car);
  const CAR_PERIOD = 12;
  const CAR_ACTIVE = 3.1;
  updaters.push((t) => {
    const cycle = Math.floor(t / CAR_PERIOD);
    const local = t - cycle * CAR_PERIOD;
    if (local > CAR_ACTIVE) {
      car.visible = false;
      carLight.intensity = 0;
      return;
    }
    const dir = hash01(cycle * 13 + 5) > 0.5 ? 1 : -1;
    const p = local / CAR_ACTIVE;
    car.visible = true;
    car.position.x = THREE.MathUtils.lerp(-13.5, 13.5, p) * dir;
    car.scale.x = dir;
    const swell = Math.sin(p * Math.PI);
    carLight.intensity = 12 * swell;
    carStreak.material.opacity = 0.5 * swell;
  });

  // --- Passing SEPTA trolley on the far cross-street (composition fix 4) ---
  // The wide framing's centre band was a dead blur wall; it now gets a moving
  // subject: a two-car SEPTA trolley sliding across the far street behind the
  // fence every 9s — dark body, a strip of lit windows with passenger
  // silhouettes, marker lights and a fluorescent glow the wet street answers.
  // (The el deck itself sits above the HUD line in fight framing, so the
  // street level is where a passing train can actually be SEEN.)
  // Deterministic in t so screenshots freeze cleanly.
  const train = new THREE.Group();
  const trainBodyMaterial = new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.5, metalness: 0.6 });
  const trainBody = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.92, 0.9), trainBodyMaterial);
  trainBody.position.y = 0.46;
  train.add(trainBody);
  const trainRoof = new THREE.Mesh(new THREE.BoxGeometry(9.7, 0.1, 0.8), new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.7, metalness: 0.4 }));
  trainRoof.position.y = 0.95;
  train.add(trainRoof);
  // Lit window band with passenger silhouettes + door gaps.
  const trainWindowTexture = canvasTexture(768, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const rand = mulberry32(0x5e97a);
    const carW = w / 2; // two cars per span
    for (let car = 0; car < 2; car += 1) {
      const x0 = car * carW;
      // Window run: warm-white fluorescent panes, broken by door posts.
      for (let i = 0; i < 8; i += 1) {
        const wx = x0 + carW * (0.06 + i * 0.115);
        const ww = carW * 0.09;
        ctx.fillStyle = "#f6eecb";
        ctx.fillRect(wx, h * 0.22, ww, h * 0.56);
        // Passenger silhouettes: head+shoulder lumps in some panes.
        if (rand() > 0.4) {
          ctx.fillStyle = "#2a2620";
          const px = wx + ww * (0.2 + rand() * 0.5);
          ctx.beginPath();
          ctx.arc(px, h * 0.52, h * 0.11, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(px - h * 0.14, h * 0.58, h * 0.28, h * 0.2);
        }
      }
    }
  }, { srgb: true });
  const trainWindows = new THREE.Mesh(
    new THREE.PlaneGeometry(9.4, 0.5),
    new THREE.MeshBasicMaterial({
      map: trainWindowTexture,
      transparent: true,
      // 1.22 (was 1.6): the old level crossed the bloom knee and the window
      // run blew out into six formless white blobs mid-frame (the critic's
      // dead-centre read). Under the knee the panes stay warm fluorescent
      // and the passenger silhouettes survive ACES.
      color: new THREE.Color(1.22, 1.14, 0.95),
      fog: false,
    }),
  );
  trainWindows.position.set(0, 0.52, 0.46);
  train.add(trainWindows);
  // End marker lights.
  const markerF = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff3d0).multiplyScalar(2.6), fog: false }),
  );
  markerF.position.set(4.85, 0.52, 0.2);
  markerF.rotation.y = Math.PI / 2;
  train.add(markerF);
  const markerR = new THREE.Mesh(
    new THREE.PlaneGeometry(0.09, 0.09),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4030).multiplyScalar(2.2), fog: false }),
  );
  markerR.position.set(-4.85, 0.52, 0.2);
  markerR.rotation.y = -Math.PI / 2;
  train.add(markerR);
  // Rumble glow: the trolley's fluorescent interior spills onto the street.
  const trainLight = new THREE.PointLight(0xfff0c8, 0, 8, 2);
  trainLight.position.set(0, 0.6, 0.9);
  train.add(trainLight);
  // Wet-street answer sliding with the trolley: every emissive reflects.
  const trainStreak = new THREE.Mesh(
    new THREE.PlaneGeometry(7.5, 1.3),
    new THREE.MeshBasicMaterial({
      map: streakTexture(),
      color: 0xfff0c8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  trainStreak.rotation.x = -Math.PI / 2;
  trainStreak.position.set(0, 0.015, 1.05);
  train.add(trainStreak);
  train.position.set(0, 0, -7.55);
  train.visible = false;
  group.add(train);
  const TRAIN_PERIOD = 9;
  const TRAIN_ACTIVE = 3.4;
  updaters.push((t) => {
    const cycle = Math.floor(t / TRAIN_PERIOD);
    const local = t - cycle * TRAIN_PERIOD;
    if (local > TRAIN_ACTIVE) {
      train.visible = false;
      trainLight.intensity = 0;
      return;
    }
    const dir = hash01(cycle * 7 + 2) > 0.5 ? 1 : -1;
    const p = local / TRAIN_ACTIVE;
    train.visible = true;
    train.position.x = THREE.MathUtils.lerp(-15, 15, p) * dir;
    train.scale.x = dir;
    const swell = Math.sin(p * Math.PI);
    trainLight.intensity = 6.5 * swell;
    trainStreak.material.opacity = 0.24 * swell;
  });

  // --- El-train overpass: real lit geometry casting real shadows -----------
  const steel = new THREE.MeshStandardMaterial({ color: 0x1b241f, roughness: 0.72, metalness: 0.3 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x37312a, roughness: 0.8, metalness: 0.25 });
  const el = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(30, 0.55, 3.6), steel);
  deck.position.set(0, 3.55, -4.2);
  // The deck does NOT cast the key shadow: its 30-unit slab printed a huge
  // hard-edged rectangle over the midground that read as a glass box. The
  // girders/columns still cast, which keeps the overpass grounded.
  el.add(deck);
  for (let i = 0; i < 3; i += 1) {
    const girder = new THREE.Mesh(new THREE.BoxGeometry(30, 0.34, 0.22), rust);
    girder.position.set(0, 3.2, -2.95 - i * 1.25);
    girder.castShadow = true;
    el.add(girder);
  }
  // Riveted column steel (coherence fix i): the columns flank the fight line
  // as tall near-background slabs — plate seams, rivet lines, rust bleed and
  // chipped green SEPTA paint give them the legible mid-frequency detail the
  // crisp sprites need behind them (they read as airbrushed voids before).
  const columnTexture = canvasTexture(128, 512, (ctx, w, h) => {
    const rand = mulberry32(0xc0157);
    ctx.fillStyle = "#37322b";
    ctx.fillRect(0, 0, w, h);
    // Chipped remains of the old green paint in patches.
    for (let i = 0; i < 12; i += 1) {
      const py = rand() * h;
      const ph = 14 + rand() * 60;
      ctx.fillStyle = `rgba(38,${52 + Math.round(rand() * 16)},44,${(0.18 + rand() * 0.3).toFixed(3)})`;
      ctx.fillRect(0, py, w, ph);
    }
    // Horizontal plate seams every ~90px with a bolt/rivet row on each.
    for (let y = 46; y < h; y += 88) {
      ctx.fillStyle = "rgba(12,11,9,0.85)";
      ctx.fillRect(0, y, w, 3);
      ctx.fillStyle = "rgba(96,90,78,0.5)";
      ctx.fillRect(0, y + 3, w, 1.4);
      for (let x = 10; x < w; x += 18) {
        ctx.fillStyle = "rgba(20,18,15,0.9)";
        ctx.beginPath();
        ctx.arc(x, y + 11, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(120,112,96,0.55)";
        ctx.beginPath();
        ctx.arc(x - 0.7, y + 10.3, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Vertical edge stiffeners.
    ctx.fillStyle = "rgba(14,13,11,0.6)";
    ctx.fillRect(3, 0, 3, h);
    ctx.fillRect(w - 6, 0, 3, h);
    // Rust bleed streaks running down from seams.
    for (let i = 0; i < 9; i += 1) {
      const rx = rand() * w;
      const ry = 46 + Math.floor(rand() * 5) * 88;
      const rl = 30 + rand() * 90;
      const drip = ctx.createLinearGradient(0, ry, 0, ry + rl);
      drip.addColorStop(0, "rgba(96,54,26,0.5)");
      drip.addColorStop(1, "rgba(96,54,26,0)");
      ctx.fillStyle = drip;
      ctx.fillRect(rx, ry, 3 + rand() * 5, rl);
    }
  }, { srgb: true });
  const columnSteel = new THREE.MeshStandardMaterial({
    map: columnTexture,
    color: 0xbdb9b2,
    roughness: 0.72,
    metalness: 0.35,
  });
  const columnXs = [-8.6, -3.4, 3.4, 8.6];
  for (const x of columnXs) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.3, 0.5), columnSteel);
    column.position.set(x, 1.65, -4.2);
    column.castShadow = true;
    column.receiveShadow = true;
    el.add(column);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), steel);
    foot.position.set(x, 0.15, -4.2);
    foot.castShadow = true;
    el.add(foot);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 2.6), rust);
    cross.position.set(x, 3.05, -4.2);
    el.add(cross);
  }
  group.add(el);

  // --- Practical lights -----------------------------------------------------

  // Sodium streetlights: poles now BEHIND the fighter plane so their shafts
  // depth-test behind the characters, with soft-edged noise-filled cones.
  const streetlight = (x) => {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 3.6, 10),
      new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.7, metalness: 0.5 }),
    );
    pole.position.set(x, 1.8, -1.55);
    pole.castShadow = true;
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.07), pole.material);
    arm.position.set(x - Math.sign(x) * 0.42, 3.55, -1.55);
    group.add(arm);
    const headX = x - Math.sign(x) * 0.85;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.12, 0.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(SODIUM).multiplyScalar(3.4), fog: false }),
    );
    head.position.set(headX, 3.5, -1.55);
    group.add(head);
    // Tighter cone: sodium POOLS with dark asphalt between them, instead of
    // one continuous warm wash across the whole fight line.
    const light = new THREE.SpotLight(SODIUM, 30, 0, 0.62, 0.6, 1.9);
    light.position.set(headX, 3.46, -1.55);
    // Target on the fight plane: the sodium pool lands ON the sole line the
    // fighters stand on instead of floating slightly behind their feet.
    light.target.position.set(headX + Math.sign(x) * 0.2, 0, -0.3);
    light.castShadow = true;
    light.shadow.mapSize.set(shadowSize, shadowSize);
    light.shadow.bias = -0.0004;
    light.shadow.camera.near = 0.4;
    light.shadow.camera.far = 9;
    // Half-strength shadow print: each sodium head throwing a SECOND full
    // fighter silhouette stacked into the key light's one is what merged the
    // grounding into an amorphous blob (critic fix 3) — the pole/prop shadows
    // stay, the duplicate fighter shadow becomes a faint secondary.
    light.shadow.intensity = 0.45;
    group.add(light);
    group.add(light.target);
    const shaft = volumeShaft(SODIUM, 0.14, 0.8, 3.4, 0.12);
    shaft.position.set(headX, 1.8, -1.55);
    group.add(shaft);
    flickers.push((t) => {
      const wobble = 1 + Math.sin(t * 2.1 + x) * 0.035 + Math.sin(t * 13.7 + x * 3.1) * 0.02;
      light.intensity = 32 * wobble;
      shaft.material.uniforms.uTime.value = t;
      shaft.material.uniforms.uFlicker.value = wobble;
    });
    return light;
  };
  const sodiumSpots = [streetlight(-2.7), streetlight(2.7)];

  // Traffic signal on the corner, cycling red/green deterministically.
  const signalPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.06, 2.9, 8),
    new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.7, metalness: 0.4 }),
  );
  signalPole.position.set(-4.05, 1.45, -1.6);
  group.add(signalPole);
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.72, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6 }),
  );
  housing.position.set(-4.05, 2.72, -1.6);
  group.add(housing);
  const lensRed = new THREE.Mesh(
    new THREE.CircleGeometry(0.085, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2b1e).multiplyScalar(3), fog: false }),
  );
  lensRed.position.set(-4.05, 2.9, -1.47);
  group.add(lensRed);
  const lensGreen = lensRed.clone();
  lensGreen.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2bff7a).multiplyScalar(3), fog: false });
  lensGreen.position.y = 2.54;
  group.add(lensGreen);
  const signalLight = new THREE.PointLight(0xff2b1e, 9, 7, 2);
  signalLight.position.set(-3.95, 2.7, -1.3);
  group.add(signalLight);
  flickers.push((t) => {
    const phase = Math.floor(t / 8) % 2 === 0;
    lensRed.material.color.set(0xff2b1e).multiplyScalar(phase ? 3.2 : 0.25);
    lensGreen.material.color.set(0x2bff7a).multiplyScalar(phase ? 0.2 : 2.3);
    signalLight.color.set(phase ? 0xff2b1e : 0x2bff7a);
    // The wet-street smear swaps colour with the live lens.
    signalStreak.material.color.set(phase ? 0xff2b1e : 0x2bff7a);
  });

  // Buzzing corner-store neon (magenta) + its point light.
  const neonTexture = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = "700 74px Arial Narrow, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#ff4fd8";
    ctx.shadowBlur = 26;
    ctx.strokeStyle = "#ff9dea";
    ctx.lineWidth = 3;
    ctx.fillStyle = "#ffd7f4";
    ctx.strokeText("K&A DELI", w / 2, h / 2 + 4);
    ctx.fillText("K&A DELI", w / 2, h / 2 + 4);
  }, { srgb: true });
  // Tube brightness stays under the ACES clip so the letterforms hold their
  // pink instead of blowing to white; the glow around them comes from a
  // dedicated magenta halo sprite (colored bloom, not clipped white-pink).
  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 0.62),
    new THREE.MeshBasicMaterial({
      map: neonTexture,
      transparent: true,
      color: new THREE.Color(1.7, 1.7, 1.7),
      fog: false,
      depthWrite: false,
    }),
  );
  neon.position.set(4.9, 2.35, -3.2);
  neon.rotation.y = -0.28;
  group.add(neon);
  const neonHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(3.7, 1.6),
    new THREE.MeshBasicMaterial({
      map: softDotTexture(96),
      color: new THREE.Color(NEON_MAGENTA).multiplyScalar(0.8),
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  neonHalo.position.set(4.88, 2.35, -3.24);
  neonHalo.rotation.y = -0.28;
  neonHalo.renderOrder = 2;
  group.add(neonHalo);
  const neonLight = new THREE.PointLight(NEON_MAGENTA, 12, 7, 2);
  neonLight.position.set(4.7, 2.2, -2.7);
  group.add(neonLight);
  // Mirrored letterforms in the wet street: the sign itself, flipped, laid
  // flat, stretched toward the camera and defocused — the pink ground streak
  // reads as a REFLECTION (ghost letters at its head) instead of a dye pool.
  const neonMirrorTexture = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(0, h);
    ctx.scale(1, -1);
    ctx.filter = "blur(3px)";
    ctx.font = "700 74px Arial Narrow, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#ff4fd8";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#ffb9ec";
    ctx.fillText("K&A DELI", w / 2, h / 2 + 4);
    ctx.restore();
    ctx.filter = "none";
    // Ripple interruptions: broken water, not painted glass.
    ctx.globalCompositeOperation = "destination-out";
    for (let y = 6; y < h; y += 9) {
      ctx.fillStyle = `rgba(0,0,0,${(0.2 + ((y * 13) % 11) / 11 * 0.35).toFixed(3)})`;
      ctx.fillRect(0, y, w, 2 + (y % 4));
    }
    ctx.globalCompositeOperation = "source-over";
  }, { srgb: true });
  const neonMirror = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.7),
    new THREE.MeshBasicMaterial({
      map: neonMirrorTexture,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  neonMirror.rotation.x = -Math.PI / 2;
  // Flat on the asphalt under the sign, letters smearing toward camera.
  neonMirror.position.set(4.82, 0.012, -2.15);
  neonMirror.renderOrder = 2;
  group.add(neonMirror);
  flickers.push((t) => {
    const step = Math.floor(t * 14);
    const buzz = hash01(step) > 0.13 ? 1 : 0.28; // occasional dropout
    const level = buzz * (0.9 + hash01(step * 7 + 3) * 0.2);
    neon.material.color.setScalar(1.7 * level);
    neonHalo.material.opacity = 0.42 * level;
    neonLight.intensity = 12 * level;
    // The wet-street smear + mirrored letters breathe with the tube.
    neonStreak.material.opacity = 0.55 * (0.55 + 0.45 * level);
    neonMirror.material.opacity = 0.5 * (0.45 + 0.55 * level);
  });

  // Cool fluorescent under the el deck (greenish, slight hum wobble).
  const underEl = new THREE.PointLight(0xbfffe2, 6, 7, 2);
  underEl.position.set(0.4, 3, -4);
  group.add(underEl);
  // Fluorescent tube CLAMPED into a fixture: short, hooded and dimmer. The
  // old 1.5-unit bare bar read as a floating horizontal glare artefact.
  const tube = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.05, 0.09),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd6ffe9).multiplyScalar(0.95), fog: false }),
  );
  tube.position.set(0.4, 3.22, -4);
  group.add(tube);
  const tubeHood = new THREE.Mesh(
    new THREE.BoxGeometry(0.94, 0.09, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x11151a, roughness: 0.6, metalness: 0.4 }),
  );
  tubeHood.position.set(0.4, 3.29, -4);
  group.add(tubeHood);
  for (const hx of [-0.36, 0.36]) {
    const clamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.1, 0.12),
      tubeHood.material,
    );
    clamp.position.set(0.4 + hx, 3.24, -4);
    group.add(clamp);
  }
  const underShaft = volumeShaft(0xbfffe2, 0.22, 0.7, 2.6, 0.05);
  underShaft.position.set(0.4, 1.7, -4);
  group.add(underShaft);
  flickers.push((t) => {
    const hum = 1 + Math.sin(t * 41) * 0.05 + (hash01(Math.floor(t * 9)) > 0.94 ? -0.5 : 0);
    underEl.intensity = 6 * hum;
    tube.material.color.set(0xd6ffe9).multiplyScalar(0.95 * Math.max(0.3, hum));
    underShaft.material.uniforms.uTime.value = t;
    underShaft.material.uniforms.uFlicker.value = Math.max(0.3, hum);
    // Green-white ground smears hum with the fluorescent they reflect.
    lampStreak.material.opacity = 0.26 * Math.max(0.35, hum);
    lampStreak2.material.opacity = 0.18 * Math.max(0.35, hum);
  });

  // Warm apartment-window glow spilling from the mid card.
  const windowLight = new THREE.PointLight(0xffc06a, 7, 9, 2);
  windowLight.position.set(-6.1, 3.3, -6.6);
  group.add(windowLight);

  // Cyan check-cashing sign glow on the far right (rim source).
  const cyanLight = new THREE.PointLight(NEON_CYAN, 13, 9, 2);
  cyanLight.position.set(6.2, 1.9, -1.2);
  group.add(cyanLight);
  const cyanSign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 1.6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON_CYAN).multiplyScalar(2.2), fog: false }),
  );
  cyanSign.position.set(5.5, 2.1, -2.7);
  cyanSign.rotation.y = -0.7;
  group.add(cyanSign);

  // Sodium rim from the left front so silhouettes always separate.
  const sodiumRim = new THREE.PointLight(SODIUM, 13, 10, 2);
  sodiumRim.position.set(-6.4, 1.7, 1.4);
  group.add(sodiumRim);

  // --- Foreground frame silhouettes (nearest parallax plane) ---------------
  // Dark utility pole + span wire top-left, hydrant bottom-right: they slide
  // against the scene when the camera trucks, so a pan reads four distinct
  // depth planes instead of a flat card.
  const foreMaterial = new THREE.MeshStandardMaterial({ color: 0x0a0c11, roughness: 0.6, metalness: 0.2 });
  const forePole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.6, 8), foreMaterial);
  forePole.position.set(-2.0, 1.1, 2.45);
  group.add(forePole);
  const foreBox = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.34, 0.16), foreMaterial);
  foreBox.position.set(-1.93, 1.58, 2.45);
  group.add(foreBox);
  // Sagging span wires cutting the top of frame (silhouetted against the
  // lit plate, they sell the nearest depth plane during camera trucks).
  const wirePoints = [];
  for (let i = 0; i <= 16; i += 1) {
    const p = i / 16;
    wirePoints.push(new THREE.Vector3(
      THREE.MathUtils.lerp(-2.0, 2.7, p),
      2.5 - Math.sin(p * Math.PI) * 0.48,
      2.45,
    ));
  }
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wirePoints), 24, 0.014, 5, false),
    foreMaterial,
  );
  group.add(wire);
  const wire2 = wire.clone();
  wire2.position.y = 0.17;
  wire2.position.z = 0.12;
  group.add(wire2);
  const hydrant = new THREE.Group();
  const hydrantBody = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.42, 10), foreMaterial);
  hydrantBody.position.y = 0.21;
  hydrant.add(hydrantBody);
  const hydrantCap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), foreMaterial);
  hydrantCap.position.y = 0.44;
  hydrant.add(hydrantCap);
  const hydrantNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 8), foreMaterial);
  hydrantNozzle.rotation.z = Math.PI / 2;
  hydrantNozzle.position.y = 0.27;
  hydrant.add(hydrantNozzle);
  hydrant.position.set(2.0, 0, 2.62);
  group.add(hydrant);

  // --- Overhead el steel entering the TOP OF FRAME --------------------------
  // The Market–Frankford structure continues over the camera: a deck edge +
  // hanging slat girders just above the fight line, so (a) dark steel cuts
  // into the top of the frame and (b) the key light prints slatted gobo
  // shadows across the fight-line asphalt — the signature "under the el" read.
  const overhead = new THREE.Group();
  const overheadDeck = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 2.6), steel);
  overheadDeck.position.set(0, 3.92, 1.9);
  overhead.add(overheadDeck);
  for (let i = 0; i < 7; i += 1) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 2.8), rust);
    slat.position.set(-9 + i * 3, 3.55, 1.9);
    slat.castShadow = true;
    overhead.add(slat);
  }
  // Long rail lips under the deck: two thin continuous bars whose shadows
  // draw the long parallel streaks between the slat stripes.
  for (const z of [1.0, 2.7]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(26, 0.16, 0.18), rust);
    lip.position.set(0, 3.52, z);
    lip.castShadow = true;
    overhead.add(lip);
  }
  group.add(overhead);

  // --- SEPTA station entrance: green-white spill up the steps ---------------
  // Mid-ground stairwell down into Somerset station: dark masonry mouth, a
  // fluorescent glow rising out of it, light spilling up the steps and onto
  // the asphalt in front — the stage's place-identity light source.
  const station = new THREE.Group();
  // 2.55 (was 2.9): keeps the full SOMERSET plate inside even the punched-in
  // framings — at 2.9 the plate's right end kissed the frame edge and the
  // sign read as cut off mid-word.
  station.position.set(2.55, 0, -4.75);
  const masonry = new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.85, metalness: 0.05 });
  // Side cheek walls of the stair mouth.
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 1.5), masonry);
    cheek.position.set(side * 1.02, 0.39, 0);
    cheek.castShadow = true;
    station.add(cheek);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.14, 1.5), masonry);
  lintel.position.set(0, 0.82, 0);
  station.add(lintel);
  // Glowing stair throat: gradient plane leaning down into the ground.
  const throatTexture = canvasTexture(64, 128, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, "rgba(214,255,233,0.95)");
    gradient.addColorStop(0.45, "rgba(190,244,215,0.55)");
    gradient.addColorStop(1, "rgba(140,205,178,0.06)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: true });
  const throat = new THREE.Mesh(
    new THREE.PlaneGeometry(1.86, 1.1),
    new THREE.MeshBasicMaterial({
      map: throatTexture,
      transparent: true,
      opacity: 0.8,
      color: new THREE.Color(1.05, 1.2, 1.1),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  throat.position.set(0, 0.34, 0.16);
  throat.rotation.x = -0.52;
  station.add(throat);
  // Fluorescent spill: up-glow halo + a real light so the steps, fence and
  // nearby asphalt pick up the green-white.
  const stationGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 1.4),
    new THREE.MeshBasicMaterial({
      map: softDotTexture(96),
      color: new THREE.Color(0xbfffe0).multiplyScalar(0.55),
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  stationGlow.position.set(0, 0.7, 0.3);
  stationGlow.renderOrder = 2;
  station.add(stationGlow);
  const stationLight = new THREE.PointLight(0xcaffe4, 3.2, 4.5, 2);
  stationLight.position.set(0, 1.05, 0.4);
  station.add(stationLight);
  // "SOMERSET" plate over the mouth — STAGE GEOMETRY, not a UI overlay
  // (critic fix 8): weathered enamel with rust drips from the mount bolts,
  // chipped edge wear, the stairwell's green spill grazing it from below-left,
  // a soft 0.6px defocus matching its depth plane, and the whole plate skewed
  // to the fence line's perspective instead of squarely facing the lens.
  // 0.9px bake blur: the letterforms sit at the same focus level as the
  // fence/station plane instead of HUD-crisp over the painterly midground.
  const plateTexture = bluredCardTexture(512, 96, 0.9, (ctx, w, h) => {
    const rand = mulberry32(0x50e57);
    ctx.fillStyle = "#101418";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(190,210,200,0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.font = "700 52px Arial Narrow, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#bdd6c9";
    ctx.fillText("SOMERSET", w / 2, h / 2 + 2);
    // Mount bolts + rust drips running off them down the enamel.
    for (const bx of [w * 0.045, w * 0.955]) {
      ctx.fillStyle = "#6a6f74";
      ctx.beginPath();
      ctx.arc(bx, h * 0.2, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(20,22,25,0.8)";
      ctx.beginPath();
      ctx.arc(bx + 1.4, h * 0.2 + 1.4, 3, 0, Math.PI * 2);
      ctx.fill();
      const drip = ctx.createLinearGradient(0, h * 0.24, 0, h * 0.95);
      drip.addColorStop(0, "rgba(112,64,30,0.5)");
      drip.addColorStop(1, "rgba(80,44,20,0)");
      ctx.fillStyle = drip;
      ctx.fillRect(bx - 3, h * 0.24, 6 + rand() * 4, h * 0.7);
    }
    // Grime scuffs: soft dark blotches breaking the enamel's uniform face.
    for (let i = 0; i < 9; i += 1) {
      const gx = rand() * w;
      const gy = rand() * h;
      const gr = 8 + rand() * 26;
      const blot = ctx.createRadialGradient(gx, gy, 1, gx, gy, gr);
      blot.addColorStop(0, `rgba(8,10,12,${(0.12 + rand() * 0.16).toFixed(3)})`);
      blot.addColorStop(1, "rgba(8,10,12,0)");
      ctx.fillStyle = blot;
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    // Edge wear: chipped bright nicks along the border where paint flaked.
    ctx.fillStyle = "rgba(168,182,178,0.6)";
    for (let i = 0; i < 14; i += 1) {
      const along = rand();
      if (rand() > 0.5) ctx.fillRect(along * w, rand() > 0.5 ? 3 : h - 6, 3 + rand() * 7, 2.4);
      else ctx.fillRect(rand() > 0.5 ? 3 : w - 6, along * h, 2.4, 3 + rand() * 6);
    }
    // Fluorescent spill from the stair throat: bright pool low-left, decaying
    // across the face (screen-blended so the letterforms brighten with it).
    ctx.globalCompositeOperation = "screen";
    const spill = ctx.createRadialGradient(w * 0.3, h * 1.25, 8, w * 0.3, h * 1.25, w * 0.62);
    spill.addColorStop(0, "rgba(150,220,185,0.55)");
    spill.addColorStop(0.55, "rgba(96,150,126,0.24)");
    spill.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = spill;
    ctx.fillRect(0, 0, w, h);
    // Thin enamel sheen along the top edge.
    const sheen = ctx.createLinearGradient(0, 0, 0, h * 0.4);
    sheen.addColorStop(0, "rgba(200,224,235,0.22)");
    sheen.addColorStop(1, "rgba(200,224,235,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h * 0.4);
    ctx.globalCompositeOperation = "multiply";
    // Emissive falloff: the far-right corner dims but stays LEGIBLE.
    const fall = ctx.createLinearGradient(w * 0.62, 0, w, 0);
    fall.addColorStop(0, "#ffffff");
    fall.addColorStop(1, "#a7b6b0");
    ctx.fillStyle = fall;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }, { srgb: true });
  // Plate rig: the sign + its mounts + its glow kiss turn TOGETHER, so the
  // whole assembly reads as one piece of street furniture bolted to the
  // station mouth. The strong y-turn is the fix for the "floating HTML
  // overlay" read: at -0.42 rad the right edge visibly recedes and the
  // enamel face foreshortens like everything else at its depth.
  const plateRig = new THREE.Group();
  plateRig.position.set(0, 1.02, 0.76);
  plateRig.rotation.y = -0.42;
  plateRig.rotation.x = -0.04;
  plateRig.rotation.z = 0.018; // a hair of sag: bolted years ago, not typeset
  // LIT enamel, not an unlit card: the standard material answers the green
  // station spill and the neon corner like the masonry around it, while a
  // modest emissive (the plate texture itself) keeps SOMERSET legible at
  // night — a lightbox sign, graded by the scene.
  const plateMaterial = new THREE.MeshStandardMaterial({
    map: plateTexture,
    emissiveMap: plateTexture,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.34,
    roughness: 0.42,
    metalness: 0.22,
    envMapIntensity: 0.7,
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), plateMaterial);
  plateRig.add(plate);
  // Mounting stubs down to the lintel: the plate is BOLTED to the masonry.
  const stubMaterial = new THREE.MeshStandardMaterial({ color: 0x171b20, roughness: 0.7, metalness: 0.45 });
  for (const sx of [-0.56, 0.56]) {
    const stub = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), stubMaterial);
    stub.position.set(sx, -0.17, -0.03);
    plateRig.add(stub);
  }
  // Soft green kiss floating just off the plate face: the spill catches the
  // air in front of the sign the way it does over the stair mouth.
  const plateKiss = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.5),
    new THREE.MeshBasicMaterial({
      map: softDotTexture(96),
      color: new THREE.Color(0xbfffe0).multiplyScalar(0.62),
      transparent: true,
      opacity: 0.3, // lifted: the plate visibly picks up the green lamp bloom
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  plateKiss.position.set(-0.24, -0.05, 0.05);
  plateKiss.renderOrder = 2;
  plateRig.add(plateKiss);
  station.add(plateRig);
  group.add(station);
  flickers.push((t) => {
    // Fluorescent hum: the station spill breathes slightly out of phase with
    // the under-el tube; the enamel plate's lightbox glow hums WITH it, so
    // the sign is wired to the same ballast as the stairwell below it.
    const hum = 1 + Math.sin(t * 37 + 1.7) * 0.04 + (hash01(Math.floor(t * 7 + 3)) > 0.95 ? -0.35 : 0);
    stationLight.intensity = 3.2 * Math.max(0.4, hum);
    stationGlow.material.opacity = 0.26 * Math.max(0.5, hum);
    plateMaterial.emissiveIntensity = 0.34 * Math.max(0.55, hum);
    plateKiss.material.opacity = 0.3 * Math.max(0.5, hum);
  });

  // --- Street dressing at staggered depths ----------------------------------
  // Parked car at the far-left curb: dark silhouette, practical edges only.
  const parked = new THREE.Group();
  const parkedMaterial = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.45, metalness: 0.6 });
  const parkedBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 0.9), parkedMaterial);
  parkedBody.position.y = 0.52;
  parked.add(parkedBody);
  const parkedCabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.32, 0.84), parkedMaterial);
  parkedCabin.position.set(-0.2, 0.86, 0);
  parked.add(parkedCabin);
  for (const wx of [-0.85, 0.88]) {
    const wheel = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: 0x05070a }));
    wheel.position.set(wx, 0.22, 0.46);
    parked.add(wheel);
  }
  // Dim cabin glass catching the streetlight.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3a4a66).multiplyScalar(1.4), fog: false }),
  );
  glass.position.set(-0.2, 0.88, 0.44);
  parked.add(glass);
  parked.position.set(-7.6, 0, -5.6);
  parked.rotation.y = 0.06;
  parked.castShadow = true;
  group.add(parked);

  // Trash bags piled against the curb: lumpy dark mounds with a sodium kiss.
  const bagMaterial = new THREE.MeshStandardMaterial({ color: 0x171a20, roughness: 0.35, metalness: 0.15 });
  const bagRand = mulberry32(0xba95);
  for (let i = 0; i < 5; i += 1) {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.26 + bagRand() * 0.16, 10, 8), bagMaterial);
    bag.scale.y = 0.62 + bagRand() * 0.2;
    bag.position.set(-4.4 - bagRand() * 1.7, 0.18 + bagRand() * 0.05, -4.55 - bagRand() * 0.35);
    bag.castShadow = true;
    group.add(bag);
  }

  // Leaning signage cards at staggered depth catching practical edges.
  const bodegaSignTexture = canvasTexture(160, 320, (ctx, w, h) => {
    ctx.fillStyle = "#151216";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,170,90,0.75)";
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.font = "700 44px Arial Narrow, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffcf8a";
    ctx.save();
    ctx.translate(w / 2, h / 2);
    const word = "GROCERY";
    for (let i = 0; i < word.length; i += 1) ctx.fillText(word[i], 0, -h * 0.36 + i * 40);
    ctx.restore();
  }, { srgb: true });
  const bodegaSign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 1.24),
    new THREE.MeshBasicMaterial({ map: bodegaSignTexture, color: new THREE.Color(1.25, 1.2, 1.1), fog: false }),
  );
  bodegaSign.position.set(-6.9, 1.6, -3.4);
  bodegaSign.rotation.y = 0.42;
  group.add(bodegaSign);
  const bodegaGlow = new THREE.PointLight(0xffb46a, 4, 4.5, 2);
  bodegaGlow.position.set(-6.7, 1.5, -3);
  group.add(bodegaGlow);

  // --- Key + ambient --------------------------------------------------------
  // Cool sky key: modest, so the practicals and grade own the fighters' look
  // instead of a daylight-strength wash. STEEPENED (round-3, critic item 3):
  // at the old (-4.5, 7.5) elevation the silhouette shadow landed ~1.2 units
  // right of the feet — a disconnected second shadow floating on the sodium
  // pool. Steeper key prints the pose shadow rooted at the stance.
  const key = new THREE.DirectionalLight(0xa6c0ee, 3.4);
  key.position.set(-2.6, 9.6, 4.4);
  key.castShadow = true;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -2;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 24;
  key.shadow.bias = -0.0005;
  // Tight penumbra: the fighters' alpha-tested billboards print their TRUE
  // silhouette into this map — radius stays small enough that spread legs
  // still read as two lobes on the asphalt (5 blurred them into a blob).
  key.shadow.radius = 2;
  group.add(key);
  // Blue-purple night-air ambient: lifted so the playfield corners never
  // crush to dead black (the post stack adds a matching shadow floor).
  const hemisphere = new THREE.HemisphereLight(0x36447c, 0x191019, 0.85);
  group.add(hemisphere);

  // --- Drifting dust motes in the light pools ------------------------------
  const moteCount = quality === "high" ? 160 : 70;
  const motePositions = new Float32Array(moteCount * 3);
  const moteSeeds = new Float32Array(moteCount);
  const rand = mulberry32(0xa11ce);
  for (let i = 0; i < moteCount; i += 1) {
    motePositions[i * 3] = (rand() - 0.5) * 12;
    motePositions[i * 3 + 1] = rand() * 3.4;
    motePositions[i * 3 + 2] = -3.5 + rand() * 5;
    moteSeeds[i] = rand() * Math.PI * 2;
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
  const motes = new THREE.Points(moteGeometry, new THREE.PointsMaterial({
    size: 0.022,
    map: softDotTexture(32),
    color: 0xffe7c2,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }));
  motes.frustumCulled = false;
  group.add(motes);
  flickers.push((t) => {
    for (let i = 0; i < moteCount; i += 1) {
      const seed = moteSeeds[i];
      motePositions[i * 3] += Math.sin(t * 0.35 + seed) * 0.0007;
      motePositions[i * 3 + 1] = (motePositions[i * 3 + 1] + 0.0006 + Math.sin(t * 0.5 + seed) * 0.0004 + 3.4) % 3.4;
    }
    moteGeometry.attributes.position.needsUpdate = true;
  });

  return {
    group,
    fog,
    background,
    keyLight: key,
    // 5.1 (#45): the sprite shader's practicals for this stage — the
    // sodium / K&A neon / station-lamp set that used to be its constants.
    spriteLight: spriteLightFor("somerset"),
    // Super-freeze rim-lit silhouette: the stage drops toward darkness while
    // the practical rims stay (the fighter layer boosts its rims in step).
    setDim(dim) {
      const keep = 1 - dim * 0.72;
      key.intensity = 3.4 * keep;
      // Key shadow softens out with the dim: the frozen fighters read as ONE
      // clean silhouette each under the banner, not sprite + printed twin
      // (the critic's "doubled ghost legs").
      key.shadow.intensity = 1 - dim * 0.85;
      for (const spot of sodiumSpots) {
        spot.intensity *= keep; // called after update(): overrides the flicker
        spot.shadow.intensity = 0.45 * (1 - dim * 0.9);
      }
      hemisphere.intensity = 0.85 * (1 - dim * 0.6);
      backdropMaterial.color.setRGB(1.08 * keep, 1.06 * keep, 1.14 * keep);
      fence.material.opacity = 0.88 * (1 - dim * 0.5);
      // Train windows settle with the freeze (absolute set — never compounds).
      trainWindows.material.color.setRGB(1.22, 1.14, 0.95).multiplyScalar(1 - dim * 0.7);
    },
    update(timeSec) {
      for (const flicker of flickers) flicker(timeSec);
      for (const updater of updaters) updater(timeSec);
    },
    dispose() {
      group.traverse((node) => {
        node.geometry?.dispose?.();
        if (node.material) {
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
        }
      });
    },
  };
}
