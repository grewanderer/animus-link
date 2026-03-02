use crate::types::MessageType;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FrameHeader {
    pub conn_id: u64,
    pub pn: u64,
    pub stream_id: u32,
    pub msg_type: MessageType,
    pub len: u16,
}

impl FrameHeader {
    pub const SIZE: usize = 8 + 8 + 4 + 1 + 2;

    pub fn new(conn_id: u64, pn: u64, stream_id: u32, msg_type: MessageType, len: u16) -> Self {
        Self {
            conn_id,
            pn,
            stream_id,
            msg_type,
            len,
        }
    }
}
