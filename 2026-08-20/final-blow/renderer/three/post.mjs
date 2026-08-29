// Post-processing stack for CINEMA 3D.
// ACES tone mapping + sRGB output happen in the OutputPass; the scene renders
// linear HDR into the composer's half-float target so bloom thresholds work on
// physical light values. Quality tiers:
//   high     — SSAO (subtle) + tight UnrealBloom + vignette/grain + FXAA
//   balanced — plain render + bloom + vignette/grain (no SSAO, no FXAA)
// (battery never reaches here: activation is refused upstream.)
import * as THREE from "three";
import { EffectComposer } from "../vendor/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "../vendor/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "../vendor/jsm/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "../vendor/jsm/postprocessing/UnrealBloomPass.js";
import { SSAOPass } from "../vendor/jsm/postprocessing/SSAOPass.js";
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
    grainAmount: { value: 0.024 },
    vignetteAmount: { value: 0.13 },
    // Blue-purple ambient floor (~#0a0a14): the playfield never crushes to
    // pure black — true black is reserved for the letterbox chrome, which the
    // 2D overlay canvas draws above this pass.
    floorColor: { value: new THREE.Vector3(0.040, 0.040, 0.080) },
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
    uniform vec3 floorColor;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 delta = vUv - 0.5;
      float dist = length(delta * vec2(1.15, 1.0));
      float vig = smoothstep(1.14, 0.42, dist);
      color.rgb *= mix(1.0 - vignetteAmount, 1.0, vig);
      // Ambient floor: lift the dead blacks toward blue-purple night air.
      // The lift only feeds shadows (fades out by ~0.16 luminance) so the
      // grade above the floor is untouched.
      float lum = clamp(dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
      color.rgb += floorColor * (1.0 - smoothstep(0.0, 0.16, lum));
      float g = hash(vUv * vec2(1287.0, 727.0) + vec2(mod(time * 61.7, 941.0)));
      color.rgb += (g - 0.5) * grainAmount * (0.2 + 0.8 * (1.0 - lum));
      gl_FragColor = color;
    }
  `,
};

export function buildPostStack(renderer, scene, camera, { width, height, quality }) {
  const composer = new EffectComposer(renderer);
  composer.setSize(width, height);
  composer.setPixelRatio(renderer.getPixelRatio());

  composer.addPass(new RenderPass(scene, camera));

  let ssaoPass = null;
  if (quality === "high") {
    // r185 SSAOPass is an overlay: it multiplies its blurred AO term over the
    // existing read buffer, so it sits AFTER the RenderPass.
    ssaoPass = new SSAOPass(scene, camera, width, height);
    ssaoPass.kernelRadius = 0.22;      // world-units: tight contact darkening
    ssaoPass.minDistance = 0.0004;
    ssaoPass.maxDistance = 0.05;
    ssaoPass.output = SSAOPass.OUTPUT.Default;
    composer.addPass(ssaoPass);
  }

  // Tight threshold + small radius: only genuinely hot emitters (neon tubes,
  // lamp heads, impact cores) bloom, and they bloom LOCALLY — the previous
  // wider/lower setting lifted the whole frame into haze.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    quality === "high" ? 0.55 : 0.45,  // strength
    0.22,                              // radius
    1.18,                              // threshold (linear HDR luminance)
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const grainPass = new ShaderPass(VignetteGrainShader);
  composer.addPass(grainPass);

  let fxaaPass = null;
  if (quality === "high") {
    fxaaPass = new FXAAPass();
    composer.addPass(fxaaPass);
  }

  return {
    composer,
    bloomPass,
    ssaoPass,
    grainPass,
    setTime(seconds) {
      grainPass.uniforms.time.value = seconds;
    },
    setSize(w, h) {
      composer.setSize(w, h);
      if (ssaoPass) ssaoPass.setSize(w, h);
      bloomPass.setSize(w, h);
    },
    dispose() {
      composer.dispose();
    },
  };
}
