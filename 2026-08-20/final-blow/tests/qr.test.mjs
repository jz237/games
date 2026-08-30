import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeQr,
  encodeFormatInfo,
  encodeQr,
  encodeVersionInfo,
  qrDataCapacity,
  qrMinimumVersion,
  rsEncode,
  rsSyndromesZero,
} from "../engine/qr.mjs";

// The canonical ISO 18004 worked example: "HELLO WORLD" at 1-M produces these
// 16 data codewords and exactly these 10 Reed-Solomon codewords.
test("Reed-Solomon matches the specification's 1-M worked example", () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  const expected = [196, 35, 39, 119, 235, 215, 231, 226, 93, 23];
  const ec = rsEncode(data, 10);
  assert.deepEqual(ec, expected);
  assert.equal(rsSyndromesZero([...data, ...ec], 10), true);
  // A corrupted codeword must fail the syndrome check.
  const corrupt = [...data, ...ec];
  corrupt[3] ^= 0x40;
  assert.equal(rsSyndromesZero(corrupt, 10), false);
});

test("format and version info match the specification's known constants", () => {
  // (ECC M, mask 0): data bits 00000 -> BCH remainder 0 -> only the XOR mask.
  assert.equal(encodeFormatInfo("m", 0), 0b101010000010010);
  // Published version-information strings for versions 7 and 8.
  assert.equal(encodeVersionInfo(7), 0x07c94);
  assert.equal(encodeVersionInfo(8), 0x085bc);
});

test("byte-mode capacities and version picking cover the invite URL sizes", () => {
  assert.equal(qrDataCapacity(1, "m"), 14);
  assert.equal(qrDataCapacity(5, "m"), 84);
  assert.equal(qrDataCapacity(8, "m"), 152);
  assert.equal(qrDataCapacity(6, "l"), 134);
  assert.equal(qrMinimumVersion(110, "m"), 7);
  assert.equal(qrMinimumVersion(300, "m"), -1);
});

test("a realistic invite URL round-trips through encode and decode", () => {
  const invite = "https://jz237.github.io/games/2026-08-20/final-blow/#online=join&room="
    + "Ab3dEf6hIj9kLm1nOp4qRs"
    + "&key=Tu7vWx0yZa2bCd5eFg8hJk1lMn4oPq7rSt0uVw3xYz6"; // 43-char token
  const code = encodeQr(invite);
  assert.equal(code.size, 17 + code.version * 4);
  assert.ok(code.version >= 2 && code.version <= 10);
  // Structural sanity: all three finder centers are dark, timing alternates.
  assert.equal(code.modules[3][3], true);
  assert.equal(code.modules[3][code.size - 4], true);
  assert.equal(code.modules[code.size - 4][3], true);
  for (let index = 8; index < code.size - 8; index += 1) {
    assert.equal(code.modules[6][index], index % 2 === 0, `timing row at ${index}`);
  }
  const decoded = decodeQr(code.modules);
  assert.equal(decoded.text, invite);
  assert.equal(decoded.version, code.version);
  assert.equal(decoded.mask, code.mask);
});

test("short and long payloads round-trip at both supported EC levels", () => {
  for (const level of ["l", "m"]) {
    for (const text of ["FIGHT", "x".repeat(100), "https://example.test/#a=1&b=2&c=" + "Q".repeat(80)]) {
      const code = encodeQr(text, { level });
      const decoded = decodeQr(code.modules);
      assert.equal(decoded.text, text, `${level} / ${text.length} chars`);
      assert.equal(decoded.level, level);
    }
  }
});

test("a flipped data module breaks the Reed-Solomon verification", () => {
  const code = encodeQr("TAMPER CHECK PAYLOAD");
  // Flip one module in the data region (bottom-right corner is data).
  const tampered = code.modules.map((row) => [...row]);
  tampered[code.size - 1][code.size - 1] = !tampered[code.size - 1][code.size - 1];
  assert.throws(() => decodeQr(tampered), /Reed-Solomon/u);
});

test("oversized payloads refuse instead of truncating", () => {
  assert.throws(() => encodeQr("z".repeat(400)), /too long/u);
});
