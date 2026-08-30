# Final Blow private-room signaling

Cloudflare Worker and Durable Object service for two-player invite-only WebRTC negotiation.

## Security model

- A cryptographically random 128-bit room ID addresses one Durable Object in eastern North America.
- Independent 256-bit host, guest, and watch tokens are returned once; only SHA-256 digests are stored on the room.
- Tokens travel in the `Sec-WebSocket-Protocol` header, never in an HTTP/WebSocket URL.
- The game puts the guest token in the invite URL fragment, which browsers do not send in HTTP requests, then removes the fragment after joining.
- Only `https://jz237.github.io` and local HTTP development origins are accepted.
- Each room has exactly one host seat and one guest seat and expires after 15 minutes.
- Read-only `watch` seats (up to four sockets on the shared watch token) may only ping and request the spectate stream; only the host can send `spectate` messages and they relay exclusively to watchers. WebRTC negotiation never reaches a watcher.
- Signaling frames are type-checked, normalized, capped at 32 KiB, and rate-limited to 120 per minute per socket; each seat class has a fixed message vocabulary.
- Room creation is limited to six requests per ten minutes per hashed source address; Street List posts and claims each get an equivalent, independent budget on the same hashed-source limiter.
- Durable Object WebSocket Hibernation keeps connections alive without holding an isolate awake.
- Offer, answer, and ICE data are relayed but never written to durable storage.

## Street List (public challenge board)

`POST /v1/challenges` lets a room's host opt into the public board with a street tag from a server-side curated list plus a fighter id — never arbitrary text. Posting requires both the host token (proof of seat ownership) and the guest token; the worker verifies both digests against the room before listing. The guest token is escrowed in the single board Durable Object for at most the room's remaining 15-minute lifetime, never appears in `GET /v1/challenges` output, and is released exactly once by `POST /v1/challenges/{id}/claim` (the listing is deleted in the same synchronous storage transaction). All endpoints are additive — 2.3 clients never call them.

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
