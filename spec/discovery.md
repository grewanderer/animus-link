# Discovery (MVP)

Default is **invite-first private namespaces**.

An invite creates:
- namespace_id (128-bit random)
- namespace_secret (used to authenticate writes; specifics are implementation-defined for MVP)

Nodes publish signed announcements with short TTL (5-15 minutes):
- node_id
- endpoints (transport type + addr)
- expires_at
- signature (DK)

Discovery record format (v1):
- `ver` (number): MUST be `1`
- `namespace_id` (string)
- `node_id` (string)
- `endpoints` (array of `{transport, addr}`)
- `expires_at` (u64 unix seconds)

Canonical encoding and signatures:
- Records MUST be encoded deterministically before signing.
- MVP canonical form is deterministic JSON with fixed field order:
  - `ver`, `namespace_id`, `node_id`, `endpoints`, `expires_at`
  - endpoint field order: `transport`, `addr`
- Signature algorithm: Ed25519 over canonical JSON bytes.
- Any field modification MUST invalidate signature verification.

Public DHT mode is out-of-scope for MVP unless explicitly enabled.
