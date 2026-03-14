export type TrustPolicy = "allow" | "deny" | "pending";
export type NodeRole = "edge" | "relay" | "gateway" | "service_host";
export type RoutingMode = "direct_first_relay_second" | "forced_relay";
export type RoutePath = "direct" | "peer_relay" | "managed_relay";
export type DecisionTargetKind =
  | "peer"
  | "service"
  | "conversation"
  | "adapter";
export type ServiceBindingState = "planned" | "active" | "closed";

export interface ApiEnvelope<T> {
  api_version?: string;
  body: T;
}

export interface ApiErrorEnvelope {
  api_version?: string;
  error: {
    code: string;
    message: string;
  };
}

export interface MeshConfig {
  mesh_id: string;
  mesh_name: string;
  created_by_peer_id: string;
  local_root_identity_id: string;
  local_device_id: string;
  local_node_id: string;
  invite_ttl_secs: number;
  created_at_unix_secs: number;
}

export interface MeshView {
  config: MeshConfig;
  peer_count: number;
  relay_count: number;
  service_count: number;
}

export interface MeshMembership {
  mesh_id: string;
  peer_id: string;
  device_id: string;
  node_id: string;
  root_identity_id: string;
  roles: NodeRole[];
  trust: TrustPolicy;
  joined_at_unix_secs: number;
  revoked_at_unix_secs?: number | null;
  membership_signature: string;
}

export interface PeerStatus {
  mesh_id: string;
  peer_id: string;
  node_id: string;
  roles: NodeRole[];
  trust: TrustPolicy;
  online: boolean;
  direct_path_allowed: boolean;
  managed_relay_allowed: boolean;
  last_seen_unix_secs: number;
}

export interface RelayOffer {
  relay_id: string;
  mesh_id: string;
  peer_id: string;
  node_id: string;
  managed: boolean;
  forced_only: boolean;
  tags: string[];
  advertised_at_unix_secs: number;
}

export interface PreferredRoutePolicy {
  mesh_id: string;
  target_kind: DecisionTargetKind;
  target_id: string;
  mode: RoutingMode;
  preferred_relay_node_id?: string | null;
  fallback_relay_node_id?: string | null;
  allow_managed_relay: boolean;
}

export interface DecisionLog {
  decision_id: string;
  mesh_id: string;
  target_kind: DecisionTargetKind;
  target_id: string;
  mode: RoutingMode;
  chosen_path: RoutePath;
  selected_relay_node_id?: string | null;
  fallback_relay_node_id?: string | null;
  managed_relay_allowed: boolean;
  reason: string;
  recorded_at_unix_secs: number;
}

export interface ServiceDescriptor {
  service_id: string;
  mesh_id: string;
  service_name: string;
  owner_peer_id: string;
  owner_node_id: string;
  local_addr: string;
  protocol: string;
  tags: string[];
  allowed_peers: string[];
  trust: TrustPolicy;
  app_protocol?: string | null;
  published_at_unix_secs: number;
}

export interface ServiceBinding {
  binding_id: string;
  mesh_id: string;
  service_id?: string | null;
  service_name: string;
  consumer_peer_id: string;
  consumer_node_id: string;
  local_listener?: string | null;
  route_mode: RoutingMode;
  selected_relay_node_id?: string | null;
  state: ServiceBindingState;
  created_at_unix_secs: number;
}

export interface ServicesListResponse {
  services: ServiceDescriptor[];
  bindings: ServiceBinding[];
}

export interface NodeRoleAssignment {
  mesh_id: string;
  node_id: string;
  roles: NodeRole[];
}

export interface NodeRoleSummary {
  node_id: string;
  assignments: NodeRoleAssignment[];
}

export interface RelayStatusView {
  managed_relay_configured: boolean;
  offers: RelayOffer[];
  selections: PreferredRoutePolicy[];
}

export interface ActiveConnectionView {
  connection_id: number;
  mesh_id: string;
  target_kind: DecisionTargetKind;
  target_id: string;
  peer_id: string;
  route_path: RoutePath;
  selected_relay_node_id?: string | null;
  opened_at_unix_secs: number;
}

export interface PeerEndpointView {
  mesh_id: string;
  peer_id: string;
  node_id: string;
  api_url: string;
  runtime_addr: string;
  last_seen_unix_secs: number;
}

export interface RoutingStatusView {
  managed_relay_configured: boolean;
  policies: PreferredRoutePolicy[];
  latest_decisions: DecisionLog[];
  active_connections: ActiveConnectionView[];
  peer_endpoints: PeerEndpointView[];
}

