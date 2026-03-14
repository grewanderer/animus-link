# Identity (MVP)

Keys:
- RIK: Root Identity Key (Ed25519)
- DK: Device Key (Ed25519)
- NK: Node identity reference used for routing / role assignment

MVP expectations:
- DK is the primary per-device signing key.
- RIK may be offline or gated by user unlock.
- Link control state MUST model:
  - root identity
  - device identity
  - node identity
  - trust policy

Mesh-facing identity rules:
- `peer_id` is derived from / anchored to the root identity.
- A node role assignment is bound to a specific `node_id` inside a specific mesh.
- Mesh membership records and role mutations MUST be signed or deterministically authenticated so revocation and replay-safe policy decisions remain auditable.
- Supported node roles for MVP:
  - `edge`
  - `relay`
  - `gateway`
  - `service_host`
  - combinations are allowed

Rotation / revocation:
- Provide a signed rotation certificate from RIK authorizing a new DK.
- Provide a signed revocation record from RIK revoking a DK.
- Provide hooks for mesh membership revocation and node role removal.

Canonical encoding:
- All signed structures MUST be serialized deterministically (CBOR deterministic recommended).
