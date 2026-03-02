# Public Beta FAQ

## Is this a VPN?

Not in the full-device/full-tunnel sense. Public beta is a relay-first secure overlay with L4 `Expose`/`Connect` for selected services, not a general TUN-based “route all traffic” VPN.

## Does the relay decrypt my traffic?

No. Relay forwards opaque encrypted frames and does not terminate end-to-end payload encryption.

## What metadata exists?

The relay and endpoints can still observe operational metadata such as source IP, timing, byte counts, and connection patterns needed for routing/abuse control. Public beta minimizes logging and avoids secret/token/payload logging by policy.

## Why is mobile foreground-only?

Public beta intentionally avoids background connectivity complexity and OS policy risks. Android and iOS host apps refresh status when returning to foreground; always-on background connectivity is not promised in beta.

## How do I debug issues?

Use operator endpoints and metrics:
- `GET /v1/self_check`
- `GET /v1/diagnostics`
- `GET /v1/metrics`
- Relay: `GET /healthz`, `GET /metrics`

For full-tunnel DNS modes on Linux:
- `dns_mode=remote_best_effort`: default, unprivileged, may degrade if system DNS cannot be redirected safely.
- `dns_mode=remote_strict`: requires low-port bind + system DNS control; guarantees remote DNS when available.
- `dns_mode=system`: local DNS behavior (possible DNS leakage by design).

See:
- `docs/public-beta-runbook.md`
- `docs/how-to-verify-release.md`

## What are beta limitations?

- Relay-first path is the supported default.
- Mobile runtime policy is foreground-only.
- No full-device TUN VPN behavior.
- No public DHT discovery fabric.
- APIs and UX may evolve as conformance/security/ops hardening continues.

## Can I route traffic via a connected machine in another country?

Not as a full-device default behavior in this beta. A gateway/proxy style add-on can be built on top of `Expose`/`Connect`, but this is roadmap/optional architecture work, not a public beta promise.
