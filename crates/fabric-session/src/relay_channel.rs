use std::net::SocketAddr;

use fabric_relay_client::RelayClient;
use fabric_relay_proto::{RelayCtrl, RelayPacket};

use crate::errors::SessionError;

pub struct RelayDatagramChannel {
    client: RelayClient,
    conn_id: u64,
}

impl RelayDatagramChannel {
    pub async fn bind(
        local_addr: SocketAddr,
        relay_addr: SocketAddr,
        conn_id: u64,
    ) -> Result<Self, SessionError> {
        let client = RelayClient::bind(local_addr, relay_addr)
            .await
            .map_err(|error| SessionError::Relay(error.to_string()))?;
        Ok(Self { client, conn_id })
    }

    pub async fn allocate_and_bind(
        &self,
        token: &str,
        requested_ttl_secs: u32,
    ) -> Result<(), SessionError> {
        self.client
            .send_ctrl(RelayCtrl::Allocate {
                token: token.to_string(),
                requested_ttl_secs,
            })
            .await
            .map_err(|error| SessionError::Relay(error.to_string()))?;
        self.client
            .send_ctrl(RelayCtrl::Bind {
                conn_id: self.conn_id,
            })
            .await
            .map_err(|error| SessionError::Relay(error.to_string()))?;
        Ok(())
    }

    pub async fn send(&self, payload: &[u8]) -> Result<(), SessionError> {
        self.client
            .send_data(self.conn_id, payload)
            .await
            .map_err(|error| SessionError::Relay(error.to_string()))
    }

    pub async fn recv(&self) -> Result<(SocketAddr, Vec<u8>), SessionError> {
        loop {
            let (packet, src) = self
                .client
                .recv_packet()
                .await
                .map_err(|error| SessionError::Relay(error.to_string()))?;
            match packet {
                RelayPacket::Data(data) if data.conn_id == self.conn_id => {
                    return Ok((src, data.payload))
                }
                _ => {}
            }
        }
    }
}
