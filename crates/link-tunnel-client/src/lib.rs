mod client;
mod route;
mod state;
mod tun;

#[cfg(target_os = "android")]
pub use client::start_android_tunnel_client;
pub use client::{
    detect_dns_capabilities, start_default_tunnel_client,
    start_default_tunnel_client_with_prewarmer, start_session_prewarmer, MockRouteManager,
    MockTunDevice, SessionPrewarmSnapshot, SessionPrewarmState, SessionPrewarmerHandle,
    TunnelClientConfig, TunnelClientCounters, TunnelClientError, TunnelClientHandle,
    TunnelClientSnapshot, TunnelDnsCapabilities, TunnelDnsMode, TunnelFailMode, TunnelState,
};
pub use route::{RouteConfig, RouteManager};
pub use state::{SystemClock, TunnelStateMachine, TunnelTiming};
pub use tun::TunDevice;
