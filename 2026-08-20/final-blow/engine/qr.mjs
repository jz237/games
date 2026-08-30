// R2.1 STREETS wave 19 — self-contained byte-mode QR encoder (no CDN, no
// fetches). Implements ISO/IEC 18004 versions 1–10 at error-correction levels
// L and M: Reed-Solomon over GF(256), full mask evaluation with the four
// penalty rules, format/version BCH info, and a matrix reader used by the
// tests and probes to prove a rendered code decodes back to its input.
// Pure data logic: no DOM, no Date.now, no rng. game.js owns the canvas paint.

// --------------------------------------------------------------------------
// GF(256) arithmetic (polynomial 0x11d, generator 2).
// --------------------------------------------------------------------------

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let value = 1;
  for (let power = 0; power < 255; power += 1) {
    GF_EXP[power] = value;
    GF_LOG[value] = power;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let power = 255; power < 512; power += 1) GF_EXP[power] = GF_EXP[power - 255];
}

function gfMultiply(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

// Reed-Solomon generator polynomial for `degree` EC codewords.
function rsGenerator(degree) {
  let poly = [1];
  for (let root = 0; root < degree; root += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let index = 0; index < poly.length; index += 1) {
      next[index] ^= gfMultiply(poly[index], GF_EXP[root]);
      next[index + 1] ^= poly[index];
    }
    poly = next;
  }
  return poly.reverse(); // constant-last order for the long division below
}

export function rsEncode(data, degree) {
  const generator = rsGenerator(degree); // descending powers, monic
  const buffer = [...data, ...new Array(degree).fill(0)];
  for (let index = 0; index < data.length; index += 1) {
    const factor = buffer[index];
    if (factor === 0) continue;
    for (let term = 1; term < generator.length; term += 1) {
      buffer[index + term] ^= gfMultiply(generator[term], factor);
    }
  }
  return buffer.slice(data.length);
}

// Syndrome check for a full codeword (data + ec). All-zero syndromes mean the
// block is a valid RS codeword — the reader uses this to prove integrity.
export function rsSyndromesZero(codeword, degree) {
  for (let power = 0; power < degree; power += 1) {
    let value = 0;
    for (const byte of codeword) value = gfMultiply(value, GF_EXP[power]) ^ byte;
    if (value !== 0) return false;
  }
  return true;
}

// --------------------------------------------------------------------------
// Version tables (1–10, levels L and M). blocks: [ecPerBlock, [dataSizes...]].
// --------------------------------------------------------------------------

const QR_BLOCKS = {
  l: [
    null,
    [7, [19]], [10, [34]], [15, [55]], [20, [80]], [26, [108]],
    [18, [68, 68]], [20, [78, 78]], [24, [97, 97]], [30, [116, 116]],
    [18, [68, 68, 69, 69]],
  ],
  m: [
    null,
    [10, [16]], [16, [28]], [26, [44]], [18, [32, 32]], [24, [43, 43]],
    [16, [27, 27, 27, 27]], [18, [31, 31, 31, 31]], [22, [38, 38, 39, 39]],
    [22, [36, 36, 36, 37, 37]], [26, [43, 43, 43, 43, 44]],
  ],
};

