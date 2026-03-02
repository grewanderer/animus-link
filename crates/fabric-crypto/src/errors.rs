use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CryptoError {
    #[error("invalid handshake state transition")]
    InvalidState,
    #[error("invalid handshake message")]
    InvalidMessage,
    #[error("prologue mismatch")]
    PrologueMismatch,
    #[error("ephemeral key reuse detected")]
    EphemeralReuse,
    #[error("key derivation failed")]
    KeyDerivation,
    #[error("aead operation failed")]
    AeadFailure,
    #[error("signature verification failed")]
    SignatureVerification,
    #[error("crypto backend error: {0}")]
    Backend(String),
    #[error("not implemented")]
    NotImplemented,
}
