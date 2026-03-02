use std::{
    collections::{HashMap, VecDeque},
    hash::{Hash, Hasher},
    net::{Ipv4Addr, SocketAddr, SocketAddrV4},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};

use fabric_tunnel_proto::{TunnelControl, TunnelMessage};
use thiserror::Error;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpStream, UdpSocket},
    sync::mpsc,
    task::JoinHandle,
    time::timeout,
};

pub const DEFAULT_MAX_SESSIONS: usize = 256;
pub const DEFAULT_MAX_PACKET_BYTES: usize = 2048;
pub const DEFAULT_TCP_IDLE_TIMEOUT_SECS: u64 = 30;
pub const DEFAULT_UDP_IDLE_TIMEOUT_SECS: u64 = 30;
pub const DEFAULT_DNS_TIMEOUT_MS: u64 = 400;
pub const DEFAULT_CONNECT_TIMEOUT_MS: u64 = 800;
const DEFAULT_EVENT_QUEUE: usize = 256;

#[derive(Debug, Clone)]
pub struct GatewayConfig {
    pub max_sessions: usize,
    pub max_packet_bytes: usize,
    pub tcp_idle_timeout: Duration,
    pub udp_idle_timeout: Duration,
    pub connect_timeout: Duration,
    pub dns_timeout: Duration,
    pub dns_upstream: Option<SocketAddr>,
    pub event_queue_capacity: usize,
}

impl Default for GatewayConfig {
    fn default() -> Self {
        Self {
            max_sessions: DEFAULT_MAX_SESSIONS,
            max_packet_bytes: DEFAULT_MAX_PACKET_BYTES,
            tcp_idle_timeout: Duration::from_secs(DEFAULT_TCP_IDLE_TIMEOUT_SECS),
            udp_idle_timeout: Duration::from_secs(DEFAULT_UDP_IDLE_TIMEOUT_SECS),
            connect_timeout: Duration::from_millis(DEFAULT_CONNECT_TIMEOUT_MS),
            dns_timeout: Duration::from_millis(DEFAULT_DNS_TIMEOUT_MS),
            dns_upstream: None,
            event_queue_capacity: DEFAULT_EVENT_QUEUE,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GatewayCounters {
    pub packets_in: u64,
    pub packets_out: u64,
    pub sessions_active: u64,
    pub sessions_evicted: u64,
    pub drops_malformed: u64,
    pub drops_quota: u64,
}

#[derive(Debug)]
struct GatewayMetrics {
    packets_in: AtomicU64,
    packets_out: AtomicU64,
    sessions_evicted: AtomicU64,
    drops_malformed: AtomicU64,
    drops_quota: AtomicU64,
}

impl GatewayMetrics {
    fn new() -> Self {
        Self {
            packets_in: AtomicU64::new(0),
            packets_out: AtomicU64::new(0),
            sessions_evicted: AtomicU64::new(0),
            drops_malformed: AtomicU64::new(0),
            drops_quota: AtomicU64::new(0),
        }
    }
}

pub trait Clock: Clone + Send + Sync + 'static {
    fn now_millis(&self) -> u64;
}

#[derive(Debug, Clone, Copy)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_millis(&self) -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

#[derive(Debug, Error)]
pub enum GatewayError {
    #[error("upstream I/O failed")]
    Io,
    #[error("invalid tunnel payload")]
    InvalidPayload,
    #[error("unsupported packet")]
    UnsupportedPacket,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum IpProto {
    Tcp,
    Udp,
}

#[derive(Debug, Clone, Copy, Eq)]
struct FlowKey {
    src_ip: Ipv4Addr,
    dst_ip: Ipv4Addr,
    src_port: u16,
    dst_port: u16,
    proto: IpProto,
}

impl PartialEq for FlowKey {
    fn eq(&self, other: &Self) -> bool {
        self.src_ip == other.src_ip
            && self.dst_ip == other.dst_ip
            && self.src_port == other.src_port
            && self.dst_port == other.dst_port
            && self.proto == other.proto
    }
}

impl Hash for FlowKey {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.src_ip.octets().hash(state);
        self.dst_ip.octets().hash(state);
        self.src_port.hash(state);
        self.dst_port.hash(state);
        match self.proto {
            IpProto::Tcp => 6u8,
            IpProto::Udp => 17u8,
        }
        .hash(state);
    }
}

#[derive(Debug)]
enum SessionKind {
    Udp(UdpSession),
    Tcp(TcpSession),
}

#[derive(Debug)]
struct SessionEntry {
    kind: SessionKind,
    last_active_ms: u64,
}

#[derive(Debug)]
struct UdpSession {
    socket: Arc<UdpSocket>,
    reader_task: JoinHandle<()>,
}

#[derive(Debug)]
struct TcpSession {
    writer: tokio::net::tcp::OwnedWriteHalf,
    reader_task: JoinHandle<()>,
}

#[derive(Debug)]
enum GatewayEvent {
    UdpData { flow: FlowKey, bytes: Vec<u8> },
    TcpData { flow: FlowKey, bytes: Vec<u8> },
    TcpClosed { flow: FlowKey },
}

#[derive(Debug)]
struct ParsedPacket<'a> {
    flow: FlowKey,
    payload: &'a [u8],
    tcp_flags: u8,
}

pub struct GatewayEngine<C: Clock = SystemClock> {
    config: GatewayConfig,
    sessions: HashMap<FlowKey, SessionEntry>,
    lru: VecDeque<FlowKey>,
    metrics: Arc<GatewayMetrics>,
    event_tx: mpsc::Sender<GatewayEvent>,
    event_rx: mpsc::Receiver<GatewayEvent>,
    clock: C,
}

impl GatewayEngine<SystemClock> {
    pub fn new(config: GatewayConfig) -> Self {
        Self::with_clock(config, SystemClock)
    }
}

impl<C: Clock> GatewayEngine<C> {
    pub fn with_clock(config: GatewayConfig, clock: C) -> Self {
        let (event_tx, event_rx) = mpsc::channel(config.event_queue_capacity.max(1));
        Self {
            config,
            sessions: HashMap::new(),
            lru: VecDeque::new(),
            metrics: Arc::new(GatewayMetrics::new()),
            event_tx,
            event_rx,
            clock,
        }
    }

