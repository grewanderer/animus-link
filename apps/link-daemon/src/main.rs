use clap::Parser;
use fabric_security::{
    hardening::apply_process_hardening,
    logging::{endpoint_count, redacted_field},
};
use link_daemon::api::{run_api_server, ApiServerConfig};
use std::path::PathBuf;
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(name = "link-daemon", about = "Link daemon (MVP)")]
struct Args {
    #[arg(long, default_value = "127.0.0.1:9999")]
    api_bind: String,
    #[arg(long, default_value = ".animus-link/state/namespaces.json")]
    state_file: PathBuf,
    #[arg(long)]
    relay_addr: Option<String>,
    #[arg(long, default_value = "default-relay")]
    relay_name: String,
    #[arg(long, default_value = "relay-token-signing-v1")]
    relay_token_signing_key_id: String,
    #[arg(long)]
    relay_token_signing_seed_hex: Option<String>,
    #[arg(long)]
    relay_token_signing_key_file: Option<PathBuf>,
    #[arg(long, default_value_t = 120)]
    relay_token_ttl_secs: u32,
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

    let local_api_endpoints = [args.api_bind.as_str()];
    tracing::info!(
        api_bind = %redacted_field(&args.api_bind),
        endpoint_summary = %endpoint_count(&local_api_endpoints),
        "starting link daemon"
    );

    let api_bind = args.api_bind.parse()?;
    let relay_addr = args.relay_addr.as_deref().map(str::parse).transpose()?;

    run_api_server(ApiServerConfig {
        api_bind,
        state_file: args.state_file,
        relay_addr,
        relay_name: args.relay_name,
        relay_token_signing_key_id: args.relay_token_signing_key_id,
        relay_token_signing_seed_hex: args.relay_token_signing_seed_hex,
        relay_token_signing_key_file: args.relay_token_signing_key_file,
        relay_token_ttl_secs: args.relay_token_ttl_secs,
    })
    .await
}
