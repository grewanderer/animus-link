use bytes::BytesMut;
use fabric_crypto::{NoisePrimitives, NoiseRole, NoiseXXHandshake};
use fabric_wire::{
    codec::{decode_header, encode_header},
    FrameHeader, MessageType,
};

use crate::{cipher::PacketCipher, errors::SessionError, replay::AntiReplay};

pub const HANDSHAKE_STREAM_ID: u32 = 0;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionEvent {
    HandshakeComplete,
    Data { stream_id: u32, payload: Vec<u8> },
    Close { stream_id: u32 },
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct HandleResult {
    pub outbound: Vec<Vec<u8>>,
    pub events: Vec<SessionEvent>,
}

pub struct SecureSession<P: NoisePrimitives> {
    conn_id: u64,
    role: NoiseRole,
    handshake: NoiseXXHandshake<P>,
    send_pn: u64,
    replay: AntiReplay,
    send_cipher: Option<PacketCipher>,
    recv_cipher: Option<PacketCipher>,
    max_handshake_packet_size: usize,
}

impl<P: NoisePrimitives> SecureSession<P> {
    pub fn new_initiator(conn_id: u64, prologue: &[u8], primitives: P) -> Self {
        Self::new(conn_id, NoiseRole::Initiator, prologue, primitives)
    }

    pub fn new_responder(conn_id: u64, prologue: &[u8], primitives: P) -> Self {
        Self::new(conn_id, NoiseRole::Responder, prologue, primitives)
    }

    fn new(conn_id: u64, role: NoiseRole, prologue: &[u8], primitives: P) -> Self {
        Self {
            conn_id,
            role,
            handshake: NoiseXXHandshake::new(role, prologue, primitives),
            send_pn: 0,
            replay: AntiReplay::new(),
            send_cipher: None,
            recv_cipher: None,
            max_handshake_packet_size: 2048,
        }
    }

    pub fn is_established(&self) -> bool {
        self.send_cipher.is_some() && self.recv_cipher.is_some() && self.handshake.is_complete()
    }

    pub fn conn_id(&self) -> u64 {
        self.conn_id
    }

    pub fn start_handshake(&mut self, payload: &[u8]) -> Result<Vec<u8>, SessionError> {
        if self.role != NoiseRole::Initiator {
            return Err(SessionError::InvalidTransition {
                state: "responder start_handshake",
            });
        }
        let message = self.handshake.write_message(payload)?;
        self.wrap_frame(
            MessageType::HandshakeInit,
            HANDSHAKE_STREAM_ID,
            message.as_slice(),
        )
    }

    pub fn handle_incoming(&mut self, frame: &[u8]) -> Result<HandleResult, SessionError> {
        let (header, payload) = decode_frame(frame)?;
        if header.conn_id != self.conn_id {
            return Err(SessionError::ConnIdMismatch);
        }

        match header.msg_type {
            MessageType::HandshakeInit | MessageType::HandshakeResp => {
                self.handle_handshake_packet(header.msg_type, payload.as_slice())
            }
            MessageType::Data => {
                if !self.replay.accept(header.pn) {
                    return Err(SessionError::Replay);
                }
                let recv_cipher = self
                    .recv_cipher
                    .as_ref()
                    .ok_or(SessionError::NotEstablished)?;
                let aad =
                    encode_header_aad(header.conn_id, header.pn, header.stream_id, header.msg_type);
                let plaintext =
                    recv_cipher.decrypt(header.pn, aad.as_slice(), payload.as_slice())?;
                Ok(HandleResult {
                    outbound: Vec::new(),
                    events: vec![SessionEvent::Data {
                        stream_id: header.stream_id,
                        payload: plaintext,
                    }],
                })
            }
            MessageType::Close => Ok(HandleResult {
                outbound: Vec::new(),
                events: vec![SessionEvent::Close {
                    stream_id: header.stream_id,
                }],
            }),
            _ => Err(SessionError::InvalidTransition {
                state: "unsupported message type",
            }),
        }
    }

    pub fn encrypt_data(
        &mut self,
        stream_id: u32,
        payload: &[u8],
    ) -> Result<Vec<u8>, SessionError> {
        let send_cipher = self
            .send_cipher
            .as_ref()
            .ok_or(SessionError::NotEstablished)?;
        let mut header =
            FrameHeader::new(self.conn_id, self.send_pn, stream_id, MessageType::Data, 0);
        let aad = encode_header_aad(header.conn_id, header.pn, header.stream_id, header.msg_type);
        let encrypted = send_cipher.encrypt(header.pn, aad.as_slice(), payload)?;
        if encrypted.len() > u16::MAX as usize {
            return Err(SessionError::PayloadTooLarge);
        }
        header.len = encrypted.len() as u16;
        self.send_pn = self.send_pn.saturating_add(1);
        encode_frame(header, encrypted.as_slice())
    }

    pub fn encode_close(&mut self, stream_id: u32) -> Result<Vec<u8>, SessionError> {
        let header = FrameHeader::new(self.conn_id, self.send_pn, stream_id, MessageType::Close, 0);
        self.send_pn = self.send_pn.saturating_add(1);
        encode_frame(header, &[])
    }

    fn handle_handshake_packet(
        &mut self,
        msg_type: MessageType,
        payload: &[u8],
    ) -> Result<HandleResult, SessionError> {
        if payload.len() > self.max_handshake_packet_size {
            return Err(SessionError::PreAuthRejected);
        }

        let mut outbound = Vec::new();
        let mut events = Vec::new();

        match (self.role, msg_type) {
            (NoiseRole::Responder, MessageType::HandshakeInit) => {
                let _ = self.handshake.read_message(payload)?;
                let message2 = self.handshake.write_message(b"handshake-resp")?;
                let frame = self.wrap_frame(
                    MessageType::HandshakeResp,
                    HANDSHAKE_STREAM_ID,
                    message2.as_slice(),
                )?;
                outbound.push(frame);
            }
            (NoiseRole::Initiator, MessageType::HandshakeResp) => {
                self.handshake.read_message(payload)?;
                if !self.handshake.is_complete() {
                    let message3 = self.handshake.write_message(b"handshake-done")?;
                    let frame = self.wrap_frame(
                        MessageType::HandshakeResp,
                        HANDSHAKE_STREAM_ID,
                        message3.as_slice(),
                    )?;
                    outbound.push(frame);
                }
            }
            (NoiseRole::Responder, MessageType::HandshakeResp) => {
                self.handshake.read_message(payload)?;
            }
            _ => {
                return Err(SessionError::InvalidTransition {
                    state: "handshake message/role mismatch",
                });
            }
        }

        if self.handshake.is_complete() && self.send_cipher.is_none() {
            let keys = self
                .handshake
                .transport_keys()
                .ok_or(SessionError::NotEstablished)?;
            self.send_cipher = Some(PacketCipher::new(keys.send_key_bytes()));
            self.recv_cipher = Some(PacketCipher::new(keys.recv_key_bytes()));
            events.push(SessionEvent::HandshakeComplete);
        }

        Ok(HandleResult { outbound, events })
    }

    fn wrap_frame(
        &mut self,
        msg_type: MessageType,
        stream_id: u32,
        payload: &[u8],
    ) -> Result<Vec<u8>, SessionError> {
        if payload.len() > u16::MAX as usize {
            return Err(SessionError::PayloadTooLarge);
        }
        let header = FrameHeader::new(
            self.conn_id,
            self.send_pn,
            stream_id,
            msg_type,
            payload.len() as u16,
        );
        self.send_pn = self.send_pn.saturating_add(1);
        encode_frame(header, payload)
    }
}

fn encode_frame(header: FrameHeader, payload: &[u8]) -> Result<Vec<u8>, SessionError> {
    if payload.len() != header.len as usize {
        return Err(SessionError::FrameLengthMismatch);
    }
    let mut out = BytesMut::with_capacity(FrameHeader::SIZE + payload.len());
    encode_header(&header, &mut out);
    out.extend_from_slice(payload);
    Ok(out.to_vec())
}

fn decode_frame(frame: &[u8]) -> Result<(FrameHeader, Vec<u8>), SessionError> {
    if frame.len() < FrameHeader::SIZE {
        return Err(SessionError::FrameLengthMismatch);
    }
    let header = decode_header(&frame[..FrameHeader::SIZE])?;
    let payload = frame[FrameHeader::SIZE..].to_vec();
    if payload.len() != header.len as usize {
        return Err(SessionError::FrameLengthMismatch);
    }
    Ok((header, payload))
}

fn encode_header_aad(conn_id: u64, pn: u64, stream_id: u32, msg_type: MessageType) -> Vec<u8> {
    let header = FrameHeader::new(conn_id, pn, stream_id, msg_type, 0);
    let mut out = BytesMut::with_capacity(FrameHeader::SIZE);
    encode_header(&header, &mut out);
    out.to_vec()
}

#[cfg(test)]
mod tests {
    use fabric_crypto::DeterministicPrimitives;

    use super::{SecureSession, SessionEvent};

    fn drive_handshake(
        initiator: &mut SecureSession<DeterministicPrimitives>,
        responder: &mut SecureSession<DeterministicPrimitives>,
    ) {
        let msg1 = initiator.start_handshake(b"hello").expect("msg1");
        let out_b = responder
            .handle_incoming(msg1.as_slice())
            .expect("b read msg1");
        assert_eq!(out_b.outbound.len(), 1);
        let out_a = initiator
            .handle_incoming(out_b.outbound[0].as_slice())
            .expect("a read msg2");
        assert_eq!(out_a.outbound.len(), 1);
        let out_b2 = responder
            .handle_incoming(out_a.outbound[0].as_slice())
            .expect("b read msg3");
        assert!(out_b2.outbound.is_empty());
        assert!(initiator.is_established());
        assert!(responder.is_established());
    }

    #[test]
    fn handshake_and_encrypted_data_roundtrip() {
        let mut initiator = SecureSession::new_initiator(
            42,
            b"animus/fabric/v1",
            DeterministicPrimitives::new([1; 32]),
        );
        let mut responder = SecureSession::new_responder(
            42,
            b"animus/fabric/v1",
            DeterministicPrimitives::new([2; 32]),
        );
        drive_handshake(&mut initiator, &mut responder);

        let packet = initiator
            .encrypt_data(7, b"ping-over-relay")
            .expect("encrypt data");
        let handled = responder
            .handle_incoming(packet.as_slice())
            .expect("decrypt data");
        assert_eq!(handled.outbound.len(), 0);
        assert_eq!(
            handled.events,
            vec![SessionEvent::Data {
                stream_id: 7,
                payload: b"ping-over-relay".to_vec()
            }]
        );
    }

    #[test]
    fn replay_protection_rejects_duplicate_packets() {
        let mut initiator = SecureSession::new_initiator(
            44,
            b"animus/fabric/v1",
            DeterministicPrimitives::new([3; 32]),
        );
        let mut responder = SecureSession::new_responder(
            44,
            b"animus/fabric/v1",
            DeterministicPrimitives::new([4; 32]),
        );
        drive_handshake(&mut initiator, &mut responder);

        let packet = initiator.encrypt_data(1, b"payload").expect("encrypt");
        let first = responder.handle_incoming(packet.as_slice());
        assert!(first.is_ok());
        let second = responder.handle_incoming(packet.as_slice());
        assert!(second.is_err());
    }
}
