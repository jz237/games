# Final Blow rollback feasibility spike

## Verdict: VALIDATED

**Question:** Can Final Blow's 60 Hz deterministic direction support input prediction, state save/load, rollback, and fast resimulation in a browser without adding perceptible local input delay?

**Answer:** Yes, within a deliberately bounded 12-frame prediction window. The prototype converges byte-for-byte after hundreds of corrections and resimulates an eight-frame correction well inside one 16.67 ms simulation frame. A production integration still requires rewriting the complete match state into a serializable simulation core; this spike is evidence for the architecture, not production netcode.

## Research basis

- The [GGPO Developer Guide](https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md) requires three properties: deterministic advancement from state + inputs, fully encapsulated/serializable state, and the ability to save/load and single-step without rendering. It also recommends isolating render/audio effects from authoritative game state.
- [MDN `RTCPeerConnection.createDataChannel()`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel) confirms broad browser support and exposes `ordered`, `maxPacketLifeTime`, and `maxRetransmits`, allowing a later input channel to use unordered, low-retransmit delivery while redundant recent-frame inputs handle loss.
- GGPO is MIT licensed, but this spike uses no GGPO code or dependency. It implements the minimum algorithm directly so the browser fit can be measured without package or WASM overhead.

## Artifact

- `rollback-spike.mjs` — integer-only two-fighter simulation, canonical JSON snapshots/checksums, last-known-input prediction, rollback ring history, mismatch correction, and resimulation telemetry.
- `rollback-spike.test.mjs` — deterministic replay, save/load identity, normal network, stressed network, and an out-of-window failure case.

Run from the repository root:

```sh
node 2026-08-20/final-blow/spikes/rollback-feasibility/rollback-spike.test.mjs
```

## Measured evidence

Observed on the development host over two separate 3,600-frame / 60-second matches:

| Profile | Simulated network | Rollbacks | Resimulated frames | Longest rollback | Worst resimulation | Final checksum |
|---|---|---:|---:|---:|---:|---|
| Normal | 2–6 frames, 3% packet loss | 441 | 1,590 | 7 frames | 0.060 ms | `0ce234f5` exact |
| Stress | 3–10 frames, 5% packet loss | 422 | 2,118 | 8 frames | 2.123 ms | `0ce234f5` exact |

- Serialized representative state: **375 bytes**, below the 2 KB target.
- Both predicted clients ended on the exact authoritative checksum.
- No correction exceeded the configured 12-frame window in either network profile.
- A deliberately 20-frame-late correction was detected as `windowExceeded` instead of being silently applied or corrupting state.

## What worked

- Last-known-input prediction hides transport delay without delaying local input.
- Bundling the latest eight input frames makes 3–5% unreliable packet loss recover naturally.
- Save → load → resim reaches the same authoritative state and checksum.
- Resimulation cost leaves substantial room for the real renderer on a 16.67 ms frame budget.

## What failed or surprised us

- The existing full game exposes a rich snapshot but has no matching restore operation yet.
- Full match state includes class instances, `Set` values, input buffers, combo trackers, projectiles, traps, RNG state, and transient presentation effects. These must be split into authoritative serializable state versus disposable render/audio state.
- Corrections older than 12 frames require a deliberate stall, hard resync, or disconnect policy. Rollback cannot make arbitrarily bad connections invisible.

## Production recommendation

Proceed. Rewrite this spike normally as a small production `RollbackSession` around a pure match-state module:

1. Pack both players' inputs into a stable bitmask per simulation frame.
2. Add canonical save/load for fighters, RNG, timers, combos, projectiles, traps, and match phase.
3. Keep particles, camera shake, DOM, canvas, music, and one-shot audio outside authoritative state; emit confirmed presentation events after resimulation.
4. Use a 12-frame state ring, periodic checksums, redundant eight-frame input packets, and a hard-resync path.
5. Carry inputs over an unordered WebRTC data channel with bounded retransmission; use a separate reliable channel for room/control messages.

This tracked spike must not be imported by the live game. Checkpoint 14 will be the clean production rewrite.
