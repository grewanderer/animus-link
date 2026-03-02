use std::fmt;

use hkdf::Hkdf;
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroizing;

use crate::errors::CryptoError;

pub const HASH_LEN: usize = 32;
pub const KEY_LEN: usize = 32;
const EPHEMERAL_LEN: usize = 32;
const MSG1_TAG: u8 = 0x01;
const MSG2_TAG: u8 = 0x02;
const MSG3_TAG: u8 = 0x03;

#[derive(Clone)]
pub struct SecretKeyMaterial(Zeroizing<[u8; EPHEMERAL_LEN]>);

impl SecretKeyMaterial {
    pub fn new(bytes: [u8; EPHEMERAL_LEN]) -> Self {
        Self(Zeroizing::new(bytes))
    }

    pub fn as_bytes(&self) -> &[u8; EPHEMERAL_LEN] {
        &self.0
    }
}

impl fmt::Debug for SecretKeyMaterial {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[REDACTED]")
    }
}

#[derive(Clone)]
pub struct TransportKeyMaterial(Zeroizing<[u8; KEY_LEN]>);

impl TransportKeyMaterial {
    fn new(bytes: [u8; KEY_LEN]) -> Self {
        Self(Zeroizing::new(bytes))
    }

    pub fn as_bytes(&self) -> &[u8; KEY_LEN] {
        &self.0
    }
}

impl fmt::Debug for TransportKeyMaterial {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[REDACTED]")
    }
}

#[derive(Clone, Debug)]
pub struct NoiseTransportKeys {
    send_key: TransportKeyMaterial,
    recv_key: TransportKeyMaterial,
}

impl NoiseTransportKeys {
    fn new(send_key: [u8; KEY_LEN], recv_key: [u8; KEY_LEN]) -> Self {
        Self {
            send_key: TransportKeyMaterial::new(send_key),
            recv_key: TransportKeyMaterial::new(recv_key),
        }
    }

    pub fn send_key_bytes(&self) -> [u8; KEY_LEN] {
        *self.send_key.as_bytes()
    }

    pub fn recv_key_bytes(&self) -> [u8; KEY_LEN] {
        *self.recv_key.as_bytes()
    }
}

#[derive(Clone, Debug)]
pub struct NoiseEphemeralKeyPair {
    secret: SecretKeyMaterial,
    public: [u8; EPHEMERAL_LEN],
}

impl NoiseEphemeralKeyPair {
    pub fn new(secret: [u8; EPHEMERAL_LEN], public: [u8; EPHEMERAL_LEN]) -> Self {
        Self {
            secret: SecretKeyMaterial::new(secret),
            public,
        }
    }

    pub fn public(&self) -> [u8; EPHEMERAL_LEN] {
        self.public
    }

    pub fn secret(&self) -> &SecretKeyMaterial {
        &self.secret
    }
}

pub trait NoisePrimitives {
    fn generate_ephemeral_keypair(&mut self) -> Result<NoiseEphemeralKeyPair, CryptoError>;
}

#[derive(Debug, Clone, Copy)]
pub struct SystemPrimitives;

impl NoisePrimitives for SystemPrimitives {
    fn generate_ephemeral_keypair(&mut self) -> Result<NoiseEphemeralKeyPair, CryptoError> {
        let mut secret_bytes = [0u8; 32];
        OsRng.fill_bytes(&mut secret_bytes);
        let secret = StaticSecret::from(secret_bytes);
        let public = PublicKey::from(&secret).to_bytes();
        Ok(NoiseEphemeralKeyPair::new(secret.to_bytes(), public))
    }
}

#[derive(Debug, Clone)]
pub struct DeterministicPrimitives {
    seed: [u8; 32],
    counter: u64,
}

impl DeterministicPrimitives {
    pub fn new(seed: [u8; 32]) -> Self {
        Self { seed, counter: 0 }
    }
}

