package com.strayfade.netsocket.notification

import android.app.Notification
import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class NetsocketNotificationListener : NotificationListenerService() {
    private lateinit var prefs: Prefs

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        Log.i(TAG, "Notification listener created")
        KeepAliveService.start(this)
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "Notification listener connected")
        KeepAliveService.start(this)
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "Notification listener disconnected; requesting rebind")
        requestRebind(ComponentName(this, NetsocketNotificationListener::class.java))
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) {
            return
        }

        // Never forward our own keep-alive notification (prevents loops).
        if (sbn.packageName == packageName) {
            return
        }

        // Acquire a short wake lock so the POST can complete while the screen is off.
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "netsocket:notification-forward"
        )
        wakeLock.setReferenceCounted(false)
        wakeLock.acquire(15_000L)

        try {
            val extras = sbn.notification.extras
            val title = firstNonBlank(
                extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
                extras?.getCharSequence(Notification.EXTRA_TITLE_BIG)?.toString(),
                extras?.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString(),
                appLabel(sbn.packageName)
            )
            val textContent = firstNonBlank(
                extras?.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
                extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
                extras?.getCharSequence(Notification.EXTRA_INFO_TEXT)?.toString(),
                extras?.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString(),
                joinLines(extras?.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)),
                extras?.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString()
            )

            NotificationForwarder.forward(
                prefs = prefs,
                title = title,
                textContent = textContent,
                bundleIdentifier = sbn.packageName,
                deviceId = DeviceId.get(this)
            )
        } finally {
            if (wakeLock.isHeld) {
                wakeLock.release()
            }
        }
    }

    private fun appLabel(packageName: String): String {
        return try {
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageManager.getApplicationInfo(
                    packageName,
                    PackageManager.ApplicationInfoFlags.of(0)
                )
            } else {
                @Suppress("DEPRECATION")
                packageManager.getApplicationInfo(packageName, 0)
            }
            packageManager.getApplicationLabel(info).toString()
        } catch (_: Exception) {
            packageName
        }
    }

    private fun joinLines(lines: Array<CharSequence>?): String {
        if (lines.isNullOrEmpty()) {
            return ""
        }
        return lines.joinToString("\n") { it.toString() }
    }

    private fun firstNonBlank(vararg values: String?): String {
        for (value in values) {
            val trimmed = value?.trim().orEmpty()
            if (trimmed.isNotEmpty()) {
                return trimmed
            }
        }
        return ""
    }

    companion object {
        private const val TAG = "NetsocketListener"
    }
}
