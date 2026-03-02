use thiserror::Error;

#[derive(Debug, Error)]
pub enum TransportError {
    #[error("not implemented")]
    NotImplemented,
}
