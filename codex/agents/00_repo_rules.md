# Repo rules (MVP)

- Specs are normative.
- No secrets in logs. Use redaction helpers.
- Pre-auth code must be constant-time-ish and allocation-bounded.
- Any new message type requires:
  - spec update
  - conformance vector
  - tests
