## What changed
- 

## Why
- 

## Spec / Conformance impact
- [ ] No wire-visible changes
- [ ] Updated spec docs
- [ ] Updated conformance vectors
- [ ] Added/updated tests

## Security checklist
- [ ] No secrets in logs
- [ ] Pre-auth paths are bounded/rate-limited (if touched)
- [ ] Keys/tokens stored via keystore interface (if touched)

## How to test
- `cargo test --workspace`
- `cargo run -p conformance-runner -- --run all`
