package com.animus.link.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.animus.link.TunnelUiConfig

class OnboardingViewModel {
    var inviteToJoin by mutableStateOf("")
    var createdInviteRaw by mutableStateOf("")
    var createdInviteMasked by mutableStateOf("none")
    var message by mutableStateOf("")

    fun onInviteCreated(invite: String) {
        createdInviteRaw = invite
        createdInviteMasked = maskInvite(invite)
        message = "Invite created. Use copy to share securely."
    }

    fun joinInviteInput(): String? {
        val invite = inviteToJoin.trim()
        return if (invite.isEmpty()) null else invite
    }
}

class ServicesViewModel {
    var serviceName by mutableStateOf("echo")
    var serviceLocalAddr by mutableStateOf("127.0.0.1:7000")
    var allowedPeersCsv by mutableStateOf("peer-b")
    var message by mutableStateOf("")
}

sealed interface TunnelConfigBuildResult {
    data class Success(val config: TunnelUiConfig) : TunnelConfigBuildResult
    data class Error(val message: String) : TunnelConfigBuildResult
}

class TunnelViewModel {
    var gatewayService by mutableStateOf("gateway-exit")
    var relayAddr by mutableStateOf("127.0.0.1:3478")
    var relayToken by mutableStateOf("")
    var relayTtlSecs by mutableStateOf("60")
    var connId by mutableStateOf((System.currentTimeMillis() and 0x7fff_ffff).toString())
    var peerId by mutableStateOf("android-client")
    var failMode by mutableStateOf("open_fast")
    var dnsMode by mutableStateOf("remote_best_effort")
    var protectedEndpoints by mutableStateOf("")
    var excludeCidrs by mutableStateOf("")
    var allowLan by mutableStateOf(false)
    var mtu by mutableStateOf("1500")
    var maxPacket by mutableStateOf("2048")

    fun buildConfig(): TunnelConfigBuildResult {
        val relayTtl = relayTtlSecs.toIntOrNull()
        val parsedConnId = connId.toLongOrNull()
        val parsedMtu = mtu.toIntOrNull()
        val parsedMaxPacket = maxPacket.toIntOrNull()
        if (relayTtl == null || parsedConnId == null || parsedMtu == null || parsedMaxPacket == null) {
            return TunnelConfigBuildResult.Error("InvalidInput: tunnel numeric fields are invalid")
        }

        val config = TunnelUiConfig(
            relayAddr = relayAddr.trim(),
            relayToken = relayToken.trim(),
            relayTtlSecs = relayTtl.coerceAtLeast(1),
            connId = parsedConnId,
            gatewayService = gatewayService.trim(),
            peerId = peerId.trim(),
            failMode = failMode,
            dnsMode = dnsMode,
            protectedEndpoints = splitCsvClean(protectedEndpoints),
            excludeCidrs = splitCsvClean(excludeCidrs),
            allowLan = allowLan,
            mtu = parsedMtu.coerceAtLeast(1200),
            maxIpPacketBytes = parsedMaxPacket.coerceAtLeast(1024),
        )
        return TunnelConfigBuildResult.Success(config)
    }

    fun relayTokenMasked(): String {
        val value = relayToken.trim()
        if (value.isBlank()) {
            return "none"
        }
        return if (value.length <= 24) {
            "****"
        } else {
            "${value.take(12)}…${value.takeLast(6)}"
        }
    }
}

class DiagnosticsViewModel {
    var selfCheckText by mutableStateOf("No data")
    var diagnosticsText by mutableStateOf("No data")
    var reportMessage by mutableStateOf("")

    fun buildReportBundle(
        title: String,
        version: String,
        status: String,
        tunnelRuntime: String,
    ): String {
        return buildString {
            appendLine(title)
            appendLine("version=$version")
            appendLine("status=$status")
            appendLine("tunnel=$tunnelRuntime")
            appendLine("self_check=${redactSensitive(selfCheckText)}")
            appendLine("diagnostics=${redactSensitive(diagnosticsText)}")
        }
    }
}