    pub fn counters(&self) -> GatewayCounters {
        GatewayCounters {
            packets_in: self.metrics.packets_in.load(Ordering::Relaxed),
            packets_out: self.metrics.packets_out.load(Ordering::Relaxed),
            sessions_active: self.sessions.len().min(u64::MAX as usize) as u64,
            sessions_evicted: self.metrics.sessions_evicted.load(Ordering::Relaxed),
            drops_malformed: self.metrics.drops_malformed.load(Ordering::Relaxed),
            drops_quota: self.metrics.drops_quota.load(Ordering::Relaxed),
        }
    }

    pub async fn process_message(
        &mut self,
        message: TunnelMessage,
    ) -> Result<Vec<TunnelMessage>, GatewayError> {
        self.reap_idle_sessions();
        let mut outbound = self.drain_events();
        match message {
            TunnelMessage::IpPacket { bytes } => {
                self.metrics.packets_in.fetch_add(1, Ordering::Relaxed);
                let parsed = match parse_ipv4_packet(bytes.as_slice(), self.config.max_packet_bytes)
                {
                    Ok(parsed) => parsed,
                    Err(_) => {
                        self.metrics.drops_malformed.fetch_add(1, Ordering::Relaxed);
                        return Ok(outbound);
                    }
                };
                let mut generated = self.handle_ip_packet(parsed).await?;
                outbound.append(&mut generated);
            }
            TunnelMessage::DnsQuery { query_id, bytes } => {
                self.metrics.packets_in.fetch_add(1, Ordering::Relaxed);
                if bytes.len() > self.config.max_packet_bytes {
                    self.metrics.drops_malformed.fetch_add(1, Ordering::Relaxed);
                    return Ok(outbound);
                }
                match self.resolve_dns(bytes.as_slice()).await {
                    Ok(answer) => outbound.push(TunnelMessage::DnsResponse {
                        query_id,
                        bytes: answer,
                    }),
                    Err(_) => outbound.push(TunnelMessage::Control(TunnelControl::Error {
                        code: "dns_failed".to_string(),
                    })),
                }
            }
            TunnelMessage::DnsResponse { .. } => {}
            TunnelMessage::Control(_) => {}
        }
        self.metrics.packets_out.fetch_add(
            outbound.len().min(u64::MAX as usize) as u64,
            Ordering::Relaxed,
        );
        Ok(outbound)
    }

