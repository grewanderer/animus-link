package com.animus.link

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import com.animus.link.bindings.androidTunnelDisable
import com.animus.link.bindings.androidTunnelEnable
import com.animus.link.bindings.androidTunnelStatus
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

class AnimusVpnService : VpnService() {
    companion object {
        private const val ACTION_START = "com.animus.link.vpn.START"
        private const val ACTION_STOP = "com.animus.link.vpn.STOP"
        private const val EXTRA_CONFIG = "config_json"
        private const val NOTIFICATION_CHANNEL_ID = "animus_vpn_channel"
        private const val NOTIFICATION_ID = 14001
        private const val MONITOR_INTERVAL_MS = 500L
        private const val OPEN_FAST_MAX_DEGRADED_MS = 2_000L

        @Volatile
        private var lastError: String = ""

        fun startTunnel(context: Context, config: TunnelUiConfig) {
            val intent = Intent(context, AnimusVpnService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_CONFIG, config.serialize())
            context.startService(intent)
        }

        fun stopTunnel(context: Context) {
            val intent = Intent(context, AnimusVpnService::class.java).setAction(ACTION_STOP)
            context.startService(intent)
        }

        fun lastServiceError(): String = lastError
    }

    private var tunInterface: ParcelFileDescriptor? = null
    private var monitorThread: Thread? = null
    private val monitorRunning = AtomicBoolean(false)
    private var degradedSinceMs: Long? = null
    private var failMode: String = "open_fast"

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startTunnelInternal(intent.getStringExtra(EXTRA_CONFIG))
            ACTION_STOP -> stopTunnelInternal("")
            else -> stopTunnelInternal("invalid_action")
        }
        return Service.START_STICKY
    }

    override fun onDestroy() {
        stopTunnelInternal("")
        super.onDestroy()
    }

    private fun startTunnelInternal(configJson: String?) {
        if (configJson.isNullOrBlank()) {
            stopTunnelInternal("missing_config")
            return
        }

        val config = runCatching { TunnelUiConfig.deserialize(configJson) }.getOrElse {
            stopTunnelInternal("invalid_config")
            return
        }
        failMode = config.failMode
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Starting tunnel..."))

        val establishedTun = runCatching {
            Builder()
                .setSession("Animus Link Full Tunnel")
                .setMtu(config.mtu.coerceAtLeast(1200))
                .addAddress("10.201.0.2", 32)
                .addRoute("0.0.0.0", 0)
                .apply {
                    if (config.dnsMode != "system") {
                        addDnsServer("1.1.1.1")
                    }
                    // Avoid relay/control routing loops by keeping app-origin traffic outside VPN.
                    runCatching { addDisallowedApplication(packageName) }
                }
                .establish()
        }.getOrNull()

        if (establishedTun == null) {
            stopTunnelInternal("vpn_establish_failed")
            return
        }
        tunInterface = establishedTun

        val status = runCatching {
            androidTunnelEnable(
                establishedTun.fd,
                config.relayAddr,
                config.relayToken,
                config.relayTtlSecs.toUInt(),
                config.connId.toULong(),
                config.gatewayService,
                config.peerId,
                config.failMode,
                config.dnsMode,
                config.protectedEndpoints,
                config.excludeCidrs,
                config.allowLan,
                config.mtu.toUShort(),
                config.maxIpPacketBytes.toUInt(),
            )
        }.getOrElse { error ->
            stopTunnelInternal(formatError(error))
            return
        }

        if (!status.enabled) {
            stopTunnelInternal(if (status.lastErrorCode.isBlank()) "enable_failed" else status.lastErrorCode)
            return
        }

        lastError = ""
        startMonitorLoop()
    }

    private fun startMonitorLoop() {
        monitorRunning.set(true)
        monitorThread?.interrupt()
        monitorThread = thread(
            start = true,
            isDaemon = true,
            name = "animus-vpn-monitor",
        ) {
            while (monitorRunning.get()) {
                val status = runCatching { androidTunnelStatus() }.getOrElse {
                    if (failMode == "open_fast") {
                        stopTunnelInternal("status_failed")
                    }
                    return@thread
                }

                updateForegroundNotification(status)
                val now = System.currentTimeMillis()
                if (!status.connected) {
                    if (degradedSinceMs == null) {
                        degradedSinceMs = now
                    }
                    if (failMode == "open_fast"
                        && now - (degradedSinceMs ?: now) >= OPEN_FAST_MAX_DEGRADED_MS
                    ) {
                        stopTunnelInternal("open_fast_drop")
                        return@thread
                    }
                } else {
                    degradedSinceMs = null
                }
                Thread.sleep(MONITOR_INTERVAL_MS)
            }
        }
    }

    private fun stopTunnelInternal(errorCode: String) {
        monitorRunning.set(false)
        monitorThread?.interrupt()
        monitorThread = null

        runCatching { androidTunnelDisable() }
        runCatching { tunInterface?.close() }
        tunInterface = null
        degradedSinceMs = null

        if (errorCode.isNotBlank()) {
            lastError = errorCode
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID) != null) {
            return
        }
        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            "Animus Tunnel",
            NotificationManager.IMPORTANCE_LOW,
        )
        manager.createNotificationChannel(channel)
    }

    private fun updateForegroundNotification(status: com.animus.link.bindings.TunnelRuntimeStatus) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(formatStatusLine(status)))
    }

    private fun formatStatusLine(status: com.animus.link.bindings.TunnelRuntimeStatus): String {
        val state = status.state
        val connected = if (status.connected) "connected" else "degraded"
        val err = status.lastErrorCode.takeIf { it.isNotBlank() } ?: "none"
        return "state=$state path=$connected err=$err"
    }

    private fun buildNotification(text: String): Notification {
        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Animus Link Tunnel")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setOngoing(true)
            .build()
    }

    private fun formatError(error: Throwable): String {
        val type = error::class.simpleName ?: error::class.java.simpleName
        val message = error.message ?: "unknown"
        return "$type:$message"
    }
}
