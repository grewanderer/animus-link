# Debug Matrix (Public Beta Platform Consistency)

This matrix tracks platform CI/debug status and fixes required for stable public-beta gates.
Source of truth:
- local gate runs (`cargo fmt/clippy/test/conformance`)
- repository workflow configuration (`.github/workflows/ci.yml`, `.github/workflows/release.yml`)
- locally reproducible historical breakages already fixed in-tree

Note: live GitHub Actions run logs are not accessible from this offline workspace, so job tool versions are recorded from pinned workflow inputs and project config.

## Baseline Gate Snapshot (Local, 2026-03-02)

| Gate | Command | Status |
|---|---|---|
| Format | `cargo fmt --all` | pass |
| Lint | `cargo clippy --workspace --all-targets -- -D warnings` | pass |
| Tests | `cargo test --workspace` | pass |
| Conformance | `cargo run -p conformance-runner -- --run all` | pass (`18/18`, `0 skipped`) |

## CI Job Matrix (Before/After)

| Platform / Job | First failing step (before) | Root cause (before) | Fix plan / implemented fix | Status after |
|---|---|---|---|---|
| Windows / checkout | `actions/checkout` | NTFS ADS-like paths in repo (`:Zone.Identifier`) caused invalid path handling on Windows checkout | Remove ADS artifacts, add `*:Zone.Identifier` to `.gitignore`, add CI/release guard that fails on any `:Zone.Identifier` path | fixed in repo config; guard active |
| Linux / workspace tests | `cargo test --workspace` (`relay_e2e`) | Flaky startup race in relay e2e test (`receive msg1 timeout`) | Ephemeral bind + readiness barrier + CI-safe timeout + bounded retry + safe diagnostics | fixed locally; test stable |
| macOS / iOS build | `xcodebuild` | Typical break class: target drift between host app and extension, missing generated bindings drift | Keep explicit build of both targets, verify generated Swift binding consistency in CI, validate expected outputs | configured and guarded |
| Ubuntu / Android build | `gradle testDebugUnitTest assembleDebug` or Rust ABI packaging | Typical break class: missing Rust `.so` ABI outputs / stale UniFFI Kotlin bindings | Build Rust ABIs via `cargo ndk`, generate UniFFI Kotlin bindings, artifact existence checks for `.so` and APK | configured and guarded |
| Linux / conformance | `cargo run -p conformance-runner -- --run all` | Historical risk: skipped/placeholder suites | Conformance runner executes all suites and fails on any check error | passing locally (`18/18`) |
| Release / asset integrity | release publish stage | Missing integrity artifacts (`SHA256SUMS.txt`, SBOM) | Release pipeline computes SHA256 sums for all assets and publishes `sbom.cdx.json` (CycloneDX pinned) | configured and guarded |

## CI Environment Matrix (Pinned/Configured)

| Area | Configured environment/tooling |
|---|---|
| Rust toolchain | `stable` (`rust-toolchain.toml`), with `rustfmt` + `clippy` |
| Desktop CI | GitHub-hosted `ubuntu-latest`, `macos-latest`, `windows-latest` |
| Android CI | `actions/setup-java@v4` with Temurin 17, `android-actions/setup-android@v3`, Rust targets `aarch64-linux-android,x86_64-linux-android` |
| iOS CI | `macos-latest`, Rust targets `aarch64-apple-ios,aarch64-apple-ios-sim`, `xcodebuild` build-only (no signing required in CI) |
| Release integrity | `cargo-cyclonedx` pinned to `0.5.7`, SHA256 manifest generation in `dist/SHA256SUMS.txt` |

## Remaining Validation Work

1. Keep CI path-sanity guard as a required dependency for all major jobs.
2. Keep Android/iOS artifact assertions strict (`.apk`, `.so` ABIs, `.app`, `.appex`, `.ipa`, `.xcframework`).
3. Run manual device checks for privileged/runtime features (VPN/TUN, entitlements) as documented in runbook.
