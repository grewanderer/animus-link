use thiserror::Error;
#[derive(Debug, Error)]
pub enum NatError {
    #[error("not implemented")]
    NotImplemented,
}
