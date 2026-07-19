package com.strayfade.netsocket.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import java.util.concurrent.atomic.AtomicInteger

/** Posts system notifications when overlay responses arrive while the chat UI is not visible. */
object IncomingNotifier {
    private const val CHANNEL_ID = "netsocket_messages"
    private val nextId = AtomicInteger(2000)

    fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.messages_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = context.getString(R.string.messages_channel_description)
        }
        manager.createNotificationChannel(channel)
    }

    fun notify(context: Context, text: String) {
        ensureChannel(context)
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(MainActivity.EXTRA_FOCUS_CHAT, true)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val preview = text
            .replace(Regex("\\s+"), " ")
            .trim()
            .take(180)
            .ifBlank { context.getString(R.string.message_notification_fallback) }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(context.getString(R.string.message_notification_title))
            .setContentText(preview)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text.trim()))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()

        manager.notify(nextId.getAndIncrement(), notification)
    }
}
