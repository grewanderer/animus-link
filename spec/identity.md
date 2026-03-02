# Identity (MVP)

Keys:
- RIK: Root Identity Key (Ed25519)
- DK: Device Key (Ed25519)

MVP expectations:
- DK is the primary per-device signing key.
- RIK may be offline or gated by user unlock.

Rotation / revocation:
- Provide a signed rotation certificate from RIK authorizing a new DK.
- Provide a signed revocation record from RIK revoking a DK.

Canonical encoding:
- All signed structures MUST be serialized deterministically (CBOR deterministic recommended).
