# Final Blow private-room signaling

Cloudflare Worker and Durable Object service for two-player invite-only WebRTC negotiation.

## Security model

- A cryptographically random 128-bit room ID addresses one Durable Object in eastern North America.
- Independent 256-bit host and guest tokens are returned once; only SHA-256 digests are stored.
- Tokens travel in the `Sec-WebSocket-Protocol` header, never in an HTTP/WebSocket URL.
- The game puts the guest token in the invite URL fragment, which browsers do not send in HTTP requests, then removes the fragment after joining.
- Only `https://jz237.github.io` and local HTTP development origins are accepted.
- Each room has exactly one host seat and one guest seat and expires after 15 minutes.
- Signaling frames are type-checked, normalized, capped at 32 KiB, and rate-limited to 120 per minute per socket.
- Room creation is limited to six requests per ten minutes per hashed source address.
- Durable Object WebSocket Hibernation keeps connections alive without holding an isolate awake.
- Offer, answer, and ICE data are relayed but never written to durable storage.

Actual match traffic is peer-to-peer. `final-blow-control` is reliable and ordered; `final-blow-input` is unordered with zero retransmissions for production rollback input packets. Match inputs never traverse or persist in the Worker. See [`../ROLLBACK.md`](../ROLLBACK.md) for the game protocol, correction bounds, reconnect flow, and verification commands.

## Commands

```sh
npm run types
npm run check
npm test
npm run deploy:dry
npm run deploy
npm run test:live
```

Production health endpoint: <https://final-blow-signaling.jez237.workers.dev/health>
