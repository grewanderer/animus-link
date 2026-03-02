use thiserror::Error;

use fabric_relay_proto::errors::RelayProtoError;

#[derive(Debug, Error)]
pub enum RelayClientError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("relay protocol: {0}")]
    Protocol(#[from] RelayProtoError),
}
