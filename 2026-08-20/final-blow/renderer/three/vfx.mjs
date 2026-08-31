// Combat-impact VFX layer for CINEMA 3D.
// Wired to the spawnHit family through a rollback-guarded latch in game.js.
// Impacts are LAYERED the way SF6 layers them, instead of one radial glow:
//   1. a small hot white core (frame-1 pop, gone in ~0.15s);
//   2. a softer coloured halo around the core (stays small — never floods);
//   3. directional spark particles with motion-streak line segments;
//   4. a brief expanding screen-space shockwave ring on heavy+ tiers;
//   5. a budgeted point-light flash (capped so bloom cannot erase the
//      fighters' silhouettes — the fighter layer also reads flashLevel() and
//      darkens sprite edges while a flash is live).
// A registry hook (registerImpactEffect) lets the future VFX domain agent
// replace/extend per-tier effects without touching this file's plumbing.
import * as THREE from "three";
import { PX, worldX, worldY, mulberry32 } from "./shared.mjs";
import { softDotTexture, ringTexture, impactBurstTexture, smearArcTexture, paintStreakTexture } from "./textures.mjs";
import { FIGHTER_MASK_LAYER } from "./post.mjs";

const MAX_SPARKS = 240;
const MAX_EMBERS = 64;
const FLASH_POOL = 3;
const RING_POOL = 2;

// Light intensities are deliberately small: at ~1 unit from a sprite even 10
// blows the character to white through ACES+bloom. The visual "pop" comes
// from the core/halo sprites; the light only kisses nearby surfaces.
// `kick` is the presentation-only camera shake budget in screen pixels.
// `shard` is the orange/red radial-shard colour (SF6-style layered hit: hot
// white core -> warm shards -> cyan speedline ring, never one white star).
const TIER_STYLE = {
  blocked: { color: 0x9fd8ff, shard: 0x86b8ff, intensity: 1.6, sparks: 12, embers: 4, speed: 1.8, core: 0.3, ring: false, kick: 1.2 },
  light: { color: 0xffd9a0, shard: 0xff8438, intensity: 3, sparks: 16, embers: 8, speed: 2.4, core: 0.38, ring: false, kick: 1.8 },
  heavy: { color: 0xffb36b, shard: 0xff6a26, intensity: 5.5, sparks: 30, embers: 11, speed: 3.4, core: 0.5, ring: true, kick: 3 },
  special: { color: 0xffc46b, shard: 0xff701e, intensity: 7, sparks: 42, embers: 12, speed: 4, core: 0.56, ring: true, kick: 3 },
  super: { color: 0xfff0c0, shard: 0xff5a1a, intensity: 9, sparks: 58, embers: 14, speed: 5, core: 0.68, ring: true, kick: 3.4 },
  weapon: { color: 0xffe08a, shard: 0xff7c2c, intensity: 6, sparks: 34, embers: 11, speed: 3.7, core: 0.52, ring: true, kick: 3 },
  throw: { color: 0xd8c8ff, shard: 0xb08cff, intensity: 4, sparks: 20, embers: 8, speed: 2.9, core: 0.42, ring: false, kick: 2.2 },
};
// Cyan speedline ring colour: reads as a pressure wave against the warm shards.
const RING_CYAN = 0x8feaff;

// v2.6 ELEMENTS: per-element tint overrides for special/super impacts. The
// spawnHit latch now carries the attacker's element id; special-class bursts
// re-tint the whole layered stack (core halo, shard fan, embers, spill and
// flash lights) so a curse special flashes green and a gilded one gold. The
// entire group already joins FIGHTER_MASK_LAYER (the painterly-pass
// protection mask), so the tinted stack keeps sprite-grade edge snap.
const ELEMENT_TINTS = {
  seismic: { color: 0xe8b25a, shard: 0xc9862e },
  neon: { color: 0x5ee9ff, shard: 0x2ec9ff },
  concrete: { color: 0xe0e0e0, shard: 0xb8b8b8 },
  spray: { color: 0xff9b3d, shard: 0xff7a1e },
  tech: { color: 0x7fd4ff, shard: 0x3ea8ff },
  gilded: { color: 0xffd76b, shard: 0xffb92e },
  feedback: { color: 0xb08cff, shard: 0x8cff6b },
  bass: { color: 0xff8c5a, shard: 0xff6a26 },
  contract: { color: 0xffd76b, shard: 0xffc94f },
  curse: { color: 0x8cff5e, shard: 0x4fd42e },
};

