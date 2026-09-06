// 5.3 SPECTACLE (#19) — battle scars as CINEMA 3D decals.
//
// The 2D canvas has worn its floor since 5.0 (a crack under every knockdown);
// in 3D the arena stayed showroom-clean, because nothing in renderer/three
// had ever heard of a scar. Now the 2D list rides the host bridge
// (`host.stageScars()` -> engine/stage-scars.mjs `scarDecals`) and this layer
// lays each mark down as a quad:
//   - floor marks lie ON the ground plane (x-rotated), pushed toward the
//     camera by how far below the floor line the 2D pass put them, so the
//     scatter band in front of the fighters survives the projection;
//   - wall marks (the wall-splat bruise) stand UP at the arena edge, facing
//     the camera at the height the body hit it.
//
// One texture per KIND, painted once from the shared SCAR_KINDS palette, so a
// crack is the same colour in both renderers and a 40-scar arena is 40 quads
// on ~7 textures rather than 40 canvases. Reads sim state only.
import * as THREE from "three";
import { PX, SIM_FLOOR, worldX, worldY, hash01 } from "./shared.mjs";
import { canvasTexture } from "./textures.mjs";
import { SCAR_KINDS } from "../../engine/stage-scars.mjs";

const DECAL_CAP = 40;
// A floor decal sits at z = (how far below the floor line the 2D mark is) x
// this, so the 2D scatter band (FLOOR+8..FLOOR+66) becomes ~0.06..0.53 units
// of depth in front of the fight plane instead of collapsing onto it.
const DEPTH_GAIN = 1.6;
const PLANE = new THREE.PlaneGeometry(1, 1);

// One kind, painted into a 128px tile about its centre: the stain ellipse,
// the bright rim for the wet kinds, the crack polyline(s) and the loose bits.
// Deterministic (hash01), so the texture is identical on every boot.
function scarTexture(kind) {
  const spec = SCAR_KINDS[kind] || SCAR_KINDS.crack;
  return canvasTexture(128, 128, (c, w, h) => {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const rx = w * 0.42;
    const ry = h * 0.2;
    c.globalAlpha = spec.lines ? 0.5 : 0.85;
    c.fillStyle = spec.scuff;
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
    if (!spec.lines) {
      c.globalAlpha = 0.7;
      c.strokeStyle = spec.edge;
      c.lineWidth = 2.5;
      c.beginPath();
      c.ellipse(cx, cy, rx * 0.94, ry * 0.9, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.lineCap = "round";
    c.lineJoin = "round";
    for (let line = 0; line < spec.lines; line += 1) {
      const turn = (line * Math.PI * 2) / Math.max(1, spec.lines);
      for (const [style, width, offset] of [[spec.edge, 4, -2], [spec.ink, 2.6, 0]]) {
        c.strokeStyle = style;
        c.lineWidth = width;
        c.globalAlpha = 1;
        c.beginPath();
        let px = cx;
        let py = cy + offset;
        c.moveTo(px, py);
        for (let seg = 0; seg < 4; seg += 1) {
          const angle = turn + (hash01(line * 17 + seg * 5 + 3) - 0.5) * 1.9;
          const length = (10 + hash01(line * 31 + seg) * 16) * spec.spread;
          px += Math.cos(angle) * length;
          py += Math.sin(angle) * length * 0.34;
          c.lineTo(px, py);
        }
        c.stroke();
      }
    }
    c.fillStyle = spec.debrisColor;
    for (let bit = 0; bit < spec.debris; bit += 1) {
      const angle = hash01(bit * 13 + 7) * Math.PI * 2;
      const reach = (12 + hash01(bit * 29 + 5) * 30) * spec.spread;
      const r = 2 + hash01(bit * 41) * 4;
      c.globalAlpha = 0.9;
      c.save();
      c.translate(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach * 0.34);
      c.rotate(hash01(bit * 53) * Math.PI);
      c.fillRect(-r, -r * 0.42, r * 2, r * 0.84);
      c.restore();
    }
  }, { srgb: true });
}

export class ScarDecalLayer {
  constructor(host) {
    this.host = host;
    this.group = new THREE.Group();
    this.group.name = "scar-decals";
    this.textures = new Map();
    this.quads = [];
    this.visibleCount = 0;
    this.lastKinds = {};
  }

  textureFor(kind) {
    let texture = this.textures.get(kind);
    if (!texture) {
      texture = scarTexture(kind);
      this.textures.set(kind, texture);
    }
    return texture;
  }

  quad(index) {
    let mesh = this.quads[index];
    if (!mesh) {
      mesh = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        opacity: 0,
        side: THREE.DoubleSide,
      }));
      mesh.frustumCulled = false;
      // Under the objects and the fighters: a decal is part of the ground.
      mesh.renderOrder = 1;
      mesh.visible = false;
      this.quads[index] = mesh;
      this.group.add(mesh);
    }
    return mesh;
  }

  update() {
    const decals = this.host.stageScars?.() ?? [];
    const kinds = {};
    let shown = 0;
    for (const decal of decals) {
      if (shown >= DECAL_CAP) break;
      const mesh = this.quad(shown);
      const texture = this.textureFor(decal.kind);
      if (mesh.material.map !== texture) {
        mesh.material.map = texture;
        mesh.material.needsUpdate = true;
      }
      const width = Math.max(12, decal.width) * PX;
      if (decal.wall) {
        // Standing on the arena edge, facing the camera.
        mesh.rotation.set(0, 0, decal.rot);
        mesh.position.set(worldX(decal.x), Math.max(width * 0.3, worldY(decal.y)), 0.04);
        mesh.scale.set(width * 0.8, width * 0.8, 1);
      } else {
        mesh.rotation.set(-Math.PI / 2, 0, decal.rot);
        mesh.position.set(worldX(decal.x), 0.003, (decal.y - SIM_FLOOR) * PX * DEPTH_GAIN);
        mesh.scale.set(width, width * 0.7, 1);
      }
      // The 3D ground is darker than the 2D plate (fog + the night grade),
      // so a decal carries a touch more alpha than its canvas twin.
      mesh.material.opacity = Math.min(1, decal.alpha * (decal.heavy ? 1.15 : 1));
      mesh.visible = true;
      kinds[decal.kind] = (kinds[decal.kind] || 0) + 1;
      shown += 1;
    }
    for (let index = shown; index < this.quads.length; index += 1) this.quads[index].visible = false;
    this.visibleCount = shown;
    this.lastKinds = kinds;
  }

  dispose() {
    for (const mesh of this.quads) {
      this.group.remove(mesh);
      mesh.material.dispose();
    }
    this.quads.length = 0;
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }
}
