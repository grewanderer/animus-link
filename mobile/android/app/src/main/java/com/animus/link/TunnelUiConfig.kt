package com.animus.link

import org.json.JSONArray
import org.json.JSONObject

data class TunnelUiConfig(
    val relayAddr: String,
    val relayToken: String,
    val relayTtlSecs: Int,
    val connId: Long,
    val gatewayService: String,
    val peerId: String,
    val failMode: String,
    val dnsMode: String,
    val protectedEndpoints: List<String>,
    val excludeCidrs: List<String>,
    val allowLan: Boolean,
    val mtu: Int,
    val maxIpPacketBytes: Int,
) {
    fun serialize(): String {
        val json = JSONObject()
            .put("relay_addr", relayAddr)
            .put("relay_token", relayToken)
            .put("relay_ttl_secs", relayTtlSecs)
            .put("conn_id", connId)
            .put("gateway_service", gatewayService)
            .put("peer_id", peerId)
            .put("fail_mode", failMode)
            .put("dns_mode", dnsMode)
            .put("allow_lan", allowLan)
            .put("mtu", mtu)
            .put("max_ip_packet_bytes", maxIpPacketBytes)
            .put("protected_endpoints", JSONArray(protectedEndpoints))
            .put("exclude_cidrs", JSONArray(excludeCidrs))
        return json.toString()
    }

    companion object {
        fun deserialize(serialized: String): TunnelUiConfig {
            val json = JSONObject(serialized)
            return TunnelUiConfig(
                relayAddr = json.getString("relay_addr"),
                relayToken = json.getString("relay_token"),
                relayTtlSecs = json.getInt("relay_ttl_secs"),
                connId = json.getLong("conn_id"),
                gatewayService = json.getString("gateway_service"),
                peerId = json.getString("peer_id"),
                failMode = json.getString("fail_mode"),
                dnsMode = json.getString("dns_mode"),
                protectedEndpoints = jsonArrayToList(json.optJSONArray("protected_endpoints")),
                excludeCidrs = jsonArrayToList(json.optJSONArray("exclude_cidrs")),
                allowLan = json.optBoolean("allow_lan", false),
                mtu = json.optInt("mtu", 1500),
                maxIpPacketBytes = json.optInt("max_ip_packet_bytes", 2048),
            )
        }

        private fun jsonArrayToList(values: JSONArray?): List<String> {
            if (values == null) {
                return emptyList()
            }
            val out = ArrayList<String>(values.length())
            for (index in 0 until values.length()) {
                out += values.optString(index, "")
            }
            return out.filter { it.isNotBlank() }
        }
    }
}
