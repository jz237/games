# Final Blow rollback multiplayer

Version 1.0D turns the checkpoint-12 feasibility proof into the live two-player match path.

## Match protocol

- The host is deterministic side 0 and the guest is side 1.
- The reliable ordered WebRTC channel carries lobby selection, match seed/configuration, confirmed-frame checksums, reconnect state transfer, and rematch votes.
- The unordered zero-retransmit channel carries compact binary input packets. Every packet repeats the latest eight frames so normal loss heals without waiting for retransmission.
- Inputs are 16-bit masks. Direction and guard may be predicted as held; attack, jump, throw, super, and Final Blow pulses are never repeated by prediction.
- Both peers use the host's fighter order, stage, 32-bit seed, per-player control style, and negotiated 0–4 frame input delay.

## Determinism and correction

- `engine/rollback.mjs` owns the 12-frame snapshot ring, last-known-input prediction, mismatch detection, restore/resimulation, packet codec, stable serialization, and FNV-1a checksums.
- The live game saves and restores round phase, timer, RNG, fighters, moves, combo/input buffers, direction taps, projectiles, traps, particles, effects, and Final Blow state.
- Gameplay RNG and visual RNG are separate. A battery-profile phone can draw fewer particles than a desktop without changing combat or checksums.
- Confirmed state is checked every 60 frames. Two persistent mismatches trigger a visible sync repair instead of silently allowing divergent matches.
- Prediction is capped at 12 frames. Exceeding that bound stalls and requests authoritative state rather than simulating indefinitely.

## Recovery and rematches

- A broken peer connection pauses both clients, reauthenticates the same private seats, rebuilds WebRTC, and requests a host snapshot over the reliable channel.
- Current credentials/configuration and a bounded rollback snapshot are retained in tab-scoped session storage so an accidental reload can reclaim the seat before room expiry.
- Portrait orientation and hidden-tab holds are shared with the opponent so one player cannot keep advancing alone.
- Results remain in the room. Two explicit rematch votes produce a fresh match ID/seed without re-sharing the invite.

## Verification

Run the complete pure suite:

```sh
node --test tests/*.test.mjs
```

Run the two-browser live path against a local Worker:

```sh
cd signaling && npx wrangler dev --port 8787 --local
FINAL_BLOW_SIGNALING_API=http://127.0.0.1:8787 node tests/online-browser-smoke.mjs
```

The browser test covers a mobile landscape/touch host, desktop/keyboard guest, a real rollback checksum convergence, deliberate link failure and state recovery, secret-free request URLs, and a negotiated rematch.
