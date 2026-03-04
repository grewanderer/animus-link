package com.animus.link.ui

private const val MASK_HEAD = 18
private const val MASK_TAIL = 6

fun maskInvite(invite: String): String {
    val trimmed = invite.trim()
    if (trimmed.isEmpty()) {
        return "(empty)"
    }
    if (trimmed.length <= MASK_HEAD + MASK_TAIL) {
        return "****"
    }
    return buildString {
        append(trimmed.take(MASK_HEAD))
        append("…")
        append(trimmed.takeLast(MASK_TAIL))
    }
}

fun splitCsvClean(value: String): List<String> {
    return value
        .split(',')
        .map { it.trim() }
        .filter { it.isNotEmpty() }
}

fun redactSensitive(value: String): String {
    var out = value
    out = out.replace(Regex("animus://invite/[^\\s\"']+"), "animus://invite/[redacted]")
    out = out.replace(Regex("animus://rtok/[^\\s\"']+"), "animus://rtok/[redacted]")
    return out
}

fun parseRadiusDp(remToken: String): Float {
    val normalized = remToken.trim().lowercase()
    if (!normalized.endsWith("rem")) {
        return 12.0f
    }
    val rem = normalized.removeSuffix("rem").trim().toFloatOrNull() ?: return 12.0f
    return (rem * 16.0f).coerceIn(4.0f, 28.0f)
}
