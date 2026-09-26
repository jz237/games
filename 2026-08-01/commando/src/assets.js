// assets.js — models from poly.pizza: Quaternius (CC0) Ultimate Modular Men,
// Stylized Nature MegaKit and a few Toon Shooter pieces;
// KolosStudios' Military Pack (CC-BY). They ship packed into meshopt-compressed
// GLBs (assets/models/, see tools/), loaded once at boot. Everything the game
// builds from them is cached here and shared by every area.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const GLB = { adventurer: null, swat: null, beach: null, props: null, nature: null };
const VER = new URL(import.meta.url).searchParams.get('v') || '0';

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const names = Object.keys(GLB);
  let done = 0;
  const total = names.length + 1;
  await Promise.all([
    ...names.map(async (n) => {
      GLB[n] = await loader.loadAsync(`assets/models/${n}.glb?v=${VER}`);
      GLB[n].scene.updateMatrixWorld(true);
      onProgress && onProgress(++done / total);
    }),
    loadGround().then(() => onProgress && onProgress(++done / total)),
  ]);
}

// ------------------------------------------------------------------ ground textures
// Poly Haven (CC0) scans packed by tools/pack-textures.mjs into two vertical
// strips, one square layer per row: colour, and normal X/Y + height in RGB.
// They become texture arrays sampled by the terrain shader; `mean` is each
// layer's average linear colour (the terrain tints layers to its palette).
export const GROUND = { albedo: null, normal: null, mean: [] };
async function stripArray(url, srgb) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const w = bmp.width, n = Math.round(bmp.height / w);
  const c = document.createElement('canvas'); c.width = w; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
  const data = new Uint8Array(g.getImageData(0, 0, w, bmp.height).data.buffer);
  const t = new THREE.DataArrayTexture(data, w, w, n);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return { t, data, w, n };
}
async function loadGround() {
  const [a, nrm] = await Promise.all([stripArray(`assets/textures/ground-albedo.webp?v=${VER}`, true), stripArray(`assets/textures/ground-normal.webp?v=${VER}`, false)]);
  GROUND.albedo = a.t; GROUND.normal = nrm.t;
  const c = new THREE.Color(), px = a.w * a.w;
  GROUND.mean = [];
  for (let l = 0; l < a.n; l++) {
    let r = 0, g = 0, b = 0, k = 0;
    for (let i = 0; i < px; i += 7) {
      const o = (l * px + i) * 4;
      c.setRGB(a.data[o] / 255, a.data[o + 1] / 255, a.data[o + 2] / 255, THREE.SRGBColorSpace);
      r += c.r; g += c.g; b += c.b; k++;
    }
    GROUND.mean.push([r / k, g / k, b / k]);
  }
}

// ------------------------------------------------------------------ geometry helpers
// quantized glTF attributes → plain float attributes (so transforms can't clamp)
export function toFloat(geo) {
  const out = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(geo.attributes)) {
    const n = a.count, s = a.itemSize, arr = new Float32Array(n * s);
    for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) arr[i * s + j] = a.getComponent(i, j);
    out.setAttribute(k, new THREE.BufferAttribute(arr, s));
  }
  if (geo.index) out.setIndex(Array.from(geo.index.array));
  return out;
}

