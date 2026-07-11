#!/usr/bin/env node
// Extract the ORIGINAL Joust sprite bitmaps from the rebuilt 6809 source (JOUSTI.ASM) and
// decode them 4bpp→RGBA with the ROM palette (SYSTEM.ASM COLOR1). Emits:
//   assets/sprites.js  — { name: {w,h,rgba:<base64>} } for the renderer
//   tools/sprite-sheet.png — labeled contact sheet for visual verification
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'notes/joust-src');
const asm = readFileSync(join(SRC, 'JOUSTI.ASM'), 'latin1');
const sys = readFileSync(join(SRC, 'SYSTEM.ASM'), 'latin1');

// ── palette: 16 octal bytes at COLOR1 (SYSTEM.ASM) ── Williams byte = %BB GGG RRR
const octs = [];
{
  const lines = sys.split(/\r?\n/);
  let i = lines.findIndex(l => /^COLOR1\s+FCB/.test(l));
  for (let n = 0; n < 16 && i < lines.length; i++) {
    const m = lines[i].match(/FCB\s+@([0-7]{1,3})/);
    if (m) { octs.push(parseInt(m[1], 8)); n++; }
  }
}
const PAL = octs.map(c => {
  const r = (c & 7), g = (c >> 3) & 7, b = (c >> 6) & 3;
  return [Math.round(r * 255 / 7), Math.round(g * 255 / 7), Math.round(b * 255 / 3)];
});
console.log('palette bytes:', octs.map(o => o.toString(16).padStart(2, '0')).join(' '));
console.log('palette rgb  :', PAL.map(p => p.join(',')).join(' | '));

// ── extract every image block: (one or more labels) then `FDB $WWHH!DMAFIX` then FCB rows ──
const lines = asm.split(/\r?\n/);
const sprites = {};
for (let i = 0; i < lines.length; i++) {
  const hdr = lines[i].match(/^(\w+)\s+FDB\s+\$([0-9A-Fa-f]{4})!DMAFIX/);
  if (!hdr) continue;
  // collect stacked labels immediately above (bare `LABEL` lines)
  const labels = [hdr[1]];
  for (let k = i - 1; k >= 0; k--) {
    const bare = lines[k].match(/^(\w+)\s*$/);
    if (bare) { labels.unshift(bare[1]); } else break;
  }
  // read FCB rows
  const rows = [];
  for (let j = i + 1; j < lines.length; j++) {
    const fcb = lines[j].match(/^\s+FCB\s+(.+?)(?:;.*)?$/);
    if (!fcb) break;
    const bytes = fcb[1].split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const m = s.match(/\$([0-9A-Fa-f]{1,2})/); return m ? parseInt(m[1], 16) : 0;
    });
    rows.push(bytes);
  }
  if (!rows.length) continue;
  const w = rows[0].length * 2, h = rows.length;
  decodeBlock(labels, rows, w, h);
}

// ── also extract the cliff/platform bitmaps (bare label + FCB rows; dims from byte count) ──
const CLIFFS = ['CSRC1L', 'CSRC1R', 'CSRC2', 'CSRC3L', 'CSRC3U', 'CSRC3R', 'CSRC4', 'CSRC5', 'CSRC5L', 'CSRC5R'];
for (const name of CLIFFS) {
  const li = lines.findIndex(l => new RegExp('^' + name + '\\s*$').test(l) || new RegExp('^' + name + '\\s').test(l));
  if (li < 0) continue;
  const rows = [];
  for (let j = li + 1; j < lines.length; j++) {
    const fcb = lines[j].match(/^\s+FCB\s+(.+?)(?:;.*)?$/);
    if (!fcb) { if (/^\s*(;|\*|$)/.test(lines[j])) continue; break; }
    const bytes = fcb[1].split(',').map(s => s.trim()).filter(Boolean).map(s => { const m = s.match(/\$([0-9A-Fa-f]{1,2})/); return m ? parseInt(m[1], 16) : 0; });
    if (bytes.length) rows.push(bytes);
  }
  if (rows.length) { const wc = Math.max(...rows.map(r => r.length)); rows.forEach(r => { while (r.length < wc) r.push(0); }); decodeBlock([name], rows, wc * 2, rows.length); }
}

