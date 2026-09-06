// 5.3 SPECTACLE (#47) — CINEMA 3D effect parity.
//
// Three whole effect families were SIMULATED every frame and then thrown away
// the moment the 3D world was on:
//   - the elemental flipbooks (assets/vfx: flame / electric / curse / vinyl /
//     cash / paint / smoke / spark / glyph / paper / feather / debris), up to
//     ~190 sprites integrated by updateElementalVfx before the renderer
//     handoff, drawn only by the 2D drawElementalVfx;
//   - the charging limb glow that tells you a special is coming;
//   - the 25-kind particle pool (blood, gore fragments, debris chips, shock
//     rings, dust, sweat), of which 3D had exactly three dust latches.
// A curse special in 3D was a green-tinted spark burst. This layer draws all
// three, from the SAME pool the canvas draws, through the same frame-pick and
// fade math (engine/vfx-bridge.mjs).
//
// Budget (the reason this is one layer and not four):
//   - one InstancedMesh per LIVE element sheet — typically 1-3 at a time,
//     never more than the sheets a kit names (4);
//   - one Points cloud for every mirrored particle, whatever the kind;
//   - up to 3 ring quads for the shockwave kinds;
//   - 2 additive charge sprites + 2 point lights (one per side).
// So a super with two elements and a full particle pool is ~8 draw calls.
//
// Everything is a READ of already-integrated presentation state: this layer
// never simulates, never latches and never touches sim state, so it is
// rollback-proof by construction (nothing to rewind).
import * as THREE from "three";
import { PX, SIM_H, worldX, worldY } from "./shared.mjs";
import { softDotTexture, ringTexture } from "./textures.mjs";
import { FIGHTER_MASK_LAYER } from "./post.mjs";
import {
  chargeGlowAlpha,
  chargeGlowRadius,
  elementFrameIndex,
  elementSpriteAlpha,
  particleChannel,
  particleMote,
} from "../../engine/vfx-bridge.mjs";

const SPRITES_PER_SHEET = 96;
const MAX_MOTES = 220;
const MAX_RINGS = 3;
// Element sprites and mirrored motes sit just in front of the fight plane so
// they never z-fight the sprites they decorate.
const FX_Z = 0.12;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// The mirrored particle cloud needs PER-POINT alpha (a fading blood mote must
// go transparent, not black — a black dot on a lit buffet plate is worse than
// no mote at all), which PointsMaterial cannot do. One tiny shader instead,
// still one draw call for the whole pool.
// aSize is the mote's DIAMETER in world units; projectionMatrix[1][1] is
// 1/tan(fov/2), so the pixel size tracks the framing camera's live zoom for
// free (a punch-in grows the motes with everything else).
const MOTE_VERT = `
attribute float aAlpha;
attribute float aSize;
uniform float uHalfHeight;
varying vec3 vMoteColor;
varying float vMoteAlpha;
void main() {
  vMoteColor = color;
  vMoteAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, aSize * projectionMatrix[1][1] * uHalfHeight / max(0.05, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const MOTE_FRAG = `
