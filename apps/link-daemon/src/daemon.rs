use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr, TcpListener as StdTcpListener},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use fabric_crypto::{simple_hash32, DeterministicPrimitives};
use fabric_security::redact::Secret;
use fabric_session::{
    limits::PreAuthLimits,
    mux::{decode_mux_frame, encode_mux_frame, MuxFrame},
    ratelimit::{PreAuthGate, SystemClock as RateLimitClock, TokenBucketPreAuthGate},
    relay_channel::RelayDatagramChannel,
    secure_session::{SecureSession, SessionEvent},
    state_machine::{SessionState, SessionStateMachine, SystemClock as SessionClock},
};
use fabric_tunnel_proto::{
    decode_message as decode_tunnel_message, encode_message as encode_tunnel_message,
    TunnelControl, TunnelLimits, TunnelMessage,
};
use link_gateway::{GatewayConfig, GatewayCounters, GatewayEngine};
use link_tunnel_client::{
    detect_dns_capabilities, start_default_tunnel_client_with_prewarmer, start_session_prewarmer,
    SessionPrewarmSnapshot as ClientSessionPrewarmSnapshot,
    SessionPrewarmState as ClientSessionPrewarmState, SessionPrewarmerHandle, TunnelClientConfig,
    TunnelClientCounters, TunnelClientHandle, TunnelDnsCapabilities as ClientTunnelDnsCapabilities,
    TunnelDnsMode as ClientTunnelDnsMode, TunnelFailMode as ClientTunnelFailMode,
    TunnelState as ClientTunnelState, TunnelTiming,
};
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::mpsc,
    time::{interval, Duration},
};

use crate::{
    diagnostics::{
        DiagnosticsCounters, DiagnosticsInput, DnsCapabilitiesInfo, MobilePolicy,
        RecentErrorSummary, RuntimeCapabilitiesInfo, SelfCheckInputs,
    },
    errors::{ApiError, ApiErrorCode},
    invite::{generate_invite, now_unix_secs, parse_invite},
    namespace_store::NamespaceStore,
    relay_token::RelayTokenIssuer,
};

const SESSION_PROLOGUE: &[u8] = b"animus/fabric/v1/relay-first";
const STREAM_IO_CHUNK: usize = 1024;
const STREAM_QUEUE_CAPACITY: usize = 64;
const MAX_TRACKED_ERROR_CODES: usize = 32;
const DEFAULT_GATEWAY_SERVICE: &str = "gateway-exit";
const TUNNEL_STREAM_SERVICE: &str = "ip-tunnel";
const GATEWAY_EVENT_POLL_MS: u64 = 50;

