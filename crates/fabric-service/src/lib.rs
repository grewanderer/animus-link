pub mod errors;

use std::collections::BTreeMap;

use errors::ServiceError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct MeshId(pub String);

impl MeshId {
    pub fn new(value: impl Into<String>) -> Result<Self, ServiceError> {
        let value = value.into();
        validate_identifier("mesh_id", value.as_str())?;
        Ok(Self(value))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrustPolicy {
    Allow,
    Deny,
    Pending,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeRole {
    Edge,
    Relay,
    Gateway,
    ServiceHost,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoutingMode {
    DirectFirstRelaySecond,
    ForcedRelay,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoutePath {
    Direct,
    PeerRelay,
    ManagedRelay,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DecisionTargetKind {
    Peer,
    Service,
    Conversation,
    Adapter,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ServiceBindingState {
    Planned,
    Active,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppAdapterKind {
    Rustdesk,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MeshConfig {
    pub mesh_id: String,
    pub mesh_name: String,
    pub created_by_peer_id: String,
    pub local_root_identity_id: String,
    pub local_device_id: String,
    pub local_node_id: String,
    pub invite_ttl_secs: u64,
    pub created_at_unix_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MeshMembership {
    pub mesh_id: String,
    pub peer_id: String,
    pub device_id: String,
    pub node_id: String,
    pub root_identity_id: String,
    pub roles: Vec<NodeRole>,
    pub trust: TrustPolicy,
    pub joined_at_unix_secs: u64,
    pub revoked_at_unix_secs: Option<u64>,
    pub membership_signature: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RelayOffer {
    pub relay_id: String,
    pub mesh_id: String,
    pub peer_id: String,
    pub node_id: String,
    pub managed: bool,
    pub forced_only: bool,
    pub tags: Vec<String>,
    pub advertised_at_unix_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PreferredRoutePolicy {
    pub mesh_id: String,
    pub target_kind: DecisionTargetKind,
    pub target_id: String,
    pub mode: RoutingMode,
    pub preferred_relay_node_id: Option<String>,
    pub fallback_relay_node_id: Option<String>,
    pub allow_managed_relay: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServiceDescriptor {
    pub service_id: String,
    pub mesh_id: String,
    pub service_name: String,
    pub owner_peer_id: String,
    pub owner_node_id: String,
    pub local_addr: String,
    pub protocol: String,
    pub tags: Vec<String>,
    pub allowed_peers: Vec<String>,
    pub trust: TrustPolicy,
    pub app_protocol: Option<String>,
    pub published_at_unix_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServiceBinding {
    pub binding_id: String,
    pub mesh_id: String,
    pub service_id: Option<String>,
    pub service_name: String,
    pub consumer_peer_id: String,
    pub consumer_node_id: String,
    pub local_listener: Option<String>,
    pub route_mode: RoutingMode,
    pub selected_relay_node_id: Option<String>,
    pub state: ServiceBindingState,
    pub created_at_unix_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PeerStatus {
    pub mesh_id: String,
    pub peer_id: String,
    pub node_id: String,
    pub roles: Vec<NodeRole>,
    pub trust: TrustPolicy,
    pub online: bool,
    pub direct_path_allowed: bool,
    pub managed_relay_allowed: bool,
    pub last_seen_unix_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DecisionLog {
    pub decision_id: String,
    pub mesh_id: String,
    pub target_kind: DecisionTargetKind,
    pub target_id: String,
    pub mode: RoutingMode,
    pub chosen_path: RoutePath,
    pub selected_relay_node_id: Option<String>,
    pub fallback_relay_node_id: Option<String>,
    pub managed_relay_allowed: bool,
    pub reason: String,
    pub recorded_at_unix_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MessengerConversation {
    pub conversation_id: String,
    pub mesh_id: String,
    pub participants: Vec<String>,
    pub title: Option<String>,
    pub tags: Vec<String>,
    pub created_at_unix_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MessengerMessage {
    pub message_id: String,
    pub mesh_id: String,
    pub conversation_id: String,
    pub sender_peer_id: String,
    pub body: String,
    pub attachment_service_id: Option<String>,
    pub control_stream: bool,
    pub decision_id: Option<String>,
    pub sent_at_unix_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppAdapterBinding {
    pub binding_id: String,
    pub app: AppAdapterKind,
    pub mesh_id: String,
    pub peer_id: String,
    pub node_id: String,
    pub service_id: Option<String>,
    pub local_addr: Option<String>,
    pub tags: Vec<String>,
    pub metadata: BTreeMap<String, String>,
    pub created_at_unix_secs: u64,
}

pub fn canonicalize_roles(mut roles: Vec<NodeRole>) -> Vec<NodeRole> {
    roles.sort_by_key(node_role_rank);
    roles.dedup();
    if roles.is_empty() {
        roles.push(NodeRole::Edge);
    }
    roles
}

pub fn canonicalize_strings(mut values: Vec<String>) -> Vec<String> {
    values.retain(|value| !value.trim().is_empty());
    values.sort();
    values.dedup();
    values
}

pub fn validate_identifier(field: &'static str, value: &str) -> Result<(), ServiceError> {
    if value.trim().is_empty() {
        return Err(ServiceError::EmptyField(field));
    }
    if value.len() > 128
        || !value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':'))
    {
        return Err(ServiceError::InvalidField(field));
    }
    Ok(())
}

fn node_role_rank(role: &NodeRole) -> u8 {
    match role {
        NodeRole::Edge => 0,
        NodeRole::Relay => 1,
        NodeRole::Gateway => 2,
        NodeRole::ServiceHost => 3,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        canonicalize_roles, canonicalize_strings, validate_identifier, DecisionTargetKind, MeshId,
        NodeRole, RoutePath, RoutingMode,
    };

    #[test]
    fn mesh_id_validation_rejects_bad_values() {
        assert!(MeshId::new("mesh-01").is_ok());
        assert!(MeshId::new("").is_err());
        assert!(MeshId::new("mesh with spaces").is_err());
    }

    #[test]
    fn canonicalization_helpers_are_stable() {
        assert_eq!(
            canonicalize_roles(vec![NodeRole::Gateway, NodeRole::Relay, NodeRole::Gateway,]),
            vec![NodeRole::Relay, NodeRole::Gateway]
        );
        assert_eq!(
            canonicalize_strings(vec![
                "z".to_string(),
                String::new(),
                "a".to_string(),
                "z".to_string(),
            ]),
            vec!["a".to_string(), "z".to_string()]
        );
    }

    #[test]
    fn routing_enums_serialize_in_snake_case() {
        let value = json!({
            "mode": RoutingMode::ForcedRelay,
            "path": RoutePath::ManagedRelay,
            "target_kind": DecisionTargetKind::Conversation,
        });
        assert_eq!(value["mode"], "forced_relay");
        assert_eq!(value["path"], "managed_relay");
        assert_eq!(value["target_kind"], "conversation");
    }

    #[test]
    fn identifier_validation_rejects_invalid_characters() {
        assert!(validate_identifier("field", "node:1").is_ok());
        assert!(validate_identifier("field", "node/1").is_err());
    }
}
