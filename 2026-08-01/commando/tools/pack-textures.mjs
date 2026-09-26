// pack-textures.mjs — builds the ground texture strips from the Poly Haven
// (CC0) 1K scans listed in textures.txt (downloaded to tools/raw/):
//   assets/textures/ground-albedo.webp  colour, one 512² layer per row
//   assets/textures/ground-normal.webp  normal X/Y (RG, OpenGL) + height (B), 256² per
//                                      layer (Z is rebuilt in the shader; no alpha, so
//                                      a browser canvas decodes it exactly)
// Layer order must match GROUND_LAYERS in src/terrain.js.
//   npm i sharp && node tools/pack-textures.mjs assets/textures
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw');
const OUT = process.argv[2] || 'assets/textures';
const S = 512, SN = 256;
const layers = fs.readFileSync(path.join(HERE, 'textures.txt'), 'utf8').trim().split(/\r?\n/).map((l) => l.split(' ')[0]);
fs.mkdirSync(OUT, { recursive: true });

const file = (id, kind) => {
  const names = kind === 'diff' ? [`${id}_diff_1k.jpg`, `${id}_diffuse_1k.jpg`] : [`${id}_${kind}_1k.jpg`];
  const f = names.map((n) => path.join(RAW, n)).find((p) => fs.existsSync(p));
  if (!f) throw new Error(`missing ${id} ${kind}`);
  return f;
};
const albedo = [], normal = [];
for (const id of layers) {
  albedo.push(await sharp(file(id, 'diff')).resize(S, S).removeAlpha().raw().toBuffer());
  const n = await sharp(file(id, 'nor_gl')).resize(SN, SN).removeAlpha().raw().toBuffer();
  const h = await sharp(file(id, 'disp')).resize(SN, SN).greyscale().raw().toBuffer();
  const rgb = Buffer.alloc(SN * SN * 3);
  for (let i = 0; i < SN * SN; i++) { rgb[i * 3] = n[i * 3]; rgb[i * 3 + 1] = n[i * 3 + 1]; rgb[i * 3 + 2] = h[i]; }
  normal.push(rgb);
}
const strip = (bufs, size, ch) => sharp(Buffer.concat(bufs), { raw: { width: size, height: size * bufs.length, channels: ch } });
await strip(albedo, S, 3).webp({ quality: 84 }).toFile(path.join(OUT, 'ground-albedo.webp'));
await strip(normal, SN, 3).webp({ quality: 88 }).toFile(path.join(OUT, 'ground-normal.webp'));
for (const f of ['ground-albedo.webp', 'ground-normal.webp']) console.log(f, fs.statSync(path.join(OUT, f)).size);