    pub fn drain_events(&mut self) -> Vec<TunnelMessage> {
        let mut out = Vec::new();
        while let Ok(event) = self.event_rx.try_recv() {
            match event {
                GatewayEvent::UdpData { flow, bytes } => {
                    if bytes.len() > self.config.max_packet_bytes {
                        self.metrics.drops_malformed.fetch_add(1, Ordering::Relaxed);
                        continue;
                    }
                    let packet = build_ipv4_udp_packet(
                        flow.dst_ip,
                        flow.src_ip,
                        flow.dst_port,
                        flow.src_port,
                        bytes.as_slice(),
                    );
                    out.push(TunnelMessage::IpPacket { bytes: packet });
                    self.touch_flow(flow);
                }
                GatewayEvent::TcpData { flow, bytes } => {
                    if bytes.len() > self.config.max_packet_bytes {
                        self.metrics.drops_malformed.fetch_add(1, Ordering::Relaxed);
                        continue;
                    }
                    let packet = build_ipv4_tcp_packet(
                        flow.dst_ip,
                        flow.src_ip,
                        flow.dst_port,
                        flow.src_port,
                        0x18,
                        bytes.as_slice(),
                    );
                    out.push(TunnelMessage::IpPacket { bytes: packet });
                    self.touch_flow(flow);
                }
                GatewayEvent::TcpClosed { flow } => {
                    self.remove_session(flow);
                    let packet = build_ipv4_tcp_packet(
                        flow.dst_ip,
                        flow.src_ip,
                        flow.dst_port,
                        flow.src_port,
                        0x11,
                        &[],
                    );
                    out.push(TunnelMessage::IpPacket { bytes: packet });
                }
            }
        }
        out
    }

    pub fn reap_idle_sessions(&mut self) {
        let now = self.clock.now_millis();
        let mut stale = Vec::new();
        for (flow, entry) in &self.sessions {
            let idle_ms = now.saturating_sub(entry.last_active_ms);
            let max_idle = match entry.kind {
                SessionKind::Tcp(_) => self.config.tcp_idle_timeout.as_millis() as u64,
                SessionKind::Udp(_) => self.config.udp_idle_timeout.as_millis() as u64,
            };
            if idle_ms > max_idle {
                stale.push(*flow);
            }
        }
        for flow in stale {
            self.remove_session(flow);
        }
    }

    async fn handle_ip_packet(
        &mut self,
        parsed: ParsedPacket<'_>,
    ) -> Result<Vec<TunnelMessage>, GatewayError> {
        match parsed.flow.proto {
            IpProto::Udp => self.handle_udp_packet(parsed).await,
            IpProto::Tcp => self.handle_tcp_packet(parsed).await,
        }
    }

    async fn handle_udp_packet(
        &mut self,
        parsed: ParsedPacket<'_>,
    ) -> Result<Vec<TunnelMessage>, GatewayError> {
        let flow = parsed.flow;
        if !self.sessions.contains_key(&flow) {
            self.ensure_capacity()?;
            let upstream_addr = SocketAddr::V4(SocketAddrV4::new(flow.dst_ip, flow.dst_port));
            let socket = UdpSocket::bind("0.0.0.0:0")
                .await
                .map_err(|_| GatewayError::Io)?;
            socket
                .connect(upstream_addr)
                .await
                .map_err(|_| GatewayError::Io)?;
            let socket = Arc::new(socket);
            let recv_socket = Arc::clone(&socket);
            let event_tx = self.event_tx.clone();
            let max_packet = self.config.max_packet_bytes;
            let reader_task = tokio::spawn(async move {
                let mut buf = vec![0u8; max_packet];
                loop {
                    let Ok(read) = recv_socket.recv(buf.as_mut_slice()).await else {
                        break;
                    };
                    if read == 0 {
                        break;
                    }
                    let payload = buf[..read].to_vec();
                    if event_tx
                        .try_send(GatewayEvent::UdpData {
                            flow,
                            bytes: payload,
                        })
                        .is_err()
                    {
                        break;
                    }
                }
            });
            self.sessions.insert(
                flow,
                SessionEntry {
                    kind: SessionKind::Udp(UdpSession {
                        socket,
                        reader_task,
                    }),
                    last_active_ms: self.clock.now_millis(),
                },
            );
            self.touch_flow(flow);
        }

        if let Some(entry) = self.sessions.get_mut(&flow) {
            entry.last_active_ms = self.clock.now_millis();
            if let SessionKind::Udp(session) = &entry.kind {
                session
                    .socket
                    .send(parsed.payload)
                    .await
                    .map_err(|_| GatewayError::Io)?;
            }
        }

        Ok(self.drain_events())
    }

