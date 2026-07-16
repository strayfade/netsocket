package com.strayfade.netsocket.notification

import android.content.Context
import android.provider.Settings
import java.security.MessageDigest

object DeviceId {
    /**
     * Stable device identifier derived from [Settings.Secure.ANDROID_ID].
     * Survives app reinstalls (same signing key / user). Formatted as a UUID string.
     */
    fun get(context: Context): String {
        val androidId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID
        ).orEmpty().ifEmpty { "unknown" }

        val digest = MessageDigest.getInstance("SHA-256")
            .digest("netsocket:$androidId".toByteArray(Charsets.UTF_8))
        val hex = digest.take(16).joinToString("") { byte ->
            "%02x".format(byte)
        }
        return listOf(
            hex.substring(0, 8),
            hex.substring(8, 12),
            hex.substring(12, 16),
            hex.substring(16, 20),
            hex.substring(20, 32)
        ).joinToString("-")
    }
}
