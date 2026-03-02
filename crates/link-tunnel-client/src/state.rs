#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TunnelState {
    Disabled,
    Enabling,
    Connecting,
    Connected,
    Degraded,
    Disabling,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TunnelFailMode {
    OpenFast,
    Closed,
}

#[derive(Debug, Clone, Copy)]
pub struct TunnelTiming {
    pub connect_timeout_ms: u64,
    pub reconnect_backoff_start_ms: u64,
    pub reconnect_backoff_cap_ms: u64,
    pub open_fast_grace_ms: u64,
}

impl Default for TunnelTiming {
    fn default() -> Self {
        Self {
            connect_timeout_ms: 800,
            reconnect_backoff_start_ms: 200,
            reconnect_backoff_cap_ms: 2000,
            open_fast_grace_ms: 500,
        }
    }
}

pub trait Clock: Clone + Send + Sync + 'static {
    fn now_ms(&self) -> u64;
}

#[derive(Debug, Clone, Copy)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StateAction {
    None,
    RestoreRoutesFast,
    ApplyFailClosedBlock,
    AttemptReconnect,
}

#[derive(Debug, Clone)]
pub struct TunnelStateMachine<C: Clock> {
    clock: C,
    pub state: TunnelState,
    fail_mode: TunnelFailMode,
    timing: TunnelTiming,
    connect_deadline_ms: Option<u64>,
    reconnect_at_ms: Option<u64>,
    open_fast_grace_deadline_ms: Option<u64>,
    reconnect_backoff_ms: u64,
}

impl<C: Clock> TunnelStateMachine<C> {
    pub fn new(clock: C, fail_mode: TunnelFailMode, timing: TunnelTiming) -> Self {
        Self {
            clock,
            state: TunnelState::Disabled,
            fail_mode,
            timing,
            connect_deadline_ms: None,
            reconnect_at_ms: None,
            open_fast_grace_deadline_ms: None,
            reconnect_backoff_ms: timing.reconnect_backoff_start_ms.max(1),
        }
    }

    pub fn enable(&mut self) {
        self.state = TunnelState::Enabling;
        self.connect_deadline_ms = None;
        self.reconnect_at_ms = None;
        self.open_fast_grace_deadline_ms = None;
        self.reconnect_backoff_ms = self.timing.reconnect_backoff_start_ms.max(1);
    }

    pub fn routes_applied(&mut self) {
        if self.state == TunnelState::Enabling {
            self.state = TunnelState::Connecting;
            self.connect_deadline_ms = Some(self.clock.now_ms() + self.timing.connect_timeout_ms);
        }
    }

    pub fn connected(&mut self) {
        self.state = TunnelState::Connected;
        self.connect_deadline_ms = None;
        self.reconnect_at_ms = None;
        self.open_fast_grace_deadline_ms = None;
        self.reconnect_backoff_ms = self.timing.reconnect_backoff_start_ms.max(1);
    }

    pub fn dropped(&mut self) -> StateAction {
        let now = self.clock.now_ms();
        self.state = TunnelState::Degraded;
        self.connect_deadline_ms = None;
        self.reconnect_at_ms = Some(now + self.reconnect_backoff_ms);
        self.reconnect_backoff_ms = (self.reconnect_backoff_ms.saturating_mul(2))
            .min(self.timing.reconnect_backoff_cap_ms.max(1));
        match self.fail_mode {
            TunnelFailMode::OpenFast => {
                if self.open_fast_grace_deadline_ms.is_none() {
                    self.open_fast_grace_deadline_ms = Some(now + self.timing.open_fast_grace_ms);
                }
                StateAction::None
            }
            TunnelFailMode::Closed => {
                self.open_fast_grace_deadline_ms = None;
                StateAction::ApplyFailClosedBlock
            }
        }
    }

    pub fn disable(&mut self) {
        self.state = TunnelState::Disabling;
        self.connect_deadline_ms = None;
        self.reconnect_at_ms = None;
        self.open_fast_grace_deadline_ms = None;
        self.state = TunnelState::Disabled;
    }

