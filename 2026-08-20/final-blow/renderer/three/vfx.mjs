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
import { softDotTexture, ringTexture } from "./textures.mjs";

const MAX_SPARKS = 240;
const MAX_EMBERS = 64;
const FLASH_POOL = 3;
const RING_POOL = 2;

// Light intensities are deliberately small: at ~1 unit from a sprite even 10
// blows the character to white through ACES+bloom. The visual "pop" comes
// from the core/halo sprites; the light only kisses nearby surfaces.
// `kick` is the presentation-only camera shake budget in screen pixels.
const TIER_STYLE = {
  blocked: { color: 0x9fd8ff, intensity: 1.6, sparks: 12, embers: 4, speed: 1.8, core: 0.3, ring: false, kick: 1.2 },
  light: { color: 0xffd9a0, intensity: 3, sparks: 16, embers: 8, speed: 2.4, core: 0.4, ring: false, kick: 1.8 },
  heavy: { color: 0xffb36b, intensity: 5.5, sparks: 30, embers: 11, speed: 3.4, core: 0.56, ring: true, kick: 3 },
  special: { color: 0xffc46b, intensity: 7, sparks: 42, embers: 12, speed: 4, core: 0.66, ring: true, kick: 3 },
  super: { color: 0xfff0c0, intensity: 9, sparks: 58, embers: 14, speed: 5, core: 0.8, ring: true, kick: 3.4 },
  weapon: { color: 0xffe08a, intensity: 6, sparks: 34, embers: 11, speed: 3.7, core: 0.58, ring: true, kick: 3 },
  throw: { color: 0xd8c8ff, intensity: 4, sparks: 20, embers: 8, speed: 2.9, core: 0.44, ring: false, kick: 2.2 },
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

    // Expanding shockwave rings (heavy tiers): thin, fast, camera-facing.
    this.rings = [];
    for (let i = 0; i < RING_POOL; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: ringTexture(128),
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
      this.rings.push({ mesh, ttl: 0, max: 0.28, size: 1 });
    }

    // Flash-light pool. Intensities are budgeted: the pop reads from the core
    // sprite; the light only kisses the scene surfaces around the impact.
    this.flashes = [];
    for (let i = 0; i < FLASH_POOL; i += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 6, 2);
      light.visible = false;
      this.group.add(light);
      this.flashes.push({ light, ttl: 0, max: 1, peak: 0, level: 0 });
    }
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
      // Molten orange, hot enough to bloom at birth, cooling to deep ember.
      const heat = 1.4 + this.rand() * 1.2;
      this.emberColors[base] = 1.0 * heat * 2.1;
      this.emberColors[base + 1] = 0.52 * heat * 1.6;
      this.emberColors[base + 2] = 0.14 * heat;
      this.emberMaxLife[index] = 0.42 + this.rand() * 0.34;
      this.emberLife[index] = this.emberMaxLife[index];
    }
  }

  fireFlash(x, y, style, counter) {
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
    // Hot white centre, coloured halo — layered, not one smear. The core is
    // pushed well past the bloom threshold: for its ~2 frames of life it is
    // deliberately the brightest thing on screen.
    core.core.material.color.set(0xffffff).multiplyScalar(4.5);
    core.halo.material.color.set(style.color).multiplyScalar(1.7);
    core.core.position.set(x, y, 0.32);
    core.halo.position.set(x, y, 0.3);
    core.size = style.core ?? 0.5;
    core.max = style.tier === "super" ? 0.24 : 0.17;
    core.ttl = core.max;
    core.core.scale.setScalar(core.size * 0.6);
    core.halo.scale.setScalar(core.size * 1.25);
    core.core.material.opacity = 1;
    core.halo.material.opacity = 0.5;
    core.core.visible = core.halo.visible = true;

    if (style.ring) {
      // Tight expanding shockwave ring: ~150ms, additive, fades as it grows.
      // Thin band texture — reads as a pressure wave, never a soap bubble.
      const ring = this.rings.find((r) => r.ttl <= 0) || this.rings[0];
      ring.mesh.material.color.set(style.color).lerp(new THREE.Color(0xffffff), 0.55).multiplyScalar(2.1);
      ring.mesh.position.set(x, y, 0.34);
      ring.size = style.tier === "super" ? 2.1 : 1.55;
      ring.max = 0.19;
      ring.ttl = ring.max;
      ring.mesh.scale.setScalar(0.18);
      ring.mesh.material.opacity = 0.95;
      ring.mesh.visible = true;
    }

    // Presentation camera kick (2-3px) beside the sim's own hit-stop.
    this.kickMag = style.kick ?? 2;
    this.kickTtl = this.kickMax;
  }

  update(state, dtSec) {
    // Drain latched hits into world-space effects.
    for (const payload of this.pending) {
      const tier = payload.blocked ? "blocked" : (TIER_STYLE[payload.kind] ? payload.kind : "light");
      const style = { ...TIER_STYLE[tier], tier };
      const x = worldX(payload.x);
      const y = worldY(payload.y);
      const custom = this.customEffects.get(tier);
      if (custom) custom({ ...payload, worldX: x, worldY: y }, this);
      else {
        this.fireFlash(x, y, style, payload.counter);
        this.spawnSparks(x, y, style, payload.direction >= 0 ? 1 : -1, payload.counter);
        this.spawnEmbers(x, y, style, payload.direction >= 0 ? 1 : -1, payload.counter);
      }
    }
    this.pending.length = 0;
    this.kickTtl = Math.max(0, this.kickTtl - dtSec);

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
      core.core.scale.setScalar(core.size * (0.55 + t * 0.5));
      core.halo.scale.setScalar(core.size * (1.5 + t * 1.3));
      core.core.material.opacity = 0.9 * (1 - t) * (1 - t);
      core.halo.material.opacity = 0.38 * (1 - t);
    }

    // Expand + fade shockwave rings.
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
      ring.mesh.scale.setScalar(0.18 + eased * ring.size);
      // Fades as it grows: bright birth, gone by full expansion.
      ring.mesh.material.opacity = 0.95 * Math.pow(1 - t, 1.5);
    }

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
  }
}
