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
import { normalMapForAtlas, softDotTexture, hardShadowTexture, smearedAtlasTexture, bleedAtlasCanvas, hdComposedCanvas, atlasFootMetrics } from "./textures.mjs";
import { FIGHTER_MASK_LAYER } from "./post.mjs";
// v2.10 WALK: the authored-bank list is shared with the sim so 3D can never
// drift from the 2D path on which banks exist (motion, motion2, walk).
// v3.0: ...and on the unified bank's name, so the sheet-adjust branch below
// cannot drift from the sim's idea of what that bank is called.
import { AUTHORED_BANKS, UNIFIED_BANK } from "../../engine/fighter-kits.mjs";

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
const LAMP_KEY = new THREE.Color(0xa9f7d2); // green-cyan: reads as the lamp's colour, not white
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
// --- Green-white TOP-LIGHT term (station lamp overhead): a broad body
// gradient down from the head/shoulders, not just a silhouette stroke — the
// lamp genuinely keys the upper body the way it keys the floor below it.
float fbTopBody = smoothstep(0.5, 0.96, vFbLocal.y) * clamp(uFbTopStrength, 0.0, 1.2);
diffuseColor.rgb = mix(diffuseColor.rgb,
  diffuseColor.rgb * vec3(0.88, 1.12, 0.99) + uFbTopColor * 0.085,
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
diffuseColor.rgb *= 1.0 - uFbSuperDim * (0.62 + uFbSuperVictim * 0.24);`)
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
  material.customProgramCacheKey = () => "fb-sprite-grade-v10";
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
    // Wet-floor reflection: VERTICALLY smeared atlas — the mirror keeps the
    // fighter's own flipped silhouette (horizontal detail survives, so it
    // tracks every pose) while water drags the image into vertical streaks.
    // Faded by height, tinted per-frame toward whichever practical the
    // fighter stands under (poseRig grades the mirror colour).
    const reflMap = smearedAtlasTexture(image);
    applyAtlasFrame(reflMap, 0);
    const reflMaterial = new THREE.MeshBasicMaterial({
      map: reflMap,
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
    // Per-frame sole line + foot positions: kills the hover (transparent
    // padding under the feet) and drives the per-foot contact shadows.
    const footMetrics = atlasFootMetrics(image);
    const bank = { map, normalMap, material, depthMaterial, reflMap, reflMaterial, fb, footMetrics, disposed: false };
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
    const banks = { base: this.buildBank(baseImage, hdFor("base")) };
    if (moveImage?.complete && moveImage.naturalWidth) banks.specials = this.buildBank(moveImage, hdFor("specials"));

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

    this.group.add(shadow);
    this.group.add(reflRoot);
    this.group.add(root);
    return {
      id, paletteKey, banks, mesh, root, reflMesh, reflRoot, shadow, footA, footB, coreA, coreB, penumbra,
      currentBank: "base", lastHitFlash: 0, hitWhiteTtl: 0, hitToneTtl: 0,
    };
  }

  disposeRig(rig) {
    if (!rig) return;
    this.group.remove(rig.root);
    this.group.remove(rig.reflRoot);
    this.group.remove(rig.shadow);
    for (const bank of Object.values(rig.banks)) {
      bank.disposed = true; // cancels any in-flight HD swap
      bank.material.dispose();
      bank.depthMaterial.dispose();
      bank.reflMaterial.dispose();
      bank.map.dispose();
      bank.reflMap.dispose();
    }
    rig.mesh.geometry.dispose();
    rig.reflMesh.geometry.dispose();
    for (const blob of [rig.footA, rig.footB, rig.coreA, rig.coreB, rig.penumbra]) {
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
      // Wave 16: a changed palette pick rebuilds the side's rig exactly like
      // a changed fighter (the alt atlas is a different texture source).
      const paletteKey = this.host.fighterPaletteKey ? this.host.fighterPaletteKey(fighter) : "";
      if (!rig || rig.id !== fighter.def.id || (rig.paletteKey || "") !== paletteKey) {
        this.disposeRig(rig);
        rig = this.buildRig(fighter);
        this.rigs[side] = rig;
        if (!rig) continue;
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
  ensureMotionBank(rig, fighter, bankName = "motion") {
    if (rig.banks[bankName]) return true;
    const host = this.host;
    const image = host.fighterAtlasFor ? host.fighterAtlasFor(fighter, bankName) : null;
    if (!image?.complete || !image.naturalWidth) return false;
    rig.banks[bankName] = this.buildBank(image);
    return true;
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
    const jump = SIM_FLOOR - fighter.y;

    const offsetPx = (lunge - startupPower * 8) * facing;
    const dropPx = floorFix + crouchDrop - attackSwing * (attackKind === "special" ? 13 : 5);
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
    if (fighter.down) rig.root.position.x += -facing * 45 * PX;
    // v2.6 BODY-FIRST parity: the shared world-space body offset (attack
    // extension / victim stagger step). Sim x maps straight to world x; sim
    // y is down-positive so it flips for world y.
    if (motion && (motion.offsetX || motion.offsetY)) {
      rig.root.position.x += motion.offsetX * PX;
      rig.root.position.y -= motion.offsetY * PX;
    }

    const cineScale = fighter.cinematicScale !== 1 ? fighter.cinematicScale : 1;
    const scaleX = (1 + activePower * 0.045 - startupPower * 0.025) * (1 + hitSmear * 0.05)
      * (motion ? motion.scaleX : 1);
    const scaleY = (crouchScale + startupPower * 0.035 - activePower * 0.025)
      * (1 + breath) * (1 - hitSmear * 0.06) * (motion ? motion.scaleY : 1);
    rig.mesh.scale.set(renderSize * facing * scaleX * cineScale, renderSize * scaleY * cineScale, 1);
    rig.mesh.rotation.z = facing * attackSwing * (attackKind === "heavy" ? 0.07 : 0.025);
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
    // Normalised to the REAL right-corner reach (fx tops out ~2.9 at the
    // wall): the old /5.5 span meant a cornered fighter only ever collected
    // half the K&A magenta — the corner signature never landed (fix j).
    const neonMix = THREE.MathUtils.clamp((fx + 0.4) / 3.3, 0, 1);
    fb.rimRightColor.copy(NEON_RIM).lerp(CYAN_RIM, THREE.MathUtils.clamp((fx - 3.4) / 3, 0, 1) * 0.55);
    fb.rimRightStrength.value = 0.22 + neonMix * neonMix * 1.15;
    // Green-cyan top key from the overhead station lamp: strongest when the
    // fighter stands near the lamp column, never fully off. Drives BOTH the
    // silhouette strip along hair/shoulders and the broad top-body gradient.
    // Raised hard (critic fix 2): the lamp directly above the fight line must
    // OBVIOUSLY key the fighters' crowns.
    const lampNear = Math.exp(-((fx - LAMP_X) * (fx - LAMP_X)) / 7);
    fb.topColor.copy(LAMP_KEY);
    // Anchored to the actual lamp (round-3, critic item 7): the crown light
    // follows lamp proximity instead of a near-constant floor, so two
    // fighters no longer wear identical green-white crowns wherever they
    // stand — the light belongs to the fixture.
    fb.topStrength.value = 0.5 + lampNear * 0.95;
    // --- Scene-light BODY fill (not just edges): the cheap trick that sits
    // the fighter IN the scene. Magenta wash rises across the body as the
    // fighter nears the K&A neon; warm sodium fill answers from screen-left;
    // both slide across the sprite as it moves.
    fb.fillLeftColor.copy(SODIUM_RIM).multiplyScalar(0.17 + leftNear * 0.24);
    fb.fillRightColor.copy(NEON_RIM).multiplyScalar(0.14 + neonMix * neonMix * 0.6);
    // Warm ORANGE floor bounce on shoes/shins from the sodium light pools —
    // deliberately obvious (critic fix 2): the lower legs read lit BY the
    // street, brightest standing in a pool.
    fb.floorBounce.copy(SODIUM_RIM).lerp(BODEGA_WARM, 0.35)
      .multiplyScalar(0.32 + lampNear * 0.16 + leftNear * 0.12);
    // Position-driven ZONE GRADE: overall body exposure + temperature slide
    // with the nearest practical. Base lift keeps a dark outfit level with
    // the wall behind it (the shader weights this into the shadows/mids);
    // walking neon-corner -> lamp -> sodium left visibly re-colours the body.
    fb.zoneTint.setRGB(
      1.16 * (1 + leftNear * 0.20 + neonMix * neonMix * 0.16),
      1.16 * (1 + lampNear * 0.22 + leftNear * 0.05),
      1.16 * (1 + neonMix * neonMix * 0.34 + lampNear * 0.10 - leftNear * 0.12),
    );
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
    // from the lamp; budget rises standing under it. Raised (critic fix h):
    // every material must declare itself at a glance — metal sparks, leather
    // sheens, skin sweats — so the sheen pass now carries a real budget.
    fb.lampDx.value = THREE.MathUtils.clamp((fx - LAMP_X) / 2.5, -1, 1);
    fb.specStrength.value = 0.72 + lampNear * 0.68;
    // Wet-floor mirror graded by position — BARELY (round-3 palette fix).
    // The sprite's own colours ARE the mirror; the stage only breathes a
    // few percent of its practical hue into it. The old 1.12-1.26 warm lift
    // is what turned Deathblow's black shirt into an orange-brown smear.
    bank.reflMaterial.color.setRGB(
      1.0 + leftNear * 0.04 - neonMix * 0.02,
      1.01 + lampNear * 0.05 + leftNear * 0.01,
      1.06 + neonMix * neonMix * 0.14 + lampNear * 0.03,
    );
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
        THREE.MathUtils.clamp(0.5 + ((spill.x - fx) / meshW) * facing, 0.12, 0.88),
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
