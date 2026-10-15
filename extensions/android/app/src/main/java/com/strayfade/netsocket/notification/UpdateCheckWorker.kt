package com.strayfade.netsocket.notification

import android.content.Context
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * Nightly update check. Runs under unmetered/charging/idle constraints
 * (see [AppUpdater.reschedule]) and additionally gates on the 01:00–05:00
 * quiet-hours window so installs never interrupt daytime use.
 */
class UpdateCheckWorker(
    context: Context,
    params: WorkerParameters,
) : Worker(context, params) {

    override fun doWork(): Result {
        val context = applicationContext
        val prefs = Prefs(context)
        if (!prefs.autoUpdateEnabled) {
            Log.i(TAG, "Automatic updates disabled — skipping")
            return Result.success()
        }
        if (!AppUpdater.isQuietHours()) {
            Log.i(TAG, "Outside quiet hours — deferring to the next window")
            return Result.success()
        }
        return try {
            val info = AppUpdater.checkForUpdate(prefs)
            if (info == null || !AppUpdater.isUpdateApplicable(context, info)) {
                Log.i(TAG, "No update available")
                Result.success()
            } else {
                Log.i(
                    TAG,
                    "Installing update ${info.version} (code ${info.versionCode})"
                )
                AppUpdater.downloadAndInstall(context, prefs, info)
                Result.success()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Update check failed, will retry: ${e.message}")
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "UpdateCheck"
    }
}
