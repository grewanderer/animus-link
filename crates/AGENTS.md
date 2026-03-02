# AGENTS.md — crates/

## Rust style
- Prefer small modules with explicit error enums.
- No panics in library code (use Result).
- Use `zeroize` for secret buffers.
- Keep pre-auth code allocation-bounded.

## Testing
- Add unit tests next to the module, and conformance-backed tests when relevant.
