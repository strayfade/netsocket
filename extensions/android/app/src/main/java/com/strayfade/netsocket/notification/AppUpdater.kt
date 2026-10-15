package com.strayfade.netsocket.notification

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.pm.PackageInfoCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * Silent overnight self-updates for the sideloaded APK.
 *
 * A periodic WorkManager job (unmetered Wi-Fi + charging + device idle)
 * checks the host's public update manifest between 01:00 and 05:00 local
 * time. When the host publishes a newer `versionCode`, the APK is
 * downloaded, hash-verified, and committed through PackageInstaller —
 * no foreground UI, no taps. The whole pipeline is gated by
 * [Prefs.autoUpdateEnabled] (General settings → Automatic updates).
 *
 * Note: Android still shows the system install confirmation on most
 * devices unless the app is a device owner; scheduling it overnight on
 * an idle, charging phone keeps it effectively unnoticeable.
 */
object AppUpdater {
    private const val TAG = "AppUpdater"
    const val WORK_NAME = "netsocket-nightly-update"
    const val INSTALL_STATUS_ACTION =
        "com.strayfade.netsocket.notification.UPDATE_INSTALL_STATUS"

    /** Overnight window (local time) in which an install may proceed. */
    const val QUIET_START_HOUR = 1
    const val QUIET_END_HOUR = 5

    data class UpdateInfo(
        val version: String,
        val versionCode: Long,
        val fileName: String,
        val size: Long,
        val sha256: String,
        val downloadUrl: String,
    )

    fun isQuietHours(now: Calendar = Calendar.getInstance()): Boolean {
        val hour = now.get(Calendar.HOUR_OF_DAY)
        return hour >= QUIET_START_HOUR && hour < QUIET_END_HOUR
    }

    fun manifestUrl(prefs: Prefs): String =
        prefs.siteUrl().trimEnd('/') + "/v1/updates/android"

    fun absoluteDownloadUrl(prefs: Prefs, manifestPath: String): String {
        val path = manifestPath.trim()
        if (path.startsWith("http://") || path.startsWith("https://")) return path
        return prefs.siteUrl().trimEnd('/') + "/" + path.trimStart('/')
    }

    fun installedVersionCode(context: Context): Long {
        val pm = context.packageManager
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getPackageInfo(
                context.packageName,
                PackageManager.PackageInfoFlags.of(0)
            )
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(context.packageName, 0)
        }
        return PackageInfoCompat.getLongVersionCode(info)
    }

    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    /**
     * Blocking manifest check. Returns non-null only when the host
     * publishes a strictly newer `versionCode` than the installed APK.
     * Throws on transport errors so the worker can retry.
     */
    fun checkForUpdate(prefs: Prefs): UpdateInfo? {
        val request = Request.Builder().url(manifestUrl(prefs)).get().build()
        http.newCall(request).execute().use { response ->
            if (response.code == 404) return null
            if (!response.isSuccessful) {
                throw IllegalStateException("update check failed: HTTP ${response.code}")
            }
            val body = response.body?.string().orEmpty()
            val json = JSONObject(body)
            val versionCode = json.optLong("versionCode", 0)
            if (versionCode <= 0) return null
            return UpdateInfo(
                version = json.optString("version", ""),
                versionCode = versionCode,
                fileName = json.optString("fileName", "netsocket-android.apk"),
                size = json.optLong("size", 0),
                sha256 = json.optString("sha256", ""),
                downloadUrl = absoluteDownloadUrl(prefs, json.optString("url", "")),
            )
        }
    }

    fun isUpdateApplicable(context: Context, info: UpdateInfo): Boolean {
        return info.versionCode > installedVersionCode(context)
    }

    private fun stagingApk(context: Context): File {
        val dir = File(context.cacheDir, "updates")
        if (!dir.exists()) dir.mkdirs()
        return File(dir, "netsocket-update.apk")
    }

    private fun sha256Hex(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    /**
     * Blocking download + verify + PackageInstaller commit. Intended to
     * run on a worker thread during quiet hours.
     */
    fun downloadAndInstall(context: Context, prefs: Prefs, info: UpdateInfo) {
        val apk = stagingApk(context)
        if (apk.exists()) apk.delete()

        val request = Request.Builder().url(info.downloadUrl).get().build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("update download failed: HTTP ${response.code}")
            }
            val body = response.body
                ?: throw IllegalStateException("update download failed: empty body")
            apk.outputStream().use { output ->
                body.byteStream().use { input ->
                    input.copyTo(output)
                }
            }
        }

        if (info.size > 0 && apk.length() != info.size) {
            apk.delete()
            throw IllegalStateException(
                "update size mismatch (expected ${info.size}, got ${apk.length()})"
            )
        }
        if (info.sha256.isNotBlank() && !sha256Hex(apk).equals(info.sha256, ignoreCase = true)) {
            apk.delete()
            throw IllegalStateException("update checksum mismatch")
        }

        commitInstallSession(context, apk)
    }

    private fun commitInstallSession(context: Context, apk: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL
        )
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("apk", 0, apk.length()).use { output ->
                apk.inputStream().use { input ->
                    input.copyTo(output)
                }
                session.fsync(output)
            }
            val statusIntent = Intent(INSTALL_STATUS_ACTION).apply {
                setPackage(context.packageName)
            }
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val statusReceiver = PendingIntent.getBroadcast(
                context, sessionId, statusIntent, flags
            )
            session.commit(statusReceiver.intentSender)
        }
        Log.i(TAG, "Committed install session for ${apk.name} (${apk.length()} bytes)")
    }

    /**
     * (Re)applies the nightly schedule to match the current toggle.
     * Call from app start, boot, and after General settings are saved.
     */
    fun reschedule(context: Context) {
        val work = WorkManager.getInstance(context.applicationContext)
        if (!Prefs(context.applicationContext).autoUpdateEnabled) {
            work.cancelUniqueWork(WORK_NAME)
            Log.i(TAG, "Automatic updates disabled — nightly job cancelled")
            return
        }
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.UNMETERED)
            .setRequiresCharging(true)
            .setRequiresDeviceIdle(true)
            .setRequiresBatteryNotLow(true)
            .build()
        val request = PeriodicWorkRequestBuilder<UpdateCheckWorker>(12, TimeUnit.HOURS)
            .setConstraints(constraints)
            .addTag(WORK_NAME)
            .build()
        work.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        Log.i(TAG, "Nightly update job scheduled (unmetered + charging + idle)")
    }
}
