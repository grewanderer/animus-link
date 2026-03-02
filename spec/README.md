# Specs (normative)

These documents define the MVP behavior. Implementations MUST follow them.

- `wire.md` — frame formats, message types, encoding
- `state-machine.md` — connection lifecycle, timeouts, retry policy
- `crypto.md` — Noise handshake, key derivation, anti-downgrade binding
- `identity.md` — keys, rotation, revocation, canonical encoding for signatures
- `discovery.md` — invite-first namespaces and signed announcements
- `relay.md` — relay control/data protocol (no e2e termination)
- `service-layer.md` — Expose/Connect L4 abstraction
- `full-tunnel.md` — on-demand full-tunnel exit gateway API and safety requirements
- `node-security.md` — endpoint security requirements (keystore, logging, DoS)
- `platform-support.md` — supported platforms and release artifact gating
- `test-vectors.md` — conformance data contracts