#[derive(Debug, Clone, Serialize)]
pub struct StatusResponse {
    pub running: bool,
    pub peer_count: u32,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct InviteCreateResponse {
    pub invite: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InviteJoinRequest {
    pub invite: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExposeRequest {
    pub service_name: String,
    pub local_addr: String,
    pub allowed_peers: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExposeResponse {
    pub stream_id: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GatewayMode {
    Exit,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GatewayExposeRequest {
    pub mode: GatewayMode,
    pub listen: Option<String>,
    pub nat: bool,
    pub allowed_peers: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GatewayExposeResponse {
    pub mode: GatewayMode,
    pub gateway_service: String,
    pub nat: bool,
    pub allowed_peer_count: u32,
    pub listen_configured: bool,
    pub ready: bool,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TunnelFailMode {
    #[default]
    OpenFast,
    Closed,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TunnelDnsMode {
    #[default]
    #[serde(alias = "remote")]
    RemoteBestEffort,
    RemoteStrict,
    System,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct TunnelDnsCapabilities {
    pub remote_best_effort_supported: bool,
    pub remote_strict_supported: bool,
    pub can_bind_low_port: bool,
    pub can_set_system_dns: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TunnelEnableRequest {
    pub gateway_service: String,
    #[serde(default)]
    pub fail_mode: TunnelFailMode,
    #[serde(default)]
    pub dns_mode: TunnelDnsMode,
    #[serde(default)]
    pub exclude_cidrs: Vec<String>,
    #[serde(default)]
    pub allow_lan: bool,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TunnelState {
    Disabled,
    Enabling,
    Connecting,
    Connected,
    Degraded,
    Disabling,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PrewarmState {
    Idle,
    Warming,
    Ready,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub struct TunnelStatusResponse {
    pub enabled: bool,
    pub state: TunnelState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gateway: Option<String>,
    pub fail_mode: TunnelFailMode,
    pub dns_mode: TunnelDnsMode,
    pub dns_capabilities: TunnelDnsCapabilities,
    pub runtime_capabilities: RuntimeCapabilitiesInfo,
    pub prewarm_state: PrewarmState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prewarm_last_error_code: Option<String>,
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error_code: Option<String>,
    pub bytes_in: u64,
    pub bytes_out: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub handshake_ms: Option<u32>,
    pub reconnects: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConnectRequest {
    pub service_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectResponse {
    pub connection_id: u64,
    pub stream_id: u32,
    pub local_addr: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub relay_configured: bool,
}

#[derive(Debug, Clone)]
pub struct RelayConfig {
    pub relay_addr: SocketAddr,
    pub relay_name: String,
    pub token_ttl_secs: u32,
    pub token_issuer: Arc<RelayTokenIssuer>,
}

#[derive(Debug, Clone)]
struct GatewayExitConfig {
    _mode: GatewayMode,
    _listen: Option<SocketAddr>,
    _nat: bool,
    allowed_peers: Vec<String>,
    conn_id: u64,
}

#[derive(Debug, Clone)]
struct TunnelRuntime {
    enabled: bool,
    state: TunnelState,
    gateway: Option<String>,
    fail_mode: TunnelFailMode,
    dns_mode: TunnelDnsMode,
    prewarm_state: PrewarmState,
    prewarm_last_error_code: Option<String>,
    connected: bool,
    last_error_code: Option<String>,
    bytes_in: u64,
    bytes_out: u64,
    handshake_ms: Option<u32>,
    reconnects: u32,
    exclude_cidrs: Vec<String>,
    allow_lan: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PrewarmKey {
    relay_addr: SocketAddr,
    conn_id: u64,
    gateway_service: String,
    peer_id: String,
}

impl Default for TunnelRuntime {
    fn default() -> Self {
        Self {
            enabled: false,
            state: TunnelState::Disabled,
            gateway: None,
            fail_mode: TunnelFailMode::OpenFast,
            dns_mode: TunnelDnsMode::RemoteBestEffort,
            prewarm_state: PrewarmState::Idle,
            prewarm_last_error_code: None,
            connected: false,
            last_error_code: None,
            bytes_in: 0,
            bytes_out: 0,
            handshake_ms: None,
            reconnects: 0,
            exclude_cidrs: Vec::new(),
            allow_lan: false,
        }
    }
}

impl TunnelRuntime {
    fn status(
        &self,
        dns_capabilities: TunnelDnsCapabilities,
        runtime_capabilities: RuntimeCapabilitiesInfo,
    ) -> TunnelStatusResponse {
        TunnelStatusResponse {
            enabled: self.enabled,
            state: self.state,
            gateway: self.gateway.clone(),
            fail_mode: self.fail_mode,
            dns_mode: self.dns_mode,
            dns_capabilities,
            runtime_capabilities,
            prewarm_state: self.prewarm_state,
            prewarm_last_error_code: self.prewarm_last_error_code.clone(),
            connected: self.connected,
            last_error_code: self.last_error_code.clone(),
            bytes_in: self.bytes_in,
            bytes_out: self.bytes_out,
            handshake_ms: self.handshake_ms,
            reconnects: self.reconnects,
        }
    }

    fn config_ok(&self) -> bool {
        if !self.enabled {
            return true;
        }
        self.gateway
            .as_ref()
            .is_some_and(|service| !service.trim().is_empty())
            && self
                .exclude_cidrs
                .iter()
                .all(|cidr| parse_cidr(cidr).is_ok())
    }
}

#[derive(Debug, Clone)]
struct ServiceRecord {
    stream_id: u32,
    _local_addr: SocketAddr,
    _allowed_peers: Vec<String>,
    _conn_id: u64,
}

#[derive(Debug)]
struct ConnectionRecord {
    _stream_id: u32,
    machine: SessionStateMachine<SessionClock>,
}

#[derive(Debug, Clone, Copy)]
struct ErrorStats {
    count: u32,
    last_unix: u64,
}

#[derive(Debug, Default)]
struct ErrorLedger {
    by_code: HashMap<String, ErrorStats>,
}

impl ErrorLedger {
    fn record(&mut self, code: &str, now_unix: u64) {
        if self.by_code.len() >= MAX_TRACKED_ERROR_CODES && !self.by_code.contains_key(code) {
            let oldest = self
                .by_code
                .iter()
                .min_by_key(|(_, stats)| stats.last_unix)
                .map(|(code, _)| code.clone());
            if let Some(oldest) = oldest {
                self.by_code.remove(oldest.as_str());
            }
        }

        let entry = self.by_code.entry(code.to_string()).or_insert(ErrorStats {
            count: 0,
            last_unix: now_unix,
        });
        entry.count = entry.count.saturating_add(1);
        entry.last_unix = now_unix;
    }

    fn snapshot(&self) -> Vec<RecentErrorSummary> {
        let mut out: Vec<RecentErrorSummary> = self
            .by_code
            .iter()
            .map(|(code, stats)| RecentErrorSummary {
                code: code.clone(),
                count: stats.count,
                last_unix: stats.last_unix,
            })
            .collect();
        out.sort_by(|left, right| left.code.cmp(&right.code));
        out
    }
}

#[derive(Debug)]
pub struct LinkMetrics {
    connect_attempts_total: AtomicU64,
    connect_success_total: AtomicU64,
    connect_fail_total: AtomicU64,
    expose_attempts_total: AtomicU64,
    expose_denied_total: AtomicU64,
    handshake_failures_total: AtomicU64,
    relay_reachable: AtomicU64,
    stream_open_total: AtomicU64,
    bytes_proxied_total: AtomicU64,
    gateway_packets_in_total: AtomicU64,
    gateway_packets_out_total: AtomicU64,
    gateway_sessions_active: AtomicU64,
    gateway_sessions_evicted_total: AtomicU64,
    gateway_drops_malformed_total: AtomicU64,
    gateway_drops_quota_total: AtomicU64,
    tunnel_enabled: AtomicU64,
    tunnel_connected: AtomicU64,
    tunnel_reconnects_total: AtomicU64,
    tunnel_bytes_in_total: AtomicU64,
    tunnel_bytes_out_total: AtomicU64,
    prewarm_ready_gauge: AtomicU64,
    prewarm_attempts_total: AtomicU64,
    prewarm_fail_total: AtomicU64,
    dns_queries_total: AtomicU64,
    dns_timeouts_total: AtomicU64,
    dns_failures_total: AtomicU64,
}

impl Default for LinkMetrics {
    fn default() -> Self {
        Self::new()
    }
}

impl LinkMetrics {
    pub fn new() -> Self {
        Self {
            connect_attempts_total: AtomicU64::new(0),
            connect_success_total: AtomicU64::new(0),
            connect_fail_total: AtomicU64::new(0),
            expose_attempts_total: AtomicU64::new(0),
            expose_denied_total: AtomicU64::new(0),
            handshake_failures_total: AtomicU64::new(0),
            relay_reachable: AtomicU64::new(0),
            stream_open_total: AtomicU64::new(0),
            bytes_proxied_total: AtomicU64::new(0),
            gateway_packets_in_total: AtomicU64::new(0),
            gateway_packets_out_total: AtomicU64::new(0),
            gateway_sessions_active: AtomicU64::new(0),
            gateway_sessions_evicted_total: AtomicU64::new(0),
            gateway_drops_malformed_total: AtomicU64::new(0),
            gateway_drops_quota_total: AtomicU64::new(0),
            tunnel_enabled: AtomicU64::new(0),
            tunnel_connected: AtomicU64::new(0),
            tunnel_reconnects_total: AtomicU64::new(0),
            tunnel_bytes_in_total: AtomicU64::new(0),
            tunnel_bytes_out_total: AtomicU64::new(0),
            prewarm_ready_gauge: AtomicU64::new(0),
            prewarm_attempts_total: AtomicU64::new(0),
            prewarm_fail_total: AtomicU64::new(0),
            dns_queries_total: AtomicU64::new(0),
            dns_timeouts_total: AtomicU64::new(0),
            dns_failures_total: AtomicU64::new(0),
        }
    }

    pub fn inc_connect_attempts(&self) {
        self.connect_attempts_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_connect_success(&self) {
        self.connect_success_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_connect_fail(&self) {
        self.connect_fail_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_expose_attempts(&self) {
        self.expose_attempts_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_expose_denied(&self) {
        self.expose_denied_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_handshake_failures(&self) {
        self.handshake_failures_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn set_relay_reachable(&self, reachable: bool) {
        self.relay_reachable
            .store(if reachable { 1 } else { 0 }, Ordering::Relaxed);
    }

    pub fn inc_stream_open(&self) {
        self.stream_open_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn add_bytes_proxied(&self, bytes: usize) {
        self.bytes_proxied_total
            .fetch_add(bytes.min(u64::MAX as usize) as u64, Ordering::Relaxed);
    }

    pub fn set_gateway_counters(&self, counters: GatewayCounters) {
        self.gateway_packets_in_total
            .store(counters.packets_in, Ordering::Relaxed);
        self.gateway_packets_out_total
            .store(counters.packets_out, Ordering::Relaxed);
        self.gateway_sessions_active
            .store(counters.sessions_active, Ordering::Relaxed);
        self.gateway_sessions_evicted_total
            .store(counters.sessions_evicted, Ordering::Relaxed);
        self.gateway_drops_malformed_total
            .store(counters.drops_malformed, Ordering::Relaxed);
        self.gateway_drops_quota_total
            .store(counters.drops_quota, Ordering::Relaxed);
    }

    pub fn set_tunnel_counters(&self, counters: TunnelClientCounters) {
        self.tunnel_enabled
            .store(counters.tunnel_enabled, Ordering::Relaxed);
        self.tunnel_connected
            .store(counters.tunnel_connected, Ordering::Relaxed);
        self.tunnel_reconnects_total
            .store(counters.tunnel_reconnects_total, Ordering::Relaxed);
        self.tunnel_bytes_in_total
            .store(counters.tunnel_bytes_in, Ordering::Relaxed);
        self.tunnel_bytes_out_total
            .store(counters.tunnel_bytes_out, Ordering::Relaxed);
        self.dns_queries_total
            .store(counters.dns_queries_total, Ordering::Relaxed);
        self.dns_timeouts_total
            .store(counters.dns_timeouts_total, Ordering::Relaxed);
        self.dns_failures_total
            .store(counters.dns_failures_total, Ordering::Relaxed);
    }

    pub fn set_prewarm_counters(&self, snapshot: ClientSessionPrewarmSnapshot) {
        let ready = if snapshot.state == ClientSessionPrewarmState::Ready {
            1
        } else {
            0
        };
        self.prewarm_ready_gauge.store(ready, Ordering::Relaxed);
        self.prewarm_attempts_total
            .store(snapshot.attempts_total, Ordering::Relaxed);
        self.prewarm_fail_total
            .store(snapshot.fail_total, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> DiagnosticsCounters {
        DiagnosticsCounters {
            connect_attempts_total: self.connect_attempts_total.load(Ordering::Relaxed),
            connect_success_total: self.connect_success_total.load(Ordering::Relaxed),
            connect_fail_total: self.connect_fail_total.load(Ordering::Relaxed),
            expose_attempts_total: self.expose_attempts_total.load(Ordering::Relaxed),
            expose_denied_total: self.expose_denied_total.load(Ordering::Relaxed),
            handshake_failures_total: self.handshake_failures_total.load(Ordering::Relaxed),
            relay_reachable: self.relay_reachable.load(Ordering::Relaxed),
            stream_open_total: self.stream_open_total.load(Ordering::Relaxed),
            bytes_proxied_total: self.bytes_proxied_total.load(Ordering::Relaxed),
            gateway_packets_in_total: self.gateway_packets_in_total.load(Ordering::Relaxed),
            gateway_packets_out_total: self.gateway_packets_out_total.load(Ordering::Relaxed),
            gateway_sessions_active: self.gateway_sessions_active.load(Ordering::Relaxed),
            gateway_sessions_evicted_total: self
                .gateway_sessions_evicted_total
                .load(Ordering::Relaxed),
            gateway_drops_malformed_total: self
                .gateway_drops_malformed_total
                .load(Ordering::Relaxed),
            gateway_drops_quota_total: self.gateway_drops_quota_total.load(Ordering::Relaxed),
            tunnel_enabled: self.tunnel_enabled.load(Ordering::Relaxed),
            tunnel_connected: self.tunnel_connected.load(Ordering::Relaxed),
            tunnel_reconnects_total: self.tunnel_reconnects_total.load(Ordering::Relaxed),
            tunnel_bytes_in_total: self.tunnel_bytes_in_total.load(Ordering::Relaxed),
            tunnel_bytes_out_total: self.tunnel_bytes_out_total.load(Ordering::Relaxed),
            prewarm_ready_gauge: self.prewarm_ready_gauge.load(Ordering::Relaxed),
            prewarm_attempts_total: self.prewarm_attempts_total.load(Ordering::Relaxed),
            prewarm_fail_total: self.prewarm_fail_total.load(Ordering::Relaxed),
            dns_queries_total: self.dns_queries_total.load(Ordering::Relaxed),
            dns_timeouts_total: self.dns_timeouts_total.load(Ordering::Relaxed),
            dns_failures_total: self.dns_failures_total.load(Ordering::Relaxed),
        }
    }

    pub fn render_prometheus(&self) -> String {
        let mut out = String::new();
        append_counter(
            &mut out,
            "connect_attempts_total",
            "Total connect attempts",
            self.connect_attempts_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "connect_success_total",
            "Total successful connect operations",
            self.connect_success_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "connect_fail_total",
            "Total failed connect operations",
            self.connect_fail_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "expose_attempts_total",
            "Total expose attempts",
            self.expose_attempts_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "expose_denied_total",
            "Total expose requests denied by policy",
            self.expose_denied_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "handshake_failures_total",
            "Total handshake failures on relay path",
            self.handshake_failures_total.load(Ordering::Relaxed),
        );
        append_gauge(
            &mut out,
            "relay_reachable",
            "1 when relay path is currently reachable, 0 otherwise",
            self.relay_reachable.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "stream_open_total",
            "Total fabric streams opened",
            self.stream_open_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "bytes_proxied_total",
            "Total proxied payload bytes",
            self.bytes_proxied_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "gateway_packets_in_total",
            "Total tunnel packets accepted by gateway engine",
            self.gateway_packets_in_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "gateway_packets_out_total",
            "Total tunnel packets emitted by gateway engine",
            self.gateway_packets_out_total.load(Ordering::Relaxed),
        );
        append_gauge(
            &mut out,
            "gateway_sessions_active",
            "Active gateway NAT sessions",
            self.gateway_sessions_active.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "gateway_sessions_evicted_total",
            "Gateway sessions evicted due to bounds",
            self.gateway_sessions_evicted_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "gateway_drops_malformed_total",
            "Gateway packets dropped as malformed",
            self.gateway_drops_malformed_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "gateway_drops_quota_total",
            "Gateway packets dropped by quota or bounds",
            self.gateway_drops_quota_total.load(Ordering::Relaxed),
        );
        append_gauge(
            &mut out,
            "tunnel_enabled",
            "1 when client full tunnel is enabled",
            self.tunnel_enabled.load(Ordering::Relaxed),
        );
        append_gauge(
            &mut out,
            "tunnel_connected",
            "1 when client full tunnel overlay is connected",
            self.tunnel_connected.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "tunnel_reconnects_total",
            "Total client full-tunnel reconnect attempts",
            self.tunnel_reconnects_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "tunnel_bytes_in_total",
            "Total inbound bytes delivered from tunnel overlay",
            self.tunnel_bytes_in_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "tunnel_bytes_out_total",
            "Total outbound bytes sent into tunnel overlay",
            self.tunnel_bytes_out_total.load(Ordering::Relaxed),
        );
        append_gauge(
            &mut out,
            "prewarm_ready_gauge",
            "1 when prewarmed secure session is ready to reuse",
            self.prewarm_ready_gauge.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "prewarm_attempts_total",
            "Total prewarm session establishment attempts",
            self.prewarm_attempts_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "prewarm_fail_total",
            "Total prewarm session establishment or keepalive failures",
            self.prewarm_fail_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "dns_queries_total",
            "Total DNS queries received by local tunnel DNS stub",
            self.dns_queries_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "dns_timeouts_total",
            "Total DNS queries that timed out waiting for tunnel responses",
            self.dns_timeouts_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "dns_failures_total",
            "Total tunnel DNS configuration or forwarding failures",
            self.dns_failures_total.load(Ordering::Relaxed),
        );
        out
    }
}

fn append_counter(out: &mut String, name: &str, help: &str, value: u64) {
    out.push_str(&format!("# HELP {name} {help}\n"));
    out.push_str(&format!("# TYPE {name} counter\n"));
    out.push_str(&format!("{name} {value}\n"));
}

fn append_gauge(out: &mut String, name: &str, help: &str, value: u64) {
    out.push_str(&format!("# HELP {name} {help}\n"));
    out.push_str(&format!("# TYPE {name} gauge\n"));
    out.push_str(&format!("{name} {value}\n"));
}

pub struct LinkDaemon {
    namespace_store: NamespaceStore,
    relay: Option<RelayConfig>,
    services: HashMap<String, ServiceRecord>,
    gateway_exit: Option<GatewayExitConfig>,
    tunnel: TunnelRuntime,
    tunnel_client: Option<TunnelClientHandle>,
    prewarmer: Option<SessionPrewarmerHandle>,
    prewarm_key: Option<PrewarmKey>,
    connections: HashMap<u64, ConnectionRecord>,
    next_stream_id: u32,
    next_connection_id: u64,
    metrics: Arc<LinkMetrics>,
    api_bind: SocketAddr,
    started_unix: u64,
    token_issuer_configured: bool,
    recent_errors: ErrorLedger,
}

impl LinkDaemon {
    pub fn new(state_file: &std::path::Path, relay: Option<RelayConfig>) -> Result<Self, ApiError> {
        let metrics = Arc::new(LinkMetrics::new());
        metrics.set_relay_reachable(relay.is_some());
        Ok(Self {
            namespace_store: NamespaceStore::load_or_create(state_file)?,
            relay,
            services: HashMap::new(),
            gateway_exit: None,
            tunnel: TunnelRuntime::default(),
            tunnel_client: None,
            prewarmer: None,
            prewarm_key: None,
            connections: HashMap::new(),
            next_stream_id: 1,
            next_connection_id: 1,
            metrics,
            api_bind: "127.0.0.1:0"
                .parse()
                .expect("static loopback socket must parse"),
            started_unix: now_unix_secs(),
            token_issuer_configured: false,
            recent_errors: ErrorLedger::default(),
        })
    }

    pub fn configure_runtime(&mut self, api_bind: SocketAddr, token_issuer_configured: bool) {
        self.api_bind = api_bind;
        self.token_issuer_configured = token_issuer_configured || self.relay.is_some();
    }

    pub fn status(&mut self) -> StatusResponse {
        self.refresh_tunnel_from_client();
        self.refresh_prewarm_from_handle();
        let now = now_unix_secs();
        StatusResponse {
            running: true,
            peer_count: self.namespace_store.namespace_count(now),
            path: if self.relay.is_some() {
                "relay".to_string()
            } else {
                "unknown".to_string()
            },
        }
    }

    pub fn health(&self) -> HealthResponse {
        HealthResponse {
            ok: true,
            relay_configured: self.relay.is_some(),
        }
    }

    pub fn metrics(&mut self) -> String {
        self.refresh_tunnel_from_client();
        self.refresh_prewarm_from_handle();
        self.metrics.render_prometheus()
    }

    fn current_dns_capabilities(&self) -> TunnelDnsCapabilities {
        to_daemon_dns_capabilities(detect_dns_capabilities())
    }

    fn current_runtime_capabilities(&self) -> RuntimeCapabilitiesInfo {
        detect_tunnel_runtime_capabilities()
    }

    pub fn self_check_inputs(&mut self) -> SelfCheckInputs {
        self.refresh_tunnel_from_client();
        self.refresh_prewarm_from_handle();
        let now = now_unix_secs();
        let dns_capabilities = self.current_dns_capabilities();
        let runtime_capabilities = self.current_runtime_capabilities();
        let (namespace_store_rw_ok, namespace_count) = match self.namespace_store.health_check(now)
        {
            Ok(count) => (true, count),
            Err(_) => (false, self.namespace_store.namespace_count(now)),
        };
        SelfCheckInputs {
            api_bind: self.api_bind,
            relay_addr: self.relay.as_ref().map(|relay| relay.relay_addr),
            relay_name: self.relay.as_ref().map(|relay| relay.relay_name.clone()),
            token_issuer: self
                .relay
                .as_ref()
                .map(|relay| Arc::clone(&relay.token_issuer)),
            token_issuer_configured: self.token_issuer_configured,
            namespace_count,
            namespace_store_rw_ok,
            tunnel_supported: platform_tunnel_supported(),
            tunnel_enabled: self.tunnel.enabled,
            tunnel_dns_mode: tunnel_dns_mode_label(self.tunnel.dns_mode).to_string(),
            tunnel_dns_capabilities: to_self_check_dns_capabilities(dns_capabilities),
            tunnel_dns_capability_detail: dns_capability_detail_safe(dns_capabilities),
            runtime_capabilities,
            tunnel_config_ok: self.tunnel.config_ok()
                && (!self.tunnel.enabled
                    || self
                        .tunnel
                        .gateway
                        .as_deref()
                        .is_some_and(|service| service != DEFAULT_GATEWAY_SERVICE)
                    || self.gateway_exit.is_some()),
        }
    }

    pub fn diagnostics_input(&mut self) -> DiagnosticsInput {
        self.refresh_tunnel_from_client();
        self.refresh_prewarm_from_handle();
        let now = now_unix_secs();
        DiagnosticsInput {
            relay_configured: self.relay.is_some(),
            relay_name: self.relay.as_ref().map(|relay| relay.relay_name.clone()),
            token_issuer_configured: self.token_issuer_configured,
            namespace_count: self.namespace_store.namespace_count(now),
            counters: self.metrics.snapshot(),
            recent_errors: self.recent_errors.snapshot(),
            started_unix: self.started_unix,
            mobile_policy: mobile_policy(),
        }
    }

    pub fn record_error(&mut self, error_code: ApiErrorCode) {
        self.record_error_code(error_code_label(error_code));
    }

    pub fn record_error_code(&mut self, error_code: &str) {
        self.recent_errors.record(error_code, now_unix_secs());
    }

    pub fn invite_create(&mut self) -> Result<InviteCreateResponse, ApiError> {
        let now = now_unix_secs();
        let invite = generate_invite(now);
        self.namespace_store.upsert_from_invite(&invite, now)?;
        Ok(InviteCreateResponse {
            invite: invite.to_string_repr(),
        })
    }

    pub fn invite_join(&mut self, request: InviteJoinRequest) -> Result<(), ApiError> {
        let now = now_unix_secs();
        let invite = parse_invite(request.invite.as_str(), now)?;
        self.namespace_store.upsert_from_invite(&invite, now)?;
        Ok(())
    }

    pub fn expose(&mut self, request: ExposeRequest) -> Result<ExposeResponse, ApiError> {
        validate_service_name(request.service_name.as_str())?;

        let local_addr: SocketAddr = request
            .local_addr
            .parse()
            .map_err(|_| ApiError::new(ApiErrorCode::InvalidInput, "invalid local_addr"))?;
        let allowed_peers = request
            .allowed_peers
            .ok_or_else(|| ApiError::new(ApiErrorCode::Denied, "explicit allow policy required"))?;
        if allowed_peers.is_empty() || allowed_peers.iter().any(|peer| peer.trim().is_empty()) {
            return Err(ApiError::new(
                ApiErrorCode::Denied,
                "explicit allow policy required",
            ));
        }

        if self.services.contains_key(request.service_name.as_str()) {
            return Err(ApiError::new(
                ApiErrorCode::Conflict,
                "service already exposed",
            ));
        }

        let stream_id = self.next_stream_id;
        self.next_stream_id = self.next_stream_id.saturating_add(1);

        let namespace_id = self.active_namespace_id();
        let conn_id = derive_conn_id(namespace_id.as_deref(), request.service_name.as_str());
        let service_name = request.service_name;

        self.services.insert(
            service_name.clone(),
            ServiceRecord {
                stream_id,
                _local_addr: local_addr,
                _allowed_peers: allowed_peers,
                _conn_id: conn_id,
            },
        );

        if let Some(relay) = self.relay.clone() {
            let relay_token = self.mint_relay_token(
                relay.relay_name.as_str(),
                namespace_id.as_deref().unwrap_or("anonymous"),
                relay.token_ttl_secs,
            )?;
            let metrics = Arc::clone(&self.metrics);
            if tokio::runtime::Handle::try_current().is_ok() {
                tokio::spawn(async move {
                    run_expose_worker(
                        service_name,
                        local_addr,
                        relay,
                        conn_id,
                        relay_token,
                        metrics,
                    )
                    .await;
                });
            }
        }

        Ok(ExposeResponse { stream_id })
    }

    pub fn gateway_expose(
        &mut self,
        request: GatewayExposeRequest,
    ) -> Result<GatewayExposeResponse, ApiError> {
        if !request.nat {
            return Err(ApiError::new(
                ApiErrorCode::InvalidInput,
                "exit gateway requires nat=true",
            ));
        }
        let allowed_peers = request
            .allowed_peers
            .ok_or_else(|| ApiError::new(ApiErrorCode::Denied, "explicit allow policy required"))?;
        if allowed_peers.is_empty() || allowed_peers.iter().any(|peer| peer.trim().is_empty()) {
            return Err(ApiError::new(
                ApiErrorCode::Denied,
                "explicit allow policy required",
            ));
        }
        let listen = request
            .listen
            .as_deref()
            .map(str::parse)
            .transpose()
            .map_err(|_| ApiError::new(ApiErrorCode::InvalidInput, "invalid listen address"))?;
        let namespace_id = self.active_namespace_id();
        let conn_id = derive_conn_id(namespace_id.as_deref(), DEFAULT_GATEWAY_SERVICE);
        let stream_id = self.next_stream_id;
        self.next_stream_id = self.next_stream_id.saturating_add(1);
        self.services.insert(
            DEFAULT_GATEWAY_SERVICE.to_string(),
            ServiceRecord {
                stream_id,
                _local_addr: listen.unwrap_or_else(|| {
                    "0.0.0.0:0"
                        .parse()
                        .expect("static socket literal must parse")
                }),
                _allowed_peers: allowed_peers.clone(),
                _conn_id: conn_id,
            },
        );

        self.gateway_exit = Some(GatewayExitConfig {
            _mode: request.mode.clone(),
            _listen: listen,
            _nat: request.nat,
            allowed_peers: allowed_peers.clone(),
            conn_id,
        });

        if let (Some(relay), Some(gateway)) = (self.relay.clone(), self.gateway_exit.clone()) {
            let relay_token = self.mint_relay_token(
                relay.relay_name.as_str(),
                namespace_id.as_deref().unwrap_or("anonymous"),
                relay.token_ttl_secs,
            )?;
            let metrics = Arc::clone(&self.metrics);
            if tokio::runtime::Handle::try_current().is_ok() {
                tokio::spawn(async move {
                    run_gateway_worker(relay, gateway, relay_token, metrics).await;
                });
            }
        }

        Ok(GatewayExposeResponse {
            mode: request.mode,
            gateway_service: DEFAULT_GATEWAY_SERVICE.to_string(),
            nat: request.nat,
            allowed_peer_count: allowed_peers.len().min(u32::MAX as usize) as u32,
            listen_configured: listen.is_some(),
            ready: self.relay.is_some(),
        })
    }

    pub fn tunnel_enable(
        &mut self,
        request: TunnelEnableRequest,
    ) -> Result<TunnelStatusResponse, ApiError> {
        validate_service_name(request.gateway_service.as_str())?;
        for cidr in &request.exclude_cidrs {
            parse_cidr(cidr)?;
        }

        if let Some(mut existing) = self.tunnel_client.take() {
            existing.stop();
        }

        self.tunnel.enabled = true;
        self.tunnel.gateway = Some(request.gateway_service.clone());
        self.tunnel.fail_mode = request.fail_mode;
        self.tunnel.dns_mode = request.dns_mode;
        self.tunnel.exclude_cidrs = request.exclude_cidrs.clone();
        self.tunnel.allow_lan = request.allow_lan;
        self.tunnel.last_error_code = None;
        self.tunnel.connected = false;
        self.tunnel.handshake_ms = None;
        self.tunnel.reconnects = 0;
        self.tunnel.bytes_in = 0;
        self.tunnel.bytes_out = 0;
        self.tunnel.state = TunnelState::Enabling;
        self.metrics.set_tunnel_counters(TunnelClientCounters {
            tunnel_enabled: 1,
            ..TunnelClientCounters::default()
        });

        let Some(relay) = self.relay.clone() else {
            self.tunnel.last_error_code = Some("relay_not_configured".to_string());
            self.tunnel.state = TunnelState::Degraded;
            return Ok(self.tunnel.status(
                self.current_dns_capabilities(),
                self.current_runtime_capabilities(),
            ));
        };

        let runtime_capabilities = self.current_runtime_capabilities();
        if let Some(error_code) = tunnel_runtime_error_code(request.dns_mode, runtime_capabilities)
        {
            self.tunnel.last_error_code = Some(error_code.to_string());
            self.tunnel.state = TunnelState::Degraded;
            self.record_error_code(error_code);
            return Ok(self
                .tunnel
                .status(self.current_dns_capabilities(), runtime_capabilities));
        };

        let namespace_id = self.active_namespace_id();
        let conn_id = derive_conn_id(namespace_id.as_deref(), request.gateway_service.as_str());
        let relay_token = self.mint_relay_token(
            relay.relay_name.as_str(),
            namespace_id.as_deref().unwrap_or("anonymous"),
            relay.token_ttl_secs,
        )?;
        let config = TunnelClientConfig {
            relay_addr: relay.relay_addr,
            protected_endpoints: vec![relay.relay_addr],
            relay_token: relay_token.expose().to_string(),
            relay_ttl_secs: relay.token_ttl_secs.max(1),
            conn_id,
            gateway_service: request.gateway_service,
            peer_id: namespace_id.unwrap_or_else(|| "anonymous".to_string()),
            fail_mode: to_client_fail_mode(request.fail_mode),
            dns_mode: to_client_dns_mode(request.dns_mode),
            exclude_cidrs: request.exclude_cidrs,
            allow_lan: request.allow_lan,
            max_ip_packet_bytes: TunnelLimits::default().max_ip_packet_bytes,
            mtu: 1500,
            timing: TunnelTiming::default(),
        };
        let prewarm_key = PrewarmKey {
            relay_addr: relay.relay_addr,
            conn_id,
            gateway_service: config.gateway_service.clone(),
            peer_id: config.peer_id.clone(),
        };
        self.ensure_session_prewarmer(prewarm_key, config.clone());
        match start_default_tunnel_client_with_prewarmer(config, self.prewarmer.as_ref()) {
            Ok(handle) => {
                self.tunnel_client = Some(handle);
                self.tunnel.state = TunnelState::Connecting;
            }
            Err(error) => {
                self.tunnel.last_error_code = Some(redact_error_code(error.to_string().as_str()));
                self.tunnel.state = TunnelState::Degraded;
            }
        }
        self.refresh_tunnel_from_client();
        self.refresh_prewarm_from_handle();
        Ok(self.tunnel.status(
            self.current_dns_capabilities(),
            self.current_runtime_capabilities(),
        ))
    }

    pub fn tunnel_disable(&mut self) -> TunnelStatusResponse {
        if let Some(mut client) = self.tunnel_client.take() {
            client.stop();
        }
        self.tunnel.enabled = false;
        self.tunnel.state = TunnelState::Disabling;
        self.tunnel.state = TunnelState::Disabled;
        self.tunnel.gateway = None;
        self.tunnel.connected = false;
        self.tunnel.last_error_code = None;
        self.tunnel.handshake_ms = None;
        self.tunnel.reconnects = 0;
        self.tunnel.bytes_in = 0;
        self.tunnel.bytes_out = 0;
        self.tunnel.exclude_cidrs.clear();
        self.tunnel.allow_lan = false;
        self.metrics
            .set_tunnel_counters(TunnelClientCounters::default());
        self.refresh_prewarm_from_handle();
        self.tunnel.status(
            self.current_dns_capabilities(),
            self.current_runtime_capabilities(),
        )
    }

    pub fn tunnel_status(&mut self) -> TunnelStatusResponse {
        self.refresh_tunnel_from_client();
        self.refresh_prewarm_from_handle();
        self.tunnel.status(
            self.current_dns_capabilities(),
            self.current_runtime_capabilities(),
        )
    }

    fn refresh_tunnel_from_client(&mut self) {
        if let Some(client) = self.tunnel_client.as_ref() {
            let snapshot = client.snapshot();
            self.tunnel.state = from_client_tunnel_state(snapshot.state);
            self.tunnel.connected = snapshot.connected;
            self.tunnel.last_error_code = snapshot.last_error_code.clone();
            self.tunnel.handshake_ms = snapshot.handshake_ms;
            self.tunnel.reconnects = snapshot.reconnects;
            self.tunnel.bytes_in = snapshot.counters.tunnel_bytes_in;
            self.tunnel.bytes_out = snapshot.counters.tunnel_bytes_out;
            self.metrics.set_tunnel_counters(snapshot.counters);
        }
    }

    fn ensure_session_prewarmer(&mut self, key: PrewarmKey, config: TunnelClientConfig) {
        if self
            .prewarm_key
            .as_ref()
            .is_some_and(|existing| existing == &key)
            && self.prewarmer.is_some()
        {
            return;
        }

        if let Some(mut existing) = self.prewarmer.take() {
            existing.stop();
        }

        match start_session_prewarmer(config) {
            Ok(handle) => {
                self.prewarmer = Some(handle);
                self.prewarm_key = Some(key);
            }
            Err(error) => {
                self.prewarmer = None;
                self.prewarm_key = None;
                self.tunnel.prewarm_state = PrewarmState::Error;
                self.tunnel.prewarm_last_error_code =
                    Some(redact_error_code(error.to_string().as_str()));
            }
        }
    }

    fn refresh_prewarm_from_handle(&mut self) {
        if let Some(prewarmer) = self.prewarmer.as_ref() {
            let snapshot = prewarmer.snapshot();
            self.tunnel.prewarm_state = from_client_prewarm_state(snapshot.state);
            self.tunnel.prewarm_last_error_code = snapshot.last_error_code.clone();
            self.metrics.set_prewarm_counters(snapshot);
        } else {
            self.tunnel.prewarm_state = PrewarmState::Idle;
            self.tunnel.prewarm_last_error_code = None;
            self.metrics
                .set_prewarm_counters(ClientSessionPrewarmSnapshot::default());
        }
    }

    pub fn connect(&mut self, request: ConnectRequest) -> Result<ConnectPlan, ApiError> {
        validate_service_name(request.service_name.as_str())?;

        let connection_id = self.next_connection_id;
        self.next_connection_id = self.next_connection_id.saturating_add(1);

        let mut machine = SessionStateMachine::new(SessionClock);
        machine
            .start()
            .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to start session"))?;
        machine.on_discovery_success().map_err(|_| {
            ApiError::new(
                ApiErrorCode::Internal,
                "failed to transition session after discovery",
            )
        })?;

        if let Some(relay) = self.relay.clone() {
            machine.on_probe_failure().map_err(|_| {
                ApiError::new(
                    ApiErrorCode::Internal,
                    "failed to transition session to relay path",
                )
            })?;
            machine.on_handshake_success().map_err(|_| {
                ApiError::new(
                    ApiErrorCode::Internal,
                    "failed to establish relay path session",
                )
            })?;

            let namespace_id = self.active_namespace_id();
            let conn_id = derive_conn_id(namespace_id.as_deref(), request.service_name.as_str());
            let relay_token = self.mint_relay_token(
                relay.relay_name.as_str(),
                namespace_id.as_deref().unwrap_or("anonymous"),
                relay.token_ttl_secs,
            )?;
            let listener = StdTcpListener::bind("127.0.0.1:0")
                .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to bind local proxy"))?;
            listener.set_nonblocking(true).map_err(|_| {
                ApiError::new(ApiErrorCode::Internal, "failed to configure local proxy")
            })?;
            let local_addr = listener.local_addr().map_err(|_| {
                ApiError::new(ApiErrorCode::Internal, "failed to read local proxy addr")
            })?;

            let service_name = request.service_name;
            let metrics = Arc::clone(&self.metrics);
            if tokio::runtime::Handle::try_current().is_ok() {
                tokio::spawn(async move {
                    run_connect_worker(
                        service_name,
                        relay,
                        conn_id,
                        listener,
                        relay_token,
                        metrics,
                    )
                    .await;
                });
            }

            self.connections.insert(
                connection_id,
                ConnectionRecord {
                    _stream_id: 1,
                    machine,
                },
            );
            self.metrics.inc_connect_success();
            return Ok(ConnectPlan {
                response: ConnectResponse {
                    connection_id,
                    stream_id: 1,
                    local_addr: Some(local_addr.to_string()),
                },
            });
        }

        let service = self
            .services
            .get(request.service_name.as_str())
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "service not exposed"))?;
        machine.on_probe_success().map_err(|_| {
            ApiError::new(
                ApiErrorCode::Internal,
                "failed to transition session to direct handshake",
            )
        })?;

        self.connections.insert(
            connection_id,
            ConnectionRecord {
                _stream_id: service.stream_id,
                machine,
            },
        );
        self.metrics.inc_connect_success();

        Ok(ConnectPlan {
            response: ConnectResponse {
                connection_id,
                stream_id: service.stream_id,
                local_addr: None,
            },
        })
    }

    pub fn connection_state(&self, connection_id: u64) -> Option<SessionState> {
        self.connections
            .get(&connection_id)
            .map(|record| record.machine.state())
    }

    fn active_namespace_id(&mut self) -> Option<String> {
        self.namespace_store.primary_namespace_id(now_unix_secs())
    }

    fn mint_relay_token(
        &self,
        relay_name: &str,
        namespace_id: &str,
        ttl_secs: u32,
    ) -> Result<Secret<String>, ApiError> {
        let relay = self
            .relay
            .as_ref()
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotReady, "relay path unavailable"))?;
        relay.token_issuer.mint_relay_token(
            relay_name,
            namespace_id,
            Some(ttl_secs),
            now_unix_secs(),
        )
    }

    pub fn metrics_handle(&self) -> Arc<LinkMetrics> {
        Arc::clone(&self.metrics)
    }
}

pub struct ConnectPlan {
    pub response: ConnectResponse,
}

#[derive(Debug)]
enum LocalStreamEvent {
    Data { stream_id: u32, bytes: Vec<u8> },
    Close { stream_id: u32 },
}

async fn run_expose_worker(
    service_name: String,
    local_addr: SocketAddr,
    relay: RelayConfig,
    conn_id: u64,
    relay_token: Secret<String>,
    metrics: Arc<LinkMetrics>,
) {
    let local_datagram_addr = loopback_datagram_addr(relay.relay_addr);
    let channel = match RelayDatagramChannel::bind(local_datagram_addr, relay.relay_addr, conn_id)
        .await
    {
        Ok(channel) => channel,
        Err(error) => {
            tracing::warn!(service = %service_name, error = %error, "expose worker channel bind failed");
            metrics.set_relay_reachable(false);
            return;
        }
    };

    if channel
        .allocate_and_bind(relay_token.expose().as_str(), relay.token_ttl_secs.max(1))
        .await
        .is_err()
    {
        tracing::warn!(service = %service_name, "expose worker relay allocation failed");
        metrics.set_relay_reachable(false);
        return;
    }
    metrics.set_relay_reachable(true);

    let seed = seed_for_role("responder", conn_id);
    let mut session = SecureSession::new_responder(
        conn_id,
        SESSION_PROLOGUE,
        DeterministicPrimitives::new(seed),
    );
    let mut gate = TokenBucketPreAuthGate::new(PreAuthLimits::default(), RateLimitClock);

    if run_handshake_responder(&channel, &mut gate, &mut session)
        .await
        .is_err()
    {
        tracing::warn!(service = %service_name, "expose worker handshake failed");
        metrics.inc_handshake_failures();
        return;
    }

    let (local_tx, mut local_rx) = mpsc::channel::<LocalStreamEvent>(STREAM_QUEUE_CAPACITY);
    let mut stream_writes: HashMap<u32, tokio::net::tcp::OwnedWriteHalf> = HashMap::new();
    loop {
        tokio::select! {
            recv = channel.recv() => {
                let Ok((src, packet)) = recv else {
                    break;
                };
                if !gate.allow_packet(src.ip(), packet.len()) {
                    continue;
                }
                let Ok(handled) = session.handle_incoming(packet.as_slice()) else {
                    continue;
                };
                for outbound in handled.outbound {
                    let _ = channel.send(outbound.as_slice()).await;
                }
                for event in handled.events {
                    match event {
                        SessionEvent::Data { stream_id, payload } => {
                            let Ok(frame) = decode_mux_frame(payload.as_slice()) else {
                                continue;
                            };
                            match frame {
                                MuxFrame::Open { service } => {
                                    if service != service_name || stream_writes.contains_key(&stream_id) {
                                        let _ = send_mux_over_session(
                                            &channel,
                                            &mut session,
                                            stream_id,
                                            MuxFrame::Close,
                                        ).await;
                                        continue;
                                    }
                                    match TcpStream::connect(local_addr).await {
                                        Ok(stream) => {
                                            let (read_half, write_half) = stream.into_split();
                                            stream_writes.insert(stream_id, write_half);
                                            metrics.inc_stream_open();
                                            spawn_local_reader(stream_id, read_half, local_tx.clone());
                                        }
                                        Err(_) => {
                                            let _ = send_mux_over_session(
                                                &channel,
                                                &mut session,
                                                stream_id,
                                                MuxFrame::Close,
                                            ).await;
                                        }
                                    }
                                }
                                MuxFrame::Data { bytes } => {
                                    metrics.add_bytes_proxied(bytes.len());
                                    if let Some(write_half) = stream_writes.get_mut(&stream_id) {
                                        if write_half.write_all(bytes.as_slice()).await.is_err() {
                                            stream_writes.remove(&stream_id);
                                            let _ = send_mux_over_session(
                                                &channel,
                                                &mut session,
                                                stream_id,
                                                MuxFrame::Close,
                                            ).await;
                                        }
                                    }
                                }
                                MuxFrame::Close => {
                                    stream_writes.remove(&stream_id);
                                }
                            }
                        }
                        SessionEvent::Close { stream_id } => {
                            stream_writes.remove(&stream_id);
                        }
                        SessionEvent::HandshakeComplete => {}
                    }
                }
            }
            local_event = local_rx.recv() => {
                let Some(local_event) = local_event else {
                    break;
                };
                match local_event {
                    LocalStreamEvent::Data { stream_id, bytes } => {
                        metrics.add_bytes_proxied(bytes.len());
                        let _ = send_mux_over_session(
                            &channel,
                            &mut session,
                            stream_id,
                            MuxFrame::Data { bytes },
                        ).await;
                    }
                    LocalStreamEvent::Close { stream_id } => {
                        stream_writes.remove(&stream_id);
                        let _ = send_mux_over_session(
                            &channel,
                            &mut session,
                            stream_id,
                            MuxFrame::Close,
                        ).await;
                    }
                }
            }
        }
    }
}

async fn run_connect_worker(
    service_name: String,
    relay: RelayConfig,
    conn_id: u64,
    listener: StdTcpListener,
    relay_token: Secret<String>,
    metrics: Arc<LinkMetrics>,
) {
    let listener = match TcpListener::from_std(listener) {
        Ok(listener) => listener,
        Err(_) => return,
    };
    let Ok((socket, _)) = listener.accept().await else {
        return;
    };

    let local_datagram_addr = loopback_datagram_addr(relay.relay_addr);
    let channel =
        match RelayDatagramChannel::bind(local_datagram_addr, relay.relay_addr, conn_id).await {
            Ok(channel) => channel,
            Err(_) => {
                metrics.set_relay_reachable(false);
                return;
            }
        };
    if channel
        .allocate_and_bind(relay_token.expose().as_str(), relay.token_ttl_secs.max(1))
        .await
        .is_err()
    {
        metrics.set_relay_reachable(false);
        return;
    }
    metrics.set_relay_reachable(true);

    let seed = seed_for_role("initiator", conn_id);
    let mut session = SecureSession::new_initiator(
        conn_id,
        SESSION_PROLOGUE,
        DeterministicPrimitives::new(seed),
    );
    let mut gate = TokenBucketPreAuthGate::new(PreAuthLimits::default(), RateLimitClock);
    if run_handshake_initiator(&channel, &mut gate, &mut session)
        .await
        .is_err()
    {
        metrics.inc_handshake_failures();
        return;
    }

    let stream_id = 1u32;
    if send_mux_over_session(
        &channel,
        &mut session,
        stream_id,
        MuxFrame::Open {
            service: service_name,
        },
    )
    .await
    .is_err()
    {
        return;
    }
    metrics.inc_stream_open();

    let (read_half, mut write_half) = socket.into_split();
    let (local_tx, mut local_rx) = mpsc::channel::<LocalStreamEvent>(STREAM_QUEUE_CAPACITY);
    spawn_local_reader(stream_id, read_half, local_tx);

    loop {
        tokio::select! {
            recv = channel.recv() => {
                let Ok((src, packet)) = recv else {
                    break;
                };
                if !gate.allow_packet(src.ip(), packet.len()) {
                    continue;
                }
                let Ok(handled) = session.handle_incoming(packet.as_slice()) else {
                    continue;
                };
                for outbound in handled.outbound {
                    let _ = channel.send(outbound.as_slice()).await;
                }
                for event in handled.events {
                    match event {
                        SessionEvent::Data { stream_id: incoming_stream_id, payload } => {
                            let Ok(frame) = decode_mux_frame(payload.as_slice()) else {
                                continue;
                            };
                            if incoming_stream_id != stream_id {
                                continue;
                            }
                            match frame {
                                MuxFrame::Data { bytes } => {
                                    metrics.add_bytes_proxied(bytes.len());
                                    if write_half.write_all(bytes.as_slice()).await.is_err() {
                                        break;
                                    }
                                }
                                MuxFrame::Close => {
                                    return;
                                }
                                MuxFrame::Open { .. } => {}
                            }
                        }
                        SessionEvent::Close { .. } => return,
                        SessionEvent::HandshakeComplete => {}
                    }
                }
            }
            local_event = local_rx.recv() => {
                let Some(local_event) = local_event else {
                    break;
                };
                match local_event {
                    LocalStreamEvent::Data { stream_id: local_stream, bytes } => {
                        if local_stream != stream_id {
                            continue;
                        }
                        metrics.add_bytes_proxied(bytes.len());
                        if send_mux_over_session(
                            &channel,
                            &mut session,
                            stream_id,
                            MuxFrame::Data { bytes },
                        ).await.is_err() {
                            break;
                        }
                    }
                    LocalStreamEvent::Close { stream_id: local_stream } => {
                        if local_stream == stream_id {
                            let _ = send_mux_over_session(
                                &channel,
                                &mut session,
                                stream_id,
                                MuxFrame::Close,
                            ).await;
                            break;
                        }
                    }
                }
            }
        }
    }
}

async fn run_gateway_worker(
    relay: RelayConfig,
    gateway: GatewayExitConfig,
    relay_token: Secret<String>,
    metrics: Arc<LinkMetrics>,
) {
    let local_datagram_addr = loopback_datagram_addr(relay.relay_addr);
    let channel =
        match RelayDatagramChannel::bind(local_datagram_addr, relay.relay_addr, gateway.conn_id)
            .await
        {
            Ok(channel) => channel,
            Err(_) => {
                metrics.set_relay_reachable(false);
                return;
            }
        };
    if channel
        .allocate_and_bind(relay_token.expose().as_str(), relay.token_ttl_secs.max(1))
        .await
        .is_err()
    {
        metrics.set_relay_reachable(false);
        return;
    }
    metrics.set_relay_reachable(true);

    let seed = seed_for_role("gateway-responder", gateway.conn_id);
    let mut session = SecureSession::new_responder(
        gateway.conn_id,
        SESSION_PROLOGUE,
        DeterministicPrimitives::new(seed),
    );
    let mut gate = TokenBucketPreAuthGate::new(PreAuthLimits::default(), RateLimitClock);
    if run_handshake_responder(&channel, &mut gate, &mut session)
        .await
        .is_err()
    {
        metrics.inc_handshake_failures();
        return;
    }

    let mut tunnel_engine = GatewayEngine::new(GatewayConfig {
        dns_upstream: gateway_dns_upstream(),
        ..GatewayConfig::default()
    });
    let tunnel_limits = TunnelLimits::default();
    let mut stream_auth: HashMap<u32, bool> = HashMap::new();
    let mut stream_peer: HashMap<u32, String> = HashMap::new();
    let mut tick = interval(Duration::from_millis(GATEWAY_EVENT_POLL_MS));
    metrics.set_gateway_counters(tunnel_engine.counters());

    loop {
        tokio::select! {
            recv = channel.recv() => {
                let Ok((src, packet)) = recv else {
                    break;
                };
                if !gate.allow_packet(src.ip(), packet.len()) {
                    continue;
                }
                let Ok(handled) = session.handle_incoming(packet.as_slice()) else {
                    continue;
                };
                for outbound in handled.outbound {
                    let _ = channel.send(outbound.as_slice()).await;
                }
                for event in handled.events {
                    match event {
                        SessionEvent::Data { stream_id, payload } => {
                            let Ok(frame) = decode_mux_frame(payload.as_slice()) else {
                                continue;
                            };
                            match frame {
                                MuxFrame::Open { service } => {
                                    if service != DEFAULT_GATEWAY_SERVICE
                                        && service != TUNNEL_STREAM_SERVICE
                                    {
                                        let _ = send_mux_over_session(
                                            &channel,
                                            &mut session,
                                            stream_id,
                                            MuxFrame::Close,
                                        ).await;
                                        continue;
                                    }
                                    stream_auth.insert(stream_id, false);
                                }
                                MuxFrame::Data { bytes } => {
                                    if !stream_auth.contains_key(&stream_id) {
                                        let _ = send_mux_over_session(
                                            &channel,
                                            &mut session,
                                            stream_id,
                                            MuxFrame::Close,
                                        ).await;
                                        continue;
                                    }
                                    let Ok(message) = decode_tunnel_message(bytes.as_slice(), tunnel_limits) else {
                                        let _ = send_tunnel_message(
                                            &channel,
                                            &mut session,
                                            stream_id,
                                            TunnelMessage::Control(TunnelControl::Error { code: "invalid_tunnel_message".to_string() }),
                                        ).await;
                                        continue;
                                    };

                                    if !stream_auth.get(&stream_id).copied().unwrap_or(false) {
                                        match message {
                                            TunnelMessage::Control(TunnelControl::Auth { peer_id }) => {
                                                if gateway.allowed_peers.iter().any(|allowed| allowed == &peer_id) {
                                                    stream_auth.insert(stream_id, true);
                                                    stream_peer.insert(stream_id, peer_id);
                                                    let _ = send_tunnel_message(
                                                        &channel,
                                                        &mut session,
                                                        stream_id,
                                                        TunnelMessage::Control(TunnelControl::AuthOk),
                                                    ).await;
                                                } else {
                                                    let _ = send_tunnel_message(
                                                        &channel,
                                                        &mut session,
                                                        stream_id,
                                                        TunnelMessage::Control(TunnelControl::Error { code: "peer_not_allowed".to_string() }),
                                                    ).await;
                                                    let _ = send_mux_over_session(
                                                        &channel,
                                                        &mut session,
                                                        stream_id,
                                                        MuxFrame::Close,
                                                    ).await;
                                                    stream_auth.remove(&stream_id);
                                                    stream_peer.remove(&stream_id);
                                                }
                                            }
                                            _ => {
                                                let _ = send_tunnel_message(
                                                    &channel,
                                                    &mut session,
                                                    stream_id,
                                                    TunnelMessage::Control(TunnelControl::Error { code: "auth_required".to_string() }),
                                                ).await;
                                            }
                                        }
                                        continue;
                                    }

                                    let Ok(outbound) = tunnel_engine.process_message(message).await else {
                                        let _ = send_tunnel_message(
                                            &channel,
                                            &mut session,
                                            stream_id,
                                            TunnelMessage::Control(TunnelControl::Error { code: "gateway_engine_failed".to_string() }),
                                        ).await;
                                        continue;
                                    };
                                    for outbound_message in outbound {
                                        let _ = send_tunnel_message(
                                            &channel,
                                            &mut session,
                                            stream_id,
                                            outbound_message,
                                        ).await;
                                    }
                                    metrics.set_gateway_counters(tunnel_engine.counters());
                                }
                                MuxFrame::Close => {
                                    stream_auth.remove(&stream_id);
                                    stream_peer.remove(&stream_id);
                                }
                            }
                        }
                        SessionEvent::Close { stream_id } => {
                            stream_auth.remove(&stream_id);
                            stream_peer.remove(&stream_id);
                        }
                        SessionEvent::HandshakeComplete => {}
                    }
                }
            }
            _ = tick.tick() => {
                let events = tunnel_engine.drain_events();
                if events.is_empty() {
                    continue;
                }
                for stream_id in stream_auth
                    .iter()
                    .filter_map(|(stream_id, authed)| if *authed { Some(*stream_id) } else { None }) {
                    for outbound_message in events.clone() {
                        let _ = send_tunnel_message(
                            &channel,
                            &mut session,
                            stream_id,
                            outbound_message,
                        ).await;
                    }
                }
                metrics.set_gateway_counters(tunnel_engine.counters());
            }
        }
    }
}

async fn run_handshake_initiator(
    channel: &RelayDatagramChannel,
    gate: &mut TokenBucketPreAuthGate<RateLimitClock>,
    session: &mut SecureSession<DeterministicPrimitives>,
) -> Result<(), ApiError> {
    let msg1 = session
        .start_handshake(b"link-connect")
        .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to start handshake"))?;
    channel
        .send(msg1.as_slice())
        .await
        .map_err(|_| ApiError::new(ApiErrorCode::NotReady, "relay path unavailable"))?;

    while !session.is_established() {
        let (src, packet) = channel
            .recv()
            .await
            .map_err(|_| ApiError::new(ApiErrorCode::NotReady, "relay path unavailable"))?;
        if !gate.allow_packet(src.ip(), packet.len()) {
            continue;
        }
        let handled = session
            .handle_incoming(packet.as_slice())
            .map_err(|_| ApiError::new(ApiErrorCode::Internal, "handshake failed"))?;
        for outbound in handled.outbound {
            channel
                .send(outbound.as_slice())
                .await
                .map_err(|_| ApiError::new(ApiErrorCode::NotReady, "relay path unavailable"))?;
        }
    }
    Ok(())
}

async fn run_handshake_responder(
    channel: &RelayDatagramChannel,
    gate: &mut TokenBucketPreAuthGate<RateLimitClock>,
    session: &mut SecureSession<DeterministicPrimitives>,
) -> Result<(), ApiError> {
    while !session.is_established() {
        let (src, packet) = channel
            .recv()
            .await
            .map_err(|_| ApiError::new(ApiErrorCode::NotReady, "relay path unavailable"))?;
        if !gate.allow_packet(src.ip(), packet.len()) {
            continue;
        }
        let handled = session
            .handle_incoming(packet.as_slice())
            .map_err(|_| ApiError::new(ApiErrorCode::Internal, "handshake failed"))?;
        for outbound in handled.outbound {
            channel
                .send(outbound.as_slice())
                .await
                .map_err(|_| ApiError::new(ApiErrorCode::NotReady, "relay path unavailable"))?;
        }
    }
    Ok(())
}

async fn send_mux_over_session(
    channel: &RelayDatagramChannel,
    session: &mut SecureSession<DeterministicPrimitives>,
    stream_id: u32,
    frame: MuxFrame,
) -> Result<(), ApiError> {
    let payload = encode_mux_frame(&frame)
        .map_err(|_| ApiError::new(ApiErrorCode::Internal, "mux encode failure"))?;
    let encrypted = session
        .encrypt_data(stream_id, payload.as_slice())
        .map_err(|_| ApiError::new(ApiErrorCode::Internal, "session encrypt failure"))?;
    channel
        .send(encrypted.as_slice())
        .await
        .map_err(|_| ApiError::new(ApiErrorCode::NotReady, "relay path unavailable"))
}

async fn send_tunnel_message(
    channel: &RelayDatagramChannel,
    session: &mut SecureSession<DeterministicPrimitives>,
    stream_id: u32,
    message: TunnelMessage,
) -> Result<(), ApiError> {
    let encoded = encode_tunnel_message(&message)
        .map_err(|_| ApiError::new(ApiErrorCode::Internal, "tunnel encode failure"))?;
    send_mux_over_session(
        channel,
        session,
        stream_id,
        MuxFrame::Data { bytes: encoded },
    )
    .await
}

fn spawn_local_reader(
    stream_id: u32,
    mut reader: tokio::net::tcp::OwnedReadHalf,
    tx: mpsc::Sender<LocalStreamEvent>,
) {
    tokio::spawn(async move {
        let mut buf = [0u8; STREAM_IO_CHUNK];
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => {
                    let _ = tx.send(LocalStreamEvent::Close { stream_id }).await;
                    break;
                }
                Ok(n) => {
                    if tx
                        .send(LocalStreamEvent::Data {
                            stream_id,
                            bytes: buf[..n].to_vec(),
                        })
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Err(_) => {
                    let _ = tx.send(LocalStreamEvent::Close { stream_id }).await;
                    break;
                }
            }
        }
    });
}

fn validate_service_name(service_name: &str) -> Result<(), ApiError> {
    if service_name.is_empty() || service_name.len() > 64 {
        return Err(ApiError::new(
            ApiErrorCode::InvalidInput,
            "invalid service_name",
        ));
    }
    if !service_name
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
    {
        return Err(ApiError::new(
            ApiErrorCode::InvalidInput,
            "invalid service_name",
        ));
    }
    Ok(())
}

fn parse_cidr(value: &str) -> Result<(IpAddr, u8), ApiError> {
    let (ip_part, prefix_part) = value
        .split_once('/')
        .ok_or_else(|| ApiError::new(ApiErrorCode::InvalidInput, "invalid exclude_cidr"))?;
    let ip = ip_part
        .parse::<IpAddr>()
        .map_err(|_| ApiError::new(ApiErrorCode::InvalidInput, "invalid exclude_cidr"))?;
    let prefix = prefix_part
        .parse::<u8>()
        .map_err(|_| ApiError::new(ApiErrorCode::InvalidInput, "invalid exclude_cidr"))?;
    let max_prefix = match ip {
        IpAddr::V4(_) => 32,
        IpAddr::V6(_) => 128,
    };
    if prefix > max_prefix {
        return Err(ApiError::new(
            ApiErrorCode::InvalidInput,
            "invalid exclude_cidr",
        ));
    }
    Ok((ip, prefix))
}

fn to_client_fail_mode(mode: TunnelFailMode) -> ClientTunnelFailMode {
    match mode {
        TunnelFailMode::OpenFast => ClientTunnelFailMode::OpenFast,
        TunnelFailMode::Closed => ClientTunnelFailMode::Closed,
    }
}

fn to_client_dns_mode(mode: TunnelDnsMode) -> ClientTunnelDnsMode {
    match mode {
        TunnelDnsMode::RemoteBestEffort => ClientTunnelDnsMode::RemoteBestEffort,
        TunnelDnsMode::RemoteStrict => ClientTunnelDnsMode::RemoteStrict,
        TunnelDnsMode::System => ClientTunnelDnsMode::System,
    }
}

fn from_client_tunnel_state(state: ClientTunnelState) -> TunnelState {
    match state {
        ClientTunnelState::Disabled => TunnelState::Disabled,
        ClientTunnelState::Enabling => TunnelState::Enabling,
        ClientTunnelState::Connecting => TunnelState::Connecting,
        ClientTunnelState::Connected => TunnelState::Connected,
        ClientTunnelState::Degraded => TunnelState::Degraded,
        ClientTunnelState::Disabling => TunnelState::Disabling,
    }
}

fn from_client_prewarm_state(state: ClientSessionPrewarmState) -> PrewarmState {
    match state {
        ClientSessionPrewarmState::Idle => PrewarmState::Idle,
        ClientSessionPrewarmState::Warming => PrewarmState::Warming,
        ClientSessionPrewarmState::Ready => PrewarmState::Ready,
        ClientSessionPrewarmState::Error => PrewarmState::Error,
    }
}

fn to_daemon_dns_capabilities(value: ClientTunnelDnsCapabilities) -> TunnelDnsCapabilities {
    TunnelDnsCapabilities {
        remote_best_effort_supported: value.remote_best_effort_supported,
        remote_strict_supported: value.remote_strict_supported,
        can_bind_low_port: value.can_bind_low_port,
        can_set_system_dns: value.can_set_system_dns,
    }
}

fn to_self_check_dns_capabilities(value: TunnelDnsCapabilities) -> DnsCapabilitiesInfo {
    DnsCapabilitiesInfo {
        remote_best_effort_supported: value.remote_best_effort_supported,
        remote_strict_supported: value.remote_strict_supported,
        can_bind_low_port: value.can_bind_low_port,
        can_set_system_dns: value.can_set_system_dns,
    }
}

fn tunnel_dns_mode_label(mode: TunnelDnsMode) -> &'static str {
    match mode {
        TunnelDnsMode::RemoteBestEffort => "remote_best_effort",
        TunnelDnsMode::RemoteStrict => "remote_strict",
        TunnelDnsMode::System => "system",
    }
}

fn dns_capability_detail_safe(capabilities: TunnelDnsCapabilities) -> String {
    if capabilities.remote_strict_supported {
        return "remote_strict supported".to_string();
    }
    if !capabilities.can_bind_low_port {
        return "low-port bind unavailable for strict DNS".to_string();
    }
    if !capabilities.can_set_system_dns {
        return "system DNS configuration unavailable".to_string();
    }
    "strict DNS capability unavailable".to_string()
}

fn tunnel_runtime_error_code(
    dns_mode: TunnelDnsMode,
    runtime_capabilities: RuntimeCapabilitiesInfo,
) -> Option<&'static str> {
    #[cfg(target_os = "linux")]
    {
        if !runtime_capabilities.tun_device_present {
            return Some("tun_missing");
        }
        if !runtime_capabilities.has_cap_net_admin {
            return Some("cap_net_admin_missing");
        }
        if matches!(dns_mode, TunnelDnsMode::RemoteStrict)
            && !runtime_capabilities.has_cap_bind_service
        {
            return Some("bind53_missing");
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (dns_mode, runtime_capabilities);

    None
}

fn detect_tunnel_runtime_capabilities() -> RuntimeCapabilitiesInfo {
    #[cfg(target_os = "linux")]
    {
        let cap_eff = linux_effective_capabilities();
        RuntimeCapabilitiesInfo {
            tun_device_present: std::path::Path::new("/dev/net/tun").exists(),
            has_cap_net_admin: cap_eff.is_some_and(|bits| (bits & (1u64 << 12)) != 0),
            has_cap_bind_service: cap_eff.is_some_and(|bits| (bits & (1u64 << 10)) != 0),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        RuntimeCapabilitiesInfo {
            tun_device_present: true,
            has_cap_net_admin: true,
            has_cap_bind_service: true,
        }
    }
}

#[cfg(target_os = "linux")]
fn linux_effective_capabilities() -> Option<u64> {
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    let hex = status
        .lines()
        .find_map(|line| {
            line.strip_prefix("CapEff:\t")
                .or_else(|| line.strip_prefix("CapEff:"))
        })
        .map(str::trim)?;
    u64::from_str_radix(hex, 16).ok()
}

fn redact_error_code(value: &str) -> String {
    let compact = value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '_' || *ch == '-')
        .collect::<String>();
    if compact.is_empty() {
        "tunnel_error".to_string()
    } else {
        compact.chars().take(64).collect()
    }
}

fn derive_conn_id(namespace_id: Option<&str>, service_name: &str) -> u64 {
    let mut input = Vec::with_capacity(128);
    if let Some(namespace_id) = namespace_id {
        input.extend_from_slice(namespace_id.as_bytes());
        input.push(0xff);
    }
    input.extend_from_slice(service_name.as_bytes());
    let hash = simple_hash32(input.as_slice());
    let mut conn_id_bytes = [0u8; 8];
    conn_id_bytes.copy_from_slice(&hash[..8]);
    let conn_id = u64::from_le_bytes(conn_id_bytes);
    conn_id.max(1)
}

fn seed_for_role(role: &str, conn_id: u64) -> [u8; 32] {
    let mut input = Vec::with_capacity(role.len() + 8);
    input.extend_from_slice(role.as_bytes());
    input.extend_from_slice(&conn_id.to_le_bytes());
    simple_hash32(input.as_slice())
}

fn loopback_datagram_addr(relay_addr: SocketAddr) -> SocketAddr {
    match relay_addr {
        SocketAddr::V4(_) => "127.0.0.1:0"
            .parse()
            .expect("static IPv4 loopback socket must parse"),
        SocketAddr::V6(_) => "[::1]:0"
            .parse()
            .expect("static IPv6 loopback socket must parse"),
    }
}

fn gateway_dns_upstream() -> Option<SocketAddr> {
    std::env::var("ANIMUS_GATEWAY_DNS_UPSTREAM")
        .ok()
        .and_then(|value| value.parse().ok())
}

fn platform_tunnel_supported() -> bool {
    cfg!(any(
        target_os = "linux",
        target_os = "macos",
        target_os = "windows",
        target_os = "android",
        target_os = "ios"
    ))
}

fn mobile_policy() -> MobilePolicy {
    MobilePolicy::ForegroundOnly
}

fn error_code_label(code: ApiErrorCode) -> &'static str {
    match code {
        ApiErrorCode::InvalidInput => "invalid_input",
        ApiErrorCode::NotReady => "not_ready",
        ApiErrorCode::Denied => "denied",
        ApiErrorCode::NotFound => "not_found",
        ApiErrorCode::Conflict => "conflict",
        ApiErrorCode::Internal => "internal",
        ApiErrorCode::MethodNotAllowed => "method_not_allowed",
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use fabric_session::state_machine::{SessionState, TransportPath};

    use super::{
        ConnectRequest, ExposeRequest, GatewayExposeRequest, GatewayMode, LinkDaemon, RelayConfig,
        TunnelDnsMode, TunnelEnableRequest, TunnelFailMode, TunnelState,
    };
    use crate::diagnostics::RuntimeCapabilitiesInfo;
    use crate::errors::ApiErrorCode;
    use crate::relay_token::{RelayTokenIssuer, RelayTokenIssuerConfig, DEFAULT_TOKEN_TTL_SECS};

    fn temp_state_path(name: &str) -> PathBuf {
        let now_ns = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time must be valid")
            .as_nanos();
        std::env::temp_dir().join(format!("animus-link-tests/{name}-{now_ns}/namespaces.json"))
    }

    fn token_issuer_for_tests(path: &std::path::Path) -> std::sync::Arc<RelayTokenIssuer> {
        std::sync::Arc::new(
            RelayTokenIssuer::load_or_create(RelayTokenIssuerConfig {
                signing_key_id: "relay-token-signing-v1".to_string(),
                signing_key_file: path.with_extension("relay-token-key.hex"),
                signing_seed_hex: Some(
                    "1111111111111111111111111111111111111111111111111111111111111111".to_string(),
                ),
                default_ttl_secs: DEFAULT_TOKEN_TTL_SECS,
            })
            .expect("token issuer"),
        )
    }

    #[test]
    fn expose_rejects_missing_allow_policy() {
        let path = temp_state_path("expose-missing-policy");
        let mut daemon = LinkDaemon::new(&path, None).expect("daemon");
        let error = daemon
            .expose(ExposeRequest {
                service_name: "db".to_string(),
                local_addr: "127.0.0.1:5432".to_string(),
                allowed_peers: None,
            })
            .expect_err("missing allow policy must fail");
        assert_eq!(error.code, ApiErrorCode::Denied);
        assert_eq!(error.message, "explicit allow policy required");
    }

    #[test]
    fn connect_creates_session_state_machine_handle_without_relay() {
        let path = temp_state_path("connect-session-handle");
        let mut daemon = LinkDaemon::new(&path, None).expect("daemon");
        daemon
            .expose(ExposeRequest {
                service_name: "db".to_string(),
                local_addr: "127.0.0.1:5432".to_string(),
                allowed_peers: Some(vec!["peer-a".to_string()]),
            })
            .expect("expose");

        let plan = daemon
            .connect(ConnectRequest {
                service_name: "db".to_string(),
            })
            .expect("connect");

        let state = daemon
            .connection_state(plan.response.connection_id)
            .expect("connection state");
        match state {
            SessionState::Handshake(handshake) => {
                assert_eq!(handshake.path(), TransportPath::Direct);
            }
            other => panic!("expected direct handshake stub state, got {other:?}"),
        }
        assert_eq!(plan.response.local_addr, None);
    }

    #[test]
    fn connect_with_relay_returns_local_forward_addr() {
        if let Err(error) = std::net::TcpListener::bind("127.0.0.1:0") {
            if error.kind() == std::io::ErrorKind::PermissionDenied {
                return;
            }
        }
        let path = temp_state_path("connect-relay-local-addr");
        let relay = RelayConfig {
            relay_addr: "127.0.0.1:7777".parse().expect("relay addr parse"),
            relay_name: "default-relay".to_string(),
            token_ttl_secs: DEFAULT_TOKEN_TTL_SECS,
            token_issuer: token_issuer_for_tests(&path),
        };
        let mut daemon = LinkDaemon::new(&path, Some(relay)).expect("daemon");
        let plan = daemon
            .connect(ConnectRequest {
                service_name: "echo".to_string(),
            })
            .expect("connect");
        assert_eq!(plan.response.stream_id, 1);
        assert!(plan.response.local_addr.is_some());
    }

    #[test]
    fn gateway_expose_requires_nat_and_allow_policy() {
        let path = temp_state_path("gateway-expose-policy");
        let mut daemon = LinkDaemon::new(&path, None).expect("daemon");
        let error = daemon
            .gateway_expose(GatewayExposeRequest {
                mode: GatewayMode::Exit,
                listen: Some("127.0.0.1:0".to_string()),
                nat: false,
                allowed_peers: Some(vec!["peer-a".to_string()]),
            })
            .expect_err("nat=false must fail");
        assert_eq!(error.code, ApiErrorCode::InvalidInput);

        let error = daemon
            .gateway_expose(GatewayExposeRequest {
                mode: GatewayMode::Exit,
                listen: None,
                nat: true,
                allowed_peers: Some(Vec::new()),
            })
            .expect_err("empty policy must fail");
        assert_eq!(error.code, ApiErrorCode::Denied);
    }

    #[test]
    fn tunnel_enable_validates_cidrs_and_sets_status() {
        let path = temp_state_path("tunnel-enable-status");
        let mut daemon = LinkDaemon::new(&path, None).expect("daemon");
        let error = daemon
            .tunnel_enable(TunnelEnableRequest {
                gateway_service: "gateway-exit".to_string(),
                fail_mode: TunnelFailMode::OpenFast,
                dns_mode: super::TunnelDnsMode::RemoteBestEffort,
                exclude_cidrs: vec!["10.0.0.0/40".to_string()],
                allow_lan: false,
            })
            .expect_err("invalid cidr must fail");
        assert_eq!(error.code, ApiErrorCode::InvalidInput);

        daemon
            .gateway_expose(GatewayExposeRequest {
                mode: GatewayMode::Exit,
                listen: Some("127.0.0.1:0".to_string()),
                nat: true,
                allowed_peers: Some(vec!["peer-a".to_string()]),
            })
            .expect("gateway expose");
        let status = daemon
            .tunnel_enable(TunnelEnableRequest {
                gateway_service: "gateway-exit".to_string(),
                fail_mode: TunnelFailMode::OpenFast,
                dns_mode: super::TunnelDnsMode::RemoteBestEffort,
                exclude_cidrs: vec!["10.0.0.0/8".to_string()],
                allow_lan: true,
            })
            .expect("enable");
        assert!(status.enabled);
        assert_eq!(status.state, TunnelState::Degraded);
        assert_eq!(
            status.last_error_code.as_deref(),
            Some("relay_not_configured")
        );

        let status = daemon.tunnel_disable();
        assert!(!status.enabled);
        assert_eq!(status.state, TunnelState::Disabled);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn tunnel_runtime_error_codes_are_stable() {
        let missing_tun = RuntimeCapabilitiesInfo {
            tun_device_present: false,
            has_cap_net_admin: true,
            has_cap_bind_service: true,
        };
        assert_eq!(
            super::tunnel_runtime_error_code(TunnelDnsMode::RemoteBestEffort, missing_tun),
            Some("tun_missing")
        );

        let missing_admin = RuntimeCapabilitiesInfo {
            tun_device_present: true,
            has_cap_net_admin: false,
            has_cap_bind_service: true,
        };
        assert_eq!(
            super::tunnel_runtime_error_code(TunnelDnsMode::RemoteBestEffort, missing_admin),
            Some("cap_net_admin_missing")
        );

        let missing_bind = RuntimeCapabilitiesInfo {
            tun_device_present: true,
            has_cap_net_admin: true,
            has_cap_bind_service: false,
        };
        assert_eq!(
            super::tunnel_runtime_error_code(TunnelDnsMode::RemoteStrict, missing_bind),
            Some("bind53_missing")
        );
        assert_eq!(
            super::tunnel_runtime_error_code(TunnelDnsMode::RemoteBestEffort, missing_bind),
            None
        );
    }
}