export interface ConnectResponse {
  connection_id: number;
  stream_id: number;
  local_addr?: string | null;
  binding_id?: string | null;
  route_path?: RoutePath | null;
  selected_relay_node_id?: string | null;
}

export interface MeshJoinResult {
  mesh: MeshConfig;
  membership: MeshMembership;
  inviter?: PeerStatus | null;
}

export interface MessengerConversationRecord {
  conversation_id: string;
  mesh_id: string;
  participants: string[];
  title?: string | null;
  tags: string[];
  created_at_unix_secs: number;
}

export interface MessengerMessageRecord {
  message_id: string;
  mesh_id: string;
  conversation_id: string;
  sender_peer_id: string;
  body: string;
  attachment_service_id?: string | null;
  control_stream: boolean;
  decision_id?: string | null;
  sent_at_unix_secs: number;
}

export interface MessengerStreamView {
  conversations: MessengerConversationRecord[];
  messages: MessengerMessageRecord[];
}

export interface MeshPeersResponse {
  mesh_id: string;
  peers: PeerStatus[];
}

export interface MeshListResponse {
  meshes: MeshView[];
}

export interface ConversationListResponse {
  conversations: MessengerConversationRecord[];
}

export interface RoutingDecisionLogResponse {
  decisions: DecisionLog[];
}

export interface HealthResponse {
  ok: boolean;
  relay_configured: boolean;
}

export interface StatusResponse {
  running: boolean;
  peer_count: number;
  path: string;
}

export interface RuntimeCapabilitiesInfo {
  tun_device_present: boolean;
  has_cap_net_admin: boolean;
  has_cap_bind_service: boolean;
}

export interface SelfCheckItem {
  name: string;
  ok: boolean;
  code: string;
  detail_safe: string;
}

export interface SelfCheckResponse {
  api_version: string;
  ok: boolean;
  dns_mode: string;
  runtime_capabilities: RuntimeCapabilitiesInfo;
  checks: SelfCheckItem[];
}

export interface DiagnosticsCounters {
  connect_attempts_total: number;
  connect_success_total: number;
  connect_fail_total: number;
  expose_attempts_total: number;
  expose_denied_total: number;
  handshake_failures_total: number;
  relay_reachable: number;
  stream_open_total: number;
  bytes_proxied_total: number;
  gateway_packets_in_total: number;
  gateway_packets_out_total: number;
  gateway_sessions_active: number;
  gateway_sessions_evicted_total: number;
  gateway_drops_malformed_total: number;
  gateway_drops_quota_total: number;
  tunnel_enabled: number;
  tunnel_connected: number;
  tunnel_reconnects_total: number;
  tunnel_bytes_in_total: number;
  tunnel_bytes_out_total: number;
  prewarm_ready_gauge: number;
  prewarm_attempts_total: number;
  prewarm_fail_total: number;
  dns_queries_total: number;
  dns_timeouts_total: number;
  dns_failures_total: number;
}

export interface DiagnosticsResponse {
  api_version: string;
  uptime_secs: number;
  config_summary: {
    relay_configured: boolean;
    relay_name?: string | null;
    token_issuer_configured: boolean;
    namespace_count: number;
    mobile_policy: string;
  };
  counters: DiagnosticsCounters;
  recent_errors: Array<{ code: string; count: number; last_unix: number }>;
  notes: string[];
}

export interface CreateMeshRequest {
  mesh_name?: string;
}

export interface JoinMeshRequest {
  invite: string;
  bootstrap_url: string;
}

export interface SetNodeRolesRequest {
  mesh_id: string;
  roles: NodeRole[];
}

export interface RelayAdvertiseRequest {
  mesh_id: string;
  forced_only?: boolean;
  tags?: string[];
}

export interface RelaySelectRequest {
  mesh_id: string;
  target_kind: DecisionTargetKind;
  target_id: string;
  relay_node_id: string;
  forced?: boolean;
}

export interface RelayClearSelectionRequest {
  mesh_id: string;
  target_kind: DecisionTargetKind;
  target_id: string;
}

export interface ExposeServiceRequest {
  mesh_id: string;
  service_name: string;
  local_addr: string;
  allowed_peers: string[];
  tags?: string[];
}

export interface ConnectServiceRequest {
  mesh_id: string;
  service_id?: string;
  service_name?: string;
  local_listener?: string;
}

export interface CreateConversationRequest {
  mesh_id: string;
  participants: string[];
  title?: string;
  tags?: string[];
}

export interface SendMessageRequest {
  conversation_id: string;
  body: string;
}
