package com.strayfade.netsocket.notification

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import androidx.core.content.FileProvider
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * Reads and writes the system clipboard as a string.
 * Text is stored as-is. Images are data URLs (`data:image/<type>;base64,...`).
 * Writes made here are marked so the change listener does not echo them upstream.
 */
object ClipboardBridge {
    private const val TAG = "ClipboardBridge"
    const val MAX_ENCODED_CHARS = 8 * 1024 * 1024
    private const val SUPPRESS_WINDOW_MS = 400L
    private val IMAGE_DATA_URL = Regex(
        "^data:image/(png|jpeg|jpg|webp);base64,",
        RegexOption.IGNORE_CASE,
    )

    private val lock = Any()
    private val worker = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var listener: ClipboardManager.OnPrimaryClipChangedListener? = null
    private var suppressNext = false
    private var suppressFingerprint: String? = null
    private var suppressUntilMs = 0L
    private var captureInFlight = false
    private var captureAgain = false

    fun syncWatch(context: Context) {
        val app = context.applicationContext
        if (Prefs(app).sendClipboard) {
            startWatching(app)
        } else {
            stopWatching(app)
        }
    }

    fun stopWatching(context: Context) {
        val app = context.applicationContext
        val clipboard = clipboard(app) ?: return
        synchronized(lock) {
            val current = listener ?: return
            clipboard.removePrimaryClipChangedListener(current)
            listener = null
        }
    }

    fun writeText(context: Context, label: String, text: String) {
        val clip = ClipData.newPlainText(label, text)
        commit(context, clip, text)
    }

    /** Writes text, or an image when [content] is a supported data URL. */
    fun writeContent(context: Context, content: String): Boolean {
        if (content.length > MAX_ENCODED_CHARS) {
            Log.w(TAG, "clipboard content exceeds size limit")
            return false
        }
        val match = IMAGE_DATA_URL.find(content) ?: run {
            writeText(context, "netsocket", content)
            return true
        }
        val subtype = match.groupValues[1].lowercase().let { if (it == "jpg") "jpeg" else it }
        val payload = content.substring(match.range.last + 1)
        val bytes = try {
            Base64.decode(payload, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "clipboard image was not valid base64: ${e.message}")
            return false
        }
        if (bytes.isEmpty()) return false
        return writeImage(context, bytes, subtype, content)
    }

    private fun startWatching(context: Context) {
        val clipboard = clipboard(context) ?: return
        synchronized(lock) {
            if (listener != null) return
            val created = ClipboardManager.OnPrimaryClipChangedListener {
                worker.execute { onClipChanged(context) }
            }
            listener = created
            clipboard.addPrimaryClipChangedListener(created)
        }
    }

