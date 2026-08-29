// CINEMA 3D — Three.js presentation renderer for Final Blow. Entry module.
//
// Contract with game.js (see the "CINEMA 3D bridge" block there):
//   - lazily imported only when the toggle / ?renderer=3d activates, so the 2D
//     game never pays the cost;
//   - createRenderer(host) receives read-only references to the live sim state
//     plus the same lookup tables the 2D draw path uses; this module NEVER
//     mutates sim state — it is presentation only;
//   - renderFrame(timeMs, dtMs) is called from the existing render loop in
//     place of the 2D world draw; HUD/DOM and 2D overlay passes stay on top;
//   - onHit(payload) receives spawnHit-family latches (rollback-guarded).
//
// Module registry: future domain agents (stages, characters, vfx) plug in via
// registerStage(id, builder) / registerLayer(name, layer) /
// vfx.registerImpactEffect(tier, fn) without touching this file.
import * as THREE from "three";
import { PX, SIM_W, SIM_H } from "./shared.mjs";
import { buildNightEnvScene } from "./textures.mjs";
import { FramingCamera } from "./camera.mjs";
import { buildPostStack } from "./post.mjs";
import { FighterLayer } from "./fighters.mjs";
import { ImpactVfxLayer } from "./vfx.mjs";
import { buildSomersetStage } from "./stage-somerset.mjs";
import { buildGenericStage } from "./stage-generic.mjs";

const stageBuilders = new Map();
export function registerStage(id, builder) {
  stageBuilders.set(id, builder);
}
registerStage("somerset", buildSomersetStage);
for (const id of ["vet", "wildwood", "buffet", "cruise", "janney"]) {
  registerStage(id, (host, options) => buildGenericStage(host, { ...options, stageId: id }));
}

