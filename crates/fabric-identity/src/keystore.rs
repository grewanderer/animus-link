use std::collections::HashMap;

use crate::errors::IdentityError;

pub trait KeyStore: Send + Sync {
    fn backend_name(&self) -> &'static str;
    fn store_secret(&mut self, key_id: &str, secret: &[u8]) -> Result<(), IdentityError>;
    fn load_secret(&self, key_id: &str) -> Result<Option<Vec<u8>>, IdentityError>;
    fn delete_secret(&mut self, key_id: &str) -> Result<(), IdentityError>;
}

#[derive(Debug, Default)]
pub struct InMemoryKeyStore {
    backend_name: &'static str,
    secrets: HashMap<String, Vec<u8>>,
}

impl InMemoryKeyStore {
    pub fn new(backend_name: &'static str) -> Self {
        Self {
            backend_name,
            secrets: HashMap::new(),
        }
    }
}

impl KeyStore for InMemoryKeyStore {
    fn backend_name(&self) -> &'static str {
        self.backend_name
    }

    fn store_secret(&mut self, key_id: &str, secret: &[u8]) -> Result<(), IdentityError> {
        if key_id.is_empty() {
            return Err(IdentityError::InvalidKeyId);
        }
        self.secrets.insert(key_id.to_owned(), secret.to_vec());
        Ok(())
    }

    fn load_secret(&self, key_id: &str) -> Result<Option<Vec<u8>>, IdentityError> {
        if key_id.is_empty() {
            return Err(IdentityError::InvalidKeyId);
        }
        Ok(self.secrets.get(key_id).cloned())
    }

    fn delete_secret(&mut self, key_id: &str) -> Result<(), IdentityError> {
        if key_id.is_empty() {
            return Err(IdentityError::InvalidKeyId);
        }
        self.secrets.remove(key_id);
        Ok(())
    }
}

pub fn default_keystore() -> Box<dyn KeyStore> {
    #[cfg(target_os = "macos")]
    {
        return Box::new(crate::keystore_macos::MacOsKeyStore::new());
    }

    #[cfg(target_os = "windows")]
    {
        return Box::new(crate::keystore_windows::WindowsKeyStore::new());
    }

    #[cfg(target_os = "linux")]
    {
        return Box::new(crate::keystore_linux::LinuxKeyStore::new());
    }

    #[cfg(target_os = "android")]
    {
        return Box::new(crate::keystore_android::AndroidKeyStore::new());
    }

    #[cfg(target_os = "ios")]
    {
        return Box::new(crate::keystore_ios::IosKeyStore::new());
    }

    #[allow(unreachable_code)]
    Box::new(InMemoryKeyStore::new("unsupported-platform-keystore-stub"))
}

#[cfg(test)]
mod tests {
    use super::default_keystore;

    #[test]
    fn keystore_roundtrip_secret() {
        let mut keystore = default_keystore();
        keystore.store_secret("device-key", b"secret").unwrap();
        let loaded = keystore.load_secret("device-key").unwrap();
        assert_eq!(loaded.as_deref(), Some(&b"secret"[..]));
        keystore.delete_secret("device-key").unwrap();
        assert!(keystore.load_secret("device-key").unwrap().is_none());
    }

    #[test]
    fn empty_key_id_rejected() {
        let mut keystore = default_keystore();
        assert!(keystore.store_secret("", b"x").is_err());
    }
}
