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
import { PX, worldX, worldY, SIM_FLOOR, hash01 } from "./shared.mjs";
import {
  normalMapForAtlas, softDotTexture, hardShadowTexture, smearedAtlasTexture, bleedAtlasCanvas, hdComposedCanvas,
  atlasFootMetrics, atlasKey, flatNormalTexture, releaseAtlasPixels, releaseAtlasCaches, atlasCacheStats,
} from "./textures.mjs";
import { IdleQueue } from "./atlas-pixels.mjs";
// 5.1 (#44): the pose-parity maths the 2D path owns — the authored-facing
// mirror, the prone settle, the hitstop tremble and the exhaustion hunch —
// in a dependency-free module Node can pin against drawFighter.
import {
  spriteMirror, postMirrorRotation, hitstopTremble, exhaustionLean, proneTransform, proneSettleLift,
} from "./sprite-pose.mjs";
// 5.1 (#45): per-stage sprite lighting (Somerset's constants became a table).
import { spriteLightFor, spriteLightFrame } from "./stage-lighting.mjs";
import { FIGHTER_MASK_LAYER } from "./post.mjs";
// v2.10 WALK: the authored-bank list is shared with the sim so 3D can never
// drift from the 2D path on which banks exist (motion, motion2, walk).
// v3.0: ...and on the unified bank's name, so the sheet-adjust branch below
// cannot drift from the sim's idea of what that bank is called.
import { AUTHORED_BANKS, UNIFIED_BANK } from "../../engine/fighter-kits.mjs";
// v5.1 TEMPO TELLS: the SAME phase/strength function drawFighter's 2D pass
// reads, so the whiff fringe and the re-arm wash land on identical ticks in
// both renderers (no host member: it is pure engine code, not a game.js read).
import { whiffTellState } from "../../engine/tempo-tells.mjs";

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

// Scene-matched sprite light anchors — since 5.1 (#45) PER STAGE, from
// stage-lighting.mjs (main.mjs hands the layer the current stage's
// descriptor in setStageLight):
//   - a practical screen-LEFT, so the screen-left silhouette edge catches
//     its rim (Somerset: the sodium streetlights);
//   - a practical screen-RIGHT (Somerset: the K&A neon, stronger the closer
//     the fighter stands to the sign);
//   - an overhead source keying the crown and the top of the body
//     (Somerset: the green-white station lamp).
// Every rim is gated by the normal map (the edge must actually FACE its
// light) — nothing glows uniformly around the silhouette.
//
// 5.1 (#44): the 2D down tilt is 1.35 rad at full recline; the host hands
// the constant over (downTiltRadians) so the settle's `share` cannot drift.
const DOWN_TILT_RADIANS_FALLBACK = 1.35;
// 5.1 (#40): rigs whose fighters have been gone this long (menus after a
// match, the arcade ladder's next pair not yet built) release their banks.
const IDLE_EVICT_SEC = 3;
// 5.1 SUPER-READY: the 2D aura's ember count at trailScale 1 (7; the balanced
// tier rounds down to its share, never below 3).
const AURA_EMBERS = 7;

function applyAtlasFrame(texture, frame) {
  const column = frame % ATLAS_COLUMNS;
  const row = Math.floor(frame / ATLAS_COLUMNS);
  texture.repeat.set(1 / ATLAS_COLUMNS, 1 / ATLAS_ROWS);
  texture.offset.set(column / ATLAS_COLUMNS, 1 - (row + 1) / ATLAS_ROWS);
}

// (The old silhouette-projected floor shadow is GONE: stacked on top of the
// shadow-mapped key silhouette, the per-foot ellipses and the penumbra it
// merged into one amorphous dark blob spanning both fighters — the exact
// grounding failure the AAA critic called out. Grounding now reads as: two
// tight per-foot contact ellipses + AO cores, ONE pose-true shadow-mapped
// silhouette from the key light, and the wet-floor mirror.)

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
    // 5.1 (#45): the body multiplier under the overhead source used to be a
    // shader constant (vec3(0.88, 1.12, 0.99) — the station lamp's green).
    // Per stage now: floodlight white on the Vet, heat-lamp amber at the
    // buffet, sky blue on the cruise deck.
    topTint: new THREE.Color(0.88, 1.12, 0.99),
    fillLeftColor: new THREE.Color(0x000000),
    fillRightColor: new THREE.Color(0x000000),
    floorBounce: new THREE.Color(0x000000),
    zoneTint: new THREE.Color(1, 1, 1),
    facing: { value: 1 },
    hitWhite: { value: 0 },
    // Impact halftone PROJECTED ON THE BODY (round-3, critic item 1): level +
    // sprite-local uv of the contact. The dot screen lives in the sprite's
    // own uv space, so it warps with the quad and is masked by the alpha test
    // by construction — never a flat screen-space tile.
    hitTone: { value: 0 },
    hitUv: new THREE.Vector2(0.5, 0.55),
    flashGuard: { value: 0 },
    superDim: { value: 0 },
    // 1 while this fighter is the super's VICTIM: at freeze the two fighters
    // stand point-blank, and identical hot amber rims on both made their
    // overlapping legs/boots fuse into one four-legged blob (the critic's
    // "doubled ghost legs"). The victim drops to a deep near-silhouette with
    // a whisper of rim so the pair reads as two depth-separated figures.
    superVictim: { value: 0 },
    // Screen-space sheen: lamp-relative x offset (moves the glint as the
    // fighter crosses the stage) + overall specular budget.
    lampDx: { value: 0 },
    specStrength: { value: 0.6 },
    // 5.1 SUPER-READY RIM: 0..1 pulsing accent-coloured silhouette stroke the
    // moment the meter can pay for a super (the KI/SF3 max-meter read). The
    // 2D path draws an enlarged accent silhouette behind the sprite; here the
    // same read is the edge term itself, so it wraps every pose exactly.
    readyRim: { value: 0 },
    readyColor: new THREE.Color(0xffffff),
    // v5.1 TEMPO TELLS: 0..1 hot-red silhouette stroke while a swing is
    // paying its whiff tax / re-arming (the 2D pass draws an enlarged red
    // silhouette behind the sprite), and 0..1 pale desaturating wash for the
    // re-arm gap and an eaten press (the 2D "screen" grey/white flash).
    whiffRim: { value: 0 },
    rearmDim: { value: 0 },
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
    shader.uniforms.uFbTopTint = { value: fb.topTint };
    shader.uniforms.uFbFillLeftColor = { value: fb.fillLeftColor };
    shader.uniforms.uFbFillRightColor = { value: fb.fillRightColor };
    shader.uniforms.uFbFloorBounce = { value: fb.floorBounce };
    shader.uniforms.uFbZoneTint = { value: fb.zoneTint };
    shader.uniforms.uFbFacing = fb.facing;
    shader.uniforms.uFbHitWhite = fb.hitWhite;
    shader.uniforms.uFbHitTone = fb.hitTone;
    shader.uniforms.uFbHitUv = { value: fb.hitUv };
    shader.uniforms.uFbFlashGuard = fb.flashGuard;
    shader.uniforms.uFbSuperDim = fb.superDim;
    shader.uniforms.uFbSuperVictim = fb.superVictim;
    shader.uniforms.uFbLampDx = fb.lampDx;
    shader.uniforms.uFbSpecStrength = fb.specStrength;
    shader.uniforms.uFbReadyRim = fb.readyRim;
    shader.uniforms.uFbReadyColor = { value: fb.readyColor };
    shader.uniforms.uFbWhiffRim = fb.whiffRim;
    shader.uniforms.uFbRearmDim = fb.rearmDim;
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
uniform vec3 uFbTopTint;
uniform vec3 uFbFillLeftColor;
uniform vec3 uFbFillRightColor;
uniform vec3 uFbFloorBounce;
uniform vec3 uFbZoneTint;
uniform float uFbFacing;
uniform float uFbHitWhite;
uniform float uFbHitTone;
uniform vec2 uFbHitUv;
uniform float uFbFlashGuard;
uniform float uFbSuperDim;
uniform float uFbSuperVictim;
uniform float uFbLampDx;
uniform float uFbSpecStrength;
uniform float uFbReadyRim;
uniform vec3 uFbReadyColor;
uniform float uFbWhiffRim;
uniform float uFbRearmDim;
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
// ONE-MEDIUM edge dither: jitter the cut threshold with a per-pixel screen
// hash so the silhouette's nearest-neighbour staircase breaks into dithered
// texels that the FXAA + shared film grain then melt into the stage, instead
// of a hard 1px stair-step against smooth painterly bokeh.
float fbDitherN = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
if (fbCut < 0.32 + fbDitherN * 0.36) discard;
diffuseColor.a = 1.0;`)
      .replace("#include <map_fragment>", `#include <map_fragment>
// --- ONE-MEDIUM softening: quarter-texel tent blur folds the atlas's
// nearest-neighbour micro-stairs into the same soft-media response as the
// painterly stage (the unsharp mask downstream restores macro edge snap).
vec3 fbSoft = (
  texture2D(map, vMapUv + uFbTexel * vec2(0.65, 0.65)).rgb +
  texture2D(map, vMapUv + uFbTexel * vec2(-0.65, 0.65)).rgb +
  texture2D(map, vMapUv + uFbTexel * vec2(0.65, -0.65)).rgb +
  texture2D(map, vMapUv + uFbTexel * vec2(-0.65, -0.65)).rgb) * 0.25;
