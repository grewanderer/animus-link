use thiserror::Error;

#[derive(Debug, Error)]
pub enum WireError {
    #[error("truncated input")]
    Truncated,
    #[error("unknown message type {0:#x}")]
    UnknownType(u8),
}
