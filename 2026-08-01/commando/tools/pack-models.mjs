// pack-models.mjs — packs the source GLBs (tools/raw/<name>.glb, see models.txt)
// into the files the game loads: adventurer, swat, beach (rigged Quaternius
// Modular Men), props (KolosStudios military pack + a few Toon Shooter pieces)
// and nature (plants, trees, rocks).
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   node tools/pack-models.mjs assets/models
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as F from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw');
const OUT = process.argv[2] || 'assets/models';
await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
fs.mkdirSync(OUT, { recursive: true });

// the Ultimate Modular Men share one rig and 24 clips; keep the ones the game uses
const CLIPS = ['Idle', 'Idle_Gun_Pointing', 'Idle_Gun_Shoot', 'Gun_Shoot', 'Run', 'Run_Shoot', 'Walk', 'Death', 'Punch_Right', 'Wave', 'HitRecieve'];

async function finish(doc, file, { tex } = {}) {
  await doc.transform(
    F.dedup(), F.prune(), F.resample(), F.unpartition(),
    ...(tex ? [F.textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [tex, tex] })] : []),
    F.quantize(), F.meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(path.join(OUT, file), doc);
  console.log(file, fs.statSync(path.join(OUT, file)).size);
}

// same rig in every file, so only one of them needs to carry the clips
async function character(src, file, clips) {
  const doc = await io.read(path.join(RAW, src + '.glb'));
  const root = doc.getRoot();
  for (const n of root.listNodes()) if (n.getName() === 'Backpack') n.dispose();
  for (const a of root.listAnimations()) {
    const nm = a.getName().split('|')[1];
    if (!clips || !nm || !CLIPS.includes(nm)) a.dispose(); else a.setName(nm);
  }
  await finish(doc, file);
}

// several single-model files into one document, each under a node named after it
async function bundle(names, file, opt = {}) {
  const target = new Document();
  target.createBuffer();
  const scene = target.createScene('models');
  for (const name of names) {
    const src = await io.read(path.join(RAW, name + '.glb'));
    const wrap = src.createNode(name);
    for (const s of src.getRoot().listScenes()) for (const c of s.listChildren()) { s.removeChild(c); wrap.addChild(c); }
    src.getRoot().listScenes()[0].addChild(wrap);
    // normal maps are wasted from a top-down camera
    if (opt.dropNormals) for (const m of src.getRoot().listMaterials()) m.setNormalTexture(null);
    // the densest plants are drawn by the hundred: thin them out
    const ratio = opt.simplify && opt.simplify[name];
    if (ratio) await src.transform(F.weld(), F.simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.012 }));
    const map = F.mergeDocuments(target, src);
    for (const s of target.getRoot().listScenes()) if (s !== scene) { for (const c of s.listChildren()) s.removeChild(c); s.dispose(); }
    scene.addChild(map.get(wrap));
  }
  target.getRoot().setDefaultScene(scene);
  await finish(target, file, opt);
}

const list = fs.readFileSync(path.join(HERE, 'models.txt'), 'utf8').trim().split(/\r?\n/).map(l => l.split(' ')[0]);
for (const n of ['adventurer', 'swat', 'beach']) await character('man-' + n, n + '.glb', n === 'swat');
const nature = (n) => n.startsWith('mk-');
await bundle(list.filter(n => !n.startsWith('man-') && !nature(n)), 'props.glb', { tex: 256 });
const SIMPLIFY = {
  'mk-tree-1': 0.4, 'mk-tree-2': 0.4,
  'mk-dead-tree-1': 0.3, 'mk-dead-tree-2': 0.3, 'mk-bush-flowers': 0.5, 'mk-bush': 0.5,
};
await bundle(list.filter(nature), 'nature.glb', { tex: 512, dropNormals: true, simplify: SIMPLIFY });
