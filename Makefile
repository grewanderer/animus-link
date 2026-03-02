.PHONY: fmt lint test conformance build

build:
	cargo build --workspace

fmt:
	cargo fmt --all

lint:
	cargo clippy --workspace --all-targets -- -D warnings

test:
	cargo test --workspace

conformance:
	cargo run -p conformance-runner -- --run all
