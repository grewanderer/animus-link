use std::time::{SystemTime, UNIX_EPOCH};

use crate::errors::SessionError;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TimingConfig {
    pub discover_retry_delays_ms: [u64; 2],
    pub probe_direct_timeout_ms: u64,
    pub handshake_timeout_ms: u64,
    pub handshake_max_retries: u8,
    pub keepalive_interval_ms: u64,
    pub idle_timeout_ms: u64,
}

impl Default for TimingConfig {
    fn default() -> Self {
        Self {
            discover_retry_delays_ms: [250, 500],
            probe_direct_timeout_ms: 5_000,
            handshake_timeout_ms: 2_000,
            handshake_max_retries: 1,
            keepalive_interval_ms: 15_000,
            idle_timeout_ms: 90_000,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportPath {
    Direct,
    Relay,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseReason {
    DiscoveryTimeout,
    HandshakeTimeout,
    IdleTimeout,
    Manual,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DiscoverState {
    retry_count: u8,
    max_retries: u8,
    next_retry_deadline_ms: u64,
    next_backoff_index: usize,
}

impl DiscoverState {
    fn new(now_ms: u64, delays_ms: &[u64]) -> Self {
        let first_delay = delays_ms.first().copied().unwrap_or(0);
        Self {
            retry_count: 0,
            max_retries: delays_ms.len() as u8,
            next_retry_deadline_ms: now_ms.saturating_add(first_delay),
            next_backoff_index: usize::from(delays_ms.len() > 1),
        }
    }

    pub fn retry_count(self) -> u8 {
        self.retry_count
    }

    pub fn max_retries(self) -> u8 {
        self.max_retries
    }

    pub fn next_retry_deadline_ms(self) -> u64 {
        self.next_retry_deadline_ms
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProbeDirectState {
    started_at_ms: u64,
    deadline_ms: u64,
}

impl ProbeDirectState {
    fn new(now_ms: u64, timeout_ms: u64) -> Self {
        Self {
            started_at_ms: now_ms,
            deadline_ms: now_ms.saturating_add(timeout_ms),
        }
    }

    pub fn started_at_ms(self) -> u64 {
        self.started_at_ms
    }

    pub fn deadline_ms(self) -> u64 {
        self.deadline_ms
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HandshakeState {
    path: TransportPath,
    retry_count: u8,
    max_retries: u8,
    deadline_ms: u64,
    ephemeral_generation: u64,
}

impl HandshakeState {
    pub fn path(self) -> TransportPath {
        self.path
    }

    pub fn retry_count(self) -> u8 {
        self.retry_count
    }

    pub fn max_retries(self) -> u8 {
        self.max_retries
    }

    pub fn deadline_ms(self) -> u64 {
        self.deadline_ms
    }

    pub fn ephemeral_generation(self) -> u64 {
        self.ephemeral_generation
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EstablishedState {
    path: TransportPath,
    entered_at_ms: u64,
    last_activity_ms: u64,
    next_keepalive_deadline_ms: u64,
}

impl EstablishedState {
    fn new(now_ms: u64, path: TransportPath, keepalive_interval_ms: u64) -> Self {
        Self {
            path,
            entered_at_ms: now_ms,
            last_activity_ms: now_ms,
            next_keepalive_deadline_ms: now_ms.saturating_add(keepalive_interval_ms),
        }
    }

    pub fn path(self) -> TransportPath {
        self.path
    }

    pub fn entered_at_ms(self) -> u64 {
        self.entered_at_ms
    }

    pub fn last_activity_ms(self) -> u64 {
        self.last_activity_ms
    }

    pub fn next_keepalive_deadline_ms(self) -> u64 {
        self.next_keepalive_deadline_ms
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MigratingState {
    from_path: TransportPath,
    started_at_ms: u64,
}

impl MigratingState {
    pub fn from_path(self) -> TransportPath {
        self.from_path
    }

    pub fn started_at_ms(self) -> u64 {
        self.started_at_ms
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionState {
    Idle,
    Discover(DiscoverState),
    ProbeDirect(ProbeDirectState),
    Handshake(HandshakeState),
    Established(EstablishedState),
    Migrating(MigratingState),
    Closed(CloseReason),
}

impl SessionState {
    fn name(self) -> &'static str {
        match self {
            Self::Idle => "IDLE",
            Self::Discover(_) => "DISCOVER",
            Self::ProbeDirect(_) => "PROBE_DIRECT",
            Self::Handshake(_) => "HANDSHAKE",
            Self::Established(_) => "ESTABLISHED",
            Self::Migrating(_) => "MIGRATING",
            Self::Closed(_) => "CLOSED",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TickOutcome {
    Noop,
    DiscoverRetry {
        attempt: u8,
    },
    DiscoverTimeout,
    ProbeTimeoutFallbackToRelay {
        ephemeral_generation: u64,
    },
    HandshakeRetry {
        attempt: u8,
        path: TransportPath,
        ephemeral_generation: u64,
    },
    HandshakeFallbackToRelay {
        ephemeral_generation: u64,
    },
    HandshakeTimeout,
    KeepaliveDue,
    IdleTimeout,
}

#[derive(Debug)]
pub struct SessionStateMachine<C: Clock> {
    clock: C,
    timing: TimingConfig,
    state: SessionState,
    next_ephemeral_generation: u64,
}

impl<C: Clock> SessionStateMachine<C> {
    pub fn new(clock: C) -> Self {
        Self::with_timing(clock, TimingConfig::default())
    }

    pub fn with_timing(clock: C, timing: TimingConfig) -> Self {
        Self {
            clock,
            timing,
            state: SessionState::Idle,
            next_ephemeral_generation: 0,
        }
    }

    pub fn state(&self) -> SessionState {
        self.state
    }

    pub fn start(&mut self) -> Result<(), SessionError> {
        if !matches!(self.state, SessionState::Idle) {
            return Err(SessionError::InvalidTransition {
                state: self.state.name(),
            });
        }

        let now_ms = self.clock.now_millis();
        self.state = SessionState::Discover(DiscoverState::new(
            now_ms,
            &self.timing.discover_retry_delays_ms,
        ));
        Ok(())
    }

    pub fn on_discovery_success(&mut self) -> Result<(), SessionError> {
        if !matches!(self.state, SessionState::Discover(_)) {
            return Err(SessionError::InvalidTransition {
                state: self.state.name(),
            });
        }

        let now_ms = self.clock.now_millis();
        self.state = SessionState::ProbeDirect(ProbeDirectState::new(
            now_ms,
            self.timing.probe_direct_timeout_ms,
        ));
        Ok(())
    }

    pub fn on_probe_success(&mut self) -> Result<(), SessionError> {
        if !matches!(self.state, SessionState::ProbeDirect(_)) {
            return Err(SessionError::InvalidTransition {
                state: self.state.name(),
            });
        }

        let now_ms = self.clock.now_millis();
        self.state =
            SessionState::Handshake(self.new_handshake_state(now_ms, TransportPath::Direct));
        Ok(())
    }

    pub fn on_probe_failure(&mut self) -> Result<(), SessionError> {
        if !matches!(self.state, SessionState::ProbeDirect(_)) {
            return Err(SessionError::InvalidTransition {
                state: self.state.name(),
            });
        }

        let now_ms = self.clock.now_millis();
        self.state =
            SessionState::Handshake(self.new_handshake_state(now_ms, TransportPath::Relay));
        Ok(())
    }

    pub fn on_handshake_success(&mut self) -> Result<(), SessionError> {
        let path = match self.state {
            SessionState::Handshake(state) => state.path(),
            _ => {
                return Err(SessionError::InvalidTransition {
                    state: self.state.name(),
                });
            }
        };

        let now_ms = self.clock.now_millis();
        self.state = SessionState::Established(EstablishedState::new(
            now_ms,
            path,
            self.timing.keepalive_interval_ms,
        ));
        Ok(())
    }

    pub fn begin_migration(&mut self) -> Result<(), SessionError> {
        let path = match self.state {
            SessionState::Established(established) => established.path(),
            _ => {
                return Err(SessionError::InvalidTransition {
                    state: self.state.name(),
                });
            }
        };

        let now_ms = self.clock.now_millis();
        self.state = SessionState::Migrating(MigratingState {
            from_path: path,
            started_at_ms: now_ms,
        });
        Ok(())
    }

    pub fn complete_migration(&mut self, new_path: TransportPath) -> Result<(), SessionError> {
        if !matches!(self.state, SessionState::Migrating(_)) {
            return Err(SessionError::InvalidTransition {
                state: self.state.name(),
            });
        }

        let now_ms = self.clock.now_millis();
        self.state = SessionState::Established(EstablishedState::new(
            now_ms,
            new_path,
            self.timing.keepalive_interval_ms,
        ));
        Ok(())
    }

    pub fn note_activity(&mut self) -> Result<(), SessionError> {
        let mut state = match self.state {
            SessionState::Established(established) => established,
            _ => {
                return Err(SessionError::InvalidTransition {
                    state: self.state.name(),
                });
            }
        };

        state.last_activity_ms = self.clock.now_millis();
        self.state = SessionState::Established(state);
        Ok(())
    }

    pub fn close(&mut self, reason: CloseReason) {
        self.state = SessionState::Closed(reason);
    }

    pub fn tick(&mut self) -> TickOutcome {
        let now_ms = self.clock.now_millis();

        match self.state {
            SessionState::Idle | SessionState::Closed(_) | SessionState::Migrating(_) => {
                TickOutcome::Noop
            }
            SessionState::Discover(mut discover) => {
                if now_ms < discover.next_retry_deadline_ms {
                    return TickOutcome::Noop;
                }

                if discover.retry_count < discover.max_retries {
                    discover.retry_count += 1;
                    let delay = self
                        .timing
                        .discover_retry_delays_ms
                        .get(discover.next_backoff_index)
                        .copied()
                        .or_else(|| self.timing.discover_retry_delays_ms.last().copied())
                        .unwrap_or(0);
                    discover.next_retry_deadline_ms = now_ms.saturating_add(delay);
                    if discover.next_backoff_index + 1 < self.timing.discover_retry_delays_ms.len()
                    {
                        discover.next_backoff_index += 1;
                    }
                    self.state = SessionState::Discover(discover);
                    return TickOutcome::DiscoverRetry {
                        attempt: discover.retry_count,
                    };
                }

                self.state = SessionState::Closed(CloseReason::DiscoveryTimeout);
                TickOutcome::DiscoverTimeout
            }
            SessionState::ProbeDirect(probe) => {
                if now_ms < probe.deadline_ms {
                    return TickOutcome::Noop;
                }

                let handshake = self.new_handshake_state(now_ms, TransportPath::Relay);
                let generation = handshake.ephemeral_generation();
                self.state = SessionState::Handshake(handshake);
                TickOutcome::ProbeTimeoutFallbackToRelay {
                    ephemeral_generation: generation,
                }
            }
            SessionState::Handshake(mut handshake) => {
                if now_ms < handshake.deadline_ms() {
                    return TickOutcome::Noop;
                }

                if handshake.retry_count < handshake.max_retries {
                    handshake.retry_count += 1;
                    handshake.deadline_ms = now_ms.saturating_add(self.timing.handshake_timeout_ms);
                    handshake.ephemeral_generation = self.allocate_ephemeral_generation();
                    self.state = SessionState::Handshake(handshake);
                    return TickOutcome::HandshakeRetry {
                        attempt: handshake.retry_count,
                        path: handshake.path,
                        ephemeral_generation: handshake.ephemeral_generation,
                    };
                }

                if handshake.path == TransportPath::Direct {
                    let relay_handshake = self.new_handshake_state(now_ms, TransportPath::Relay);
                    let generation = relay_handshake.ephemeral_generation();
                    self.state = SessionState::Handshake(relay_handshake);
                    return TickOutcome::HandshakeFallbackToRelay {
                        ephemeral_generation: generation,
                    };
                }

                self.state = SessionState::Closed(CloseReason::HandshakeTimeout);
                TickOutcome::HandshakeTimeout
            }
            SessionState::Established(mut established) => {
                if now_ms.saturating_sub(established.last_activity_ms)
                    >= self.timing.idle_timeout_ms
                {
                    self.state = SessionState::Closed(CloseReason::IdleTimeout);
                    return TickOutcome::IdleTimeout;
                }

                if now_ms >= established.next_keepalive_deadline_ms {
                    established.next_keepalive_deadline_ms =
                        now_ms.saturating_add(self.timing.keepalive_interval_ms);
                    self.state = SessionState::Established(established);
                    return TickOutcome::KeepaliveDue;
                }

                TickOutcome::Noop
            }
        }
    }

    fn new_handshake_state(&mut self, now_ms: u64, path: TransportPath) -> HandshakeState {
        HandshakeState {
            path,
            retry_count: 0,
            max_retries: self.timing.handshake_max_retries,
            deadline_ms: now_ms.saturating_add(self.timing.handshake_timeout_ms),
            ephemeral_generation: self.allocate_ephemeral_generation(),
        }
    }

    fn allocate_ephemeral_generation(&mut self) -> u64 {
        self.next_ephemeral_generation = self.next_ephemeral_generation.saturating_add(1);
        self.next_ephemeral_generation
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    };

    use super::{
        Clock, CloseReason, SessionState, SessionStateMachine, TickOutcome, TimingConfig,
        TransportPath,
    };

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

        fn advance_ms(&self, delta_ms: u64) {
            self.now_ms.fetch_add(delta_ms, Ordering::Relaxed);
        }
    }

    impl Clock for ManualClock {
        fn now_millis(&self) -> u64 {
            self.now_ms.load(Ordering::Relaxed)
        }
    }

    #[test]
    fn transitions_direct_path_to_established() {
        let clock = ManualClock::new(0);
        let mut machine = SessionStateMachine::new(clock);

        machine.start().unwrap();
        assert!(matches!(machine.state(), SessionState::Discover(_)));

        machine.on_discovery_success().unwrap();
        assert!(matches!(machine.state(), SessionState::ProbeDirect(_)));

        machine.on_probe_success().unwrap();
        let handshake = match machine.state() {
            SessionState::Handshake(handshake) => handshake,
            state => panic!("expected handshake state, got {state:?}"),
        };
        assert_eq!(handshake.path(), TransportPath::Direct);
        assert_eq!(handshake.retry_count(), 0);
        assert_eq!(handshake.ephemeral_generation(), 1);

        machine.on_handshake_success().unwrap();
        let established = match machine.state() {
            SessionState::Established(established) => established,
            state => panic!("expected established state, got {state:?}"),
        };
        assert_eq!(established.path(), TransportPath::Direct);
    }

    #[test]
    fn probe_timeout_falls_back_to_relay_handshake() {
        let clock = ManualClock::new(0);
        let mut machine = SessionStateMachine::new(clock.clone());
        machine.start().unwrap();
        machine.on_discovery_success().unwrap();

        clock.advance_ms(5_000);
        let outcome = machine.tick();
        assert!(matches!(
            outcome,
            TickOutcome::ProbeTimeoutFallbackToRelay { .. }
        ));

        let handshake = match machine.state() {
            SessionState::Handshake(handshake) => handshake,
            state => panic!("expected handshake state, got {state:?}"),
        };
        assert_eq!(handshake.path(), TransportPath::Relay);
    }

    #[test]
    fn deterministic_discover_retry_schedule_and_timeout() {
        let clock = ManualClock::new(0);
        let mut machine = SessionStateMachine::new(clock.clone());
        machine.start().unwrap();

        assert_eq!(machine.tick(), TickOutcome::Noop);

        clock.advance_ms(250);
        assert_eq!(machine.tick(), TickOutcome::DiscoverRetry { attempt: 1 });

        clock.advance_ms(499);
        assert_eq!(machine.tick(), TickOutcome::Noop);

        clock.advance_ms(1);
        assert_eq!(machine.tick(), TickOutcome::DiscoverRetry { attempt: 2 });

        clock.advance_ms(500);
        assert_eq!(machine.tick(), TickOutcome::DiscoverTimeout);
        assert!(matches!(
            machine.state(),
            SessionState::Closed(CloseReason::DiscoveryTimeout)
        ));
    }

    #[test]
    fn handshake_retry_then_relay_fallback_then_timeout() {
        let clock = ManualClock::new(0);
        let mut machine = SessionStateMachine::new(clock.clone());
        machine.start().unwrap();
        machine.on_discovery_success().unwrap();
        machine.on_probe_success().unwrap(); // direct handshake, generation=1

        clock.advance_ms(2_000);
        assert_eq!(
            machine.tick(),
            TickOutcome::HandshakeRetry {
                attempt: 1,
                path: TransportPath::Direct,
                ephemeral_generation: 2
            }
        );

        clock.advance_ms(2_000);
        assert_eq!(
            machine.tick(),
            TickOutcome::HandshakeFallbackToRelay {
                ephemeral_generation: 3
            }
        );

        clock.advance_ms(2_000);
        assert_eq!(
            machine.tick(),
            TickOutcome::HandshakeRetry {
                attempt: 1,
                path: TransportPath::Relay,
                ephemeral_generation: 4
            }
        );

        clock.advance_ms(2_000);
        assert_eq!(machine.tick(), TickOutcome::HandshakeTimeout);
        assert!(matches!(
            machine.state(),
            SessionState::Closed(CloseReason::HandshakeTimeout)
        ));
    }

    #[test]
    fn established_keepalive_and_idle_timeout_are_deterministic() {
        let clock = ManualClock::new(0);
        let mut machine = SessionStateMachine::new(clock.clone());
        machine.start().unwrap();
        machine.on_discovery_success().unwrap();
        machine.on_probe_success().unwrap();
        machine.on_handshake_success().unwrap();

        clock.advance_ms(15_000);
        assert_eq!(machine.tick(), TickOutcome::KeepaliveDue);

        clock.advance_ms(75_000);
        assert_eq!(machine.tick(), TickOutcome::IdleTimeout);
        assert!(matches!(
            machine.state(),
            SessionState::Closed(CloseReason::IdleTimeout)
        ));
    }

    #[test]
    fn custom_timing_config_is_respected() {
        let clock = ManualClock::new(0);
        let timing = TimingConfig {
            discover_retry_delays_ms: [10, 20],
            probe_direct_timeout_ms: 30,
            handshake_timeout_ms: 40,
            handshake_max_retries: 0,
            keepalive_interval_ms: 50,
            idle_timeout_ms: 60,
        };
        let mut machine = SessionStateMachine::with_timing(clock.clone(), timing);
        machine.start().unwrap();
        machine.on_discovery_success().unwrap();

        clock.advance_ms(30);
        assert!(matches!(
            machine.tick(),
            TickOutcome::ProbeTimeoutFallbackToRelay { .. }
        ));
    }
}
