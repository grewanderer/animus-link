use std::{net::SocketAddr, time::Duration};

use fabric_crypto::DeterministicPrimitives;
use fabric_session::{
    relay_channel::RelayDatagramChannel,
    secure_session::{SecureSession, SessionEvent},
};
use relay_server::{run_udp_with_ready, RelayRuntimeConfig};
use tokio::{sync::oneshot, time::timeout};

const CI_TIMEOUT: Duration = Duration::from_secs(8);
const MSG1_RETRY_ATTEMPTS: usize = 3;

#[tokio::test]
async fn relay_loopback_establishes_secure_session_and_exchanges_data() {
    let (ready_tx, ready_rx) = oneshot::channel();
    let relay_task = tokio::spawn(async move {
        let config = RelayRuntimeConfig {
            bind: "127.0.0.1:0".parse().expect("parse relay bind"),
            dev_allow_unsigned_tokens: true,
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

    let token = format!(
        "v=1;exp={};uid=e2e;relay=default-relay;sig=dev-only-unsigned",
        unix_now().saturating_add(3600)
    );
    channel_a
        .allocate_and_bind(token.as_str(), 120)
        .await
        .expect("allocate/bind a");
    channel_b
        .allocate_and_bind(token.as_str(), 120)
        .await
        .expect("allocate/bind b");

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