uniform sampler2D uDot;
varying vec3 vMoteColor;
varying float vMoteAlpha;
void main() {
  float mask = texture2D(uDot, gl_PointCoord).a;
  float a = mask * vMoteAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vMoteColor, a);
}`;

// One instanced quad mesh per element sheet. Per-instance: the cell's uv rect
// (the manifest's trimmed frame box, so a 44x88 flame costs 44x88 of quad,
// not a 256px cell of mostly-empty alpha), the alpha and the blend weight.
const SPRITE_VERT = `
attribute vec4 aUvRect;
attribute float aAlpha;
varying vec2 vFxUv;
varying float vFxAlpha;
void main() {
  vFxUv = aUvRect.xy + uv * aUvRect.zw;
  vFxAlpha = aAlpha;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const SPRITE_FRAG = `
uniform sampler2D uSheet;
varying vec2 vFxUv;
varying float vFxAlpha;
void main() {
  vec4 texel = texture2D(uSheet, vFxUv);
  if (texel.a * vFxAlpha < 0.01) discard;
  gl_FragColor = vec4(texel.rgb, texel.a * vFxAlpha);
}`;

class SheetMesh {
  constructor(name, sheet, additive) {
    this.name = name;
    this.additive = additive;
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.uvRect = new THREE.InstancedBufferAttribute(new Float32Array(SPRITES_PER_SHEET * 4), 4);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(SPRITES_PER_SHEET), 1);
    this.uvRect.setUsage(THREE.DynamicDrawUsage);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aUvRect", this.uvRect);
    geometry.setAttribute("aAlpha", this.alpha);
    const texture = new THREE.Texture(sheet.image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    this.texture = texture;
    const material = new THREE.ShaderMaterial({
      uniforms: { uSheet: { value: texture } },
      vertexShader: SPRITE_VERT,
      fragmentShader: SPRITE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, SPRITES_PER_SHEET);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.width = sheet.image.naturalWidth || sheet.image.width || 1;
    this.height = sheet.image.naturalHeight || sheet.image.height || 1;
    this.cursor = 0;
  }

  begin() {
    this.cursor = 0;
  }

  // `frame` is the manifest's trimmed box for the cell: x/y/w/h in sheet px,
  // cx/cy the cell's anchor. The quad is placed so the anchor lands on the
  // particle, which is exactly what the 2D drawImage call does.
  push(matrix, frame, alpha) {
    if (this.cursor >= SPRITES_PER_SHEET) return;
    const i = this.cursor;
    this.mesh.setMatrixAt(i, matrix);
    this.uvRect.setXYZW(i,
      frame.x / this.width,
      1 - (frame.y + frame.h) / this.height,
      frame.w / this.width,
      frame.h / this.height);
    this.alpha.setX(i, alpha);
    this.cursor += 1;
  }

  end() {
    this.mesh.count = this.cursor;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.uvRect.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.mesh.visible = this.cursor > 0;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}

export class EffectsLayer {
  constructor(host) {
    this.host = host;
    this.group = new THREE.Group();
    this.group.name = "effects";
    this.sheets = new Map();
    this.scratch = new THREE.Matrix4();
    this.scratchQ = new THREE.Quaternion();
    this.scratchPos = new THREE.Vector3();
    this.scratchScale = new THREE.Vector3();
    this.scratchColor = new THREE.Color();

    // Mirrored 2D particle pool: one soft cloud (dust, blood, gore, debris)
    // — the sim already integrated every one of them this tick, so 3D copies
    // positions rather than running a second simulation that could drift.
    this.motePositions = new Float32Array(MAX_MOTES * 3);
    this.moteColors = new Float32Array(MAX_MOTES * 3);
    this.moteAlphas = new Float32Array(MAX_MOTES);
    this.moteSizes = new Float32Array(MAX_MOTES);
    this.dotTexture = softDotTexture(48);
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute("position", new THREE.BufferAttribute(this.motePositions, 3));
    moteGeometry.setAttribute("color", new THREE.BufferAttribute(this.moteColors, 3));
    moteGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.moteAlphas, 1));
    moteGeometry.setAttribute("aSize", new THREE.BufferAttribute(this.moteSizes, 1));
    this.motes = new THREE.Points(moteGeometry, new THREE.ShaderMaterial({
      uniforms: { uDot: { value: this.dotTexture }, uHalfHeight: { value: SIM_H * 0.5 } },
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
    }));
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 6;
    this.group.add(this.motes);

    // Shockwave rings (shockRing / goreShockwave / wallShock / floorImpact).
    this.ringTexture = ringTexture(192);
    this.rings = [];
    for (let index = 0; index < MAX_RINGS; index += 1) {
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        map: this.ringTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      }));
      ring.frustumCulled = false;
      ring.renderOrder = 6;
      ring.visible = false;
      this.rings.push(ring);
      this.group.add(ring);
    }

    // The charging limb: an additive halo the size of the 2D gradient plus a
    // real point light, so the charge relights the body it grows on.
    this.chargeTexture = softDotTexture(128);
    this.charges = [0, 1].map(() => {
      const sprite = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        map: this.chargeTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      }));
      sprite.frustumCulled = false;
      sprite.renderOrder = 7;
      sprite.visible = false;
      this.group.add(sprite);
      const light = new THREE.PointLight(0xffffff, 0, 3.2, 2);
      light.visible = false;
      this.group.add(light);
      return { sprite, light };
    });

    // The painterly stage pass renders the fighter-mask layer alone; joining
    // it keeps these effects at sprite-grade edge snap instead of smeared.
    this.group.traverse((node) => {
      if (node.isMesh || node.isPoints) node.layers.enable(FIGHTER_MASK_LAYER);
    });

    // QA tallies (renderer.stats().effects).
    this.report = { sprites: 0, sheets: 0, motes: 0, rings: 0, charges: 0 };
  }

  sheetMesh(name, sheet, additive) {
    let entry = this.sheets.get(name);
    if (!entry) {
      entry = new SheetMesh(name, sheet, additive);
      entry.mesh.layers.enable(FIGHTER_MASK_LAYER);
      this.sheets.set(name, entry);
      this.group.add(entry.mesh);
    }
    return entry;
  }

  updateElementSprites(state) {
    const host = this.host;
    const particles = host.elementSprites ? host.elementSprites() : null;
    for (const entry of this.sheets.values()) entry.begin();
    let drawn = 0;
    if (particles && host.elementSheet) {
      const tick = state.simulationTick || 0;
      for (const particle of particles) {
        const sheet = host.elementSheet(particle.sheet);
        if (!sheet) continue;
        const index = elementFrameIndex(sheet.meta, particle, tick);
        const frame = sheet.meta.frames?.[index];
        if (!frame || !frame.w) continue;
        const alpha = elementSpriteAlpha(particle);
        if (alpha <= 0.01) continue;
        const entry = this.sheetMesh(particle.sheet, sheet, Boolean(particle.additive));
        // The 2D pass grows a rising smoke puff to ~1.55x over its life.
        const age = 1 - Math.max(0, Math.min(1, particle.life / particle.max));
        const growth = particle.shearDir ? 1 + age * 0.55 : 1;
        const scale = (particle.size * growth) / Math.max(frame.w, frame.h);
        // Anchor offset: the manifest's cx/cy is where the particle point sits
        // inside the trimmed box, which the 2D drawImage subtracts the same way.
        const anchorX = (frame.w * 0.5 - (frame.cx - frame.x)) * scale;
        const anchorY = (frame.h * 0.5 - (frame.cy - frame.y)) * scale;
        const rot = particle.rotation || 0;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        // The quad's CENTRE in the rotated canvas frame (the 2D pass places
        // its top-left at -(cx-fx)*scale, -(cy-fy)*scale and draws w x h from
        // there), rotated back into sim space by the canvas convention.
        this.scratchPos.set(
          worldX(particle.x + anchorX * cos - anchorY * sin),
          worldY(particle.y + anchorX * sin + anchorY * cos),
          FX_Z,
        );
        // Canvas rotations are y-down; three's z rotation is y-up.
        this.scratchQ.setFromAxisAngle(Z_AXIS, -rot);
        this.scratchScale.set(frame.w * scale * PX, frame.h * scale * PX, 1);
        this.scratch.compose(this.scratchPos, this.scratchQ, this.scratchScale);
        entry.push(this.scratch, frame, alpha);
        drawn += 1;
      }
    }
    let liveSheets = 0;
    for (const entry of this.sheets.values()) {
      entry.end();
      if (entry.mesh.count > 0) liveSheets += 1;
    }
    this.report.sprites = drawn;
    this.report.sheets = liveSheets;
  }

  updateCharges(state) {
    const host = this.host;
    let live = 0;
    for (let side = 0; side < 2; side += 1) {
      const { sprite, light } = this.charges[side];
      const charge = host.elementCharge ? host.elementCharge(side) : null;
      if (!charge) {
        sprite.visible = false;
        light.visible = false;
        continue;
      }
      const radius = chargeGlowRadius(charge.level, charge.tier, state.simulationTick || 0, side);
      const alpha = chargeGlowAlpha(charge.level, charge.tier);
      this.scratchColor.set(charge.core || "#ffe9bd");
      sprite.material.color.copy(this.scratchColor);
      sprite.material.opacity = Math.min(1, alpha * 2.4);
      sprite.position.set(worldX(charge.x), worldY(charge.y), FX_Z);
      sprite.scale.set(radius * 2 * PX, radius * 2 * PX, 1);
      sprite.visible = true;
      light.color.set(charge.glow || "#ffe9bd");
      light.position.set(worldX(charge.x), worldY(charge.y), 0.4);
      // Small on purpose: at ~0.4 units from a sprite even 6 blows the body
      // to white through ACES + bloom. The read is the halo; the light kisses.
      light.intensity = 0.9 + charge.level * (charge.tier === 2 ? 3.2 : 1.8);
      light.visible = true;
      live += 1;
    }
    this.report.charges = live;
  }

  updateParticles(state) {
    const particles = state.particles || [];
    let motes = 0;
    let rings = 0;
    for (const particle of particles) {
      const channel = particleChannel(particle.kind);
      if (channel === "skip") continue;
      if (channel === "ring") {
        if (rings >= MAX_RINGS) continue;
        const ring = this.rings[rings];
        const alpha = Math.max(0, Math.min(1, particle.life / particle.max));
        const size = Math.max(8, particle.size || 40) * (1 + (1 - alpha) * 1.4);
        ring.position.set(worldX(particle.x), worldY(particle.y), FX_Z);
        ring.scale.set(size * 2 * PX, size * 2 * PX, 1);
        ring.material.color.set(particle.color || "#ffffff");
        ring.material.opacity = alpha * 0.55;
        ring.visible = true;
        rings += 1;
        continue;
      }
      if (motes >= MAX_MOTES) continue;
      const mote = particleMote(particle);
      if (mote.alpha <= 0.02) continue;
      const i = motes * 3;
      this.motePositions[i] = worldX(particle.x);
      this.motePositions[i + 1] = worldY(particle.y);
      this.motePositions[i + 2] = FX_Z;
      this.scratchColor.set(particle.color || "#c8c0b4");
      // Spark-class motes burn above 1 so bloom picks them up; everything
      // else keeps its own colour and fades on the alpha attribute.
      const hot = mote.additive ? 2.2 : 1;
      this.moteColors[i] = this.scratchColor.r * hot;
      this.moteColors[i + 1] = this.scratchColor.g * hot;
      this.moteColors[i + 2] = this.scratchColor.b * hot;
      this.moteAlphas[motes] = mote.alpha;
      // 2D draws a mote as a filled circle of radius `size`; the soft dot is
      // a diameter, so the point sprite carries 2x the radius in sim px.
      this.moteSizes[motes] = mote.size * 2 * PX;
      motes += 1;
    }
    for (let index = rings; index < MAX_RINGS; index += 1) this.rings[index].visible = false;
    for (let index = motes; index < MAX_MOTES; index += 1) this.moteAlphas[index] = 0;
    this.motes.geometry.attributes.position.needsUpdate = true;
    this.motes.geometry.attributes.color.needsUpdate = true;
    this.motes.geometry.attributes.aAlpha.needsUpdate = true;
    this.motes.geometry.attributes.aSize.needsUpdate = true;
    this.motes.visible = motes > 0;
    this.report.motes = motes;
    this.report.rings = rings;
  }

  update(state) {
    if (!state?.fighters?.length) {
      this.motes.visible = false;
      for (const ring of this.rings) ring.visible = false;
      for (const { sprite, light } of this.charges) {
        sprite.visible = false;
        light.visible = false;
      }
      for (const entry of this.sheets.values()) {
        entry.begin();
        entry.end();
      }
      this.report = { sprites: 0, sheets: 0, motes: 0, rings: 0, charges: 0 };
      return;
    }
    this.updateElementSprites(state);
    this.updateCharges(state);
    this.updateParticles(state);
  }

  // main.mjs calls this when the backing store changes: gl_PointSize is in
  // FRAMEBUFFER pixels, so a 2.5x device-pixel-ratio frame needs 2.5x points
  // or the mirrored pool silently shrinks to a quarter of its canvas size.
  setPixelScale(halfHeightPx) {
    this.motes.material.uniforms.uHalfHeight.value = halfHeightPx;
  }

  stats() {
    return { ...this.report };
  }

  dispose() {
    for (const entry of this.sheets.values()) {
      this.group.remove(entry.mesh);
      entry.dispose();
    }
    this.sheets.clear();
    this.motes.geometry.dispose();
    this.motes.material.dispose();
    this.dotTexture.dispose();
    for (const ring of this.rings) ring.material.dispose();
    this.ringTexture.dispose();
    this.chargeTexture.dispose();
  }
}
