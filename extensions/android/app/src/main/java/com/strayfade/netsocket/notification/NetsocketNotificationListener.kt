package com.strayfade.netsocket.notification

import android.app.Notification
import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.os.Process
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
        ListenerAccess.setConnected(true)
        ListenerAccess.clearWarning(this)
        KeepAliveService.start(this)
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "Notification listener disconnected; requesting rebind")
        ListenerAccess.setConnected(false)
        // Debounced by the access check: a rebind while the grant is intact posts nothing.
        ListenerAccess.warnIfMissing(this)
        requestRebind(ComponentName(this, NetsocketNotificationListener::class.java))
    }

    override fun onDestroy() {
        ListenerAccess.setConnected(false)
        super.onDestroy()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) {
            return
        }

        // Never forward this app's own notifications (keep-alive, message alerts, etc.).
        if (isOwnNotification(sbn)) {
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

    /**
     * True for keep-alive, alert, and any other notification posted by this app.
     * Package string alone is not enough: some builds report a different package
     * while the posting uid, channel, or [IncomingNotifier.EXTRA_OWN] still identify us.
     * [StatusBarNotification.getOpPkg] is API 29+, so it must not be called below that.
     */
    private fun isOwnNotification(sbn: StatusBarNotification): Boolean {
        if (sbn.uid == Process.myUid()) return true
        val self = packageName
        if (sbn.packageName == self) return true
        if (opPackage(sbn) == self) return true
        if (sbn.notification.extras?.getBoolean(IncomingNotifier.EXTRA_OWN, false) == true) {
            return true
        }
        val channelId = sbn.notification.channelId
        return channelId == IncomingNotifier.CHANNEL_ID || channelId == KeepAliveService.CHANNEL_ID
    }

    private fun opPackage(sbn: StatusBarNotification): String? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        return try {
            sbn.opPkg
        } catch (_: Throwable) {
            null
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
