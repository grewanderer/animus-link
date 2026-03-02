# Security Policy

This project implements secure connectivity primitives. **Security is a first-class requirement**.

## Reporting vulnerabilities
Please open a private report with details, reproduction, and impact.

## Minimum security bar (MVP gates)
- Secrets (device keys, invite secrets, relay tokens) are **never logged** and are redacted at source.
- Device keys are stored via OS-provided keystore (Keychain/DPAPI/libsecret/Keystore), or encrypted-at-rest fallback.
- Pre-auth traffic is rate-limited and uses stateless retry where applicable.
- Replay protection is enforced for encrypted frames.
- Relay never terminates e2e encryption.

## Threat model pointers
See `spec/node-security.md` and `spec/crypto.md`.
