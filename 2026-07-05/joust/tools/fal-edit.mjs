#!/usr/bin/env node
// Billboard pipeline step 2: repaint a game frame in the reference style via fal's
// openai/gpt-image-2/edit REST endpoint (the fal MCP tool is text-only).
// Usage: node tools/fal-edit.mjs <input.png> <out.png> [promptfile]  — key from ~/.claude.json
import fs from 'fs';
import { homedir } from 'os';

const [, , inPath, outPath, promptFile] = process.argv;
const cfg = JSON.parse(fs.readFileSync(`${homedir()}/.claude.json`, 'utf8'));
const KEY = cfg.mcpServers.fal.env.FAL_KEY;
if (!KEY) { console.error('no FAL_KEY'); process.exit(1); }

const dataUri = p => `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
const root = new URL('..', import.meta.url).pathname;
const ref = `${root}notes/art-raw/owner-reference.png`;

const prompt = promptFile ? fs.readFileSync(promptFile, 'utf8') : `The first image is a frame from a side-view arcade video game. Repaint the ENTIRE first image in the exact artistic style of the second image (painterly realism, pale worn cracked stone slab platforms with icy-silver tops, rough dark rocky undersides glowing hot orange with molten drips, deep blue-black craggy cavern walls, bright molten lava, drifting embers). CRITICAL: keep every platform at exactly the same position, size and shape as the first image — same camera, same layout, same horizon. Do NOT add any characters, creatures, riders, text, logos or UI. Output only the repainted scene.`;

const body = {
  prompt,
  image_urls: [dataUri(inPath), dataUri(ref)],
  image_size: { width: 1280, height: 720 },
  num_images: 1,
};

const res = await fetch('https://fal.run/openai/gpt-image-2/edit', {
  method: 'POST',
  headers: { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(280000),
});
const txt = await res.text();
if (!res.ok) { console.error('HTTP', res.status, txt.slice(0, 800)); process.exit(1); }
const json = JSON.parse(txt);
const url = json.images?.[0]?.url || json.image?.url;
if (!url) { console.error('no image in response:', txt.slice(0, 500)); process.exit(1); }
if (url.startsWith('data:')) {
  fs.writeFileSync(outPath, Buffer.from(url.split(',')[1], 'base64'));
} else {
  const img = await fetch(url, { signal: AbortSignal.timeout(120000) });
  fs.writeFileSync(outPath, Buffer.from(await img.arrayBuffer()));
}
console.log('wrote', outPath, Math.round(fs.statSync(outPath).size / 1024) + 'KB');
