use crate::errors::RelayProtoError;
use serde::{Deserialize, Serialize};

pub const RELAY_PACKET_VERSION: u8 = 1;
pub const RELAY_CTRL_SCHEMA_VERSION: u16 = 1;

pub const RELAY_PACKET_KIND_CTRL: u8 = 0x01;
pub const RELAY_PACKET_KIND_DATA: u8 = 0x02;

const DATA_HEADER_SIZE: usize = 2 + 8;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum RelayCtrl {
    Allocate {
        token: String,
        requested_ttl_secs: u32,
    },
    Bind {
        conn_id: u64,
    },
    Ping {
        nonce: u64,
    },
    Pong {
        nonce: u64,
    },
    Close {
        reason: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RelayCtrlEnvelope {
    pub version: u16,
    #[serde(flatten)]
    pub message: RelayCtrl,
}

impl RelayCtrlEnvelope {
    pub fn new(message: RelayCtrl) -> Self {
        Self {
            version: RELAY_CTRL_SCHEMA_VERSION,
            message,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelayData {
    pub conn_id: u64,
    pub payload: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RelayPacket {
    Ctrl(RelayCtrlEnvelope),
    Data(RelayData),
}

pub fn encode_ctrl_json(envelope: &RelayCtrlEnvelope) -> Result<Vec<u8>, RelayProtoError> {
    let json = serde_json::to_vec(envelope)?;
    Ok(json)
}

pub fn decode_ctrl_json(input: &[u8]) -> Result<RelayCtrlEnvelope, RelayProtoError> {
    let text = std::str::from_utf8(input)?;
    let envelope: RelayCtrlEnvelope = serde_json::from_str(text)?;
    if envelope.version != RELAY_CTRL_SCHEMA_VERSION {
        return Err(RelayProtoError::UnsupportedCtrlVersion(envelope.version));
    }
    Ok(envelope)
}

pub fn encode_packet(packet: &RelayPacket) -> Result<Vec<u8>, RelayProtoError> {
    match packet {
        RelayPacket::Ctrl(envelope) => {
            let mut out = vec![RELAY_PACKET_KIND_CTRL, RELAY_PACKET_VERSION];
            out.extend_from_slice(&encode_ctrl_json(envelope)?);
            Ok(out)
        }
        RelayPacket::Data(data) => {
            let mut out = Vec::with_capacity(DATA_HEADER_SIZE + data.payload.len());
            out.push(RELAY_PACKET_KIND_DATA);
            out.push(RELAY_PACKET_VERSION);
            out.extend_from_slice(&data.conn_id.to_le_bytes());
            out.extend_from_slice(&data.payload);
            Ok(out)
        }
    }
}

pub fn decode_packet(input: &[u8]) -> Result<RelayPacket, RelayProtoError> {
    if input.len() < 2 {
        return Err(RelayProtoError::Truncated);
    }

    let packet_kind = input[0];
    let packet_version = input[1];
    if packet_version != RELAY_PACKET_VERSION {
        return Err(RelayProtoError::UnsupportedPacketVersion(packet_version));
    }

    match packet_kind {
        RELAY_PACKET_KIND_CTRL => {
            let envelope = decode_ctrl_json(&input[2..])?;
            Ok(RelayPacket::Ctrl(envelope))
        }
        RELAY_PACKET_KIND_DATA => {
            if input.len() < DATA_HEADER_SIZE {
                return Err(RelayProtoError::Truncated);
            }
            let mut conn_id_bytes = [0_u8; 8];
            conn_id_bytes.copy_from_slice(&input[2..10]);
            let conn_id = u64::from_le_bytes(conn_id_bytes);
            let payload = input[10..].to_vec();
            Ok(RelayPacket::Data(RelayData { conn_id, payload }))
        }
        other => Err(RelayProtoError::UnknownPacketKind(other)),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        decode_packet, encode_packet, RelayCtrl, RelayCtrlEnvelope, RelayData, RelayPacket,
        RELAY_CTRL_SCHEMA_VERSION,
    };

    #[test]
    fn ctrl_roundtrip_is_stable_and_versioned() {
        let envelope = RelayCtrlEnvelope::new(RelayCtrl::Allocate {
            token: "token-value".to_string(),
            requested_ttl_secs: 60,
        });
        let encoded = encode_packet(&RelayPacket::Ctrl(envelope.clone())).expect("encode ctrl");
        let decoded = decode_packet(&encoded).expect("decode ctrl");
        assert_eq!(decoded, RelayPacket::Ctrl(envelope));
    }

    #[test]
    fn data_roundtrip_preserves_payload_bytes() {
        let payload = vec![0x00, 0x01, 0x7f, 0x80, 0xff, b'x', b'y', b'z'];
        let packet = RelayPacket::Data(RelayData {
            conn_id: 4242,
            payload: payload.clone(),
        });
        let encoded = encode_packet(&packet).expect("encode data");
        let decoded = decode_packet(&encoded).expect("decode data");
        assert_eq!(decoded, packet);
        if let RelayPacket::Data(data) = decoded {
            assert_eq!(data.payload, payload);
        }
    }

    #[test]
    fn ctrl_rejects_unknown_schema_version() {
        let wire = br#"{"version":999,"type":"ping","nonce":7}"#;
        let mut packet = vec![0x01, 0x01];
        packet.extend_from_slice(wire);

        let error = decode_packet(&packet).expect_err("unknown schema version must fail");
        assert_eq!(
            error.to_string(),
            "unsupported relay control schema version 999"
        );
    }

    #[test]
    fn ctrl_envelope_default_version_constant_is_v1() {
        let envelope = RelayCtrlEnvelope::new(RelayCtrl::Ping { nonce: 1 });
        assert_eq!(envelope.version, RELAY_CTRL_SCHEMA_VERSION);
    }
}
