#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum MessageType {
    HandshakeInit = 0x01,
    HandshakeResp = 0x02,
    Data = 0x10,
    KeepAlive = 0x11,
    Close = 0x12,
    RelayCtrl = 0x20,
    RelayData = 0x21,
}

impl TryFrom<u8> for MessageType {
    type Error = ();
    fn try_from(v: u8) -> Result<Self, Self::Error> {
        Ok(match v {
            0x01 => Self::HandshakeInit,
            0x02 => Self::HandshakeResp,
            0x10 => Self::Data,
            0x11 => Self::KeepAlive,
            0x12 => Self::Close,
            0x20 => Self::RelayCtrl,
            0x21 => Self::RelayData,
            _ => return Err(()),
        })
    }
}