const ALIGNMENT_CENTERS = [
  null,
  [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

const EC_LEVEL_BITS = { l: 0b01, m: 0b00 };
const EC_LEVELS_BY_BITS = { 0b01: "l", 0b00: "m" };
export const QR_MAX_VERSION = 10;

export function qrDataCapacity(version, level = "m") {
  const table = QR_BLOCKS[level]?.[version];
  if (!table) return 0;
  const dataCodewords = table[1].reduce((total, size) => total + size, 0);
  return dataCodewords - 2; // byte mode: 4-bit mode + 8-bit count + terminator
}

export function qrMinimumVersion(byteLength, level = "m") {
  for (let version = 1; version <= QR_MAX_VERSION; version += 1) {
    if (qrDataCapacity(version, level) >= byteLength) return version;
  }
  return -1;
}

// --------------------------------------------------------------------------
// BCH format / version information.
// --------------------------------------------------------------------------

function bchRemainder(value, generator, generatorDegree, dataDegree) {
  let remainder = value << generatorDegree;
  for (let bit = dataDegree + generatorDegree - 1; bit >= generatorDegree; bit -= 1) {
    if (remainder & (1 << bit)) remainder ^= generator << (bit - generatorDegree);
  }
  return remainder;
}

export function encodeFormatInfo(level, mask) {
  const data = (EC_LEVEL_BITS[level] << 3) | (mask & 7);
  return ((data << 10) | bchRemainder(data, 0b10100110111, 10, 5)) ^ 0b101010000010010;
}

export function encodeVersionInfo(version) {
  return (version << 12) | bchRemainder(version, 0b1111100100101, 12, 6);
}

// --------------------------------------------------------------------------
// Matrix scaffolding shared by the writer and the reader. A cell is true
// (dark), false (light) or null (unwritten data region while building).
// --------------------------------------------------------------------------

function matrixSize(version) {
  return 17 + version * 4;
}

function placeFinder(modules, row, col) {
  const size = modules.length;
  for (let r = -1; r <= 7; r += 1) {
    if (row + r < 0 || row + r >= size) continue;
    for (let c = -1; c <= 7; c += 1) {
      if (col + c < 0 || col + c >= size) continue;
      modules[row + r][col + c] = (r >= 0 && r <= 6 && (c === 0 || c === 6))
        || (c >= 0 && c <= 6 && (r === 0 || r === 6))
        || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
    }
  }
}

function placeFunctionPatterns(modules, version) {
  const size = modules.length;
  placeFinder(modules, 0, 0);
  placeFinder(modules, size - 7, 0);
  placeFinder(modules, 0, size - 7);
  for (const centerRow of ALIGNMENT_CENTERS[version]) {
    for (const centerCol of ALIGNMENT_CENTERS[version]) {
      if (modules[centerRow][centerCol] !== null) continue; // overlaps a finder
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          modules[centerRow + r][centerCol + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
        }
      }
    }
  }
  for (let index = 8; index < size - 8; index += 1) {
    if (modules[index][6] === null) modules[index][6] = index % 2 === 0;
    if (modules[6][index] === null) modules[6][index] = index % 2 === 0;
  }
}

// Format info occupies fixed cells; version info (v7+) two 6x3 blocks. Both
// the writer and reader need the exact same cell lists.
function writeFormatInfo(modules, bits) {
  const size = modules.length;
  for (let index = 0; index < 15; index += 1) {
    const dark = ((bits >> index) & 1) === 1;
    if (index < 6) modules[index][8] = dark;
    else if (index < 8) modules[index + 1][8] = dark;
    else modules[size - 15 + index][8] = dark;
    if (index < 8) modules[8][size - index - 1] = dark;
    else if (index < 9) modules[8][7] = dark;
    else modules[8][14 - index] = dark;
  }
  modules[size - 8][8] = true; // the always-dark module
}

function readFormatInfo(modules) {
  let bits = 0;
  for (let index = 0; index < 15; index += 1) {
    const row = index < 6 ? index : index < 8 ? index + 1 : modules.length - 15 + index;
    if (modules[row][8]) bits |= 1 << index;
  }
  return bits;
}

function writeVersionInfo(modules, version) {
  if (version < 7) return;
  const size = modules.length;
  const bits = encodeVersionInfo(version);
  for (let index = 0; index < 18; index += 1) {
    const dark = ((bits >> index) & 1) === 1;
    modules[Math.floor(index / 3)][(index % 3) + size - 11] = dark;
    modules[(index % 3) + size - 11][Math.floor(index / 3)] = dark;
  }
}

// Rebuild the "is this a function module" map for a version — every non-data
// cell the writer reserved above, including format/version areas.
function functionModuleMap(version) {
  const size = matrixSize(version);
  const modules = Array.from({ length: size }, () => new Array(size).fill(null));
  placeFunctionPatterns(modules, version);
  writeFormatInfo(modules, 0);
  writeVersionInfo(modules, version);
  return modules.map((row) => row.map((cell) => cell !== null));
}

function maskBit(mask, row, col) {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

// The zig-zag data walk, shared verbatim between writer and reader: calls
// visit(row, col) for every data cell in placement order.
function walkDataModules(isFunction, visit) {
  const size = isFunction.length;
  let direction = -1;
  let row = size - 1;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (;;) {
      for (let offset = 0; offset < 2; offset += 1) {
        if (!isFunction[row][col - offset]) visit(row, col - offset);
      }
      row += direction;
      if (row < 0 || row >= size) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }
}

// --------------------------------------------------------------------------
// The four mask penalty rules (N1 runs, N2 blocks, N3 finder-alikes, N4 dark
// balance) — lowest total wins.
// --------------------------------------------------------------------------

function maskPenalty(modules) {
  const size = modules.length;
  let penalty = 0;
  const runPenalty = (readCell) => {
    for (let major = 0; major < size; major += 1) {
      let run = 1;
      for (let minor = 1; minor < size; minor += 1) {
        if (readCell(major, minor) === readCell(major, minor - 1)) {
          run += 1;
          if (minor === size - 1 && run >= 5) penalty += run - 2;
        } else {
          if (run >= 5) penalty += run - 2;
          run = 1;
        }
      }
    }
  };
  runPenalty((major, minor) => modules[major][minor]);
  runPenalty((major, minor) => modules[minor][major]);
  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const cell = modules[row][col];
      if (cell === modules[row][col + 1] && cell === modules[row + 1][col] && cell === modules[row + 1][col + 1]) {
        penalty += 3;
      }
    }
  }
  const finderPattern = [true, false, true, true, true, false, true, false, false, false, false];
  const matchesAt = (readCell, major, start, reversed) => {
    for (let index = 0; index < 11; index += 1) {
      const expected = finderPattern[reversed ? 10 - index : index];
      if (readCell(major, start + index) !== expected) return false;
    }
    return true;
  };
  for (const readCell of [(major, minor) => modules[major][minor], (major, minor) => modules[minor][major]]) {
    for (let major = 0; major < size; major += 1) {
      for (let start = 0; start <= size - 11; start += 1) {
        if (matchesAt(readCell, major, start, false) || matchesAt(readCell, major, start, true)) penalty += 40;
      }
    }
  }
  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark += 1;
  penalty += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return penalty;
}

