package com.strayfade.netsocket.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.util.Log

/**
 * Receives the PackageInstaller commit status for nightly self-updates.
 * Success needs no UI (the new APK simply replaces this one). Failures
 * are logged; when the system needs the user (e.g. "install unknown
 * apps" not yet allowed), the next nightly run retries.
 */
class UpdateInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != AppUpdater.INSTALL_STATUS_ACTION) return
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                Log.w(TAG, "Install needs user action; deferring to next nightly run")
            }
            PackageInstaller.STATUS_SUCCESS -> {
                Log.i(TAG, "Nightly update installed")
            }
            else -> {
                val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                Log.w(TAG, "Install session ended with status=$status: $message")
            }
        }
    }

    companion object {
        private const val TAG = "UpdateInstall"
    }
}
