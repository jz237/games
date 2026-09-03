// MESH FIGHTERS for CINEMA 3D (v4.3).
// Rigged, skinned 3D characters replace the sprite billboards, one side at a
// time, whenever a fighter's rig is present under renderer/rigs/<id>/. The
// sprite rig stays built and takes over instantly if the mesh is missing or
// still loading, so this layer can never blank a fighter.
//
// Contract (same as fighters.mjs): reads sim fields, writes nothing back.
// Every animation time is derived from SIM COUNTERS (stateFrame, attackTime,
// hitstun/knockdown/wakeup frames, simulationTick), never from wall-clock
// accumulation, so a rollback resimulation re-poses identically.
//
// Assets per fighter (built by the roster pipeline, see MOTION-3D.md):
//   rig.glb                   skinned mesh, Meshy humanoid skeleton, faces +Z
//   anim-<clip>.glb           armature-only clips; tracks bind by bone name
// Clip vocabulary: idle walk_fwd walk_back running jump jab hook uppercut
// roundhouse high_kick sweep block hit_face hit_body launched knockdown getup
// ko victory taunt dodge.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PX, worldX, worldY, SIM_FLOOR } from "./shared.mjs";
import { FIGHTER_MASK_LAYER } from "./post.mjs";

const RIG_ROOT = "./renderer/rigs/";
const CLIP_NAMES = ["idle", "walk_fwd", "walk_back", "running", "jump", "jab", "hook", "uppercut", "roundhouse",
  "high_kick", "sweep", "block", "hit_face", "hit_body", "launched", "knockdown", "getup", "ko", "victory", "taunt", "dodge"];

// Strike clips: the second the limb is at full extension, measured on the
// Meshy presets. Attack playback is time-warped so this instant lands on the
// move's first active frame, which is what keeps the 3D limb honest to the
// sim hitbox.
const STRIKE_PEAK = { jab: 0.55, hook: 0.62, uppercut: 0.7, roundhouse: 1.25, high_kick: 0.95, sweep: 0.9 };

// Ink-and-cel look (matches the roster showcase): 2-step ramp, outline hull.
const LOOK = { outline: 0.014, shadow: 0.75, sat: 1.05, size: 0.86 };
// Fighting-game facing: 3/4 toward camera, front toward the opponent.
const YAW_RIGHT = THREE.MathUtils.degToRad(-35);
const YAW_LEFT = THREE.MathUtils.degToRad(35);
const FPS = 60;

