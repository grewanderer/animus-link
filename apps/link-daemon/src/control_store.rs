use std::{
    collections::BTreeMap,
    fmt::Write as _,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

use fabric_crypto::simple_hash32;
use fabric_service::{
    canonicalize_roles, canonicalize_strings, validate_identifier, AppAdapterBinding,
    AppAdapterKind, DecisionLog, DecisionTargetKind, MeshConfig, MeshMembership, NodeRole,
    PeerStatus, PreferredRoutePolicy, RelayOffer, RoutePath, RoutingMode, ServiceBinding,
    ServiceBindingState, ServiceDescriptor, TrustPolicy,
};
use serde::{Deserialize, Serialize};

use crate::{
    errors::{ApiError, ApiErrorCode},
    invite::{generate_mesh_invite, Invite},
};

const STORE_VERSION: u16 = 2;
const MAX_DECISION_LOGS: usize = 128;
const DEFAULT_MESH_NAME: &str = "animus-mesh";
const DEFAULT_INVITE_TTL_SECS: u64 = 3_600;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ControlPlaneStoreFile {
    version: u16,
    local_identity: LocalIdentityRecord,
    meshes: Vec<StoredMesh>,
    route_policies: Vec<PreferredRoutePolicy>,
    decision_logs: Vec<DecisionLog>,
    conversations: Vec<MessengerConversationRecord>,
    messages: Vec<MessengerMessageRecord>,
    app_bindings: Vec<AppAdapterBinding>,
    next_nonce: u64,
}

impl Default for ControlPlaneStoreFile {
    fn default() -> Self {
        Self {
            version: STORE_VERSION,
            local_identity: LocalIdentityRecord::default(),
            meshes: Vec::new(),
            route_policies: Vec::new(),
            decision_logs: Vec::new(),
            conversations: Vec::new(),
            messages: Vec::new(),
            app_bindings: Vec::new(),
            next_nonce: 1,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct LocalIdentityRecord {
    root_identity_id: String,
    device_identity_id: String,
    node_id: String,
    created_at_unix_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredMesh {
    config: MeshConfig,
    memberships: Vec<MeshMembership>,
    relay_offers: Vec<RelayOffer>,
    services: Vec<ServiceDescriptor>,
    service_bindings: Vec<ServiceBinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshView {
    pub config: MeshConfig,
    pub peer_count: u32,
    pub relay_count: u32,
    pub service_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshJoinResult {
    pub mesh: MeshConfig,
    pub membership: MeshMembership,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inviter: Option<PeerStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeRoleAssignment {
    pub mesh_id: String,
    pub node_id: String,
    pub roles: Vec<NodeRole>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeRoleSummary {
    pub node_id: String,
    pub assignments: Vec<NodeRoleAssignment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayStatusView {
    pub managed_relay_configured: bool,
    pub offers: Vec<RelayOffer>,
    pub selections: Vec<PreferredRoutePolicy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingStatusView {
    pub managed_relay_configured: bool,
    pub policies: Vec<PreferredRoutePolicy>,
    pub latest_decisions: Vec<DecisionLog>,
}

#[derive(Debug, Clone)]
pub struct RouteDecisionInput {
    pub mesh_id: String,
    pub target_kind: DecisionTargetKind,
    pub target_id: String,
    pub direct_candidate: bool,
    pub managed_relay_available: bool,
}

#[derive(Debug, Clone)]
pub struct RouteDecision {
    pub path: RoutePath,
    pub mode: RoutingMode,
    pub selected_relay_node_id: Option<String>,
    pub log: DecisionLog,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessengerConversationRecord {
    pub conversation_id: String,
    pub mesh_id: String,
    pub participants: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub tags: Vec<String>,
    pub created_at_unix_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessengerMessageRecord {
    pub message_id: String,
    pub mesh_id: String,
    pub conversation_id: String,
    pub sender_peer_id: String,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachment_service_id: Option<String>,
    pub control_stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision_id: Option<String>,
    pub sent_at_unix_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessengerStreamView {
    pub conversations: Vec<MessengerConversationRecord>,
    pub messages: Vec<MessengerMessageRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerEndpointSnapshot {
    pub mesh_id: String,
    pub peer_id: String,
    pub node_id: String,
    pub api_url: String,
    pub runtime_addr: String,
    pub last_seen_unix_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshRuntimeSnapshot {
    pub mesh: MeshConfig,
    pub memberships: Vec<MeshMembership>,
    pub relay_offers: Vec<RelayOffer>,
    pub services: Vec<ServiceDescriptor>,
    pub conversations: Vec<MessengerConversationRecord>,
    pub messages: Vec<MessengerMessageRecord>,
    pub peer_endpoints: Vec<PeerEndpointSnapshot>,
}

#[derive(Debug, Clone, Deserialize)]
struct LegacyNamespaceStoreFile {
    version: u16,
    namespaces: Vec<LegacyNamespaceRecord>,
}

#[derive(Debug, Clone, Deserialize)]
struct LegacyNamespaceRecord {
    namespace_id: String,
    joined_at_unix_secs: u64,
}

pub struct ControlPlaneStore {
    path: PathBuf,
    data: ControlPlaneStoreFile,
}

impl ControlPlaneStore {
    pub fn load_or_create(path: impl Into<PathBuf>, now_unix_secs: u64) -> Result<Self, ApiError> {
        let path = path.into();
        ensure_parent_dir(&path)?;

        let mut data = if path.exists() {
            let mut file = File::open(&path)
                .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to open state file"))?;
            let mut text = String::new();
            file.read_to_string(&mut text)
                .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to read state file"))?;
            load_state(text.as_str(), now_unix_secs)?
        } else {
            ControlPlaneStoreFile::default()
        };

        if data.local_identity.root_identity_id.is_empty() {
            data.local_identity =
                new_local_identity(path.to_string_lossy().as_ref(), now_unix_secs, 0);
            data.next_nonce = data.next_nonce.max(1);
        }

        let mut store = Self { path, data };
        store.persist()?;
        Ok(store)
    }

    pub fn mesh_count(&self) -> u32 {
        self.data.meshes.len().min(u32::MAX as usize) as u32
    }

    pub fn health_check(&mut self) -> Result<u32, ApiError> {
        self.persist()?;
        Ok(self.mesh_count())
    }

    pub fn active_mesh_id(&self) -> Option<String> {
        self.data
            .meshes
            .first()
            .map(|mesh| mesh.config.mesh_id.clone())
    }

    pub fn ensure_default_mesh(&mut self, now_unix_secs: u64) -> Result<String, ApiError> {
        if let Some(mesh_id) = self.active_mesh_id() {
            return Ok(mesh_id);
        }
        Ok(self
            .create_mesh(Some(DEFAULT_MESH_NAME.to_string()), now_unix_secs)?
            .mesh_id)
    }

    pub fn local_peer_id(&self) -> &str {
        self.data.local_identity.root_identity_id.as_str()
    }

    pub fn local_node_id(&self) -> &str {
        self.data.local_identity.node_id.as_str()
    }

    pub fn local_device_id(&self) -> &str {
        self.data.local_identity.device_identity_id.as_str()
    }

    pub fn create_mesh(
        &mut self,
        mesh_name: Option<String>,
        now_unix_secs: u64,
    ) -> Result<MeshConfig, ApiError> {
        let mesh_name = mesh_name
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_MESH_NAME.to_string());
        validate_identifier("mesh_name", mesh_name.as_str())
            .map_err(|_| ApiError::new(ApiErrorCode::InvalidInput, "invalid mesh_name"))?;

        let mesh_id = short_hash(format!("mesh:{}:{}", mesh_name, self.data.next_nonce).as_bytes());
        self.data.next_nonce = self.data.next_nonce.saturating_add(1);
        let config = MeshConfig {
            mesh_id: mesh_id.clone(),
            mesh_name,
            created_by_peer_id: self.local_peer_id().to_string(),
            local_root_identity_id: self.local_peer_id().to_string(),
            local_device_id: self.local_device_id().to_string(),
            local_node_id: self.local_node_id().to_string(),
            invite_ttl_secs: DEFAULT_INVITE_TTL_SECS,
            created_at_unix_secs: now_unix_secs,
        };
        let membership = build_membership(
            mesh_id.as_str(),
            self.local_peer_id(),
            self.local_device_id(),
            self.local_node_id(),
            vec![NodeRole::Edge],
            TrustPolicy::Allow,
            now_unix_secs,
        );

        self.data.meshes.push(StoredMesh {
            config: config.clone(),
            memberships: vec![membership],
            relay_offers: Vec::new(),
            services: Vec::new(),
            service_bindings: Vec::new(),
        });
        self.persist()?;
        Ok(config)
    }

    pub fn create_mesh_invite(
        &mut self,
        mesh_id: &str,
        now_unix_secs: u64,
    ) -> Result<Invite, ApiError> {
        let mesh = self
            .find_mesh(mesh_id)
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "mesh not found"))?;
        generate_mesh_invite(
            mesh.config.mesh_id.as_str(),
            self.local_peer_id(),
            self.local_node_id(),
            now_unix_secs,
        )
    }

    pub fn join_mesh(
        &mut self,
        invite: &Invite,
        now_unix_secs: u64,
    ) -> Result<MeshJoinResult, ApiError> {
        let local_peer_id = self.local_peer_id().to_string();
        let local_device_id = self.local_device_id().to_string();
        let local_node_id = self.local_node_id().to_string();
        let mesh_index = match self.find_mesh_index(invite.mesh_id.as_str()) {
            Some(index) => index,
            None => {
                let config = MeshConfig {
                    mesh_id: invite.mesh_id.clone(),
                    mesh_name: format!("mesh-{}", &invite.mesh_id[..8]),
                    created_by_peer_id: invite
                        .issuer_peer_id
                        .clone()
                        .unwrap_or_else(|| local_peer_id.clone()),
                    local_root_identity_id: local_peer_id.clone(),
                    local_device_id: local_device_id.clone(),
                    local_node_id: local_node_id.clone(),
                    invite_ttl_secs: DEFAULT_INVITE_TTL_SECS,
                    created_at_unix_secs: now_unix_secs,
                };
                self.data.meshes.push(StoredMesh {
                    config,
                    memberships: Vec::new(),
                    relay_offers: Vec::new(),
                    services: Vec::new(),
                    service_bindings: Vec::new(),
                });
                self.data.meshes.len() - 1
            }
        };

        let mesh = &mut self.data.meshes[mesh_index];
        let mut inviter = None;
        if let (Some(peer_id), Some(node_id)) = (
            invite.issuer_peer_id.as_deref(),
            invite.issuer_node_id.as_deref(),
        ) {
            if peer_id != local_peer_id {
                let membership = ensure_membership(
                    &mut mesh.memberships,
                    build_membership(
                        invite.mesh_id.as_str(),
                        peer_id,
                        "remote-device",
                        node_id,
                        vec![NodeRole::Edge],
                        TrustPolicy::Allow,
                        now_unix_secs,
                    ),
                );
                inviter = Some(to_peer_status(
                    mesh.config.mesh_id.as_str(),
                    membership,
                    mesh.relay_offers
                        .iter()
                        .any(|offer| offer.node_id == membership.node_id),
                ));
            }
        }

        let membership = ensure_membership(
            &mut mesh.memberships,
            build_membership(
                invite.mesh_id.as_str(),
                local_peer_id.as_str(),
                local_device_id.as_str(),
                local_node_id.as_str(),
                vec![NodeRole::Edge],
                TrustPolicy::Allow,
                now_unix_secs,
            ),
        )
        .clone();
        let response = MeshJoinResult {
            mesh: mesh.config.clone(),
            membership,
            inviter,
        };
        self.persist()?;
        Ok(response)
    }

    pub fn list_meshes(&self) -> Vec<MeshView> {
        self.data
            .meshes
            .iter()
            .map(|mesh| MeshView {
                config: mesh.config.clone(),
                peer_count: mesh
                    .memberships
                    .iter()
                    .filter(|membership| membership.trust != TrustPolicy::Deny)
                    .count()
                    .min(u32::MAX as usize) as u32,
                relay_count: mesh
                    .relay_offers
                    .iter()
                    .filter(|offer| !offer.forced_only || !offer.managed || !offer.tags.is_empty())
                    .count()
                    .min(u32::MAX as usize) as u32,
                service_count: mesh.services.len().min(u32::MAX as usize) as u32,
            })
            .collect()
    }

    pub fn list_mesh_peers(&self, mesh_id: &str) -> Result<Vec<PeerStatus>, ApiError> {
        let mesh = self
            .find_mesh(mesh_id)
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "mesh not found"))?;
        Ok(mesh
            .memberships
            .iter()
            .map(|membership| {
                to_peer_status(
                    mesh.config.mesh_id.as_str(),
                    membership,
                    mesh.relay_offers
                        .iter()
                        .any(|offer| offer.node_id == membership.node_id),
                )
            })
            .collect())
    }

    pub fn revoke_peer(
        &mut self,
        mesh_id: &str,
        peer_id: &str,
        now_unix_secs: u64,
    ) -> Result<MeshMembership, ApiError> {
        if peer_id == self.local_peer_id() {
            return Err(ApiError::new(
                ApiErrorCode::Denied,
                "cannot revoke local peer",
            ));
        }
        let mesh = self
            .find_mesh_mut(mesh_id)
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "mesh not found"))?;
        let membership = mesh
            .memberships
            .iter_mut()
            .find(|membership| membership.peer_id == peer_id)
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "peer not found"))?;
        membership.trust = TrustPolicy::Deny;
        membership.revoked_at_unix_secs = Some(now_unix_secs);
        mesh.relay_offers.retain(|offer| offer.peer_id != peer_id);
        mesh.services
            .retain(|service| service.owner_peer_id != peer_id);
        let revoked = membership.clone();
        self.persist()?;
        Ok(revoked)
    }

    pub fn set_node_roles(
        &mut self,
        mesh_id: &str,
        node_id: &str,
        roles: Vec<NodeRole>,
        now_unix_secs: u64,
    ) -> Result<MeshMembership, ApiError> {
        let normalized_roles = canonicalize_roles(roles);
        let mesh = self
            .find_mesh_mut(mesh_id)
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "mesh not found"))?;
        let membership = mesh
            .memberships
            .iter_mut()
            .find(|membership| membership.node_id == node_id)
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "node not found"))?;
        membership.roles = normalized_roles;
        membership.membership_signature = membership_signature(
            mesh_id,
            membership.peer_id.as_str(),
            membership.node_id.as_str(),
            membership.roles.as_slice(),
            membership.trust,
            now_unix_secs,
        );
        if !membership.roles.contains(&NodeRole::Relay) {
            mesh.relay_offers.retain(|offer| offer.node_id != node_id);
        }
        let response = membership.clone();
        self.persist()?;
        Ok(response)
    }

    pub fn get_node_roles(&self, node_id: &str) -> Result<NodeRoleSummary, ApiError> {
        let assignments = self
            .data
            .meshes
            .iter()
            .filter_map(|mesh| {
                mesh.memberships
                    .iter()
                    .find(|membership| membership.node_id == node_id)
                    .map(|membership| NodeRoleAssignment {
                        mesh_id: mesh.config.mesh_id.clone(),
                        node_id: node_id.to_string(),
                        roles: membership.roles.clone(),
                    })
            })
            .collect::<Vec<_>>();
        if assignments.is_empty() {
            return Err(ApiError::new(ApiErrorCode::NotFound, "node not found"));
        }
        Ok(NodeRoleSummary {
            node_id: node_id.to_string(),
            assignments,
        })
    }

    pub fn advertise_relay(
        &mut self,
        mesh_id: &str,
        node_id: Option<&str>,
        managed: bool,
        forced_only: bool,
        tags: Vec<String>,
        now_unix_secs: u64,
    ) -> Result<RelayOffer, ApiError> {
        let local_node_id = self.local_node_id().to_string();
        let node_id = node_id.unwrap_or(local_node_id.as_str()).to_string();
        if node_id != local_node_id {
            return Err(ApiError::new(
                ApiErrorCode::Denied,
                "relay advertisements are local-only",
            ));
        }
        let mesh = self
            .find_mesh_mut(mesh_id)
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "mesh not found"))?;
        let membership = mesh
            .memberships
            .iter()
            .find(|membership| {
                membership.node_id == node_id && membership.trust == TrustPolicy::Allow
            })
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "node not found"))?;
        if !membership.roles.contains(&NodeRole::Relay) {
            return Err(ApiError::new(
                ApiErrorCode::Denied,
                "relay role required before advertisement",
            ));
        }

        let relay_id = format!("relay-{}", short_hash(node_id.as_bytes()));
        let offer = RelayOffer {
            relay_id,
            mesh_id: mesh_id.to_string(),
            peer_id: membership.peer_id.clone(),
            node_id: membership.node_id.clone(),
            managed,
            forced_only,
            tags: canonicalize_strings(tags),
            advertised_at_unix_secs: now_unix_secs,
        };
        upsert_by_key(&mut mesh.relay_offers, offer.clone(), |item| {
            item.node_id.clone()
        });
        self.persist()?;
        Ok(offer)
    }

    pub fn select_route_policy(
        &mut self,
        policy: PreferredRoutePolicy,
    ) -> Result<PreferredRoutePolicy, ApiError> {
        validate_identifier("target_id", policy.target_id.as_str())
            .map_err(|_| ApiError::new(ApiErrorCode::InvalidInput, "invalid target_id"))?;
        if self.find_mesh(policy.mesh_id.as_str()).is_none() {
            return Err(ApiError::new(ApiErrorCode::NotFound, "mesh not found"));
        }
        if let Some(node_id) = policy.preferred_relay_node_id.as_deref() {
            validate_identifier("preferred_relay_node_id", node_id).map_err(|_| {
                ApiError::new(
                    ApiErrorCode::InvalidInput,
                    "invalid preferred_relay_node_id",
                )
            })?;
        }
        if let Some(node_id) = policy.fallback_relay_node_id.as_deref() {
            validate_identifier("fallback_relay_node_id", node_id).map_err(|_| {
                ApiError::new(ApiErrorCode::InvalidInput, "invalid fallback_relay_node_id")
            })?;
        }

        upsert_by_key(
            &mut self.data.route_policies,
            policy.clone(),
            route_policy_key,
        );
        self.persist()?;
        Ok(policy)
    }

    pub fn clear_route_policy(
        &mut self,
        mesh_id: &str,
        target_kind: DecisionTargetKind,
        target_id: &str,
    ) -> Result<(), ApiError> {
        let original_len = self.data.route_policies.len();
        self.data.route_policies.retain(|policy| {
            !(policy.mesh_id == mesh_id
                && policy.target_kind == target_kind
                && policy.target_id == target_id)
        });
        if self.data.route_policies.len() == original_len {
            return Err(ApiError::new(
                ApiErrorCode::NotFound,
                "relay selection not found",
            ));
        }
        self.persist()?;
        Ok(())
    }

    pub fn relay_status(&self, managed_relay_configured: bool) -> RelayStatusView {
        RelayStatusView {
            managed_relay_configured,
            offers: self
                .data
                .meshes
                .iter()
                .flat_map(|mesh| mesh.relay_offers.clone())
                .collect(),
            selections: self.data.route_policies.clone(),
        }
    }

    pub fn routing_status(&self, managed_relay_configured: bool) -> RoutingStatusView {
        let mut latest = self.data.decision_logs.clone();
        latest.sort_by(|left, right| {
            right
                .recorded_at_unix_secs
                .cmp(&left.recorded_at_unix_secs)
                .then_with(|| left.decision_id.cmp(&right.decision_id))
        });
        latest.truncate(16);
        RoutingStatusView {
            managed_relay_configured,
            policies: self.data.route_policies.clone(),
            latest_decisions: latest,
        }
    }

    pub fn decision_logs(&self) -> Vec<DecisionLog> {
        self.data.decision_logs.clone()
    }

    pub fn decide_route(
        &mut self,
        input: RouteDecisionInput,
        now_unix_secs: u64,
    ) -> Result<RouteDecision, ApiError> {
        if self.find_mesh(input.mesh_id.as_str()).is_none() {
            return Err(ApiError::new(ApiErrorCode::NotFound, "mesh not found"));
        }

        let policy = self
            .data
            .route_policies
            .iter()
            .find(|policy| {
                policy.mesh_id == input.mesh_id
                    && policy.target_kind == input.target_kind
                    && policy.target_id == input.target_id
            })
            .cloned()
            .unwrap_or(PreferredRoutePolicy {
                mesh_id: input.mesh_id.clone(),
                target_kind: input.target_kind,
                target_id: input.target_id.clone(),
                mode: RoutingMode::DirectFirstRelaySecond,
                preferred_relay_node_id: None,
                fallback_relay_node_id: None,
                allow_managed_relay: input.managed_relay_available,
            });
        let offers = self
            .find_mesh(input.mesh_id.as_str())
            .map(|mesh| mesh.relay_offers.clone())
            .unwrap_or_default();
        let preferred_offer = policy
            .preferred_relay_node_id
            .as_deref()
            .and_then(|node_id| {
                offers
                    .iter()
                    .find(|offer| offer.node_id == node_id)
                    .cloned()
            });
        let fallback_offer = policy
            .fallback_relay_node_id
            .as_deref()
            .and_then(|node_id| {
                offers
                    .iter()
                    .find(|offer| offer.node_id == node_id)
                    .cloned()
            })
            .or_else(|| {
                offers
                    .iter()
                    .find(|offer| {
                        Some(offer.node_id.as_str()) != policy.preferred_relay_node_id.as_deref()
                    })
                    .cloned()
            });

        let (path, selected_relay_node_id, reason) = match policy.mode {
            RoutingMode::ForcedRelay => {
                if let Some(offer) = preferred_offer.clone().or(fallback_offer.clone()) {
                    (
                        relay_offer_path(&offer),
                        Some(offer.node_id),
                        "policy_forced_relay",
                    )
                } else if policy.allow_managed_relay && input.managed_relay_available {
                    (RoutePath::ManagedRelay, None, "policy_forced_managed_relay")
                } else {
                    return Err(ApiError::new(
                        ApiErrorCode::NotReady,
                        "forced relay route unavailable",
                    ));
                }
            }
            RoutingMode::DirectFirstRelaySecond => {
                if let Some(offer) = preferred_offer.clone() {
                    (
                        relay_offer_path(&offer),
                        Some(offer.node_id),
                        "preferred_relay_selected",
                    )
                } else if input.direct_candidate {
                    (RoutePath::Direct, None, "direct_candidate_available")
                } else if let Some(offer) = fallback_offer.clone() {
                    (
                        relay_offer_path(&offer),
                        Some(offer.node_id),
                        "fallback_relay_selected",
                    )
                } else if policy.allow_managed_relay && input.managed_relay_available {
                    (RoutePath::ManagedRelay, None, "managed_relay_fallback")
                } else {
                    return Err(ApiError::new(ApiErrorCode::NotReady, "route unavailable"));
                }
            }
        };

        let decision_id = self.next_id("decision", input.target_id.as_str());
        let log = DecisionLog {
            decision_id,
            mesh_id: input.mesh_id,
            target_kind: input.target_kind,
            target_id: input.target_id,
            mode: policy.mode,
            chosen_path: path,
            selected_relay_node_id: selected_relay_node_id.clone(),
            fallback_relay_node_id: policy.fallback_relay_node_id.clone(),
            managed_relay_allowed: policy.allow_managed_relay,
            reason: reason.to_string(),
            recorded_at_unix_secs: now_unix_secs,
        };
        self.data.decision_logs.push(log.clone());
        if self.data.decision_logs.len() > MAX_DECISION_LOGS {
            let drop_count = self.data.decision_logs.len() - MAX_DECISION_LOGS;
            self.data.decision_logs.drain(..drop_count);
        }
        self.persist()?;
        Ok(RouteDecision {
            path,
            mode: policy.mode,
            selected_relay_node_id,
            log,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub fn register_service(
        &mut self,
        mesh_id: &str,
        service_name: &str,
        local_addr: &str,
        allowed_peers: Vec<String>,
        tags: Vec<String>,
        app_protocol: Option<String>,
        now_unix_secs: u64,
    ) -> Result<ServiceDescriptor, ApiError> {
        validate_identifier("service_name", service_name)
            .map_err(|_| ApiError::new(ApiErrorCode::InvalidInput, "invalid service_name"))?;
        let normalized_allowed = canonicalize_strings(allowed_peers);
        if normalized_allowed.is_empty() {
            return Err(ApiError::new(
                ApiErrorCode::Denied,
                "explicit allow policy required",
            ));
        }
        let mesh_index = self
            .find_mesh_index(mesh_id)
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "mesh not found"))?;
        {
            let mesh = &self.data.meshes[mesh_index];
            if mesh
                .services
                .iter()
                .any(|service| service.service_name == service_name)
            {
                return Err(ApiError::new(
                    ApiErrorCode::Conflict,
                    "service already exposed",
                ));
            }
        }

        let descriptor = ServiceDescriptor {
            service_id: self.next_id("service", service_name),
            mesh_id: mesh_id.to_string(),
            service_name: service_name.to_string(),
            owner_peer_id: self.local_peer_id().to_string(),
            owner_node_id: self.local_node_id().to_string(),
            local_addr: local_addr.to_string(),
            protocol: "tcp".to_string(),
            tags: canonicalize_strings(tags),
            allowed_peers: normalized_allowed,
            trust: TrustPolicy::Allow,
            app_protocol,
            published_at_unix_secs: now_unix_secs,
        };
        let local_node_id = self.local_node_id().to_string();
        let mesh = &mut self.data.meshes[mesh_index];
        if let Some(membership) = mesh
            .memberships
            .iter_mut()
            .find(|membership| membership.node_id == local_node_id)
        {
            let mut roles = membership.roles.clone();
            roles.push(NodeRole::ServiceHost);
            membership.roles = canonicalize_roles(roles);
        }
        mesh.services.push(descriptor.clone());
        self.persist()?;
        Ok(descriptor)
    }

    pub fn services(&self, mesh_id: Option<&str>) -> Vec<ServiceDescriptor> {
        self.data
            .meshes
            .iter()
            .filter(|mesh| mesh_id.is_none() || Some(mesh.config.mesh_id.as_str()) == mesh_id)
            .flat_map(|mesh| mesh.services.clone())
            .collect()
    }

    pub fn service_bindings(&self, mesh_id: Option<&str>) -> Vec<ServiceBinding> {
        self.data
            .meshes
            .iter()
            .filter(|mesh| mesh_id.is_none() || Some(mesh.config.mesh_id.as_str()) == mesh_id)
            .flat_map(|mesh| mesh.service_bindings.clone())
            .collect()
    }

    pub fn resolve_service(
        &self,
        mesh_id: &str,
        service_id: Option<&str>,
        service_name: Option<&str>,
    ) -> Result<Option<ServiceDescriptor>, ApiError> {
        let mesh = self
            .find_mesh(mesh_id)
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "mesh not found"))?;
        if let Some(service_id) = service_id {
            let descriptor = mesh
                .services
                .iter()
                .find(|service| service.service_id == service_id)
                .cloned()
                .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "service not found"))?;
            return Ok(Some(descriptor));
        }
        if let Some(service_name) = service_name {
            return Ok(mesh
                .services
                .iter()
                .find(|service| service.service_name == service_name)
                .cloned());
        }
        Err(ApiError::new(
            ApiErrorCode::InvalidInput,
            "service selector required",
        ))
    }

    pub fn register_service_binding(
        &mut self,
        mesh_id: &str,
        descriptor: Option<&ServiceDescriptor>,
        service_name: &str,
        local_listener: Option<String>,
        route: &RouteDecision,
        now_unix_secs: u64,
    ) -> Result<ServiceBinding, ApiError> {
        let local_peer_id = self.local_peer_id().to_string();
        let local_node_id = self.local_node_id().to_string();
        let binding_id = self.next_id("binding", service_name);
        if let Some(descriptor) = descriptor {
            if descriptor.trust == TrustPolicy::Deny {
                return Err(ApiError::new(ApiErrorCode::Denied, "service denied"));
            }
            if !descriptor.allowed_peers.contains(&local_peer_id)
                && descriptor.owner_peer_id != local_peer_id
            {
                return Err(ApiError::new(ApiErrorCode::Denied, "service acl denied"));
            }
        }
        let mesh = self
            .find_mesh_mut(mesh_id)
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "mesh not found"))?;
        let consumer_allowed = mesh.memberships.iter().any(|membership| {
            membership.peer_id == local_peer_id && membership.trust == TrustPolicy::Allow
        });
        if !consumer_allowed {
            return Err(ApiError::new(ApiErrorCode::Denied, "service denied"));
        }

        let binding = ServiceBinding {
            binding_id,
            mesh_id: mesh_id.to_string(),
            service_id: descriptor.map(|descriptor| descriptor.service_id.clone()),
            service_name: service_name.to_string(),
            consumer_peer_id: local_peer_id,
            consumer_node_id: local_node_id,
            local_listener,
            route_mode: route.mode,
            selected_relay_node_id: route.selected_relay_node_id.clone(),
            state: ServiceBindingState::Planned,
            created_at_unix_secs: now_unix_secs,
        };
        mesh.service_bindings.push(binding.clone());
        self.persist()?;
        Ok(binding)
    }

    pub fn update_service_binding_state(
        &mut self,
        binding_id: &str,
        state: ServiceBindingState,
    ) -> Result<(), ApiError> {
        for mesh in &mut self.data.meshes {
            if let Some(binding) = mesh
                .service_bindings
                .iter_mut()
                .find(|binding| binding.binding_id == binding_id)
            {
                binding.state = state;
                self.persist()?;
                return Ok(());
            }
        }
        Err(ApiError::new(
            ApiErrorCode::NotFound,
            "service binding not found",
        ))
    }

    pub fn delete_service(&mut self, service_id: &str) -> Result<ServiceDescriptor, ApiError> {
        for mesh in &mut self.data.meshes {
            if let Some(index) = mesh
                .services
                .iter()
                .position(|service| service.service_id == service_id)
            {
                let descriptor = mesh.services.remove(index);
                mesh.service_bindings
                    .retain(|binding| binding.service_id.as_deref() != Some(service_id));
                self.persist()?;
                return Ok(descriptor);
            }
        }
        Err(ApiError::new(ApiErrorCode::NotFound, "service not found"))
    }

    pub fn create_conversation(
        &mut self,
        mesh_id: &str,
        participants: Vec<String>,
        title: Option<String>,
        tags: Vec<String>,
        now_unix_secs: u64,
    ) -> Result<MessengerConversationRecord, ApiError> {
        let mesh = self
            .find_mesh(mesh_id)
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "mesh not found"))?;
        let mut participants = canonicalize_strings(participants);
        if !participants
            .iter()
            .any(|peer_id| peer_id == self.local_peer_id())
        {
            participants.push(self.local_peer_id().to_string());
        }
        participants = canonicalize_strings(participants);
        if participants.len() < 2 {
            return Err(ApiError::new(
                ApiErrorCode::InvalidInput,
                "conversation requires at least two peers",
            ));
        }
        if participants.iter().any(|peer_id| {
            mesh.memberships.iter().all(|membership| {
                membership.peer_id != *peer_id || membership.trust != TrustPolicy::Allow
            })
        }) {
            return Err(ApiError::new(
                ApiErrorCode::Denied,
                "unknown conversation peer",
            ));
        }
        let conversation = MessengerConversationRecord {
            conversation_id: self.next_id("conversation", mesh_id),
            mesh_id: mesh_id.to_string(),
            participants,
            title: title.filter(|value| !value.trim().is_empty()),
            tags: canonicalize_strings(tags),
            created_at_unix_secs: now_unix_secs,
        };
        self.data.conversations.push(conversation.clone());
        self.persist()?;
        Ok(conversation)
    }

    pub fn list_conversations(&self, mesh_id: Option<&str>) -> Vec<MessengerConversationRecord> {
        self.data
            .conversations
            .iter()
            .filter(|conversation| {
                mesh_id.is_none() || Some(conversation.mesh_id.as_str()) == mesh_id
            })
            .cloned()
            .collect()
    }

    pub fn send_message(
        &mut self,
        conversation_id: &str,
        body: &str,
        attachment_service_id: Option<String>,
        control_stream: bool,
        decision_id: Option<String>,
        now_unix_secs: u64,
    ) -> Result<MessengerMessageRecord, ApiError> {
        if body.trim().is_empty() {
            return Err(ApiError::new(
                ApiErrorCode::InvalidInput,
                "message body required",
            ));
        }
        let conversation = self
            .data
            .conversations
            .iter()
            .find(|conversation| conversation.conversation_id == conversation_id)
            .cloned()
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "conversation not found"))?;
        let message = MessengerMessageRecord {
            message_id: self.next_id("message", conversation_id),
            mesh_id: conversation.mesh_id,
            conversation_id: conversation.conversation_id,
            sender_peer_id: self.local_peer_id().to_string(),
            body: body.to_string(),
            attachment_service_id,
            control_stream,
            decision_id,
            sent_at_unix_secs: now_unix_secs,
        };
        self.data.messages.push(message.clone());
        self.persist()?;
        Ok(message)
    }

    pub fn messenger_stream(&self, conversation_id: Option<&str>) -> MessengerStreamView {
        let conversations = match conversation_id {
            Some(conversation_id) => self
                .data
                .conversations
                .iter()
                .filter(|conversation| conversation.conversation_id == conversation_id)
                .cloned()
                .collect(),
            None => self.data.conversations.clone(),
        };
        let messages = self
            .data
            .messages
            .iter()
            .filter(|message| {
                conversation_id.is_none()
                    || Some(message.conversation_id.as_str()) == conversation_id
            })
            .cloned()
            .collect();
        MessengerStreamView {
            conversations,
            messages,
        }
    }

    pub fn messenger_presence(&self, mesh_id: &str) -> Result<Vec<PeerStatus>, ApiError> {
        self.list_mesh_peers(mesh_id)
    }

    pub fn mesh_runtime_snapshot(&self, mesh_id: &str) -> Result<MeshRuntimeSnapshot, ApiError> {
        let mesh = self
            .find_mesh(mesh_id)
            .ok_or_else(|| ApiError::new(ApiErrorCode::NotFound, "mesh not found"))?;
        Ok(MeshRuntimeSnapshot {
            mesh: mesh.config.clone(),
            memberships: mesh.memberships.clone(),
            relay_offers: mesh.relay_offers.clone(),
            services: mesh.services.clone(),
            conversations: self
                .data
                .conversations
                .iter()
                .filter(|conversation| conversation.mesh_id == mesh_id)
                .cloned()
                .collect(),
            messages: self
                .data
                .messages
                .iter()
                .filter(|message| message.mesh_id == mesh_id)
                .cloned()
                .collect(),
            peer_endpoints: Vec::new(),
        })
    }

    pub fn import_mesh_runtime_snapshot(
        &mut self,
        snapshot: &MeshRuntimeSnapshot,
    ) -> Result<(), ApiError> {
        let mesh_index = match self.find_mesh_index(snapshot.mesh.mesh_id.as_str()) {
            Some(index) => index,
            None => {
                self.data.meshes.push(StoredMesh {
                    config: snapshot.mesh.clone(),
                    memberships: Vec::new(),
                    relay_offers: Vec::new(),
                    services: Vec::new(),
                    service_bindings: Vec::new(),
                });
                self.data.meshes.len() - 1
            }
        };

        {
            let mesh = &mut self.data.meshes[mesh_index];
            mesh.config.mesh_name = snapshot.mesh.mesh_name.clone();
            mesh.config.created_by_peer_id = snapshot.mesh.created_by_peer_id.clone();
            mesh.config.invite_ttl_secs = snapshot.mesh.invite_ttl_secs;

            for membership in &snapshot.memberships {
                if membership.mesh_id != snapshot.mesh.mesh_id {
                    continue;
                }
                let merged = ensure_membership(&mut mesh.memberships, membership.clone());
                merge_membership(merged, membership);
            }

            for offer in &snapshot.relay_offers {
                if offer.mesh_id != snapshot.mesh.mesh_id {
                    continue;
                }
                upsert_by_key(&mut mesh.relay_offers, offer.clone(), |item| {
                    item.relay_id.clone()
                });
            }

            for service in &snapshot.services {
                if service.mesh_id != snapshot.mesh.mesh_id {
                    continue;
                }
                upsert_by_key(&mut mesh.services, service.clone(), |item| {
                    item.service_id.clone()
                });
            }
        }

        for conversation in &snapshot.conversations {
            if conversation.mesh_id != snapshot.mesh.mesh_id {
                continue;
            }
            upsert_by_key(&mut self.data.conversations, conversation.clone(), |item| {
                item.conversation_id.clone()
            });
        }

        for message in &snapshot.messages {
            if message.mesh_id != snapshot.mesh.mesh_id {
                continue;
            }
            upsert_by_key(&mut self.data.messages, message.clone(), |item| {
                item.message_id.clone()
            });
        }

        self.persist()
    }

    pub fn import_conversation(
        &mut self,
        conversation: MessengerConversationRecord,
    ) -> Result<MessengerConversationRecord, ApiError> {
        if self.find_mesh(conversation.mesh_id.as_str()).is_none() {
            return Err(ApiError::new(ApiErrorCode::NotFound, "mesh not found"));
        }
        upsert_by_key(&mut self.data.conversations, conversation.clone(), |item| {
            item.conversation_id.clone()
        });
        self.persist()?;
        Ok(conversation)
    }

    pub fn import_message(
        &mut self,
        message: MessengerMessageRecord,
    ) -> Result<MessengerMessageRecord, ApiError> {
        if self.find_mesh(message.mesh_id.as_str()).is_none() {
            return Err(ApiError::new(ApiErrorCode::NotFound, "mesh not found"));
        }
        upsert_by_key(&mut self.data.messages, message.clone(), |item| {
            item.message_id.clone()
        });
        self.persist()?;
        Ok(message)
    }

    pub fn bind_app(&mut self, binding: AppAdapterBinding) -> Result<AppAdapterBinding, ApiError> {
        if self.find_mesh(binding.mesh_id.as_str()).is_none() {
            return Err(ApiError::new(ApiErrorCode::NotFound, "mesh not found"));
        }
        if binding.node_id != self.local_node_id() {
            return Err(ApiError::new(
                ApiErrorCode::Denied,
                "app bindings are local-only",
            ));
        }
        upsert_by_key(&mut self.data.app_bindings, binding.clone(), |item| {
            item.binding_id.clone()
        });
        self.persist()?;
        Ok(binding)
    }

    pub fn delete_app_binding(&mut self, binding_id: &str) -> Result<AppAdapterBinding, ApiError> {
        if let Some(index) = self
            .data
            .app_bindings
            .iter()
            .position(|binding| binding.binding_id == binding_id)
        {
            let binding = self.data.app_bindings.remove(index);
            self.persist()?;
            return Ok(binding);
        }
        Err(ApiError::new(
            ApiErrorCode::NotFound,
            "app binding not found",
        ))
    }

    pub fn app_bindings(&self) -> Vec<AppAdapterBinding> {
        self.data.app_bindings.clone()
    }

    pub fn next_app_binding(
        &mut self,
        mesh_id: &str,
        service_id: Option<String>,
        local_addr: Option<String>,
        tags: Vec<String>,
        metadata: BTreeMap<String, String>,
        now_unix_secs: u64,
    ) -> AppAdapterBinding {
        AppAdapterBinding {
            binding_id: self.next_id("app", mesh_id),
            app: AppAdapterKind::Rustdesk,
            mesh_id: mesh_id.to_string(),
            peer_id: self.local_peer_id().to_string(),
            node_id: self.local_node_id().to_string(),
            service_id,
            local_addr,
            tags: canonicalize_strings(tags),
            metadata,
            created_at_unix_secs: now_unix_secs,
        }
    }

    fn next_id(&mut self, prefix: &str, scope: &str) -> String {
        let nonce = self.data.next_nonce;
        self.data.next_nonce = self.data.next_nonce.saturating_add(1);
        format!(
            "{prefix}-{}",
            short_hash(format!("{scope}:{nonce}").as_bytes())
        )
    }

    fn find_mesh(&self, mesh_id: &str) -> Option<&StoredMesh> {
        self.data
            .meshes
            .iter()
            .find(|mesh| mesh.config.mesh_id == mesh_id)
    }

    fn find_mesh_mut(&mut self, mesh_id: &str) -> Option<&mut StoredMesh> {
        self.data
            .meshes
            .iter_mut()
            .find(|mesh| mesh.config.mesh_id == mesh_id)
    }

    fn find_mesh_index(&self, mesh_id: &str) -> Option<usize> {
        self.data
            .meshes
            .iter()
            .position(|mesh| mesh.config.mesh_id == mesh_id)
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

fn load_state(text: &str, now_unix_secs: u64) -> Result<ControlPlaneStoreFile, ApiError> {
    if text.trim().is_empty() {
        return Ok(ControlPlaneStoreFile::default());
    }
    if let Ok(data) = serde_json::from_str::<ControlPlaneStoreFile>(text) {
        return Ok(data);
    }
    if let Ok(legacy) = serde_json::from_str::<LegacyNamespaceStoreFile>(text) {
        return Ok(migrate_legacy_store(legacy, now_unix_secs));
    }
    Err(ApiError::new(
        ApiErrorCode::Internal,
        "failed to parse state file",
    ))
}

fn migrate_legacy_store(
    legacy: LegacyNamespaceStoreFile,
    now_unix_secs: u64,
) -> ControlPlaneStoreFile {
    let local_identity = new_local_identity("legacy", now_unix_secs, u64::from(legacy.version));
    let meshes = legacy
        .namespaces
        .into_iter()
        .map(|record| {
            let membership = MeshMembership {
                mesh_id: record.namespace_id.clone(),
                peer_id: local_identity.root_identity_id.clone(),
                device_id: local_identity.device_identity_id.clone(),
                node_id: local_identity.node_id.clone(),
                root_identity_id: local_identity.root_identity_id.clone(),
                roles: vec![NodeRole::Edge],
                trust: TrustPolicy::Allow,
                joined_at_unix_secs: record.joined_at_unix_secs,
                revoked_at_unix_secs: None,
                membership_signature: membership_signature(
                    record.namespace_id.as_str(),
                    local_identity.root_identity_id.as_str(),
                    local_identity.node_id.as_str(),
                    &[NodeRole::Edge],
                    TrustPolicy::Allow,
                    record.joined_at_unix_secs,
                ),
            };
            StoredMesh {
                config: MeshConfig {
                    mesh_id: record.namespace_id.clone(),
                    mesh_name: format!("mesh-{}", &record.namespace_id[..8]),
                    created_by_peer_id: local_identity.root_identity_id.clone(),
                    local_root_identity_id: local_identity.root_identity_id.clone(),
                    local_device_id: local_identity.device_identity_id.clone(),
                    local_node_id: local_identity.node_id.clone(),
                    invite_ttl_secs: DEFAULT_INVITE_TTL_SECS,
                    created_at_unix_secs: record.joined_at_unix_secs,
                },
                memberships: vec![membership],
                relay_offers: Vec::new(),
                services: Vec::new(),
                service_bindings: Vec::new(),
            }
        })
        .collect();
    ControlPlaneStoreFile {
        version: STORE_VERSION,
        local_identity,
        meshes,
        route_policies: Vec::new(),
        decision_logs: Vec::new(),
        conversations: Vec::new(),
        messages: Vec::new(),
        app_bindings: Vec::new(),
        next_nonce: 1,
    }
}

fn new_local_identity(scope: &str, now_unix_secs: u64, salt: u64) -> LocalIdentityRecord {
    LocalIdentityRecord {
        root_identity_id: stable_hex_id("root", scope, now_unix_secs, salt),
        device_identity_id: stable_hex_id("device", scope, now_unix_secs, salt.rotate_left(7)),
        node_id: stable_hex_id("node", scope, now_unix_secs, salt.rotate_left(13)),
        created_at_unix_secs: now_unix_secs,
    }
}

fn stable_hex_id(prefix: &str, scope: &str, now_unix_secs: u64, salt: u64) -> String {
    short_hash(format!("{prefix}:{scope}:{now_unix_secs}:{salt}").as_bytes())
}

fn membership_signature(
    mesh_id: &str,
    peer_id: &str,
    node_id: &str,
    roles: &[NodeRole],
    trust: TrustPolicy,
    now_unix_secs: u64,
) -> String {
    let material = format!("{mesh_id}:{peer_id}:{node_id}:{roles:?}:{trust:?}:{now_unix_secs}");
    short_hash(material.as_bytes())
}

fn build_membership(
    mesh_id: &str,
    peer_id: &str,
    device_id: &str,
    node_id: &str,
    roles: Vec<NodeRole>,
    trust: TrustPolicy,
    now_unix_secs: u64,
) -> MeshMembership {
    let roles = canonicalize_roles(roles);
    MeshMembership {
        mesh_id: mesh_id.to_string(),
        peer_id: peer_id.to_string(),
        device_id: device_id.to_string(),
        node_id: node_id.to_string(),
        root_identity_id: peer_id.to_string(),
        roles: roles.clone(),
        trust,
        joined_at_unix_secs: now_unix_secs,
        revoked_at_unix_secs: None,
        membership_signature: membership_signature(
            mesh_id,
            peer_id,
            node_id,
            roles.as_slice(),
            trust,
            now_unix_secs,
        ),
    }
}

fn to_peer_status(
    mesh_id: &str,
    membership: &MeshMembership,
    relay_advertised: bool,
) -> PeerStatus {
    PeerStatus {
        mesh_id: mesh_id.to_string(),
        peer_id: membership.peer_id.clone(),
        node_id: membership.node_id.clone(),
        roles: membership.roles.clone(),
        trust: membership.trust,
        online: membership.trust == TrustPolicy::Allow,
        direct_path_allowed: membership.trust == TrustPolicy::Allow,
        managed_relay_allowed: relay_advertised,
        last_seen_unix_secs: membership.joined_at_unix_secs,
    }
}

fn relay_offer_path(offer: &RelayOffer) -> RoutePath {
    if offer.managed {
        RoutePath::ManagedRelay
    } else {
        RoutePath::PeerRelay
    }
}

fn route_policy_key(policy: &PreferredRoutePolicy) -> String {
    format!(
        "{}:{:?}:{}",
        policy.mesh_id, policy.target_kind, policy.target_id
    )
}

fn short_hash(bytes: &[u8]) -> String {
    let digest = simple_hash32(bytes);
    let mut out = String::with_capacity(32);
    for byte in &digest[..16] {
        let _ = write!(&mut out, "{byte:02x}");
    }
    out
}

fn ensure_membership(
    memberships: &mut Vec<MeshMembership>,
    membership: MeshMembership,
) -> &mut MeshMembership {
    if let Some(index) = memberships
        .iter()
        .position(|existing| existing.peer_id == membership.peer_id)
    {
        let existing = &mut memberships[index];
        if existing.trust == TrustPolicy::Deny {
            existing.trust = TrustPolicy::Allow;
            existing.revoked_at_unix_secs = None;
        }
        if existing.device_id.trim().is_empty() {
            existing.device_id = membership.device_id.clone();
        }
        existing.node_id = membership.node_id.clone();
        existing.roles = canonicalize_roles(
            existing
                .roles
                .iter()
                .copied()
                .chain(membership.roles.iter().copied())
                .collect(),
        );
        return existing;
    }
    memberships.push(membership);
    let index = memberships.len() - 1;
    &mut memberships[index]
}

fn merge_membership(existing: &mut MeshMembership, incoming: &MeshMembership) {
    existing.device_id = incoming.device_id.clone();
    existing.node_id = incoming.node_id.clone();
    existing.root_identity_id = incoming.root_identity_id.clone();
    existing.roles = canonicalize_roles(incoming.roles.clone());
    if incoming.trust == TrustPolicy::Deny || existing.trust != TrustPolicy::Deny {
        existing.trust = incoming.trust;
    }
    existing.joined_at_unix_secs = existing
        .joined_at_unix_secs
        .min(incoming.joined_at_unix_secs);
    existing.revoked_at_unix_secs =
        match (existing.revoked_at_unix_secs, incoming.revoked_at_unix_secs) {
            (Some(left), Some(right)) => Some(left.max(right)),
            (None, value) | (value, None) => value,
        };
    existing.membership_signature = incoming.membership_signature.clone();
}

fn upsert_by_key<T, F>(values: &mut Vec<T>, value: T, key: F)
where
    T: Clone,
    F: Fn(&T) -> String,
{
    let lookup = key(&value);
    if let Some(existing) = values.iter_mut().find(|item| key(item) == lookup) {
        *existing = value;
    } else {
        values.push(value);
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

    use fabric_service::{DecisionTargetKind, RoutingMode};

    use super::{ControlPlaneStore, RouteDecisionInput};
    use crate::invite::parse_invite;

    fn temp_state_path(name: &str) -> PathBuf {
        let now_ns = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time must be valid")
            .as_nanos();
        std::env::temp_dir().join(format!("animus-link-tests/{name}-{now_ns}/control.json"))
    }

    #[test]
    fn mesh_lifecycle_roundtrips_with_inviter_metadata() {
        let path = temp_state_path("mesh-lifecycle");
        let now = 1_700_000_000;
        let mut creator = ControlPlaneStore::load_or_create(&path, now).expect("store");
        let mesh = creator
            .create_mesh(Some("lab".to_string()), now)
            .expect("create mesh");
        let invite = creator
            .create_mesh_invite(mesh.mesh_id.as_str(), now)
            .expect("create invite");
        let parsed = parse_invite(invite.to_string_repr().as_str(), now + 1).expect("parse invite");
        assert_eq!(parsed.mesh_id, mesh.mesh_id);
        assert!(parsed.issuer_peer_id.is_some());

        let join_path = temp_state_path("mesh-join");
        let mut joiner = ControlPlaneStore::load_or_create(&join_path, now).expect("joiner");
        let joined = joiner.join_mesh(&parsed, now + 2).expect("join");
        assert_eq!(joined.mesh.mesh_id, mesh.mesh_id);
        assert!(joined.inviter.is_some());
        assert_eq!(
            joiner.list_mesh_peers(mesh.mesh_id.as_str()).unwrap().len(),
            2
        );
    }

    #[test]
    fn role_and_relay_policy_changes_are_persisted() {
        let path = temp_state_path("role-policy");
        let now = 1_700_000_000;
        let mut store = ControlPlaneStore::load_or_create(&path, now).expect("store");
        let mesh = store.create_mesh(None, now).expect("mesh");
        let local_node_id = store.local_node_id().to_string();
        let membership = store
            .set_node_roles(
                mesh.mesh_id.as_str(),
                local_node_id.as_str(),
                vec![
                    fabric_service::NodeRole::Relay,
                    fabric_service::NodeRole::Gateway,
                ],
                now + 1,
            )
            .expect("set roles");
        assert!(membership.roles.contains(&fabric_service::NodeRole::Relay));
        let offer = store
            .advertise_relay(
                mesh.mesh_id.as_str(),
                None,
                false,
                false,
                vec!["home".to_string()],
                now + 2,
            )
            .expect("advertise relay");
        let policy = store
            .select_route_policy(fabric_service::PreferredRoutePolicy {
                mesh_id: mesh.mesh_id.clone(),
                target_kind: DecisionTargetKind::Service,
                target_id: "db".to_string(),
                mode: RoutingMode::ForcedRelay,
                preferred_relay_node_id: Some(offer.node_id.clone()),
                fallback_relay_node_id: None,
                allow_managed_relay: false,
            })
            .expect("select policy");
        let route = store
            .decide_route(
                RouteDecisionInput {
                    mesh_id: mesh.mesh_id.clone(),
                    target_kind: DecisionTargetKind::Service,
                    target_id: "db".to_string(),
                    direct_candidate: false,
                    managed_relay_available: false,
                },
                now + 3,
            )
            .expect("decide route");
        assert_eq!(route.mode, policy.mode);
        assert_eq!(route.selected_relay_node_id, policy.preferred_relay_node_id);
        assert_eq!(store.decision_logs().len(), 1);
    }

    #[test]
    fn revoked_peer_cannot_keep_service_acl_access() {
        let path = temp_state_path("service-acl");
        let now = 1_700_000_000;
        let mut store = ControlPlaneStore::load_or_create(&path, now).expect("store");
        let mesh = store.create_mesh(None, now).expect("mesh");
        let invite = store
            .create_mesh_invite(mesh.mesh_id.as_str(), now)
            .expect("invite");
        let parsed = parse_invite(invite.to_string_repr().as_str(), now + 1).expect("parse");
        let peer_path = temp_state_path("service-acl-peer");
        let mut peer = ControlPlaneStore::load_or_create(&peer_path, now).expect("peer");
        let join = peer.join_mesh(&parsed, now + 2).expect("join");
        let peer_id = join.membership.peer_id.clone();
        let peer_invite = peer
            .create_mesh_invite(mesh.mesh_id.as_str(), now + 3)
            .expect("peer invite");
        let peer_invite = parse_invite(peer_invite.to_string_repr().as_str(), now + 4)
            .expect("parse peer invite");

        store
            .join_mesh(&peer_invite, now + 5)
            .expect("creator learns about joined peer");
        let service = store
            .register_service(
                mesh.mesh_id.as_str(),
                "db",
                "127.0.0.1:5432",
                vec![peer_id.clone()],
                vec!["prod".to_string()],
                None,
                now + 6,
            )
            .expect("service");
        assert_eq!(service.allowed_peers, vec![peer_id.clone()]);
        store
            .revoke_peer(mesh.mesh_id.as_str(), peer_id.as_str(), now + 7)
            .expect("revoke");
        assert!(store
            .list_mesh_peers(mesh.mesh_id.as_str())
            .expect("peers")
            .iter()
            .any(|status| status.peer_id == peer_id
                && status.trust == fabric_service::TrustPolicy::Deny));
    }
}
