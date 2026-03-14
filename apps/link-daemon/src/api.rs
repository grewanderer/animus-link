use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use serde::Serialize;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::{oneshot, Mutex},
};

use crate::{
    daemon::{
        AppRustdeskBindRequest, ConnectPlan, ConnectRequest, ExposeRequest, GatewayExposeRequest,
        InviteJoinRequest, LinkDaemon, MeshCreateRequest, MeshJoinApiRequest,
        MeshScopedServiceConnectRequest, MeshScopedServiceExposeRequest,
        MessengerConversationCreateRequest, MessengerSendRequest, NodeRolesRequest,
        RelayAdvertiseRequest, RelayClearSelectionRequest, RelayConfig, RelaySelectRequest,
        TunnelEnableRequest,
    },
    diagnostics::{build_diagnostics, run_self_check},
    errors::{error_envelope, ApiEnvelope, ApiError, ApiErrorCode},
    relay_token::{
        RelayTokenIssuer, RelayTokenIssuerConfig, DEFAULT_SIGNING_KEY_ID, DEFAULT_TOKEN_TTL_SECS,
    },
};

const MAX_REQUEST_BYTES: usize = 64 * 1024;
const MAX_BODY_BYTES: usize = 32 * 1024;

#[derive(Debug, Clone)]
pub struct ApiServerConfig {
    pub api_bind: SocketAddr,
    pub state_file: PathBuf,
    pub relay_addr: Option<SocketAddr>,
    pub relay_name: String,
    pub relay_token_signing_key_id: String,
    pub relay_token_signing_seed_hex: Option<String>,
    pub relay_token_signing_key_file: Option<PathBuf>,
    pub relay_token_ttl_secs: u32,
}

impl ApiServerConfig {
    pub fn token_issuer_configured(&self) -> bool {
        !self.relay_token_signing_key_id.trim().is_empty()
            || self
                .relay_token_signing_seed_hex
                .as_deref()
                .is_some_and(|seed| !seed.trim().is_empty())
            || self.relay_token_signing_key_file.is_some()
    }

    pub fn relay_config(&self) -> Result<Option<RelayConfig>, ApiError> {
        self.relay_addr
            .as_ref()
            .map(|relay_addr| {
                let issuer = RelayTokenIssuer::load_or_create(RelayTokenIssuerConfig {
                    signing_key_id: if self.relay_token_signing_key_id.is_empty() {
                        DEFAULT_SIGNING_KEY_ID.to_string()
                    } else {
                        self.relay_token_signing_key_id.clone()
                    },
                    signing_key_file: self
                        .relay_token_signing_key_file
                        .clone()
                        .unwrap_or_else(|| default_signing_key_file(self.state_file.as_path())),
                    signing_seed_hex: self.relay_token_signing_seed_hex.clone(),
                    default_ttl_secs: if self.relay_token_ttl_secs == 0 {
                        DEFAULT_TOKEN_TTL_SECS
                    } else {
                        self.relay_token_ttl_secs
                    },
                })?;
                Ok(RelayConfig {
                    relay_addr: *relay_addr,
                    relay_name: self.relay_name.clone(),
                    token_ttl_secs: self.relay_token_ttl_secs.max(1),
                    token_issuer: Arc::new(issuer),
                })
            })
            .transpose()
    }
}

fn default_signing_key_file(state_file: &Path) -> PathBuf {
    state_file.with_extension("relay-token-key.hex")
}

#[derive(Debug)]
struct HttpRequest {
    method: String,
    path: String,
    body: Vec<u8>,
}

#[derive(Debug)]
struct HttpResponse {
    status_code: u16,
    content_type: &'static str,
    body: Vec<u8>,
}

pub async fn run_api_server(config: ApiServerConfig) -> anyhow::Result<()> {
    let listener = TcpListener::bind(config.api_bind).await?;
    run_api_server_with_listener(listener, config, None).await
}

pub async fn run_api_server_with_listener(
    listener: TcpListener,
    config: ApiServerConfig,
    mut shutdown: Option<oneshot::Receiver<()>>,
) -> anyhow::Result<()> {
    let mut state = LinkDaemon::new(config.state_file.as_path(), config.relay_config()?)?;
    let bound_addr = listener.local_addr().unwrap_or(config.api_bind);
    state.configure_runtime(bound_addr, config.token_issuer_configured());
    let state = Arc::new(Mutex::new(state));

    loop {
        let accept_result = if let Some(shutdown_rx) = shutdown.as_mut() {
            tokio::select! {
                _ = shutdown_rx => {
                    break;
                }
                accept_result = listener.accept() => accept_result,
            }
        } else {
            listener.accept().await
        };

        let (stream, _peer) = accept_result?;
        let state = Arc::clone(&state);
        tokio::spawn(async move {
            let _ = handle_connection(stream, state).await;
        });
    }

    Ok(())
}

async fn handle_connection(
    mut stream: TcpStream,
    state: Arc<Mutex<LinkDaemon>>,
) -> Result<(), ApiError> {
    let request = read_request(&mut stream).await?;
    let response = route_request(state, request).await;
    write_response(&mut stream, response).await?;
    Ok(())
}

