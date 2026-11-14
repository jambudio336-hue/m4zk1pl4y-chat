# Changelog

## 0.2.0 — 2026-11-14

### Added
- Foundation schema for media metadata, call signals, push tokens, rate limits, device sessions, and invite codes.
- Private `m4zk-media` and `m4zk-stories` Storage buckets with owner-folder policies.
- Server-assigned message sequence numbers and UUID client idempotency keys.
- Session listing and revocation endpoints.
- One-hour Realtime JWT endpoint using the project's JWT signing secret.
- Per-minute database-backed API rate limits for account challenges, account registration/login, general authenticated requests, and message creation.
- Mobile API helpers for sessions, realtime tokens, and message idempotency.
- CI checks for mobile TypeScript and Supabase Edge Function types.

### Security
- API JWTs now carry the Supabase `authenticated` role and are bound to an active server-side device session.
- JWT signing secret is documented as a server-only Supabase Edge Function secret.
- Existing avatar bucket behavior and previous migrations remain unchanged.

### Verification status
- Foundation migration applied to the configured Supabase project.
- End-to-end registration/login, Realtime acceptance, multi-device session revocation, and cross-device message idempotency still require live verification after configuring `SUPABASE_JWT_SECRET`.

## 0.1.0 — 2026-11-12

- Initial monorepo scaffold.
- Ed25519 challenge/response authentication.
- Encrypted direct-message payload storage.
- Encrypted stories and nearby discovery groundwork.
- Original Socket.IO and WebRTC integration groundwork.
