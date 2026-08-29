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
import { canvasTexture, asphaltMaps, softDotTexture, streakTexture, wetStreakTexture } from "./textures.mjs";

const SODIUM = 0xffa04a;
const NEON_MAGENTA = 0xff4fd8;
const NEON_CYAN = 0x3fd6ff;

function gradedBackdropTexture(image) {
  return canvasTexture(1280, 720, (ctx, w, h) => {
    if (image?.complete && image.naturalWidth) {
      // Farthest plane: slight defocus fakes depth of field so a camera pan
      // reads layered depth instead of a sharp flat card.
      ctx.filter = "blur(1.5px)";
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

// Two-frame walking silhouette for the midground pedestrians. blurPx > 0
// produces the defocused far-crowd variant.
function pedestrianTexture(step, blurPx = 0) {
  return bluredCardTexture(96, 192, blurPx, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b0f17";
    const cx = w / 2;
    // Head.
    ctx.beginPath();
    ctx.arc(cx, h * 0.13, w * 0.13, 0, Math.PI * 2);
    ctx.fill();
    // Torso.
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.2, h * 0.22);
    ctx.lineTo(cx + w * 0.2, h * 0.22);
    ctx.lineTo(cx + w * 0.16, h * 0.58);
    ctx.lineTo(cx - w * 0.16, h * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0b0f17";
    ctx.lineWidth = w * 0.14;
    // Legs: apart on step 0, passing on step 1.
    const spread = step === 0 ? w * 0.2 : w * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.06, h * 0.56);
    ctx.lineTo(cx - spread, h * 0.94);
    ctx.moveTo(cx + w * 0.06, h * 0.56);
    ctx.lineTo(cx + spread, h * 0.96);
    ctx.stroke();
    // Arms.
    ctx.lineWidth = w * 0.11;
    const swing = step === 0 ? w * 0.14 : w * 0.03;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.18, h * 0.26);
    ctx.lineTo(cx - w * 0.14 - swing, h * 0.46);
    ctx.moveTo(cx + w * 0.18, h * 0.26);
    ctx.lineTo(cx + w * 0.14 + swing, h * 0.46);
    ctx.stroke();
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
  const shadowSize = quality === "high" ? 2048 : 1024;

  // --- Atmosphere -----------------------------------------------------------
  const fog = new THREE.FogExp2(0x0a0e19, 0.03);
  const background = new THREE.Color(0x05070d);

  // --- Ground: wet asphalt --------------------------------------------------
  const maps = asphaltMaps(0x50fa57);
  maps.albedo.repeat.set(3, 1.3);
  maps.roughness.repeat.set(3, 1.3);
  maps.metalness.repeat.set(3, 1.3);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 13),
    new THREE.MeshStandardMaterial({
      map: maps.albedo,
      roughnessMap: maps.roughness,
      metalnessMap: maps.metalness,
      roughness: 1,
      metalness: 1,
      envMapIntensity: 0.75,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -2.4);
  ground.receiveShadow = true;
  group.add(ground);

  // The backdrop's own reflections continued onto the playfield: mirrored,
  // blurred, streaked and faded toward the camera (seam killer #1). Kept
  // BEHIND the fence line — the fight-plane concrete stays in crisp focus,
  // heavy blur lives only in the distance.
  const reflectionCarpet = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 7),
    new THREE.MeshBasicMaterial({
      map: backdropReflectionTexture(host.stageImages.somerset),
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  reflectionCarpet.name = "fb-carpet";
  reflectionCarpet.rotation.x = -Math.PI / 2;
  reflectionCarpet.position.set(0, 0.006, -5.3);
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
  const neonStreak = groundStreak(NEON_MAGENTA, 4.75, -3.1, 5.6, 1.5, 0.5);   // K&A pink smear
  const lampStreak = groundStreak(0xbfffd9, 0.4, -4, 5.4, 1.15, 0.42);        // green-white station lamp
  groundStreak(SODIUM, -1.85, -1.6, 4.2, 1.0, 0.44);                          // left sodium head
  groundStreak(SODIUM, 1.85, -1.6, 4.2, 1.0, 0.44);                          // right sodium head
  groundStreak(0xff9a3c, -5.6, -4.6, 4.4, 2.1, 0.2);                          // warm bokeh smears
  groundStreak(0xffb060, -7.4, -4.8, 3.8, 1.7, 0.16);
  groundStreak(0x3fd6ff, 6.3, -2.4, 3.6, 0.9, 0.26);                          // cyan check-cashing
  groundStreak(0xffc070, 7.6, -4.6, 3.4, 1.6, 0.15);

  // Sidewalk curb line behind the fighters.
  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(46, 0.14, 1.7),
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.9 }),
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

  // --- Chain-link fence line: midground structure at the curb --------------
  const fenceMap = fenceTexture();
  fenceMap.repeat.set(6, 1);
  const fence = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 1.55),
    new THREE.MeshBasicMaterial({
      map: fenceMap,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      color: 0x4a5364,
    }),
  );
  fence.name = "fb-fence";
  fence.position.set(0, 0.78, -5.05);
  fence.renderOrder = 1;
  group.add(fence);

  // --- Animated silhouette pedestrians behind the fence --------------------
  // Two parallax crowds: a near line just behind the fence (sharp, dark) and
  // a far line across the street (defocused, dimmer, smaller) so the crowd
  // reads as layered depth instead of a single cutout card.
  const pedMaterials = [pedestrianTexture(0), pedestrianTexture(1)].map((map) => new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    color: 0x11141c,
  }));
  const farPedMaterials = [pedestrianTexture(0, 3), pedestrianTexture(1, 3)].map((map) => new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    color: 0x1a2030,
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

  // --- Steam drifting from the station grates through the lamp beams ------
  const steams = [
    { mesh: steamPlume(0xbfe8d4, 2.1, 3.4, 0.24, 3.1), x: 0.75, z: -3.85 },
    { mesh: steamPlume(0xc8d8e8, 1.7, 2.8, 0.17, 8.7), x: -3.4, z: -4.55 },
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
  const columnXs = [-8.6, -3.4, 3.4, 8.6];
  for (const x of columnXs) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.3, 0.5), rust);
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
  const flickers = [];

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
    const light = new THREE.SpotLight(SODIUM, 46, 0, 0.82, 0.55, 1.9);
    light.position.set(headX, 3.46, -1.55);
    // Target on the fight plane: the sodium pool lands ON the sole line the
    // fighters stand on instead of floating slightly behind their feet.
    light.target.position.set(headX + Math.sign(x) * 0.2, 0, -0.3);
    light.castShadow = true;
    light.shadow.mapSize.set(shadowSize, shadowSize);
    light.shadow.bias = -0.0004;
    light.shadow.camera.near = 0.4;
    light.shadow.camera.far = 9;
    group.add(light);
    group.add(light.target);
    const shaft = volumeShaft(SODIUM, 0.14, 0.8, 3.4, 0.12);
    shaft.position.set(headX, 1.8, -1.55);
    group.add(shaft);
    flickers.push((t) => {
      const wobble = 1 + Math.sin(t * 2.1 + x) * 0.035 + Math.sin(t * 13.7 + x * 3.1) * 0.02;
      light.intensity = 46 * wobble;
      shaft.material.uniforms.uTime.value = t;
      shaft.material.uniforms.uFlicker.value = wobble;
    });
    return light;
  };
  streetlight(-2.7);
  streetlight(2.7);

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
  flickers.push((t) => {
    const step = Math.floor(t * 14);
    const buzz = hash01(step) > 0.13 ? 1 : 0.28; // occasional dropout
    const level = buzz * (0.9 + hash01(step * 7 + 3) * 0.2);
    neon.material.color.setScalar(1.7 * level);
    neonHalo.material.opacity = 0.42 * level;
    neonLight.intensity = 12 * level;
    // The wet-street smear under the sign breathes with the tube.
    neonStreak.material.opacity = 0.5 * (0.55 + 0.45 * level);
  });

  // Cool fluorescent under the el deck (greenish, slight hum wobble).
  const underEl = new THREE.PointLight(0xbfffe2, 6, 7, 2);
  underEl.position.set(0.4, 3, -4);
  group.add(underEl);
  const tube = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.06, 0.1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd6ffe9).multiplyScalar(1.2), fog: false }),
  );
  tube.position.set(0.4, 3.24, -4);
  group.add(tube);
  const underShaft = volumeShaft(0xbfffe2, 0.22, 0.75, 2.6, 0.08);
  underShaft.position.set(0.4, 1.7, -4);
  group.add(underShaft);
  flickers.push((t) => {
    const hum = 1 + Math.sin(t * 41) * 0.05 + (hash01(Math.floor(t * 9)) > 0.94 ? -0.5 : 0);
    underEl.intensity = 6 * hum;
    tube.material.color.set(0xd6ffe9).multiplyScalar(1.2 * Math.max(0.3, hum));
    underShaft.material.uniforms.uTime.value = t;
    underShaft.material.uniforms.uFlicker.value = Math.max(0.3, hum);
    // Green-white ground smear hums with the fluorescent it reflects.
    lampStreak.material.opacity = 0.42 * Math.max(0.35, hum);
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

  // --- Key + ambient --------------------------------------------------------
  // Cool sky key: modest, so the practicals and grade own the fighters' look
  // instead of a daylight-strength wash.
  const key = new THREE.DirectionalLight(0xa6c0ee, 2.6);
  key.position.set(-5, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -2;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 24;
  key.shadow.bias = -0.0005;
  key.shadow.radius = 5; // soft penumbra: no hard architectural shadow edges
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
