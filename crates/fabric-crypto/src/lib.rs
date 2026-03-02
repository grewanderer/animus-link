pub mod aead;
pub mod errors;
pub mod noise_xx;
pub mod signatures;

use sha2::{Digest, Sha256};

pub use aead::AeadCipher;
pub use signatures::{verify_signature, Ed25519Keypair};

pub use noise_xx::{
    DeterministicPrimitives, NoiseEphemeralKeyPair, NoiseHandshakeState, NoisePrimitives,
    NoiseRole, NoiseTransportKeys, NoiseXXHandshake, SecretKeyMaterial, TransportKeyMaterial,
};

pub fn simple_hash32(input: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(input);
    let digest = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest[..32]);
    out
}
