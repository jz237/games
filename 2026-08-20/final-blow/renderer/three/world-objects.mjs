// 5.1 CINEMA 3D GAMEPLAY READS — projectiles, thrown objects, the stage
// weapon and Post's wire traps as impostor billboards on the fight plane.
//
// Until now the only world pass that drew these lived inside game.js's
// `if (!cinema3dWorld)` block, so a player who toggled CINEMA 3D got hit by
// pizzas, golf balls and canes he could not see, never saw the weapon
// telegraph he was supposed to contest, and walked into wire traps that were
// simply not there. These are sim entities WITH COLLISION; fighting is about
// reads, so the toggle must not delete them.
//
// How: the 2D painters (drawThrowableWith / drawProjectileBodyWith /
// drawPaintTrapWith in game.js) now accept any 2D context, and the host hands
// them over as host.paintProjectile / host.paintTrap. Each live object is
// painted about its own centre into a small offscreen canvas every frame (the
// paintings animate: spin, wobble, the bedbug swarm, the xacto glow, the
// vinyl's rings) and shown as an alpha-blended quad the same size in world
// units — 1 canvas px = 1 sim px at 2x supersample, so the impostor is the
// SAME drawing the 2D canvas shows, never a second art set. The parts of the
// 2D pass that are world-space rather than object-local are rebuilt in 3D:
// the throwable's ground shadow as a floor disc, the travelling light pool
// as an additive floor disc + a real PointLight (so the object also lights
// the fighters and the boards, which the flat pool never could), the mouse's
// trailing cable and the hex charm's ballistic mist tail as line strips.
//
// Depth: objects sit slightly IN FRONT of the fighter plane (OBJECT_Z) —
// the 2D draws them behind the fighters, but in 3D a read must never hide
// behind a body. The CARRIED weapon sits just BEHIND the plane like the 2D
// draw order (drawFighter paints it before the atlas, so the hand covers it).
// Text (the weapon's name tag, combat text) stays on the 2D overlay pass in
// game.js (drawCinema3dOverlayReads). Reads sim state only; writes nothing.
import * as THREE from "three";
import { PX, SIM_FLOOR, worldX, worldY, hash01 } from "./shared.mjs";
import { softDotTexture, canvasTexture } from "./textures.mjs";
// 5.3 SPECTACLE: the same arrival choreography the 2D telegraph draws — the
// object comes off the stairs / the stands / the rail / the counter / a deck
// chair / the lot wall, not straight down out of the sky.
import { getWeaponArrival, weaponArrivalPose } from "../../engine/stage-weapons.mjs";

const SUPERSAMPLE = 2;
const OBJECT_Z = 0.1;
const CARRY_Z = -0.03;
const TRAP_Z = 0.06;
const LIGHT_POOL = 4;
const IMPOSTOR_CAP = 16;
// Floor discs foreshorten ~0.15 at the framing camera's eye height, so a
// disc that must read N sim px tall on screen is ~N/0.15 px deep in world.
const FLOOR_DEPTH = 1.2;
const PLANE = new THREE.PlaneGeometry(1, 1);

// Half-width (sim px about the object's centre) each painter can reach, so
// the impostor canvas never clips a trail, a crook or a ring. Measured by
// replaying every painter over a recording context at 4 clocks x 5 spins
// (scratch harness, 5.1): golf ball trail 35 px on a 22 px ball (-1.51w),
// loogie tail 36 on 30 wide, the cane's gold crook 49 on a 90x16 shaft, the
// cup's straw 73 on 64x78 (the one the first cut clipped), the orb's trail a
// fixed 112 px behind the head plus its 24 px shadow blur, the feedback
// rings 69 on 120x90 plus a 30 px blur.
export function paintExtent(projectile) {
  const w = projectile.width || 40;
  const h = projectile.height || 40;
  const m = Math.max(w, h);
  if (!projectile.throwable) {
    return projectile.style === "feedback" ? m * 0.62 + 44 : Math.max(140, h * 0.55 + 44);
  }
  switch (projectile.style) {
    case "golfball": return w * 1.6 + 8;
    case "loogie": return w * 1.25 + 8;
    case "cane": return w * 0.5 + h * 0.95 + 8;
    case "cup": return h * 0.95 + 8;
    case "vinyl": return w * 0.96 + 8;
    case "xacto": return w * 0.9 + 8;
    case "wires": return w * 0.55 + h * 0.4 + 24;
    default: return m * 0.62 + 12;
  }
}