// --------------------------------------------------------------------------
// Encoder.
// --------------------------------------------------------------------------

function buildCodewords(bytes, version, level) {
  const [ecPerBlock, blockSizes] = QR_BLOCKS[level][version];
  const totalData = blockSizes.reduce((total, size) => total + size, 0);
  const bits = [];
  const pushBits = (value, count) => {
    for (let bit = count - 1; bit >= 0; bit -= 1) bits.push((value >> bit) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const byte of bytes) pushBits(byte, 8);
  const terminator = Math.min(4, totalData * 8 - bits.length);
  pushBits(0, terminator);
  while (bits.length % 8 !== 0) bits.push(0);
  const data = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[index + bit];
    data.push(byte);
  }
  const padBytes = [0xec, 0x11];
  for (let pad = 0; data.length < totalData; pad += 1) data.push(padBytes[pad % 2]);

  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (const size of blockSizes) {
    const block = data.slice(offset, offset + size);
    offset += size;
    dataBlocks.push(block);
    ecBlocks.push(rsEncode(block, ecPerBlock));
  }
  const interleaved = [];
  const longestData = Math.max(...blockSizes);
  for (let index = 0; index < longestData; index += 1) {
    for (const block of dataBlocks) if (index < block.length) interleaved.push(block[index]);
  }
  for (let index = 0; index < ecPerBlock; index += 1) {
    for (const block of ecBlocks) interleaved.push(block[index]);
  }
  return interleaved;
}

/**
 * Encode text (UTF-8, byte mode) into a QR module matrix.
 * Returns { version, size, level, mask, modules } where modules is a
 * size×size array of booleans (true = dark). Throws when the payload cannot
 * fit version 10 at the requested level.
 */
