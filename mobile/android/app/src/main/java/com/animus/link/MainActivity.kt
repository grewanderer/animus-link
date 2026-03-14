package com.animus.link

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import com.animus.link.bindings.androidTunnelStatus
import com.animus.link.bindings.inviteCreate
import com.animus.link.bindings.inviteJoin
import com.animus.link.bindings.status
import com.animus.link.bindings.version
import com.animus.link.ui.AnimusTheme
import com.animus.link.ui.DiagnosticsViewModel
import com.animus.link.ui.OnboardingViewModel
import com.animus.link.ui.ServicesViewModel
import com.animus.link.ui.TunnelConfigBuildResult
import com.animus.link.ui.TunnelViewModel
import com.animus.link.ui.parseRadiusDp
import com.animus.link.ui.redactSensitive
import com.animus.link.ui.splitCsvClean
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

private enum class MobileScreen(val label: String) {
    Onboarding("Onboarding"),
    Services("Services"),
    Tunnel("Tunnel"),
    Diagnostics("Diagnostics"),
    Settings("Settings"),
    Messenger("Messenger"),
}

class MainActivity : ComponentActivity() {
    private companion object {
        const val REPORT_TITLE = "Animus Link Diagnostics Report"
    }

    private var ffiLoaded by mutableStateOf(false)
    private var ffiError by mutableStateOf("")
    private var selectedScreen by mutableStateOf(MobileScreen.Onboarding)
    private var appVersion by mutableStateOf("loading")
    private var appStatus by mutableStateOf("unknown")
    private var tunnelRuntime by mutableStateOf("state=disabled connected=false")
    private var daemonBaseUrl by mutableStateOf("http://127.0.0.1:9999")

    private val onboardingVm = OnboardingViewModel()
    private val servicesVm = ServicesViewModel()
    private val tunnelVm = TunnelViewModel()
    private val diagnosticsVm = DiagnosticsViewModel()

