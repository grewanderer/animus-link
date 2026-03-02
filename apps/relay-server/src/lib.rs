use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::anyhow;
use fabric_session::{limits::PreAuthLimits, ratelimit::SystemClock};
use tokio::{net::UdpSocket, sync::oneshot, task::JoinHandle};

pub mod observability;
pub mod relay;
pub mod token;

use observability::{run_http_observability, RelayMetrics};
use relay::{RelayEngine, RelayEngineConfig};
use token::{DevOnlyTokenVerifier, Ed25519TokenVerifier, TokenSignatureVerifier};

#[derive(Debug, Clone)]
pub struct RelayRuntimeConfig {
    pub bind: SocketAddr,
    pub admin_bind: SocketAddr,
    pub pre_auth_limits: PreAuthLimits,
    pub engine: RelayEngineConfig,
    pub dev_allow_unsigned_tokens: bool,
    pub token_issuer_public_keys_hex: Vec<String>,
}

impl Default for RelayRuntimeConfig {
    fn default() -> Self {
        Self {
            bind: "0.0.0.0:7777"
                .parse()
                .expect("default bind addr must parse"),
            admin_bind: "127.0.0.1:0"
                .parse()
                .expect("default admin bind addr must parse"),
            pre_auth_limits: PreAuthLimits::default(),
            engine: RelayEngineConfig::default(),
            dev_allow_unsigned_tokens: false,
            token_issuer_public_keys_hex: Vec::new(),
        }
    }
}

fn build_token_verifier(
    config: &RelayRuntimeConfig,
) -> anyhow::Result<Box<dyn TokenSignatureVerifier + Send + Sync>> {
    if config.dev_allow_unsigned_tokens {
        return Ok(Box::new(DevOnlyTokenVerifier));
    }

    Ok(Box::new(
        Ed25519TokenVerifier::from_public_key_hex(&config.token_issuer_public_keys_hex)
            .map_err(|_| anyhow!("missing or invalid relay token issuer public key(s)"))?,
    ))
}

pub async fn run_udp(config: RelayRuntimeConfig) -> anyhow::Result<()> {
    run_udp_with_ready(config, None).await
}

pub async fn run_udp_with_ready(
    config: RelayRuntimeConfig,
    ready_tx: Option<oneshot::Sender<Result<SocketAddr, String>>>,
) -> anyhow::Result<()> {
    let socket = match UdpSocket::bind(config.bind).await {
        Ok(socket) => socket,
        Err(error) => {
            if let Some(ready_tx) = ready_tx {
                let _ = ready_tx.send(Err(error.to_string()));
            }
            return Err(anyhow!(error).context(format!("bind relay udp socket {}", config.bind)));
        }
    };
    let bound_addr = match socket.local_addr() {
        Ok(addr) => addr,
        Err(error) => {
            if let Some(ready_tx) = ready_tx {
                let _ = ready_tx.send(Err(error.to_string()));
            }
            return Err(anyhow!(error).context("read relay udp local address"));
        }
    };
    if let Some(ready_tx) = ready_tx {
        let _ = ready_tx.send(Ok(bound_addr));
    }

    let verifier = build_token_verifier(&config)?;
    let metrics = Arc::new(RelayMetrics::new());
    let _admin_task = spawn_observability_server(config.admin_bind, Arc::clone(&metrics));

    let mut engine = RelayEngine::new(
        config.pre_auth_limits,
        SystemClock,
        verifier,
        config.engine.clone(),
        metrics,
    );

    let mut recv_buf = [0_u8; 65_535];
    loop {
        let (len, src) = socket.recv_from(&mut recv_buf).await?;
        let outputs = engine.handle_datagram(src, &recv_buf[..len]);
        for outbound in outputs {
            let _sent = socket.send_to(&outbound.bytes, outbound.dst).await?;
        }
    }
}

fn spawn_observability_server(
    admin_bind: SocketAddr,
    metrics: Arc<RelayMetrics>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        if let Err(error) = run_http_observability(admin_bind, metrics).await {
            tracing::error!(error = %error, "relay observability server exited");
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{build_token_verifier, RelayRuntimeConfig};

    #[test]
    fn signed_tokens_required_by_default() {
        let config = RelayRuntimeConfig::default();
        let result = build_token_verifier(&config);
        assert!(result.is_err());
    }

    #[test]
    fn accepts_valid_public_key_configuration() {
        let config = RelayRuntimeConfig {
            token_issuer_public_keys_hex: vec![
                "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a".to_string(),
            ],
            ..RelayRuntimeConfig::default()
        };
        let result = build_token_verifier(&config);
        assert!(result.is_ok());
    }
}
