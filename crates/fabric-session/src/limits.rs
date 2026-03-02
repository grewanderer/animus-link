#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PreAuthLimits {
    pub max_packet_size: usize,
    pub per_ip_capacity: u32,
    pub per_ip_refill_per_sec: u32,
    pub global_capacity: u32,
    pub global_refill_per_sec: u32,
}

impl Default for PreAuthLimits {
    fn default() -> Self {
        Self {
            max_packet_size: 2048,
            per_ip_capacity: 32,
            per_ip_refill_per_sec: 16,
            global_capacity: 4096,
            global_refill_per_sec: 2048,
        }
    }
}
