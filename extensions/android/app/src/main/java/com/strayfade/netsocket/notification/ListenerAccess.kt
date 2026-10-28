package com.strayfade.netsocket.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Notification access is a user grant the system drops without telling anyone: a
 * reinstall clears it, and the listener then never fires. Forwarding looks healthy
 * (connected, forwarding enabled) while nothing is posted, so the missing grant has
 * to be reported rather than failed quietly.
 */
object ListenerAccess {
    private const val TAG = "NetsocketListenerAccess"
    private const val CHANNEL_ID = "netsocket_warnings"
    private const val NOTIFICATION_ID = 1002

    /** Lets a rebind or a settings write settle before concluding access is gone. */
    private const val SETTLE_DELAY_MS = 2_500L

    /**
     * Set by the bound listener in this process. The settings read can still report the
     * old grant for a moment after access changes, and a live connection is proof.
     */
    @Volatile
    private var connected = false

    private val handler = Handler(Looper.getMainLooper())
    private val pendingCheck = Runnable { check() }
    private var appContext: Context? = null

    fun setConnected(value: Boolean) {
        connected = value
    }

    fun isEnabled(context: Context): Boolean {
        if (connected) {
            return true
        }
        return NotificationManagerCompat
            .getEnabledListenerPackages(context)
            .contains(context.packageName)
    }

    /** Warns when forwarding is on but the listener cannot run, once the state has settled. */
    fun warnIfMissing(context: Context) {
        appContext = context.applicationContext
        handler.removeCallbacks(pendingCheck)
        handler.postDelayed(pendingCheck, SETTLE_DELAY_MS)
    }

    private fun check() {
        val context = appContext ?: return
        if (isEnabled(context) || !Prefs(context).forwardingEnabled) {
            clearWarning(context)
            return
        }
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        Log.i(TAG, "Notification access missing; posting warning")
        ensureChannel(context, manager)

        val openPermissions = PendingIntent.getActivity(
            context,
            0,
            Intent(context, PermissionsSettingsActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val message = context.getString(R.string.listener_access_warning_text)

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(context.getString(R.string.listener_access_warning_title))
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentIntent(openPermissions)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setLocalOnly(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_ERROR)
            .addExtras(android.os.Bundle().apply { putBoolean(IncomingNotifier.EXTRA_OWN, true) })
            .build()

        manager.notify(NOTIFICATION_ID, notification)
    }

    /** Drops the warning once the listener is bound again. */
    fun clearWarning(context: Context) {
        handler.removeCallbacks(pendingCheck)
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    private fun ensureChannel(context: Context, manager: NotificationManager) {
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.warnings_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = context.getString(R.string.warnings_channel_description)
        }
        manager.createNotificationChannel(channel)
    }
}