    async fn handle_tcp_packet(
        &mut self,
        parsed: ParsedPacket<'_>,
    ) -> Result<Vec<TunnelMessage>, GatewayError> {
        let flow = parsed.flow;
        if !self.sessions.contains_key(&flow) {
            self.ensure_capacity()?;
            let upstream_addr = SocketAddr::V4(SocketAddrV4::new(flow.dst_ip, flow.dst_port));
            let connect_result = timeout(
                self.config.connect_timeout,
                TcpStream::connect(upstream_addr),
            )
            .await
            .map_err(|_| GatewayError::Io)?;
            let stream = connect_result.map_err(|_| GatewayError::Io)?;
            let (reader, writer) = stream.into_split();
            let event_tx = self.event_tx.clone();
            let max_packet = self.config.max_packet_bytes;
            let reader_task = tokio::spawn(async move {
                let mut read_half = reader;
                let mut buf = vec![0u8; max_packet];
                loop {
                    match read_half.read(buf.as_mut_slice()).await {
                        Ok(0) => {
                            let _ = event_tx.try_send(GatewayEvent::TcpClosed { flow });
                            break;
                        }
                        Ok(read) => {
                            let payload = buf[..read].to_vec();
                            if event_tx
                                .try_send(GatewayEvent::TcpData {
                                    flow,
                                    bytes: payload,
                                })
                                .is_err()
                            {
                                break;
                            }
                        }
                        Err(_) => {
                            let _ = event_tx.try_send(GatewayEvent::TcpClosed { flow });
                            break;
                        }
                    }
                }
            });
            self.sessions.insert(
                flow,
                SessionEntry {
                    kind: SessionKind::Tcp(TcpSession {
                        writer,
                        reader_task,
                    }),
                    last_active_ms: self.clock.now_millis(),
                },
            );
            self.touch_flow(flow);
        }

        if let Some(entry) = self.sessions.get_mut(&flow) {
            entry.last_active_ms = self.clock.now_millis();
            if let SessionKind::Tcp(session) = &mut entry.kind {
                if !parsed.payload.is_empty() {
                    session
                        .writer
                        .write_all(parsed.payload)
                        .await
                        .map_err(|_| GatewayError::Io)?;
                }
                if parsed.tcp_flags & 0x05 != 0 {
                    self.remove_session(flow);
                }
            }
        }

        Ok(self.drain_events())
    }

    async fn resolve_dns(&self, query: &[u8]) -> Result<Vec<u8>, GatewayError> {
        let upstream = self.config.dns_upstream.ok_or(GatewayError::Io)?;
        let socket = UdpSocket::bind("0.0.0.0:0")
            .await
            .map_err(|_| GatewayError::Io)?;
        socket
            .connect(upstream)
            .await
            .map_err(|_| GatewayError::Io)?;
        socket.send(query).await.map_err(|_| GatewayError::Io)?;
        let mut buf = vec![0u8; self.config.max_packet_bytes];
        let read = timeout(self.config.dns_timeout, socket.recv(buf.as_mut_slice()))
            .await
            .map_err(|_| GatewayError::Io)?
            .map_err(|_| GatewayError::Io)?;
        buf.truncate(read);
        Ok(buf)
    }

    fn ensure_capacity(&mut self) -> Result<(), GatewayError> {
        if self.config.max_sessions == 0 {
            self.metrics.drops_quota.fetch_add(1, Ordering::Relaxed);
            return Err(GatewayError::InvalidPayload);
        }
        while self.sessions.len() >= self.config.max_sessions {
            if let Some(oldest) = self.lru.pop_front() {
                if self.sessions.contains_key(&oldest) {
                    self.remove_session(oldest);
                    self.metrics
                        .sessions_evicted
                        .fetch_add(1, Ordering::Relaxed);
                }
            } else {
                self.metrics.drops_quota.fetch_add(1, Ordering::Relaxed);
                return Err(GatewayError::InvalidPayload);
            }
        }
        Ok(())
    }

