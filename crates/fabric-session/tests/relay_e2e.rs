use std::{net::SocketAddr, time::Duration};

use fabric_crypto::DeterministicPrimitives;
use fabric_relay_proto::{derive_public_key, mint_token, RelayTokenClaims};
use fabric_session::{
    relay_channel::RelayDatagramChannel,
    secure_session::{SecureSession, SessionEvent},
};
use relay_server::{relay::RelayEngineConfig, run_udp_with_ready, RelayRuntimeConfig};
use tokio::{sync::oneshot, time::timeout};

const CI_TIMEOUT: Duration = Duration::from_secs(8);
const RELAY_PATH_TIMEOUT: Duration = Duration::from_secs(2);
const MSG1_RETRY_ATTEMPTS: usize = 3;
const RELAY_TOKEN_ISSUER_SEED: [u8; 32] = [0x42; 32];
const RELAY_NAME: &str = "test-relay";
const RELAY_TOKEN_SUBJECT: &str = "relay-e2e-subject";

#[tokio::test]
async fn relay_loopback_establishes_secure_session_and_exchanges_data() {
    let issuer_pub_hex = encode_hex(&derive_public_key(RELAY_TOKEN_ISSUER_SEED));
    let (ready_tx, ready_rx) = oneshot::channel();
    let relay_task = tokio::spawn(async move {
        let config = RelayRuntimeConfig {
            bind: "127.0.0.1:0".parse().expect("parse relay bind"),
            engine: RelayEngineConfig {
                relay_name: RELAY_NAME.to_string(),
                ..RelayEngineConfig::default()
            },
            token_issuer_public_keys_hex: vec![issuer_pub_hex],
            ..RelayRuntimeConfig::default()
        };
        let _ = run_udp_with_ready(config, Some(ready_tx)).await;
    });

    let relay_addr = match timeout(CI_TIMEOUT, ready_rx).await {
        Ok(Ok(Ok(addr))) => addr,
        Ok(Ok(Err(error))) => {
            let is_permission_error = error.contains("Permission denied")
                || error.contains("Operation not permitted")
                || error.contains("os error 13")
                || error.contains("os error 1");
            if is_permission_error {
                relay_task.abort();
                return;
            }
            panic!("relay startup failed before readiness: {error}");
        }
        Ok(Err(_)) => panic!("relay readiness channel closed before startup status"),
        Err(_) => panic!("relay readiness timeout after {}s", CI_TIMEOUT.as_secs()),
    };

    let conn_id = 0xfeed_u64;
    let channel_a = RelayDatagramChannel::bind(
        "127.0.0.1:0".parse().expect("parse local addr a"),
        relay_addr,
        conn_id,
    )
    .await
    .expect("bind channel a");
    let channel_b = RelayDatagramChannel::bind(
        "127.0.0.1:0".parse().expect("parse local addr b"),
        relay_addr,
        conn_id,
    )
    .await
    .expect("bind channel b");

    let token = mint_signed_token(
        RELAY_NAME,
        RELAY_TOKEN_SUBJECT,
        unix_now().saturating_add(3600),
        RELAY_TOKEN_ISSUER_SEED,
    );
    assert_allocate_and_bind_ok("a", &channel_a, token.as_str(), relay_addr, conn_id).await;
    assert_allocate_and_bind_ok("b", &channel_b, token.as_str(), relay_addr, conn_id).await;
    assert_allocate_bind_path_ready(&channel_a, &channel_b, relay_addr, conn_id).await;

    let mut initiator = SecureSession::new_initiator(
        conn_id,
        b"animus/fabric/v1/relay-first",
        DeterministicPrimitives::new([1; 32]),
    );
    let mut responder = SecureSession::new_responder(
        conn_id,
        b"animus/fabric/v1/relay-first",
        DeterministicPrimitives::new([2; 32]),
    );

    let msg1 = initiator.start_handshake(b"hello").expect("msg1");
    let msg1_in = recv_msg1_with_retry(
        &channel_a,
        &channel_b,
        msg1.as_slice(),
        relay_addr,
        conn_id,
        &initiator,
        &responder,
    )
    .await;

    let out_b = responder
        .handle_incoming(msg1_in.as_slice())
        .expect("responder handle msg1");
    assert_eq!(out_b.outbound.len(), 1);
    channel_b
        .send(out_b.outbound[0].as_slice())
        .await
        .expect("send msg2");

    let (_, msg2_in) = recv_with_timeout(
        "msg2", &channel_a, relay_addr, conn_id, &initiator, &responder,
    )
    .await;
    let out_a = initiator
        .handle_incoming(msg2_in.as_slice())
        .expect("initiator handle msg2");
    assert_eq!(out_a.outbound.len(), 1);
    channel_a
        .send(out_a.outbound[0].as_slice())
        .await
        .expect("send msg3");

    let (_, msg3_in) = recv_with_timeout(
        "msg3", &channel_b, relay_addr, conn_id, &initiator, &responder,
    )
    .await;
    let out_b2 = responder
        .handle_incoming(msg3_in.as_slice())
        .expect("responder handle msg3");
    assert!(out_b2.outbound.is_empty());
    assert!(initiator.is_established());
    assert!(responder.is_established());

    let encrypted_ping = initiator
        .encrypt_data(9, b"ping-through-relay")
        .expect("encrypt ping");
    channel_a
        .send(encrypted_ping.as_slice())
        .await
        .expect("send encrypted ping");
    let (_, ping_in) = recv_with_timeout(
        "ping", &channel_b, relay_addr, conn_id, &initiator, &responder,
    )
    .await;
    let ping_result = responder
        .handle_incoming(ping_in.as_slice())
        .expect("handle ping");
    assert_eq!(
        ping_result.events,
        vec![SessionEvent::Data {
            stream_id: 9,
            payload: b"ping-through-relay".to_vec(),
        }]
    );

    relay_task.abort();
    let _ = relay_task.await;
}

