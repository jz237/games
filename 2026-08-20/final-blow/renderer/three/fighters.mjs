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
import { normalMapForAtlas, softDotTexture, hardShadowTexture, blurredAtlasTexture, bleedAtlasCanvas, hdComposedCanvas, atlasFootMetrics } from "./textures.mjs";

// HD (2x) atlas variants for 3D mode only (renderer/hd/MANIFEST.json).
// Loaded lazily per fighter; on any failure the bank silently keeps the
// original atlas — the fallback is the absence of the swap.
const hdImageCache = new Map();
function loadHdImage(path) {
  if (hdImageCache.has(path)) return hdImageCache.get(path);
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth ? img : null);
    img.onerror = () => resolve(null);
    img.src = path;
  });
  hdImageCache.set(path, promise);
  return promise;
}

const ATLAS_COLUMNS = 4;
const ATLAS_ROWS = 4;

// Scene-matched sprite light anchors:
//   - warm sodium streetlights live screen-LEFT, so the screen-left silhouette
//     edge catches a sodium rim;
//   - the K&A neon burns screen-RIGHT, so the screen-right edge catches
//     magenta (stronger the closer the fighter stands to the sign);
//   - the green-white station lamp hangs overhead: top edges only.
// Every rim is gated by the normal map (the edge must actually FACE its
// light) — nothing glows uniformly around the silhouette.
const SODIUM_RIM = new THREE.Color(0xffa04a);
const NEON_RIM = new THREE.Color(0xff4fd8);
const LAMP_KEY = new THREE.Color(0xc8ffdf);
const BODEGA_WARM = new THREE.Color(0xffc27a);
const CYAN_RIM = new THREE.Color(0x3fd6ff);
// Green overhead lamp the contact shadows stretch away from.
const LAMP_X = 0.4;
const LAMP_Z = -4;

function applyAtlasFrame(texture, frame) {
  const column = frame % ATLAS_COLUMNS;
  const row = Math.floor(frame / ATLAS_COLUMNS);
  texture.repeat.set(1 / ATLAS_COLUMNS, 1 / ATLAS_ROWS);
  texture.offset.set(column / ATLAS_COLUMNS, 1 - (row + 1) / ATLAS_ROWS);
}

