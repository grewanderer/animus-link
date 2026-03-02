use thiserror::Error;

const VERSION: u8 = 1;
const TYPE_IP_PACKET: u8 = 0x01;
const TYPE_DNS_QUERY: u8 = 0x02;
const TYPE_DNS_RESPONSE: u8 = 0x03;
const TYPE_CONTROL_AUTH: u8 = 0x10;
const TYPE_CONTROL_AUTH_OK: u8 = 0x11;
const TYPE_CONTROL_ERROR: u8 = 0x12;
const HEADER_LEN: usize = 4;

pub const DEFAULT_MAX_IP_PACKET_BYTES: usize = 2048;
pub const DEFAULT_MAX_DNS_BYTES: usize = 2048;
pub const DEFAULT_MAX_CONTROL_BYTES: usize = 256;
pub const DEFAULT_MAX_FRAME_BYTES: usize = HEADER_LEN + DEFAULT_MAX_IP_PACKET_BYTES;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TunnelControl {
    Auth { peer_id: String },
    AuthOk,
    Error { code: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TunnelMessage {
    IpPacket { bytes: Vec<u8> },
    DnsQuery { query_id: u16, bytes: Vec<u8> },
    DnsResponse { query_id: u16, bytes: Vec<u8> },
    Control(TunnelControl),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TunnelLimits {
    pub max_ip_packet_bytes: usize,
    pub max_dns_bytes: usize,
    pub max_control_bytes: usize,
    pub max_frame_bytes: usize,
}

impl Default for TunnelLimits {
    fn default() -> Self {
        Self {
            max_ip_packet_bytes: DEFAULT_MAX_IP_PACKET_BYTES,
            max_dns_bytes: DEFAULT_MAX_DNS_BYTES,
            max_control_bytes: DEFAULT_MAX_CONTROL_BYTES,
            max_frame_bytes: DEFAULT_MAX_FRAME_BYTES,
        }
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum TunnelProtoError {
    #[error("invalid frame")]
    InvalidFrame,
    #[error("frame too large")]
    FrameTooLarge,
    #[error("unsupported version")]
    UnsupportedVersion,
    #[error("message too large")]
    MessageTooLarge,
}

pub fn encode_message(message: &TunnelMessage) -> Result<Vec<u8>, TunnelProtoError> {
    let mut out = Vec::new();
    out.push(VERSION);

    match message {
        TunnelMessage::IpPacket { bytes } => {
            if bytes.len() > u16::MAX as usize || bytes.len() > DEFAULT_MAX_IP_PACKET_BYTES {
                return Err(TunnelProtoError::MessageTooLarge);
            }
            out.push(TYPE_IP_PACKET);
            out.extend_from_slice(&(bytes.len() as u16).to_le_bytes());
            out.extend_from_slice(bytes.as_slice());
        }
        TunnelMessage::DnsQuery { query_id, bytes } => {
            if bytes.len() + 2 > u16::MAX as usize || bytes.len() > DEFAULT_MAX_DNS_BYTES {
                return Err(TunnelProtoError::MessageTooLarge);
            }
            out.push(TYPE_DNS_QUERY);
            out.extend_from_slice(&((bytes.len() + 2) as u16).to_le_bytes());
            out.extend_from_slice(&query_id.to_le_bytes());
            out.extend_from_slice(bytes.as_slice());
        }
        TunnelMessage::DnsResponse { query_id, bytes } => {
            if bytes.len() + 2 > u16::MAX as usize || bytes.len() > DEFAULT_MAX_DNS_BYTES {
                return Err(TunnelProtoError::MessageTooLarge);
            }
            out.push(TYPE_DNS_RESPONSE);
            out.extend_from_slice(&((bytes.len() + 2) as u16).to_le_bytes());
            out.extend_from_slice(&query_id.to_le_bytes());
            out.extend_from_slice(bytes.as_slice());
        }
        TunnelMessage::Control(TunnelControl::Auth { peer_id }) => {
            let peer = peer_id.as_bytes();
            if peer.is_empty() || peer.len() > u8::MAX as usize || peer.len() > 64 {
                return Err(TunnelProtoError::MessageTooLarge);
            }
            out.push(TYPE_CONTROL_AUTH);
            out.extend_from_slice(&((peer.len() + 1) as u16).to_le_bytes());
            out.push(peer.len() as u8);
            out.extend_from_slice(peer);
        }
        TunnelMessage::Control(TunnelControl::AuthOk) => {
            out.push(TYPE_CONTROL_AUTH_OK);
            out.extend_from_slice(&0u16.to_le_bytes());
        }
        TunnelMessage::Control(TunnelControl::Error { code }) => {
            let code_bytes = code.as_bytes();
            if code_bytes.is_empty()
                || code_bytes.len() > u8::MAX as usize
                || code_bytes.len() > DEFAULT_MAX_CONTROL_BYTES
            {
                return Err(TunnelProtoError::MessageTooLarge);
            }
            out.push(TYPE_CONTROL_ERROR);
            out.extend_from_slice(&((code_bytes.len() + 1) as u16).to_le_bytes());
            out.push(code_bytes.len() as u8);
            out.extend_from_slice(code_bytes);
        }
    }

    Ok(out)
}

pub fn decode_message(
    input: &[u8],
    limits: TunnelLimits,
) -> Result<TunnelMessage, TunnelProtoError> {
    if input.len() < HEADER_LEN {
        return Err(TunnelProtoError::InvalidFrame);
    }
    if input.len() > limits.max_frame_bytes {
        return Err(TunnelProtoError::FrameTooLarge);
    }
    if input[0] != VERSION {
        return Err(TunnelProtoError::UnsupportedVersion);
    }

    let declared_len = u16::from_le_bytes([input[2], input[3]]) as usize;
    if declared_len + HEADER_LEN != input.len() {
        return Err(TunnelProtoError::InvalidFrame);
    }
    let payload = &input[HEADER_LEN..];

    match input[1] {
        TYPE_IP_PACKET => {
            if payload.len() > limits.max_ip_packet_bytes {
                return Err(TunnelProtoError::MessageTooLarge);
            }
            Ok(TunnelMessage::IpPacket {
                bytes: payload.to_vec(),
            })
        }
        TYPE_DNS_QUERY => {
            if payload.len() < 2 || payload.len() - 2 > limits.max_dns_bytes {
                return Err(TunnelProtoError::MessageTooLarge);
            }
            let query_id = u16::from_le_bytes([payload[0], payload[1]]);
            Ok(TunnelMessage::DnsQuery {
                query_id,
                bytes: payload[2..].to_vec(),
            })
        }
        TYPE_DNS_RESPONSE => {
            if payload.len() < 2 || payload.len() - 2 > limits.max_dns_bytes {
                return Err(TunnelProtoError::MessageTooLarge);
            }
            let query_id = u16::from_le_bytes([payload[0], payload[1]]);
            Ok(TunnelMessage::DnsResponse {
                query_id,
                bytes: payload[2..].to_vec(),
            })
        }
        TYPE_CONTROL_AUTH => {
            if payload.is_empty() || payload.len() > limits.max_control_bytes {
                return Err(TunnelProtoError::MessageTooLarge);
            }
            let peer_len = payload[0] as usize;
            if peer_len == 0 || payload.len() != peer_len + 1 {
                return Err(TunnelProtoError::InvalidFrame);
            }
            let peer_id = std::str::from_utf8(&payload[1..])
                .map_err(|_| TunnelProtoError::InvalidFrame)?
                .to_string();
            Ok(TunnelMessage::Control(TunnelControl::Auth { peer_id }))
        }
        TYPE_CONTROL_AUTH_OK => {
            if !payload.is_empty() {
                return Err(TunnelProtoError::InvalidFrame);
            }
            Ok(TunnelMessage::Control(TunnelControl::AuthOk))
        }
        TYPE_CONTROL_ERROR => {
            if payload.is_empty() || payload.len() > limits.max_control_bytes {
                return Err(TunnelProtoError::MessageTooLarge);
            }
            let code_len = payload[0] as usize;
            if code_len == 0 || payload.len() != code_len + 1 {
                return Err(TunnelProtoError::InvalidFrame);
            }
            let code = std::str::from_utf8(&payload[1..])
                .map_err(|_| TunnelProtoError::InvalidFrame)?
                .to_string();
            Ok(TunnelMessage::Control(TunnelControl::Error { code }))
        }
        _ => Err(TunnelProtoError::InvalidFrame),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        decode_message, encode_message, TunnelControl, TunnelLimits, TunnelMessage,
        TunnelProtoError,
    };

    #[test]
    fn ip_packet_roundtrip() {
        let message = TunnelMessage::IpPacket {
            bytes: vec![0x45, 0x00, 0x00, 0x14],
        };
        let encoded = encode_message(&message).expect("encode");
        let decoded = decode_message(encoded.as_slice(), TunnelLimits::default()).expect("decode");
        assert_eq!(decoded, message);
    }

    #[test]
    fn dns_roundtrip() {
        let message = TunnelMessage::DnsQuery {
            query_id: 7,
            bytes: vec![0xaa, 0xbb, 0xcc],
        };
        let encoded = encode_message(&message).expect("encode");
        let decoded = decode_message(encoded.as_slice(), TunnelLimits::default()).expect("decode");
        assert_eq!(decoded, message);
    }

    #[test]
    fn control_roundtrip() {
        let message = TunnelMessage::Control(TunnelControl::Auth {
            peer_id: "peer-b".to_string(),
        });
        let encoded = encode_message(&message).expect("encode");
        let decoded = decode_message(encoded.as_slice(), TunnelLimits::default()).expect("decode");
        assert_eq!(decoded, message);
    }

    #[test]
    fn malformed_frame_rejected() {
        let mut encoded =
            encode_message(&TunnelMessage::Control(TunnelControl::AuthOk)).expect("encode auth-ok");
        encoded[3] = 1;
        let error = decode_message(encoded.as_slice(), TunnelLimits::default()).expect_err("error");
        assert_eq!(error, TunnelProtoError::InvalidFrame);
    }

    #[test]
    fn oversized_ip_payload_rejected() {
        let encoded = encode_message(&TunnelMessage::IpPacket {
            bytes: vec![0u8; 2048],
        })
        .expect("encode");
        let limits = TunnelLimits {
            max_ip_packet_bytes: 1024,
            ..TunnelLimits::default()
        };
        let error = decode_message(encoded.as_slice(), limits).expect_err("oversized must fail");
        assert_eq!(error, TunnelProtoError::MessageTooLarge);
    }
}
