// Fighter layer for CINEMA 3D.
// The existing sprite atlases ARE the characters: each fighter renders as an
// alpha-tested billboard standing in the 3D scene, but with everything needed
// to sit in it like a lit character instead of a pasted sticker:
//   - MeshStandardMaterial + a height-from-luminance normal map generated per
//     atlas at load (cached), so key/rim/practical lights genuinely shade the
//     sprite;
//   - a stage colour grade baked into the shader (desaturated ~20%, cool
//     shadows / sodium mids, teal wash from above, amber from the street) so
//     the daylight-saturated atlas colours sit inside the night scene;
//   - a 1-2px rim-light stroke on the silhouette edge facing the nearest
//     practical light, computed by alpha-edge sampling in the fragment shader;
//   - a real cast shadow from the stage key light (custom alpha-tested depth
//     material, so the shadow is sprite-shaped, not a quad);
//   - a two-layer contact-shadow blob (dark core + wide penumbra) stretched
//     away from the green overhead lamp, sliding/expanding with jump height;
//   - a vertically-flipped, blurred, ~15%-opacity reflection of the sprite on
//     the wet floor — the single biggest "sticker" tell was the backdrop
//     reflecting every light while the fighters reflected nothing;
//   - a flash-guard: while a big impact flash is live, the sprite interior
//     darkens toward its silhouette edge so the character stays readable
//     through the burst (SF6-style silhouette preservation).
// Reads the exact same sim fields drawFighter reads; writes nothing back.
import * as THREE from "three";
import { PX, worldX, worldY, SIM_FLOOR } from "./shared.mjs";
import { normalMapForAtlas, softDotTexture, hardShadowTexture, blurredAtlasTexture } from "./textures.mjs";

const ATLAS_COLUMNS = 4;
const ATLAS_ROWS = 4;

// Scene-matched sprite light anchors:
//   - the warm sodium bokeh plate lives screen-left, so every fighter carries
//     a sodium rim on the screen-left silhouette edge;
//   - the green-white station lamp hangs overhead, so cap/hair/shoulder top
//     edges catch a green-white key.
const SODIUM_RIM = new THREE.Color(0xffa04a);
const LAMP_KEY = new THREE.Color(0xc8ffdf);
// Green overhead lamp the contact shadows stretch away from.
const LAMP_X = 0.4;
const LAMP_Z = -4;

function applyAtlasFrame(texture, frame) {
  const column = frame % ATLAS_COLUMNS;
  const row = Math.floor(frame / ATLAS_COLUMNS);
  texture.repeat.set(1 / ATLAS_COLUMNS, 1 / ATLAS_ROWS);
  texture.offset.set(column / ATLAS_COLUMNS, 1 - (row + 1) / ATLAS_ROWS);
}

