package com.animus.link

import org.junit.Assert.assertEquals
import org.junit.Test

class TunnelUiConfigTest {
    @Test
    fun serialization_roundtrip_is_stable() {
        val original = TunnelUiConfig(
            relayAddr = "127.0.0.1:3478",
            relayToken = "animus://rtok/v1/example.payload.signature",
            relayTtlSecs = 60,
            connId = 42,
            gatewayService = "gateway-exit",
            peerId = "android-peer",
            failMode = "open_fast",
            dnsMode = "remote_best_effort",
            protectedEndpoints = listOf("127.0.0.1:3478", "10.0.0.1:443"),
            excludeCidrs = listOf("192.168.0.0/16"),
            allowLan = true,
            mtu = 1500,
            maxIpPacketBytes = 2048,
        )

        val encoded = original.serialize()
        val decoded = TunnelUiConfig.deserialize(encoded)

        assertEquals(original, decoded)
    }
}
