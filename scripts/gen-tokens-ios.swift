#!/usr/bin/env swift
import Foundation

// Deterministic token generation entrypoint for iOS outputs.
// Delegates to the Rust generator so all platform outputs share one source.
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
process.arguments = ["cargo", "run", "-p", "design-token-gen"]
process.standardOutput = FileHandle.standardOutput
process.standardError = FileHandle.standardError

do {
    try process.run()
    process.waitUntilExit()
    if process.terminationStatus != 0 {
        exit(process.terminationStatus)
    }
} catch {
    fputs("failed to run design-token-gen: \(error)\n", stderr)
    exit(1)
}