// sample a texture's pixels (for baking atlas colours into vertex colours)
const pixCache = new WeakMap();
function pixels(tex) {
  if (pixCache.has(tex)) return pixCache.get(tex);
  const img = tex.image, w = img.width, h = img.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const px = { w, h, d: g.getImageData(0, 0, w, h).data };
  pixCache.set(tex, px);
  return px;
}
const _c = new THREE.Color();
// per-vertex colour from the material (and its texture, sampled at each UV)
function bakeColor(geo, mat) {
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  const base = mat.color || new THREE.Color(1, 1, 1);
  const px = mat.map && geo.attributes.uv ? pixels(mat.map) : null, uv = geo.attributes.uv;
  for (let i = 0; i < n; i++) {
    _c.copy(base);
    if (px) {
      const u = ((uv.getX(i) % 1) + 1) % 1, v = ((uv.getY(i) % 1) + 1) % 1;
      const x = Math.min(px.w - 1, (u * px.w) | 0), y = Math.min(px.h - 1, (v * px.h) | 0), o = (y * px.w + x) * 4;
      const t = new THREE.Color().setRGB(px.d[o] / 255, px.d[o + 1] / 255, px.d[o + 2] / 255, THREE.SRGBColorSpace);
      _c.multiply(t);
    }
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// the node for a model inside a bundle
export function node(bundle, name) {
  const sc = GLB[bundle].scene;
  const o = sc.children.find(c => c.name === name) || sc.getObjectByName(name);
  if (!o) throw new Error(`model ${bundle}/${name} missing`);
  return o;
}

// every mesh under a model, as float geometry in the model's own space
function pieces(root) {
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m = new THREE.Matrix4(), out = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = toFloat(o.geometry);
    g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    out.push({ geo: g, mat: o.material });
  });
  return out;
}

// bounding box of a list of geometries
function boxOf(geos) {
  const b = new THREE.Box3(), t = new THREE.Box3();
  for (const g of geos) { g.computeBoundingBox(); t.copy(g.boundingBox); b.union(t); }
  return b;
}
// sit the model on y=0, centred on x/z, scaled to a target size
function normalize(geos, fit = {}) {
  const b = boxOf(geos), sz = b.getSize(new THREE.Vector3());
  let s = fit.s || 1;
  if (fit.h) s = fit.h / sz.y;
  else if (fit.w) s = fit.w / Math.max(sz.x, sz.z);
  else if (fit.l) s = fit.l / sz.z;
  const cx = fit.keepXZ ? 0 : (b.min.x + b.max.x) / 2, cz = fit.keepXZ ? 0 : (b.min.z + b.max.z) / 2;
  const cy = fit.cy ? (b.min.y + b.max.y) / 2 : b.min.y;   // cy: centre vertically (spinning objects)
  const m = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz));
  if (fit.ry) m.premultiply(new THREE.Matrix4().makeRotationY(fit.ry));
  for (const g of geos) { g.applyMatrix4(m); g.computeBoundingBox(); g.computeBoundingSphere(); }
  return { size: sz.multiplyScalar(s), scale: s };
}

const flatCache = {};
// one merged, vertex-coloured geometry for a flat-colour model: draws with the
// world's shared vertex-colour material (one draw call, same lighting as the
// rest of the scene). `tint` recolours pieces by material name.
export function flatGeo(bundle, name, fit = {}, tint = {}) {
  const key = bundle + '/' + name + JSON.stringify(fit) + JSON.stringify(tint);
  if (flatCache[key]) return flatCache[key];
  const ps = pieces(node(bundle, name));
  const geos = ps.map(({ geo, mat }) => {
    bakeColor(geo, mat);
    const t = tint[mat.name] || tint['*'];
    if (t) { const c = new THREE.Color(t), a = geo.attributes.color; for (let i = 0; i < a.count; i++) a.setXYZ(i, c.r, c.g, c.b); }
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    return geo;
  });
  normalize(geos, fit);
  const g = mergeGeometries(geos, false);
  g.userData.shared = true;
  return (flatCache[key] = g);
}

// split an indexed geometry by connected pieces: pick(box) → group key per piece
export function splitGeo(geo, pick) {
  const pos = geo.attributes.position, idx = geo.index.array, n = pos.count;
  const weld = new Map(), rep = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (!weld.has(k)) weld.set(k, i);
    rep[i] = weld.get(k);
  }
  const par = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(rep[idx[t]]), b = find(rep[idx[t + 1]]), c = find(rep[idx[t + 2]]);
    par[b] = a; par[find(c)] = a;
  }
  const boxes = new Map(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const r = find(rep[i]);
    if (!boxes.has(r)) boxes.set(r, new THREE.Box3());
    boxes.get(r).expandByPoint(v.fromBufferAttribute(pos, i));
  }
  const key = new Map([...boxes].map(([r, b]) => [r, pick(b)]));
  const tris = {};
  for (let t = 0; t < idx.length; t += 3) {
    const k = key.get(find(rep[idx[t]]));
    (tris[k] || (tris[k] = [])).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const out = {};
  for (const [k, list] of Object.entries(tris)) {
    const g = geo.clone(); g.setIndex(list);
    g.computeBoundingBox(); g.computeBoundingSphere();
    out[k] = g;
  }
  return out;
}