function atlasColorTexture(image) {
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// Injects the stage grade + scene-matched edge lighting into the sprite's
// standard material. Uniform handles land on material.userData.fb:
//   - warm-ambient grade (shadow tones pulled toward the sodium scene bounce);
//   - sodium rim: alpha-edge stroke on the screen-left silhouette (uFbRimUv);
//   - green-white top key on cap/hair/shoulder top edges (uFbTopUv);
//   - light-wrap: an any-direction soft edge that admits scene-ambient colour
//     into the silhouette so the cutout melts into the background;
//   - impact white flash masked to the sprite alpha only (uFbHitWhite);
//   - flash guard darkening while a big VFX flash is live.
function patchSpriteMaterial(material, atlasWidth, atlasHeight) {
  const fb = {
    rimUv: new THREE.Vector2(0.002, 0.001),
    rimColor: new THREE.Color(0xffa04a),
    rimStrength: { value: 0.62 },
    topUv: new THREE.Vector2(0, 0.002),
    topColor: new THREE.Color(0xc8ffdf),
    topStrength: { value: 0.6 },
    wrapColor: new THREE.Color(0x8a6a4a),
    wrapStrength: { value: 0.4 },
    hitWhite: { value: 0 },
    flashGuard: { value: 0 },
    texel: new THREE.Vector2(1 / atlasWidth, 1 / atlasHeight),
  };
  material.userData.fb = fb;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFbRimUv = { value: fb.rimUv };
    shader.uniforms.uFbRimColor = { value: fb.rimColor };
    shader.uniforms.uFbRimStrength = fb.rimStrength;
    shader.uniforms.uFbTopUv = { value: fb.topUv };
    shader.uniforms.uFbTopColor = { value: fb.topColor };
    shader.uniforms.uFbTopStrength = fb.topStrength;
    shader.uniforms.uFbWrapColor = { value: fb.wrapColor };
    shader.uniforms.uFbWrapStrength = fb.wrapStrength;
    shader.uniforms.uFbHitWhite = fb.hitWhite;
    shader.uniforms.uFbFlashGuard = fb.flashGuard;
    shader.uniforms.uFbTexel = { value: fb.texel };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFbWorld;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvFbWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vFbWorld;
uniform vec2 uFbRimUv;
uniform vec3 uFbRimColor;
uniform float uFbRimStrength;
uniform vec2 uFbTopUv;
uniform vec3 uFbTopColor;
uniform float uFbTopStrength;
uniform vec3 uFbWrapColor;
uniform float uFbWrapStrength;
uniform float uFbHitWhite;
uniform float uFbFlashGuard;
uniform vec2 uFbTexel;`)
      .replace("#include <map_fragment>", `#include <map_fragment>
// --- Stage grade: desaturate, then warm the shadow tones toward the scene's
// sodium ambient (the street bounces warm light, not blue) and keep the
// upper body kissed by the cool overhead air.
float fbLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(fbLum), 0.2);
float fbTone = smoothstep(0.08, 0.72, fbLum);
diffuseColor.rgb *= mix(vec3(1.06, 0.94, 0.82), vec3(0.98, 0.99, 1.03), fbTone);
float fbUp = clamp(vFbWorld.y * 0.5, 0.0, 1.0);
diffuseColor.rgb *= mix(vec3(1.05, 0.99, 0.9), vec3(0.94, 1.01, 1.0), fbUp);
// --- Sodium rim: screen-left silhouette edge -------------------------------
float fbRimA = texture2D(map, vMapUv + uFbRimUv).a;
float fbRimB = texture2D(map, vMapUv + uFbRimUv * 2.4).a;
float fbRim = clamp((1.0 - fbRimA) * 0.75 + (1.0 - fbRimB) * 0.5, 0.0, 1.0);
// --- Green-white top key: cap / hair / shoulder top edges ------------------
float fbTopA = texture2D(map, vMapUv + uFbTopUv).a;
float fbTopB = texture2D(map, vMapUv + uFbTopUv * 2.2).a;
float fbTop = clamp((1.0 - fbTopA) * 0.8 + (1.0 - fbTopB) * 0.45, 0.0, 1.0);
// --- Light-wrap: any-direction soft edge sampling scene ambient ------------
float fbWrapSum = texture2D(map, vMapUv + vec2(uFbTexel.x, 0.0) * 1.6).a
  + texture2D(map, vMapUv - vec2(uFbTexel.x, 0.0) * 1.6).a
  + texture2D(map, vMapUv + vec2(0.0, uFbTexel.y) * 1.6).a
  + texture2D(map, vMapUv - vec2(0.0, uFbTexel.y) * 1.6).a;
float fbWrap = clamp(1.0 - fbWrapSum * 0.25, 0.0, 1.0);
// --- Flash guard: darker inner rim keeps the silhouette through bursts ----
diffuseColor.rgb *= 1.0 - uFbFlashGuard * (0.22 + 0.55 * min(fbRim * 1.5, 1.0));`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance += uFbRimColor * (fbRim * uFbRimStrength * (1.0 - uFbFlashGuard * 0.4));
totalEmissiveRadiance += uFbTopColor * (fbTop * uFbTopStrength * (1.0 - uFbFlashGuard * 0.4));
totalEmissiveRadiance += uFbWrapColor * (fbWrap * uFbWrapStrength);
// Impact white flash: masked to the sprite alpha by construction (this whole
// shader only survives the alpha test) — never a screen-space circle. Held
// just under the bloom knee so the body reads white without flooding the
// frame with a bloom halo.
totalEmissiveRadiance += vec3(1.35, 1.35, 1.45) * uFbHitWhite;`);
  };
  // Distinct program per patched material (uniforms differ per bank).
  material.customProgramCacheKey = () => "fb-sprite-grade-v2";
  return fb;
}

