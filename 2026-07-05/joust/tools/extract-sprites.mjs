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
const msg = readFileSync(join(SRC, 'MESSAGE.ASM'), 'latin1');
const att = readFileSync(join(SRC, 'ATT.ASM'), 'latin1');

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
const CLIFFS = [
  ['CSRC1L', 0x11, 0x07], ['CSRC1R', 0x18, 0x07],
  ['CSRC2', 0x2c, 0x09],
  ['CSRC3L', 0x20, 0x08], ['CSRC3U', 0x1d, 0x0b], ['CSRC3R', 0x18, 0x07],
  ['CSRC4', 0x20, 0x08],
  ['CSRC5', 0x5d, 0x02], ['CSRC5L', 0x08, 0x0d], ['CSRC5R', 0x08, 0x0d],
];
for (const [name, widthBytes, height] of CLIFFS) {
  const li = lines.findIndex(l => new RegExp('^' + name + '\\s*$').test(l) || new RegExp('^' + name + '\\s').test(l));
  if (li < 0) continue;
  const stream = [];
  for (let j = li + 1; j < lines.length && stream.length < widthBytes * height; j++) {
    const data = lines[j].match(/^\s+F([CD])B\s+(.+?)(?:;.*)?$/);
    if (!data) { if (/^\s*(;|\*|$)/.test(lines[j])) continue; break; }
    for (const token of data[2].split(',').map(s => s.trim()).filter(Boolean)) {
      const m = token.match(/\$([0-9A-Fa-f]{1,4})/); if (!m) continue;
      const value = parseInt(m[1], 16);
      if (data[1] === 'D') stream.push((value >> 8) & 0xff, value & 0xff);
      else stream.push(value & 0xff);
    }
  }
  const need = widthBytes * height;
  if (stream.length < need) throw new Error(`${name}: got ${stream.length} source bytes, need ${need}`);
  const rows = [];
  for (let y = 0; y < height; y++) rows.push(stream.slice(y * widthBytes, (y + 1) * widthBytes));
  decodeBlock([name], rows, widthBytes * 2, height);
}

// Cliff 5's full 186x33 rock lattice is stored as a compact bitstream rather than ordinary
// 4bpp rows. Port SYSTEM.ASM NEWCL5/UNCOM so the browser gets the exact lower island too.
{
  const start = lines.findIndex(l => /^_COMCL5\s+FCB/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^CL5LEN\s+EQU/.test(l));
  if (start < 0 || end < 0) throw new Error('Could not locate _COMCL5 compacted cliff');
  const packed = [];
  for (let i = start; i < end; i++) {
    for (const m of lines[i].matchAll(/%([01]{8})/g)) packed.push(parseInt(m[1], 2));
  }
  let bp = 0, bit = 0;
  const readBit = () => {
    if (bp >= packed.length) throw new Error('CSRC5FULL compact stream underrun');
    const out = (packed[bp] >> (7 - bit)) & 1;
    if (++bit === 8) { bit = 0; bp++; }
    return out;
  };
  const rest = n => { let v = 1; while (n-- > 0) v = (v << 1) | readBit(); return v; };
  const indexedRows = [[]];
  let y = 0, done = false;
  while (!done) {
    let n = 1;
    while (readBit() === 0) n++;
    const run = rest(n) - 2;
    const code = rest(3) & 7;
    if (run === 0) {
      if (code === 0) done = true;
      else { y++; indexedRows[y] = []; }
      continue;
    }
    const ci = code === 0 ? 0 : code + 7;
    for (let i = 0; i < run; i++) indexedRows[y].push(ci);
  }
  while (indexedRows.length && indexedRows[indexedRows.length - 1].length === 0) indexedRows.pop();
  const w = 186, h = indexedRows.length;
  if (h !== 33 || indexedRows.some(r => r.length > w)) {
    throw new Error(`CSRC5FULL decoded to ${Math.max(...indexedRows.map(r => r.length))}x${h}, expected 186x33`);
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let yy = 0; yy < h; yy++) for (let x = 0; x < indexedRows[yy].length; x++) {
    const ci = indexedRows[yy][x], o = (yy * w + x) * 4;
    if (!ci) continue;
    const c = PAL[ci]; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
  }
  sprites.CSRC5FULL = { w, h, rgba };
  console.log('decoded _COMCL5:', packed.length, 'bytes ->', `${w}x${h}`);
}

