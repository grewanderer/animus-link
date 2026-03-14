#!/usr/bin/env node
/**
 * Deterministic token generation entrypoint for web outputs.
 * Delegates to the Rust generator so all platforms stay in sync.
 */
const { spawnSync } = require("node:child_process");

const result = spawnSync("cargo", ["run", "-p", "design-token-gen"], {
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
