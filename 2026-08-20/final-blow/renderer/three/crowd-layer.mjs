// v4.8 CINEMA 3D CROWD — the painted bystanders as fogged billboards.
//
// The 2D canvas resolves the crowd every tick (who stands where, which cell
// they wear, which way they face, how dim the fatality hold makes them) and
// hands the result over the bridge as host.crowdBillboards(). This layer only
// places one textured quad per spec on the stage floor: each depth band sits
// at its own z behind the fight plane with its x spread scaled by depth, so
// the crowd fills the frame the way the flat canvas bands do while the
// camera's parallax and the stage fog do the rest. Stages without a painted
// bank (Somerset's plate people, Janney's cats) hand over nothing, so the
// bespoke Somerset silhouettes are never doubled.
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
      color: new THREE.Color(1.25, 1.25, 1.25),
      toneMapped: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    entry = { mesh, texture, cellKey: "" };
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
      mesh.position.set(
        (spec.x - SIM_W * 0.5) * PX * depthScale + centreShift * width * spec.direction,
        height * 0.5 - footInset * height,
        z,
      );
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