export function createRenderer(host) {
  const renderer3d = {
    ready: false,
    unavailable: false,
    canvas: null,
  };

  let renderer = null;
  let scene = null;
  let framing = null;
  let post = null;
  let stage = null;
  let stageId = null;
  let quality = "high";
  let manualQuality = null;
  let clockSec = 0;
  let frozenAt = null;
  let fpsEstimate = 60;
  let lastStatsFrame = { calls: 0, triangles: 0 };
  const layers = new Map();

  function resolveQuality() {
    if (manualQuality) return manualQuality;
    const profile = host.getPerformanceProfile();
    return profile?.id === "balanced" ? "balanced" : "high";
  }

  function buildStage() {
    const id = host.state.stage;
    if (stage && stageId === id) return;
    if (stage) {
      scene.remove(stage.group);
      stage.dispose?.();
    }
    const builder = stageBuilders.get(id) || stageBuilders.get("somerset");
    stage = builder(host, { quality });
    stageId = id;
    scene.add(stage.group);
    scene.fog = stage.fog || null;
    scene.background = stage.background || new THREE.Color(0x05070d);
  }

  function init() {
    try {
      const canvas = document.createElement("canvas");
      canvas.id = "cinema3d";
      canvas.setAttribute("aria-hidden", "true");
      // Sits under the 2D canvas (z-index 1): the 2D path keeps drawing its
      // screen-space overlays (flash, cut-ins, CRT, letterbox) on top.
      canvas.style.zIndex = "0";
      const gameCanvas = host.gameCanvas;
      gameCanvas.parentElement.insertBefore(canvas, gameCanvas);
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.24;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      quality = resolveQuality();
      const pixelRatio = quality === "high" ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(SIM_W, SIM_H, false);

      scene = new THREE.Scene();
      framing = new FramingCamera(SIM_W / SIM_H);

      // Night-city environment map: puddle + specular reflections.
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = buildNightEnvScene();
      scene.environment = pmrem.fromScene(envScene, 0.04).texture;
      pmrem.dispose();

      buildStage();

      const fighters = new FighterLayer(host);
      scene.add(fighters.group);
      layers.set("fighters", fighters);
      const vfx = new ImpactVfxLayer(host);
      scene.add(vfx.group);
      layers.set("vfx", vfx);
      // Silhouette guard: fighter sprites darken their edges while an impact
      // flash is live, so bursts never erase the characters.
      fighters.getFlashLevel = () => vfx.flashLevel();

      post = buildPostStack(renderer, scene, framing.camera, {
        width: SIM_W,
        height: SIM_H,
        quality,
      });

      renderer3d.canvas = canvas;
      renderer3d.ready = true;
    } catch (error) {
      console.warn("CINEMA 3D init failed; staying on the 2D renderer.", error);
      renderer3d.unavailable = true;
    }
  }

  function rebuildPost() {
    post?.dispose();
    post = buildPostStack(renderer, scene, framing.camera, {
      width: SIM_W,
      height: SIM_H,
      quality,
    });
  }

  renderer3d.setVisible = (visible) => {
    if (renderer3d.canvas) renderer3d.canvas.style.display = visible ? "block" : "none";
  };

  renderer3d.renderFrame = (timeMs, dtMs) => {
    if (!renderer3d.ready) return;
    const requested = resolveQuality();
    if (requested !== quality) {
      quality = requested;
      renderer.setPixelRatio(quality === "high" ? Math.min(window.devicePixelRatio || 1, 1.5) : 1);
      renderer.setSize(SIM_W, SIM_H, false);
      rebuildPost();
      // Stage shadow-map budgets differ per tier; rebuild lazily.
      stageId = null;
      buildStage();
    }
    buildStage();

    const dtSec = Math.min(dtMs / 1000, 0.1);
    const freeze = Boolean(window.__fbFreeze);
    if (!freeze) {
      clockSec += dtSec;
      frozenAt = null;
    } else if (frozenAt === null) {
      frozenAt = clockSec;
    }
    const t = freeze ? frozenAt : clockSec;

    const state = host.state;
    framing.update(state, host.cinematicCamera, freeze ? 0.0001 : dtSec, t);
    stage.update?.(t, state);
    for (const layer of layers.values()) layer.update(state, freeze ? 0 : dtSec, t);
    // Impact camera kick: a decaying 2-3px presentation shake on hits, layered
    // on top of the sim-driven shake the framing camera already maps.
    const kickPx = layers.get("vfx")?.kickLevel?.() ?? 0;
    if (kickPx > 0) {
      const camera = framing.camera;
      camera.position.x += Math.sin(t * 191.3) * kickPx * 1.1 * PX;
      camera.position.y += Math.cos(t * 147.7) * kickPx * 0.8 * PX;
      camera.updateMatrixWorld();
    }
    post.setTime(t);
    // Manual info reset so stats() reports the whole frame, not just the last
    // fullscreen composite quad.
    renderer.info.autoReset = false;
    renderer.info.reset();
    post.composer.render();

    fpsEstimate += ((1000 / Math.max(dtMs, 1)) - fpsEstimate) * 0.05;
    lastStatsFrame = {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  };

  renderer3d.onHit = (payload) => {
    layers.get("vfx")?.onHit(payload);
  };

  renderer3d.setQuality = (tier) => {
    if (tier !== "high" && tier !== "balanced" && tier !== null) return false;
    manualQuality = tier;
    return true;
  };

  renderer3d.registerLayer = (name, layer) => {
    if (layers.has(name) || !layer?.update) return false;
    layers.set(name, layer);
    if (layer.group) scene.add(layer.group);
    return true;
  };
  renderer3d.registerStage = registerStage;
  renderer3d.registerImpactEffect = (tier, fn) => layers.get("vfx")?.registerImpactEffect(tier, fn);

  renderer3d.stats = () => ({
    drawcalls: lastStatsFrame.calls,
    tris: lastStatsFrame.triangles,
    fps: Math.round(fpsEstimate),
    quality,
    stage: stageId,
    programs: renderer?.info.programs?.length ?? 0,
  });

  renderer3d.forceTime = (ms) => {
    clockSec = ms / 1000;
    frozenAt = clockSec;
    window.__fbFreeze = true;
    return clockSec;
  };

  init();

  // QA surface (spec item 7).
  window.__finalBlowThree = {
    get active() {
      return Boolean(renderer3d.ready && host.isWorldActive());
    },
    stats: renderer3d.stats,
    setQuality: renderer3d.setQuality,
    forceTime: renderer3d.forceTime,
    registerStage,
    registerLayer: renderer3d.registerLayer,
    registerImpactEffect: renderer3d.registerImpactEffect,
    // Debug internals for QA probes (read-only use).
    get _internals() {
      return { renderer, scene, camera: framing?.camera, post, stage };
    },
  };

  return renderer3d;
}
