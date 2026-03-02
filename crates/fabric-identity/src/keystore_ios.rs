use crate::{
    errors::IdentityError,
    keystore::{InMemoryKeyStore, KeyStore},
};

#[derive(Debug)]
pub struct IosKeyStore {
    inner: InMemoryKeyStore,
}

impl IosKeyStore {
    pub fn new() -> Self {
        Self {
            inner: InMemoryKeyStore::new("ios-keychain-stub"),
        }
    }
}

impl Default for IosKeyStore {
    fn default() -> Self {
        Self::new()
    }
}

impl KeyStore for IosKeyStore {
    fn backend_name(&self) -> &'static str {
        self.inner.backend_name()
    }

    fn store_secret(&mut self, key_id: &str, secret: &[u8]) -> Result<(), IdentityError> {
        self.inner.store_secret(key_id, secret)
    }

    fn load_secret(&self, key_id: &str) -> Result<Option<Vec<u8>>, IdentityError> {
        self.inner.load_secret(key_id)
    }

    fn delete_secret(&mut self, key_id: &str) -> Result<(), IdentityError> {
        self.inner.delete_secret(key_id)
    }
}
