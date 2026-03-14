import java.lang.ProcessBuilder

/**
 * Deterministic token generation entrypoint for Android outputs.
 * Delegates to the Rust generator so all platform outputs share one source.
 */
fun main() {
    val process = ProcessBuilder("cargo", "run", "-p", "design-token-gen")
        .inheritIO()
        .start()
    val code = process.waitFor()
    if (code != 0) {
        throw RuntimeException("design-token-gen failed with exit code $code")
    }
}