async fn assert_allocate_and_bind_ok(
    label: &str,
    channel: &RelayDatagramChannel,
    token: &str,
    relay_addr: SocketAddr,
    conn_id: u64,
) {
    if let Err(error) = channel.allocate_and_bind(token, 120).await {
        panic!("allocate/bind {label} failed: {error}; relay_addr={relay_addr}; conn_id={conn_id}");
    }
}

async fn assert_allocate_bind_path_ready(
    channel_a: &RelayDatagramChannel,
    channel_b: &RelayDatagramChannel,
    relay_addr: SocketAddr,
    conn_id: u64,
) {
    let probe_ab = b"relay-probe-a-to-b";
    channel_a
        .send(probe_ab)
        .await
        .expect("send allocate/bind probe a->b");
    let (_, recv_ab) = match timeout(RELAY_PATH_TIMEOUT, channel_b.recv()).await {
        Ok(Ok(packet)) => packet,
        Ok(Err(error)) => panic!(
            "allocate/bind verification failed receiving a->b probe: {error}; \
             relay_addr={relay_addr}; conn_id={conn_id}"
        ),
        Err(_) => panic!(
            "allocate/bind verification timeout on a->b probe after {}s; \
             relay_addr={relay_addr}; conn_id={conn_id}",
            RELAY_PATH_TIMEOUT.as_secs()
        ),
    };
    assert_eq!(
        recv_ab.as_slice(),
        probe_ab,
        "allocate/bind verification payload mismatch for a->b; relay_addr={relay_addr}; conn_id={conn_id}"
    );

    let probe_ba = b"relay-probe-b-to-a";
    channel_b
        .send(probe_ba)
        .await
        .expect("send allocate/bind probe b->a");
    let (_, recv_ba) = match timeout(RELAY_PATH_TIMEOUT, channel_a.recv()).await {
        Ok(Ok(packet)) => packet,
        Ok(Err(error)) => panic!(
            "allocate/bind verification failed receiving b->a probe: {error}; \
             relay_addr={relay_addr}; conn_id={conn_id}"
        ),
        Err(_) => panic!(
            "allocate/bind verification timeout on b->a probe after {}s; \
             relay_addr={relay_addr}; conn_id={conn_id}",
            RELAY_PATH_TIMEOUT.as_secs()
        ),
    };
    assert_eq!(
        recv_ba.as_slice(),
        probe_ba,
        "allocate/bind verification payload mismatch for b->a; relay_addr={relay_addr}; conn_id={conn_id}"
    );
}

async fn recv_msg1_with_retry(
    sender: &RelayDatagramChannel,
    receiver: &RelayDatagramChannel,
    msg1: &[u8],
    relay_addr: SocketAddr,
    conn_id: u64,
    initiator: &SecureSession<DeterministicPrimitives>,
    responder: &SecureSession<DeterministicPrimitives>,
) -> Vec<u8> {
    for attempt in 1..=MSG1_RETRY_ATTEMPTS {
        sender.send(msg1).await.expect("send msg1");
        match timeout(CI_TIMEOUT, receiver.recv()).await {
            Ok(Ok((_, payload))) => return payload,
            Ok(Err(error)) => {
                panic!(
                    "recv msg1 failed: {error}; relay_addr={relay_addr}; conn_id={conn_id}; \
                     attempt={attempt}; initiator_established={}; responder_established={}",
                    initiator.is_established(),
                    responder.is_established(),
                );
            }
            Err(_) if attempt < MSG1_RETRY_ATTEMPTS => {}
            Err(_) => {
                panic!(
                    "recv msg1 timeout; relay_addr={relay_addr}; conn_id={conn_id}; \
                     attempts={MSG1_RETRY_ATTEMPTS}; initiator_established={}; responder_established={}",
                    initiator.is_established(),
                    responder.is_established(),
                );
            }
        }
    }
    unreachable!("msg1 retry loop must return or panic")
}

async fn recv_with_timeout(
    stage: &str,
    channel: &RelayDatagramChannel,
    relay_addr: SocketAddr,
    conn_id: u64,
    initiator: &SecureSession<DeterministicPrimitives>,
    responder: &SecureSession<DeterministicPrimitives>,
) -> (SocketAddr, Vec<u8>) {
    match timeout(CI_TIMEOUT, channel.recv()).await {
        Ok(Ok(packet)) => packet,
        Ok(Err(error)) => panic!(
            "recv {stage} failed: {error}; relay_addr={relay_addr}; conn_id={conn_id}; \
             initiator_established={}; responder_established={}",
            initiator.is_established(),
            responder.is_established(),
        ),
        Err(_) => panic!(
            "recv {stage} timeout after {}s; relay_addr={relay_addr}; conn_id={conn_id}; \
             initiator_established={}; responder_established={}",
            CI_TIMEOUT.as_secs(),
            initiator.is_established(),
            responder.is_established(),
        ),
    }
}

fn unix_now() -> u64 {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => duration.as_secs(),
        Err(_) => 0,
    }
}

fn mint_signed_token(relay_name: &str, subject: &str, exp: u64, seed: [u8; 32]) -> String {
    mint_token(
        &RelayTokenClaims {
            ver: 1,
            sub: subject.to_string(),
            relay_name: relay_name.to_string(),
            exp,
            nbf: None,
            nonce: Some("relay-e2e".to_string()),
            scopes: Some(vec!["relay:allocate".to_string()]),
        },
        seed,
    )
    .expect("mint signed relay token")
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}