// Silhouette-projected floor shadow: the sprite's own alpha matte, skewed and
// flattened along the ground, multiplied dark — sharp at the feet (sharp atlas
// alpha) and feathering into the blurred matte with distance, exactly how a
// body shadows a floor under an overhead lamp. Replaces the hovering ellipse.
function shadowProjectionMaterial(map, blurMap) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uBlurMap: { value: blurMap },
      uUvOffset: { value: new THREE.Vector2(0, 0) },
      uUvRepeat: { value: new THREE.Vector2(1, 1) },
      uOpacity: { value: 0.6 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform sampler2D uBlurMap;
      uniform vec2 uUvOffset;
      uniform vec2 uUvRepeat;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 uv = uUvOffset + vUv * uUvRepeat;
        float aSharp = texture2D(uMap, uv).a;
        float aBlur = texture2D(uBlurMap, uv).a;
        // Sharp contact at the sole line, soft penumbra by the head-end.
        float d = vUv.y;
        float a = mix(aSharp, aBlur * 0.92, smoothstep(0.03, 0.62, d));
        // Distance fade: darkest right at the feet, gone before full length.
        float fade = 1.0 - smoothstep(0.04, 0.9, d);
        gl_FragColor = vec4(0.0, 0.0, 0.0, a * fade * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
}

// Scratch vectors for the per-frame shadow-projection basis (no per-frame GC).
const PROJ_X = new THREE.Vector3();
const PROJ_Y = new THREE.Vector3();
const PROJ_Z = new THREE.Vector3();

// Colour texture from the BLED atlas (RGB dilated into the transparent
// region): raw atlases store white under alpha=0, and linear filtering blended
// sprite edges toward that white — the "sticker fringe".
function atlasColorTexture(image) {
  const texture = new THREE.CanvasTexture(bleedAtlasCanvas(image));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Injects the stage grade + scene-matched edge lighting into the sprite's
// standard material. Uniform handles land on material.userData.fb:
//   - warm-ambient grade (shadow tones pulled toward the sodium scene bounce);
//   - derivative-smoothed alpha test (~0.5): the soft antialiased halo texels
//     that used to survive the old 0.38 test are gone;
//   - DIRECTIONAL rims only, gated by the generated normal map via the
//     view-space normal: sodium on edges facing screen-left, K&A magenta on
//     edges facing screen-right, green-white lamp on top edges. The unlit
//     side of the silhouette DARKENS instead of glowing;
//   - impact white flash masked to the sprite alpha only (uFbHitWhite);
//   - flash guard darkening while a big VFX flash is live.
function patchSpriteMaterial(material, atlasWidth, atlasHeight) {
  const fb = {
    rimLeftColor: new THREE.Color(0xffa04a),
    rimLeftStrength: { value: 0.85 },
    rimRightColor: new THREE.Color(0xff4fd8),
    rimRightStrength: { value: 0.6 },
    topColor: new THREE.Color(0xc8ffdf),
    topStrength: { value: 0.5 },
    fillLeftColor: new THREE.Color(0x000000),
    fillRightColor: new THREE.Color(0x000000),
    floorBounce: new THREE.Color(0x000000),
    facing: { value: 1 },
    hitWhite: { value: 0 },
    flashGuard: { value: 0 },
    superDim: { value: 0 },
    texel: new THREE.Vector2(1 / atlasWidth, 1 / atlasHeight),
  };
  material.userData.fb = fb;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFbRimLeftColor = { value: fb.rimLeftColor };
    shader.uniforms.uFbRimLeftStrength = fb.rimLeftStrength;
    shader.uniforms.uFbRimRightColor = { value: fb.rimRightColor };
    shader.uniforms.uFbRimRightStrength = fb.rimRightStrength;
    shader.uniforms.uFbTopColor = { value: fb.topColor };
    shader.uniforms.uFbTopStrength = fb.topStrength;
    shader.uniforms.uFbFillLeftColor = { value: fb.fillLeftColor };
    shader.uniforms.uFbFillRightColor = { value: fb.fillRightColor };
    shader.uniforms.uFbFloorBounce = { value: fb.floorBounce };
    shader.uniforms.uFbFacing = fb.facing;
    shader.uniforms.uFbHitWhite = fb.hitWhite;
    shader.uniforms.uFbFlashGuard = fb.flashGuard;
    shader.uniforms.uFbSuperDim = fb.superDim;
    shader.uniforms.uFbTexel = { value: fb.texel };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFbWorld;\nvarying vec2 vFbLocal;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvFbLocal = uv;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvFbWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vFbWorld;
varying vec2 vFbLocal;
uniform vec3 uFbRimLeftColor;
uniform float uFbRimLeftStrength;
uniform vec3 uFbRimRightColor;
uniform float uFbRimRightStrength;
uniform vec3 uFbTopColor;
uniform float uFbTopStrength;
uniform vec3 uFbFillLeftColor;
uniform vec3 uFbFillRightColor;
uniform vec3 uFbFloorBounce;
uniform float uFbFacing;
uniform float uFbHitWhite;
uniform float uFbFlashGuard;
uniform float uFbSuperDim;
uniform vec2 uFbTexel;`)
      // 1px-ERODED matte + derivative-smoothed cut at 0.5: the alpha is taken
      // as the MIN of this texel and its 4 neighbours, which shrinks the matte
      // by one texel and executes the halo ring that used to survive the
      // plain threshold — the single loudest "pasted sticker" tell.
      .replace("#include <alphatest_fragment>", `
float fbAe = min(diffuseColor.a, min(
  min(texture2D(map, vMapUv + vec2(uFbTexel.x, 0.0)).a,
      texture2D(map, vMapUv - vec2(uFbTexel.x, 0.0)).a),
  min(texture2D(map, vMapUv + vec2(0.0, uFbTexel.y)).a,
      texture2D(map, vMapUv - vec2(0.0, uFbTexel.y)).a)));
float fbAw = max(fwidth(fbAe), 0.0001);
float fbCut = smoothstep(0.5 - fbAw, 0.5 + fbAw, fbAe);
if (fbCut < 0.5) discard;
diffuseColor.a = 1.0;`)
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
// --- Scene-light body fill (position-driven, set per frame in poseRig) ----
// A lateral screen-space gradient ACROSS the body, screen-blended so it
// lives in the shadow tones: the fighter visibly picks up magenta standing
// by the K&A neon and warm sodium by the left lamps, and the wash slides
// across the body as they move — light from the scene, not a baked sprite.
float fbScreenU = mix(1.0 - vFbLocal.x, vFbLocal.x, step(0.0, uFbFacing));
float fbFillL = pow(1.0 - fbScreenU, 1.4);
float fbFillR = pow(fbScreenU, 1.4);
vec3 fbFill = uFbFillLeftColor * fbFillL
  + uFbFillRightColor * fbFillR * (0.35 + 0.65 * vFbLocal.y);
diffuseColor.rgb += fbFill * (vec3(1.0) - diffuseColor.rgb) * (0.45 + 0.55 * (1.0 - fbTone));
// --- Green-white TOP-LIGHT term (station lamp overhead): a broad body
// gradient down from the head/shoulders, not just a silhouette stroke — the
// lamp genuinely keys the upper body the way it keys the floor below it.
float fbTopBody = smoothstep(0.5, 0.96, vFbLocal.y) * clamp(uFbTopStrength, 0.0, 1.2);
diffuseColor.rgb = mix(diffuseColor.rgb,
  diffuseColor.rgb * vec3(0.88, 1.12, 0.99) + uFbTopColor * 0.085,
  fbTopBody * 0.8);
// --- Warm FLOOR BOUNCE climbing the lower legs from the sodium-lit boards:
// screen-blended into the shadow tones so shoes/shins pick up the floor.
float fbLow = 1.0 - smoothstep(0.02, 0.34, vFbLocal.y);
diffuseColor.rgb += uFbFloorBounce * fbLow * (vec3(1.0) - diffuseColor.rgb) * (0.5 + 0.5 * (1.0 - fbTone));
// Super freeze: the body drops toward a silhouette (rims boosted in JS).
diffuseColor.rgb *= 1.0 - uFbSuperDim * 0.62;`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
// --- Directional silhouette rims -------------------------------------------
// Tight 1-2px edge strokes from outward alpha sampling, converted to SCREEN
// space via uFbFacing (uv.x flips with the sprite). NO ambient floor: each
// stroke lights ONLY where the normal map says the edge actually faces its
// light (sodium from screen-left, K&A magenta from screen-right + elevated,
// station lamp from above). A uniform floor here is what read as a magenta
// matte fringe around the whole silhouette.
vec2 fbLeftOff = vec2(-uFbFacing * uFbTexel.x, 0.0);
float fbEdgeL = clamp((1.0 - texture2D(map, vMapUv + fbLeftOff * 1.5).a) * 0.8
  + (1.0 - texture2D(map, vMapUv + fbLeftOff * 3.0).a) * 0.3, 0.0, 1.0);
float fbEdgeR = clamp((1.0 - texture2D(map, vMapUv - fbLeftOff * 1.5).a) * 0.8
  + (1.0 - texture2D(map, vMapUv - fbLeftOff * 3.0).a) * 0.3, 0.0, 1.0);
vec2 fbTopOff = vec2(0.0, uFbTexel.y);
float fbEdgeT = clamp((1.0 - texture2D(map, vMapUv + fbTopOff * 1.8).a) * 0.8
  + (1.0 - texture2D(map, vMapUv + fbTopOff * 3.6).a) * 0.3, 0.0, 1.0);
float fbFaceL = clamp(-normal.x * 2.1, 0.0, 1.0);
float fbFaceR = clamp(normal.x * 2.1, 0.0, 1.0);
float fbFaceT = clamp(normal.y * 1.8, 0.0, 1.0);
float fbRimL = fbEdgeL * pow(fbFaceL, 1.25);
// The K&A neon hangs high on screen-right: its rim fades out down the legs
// instead of outlining the trainers in pink.
float fbRimR = fbEdgeR * pow(fbFaceR, 1.25) * (0.25 + 0.75 * vFbLocal.y);
float fbRimT = fbEdgeT * pow(fbFaceT, 1.2);
float fbGuardFade = 1.0 - uFbFlashGuard * 0.4;
float fbSuperRim = 1.0 + uFbSuperDim * 1.5;
totalEmissiveRadiance += uFbRimLeftColor * (fbRimL * uFbRimLeftStrength * fbGuardFade * fbSuperRim);
totalEmissiveRadiance += uFbRimRightColor * (fbRimR * uFbRimRightStrength * fbGuardFade * fbSuperRim);
totalEmissiveRadiance += uFbTopColor * (fbRimT * uFbTopStrength * fbGuardFade * fbSuperRim);
// Unlit-side edge discipline: silhouette pixels whose normals face AWAY from
// every practical darken toward the night instead of glowing.
float fbEdgeAny = clamp(fbEdgeL + fbEdgeR + fbEdgeT * 0.5, 0.0, 1.0);
float fbLit = max(fbFaceL, max(fbFaceR, fbFaceT * 0.7));
diffuseColor.rgb *= 1.0 - fbEdgeAny * (1.0 - fbLit) * 0.45;
// --- Flash guard: darker inner rim keeps the silhouette through bursts ----
diffuseColor.rgb *= 1.0 - uFbFlashGuard * (0.22 + 0.55 * fbEdgeAny);
// Impact white flash: masked to the sprite alpha by construction (this whole
// shader only survives the alpha test) — never a screen-space circle. Held
// just under the bloom knee so the body reads white without flooding the
// frame with a bloom halo.
totalEmissiveRadiance += vec3(1.35, 1.35, 1.45) * uFbHitWhite;`);
  };
  // Distinct program per patched material (uniforms differ per bank).
  material.customProgramCacheKey = () => "fb-sprite-grade-v5";
  return fb;
}

// Wet-street reflection shading: vertical fade (solid at the feet, gone by
// the head) + a streaky roughness-breakup mask — vertical noise ribbons in
// WORLD space interrupt the mirror image the way rippled wet asphalt does, so
// the reflection reads as water, not a ghost twin standing underground.
function patchReflectionMaterial(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFbRawUv;\nvarying vec3 vFbWorld;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvFbRawUv = uv;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvFbWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec2 vFbRawUv;
varying vec3 vFbWorld;
float fbHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float fbVnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fbHash(i), fbHash(i + vec2(1.0, 0.0)), f.x),
             mix(fbHash(i + vec2(0.0, 1.0)), fbHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`)
      .replace("#include <map_fragment>", `#include <map_fragment>
// Height fade: mirror strongest at the contact line, gone within ~one
// character height of the feet — a glossy-floor sheen, not a ghost twin.
diffuseColor.a *= 1.0 - smoothstep(0.02, 0.62, vFbRawUv.y);
// Roughness breakup: tall thin noise ribbons (x tight, y long) so the mirror
// smears into interrupted vertical streaks like SF6 night-stage water.
float fbStreak = fbVnoise(vec2(vFbWorld.x * 11.0, vFbWorld.y * 1.7));
fbStreak = 0.6 + 0.4 * smoothstep(0.25, 0.8, fbStreak);
// Fine horizontal ripple bands riding on the streaks.
float fbRipple = 0.85 + 0.15 * sin(vFbWorld.y * 34.0 + vFbWorld.x * 3.0);
// Gentle wetness variation (the old hard puddle gate erased the mirror on
// the boards where it happened to land, which read as NO reflection at all).
float fbPool = smoothstep(0.2, 0.55, fbVnoise(vec2(vFbWorld.x * 0.45 + 4.7, vFbWorld.y * 0.3 + 1.3)));
diffuseColor.a *= fbStreak * fbRipple * (0.72 + 0.28 * fbPool);`);
  };
  material.customProgramCacheKey = () => "fb-sprite-reflection-v4";
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
    // Wired by main.mjs: { x, color, level } of the latest impact, so the
    // sprites pick up coloured light spill from the burst (fix: impacts must
    // relight the fighters, not just the air).
    this.getImpactSpill = () => null;
    // Eased 0..1 super-freeze level, set by main.mjs: body drops toward a
    // rim-lit silhouette while the cut-in owns the frame.
    this.superDim = 0;
  }

  buildBank(image, hdPath = null) {
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
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      emissiveMap: map,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
      envMapIntensity: 0.4,
    });
    const fb = patchSpriteMaterial(material, image.naturalWidth, image.naturalHeight);
    // Shadow-map depth material: the SAME alpha-tested frame window, so the
    // key light prints the fighter's true silhouette into its shadow map.
    const depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map,
      alphaTest: 0.5,
    });
    // Wet-floor reflection: blurred atlas, faded by height, tinted toward the
    // floor's own warm sodium-lit boards (a mirror picks up the surface it
    // lives on — the old cool-blue lift vanished against the warm floor).
    const reflMap = blurredAtlasTexture(image, 3);
    applyAtlasFrame(reflMap, 0);
    const reflMaterial = new THREE.MeshBasicMaterial({
      map: reflMap,
      transparent: true,
      opacity: 0.42,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      color: new THREE.Color(1.1, 0.99, 0.86),
      fog: false,
    });
    patchReflectionMaterial(reflMaterial);
    // Silhouette-projected floor shadow (shares the colour + blurred mattes).
    const shadowProj = shadowProjectionMaterial(map, reflMap);
    // Per-frame sole line + foot positions: kills the hover (transparent
    // padding under the feet) and drives the per-foot contact shadows.
    const footMetrics = atlasFootMetrics(image);
    const bank = { map, normalMap, material, depthMaterial, reflMap, reflMaterial, shadowProj, fb, footMetrics, disposed: false };
    // HD swap: once the 2x atlas arrives, replace the colour/emissive/depth
    // map with the HD composite. Alpha is byte-identical NN-2x, so pose,
    // shadow silhouette and rim sampling stay aligned — only fb.texel moves
    // to the finer grid. Normal + reflection maps stay SD (blurred anyway).
    if (hdPath) {
      loadHdImage(hdPath).then((hdImage) => {
        if (!hdImage || bank.disposed) return;
        const hdTexture = new THREE.CanvasTexture(hdComposedCanvas(hdImage, image));
        hdTexture.colorSpace = THREE.SRGBColorSpace;
        hdTexture.anisotropy = 8;
        applyAtlasFrame(hdTexture, 0);
        const old = bank.map;
        bank.map = hdTexture;
        material.map = hdTexture;
        material.emissiveMap = hdTexture;
        depthMaterial.map = hdTexture;
        shadowProj.uniforms.uMap.value = hdTexture;
        fb.texel.set(1 / hdImage.naturalWidth, 1 / hdImage.naturalHeight);
        material.needsUpdate = true;
        depthMaterial.needsUpdate = true;
        old.dispose();
      });
    }
    return bank;
  }

  buildRig(fighter) {
    const host = this.host;
    const id = fighter.def.id;
    const baseImage = host.fighterAtlases[id];
    const moveImage = host.fighterMoveAtlases[id];
    if (!baseImage?.complete || !baseImage.naturalWidth) return null;
    const banks = { base: this.buildBank(baseImage, `renderer/hd/${id}.webp`) };
    if (moveImage?.complete && moveImage.naturalWidth) banks.specials = this.buildBank(moveImage, `renderer/hd/${id}-specials.webp`);

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

    // Grounding shadows, PER FIGHTER, in two layers the way SF6 grounds its
    // fighters: (a) a tight near-black contact ellipse under EACH FOOT (the
    // soles read planted because contact is darkest right at the shoe), and
    // (b) one longer, softer directional shadow stretched AWAY from the
    // overhead green station lamp. The key light's shadow-mapped silhouette
    // still prints the pose on top of these.
    const shadowMaterial = (map, opacity) => new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity,
      depthWrite: false,
      color: 0x000000,
    });
    const shadow = new THREE.Group();
    const penumbra = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial(this.blobTexture, 0.2));
    const footA = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial(this.hardBlobTexture, 0.75));
    const footB = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial(this.hardBlobTexture, 0.75));
    for (const blob of [penumbra, footA, footB]) {
      blob.rotation.x = -Math.PI / 2;
      blob.renderOrder = 2;
      shadow.add(blob);
    }
    footA.renderOrder = footB.renderOrder = 3; // sole ellipses read over the stretch

    // Silhouette-projected floor shadow: feet-anchored quad, world matrix
    // composed by hand each frame (flatten + skew along the lamp-away throw).
    const projGeometry = new THREE.PlaneGeometry(1, 1);
    projGeometry.translate(0, 0.5, 0);
    const proj = new THREE.Mesh(projGeometry, banks.base.shadowProj);
    proj.matrixAutoUpdate = false;
    proj.renderOrder = 2;
    proj.frustumCulled = false;

    this.group.add(shadow);
    this.group.add(proj);
    this.group.add(reflRoot);
    this.group.add(root);
    return {
      id, banks, mesh, root, reflMesh, reflRoot, shadow, footA, footB, penumbra, proj,
      currentBank: "base", lastHitFlash: 0, hitWhiteTtl: 0,
    };
  }

  disposeRig(rig) {
    if (!rig) return;
    this.group.remove(rig.root);
    this.group.remove(rig.reflRoot);
    this.group.remove(rig.shadow);
    this.group.remove(rig.proj);
    for (const bank of Object.values(rig.banks)) {
      bank.disposed = true; // cancels any in-flight HD swap
      bank.material.dispose();
      bank.depthMaterial.dispose();
      bank.reflMaterial.dispose();
      bank.shadowProj.dispose();
      bank.map.dispose();
      bank.reflMap.dispose();
    }
    rig.mesh.geometry.dispose();
    rig.reflMesh.geometry.dispose();
    rig.proj.geometry.dispose();
    for (const blob of [rig.footA, rig.footB, rig.penumbra]) {
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
        if (rig) rig.root.visible = rig.reflRoot.visible = rig.shadow.visible = rig.proj.visible = false;
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
      rig.proj.material = bank.shadowProj;
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

    // --- Foot anchoring: kill the hover -------------------------------------
    // The atlas frames carry transparent padding under the soles, so the
    // feet-anchored quad held the visible shoes a few px above the ground
    // plane — the "floating feet" tell. Drop the rig by the measured per-frame
    // padding so the soles genuinely touch y=0 (skipped while the sprite is
    // rotated flat: knocked-down poses have no meaningful sole line).
    const upright = !fighter.down && Math.abs(rootRotation) < 0.25;
    const footPad = bank.footMetrics?.padBottom?.[pose.frame] ?? 0;
    if (upright && footPad > 0) rig.root.position.y -= footPad * Math.abs(rig.mesh.scale.y);

    // --- Wet-floor reflection: exact mirror across the ground plane --------
    rig.reflRoot.position.set(rig.root.position.x, -rig.root.position.y, -0.015);
    rig.reflRoot.rotation.z = -rootRotation;
    rig.reflMesh.scale.set(
      rig.mesh.scale.x,
      -rig.mesh.scale.y * 1.28, // vertical smear down the wet street
      1,
    );
    // Slight shear off vertical: mirrored light on rippled water never sits
    // perfectly under its source.
    rig.reflMesh.rotation.z = -rig.mesh.rotation.z + facing * 0.045;
    const airFade = THREE.MathUtils.clamp(1 - jump / 430, 0.22, 1);
    // Impact answer: the wet street brightens its mirror while a flash lives.
    const flashBoost = 1 + THREE.MathUtils.clamp(this.getFlashLevel(), 0, 1) * 0.9;
    bank.reflMaterial.opacity = Math.min(0.6, 0.34 * (0.55 + 0.45 * airFade) * flashBoost);

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
    // Screen-space edge orientation for the shader (uv.x flips with facing).
    fb.facing.value = facing;
    // Sodium rim from the screen-left streetlights: strength eases up the
    // closer the fighter stands to the left lamps, colour warmed toward the
    // bodega amber when the fighter drifts deep screen-left.
    const leftNear = THREE.MathUtils.clamp(1 - (fx + 3.2) / 6, 0.25, 1);
    fb.rimLeftColor.copy(SODIUM_RIM).lerp(BODEGA_WARM, THREE.MathUtils.clamp(-(fx + 2) / 5, 0, 1) * 0.5);
    fb.rimLeftStrength.value = (0.55 + leftNear * 0.45) * (1 + hitSmear * 0.5);
    // Screen-right rim sampled from whichever practical is actually nearest:
    // K&A magenta near the sign, cooled toward the cyan check-cashing glow at
    // the far right edge. Strength tapers hard with distance — mid-stage the
    // right edge goes DARK instead of wearing a constant pink outline.
    const neonMix = THREE.MathUtils.clamp((fx + 0.5) / 5.5, 0, 1);
    fb.rimRightColor.copy(NEON_RIM).lerp(CYAN_RIM, THREE.MathUtils.clamp((fx - 3.4) / 3, 0, 1) * 0.55);
    fb.rimRightStrength.value = 0.22 + neonMix * neonMix * 1.15;
    // Green-white top key from the overhead station lamp: strongest when the
    // fighter stands near the lamp column, never fully off. Drives BOTH the
    // silhouette stroke and the broad top-body gradient in the shader.
    const lampNear = Math.exp(-((fx - LAMP_X) * (fx - LAMP_X)) / 7);
    fb.topColor.copy(LAMP_KEY);
    fb.topStrength.value = 0.55 + lampNear * 0.5;
    // --- Scene-light BODY fill (not just edges): the cheap trick that sits
    // the fighter IN the scene. Magenta wash rises across the body as the
    // fighter nears the K&A neon; warm sodium fill answers from screen-left;
    // both slide across the sprite as it moves.
    fb.fillLeftColor.copy(SODIUM_RIM).multiplyScalar(0.12 + leftNear * 0.18);
    fb.fillRightColor.copy(NEON_RIM).multiplyScalar(0.1 + neonMix * neonMix * 0.48);
    // Warm floor bounce on shoes/shins from the sodium-lit boards; brightens
    // where the fighter stands in a lamp pool.
    fb.floorBounce.copy(SODIUM_RIM).lerp(BODEGA_WARM, 0.35)
      .multiplyScalar(0.16 + lampNear * 0.1 + leftNear * 0.06);
    // Impact light spill: the burst relights the near side of BOTH fighters
    // in the burst's own colour for its ~0.25s life.
    const spill = this.getImpactSpill?.();
    if (spill && spill.level > 0.01) {
      const near = Math.exp(-((fx - spill.x) * (fx - spill.x)) / 1.6) * spill.level;
      const target = spill.x >= fx - 0.05 ? fb.fillRightColor : fb.fillLeftColor;
      target.r += spill.color.r * near * 0.55;
      target.g += spill.color.g * near * 0.55;
      target.b += spill.color.b * near * 0.55;
    }
    // Super freeze: body toward silhouette, rims boosted (set in the shader).
    fb.superDim.value = this.superDim;
    // Impact white flash: pop on the frame the sim hit lands (rising edge of
    // the sim's own hitFlash timer), gone ~4 render frames later. Emissive is
    // masked to the sprite pixels, so the play area never desaturates.
    if (fighter.hitFlash > rig.lastHitFlash + 0.02) rig.hitWhiteTtl = 0.1;
    rig.lastHitFlash = fighter.hitFlash;
    rig.hitWhiteTtl = Math.max(0, rig.hitWhiteTtl - dtSec);
    fb.hitWhite.value = rig.hitWhiteTtl / 0.1;
    const flash = THREE.MathUtils.clamp(this.getFlashLevel(), 0, 1);
    fb.flashGuard.value = flash * 0.85 * (1 - fb.hitWhite.value);

    // --- Grounding shadows --------------------------------------------------
    // Layer 1: tight near-black contact ellipse under EACH measured foot —
    // nearly black at the sole is what makes a fighter read planted.
    // Layer 2: one longer soft shadow stretched AWAY from the overhead green
    // station lamp (the lamp hangs behind at x=LAMP_X, so the throw runs
    // toward the camera and away in x). The key light's shadow-mapped
    // silhouette still draws the pose-shaped shadow on top.
    const slide = (1 - airFade) * 0.3; // airborne: contact patch drifts + fades
    rig.shadow.position.set(fx, 0.01, 0.02);
    const feet = (upright && bank.footMetrics?.feet?.[pose.frame]) || [];
    const soleY = 0.004;
    const footScaleX = renderSize * 0.2 * (0.75 + 0.25 * airFade);
    const footScaleZ = renderSize * 0.09;
    const footFor = (blob, foot, fallbackU) => {
      const u = foot ? foot.u : fallbackU;
      blob.rotation.set(-Math.PI / 2, 0, 0);
      // Centre tucked slightly BEHIND the sprite plane so the ellipse's near
      // edge kisses the sole row on screen instead of hanging below it.
      blob.position.set(u * rig.mesh.scale.x + slide * 0.2, soleY, -0.04 + slide * 0.15);
      blob.scale.set(footScaleX, footScaleZ, 1);
      blob.material.opacity = 0.85 * airFade * (0.65 + 0.35 * (foot ? 1 : 0));
    };
    footFor(rig.footA, feet[0], -0.1);
    footFor(rig.footB, feet[1] || feet[0], 0.1);
    // Directional throw away from the green lamp.
    const awayX = THREE.MathUtils.clamp((fx - LAMP_X) / 3.2, -1, 1);
    const dirX = awayX * 0.85;
    const dirZ = 0.55; // lamp hangs behind the fight line: shadow falls forward
    const dirLen = Math.hypot(dirX, dirZ);

    // --- Silhouette-projected shadow: the sprite's own alpha, flattened and
    // skewed along the floor away from the lamp. Sharp at the feet, feathered
    // with distance (in the shader). The old wide penumbra ellipse drops to a
    // faint haze underneath — overlapping soft ellipses were the hover tell.
    const projOk = upright && airFade > 0.3;
    rig.proj.visible = projOk;
    if (projOk) {
      const sy = Math.abs(rig.mesh.scale.y);
      const flat = 0.55; // flattened to ~half height along the throw
      PROJ_X.set(rig.mesh.scale.x * 1.02, 0, 0);
      PROJ_Y.set((dirX / dirLen) * sy * flat, 0, (dirZ / dirLen) * sy * flat);
      PROJ_Z.set(0, 1, 0);
      rig.proj.matrix.makeBasis(PROJ_X, PROJ_Y, PROJ_Z);
      rig.proj.matrix.setPosition(rig.root.position.x + slide * 0.25, 0.0075, 0.045);
      rig.proj.matrixWorldNeedsUpdate = true;
      const projUniforms = bank.shadowProj.uniforms;
      projUniforms.uUvOffset.value.copy(bank.map.offset);
      projUniforms.uUvRepeat.value.copy(bank.map.repeat);
      projUniforms.uOpacity.value = 0.62 * airFade;
    }
    const throwLen = renderSize * (0.5 + Math.abs(awayX) * 0.4);
    rig.penumbra.rotation.set(-Math.PI / 2, 0, -Math.atan2(dirZ, dirX));
    rig.penumbra.position.set(
      (dirX / dirLen) * throwLen * 0.32 + slide * 0.3,
      0.002,
      (dirZ / dirLen) * throwLen * 0.32 + slide * 0.2,
    );
    rig.penumbra.scale.set(throwLen, renderSize * 0.24, 1);
    // Faint ambient pool only while the projected silhouette carries the
    // grounding; full strength again for down/rotated poses.
    rig.penumbra.material.opacity = (projOk ? 0.09 : 0.24) * (0.35 + 0.65 * airFade);
  }
}
