use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};

use crate::errors::CryptoError;

#[derive(Debug, Clone)]
pub struct Ed25519Keypair {
    signing_key: SigningKey,
}

impl Ed25519Keypair {
    pub fn from_seed(seed: [u8; 32]) -> Self {
        Self {
            signing_key: SigningKey::from_bytes(&seed),
        }
    }

    pub fn verifying_key(&self) -> VerifyingKey {
        self.signing_key.verifying_key()
    }

    pub fn sign(&self, message: &[u8]) -> [u8; 64] {
        self.signing_key.sign(message).to_bytes()
    }
}

pub fn verify_signature(
    public_key: &VerifyingKey,
    message: &[u8],
    signature_bytes: &[u8; 64],
) -> Result<(), CryptoError> {
    let signature = Signature::from_bytes(signature_bytes);
    public_key
        .verify(message, &signature)
        .map_err(|_| CryptoError::SignatureVerification)
}

#[cfg(test)]
mod tests {
    use super::{verify_signature, Ed25519Keypair};

    #[test]
    fn sign_and_verify_roundtrip() {
        let keypair = Ed25519Keypair::from_seed([1; 32]);
        let public_key = keypair.verifying_key();
        let sig = keypair.sign(b"animus");
        verify_signature(&public_key, b"animus", &sig).expect("signature verify");
    }

    #[test]
    fn verify_rejects_modified_message() {
        let keypair = Ed25519Keypair::from_seed([2; 32]);
        let public_key = keypair.verifying_key();
        let sig = keypair.sign(b"animus");
        let result = verify_signature(&public_key, b"animus-modified", &sig);
        assert!(result.is_err());
    }
}
