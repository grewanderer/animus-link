use thiserror::Error;

#[derive(Debug, Error)]
pub enum SessionError {
    #[error("replay detected")]
    Replay,
    #[error("packet rejected by pre-auth limits")]
    PreAuthRejected,
    #[error("frame connection id mismatch")]
    ConnIdMismatch,
    #[error("frame payload length mismatch")]
    FrameLengthMismatch,
    #[error("ciphertext authentication failed")]
    DecryptFailed,
    #[error("session is not established")]
    NotEstablished,
    #[error("payload too large for frame")]
    PayloadTooLarge,
    #[error("invalid multiplexed payload")]
    InvalidMuxPayload,
    #[error("relay channel error: {0}")]
    Relay(String),
    #[error("invalid transition from {state}")]
    InvalidTransition { state: &'static str },
    #[error("wire error: {0}")]
    Wire(#[from] fabric_wire::errors::WireError),
    #[error("crypto error: {0}")]
    Crypto(#[from] fabric_crypto::errors::CryptoError),
}
