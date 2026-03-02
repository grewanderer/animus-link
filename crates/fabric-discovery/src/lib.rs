pub mod errors;
pub mod record;

pub use record::{
    canonicalize_record, decode_hex, derive_public_key, encode_hex, sign_record,
    verify_record_signature, DiscoveryEndpoint, DiscoveryRecord, DISCOVERY_RECORD_VERSION,
};
