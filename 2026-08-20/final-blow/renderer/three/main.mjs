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
import { PX, SIM_W, SIM_H, worldX, worldY } from "./shared.mjs";
import { buildNightEnvScene } from "./textures.mjs";
import { FramingCamera } from "./camera.mjs";
import { buildPostStack } from "./post.mjs";
import { FighterLayer } from "./fighters.mjs";
import { MeshFighterLayer } from "./mesh-fighters.mjs";
import { ImpactVfxLayer } from "./vfx.mjs";
import { CrowdLayer } from "./crowd-layer.mjs";
import { WorldObjectsLayer } from "./world-objects.mjs";
import { ScarDecalLayer } from "./scar-decals.mjs";
import { EffectsLayer } from "./effects-layer.mjs";
import { buildSomersetStage } from "./stage-somerset.mjs";
import { buildGenericStage } from "./stage-generic.mjs";
// 5.1 (#45): per-stage sprite lighting — a stage builder may return its own
// `spriteLight`; otherwise the table answers for the id.
import { spriteLightFor } from "./stage-lighting.mjs";
// 5.1: the explicit list of everything this renderer reads off `host`, pinned
// by tests/cinema-host.test.mjs against the literal game.js passes in.
import { assertHostContract, CINEMA_HOST_MEMBERS, missingHostMembers } from "./host-contract.mjs";
export { CINEMA_HOST_MEMBERS };

const stageBuilders = new Map();
export function registerStage(id, builder) {
  stageBuilders.set(id, builder);
}
registerStage("somerset", buildSomersetStage);
for (const id of ["vet", "wildwood", "buffet", "cruise", "janney"]) {
  registerStage(id, (host, options) => buildGenericStage(host, { ...options, stageId: id }));
}

