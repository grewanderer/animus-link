use thiserror::Error;

#[derive(Debug, Error)]
pub enum RelayProtoError {
    #[error("relay packet is truncated")]
    Truncated,
    #[error("unknown relay packet kind {0:#x}")]
    UnknownPacketKind(u8),
    #[error("unsupported relay packet version {0}")]
    UnsupportedPacketVersion(u8),
    #[error("invalid relay control UTF-8 payload")]
    InvalidUtf8(#[from] std::str::Utf8Error),
    #[error("invalid relay control JSON payload")]
    InvalidJson(#[from] serde_json::Error),
    #[error("unsupported relay control schema version {0}")]
    UnsupportedCtrlVersion(u16),
}
