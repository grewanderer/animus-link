#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[verify-full-tunnel-linux] SKIP: Linux-only verification script"
  exit 0
fi

echo "[verify-full-tunnel-linux] running non-privileged control/data-plane checks"
cargo test -p link-tunnel-client
cargo test -p link-daemon api::tests::tunnel_routes_enable_disable_and_status_schema -- --nocapture
cargo test -p link-daemon api::tests::relay_gateway_tunnel_roundtrip_http_via_ip_packets -- --nocapture

if [[ ! -c /dev/net/tun ]]; then
  echo "[verify-full-tunnel-linux] SKIP runtime: /dev/net/tun is missing (tun_missing)"
  exit 0
fi

cap_eff_hex="$(awk '/^CapEff:/ {print $2}' /proc/self/status)"
cap_eff_value=$((16#${cap_eff_hex:-0}))

# Linux capability bits:
# 10 -> CAP_NET_BIND_SERVICE
# 12 -> CAP_NET_ADMIN
has_cap_bind_service=0
has_cap_net_admin=0
if (( (cap_eff_value & (1 << 10)) != 0 )); then
  has_cap_bind_service=1
fi
if (( (cap_eff_value & (1 << 12)) != 0 )); then
  has_cap_net_admin=1
fi

if (( has_cap_net_admin == 0 )); then
  echo "[verify-full-tunnel-linux] SKIP runtime: CAP_NET_ADMIN missing (cap_net_admin_missing)"
  exit 0
fi

if (( has_cap_bind_service == 0 )); then
  echo "[verify-full-tunnel-linux] note: CAP_NET_BIND_SERVICE missing; remote_strict should report bind53_missing"
fi

cat <<'EOF'
[verify-full-tunnel-linux] runtime prerequisites detected.
Manual runtime validation:
1) Start relay + gateway + client daemons.
2) Enable /v1/tunnel/enable with fail_mode=open_fast and dns_mode=remote_best_effort.
3) Validate /v1/tunnel/status transitions and /v1/self_check capability checks.
4) Optionally test dns_mode=remote_strict when CAP_NET_BIND_SERVICE is available.
EOF

echo "[verify-full-tunnel-linux] PASS (automated non-privileged checks + runtime prerequisites)"
