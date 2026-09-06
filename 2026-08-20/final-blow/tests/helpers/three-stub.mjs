// A minimal stand-in for "three" (and the vendored postprocessing / addon
// modules) so Node can LINK and DRIVE renderer/three/*.mjs in unit tests.
// Nothing here renders: it only carries the state poseRig writes (positions,
// rotations, scales, colours, uniform values) so a test can read it back.
// Installed by tests/helpers/three-stub-loader.mjs via module.register().

export class Vector2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
}

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

export class Euler {
  constructor() { this.x = 0; this.y = 0; this.z = 0; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

export class Color {
  constructor(r, g, b) {
    this.r = 1; this.g = 1; this.b = 1;
    if (g === undefined && b === undefined) this.set(r ?? 0xffffff);
    else this.setRGB(r, g, b);
  }
  set(value) {
    if (typeof value === "number") return this.setHex(value);
    if (typeof value === "string") return this.setHex(parseInt(value.replace("#", "").slice(0, 6), 16));
    return this.copy(value);
  }
  setHex(hex) {
    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;
    return this;
  }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  lerp(c, a) {
    this.r += (c.r - this.r) * a;
    this.g += (c.g - this.g) * a;
    this.b += (c.b - this.b) * a;
    return this;
  }
  multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
  getHex() {
    return (Math.round(this.r * 255) << 16) | (Math.round(this.g * 255) << 8) | Math.round(this.b * 255);
  }
}

export const MathUtils = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  degToRad: (d) => (d * Math.PI) / 180,
};

class Layers {
  constructor() { this.mask = 1; }
  enable(n) { this.mask |= 1 << n; }
}

export class Object3D {
  constructor() {
    this.position = new Vector3();
    this.rotation = new Euler();
    this.scale = new Vector3(1, 1, 1);
    this.children = [];
    this.visible = true;
    this.layers = new Layers();
    this.renderOrder = 0;
    this.name = "";
    this.userData = {};
  }
  add(...nodes) { for (const node of nodes) this.children.push(node); return this; }
  remove(...nodes) { this.children = this.children.filter((c) => !nodes.includes(c)); return this; }
  traverse(fn) { fn(this); for (const child of this.children) child.traverse?.(fn); }
}

export class Group extends Object3D {}
export class Scene extends Object3D {}

export class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
    this.castShadow = false;
    this.receiveShadow = false;
  }
}

export class Points extends Mesh {}

export class BufferAttribute {
  constructor(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
    this.count = array.length / itemSize;
    this.needsUpdate = false;
  }
  setXYZ(i, x, y, z) {
    this.array[i * 3] = x; this.array[i * 3 + 1] = y; this.array[i * 3 + 2] = z;
    return this;
  }
  getX(i) { return this.array[i * this.itemSize]; }
  setZ(i, z) { this.array[i * this.itemSize + 2] = z; }
}

export class BufferGeometry {
  constructor() { this.attributes = {}; this.disposed = false; }
  setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
  translate() { return this; }
  dispose() { this.disposed = true; }
}

export class PlaneGeometry extends BufferGeometry {
  constructor(w = 1, h = 1, ws = 1, hs = 1) {
    super();
    const count = (ws + 1) * (hs + 1);
    this.attributes.position = new BufferAttribute(new Float32Array(count * 3), 3);
  }
}

class Material {
  constructor(options = {}) {
    Object.assign(this, options);
    if (!(this.color instanceof Color)) this.color = new Color(this.color ?? 0xffffff);
    if (this.emissive !== undefined && !(this.emissive instanceof Color)) this.emissive = new Color(this.emissive);
    this.userData = {};
    this.needsUpdate = false;
    this.disposed = false;
  }
  dispose() { this.disposed = true; }
}
export class MeshStandardMaterial extends Material {}
export class MeshBasicMaterial extends Material {}
export class MeshDepthMaterial extends Material {}
export class PointsMaterial extends Material {}
export class ShaderMaterial extends Material {}

export class Texture {
  constructor(image = null) {
    this.image = image;
    this.repeat = new Vector2(1, 1);
    this.offset = new Vector2(0, 0);
    this.anisotropy = 1;
    this.colorSpace = "";
    this.matrixAutoUpdate = true;
    this.needsUpdate = false;
    this.disposed = false;
  }
  dispose() { this.disposed = true; }
}
export class CanvasTexture extends Texture {
  constructor(image) { super(image); this.needsUpdate = true; }
}
export class DataTexture extends Texture {
  constructor(data, width, height) { super({ data, width, height }); }
}

export class Fog { constructor(color, near, far) { this.color = color; this.near = near; this.far = far; } }
export class Light extends Object3D {
  constructor(color, intensity) { super(); this.color = new Color(color); this.intensity = intensity; this.shadow = { mapSize: new Vector2(), camera: {}, bias: 0, intensity: 1 }; }
}
export class DirectionalLight extends Light {}
export class PointLight extends Light {}
export class SpotLight extends Light {}
export class HemisphereLight extends Light {}
export class PerspectiveCamera extends Object3D {
  constructor() { super(); }
  lookAt() {}
  updateMatrixWorld() {}
}

export const SRGBColorSpace = "srgb";
export const DoubleSide = 2;
export const FrontSide = 0;
export const RGBADepthPacking = 3201;
export const AdditiveBlending = 2;
export const NormalBlending = 1;
export const RepeatWrapping = 1000;
export const MirroredRepeatWrapping = 1002;
export const LinearFilter = 1006;
export const NearestFilter = 1003;

// Vendored postprocessing / addons the renderer imports by name.
export class Pass {}
export class FullScreenQuad {}
export class EffectComposer {}
export class RenderPass {}
export class ShaderPass {}
export class OutputPass {}
export class UnrealBloomPass {}
export class FXAAPass {}
export class GLTFLoader {}
