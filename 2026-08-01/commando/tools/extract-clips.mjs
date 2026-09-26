// extract-clips.mjs — pulls extra animation clips out of an Ultimate Modular
// Men character GLB (Quaternius, CC0) into a small JSON the game loads beside
// the packed models. All the pack's characters share one rig, so clips taken
// from its Swat.glb drive every soldier. No dependencies: it reads the glTF
// binary directly and writes three.js AnimationClip JSON.
//   node tools/extract-clips.mjs <Swat.glb> assets/anims/swat-extra.json Run_Back Run_Left ...
// Build v10 source: the pack's glb/Swat.glb (sha256 a835107bac833eb9…), the
// same character poly.pizza serves as man-swat (identical clips to 0.006 rad).
import fs from 'fs';

const [src, out, ...want] = process.argv.slice(2);
const buf = fs.readFileSync(src);
if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
const jl = buf.readUInt32LE(12);
const G = JSON.parse(buf.toString('utf8', 20, 20 + jl));
const binStart = 20 + jl + 8;
const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jl));

const SIZE = { SCALAR: 1, VEC3: 3, VEC4: 4 };
function read(ai) {
  const a = G.accessors[ai], v = G.bufferViews[a.bufferView];
  if (a.componentType !== 5126) throw new Error('only float accessors');
  const n = a.count * SIZE[a.type], off = (v.byteOffset || 0) + (a.byteOffset || 0);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = bin.readFloatLE(off + i * 4);
  return f;
}
// three.js PropertyBinding.sanitizeNodeName
const clean = (s) => s.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
const r4 = (x) => Math.round(x * 1e4) / 1e4;

const clips = [];
for (const A of G.animations) {
  const name = A.name.split('|').pop();
  if (want.length && !want.includes(name)) continue;
  const tracks = [];
  let dur = 0;
  for (const ch of A.channels) {
    const path = ch.target.path;
    if (path === 'scale') continue;                       // the rig never scales
    const node = G.nodes[ch.target.node], s = A.samplers[ch.sampler];
    const times = read(s.input), values = read(s.output), k = path === 'rotation' ? 4 : 3;
    dur = Math.max(dur, times[times.length - 1]);
    // drop tracks that never leave the rest pose (the mixer fills those in)
    const rest = path === 'rotation' ? (node.rotation || [0, 0, 0, 1]) : (node.translation || [0, 0, 0]);
    let still = true;
    for (let i = 0; i < values.length && still; i++) if (Math.abs(values[i] - rest[i % k]) > 1e-4) still = false;
    if (still) continue;
    tracks.push({ name: clean(node.name) + '.' + (path === 'rotation' ? 'quaternion' : 'position'), type: path === 'rotation' ? 'quaternion' : 'vector',
      times: Array.from(times, r4), values: Array.from(values, r4) });
  }
  clips.push({ name, duration: r4(dur), tracks });
}
fs.mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ source: 'Quaternius Ultimate Modular Men (CC0) — Swat', clips }));
console.log(out, fs.statSync(out).size, 'bytes:', clips.map((c) => `${c.name} ${c.duration}s ${c.tracks.length} tracks`).join(', '));
