use bytes::{Buf, BufMut, BytesMut};

use crate::{errors::WireError, frame::FrameHeader, types::MessageType};

pub fn encode_header(h: &FrameHeader, out: &mut BytesMut) {
    out.put_u64_le(h.conn_id);
    out.put_u64_le(h.pn);
    out.put_u32_le(h.stream_id);
    out.put_u8(h.msg_type as u8);
    out.put_u16_le(h.len);
}

pub fn decode_header(mut inp: &[u8]) -> Result<FrameHeader, WireError> {
    if inp.len() < FrameHeader::SIZE {
        return Err(WireError::Truncated);
    }
    let conn_id = inp.get_u64_le();
    let pn = inp.get_u64_le();
    let stream_id = inp.get_u32_le();
    let t = inp.get_u8();
    let len = inp.get_u16_le();
    let msg_type = MessageType::try_from(t).map_err(|_| WireError::UnknownType(t))?;
    Ok(FrameHeader {
        conn_id,
        pn,
        stream_id,
        msg_type,
        len,
    })
}
