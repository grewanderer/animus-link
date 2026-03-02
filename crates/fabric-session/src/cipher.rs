use fabric_crypto::AeadCipher;

use crate::errors::SessionError;

#[derive(Debug, Clone)]
pub struct PacketCipher {
    inner: AeadCipher,
}

impl PacketCipher {
    pub fn new(key: [u8; 32]) -> Self {
        Self {
            inner: AeadCipher::new(key),
        }
    }

    pub fn encrypt(&self, pn: u64, aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, SessionError> {
        self.inner
            .encrypt(pn, aad, plaintext)
            .map_err(SessionError::from)
    }

    pub fn decrypt(&self, pn: u64, aad: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, SessionError> {
        self.inner
            .decrypt(pn, aad, ciphertext)
            .map_err(|_| SessionError::DecryptFailed)
    }
}

#[cfg(test)]
mod tests {
    use super::PacketCipher;

    #[test]
    fn roundtrip_encrypt_decrypt() {
        let cipher = PacketCipher::new([7; 32]);
        let aad = b"header";
        let plaintext = b"hello over relay";
        let ciphertext = cipher.encrypt(42, aad, plaintext).expect("encrypt");
        let decrypted = cipher
            .decrypt(42, aad, ciphertext.as_slice())
            .expect("decrypt");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn decrypt_rejects_modified_ciphertext() {
        let cipher = PacketCipher::new([9; 32]);
        let mut ciphertext = cipher.encrypt(7, b"aad", b"payload").expect("encrypt");
        ciphertext[0] ^= 0x55;
        let err = cipher.decrypt(7, b"aad", ciphertext.as_slice());
        assert!(err.is_err());
    }
}
