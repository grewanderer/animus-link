use std::{
    collections::HashMap,
    net::IpAddr,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::limits::PreAuthLimits;

pub trait Clock {
    fn now_millis(&self) -> u64;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_millis(&self) -> u64 {
        match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(duration) => duration.as_millis() as u64,
            Err(_) => 0,
        }
    }
}

pub trait PreAuthGate {
    fn allow_packet(&mut self, src: IpAddr, packet_len: usize) -> bool;
}

#[derive(Debug, Clone, Copy)]
struct TokenBucket {
    capacity_milli: u64,
    tokens_milli: u64,
    refill_per_sec: u32,
    last_refill_ms: u64,
}

impl TokenBucket {
    const TOKEN_SCALE: u64 = 1000;

    fn new(capacity: u32, refill_per_sec: u32, now_ms: u64) -> Self {
        let capacity_milli = u64::from(capacity).saturating_mul(Self::TOKEN_SCALE);
        Self {
            capacity_milli,
            tokens_milli: capacity_milli,
            refill_per_sec,
            last_refill_ms: now_ms,
        }
    }

    fn refill(&mut self, now_ms: u64) {
        let elapsed_ms = now_ms.saturating_sub(self.last_refill_ms);
        if elapsed_ms == 0 {
            return;
        }

        let refill = elapsed_ms.saturating_mul(u64::from(self.refill_per_sec));
        self.tokens_milli = self
            .capacity_milli
            .min(self.tokens_milli.saturating_add(refill));
        self.last_refill_ms = now_ms;
    }

    fn can_spend(&mut self, now_ms: u64, tokens: u32) -> bool {
        self.refill(now_ms);
        let needed = u64::from(tokens).saturating_mul(Self::TOKEN_SCALE);
        self.tokens_milli >= needed
    }

    fn spend(&mut self, tokens: u32) -> bool {
        let needed = u64::from(tokens).saturating_mul(Self::TOKEN_SCALE);
        if self.tokens_milli < needed {
            return false;
        }
        self.tokens_milli -= needed;
        true
    }
}

#[derive(Debug)]
pub struct TokenBucketPreAuthGate<C: Clock> {
    limits: PreAuthLimits,
    clock: C,
    global: TokenBucket,
    per_ip: HashMap<IpAddr, TokenBucket>,
}

impl<C: Clock> TokenBucketPreAuthGate<C> {
    pub fn new(limits: PreAuthLimits, clock: C) -> Self {
        let now_ms = clock.now_millis();
        Self {
            limits,
            clock,
            global: TokenBucket::new(limits.global_capacity, limits.global_refill_per_sec, now_ms),
            per_ip: HashMap::new(),
        }
    }

    pub fn limits(&self) -> PreAuthLimits {
        self.limits
    }
}

impl<C: Clock> PreAuthGate for TokenBucketPreAuthGate<C> {
    fn allow_packet(&mut self, src: IpAddr, packet_len: usize) -> bool {
        if packet_len > self.limits.max_packet_size {
            return false;
        }

        let now_ms = self.clock.now_millis();
        let per_ip_allowed = {
            let per_ip_bucket = self.per_ip.entry(src).or_insert_with(|| {
                TokenBucket::new(
                    self.limits.per_ip_capacity,
                    self.limits.per_ip_refill_per_sec,
                    now_ms,
                )
            });
            per_ip_bucket.can_spend(now_ms, 1)
        };
        let global_allowed = self.global.can_spend(now_ms, 1);
        if !per_ip_allowed || !global_allowed {
            return false;
        }

        let spent_global = self.global.spend(1);
        let spent_per_ip = self
            .per_ip
            .get_mut(&src)
            .map(|bucket| bucket.spend(1))
            .unwrap_or(false);
        debug_assert!(spent_global && spent_per_ip);
        spent_global && spent_per_ip
    }
}

#[cfg(test)]
mod tests {
    use std::{
        net::{IpAddr, Ipv4Addr},
        sync::{
            atomic::{AtomicU64, Ordering},
            Arc,
        },
    };

    use super::{Clock, PreAuthGate, TokenBucketPreAuthGate};
    use crate::limits::PreAuthLimits;

    #[derive(Clone)]
    struct ManualClock {
        now_ms: Arc<AtomicU64>,
    }

    impl ManualClock {
        fn new(now_ms: u64) -> Self {
            Self {
                now_ms: Arc::new(AtomicU64::new(now_ms)),
            }
        }

        fn advance_ms(&self, amount: u64) {
            self.now_ms.fetch_add(amount, Ordering::Relaxed);
        }
    }

    impl Clock for ManualClock {
        fn now_millis(&self) -> u64 {
            self.now_ms.load(Ordering::Relaxed)
        }
    }

    fn ip(n: u8) -> IpAddr {
        IpAddr::V4(Ipv4Addr::new(192, 0, 2, n))
    }

    #[test]
    fn enforces_max_packet_size() {
        let limits = PreAuthLimits {
            max_packet_size: 1200,
            per_ip_capacity: 10,
            per_ip_refill_per_sec: 10,
            global_capacity: 10,
            global_refill_per_sec: 10,
        };
        let clock = ManualClock::new(0);
        let mut gate = TokenBucketPreAuthGate::new(limits, clock);

        assert!(!gate.allow_packet(ip(1), 1201));
        assert!(gate.allow_packet(ip(1), 1200));
    }

    #[test]
    fn enforces_per_ip_limit_deterministically() {
        let limits = PreAuthLimits {
            max_packet_size: 1200,
            per_ip_capacity: 2,
            per_ip_refill_per_sec: 1,
            global_capacity: 100,
            global_refill_per_sec: 100,
        };
        let clock = ManualClock::new(0);
        let mut gate = TokenBucketPreAuthGate::new(limits, clock.clone());

        assert!(gate.allow_packet(ip(1), 200));
        assert!(gate.allow_packet(ip(1), 200));
        assert!(!gate.allow_packet(ip(1), 200));

        // Different source still has its own budget.
        assert!(gate.allow_packet(ip(2), 200));

        // Refill one token after 1 second.
        clock.advance_ms(1000);
        assert!(gate.allow_packet(ip(1), 200));
    }

    #[test]
    fn enforces_global_limit_deterministically() {
        let limits = PreAuthLimits {
            max_packet_size: 1200,
            per_ip_capacity: 10,
            per_ip_refill_per_sec: 10,
            global_capacity: 2,
            global_refill_per_sec: 1,
        };
        let clock = ManualClock::new(0);
        let mut gate = TokenBucketPreAuthGate::new(limits, clock.clone());

        assert!(gate.allow_packet(ip(1), 300));
        assert!(gate.allow_packet(ip(2), 300));
        assert!(!gate.allow_packet(ip(3), 300));

        // Refill one global token after 1 second.
        clock.advance_ms(1000);
        assert!(gate.allow_packet(ip(3), 300));
    }
}
