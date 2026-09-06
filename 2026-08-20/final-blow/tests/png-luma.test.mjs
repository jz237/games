import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { pngMeanLuma } from "./helpers/png-luma.mjs";

// 5.3 VERIFICATION HARNESS (sweep #54). The CINEMA 3D probe proves the world
// painted by measuring the screenshot: a WebGL canvas cannot be read back from
// the page, so Page.captureScreenshot is the only honest read and the PNG has
// to be decoded here. A wrong decoder would turn "the 3D world is black" into a
// green test, which is the exact failure the probe exists to catch — so the
// decoder is pinned against PNGs built here byte by byte, one per filter type.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Build an 8-bit PNG from `pixels(x, y) -> [r, g, b(, a)]`, one filter type. */
function makePng(width, height, pixels, { alpha = false, filter = 0 } = {}) {
  const channels = alpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < width; x += 1) {
      const value = pixels(x, y);
      for (let channel = 0; channel < channels; channel += 1) row[x * channels + channel] = value[channel] ?? 255;
    }
    rows.push(row);
  }
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = filter;
    const row = rows[y];
    const prior = y > 0 ? rows[y - 1] : Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prior[x];
      const upLeft = x >= channels ? prior[x - channels] : 0;
      let encoded = row[x];
      if (filter === 1) encoded -= left;
      else if (filter === 2) encoded -= up;
      else if (filter === 3) encoded -= (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const dLeft = Math.abs(estimate - left);
        const dUp = Math.abs(estimate - up);
        const dUpLeft = Math.abs(estimate - upLeft);
        encoded -= dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
      }
      raw[y * (stride + 1) + 1 + x] = encoded & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("a black frame reads as black — the failure the CINEMA 3D probe is for", () => {
  const reading = pngMeanLuma(makePng(32, 24, () => [0, 0, 0]));
  assert.deepEqual(reading, { width: 32, height: 24, mean: 0, litFraction: 0 });
});

test("a white frame reads as full brightness", () => {
  const reading = pngMeanLuma(makePng(16, 16, () => [255, 255, 255]));
  assert.equal(reading.mean, 255);
  assert.equal(reading.litFraction, 1);
});

test("luma is Rec.709, not a channel average", () => {
  // Pure green is the channel the eye weights most; a naive mean would say 85.
  assert.equal(pngMeanLuma(makePng(8, 8, () => [0, 255, 0])).mean, 182.376);
  assert.equal(pngMeanLuma(makePng(8, 8, () => [255, 0, 0])).mean, 54.213);
  assert.equal(pngMeanLuma(makePng(8, 8, () => [0, 0, 255])).mean, 18.411);
});

test("litFraction counts the pixels carrying image, not the mean", () => {
  // A quarter-lit frame: a bright quadrant on black is exactly the "mostly
  // black world with one lit sprite" case a mean alone would let through.
  const reading = pngMeanLuma(makePng(20, 20, (x, y) => (x < 10 && y < 10 ? [200, 200, 200] : [0, 0, 0])));
  assert.equal(reading.litFraction, 0.25);
  assert.equal(reading.mean, 50);
});

test("every PNG filter type decodes to the same picture", () => {
  const picture = (x, y) => [(x * 11) & 255, (y * 7) & 255, (x * y) & 255];
  const expected = pngMeanLuma(makePng(24, 18, picture, { filter: 0 }));
  for (const filter of [1, 2, 3, 4]) {
    assert.deepEqual(pngMeanLuma(makePng(24, 18, picture, { filter })), expected, `filter ${filter} must unfilter to the same image`);
  }
});

test("truecolour with and without alpha read the same, and alpha is ignored", () => {
  const picture = (x, y) => [(x * 9) & 255, (y * 13) & 255, 40, 128];
  const rgb = pngMeanLuma(makePng(12, 12, picture, { alpha: false, filter: 4 }));
  const rgba = pngMeanLuma(makePng(12, 12, picture, { alpha: true, filter: 4 }));
  assert.deepEqual(rgba, rgb);
});

test("an unsupported PNG throws instead of reporting a wrong number", () => {
  const greyscale = makePng(4, 4, () => [1, 2, 3]);
  greyscale[25] = 0; // IHDR colour type -> greyscale
  assert.throws(() => pngMeanLuma(greyscale), /unsupported PNG/);
});
