# AGENTS.md — apps/

## Security
- Never print secrets in logs.
- Default RUST_LOG should not include debug-level protocol dumps.
- Expose network services on loopback by default unless explicitly configured.

## UX/API
- Keep Link daemon API stable and versioned (even if internal).
