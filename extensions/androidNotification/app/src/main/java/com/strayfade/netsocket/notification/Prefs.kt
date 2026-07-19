package com.strayfade.netsocket.notification

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import java.util.UUID

class Prefs(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var host: String
        get() = prefs.getString(KEY_HOST, DEFAULT_HOST)?.trim().orEmpty().ifEmpty { DEFAULT_HOST }
        set(value) = prefs.edit { putString(KEY_HOST, value.trim()) }

    var port: String
        get() = prefs.getString(KEY_PORT, "")?.trim().orEmpty()
        set(value) = prefs.edit { putString(KEY_PORT, value.trim()) }

    var useHttps: Boolean
        get() = prefs.getBoolean(KEY_USE_HTTPS, true)
        set(value) = prefs.edit { putBoolean(KEY_USE_HTTPS, value) }

    /** Secret for POST /v1/postNotification/:secret (notification forwarding). */
    var notificationSecret: String
        get() = prefs.getString(KEY_NOTIFICATION_SECRET, "")?.trim().orEmpty()
        set(value) = prefs.edit { putString(KEY_NOTIFICATION_SECRET, value.trim()) }

    /** Command Palette secret — sent as x-socket-auth on the WebSocket. */
    var commandSecret: String
        get() = prefs.getString(KEY_COMMAND_SECRET, "")?.trim().orEmpty()
        set(value) = prefs.edit { putString(KEY_COMMAND_SECRET, value.trim()) }

    var forwardingEnabled: Boolean
        get() = prefs.getBoolean(KEY_FORWARDING_ENABLED, true)
        set(value) = prefs.edit { putBoolean(KEY_FORWARDING_ENABLED, value) }

    /** When true, the app opens the voice dictation screen instead of the text chat. */
    var voiceModeDefault: Boolean
        get() = prefs.getBoolean(KEY_VOICE_MODE_DEFAULT, false)
        set(value) = prefs.edit { putBoolean(KEY_VOICE_MODE_DEFAULT, value) }

    var responseTimeoutSeconds: Int
        get() = prefs.getInt(KEY_RESPONSE_TIMEOUT, DEFAULT_RESPONSE_TIMEOUT_SECONDS)
            .coerceIn(MIN_RESPONSE_TIMEOUT_SECONDS, MAX_RESPONSE_TIMEOUT_SECONDS)
        set(value) = prefs.edit {
            putInt(
                KEY_RESPONSE_TIMEOUT,
                value.coerceIn(MIN_RESPONSE_TIMEOUT_SECONDS, MAX_RESPONSE_TIMEOUT_SECONDS)
            )
        }

    /** Stable ID sent with commands so host-side agent memory stays in one session. */
    fun getOrCreateConversationId(): String {
        val existing = prefs.getString(KEY_CONVERSATION_ID, null)?.trim().orEmpty()
        if (existing.isNotEmpty()) return existing
        return renewConversationId()
    }

    fun renewConversationId(): String {
        val created = UUID.randomUUID().toString()
        prefs.edit { putString(KEY_CONVERSATION_ID, created) }
        return created
    }

    /** @deprecated Use [notificationSecret]; kept for migration from older builds. */
    @Deprecated("Renamed to notificationSecret")
    var secret: String
        get() = notificationSecret
        set(value) {
            notificationSecret = value
        }

    fun endpointUrl(): String = buildEndpointUrl(host, port, useHttps, notificationSecret)

    fun webSocketUrl(): String = buildWebSocketUrl(host, port, useHttps)

    init {
        migrateLegacySecretIfNeeded()
    }

    private fun migrateLegacySecretIfNeeded() {
        if (prefs.contains(KEY_NOTIFICATION_SECRET)) return
        val legacy = prefs.getString(KEY_SECRET_LEGACY, null) ?: return
        prefs.edit {
            putString(KEY_NOTIFICATION_SECRET, legacy)
            remove(KEY_SECRET_LEGACY)
        }
    }

    companion object {
        const val PREFS_NAME = "netsocket_notification"
        const val KEY_HOST = "host"
        const val KEY_PORT = "port"
        const val KEY_USE_HTTPS = "use_https"
        const val KEY_NOTIFICATION_SECRET = "notification_secret"
        const val KEY_COMMAND_SECRET = "command_secret"
        const val KEY_FORWARDING_ENABLED = "forwarding_enabled"
        const val KEY_VOICE_MODE_DEFAULT = "voice_mode_default"
        const val KEY_RESPONSE_TIMEOUT = "response_timeout_seconds"
        const val KEY_CONVERSATION_ID = "conversation_id"
        /** Pre-chat-app key; migrated into [KEY_NOTIFICATION_SECRET]. */
        private const val KEY_SECRET_LEGACY = "secret"
        const val DEFAULT_HOST = "netsocket.strayfade.com"
        const val DEFAULT_RESPONSE_TIMEOUT_SECONDS = 120
        const val MIN_RESPONSE_TIMEOUT_SECONDS = 5
        const val MAX_RESPONSE_TIMEOUT_SECONDS = 300

        fun buildEndpointUrl(
            host: String,
            port: String,
            useHttps: Boolean,
            secret: String
        ): String {
            val scheme = if (useHttps) "https" else "http"
            val normalizedHost = normalizeHost(host)
            val portPart = resolvePort(port, useHttps)?.let { ":$it" }.orEmpty()
            val secretPart = if (secret.isNotBlank()) "/${secret.trim().trim('/')}" else ""
            return "$scheme://$normalizedHost$portPart/v1/postNotification$secretPart"
        }

        fun buildWebSocketUrl(
            host: String,
            port: String,
            useHttps: Boolean
        ): String {
            val scheme = if (useHttps) "wss" else "ws"
            val normalizedHost = normalizeHost(host)
            val portPart = resolvePort(port, useHttps)?.let { ":$it" }.orEmpty()
            return "$scheme://$normalizedHost$portPart/"
        }

        private fun normalizeHost(host: String): String {
            return host
                .trim()
                .removePrefix("https://")
                .removePrefix("http://")
                .removePrefix("wss://")
                .removePrefix("ws://")
                .trimEnd('/')
                .ifEmpty { DEFAULT_HOST }
        }

        private fun resolvePort(port: String, useHttps: Boolean): Int? {
            val raw = port.trim()
            if (raw.isEmpty()) {
                return null
            }
            val parsed = raw.toIntOrNull() ?: return null
            val defaultPort = if (useHttps) 443 else 80
            return if (parsed == defaultPort) null else parsed
        }
    }
}