// One impostor: a canvas, its texture and a quad. Painted per frame.
class Impostor {
  constructor(group, renderOrder) {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.size = 0;
    this.extent = 1;
    this.texture = null;
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // The generic backdrops are lifted for the night grade; the objects
      // stand in front of them under the same treatment (crowd-layer does
      // the same) so a pizza is not dimmer than the wall behind it.
      color: new THREE.Color(1.15, 1.15, 1.15),
    });
    this.mesh = new THREE.Mesh(PLANE, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.used = false;
    group.add(this.mesh);
  }

  // Canvas size buckets: a per-frame upload should not reallocate on every
  // 1px change of extent (spin makes the painter's reach breathe).
  ensure(extentPx) {
    const need = Math.ceil(extentPx * 2 * SUPERSAMPLE);
    const bucket = need <= 128 ? 128 : need <= 256 ? 256 : need <= 384 ? 384 : 512;
    if (bucket !== this.size) {
      this.size = bucket;
      this.canvas.width = bucket;
      this.canvas.height = bucket;
      this.texture?.dispose();
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      // No mip chain: the texture is re-uploaded every frame.
      this.texture.generateMipmaps = false;
      this.texture.minFilter = THREE.LinearFilter;
      this.texture.magFilter = THREE.LinearFilter;
      this.material.map = this.texture;
      this.material.needsUpdate = true;
    }
    return bucket;
  }

  paint(extentPx, painter) {
    const size = this.ensure(extentPx);
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, size, size);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.shadowBlur = 0;
    c.setLineDash([]);
    // sim px -> canvas px, origin at the centre (the painters draw about 0,0).
    const s = size / (extentPx * 2);
    c.setTransform(s, 0, 0, s, size * 0.5, size * 0.5);
    c.save();
    painter(c);
    c.restore();
    this.texture.needsUpdate = true;
    this.extent = extentPx;
  }

  place(simX, simY, z, mirror = 1, alpha = 1) {
    const side = this.extent * 2 * PX;
    this.mesh.position.set(worldX(simX), worldY(simY), z);
    this.mesh.scale.set(side * mirror, side, 1);
    this.material.opacity = alpha;
    this.mesh.visible = true;
    this.used = true;
  }

  dispose(group) {
    group.remove(this.mesh);
    this.material.dispose();
    this.texture?.dispose();
  }
}

// Flat floor disc (shadow / light pool): PlaneGeometry lies in xy, so the
// -PI/2 x-rotation puts its local y along world -z (depth).
function floorDisc(texture, color, blending, renderOrder) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending,
    color,
    opacity: 0,
  });
  const mesh = new THREE.Mesh(PLANE, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

function lineStrip(points, blending = THREE.NormalBlending) {
  const positions = new Float32Array(points * 3);
  const colors = new Float32Array(points * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending,
  }));
  line.frustumCulled = false;
  line.renderOrder = 3;
  line.visible = false;
  return line;
}