async fn route_request(state: Arc<Mutex<LinkDaemon>>, request: HttpRequest) -> HttpResponse {
    let segments = path_segments(request.path.as_str());
    let response = match (request.method.as_str(), segments.as_slice()) {
        ("GET", ["v1", "health"]) => {
            let state = state.lock().await;
            ok_json(state.health())
        }
        ("GET", ["v1", "self_check"]) => {
            let inputs = {
                let mut state = state.lock().await;
                state.self_check_inputs()
            };
            let result = run_self_check(inputs).await;
            if !result.ok {
                let mut state = state.lock().await;
                for check in &result.checks {
                    if !check.ok {
                        state.record_error_code(check.code.as_str());
                    }
                }
            }
            ok_json_raw(result)
        }
        ("GET", ["v1", "diagnostics"]) => {
            let response = {
                let mut state = state.lock().await;
                build_diagnostics(state.diagnostics_input())
            };
            ok_json_raw(response)
        }
        ("GET", ["v1", "metrics"]) => {
            let mut state = state.lock().await;
            text_response(200, state.metrics())
        }
        ("GET", ["v1", "status"]) => {
            let mut state = state.lock().await;
            ok_json(state.status())
        }
        ("GET", ["v1", "tunnel", "status"]) => {
            let mut state = state.lock().await;
            ok_json(state.tunnel_status())
        }
        ("POST", ["v1", "invite", "create"]) => {
            let mut state = state.lock().await;
            match state.invite_create() {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("POST", ["v1", "invite", "join"]) => {
            let parsed: Result<InviteJoinRequest, ApiError> = parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.invite_join(body)) {
                Ok(()) => ok_json(serde_json::json!({ "joined": true })),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("POST", ["v1", "meshes"]) => {
            let parsed: Result<MeshCreateRequest, ApiError> = parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.mesh_create(body)) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("GET", ["v1", "meshes"]) => {
            let state = state.lock().await;
            ok_json(state.meshes())
        }
        ("POST", ["v1", "meshes", "join"]) => {
            let parsed: Result<MeshJoinApiRequest, ApiError> = parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.mesh_join(body)) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("POST", ["v1", "meshes", mesh_id, "invite"]) => {
            let mut state = state.lock().await;
            match state.mesh_invite(mesh_id) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("GET", ["v1", "meshes", mesh_id, "peers"]) => {
            let state = state.lock().await;
            match state.mesh_peers(mesh_id) {
                Ok(body) => ok_json(body),
                Err(error) => error_json(error),
            }
        }
        ("POST", ["v1", "meshes", mesh_id, "peers", peer_id, "revoke"]) => {
            let mut state = state.lock().await;
            match state.revoke_mesh_peer(mesh_id, peer_id) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("POST", ["v1", "nodes", node_id, "roles"]) => {
            let parsed: Result<NodeRolesRequest, ApiError> = parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.set_node_roles(node_id, body)) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("GET", ["v1", "nodes", node_id, "roles"]) => {
            let state = state.lock().await;
            match state.node_roles(node_id) {
                Ok(body) => ok_json(body),
                Err(error) => error_json(error),
            }
        }
        ("POST", ["v1", "relays", "advertise"]) => {
            let parsed: Result<RelayAdvertiseRequest, ApiError> = parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.advertise_relay(body)) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("POST", ["v1", "relays", "select"]) => {
            let parsed: Result<RelaySelectRequest, ApiError> = parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.select_relay(body)) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("POST", ["v1", "relays", "clear-selection"]) => {
            let parsed: Result<RelayClearSelectionRequest, ApiError> =
                parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.clear_relay_selection(body)) {
                Ok(()) => ok_json(serde_json::json!({ "cleared": true })),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("GET", ["v1", "relays", "status"]) => {
            let state = state.lock().await;
            ok_json(state.relay_status())
        }
        ("POST", ["v1", "expose"]) => {
            state.lock().await.metrics_handle().inc_expose_attempts();
            let parsed: Result<ExposeRequest, ApiError> = parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.expose(body)) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    if error.code == ApiErrorCode::Denied {
                        state.metrics_handle().inc_expose_denied();
                    }
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("POST", ["v1", "services", "expose"]) => {
            state.lock().await.metrics_handle().inc_expose_attempts();
            let parsed: Result<MeshScopedServiceExposeRequest, ApiError> =
                parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.expose_service(body)) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    if error.code == ApiErrorCode::Denied {
                        state.metrics_handle().inc_expose_denied();
                    }
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("GET", ["v1", "services"]) => {
            let state = state.lock().await;
            ok_json(state.services_list(None))
        }
        ("DELETE", ["v1", "services", service_id]) => {
            let mut state = state.lock().await;
            match state.delete_service(service_id) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("POST", ["v1", "gateway", "expose"]) => {
            let parsed: Result<GatewayExposeRequest, ApiError> = parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.gateway_expose(body)) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    if error.code == ApiErrorCode::Denied {
                        state.metrics_handle().inc_expose_denied();
                    }
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("POST", ["v1", "tunnel", "enable"]) => {
            let parsed: Result<TunnelEnableRequest, ApiError> = parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.tunnel_enable(body)) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("POST", ["v1", "tunnel", "disable"]) => {
            let mut state = state.lock().await;
            ok_json(state.tunnel_disable())
        }
        ("POST", ["v1", "connect"]) => {
            state.lock().await.metrics_handle().inc_connect_attempts();
            let parsed: Result<ConnectRequest, ApiError> = parse_json_body(&request.body);
            let plan_result: Result<ConnectPlan, ApiError> = {
                let mut state = state.lock().await;
                parsed.and_then(|body| state.connect(body))
            };

            match plan_result {
                Ok(plan) => ok_json(plan.response),
                Err(error) => {
                    let mut state = state.lock().await;
                    state.metrics_handle().inc_connect_fail();
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("POST", ["v1", "services", "connect"]) => {
            state.lock().await.metrics_handle().inc_connect_attempts();
            let parsed: Result<MeshScopedServiceConnectRequest, ApiError> =
                parse_json_body(&request.body);
            let plan_result: Result<ConnectPlan, ApiError> = {
                let mut state = state.lock().await;
                parsed.and_then(|body| state.connect_service(body))
            };

            match plan_result {
                Ok(plan) => ok_json(plan.response),
                Err(error) => {
                    let mut state = state.lock().await;
                    state.metrics_handle().inc_connect_fail();
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("GET", ["v1", "routing", "decision-log"]) => {
            let state = state.lock().await;
            ok_json(state.routing_decision_log())
        }
        ("GET", ["v1", "routing", "status"]) => {
            let state = state.lock().await;
            ok_json(state.routing_status())
        }
        ("POST", ["v1", "messenger", "conversations"]) => {
            let parsed: Result<MessengerConversationCreateRequest, ApiError> =
                parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.messenger_create_conversation(body)) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("GET", ["v1", "messenger", "conversations"]) => {
            let state = state.lock().await;
            ok_json(state.messenger_list_conversations(None))
        }
        ("POST", ["v1", "messenger", "send"]) => {
            let parsed: Result<MessengerSendRequest, ApiError> = parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.messenger_send(body)) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("GET", ["v1", "messenger", "stream"]) => {
            let state = state.lock().await;
            ok_json(state.messenger_stream(None))
        }
        ("GET", ["v1", "messenger", "presence"]) => {
            let state = state.lock().await;
            let mesh_id = state
                .meshes()
                .meshes
                .first()
                .map(|mesh| mesh.config.mesh_id.clone());
            match mesh_id {
                Some(mesh_id) => match state.messenger_presence(mesh_id.as_str()) {
                    Ok(body) => ok_json(body),
                    Err(error) => error_json(error),
                },
                None => error_json(ApiError::new(ApiErrorCode::NotFound, "mesh not found")),
            }
        }
        ("POST", ["v1", "apps", "rustdesk", "bind"]) => {
            let parsed: Result<AppRustdeskBindRequest, ApiError> = parse_json_body(&request.body);
            let mut state = state.lock().await;
            match parsed.and_then(|body| state.rustdesk_bind(body)) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("DELETE", ["v1", "apps", "rustdesk", "bind", binding_id]) => {
            let mut state = state.lock().await;
            match state.rustdesk_unbind(binding_id) {
                Ok(body) => ok_json(body),
                Err(error) => {
                    state.record_error(error.code);
                    error_json(error)
                }
            }
        }
        ("GET", _) | ("POST", _) | ("DELETE", _) => {
            let mut state = state.lock().await;
            let error = ApiError::new(ApiErrorCode::NotFound, "route not found");
            state.record_error(error.code);
            error_json(error)
        }
        _ => {
            let mut state = state.lock().await;
            let error = ApiError::new(ApiErrorCode::MethodNotAllowed, "method not allowed");
            state.record_error(error.code);
            error_json(error)
        }
    };

    response
}

fn ok_json<T: Serialize>(value: T) -> HttpResponse {
    let envelope = ApiEnvelope {
        api_version: "v1",
        body: value,
    };
    let body =
        serde_json::to_vec(&envelope).unwrap_or_else(|_| b"{\"api_version\":\"v1\"}".to_vec());
    HttpResponse {
        status_code: 200,
        content_type: "application/json",
        body,
    }
}

fn ok_json_raw<T: Serialize>(value: T) -> HttpResponse {
    let body = serde_json::to_vec(&value).unwrap_or_else(|_| b"{\"api_version\":\"v1\"}".to_vec());
    HttpResponse {
        status_code: 200,
        content_type: "application/json",
        body,
    }
}

fn error_json(error: ApiError) -> HttpResponse {
    let status_code = error.code.http_status();
    let body = serde_json::to_vec(&error_envelope(&error))
        .unwrap_or_else(|_| b"{\"api_version\":\"v1\",\"error\":{\"code\":\"internal\",\"message\":\"internal error\"}}".to_vec());
    HttpResponse {
        status_code,
        content_type: "application/json",
        body,
    }
}

fn text_response(status_code: u16, body: String) -> HttpResponse {
    HttpResponse {
        status_code,
        content_type: "text/plain; version=0.0.4",
        body: body.into_bytes(),
    }
}

fn parse_json_body<T: serde::de::DeserializeOwned>(body: &[u8]) -> Result<T, ApiError> {
    serde_json::from_slice(body)
        .map_err(|_| ApiError::new(ApiErrorCode::InvalidInput, "invalid JSON body"))
}

async fn read_request(stream: &mut TcpStream) -> Result<HttpRequest, ApiError> {
    let mut buf = Vec::with_capacity(1024);
    let mut temp = [0_u8; 1024];
    let header_end;
    loop {
        let n = stream
            .read(&mut temp)
            .await
            .map_err(|_| ApiError::new(ApiErrorCode::InvalidInput, "failed to read request"))?;
        if n == 0 {
            return Err(ApiError::new(
                ApiErrorCode::InvalidInput,
                "connection closed before request",
            ));
        }
        buf.extend_from_slice(&temp[..n]);
        if buf.len() > MAX_REQUEST_BYTES {
            return Err(ApiError::new(
                ApiErrorCode::InvalidInput,
                "request too large",
            ));
        }
        if let Some(position) = find_header_end(&buf) {
            header_end = position;
            break;
        }
    }

    let header_text = std::str::from_utf8(&buf[..header_end])
        .map_err(|_| ApiError::new(ApiErrorCode::InvalidInput, "invalid HTTP headers"))?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| ApiError::new(ApiErrorCode::InvalidInput, "missing request line"))?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| ApiError::new(ApiErrorCode::InvalidInput, "missing method"))?;
    let path = request_parts
        .next()
        .ok_or_else(|| ApiError::new(ApiErrorCode::InvalidInput, "missing path"))?;

    let mut content_length = 0usize;
    for header in lines {
        if let Some((key, value)) = header.split_once(':') {
            if key.trim().eq_ignore_ascii_case("content-length") {
                content_length = value.trim().parse::<usize>().map_err(|_| {
                    ApiError::new(ApiErrorCode::InvalidInput, "invalid content-length")
                })?;
            }
        }
    }

    if content_length > MAX_BODY_BYTES {
        return Err(ApiError::new(
            ApiErrorCode::InvalidInput,
            "request body too large",
        ));
    }

    let body_start = header_end + 4;
    let mut body = if buf.len() > body_start {
        buf[body_start..].to_vec()
    } else {
        Vec::new()
    };
    while body.len() < content_length {
        let n = stream.read(&mut temp).await.map_err(|_| {
            ApiError::new(ApiErrorCode::InvalidInput, "failed to read request body")
        })?;
        if n == 0 {
            return Err(ApiError::new(
                ApiErrorCode::InvalidInput,
                "connection closed before request body",
            ));
        }
        body.extend_from_slice(&temp[..n]);
        if body.len() > MAX_BODY_BYTES {
            return Err(ApiError::new(
                ApiErrorCode::InvalidInput,
                "request body too large",
            ));
        }
    }
    body.truncate(content_length);

    Ok(HttpRequest {
        method: method.to_string(),
        path: path.to_string(),
        body,
    })
}

async fn write_response(stream: &mut TcpStream, response: HttpResponse) -> Result<(), ApiError> {
    let reason = match response.status_code {
        200 => "OK",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        409 => "Conflict",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "Error",
    };
    let header = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        response.status_code,
        reason,
        response.content_type,
        response.body.len()
    );
    stream
        .write_all(header.as_bytes())
        .await
        .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to write response"))?;
    stream
        .write_all(&response.body)
        .await
        .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to write response body"))?;
    stream
        .flush()
        .await
        .map_err(|_| ApiError::new(ApiErrorCode::Internal, "failed to flush response"))?;
    Ok(())
}

fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|window| window == b"\r\n\r\n")
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_start_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use std::{
        fmt::Write as _,
        io,
        net::SocketAddr,
        path::PathBuf,
        sync::{Arc, Mutex},
        time::Duration,
    };

    use fabric_crypto::{simple_hash32, DeterministicPrimitives};
    use fabric_relay_proto::derive_public_key;
    use fabric_session::{
        mux::{decode_mux_frame, encode_mux_frame, MuxFrame},
        relay_channel::RelayDatagramChannel,
        secure_session::{SecureSession, SessionEvent},
    };
    use fabric_tunnel_proto::{
        decode_message as decode_tunnel_message, encode_message as encode_tunnel_message,
        TunnelControl, TunnelLimits, TunnelMessage,
    };
    use relay_server::{run_udp, RelayRuntimeConfig};
    use serde_json::Value;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::{TcpListener, TcpStream},
        sync::oneshot,
        task::AbortHandle,
        time::{sleep, timeout, Instant},
    };

    use super::{run_api_server_with_listener, ApiServerConfig};
    use crate::relay_token::{RelayTokenIssuer, RelayTokenIssuerConfig, DEFAULT_TOKEN_TTL_SECS};

    const TEST_RELAY_SIGNING_SEED_HEX: &str =
        "1111111111111111111111111111111111111111111111111111111111111111";
    const HTTP_IO_TIMEOUT: Duration = Duration::from_secs(5);
    const GATEWAY_ROUNDTRIP_TIMEOUT: Duration = Duration::from_secs(15);
    const RELAY_RECV_POLL_TIMEOUT: Duration = Duration::from_millis(200);

    #[derive(Debug, Clone)]
    struct GatewayRoundtripProgress {
        stage: &'static str,
        relay_addr: Option<SocketAddr>,
        api_addr_a: Option<SocketAddr>,
        api_addr_b: Option<SocketAddr>,
        http_addr: Option<SocketAddr>,
        auth_ok: bool,
        saw_response: bool,
    }

    impl Default for GatewayRoundtripProgress {
        fn default() -> Self {
            Self {
                stage: "init",
                relay_addr: None,
                api_addr_a: None,
                api_addr_b: None,
                http_addr: None,
                auth_ok: false,
                saw_response: false,
            }
        }
    }

    #[derive(Default)]
    struct TaskAbortGuard {
        handles: Vec<AbortHandle>,
    }

    impl TaskAbortGuard {
        fn track<T>(&mut self, handle: &tokio::task::JoinHandle<T>) {
            self.handles.push(handle.abort_handle());
        }
    }

    impl Drop for TaskAbortGuard {
        fn drop(&mut self) {
            for handle in &self.handles {
                handle.abort();
            }
        }
    }

    fn update_roundtrip_progress(
        progress: &Arc<Mutex<GatewayRoundtripProgress>>,
        f: impl FnOnce(&mut GatewayRoundtripProgress),
    ) {
        let mut guard = progress
            .lock()
            .expect("gateway roundtrip progress mutex poisoned");
        f(&mut guard);
    }

    fn temp_state_path(name: &str) -> PathBuf {
        let now_ns = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time must be valid")
            .as_nanos();
        std::env::temp_dir().join(format!("animus-link-tests/{name}-{now_ns}/namespaces.json"))
    }

    fn test_config(
        api_bind: SocketAddr,
        state_file: PathBuf,
        relay_addr: Option<SocketAddr>,
    ) -> ApiServerConfig {
        ApiServerConfig {
            api_bind,
            relay_addr,
            relay_name: "default-relay".to_string(),
            relay_token_signing_key_id: "relay-token-signing-v1".to_string(),
            relay_token_signing_seed_hex: Some(TEST_RELAY_SIGNING_SEED_HEX.to_string()),
            relay_token_signing_key_file: Some(state_file.with_extension("relay-token-key.hex")),
            relay_token_ttl_secs: 120,
            state_file,
        }
    }

    fn test_relay_public_key_hex() -> String {
        let mut seed = [0u8; 32];
        for (index, chunk) in TEST_RELAY_SIGNING_SEED_HEX.as_bytes().chunks(2).enumerate() {
            let hi = (chunk[0] as char).to_digit(16).expect("hex hi");
            let lo = (chunk[1] as char).to_digit(16).expect("hex lo");
            seed[index] = ((hi << 4) | lo) as u8;
        }
        let mut out = String::new();
        for byte in derive_public_key(seed) {
            let _ = write!(&mut out, "{byte:02x}");
        }
        out
    }

    #[tokio::test]
    async fn status_route_works_over_localhost_http() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let state_file = temp_state_path("status-route");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        let server = tokio::spawn(async move {
            run_api_server_with_listener(
                listener,
                test_config(addr, state_file, None),
                Some(shutdown_rx),
            )
            .await
        });

        let raw_response = send_http(
            addr,
            "GET /v1/status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(raw_response.starts_with("HTTP/1.1 200 OK"));
        let body = extract_body(raw_response.as_str());
        let parsed: Value = serde_json::from_str(body).expect("status body json");
        assert_eq!(parsed["api_version"], "v1");
        assert_eq!(parsed["running"], true);
        assert_eq!(parsed["path"], "unknown");

        let _ = shutdown_tx.send(());
        let _ = server.await;
    }

    #[tokio::test]
    async fn health_route_reports_ready_json() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let state_file = temp_state_path("health-route");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        let server = tokio::spawn(async move {
            run_api_server_with_listener(
                listener,
                test_config(addr, state_file, None),
                Some(shutdown_rx),
            )
            .await
        });

        let raw_response = send_http(
            addr,
            "GET /v1/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(raw_response.starts_with("HTTP/1.1 200 OK"));
        let body = extract_body(raw_response.as_str());
        let parsed: Value = serde_json::from_str(body).expect("health body json");
        assert_eq!(parsed["api_version"], "v1");
        assert_eq!(parsed["ok"], true);

        let _ = shutdown_tx.send(());
        let _ = server.await;
    }

    #[tokio::test]
    async fn tunnel_routes_enable_disable_and_status_schema() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let state_file = temp_state_path("tunnel-routes");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let server = tokio::spawn(async move {
            run_api_server_with_listener(
                listener,
                test_config(addr, state_file, None),
                Some(shutdown_rx),
            )
            .await
        });

        let status_response = send_http(
            addr,
            "GET /v1/tunnel/status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(status_response.starts_with("HTTP/1.1 200 OK"));
        let status_body: Value =
            serde_json::from_str(extract_body(status_response.as_str())).expect("status body");
        assert_eq!(status_body["enabled"], false);
        assert_eq!(status_body["state"], "disabled");
        assert_eq!(status_body["fail_mode"], "open_fast");
        assert_eq!(status_body["dns_mode"], "remote_best_effort");
        assert!(status_body["dns_capabilities"].is_object());
        assert!(status_body["runtime_capabilities"].is_object());
        assert!(status_body["runtime_capabilities"]["tun_device_present"].is_boolean());
        assert!(status_body["runtime_capabilities"]["has_cap_net_admin"].is_boolean());
        assert!(status_body["runtime_capabilities"]["has_cap_bind_service"].is_boolean());
        assert!(status_body["prewarm_state"].is_string());

        let gateway_payload =
            r#"{"mode":"exit","listen":"127.0.0.1:0","nat":true,"allowed_peers":["peer-b"]}"#;
        let gateway_response = send_http(
            addr,
            format!(
                "POST /v1/gateway/expose HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                gateway_payload.len(),
                gateway_payload
            )
            .as_str(),
        )
        .await;
        assert!(gateway_response.starts_with("HTTP/1.1 200 OK"));
        let gateway_body: Value =
            serde_json::from_str(extract_body(gateway_response.as_str())).expect("gateway body");
        assert_eq!(gateway_body["gateway_service"], "gateway-exit");
        assert_eq!(gateway_body["allowed_peer_count"], 1);

        let enable_payload = r#"{"gateway_service":"gateway-exit","fail_mode":"open_fast","dns_mode":"remote_best_effort","exclude_cidrs":["10.0.0.0/8"],"allow_lan":true}"#;
        let enable_response = send_http(
            addr,
            format!(
                "POST /v1/tunnel/enable HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                enable_payload.len(),
                enable_payload
            )
            .as_str(),
        )
        .await;
        assert!(enable_response.starts_with("HTTP/1.1 200 OK"));
        let enable_body: Value =
            serde_json::from_str(extract_body(enable_response.as_str())).expect("enable body");
        assert_eq!(enable_body["enabled"], true);
        assert_eq!(enable_body["state"], "degraded");
        assert_eq!(enable_body["last_error_code"], "relay_not_configured");

        let disable_response = send_http(
            addr,
            "POST /v1/tunnel/disable HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(disable_response.starts_with("HTTP/1.1 200 OK"));
        let disable_body: Value =
            serde_json::from_str(extract_body(disable_response.as_str())).expect("disable body");
        assert_eq!(disable_body["enabled"], false);
        assert_eq!(disable_body["state"], "disabled");

        let _ = shutdown_tx.send(());
        let _ = server.await;
    }

    #[tokio::test]
    async fn self_check_route_has_stable_schema_and_no_secret_leaks() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let state_file = temp_state_path("self-check-route");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let server = tokio::spawn(async move {
            run_api_server_with_listener(
                listener,
                test_config(addr, state_file, None),
                Some(shutdown_rx),
            )
            .await
        });

        let create_response = send_http(
            addr,
            "POST /v1/invite/create HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await;
        let invite_body: Value =
            serde_json::from_str(extract_body(create_response.as_str())).expect("invite body");
        let invite = invite_body["invite"].as_str().expect("invite").to_string();

        let raw_response = send_http(
            addr,
            "GET /v1/self_check HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(raw_response.starts_with("HTTP/1.1 200 OK"));
        let body = extract_body(raw_response.as_str());
        let parsed: Value = serde_json::from_str(body).expect("self-check body json");
        assert_eq!(parsed["api_version"], "v1");
        assert!(parsed["ok"].is_boolean());
        assert!(parsed["version"]["app"].is_string());
        assert!(parsed["version"]["protocol"].is_string());
        assert!(parsed["platform"]["os"].is_string());
        assert!(parsed["platform"]["arch"].is_string());
        assert!(parsed["timestamp_unix"].is_u64());
        let checks = parsed["checks"].as_array().expect("checks array");
        let mut names = checks
            .iter()
            .filter_map(|entry| entry["name"].as_str())
            .collect::<Vec<_>>();
        names.sort_unstable();
        assert_eq!(
            names,
            vec![
                "dns_remote_strict_supported",
                "has_cap_bind_service",
                "has_cap_net_admin",
                "keystore_ok",
                "namespace_store_ok",
                "port_bind_conflicts",
                "relay_reachable",
                "token_issuer_config_ok",
                "token_mint_verify_ok",
                "tun_device_present",
                "tunnel_config_ok",
                "tunnel_supported",
            ]
        );
        assert!(parsed["dns_mode"].is_string());
        assert!(parsed["dns_capabilities"]["remote_best_effort_supported"].is_boolean());
        assert!(parsed["dns_capabilities"]["remote_strict_supported"].is_boolean());
        assert!(parsed["runtime_capabilities"]["tun_device_present"].is_boolean());
        assert!(parsed["runtime_capabilities"]["has_cap_net_admin"].is_boolean());
        assert!(parsed["runtime_capabilities"]["has_cap_bind_service"].is_boolean());
        assert!(body.contains("\"relay_not_configured\""));
        assert!(!body.contains(invite.as_str()));
        assert!(!body.contains("animus://invite/"));
        assert!(!body.contains("animus://rtok/"));

        let _ = shutdown_tx.send(());
        let _ = server.await;
    }

    #[tokio::test]
    async fn diagnostics_route_has_stable_schema_and_no_secret_leaks() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let state_file = temp_state_path("diagnostics-route");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let server = tokio::spawn(async move {
            run_api_server_with_listener(
                listener,
                test_config(addr, state_file, None),
                Some(shutdown_rx),
            )
            .await
        });

        let create_response = send_http(
            addr,
            "POST /v1/invite/create HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await;
        let invite_body: Value =
            serde_json::from_str(extract_body(create_response.as_str())).expect("invite body");
        let invite = invite_body["invite"].as_str().expect("invite").to_string();

        let denied_request = r#"{"service_name":"db","local_addr":"127.0.0.1:5432"}"#;
        let denied_response = send_http(
            addr,
            format!(
                "POST /v1/expose HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                denied_request.len(),
                denied_request
            )
            .as_str(),
        )
        .await;
        assert!(denied_response.starts_with("HTTP/1.1 403 Forbidden"));

        let raw_response = send_http(
            addr,
            "GET /v1/diagnostics HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(raw_response.starts_with("HTTP/1.1 200 OK"));
        let body = extract_body(raw_response.as_str());
        let parsed: Value = serde_json::from_str(body).expect("diagnostics body json");
        assert_eq!(parsed["api_version"], "v1");
        assert!(parsed["version"]["app"].is_string());
        assert!(parsed["version"]["protocol"].is_string());
        assert!(parsed["platform"]["os"].is_string());
        assert!(parsed["platform"]["arch"].is_string());
        assert!(parsed["uptime_secs"].is_u64());
        assert!(parsed["config_summary"]["relay_configured"].is_boolean());
        assert!(parsed["config_summary"]["token_issuer_configured"].is_boolean());
        assert!(parsed["config_summary"]["namespace_count"].is_u64());
        assert_eq!(parsed["config_summary"]["mobile_policy"], "foreground_only");
        for key in [
            "connect_attempts_total",
            "connect_success_total",
            "connect_fail_total",
            "expose_attempts_total",
            "expose_denied_total",
            "handshake_failures_total",
            "relay_reachable",
            "stream_open_total",
            "bytes_proxied_total",
            "gateway_packets_in_total",
            "gateway_packets_out_total",
            "gateway_sessions_active",
            "gateway_sessions_evicted_total",
            "gateway_drops_malformed_total",
            "gateway_drops_quota_total",
            "tunnel_enabled",
            "tunnel_connected",
            "tunnel_reconnects_total",
            "tunnel_bytes_in_total",
            "tunnel_bytes_out_total",
            "prewarm_ready_gauge",
            "prewarm_attempts_total",
            "prewarm_fail_total",
            "dns_queries_total",
            "dns_timeouts_total",
            "dns_failures_total",
        ] {
            assert!(
                parsed["counters"].get(key).is_some(),
                "missing counter field {key}"
            );
        }
        assert!(parsed["recent_errors"].is_array());
        assert!(parsed["notes"].is_array());
        assert!(!body.contains(invite.as_str()));
        assert!(!body.contains("animus://invite/"));
        assert!(!body.contains("animus://rtok/"));

        let _ = shutdown_tx.send(());
        let _ = server.await;
    }

    #[tokio::test]
    async fn self_check_relay_probe_is_timeout_bounded() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let relay_addr = match reserve_udp_addr().await {
            Ok(addr) => addr,
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("reserve relay addr: {error}"),
        };
        let state_file = temp_state_path("self-check-timeout");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let server = tokio::spawn(async move {
            run_api_server_with_listener(
                listener,
                test_config(addr, state_file, Some(relay_addr)),
                Some(shutdown_rx),
            )
            .await
        });

        let raw_response = tokio::time::timeout(
            Duration::from_secs(2),
            send_http(
                addr,
                "GET /v1/self_check HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
            ),
        )
        .await
        .expect("self-check should complete quickly");
        assert!(raw_response.starts_with("HTTP/1.1 200 OK"));
        let body = extract_body(raw_response.as_str());
        assert!(body.contains("\"relay_reachable\""));

        let _ = shutdown_tx.send(());
        let _ = server.await;
    }

    #[tokio::test]
    async fn metrics_route_reports_prometheus_and_never_leaks_invites() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let state_file = temp_state_path("metrics-route");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        let server = tokio::spawn(async move {
            run_api_server_with_listener(
                listener,
                test_config(addr, state_file, None),
                Some(shutdown_rx),
            )
            .await
        });

        let create_response = send_http(
            addr,
            "POST /v1/invite/create HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(create_response.starts_with("HTTP/1.1 200 OK"));
        let create_body: Value = serde_json::from_str(extract_body(create_response.as_str()))
            .expect("invite create body");
        let invite = create_body["invite"]
            .as_str()
            .expect("invite string")
            .to_string();

        let metrics_response = send_http(
            addr,
            "GET /v1/metrics HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(metrics_response.starts_with("HTTP/1.1 200 OK"));
        assert!(metrics_response.contains("Content-Type: text/plain; version=0.0.4"));
        let body = extract_body(metrics_response.as_str());
        for required in [
            "connect_attempts_total",
            "connect_success_total",
            "connect_fail_total",
            "expose_attempts_total",
            "expose_denied_total",
            "handshake_failures_total",
            "relay_reachable",
            "stream_open_total",
            "bytes_proxied_total",
            "gateway_packets_in_total",
            "gateway_packets_out_total",
            "gateway_sessions_active",
            "gateway_sessions_evicted_total",
            "gateway_drops_malformed_total",
            "gateway_drops_quota_total",
            "tunnel_enabled",
            "tunnel_connected",
            "tunnel_reconnects_total",
            "tunnel_bytes_in_total",
            "tunnel_bytes_out_total",
            "prewarm_ready_gauge",
            "prewarm_attempts_total",
            "prewarm_fail_total",
            "dns_queries_total",
            "dns_timeouts_total",
            "dns_failures_total",
        ] {
            assert!(body.contains(required), "missing metric {required}");
        }
        assert!(!body.contains(invite.as_str()));
        assert!(!body.contains("animus://invite/"));
        assert!(!body.contains("animus://rtok/"));

        let _ = shutdown_tx.send(());
        let _ = server.await;
    }

    #[tokio::test]
    async fn expose_without_allow_policy_is_denied() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let state_file = temp_state_path("expose-policy");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        let server = tokio::spawn(async move {
            run_api_server_with_listener(
                listener,
                test_config(addr, state_file, None),
                Some(shutdown_rx),
            )
            .await
        });

        let payload = r#"{"service_name":"db","local_addr":"127.0.0.1:5432"}"#;
        let request = format!(
            "POST /v1/expose HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            payload.len(),
            payload
        );
        let raw_response = send_http(addr, request.as_str()).await;
        assert!(raw_response.starts_with("HTTP/1.1 403 Forbidden"));
        let body = extract_body(raw_response.as_str());
        let parsed: Value = serde_json::from_str(body).expect("error body json");
        assert_eq!(parsed["error"]["code"], "denied");

        let _ = shutdown_tx.send(());
        let _ = server.await;
    }

    #[tokio::test]
    async fn mesh_native_endpoints_cover_roles_routing_services_and_messenger() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let state_file = temp_state_path("mesh-native-api");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let server = tokio::spawn(async move {
            run_api_server_with_listener(
                listener,
                test_config(addr, state_file, None),
                Some(shutdown_rx),
            )
            .await
        });

        let mesh_body = r#"{"mesh_name":"lab"}"#;
        let mesh_response = send_http(
            addr,
            format!(
                "POST /v1/meshes HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                mesh_body.len(),
                mesh_body
            )
            .as_str(),
        )
        .await;
        assert!(mesh_response.starts_with("HTTP/1.1 200 OK"));
        let mesh_json: Value =
            serde_json::from_str(extract_body(mesh_response.as_str())).expect("mesh json");
        let mesh_id = mesh_json["mesh"]["mesh_id"]
            .as_str()
            .expect("mesh_id")
            .to_string();
        let node_id = mesh_json["mesh"]["local_node_id"]
            .as_str()
            .expect("node_id")
            .to_string();

        let roles_body = format!(r#"{{"mesh_id":"{mesh_id}","roles":["relay","service_host"]}}"#);
        let roles_response = send_http(
            addr,
            format!(
                "POST /v1/nodes/{node_id}/roles HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                roles_body.len(),
                roles_body
            )
            .as_str(),
        )
        .await;
        assert!(roles_response.starts_with("HTTP/1.1 200 OK"));

        let advertise_body = format!(r#"{{"mesh_id":"{mesh_id}","tags":["home"]}}"#);
        let advertise_response = send_http(
            addr,
            format!(
                "POST /v1/relays/advertise HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                advertise_body.len(),
                advertise_body
            )
            .as_str(),
        )
        .await;
        assert!(advertise_response.starts_with("HTTP/1.1 200 OK"));

        let select_body = format!(
            r#"{{"mesh_id":"{mesh_id}","target_kind":"service","target_id":"chat","relay_node_id":"{node_id}"}}"#
        );
        let select_response = send_http(
            addr,
            format!(
                "POST /v1/relays/select HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                select_body.len(),
                select_body
            )
            .as_str(),
        )
        .await;
        assert!(select_response.starts_with("HTTP/1.1 200 OK"));

        let service_body = format!(
            r#"{{"mesh_id":"{mesh_id}","service_name":"chat","local_addr":"127.0.0.1:19180","allowed_peers":["peer-b"],"tags":["msg"]}}"#
        );
        let service_response = send_http(
            addr,
            format!(
                "POST /v1/services/expose HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                service_body.len(),
                service_body
            )
            .as_str(),
        )
        .await;
        assert!(service_response.starts_with("HTTP/1.1 200 OK"));
        let service_json: Value =
            serde_json::from_str(extract_body(service_response.as_str())).expect("service json");
        assert_eq!(service_json["descriptor"]["mesh_id"], mesh_id);

        let conversation_body =
            format!(r#"{{"mesh_id":"{mesh_id}","participants":["peer-b"],"title":"dm"}}"#);
        let conversation_response = send_http(
            addr,
            format!(
                "POST /v1/messenger/conversations HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                conversation_body.len(),
                conversation_body
            )
            .as_str(),
        )
        .await;
        assert!(conversation_response.starts_with("HTTP/1.1 200 OK"));
        let conversation_json: Value =
            serde_json::from_str(extract_body(conversation_response.as_str()))
                .expect("conversation json");
        let conversation_id = conversation_json["conversation_id"]
            .as_str()
            .expect("conversation_id");

        let send_body =
            format!(r#"{{"conversation_id":"{conversation_id}","body":"hello over animus"}}"#);
        let send_response = send_http(
            addr,
            format!(
                "POST /v1/messenger/send HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                send_body.len(),
                send_body
            )
            .as_str(),
        )
        .await;
        assert!(send_response.starts_with("HTTP/1.1 200 OK"));
        let send_json: Value =
            serde_json::from_str(extract_body(send_response.as_str())).expect("send json");
        assert_eq!(send_json["body"], "hello over animus");
        assert!(send_json["decision_id"].is_string());

        let relay_status = send_http(
            addr,
            "GET /v1/relays/status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )
        .await;
        let relay_json: Value =
            serde_json::from_str(extract_body(relay_status.as_str())).expect("relay status json");
        assert_eq!(relay_json["offers"].as_array().expect("offers").len(), 1);

        let routing_log = send_http(
            addr,
            "GET /v1/routing/decision-log HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )
        .await;
        let routing_json: Value =
            serde_json::from_str(extract_body(routing_log.as_str())).expect("routing json");
        assert!(!routing_json["decisions"]
            .as_array()
            .expect("decisions")
            .is_empty());

        let stream_response = send_http(
            addr,
            "GET /v1/messenger/stream HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )
        .await;
        let stream_json: Value =
            serde_json::from_str(extract_body(stream_response.as_str())).expect("stream json");
        assert_eq!(
            stream_json["messages"].as_array().expect("messages").len(),
            1
        );

        let _ = shutdown_tx.send(());
        let _ = server.await;
    }

    #[tokio::test]
    async fn relay_advertise_requires_local_relay_role() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let state_file = temp_state_path("relay-advertise-denied");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let server = tokio::spawn(async move {
            run_api_server_with_listener(
                listener,
                test_config(addr, state_file, None),
                Some(shutdown_rx),
            )
            .await
        });

        let mesh_body = r#"{"mesh_name":"lab"}"#;
        let mesh_response = send_http(
            addr,
            format!(
                "POST /v1/meshes HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                mesh_body.len(),
                mesh_body
            )
            .as_str(),
        )
        .await;
        let mesh_json: Value =
            serde_json::from_str(extract_body(mesh_response.as_str())).expect("mesh json");
        let mesh_id = mesh_json["mesh"]["mesh_id"].as_str().expect("mesh_id");

        let advertise_body = format!(r#"{{"mesh_id":"{mesh_id}"}}"#);
        let advertise_response = send_http(
            addr,
            format!(
                "POST /v1/relays/advertise HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                advertise_body.len(),
                advertise_body
            )
            .as_str(),
        )
        .await;
        assert!(advertise_response.starts_with("HTTP/1.1 403 Forbidden"));
        let denied_json: Value =
            serde_json::from_str(extract_body(advertise_response.as_str())).expect("deny json");
        assert_eq!(denied_json["error"]["code"], "denied");

        let _ = shutdown_tx.send(());
        let _ = server.await;
    }

    #[tokio::test]
    async fn expose_then_connect_returns_stream_and_connection_ids() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let state_file = temp_state_path("connect-route");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        let server = tokio::spawn(async move {
            run_api_server_with_listener(
                listener,
                test_config(addr, state_file, None),
                Some(shutdown_rx),
            )
            .await
        });

        let expose_payload =
            r#"{"service_name":"db","local_addr":"127.0.0.1:5432","allowed_peers":["peer-a"]}"#;
        let expose_request = format!(
            "POST /v1/expose HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            expose_payload.len(),
            expose_payload
        );
        let expose_response = send_http(addr, expose_request.as_str()).await;
        assert!(expose_response.starts_with("HTTP/1.1 200 OK"));

        let connect_payload = r#"{"service_name":"db"}"#;
        let connect_request = format!(
            "POST /v1/connect HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            connect_payload.len(),
            connect_payload
        );
        let connect_response = send_http(addr, connect_request.as_str()).await;
        assert!(connect_response.starts_with("HTTP/1.1 200 OK"));
        let body = extract_body(connect_response.as_str());
        let parsed: Value = serde_json::from_str(body).expect("connect body json");
        assert_eq!(parsed["stream_id"], 1);
        assert_eq!(parsed["connection_id"], 1);

        let _ = shutdown_tx.send(());
        let _ = server.await;
    }

    #[tokio::test]
    async fn relay_first_expose_connect_roundtrip_bytes() {
        let relay_addr = match reserve_udp_addr().await {
            Ok(addr) => addr,
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("reserve relay addr: {error}"),
        };
        let relay_task = tokio::spawn(async move {
            let config = RelayRuntimeConfig {
                bind: relay_addr,
                dev_allow_unsigned_tokens: false,
                token_issuer_public_keys_hex: vec![test_relay_public_key_hex()],
                ..RelayRuntimeConfig::default()
            };
            let _ = run_udp(config).await;
        });
        sleep(Duration::from_millis(50)).await;

        let echo_listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
                relay_task.abort();
                return;
            }
            Err(error) => panic!("bind echo listener: {error}"),
        };
        let echo_addr = echo_listener.local_addr().expect("echo local addr");
        let echo_task = tokio::spawn(async move {
            loop {
                let (mut stream, _) = match echo_listener.accept().await {
                    Ok(value) => value,
                    Err(_) => break,
                };
                tokio::spawn(async move {
                    let mut buf = [0u8; 2048];
                    loop {
                        match stream.read(&mut buf).await {
                            Ok(0) => break,
                            Ok(n) => {
                                if stream.write_all(&buf[..n]).await.is_err() {
                                    break;
                                }
                            }
                            Err(_) => break,
                        }
                    }
                });
            }
        });

        let listener_a = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
                relay_task.abort();
                echo_task.abort();
                return;
            }
            Err(error) => panic!("bind listener a: {error}"),
        };
        let listener_b = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
                relay_task.abort();
                echo_task.abort();
                return;
            }
            Err(error) => panic!("bind listener b: {error}"),
        };
        let addr_a = listener_a.local_addr().expect("addr a");
        let addr_b = listener_b.local_addr().expect("addr b");
        let state_a = temp_state_path("relay-first-a");
        let state_b = temp_state_path("relay-first-b");

        let (shutdown_a_tx, shutdown_a_rx) = oneshot::channel();
        let (shutdown_b_tx, shutdown_b_rx) = oneshot::channel();
        let server_a = tokio::spawn(async move {
            run_api_server_with_listener(
                listener_a,
                test_config(addr_a, state_a, Some(relay_addr)),
                Some(shutdown_a_rx),
            )
            .await
        });
        let server_b = tokio::spawn(async move {
            run_api_server_with_listener(
                listener_b,
                test_config(addr_b, state_b, Some(relay_addr)),
                Some(shutdown_b_rx),
            )
            .await
        });

        let create_response = send_http(
            addr_a,
            "POST /v1/invite/create HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(create_response.starts_with("HTTP/1.1 200 OK"));
        let create_body: Value = serde_json::from_str(extract_body(create_response.as_str()))
            .expect("invite create body");
        let invite = create_body["invite"]
            .as_str()
            .expect("invite string")
            .to_string();

        let join_payload = format!(r#"{{"invite":"{}"}}"#, invite);
        let join_request = format!(
            "POST /v1/invite/join HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            join_payload.len(),
            join_payload
        );
        let join_response = send_http(addr_b, join_request.as_str()).await;
        assert!(join_response.starts_with("HTTP/1.1 200 OK"));

        let expose_payload = format!(
            r#"{{"service_name":"echo","local_addr":"{}","allowed_peers":["peer-b"]}}"#,
            echo_addr
        );
        let expose_request = format!(
            "POST /v1/expose HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            expose_payload.len(),
            expose_payload
        );
        let expose_response = send_http(addr_a, expose_request.as_str()).await;
        assert!(expose_response.starts_with("HTTP/1.1 200 OK"));

        let connect_payload = r#"{"service_name":"echo"}"#;
        let connect_request = format!(
            "POST /v1/connect HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            connect_payload.len(),
            connect_payload
        );
        let connect_response = send_http(addr_b, connect_request.as_str()).await;
        assert!(connect_response.starts_with("HTTP/1.1 200 OK"));
        let connect_body: Value =
            serde_json::from_str(extract_body(connect_response.as_str())).expect("connect body");
        let local_proxy = connect_body["local_addr"]
            .as_str()
            .expect("local proxy addr")
            .parse::<SocketAddr>()
            .expect("parse local proxy addr");

        sleep(Duration::from_millis(100)).await;

        let mut client = TcpStream::connect(local_proxy)
            .await
            .expect("connect local proxy");
        client
            .write_all(b"relay-roundtrip")
            .await
            .expect("write proxy request");
        let mut echoed = vec![0u8; "relay-roundtrip".len()];
        client
            .read_exact(echoed.as_mut_slice())
            .await
            .expect("read echo");
        assert_eq!(echoed, b"relay-roundtrip");

        let _ = shutdown_a_tx.send(());
        let _ = shutdown_b_tx.send(());
        let _ = server_a.await;
        let _ = server_b.await;
        relay_task.abort();
        echo_task.abort();
    }

    #[tokio::test]
    async fn relay_gateway_tunnel_roundtrip_http_via_ip_packets() {
        let progress = Arc::new(Mutex::new(GatewayRoundtripProgress::default()));
        let progress_for_run = Arc::clone(&progress);
        let result = timeout(
            GATEWAY_ROUNDTRIP_TIMEOUT,
            relay_gateway_tunnel_roundtrip_http_via_ip_packets_inner(progress_for_run),
        )
        .await;
        if result.is_err() {
            let snapshot = progress
                .lock()
                .expect("gateway roundtrip progress mutex poisoned")
                .clone();
            panic!(
                "relay gateway roundtrip timed out after {}s; stage={}; relay_addr={:?}; api_addr_a={:?}; \
                 api_addr_b={:?}; http_addr={:?}; auth_ok={}; saw_response={}",
                GATEWAY_ROUNDTRIP_TIMEOUT.as_secs(),
                snapshot.stage,
                snapshot.relay_addr,
                snapshot.api_addr_a,
                snapshot.api_addr_b,
                snapshot.http_addr,
                snapshot.auth_ok,
                snapshot.saw_response,
            );
        }
    }

    async fn relay_gateway_tunnel_roundtrip_http_via_ip_packets_inner(
        progress: Arc<Mutex<GatewayRoundtripProgress>>,
    ) {
        update_roundtrip_progress(&progress, |state| state.stage = "reserve_relay_addr");
        let relay_addr = match reserve_udp_addr().await {
            Ok(addr) => addr,
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("reserve relay addr: {error}"),
        };
        update_roundtrip_progress(&progress, |state| state.relay_addr = Some(relay_addr));
        let mut task_guard = TaskAbortGuard::default();
        update_roundtrip_progress(&progress, |state| state.stage = "start_relay_task");
        let relay_task = tokio::spawn(async move {
            let config = RelayRuntimeConfig {
                bind: relay_addr,
                dev_allow_unsigned_tokens: false,
                token_issuer_public_keys_hex: vec![test_relay_public_key_hex()],
                ..RelayRuntimeConfig::default()
            };
            let _ = run_udp(config).await;
        });
        task_guard.track(&relay_task);
        sleep(Duration::from_millis(50)).await;

        update_roundtrip_progress(&progress, |state| state.stage = "start_http_listener");
        let http_listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
                relay_task.abort();
                return;
            }
            Err(error) => panic!("bind http listener: {error}"),
        };
        let http_addr = http_listener.local_addr().expect("http addr");
        update_roundtrip_progress(&progress, |state| state.http_addr = Some(http_addr));
        let http_task = tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = http_listener.accept().await else {
                    break;
                };
                tokio::spawn(async move {
                    let mut buf = [0u8; 2048];
                    let _ = stream.read(&mut buf).await;
                    let response =
                        b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\nConnection: close\r\n\r\ngateway-ok";
                    let _ = stream.write_all(response).await;
                    let _ = stream.shutdown().await;
                });
            }
        });
        task_guard.track(&http_task);

        update_roundtrip_progress(&progress, |state| state.stage = "start_api_servers");
        let listener_a = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
                relay_task.abort();
                http_task.abort();
                return;
            }
            Err(error) => panic!("bind listener a: {error}"),
        };
        let listener_b = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
                relay_task.abort();
                http_task.abort();
                return;
            }
            Err(error) => panic!("bind listener b: {error}"),
        };
        let addr_a = listener_a.local_addr().expect("addr a");
        let addr_b = listener_b.local_addr().expect("addr b");
        update_roundtrip_progress(&progress, |state| {
            state.api_addr_a = Some(addr_a);
            state.api_addr_b = Some(addr_b);
        });
        let state_a = temp_state_path("relay-gateway-a");
        let state_b = temp_state_path("relay-gateway-b");

        let (shutdown_a_tx, shutdown_a_rx) = oneshot::channel();
        let (shutdown_b_tx, shutdown_b_rx) = oneshot::channel();
        let server_a = tokio::spawn(async move {
            run_api_server_with_listener(
                listener_a,
                test_config(addr_a, state_a, Some(relay_addr)),
                Some(shutdown_a_rx),
            )
            .await
        });
        let server_b = tokio::spawn(async move {
            run_api_server_with_listener(
                listener_b,
                test_config(addr_b, state_b, Some(relay_addr)),
                Some(shutdown_b_rx),
            )
            .await
        });
        task_guard.track(&server_a);
        task_guard.track(&server_b);

        update_roundtrip_progress(&progress, |state| state.stage = "gateway_expose");
        let gateway_payload =
            r#"{"mode":"exit","listen":"0.0.0.0:0","nat":true,"allowed_peers":["peer-b"]}"#;
        let gateway_response = send_http(
            addr_a,
            format!(
                "POST /v1/gateway/expose HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                gateway_payload.len(),
                gateway_payload
            )
            .as_str(),
        )
        .await;
        assert!(gateway_response.starts_with("HTTP/1.1 200 OK"));
        let gateway_body: Value =
            serde_json::from_str(extract_body(gateway_response.as_str())).expect("gateway body");
        assert_eq!(gateway_body["gateway_service"], "gateway-exit");
        assert_eq!(gateway_body["ready"], true);

        update_roundtrip_progress(&progress, |state| state.stage = "tunnel_enable");
        let enable_payload = r#"{"gateway_service":"gateway-exit","fail_mode":"open_fast","dns_mode":"remote_best_effort","exclude_cidrs":["10.0.0.0/8"],"allow_lan":true}"#;
        let enable_response = send_http(
            addr_b,
            format!(
                "POST /v1/tunnel/enable HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                enable_payload.len(),
                enable_payload
            )
            .as_str(),
        )
        .await;
        assert!(enable_response.starts_with("HTTP/1.1 200 OK"));

        let conn_id = derive_conn_id_for_service("gateway-exit");
        let relay_token = mint_test_token("gateway-client");
        update_roundtrip_progress(&progress, |state| state.stage = "relay_channel_bind");
        let channel =
            RelayDatagramChannel::bind(loopback_datagram_addr(relay_addr), relay_addr, conn_id)
                .await
                .expect("bind relay channel");
        channel
            .allocate_and_bind(relay_token.as_str(), DEFAULT_TOKEN_TTL_SECS)
            .await
            .expect("allocate and bind");

        let mut session = SecureSession::new_initiator(
            conn_id,
            b"animus/fabric/v1/relay-first",
            DeterministicPrimitives::new(seed_for_role("gateway-initiator", conn_id)),
        );
        let start = session
            .start_handshake(b"link-tunnel")
            .expect("start handshake");
        channel.send(start.as_slice()).await.expect("send msg1");
        update_roundtrip_progress(&progress, |state| state.stage = "session_handshake");
        let handshake_deadline = Instant::now() + Duration::from_secs(3);
        while !session.is_established() {
            if Instant::now() >= handshake_deadline {
                panic!(
                    "gateway session handshake timeout; relay_addr={relay_addr}; conn_id={conn_id}"
                );
            }
            let wait_for = RELAY_RECV_POLL_TIMEOUT
                .min(handshake_deadline.saturating_duration_since(Instant::now()));
            let (_src, packet) = match timeout(wait_for, channel.recv()).await {
                Ok(Ok(packet)) => packet,
                Ok(Err(error)) => panic!(
                    "recv handshake failed: {error}; relay_addr={relay_addr}; conn_id={conn_id}"
                ),
                Err(_) => continue,
            };
            let handled = session
                .handle_incoming(packet.as_slice())
                .expect("handle handshake packet");
            for outbound in handled.outbound {
                channel
                    .send(outbound.as_slice())
                    .await
                    .expect("send handshake outbound");
            }
        }

        let stream_id = 7u32;
        send_mux_frame(
            &channel,
            &mut session,
            stream_id,
            MuxFrame::Open {
                service: "gateway-exit".to_string(),
            },
        )
        .await;
        send_tunnel_payload(
            &channel,
            &mut session,
            stream_id,
            TunnelMessage::Control(TunnelControl::Auth {
                peer_id: "peer-b".to_string(),
            }),
        )
        .await;

        let mut auth_ok = false;
        update_roundtrip_progress(&progress, |state| state.stage = "wait_auth_ok");
        let auth_deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        while tokio::time::Instant::now() < auth_deadline {
            let wait_for = RELAY_RECV_POLL_TIMEOUT
                .min(auth_deadline.saturating_duration_since(Instant::now()));
            let (_src, packet) = match timeout(wait_for, channel.recv()).await {
                Ok(Ok(packet)) => packet,
                Ok(Err(error)) => {
                    panic!("recv auth failed: {error}; relay_addr={relay_addr}; conn_id={conn_id}")
                }
                Err(_) => continue,
            };
            let handled = session
                .handle_incoming(packet.as_slice())
                .expect("handle auth response");
            for outbound in handled.outbound {
                channel
                    .send(outbound.as_slice())
                    .await
                    .expect("send handshake follow-up");
            }
            for event in handled.events {
                if let SessionEvent::Data {
                    stream_id: sid,
                    payload,
                } = event
                {
                    if sid != stream_id {
                        continue;
                    }
                    if let Ok(MuxFrame::Data { bytes }) = decode_mux_frame(payload.as_slice()) {
                        if let Ok(TunnelMessage::Control(TunnelControl::AuthOk)) =
                            decode_tunnel_message(bytes.as_slice(), TunnelLimits::default())
                        {
                            auth_ok = true;
                            break;
                        }
                    }
                }
            }
            if auth_ok {
                break;
            }
        }
        update_roundtrip_progress(&progress, |state| state.auth_ok = auth_ok);
        assert!(auth_ok, "gateway auth must succeed");

        update_roundtrip_progress(&progress, |state| state.stage = "send_http_ip_packet");
        let request_packet = build_ipv4_tcp_packet(
            "10.0.0.2".parse().expect("src ip"),
            "127.0.0.1".parse().expect("dst ip"),
            41000,
            http_addr.port(),
            0x18,
            b"GET / HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
        );
        send_tunnel_payload(
            &channel,
            &mut session,
            stream_id,
            TunnelMessage::IpPacket {
                bytes: request_packet,
            },
        )
        .await;

        let mut saw_response = false;
        update_roundtrip_progress(&progress, |state| state.stage = "wait_http_response");
        let response_deadline = tokio::time::Instant::now() + Duration::from_secs(3);
        while tokio::time::Instant::now() < response_deadline {
            let wait_for = RELAY_RECV_POLL_TIMEOUT
                .min(response_deadline.saturating_duration_since(Instant::now()));
            let (_src, packet) = match timeout(wait_for, channel.recv()).await {
                Ok(Ok(packet)) => packet,
                Ok(Err(error)) => panic!(
                    "recv response failed: {error}; relay_addr={relay_addr}; conn_id={conn_id}"
                ),
                Err(_) => continue,
            };
            let handled = session
                .handle_incoming(packet.as_slice())
                .expect("handle response");
            for outbound in handled.outbound {
                channel
                    .send(outbound.as_slice())
                    .await
                    .expect("send response ack");
            }
            for event in handled.events {
                if let SessionEvent::Data {
                    stream_id: sid,
                    payload,
                } = event
                {
                    if sid != stream_id {
                        continue;
                    }
                    if let Ok(MuxFrame::Data { bytes }) = decode_mux_frame(payload.as_slice()) {
                        if let Ok(TunnelMessage::IpPacket { bytes }) =
                            decode_tunnel_message(bytes.as_slice(), TunnelLimits::default())
                        {
                            let tcp_payload =
                                extract_ipv4_tcp_payload(bytes.as_slice()).expect("tcp payload");
                            if tcp_payload
                                .windows("gateway-ok".len())
                                .any(|w| w == b"gateway-ok")
                            {
                                saw_response = true;
                                break;
                            }
                        }
                    }
                }
            }
            if saw_response {
                break;
            }
        }
        update_roundtrip_progress(&progress, |state| state.saw_response = saw_response);
        assert!(saw_response, "expected HTTP response over gateway tunnel");

        update_roundtrip_progress(&progress, |state| state.stage = "tunnel_disable");
        let disable_response = send_http(
            addr_b,
            "POST /v1/tunnel/disable HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await;
        assert!(disable_response.starts_with("HTTP/1.1 200 OK"));
        let disable_body: Value =
            serde_json::from_str(extract_body(disable_response.as_str())).expect("disable body");
        assert_eq!(disable_body["state"], "disabled");
        assert_eq!(disable_body["enabled"], false);

        update_roundtrip_progress(&progress, |state| state.stage = "shutdown");
        let _ = shutdown_a_tx.send(());
        let _ = shutdown_b_tx.send(());
        let _ = server_a.await;
        let _ = server_b.await;
        relay_task.abort();
        let _ = relay_task.await;
        http_task.abort();
        let _ = http_task.await;
    }

    async fn send_http(addr: SocketAddr, request: &str) -> String {
        let mut stream = timeout(HTTP_IO_TIMEOUT, TcpStream::connect(addr))
            .await
            .expect("connect timeout")
            .expect("connect");
        timeout(HTTP_IO_TIMEOUT, stream.write_all(request.as_bytes()))
            .await
            .expect("write request timeout")
            .expect("write request");
        timeout(HTTP_IO_TIMEOUT, stream.flush())
            .await
            .expect("flush request timeout")
            .expect("flush request");
        timeout(HTTP_IO_TIMEOUT, stream.shutdown())
            .await
            .expect("shutdown request timeout")
            .expect("shutdown request");

        let mut buf = Vec::new();
        timeout(HTTP_IO_TIMEOUT, stream.read_to_end(&mut buf))
            .await
            .expect("read response timeout")
            .expect("read response");
        String::from_utf8(buf).expect("response utf8")
    }

    fn extract_body(response: &str) -> &str {
        response
            .split_once("\r\n\r\n")
            .map(|(_, body)| body)
            .expect("response body")
    }

    async fn reserve_udp_addr() -> io::Result<SocketAddr> {
        let socket = tokio::net::UdpSocket::bind("127.0.0.1:0").await?;
        let addr = socket.local_addr()?;
        drop(socket);
        Ok(addr)
    }

    fn derive_conn_id_for_service(service_name: &str) -> u64 {
        let hash = simple_hash32(service_name.as_bytes());
        let mut conn_id_bytes = [0u8; 8];
        conn_id_bytes.copy_from_slice(&hash[..8]);
        u64::from_le_bytes(conn_id_bytes).max(1)
    }

    fn seed_for_role(role: &str, conn_id: u64) -> [u8; 32] {
        let mut input = Vec::with_capacity(role.len() + 8);
        input.extend_from_slice(role.as_bytes());
        input.extend_from_slice(&conn_id.to_le_bytes());
        simple_hash32(input.as_slice())
    }

    fn mint_test_token(subject: &str) -> String {
        let key_path = temp_state_path("relay-tunnel-token").with_extension("relay-token-key.hex");
        let issuer = RelayTokenIssuer::load_or_create(RelayTokenIssuerConfig {
            signing_key_id: "relay-token-signing-v1".to_string(),
            signing_key_file: key_path,
            signing_seed_hex: Some(TEST_RELAY_SIGNING_SEED_HEX.to_string()),
            default_ttl_secs: DEFAULT_TOKEN_TTL_SECS,
        })
        .expect("token issuer");
        issuer
            .mint_relay_token(
                "default-relay",
                subject,
                Some(DEFAULT_TOKEN_TTL_SECS),
                crate::invite::now_unix_secs(),
            )
            .expect("mint relay token")
            .expose()
            .to_string()
    }

    fn loopback_datagram_addr(relay_addr: SocketAddr) -> SocketAddr {
        match relay_addr {
            SocketAddr::V4(_) => "127.0.0.1:0"
                .parse()
                .expect("static loopback socket must parse"),
            SocketAddr::V6(_) => "[::1]:0"
                .parse()
                .expect("static loopback socket must parse"),
        }
    }

    async fn send_mux_frame(
        channel: &RelayDatagramChannel,
        session: &mut SecureSession<DeterministicPrimitives>,
        stream_id: u32,
        frame: MuxFrame,
    ) {
        let payload = encode_mux_frame(&frame).expect("encode mux frame");
        let encrypted = session
            .encrypt_data(stream_id, payload.as_slice())
            .expect("encrypt mux frame");
        channel
            .send(encrypted.as_slice())
            .await
            .expect("send mux frame");
    }

    async fn send_tunnel_payload(
        channel: &RelayDatagramChannel,
        session: &mut SecureSession<DeterministicPrimitives>,
        stream_id: u32,
        message: TunnelMessage,
    ) {
        let payload = encode_tunnel_message(&message).expect("encode tunnel message");
        send_mux_frame(
            channel,
            session,
            stream_id,
            MuxFrame::Data { bytes: payload },
        )
        .await;
    }

    fn build_ipv4_tcp_packet(
        src_ip: std::net::Ipv4Addr,
        dst_ip: std::net::Ipv4Addr,
        src_port: u16,
        dst_port: u16,
        flags: u8,
        payload: &[u8],
    ) -> Vec<u8> {
        let total_len = 20 + 20 + payload.len();
        let mut packet = vec![0u8; total_len];
        packet[0] = 0x45;
        packet[2..4].copy_from_slice(&(total_len as u16).to_be_bytes());
        packet[8] = 64;
        packet[9] = 6;
        packet[12..16].copy_from_slice(&src_ip.octets());
        packet[16..20].copy_from_slice(&dst_ip.octets());
        packet[20..22].copy_from_slice(&src_port.to_be_bytes());
        packet[22..24].copy_from_slice(&dst_port.to_be_bytes());
        packet[32] = 5 << 4;
        packet[33] = flags;
        packet[34..36].copy_from_slice(&65535u16.to_be_bytes());
        packet[40..].copy_from_slice(payload);
        packet
    }

    fn extract_ipv4_tcp_payload(packet: &[u8]) -> Option<&[u8]> {
        if packet.len() < 40 || packet[0] >> 4 != 4 {
            return None;
        }
        let ihl = (packet[0] & 0x0f) as usize * 4;
        if ihl < 20 || packet.len() < ihl + 20 {
            return None;
        }
        let total_len = u16::from_be_bytes([packet[2], packet[3]]) as usize;
        if total_len < ihl + 20 || total_len > packet.len() {
            return None;
        }
        let data_offset = ((packet[ihl + 12] >> 4) as usize) * 4;
        if data_offset < 20 || ihl + data_offset > total_len {
            return None;
        }
        Some(&packet[ihl + data_offset..total_len])
    }
}
