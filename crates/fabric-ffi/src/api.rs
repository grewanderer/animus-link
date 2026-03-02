#[cfg(target_os = "android")]
use std::net::SocketAddr;
#[cfg(target_os = "android")]
use std::sync::{Mutex, OnceLock};

use crate::errors::FabricError;

const INVITE_PREFIX: &str = "animus://invite/";
const INVITE_MIN_CODE_LEN: usize = 8;
const INVITE_MAX_LEN: usize = 512;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Status {
    pub running: bool,
    pub peer_count: u32,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TunnelRuntimeStatus {
    pub enabled: bool,
    pub connected: bool,
    pub state: String,
    pub fail_mode: String,
    pub dns_mode: String,
    pub prewarm_state: String,
    pub last_error_code: String,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub reconnects: u32,
    pub handshake_ms: u32,
}

pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub fn status() -> Status {
    Status {
        running: false,
        peer_count: 0,
        path: "unknown".to_string(),
    }
}

pub fn invite_create() -> String {
    // Deterministic placeholder while invite service is not wired in yet.
    format!("{INVITE_PREFIX}mvp00001")
}

pub fn invite_join(invite: String) -> Result<(), FabricError> {
    validate_invite(invite.as_str())
}

#[allow(clippy::too_many_arguments)]
pub fn android_tunnel_enable(
    tun_fd: i32,
    relay_addr: String,
    relay_token: String,
    relay_ttl_secs: u32,
    conn_id: u64,
    gateway_service: String,
    peer_id: String,
    fail_mode: String,
    dns_mode: String,
    protected_endpoints: Vec<String>,
    exclude_cidrs: Vec<String>,
    allow_lan: bool,
    mtu: u16,
    max_ip_packet_bytes: u32,
) -> Result<TunnelRuntimeStatus, FabricError> {
    #[cfg(target_os = "android")]
    {
        use link_tunnel_client::{
            start_android_tunnel_client, TunnelClientConfig, TunnelDnsMode, TunnelFailMode,
            TunnelState, TunnelTiming,
        };

        if tun_fd < 0
            || relay_token.trim().is_empty()
            || gateway_service.trim().is_empty()
            || peer_id.trim().is_empty()
            || relay_addr.trim().is_empty()
            || max_ip_packet_bytes == 0
            || mtu == 0
        {
            return Err(FabricError::InvalidInput);
        }

        let relay_addr = relay_addr
            .parse::<SocketAddr>()
            .map_err(|_| FabricError::InvalidInput)?;
        let fail_mode = parse_fail_mode(fail_mode.as_str())?;
        let dns_mode = parse_dns_mode(dns_mode.as_str())?;
        let protected_endpoints = if protected_endpoints.is_empty() {
            vec![relay_addr]
        } else {
            protected_endpoints
                .iter()
                .map(|value| {
                    value
                        .parse::<SocketAddr>()
                        .map_err(|_| FabricError::InvalidInput)
                })
                .collect::<Result<Vec<_>, _>>()?
        };

        let config = TunnelClientConfig {
            relay_addr,
            protected_endpoints,
            relay_token,
            relay_ttl_secs: relay_ttl_secs.max(1),
            conn_id,
            gateway_service,
            peer_id,
            fail_mode,
            dns_mode,
            exclude_cidrs,
            allow_lan,
            max_ip_packet_bytes: max_ip_packet_bytes as usize,
            mtu,
            timing: TunnelTiming::default(),
        };

        let mut runtime = android_tunnel_runtime()
            .lock()
            .map_err(|_| FabricError::Internal)?;
        if let Some(mut existing) = runtime.handle.take() {
            existing.stop();
        }

        let _entered = async_runtime().enter();
        let handle =
            start_android_tunnel_client(config, tun_fd).map_err(map_tunnel_error_to_fabric)?;
        let snapshot = handle.snapshot();
        runtime.handle = Some(handle);
        runtime.fail_mode = fail_mode_label(fail_mode).to_string();
        runtime.dns_mode = dns_mode_label(dns_mode).to_string();

        Ok(snapshot_to_runtime_status(
            true,
            runtime.fail_mode.as_str(),
            runtime.dns_mode.as_str(),
            snapshot.state,
            snapshot.connected,
            snapshot.last_error_code.as_deref(),
            snapshot.counters.tunnel_bytes_in,
            snapshot.counters.tunnel_bytes_out,
            snapshot.reconnects,
            snapshot.handshake_ms.unwrap_or(0),
        ))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (
            tun_fd,
            relay_addr,
            relay_token,
            relay_ttl_secs,
            conn_id,
            gateway_service,
            peer_id,
            fail_mode,
            dns_mode,
            protected_endpoints,
            exclude_cidrs,
            allow_lan,
            mtu,
            max_ip_packet_bytes,
        );
        Err(FabricError::NotReady)
    }
}

pub fn android_tunnel_status() -> TunnelRuntimeStatus {
    #[cfg(target_os = "android")]
    {
        use link_tunnel_client::TunnelState;

        if let Ok(mut runtime) = android_tunnel_runtime().lock() {
            if let Some(handle) = runtime.handle.as_ref() {
                let snapshot = handle.snapshot();
                let status = snapshot_to_runtime_status(
                    true,
                    runtime.fail_mode.as_str(),
                    runtime.dns_mode.as_str(),
                    snapshot.state,
                    snapshot.connected,
                    snapshot.last_error_code.as_deref(),
                    snapshot.counters.tunnel_bytes_in,
                    snapshot.counters.tunnel_bytes_out,
                    snapshot.reconnects,
                    snapshot.handshake_ms.unwrap_or(0),
                );
                if matches!(snapshot.state, TunnelState::Disabled) {
                    runtime.handle = None;
                }
                return status;
            }
            return disabled_tunnel_status(
                runtime.fail_mode.as_str(),
                runtime.dns_mode.as_str(),
                "",
            );
        }
        return disabled_tunnel_status("open_fast", "remote_best_effort", "internal_error");
    }
    #[cfg(not(target_os = "android"))]
    {
        disabled_tunnel_status("open_fast", "remote_best_effort", "not_ready")
    }
}

pub fn android_tunnel_disable() -> TunnelRuntimeStatus {
    #[cfg(target_os = "android")]
    {
        if let Ok(mut runtime) = android_tunnel_runtime().lock() {
            if let Some(mut handle) = runtime.handle.take() {
                handle.stop();
            }
            return disabled_tunnel_status(
                runtime.fail_mode.as_str(),
                runtime.dns_mode.as_str(),
                "",
            );
        }
        return disabled_tunnel_status("open_fast", "remote_best_effort", "internal_error");
    }
    #[cfg(not(target_os = "android"))]
    {
        disabled_tunnel_status("open_fast", "remote_best_effort", "not_ready")
    }
}

fn validate_invite(invite: &str) -> Result<(), FabricError> {
    if invite.is_empty() || invite.len() > INVITE_MAX_LEN {
        return Err(FabricError::InvalidInput);
    }
    let code = invite
        .strip_prefix(INVITE_PREFIX)
        .ok_or(FabricError::InvalidInput)?;
    if code.len() < INVITE_MIN_CODE_LEN {
        return Err(FabricError::InvalidInput);
    }
    if !code
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err(FabricError::InvalidInput);
    }
    Ok(())
}