// the KolosStudios tank as hull / turret / barrel, each in its own pivot
// space (the model lies along X with the gun toward -X; turned to face +Z)
let TANK = null;
export const TANK_FIT = { s: 0.69, ry: Math.PI / 2 };
export function tankParts() {
  if (TANK) return TANK;
  const g = flatGeo('props', 'kolos-tank', TANK_FIT);
  g.computeBoundingBox();
  const deck = g.boundingBox.max.y * 0.485;
  // above the deck: the gun (long and forward), the turret (centred, over the
  // middle of the hull), and the rest is stowage on the hull
  const parts = splitGeo(g, (b) => {
    if (b.min.y < deck) return 'hull';
    if (b.min.z > -0.3 && (b.max.z - b.min.z > 1.6 || b.min.z > 0.3)) return 'barrel';
    if (Math.abs(b.min.x + b.max.x) / 2 < 1.1 && b.min.z > -2.6 && b.max.z < 0.6) return 'turret';
    return 'hull';
  });
  // turret centre = yaw pivot
  parts.turret.computeBoundingBox();
  const tb = parts.turret.boundingBox, pz = (tb.min.z + tb.max.z) / 2;
  parts.turret.translate(0, -deck, -pz);
  if (parts.barrel) parts.barrel.translate(0, -deck, -pz - 1.0);
  for (const p of Object.values(parts)) { p.userData.shared = true; p.computeBoundingSphere(); }
  return (TANK = { ...parts, deck, pivotZ: pz });
}

const texCache = {};
// textured model: one geometry per material, each with its source texture
export function texturedParts(bundle, name, fit = {}) {
  const key = bundle + '/' + name + JSON.stringify(fit);
  if (texCache[key]) return texCache[key];
  const ps = pieces(node(bundle, name));
  for (const { geo } of ps) for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  const info = normalize(ps.map(p => p.geo), fit);
  // merge pieces that share a texture
  const byMap = new Map();
  for (const p of ps) { const k = p.mat.map ? p.mat.map.uuid : 'none:' + p.mat.name; if (!byMap.has(k)) byMap.set(k, []); byMap.get(k).push(p); }
  const parts = [...byMap.values()].map(list => {
    const g = list.length > 1 ? mergeGeometries(list.map(p => p.geo), false) : list[0].geo;
    g.userData.shared = true;
    const m = list[0].mat;
    return { geo: g, map: m.map || null, color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1), name: m.name, alpha: m.transparent || m.alphaTest > 0 };
  });
  return (texCache[key] = { parts, size: info.size });
}

// sizes and names, for tuning (test hook)
export function describe() {
  const out = {};
  for (const [bn, g] of Object.entries(GLB)) {
    if (!g) continue;
    if (bn === 'props' || bn === 'nature') {
      for (const c of g.scene.children[0] ? g.scene.children : []) {
        const b = new THREE.Box3().setFromObject(c), s = b.getSize(new THREE.Vector3());
        out[bn + '/' + c.name] = [s.x, s.y, s.z].map(v => +v.toFixed(2));
      }
    } else {
      const bones = []; g.scene.traverse(o => { if (o.isBone) bones.push(o.name); });
      const meshes = []; g.scene.traverse(o => { if (o.isMesh) meshes.push(`${o.name}:${o.isSkinnedMesh ? 'skin' : 'rigid'}:${o.material.name}:${o.parent.name}`); });
      const b = new THREE.Box3().setFromObject(g.scene), s = b.getSize(new THREE.Vector3());
      out[bn] = { size: [s.x, s.y, s.z].map(v => +v.toFixed(2)), bones, meshes, clips: g.animations.map(a => `${a.name}:${a.duration.toFixed(2)}:${a.tracks.length}`) };
    }
  }
  return out;
}
