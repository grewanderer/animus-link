use std::{io, net::SocketAddr, time::Duration};

use fabric_crypto::DeterministicPrimitives;
use fabric_session::{
    relay_channel::RelayDatagramChannel,
    secure_session::{SecureSession, SessionEvent},
};
use relay_server::{run_udp, RelayRuntimeConfig};
use tokio::time::timeout;

#[tokio::test]
async fn relay_loopback_establishes_secure_session_and_exchanges_data() {
    let relay_addr = match reserve_udp_addr().await {
        Ok(addr) => addr,
        Err(error) if error.kind() == io::ErrorKind::PermissionDenied => return,
        Err(error) => panic!("reserve relay addr: {error}"),
    };

    let relay_task = tokio::spawn(async move {
        let config = RelayRuntimeConfig {
            bind: relay_addr,
            dev_allow_unsigned_tokens: true,
            ..RelayRuntimeConfig::default()
        };
        let _ = run_udp(config).await;
    });

    tokio::time::sleep(Duration::from_millis(50)).await;

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
    channel_a.send(msg1.as_slice()).await.expect("send msg1");

    let (_, msg1_in) = timeout(Duration::from_secs(2), channel_b.recv())
        .await
        .expect("receive msg1 timeout")
        .expect("receive msg1");
    let out_b = responder
        .handle_incoming(msg1_in.as_slice())
        .expect("responder handle msg1");
    assert_eq!(out_b.outbound.len(), 1);
    channel_b
        .send(out_b.outbound[0].as_slice())
        .await
        .expect("send msg2");

    let (_, msg2_in) = timeout(Duration::from_secs(2), channel_a.recv())
        .await
        .expect("receive msg2 timeout")
        .expect("receive msg2");
    let out_a = initiator
        .handle_incoming(msg2_in.as_slice())
        .expect("initiator handle msg2");
    assert_eq!(out_a.outbound.len(), 1);
    channel_a
        .send(out_a.outbound[0].as_slice())
        .await
        .expect("send msg3");

    let (_, msg3_in) = timeout(Duration::from_secs(2), channel_b.recv())
        .await
        .expect("receive msg3 timeout")
        .expect("receive msg3");
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
    let (_, ping_in) = timeout(Duration::from_secs(2), channel_b.recv())
        .await
        .expect("receive ping timeout")
        .expect("receive ping");
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
}

async fn reserve_udp_addr() -> io::Result<SocketAddr> {
    let socket = tokio::net::UdpSocket::bind("127.0.0.1:0").await?;
    let addr = socket.local_addr()?;
    drop(socket);
    Ok(addr)
}

fn unix_now() -> u64 {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => duration.as_secs(),
        Err(_) => 0,
    }
}