function decodeBlock(labels, rows, w, h) {
  // decode 4bpp → RGBA
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let bx = 0; bx < row.length; bx++) {
      const byte = row[bx] || 0;
      for (let p = 0; p < 2; p++) {
        const ci = p === 0 ? (byte >> 4) : (byte & 15);
        const x = bx * 2 + p;
        const o = (y * w + x) * 4;
        if (ci === 0) { rgba[o + 3] = 0; }
        else { const c = PAL[ci] || [255, 0, 255]; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255; }
      }
    }
  }
  for (const L of labels) sprites[L] = { w, h, rgba };
}
console.log('extracted image labels:', Object.keys(sprites).length);

// ── minimal PNG encoder ──
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type, data) { const t = Buffer.from(type, 'latin1'); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const cd = Buffer.concat([t, data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cd)); return Buffer.concat([len, cd, crc]); }
function pngEncode(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ── contact sheet (scale each sprite, grid, magenta gaps) ──
const KEY = Object.keys(sprites).filter(n => /^(ORUN|OFLY|ORUNS|SRUN|SFLY|BRUN|BFLY|B2RUN|B2FLY|PT[123]|EGG|GRAB|FLAME|FL[123]|ASH|CSRC|CCLF)/i.test(n));
const names = KEY.length ? KEY : Object.keys(sprites);
const SCALE = 3, COLS = 10, CELL = 60;
const rowsN = Math.ceil(names.length / COLS);
const CW = COLS * CELL, CH = rowsN * CELL;
const sheet = Buffer.alloc(CW * CH * 4);
for (let i = 0; i < sheet.length; i += 4) { sheet[i] = 40; sheet[i + 1] = 40; sheet[i + 2] = 48; sheet[i + 3] = 255; }
names.forEach((nm, idx) => {
  const s = sprites[nm]; const cx = (idx % COLS) * CELL + 3, cy = ((idx / COLS) | 0) * CELL + 3;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const so = (y * s.w + x) * 4; if (!s.rgba[so + 3]) continue;
    for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) {
      const px = cx + x * SCALE + sx, py = cy + y * SCALE + sy;
      if (px >= CW || py >= CH) continue;
      const o = (py * CW + px) * 4; sheet[o] = s.rgba[so]; sheet[o + 1] = s.rgba[so + 1]; sheet[o + 2] = s.rgba[so + 2]; sheet[o + 3] = 255;
    }
  }
});
writeFileSync(join(root, 'tools/sprite-sheet.png'), pngEncode(CW, CH, sheet));
console.log('contact sheet:', names.length, 'sprites →', CW + 'x' + CH);
console.log('grid order (10 cols):');
names.forEach((n, i) => process.stdout.write((i % COLS === 0 ? '\n' : '') + `${String(i).padStart(3)}:${n}(${sprites[n].w}x${sprites[n].h}) `));
console.log('');

// ── emit sprites.js (base64 rgba) ──
const out = {};
for (const [nm, s] of Object.entries(sprites)) out[nm] = { w: s.w, h: s.h, d: s.rgba.toString('base64') };
writeFileSync(join(root, 'retro/assets/sprites.js'),
  '// AUTO-GENERATED from the original Joust ROM sprite data (JOUSTI.ASM) — do not hand-edit.\n' +
  "'use strict';(function(){var S=" + JSON.stringify(out) + ';\n' +
  'if(typeof module!=="undefined"&&module.exports)module.exports=S;if(typeof window!=="undefined")window.JOUST_SPRITES=S;})();\n');
console.log('wrote retro/assets/sprites.js');
