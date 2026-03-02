use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

const CTRL_LATENCY_BUCKETS_MS: [u64; 9] = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QuotaRejectReason {
    IssuerLimit,
    SubjectLimit,
    BindingsLimit,
    PayloadTooLarge,
    AllocationCapacity,
    BindingCapacity,
}

impl QuotaRejectReason {
    fn as_label(self) -> &'static str {
        match self {
            Self::IssuerLimit => "issuer_limit",
            Self::SubjectLimit => "subject_limit",
            Self::BindingsLimit => "bindings_limit",
            Self::PayloadTooLarge => "payload_too_large",
            Self::AllocationCapacity => "allocation_capacity",
            Self::BindingCapacity => "binding_capacity",
        }
    }
}

#[derive(Debug)]
pub struct RelayMetrics {
    auth_failures_total: AtomicU64,
    allocations_active: AtomicU64,
    bindings_active: AtomicU64,
    bytes_in_total: AtomicU64,
    bytes_out_total: AtomicU64,
    drops_total: AtomicU64,
    rate_limited_total: AtomicU64,
    invalid_packets_total: AtomicU64,
    allocations_rejected_total: AtomicU64,
    quota_rejected_issuer_limit_total: AtomicU64,
    quota_rejected_subject_limit_total: AtomicU64,
    quota_rejected_bindings_limit_total: AtomicU64,
    quota_rejected_payload_too_large_total: AtomicU64,
    quota_rejected_allocation_capacity_total: AtomicU64,
    quota_rejected_binding_capacity_total: AtomicU64,
    ctrl_latency_buckets: [AtomicU64; CTRL_LATENCY_BUCKETS_MS.len()],
    ctrl_latency_count: AtomicU64,
    ctrl_latency_sum_ms: AtomicU64,
}

impl Default for RelayMetrics {
    fn default() -> Self {
        Self::new()
    }
}

impl RelayMetrics {
    pub fn new() -> Self {
        Self {
            auth_failures_total: AtomicU64::new(0),
            allocations_active: AtomicU64::new(0),
            bindings_active: AtomicU64::new(0),
            bytes_in_total: AtomicU64::new(0),
            bytes_out_total: AtomicU64::new(0),
            drops_total: AtomicU64::new(0),
            rate_limited_total: AtomicU64::new(0),
            invalid_packets_total: AtomicU64::new(0),
            allocations_rejected_total: AtomicU64::new(0),
            quota_rejected_issuer_limit_total: AtomicU64::new(0),
            quota_rejected_subject_limit_total: AtomicU64::new(0),
            quota_rejected_bindings_limit_total: AtomicU64::new(0),
            quota_rejected_payload_too_large_total: AtomicU64::new(0),
            quota_rejected_allocation_capacity_total: AtomicU64::new(0),
            quota_rejected_binding_capacity_total: AtomicU64::new(0),
            ctrl_latency_buckets: std::array::from_fn(|_| AtomicU64::new(0)),
            ctrl_latency_count: AtomicU64::new(0),
            ctrl_latency_sum_ms: AtomicU64::new(0),
        }
    }

