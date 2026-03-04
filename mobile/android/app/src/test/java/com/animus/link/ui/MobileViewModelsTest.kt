package com.animus.link.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MobileViewModelsTest {
    @Test
    fun onboardingViewModel_masks_created_invite_and_trims_join_input() {
        val vm = OnboardingViewModel()
        vm.onInviteCreated("animus://invite/v1/namespace.secret.signature")

        assertTrue(vm.createdInviteMasked.startsWith("animus://invite/v1/"))
        assertFalse(vm.createdInviteMasked.contains("namespace.secret.signature"))

        vm.inviteToJoin = "   "
        assertNull(vm.joinInviteInput())

        vm.inviteToJoin = "  animus://invite/v1/example.payload.sig  "
        assertEquals("animus://invite/v1/example.payload.sig", vm.joinInviteInput())
    }

    @Test
    fun tunnelViewModel_buildConfig_parses_and_coerces_limits() {
        val vm = TunnelViewModel().apply {
            relayAddr = "relay.example:3478"
            relayToken = "animus://rtok/v1/super.secret.payload.signature"
            relayTtlSecs = "0"
            connId = "55"
            gatewayService = "gateway-exit"
            peerId = "android-peer"
            failMode = "open_fast"
            dnsMode = "remote_best_effort"
            protectedEndpoints = "127.0.0.1:3478,10.0.0.1:443"
            excludeCidrs = "192.168.0.0/16"
            allowLan = true
            mtu = "1100"
            maxPacket = "700"
        }

        val result = vm.buildConfig()
        assertTrue(result is TunnelConfigBuildResult.Success)
        val config = (result as TunnelConfigBuildResult.Success).config

        assertEquals("relay.example:3478", config.relayAddr)
        assertEquals(1, config.relayTtlSecs)
        assertEquals(1200, config.mtu)
        assertEquals(1024, config.maxIpPacketBytes)
        assertEquals(listOf("127.0.0.1:3478", "10.0.0.1:443"), config.protectedEndpoints)
        assertEquals(listOf("192.168.0.0/16"), config.excludeCidrs)

        val masked = vm.relayTokenMasked()
        assertTrue(masked.contains("…"))
        assertFalse(masked.contains("super.secret.payload.signature"))
    }

    @Test
    fun tunnelViewModel_buildConfig_rejects_invalid_numbers() {
        val vm = TunnelViewModel().apply {
            relayTtlSecs = "bad"
            connId = "bad"
            mtu = "bad"
            maxPacket = "bad"
        }

        val result = vm.buildConfig()
        assertTrue(result is TunnelConfigBuildResult.Error)
        assertEquals(
            "InvalidInput: tunnel numeric fields are invalid",
            (result as TunnelConfigBuildResult.Error).message,
        )
    }

    @Test
    fun diagnosticsViewModel_report_bundle_is_redacted() {
        val vm = DiagnosticsViewModel().apply {
            selfCheckText = "invite=animus://invite/v1/abc"
            diagnosticsText = "token=animus://rtok/v1/payload.sig"
        }

        val report = vm.buildReportBundle(
            title = "Animus Link Diagnostics Report",
            version = "0.1.0",
            status = "running=true",
            tunnelRuntime = "state=connected",
        )

        assertFalse(report.contains("animus://invite/v1/abc"))
        assertFalse(report.contains("animus://rtok/v1/payload.sig"))
        assertTrue(report.contains("animus://invite/[redacted]"))
        assertTrue(report.contains("animus://rtok/[redacted]"))
    }
}
