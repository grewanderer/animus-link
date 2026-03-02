# Animus Link iOS Host App + Packet Tunnel Extension (MVP)

This app is the iOS Platform-0 host shell with a Packet Tunnel extension target for device testing.

FFI linkage (UniFFI):
- Rust API is defined by `crates/fabric-ffi/src/fabric.udl`.
- Swift bindings are generated to `mobile/ios/Generated` by:
  - `cargo run --quiet -p fabric-ffi --bin generate-bindings -- swift mobile/ios/Generated`
- Xcode target links `libfabric_ffi.a`.
- Extension target (`AnimusLinkTunnelExtension`) links the same `libfabric_ffi.a`.
- Build script compiles `fabric-ffi` for the active iOS platform and copies the static library to:
  - `mobile/ios/RustLibs/iphoneos`
  - `mobile/ios/RustLibs/iphonesimulator`
- Build script path:
  - `mobile/ios/scripts/build-rust-ios.sh`
- Optional packaging script for release artifacts:
  - `mobile/ios/scripts/package-xcframework.sh` -> `mobile/ios/dist/AnimusLinkFFI.xcframework`
- CI consistency gate:
  - If `mobile/ios/Generated/animus_link.swift` is committed, CI regenerates bindings and fails on diffs.

Build (CI/MVP):
- `xcodebuild -project mobile/ios/AnimusLinkIOS.xcodeproj -target AnimusLinkIOS -target AnimusLinkTunnelExtension ... build`

Relay/security notes:
- Host app can start/stop `NETunnelProviderManager` for the Packet Tunnel extension.
- Relay path requires signed relay tokens by default.
- Never log invite/token/key material in iOS logs.
- Public beta policy is foreground-only:
  - UI shows `Foreground-only (Public Beta)`.
  - App refreshes `version()`/`status()` on foreground activation.
  - Tunnel start/stop is user-driven from foreground UI.

Entitlements/signing requirements:
- Apple Developer account + provisioning profiles are required on real devices.
- Required entitlement:
  - `com.apple.developer.networking.networkextension` with `packet-tunnel-provider`.
- Files:
  - app: `AnimusLinkIOS/AnimusLinkIOS.entitlements`
  - extension: `AnimusLinkTunnelExtension/AnimusLinkTunnelExtension.entitlements`

Manual device test flow:
1. Build and install host app + extension on a signed device build.
2. Open app and tap `Start Tunnel`.
3. Approve VPN configuration prompt from iOS.
4. Confirm UI tunnel state transitions to `connected`/`connecting`.
5. Validate egress + DNS behavior with operator checks.
6. Tap `Stop Tunnel` to disconnect.

Common troubleshooting:
- `TunnelManagerLoadError` / `SaveError`: provisioning or entitlement mismatch.
- `startVPNTunnel` failure: extension bundle identifier mismatch or extension not embedded.
- If tunnel remains disconnected, verify relay reachability and signed-token path on backend.

TestFlight beta flow:
1. Download CI/release iOS artifacts:
   - `ios-debug-ipa` / `ios-ipa`
   - `ios-xcframework` (for host integration validation)
2. Validate app launch + tunnel start/stop controls.
3. Validate relay-first tunnel behavior against signed-token relay backend.
4. Upload IPA to App Store Connect (TestFlight) via Xcode Organizer/Transporter.
5. Roll out to internal testers, then external beta groups.