// The attract-mode JOUST wordmark is an 875-byte vector/fill command stream in ATT.ASM.
// Rasterize its original four-connected LINE/FILLDN operations into a tight sprite.
{
  const attLines = att.split(/\r?\n/);
  const start = attLines.findIndex(l => /^LIST\s+FCB/.test(l));
  const end = attLines.findIndex((l, i) => i > start && /^\s*FCC\s+'JOUST/.test(l));
  if (start < 0 || end < 0) throw new Error('Could not locate ATT.ASM LIST');
  const constants = { XPOS: 4, NOFILL: 0, FILL: 0x80, CL1: 0x11, CL2: 0x22, CL3: 0x33, CL4: 0x44 };
  const value = token => token.trim().split('+').reduce((sum, part) => {
    part = part.trim();
    if (part in constants) return sum + constants[part];
    if (/^\$[0-9A-Fa-f]+$/.test(part)) return sum + parseInt(part.slice(1), 16);
    if (/^@[0-7]+$/.test(part)) return sum + parseInt(part.slice(1), 8);
    if (/^\d+$/.test(part)) return sum + parseInt(part, 10);
    throw new Error('Unknown LIST token: ' + part);
  }, 0) & 0xff;
  const bytes = [];
  for (let i = start; i < end; i++) {
    const m = attLines[i].match(/^\s*(?:LIST\s+)?FCB\s+(.+?)(?:;.*)?$/); if (!m) continue;
    for (const token of m[1].split(',').filter(Boolean)) bytes.push(value(token));
  }
  if (bytes.length !== 875) throw new Error(`ATT LIST has ${bytes.length} bytes, expected 875`);

  const FW = 304, FH = 256, pix = new Uint8Array(FW * FH);
  const nibble = (byte, x) => x & 1 ? byte & 15 : byte >> 4;
  const put = (x, y, fillFlag, lineByte, fillByte) => {
    if (x < 0 || x >= FW || y < 0 || y >= FH) return;
    pix[y * FW + x] |= nibble(lineByte, x);
    if (!(fillFlag & 0x80)) return;
    for (let yy = y + 1; yy < FH; yy++) {
      const at = yy * FW + x;
      if (pix[at] !== 0) break;
      pix[at] = nibble(fillByte, x);
    }
  };
  const segment = (x, y, ex, ey, fillFlag, lineByte, fillByte) => {
    const dx = Math.abs(ex - x), dy = Math.abs(ey - y);
    const sx = ex > x ? 1 : -1, sy = ey > y ? 1 : -1;
    let error = dx, remaining = dx + dy;
    while (remaining > 0) {
      error -= dy + 1;
      while (true) {
        put(x, y, fillFlag, lineByte, fillByte);
        if (--remaining === 0) return;
        if (error >= 0) { x += sx; break; }
        y += sy; error += dx;
      }
    }
  };

  let ip = 0, offset = bytes[ip++], finished = false;
  while (!finished) {
    const fillFlag = bytes[ip++], lineByte = bytes[ip++], fillByte = bytes[ip++];
    let x = offset + bytes[ip++], y = bytes[ip++];
    while (true) {
      const localX = bytes[ip];
      if (localX !== 0) {
        const ex = offset + bytes[ip++], ey = bytes[ip++];
        segment(x, y, ex, ey, fillFlag, lineByte, fillByte); x = ex; y = ey;
        continue;
      }
      ip++;
      const continuation = bytes[ip++];
      if (continuation !== 0) break;
      const nextOffset = bytes[ip++];
      if (nextOffset === 0) finished = true;
      else offset = nextOffset;
      break;
    }
  }
  let minX = FW, minY = FH, maxX = -1, maxY = -1;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (pix[y * FW + x]) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (minX !== 14 || maxX !== 286 || minY !== 43 || maxY !== 128) {
    throw new Error(`TITLE_LOGO bounds ${minX}..${maxX},${minY}..${maxY}; expected 14..286,43..128`);
  }
  const marqueeBytes = [0x00, 0x00, 0x07, 0x3f, 0x05, 0xff, 0xe8, 0xe8];
  const marqueePal = marqueeBytes.map(c => {
    const r = c & 7, g = (c >> 3) & 7, b = (c >> 6) & 3;
    return [Math.round(r * 255 / 7), Math.round(g * 255 / 7), Math.round(b * 255 / 3)];
  });
  const w = maxX - minX + 1, h = maxY - minY + 1, rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ci = pix[(minY + y) * FW + minX + x], o = (y * w + x) * 4;
    if (!ci) continue;
    const c = marqueePal[ci] || [255, 0, 255];
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
  }
  sprites.TITLE_LOGO = { w, h, rgba };
  console.log('rasterized ATT LIST:', bytes.length, 'bytes ->', `${w}x${h}`);
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
const KEY = Object.keys(sprites).filter(n => /^(ORUN|OFLY|ORUNS|SRUN|SFLY|BRUN|BFLY|B2RUN|B2FLY|PLY|PT[123]|EGG|GRAB|FLAME|FL[123]|ASH|CSRC|CCLF)/i.test(n));
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

// Emit the original Williams variable-width 5x7 message font from MESSAGE.ASM.
const fontLines = msg.split(/\r?\n/);
const glyphLabels = {
  ' ': 'LSPC', '<': 'LBARW', '=': 'LEQU', '-': 'LDSH', '?': 'LQUE', '!': 'LEXC',
  '(': 'LBRKL', ')': 'LBRKR', "'": 'LSQOT', ',': 'LCMMA', '.': 'LPER', '/': 'LSLSH',
  '&': 'LAMP', '"': 'LDQOT', ':': 'LCOLON', '_': 'LCUR', '^': 'LCNARW',
};
for (let n = 0; n <= 9; n++) glyphLabels[String(n)] = 'L' + n;
for (let c = 65; c <= 90; c++) glyphLabels[String.fromCharCode(c)] = 'L' + String.fromCharCode(c);
const font = {};
for (const [ch, label] of Object.entries(glyphLabels)) {
  const at = fontLines.findIndex(l => new RegExp('^' + label + '\\s+FCB\\s+\\$').test(l));
  if (at < 0) throw new Error('Missing font glyph ' + label);
  const head = [...fontLines[at].matchAll(/\$([0-9A-Fa-f]{1,2})/g)].map(m => parseInt(m[1], 16));
  const widthBytes = head[0], h = head[1], rows = [];
  for (let i = at + 1; rows.length < h && i < fontLines.length; i++) {
    const m = fontLines[i].match(/^\s+FCB\s+(.+?)(?:;.*)?$/); if (!m) break;
    const bytes = [...m[1].matchAll(/\$([0-9A-Fa-f]{1,2})/g)].map(v => parseInt(v[1], 16));
    if (bytes.length < widthBytes) throw new Error(`${label}: short font row`);
    let row = '';
    for (const b of bytes.slice(0, widthBytes)) row += ((b >> 4) ? '1' : '0') + ((b & 15) ? '1' : '0');
    rows.push(row);
  }
  if (rows.length !== h) throw new Error(`${label}: got ${rows.length} rows, expected ${h}`);
  font[ch] = { w: widthBytes * 2, h, rows };
}
// The ROM only stores a left arrow. Mirroring it gives the matching right-side menu marker.
font['>'] = { w: font['<'].w, h: font['<'].h, rows: font['<'].rows.map(r => [...r].reverse().join('')) };
writeFileSync(join(root, 'assets/font.js'),
  '// AUTO-GENERATED from MESSAGE.ASM FONT57 — do not hand-edit.\n' +
  "'use strict';window.JOUST_FONT=" + JSON.stringify(font) + ';\n');
console.log('wrote assets/font.js:', Object.keys(font).length, 'glyphs');