fn disabled_tunnel_status(
    fail_mode: &str,
    dns_mode: &str,
    last_error_code: &str,
) -> TunnelRuntimeStatus {
    TunnelRuntimeStatus {
        enabled: false,
        connected: false,
        state: "disabled".to_string(),
        fail_mode: fail_mode.to_string(),
        dns_mode: dns_mode.to_string(),
        prewarm_state: "idle".to_string(),
        last_error_code: last_error_code.to_string(),
        bytes_in: 0,
        bytes_out: 0,
        reconnects: 0,
        handshake_ms: 0,
    }
}

#[cfg(target_os = "android")]
fn snapshot_to_runtime_status(
    enabled: bool,
    fail_mode: &str,
    dns_mode: &str,
    state: link_tunnel_client::TunnelState,
    connected: bool,
    last_error_code: Option<&str>,
    bytes_in: u64,
    bytes_out: u64,
    reconnects: u32,
    handshake_ms: u32,
) -> TunnelRuntimeStatus {
    TunnelRuntimeStatus {
        enabled,
        connected,
        state: tunnel_state_label(state).to_string(),
        fail_mode: fail_mode.to_string(),
        dns_mode: dns_mode.to_string(),
        prewarm_state: "idle".to_string(),
        last_error_code: last_error_code.unwrap_or_default().to_string(),
        bytes_in,
        bytes_out,
        reconnects,
        handshake_ms,
    }
}

#[cfg(target_os = "android")]
fn tunnel_state_label(value: link_tunnel_client::TunnelState) -> &'static str {
    use link_tunnel_client::TunnelState;
    match value {
        TunnelState::Disabled => "disabled",
        TunnelState::Enabling => "enabling",
        TunnelState::Connecting => "connecting",
        TunnelState::Connected => "connected",
        TunnelState::Degraded => "degraded",
        TunnelState::Disabling => "disabling",
    }
}

