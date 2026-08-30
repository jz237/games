// Tournament framing camera for CINEMA 3D.
// Reproduces the 2D presentation contract — both fighters always on screen,
// floor line pinned at the 2D FLOOR (600/720) — with a real perspective
// camera: slight low-angle hero framing, subtle midpoint parallax, and the
// existing cinematicCamera presentation moves (KO/counter punch-ins, recoil,
// dutch tilt) mapped onto genuine dolly/roll/truck moves. Presentation only:
// it reads sim + cinematic state and never writes anything back.
import * as THREE from "three";
import { PX, SIM_W, SIM_H, SIM_FLOOR, worldX, worldY } from "./shared.mjs";

const BASE_FOV = 30;
const EYE_HEIGHT = 1.02;              // low-angle SF6 hero framing (chest height)
const FLOOR_NDC_Y = 1 - 2 * (SIM_FLOOR / SIM_H); // -0.6667: 2D floor line
const FRAME_MARGIN = 0.42;            // world units kept beyond the far fighter
                                      // (0.5 left the corner-vs-corner solve
                                      // with a dead air ring — critic fix g)
const PARALLAX_FOLLOW = 0.34;         // how much the camera trucks with the midpoint
// Minimum punch-in: the camera never frames wider than this fraction of the
// full 1280px stage width. 0.88 (was 0.94): corner-vs-corner was bound by
// this floor, so the whole wide framing tightens ~6% — less empty centre,
// fighters nearer the frame edges, SF6's frame-filling wide.
const MIN_FILL = 0.88;

export class FramingCamera {
  constructor(aspect = SIM_W / SIM_H) {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.08, 90);
    this.baseDistance = (SIM_H * 0.5 * PX) / Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
    this.halfWidthAtPlane = SIM_W * 0.5 * PX;
    this.smoothedMid = 0;
    this.smoothedDistance = this.baseDistance;
    this.lookY = worldY(SIM_FLOOR) + 1.4;
    this.camera.position.set(0, EYE_HEIGHT, this.baseDistance);
    this.camera.lookAt(0, this.lookY, 0);
  }

  // timeSec is the renderer's freezable clock (deterministic under __fbFreeze).
  update(state, cinematic, dtSec, timeSec) {
    const camera = this.camera;
    const fighters = state.fighters || [];
    const ease = 1 - Math.exp(-dtSec * 5);

    // --- Tournament framing solve -------------------------------------------
    let mid = 0;
    let halfNeed = this.halfWidthAtPlane;
    if (fighters.length === 2) {
      const p0 = worldX(fighters[0].x);
      const p1 = worldX(fighters[1].x);
      mid = THREE.MathUtils.clamp((p0 + p1) * 0.5, -0.9, 0.9);
      this.smoothedMid += (mid - this.smoothedMid) * ease;
      const camX = this.smoothedMid * PARALLAX_FOLLOW;
      halfNeed = Math.max(Math.abs(p0 - camX), Math.abs(p1 - camX)) + FRAME_MARGIN;
    } else {
      this.smoothedMid += (0 - this.smoothedMid) * ease;
    }
    const camX = this.smoothedMid * PARALLAX_FOLLOW;
    const fillFloor = fighters.length === 2 ? MIN_FILL : 1;
    const distance = this.baseDistance * Math.max(fillFloor, halfNeed / (this.halfWidthAtPlane * 0.985));
    this.smoothedDistance += (distance - this.smoothedDistance) * ease;

    // --- Cinematic presentation moves (KO punch-in, recoil, dutch tilt) ----
    const zoom = Math.max(1, cinematic?.zoom ?? 1);
    const punch = 1 - 1 / zoom;
    const focusX = worldX(cinematic?.focusX ?? SIM_W * 0.5);
    const focusY = worldY(cinematic?.focusY ?? SIM_H * 0.5);
    // 2D translate offsets (px, y-down) become truck/pedestal moves.
    const truckX = -(cinematic?.x ?? 0) * PX;
    const truckY = (cinematic?.y ?? 0) * PX;
    // Screen shake reuses the exact 2D noise driven by simulationTick.
    const shakeScale = state.accessibility?.reducedMotion ? 0 : (state.accessibility?.shakeScale ?? 1);
    const shakeX = state.shake > 0 ? Math.sin((state.simulationTick + 1) * 12.9898) * state.shake * 9 * shakeScale * PX : 0;
    const shakeY = state.shake > 0 ? Math.cos((state.simulationTick + 1) * 7.233) * state.shake * 6 * shakeScale * PX : 0;
    // Subtle handheld drift so a static shot still breathes (freezes cleanly).
    const driftX = Math.sin(timeSec * 0.31) * 0.014 + Math.sin(timeSec * 0.117) * 0.008;
    const driftY = Math.cos(timeSec * 0.23) * 0.009;

    const px = camX + truckX + shakeX + driftX;
    const py = EYE_HEIGHT + truckY + shakeY + driftY;
    const pz = this.smoothedDistance;
    camera.position.set(px, py, pz);
    camera.fov = BASE_FOV / zoom;
    camera.updateProjectionMatrix();

    // --- Floor-line solve ----------------------------------------------------
    // Pick the lookAt height so the world floor (y=0 at the fighter plane)
    // projects to the same screen row the 2D renderer draws it on. Three
    // Newton-ish iterations converge far below visual threshold.
    let lookY = this.lookY;
    const target = new THREE.Vector3();
    for (let i = 0; i < 3; i += 1) {
      camera.lookAt(px, lookY, 0);
      camera.updateMatrixWorld();
      target.set(px, 0, 0).project(camera);
      const error = target.y - FLOOR_NDC_Y;
      lookY += error * (pz * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      if (Math.abs(error) < 0.0005) break;
    }
    this.lookY = lookY;
    // Punch-in steers the gaze toward the cinematic focus point.
    const gazeX = THREE.MathUtils.lerp(px, focusX, punch);
    const gazeY = THREE.MathUtils.lerp(lookY, focusY, punch);
    camera.lookAt(gazeX, gazeY, 0);
    // Dutch tilt -> genuine camera roll.
    const roll = -(cinematic?.rotation ?? 0);
    if (roll !== 0) camera.rotateZ(roll);
    camera.updateMatrixWorld();
  }
}