    pub fn inc_auth_failures(&self) {
        self.auth_failures_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn set_allocations_active(&self, value: usize) {
        self.allocations_active
            .store(value.min(u64::MAX as usize) as u64, Ordering::Relaxed);
    }

    pub fn set_bindings_active(&self, value: usize) {
        self.bindings_active
            .store(value.min(u64::MAX as usize) as u64, Ordering::Relaxed);
    }

    pub fn add_bytes_in(&self, bytes: usize) {
        self.bytes_in_total
            .fetch_add(bytes.min(u64::MAX as usize) as u64, Ordering::Relaxed);
    }

    pub fn add_bytes_out(&self, bytes: usize) {
        self.bytes_out_total
            .fetch_add(bytes.min(u64::MAX as usize) as u64, Ordering::Relaxed);
    }

    pub fn inc_drops(&self) {
        self.drops_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_rate_limited(&self) {
        self.rate_limited_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_invalid_packets(&self) {
        self.invalid_packets_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_allocations_rejected(&self) {
        self.allocations_rejected_total
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_quota_rejected(&self, reason: QuotaRejectReason) {
        let counter = match reason {
            QuotaRejectReason::IssuerLimit => &self.quota_rejected_issuer_limit_total,
            QuotaRejectReason::SubjectLimit => &self.quota_rejected_subject_limit_total,
            QuotaRejectReason::BindingsLimit => &self.quota_rejected_bindings_limit_total,
            QuotaRejectReason::PayloadTooLarge => &self.quota_rejected_payload_too_large_total,
            QuotaRejectReason::AllocationCapacity => &self.quota_rejected_allocation_capacity_total,
            QuotaRejectReason::BindingCapacity => &self.quota_rejected_binding_capacity_total,
        };
        counter.fetch_add(1, Ordering::Relaxed);
    }

    pub fn observe_ctrl_latency_ms(&self, latency_ms: u64) {
        self.ctrl_latency_count.fetch_add(1, Ordering::Relaxed);
        self.ctrl_latency_sum_ms
            .fetch_add(latency_ms, Ordering::Relaxed);
        for (index, bucket) in CTRL_LATENCY_BUCKETS_MS.iter().enumerate() {
            if latency_ms <= *bucket {
                self.ctrl_latency_buckets[index].fetch_add(1, Ordering::Relaxed);
                return;
            }
        }
    }

    pub fn render_prometheus(&self) -> String {
        let mut out = String::new();
        append_counter(
            &mut out,
            "auth_failures_total",
            "Total auth/token validation failures",
            self.auth_failures_total.load(Ordering::Relaxed),
        );
        append_gauge(
            &mut out,
            "allocations_active",
            "Active relay allocations",
            self.allocations_active.load(Ordering::Relaxed),
        );
        append_gauge(
            &mut out,
            "bindings_active",
            "Active relay bindings",
            self.bindings_active.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "bytes_in_total",
            "Total inbound bytes",
            self.bytes_in_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "bytes_out_total",
            "Total outbound bytes",
            self.bytes_out_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "drops_total",
            "Total dropped packets",
            self.drops_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "rate_limited_total",
            "Total packets dropped by pre-auth rate limits",
            self.rate_limited_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "invalid_packets_total",
            "Total invalid packets",
            self.invalid_packets_total.load(Ordering::Relaxed),
        );
        append_counter(
            &mut out,
            "allocations_rejected_total",
            "Total rejected allocation requests",
            self.allocations_rejected_total.load(Ordering::Relaxed),
        );
        append_quota_counter(
            &mut out,
            QuotaRejectReason::IssuerLimit,
            self.quota_rejected_issuer_limit_total
                .load(Ordering::Relaxed),
        );
        append_quota_counter(
            &mut out,
            QuotaRejectReason::SubjectLimit,
            self.quota_rejected_subject_limit_total
                .load(Ordering::Relaxed),
        );
        append_quota_counter(
            &mut out,
            QuotaRejectReason::BindingsLimit,
            self.quota_rejected_bindings_limit_total
                .load(Ordering::Relaxed),
        );
        append_quota_counter(
            &mut out,
            QuotaRejectReason::PayloadTooLarge,
            self.quota_rejected_payload_too_large_total
                .load(Ordering::Relaxed),
        );
        append_quota_counter(
            &mut out,
            QuotaRejectReason::AllocationCapacity,
            self.quota_rejected_allocation_capacity_total
                .load(Ordering::Relaxed),
        );
        append_quota_counter(
            &mut out,
            QuotaRejectReason::BindingCapacity,
            self.quota_rejected_binding_capacity_total
                .load(Ordering::Relaxed),
        );

        out.push_str(
            "# HELP handshake_or_ctrl_latency_ms Relay ctrl processing latency in milliseconds.\n",
        );
        out.push_str("# TYPE handshake_or_ctrl_latency_ms histogram\n");
        let mut cumulative = 0u64;
        for (index, le) in CTRL_LATENCY_BUCKETS_MS.iter().enumerate() {
            cumulative =
                cumulative.saturating_add(self.ctrl_latency_buckets[index].load(Ordering::Relaxed));
            out.push_str(&format!(
                "handshake_or_ctrl_latency_ms_bucket{{le=\"{}\"}} {}\n",
                le, cumulative
            ));
        }
        let count = self.ctrl_latency_count.load(Ordering::Relaxed);
        out.push_str(&format!(
            "handshake_or_ctrl_latency_ms_bucket{{le=\"+Inf\"}} {}\n",
            count
        ));
        out.push_str(&format!(
            "handshake_or_ctrl_latency_ms_sum {}\n",
            self.ctrl_latency_sum_ms.load(Ordering::Relaxed)
        ));
        out.push_str(&format!("handshake_or_ctrl_latency_ms_count {}\n", count));
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

fn append_quota_counter(out: &mut String, reason: QuotaRejectReason, value: u64) {
    if !out.contains("# HELP quota_rejected_total ") {
        out.push_str("# HELP quota_rejected_total Total quota-based rejections.\n");
        out.push_str("# TYPE quota_rejected_total counter\n");
    }
    out.push_str(&format!(
        "quota_rejected_total{{reason=\"{}\"}} {}\n",
        reason.as_label(),
        value
    ));
}

pub async fn run_http_observability(
    bind: std::net::SocketAddr,
    metrics: Arc<RelayMetrics>,
) -> anyhow::Result<()> {
    let listener = TcpListener::bind(bind).await?;
    run_http_observability_with_listener(listener, metrics).await
}

pub async fn run_http_observability_with_listener(
    listener: TcpListener,
    metrics: Arc<RelayMetrics>,
) -> anyhow::Result<()> {
    loop {
        let (stream, _) = listener.accept().await?;
        let metrics = Arc::clone(&metrics);
        tokio::spawn(async move {
            let _ = handle_connection(stream, metrics).await;
        });
    }
}

async fn handle_connection(
    mut stream: TcpStream,
    metrics: Arc<RelayMetrics>,
) -> anyhow::Result<()> {
    let mut buf = [0u8; 2048];
    let n = stream.read(&mut buf).await?;
    if n == 0 {
        return Ok(());
    }
    let request = String::from_utf8_lossy(&buf[..n]);
    let mut lines = request.lines();
    let Some(line) = lines.next() else {
        return Ok(());
    };
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or_default();

    let (status, content_type, body) = match (method, path) {
        ("GET", "/healthz") => (
            "200 OK",
            "application/json",
            b"{\"ok\":true,\"ready\":true}\n".to_vec(),
        ),
        ("GET", "/metrics") => (
            "200 OK",
            "text/plain; version=0.0.4",
            metrics.render_prometheus().into_bytes(),
        ),
        _ => ("404 Not Found", "text/plain", b"not found\n".to_vec()),
    };

    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes()).await?;
    stream.write_all(&body).await?;
    stream.flush().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::{TcpListener, TcpStream},
        time::{sleep, Duration},
    };

    use super::{run_http_observability_with_listener, RelayMetrics};

    #[test]
    fn metrics_render_contains_required_names() {
        let metrics = RelayMetrics::new();
        let text = metrics.render_prometheus();
        for required in [
            "auth_failures_total",
            "allocations_active",
            "bindings_active",
            "bytes_in_total",
            "bytes_out_total",
            "drops_total",
            "rate_limited_total",
            "invalid_packets_total",
            "allocations_rejected_total",
            "quota_rejected_total{reason=\"issuer_limit\"}",
            "handshake_or_ctrl_latency_ms_bucket",
        ] {
            assert!(text.contains(required));
        }
    }

    #[tokio::test]
    async fn healthz_and_metrics_endpoints_respond() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind observability listener: {error}"),
        };
        let addr = listener.local_addr().expect("observability local addr");
        let metrics = Arc::new(RelayMetrics::new());
        metrics.add_bytes_in(128);
        metrics.add_bytes_out(64);
        let task = tokio::spawn({
            let metrics = Arc::clone(&metrics);
            async move { run_http_observability_with_listener(listener, metrics).await }
        });

        sleep(Duration::from_millis(25)).await;

        let health = send_http(
            addr,
            "GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(health.starts_with("HTTP/1.1 200 OK"));
        assert!(health.contains("\"ok\":true"));

        let metrics_response = send_http(
            addr,
            "GET /metrics HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(metrics_response.starts_with("HTTP/1.1 200 OK"));
        assert!(metrics_response.contains("auth_failures_total"));
        assert!(metrics_response.contains("bytes_in_total 128"));
        assert!(!metrics_response.contains("top-secret-token"));

        task.abort();
    }

    async fn send_http(addr: std::net::SocketAddr, request: &str) -> String {
        let mut stream = TcpStream::connect(addr).await.expect("connect");
        stream
            .write_all(request.as_bytes())
            .await
            .expect("write request");
        stream.flush().await.expect("flush request");
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.expect("read response");
        String::from_utf8(buf).expect("utf8 response")
    }
}
