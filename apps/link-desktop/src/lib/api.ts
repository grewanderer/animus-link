import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  ConnectResponse,
  ConnectServiceRequest,
  ConversationListResponse,
  CreateConversationRequest,
  CreateMeshRequest,
  DiagnosticsResponse,
  ExposeServiceRequest,
  HealthResponse,
  JoinMeshRequest,
  MeshJoinResult,
  MeshListResponse,
  MeshPeersResponse,
  MessengerMessageRecord,
  MessengerStreamView,
  NodeRoleSummary,
  RelayAdvertiseRequest,
  RelayClearSelectionRequest,
  RelaySelectRequest,
  RelayStatusView,
  RoutingDecisionLogResponse,
  RoutingStatusView,
  SendMessageRequest,
  SelfCheckResponse,
  ServicesListResponse,
  SetNodeRolesRequest,
  StatusResponse,
} from "./types";

export class DaemonApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function buildUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function parseResponse<T>(response: Response): Promise<T> {
  const raw = (await response.json()) as ApiEnvelope<T> | T | ApiErrorEnvelope;
  if (!response.ok) {
    const error = raw as ApiErrorEnvelope;
    throw new DaemonApiError(
      error.error?.message ?? "daemon request failed",
      error.error?.code ?? "unknown",
      response.status,
    );
  }
  if (typeof raw === "object" && raw !== null && "body" in raw) {
    return (raw as ApiEnvelope<T>).body;
  }
  return raw as T;
}

async function request<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await tauriFetch(buildUrl(baseUrl, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    connectTimeout: 5,
  });
  return parseResponse<T>(response as unknown as Response);
}

export class DaemonApiClient {
  constructor(private readonly baseUrl: string) {}

  health() {
    return request<HealthResponse>(this.baseUrl, "/v1/health");
  }

  status() {
    return request<StatusResponse>(this.baseUrl, "/v1/status");
  }

  selfCheck() {
    return request<SelfCheckResponse>(this.baseUrl, "/v1/self_check");
  }

  diagnostics() {
    return request<DiagnosticsResponse>(this.baseUrl, "/v1/diagnostics");
  }

  meshes() {
    return request<MeshListResponse>(this.baseUrl, "/v1/meshes");
  }

  createMesh(input: CreateMeshRequest) {
    return request<{ mesh: import("./types").MeshConfig }>(this.baseUrl, "/v1/meshes", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  createInvite(meshId: string) {
    return request<{ invite: string }>(this.baseUrl, `/v1/meshes/${meshId}/invite`, {
      method: "POST",
      body: "",
    });
  }

  joinMesh(input: JoinMeshRequest) {
    return request<MeshJoinResult>(this.baseUrl, "/v1/meshes/join", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  peers(meshId: string) {
    return request<MeshPeersResponse>(this.baseUrl, `/v1/meshes/${meshId}/peers`);
  }

  revokePeer(meshId: string, peerId: string) {
    return request<{ revoked: boolean }>(this.baseUrl, `/v1/meshes/${meshId}/peers/${peerId}/revoke`, {
      method: "POST",
      body: "",
    });
  }

  nodeRoles(nodeId: string) {
    return request<NodeRoleSummary>(this.baseUrl, `/v1/nodes/${nodeId}/roles`);
  }

  setNodeRoles(nodeId: string, input: SetNodeRolesRequest) {
    return request<NodeRoleSummary>(this.baseUrl, `/v1/nodes/${nodeId}/roles`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  relayStatus() {
    return request<RelayStatusView>(this.baseUrl, "/v1/relays/status");
  }

  advertiseRelay(input: RelayAdvertiseRequest) {
    return request<Record<string, unknown>>(this.baseUrl, "/v1/relays/advertise", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  selectRelay(input: RelaySelectRequest) {
    return request<Record<string, unknown>>(this.baseUrl, "/v1/relays/select", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  clearRelaySelection(input: RelayClearSelectionRequest) {
    return request<{ cleared: boolean }>(
      this.baseUrl,
      "/v1/relays/clear-selection",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  routingStatus() {
    return request<RoutingStatusView>(this.baseUrl, "/v1/routing/status");
  }

  routingDecisionLog() {
    return request<RoutingDecisionLogResponse>(
      this.baseUrl,
      "/v1/routing/decision-log",
    );
  }

  services() {
    return request<ServicesListResponse>(this.baseUrl, "/v1/services");
  }

  exposeService(input: ExposeServiceRequest) {
    return request<Record<string, unknown>>(this.baseUrl, "/v1/services/expose", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  connectService(input: ConnectServiceRequest) {
    return request<ConnectResponse>(this.baseUrl, "/v1/services/connect", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  deleteService(serviceId: string) {
    return request<Record<string, unknown>>(this.baseUrl, `/v1/services/${serviceId}`, {
      method: "DELETE",
    });
  }

  conversations() {
    return request<ConversationListResponse>(this.baseUrl, "/v1/messenger/conversations");
  }

  createConversation(input: CreateConversationRequest) {
    return request<Record<string, unknown>>(this.baseUrl, "/v1/messenger/conversations", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  stream() {
    return request<MessengerStreamView>(this.baseUrl, "/v1/messenger/stream");
  }

  presence() {
    return request<MeshPeersResponse>(this.baseUrl, "/v1/messenger/presence");
  }

  sendMessage(input: SendMessageRequest) {
    return request<MessengerMessageRecord>(this.baseUrl, "/v1/messenger/send", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
