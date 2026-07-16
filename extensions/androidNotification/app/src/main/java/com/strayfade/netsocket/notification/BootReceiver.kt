package com.strayfade.netsocket.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        Log.i(TAG, "Boot/package event: $action")
        KeepAliveService.start(context.applicationContext)
    }

    companion object {
        private const val TAG = "NetsocketBoot"
    }
}
