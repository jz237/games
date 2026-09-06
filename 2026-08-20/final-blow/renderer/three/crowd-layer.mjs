// v4.8 CINEMA 3D CROWD — the painted bystanders as fogged billboards.
//
// The 2D canvas resolves the crowd every tick (who stands where, which cell
// they wear, which way they face, how dim the fatality hold makes them) and
// hands the result over the bridge as host.crowdBillboards(). This layer only
// places one textured quad per spec on the stage floor: each depth band sits
// at its own z behind the fight plane with its x spread scaled by depth, so
// the crowd fills the frame the way the flat canvas bands do while the
// camera's parallax and the stage fog do the rest. Stages without a painted
// bank (Janney's cats) hand over nothing.
//
// v5.3 CROWD DEPTH: three things now ride the spec.
//   * `tilt` is real for people, not just scuffle members — a bystander whose
//     fighter just took the hit hunches onto the weight-shift cell and leans
//     away, so ONE hit reads as two crowds in 3D exactly as it does in 2D.
//   * `lift` raises a stationed person off the ground plane: Somerset's pair
//     wait on the station steps, which are a step up from the pavement.
//   * `grade` is the tone a BORROWING stage draws a loaned bank under. The 2D
//     path re-grades the sheet into a cached canvas; here it is a material
//     colour, which costs nothing and keeps one texture per sheet.
// Somerset is no longer empty: its eight painted bystanders come over this
// bridge, and they stand nearer the camera than the bespoke silhouette
// walkers (z -5.6 / -7.8 in stage-somerset.mjs), so neither doubles the other.
import * as THREE from "three";
import { PX, SIM_W, SIM_H } from "./shared.mjs";

const BASE_FOV = 30;
const BASE_DISTANCE = (SIM_H * 0.5 * PX) / Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
// World z of each band's feet (the fight plane is z = 0, the generic ground
// runs to z = -8.9, the backdrop card sits at -13.5).
const BAND_DEPTH = Object.freeze({ far: -8.6, mid: -7.4, near: -6.2, scuffle: -6.8 });
// A painted adult stands ~1.45 units at the near line — about 40% of a
// fighter on screen, the 2D proportion — and the bands shade smaller behind.
const BODY_HEIGHT = Object.freeze({ far: 1.25, mid: 1.35, near: 1.45, scuffle: 1.42 });
// Sim px of `lift` per world unit, matching the near band's 1.45 units against
// a ~134px painted adult at scale 1.
const LIFT_PER_PX = 1.45 / 134;
// Base tone of a painted billboard (the generic backdrops are lifted ~45% for
// the night grade and the crowd stands in front of them), and the per-grade
// multipliers a borrowed bank is re-lit by.
const BASE_TONE = Object.freeze([1.25, 1.25, 1.25]);
const GRADE_TONE = Object.freeze({
  // Sodium-lamp street: cooler and ~26% down, the same recipe as the 2D
  // CROWD_GRADES.night canvas pass.
  night: Object.freeze([0.76, 0.86, 1.04]),
});

export class CrowdLayer {
  constructor(host) {
    this.host = host;
    this.group = new THREE.Group();
    this.group.name = "crowd";
    this.meshes = new Map();
    this.textures = new Map();
    this.enabled = true;
    this.visibleCount = 0;
  }

  texture(name) {
    const cached = this.textures.get(name);
    if (cached) return cached;
    const image = this.host.crowdSheetImage?.(name);
    if (!image?.complete || !image.naturalWidth) return null;
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    this.textures.set(name, texture);
    return texture;
  }

  mesh(key, texture) {
    let entry = this.meshes.get(key);
    if (entry && entry.texture !== texture) {
      entry.mesh.material.map = texture;
      entry.mesh.material.needsUpdate = true;
      entry.texture = texture;
    }
    if (entry) return entry;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
      // The generic backdrops are lifted ~45% for the night grade; the crowd
      // stands in front of them under the same treatment.
      color: new THREE.Color(BASE_TONE[0], BASE_TONE[1], BASE_TONE[2]),
      toneMapped: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    entry = { mesh, texture, cellKey: "", grade: "" };
    this.meshes.set(key, entry);
    return entry;
  }

  setCell(entry, cell, image) {
    const cellKey = `${cell.x}:${cell.y}:${cell.w}:${cell.h}`;
    if (entry.cellKey === cellKey) return;
    entry.cellKey = cellKey;
    const uv = entry.mesh.geometry.attributes.uv;
    const u0 = cell.x / image.naturalWidth;
    const u1 = (cell.x + cell.w) / image.naturalWidth;
    const v0 = 1 - cell.y / image.naturalHeight;
    const v1 = 1 - (cell.y + cell.h) / image.naturalHeight;
    // PlaneGeometry vertex order: top-left, top-right, bottom-left, bottom-right.
    uv.setXY(0, u0, v0);
    uv.setXY(1, u1, v0);
    uv.setXY(2, u0, v1);
    uv.setXY(3, u1, v1);
    uv.needsUpdate = true;
  }

  update(state) {
    const specs = this.enabled && this.host.crowdBillboards ? this.host.crowdBillboards() : [];
    for (const entry of this.meshes.values()) entry.mesh.visible = false;
    let shown = 0;
    for (const spec of specs) {
      const texture = this.texture(spec.sheet);
      if (!texture) continue;
      const entry = this.mesh(spec.key, texture);
      const { mesh } = entry;
      const image = texture.image;
      this.setCell(entry, spec.cell, image);
      const z = BAND_DEPTH[spec.layer] ?? BAND_DEPTH.mid;
      const depthScale = (BASE_DISTANCE - z) / BASE_DISTANCE;
      const height = (BODY_HEIGHT[spec.layer] ?? BODY_HEIGHT.mid) * spec.height;
      const width = height * (spec.cell.w / spec.cell.h);
      // Feet on the floor; the cell's baseline is its bottom opaque row, and
      // its centre column is the figure's centre of mass, so the quad is
      // offset the way the 2D blit is.
      const footInset = (spec.cell.y + spec.cell.h - spec.cell.baseline) / spec.cell.h;
      const centreShift = ((spec.cell.x + spec.cell.w * 0.5) - spec.cell.cx) / spec.cell.w;
      const lift = (spec.lift || 0) * LIFT_PER_PX;
      mesh.position.set(
        (spec.x - SIM_W * 0.5) * PX * depthScale + centreShift * width * spec.direction,
        height * 0.5 - footInset * height + lift,
        z,
      );
      const grade = spec.grade || "";
      if (entry.grade !== grade) {
        entry.grade = grade;
        const tone = GRADE_TONE[grade] || null;
        mesh.material.color.setRGB(
          BASE_TONE[0] * (tone ? tone[0] : 1),
          BASE_TONE[1] * (tone ? tone[1] : 1),
          BASE_TONE[2] * (tone ? tone[2] : 1),
        );
        mesh.material.needsUpdate = true;
      }
      mesh.scale.set(width * spec.direction, height, 1);
      mesh.rotation.z = -spec.tilt;
      mesh.material.opacity = spec.alpha;
      mesh.visible = true;
      shown += 1;
    }
    this.visibleCount = shown;
  }

  dispose() {
    for (const entry of this.meshes.values()) {
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
    }
    for (const texture of this.textures.values()) texture.dispose();
    this.meshes.clear();
    this.textures.clear();
  }
}
