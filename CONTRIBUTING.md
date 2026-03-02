# Contributing

- Follow the specs in `spec/` — they are normative.
- Do not add new protocol behavior without updating:
  1) spec
  2) conformance vectors
  3) tests

## Development
```bash
cargo fmt
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```