diffuseColor.rgb = mix(diffuseColor.rgb, fbSoft, 0.38);
// --- ONE SPRITE PIPELINE (round-3, critic item 4): both fighter atlases are
// pulled through the SAME cel treatment so a painted-3D source and a
// hand-drawn cel source read as one game. (a) Luminance posterized into ~7
// painted tone steps — smooth airbrush ramps snap into cel bands, art that
// is already flat barely moves. (b) A shared interior INK LINE: strong
// colour gradients repaint as a consistent dark contour, giving both bodies
// the same line weight language.
float fbCelLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
float fbCelQ = (floor(fbCelLum * 7.0) + 0.5) / 7.0;
diffuseColor.rgb *= mix(1.0, fbCelQ / max(fbCelLum, 0.004), 0.32);
vec3 fbInkR = texture2D(map, vMapUv + vec2(uFbTexel.x * 1.6, 0.0)).rgb;
vec3 fbInkL2 = texture2D(map, vMapUv - vec2(uFbTexel.x * 1.6, 0.0)).rgb;
vec3 fbInkU = texture2D(map, vMapUv + vec2(0.0, uFbTexel.y * 1.6)).rgb;
vec3 fbInkD = texture2D(map, vMapUv - vec2(0.0, uFbTexel.y * 1.6)).rgb;
float fbInkG = length(vec2(
  dot(abs(fbInkR - fbInkL2), vec3(0.333)),
  dot(abs(fbInkU - fbInkD), vec3(0.333))));
float fbInkLine = smoothstep(0.18, 0.5, fbInkG);
diffuseColor.rgb *= 1.0 - fbInkLine * 0.26;
// --- Stage grade: desaturate, then SPLIT the shadow temperature across the
// body (critic fix j): the sodium-facing screen-left shadows stay street
// warm, the far side falls toward cool night blue — the warm-practical vs
// cool-air modelling every SF6 night fighter carries. A uniformly warm
// shadow tint had been mushing the whole body monochrome amber.
float fbLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(fbLum), 0.2);
float fbTone = smoothstep(0.08, 0.72, fbLum);
float fbAirU = mix(1.0 - vFbLocal.x, vFbLocal.x, step(0.0, uFbFacing));
vec3 fbShadowTint = mix(vec3(1.08, 0.94, 0.80), vec3(0.90, 0.95, 1.10), fbAirU * 0.75);
diffuseColor.rgb *= mix(fbShadowTint, vec3(0.98, 0.99, 1.03), fbTone);
float fbUp = clamp(vFbWorld.y * 0.5, 0.0, 1.0);
diffuseColor.rgb *= mix(vec3(1.05, 0.99, 0.9), vec3(0.94, 1.01, 1.0), fbUp);
// --- POSITION-DRIVEN ZONE GRADE (set per frame in poseRig): the body's own
// exposure + colour temperature track the practical the fighter stands under
// (sodium-warm left, green-white lamp centre, magenta by the K&A corner).
// Shadow-weighted: the lift lives in the mids/shadows so highlights keep
// their level — this is what stops a dark outfit sitting stops below the
// wall behind it while the highlights stay honest.
diffuseColor.rgb *= mix(uFbZoneTint, vec3(1.0), fbTone * 0.55);
// --- OVERHEAD-DOWNLIGHT VERTICAL RESPONSE: the stage's one hard lamp keys
// the crown/shoulders bright and lets the shins fall toward street shadow.
// Scaled by lamp proximity (uFbTopStrength tracks it), so walking under the
// lamp visibly re-lights the body top-down — the sprite is IN the room.
float fbLampGrad = mix(0.80, 1.12, smoothstep(0.04, 0.92, vFbLocal.y));
diffuseColor.rgb *= mix(1.0, fbLampGrad, 0.45 + 0.5 * clamp(uFbTopStrength, 0.0, 1.2));
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
// --- TOP-LIGHT term (the stage's overhead source: Somerset's station lamp,
// the Vet's floodlights, the buffet's heat lamps): a broad body gradient
// down from the head/shoulders, not just a silhouette stroke — the lamp
// genuinely keys the upper body the way it keys the floor below it. The
// body multiplier (uFbTopTint) is per stage since 5.1.
float fbTopBody = smoothstep(0.5, 0.96, vFbLocal.y) * clamp(uFbTopStrength, 0.0, 1.2);
diffuseColor.rgb = mix(diffuseColor.rgb,
  diffuseColor.rgb * uFbTopTint + uFbTopColor * 0.085,
  fbTopBody * 0.8);
// --- Warm FLOOR BOUNCE climbing the lower legs from the sodium-lit boards:
// screen-blended so shoes/shins visibly pick up the orange light pools (the
// critic's fix 2: the fighters must answer the floor light, obviously).
// Reaches to the knee, strongest at the shoe, and rides on ALL tones so
// bright trainers warm up too instead of only the shadow pixels.
float fbLow = 1.0 - smoothstep(0.02, 0.42, vFbLocal.y);
diffuseColor.rgb += uFbFloorBounce * fbLow * (vec3(1.0) - diffuseColor.rgb) * (0.75 + 0.25 * (1.0 - fbTone));
// Super freeze: the body drops toward a silhouette (rims boosted in JS).
// The VICTIM digs deeper — a dark shape against the duotone stage, the way
// SF6 keeps the super's owner lit while time stops around the other guy.
diffuseColor.rgb *= 1.0 - uFbSuperDim * (0.62 + uFbSuperVictim * 0.24);
// 5.1 TEMPO TELLS: re-arm wash — the body drops toward a pale grey for the
// 4-frame gap (disarmed) and pops paler for an eaten press; luminance-
// preserving so the pose stays readable under it.
diffuseColor.rgb = mix(diffuseColor.rgb,
  vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * 0.55 + 0.42, uFbRearmDim);