function punchTexture(tex, sat) {
  const img = tex.image;
  if (!img || !img.width) return tex;
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height); const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    for (let k = 0; k < 3; k += 1) p[i + k] = Math.max(0, Math.min(255, l + (p[i + k] - l) * sat));
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = tex.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class MeshFighterLayer {
  constructor(host) {
    this.host = host;
    this.group = new THREE.Group();
    this.group.name = "mesh-fighters";
    this.loader = new GLTFLoader();
    this.assets = new Map(); // id -> { status, rig(gltf), clips: {name: AnimationClip} }
    this.rigs = [null, null];
    this.grad = new THREE.DataTexture(new Uint8Array([Math.round(255 * LOOK.shadow), Math.round(255 * LOOK.shadow), Math.round(255 * LOOK.shadow), 255, 255, 255, 255, 255]), 2, 1);
    this.grad.minFilter = this.grad.magFilter = THREE.NearestFilter; this.grad.needsUpdate = true;
    this.enabled = true;
    // QA latch: last resolved { clip, time } per side.
    this.debug = [null, null];
  }

  // --- asset loading (lazy, per fighter, never blocks) -------------------
  loadAssets(id) {
    if (this.assets.has(id)) return this.assets.get(id);
    const entry = { status: "loading", rig: null, clips: {} };
    this.assets.set(id, entry);
    const base = `${RIG_ROOT}${id}/`;
    // The rig file is kept as bytes and parsed once per side: SkeletonUtils
    // clone drops the armature's 0.01 scale on this export, so a parse per
    // rig is the safe way to give P1 and P2 independent skeletons.
    fetch(`${base}rig.glb`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then((buf) => {
      entry.rigBytes = buf;
      return Promise.all(CLIP_NAMES.map((name) => this.loader.loadAsync(`${base}anim-${name}.glb`)
        .then((g) => { const clip = g.animations[0]; if (clip) { stripRootMotion(clip); clip.name = name; entry.clips[name] = clip; } })
        .catch(() => {})));
    }).then(() => {
      if (!entry.clips.jab) throw new Error("no clips");
      // Guard idle: the first six frames of the jab, ping-ponged (an upright,
      // fists-up stance; the Meshy idle presets are crouched or relaxed).
      entry.clips.guard = THREE.AnimationUtils.subclip(entry.clips.jab, "guard", 0, 6, 30);
      entry.status = "ready";
    }).catch(() => { entry.status = "missing"; });
    return entry;
  }

  buildRig(fighter, entry) {
    const id = fighter.def.id;
    // SkeletonUtils.clone gives each rig its own skeleton, so P1 and P2 can
    // be the same fighter (mirror match) without sharing bones.
    const model = entry.rigScene;
    const skinnedList = [];
    model.traverse((o) => { if (o.isSkinnedMesh) skinnedList.push(o); });
    const hulls = [];
    for (const o of skinnedList) {
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
      o.layers.enable(FIGHTER_MASK_LAYER);
      const src = o.material;
      const map = src.map ? punchTexture(src.map, LOOK.sat) : null;
      o.material = new THREE.MeshToonMaterial({ map, color: 0xffffff, gradientMap: this.grad });
      const hull = new THREE.SkinnedMesh(o.geometry, new THREE.MeshBasicMaterial({ color: 0x0a0806, side: THREE.BackSide }));
      hull.bind(o.skeleton, o.bindMatrix); hull.frustumCulled = false; hull.castShadow = false;
      hull.layers.enable(FIGHTER_MASK_LAYER);
      hull.material.onBeforeCompile = (sh) => {
        sh.uniforms.uOut = hull.userData.uOut;
        sh.vertexShader = "uniform float uOut;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize(objectNormal) * uOut;");
      };
      hull.userData.uOut = { value: 0 };
      o.parent.add(hull);
      hull.position.copy(o.position); hull.quaternion.copy(o.quaternion); hull.scale.copy(o.scale);
      hulls.push(hull);
    }
    // Normalise: feet on the floor, height from the sim's render size.
    const box = new THREE.Box3().setFromObject(model);
    const rawHeight = box.getSize(new THREE.Vector3()).y || 1;
    const targetHeight = this.host.fighterRenderSize(id) * PX * LOOK.size;
    const s = targetHeight / rawHeight;
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    for (const h of hulls) h.userData.uOut.value = LOOK.outline / s;
    const root = new THREE.Group();
    root.add(model);
    this.group.add(root);
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [name, clip] of Object.entries(entry.clips)) {
      const a = mixer.clipAction(clip); a.enabled = false; a.setEffectiveWeight(1); a.play();
      actions[name] = a;
    }
    // Contact shadow blob (the key light's shadow map handles the silhouette).
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, map: softBlob() }));
    blob.rotation.x = -Math.PI / 2; blob.renderOrder = 5; blob.scale.set(0.9, 0.5, 1);
    this.group.add(blob);
    return { id, root, model, mixer, actions, hulls, blob, current: null, paletteKey: this.host.fighterPaletteKey?.(fighter) || "" };
  }

  disposeRig(rig) {
    if (!rig) return;
    this.group.remove(rig.root); this.group.remove(rig.blob);
    rig.model.traverse((o) => { if (o.isMesh) { o.material.map?.dispose?.(); o.material.dispose?.(); } });
    rig.blob.material.map?.dispose(); rig.blob.material.dispose(); rig.blob.geometry.dispose();
  }

  // Returns true when this side is drawn as a mesh this frame.
  active(side) { return Boolean(this.enabled && this.rigs[side]?.root.visible); }

  update(state, dtSec, timeSec) {
    const fighters = state.fighters || [];
    // QA latch (render-only): per-side asset status + last pose pick.
    window.__fbMesh3d = { status: fighters.map((f) => (f ? this.assets.get(f.def.id)?.status || "unloaded" : null)), debug: this.debug, enabled: this.enabled,
      rigs: !window.__fbMeshProbe ? undefined : this.rigs.map((r) => { if (!r) return null; const b = new THREE.Box3().setFromObject(r.root); return { visible: r.root.visible, pos: r.root.position.toArray().map((v) => +v.toFixed(2)), min: b.min.toArray().map((v) => +v.toFixed(2)), max: b.max.toArray().map((v) => +v.toFixed(2)), groupParent: Boolean(this.group.parent), layers: r.model.children[0]?.layers.mask, skin: skinProbe(r.model) }; }) };
    for (let side = 0; side < 2; side += 1) {
      const fighter = fighters[side];
      let rig = this.rigs[side];
      if (!fighter || !this.enabled) { if (rig) { rig.root.visible = rig.blob.visible = false; } continue; }
      const entry = this.loadAssets(fighter.def.id);
      if (entry.status !== "ready") { if (rig) { rig.root.visible = rig.blob.visible = false; } continue; }
      const paletteKey = this.host.fighterPaletteKey?.(fighter) || "";
      if (!rig || rig.id !== fighter.def.id || rig.paletteKey !== paletteKey) {
        // Parse a fresh scene for this side (async); until it lands the sprite draws.
        const key = `${side}:${fighter.def.id}:${paletteKey}`;
        if (this.pendingKey?.[side] !== key) {
          this.pendingKey = this.pendingKey || [null, null]; this.pendingKey[side] = key;
          this.loader.parseAsync(entry.rigBytes.slice(0), "").then((gltf) => {
            if (this.pendingKey[side] !== key) return;
            entry.rigScene = gltf.scene;
            this.disposeRig(this.rigs[side]);
            this.rigs[side] = this.buildRig(fighter, entry);
            entry.rigScene = null;
          }).catch((e) => console.warn("mesh fighter parse failed", e));
        }
        if (rig) { rig.root.visible = rig.blob.visible = false; }
        continue;
      }
      rig.root.visible = rig.blob.visible = true;
      this.poseRig(rig, fighter, state);
    }
  }

  // --- the state -> clip choreography ---------------------------------------
  // Returns { clip, time, loop } from sim fields only.
  choose(fighter, state) {
    const f = fighter;
    const attack = f.attacking;
    const frame = f.stateFrame || 0;
    const sec = (n) => n / FPS;
    const airborne = !f.grounded;
    if (f.cinematicFrame !== null && f.cinematicFrame !== undefined) {
      // Finisher cinematics: the victim crumples, the attacker winds the big one.
      return f.down ? { clip: "ko", time: sec(frame), loop: false } : { clip: "uppercut", time: sec(frame) * 0.6, loop: false };
    }
    if (state.phase === "roundover" || state.phase === "finish" || state.phase === "result") {
      const other = (state.fighters || [])[1 - f.side];
      if (f.health <= 0 || f.down) return { clip: "ko", time: 1.2 + sec(frame), loop: false };
      if (other && f.health > other.health && !attack) return { clip: "victory", time: sec(frame), loop: false };
    }
    if (f.down || f.knockdownFrames > 0) return { clip: "knockdown", time: 0.9 + sec(frame) * 0.5, loop: false };
    if (f.wakeupFrames > 0) return { clip: "getup", time: 3.2 + sec(frame) * 1.6, loop: false };
    if (f.dizzyFrames > 0) return { clip: "hit_body", time: 0.4 + Math.abs(Math.sin(sec(state.simulationTick) * 3)) * 0.25, loop: false };
    if (f.hitstunFrames > 0 || f.airHitstunFrames > 0) {
      if (airborne || f.pendingKnockdown) return { clip: "launched", time: 0.35 + sec(frame) * 0.9, loop: false };
      const low = f.lastHitLevel === "low" || f.crouch;
      return { clip: low ? "hit_body" : "hit_face", time: 0.15 + sec(frame) * 1.1, loop: false };
    }
    if (f.blockstunFrames > 0 || f.block) return { clip: "block", time: 0.2 + sec(frame) * 0.8, loop: false };
    if (attack) {
      const t = f.attackTime || 0;
      const active0 = Math.max(1, attack.active?.[0] ?? attack.startupFrames ?? 6);
      const duration = Math.max(active0 + 1, attack.duration ?? (active0 + (attack.activeFrames || 4) + (attack.recoveryFrames || 8)));
      const clip = this.strikeClip(attack, f);
      const peak = STRIKE_PEAK[clip] || 0.6;
      const end = peak + 0.5;
      // Piecewise warp: startup -> [0, peak]; active+recovery -> [peak, end].
      const time = t <= active0 ? peak * (t / active0) : peak + (end - peak) * Math.min(1, (t - active0) / Math.max(1, duration - active0));
      return { clip, time, loop: false };
    }
    if (f.grabbing) return { clip: "hook", time: 0.3 + sec(frame) * 0.6, loop: false };
    if (f.grabbed) return { clip: "hit_body", time: 0.3, loop: false };
    if (airborne) {
      // Jump clip: rise on the way up, tuck at apex, land on the way down.
      const vy = f.vy || 0;
      const time = vy < -200 ? 0.35 : vy < 0 ? 0.55 : vy < 250 ? 0.75 : 1.0;
      return { clip: "jump", time, loop: false };
    }
    if (f.dashFrames > 0) return { clip: "running", time: sec(state.simulationTick) * 1.6, loop: true };
    if (f.crouch) return { clip: "block", time: 0.05, loop: false, crouch: true };
    const facing = f.facing >= 0 ? 1 : -1;
    const vx = f.vx || 0;
    if (Math.abs(vx) > 22) {
      const forward = Math.sign(vx) === facing;
      const speed = Math.abs(vx) / 300;
      return { clip: forward ? "walk_fwd" : "walk_back", time: sec(state.simulationTick) * speed * 1.1, loop: true };
    }
    if (f.tauntFrames > 0) return { clip: "taunt", time: sec(frame), loop: false };
    // Neutral: the guard loop, ping-ponged slowly, phase-offset per side.
    const period = 0.2 / 0.35;
    const ph = (sec(state.simulationTick) + fighter.side * 0.4) % (period * 2);
    return { clip: "guard", time: ph < period ? ph * 0.35 : (period * 2 - ph) * 0.35, loop: true };
  }

  strikeClip(attack, fighter) {
    const id = String(attack.id || attack.name || "");
    const kind = attack.kind;
    const level = String(attack.level || "").toLowerCase();
    if (attack.superMove) return "uppercut";
    if (level === "air") return "high_kick";
    if (level === "low") return kind === "light" ? "sweep" : "sweep";
    if (level === "overhead") return "hook";
    if (kind === "special") return hash(id) % 2 ? "high_kick" : "uppercut";
    if (kind === "heavy") return hash(id) % 2 ? "roundhouse" : "hook";
    return id.includes("kick") || id.includes("knee") ? "high_kick" : "jab";
  }

  poseRig(rig, fighter, state) {
    const pick = this.choose(fighter, state);
    const action = rig.actions[pick.clip] || rig.actions.guard || rig.actions.idle;
    if (!action) return;
    const clip = action.getClip();
    if (rig.current && rig.current !== action) { rig.current.enabled = false; rig.current.setEffectiveWeight(0); }
    action.enabled = true; action.setEffectiveWeight(1);
    action.setLoop(pick.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.time = pick.loop ? ((pick.time % clip.duration) + clip.duration) % clip.duration : Math.min(pick.time, clip.duration - 1e-4);
    action.paused = false;
    rig.current = action;
    rig.mixer.update(0);
    this.debug[fighter.side] = { clip: pick.clip, time: Number(action.time.toFixed(3)) };

    const facing = fighter.facing >= 0 ? 1 : -1;
    rig.root.rotation.set(0, facing > 0 ? YAW_RIGHT : YAW_LEFT, 0);
    const crouchDrop = pick.crouch ? 0.28 : 0;
    rig.root.position.set(worldX(fighter.x), worldY(fighter.y) - crouchDrop, 0);
    // Down: the knockdown clip already lays the body flat; keep the root upright.
    const jump = Math.max(0, SIM_FLOOR - fighter.y);
    rig.blob.position.set(rig.root.position.x, 0.004, 0);
    const spread = 1 + jump * PX * 0.35;
    rig.blob.scale.set(0.9 * spread, 0.5 * spread, 1);
    rig.blob.material.opacity = 0.35 / spread;
    // Hit flash: brief white-out on the toon materials, same cue as the sprite.
    const flash = THREE.MathUtils.clamp(fighter.hitFlash / 0.14, 0, 1);
    rig.model.traverse((o) => { if (o.isSkinnedMesh && o.material.isMeshToonMaterial) o.material.emissive?.setScalar?.(flash * flash * 0.18); });
  }
}