export class ImpactVfxLayer {
  constructor(host) {
    this.host = host;
    this.group = new THREE.Group();
    this.group.name = "impact-vfx";
    this.rand = mulberry32(0xf1657);
    this.customEffects = new Map(); // tier -> fn(payload, layer)
    this.pending = [];
    this.seenTicks = [];
    // MOTION FIX 12: takeoff/landing/dash dust latches from the game-side
    // motion observers — 3D parity for the 2D ground-work particles.
    this.pendingDust = [];

    // Spark pool (CPU-simulated, single draw call) + streak line segments
    // sharing the same simulation (head = particle, tail = pos - vel*k).
    this.positions = new Float32Array(MAX_SPARKS * 3);
    this.colors = new Float32Array(MAX_SPARKS * 3);
    this.velocities = new Float32Array(MAX_SPARKS * 3);
    this.life = new Float32Array(MAX_SPARKS);
    this.maxLife = new Float32Array(MAX_SPARKS);
    this.cursor = 0;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.06,
      map: softDotTexture(48),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.group.add(this.points);

    this.streakPositions = new Float32Array(MAX_SPARKS * 6);
    this.streakColors = new Float32Array(MAX_SPARKS * 6);
    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute("position", new THREE.BufferAttribute(this.streakPositions, 3));
    streakGeometry.setAttribute("color", new THREE.BufferAttribute(this.streakColors, 3));
    this.streaks = new THREE.LineSegments(streakGeometry, new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    }));
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 6;
    this.group.add(this.streaks);

    // Ember pool: fewer, fatter, hotter orange particles that arc out of the
    // impact and linger — the "molten" body of the burst behind the sparks.
    this.emberPositions = new Float32Array(MAX_EMBERS * 3);
    this.emberColors = new Float32Array(MAX_EMBERS * 3);
    this.emberVelocities = new Float32Array(MAX_EMBERS * 3);
    this.emberLife = new Float32Array(MAX_EMBERS);
    this.emberMaxLife = new Float32Array(MAX_EMBERS);
    this.emberCursor = 0;
    const emberGeometry = new THREE.BufferGeometry();
    emberGeometry.setAttribute("position", new THREE.BufferAttribute(this.emberPositions, 3));
    emberGeometry.setAttribute("color", new THREE.BufferAttribute(this.emberColors, 3));
    this.embers = new THREE.Points(emberGeometry, new THREE.PointsMaterial({
      size: 0.12,
      map: softDotTexture(48),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
    }));
    this.embers.frustumCulled = false;
    this.embers.renderOrder = 6;
    this.group.add(this.embers);
    this.emberStreakPositions = new Float32Array(MAX_EMBERS * 6);
    this.emberStreakColors = new Float32Array(MAX_EMBERS * 6);
    const emberStreakGeometry = new THREE.BufferGeometry();
    emberStreakGeometry.setAttribute("position", new THREE.BufferAttribute(this.emberStreakPositions, 3));
    emberStreakGeometry.setAttribute("color", new THREE.BufferAttribute(this.emberStreakColors, 3));
    this.emberStreaks = new THREE.LineSegments(emberStreakGeometry, this.streaks.material);
    this.emberStreaks.frustumCulled = false;
    this.emberStreaks.renderOrder = 6;
    this.group.add(this.emberStreaks);

    // Presentation-only impact camera kick (2-3px), read by main.mjs.
    this.kickTtl = 0;
    this.kickMax = 0.16;
    this.kickMag = 0;

    // One-shot radial-blur/chromatic pulse on the impact frame (read by
    // main.mjs, fed to the post grade). ~2 render frames, heavier tiers hit
    // harder; decays fast so the frame never smears through hitstop.
    this.pulseTtl = 0;
    this.pulseMax = 0.11;
    this.pulseMag = 0;

    // Layered impact pop: hot white core + soft coloured halo per slot.
    this.cores = [];
    for (let i = 0; i < 2; i += 1) {
      const makeSprite = (size, order) => {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            map: softDotTexture(size),
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false,
          }),
        );
        mesh.visible = false;
        mesh.renderOrder = order;
        this.group.add(mesh);
        return mesh;
      };
      this.cores.push({
        core: makeSprite(64, 8),
        halo: makeSprite(96, 7),
        ttl: 0,
        max: 0.18,
        size: 0.5,
      });
    }

    // Expanding shockwave rings (heavy tiers): broken tapered arcs, squashed
    // into a slight ellipse and randomly rotated per impact so no two hits
    // draw the same circle. Fast: bright birth, gone in ~0.15s.
    this.rings = [];
    for (let i = 0; i < RING_POOL; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: ringTexture(320, 0x51ab + i * 977), // 2x: no stair-stepped arcs
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 7;
      this.group.add(mesh);
      this.rings.push({ mesh, ttl: 0, max: 0.15, size: 1, squash: 0.75 });
    }

    // Tapered radial spark-burst star: the layer that replaces the uniform
    // circle stroke read. Random rotation + anisotropic scale per impact, and
    // a 3-frame FLIPBOOK per slot (differently-seeded shard stars swapped over
    // the burst's life) so consecutive frames genuinely change shape instead
    // of one star scaling up.
    this.bursts = [];
    for (let i = 0; i < 2; i += 1) {
      const maps = [0, 1, 2].map((f) => impactBurstTexture(512, 0xb1a57 + i * 613 + f * 7919));
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: maps[0],
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 8;
      this.group.add(mesh);
      this.bursts.push({ mesh, maps, ttl: 0, max: 0.16, size: 1 });
    }

    // (Round-3: the free-floating halftone dot-screen donuts are GONE — at
    // point-blank they stamped a flat dot tile across the receiver's body.
    // The halftone answer now lives in the fighter shader, projected onto the
    // struck body and masked by its own alpha.)
    this.halftones = [];

    // Curved anime smear arcs: 2-3 hand-drawn crescent whips framing the
    // contact, each differently seeded, spun and mirrored per impact.
    this.smears = [];
    for (let i = 0; i < 6; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: smearArcTexture(256, 0x53a2 + i * 977),
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 8;
      this.group.add(mesh);
      this.smears.push({ mesh, ttl: 0, max: 0.13, size: 1, spin: 0 });
    }

    // STRUCTURED PAINT-STREAK FAN (round-3 hierarchy): 8-14 tapered comet
    // strokes of genuinely varying length/width, fanned around the contact
    // with a hard directional bias. LAYERED BEHIND THE FIGHTERS (negative z +
    // depth test): the ribbons whip past the silhouettes the way SF6 layers
    // Drive-Impact energy, so the RECEIVER stays readable through the flash
    // instead of being buried under an additive wash. Pooled; 3 seeded
    // stroke variants so no two rays match.
    this.streakRays = [];
    for (let i = 0; i < 16; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 0.375),
        new THREE.MeshBasicMaterial({
          map: paintStreakTexture(256, 96, 0x77aa + (i % 3) * 4099),
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      );
      // anchor at the stroke ROOT: geometry shifts so position = contact point
      mesh.geometry.translate(0.5, 0, 0);
      mesh.visible = false;
      mesh.renderOrder = 8;
      this.group.add(mesh);
      this.streakRays.push({ mesh, ttl: 0, max: 0.14, size: 1, dir: 1 });
    }

    // Contact-point lens pop (read by main.mjs -> post): world x/y of the
    // latest hit + a ~1-2 frame ttl for the local refraction/chroma punch.
    this.popState = { x: 0, y: 0, ttl: 0, max: 0.055, mag: 0 };

    // Latest impact spill for the fighter layer: burst-coloured light that
    // relights both sprites and decays with the flash.
    this.spillState = { x: 0, y: 0, color: new THREE.Color(0xffffff), ttl: 0, max: 0.26 };

    // Flash-light pool. Intensities are budgeted: the pop reads from the core
    // sprite; the light only kisses the scene surfaces around the impact.
    this.flashes = [];
    for (let i = 0; i < FLASH_POOL; i += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 6, 2);
      light.visible = false;
      this.group.add(light);
      this.flashes.push({ light, ttl: 0, max: 1, peak: 0, level: 0 });
    }

    // 2-frame WHITE-HOT pop: a separate, much hotter point light that fires on
    // the impact frame and dies ~2 render frames later. Pushed toward the
    // camera so it genuinely relights BOTH fighters' sprite faces and pools
    // hard on the wet asphalt for exactly the hit-confirm instant.
    this.pops = [];
    for (let i = 0; i < 2; i += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 9, 2);
      light.visible = false;
      this.group.add(light);
      this.pops.push({ light, ttl: 0, max: 0.034, peak: 0 });
    }

    // Ground-reflection flash pool: an additive radial pool flat on the
    // asphalt under the impact — the wet street answers the hit for ~0.3s.
    this.groundFlashes = [];
    for (let i = 0; i < 2; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: softDotTexture(96),
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.groundFlashes.push({ mesh, ttl: 0, max: 0.3, size: 1 });
    }

    // CRISP-THROUGH-THE-FLASH (critic fix k): every visual in this layer
    // joins the fighter protection mask, so the painterly stage pass
    // (Kuwahara + posterize + ink edge) never flattens the burst's tapered
    // streaks and dot screens into soft milky patches — impact energy keeps
    // the same edge snap as the sprites, the stage stays painted around it.
    // (Lights are left on their default layer.)
    this.group.traverse((node) => {
      if (node.isMesh || node.isPoints || node.isLineSegments) node.layers.enable(FIGHTER_MASK_LAYER);
    });
  }

  // Latest impact spill for the fighter layer: null when cold, otherwise
  // { x, color, level } with level decaying 1 -> 0 over ~0.26s.
  spill() {
    if (this.spillState.ttl <= 0) return null;
    const t = this.spillState.ttl / this.spillState.max;
    return { x: this.spillState.x, y: this.spillState.y, color: this.spillState.color, level: t * t };
  }

  // 0..1 how hard the strongest live flash is burning — the fighter layer
  // uses this to keep silhouettes readable through bursts.
  flashLevel() {
    let level = 0;
    for (const flash of this.flashes) {
      if (flash.ttl > 0) level = Math.max(level, (flash.ttl / flash.max) * flash.level);
    }
    return level;
  }

  // Impact camera kick in screen pixels (0 when idle); main.mjs turns this
  // into a decaying 2-3px camera shake. Presentation-only.
  kickLevel() {
    if (this.kickTtl <= 0) return 0;
    const t = this.kickTtl / this.kickMax;
    return this.kickMag * t * t;
  }

  // 0..1 radial-blur/chromatic impact pulse (0 when idle), sharp attack and
  // a two-frame tail.
  pulseLevel() {
    if (this.pulseTtl <= 0) return 0;
    const t = this.pulseTtl / this.pulseMax;
    return this.pulseMag * t * t;
  }

  // Contact-point lens pop: null when cold, else { x, y, level } in world
  // space for the ~1-2 frame local refraction punch (main.mjs projects it).
  popInfo() {
    if (this.popState.ttl <= 0) return null;
    const t = this.popState.ttl / this.popState.max;
    return { x: this.popState.x, y: this.popState.y, level: this.popState.mag * t };
  }

  // Future domain agents plug richer effects in here.
  registerImpactEffect(tier, effect) {
    this.customEffects.set(tier, effect);
  }

  // Called from the game's spawnHit latch (already rollback-guarded there);
  // dedupes per simulation tick+position to survive double-latches.
  onHit(payload) {
    if (this.host.isRollbackResimulating()) return;
    const key = `${payload.tick}:${Math.round(payload.x)}:${Math.round(payload.y)}`;
    if (this.seenTicks.includes(key)) return;
    this.seenTicks.push(key);
    if (this.seenTicks.length > 12) this.seenTicks.shift();
    this.pending.push(payload);
    if (this.pending.length > 8) this.pending.shift();
  }

  // MOTION FIX 12: dust latch — same guard discipline as onHit. Fired from
  // the render-loop motion observers (never during resim), payload carries
  // sim-space position + a 0-1.6 force.
  onDust(payload) {
    if (this.host.isRollbackResimulating()) return;
    this.pendingDust.push(payload);
    if (this.pendingDust.length > 6) this.pendingDust.shift();
  }

  // Muted grey-brown motes through the ember pool: values kept below bloom
  // threshold so they read as street dust, not sparks — gentle outward kick,
  // ordinary ember gravity brings them back down.
  spawnDust(x, y, force, direction) {
    const count = Math.round(5 + force * 4);
    for (let i = 0; i < count; i += 1) {
      const index = this.emberCursor;
      this.emberCursor = (this.emberCursor + 1) % MAX_EMBERS;
      const base = index * 3;
      this.emberPositions[base] = x + (this.rand() - 0.5) * 0.3;
      this.emberPositions[base + 1] = Math.max(0.02, y + this.rand() * 0.06);
      this.emberPositions[base + 2] = 0.16;
      const side = i % 2 ? 1 : -1;
      const kick = (0.35 + this.rand() * 0.7) * Math.max(0.5, force);
      this.emberVelocities[base] = side * kick + direction * kick * 0.3;
      this.emberVelocities[base + 1] = 0.35 + this.rand() * 0.75 * Math.max(0.5, force);
      this.emberVelocities[base + 2] = (this.rand() - 0.5) * 0.3;
      const dim = 0.34 + this.rand() * 0.16;
      this.emberColors[base] = dim;
      this.emberColors[base + 1] = dim * 0.92;
      this.emberColors[base + 2] = dim * 0.8;
      this.emberMaxLife[index] = 0.4 + this.rand() * 0.36;
      this.emberLife[index] = this.emberMaxLife[index];
    }
  }

  spawnSparks(x, y, style, direction, counter) {
    const count = Math.round(style.sparks * (counter ? 1.4 : 1));
    const color = new THREE.Color(style.color);
    for (let i = 0; i < count; i += 1) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_SPARKS;
      const base = index * 3;
      this.positions[base] = x + (this.rand() - 0.5) * 0.14;
      this.positions[base + 1] = y + (this.rand() - 0.5) * 0.16;
      this.positions[base + 2] = 0.12;
      const angle = this.rand() * Math.PI * 2;
      const speed = (0.6 + this.rand() * 1.2) * style.speed * 0.5;
      // Strong directional bias: sparks fly with the hit, not isotropically.
      this.velocities[base] = Math.cos(angle) * speed * 0.45 + direction * speed * 1.05;
      this.velocities[base + 1] = Math.abs(Math.sin(angle)) * speed * 0.75 + 0.35;
      this.velocities[base + 2] = (this.rand() - 0.5) * speed * 0.35;
      const heat = 1.1 + this.rand() * 0.9;
      this.colors[base] = color.r * heat * 1.9;
      this.colors[base + 1] = color.g * heat * 1.55;
      this.colors[base + 2] = color.b * heat;
      this.maxLife[index] = 0.28 + this.rand() * 0.3;
      this.life[index] = this.maxLife[index];
    }
  }

  // Hot orange embers: fewer, fatter, slower, arcing with gravity and a short
  // motion streak each — the layer that makes the burst read as molten metal
  // instead of hairlines.
  spawnEmbers(x, y, style, direction, counter) {
    const count = Math.round((style.embers ?? 8) * (counter ? 1.3 : 1));
    const emberTint = style.emberTint ? new THREE.Color(style.emberTint) : null;
    for (let i = 0; i < count; i += 1) {
      const index = this.emberCursor;
      this.emberCursor = (this.emberCursor + 1) % MAX_EMBERS;
      const base = index * 3;
      this.emberPositions[base] = x + (this.rand() - 0.5) * 0.1;
      this.emberPositions[base + 1] = y + (this.rand() - 0.5) * 0.1;
      this.emberPositions[base + 2] = 0.18;
      const angle = this.rand() * Math.PI * 2;
      const speed = (0.5 + this.rand() * 0.9) * style.speed * 0.42;
      this.emberVelocities[base] = Math.cos(angle) * speed * 0.6 + direction * speed * 0.9;
      this.emberVelocities[base + 1] = Math.abs(Math.sin(angle)) * speed * 0.9 + 0.55;
      this.emberVelocities[base + 2] = (this.rand() - 0.5) * speed * 0.3;
      // Molten orange, hot enough to bloom at birth, cooling to deep ember —
      // unless an element impact re-heats the pool in its own colour.
      const heat = 1.4 + this.rand() * 1.2;
      if (emberTint) {
        this.emberColors[base] = emberTint.r * heat * 2.1;
        this.emberColors[base + 1] = emberTint.g * heat * 1.9;
        this.emberColors[base + 2] = emberTint.b * heat * 1.7;
      } else {
        this.emberColors[base] = 1.0 * heat * 2.1;
        this.emberColors[base + 1] = 0.52 * heat * 1.6;
        this.emberColors[base + 2] = 0.14 * heat;
      }
      this.emberMaxLife[index] = 0.42 + this.rand() * 0.34;
      this.emberLife[index] = this.emberMaxLife[index];
    }
  }

  fireFlash(x, y, style, counter, direction = 1) {
    const slot = this.flashes.find((flash) => flash.ttl <= 0) || this.flashes[0];
    slot.light.color.set(style.color);
    // Off-plane toward camera: grazes the sprites, pools on the floor.
    slot.light.position.set(x, Math.max(0.25, y), 1.5);
    slot.peak = style.intensity * (counter ? 1.35 : 1);
    slot.max = style.tier === "super" ? 0.3 : 0.2;
    slot.ttl = slot.max;
    slot.level = style.tier === "super" ? 1 : style.tier === "special" || style.tier === "heavy" ? 0.55 : 0.3;
    // Full intensity immediately: the impact frame itself must carry the pop
    // (also keeps frozen-frame screenshots deterministic).
    slot.light.intensity = slot.peak;
    slot.light.visible = true;

    const core = this.cores.find((c) => c.ttl <= 0) || this.cores[0];
    // Small HOT WHITE CORE (well under 15% screen height) inside an orange/red
    // halo — layered like SF6, never one frame-nuking star. The core still
    // crosses the bloom knee for its ~2 frames but stays tight, so both
    // fighters' silhouettes read straight through the hit.
    core.core.material.color.set(0xffffff).multiplyScalar(2.7);
    core.halo.material.color.set(style.shard ?? style.color).lerp(new THREE.Color(0xff3a10), 0.25).multiplyScalar(1.5);
    core.core.position.set(x, y, 0.32);
    core.halo.position.set(x, y, 0.3);
    core.size = style.core ?? 0.5;
    core.max = style.tier === "super" ? 0.24 : 0.17;
    core.ttl = core.max;
    core.core.scale.setScalar(core.size * 0.38);
    // Halo CUT AGAIN (round-3 hierarchy): the additive cushion was still the
    // loudest layer at point-blank — it is now a whisper behind the core; the
    // statement is core + spark fan + one chromatic ring.
    core.halo.scale.setScalar(core.size * 0.5);
    core.core.material.opacity = 1;
    core.halo.material.opacity = 0.09;
    core.core.visible = core.halo.visible = true;

    // RADIAL SPARK-STREAK FAN, 8-14 strokes BEHIND the fighters: thin, hot,
    // saturated ribbons of hard-varied length/width fanned toward the hit
    // direction (a few whip backward for recoil). Negative z + depth test
    // means every stroke that crosses a fighter is occluded by the sprite —
    // the energy frames the silhouettes instead of erasing them.
    const rayCount = style.ring ? 14 : 8;
    const dirAngle = direction >= 0 ? 0 : Math.PI;
    for (let s = 0; s < rayCount; s += 1) {
      const ray = this.streakRays.find((r) => r.ttl <= 0)
        || this.streakRays[(s * 5 + 1) % this.streakRays.length];
      const backward = s % 4 === 3;
      const spread = (this.rand() - 0.5) * (backward ? 1.3 : 2.4);
      const angle = dirAngle + spread + (backward ? Math.PI : 0);
      ray.mesh.rotation.z = angle;
      ray.mesh.position.set(x, y, -0.24 - s * 0.004);
      // Length varies 3x root-to-tip across the fan; width varies ~2.5x.
      ray.size = (style.core ?? 0.5) * (0.6 + this.rand() * 1.6)
        * (style.ring ? 1.5 : 1.05) * (backward ? 0.55 : 1);
      ray.mesh.scale.set(ray.size, ray.size * (0.22 + this.rand() * 0.34), 1);
      ray.max = 0.11 + this.rand() * 0.05;
      ray.ttl = ray.max;
      ray.mesh.material.color.set(0xffffff)
        .lerp(new THREE.Color(style.shard ?? style.color), 0.45).multiplyScalar(1.8);
      ray.mesh.material.opacity = 0.95;
      ray.mesh.visible = true;
    }

    // Shard star DEMOTED to a brief first-frame accent (the flat 8-point
    // star + paper shards read 2015-indie): the layered read now comes from
    // the spark fan + chromatic ring.
    const burst = this.bursts.find((b) => b.ttl <= 0) || this.bursts[0];
    burst.mesh.material.color.set(style.shard ?? style.color).lerp(new THREE.Color(0xffffff), 0.18).multiplyScalar(1.7);
    burst.mesh.position.set(x, y, 0.36);
    burst.mesh.rotation.z = this.rand() * Math.PI * 2;
    burst.size = (style.core ?? 0.5) * (style.ring ? 1.2 : 0.9);
    burst.max = style.tier === "super" ? 0.13 : 0.11;
    burst.ttl = burst.max;
    burst.jx = 0.85 + this.rand() * 0.4;
    burst.jy = 0.85 + this.rand() * 0.4;
    burst.mesh.material.map = burst.maps[0];
    burst.mesh.scale.set(burst.size * burst.jx, burst.size * burst.jy, 1);
    burst.mesh.material.opacity = 0.55;
    burst.mesh.visible = true;

    // 1-2 CURVED ANIME SMEAR ARCS behind the fighters: crescent whips framing
    // the contact — rotated, mirrored and scaled per impact. Moved off the
    // face of the burst (round-3): stacked over the core they were part of
    // the additive fog that buried the receiver.
    const smearCount = style.ring ? 2 : 1;
    for (let s = 0; s < smearCount; s += 1) {
      const smear = this.smears.find((m) => m.ttl <= 0) || this.smears[(s * 2 + 1) % this.smears.length];
      smear.mesh.material.color.set(0xffffff).lerp(new THREE.Color(style.shard ?? style.color), 0.35).multiplyScalar(1.9);
      smear.mesh.position.set(
        x + (this.rand() - 0.5) * 0.12,
        y + (this.rand() - 0.5) * 0.12,
        -0.2 - s * 0.01,
      );
      smear.mesh.rotation.z = this.rand() * Math.PI * 2;
      smear.spin = (this.rand() - 0.5) * 7;
      smear.size = (style.core ?? 0.5) * (0.85 + this.rand() * 0.5) * (style.ring ? 1.15 : 1);
      smear.max = 0.11 + this.rand() * 0.05;
      smear.ttl = smear.max;
      const mirror = this.rand() < 0.5 ? -1 : 1;
      smear.mesh.scale.set(smear.size * mirror, smear.size, 1);
      smear.mesh.material.opacity = 0.8;
      smear.mesh.visible = true;
    }

    // NO free-floating halftone doily any more (round-3): the dot-screen
    // answer is PROJECTED ONTO THE RECEIVER'S BODY by the fighter shader
    // (uFbHitTone — masked and warped by the sprite's own alpha), never a
    // flat screen-space tile pasted over the frame.

    // Contact-point lens pop for the post grade (~1-2 frames, local).
    this.popState.x = x;
    this.popState.y = y;
    this.popState.mag = style.ring ? 1 : style.tier === "blocked" ? 0.25 : 0.6;
    this.popState.ttl = this.popState.max;

    if (style.ring) {
      // ONE CHROMATIC-FRINGED SHOCKWAVE RING: broken tapered arc with a red
      // outer lip and cyan inner lip baked into the texture, ~150ms,
      // elliptical squash + random spin — the pressure wave reads as lens
      // physics, not a canvas circle.
      const ring = this.rings.find((r) => r.ttl <= 0) || this.rings[0];
      ring.mesh.material.color.set(0xffffff).lerp(new THREE.Color(RING_CYAN), 0.25).multiplyScalar(1.6);
      ring.mesh.position.set(x, y, 0.34);
      ring.mesh.rotation.z = this.rand() * Math.PI * 2;
      ring.size = style.tier === "super" ? 1.5 : 1.15;
      ring.squash = 0.68 + this.rand() * 0.18;
      ring.max = 0.15;
      ring.ttl = ring.max;
      ring.mesh.scale.set(0.18, 0.18 * ring.squash, 1);
      ring.mesh.material.opacity = 0.85;
      ring.mesh.visible = true;
    }

    // 2-frame hot pop light in the BURST'S OWN COLOUR: the impact spills
    // coloured light onto both fighters' sprites and the wet floor. Budgeted:
    // at the old 18+3.2i peak it washed both sprites to white through ACES.
    const pop = this.pops.find((p) => p.ttl <= 0) || this.pops[0];
    pop.light.color.set(style.color).lerp(new THREE.Color(0xffffff), 0.45);
    pop.light.position.set(x, Math.max(0.4, y), 1.2);
    // Cut AGAIN (round-3 bloom clamp): at 2.5+0.7i the pop light + hit-white
    // emissive still fogged the receiver beige — the receiver must stay
    // >=50% readable through every flash. The core sprite carries the heat.
    pop.peak = 1.5 + style.intensity * 0.42;
    pop.ttl = pop.max;
    pop.light.intensity = pop.peak;
    pop.light.visible = true;

    // Sprite-side spill: fighter layer reads this and warms the near side of
    // both fighters in the burst colour while it decays. Carries the contact
    // Y too, so the receiver's body-halftone can centre on the actual hit.
    this.spillState.x = x;
    this.spillState.y = y;
    this.spillState.color.set(style.color).lerp(new THREE.Color(0xffffff), 0.25);
    this.spillState.max = style.tier === "super" ? 0.34 : 0.26;
    this.spillState.ttl = this.spillState.max;

    // Wet-asphalt answer: additive reflection pool under the impact. Kept in
    // the shard colour and modest — the old half-opacity white disc repainted
    // the floor under both fighters as a white pond every hit.
    const groundFlash = this.groundFlashes.find((g) => g.ttl <= 0) || this.groundFlashes[0];
    groundFlash.mesh.material.color.set(style.shard ?? style.color).lerp(new THREE.Color(0xffffff), 0.25);
    groundFlash.mesh.position.set(x, 0.018, 0.25);
    groundFlash.size = 0.9 + (style.core ?? 0.5) * 1.1;
    groundFlash.ttl = groundFlash.max;
    groundFlash.mesh.scale.setScalar(groundFlash.size);
    groundFlash.mesh.material.opacity = 0.22;
    groundFlash.mesh.visible = true;

    // Presentation camera kick (2-3px) beside the sim's own hit-stop.
    this.kickMag = style.kick ?? 2;
    this.kickTtl = this.kickMax;

    // Radial-blur/chromatic screen pulse: only meaningful hits ring the lens
    // (blocked taps stay clean so turtling never strobes the frame).
    this.pulseMag = style.ring ? 1 : style.tier === "blocked" ? 0.18 : 0.5;
    this.pulseTtl = this.pulseMax;
  }

  update(state, dtSec) {
    // Drain latched hits into world-space effects.
    for (const payload of this.pending) {
      const tier = payload.blocked ? "blocked" : (TIER_STYLE[payload.kind] ? payload.kind : "light");
      const style = { ...TIER_STYLE[tier], tier };
      // Element re-tint on the special class (specials, supers): the kit's
      // colour takes over the whole burst stack.
      const elementTint = !payload.blocked && ELEMENT_TINTS[payload.element]
        && (tier === "special" || tier === "super") ? ELEMENT_TINTS[payload.element] : null;
      if (elementTint) {
        style.color = elementTint.color;
        style.shard = elementTint.shard;
        // Ember pool is normally hard-coded molten orange; an element impact
        // re-heats it in the kit colour so the whole stack agrees.
        style.emberTint = elementTint.shard;
      }
      const x = worldX(payload.x);
      const y = worldY(payload.y);
      const custom = this.customEffects.get(tier);
      if (custom) custom({ ...payload, worldX: x, worldY: y }, this);
      else {
        this.fireFlash(x, y, style, payload.counter, payload.direction >= 0 ? 1 : -1);
        this.spawnSparks(x, y, style, payload.direction >= 0 ? 1 : -1, payload.counter);
        this.spawnEmbers(x, y, style, payload.direction >= 0 ? 1 : -1, payload.counter);
      }
    }
    this.pending.length = 0;
    // MOTION FIX 12: drain the dust latches (takeoff / landing / dash).
    for (const payload of this.pendingDust) {
      this.spawnDust(worldX(payload.x), worldY(payload.y),
        payload.force ?? 1, payload.direction ?? 0);
    }
    this.pendingDust.length = 0;
    this.kickTtl = Math.max(0, this.kickTtl - dtSec);
    this.pulseTtl = Math.max(0, this.pulseTtl - dtSec);
    this.popState.ttl = Math.max(0, this.popState.ttl - dtSec);

    // Advance sparks; mirror each into its motion-streak segment.
    let anyAlive = false;
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      const base = i * 3;
      const sbase = i * 6;
      if (this.life[i] <= 0) {
        this.streakColors[sbase] = this.streakColors[sbase + 1] = this.streakColors[sbase + 2] = 0;
        this.streakColors[sbase + 3] = this.streakColors[sbase + 4] = this.streakColors[sbase + 5] = 0;
        continue;
      }
      this.life[i] -= dtSec;
      if (this.life[i] <= 0) {
        this.colors[base] = this.colors[base + 1] = this.colors[base + 2] = 0;
        this.streakColors[sbase] = this.streakColors[sbase + 1] = this.streakColors[sbase + 2] = 0;
        this.streakColors[sbase + 3] = this.streakColors[sbase + 4] = this.streakColors[sbase + 5] = 0;
        continue;
      }
      anyAlive = true;
      this.velocities[base + 1] -= 6.2 * dtSec; // gravity
      this.velocities[base] *= 0.985;
      this.velocities[base + 2] *= 0.985;
      this.positions[base] += this.velocities[base] * dtSec;
      this.positions[base + 1] += this.velocities[base + 1] * dtSec;
      this.positions[base + 2] += this.velocities[base + 2] * dtSec;
      if (this.positions[base + 1] < 0.01) {
        this.positions[base + 1] = 0.01;
        this.velocities[base + 1] *= -0.42; // spark bounce on the wet ground
      }
      const fade = this.life[i] / this.maxLife[i];
      const dim = 0.35 + fade * 0.65;
      this.colors[base] *= 0.997;
      this.colors[base + 1] *= dim > 0.6 ? 1 : 0.985;
      this.colors[base + 2] *= dim > 0.6 ? 1 : 0.97;
      // Streak: head at the particle, tail trailing along the velocity.
      const trail = 0.038 * Math.min(1, fade + 0.35);
      this.streakPositions[sbase] = this.positions[base];
      this.streakPositions[sbase + 1] = this.positions[base + 1];
      this.streakPositions[sbase + 2] = this.positions[base + 2];
      this.streakPositions[sbase + 3] = this.positions[base] - this.velocities[base] * trail;
      this.streakPositions[sbase + 4] = this.positions[base + 1] - this.velocities[base + 1] * trail;
      this.streakPositions[sbase + 5] = this.positions[base + 2] - this.velocities[base + 2] * trail;
      this.streakColors[sbase] = this.colors[base] * 0.8;
      this.streakColors[sbase + 1] = this.colors[base + 1] * 0.8;
      this.streakColors[sbase + 2] = this.colors[base + 2] * 0.8;
      this.streakColors[sbase + 3] = 0;
      this.streakColors[sbase + 4] = 0;
      this.streakColors[sbase + 5] = 0;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.streaks.geometry.attributes.position.needsUpdate = true;
    this.streaks.geometry.attributes.color.needsUpdate = true;
    this.points.visible = anyAlive;
    this.streaks.visible = anyAlive;

    // Advance embers: heavier gravity arcs, slower drag, cooling colour.
    let anyEmber = false;
    for (let i = 0; i < MAX_EMBERS; i += 1) {
      const base = i * 3;
      const sbase = i * 6;
      if (this.emberLife[i] <= 0) {
        this.emberStreakColors[sbase] = this.emberStreakColors[sbase + 1] = this.emberStreakColors[sbase + 2] = 0;
        this.emberStreakColors[sbase + 3] = this.emberStreakColors[sbase + 4] = this.emberStreakColors[sbase + 5] = 0;
        continue;
      }
      this.emberLife[i] -= dtSec;
      if (this.emberLife[i] <= 0) {
        this.emberColors[base] = this.emberColors[base + 1] = this.emberColors[base + 2] = 0;
        this.emberStreakColors[sbase] = this.emberStreakColors[sbase + 1] = this.emberStreakColors[sbase + 2] = 0;
        this.emberStreakColors[sbase + 3] = this.emberStreakColors[sbase + 4] = this.emberStreakColors[sbase + 5] = 0;
        continue;
      }
      anyEmber = true;
      this.emberVelocities[base + 1] -= 4.6 * dtSec;
      this.emberVelocities[base] *= 0.99;
      this.emberPositions[base] += this.emberVelocities[base] * dtSec;
      this.emberPositions[base + 1] += this.emberVelocities[base + 1] * dtSec;
      this.emberPositions[base + 2] += this.emberVelocities[base + 2] * dtSec;
      if (this.emberPositions[base + 1] < 0.02) {
        this.emberPositions[base + 1] = 0.02;
        this.emberVelocities[base + 1] *= -0.35;
      }
      // Cool: green channel decays faster than red — white-orange -> deep ember.
      this.emberColors[base] *= 0.995;
      this.emberColors[base + 1] *= 0.975;
      this.emberColors[base + 2] *= 0.94;
      const etrail = 0.05;
      this.emberStreakPositions[sbase] = this.emberPositions[base];
      this.emberStreakPositions[sbase + 1] = this.emberPositions[base + 1];
      this.emberStreakPositions[sbase + 2] = this.emberPositions[base + 2];
      this.emberStreakPositions[sbase + 3] = this.emberPositions[base] - this.emberVelocities[base] * etrail;
      this.emberStreakPositions[sbase + 4] = this.emberPositions[base + 1] - this.emberVelocities[base + 1] * etrail;
      this.emberStreakPositions[sbase + 5] = this.emberPositions[base + 2] - this.emberVelocities[base + 2] * etrail;
      this.emberStreakColors[sbase] = this.emberColors[base] * 0.7;
      this.emberStreakColors[sbase + 1] = this.emberColors[base + 1] * 0.7;
      this.emberStreakColors[sbase + 2] = this.emberColors[base + 2] * 0.7;
      this.emberStreakColors[sbase + 3] = 0;
      this.emberStreakColors[sbase + 4] = 0;
      this.emberStreakColors[sbase + 5] = 0;
    }
    this.embers.geometry.attributes.position.needsUpdate = true;
    this.embers.geometry.attributes.color.needsUpdate = true;
    this.emberStreaks.geometry.attributes.position.needsUpdate = true;
    this.emberStreaks.geometry.attributes.color.needsUpdate = true;
    this.embers.visible = anyEmber;
    this.emberStreaks.visible = anyEmber;

    // Decay core+halo sprites (scale out, fade).
    for (const core of this.cores) {
      if (core.ttl <= 0) continue;
      core.ttl -= dtSec;
      if (core.ttl <= 0) {
        core.core.visible = core.halo.visible = false;
        core.core.material.opacity = core.halo.material.opacity = 0;
        continue;
      }
      const t = 1 - core.ttl / core.max;
      // Core stays TIGHT (its job is heat, not coverage); the demoted halo
      // is only a faint cushion behind the streak fan now.
      core.core.scale.setScalar(core.size * (0.4 + t * 0.28));
      core.halo.scale.setScalar(core.size * (0.6 + t * 0.3));
      core.core.material.opacity = 0.9 * (1 - t) * (1 - t);
      core.halo.material.opacity = 0.16 * (1 - t);
    }

    // Paint-streak rays: root anchored at the contact — each stroke stretches
    // outward a touch as it dies, so the fan reads as energy LEAVING the hit.
    for (const ray of this.streakRays) {
      if (ray.ttl <= 0) continue;
      ray.ttl -= dtSec;
      if (ray.ttl <= 0) {
        ray.mesh.visible = false;
        ray.mesh.material.opacity = 0;
        continue;
      }
      const t = 1 - ray.ttl / ray.max;
      ray.mesh.scale.x = ray.size * (1 + t * 0.45);
      ray.mesh.material.opacity = 0.95 * Math.pow(1 - t, 1.5);
    }

    // Expand + fade shockwave arcs (elliptical squash held while growing).
    for (const ring of this.rings) {
      if (ring.ttl <= 0) continue;
      ring.ttl -= dtSec;
      if (ring.ttl <= 0) {
        ring.mesh.visible = false;
        ring.mesh.material.opacity = 0;
        continue;
      }
      const t = 1 - ring.ttl / ring.max;
      const eased = 1 - (1 - t) * (1 - t) * (1 - t);
      const grow = 0.18 + eased * ring.size;
      ring.mesh.scale.set(grow, grow * ring.squash, 1);
      // Fades as it grows: bright birth, gone by full expansion.
      ring.mesh.material.opacity = 0.95 * Math.pow(1 - t, 1.5);
    }

    // Halftone shock rings: grow past the burst with an eased front, dots
    // thinning as they fade — the print-language pressure wave.
    for (const halftone of this.halftones) {
      if (halftone.ttl <= 0) continue;
      halftone.ttl -= dtSec;
      if (halftone.ttl <= 0) {
        halftone.mesh.visible = false;
        halftone.mesh.material.opacity = 0;
        continue;
      }
      const t = 1 - halftone.ttl / halftone.max;
      const eased = 1 - (1 - t) * (1 - t) * (1 - t);
      const grow = 0.22 + eased * halftone.size;
      halftone.mesh.rotation.z += halftone.spin * dtSec; // dot screen slowly turns
      halftone.mesh.scale.set(grow, grow * halftone.squash, 1);
      halftone.mesh.material.opacity = 0.68 * Math.pow(1 - t, 1.5);
    }

    // Smear arcs: whip around the contact (slight spin), stretch a touch,
    // and die inside ~0.13s — calligraphy, not geometry.
    for (const smear of this.smears) {
      if (smear.ttl <= 0) continue;
      smear.ttl -= dtSec;
      if (smear.ttl <= 0) {
        smear.mesh.visible = false;
        smear.mesh.material.opacity = 0;
        continue;
      }
      const t = 1 - smear.ttl / smear.max;
      smear.mesh.rotation.z += smear.spin * dtSec;
      const stretch = 1 + t * 0.35;
      smear.mesh.scale.set(Math.sign(smear.mesh.scale.x) * smear.size * stretch, smear.size * stretch, 1);
      smear.mesh.material.opacity = 0.95 * Math.pow(1 - t, 1.6);
    }

    // Shard stars: hold ~2 frames, then collapse fast while the tips stretch
    // slightly outward, swapping through the 3-frame flipbook as they age.
    for (const burst of this.bursts) {
      if (burst.ttl <= 0) continue;
      burst.ttl -= dtSec;
      if (burst.ttl <= 0) {
        burst.mesh.visible = false;
        burst.mesh.material.opacity = 0;
        continue;
      }
      const t = 1 - burst.ttl / burst.max;
      const stretch = 1 + t * 0.5;
      if (burst.maps) burst.mesh.material.map = burst.maps[Math.min(2, Math.floor(t * 3))];
      burst.mesh.scale.x = burst.size * (burst.jx ?? 1) * stretch;
      burst.mesh.scale.y = burst.size * (burst.jy ?? 1) * stretch;
      burst.mesh.material.opacity = 0.85 * Math.pow(1 - t, 1.7);
    }
    this.spillState.ttl = Math.max(0, this.spillState.ttl - dtSec);

    // Decay flashes.
    for (const flash of this.flashes) {
      if (flash.ttl <= 0) continue;
      flash.ttl -= dtSec;
      if (flash.ttl <= 0) {
        flash.light.intensity = 0;
        flash.light.visible = false;
        continue;
      }
      const t = flash.ttl / flash.max;
      flash.light.intensity = flash.peak * t * t;
    }

    // White-hot pops die hard: full blast for their ~2 frames, then gone.
    for (const pop of this.pops) {
      if (pop.ttl <= 0) continue;
      pop.ttl -= dtSec;
      if (pop.ttl <= 0) {
        pop.light.intensity = 0;
        pop.light.visible = false;
        continue;
      }
      pop.light.intensity = pop.peak * (pop.ttl / pop.max);
    }

    // Ground-reflection pools: swell slightly while fading over ~0.3s.
    for (const groundFlash of this.groundFlashes) {
      if (groundFlash.ttl <= 0) continue;
      groundFlash.ttl -= dtSec;
      if (groundFlash.ttl <= 0) {
        groundFlash.mesh.visible = false;
        groundFlash.mesh.material.opacity = 0;
        continue;
      }
      const t = 1 - groundFlash.ttl / groundFlash.max;
      groundFlash.mesh.scale.setScalar(groundFlash.size * (1 + t * 0.8));
      groundFlash.mesh.material.opacity = 0.32 * (1 - t) * (1 - t);
    }
  }
}