// ...and the whiff casts the body red from the inside as well as the edge:
// on Somerset the K&A magenta rims and a super-ready accent aura sit right
// on top of a red edge stroke (measured: the stroke alone was hard to pick
// out of the stage's own pink), so the 2D fringe+ghost mass gets its 3D
// counterpart as a warm interior tint that no stage light supplies.
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 0.5, 0.55), uFbWhiffRim * 0.4);`)
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
// Wider top reach (2.6/5.2 texels): the lamp strip must read as a STRIP
// along hair/shoulders, not a 1px thread the FXAA melts away.
float fbEdgeT = clamp((1.0 - texture2D(map, vMapUv + fbTopOff * 2.6).a) * 0.85
  + (1.0 - texture2D(map, vMapUv + fbTopOff * 5.2).a) * 0.4, 0.0, 1.0);
float fbFaceL = clamp(-normal.x * 2.1, 0.0, 1.0);
float fbFaceR = clamp(normal.x * 2.1, 0.0, 1.0);
float fbFaceT = clamp(normal.y * 1.8, 0.0, 1.0);
float fbRimL = fbEdgeL * pow(fbFaceL, 1.25);
// The K&A neon hangs high on screen-right: its rim fades out down the legs
// instead of outlining the trainers in pink.
float fbRimR = fbEdgeR * pow(fbFaceR, 1.25) * (0.25 + 0.75 * vFbLocal.y);
// Overhead-lamp rim STRIP (critic fix 2): the green-cyan stroke reads along
// hair/shoulders — weighted hard toward the top of the body and allowed to
// spill onto the upper side edges the way a real downlight wraps a crown.
float fbTopBand = smoothstep(0.55, 0.9, vFbLocal.y);
float fbRimT = fbEdgeT * pow(fbFaceT, 1.1) * (0.4 + 0.6 * fbTopBand)
  + (fbEdgeL + fbEdgeR) * 0.5 * fbTopBand * clamp(normal.y * 1.4 + 0.2, 0.0, 1.0);
float fbGuardFade = 1.0 - uFbFlashGuard * 0.4;
// Freeze rim boost is the ATTACKER's: the victim keeps his normal rims so
// only one silhouette burns hot under the banner.
float fbSuperRim = 1.0 + uFbSuperDim * 1.5 * (1.0 - uFbSuperVictim * 0.85);
totalEmissiveRadiance += uFbRimLeftColor * (fbRimL * uFbRimLeftStrength * fbGuardFade * fbSuperRim);
totalEmissiveRadiance += uFbRimRightColor * (fbRimR * uFbRimRightStrength * fbGuardFade * fbSuperRim);
// Top-lamp strip HELD UNDER THE BLOOM KNEE (round-3, critic item 7): at the
// old 1.75x both crowns burned past the threshold and bloom painted an
// identical green-white halo BEHIND each head — matte residue. The strip
// stays a lit edge on hair/shoulders; the lamp glow belongs to the lamp.
totalEmissiveRadiance += uFbTopColor * (fbRimT * uFbTopStrength * 0.95 * fbGuardFade * fbSuperRim);
// Unlit-side edge discipline: silhouette pixels whose normals face AWAY from
// every practical darken toward the night instead of glowing.
float fbEdgeAny = clamp(fbEdgeL + fbEdgeR + fbEdgeT * 0.5, 0.0, 1.0);
float fbLit = max(fbFaceL, max(fbFaceR, fbFaceT * 0.7));
diffuseColor.rgb *= 1.0 - fbEdgeAny * (1.0 - fbLit) * 0.45;
// --- BAKED-OUTLINE REPLACEMENT (one-medium fix): the atlas's hard black
// contour, where it rides the silhouette, is repainted as stage rim light —
// sodium-warm screen-left/top, K&A magenta on the neon side — so the sprite
// is bounded by scene light like every 3D prop, not by printer ink. Unlit
// stretches melt into the night instead of reading as a black sticker edge.
float fbInk = fbEdgeAny * (1.0 - smoothstep(0.035, 0.16, fbLum));
vec3 fbEdgeLight = uFbRimLeftColor * (fbEdgeL * (0.45 + 0.55 * fbFaceL) * uFbRimLeftStrength)
  + uFbRimRightColor * (fbEdgeR * (0.3 + 0.7 * fbFaceR) * uFbRimRightStrength)
  + uFbTopColor * (fbEdgeT * (0.4 + 0.6 * fbFaceT) * uFbTopStrength);
diffuseColor.rgb = mix(diffuseColor.rgb, fbEdgeLight * 0.5 + vec3(0.02, 0.02, 0.03), fbInk * 0.8);
// --- SCREEN-SPACE SHEEN (materials): normal-mapped glints keyed to the
// overhead lamp — moving highlights on Deathblow's metal gauntlet, Jez's
// glasses lenses, glove leather, and a faint sweat sheen on skin. Gloss
// favours low-saturation surfaces (metal/glass/leather) and bright mids
// (sweat), and the glint direction slides with uFbLampDx as fighters move.
vec3 fbSpecDir = normalize(vec3(-uFbLampDx * 0.42, 0.58, 0.72));
float fbSpecNdl = clamp(dot(normalize(normal), fbSpecDir), 0.0, 1.0);
// TWO-STEP CEL SPECULAR (round-3, critic item 4): the same quantized
// highlight language on BOTH fighters — a broad soft sheen step and a tight
// hot glint step, each a hard cel band instead of a continuous exponent
// ramp. Bounded: the tight lobe can no longer integrate into the white
// glitch-blob that sat on Deathblow's glasses lens.
float fbSpecTight = pow(fbSpecNdl, 26.0);
float fbSpecBroad = pow(fbSpecNdl, 5.0);
float fbCmax = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
float fbCmin = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
float fbSatSpec = (fbCmax - fbCmin) / max(fbCmax, 0.001);
// Gloss gate: bright surfaces sweat/shine as before, but DARK desaturated
// surfaces (gauntlet metal, glove leather) now keep a specular voice too —
// dark + colourless + lit is exactly what metal looks like, and gating all
// glints by luminance had silenced every metal in frame.
float fbGloss = (0.3 + 0.7 * (1.0 - fbSatSpec))
  * max(smoothstep(0.1, 0.5, fbLum), (1.0 - fbSatSpec) * 0.6 * smoothstep(0.025, 0.1, fbLum));
float fbSpecStep = smoothstep(0.22, 0.3, fbSpecBroad) * 0.24
  + smoothstep(0.34, 0.42, fbSpecTight) * 0.62;
totalEmissiveRadiance += (uFbTopColor * 0.85 + vec3(0.15))
  * (fbSpecStep * fbGloss * uFbSpecStrength);
// Super freeze: the ATTACKER is lit BY the freeze — a warm amber halo hugs
// his silhouette and a faint body lift keeps him above the dimmed stage.
// The victim gets almost none of it (identical halos on two point-blank
// fighters is what fused their legs into the "doubled ghost legs" read).
totalEmissiveRadiance += vec3(1.0, 0.56, 0.2)
  * (uFbSuperDim * (fbEdgeAny * 0.7 + 0.08) * (1.0 - uFbSuperVictim * 0.88));
// 5.1 SUPER-READY: the whole silhouette wears a pulsing stroke in the
// fighter's accent, plus a whisper of body lift, while the meter can pay for
// a super — gameplay information (the opponent can cash a super NOW), so it
// rides above the flash guard and the freeze dim rather than under them.
totalEmissiveRadiance += uFbReadyColor * (uFbReadyRim * (fbEdgeAny * 1.35 + 0.05));
// 5.1 TEMPO TELLS: the whiff fringe — a hot red stroke on the same edge
// term, NOT the fighter's accent, so it never reads as the super aura. It
// rides above the flash guard like the ready rim: "that swing is costing
// you" is gameplay information the opponent needs to see too (punish).
totalEmissiveRadiance += vec3(1.0, 0.25, 0.33) * (uFbWhiffRim * (fbEdgeAny * 1.7 + 0.08));
// --- Flash guard (SF6 Drive-Impact discipline): while a burst is live the
// interior keeps its OWN contrast (deepened S-curve, not a flat wash) and
// the silhouette carries a hot high-contrast rim — the character must stay
// fully readable through the flash instead of collapsing into a khaki blob.
diffuseColor.rgb *= 1.0 - uFbFlashGuard * (0.14 + 0.6 * fbEdgeAny);
vec3 fbGuardDeep = diffuseColor.rgb * diffuseColor.rgb * (3.0 - 2.0 * diffuseColor.rgb);
diffuseColor.rgb = mix(diffuseColor.rgb, fbGuardDeep, uFbFlashGuard * 0.6);
totalEmissiveRadiance += vec3(1.12, 0.98, 0.8) * (uFbFlashGuard * fbEdgeAny * 0.95);
// Impact PAIN FLASH on the receiver only (round-3, critic item 1): masked to
// the sprite alpha by construction — never a screen-space circle. Warm
// red-shifted highlight snap (the body reads STRUCK, hot at the wound) with
// the shadows CRUSHED instead of lifted, so the receiver's internal contrast
// goes UP through the flash — >=50% readable is the contract.
totalEmissiveRadiance += vec3(1.08, 0.82, 0.68) * (uFbHitWhite * (0.16 + 0.84 * fbLum));
vec3 fbPainDeep = diffuseColor.rgb * diffuseColor.rgb * (3.0 - 2.0 * diffuseColor.rgb);
diffuseColor.rgb = mix(diffuseColor.rgb, fbPainDeep, uFbHitWhite * 0.45);
// IMPACT HALFTONE PROJECTED ONTO THE STRUCK BODY: a dot screen in the
// sprite's OWN uv space, windowed around the contact point — dots swell in
// the shadow tones, prick in the highlights, and warp/mask with the pose by
// construction. The SF6 print-language answer, worn by the body itself.
if (uFbHitTone > 0.001) {
  vec2 fbToneD = (vFbLocal - uFbHitUv) * vec2(1.0, 1.7);
  float fbToneWin = smoothstep(0.42, 0.1, length(fbToneD));
  vec2 fbToneCell = fract(vFbLocal * vec2(30.0, 52.0)) - 0.5;
  float fbToneR = (0.16 + 0.3 * (1.0 - fbLum)) * fbToneWin * uFbHitTone;
  float fbToneDot = smoothstep(fbToneR, fbToneR - 0.14, length(fbToneCell));
  totalEmissiveRadiance += vec3(1.15, 0.62, 0.4) * (fbToneDot * fbToneWin * uFbHitTone * 0.5);
  diffuseColor.rgb *= 1.0 - fbToneDot * fbToneWin * uFbHitTone * 0.3;
}`);
  };
  // Distinct program per patched material (uniforms differ per bank).
  // v12 (5.1): uFbTopTint joined the uniform set; v13 (5.1): uFbWhiffRim /
  // uFbRearmDim (the tempo tells) joined it — both landed in the same wave.
  material.customProgramCacheKey = () => "fb-sprite-grade-v13";
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
// A mirror NEVER rises above the water (round-3 glitch-tower kill): any
// reflection texel that lands above the ground plane — rotated cinematic
// poses, freeze-frame partial states — is simply not drawn. This is the
// hard guard behind the "segmented boot column" between the super-freeze
// silhouettes.
if (vFbWorld.y > 0.015) discard;
// Height fade: mirror strongest at the contact line, releasing by the chest
// so the legs/torso silhouette genuinely reads before the water eats it.
diffuseColor.a *= 1.0 - smoothstep(0.03, 0.72, vFbRawUv.y);
// Roughness breakup: tall thin noise ribbons (x tight, y long) so the mirror
// smears into interrupted vertical streaks like SF6 night-stage water.
// Softened floor (0.72): the breakup interrupts the mirror without shredding
// the silhouette into anonymous ribbons.
float fbStreak = fbVnoise(vec2(vFbWorld.x * 11.0, vFbWorld.y * 1.7));
fbStreak = 0.72 + 0.28 * smoothstep(0.25, 0.8, fbStreak);
// Fine horizontal ripple bands riding on the streaks.
float fbRipple = 0.85 + 0.15 * sin(vFbWorld.y * 34.0 + vFbWorld.x * 3.0);
// FLOOR-SEAM BREAKS: the concrete slab joints cut the mirror into segments.
// Pitch matched to the ground material's expansion-joint spacing (round-3
// one-material-story fix) so the cuts and the drawn grid agree.
float fbSeamP = fract(vFbWorld.y * 0.62 + vFbWorld.x * 0.07 + 0.31);
float fbSeam = 0.42 + 0.58 * smoothstep(0.012, 0.06, min(fbSeamP, 1.0 - fbSeamP));
// Gentle wetness variation (the old hard puddle gate erased the mirror on
// the boards where it happened to land, which read as NO reflection at all).
float fbPool = smoothstep(0.2, 0.55, fbVnoise(vec2(vFbWorld.x * 0.45 + 4.7, vFbWorld.y * 0.3 + 1.3)));
diffuseColor.a *= fbStreak * fbRipple * fbSeam * (0.72 + 0.28 * fbPool);`);
  };
  material.customProgramCacheKey = () => "fb-sprite-reflection-v7";
}

export class FighterLayer {
  constructor(host) {
    this.host = host;
    this.group = new THREE.Group();
    this.group.name = "fighters";
    this.rigs = [null, null];
    this.blobTexture = softDotTexture(128, "rgba(0,0,0,1)", "rgba(0,0,0,0)");
    this.hardBlobTexture = hardShadowTexture(128);
    // 5.1 SUPER-READY aura + ember sprite (white; tinted per fighter accent).
    this.auraTexture = softDotTexture(128);
    // Wired by main.mjs to the impact-VFX layer once both layers exist.
    this.getFlashLevel = () => 0;
    // Wired by main.mjs: { x, color, level } of the latest impact, so the
    // sprites pick up coloured light spill from the burst (fix: impacts must
    // relight the fighters, not just the air).
    this.getImpactSpill = () => null;
    // Eased 0..1 super-freeze level, set by main.mjs: body drops toward a
    // rim-lit silhouette while the cut-in owns the frame.
    this.superDim = 0;
    // 5.1 (#45): the current stage's sprite-light descriptor (main.mjs sets
    // it in buildStage); Somerset's numbers until a stage says otherwise.
    this.spriteLight = spriteLightFor("somerset");
    this.stageLightColors = null;
    // 5.1 (#40): bank builds run as idle-time steps off the render thread.
    this.queue = new IdleQueue();
    this.rigSerial = 0;
    this.noFighterSec = 0;
    // QA tallies: how many banks were built, how many chains finished, and
    // how many sheets were evicted (drives the "no growth across a ladder"
    // probe).
    this.bankStats = { built: 0, ready: 0, evicted: 0, warmed: 0, lateFallbacks: 0 };
  }

  // The normal-map resolution step for this tier: the balanced tier gets a
  // half-resolution field — a quarter of the kernel work and of the GPU
  // bytes, and the 3x3 blur already softens the field past what the halving
  // loses. Never skipped outright: the rims are GATED by these normals, and a
  // flat map is a fighter with no rims at all.
  normalStep() {
    return this.host.getPerformanceProfile?.()?.id === "balanced" ? 2 : 1;
  }

  // 5.1 (#40): a bank is DRAWABLE the frame it is asked for and FINISHED a
  // few idle slices later. The shell goes up synchronously with the raw
  // sheet as its colour map (one texture upload; the shader's 1px-eroded
  // alpha test hides most of the white fringe the bleed exists to kill) and
  // a shared flat normal map (same program defines, so the real map lands
  // without a recompile). The queued chain then swaps in, one idle step
  // each: foot metrics -> bled colour map -> smeared mirror map -> normal
  // map (-> HD composite). Each step checks `disposed` first, so a rig torn
  // down mid-chain leaves nothing behind.
  buildBank(image, hdPath = null, { key = null, priority = 0, warm = false } = {}) {
    const raw = new THREE.CanvasTexture(image);
    raw.colorSpace = THREE.SRGBColorSpace;
    raw.anisotropy = 8;
    applyAtlasFrame(raw, 0);
    const normalMap = flatNormalTexture();
    const material = new THREE.MeshStandardMaterial({
      map: raw,
      normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.78,
      metalness: 0.04,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      emissiveMap: raw,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
      envMapIntensity: 0.4,
    });
    const fb = patchSpriteMaterial(material, image.naturalWidth, image.naturalHeight);
    // Shadow-map depth material: the SAME alpha-tested frame window, so the
    // key light prints the fighter's true silhouette into its shadow map.
    const depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: raw,
      alphaTest: 0.5,
    });
    // Wet-floor reflection: VERTICALLY smeared atlas — the mirror keeps the
    // fighter's own flipped silhouette (horizontal detail survives, so it
    // tracks every pose) while water drags the image into vertical streaks.
    // Faded by height, tinted per-frame toward whichever practical the
    // fighter stands under (poseRig grades the mirror colour).
    const reflMaterial = new THREE.MeshBasicMaterial({
      map: raw,
      transparent: true,
      opacity: 0.34,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      // TRUE-PALETTE mirror (round-3, critic item 3): NO warm lift at all —
      // a dark shirt must reflect dark, not orange-brown. The mirror's colour
      // is the smeared atlas's own rows with only a whisper of cool water.
      color: new THREE.Color(1.0, 1.01, 1.06),
      fog: false,
    });
    patchReflectionMaterial(reflMaterial);
    const bank = {
      image, hdImage: null, key,
      map: raw, rawMap: raw, normalMap, material, depthMaterial, reflMap: raw, reflMaterial, fb,
      // Per-frame sole line + foot positions (kills the hover, drives the
      // per-foot contact shadows): null until the metrics step has run —
      // poseRig falls back to the quad bottom for those first frames.
      footMetrics: null,
      frame: 0, disposed: false, ready: false, stage: "raw", warm,
    };
    this.bankStats.built += 1;
    if (warm) this.bankStats.warmed += 1;
    const step = (name, fn) => this.queue.push(() => {
      if (bank.disposed) return;
      fn();
      bank.stage = name;
    }, { key, priority });
    step("metrics", () => {
      bank.footMetrics = atlasFootMetrics(image);
    });
    step("bleed", () => {
      const bled = atlasColorTexture(image);
      applyAtlasFrame(bled, bank.frame);
      bank.map = bled;
      material.map = bled;
      material.emissiveMap = bled;
      depthMaterial.map = bled;
      material.needsUpdate = true;
      depthMaterial.needsUpdate = true;
    });
    step("smear", () => {
      const refl = smearedAtlasTexture(image);
      applyAtlasFrame(refl, bank.frame);
      bank.reflMap = refl;
      reflMaterial.map = refl;
      reflMaterial.needsUpdate = true;
      raw.dispose();
      bank.rawMap = null;
    });
    step("normal", () => {
      const normal = normalMapForAtlas(image, { step: this.normalStep() });
      // Normal map shares the frame window via its own transform.
      normal.matrixAutoUpdate = true;
      applyAtlasFrame(normal, bank.frame);
      bank.normalMap = normal;
      material.normalMap = normal;
      material.needsUpdate = true;
      // The shared pixel read has served its three consumers.
      releaseAtlasPixels(image);
      bank.ready = true;
      this.bankStats.ready += 1;
    });
    // HD swap: once the 2x atlas arrives, replace the colour/emissive/depth
    // map with the HD composite. Alpha is byte-identical NN-2x, so pose,
    // shadow silhouette and rim sampling stay aligned — only fb.texel moves
    // to the finer grid. Normal + reflection maps stay SD (blurred anyway).
    // The composite (a 2560x2560 canvas draw + upload) is itself an idle
    // step, queued only when the image has arrived.
    if (hdPath) {
      step("hd-request", () => {
        loadHdImage(hdPath).then((hdImage) => {
          if (!hdImage || bank.disposed) return;
          bank.hdImage = hdImage;
          step("hd", () => {
            const hdTexture = new THREE.CanvasTexture(hdComposedCanvas(hdImage, image));
            hdTexture.colorSpace = THREE.SRGBColorSpace;
            hdTexture.anisotropy = 8;
            applyAtlasFrame(hdTexture, bank.frame);
            const old = bank.map;
            bank.map = hdTexture;
            material.map = hdTexture;
            material.emissiveMap = hdTexture;
            depthMaterial.map = hdTexture;
            fb.texel.set(1 / hdImage.naturalWidth, 1 / hdImage.naturalHeight);
            material.needsUpdate = true;
            depthMaterial.needsUpdate = true;
            if (old !== bank.rawMap) old.dispose();
          });
        });
      });
    }
    return bank;
  }

  // 5.1 (#45): main.mjs hands over the stage's descriptor when the stage is
  // (re)built. Resolved once into THREE colours here so poseRig never
  // allocates per frame.
  setStageLight(descriptor) {
    this.spriteLight = descriptor || spriteLightFor("somerset");
    this.stageLightColors = null;
  }

  // 5.1 (#40): every authored bank whose OWN sheet is already decoded
  // (preloadAuthoredBanks warms them before FIGHT!) gets its shell and its
  // chain at rig build, priority-ordered behind base and specials, so the
  // first jab / first hit / first crouch of a fight no longer builds a bank
  // on a gameplay frame. The host's fighterBankSheet gate is what keeps the
  // base-sheet fallback in fighterAtlasFor from being mistaken for a bank
  // the fighter does not have.
  warmAuthoredBanks(rig, fighter) {
    const host = this.host;
    if (!host.fighterAtlasFor || !host.fighterBankSheet) return 0;
    let warmed = 0;
    AUTHORED_BANKS.forEach((bankName, index) => {
      if (rig.banks[bankName]) return;
      const own = host.fighterBankSheet(fighter.def.id, bankName);
      if (!own?.complete || !own.naturalWidth) return;
      const image = host.fighterAtlasFor(fighter, bankName);
      if (!image?.complete || !image.naturalWidth) return;
      rig.banks[bankName] = this.buildBank(image, null, { key: rig.key, priority: 2 + index, warm: true });
      warmed += 1;
    });
    return warmed;
  }

  buildRig(fighter) {
    const host = this.host;
    const id = fighter.def.id;
    // Wave 16 alt palettes: the host hands the palette-resolved atlas (an
    // Image for the primary colors, a remapped canvas shimmed with
    // complete/naturalWidth for the alt). HD swaps are skipped for alt rigs —
    // the HD sheets carry the primary colors only.
    const paletteKey = host.fighterPaletteKey ? host.fighterPaletteKey(fighter) : "";
    const baseImage = host.fighterAtlasFor ? host.fighterAtlasFor(fighter, "base") : host.fighterAtlases[id];
    const moveImage = host.fighterAtlasFor ? host.fighterAtlasFor(fighter, "specials") : host.fighterMoveAtlases[id];
    if (!baseImage?.complete || !baseImage.naturalWidth) return null;
    // 2.7 critic round: the host's availability gate decides whether an HD
    // sheet exists for this fighter/bank (renderer/hd/ covers only part of
    // the roster — devil has no sheets at all). No gate, no request: a
    // missing entry silently keeps the SD atlas instead of 404ing.
    const hdFor = (bank) => (paletteKey || !host.hdSheetPath ? null : host.hdSheetPath(id, bank));
    this.rigSerial += 1;
    const key = `rig:${this.rigSerial}:${id}`;
    const banks = { base: this.buildBank(baseImage, hdFor("base"), { key, priority: 0 }) };
    if (moveImage?.complete && moveImage.naturalWidth) {
      banks.specials = this.buildBank(moveImage, hdFor("specials"), { key, priority: 1 });
    }

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0); // feet-anchored, matching drawAtlasFrame
    const mesh = new THREE.Mesh(geometry, banks.base.material);
    mesh.customDepthMaterial = banks.base.depthMaterial;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    // Also on the fighter-mask layer: the painterly stage pass renders this
    // layer alone to build its sprite-protection mask.
    mesh.layers.enable(FIGHTER_MASK_LAYER);

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
    // Tight near-black AO cores INSIDE the sole ellipses: the darkest read
    // sits directly under each shoe, which is what locks feet to the floor.
    const coreA = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial(this.hardBlobTexture, 0.9));
    const coreB = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial(this.hardBlobTexture, 0.9));
    for (const blob of [penumbra, footA, footB, coreA, coreB]) {
      blob.rotation.x = -Math.PI / 2;
      // ABOVE the stage's additive wet-streak light pools (renderOrder 2) and
      // the mirror (4): a sodium pool crossing a shoe was re-lighting the
      // contact patch INTO a light halo — feet must darken the floor last
      // (critic: "left shoe sits on a light halo").
      blob.renderOrder = 5;
      shadow.add(blob);
    }
    footA.renderOrder = footB.renderOrder = 6; // sole ellipses read over the stretch
    coreA.renderOrder = coreB.renderOrder = 6;

    // 5.1 SUPER-READY aura (2D parity, and VISIBLE): a soft additive accent
    // glow behind the body at hip height + the seven shoulder embers, both
    // children of the feet-anchored root so they ride the lunge and the flip.
    // Ember positions are the 2D formula exactly (hashed from the sim tick,
    // never simulated), so a rollback has nothing to rewind and both
    // renderers put the same ember in the same place on the same tick.
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: this.auraTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      color: new THREE.Color(0xffffff),
    }));
    aura.position.z = -0.04;
    aura.renderOrder = 3;
    aura.visible = false;
    root.add(aura);
    const emberPositions = new Float32Array(AURA_EMBERS * 3);
    const emberColors = new Float32Array(AURA_EMBERS * 3);
    const emberGeometry = new THREE.BufferGeometry();
    emberGeometry.setAttribute("position", new THREE.BufferAttribute(emberPositions, 3));
    emberGeometry.setAttribute("color", new THREE.BufferAttribute(emberColors, 3));
    const embers = new THREE.Points(emberGeometry, new THREE.PointsMaterial({
      size: 0.04,
      map: this.auraTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
    }));
    embers.frustumCulled = false;
    embers.renderOrder = 6;
    embers.visible = false;
    root.add(embers);

    this.group.add(shadow);
    this.group.add(reflRoot);
    this.group.add(root);
    const rig = {
      id, key, paletteKey, banks, mesh, root, reflMesh, reflRoot, shadow, footA, footB, coreA, coreB, penumbra,
      aura, embers,
      currentBank: "base", lastHitFlash: 0, hitWhiteTtl: 0, hitToneTtl: 0,
    };
    this.warmAuthoredBanks(rig, fighter);
    return rig;
  }

  // 5.1 (#40): disposal now EVICTS. Every texture the rig owns is released,
  // its queued build steps are dropped, and every sheet no other live rig
  // draws from has its canvases / pixel read / normal map cleared from the
  // module caches in textures.mjs — an arcade ladder used to leave ~200 MB
  // of canvases resident per fighter met in 3D.
  disposeRig(rig) {
    if (!rig) return;
    this.queue.cancel(rig.key);
    this.group.remove(rig.root);
    this.group.remove(rig.reflRoot);
    this.group.remove(rig.shadow);
    const other = this.rigs.find((candidate) => candidate && candidate !== rig);
    const stillDrawn = (image) => Boolean(other && image
      && Object.values(other.banks).some((bank) => atlasKey(bank.image) === atlasKey(image)
        || (bank.hdImage && atlasKey(bank.hdImage) === atlasKey(image))));
    for (const bank of Object.values(rig.banks)) {
      bank.disposed = true; // cancels any in-flight HD swap
      bank.material.dispose();
      bank.depthMaterial.dispose();
      bank.reflMaterial.dispose();
      bank.map.dispose();
      if (bank.reflMap !== bank.map) bank.reflMap.dispose();
      if (bank.rawMap && bank.rawMap !== bank.map && bank.rawMap !== bank.reflMap) bank.rawMap.dispose();
      for (const image of [bank.image, bank.hdImage]) {
        if (!image || stillDrawn(image)) continue;
        this.bankStats.evicted += releaseAtlasCaches(image);
      }
    }
    rig.mesh.geometry.dispose();
    rig.reflMesh.geometry.dispose();
    if (rig.aura) {
      rig.aura.geometry.dispose();
      rig.aura.material.dispose();
    }
    if (rig.embers) {
      rig.embers.geometry.dispose();
      rig.embers.material.dispose();
    }
    for (const blob of [rig.footA, rig.footB, rig.coreA, rig.coreB, rig.penumbra]) {
      blob.geometry.dispose();
      blob.material.dispose();
    }
  }

  update(state, dtSec, timeSec) {
    const fighters = state.fighters || [];
    // 5.1 (#40): no fighters for a while (menus, the ladder between pairs)
    // releases both rigs — the next pair's banks rebuild off the frame.
    if (!fighters[0] && !fighters[1]) {
      this.noFighterSec += dtSec;
      if (this.noFighterSec >= IDLE_EVICT_SEC && (this.rigs[0] || this.rigs[1])) {
        for (let side = 0; side < 2; side += 1) {
          this.disposeRig(this.rigs[side]);
          this.rigs[side] = null;
        }
      }
    } else {
      this.noFighterSec = 0;
    }
    for (let side = 0; side < 2; side += 1) {
      const fighter = fighters[side];
      let rig = this.rigs[side];
      if (!fighter) {
        if (rig) rig.root.visible = rig.reflRoot.visible = rig.shadow.visible = false;
        continue;
      }
      // Wave 16: a changed palette pick rebuilds the side's rig exactly like
      // a changed fighter (the alt atlas is a different texture source).
      const paletteKey = this.host.fighterPaletteKey ? this.host.fighterPaletteKey(fighter) : "";
      if (!rig || rig.id !== fighter.def.id || (rig.paletteKey || "") !== paletteKey) {
        this.disposeRig(rig);
        rig = this.buildRig(fighter);
        this.rigs[side] = rig;
        if (!rig) continue;
      }
      // v4.3: a side drawn as a rigged mesh hides its billboard (and the
      // billboard's mirror + contact shadows) for that frame only.
      if (this.meshActive?.(side)) {
        rig.root.visible = rig.reflRoot.visible = rig.shadow.visible = false;
        continue;
      }
      rig.root.visible = rig.reflRoot.visible = rig.shadow.visible = true;
      this.poseRig(rig, fighter, state, timeSec, dtSec);
    }
  }

  // v2.7 FRAMES: the SD motion sheet becomes a bank the first time a motion
  // pose arrives with its image decoded. Built with NO hdPath — there are no
  // HD motion sheets, so 3D must never request renderer/hd/ for this bank.
  // v2.9 FLOW: the motion2 bank rides the same lazy path (SD only, same
  // no-renderer/hd rule).
  // v2.10 WALK: and so does the walk bank — resolved from the SD sheet in
  // assets/walk/, never from renderer/hd/ (no HD walk sheets exist).
  // v3.0 UNIFIED: and so does the unified bank — SD sheet in assets/unified/,
  // never renderer/hd/. buildBank is called with NO hdPath on this path, so
  // the 2x swap can never be requested for it.
  // 5.1 (#40): a bank that reaches here was not warm at rig build (its
  // sheet decoded after the intro). The shell is drawable this frame — one
  // raw upload, not the old four-kernel build — and the chain finishes on
  // idle slices. Counted so a probe can tell "warmed at build" from "built
  // on first use".
  ensureMotionBank(rig, fighter, bankName = "motion") {
    if (rig.banks[bankName]) return true;
    const host = this.host;
    const image = host.fighterAtlasFor ? host.fighterAtlasFor(fighter, bankName) : null;
    if (!image?.complete || !image.naturalWidth) return false;
    rig.banks[bankName] = this.buildBank(image, null, { key: rig.key, priority: 1 });
    this.bankStats.lateFallbacks += 1;
    return true;
  }

  // QA surface (main.mjs stats()): bank readiness per side + cache sizes.
  bankReport() {
    return {
      ...this.bankStats,
      pending: this.queue.pending,
      sides: this.rigs.map((rig) => (rig ? Object.fromEntries(Object.entries(rig.banks)
        .map(([name, bank]) => [name, bank.ready ? "ready" : bank.stage])) : null)),
      caches: atlasCacheStats(),
      stageLight: this.spriteLight?.id ?? null,
    };
  }

  // QA: run every queued build step now (the browser probe's "warm, then
  // measure" path).
  drainBankQueue() {
    return this.queue.drain();
  }

  poseRig(rig, fighter, state, timeSec, dtSec = 0) {
    const host = this.host;
    let pose = host.fighterAnimationPose(fighter);
    // The host only emits an authored bank once the sheet is loaded and the
    // manifest accepts the cell, but the rig's texture may still be a frame
    // behind — the descriptor's own fallback covers the gap.
    if (AUTHORED_BANKS.includes(pose.bank)
      && !this.ensureMotionBank(rig, fighter, pose.bank)) {
      pose = pose.fallback || { bank: "base", frame: pose.frame };
    }
    const bankName = pose.bank === "specials" && rig.banks.specials ? "specials"
      : AUTHORED_BANKS.includes(pose.bank) && rig.banks[pose.bank]
        ? pose.bank : "base";
    // v3.0: the host owns the ALL-SIXTEEN-OR-NOTHING gate; the rig only needs
    // to know the answer so its height reconciliations match the canvas.
    const unifiedActive = host.isUnifiedFighter
      ? host.isUnifiedFighter(fighter.def.id) : false;
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
    bank.frame = pose.frame; // a texture landing mid-chain opens on this cell

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
    // v2.9 critic round: the whole-sheet adjust times the PER-CELL adjust
    // (M3 — the base bank's deep-squat crouch cells are drawn oversized), so
    // the 3D rig holds the same constant mass across the crouch handoff the
    // 2D path does.
    const sizeAdjust = (bankName === "specials" ? (host.moveSheetAdjust[fighter.def.id] || 1)
      : bankName === "motion" || bankName === "motion2" || bankName === "motion3"
        ? (host.motionSheetAdjust?.[fighter.def.id] || 1)
        // v2.10 WALK: its own table — the walk sheets normalise to each
        // fighter's measured BASE WALK height, not to the motion banks'
        // convention, so they must not inherit that correction.
        : bankName === "walk" ? (host.walkSheetAdjust?.[fighter.def.id] || 1)
          // v3.0 UNIFIED: also its own table. The unified sheets DO share the
          // motion banks' 306px standing convention, but a future sheet built
          // to another one must not inherit a correction fitted to this one.
          : bankName === UNIFIED_BANK ? (host.unifiedSheetAdjust?.[fighter.def.id] || 1) : 1)
      // v2.9 critic round 2 (M4): cellDrawAdjust rolls the oversized-crouch
      // correction together with the guard-flinch height reconciliation, so
      // the rig and the canvas apply one identical scale rule per cell.
      // v3.0: ...and the same unified flag the 2D path passes, so both
      // renderers reconcile the block-flinch against the same guard drawing.
      * (host.cellDrawAdjust
        ? host.cellDrawAdjust(fighter.def.id, bankName, pose.frame, { unified: unifiedActive })
        : host.baseCellDrawAdjust ? host.baseCellDrawAdjust(fighter.def.id, bankName, pose.frame) : 1);
    const renderSize = host.fighterRenderSize(fighter.def.id) * sizeAdjust * PX;
    // v2.9 critic round (M5): per-cell floor registration in sim pixels — the
    // Commissioner's older base sheet bottoms out anywhere from 277 to 320.
    // v2.9 critic round 2 (B2): plus the ramped airborne body-centre anchor,
    // so the rig cannot disagree with the canvas about where an airborne cell
    // sits. Same pure helper, same ramp.
    const airHeight = fighter.grounded ? 0 : Math.max(0, SIM_FLOOR - fighter.y);
    const floorFix = host.cellVerticalOffset
      ? host.cellVerticalOffset(fighter.def.id, bankName, pose.frame, airHeight) / 320
        * host.fighterRenderSize(fighter.def.id) * sizeAdjust
      : host.cellFloorOffset
        ? host.cellFloorOffset(fighter.def.id, bankName, pose.frame) / 320
          * host.fighterRenderSize(fighter.def.id) * sizeAdjust
        : 0;
    const lunge = attackSwing * (attackKind === "special" ? 68 : attackKind === "heavy" ? 46 : 29);
    const crouchScale = fighter.crouch ? 0.88 : 1;
    const crouchDrop = fighter.crouch ? 21 : 0;
    const fatigue = THREE.MathUtils.clamp(1 - fighter.health / 100, 0, 1);
    // BODY-FIRST (spec 9) parity: super storms keep the idle chest-rise
    // alive through their long held active windows, same as the 2D path.
    const breathing = fighter.cinematicFrame === null && fighter.grounded && !fighter.down
      && (!attack || attack.superMove) && !fighter.stun && !fighter.block
      && fighter.dizzyFrames <= 0 && fighter.guardCrushFrames <= 0;
    const breath = breathing
      ? Math.sin(fighter.animTime * (5.2 + fatigue * 5.6) + fighter.side * 1.9) * (0.009 + fatigue * 0.015)
      : 0;
    const hitSmear = THREE.MathUtils.clamp(fighter.hitFlash / 0.14, 0, 1);
    const facing = fighter.facing >= 0 ? 1 : -1;
    // 5.1 (#44): the DRAWN mirror is the numeric facing times the direction
    // the authored cell points (Post's base bank is left-authored on 13/16
    // cells, his specials on 12/16). Everything drawFighter applies after
    // ctx.scale(renderMirror, 1) — the quad's x scale, the lunge, the attack
    // tilt, the hunch, the shader's screen-space edge orientation — uses
    // this; everything it applies before (down tilt, flips, the tremble)
    // keeps the sim facing.
    const mirror = spriteMirror(fighter.def.id, bankName, pose.frame, facing);
    const reducedMotion = Boolean(state.accessibility?.reducedMotion);
    const jump = SIM_FLOOR - fighter.y;

    const offsetPx = (lunge - startupPower * 8) * mirror;
    const dropPx = floorFix + crouchDrop - attackSwing * (attackKind === "special" ? 13 : 5);
    rig.root.position.set(
      worldX(fighter.x) + offsetPx * PX,
      worldY(fighter.y + bob) - dropPx * PX,
      0,
    );

    // Down pose: the 2D rotates the sprite flat; canvas rotation is
    // y-down/clockwise, so the three z-rotation flips sign.
    // v4.6 PRONE parity: the host measures how far this drawing still has
    // to tilt to lie down (0 for a cell authored flat), same as the 2D path.
    // 5.1 (#44): the 2D translate that follows the tilt is in the ROTATED
    // frame — proneTransform resolves it into world axes (mostly a forward
    // nudge; the 3D layer had been applying its raw x term as a 45 px
    // backward slide).
    const downTiltRadians = host.downTiltRadians ?? DOWN_TILT_RADIANS_FALLBACK;
    const downTilt = fighter.down
      ? (host.downTiltFor ? host.downTiltFor(fighter.def.id, bankName, pose.frame) : downTiltRadians) : 0;
    const prone = proneTransform({ facing, downTilt, downTiltRadians });
    let rootRotation = prone.rotation;
    if (fighter.cinematicRotation) rootRotation += -fighter.cinematicRotation;
    if (fighter.airTechFlipFrames > 0) {
      const flip = 1 - fighter.airTechFlipFrames / 14;
      rootRotation += -facing * flip * Math.PI * 2;
    }
    // v2.6 MOTION parity: the shared game-side motion layer (jump flips,
    // dash/walk lean, recoil wobble, dizzy sway, squash & stretch). Canvas
    // y-down rotations flip sign for three's z; the flip pivots about the
    // body centre via the position fixup below, everything else about the
    // feet like the 2D path.
    const motion = host.fighterMotionTransform ? host.fighterMotionTransform(fighter) : null;
    if (motion) {
      if (motion.rotation) rootRotation += -motion.rotation;
      if (motion.flipRotation) rootRotation += -motion.flipRotation;
    }
    rig.root.rotation.z = rootRotation;
    if (prone.dx) rig.root.position.x += prone.dx * PX;
    // v2.6 BODY-FIRST parity: the shared world-space body offset (attack
    // extension / victim stagger step). Sim x maps straight to world x; sim
    // y is down-positive so it flips for world y.
    if (motion && (motion.offsetX || motion.offsetY)) {
      rig.root.position.x += motion.offsetX * PX;
      rig.root.position.y -= motion.offsetY * PX;
    }
    // 5.1 (#44) MOTION FIX 4 parity: victims never freeze solid — the 1-2 px
    // pose shiver through hitstop / super storms, hashed from the sim tick
    // exactly like drawFighter (pre-mirror, world space). The contact shadows
    // stay put, as they do in 2D.
    const tremble = hitstopTremble({
      reducedMotion,
      hitstunFrames: fighter.hitstunFrames,
      cinematicFrame: fighter.cinematicFrame,
      hitstop: state.hitstop,
      opponentSuper: Boolean(state.fighters?.[1 - fighter.side]?.attacking?.superMove),
      tick: state.simulationTick || 0,
      side: fighter.side,
    });
    const trembleX = tremble ? tremble.x * PX : 0;
    if (tremble) {
      rig.root.position.x += trembleX;
      rig.root.position.y -= tremble.y * PX;
    }

    const cineScale = fighter.cinematicScale !== 1 ? fighter.cinematicScale : 1;
    const scaleX = (1 + activePower * 0.045 - startupPower * 0.025) * (1 + hitSmear * 0.05)
      * (motion ? motion.scaleX : 1);
    const scaleY = (crouchScale + startupPower * 0.035 - activePower * 0.025)
      * (1 + breath) * (1 - hitSmear * 0.06) * (motion ? motion.scaleY : 1);
    rig.mesh.scale.set(renderSize * mirror * scaleX * cineScale, renderSize * scaleY * cineScale, 1);
    // Attack tilt + the 5.1 (#44) exhaustion hunch: both are post-mirror
    // canvas rotations in drawFighter (rotate(-swing*k), rotate(0.085*ex)),
    // so both cross to three through the same sign rule.
    rig.mesh.rotation.z = postMirrorRotation(-attackSwing * (attackKind === "heavy" ? 0.07 : 0.025), mirror)
      + postMirrorRotation(exhaustionLean({ breathing, moving, health: fighter.health, reducedMotion }), mirror);
    if (motion && motion.flipRotation) {
      // Pivot the somersault about the body centre, not the feet: rotating
      // the feet-anchored root by θ then shifting the root so the centre
      // point stays fixed is exactly a centre-pivot rotation.
      const theta = -motion.flipRotation;
      const centreY = Math.abs(rig.mesh.scale.y) * 0.52;
      rig.root.position.x += centreY * Math.sin(theta);
      rig.root.position.y += centreY * (1 - Math.cos(theta));
    }

    // --- Foot anchoring: kill the hover -------------------------------------
    // The atlas frames carry transparent padding under the soles, so the
    // feet-anchored quad held the visible shoes a few px above the ground
    // plane — the "floating feet" tell. Drop the rig by the measured per-frame
    // padding so the soles genuinely touch y=0 (skipped while the sprite is
    // rotated flat: knocked-down poses have no meaningful sole line).
    const upright = !fighter.down && Math.abs(rootRotation) < 0.25;
    const footPad = bank.footMetrics?.padBottom?.[pose.frame] ?? 0;
    if (upright && footPad > 0) rig.root.position.y -= footPad * Math.abs(rig.mesh.scale.y);
    // 5.1 (#44) PRONE SETTLE: a downed body rests ON the boards. The rotated
    // silhouette box (measured per cell) is placed so its lowest corner sits
    // 2 px under the ground plane: a tilted cell LIFTS by about half the
    // body width (the pivot-at-the-feet rotation had been burying the back
    // half of the body in the floor), an authored-flat cell DROPS by its
    // bottom padding (it had been floating by exactly that — the "feet in
    // the air" read Flat Out exists to kill). Grounded only: a body still
    // in the air keeps its sim height.
    if (fighter.down && fighter.grounded) {
      rig.root.position.y += proneSettleLift({
        rotation: rootRotation,
        scaleX: rig.mesh.scale.x,
        scaleY: rig.mesh.scale.y,
        extent: bank.footMetrics?.extent?.[pose.frame],
        restBelow: 2 * PX,
      });
    }

    // --- Wet-floor reflection: exact mirror across the ground plane --------
    // Silhouette-true (critic fix): near-1:1 vertical scale + a visible shear
    // so the mirror tracks the actual pose instead of smearing into a colour
    // blob offset from the feet. ~25-30% opacity, near-neutral tint.
    rig.reflRoot.position.set(rig.root.position.x, -rig.root.position.y, -0.015);
    rig.reflRoot.rotation.z = -rootRotation;
    rig.reflMesh.scale.set(
      rig.mesh.scale.x,
      -rig.mesh.scale.y * 1.06, // whisper of vertical stretch down the street
      1,
    );
    // Exact mirror rotation: the old constant facing-shear (+0.1 rad) made
    // the reflection read as an offset blob that never tracked the stance —
    // the mirror now sits dead under the pose; the water read comes from the
    // vertical smear + streak breakup instead (critic grounding fix).
    rig.reflMesh.rotation.z = -rig.mesh.rotation.z;
    const airFade = THREE.MathUtils.clamp(1 - jump / 430, 0.22, 1);
    // Impact answer: the wet street brightens its mirror while a flash lives.
    const flashBoost = 1 + THREE.MathUtils.clamp(this.getFlashLevel(), 0, 1) * 0.45;
    // Super freeze: the mirror dies within ~2 frames of ignition (6x, was
    // 2.2x — the freeze-frame could still catch a partially-faded mirror as
    // a segmented column; the shader's above-ground discard is the second
    // lock on that artifact).
    // 0.44 (was 0.38): the seam cuts + streak breakup dim the mirror's mean
    // level, so the base comes up to keep the same presence it graded at.
    bank.reflMaterial.opacity = Math.min(0.55, 0.44 * (0.55 + 0.45 * airFade) * flashBoost)
      * Math.max(0, 1 - this.superDim * 6);

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
    // 5.1 SUPER-READY (VISIBLE parity with the 2D aura + outline + embers):
    // the emissive lift above was the only 3D tell and it never read as
    // "he can super NOW". Same pulse clock as the 2D path (time*0.006 per
    // ms = 6 rad/s), reduced motion holds the pulse at its mid-point.
    const readyPulse = reducedMotion ? 0.5 : 0.5 + Math.sin(timeSec * 6 + fighter.side * 2.4) * 0.5;
    const accent = fighter.def.accent || "#ff8040";
    bank.fb.readyColor.set(accent);
    bank.fb.readyRim.value = superReady ? 0.55 + readyPulse * 0.45 : 0;
    // 5.1 TEMPO TELLS (parity with drawTempoTellUnder / Over): the fringe
    // burns at 0.6-1.0 through the whiff and fades across the re-arm gap;
    // the wash is the gap's grey (0.42 × strength) or the eaten-press pop
    // (0.55 × its 6-tick fade), whichever is stronger.
    const tempoTell = whiffTellState(fighter, state.simulationTick || 0);
    bank.fb.whiffRim.value = tempoTell.phase === "whiff"
      ? 0.6 + 0.4 * tempoTell.strength
      : tempoTell.phase === "rearm" ? 0.7 * tempoTell.strength : 0;
    bank.fb.rearmDim.value = Math.max(
      tempoTell.phase === "rearm" ? 0.42 * tempoTell.strength : 0,
      0.55 * tempoTell.dropFlash,
    );
    if (rig.aura) {
      if (superReady) {
        const auraReach = renderSize * 0.6;
        rig.aura.material.color.set(accent);
        rig.aura.material.opacity = (0.5 + readyPulse * 0.3) * 0.38;
        rig.aura.position.set(0, renderSize * 0.32, -0.04);
        rig.aura.scale.set(auraReach * 2, auraReach * 2, 1);
        rig.aura.visible = true;
      } else {
        rig.aura.visible = false;
      }
    }
    if (rig.embers) {
      const trailScale = state.performance?.trailScale ?? 1;
      const showEmbers = superReady && !reducedMotion && trailScale > 0;
      rig.embers.visible = showEmbers;
      if (showEmbers) {
        const emberCount = Math.min(AURA_EMBERS, Math.max(3, Math.round(AURA_EMBERS * trailScale)));
        const positions = rig.embers.geometry.attributes.position;
        const colors = rig.embers.geometry.attributes.color;
        const accentColor = rig.embers.material.userData.accent
          || (rig.embers.material.userData.accent = new THREE.Color());
        accentColor.set(accent);
        const sizePx = host.fighterRenderSize(fighter.def.id) * sizeAdjust;
        const tick = state.simulationTick || 0;
        for (let ember = 0; ember < AURA_EMBERS; ember += 1) {
          if (ember >= emberCount) {
            positions.setXYZ(ember, 0, -10, 0);
            colors.setXYZ(ember, 0, 0, 0);
            continue;
          }
          // The 2D formula, verbatim, in sim px about the feet.
          const cycleFrames = 66 + (ember % 3) * 14;
          const clock = tick + ember * 31;
          const progress = (clock % cycleFrames) / cycleFrames;
          const jitter = hash01(Math.floor(clock / cycleFrames) * 13 + ember * 7 + fighter.side * 101);
          const emberX = (jitter - 0.5) * sizePx * 0.44 + Math.sin((progress + jitter) * Math.PI * 2) * 5;
          const emberY = sizePx * (0.66 + progress * 0.32);
          positions.setXYZ(ember, emberX * PX * mirror, emberY * PX, 0.05);
          const alpha = (1 - progress) * 0.85;
          // Hot enough to bloom at birth, alternating accent / warm white
          // like the 2D pass; brightness carries the fade.
          if (ember % 2) colors.setXYZ(ember, accentColor.r * 1.8 * alpha, accentColor.g * 1.8 * alpha, accentColor.b * 1.8 * alpha);
          else colors.setXYZ(ember, 1.6 * alpha, 1.52 * alpha, 1.35 * alpha);
        }
        positions.needsUpdate = true;
        colors.needsUpdate = true;
      }
    }

    // --- Scene-matched sprite lighting + flash guard ------------------------
    // 5.1 (#45): PER STAGE. The position-driven terms (a rim from the
    // screen-left practical that eases up as the fighter nears it, a rim
    // from the screen-right practical that only lands when he stands under
    // it, the overhead crown key, the body fills, the floor bounce climbing
    // the shins, the zone grade and the mirror's whisper of hue) come from
    // stage-lighting.mjs — the Vet's floodlights and sodium lot lamps, the
    // buffet's heat lamps and red sign, the cruise deck's sky and pool —
    // instead of Somerset's constants on every stage. Somerset itself is
    // number-for-number what it was.
    const fx = rig.root.position.x;
    const fb = bank.fb;
    // Screen-space edge orientation for the shader (uv.x flips with the mirror).
    fb.facing.value = mirror;
    const light = spriteLightFrame(this.spriteLight, fx, hitSmear);
    fb.rimLeftColor.setRGB(light.rimLeft[0], light.rimLeft[1], light.rimLeft[2]);
    fb.rimLeftStrength.value = light.rimLeftStrength;
    fb.rimRightColor.setRGB(light.rimRight[0], light.rimRight[1], light.rimRight[2]);
    fb.rimRightStrength.value = light.rimRightStrength;
    fb.topColor.setRGB(light.top[0], light.top[1], light.top[2]);
    fb.topTint.setRGB(light.topTint[0], light.topTint[1], light.topTint[2]);
    fb.topStrength.value = light.topStrength;
    fb.fillLeftColor.setRGB(light.fillLeft[0], light.fillLeft[1], light.fillLeft[2]);
    fb.fillRightColor.setRGB(light.fillRight[0], light.fillRight[1], light.fillRight[2]);
    fb.floorBounce.setRGB(light.floorBounce[0], light.floorBounce[1], light.floorBounce[2]);
    fb.zoneTint.setRGB(light.zone[0], light.zone[1], light.zone[2]);
    // Impact light spill: the burst relights the near side of BOTH fighters
    // in the burst's own colour for its ~0.25s life.
    const spill = this.getImpactSpill?.();
    if (spill && spill.level > 0.01) {
      const near = Math.exp(-((fx - spill.x) * (fx - spill.x)) / 1.6) * spill.level;
      const target = spill.x >= fx - 0.05 ? fb.fillRightColor : fb.fillLeftColor;
      // 0.32 (was 0.55): a point-blank burst warms the near side visibly
      // without repainting the whole attacker as an orange lantern.
      target.r += spill.color.r * near * 0.32;
      target.g += spill.color.g * near * 0.32;
      target.b += spill.color.b * near * 0.32;
    }
    // Screen-space sheen: glint direction slides with the fighter's offset
    // from the overhead source; budget rises standing under it. Raised
    // (critic fix h): every material must declare itself at a glance —
    // metal sparks, leather sheens, skin sweats — so the sheen pass now
    // carries a real budget.
    fb.lampDx.value = light.lampDx;
    fb.specStrength.value = light.specStrength;
    // Wet-floor mirror graded by position — BARELY (round-3 palette fix).
    // The sprite's own colours ARE the mirror; the stage only breathes a
    // few percent of its practical hue into it. The old 1.12-1.26 warm lift
    // is what turned Deathblow's black shirt into an orange-brown smear.
    bank.reflMaterial.color.setRGB(light.mirror[0], light.mirror[1], light.mirror[2]);
    // Super freeze: body toward silhouette, rims boosted (set in the shader).
    // Only the attacker owns the freeze light; the other fighter reads as the
    // dark shape time stopped around (fixes the fused-legs "ghost" read).
    fb.superDim.value = this.superDim;
    const anySuper = (state.fighters || []).some((f) => f.attacking?.superMove);
    fb.superVictim.value = anySuper && !fighter.attacking?.superMove ? 1 : 0;
    // Impact pain flash: pop on the frame the sim hit lands (rising edge of
    // the sim's own hitFlash timer), gone ~4 render frames later. Emissive is
    // masked to the sprite pixels, so the play area never desaturates.
    // The body-halftone rides a slightly longer tail (0.16s) and centres on
    // the actual contact point via the VFX layer's spill position.
    if (fighter.hitFlash > rig.lastHitFlash + 0.02) {
      rig.hitWhiteTtl = 0.1;
      rig.hitToneTtl = 0.16;
      // Seed at chest height on the attacker-facing side; refined below the
      // moment the VFX layer publishes the true contact point.
      fb.hitUv.set(0.62, 0.58);
    }
    rig.lastHitFlash = fighter.hitFlash;
    rig.hitWhiteTtl = Math.max(0, rig.hitWhiteTtl - dtSec);
    rig.hitToneTtl = Math.max(0, (rig.hitToneTtl ?? 0) - dtSec);
    if (rig.hitToneTtl > 0.08 && spill && spill.level > 0.35) {
      const meshW = Math.abs(rig.mesh.scale.x) || 1;
      const meshH = Math.abs(rig.mesh.scale.y) || 1;
      fb.hitUv.set(
        THREE.MathUtils.clamp(0.5 + ((spill.x - fx) / meshW) * mirror, 0.12, 0.88),
        THREE.MathUtils.clamp(((spill.y ?? 0) - rig.root.position.y) / meshH, 0.15, 0.9),
      );
    }
    fb.hitWhite.value = rig.hitWhiteTtl / 0.1;
    fb.hitTone.value = rig.hitToneTtl / 0.16;
    const flash = THREE.MathUtils.clamp(this.getFlashLevel(), 0, 1);
    fb.flashGuard.value = flash * 0.85 * (1 - fb.hitWhite.value);

    // --- Grounding shadows --------------------------------------------------
    // Layer 1: tight near-black contact ellipse under EACH measured foot —
    // nearly black at the sole is what makes a fighter read planted.
    // Layer 2: one longer soft shadow stretched AWAY from the overhead
    // source (it hangs behind the fight line, so the throw runs toward the
    // camera and away in x). The key light's shadow-mapped silhouette still
    // draws the pose-shaped shadow on top.
    const slide = (1 - airFade) * 0.3; // airborne: contact patch drifts + fades
    rig.shadow.position.set(fx - trembleX, 0.01, 0.02);
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
    // Tight AO core: a second, half-size near-black ellipse dead under each
    // sole (slightly higher so it wins the depth sort) — the contact-darkest
    // point that locks the shoe to the boards.
    const coreFor = (blob, foot, fallbackU) => {
      const u = foot ? foot.u : fallbackU;
      blob.rotation.set(-Math.PI / 2, 0, 0);
      blob.position.set(u * rig.mesh.scale.x + slide * 0.2, soleY + 0.002, -0.045 + slide * 0.15);
      blob.scale.set(footScaleX * 0.48, footScaleZ * 0.55, 1);
      blob.material.opacity = 0.95 * airFade * airFade * (0.6 + 0.4 * (foot ? 1 : 0));
    };
    coreFor(rig.coreA, feet[0], -0.1);
    coreFor(rig.coreB, feet[1] || feet[0], 0.1);
    // ONE faint ambient AO pool DEAD UNDER the body (round-3, critic item 3:
    // "delete the doubled offset shadow"). The old lamp-relative throw could
    // stretch this pool LEFT while the key light printed the silhouette
    // RIGHT — two shadows in opposing directions off one fighter. The pool
    // now hugs the stance with only a whisper of bias toward the key throw
    // (+x), so the frame reads exactly one shadow story: key silhouette +
    // per-foot contact + this under-body core.
    const throwLen = renderSize * 0.34;
    rig.penumbra.rotation.set(-Math.PI / 2, 0, 0);
    rig.penumbra.position.set(throwLen * 0.14 + slide * 0.3, 0.002, 0.1 + slide * 0.2);
    rig.penumbra.scale.set(throwLen, renderSize * 0.16, 1);
    rig.penumbra.material.opacity = 0.13 * (0.35 + 0.65 * airFade) * (1 - this.superDim * 0.7);
  }
}
