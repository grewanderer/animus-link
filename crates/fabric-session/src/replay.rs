/// Anti-replay window (MVP): W=4096.
///
/// Bitmap layout:
/// - bit 0 represents `max_pn`
/// - bit 1 represents `max_pn - 1`
/// - ...
/// - bit 4095 represents `max_pn - 4095`
///
/// Any packet with `pn <= max_pn - 4096` is outside the window and rejected.
#[derive(Debug, Clone)]
pub struct AntiReplay {
    initialized: bool,
    max_pn: u64,
    seen: [u64; Self::WORD_COUNT],
}

impl AntiReplay {
    pub const WINDOW_SIZE: u64 = 4096;
    const WORD_BITS: usize = 64;
    const WORD_COUNT: usize = (Self::WINDOW_SIZE as usize) / Self::WORD_BITS;

    pub fn new() -> Self {
        Self {
            initialized: false,
            max_pn: 0,
            seen: [0; Self::WORD_COUNT],
        }
    }

    pub fn max_pn(&self) -> Option<u64> {
        if self.initialized {
            return Some(self.max_pn);
        }
        None
    }

    pub fn accept(&mut self, pn: u64) -> bool {
        if !self.initialized {
            self.initialized = true;
            self.max_pn = pn;
            self.mark_seen(0);
            return true;
        }

        if pn > self.max_pn {
            let shift = pn - self.max_pn;
            self.shift_window(shift);
            self.max_pn = pn;
            self.mark_seen(0);
            return true;
        }

        let diff = self.max_pn - pn;
        if diff >= Self::WINDOW_SIZE {
            return false;
        }

        if self.is_seen(diff as usize) {
            return false;
        }
        self.mark_seen(diff as usize);
        true
    }

    fn shift_window(&mut self, shift: u64) {
        if shift >= Self::WINDOW_SIZE {
            self.seen = [0; Self::WORD_COUNT];
            return;
        }

        let word_shift = (shift / Self::WORD_BITS as u64) as usize;
        let bit_shift = (shift % Self::WORD_BITS as u64) as usize;
        let mut shifted = [0u64; Self::WORD_COUNT];

        for (index, word) in self.seen.iter().copied().enumerate() {
            if word == 0 {
                continue;
            }

            let target = index + word_shift;
            if target >= Self::WORD_COUNT {
                continue;
            }

            shifted[target] |= word << bit_shift;
            if bit_shift > 0 && target + 1 < Self::WORD_COUNT {
                shifted[target + 1] |= word >> (Self::WORD_BITS - bit_shift);
            }
        }

        self.seen = shifted;
    }

    fn is_seen(&self, bit_index: usize) -> bool {
        let word = bit_index / Self::WORD_BITS;
        let bit = bit_index % Self::WORD_BITS;
        (self.seen[word] & (1u64 << bit)) != 0
    }

    fn mark_seen(&mut self, bit_index: usize) {
        let word = bit_index / Self::WORD_BITS;
        let bit = bit_index % Self::WORD_BITS;
        self.seen[word] |= 1u64 << bit;
    }
}

impl Default for AntiReplay {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::AntiReplay;

    #[test]
    fn rejects_duplicates() {
        let mut replay = AntiReplay::new();
        assert!(replay.accept(10));
        assert!(!replay.accept(10));
        assert!(replay.accept(11));
        assert!(!replay.accept(11));
    }

    #[test]
    fn accepts_out_of_order_packets_inside_window() {
        let mut replay = AntiReplay::new();
        assert!(replay.accept(100));
        assert!(replay.accept(110));
        assert!(replay.accept(108));
        assert!(replay.accept(109));
        assert!(replay.accept(101));
        assert!(!replay.accept(108));
    }

    #[test]
    fn enforces_window_boundary_at_max_minus_4096() {
        let mut replay = AntiReplay::new();
        assert!(replay.accept(4096));
        assert!(replay.accept(8192));
        assert!(!replay.accept(4096)); // diff = 4096 => outside window
        assert!(replay.accept(4097)); // diff = 4095 => inside window
    }

    #[test]
    fn large_jump_clears_old_history() {
        let mut replay = AntiReplay::new();
        assert!(replay.accept(5));
        assert!(replay.accept(9));
        assert!(replay.accept(50_000)); // clears old window
        assert!(replay.accept(50_000 - 4095)); // still inside window
        assert!(!replay.accept(50_000)); // duplicate of max
        assert!(!replay.accept(5)); // far outside window after large jump
    }

    #[test]
    fn handles_shift_across_bitmap_word_boundaries() {
        let mut replay = AntiReplay::new();
        assert!(replay.accept(1));
        assert!(replay.accept(64));
        assert!(replay.accept(65));
        assert!(replay.accept(129));
        assert!(replay.accept(128));
        assert!(!replay.accept(128));
    }
}
