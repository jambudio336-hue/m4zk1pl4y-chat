# Architecture

## Topology

Single-process Node server. SQLite in WAL mode. Horizontal scaling would need sticky sockets + a shared DB; not a goal for v0.

## Identity

1. Client generates Ed25519 (signing) + X25519 (box) keypairs.
2. `POST /v1/account/challenge` with the signing public key → server returns `{challengeId, nonce}`.
3. Client signs `"<challengeId>:<nonce>"`, posts `/register` or `/login`.
4. Server verifies, issues a 30-day JWT. Private keys live in `expo-secure-store`.

Handles are unique, lowercase, 3–24 chars. Public keys are unique, so one device = one identity. Reinstalling without a backup means a new identity.

## Message encryption

`nacl.box(plaintext, nonce, peerBoxPublicKey, myBoxSecretKey)`.

- Client fetches the peer's `boxPublicKey` from the contact list.
- Server stores `nonce` + `ciphertext` only.
- Group support is out of scope; 1:1 only.

## Stories

Same box scheme. Recipients = self + accepted contacts. Expiry 24h, swept on read (lazy) rather than by a cron job.

## Nearby

Client posts a coarse location (3 decimal places, ~110m). `/v1/nearby` computes haversine distance in JS and filters. No PostGIS, no geohash index — fine under ~50k rows.

## Calls

Signaling only, over socket.io (`call:offer`, `call:answer`, `call:ice`, `call:end`). Media is peer-to-peer; add TURN for symmetric NAT. Needs a dev build because `react-native-webrtc` has native code.

## Known gaps

- No offline delivery queue — messages are stored, but push notifications are absent.
- No key rotation or multi-device.
- No pagination cursor signing; `before` is a timestamp.
- Read receipts are emitted to the sender only.