    private fun onClipChanged(context: Context) {
        if (!Prefs(context).sendClipboard) return
        val content = readEncoded(context)
        if (consumeSuppression(content)) return
        if (!content.isNullOrEmpty()) {
            publishUserCopy(context, content)
            return
        }
        // Android 10+ returns null from the background. A focused window can still read it,
        // and an enabled accessibility service is what allows that window to open.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            requestBackgroundCapture(context)
        }
    }

    fun readNow(context: Context): String? = readEncoded(context.applicationContext)

    fun publishUserCopy(context: Context, content: String) {
        if (content.isEmpty() || content.length > MAX_ENCODED_CHARS) return
        if (!Prefs(context).sendClipboard) return
        if (consumeSuppression(content)) return
        synchronized(lock) {
            suppressFingerprint = fingerprint(content)
            suppressUntilMs = SystemClock.elapsedRealtime() + SUPPRESS_WINDOW_MS
        }
        HostConnection.sendClipboard(content)
    }

    fun backgroundCaptureFinished(context: Context) {
        val again = synchronized(lock) {
            captureInFlight = false
            val pending = captureAgain
            captureAgain = false
            pending
        }
        if (again) requestBackgroundCapture(context.applicationContext)
    }

    private fun requestBackgroundCapture(context: Context) {
        val app = context.applicationContext
        if (!ClipboardAccessibility.isEnabled(app)) {
            Log.w(TAG, "clipboard changed in the background but the accessibility service is off")
            return
        }
        synchronized(lock) {
            if (captureInFlight) {
                captureAgain = true
                return
            }
            captureInFlight = true
        }
        mainHandler.post {
            val starter: Context = ClipboardAccessibilityService.instance ?: app
            val intent = Intent(app, ClipboardCaptureActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_NO_ANIMATION or
                        Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
                )
            }
            try {
                starter.startActivity(intent)
            } catch (e: Exception) {
                synchronized(lock) { captureInFlight = false }
                Log.w(TAG, "background clipboard capture was blocked: ${e.message}")
                return@post
            }
            mainHandler.postDelayed({
                val stuck = synchronized(lock) { captureInFlight }
                if (stuck) {
                    Log.w(TAG, "clipboard capture did not open")
                    backgroundCaptureFinished(app)
                }
            }, CAPTURE_WATCHDOG_MS)
        }
    }

    private fun commit(context: Context, clip: ClipData, echoContent: String) {
        val clipboard = clipboard(context.applicationContext) ?: return
        synchronized(lock) {
            suppressNext = true
            suppressFingerprint = fingerprint(echoContent)
            suppressUntilMs = SystemClock.elapsedRealtime() + SUPPRESS_WINDOW_MS
        }
        try {
            clipboard.setPrimaryClip(clip)
        } catch (e: Exception) {
            synchronized(lock) { suppressNext = false }
            Log.w(TAG, "setPrimaryClip failed: ${e.message}")
        }
    }

    /**
     * Drops the callback caused by our own write, plus a duplicate callback
     * that some devices emit with the same content a moment later.
     */
    private fun consumeSuppression(content: String?): Boolean {
        val now = SystemClock.elapsedRealtime()
        val fp = content?.let { fingerprint(it) }
        synchronized(lock) {
            if (suppressNext) {
                suppressNext = false
                if (fp != null) {
                    suppressFingerprint = fp
                    suppressUntilMs = now + SUPPRESS_WINDOW_MS
                }
                return true
            }
            if (fp != null && fp == suppressFingerprint && now <= suppressUntilMs) {
                return true
            }
        }
        return false
    }

    private fun readEncoded(context: Context): String? {
        val clipboard = clipboard(context) ?: return null
        val clip = try {
            clipboard.primaryClip
        } catch (_: SecurityException) {
            null
        } ?: return null
        if (clip.itemCount <= 0) return null
        val item = clip.getItemAt(0)
        val description = clip.description
        val primaryMime = if (description.mimeTypeCount > 0) {
            description.getMimeType(0).orEmpty()
        } else {
            ""
        }
        val plain = item.text?.toString()?.takeIf { it.isNotEmpty() }
        if (!plain.isNullOrEmpty()) {
            return limit(plain)
        }
        if (primaryMime.startsWith("image/") || description.hasMimeType("image/*")) {
            encodeClipImage(context, item, primaryMime)?.let { return it }
        }
        if (primaryMime.startsWith("text/")) {
            val text = plain
                ?: item.htmlText?.takeIf { it.isNotEmpty() }
                ?: item.coerceToText(context)?.toString()?.takeIf { it.isNotEmpty() }
            return text?.let { limit(it) }
        }
        return plain?.let { limit(it) }
    }

    private fun encodeClipImage(context: Context, item: ClipData.Item, primaryMime: String): String? {
        val uri = item.uri ?: return null
        val mime = context.contentResolver.getType(uri) ?: primaryMime
        val bytes = try {
            context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        } catch (e: Exception) {
            Log.w(TAG, "failed to read clipboard image: ${e.message}")
            null
        } ?: return null
        if (bytes.isEmpty()) return null
        val subtype = imageSubtype(mime)
        if (subtype != null) {
            return dataUrl(subtype, bytes)
        }
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
        val png = ByteArrayOutputStream()
        val compressed = bitmap.compress(Bitmap.CompressFormat.PNG, 100, png)
        bitmap.recycle()
        if (!compressed) return null
        return dataUrl("png", png.toByteArray())
    }

    private fun writeImage(context: Context, bytes: ByteArray, subtype: String, echoContent: String): Boolean {
        val app = context.applicationContext
        val ext = if (subtype == "jpeg") "jpg" else subtype
        val dir = File(app.cacheDir, "clipboard")
        if (!dir.exists() && !dir.mkdirs()) return false
        dir.listFiles()?.forEach { existing ->
            if (existing.isFile) existing.delete()
        }
        val file = File(dir, "clip.$ext")
        return try {
            file.writeBytes(bytes)
            val uri: Uri = FileProvider.getUriForFile(app, "${app.packageName}.fileprovider", file)
            val clip = ClipData.newUri(app.contentResolver, "netsocket image", uri)
            commit(app, clip, echoContent)
            true
        } catch (e: Exception) {
            Log.w(TAG, "failed to write clipboard image: ${e.message}")
            false
        }
    }

    private fun dataUrl(subtype: String, bytes: ByteArray): String? {
        val encoded = Base64.encodeToString(bytes, Base64.NO_WRAP)
        return limit("data:image/$subtype;base64,$encoded")
    }

    private fun imageSubtype(mime: String): String? {
        val normalized = mime.lowercase()
        return when {
            normalized.contains("png") -> "png"
            normalized.contains("jpeg") || normalized.contains("jpg") -> "jpeg"
            normalized.contains("webp") -> "webp"
            else -> null
        }
    }

    private fun limit(value: String): String? {
        return if (value.length > MAX_ENCODED_CHARS) null else value
    }

    private fun fingerprint(content: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(content.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { byte -> "%02x".format(byte) }
    }

    private fun clipboard(context: Context): ClipboardManager? {
        return context.applicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    }

    private const val CAPTURE_WATCHDOG_MS = 2500L
}