    private var pendingTunnelConfig: TunnelUiConfig? = null
    private val vpnLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode != Activity.RESULT_OK) {
            diagnosticsVm.reportMessage = "VpnPermissionDenied: user denied permission"
            pendingTunnelConfig = null
            return@registerForActivityResult
        }
        val config = pendingTunnelConfig
        pendingTunnelConfig = null
        if (config != null) {
            AnimusVpnService.startTunnel(this, config)
            refreshRuntimeSnapshot()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        refreshRuntimeSnapshot()
        setContent { AppUi() }
    }

    override fun onResume() {
        super.onResume()
        refreshRuntimeSnapshot()
    }

    @Composable
    private fun AppUi() {
        val colorScheme = darkColorScheme(
            background = tokenColor(AnimusTheme.BACKGROUND),
            surface = tokenColor(AnimusTheme.CARD),
            onSurface = tokenColor(AnimusTheme.FOREGROUND),
            primary = tokenColor(AnimusTheme.PRIMARY),
            onPrimary = tokenColor(AnimusTheme.PRIMARY_FOREGROUND),
            secondary = tokenColor(AnimusTheme.SECONDARY),
            onSecondary = tokenColor(AnimusTheme.SECONDARY_FOREGROUND),
            outline = tokenColor(AnimusTheme.BORDER),
            error = tokenColor(AnimusTheme.DESTRUCTIVE),
            onError = tokenColor(AnimusTheme.DESTRUCTIVE_FOREGROUND),
        )
        val radius = parseRadiusDp(AnimusTheme.RADIUS_RADIUS).dp

        MaterialTheme(colorScheme = colorScheme) {
            Scaffold(
                containerColor = colorScheme.background,
                bottomBar = {
                    NavigationBar(containerColor = tokenColor(AnimusTheme.POPOVER)) {
                        MobileScreen.entries.forEach { screen ->
                            NavigationBarItem(
                                selected = screen == selectedScreen,
                                onClick = { selectedScreen = screen },
                                icon = {},
                                label = { Text(screen.label) },
                            )
                        }
                    }
                },
            ) { innerPadding ->
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(colorScheme.background)
                        .padding(innerPadding)
                        .padding(horizontal = 14.dp, vertical = 10.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    HeaderCard(radius)
                    when (selectedScreen) {
                        MobileScreen.Onboarding -> OnboardingScreen(radius)
                        MobileScreen.Services -> ServicesScreen(radius)
                        MobileScreen.Tunnel -> TunnelScreen(radius)
                        MobileScreen.Diagnostics -> DiagnosticsScreen(radius)
                        MobileScreen.Settings -> SettingsScreen(radius)
                        MobileScreen.Messenger -> MessengerPlaceholder(radius)
                    }
                }
            }
        }
    }

    @Composable
    private fun HeaderCard(radius: Dp) {
        SurfaceCard(radius = radius) {
            Text(
                text = "Animus Link",
                fontWeight = FontWeight.SemiBold,
                color = tokenColor(AnimusTheme.FOREGROUND),
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Foreground-only (Public Beta)",
                color = tokenColor(AnimusTheme.ACCENT),
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(6.dp))
            RuntimeLine(label = "Version", value = appVersion)
            RuntimeLine(label = "Status", value = appStatus)
            RuntimeLine(label = "Tunnel", value = tunnelRuntime)
            if (ffiError.isNotBlank()) {
                Text(
                    text = ffiError,
                    color = tokenColor(AnimusTheme.DESTRUCTIVE),
                    fontFamily = FontFamily.Monospace,
                )
            }
        }
    }

    @Composable
    private fun RuntimeLine(label: String, value: String) {
        Text(
            text = "$label: $value",
            color = tokenColor(AnimusTheme.MUTED_FOREGROUND),
            fontFamily = FontFamily.Monospace,
        )
    }

    @Composable
    private fun OnboardingScreen(radius: Dp) {
        SurfaceCard(radius = radius) {
            SectionHeader(
                title = "Invite-first onboarding",
                subtitle = "Create, copy, and join without exposing secrets in UI logs.",
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton(label = "Create invite", onClick = { createInvite() })
                SecondaryButton(
                    label = "Copy invite",
                    enabled = onboardingVm.createdInviteRaw.isNotBlank(),
                    onClick = { copyInviteToClipboard() },
                )
            }
            InlineStatusBox(
                label = "Masked invite",
                text = onboardingVm.createdInviteMasked,
                accent = true,
            )
            AppInputField(
                label = "Join invite",
                value = onboardingVm.inviteToJoin,
                onValueChange = { onboardingVm.inviteToJoin = it },
                radius = radius,
            )
            PrimaryButton(label = "Join network", onClick = { joinInvite() })
            BodyMutedText(redactSensitive(onboardingVm.message))
        }
    }

    @Composable
    private fun ServicesScreen(radius: Dp) {
        SurfaceCard(radius = radius) {
            SectionHeader(
                title = "Service Bridge",
                subtitle = "Expose local TCP services and connect to remote peers.",
            )
            AppInputField(
                label = "Service name",
                value = servicesVm.serviceName,
                onValueChange = { servicesVm.serviceName = it },
                radius = radius,
            )
            AppInputField(
                label = "Local addr (expose)",
                value = servicesVm.serviceLocalAddr,
                onValueChange = { servicesVm.serviceLocalAddr = it },
                radius = radius,
            )
            AppInputField(
                label = "Allowed peers csv",
                value = servicesVm.allowedPeersCsv,
                onValueChange = { servicesVm.allowedPeersCsv = it },
                radius = radius,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton(label = "Expose", onClick = { exposeService() })
                SecondaryButton(label = "Connect", onClick = { connectService() })
            }
            InlineStatusBox(
                label = "Response",
                text = redactSensitive(servicesVm.message),
                accent = false,
            )
        }
    }

    @Composable
    private fun TunnelScreen(radius: Dp) {
        SurfaceCard(radius = radius) {
            SectionHeader(
                title = "Gateway Tunnel",
                subtitle = "VPNService path with signed relay token and fail/dns policy controls.",
            )
            AppInputField(
                label = "Gateway service",
                value = tunnelVm.gatewayService,
                onValueChange = { tunnelVm.gatewayService = it },
                radius = radius,
            )
            AppInputField(
                label = "Relay addr host:port",
                value = tunnelVm.relayAddr,
                onValueChange = { tunnelVm.relayAddr = it },
                radius = radius,
            )
            AppInputField(
                label = "Signed relay token",
                value = tunnelVm.relayToken,
                onValueChange = { tunnelVm.relayToken = it },
                radius = radius,
                password = true,
            )
            BodyMutedText("Token preview: ${tunnelVm.relayTokenMasked()}")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AppInputField(
                    label = "TTL",
                    value = tunnelVm.relayTtlSecs,
                    onValueChange = { tunnelVm.relayTtlSecs = it },
                    radius = radius,
                    modifier = Modifier.weight(1f),
                )
                AppInputField(
                    label = "Conn ID",
                    value = tunnelVm.connId,
                    onValueChange = { tunnelVm.connId = it },
                    radius = radius,
                    modifier = Modifier.weight(1f),
                )
            }
            AppInputField(
                label = "Peer ID",
                value = tunnelVm.peerId,
                onValueChange = { tunnelVm.peerId = it },
                radius = radius,
            )
            AppInputField(
                label = "Protected endpoints csv",
                value = tunnelVm.protectedEndpoints,
                onValueChange = { tunnelVm.protectedEndpoints = it },
                radius = radius,
            )
            AppInputField(
                label = "Exclude CIDRs csv",
                value = tunnelVm.excludeCidrs,
                onValueChange = { tunnelVm.excludeCidrs = it },
                radius = radius,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AppInputField(
                    label = "MTU",
                    value = tunnelVm.mtu,
                    onValueChange = { tunnelVm.mtu = it },
                    radius = radius,
                    modifier = Modifier.weight(1f),
                )
                AppInputField(
                    label = "Max packet",
                    value = tunnelVm.maxPacket,
                    onValueChange = { tunnelVm.maxPacket = it },
                    radius = radius,
                    modifier = Modifier.weight(1f),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(
                    checked = tunnelVm.allowLan,
                    onCheckedChange = { tunnelVm.allowLan = it },
                )
                Spacer(Modifier.width(8.dp))
                BodyMutedText("Allow LAN outside tunnel")
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ToggleChoice(
                    label = "Fail mode",
                    values = listOf("open_fast", "closed"),
                    selected = tunnelVm.failMode,
                    onSelect = { tunnelVm.failMode = it },
                )
                ToggleChoice(
                    label = "DNS mode",
                    values = listOf("remote_best_effort", "remote_strict", "system"),
                    selected = tunnelVm.dnsMode,
                    onSelect = { tunnelVm.dnsMode = it },
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton(label = "Enable", onClick = { startTunnel() })
                SecondaryButton(
                    label = "Disable",
                    onClick = {
                        AnimusVpnService.stopTunnel(this@MainActivity)
                        refreshRuntimeSnapshot()
                    },
                )
                SecondaryButton(label = "Status", onClick = { refreshRuntimeSnapshot() })
            }
            BodyMutedText("Open-fast keeps internet usable if relay path degrades in beta.")
        }
    }

    @Composable
    private fun DiagnosticsScreen(radius: Dp) {
        SurfaceCard(radius = radius) {
            SectionHeader(
                title = "Diagnostics",
                subtitle = "Read /v1/self_check and /v1/diagnostics then export a redacted report bundle.",
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton(label = "Load self_check", onClick = { fetchSelfCheck() })
                SecondaryButton(label = "Load diagnostics", onClick = { fetchDiagnostics() })
            }
            SecondaryButton(label = "Report a problem", onClick = { exportReport() })
            InlineStatusBox(
                label = "Self check",
                text = redactSensitive(diagnosticsVm.selfCheckText),
                accent = false,
            )
            InlineStatusBox(
                label = "Diagnostics",
                text = redactSensitive(diagnosticsVm.diagnosticsText),
                accent = false,
            )
            if (diagnosticsVm.reportMessage.isNotBlank()) {
                BodyAccentText(redactSensitive(diagnosticsVm.reportMessage))
            }
        }
    }

    @Composable
    private fun SettingsScreen(radius: Dp) {
        SurfaceCard(radius = radius) {
            SectionHeader(
                title = "Settings",
                subtitle = "Local daemon endpoint and token semantics for UI parity.",
            )
            AppInputField(
                label = "Local API base URL",
                value = daemonBaseUrl,
                onValueChange = { daemonBaseUrl = it },
                radius = radius,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton(label = "Refresh runtime", onClick = { refreshRuntimeSnapshot() })
                SecondaryButton(label = "Tunnel status", onClick = { refreshRuntimeSnapshot() })
            }
            BodyMutedText("Theme semantics: background/primary/accent from generated tokens.")
            Text(
                text = "bg=${AnimusTheme.BACKGROUND} primary=${AnimusTheme.PRIMARY} accent=${AnimusTheme.ACCENT}",
                color = tokenColor(AnimusTheme.MUTED_FOREGROUND),
                fontFamily = FontFamily.Monospace,
            )
            Text(
                text = "fonts=${AnimusTheme.FONT_SANS} | ${AnimusTheme.FONT_MONO}",
                color = tokenColor(AnimusTheme.MUTED_FOREGROUND),
                fontFamily = FontFamily.Monospace,
            )
        }
    }

    @Composable
    private fun MessengerPlaceholder(radius: Dp) {
        SurfaceCard(radius = radius) {
            SectionHeader(
                title = "Messenger",
                subtitle = "Placeholder for invite-scoped, realtime secure messaging in public beta.",
            )
            BodyMutedText("Transport remains protocol-layer E2E. Payload logging is disabled.")
            BodyAccentText("No chat payloads are logged.")
        }
    }

    @Composable
    private fun SectionHeader(title: String, subtitle: String) {
        Text(
            text = title,
            fontWeight = FontWeight.Medium,
            color = tokenColor(AnimusTheme.FOREGROUND),
        )
        Text(
            text = subtitle,
            color = tokenColor(AnimusTheme.MUTED_FOREGROUND),
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
    }

    @Composable
    private fun PrimaryButton(label: String, onClick: () -> Unit, enabled: Boolean = true) {
        Button(
            onClick = onClick,
            enabled = enabled,
            colors = ButtonDefaults.buttonColors(
                containerColor = tokenColor(AnimusTheme.PRIMARY),
                contentColor = tokenColor(AnimusTheme.PRIMARY_FOREGROUND),
                disabledContainerColor = tokenColor(AnimusTheme.MUTED),
                disabledContentColor = tokenColor(AnimusTheme.MUTED_FOREGROUND),
            ),
        ) {
            Text(label)
        }
    }

    @Composable
    private fun SecondaryButton(label: String, onClick: () -> Unit, enabled: Boolean = true) {
        Button(
            onClick = onClick,
            enabled = enabled,
            colors = ButtonDefaults.buttonColors(
                containerColor = tokenColor(AnimusTheme.SECONDARY),
                contentColor = tokenColor(AnimusTheme.SECONDARY_FOREGROUND),
                disabledContainerColor = tokenColor(AnimusTheme.MUTED),
                disabledContentColor = tokenColor(AnimusTheme.MUTED_FOREGROUND),
            ),
        ) {
            Text(label)
        }
    }

    @Composable
    private fun AppInputField(
        label: String,
        value: String,
        onValueChange: (String) -> Unit,
        radius: Dp,
        modifier: Modifier = Modifier.fillMaxWidth(),
        password: Boolean = false,
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = modifier,
            label = { Text(label) },
            singleLine = true,
            visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = tokenColor(AnimusTheme.RING),
                unfocusedBorderColor = tokenColor(AnimusTheme.BORDER),
                focusedTextColor = tokenColor(AnimusTheme.FOREGROUND),
                unfocusedTextColor = tokenColor(AnimusTheme.FOREGROUND),
                focusedLabelColor = tokenColor(AnimusTheme.ACCENT),
                unfocusedLabelColor = tokenColor(AnimusTheme.MUTED_FOREGROUND),
                focusedContainerColor = tokenColor(AnimusTheme.INPUT).copy(alpha = 0.25f),
                unfocusedContainerColor = tokenColor(AnimusTheme.INPUT).copy(alpha = 0.2f),
            ),
            shape = RoundedCornerShape(radius),
        )
    }

    @Composable
    private fun InlineStatusBox(label: String, text: String, accent: Boolean) {
        val textColor = if (accent) tokenColor(AnimusTheme.ACCENT) else tokenColor(AnimusTheme.MUTED_FOREGROUND)
        val bgColor = if (accent) tokenColor(AnimusTheme.ACCENT).copy(alpha = 0.12f) else tokenColor(AnimusTheme.INPUT).copy(alpha = 0.25f)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(bgColor, RoundedCornerShape(10.dp))
                .padding(10.dp),
        ) {
            Text(label, color = tokenColor(AnimusTheme.FOREGROUND), fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(4.dp))
            Text(
                text = text,
                color = textColor,
                fontFamily = FontFamily.Monospace,
                maxLines = 10,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }

    @Composable
    private fun ToggleChoice(
        label: String,
        values: List<String>,
        selected: String,
        onSelect: (String) -> Unit,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(label, color = tokenColor(AnimusTheme.MUTED_FOREGROUND))
            values.forEach { value ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(
                        checked = selected == value,
                        onCheckedChange = { checked ->
                            if (checked) {
                                onSelect(value)
                            }
                        },
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(value, fontFamily = FontFamily.Monospace)
                }
            }
        }
    }

    @Composable
    private fun BodyMutedText(value: String) {
        Text(
            text = value,
            color = tokenColor(AnimusTheme.MUTED_FOREGROUND),
        )
    }

    @Composable
    private fun BodyAccentText(value: String) {
        Text(
            text = value,
            color = tokenColor(AnimusTheme.ACCENT),
            fontWeight = FontWeight.Medium,
        )
    }

    @Composable
    private fun SurfaceCard(
        radius: Dp,
        body: @Composable Column.() -> Unit,
    ) {
        Card(
            colors = CardDefaults.cardColors(containerColor = tokenColor(AnimusTheme.CARD)),
            shape = RoundedCornerShape(radius),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                content = body,
            )
        }
    }

    private fun createInvite() {
        if (!ensureFfi()) {
            return
        }
        runCatching { inviteCreate() }
            .onSuccess { invite -> onboardingVm.onInviteCreated(invite) }
            .onFailure { onboardingVm.message = formatError(it) }
    }

    private fun joinInvite() {
        if (!ensureFfi()) {
            return
        }
        val invite = onboardingVm.joinInviteInput()
        if (invite == null) {
            onboardingVm.message = "InvalidInput: invite is required"
            return
        }
        runCatching { inviteJoin(invite) }
            .onSuccess { onboardingVm.message = "Invite joined." }
            .onFailure { onboardingVm.message = formatError(it) }
    }

    private fun copyInviteToClipboard() {
        if (onboardingVm.createdInviteRaw.isBlank()) {
            onboardingVm.message = "No invite available."
            return
        }
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Animus Invite", onboardingVm.createdInviteRaw))
        onboardingVm.message = "Invite copied to clipboard."
    }

    private fun exposeService() {
        val payload = JSONObject()
            .put("service_name", servicesVm.serviceName.trim())
            .put("local_addr", servicesVm.serviceLocalAddr.trim())
            .put("allowed_peers", JSONArray(splitCsvClean(servicesVm.allowedPeersCsv)))
            .toString()
        daemonPost("/v1/expose", payload) { servicesVm.message = it }
    }

    private fun connectService() {
        val payload = JSONObject()
            .put("service_name", servicesVm.serviceName.trim())
            .toString()
        daemonPost("/v1/connect", payload) { servicesVm.message = it }
    }

    private fun startTunnel() {
        when (val result = tunnelVm.buildConfig()) {
            is TunnelConfigBuildResult.Error -> {
                diagnosticsVm.reportMessage = result.message
            }
            is TunnelConfigBuildResult.Success -> {
                pendingTunnelConfig = result.config
                val intent = VpnService.prepare(this)
                if (intent == null) {
                    AnimusVpnService.startTunnel(this, result.config)
                    refreshRuntimeSnapshot()
                    return
                }
                vpnLauncher.launch(intent)
            }
        }
    }

    private fun fetchSelfCheck() {
        daemonGet("/v1/self_check") { diagnosticsVm.selfCheckText = it }
    }

    private fun fetchDiagnostics() {
        daemonGet("/v1/diagnostics") { diagnosticsVm.diagnosticsText = it }
    }

    private fun exportReport() {
        val payload = diagnosticsVm.buildReportBundle(
            title = REPORT_TITLE,
            version = appVersion,
            status = appStatus,
            tunnelRuntime = tunnelRuntime,
        )
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, REPORT_TITLE)
            putExtra(Intent.EXTRA_TEXT, payload)
        }
        startActivity(Intent.createChooser(intent, "Share diagnostics"))
        diagnosticsVm.reportMessage = "Diagnostics bundle prepared."
    }

    private fun refreshRuntimeSnapshot() {
        if (!ensureFfi()) {
            appVersion = "unavailable"
            appStatus = "unavailable"
            tunnelRuntime = "unavailable"
            return
        }
        appVersion = runCatching { version() }.getOrElse { formatError(it) }
        appStatus = runCatching { status().toString() }.getOrElse { formatError(it) }
        val tunnel = runCatching { androidTunnelStatus() }.getOrNull()
        if (tunnel == null) {
            tunnelRuntime = "state=unknown connected=false"
            return
        }
        val serviceError = AnimusVpnService.lastServiceError().ifBlank { "none" }
        tunnelRuntime = "state=${tunnel.state} connected=${tunnel.connected} err=$serviceError bytes=${tunnel.bytesIn}/${tunnel.bytesOut}"
    }

    private fun ensureFfi(): Boolean {
        if (ffiLoaded) {
            return true
        }
        val loadFailure = runCatching { System.loadLibrary("fabric_ffi") }.exceptionOrNull()
        if (loadFailure == null) {
            ffiLoaded = true
            ffiError = ""
            return true
        }
        ffiError = formatError(loadFailure)
        return false
    }

    private fun daemonGet(path: String, onResult: (String) -> Unit) {
        lifecycleScope.launch {
            val response = withContext(Dispatchers.IO) {
                httpRequest("GET", path, null)
            }
            onResult(response)
        }
    }

    private fun daemonPost(path: String, body: String, onResult: (String) -> Unit) {
        lifecycleScope.launch {
            val response = withContext(Dispatchers.IO) {
                httpRequest("POST", path, body)
            }
            onResult(response)
        }
    }

    private fun httpRequest(method: String, path: String, body: String?): String {
        return runCatching {
            val url = URL("${daemonBaseUrl.trimEnd('/')}$path")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 1200
                readTimeout = 1200
                doInput = true
                if (body != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    outputStream.use { out -> out.write(body.toByteArray(Charsets.UTF_8)) }
                }
            }
            val code = conn.responseCode
            val stream = if (code >= 400) conn.errorStream else conn.inputStream
            val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            redactSensitive("HTTP $code\n$payload")
        }.getOrElse { error ->
            formatError(error)
        }
    }

    private fun formatError(error: Throwable): String {
        val type = error::class.simpleName ?: error::class.java.simpleName
        val message = error.message ?: "unknown"
        return redactSensitive("$type: $message")
    }

    private fun tokenColor(value: Long): Color = Color(value.toULong())
}