export function createRenderer(host) {
  // Loud, early, and caught by the game.js loader: a renamed bridge member
  // used to surface only as a black world when a player toggled 3D.
  assertHostContract(host);
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
  // ONE-MEDIUM direction (spike winner): the stage is painted toward the
  // sprites — fighter-masked Kuwahara smoothing + posterize/paper finish, so
  // the whole frame shares the sprites' graphic fidelity (SF6's own trick:
  // simplified painted backdrop, characters crispest). Default ON in 3D;
  // window.__fbStyle = "off" disables it live for A/B probes.
  let styleMode = null;
  // Super-freeze presentation: eased 0..1 while a grit super is in flight.
  // Drops the stage + fighter bodies toward a rim-lit silhouette and fires a
  // one-shot chromatic-split pulse on ignition. Render-only.
  let superDim = 0;
  let superWasActive = false;
  let aberrPulse = 0;
  // KO / round-start echo of the super-freeze graphic language: eased levels
  // that pull a lighter dose of the same duotone/radial DNA (render-only).
  let koGrade = 0;
  let introGrade = 0;
  // CRT/bezel dial-back at peak moments (super, KO): last CSS var written so
  // the DOM is only touched when the eased value actually moves.
  let lastPeakVar = -1;
  const scratchPop = new THREE.Vector3();

  // The 3D canvas is laid out at the game's CSS size, not the 1280x720 sim
  // size: on a 2000px-wide window with DPR 1 a 1x backing store is stretched
  // ~1.6x and everything goes soft. Scale the backing store to the displayed
  // pixels (CSS width / SIM_W x DPR), capped at 2.5x on the high tier.
  function resolvePixelRatio() {
    if (quality !== "high") return 1;
    const cssWidth = host.gameCanvas?.getBoundingClientRect?.().width || SIM_W;
    const ratio = (cssWidth / SIM_W) * (window.devicePixelRatio || 1);
    return Math.min(2.5, Math.max(1, ratio));
  }
  let lastPixelRatio = 0;

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
    // 5.1 (#45): the sprites are lit by THIS stage's practicals (the layer
    // may not exist yet on the first build — init() hands it over then).
    layers.get("fighters")?.setStageLight(stage.spriteLight || spriteLightFor(id));
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
      // 1.24 -> 1.5 (4.3): the night rigs read too dark on real monitors.
      renderer.toneMappingExposure = 1.5;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      quality = resolveQuality();
      // DPR cap 2 (was 1.5) on the high tier: on hi-dpi displays the sprite
      // texels stop beating against the CSS scanline pitch (critic fix 7).
      renderer.setPixelRatio(resolvePixelRatio());
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
      fighters.setStageLight(stage.spriteLight || spriteLightFor(stageId));
      // v4.3 MESH FIGHTERS: rigged 3D characters stand in for the sprite
      // billboards per side whenever renderer/rigs/<id>/ is present. The
      // sprite rig hides only while its side's mesh is actually drawn, so a
      // missing or still-loading rig falls straight back to the sprite.
      // ?fighters=sprite (or window.__fbMesh = "off") keeps the billboards.
      const meshFighters = new MeshFighterLayer(host);
      meshFighters.enabled = host.meshFightersEnabled ? host.meshFightersEnabled() : false;
      scene.add(meshFighters.group);
      layers.set("meshFighters", meshFighters);
      fighters.meshActive = (side) => meshFighters.active(side);
      renderer3d.meshFighters = meshFighters;
      const vfx = new ImpactVfxLayer(host);
      scene.add(vfx.group);
      layers.set("vfx", vfx);
      // v4.8 CINEMA 3D CROWD: the painted bystanders as fogged billboards on
      // the stage floor, resolved by the 2D crowd code over the bridge.
      const crowd = new CrowdLayer(host);
      scene.add(crowd.group);
      layers.set("crowd", crowd);
      renderer3d.crowd = crowd;
      host.crowdMediaRequest?.();
      // 5.1 CINEMA 3D GAMEPLAY READS: projectiles, thrown objects, the stage
      // weapon (telegraph / ground / carried) and Post's wire traps as
      // impostors painted by the 2D game's own painters over the bridge.
      const worldObjects = new WorldObjectsLayer(host);
      scene.add(worldObjects.group);
      layers.set("worldObjects", worldObjects);
      renderer3d.worldObjects = worldObjects;
      // 5.3 SPECTACLE: the arena wears the fight in 3D too — the 2D scar
      // list as ground and arena-edge decals.
      const scarDecals = new ScarDecalLayer(host);
      scene.add(scarDecals.group);
      layers.set("scarDecals", scarDecals);
      renderer3d.scarDecals = scarDecals;
      // 5.3 SPECTACLE (#47): the elemental flipbooks, the charging limb glow
      // and the 2D particle pool — all of it was simulated every frame and
      // drawn by nobody while the 3D world was on.
      const effects = new EffectsLayer(host);
      scene.add(effects.group);
      layers.set("effects", effects);
      renderer3d.effects = effects;
      effects.setPixelScale(SIM_H * renderer.getPixelRatio() * 0.5);
      // Silhouette guard: fighter sprites darken their edges while an impact
      // flash is live, so bursts never erase the characters.
      fighters.getFlashLevel = () => vfx.flashLevel();
      // Impact colour spill: the burst relights both fighters' sprites.
      fighters.getImpactSpill = () => vfx.spill();

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
    post.setPainterly?.(styleMode === "a");
  }

  // Screen real-estate reclaim (critic fix 7), 3D-active only: slim the CRT
  // bezel vignette, drop the page margins and calm the always-on scanline
  // veil. Every var defaults to 1 in CSS and is REMOVED the moment the 3D
  // world goes inactive — the 2D presentation stays byte-identical.
  let frameVarsApplied = false;
  function applyFrameVars(visible) {
    if (visible === frameVarsApplied) return;
    frameVarsApplied = visible;
    const frame = host.gameCanvas.parentElement;
    if (visible) {
      frame?.style.setProperty("--fb-bezel-scale", "0.5");
      document.body.style.setProperty("--fb-margin", "0.3");
    } else {
      frame?.style.removeProperty("--fb-bezel-scale");
      frame?.style.removeProperty("--fb-crt-fade");
      frame?.style.removeProperty("--fb-bezel-fade");
      document.body.style.removeProperty("--fb-margin");
      lastPeakVar = -1;
    }
  }

  renderer3d.setVisible = (visible) => {
    if (renderer3d.canvas) renderer3d.canvas.style.display = visible ? "block" : "none";
    applyFrameVars(Boolean(visible && renderer3d.ready));
  };

  renderer3d.renderFrame = (timeMs, dtMs) => {
    if (!renderer3d.ready) return;
    const requested = resolveQuality();
    const wantedRatio = Math.round(resolvePixelRatio() * 20) / 20;
    if (requested !== quality || wantedRatio !== lastPixelRatio) {
      quality = requested;
      lastPixelRatio = wantedRatio;
      renderer.setPixelRatio(wantedRatio);
      renderer.setSize(SIM_W, SIM_H, false);
      // gl_PointSize is in framebuffer pixels: the mirrored particle cloud
      // has to be told when the backing store moves.
      layers.get("effects")?.setPixelScale(SIM_H * wantedRatio * 0.5);
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

    // Painterly-stage switch (QA can set window.__fbStyle = "off" to compare).
    const requestedStyle = window.__fbStyle === "off" ? "off" : "a";
    if (requestedStyle !== styleMode) {
      styleMode = requestedStyle;
      post.setPainterly?.(styleMode === "a");
    }

    const state = host.state;
    framing.update(state, host.cinematicCamera, freeze ? 0.0001 : dtSec, t);
    // 5.3 SPECTACLE (#16/#43): the stage's own beat. `ambientPulse` is also
    // where the KO pulse is LATCHED (it rode inside the 2D-only
    // drawStageAmbient until 5.3), so this call is what makes a 3D KO flare
    // at all; the crowd's drawn reaction rides along as the floor under it.
    const ambientBeat = {
      surge: host.ambientPulse ? host.ambientPulse() : null,
      reaction: host.crowdReaction ? host.crowdReaction() : 0,
    };
    stage.update?.(t, state, ambientBeat);
    // Super freeze: ease the rim-lit silhouette dim while a grit super is in
    // flight (mirrors the 2D superDimLevel ease) + chromatic pulse on the
    // ignition frame. Read-only on sim state.
    const superActive = state.phase !== "over"
      && (state.fighters || []).some((fighter) => fighter.attacking?.superMove);
    const stepSec = freeze ? 0 : dtSec;
    superDim = THREE.MathUtils.clamp(superDim + (superActive ? 5.4 : -3.3) * stepSec, 0, 1);
    if (superActive && !superWasActive) aberrPulse = 1;
    superWasActive = superActive;
    aberrPulse = Math.max(0, aberrPulse - stepSec * 8);
    const fightersLayer = layers.get("fighters");
    if (fightersLayer) fightersLayer.superDim = superDim;
    const meshLayer = layers.get("meshFighters");
    if (meshLayer) {
      meshLayer.superDim = superDim;
      meshLayer.enabled = host.meshFightersEnabled ? host.meshFightersEnabled() : false;
    }
    stage.setDim?.(superDim);
    // Impact screen answer: a ~2-frame radial-blur + chromatic pulse rings
    // the lens on meaningful hits (the VFX layer decays it fast).
    const impactPulse = layers.get("vfx")?.pulseLevel?.() ?? 0;
    post.setAberration?.(Math.max(aberrPulse, impactPulse * 0.85, superDim > 0.5 ? (superDim - 0.5) * 0.45 : 0));
    // Super freeze adds a sustained radial whip on the stage behind the
    // attacker (the fighters sit in the sharp centre by construction).
    post.setRadial?.(Math.max(impactPulse, superDim * 0.42));
    // Contact-point lens pop: project the hit's world point into screen uv
    // for the ~1-2 frame local refraction/chroma punch.
    const popInfo = layers.get("vfx")?.popInfo?.();
    if (popInfo) {
      scratchPop.set(popInfo.x, popInfo.y, 0).project(framing.camera);
      post.setImpactPop?.(popInfo.level, (scratchPop.x + 1) / 2, (scratchPop.y + 1) / 2);
    } else {
      post.setImpactPop?.(0, 0.5, 0.5);
    }
    // KO + round-start echo the super's graphic DNA at a stronger dose than
    // before (critic fix l): one graphic language across every peak moment —
    // the KO visibly pulls the same indigo/amber print grade the super owns,
    // round-start carries a lighter breath of it.
    const koActive = state.phase === "roundover" || state.phase === "finish" || state.phase === "result";
    koGrade = THREE.MathUtils.clamp(koGrade + (koActive ? 2.4 : -3) * stepSec, 0, 1);
    const introActive = state.phase === "intro";
    introGrade = THREE.MathUtils.clamp(introGrade + (introActive ? 2.4 : -3) * stepSec, 0, 1);
    // SF6 super-flash: the frozen gameplay behind the cut-in band grades to a
    // two-tone indigo/amber while the super owns the frame. Render-only.
    post.setDuotone?.(Math.max(superDim * 0.82, koGrade * 0.44, introGrade * 0.26));
    // Fighter-masked stage settle behind the super (desaturated warm-grey).
    post.setSuper?.(superDim);
    // CRT/bezel dial-back (peak moments feel bigger than the screen): fade
    // the always-on scanline overlay ~50% and let the inner-bezel vignette
    // drop while a super or KO owns the frame. CSS vars default to 1, and
    // ONLY this 3D path ever writes them — 2D mode is byte-identical.
    const peak = Math.max(superDim, koGrade);
    const peakVar = Math.round(peak * 40) / 40;
    if (peakVar !== lastPeakVar) {
      lastPeakVar = peakVar;
      const frame = host.gameCanvas.parentElement;
      // 0.62 base (critic fix 7): the full-strength scanline veil shimmered
      // across the sprite faces and cheapened the character art; 3D mode
      // keeps the CRT flavour at ~60% and still sheds more at peak moments.
      frame?.style.setProperty("--fb-crt-fade", (0.62 * (1 - peakVar * 0.5)).toFixed(3));
      frame?.style.setProperty("--fb-bezel-fade", (1 - peakVar * 0.55).toFixed(3));
    }
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

  // MOTION FIX 12: ground-work dust latch (takeoff / landing / dash pushes),
  // 3D parity for the 2D motion-observer particles.
  renderer3d.onDust = (payload) => {
    layers.get("vfx")?.onDust(payload);
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
    crowd: renderer3d.crowd?.visibleCount ?? 0,
    // 5.1: impostors drawn this frame + what the sim held (QA: prove a thrown
    // pizza / grounded weapon / wire trap actually reached the 3D frame).
    objects: renderer3d.worldObjects?.visibleCount ?? 0,
    objectKinds: renderer3d.worldObjects?.lastKinds ?? null,
    // 5.3: battle scars drawn as decals this frame, and the tally by kind.
    scars: renderer3d.scarDecals?.visibleCount ?? 0,
    scarKinds: renderer3d.scarDecals?.lastKinds ?? null,
    // 5.3: element sprites / mirrored motes / rings / charges drawn this
    // frame, and how hard the stage's practicals are burning.
    effects: renderer3d.effects?.stats?.() ?? null,
    practicals: stage?.report?.() ?? null,
    tris: lastStatsFrame.triangles,
    fps: Math.round(fpsEstimate),
    quality,
    stage: stageId,
    programs: renderer?.info.programs?.length ?? 0,
    // 5.1 (#40/#45): bank readiness per side, build/evict tallies, cache
    // sizes and which stage's light the sprites wear.
    banks: layers.get("fighters")?.bankReport?.() ?? null,
  });

  // 5.1 (#40) QA: run every queued bank-build step synchronously (the
  // browser probe warms, then measures frame times with nothing pending).
  renderer3d.drainBankQueue = () => layers.get("fighters")?.drainBankQueue?.() ?? 0;

  renderer3d.forceTime = (ms) => {
    clockSec = ms / 1000;
    frozenAt = clockSec;
    window.__fbFreeze = true;
    return clockSec;
  };

  // Project a sim-space point (game.js pixel coordinates) through the live
  // framing camera into sim-canvas screen pixels. Used by the 2D CRT overlay
  // to lift its scanline veil off the character bodies (critic fix 6).
  const scratchProject = new THREE.Vector3();
  renderer3d.projectSim = (simX, simY) => {
    if (!renderer3d.ready || !framing) return null;
    scratchProject.set(worldX(simX), worldY(simY), 0).project(framing.camera);
    return {
      x: (scratchProject.x + 1) / 2 * SIM_W,
      y: (1 - (scratchProject.y + 1) / 2) * SIM_H,
    };
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
    drainBankQueue: renderer3d.drainBankQueue,
    registerStage,
    registerLayer: renderer3d.registerLayer,
    registerImpactEffect: renderer3d.registerImpactEffect,
    // 5.3 VERIFICATION HARNESS (sweep #54): the contract, checked against the
    // LIVE host object rather than the literal in game.js's source. The unit
    // test (tests/cinema-host.test.mjs) reads both ends statically; this is the
    // only read that proves the object the renderer actually holds still has
    // every member on it after the bridge was assembled and 3D booted.
    hostContract: () => ({ members: CINEMA_HOST_MEMBERS, ...missingHostMembers(host) }),
    // Debug internals for QA probes (read-only use).
    get _internals() {
      return { renderer, scene, camera: framing?.camera, post, stage };
    },
  };

  return renderer3d;
}
