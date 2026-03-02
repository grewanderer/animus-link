#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct HardeningReport {
    pub core_dumps_disabled: bool,
    pub dumpable_disabled: bool,
}

impl HardeningReport {
    pub fn fully_hardened(self) -> bool {
        self.core_dumps_disabled && self.dumpable_disabled
    }
}

/// Apply best-effort process hardening controls.
///
/// On Linux this attempts:
/// 1) RLIMIT_CORE=0
/// 2) PR_SET_DUMPABLE=0
///
/// Failures are reported through the returned booleans and do not panic.
pub fn apply_process_hardening() -> HardeningReport {
    #[cfg(target_os = "linux")]
    {
        let mut report = HardeningReport::default();

        // SAFETY: this calls libc process configuration APIs with valid arguments.
        unsafe {
            let limits = libc::rlimit {
                rlim_cur: 0,
                rlim_max: 0,
            };
            report.core_dumps_disabled = libc::setrlimit(libc::RLIMIT_CORE, &limits) == 0;
            report.dumpable_disabled = libc::prctl(libc::PR_SET_DUMPABLE, 0, 0, 0, 0) == 0;
        }

        report
    }

    #[cfg(not(target_os = "linux"))]
    {
        HardeningReport::default()
    }
}

#[cfg(test)]
mod tests {
    use super::apply_process_hardening;

    #[test]
    fn hardening_is_best_effort_non_panicking() {
        let _ = apply_process_hardening();
    }
}
