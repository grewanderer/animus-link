use std::collections::HashMap;

use tokio::sync::mpsc;

use crate::errors::SessionError;

const OPEN_TAG: u8 = 0x01;
const DATA_TAG: u8 = 0x02;
const CLOSE_TAG: u8 = 0x03;

pub const DEFAULT_STREAM_QUEUE: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MuxFrame {
    Open { service: String },
    Data { bytes: Vec<u8> },
    Close,
}

pub fn encode_mux_frame(frame: &MuxFrame) -> Result<Vec<u8>, SessionError> {
    match frame {
        MuxFrame::Open { service } => {
            if service.len() > u16::MAX as usize {
                return Err(SessionError::InvalidMuxPayload);
            }
            let mut out = Vec::with_capacity(1 + 2 + service.len());
            out.push(OPEN_TAG);
            out.extend_from_slice(&(service.len() as u16).to_le_bytes());
            out.extend_from_slice(service.as_bytes());
            Ok(out)
        }
        MuxFrame::Data { bytes } => {
            let mut out = Vec::with_capacity(1 + bytes.len());
            out.push(DATA_TAG);
            out.extend_from_slice(bytes);
            Ok(out)
        }
        MuxFrame::Close => Ok(vec![CLOSE_TAG]),
    }
}

pub fn decode_mux_frame(input: &[u8]) -> Result<MuxFrame, SessionError> {
    if input.is_empty() {
        return Err(SessionError::InvalidMuxPayload);
    }
    match input[0] {
        OPEN_TAG => {
            if input.len() < 3 {
                return Err(SessionError::InvalidMuxPayload);
            }
            let service_len = u16::from_le_bytes([input[1], input[2]]) as usize;
            if input.len() != 3 + service_len {
                return Err(SessionError::InvalidMuxPayload);
            }
            let service = std::str::from_utf8(&input[3..])
                .map_err(|_| SessionError::InvalidMuxPayload)?
                .to_string();
            if service.is_empty() {
                return Err(SessionError::InvalidMuxPayload);
            }
            Ok(MuxFrame::Open { service })
        }
        DATA_TAG => Ok(MuxFrame::Data {
            bytes: input[1..].to_vec(),
        }),
        CLOSE_TAG if input.len() == 1 => Ok(MuxFrame::Close),
        _ => Err(SessionError::InvalidMuxPayload),
    }
}

#[derive(Debug)]
struct StreamState {
    tx: mpsc::Sender<MuxFrame>,
}

#[derive(Debug)]
pub struct StreamMultiplexer {
    streams: HashMap<u32, StreamState>,
    max_streams: usize,
    queue_capacity: usize,
}

impl StreamMultiplexer {
    pub fn new(max_streams: usize, queue_capacity: usize) -> Self {
        Self {
            streams: HashMap::new(),
            max_streams,
            queue_capacity,
        }
    }

    pub fn open_stream(
        &mut self,
        stream_id: u32,
    ) -> Result<mpsc::Receiver<MuxFrame>, SessionError> {
        if self.streams.contains_key(&stream_id) {
            return Err(SessionError::InvalidMuxPayload);
        }
        if self.streams.len() >= self.max_streams {
            return Err(SessionError::InvalidMuxPayload);
        }
        let (tx, rx) = mpsc::channel(self.queue_capacity.max(1));
        self.streams.insert(stream_id, StreamState { tx });
        Ok(rx)
    }

    pub async fn push(&mut self, stream_id: u32, frame: MuxFrame) -> Result<(), SessionError> {
        let state = self
            .streams
            .get_mut(&stream_id)
            .ok_or(SessionError::InvalidMuxPayload)?;
        state
            .tx
            .send(frame.clone())
            .await
            .map_err(|_| SessionError::InvalidMuxPayload)?;
        if matches!(frame, MuxFrame::Close) {
            self.streams.remove(&stream_id);
        }
        Ok(())
    }

    pub fn close_stream(&mut self, stream_id: u32) {
        self.streams.remove(&stream_id);
    }

    pub fn stream_count(&self) -> usize {
        self.streams.len()
    }
}

impl Default for StreamMultiplexer {
    fn default() -> Self {
        Self::new(256, DEFAULT_STREAM_QUEUE)
    }
}

#[cfg(test)]
mod tests {
    use super::{decode_mux_frame, encode_mux_frame, MuxFrame, StreamMultiplexer};

    #[test]
    fn mux_frame_open_roundtrip() {
        let frame = MuxFrame::Open {
            service: "echo".to_string(),
        };
        let encoded = encode_mux_frame(&frame).expect("encode");
        let decoded = decode_mux_frame(encoded.as_slice()).expect("decode");
        assert_eq!(decoded, frame);
    }

    #[test]
    fn mux_frame_data_roundtrip() {
        let frame = MuxFrame::Data {
            bytes: vec![0, 1, 2, 0xff],
        };
        let encoded = encode_mux_frame(&frame).expect("encode");
        let decoded = decode_mux_frame(encoded.as_slice()).expect("decode");
        assert_eq!(decoded, frame);
    }

    #[tokio::test]
    async fn multiplexer_is_bounded() {
        let mut mux = StreamMultiplexer::new(1, 1);
        let _rx = mux.open_stream(7).expect("open stream");
        assert_eq!(mux.stream_count(), 1);
        assert!(mux.open_stream(8).is_err());
    }
}
