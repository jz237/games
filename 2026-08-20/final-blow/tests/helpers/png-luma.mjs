// Mean luminance of a CDP screenshot, with no dependencies.
//
// 5.3 VERIFICATION HARNESS (sweep #54): the CINEMA 3D probe has to prove the
// world actually PAINTED, and a WebGL canvas cannot be read back from the
// page (no preserveDrawingBuffer, and drawImage of a WebGL canvas into a 2D
// one is only valid inside the same compositing frame). Page.captureScreenshot
// is the only honest read, so the PNG is decoded here: IHDR + concatenated
// IDAT, inflate, unfilter, Rec.709 luma. Chrome's screenshots are 8-bit
// truecolour with or without alpha, which is the only case this handles — it
// throws on anything else rather than reporting a wrong number.
import { inflateSync } from "node:zlib";

const LIT_THRESHOLD = 24;

export function pngMeanLuma(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNG is not supported");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += length + 12;
  }
  if (depth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG (bit depth ${depth}, colour type ${colorType})`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const line = raw.subarray(cursor, cursor + stride);
    cursor += stride;
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prior ? prior[x] : 0;
      const upLeft = prior && x >= channels ? prior[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const dLeft = Math.abs(estimate - left);
        const dUp = Math.abs(estimate - up);
        const dUpLeft = Math.abs(estimate - upLeft);
        value += dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
      } else if (filter !== 0) throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      row[x] = value & 255;
    }
  }
  let sum = 0;
  let lit = 0;
  const total = width * height;
  for (let index = 0; index < total; index += 1) {
    const offsetPixel = index * channels;
    const luma = 0.2126 * pixels[offsetPixel] + 0.7152 * pixels[offsetPixel + 1] + 0.0722 * pixels[offsetPixel + 2];
    sum += luma;
    if (luma > LIT_THRESHOLD) lit += 1;
  }
  return {
    width,
    height,
    mean: Number((sum / total).toFixed(3)),
    litFraction: Number((lit / total).toFixed(4)),
  };
}
