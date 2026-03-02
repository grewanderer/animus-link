use thiserror::Error;

#[derive(Debug, Error)]
pub enum IdentityError {
    #[error("invalid key id")]
    InvalidKeyId,
    #[error("keystore operation failed: {0}")]
    KeyStore(String),
    #[error("not implemented")]
    NotImplemented,
}
