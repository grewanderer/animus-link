#![allow(clippy::empty_line_after_doc_comments)]

pub mod api;
pub mod errors;

pub use api::Status;
pub use api::TunnelRuntimeStatus;
pub use errors::FabricError;

pub fn version() -> String {
    api::version()
}

pub fn status() -> Status {
    api::status()
}

pub fn invite_create() -> String {
    api::invite_create()
}

pub fn invite_join(invite: String) -> Result<(), FabricError> {
    api::invite_join(invite)
}

#[allow(clippy::too_many_arguments)]
pub fn android_tunnel_enable(
    tun_fd: i32,
    relay_addr: String,
    relay_token: String,
    relay_ttl_secs: u32,
    conn_id: u64,
    gateway_service: String,
    peer_id: String,
    fail_mode: String,
    dns_mode: String,
    protected_endpoints: Vec<String>,
    exclude_cidrs: Vec<String>,
    allow_lan: bool,
    mtu: u16,
    max_ip_packet_bytes: u32,
) -> Result<TunnelRuntimeStatus, FabricError> {
    api::android_tunnel_enable(
        tun_fd,
        relay_addr,
        relay_token,
        relay_ttl_secs,
        conn_id,
        gateway_service,
        peer_id,
        fail_mode,
        dns_mode,
        protected_endpoints,
        exclude_cidrs,
        allow_lan,
        mtu,
        max_ip_packet_bytes,
    )
}

pub fn android_tunnel_status() -> TunnelRuntimeStatus {
    api::android_tunnel_status()
}

pub fn android_tunnel_disable() -> TunnelRuntimeStatus {
    api::android_tunnel_disable()
}

uniffi::include_scaffolding!("fabric");