export function encodeQr(text, { level = "m" } = {}) {
  if (!QR_BLOCKS[level]) throw new Error(`Unknown QR error-correction level: ${level}`);
  const bytes = new TextEncoder().encode(String(text));
  const version = qrMinimumVersion(bytes.length, level);
  if (version < 0) throw new Error(`QR payload too long (${bytes.length} bytes) for version ${QR_MAX_VERSION}-${level.toUpperCase()}.`);
  const size = matrixSize(version);
  const codewords = buildCodewords(bytes, version, level);
  const isFunction = functionModuleMap(version);

  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const modules = Array.from({ length: size }, () => new Array(size).fill(null));
    placeFunctionPatterns(modules, version);
    writeVersionInfo(modules, version);
    writeFormatInfo(modules, encodeFormatInfo(level, mask));
    let bitIndex = 0;
    walkDataModules(isFunction, (row, col) => {
      const byte = codewords[bitIndex >> 3] ?? 0;
      let dark = ((byte >> (7 - (bitIndex & 7))) & 1) === 1;
      if (maskBit(mask, row, col)) dark = !dark;
      modules[row][col] = dark;
      bitIndex += 1;
    });
    for (const row of modules) {
      for (let col = 0; col < size; col += 1) if (row[col] === null) row[col] = false;
    }
    const penalty = maskPenalty(modules);
    if (!best || penalty < best.penalty) best = { mask, penalty, modules };
  }
  return { version, size, level, mask: best.mask, modules: best.modules };
}

// --------------------------------------------------------------------------
// Reader — decodes matrices produced by encodeQr (clean, unrotated modules).
// Used by unit tests and browser probes to prove a painted code carries the
// exact invite URL, with RS syndromes verifying every block.
// --------------------------------------------------------------------------

export function decodeQr(modules) {
  if (!Array.isArray(modules) || !modules.length || modules.length !== modules[0].length) {
    throw new Error("QR decode expects a square module matrix.");
  }
  const size = modules.length;
  const version = (size - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > QR_MAX_VERSION) {
    throw new Error(`Unsupported QR matrix size: ${size}`);
  }
  const format = readFormatInfo(modules) ^ 0b101010000010010;
  const level = EC_LEVELS_BY_BITS[(format >> 13) & 0b11];
  const mask = (format >> 10) & 0b111;
  if (!level) throw new Error("QR format info names an unsupported EC level.");
  const [ecPerBlock, blockSizes] = QR_BLOCKS[level][version];
  const isFunction = functionModuleMap(version);
  const bits = [];
  walkDataModules(isFunction, (row, col) => {
    let dark = Boolean(modules[row][col]);
    if (maskBit(mask, row, col)) dark = !dark;
    bits.push(dark ? 1 : 0);
  });
  const codewords = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[index + bit];
    codewords.push(byte);
  }
  // De-interleave into blocks and verify each one.
  const totalData = blockSizes.reduce((total, blockSize) => total + blockSize, 0);
  const dataBlocks = blockSizes.map(() => []);
  const ecBlocksList = blockSizes.map(() => []);
  const longestData = Math.max(...blockSizes);
  let cursor = 0;
  for (let index = 0; index < longestData; index += 1) {
    for (let block = 0; block < blockSizes.length; block += 1) {
      if (index < blockSizes[block]) dataBlocks[block].push(codewords[cursor++]);
    }
  }
  for (let index = 0; index < ecPerBlock; index += 1) {
    for (let block = 0; block < blockSizes.length; block += 1) {
      ecBlocksList[block].push(codewords[cursor++]);
    }
  }
  for (let block = 0; block < blockSizes.length; block += 1) {
    if (!rsSyndromesZero([...dataBlocks[block], ...ecBlocksList[block]], ecPerBlock)) {
      throw new Error(`QR block ${block} failed its Reed-Solomon check.`);
    }
  }
  const data = dataBlocks.flat();
  if (data.length !== totalData) throw new Error("QR data stream is short.");
  // Parse the byte-mode segment.
  const readBits = (bitOffset, count) => {
    let value = 0;
    for (let bit = 0; bit < count; bit += 1) {
      const byte = data[(bitOffset + bit) >> 3];
      value = (value << 1) | ((byte >> (7 - ((bitOffset + bit) & 7))) & 1);
    }
    return value;
  };
  if (readBits(0, 4) !== 0b0100) throw new Error("QR payload is not byte mode.");
  const length = readBits(4, 8);
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = readBits(12 + index * 8, 8);
  return { text: new TextDecoder().decode(bytes), version, level, mask };
}
