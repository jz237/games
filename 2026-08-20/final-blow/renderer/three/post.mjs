// Post-processing stack for CINEMA 3D.
// ACES tone mapping + sRGB output happen in the OutputPass; the scene renders
// linear HDR into the composer's half-float target so bloom thresholds work on
// physical light values. Quality tiers:
//   high     — tight UnrealBloom + vignette/grain + FXAA
//   balanced — plain render + bloom + vignette/grain (no FXAA)
// (battery never reaches here: activation is refused upstream.)
// NO SSAO: SSAOPass renders its depth/normal prepass with an opaque override
// material, so every alpha-tested billboard (fighters, pedestrians, cards)
// printed its FULL QUAD into the AO buffer — a frosted grey rectangle hovering
// around every sprite. Contact darkening comes from the fighter layer's
// per-foot shadow blobs instead, which are shaped like the actual contact.
import * as THREE from "three";
import { EffectComposer } from "../vendor/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "../vendor/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "../vendor/jsm/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "../vendor/jsm/postprocessing/UnrealBloomPass.js";
import { FXAAPass } from "../vendor/jsm/postprocessing/FXAAPass.js";
import { Pass, FullScreenQuad } from "../vendor/jsm/postprocessing/Pass.js";

// Camera layer carrying ONLY the fighter body billboards (fighters.mjs enables
// it on each rig mesh). Used by the painterly pass to build a protection mask
// so the stage stylization never touches a fighter pixel.
export const FIGHTER_MASK_LAYER = 7;

