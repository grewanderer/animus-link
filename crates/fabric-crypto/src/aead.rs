use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    ChaCha20Poly1305,
};

use crate::errors::CryptoError;

#[derive(Debug, Clone)]
pub struct AeadCipher {
    key: [u8; 32],
}

impl AeadCipher {
    pub fn new(key: [u8; 32]) -> Self {
        Self { key }
    }

    pub fn encrypt(&self, pn: u64, aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let cipher = ChaCha20Poly1305::new((&self.key).into());
        let nonce = nonce_from_pn(pn);
        cipher
            .encrypt(
                (&nonce).into(),
                Payload {
                    msg: plaintext,
                    aad,
                },
            )
            .map_err(|_| CryptoError::AeadFailure)
    }

    pub fn decrypt(&self, pn: u64, aad: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let cipher = ChaCha20Poly1305::new((&self.key).into());
        let nonce = nonce_from_pn(pn);
        cipher
            .decrypt(
                (&nonce).into(),
                Payload {
                    msg: ciphertext,
                    aad,
                },
            )
            .map_err(|_| CryptoError::AeadFailure)
    }
}

fn nonce_from_pn(pn: u64) -> [u8; 12] {
    let mut nonce = [0u8; 12];
    nonce[4..].copy_from_slice(&pn.to_le_bytes());
    nonce
}

#[cfg(test)]
mod tests {
    use super::AeadCipher;

    #[test]
    fn ciphertext_tamper_is_rejected() {
        let cipher = AeadCipher::new([7; 32]);
        let mut ciphertext = cipher
            .encrypt(11, b"aad", b"hello-transport")
            .expect("encrypt");
        ciphertext[0] ^= 0x80;
        let result = cipher.decrypt(11, b"aad", ciphertext.as_slice());
        assert!(result.is_err());
    }
}
