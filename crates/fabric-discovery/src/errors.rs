use thiserror::Error;
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum DiscoveryError {
    #[error("record version unsupported")]
    UnsupportedVersion,
    #[error("record field is invalid: {0}")]
    InvalidField(&'static str),
    #[error("record encoding is invalid")]
    InvalidEncoding,
    #[error("signature verification failed")]
    InvalidSignature,
    #[error("public key is invalid")]
    InvalidPublicKey,
}
