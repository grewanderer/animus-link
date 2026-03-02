use thiserror::Error;
#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("not implemented")]
    NotImplemented,
}