    pub fn tick(&mut self) -> StateAction {
        let now = self.clock.now_ms();
        if self.state == TunnelState::Connecting {
            if let Some(deadline) = self.connect_deadline_ms {
                if now >= deadline {
                    return self.dropped();
                }
            }
        }
        if self.state == TunnelState::Degraded {
            if self.fail_mode == TunnelFailMode::OpenFast {
                if let Some(deadline) = self.open_fast_grace_deadline_ms {
                    if now >= deadline {
                        self.open_fast_grace_deadline_ms = None;
                        return StateAction::RestoreRoutesFast;
                    }
                }
            }
            if let Some(reconnect_at) = self.reconnect_at_ms {
                if now >= reconnect_at {
                    self.state = TunnelState::Connecting;
                    self.connect_deadline_ms = Some(now + self.timing.connect_timeout_ms);
                    self.reconnect_at_ms = None;
                    return StateAction::AttemptReconnect;
                }
            }
        }
        StateAction::None
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    };

    use super::{
        Clock, StateAction, TunnelFailMode, TunnelState, TunnelStateMachine, TunnelTiming,
    };

    #[derive(Clone)]
    struct TestClock {
        now: Arc<AtomicU64>,
    }

    impl TestClock {
        fn new(now: u64) -> Self {
            Self {
                now: Arc::new(AtomicU64::new(now)),
            }
        }

        fn advance(&self, delta: u64) {
            self.now.fetch_add(delta, Ordering::Relaxed);
        }
    }

    impl Clock for TestClock {
        fn now_ms(&self) -> u64 {
            self.now.load(Ordering::Relaxed)
        }
    }

    #[test]
    fn connecting_timeout_fails_open_fast() {
        let clock = TestClock::new(10);
        let mut machine = TunnelStateMachine::new(
            clock.clone(),
            TunnelFailMode::OpenFast,
            TunnelTiming::default(),
        );
        machine.enable();
        machine.routes_applied();
        assert_eq!(machine.state, TunnelState::Connecting);
        clock.advance(900);
        assert_eq!(machine.tick(), StateAction::None);
        assert_eq!(machine.state, TunnelState::Degraded);
        clock.advance(500);
        assert_eq!(machine.tick(), StateAction::RestoreRoutesFast);
    }

    #[test]
    fn connecting_timeout_fails_closed() {
        let clock = TestClock::new(10);
        let mut machine = TunnelStateMachine::new(
            clock.clone(),
            TunnelFailMode::Closed,
            TunnelTiming::default(),
        );
        machine.enable();
        machine.routes_applied();
        clock.advance(900);
        assert_eq!(machine.tick(), StateAction::ApplyFailClosedBlock);
        assert_eq!(machine.state, TunnelState::Degraded);
    }

    #[test]
    fn degraded_reconnect_uses_backoff() {
        let clock = TestClock::new(1);
        let mut machine = TunnelStateMachine::new(
            clock.clone(),
            TunnelFailMode::OpenFast,
            TunnelTiming::default(),
        );
        machine.enable();
        machine.routes_applied();
        assert_eq!(machine.dropped(), StateAction::None);
        assert_eq!(machine.state, TunnelState::Degraded);
        clock.advance(199);
        assert_eq!(machine.tick(), StateAction::None);
        clock.advance(1);
        assert_eq!(machine.tick(), StateAction::AttemptReconnect);
        assert_eq!(machine.state, TunnelState::Connecting);
    }

    #[test]
    fn open_fast_transient_recovery_before_grace_does_not_restore_routes() {
        let clock = TestClock::new(0);
        let mut machine = TunnelStateMachine::new(
            clock.clone(),
            TunnelFailMode::OpenFast,
            TunnelTiming::default(),
        );
        machine.enable();
        machine.routes_applied();
        assert_eq!(machine.dropped(), StateAction::None);
        clock.advance(200);
        assert_eq!(machine.tick(), StateAction::AttemptReconnect);
        machine.connected();
        clock.advance(600);
        assert_eq!(machine.tick(), StateAction::None);
        assert_eq!(machine.state, TunnelState::Connected);
    }

    #[test]
    fn disable_is_deterministic() {
        let clock = TestClock::new(0);
        let mut machine =
            TunnelStateMachine::new(clock, TunnelFailMode::OpenFast, TunnelTiming::default());
        machine.enable();
        machine.routes_applied();
        machine.connected();
        machine.disable();
        assert_eq!(machine.state, TunnelState::Disabled);
    }
}