function stripRootMotion(clip) {
  for (const tr of clip.tracks) {
    if (!tr.name.endsWith(".position")) continue;
    // The sim owns position: pin X/Z everywhere, and let the hips only DROP
    // below their opening height (knockdown / KO lie on the floor) — never
    // rise (BeHit_FlyUp would launch the body out of frame on its own).
    const v = tr.values; const hips = tr.name.includes("Hips");
    for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; v[i + 1] = hips ? Math.min(v[i + 1], v[1]) : v[1]; }
  }
}

function skinProbe(model) {
  let out = null;
  model.traverse((o) => {
    if (out || !o.isSkinnedMesh) return;
    const b0 = o.skeleton.bones[0]; let p = b0, inside = false; while (p) { if (p === model) { inside = true; break; } p = p.parent; }
    out = { bones: o.skeleton.bones.length, boneInside: inside, bone0y: +b0.matrixWorld.elements[13].toFixed(2), mat: o.material.type, hasMap: Boolean(o.material.map), visible: o.visible, geomVerts: o.geometry.attributes.position.count, skinIndex: Boolean(o.geometry.attributes.skinIndex) };
  });
  return out;
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

let blobTex = null;
function softBlob() {
  if (blobTex) return blobTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"); const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, "rgba(0,0,0,1)"); grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}