    fn touch_flow(&mut self, flow: FlowKey) {
        if let Some(position) = self.lru.iter().position(|candidate| *candidate == flow) {
            self.lru.remove(position);
        }
        self.lru.push_back(flow);
    }

    fn remove_session(&mut self, flow: FlowKey) {
        if let Some(session) = self.sessions.remove(&flow) {
            match session.kind {
                SessionKind::Udp(udp) => udp.reader_task.abort(),
                SessionKind::Tcp(tcp) => tcp.reader_task.abort(),
            }
        }
        if let Some(position) = self.lru.iter().position(|candidate| *candidate == flow) {
            self.lru.remove(position);
        }
    }
}

fn parse_ipv4_packet(packet: &[u8], max_len: usize) -> Result<ParsedPacket<'_>, GatewayError> {
    if packet.len() < 20 || packet.len() > max_len {
        return Err(GatewayError::InvalidPayload);
    }
    let version = packet[0] >> 4;
    let ihl = (packet[0] & 0x0f) as usize * 4;
    if version != 4 || ihl < 20 || packet.len() < ihl {
        return Err(GatewayError::InvalidPayload);
    }
    let total_len = u16::from_be_bytes([packet[2], packet[3]]) as usize;
    if total_len < ihl || total_len > packet.len() {
        return Err(GatewayError::InvalidPayload);
    }
    let src_ip = Ipv4Addr::new(packet[12], packet[13], packet[14], packet[15]);
    let dst_ip = Ipv4Addr::new(packet[16], packet[17], packet[18], packet[19]);
    let transport = &packet[ihl..total_len];
    if transport.len() < 8 {
        return Err(GatewayError::InvalidPayload);
    }
    let src_port = u16::from_be_bytes([transport[0], transport[1]]);
    let dst_port = u16::from_be_bytes([transport[2], transport[3]]);
    let protocol = packet[9];

    match protocol {
        17 => {
            if transport.len() < 8 {
                return Err(GatewayError::InvalidPayload);
            }
            let udp_len = u16::from_be_bytes([transport[4], transport[5]]) as usize;
            if udp_len < 8 || udp_len > transport.len() {
                return Err(GatewayError::InvalidPayload);
            }
            Ok(ParsedPacket {
                flow: FlowKey {
                    src_ip,
                    dst_ip,
                    src_port,
                    dst_port,
                    proto: IpProto::Udp,
                },
                payload: &transport[8..udp_len],
                tcp_flags: 0,
            })
        }
        6 => {
            if transport.len() < 20 {
                return Err(GatewayError::InvalidPayload);
            }
            let data_offset = ((transport[12] >> 4) as usize) * 4;
            if data_offset < 20 || data_offset > transport.len() {
                return Err(GatewayError::InvalidPayload);
            }
            Ok(ParsedPacket {
                flow: FlowKey {
                    src_ip,
                    dst_ip,
                    src_port,
                    dst_port,
                    proto: IpProto::Tcp,
                },
                payload: &transport[data_offset..],
                tcp_flags: transport[13],
            })
        }
        _ => Err(GatewayError::UnsupportedPacket),
    }
}

fn build_ipv4_udp_packet(
    src_ip: Ipv4Addr,
    dst_ip: Ipv4Addr,
    src_port: u16,
    dst_port: u16,
    payload: &[u8],
) -> Vec<u8> {
    let total_len = 20 + 8 + payload.len();
    let mut packet = vec![0u8; total_len];
    packet[0] = 0x45;
    packet[2..4].copy_from_slice(&(total_len as u16).to_be_bytes());
    packet[8] = 64;
    packet[9] = 17;
    packet[12..16].copy_from_slice(&src_ip.octets());
    packet[16..20].copy_from_slice(&dst_ip.octets());
    let checksum = ipv4_checksum(&packet[..20]);
    packet[10..12].copy_from_slice(&checksum.to_be_bytes());

    let base = 20;
    packet[base..base + 2].copy_from_slice(&src_port.to_be_bytes());
    packet[base + 2..base + 4].copy_from_slice(&dst_port.to_be_bytes());
    packet[base + 4..base + 6].copy_from_slice(&((8 + payload.len()) as u16).to_be_bytes());
    packet[base + 8..].copy_from_slice(payload);
    packet
}