impl NoisePrimitives for DeterministicPrimitives {
    fn generate_ephemeral_keypair(&mut self) -> Result<NoiseEphemeralKeyPair, CryptoError> {
        let mut hasher = Sha256::new();
        hasher.update(self.seed);
        hasher.update(self.counter.to_le_bytes());
        let digest = hasher.finalize();
        self.counter = self.counter.saturating_add(1);

        let mut secret_bytes = [0u8; 32];
        secret_bytes.copy_from_slice(&digest[..32]);
        let secret = StaticSecret::from(secret_bytes);
        let public = PublicKey::from(&secret).to_bytes();
        Ok(NoiseEphemeralKeyPair::new(secret.to_bytes(), public))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoiseRole {
    Initiator,
    Responder,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoiseHandshakeState {
    InitiatorWriteMessage1,
    InitiatorReadMessage2,
    InitiatorWriteMessage3,
    ResponderReadMessage1,
    ResponderWriteMessage2,
    ResponderReadMessage3,
    Complete,
}

#[derive(Debug)]
pub struct NoiseXXHandshake<P: NoisePrimitives> {
    primitives: P,
    role: NoiseRole,
    state: NoiseHandshakeState,
    prologue_hash: [u8; HASH_LEN],
    local_ephemeral: Option<NoiseEphemeralKeyPair>,
    last_local_ephemeral_public: Option<[u8; EPHEMERAL_LEN]>,
    remote_ephemeral_public: Option<[u8; EPHEMERAL_LEN]>,
    transport_keys: Option<NoiseTransportKeys>,
}

impl<P: NoisePrimitives> NoiseXXHandshake<P> {
    pub fn new(role: NoiseRole, prologue: &[u8], primitives: P) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(prologue);
        let mut prologue_hash = [0u8; HASH_LEN];
        prologue_hash.copy_from_slice(&hasher.finalize()[..32]);

        Self {
            primitives,
            role,
            state: initial_state_for_role(role),
            prologue_hash,
            local_ephemeral: None,
            last_local_ephemeral_public: None,
            remote_ephemeral_public: None,
            transport_keys: None,
        }
    }

    pub fn state(&self) -> NoiseHandshakeState {
        self.state
    }

    pub fn is_complete(&self) -> bool {
        self.state == NoiseHandshakeState::Complete
    }

    pub fn has_local_ephemeral(&self) -> bool {
        self.local_ephemeral.is_some()
    }

    pub fn remote_ephemeral_public(&self) -> Option<[u8; EPHEMERAL_LEN]> {
        self.remote_ephemeral_public
    }

    pub fn prologue_hash(&self) -> [u8; HASH_LEN] {
        self.prologue_hash
    }

    pub fn transport_keys(&self) -> Option<&NoiseTransportKeys> {
        self.transport_keys.as_ref()
    }

    pub fn restart(&mut self) {
        self.state = initial_state_for_role(self.role);
        self.local_ephemeral = None;
        self.remote_ephemeral_public = None;
        self.transport_keys = None;
    }

    pub fn write_message(&mut self, payload: &[u8]) -> Result<Vec<u8>, CryptoError> {
        match self.state {
            NoiseHandshakeState::InitiatorWriteMessage1 => {
                let public = self.generate_fresh_ephemeral()?;
                let message = encode_message(MSG1_TAG, self.prologue_hash, Some(public), payload)?;
                self.state = NoiseHandshakeState::InitiatorReadMessage2;
                Ok(message)
            }
            NoiseHandshakeState::ResponderWriteMessage2 => {
                let public = self.generate_fresh_ephemeral()?;
                let message = encode_message(MSG2_TAG, self.prologue_hash, Some(public), payload)?;
                self.state = NoiseHandshakeState::ResponderReadMessage3;
                Ok(message)
            }
            NoiseHandshakeState::InitiatorWriteMessage3 => {
                let message = encode_message(MSG3_TAG, self.prologue_hash, None, payload)?;
                self.finalize_transport_keys()?;
                self.local_ephemeral = None;
                self.state = NoiseHandshakeState::Complete;
                Ok(message)
            }
            _ => Err(CryptoError::InvalidState),
        }
    }

    pub fn read_message(&mut self, message: &[u8]) -> Result<Vec<u8>, CryptoError> {
        match self.state {
            NoiseHandshakeState::ResponderReadMessage1 => {
                let decoded = decode_message(message, MSG1_TAG, self.prologue_hash, true)?;
                self.remote_ephemeral_public = decoded.ephemeral_public;
                self.state = NoiseHandshakeState::ResponderWriteMessage2;
                Ok(decoded.payload)
            }
            NoiseHandshakeState::InitiatorReadMessage2 => {
                let decoded = decode_message(message, MSG2_TAG, self.prologue_hash, true)?;
                self.remote_ephemeral_public = decoded.ephemeral_public;
                self.state = NoiseHandshakeState::InitiatorWriteMessage3;
                Ok(decoded.payload)
            }
            NoiseHandshakeState::ResponderReadMessage3 => {
                let decoded = decode_message(message, MSG3_TAG, self.prologue_hash, false)?;
                self.finalize_transport_keys()?;
                self.local_ephemeral = None;
                self.state = NoiseHandshakeState::Complete;
                Ok(decoded.payload)
            }
            _ => Err(CryptoError::InvalidState),
        }
    }

    fn generate_fresh_ephemeral(&mut self) -> Result<[u8; EPHEMERAL_LEN], CryptoError> {
        let pair = self.primitives.generate_ephemeral_keypair()?;
        let public = pair.public();
        if self
            .last_local_ephemeral_public
            .is_some_and(|previous| previous == public)
        {
            return Err(CryptoError::EphemeralReuse);
        }
        self.last_local_ephemeral_public = Some(public);
        self.local_ephemeral = Some(pair);
        Ok(public)
    }

    fn finalize_transport_keys(&mut self) -> Result<(), CryptoError> {
        if self.transport_keys.is_some() {
            return Ok(());
        }

        let local_pair = self
            .local_ephemeral
            .as_ref()
            .ok_or(CryptoError::InvalidState)?;
        let remote_public = self
            .remote_ephemeral_public
            .ok_or(CryptoError::InvalidState)?;
        let remote_public = PublicKey::from(remote_public);
        let local_secret = StaticSecret::from(*local_pair.secret().as_bytes());
        let shared_secret = local_secret.diffie_hellman(&remote_public).to_bytes();

        let local_public = local_pair.public();
        let (initiator_ephemeral, responder_ephemeral) = match self.role {
            NoiseRole::Initiator => (local_public, remote_public.to_bytes()),
            NoiseRole::Responder => (remote_public.to_bytes(), local_public),
        };

        let mut ikm = Vec::with_capacity(96);
        ikm.extend_from_slice(&shared_secret);
        ikm.extend_from_slice(&initiator_ephemeral);
        ikm.extend_from_slice(&responder_ephemeral);

        let hk = Hkdf::<Sha256>::new(Some(&self.prologue_hash), &ikm);
        let mut i2r = [0u8; 32];
        let mut r2i = [0u8; 32];
        hk.expand(b"animus-noise-xx-i2r", &mut i2r)
            .map_err(|_| CryptoError::KeyDerivation)?;
        hk.expand(b"animus-noise-xx-r2i", &mut r2i)
            .map_err(|_| CryptoError::KeyDerivation)?;

        let keys = match self.role {
            NoiseRole::Initiator => NoiseTransportKeys::new(i2r, r2i),
            NoiseRole::Responder => NoiseTransportKeys::new(r2i, i2r),
        };
        self.transport_keys = Some(keys);
        Ok(())
    }
}

fn initial_state_for_role(role: NoiseRole) -> NoiseHandshakeState {
    match role {
        NoiseRole::Initiator => NoiseHandshakeState::InitiatorWriteMessage1,
        NoiseRole::Responder => NoiseHandshakeState::ResponderReadMessage1,
    }
}

struct DecodedMessage {
    ephemeral_public: Option<[u8; EPHEMERAL_LEN]>,
    payload: Vec<u8>,
}

fn encode_message(
    tag: u8,
    prologue_hash: [u8; HASH_LEN],
    ephemeral_public: Option<[u8; EPHEMERAL_LEN]>,
    payload: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    if payload.len() > u16::MAX as usize {
        return Err(CryptoError::InvalidMessage);
    }

    let mut out = Vec::with_capacity(
        1 + HASH_LEN + usize::from(ephemeral_public.is_some()) * EPHEMERAL_LEN + 2 + payload.len(),
    );
    out.push(tag);
    out.extend_from_slice(&prologue_hash);
    if let Some(ephemeral_public) = ephemeral_public {
        out.extend_from_slice(&ephemeral_public);
    }
    out.extend_from_slice(&(payload.len() as u16).to_le_bytes());
    out.extend_from_slice(payload);
    Ok(out)
}

fn decode_message(
    message: &[u8],
    expected_tag: u8,
    expected_prologue_hash: [u8; HASH_LEN],
    expect_ephemeral: bool,
) -> Result<DecodedMessage, CryptoError> {
    let minimum_len = 1 + HASH_LEN + usize::from(expect_ephemeral) * EPHEMERAL_LEN + 2;
    if message.len() < minimum_len {
        return Err(CryptoError::InvalidMessage);
    }

    if message[0] != expected_tag {
        return Err(CryptoError::InvalidMessage);
    }

    let mut cursor = 1;
    if message[cursor..cursor + HASH_LEN] != expected_prologue_hash {
        return Err(CryptoError::PrologueMismatch);
    }
    cursor += HASH_LEN;

    let ephemeral_public = if expect_ephemeral {
        let mut key = [0u8; EPHEMERAL_LEN];
        key.copy_from_slice(&message[cursor..cursor + EPHEMERAL_LEN]);
        cursor += EPHEMERAL_LEN;
        Some(key)
    } else {
        None
    };

    let payload_len = u16::from_le_bytes([message[cursor], message[cursor + 1]]) as usize;
    cursor += 2;
    if cursor + payload_len != message.len() {
        return Err(CryptoError::InvalidMessage);
    }

    Ok(DecodedMessage {
        ephemeral_public,
        payload: message[cursor..].to_vec(),
    })
}

#[cfg(test)]
mod tests {
    use crate::errors::CryptoError;

    use super::{
        DeterministicPrimitives, NoiseHandshakeState, NoisePrimitives, NoiseRole, NoiseXXHandshake,
    };

    #[test]
    fn handshake_roundtrip_is_deterministic_and_completes() {
        let prologue = b"animus/fabric/v1";
        let mut initiator = NoiseXXHandshake::new(
            NoiseRole::Initiator,
            prologue,
            DeterministicPrimitives::new([7; 32]),
        );
        let mut responder = NoiseXXHandshake::new(
            NoiseRole::Responder,
            prologue,
            DeterministicPrimitives::new([9; 32]),
        );

        let msg1 = initiator.write_message(b"hello").expect("msg1");
        let payload1 = responder.read_message(msg1.as_slice()).expect("read1");
        assert_eq!(payload1, b"hello");

        let msg2 = responder.write_message(b"world").expect("msg2");
        let payload2 = initiator.read_message(msg2.as_slice()).expect("read2");
        assert_eq!(payload2, b"world");

        let msg3 = initiator.write_message(b"done").expect("msg3");
        let payload3 = responder.read_message(msg3.as_slice()).expect("read3");
        assert_eq!(payload3, b"done");

        assert!(initiator.is_complete());
        assert!(responder.is_complete());
        assert_eq!(initiator.state(), NoiseHandshakeState::Complete);
        assert_eq!(responder.state(), NoiseHandshakeState::Complete);
    }

    #[test]
    fn key_agreement_matches_between_roles() {
        let prologue = b"animus/fabric/v1";
        let mut initiator = NoiseXXHandshake::new(
            NoiseRole::Initiator,
            prologue,
            DeterministicPrimitives::new([1; 32]),
        );
        let mut responder = NoiseXXHandshake::new(
            NoiseRole::Responder,
            prologue,
            DeterministicPrimitives::new([2; 32]),
        );

        let msg1 = initiator.write_message(b"a").expect("msg1");
        let _ = responder.read_message(msg1.as_slice()).expect("r msg1");
        let msg2 = responder.write_message(b"b").expect("msg2");
        let _ = initiator.read_message(msg2.as_slice()).expect("i msg2");
        let msg3 = initiator.write_message(b"c").expect("msg3");
        let _ = responder.read_message(msg3.as_slice()).expect("r msg3");

        let i_keys = initiator.transport_keys().expect("initiator keys");
        let r_keys = responder.transport_keys().expect("responder keys");
        assert_eq!(i_keys.send_key_bytes(), r_keys.recv_key_bytes());
        assert_eq!(i_keys.recv_key_bytes(), r_keys.send_key_bytes());
    }

    #[test]
    fn prologue_binding_is_enforced() {
        let mut initiator = NoiseXXHandshake::new(
            NoiseRole::Initiator,
            b"prologue-a",
            DeterministicPrimitives::new([1; 32]),
        );
        let mut responder = NoiseXXHandshake::new(
            NoiseRole::Responder,
            b"prologue-b",
            DeterministicPrimitives::new([2; 32]),
        );

        let msg1 = initiator.write_message(b"x").expect("msg1");
        let err = responder
            .read_message(msg1.as_slice())
            .expect_err("must fail");
        assert_eq!(err, CryptoError::PrologueMismatch);
    }

    #[test]
    fn detects_ephemeral_reuse_across_restarts() {
        #[derive(Clone)]
        struct ReusedEphemeral;

        impl NoisePrimitives for ReusedEphemeral {
            fn generate_ephemeral_keypair(
                &mut self,
            ) -> Result<super::NoiseEphemeralKeyPair, CryptoError> {
                Ok(super::NoiseEphemeralKeyPair::new([5; 32], [9; 32]))
            }
        }

        let mut initiator =
            NoiseXXHandshake::new(NoiseRole::Initiator, b"prologue", ReusedEphemeral);
        let _ = initiator.write_message(b"first").expect("first write");
        initiator.restart();
        let err = initiator
            .write_message(b"second")
            .expect_err("must detect ephemeral reuse");
        assert_eq!(err, CryptoError::EphemeralReuse);
    }
}
