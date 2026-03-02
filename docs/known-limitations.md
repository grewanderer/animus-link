# Known Limitations (Public Beta)

This document lists runtime constraints that are expected in public beta. These are operational requirements, not protocol bugs.

## Linux full-tunnel prerequisites

1. TUN device support is required:
   - `/dev/net/tun` must exist (`tun_missing` when absent).
2. Route control requires elevated network capability:
   - `CAP_NET_ADMIN` (`cap_net_admin_missing` when absent).
3. Strict remote DNS mode requires low-port bind capability:
   - `CAP_NET_BIND_SERVICE` for `127.0.0.1:53` (`bind53_missing` when absent).
4. In unprivileged environments, use:
   - `dns_mode=remote_best_effort` or `dns_mode=system`
   - and review `/v1/self_check` + `/v1/tunnel/status` for explicit capability status.

## iOS device runtime requirements

1. Device deployment requires Apple provisioning and Network Extension entitlement:
   - `com.apple.developer.networking.networkextension` (`packet-tunnel-provider`).
2. CI validates build-only for host app + packet tunnel extension.
3. Device tunnel start/stop must be validated manually on signed builds.

## Android runtime requirements

1. VPN mode requires user approval prompt from `VpnService`.
2. Public beta policy is foreground-only:
   - tunnel runs with a foreground notification while active.
3. Background always-on runtime is not part of public beta support.

## Cross-platform behavior limits

1. Mobile policy is `foreground_only` in diagnostics for public beta.
2. Full-device full-tunnel is opt-in beta mode, not default product behavior.
3. Platform-specific runtime checks are surfaced through:
   - `GET /v1/self_check`
   - `GET /v1/tunnel/status`