#[cfg(target_os = "android")]
fn parse_fail_mode(value: &str) -> Result<link_tunnel_client::TunnelFailMode, FabricError> {
    use link_tunnel_client::TunnelFailMode;
    match value.trim().to_ascii_lowercase().as_str() {
        "open_fast" => Ok(TunnelFailMode::OpenFast),
        "closed" => Ok(TunnelFailMode::Closed),
        _ => Err(FabricError::InvalidInput),
    }
}

#[cfg(target_os = "android")]
fn fail_mode_label(value: link_tunnel_client::TunnelFailMode) -> &'static str {
    use link_tunnel_client::TunnelFailMode;
    match value {
        TunnelFailMode::OpenFast => "open_fast",
        TunnelFailMode::Closed => "closed",
    }
}

#[cfg(target_os = "android")]
fn parse_dns_mode(value: &str) -> Result<link_tunnel_client::TunnelDnsMode, FabricError> {
    use link_tunnel_client::TunnelDnsMode;
    match value.trim().to_ascii_lowercase().as_str() {
        "remote_best_effort" | "remote" => Ok(TunnelDnsMode::RemoteBestEffort),
        "remote_strict" => Ok(TunnelDnsMode::RemoteStrict),
        "system" => Ok(TunnelDnsMode::System),
        _ => Err(FabricError::InvalidInput),
    }
}

#[cfg(target_os = "android")]
fn dns_mode_label(value: link_tunnel_client::TunnelDnsMode) -> &'static str {
    use link_tunnel_client::TunnelDnsMode;
    match value {
        TunnelDnsMode::RemoteBestEffort => "remote_best_effort",
        TunnelDnsMode::RemoteStrict => "remote_strict",
        TunnelDnsMode::System => "system",
    }
}

#[cfg(target_os = "android")]
fn map_tunnel_error_to_fabric(error: link_tunnel_client::TunnelClientError) -> FabricError {
    use link_tunnel_client::TunnelClientError;
    match error {
        TunnelClientError::InvalidConfig(_) => FabricError::InvalidInput,
        TunnelClientError::Unsupported => FabricError::NotReady,
        TunnelClientError::Io(_) | TunnelClientError::Route(_) | TunnelClientError::Session(_) => {
            FabricError::Internal
        }
    }
}

#[cfg(target_os = "android")]
struct AndroidTunnelRuntime {
    handle: Option<link_tunnel_client::TunnelClientHandle>,
    fail_mode: String,
    dns_mode: String,
}

#[cfg(target_os = "android")]
impl Default for AndroidTunnelRuntime {
    fn default() -> Self {
        Self {
            handle: None,
            fail_mode: "open_fast".to_string(),
            dns_mode: "remote_best_effort".to_string(),
        }
    }
}

#[cfg(target_os = "android")]
fn android_tunnel_runtime() -> &'static Mutex<AndroidTunnelRuntime> {
    static RUNTIME: OnceLock<Mutex<AndroidTunnelRuntime>> = OnceLock::new();
    RUNTIME.get_or_init(|| Mutex::new(AndroidTunnelRuntime::default()))
}

#[cfg(target_os = "android")]
fn async_runtime() -> &'static tokio::runtime::Runtime {
    static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("android ffi runtime must initialize")
    })
}

#[cfg(test)]
mod tests {
    use crate::errors::FabricError;

    use super::{
        android_tunnel_status, invite_create, invite_join, status, version, TunnelRuntimeStatus,
    };

    #[test]
    fn version_is_non_empty() {
        assert!(!version().trim().is_empty());
    }

    #[test]
    fn status_defaults_are_deterministic() {
        let current = status();
        assert!(!current.running);
        assert_eq!(current.peer_count, 0);
        assert_eq!(current.path, "unknown");
    }

    #[test]
    fn invite_join_rejects_invalid_input() {
        let bad_inputs = [
            "",
            "invite://wrong-prefix/abc12345",
            "animus://invite/short",
            "animus://invite/not valid spaces",
        ];

        for invite in bad_inputs {
            let error = invite_join(invite.to_string()).unwrap_err();
            assert_eq!(error, FabricError::InvalidInput);
            assert_eq!(error.code(), "InvalidInput");
        }
    }

    #[test]
    fn invite_create_returns_joinable_value() {
        let invite = invite_create();
        invite_join(invite).expect("generated invite must validate");
    }

    #[test]
    fn tunnel_status_defaults_are_safe() {
        let status: TunnelRuntimeStatus = android_tunnel_status();
        assert!(!status.enabled);
        assert!(!status.connected);
        assert_eq!(status.state, "disabled");
        assert_eq!(status.prewarm_state, "idle");
    }
}
