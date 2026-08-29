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
    grainAmount: { value: 0.017 },
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
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      if (aberration > 0.001) {
        // Radial R/B tear, centre-weighted out so the fighters stay readable.
        vec2 fromCentre = vUv - 0.5;
        vec2 tear = fromCentre * aberration * 0.007 * (0.35 + length(fromCentre) * 1.6);
        color.r = texture2D(tDiffuse, vUv + tear).r;
        color.b = texture2D(tDiffuse, vUv - tear).b;
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
      // Whisper of ambient floor in the true blacks only (fades by ~0.10
      // luminance): the frame keeps night air without the milky haze.
      float lum = clamp(dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
      color.rgb += floorColor * (1.0 - smoothstep(0.0, 0.10, lum));
      // Super-freeze duotone: luminance remapped onto an indigo->amber ramp.
      if (duotone > 0.001) {
        vec3 duo = mix(vec3(0.05, 0.03, 0.15), vec3(1.05, 0.62, 0.2), smoothstep(0.04, 0.92, lum));
        color.rgb = mix(color.rgb, duo * (0.25 + 0.75 * lum + 0.25 * smoothstep(0.5, 1.0, lum)), duotone);
      }
      // Fine luminance-weighted film grain (shadow-biased like camera noise).
      float g = hash(vUv * vec2(1287.0, 727.0) + vec2(mod(time * 61.7, 941.0)));
      color.rgb += (g - 0.5) * grainAmount * (0.25 + 0.75 * (1.0 - lum));
      gl_FragColor = color;
    }
  `,
};

export function buildPostStack(renderer, scene, camera, { width, height, quality }) {
  const composer = new EffectComposer(renderer);
  composer.setSize(width, height);
  composer.setPixelRatio(renderer.getPixelRatio());

  composer.addPass(new RenderPass(scene, camera));

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
  const pr = renderer.getPixelRatio();
  grainPass.uniforms.sharpTexel.value.set(1 / (width * pr), 1 / (height * pr));
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
    setDuotone(level) {
      grainPass.uniforms.duotone.value = THREE.MathUtils.clamp(level, 0, 1);
    },
    setSize(w, h) {
      composer.setSize(w, h);
      bloomPass.setSize(w, h);
    },
    dispose() {
      composer.dispose();
    },
  };
}
