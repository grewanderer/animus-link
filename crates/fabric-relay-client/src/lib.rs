pub mod errors;

use std::net::SocketAddr;

use fabric_relay_proto::{
    decode_packet, encode_packet, RelayCtrl, RelayCtrlEnvelope, RelayData, RelayPacket,
};
use tokio::net::UdpSocket;

use crate::errors::RelayClientError;

pub struct RelayClient {
    socket: UdpSocket,
    relay_addr: SocketAddr,
}

impl RelayClient {
    pub async fn bind(
        local_addr: SocketAddr,
        relay_addr: SocketAddr,
    ) -> Result<Self, RelayClientError> {
        let socket = UdpSocket::bind(local_addr).await?;
        Ok(Self { socket, relay_addr })
    }

    pub async fn send_ctrl(&self, message: RelayCtrl) -> Result<(), RelayClientError> {
        let envelope = RelayCtrlEnvelope::new(message);
        let packet = encode_packet(&RelayPacket::Ctrl(envelope))?;
        self.socket.send_to(&packet, self.relay_addr).await?;
        Ok(())
    }

    pub async fn send_data(&self, conn_id: u64, payload: &[u8]) -> Result<(), RelayClientError> {
        let packet = encode_packet(&RelayPacket::Data(RelayData {
            conn_id,
            payload: payload.to_vec(),
        }))?;
        self.socket.send_to(&packet, self.relay_addr).await?;
        Ok(())
    }

    pub async fn recv_packet(&self) -> Result<(RelayPacket, SocketAddr), RelayClientError> {
        let mut buf = [0_u8; 65_535];
        let (len, src) = self.socket.recv_from(&mut buf).await?;
        let packet = decode_packet(&buf[..len])?;
        Ok((packet, src))
    }
}
