use std::{
    collections::{HashMap, HashSet},
    net::SocketAddr,
    sync::Arc,
    time::Instant,
};

use fabric_relay_proto::{
    decode_packet, encode_packet, RelayCtrl, RelayCtrlEnvelope, RelayData, RelayPacket,
    RELAY_TOKEN_PREFIX,
};
use fabric_session::{
    limits::PreAuthLimits,
    ratelimit::{Clock, PreAuthGate, TokenBucketPreAuthGate},
};

use crate::observability::{QuotaRejectReason, RelayMetrics};
use crate::token::{validate_token, TokenSignatureVerifier, TokenValidationContext};

#[derive(Debug, Clone)]
pub struct RelayEngineConfig {
    pub relay_name: String,
    pub max_allocation_ttl_secs: u32,
    pub max_allocations: usize,
    pub max_bindings: usize,
    pub max_allocations_per_issuer: u32,
    pub max_allocations_per_subject: u32,
    pub max_bindings_per_allocation: u32,
    pub max_token_payload_bytes: u32,
}

impl Default for RelayEngineConfig {
    fn default() -> Self {
        Self {
            relay_name: "default-relay".to_string(),
            max_allocation_ttl_secs: 300,
            max_allocations: 4096,
            max_bindings: 4096,
            max_allocations_per_issuer: 256,
            max_allocations_per_subject: 64,
            max_bindings_per_allocation: 16,
            max_token_payload_bytes: 1024,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutboundDatagram {
    pub dst: SocketAddr,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
struct Allocation {
    expires_at_unix_secs: u64,
    subject: String,
    issuer_id: String,
    bound_conn_ids: HashSet<u64>,
}

#[derive(Debug, Clone, Copy)]
struct Binding {
    left: SocketAddr,
    right: Option<SocketAddr>,
}

impl Binding {
    fn bind_peer(&mut self, src: SocketAddr) {
        if self.left == src || self.right == Some(src) {
            return;
        }
        self.right = Some(src);
    }

    fn peer_for(&self, src: SocketAddr) -> Option<SocketAddr> {
        if self.left == src {
            return self.right;
        }
        if self.right == Some(src) {
            return Some(self.left);
        }
        None
    }

    fn remove_peer(&mut self, src: SocketAddr) -> bool {
        if self.left == src {
            if let Some(right) = self.right {
                self.left = right;
                self.right = None;
                return true;
            }
            return false;
        }
        if self.right == Some(src) {
            self.right = None;
        }
        true
    }
}

#[derive(Debug, Default)]
struct RelayState {
    allocations: HashMap<SocketAddr, Allocation>,
    bindings: HashMap<u64, Binding>,
}

impl RelayState {
    fn remove_client(&mut self, src: SocketAddr) {
        self.allocations.remove(&src);
        self.bindings.retain(|_, binding| binding.remove_peer(src));
        self.recompute_allocation_bindings();
    }

    fn count_subject_allocations(&self, subject: &str, exclude_src: Option<SocketAddr>) -> usize {
        self.allocations
            .iter()
            .filter(|(src, allocation)| {
                if exclude_src == Some(**src) {
                    return false;
                }
                allocation.subject == subject
            })
            .count()
    }

    fn count_issuer_allocations(&self, issuer_id: &str, exclude_src: Option<SocketAddr>) -> usize {
        self.allocations
            .iter()
            .filter(|(src, allocation)| {
                if exclude_src == Some(**src) {
                    return false;
                }
                allocation.issuer_id == issuer_id
            })
            .count()
    }

    fn recompute_allocation_bindings(&mut self) {
        for allocation in self.allocations.values_mut() {
            allocation.bound_conn_ids.clear();
        }
        for (conn_id, binding) in &self.bindings {
            if let Some(left) = self.allocations.get_mut(&binding.left) {
                left.bound_conn_ids.insert(*conn_id);
            }
            if let Some(right_src) = binding.right {
                if let Some(right) = self.allocations.get_mut(&right_src) {
                    right.bound_conn_ids.insert(*conn_id);
                }
            }
        }
    }
}

pub struct RelayEngine<C: Clock + Clone> {
    clock: C,
    gate: TokenBucketPreAuthGate<C>,
    verifier: Box<dyn TokenSignatureVerifier + Send + Sync>,
    config: RelayEngineConfig,
    state: RelayState,
    metrics: Arc<RelayMetrics>,
}

impl<C: Clock + Clone> RelayEngine<C> {
    pub fn new(
        limits: PreAuthLimits,
        clock: C,
        verifier: Box<dyn TokenSignatureVerifier + Send + Sync>,
        config: RelayEngineConfig,
        metrics: Arc<RelayMetrics>,
    ) -> Self {
        Self {
            gate: TokenBucketPreAuthGate::new(limits, clock.clone()),
            clock,
            verifier,
            config,
            state: RelayState::default(),
            metrics,
        }
    }

    pub fn handle_datagram(&mut self, src: SocketAddr, packet: &[u8]) -> Vec<OutboundDatagram> {
        self.metrics.add_bytes_in(packet.len());
        if !self.gate.allow_packet(src.ip(), packet.len()) {
            tracing::warn!(src_ip = %src.ip(), "relay packet dropped by pre-auth limits");
            self.metrics.inc_rate_limited();
            self.metrics.inc_drops();
            return Vec::new();
        }

        self.purge_expired_allocations();

        let outputs = match decode_packet(packet) {
            Ok(RelayPacket::Ctrl(envelope)) => {
                let start = Instant::now();
                let out = self.handle_ctrl(src, envelope);
                self.metrics
                    .observe_ctrl_latency_ms(start.elapsed().as_millis() as u64);
                out
            }
            Ok(RelayPacket::Data(data)) => self.handle_data(src, data, packet),
            Err(error) => {
                tracing::warn!(src_ip = %src.ip(), error = %error, "relay packet decode failed");
                self.metrics.inc_invalid_packets();
                self.metrics.inc_drops();
                Vec::new()
            }
        };

        let bytes_out: usize = outputs.iter().map(|packet| packet.bytes.len()).sum();
        self.metrics.add_bytes_out(bytes_out);
        self.sync_gauges();
        outputs
    }

    fn handle_ctrl(
        &mut self,
        src: SocketAddr,
        envelope: RelayCtrlEnvelope,
    ) -> Vec<OutboundDatagram> {
        match envelope.message {
            RelayCtrl::Allocate {
                token,
                requested_ttl_secs,
            } => self.handle_allocate(src, &token, requested_ttl_secs),
            RelayCtrl::Bind { conn_id } => self.handle_bind(src, conn_id),
            RelayCtrl::Ping { nonce } => self.send_ctrl(src, RelayCtrl::Pong { nonce }),
            RelayCtrl::Pong { .. } => Vec::new(),
            RelayCtrl::Close { .. } => {
                self.state.remove_client(src);
                Vec::new()
            }
        }
    }

    fn handle_allocate(
        &mut self,
        src: SocketAddr,
        token: &str,
        requested_ttl_secs: u32,
    ) -> Vec<OutboundDatagram> {
        let max_payload_bytes = self.config.max_token_payload_bytes.max(1) as usize;
        if token_payload_exceeds_limit(token, max_payload_bytes) {
            tracing::warn!(src_ip = %src.ip(), "allocation rejected: token payload too large");
            self.metrics
                .inc_quota_rejected(QuotaRejectReason::PayloadTooLarge);
            self.metrics.inc_allocations_rejected();
            self.metrics.inc_drops();
            return self.send_ctrl(
                src,
                RelayCtrl::Close {
                    reason: Some("token_too_large".to_string()),
                },
            );
        }

        if !self.state.allocations.contains_key(&src)
            && self.state.allocations.len() >= self.config.max_allocations
        {
            tracing::warn!(src_ip = %src.ip(), "allocation table is full");
            self.metrics
                .inc_quota_rejected(QuotaRejectReason::AllocationCapacity);
            self.metrics.inc_allocations_rejected();
            self.metrics.inc_drops();
            return self.send_ctrl(
                src,
                RelayCtrl::Close {
                    reason: Some("capacity".to_string()),
                },
            );
        }

        let context = TokenValidationContext {
            now_unix_secs: self.now_unix_secs(),
            requested_ttl_secs,
            max_allocation_ttl_secs: self.config.max_allocation_ttl_secs,
            relay_name: Some(self.config.relay_name.as_str()),
            clock_skew_secs: fabric_relay_proto::DEFAULT_CLOCK_SKEW_SECS,
        };

        match validate_token(token, context, self.verifier.as_ref()) {
            Ok(validated) => {
                if validated.payload_bytes > max_payload_bytes {
                    tracing::warn!(src_ip = %src.ip(), "allocation rejected: token payload too large");
                    self.metrics
                        .inc_quota_rejected(QuotaRejectReason::PayloadTooLarge);
                    self.metrics.inc_allocations_rejected();
                    self.metrics.inc_drops();
                    return self.send_ctrl(
                        src,
                        RelayCtrl::Close {
                            reason: Some("token_too_large".to_string()),
                        },
                    );
                }

                if self
                    .state
                    .count_issuer_allocations(validated.issuer_id.as_str(), Some(src))
                    >= self.config.max_allocations_per_issuer.max(1) as usize
                {
                    tracing::warn!(src_ip = %src.ip(), "allocation rejected: issuer quota exceeded");
                    self.metrics
                        .inc_quota_rejected(QuotaRejectReason::IssuerLimit);
                    self.metrics.inc_allocations_rejected();
                    self.metrics.inc_drops();
                    return self.send_ctrl(
                        src,
                        RelayCtrl::Close {
                            reason: Some("issuer_limit".to_string()),
                        },
                    );
                }

                if self
                    .state
                    .count_subject_allocations(validated.claims.sub.as_str(), Some(src))
                    >= self.config.max_allocations_per_subject.max(1) as usize
                {
                    tracing::warn!(src_ip = %src.ip(), "allocation rejected: subject quota exceeded");
                    self.metrics
                        .inc_quota_rejected(QuotaRejectReason::SubjectLimit);
                    self.metrics.inc_allocations_rejected();
                    self.metrics.inc_drops();
                    return self.send_ctrl(
                        src,
                        RelayCtrl::Close {
                            reason: Some("subject_limit".to_string()),
                        },
                    );
                }

                self.state.remove_client(src);
                self.state.allocations.insert(
                    src,
                    Allocation {
                        expires_at_unix_secs: validated.expires_at_unix_secs,
                        subject: validated.claims.sub,
                        issuer_id: validated.issuer_id,
                        bound_conn_ids: HashSet::new(),
                    },
                );
                tracing::info!(
                    src_ip = %src.ip(),
                    granted_ttl_secs = validated.granted_ttl_secs,
                    "relay allocation created"
                );
                Vec::new()
            }
            Err(error) => {
                tracing::warn!(
                    src_ip = %src.ip(),
                    error = ?error,
                    "relay allocation rejected"
                );
                self.metrics.inc_auth_failures();
                self.metrics.inc_drops();
                self.send_ctrl(
                    src,
                    RelayCtrl::Close {
                        reason: Some("allocate_rejected".to_string()),
                    },
                )
            }
        }
    }

    fn handle_bind(&mut self, src: SocketAddr, conn_id: u64) -> Vec<OutboundDatagram> {
        let Some(allocation) = self.state.allocations.get(&src) else {
            tracing::warn!(src_ip = %src.ip(), conn_id, "bind rejected: missing allocation");
            self.metrics.inc_drops();
            return self.send_ctrl(
                src,
                RelayCtrl::Close {
                    reason: Some("not_allocated".to_string()),
                },
            );
        };

        if !allocation.bound_conn_ids.contains(&conn_id)
            && allocation.bound_conn_ids.len()
                >= self.config.max_bindings_per_allocation.max(1) as usize
        {
            tracing::warn!(src_ip = %src.ip(), conn_id, "bind rejected: allocation bindings quota exceeded");
            self.metrics
                .inc_quota_rejected(QuotaRejectReason::BindingsLimit);
            self.metrics.inc_drops();
            return self.send_ctrl(
                src,
                RelayCtrl::Close {
                    reason: Some("bindings_limit".to_string()),
                },
            );
        }

        if !self.state.bindings.contains_key(&conn_id)
            && self.state.bindings.len() >= self.config.max_bindings
        {
            tracing::warn!(src_ip = %src.ip(), conn_id, "bind table is full");
            self.metrics
                .inc_quota_rejected(QuotaRejectReason::BindingCapacity);
            self.metrics.inc_drops();
            return self.send_ctrl(
                src,
                RelayCtrl::Close {
                    reason: Some("capacity".to_string()),
                },
            );
        }

        let entry = self.state.bindings.entry(conn_id).or_insert(Binding {
            left: src,
            right: None,
        });
        entry.bind_peer(src);
        self.state.recompute_allocation_bindings();

        tracing::info!(src_ip = %src.ip(), conn_id, "relay binding updated");
        Vec::new()
    }

    fn handle_data(
        &mut self,
        src: SocketAddr,
        data: RelayData,
        raw_packet: &[u8],
    ) -> Vec<OutboundDatagram> {
        if !self.state.allocations.contains_key(&src) {
            tracing::warn!(src_ip = %src.ip(), conn_id = data.conn_id, "data dropped: missing allocation");
            self.metrics.inc_drops();
            return Vec::new();
        }

        let Some(binding) = self.state.bindings.get(&data.conn_id).copied() else {
            tracing::warn!(src_ip = %src.ip(), conn_id = data.conn_id, "data dropped: unbound conn_id");
            self.metrics.inc_drops();
            return Vec::new();
        };

        let Some(dst) = binding.peer_for(src) else {
            tracing::warn!(src_ip = %src.ip(), conn_id = data.conn_id, "data dropped: no peer");
            self.metrics.inc_drops();
            return Vec::new();
        };

        if !self.state.allocations.contains_key(&dst) {
            tracing::warn!(dst_ip = %dst.ip(), conn_id = data.conn_id, "data dropped: peer allocation missing");
            self.metrics.inc_drops();
            return Vec::new();
        }

        tracing::debug!(
            src_ip = %src.ip(),
            dst_ip = %dst.ip(),
            conn_id = data.conn_id,
            payload_len = data.payload.len(),
            "forwarding relay data packet"
        );

        vec![OutboundDatagram {
            dst,
            bytes: raw_packet.to_vec(),
        }]
    }

    fn send_ctrl(&self, dst: SocketAddr, message: RelayCtrl) -> Vec<OutboundDatagram> {
        let envelope = RelayCtrlEnvelope::new(message);
        match encode_packet(&RelayPacket::Ctrl(envelope)) {
            Ok(bytes) => vec![OutboundDatagram { dst, bytes }],
            Err(error) => {
                tracing::error!(dst_ip = %dst.ip(), error = %error, "failed to encode relay control response");
                Vec::new()
            }
        }
    }

    fn now_unix_secs(&self) -> u64 {
        self.clock.now_millis() / 1000
    }

    fn purge_expired_allocations(&mut self) {
        let now = self.now_unix_secs();
        let expired_clients: Vec<SocketAddr> = self
            .state
            .allocations
            .iter()
            .filter_map(|(src, allocation)| {
                (allocation.expires_at_unix_secs <= now).then_some(*src)
            })
            .collect();

        for src in expired_clients {
            self.state.remove_client(src);
        }
    }

    fn sync_gauges(&self) {
        self.metrics
            .set_allocations_active(self.state.allocations.len());
        self.metrics.set_bindings_active(self.state.bindings.len());
    }
}

fn token_payload_exceeds_limit(token: &str, max_payload_bytes: usize) -> bool {
    let signature_hex_len = 128usize;
    let max_token_len =
        RELAY_TOKEN_PREFIX.len() + max_payload_bytes.saturating_mul(2) + 1 + signature_hex_len;
    token.len() > max_token_len
}

#[cfg(test)]
mod tests {
    use std::{
        io::{self, Write},
        net::{IpAddr, Ipv4Addr, SocketAddr},
        sync::atomic::{AtomicU64, Ordering},
        sync::{Arc, Mutex},
    };

    use fabric_relay_proto::{
        decode_packet, encode_packet, mint_token, RelayCtrl, RelayCtrlEnvelope, RelayData,
        RelayPacket, RelayTokenClaims,
    };
    use tracing_subscriber::fmt::MakeWriter;

    use super::{Clock, OutboundDatagram, RelayEngine, RelayEngineConfig};
    use crate::observability::RelayMetrics;
    use crate::token::{DevOnlyTokenVerifier, RejectingTokenVerifier};
    use fabric_session::limits::PreAuthLimits;

    #[derive(Clone)]
    struct ManualClock {
        now_ms: Arc<AtomicU64>,
    }

    impl ManualClock {
        fn new(now_ms: u64) -> Self {
            Self {
                now_ms: Arc::new(AtomicU64::new(now_ms)),
            }
        }
    }

    impl Clock for ManualClock {
        fn now_millis(&self) -> u64 {
            self.now_ms.load(Ordering::Relaxed)
        }
    }

    #[derive(Clone, Default)]
    struct SharedBuffer {
        inner: Arc<Mutex<Vec<u8>>>,
    }

    impl SharedBuffer {
        fn content(&self) -> String {
            let bytes = self.inner.lock().expect("buffer lock poisoned").clone();
            String::from_utf8(bytes).expect("captured logs are utf8")
        }
    }

    struct BufferWriter {
        inner: Arc<Mutex<Vec<u8>>>,
    }

    impl Write for BufferWriter {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.inner
                .lock()
                .expect("buffer lock poisoned")
                .extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl<'a> MakeWriter<'a> for SharedBuffer {
        type Writer = BufferWriter;

        fn make_writer(&'a self) -> Self::Writer {
            BufferWriter {
                inner: Arc::clone(&self.inner),
            }
        }
    }

    fn addr(last_octet: u8, port: u16) -> SocketAddr {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::new(198, 51, 100, last_octet)), port)
    }

    fn defaults() -> (PreAuthLimits, RelayEngineConfig) {
        let limits = PreAuthLimits {
            max_packet_size: 2048,
            per_ip_capacity: 100,
            per_ip_refill_per_sec: 100,
            global_capacity: 1000,
            global_refill_per_sec: 1000,
        };
        let config = RelayEngineConfig {
            relay_name: "relay-test".to_string(),
            max_allocation_ttl_secs: 120,
            max_allocations: 32,
            max_bindings: 32,
            max_allocations_per_issuer: 32,
            max_allocations_per_subject: 32,
            max_bindings_per_allocation: 8,
            max_token_payload_bytes: 1024,
        };
        (limits, config)
    }

    fn token_for(exp: u64, subject: &str, seed: [u8; 32]) -> String {
        mint_token(
            &RelayTokenClaims {
                ver: 1,
                sub: subject.to_string(),
                relay_name: "relay-test".to_string(),
                exp,
                nbf: None,
                nonce: None,
                scopes: Some(vec!["relay:allocate".to_string()]),
            },
            seed,
        )
        .expect("mint test token")
    }

    fn valid_token(exp: u64) -> String {
        token_for(exp, "test-user", [7; 32])
    }

    fn close_reason(outputs: &[OutboundDatagram]) -> Option<String> {
        if outputs.len() != 1 {
            return None;
        }
        let packet = decode_packet(outputs[0].bytes.as_slice()).ok()?;
        let RelayPacket::Ctrl(envelope) = packet else {
            return None;
        };
        let RelayCtrl::Close { reason } = envelope.message else {
            return None;
        };
        reason
    }

    fn allocate(engine: &mut RelayEngine<ManualClock>, src: SocketAddr, now_secs: u64) {
        let packet = encode_packet(&RelayPacket::Ctrl(RelayCtrlEnvelope::new(
            RelayCtrl::Allocate {
                token: valid_token(now_secs + 90),
                requested_ttl_secs: 60,
            },
        )))
        .expect("encode allocate");
        let out = engine.handle_datagram(src, &packet);
        assert!(out.is_empty(), "allocate should not emit response");
    }

    fn bind(engine: &mut RelayEngine<ManualClock>, src: SocketAddr, conn_id: u64) {
        let packet = encode_packet(&RelayPacket::Ctrl(RelayCtrlEnvelope::new(
            RelayCtrl::Bind { conn_id },
        )))
        .expect("encode bind");
        let out = engine.handle_datagram(src, &packet);
        assert!(out.is_empty(), "bind should not emit response");
    }

    #[test]
    fn forwarding_preserves_bytes_exactly() {
        let (limits, config) = defaults();
        let clock = ManualClock::new(1_700_000_000_000);
        let mut engine = RelayEngine::new(
            limits,
            clock,
            Box::new(DevOnlyTokenVerifier),
            config,
            std::sync::Arc::new(RelayMetrics::new()),
        );

        let a = addr(1, 50000);
        let b = addr(2, 50001);
        allocate(&mut engine, a, 1_700_000_000);
        allocate(&mut engine, b, 1_700_000_000);
        bind(&mut engine, a, 77);
        bind(&mut engine, b, 77);

        let payload = b"opaque-encrypted-payload-\x00\x7f\xff".to_vec();
        let incoming = encode_packet(&RelayPacket::Data(RelayData {
            conn_id: 77,
            payload,
        }))
        .expect("encode data");

        let out = engine.handle_datagram(a, &incoming);
        assert_eq!(out.len(), 1);
        assert_eq!(
            out[0],
            OutboundDatagram {
                dst: b,
                bytes: incoming,
            }
        );
    }

    #[test]
    fn logs_never_contain_tokens_or_payloads() {
        let (limits, config) = defaults();
        let clock = ManualClock::new(1_700_000_000_000);
        let mut engine = RelayEngine::new(
            limits,
            clock,
            Box::new(RejectingTokenVerifier),
            config,
            std::sync::Arc::new(RelayMetrics::new()),
        );

        let capture = SharedBuffer::default();
        let subscriber = tracing_subscriber::fmt()
            .with_ansi(false)
            .without_time()
            .with_target(false)
            .with_writer(capture.clone())
            .finish();
        let dispatch = tracing::Dispatch::new(subscriber);

        let secret_token = "animus://rtok/v1/top-secret-token.invalid-signature";
        let payload_secret = "payload-super-secret";
        let allocate = encode_packet(&RelayPacket::Ctrl(RelayCtrlEnvelope::new(
            RelayCtrl::Allocate {
                token: secret_token.to_string(),
                requested_ttl_secs: 60,
            },
        )))
        .expect("encode allocate");
        let data = encode_packet(&RelayPacket::Data(RelayData {
            conn_id: 9,
            payload: payload_secret.as_bytes().to_vec(),
        }))
        .expect("encode data");

        tracing::dispatcher::with_default(&dispatch, || {
            let _ = engine.handle_datagram(addr(9, 9000), &allocate);
            let _ = engine.handle_datagram(addr(9, 9000), &data);
        });

        let logs = capture.content();
        assert!(!logs.contains("top-secret-token"));
        assert!(!logs.contains("animus://rtok/"));
        assert!(!logs.contains(payload_secret));
    }

    #[test]
    fn quota_rejects_allocations_past_issuer_limit() {
        let (limits, mut config) = defaults();
        config.max_allocations_per_issuer = 1;
        config.max_allocations_per_subject = 8;
        let clock = ManualClock::new(1_700_000_000_000);
        let metrics = Arc::new(RelayMetrics::new());
        let mut engine = RelayEngine::new(
            limits,
            clock,
            Box::new(DevOnlyTokenVerifier),
            config,
            Arc::clone(&metrics),
        );

        let packet_a = encode_packet(&RelayPacket::Ctrl(RelayCtrlEnvelope::new(
            RelayCtrl::Allocate {
                token: token_for(1_700_000_090, "subject-a", [7; 32]),
                requested_ttl_secs: 60,
            },
        )))
        .expect("encode allocate a");
        let packet_b = encode_packet(&RelayPacket::Ctrl(RelayCtrlEnvelope::new(
            RelayCtrl::Allocate {
                token: token_for(1_700_000_090, "subject-b", [7; 32]),
                requested_ttl_secs: 60,
            },
        )))
        .expect("encode allocate b");

        let first = engine.handle_datagram(addr(10, 50010), &packet_a);
        assert!(first.is_empty());
        let second = engine.handle_datagram(addr(11, 50011), &packet_b);
        assert_eq!(
            close_reason(second.as_slice()).as_deref(),
            Some("issuer_limit")
        );

        let text = metrics.render_prometheus();
        assert!(text.contains("quota_rejected_total{reason=\"issuer_limit\"} 1"));
    }

    #[test]
    fn quota_rejects_allocations_past_subject_limit() {
        let (limits, mut config) = defaults();
        config.max_allocations_per_issuer = 8;
        config.max_allocations_per_subject = 1;
        let clock = ManualClock::new(1_700_000_000_000);
        let metrics = Arc::new(RelayMetrics::new());
        let mut engine = RelayEngine::new(
            limits,
            clock,
            Box::new(DevOnlyTokenVerifier),
            config,
            Arc::clone(&metrics),
        );

        let packet_a = encode_packet(&RelayPacket::Ctrl(RelayCtrlEnvelope::new(
            RelayCtrl::Allocate {
                token: token_for(1_700_000_090, "subject-a", [7; 32]),
                requested_ttl_secs: 60,
            },
        )))
        .expect("encode allocate a");
        let packet_b = encode_packet(&RelayPacket::Ctrl(RelayCtrlEnvelope::new(
            RelayCtrl::Allocate {
                token: token_for(1_700_000_090, "subject-a", [8; 32]),
                requested_ttl_secs: 60,
            },
        )))
        .expect("encode allocate b");

        let first = engine.handle_datagram(addr(12, 50012), &packet_a);
        assert!(first.is_empty());
        let second = engine.handle_datagram(addr(13, 50013), &packet_b);
        assert_eq!(
            close_reason(second.as_slice()).as_deref(),
            Some("subject_limit")
        );

        let text = metrics.render_prometheus();
        assert!(text.contains("quota_rejected_total{reason=\"subject_limit\"} 1"));
    }

    #[test]
    fn quota_rejects_bindings_past_per_allocation_limit() {
        let (limits, mut config) = defaults();
        config.max_bindings_per_allocation = 1;
        let clock = ManualClock::new(1_700_000_000_000);
        let metrics = Arc::new(RelayMetrics::new());
        let mut engine = RelayEngine::new(
            limits,
            clock,
            Box::new(DevOnlyTokenVerifier),
            config,
            Arc::clone(&metrics),
        );
        let src = addr(14, 50014);
        allocate(&mut engine, src, 1_700_000_000);

        let first_bind = encode_packet(&RelayPacket::Ctrl(RelayCtrlEnvelope::new(
            RelayCtrl::Bind { conn_id: 1 },
        )))
        .expect("encode first bind");
        let second_bind = encode_packet(&RelayPacket::Ctrl(RelayCtrlEnvelope::new(
            RelayCtrl::Bind { conn_id: 2 },
        )))
        .expect("encode second bind");

        let first = engine.handle_datagram(src, &first_bind);
        assert!(first.is_empty());
        let second = engine.handle_datagram(src, &second_bind);
        assert_eq!(
            close_reason(second.as_slice()).as_deref(),
            Some("bindings_limit")
        );

        let text = metrics.render_prometheus();
        assert!(text.contains("quota_rejected_total{reason=\"bindings_limit\"} 1"));
    }

    #[test]
    fn quota_rejects_oversized_token_payload() {
        let (limits, mut config) = defaults();
        config.max_token_payload_bytes = 16;
        let clock = ManualClock::new(1_700_000_000_000);
        let metrics = Arc::new(RelayMetrics::new());
        let mut engine = RelayEngine::new(
            limits,
            clock,
            Box::new(DevOnlyTokenVerifier),
            config,
            Arc::clone(&metrics),
        );
        let oversized = token_for(1_700_000_090, "subject-a", [7; 32]);
        let packet = encode_packet(&RelayPacket::Ctrl(RelayCtrlEnvelope::new(
            RelayCtrl::Allocate {
                token: oversized,
                requested_ttl_secs: 60,
            },
        )))
        .expect("encode allocate");

        let out = engine.handle_datagram(addr(15, 50015), &packet);
        assert_eq!(
            close_reason(out.as_slice()).as_deref(),
            Some("token_too_large")
        );

        let text = metrics.render_prometheus();
        assert!(text.contains("quota_rejected_total{reason=\"payload_too_large\"} 1"));
    }

    #[test]
    fn quotas_isolate_subjects_and_allow_valid_allocations() {
        let (limits, mut config) = defaults();
        config.max_allocations_per_subject = 1;
        config.max_allocations_per_issuer = 8;
        let clock = ManualClock::new(1_700_000_000_000);
        let mut engine = RelayEngine::new(
            limits,
            clock,
            Box::new(DevOnlyTokenVerifier),
            config,
            Arc::new(RelayMetrics::new()),
        );

        let packet_a = encode_packet(&RelayPacket::Ctrl(RelayCtrlEnvelope::new(
            RelayCtrl::Allocate {
                token: token_for(1_700_000_090, "subject-a", [7; 32]),
                requested_ttl_secs: 60,
            },
        )))
        .expect("encode allocate a");
        let packet_b = encode_packet(&RelayPacket::Ctrl(RelayCtrlEnvelope::new(
            RelayCtrl::Allocate {
                token: token_for(1_700_000_090, "subject-b", [7; 32]),
                requested_ttl_secs: 60,
            },
        )))
        .expect("encode allocate b");

        assert!(engine
            .handle_datagram(addr(20, 50020), &packet_a)
            .is_empty());
        assert!(engine
            .handle_datagram(addr(21, 50021), &packet_b)
            .is_empty());
    }
}