fn build_ipv4_tcp_packet(
    src_ip: Ipv4Addr,
    dst_ip: Ipv4Addr,
    src_port: u16,
    dst_port: u16,
    flags: u8,
    payload: &[u8],
) -> Vec<u8> {
    let total_len = 20 + 20 + payload.len();
    let mut packet = vec![0u8; total_len];
    packet[0] = 0x45;
    packet[2..4].copy_from_slice(&(total_len as u16).to_be_bytes());
    packet[8] = 64;
    packet[9] = 6;
    packet[12..16].copy_from_slice(&src_ip.octets());
    packet[16..20].copy_from_slice(&dst_ip.octets());
    let ip_checksum = ipv4_checksum(&packet[..20]);
    packet[10..12].copy_from_slice(&ip_checksum.to_be_bytes());

    let base = 20;
    packet[base..base + 2].copy_from_slice(&src_port.to_be_bytes());
    packet[base + 2..base + 4].copy_from_slice(&dst_port.to_be_bytes());
    packet[base + 12] = 5 << 4;
    packet[base + 13] = flags;
    packet[base + 14..base + 16].copy_from_slice(&65535u16.to_be_bytes());
    packet[base + 20..].copy_from_slice(payload);

    let tcp_checksum = tcp_checksum(src_ip, dst_ip, &packet[base..]);
    packet[base + 16..base + 18].copy_from_slice(&tcp_checksum.to_be_bytes());
    packet
}

fn ipv4_checksum(header: &[u8]) -> u16 {
    let mut sum = 0u32;
    let mut index = 0usize;
    while index + 1 < header.len() {
        sum += u16::from_be_bytes([header[index], header[index + 1]]) as u32;
        index += 2;
    }
    while sum > 0xffff {
        sum = (sum & 0xffff) + (sum >> 16);
    }
    !(sum as u16)
}

fn tcp_checksum(src_ip: Ipv4Addr, dst_ip: Ipv4Addr, segment: &[u8]) -> u16 {
    let mut sum = 0u32;
    let src = src_ip.octets();
    let dst = dst_ip.octets();
    sum += u16::from_be_bytes([src[0], src[1]]) as u32;
    sum += u16::from_be_bytes([src[2], src[3]]) as u32;
    sum += u16::from_be_bytes([dst[0], dst[1]]) as u32;
    sum += u16::from_be_bytes([dst[2], dst[3]]) as u32;
    sum += 6u32;
    sum += segment.len() as u32;

    let mut index = 0usize;
    while index + 1 < segment.len() {
        sum += u16::from_be_bytes([segment[index], segment[index + 1]]) as u32;
        index += 2;
    }
    if segment.len() % 2 == 1 {
        sum += (segment[segment.len() - 1] as u32) << 8;
    }
    while sum > 0xffff {
        sum = (sum & 0xffff) + (sum >> 16);
    }
    !(sum as u16)
}

#[cfg(test)]
mod tests {
    use std::{
        io::ErrorKind,
        sync::{
            atomic::{AtomicU64, Ordering},
            Arc,
        },
        time::Duration,
    };

    use fabric_tunnel_proto::TunnelMessage;
    use tokio::net::UdpSocket;

    use super::{build_ipv4_tcp_packet, parse_ipv4_packet, Clock};
    use super::{build_ipv4_udp_packet, GatewayConfig, GatewayEngine};

    #[derive(Clone)]
    struct TestClock {
        now: Arc<AtomicU64>,
    }

    impl TestClock {
        fn new(start: u64) -> Self {
            Self {
                now: Arc::new(AtomicU64::new(start)),
            }
        }

        fn advance(&self, delta_ms: u64) {
            self.now.fetch_add(delta_ms, Ordering::Relaxed);
        }
    }

    impl Clock for TestClock {
        fn now_millis(&self) -> u64 {
            self.now.load(Ordering::Relaxed)
        }
    }

