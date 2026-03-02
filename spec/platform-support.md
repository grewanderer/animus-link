# Platform Support (Platform-0)

Supported platforms for MVP:
- Linux (x86_64 + aarch64)
- macOS (arm64 + x86_64)
- Windows (x86_64)
- Android (arm64-v8a baseline)
- iOS (arm64 baseline)

## Definition of Support (MVP)

A platform is "supported" when all of the following are true for the release tag:
- Core Rust crates in this repository compile on the platform target triple(s).
- Platform host app or binary artifact is produced in CI for that platform.
- Unit tests run for desktop platforms (Linux/macOS/Windows).
- Build smoke checks run for mobile platforms (Android/iOS app build).
- Public beta mobile runtime policy is foreground-only:
  - host apps refresh status when foregrounded/resumed
  - Android full tunnel runs through foreground `VpnService`
  - iOS full tunnel runs through `NEPacketTunnelProvider` started from host UI
  - background always-on connectivity is not part of MVP support

## Release Gate (Normative)

Every release tag MUST produce artifacts for all supported platforms:
- Desktop: Linux/macOS/Windows binaries.
- Android: APK artifact.
- iOS: Xcode build artifact.

If any supported-platform artifact job fails, the release MUST fail.

Binding strategy:
- Cross-platform host bindings (Android/iOS and desktop language adapters) MUST be generated via UniFFI from `crates/fabric-ffi`.
- Manual JNI/symbol glue is not a supported long-term strategy for release builds.
