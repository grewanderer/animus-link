use std::{
    env::consts::{ARCH, OS},
    net::{SocketAddr, TcpListener},
    sync::Arc,
    time::Duration,
};

use fabric_identity::default_keystore;
use fabric_relay_client::RelayClient;
use fabric_relay_proto::{
    parse_token, validate_claims_time_and_relay, verify_signature, RelayCtrl, RelayPacket,
    DEFAULT_CLOCK_SKEW_SECS,
};
use fabric_security::redact::redact;
use serde::Serialize;
use tokio::time::timeout;

use crate::{invite::now_unix_secs, relay_token::RelayTokenIssuer};

const API_VERSION: &str = "v1";
const PROTOCOL_VERSION: &str = "animus/fabric/v1";
const RELAY_CHECK_TIMEOUT_MS: u64 = 400;
const TOKEN_SELF_CHECK_TTL_SECS: u32 = 30;

#[derive(Debug, Clone, Serialize)]
pub struct VersionInfo {
    pub app: String,
    pub protocol: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct DnsCapabilitiesInfo {
    pub remote_best_effort_supported: bool,
    pub remote_strict_supported: bool,
    pub can_bind_low_port: bool,
    pub can_set_system_dns: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct RuntimeCapabilitiesInfo {
    pub tun_device_present: bool,
    pub has_cap_net_admin: bool,
    pub has_cap_bind_service: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SelfCheckItem {
    pub name: String,
    pub ok: bool,
    pub code: String,
    pub detail_safe: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SelfCheckResponse {
    pub api_version: String,
    pub ok: bool,
    pub version: VersionInfo,
    pub platform: PlatformInfo,
    pub dns_mode: String,
    pub dns_capabilities: DnsCapabilitiesInfo,
    pub runtime_capabilities: RuntimeCapabilitiesInfo,
    pub timestamp_unix: u64,
    pub checks: Vec<SelfCheckItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticsCounters {
    pub connect_attempts_total: u64,
    pub connect_success_total: u64,
    pub connect_fail_total: u64,
    pub expose_attempts_total: u64,
    pub expose_denied_total: u64,
    pub handshake_failures_total: u64,
    pub relay_reachable: u64,
    pub stream_open_total: u64,
    pub bytes_proxied_total: u64,
    pub gateway_packets_in_total: u64,
    pub gateway_packets_out_total: u64,
    pub gateway_sessions_active: u64,
    pub gateway_sessions_evicted_total: u64,
    pub gateway_drops_malformed_total: u64,
    pub gateway_drops_quota_total: u64,
    pub tunnel_enabled: u64,
    pub tunnel_connected: u64,
    pub tunnel_reconnects_total: u64,
    pub tunnel_bytes_in_total: u64,
    pub tunnel_bytes_out_total: u64,
    pub prewarm_ready_gauge: u64,
    pub prewarm_attempts_total: u64,
    pub prewarm_fail_total: u64,
    pub dns_queries_total: u64,
    pub dns_timeouts_total: u64,
    pub dns_failures_total: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecentErrorSummary {
    pub code: String,
    pub count: u32,
    pub last_unix: u64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MobilePolicy {
    ForegroundOnly,
    BackgroundSupported,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConfigSummary {
    pub relay_configured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_name: Option<String>,
    pub token_issuer_configured: bool,
    pub namespace_count: u32,
    pub mobile_policy: MobilePolicy,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticsResponse {
    pub api_version: String,
    pub version: VersionInfo,
    pub platform: PlatformInfo,
    pub uptime_secs: u64,
    pub config_summary: ConfigSummary,
    pub counters: DiagnosticsCounters,
    pub recent_errors: Vec<RecentErrorSummary>,
    pub notes: Vec<String>,
}

#[derive(Clone)]
pub struct SelfCheckInputs {
    pub api_bind: SocketAddr,
    pub relay_addr: Option<SocketAddr>,
    pub relay_name: Option<String>,
    pub token_issuer: Option<Arc<RelayTokenIssuer>>,
    pub token_issuer_configured: bool,
    pub namespace_count: u32,
    pub namespace_store_rw_ok: bool,
    pub tunnel_supported: bool,
    pub tunnel_enabled: bool,
    pub tunnel_dns_mode: String,
    pub tunnel_dns_capabilities: DnsCapabilitiesInfo,
    pub tunnel_dns_capability_detail: String,
    pub runtime_capabilities: RuntimeCapabilitiesInfo,
    pub tunnel_config_ok: bool,
}

#[derive(Debug, Clone)]
pub struct DiagnosticsInput {
    pub relay_configured: bool,
    pub relay_name: Option<String>,
    pub token_issuer_configured: bool,
    pub namespace_count: u32,
    pub counters: DiagnosticsCounters,
    pub recent_errors: Vec<RecentErrorSummary>,
    pub started_unix: u64,
    pub mobile_policy: MobilePolicy,
}

pub async fn run_self_check(inputs: SelfCheckInputs) -> SelfCheckResponse {
    let keystore_check = check_keystore();
    let token_issuer_check = check_token_issuer_config(inputs.token_issuer_configured);
    let relay_check = check_relay_reachable(inputs.relay_addr).await;
    let token_roundtrip_check =
        check_token_mint_verify(inputs.token_issuer.clone(), inputs.relay_name.clone());
    let namespace_store_check = if inputs.namespace_store_rw_ok {
        ok_check(
            "namespace_store_ok",
            "ok",
            format!(
                "namespace store read/write ok; count={}",
                inputs.namespace_count
            ),
        )
    } else {
        fail_check(
            "namespace_store_ok",
            "namespace_store_unavailable",
            "namespace store read/write check failed",
        )
    };
    let port_bind_check = check_port_bind_conflicts(inputs.api_bind);
    let tunnel_supported_check = check_tunnel_supported(inputs.tunnel_supported);
    let tun_device_check = check_tun_device_present(inputs.runtime_capabilities);
    let cap_net_admin_check = check_cap_net_admin(inputs.runtime_capabilities);
    let cap_bind_service_check = check_cap_bind_service(inputs.runtime_capabilities);
    let tunnel_config_check = check_tunnel_config(inputs.tunnel_enabled, inputs.tunnel_config_ok);
    let dns_remote_strict_check = check_dns_remote_strict_support(
        inputs.tunnel_dns_capabilities,
        inputs.tunnel_dns_capability_detail.as_str(),
    );

    let checks = vec![
        keystore_check,
        token_issuer_check,
        relay_check,
        token_roundtrip_check,
        namespace_store_check,
        port_bind_check,
        tunnel_supported_check,
        tun_device_check,
        cap_net_admin_check,
        cap_bind_service_check,
        dns_remote_strict_check,
        tunnel_config_check,
    ];
    let ok = checks.iter().all(|check| check.ok);

    SelfCheckResponse {
        api_version: API_VERSION.to_string(),
        ok,
        version: current_version_info(),
        platform: current_platform_info(),
        dns_mode: redaction_guard(inputs.tunnel_dns_mode.as_str()),
        dns_capabilities: inputs.tunnel_dns_capabilities,
        runtime_capabilities: inputs.runtime_capabilities,
        timestamp_unix: now_unix_secs(),
        checks,
    }
}

pub fn build_diagnostics(input: DiagnosticsInput) -> DiagnosticsResponse {
    let now = now_unix_secs();
    let relay_name = input
        .relay_name
        .as_deref()
        .map(redaction_guard)
        .filter(|name| !name.is_empty());

    let mut notes = Vec::new();
    if !input.relay_configured {
        notes.push("relay not configured; connect path remains unknown".to_string());
    }
    if input.counters.expose_denied_total > 0 {
        notes.push("expose deny-by-default policy is active".to_string());
    }
    if input.counters.connect_fail_total > 0 || !input.recent_errors.is_empty() {
        notes.push("recent failures detected; inspect counters and error codes".to_string());
    }
    if notes.is_empty() {
        notes.push("diagnostics nominal".to_string());
    }
    let notes = notes
        .into_iter()
        .map(|note| redaction_guard(note.as_str()))
        .collect();

    DiagnosticsResponse {
        api_version: API_VERSION.to_string(),
        version: current_version_info(),
        platform: current_platform_info(),
        uptime_secs: now.saturating_sub(input.started_unix),
        config_summary: ConfigSummary {
            relay_configured: input.relay_configured,
            relay_name,
            token_issuer_configured: input.token_issuer_configured,
            namespace_count: input.namespace_count,
            mobile_policy: input.mobile_policy,
        },
        counters: input.counters,
        recent_errors: input.recent_errors,
        notes,
    }
}

pub fn redaction_guard(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let lower = trimmed.to_ascii_lowercase();
    if trimmed.contains("animus://invite/")
        || trimmed.contains("animus://rtok/")
        || lower.contains("token=")
        || lower.contains("secret")
        || lower.contains("private_key")
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        return redact(trimmed);
    }

    trimmed
        .chars()
        .filter(|ch| ch.is_ascii_graphic() || *ch == ' ')
        .take(128)
        .collect()
}

fn check_keystore() -> SelfCheckItem {
    let mut keystore = default_keystore();
    let key_id = format!("self-check-{}", now_unix_secs());
    let probe = [0x52, 0xD1, 0xA9, 0x00];
    let result = keystore
        .store_secret(key_id.as_str(), probe.as_slice())
        .and_then(|_| keystore.load_secret(key_id.as_str()))
        .and_then(|loaded| {
            if loaded.as_deref() == Some(probe.as_slice()) {
                Ok(())
            } else {
                Err(fabric_identity::errors::IdentityError::KeyStore(
                    "roundtrip mismatch".to_string(),
                ))
            }
        })
        .and_then(|_| keystore.delete_secret(key_id.as_str()));

    match result {
        Ok(()) => ok_check("keystore_ok", "ok", "keystore operation succeeded"),
        Err(_) => fail_check(
            "keystore_ok",
            "keystore_unavailable",
            "keystore operation failed",
        ),
    }
}

fn check_token_issuer_config(configured: bool) -> SelfCheckItem {
    if configured {
        return ok_check(
            "token_issuer_config_ok",
            "ok",
            "token issuer configuration present",
        );
    }
    fail_check(
        "token_issuer_config_ok",
        "token_issuer_missing",
        "token issuer configuration missing",
    )
}

async fn check_relay_reachable(relay_addr: Option<SocketAddr>) -> SelfCheckItem {
    let Some(relay_addr) = relay_addr else {
        return fail_check(
            "relay_reachable",
            "relay_not_configured",
            "relay endpoint is not configured",
        );
    };

    let probe = async move {
        let client = RelayClient::bind(loopback_datagram_addr(relay_addr), relay_addr).await?;
        let nonce = now_unix_secs();
        client.send_ctrl(RelayCtrl::Ping { nonce }).await?;
        loop {
            let (packet, _) = client.recv_packet().await?;
            if let RelayPacket::Ctrl(envelope) = packet {
                if let RelayCtrl::Pong { nonce: returned } = envelope.message {
                    if returned == nonce {
                        return Ok::<(), fabric_relay_client::errors::RelayClientError>(());
                    }
                }
            }
        }
    };

    match timeout(Duration::from_millis(RELAY_CHECK_TIMEOUT_MS), probe).await {
        Ok(Ok(())) => ok_check("relay_reachable", "ok", "relay responded to ping"),
        Ok(Err(_)) => fail_check("relay_reachable", "relay_unreachable", "relay ping failed"),
        Err(_) => fail_check("relay_reachable", "relay_timeout", "relay ping timed out"),
    }
}

fn check_token_mint_verify(
    token_issuer: Option<Arc<RelayTokenIssuer>>,
    relay_name: Option<String>,
) -> SelfCheckItem {
    let (Some(token_issuer), Some(relay_name)) = (token_issuer, relay_name) else {
        return fail_check(
            "token_mint_verify_ok",
            "relay_not_configured",
            "token self-check requires relay configuration",
        );
    };

    let now = now_unix_secs();
    let Ok(token) = token_issuer.mint_relay_token(
        relay_name.as_str(),
        "self-check",
        Some(TOKEN_SELF_CHECK_TTL_SECS),
        now,
    ) else {
        return fail_check(
            "token_mint_verify_ok",
            "token_mint_failed",
            "token mint operation failed",
        );
    };

    let Ok(parsed) = parse_token(token.expose().as_str()) else {
        return fail_check(
            "token_mint_verify_ok",
            "token_parse_failed",
            "minted token format was invalid",
        );
    };

    let Some(public_key) = decode_hex32(token_issuer.public_key_hex()) else {
        return fail_check(
            "token_mint_verify_ok",
            "token_public_key_invalid",
            "token issuer public key was invalid",
        );
    };
    if verify_signature(&parsed, public_key).is_err() {
        return fail_check(
            "token_mint_verify_ok",
            "token_signature_invalid",
            "token signature verification failed",
        );
    }
    if validate_claims_time_and_relay(
        &parsed.claims,
        now,
        DEFAULT_CLOCK_SKEW_SECS,
        Some(relay_name.as_str()),
    )
    .is_err()
    {
        return fail_check(
            "token_mint_verify_ok",
            "token_claims_invalid",
            "token claims validation failed",
        );
    }

    ok_check(
        "token_mint_verify_ok",
        "ok",
        "token mint and local verify succeeded",
    )
}

fn check_port_bind_conflicts(api_bind: SocketAddr) -> SelfCheckItem {
    if api_bind.port() == 0 {
        return ok_check(
            "port_bind_conflicts",
            "ephemeral_port",
            "api bind uses ephemeral port",
        );
    }

    match TcpListener::bind(api_bind) {
        Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => {
            ok_check("port_bind_conflicts", "bound", "api bind is active")
        }
        Ok(listener) => {
            drop(listener);
            fail_check(
                "port_bind_conflicts",
                "port_not_bound",
                "configured api bind is not active",
            )
        }
        Err(_) => fail_check(
            "port_bind_conflicts",
            "bind_check_failed",
            "unable to verify api bind status",
        ),
    }
}

fn check_tunnel_supported(supported: bool) -> SelfCheckItem {
    if supported {
        return ok_check(
            "tunnel_supported",
            "ok",
            "full-tunnel feature is available for this platform",
        );
    }
    fail_check(
        "tunnel_supported",
        "platform_unsupported",
        "full-tunnel feature is not supported on this platform",
    )
}

fn check_tun_device_present(capabilities: RuntimeCapabilitiesInfo) -> SelfCheckItem {
    #[cfg(target_os = "linux")]
    {
        if capabilities.tun_device_present {
            return ok_check("tun_device_present", "ok", "linux tun device is available");
        }
        fail_check(
            "tun_device_present",
            "tun_missing",
            "linux tun device is missing (/dev/net/tun)",
        )
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = capabilities;
        ok_check(
            "tun_device_present",
            "not_applicable",
            "tun device presence check is linux-specific",
        )
    }
}

fn check_cap_net_admin(capabilities: RuntimeCapabilitiesInfo) -> SelfCheckItem {
    #[cfg(target_os = "linux")]
    {
        if capabilities.has_cap_net_admin {
            return ok_check(
                "has_cap_net_admin",
                "ok",
                "linux CAP_NET_ADMIN capability is present",
            );
        }
        fail_check(
            "has_cap_net_admin",
            "cap_net_admin_missing",
            "linux CAP_NET_ADMIN capability is missing",
        )
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = capabilities;
        ok_check(
            "has_cap_net_admin",
            "not_applicable",
            "linux capability check is not applicable on this platform",
        )
    }
}

fn check_cap_bind_service(capabilities: RuntimeCapabilitiesInfo) -> SelfCheckItem {
    #[cfg(target_os = "linux")]
    {
        if capabilities.has_cap_bind_service {
            return ok_check(
                "has_cap_bind_service",
                "ok",
                "linux CAP_NET_BIND_SERVICE capability is present",
            );
        }
        fail_check(
            "has_cap_bind_service",
            "bind53_missing",
            "linux CAP_NET_BIND_SERVICE capability is missing for strict DNS mode",
        )
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = capabilities;
        ok_check(
            "has_cap_bind_service",
            "not_applicable",
            "linux capability check is not applicable on this platform",
        )
    }
}

fn check_tunnel_config(enabled: bool, config_ok: bool) -> SelfCheckItem {
    if !enabled {
        return ok_check(
            "tunnel_config_ok",
            "disabled",
            "full-tunnel mode is disabled",
        );
    }
    if config_ok {
        return ok_check(
            "tunnel_config_ok",
            "ok",
            "full-tunnel mode configuration is valid",
        );
    }
    fail_check(
        "tunnel_config_ok",
        "tunnel_config_invalid",
        "full-tunnel mode configuration is invalid",
    )
}

fn check_dns_remote_strict_support(
    capabilities: DnsCapabilitiesInfo,
    detail_safe: &str,
) -> SelfCheckItem {
    if capabilities.remote_strict_supported {
        return ok_check("dns_remote_strict_supported", "ok", detail_safe);
    }
    fail_check(
        "dns_remote_strict_supported",
        "dns_strict_unsupported",
        detail_safe,
    )
}

fn current_version_info() -> VersionInfo {
    VersionInfo {
        app: env!("CARGO_PKG_VERSION").to_string(),
        protocol: PROTOCOL_VERSION.to_string(),
        git: option_env!("ANIMUS_GIT_COMMIT")
            .or(option_env!("GIT_COMMIT"))
            .or(option_env!("VERGEN_GIT_SHA"))
            .map(|value| value.to_string()),
    }
}

fn current_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: OS.to_string(),
        arch: ARCH.to_string(),
    }
}

fn ok_check(
    name: impl Into<String>,
    code: impl Into<String>,
    detail_safe: impl AsRef<str>,
) -> SelfCheckItem {
    SelfCheckItem {
        name: name.into(),
        ok: true,
        code: code.into(),
        detail_safe: redaction_guard(detail_safe.as_ref()),
    }
}

fn fail_check(
    name: impl Into<String>,
    code: impl Into<String>,
    detail_safe: impl AsRef<str>,
) -> SelfCheckItem {
    SelfCheckItem {
        name: name.into(),
        ok: false,
        code: code.into(),
        detail_safe: redaction_guard(detail_safe.as_ref()),
    }
}

fn loopback_datagram_addr(relay_addr: SocketAddr) -> SocketAddr {
    match relay_addr {
        SocketAddr::V4(_) => "127.0.0.1:0"
            .parse()
            .expect("static ipv4 loopback socket must parse"),
        SocketAddr::V6(_) => "[::1]:0"
            .parse()
            .expect("static ipv6 loopback socket must parse"),
    }
}

fn decode_hex32(value: &str) -> Option<[u8; 32]> {
    if value.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (index, pair) in value.as_bytes().chunks(2).enumerate() {
        let hi = (pair[0] as char).to_digit(16)?;
        let lo = (pair[1] as char).to_digit(16)?;
        out[index] = ((hi << 4) | lo) as u8;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::redaction_guard;

    #[test]
    fn redaction_guard_hides_token_and_invite_like_values() {
        let invite = "animus://invite/v1/ns.secret.1700000000";
        let token = "animus://rtok/v1/payload.sig";
        assert!(redaction_guard(invite).contains("[REDACTED]"));
        assert!(redaction_guard(token).contains("[REDACTED]"));
        assert_eq!(redaction_guard("relay-eu"), "relay-eu");
    }
}
