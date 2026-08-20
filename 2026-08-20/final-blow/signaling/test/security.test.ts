import { describe, expect, it } from "vitest";
import {
  AUTH_PROTOCOL_PREFIX,
  MAX_SIGNAL_BYTES,
  SOCKET_PROTOCOL,
  hexToBytes,
  isAllowedOrigin,
  isRoomId,
  parseSignalMessage,
  parseSocketProtocols,
  randomBase64Url,
  sha256,
  timingSafeHashEqual,
} from "../src/security";

describe("signaling security primitives", () => {
  it("creates correctly sized cryptographic identifiers", () => {
    const first = randomBase64Url(16);
    const second = randomBase64Url(16);
    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/u);
    expect(isRoomId(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(randomBase64Url(32)).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });

  it("authenticates fixed-size hashes without accepting malformed input", async () => {
    const hash = await sha256("correct-token");
    const correctHex = [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
    expect(hexToBytes(correctHex)).toHaveLength(32);
    expect(timingSafeHashEqual(correctHex, hash)).toBe(true);
    expect(timingSafeHashEqual("f".repeat(64), hash)).toBe(false);
    expect(timingSafeHashEqual("not-hex", hash)).toBe(false);
  });

  it("extracts auth only from a valid WebSocket subprotocol", () => {
    const token = "A".repeat(43);
    expect(parseSocketProtocols(`${SOCKET_PROTOCOL}, ${AUTH_PROTOCOL_PREFIX}${token}`)).toEqual({ token });
    expect(parseSocketProtocols(`${AUTH_PROTOCOL_PREFIX}${token}`)).toBeNull();
    expect(parseSocketProtocols(`${SOCKET_PROTOCOL}, ${AUTH_PROTOCOL_PREFIX}short`)).toBeNull();
    expect(parseSocketProtocols(`${SOCKET_PROTOCOL}, ${AUTH_PROTOCOL_PREFIX}${token}, ${AUTH_PROTOCOL_PREFIX}${token}`)).toBeNull();
  });

  it("allows the published game and local development origins only", () => {
    expect(isAllowedOrigin("https://jz237.github.io", "https://jz237.github.io")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4173", "https://jz237.github.io")).toBe(true);
    expect(isAllowedOrigin("http://localhost:8080", "https://jz237.github.io")).toBe(true);
    expect(isAllowedOrigin("https://evil.example", "https://jz237.github.io")).toBe(false);
    expect(isAllowedOrigin(null, "https://jz237.github.io")).toBe(false);
  });

  it("accepts bounded WebRTC messages and rejects arbitrary payloads", () => {
    expect(parseSignalMessage(JSON.stringify({ type: "offer", description: { type: "offer", sdp: "v=0" } }))).not.toBeNull();
    expect(parseSignalMessage(JSON.stringify({ type: "answer", description: { type: "offer", sdp: "v=0" } }))).toBeNull();
    expect(parseSignalMessage(JSON.stringify({ type: "ice", candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 } }))).not.toBeNull();
    expect(parseSignalMessage(JSON.stringify({ type: "ready", fighterId: "deathblow" }))).not.toBeNull();
    expect(parseSignalMessage(JSON.stringify({ type: "script", source: "alert(1)" }))).toBeNull();
    expect(parseSignalMessage("x".repeat(MAX_SIGNAL_BYTES + 1))).toBeNull();
    expect(parseSignalMessage(new ArrayBuffer(8))).toBeNull();
  });
});
