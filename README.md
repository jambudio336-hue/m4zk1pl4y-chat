# m4zk1pl4y-chat

Brutalist end-to-end encrypted chat. Monorepo: Node/Express API + Expo React Native client.

## Stack

- **apps/server** — Express 4, better-sqlite3, socket.io, JWT, tweetnacl
- **apps/mobile** — Expo SDK 54, expo-router, tweetnacl, WebRTC

## Crypto model

- Device generates an Ed25519 signing keypair + an X25519 box keypair on first run.
- Private keys never leave the device (expo-secure-store).
- Auth = sign server challenge with Ed25519 key. Server issues JWT.
- Message payloads are `nacl.box` ciphertext. Server stores opaque blobs.
- Stories use the same box scheme.

## Run locally

```bash
cp apps/server/.env.example apps/server/.env
npm install
npm run dev:server      # http://localhost:4000
npm run dev:mobile      # expo start
