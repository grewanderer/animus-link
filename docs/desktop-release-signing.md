# Desktop Release, Signing, and Updater Setup

## Workflows

- `ci.yml`
  - Rust workspace fmt/clippy/build/test
  - desktop frontend lint/test/build
  - desktop Tauri smoke coverage
- `desktop-build.yml`
  - builds cross-platform desktop bundles
  - bundles the `link-daemon` sidecar
  - uploads per-platform artifacts
- `release.yml`
  - triggers on version tags
  - builds draft desktop release assets
  - publishes checksums and release metadata

## Secrets

### Common updater signing

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Updater artifacts should only be published when the updater signing key is present.

### macOS signing / notarization

- `APPLE_CERTIFICATE_P12_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_TEAM_ID`
- `APPLE_API_ISSUER`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`

When these secrets exist, the macOS release job prepares signing inputs before `tauri build`. When they are absent, the workflow still emits unsigned preview bundles.

### Windows signing

- `WINDOWS_CERTIFICATE_PFX_BASE64`
- `WINDOWS_CERTIFICATE_PFX_PASSWORD`

When these secrets exist, the release workflow prepares the code-signing certificate before the Windows bundle build. Otherwise it publishes unsigned preview artifacts.

## Release process

1. Push a version tag such as `v0.1.0`.
2. `release.yml` builds cross-platform desktop bundles.
3. The workflow uploads artifacts and creates a draft GitHub release.
4. `SHA256SUMS.txt` and `release-metadata.json` are published with the assets.
5. Promote the draft release after manual verification.

## Troubleshooting signing and updater issues

- If updater artifacts are missing, confirm `TAURI_SIGNING_PRIVATE_KEY` is present.
- If macOS build succeeds but notarization-ready inputs are missing, verify the Apple API secrets and certificate secret names exactly match the workflow.
- If Windows signing does not activate, verify the PFX secret is base64 encoded and the password matches the uploaded certificate.