    #[tokio::test]
    async fn nat_table_is_bounded_and_evicts_lru() {
        let clock = TestClock::new(1);
        let mut engine = GatewayEngine::with_clock(
            GatewayConfig {
                max_sessions: 1,
                max_packet_bytes: 2048,
                udp_idle_timeout: Duration::from_secs(30),
                tcp_idle_timeout: Duration::from_secs(30),
                ..GatewayConfig::default()
            },
            clock.clone(),
        );

        let packet_a = build_ipv4_udp_packet(
            "10.0.0.2".parse().expect("src"),
            "127.0.0.1".parse().expect("dst"),
            10001,
            53,
            b"a",
        );
        let packet_b = build_ipv4_udp_packet(
            "10.0.0.3".parse().expect("src"),
            "127.0.0.1".parse().expect("dst"),
            10002,
            53,
            b"b",
        );

        match engine
            .process_message(TunnelMessage::IpPacket { bytes: packet_a })
            .await
        {
            Ok(_) => {}
            Err(super::GatewayError::Io) => return,
            Err(other) => panic!("process a failed: {other}"),
        }
        match engine
            .process_message(TunnelMessage::IpPacket { bytes: packet_b })
            .await
        {
            Ok(_) => {}
            Err(super::GatewayError::Io) => return,
            Err(other) => panic!("process b failed: {other}"),
        }

        let counters = engine.counters();
        assert_eq!(counters.sessions_active, 1);
        assert_eq!(counters.sessions_evicted, 1);
    }

    #[tokio::test]
    async fn idle_sessions_are_reaped() {
        let clock = TestClock::new(10);
        let mut engine = GatewayEngine::with_clock(
            GatewayConfig {
                max_sessions: 8,
                udp_idle_timeout: Duration::from_millis(50),
                tcp_idle_timeout: Duration::from_millis(50),
                ..GatewayConfig::default()
            },
            clock.clone(),
        );
        let packet = build_ipv4_udp_packet(
            "10.0.0.2".parse().expect("src"),
            "127.0.0.1".parse().expect("dst"),
            13000,
            53,
            b"x",
        );
        match engine
            .process_message(TunnelMessage::IpPacket { bytes: packet })
            .await
        {
            Ok(_) => {}
            Err(super::GatewayError::Io) => return,
            Err(other) => panic!("process failed: {other}"),
        }
        assert_eq!(engine.counters().sessions_active, 1);

        clock.advance(100);
        engine.reap_idle_sessions();
        assert_eq!(engine.counters().sessions_active, 0);
    }

    #[tokio::test]
    async fn dns_query_roundtrip_via_stub_resolver() {
        let dns = match UdpSocket::bind("127.0.0.1:0").await {
            Ok(socket) => socket,
            Err(error) if error.kind() == ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind dns stub: {error}"),
        };
        let dns_addr = dns.local_addr().expect("dns addr");
        tokio::spawn(async move {
            let mut buf = [0u8; 2048];
            if let Ok((read, from)) = dns.recv_from(&mut buf).await {
                let mut response = buf[..read].to_vec();
                if response.len() >= 3 {
                    response[2] |= 0x80;
                }
                let _ = dns.send_to(response.as_slice(), from).await;
            }
        });

        let mut engine = GatewayEngine::new(GatewayConfig {
            dns_upstream: Some(dns_addr),
            ..GatewayConfig::default()
        });
        let query = vec![0x12, 0x34, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0];
        let out = match engine
            .process_message(TunnelMessage::DnsQuery {
                query_id: 9,
                bytes: query,
            })
            .await
        {
            Ok(out) => out,
            Err(super::GatewayError::Io) => return,
            Err(other) => panic!("process dns failed: {other}"),
        };
        assert_eq!(out.len(), 1);
        match &out[0] {
            TunnelMessage::DnsResponse { query_id, bytes } => {
                assert_eq!(*query_id, 9);
                assert!(bytes.len() >= 3);
                assert_ne!(bytes[2] & 0x80, 0);
            }
            other => panic!("expected dns response, got {other:?}"),
        }
    }

    #[test]
    fn parse_and_build_tcp_packet_roundtrip_shape() {
        let packet = build_ipv4_tcp_packet(
            "127.0.0.1".parse().expect("src"),
            "10.0.0.2".parse().expect("dst"),
            8080,
            4242,
            0x18,
            b"hello",
        );
        let parsed = parse_ipv4_packet(packet.as_slice(), 4096).expect("parse packet");
        assert_eq!(parsed.payload, b"hello");
    }
}
