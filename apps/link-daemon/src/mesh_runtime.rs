use std::io;

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::control_store::{
    MeshRuntimeSnapshot, MessengerConversationRecord, MessengerMessageRecord,
};

pub const RUNTIME_MAGIC: &[u8; 4] = b"amrt";
pub const MESSENGER_RUNTIME_SERVICE: &str = "__messenger__";
const MAX_RUNTIME_JSON_BYTES: usize = 128 * 1024;
const MAX_RUNTIME_FRAME_BYTES: usize = 128 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshSyncPayload {
    pub mesh_id: String,
    pub sender_peer_id: String,
    pub sender_node_id: String,
    pub sender_api_url: String,
    pub sender_runtime_addr: String,
    pub sent_at_unix_secs: u64,
    pub hops_remaining: u8,
    pub snapshot: MeshRuntimeSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RuntimeHello {
    Direct {
        mesh_id: String,
        source_peer_id: String,
        source_node_id: String,
        target_peer_id: String,
        conn_id: u64,
    },
    RelayBind {
        mesh_id: String,
        source_peer_id: String,
        source_node_id: String,
        remote_peer_id: String,
        conn_id: u64,
    },
    RelayConnect {
        mesh_id: String,
        source_peer_id: String,
        source_node_id: String,
        remote_peer_id: String,
        conn_id: u64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeHelloAck {
    pub ok: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessengerDeliveryEnvelope {
    pub conversation: MessengerConversationRecord,
    pub message: MessengerMessageRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessengerDeliveryAck {
    pub received: bool,
}

pub async fn write_runtime_json<W, T>(writer: &mut W, value: &T) -> io::Result<()>
where
    W: AsyncWrite + Unpin,
    T: Serialize,
{
    writer.write_all(RUNTIME_MAGIC).await?;
    write_json_payload(writer, value).await
}

pub async fn read_runtime_json<R, T>(reader: &mut R) -> io::Result<T>
where
    R: AsyncRead + Unpin,
    T: DeserializeOwned,
{
    let mut magic = [0u8; 4];
    reader.read_exact(&mut magic).await?;
    if &magic != RUNTIME_MAGIC {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid runtime magic",
        ));
    }
    read_json_payload(reader).await
}

pub async fn write_json_payload<W, T>(writer: &mut W, value: &T) -> io::Result<()>
where
    W: AsyncWrite + Unpin,
    T: Serialize,
{
    let encoded = serde_json::to_vec(value)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "runtime json encode failed"))?;
    if encoded.len() > MAX_RUNTIME_JSON_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "runtime json payload too large",
        ));
    }
    writer
        .write_all(&(encoded.len() as u32).to_be_bytes())
        .await?;
    writer.write_all(encoded.as_slice()).await?;
    writer.flush().await
}

pub async fn read_json_payload<R, T>(reader: &mut R) -> io::Result<T>
where
    R: AsyncRead + Unpin,
    T: DeserializeOwned,
{
    let mut len_bytes = [0u8; 4];
    reader.read_exact(&mut len_bytes).await?;
    let len = u32::from_be_bytes(len_bytes) as usize;
    if len > MAX_RUNTIME_JSON_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "runtime json payload too large",
        ));
    }
    let mut encoded = vec![0u8; len];
    reader.read_exact(encoded.as_mut_slice()).await?;
    serde_json::from_slice(encoded.as_slice())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "runtime json decode failed"))
}

pub async fn write_packet_frame<W>(writer: &mut W, packet: &[u8]) -> io::Result<()>
where
    W: AsyncWrite + Unpin,
{
    if packet.len() > MAX_RUNTIME_FRAME_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "runtime frame too large",
        ));
    }
    writer
        .write_all(&(packet.len() as u32).to_be_bytes())
        .await?;
    writer.write_all(packet).await?;
    writer.flush().await
}

pub async fn read_packet_frame<R>(reader: &mut R) -> io::Result<Vec<u8>>
where
    R: AsyncRead + Unpin,
{
    let mut len_bytes = [0u8; 4];
    reader.read_exact(&mut len_bytes).await?;
    let len = u32::from_be_bytes(len_bytes) as usize;
    if len > MAX_RUNTIME_FRAME_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "runtime frame too large",
        ));
    }
    let mut packet = vec![0u8; len];
    reader.read_exact(packet.as_mut_slice()).await?;
    Ok(packet)
}
