package com.animus.link

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.animus.link.bindings.androidTunnelStatus
import com.animus.link.bindings.status
import com.animus.link.bindings.version

class MainActivity : AppCompatActivity() {
    private companion object {
        const val VPN_PERMISSION_REQUEST = 4242
    }

    private lateinit var outputView: TextView
    private lateinit var gatewayInput: EditText
    private lateinit var relayAddrInput: EditText
    private lateinit var relayTokenInput: EditText
    private lateinit var relayTtlInput: EditText
    private lateinit var connIdInput: EditText
    private lateinit var peerIdInput: EditText
    private lateinit var protectedInput: EditText
    private lateinit var excludeInput: EditText
    private lateinit var mtuInput: EditText
    private lateinit var maxPacketInput: EditText
    private lateinit var allowLanInput: CheckBox
    private lateinit var failModeSpinner: Spinner
    private lateinit var dnsModeSpinner: Spinner

    private var ffiLoaded: Boolean = false
    private var pendingStartConfig: TunnelUiConfig? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildContent())
        refreshDisplay()
    }

    override fun onResume() {
        super.onResume()
        refreshDisplay()
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != VPN_PERMISSION_REQUEST) {
            return
        }
        if (resultCode != Activity.RESULT_OK) {
            outputView.text = "VpnPermissionDenied: user denied VPN permission"
            pendingStartConfig = null
            return
        }
        val config = pendingStartConfig
        pendingStartConfig = null
        if (config != null) {
            AnimusVpnService.startTunnel(this, config)
            refreshDisplay()
        }
    }

    private fun buildContent(): ScrollView {
        val scroller = ScrollView(this)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val pad = dp(14)
            setPadding(pad, pad, pad, pad)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
        }

        val title = TextView(this).apply {
            text = "Animus Link Android"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
        }
        val policy = TextView(this).apply {
            text = "Foreground-only (Public Beta)"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
        }
        container.addView(title)
        container.addView(policy)

        gatewayInput = editField("Gateway service", "gateway-exit")
        relayAddrInput = editField("Relay addr host:port", "127.0.0.1:3478")
        relayTokenInput = editField("Signed relay token", "", secret = true)
        relayTtlInput = editField("Relay token TTL secs", "60", numeric = true)
        connIdInput = editField(
            "Conn ID",
            (System.currentTimeMillis() and 0x7fff_ffff).toString(),
            numeric = true,
        )
        peerIdInput = editField("Peer ID", "android-client")
        protectedInput = editField("Protected endpoints csv", "")
        excludeInput = editField("Exclude CIDRs csv", "")
        mtuInput = editField("MTU", "1500", numeric = true)
        maxPacketInput = editField("Max packet bytes", "2048", numeric = true)
        allowLanInput = CheckBox(this).apply {
            text = "Allow LAN outside tunnel"
            isChecked = false
        }
        failModeSpinner = choiceField("Fail mode", listOf("open_fast", "closed"))
        dnsModeSpinner = choiceField(
            "DNS mode",
            listOf("remote_best_effort", "remote_strict", "system"),
        )

        val startButton = Button(this).apply {
            text = "Start Tunnel"
            setOnClickListener { onStartTunnelClicked() }
        }
        val stopButton = Button(this).apply {
            text = "Stop Tunnel"
            setOnClickListener {
                AnimusVpnService.stopTunnel(this@MainActivity)
                refreshDisplay()
            }
        }
        outputView = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        }

        container.addView(gatewayInput)
        container.addView(relayAddrInput)
        container.addView(relayTokenInput)
        container.addView(relayTtlInput)
        container.addView(connIdInput)
        container.addView(peerIdInput)
        container.addView(protectedInput)
        container.addView(excludeInput)
        container.addView(mtuInput)
        container.addView(maxPacketInput)
        container.addView(allowLanInput)
        container.addView(failModeSpinner)
        container.addView(dnsModeSpinner)
        container.addView(startButton)
        container.addView(stopButton)
        container.addView(outputView)

        scroller.addView(container)
        return scroller
    }

    private fun onStartTunnelClicked() {
        val config = buildConfigOrNull() ?: return
        pendingStartConfig = config
        val intent = VpnService.prepare(this)
        if (intent == null) {
            AnimusVpnService.startTunnel(this, config)
            refreshDisplay()
            return
        }
        startActivityForResult(intent, VPN_PERMISSION_REQUEST)
    }

    private fun buildConfigOrNull(): TunnelUiConfig? {
        val relayTtl = relayTtlInput.text.toString().toIntOrNull()
        val connId = connIdInput.text.toString().toLongOrNull()
        val mtu = mtuInput.text.toString().toIntOrNull()
        val maxPacket = maxPacketInput.text.toString().toIntOrNull()
        if (relayTtl == null || connId == null || mtu == null || maxPacket == null) {
            outputView.text = "InvalidInput: numeric field parse failed"
            return null
        }
        return TunnelUiConfig(
            relayAddr = relayAddrInput.text.toString().trim(),
            relayToken = relayTokenInput.text.toString().trim(),
            relayTtlSecs = relayTtl.coerceAtLeast(1),
            connId = connId,
            gatewayService = gatewayInput.text.toString().trim(),
            peerId = peerIdInput.text.toString().trim(),
            failMode = failModeSpinner.selectedItem.toString(),
            dnsMode = dnsModeSpinner.selectedItem.toString(),
            protectedEndpoints = splitCsv(protectedInput.text.toString()),
            excludeCidrs = splitCsv(excludeInput.text.toString()),
            allowLan = allowLanInput.isChecked,
            mtu = mtu.coerceAtLeast(1200),
            maxIpPacketBytes = maxPacket.coerceAtLeast(1024),
        )
    }

    private fun splitCsv(value: String): List<String> {
        return value
            .split(',')
            .map { it.trim() }
            .filter { it.isNotEmpty() }
    }

    private fun refreshDisplay() {
        outputView.text = renderOutput()
    }

    private fun renderOutput(): String {
        val loadFailure = ensureFfiLoaded()
        if (loadFailure != null) {
            return formatError(loadFailure)
        }

        return runCatching {
            val appStatus = status()
            val tunnelStatus = androidTunnelStatus()
            val serviceError = AnimusVpnService.lastServiceError().ifBlank { "none" }
            buildString {
                append("Version: ${version()}\n")
                append("AppStatus: $appStatus\n")
                append("Tunnel: state=${tunnelStatus.state} connected=${tunnelStatus.connected} ")
                append("bytes_in=${tunnelStatus.bytesIn} bytes_out=${tunnelStatus.bytesOut}\n")
                append("LastErrorCode: ${tunnelStatus.lastErrorCode.ifBlank { "none" }}\n")
                append("ServiceError: $serviceError")
            }
        }.getOrElse { failure ->
            formatError(failure)
        }
    }

    private fun editField(label: String, defaultValue: String, numeric: Boolean = false, secret: Boolean = false): EditText {
        return EditText(this).apply {
            hint = label
            setText(defaultValue)
            if (numeric) {
                inputType = InputType.TYPE_CLASS_NUMBER
            }
            if (secret) {
                inputType =
                    InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
        }
    }

    private fun choiceField(label: String, choices: List<String>): Spinner {
        val spinner = Spinner(this)
        spinner.prompt = label
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, choices)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinner.adapter = adapter
        return spinner
    }

    private fun formatError(error: Throwable): String {
        val type = error::class.simpleName ?: error::class.java.name
        val message = error.message ?: "unknown"
        return "$type: $message"
    }

    private fun ensureFfiLoaded(): Throwable? {
        if (ffiLoaded) {
            return null
        }
        val loadFailure = runCatching { System.loadLibrary("fabric_ffi") }.exceptionOrNull()
        if (loadFailure == null) {
            ffiLoaded = true
        }
        return loadFailure
    }

    private fun dp(value: Int): Int {
        val density = resources.displayMetrics.density
        return (value * density).toInt()
    }
}
