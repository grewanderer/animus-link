#[cfg(any(target_os = "linux", target_os = "android"))]
use std::io::{Read, Write};
#[cfg(target_os = "linux")]
use std::{collections::BTreeSet, net::IpAddr, process::Command};
use std::{
    collections::{HashMap, VecDeque},
    io,
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use fabric_crypto::{simple_hash32, DeterministicPrimitives};
use fabric_session::{
    mux::{decode_mux_frame, encode_mux_frame, MuxFrame},
    relay_channel::RelayDatagramChannel,
    secure_session::{SecureSession, SessionEvent},
};
use fabric_tunnel_proto::{
    decode_message as decode_tunnel_message, encode_message as encode_tunnel_message,
    TunnelControl, TunnelLimits, TunnelMessage,
};
use tokio::{
    net::UdpSocket,
    sync::{mpsc, oneshot},
    time::sleep,
};

#[cfg(any(target_os = "linux", target_os = "android"))]
use crate::state::SystemClock;
use crate::{
    route::{RouteConfig, RouteManager},
    state::{
        Clock, StateAction, TunnelFailMode as MachineFailMode, TunnelStateMachine, TunnelTiming,
    },
    tun::TunDevice,
};

const TUNNEL_STREAM_SERVICE: &str = "ip-tunnel";
const PACKET_QUEUE_CAPACITY: usize = 128;
const LOOP_TICK_MS: u64 = 50;
const DNS_STUB_MAX_INFLIGHT: usize = 64;
const DNS_STUB_TIMEOUT_MS: u64 = 700;
const DNS_STUB_SOCKET_READ_BYTES: usize = 2048;
const PREWARM_KEEPALIVE_MS: u64 = 1000;
const PREWARM_RETRY_MS: u64 = 250;

#[derive(Debug, Clone, Copy)]
enum DnsSetupStage {
    Bind,
    Config,
}

#[derive(Debug, thiserror::Error)]
pub enum TunnelClientError {
    #[error("unsupported platform or operation")]
    Unsupported,
    #[error("I/O error: {0}")]
    Io(String),
    #[error("route manager error: {0}")]
    Route(String),
    #[error("relay/session error: {0}")]
    Session(String),
    #[error("configuration invalid: {0}")]
    InvalidConfig(&'static str),
}

impl From<io::Error> for TunnelClientError {
    fn from(value: io::Error) -> Self {
        Self::Io(value.to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TunnelFailMode {
    OpenFast,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TunnelDnsMode {
    RemoteBestEffort,
    RemoteStrict,
    System,
}

impl TunnelDnsMode {
    fn is_remote(self) -> bool {
        matches!(self, Self::RemoteBestEffort | Self::RemoteStrict)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct TunnelDnsCapabilities {
    pub remote_best_effort_supported: bool,
    pub remote_strict_supported: bool,
    pub can_bind_low_port: bool,
    pub can_set_system_dns: bool,
}

pub fn detect_dns_capabilities() -> TunnelDnsCapabilities {
    #[cfg(target_os = "linux")]
    {
        let can_bind_low_port = std::net::UdpSocket::bind("127.0.0.1:53").is_ok();
        let can_set_with_resolvectl = Command::new("resolvectl")
            .arg("--version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false);
        let can_set_with_resolv_conf = std::fs::OpenOptions::new()
            .write(true)
            .open("/etc/resolv.conf")
            .is_ok();
        let can_set_system_dns = can_set_with_resolvectl || can_set_with_resolv_conf;
        TunnelDnsCapabilities {
            remote_best_effort_supported: can_set_with_resolvectl,
            remote_strict_supported: can_bind_low_port && can_set_system_dns,
            can_bind_low_port,
            can_set_system_dns,
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        TunnelDnsCapabilities::default()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TunnelState {
    Disabled,
    Enabling,
    Connecting,
    Connected,
    Degraded,
    Disabling,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionPrewarmState {
    Idle,
    Warming,
    Ready,
    Error,
}

#[derive(Debug, Clone)]
pub struct SessionPrewarmSnapshot {
    pub state: SessionPrewarmState,
    pub last_error_code: Option<String>,
    pub attempts_total: u64,
    pub fail_total: u64,
}

impl Default for SessionPrewarmSnapshot {
    fn default() -> Self {
        Self {
            state: SessionPrewarmState::Idle,
            last_error_code: None,
            attempts_total: 0,
            fail_total: 0,
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct TunnelClientCounters {
    pub tunnel_enabled: u64,
    pub tunnel_connected: u64,
    pub tunnel_reconnects_total: u64,
    pub tunnel_bytes_in: u64,
    pub tunnel_bytes_out: u64,
    pub dns_queries_total: u64,
    pub dns_timeouts_total: u64,
    pub dns_failures_total: u64,
}

#[derive(Debug, Clone)]
pub struct TunnelClientSnapshot {
    pub state: TunnelState,
    pub connected: bool,
    pub last_error_code: Option<String>,
    pub handshake_ms: Option<u32>,
    pub reconnects: u32,
    pub counters: TunnelClientCounters,
}

impl Default for TunnelClientSnapshot {
    fn default() -> Self {
        Self {
            state: TunnelState::Disabled,
            connected: false,
            last_error_code: None,
            handshake_ms: None,
            reconnects: 0,
            counters: TunnelClientCounters::default(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct TunnelClientConfig {
    pub relay_addr: SocketAddr,
    pub protected_endpoints: Vec<SocketAddr>,
    pub relay_token: String,
    pub relay_ttl_secs: u32,
    pub conn_id: u64,
    pub gateway_service: String,
    pub peer_id: String,
    pub fail_mode: TunnelFailMode,
    pub dns_mode: TunnelDnsMode,
    pub exclude_cidrs: Vec<String>,
    pub allow_lan: bool,
    pub max_ip_packet_bytes: usize,
    pub mtu: u16,
    pub timing: TunnelTiming,
}

struct PrewarmedSession {
    overlay: OverlaySession,
    handshake_ms: u32,
}

#[derive(Default)]
struct SessionPrewarmerShared {
    snapshot: SessionPrewarmSnapshot,
    ready_session: Option<PrewarmedSession>,
}

pub struct SessionPrewarmerHandle {
    shared: Arc<Mutex<SessionPrewarmerShared>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl SessionPrewarmerHandle {
    pub fn snapshot(&self) -> SessionPrewarmSnapshot {
        self.shared
            .lock()
            .expect("session prewarmer mutex poisoned")
            .snapshot
            .clone()
    }

    pub fn is_ready(&self) -> bool {
        let guard = self
            .shared
            .lock()
            .expect("session prewarmer mutex poisoned");
        guard.ready_session.is_some()
    }

    fn take_ready_overlay(&self) -> Option<PrewarmedSession> {
        let mut guard = self
            .shared
            .lock()
            .expect("session prewarmer mutex poisoned");
        let taken = guard.ready_session.take();
        if taken.is_some() {
            guard.snapshot.state = SessionPrewarmState::Idle;
            guard.snapshot.last_error_code = None;
        }
        taken
    }

    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

pub struct TunnelClientHandle {
    snapshot: Arc<Mutex<TunnelClientSnapshot>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl TunnelClientHandle {
    pub fn snapshot(&self) -> TunnelClientSnapshot {
        self.snapshot
            .lock()
            .expect("tunnel snapshot mutex poisoned")
            .clone()
    }

    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

pub fn start_default_tunnel_client(
    config: TunnelClientConfig,
) -> Result<TunnelClientHandle, TunnelClientError> {
    start_default_tunnel_client_with_prewarmer(config, None)
}

pub fn start_default_tunnel_client_with_prewarmer(
    config: TunnelClientConfig,
    prewarmer: Option<&SessionPrewarmerHandle>,
) -> Result<TunnelClientHandle, TunnelClientError> {
    if config.gateway_service.trim().is_empty() {
        return Err(TunnelClientError::InvalidConfig("gateway service required"));
    }
    if config.max_ip_packet_bytes == 0 {
        return Err(TunnelClientError::InvalidConfig(
            "max_ip_packet_bytes must be > 0",
        ));
    }
    let prewarmed = prewarmer.and_then(SessionPrewarmerHandle::take_ready_overlay);

    #[cfg(target_os = "linux")]
    {
        if std::env::var("ANIMUS_TUNNEL_USE_MOCK")
            .ok()
            .as_deref()
            .is_some_and(|value| value == "1")
        {
            return start_with_components(
                config,
                Box::new(MockTunDevice::new("mocktun0", 1500)),
                Box::new(MockRouteManager::default()),
                SystemClock,
                prewarmed,
            );
        }
        let tun = LinuxTunDevice::create(None, config.mtu)?;
        let route = LinuxRouteManager::new();
        start_with_components(
            config,
            Box::new(tun),
            Box::new(route),
            SystemClock,
            prewarmed,
        )
    }
    #[cfg(target_os = "android")]
    {
        let _ = prewarmed;
        Err(TunnelClientError::InvalidConfig(
            "android tunnel requires explicit tun fd entrypoint",
        ))
    }
    #[cfg(not(any(target_os = "linux", target_os = "android")))]
    {
        let _ = config;
        let _ = prewarmed;
        Err(TunnelClientError::Unsupported)
    }
}

#[cfg(target_os = "android")]
pub fn start_android_tunnel_client(
    config: TunnelClientConfig,
    tun_fd: i32,
) -> Result<TunnelClientHandle, TunnelClientError> {
    if config.gateway_service.trim().is_empty() {
        return Err(TunnelClientError::InvalidConfig("gateway service required"));
    }
    if config.max_ip_packet_bytes == 0 {
        return Err(TunnelClientError::InvalidConfig(
            "max_ip_packet_bytes must be > 0",
        ));
    }
    if tun_fd < 0 {
        return Err(TunnelClientError::InvalidConfig("tun fd must be >= 0"));
    }
    let tun = AndroidTunDevice::from_fd(tun_fd, config.mtu)?;
    start_with_components(
        config,
        Box::new(tun),
        Box::new(AndroidRouteManager::default()),
        SystemClock,
        None,
    )
}

fn start_with_components<C: Clock>(
    config: TunnelClientConfig,
    tun: Box<dyn TunDevice>,
    route: Box<dyn RouteManager>,
    clock: C,
    initial_overlay: Option<PrewarmedSession>,
) -> Result<TunnelClientHandle, TunnelClientError> {
    let snapshot = Arc::new(Mutex::new(TunnelClientSnapshot::default()));
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let shared_snapshot = Arc::clone(&snapshot);
    tokio::spawn(async move {
        run_tunnel_worker(
            config,
            tun,
            route,
            clock,
            shutdown_rx,
            shared_snapshot,
            initial_overlay,
        )
        .await;
    });
    Ok(TunnelClientHandle {
        snapshot,
        shutdown_tx: Some(shutdown_tx),
    })
}

pub fn start_session_prewarmer(
    config: TunnelClientConfig,
) -> Result<SessionPrewarmerHandle, TunnelClientError> {
    if config.gateway_service.trim().is_empty() {
        return Err(TunnelClientError::InvalidConfig("gateway service required"));
    }
    let shared = Arc::new(Mutex::new(SessionPrewarmerShared::default()));
    let shared_loop = Arc::clone(&shared);
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
    tokio::spawn(async move {
        let mut keepalive = tokio::time::interval(Duration::from_millis(PREWARM_KEEPALIVE_MS));
        keepalive.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            if shutdown_rx.try_recv().is_ok() {
                break;
            }

            if has_ready_session(&shared_loop) {
                tokio::select! {
                    _ = &mut shutdown_rx => break,
                    _ = keepalive.tick() => {
                        let mut ready = take_ready_session(&shared_loop);
                        if let Some(mut ready_session) = ready.take() {
                            let ping = TunnelMessage::Control(TunnelControl::AuthOk);
                            if send_tunnel_message(&mut ready_session.overlay, ping).await.is_ok() {
                                store_ready_session(&shared_loop, ready_session);
                                set_prewarm_snapshot(&shared_loop, SessionPrewarmState::Ready, None, false, false);
                            } else {
                                set_prewarm_snapshot(
                                    &shared_loop,
                                    SessionPrewarmState::Error,
                                    Some("prewarm_keepalive_failed"),
                                    false,
                                    true,
                                );
                            }
                        } else {
                            set_prewarm_snapshot(&shared_loop, SessionPrewarmState::Idle, None, false, false);
                        }
                    }
                }
                continue;
            }

            set_prewarm_snapshot(
                &shared_loop,
                SessionPrewarmState::Warming,
                None,
                true,
                false,
            );
            match connect_overlay(&config).await {
                Ok((overlay, handshake_ms)) => {
                    store_ready_session(
                        &shared_loop,
                        PrewarmedSession {
                            overlay,
                            handshake_ms,
                        },
                    );
                    set_prewarm_snapshot(
                        &shared_loop,
                        SessionPrewarmState::Ready,
                        None,
                        false,
                        false,
                    );
                }
                Err(_) => {
                    set_prewarm_snapshot(
                        &shared_loop,
                        SessionPrewarmState::Error,
                        Some("prewarm_connect_failed"),
                        false,
                        true,
                    );
                    tokio::select! {
                        _ = &mut shutdown_rx => break,
                        _ = sleep(Duration::from_millis(PREWARM_RETRY_MS)) => {}
                    }
                }
            }
        }
    });

    Ok(SessionPrewarmerHandle {
        shared,
        shutdown_tx: Some(shutdown_tx),
    })
}

fn set_prewarm_snapshot(
    shared: &Arc<Mutex<SessionPrewarmerShared>>,
    state: SessionPrewarmState,
    error_code: Option<&str>,
    increment_attempt: bool,
    increment_fail: bool,
) {
    let mut guard = shared.lock().expect("session prewarmer mutex poisoned");
    guard.snapshot.state = state;
    guard.snapshot.last_error_code = error_code.map(ToString::to_string);
    if increment_attempt {
        guard.snapshot.attempts_total = guard.snapshot.attempts_total.saturating_add(1);
    }
    if increment_fail {
        guard.snapshot.fail_total = guard.snapshot.fail_total.saturating_add(1);
    }
}

fn store_ready_session(shared: &Arc<Mutex<SessionPrewarmerShared>>, session: PrewarmedSession) {
    let mut guard = shared.lock().expect("session prewarmer mutex poisoned");
    guard.ready_session = Some(session);
}

fn take_ready_session(shared: &Arc<Mutex<SessionPrewarmerShared>>) -> Option<PrewarmedSession> {
    let mut guard = shared.lock().expect("session prewarmer mutex poisoned");
    guard.ready_session.take()
}

fn has_ready_session(shared: &Arc<Mutex<SessionPrewarmerShared>>) -> bool {
    shared
        .lock()
        .expect("session prewarmer mutex poisoned")
        .ready_session
        .is_some()
}

#[derive(Debug)]
struct DnsForwardRequest {
    query_id: u16,
    bytes: Vec<u8>,
}

#[derive(Debug)]
struct DnsForwardResponse {
    query_id: u16,
    bytes: Vec<u8>,
}

#[derive(Debug)]
struct InflightDnsQuery {
    source: SocketAddr,
    original_txid: [u8; 2],
    deadline: Instant,
}

struct DnsStubRuntime {
    listen_addr: SocketAddr,
    to_overlay_rx: mpsc::Receiver<DnsForwardRequest>,
    from_overlay_tx: mpsc::Sender<DnsForwardResponse>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl DnsStubRuntime {
    async fn start_for_mode(
        snapshot: Arc<Mutex<TunnelClientSnapshot>>,
        mode: TunnelDnsMode,
    ) -> Result<Self, TunnelClientError> {
        let bind_addr = dns_stub_bind_addr(mode).ok_or(TunnelClientError::InvalidConfig(
            "dns stub requires a remote dns mode",
        ))?;
        Self::start_with_bind_limits(
            snapshot,
            bind_addr,
            DNS_STUB_MAX_INFLIGHT,
            Duration::from_millis(DNS_STUB_TIMEOUT_MS),
        )
        .await
    }

    async fn start_with_bind_limits(
        snapshot: Arc<Mutex<TunnelClientSnapshot>>,
        bind_addr: SocketAddr,
        max_inflight: usize,
        query_timeout: Duration,
    ) -> Result<Self, TunnelClientError> {
        let socket = UdpSocket::bind(bind_addr)
            .await
            .map_err(|error| TunnelClientError::Io(error.to_string()))?;
        let listen_addr = socket
            .local_addr()
            .map_err(|error| TunnelClientError::Io(error.to_string()))?;
        let limits = TunnelLimits::default();
        let (to_overlay_tx, to_overlay_rx) =
            mpsc::channel::<DnsForwardRequest>(PACKET_QUEUE_CAPACITY);
        let (from_overlay_tx, mut from_overlay_rx) =
            mpsc::channel::<DnsForwardResponse>(PACKET_QUEUE_CAPACITY);
        let (shutdown_tx, mut shutdown_rx) = oneshot::channel();

        tokio::spawn(async move {
            let mut inflight = HashMap::<u16, InflightDnsQuery>::new();
            let mut next_query_id = 1u16;
            let mut recv_buf = vec![0u8; DNS_STUB_SOCKET_READ_BYTES.max(limits.max_dns_bytes)];
            let mut timeout_tick = tokio::time::interval(Duration::from_millis(25));
            timeout_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        break;
                    }
                    recv = socket.recv_from(recv_buf.as_mut_slice()) => {
                        let Ok((size, source)) = recv else {
                            increment_dns_failures(&snapshot);
                            continue;
                        };
                        if size < 2 || size > limits.max_dns_bytes {
                            increment_dns_failures(&snapshot);
                            if size >= 2 {
                                let txid = [recv_buf[0], recv_buf[1]];
                                let _ = socket.send_to(build_dns_servfail(txid).as_slice(), source).await;
                            }
                            continue;
                        }

                        if inflight.len() >= max_inflight {
                            increment_dns_failures(&snapshot);
                            let txid = [recv_buf[0], recv_buf[1]];
                            let _ = socket.send_to(build_dns_servfail(txid).as_slice(), source).await;
                            continue;
                        }

                        let mut query_id = next_query_id;
                        let mut attempts = 0usize;
                        while inflight.contains_key(&query_id) {
                            query_id = query_id.wrapping_add(1);
                            attempts = attempts.saturating_add(1);
                            if attempts >= u16::MAX as usize {
                                break;
                            }
                        }
                        if attempts >= u16::MAX as usize {
                            increment_dns_failures(&snapshot);
                            let txid = [recv_buf[0], recv_buf[1]];
                            let _ = socket.send_to(build_dns_servfail(txid).as_slice(), source).await;
                            continue;
                        }
                        next_query_id = query_id.wrapping_add(1);

                        inflight.insert(
                            query_id,
                            InflightDnsQuery {
                                source,
                                original_txid: [recv_buf[0], recv_buf[1]],
                                deadline: Instant::now() + query_timeout,
                            },
                        );

                        let request = DnsForwardRequest {
                            query_id,
                            bytes: recv_buf[..size].to_vec(),
                        };
                        match to_overlay_tx.try_send(request) {
                            Ok(()) => increment_dns_queries(&snapshot),
                            Err(_) => {
                                inflight.remove(&query_id);
                                increment_dns_failures(&snapshot);
                                let _ = socket
                                    .send_to(build_dns_servfail([recv_buf[0], recv_buf[1]]).as_slice(), source)
                                    .await;
                            }
                        }
                    }
                    response = from_overlay_rx.recv() => {
                        let Some(response) = response else {
                            break;
                        };
                        if response.bytes.len() > limits.max_dns_bytes {
                            increment_dns_failures(&snapshot);
                            continue;
                        }
                        if let Some(inflight_entry) = inflight.remove(&response.query_id) {
                            let _ = socket.send_to(response.bytes.as_slice(), inflight_entry.source).await;
                        }
                    }
                    _ = timeout_tick.tick() => {
                        let now = Instant::now();
                        let mut expired = Vec::new();
                        for (query_id, item) in &inflight {
                            if now >= item.deadline {
                                expired.push(*query_id);
                            }
                        }
                        for query_id in expired {
                            if let Some(item) = inflight.remove(&query_id) {
                                increment_dns_timeouts(&snapshot);
                                let _ = socket
                                    .send_to(build_dns_servfail(item.original_txid).as_slice(), item.source)
                                    .await;
                            }
                        }
                    }
                }
            }
        });

        Ok(Self {
            listen_addr,
            to_overlay_rx,
            from_overlay_tx,
            shutdown_tx: Some(shutdown_tx),
        })
    }

    fn stop(&mut self) {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
    }
}

fn build_dns_servfail(txid: [u8; 2]) -> [u8; 12] {
    [txid[0], txid[1], 0x81, 0x82, 0, 0, 0, 0, 0, 0, 0, 0]
}

fn dns_setup_error_code(mode: TunnelDnsMode, stage: DnsSetupStage) -> &'static str {
    match mode {
        TunnelDnsMode::RemoteStrict => match stage {
            DnsSetupStage::Bind => "dns_strict_bind_failed",
            DnsSetupStage::Config => "dns_strict_config_failed",
        },
        TunnelDnsMode::RemoteBestEffort => "dns_best_effort_unavailable",
        TunnelDnsMode::System => "dns_setup_failed",
    }
}

fn dns_stub_bind_addr(mode: TunnelDnsMode) -> Option<SocketAddr> {
    match mode {
        TunnelDnsMode::RemoteStrict => Some(SocketAddr::from(([127, 0, 0, 1], 53))),
        TunnelDnsMode::RemoteBestEffort => Some(SocketAddr::from(([127, 0, 0, 1], 0))),
        TunnelDnsMode::System => None,
    }
}

async fn run_tunnel_worker<C: Clock>(
    config: TunnelClientConfig,
    tun: Box<dyn TunDevice>,
    mut route: Box<dyn RouteManager>,
    clock: C,
    mut shutdown_rx: oneshot::Receiver<()>,
    snapshot: Arc<Mutex<TunnelClientSnapshot>>,
    initial_overlay: Option<PrewarmedSession>,
) {
    let mut machine = TunnelStateMachine::new(
        clock.clone(),
        to_machine_fail_mode(config.fail_mode),
        config.timing,
    );
    set_state(&snapshot, TunnelState::Enabling, true, false, None);
    machine.enable();

    let mut protected_endpoints = config.protected_endpoints.clone();
    protected_endpoints.push(config.relay_addr);
    let route_config = RouteConfig {
        tun_name: tun.name().to_string(),
        protected_endpoints,
        exclude_cidrs: config.exclude_cidrs.clone(),
        allow_lan: config.allow_lan,
    };
    let mut routes_active = true;
    let mut dns_active = false;
    let mut dns_stub = None::<DnsStubRuntime>;
    let stop_flag = Arc::new(AtomicBool::new(false));

    let apply_routes_result = route.apply_full_tunnel_routes(&route_config);
    if apply_routes_result.is_err() {
        let action = machine.dropped();
        handle_fail_action(
            &snapshot,
            &mut route,
            &route_config,
            action,
            config.dns_mode,
            &mut dns_active,
            None,
        );
        return;
    }
    if config.dns_mode.is_remote() {
        let started_stub =
            match DnsStubRuntime::start_for_mode(Arc::clone(&snapshot), config.dns_mode).await {
                Ok(stub) => stub,
                Err(_) => {
                    increment_dns_failures(&snapshot);
                    let action = machine.dropped();
                    handle_fail_action(
                        &snapshot,
                        &mut route,
                        &route_config,
                        action,
                        config.dns_mode,
                        &mut dns_active,
                        Some(dns_setup_error_code(config.dns_mode, DnsSetupStage::Bind)),
                    );
                    return;
                }
            };
        if route.apply_dns_remote(started_stub.listen_addr).is_err() {
            increment_dns_failures(&snapshot);
            let mut stopped_stub = started_stub;
            stopped_stub.stop();
            let action = machine.dropped();
            handle_fail_action(
                &snapshot,
                &mut route,
                &route_config,
                action,
                config.dns_mode,
                &mut dns_active,
                Some(dns_setup_error_code(config.dns_mode, DnsSetupStage::Config)),
            );
            return;
        }
        dns_stub = Some(started_stub);
        dns_active = true;
    }

    machine.routes_applied();
    let mut overlay = None::<OverlaySession>;
    if let Some(prewarmed) = initial_overlay {
        machine.connected();
        set_connected(&snapshot, prewarmed.handshake_ms);
        overlay = Some(prewarmed.overlay);
    } else {
        set_state(&snapshot, TunnelState::Connecting, true, false, None);
    }

    let tun_writer = match tun.try_clone_box() {
        Ok(writer) => Arc::new(Mutex::new(writer)),
        Err(_) => {
            let action = machine.dropped();
            handle_fail_action(
                &snapshot,
                &mut route,
                &route_config,
                action,
                config.dns_mode,
                &mut dns_active,
                None,
            );
            return;
        }
    };

    let (tun_packets_tx, mut tun_packets_rx) = mpsc::channel::<Vec<u8>>(PACKET_QUEUE_CAPACITY);
    let mut read_tun = match tun.try_clone_box() {
        Ok(reader) => reader,
        Err(_) => {
            let action = machine.dropped();
            handle_fail_action(
                &snapshot,
                &mut route,
                &route_config,
                action,
                config.dns_mode,
                &mut dns_active,
                None,
            );
            return;
        }
    };
    let reader_stop = Arc::clone(&stop_flag);
    std::thread::spawn(move || {
        let mut buf = vec![0u8; config.max_ip_packet_bytes.max(576)];
        while !reader_stop.load(Ordering::Relaxed) {
            match read_tun.read_packet(buf.as_mut_slice()) {
                Ok(0) => std::thread::sleep(Duration::from_millis(10)),
                Ok(read) => {
                    let packet = buf[..read].to_vec();
                    if tun_packets_tx.blocking_send(packet).is_err() {
                        break;
                    }
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(_) => break,
            }
        }
    });

    loop {
        if overlay.is_none() {
            match machine.tick() {
                StateAction::AttemptReconnect => {
                    set_state(
                        &snapshot,
                        TunnelState::Connecting,
                        true,
                        false,
                        Some("reconnecting"),
                    );
                    if !routes_active && route.apply_full_tunnel_routes(&route_config).is_ok() {
                        routes_active = true;
                        if config.dns_mode.is_remote() && !dns_active {
                            if let Some(stub) = dns_stub.as_ref() {
                                if route.apply_dns_remote(stub.listen_addr).is_ok() {
                                    dns_active = true;
                                } else {
                                    increment_dns_failures(&snapshot);
                                    let action = machine.dropped();
                                    handle_fail_action(
                                        &snapshot,
                                        &mut route,
                                        &route_config,
                                        action,
                                        config.dns_mode,
                                        &mut dns_active,
                                        Some(dns_setup_error_code(
                                            config.dns_mode,
                                            DnsSetupStage::Config,
                                        )),
                                    );
                                    routes_active = false;
                                    continue;
                                }
                            }
                        }
                    }
                }
                StateAction::RestoreRoutesFast => {
                    handle_fail_action(
                        &snapshot,
                        &mut route,
                        &route_config,
                        StateAction::RestoreRoutesFast,
                        config.dns_mode,
                        &mut dns_active,
                        None,
                    );
                    routes_active = false;
                }
                StateAction::ApplyFailClosedBlock => {
                    handle_fail_action(
                        &snapshot,
                        &mut route,
                        &route_config,
                        StateAction::ApplyFailClosedBlock,
                        config.dns_mode,
                        &mut dns_active,
                        None,
                    );
                    routes_active = false;
                }
                StateAction::None => {}
            }

            if machine.state == crate::state::TunnelState::Connecting {
                match connect_overlay(&config).await {
                    Ok((session, handshake_ms)) => {
                        machine.connected();
                        set_connected(&snapshot, handshake_ms);
                        overlay = Some(session);
                    }
                    Err(_) => {
                        increment_reconnects(&snapshot);
                        let action = machine.dropped();
                        handle_fail_action(
                            &snapshot,
                            &mut route,
                            &route_config,
                            action,
                            config.dns_mode,
                            &mut dns_active,
                            None,
                        );
                    }
                }
            }
        }

        match shutdown_rx.try_recv() {
            Ok(_) | Err(tokio::sync::oneshot::error::TryRecvError::Closed) => break,
            Err(tokio::sync::oneshot::error::TryRecvError::Empty) => {}
        }

        if let Some(session) = overlay.as_mut() {
            tokio::select! {
                packet = tun_packets_rx.recv() => {
                    let Some(packet) = packet else { break; };
                    if packet.len() > config.max_ip_packet_bytes {
                        continue;
                    }
                    let packet_len = packet.len().min(u64::MAX as usize) as u64;
                    let message = TunnelMessage::IpPacket { bytes: packet };
                    if send_tunnel_message(session, message).await.is_err() {
                        increment_reconnects(&snapshot);
                        let action = machine.dropped();
                        handle_fail_action(
                            &snapshot,
                            &mut route,
                            &route_config,
                            action,
                            config.dns_mode,
                            &mut dns_active,
                            None,
                        );
                        overlay = None;
                        continue;
                    }
                    increment_bytes_out(&snapshot, packet_len);
                }
                dns_request = async {
                    match dns_stub.as_mut() {
                        Some(stub) => stub.to_overlay_rx.recv().await,
                        None => None,
                    }
                }, if dns_stub.is_some() => {
                    let Some(dns_request) = dns_request else { continue; };
                    let message = TunnelMessage::DnsQuery {
                        query_id: dns_request.query_id,
                        bytes: dns_request.bytes.clone(),
                    };
                    if send_tunnel_message(session, message).await.is_err() {
                        increment_dns_failures(&snapshot);
                        if let Some(stub) = dns_stub.as_ref() {
                            let _ = stub.from_overlay_tx.try_send(DnsForwardResponse {
                                query_id: dns_request.query_id,
                                bytes: build_dns_servfail_from_query(dns_request.bytes.as_slice()),
                            });
                        }
                        increment_reconnects(&snapshot);
                        let action = machine.dropped();
                        handle_fail_action(
                            &snapshot,
                            &mut route,
                            &route_config,
                            action,
                            config.dns_mode,
                            &mut dns_active,
                            None,
                        );
                        overlay = None;
                        continue;
                    }
                }
                recv = session.channel.recv() => {
                    let Ok((_, packet)) = recv else {
                        increment_reconnects(&snapshot);
                        let action = machine.dropped();
                        handle_fail_action(
                            &snapshot,
                            &mut route,
                            &route_config,
                            action,
                            config.dns_mode,
                            &mut dns_active,
                            None,
                        );
                        overlay = None;
                        continue;
                    };
                    let Ok(handled) = session.session.handle_incoming(packet.as_slice()) else {
                        continue;
                    };
                    for outbound in handled.outbound {
                        let _ = session.channel.send(outbound.as_slice()).await;
                    }
                    for event in handled.events {
                        match event {
                            SessionEvent::Data { stream_id, payload } if stream_id == session.stream_id => {
                                if let Ok(MuxFrame::Data { bytes }) = decode_mux_frame(payload.as_slice()) {
                                    if let Ok(message) = decode_tunnel_message(bytes.as_slice(), TunnelLimits::default()) {
                                        match message {
                                            TunnelMessage::IpPacket { bytes } => {
                                                if bytes.len() <= config.max_ip_packet_bytes {
                                                    let writer = Arc::clone(&tun_writer);
                                                    let to_write = bytes;
                                                    let byte_len = to_write.len().min(u64::MAX as usize) as u64;
                                                    let _ = tokio::task::spawn_blocking(move || {
                                                        let mut guard = writer.lock().expect("tun writer lock poisoned");
                                                        let _ = guard.write_packet(to_write.as_slice());
                                                    }).await;
                                                    increment_bytes_in(&snapshot, byte_len);
                                                }
                                            }
                                            TunnelMessage::Control(TunnelControl::Error { code }) => {
                                                set_error(&snapshot, Some(code.as_str()));
                                            }
                                            TunnelMessage::DnsResponse { query_id, bytes } => {
                                                if let Some(stub) = dns_stub.as_ref() {
                                                    if stub.from_overlay_tx.try_send(DnsForwardResponse { query_id, bytes }).is_err() {
                                                        increment_dns_failures(&snapshot);
                                                    }
                                                }
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
                _ = sleep(Duration::from_millis(LOOP_TICK_MS)) => {}
            }
        } else {
            tokio::select! {
                dns_request = async {
                    match dns_stub.as_mut() {
                        Some(stub) => stub.to_overlay_rx.recv().await,
                        None => None,
                    }
                }, if dns_stub.is_some() => {
                    if let Some(dns_request) = dns_request {
                        increment_dns_failures(&snapshot);
                        if let Some(stub) = dns_stub.as_ref() {
                            let _ = stub.from_overlay_tx.try_send(DnsForwardResponse {
                                query_id: dns_request.query_id,
                                bytes: build_dns_servfail_from_query(dns_request.bytes.as_slice()),
                            });
                        }
                    }
                }
                _ = sleep(Duration::from_millis(LOOP_TICK_MS)) => {}
            }
        }
    }

    stop_flag.store(true, Ordering::Relaxed);
    set_state(
        &snapshot,
        TunnelState::Disabling,
        true,
        false,
        Some("disabling"),
    );
    if dns_active {
        let _ = route.restore_dns();
    }
    if let Some(stub) = dns_stub.as_mut() {
        stub.stop();
    }
    if routes_active {
        let _ = route.restore_routes();
    }
    set_state(&snapshot, TunnelState::Disabled, false, false, None);
}

struct OverlaySession {
    channel: RelayDatagramChannel,
    session: SecureSession<DeterministicPrimitives>,
    stream_id: u32,
}

async fn connect_overlay(
    config: &TunnelClientConfig,
) -> Result<(OverlaySession, u32), TunnelClientError> {
    let channel = RelayDatagramChannel::bind(
        loopback_datagram_addr(config.relay_addr),
        config.relay_addr,
        config.conn_id,
    )
    .await
    .map_err(|error| TunnelClientError::Session(error.to_string()))?;
    channel
        .allocate_and_bind(config.relay_token.as_str(), config.relay_ttl_secs.max(1))
        .await
        .map_err(|error| TunnelClientError::Session(error.to_string()))?;

    let mut session = SecureSession::new_initiator(
        config.conn_id,
        b"animus/fabric/v1/relay-first",
        DeterministicPrimitives::new(seed_for_role(config.conn_id, config.peer_id.as_str())),
    );
    let start = std::time::Instant::now();
    let msg1 = session
        .start_handshake(b"link-tunnel")
        .map_err(|error| TunnelClientError::Session(error.to_string()))?;
    channel
        .send(msg1.as_slice())
        .await
        .map_err(|error| TunnelClientError::Session(error.to_string()))?;
    let connect_timeout = Duration::from_millis(config.timing.connect_timeout_ms.max(1));
    tokio::time::timeout(connect_timeout, async {
        while !session.is_established() {
            let (_, packet) = channel
                .recv()
                .await
                .map_err(|error| TunnelClientError::Session(error.to_string()))?;
            let handled = session
                .handle_incoming(packet.as_slice())
                .map_err(|error| TunnelClientError::Session(error.to_string()))?;
            for outbound in handled.outbound {
                channel
                    .send(outbound.as_slice())
                    .await
                    .map_err(|error| TunnelClientError::Session(error.to_string()))?;
            }
        }
        Ok::<(), TunnelClientError>(())
    })
    .await
    .map_err(|_| TunnelClientError::Session("handshake timeout".to_string()))??;
    let handshake_ms = start.elapsed().as_millis().min(u32::MAX as u128) as u32;

    let stream_id = 1u32;
    let open = encode_mux_frame(&MuxFrame::Open {
        service: TUNNEL_STREAM_SERVICE.to_string(),
    })
    .map_err(|error| TunnelClientError::Session(error.to_string()))?;
    let encrypted = session
        .encrypt_data(stream_id, open.as_slice())
        .map_err(|error| TunnelClientError::Session(error.to_string()))?;
    channel
        .send(encrypted.as_slice())
        .await
        .map_err(|error| TunnelClientError::Session(error.to_string()))?;
    let auth = TunnelMessage::Control(TunnelControl::Auth {
        peer_id: config.peer_id.clone(),
    });
    let auth_payload = encode_tunnel_message(&auth)
        .map_err(|error| TunnelClientError::Session(error.to_string()))?;
    let auth_frame = encode_mux_frame(&MuxFrame::Data {
        bytes: auth_payload,
    })
    .map_err(|error| TunnelClientError::Session(error.to_string()))?;
    let encrypted = session
        .encrypt_data(stream_id, auth_frame.as_slice())
        .map_err(|error| TunnelClientError::Session(error.to_string()))?;
    channel
        .send(encrypted.as_slice())
        .await
        .map_err(|error| TunnelClientError::Session(error.to_string()))?;

    tokio::time::timeout(connect_timeout, async {
        loop {
            let (_, packet) = channel
                .recv()
                .await
                .map_err(|error| TunnelClientError::Session(error.to_string()))?;
            let handled = session
                .handle_incoming(packet.as_slice())
                .map_err(|error| TunnelClientError::Session(error.to_string()))?;
            for outbound in handled.outbound {
                channel
                    .send(outbound.as_slice())
                    .await
                    .map_err(|error| TunnelClientError::Session(error.to_string()))?;
            }
            for event in handled.events {
                if let SessionEvent::Data {
                    stream_id: sid,
                    payload,
                } = event
                {
                    if sid != stream_id {
                        continue;
                    }
                    if let Ok(MuxFrame::Data { bytes }) = decode_mux_frame(payload.as_slice()) {
                        if let Ok(TunnelMessage::Control(TunnelControl::AuthOk)) =
                            decode_tunnel_message(bytes.as_slice(), TunnelLimits::default())
                        {
                            return Ok::<(), TunnelClientError>(());
                        }
                    }
                }
            }
        }
    })
    .await
    .map_err(|_| TunnelClientError::Session("auth timeout".to_string()))??;

    Ok((
        OverlaySession {
            channel,
            session,
            stream_id,
        },
        handshake_ms,
    ))
}

async fn send_tunnel_message(
    session: &mut OverlaySession,
    message: TunnelMessage,
) -> Result<(), TunnelClientError> {
    let payload = encode_tunnel_message(&message)
        .map_err(|error| TunnelClientError::Session(error.to_string()))?;
    let frame = encode_mux_frame(&MuxFrame::Data { bytes: payload })
        .map_err(|error| TunnelClientError::Session(error.to_string()))?;
    let encrypted = session
        .session
        .encrypt_data(session.stream_id, frame.as_slice())
        .map_err(|error| TunnelClientError::Session(error.to_string()))?;
    session
        .channel
        .send(encrypted.as_slice())
        .await
        .map_err(|error| TunnelClientError::Session(error.to_string()))
}

fn set_state(
    snapshot: &Arc<Mutex<TunnelClientSnapshot>>,
    state: TunnelState,
    enabled: bool,
    connected: bool,
    error_code: Option<&str>,
) {
    let mut guard = snapshot.lock().expect("snapshot mutex poisoned");
    guard.state = state;
    guard.connected = connected;
    guard.last_error_code = error_code.map(ToString::to_string);
    guard.counters.tunnel_enabled = if enabled { 1 } else { 0 };
    guard.counters.tunnel_connected = if connected { 1 } else { 0 };
}

fn set_connected(snapshot: &Arc<Mutex<TunnelClientSnapshot>>, handshake_ms: u32) {
    let mut guard = snapshot.lock().expect("snapshot mutex poisoned");
    guard.state = TunnelState::Connected;
    guard.connected = true;
    guard.last_error_code = None;
    guard.handshake_ms = Some(handshake_ms);
    guard.counters.tunnel_enabled = 1;
    guard.counters.tunnel_connected = 1;
}

fn set_error(snapshot: &Arc<Mutex<TunnelClientSnapshot>>, error_code: Option<&str>) {
    let mut guard = snapshot.lock().expect("snapshot mutex poisoned");
    guard.state = TunnelState::Degraded;
    guard.connected = false;
    guard.last_error_code = error_code.map(ToString::to_string);
    guard.counters.tunnel_connected = 0;
}

fn increment_reconnects(snapshot: &Arc<Mutex<TunnelClientSnapshot>>) {
    let mut guard = snapshot.lock().expect("snapshot mutex poisoned");
    guard.reconnects = guard.reconnects.saturating_add(1);
    guard.counters.tunnel_reconnects_total =
        guard.counters.tunnel_reconnects_total.saturating_add(1);
}

fn increment_bytes_in(snapshot: &Arc<Mutex<TunnelClientSnapshot>>, bytes: u64) {
    let mut guard = snapshot.lock().expect("snapshot mutex poisoned");
    guard.counters.tunnel_bytes_in = guard.counters.tunnel_bytes_in.saturating_add(bytes);
}

fn increment_bytes_out(snapshot: &Arc<Mutex<TunnelClientSnapshot>>, bytes: u64) {
    let mut guard = snapshot.lock().expect("snapshot mutex poisoned");
    guard.counters.tunnel_bytes_out = guard.counters.tunnel_bytes_out.saturating_add(bytes);
}

fn increment_dns_queries(snapshot: &Arc<Mutex<TunnelClientSnapshot>>) {
    let mut guard = snapshot.lock().expect("snapshot mutex poisoned");
    guard.counters.dns_queries_total = guard.counters.dns_queries_total.saturating_add(1);
}

fn increment_dns_timeouts(snapshot: &Arc<Mutex<TunnelClientSnapshot>>) {
    let mut guard = snapshot.lock().expect("snapshot mutex poisoned");
    guard.counters.dns_timeouts_total = guard.counters.dns_timeouts_total.saturating_add(1);
}

fn increment_dns_failures(snapshot: &Arc<Mutex<TunnelClientSnapshot>>) {
    let mut guard = snapshot.lock().expect("snapshot mutex poisoned");
    guard.counters.dns_failures_total = guard.counters.dns_failures_total.saturating_add(1);
}

fn build_dns_servfail_from_query(query: &[u8]) -> Vec<u8> {
    if query.len() >= 2 {
        return build_dns_servfail([query[0], query[1]]).to_vec();
    }
    build_dns_servfail([0, 0]).to_vec()
}

fn handle_fail_action(
    snapshot: &Arc<Mutex<TunnelClientSnapshot>>,
    route: &mut Box<dyn RouteManager>,
    route_config: &RouteConfig,
    action: StateAction,
    dns_mode: TunnelDnsMode,
    dns_active: &mut bool,
    explicit_error_code: Option<&str>,
) {
    match action {
        StateAction::RestoreRoutesFast => {
            if *dns_active && dns_mode.is_remote() {
                let _ = route.restore_dns();
                *dns_active = false;
            }
            let _ = route.restore_routes();
            set_error(
                snapshot,
                Some(explicit_error_code.unwrap_or("fail_open_fast")),
            );
        }
        StateAction::ApplyFailClosedBlock => {
            let _ = route.apply_fail_closed_block(route_config);
            set_error(
                snapshot,
                Some(explicit_error_code.unwrap_or("fail_closed_blocked")),
            );
        }
        StateAction::AttemptReconnect | StateAction::None => {}
    }
}

fn to_machine_fail_mode(value: TunnelFailMode) -> MachineFailMode {
    match value {
        TunnelFailMode::OpenFast => MachineFailMode::OpenFast,
        TunnelFailMode::Closed => MachineFailMode::Closed,
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

fn seed_for_role(conn_id: u64, peer_id: &str) -> [u8; 32] {
    let mut input = Vec::with_capacity(peer_id.len() + 8);
    input.extend_from_slice(peer_id.as_bytes());
    input.extend_from_slice(&conn_id.to_le_bytes());
    simple_hash32(input.as_slice())
}

#[cfg(target_os = "linux")]
struct LinuxTunDevice {
    file: std::fs::File,
    name: String,
    mtu: u16,
}

#[cfg(target_os = "linux")]
impl LinuxTunDevice {
    fn create(name_hint: Option<&str>, mtu: u16) -> Result<Self, TunnelClientError> {
        const IFF_TUN: libc::c_short = 0x0001;
        const IFF_NO_PI: libc::c_short = 0x1000;
        const TUNSETIFF: libc::c_ulong = 0x400454ca;
        #[repr(C)]
        struct IfReq {
            ifr_name: [libc::c_char; libc::IFNAMSIZ],
            ifr_flags: libc::c_short,
            ifr_ifru: [u8; 24],
        }

        let file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open("/dev/net/tun")
            .map_err(|error| TunnelClientError::Io(error.to_string()))?;
        let mut ifr = IfReq {
            ifr_name: [0; libc::IFNAMSIZ],
            ifr_flags: IFF_TUN | IFF_NO_PI,
            ifr_ifru: [0; 24],
        };
        if let Some(hint) = name_hint {
            let bytes = hint.as_bytes();
            let max = libc::IFNAMSIZ.saturating_sub(1).min(bytes.len());
            for (index, byte) in bytes.iter().take(max).enumerate() {
                ifr.ifr_name[index] = *byte as libc::c_char;
            }
        }
        let result = unsafe { libc::ioctl(file.as_raw_fd(), TUNSETIFF, &mut ifr) };
        if result < 0 {
            return Err(TunnelClientError::Io(
                io::Error::last_os_error().to_string(),
            ));
        }
        let name_bytes: Vec<u8> = ifr
            .ifr_name
            .iter()
            .take_while(|byte| **byte != 0)
            .map(|byte| *byte as u8)
            .collect();
        let name = String::from_utf8(name_bytes).unwrap_or_else(|_| "tun0".to_string());
        Ok(Self { file, name, mtu })
    }
}

#[cfg(target_os = "linux")]
impl TunDevice for LinuxTunDevice {
    fn name(&self) -> &str {
        self.name.as_str()
    }

    fn mtu(&self) -> u16 {
        self.mtu
    }

    fn read_packet(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.file.read(buf)
    }

    fn write_packet(&mut self, packet: &[u8]) -> io::Result<()> {
        self.file.write_all(packet)
    }

    fn try_clone_box(&self) -> io::Result<Box<dyn TunDevice>> {
        let cloned = self.file.try_clone()?;
        Ok(Box::new(Self {
            file: cloned,
            name: self.name.clone(),
            mtu: self.mtu,
        }))
    }
}

#[cfg(target_os = "linux")]
use std::os::fd::AsRawFd;

#[cfg(target_os = "linux")]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
enum LinuxDnsMode {
    #[default]
    None,
    Resolvectl,
    ResolvConf,
}

#[cfg(target_os = "linux")]
#[derive(Default)]
struct LinuxRouteManager {
    original_default: Option<String>,
    resolv_conf_backup: Option<String>,
    active_tun_name: Option<String>,
    dns_mode: LinuxDnsMode,
}

#[cfg(target_os = "linux")]
impl LinuxRouteManager {
    fn new() -> Self {
        Self::default()
    }

    fn run_ip(args: &[&str]) -> Result<(), TunnelClientError> {
        let status = Command::new("ip")
            .args(args)
            .status()
            .map_err(|error| TunnelClientError::Route(error.to_string()))?;
        if !status.success() {
            return Err(TunnelClientError::Route(format!(
                "ip command failed: {:?}",
                args
            )));
        }
        Ok(())
    }

    fn read_default_route(&self) -> Result<String, TunnelClientError> {
        let output = Command::new("ip")
            .args(["-4", "route", "show", "default"])
            .output()
            .map_err(|error| TunnelClientError::Route(error.to_string()))?;
        if !output.status.success() {
            return Err(TunnelClientError::Route(
                "failed to read default route".to_string(),
            ));
        }
        let text = String::from_utf8_lossy(output.stdout.as_slice()).to_string();
        text.lines()
            .find(|line| !line.trim().is_empty())
            .map(ToString::to_string)
            .ok_or_else(|| TunnelClientError::Route("no default route available".to_string()))
    }

    fn parse_default(line: &str) -> (Option<String>, Option<String>) {
        let tokens: Vec<&str> = line.split_whitespace().collect();
        let via = tokens
            .windows(2)
            .find(|pair| pair[0] == "via")
            .map(|pair| pair[1].to_string());
        let dev = tokens
            .windows(2)
            .find(|pair| pair[0] == "dev")
            .map(|pair| pair[1].to_string());
        (via, dev)
    }

    fn apply_route_via_default(
        target: &str,
        via: Option<&str>,
        dev: Option<&str>,
    ) -> Result<(), TunnelClientError> {
        match (via, dev) {
            (Some(via), Some(dev)) => {
                Self::run_ip(&["-4", "route", "replace", target, "via", via, "dev", dev])
            }
            (None, Some(dev)) => Self::run_ip(&["-4", "route", "replace", target, "dev", dev]),
            _ => Ok(()),
        }
    }

    fn protected_ipv4_endpoints(config: &RouteConfig) -> BTreeSet<IpAddr> {
        config
            .protected_endpoints
            .iter()
            .map(SocketAddr::ip)
            .collect()
    }

    fn apply_protected_routes(
        config: &RouteConfig,
        via: Option<&str>,
        dev: Option<&str>,
    ) -> Result<(), TunnelClientError> {
        for endpoint in Self::protected_ipv4_endpoints(config) {
            if let IpAddr::V4(ipv4) = endpoint {
                let target = format!("{ipv4}/32");
                Self::apply_route_via_default(target.as_str(), via, dev)?;
            }
        }
        Ok(())
    }

    fn run_resolvectl(args: &[&str]) -> bool {
        Command::new("resolvectl")
            .args(args)
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}

#[cfg(target_os = "linux")]
impl RouteManager for LinuxRouteManager {
    fn apply_full_tunnel_routes(&mut self, config: &RouteConfig) -> Result<(), TunnelClientError> {
        if self.original_default.is_none() {
            self.original_default = Some(self.read_default_route()?);
        }
        let default = self.original_default.clone().ok_or_else(|| {
            TunnelClientError::Route("missing original default route".to_string())
        })?;
        let (via, dev) = Self::parse_default(default.as_str());
        self.active_tun_name = Some(config.tun_name.clone());

        Self::run_ip(&["link", "set", "dev", config.tun_name.as_str(), "up"])?;
        Self::run_ip(&[
            "-4",
            "route",
            "replace",
            "default",
            "dev",
            config.tun_name.as_str(),
        ])?;

        Self::apply_protected_routes(config, via.as_deref(), dev.as_deref())?;

        for cidr in &config.exclude_cidrs {
            let _ = Self::apply_route_via_default(cidr.as_str(), via.as_deref(), dev.as_deref());
        }
        if config.allow_lan {
            for cidr in ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"] {
                let _ = Self::apply_route_via_default(cidr, via.as_deref(), dev.as_deref());
            }
        }
        Ok(())
    }

    fn restore_routes(&mut self) -> Result<(), TunnelClientError> {
        if let Some(default_route) = self.original_default.as_deref() {
            let mut args = vec!["-4".to_string(), "route".to_string(), "replace".to_string()];
            args.extend(default_route.split_whitespace().map(ToString::to_string));
            let status = Command::new("ip")
                .args(args)
                .status()
                .map_err(|error| TunnelClientError::Route(error.to_string()))?;
            if !status.success() {
                return Err(TunnelClientError::Route(
                    "failed to restore default route".to_string(),
                ));
            }
        }
        Ok(())
    }

    fn apply_dns_remote(&mut self, local_dns: SocketAddr) -> Result<(), TunnelClientError> {
        if self.dns_mode != LinuxDnsMode::None {
            return Ok(());
        }
        let tun_name = self.active_tun_name.as_deref().ok_or_else(|| {
            TunnelClientError::Route("tunnel interface is not configured".to_string())
        })?;
        let server_arg = if local_dns.port() == 53 {
            local_dns.ip().to_string()
        } else {
            format!("{}:{}", local_dns.ip(), local_dns.port())
        };
        if Self::run_resolvectl(&["dns", tun_name, server_arg.as_str()])
            && Self::run_resolvectl(&["domain", tun_name, "~."])
            && Self::run_resolvectl(&["default-route", tun_name, "true"])
        {
            self.dns_mode = LinuxDnsMode::Resolvectl;
            return Ok(());
        }

        if local_dns.port() != 53 {
            return Err(TunnelClientError::Route(
                "remote dns requires resolvectl port-aware configuration on this distro"
                    .to_string(),
            ));
        }
        let resolv_path = "/etc/resolv.conf";
        if self.resolv_conf_backup.is_none() {
            let backup = std::fs::read_to_string(resolv_path)
                .map_err(|error| TunnelClientError::Route(error.to_string()))?;
            self.resolv_conf_backup = Some(backup);
        }
        let content = "nameserver 127.0.0.1\noptions timeout:1 attempts:2\n";
        std::fs::write(resolv_path, content)
            .map_err(|error| TunnelClientError::Route(error.to_string()))?;
        self.dns_mode = LinuxDnsMode::ResolvConf;
        Ok(())
    }

    fn restore_dns(&mut self) -> Result<(), TunnelClientError> {
        match self.dns_mode {
            LinuxDnsMode::Resolvectl => {
                if let Some(tun_name) = self.active_tun_name.as_deref() {
                    let _ = Self::run_resolvectl(&["revert", tun_name]);
                }
            }
            LinuxDnsMode::ResolvConf => {
                if let Some(previous) = self.resolv_conf_backup.take() {
                    std::fs::write("/etc/resolv.conf", previous)
                        .map_err(|error| TunnelClientError::Route(error.to_string()))?;
                }
            }
            LinuxDnsMode::None => {}
        }
        self.dns_mode = LinuxDnsMode::None;
        Ok(())
    }

    fn apply_fail_closed_block(&mut self, config: &RouteConfig) -> Result<(), TunnelClientError> {
        if self.original_default.is_none() {
            self.original_default = Some(self.read_default_route()?);
        }
        if let Some(default_route) = self.original_default.as_deref() {
            let (via, dev) = Self::parse_default(default_route);
            let _ = Self::apply_protected_routes(config, via.as_deref(), dev.as_deref());
            for cidr in &config.exclude_cidrs {
                let _ =
                    Self::apply_route_via_default(cidr.as_str(), via.as_deref(), dev.as_deref());
            }
            if config.allow_lan {
                for cidr in ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"] {
                    let _ = Self::apply_route_via_default(cidr, via.as_deref(), dev.as_deref());
                }
            }
        }
        Self::run_ip(&["-4", "route", "replace", "blackhole", "0.0.0.0/0"])
    }
}

#[cfg(target_os = "macos")]
pub struct MacOsTunDevice;

#[cfg(target_os = "macos")]
impl TunDevice for MacOsTunDevice {
    fn name(&self) -> &str {
        "utun-placeholder"
    }

    fn mtu(&self) -> u16 {
        1500
    }

    fn read_packet(&mut self, _buf: &mut [u8]) -> io::Result<usize> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "macOS utun runtime not implemented yet",
        ))
    }

    fn write_packet(&mut self, _packet: &[u8]) -> io::Result<()> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "macOS utun runtime not implemented yet",
        ))
    }

    fn try_clone_box(&self) -> io::Result<Box<dyn TunDevice>> {
        Ok(Box::new(Self))
    }
}

#[cfg(target_os = "windows")]
pub struct WindowsTunDevice;

#[cfg(target_os = "windows")]
impl TunDevice for WindowsTunDevice {
    fn name(&self) -> &str {
        "wintun-placeholder"
    }

    fn mtu(&self) -> u16 {
        1500
    }

    fn read_packet(&mut self, _buf: &mut [u8]) -> io::Result<usize> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "Windows wintun runtime not implemented yet",
        ))
    }

    fn write_packet(&mut self, _packet: &[u8]) -> io::Result<()> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "Windows wintun runtime not implemented yet",
        ))
    }

    fn try_clone_box(&self) -> io::Result<Box<dyn TunDevice>> {
        Ok(Box::new(Self))
    }
}

#[cfg(target_os = "android")]
struct AndroidTunDevice {
    file: std::fs::File,
    mtu: u16,
}

#[cfg(target_os = "android")]
impl AndroidTunDevice {
    fn from_fd(tun_fd: i32, mtu: u16) -> Result<Self, TunnelClientError> {
        use std::os::fd::FromRawFd;

        let duplicated = unsafe { libc::dup(tun_fd) };
        if duplicated < 0 {
            return Err(TunnelClientError::Io(
                io::Error::last_os_error().to_string(),
            ));
        }
        let file = unsafe { std::fs::File::from_raw_fd(duplicated) };
        Ok(Self { file, mtu })
    }
}

#[cfg(target_os = "android")]
impl TunDevice for AndroidTunDevice {
    fn name(&self) -> &str {
        "android-vpn0"
    }

    fn mtu(&self) -> u16 {
        self.mtu
    }

    fn read_packet(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.file.read(buf)
    }

    fn write_packet(&mut self, packet: &[u8]) -> io::Result<()> {
        self.file.write_all(packet)
    }

    fn try_clone_box(&self) -> io::Result<Box<dyn TunDevice>> {
        Ok(Box::new(Self {
            file: self.file.try_clone()?,
            mtu: self.mtu,
        }))
    }
}

#[cfg(target_os = "android")]
#[derive(Default)]
struct AndroidRouteManager;

#[cfg(target_os = "android")]
impl RouteManager for AndroidRouteManager {
    fn apply_full_tunnel_routes(&mut self, _config: &RouteConfig) -> Result<(), TunnelClientError> {
        // Android VPNService owns route and DNS configuration.
        Ok(())
    }

    fn restore_routes(&mut self) -> Result<(), TunnelClientError> {
        Ok(())
    }

    fn apply_dns_remote(&mut self, _local_dns: SocketAddr) -> Result<(), TunnelClientError> {
        Ok(())
    }

    fn restore_dns(&mut self) -> Result<(), TunnelClientError> {
        Ok(())
    }

    fn apply_fail_closed_block(&mut self, _config: &RouteConfig) -> Result<(), TunnelClientError> {
        // In mobile mode the VPN interface remains up, so packets stay blocked in the tunnel path.
        Ok(())
    }
}

#[cfg(target_os = "windows")]
#[derive(Default)]
pub struct PlatformRouteManager;

#[cfg(target_os = "windows")]
impl RouteManager for PlatformRouteManager {
    fn apply_full_tunnel_routes(&mut self, _config: &RouteConfig) -> Result<(), TunnelClientError> {
        Err(TunnelClientError::Unsupported)
    }

    fn restore_routes(&mut self) -> Result<(), TunnelClientError> {
        Ok(())
    }

    fn apply_dns_remote(&mut self, _local_dns: SocketAddr) -> Result<(), TunnelClientError> {
        Err(TunnelClientError::Unsupported)
    }

    fn restore_dns(&mut self) -> Result<(), TunnelClientError> {
        Ok(())
    }

    fn apply_fail_closed_block(&mut self, _config: &RouteConfig) -> Result<(), TunnelClientError> {
        Err(TunnelClientError::Unsupported)
    }
}

#[derive(Clone, Default)]
pub struct MockTunDevice {
    name: String,
    mtu: u16,
    incoming: Arc<Mutex<VecDeque<Vec<u8>>>>,
    outgoing: Arc<Mutex<VecDeque<Vec<u8>>>>,
}

impl MockTunDevice {
    pub fn new(name: &str, mtu: u16) -> Self {
        Self {
            name: name.to_string(),
            mtu,
            incoming: Arc::new(Mutex::new(VecDeque::new())),
            outgoing: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    pub fn push_incoming(&self, packet: Vec<u8>) {
        self.incoming
            .lock()
            .expect("mock tun incoming mutex poisoned")
            .push_back(packet);
    }

    pub fn pop_outgoing(&self) -> Option<Vec<u8>> {
        self.outgoing
            .lock()
            .expect("mock tun outgoing mutex poisoned")
            .pop_front()
    }
}

impl TunDevice for MockTunDevice {
    fn name(&self) -> &str {
        self.name.as_str()
    }

    fn mtu(&self) -> u16 {
        self.mtu
    }

    fn read_packet(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let mut guard = self
            .incoming
            .lock()
            .expect("mock tun incoming mutex poisoned");
        if let Some(packet) = guard.pop_front() {
            let len = packet.len().min(buf.len());
            buf[..len].copy_from_slice(&packet[..len]);
            return Ok(len);
        }
        Err(io::Error::new(io::ErrorKind::WouldBlock, "no packet"))
    }

    fn write_packet(&mut self, packet: &[u8]) -> io::Result<()> {
        self.outgoing
            .lock()
            .expect("mock tun outgoing mutex poisoned")
            .push_back(packet.to_vec());
        Ok(())
    }

    fn try_clone_box(&self) -> io::Result<Box<dyn TunDevice>> {
        Ok(Box::new(self.clone()))
    }
}

#[derive(Default)]
pub struct MockRouteManager {
    pub routes_applied: bool,
    pub dns_applied: bool,
    pub blocked: bool,
    pub dns_addr: Option<SocketAddr>,
    pub last_protected_routes: Vec<SocketAddr>,
}

impl RouteManager for MockRouteManager {
    fn apply_full_tunnel_routes(&mut self, config: &RouteConfig) -> Result<(), TunnelClientError> {
        self.routes_applied = true;
        self.last_protected_routes = config.protected_endpoints.clone();
        Ok(())
    }

    fn restore_routes(&mut self) -> Result<(), TunnelClientError> {
        self.routes_applied = false;
        Ok(())
    }

    fn apply_dns_remote(&mut self, local_dns: SocketAddr) -> Result<(), TunnelClientError> {
        self.dns_applied = true;
        self.dns_addr = Some(local_dns);
        Ok(())
    }

    fn restore_dns(&mut self) -> Result<(), TunnelClientError> {
        self.dns_applied = false;
        Ok(())
    }

    fn apply_fail_closed_block(&mut self, config: &RouteConfig) -> Result<(), TunnelClientError> {
        self.blocked = true;
        self.last_protected_routes = config.protected_endpoints.clone();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::{
        net::SocketAddr,
        sync::{Arc, Mutex},
        time::Duration,
    };

    use super::{
        dns_setup_error_code, dns_stub_bind_addr, handle_fail_action, set_prewarm_snapshot,
        start_with_components, DnsForwardResponse, DnsSetupStage, DnsStubRuntime, MockRouteManager,
        MockTunDevice, SessionPrewarmState, SessionPrewarmerShared, TunnelClientConfig,
        TunnelClientError, TunnelClientSnapshot, TunnelDnsMode, TunnelFailMode, TunnelState,
    };
    use crate::{
        route::{RouteConfig, RouteManager},
        state::{Clock, StateAction, TunnelTiming},
    };
    use tokio::{net::UdpSocket, time::timeout};

    #[derive(Clone, Copy)]
    struct TestClock;
    impl Clock for TestClock {
        fn now_ms(&self) -> u64 {
            0
        }
    }

    #[tokio::test]
    async fn start_with_mock_components_initializes_snapshot() {
        let config = TunnelClientConfig {
            relay_addr: "127.0.0.1:7777".parse().expect("relay addr"),
            protected_endpoints: vec!["127.0.0.1:7777".parse().expect("protected endpoint")],
            relay_token: "animus://rtok/v1/test.sig".to_string(),
            relay_ttl_secs: 30,
            conn_id: 1,
            gateway_service: "gateway-exit".to_string(),
            peer_id: "peer-b".to_string(),
            fail_mode: TunnelFailMode::OpenFast,
            dns_mode: TunnelDnsMode::System,
            exclude_cidrs: vec![],
            allow_lan: true,
            max_ip_packet_bytes: 2048,
            mtu: 1500,
            timing: TunnelTiming::default(),
        };
        let mut handle = start_with_components(
            config,
            Box::new(MockTunDevice::new("mock", 1500)),
            Box::new(MockRouteManager::default()),
            TestClock,
            None,
        )
        .expect("start tunnel client");
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
        let snapshot = handle.snapshot();
        assert!(snapshot.counters.tunnel_enabled <= 1);
        handle.stop();
    }

    #[derive(Default)]
    struct RouteSpyState {
        restore_routes_calls: u32,
        restore_dns_calls: u32,
        fail_closed_calls: u32,
        last_blocked_protected: Vec<SocketAddr>,
    }

    struct RouteSpy {
        state: Arc<Mutex<RouteSpyState>>,
    }

    impl RouteSpy {
        fn new(state: Arc<Mutex<RouteSpyState>>) -> Self {
            Self { state }
        }
    }

    impl RouteManager for RouteSpy {
        fn apply_full_tunnel_routes(
            &mut self,
            _config: &RouteConfig,
        ) -> Result<(), super::TunnelClientError> {
            Ok(())
        }

        fn restore_routes(&mut self) -> Result<(), super::TunnelClientError> {
            let mut guard = self.state.lock().expect("route spy mutex poisoned");
            guard.restore_routes_calls = guard.restore_routes_calls.saturating_add(1);
            Ok(())
        }

        fn apply_dns_remote(
            &mut self,
            _local_dns: SocketAddr,
        ) -> Result<(), super::TunnelClientError> {
            Ok(())
        }

        fn restore_dns(&mut self) -> Result<(), super::TunnelClientError> {
            let mut guard = self.state.lock().expect("route spy mutex poisoned");
            guard.restore_dns_calls = guard.restore_dns_calls.saturating_add(1);
            Ok(())
        }

        fn apply_fail_closed_block(
            &mut self,
            config: &RouteConfig,
        ) -> Result<(), super::TunnelClientError> {
            let mut guard = self.state.lock().expect("route spy mutex poisoned");
            guard.fail_closed_calls = guard.fail_closed_calls.saturating_add(1);
            guard.last_blocked_protected = config.protected_endpoints.clone();
            Ok(())
        }
    }

    fn test_route_config() -> RouteConfig {
        RouteConfig {
            tun_name: "mocktun0".to_string(),
            protected_endpoints: vec!["127.0.0.1:7777"
                .parse()
                .expect("protected endpoint must parse")],
            exclude_cidrs: vec![],
            allow_lan: false,
        }
    }

    #[test]
    fn fail_open_fast_restores_dns_and_routes() {
        let snapshot = Arc::new(Mutex::new(TunnelClientSnapshot::default()));
        let route_state = Arc::new(Mutex::new(RouteSpyState::default()));
        let mut route: Box<dyn RouteManager> = Box::new(RouteSpy::new(Arc::clone(&route_state)));
        let route_config = test_route_config();
        let mut dns_active = true;

        handle_fail_action(
            &snapshot,
            &mut route,
            &route_config,
            StateAction::RestoreRoutesFast,
            TunnelDnsMode::RemoteBestEffort,
            &mut dns_active,
            None,
        );

        let state = route_state.lock().expect("route spy mutex poisoned");
        assert_eq!(state.restore_dns_calls, 1);
        assert_eq!(state.restore_routes_calls, 1);
        assert_eq!(state.fail_closed_calls, 0);
        assert!(!dns_active);
        let guard = snapshot.lock().expect("snapshot mutex poisoned");
        assert_eq!(guard.state, TunnelState::Degraded);
        assert_eq!(guard.last_error_code.as_deref(), Some("fail_open_fast"));
    }

    #[test]
    fn fail_closed_keeps_protected_routes_in_block_config() {
        let snapshot = Arc::new(Mutex::new(TunnelClientSnapshot::default()));
        let route_state = Arc::new(Mutex::new(RouteSpyState::default()));
        let mut route: Box<dyn RouteManager> = Box::new(RouteSpy::new(Arc::clone(&route_state)));
        let route_config = test_route_config();
        let mut dns_active = true;

        handle_fail_action(
            &snapshot,
            &mut route,
            &route_config,
            StateAction::ApplyFailClosedBlock,
            TunnelDnsMode::RemoteBestEffort,
            &mut dns_active,
            None,
        );

        let state = route_state.lock().expect("route spy mutex poisoned");
        assert_eq!(state.restore_dns_calls, 0);
        assert_eq!(state.restore_routes_calls, 0);
        assert_eq!(state.fail_closed_calls, 1);
        assert_eq!(
            state.last_blocked_protected,
            route_config.protected_endpoints
        );
        assert!(dns_active);
        let guard = snapshot.lock().expect("snapshot mutex poisoned");
        assert_eq!(guard.state, TunnelState::Degraded);
        assert_eq!(
            guard.last_error_code.as_deref(),
            Some("fail_closed_blocked")
        );
    }

    #[test]
    fn strict_dns_failures_use_stable_error_codes() {
        assert_eq!(
            dns_setup_error_code(TunnelDnsMode::RemoteStrict, DnsSetupStage::Bind),
            "dns_strict_bind_failed"
        );
        assert_eq!(
            dns_setup_error_code(TunnelDnsMode::RemoteStrict, DnsSetupStage::Config),
            "dns_strict_config_failed"
        );
        assert_eq!(
            dns_setup_error_code(TunnelDnsMode::RemoteBestEffort, DnsSetupStage::Bind),
            "dns_best_effort_unavailable"
        );
    }

    #[test]
    fn dns_stub_bind_mode_selection_is_deterministic() {
        assert_eq!(
            dns_stub_bind_addr(TunnelDnsMode::RemoteStrict),
            Some(SocketAddr::from(([127, 0, 0, 1], 53)))
        );
        assert_eq!(
            dns_stub_bind_addr(TunnelDnsMode::RemoteBestEffort),
            Some(SocketAddr::from(([127, 0, 0, 1], 0)))
        );
        assert_eq!(dns_stub_bind_addr(TunnelDnsMode::System), None);
    }

    #[test]
    fn strict_bind_failure_open_fast_restores_and_reports_code() {
        let snapshot = Arc::new(Mutex::new(TunnelClientSnapshot::default()));
        let route_state = Arc::new(Mutex::new(RouteSpyState::default()));
        let mut route: Box<dyn RouteManager> = Box::new(RouteSpy::new(Arc::clone(&route_state)));
        let route_config = test_route_config();
        let mut dns_active = true;
        handle_fail_action(
            &snapshot,
            &mut route,
            &route_config,
            StateAction::RestoreRoutesFast,
            TunnelDnsMode::RemoteStrict,
            &mut dns_active,
            Some("dns_strict_bind_failed"),
        );
        let state = route_state.lock().expect("route spy mutex poisoned");
        assert_eq!(state.restore_routes_calls, 1);
        assert_eq!(state.restore_dns_calls, 1);
        assert!(!dns_active);
        let guard = snapshot.lock().expect("snapshot mutex poisoned");
        assert_eq!(guard.state, TunnelState::Degraded);
        assert_eq!(
            guard.last_error_code.as_deref(),
            Some("dns_strict_bind_failed")
        );
    }

    #[test]
    fn strict_config_failure_closed_blocks_and_reports_code() {
        let snapshot = Arc::new(Mutex::new(TunnelClientSnapshot::default()));
        let route_state = Arc::new(Mutex::new(RouteSpyState::default()));
        let mut route: Box<dyn RouteManager> = Box::new(RouteSpy::new(Arc::clone(&route_state)));
        let route_config = test_route_config();
        let mut dns_active = true;
        handle_fail_action(
            &snapshot,
            &mut route,
            &route_config,
            StateAction::ApplyFailClosedBlock,
            TunnelDnsMode::RemoteStrict,
            &mut dns_active,
            Some("dns_strict_config_failed"),
        );
        let state = route_state.lock().expect("route spy mutex poisoned");
        assert_eq!(state.fail_closed_calls, 1);
        assert_eq!(
            state.last_blocked_protected,
            route_config.protected_endpoints
        );
        assert!(dns_active);
        let guard = snapshot.lock().expect("snapshot mutex poisoned");
        assert_eq!(guard.state, TunnelState::Degraded);
        assert_eq!(
            guard.last_error_code.as_deref(),
            Some("dns_strict_config_failed")
        );
    }

    #[test]
    fn prewarm_snapshot_transitions_to_ready_deterministically() {
        let shared = Arc::new(Mutex::new(SessionPrewarmerShared::default()));
        set_prewarm_snapshot(&shared, SessionPrewarmState::Warming, None, true, false);
        set_prewarm_snapshot(&shared, SessionPrewarmState::Ready, None, false, false);
        let snapshot = shared
            .lock()
            .expect("session prewarmer mutex poisoned")
            .snapshot
            .clone();
        assert_eq!(snapshot.state, SessionPrewarmState::Ready);
        assert_eq!(snapshot.attempts_total, 1);
        assert_eq!(snapshot.fail_total, 0);
    }

    #[test]
    fn prewarm_snapshot_error_increments_fail_counter() {
        let shared = Arc::new(Mutex::new(SessionPrewarmerShared::default()));
        set_prewarm_snapshot(
            &shared,
            SessionPrewarmState::Error,
            Some("prewarm_connect_failed"),
            true,
            true,
        );
        let snapshot = shared
            .lock()
            .expect("session prewarmer mutex poisoned")
            .snapshot
            .clone();
        assert_eq!(snapshot.state, SessionPrewarmState::Error);
        assert_eq!(
            snapshot.last_error_code.as_deref(),
            Some("prewarm_connect_failed")
        );
        assert_eq!(snapshot.attempts_total, 1);
        assert_eq!(snapshot.fail_total, 1);
    }

    fn sample_dns_query(txid: [u8; 2]) -> Vec<u8> {
        vec![txid[0], txid[1], 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0]
    }

    fn dns_bind_blocked(error: &TunnelClientError) -> bool {
        matches!(error, TunnelClientError::Io(message) if message.contains("Operation not permitted"))
    }

    #[tokio::test]
    async fn dns_stub_roundtrip_over_channels() {
        let snapshot = Arc::new(Mutex::new(TunnelClientSnapshot::default()));
        let start_result = DnsStubRuntime::start_with_bind_limits(
            Arc::clone(&snapshot),
            SocketAddr::from(([127, 0, 0, 1], 0)),
            8,
            Duration::from_millis(200),
        )
        .await;
        let mut stub = match start_result {
            Ok(stub) => stub,
            Err(error) if dns_bind_blocked(&error) => return,
            Err(error) => panic!("start dns stub: {error}"),
        };
        let client = UdpSocket::bind("127.0.0.1:0").await.expect("client bind");
        let query = sample_dns_query([0x12, 0x34]);
        client
            .send_to(query.as_slice(), stub.listen_addr)
            .await
            .expect("send query");

        let request = timeout(Duration::from_millis(200), stub.to_overlay_rx.recv())
            .await
            .expect("dns query must arrive")
            .expect("dns request value");
        assert_eq!(request.bytes, query);

        let mut response = sample_dns_query([0x12, 0x34]);
        response[2] = 0x81;
        response[3] = 0x80;
        stub.from_overlay_tx
            .send(DnsForwardResponse {
                query_id: request.query_id,
                bytes: response.clone(),
            })
            .await
            .expect("send dns response to stub");

        let mut recv_buf = [0u8; 256];
        let (recv_len, _) = timeout(Duration::from_millis(200), client.recv_from(&mut recv_buf))
            .await
            .expect("dns client receive should finish")
            .expect("dns client receive");
        assert_eq!(&recv_buf[..recv_len], response.as_slice());

        let guard = snapshot.lock().expect("snapshot mutex poisoned");
        assert_eq!(guard.counters.dns_queries_total, 1);
        assert_eq!(guard.counters.dns_timeouts_total, 0);
        stub.stop();
    }

    #[tokio::test]
    async fn dns_stub_enforces_inflight_cap() {
        let snapshot = Arc::new(Mutex::new(TunnelClientSnapshot::default()));
        let start_result = DnsStubRuntime::start_with_bind_limits(
            Arc::clone(&snapshot),
            SocketAddr::from(([127, 0, 0, 1], 0)),
            1,
            Duration::from_millis(400),
        )
        .await;
        let mut stub = match start_result {
            Ok(stub) => stub,
            Err(error) if dns_bind_blocked(&error) => return,
            Err(error) => panic!("start dns stub: {error}"),
        };
        let client = UdpSocket::bind("127.0.0.1:0").await.expect("client bind");

        let first_query = sample_dns_query([0x00, 0x01]);
        client
            .send_to(first_query.as_slice(), stub.listen_addr)
            .await
            .expect("send first query");
        let _ = timeout(Duration::from_millis(200), stub.to_overlay_rx.recv())
            .await
            .expect("first query should be forwarded")
            .expect("forwarded query value");

        let second_query = sample_dns_query([0x00, 0x02]);
        client
            .send_to(second_query.as_slice(), stub.listen_addr)
            .await
            .expect("send second query");
        let mut recv_buf = [0u8; 128];
        let (recv_len, _) = timeout(Duration::from_millis(200), client.recv_from(&mut recv_buf))
            .await
            .expect("client must receive inflight rejection")
            .expect("recv rejection");
        assert_eq!(recv_len, 12);
        assert_eq!(&recv_buf[0..2], &[0x00, 0x02]);
        assert_eq!(recv_buf[3] & 0x0f, 0x02);

        assert!(
            timeout(Duration::from_millis(80), stub.to_overlay_rx.recv())
                .await
                .is_err()
        );
        stub.stop();
    }

    #[tokio::test]
    async fn dns_stub_times_out_pending_queries() {
        let snapshot = Arc::new(Mutex::new(TunnelClientSnapshot::default()));
        let start_result = DnsStubRuntime::start_with_bind_limits(
            Arc::clone(&snapshot),
            SocketAddr::from(([127, 0, 0, 1], 0)),
            8,
            Duration::from_millis(80),
        )
        .await;
        let mut stub = match start_result {
            Ok(stub) => stub,
            Err(error) if dns_bind_blocked(&error) => return,
            Err(error) => panic!("start dns stub: {error}"),
        };
        let client = UdpSocket::bind("127.0.0.1:0").await.expect("client bind");

        let query = sample_dns_query([0xab, 0xcd]);
        client
            .send_to(query.as_slice(), stub.listen_addr)
            .await
            .expect("send query");
        let _ = timeout(Duration::from_millis(200), stub.to_overlay_rx.recv())
            .await
            .expect("query should be forwarded")
            .expect("forwarded query");

        let mut recv_buf = [0u8; 128];
        let (recv_len, _) = timeout(Duration::from_millis(300), client.recv_from(&mut recv_buf))
            .await
            .expect("timeout response expected")
            .expect("receive timeout response");
        assert_eq!(recv_len, 12);
        assert_eq!(&recv_buf[0..2], &[0xab, 0xcd]);
        assert_eq!(recv_buf[3] & 0x0f, 0x02);

        let guard = snapshot.lock().expect("snapshot mutex poisoned");
        assert_eq!(guard.counters.dns_timeouts_total, 1);
        stub.stop();
    }
}
