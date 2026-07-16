package com.strayfade.netsocket.notification

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

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

    var secret: String
        get() = prefs.getString(KEY_SECRET, "")?.trim().orEmpty()
        set(value) = prefs.edit { putString(KEY_SECRET, value.trim()) }

    var forwardingEnabled: Boolean
        get() = prefs.getBoolean(KEY_FORWARDING_ENABLED, true)
        set(value) = prefs.edit { putBoolean(KEY_FORWARDING_ENABLED, value) }

    fun endpointUrl(): String = buildEndpointUrl(host, port, useHttps, secret)

    companion object {
        const val PREFS_NAME = "netsocket_notification"
        const val KEY_HOST = "host"
        const val KEY_PORT = "port"
        const val KEY_USE_HTTPS = "use_https"
        const val KEY_SECRET = "secret"
        const val KEY_FORWARDING_ENABLED = "forwarding_enabled"
        const val DEFAULT_HOST = "netsocket.strayfade.com"

        fun buildEndpointUrl(
            host: String,
            port: String,
            useHttps: Boolean,
            secret: String
        ): String {
            val scheme = if (useHttps) "https" else "http"
            val normalizedHost = host
                .trim()
                .removePrefix("https://")
                .removePrefix("http://")
                .trimEnd('/')
                .ifEmpty { DEFAULT_HOST }
            val portPart = resolvePort(port, useHttps)?.let { ":$it" }.orEmpty()
            val secretPart = if (secret.isNotBlank()) "/${secret.trim().trim('/')}" else ""
            return "$scheme://$normalizedHost$portPart/v1/postNotification$secretPart"
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