export class WorldObjectsLayer {
  constructor(host) {
    this.host = host;
    this.group = new THREE.Group();
    this.group.name = "world-objects";
    this.impostors = new Map();
    this.visibleCount = 0;
    this.lastKinds = { projectiles: 0, traps: 0, weapon: null, carried: 0 };
    this.shadowTexture = softDotTexture(64, "rgba(0,0,0,1)", "rgba(0,0,0,0)");
    this.glowTexture = softDotTexture(64);
    this.shadows = [];
    this.pools = [];
    this.lights = [];
    for (let i = 0; i < LIGHT_POOL; i += 1) {
      // Modest and short: at ~1 unit from a sprite a bright light blows the
      // body to white through ACES + bloom; the object's own painting is
      // the read, the light only kisses the boards and the near fighter.
      const light = new THREE.PointLight(0xffffff, 0, 2.6, 2);
      // ALWAYS visible at intensity 0 when idle: three keys every lit
      // material's program on the visible light COUNT, so toggling these
      // would compile a new shader variant for the sprites and the stage on
      // the first pizza of the round (a hitch), and again per count. A
      // constant count costs one compile at init and nothing after.
      light.visible = true;
      light.intensity = 0;
      this.group.add(light);
      this.lights.push(light);
    }
    this.cable = lineStrip(9);
    this.group.add(this.cable);
    this.charmTail = lineStrip(10, THREE.AdditiveBlending);
    this.group.add(this.charmTail);
    // Stage-weapon telegraph: the ground scorch (MOTION FIX 9's burn patch,
    // not a clean vector ring) and the incoming-drop streak.
    this.scorch = floorDisc(this.scorchTexture(), new THREE.Color(1, 1, 1), THREE.AdditiveBlending, 2);
    this.group.add(this.scorch);
    this.streak = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({
        map: this.streakTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
        side: THREE.DoubleSide,
      }),
    );
    this.streak.renderOrder = 3;
    this.streak.frustumCulled = false;
    this.streak.visible = false;
    this.group.add(this.streak);
  }

  // Warm irregular burn patch with ragged charred flecks, painted once.
  scorchTexture() {
    return canvasTexture(128, 128, (c, w, h) => {
      const cx = w * 0.5;
      const cy = h * 0.5;
      const reach = w * 0.46;
      const scorch = c.createRadialGradient(cx, cy, 2, cx, cy, reach);
      scorch.addColorStop(0, "rgba(255,213,74,0.55)");
      scorch.addColorStop(0.55, "rgba(214,142,38,0.28)");
      scorch.addColorStop(1, "rgba(120,70,18,0)");
      c.fillStyle = scorch;
      c.beginPath();
      c.arc(cx, cy, reach, 0, Math.PI * 2);
      c.fill();
      c.lineCap = "round";
      for (let fleck = 0; fleck < 9; fleck += 1) {
        const angle = fleck * 0.7 + hash01(fleck * 3 + 1) * 0.8;
        const radius = reach * (0.45 + hash01(fleck * 7 + 11) * 0.5);
        c.globalAlpha = 0.5 + (fleck % 3) * 0.18;
        c.strokeStyle = fleck % 2 ? "#c98a2e" : "#3a2c16";
        c.lineWidth = 3 + (fleck % 3);
        c.beginPath();
        c.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        c.lineTo(cx + Math.cos(angle) * (radius + 9), cy + Math.sin(angle) * (radius + 9));
        c.stroke();
      }
    }, { srgb: true });
  }

  streakTexture() {
    return canvasTexture(16, 128, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(255,213,74,0)");
      g.addColorStop(1, "rgba(255,213,74,0.55)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }, { srgb: true });
  }

  impostor(key, renderOrder = 3) {
    let entry = this.impostors.get(key);
    if (!entry) {
      entry = new Impostor(this.group, renderOrder);
      this.impostors.set(key, entry);
    }
    return entry;
  }

  disc(list, index, texture, blending, renderOrder) {
    if (!list[index]) {
      list[index] = floorDisc(texture, new THREE.Color(0xffffff), blending, renderOrder);
      this.group.add(list[index]);
    }
    return list[index];
  }

  update(state, dtSec, timeSec) {
    const host = this.host;
    const timeMs = timeSec * 1000;
    for (const entry of this.impostors.values()) {
      entry.used = false;
      entry.mesh.visible = false;
    }
    for (const mesh of this.shadows) mesh.visible = false;
    for (const mesh of this.pools) mesh.visible = false;
    for (const light of this.lights) light.intensity = 0;
    this.cable.visible = false;
    this.charmTail.visible = false;
    this.scorch.visible = false;
    this.streak.visible = false;
    let shown = 0;
    const shadowsOn = state.performance?.shadows !== false;
    const reducedMotion = Boolean(state.accessibility?.reducedMotion);
    const trailScale = state.performance?.trailScale ?? 1;

    // --- Projectiles + thrown objects ------------------------------------
    const projectiles = state.projectiles || [];
    let lightIndex = 0;
    let discIndex = 0;
    projectiles.forEach((projectile, index) => {
      if (!host.paintProjectile) return;
      const direction = Math.sign(projectile.vx) || projectile.direction || 1;
      const life = projectile.maxLifeFrames
        ? THREE.MathUtils.clamp(projectile.lifeFrames / projectile.maxLifeFrames, 0, 1) : 1;
      const entry = this.impostor(projectile.id || `projectile-${index}`);
      entry.paint(paintExtent(projectile), (c) => host.paintProjectile(c, projectile, timeMs, { cable: false }));
      entry.place(projectile.x, projectile.y, OBJECT_Z, direction, 1);
      shown += 1;
      const wx = worldX(projectile.x);
      // Ground shadow under a thrown object, so the arc and landing point read.
      if (projectile.throwable) {
        const shadow = this.disc(this.shadows, discIndex, this.shadowTexture, THREE.NormalBlending, 5);
        const rx = (projectile.width || 40) * 0.34 * 1.3;
        shadow.position.set(wx, 0.006, OBJECT_Z);
        shadow.scale.set(rx * 2 * PX, rx * 2 * PX * FLOOR_DEPTH * 0.55, 1);
        shadow.material.opacity = 0.5 * Math.min(1, life * 2.2);
        shadow.visible = true;
      }
      // Travelling light pool (wave 4 parity): the additive floor glow AND a
      // real point light that brightens as the object flies lower.
      if (shadowsOn && projectile.y < SIM_FLOOR + 4) {
        const height = Math.max(0, SIM_FLOOR - projectile.y);
        const closeness = THREE.MathUtils.clamp(1 - height / 620, 0.25, 1);
        const pulse = 1 + Math.sin(timeMs * 0.018 + projectile.x * 0.03) * 0.11;
        const reach = ((projectile.width || 44) * 1.6 + 52) * (0.8 + closeness * 0.4);
        const color = /^#[0-9a-fA-F]{6}/.test(projectile.color || "") ? projectile.color : "#ffe9b8";
        const glowAlpha = THREE.MathUtils.clamp(0.42 * closeness * Math.min(1, life * 2) * pulse, 0, 0.55);
        const pool = this.disc(this.pools, discIndex, this.glowTexture, THREE.AdditiveBlending, 2);
        pool.material.color.set(color);
        pool.position.set(wx, 0.004, OBJECT_Z);
        pool.scale.set(reach * 2 * PX, reach * 2 * PX * FLOOR_DEPTH * 0.5, 1);
        pool.material.opacity = glowAlpha;
        pool.visible = true;
        if (lightIndex < LIGHT_POOL) {
          const light = this.lights[lightIndex];
          lightIndex += 1;
          light.color.set(color);
          light.position.set(wx, Math.max(0.15, worldY(projectile.y)), 0.55);
          light.intensity = 2.4 * closeness * Math.min(1, life * 2) * pulse;
        }
      }
      discIndex += 1;
      // The mouse's cable trails back to the thrower (world-space geometry
      // the painter skipped via cable:false).
      if (projectile.style === "mouse" && !this.cable.visible) {
        const owner = state.fighters?.[projectile.ownerSide];
        if (owner) this.cableTo(projectile, owner, timeMs);
      }
      // MOTION FIX 10 parity: the hex charm's mist tail integrated BACKWARD
      // along the exact ballistic path it just travelled.
      if (projectile.throwable && projectile.style === "charm" && !reducedMotion && trailScale > 0
        && !this.charmTail.visible) {
        this.charmTailFor(projectile, life);
      }
    });

    // --- Stage weapon: telegraph / ground / carried --------------------------
    const weapon = state.stageWeapon;
    const profile = weapon && host.stageWeaponProfile ? host.stageWeaponProfile() : null;
    const fighterScale = host.fighterScale ?? 1.14;
    if (profile && weapon && (weapon.phase === "telegraph" || weapon.phase === "ground")) {
      const telegraphing = weapon.phase === "telegraph";
      const progress = telegraphing
        ? THREE.MathUtils.clamp(weapon.frames / Math.max(1, profile.telegraphFrames), 0, 1) : 1;
      const remaining = telegraphing
        ? 1 : 1 - THREE.MathUtils.clamp(weapon.frames / Math.max(1, profile.groundFrames), 0, 1);
      const markPulse = telegraphing
        ? 0.35 + 0.4 * Math.abs(Math.sin(timeMs * 0.012)) : 0.28 + remaining * 0.3;
      const markReach = 46 * fighterScale * (telegraphing ? 0.6 + progress * 0.6 : 1);
      const wx = worldX(weapon.x);
      this.scorch.position.set(wx, 0.005, 0.02);
      this.scorch.scale.set(markReach * 2.2 * PX, markReach * 2.2 * PX * FLOOR_DEPTH * 0.45, 1);
      this.scorch.material.opacity = markPulse * 0.85;
      this.scorch.visible = true;
      // 5.3: the vertical drop-streak only survives on a stage with no
      // arrival choreography (there are none shipped) — otherwise the object
      // travels its own path and the streak would contradict it.
      const arrival = getWeaponArrival(weapon.stageId);
      const pose = telegraphing
        ? weaponArrivalPose(weapon.stageId, weapon.x, progress, { floor: SIM_FLOOR })
        : { x: weapon.x, y: SIM_FLOOR, angle: 0 };
      if (telegraphing && !arrival) {
        this.streak.position.set(wx, 20 * PX, 0.03);
        this.streak.scale.set(7 * PX, 170 * PX, 1);
        this.streak.material.opacity = 0.5 * markPulse;
        this.streak.visible = true;
      }
      const drop = telegraphing ? 0 : Math.sin(timeMs * 0.006) * 2;
      const descriptor = {
        throwable: true,
        style: profile.style,
        width: profile.width * fighterScale,
        height: profile.height * fighterScale,
        spinAngle: telegraphing ? pose.angle : 0,
        vx: 1,
        vy: 0,
        color: "#ffd54a",
        ownerSide: -1,
        hazard: false,
      };
      const entry = this.impostor("stage-weapon");
      entry.paint(paintExtent(descriptor) + 8, (c) => {
        host.paintProjectile(c, descriptor, timeMs);
        if (profile.glint) {
          c.globalCompositeOperation = "screen";
          c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(timeMs * 0.02));
          c.strokeStyle = "#ffffff";
          c.lineWidth = 2;
          for (const angle of [0, Math.PI / 2]) {
            c.beginPath();
            c.moveTo(Math.cos(angle) * -22, Math.sin(angle) * -22);
            c.lineTo(Math.cos(angle) * 22, Math.sin(angle) * 22);
            c.stroke();
          }
        }
      });
      entry.place(pose.x, pose.y - profile.height * 0.5 * fighterScale + drop, OBJECT_Z, 1,
        telegraphing ? Math.min(1, progress * 4) : 1);
      shown += 1;
    }
    let carried = 0;
    if (profile) {
      for (const fighter of state.fighters || []) {
        if (!fighter.carriedWeapon) continue;
        const facing = fighter.facing >= 0 ? 1 : -1;
        const descriptor = {
          throwable: true,
          style: profile.style,
          width: profile.width * fighterScale,
          height: profile.height * fighterScale,
          spinAngle: 0.4,
          vx: 1,
          vy: 0,
          color: "#ffd54a",
          ownerSide: -1,
          hazard: false,
        };
        const entry = this.impostor(`carry-${fighter.side}`);
        entry.paint(paintExtent(descriptor), (c) => host.paintProjectile(c, descriptor, timeMs));
        // The 2D hand offset (52, -150) x FIGHTER_SCALE in the mirrored
        // fighter frame, dropped with the crouch like the sprite is.
        entry.place(
          fighter.x + facing * 52 * fighterScale,
          fighter.y - 150 * fighterScale + (fighter.crouch ? 21 : 0),
          CARRY_Z, facing, 1,
        );
        shown += 1;
        carried += 1;
      }
    }

    // --- Post's wire traps ----------------------------------------------------
    const traps = state.traps || [];
    traps.forEach((trap, index) => {
      if (!host.paintTrap) return;
      const armed = trap.armFrames <= 0;
      const life = THREE.MathUtils.clamp(trap.lifeFrames / Math.max(1, trap.maxLifeFrames), 0, 1);
      const pulse = 1 + Math.sin(timeMs * 0.009 + trap.x * 0.02) * 0.08;
      const entry = this.impostor(trap.id || `trap-${index}`);
      entry.paint(trap.radius * 1.1 + 28, (c) => host.paintTrap(c, trap, timeMs));
      // Centred on the floor point: the half below the boards clips against
      // the ground plane's depth, the can and the pulse ring stand on it.
      entry.place(trap.x, trap.y ?? SIM_FLOOR, TRAP_Z, 1, 1);
      shown += 1;
      // The paint pool itself lies ON the floor in the trap's colour — the
      // real hazard footprint, brighter once armed.
      const pool = this.disc(this.pools, discIndex, this.glowTexture, THREE.AdditiveBlending, 2);
      discIndex += 1;
      pool.material.color.set(trap.color || "#ff3fbf");
      pool.position.set(worldX(trap.x), 0.004, TRAP_Z);
      const rx = trap.radius * 0.86 * pulse;
      pool.scale.set(rx * 2 * PX, rx * 2 * PX * FLOOR_DEPTH * 0.5, 1);
      pool.material.opacity = Math.min(1, life * 1.8) * (armed ? 0.5 : 0.3);
      pool.visible = true;
    });

    // Retire impostors that went unused (an object that landed, a trap that
    // fired) once the pool grows past its cap, so an arcade ladder's worth of
    // ids never accumulates canvases.
    if (this.impostors.size > IMPOSTOR_CAP) {
      for (const [key, entry] of this.impostors) {
        if (entry.used) continue;
        entry.dispose(this.group);
        this.impostors.delete(key);
      }
    }
    this.visibleCount = shown;
    this.lastKinds = {
      projectiles: projectiles.length,
      traps: traps.length,
      weapon: profile && weapon ? weapon.phase : null,
      carried,
    };
  }

  cableTo(projectile, owner, timeMs) {
    const positions = this.cable.geometry.attributes.position;
    const colors = this.cable.geometry.attributes.color;
    const count = positions.count;
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const x = projectile.x + (owner.x - projectile.x) * t;
      const y = projectile.y + Math.sin(t * Math.PI * 2 + timeMs * 0.02) * 9 * (1 - t);
      positions.setXYZ(i, worldX(x), worldY(y), OBJECT_Z - 0.01);
      colors.setXYZ(i, 0.54, 0.58, 0.65);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    this.cable.visible = true;
  }

  charmTailFor(projectile, life) {
    const positions = this.charmTail.geometry.attributes.position;
    const colors = this.charmTail.geometry.attributes.color;
    const gravity = projectile.gravity ?? 1200;
    const count = positions.count;
    for (let step = 0; step < count; step += 1) {
      const dtBack = step * 0.055;
      const x = projectile.x - (projectile.vx || 0) * dtBack;
      const y = projectile.y - (projectile.vy || 0) * dtBack + 0.5 * gravity * dtBack * dtBack;
      const fade = (1 - step / count) * Math.min(1, life * 2.2);
      positions.setXYZ(step, worldX(x), worldY(y), OBJECT_Z - 0.01);
      // Pine mist: bright green at the head cooling to nothing along the arc.
      colors.setXYZ(step, 0.55 * fade, 1.0 * fade, 0.37 * fade);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    this.charmTail.visible = true;
  }

  dispose() {
    for (const entry of this.impostors.values()) entry.dispose(this.group);
    this.impostors.clear();
    for (const mesh of [...this.shadows, ...this.pools, this.scorch, this.streak]) {
      this.group.remove(mesh);
      mesh.material.map?.dispose?.();
      mesh.material.dispose();
    }
    this.streak.geometry.dispose();
    for (const line of [this.cable, this.charmTail]) {
      line.geometry.dispose();
      line.material.dispose();
    }
    this.shadowTexture.dispose();
    this.glowTexture.dispose();
  }
}
