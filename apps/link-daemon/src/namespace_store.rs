use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::{
    errors::{ApiError, ApiErrorCode},
    invite::Invite,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NamespaceStoreFile {
    version: u16,
    namespaces: Vec<NamespaceRecord>,
}

impl Default for NamespaceStoreFile {
    fn default() -> Self {
        Self {
            version: 1,
            namespaces: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NamespaceRecord {
    namespace_id: String,
    invite_secret: Option<String>,
    invite_exp_unix_secs: Option<u64>,
    joined_at_unix_secs: u64,
}

pub struct NamespaceStore {
    path: PathBuf,
    data: NamespaceStoreFile,
}

impl NamespaceStore {
    pub fn load_or_create(path: impl Into<PathBuf>) -> Result<Self, ApiError> {
        let path = path.into();
        ensure_parent_dir(&path)?;

        let data = if path.exists() {
            let mut file = File::open(&path)
                .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to open state file"))?;
            let mut text = String::new();
            file.read_to_string(&mut text)
                .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to read state file"))?;
            if text.trim().is_empty() {
                NamespaceStoreFile::default()
            } else {
                serde_json::from_str(&text).map_err(|_| {
                    ApiError::new(ApiErrorCode::Internal, "failed to parse state file")
                })?
            }
        } else {
            NamespaceStoreFile::default()
        };

        let mut store = Self { path, data };
        store.persist()?;
        Ok(store)
    }

    pub fn upsert_from_invite(
        &mut self,
        invite: &Invite,
        now_unix_secs: u64,
    ) -> Result<(), ApiError> {
        self.purge_expired(now_unix_secs);
        if let Some(record) = self
            .data
            .namespaces
            .iter_mut()
            .find(|record| record.namespace_id == invite.namespace_id)
        {
            record.invite_secret = Some(invite.secret.expose().clone());
            record.invite_exp_unix_secs = Some(invite.exp_unix_secs);
            record.joined_at_unix_secs = now_unix_secs;
        } else {
            self.data.namespaces.push(NamespaceRecord {
                namespace_id: invite.namespace_id.clone(),
                invite_secret: Some(invite.secret.expose().clone()),
                invite_exp_unix_secs: Some(invite.exp_unix_secs),
                joined_at_unix_secs: now_unix_secs,
            });
        }
        self.persist()
    }

    pub fn namespace_count(&mut self, now_unix_secs: u64) -> u32 {
        self.purge_expired(now_unix_secs);
        self.data.namespaces.len() as u32
    }

    pub fn health_check(&mut self, now_unix_secs: u64) -> Result<u32, ApiError> {
        self.purge_expired(now_unix_secs);
        self.persist()?;
        Ok(self.data.namespaces.len() as u32)
    }

    pub fn primary_namespace_id(&mut self, now_unix_secs: u64) -> Option<String> {
        self.purge_expired(now_unix_secs);
        self.data
            .namespaces
            .first()
            .map(|record| record.namespace_id.clone())
    }

    fn purge_expired(&mut self, now_unix_secs: u64) {
        for record in &mut self.data.namespaces {
            if let Some(exp) = record.invite_exp_unix_secs {
                if now_unix_secs >= exp {
                    record.invite_secret = None;
                    record.invite_exp_unix_secs = None;
                }
            }
        }
    }

    fn persist(&mut self) -> Result<(), ApiError> {
        let text = serde_json::to_string_pretty(&self.data)
            .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to serialize state"))?;
        let tmp_path = self.path.with_extension("tmp");
        let mut file = open_private_write(&tmp_path)?;
        file.write_all(text.as_bytes())
            .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to write state file"))?;
        file.flush()
            .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to flush state file"))?;
        fs::rename(&tmp_path, &self.path)
            .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to replace state file"))?;
        Ok(())
    }
}

fn ensure_parent_dir(path: &Path) -> Result<(), ApiError> {
    let Some(parent) = path.parent() else {
        return Err(ApiError::new(
            ApiErrorCode::Internal,
            "state file has no parent directory",
        ));
    };
    fs::create_dir_all(parent)
        .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to create state directory"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(parent, fs::Permissions::from_mode(0o700));
    }

    Ok(())
}

fn open_private_write(path: &Path) -> Result<File, ApiError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .mode(0o600)
            .open(path)
            .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to open state file"))
    }

    #[cfg(not(unix))]
    {
        OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(path)
            .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to open state file"))
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::NamespaceStore;
    use crate::invite::generate_invite;

    fn temp_state_path(name: &str) -> PathBuf {
        let now_ns = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time must be valid")
            .as_nanos();
        std::env::temp_dir().join(format!("animus-link-tests/{name}-{now_ns}/namespaces.json"))
    }

    #[test]
    fn store_roundtrips_and_purges_expired_secrets() {
        let path = temp_state_path("namespace-store");
        let now = 1_700_000_000;
        let mut store = NamespaceStore::load_or_create(&path).expect("create store");

        let invite = generate_invite(now);
        store
            .upsert_from_invite(&invite, now)
            .expect("insert invite namespace");
        assert_eq!(store.namespace_count(now), 1);

        let future = invite.exp_unix_secs + 1;
        assert_eq!(store.namespace_count(future), 1);

        let _ = std::fs::remove_file(path);
    }
}