// Vertical fade for the floor reflection: solid at the feet, gone by the head.
function patchReflectionMaterial(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFbRawUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvFbRawUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFbRawUv;")
      .replace("#include <map_fragment>", `#include <map_fragment>
diffuseColor.a *= 1.0 - smoothstep(0.06, 0.95, vFbRawUv.y);`);
  };
  material.customProgramCacheKey = () => "fb-sprite-reflection";
}

export class FighterLayer {
  constructor(host) {
    this.host = host;
    this.group = new THREE.Group();
    this.group.name = "fighters";
    this.rigs = [null, null];
    this.blobTexture = softDotTexture(128, "rgba(0,0,0,1)", "rgba(0,0,0,0)");
    this.hardBlobTexture = hardShadowTexture(128);
    // Wired by main.mjs to the impact-VFX layer once both layers exist.
    this.getFlashLevel = () => 0;
  }

  buildBank(image) {
    const map = atlasColorTexture(image);
    const normalMap = normalMapForAtlas(image);
    applyAtlasFrame(map, 0);
    // Normal map shares the frame window via its own transform.
    normalMap.matrixAutoUpdate = true;
    applyAtlasFrame(normalMap, 0);
    const material = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.78,
      metalness: 0.04,
      alphaTest: 0.38,
      side: THREE.DoubleSide,
      emissiveMap: map,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
      envMapIntensity: 0.4,
    });
    const fb = patchSpriteMaterial(material, image.naturalWidth, image.naturalHeight);
    const depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map,
      alphaTest: 0.38,
    });
    // Wet-floor reflection: blurred atlas, cooled + darkened, faded by height.
    const reflMap = blurredAtlasTexture(image, 3);
    applyAtlasFrame(reflMap, 0);
    const reflMaterial = new THREE.MeshBasicMaterial({
      map: reflMap,
      transparent: true,
      opacity: 0.17,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Cool wet-street tint, lifted so the mirror image actually registers
      // on the dark asphalt at reflection opacity.
      color: new THREE.Color(1.0, 1.12, 1.42),
      fog: false,
    });
    patchReflectionMaterial(reflMaterial);
    return { map, normalMap, material, depthMaterial, reflMap, reflMaterial, fb };
  }

  buildRig(fighter) {
    const host = this.host;
    const id = fighter.def.id;
    const baseImage = host.fighterAtlases[id];
    const moveImage = host.fighterMoveAtlases[id];
    if (!baseImage?.complete || !baseImage.naturalWidth) return null;
    const banks = { base: this.buildBank(baseImage) };
    if (moveImage?.complete && moveImage.naturalWidth) banks.specials = this.buildBank(moveImage);

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0); // feet-anchored, matching drawAtlasFrame
    const mesh = new THREE.Mesh(geometry, banks.base.material);
    mesh.customDepthMaterial = banks.base.depthMaterial;
    mesh.castShadow = true;
    mesh.receiveShadow = false;

    const root = new THREE.Group();
    root.add(mesh);

    // Mirrored reflection rig: same feet-anchored plane, flipped downward.
    const reflGeometry = new THREE.PlaneGeometry(1, 1);
    reflGeometry.translate(0, 0.5, 0);
    const reflMesh = new THREE.Mesh(reflGeometry, banks.base.reflMaterial);
    // Above the contact-shadow blobs: a mirror image is not darkened by the
    // diffuse shadow on the asphalt beneath it.
    reflMesh.renderOrder = 4;
    const reflRoot = new THREE.Group();
    reflRoot.add(reflMesh);

    // Two-part contact shadow, PER FIGHTER (never a shared smudge):
    //   core     — tight, hard, dark ellipse pinned directly under the feet;
    //   penumbra — longer soft stretch cast AWAY from the overhead lamp.
    const shadowMaterial = (map, opacity) => new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity,
      depthWrite: false,
      color: 0x000000,
    });
    const shadow = new THREE.Group();
    const penumbra = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial(this.blobTexture, 0.34));
    const core = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial(this.hardBlobTexture, 0.7));
    for (const blob of [penumbra, core]) {
      blob.rotation.x = -Math.PI / 2;
      blob.renderOrder = 2;
      shadow.add(blob);
    }
    core.renderOrder = 3; // hard sole ellipse always reads over the stretch
    this.group.add(shadow);
    this.group.add(reflRoot);
    this.group.add(root);
    return {
      id, banks, mesh, root, reflMesh, reflRoot, shadow, core, penumbra,
      currentBank: "base", lastHitFlash: 0, hitWhiteTtl: 0,
    };
  }

  disposeRig(rig) {
    if (!rig) return;
    this.group.remove(rig.root);
    this.group.remove(rig.reflRoot);
    this.group.remove(rig.shadow);
    for (const bank of Object.values(rig.banks)) {
      bank.material.dispose();
      bank.depthMaterial.dispose();
      bank.reflMaterial.dispose();
      bank.map.dispose();
      bank.reflMap.dispose();
    }
    rig.mesh.geometry.dispose();
    rig.reflMesh.geometry.dispose();
    for (const blob of [rig.core, rig.penumbra]) {
      blob.geometry.dispose();
      blob.material.dispose();
    }
  }

  update(state, dtSec, timeSec) {
    const fighters = state.fighters || [];
    for (let side = 0; side < 2; side += 1) {
      const fighter = fighters[side];
      let rig = this.rigs[side];
      if (!fighter) {
        if (rig) rig.root.visible = rig.reflRoot.visible = rig.shadow.visible = false;
        continue;
      }
      if (!rig || rig.id !== fighter.def.id) {
        this.disposeRig(rig);
        rig = this.buildRig(fighter);
        this.rigs[side] = rig;
        if (!rig) continue;
      }
      rig.root.visible = rig.reflRoot.visible = rig.shadow.visible = true;
      this.poseRig(rig, fighter, state, timeSec, dtSec);
    }
  }

  poseRig(rig, fighter, state, timeSec, dtSec = 0) {
    const host = this.host;
    const pose = host.fighterAnimationPose(fighter);
    const bankName = pose.bank === "specials" && rig.banks.specials ? "specials" : "base";
    const bank = rig.banks[bankName];
    if (rig.currentBank !== bankName) {
      rig.mesh.material = bank.material;
      rig.mesh.customDepthMaterial = bank.depthMaterial;
      rig.reflMesh.material = bank.reflMaterial;
      rig.currentBank = bankName;
    }
    applyAtlasFrame(bank.map, pose.frame);
    applyAtlasFrame(bank.normalMap, pose.frame);
    applyAtlasFrame(bank.reflMap, pose.frame);

    // --- Same presentation math drawFighter uses (read-only sim fields) ----
    const attack = fighter.attacking;
    const attackProgress = attack ? THREE.MathUtils.clamp(fighter.attackTime / attack.duration, 0, 1) : 0;
    const attackSwing = attack ? Math.sin(attackProgress * Math.PI) : 0;
    const startupPower = attack && fighter.attackTime < attack.active[0]
      ? Math.sin((fighter.attackTime / attack.active[0]) * Math.PI) : 0;
    const activePower = attack && fighter.attackTime >= attack.active[0] && fighter.attackTime <= attack.active[1]
      ? 1 : attack ? Math.max(0, attackSwing * 0.42) : 0;
    const attackKind = attack?.kind;
    const moving = Math.abs(fighter.vx) > 22 && fighter.grounded && !attack;
    const bob = fighter.cinematicFrame === null && fighter.grounded && !fighter.stun && !fighter.block
      ? Math.sin((moving ? fighter.walkTime * 20 : fighter.animTime * 10) + fighter.side * 2) * (moving ? 1.8 : 2.7) : 0;
    const sizeAdjust = bankName === "specials" ? (host.moveSheetAdjust[fighter.def.id] || 1) : 1;
    const renderSize = host.fighterRenderSize(fighter.def.id) * sizeAdjust * PX;
    const lunge = attackSwing * (attackKind === "special" ? 68 : attackKind === "heavy" ? 46 : 29);
    const crouchScale = fighter.crouch ? 0.88 : 1;
    const crouchDrop = fighter.crouch ? 21 : 0;
    const fatigue = THREE.MathUtils.clamp(1 - fighter.health / 100, 0, 1);
    const breathing = fighter.cinematicFrame === null && fighter.grounded && !fighter.down
      && !attack && !fighter.stun && !fighter.block && fighter.dizzyFrames <= 0 && fighter.guardCrushFrames <= 0;
    const breath = breathing
      ? Math.sin(fighter.animTime * (5.2 + fatigue * 5.6) + fighter.side * 1.9) * (0.009 + fatigue * 0.015)
      : 0;
    const hitSmear = THREE.MathUtils.clamp(fighter.hitFlash / 0.14, 0, 1);
    const facing = fighter.facing >= 0 ? 1 : -1;
    const jump = SIM_FLOOR - fighter.y;

    const offsetPx = (lunge - startupPower * 8) * facing;
    const dropPx = crouchDrop - attackSwing * (attackKind === "special" ? 13 : 5);
    rig.root.position.set(
      worldX(fighter.x) + offsetPx * PX,
      worldY(fighter.y + bob) - dropPx * PX,
      0,
    );

    // Down pose: the 2D rotates the sprite flat; canvas rotation is
    // y-down/clockwise, so the three z-rotation flips sign.
    let rootRotation = 0;
    if (fighter.down) rootRotation = facing * 1.35;
    if (fighter.cinematicRotation) rootRotation += -fighter.cinematicRotation;
    if (fighter.airTechFlipFrames > 0) {
      const flip = 1 - fighter.airTechFlipFrames / 14;
      rootRotation += -facing * flip * Math.PI * 2;
    }
    rig.root.rotation.z = rootRotation;
    if (fighter.down) rig.root.position.x += -facing * 45 * PX;

    const cineScale = fighter.cinematicScale !== 1 ? fighter.cinematicScale : 1;
    const scaleX = (1 + activePower * 0.045 - startupPower * 0.025) * (1 + hitSmear * 0.05);
    const scaleY = (crouchScale + startupPower * 0.035 - activePower * 0.025)
      * (1 + breath) * (1 - hitSmear * 0.06);
    rig.mesh.scale.set(renderSize * facing * scaleX * cineScale, renderSize * scaleY * cineScale, 1);
    rig.mesh.rotation.z = facing * attackSwing * (attackKind === "heavy" ? 0.07 : 0.025);

    // --- Wet-floor reflection: exact mirror across the ground plane --------
    rig.reflRoot.position.set(rig.root.position.x, -rig.root.position.y, -0.015);
    rig.reflRoot.rotation.z = -rootRotation;
    rig.reflMesh.scale.set(
      rig.mesh.scale.x,
      -rig.mesh.scale.y * 1.04, // slight vertical smear down the wet street
      1,
    );
    rig.reflMesh.rotation.z = -rig.mesh.rotation.z;
    const airFade = THREE.MathUtils.clamp(1 - jump / 430, 0.22, 1);
    bank.reflMaterial.opacity = 0.17 * (0.55 + 0.45 * airFade);

    // --- Body-heat emissive: grit-ready aura + special glow -----------------
    const superReady = state.phase === "fight" && fighter.cinematicFrame === null
      && fighter.meter >= (host.gritSuperCost ?? 100);
    const pulse = 0.5 + Math.sin(timeSec * 6 + fighter.side * 2.4) * 0.5;
    const glow = Math.max(
      superReady ? 0.14 + pulse * 0.16 : 0,
      THREE.MathUtils.clamp(fighter.specialGlow ?? 0, 0, 1) * 0.32,
    );
    const material = bank.material;
    if (glow > 0.004) {
      material.emissive.set(fighter.def.accent || "#ff8040");
      material.emissiveIntensity = glow;
    } else {
      material.emissiveIntensity = 0;
    }

    // --- Scene-matched sprite lighting + flash guard ------------------------
    const fx = rig.root.position.x;
    const fb = bank.fb;
    // Sodium rim: locked to the screen-LEFT silhouette edge (the warm bokeh
    // plate lives left of frame). uv.x flips with the sprite, so multiply by
    // facing to stay in screen space. ~2.5 texels ≈ a 1-2px stroke.
    const rimDirX = -0.92 * facing;
    const rimDirY = 0.39;
    fb.rimUv.set(rimDirX * fb.texel.x * 2, rimDirY * fb.texel.y * 2);
    fb.rimColor.copy(SODIUM_RIM);
    // Green-white top key from the overhead station lamp: strongest when the
    // fighter stands near the lamp column, never fully off.
    const lampNear = Math.exp(-((fx - LAMP_X) * (fx - LAMP_X)) / 7);
    fb.topUv.set(0, fb.texel.y * 2.6);
    fb.topColor.copy(LAMP_KEY);
    fb.topStrength.value = 0.62 + lampNear * 0.55;
    // Light-wrap ambient: warm sodium base drifting pink toward the K&A neon
    // on screen right — the silhouette edge admits the background's colour.
    const neonMix = THREE.MathUtils.clamp((fx + 1) / 6, 0, 1);
    fb.wrapColor.setRGB(
      0.56 + neonMix * 0.18,
      0.40 - neonMix * 0.08,
      0.28 + neonMix * 0.3,
    );
    fb.wrapStrength.value = 0.13;
    // Impact white flash: pop on the frame the sim hit lands (rising edge of
    // the sim's own hitFlash timer), gone ~4 render frames later. Emissive is
    // masked to the sprite pixels, so the play area never desaturates.
    if (fighter.hitFlash > rig.lastHitFlash + 0.02) rig.hitWhiteTtl = 0.1;
    rig.lastHitFlash = fighter.hitFlash;
    rig.hitWhiteTtl = Math.max(0, rig.hitWhiteTtl - dtSec);
    fb.hitWhite.value = rig.hitWhiteTtl / 0.1;
    const flash = THREE.MathUtils.clamp(this.getFlashLevel(), 0, 1);
    fb.rimStrength.value = 0.55 + hitSmear * 0.4;
    fb.flashGuard.value = flash * 0.85 * (1 - fb.hitWhite.value);

    // --- Contact shadow: hard sole ellipse + soft stretch away from lamp ----
    const sdx = fx - LAMP_X;
    const sdz = 0 - LAMP_Z;
    const slen = Math.hypot(sdx, sdz) || 1;
    const dirGx = sdx / slen;
    const dirGz = sdz / slen;
    const stretch = 1 + Math.abs(lunge) / (renderSize / PX * 1.4) + (fighter.dashFrames > 0 ? 0.25 : 0);
    const slide = (1 - airFade) * 0.45; // lamp is high: airborne shadows travel
    // Pin the whole shadow group to the sole line (feet x, ground y).
    rig.shadow.position.set(fx, 0.01, 0.02);
    const angle = Math.atan2(-dirGz, dirGx);
    // Hard core: tight dark ellipse directly under the feet, unrotated so it
    // hugs the sole line, shrinking + fading with jump height.
    rig.core.rotation.set(-Math.PI / 2, 0, 0);
    rig.core.position.set(slide * dirGx * 0.3, 0.004, slide * dirGz * 0.12);
    rig.core.scale.set(renderSize * 0.46 * stretch * (0.7 + 0.3 * airFade), renderSize * 0.15, 1);
    rig.core.material.opacity = 0.72 * airFade;
    // Soft stretch: longer penumbra cast away from the overhead lamp.
    const stretchLen = renderSize * 1.05 * stretch;
    rig.penumbra.rotation.set(-Math.PI / 2, 0, angle);
    rig.penumbra.position.set(dirGx * stretchLen * 0.3 + slide * dirGx * 0.5, 0.002, dirGz * 0.1 + slide * dirGz * 0.3);
    rig.penumbra.scale.set(stretchLen, renderSize * 0.34, 1);
    rig.penumbra.material.opacity = 0.3 * (0.3 + 0.7 * airFade);
  }
}
