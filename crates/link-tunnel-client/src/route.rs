use std::net::SocketAddr;

use crate::client::TunnelClientError;

#[derive(Debug, Clone)]
pub struct RouteConfig {
    pub tun_name: String,
    pub protected_endpoints: Vec<SocketAddr>,
    pub exclude_cidrs: Vec<String>,
    pub allow_lan: bool,
}

pub trait RouteManager: Send {
    fn apply_full_tunnel_routes(&mut self, config: &RouteConfig) -> Result<(), TunnelClientError>;
    fn restore_routes(&mut self) -> Result<(), TunnelClientError>;
    fn apply_dns_remote(&mut self, local_dns: SocketAddr) -> Result<(), TunnelClientError>;
    fn restore_dns(&mut self) -> Result<(), TunnelClientError>;
    fn apply_fail_closed_block(&mut self, config: &RouteConfig) -> Result<(), TunnelClientError>;
}
