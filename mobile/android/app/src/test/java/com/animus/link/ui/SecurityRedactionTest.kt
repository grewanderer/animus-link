package com.animus.link.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SecurityRedactionTest {
    @Test
    fun maskInvite_hides_middle_section() {
        val invite = "animus://invite/v1/namespace.secret.signature"
        val masked = maskInvite(invite)
        assertTrue(masked.startsWith("animus://invite/v1/"))
        assertTrue(masked.contains("…"))
        assertFalse(masked.contains("namespace.secret.signature"))
    }

    @Test
    fun redactSensitive_removes_invite_and_token_urls() {
        val raw = "invite=animus://invite/v1/abc token=animus://rtok/v1/payload.sig"
        val redacted = redactSensitive(raw)
        assertFalse(redacted.contains("animus://invite/v1/abc"))
        assertFalse(redacted.contains("animus://rtok/v1/payload.sig"))
        assertTrue(redacted.contains("animus://invite/[redacted]"))
        assertTrue(redacted.contains("animus://rtok/[redacted]"))
    }

    @Test
    fun splitCsvClean_filters_empty_values() {
        assertEquals(
            listOf("one", "two", "three"),
            splitCsvClean(" one, ,two,three ,,"),
        )
    }

    @Test
    fun parseRadiusDp_parses_rem_value() {
        assertEquals(12.8f, parseRadiusDp("0.8rem"), 0.001f)
        assertEquals(12.0f, parseRadiusDp("invalid"), 0.001f)
    }
}
