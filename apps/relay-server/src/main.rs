use clap::Parser;
use fabric_security::{
    hardening::apply_process_hardening,
    logging::{endpoint_count, redacted_field},
};
use fabric_session::limits::PreAuthLimits;
use relay_server::{relay::RelayEngineConfig, run_udp, RelayRuntimeConfig};
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(name = "relay-server", about = "Managed relay server (MVP)")]
struct Args {
    /// Bind address, e.g. 0.0.0.0:7777
    #[arg(long, default_value = "0.0.0.0:7777")]
    bind: String,
    /// Admin HTTP endpoint bind address for /healthz and /metrics.
    #[arg(long, default_value = "127.0.0.1:9780")]
    admin_bind: String,
    /// Relay identifier used to enforce token relay allow-list claims.
    #[arg(long, default_value = "default-relay")]
    relay_name: String,
    /// Maximum allocation TTL granted by relay.
    #[arg(long, default_value_t = 300)]
    max_allocation_ttl_secs: u32,
    /// Maximum concurrent client allocations in memory.
    #[arg(long, default_value_t = 4096)]
    max_allocations: usize,
    /// Maximum concurrent conn_id bindings in memory.
    #[arg(long, default_value_t = 4096)]
    max_bindings: usize,
    /// Maximum active allocations per token issuer.
    #[arg(long, default_value_t = 256)]
    max_allocations_per_issuer: u32,
    /// Maximum active allocations per token subject.
    #[arg(long, default_value_t = 64)]
    max_allocations_per_subject: u32,
    /// Maximum conn_id bindings allowed per allocation.
    #[arg(long, default_value_t = 16)]
    max_bindings_per_allocation: u32,
    /// Maximum relay token payload bytes accepted by the relay.
    #[arg(long, default_value_t = 1024)]
    max_token_payload_bytes: u32,
    /// Maximum pre-auth packet size in bytes.
    #[arg(long, default_value_t = 2048)]
    max_packet_size_bytes: usize,
    /// Development-only bypass for unsigned token verification.
    #[arg(long, default_value_t = false)]
    dev_allow_unsigned_tokens: bool,
    /// Trusted relay token issuer public keys (hex encoded 32-byte Ed25519 public keys).
    #[arg(long = "token-issuer-pubkey-hex", value_delimiter = ',')]
    token_issuer_pubkey_hex: Vec<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let args = Args::parse();
    let hardening = apply_process_hardening();
    if !hardening.fully_hardened() {
        tracing::warn!(
            core_dumps_disabled = hardening.core_dumps_disabled,
            dumpable_disabled = hardening.dumpable_disabled,
            "process hardening partially applied"
        );
    }

    let public_endpoints = [args.bind.as_str(), args.admin_bind.as_str()];
    tracing::info!(
        bind = %redacted_field(&args.bind),
        admin_bind = %redacted_field(&args.admin_bind),
        endpoint_summary = %endpoint_count(&public_endpoints),
        "starting relay server"
    );

    let bind = args.bind.parse()?;
    let admin_bind = args.admin_bind.parse()?;
    let max_allocations_per_issuer = env_u32(
        "ANIMUS_RELAY_MAX_ALLOC_PER_ISSUER",
        args.max_allocations_per_issuer,
    )?;
    let max_allocations_per_subject = env_u32(
        "ANIMUS_RELAY_MAX_ALLOC_PER_SUBJECT",
        args.max_allocations_per_subject,
    )?;
    let max_bindings_per_allocation = env_u32(
        "ANIMUS_RELAY_MAX_BINDINGS_PER_ALLOC",
        args.max_bindings_per_allocation,
    )?;
    let max_token_payload_bytes = env_u32(
        "ANIMUS_RELAY_MAX_TOKEN_PAYLOAD_BYTES",
        args.max_token_payload_bytes,
    )?;
    let max_packet_size_bytes = env_usize(
        "ANIMUS_RELAY_MAX_PACKET_SIZE_BYTES",
        args.max_packet_size_bytes,
    )?;
    let pre_auth_limits = PreAuthLimits {
        max_packet_size: max_packet_size_bytes.max(64),
        ..PreAuthLimits::default()
    };
    let config = RelayRuntimeConfig {
        bind,
        admin_bind,
        pre_auth_limits,
        engine: RelayEngineConfig {
            relay_name: args.relay_name,
            max_allocation_ttl_secs: args.max_allocation_ttl_secs,
            max_allocations: args.max_allocations,
            max_bindings: args.max_bindings,
            max_allocations_per_issuer: max_allocations_per_issuer.max(1),
            max_allocations_per_subject: max_allocations_per_subject.max(1),
            max_bindings_per_allocation: max_bindings_per_allocation.max(1),
            max_token_payload_bytes: max_token_payload_bytes.max(64),
        },
        dev_allow_unsigned_tokens: args.dev_allow_unsigned_tokens,
        token_issuer_public_keys_hex: args.token_issuer_pubkey_hex,
    };

    run_udp(config).await
}

fn env_u32(key: &str, fallback: u32) -> anyhow::Result<u32> {
    match std::env::var(key) {
        Ok(value) => value
            .parse::<u32>()
            .map_err(|_| anyhow::anyhow!("invalid {} value", key)),
        Err(std::env::VarError::NotPresent) => Ok(fallback),
        Err(_) => Ok(fallback),
    }
}

fn env_usize(key: &str, fallback: usize) -> anyhow::Result<usize> {
    match std::env::var(key) {
        Ok(value) => value
            .parse::<usize>()
            .map_err(|_| anyhow::anyhow!("invalid {} value", key)),
        Err(std::env::VarError::NotPresent) => Ok(fallback),
        Err(_) => Ok(fallback),
    }
}