// ---------------------------------------------------------------------------
// ONE-MEDIUM spike A: "stage matches sprites".
// Edge-preserving Kuwahara smoothing over the 3D stage only — flattens the
// photographic micro-detail into brushy constant-tone patches (the way SF6's
// painted backdrops hold big simple planes) while keeping architectural edges.
// The fighters are protected by an alpha mask rendered from their own
// alpha-tested billboards, dilated a touch so silhouette edges stay crisp.
// Runs pre-bloom on the linear HDR buffer; posterize + paper tooth live in
// the grade pass below (post-tonemap) using the same mask.
const KuwaharaStageShader = {
  name: "KuwaharaStageShader",
  uniforms: {
    tDiffuse: { value: null },
    tMask: { value: null },
    texel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    strength: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tMask;
    uniform vec2 texel;
    uniform float strength;
    varying vec2 vUv;
    // 4-sector Kuwahara, radius 2: mean of the lowest-variance quadrant.
    // Radius 3 flattened thin structures (chain-link wires, signage strokes)
    // into dot fields; radius 2 + a partial blend keeps them legible.
    void sector(vec2 base, vec2 dir, out vec3 mean, out float variance) {
      vec3 sum = vec3(0.0);
      vec3 sq = vec3(0.0);
      for (int x = 0; x <= 2; x++) {
        for (int y = 0; y <= 2; y++) {
          vec3 c = texture2D(tDiffuse, base + vec2(float(x), float(y)) * dir * texel).rgb;
          // Compress HDR so neon hotspots do not own the variance metric.
          c = c / (1.0 + c);
          sum += c;
          sq += c * c;
        }
      }
      mean = sum / 9.0;
      vec3 v = sq / 9.0 - mean * mean;
      variance = v.r + v.g + v.b;
    }
    void main() {
      vec4 original = texture2D(tDiffuse, vUv);
      // Fighter protection mask, dilated ~2px so the sprite edge AA survives.
      float m = texture2D(tMask, vUv).a;
      m = max(m, texture2D(tMask, vUv + vec2(texel.x * 2.0, 0.0)).a);
      m = max(m, texture2D(tMask, vUv - vec2(texel.x * 2.0, 0.0)).a);
      m = max(m, texture2D(tMask, vUv + vec2(0.0, texel.y * 2.0)).a);
      m = max(m, texture2D(tMask, vUv - vec2(0.0, texel.y * 2.0)).a);
      if (m > 0.98 || strength < 0.001) {
        gl_FragColor = original;
        return;
      }
      vec3 mean0; float var0; sector(vUv, vec2(-1.0, -1.0), mean0, var0);
      vec3 mean1; float var1; sector(vUv, vec2( 1.0, -1.0), mean1, var1);
      vec3 mean2; float var2; sector(vUv, vec2(-1.0,  1.0), mean2, var2);
      vec3 mean3; float var3; sector(vUv, vec2( 1.0,  1.0), mean3, var3);
      vec3 best = mean0;
      float bestVar = var0;
      if (var1 < bestVar) { best = mean1; bestVar = var1; }
      if (var2 < bestVar) { best = mean2; bestVar = var2; }
      if (var3 < bestVar) { best = mean3; bestVar = var3; }
      // Undo the HDR compression. 90% blend (was 78%): the AAA-critic read on
      // the 78% pass was still "photo plate behind painted sprites" — the
      // painted patches must OWN the stage surface, with only a whisper of
      // true detail keeping thin structure legible.
      vec3 painted = best / max(vec3(1.0) - best, vec3(0.001));
      // DEPTH-GRADED painterliness (coherence fix i): screen-y is a solid
      // depth proxy in a fixed-floor side view — the near floor band keeps
      // ~half its true micro-structure (slab grid, aggregate, curb chips),
      // the fence/station band keeps a third, and only the far plate gets
      // the full painted flatten. Crisp sprites now stand on semi-crisp
      // ground instead of floating over uniform airbrush.
      float depthProxy = 0.52 + 0.48 * smoothstep(0.26, 0.6, vUv.y);
      vec3 result = mix(original.rgb, painted, 0.9 * strength * (1.0 - m) * depthProxy);
      gl_FragColor = vec4(result, original.a);
    }
  `,
};

class StagePainterlyPass extends Pass {
  constructor(scene, camera, width, height) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.maskRT = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.material = new THREE.ShaderMaterial({
      ...KuwaharaStageShader,
      uniforms: THREE.UniformsUtils.clone(KuwaharaStageShader.uniforms),
    });
    this.material.uniforms.tMask.value = this.maskRT.texture;
    this.material.uniforms.texel.value.set(1 / width, 1 / height);
    this.fsQuad = new FullScreenQuad(this.material);
    this._clearColor = new THREE.Color();
  }

  setSize(width, height) {
    this.maskRT.setSize(width, height);
    this.material.uniforms.texel.value.set(1 / width, 1 / height);
  }

  render(renderer, writeBuffer, readBuffer) {
    // 1. Fighter mask: only the billboard layer, no background/fog, black
    //    clear at alpha 0 — the alpha-tested sprite shader stamps alpha 1
    //    exactly where fighter pixels survive. Lights live on layer 0, so the
    //    mask render is effectively unlit (alpha is all we read). Shadow-map
    //    refresh is suppressed for this extra render.
    const scene = this.scene;
    const camera = this.camera;
    const oldBackground = scene.background;
    const oldFog = scene.fog;
    const oldLayers = camera.layers.mask;
    const oldShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(this._clearColor);
    const oldClearAlpha = renderer.getClearAlpha();
    scene.background = null;
    scene.fog = null;
    renderer.shadowMap.autoUpdate = false;
    camera.layers.set(FIGHTER_MASK_LAYER);
    renderer.setRenderTarget(this.maskRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    camera.layers.mask = oldLayers;
    scene.background = oldBackground;
    scene.fog = oldFog;
    renderer.shadowMap.autoUpdate = oldShadowAuto;
    renderer.setClearColor(this._clearColor, oldClearAlpha);

    // 2. Masked Kuwahara over the stage.
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.maskRT.dispose();
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

// Combined vignette + animated film grain, applied after tone mapping.
// Disciplined: the vignette is a gentle neutral darkening pushed to the far
// corners (no dead-mush edges), and the grain is luminance-weighted so it
// lives in the shadows like camera noise instead of sitting uniformly over
// the frame like a filter. (The DOM HUD renders above this canvas, so it is
// untouched by grain/vignette by construction.)
const VignetteGrainShader = {
  name: "VignetteGrainShader",
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grainAmount: { value: 0.021 },
    vignetteAmount: { value: 0.15 },
    // Unsharp-mask radius/strength: run at the full 1280x720 backing so the
    // fighters + midground tack sharp after the bloom/FXAA chain.
    sharpTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    sharpAmount: { value: 0.42 },
    // Faint blue-purple shadow floor. Cut hard from the old 0.04/0.08 lift —
    // that lift repainted every dark edge pixel as milky haze and flattened
    // the frame's blacks; the S-curve below owns the night contrast now.
    floorColor: { value: new THREE.Vector3(0.014, 0.015, 0.030) },
    // Filmic contrast S-curve amount: darks dig in, highlights keep their
    // shoulder (applied post-tonemap, pre-grain).
    contrast: { value: 0.34 },
    // Duotone grade for the super-freeze (SF6 super-flash): 0 = off; >0 pulls
    // the frozen gameplay toward a deep-indigo -> hot-amber two-tone ramp.
    duotone: { value: 0 },
    // Chromatic split (super-freeze flash): 0 = byte-identical to the plain
    // pass; >0 tears R/B outward radially, strongest at the frame edges.
    aberration: { value: 0 },
    // Impact radial-blur pulse (~2 frames on the hit): 0 = byte-identical to
    // the plain pass; >0 smears the frame outward from centre, edge-weighted
    // so the impact zone itself stays crisp while the surround whips.
    radial: { value: 0 },
    // LOCAL refraction/chromatic pop at the contact point (~1-2 frames): a
    // tight lens-punch centred on the hit itself, not the frame centre.
    pop: { value: 0 },
    popCenter: { value: new THREE.Vector2(0.5, 0.5) },
    // Super-freeze stage treatment: desaturates + settles the WORLD behind
    // the attacker (fighter-masked) while the cut-in owns the frame.
    superLevel: { value: 0 },
    // Spike A "stage matches sprites" finish terms: subtle posterization +
    // paper tooth on the stage only (tFbMask protects the fighters), applied
    // post-tonemap. 0 = byte-identical to the plain pass.
    painterly: { value: 0 },
    tFbMask: { value: null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grainAmount;
    uniform float vignetteAmount;
    uniform vec2 sharpTexel;
    uniform float sharpAmount;
    uniform vec3 floorColor;
    uniform float contrast;
    uniform float duotone;
    uniform float aberration;
    uniform float radial;
    uniform float pop;
    uniform vec2 popCenter;
    uniform float superLevel;
    uniform float painterly;
    uniform sampler2D tFbMask;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      if (pop > 0.001) {
        // Contact-point lens punch: a one-frame refraction bulge + R/B split
        // CENTRED ON THE HIT (popCenter in uv), dying out within ~a quarter
        // of the frame — the glass itself flinches where the blow lands.
        vec2 pd = vUv - popCenter;
        pd.x *= 1.778;
        float pr = length(pd);
        float pw = pop * (1.0 - smoothstep(0.02, 0.3, pr));
        vec2 pdir = pd / max(pr, 0.001);
        vec2 poff = pdir * pw * 0.013;
        color.r = texture2D(tDiffuse, vUv + poff).r;
        color.g = texture2D(tDiffuse, vUv + poff * 0.35).g;
        color.b = texture2D(tDiffuse, vUv - poff * 0.6).b;
      }
      if (aberration > 0.001) {
        // Radial R/B tear, centre-weighted out so the fighters stay readable.
        vec2 fromCentre = vUv - 0.5;
        vec2 tear = fromCentre * aberration * 0.007 * (0.35 + length(fromCentre) * 1.6);
        color.r = texture2D(tDiffuse, vUv + tear).r;
        color.b = texture2D(tDiffuse, vUv - tear).b;
      }
      if (radial > 0.001) {
        // Impact radial blur: 3 taps sliding toward centre, edge-weighted so
        // the fight line stays tack sharp while the frame edges whip for the
        // pulse's ~2 frames.
        vec2 fromC = vUv - 0.5;
        float rw = smoothstep(0.12, 0.55, length(fromC * vec2(1.15, 1.0)));
        vec2 step1 = fromC * radial * rw * 0.016;
        vec3 racc = color.rgb
          + texture2D(tDiffuse, vUv - step1).rgb
          + texture2D(tDiffuse, vUv - step1 * 2.0).rgb;
        color.rgb = mix(color.rgb, racc / 3.0, 0.7 * radial * rw);
      }
      // Unsharp mask: subtract a 4-tap box blur. Clamped so speculars do not
      // ring; this is the "tack sharp at the fight line" discipline pass.
      vec3 blurred = (
        texture2D(tDiffuse, vUv + vec2(sharpTexel.x, 0.0)).rgb +
        texture2D(tDiffuse, vUv - vec2(sharpTexel.x, 0.0)).rgb +
        texture2D(tDiffuse, vUv + vec2(0.0, sharpTexel.y)).rgb +
        texture2D(tDiffuse, vUv - vec2(0.0, sharpTexel.y)).rgb
      ) * 0.25;
      color.rgb += clamp((color.rgb - blurred) * sharpAmount, -0.08, 0.08);
      vec2 delta = vUv - 0.5;
      float dist = length(delta * vec2(1.15, 1.0));
      float vig = smoothstep(1.14, 0.42, dist);
      color.rgb *= mix(1.0 - vignetteAmount, 1.0, vig);
      // Filmic S-curve: contrast dug back in post-tonemap — shadows sink,
      // mids hold, highlights keep their ACES shoulder.
      vec3 curved = color.rgb * color.rgb * (3.0 - 2.0 * color.rgb);
      color.rgb = mix(color.rgb, curved, contrast);
      // ONE-MEDIUM finish (stage only): the coherence pass the critic failed
      // was too shy — the stage must read as the SAME painted medium as the
      // sprites, not a graded photo behind them. Three terms, all fighter-
      // masked: (a) luminance posterization into a few painted tone steps,
      // (b) light per-channel palette quantization so smooth photographic
      // colour ramps snap to a shared palette, (c) an INK-EDGE line — the
      // luminance gradient repainted as a dark contour so the fence,
      // turnstile and signage carry the same outline language the sprite art
      // is drawn with. Paper tooth stays as the shared canvas surface.
      if (painterly > 0.001) {
        float fighterM = texture2D(tFbMask, vUv).a;
        float stageM = painterly * (1.0 - fighterM);
        float plum = clamp(dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
        float levels = 9.0;
        float quant = (floor(plum * levels) + 0.5) / levels;
        color.rgb *= mix(1.0, quant / max(plum, 0.004), stageM * 0.42);
        vec3 pal = floor(color.rgb * 11.0 + 0.5) / 11.0;
        color.rgb = mix(color.rgb, pal, stageM * 0.3);
        // Ink edge from the unsharp taps: horizontal/vertical luminance
        // gradients at 1-texel reach, folded into a soft dark stroke.
        float lumL = dot(texture2D(tDiffuse, vUv - vec2(sharpTexel.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
        float lumR = dot(texture2D(tDiffuse, vUv + vec2(sharpTexel.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
        float lumD = dot(texture2D(tDiffuse, vUv - vec2(0.0, sharpTexel.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
        float lumU = dot(texture2D(tDiffuse, vUv + vec2(0.0, sharpTexel.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
        float ink = smoothstep(0.05, 0.34, length(vec2(lumR - lumL, lumU - lumD)));
        color.rgb *= 1.0 - ink * 0.42 * stageM;
        float tooth = vnoise(vUv * vec2(760.0, 430.0)) * 0.55
          + vnoise(vUv * vec2(92.0, 54.0)) * 0.45;
        color.rgb *= 1.0 + (tooth - 0.5) * 0.085 * stageM;
      }
      // Whisper of ambient floor in the true blacks only (fades by ~0.10
      // luminance): the frame keeps night air without the milky haze.
      float lum = clamp(dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
      color.rgb += floorColor * (1.0 - smoothstep(0.0, 0.10, lum));
      // Super-freeze WORLD treatment (fighter-masked): the stage behind the
      // attacker drops toward a warm-grey settled still while the sprite
      // keeps its colour — SF6's "time stopped around him" read.
      if (superLevel > 0.001) {
        float sfm = texture2D(tFbMask, vUv).a;
        float sl = superLevel * (1.0 - sfm);
        color.rgb = mix(color.rgb, vec3(lum) * vec3(0.86, 0.78, 0.72), sl * 0.5);
      }
      // Super-freeze duotone: luminance remapped onto an indigo->amber ramp.
      if (duotone > 0.001) {
        vec3 duo = mix(vec3(0.05, 0.03, 0.15), vec3(1.05, 0.62, 0.2), smoothstep(0.04, 0.92, lum));
        color.rgb = mix(color.rgb, duo * (0.25 + 0.75 * lum + 0.25 * smoothstep(0.5, 1.0, lum)), duotone);
      }
      // HUD shelf mask: the render drops to near-black under the DOM HUD
      // strip so stage glow (lamp bloom, sodium sky) never bleeds into the
      // health-bar band. The shelf edge sits BELOW the whole HUD block
      // (bars + grit labels reach vUv.y ~0.89) with a tight 2% soft edge —
      // a designed letterbox shelf, not a leaky gradient. Runs post-bloom,
      // so even hot lamp halos die before they touch the bars.
      color.rgb *= mix(0.045, 1.0, 1.0 - smoothstep(0.878, 0.906, vUv.y));
      // Fine luminance-weighted film grain with a chroma component. CUT ~45%
      // ON THE CHARACTER LAYER (critic fix 6): full-strength grain beat
      // against the sprite texel grid into moiré on Jez's face — the stage
      // keeps the full dither, the fighters sit almost clean inside it.
      float g = hash(vUv * vec2(1287.0, 727.0) + vec2(mod(time * 61.7, 941.0)));
      float g2 = hash(vUv * vec2(919.0, 613.0) + vec2(mod(time * 47.3, 733.0)));
      vec3 grainVec = mix(vec3(g), vec3(g, g2, 1.0 - g2 * 0.7 - g * 0.3), 0.45);
      float fbGrainM = 1.0 - texture2D(tFbMask, vUv).a * 0.45;
      color.rgb += (grainVec - 0.5) * grainAmount * fbGrainM * (0.25 + 0.75 * (1.0 - lum));
      gl_FragColor = color;
    }
  `,
};

export function buildPostStack(renderer, scene, camera, { width, height, quality }) {
  const composer = new EffectComposer(renderer);
  composer.setSize(width, height);
  composer.setPixelRatio(renderer.getPixelRatio());

  composer.addPass(new RenderPass(scene, camera));

  // Spike A: stage-only painterly smoothing (fighter-masked Kuwahara) on the
  // linear HDR buffer, pre-bloom. Disabled = zero extra renders/copies.
  const pr = renderer.getPixelRatio();
  const painterlyPass = new StagePainterlyPass(scene, camera, width * pr, height * pr);
  painterlyPass.enabled = false;
  composer.addPass(painterlyPass);

  // Tight threshold + small radius: only genuinely hot emitters (neon tubes,
  // lamp heads, impact cores) bloom, and they bloom LOCALLY. Threshold sits
  // above anything sprite-white can reach so the fighters never bloom.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    quality === "high" ? 0.5 : 0.42,   // strength
    0.18,                              // radius
    1.35,                              // threshold (linear HDR luminance)
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const grainPass = new ShaderPass(VignetteGrainShader);
  // Unsharp radius in real backing-store texels (composer runs at DPR).
  grainPass.uniforms.sharpTexel.value.set(1 / (width * pr), 1 / (height * pr));
  grainPass.uniforms.tFbMask.value = painterlyPass.maskRT.texture;
  composer.addPass(grainPass);

  let fxaaPass = null;
  if (quality === "high") {
    fxaaPass = new FXAAPass();
    composer.addPass(fxaaPass);
  }

  return {
    composer,
    bloomPass,
    grainPass,
    setTime(seconds) {
      grainPass.uniforms.time.value = seconds;
    },
    setAberration(level) {
      grainPass.uniforms.aberration.value = Math.max(0, level);
    },
    // Impact radial-blur pulse (0 = no-op, byte-identical).
    setRadial(level) {
      grainPass.uniforms.radial.value = Math.max(0, level);
    },
    // Contact-point refraction pop (0 = no-op); u/v in screen uv space.
    setImpactPop(level, u, v) {
      grainPass.uniforms.pop.value = Math.max(0, level);
      if (level > 0) grainPass.uniforms.popCenter.value.set(u, v);
    },
    // Super-freeze stage settle (fighter-masked desaturation).
    setSuper(level) {
      grainPass.uniforms.superLevel.value = THREE.MathUtils.clamp(level, 0, 1);
    },
    setDuotone(level) {
      grainPass.uniforms.duotone.value = THREE.MathUtils.clamp(level, 0, 1);
    },
    // Spike A toggle: painterly stage smoothing + posterize/paper finish.
    setPainterly(on) {
      painterlyPass.enabled = Boolean(on);
      grainPass.uniforms.painterly.value = on ? 1 : 0;
    },
    setSize(w, h) {
      composer.setSize(w, h);
      bloomPass.setSize(w, h);
    },
    dispose() {
      painterlyPass.dispose();
      composer.dispose();
    },
  };
}
