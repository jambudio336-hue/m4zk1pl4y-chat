# Changelog

## 0.2.1 — 2026-11-14

### Security
- Separated M4ZKIPLAY application-session signing from Supabase JWT signing.
- Application tokens now use the dedicated `M4ZK_SESSION_SECRET` and the `m4zk_session` audience/role; they are verified only by the M4ZKIPLAY Edge Function.
- Disabled the misleading Realtime-token response until a Supabase-compatible ES256 authentication flow is implemented.
- Removed the unused mobile Realtime-token helper.

### Verification
- Supabase signing keys are not modified by this release.
- Registration/login still require the new server-only `M4ZK_SESSION_SECRET` to be configured and require live end-to-end testing.

## 0.2.0 — 2026-11-14

### Added
- Foundation schema for media metadata, call signals, push tokens, rate limits, device sessions, and invite codes.
- Private `m4zk-media` and `m4zk-stories` Storage buckets with owner-folder policies.
- Server-assigned message sequence numbers and UUID client idempotency keys.
- Session listing and revocation endpoints.
- Per-minute database-backed API rate limits for account challenges, account registration/login, general authenticated requests, and message creation.
- CI checks for mobile TypeScript and Supabase Edge Function types.

### Security
- Application API sessions are bound to an active server-side device session.
- Server-only secrets are documented separately from public mobile configuration.
- Existing avatar bucket behavior and previous migrations remain unchanged.

### Verification status
- Foundation migration applied to the configured Supabase project.
- End-to-end registration/login, multi-device session revocation, and cross-device message idempotency still require live verification.

## 0.1.0 — 2026-11-12

- Initial monorepo scaffold.
- Ed25519 challenge/response authentication.
- Encrypted direct-message payload storage.
- Encrypted stories and nearby discovery groundwork.
- Original Socket.IO and WebRTC integration groundwork.
