use bytes::BytesMut;
use fabric_wire::{
    codec::{decode_header, encode_header},
    FrameHeader, MessageType,
};

#[test]
fn roundtrip_header() {
    let h = FrameHeader::new(1, 2, 3, MessageType::Data, 10);
    let mut buf = BytesMut::new();
    encode_header(&h, &mut buf);
    let d = decode_header(&buf).unwrap();
    assert_eq!(h.conn_id, d.conn_id);
    assert_eq!(h.pn, d.pn);
    assert_eq!(h.stream_id, d.stream_id);
    assert_eq!(h.len, d.len);
}
